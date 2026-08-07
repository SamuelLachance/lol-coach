#!/usr/bin/env node
/**
 * AXE 3 — validation empirique règle par règle sur Oracle's Elixir 2022.
 *
 * 1. COMP_CLASH_RULES + TEAM_TRAIT_RULES : quand la règle se déclenche pour un
 *    seul camp, ce camp gagne-t-il ?
 * 2. CHAMP_PAIR_RULES : idem (déclenchements nets attaquant/défenseur), toutes
 *    paires croisées + restriction même lane.
 * 3. CURATED_COUNTERS : quand l'attaquant X affronte le défenseur Y, X gagne-t-il ?
 *    (toutes positions + même lane)
 * 4. Matrice plan × plan + confrontation avec COMP_TYPE_COUNTERS.
 * 5. Matrice de lane (public/data/lane-matchups.json) : corrélation marge / victoire.
 *
 * Chaque taux est accompagné de n et d'un intervalle de Wilson 95 %. Comme le côté
 * bleu gagne plus souvent (52,5 %), on rapporte aussi l'espérance nulle « attendue »
 * compte tenu de la répartition bleu/rouge des déclenchements (expectedPct) et
 * l'écart (edgePct = observé − attendu).
 *
 * Usage : node scripts/analysis/validate_rules.mjs [--csv f] [--max N] [--json out]
 */
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { loadEngine, prepareGames, wilson, pearson, arg, DEFAULT_CSV, SLOTS, root } from "./_common.mjs";

const csvPath = arg("--csv", DEFAULT_CSV);
const maxGames = Number(arg("--max", "0")) || 0;
if (!existsSync(csvPath)) {
  console.error(`CSV introuvable : ${csvPath}`);
  process.exit(2);
}

const env = loadEngine();
const { sandbox, meta, byName, laneData } = env;
const IX = sandbox.LoLDraftInteractions;
const SC = sandbox.LoLDraftScoring;

const t0 = Date.now();
const prepared = prepareGames(csvPath, maxGames, env);
const unknown = prepared.unknown;
// --half 1|2 : validation croisée temporelle (le CSV est trié chronologiquement)
const half = arg("--half");
const games = half
  ? prepared.games.filter((_, i) => (half === "1" ? i < prepared.games.length / 2 : i >= prepared.games.length / 2))
  : prepared.games;
const nGames = games.length;
const blueWins = games.filter((g) => g.blueWin).length;
const BLUE_BASE = blueWins / nGames;
console.error(`${nGames} parties préparées en ${((Date.now() - t0) / 1000).toFixed(1)}s — baseline bleu ${(BLUE_BASE * 100).toFixed(2)} %`);

