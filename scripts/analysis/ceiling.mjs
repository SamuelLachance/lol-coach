#!/usr/bin/env node
/**
 * AXE 2 — plafond de signal : combien d'information "draft seule" existe RÉELLEMENT
 * dans les parties 2022 ? On entraîne une régression logistique L2 sur la composition
 * (champion présent côté bleu = +1, côté rouge = -1), donc un modèle 100 % natif 2022,
 * et on mesure son accuracy HORS ÉCHANTILLON (5-fold + split chronologique).
 *
 * Sert de référence : si un modèle calibré sur 2022 lui-même plafonne bas, l'échec du
 * moteur ne peut pas être attribué uniquement au décalage de méta.
 *
 * Nécessite scripts/analysis/base_margins.json (produit par patch_league.mjs).
 * Usage : node scripts/analysis/ceiling.mjs [--json out.json]
 */
import { readFileSync, writeFileSync } from "fs";
import { wilson } from "./lib.mjs";

function arg(f, d = null) {
  const i = process.argv.indexOf(f);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
}

const data = JSON.parse(readFileSync(new URL("./base_margins.json", import.meta.url), "utf8"));

// index champions
const idx = new Map();
for (const g of data) for (const n of [...g.b, ...g.r]) if (!idx.has(n)) idx.set(n, idx.size);
const D = idx.size;

// design sparse : liste d'indices (+1 bleu / -1 rouge)
const X = data.map((g) => ({
  pos: g.b.map((n) => idx.get(n)),
  neg: g.r.map((n) => idx.get(n)),
  y: g.w ? 1 : 0,
  m: g.m,
  patch: g.pa,
}));

function trainLogit(train, lambda, iters = 400, lr = 0.5) {
  const w = new Float64Array(D);
  let b = 0;
  const n = train.length;
  for (let it = 0; it < iters; it += 1) {
    const gw = new Float64Array(D);
    let gb = 0;
    for (const s of train) {
      let z = b;
      for (const j of s.pos) z += w[j];
      for (const j of s.neg) z -= w[j];
      const p = 1 / (1 + Math.exp(-z));
      const e = p - s.y;
      gb += e;
      for (const j of s.pos) gw[j] += e;
      for (const j of s.neg) gw[j] -= e;
    }
    b -= (lr * gb) / n;
    for (let j = 0; j < D; j += 1) w[j] -= lr * (gw[j] / n + lambda * w[j]);
  }
  return { w, b };
}

function predict(model, s) {
  let z = model.b;
  for (const j of s.pos) z += model.w[j];
  for (const j of s.neg) z -= model.w[j];
  return 1 / (1 + Math.exp(-z));
}

function evalSet(model, test) {
  let correct = 0;
  let brier = 0;
  let ll = 0;
  for (const s of test) {
    const p = predict(model, s);
    if ((p > 0.5 ? 1 : 0) === s.y) correct += 1;
    brier += (p - s.y) ** 2;
    const pc = Math.min(0.999, Math.max(0.001, p));
    ll += -(s.y * Math.log(pc) + (1 - s.y) * Math.log(1 - pc));
  }
  return {
    n: test.length,
    accuracyPct: +((correct / test.length) * 100).toFixed(2),
    ic95: wilson(correct, test.length),
    brier: +(brier / test.length).toFixed(4),
    logLoss: +(ll / test.length).toFixed(4),
  };
}

// 5-fold déterministe
function folds(k) {
  const out = Array.from({ length: k }, () => []);
  X.forEach((s, i) => out[i % k].push(s));
  return out;
}

const results = [];
for (const lambda of [0.3, 0.1, 0.03, 0.01, 0.003]) {
  const F = folds(5);
  let correct = 0;
  let n = 0;
  let brier = 0;
  for (let k = 0; k < 5; k += 1) {
    const test = F[k];
    const train = F.filter((_, i) => i !== k).flat();
    const model = trainLogit(train, lambda);
    for (const s of test) {
      const p = predict(model, s);
      if ((p > 0.5 ? 1 : 0) === s.y) correct += 1;
      brier += (p - s.y) ** 2;
      n += 1;
    }
  }
  results.push({
    lambda,
    accuracyOOSPct: +((correct / n) * 100).toFixed(2),
    ic95: wilson(correct, n),
    brier: +(brier / n).toFixed(4),
    n,
  });
  console.error(`lambda=${lambda} OOS acc=${((correct / n) * 100).toFixed(2)}%`);
}

const best = results.reduce((a, b) => (b.accuracyOOSPct > a.accuracyOOSPct ? b : a));

// In-sample (mesure du sur-apprentissage)
const full = trainLogit(X, best.lambda);
const inSample = evalSet(full, X);

// Split chronologique : entraîner sur la première moitié de la saison, tester sur la seconde
const patchNum = (p) => Number(String(p).replace(/[^0-9.]/g, "")) || 0;
const sorted = [...X].sort((a, b) => patchNum(a.patch) - patchNum(b.patch));
const cut = Math.floor(sorted.length * 0.6);
const trainC = sorted.slice(0, cut);
const testC = sorted.slice(cut);
const chrono = evalSet(trainLogit(trainC, best.lambda), testC);
const cutPatch = sorted[cut].patch;

// Référence : baseline côté bleu + moteur heuristique sur les mêmes parties
const blueWins = X.filter((s) => s.y === 1).length;
let engCorrect = 0;
let engDec = 0;
for (const s of X) {
  if (s.m === 0) continue;
  engDec += 1;
  if (s.m > 0 === (s.y === 1)) engCorrect += 1;
}
let engChronoC = 0;
let engChronoD = 0;
for (const s of testC) {
  if (s.m === 0) continue;
  engChronoD += 1;
  if (s.m > 0 === (s.y === 1)) engChronoC += 1;
}

const out = {
  parties: X.length,
  championsDistincts: D,
  baselineBleuToujours: {
    accuracyPct: +((blueWins / X.length) * 100).toFixed(2),
    ic95: wilson(blueWins, X.length),
  },
  moteurHeuristique2026: {
    accuracyPct: +((engCorrect / engDec) * 100).toFixed(2),
    ic95: wilson(engCorrect, engDec),
  },
  plafondLogistique2022_5fold: results,
  meilleurLambda: best.lambda,
  plafondInSample: inSample,
  splitChronologique: {
    patchDeCoupure: cutPatch,
    partiesTrain: trainC.length,
    partiesTest: testC.length,
    modeleNatif2022: chrono,
    moteurHeuristique2026SurLeMemeTest: {
      accuracyPct: +((engChronoC / engChronoD) * 100).toFixed(2),
      ic95: wilson(engChronoC, engChronoD),
    },
    baselineBleuSurLeMemeTest: +((testC.filter((s) => s.y === 1).length / testC.length) * 100).toFixed(2),
  },
};

const o = arg("--json");
if (o) writeFileSync(o, JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));
