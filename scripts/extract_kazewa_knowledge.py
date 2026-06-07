#!/usr/bin/env python3
"""Extract LoL knowledge from KazewaLoL transcripts into a single reference MD."""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRANSCRIPTS_DIR = ROOT / "data" / "transcripts" / "kazewalol"
OUT_MD = ROOT / "docs" / "kazewa-lol-knowledge.md"
SKILL_OUT = Path.home() / ".cursor" / "skills" / "League-of-Legends" / "lol-kazewa-knowledge.md"

TOPIC_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("Draft & compositions pro", re.compile(r"\b(draft|ban|pick|compo|composition|blind|counter.?pick|flex|bo\d|vs )\b", re.I)),
    ("Toplane & matchups", re.compile(r"\b(top\s?lane?|toplane|split\s?push|side\s?lane|fiora|garen|ornn|nasus|urgot|irelia|maokai|trundle|duel|matchup|trade|short\s?trade|camille|riven|poppy|jax)\b", re.I)),
    ("Wave & lane control", re.compile(r"\b(wave|slow\s?push|freeze|crash|push|sbire|minion|plate|plaque|wave\s?control)\b", re.I)),
    ("Macro & map", re.compile(r"\b(macro|map|rotate|roam|objectif|herald|drake|baron|tower|tourelle|mindset|destroy)\b", re.I)),
    ("Jungle & tempo", re.compile(r"\b(jungle|jungler|gank|invade|clear|camp|tempo|path|canyon|nocturne|graves|kayn)\b", re.I)),
    ("Teamfight & spacing", re.compile(r"\b(team\s?fight|tf|spacing|peel|engage|disengage|backline|frontline|1\s?vs\s?9)\b", re.I)),
    ("Climb & mental", re.compile(r"\b(climb|elo|rank|soloq|solo\s?q|mental|tilt|review|erreur|mistake|challenger|master|diamond|unranked|coach)\b", re.I)),
    ("Champion & build", re.compile(r"\b(build|item|runes?|skill|combo|kit|champion|patch|nerf|buff|stats?|crit|armure|pénétration|penetration|lifesteal|vitesse)\b", re.I)),
]

TITLE_TOPIC_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("Draft & compositions pro", re.compile(r"draft|bo\d|\bvs\b|g2|t1|gen\.?g|kcorp|world|msi|lec|lck|playoff|finale|demi|quart", re.I)),
    ("Toplane & matchups", re.compile(r"fiora|top|garen|ornn|nasus|urgot|irelia|maokai|trundle|camille|riven|poppy|jax|potent|matchup|solo\s?lane|side", re.I)),
    ("Wave & lane control", re.compile(r"wave|plate|sbire|minion|freeze|push", re.I)),
    ("Macro & map", re.compile(r"macro|map|destroy|12 minute|objectif|herald|drake|baron|tempo", re.I)),
    ("Jungle & tempo", re.compile(r"jungle|jungler|gank|path|canyon|nocturne|graves|kayn|clear", re.I)),
    ("Teamfight & spacing", re.compile(r"team\s?fight|spacing|1\s?vs\s?9|carry|hypercarry", re.I)),
    ("Climb & mental", re.compile(r"challenger|diamond|elo|climb|master|psycholog|review|coaching|coach|unranked|mental|erreur", re.I)),
    ("Champion & build", re.compile(r"patch|champion|build|method|potent|guide|stats?|crit|armure|pénétration|penetration|lifesteal|planches insta", re.I)),
]

EDU_PATTERNS = re.compile(
    r"\b("
    r"il faut|tu dois|vous devez|ne pas|jamais|toujours|important|clé|secret|astuce|trick|"
    r"win condition|condition de victoire|priorité|objectif|erreur|éviter|punish|punir|"
    r"how to|comment|pourquoi|why|the key|you need|you must|never|always|method"
    r")\b",
    re.I,
)

NOISE = re.compile(
    r"\b(merci|abonne|like|discord|twitch|salut|bonjour|bisous|coucou|musique|open tour|purgatoire)\b",
    re.I,
)


def clean_line(line: str) -> str:
    line = re.sub(r"^\[[^\]]+\]\s*", "", line).strip()
    line = re.sub(r"\s+", " ", line)
    return line


def is_educational(text: str) -> bool:
    if len(text) < 45 or len(text) > 420:
        return False
    if NOISE.search(text):
        return False
    if not EDU_PATTERNS.search(text):
        return False
    alpha = sum(c.isalpha() for c in text)
    return alpha / max(len(text), 1) > 0.55


def topic_for(text: str, title: str) -> str:
    hay = f"{title} {text}"
    for name, pat in TOPIC_RULES:
        if pat.search(hay):
            return name
    return "Général"


