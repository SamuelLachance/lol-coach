"""Shared LoL Analytics fetch helpers (internal scripts only — never exposed in UI)."""

from __future__ import annotations

import html as html_lib
import json
import re
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ITEMS_JSON = ROOT / "public" / "data" / "items.json"
CHAMPIONS_JSON = ROOT / "data" / "champions.json"
META_JSON = ROOT / "data" / "lolalytics.json"

LANE_API = {
    "top": "Top",
    "jungle": "Jungle",
    "middle": "Mid",
    "bottom": "Bot",
    "support": "Support",
}
SLOT_TO_API = {v: k for k, v in LANE_API.items()}
SLOT_ORDER = ["Top", "Jungle", "Mid", "Bot", "Support"]
MIN_LANE_PCT = 10.0
RANK = "emerald"
REQUEST_DELAY = 0.18

SLUG_OVERRIDES: dict[str, str] = {
    "MonkeyKing": "wukong",
    "MissFortune": "missfortune",
    "DrMundo": "drmundo",
    "ChoGath": "chogath",
    "KogMaw": "kogmaw",
    "KaiSa": "kaisa",
    "LeeSin": "leesin",
    "MasterYi": "masteryi",
    "JarvanIV": "jarvaniv",
    "XinZhao": "xinzhao",
    "TwistedFate": "twistedfate",
    "TahmKench": "tahmkench",
    "AurelionSol": "aurelionsol",
    "RenataGlasc": "renata",
    "Renata": "renata",
    "Nunu": "nunu",
    "BelVeth": "belveth",
    "KSante": "ksante",
    "RekSai": "reksai",
    "KhaZix": "khazix",
    "Chogath": "chogath",
}

ITEM_IMG_RE = re.compile(
    r'src="https://cdn5\.lolalytics\.com/item64/(\d+)\.webp"[^>]*alt="([^"]*)"(?:[^>]*data-id="(\d*)")?',
    re.I,
)
SECTION_LABEL_RE = re.compile(
    r'<!--t=[^>]+-->(Core Build|Item 4|Item 5|Item 6|Boots|Item 2|Item 3)<!---->',
    re.I,
)
WR_GAMES_RE = re.compile(
    r'<!--t=[^>]+-->([\d.]+)<!---->%</span><br><span class="text-center text-\[12px\] text-gray-400" q:key="60_3">([\d,]+)</span>',
)


def slug_for(key: str, name_en: str) -> str:
    if key in SLUG_OVERRIDES:
        return SLUG_OVERRIDES[key]
    base = re.sub(r"[^a-zA-Z0-9]", "", name_en or key).lower()
    return base or key.lower()


