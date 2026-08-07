#!/usr/bin/env node
/**
 * AXE 1 — contrôles de robustesse.
 * a) grille K étendue pour l'Elo (le meilleur K était au bord de la grille)
 * b) validation temporelle : accuracy hors échantillon Elo seul vs Elo + marge
 * c) marge inversée : le signal négatif est-il exploitable ?
 * d) coefficient de la marge par ligue majeure (le signe négatif est-il local ?)
 * e) sensibilité au seuil de parties antérieures
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const rows = JSON.parse(readFileSync(join(here, "games_margins.json"), "utf8")).rows;
const logistic = (x) => 1 / (1 + Math.exp(-x));
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1));
};
function wilson(k, n) {
  if (!n) return null;
  const p = k / n;
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { pct: +(p * 100).toFixed(2), lo: +(((c - s) / d) * 100).toFixed(2), hi: +(((c + s) / d) * 100).toFixed(2), n };
}
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
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
function fitLogit(X, y) {
  const n = X.length;
  const k = X[0].length;
  const b = new Array(k).fill(0);
  for (let it = 0; it < 60; it += 1) {
    const g = new Array(k).fill(0);
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < n; i += 1) {
      let z = 0;
      for (let j = 0; j < k; j += 1) z += b[j] * X[i][j];
      const p = logistic(z);
      const w = Math.max(p * (1 - p), 1e-9);
      for (let j = 0; j < k; j += 1) {
        g[j] += (y[i] - p) * X[i][j];
        for (let l = 0; l < k; l += 1) H[j][l] += w * X[i][j] * X[i][l];
      }
    }
    const step = solve(H, g);
    let md = 0;
    for (let j = 0; j < k; j += 1) {
      b[j] += step[j];
      md = Math.max(md, Math.abs(step[j]));
    }
    if (md < 1e-10) break;
  }
  const H = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < n; i += 1) {
    let z = 0;
    for (let j = 0; j < k; j += 1) z += b[j] * X[i][j];
    const p = logistic(z);
    const w = Math.max(p * (1 - p), 1e-9);
    for (let j = 0; j < k; j += 1) for (let l = 0; l < k; l += 1) H[j][l] += w * X[i][j] * X[i][l];
  }
  const cov = invert(H);
  return { beta: b, se: b.map((_, j) => Math.sqrt(cov[j][j])) };
}

const HFA = 400 * Math.log10(0.5247 / 0.4753);
function runElo(K) {
  const elo = new Map();
  const cnt = new Map();
  const out = [];
  for (const r of rows) {
    const eb = elo.get(r.blueTeam) ?? 1500;
    const er = elo.get(r.redTeam) ?? 1500;
    const p = 1 / (1 + 10 ** (-(eb - er + HFA) / 400));
    out.push({ ...r, eloDiff: eb - er, pElo: p, prior: Math.min(cnt.get(r.blueTeam) ?? 0, cnt.get(r.redTeam) ?? 0) });
    elo.set(r.blueTeam, eb + K * (r.blueWin - p));
    elo.set(r.redTeam, er - K * (r.blueWin - p));
    cnt.set(r.blueTeam, (cnt.get(r.blueTeam) ?? 0) + 1);
    cnt.set(r.redTeam, (cnt.get(r.redTeam) ?? 0) + 1);
  }
  return out;
}

// a) grille K étendue
const kScan = [];
for (const K of [24, 32, 40, 48, 56, 64, 80, 100, 130]) {
  const out = runElo(K).filter((r) => r.prior >= 10);
  const ll = mean(out.map((r) => -(r.blueWin * Math.log(r.pElo) + (1 - r.blueWin) * Math.log(1 - r.pElo))));
  const acc = wilson(out.filter((r) => (r.eloDiff > 0) === !!r.blueWin).length, out.length);
  kScan.push({ K, logLoss: +ll.toFixed(5), accuracy: acc.pct, n: out.length });
}
const bestK = kScan.reduce((a, b) => (b.logLoss < a.logLoss ? b : a)).K;
const all = runElo(bestK);
const mature = all.filter((r) => r.prior >= 10);

// b) validation temporelle : 70 % premiers = apprentissage, 30 % derniers = test
const split = Math.floor(mature.length * 0.7);
const tr = mature.slice(0, split);
const te = mature.slice(split);
const mE = mean(tr.map((r) => r.eloDiff));
const sE = sd(tr.map((r) => r.eloDiff));
const mM = mean(tr.map((r) => r.margin));
const sM = sd(tr.map((r) => r.margin));
const fE = fitLogit(tr.map((r) => [1, (r.eloDiff - mE) / sE]), tr.map((r) => r.blueWin));
const fF = fitLogit(
  tr.map((r) => [1, (r.eloDiff - mE) / sE, (r.margin - mM) / sM]),
  tr.map((r) => r.blueWin)
);
function evalOn(list, fit, withMargin) {
  let c = 0;
  let ll = 0;
  let br = 0;
  for (const r of list) {
    const x = [1, (r.eloDiff - mE) / sE, (r.margin - mM) / sM];
    let z = fit.beta[0] + fit.beta[1] * x[1];
    if (withMargin) z += fit.beta[2] * x[2];
    const p = logistic(z);
    if (p > 0.5 === !!r.blueWin) c += 1;
    ll += -(r.blueWin * Math.log(p) + (1 - r.blueWin) * Math.log(1 - p));
    br += (p - r.blueWin) ** 2;
  }
  return { accuracy: wilson(c, list.length), logLoss: +(ll / list.length).toFixed(5), brier: +(br / list.length).toFixed(5) };
}
const temporal = {
  nApprentissage: tr.length,
  nTest: te.length,
  eloSeul: evalOn(te, fE, false),
  eloPlusMarge: evalOn(te, fF, true),
  baselineBleuTest: wilson(te.filter((r) => r.blueWin).length, te.length),
  margeSeuleTest: wilson(te.filter((r) => r.margin !== 0 && r.margin > 0 === !!r.blueWin).length, te.filter((r) => r.margin !== 0).length),
  margeInverseeTest: wilson(te.filter((r) => r.margin !== 0 && r.margin < 0 === !!r.blueWin).length, te.filter((r) => r.margin !== 0).length),
};

// c) marge inversée sur tout le corpus mature
const dec = mature.filter((r) => r.margin !== 0);
const margeInversee = wilson(dec.filter((r) => (r.margin < 0) === !!r.blueWin).length, dec.length);

// d) coefficient de la marge par ligue (contrôlé sur Elo)
const byLeague = new Map();
for (const r of mature) {
  if (!byLeague.has(r.league)) byLeague.set(r.league, []);
  byLeague.get(r.league).push(r);
}
const leagues = [...byLeague.entries()]
  .filter(([, v]) => v.length >= 300)
  .map(([name, v]) => {
    const me = mean(v.map((r) => r.eloDiff));
    const se = sd(v.map((r) => r.eloDiff));
    const mm = mean(v.map((r) => r.margin));
    const sm = sd(v.map((r) => r.margin));
    const f = fitLogit(
      v.map((r) => [1, (r.eloDiff - me) / se, (r.margin - mm) / sm]),
      v.map((r) => r.blueWin)
    );
    return {
      ligue: name,
      n: v.length,
      betaMarge: +f.beta[2].toFixed(4),
      se: +f.se[2].toFixed(4),
      z: +(f.beta[2] / f.se[2]).toFixed(2),
      betaElo: +f.beta[1].toFixed(3),
      accElo: wilson(v.filter((r) => (r.eloDiff > 0) === !!r.blueWin).length, v.length).pct,
      accMarge: wilson(v.filter((r) => r.margin !== 0 && r.margin > 0 === !!r.blueWin).length, v.filter((r) => r.margin !== 0).length).pct,
    };
  })
  .sort((a, b) => b.n - a.n);
const nNeg = leagues.filter((l) => l.betaMarge < 0).length;

// e) sensibilité au seuil de parties antérieures
const seuils = [0, 5, 10, 20, 40].map((s) => {
  const v = all.filter((r) => r.prior >= s);
  const me = mean(v.map((r) => r.eloDiff));
  const se = sd(v.map((r) => r.eloDiff));
  const mm = mean(v.map((r) => r.margin));
  const sm = sd(v.map((r) => r.margin));
  const f = fitLogit(
    v.map((r) => [1, (r.eloDiff - me) / se, (r.margin - mm) / sm]),
    v.map((r) => r.blueWin)
  );
  return {
    seuil: s,
    n: v.length,
    accElo: wilson(v.filter((r) => r.eloDiff !== 0 && r.eloDiff > 0 === !!r.blueWin).length, v.filter((r) => r.eloDiff !== 0).length),
    betaMarge: +f.beta[2].toFixed(4),
    seMarge: +f.se[2].toFixed(4),
    p: +(2 * (1 - normCdf(Math.abs(f.beta[2] / f.se[2])))).toExponential(2),
  };
});

const report = { a_grilleK: kScan, Kretenu: bestK, b_validationTemporelle: temporal, c_margeInverseeGlobale: margeInversee, d_parLigue: { ligues: leagues, nLiguesBetaNegatif: nNeg, total: leagues.length }, e_sensibiliteSeuil: seuils };
writeFileSync(join(here, "axe1_robustesse.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
