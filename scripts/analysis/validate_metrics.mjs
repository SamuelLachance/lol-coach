#!/usr/bin/env node
/**
 * Validation des PRIMITIVES utilisées par les règles (buildTeamMetrics) et des
 * familles de règles, sur Oracle's Elixir 2022.
 *
 * 1. Pour chaque métrique d'équipe (peel, enchanter, disengage, dive, engage…) :
 *    le camp qui en a le plus gagne-t-il ? n, winrate, IC95, z.
 * 2. Familles de règles COMP_CLASH_RULES (défensive/protection vs offensive/dive) :
 *    agrégat des déclenchements nets.
 * 3. Hypercarry « protégé » (isProtectedHypercarryTeam ré-implémenté) : le clamp
 *    de marge du moteur protège-t-il une comp qui gagne réellement ?
 *
 * Usage : node scripts/analysis/validate_metrics.mjs [--csv f] [--max N] [--json out]
 */
import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { loadEngine, prepareGames, wilson, pearson, arg, DEFAULT_CSV, root } from "./_common.mjs";

const csvPath = arg("--csv", DEFAULT_CSV);
if (!existsSync(csvPath)) {
  console.error(`CSV introuvable : ${csvPath}`);
  process.exit(2);
}
const env = loadEngine();
const IX = env.sandbox.LoLDraftInteractions;
const { games } = prepareGames(csvPath, Number(arg("--max", "0")) || 0, env);
const N = games.length;
const BLUE = games.filter((g) => g.blueWin).length / N;

function duel(favBlueList) {
  // favBlueList : tableau de +1 (bleu favorisé) / -1 (rouge) / 0 (égalité)
  let n = 0;
  let wins = 0;
  let fb = 0;
  let fr = 0;
  for (let i = 0; i < favBlueList.length; i += 1) {
    const f = favBlueList[i];
    if (!f) continue;
    n += 1;
    if (f > 0) { fb += 1; if (games[i].blueWin) wins += 1; }
    else { fr += 1; if (!games[i].blueWin) wins += 1; }
  }
  const expected = n ? ((fb * BLUE + fr * (1 - BLUE)) / n) * 100 : null;
  const obs = n ? (wins / n) * 100 : null;
  const p0 = expected / 100;
  const z = n ? (obs / 100 - p0) / Math.sqrt((p0 * (1 - p0)) / n) : null;
  return {
    n,
    favoredWinPct: obs == null ? null : +obs.toFixed(2),
    expectedPct: expected == null ? null : +expected.toFixed(2),
    edgePct: obs == null ? null : +(obs - expected).toFixed(2),
    ci95: wilson(wins, n),
    z: z == null ? null : +z.toFixed(2),
  };
}

// ── 1. métriques d'équipe ────────────────────────────────────────────────────
const METRIC_KEYS = Object.keys(games[0].blueM).filter((k) => typeof games[0].blueM[k] === "number");
const metricRows = METRIC_KEYS.map((k) => {
  const favs = games.map((g) => Math.sign((g.blueM[k] || 0) - (g.redM[k] || 0)));
  const xs = games.map((g) => (g.blueM[k] || 0) - (g.redM[k] || 0));
  const ys = games.map((g) => (g.blueWin ? 1 : 0));
  return { metric: k, pearsonDiff: +(pearson(xs, ys) ?? NaN).toFixed(4), ...duel(favs) };
}).sort((a, b) => (b.edgePct ?? -99) - (a.edgePct ?? -99));

