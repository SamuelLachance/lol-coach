#!/usr/bin/env python3
"""Apply ls_worlds_2024_tiers.json → champions.json (tierMeta + tierNote + tierReason).

Source vidéo : https://www.youtube.com/watch?v=vxi1PZk7SaI (LS, 2024-09-25)
Champions absents de la liste LS conservent leur tierMeta existant.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TIERS_JSON = Path(__file__).resolve().parent / "ls_worlds_2024_tiers.json"
PATHS = [
    ROOT / "data" / "champions.json",
    ROOT / "public" / "data" / "champions.json",
]

# nameEn (LS/video) → name (site)
NAME_ALIASES: dict[str, str] = {
    "Nunu & Willump": "Nunu et Willump",
    "Zoe": "Zoé",
}


def resolve_site_name(ls_name: str, known: set[str]) -> str | None:
    if ls_name in known:
        return ls_name
    aliased = NAME_ALIASES.get(ls_name)
    if aliased and aliased in known:
        return aliased
    return None


def main() -> None:
    if not TIERS_JSON.exists():
        raise SystemExit(f"Run build_ls_worlds_2024_tiers.py first — missing {TIERS_JSON.name}")

    data = json.loads(TIERS_JSON.read_text(encoding="utf-8"))
    assignments = data["assignments"]
    tier_notes = data["tierNotes"]
    reasons = data.get("championReasons", {})

    for path in PATHS:
        if not path.exists():
            print(f"skip {path}")
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        known = {c["name"] for c in payload.get("champions", [])}
        name_en_map = {c.get("nameEn", c["name"]): c["name"] for c in payload.get("champions", [])}

        site_tiers: dict[str, tuple[str, str]] = {}
        for ls_name, tier in assignments.items():
            resolved = resolve_site_name(ls_name, known) or name_en_map.get(ls_name)
            if not resolved or resolved not in known:
                continue
            site_tiers[resolved] = (tier, ls_name)

        updated = 0
        for champ in payload.get("champions", []):
            entry = site_tiers.get(champ["name"])
            if not entry:
                continue
            tier, ls_name = entry
            champ["tierMeta"] = tier
            champ["tierNote"] = tier_notes.get(tier, tier_notes.get("C", ""))
            champ["tierReason"] = reasons.get(ls_name, f"LS Worlds 2024 ({tier})")
            updated += 1

        payload["tierListVersion"] = data.get("version", "ls-worlds-2024-v1")
        payload["tierListScope"] = data.get("scope", "")
        payload["tierListSource"] = data.get("source", [])
        payload["tierListSourceDate"] = data.get("sourceDate", "2024-09-25")
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{path.name}: LS Worlds 2024 tiers applied to {updated}/{len(payload['champions'])} champions")


if __name__ == "__main__":
    main()
