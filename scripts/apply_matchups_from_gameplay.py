#!/usr/bin/env python3
"""Calcule bestCounters, bestPairings et matchupProfile depuis lol-champions-gameplay.md."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURATED_JSON = ROOT / "scripts" / "curated_matchups.json"
GAMEPLAY_MD = Path.home() / ".cursor" / "skills" / "League-of-Legends" / "lol-champions-gameplay.md"
FAMILIES_JSON = Path.home() / ".cursor" / "skills" / "League-of-Legends" / "champion_families.json"
LOLALYTICS_JSON = ROOT / "data" / "lolalytics.json"
CHAMPIONS_JSON = ROOT / "data" / "champions.json"
PUBLIC_CHAMPIONS = ROOT / "public" / "data" / "champions.json"
TACTICS_META = ROOT / "public" / "data" / "tactics-meta.json"
PUBLIC_TACTICS = ROOT / "data" / "tactics-meta.json"


@dataclass
class GameplaySection:
    name: str
    slug: str
    roles: list[str] = field(default_factory=list)
    attack_kind: str = "melee"
    attack_range: int = 125
    damage: int = 5
    tankiness: int = 5
    utility: int = 5
    difficulty: int = 5
    ability_text: str = ""
    ally_tips: list[str] = field(default_factory=list)
    enemy_tips: list[str] = field(default_factory=list)


def parse_gameplay_md(path: Path) -> dict[str, GameplaySection]:
    text = path.read_text(encoding="utf-8")
    blocks = re.split(r"\n---\n", text)
    out: dict[str, GameplaySection] = {}

    for block in blocks:
        name_m = re.search(r"^## (.+)$", block, re.M)
        if not name_m:
            continue
        name = name_m.group(1).strip()
        if name == "Table des matières":
            continue

        slug_m = re.search(r'<a id="([^"]+)"></a>', block)
        slug = slug_m.group(1) if slug_m else name.lower()

        roles_m = re.search(r"\*\*Rôles :\*\* (.+)", block)
        roles = [r.strip() for r in roles_m.group(1).split(",")] if roles_m else []

        attack_m = re.search(r"\*\*Type d'attaque :\*\* (.+)", block)
        attack_kind = "ranged"
        attack_range = 550
        if attack_m:
            atk = attack_m.group(1)
            if "Corps à corps" in atk or "corps à corps" in atk:
                attack_kind = "melee"
            rng = re.search(r"\((\d+)\s*unit", atk)
            if rng:
                attack_range = int(rng.group(1))

        prof_m = re.search(
            r"Dégâts (\d+) \| Tankiness (\d+) \| Utilité magique (\d+) \| Difficulté (\d+)",
            block,
        )
        damage, tankiness, utility, difficulty = 5, 5, 5, 5
        if prof_m:
            damage, tankiness, utility, difficulty = map(int, prof_m.groups())

        tips_ally: list[str] = []
        tips_enemy: list[str] = []
        ally_m = re.search(r"### Conseils de jeu\n(.*?)(?=### Jouer contre|\Z)", block, re.S)
        if ally_m:
            tips_ally = [
                ln.strip()[2:].strip()
                for ln in ally_m.group(1).splitlines()
                if ln.strip().startswith("- ")
            ]
        enemy_m = re.search(r"### Jouer contre\n(.*?)(?=\Z)", block, re.S)
        if enemy_m:
            tips_enemy = [
                ln.strip()[2:].strip()
                for ln in enemy_m.group(1).splitlines()
                if ln.strip().startswith("- ")
            ]

        ability_parts: list[str] = []
        pass_m = re.search(r"### Passif\n\n\*\*(.+?)\*\* — (.+?)(?=\n\n###|\Z)", block, re.S)
        if pass_m:
            ability_parts.append(pass_m.group(2))
        for ab in re.finditer(
            r"#### [QWER] — .+?\n\n(.+?)(?=\n\n- \*\*Coût|\n\n####|\n\n###|\Z)",
            block,
            re.S,
        ):
            ability_parts.append(ab.group(1).strip())

        out[name] = GameplaySection(
            name=name,
            slug=slug,
            roles=roles,
            attack_kind=attack_kind,
            attack_range=attack_range,
            damage=damage,
            tankiness=tankiness,
            utility=utility,
            difficulty=difficulty,
            ability_text=" ".join(ability_parts),
            ally_tips=tips_ally,
            enemy_tips=tips_enemy,
        )
    return out


def load_families_meta() -> dict:
    if not FAMILIES_JSON.exists():
        return {"families": {}, "compTypes": {}, "championOverrides": {}}
    return json.loads(FAMILIES_JSON.read_text(encoding="utf-8"))


JUNGLE_INVADERS = frozenset({
    "Lee Sin", "Elise", "Nidalee", "Graves",
    "Rek'Sai", "Shaco", "Bel'Veth",
})

MAGE_BURST = frozenset({
    "Annie", "Lux", "Mel", "Zoe", "Aurora", "Kennen", "Sylas", "Lissandra",
    "Syndra", "Neeko", "Rumble", "Brand", "Xerath",
})

MAGE_ZONE = frozenset({
    "Anivia", "Aurelion Sol", "Azir", "Cassiopeia", "Heimerdinger",
    "Hwei", "Lillia", "Malzahar", "Orianna", "Ryze", "Swain", "Veigar",
    "Vel'Koz", "Vex", "Viktor", "Vladimir", "Ziggs",
})


def infer_family_key(name: str, prof: dict) -> str:
    """Heuristique si pas d'override explicite."""
    roles = set(prof.get("roles", []))
    tags = prof.get("tags", set())
    traits = prof.get("traits", {})

    if name in {"Gangplank", "Quinn", "Teemo", "Jayce", "Singed", "Heimerdinger"}:
        return "ovni"
    if "Tank" in roles:
        if name in {
            "Braum", "Poppy", "Tahm Kench", "Gragas", "Morgana", "Taric",
            "K'Santé", "Dr. Mundo", "Maokai", "Cho'Gath",
        }:
            return "tank_disengage"
        return "tank_engage"
    if "Support" in roles:
        if "enchanter" in tags or (traits.get("shield") and traits.get("heal")):
            return "support_enchanter"
        if name in {"Brand", "Zyra", "Vel'Koz", "Xerath"} and prof.get("attack_range", 0) >= 500:
            return "support_poke"
        if name in {"Braum", "Taric", "Morgana", "Poppy"}:
            return "support_disengage"
        return "support_engage"
    if "Assassin" in roles or "assassin" in tags:
        return "assassin_ap_pick" if prof.get("mage") else "assassin_ad_pick"
    if "Marksman" in roles:
        if name in {"Kog'Maw", "Jinx", "Twitch", "Vayne", "Aphelios", "Smolder", "Kayle", "Zeri"}:
            return "adc_hypercarry"
        if name in {"Lucian", "Samira", "Draven", "Kalista", "Nilah", "Miss Fortune"}:
            return "adc_short_allin"
        if prof.get("attack_range", 0) >= 550 and name in {"Caitlyn", "Varus", "Ezreal", "Jhin", "Ashe", "Senna", "Corki"}:
            return "adc_poke"
        return "adc_tempo"
    if "Mage" in roles:
        if name in MAGE_BURST:
            return "mage_dps"
        if name in MAGE_ZONE:
            return "mage_control"
        if prof.get("utility", 0) >= 7 and prof.get("attack_range", 0) >= 500:
            return "mage_control"
        if prof.get("damage", 0) >= 8 and prof.get("utility", 0) <= 4:
            return "mage_dps"
        return "mage_control"
    if "Fighter" in roles:
        if name in {
            "Fiora", "Camille", "Jax", "Tryndamere", "Yorick", "Nasus", "Trundle", "Irelia", "Aatrox"
        } and prof.get("traits", {}).get("mobility"):
            if name in {"Fiora", "Camille", "Jax", "Tryndamere", "Yorick", "Nasus", "Trundle"}:
                return "bruiser_split"
        return "bruiser_teamfight"
    if name in {"Karthus", "Twisted Fate", "Nocturne", "Pantheon", "Taliyah", "Galio", "Shen", "Bard"}:
        return "global_pick"
    if "Jungle" in str(roles):
        return "jungle_offensive" if name in JUNGLE_INVADERS else "jungle_defensive"
    return "bruiser_teamfight"


def resolve_jungle_family(name: str, family_key: str, meta: dict) -> str:
    """Jungle = invader (offensif) ou tout le reste (défensif)."""
    if family_key in {"jungle_offensive", "jungle_defensive", "jungle_hypercarry"}:
        invaders = set(meta.get("jungleInvaders", [])) or JUNGLE_INVADERS
        return "jungle_offensive" if name in invaders else "jungle_defensive"
    return family_key


