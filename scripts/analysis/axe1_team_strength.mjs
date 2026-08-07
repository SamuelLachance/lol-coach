#!/usr/bin/env node
/**
 * AXE 1 — Confondant « force d'équipe ».
 *
 * 1) Indicateur de force d'équipe sans fuite : Elo séquentiel (n'utilise que
 *    les parties strictement antérieures). Plus, en comparaison, un winrate
 *    out-of-fold (5 folds sur les gameid) comme second indicateur.
 * 2) Accuracy du modèle « force seule » = la vraie baseline à battre.
 * 3) Régression logistique à 2 variables (Δforce, marge de draft normalisée),
 *    coefficients + erreurs-types (inverse de la hessienne).
 * 4) Stratification par quintile de |Δforce|.
 * 5) Corrélation entre force d'équipe et marge de draft attribuée.
 *
 * Usage : node scripts/analysis/axe1_team_strength.mjs [--in fichier] [--json sortie]
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
function arg(flag, fb = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fb;
}

const data = JSON.parse(readFileSync(arg("--in", join(here, "games_margins.json")), "utf8"));
const rows = data.rows; // déjà triées par date

// ---------------------------------------------------------------- outils stats
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
function pearson(x, y) {
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = x[i] - mx;
    const b = y[i] - my;
    sxy += a * b;
    sxx += a * a;
    syy += b * b;
  }
  const r = sxy / Math.sqrt(sxx * syy);
  // IC 95 % par transformation de Fisher
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const se = 1 / Math.sqrt(n - 3);
  const lo = Math.tanh(z - 1.96 * se);
  const hi = Math.tanh(z + 1.96 * se);
  return { r: +r.toFixed(4), ci95: [+lo.toFixed(4), +hi.toFixed(4)], n };
}
/** IC 95 % de Wilson pour une proportion. */
function wilson(k, n) {
  if (!n) return null;
  const p = k / n;
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { pct: +(p * 100).toFixed(2), lo: +(((c - s) / d) * 100).toFixed(2), hi: +(((c + s) / d) * 100).toFixed(2), n };
}
const logistic = (x) => 1 / (1 + Math.exp(-x));

// ------------------------------------------------- 1) Elo séquentiel sans fuite
function runElo(K, hfa) {
  const elo = new Map();
  const games = new Map(); // nb de parties déjà jouées par équipe
  const out = [];
  for (const r of rows) {
    const eb = elo.get(r.blueTeam) ?? 1500;
    const er = elo.get(r.redTeam) ?? 1500;
    const nb = games.get(r.blueTeam) ?? 0;
    const nr = games.get(r.redTeam) ?? 0;
    const diff = eb - er + hfa;
    const p = 1 / (1 + 10 ** (-diff / 400));
    out.push({ ...r, eloBlue: eb, eloRed: er, eloDiff: eb - er, pElo: p, priorBlue: nb, priorRed: nr });
    const y = r.blueWin;
    elo.set(r.blueTeam, eb + K * (y - p));
    elo.set(r.redTeam, er - K * (y - p));
    games.set(r.blueTeam, nb + 1);
    games.set(r.redTeam, nr + 1);
  }
  return { out, finalElo: elo, gameCounts: games };
}

function logLossOf(list, key, minPrior) {
  let s = 0;
  let n = 0;
  for (const r of list) {
    if (Math.min(r.priorBlue, r.priorRed) < minPrior) continue;
    const p = Math.min(0.999, Math.max(0.001, r[key]));
    s += -(r.blueWin * Math.log(p) + (1 - r.blueWin) * Math.log(1 - p));
    n += 1;
  }
  return { logLoss: s / n, n };
}

// Choix de K par log-loss séquentielle (naturellement hors échantillon).
const HFA = 400 * Math.log10(0.5247 / 0.4753); // avantage côté bleu observé
const kGrid = [8, 12, 16, 20, 24, 28, 32, 40];
const kScan = kGrid.map((K) => {
  const { out } = runElo(K, HFA);
  const ll = logLossOf(out, "pElo", 10);
  return { K, logLoss: +ll.logLoss.toFixed(5), n: ll.n };
});
const bestK = kScan.reduce((a, b) => (b.logLoss < a.logLoss ? b : a)).K;
const { out: elo, finalElo, gameCounts } = runElo(bestK, HFA);

