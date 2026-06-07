#!/usr/bin/env python3
"""Fetch pro champion presence from gol.gg (Games of Legends) and build competitive tiers."""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
CHAMPIONS_JSON = ROOT / "public" / "data" / "champions.json"
OUT_STATS = ROOT / "data" / "golgg_pro.json"
OUT_TIERS = SCRIPTS / "competitive_tiers.json"

GOL_LIST = "https://gol.gg/champion/list/season-{season}/split-ALL/tournament-ALL/"
# 4 dernières années calendaires complètes en esport LoL (2022–2025)
PRO_SEASONS = ("S12", "S13", "S14", "S15")

TIER_NOTES = {
    "S": "Pilier pro (gol.gg) — pick/ban dominant sur les 4 dernières saisons.",
    "A": "Très présent en pro — pick/ban régulier selon meta et draft.",
    "B": "Viable en pro — pick situationnel ou meta dépendant.",
    "C": "Peu vu en pro — niche, counter-pick ou patch spécifique.",
    "D": "Quasi absent du pro — rarement optimal en équipe structurée.",
}

# gol.gg alt / EN → coach FR (champions.json)
NAME_ALIASES: dict[str, str] = {
    "Monkey King": "Wukong",
    "Nunu & Willump": "Nunu et Willump",
    "Nunu": "Nunu et Willump",
    "Master Yi": "Maître Yi",
    "Seraphine": "Séraphine",
    "Zoe": "Zoé",
    "K'Sante": "K'Santé",
    "KSante": "K'Santé",
    "Kaisa": "Kai'Sa",
    "Belveth": "Bel'Veth",
    "RekSai": "Rek'Sai",
    "KogMaw": "Kog'Maw",
    "KhaZix": "Kha'Zix",
    "VelKoz": "Vel'Koz",
    "Chogath": "Cho'Gath",
    "Renata Glasc": "Renata Glasc",
    "Bel'Veth": "Bel'Veth",
    "Kai'Sa": "Kai'Sa",
    "Kog'Maw": "Kog'Maw",
    "Cho'Gath": "Cho'Gath",
    "Dr. Mundo": "Dr. Mundo",
    "Lee Sin": "Lee Sin",
    "Jarvan IV": "Jarvan IV",
    "Miss Fortune": "Miss Fortune",
    "Twisted Fate": "Twisted Fate",
    "Xin Zhao": "Xin Zhao",
    "Aurelion Sol": "Aurelion Sol",
    "Rek'Sai": "Rek'Sai",
    "Kha'Zix": "Kha'Zix",
    "Vel'Koz": "Vel'Koz",
}


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (LoL-Coach/1.0)"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read().decode("utf-8", "replace")


def norm_key(name: str) -> str:
    s = unicodedata.normalize("NFKD", unescape(name))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def load_name_maps() -> tuple[dict[str, str], list[str]]:
    data = json.loads(CHAMPIONS_JSON.read_text(encoding="utf-8"))
    names = [c["name"] for c in data["champions"]]
    en_to_fr: dict[str, str] = {}
    for c in data["champions"]:
        fr = c["name"]
        en = c.get("nameEn") or fr
        en_to_fr[norm_key(en)] = fr
        en_to_fr[norm_key(fr)] = fr
    for en, fr in NAME_ALIASES.items():
        en_to_fr[norm_key(en)] = fr
        en_to_fr[norm_key(fr)] = fr
    return en_to_fr, names


def resolve_fr_name(gol_name: str, en_to_fr: dict[str, str]) -> str | None:
    return en_to_fr.get(norm_key(gol_name))


