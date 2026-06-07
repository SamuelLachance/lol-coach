#!/usr/bin/env python3
"""Build beatdown_tiers.json — analyse game-breaker par champion."""

from __future__ import annotations

import json
from pathlib import Path

from beatdown_tier_engine import TIER_NOTES, analyze_champions_file

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "beatdown_tiers.json"


def main() -> None:
    data = analyze_champions_file()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    dist = {t: 0 for t in TIER_NOTES}
    for t in data["assignments"].values():
        dist[t] = dist.get(t, 0) + 1
    print(f"Wrote {OUT.name} — {len(data['assignments'])} champions")
    print("Distribution:", ", ".join(f"{k}={v}" for k, v in sorted(dist.items())))


if __name__ == "__main__":
    main()