// ------------------------------------- winrate out-of-fold (5 folds sur gameid)
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const FOLDS = 5;
const foldOf = new Map(rows.map((r) => [r.id, hashStr(r.id) % FOLDS]));
// wins/games par équipe et par fold
const perFold = new Map(); // team -> [{w,g} x FOLDS]
function bump(team, fold, win) {
  if (!perFold.has(team)) perFold.set(team, Array.from({ length: FOLDS }, () => ({ w: 0, g: 0 })));
  const s = perFold.get(team)[fold];
  s.g += 1;
  s.w += win;
}
for (const r of rows) {
  const f = foldOf.get(r.id);
  bump(r.blueTeam, f, r.blueWin);
  bump(r.redTeam, f, 1 - r.blueWin);
}
function oofWinrate(team, fold) {
  const arr = perFold.get(team);
  if (!arr) return null;
  let w = 0;
  let g = 0;
  for (let i = 0; i < FOLDS; i += 1) {
    if (i === fold) continue;
    w += arr[i].w;
    g += arr[i].g;
  }
  if (g < 10) return null;
  // lissage bayésien vers 0.5 (pseudo-comptes = 10 parties)
  return (w + 5) / (g + 10);
}
for (const r of elo) {
  const f = foldOf.get(r.id);
  r.oofBlue = oofWinrate(r.blueTeam, f);
  r.oofRed = oofWinrate(r.redTeam, f);
  r.oofDiff = r.oofBlue != null && r.oofRed != null ? r.oofBlue - r.oofRed : null;
}

// -------------------------------------------- 2) accuracy « force d'équipe seule »
function accuracyBySign(list, key, invert = false) {
  let c = 0;
  let t = 0;
  let n = 0;
  for (const r of list) {
    const v = r[key];
    if (v == null) continue;
    n += 1;
    if (v === 0) {
      t += 1;
      continue;
    }
    const predBlue = invert ? v < 0 : v > 0;
    if (predBlue === !!r.blueWin) c += 1;
  }
  return { ...wilson(c, n - t), ties: t, total: n };
}

const MIN_PRIOR = 10;
const mature = elo.filter((r) => Math.min(r.priorBlue, r.priorRed) >= MIN_PRIOR);
const matureOof = mature.filter((r) => r.oofDiff != null);

const baselineBlue = wilson(elo.filter((r) => r.blueWin).length, elo.length);
const baselineBlueMature = wilson(mature.filter((r) => r.blueWin).length, mature.length);

const accEloAll = accuracyBySign(elo, "eloDiff");
const accEloMature = accuracyBySign(mature, "eloDiff");
const accOof = accuracyBySign(matureOof, "oofDiff");
const accDraftAll = accuracyBySign(elo, "margin");
const accDraftMature = accuracyBySign(mature, "margin");

// Brier / log-loss du modèle force seule
const llElo = logLossOf(elo, "pElo", MIN_PRIOR);
const brierElo =
  mature.reduce((s, r) => s + (r.pElo - r.blueWin) ** 2, 0) / mature.length;
const brierBase =
  mature.reduce((s, r) => s + (0.5247 - r.blueWin) ** 2, 0) / mature.length;
const llBase = -mean(mature.map((r) => (r.blueWin ? Math.log(0.5247) : Math.log(0.4753))));

