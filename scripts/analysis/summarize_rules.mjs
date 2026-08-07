#!/usr/bin/env node
/** Résumé lisible du rapport validate_rules.mjs : tri par edge, z-score binomial, filtres n. */
import { readFileSync } from "fs";

const file = process.argv[2];
const MIN_N = Number(process.argv[3] || 50);
const j = JSON.parse(readFileSync(file, "utf8"));

function z(r) {
  if (!r.n || r.expectedPct == null) return null;
  const p0 = r.expectedPct / 100;
  const se = Math.sqrt((p0 * (1 - p0)) / r.n);
  if (!se) return null;
  return +((r.favoredWinPct / 100 - p0) / se).toFixed(2);
}

function table(rows, title, keyLabel = "label") {
  const filt = rows.filter((r) => r.n >= MIN_N).map((r) => ({ ...r, z: z(r) }));
  filt.sort((a, b) => b.edgePct - a.edgePct);
  console.log(`\n=== ${title} — ${filt.length} règles avec n>=${MIN_N} (sur ${rows.length}) ===`);
  console.log("edge%\tobs%\tatt%\tn\tz\tIC95\t\trègle");
  for (const r of filt) {
    console.log(
      `${r.edgePct >= 0 ? "+" : ""}${r.edgePct}\t${r.favoredWinPct}\t${r.expectedPct}\t${r.n}\t${r.z}\t[${r.ci95[0]};${r.ci95[1]}]\t${String(r[keyLabel] ?? r.label).slice(0, 90)}`
    );
  }
  const dead = rows.filter((r) => r.n < MIN_N);
  console.log(`(${dead.length} règles sous le seuil : ${dead.filter((r) => r.n === 0).length} jamais déclenchées)`);
}

console.log(`Dataset ${j.dataset} · ${j.games} parties · baseline bleu ${j.blueBaselinePct} %`);
table(j.compClashRules, "COMP_CLASH_RULES");
if (Array.isArray(j.teamTraitRules)) table(j.teamTraitRules, "TEAM_TRAIT_RULES");
table(j.champPairRulesSameLane, "CHAMP_PAIR_RULES (même lane)", "rule");
table(j.champPairRulesAllPairs, "CHAMP_PAIR_RULES (toutes paires)", "rule");
table(j.curatedCountersAllPositions, "CURATED_COUNTERS (toutes positions)");
table(j.curatedCountersSameLane, "CURATED_COUNTERS (même lane)");

console.log("\n=== PLANS (solo) ===");
for (const p of j.planSolo) console.log(`${p.plan}\tn=${p.n}\twin=${p.winPct}%\tIC[${p.ci95[0]};${p.ci95[1]}]`);

console.log("\n=== MATRICE PLAN × PLAN (n>=100) ===");
console.log("A\tB\tn\twinA%\tatt%\tedge\tIC95\t\tencodé\tdirection OK ?");
for (const m of j.planMatrix.filter((m) => m.n >= 100)) {
  console.log(
    `${m.A}\t${m.B}\t${m.n}\t${m.winPctA}\t${m.expectedPctA}\t${m.edgePctA}\t[${m.ci95A[0]};${m.ci95A[1]}]\t${m.encodedInCode || "-"}\t${m.encodedDirectionMatchesData}`
  );
}

console.log("\n=== LANES ===");
console.log(JSON.stringify(j.laneMatchups, null, 1));
