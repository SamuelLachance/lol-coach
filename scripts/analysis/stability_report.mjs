#!/usr/bin/env node
/**
 * Croise le rapport global avec les deux moitiés temporelles :
 * z-score binomial, q-value Benjamini-Hochberg, et stabilité du signe H1/H2.
 * Usage : node scripts/analysis/stability_report.mjs full.json h1.json h2.json [minN]
 */
import { readFileSync } from "fs";

const [full, h1, h2] = process.argv.slice(2, 5).map((f) => JSON.parse(readFileSync(f, "utf8")));
const MIN_N = Number(process.argv[5] || 40);

function zOf(r) {
  if (!r || !r.n || r.expectedPct == null) return null;
  const p0 = r.expectedPct / 100;
  const se = Math.sqrt((p0 * (1 - p0)) / r.n);
  return se ? (r.favoredWinPct / 100 - p0) / se : null;
}
function pOf(z) {
  if (z == null) return null;
  // approximation d'Abramowitz-Stegun de la loi normale
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return +(1 - y).toFixed(5) * 1; // p bilatéral = 1 - erf(|z|/sqrt2)
}

function bh(rows) {
  const withP = rows.filter((r) => r.p != null).sort((a, b) => a.p - b.p);
  const m = withP.length;
  withP.forEach((r, i) => {
    r.q = +Math.min(1, (r.p * m) / (i + 1)).toFixed(4);
  });
  // monotonisation
  for (let i = withP.length - 2; i >= 0; i -= 1) withP[i].q = Math.min(withP[i].q, withP[i + 1].q);
  return rows;
}

function section(key, title, labelKey = "label") {
  const idx1 = new Map((h1[key] || []).map((r) => [r[labelKey] ?? r.label, r]));
  const idx2 = new Map((h2[key] || []).map((r) => [r[labelKey] ?? r.label, r]));
  let rows = (full[key] || [])
    .filter((r) => r.n >= MIN_N)
    .map((r) => {
      const z = zOf(r);
      const k = r[labelKey] ?? r.label;
      const a = idx1.get(k);
      const b = idx2.get(k);
      return {
        rule: String(k).slice(0, 78),
        n: r.n,
        obs: r.favoredWinPct,
        att: r.expectedPct,
        edge: r.edgePct,
        ci: `[${r.ci95[0]};${r.ci95[1]}]`,
        z: z == null ? null : +z.toFixed(2),
        p: pOf(z),
        edgeH1: a ? a.edgePct : null,
        nH1: a ? a.n : 0,
        edgeH2: b ? b.edgePct : null,
        nH2: b ? b.n : 0,
        signeStable: a && b && a.n >= 10 && b.n >= 10 ? Math.sign(a.edgePct) === Math.sign(b.edgePct) : null,
      };
    });
  rows = bh(rows).sort((a, b) => a.edge - b.edge);
  console.log(`\n############ ${title} (n>=${MIN_N}) ############`);
  console.log("edge%\tobs%\tatt%\tn\tz\tq(BH)\tH1\tH2\tstable\trègle");
  for (const r of rows) {
    console.log(
      `${r.edge}\t${r.obs}\t${r.att}\t${r.n}\t${r.z}\t${r.q}\t${r.edgeH1}\t${r.edgeH2}\t${r.signeStable}\t${r.rule}`
    );
  }
  const neg = rows.filter((r) => r.edge < 0).length;
  console.log(`→ ${neg}/${rows.length} règles au signe inversé (edge < 0)`);
  return rows;
}

console.log(`full=${full.games} parties · H1=${h1.games} · H2=${h2.games}`);
section("compClashRules", "COMP_CLASH_RULES");
section("teamTraitRules", "TEAM_TRAIT_RULES");
section("champPairRulesSameLane", "CHAMP_PAIR_RULES même lane", "rule");
section("champPairRulesAllPairs", "CHAMP_PAIR_RULES toutes paires", "rule");
section("curatedCountersAllPositions", "CURATED_COUNTERS toutes positions");
section("curatedCountersSameLane", "CURATED_COUNTERS même lane");
