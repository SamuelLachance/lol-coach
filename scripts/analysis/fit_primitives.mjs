#!/usr/bin/env node
/**
 * Plafond de récupération : régression logistique (descente de gradient, sans
 * dépendance) sur les DIFFÉRENCES de primitives du moteur (buildTeamMetrics),
 * apprise sur la 1re moitié chronologique, évaluée sur la 2de.
 *
 * Donne (a) les signes empiriques que devraient avoir les règles, (b) l'accuracy
 * hors échantillon atteignable en corrigeant simplement les signes/poids.
 *
 * Usage : node scripts/analysis/fit_primitives.mjs [--csv f] [--json out]
 */
import { writeFileSync, existsSync } from "fs";
import { loadEngine, prepareGames, wilson, arg, DEFAULT_CSV } from "./_common.mjs";

const csvPath = arg("--csv", DEFAULT_CSV);
if (!existsSync(csvPath)) process.exit(2);
const env = loadEngine();
const { games } = prepareGames(csvPath, 0, env);

const KEYS = Object.keys(games[0].blueM).filter((k) => typeof games[0].blueM[k] === "number");
const X = games.map((g) => KEYS.map((k) => (g.blueM[k] || 0) - (g.redM[k] || 0)));
const Y = games.map((g) => (g.blueWin ? 1 : 0));

const nTrain = Math.floor(games.length / 2);
const mu = KEYS.map((_, j) => X.slice(0, nTrain).reduce((s, r) => s + r[j], 0) / nTrain);
const sd = KEYS.map((_, j) => {
  const v = X.slice(0, nTrain).reduce((s, r) => s + (r[j] - mu[j]) ** 2, 0) / nTrain;
  return Math.sqrt(v) || 1;
});
const Z = X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));

let w = new Array(KEYS.length).fill(0);
let b = 0;
const lr = 0.15;
const lambda = 0.002;
for (let epoch = 0; epoch < 4000; epoch += 1) {
  const gw = new Array(KEYS.length).fill(0);
  let gb = 0;
  for (let i = 0; i < nTrain; i += 1) {
    let z = b;
    for (let j = 0; j < w.length; j += 1) z += w[j] * Z[i][j];
    const p = 1 / (1 + Math.exp(-z));
    const e = p - Y[i];
    gb += e;
    for (let j = 0; j < w.length; j += 1) gw[j] += e * Z[i][j];
  }
  b -= (lr * gb) / nTrain;
  for (let j = 0; j < w.length; j += 1) w[j] -= lr * (gw[j] / nTrain + lambda * w[j]);
}

function evalSet(lo, hi) {
  let correct = 0;
  let n = 0;
  let ll = 0;
  let brier = 0;
  let blueAlways = 0;
  for (let i = lo; i < hi; i += 1) {
    let z = b;
    for (let j = 0; j < w.length; j += 1) z += w[j] * Z[i][j];
    const p = 1 / (1 + Math.exp(-z));
    n += 1;
    if (p >= 0.5 === (Y[i] === 1)) correct += 1;
    if (Y[i] === 1) blueAlways += 1;
    ll += -(Y[i] * Math.log(Math.max(1e-9, p)) + (1 - Y[i]) * Math.log(Math.max(1e-9, 1 - p)));
    brier += (p - Y[i]) ** 2;
  }
  return {
    n,
    accuracyPct: +((correct / n) * 100).toFixed(2),
    ci95: wilson(correct, n),
    logLoss: +(ll / n).toFixed(4),
    brier: +(brier / n).toFixed(4),
    baselineBlueAlwaysPct: +((blueAlways / n) * 100).toFixed(2),
  };
}

const coefs = KEYS.map((k, j) => ({ metric: k, poidsStandardise: +w[j].toFixed(4) })).sort(
  (a, b2) => Math.abs(b2.poidsStandardise) - Math.abs(a.poidsStandardise)
);

const report = {
  games: games.length,
  train: { plage: `0..${nTrain}`, ...evalSet(0, nTrain) },
  test: { plage: `${nTrain}..${games.length}`, ...evalSet(nTrain, games.length) },
  biais: +b.toFixed(4),
  coefficients: coefs,
  note:
    "Poids standardisés : signe positif = la métrique favorise réellement le camp qui l'a en excédent. Comparer au signe supposé par les règles du moteur.",
};
const out = arg("--json");
if (out) writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