// ------------------------------------- 3) régression logistique (Newton-Raphson)
function fitLogit(X, y) {
  const n = X.length;
  const k = X[0].length;
  let b = new Array(k).fill(0);
  for (let it = 0; it < 60; it += 1) {
    const g = new Array(k).fill(0);
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < n; i += 1) {
      let z = 0;
      for (let j = 0; j < k; j += 1) z += b[j] * X[i][j];
      const p = logistic(z);
      const w = Math.max(p * (1 - p), 1e-9);
      const e = y[i] - p;
      for (let j = 0; j < k; j += 1) {
        g[j] += e * X[i][j];
        for (let l = 0; l < k; l += 1) H[j][l] += w * X[i][j] * X[i][l];
      }
    }
    const step = solve(H, g);
    let maxd = 0;
    for (let j = 0; j < k; j += 1) {
      b[j] += step[j];
      maxd = Math.max(maxd, Math.abs(step[j]));
    }
    if (maxd < 1e-10) break;
  }
  // covariance = inv(H)
  const H = Array.from({ length: k }, () => new Array(k).fill(0));
  let ll = 0;
  for (let i = 0; i < n; i += 1) {
    let z = 0;
    for (let j = 0; j < k; j += 1) z += b[j] * X[i][j];
    const p = logistic(z);
    ll += y[i] ? Math.log(Math.max(p, 1e-12)) : Math.log(Math.max(1 - p, 1e-12));
    const w = Math.max(p * (1 - p), 1e-9);
    for (let j = 0; j < k; j += 1) for (let l = 0; l < k; l += 1) H[j][l] += w * X[i][j] * X[i][l];
  }
  const cov = invert(H);
  const se = b.map((_, j) => Math.sqrt(cov[j][j]));
  return { beta: b, se, logLik: ll, n };
}
function solve(A, b) {
  const k = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < k; c += 1) {
    let piv = c;
    for (let r = c + 1; r < k; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    for (let j = c; j <= k; j += 1) M[c][j] /= d;
    for (let r = 0; r < k; r += 1) {
      if (r === c) continue;
      const f = M[r][c];
      if (!f) continue;
      for (let j = c; j <= k; j += 1) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r) => r[k]);
}
function invert(A) {
  const k = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c += 1) {
    let piv = c;
    for (let r = c + 1; r < k; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * k; j += 1) M[c][j] /= d;
    for (let r = 0; r < k; r += 1) {
      if (r === c) continue;
      const f = M[r][c];
      if (!f) continue;
      for (let j = 0; j < 2 * k; j += 1) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r) => r.slice(k));
}

// standardisation
const marginsM = mature.map((r) => r.margin);
const eloDiffsM = mature.map((r) => r.eloDiff);
const mMar = mean(marginsM);
const sMar = sd(marginsM);
const mElo = mean(eloDiffsM);
const sElo = sd(eloDiffsM);
const y = mature.map((r) => r.blueWin);

const Xfull = mature.map((r) => [1, (r.eloDiff - mElo) / sElo, (r.margin - mMar) / sMar]);
const Xelo = mature.map((r) => [1, (r.eloDiff - mElo) / sElo]);
const Xmar = mature.map((r) => [1, (r.margin - mMar) / sMar]);
const fitFull = fitLogit(Xfull, y);
const fitEloOnly = fitLogit(Xelo, y);
const fitMarOnly = fitLogit(Xmar, y);
const fitNull = fitLogit(mature.map(() => [1]), y);

function coefRow(fit, names) {
  return names.map((nm, j) => {
    const b = fit.beta[j];
    const s = fit.se[j];
    const z = b / s;
    // p bilatéral, approximation d'Abramowitz-Stegun de la loi normale
    const p = 2 * (1 - normCdf(Math.abs(z)));
    return {
      var: nm,
      beta: +b.toFixed(5),
      se: +s.toFixed(5),
      z: +z.toFixed(3),
      p: +p.toExponential(2),
      ci95: [+(b - 1.96 * s).toFixed(5), +(b + 1.96 * s).toFixed(5)],
      oddsRatioParSD: +Math.exp(b).toFixed(4),
    };
  });
}
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
const lrStat = 2 * (fitFull.logLik - fitEloOnly.logLik);
const lrP = 1 - chi2Cdf1(lrStat);
function chi2Cdf1(x) {
  return x <= 0 ? 0 : 2 * normCdf(Math.sqrt(x)) - 1;
}

