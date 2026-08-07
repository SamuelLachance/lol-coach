#!/usr/bin/env node
/**
 * Robustesse des primitives les plus inversées : découpe par moitié temporelle,
 * par ligue majeure, et winrate champion par champion des ensembles MECH concernés.
 * Usage : node scripts/analysis/robustness_metrics.mjs [--csv f] [--json out]
 */
import { writeFileSync, existsSync } from "fs";
import { loadEngine, prepareGames, wilson, arg, DEFAULT_CSV } from "./_common.mjs";

const csvPath = arg("--csv", DEFAULT_CSV);
if (!existsSync(csvPath)) process.exit(2);
const env = loadEngine();
const IX = env.sandbox.LoLDraftInteractions;
const { games } = prepareGames(csvPath, 0, env);

function duel(subset, key) {
  const blue = subset.filter((g) => g.blueWin).length / subset.length;
  let n = 0, wins = 0, fb = 0, fr = 0;
  for (const g of subset) {
    const d = Math.sign((g.blueM[key] || 0) - (g.redM[key] || 0));
    if (!d) continue;
    n += 1;
    if (d > 0) { fb += 1; if (g.blueWin) wins += 1; }
    else { fr += 1; if (!g.blueWin) wins += 1; }
  }
  const exp = ((fb * blue + fr * (1 - blue)) / n) * 100;
  const obs = (wins / n) * 100;
  const p0 = exp / 100;
  return {
    n,
    favoredWinPct: +obs.toFixed(2),
    expectedPct: +exp.toFixed(2),
    edgePct: +(obs - exp).toFixed(2),
    ci95: wilson(wins, n),
    z: +((obs / 100 - p0) / Math.sqrt((p0 * (1 - p0)) / n)).toFixed(2),
  };
}

const KEYS = ["enchanter", "disengage", "scaling", "poke", "dive", "early", "split", "womboSetup", "peel"];
const half1 = games.filter((_, i) => i < games.length / 2);
const half2 = games.filter((_, i) => i >= games.length / 2);
const byLeague = {};
for (const g of games) (byLeague[g.league] = byLeague[g.league] || []).push(g);
const majors = Object.entries(byLeague)
  .filter(([, v]) => v.length >= 400)
  .sort((a, b) => b[1].length - a[1].length);

const perKey = KEYS.map((k) => ({
  metric: k,
  global: duel(games, k),
  H1: duel(half1, k),
  H2: duel(half2, k),
  leagues: Object.fromEntries(majors.map(([lg, v]) => [lg, duel(v, k)])),
}));

// winrate par champion des ensembles MECH sensibles
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function mechChampStats(mechKey) {
  const set = IX.MECH[mechKey];
  const stat = new Map();
  for (const g of games) {
    for (const [vs, win] of [[g.blueVs, g.blueWin], [g.redVs, !g.blueWin]]) {
      for (const v of vs) {
        if (!set.has(norm(v.name))) continue;
        const e = stat.get(v.name) || { n: 0, w: 0 };
        e.n += 1;
        if (win) e.w += 1;
        stat.set(v.name, e);
      }
    }
  }
  return [...stat.entries()]
    .map(([name, e]) => ({ champion: name, picks: e.n, winPct: +((e.w / e.n) * 100).toFixed(2), ci95: wilson(e.w, e.n) }))
    .sort((a, b) => b.picks - a.picks);
}

const report = {
  games: games.length,
  metrics: perKey,
  enchanterChampions: mechChampStats("enchanter"),
  diveAssassinChampions: mechChampStats("diveAssassin"),
  disengageChampions: mechChampStats("disengage"),
};
const out = arg("--json");
if (out) writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
