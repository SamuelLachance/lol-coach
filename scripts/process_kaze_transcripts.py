#!/usr/bin/env python3
"""Process Kaze LoL Database transcripts → MD knowledge files."""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from kaze_transcript_common import (
    EDU_PATTERN,
    KAZE_DIR,
    SKILL_DIR,
    TOPIC_RULES,
    VS_PATTERN,
    fix_transcript,
    is_educational,
    normalize_champ,
    split_sentences,
    topic_for,
)

ROOT = Path(__file__).resolve().parent.parent
OUT_DOCS = ROOT / "docs" / "kaze-database-knowledge.md"
CHAMPIONS_JSON = ROOT / "data" / "champions.json"

SKILL_OUTS = {
    "database": SKILL_DIR / "lol-kaze-database.md",
    "mtg": SKILL_DIR / "lol-mtg-colors.md",
    "draft": SKILL_DIR / "lol-kaze-draft-insights.md",
    "matchups": SKILL_DIR / "lol-kaze-matchups.md",
}


def load_champion_names() -> set[str]:
    data = json.loads(CHAMPIONS_JSON.read_text(encoding="utf-8"))
    return {c["name"] for c in data["champions"]}


def read_kaze_files() -> list[tuple[str, str]]:
    files: list[tuple[str, str]] = []
    if not KAZE_DIR.exists():
        raise SystemExit(f"Missing {KAZE_DIR}")
    for path in sorted(KAZE_DIR.glob("*.txt")):
        if path.name.lower() == "oracle.txt":
            continue
        raw = path.read_text(encoding="utf-8", errors="replace")
        files.append((path.stem, fix_transcript(raw)))
    return files


def extract_oracle_mtg() -> str:
    oracle = KAZE_DIR / "oracle.txt"
    if not oracle.exists():
        return ""
    text = oracle.read_text(encoding="utf-8")
    colors = re.findall(
        r"\{([WUBRG])\}\s*(White|Blue|Red|Black|Green):\s*(.+?)(?=\n\n|\{[WUBRG]\}|all champions|$)",
        text,
        re.S,
    )
    lines = [
        "# League of Legends — Système de couleurs (MTG × LoL)",
        "",
        "> Framework Kazewa/Kaze : chaque champion a une **identité couleur** (W/U/B/R/G).",
        "> Somme des 5 scores = **24** par champion. Utilisé pour draft, synergies et conflits.",
        "",
        "## Les 5 couleurs",
        "",
    ]
    color_fr = {
        "W": ("Blanc", "Structure & altruisme — peel, vision, objectifs d'équipe"),
        "U": ("Bleu", "Connaissance & contrôle — wave, picks, scaling calculé"),
        "B": ("Noir", "Pouvoir & sacrifice — snowball, assassin, hypercarry égoïste"),
        "R": ("Rouge", "Liberté & destruction — early bully, engage, tempo agressif"),
        "G": ("Vert", "Croissance & tradition — scale late, frontline, synergy 5v5"),
    }
    for code, title, _ in colors:
        fr_name, fr_desc = color_fr.get(code, (title, ""))
        body = _.strip().replace("\n", " ")
        lines.append(f"### {fr_name} `{{{code}}}` — {title}")
        lines.append("")
        lines.append(body[:600])
        lines.append("")

    lines.extend(
        [
            "## Dynamique de draft (comme MTG)",
            "",
            "| Relation | Exemple | Effet draft |",
            "|----------|---------|-------------|",
            "| **Allié** | W+G, W+U, U+G | Cohérence macro — bonus synergie |",
            "| **Neutre** | U+R, B+G | Plans mixtes — OK si rôle clair |",
            "| **Conflit** | W+B, U+R extrême, poke+engage | Pénalité — familles opposées |",
            "",
            "### Paires conflictuelles (même équipe)",
            "- **W + B** : altruisme vs égo snowball (ex. Lulu + Zed sans plan)",
            "- **U + R** : contrôle patient vs chaos early (ex. Orianna + Draven sans tempo)",
            "- **Poke + hard engage bot** : Xerath/Leona — conflit de win condition",
            "",
            "### Stacking couleur",
            "- **2+ picks même couleur dominante** → plan lisible (+draft score)",
            "- **4+ couleurs sans dominant** → composition incohérente (−draft score)",
            "",
        ]
    )
    return "\n".join(lines)


