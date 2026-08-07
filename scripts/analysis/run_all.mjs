#!/usr/bin/env node
/**
 * AXE 4 - Plafond atteignable en draft-only. Reproduit toute la mesure.
 *
 *   node scripts/analysis/run_all.mjs
 *
 * Duree ~15 min. Ecrit out_01..out_06 dans scripts/analysis/.
 * Aucune dependance externe, aucun fichier de public/ n'est modifie.
 */
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const steps = [
  ["00_sanity.mjs", "volume, prevalence, couverture champions"],
  ["00b_convergence.mjs", "convergence de l'optimiseur"],
  ["01_baselines.mjs", "M0/M1/M2/M2s - CV 5 plis imbriquee"],
  ["02_pairs.mjs", "M3 champions + paires empiriques"],
  ["03_ceiling.mjs", "M4/M5/M6, courbe d'apprentissage, fiabilite demi-echantillon"],
  ["04_plafond.mjs", "calibration, desattenuation, walk-forward 70/30, McNemar"],
  ["05_walkforward.mjs", "walk-forward chronologique par blocs de 500"],
  ["06_synthese.mjs", "tests apparies, variance expliquee, plafonds"],
];

for (const [file, desc] of steps) {
  console.log(`\n=== ${file} : ${desc} ===`);
  const r = spawnSync(process.execPath, [join(here, file)], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`echec sur ${file}`);
    process.exit(r.status || 1);
  }
}
console.log("\nTermine. Resultats : scripts/analysis/out_0*.json");
