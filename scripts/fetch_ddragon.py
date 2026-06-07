#!/usr/bin/env python3
"""Fetch League of Legends data from Riot Data Dragon and build coach JSON files."""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PUBLIC_DATA = ROOT / "public" / "data"

DD_BASE = "https://ddragon.leagueoflegends.com"

# Summoner's Rift (5v5 ranked) — objets finis pour builds / coach
SUMMONERS_RIFT_MAP = "11"
LEGENDARY_MIN_GOLD = 2600
EXCLUDED_ITEM_TAGS = frozenset({"Consumable", "Trinket", "Boots", "Lane", "Jungle"})
BUILD_CATALOG_EXCLUDED = frozenset({"Consumable", "Trinket", "Boots", "Jungle"})


def _base_item_ok(item_id: str, item: dict) -> bool:
    if not item_id or item_id == "0":
        return False
    try:
        if int(item_id) >= 100_000:
            return False
    except ValueError:
        return False
    if item.get("requiredAlly") or item.get("requiredChampion"):
        return False
    if not item.get("maps", {}).get(SUMMONERS_RIFT_MAP, False):
        return False
    if item.get("hideFromAll"):
        return False
    gold = item.get("gold", {})
    if not gold.get("purchasable", True):
        return False
    name = item.get("name", "")
    if not name or name.startswith("("):
        return False
    return True


def is_summoners_rift_legendary(item_id: str, item: dict) -> bool:
    """Objet légendaire achetable en ranked 5v5 sur la Faille de l'invocateur."""
    if not _base_item_ok(item_id, item):
        return False
    if item.get("gold", {}).get("total", 0) < LEGENDARY_MIN_GOLD:
        return False
    tags = set(item.get("tags") or [])
    if tags & EXCLUDED_ITEM_TAGS:
        return False
    if item.get("into"):
        return False
    return True


def is_build_catalog_item(item_id: str, item: dict) -> bool:
    """Objets finis utilisés dans les builds LoLalytics (légendaires + support)."""
    if not _base_item_ok(item_id, item):
        return False
    if item.get("into"):
        return False
    tags = set(item.get("tags") or [])
    if tags & BUILD_CATALOG_EXCLUDED:
        return False
    gold_total = item.get("gold", {}).get("total", 0)
    if gold_total >= LEGENDARY_MIN_GOLD:
        return True
    if "Aura" in tags and gold_total >= 2000:
        return True
    if "GoldPer" in tags and gold_total >= 400:
        return True
    return False


def item_shop_role(tags: list[str]) -> str:
    tags_set = set(tags or [])
    if "SpellDamage" in tags_set or "Mana" in tags_set:
        return "Magique"
    if "CriticalStrike" in tags_set and "Damage" in tags_set:
        return "Crit / AD"
    if "Damage" in tags_set or "ArmorPenetration" in tags_set or "LifeSteal" in tags_set:
        return "AD"
    if "Health" in tags_set and ("Armor" in tags_set or "SpellBlock" in tags_set):
        return "Tank"
    if "AbilityHaste" in tags_set and "SpellDamage" not in tags_set:
        return "Utilitaire"
    return "Légendaire"

TAG_FR = {
    "Fighter": "Combattant",
    "Tank": "Tank",
    "Mage": "Mage",
    "Assassin": "Assassin",
    "Marksman": "Tireur",
    "Support": "Support",
}

TAG_TO_SLOTS: dict[str, list[str]] = {
    "Marksman": ["Bot"],
    "Support": ["Support"],
    "Mage": ["Mid", "Support"],
    "Assassin": ["Mid", "Jungle"],
    "Tank": ["Top", "Support", "Jungle"],
    "Fighter": ["Top", "Jungle"],
}

