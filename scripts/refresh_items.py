#!/usr/bin/env python3
"""Regénère items.json depuis Data Dragon (légendaires SR ranked uniquement)."""

import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from fetch_ddragon import (  # noqa: E402
    DATA,
    PUBLIC_DATA,
    is_build_catalog_item,
    item_shop_role,
)

CHAMPIONS_JSON = PUBLIC_DATA / "champions.json"


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "lol-coach/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    version = "16.11.1"
    if CHAMPIONS_JSON.exists():
        version = json.loads(CHAMPIONS_JSON.read_text(encoding="utf-8")).get("version", version)
    else:
        versions = fetch_json("https://ddragon.leagueoflegends.com/api/versions.json")
        version = versions[0]

    items_raw = fetch_json(
        f"https://ddragon.leagueoflegends.com/cdn/{version}/data/fr_FR/item.json"
    )["data"]

    items = []
    seen_names: set[str] = set()
    for item_id, item in items_raw.items():
        if not is_build_catalog_item(item_id, item):
            continue
        name = item["name"]
        if name in seen_names:
            continue
        seen_names.add(name)
        total = item.get("gold", {}).get("total", 0)
        tags = item.get("tags", [])
        desc = re.sub(r"<[^>]+>", "", item.get("description", ""))[:220]
        items.append({
            "id": item_id,
            "name": name,
            "tier": 5,
            "gold": total,
            "description": desc,
            "icon": f"https://ddragon.leagueoflegends.com/cdn/{version}/img/item/{item_id}.png",
            "tags": tags,
            "category": "Légendaire",
            "shopRole": item_shop_role(tags),
            "map": "Summoner's Rift",
        })

    items.sort(key=lambda x: (-x["gold"], x["name"]))
    payload = {
        "version": version,
        "scope": "Summoner's Rift ranked — objets de build (légendaires ≥2600 or + support)",
        "itemCount": len(items),
        "items": items,
    }

    for folder in (DATA, PUBLIC_DATA):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "items.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"{len(items)} objets légendaires SR -> {PUBLIC_DATA / 'items.json'}")


if __name__ == "__main__":
    main()
