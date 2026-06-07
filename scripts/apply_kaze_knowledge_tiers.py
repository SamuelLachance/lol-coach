#!/usr/bin/env python3
"""Apply kaze_knowledge_tiers.json → champions.json (tierMeta + tierNote + tierReason)."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TIERS_JSON = Path(__file__).resolve().parent / "kaze_knowledge_tiers.json"
PATHS = [
    ROOT / "data" / "champions.json",
    ROOT / "public" / "data" / "champions.json",
]


def main() -> None:
    if not TIERS_JSON.exists():
        raise SystemExit(f"Run build_kaze_knowledge_tiers.py first — missing {TIERS_JSON.name}")

    data = json.loads(TIERS_JSON.read_text(encoding="utf-8"))
    assignments = data["assignments"]
    tier_notes = data["tierNotes"]
    reasons = data.get("championReasons", {})

    for path in PATHS:
        if not path.exists():
            print(f"skip {path}")
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        for champ in payload.get("champions", []):
            name = champ["name"]
            tier = assignments.get(name, "C")
            champ["tierMeta"] = tier
            champ["tierNote"] = tier_notes.get(tier, tier_notes.get("C", ""))
            champ["tierReason"] = reasons.get(name, "")
        payload["tierListVersion"] = data.get("version", "kaze-md")
        payload["tierListScope"] = data.get("scope", "kaze-md")
        payload["tierListSource"] = data.get("source", [])
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{path.name}: applied kaze knowledge tiers to {len(payload['champions'])} champions")


if __name__ == "__main__":
    main()