# Flex picks not obvious from tags alone
SLOT_OVERRIDES: dict[str, list[str]] = {
    "Gragas": ["Top", "Jungle", "Mid", "Support"],
    "Karma": ["Mid", "Support"],
    "Lux": ["Mid", "Support"],
    "Morgana": ["Mid", "Support"],
    "Swain": ["Mid", "Support", "Bot"],
    "Senna": ["Support", "Bot"],
    "Yasuo": ["Mid", "Top"],
    "Yone": ["Mid", "Top"],
    "Viego": ["Jungle", "Mid"],
    "Pantheon": ["Top", "Mid", "Support", "Jungle"],
    "Pyke": ["Support"],
    "Thresh": ["Support"],
    "Blitzcrank": ["Support"],
    "LeeSin": ["Jungle"],
    "Nidalee": ["Jungle"],
    "Taliyah": ["Mid", "Jungle"],
    "Zed": ["Mid"],
    "Akali": ["Mid", "Top"],
    "Sylas": ["Mid", "Jungle"],
    "Vladimir": ["Mid", "Top"],
    "Ryze": ["Mid", "Top"],
    "TwistedFate": ["Mid"],
    "Corki": ["Mid", "Bot"],
    "Ezreal": ["Bot", "Mid"],
    "KaiSa": ["Bot"],
    "Lucian": ["Bot", "Mid"],
    "Quinn": ["Top", "Bot"],
    "Teemo": ["Top", "Bot"],
    "Heimerdinger": ["Top", "Mid", "Bot"],
    "Viktor": ["Mid"],
    "Annie": ["Mid", "Support"],
    "Brand": ["Mid", "Support"],
    "VelKoz": ["Mid", "Support"],
    "Xerath": ["Mid", "Support"],
    "Ziggs": ["Mid", "Bot"],
    "Seraphine": ["Mid", "Support"],
    "Sona": ["Support"],
    "Taric": ["Support"],
    "Rakan": ["Support"],
    "Nautilus": ["Support"],
    "Leona": ["Support"],
    "Braum": ["Support"],
    "Lulu": ["Support", "Mid"],
    "Janna": ["Support"],
    "Soraka": ["Support"],
    "Yuumi": ["Support"],
    "Renata": ["Support"],
    "Milio": ["Support"],
    "Maokai": ["Top", "Support", "Jungle"],
    "Ornn": ["Top"],
    "Sion": ["Top"],
    "Mundo": ["Top", "Jungle"],
    "Gwen": ["Top", "Jungle"],
    "Kayn": ["Jungle"],
    "Graves": ["Jungle"],
    "Kindred": ["Jungle"],
    "Lillia": ["Jungle"],
    "Hecarim": ["Jungle"],
    "Diana": ["Jungle", "Mid"],
    "Ekko": ["Jungle", "Mid"],
    "Elise": ["Jungle"],
    "Evelynn": ["Jungle"],
    "Fiddlesticks": ["Jungle", "Support"],
    "Ivern": ["Jungle"],
    "JarvanIV": ["Jungle"],
    "KhaZix": ["Jungle"],
    "Nocturne": ["Jungle"],
    "Rammus": ["Jungle"],
    "RekSai": ["Jungle"],
    "Sejuani": ["Jungle"],
    "Shaco": ["Jungle"],
    "Shyvana": ["Jungle"],
    "Skarner": ["Jungle"],
    "Trundle": ["Jungle", "Top"],
    "Udyr": ["Jungle", "Top"],
    "Vi": ["Jungle"],
    "Warwick": ["Jungle", "Top"],
    "XinZhao": ["Jungle"],
    "Zac": ["Jungle"],
    "BelVeth": ["Jungle"],
    "Briar": ["Jungle"],
    "Naafiri": ["Mid", "Jungle"],
    "Ambessa": ["Top"],
}

TACTIC_TAGS: dict[str, list[str]] = {}

