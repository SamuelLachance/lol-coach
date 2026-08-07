#!/usr/bin/env node
/**
 * AXE 2 — test décisif : on REMPLACE les données 2026 par leurs équivalents RÉELS 2022
 * (tiers reconstruits depuis la priorité pro 2022, laneRates réels 2022) et on remesure.
 *
 * Protocole sans fuite : les tiers/laneRates 2022 sont estimés UNIQUEMENT sur les patchs
 * de la première partie de la saison (train), l'accuracy est mesurée sur les patchs suivants (test).
 * On compare, sur le MÊME jeu de test : moteur 2026 vs moteur nourri en 2022.
 *
 * Usage : node scripts/analysis/axe2_inject2022.mjs [--json out.json]
 */
import { writeFileSync } from "fs";
import { loadEngine, loadChampionData, readGames, buildNameMap, makeDataset, wilson, mcnemar, SLOTS, CSV } from "./lib.mjs";

function arg(f, d = null) {
  const i = process.argv.indexOf(f);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
}

const { champs, meta: metaSrc } = loadChampionData();
const { map: nameMap, norm } = buildNameMap(champs);
const { games, picks } = readGames(CSV);

const patchNum = (p) => Number(String(p).replace(/[^0-9.]/g, "")) || 0;

const rows = [];
for (const g of games) {
  const toFr = (o) => Object.values(o).map((n) => nameMap.get(norm(n)));
  const blue = toFr(g.blue);
  const red = toFr(g.red);
  if (blue.some((x) => !x) || red.some((x) => !x)) continue;
  rows.push({ id: g.id, patch: g.patch, pn: patchNum(g.patch), blueWin: g.blueWin, blue, red });
}
rows.sort((a, b) => a.pn - b.pn);
const cutIdx = Math.floor(rows.length * 0.6);
const cutPn = rows[cutIdx].pn;
const train = rows.filter((r) => r.pn < cutPn);
const test = rows.filter((r) => r.pn >= cutPn);
const trainIds = new Set(train.map((r) => r.id));

/* ---- statistiques 2022 estimées sur le TRAIN uniquement ---- */
const st = new Map();
for (const p of picks) {
  if (!trainIds.has(p.gameid)) continue;
  const fr = nameMap.get(norm(p.champion));
  if (!fr) continue;
  let s = st.get(fr);
  if (!s) {
    s = { picks: 0, wins: 0, byPos: {} };
    st.set(fr, s);
  }
  s.picks += 1;
  if (p.win) s.wins += 1;
  s.byPos[p.position] = (s.byPos[p.position] || 0) + 1;
}
const trainGamesN = train.length;

// Tiers 2022 par priorité pro (présence), calqués sur la distribution 2026 : S=21, A=27, B=41, C=52, D=31
const dist2026 = { S: 0, A: 0, B: 0, C: 0, D: 0 };
for (const c of champs) dist2026[c.tierMeta || "C"] = (dist2026[c.tierMeta || "C"] || 0) + 1;
const ranked = champs
  .map((c) => ({ name: c.name, presence: (st.get(c.name)?.picks || 0) / Math.max(1, trainGamesN) }))
  .sort((a, b) => b.presence - a.presence);
const tier2022 = new Map();
let k = 0;
for (const t of ["S", "A", "B", "C", "D"]) {
  for (let i = 0; i < dist2026[t] && k < ranked.length; i += 1, k += 1) tier2022.set(ranked[k].name, t);
}

// Variante "tiers par winrate 2022" (même distribution, tri par winrate lissé)
const rankedWr = champs
  .map((c) => {
    const s = st.get(c.name);
    const n = s?.picks || 0;
    const wr = (((s?.wins || 0) + 25) / (n + 50)) * 100; // lissage bayésien vers 50 %
    return { name: c.name, wr: n >= 20 ? wr : 50 };
  })
  .sort((a, b) => b.wr - a.wr);
const tierWr2022 = new Map();
k = 0;
for (const t of ["S", "A", "B", "C", "D"]) {
  for (let i = 0; i < dist2026[t] && k < rankedWr.length; i += 1, k += 1) tierWr2022.set(rankedWr[k].name, t);
}