def fetch_html(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (LoL-Coach/1.0)"})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return resp.read()
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        return None


def load_item_maps(version: str | None = None) -> tuple[dict[str, str], dict[str, str], set[str], set[str]]:
    """Return id->fr name, normalized en->fr, valid build ids, boot ids."""
    path = ITEMS_JSON
    data = {"version": "16.11.1", "items": []}
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
    ver = version or data.get("version", "16.11.1")

    fr_raw = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(
                f"https://ddragon.leagueoflegends.com/cdn/{ver}/data/fr_FR/item.json",
                headers={"User-Agent": "LoL-Coach/1.0"},
            ),
            timeout=60,
        )
        .read()
        .decode("utf-8")
    )["data"]
    en_raw = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(
                f"https://ddragon.leagueoflegends.com/cdn/{ver}/data/en_US/item.json",
                headers={"User-Agent": "LoL-Coach/1.0"},
            ),
            timeout=60,
        )
        .read()
        .decode("utf-8")
    )["data"]

    from fetch_ddragon import is_build_catalog_item  # noqa: WPS433

    id_to_fr: dict[str, str] = {}
    boot_ids: set[str] = set()
    for item_id, item in fr_raw.items():
        if "Boots" in (item.get("tags") or []):
            boot_ids.add(item_id)
        if is_build_catalog_item(item_id, item):
            id_to_fr[item_id] = item["name"]

    # Merge catalog entries from items.json (may include manual tweaks)
    for it in data.get("items", []):
        id_to_fr[it["id"]] = it["name"]

    valid_ids = set(id_to_fr)
    en_to_fr: dict[str, str] = {}

    def norm(s: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", html_lib.unescape(s).lower())

    for item_id in valid_ids | boot_ids:
        fr_name = fr_raw.get(item_id, {}).get("name") or id_to_fr.get(item_id)
        en_name = en_raw.get(item_id, {}).get("name")
        if fr_name:
            en_to_fr[norm(fr_name)] = id_to_fr.get(item_id, fr_name)
        if en_name and fr_name:
            en_to_fr[norm(en_name)] = id_to_fr.get(item_id, fr_name)

    return id_to_fr, en_to_fr, valid_ids, boot_ids


def map_item_name(item_id: str, alt_en: str, id_to_fr: dict[str, str], en_to_fr: dict[str, str]) -> str | None:
    if item_id in id_to_fr:
        return id_to_fr[item_id]
    key = re.sub(r"[^a-z0-9]+", "", html_lib.unescape(alt_en).lower())
    return en_to_fr.get(key)


def parse_champion_build_stats(html: bytes) -> dict[str, str]:
    from lxml import html as lhtml

    tree = lhtml.fromstring(html)
    labels = ["winrate", "wr_delta", "game_avg_wr", "pickrate", "tier", "rank", "banrate", "games"]
    out: dict[str, str] = {}
    for i, label in enumerate(labels, start=1):
        xpath = f"/html/body/main/div[5]/div[1]/div[2]/div[2]/div[{(i//5)+1}]/div[{((i-1)%4)+1}]/div[1]"
        nodes = tree.xpath(xpath)
        if not nodes:
            return {}
        out[label] = nodes[0].text_content().strip().split("\n")[0]
    return out


def parse_build_page(
    html_text: str,
    id_to_fr: dict[str, str],
    en_to_fr: dict[str, str],
    valid_ids: set[str],
    boot_ids: set[str] | None = None,
) -> dict:
    """Extract core, situational, and alternative builds from SSR build page."""
    end_markers = ["Click Items Below to Filter", "data-type=\"common_counter\""]
    end = len(html_text)
    for m in end_markers:
        idx = html_text.find(m)
        if idx > 0:
            end = min(end, idx)
    search_area = html_text[:end]

    sections: list[tuple[str, str]] = []
    labels = list(SECTION_LABEL_RE.finditer(search_area))
    if not labels:
        return {}
    for i, m in enumerate(labels):
        start = m.start()
        end_sec = labels[i + 1].start() if i + 1 < len(labels) else len(search_area)
        sections.append((m.group(1), search_area[start:end_sec]))

    def pick_slot_options(section_html: str, *, first_only: bool = True, max_options: int = 5) -> list[dict]:
        options: list[dict] = []
        scan = section_html[:12000]
        blocks = re.split(r'<span class="mx-2"[^>]*>OR</span>', scan)
        for block in blocks:
            imgs = ITEM_IMG_RE.findall(block)
            if not imgs:
                continue
            item_id, alt, _ = imgs[0]
            name = map_item_name(item_id, alt, id_to_fr, en_to_fr)
            if not name:
                continue
            wr_m = WR_GAMES_RE.search(block)
            wr = float(wr_m.group(1)) if wr_m else None
            games = int(wr_m.group(2).replace(",", "")) if wr_m else None
            options.append({"name": name, "id": item_id, "winrate": wr, "games": games})
            if first_only:
                break
            if len(options) >= max_options:
                break
        return options

    boot_ids = boot_ids or set()

    def pick_core_path(section_html: str) -> list[dict]:
        options: list[dict] = []
        for item_id, alt, _ in ITEM_IMG_RE.findall(section_html[:8000]):
            name = map_item_name(item_id, alt, id_to_fr, en_to_fr)
            if not name:
                continue
            options.append({"name": name, "id": item_id, "winrate": None, "games": None})
        return options[:4]

    def pick_core_items(core_slots: list[dict]) -> list[str]:
        non_boot = [o for o in core_slots if o["id"] not in boot_ids and o["name"]]
        if len(non_boot) >= 2:
            return [o["name"] for o in non_boot[:2]]
        legendaries = [o for o in core_slots if o["id"] in valid_ids]
        if legendaries:
            return [o["name"] for o in legendaries[:2]]
        if non_boot:
            return [o["name"] for o in non_boot[:2]]
        return [o["name"] for o in core_slots[:2] if o["name"]]

    core_slots: list[dict] = []
    situational: list[str] = []
    slot_alts: dict[str, list[dict]] = {}

    for label, sec_html in sections:
        if label == "Core Build":
            core_slots = pick_core_path(sec_html)
            continue
        opts = pick_slot_options(sec_html, first_only=False)
        if not opts:
            continue
        if label.startswith("Item "):
            slot_alts[label] = opts
            situational.extend(o["name"] for o in opts)

    core_path = [o["name"] for o in core_slots]
    core_items = pick_core_items(core_slots)
    legendary_in_core = [o for o in core_slots if o["id"] in valid_ids]

    # Full 6-item path: core row + default pick per situational slot
    base = core_path[:]
    for slot_label in ("Item 4", "Item 5", "Item 6"):
        opts = slot_alts.get(slot_label, [])
        if opts:
            base.append(opts[0]["name"])

    # Dedupe situational preserving order
    seen: set[str] = set()
    sit_unique: list[str] = []
    core_set = set(core_items) | set(core_path)
    for n in situational:
        if n in seen or n in core_set:
            continue
        seen.add(n)
        sit_unique.append(n)

    alternatives: list[dict] = []
    if base:
        alternatives.append({"label": "Standard", "items": base[:6], "winrate": None})

    # Variants: swap situational slots (Item 4–6)
    slot_indices = {"Item 4": 3, "Item 5": 4, "Item 6": 5}
    for slot, opts in slot_alts.items():
        idx = slot_indices.get(slot)
        if idx is None or len(opts) < 2 or len(base) <= idx:
            continue
        for o in opts[1:3]:
            variant = base[:]
            variant[idx] = o["name"]
            alternatives.append(
                {
                    "label": f"{slot} — {o['name']}",
                    "items": variant[:6],
                    "winrate": o.get("winrate"),
                }
            )

    # Variants: alternate second/third legendary in Core Build row
    if len(legendary_in_core) >= 2:
        for o in legendary_in_core[1:]:
            variant = base[:]
            leg_idx = 1 if len(core_path) >= 2 else 0
            if len(core_path) >= 3:
                leg_idx = 2
            if len(variant) > leg_idx:
                variant[leg_idx] = o["name"]
            alternatives.append(
                {"label": f"Core — {o['name']}", "items": variant[:6], "winrate": o.get("winrate")}
            )

    # Dedupe alternatives by items tuple
    uniq_alts: list[dict] = []
    seen_keys: set[tuple[str, ...]] = set()
    for alt in alternatives:
        key = tuple(alt["items"])
        if key in seen_keys:
            continue
        seen_keys.add(key)
        uniq_alts.append(alt)

    return {
        "coreItems": core_items[:4],
        "situationalItems": sit_unique[:8],
        "build": core_items[:2],
        "buildAlternatives": uniq_alts[:6],
    }


def apply_lane_threshold(rates: dict[str, dict]) -> tuple[str, list[str], list[str]]:
    eligible = [
        (slot, rates[slot]["rate"])
        for slot in SLOT_ORDER
        if slot in rates and rates[slot]["rate"] >= MIN_LANE_PCT
    ]
    if not eligible:
        best = max(rates.items(), key=lambda x: x[1]["rate"])
        return best[0], [best[0]], [best[0]]
    eligible.sort(key=lambda x: -x[1])
    main = eligible[0][0]
    flex = [s for s, _ in eligible[1:]]
    return main, flex, [main] + flex


def lane_rates_for_slug(slug: str, fetch=fetch_html, delay: float = REQUEST_DELAY) -> tuple[dict[str, dict], int]:
    import time

    games_by_lane: dict[str, int] = {}
    for api_lane in LANE_API:
        url = f"https://lolalytics.com/lol/{slug}/build/?lane={api_lane}&tier={RANK}"
        raw = fetch(url)
        time.sleep(delay)
        if not raw:
            continue
        data = parse_champion_build_stats(raw)
        if not data.get("games"):
            continue
        games = int(re.sub(r"[^\d]", "", data["games"]))
        games_by_lane[api_lane] = games

    total = sum(games_by_lane.values())
    if total <= 0:
        return {}, 0

    rates: dict[str, dict] = {}
    for api_lane, slot in LANE_API.items():
        g = games_by_lane.get(api_lane, 0)
        rates[slot] = {"games": g, "rate": round(100.0 * g / total, 2)}
    return rates, total
