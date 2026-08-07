#!/usr/bin/env python3
"""Répare en place adShare/apShare des draftProfile (fallback buildProfile, jamais 0/0)."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PATHS = [
    ROOT / "public" / "data" / "champions.json",
    ROOT / "public" / "data" / "champions-index.json",
]


def fallback_shares(champ: dict) -> tuple[float, float]:
    tags = set(champ.get("tags") or [])
    tactic_tags = set(champ.get("tacticTags") or [])
    if "Marksman" in tags:
        return 0.85, 0.15
    if "Mage" in tags:
        return 0.15, 0.85
    if "Assassin" in tags:
        return (0.15, 0.85) if "mage_burst" in tactic_tags else (0.85, 0.15)
    if "Fighter" in tags:
        return 0.85, 0.15
    return 0.5, 0.5


def fix_profile(champ: dict) -> bool:
    dp = champ.get("draftProfile")
    if not isinstance(dp, dict):
        return False
    ad = float(dp.get("adShare") or 0)
    ap = float(dp.get("apShare") or 0)
    if ad + ap > 0:
        return False
    ad, ap = fallback_shares(champ)
    dp["adShare"] = ad
    dp["apShare"] = ap
    if ad >= 0.65:
        dp["damage"] = "AD"
    elif ap >= 0.65:
        dp["damage"] = "AP"
    else:
        dp["damage"] = "Mixed"
    return True


def main() -> None:
    for path in PATHS:
        if not path.exists():
            print(f"skip missing {path}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        fixed = sum(1 for c in data.get("champions", []) if fix_profile(c))
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{path.name}: {fixed} draftProfile réparés")


if __name__ == "__main__":
    main()
