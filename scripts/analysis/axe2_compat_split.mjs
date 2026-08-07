#!/usr/bin/env node
/**
 * AXE 2 — test de dose-réponse : si le décalage de méta est la cause de l'échec,
 * l'accuracy doit être MEILLEURE sur les drafts "compatibles 2026" (composés de champions
 * encore prioritaires aujourd'hui) et PIRE sur les drafts purement 2022.
 * Aucune ré-évaluation du moteur : on réutilise les marges de base (base_margins.json).
 * Usage : node scripts/analysis/axe2_compat_split.mjs [--json out.json]
 */
import { readFileSync, writeFileSync } from "fs";
import { loadChampionData, wilson, pearson, rCI, TIER_PTS } from "./lib.mjs";

function arg(f, d = null) {
  const i = process.argv.indexOf(f);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
}

const rows = JSON.parse(readFileSync(new URL("./base_margins.json", import.meta.url), "utf8"));
const { champs } = loadChampionData();
const byName = new Map(champs.map((c) => [c.name, c]));

// compat 2026 d'une partie = points de tier moyens des 10 champions (0..40)
for (const g of rows) {
  const all = [...g.b, ...g.r];
  g.compat = all.reduce((s, n) => s + (TIER_PTS[byName.get(n)?.tierMeta || "C"] ?? 10), 0) / all.length;
}

function acc(sub, label) {
  let correct = 0;
  let ties = 0;
  let blue = 0;
  for (const g of sub) {
    if (g.w) blue += 1;
    if (g.m === 0) ties += 1;
    else if (g.m > 0 === g.w) correct += 1;
  }
  const dec = sub.length - ties;
  return {
    label,
    parties: sub.length,
    accuracyPct: +((correct / dec) * 100).toFixed(2),
    ic95: wilson(correct, dec),
    baselineBleuPct: +((blue / sub.length) * 100).toFixed(2),
    ecartVsBaselinePts: +(((correct / dec) * 100 - (blue / sub.length) * 100).toFixed(2)),
    compatMoyenne: +(sub.reduce((s, g) => s + g.compat, 0) / sub.length).toFixed(2),
  };
}

const sorted = [...rows].sort((a, b) => a.compat - b.compat);
const q = 5;
const quint = [];
for (let i = 0; i < q; i += 1) {
  quint.push(acc(sorted.slice(Math.floor((i * sorted.length) / q), Math.floor(((i + 1) * sorted.length) / q)), `quintile ${i + 1}/5 de compatibilité 2026`));
}

// corrélation directe compat <-> justesse de la prédiction
const dec = rows.filter((g) => g.m !== 0);
const okv = dec.map((g) => (g.m > 0 === g.w ? 1 : 0));
const cv = dec.map((g) => g.compat);
const r = pearson(cv, okv);

const out = {
  parties: rows.length,
  definition:
    "compatibilité 2026 = moyenne des points de tierMeta 2026 (S=40 A=30 B=20 C=10 D=3) des 10 champions de la partie",
  quintiles: quint,
  correlationCompatVsPredictionJuste: { pearson: +(r ?? 0).toFixed(4), ic95: rCI(r, dec.length), n: dec.length },
  ecartExtreme: +(quint[4].accuracyPct - quint[0].accuracyPct).toFixed(2),
};

const o = arg("--json");
if (o) writeFileSync(o, JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));
