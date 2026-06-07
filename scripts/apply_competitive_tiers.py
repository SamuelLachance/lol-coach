#!/usr/bin/env python3
"""Apply competitive tier list to champions.json (default tierMeta + tierNote)."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
TIERS_JSON = SCRIPTS / "competitive_tiers.json"
PATHS = [
    ROOT / "data" / "champions.json",
    ROOT / "public" / "data" / "champions.json",
]


def load_tiers() -> tuple[dict[str, str], dict[str, str]]:
    if not TIERS_JSON.exists():
        raise SystemExit(f"Missing {TIERS_JSON} — run build_competitive_tiers.py first")
    data = json.loads(TIERS_JSON.read_text(encoding="utf-8"))
    assignments = data["assignments"]
    notes = data["tierNotes"]
    return assignments, notes


def apply_to_file(path: Path, assignments: dict[str, str], notes: dict[str, str]) -> None:
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
        updated += 1
    payload["tierListVersion"] = json.loads(TIERS_JSON.read_text(encoding="utf-8")).get("version", "pro-v1")
    payload["tierListScope"] = "competitive"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{path.name}: tiers applied to {updated} champions")


def main() -> None:
    assignments, notes = load_tiers()
    for path in PATHS:
        apply_to_file(path, assignments, notes)


if __name__ == "__main__":
    main()