/** Agrégateur : chaque observation = (côté favorisé, le bleu a-t-il gagné ?). */
function makeTally(label, extra = {}) {
  return { label, ...extra, n: 0, favBlue: 0, favRed: 0, winsBlueFav: 0, winsRedFav: 0, bothFire: 0 };
}
function push(t, favoredIsBlue, blueWin) {
  t.n += 1;
  if (favoredIsBlue) {
    t.favBlue += 1;
    if (blueWin) t.winsBlueFav += 1;
  } else {
    t.favRed += 1;
    if (!blueWin) t.winsRedFav += 1;
  }
}
function finish(t) {
  const wins = t.winsBlueFav + t.winsRedFav;
  const [lo, hi] = wilson(wins, t.n);
  const expected = t.n ? ((t.favBlue * BLUE_BASE + t.favRed * (1 - BLUE_BASE)) / t.n) * 100 : null;
  const obs = t.n ? (wins / t.n) * 100 : null;
  return {
    label: t.label,
    ...Object.fromEntries(Object.entries(t).filter(([k]) => !["label", "n", "favBlue", "favRed", "winsBlueFav", "winsRedFav", "bothFire"].includes(k))),
    n: t.n,
    nBothSides: t.bothFire,
    favoredBlue: t.favBlue,
    favoredRed: t.favRed,
    favoredWinPct: obs == null ? null : +obs.toFixed(2),
    expectedPct: expected == null ? null : +expected.toFixed(2),
    edgePct: obs == null ? null : +(obs - expected).toFixed(2),
    ci95: [lo, hi],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. COMP_CLASH_RULES et TEAM_TRAIT_RULES
// ─────────────────────────────────────────────────────────────────────────────
function evalRuleSet(rules, argsFor, label) {
  const tallies = rules.map((r, i) => makeTally(r[2], { idx: i, score: r[1], set: label }));
  for (const g of games) {
    for (let i = 0; i < rules.length; i += 1) {
      const when = rules[i][0];
      let a = false;
      let b = false;
      try { a = !!when(...argsFor(g, true)); } catch (_) { a = false; }
      try { b = !!when(...argsFor(g, false)); } catch (_) { b = false; }
      if (a && b) tallies[i].bothFire += 1;
      else if (a) push(tallies[i], true, g.blueWin);
      else if (b) push(tallies[i], false, g.blueWin);
    }
  }
  return tallies.map(finish);
}

const compRules = evalRuleSet(
  IX.COMP_CLASH_RULES,
  (g, blueIsO) =>
    blueIsO
      ? [g.blueM, g.redM, g.bluePlan, g.redPlan, g.blueArch, g.redArch]
      : [g.redM, g.blueM, g.redPlan, g.bluePlan, g.redArch, g.blueArch],
  "COMP_CLASH_RULES"
);

// TEAM_TRAIT_RULES n'est pas exporté : on ré-évalue le littéral source tel quel
// (lecture seule de public/draft-interactions.js, aucune modification).
function loadTeamTraitRules() {
  const src = readFileSync(join(root, "public/draft-interactions.js"), "utf8");
  const m = src.match(/const TEAM_TRAIT_RULES = \[[\s\S]*?\n {2}\];/);
  if (!m) return null;
  const norm = (name) =>
    String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const hasMech = (v, key) => IX.MECH[key]?.has(norm(v.name));
  const countMech = (vs, key) => vs.filter((v) => hasMech(v, key)).length;
  // eslint-disable-next-line no-new-func
  return new Function("countMech", "hasMech", `${m[0]}\nreturn TEAM_TRAIT_RULES;`)(countMech, hasMech);
}
const TEAM_TRAIT_RULES = loadTeamTraitRules();
const teamTraitRules = TEAM_TRAIT_RULES
  ? evalRuleSet(TEAM_TRAIT_RULES, (g, b) => (b ? [g.blueM, g.redM] : [g.redM, g.blueM]), "TEAM_TRAIT_RULES")
  : null;

// ─────────────────────────────────────────────────────────────────────────────
// 2. CHAMP_PAIR_RULES — déclenchements nets sur les 25 paires croisées + même lane
// ─────────────────────────────────────────────────────────────────────────────
const pairRules = IX.CHAMP_PAIR_RULES;
const pairAll = pairRules.map((r, i) => makeTally(`pair#${i}`, { idx: i, score: r[1], scope: "toutes paires" }));
const pairLane = pairRules.map((r, i) => makeTally(`pair#${i}`, { idx: i, score: r[1], scope: "même lane" }));

for (const g of games) {
  for (let i = 0; i < pairRules.length; i += 1) {
    const test = pairRules[i][0];
    let netAll = 0;
    let netLane = 0;
    for (let a = 0; a < 5; a += 1) {
      for (let b = 0; b < 5; b += 1) {
        const u = g.blueVs[a];
        const e = g.redVs[b];
        let f1 = false;
        let f2 = false;
        try { f1 = !!test(u, e); } catch (_) {}
        try { f2 = !!test(e, u); } catch (_) {}
        const d = (f1 ? 1 : 0) - (f2 ? 1 : 0);
        netAll += d;
        if (a === b) netLane += d;
      }
    }
    if (netAll > 0) push(pairAll[i], true, g.blueWin);
    else if (netAll < 0) push(pairAll[i], false, g.blueWin);
    else pairAll[i].bothFire += 1;
    if (netLane > 0) push(pairLane[i], true, g.blueWin);
    else if (netLane < 0) push(pairLane[i], false, g.blueWin);
    else pairLane[i].bothFire += 1;
  }
}
// libellés lisibles : on tente reasonFn sur un couple fictif -> sinon on garde l'index
function pairLabel(i) {
  const src = String(pairRules[i][0]);
  return src.replace(/\s+/g, " ").slice(0, 130);
}
const pairAllOut = pairAll.map((t, i) => ({ ...finish(t), rule: pairLabel(i) }));
const pairLaneOut = pairLane.map((t, i) => ({ ...finish(t), rule: pairLabel(i) }));

// ─────────────────────────────────────────────────────────────────────────────
// 3. CURATED_COUNTERS — [defender, attacker]
// ─────────────────────────────────────────────────────────────────────────────
const counters = IX.CURATED_COUNTERS;
const ctrAll = counters.map(([d, a, r]) => makeTally(`${a} > ${d}`, { attacker: a, defender: d, reason: r, scope: "toutes positions" }));
const ctrLane = counters.map(([d, a, r]) => makeTally(`${a} > ${d}`, { attacker: a, defender: d, reason: r, scope: "même lane" }));

for (const g of games) {
  const blueSet = new Set(g.blueVs.map((v) => v.name));
  const redSet = new Set(g.redVs.map((v) => v.name));
  const blueBySlot = SLOTS.map((s) => g.blueComp[s]);
  const redBySlot = SLOTS.map((s) => g.redComp[s]);
  for (let i = 0; i < counters.length; i += 1) {
    const [def, att] = counters[i];
    const blueAtt = blueSet.has(att) && redSet.has(def);
    const redAtt = redSet.has(att) && blueSet.has(def);
    if (blueAtt && redAtt) ctrAll[i].bothFire += 1;
    else if (blueAtt) push(ctrAll[i], true, g.blueWin);
    else if (redAtt) push(ctrAll[i], false, g.blueWin);
    // même lane
    let laneBlue = false;
    let laneRed = false;
    for (let s = 0; s < 5; s += 1) {
      if (blueBySlot[s] === att && redBySlot[s] === def) laneBlue = true;
      if (redBySlot[s] === att && blueBySlot[s] === def) laneRed = true;
    }
    if (laneBlue && laneRed) ctrLane[i].bothFire += 1;
    else if (laneBlue) push(ctrLane[i], true, g.blueWin);
    else if (laneRed) push(ctrLane[i], false, g.blueWin);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Matrice plan × plan
// ─────────────────────────────────────────────────────────────────────────────
const planPairs = new Map(); // "A|B" (A<B alphabétiquement) -> {nA, winsA}
const planSolo = new Map();
for (const g of games) {
  const bp = g.bluePlan || "null";
  const rp = g.redPlan || "null";
  for (const [p, win] of [[bp, g.blueWin], [rp, !g.blueWin]]) {
    const e = planSolo.get(p) || { n: 0, wins: 0 };
    e.n += 1;
    if (win) e.wins += 1;
    planSolo.set(p, e);
  }
  if (bp === rp) continue;
  const [A, B] = bp < rp ? [bp, rp] : [rp, bp];
  const key = `${A}|${B}`;
  const e = planPairs.get(key) || { A, B, n: 0, winsA: 0, aBlue: 0, aRed: 0 };
  e.n += 1;
  const aIsBlue = bp === A;
  if (aIsBlue) e.aBlue += 1; else e.aRed += 1;
  if ((aIsBlue && g.blueWin) || (!aIsBlue && !g.blueWin)) e.winsA += 1;
  planPairs.set(key, e);
}
const counterSet = new Set(SC.COMP_TYPE_COUNTERS.map(([c, v]) => `${c}>${v}`));
const planMatrix = [...planPairs.values()]
  .map((e) => {
    const [lo, hi] = wilson(e.winsA, e.n);
    const expected = ((e.aBlue * BLUE_BASE + e.aRed * (1 - BLUE_BASE)) / e.n) * 100;
    const obs = (e.winsA / e.n) * 100;
    const encodedAB = counterSet.has(`${e.A}>${e.B}`);
    const encodedBA = counterSet.has(`${e.B}>${e.A}`);
    return {
      A: e.A,
      B: e.B,
      n: e.n,
      winPctA: +obs.toFixed(2),
      expectedPctA: +expected.toFixed(2),
      edgePctA: +(obs - expected).toFixed(2),
      ci95A: [lo, hi],
      encodedInCode: encodedAB ? `${e.A} bat ${e.B}` : encodedBA ? `${e.B} bat ${e.A}` : null,
      encodedDirectionMatchesData:
        encodedAB ? obs - expected > 0 : encodedBA ? obs - expected < 0 : null,
    };
  })
  .sort((a, b) => b.n - a.n);

const planSoloOut = [...planSolo.entries()]
  .map(([plan, e]) => ({ plan, n: e.n, winPct: +((e.wins / e.n) * 100).toFixed(2), ci95: wilson(e.wins, e.n) }))
  .sort((a, b) => b.n - a.n);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Matrice de lane
// ─────────────────────────────────────────────────────────────────────────────
const laneIdx = {};
laneData.champs.forEach((n, i) => { laneIdx[n] = i; });
const NCH = laneData.champs.length;
function rawLaneMargin(a, b, slot) {
  const ia = laneIdx[a];
  const ib = laneIdx[b];
  const arr = laneData.margins?.[slot];
  if (ia == null || ib == null || !arr) return null;
  return arr[ia * NCH + ib] ?? 0;
}

const laneStats = {};
const sumSeries = { x: [], y: [] };
const engineSeries = {};
for (const slot of SLOTS) {
  laneStats[slot] = { raw: { x: [], y: [] }, engine: { x: [], y: [] }, buckets: {} };
  engineSeries[slot] = [];
}
const laneAcc = {}; // accuracy "la lane gagnée gagne la partie"
for (const slot of SLOTS) laneAcc[slot] = { raw: { n: 0, k: 0 }, engine: { n: 0, k: 0 } };

let sumRawTotal = { x: [], y: [] };
let sumEngineTotal = { x: [], y: [] };

for (const g of games) {
  const y = g.blueWin ? 1 : 0;
  let sRaw = 0;
  let sEng = 0;
  for (let s = 0; s < 5; s += 1) {
    const slot = SLOTS[s];
    const bn = g.blueComp[slot];
    const rn = g.redComp[slot];
    const raw = rawLaneMargin(bn, rn, slot);
    const bv = g.blueVs[s];
    const rv = g.redVs[s];
    const f = SC.laneMatchupEdge(bv, rv, slot, { metaMap: meta });
    const bk = SC.laneMatchupEdge(rv, bv, slot, { metaMap: meta });
    const eng = ((f.our - f.enemy) - (bk.our - bk.enemy)) / 2;
    if (raw != null) {
      laneStats[slot].raw.x.push(raw);
      laneStats[slot].raw.y.push(y);
      sRaw += raw;
      if (raw !== 0) {
        laneAcc[slot].raw.n += 1;
        if (raw > 0 === g.blueWin) laneAcc[slot].raw.k += 1;
      }
    }
    laneStats[slot].engine.x.push(eng);
    laneStats[slot].engine.y.push(y);
    sEng += eng;
    if (eng !== 0) {
      laneAcc[slot].engine.n += 1;
      if (eng > 0 === g.blueWin) laneAcc[slot].engine.k += 1;
    }
  }
  sumRawTotal.x.push(sRaw);
  sumRawTotal.y.push(y);
  sumEngineTotal.x.push(sEng);
  sumEngineTotal.y.push(y);
}

const laneOut = SLOTS.map((slot) => ({
  slot,
  n: laneStats[slot].engine.x.length,
  pearsonRawMatrix: +(pearson(laneStats[slot].raw.x, laneStats[slot].raw.y) ?? NaN).toFixed(4),
  pearsonEngineEdge: +(pearson(laneStats[slot].engine.x, laneStats[slot].engine.y) ?? NaN).toFixed(4),
  accuracyRawPct: laneAcc[slot].raw.n ? +((laneAcc[slot].raw.k / laneAcc[slot].raw.n) * 100).toFixed(2) : null,
  accuracyRawN: laneAcc[slot].raw.n,
  accuracyRawCi95: wilson(laneAcc[slot].raw.k, laneAcc[slot].raw.n),
  accuracyEnginePct: laneAcc[slot].engine.n ? +((laneAcc[slot].engine.k / laneAcc[slot].engine.n) * 100).toFixed(2) : null,
  accuracyEngineN: laneAcc[slot].engine.n,
  accuracyEngineCi95: wilson(laneAcc[slot].engine.k, laneAcc[slot].engine.n),
}));

// buckets sur la somme des marges de lane (engine)
function bucketize(xs, ys, edges) {
  const out = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const lo = edges[i];
    const hi = edges[i + 1];
    let n = 0;
    let k = 0;
    for (let j = 0; j < xs.length; j += 1) {
      if (xs[j] >= lo && xs[j] < hi) { n += 1; k += ys[j]; }
    }
    if (n) out.push({ range: `[${lo}, ${hi})`, n, blueWinPct: +((k / n) * 100).toFixed(2), ci95: wilson(k, n) });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Agrégats : le score net d'une famille de règles prédit-il quoi que ce soit ?
// ─────────────────────────────────────────────────────────────────────────────
function aggregate(scoreFn, label) {
  const xs = [];
  const ys = [];
  let n = 0;
  let k = 0;
  for (const g of games) {
    const x = scoreFn(g);
    xs.push(x);
    ys.push(g.blueWin ? 1 : 0);
    if (x !== 0) {
      n += 1;
      if (x > 0 === g.blueWin) k += 1;
    }
  }
  return {
    label,
    pearson: +(pearson(xs, ys) ?? NaN).toFixed(4),
    nNonZero: n,
    signAccuracyPct: n ? +((k / n) * 100).toFixed(2) : null,
    ci95: wilson(k, n),
  };
}

const compNet = (g) => {
  let s = 0;
  for (const [when, score] of IX.COMP_CLASH_RULES) {
    try { if (when(g.blueM, g.redM, g.bluePlan, g.redPlan, g.blueArch, g.redArch)) s += score; } catch (_) {}
    try { if (when(g.redM, g.blueM, g.redPlan, g.bluePlan, g.redArch, g.blueArch)) s -= score; } catch (_) {}
  }
  return s;
};
const traitNet = (g) => {
  let s = 0;
  for (const [when, score] of TEAM_TRAIT_RULES || []) {
    try { if (when(g.blueM, g.redM)) s += score; } catch (_) {}
    try { if (when(g.redM, g.blueM)) s -= score; } catch (_) {}
  }
  return s;
};
const pairNet = (g) => {
  let s = 0;
  for (const [test, score] of pairRules) {
    for (let a = 0; a < 5; a += 1) {
      for (let b = 0; b < 5; b += 1) {
        try { if (test(g.blueVs[a], g.redVs[b])) s += score; } catch (_) {}
        try { if (test(g.redVs[b], g.blueVs[a])) s -= score; } catch (_) {}
      }
    }
  }
  return s;
};
const curatedNet = (g) => {
  let s = 0;
  for (let a = 0; a < 5; a += 1) {
    for (let b = 0; b < 5; b += 1) {
      const e = IX.curatedCounterEdge(g.blueVs[a], g.redVs[b]);
      if (e) s += e.our - e.enemy;
    }
  }
  return s;
};
const laneNetRaw = (g) => {
  let s = 0;
  for (const slot of SLOTS) s += rawLaneMargin(g.blueComp[slot], g.redComp[slot], slot) || 0;
  return s;
};

const aggregates = [
  aggregate(compNet, "COMP_CLASH_RULES (score net bleu−rouge)"),
  aggregate(traitNet, "TEAM_TRAIT_RULES (score net)"),
  aggregate(pairNet, "CHAMP_PAIR_RULES (score net, 25 paires)"),
  aggregate(curatedNet, "CURATED_COUNTERS (score net)"),
  aggregate(laneNetRaw, "lane-matchups.json (somme des marges)"),
];

// Vérification directe des 13 relations COMP_TYPE_COUNTERS encodées
const encodedCheck = SC.COMP_TYPE_COUNTERS.map(([counter, victim]) => {
  const [A, B] = counter < victim ? [counter, victim] : [victim, counter];
  const m = planMatrix.find((x) => x.A === A && x.B === B);
  if (!m) return { counter, victim, n: 0, note: "jamais observé" };
  const counterIsA = A === counter;
  const winPctCounter = counterIsA ? m.winPctA : +(100 - m.winPctA).toFixed(2);
  const expected = counterIsA ? m.expectedPctA : +(100 - m.expectedPctA).toFixed(2);
  return {
    counter,
    victim,
    n: m.n,
    winPctCounter,
    expectedPctCounter: expected,
    edgePctCounter: +(winPctCounter - expected).toFixed(2),
    ci95Counter: counterIsA ? m.ci95A : [+(100 - m.ci95A[1]).toFixed(2), +(100 - m.ci95A[0]).toFixed(2)],
    verdict: winPctCounter - expected > 0 ? "confirmé" : "INVERSÉ",
  };
}).sort((a, b) => (b.n || 0) - (a.n || 0));

const report = {
  dataset: csvPath.split(/[\\/]/).pop(),
  games: nGames,
  blueBaselinePct: +(BLUE_BASE * 100).toFixed(2),
  unknownChampions: [...unknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
  compClashRules: compRules.sort((a, b) => (b.edgePct ?? -99) - (a.edgePct ?? -99)),
  teamTraitRules: teamTraitRules ? teamTraitRules.sort((a, b) => (b.edgePct ?? -99) - (a.edgePct ?? -99)) : "TEAM_TRAIT_RULES non exporté",
  champPairRulesAllPairs: pairAllOut.sort((a, b) => (b.edgePct ?? -99) - (a.edgePct ?? -99)),
  champPairRulesSameLane: pairLaneOut.sort((a, b) => (b.edgePct ?? -99) - (a.edgePct ?? -99)),
  curatedCountersAllPositions: ctrAll.map(finish).sort((a, b) => (b.edgePct ?? -99) - (a.edgePct ?? -99)),
  curatedCountersSameLane: ctrLane.map(finish).filter((r) => r.n > 0).sort((a, b) => (b.edgePct ?? -99) - (a.edgePct ?? -99)),
  planSolo: planSoloOut,
  planMatrix,
  compTypeCountersEncoded: SC.COMP_TYPE_COUNTERS,
  compTypeCountersCheck: encodedCheck,
  aggregates,
  laneMatchups: {
    perSlot: laneOut,
    pearsonSumRawMatrix: +(pearson(sumRawTotal.x, sumRawTotal.y) ?? NaN).toFixed(4),
    pearsonSumEngineEdge: +(pearson(sumEngineTotal.x, sumEngineTotal.y) ?? NaN).toFixed(4),
    bucketsSumEngineEdge: bucketize(sumEngineTotal.x, sumEngineTotal.y, [-1e9, -60, -30, -10, 10, 30, 60, 1e9]),
    bucketsSumRawMatrix: bucketize(sumRawTotal.x, sumRawTotal.y, [-1e9, -60, -30, -10, 10, 30, 60, 1e9]),
  },
};

const out = arg("--json");
if (out) writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
console.error(`terminé en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
