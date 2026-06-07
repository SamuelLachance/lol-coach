#!/usr/bin/env python3
"""Apply Kaze database + MTG colors to champions.json, tactics-meta, guide."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHAMPIONS_PATHS = [ROOT / "data" / "champions.json", ROOT / "public" / "data" / "champions.json"]
TACTICS_PATHS = [ROOT / "data" / "tactics-meta.json", ROOT / "public" / "data" / "tactics-meta.json"]
GUIDE_PATHS = [ROOT / "data" / "guide-fr.json", ROOT / "public" / "data" / "guide-fr.json"]
MTG_COLORS = ROOT / "data" / "mtg-colors.json"
KAZE_MD = ROOT / "docs" / "kaze-database-knowledge.md"
KAZE_DRAFT_MD = Path.home() / ".cursor" / "skills" / "League-of-Legends" / "lol-kaze-draft-insights.md"
KAZE_MATCHUPS_MD = Path.home() / ".cursor" / "skills" / "League-of-Legends" / "lol-kaze-matchups.md"
KAZE_META = ROOT / "data" / "kaze-extract-meta.json"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def md_section(md: str, heading: str) -> str:
    marker = f"## {heading}"
    if marker not in md:
        return ""
    chunk = md.split(marker, 1)[1]
    if "\n## " in chunk:
        chunk = chunk.split("\n## ", 1)[0]
    return chunk.strip()


def md_bullets_to_tips(chunk: str, limit: int = 8) -> list[str]:
    tips: list[str] = []
    for line in chunk.splitlines():
        line = line.strip()
        if not line.startswith("- "):
            continue
        tip = re.sub(r"\*\*([^*]+)\*\*", r"\1", line[2:])
        tip = re.sub(r"\[[^\]]+\]\s*", "", tip).strip()
        if 20 < len(tip) < 200:
            tips.append(tip)
        if len(tips) >= limit:
            break
    return tips


def merge_kaze_matchups(champ: dict, vs_data: dict, by_name: dict) -> None:
    """Add kaze-sourced counter if mentioned in transcripts (light boost)."""
    name = champ["name"]
    counters = {x["name"] if isinstance(x, dict) else x for x in champ.get("bestCounters", [])}

    for (a, b), count in vs_data.items():
        if count < 2:
            continue
        target = None
        reason = ""
        if a == name and b not in counters:
            target = b
            reason = f"Matchup cité dans analyses Kaze ({count}×)"
        elif b == name and a not in counters:
            target = a
            reason = f"Contre-pick mentionné Kaze ({count}×)"
        if not target or target not in by_name:
            continue
        entry = {
            "name": target,
            "score": 95.0 + min(count * 5, 25),
            "reason": reason,
            "source": "kaze",
        }
        champ.setdefault("bestCounters", []).append(entry)
        counters.add(target)

    champ["bestCounters"] = sorted(
        champ.get("bestCounters", []),
        key=lambda x: -(x.get("score") or 0) if isinstance(x, dict) else 0,
    )[:8]


def apply_champions(colors: dict, vs_data: dict) -> None:
    for path in CHAMPIONS_PATHS:
        data = load_json(path)
        by_name = {c["name"]: c for c in data["champions"]}
        for c in data["champions"]:
            col = colors["champions"].get(c["name"])
            if col:
                c["colorIdentity"] = {
                    "W": col["W"],
                    "U": col["U"],
                    "B": col["B"],
                    "R": col["R"],
                    "G": col["G"],
                    "dominant": col["dominant"],
                    "identity": col["identity"],
                    "vector": col["vector"],
                }
            if vs_data:
                merge_kaze_matchups(c, vs_data, by_name)
        data["kazeDatabase"] = True
        data["mtgColorsVersion"] = colors.get("version", "1")
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Updated champions: {path.name}")


def apply_tactics(colors: dict, draft_md: str, db_md: str) -> None:
    draft_tips = [
        "Ban la win condition adverse, pas le comfort pick.",
        "Flex top/jungle/mid pour cacher le plan en BO.",
        "Double enchanter si hypercarry immobile sans peel.",
        "Stack 2+ couleurs dominantes = plan cohérent (+score draft).",
        "Éviter W+B ou poke+engage — conflits d'identité MTG.",
    ]
    draft_tips.extend(md_bullets_to_tips(md_section(draft_md, "Extraits transcript"), 4))

    color_system = {
        "label": "Identité couleur (MTG)",
        "description": "Chaque champion a un profil W/U/B/R/G (somme 24). La draft favorise les couleurs alliées et pénalise les conflits.",
        "colors": colors.get("colors", {}),
        "pairs": colors.get("pairs", {}),
        "tips": [
            "Blanc (W) : peel, vision, objectifs d'équipe.",
            "Bleu (U) : wave, contrôle, scaling calculé.",
            "Noir (B) : snowball, assassin, win condition solo.",
            "Rouge (R) : early bully, engage, tempo agressif.",
            "Vert (G) : scale late, frontline, synergy 5v5.",
        ],
    }

    for path in TACTICS_PATHS:
        meta = load_json(path)
        meta["mtgColors"] = color_system
        meta.pop("coachNotes", None)
        meta.pop("kazeSource", None)
        path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Updated tactics-meta: {path.name}")


def apply_guide(draft_md: str) -> None:
    section_html = (
        "<p>Identité couleur inspirée de Magic : <strong>W</strong> altruisme, "
        "<strong>U</strong> contrôle, <strong>B</strong> snowball, "
        "<strong>R</strong> agression, <strong>G</strong> scale.</p>"
        "<ul>"
        "<li>Somme 24 points par champion — voir fiche champion.</li>"
        "<li>Draft : couleurs alliées (W+G, W+U) = bonus ; W+B = conflit.</li>"
        "<li>Source : transcripts Kaze LoL Database + oracle MTG.</li>"
        "</ul>"
    )
    if draft_md:
        bullets = md_bullets_to_tips(md_section(draft_md, "Règles récurrentes"), 6)
        if bullets:
            section_html += "<ul>" + "".join(f"<li>{b}</li>" for b in bullets) + "</ul>"

    new_sec = {
        "id": "kaze-colors-draft",
        "title": "Couleurs MTG & draft Kaze",
        "html": section_html,
    }

    for path in GUIDE_PATHS:
        if not path.exists():
            continue
        guide = load_json(path)
        base = [s for s in guide.get("sections", []) if s.get("id") not in ("kaze-colors-draft",)]
        guide["sections"] = base + [new_sec]
        path.write_text(json.dumps(guide, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Updated guide: {path.name}")


def parse_vs_from_md(path: Path) -> dict[tuple[str, str], int]:
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    out: dict[tuple[str, str], int] = {}
    for m in re.finditer(r"\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(\d+)\s*\|", text):
        a, b, n = m.group(1).strip(), m.group(2).strip(), int(m.group(3))
        if a == "Champion" or a.startswith("-"):
            continue
        out[(a, b)] = n
    return out


def main() -> None:
    if not MTG_COLORS.exists():
        raise SystemExit("Run build_mtg_colors.py first")
    colors = load_json(MTG_COLORS)
    db_md = KAZE_MD.read_text(encoding="utf-8") if KAZE_MD.exists() else ""
    draft_md = KAZE_DRAFT_MD.read_text(encoding="utf-8") if KAZE_DRAFT_MD.exists() else ""
    vs_data = parse_vs_from_md(KAZE_MATCHUPS_MD)

    apply_champions(colors, vs_data)
    apply_tactics(colors, draft_md, db_md)
    apply_guide(draft_md)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_champions_index.py")], check=True)
    print("Done.")


if __name__ == "__main__":
    main()
