#!/usr/bin/env python3
"""Merge lolalytics.json lane rates + builds into champions.json (no external source labels)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from apply_builds_from_profile import apply_builds  # noqa: E402
from lolalytics_common import CHAMPIONS_JSON, META_JSON  # noqa: E402

PUBLIC_CHAMPIONS = ROOT / "public" / "data" / "champions.json"
DATA_CHAMPIONS = ROOT / "data" / "champions.json"
ITEMS_JSON = ROOT / "public" / "data" / "items.json"


def load_meta() -> dict[str, dict]:
    if not META_JSON.exists():
        return {}
    return json.loads(META_JSON.read_text(encoding="utf-8")).get("champions", {})


def valid_item_names() -> set[str]:
    if not ITEMS_JSON.exists():
        return set()
    return {it["name"] for it in json.loads(ITEMS_JSON.read_text(encoding="utf-8")).get("items", [])}


def filter_items(names: list[str] | None, valid: set[str]) -> list[str]:
    if not names:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for n in names:
        if n in valid and n not in seen:
            seen.add(n)
            out.append(n)
    return out


def apply_lane_positions(c: dict, entry: dict | None) -> None:
    if not entry or not entry.get("laneRates"):
        c["laneRates"] = {}
        c["mainRole"] = None
        c["flexRoles"] = []
        c["optimalSlots"] = []
        c["positions"] = "Lane data unavailable"
        c.pop("positionsSource", None)
        return

    rates = entry["laneRates"]
    main = entry.get("mainRole")
    flex = entry.get("flexRoles") or []
    optimal = entry.get("optimalSlots") or ([main] if main else [])

    c["laneRates"] = rates
    c["mainRole"] = main
    c["flexRoles"] = flex
    c["optimalSlots"] = optimal
    c.pop("positionsSource", None)

    parts = []
    if main:
        pct = rates.get(main, {}).get("rate", 0)
        parts.append(f"Main {main} ({pct}%)")
    if flex:
        flex_txt = ", ".join(f"{s} ({rates.get(s, {}).get('rate', 0)}%)" for s in flex)
        parts.append(f"Flex {flex_txt}")
    c["positions"] = " · ".join(parts) if parts else "—"


def apply_build_data(c: dict, entry: dict | None, valid: set[str]) -> bool:
    if not entry:
        return False
    core = filter_items(entry.get("coreItems"), valid)
    sit = filter_items(entry.get("situationalItems"), valid)
    alts = entry.get("buildAlternatives") or []
    cleaned_alts: list[dict] = []
    for alt in alts:
        items = filter_items(alt.get("items"), valid)
        if len(items) < 2:
            continue
        cleaned_alts.append(
            {
                "label": alt.get("label") or "Alternative",
                "items": items,
                **({"winrate": alt["winrate"]} if alt.get("winrate") is not None else {}),
            }
        )
    if not core and not sit:
        return False
    if core:
        c["coreItems"] = core
        c["build"] = core[:2]
    if sit:
        c["situationalItems"] = sit
    if cleaned_alts:
        c["buildAlternatives"] = cleaned_alts[:6]
    elif "buildAlternatives" in c:
        del c["buildAlternatives"]
    return bool(core)


def main() -> None:
    meta = load_meta()
    valid = valid_item_names()

    for path in (DATA_CHAMPIONS, PUBLIC_CHAMPIONS):
        if not path.exists():
            print(f"Skip missing {path}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        champs = data.get("champions", [])
        lane_ok = build_ok = fallback = 0

        for c in champs:
            entry = meta.get(c["name"])
            apply_lane_positions(c, entry)
            if entry and entry.get("laneRates"):
                lane_ok += 1
            if not apply_build_data(c, entry, valid):
                fallback += 1

        if fallback:
            missing = [c for c in champs if not meta.get(c["name"], {}).get("coreItems")]
            apply_builds(missing, valid)

        build_ok = sum(1 for c in champs if c.get("coreItems"))
        data["metaRefresh"] = json.loads(META_JSON.read_text(encoding="utf-8")).get("updatedAt") if META_JSON.exists() else None
        data["buildVersion"] = "meta-v1"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{path.name}: lane={lane_ok} builds={build_ok} profile_fallback={fallback}")

    if DATA_CHAMPIONS.exists() and PUBLIC_CHAMPIONS.exists() and DATA_CHAMPIONS != PUBLIC_CHAMPIONS:
        src = json.loads(DATA_CHAMPIONS.read_text(encoding="utf-8"))
        PUBLIC_CHAMPIONS.write_text(json.dumps(src, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