// ----------------------------------------------- 4) stratification par |Δforce|
const absSorted = [...mature].sort((a, b) => Math.abs(a.eloDiff) - Math.abs(b.eloDiff));
const q = Math.floor(absSorted.length / 5);
const quintiles = [];
for (let i = 0; i < 5; i += 1) {
  const slice = absSorted.slice(i * q, i === 4 ? absSorted.length : (i + 1) * q);
  const absVals = slice.map((r) => Math.abs(r.eloDiff));
  quintiles.push({
    quintile: i + 1,
    deltaEloAbs: { min: +Math.min(...absVals).toFixed(1), max: +Math.max(...absVals).toFixed(1), moyenne: +mean(absVals).toFixed(1) },
    n: slice.length,
    accuracyMargeDraft: accuracyBySign(slice, "margin"),
    accuracyElo: accuracyBySign(slice, "eloDiff"),
    accuracyBleuToujours: wilson(slice.filter((r) => r.blueWin).length, slice.length),
    corrMargeResultat: pearson(slice.map((r) => r.margin), slice.map((r) => r.blueWin)),
  });
}

// Régression logistique restreinte au quintile 1 (équipes de force comparable)
const q1 = absSorted.slice(0, q);
const q1m = q1.map((r) => r.margin);
const fitQ1 = fitLogit(
  q1.map((r) => [1, (r.margin - mean(q1m)) / sd(q1m)]),
  q1.map((r) => r.blueWin)
);

// ------------------------------------- 5) force d'équipe vs marge de draft reçue
// (a) au niveau partie : Δelo vs marge
const corrEloMargin = pearson(mature.map((r) => r.eloDiff), marginsM);
const corrOofMargin = pearson(matureOof.map((r) => r.oofDiff), matureOof.map((r) => r.margin));
const corrMarginResult = pearson(marginsM, y);
const corrEloResult = pearson(eloDiffsM, y);

// (b) au niveau équipe : winrate saison vs marge moyenne reçue (signe orienté équipe)
const teamAgg = new Map();
for (const r of elo) {
  for (const [team, sign, win] of [
    [r.blueTeam, 1, r.blueWin],
    [r.redTeam, -1, 1 - r.blueWin],
  ]) {
    if (!teamAgg.has(team)) teamAgg.set(team, { g: 0, w: 0, marginSum: 0 });
    const t = teamAgg.get(team);
    t.g += 1;
    t.w += win;
    t.marginSum += sign * r.margin;
  }
}
const teams = [...teamAgg.entries()]
  .filter(([, t]) => t.g >= 20)
  .map(([name, t]) => ({
    name,
    games: t.g,
    winrate: t.w / t.g,
    margeMoyenneRecue: t.marginSum / t.g,
    eloFinal: finalElo.get(name) ?? 1500,
  }));
const corrTeamWrMargin = pearson(teams.map((t) => t.winrate), teams.map((t) => t.margeMoyenneRecue));
const corrTeamEloMargin = pearson(teams.map((t) => t.eloFinal), teams.map((t) => t.margeMoyenneRecue));

// top / bottom équipes par winrate, marge moyenne reçue
const byWr = [...teams].sort((a, b) => b.winrate - a.winrate);
const fmtTeam = (t) => ({
  equipe: t.name,
  parties: t.games,
  winrate: +(t.winrate * 100).toFixed(1),
  margeMoyenne: +t.margeMoyenneRecue.toFixed(1),
});
const strong = byWr.slice(0, Math.round(byWr.length * 0.2));
const weak = byWr.slice(-Math.round(byWr.length * 0.2));
const strongVsWeak = {
  seuil: "quintile supérieur vs inférieur de winrate, équipes >= 20 parties",
  nEquipesFortes: strong.length,
  margeMoyenneFortes: +mean(strong.map((t) => t.margeMoyenneRecue)).toFixed(2),
  nEquipesFaibles: weak.length,
  margeMoyenneFaibles: +mean(weak.map((t) => t.margeMoyenneRecue)).toFixed(2),
};
// test t de Welch entre les deux groupes
{
  const a = strong.map((t) => t.margeMoyenneRecue);
  const b = weak.map((t) => t.margeMoyenneRecue);
  const va = sd(a) ** 2 / a.length;
  const vb = sd(b) ** 2 / b.length;
  const t = (mean(a) - mean(b)) / Math.sqrt(va + vb);
  strongVsWeak.tWelch = +t.toFixed(3);
  strongVsWeak.p = +(2 * (1 - normCdf(Math.abs(t)))).toExponential(2);
}

