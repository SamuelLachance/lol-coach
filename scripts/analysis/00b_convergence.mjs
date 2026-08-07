/** Verifie que l'optimiseur a converge (perte d'entrainement vs epochs) et chronometre. */
import { readGames, foldOf } from "./lib_data.mjs";
import { fitLogreg, predict, metrics } from "./lib_logreg.mjs";
import { buildChampIndex, rowsChampSym } from "./lib_features.mjs";

const games = readGames();
const ci = buildChampIndex(games);
const built = rowsChampSym(games, ci);
const ys = games.map((g) => (g.blueWin ? 1 : 0));
const tr = [];
const te = [];
games.forEach((g, i) => (foldOf(g.id, 5) === 0 ? te : tr).push(i));
const rowsTr = tr.map((i) => built.rows[i]);

for (const lam of [0.001, 0.01]) {
  for (const ep of [100, 300, 500, 1000, 2000]) {
    const t0 = Date.now();
    const mdl = fitLogreg(rowsTr, built.nFeatures, { lambda: lam, epochs: ep, lr: 0.05 });
    const trM = metrics(rowsTr.map((r) => predict(mdl, r)), tr.map((i) => ys[i]));
    const teM = metrics(te.map((i) => predict(mdl, built.rows[i])), te.map((i) => ys[i]));
    console.log(
      `lambda=${lam} epochs=${ep} ${Date.now() - t0}ms | train ll=${trM.logloss.toFixed(5)} acc=${(trM.acc * 100).toFixed(2)} | test ll=${teM.logloss.toFixed(5)} acc=${(teM.acc * 100).toFixed(2)}`
    );
  }
}
