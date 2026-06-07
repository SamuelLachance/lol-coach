#!/usr/bin/env python3
"""Shared utilities for Kaze transcript processing."""

from __future__ import annotations

import re
from pathlib import Path

KAZE_DIR = Path.home() / ".cursor" / "skills" / "League-of-Legends" / "transcripts" / "kaze"
SKILL_DIR = Path.home() / ".cursor" / "skills" / "League-of-Legends"

# YouTube auto-transcript → termes LoL corrigés
TRANSCRIPT_FIXES: list[tuple[str, str]] = [
    (r"\bair\b", "Azir"),
    (r"\baser\b", "Azir"),
    (r"\baser\b", "Azir"),
    (r"\bnic?o\b", "Neeko"),
    (r"\bharry\b", "Hwei"),
    (r"\btonila\b", "Taliyah"),
    (r"\bsérie\b", "Sylas"),
    (r"\bbroken blade\b", "BrokenBlade"),
    (r"\bbroken\b(?=\s+blade)", "BrokenBlade"),
    (r"\btrox\b", "Aatrox"),
    (r"\bfam(?:oso|eux)\b", "Fiora"),
    (r"\bboons\b", "Fiora"),
    (r"\bsejuani\b", "Sejuani"),
    (r"\bseduani\b", "Sejuani"),
    (r"\btf\b", "Twisted Fate"),
    (r"\btwisted fate\b", "Twisted Fate"),
    (r"\bnash(?:or)?\b", "Baron"),
    (r"\bnico\b", "Neeko"),
    (r"\bkaisa\b", "Kai'Sa"),
    (r"\bka'?sa\b", "Kai'Sa"),
    (r"\bkindred\b", "Kindred"),
    (r"\bpeanut\b", "Peanut"),
    (r"\bzeus\b", "Zeus"),
    (r"\bruler\b", "Ruler"),
    (r"\bcanavi\b", "Canyon"),
    (r"\bcanyon\b", "Canyon"),
    (r"\bdouble enchanter\b", "double enchanter"),
    (r"\bflex pick\b", "flex pick"),
    (r"\bwin condition\b", "win condition"),
    (r"\boutdraft\b", "outdraft"),
    (r"\bblind pick\b", "blind pick"),
    (r"\bcounter pick\b", "counter pick"),
    (r"\bslow push\b", "slow push"),
    (r"\bwave control\b", "wave control"),
    (r"\bsplit push\b", "split push"),
    (r"\bteamfight\b", "teamfight"),
    (r"\bdisengage\b", "disengage"),
    (r"\bhypercarry\b", "hypercarry"),
    (r"\benchanter\b", "enchanter"),
    (r"\bengage\b", "engage"),
    (r"\bpeel\b", "peel"),
    (r"\bherald\b", "Herald"),
    (r"\bdrake\b", "Drake"),
    (r"\bbaron\b", "Baron"),
    (r"\btp\b", "TP"),
    (r"\bflash\b", "Flash"),
    (r"\bignite\b", "Ignite"),
    (r"\bteleport\b", "Teleport"),
    (r"\bprowler'?s claw\b", "Prowler's Claw"),
    (r"\beclipse\b", "Eclipse"),
    (r"\bheartsteel\b", "Heartsteel"),
    (r"\blocket\b", "Locket"),
    (r"\bredemption\b", "Redemption"),
    (r"\bzhonya\b", "Zhonya's"),
    (r"\beverfrost\b", "Everfrost"),
    (r"\blethality\b", "lethality"),
    (r"\bhullbreaker\b", "Hullbreaker"),
    (r"\bplates?\b", "plates"),
    (r"\bsbire\b", "minion"),
    (r"\bminions?\b", "minion"),
    (r"\bplate(?:s)?\b", "plates"),
    (r"\b5050\b", "50/50"),
    (r"\b311\b", "3-1-1"),
    (r"\b1-3-1\b", "1-3-1"),
    (r"\b1-4\b", "1-4"),
    (r"\b5v5\b", "5v5"),
    (r"\b1v1\b", "1v1"),
    (r"\bbackline\b", "backline"),
    (r"\bfrontline\b", "frontline"),
    (r"\bscaling\b", "scaling"),
    (r"\bsnowball\b", "snowball"),
    (r"\binvade\b", "invade"),
    (r"\bgank\b", "gank"),
    (r"\broam\b", "roam"),
    (r"\bvision\b", "vision"),
    (r"\bpink ward\b", "pink ward"),
    (r"\bsweeper\b", "sweeper"),
]

ORACLE_NAME_MAP: dict[str, str] = {
    "Aurelion": "Aurelion Sol",
    "BelVeth": "Bel'Veth",
    "Blitz": "Blitzcrank",
    "Cassio": "Cassiopeia",
    "ChoGath": "Cho'Gath",
    "Fiddle": "Fiddlesticks",
    "Heim": "Heimerdinger",
    "Kaisa": "Kai'Sa",
    "KhaZix": "Kha'Zix",
    "KogMaw": "Kog'Maw",
    "Ksante": "K'Santé",
    "Malz": "Malzahar",
    "Master Yi": "Maître Yi",
    "Morde": "Mordekaiser",
    "Mundo": "Dr. Mundo",
    "RekSai": "Rek'Sai",
    "Shyv": "Shyvana",
    "Twisted": "Twisted Fate",
    "VelKoz": "Vel'Koz",
    "Xin": "Xin Zhao",
    "Seraphine": "Séraphine",
    "Zoe": "Zoé",
    "Zaahen": "Zaahen",
}

