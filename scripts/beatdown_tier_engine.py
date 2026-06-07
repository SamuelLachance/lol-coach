"""
Tier list — Who's the Beatdown (Mike Flores / MTG) + potentiel game-breaker macro.

Chaque champion reçoit :
- rôle beatdown / control / flex
- scores beatdown, control, game-breaker
- vecteurs de rupture (lane tempo, TF ult, pick, split, scale, siege, reset, global, skirmish)
- analyse FR contextualisée
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent

ROLE_LABELS = {
    "beatdown": "Beatdown — tu dois gagner avant que l'adversaire stabilise",
    "control": "Control — tu gagnes en survivant et en accumulant de la valeur",
    "flex": "Flex — ton rôle dépend du matchup (risque de misread)",
}

TIER_NOTES = {
    "S": "Game-breaker S — peut single-handedly décider la game si bien piloté.",
    "A": "Rupture A — spike clair qui force une réponse adverse ou flip un fight.",
    "B": "Situationnel — game-breaker si draft/matchup/lane alignés.",
    "C": "Rôle d'équipe — contribue mais ne porte pas seul la win condition.",
    "D": "Peu de levier solo — dépend surtout de la macro collective.",
}

VECTOR_LABELS = {
    "lane_tempo": "Tempo lane → map (plates, dive, Herald)",
    "teamfight_ult": "Ultimate fight-breaking (wombo / engage décisif)",
    "pick_assassination": "Pick / assassination vision",
    "split_terror": "Split push 1-3 (pression multi-lanes)",
    "hyper_scale": "Hyper-scale (win si la game dure)",
    "objective_siege": "Siege / objectifs à distance",
    "fight_reset": "Reset de fight (sustain, revive, re-entry)",
    "global_pressure": "Pression globale (TP, ult map-wide)",
    "skirmish_snowball": "Skirmish 2v2/3v3 snowball",
    "carry_enabler": "Enabler — multiplie un carry (peel, buff, save)",
}

# Ajustements manuels sur le score game-breaker (−20 à +20)
CHAMP_BREAKER_DELTA: dict[str, int] = {
    "Azir": 18,
    "Orianna": 16,
    "Lee Sin": 14,
    "Thresh": 12,
    "Renekton": 14,
    "Fiora": 15,
    "Camille": 13,
    "Malphite": 12,
    "Ornn": 11,
    "Jinx": 14,
    "Kai'Sa": 12,
    "Varus": 10,
    "Ashe": 9,
    "Twisted Fate": 11,
    "Sylas": 13,
    "Viego": 12,
    "Bel'Veth": 11,
    "Yone": 10,
    "Renata Glasc": 15,
    "Lulu": 8,
    "Pyke": 10,
    "Elise": 11,
    "Nautilus": 9,
    "Rell": 9,
    "Sejuani": 8,
    "Gragas": 8,
    "Jarvan IV": 9,
    "Vi": 8,
    "Nocturne": 9,
    "Taliyah": 8,
    "Galio": 8,
    "Shen": 7,
    "Zed": 10,
    "LeBlanc": 9,
    "Akali": 9,
    "Fizz": 8,
    "Kassadin": 10,
    "Kayle": 12,
    "Kog'Maw": 11,
    "Viktor": 10,
    "Aphelios": 9,
    "Jhin": 7,
    "Caitlyn": 8,
    "Ziggs": 9,
    "Xerath": 8,
    "Anivia": 9,
    "Aatrox": 8,
    "Darius": 9,
    "Garen": 5,
    "Tryndamere": 10,
    "Yorick": 8,
    "Nasus": 6,
    "Draven": 11,
    "Lucian": 9,
    "Kalista": 8,
    "Samira": 9,
    "Tristana": 8,
    "Ezreal": 4,
    "Sona": 5,
    "Soraka": 4,
    "Yuumi": 3,
    "Milio": 5,
    "Taric": 6,
    "Braum": 5,
    "Janna": 4,
    "Irelia": 8,
    "Riven": 9,
    "Singed": -4,
    "Gragas": 4,
    "Udyr": 3,
    "Teemo": 4,
    "Master Yi": 7,
    "Shaco": 6,
    "Ivern": 5,
    "Ambessa": 8,
    "Smolder": 7,
    "Zeri": 10,
    "Hwei": 7,
    "Aurora": 7,
}

FAMILY_BEATDOWN = {
    "adc_allin": 22,
    "adc_tempo": 18,
    "assassin_ad_pick": 20,
    "assassin_ap_pick": 18,
    "bruiser_split": 16,
    "bruiser_teamfight": 12,
    "jungle_offensive": 18,
    "support_engage": 14,
    "adc_hypercarry": 8,
    "mage_control": 6,
    "mage_dps": 10,
    "tank_engage": 12,
    "tank_disengage": 4,
    "support_enchanter": 5,
    "support_disengage": 4,
    "support_poke": 8,
    "jungle_defensive": 6,
    "global_pick": 14,
    "adc_poke": 10,
    "specialist": 6,
}

FAMILY_CONTROL = {
    "mage_control": 22,
    "adc_hypercarry": 20,
    "tank_disengage": 18,
    "support_enchanter": 16,
    "support_disengage": 16,
    "jungle_defensive": 14,
    "mage_dps": 12,
    "global_pick": 10,
    "tank_engage": 8,
    "adc_poke": 12,
    "specialist": 10,
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def clamp(x: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, x))


def all_tags(champ: dict) -> set[str]:
    tags: set[str] = set()
    for key in ("tacticTags",):
        tags.update(champ.get(key) or [])
    mp = champ.get("matchupProfile") or {}
    tags.update(mp.get("tags") or [])
    tags.update(mp.get("roles") or [])
    return {t.lower() for t in tags}


def ability_blob(champ: dict) -> str:
    parts = []
    for a in champ.get("abilities") or []:
        parts.append(a.get("meta") or "")
        parts.append(a.get("description") or "")
    return " ".join(parts).lower()


def family_of(champ: dict) -> str:
    return (champ.get("matchupProfile") or {}).get("family") or "specialist"


def score_vectors(champ: dict, tags: set[str], text: str, dp: dict) -> dict[str, float]:
    v: dict[str, float] = {}
    dmg = dp.get("dpsWeight") or 0.5
    tank = dp.get("tankWeight") or 0.3
    squishy = dp.get("squishy", False)
    wave = dp.get("waveClear", False)
    rng = dp.get("range") or "melee"

    if tags & {"early", "lane_bully", "all_in", "strong_lane"} or "lane" in text:
        v["lane_tempo"] = 55 + (15 if "dive" in tags else 0)
    if tags & {"engage", "aoe", "teamfight", "wombo", "frontline"} or re.search(
        r"étourdi|étourdit|projet|knock|suprême|shockwave|explosion|zone|cercle", text
    ):
        v["teamfight_ult"] = 50 + (20 if "aoe" in tags else 0) + (10 if tank > 0.6 else 0)
    if tags & {"assassin", "pick", "burst", "stealth"} or re.search(
        r"assassin|invisible|furtif|exécute|execute", text
    ):
        v["pick_assassination"] = 55 + (15 if squishy else 5)
    if tags & {"split", "duelist", "side_lane"} or re.search(
        r"split|duel|1v1|mur|true damage|perfor", text
    ):
        v["split_terror"] = 52 + (12 if dmg > 0.6 else 0)
    if tags & {"scaling", "hypercarry", "late"} or (dmg > 0.65 and squishy):
        v["hyper_scale"] = 48 + dmg * 35
    if tags & {"poke", "siege", "wave_clear"} or wave or rng == "ranged":
        v["objective_siege"] = 45 + (15 if wave else 0) + (10 if "poke" in tags else 0)
    if tags & {"sustain", "heal", "revive", "reset"} or re.search(
        r"soin|heal|régén|revive|ressusc|second.*vie|reset", text
    ):
        v["fight_reset"] = 50 + (15 if "percent_hp" in tags else 0)
    if tags & {"global", "map", "roam"} or re.search(
        r"monde|global|teleport|téléport|destiny|carte entière|toutes les lanes", text
    ):
        v["global_pressure"] = 55
    if tags & {"skirmish", "mobility", "dive"} or re.search(r"dash|charge|saut", text):
        v["skirmish_snowball"] = 48 + (12 if "mobility" in tags else 0)
    if tags & {"peel", "enchanter", "shield", "protect"} or re.search(
        r"bouclier|shield|protect|polymorph|invuln", text
    ):
        v["carry_enabler"] = 42 + (15 if "peel" in tags else 0)

    fam = family_of(champ)
    if fam in ("adc_allin", "adc_tempo", "jungle_offensive"):
        v["lane_tempo"] = max(v.get("lane_tempo", 0), 58)
    if fam == "adc_hypercarry":
        v["hyper_scale"] = max(v.get("hyper_scale", 0), 62)
    if fam in ("assassin_ad_pick", "assassin_ap_pick"):
        v["pick_assassination"] = max(v.get("pick_assassination", 0), 60)
    if fam == "bruiser_split":
        v["split_terror"] = max(v.get("split_terror", 0), 58)
    if fam == "mage_control":
        v["objective_siege"] = max(v.get("objective_siege", 0), 55)
        v["hyper_scale"] = max(v.get("hyper_scale", 0), 50)

    return {k: clamp(val) for k, val in v.items() if val >= 40}


def mtg_scores(mtg: dict) -> tuple[float, float]:
    w, u, b, r, g = (mtg.get(c, 0) for c in "WUBRG")
    beatdown = r * 3.8 + b * 2.2 + (r + b) / 24 * 25
    control = u * 3.5 + g * 3.2 + w * 1.8 + (u + g + w) / 24 * 20
    return clamp(beatdown), clamp(control)


def assign_role(beatdown: float, control: float, vectors: dict[str, float]) -> str:
    top_v = max(vectors.values()) if vectors else 0
    if beatdown >= control + 18:
        return "beatdown"
    if control >= beatdown + 18:
        return "control"
    if top_v >= 70 and vectors.get("lane_tempo", 0) >= 65:
        return "beatdown"
    if top_v >= 70 and vectors.get("hyper_scale", 0) >= 65:
        return "control"
    return "flex"


def misidentify_risk(role: str, beatdown: float, control: float, vectors: dict[str, float]) -> str:
    gap = abs(beatdown - control)
    if role == "flex" or gap < 10:
        return "high"
    if role == "beatdown" and control > 55:
        return "medium"
    if role == "control" and beatdown > 55:
        return "medium"
    if vectors.get("hyper_scale", 0) > 65 and vectors.get("lane_tempo", 0) > 55:
        return "medium"
    return "low"


def game_breaker_score(
    vectors: dict[str, float], beatdown: float, control: float, name: str
) -> float:
    if not vectors:
        base = (beatdown + control) * 0.35
    else:
        sorted_v = sorted(vectors.values(), reverse=True)
        peak = sorted_v[0]
        depth = sum(sorted_v[:3]) / min(3, len(sorted_v))
        clarity = peak - (sorted_v[1] if len(sorted_v) > 1 else 0)
        base = peak * 0.5 + depth * 0.28 + clarity * 0.12 + max(beatdown, control) * 0.1
    base += CHAMP_BREAKER_DELTA.get(name, 0)
    # Enablers purs — multiplient un carry mais ne cassent pas seuls la game
    if vectors.get("carry_enabler", 0) >= 50:
        combat = max(
            vectors.get("teamfight_ult", 0),
            vectors.get("pick_assassination", 0),
            vectors.get("lane_tempo", 0),
            vectors.get("split_terror", 0),
        )
        if combat < 55:
            base = min(base, 58)
    return clamp(base)


def win_condition(role: str, vectors: dict[str, float], fam: str) -> str:
    if not vectors:
        return win_condition(
            role,
            {"lane_tempo": 50 if role == "beatdown" else 0, "hyper_scale": 50 if role == "control" else 0},
            fam,
        )
    top = sorted(vectors.items(), key=lambda x: -x[1])
    keys = [k for k, _ in top[:2]]
    if "lane_tempo" in keys:
        return "Gagner la lane 6–14, convertir en plates/Herald/vision, ne jamais reset sans objectif."
    if "hyper_scale" in keys:
        return "Survivre au mid game, farm safe, atteindre 2–3 items avant de forcer le fight décisif."
    if "split_terror" in keys:
        return "Side lane avec info — force 2 réponses ou prend plates; refuse le 5v5 perdant."
    if "pick_assassination" in keys:
        return "Vision + tempo — pick avant objectif, ne pas force 5v5 sans ult/key cooldowns."
    if "teamfight_ult" in keys:
        return "Setup vision, chunk ou CC chain, un fight propre = game."
    if "objective_siege" in keys:
        return "Poke + wave → plates/drake sans commit; l'adversaire doit face-check ou perdre struct."
    if "global_pressure" in keys:
        return "Créer une menace map qu'une seule lane ne peut pas answer (TP/ult/roam)."
    if role == "beatdown":
        return "Tempo early — chaque minute sans lead est une défaite silencieuse."
    if role == "control":
        return "Ne pas trade ta vie pour un kill vanity — scale, wave, objectifs gratuits."
    return "Identifier qui est beatdown dans CE matchup avant de forcer un fight."


def beatdown_play(role: str, vectors: dict[str, float]) -> str:
    if role == "control":
        return "Tu n'es pas beatdown par défaut — ne dive pas un frontline stacké; joue disengage et scale."
    if vectors.get("lane_tempo", 0) >= 60:
        return "Tu es beatdown : force les trades gagnants, crash la wave, punis le reset adverse, prends Herald avant 14."
    if vectors.get("skirmish_snowball", 0) >= 55:
        return "Tu es beatdown : invade/skirmish avec prio, convertis un kill jgl en objectif (kill → plate → vision)."
    return "Tu es beatdown : raccourcis la game — objectifs > kills, finis avant le spike scale ennemi."


def control_play(role: str, vectors: dict[str, float]) -> str:
    if role == "beatdown":
        return "Si tu perds l'early, tu deviens control par défaut — farm safe, refuse les fights, cherche scale side."
    if vectors.get("hyper_scale", 0) >= 60:
        return "Tu es control : laisse l'adversaire overcommit, farm la wave, win à 3 items + front peel."
    if vectors.get("fight_reset", 0) >= 55:
        return "Tu es control : prolonge le fight, survive le burst, win la extended trade."
    return "Tu es control : outvalue, vision profonde, punis le beatdown qui crash sans info."


def build_summary(
    name: str,
    role: str,
    beatdown: float,
    control: float,
    gb: float,
    vectors: dict[str, float],
    mtg: dict,
    misidentify: str,
) -> str:
    identity = mtg.get("identity") or "—"
    dom = mtg.get("dominant") or []
    dom_txt = "/".join(dom) if dom else identity
    vec_txt = ", ".join(VECTOR_LABELS.get(k, k) for k, _ in sorted(vectors.items(), key=lambda x: -x[1])[:3])
    risk = {
        "low": "Rôle clair — peu de risque de misread (Flores).",
        "medium": "Attention au misread : ce champion peut sembler control/beatdown selon le draft.",
        "high": "Flex — tu DOIS lire le matchup (Who's the Beatdown) chaque game.",
    }[misidentify]
    levers = vec_txt or "contribution d'équipe"
    return (
        f"{name} : {ROLE_LABELS[role]}. Identité MTG {dom_txt} "
        f"(beatdown {beatdown:.0f} · control {control:.0f} · game-breaker {gb:.0f}). "
        f"Leviers : {levers}. {risk}"
    )


def analyze_champion(champ: dict, mtg_map: dict) -> dict:
    name = champ["name"]
    tags = all_tags(champ)
    text = ability_blob(champ)
    dp = champ.get("draftProfile") or {}
    fam = family_of(champ)
    mtg = mtg_map.get(name) or {}

    beatdown = mtg_scores(mtg)[0] + FAMILY_BEATDOWN.get(fam, 8)
    control = mtg_scores(mtg)[1] + FAMILY_CONTROL.get(fam, 8)

    if tags & {"early", "lane_bully", "all_in"}:
        beatdown += 12
    if tags & {"scaling", "hypercarry", "late"}:
        control += 14
    if tags & {"poke", "disengage", "peel"}:
        control += 8
    if tags & {"dive", "assassin", "engage"}:
        beatdown += 8
    if dp.get("tankWeight", 0) > 0.7:
        control += 6
    if dp.get("dpsWeight", 0) > 0.7 and dp.get("squishy"):
        beatdown += 5
        control += 5

    beatdown = clamp(beatdown)
    control = clamp(control)
    vectors = score_vectors(champ, tags, text, dp)
    role = assign_role(beatdown, control, vectors)
    misidentify = misidentify_risk(role, beatdown, control, vectors)
    gb = game_breaker_score(vectors, beatdown, control, name)

    top_vectors = sorted(vectors.keys(), key=lambda k: -vectors[k])[:4]
    analysis = {
        "framework": "Who's the Beatdown (Mike Flores / MTG) + tempo map",
        "beatdownRole": role,
        "beatdownScore": round(beatdown),
        "controlScore": round(control),
        "gameBreakerScore": round(gb),
        "gameBreakerVectors": top_vectors,
        "misidentifyRisk": misidentify,
        "mtgIdentity": mtg.get("identity"),
        "winCondition": win_condition(role, vectors, fam),
        "ifBeatdown": beatdown_play(role, vectors),
        "ifControl": control_play(role, vectors),
        "summary": build_summary(name, role, beatdown, control, gb, vectors, mtg, misidentify),
    }
    return analysis


def assign_tiers(scores: list[tuple[str, float]]) -> dict[str, str]:
    ranked = sorted(scores, key=lambda x: (-x[1], x[0]))
    n = len(ranked)
    cuts = [
        max(1, round(n * 0.12)),
        max(2, round(n * 0.28)),
        max(3, round(n * 0.52)),
        max(4, round(n * 0.78)),
    ]
    out: dict[str, str] = {}
    for i, (name, score) in enumerate(ranked):
        if score < 38:
            tier = "D"
        elif i < cuts[0]:
            tier = "S"
        elif i < cuts[1]:
            tier = "A"
        elif i < cuts[2]:
            tier = "B"
        elif i < cuts[3]:
            tier = "C"
        else:
            tier = "D"
        out[name] = tier
    return out


def build_all(champions: list[dict], mtg_map: dict) -> dict:
    analyses: dict[str, dict] = {}
    scores: list[tuple[str, float]] = []
    for champ in champions:
        a = analyze_champion(champ, mtg_map)
        analyses[champ["name"]] = a
        scores.append((champ["name"], a["gameBreakerScore"]))
    tiers = assign_tiers(scores)
    for name, a in analyses.items():
        tier = tiers[name]
        a["gameBreakerTier"] = tier
    return {
        "version": "beatdown-v2",
        "scope": (
            "Tier list par potentiel game-breaker — framework Who's the Beatdown (Mike Flores / MTG) "
            "et conversion tempo map. Pas une tier pro patch."
        ),
        "tierNotes": TIER_NOTES,
        "vectorLabels": VECTOR_LABELS,
        "roleLabels": ROLE_LABELS,
        "champions": analyses,
        "assignments": {n: a["gameBreakerTier"] for n, a in analyses.items()},
    }


def analyze_champions_file(
    champions_path: Path | None = None,
    mtg_path: Path | None = None,
) -> dict:
    champions_path = champions_path or ROOT / "data" / "champions.json"
    mtg_path = mtg_path or ROOT / "data" / "mtg-colors.json"
    payload = load_json(champions_path)
    mtg_map = load_json(mtg_path).get("champions") or {}
    return build_all(payload.get("champions") or [], mtg_map)
