/**
 * Synthese : tests apparies sur la log-perte, decomposition de la variance expliquee,
 * et bornes du plafond draft-only.
 */
import { readFileSync, writeFileSync } from "fs";
import { readGames } from "./lib_data.mjs";
import { sigmoid } from "./lib_logreg.mjs";

const A = "C:/Users/Admin/Documents/lol-coach/scripts/analysis/";
const games = readGames();
const ys = games.map((g) => (g.blueWin ? 1 : 0));
const n = games.length;
const prev = ys.reduce((a, b) => a + b, 0) / n;
const b0 = Math.log(prev / (1 - prev));

const P1 = JSON.parse(readFileSync(A + "out_01_preds.json", "utf8"));
const P2 = JSON.parse(readFileSync(A + "out_02_pairs.json", "utf8"));
const P3 = JSON.parse(readFileSync(A + "out_03_ceiling.json", "utf8"));
const P4 = JSON.parse(readFileSync(A + "out_04_plafond.json", "utf8"));

const nll = (p, y) => -(y * Math.log(Math.min(Math.max(p, 1e-12), 1 - 1e-12)) + (1 - y) * Math.log(1 - Math.min(Math.max(p, 1e-12), 1 - 1e-12)));

/** Test t apparie sur la difference de log-perte par partie (A meilleur si delta < 0). */
function pairedLL(pa, pb, label) {
  const d = [];
  for (let i = 0; i < n; i += 1) d.push(nll(pa[i], ys[i]) - nll(pb[i], ys[i]));
  const mu = d.reduce((a, b) => a + b, 0) / n;
  const v = d.reduce((s, x) => s + (x - mu) ** 2, 0) / (n - 1);
  const se = Math.sqrt(v / n);
  const t = mu / se;
  return {
    comparaison: label,
    deltaLoglossMoyen: +mu.toFixed(6),
    ic95: [+(mu - 1.96 * se).toFixed(6), +(mu + 1.96 * se).toFixed(6)],
    t: +t.toFixed(2),
    significatif: Math.abs(t) > 1.96,
  };
}

const prior = new Array(n).fill(prev);
const tests = [
  pairedLL(P1.m2s, prior, "M2s champions vs prior de cote"),
  pairedLL(P2.preds, prior, "M3 champions+paires vs prior de cote"),
  pairedLL(P2.preds, P1.m2s, "M3 vs M2s"),
  pairedLL(P3.predsM4, prior, "M4 equipes vs prior de cote"),
  pairedLL(P3.predsM5, P3.predsM4, "M5 equipes+champions vs M4 equipes seules"),
  pairedLL(P3.predsM6, prior, "M6 draft purgee vs prior de cote"),
];
console.table(tests);

/* --- decomposition de la variance --- */
const varY = prev * (1 - prev);
const get = (name) => P4.table.find((r) => r.modele === name);
const dec = [];
for (const name of ["M1c winrates calibres", "M2s champions", "M3 champions+paires", "M6 draft purgee", "M4 equipes", "M5 equipes+champions"]) {
  const r = get(name);
  dec.push({
    modele: name,
    varPExpliquee: r.varPMin,
    partDeLaVarianceDuResultat: +((r.varPMin / varY) * 100).toFixed(2),
    sdP: r.sdPMin,
    accuracy: r.accuracy,
  });
}
console.log(`\nVariance totale du resultat (Bernoulli p=${prev.toFixed(4)}) = ${varY.toFixed(5)}`);
console.table(dec);

