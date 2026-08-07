/**
 * Plafond atteignable : identite d'equipe, draft purgee du confondant "force d'equipe",
 * courbe d'apprentissage, fiabilite demi-echantillon, et bornes de variance expliquee.
 */
import { writeFileSync, readFileSync } from "fs";
import { readGames, foldOf, wilson95 } from "./lib_data.mjs";
import { fitLogreg, predict, metrics, sigmoid } from "./lib_logreg.mjs";
import {
  buildChampIndex,
  buildTeamIndex,
  rowsChampSym,
  rowsTeamSym,
  rowsTeamChamp,
} from "./lib_features.mjs";

const K_OUT = 5;
const K_IN = 4;
const EPOCHS = 500;
const games = readGames();
const ci = buildChampIndex(games);
const ti = buildTeamIndex(games);
const N = ci.list.length;
const T = ti.list.length;
const ys = games.map((g) => (g.blueWin ? 1 : 0));
const allIdx = games.map((_, i) => i);
const outFold = games.map((g) => foldOf(g.id, K_OUT));
const inFold = games.map((g) => foldOf(g.id + "#in", K_IN));
const LAMBDA_GRID = [0.0003, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1];

function cv(built, label, gridOverride) {
  const grid = gridOverride || LAMBDA_GRID;
  const rowsAll = built.rows;
  const nF = built.nFeatures;
  const preds = new Array(games.length);
  const lams = [];
  for (let f = 0; f < K_OUT; f += 1) {
    const tr = allIdx.filter((i) => outFold[i] !== f);
    const te = allIdx.filter((i) => outFold[i] === f);
    let best = null;
    for (const lam of grid) {
      let ll = 0;
      for (let g2 = 0; g2 < K_IN; g2 += 1) {
        const itr = tr.filter((i) => inFold[i] !== g2).map((i) => rowsAll[i]);
        const ite = tr.filter((i) => inFold[i] === g2);
        const mdl = fitLogreg(itr, nF, { lambda: lam, epochs: EPOCHS, lr: 0.05 });
        ll += metrics(ite.map((i) => predict(mdl, rowsAll[i])), ite.map((i) => ys[i])).logloss;
      }
      ll /= K_IN;
      if (!best || ll < best.ll) best = { ll, lam };
    }
    lams.push(best.lam);
    const mdl = fitLogreg(tr.map((i) => rowsAll[i]), nF, { lambda: best.lam, epochs: EPOCHS, lr: 0.05 });
    for (const i of te) preds[i] = predict(mdl, rowsAll[i]);
  }
  const m = metrics(preds, ys);
  const [lo, hi] = wilson95(m.correct, m.n);
  console.log(
    `${label}: acc=${(m.acc * 100).toFixed(2)}% [${(lo * 100).toFixed(2)};${(hi * 100).toFixed(2)}] brier=${m.brier.toFixed(5)} ll=${m.logloss.toFixed(5)} lambdas=${lams.join(",")}`
  );
  return { label, m, lams, preds, lo, hi };
}

/* ---- M4 : identite d'equipe seule (pas de draft) ---- */
const r4 = cv(rowsTeamSym(games, ti), "M4 equipes seules");
/* ---- M5 : equipes + champions ---- */
const r5 = cv(rowsTeamChamp(games, ti, ci), "M5 equipes + champions");
/* ---- M2s rappel ---- */
const r2s = cv(rowsChampSym(games, ci), "M2s champions seuls");

/* ---- M6 : coefficients champions estimes AVEC controle d'equipe,
        puis prediction test sans info d'equipe (draft "purgee") ---- */
const builtTC = rowsTeamChamp(games, ti, ci);
const builtCS = rowsChampSym(games, ci);
const preds6 = new Array(games.length);
for (let f = 0; f < K_OUT; f += 1) {
  const tr = allIdx.filter((i) => outFold[i] !== f);
  const te = allIdx.filter((i) => outFold[i] === f);
  const lam = r5.lams[f];
  const mdl = fitLogreg(tr.map((i) => builtTC.rows[i]), builtTC.nFeatures, {
    lambda: lam,
    epochs: EPOCHS,
    lr: 0.05,
  });
  // on ne garde que le bloc champions (colonnes T..T+N)
  const wc = { w: mdl.w.slice(T, T + N), b: mdl.b };
  // recalibration du biais + pente sur le pli d'entrainement (sans info d'equipe)
  const scoresTr = tr.map((i) => {
    const r = builtCS.rows[i];
    let z = 0;
    for (let j = 0; j < r.idx.length; j += 1) z += wc.w[r.idx[j]] * r.val[j];
    return z;
  });
  const cal = fitLogreg(
    scoresTr.map((s, j) => ({ idx: Int32Array.from([0]), val: Float64Array.from([s]), y: ys[tr[j]] })),
    1,
    { lambda: 0, epochs: 600, lr: 0.05 }
  );
  for (const i of te) {
    const r = builtCS.rows[i];
    let z = 0;
    for (let j = 0; j < r.idx.length; j += 1) z += wc.w[r.idx[j]] * r.val[j];
    preds6[i] = sigmoid(cal.b + cal.w[0] * z);
  }
}
const m6 = metrics(preds6, ys);
const [l6, h6] = wilson95(m6.correct, m6.n);
console.log(
  `M6 draft purgee (coef appris avec effets equipe): acc=${(m6.acc * 100).toFixed(2)}% [${(l6 * 100).toFixed(2)};${(h6 * 100).toFixed(2)}] brier=${m6.brier.toFixed(5)} ll=${m6.logloss.toFixed(5)}`
);