def process_transcripts(known: set[str]) -> dict:
    snippets: dict[str, list[str]] = defaultdict(list)
    vs_mentions: Counter[tuple[str, str]] = Counter()
    champ_mentions: Counter[str] = Counter()
    seen: set[str] = set()

    for source, text in read_kaze_files():
        for sent in split_sentences(text):
            if not is_educational(sent):
                continue
            key = re.sub(r"\s+", " ", sent.lower())[:120]
            if key in seen:
                continue
            seen.add(key)

            topic = topic_for(sent)
            clean = sent.strip()
            if len(snippets[topic]) < 80:
                snippets[topic].append(f"- [{source}] {clean}")

            for m in VS_PATTERN.finditer(sent):
                a = normalize_champ(m.group(1), known)
                b = normalize_champ(m.group(2), known)
                if a and b and a != b:
                    vs_mentions[(a, b)] += 1

            for name in known:
                if re.search(rf"(?<![\w-]){re.escape(name)}(?![\w-])", sent, re.I):
                    champ_mentions[name] += 1

    return {
        "snippets": dict(snippets),
        "vs_mentions": vs_mentions,
        "champ_mentions": champ_mentions,
    }


def write_database_md(data: dict, sources: list[str]) -> str:
    lines = [
        "# Kaze LoL Database — Synthèse transcripts",
        "",
        f"> **{len(sources)}** fichiers transcripts (`kaze/Lol_Database*.txt`) nettoyés et interprétés.",
        "> Termes LoL corrigés (Azir, Neeko, Sylas, wave, flex, etc.).",
        "",
        "## Sources",
        "",
    ]
    for s in sources:
        lines.append(f"- `{s}.txt`")
    lines.append("")

    for topic in [
        "Draft & flex",
        "Toplane & matchups",
        "Wave & tempo",
        "Macro & objectifs",
        "Teamfight & spacing",
        "Jungle",
        "Couleurs MTG",
        "Général",
    ]:
        items = data["snippets"].get(topic, [])
        if not items:
            continue
        lines.append(f"## {topic}")
        lines.append("")
        lines.extend(items[:25])
        lines.append("")

    return "\n".join(lines)


def write_draft_md(data: dict) -> str:
    draft = data["snippets"].get("Draft & flex", []) + data["snippets"].get("Teamfight & spacing", [])
    lines = [
        "# Kaze — Insights draft pro",
        "",
        "> Extraits éducatifs des analyses BO / draft Kazewa.",
        "",
        "## Règles récurrentes",
        "",
        "- Ban la **win condition**, pas le comfort pick.",
        "- **Flex** top/jungle/mid pour cacher le plan en BO.",
        "- **Double enchanter** requis si hypercarry immobile (ex. Zinghao B1 → Sejuani R1 sans double enchanter = next).",
        "- Comp **poke/disengage** : Braum/Taric > Leona/Nautilus.",
        "- **Side win** (blue/red) influence priorités — ne pas ignorer le contexte BO.",
        "- TF full tank (Dopa) : si tu n'attaques pas TF tank, tu perds — win condition différente.",
        "",
        "## Extraits transcript",
        "",
    ]
    lines.extend(draft[:40])
    return "\n".join(lines)


def write_matchups_md(data: dict, known: set[str]) -> str:
    vs = data["vs_mentions"]
    lines = [
        "# Kaze — Matchups mentionnés (transcripts)",
        "",
        "> Paires champion vs champion extraites des VOD/analyses. Complète l'algo, pas remplace curated.",
        "",
        "## Paires fréquentes",
        "",
        "| Champion | vs | Mentions |",
        "|----------|-----|----------|",
    ]
    for (a, b), n in vs.most_common(60):
        if n >= 1:
            lines.append(f"| {a} | {b} | {n} |")

    lines.extend(["", "## Champions les plus cités", ""])
    for name, n in data["champ_mentions"].most_common(40):
        if name in known:
            lines.append(f"- **{name}** — {n} mentions")

    return "\n".join(lines)


def main() -> None:
    known = load_champion_names()
    sources = [s for s, _ in read_kaze_files()]
    data = process_transcripts(known)

    db_md = write_database_md(data, sources)
    mtg_md = extract_oracle_mtg()
    draft_md = write_draft_md(data)
    matchups_md = write_matchups_md(data, known)

    OUT_DOCS.write_text(db_md, encoding="utf-8")
    SKILL_DIR.mkdir(parents=True, exist_ok=True)
    SKILL_OUTS["database"].write_text(db_md, encoding="utf-8")
    SKILL_OUTS["mtg"].write_text(mtg_md, encoding="utf-8")
    SKILL_OUTS["draft"].write_text(draft_md, encoding="utf-8")
    SKILL_OUTS["matchups"].write_text(matchups_md, encoding="utf-8")

    meta = {
        "sources": sources,
        "snippetCounts": {k: len(v) for k, v in data["snippets"].items()},
        "vsPairs": len(data["vs_mentions"]),
    }
    (ROOT / "data" / "kaze-extract-meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"Wrote {OUT_DOCS.name}")
    for p in SKILL_OUTS.values():
        print(f"Wrote skill: {p.name}")
    print(f"Snippets: {sum(len(v) for v in data['snippets'].values())}, vs pairs: {len(data['vs_mentions'])}")


if __name__ == "__main__":
    main()