def resolve_comp_types(name: str, family_key: str, meta: dict) -> list[str]:
    """Max 2 comp types — dual list explicite ou override single, sinon défaut family."""
    dual = meta.get("championDualCompTypes", {})
    if name in dual:
        return list(dual[name])[:2]

    comp_over = meta.get("championCompTypes", {})
    if name in comp_over:
        return [comp_over[name]]

    fam = meta.get("families", {}).get(family_key, {})
    types = list(fam.get("compTypes", []))[:1]
    return types if types else ["lane_tempo"]


def normalize_lol_text(text: str) -> str:
    """Normalise uniquement le vocabulaire LoL en anglais — le reste reste en français."""
    if not text:
        return text
    repl = (
        ("contre-engage", "disengage"),
        ("contre engage", "disengage"),
        ("tourelles", "towers"),
        ("tourelle", "tower"),
        ("objectifs majeurs", "major objectives"),
        ("objectifs", "objectives"),
        ("objectif", "objective"),
        ("portée", "range"),
        ("mobilité", "mobility"),
        ("corps à corps", "melee"),
        ("à distance", "ranged"),
        ("ultime", "ult"),
        ("Ultime", "Ult"),
        ("sbires", "minions"),
        ("cible fragile", "squishy"),
        ("anti-soin", "anti-heal"),
        ("mélée", "melee"),
        ("mêlée", "melee"),
        ("même comp", "same comp"),
    )
    out = text
    for fr, en in repl:
        out = out.replace(fr, en)
    return out


def assign_champion_family(name: str, prof: dict, meta: dict) -> dict:
    overrides = meta.get("championOverrides", {})
    families = meta.get("families", {})
    comp_types_meta = meta.get("compTypes", {})
    raw_key = overrides.get(name) or infer_family_key(name, prof)
    key = resolve_jungle_family(name, raw_key, meta)
    fam = families.get(key, families.get(raw_key, {}))
    comp_keys = resolve_comp_types(name, key, meta)
    comp_labels = [comp_types_meta.get(c, {}).get("label", c) for c in comp_keys]
    return {
        "key": key,
        "label": normalize_lol_text(fam.get("label", key.replace("_", " ").title())),
        "role": fam.get("role", ""),
        "subfamily": fam.get("subfamily", ""),
        "compTypes": comp_keys,
        "compTypeLabels": [normalize_lol_text(l) for l in comp_labels],
        "macroEarly": normalize_lol_text(fam.get("macroEarly", "")),
        "macroMid": normalize_lol_text(fam.get("macroMid", "")),
        "teamfightPlan": normalize_lol_text(fam.get("teamfight", "")),
    }


def spell_traits(text: str) -> dict[str, bool]:
    t = text.lower()
    return {
        "cc": bool(re.search(r"étourdi|étourdit|charme|immobilis|enracin|supprime|effraie|silenc", t)),
        "knockup": bool(re.search(r"projet|en l'air|airborne", t)),
        "root": bool(re.search(r"enracin|immobilis", t)),
        "slow": bool(re.search(r"ralentit|ralentiss", t)),
        "mobility": bool(re.search(r"dash|bond|saut|charge|glisse|ruée|bondit|téléport|rush|se rue", t)),
        "invis": bool(re.search(r"invisible|stealth|camouflage|fumée", t)),
        "shield": bool(re.search(r"bouclier|shield", t)),
        "heal": bool(re.search(r"soin|soigne|heal|régén|restaure", t)),
        "aoe": bool(re.search(r"zone|cercle|tous les ennemis|cone|cône|rayon", t)),
        "poke": bool(re.search(r"distance|ligne|projectile|lance", t)),
        "anti_heal": bool(re.search(r"anti-soin|anti-soins|blessures graves", t)),
        "execute": bool(re.search(r"exécute|exécut|seuil", t)),
        "spell_shield": bool(re.search(r"anti-magie|rideau de feu|sceau", t)),
        "percent_hp": bool(re.search(r"% des pv|% pv|pourcentage.*vie|pv max|points de vie max", t)),
        "untargetable": bool(re.search(r"intouchable|invuln|invulnér|inattaquable", t)),
        "revive": bool(re.search(r"ressuscit|revive|zombie|revient à la vie", t)),
        "dash_block": bool(re.search(r"anti-dash|interrompt.*dash|empêche.*dash|mur|bloque.*dash", t)),
        "pull": bool(re.search(r"tire|attire|ramène|traction", t)),
        "disengage": bool(re.search(r"repousse|recule|disengage|contre-engage|repouss", t)),
    }


def build_profile(gp: GameplaySection) -> dict:
    text = gp.ability_text
    traits = spell_traits(text)
    roles = set(gp.roles)

    squishy = gp.tankiness <= 4
    tanky = gp.tankiness >= 7 or "Tank" in roles
    super_tank = gp.tankiness >= 8 and "Tank" in roles

    tags: set[str] = set()
    if "Marksman" in roles:
        tags.update({"marksman", "scaling", "dps"})
    if "Assassin" in roles:
        tags.update({"assassin", "pick"})
    if "Mage" in roles:
        tags.update({"mage", "burst"})
    if "Tank" in roles:
        tags.update({"frontline", "engage"})
    if "Fighter" in roles:
        tags.update({"fighter", "frontline"})
    if "Support" in roles:
        tags.update({"support", "peel"})
    if gp.attack_range >= 500:
        tags.add("ranged")
    if gp.attack_kind == "melee":
        tags.add("melee")
    if gp.damage >= 7:
        tags.add("high_damage")
    if gp.damage <= 4 and gp.utility >= 6:
        tags.add("enchanter")
    if gp.utility >= 7:
        tags.add("utility")
    if traits["cc"] or traits["knockup"]:
        tags.add("cc")
    if traits["knockup"]:
        tags.add("knockup")
    if traits["mobility"]:
        tags.add("mobility")
    if traits["invis"]:
        tags.add("stealth")
    if traits["aoe"]:
        tags.add("aoe")
    if traits["shield"] or traits["heal"]:
        tags.add("peel")
    if traits["anti_heal"]:
        tags.add("anti_heal")
    if traits["execute"]:
        tags.add("execute")
    if traits["percent_hp"]:
        tags.add("percent_hp")
    if traits["dash_block"]:
        tags.add("anti_mobility")
    if traits["disengage"]:
        tags.add("disengage")
    if gp.damage >= 6 and gp.tankiness <= 5 and traits["mobility"]:
        tags.add("dive")

    ally_blob = " ".join(gp.ally_tips).lower()
    if "immobilis" in ally_blob or "contrôle de foule" in ally_blob or "cc" in ally_blob:
        tags.add("wants_cc_ally")
    if "allié" in ally_blob and ("protég" in ally_blob or "bouclier" in ally_blob):
        tags.add("wants_peel")

    return {
        "name": gp.name,
        "roles": list(roles),
        "tags": tags,
        "traits": traits,
        "attack_kind": gp.attack_kind,
        "attack_range": gp.attack_range,
        "damage": gp.damage,
        "tankiness": gp.tankiness,
        "utility": gp.utility,
        "difficulty": gp.difficulty,
        "squishy": squishy,
        "tanky": tanky,
        "super_tank": super_tank,
        "assassin": "Assassin" in roles,
        "mage": "Mage" in roles,
        "marksman": "Marksman" in roles,
        "fighter": "Fighter" in roles,
        "support": "Support" in roles,
        "ally_tips": gp.ally_tips,
        "enemy_tips": gp.enemy_tips,
        "ability_text": text,
    }


def tip_match_counter(attacker: dict, defender: dict) -> float:
    """Score bonus si le profil de l'attaquant exploite les conseils « Jouer contre » du défenseur."""
    s = 0.0
    for tip in defender.get("enemy_tips", []):
        tl = tip.lower()

        if ("esquiv" in tl or "prévisib" in tl) and attacker["traits"]["mobility"]:
            s += 6
        if ("distance" in tl or "loin" in tl or "derrière" in tl) and attacker["attack_range"] >= defender["attack_range"] + 100:
            s += 8
        if ("ult" in tl or "ultime" in tl) and attacker["damage"] >= 6:
            s += 5
        if ("immobilis" in tl or "étourdi" in tl or "enracin" in tl) and attacker["traits"]["cc"]:
            s += 7
        if ("bouclier" in tl or "type de dégâts" in tl) and attacker["traits"]["anti_heal"]:
            s += 6
        if "silence" in tl and attacker["traits"]["cc"]:
            s += 4
        if ("group" in tl or "regroup" in tl) and attacker["traits"]["aoe"]:
            s += 5
        if ("fui" in tl or "fuir" in tl or "échapp" in tl) and attacker["traits"]["root"]:
            s += 6
        if "soin" in tl and attacker["traits"]["anti_heal"]:
            s += 8
        if ("invisible" in tl or "fumée" in tl) and defender["traits"]["invis"] and attacker["traits"]["aoe"]:
            s += 5
        if "sbires" in tl and attacker["attack_range"] >= 500:
            s += 3
    return s


