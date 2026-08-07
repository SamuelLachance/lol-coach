#!/usr/bin/env node
/**
 * AXE 2 — désagrégation du bloc "family" : la neutralisation groupée mélangeait
 * championFamily/compTypes ET les tags tactiques de tactics-meta.json.
 * On les sépare pour savoir laquelle des deux données 2026 pèse.
 * Usage : node scripts/analysis/axe2_family_split.mjs [--max N] [--json out.json]
 */
import { writeFileSync } from "fs";
import { loadEngine, loadChampionData, readGames, buildNameMap, wilson, mcnemar, pearson, CSV } from "./lib.mjs";

function arg(f, d = null) {
  const i = process.argv.indexOf(f);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
}
const MAX = Number(arg("--max", "0")) || 0;

const { champs, meta: metaSrc } = loadChampionData();
const { map: nameMap, norm } = buildNameMap(champs);
const { games } = readGames(CSV);
const rows = [];
for (const g of games) {
  const toFr = (o) => Object.values(o).map((n) => nameMap.get(norm(n)));
  const blue = toFr(g.blue);
  const red = toFr(g.red);
  if (blue.some((x) => !x) || red.some((x) => !x)) continue;
  rows.push({ blueWin: g.blueWin, blue, red });
  if (MAX && rows.length >= MAX) break;
}

function dataset(mode) {
  const meta = JSON.parse(JSON.stringify(metaSrc));
  const byName = new Map();
  for (const src of champs) {
    const c = { ...src };
    if (mode === "familleSeule" || mode === "familleEtTags") c.championFamily = {};
    if (mode === "tagsSeuls" || mode === "familleEtTags") {
      c.tacticTags = [];
      c.gameplayStyle = undefined;
    }
    if (mode === "draftProfileSeul") c.draftProfile = undefined;
    byName.set(c.name, c);
  }
  for (const k of Object.keys(meta)) {
    const m = meta[k];
    if (mode === "familleSeule" || mode === "familleEtTags") {
      m.compTypes = [];
      m.family = "";
      m.familyLabel = "";
    }
    if (mode === "tagsSeuls" || mode === "familleEtTags") m.tags = [];
    if (mode === "draftProfileSeul") m.draftProfile = undefined;
  }
  return { byName, meta };
}

const MODES = [
  "base",
  "familleSeule",
  "tagsSeuls",
  "familleEtTags",
  "draftProfileSeul",
  "sansChampionClasses",
  "sansLaneMatchupsPrecalcules",
];
const res = [];
const vecs = {};
const margins = {};
for (const mode of MODES) {
  const sandbox = loadEngine({
    classes: mode !== "sansChampionClasses",
    laneMatchups: mode !== "sansLaneMatchupsPrecalcules",
  });
  const SC = sandbox.LoLDraftScoring;
  const { byName, meta } = dataset(mode);
  let correct = 0;
  let ties = 0;
  const vec = new Uint8Array(rows.length);
  const mv = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const d = SC.evaluateDraftDuel(r.blue, r.red, { byName, metaMap: meta });
    mv[i] = d.margin;
    if (d.margin === 0) ties += 1;
    else if (d.margin > 0 === r.blueWin) {
      correct += 1;
      vec[i] = 1;
    }
  }
  vecs[mode] = vec;
  margins[mode] = mv;
  const dec = rows.length - ties;
  res.push({ variante: mode, parties: rows.length, accuracyPct: +((correct / dec) * 100).toFixed(2), ic95: wilson(correct, dec) });
  console.error(`${mode.padEnd(20)} ${((correct / dec) * 100).toFixed(2)}%`);
}

const base = vecs.base;
const paired = MODES.slice(1).map((m) => {
  const v = vecs[m];
  let b = 0;
  let c = 0;
  for (let i = 0; i < base.length; i += 1) {
    if (base[i] && !v[i]) b += 1;
    else if (!base[i] && v[i]) c += 1;
  }
  let sa = 0;
  for (let i = 0; i < base.length; i += 1) sa += Math.abs(margins[m][i] - margins.base[i]);
  return {
    variante: m,
    deltaPts: +(((c - b) / base.length) * 100).toFixed(2),
    desaccords: b + c,
    p: mcnemar(b, c).p,
    deltaMargeAbsMoyen: +(sa / base.length).toFixed(1),
    correlationMargeAvecBase: +(pearson([...margins.base], [...margins[m]]) ?? 0).toFixed(4),
  };
});

const out = { parties: rows.length, resultats: res, comparaisonsAppariees: paired };
const o = arg("--json");
if (o) writeFileSync(o, JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));
