/**
 * Bornes du plafond draft-only :
 *  - pente de calibration des predictions hors-pli
 *  - decomposition de Brier -> variance de la vraie probabilite expliquee par la draft
 *  - desattenuation demi-echantillon -> accuracy d'un modele "donnees infinies"
 *  - split chronologique (entrainer sur le passe, predire le futur)
 *  - tests de McNemar contre la baseline de cote
 *  - extrapolation de la courbe d'apprentissage
 */
import { readFileSync, writeFileSync } from "fs";
import { readGames, foldOf, wilson95 } from "./lib_data.mjs";
import { fitLogreg, predict, metrics, sigmoid } from "./lib_logreg.mjs";
import {
  buildChampIndex,
  rowsChampSym,
  countPairs,
  rowsChampPairs,
} from "./lib_features.mjs";

const A = "C:/Users/Admin/Documents/lol-coach/scripts/analysis/";
const games = readGames();
const ys = games.map((g) => (g.blueWin ? 1 : 0));
const n = games.length;
const ci = buildChampIndex(games);
const N = ci.list.length;
const prev = ys.reduce((a, b) => a + b, 0) / n;
const b0 = Math.log(prev / (1 - prev));

const P1 = JSON.parse(readFileSync(A + "out_01_preds.json", "utf8"));
const P2 = JSON.parse(readFileSync(A + "out_02_pairs.json", "utf8"));
const P3 = JSON.parse(readFileSync(A + "out_03_ceiling.json", "utf8"));

const models = {
  "M1c winrates calibres": P1.m1c,
  "M2s champions": P1.m2s,
  "M3 champions+paires": P2.preds,
  "M4 equipes": P3.predsM4,
  "M5 equipes+champions": P3.predsM5,
  "M6 draft purgee": P3.predsM6,
};

const logit = (p) => Math.log(Math.min(Math.max(p, 1e-9), 1 - 1e-9) / (1 - Math.min(Math.max(p, 1e-9), 1 - 1e-9)));

/* --- pente de calibration : y ~ a + b*logit(p_hat) --- */
function calibrationSlope(preds) {
  const rows = preds.map((p, i) => ({
    idx: Int32Array.from([0]),
    val: Float64Array.from([logit(p) - b0]),
    y: ys[i],
  }));
  const m = fitLogreg(rows, 1, { lambda: 0, epochs: 1500, lr: 0.02 });
  return { pente: m.w[0], biais: m.b };
}

function varOf(a) {
  const mu = a.reduce((x, y) => x + y, 0) / a.length;
  return a.reduce((s, x) => s + (x - mu) ** 2, 0) / a.length;
}

const baseBrier = metrics(preds0(), ys).brier;
function preds0() {
  return new Array(n).fill(prev);
}
const baseLL = metrics(preds0(), ys).logloss;

const rows = [];
for (const [label, preds] of Object.entries(models)) {
  const m = metrics(preds, ys);
  const cal = calibrationSlope(preds);
  // Brier calibre (apres recalibration lineaire du logit) : borne superieure serree
  const pc = preds.map((p) => sigmoid(cal.biais + cal.pente * (logit(p) - b0)));
  const mc = metrics(pc, ys);
  const [lo, hi] = wilson95(m.correct, m.n);
  rows.push({
    modele: label,
    accuracy: +(m.acc * 100).toFixed(2),
    ic95: `${(lo * 100).toFixed(2)}-${(hi * 100).toFixed(2)}`,
    brier: +m.brier.toFixed(5),
    logloss: +m.logloss.toFixed(5),
    penteCalib: +cal.pente.toFixed(3),
    brierRecalibre: +mc.brier.toFixed(5),
    // Var(p_vrai) minimale impliquee : Brier_ideal = 0.25 - Var(p) et Brier_ideal <= Brier_modele
    varPMin: +(0.25 - mc.brier).toFixed(5),
    sdPMin: +Math.sqrt(Math.max(0, 0.25 - mc.brier)).toFixed(4),
    mcFaddenR2: +(1 - mc.logloss / baseLL).toFixed(5),
    brierSkill: +(1 - mc.brier / baseBrier).toFixed(5),
  });
}
console.table(rows);