# Heuristic tags from champion id + tags + spell text
def infer_tactic_tags(champ_id: str, tags: list[str], spell_text: str, stats: dict) -> list[str]:
    t = spell_text.lower()
    out: set[str] = set()

    if "Marksman" in tags:
        out.update(["scaling", "dps", "backline"])
    if "Assassin" in tags:
        out.update(["assassin", "dive", "pick"])
    if "Mage" in tags:
        out.update(["mage", "poke"])
        if re.search(r"zone|cercle|tous les ennemis|cone", t):
            out.add("mage_burst")
    if "Tank" in tags:
        out.update(["frontline", "engage", "peel"])
    if "Fighter" in tags:
        out.update(["frontline", "split", "dive"])
    if "Support" in tags:
        out.update(["peel", "engage"])

    if re.search(r"étourdi|étourdit|immobilis|enracin|supprime|airborne|project", t):
        out.add("engage")
    if re.search(r"bouclier|soin|protect|invuln|sanctuaire", t):
        out.add("peel")
    if re.search(r"invisible|stealth|camouflage", t):
        out.add("pick")
    if re.search(r"zone|cercle|tous les ennemis", t):
        out.add("wave_clear")
    if stats.get("attackrange", 125) >= 500:
        out.add("poke")
        out.add("scaling")
    if stats.get("hp", 500) >= 600 and stats.get("armor", 0) + stats.get("spellblock", 0) >= 35:
        out.add("frontline")
    if re.search(r"dash|bond|saut|charge|glisse", t):
        out.add("dive")

    # Jungle heuristic
    if champ_id in {
        "LeeSin", "Elise", "JarvanIV", "Vi", "XinZhao", "RekSai", "Pantheon",
        "Nocturne", "Hecarim", "Gragas", "Zac", "Rammus", "Amumu", "Sejuani",
    }:
        out.add("gank_jungle")
    if champ_id in {"Karthus", "MasterYi", "Shyvana", "BelVeth", "Graves", "Lillia", "Udyr", "Nidalee"}:
        out.add("farm_jungle")

    if champ_id in {"Tryndamere", "Fiora", "Camille", "Jax", "Yorick", "Nasus", "Gangplank", "Shen", "Yorick"}:
        out.add("split")
    if champ_id in {"Orianna", "Azir", "KogMaw", "Jinx", "Twitch", "Vayne", "Kayle", "Veigar", "Nasus", "Viktor"}:
        out.add("scaling")

    return sorted(out)