/* ---- Courbe d'apprentissage sur M2s ---- */
const learning = [];
for (const frac of [0.125, 0.25, 0.5, 0.75, 1]) {
  const preds = new Array(games.length);
  let used = 0;
  for (let f = 0; f < K_OUT; f += 1) {
    const tr = allIdx.filter((i) => outFold[i] !== f);
    const te = allIdx.filter((i) => outFold[i] === f);
    const sub = tr.filter((_, j) => j % 1000 < Math.round(frac * 1000));
    used += sub.length;
    const mdl = fitLogreg(sub.map((i) => builtCS.rows[i]), N, {
      lambda: r2s.lams[f],
      epochs: EPOCHS,
      lr: 0.05,
    });
    for (const i of te) preds[i] = predict(mdl, builtCS.rows[i]);
  }
  const m = metrics(preds, ys);
  learning.push({
    fraction: frac,
    nTrainMoyen: Math.round(used / K_OUT),
    accuracy: +(m.acc * 100).toFixed(2),
    logloss: +m.logloss.toFixed(5),
  });
  console.log(`courbe M2s frac=${frac} nTrain~${Math.round(used / K_OUT)} acc=${(m.acc * 100).toFixed(2)}%`);
}

/* ---- Fiabilite demi-echantillon : deux modeles independants, correlation sur le test ---- */
const halfRel = [];
for (let f = 0; f < K_OUT; f += 1) {
  const tr = allIdx.filter((i) => outFold[i] !== f);
  const te = allIdx.filter((i) => outFold[i] === f);
  const A = tr.filter((i) => foldOf(games[i].id + "#half", 2) === 0);
  const B = tr.filter((i) => foldOf(games[i].id + "#half", 2) === 1);
  const mA = fitLogreg(A.map((i) => builtCS.rows[i]), N, { lambda: r2s.lams[f], epochs: EPOCHS, lr: 0.05 });
  const mB = fitLogreg(B.map((i) => builtCS.rows[i]), N, { lambda: r2s.lams[f], epochs: EPOCHS, lr: 0.05 });
  const za = te.map((i) => {
    const r = builtCS.rows[i];
    let z = 0;
    for (let j = 0; j < r.idx.length; j += 1) z += mA.w[r.idx[j]] * r.val[j];
    return z;
  });
  const zb = te.map((i) => {
    const r = builtCS.rows[i];
    let z = 0;
    for (let j = 0; j < r.idx.length; j += 1) z += mB.w[r.idx[j]] * r.val[j];
    return z;
  });
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const ma = mean(za);
  const mb = mean(zb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let j = 0; j < za.length; j += 1) {
    num += (za[j] - ma) * (zb[j] - mb);
    da += (za[j] - ma) ** 2;
    db += (zb[j] - mb) ** 2;
  }
  halfRel.push(num / Math.sqrt(da * db));
}
const rHalf = halfRel.reduce((a, b) => a + b, 0) / halfRel.length;
console.log(`fiabilite demi-echantillon (correlation des scores) r=${rHalf.toFixed(4)} par pli=[${halfRel.map((x) => x.toFixed(3)).join(", ")}]`);

writeFileSync(
  "C:/Users/Admin/Documents/lol-coach/scripts/analysis/out_03_ceiling.json",
  JSON.stringify(
    {
      M4equipes: { accuracy: +(r4.m.acc * 100).toFixed(2), ic95: [+(r4.lo * 100).toFixed(2), +(r4.hi * 100).toFixed(2)], brier: r4.m.brier, logloss: r4.m.logloss, lambdas: r4.lams },
      M5equipesChampions: { accuracy: +(r5.m.acc * 100).toFixed(2), ic95: [+(r5.lo * 100).toFixed(2), +(r5.hi * 100).toFixed(2)], brier: r5.m.brier, logloss: r5.m.logloss, lambdas: r5.lams },
      M2sChampions: { accuracy: +(r2s.m.acc * 100).toFixed(2), ic95: [+(r2s.lo * 100).toFixed(2), +(r2s.hi * 100).toFixed(2)], brier: r2s.m.brier, logloss: r2s.m.logloss },
      M6draftPurgee: { accuracy: +(m6.acc * 100).toFixed(2), ic95: [+(l6 * 100).toFixed(2), +(h6 * 100).toFixed(2)], brier: m6.brier, logloss: m6.logloss },
      courbeApprentissage: learning,
      fiabiliteDemiEchantillon: { moyenne: rHalf, parPli: halfRel },
      predsM4: r4.preds,
      predsM5: r5.preds,
      predsM6: preds6,
    },
    null,
    2
  )
);
console.log("ecrit out_03_ceiling.json");