def tip_match_synergy(a: dict, b: dict) -> float:
    """Score bonus si B complète les conseils « Conseils de jeu » de A (données MD)."""
    s = 0.0
    blob = " ".join(a.get("ally_tips", [])).lower()

    if ("immobilis" in blob or "contrôle de foule" in blob or "effets immobilisants" in blob):
        if b["traits"]["cc"] or b["traits"]["knockup"] or b["traits"]["root"]:
            s += 12
    if ("combo" in blob or "facilitez" in blob or "préparer" in blob) and b["traits"]["cc"]:
        s += 8
    if ("protég" in blob or "bouclier" in blob or "save" in blob) and (b["traits"]["shield"] or b["traits"]["heal"]):
        s += 10
    if ("engage" in blob or "forcer le combat" in blob or "initiez" in blob):
        if b["tanky"] or b["traits"]["cc"] or "Tank" in b["roles"]:
            s += 8
    if ("distance" in blob or "poke" in blob) and b["attack_range"] >= 500:
        s += 5
    if ("allié" in blob or "équipe" in blob) and b["utility"] >= 6:
        s += 4
    return s


def counter_score(attacker: dict, defender: dict) -> float:
    """Score positif = l'attaquant bat le défenseur (analyse MD uniquement)."""
    s = 0.0
    at, de = attacker, defender

    # Profil MD : portée vs mélée fragile
    if at["attack_range"] >= 500 and de["attack_kind"] == "melee" and de["squishy"]:
        s += 10 + max(0, (at["attack_range"] - de["attack_range"]) // 80)
    if at["attack_range"] > de["attack_range"] + 150 and de["squishy"]:
        s += 8

    # Assassin / mobilité vs cible fragile
    if at["assassin"] or ("assassin" in at["tags"] and at["traits"]["mobility"]):
        if de["squishy"]:
            s += 14
        if de["marksman"] or (de["mage"] and de["squishy"]):
            s += 10
        if at["traits"]["invis"] and de["squishy"]:
            s += 8

    # CC vs mobilité (sorts MD)
    if (at["traits"]["cc"] or at["traits"]["root"]) and de["traits"]["mobility"]:
        s += 12
    if at["traits"]["knockup"] and de["traits"]["mobility"] and de["assassin"]:
        s += 10

    # Silence / anti-mage vs mage
    if at["traits"]["cc"] and de["mage"] and "silenc" in at["ability_text"].lower():
        s += 14
    if at["traits"]["spell_shield"] and de["mage"]:
        s += 6

    # Tank / frontline vs burst fragile
    if at["tanky"] and de["squishy"] and de["damage"] >= 6:
        s += 10
    if at["tanky"] and de["assassin"]:
        s += 8
    if at["fighter"] and de["assassin"] and at["tankiness"] >= de["tankiness"]:
        s += 8

    # Dégâts soutenus vs super tank (profil MD)
    if (at["marksman"] or at["damage"] >= 7) and de["super_tank"]:
        s += 10
    if at["traits"]["execute"] and de["tanky"]:
        s += 10

    # Anti-soin vs sustain MD
    if at["traits"]["anti_heal"] and de["traits"]["heal"]:
        s += 12

    # AOE vs regroup (mentionné dans tips ou sorts)
    if at["traits"]["aoe"] and de["utility"] >= 6 and de["support"]:
        s += 6

    # %PV / execute vs tanks & bruisers sustain
    if at["traits"]["percent_hp"] and (de["tanky"] or de["super_tank"]):
        s += 16
    if at["traits"]["execute"] and de["tanky"] and de["traits"]["heal"]:
        s += 8

    # Anti-mobility kit vs dash-heavy
    if at["traits"]["dash_block"] and de["traits"]["mobility"]:
        s += 14
    if at["traits"]["root"] and de["traits"]["mobility"] and de["fighter"]:
        s += 10
    if at["traits"]["slow"] and de["attack_kind"] == "melee" and not de["tanky"]:
        s += 8

    # Pull / catch vs immobile squishy
    if at["traits"]["pull"] and de["squishy"] and not de["traits"]["mobility"]:
        s += 10

    # AOE reveal / zone vs stealth
    if at["traits"]["aoe"] and de["traits"]["invis"]:
        s += 10
    if at["traits"]["cc"] and de["traits"]["invis"]:
        s += 8

    # Burst mage vs enchanter (kill before peel)
    if at["mage"] and at["damage"] >= 7 and de["support"] and "enchanter" in de["tags"]:
        s += 12

    # Disengage/peel vs all-in dive
    if at["traits"]["disengage"] and de["traits"]["mobility"] and de["damage"] >= 7:
        s += 8
    if "disengage" in at["tags"] and ("dive" in de["tags"] or de["assassin"]):
        s += 10

    # Tank frontline absorbs burst from squishy DPS
    if at["super_tank"] and de["marksman"] and de["damage"] >= 7:
        s += 6

    # Long range vs short range all-in before items
    if at["attack_range"] >= 550 and de["attack_range"] <= 175 and de["damage"] >= 6:
        s += 8

    # Difficulté / skill ceiling — légère pénalité si défenseur très difficile et attaquant simple poke
    if de["difficulty"] >= 7 and at["difficulty"] <= 4 and at["attack_range"] >= 500:
        s += 4

    s += tip_match_counter(at, de)
    return s


def synergy_score(a: dict, b: dict) -> float:
    """Score de synergie entre A et B (analyse MD uniquement)."""
    s = 0.0

    # Peel / utility + carry MD
    if (a["traits"]["shield"] or a["traits"]["heal"] or ("enchanter" in a["tags"]) or a["support"]):
        if b["marksman"] or (b["damage"] >= 7 and b["squishy"]):
            s += 16
    if (b["traits"]["shield"] or b["traits"]["heal"] or ("enchanter" in b["tags"]) or b["support"]):
        if a["marksman"] or (a["damage"] >= 7 and a["squishy"]):
            s += 16

    # Frontline + backline (profils MD)
    if a["tanky"] and (b["marksman"] or b["mage"]) and b["squishy"]:
        s += 14
    if b["tanky"] and (a["marksman"] or a["mage"]) and a["squishy"]:
        s += 14

    # CC setup + burst (sorts MD)
    if (a["traits"]["cc"] or a["traits"]["knockup"]) and (b["damage"] >= 7 or b["assassin"]):
        s += 14
    if (b["traits"]["cc"] or b["traits"]["knockup"]) and (a["damage"] >= 7 or a["assassin"]):
        s += 14

    # Conseils de jeu explicites
    s += tip_match_synergy(a, b)
    s += tip_match_synergy(b, a)

    # Complémentarité de rôles MD
    if a["mage"] and b["fighter"] and b["tanky"]:
        s += 8
    if b["mage"] and a["fighter"] and a["tanky"]:
        s += 8
    if "wants_cc_ally" in a["tags"] and (b["traits"]["cc"] or b["traits"]["knockup"]):
        s += 10
    if "wants_cc_ally" in b["tags"] and (a["traits"]["cc"] or a["traits"]["knockup"]):
        s += 10
    if "wants_peel" in a["tags"] and ("peel" in b["tags"] or b["traits"]["shield"]):
        s += 10
    if "wants_peel" in b["tags"] and ("peel" in a["tags"] or a["traits"]["shield"]):
        s += 10

    # Poke double (profil distance MD)
    if a["attack_range"] >= 500 and b["attack_range"] >= 500 and a["mage"] and b["mage"]:
        s += 6

    # Global / TP synergy
    if a["traits"].get("mobility") and b["name"] in {
        "Shen", "Twisted Fate", "Galio", "Pantheon", "Taliyah", "Nocturne", "Karthus"
    } or b["traits"].get("mobility") and a["name"] in {
        "Shen", "Twisted Fate", "Galio", "Pantheon", "Taliyah", "Nocturne", "Karthus"
    }:
        s += 10

    # Knockup + knockup follow (Yasuo/Yone style)
    if a["traits"]["knockup"] and b["traits"]["knockup"]:
        s += 12
    if a["traits"]["knockup"] and "wombo" in prof_themes(b):
        s += 8
    if b["traits"]["knockup"] and "wombo" in prof_themes(a):
        s += 8

    # Reset / revive sustain
    if a["traits"]["revive"] and (b["marksman"] or b["tanky"]):
        s += 14
    if b["traits"]["revive"] and (a["marksman"] or a["tanky"]):
        s += 14

    # Disengage + poke backline
    if "disengage" in a["tags"] and b["attack_range"] >= 500:
        s += 8
    if "disengage" in b["tags"] and a["attack_range"] >= 500:
        s += 8

    # Surcharge même rôle fragile
    if a["marksman"] and b["marksman"]:
        s -= 12
    if a["assassin"] and b["assassin"]:
        s -= 8
    if a["mage"] and b["mage"] and a["squishy"] and b["squishy"]:
        s -= 6

    return s


PREVIEW_COUNT = 5
FULL_LIST_MAX = 40
INFER_SYNERGY_MIN = 16.0
INFER_COUNTER_MIN = 16.0
CURATED_SCORE = 100.0

FAMILY_PAIR_BONUS: list[tuple[str, str, float]] = [
    ("support_enchanter", "adc_hypercarry", 38),
    ("support_enchanter", "adc_tempo", 22),
    ("support_disengage", "mage_control", 28),
    ("support_disengage", "adc_poke", 26),
    ("support_engage", "adc_short_allin", 32),
    ("support_engage", "assassin_ad_pick", 24),
    ("tank_engage", "mage_control", 22),
    ("tank_engage", "mage_dps", 18),
    ("jungle_defensive", "adc_hypercarry", 20),
    ("jungle_defensive", "mage_control", 18),
    ("jungle_offensive", "assassin_ad_pick", 22),
    ("bruiser_split", "global_pick", 24),
    ("global_pick", "assassin_ap_pick", 20),
    ("support_engage", "bruiser_teamfight", 18),
    ("tank_engage", "adc_hypercarry", 16),
    ("mage_control", "adc_poke", 20),
    ("support_poke", "mage_control", 18),
    ("jungle_offensive", "mage_dps", 16),
]

# Attaquant family → défenseur family (directionnel)
FAMILY_COUNTER_BONUS: list[tuple[str, str, float, str]] = [
    ("adc_poke", "bruiser_teamfight", 28, "Kite range vs bruiser melee"),
    ("adc_poke", "tank_engage", 24, "Poke before engage connects"),
    ("adc_poke", "bruiser_split", 20, "Range punishes split attempts"),
    ("mage_control", "bruiser_teamfight", 26, "CC + poke vs front-to-front"),
    ("mage_control", "assassin_ad_pick", 22, "Hard CC locks assassin"),
    ("mage_control", "assassin_ap_pick", 22, "Zone control vs dive"),
    ("mage_control", "jungle_offensive", 18, "CC stops invades/ganks"),
    ("assassin_ad_pick", "adc_hypercarry", 34, "Flank deletes backline"),
    ("assassin_ad_pick", "adc_tempo", 26, "Burst before peel items"),
    ("assassin_ad_pick", "support_enchanter", 24, "Kill enchanter before peel"),
    ("assassin_ap_pick", "adc_hypercarry", 30, "AP burst through weak MR early"),
    ("assassin_ap_pick", "mage_dps", 22, "Outburst squishy mage"),
    ("tank_disengage", "tank_engage", 28, "Disengage punishes forced engage"),
    ("support_disengage", "support_engage", 26, "Counter-engage vs all-in bot"),
    ("support_disengage", "adc_short_allin", 24, "Peel vs short-range all-in"),
    ("support_disengage", "assassin_ad_pick", 22, "Anti-dive tools vs assassin"),
    ("tank_engage", "assassin_ad_pick", 24, "Frontline absorbs assassin burst"),
    ("tank_engage", "assassin_ap_pick", 20, "Stack MR/HP vs AP burst"),
    ("bruiser_teamfight", "assassin_ad_pick", 20, "Bruiser wins extended trade"),
    ("bruiser_teamfight", "assassin_ap_pick", 18, "Survives burst then wins"),
    ("adc_hypercarry", "tank_engage", 24, "%HP DPS vs mega frontline"),
    ("adc_hypercarry", "bruiser_teamfight", 20, "Kite bruiser with items"),
    ("adc_hypercarry", "tank_disengage", 18, "Out-DPS disengage comp late"),
    ("global_pick", "bruiser_split", 30, "Collapse side with global"),
    ("global_pick", "ovni", 20, "Cross-map punishes unique plans"),
    ("jungle_offensive", "jungle_defensive", 22, "Invade punishes full clear"),
    ("jungle_offensive", "jungle_hypercarry", 26, "Early pressure vs farm jungler"),
    ("adc_short_allin", "adc_hypercarry", 24, "Lane all-in before scale"),
    ("mage_dps", "support_enchanter", 20, "Burst through before peel"),
    ("mage_dps", "adc_hypercarry", 18, "AP burst vs immobile ADC"),
    ("bruiser_split", "mage_control", 16, "Side pressure bypasses control mage"),
    ("ovni", "mage_control", 14, "Unusual patterns dodge standard control"),
    ("support_poke", "support_enchanter", 18, "Poke wins lane vs enchanter"),
    ("jungle_defensive", "assassin_ad_pick", 16, "Peel jungler vs assassin meta"),
]

COMP_TYPE_COUNTER_BONUS: list[tuple[str, str, float, str]] = [
    ("poke_disengage", "teamfight_engage", 22, "Siege/disengage vs forced 5v5"),
    ("poke_disengage", "all_in", 20, "Poke then reset vs all-in"),
    ("poke_siege", "teamfight_engage", 18, "Tower poke vs engage comp"),
    ("pick_global", "hypercarry", 20, "Pick before carry scales"),
    ("pick_global", "split_push", 18, "Collapse side with numbers"),
    ("all_in", "hypercarry", 22, "Early snowball vs scaling ADC"),
    ("lane_tempo", "hypercarry", 18, "Tempo before 3 items"),
    ("split_push", "teamfight_engage", 16, "Avoid 5v5, punish grouping"),
    ("hypercarry", "all_in", 14, "Scale wins if survives lane (late counter)"),
]

COMP_TYPE_SYNERGY_PENALTY = 18.0


def build_name_resolver(champs: list[dict]) -> dict[str, str]:
    """Résout noms EN / clés Riot vers le nom FR affiché dans l'app."""
    resolver: dict[str, str] = {}
    for c in champs:
        fr = c["name"]
        resolver[fr] = fr
        if c.get("nameEn"):
            resolver[c["nameEn"]] = fr
        if c.get("key"):
            resolver[c["key"]] = fr
    return resolver


def load_curated(resolver: dict[str, str]) -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    """Indexe synergies (bidirectionnel) et counters (defender -> attackers)."""
    raw = json.loads(CURATED_JSON.read_text(encoding="utf-8"))
    synergies: dict[str, list[dict]] = {}
    counters: dict[str, list[dict]] = {}
    skipped = 0

    for entry in raw.get("synergies", []):
        a, b = entry["pair"]
        ra, rb = resolver.get(a), resolver.get(b)
        if not ra or not rb:
            skipped += 1
            continue
        payload = {
            "name": "",
            "score": CURATED_SCORE,
            "reason": normalize_lol_text(entry["reason"]),
            "theme": entry.get("theme", ""),
            "curated": True,
        }
        for champ, partner in ((ra, rb), (rb, ra)):
            item = {**payload, "name": partner}
            synergies.setdefault(champ, []).append(item)

    for entry in raw.get("counters", []):
        defender = resolver.get(entry["defender"])
        attacker = resolver.get(entry["attacker"])
        if not defender or not attacker:
            skipped += 1
            continue
        counters.setdefault(defender, []).append(
            {
                "name": attacker,
                "score": CURATED_SCORE,
                "reason": normalize_lol_text(entry["reason"]),
                "curated": True,
            }
        )
    if skipped:
        print(f"Curated: {skipped} entrées ignorées (nom champion introuvable)")
    return synergies, counters


def load_lolalytics() -> dict[str, dict]:
    path = LOLALYTICS_JSON
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8")).get("champions", {})


def apply_lane_positions(c: dict, lol_entry: dict | None) -> None:
    """Lane rates from internal meta cache (>= 5% playable threshold)."""
    if not lol_entry or not lol_entry.get("laneRates"):
        c["laneRates"] = {}
        c["mainRole"] = None
        c["flexRoles"] = []
        c["optimalSlots"] = []
        c["positions"] = "Lane data unavailable"
        c.pop("positionsSource", None)
        return

    rates = lol_entry["laneRates"]
    main = lol_entry.get("mainRole")
    flex = lol_entry.get("flexRoles") or []
    optimal = lol_entry.get("optimalSlots") or ([main] if main else [])

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


def comp_types_clash(types_a: set[str], types_b: set[str], meta: dict) -> bool:
    """Comp types incompatibles (ex. poke_disengage + all_in)."""
    incompatible = meta.get("incompatiblePairs", [])
    for ta in types_a:
        for tb in types_b:
            if [ta, tb] in incompatible or [tb, ta] in incompatible:
                return True
    return False


def family_synergy_score(
    fam_a: dict,
    fam_b: dict,
    prof_a: dict,
    prof_b: dict,
    base: float,
    meta: dict | None = None,
) -> float:
    score = base
    meta = meta or {}
    types_a = set(fam_a.get("compTypes", []))
    types_b = set(fam_b.get("compTypes", []))
    overlap = types_a & types_b
    if overlap:
        score += 18 + 6 * len(overlap)
    key_a = fam_a.get("key", "")
    key_b = fam_b.get("key", "")
    if key_a == key_b:
        score += 14
    for a, b, bonus in FAMILY_PAIR_BONUS:
        if (key_a == a and key_b == b) or (key_b == a and key_a == b):
            score += bonus
    # Thèmes macro par family (champion_families.json)
    themes_by_fam = meta.get("synergyThemesByFamily", {})
    themes_a = set(themes_by_fam.get(key_a, []))
    themes_b = set(themes_by_fam.get(key_b, []))
    theme_overlap = themes_a & themes_b
    if theme_overlap:
        score += 12 + 4 * len(theme_overlap)
    # Pénalité comp types incompatibles
    if comp_types_clash(types_a, types_b, meta):
        score -= COMP_TYPE_SYNERGY_PENALTY
    return score


def family_counter_score(
    attacker_fam: dict,
    defender_fam: dict,
    attacker: dict,
    defender: dict,
    base: float,
    meta: dict | None = None,
) -> float:
    """Score kit + bonus family/comp type (attaquant bat défenseur)."""
    score = base
    meta = meta or {}
    key_a = attacker_fam.get("key", "")
    key_b = defender_fam.get("key", "")
    types_a = set(attacker_fam.get("compTypes", []))
    types_b = set(defender_fam.get("compTypes", []))

    for a, b, bonus, _reason in FAMILY_COUNTER_BONUS:
        if key_a == a and key_b == b:
            score += bonus

    # Overrides JSON optionnels
    for entry in meta.get("familyCounterPairs", []):
        if len(entry) >= 3 and key_a == entry[0] and key_b == entry[1]:
            score += float(entry[2])

    for comp_a, comp_b, bonus, _reason in COMP_TYPE_COUNTER_BONUS:
        if comp_a in types_a and comp_b in types_b:
            score += bonus

    for entry in meta.get("compTypeCounters", []):
        if len(entry) >= 3 and entry[0] in types_a and entry[1] in types_b:
            score += float(entry[2])

    # Disengage family vs engage family (générique)
    disengage_keys = {"tank_disengage", "support_disengage", "mage_control"}
    engage_keys = {"tank_engage", "support_engage", "bruiser_teamfight", "adc_short_allin"}
    if key_a in disengage_keys and key_b in engage_keys:
        score += 10
    if key_a in {"assassin_ad_pick", "assassin_ap_pick"} and key_b in {"adc_hypercarry", "mage_dps"}:
        score += 8
    if key_a in {"adc_poke", "mage_control"} and key_b == "bruiser_teamfight" and defender["attack_kind"] == "melee":
        score += 6
    if key_a == "global_pick" and key_b == "bruiser_split":
        score += 8

    return score


def merge_sorted_entries(*groups: list[dict], limit: int, profiles: dict[str, dict]) -> list[dict]:
    pool: list[dict] = []
    for group in groups:
        pool.extend(group)
    pool.sort(key=lambda e: (-e.get("score", 0), e.get("name", "")))
    out: list[dict] = []
    seen: set[str] = set()
    for entry in pool:
        n = entry.get("name")
        if not n or n in seen or n not in profiles:
            continue
        seen.add(n)
        out.append(entry)
        if len(out) >= limit:
            break
    return out


def build_pairings(
    name: str,
    profiles: dict[str, dict],
    synergy_matrix: dict[str, dict[str, float]],
    curated_syns: dict[str, list[dict]],
    families: dict[str, dict],
    families_meta: dict,
) -> list[dict]:
    curated = [{**e, "source": "curated"} for e in curated_syns.get(name, []) if e["name"] in profiles]
    prof = profiles[name]
    fam = families.get(name) or assign_champion_family(name, prof, families_meta)
    inferred: list[dict] = []
    curated_names = {e["name"] for e in curated}

    for other, base in synergy_matrix[name].items():
        if other in curated_names or other == name:
            continue
        other_prof = profiles[other]
        other_fam = families.get(other) or assign_champion_family(other, other_prof, families_meta)
        score = family_synergy_score(fam, other_fam, prof, other_prof, base, families_meta)
        if score < INFER_SYNERGY_MIN:
            continue
        types_overlap = set(fam.get("compTypes", [])) & set(other_fam.get("compTypes", []))
        if comp_types_clash(set(fam.get("compTypes", [])), set(other_fam.get("compTypes", [])), families_meta):
            if score < 32:
                continue
        if not infer_synergy_valid(prof, other_prof) and score < 28:
            continue
        if not types_overlap and score < 26:
            continue
        inferred.append(
            {
                "name": other,
                "score": round(score, 1),
                "reason": normalize_lol_text(
                    synergy_reason(prof, other_prof)
                    + (f" · same comp ({', '.join(sorted(types_overlap))[:40]})" if types_overlap else "")
                ),
                "source": "family",
                "theme": next(iter(types_overlap), fam.get("key", "")),
            }
        )

    return merge_sorted_entries(curated, inferred, limit=FULL_LIST_MAX, profiles=profiles)


def build_pairings_with_fallback(
    name: str,
    profiles: dict[str, dict],
    synergy_matrix: dict[str, dict[str, float]],
    curated_syns: dict[str, list[dict]],
    families: dict[str, dict],
    families_meta: dict,
) -> list[dict]:
    result = build_pairings(name, profiles, synergy_matrix, curated_syns, families, families_meta)
    if len(result) >= PREVIEW_COUNT:
        return result

    prof = profiles[name]
    fam = families.get(name) or assign_champion_family(name, prof, families_meta)
    seen = {e["name"] for e in result}
    curated_names = {e["name"] for e in curated_syns.get(name, [])}
    fallback: list[dict] = []
    scored: list[tuple[str, float]] = []
    for other, base in synergy_matrix[name].items():
        if other == name or other in seen or other in curated_names:
            continue
        other_prof = profiles[other]
        other_fam = families.get(other) or assign_champion_family(other, other_prof, families_meta)
        score = family_synergy_score(fam, other_fam, prof, other_prof, base, families_meta)
        scored.append((other, score))
    for other, score in sorted(scored, key=lambda x: (-x[1], x[0])):
        if score < 10:
            continue
        other_prof = profiles[other]
        fallback.append(
            {
                "name": other,
                "score": round(max(score, INFER_SYNERGY_MIN), 1),
                "reason": normalize_lol_text(synergy_reason(prof, other_prof)),
                "source": "family",
            }
        )
        if len(result) + len(fallback) >= PREVIEW_COUNT:
            break
    return merge_sorted_entries(result, fallback, limit=FULL_LIST_MAX, profiles=profiles)


def build_counters(
    name: str,
    profiles: dict[str, dict],
    counter_matrix: dict[str, dict[str, float]],
    curated_ctrs: dict[str, list[dict]],
    families: dict[str, dict],
    families_meta: dict,
) -> list[dict]:
    curated = [{**e, "source": "curated"} for e in curated_ctrs.get(name, []) if e["name"] in profiles]
    inferred: list[dict] = []
    defender = profiles[name]
    defender_fam = families.get(name) or assign_champion_family(name, defender, families_meta)
    curated_names = {e["name"] for e in curated}

    beaten_by: dict[str, float] = {}
    for other in profiles:
        if other == name:
            continue
        attacker = profiles[other]
        attacker_fam = families.get(other) or assign_champion_family(other, attacker, families_meta)
        base = counter_matrix[other][name]
        beaten_by[other] = family_counter_score(
            attacker_fam, defender_fam, attacker, defender, base, families_meta
        )

    for other, score in sorted(beaten_by.items(), key=lambda x: (-x[1], x[0])):
        if other in curated_names:
            continue
        if score < INFER_COUNTER_MIN:
            continue
        attacker = profiles[other]
        attacker_fam = families.get(other) or assign_champion_family(other, attacker, families_meta)
        valid = (
            infer_counter_valid(attacker, defender)
            or infer_counter_valid_family(attacker_fam, defender_fam, attacker, defender)
            or score >= 24
        )
        if not valid:
            continue
        source = "family" if infer_counter_valid_family(attacker_fam, defender_fam, attacker, defender) else "profile"
        inferred.append(
            {
                "name": other,
                "score": round(score, 1),
                "reason": normalize_lol_text(
                    counter_reason(attacker, defender, attacker_fam=attacker_fam, defender_fam=defender_fam)
                ),
                "source": source,
            }
        )

    result = merge_sorted_entries(curated, inferred, limit=FULL_LIST_MAX, profiles=profiles)

    # Garantie : tout champion a des counters (impossible d'en avoir zéro)
    if len(result) < PREVIEW_COUNT:
        seen = {e["name"] for e in result}
        fallback: list[dict] = []
        for other, score in sorted(beaten_by.items(), key=lambda x: (-x[1], x[0])):
            if other in seen or other in curated_names:
                continue
            if score < 8:
                continue
            attacker = profiles[other]
            attacker_fam = families.get(other) or assign_champion_family(other, attacker, families_meta)
            fallback.append(
                {
                    "name": other,
                    "score": round(max(score, INFER_COUNTER_MIN), 1),
                    "reason": normalize_lol_text(
                        counter_reason(attacker, defender, attacker_fam=attacker_fam, defender_fam=defender_fam)
                    ),
                    "source": "family",
                }
            )
            if len(result) + len(fallback) >= PREVIEW_COUNT:
                break
        result = merge_sorted_entries(result, fallback, limit=FULL_LIST_MAX, profiles=profiles)

    return result


def prof_themes(prof: dict) -> set[str]:
    """Thèmes macro / teamfight d'un champion."""
    tags = prof["tags"]
    traits = prof["traits"]
    themes: set[str] = set()

    if "enchanter" in tags or (prof["support"] and prof["utility"] >= 7 and (traits["shield"] or traits["heal"])):
        themes.add("protect")
    if prof["marksman"] or ("scaling" in tags and prof["squishy"] and prof["damage"] >= 6):
        themes.add("hypercarry")
    if prof["support"] and (traits["cc"] or traits["knockup"]) and not prof["tanky"]:
        themes.add("lockdown")
    if prof["support"] and prof["tanky"]:
        themes.add("engage")
    if traits["knockup"] or (prof["tanky"] and traits["cc"] and prof["damage"] >= 5):
        themes.add("wombo")
    if "dive" in tags or (prof["fighter"] and traits["mobility"] and prof["assassin"]):
        themes.add("dive")
    if prof["assassin"] or ("pick" in tags and traits["mobility"]):
        themes.add("pick")
    if prof["damage"] >= 7 and (prof["assassin"] or traits["mobility"]) and prof["squishy"]:
        themes.add("all_in")
    if prof["attack_range"] >= 500 and prof["damage"] >= 6 and not prof["assassin"]:
        themes.add("poke")
    if traits["aoe"] and prof["mage"]:
        themes.add("aoe")
    if "global" in prof["name"].lower() or prof["name"] in {
        "Karthus", "Twisted Fate", "Nocturne", "Pantheon", "Taliyah", "Galio", "Shen"
    }:
        themes.add("global")
    if prof["name"] in {"Akshan", "Pyke", "Karthus"}:
        themes.add("execute")
    return themes


def themes_synergy_compatible(a: set[str], b: set[str]) -> bool:
    """Deux champions partagent le même plan de jeu."""
    pairs = (
        ({"protect"}, {"hypercarry"}),
        ({"protect"}, {"all_in"}),
        ({"lockdown"}, {"all_in"}),
        ({"lockdown"}, {"hypercarry"}),
        ({"lockdown"}, {"aoe"}),
        ({"engage"}, {"hypercarry"}),
        ({"engage"}, {"all_in"}),
        ({"wombo"}, {"wombo"}),
        ({"wombo"}, {"dive"}),
        ({"dive"}, {"wombo"}),
        ({"dive"}, {"dive"}),
        ({"poke"}, {"poke"}),
        ({"poke"}, {"lockdown"}),
        ({"global"}, {"global"}),
        ({"global"}, {"pick"}),
        ({"global"}, {"execute"}),
        ({"pick"}, {"execute"}),
        ({"aoe"}, {"lockdown"}),
        ({"aoe"}, {"wombo"}),
    )
    for need_a, need_b in pairs:
        if (need_a <= a and need_b <= b) or (need_b <= a and need_a <= b):
            return True
    return False


def infer_synergy_valid(a: dict, b: dict) -> bool:
    if a["marksman"] and b["marksman"]:
        return False
    if a["assassin"] and b["assassin"]:
        return False
    if a["mage"] and b["mage"] and a["squishy"] and b["squishy"]:
        return False
    ta, tb = prof_themes(a), prof_themes(b)
    if not themes_synergy_compatible(ta, tb):
        return False
    # Enchanter sans carry à protéger
    if "protect" in ta and "hypercarry" not in tb and "all_in" not in tb:
        return False
    if "protect" in tb and "hypercarry" not in ta and "all_in" not in ta:
        return False
    return True


def infer_counter_valid_family(
    attacker_fam: dict,
    defender_fam: dict,
    attacker: dict,
    defender: dict,
) -> bool:
    """Patterns family / comp type reconnus comme counter logique."""
    key_a = attacker_fam.get("key", "")
    key_b = defender_fam.get("key", "")
    types_a = set(attacker_fam.get("compTypes", []))
    types_b = set(defender_fam.get("compTypes", []))

    for a, b, _bonus, _reason in FAMILY_COUNTER_BONUS:
        if key_a == a and key_b == b:
            return True

    for comp_a, comp_b, _bonus, _reason in COMP_TYPE_COUNTER_BONUS:
        if comp_a in types_a and comp_b in types_b:
            return True

    if key_a in {"adc_poke", "mage_control"} and key_b in {"bruiser_teamfight", "tank_engage"}:
        return True
    if key_a in {"assassin_ad_pick", "assassin_ap_pick"} and key_b in {
        "adc_hypercarry", "adc_tempo", "mage_dps", "support_enchanter"
    }:
        return True
    if key_a in {"tank_disengage", "support_disengage"} and key_b in {
        "tank_engage", "support_engage", "adc_short_allin"
    }:
        return True
    if key_a == "global_pick" and key_b in {"bruiser_split", "ovni"}:
        return True
    if key_a == "jungle_offensive" and key_b in {"jungle_defensive", "jungle_hypercarry"}:
        return True
    if types_a & {"poke_disengage", "poke_siege"} and types_b & {"teamfight_engage", "all_in"}:
        return True
    if types_a & {"pick_global", "all_in", "lane_tempo"} and types_b & {"hypercarry"}:
        return True
    if attacker["traits"].get("percent_hp") and defender["tanky"]:
        return True
    if attacker["traits"].get("dash_block") and defender["traits"].get("mobility"):
        return True
    return False


def infer_counter_valid(attacker: dict, defender: dict) -> bool:
    """Patterns kit / profil reconnus."""
    at, de = attacker, defender
    if (at["marksman"] or at["name"] in {"Vayne", "Gwen", "Kog'Maw", "Viego"}) and de["super_tank"]:
        return True
    if at["traits"]["percent_hp"] and de["tanky"]:
        return True
    if at["name"] == "Trundle" and de["tanky"]:
        return True
    if at["assassin"] and de["squishy"] and (de["marksman"] or de["mage"]):
        return True
    if at["name"] in {"Fizz", "Zed", "Talon", "Kassadin", "Akali", "Katarina"} and de["mage"] and de["squishy"]:
        return True
    if at["name"] in {"Vex", "Poppy", "Cassiopeia"} and de["traits"]["mobility"]:
        return True
    if at["traits"]["dash_block"] and de["traits"]["mobility"]:
        return True
    if at["name"] == "Morgana" and de["support"] and de["traits"]["cc"]:
        return True
    if at["name"] == "Olaf" and de["traits"]["cc"]:
        return True
    if at["traits"]["anti_heal"] and de["traits"]["heal"]:
        return True
    if at["attack_range"] >= 500 and de["attack_kind"] == "melee" and de["squishy"] and at["damage"] >= 6:
        return True
    if at["attack_range"] >= 500 and de["attack_kind"] == "melee" and de["tanky"] and at["traits"]["percent_hp"]:
        return True
    if at["name"] == "Malzahar" and de["assassin"]:
        return True
    if at["name"] in {"Quinn", "Lillia", "Teemo", "Kalista", "Ashe"} and de["attack_kind"] == "melee":
        return True
    if at["name"] == "Nocturne" and de["marksman"]:
        return True
    if at["name"] == "Brand" and de["support"] and de["traits"]["heal"]:
        return True
    if at["traits"]["knockup"] and de["traits"]["mobility"] and de["assassin"]:
        return True
    if at["traits"]["root"] and de["traits"]["mobility"]:
        return True
    if at["tanky"] and de["assassin"]:
        return True
    if at["mage"] and at["damage"] >= 7 and de["support"] and "enchanter" in de["tags"]:
        return True
    if at["traits"]["aoe"] and de["traits"]["invis"]:
        return True
    if at["name"] in {"Renekton", "Pantheon", "Lucian", "Draven"} and de["marksman"] and de["squishy"]:
        return True
    if at["name"] in {"Illaoi", "Mordekaiser", "Darius", "Garen"} and de["fighter"] and not de["tanky"]:
        return True
    return False


def build_gameplay_style(prof: dict, family: dict | None = None) -> str:
    """Résumé macro + teamfight (familles cours + MD)."""
    if family and family.get("macroEarly"):
        parts = [
            f"{family.get('label', 'Champion')} ({', '.join(family.get('compTypeLabels', [])[:2]) or 'flex'}).",
            f"Early : {family['macroEarly']}",
            f"Mid : {family['macroMid']}",
        ]
        if family.get("teamfightPlan"):
            parts.append(f"Teamfight : {family['teamfightPlan']}")
        return normalize_lol_text(" ".join(parts))

    tags = prof.get("tags", set())
    traits = prof.get("traits", {})
    roles = prof.get("roles", [])
    parts: list[str] = []

    if "Marksman" in roles:
        parts.append(
            "ADC / carry ranged : farm safe, scale vos items, restez en limit de range en teamfight."
        )
    elif "Assassin" in roles or "assassin" in tags:
        parts.append(
            "Assassin pick : cherchez les isolés en side lane, flank la backline quand les key cooldowns sont down."
        )
    elif "Tank" in roles and prof.get("tanky"):
        parts.append(
            "Frontline tank : vision devant les objectives, engage ou zone pour ouvrir le fight."
        )
    elif "Support" in roles and "enchanter" in tags:
        parts.append(
            "Support enchanter : restez collé au carry, prio vision bot/mid, scale avec l'équipe."
        )
    elif "Support" in roles:
        parts.append(
            "Support engage / CC : vision offensive, forcez les fights quand ult + CC sont up."
        )
    elif "Mage" in roles:
        if prof.get("attack_range", 0) >= 500:
            parts.append(
                "Mage ranged : poke les lanes, siege les towers, gardez les cooldowns pour les teamfights sur objective."
            )
        else:
            parts.append(
                "Mage burst : cherchez les angles de flank ou les setups CC alliés avant le all-in."
            )
    elif "Fighter" in roles:
        parts.append(
            "Fighter : gagnez les trades en lane, puis side push ou second engage en teamfight."
        )
    else:
        parts.append(
            "Profil flex : prio de lane avec le jungler, regroupez-vous sur les major objectives."
        )

    macro_bits: list[str] = []
    if "scaling" in tags or ("marksman" in tags and prof.get("damage", 0) >= 7):
        macro_bits.append("évitez les fights inutiles avant vos deux core items")
    elif "assassin" in tags or "pick" in tags or traits.get("invis"):
        macro_bits.append("deep vision et punissez les rotations isolées")
    elif "frontline" in tags or prof.get("tanky"):
        macro_bits.append("menez la rotation vers Herald / Drake et forcez le 5v5 sur pit")
    elif prof.get("attack_range", 0) >= 500 and prof.get("damage", 0) >= 6:
        macro_bits.append("push les lanes ranged et convertissez la prio en plates / tower")
    elif "dive" in tags or traits.get("mobility"):
        macro_bits.append("side pressure et forcez des réponses pour libérer les objectives")
    else:
        macro_bits.append("sync avec les timers d'objective, pas de free kill avant spawn")

    tf_bits: list[str] = []
    if traits.get("knockup") or ("cc" in tags and prof.get("tanky")):
        tf_bits.append("engage ou disengage avec CC non dodgeable, puis follow avec le burst team")
    elif traits.get("cc") or "cc" in tags:
        tf_bits.append("gardez le CC pour les carries ou les dashes, pas le frontline")
    elif "marksman" in tags:
        tf_bits.append("positionnement backline, hit la target la plus safe in range sans vous faire dive")
    elif "assassin" in tags or traits.get("invis"):
        tf_bits.append("attendez l'ouverture (CC allié ou cooldowns tank) avant de commit sur la backline")
    elif traits.get("aoe") or "aoe" in tags:
        tf_bits.append("max damage AOE sur les regroups, évitez les extended 1v1")
    elif "peel" in tags or traits.get("shield") or traits.get("heal"):
        tf_bits.append("peel le carry, purgez les divers et kite back")
    elif prof.get("attack_range", 0) >= 500:
        tf_bits.append("poke avant all-in, disengage si les divers commit")
    elif prof.get("tanky"):
        tf_bits.append("soak les cooldowns, zone la backline, laissez les carries free hit")
    else:
        tf_bits.append("jouez autour de l'ult et commit quand la target est locked")

    parts.append(f"Macro : {macro_bits[0]}.")
    parts.append(f"Teamfight : {tf_bits[0]}.")

    tip_blob = " ".join(prof.get("ally_tips", [])).lower()
    if "objectif" in tip_blob or "drake" in tip_blob or "baron" in tip_blob:
        parts.append("Prio setup avant spawn des major objectives.")
    elif "ult" in tip_blob and ("combat" in tip_blob or "forcer" in tip_blob):
        parts.append("Gardez l'ult pour les fights décisifs sur objective.")

    return normalize_lol_text(" ".join(parts[:4]))


def counter_reason(
    attacker: dict,
    defender: dict,
    curated_reason: str = "",
    attacker_fam: dict | None = None,
    defender_fam: dict | None = None,
) -> str:
    """Courte explication FR + termes LoL EN."""
    if curated_reason:
        return curated_reason
    bits: list[str] = []

    if attacker_fam and defender_fam:
        key_a = attacker_fam.get("key", "")
        key_b = defender_fam.get("key", "")
        for a, b, _bonus, reason in FAMILY_COUNTER_BONUS:
            if key_a == a and key_b == b:
                bits.append(reason)
                break
        types_a = set(attacker_fam.get("compTypes", []))
        types_b = set(defender_fam.get("compTypes", []))
        for comp_a, comp_b, _bonus, reason in COMP_TYPE_COUNTER_BONUS:
            if comp_a in types_a and comp_b in types_b:
                bits.append(reason)
                break

    if attacker["attack_range"] >= 500 and defender["squishy"]:
        bits.append("range vs squishy")
    if (attacker["assassin"] or attacker["traits"]["mobility"]) and defender["squishy"]:
        bits.append("mobility / burst vs carry")
    if (attacker["traits"]["cc"] or attacker["traits"]["root"]) and defender["traits"]["mobility"]:
        bits.append("CC stops mobility")
    if attacker["traits"]["knockup"] and defender["traits"]["mobility"]:
        bits.append("un dodgeable CC")
    if attacker["traits"]["dash_block"] and defender["traits"]["mobility"]:
        bits.append("anti-dash vs mobility")
    if attacker["traits"]["percent_hp"] and defender["tanky"]:
        bits.append("%HP DPS vs tank")
    if attacker["tanky"] and defender["assassin"]:
        bits.append("frontline vs assassin")
    if (attacker["marksman"] or attacker["damage"] >= 7) and defender["super_tank"]:
        bits.append("%HP DPS vs super tank")
    if attacker["traits"]["anti_heal"] and defender["traits"]["heal"]:
        bits.append("anti-heal vs sustain")
    if attacker["name"] in {"Vex", "Poppy"} and defender["traits"]["mobility"]:
        bits.append("anti-dash")
    if attacker["traits"]["aoe"] and defender["traits"]["invis"]:
        bits.append("AOE vs stealth")
    if not bits:
        bits.append("Kit + family counter")
    return " · ".join(bits[:3])


def synergy_reason(a: dict, b: dict, theme: str = "") -> str:
    """Courte explication FR de la synergie."""
    if theme:
        theme_labels = {
            "protect_hypercarry": "protect hypercarry",
            "lockdown_all_in": "CC lockdown + all-in",
            "dive_wombo": "dive coordonné / wombo",
            "knockup_wombo": "setup knockup + wombo",
            "poke_cc_scale": "poke + CC / scale",
            "poke_siege": "poke & siege",
            "global_execute": "global + execute",
            "global_pick": "double global pick",
            "all_in_bot": "all-in bot lane",
            "protect_reset": "protect + reset teamfight",
            "protect_hypercarry": "protect hypercarry",
            "split_pick": "split + pick",
            "split_protect": "split + protect",
            "siege_split": "siege + split side",
            "pick_wombo": "pick + wombo",
            "pick_peel": "pick + peel",
            "frontline_scale": "frontline + scale",
            "global_wombo": "global + wombo",
            "duo_bot": "duo bot officiel",
            "safe_scale": "safe scale bot",
            "safe_poke": "poke safe",
            "zoning_peel": "zoning + peel",
            "all_in_jungle": "all-in jungle",
            "knockup_follow": "knockup follow",
            "protect_carry": "protect carry",
            "protect_all_in": "protect all-in",
            "wombo_follow": "wombo follow",
            "pick_cc": "pick + CC",
            "pick_roam": "pick + roam",
            "dps_peel": "DPS + peel",
            "speed_scale": "speed + scale",
            "lockdown_aoe": "lockdown AOE",
            "aoe_wombo": "AOE wombo",
            "zone_wombo": "zone wombo",
            "frontline_cc": "frontline CC",
        }
        label = theme_labels.get(theme, theme.replace("_", " "))
        return f"Même game plan ({label}) — duo reconnu."
    bits: list[str] = []
    if (a["traits"]["shield"] or a["traits"]["heal"] or a["support"]) and (
        b["marksman"] or (b["damage"] >= 7 and b["squishy"])
    ):
        bits.append(f"{a['name']} peel / sustain pour {b['name']}")
    elif (b["traits"]["shield"] or b["traits"]["heal"] or b["support"]) and (
        a["marksman"] or (a["damage"] >= 7 and a["squishy"])
    ):
        bits.append(f"{b['name']} peel / sustain pour {a['name']}")
    if (a["traits"]["cc"] or a["traits"]["knockup"]) and (b["damage"] >= 7 or b["assassin"]):
        bits.append("setup CC + burst")
    if (b["traits"]["cc"] or b["traits"]["knockup"]) and (a["damage"] >= 7 or a["assassin"]):
        bits.append("setup CC + burst")
    if a["tanky"] and b["squishy"] and (b["marksman"] or b["mage"]):
        bits.append("frontline + backline")
    if b["tanky"] and a["squishy"] and (a["marksman"] or a["mage"]):
        bits.append("frontline + backline")
    if a["attack_range"] >= 500 and b["attack_range"] >= 500:
        bits.append("double poke / siege")
    if not bits:
        bits.append("Même teamfight theme — complémentarité validée")
    return " · ".join(bits[:3])


def preview_names(entries: list) -> list[str]:
    out: list[str] = []
    for e in entries[:PREVIEW_COUNT]:
        if isinstance(e, dict):
            out.append(e["name"])
        else:
            out.append(str(e))
    return out


def main() -> None:
    if not GAMEPLAY_MD.exists():
        raise SystemExit(f"Fichier introuvable : {GAMEPLAY_MD}")

    gameplay = parse_gameplay_md(GAMEPLAY_MD)
    families_meta = load_families_meta()
    lolalytics = load_lolalytics()
    data = json.loads(CHAMPIONS_JSON.read_text(encoding="utf-8"))
    champs = data["champions"]
    resolver = build_name_resolver(champs)

    profiles: dict[str, dict] = {}
    for c in champs:
        gp = gameplay.get(c["name"])
        if not gp:
            continue
        profiles[c["name"]] = build_profile(gp)

    missing = [c["name"] for c in champs if c["name"] not in profiles]
    if missing:
        print(f"Attention: {len(missing)} champions sans section MD: {missing[:8]}...")

    curated_syns, curated_ctrs = load_curated(resolver)

    families: dict[str, dict] = {}
    for n, p in profiles.items():
        families[n] = assign_champion_family(n, p, families_meta)

    names = list(profiles.keys())
    counter_matrix: dict[str, dict[str, float]] = {n: {} for n in names}
    synergy_matrix: dict[str, dict[str, float]] = {n: {} for n in names}

    for a_name in names:
        a = profiles[a_name]
        for b_name in names:
            if a_name == b_name:
                continue
            b = profiles[b_name]
            counter_matrix[a_name][b_name] = counter_score(a, b)
            synergy_matrix[a_name][b_name] = synergy_score(a, b)

    for c in champs:
        name = c["name"]
        apply_lane_positions(c, lolalytics.get(name))

        if name not in profiles:
            c["bestCounters"] = []
            c["bestPairings"] = []
            c["allCounters"] = []
            c["allPairings"] = []
            c.pop("worstMatchups", None)
            c.pop("matchupProfile", None)
            c.pop("gameplayStyle", None)
            continue
        prof = profiles[name]
        family = families[name]
        all_counters = build_counters(
            name, profiles, counter_matrix, curated_ctrs, families, families_meta
        )
        all_pairings = build_pairings_with_fallback(
            name, profiles, synergy_matrix, curated_syns, families, families_meta
        )
        c["allCounters"] = all_counters
        c["allPairings"] = all_pairings
        c["bestCounters"] = all_counters[:PREVIEW_COUNT]
        c["bestPairings"] = all_pairings[:PREVIEW_COUNT]
        c.pop("worstMatchups", None)
        c["tacticTags"] = sorted(prof["tags"])
        c["championFamily"] = family
        style = build_gameplay_style(prof, family)
        c["gameplayStyle"] = style
        c["matchupProfile"] = {
            "roles": prof["roles"],
            "damage": prof["damage"],
            "tankiness": prof["tankiness"],
            "utility": prof["utility"],
            "difficulty": prof["difficulty"],
            "attackRange": prof["attack_range"],
            "attackKind": prof["attack_kind"],
            "tags": sorted(prof["tags"]),
            "allyTips": prof["ally_tips"],
            "enemyTips": prof["enemy_tips"],
            "gameplayStyle": style,
            "family": family.get("key"),
            "familyLabel": family.get("label"),
            "compTypes": family.get("compTypes", []),
        }

    data["matchupVersion"] = "families-v6"
    data["matchupSource"] = str(GAMEPLAY_MD)
    data["matchupCurated"] = str(CURATED_JSON)
    data["matchupFamilies"] = str(FAMILIES_JSON)

    comp_types_export = families_meta.get("compTypes", {})
    comp_guide = {
        "compTypes": comp_types_export,
        "families": {k: {"label": v.get("label"), "compTypes": v.get("compTypes", [])} for k, v in families_meta.get("families", {}).items()},
    }

    for path in (CHAMPIONS_JSON, PUBLIC_CHAMPIONS):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    for meta_path in (TACTICS_META, PUBLIC_TACTICS):
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["compGuide"] = comp_guide
        for c in champs:
            entry = meta.get("champions", {}).get(c["name"], {})
            counter_names = preview_names(c.get("bestCounters", []))
            pairing_names = preview_names(c.get("bestPairings", []))
            entry["bestCounters"] = counter_names
            entry["bestPairings"] = pairing_names
            entry["worstMatchups"] = counter_names
            entry["tags"] = c.get("tacticTags", [])
            fam = c.get("championFamily") or {}
            entry["family"] = fam.get("key")
            entry["familyLabel"] = fam.get("label")
            entry["compTypes"] = fam.get("compTypes", [])
            meta["champions"][c["name"]] = entry
        meta["matchupVersion"] = "families-v5"
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Source: {GAMEPLAY_MD}")
    print(f"Profils MD: {len(profiles)} / {len(champs)} champions")
    sample = next(c for c in champs if c["name"] in profiles)
    print(f"Exemple {sample['name']}: counters={preview_names(sample.get('bestCounters', []))} pairings={preview_names(sample.get('bestPairings', []))}")


if __name__ == "__main__":
    main()