/* --- plafond : accuracy maximale selon sd(p) --- */
function accIdeal(sLogit) {
  let acc = 0;
  let w0 = 0;
  const M = 6001;
  const lo = -8 * sLogit;
  const dz = (16 * sLogit) / (M - 1);
  for (let i = 0; i < M; i += 1) {
    const z = lo + i * dz;
    const w = Math.exp(-(z * z) / (2 * sLogit * sLogit));
    const p = sigmoid(b0 + z);
    acc += w * Math.max(p, 1 - p);
    w0 += w;
  }
  return acc / w0;
}
function sLogitForSdP(target) {
  let lo = 0.001;
  let hi = 6;
  for (let it = 0; it < 80; it += 1) {
    const mid = (lo + hi) / 2;
    // sd(p) pour ce s
    let m1 = 0;
    let m2 = 0;
    let w0 = 0;
    const M = 4001;
    const a = -8 * mid;
    const dz = (16 * mid) / (M - 1);
    for (let i = 0; i < M; i += 1) {
      const z = a + i * dz;
      const w = Math.exp(-(z * z) / (2 * mid * mid));
      const p = sigmoid(b0 + z);
      m1 += w * p;
      m2 += w * p * p;
      w0 += w;
    }
    m1 /= w0;
    m2 /= w0;
    const sd = Math.sqrt(m2 - m1 * m1);
    if (sd < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const sdMesureM3 = get("M3 champions+paires").sdPMin; // 0.0678, borne basse mesuree
const sdDesatt = P4.plafond["M3 champions+paires"].sdPDesattenue; // 0.0728
const scenarios = [
  { nom: "mesure hors-pli (M3, borne basse)", sdP: sdMesureM3 },
  { nom: "desattenue (donnees infinies, classe champions+paires)", sdP: sdDesatt },
  { nom: "genereux : variance x1.5 (interactions d'ordre superieur)", sdP: +(sdDesatt * Math.sqrt(1.5)).toFixed(4) },
  { nom: "tres genereux : variance x2", sdP: +(sdDesatt * Math.sqrt(2)).toFixed(4) },
  { nom: "reference : identite d'equipe (M5, non-draft)", sdP: get("M5 equipes+champions").sdPMin },
];
const plafonds = scenarios.map((s) => ({
  scenario: s.nom,
  sdP: s.sdP,
  varPart: +(((s.sdP * s.sdP) / varY) * 100).toFixed(2),
  accMax: +(accIdeal(sLogitForSdP(s.sdP)) * 100).toFixed(2),
}));
console.log("\nPlafond d'accuracy selon la variance de la vraie probabilite :");
console.table(plafonds);

/* --- tableau final de comparaison --- */
const WF = JSON.parse(readFileSync(A + "out_05_walkforward.json", "utf8"));
const final = [
  { modele: "Moteur heuristique (etabli)", protocole: "12 549 parties", accuracy: 49.19, ecartBaseline: -3.28 },
  { modele: "Baseline bleu toujours", protocole: "12 549 parties", accuracy: 52.47, ecartBaseline: 0 },
  { modele: "M1 somme winrates (signe)", protocole: "CV 5 plis", accuracy: 54.73, ecartBaseline: +2.26 },
  { modele: "M1c somme winrates calibree", protocole: "CV 5 plis", accuracy: 54.98, ecartBaseline: +2.51 },
  { modele: "M2 logistique 162x2", protocole: "CV 5 plis imbriquee", accuracy: 54.03, ecartBaseline: +1.56 },
  { modele: "M2s logistique symetrique", protocole: "CV 5 plis imbriquee", accuracy: 55.06, ecartBaseline: +2.59 },
  { modele: "M3 champions + paires", protocole: "CV 5 plis imbriquee", accuracy: 55.85, ecartBaseline: +3.38 },
  { modele: "M2s walk-forward (fenetre 3000)", protocole: "chrono, n=9 549", accuracy: WF.results[1].accuracy, ecartBaseline: WF.results[1].gainVsBaseline },
  { modele: "M3 walk-forward (fenetre 3000)", protocole: "chrono, n=9 549", accuracy: WF.results[4].accuracy, ecartBaseline: WF.results[4].gainVsBaseline },
  { modele: "M4 identite d'equipe (hors draft)", protocole: "CV 5 plis imbriquee", accuracy: 64.99, ecartBaseline: +12.52 },
  { modele: "PLAFOND draft-only estime", protocole: "desattenuation", accuracy: plafonds[1].accMax, ecartBaseline: +(plafonds[1].accMax - 52.47).toFixed(2) },
];
console.log("\nTableau final :");
console.table(final);

writeFileSync(A + "out_06_synthese.json", JSON.stringify({ tests, varianceTotale: varY, decomposition: dec, plafonds, final }, null, 2));
console.log("ecrit out_06_synthese.json");
