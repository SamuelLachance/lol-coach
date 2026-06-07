#!/usr/bin/env python3
"""Assign coreItems + situationalItems to champions from family / draft profile."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_PATHS = [ROOT / "data" / "champions.json", ROOT / "public" / "data" / "champions.json"]
ITEMS_PATH = ROOT / "public" / "data" / "items.json"

FAMILY_BUILDS: dict[str, dict[str, list[str]]] = {
    "bruiser_teamfight": {
        "core": ["Soif-de-sang", "Danse de la mort"],
        "situational": ["Couperet noir", "Gage de Sterak", "Cimeterre mercuriel", "Ange gardien", "Armure sanguine"],
    },
    "bruiser_split": {
        "core": ["Estropieur", "Couperet noir"],
        "situational": ["Hydre titanesque", "Ange gardien", "Cimeterre mercuriel", "Terminus"],
    },
    "tank_engage": {
        "core": ["Jak'Sho, le Protéiforme", "Cœuracier"],
        "situational": ["Armure de Warmog", "Ange gardien", "Gage de Sterak"],
    },
    "tank_disengage": {
        "core": ["Jak'Sho, le Protéiforme", "Armure de Warmog"],
        "situational": ["Cœuracier", "Ange gardien", "Volonté cosmique"],
    },
    "adc_hypercarry": {
        "core": ["Lame d'infini", "Tueur de krakens"],
        "situational": ["Salutations de Dominik", "Rappel mortel", "Ange gardien", "Soif-de-sang"],
    },
    "adc_poke": {
        "core": ["Lame d'infini", "Flèches des Yun Tal"],
        "situational": ["Salutations de Dominik", "Ange gardien", "Rappel mortel"],
    },
    "adc_short_allin": {
        "core": ["Lame tempête", "Percepteur"],
        "situational": ["Ange gardien", "Rappel mortel", "Soif-de-sang"],
    },
    "adc_tempo": {
        "core": ["Tueur de krakens", "Flèches des Yun Tal"],
        "situational": ["Salutations de Dominik", "Lame d'infini", "Ange gardien"],
    },
    "mage_control": {
        "core": ["Tourment de Liandry", "Volonté cosmique"],
        "situational": ["Coiffe de Rabadon", "Sablier de Zhonya", "Voile de la banshee", "Bâton du void"],
    },
    "mage_dps": {
        "core": ["Coiffe de Rabadon", "Flamme-ombre"],
        "situational": ["Bâton du void", "Sablier de Zhonya", "Voile de la banshee", "Pistolame Hextech"],
    },
    "assassin_ad_pick": {
        "core": ["Brise-coques", "Manteau de la nuit"],
        "situational": ["Percepteur", "Cyclosabre voltaïque", "Gueule de Malmortius", "Ange gardien"],
    },
    "assassin_ap_pick": {
        "core": ["Flamme-ombre", "Manteau de la nuit"],
        "situational": ["Bâton du void", "Voile de la banshee", "Sablier de Zhonya", "Pistolame Hextech"],
    },
    "support_enchanter": {
        "core": ["Volonté cosmique", "Aube et crépuscule"],
        "situational": ["Sablier de Zhonya", "Voile de la banshee", "Jak'Sho, le Protéiforme"],
    },
    "support_engage": {
        "core": ["Jak'Sho, le Protéiforme", "Cœuracier"],
        "situational": ["Gage de Sterak", "Ange gardien", "Armure de Warmog"],
    },
    "support_disengage": {
        "core": ["Volonté cosmique", "Jak'Sho, le Protéiforme"],
        "situational": ["Sablier de Zhonya", "Voile de la banshee", "Aube et crépuscule"],
    },
    "support_poke": {
        "core": ["Tourment de Liandry", "Volonté cosmique"],
        "situational": ["Sablier de Zhonya", "Voile de la banshee", "Coiffe de Rabadon"],
    },
    "jungle_offensive": {
        "core": ["Cyclosabre voltaïque", "Manteau de la nuit"],
        "situational": ["Percepteur", "Gueule de Malmortius", "Ange gardien", "Soif-de-sang"],
    },
    "jungle_defensive": {
        "core": ["Soif-de-sang", "Danse de la mort"],
        "situational": ["Jak'Sho, le Protéiforme", "Cœuracier", "Cimeterre mercuriel"],
    },
    "jungle_hypercarry": {
        "core": ["Lame du roi déchu", "Terminus"],
        "situational": ["Soif-de-sang", "Ange gardien", "Gage de Sterak"],
    },
    "global_pick": {
        "core": ["Brise-coques", "Manteau de la nuit"],
        "situational": ["Percepteur", "Volonté cosmique", "Ange gardien"],
    },
    "ovni": {
        "core": ["Estropieur", "Terminus"],
        "situational": ["Couperet noir", "Ange gardien", "Cimeterre mercuriel"],
    },
}

TYPE_FALLBACK: dict[str, dict[str, list[str]]] = {
    "Combattant": FAMILY_BUILDS["bruiser_teamfight"],
    "Tank": FAMILY_BUILDS["tank_engage"],
    "Mage": FAMILY_BUILDS["mage_dps"],
    "Assassin": FAMILY_BUILDS["assassin_ad_pick"],
    "Tireur": FAMILY_BUILDS["adc_hypercarry"],
    "Support": FAMILY_BUILDS["support_enchanter"],
}


def load_valid_item_names() -> set[str]:
    data = json.loads(ITEMS_PATH.read_text(encoding="utf-8"))
    return {item["name"] for item in data.get("items", [])}


def pick_valid(names: list[str], valid: set[str]) -> list[str]:
    out: list[str] = []
    for name in names:
        if name in valid and name not in out:
            out.append(name)
    return out


def resolve_template(champ: dict) -> dict[str, list[str]]:
    fam_key = (champ.get("championFamily") or {}).get("key", "")
    dp = champ.get("draftProfile") or {}
    main_role = champ.get("mainRole") or ""

    if fam_key in FAMILY_BUILDS:
        tmpl = FAMILY_BUILDS[fam_key]
    else:
        tmpl = TYPE_FALLBACK.get(champ.get("type", ""), FAMILY_BUILDS["bruiser_teamfight"])

    ap_share = float(dp.get("apShare") or 0)
    ad_share = float(dp.get("adShare") or 0)

    if ap_share >= 0.45 and ad_share < 0.55:
        if fam_key not in {"mage_control", "mage_dps", "assassin_ap_pick", "support_enchanter", "support_poke"}:
            tmpl = FAMILY_BUILDS["mage_dps"]

    if main_role == "Bot" and ad_share >= 0.55 and "adc" not in fam_key:
        tmpl = FAMILY_BUILDS["adc_hypercarry"]

    if main_role == "Support" and fam_key not in FAMILY_BUILDS:
        tmpl = FAMILY_BUILDS["support_enchanter"]

    return tmpl


def apply_builds(champions: list[dict], valid: set[str]) -> int:
    count = 0
    for champ in champions:
        tmpl = resolve_template(champ)
        core = pick_valid(tmpl["core"], valid)[:3]
        situational = pick_valid(tmpl["situational"], valid)[:6]
        if not core:
            continue
        champ["coreItems"] = core
        champ["situationalItems"] = situational
        champ["build"] = core[:2]
        count += 1
    return count


def main() -> None:
    valid = load_valid_item_names()
    for path in DATA_PATHS:
        if not path.exists():
            print(f"skip missing {path}")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        n = apply_builds(data.get("champions", []), valid)
        data["buildVersion"] = "profile-v1"
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{path.name}: builds applied to {n} champions")


if __name__ == "__main__":
    main()