def title_topic(title: str) -> str:
    for name, pat in TITLE_TOPIC_RULES:
        if pat.search(title):
            return name
    return "Général"


def normalize_key(text: str) -> str:
    t = text.lower()
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t[:120]


def extract_from_file(path: Path, title: str) -> list[tuple[str, str, str]]:
    raw = path.read_text(encoding="utf-8", errors="replace")
    body = raw.split("---\n\n", 1)[-1] if "---\n\n" in raw else raw
    out: list[tuple[str, str, str]] = []
    for line in body.splitlines():
        text = clean_line(line)
        if not is_educational(text):
            continue
        topic = topic_for(text, title)
        out.append((topic, text, title))
    return out


def title_insights(manifest: list[dict]) -> dict[str, list[str]]:
    buckets: dict[str, list[str]] = defaultdict(list)
    counts: Counter[str] = Counter()

    for entry in manifest:
        title = entry.get("title", "")
        if not title:
            continue
        topic = title_topic(title)
        counts[topic] += 1
        vid = entry.get("id", "")
        url = entry.get("url") or (f"https://www.youtube.com/watch?v={vid}" if vid else "")
        buckets[topic].append(f"**{title}** — [vidéo]({url})")

    summary_lines = [
        f"- **{counts.get('Draft & compositions pro', 0)}** analyses draft / esport (BO, LEC/LCK/Worlds)",
        f"- **{counts.get('Toplane & matchups', 0)}** contenus toplane / matchups (Fiora, side lane, duel)",
        f"- **{counts.get('Wave & lane control', 0)}** wave control / tempo lane",
        f"- **{counts.get('Macro & map', 0)}** macro map / destruction de map",
        f"- **{counts.get('Jungle & tempo', 0)}** jungle / pathing / tempo",
        f"- **{counts.get('Climb & mental', 0)}** climb / coaching / review / mental",
        f"- **{counts.get('Champion & build', 0)}** guides champion / patch / stats fondamentales",
        f"- **{counts.get('Teamfight & spacing', 0)}** teamfight / carry / 1v9",
    ]
    buckets["_catalogue_stats"] = summary_lines
    return buckets


