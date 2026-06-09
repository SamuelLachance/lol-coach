#!/usr/bin/env python3
"""Build MTG color identity (W/U/B/R/G, sum=24) for all champions."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHAMPIONS_JSON = ROOT / "data" / "champions.json"
OUT_PATHS = [
    ROOT / "data" / "mtg-colors.json",
    ROOT / "public" / "data" / "mtg-colors.json",
]

# Base par famille (W, U, B, R, G) — somme = 24
FAMILY_COLORS: dict[str, tuple[int, int, int, int, int]] = {
    "tank_engage": (8, 3, 1, 7, 5),
    "tank_disengage": (9, 5, 1, 3, 6),
    "bruiser_teamfight": (4, 2, 3, 9, 6),
    "bruiser_split": (2, 4, 8, 5, 5),
    "mage_control": (3, 10, 2, 3, 6),
    "mage_dps": (2, 6, 5, 7, 4),
    "assassin_ad_pick": (1, 3, 9, 7, 4),
    "assassin_ap_pick": (1, 4, 9, 6, 4),
    "adc_hypercarry": (5, 3, 4, 2, 10),
    "adc_tempo": (3, 2, 3, 11, 5),
    "adc_allin": (2, 1, 4, 12, 5),
    "adc_poke": (4, 8, 2, 4, 6),
    "support_enchanter": (10, 4, 1, 2, 7),
    "support_engage": (5, 2, 2, 10, 5),
    "support_disengage": (9, 5, 1, 3, 6),
    "support_poke": (4, 7, 3, 5, 5),
    "jungle_defensive": (6, 5, 2, 4, 7),
    "jungle_offensive": (2, 3, 6, 10, 3),
    "global_pick": (3, 8, 4, 4, 5),
    "specialist": (3, 5, 5, 6, 5),
}

# Ajustements par champion (delta W, U, B, R, G)
CHAMP_OVERRIDES: dict[str, tuple[int, int, int, int, int]] = {
    "Twisted Fate": (2, 6, 0, -2, -2),  # Dopa full tank TF = W/U
    "Fiora": (-2, 2, 4, 0, 0),
    "Azir": (-1, 4, -1, -1, -1),
    "Orianna": (-1, 5, -1, -2, -1),
    "Viktor": (-1, 4, 0, -2, -1),
    "Syndra": (0, 4, 1, -2, -1),
    "Zed": (-2, 1, 5, 2, -2),
    "Katarina": (-1, 0, 6, 4, -3),
    "Draven": (-2, -1, 2, 6, -1),
    "Renekton": (-1, -1, 1, 5, -2),
    "Lee Sin": (1, 2, 2, 5, -2),
    "Lulu": (3, 2, -2, -2, 1),
    "Yuumi": (4, 1, -2, -2, 1),
    "Renata Glasc": (3, 3, 0, -2, 0),
    "Braum": (4, 2, -1, -2, 1),
    "Taric": (5, 2, -2, -2, 1),
    "Leona": (2, 0, 0, 5, -1),
    "Nautilus": (2, 0, 0, 5, -1),
    "Rell": (2, 0, 0, 5, -1),
    "Jinx": (2, 0, 0, -1, 3),
    "Kog'Maw": (3, 0, 0, -2, 3),
    "Vayne": (-1, 1, 4, 2, -2),
    "Kayle": (-1, 2, 0, -2, 3),
    "Kassadin": (-1, 3, 2, -2, 2),
    "Nasus": (-1, 1, 2, -1, 3),
    "Ornn": (2, 1, 0, 2, 3),
    "Maokai": (4, 2, 0, 2, 2),
    "Sejuani": (5, 2, 0, 3, 2),
    "Nunu et Willump": (4, 2, 0, 3, 3),
    "Ivern": (5, 4, 0, 0, 3),
    "Caitlyn": (2, 5, 0, 3, 2),
    "Varus": (2, 5, 0, 3, 2),
    "Ezreal": (1, 6, 0, 4, 1),
    "Xerath": (1, 7, 2, 2, 0),
    "Vel'Koz": (0, 6, 3, 3, 0),
    "Brand": (0, 4, 3, 5, 0),
    "Pyke": (-1, 2, 5, 4, -2),
    "Thresh": (3, 3, 2, 3, -1),
    "Graves": (0, 2, 4, 6, -2),
    "Kha'Zix": (-1, 1, 5, 5, -2),
    "Nocturne": (-1, 2, 4, 5, -2),
    "Elise": (0, 2, 3, 6, -3),
    "Bel'Veth": (-1, 0, 4, 4, -1),
    "Kindred": (1, 3, 3, 4, -1),
    "Gangplank": (0, 4, 3, 4, -1),
    "Sion": (3, 1, 2, 5, 1),
    "Malphite": (3, 1, 0, 6, 2),
    "Amumu": (2, 1, 0, 6, 3),
    "Jarvan IV": (2, 1, 0, 6, 3),
    "Pantheon": (1, 1, 2, 6, 2),
    "Vi": (1, 1, 2, 6, 2),
    "Rumble": (1, 2, 0, 6, 3),
    "Lucian": (0, 1, 2, 7, 2),
    "Samira": (-1, 0, 3, 7, -1),
    "Tristana": (0, 0, 3, 7, 2),
    "Kalista": (0, 2, 2, 6, 2),
    "Yasuo": (-1, 2, 3, 5, -1),
    "Yone": (-1, 1, 4, 5, -1),
    "Riven": (-1, 1, 3, 6, -1),
    "Camille": (-1, 2, 4, 4, -1),
    "Tryndamere": (-2, 0, 5, 4, -1),
    "Yorick": (-1, 2, 4, 3, 0),
    "Heimerdinger": (1, 6, 1, 3, -1),
    "Ziggs": (1, 5, 2, 4, -2),
    "Zilean": (3, 6, 0, 1, 2),
    "Karma": (4, 5, 0, 1, 2),
    "Soraka": (5, 3, 0, 0, 4),
    "Sona": (4, 3, 0, 1, 4),
    "Milio": (5, 3, 0, 1, 3),
    "Janna": (4, 4, 0, 1, 3),
    "Shen": (4, 3, 0, 2, 3),
    "Galio": (4, 3, 0, 4, 1),
    "Taliyah": (2, 5, 0, 4, -1),
    "Ryze": (1, 6, 0, 3, -2),
    "Corki": (0, 4, 2, 5, -1),
    "Jayce": (0, 4, 2, 5, -1),
    "Hwei": (0, 6, 2, 4, -2),
    "Aurora": (0, 4, 3, 5, -2),
    "Ambessa": (1, 2, 3, 5, -1),
    "Smolder": (1, 3, 0, 3, 3),
    "Mel": (0, 5, 2, 4, -1),
    "Naafiri": (-1, 1, 4, 5, -1),
    "Briar": (-1, 0, 3, 7, -1),
}

COLOR_META = {
    "W": {"label": "Blanc", "labelEn": "White", "philosophy": "Structure & altruisme", "hex": "#f5f0dc"},
    "U": {"label": "Bleu", "labelEn": "Blue", "philosophy": "Connaissance & contrôle", "hex": "#4a9fd4"},
    "B": {"label": "Noir", "labelEn": "Black", "philosophy": "Pouvoir & sacrifice", "hex": "#6b6b7a"},
    "R": {"label": "Rouge", "labelEn": "Red", "philosophy": "Liberté & destruction", "hex": "#e05238"},
    "G": {"label": "Vert", "labelEn": "Green", "philosophy": "Croissance & tradition", "hex": "#3d9e5a"},
}

# Paires MTG : allied (+), enemy (-)
COLOR_PAIRS = {
    "allied": [["W", "U"], ["U", "B"], ["B", "R"], ["R", "G"], ["G", "W"]],
    "enemy": [["W", "B"], ["W", "R"], ["U", "R"], ["U", "G"], ["B", "G"]],
}


def clamp_colors(w: int, u: int, b: int, r: int, g: int) -> tuple[int, int, int, int, int]:
    vals = [max(0, v) for v in (w, u, b, r, g)]
    total = sum(vals)
    if total == 0:
        return (5, 5, 5, 5, 4)
    if total == 24:
        return tuple(vals)  # type: ignore
    scaled = [max(0, round(v * 24 / total)) for v in vals]
    diff = 24 - sum(scaled)
    order = sorted(range(5), key=lambda i: scaled[i], reverse=True)
    i = 0
    while diff != 0:
        idx = order[i % 5]
        if diff > 0:
            scaled[idx] += 1
            diff -= 1
        elif scaled[idx] > 0:
            scaled[idx] -= 1
            diff += 1
        i += 1
    return tuple(scaled)  # type: ignore


def dominant_colors(w: int, u: int, b: int, r: int, g: int, top_n: int = 2) -> list[str]:
    pairs = [("W", w), ("U", u), ("B", b), ("R", r), ("G", g)]
    pairs.sort(key=lambda x: x[1], reverse=True)
    return [c for c, v in pairs[:top_n] if v >= 4]


def identity_label(dominant: list[str]) -> str:
    if not dominant:
        return "WUBRG"
    if len(dominant) == 1:
        return dominant[0]
    return "".join(dominant[:2])


def build_for_champion(champ: dict) -> dict:
    fam = champ.get("championFamily") or {}
    key = fam.get("key") or "specialist"
    base = FAMILY_COLORS.get(key, FAMILY_COLORS["specialist"])
    override = CHAMP_OVERRIDES.get(champ["name"], (0, 0, 0, 0, 0))
    w, u, b, r, g = clamp_colors(*(a + o for a, o in zip(base, override)))

    # Tag tweaks
    tags = set(champ.get("matchupProfile", {}).get("tags", []) or [])
    tags.update(champ.get("tags") or [])
    dp = champ.get("draftProfile") or {}
    if dp.get("tankWeight", 0) > 0.7:
        w, g = w + 1, g + 1
    if dp.get("dpsWeight", 0) > 0.75 and dp.get("squishy"):
        b, r = b + 1, r + 1
    w, u, b, r, g = clamp_colors(w, u, b, r, g)

    dom = dominant_colors(w, u, b, r, g)
    return {
        "W": w,
        "U": u,
        "B": b,
        "R": r,
        "G": g,
        "dominant": dom,
        "identity": identity_label(dom),
        "vector": [w / 24, u / 24, b / 24, r / 24, g / 24],
    }


def main() -> None:
    data = json.loads(CHAMPIONS_JSON.read_text(encoding="utf-8"))
    champions: dict[str, dict] = {}
    for c in data["champions"]:
        champions[c["name"]] = build_for_champion(c)

    out = {
        "version": "1",
        "source": "oracle.txt + familles + heuristiques Kazewa",
        "totalPoints": 24,
        "colors": COLOR_META,
        "pairs": COLOR_PAIRS,
        "champions": champions,
    }

    for path in OUT_PATHS:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote {path} ({len(champions)} champions)")

    bad = [n for n, c in champions.items() if sum(c[k] for k in "WUBRG") != 24]
    if bad:
        raise SystemExit(f"Color sum != 24: {bad[:5]}")


if __name__ == "__main__":
    main()
