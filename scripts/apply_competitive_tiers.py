#!/usr/bin/env python3
"""Apply gol.gg pro tier list to champions.json (tierMeta, tierNote, tierReason).

Reads scripts/competitive_tiers.json (+ optional data/golgg_pro.json for stats).
Run after fetch_golgg_pro_tiers.py in daily_meta_refresh.py.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
TIERS_JSON = SCRIPTS / "competitive_tiers.json"
STATS_JSON = ROOT / "data" / "golgg_pro.json"
PATHS = [
    ROOT / "data" / "champions.json",
    ROOT / "public" / "data" / "champions.json",
]


def load_tiers() -> tuple[dict, dict[str, str], dict[str, dict]]:
    if not TIERS_JSON.exists():
        raise SystemExit(f"Missing {TIERS_JSON} — run fetch_golgg_pro_tiers.py first")
    data = json.loads(TIERS_JSON.read_text(encoding="utf-8"))
    assignments = data["assignments"]
    notes = data["tierNotes"]
    stats_by_name: dict[str, dict] = {}
    if STATS_JSON.exists():
        ranking = json.loads(STATS_JSON.read_text(encoding="utf-8")).get("ranking") or []
        stats_by_name = {row["name"]: row for row in ranking if row.get("name")}
    return data, assignments, notes, stats_by_name


def tier_reason(name: str, tier: str, stats: dict | None) -> str:
    if not stats:
        return f"Pro tier {tier} (gol.gg)"
    picks = stats.get("picks", 0)
    bans = stats.get("bans", 0)
    wr = stats.get("winrate")
    wr_txt = f", {wr}% WR" if wr is not None else ""
    return f"Pro {tier} — {picks}P/{bans}B gol.gg{wr_txt}"


def apply_to_file(
    path: Path,
    meta: dict,
    assignments: dict[str, str],
    notes: dict[str, str],
    stats_by_name: dict[str, dict],
) -> None:
    if not path.exists():
        print(f"skip missing {path}")
        return
    payload = json.loads(path.read_text(encoding="utf-8"))
    updated = 0
    for champ in payload.get("champions", []):
        name = champ["name"]
        tier = assignments.get(name, "C")
        champ["tierMeta"] = tier
        champ["tierNote"] = notes.get(tier, notes["C"])
        champ["tierReason"] = tier_reason(name, tier, stats_by_name.get(name))
        updated += 1
    payload["tierListVersion"] = meta.get("version", "pro-v1")
    payload["tierListScope"] = meta.get("scope", "competitive")
    payload["tierListSource"] = meta.get("source", "gol.gg")
    payload["tierListSourceUrl"] = meta.get("sourceUrl", "")
    payload["tierListSourceDate"] = (meta.get("updatedAt") or "")[:10]
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{path.name}: pro tiers applied to {updated} champions")


def main() -> None:
    meta, assignments, notes, stats_by_name = load_tiers()
    for path in PATHS:
        apply_to_file(path, meta, assignments, notes, stats_by_name)


if __name__ == "__main__":
    main()
