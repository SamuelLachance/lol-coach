#!/usr/bin/env python3
"""Apply beatdown tier analysis → champions.json (tierMeta, tierNote, tierReason, tierAnalysis)."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
TIERS_JSON = SCRIPTS / "beatdown_tiers.json"
PATHS = [
    ROOT / "data" / "champions.json",
    ROOT / "public" / "data" / "champions.json",
]


def main() -> None:
    if not TIERS_JSON.exists():
        raise SystemExit(f"Missing {TIERS_JSON.name} — run build_beatdown_tiers.py first")

    data = json.loads(TIERS_JSON.read_text(encoding="utf-8"))
    assignments = data["assignments"]
    notes = data["tierNotes"]
    champions_data = data["champions"]

    for path in PATHS:
        if not path.exists():
            print(f"skip {path}")
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        for champ in payload.get("champions", []):
            name = champ["name"]
            analysis = champions_data.get(name)
            if not analysis:
                continue
            tier = assignments.get(name, "C")
            champ["tierMeta"] = tier
            champ["tierNote"] = notes.get(tier, notes["C"])
            vectors = analysis.get("gameBreakerVectors") or []
            vec_labels = data.get("vectorLabels") or {}
            vec_txt = ", ".join(vec_labels.get(v, v) for v in vectors[:2])
            role = analysis.get("beatdownRole", "flex")
            gb = analysis.get("gameBreakerScore", 0)
            champ["tierReason"] = (
                f"{role.capitalize()} · game-breaker {gb}/100"
                + (f" · {vec_txt}" if vec_txt else "")
            )
            champ["tierAnalysis"] = analysis
        payload["tierListVersion"] = data.get("version", "beatdown-v2")
        payload["tierListScope"] = data.get("scope", "")
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{path.name}: beatdown tiers applied ({len(payload.get('champions', []))} champs)")


if __name__ == "__main__":
    main()
