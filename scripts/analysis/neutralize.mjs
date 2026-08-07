#!/usr/bin/env node
/**
 * AXE 2 — Q1/Q2 : neutraliser chaque bloc de données 2026 et remesurer l'accuracy 2022.
 * Usage : node scripts/analysis/neutralize.mjs [--max N] [--json out.json]
 */
import { writeFileSync } from "fs";
import {
  loadEngine,
  loadChampionData,
  readGames,
  buildNameMap,
  makeDataset,
  wilson,
  mcnemar,
  pearson,
  CSV,
} from "./lib.mjs";

function arg(f, d = null) {
  const i = process.argv.indexOf(f);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
}

const MAX = Number(arg("--max", "0")) || 0;

const { champs, meta: metaSrc } = loadChampionData();
const { map: nameMap, norm } = buildNameMap(champs);
const { games } = readGames(CSV);

// Pré-traduction EN -> FR, on garde les parties entièrement mappables.
const rows = [];
for (const g of games) {
  const toFr = (o) => Object.values(o).map((n) => nameMap.get(norm(n)));
  const blue = toFr(g.blue);
  const red = toFr(g.red);
  if (blue.some((x) => !x) || red.some((x) => !x)) continue;
  rows.push({ id: g.id, league: g.league, patch: g.patch, blueWin: g.blueWin, blue, red });
  if (MAX && rows.length >= MAX) break;
}
console.error(`parties évaluables : ${rows.length} / ${games.length}`);

const VARIANTS = [
  ["base", {}],
  ["neutre:tiers", { tiers: true }],
  ["neutre:laneRates", { laneRates: true }],
  ["neutre:family", { family: true }],
  ["neutre:colors", { colors: true }],
  ["neutre:matchups", { matchups: true }],
  ["neutre:TOUT", { tiers: true, laneRates: true, family: true, colors: true, matchups: true }],
];

const results = [];
const correctVec = {};
const marginVec = {};

for (const [label, mods] of VARIANTS) {
  const t0 = Date.now();
  const sandbox = loadEngine();
  const SC = sandbox.LoLDraftScoring;
  const { byName, meta } = makeDataset(champs, metaSrc, mods);
  let correct = 0;
  let ties = 0;
  let brier = 0;
  let bluePred = 0;
  let sumAbsMargin = 0;
  const vec = new Uint8Array(rows.length);
  const mv = new Float64Array(rows.length);
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const d = SC.evaluateDraftDuel(r.blue, r.red, { byName, metaMap: meta });
    const m = d.margin;
    mv[i] = m;
    const p = d.winProb?.our ?? 0.5;
    sumAbsMargin += Math.abs(m);
    if (m > 0) bluePred += 1;
    if (m === 0) ties += 1;
    else if (m > 0 === r.blueWin) {
      correct += 1;
      vec[i] = 1;
    }
    const y = r.blueWin ? 1 : 0;
    brier += (p - y) ** 2;
    r[`m_${label}`] = m;
  }
  const decisive = rows.length - ties;
  correctVec[label] = vec;
  marginVec[label] = mv;
  const acc = (correct / decisive) * 100;
  results.push({
    variante: label,
    n: rows.length,
    decisives: decisive,
    accuracyPct: +acc.toFixed(2),
    ic95: wilson(correct, decisive),
    brier: +(brier / rows.length).toFixed(4),
    partBleuPredit: +((bluePred / decisive) * 100).toFixed(1),
    margeAbsMoyenne: +(sumAbsMargin / rows.length).toFixed(1),
    secondes: +((Date.now() - t0) / 1000).toFixed(1),
  });
  console.error(`${label.padEnd(20)} acc=${acc.toFixed(2)}%  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

// Comparaisons appariées vs base (McNemar)
const base = correctVec.base;
const paired = [];
for (const [label] of VARIANTS.slice(1)) {
  const v = correctVec[label];
  let b = 0;
  let c = 0;
  for (let i = 0; i < base.length; i += 1) {
    if (base[i] && !v[i]) b += 1;
    else if (!base[i] && v[i]) c += 1;
  }
  const mc = mcnemar(b, c);
  // Sensibilité : la neutralisation déplace-t-elle réellement la marge ?
  const bm = marginVec.base;
  const vm = marginVec[label];
  let sumAbs = 0;
  let moved = 0;
  const deltas = [];
  for (let i = 0; i < bm.length; i += 1) {
    const d = Math.abs(vm[i] - bm[i]);
    sumAbs += d;
    if (d > 1) moved += 1;
    deltas.push(d);
  }
  deltas.sort((x, y) => x - y);
  paired.push({
    variante: label,
    deltaAccuracyPts: +(((c - b) / base.length) * 100).toFixed(2),
    baseSeuleCorrecte: b,
    varianteSeuleCorrecte: c,
    chi2: mc.chi2,
    p: mc.p,
    sensibilite: {
      deltaMargeAbsMoyen: +(sumAbs / bm.length).toFixed(1),
      deltaMargeAbsMedian: +deltas[Math.floor(bm.length / 2)].toFixed(1),
      pctPartiesMargeDeplacee: +((moved / bm.length) * 100).toFixed(1),
      correlationMargeAvecBase: +(pearson([...bm], [...vm]) ?? 0).toFixed(4),
    },
  });
}

const blueBase = rows.filter((r) => r.blueWin).length;
const out = {
  parties: rows.length,
  baselineBleuToujoursPct: +((blueBase / rows.length) * 100).toFixed(2),
  baselineIc95: wilson(blueBase, rows.length),
  variantes: results,
  comparaisonsApparieesVsBase: paired,
};
const o = arg("--json");
if (o) writeFileSync(o, JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));
