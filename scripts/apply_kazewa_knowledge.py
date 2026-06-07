#!/usr/bin/env python3
"""Merge Kazewa knowledge into guide-fr.json and tactics-meta hints."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE_MD = ROOT / "docs" / "kazewa-lol-knowledge.md"
GUIDE_PATHS = [ROOT / "data" / "guide-fr.json", ROOT / "public" / "data" / "guide-fr.json"]
TACTICS_PATHS = [ROOT / "data" / "tactics-meta.json", ROOT / "public" / "data" / "tactics-meta.json"]


def md_section(md: str, heading: str) -> str:
    marker = f"## {heading}"
    if marker not in md:
        return ""
    chunk = md.split(marker, 1)[1]
    if "## " in chunk:
        chunk = chunk.split("\n## ", 1)[0]
    return chunk.strip()


def md_to_html_block(md_chunk: str) -> str:
    """Minimal MD → HTML for guide sections."""
    lines = md_chunk.splitlines()
    html_parts: list[str] = []
    in_table = False
    for line in lines:
        line = line.strip()
        if not line or line == "---":
            continue
        if line.startswith("|") and "|" in line[1:]:
            if re.match(r"^\|[-:\s|]+\|$", line):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            if not in_table:
                html_parts.append("<table><tbody>")
                in_table = True
            html_parts.append(
                "<tr>" + "".join(f"<td>{escape_cell(c)}</td>" for c in cells) + "</tr>"
            )
            continue
        if in_table:
            html_parts.append("</tbody></table>")
            in_table = False
        if line.startswith("- "):
            if html_parts and not html_parts[-1].endswith("</ul>"):
                if not html_parts[-1].endswith("<ul>"):
                    html_parts.append("<ul>")
            html_parts.append(f"<li>{escape_cell(line[2:])}</li>")
        else:
            if html_parts and html_parts[-1].endswith("<ul>"):
                pass
            elif html_parts and "<ul>" in html_parts[-1] and not html_parts[-1].endswith("</ul>"):
                html_parts.append("</ul>")
            html_parts.append(f"<p>{escape_cell(line)}</p>")
    if in_table:
        html_parts.append("</tbody></table>")
    if any("<ul>" in p for p in html_parts) and not any("</ul>" in p for p in html_parts):
        html_parts.append("</ul>")
    return "".join(html_parts)


def escape_cell(text: str) -> str:
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = text.replace("&lt;strong&gt;", "<strong>").replace("&lt;/strong&gt;", "</strong>")
    text = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", text)
    return text


def apply_guide(md: str) -> None:
    principles = md_section(md, "Principes transversaux (Méthode Kazewa)")
    toplane = md_section(md, "Toplane & matchups")
    draft = md_section(md, "Draft & compositions pro")
    wave = md_section(md, "Wave & lane control")
    climb = md_section(md, "Climb & mental")

    new_sections = []
    if principles:
        new_sections.append(
            {
                "id": "kazewa-principles",
                "title": "Méthode Kazewa — principes",
                "html": md_to_html_block(principles),
            }
        )
    if toplane:
        new_sections.append(
            {
                "id": "kazewa-top",
                "title": "Toplane (Kazewa)",
                "html": md_to_html_block(toplane[:12000]),
            }
        )
    if wave:
        new_sections.append(
            {
                "id": "kazewa-wave",
                "title": "Waves & tempo lane",
                "html": md_to_html_block(wave[:8000]),
            }
        )
    if draft:
        new_sections.append(
            {
                "id": "kazewa-draft",
                "title": "Draft pro (analyses Kazewa)",
                "html": md_to_html_block(draft[:8000]),
            }
        )
    if climb:
        new_sections.append(
            {
                "id": "kazewa-climb",
                "title": "Climb & mental",
                "html": md_to_html_block(climb[:6000]),
            }
        )

    for path in GUIDE_PATHS:
        if not path.exists():
            continue
        guide = json.loads(path.read_text(encoding="utf-8"))
        base = [s for s in guide.get("sections", []) if not s.get("id", "").startswith("kazewa-")]
        guide["sections"] = base + new_sections
        guide["kazewaKnowledge"] = str(KNOWLEDGE_MD.name)
        path.write_text(json.dumps(guide, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Updated guide: {path.name} (+{len(new_sections)} sections)")


def apply_tactics_meta(_md: str) -> None:
    """Les conseils macro sont générés dynamiquement par l'app (comps 5/5) — pas de coachNotes statiques."""
    for path in TACTICS_PATHS:
        if not path.exists():
            continue
        meta = json.loads(path.read_text(encoding="utf-8"))
        meta.pop("coachNotes", None)
        meta.pop("kazewaSource", None)
        meta.pop("kazeSource", None)
        path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Updated tactics-meta: {path.name} (coachNotes retirés)")


def main() -> None:
    if not KNOWLEDGE_MD.exists():
        raise SystemExit(f"Missing {KNOWLEDGE_MD} — run extract_kazewa_knowledge.py")
    md = KNOWLEDGE_MD.read_text(encoding="utf-8")
    apply_guide(md)
    apply_tactics_meta(md)


if __name__ == "__main__":
    main()