CHAMPION_ALIASES: dict[str, str] = {
    **ORACLE_NAME_MAP,
    "TF": "Twisted Fate",
    "TF full tank": "Twisted Fate",
    "Lee": "Lee Sin",
    "Jarvan IV": "Jarvan IV",
    "J4": "Jarvan IV",
    "GP": "Gangplank",
    "MF": "Miss Fortune",
    "AS": "Ashe",
    "Ez": "Ezreal",
    "LB": "LeBlanc",
    "Kata": "Katarina",
    "Naut": "Nautilus",
    "Thresh": "Thresh",
    "Braum": "Braum",
    "Ornn": "Ornn",
    "Azir": "Azir",
    "Sejuani": "Sejuani",
    "Renata": "Renata Glasc",
    "Ambessa": "Ambessa",
    "Smolder": "Smolder",
    "Mel": "Mel",
    "Yunara": "Yunara",
    "Naafiri": "Naafiri",
    "Aurora": "Aurora",
    "Briar": "Briar",
    "Hwei": "Hwei",
}

EDU_PATTERN = re.compile(
    r"\b("
    r"il faut|tu dois|vous devez|ne pas|jamais|toujours|important|clé|"
    r"win condition|priorité|objectif|erreur|éviter|punish|punir|"
    r"should not|should have|always|never|the key|you need|you must|"
    r"correct play|bad decision|outdraft|flex|double enchanter|"
    r"counter pick|blind pick|wave|slow push|split|teamfight|engage|disengage"
    r")\b",
    re.I,
)

VS_PATTERN = re.compile(
    r"(\b[A-Z][a-zA-Z''\-\s]{2,20}\b)\s+(?:vs\.?|contre|counter(?:s|ed)?|into)\s+(\b[A-Z][a-zA-Z''\-\s]{2,20}\b)",
    re.I,
)

NOISE = re.compile(
    r"\b(merci|abonne|like|discord|twitch|salut|bonjour|musique|open tour|"
    r"twitch chat|monkeys|clowns|bbc|fortnite|mmo|lcs)\b",
    re.I,
)

TOPIC_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("Draft & flex", re.compile(r"\b(draft|ban|pick|flex|blind|counter.?pick|outdraft|bo\d|double enchanter)\b", re.I)),
    ("Toplane & matchups", re.compile(r"\b(top|split|side lane|fiora|garen|ornn|nasus|trade|matchup|duel|camille|riven|poppy|jax|aatrox)\b", re.I)),
    ("Wave & tempo", re.compile(r"\b(wave|slow push|freeze|crash|minion|plates|recall|back)\b", re.I)),
    ("Macro & objectifs", re.compile(r"\b(macro|herald|drake|baron|rotate|objectif|map|tempo|311|1-3-1)\b", re.I)),
    ("Teamfight & spacing", re.compile(r"\b(teamfight|spacing|peel|engage|disengage|backline|frontline|wombo)\b", re.I)),
    ("Jungle", re.compile(r"\b(jungle|jungler|gank|invade|clear|path|kindred|canyon|sejuani|vi)\b", re.I)),
    ("Couleurs MTG", re.compile(r"\b(white|blue|red|black|green|enchanter|hypercarry|scaling|snowball|selfish|team)\b", re.I)),
]


def normalize_champ(raw: str, known: set[str]) -> str | None:
    raw = re.sub(r"\s+", " ", raw.strip(" .,!?:;\"'"))
    if not raw or len(raw) < 3:
        return None
    if raw in known:
        return raw
    if raw in CHAMPION_ALIASES:
        mapped = CHAMPION_ALIASES[raw]
        return mapped if mapped in known else None
    low = raw.lower()
    for name in known:
        if name.lower() == low:
            return name
    for alias, name in CHAMPION_ALIASES.items():
        if alias.lower() == low and name in known:
            return name
    return None


def fix_transcript(text: str) -> str:
    out = text
    for pat, repl in TRANSCRIPT_FIXES:
        out = re.sub(pat, repl, out, flags=re.I)
    return out


def split_sentences(text: str) -> list[str]:
    text = re.sub(r"\[\s*[^\]]+\s*\]", " ", text)
    text = re.sub(r"\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{3})?(?:\s*,\s*\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{3})?)*", " ", text)
    parts = re.split(r"(?<=[.!?])\s+|\s{2,}", text)
    return [p.strip() for p in parts if len(p.strip()) > 35]


def is_educational(sentence: str) -> bool:
    if len(sentence) < 45 or len(sentence) > 480:
        return False
    if NOISE.search(sentence):
        return False
    if not EDU_PATTERN.search(sentence):
        return False
    alpha = sum(c.isalpha() for c in sentence)
    return alpha / max(len(sentence), 1) > 0.5


def topic_for(sentence: str) -> str:
    for name, pat in TOPIC_RULES:
        if pat.search(sentence):
            return name
    return "Général"
