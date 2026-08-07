#!/usr/bin/env node
/** Tests données publiées : antisymétrie lane-matchups, 172 clés partout, index léger, patch-defaults réel. */
import { readFileSync, statSync } from "fs";
import { join } from "path";
import { assert, root } from "./_harness.mjs";

function loadData(name) {
  return JSON.parse(readFileSync(join(root, "public/data", name), "utf8"));
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function main() {
  const champs = loadData("champions.json");
  const index = loadData("champions-index.json");
  const tactics = loadData("tactics-meta.json");
  const mtg = loadData("mtg-colors.json");
  const classes = loadData("champion-classes.json");
  const lanes = loadData("lane-matchups.json");
  const patch = loadData("patch-defaults.json");

  // 172 clés partout
  const names = new Set(champs.champions.map((c) => c.name));
  assert(names.size === champs.champions.length, "noms dupliqués dans champions.json");
  const sets = {
    "champions-index": new Set(index.champions.map((c) => c.name)),
    "tactics-meta": new Set(Object.keys(tactics.champions)),
    "mtg-colors": new Set(Object.keys(mtg.champions)),
    "champion-classes": new Set(Object.keys(classes.champions)),
    "lane-matchups": new Set(lanes.champs),
  };
  for (const [label, other] of Object.entries(sets)) {
    assert(other.size === names.size, `${label}: ${other.size} clés au lieu de ${names.size}`);
    for (const n of names) assert(other.has(n), `${label}: ${n} manquant`);
  }

  // Antisymétrie échantillonnée + diagonale nulle
  const n = lanes.champs.length;
  const rnd = mulberry32(20260806);
  for (let k = 0; k < 200; k += 1) {
    const ia = Math.floor(rnd() * n);
    let ib = Math.floor(rnd() * (n - 1));
    if (ib >= ia) ib += 1;
    for (const slot of lanes.slots) {
      const packed = lanes.margins[slot];
      assert(
        packed[ia * n + ib] === -packed[ib * n + ia],
        `antisymétrie violée: ${lanes.champs[ia]} vs ${lanes.champs[ib]} ${slot}`
      );
    }
  }
  for (const slot of lanes.slots) {
    const packed = lanes.margins[slot];
    for (let i = 0; i < n; i += 1) {
      assert(packed[i * n + i] === 0, `diagonale non nulle: ${lanes.champs[i]} ${slot} = ${packed[i * n + i]}`);
    }
  }

  // Index de premier rendu < 500 Ko
  const sizeKb = statSync(join(root, "public/data/champions-index.json")).size / 1024;
  assert(sizeKb < 500, `champions-index.json trop lourd: ${Math.round(sizeKb)} KB`);
  for (const c of index.champions) {
    assert(!c.allPairings && !c.allCounters && !c.tierAnalysis, `${c.name}: index doit rester allégé`);
    assert((c.bestCounters || []).length <= 5 && (c.bestPairings || []).length <= 5, `${c.name}: listes index > 5`);
  }

  // draftProfile : jamais 0/0
  for (const src of [champs.champions, index.champions]) {
    for (const c of src) {
      const dp = c.draftProfile || {};
      assert((dp.adShare || 0) + (dp.apShare || 0) > 0, `${c.name}: adShare+apShare == 0`);
    }
  }

  // colorIdentity synchronisé avec mtg-colors
  const idxBy = new Map(index.champions.map((c) => [c.name, c]));
  for (const c of champs.champions) {
    const m = mtg.champions[c.name];
    const i = idxBy.get(c.name);
    for (const k of ["W", "U", "B", "R", "G"]) {
      assert(c.colorIdentity?.[k] === m[k], `${c.name}: colorIdentity.${k} désynchronisé (champions vs mtg)`);
      assert(i.colorIdentity?.[k] === m[k], `${c.name}: colorIdentity.${k} désynchronisé (index vs mtg)`);
    }
    assert(c.colorIdentity?.identity === m.identity, `${c.name}: identity désynchronisée`);
  }

  // patch-defaults réel
  assert(!/test/i.test(String(patch.label || "")), `patch-defaults: label de test (${patch.label})`);
  assert(patch.updatedAt > 1_700_000_000_000, `patch-defaults: updatedAt factice (${patch.updatedAt})`);
  assert(patch.overrides && typeof patch.overrides === "object", "patch-defaults: overrides manquant");

  // tactics-meta sans worstMatchups
  for (const [cname, entry] of Object.entries(tactics.champions)) {
    assert(!("worstMatchups" in entry), `tactics-meta: worstMatchups encore présent (${cname})`);
  }

  // pas de chemin local publié
  const rootStr = JSON.stringify([champs.matchupSource, champs.matchupCurated, champs.matchupFamilies]);
  assert(!/[A-Z]:\\\\|Users\\\\/.test(rootStr), `chemins locaux publiés: ${rootStr}`);

  console.log(`OK — données: 172 clés alignées, antisymétrie, index ${Math.round(sizeKb)} KB, patch-defaults réel`);
}

main();
