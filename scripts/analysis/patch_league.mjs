#!/usr/bin/env node
/**
 * AXE 2 — Q4 : l'accuracy du moteur varie-t-elle selon le patch 2022 et la ligue ?
 * Dump également les marges de base par partie (réutilisées par ceiling.mjs).
 * Usage : node scripts/analysis/patch_league.mjs [--json out.json]
 */
import { writeFileSync } from "fs";
import { loadEngine, loadChampionData, readGames, buildNameMap, makeDataset, wilson, CSV } from "./lib.mjs";

function arg(f, d = null) {
  const i = process.argv.indexOf(f);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
}

const MAJORS = new Set(["LCK", "LPL", "LEC", "LCS", "WLDs", "MSI"]);

const { champs, meta: metaSrc } = loadChampionData();
const { map: nameMap, norm } = buildNameMap(champs);
const { games } = readGames(CSV);
const sandbox = loadEngine();
const SC = sandbox.LoLDraftScoring;
const { byName, meta } = makeDataset(champs, metaSrc, {});

const rows = [];
for (const g of games) {
  const toFr = (o) => Object.values(o).map((n) => nameMap.get(norm(n)));
  const blue = toFr(g.blue);
  const red = toFr(g.red);
  if (blue.some((x) => !x) || red.some((x) => !x)) continue;
  const d = SC.evaluateDraftDuel(blue, red, { byName, metaMap: meta });
  rows.push({
    id: g.id,
    league: g.league,
    patch: g.patch,
    date: g.date,
    playoffs: g.playoffs,
    blueWin: g.blueWin,
    margin: d.margin,
    p: d.winProb?.our ?? 0.5,
    blue,
    red,
  });
}

function acc(sub, label) {
  let correct = 0;
  let ties = 0;
  let blueWins = 0;
  for (const r of sub) {
    if (r.blueWin) blueWins += 1;
    if (r.margin === 0) ties += 1;
    else if (r.margin > 0 === r.blueWin) correct += 1;
  }
  const dec = sub.length - ties;
  return {
    label,
    parties: sub.length,
    accuracyPct: dec ? +((correct / dec) * 100).toFixed(2) : null,
    ic95: dec ? wilson(correct, dec) : null,
    baselineBleuPct: +((blueWins / sub.length) * 100).toFixed(2),
    ecartVsBaselinePts: dec ? +(((correct / dec) * 100 - (blueWins / sub.length) * 100).toFixed(2)) : null,
  };
}

function group(key, minN, sortNum = false) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  let entries = [...m.entries()].filter(([, v]) => v.length >= minN);
  entries.sort((a, b) => (sortNum ? Number(a[0]) - Number(b[0]) : b[1].length - a[1].length));
  return entries.map(([k, v]) => acc(v, String(k)));
}

const majors = rows.filter((r) => MAJORS.has(r.league));
const minors = rows.filter((r) => !MAJORS.has(r.league));
const patches = group("patch", 150, true);
const accs = patches.map((p) => p.accuracyPct);

const out = {
  parties: rows.length,
  global: acc(rows, "toutes"),
  Q4_parPatch: patches,
  dispersionPatch: {
    n: accs.length,
    min: Math.min(...accs),
    max: Math.max(...accs),
    etendue: +(Math.max(...accs) - Math.min(...accs)).toFixed(2),
    ecartType: +Math.sqrt(
      accs.reduce((s, a) => s + (a - accs.reduce((x, y) => x + y, 0) / accs.length) ** 2, 0) / accs.length
    ).toFixed(2),
  },
  Q4_majeuresVsMineures: [acc(majors, "ligues majeures (LCK/LPL/LEC/LCS/MSI/Worlds)"), acc(minors, "ligues mineures")],
  Q4_parLigueMajeure: ["LCK", "LPL", "LEC", "LCS", "WLDs", "MSI"]
    .map((l) => {
      const s = rows.filter((r) => r.league === l);
      return s.length >= 100 ? acc(s, l) : null;
    })
    .filter(Boolean),
  Q4_parLigue: group("league", 300),
  Q4_playoffs: [acc(rows.filter((r) => r.playoffs), "playoffs"), acc(rows.filter((r) => !r.playoffs), "saison régulière")],
};

const o = arg("--json");
if (o) writeFileSync(o, JSON.stringify(out, null, 2), "utf8");
// dump léger pour ceiling.mjs
writeFileSync(
  new URL("./base_margins.json", import.meta.url),
  JSON.stringify(rows.map((r) => ({ i: r.id, l: r.league, pa: r.patch, w: r.blueWin, m: r.margin, b: r.blue, r: r.red }))),
  "utf8"
);
console.log(JSON.stringify(out, null, 2));
