#!/usr/bin/env python3
"""Build lightweight champions-index.json for fast first paint."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("public/data/champions.json")
DST = Path("public/data/champions-index.json")

STRIP_KEYS = frozenset({"abilities", "raison", "stats", "allCounters", "allPairings"})
MATCHUP_LIMIT = 8


def slim_matchups(entries: list | None, limit: int = MATCHUP_LIMIT) -> list:
    if not entries:
        return []
    return entries[:limit]


def slim_champion(champ: dict) -> dict:
    out = {k: v for k, v in champ.items() if k not in STRIP_KEYS}
    if "bestCounters" in out:
        out["bestCounters"] = slim_matchups(out["bestCounters"])
    if "bestPairings" in out:
        out["bestPairings"] = slim_matchups(out["bestPairings"])
    return out


def main() -> None:
    src_path = ROOT / SRC
    dst_path = ROOT / DST
    data = json.loads(src_path.read_text(encoding="utf-8"))
    index = {
        "version": data.get("version"),
        "source": data.get("source"),
        "championCount": data.get("championCount"),
        "champions": [slim_champion(c) for c in data["champions"]],
    }
    dst_path.write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    size_kb = dst_path.stat().st_size // 1024
    print(f"Wrote {dst_path} ({size_kb} KB, {len(index['champions'])} champions)")


if __name__ == "__main__":
    main()