// laneRates réels 2022
const rates2022 = new Map();
for (const [name, s] of st) {
  if (s.picks < 10) continue;
  const r = {};
  for (const sl of SLOTS) r[sl] = { games: s.byPos[sl] || 0, rate: +(((s.byPos[sl] || 0) / s.picks) * 100).toFixed(2) };
  rates2022.set(name, r);
}

/* ---- variantes ---- */
function build(mode) {
  const { byName, meta } = makeDataset(champs, metaSrc, {});
  if (mode === "base2026") return { byName, meta };
  for (const [name, c] of byName) {
    if (mode === "tiers2022_presence" || mode === "tout2022") {
      if (tier2022.has(name)) c.tierMeta = tier2022.get(name);
    }
    if (mode === "tiers2022_winrate") {
      if (tierWr2022.has(name)) c.tierMeta = tierWr2022.get(name);
    }
    if (mode === "laneRates2022" || mode === "tout2022") {
      if (rates2022.has(name)) {
        c.laneRates = rates2022.get(name);
        const viable = SLOTS.filter((s) => c.laneRates[s].rate >= 10);
        c.optimalSlots = viable.length ? viable : c.optimalSlots;
        delete c.mainRole;
      }
    }
  }
  return { byName, meta };
}

const MODES = ["base2026", "tiers2022_presence", "tiers2022_winrate", "laneRates2022", "tout2022"];
const res = [];
const vecs = {};
for (const mode of MODES) {
  const sandbox = loadEngine();
  const SC = sandbox.LoLDraftScoring;
  const { byName, meta } = build(mode);
  let correct = 0;
  let ties = 0;
  const vec = new Uint8Array(test.length);
  for (let i = 0; i < test.length; i += 1) {
    const r = test[i];
    const d = SC.evaluateDraftDuel(r.blue, r.red, { byName, metaMap: meta });
    if (d.margin === 0) ties += 1;
    else if (d.margin > 0 === r.blueWin) {
      correct += 1;
      vec[i] = 1;
    }
  }
  vecs[mode] = vec;
  const dec = test.length - ties;
  res.push({
    variante: mode,
    partiesTest: test.length,
    accuracyPct: +((correct / dec) * 100).toFixed(2),
    ic95: wilson(correct, dec),
  });
  console.error(`${mode.padEnd(22)} ${((correct / dec) * 100).toFixed(2)}%`);
}

const base = vecs.base2026;
const paired = MODES.slice(1).map((m) => {
  const v = vecs[m];
  let b = 0;
  let c = 0;
  for (let i = 0; i < base.length; i += 1) {
    if (base[i] && !v[i]) b += 1;
    else if (!base[i] && v[i]) c += 1;
  }
  const mc = mcnemar(b, c);
  return { variante: m, deltaPts: +(((c - b) / base.length) * 100).toFixed(2), desaccords: b + c, p: mc.p };
});

const out = {
  protocole: {
    partiesTotal: rows.length,
    patchCoupure: rows[cutIdx].patch,
    partiesTrain: train.length,
    partiesTest: test.length,
    baselineBleuSurTestPct: +((test.filter((r) => r.blueWin).length / test.length) * 100).toFixed(2),
  },
  concordanceTiers: (() => {
    let same = 0;
    let n = 0;
    for (const c of champs) {
      if (!tier2022.has(c.name)) continue;
      n += 1;
      if (tier2022.get(c.name) === c.tierMeta) same += 1;
    }
    return { champions: n, memeTier: same, pctMemeTier: +((same / n) * 100).toFixed(1) };
  })(),
  tierS2022ParPresence: ranked.slice(0, dist2026.S).map((r) => ({
    champion: r.name,
    presenceTrainPct: +(r.presence * 100).toFixed(1),
    tier2026: champs.find((c) => c.name === r.name)?.tierMeta,
  })),
  resultats: res,
  comparaisonsAppariees: paired,
};

const o = arg("--json");
if (o) writeFileSync(o, JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));