/* --- accuracy d'un modele parfaitement informe dont le logit a une variance s^2 --- */
function accIdeal(sLogit) {
  // integration Gauss-Hermite simple sur z ~ N(0, s^2)
  let acc = 0;
  const M = 4001;
  const lo = -8 * sLogit;
  const hi = 8 * sLogit;
  const dz = (hi - lo) / (M - 1);
  let wsum = 0;
  for (let i = 0; i < M; i += 1) {
    const z = lo + i * dz;
    const w = Math.exp(-(z * z) / (2 * sLogit * sLogit));
    const p = sigmoid(b0 + z);
    acc += w * Math.max(p, 1 - p);
    wsum += w;
  }
  return acc / wsum;
}
function sdPfromSlogit(s) {
  const M = 4001;
  const lo = -8 * s;
  const hi = 8 * s;
  const dz = (hi - lo) / (M - 1);
  let m1 = 0;
  let m2 = 0;
  let wsum = 0;
  for (let i = 0; i < M; i += 1) {
    const z = lo + i * dz;
    const w = Math.exp(-(z * z) / (2 * s * s));
    const p = sigmoid(b0 + z);
    m1 += w * p;
    m2 += w * p * p;
    wsum += w;
  }
  m1 /= wsum;
  m2 /= wsum;
  return Math.sqrt(m2 - m1 * m1);
}

/* --- desattenuation : variance du signal "vrai" de la classe de modeles --- */
const rHalf = P3.fiabiliteDemiEchantillon.moyenne;
const out = { rHalf };
for (const [label, preds] of [
  ["M2s champions", P1.m2s],
  ["M3 champions+paires", P2.preds],
]) {
  const cal = calibrationSlope(preds);
  const zCal = preds.map((p) => cal.pente * (logit(p) - b0));
  const vHat = varOf(zCal); // variance du logit calibre hors-pli = Var(E[z|z_hat])
  // Var(z_vrai) = Var(E[z|z_hat]) / lambda avec lambda = pente d'attenuation
  // estimee par la fiabilite : lambda = r / (r + (1-r)/2) pour un modele plein
  // (2x les donnees d'un demi-echantillon)
  const lam = rHalf / (rHalf + (1 - rHalf) / 2);
  const vTrue = vHat / lam;
  const sTrue = Math.sqrt(vTrue);
  const sHat = Math.sqrt(vHat);
  out[label] = {
    sdLogitObserve: +sHat.toFixed(4),
    sdPObserve: +sdPfromSlogit(sHat).toFixed(4),
    accObserveeTheorique: +(accIdeal(sHat) * 100).toFixed(2),
    lambdaAttenuation: +lam.toFixed(4),
    sdLogitDesattenue: +sTrue.toFixed(4),
    sdPDesattenue: +sdPfromSlogit(sTrue).toFixed(4),
    accPlafondDonneesInfinies: +(accIdeal(sTrue) * 100).toFixed(2),
  };
}
console.log("\nPlafond (desattenuation) :");
console.log(JSON.stringify(out, null, 2));

/* --- table de reference : accuracy atteignable selon sd(p) --- */
const ref = [];
for (const s of [0.02, 0.04, 0.05, 0.06, 0.07, 0.08, 0.1, 0.12, 0.15, 0.2]) {
  // trouver le sLogit donnant ce sd(p)
  let lo2 = 0.001;
  let hi2 = 5;
  for (let it = 0; it < 60; it += 1) {
    const mid = (lo2 + hi2) / 2;
    if (sdPfromSlogit(mid) < s) lo2 = mid;
    else hi2 = mid;
  }
  const sl = (lo2 + hi2) / 2;
  ref.push({ sdP: s, sdLogit: +sl.toFixed(3), accMax: +(accIdeal(sl) * 100).toFixed(2) });
}
console.log("\nAccuracy maximale atteignable selon l'ecart-type de la vraie proba :");
console.table(ref);

