/**
 * AXE 4 - modeles triviaux draft-only, validation croisee honnete.
 *
 * M0  : "le bleu gagne toujours"
 * M0b : prior de cote appris hors-pli (probabilite constante = prevalence du pli d'entrainement)
 * M1  : somme des winrates individuels des champions (winrates calcules hors-pli, lissage
 *       bayesien k choisi par CV interne), decision par le signe de la difference
 * M1c : idem mais calibre par une logistique 1 variable apprise sur le pli d'entrainement
 *       (donne des probabilites, integre l'avantage de cote)
 * M2  : logistique sur indicatrices de champions 162x2 (bleu/rouge), L2, lambda par CV interne
 * M2s : logistique symetrique x_c = 1(bleu) - 1(rouge), 162 features + biais
 *
 * Protocole : 5 plis externes par gameid (hash FNV-1a), 4 plis internes pour les
 * hyperparametres. Aucun apprentissage sur le pli de test.
 */
import { writeFileSync } from "fs";
import { readGames, foldOf, wilson95 } from "./lib_data.mjs";
import { fitLogreg, predict, metrics, sigmoid } from "./lib_logreg.mjs";
import { buildChampIndex, rowsChampAsym, rowsChampSym } from "./lib_features.mjs";

const K_OUT = 5;
const K_IN = 4;
const EPOCHS = 500;

const games = readGames();
const ci = buildChampIndex(games);
const N = ci.list.length;
const ys = games.map((g) => (g.blueWin ? 1 : 0));
const outFold = games.map((g) => foldOf(g.id, K_OUT));
// plis internes : hash decale, stable
const inFold = games.map((g) => foldOf(g.id + "#in", K_IN));

console.log(`parties=${games.length} champions=${N}`);

/* ------------------------------------------------------------------ */
/* M0 / M0b                                                            */
/* ------------------------------------------------------------------ */
const predAlwaysBlue = ys.map(() => 1);
const m0 = metrics(predAlwaysBlue.map(() => 0.999999), ys);
const m0acc = ys.filter((y) => y === 1).length / ys.length;

const predPrior = new Array(games.length);
for (let f = 0; f < K_OUT; f += 1) {
  let w = 0;
  let n = 0;
  for (let i = 0; i < games.length; i += 1)
    if (outFold[i] !== f) {
      w += ys[i];
      n += 1;
    }
  const p = w / n;
  for (let i = 0; i < games.length; i += 1) if (outFold[i] === f) predPrior[i] = p;
}
const m0b = metrics(predPrior, ys);

/* ------------------------------------------------------------------ */
/* M1 : somme des winrates individuels                                 */
/* ------------------------------------------------------------------ */
function champWinrates(trainIdx, k) {
  const wins = new Float64Array(N);
  const picks = new Float64Array(N);
  let gw = 0;
  for (const i of trainIdx) {
    const g = games[i];
    const y = ys[i];
    for (const c of g.blue) {
      const j = ci.idx.get(c);
      picks[j] += 1;
      wins[j] += y;
    }
    for (const c of g.red) {
      const j = ci.idx.get(c);
      picks[j] += 1;
      wins[j] += 1 - y;
    }
    gw += 1;
  }
  const prior = 0.5;
  const wr = new Float64Array(N);
  for (let j = 0; j < N; j += 1) wr[j] = (wins[j] + k * prior) / (picks[j] + k);
  return { wr, picks, nTrain: gw };
}

function scoreM1(g, wr) {
  let s = 0;
  for (const c of g.blue) s += wr[ci.idx.get(c)];
  for (const c of g.red) s -= wr[ci.idx.get(c)];
  return s;
}

const K_GRID = [0, 5, 10, 25, 50, 100, 200, 400];

function m1AccOn(idxTrain, idxEval, k) {
  const { wr } = champWinrates(idxTrain, k);
  let ok = 0;
  for (const i of idxEval) {
    const s = scoreM1(games[i], wr);
    const pred = s > 0 ? 1 : s < 0 ? 0 : 1; // egalite -> bleu (prior de cote)
    if (pred === ys[i]) ok += 1;
  }
  return ok / idxEval.length;
}

const allIdx = games.map((_, i) => i);
const predM1 = new Array(games.length);
const predM1c = new Array(games.length);
const chosenK = [];
const chosenKcal = [];