// ── 2. familles de règles ────────────────────────────────────────────────────
const DEF_TOKENS = [
  "o.peel", "o.enchanter", "o.disengage", "o.antiDash", "o.zone", "o.poke", "o.siege",
  "o.scaling", '"peelTank"', '"immobileCarry"',
  'op === "hypercarry"', 'op === "front_to_back"', 'op === "poke_disengage"',
  'op === "poke_siege"', 'op === "scaling_late"',
];
const OFF_TOKENS = [
  "o.dive", "o.hardEngage", "o.assassin", "o.global", "o.early", "o.split", "o.womboSetup",
  '"invadeEarly"', '"diveAssassin"',
  'op === "beatdown"', 'op === "pick_global"', 'op === "teamfight_engage"',
  'op === "all_in"', 'op === "lane_tempo"', 'op === "split_push"',
];
function classify(when) {
  const s = String(when);
  const d = DEF_TOKENS.some((t) => s.includes(t));
  const o = OFF_TOKENS.some((t) => s.includes(t));
  if (d && !o) return "défensive (peel/protection/poke)";
  if (o && !d) return "offensive (dive/engage/pick/tempo)";
  if (d && o) return "mixte";
  return "autre";
}
const families = {};
for (const [when, score] of IX.COMP_CLASH_RULES) {
  const fam = classify(when);
  (families[fam] = families[fam] || []).push([when, score]);
}
const familyRows = Object.entries(families).map(([fam, rules]) => {
  const favs = games.map((g) => {
    let s = 0;
    for (const [when] of rules) {
      try { if (when(g.blueM, g.redM, g.bluePlan, g.redPlan, g.blueArch, g.redArch)) s += 1; } catch (_) {}
      try { if (when(g.redM, g.blueM, g.redPlan, g.bluePlan, g.redArch, g.blueArch)) s -= 1; } catch (_) {}
    }
    return Math.sign(s);
  });
  return { famille: fam, regles: rules.length, ...duel(favs) };
});

// ── 3. hypercarry protégé ────────────────────────────────────────────────────
const nameKey = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sumKey = (vs, k) => vs.reduce((s, v) => s + (v[k] || 0), 0);
function enchanterCount(vs) {
  const ench = IX.MECH.enchanter;
  return vs.filter((v) => v.familyKey === "support_enchanter" || ench?.has?.(nameKey(v.name))).length;
}
function isProtected(vs, plan) {
  if (plan !== "hypercarry" && plan !== "front_to_back") return false;
  return (
    vs.filter((v) => v.isMarksman).length >= 1 &&
    enchanterCount(vs) >= 1 &&
    sumKey(vs, "peel") >= 1.0 &&
    sumKey(vs, "scaling") >= 0.8
  );
}
const ENGAGE_PLANS = new Set(["teamfight_engage", "pick_global", "beatdown", "all_in", "lane_tempo"]);
let prot = { n: 0, wins: 0 };
let unprot = { n: 0, wins: 0 };
let protVsEngage = { n: 0, wins: 0 };
for (const g of games) {
  for (const side of ["blue", "red"]) {
    const vs = side === "blue" ? g.blueVs : g.redVs;
    const plan = side === "blue" ? g.bluePlan : g.redPlan;
    const foePlan = side === "blue" ? g.redPlan : g.bluePlan;
    const win = side === "blue" ? g.blueWin : !g.blueWin;
    if (plan !== "hypercarry" && plan !== "front_to_back") continue;
    const p = isProtected(vs, plan);
    const bucket = p ? prot : unprot;
    bucket.n += 1;
    if (win) bucket.wins += 1;
    if (p && ENGAGE_PLANS.has(foePlan)) {
      protVsEngage.n += 1;
      if (win) protVsEngage.wins += 1;
    }
  }
}
const pct = (b) => ({ n: b.n, winPct: b.n ? +((b.wins / b.n) * 100).toFixed(2) : null, ci95: wilson(b.wins, b.n) });

const report = {
  games: N,
  blueBaselinePct: +(BLUE * 100).toFixed(2),
  note:
    "favoredWinPct = victoire du camp que la métrique/règle favorise ; expectedPct = espérance nulle compte tenu de la répartition bleu/rouge des déclenchements.",
  teamMetrics: metricRows,
  ruleFamilies: familyRows,
  hypercarry: {
    protege: pct(prot),
    nonProtege: pct(unprot),
    protegeContrePlanEngage: pct(protVsEngage),
    commentaire:
      "Le moteur applique un clamp de marge (±340) en faveur de l'équipe hypercarry protégée face à un plan engage, et désactive le contre pick_global>hypercarry quand la victime est protégée.",
  },
};
const out = arg("--json");
if (out) writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