/* --- split chronologique : 70 % passe -> 30 % futur --- */
const builtCS = rowsChampSym(games, ci);
const cut = Math.floor(n * 0.7);
const trC = [...Array(cut).keys()];
const teC = [];
for (let i = cut; i < n; i += 1) teC.push(i);
const chrono = {};
{
  const mdl = fitLogreg(trC.map((i) => builtCS.rows[i]), N, { lambda: 0.01, epochs: 500, lr: 0.05 });
  const p = teC.map((i) => predict(mdl, builtCS.rows[i]));
  const yy = teC.map((i) => ys[i]);
  const m = metrics(p, yy);
  const [lo, hi] = wilson95(m.correct, m.n);
  const prevTe = yy.reduce((a, b) => a + b, 0) / yy.length;
  chrono.M2s = {
    n: m.n,
    accuracy: +(m.acc * 100).toFixed(2),
    ic95: [+(lo * 100).toFixed(2), +(hi * 100).toFixed(2)],
    logloss: +m.logloss.toFixed(5),
    baselineBleuTest: +(prevTe * 100).toFixed(2),
    dateCoupe: games[cut].date,
  };
}
{
  const { syn, cnt } = countPairs(trC.map((i) => games[i]), ci);
  const synMap = new Map();
  const cntMap = new Map();
  for (const [k, c] of syn) if (c >= 50) synMap.set(k, synMap.size);
  for (const [k, c] of cnt) if (c >= 50) cntMap.set(k, cntMap.size);
  const off = { offSyn: N, offCnt: N + synMap.size, nFeatures: N + synMap.size + cntMap.size };
  const b1 = rowsChampPairs(trC.map((i) => games[i]), ci, synMap, cntMap, off);
  const b2 = rowsChampPairs(teC.map((i) => games[i]), ci, synMap, cntMap, off);
  const mdl = fitLogreg(b1.rows, off.nFeatures, { lambda: 0.03, epochs: 400, lr: 0.05 });
  const p = b2.rows.map((r) => predict(mdl, r));
  const yy = teC.map((i) => ys[i]);
  const m = metrics(p, yy);
  const [lo, hi] = wilson95(m.correct, m.n);
  chrono.M3 = {
    n: m.n,
    accuracy: +(m.acc * 100).toFixed(2),
    ic95: [+(lo * 100).toFixed(2), +(hi * 100).toFixed(2)],
    logloss: +m.logloss.toFixed(5),
  };
}
console.log("\nSplit chronologique (70 % passe -> 30 % futur) :");
console.log(JSON.stringify(chrono, null, 2));

/* --- McNemar contre la baseline "bleu toujours" --- */
function mcnemar(predsA, predsB) {
  let b = 0;
  let c = 0;
  for (let i = 0; i < n; i += 1) {
    const a = (predsA[i] >= 0.5 ? 1 : 0) === ys[i];
    const d = (predsB[i] >= 0.5 ? 1 : 0) === ys[i];
    if (a && !d) b += 1;
    else if (!a && d) c += 1;
  }
  const chi2 = (Math.abs(b - c) - 1) ** 2 / (b + c);
  // p approx via loi normale (chi2 a 1 ddl)
  const z = Math.sqrt(chi2);
  const p = 2 * (1 - 0.5 * (1 + erf(z / Math.SQRT2)));
  return { aSeul: b, bSeul: c, chi2: +chi2.toFixed(2), p: p < 1e-12 ? "<1e-12" : p.toExponential(2) };
}
function erf(x) {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return s * y;
}
const alwaysBlue = new Array(n).fill(0.9);
const mcn = {
  "M2s vs bleu-toujours": mcnemar(P1.m2s, alwaysBlue),
  "M3 vs bleu-toujours": mcnemar(P2.preds, alwaysBlue),
  "M3 vs M2s": mcnemar(P2.preds, P1.m2s),
  "M5 vs M4": mcnemar(P3.predsM5, P3.predsM4),
};
console.log("\nMcNemar :");
console.log(JSON.stringify(mcn, null, 2));

writeFileSync(A + "out_04_plafond.json", JSON.stringify({ table: rows, plafond: out, reference: ref, chrono, mcnemar: mcn }, null, 2));
console.log("\necrit out_04_plafond.json");
