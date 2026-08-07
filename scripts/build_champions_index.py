#!/usr/bin/env python3
"""Build lightweight champions-index.json for fast first paint."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("public/data/champions.json")
DST = Path("public/data/champions-index.json")

KEEP_KEYS = (
    "id",
    "key",
    "name",
    "nameEn",
    "type",
    "tags",
    "tacticTags",
    "icon",
    "splash",
    "tierMeta",
    "tierNote",
    "tierReason",
    "positions",
    "optimalSlots",
    "laneRates",
    "mainRole",
    "flexRoles",
    "championFamily",
    "colorIdentity",
    "draftProfile",
    "gameplayStyle",
)
MATCHUP_PROFILE_STRIP = frozenset({"allyTips", "enemyTips", "gameplayStyle"})
MATCHUP_LIMIT = 5


def slim_matchups(entries: list | None, limit: int = MATCHUP_LIMIT) -> list:
    if not entries:
        return []
    out = []
    for entry in entries[:limit]:
        if isinstance(entry, dict):
            slim = {"name": entry.get("name"), "score": entry.get("score")}
            if entry.get("source"):
                slim["source"] = entry["source"]
            out.append(slim)
        else:
            out.append(entry)
    return out


def slim_champion(champ: dict) -> dict:
    out = {k: champ[k] for k in KEEP_KEYS if k in champ}
    mp = champ.get("matchupProfile")
    if isinstance(mp, dict):
        out["matchupProfile"] = {k: v for k, v in mp.items() if k not in MATCHUP_PROFILE_STRIP}
    out["bestCounters"] = slim_matchups(champ.get("bestCounters"))
    out["bestPairings"] = slim_matchups(champ.get("bestPairings"))
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
    if size_kb >= 500:
        raise SystemExit(f"champions-index.json trop lourd : {size_kb} KB (budget 500 KB)")


if __name__ == "__main__":
    main()
