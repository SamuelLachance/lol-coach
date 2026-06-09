#!/usr/bin/env python3
"""Build ls_worlds_2024_tiers.json from LS Worlds 2024 champion tier list.

Source: https://www.youtube.com/watch?v=vxi1PZk7SaI (LS, 2024-09-25, patch ~14.18 Worlds)
Tiers extraites des frames vidéo (Top/Jungle/Mid/ADC) + transcript Support.
Mapping LS → site : Z/Fiddle → S, S → A, A/Jhin → B, B → C, C → C, DON'T → D.
"""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "ls_worlds_2024_tiers.json"

# LS tier labels per role (video uses Z-blind/Z-counter/S-blind/S-counter/A/B/C/DON'T + Fiddle/Jhin)
ROLE_TIERS: dict[str, dict[str, list[str]]] = {
    "Top": {
        "Z-blind": ["Wukong", "Janna"],  # transcript WX + Janna top roam
        "Z-counter": ["Vladimir", "Olaf", "Malphite", "Garen", "Shen", "Darius", "Riven"],
        "S-blind": ["Renekton", "Gragas", "Karma", "Ornn", "Sion", "Graves", "Rumble", "Neeko", "Bard"],
        "S-counter": [
            "Teemo", "Poppy", "Gwen", "Cho'Gath", "Nidalee", "Camille", "Yone", "Yasuo", "Gangplank",
            "Jax", "Nasus", "Singed", "Illaoi", "Swain", "Urgot", "Mordekaiser", "Gnar", "Zac", "Ryze",
            "Vayne", "Trundle", "Fiora", "Kayle", "Varus", "Zilean", "Fiddlesticks", "Warwick",
        ],
        "A": [
            "Jayce", "Lee Sin", "Tryndamere", "Xin Zhao", "Corki", "Kennen", "K'Sante", "Quinn",
            "Twisted Fate", "Aurelion Sol", "Pantheon", "Ziggs", "Sejuani", "Volibear",
        ],
        "B": ["Lillia", "Sylas", "Yorick", "Shyvana", "Aatrox", "Karthus", "Dr. Mundo", "Heimerdinger", "Kled"],
        "C": ["Akali", "Brand", "Nautilus"],
        "DON'T": ["Tahm Kench", "Sett", "Maokai", "Irelia", "Galio"],
    },
    "Jungle": {
        "Z-blind": ["Ivern", "Nunu & Willump", "Udyr"],
        "Z-counter": ["Rammus", "Shen"],
        "Fiddle": ["Fiddlesticks"],
        "S-blind": ["Karthus", "Amumu", "Lillia", "Gragas", "Ornn", "Xin Zhao", "Warwick", "Zyra", "Maokai"],
        "S-counter": ["Mordekaiser", "Zac", "Morgana", "Shyvana", "Gwen", "Viego", "Urgot", "Master Yi", "Taric"],
        "A": ["Rengar", "Volibear", "Hecarim", "Sejuani", "Jarvan IV", "Nocturne", "Evelynn", "Shaco", "Poppy", "Wukong"],
        "B": ["Nidalee", "Vi", "Bel'Veth", "Sion", "Twitch", "Garen"],
        "C": ["Kayn", "Elise", "Kha'Zix", "Lee Sin", "Malphite", "Diana", "Dr. Mundo", "Ekko", "Kindred", "Jax", "Graves", "Talon"],
        "DON'T": ["Olaf", "Pantheon", "Briar", "Qiyana", "Zed", "Taliyah"],
    },
    "Mid": {
        "Z-blind": ["Yone", "Ziggs"],
        "Z-counter": ["Yasuo", "Smolder", "Swain"],
        "S-blind": ["Annie", "Orianna", "Hwei", "Karma"],
        "S-counter": [
            "Anivia", "Cassiopeia", "Aurelion Sol", "Galio", "Twisted Fate", "Tristana", "Garen",
            "Akali", "Vel'Koz", "Renekton", "Katarina", "Neeko",
        ],
        "A": ["Xerath", "Naafiri", "Taliyah", "Syndra", "Viktor", "Karthus", "Vladimir", "Brand", "Ryze", "Soraka", "Ivern"],
        "B": ["Singed", "Lissandra", "Corki", "Kog'Maw", "Malphite", "Jayce", "Kayle", "Sylas", "Seraphine", "Malzahar", "Zilean", "Lulu", "Veigar"],
        "C": ["Ahri", "Ryze", "Irelia", "Azir", "Kassadin", "K'Sante", "Graves", "Morgana", "Diana", "Nasus", "Gragas", "Kled", "Heimerdinger", "Akshan", "Lucian", "Ornn", "Rumble", "Qiyana"],
        "DON'T": ["Pantheon", "Fizz", "Ekko", "Aatrox", "Mordekaiser", "Nautilus", "LeBlanc", "Zed", "Zeri", "Vex", "Lux", "Talon"],
    },
    "ADC": {
        "Z-blind": ["Ziggs", "Jinx"],
        "Z-counter": [],
        "S-blind": ["Smolder", "Seraphine"],
        "S-counter": ["Yasuo", "Nilah", "Swain", "Kog'Maw", "Kai'Sa", "Xayah"],
        "A": ["Varus", "Ezreal", "Caitlyn", "Ashe", "Karthus", "Miss Fortune"],
        "Jhin": ["Jhin"],
        "B": ["Lucian", "Draven", "Samira", "Aphelios", "Cassiopeia", "Cho'Gath"],
        "C": ["Zeri", "Vayne", "Corki", "Twitch", "Tristana"],
        "DON'T": ["Veigar", "Vladimir", "Quinn", "Brand", "Sivir", "Kalista"],
    },
    "Support": {
        # Support frame non capturée — transcript + inférence « traditional supports »
        "Z-blind": ["Senna", "Janna", "Zoe", "Yuumi"],
        "Z-counter": [],
        "S-blind": [],
        "S-counter": [],
        "A": [
            "Thresh", "Nautilus", "Leona", "Rell", "Alistar", "Braum", "Rakan", "Nami", "Blitzcrank",
            "Bard", "Lulu", "Soraka", "Sona", "Milio", "Renata Glasc", "Taric", "Poppy",
            "Orianna", "Xerath", "Kayle", "Shaco", "Shen", "Heimerdinger", "Fiddlesticks", "Karma", "Zyra",
        ],
        "B": ["Annie", "Lux", "Brand", "Morgana", "Pyke", "Swain", "Neeko", "Maokai"],
        "C": ["Tahm Kench", "Veigar", "Zilean", "Vel'Koz", "Hwei", "Vex", "Ashe", "Seraphine"],
        "DON'T": ["Nasus"],
    },
}