def build_markdown(
    by_topic: dict[str, list[tuple[str, str]]],
    manifest: list[dict],
    title_buckets: dict[str, list[str]],
) -> str:
    ok = sum(1 for e in manifest if e.get("status") == "ok")
    titles_only = sum(1 for e in manifest if e.get("status") in ("titles_only", "pending", "error", "missing"))
    total = len(manifest)
    mode = "transcripts + titres" if ok else "titres uniquement (transcripts à télécharger)"

    lines = [
        "# KazewaLoL — Synthèse connaissances League of Legends\n",
        "\n",
        "> Extraction des contenus YouTube [@kazewalol](https://www.youtube.com/@kazewalol). ",
        f"**{total}** vidéos indexées · **{ok}** avec transcript · mode : *{mode}*.\n",
        "\n",
        "Kazewa (Challenger, ex-pro, coach) — spécialité **toplane**, **matchups**, **macro map**, ",
        "**draft pro** et **méthode de climb**. Chaîne majoritairement en français.\n",
        "\n",
        "---\n",
        "\n",
        "## Catalogue chaîne (620 vidéos)\n",
        "\n",
    ]
    for stat in title_buckets.get("_catalogue_stats", []):
        lines.append(f"{stat}\n")
    lines.extend(
        [
            "\n",
            "---\n",
            "\n",
            "## Principes transversaux (Méthode Kazewa)\n",
            "\n",
            "| Principe | Application |\n",
            "|----------|-------------|\n",
            "| **Avantage de lane = map** | Convertir un lead top en pression side, plates, vision profonde — pas en kills vanity. |\n",
            "| **Trade court, décision longue** | Micro trades gagnants → tempo → reset → objectif ; éviter les all-in random sans wave. |\n",
            "| **Annuler le kit adverse** | Identifier la win condition ennemie (scale, teamfight, split) et la rendre inutile (ex. Nasus sans stacks, tank sans flank). |\n",
            "| **Spacing & patience** | Fiora / duelists : punir les cooldowns, refuser les fights perdus, split avec info. |\n",
            "| **Review orientée macro** | Une erreur macro par game (wave, TP, objectif) > focus KDA. |\n",
            "| **Draft pro = plan de match** | Bans/picks servent la win condition ; analyser les BO LEC/LCK pour patterns flex/blind. |\n",
            "| **Wave avant fight** | Ne pas fight sans comprendre l'état de la wave (crash, slow push, freeze). |\n",
            "| **Rôle du coach** | Corriger une décision macro récurrente, pas micro-mécanique isolée. |\n",
            "\n",
            "### Séries clés à prioriser\n",
            "\n",
            "- **Fiora Method** — carry 0-4, annuler tanks (Ornn), duelists (Irelia), scale (Nasus).\n",
            "- **Destroy the map in 12 minutes** — conversion tempo early → objectifs + mental adverse.\n",
            "- **Potent Fiora tricks** — plus de 100 micro-optimisations matchup.\n",
            "- **Planches Insta** — stats fondamentales (armure, pénétration, crit, lifesteal, gold value).\n",
            "- **Unranked to Challenger** — progression par champion (Fiora, Riven, Camille, Poppy…).\n",
            "- **Analyses BO** — G2/Kcorp/T1/Gen.G : patterns draft flex, side win, win conditions.\n",
            "\n",
        ]
    )

    order = [
        "Draft & compositions pro",
        "Toplane & matchups",
        "Wave & lane control",
        "Macro & map",
        "Jungle & tempo",
        "Teamfight & spacing",
        "Climb & mental",
        "Champion & build",
        "Général",
    ]

    for topic in order:
        items = by_topic.get(topic, [])
        titles = [t for t in title_buckets.get(topic, []) if not t.startswith("- **")]
        if not items and not titles:
            continue
        lines.append(f"## {topic}\n\n")
        if titles and not items:
            lines.append(f"*Synthèse depuis les titres ({len(titles)} vidéos) — compléter avec transcripts.*\n\n")
        seen: set[str] = set()
        count = 0
        for text, source in items:
            key = normalize_key(text)
            if key in seen:
                continue
            seen.add(key)
            lines.append(f"- {text}\n")
            lines.append(f"  — *{source}*\n")
            count += 1
            if count >= 80:
                lines.append("\n*(… extrait tronqué, voir transcripts bruts)*\n")
                break
        shown = 0
        for t in titles:
            key = normalize_key(t)
            if key in seen:
                continue
            seen.add(key)
            lines.append(f"- {t}\n")
            shown += 1
            if shown >= 40:
                lines.append(f"\n*(… +{max(0, len(titles) - 40)} vidéos dans cette catégorie)*\n")
                break
        lines.append("\n")

    if ok < total:
        lines.extend(
            [
                "---\n",
                "\n",
                "## Compléter les transcripts\n",
                "\n",
                "YouTube bloque parfois les requêtes automatiques. Depuis le projet :\n",
                "\n",
                "```powershell\n",
                "cd C:\\Users\\Admin\\Projects\\lol-coach\n",
                "python scripts/download_kazewa_transcripts.py --cookies-from-browser edge\n",
                "python scripts/extract_kazewa_knowledge.py\n",
                "python scripts/apply_kazewa_knowledge.py\n",
                "```\n",
                "\n",
            ]
        )

    lines.extend(
        [
            "---\n",
            "\n",
            "## Sources brutes\n",
            "\n",
            f"- Liste vidéos : `{TRANSCRIPTS_DIR / 'video-list.txt'}`\n",
            f"- Transcripts : `{TRANSCRIPTS_DIR}`\n",
            f"- Manifest : `{TRANSCRIPTS_DIR / 'manifest.json'}`\n",
            "- Regénérer : `python scripts/build_kazewa_manifest.py` puis extract/apply\n",
        ]
    )
    return "".join(lines)


def main() -> None:
    manifest_path = TRANSCRIPTS_DIR / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing {manifest_path} — run build_kazewa_manifest.py or download_kazewa_transcripts.py")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    by_topic: dict[str, list[tuple[str, str]]] = defaultdict(list)

    for entry in manifest:
        if entry.get("status") != "ok" or not entry.get("file"):
            continue
        path = TRANSCRIPTS_DIR / entry["file"]
        if not path.exists():
            continue
        title = entry.get("title", entry["file"])
        for topic, text, src in extract_from_file(path, title):
            by_topic[topic].append((text, src))

    title_buckets = title_insights(manifest)
    md = build_markdown(by_topic, manifest, title_buckets)

    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text(md, encoding="utf-8")
    SKILL_OUT.parent.mkdir(parents=True, exist_ok=True)
    SKILL_OUT.write_text(md, encoding="utf-8")

    print(f"Wrote {OUT_MD}")
    print(f"Wrote {SKILL_OUT}")
    for topic in by_topic:
        print(f"  transcript {topic}: {len(by_topic[topic])} lines")
    for topic in TITLE_TOPIC_RULES:
        name = topic[0]
        n = len(title_buckets.get(name, []))
        if n:
            print(f"  titles {name}: {n}")


if __name__ == "__main__":
    main()
