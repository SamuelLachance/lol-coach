/**
 * M3 : champions symetriques + paires empiriques (synergie intra-equipe, counter inter-equipe).
 * Les tables de paires sont construites UNIQUEMENT sur le pli d'entrainement (aucune fuite).
 * Support minimal et lambda choisis par CV interne 3 plis.
 */
import { writeFileSync } from "fs";
import { readGames, foldOf, wilson95 } from "./lib_data.mjs";
import { fitLogreg, predict, metrics } from "./lib_logreg.mjs";
import { buildChampIndex, countPairs, rowsChampPairs, pairKey } from "./lib_features.mjs";

const K_OUT = 5;
const K_IN = 3;
const EPOCHS = 400;
const games = readGames();
const ci = buildChampIndex(games);
const N = ci.list.length;
const ys = games.map((g) => (g.blueWin ? 1 : 0));
const allIdx = games.map((_, i) => i);
const outFold = games.map((g) => foldOf(g.id, K_OUT));
const inFold = games.map((g) => foldOf(g.id + "#p", K_IN));

/* --- diagnostic de support des paires sur l'ensemble complet --- */
const full = countPairs(games, ci);
const synC = [...full.syn.values()].sort((a, b) => b - a);
const cntC = [...full.cnt.values()].sort((a, b) => b - a);
const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
const support = {
  pairesSynergieObservees: full.syn.size,
  pairesSynergiePossibles: (N * (N - 1)) / 2,
  observationsSynergie: 20 * games.length,
  medianeSupportSynergie: q(synC, 0.5),
  synergieSup20: synC.filter((c) => c >= 20).length,
  synergieSup50: synC.filter((c) => c >= 50).length,
  synergieSup100: synC.filter((c) => c >= 100).length,
  pairesCounterObservees: full.cnt.size,
  observationsCounter: 25 * games.length,
  medianeSupportCounter: q(cntC, 0.5),
  counterSup20: cntC.filter((c) => c >= 20).length,
  counterSup50: cntC.filter((c) => c >= 50).length,
  counterSup100: cntC.filter((c) => c >= 100).length,
};
console.log(JSON.stringify(support, null, 2));

/* --- construction des tables de paires a partir d'un pli d'entrainement --- */
function buildMaps(trainIdx, minSup) {
  const { syn, cnt } = countPairs(trainIdx.map((i) => games[i]), ci);
  const synMap = new Map();
  const cntMap = new Map();
  for (const [k, c] of syn) if (c >= minSup) synMap.set(k, synMap.size);
  for (const [k, c] of cnt) if (c >= minSup) cntMap.set(k, cntMap.size);
  const offsets = {
    offSyn: N,
    offCnt: N + synMap.size,
    nFeatures: N + synMap.size + cntMap.size,
  };
  return { synMap, cntMap, offsets };
}

const MINSUP_GRID = [20, 50, 150];
const LAMBDA_GRID = [0.01, 0.03, 0.1, 0.3, 1];

const preds = new Array(games.length);
const chosen = [];
for (let f = 0; f < K_OUT; f += 1) {
  const tr = allIdx.filter((i) => outFold[i] !== f);
  const te = allIdx.filter((i) => outFold[i] === f);
  let best = null;
  for (const ms of MINSUP_GRID) {
    for (const lam of LAMBDA_GRID) {
      let ll = 0;
      for (let g2 = 0; g2 < K_IN; g2 += 1) {
        const itr = tr.filter((i) => inFold[i] !== g2);
        const ite = tr.filter((i) => inFold[i] === g2);
        const { synMap, cntMap, offsets } = buildMaps(itr, ms);
        const b1 = rowsChampPairs(itr.map((i) => games[i]), ci, synMap, cntMap, offsets);
        const b2 = rowsChampPairs(ite.map((i) => games[i]), ci, synMap, cntMap, offsets);
        const mdl = fitLogreg(b1.rows, offsets.nFeatures, { lambda: lam, epochs: EPOCHS, lr: 0.05 });
        ll += metrics(b2.rows.map((r) => predict(mdl, r)), ite.map((i) => ys[i])).logloss;
      }
      ll /= K_IN;
      if (!best || ll < best.ll) best = { ll, ms, lam };
    }
  }
  chosen.push(best);
  const { synMap, cntMap, offsets } = buildMaps(tr, best.ms);
  const b1 = rowsChampPairs(tr.map((i) => games[i]), ci, synMap, cntMap, offsets);
  const b2 = rowsChampPairs(te.map((i) => games[i]), ci, synMap, cntMap, offsets);
  const mdl = fitLogreg(b1.rows, offsets.nFeatures, { lambda: best.lam, epochs: EPOCHS, lr: 0.05 });
  b2.rows.forEach((r, j) => (preds[te[j]] = predict(mdl, r)));
  console.log(
    `pli ${f + 1}/${K_OUT} minSup=${best.ms} lambda=${best.lam} features=${offsets.nFeatures} (syn=${synMap.size} cnt=${cntMap.size})`
  );
}

const m = metrics(preds, ys);
const [lo, hi] = wilson95(m.correct, m.n);
const res = {
  support,
  choix: chosen,
  modele: "M3 champions + paires",
  n: m.n,
  accuracy: +(m.acc * 100).toFixed(2),
  ic95: [+(lo * 100).toFixed(2), +(hi * 100).toFixed(2)],
  brier: +m.brier.toFixed(5),
  logloss: +m.logloss.toFixed(5),
};
console.log(JSON.stringify(res, null, 2));
writeFileSync(
  "C:/Users/Admin/Documents/lol-coach/scripts/analysis/out_02_pairs.json",
  JSON.stringify({ ...res, preds }, null, 2)
);
