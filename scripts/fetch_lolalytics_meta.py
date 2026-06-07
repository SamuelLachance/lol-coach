#!/usr/bin/env python3
"""Fetch lane rates + item builds (internal meta refresh — not shown in UI)."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from lolalytics_common import (  # noqa: E402
    CHAMPIONS_JSON,
    META_JSON,
    MIN_LANE_PCT,
    RANK,
    REQUEST_DELAY,
    SLOT_TO_API,
    apply_lane_threshold,
    fetch_html,
    lane_rates_for_slug,
    load_item_maps,
    parse_build_page,
    slug_for,
)

LOG = ROOT / "data" / "meta_refresh.log"


def log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc).isoformat()} {msg}"
    print(line)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def builds_for_champion(
    slug: str,
    main_role: str | None,
    id_to_fr: dict[str, str],
    en_to_fr: dict[str, str],
    valid_ids: set[str],
    boot_ids: set[str],
) -> dict:
    if not main_role:
        return {}
    lane_api = SLOT_TO_API.get(main_role, "top")
    url = f"https://lolalytics.com/lol/{slug}/build/?lane={lane_api}&tier={RANK}"
    raw = fetch_html(url)
    time.sleep(REQUEST_DELAY)
    if not raw:
        return {}
    return parse_build_page(raw.decode("utf-8", errors="replace"), id_to_fr, en_to_fr, valid_ids, boot_ids)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Refresh all champions (ignore cache)")
    parser.add_argument("--limit", type=int, default=0, help="Max champions to process (0 = all)")
    args = parser.parse_args()

    if not CHAMPIONS_JSON.exists():
        raise SystemExit(f"Missing {CHAMPIONS_JSON}")

    data = json.loads(CHAMPIONS_JSON.read_text(encoding="utf-8"))
    champs = data["champions"]
    version = data.get("version", "")

    id_to_fr, en_to_fr, valid_ids, boot_ids = load_item_maps(version)
    if not id_to_fr:
        raise SystemExit("Missing item catalog — run refresh_items.py first")

    existing: dict = {}
    if META_JSON.exists() and not args.force:
        existing = json.loads(META_JSON.read_text(encoding="utf-8")).get("champions", {})

    result: dict[str, dict] = dict(existing)
    errors: list[str] = []
    processed = 0

    for i, c in enumerate(champs, start=1):
        name = c["name"]
        if name in result and result[name].get("laneRates") and result[name].get("coreItems") and not args.force:
            continue

        slug = slug_for(c.get("key", ""), c.get("nameEn", ""))
        log(f"[{i}/{len(champs)}] {name} ({slug})")

        rates, total = lane_rates_for_slug(slug)
        if not rates:
            errors.append(name)
            result[name] = {
                "slug": slug,
                "laneRates": {},
                "mainRole": None,
                "flexRoles": [],
                "optimalSlots": [],
                "error": "no_lane_data",
            }
            processed += 1
            if args.limit and processed >= args.limit:
                break
            continue

        main, flex, optimal = apply_lane_threshold(rates)
        builds = builds_for_champion(slug, main, id_to_fr, en_to_fr, valid_ids, boot_ids)

        entry: dict = {
            "slug": slug,
            "laneRates": rates,
            "gamesTotal": total,
            "mainRole": main,
            "flexRoles": flex,
            "optimalSlots": optimal,
            "rank": RANK,
            "minLanePct": MIN_LANE_PCT,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        }
        entry.update(builds)
        result[name] = entry
        processed += 1

        if i % 5 == 0:
            _write_payload(version, result, errors)

        if args.limit and processed >= args.limit:
            break

    _write_payload(version, result, errors)
    ok_lane = sum(1 for v in result.values() if v.get("laneRates"))
    ok_build = sum(1 for v in result.values() if v.get("coreItems"))
    log(f"Done: lane={ok_lane}/{len(champs)} build={ok_build}/{len(champs)} errors={len(errors)}")


def _write_payload(version: str, result: dict, errors: list[str]) -> None:
    payload = {
        "version": version,
        "rank": RANK,
        "minLanePct": MIN_LANE_PCT,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "champions": result,
        "errors": errors,
    }
    for path in (META_JSON,):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