def slug_id(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "lol-coach/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_scaling(text: str) -> dict:
    ad = sum(int(m) for m in re.findall(r"(\d+)\s*%\s*(?:des dégâts d'attaque|d'attaque|AD)", text, re.I))
    ap = sum(int(m) for m in re.findall(r"(\d+)\s*%\s*(?:puissance|PM|AP)", text, re.I))
    physical = len(re.findall(r"dégâts physiques", text, re.I))
    magical = len(re.findall(r"dégâts magiques", text, re.I))
    return {"adRatio": ad, "apRatio": ap, "physical": physical, "magical": magical}


def build_draft_profile(tags: list[str], stats: dict, scaling: dict, spell_text: str, tactic_tags: list[str]) -> dict:
    hp = stats.get("hp", 500)
    armor = stats.get("armor", 20)
    mr = stats.get("spellblock", 20)
    attack_range = stats.get("attackrange", 125)
    ad = stats.get("attackdamage", 50)
    ap = stats.get("mp", 0)

    tanky = hp >= 580 and (armor + mr) >= 60
    squishy = hp <= 540 and armor + mr <= 50 and "Tank" not in tags

    ad_share = scaling["adRatio"] / max(scaling["adRatio"] + scaling["apRatio"], 1)
    ap_share = scaling["apRatio"] / max(scaling["adRatio"] + scaling["apRatio"], 1)
    if "Marksman" in tags or "Fighter" in tags:
        ad_share = max(ad_share, 0.65)
    if "Mage" in tags:
        ap_share = max(ap_share, 0.65)

    damage = "Mixed"
    if ad_share > 0.65:
        damage = "AD"
    elif ap_share > 0.65:
        damage = "AP"

    range_kind = "melee" if attack_range <= 200 else "ranged"
    wave_clear = "wave_clear" in tactic_tags

    dps_weight = 0.35
    if "Marksman" in tags or "Assassin" in tags:
        dps_weight = 0.85
    elif "Mage" in tags:
        dps_weight = 0.7
    elif "Fighter" in tags:
        dps_weight = 0.55

    tank_weight = 0.2
    if "Tank" in tags:
        tank_weight = 1.0
    elif tanky:
        tank_weight = 0.75
    elif squishy:
        tank_weight = 0.1

    return {
        "damage": damage,
        "squishy": squishy,
        "tanky": tanky,
        "range": range_kind,
        "adRatio": scaling["adRatio"],
        "apRatio": scaling["apRatio"],
        "adShare": round(ad_share, 2),
        "apShare": round(ap_share, 2),
        "dpsWeight": round(dps_weight, 2),
        "tankWeight": round(tank_weight, 2),
        "waveClear": wave_clear,
    }


def infer_matchups(champ: dict, all_champs: list[dict]) -> tuple[list[str], list[str]]:
    """Simple counter heuristic from range, damage type, and tags."""
    worst: list[tuple[int, str]] = []
    best: list[tuple[int, str]] = []
    my = champ
    my_tags = set(my.get("tacticTags", []))
    my_dp = my.get("draftProfile", {})

    for other in all_champs:
        if other["id"] == my["id"]:
            continue
        ot = set(other.get("tacticTags", []))
        od = other.get("draftProfile", {})
        score = 0  # positive = we lose to them

        if "assassin" in ot and my_dp.get("squishy"):
            score += 3
        if "dive" in ot and my_dp.get("range") == "ranged" and "peel" not in my_tags:
            score += 2
        if "poke" in ot and my_dp.get("tanky"):
            score -= 1
        if "frontline" in my_tags and "mage_burst" in ot:
            score -= 2
        if "mage_burst" in my_tags and "frontline" in ot:
            score += 1
        if my_dp.get("damage") == "AD" and od.get("armor", 0) > 35:
            score += 1
        if my_dp.get("damage") == "AP" and od.get("mr", 0) > 32:
            score += 1
        if "scaling" in my_tags and "assassin" in ot:
            score += 2
        if "engage" in my_tags and "poke" in ot:
            score -= 1

        if score >= 3:
            worst.append((score, other["name"]))
        elif score <= -2:
            best.append((-score, other["name"]))

    worst.sort(reverse=True)
    best.sort(reverse=True)
    return [n for _, n in worst[:5]], [n for _, n in best[:5]]


def build_abilities(detail: dict) -> list[dict]:
    spells = []
    passive = detail.get("passive", {})
    if passive.get("name"):
        spells.append({
            "slot": "Passif",
            "meta": passive.get("name", ""),
            "cooldown": "—",
            "description": re.sub(r"<[^>]+>", "", passive.get("description", "")),
        })
    for key, label in [("Q", "Q"), ("W", "W"), ("E", "E"), ("R", "Ultimate")]:
        idx = {"Q": 0, "W": 1, "E": 2, "R": 3}[key]
        spells_list = detail.get("spells", [])
        sp = spells_list[idx] if idx < len(spells_list) else {}
        cd = sp.get("cooldownBurn", "—")
        spells.append({
            "slot": label,
            "meta": sp.get("name", label),
            "cooldown": f"{cd}s" if cd != "—" else "—",
            "description": re.sub(r"<[^>]+>", "", sp.get("description", "")),
        })
    return spells


def infer_slots(champ_id: str, tags: list[str]) -> list[str]:
    if champ_id in SLOT_OVERRIDES:
        return SLOT_OVERRIDES[champ_id]
    slots: set[str] = set()
    for tag in tags:
        slots.update(TAG_TO_SLOTS.get(tag, []))
    if not slots:
        slots.add("Mid")
    order = ["Top", "Jungle", "Mid", "Bot", "Support"]
    return [s for s in order if s in slots]


def main() -> None:
    versions = fetch_json(f"{DD_BASE}/api/versions.json")
    version = versions[0]
    print(f"Patch Data Dragon: {version}")

    champ_list_fr = fetch_json(f"{DD_BASE}/cdn/{version}/data/fr_FR/champion.json")["data"]
    champ_list_en = fetch_json(f"{DD_BASE}/cdn/{version}/data/en_US/champion.json")["data"]
    items_raw = fetch_json(f"{DD_BASE}/cdn/{version}/data/fr_FR/item.json")["data"]

    champions: list[dict] = []

    for champ_id, summary in sorted(champ_list_fr.items(), key=lambda x: x[1]["name"]):
        detail_payload = fetch_json(f"{DD_BASE}/cdn/{version}/data/fr_FR/champion/{champ_id}.json")["data"]
        detail_fr = detail_payload.get(champ_id) or detail_payload.get(summary["id"]) or next(iter(detail_payload.values()))
        name_en = champ_list_en.get(champ_id, {}).get("name", champ_id)
        tags = detail_fr.get("tags", [])
        stats = detail_fr.get("stats", {})
        abilities = build_abilities(detail_fr)
        spell_text = " ".join(a["description"] for a in abilities)
        scaling = parse_scaling(spell_text)
        tactic_tags = infer_tactic_tags(champ_id, tags, spell_text, stats)
        optimal = []
        type_fr = " / ".join(TAG_FR.get(t, t) for t in tags) or "Champion"

        champ = {
            "id": slug_id(summary["name"]),
            "key": champ_id,
            "name": summary["name"],
            "nameEn": name_en,
            "type": type_fr,
            "tags": tags,
            "positions": "Lane share ranked (≥5%)",
            "optimalSlots": optimal,
            "raison": re.sub(r"<[^>]+>", "", detail_fr.get("blurb", ""))[:280],
            "stats": f"PV {stats.get('hp')} · AD {stats.get('attackdamage')} · Portée {stats.get('attackrange')}",
            "bestCounters": [],
            "bestPairings": [],
            "build": [],
            "tierMeta": "C",
            "tierNote": "Peu vu en pro — niche, counter-pick ou dépendant du patch.",
            "abilities": abilities,
            "icon": f"https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{champ_id}.png",
            "splash": f"https://ddragon.leagueoflegends.com/cdn/img/champion/splash/{champ_id}_0.jpg",
            "tacticTags": tactic_tags,
        }
        champ["draftProfile"] = build_draft_profile(tags, stats, scaling, spell_text, tactic_tags)
        champions.append(champ)
        if len(champions) % 20 == 0:
            print(f"  … {len(champions)} champions")

    for c in champions:
        c["bestCounters"] = []
        c["bestPairings"] = []

    # Items — légendaires finis, Summoner's Rift ranked uniquement
    items = []
    seen_names: set[str] = set()
    for item_id, item in items_raw.items():
        if not is_summoners_rift_legendary(item_id, item):
            continue
        name = item["name"]
        if name in seen_names:
            continue
        seen_names.add(name)
        gold = item.get("gold", {})
        total = gold.get("total", 0)
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

    # Tactics meta
    tactics_meta = {
        "version": version,
        "source": "Data Dragon + heuristiques",
        "champions": {},
        "tacticOptions": {
            "lanePriority": {
                "label": "Priorité de lane",
                "values": ["Top side", "Bot side", "Mid prio", "Équilibré"],
            },
            "junglePath": {
                "label": "Plan jungle early",
                "values": ["Full clear → gank", "Gank lvl 3", "Invade / tempo", "Couverture lanes faibles"],
            },
            "heraldDrake": {
                "label": "Objectif early (14 min)",
                "values": ["Drake stack", "Herald → plate", "Trade flexible", "Contest si avantage"],
            },
            "waveState": {
                "label": "Gestion de vague",
                "values": ["Slow push → roam", "Freeze / deny", "Fast push → reset"],
            },
            "midGame": {
                "label": "Mid game (15–25 min)",
                "values": ["Group 4 mid", "Split side lane", "Pick vision / bush", "Shadow jungler"],
            },
            "baronDrake": {
                "label": "Setup objectif late",
                "values": ["Baron setup", "Fight soul / elder", "Contest seulement", "Split press"],
            },
            "teamfight": {
                "label": "Style teamfight",
                "values": ["Front to back", "Flank / dive backline", "Poke siege", "Reset / pick"],
            },
            "vision": {
                "label": "Vision & contrôle",
                "values": ["Deep enemy jungle", "River / pixel", "Lane tri-bush prio", "Sweep avant objectif"],
            },
            "winCondition": {
                "label": "Win condition",
                "values": ["Teamfight 5v5", "Split push", "Pick / pickoff", "Scale late"],
            },
        },
    }

    for c in champions:
        tactics_meta["champions"][c["name"]] = {
            "tags": c["tacticTags"],
            "type": c["type"],
            "bestCounters": c["bestCounters"],
            "bestPairings": c["bestPairings"],
            "optimalSlots": c["optimalSlots"],
        }

    guide = {
        "title": "Guide macro League of Legends",
        "subtitle": "Fondamentaux pour SoloQ et draft",
        "sections": [
            {
                "id": "intro",
                "title": "Introduction",
                "html": "<p>Ce dashboard t'aide à <strong>draft</strong>, comparer des comps et planifier la <strong>macro</strong> en partie. Les données viennent de Riot Data Dragon ; les tiers et le pool se configurent dans l'onglet Patch.</p>",
            },
            {
                "id": "lanes",
                "title": "Priorité de lanes",
                "html": "<p>La priorité détermine qui peut <strong>roamer</strong>, <strong>contester l'herald/drake</strong> ou <strong>invade</strong>. Push → ward → reset. Si tu perds la prio, joue safe et farm sous tourelle.</p><ul><li><strong>Top prio</strong> : herald, invade topside, TP plays.</li><li><strong>Mid prio</strong> : roams jungle, vision rivière, setup skirmish.</li><li><strong>Bot prio</strong> : drake, dive bot, swap lanes.</li></ul>",
            },
            {
                "id": "jungle",
                "title": "Jungle & tempo",
                "html": "<p>Full clear vs gank early vs invade — adapte-toi au matchup jungle et aux lanes gagnantes. Track le jungler ennemi (timers camps, deep wards). Objectif : être là où l'ennemi <em>n'est pas</em>.</p>",
            },
            {
                "id": "objectives",
                "title": "Objectifs",
                "html": "<p><strong>Drakes</strong> : stack si comp scale TF ; trade herald si besoin de plates. <strong>Herald</strong> : press top/mid, pas forcément tourelle bot. <strong>Baron</strong> : setup vision 30s avant, clear side lane, force ennemi à répondre.</p>",
            },
            {
                "id": "draft",
                "title": "Draft & comps",
                "html": "<p>Équilibre <strong>engage / disengage</strong>, <strong>AD/AP</strong>, frontline et wave clear. En fearles, diversifie les win conditions. Utilise l'onglet Draft pour simuler et l'onglet Tactiques pour le plan de match.</p>",
            },
        ],
    }

    champ_payload = {
        "version": version,
        "source": f"Data Dragon {version}",
        "championCount": len(champions),
        "champions": champions,
    }

    for folder in (DATA, PUBLIC_DATA):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "champions.json").write_text(json.dumps(champ_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        (folder / "items.json").write_text(
            json.dumps(
                {
                    "version": version,
                    "scope": "Summoner's Rift ranked — objets légendaires (≥3000 or) uniquement",
                    "itemCount": len(items),
                    "items": items,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        (folder / "tactics-meta.json").write_text(json.dumps(tactics_meta, ensure_ascii=False, indent=2), encoding="utf-8")
        (folder / "guide-fr.json").write_text(json.dumps(guide, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Done: {len(champions)} champions, {len(items)} items -> {PUBLIC_DATA}")

    matchups_script = ROOT / "scripts" / "apply_matchups_from_gameplay.py"
    if matchups_script.exists():
        import subprocess
        import sys

        print("Calcul matchups / pairings depuis lol-champions-gameplay.md…")
        subprocess.run([sys.executable, str(matchups_script)], check=True)

    tiers_script = ROOT / "scripts" / "apply_kaze_knowledge_tiers.py"
    if tiers_script.exists():
        import subprocess
        import sys

        print("Application tier list Kazewa/Kaze (docs MD)…")
        subprocess.run([sys.executable, str(tiers_script)], check=True)


if __name__ == "__main__":
    main()
