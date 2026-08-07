/**
 * Evaluation "deployable" : walk-forward chronologique.
 * On entraine sur le passe uniquement, on predit le bloc suivant, on avance.
 * Lambda choisi sur les 20 % les plus recents de la fenetre d'entrainement.
 * Variante fenetre glissante (W dernieres parties) pour mesurer la derive du meta.
 */
import { writeFileSync } from "fs";
import { readGames, wilson95 } from "./lib_data.mjs";
import { fitLogreg, predict, metrics } from "./lib_logreg.mjs";
import { buildChampIndex, rowsChampSym, countPairs, rowsChampPairs } from "./lib_features.mjs";

const games = readGames(); // deja trie par date
const ys = games.map((g) => (g.blueWin ? 1 : 0));
const n = games.length;
const ci = buildChampIndex(games);
const N = ci.list.length;
const builtCS = rowsChampSym(games, ci);
const LAMBDA_GRID = [0.003, 0.01, 0.03, 0.1, 0.3];
const START = 3000;
const BLOCK = 500;

function evalWindow(fitPredict, windowSize, label) {
  const preds = new Array(n).fill(null);
  const blocks = [];
  for (let s = START; s < n; s += BLOCK) {
    const e = Math.min(n, s + BLOCK);
    const trStart = windowSize ? Math.max(0, s - windowSize) : 0;
    const tr = [];
    for (let i = trStart; i < s; i += 1) tr.push(i);
    const te = [];
    for (let i = s; i < e; i += 1) te.push(i);
    const p = fitPredict(tr, te);
    te.forEach((i, j) => (preds[i] = p[j]));
    const m = metrics(p, te.map((i) => ys[i]));
    blocks.push({
      debut: games[s].date.slice(0, 10),
      nTrain: tr.length,
      n: m.n,
      acc: +(m.acc * 100).toFixed(2),
      baseline: +((te.filter((i) => ys[i] === 1).length / te.length) * 100).toFixed(2),
    });
  }
  const idx = preds.map((p, i) => (p === null ? -1 : i)).filter((i) => i >= 0);
  const m = metrics(idx.map((i) => preds[i]), idx.map((i) => ys[i]));
  const base = idx.filter((i) => ys[i] === 1).length / idx.length;
  const [lo, hi] = wilson95(m.correct, m.n);
  const res = {
    modele: label,
    fenetre: windowSize || "expansive",
    n: m.n,
    accuracy: +(m.acc * 100).toFixed(2),
    ic95: [+(lo * 100).toFixed(2), +(hi * 100).toFixed(2)],
    baselineBleu: +(base * 100).toFixed(2),
    gainVsBaseline: +((m.acc - base) * 100).toFixed(2),
    logloss: +m.logloss.toFixed(5),
    brier: +m.brier.toFixed(5),
  };
  console.log(
    `${label} fenetre=${res.fenetre}: acc=${res.accuracy}% [${res.ic95.join(";")}] baseline=${res.baselineBleu}% gain=${res.gainVsBaseline}pp ll=${res.logloss} (n=${res.n})`
  );
  return { res, blocks, preds };
}

/* --- M2s --- */
function fitPredictM2s(tr, te) {
  const cutIn = Math.floor(tr.length * 0.8);
  const itr = tr.slice(0, cutIn);
  const ite = tr.slice(cutIn);
  let best = null;
  for (const lam of LAMBDA_GRID) {
    const mdl = fitLogreg(itr.map((i) => builtCS.rows[i]), N, { lambda: lam, epochs: 400, lr: 0.05 });
    const ll = metrics(ite.map((i) => predict(mdl, builtCS.rows[i])), ite.map((i) => ys[i])).logloss;
    if (!best || ll < best.ll) best = { ll, lam };
  }
  const mdl = fitLogreg(tr.map((i) => builtCS.rows[i]), N, { lambda: best.lam, epochs: 400, lr: 0.05 });
  return te.map((i) => predict(mdl, builtCS.rows[i]));
}

/* --- M3 (champions + paires, support min 50) --- */
function fitPredictM3(tr, te) {
  const build = (idxTrain, minSup) => {
    const { syn, cnt } = countPairs(idxTrain.map((i) => games[i]), ci);
    const synMap = new Map();
    const cntMap = new Map();
    for (const [k, c] of syn) if (c >= minSup) synMap.set(k, synMap.size);
    for (const [k, c] of cnt) if (c >= minSup) cntMap.set(k, cntMap.size);
    return { synMap, cntMap, off: { offSyn: N, offCnt: N + synMap.size, nFeatures: N + synMap.size + cntMap.size } };
  };
  const cutIn = Math.floor(tr.length * 0.8);
  const itr = tr.slice(0, cutIn);
  const ite = tr.slice(cutIn);
  let best = null;
  for (const lam of [0.01, 0.03, 0.1, 0.3]) {
    const { synMap, cntMap, off } = build(itr, 50);
    const b1 = rowsChampPairs(itr.map((i) => games[i]), ci, synMap, cntMap, off);
    const b2 = rowsChampPairs(ite.map((i) => games[i]), ci, synMap, cntMap, off);
    const mdl = fitLogreg(b1.rows, off.nFeatures, { lambda: lam, epochs: 350, lr: 0.05 });
    const ll = metrics(b2.rows.map((r) => predict(mdl, r)), ite.map((i) => ys[i])).logloss;
    if (!best || ll < best.ll) best = { ll, lam };
  }
  const { synMap, cntMap, off } = build(tr, 50);
  const b1 = rowsChampPairs(tr.map((i) => games[i]), ci, synMap, cntMap, off);
  const b2 = rowsChampPairs(te.map((i) => games[i]), ci, synMap, cntMap, off);
  const mdl = fitLogreg(b1.rows, off.nFeatures, { lambda: best.lam, epochs: 350, lr: 0.05 });
  return b2.rows.map((r) => predict(mdl, r));
}

const results = [];
const a = evalWindow(fitPredictM2s, 0, "M2s champions");
results.push(a.res);
const b = evalWindow(fitPredictM2s, 3000, "M2s champions");
results.push(b.res);
const c = evalWindow(fitPredictM2s, 1500, "M2s champions");
results.push(c.res);
const d = evalWindow(fitPredictM3, 0, "M3 champions+paires");
results.push(d.res);
const e = evalWindow(fitPredictM3, 3000, "M3 champions+paires");
results.push(e.res);

/* --- baseline "bleu toujours" sur la meme periode d'evaluation --- */
console.log("\nDetail par bloc (M2s expansif) :");
console.table(a.blocks);

writeFileSync(
  "C:/Users/Admin/Documents/lol-coach/scripts/analysis/out_05_walkforward.json",
  JSON.stringify({ results, blocsM2sExpansif: a.blocks, blocsM3Expansif: d.blocks }, null, 2)
);
console.log("ecrit out_05_walkforward.json");