// ---- Accuracy de la marge de draft à Elo contrôlé : sous-échantillon apparié
// Sur les parties où Elo et marge sont en DÉSACCORD, qui a raison ?
const disagree = mature.filter((r) => r.margin !== 0 && Math.sign(r.eloDiff) !== Math.sign(r.margin));
const agree = mature.filter((r) => r.margin !== 0 && Math.sign(r.eloDiff) === Math.sign(r.margin));
const arbitrage = {
  desaccord: {
    n: disagree.length,
    eloARaison: wilson(disagree.filter((r) => (r.eloDiff > 0) === !!r.blueWin).length, disagree.length),
    margeARaison: wilson(disagree.filter((r) => (r.margin > 0) === !!r.blueWin).length, disagree.length),
  },
  accord: {
    n: agree.length,
    accuracy: wilson(agree.filter((r) => (r.eloDiff > 0) === !!r.blueWin).length, agree.length),
  },
};

const report = {
  jeuDeDonnees: { partiesTotales: rows.length, partiesMatures: mature.length, seuilPartiesAnterieures: MIN_PRIOR },
  elo: {
    hfaBleu: +HFA.toFixed(2),
    balayageK: kScan,
    Kretenu: bestK,
    logLossElo: +llElo.logLoss.toFixed(5),
    logLossBaselineBleu: +llBase.toFixed(5),
    brierElo: +brierElo.toFixed(5),
    brierBaselineBleu: +brierBase.toFixed(5),
    equipesSuivies: finalElo.size,
    eloEcartType: +sElo.toFixed(1),
  },
  q2_accuracy: {
    baselineBleuToujours_toutes: baselineBlue,
    baselineBleuToujours_matures: baselineBlueMature,
    forceElo_toutes: accEloAll,
    forceElo_matures: accEloMature,
    winrateOutOfFold_matures: accOof,
    margeDraft_toutes: accDraftAll,
    margeDraft_matures: accDraftMature,
  },
  q3_regressionLogistique: {
    note: "variables standardisées (par écart-type) ; y = victoire du bleu",
    modeleComplet: {
      coefficients: coefRow(fitFull, ["intercept", "deltaElo_sd", "margeDraft_sd"]),
      logLik: +fitFull.logLik.toFixed(2),
      n: fitFull.n,
      pseudoR2McFadden: +(1 - fitFull.logLik / fitNull.logLik).toFixed(5),
    },
    modeleEloSeul: {
      coefficients: coefRow(fitEloOnly, ["intercept", "deltaElo_sd"]),
      logLik: +fitEloOnly.logLik.toFixed(2),
      pseudoR2McFadden: +(1 - fitEloOnly.logLik / fitNull.logLik).toFixed(5),
    },
    modeleMargeSeule: {
      coefficients: coefRow(fitMarOnly, ["intercept", "margeDraft_sd"]),
      logLik: +fitMarOnly.logLik.toFixed(2),
      pseudoR2McFadden: +(1 - fitMarOnly.logLik / fitNull.logLik).toFixed(5),
    },
    testRapportVraisemblance_ajoutMarge: { chi2_1ddl: +lrStat.toFixed(3), p: +lrP.toExponential(2) },
    ecartTypeMarge: +sMar.toFixed(1),
  },
  q4_stratification: {
    quintiles,
    regressionMargeSeule_quintile1: {
      coefficients: coefRow(fitQ1, ["intercept", "margeDraft_sd"]),
      n: fitQ1.n,
    },
    arbitrageEloVsMarge: arbitrage,
  },
  q5_forceVsMarge: {
    correlations: {
      deltaElo_vs_margeDraft: corrEloMargin,
      deltaWinrateOOF_vs_margeDraft: corrOofMargin,
      margeDraft_vs_victoireBleu: corrMarginResult,
      deltaElo_vs_victoireBleu: corrEloResult,
    },
    niveauEquipe: {
      nEquipes: teams.length,
      winrate_vs_margeMoyenneRecue: corrTeamWrMargin,
      eloFinal_vs_margeMoyenneRecue: corrTeamEloMargin,
      fortesVsFaibles: strongVsWeak,
      top10Winrate: byWr.slice(0, 10).map(fmtTeam),
      bottom10Winrate: byWr.slice(-10).map(fmtTeam),
    },
  },
};

const outPath = arg("--json", join(here, "axe1_report.json"));
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