LS_TO_SITE = {
    "Z-blind": "S",
    "Z-counter": "S",
    "Fiddle": "S",
    "S-blind": "A",
    "S-counter": "A",
    "A": "B",
    "Jhin": "B",
    "B": "C",
    "C": "C",
    "DON'T": "D",
}

TIER_RANK = {"S": 0, "A": 1, "B": 2, "C": 3, "D": 4}

TIER_NOTES = {
    "S": "Z-tier LS — game-warping, peut décider la game seul (Worlds 2024 pro power list).",
    "A": "S-tier LS — cut above the rest en compétitif (Worlds 2024).",
    "B": "A-tier LS — solide, flex ou spike clair (Worlds 2024).",
    "C": "B/C-tier LS — situationnel, draft-dépendant (Worlds 2024).",
    "D": "DON'T-tier LS — éviter en compétitif (Worlds 2024).",
}

SOURCE_URL = "https://www.youtube.com/watch?v=vxi1PZk7SaI"
SOURCE_DATE = "2024-09-25"
SOURCE_PATCH = "14.18 Worlds"


def merge_assignments() -> tuple[dict[str, str], dict[str, list[str]]]:
    """Best tier per champion across all roles (lower rank = better)."""
    assignments: dict[str, str] = {}
    roles_by_champ: dict[str, list[str]] = {}

    for role, tiers in ROLE_TIERS.items():
        for ls_tier, champs in tiers.items():
            site_tier = LS_TO_SITE[ls_tier]
            for champ in champs:
                roles_by_champ.setdefault(champ, []).append(role)
                prev = assignments.get(champ)
                if prev is None or TIER_RANK[site_tier] < TIER_RANK[prev]:
                    assignments[champ] = site_tier
    return assignments, roles_by_champ


def main() -> None:
    assignments, roles_by_champ = merge_assignments()
    reasons = {
        name: f"LS Worlds 2024 · {', '.join(sorted(set(roles_by_champ.get(name, []))))}"
        for name in assignments
    }
    payload = {
        "version": "ls-worlds-2024-v1",
        "scope": "LS Worlds 2024 Champion Tier List — puissance compétitive (pas meta pick rate).",
        "source": [SOURCE_URL],
        "sourceDate": SOURCE_DATE,
        "sourcePatch": SOURCE_PATCH,
        "tierNotes": TIER_NOTES,
        "lsToSiteMapping": LS_TO_SITE,
        "roleTiers": ROLE_TIERS,
        "assignments": assignments,
        "championReasons": reasons,
        "championCount": len(assignments),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT.name}: {len(assignments)} champions with LS Worlds 2024 tiers")


if __name__ == "__main__":
    main()
