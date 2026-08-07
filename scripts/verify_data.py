#!/usr/bin/env python3
"""Vérifications de cohérence des données publiées (CI) — sortie non nulle si échec."""

from __future__ import annotations

import json
import random
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"

ERRORS: list[str] = []


def fail(msg: str) -> None:
    ERRORS.append(msg)
    print(f"FAIL {msg}")


def ok(msg: str) -> None:
    print(f"ok   {msg}")


def load(name: str) -> dict:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def norm(name: str) -> str:
    text = unicodedata.normalize("NFD", str(name or ""))
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]", "", text)


def entry_names(entries: list) -> list[str]:
    out = []
    for e in entries or []:
        out.append(e["name"] if isinstance(e, dict) else e)
    return out


def main() -> int:
    champs = load("champions.json")
    index = load("champions-index.json")
    tactics = load("tactics-meta.json")
    mtg = load("mtg-colors.json")
    classes = load("champion-classes.json")
    lanes = load("lane-matchups.json")
    patch = load("patch-defaults.json")

    names = {c["name"] for c in champs["champions"]}

    # 1. Mêmes noms partout
    sets = {
        "champions-index": {c["name"] for c in index["champions"]},
        "tactics-meta": set(tactics["champions"]),
        "mtg-colors": set(mtg["champions"]),
        "champion-classes": set(classes["champions"]),
        "lane-matchups": set(lanes["champs"]),
    }
    for label, other in sets.items():
        if other != names:
            fail(f"{label}: noms divergents (+{sorted(other - names)[:3]} / -{sorted(names - other)[:3]})")
        else:
            ok(f"{label}: {len(other)} noms alignés")

    # 2. Références pendantes bestCounters / bestPairings
    dangling = []
    for source, entries in (("champions", champs["champions"]), ("champions-index", index["champions"])):
        for c in entries:
            for field in ("bestCounters", "bestPairings", "allCounters", "allPairings"):
                for ref in entry_names(c.get(field)):
                    if ref not in names:
                        dangling.append(f"{source}:{c['name']}.{field} -> {ref}")
    for cname, entry in tactics["champions"].items():
        for field in ("bestCounters", "bestPairings"):
            for ref in entry_names(entry.get(field)):
                if ref not in names:
                    dangling.append(f"tactics-meta:{cname}.{field} -> {ref}")
    if dangling:
        fail(f"références pendantes: {dangling[:5]} ({len(dangling)} au total)")
    else:
        ok("bestCounters/bestPairings: aucune référence pendante")

    # 2b. MECH (draft-interactions.js) — tout nom cité doit exister
    norm_names = {norm(n) for n in names}
    js = (ROOT / "public" / "draft-interactions.js").read_text(encoding="utf-8")
    mech_match = re.search(r"const MECH = \{(.*?)\n  \};", js, re.S)
    if not mech_match:
        fail("MECH introuvable dans draft-interactions.js")
    else:
        cited = re.findall(r'"([^"]+)"', mech_match.group(1))
        missing = sorted({n for n in cited if norm(n) not in norm_names})
        if missing:
            fail(f"MECH: noms inconnus {missing}")
        else:
            ok(f"MECH: {len(set(cited))} noms valides")

    # 3. Antisymétrie échantillonnée + diagonale nulle
    n = len(lanes["champs"])
    rng = random.Random(20260806)
    violations = 0
    for _ in range(200):
        ia, ib = rng.sample(range(n), 2)
        for slot in lanes["slots"]:
            packed = lanes["margins"][slot]
            if packed[ia * n + ib] != -packed[ib * n + ia]:
                violations += 1
    for slot in lanes["slots"]:
        packed = lanes["margins"][slot]
        for i in range(n):
            if packed[i * n + i] != 0:
                violations += 1
    if violations:
        fail(f"lane-matchups: {violations} violations antisymétrie/diagonale")
    else:
        ok("lane-matchups: antisymétrie (200 paires × 5 lanes) et diagonale nulle")

    # 4. adShare + apShare > 0 partout
    for source, entries in (("champions", champs["champions"]), ("champions-index", index["champions"])):
        broken = [
            c["name"]
            for c in entries
            if (c.get("draftProfile", {}).get("adShare") or 0) + (c.get("draftProfile", {}).get("apShare") or 0) <= 0
        ]
        if broken:
            fail(f"{source}: adShare+apShare == 0 pour {broken[:5]}")
        else:
            ok(f"{source}: adShare+apShare > 0 partout")

    # 5. colorIdentity identique champions / index / mtg-colors
    idx_by = {c["name"]: c for c in index["champions"]}
    diverging = []
    for c in champs["champions"]:
        cname = c["name"]
        ci = c.get("colorIdentity") or {}
        ci_idx = idx_by.get(cname, {}).get("colorIdentity") or {}
        ci_mtg = mtg["champions"].get(cname) or {}
        a = {k: ci.get(k) for k in "WUBRG"}
        b = {k: ci_idx.get(k) for k in "WUBRG"}
        m = {k: ci_mtg.get(k) for k in "WUBRG"}
        if a != b or a != m or ci.get("identity") != ci_mtg.get("identity"):
            diverging.append(cname)
    if diverging:
        fail(f"colorIdentity divergent: {diverging[:5]} ({len(diverging)} au total)")
    else:
        ok("colorIdentity: champions.json == champions-index.json == mtg-colors.json")

    # 6. patch-defaults réel
    if "test" in str(patch.get("label", "")).lower() or not isinstance(patch.get("overrides"), dict):
        fail(f"patch-defaults: payload de test ({patch.get('label')})")
    else:
        ok(f"patch-defaults: {patch.get('label')}")

    # 7. tactics-meta sans worstMatchups
    with_worst = [n2 for n2, e in tactics["champions"].items() if "worstMatchups" in e]
    if with_worst:
        fail(f"tactics-meta: worstMatchups encore présent pour {with_worst[:5]}")
    else:
        ok("tactics-meta: worstMatchups supprimé")

    if ERRORS:
        print(f"\n{len(ERRORS)} vérification(s) en échec")
        return 1
    print("\nOK — données cohérentes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