for (let f = 0; f < K_OUT; f += 1) {
  const tr = allIdx.filter((i) => outFold[i] !== f);
  const te = allIdx.filter((i) => outFold[i] === f);
  // CV interne pour k (critere : accuracy)
  let bestK = K_GRID[0];
  let bestAcc = -1;
  for (const k of K_GRID) {
    let acc = 0;
    for (let g2 = 0; g2 < K_IN; g2 += 1) {
      const itr = tr.filter((i) => inFold[i] !== g2);
      const ite = tr.filter((i) => inFold[i] === g2);
      acc += m1AccOn(itr, ite, k);
    }
    acc /= K_IN;
    if (acc > bestAcc) {
      bestAcc = acc;
      bestK = k;
    }
  }
  chosenK.push(bestK);
  const { wr } = champWinrates(tr, bestK);
  for (const i of te) {
    const s = scoreM1(games[i], wr);
    predM1[i] = s > 0 ? 0.999999 : s < 0 ? 0.000001 : 0.999999;
  }

  // M1c : calibration logistique 1 variable (score -> p) apprise sur tr
  // k separement optimise sur la log-perte interne
  let bestKc = K_GRID[0];
  let bestLL = Infinity;
  for (const k of K_GRID) {
    let ll = 0;
    for (let g2 = 0; g2 < K_IN; g2 += 1) {
      const itr = tr.filter((i) => inFold[i] !== g2);
      const ite = tr.filter((i) => inFold[i] === g2);
      const { wr: w2 } = champWinrates(itr, k);
      const rowsTr = itr.map((i) => ({
        idx: Int32Array.from([0]),
        val: Float64Array.from([scoreM1(games[i], w2)]),
        y: ys[i],
      }));
      const mdl = fitLogreg(rowsTr, 1, { lambda: 0, epochs: 400, lr: 0.05 });
      const ps = ite.map((i) =>
        predict(mdl, { idx: Int32Array.from([0]), val: Float64Array.from([scoreM1(games[i], w2)]) })
      );
      ll += metrics(ps, ite.map((i) => ys[i])).logloss;
    }
    ll /= K_IN;
    if (ll < bestLL) {
      bestLL = ll;
      bestKc = k;
    }
  }
  chosenKcal.push(bestKc);
  const { wr: wrc } = champWinrates(tr, bestKc);
  const rowsTr = tr.map((i) => ({
    idx: Int32Array.from([0]),
    val: Float64Array.from([scoreM1(games[i], wrc)]),
    y: ys[i],
  }));
  const mdl = fitLogreg(rowsTr, 1, { lambda: 0, epochs: 600, lr: 0.05 });
  for (const i of te) {
    predM1c[i] = predict(mdl, {
      idx: Int32Array.from([0]),
      val: Float64Array.from([scoreM1(games[i], wrc)]),
    });
  }
}
const m1 = metrics(predM1, ys);
const m1c = metrics(predM1c, ys);

/* ------------------------------------------------------------------ */
/* M2 / M2s : logistiques                                              */
/* ------------------------------------------------------------------ */
const LAMBDA_GRID = [0.0003, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3];

function runLogregCV(builder, label) {
  const built = builder(games);
  const rowsAll = built.rows;
  const nF = built.nFeatures;
  const preds = new Array(games.length);
  const lams = [];
  for (let f = 0; f < K_OUT; f += 1) {
    const tr = allIdx.filter((i) => outFold[i] !== f);
    const te = allIdx.filter((i) => outFold[i] === f);
    let bestLam = LAMBDA_GRID[0];
    let bestLL = Infinity;
    for (const lam of LAMBDA_GRID) {
      let ll = 0;
      for (let g2 = 0; g2 < K_IN; g2 += 1) {
        const itr = tr.filter((i) => inFold[i] !== g2).map((i) => rowsAll[i]);
        const iteIdx = tr.filter((i) => inFold[i] === g2);
        const mdl = fitLogreg(itr, nF, { lambda: lam, epochs: EPOCHS, lr: 0.05 });
        const ps = iteIdx.map((i) => predict(mdl, rowsAll[i]));
        ll += metrics(ps, iteIdx.map((i) => ys[i])).logloss;
      }
      ll /= K_IN;
      if (ll < bestLL) {
        bestLL = ll;
        bestLam = lam;
      }
    }
    lams.push(bestLam);
    const mdl = fitLogreg(tr.map((i) => rowsAll[i]), nF, { lambda: bestLam, epochs: EPOCHS, lr: 0.05 });
    for (const i of te) preds[i] = predict(mdl, rowsAll[i]);
    process.stdout.write(`  ${label} pli ${f + 1}/${K_OUT} lambda=${bestLam}\n`);
  }
  return { m: metrics(preds, ys), lams, preds };
}

console.log("M2 (asymetrique 162x2)...");
const r2 = runLogregCV((gs) => rowsChampAsym(gs, ci), "M2");
console.log("M2s (symetrique 162)...");
const r2s = runLogregCV((gs) => rowsChampSym(gs, ci), "M2s");

/* ------------------------------------------------------------------ */
/* Sortie                                                              */
/* ------------------------------------------------------------------ */
function fmt(label, m, acc = null) {
  const a = acc ?? m.acc;
  const [lo, hi] = wilson95(Math.round(a * m.n), m.n);
  return {
    modele: label,
    n: m.n,
    accuracy: +(a * 100).toFixed(2),
    ic95: [+(lo * 100).toFixed(2), +(hi * 100).toFixed(2)],
    brier: +m.brier.toFixed(5),
    logloss: +m.logloss.toFixed(5),
  };
}

const base = metrics(predPrior, ys);
const table = [
  fmt("M0 bleu toujours", { ...m0, n: ys.length }, m0acc),
  fmt("M0b prior de cote (hors-pli)", m0b),
  fmt("M1 somme winrates (signe)", m1),
  fmt("M1c somme winrates calibree", m1c),
  fmt("M2 logistique 162x2", r2.m),
  fmt("M2s logistique symetrique 162", r2s.m),
];
// Brier / log-loss skill score vs prior de cote
for (const t of table) {
  t.brierSkillVsPrior = +(1 - t.brier / base.brier).toFixed(4);
  t.loglossSkillVsPrior = +(1 - t.logloss / base.logloss).toFixed(4);
}

console.table(table);
const out = {
  parties: games.length,
  champions: N,
  prevalenceBleu: +(ys.reduce((a, b) => a + b, 0) / ys.length).toFixed(5),
  kChoisiM1: chosenK,
  kChoisiM1c: chosenKcal,
  lambdaM2: r2.lams,
  lambdaM2s: r2s.lams,
  table,
};
writeFileSync(
  "C:/Users/Admin/Documents/lol-coach/scripts/analysis/out_01_baselines.json",
  JSON.stringify(out, null, 2)
);
writeFileSync(
  "C:/Users/Admin/Documents/lol-coach/scripts/analysis/out_01_preds.json",
  JSON.stringify({ ids: games.map((g) => g.id), ys, m2s: r2s.preds, m1c: predM1c })
);
console.log("ecrit out_01_baselines.json");