def parse_num(raw: str) -> float:
    s = unescape(re.sub(r"<[^>]+>", "", raw)).strip().replace(",", "")
    if not s or s == "-":
        return 0.0
    if s.endswith("%"):
        try:
            return float(s[:-1])
        except ValueError:
            return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_champion_list(html: str) -> list[dict]:
    rows: list[dict] = []
    row_re = re.compile(r"<tr><td[^>]*>(.*?)</tr>", re.S | re.I)
    for row_match in row_re.finditer(html):
        chunk = row_match.group(0)
        name_m = re.search(
            r"(?:alt=['\"]([^'\"]+)['\"]|title=['\"]([^'\"]+)\s+stats['\"])",
            chunk,
            re.I,
        )
        if not name_m or "champion-stats" not in chunk:
            continue
        name_en = (name_m.group(1) or name_m.group(2) or "").strip()
        if not name_en or name_en.lower() == "champion":
            continue
        tds = re.findall(r"<td[^>]*>(.*?)</td>", chunk, re.S | re.I)
        if len(tds) < 5:
            continue
        cells = [re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", td))).strip() for td in tds[1:]]
        rows.append(
            {
                "nameEn": name_en,
                "picks": int(parse_num(cells[0])) if len(cells) > 0 else 0,
                "bans": int(parse_num(cells[1])) if len(cells) > 1 else 0,
                "prioPct": parse_num(cells[2]) if len(cells) > 2 else 0.0,
                "wins": int(parse_num(cells[3])) if len(cells) > 3 else 0,
                "losses": int(parse_num(cells[4])) if len(cells) > 4 else 0,
            }
        )
    return rows


def aggregate_seasons(seasons: tuple[str, ...]) -> tuple[dict[str, dict], list[str]]:
    en_to_fr, coach_names = load_name_maps()
    agg: dict[str, dict] = {}
    errors: list[str] = []

    for season in seasons:
        url = GOL_LIST.format(season=season)
        try:
            html = fetch_html(url)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            errors.append(f"{season}: fetch failed ({exc})")
            continue
        parsed = parse_champion_list(html)
        if not parsed:
            errors.append(f"{season}: no rows parsed")
            continue
        for row in parsed:
            fr = resolve_fr_name(row["nameEn"], en_to_fr)
            if not fr:
                errors.append(f"unmapped: {row['nameEn']} ({season})")
                continue
            bucket = agg.setdefault(
                fr,
                {
                    "name": fr,
                    "nameEn": row["nameEn"],
                    "picks": 0,
                    "bans": 0,
                    "wins": 0,
                    "losses": 0,
                    "prioWeighted": 0.0,
                    "seasonsSeen": 0,
                },
            )
            picks = row["picks"]
            bans = row["bans"]
            bucket["picks"] += picks
            bucket["bans"] += bans
            bucket["wins"] += row["wins"]
            bucket["losses"] += row["losses"]
            bucket["prioWeighted"] += row["prioPct"] * max(picks + bans, 1)
            if picks + bans > 0:
                bucket["seasonsSeen"] += 1

    for fr in coach_names:
        if fr not in agg:
            agg[fr] = {
                "name": fr,
                "nameEn": "",
                "picks": 0,
                "bans": 0,
                "wins": 0,
                "losses": 0,
                "prioWeighted": 0.0,
                "seasonsSeen": 0,
            }

    for stats in agg.values():
        presence = stats["picks"] + stats["bans"]
        stats["presence"] = presence
        stats["prioAvg"] = round(stats["prioWeighted"] / max(presence, 1), 2)
        games = stats["wins"] + stats["losses"]
        stats["winrate"] = round(100.0 * stats["wins"] / games, 1) if games else None
        # Score pro : présence draft (pick+ban) + léger bonus prio gol.gg
        stats["proScore"] = round(presence + stats["prioAvg"] * 8, 1)

    return agg, errors


def assign_tiers(agg: dict[str, dict], coach_names: list[str]) -> dict[str, str]:
    ranked = sorted(coach_names, key=lambda n: (-agg[n]["proScore"], n))
    n = len(ranked)
    # Seuils basés sur la distribution pro réelle (gol.gg)
    cut_s = max(1, round(n * 0.12))
    cut_a = max(cut_s + 1, round(n * 0.28))
    cut_b = max(cut_a + 1, round(n * 0.52))
    cut_c = max(cut_b + 1, round(n * 0.82))

    assignments: dict[str, str] = {}
    for i, name in enumerate(ranked):
        score = agg[name]["proScore"]
        if score <= 0:
            tier = "D"
        elif i < cut_s:
            tier = "S"
        elif i < cut_a:
            tier = "A"
        elif i < cut_b:
            tier = "B"
        elif i < cut_c:
            tier = "C"
        else:
            tier = "D"
        assignments[name] = tier
    return assignments


def build_payload(agg: dict[str, dict], assignments: dict[str, str], coach_names: list[str], errors: list[str]) -> dict:
    by_tier = {t: [] for t in TIER_NOTES}
    for name in coach_names:
        by_tier[assignments[name]].append(name)

    ranking = sorted(
        (agg[n] for n in coach_names),
        key=lambda s: (-s["proScore"], s["name"]),
    )

    return {
        "version": "golgg-pro-v1",
        "source": "gol.gg",
        "scope": "Tier list pro — présence pick/ban agrégée S12–S15 (2022–2025), tous tournois gol.gg.",
        "seasons": list(PRO_SEASONS),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "tierNotes": TIER_NOTES,
        "assignments": assignments,
        "tiers": by_tier,
        "ranking": ranking,
        "errors": errors[:50],
    }


def main() -> None:
    if not CHAMPIONS_JSON.exists():
        raise SystemExit(f"Missing {CHAMPIONS_JSON}")

    _, coach_names = load_name_maps()
    agg, errors = aggregate_seasons(PRO_SEASONS)
    assignments = assign_tiers(agg, coach_names)
    payload = build_payload(agg, assignments, coach_names, errors)

    OUT_STATS.parent.mkdir(parents=True, exist_ok=True)
    OUT_STATS.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_TIERS.write_text(
        json.dumps(
            {
                "version": payload["version"],
                "scope": payload["scope"],
                "tierNotes": payload["tierNotes"],
                "assignments": payload["assignments"],
                "tiers": payload["tiers"],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    for t in "SABCD":
        print(f"{t}: {len(payload['tiers'][t])}")
    top = payload["ranking"][:12]
    print("Top pro:", [(x["name"], x["proScore"], assignments[x["name"]]) for x in top])
    if errors:
        print(f"Warnings: {len(errors)} (see {OUT_STATS})")
    print(f"Wrote {OUT_TIERS}")


if __name__ == "__main__":
    main()
