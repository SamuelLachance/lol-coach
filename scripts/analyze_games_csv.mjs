#!/usr/bin/env node
/**
 * Empirical draft analysis — processed_all_games.csv (skills folder).
 *
 * KEY FINDINGS (2025-06-11 full run — 61,762 games, 23k skipped on champ aliases):
 * - Baseline algo accuracy ~49.5% → tuned 50.57% decisive (61,493 games); bias: overEngage=1733
 * - Empirical signals: hypercarry_peel>engage n=6825, disengage>hardEngage n=1381, poke>engage n=617
 * - Plan mirrors: hypercarry↔teamfight_engage ~7.6k each direction; poke_disengage↔hypercarry ~2.7k
 * - User comp (Galio/Naafiri/Ryze/Caitlyn/Bard vs Rumble/Trundle/Cassio/Ashe/Séraphine): red hypercarry 74%
 *
 * Usage: node scripts/analyze_games_csv.mjs [--csv path] [--max N]
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import { buildChampResolver } from "./champ_abbrev.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CSV = join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".cursor/skills/League-of-Legends/processed_all_games.csv"
);

const SLOT_KEYS = ["Top", "Jungle", "Mid", "Bot", "Support"];

function loadLoLDraft() {
  const sandbox = { global: {}, window: {}, globalThis: {} };
  sandbox.global = sandbox.window = sandbox.globalThis = sandbox;
  for (const file of [
    "lane-viability.js",
    "coaching-knowledge.js",
    "mtg-color-pie.js",
    "draft-interactions.js",
    "draft-scoring.js",
    "draft-engine.js",
  ]) {
    vm.runInNewContext(readFileSync(join(root, "public", file), "utf8"), sandbox);
  }
  return sandbox;
}

function buildChampResolverLocal(champs) {
  return buildChampResolver(champs);
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function loadGames(csvPath) {
  const text = readFileSync(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const games = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length < 13) continue;
    const winner = parseFloat(row[idx.Winner]);
    if (winner !== 1 && winner !== 2) continue;
    games.push({
      winner,
      t1: SLOT_KEYS.map((s) => row[idx[`Team1_${s}`]]?.trim()),
      t2: SLOT_KEYS.map((s) => row[idx[`Team2_${s}`]]?.trim()),
    });
  }
  return games;
}

function compFromSlots(names) {
  return { Top: names[0], Jungle: names[1], Mid: names[2], Bot: names[3], Support: names[4] };
}

function lightTeamSnapshot(SC, D, IX, names, byName, meta) {
  const vs = names.map((n) => SC.buildProfile(byName.get(n) || { name: n }, meta));
  const plan = D.detectCompPlan(vs).plan || "unknown";
  const metrics = IX.buildTeamMetrics(vs);
  const wc = Math.round((D.detectCompPlan(vs).completeness || 0) * 6.5 + (plan ? 95 : 0));
  return { plan, metrics, wc, vs };
}

function deriveWinReason(wPlan, lPlan, wM, lM, wWc, lWc) {
  if (wPlan === "hypercarry" && (wM.enchanter >= 1 || wM.peel >= 1.2) && lPlan === "teamfight_engage") return "hypercarry_protégé>engage";
  if ((wPlan === "poke_disengage" || wPlan === "poke_siege") && lPlan === "teamfight_engage") return "poke>engage";
  if ((wPlan === "all_in" || wPlan === "lane_tempo") && lPlan === "hypercarry" && lM.peel < 1.0) return "tempo>hypercarry_non_protégé";
  if (wPlan === "teamfight_engage" && lPlan === "split_push") return "engage>split";
  if (wPlan === "pick_global" && lPlan === "hypercarry") return "pick>hypercarry";
  if (wPlan === "beatdown" && (lPlan === "poke_siege" || lM.siege >= 2)) return "dive>poke";
  if (wM.disengage >= 2 && lM.hardEngage >= 2) return "disengage>engage";
  if (wM.scaling >= 1.4 && lM.early >= 1.6 && wM.front >= 1) return "scale>early_tempo";
  if (wM.zone >= 2 && lM.dive >= 2) return "zone>dive";
  if (wM.enchanter >= 2 && lM.dive >= 2) return "double_enchanter>dive";
  if (wWc > lWc + 40) return "win_condition_superior";
  return "execution_skillcheck";
}

function main() {
  const args = process.argv.slice(2);
  let csvPath = DEFAULT_CSV;
  let maxGames = Infinity;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--csv" && args[i + 1]) csvPath = args[++i];
    if (args[i] === "--max" && args[i + 1]) maxGames = parseInt(args[++i], 10);
  }
  if (!existsSync(csvPath)) {
    const alt = join(process.env.USERPROFILE || "", ".cursor", "skills", "League-of-Legends", "processed_all_games.csv");
    if (existsSync(alt)) csvPath = alt;
    else throw new Error(`CSV not found: ${csvPath}`);
  }

  const sandbox = loadLoLDraft();
  const SC = sandbox.LoLDraftScoring;
  const D = sandbox.LoLDraft;
  const IX = sandbox.LoLDraftInteractions;

  const meta = JSON.parse(readFileSync(join(root, "public/data/tactics-meta.json"), "utf8")).champions;
  const champs = JSON.parse(readFileSync(join(root, "public/data/champions.json"), "utf8")).champions;
  const byName = new Map(champs.map((c) => [c.name, c]));
  const { resolve, unknown } = buildChampResolverLocal(champs);

  const rawGames = loadGames(csvPath);
  console.log(`CSV: ${csvPath}`);
  console.log(`Raw rows: ${rawGames.length}`);

  const planMatchups = new Map();
  const reasonClusters = new Map();
  const metricPatterns = new Map();
  let skipped = 0;
  let analyzed = 0;
  let correct = 0;
  let wrong = 0;
  let ties = 0;
  const biases = { underPeel: 0, overPoke: 0, underDisengage: 0, overEngage: 0 };

  const t0 = Date.now();
  for (const g of rawGames) {
    if (analyzed >= maxGames) break;
    const team1 = g.t1.map(resolve);
    const team2 = g.t2.map(resolve);
    if (team1.some((c) => !c) || team2.some((c) => !c)) {
      skipped++;
      continue;
    }
    analyzed++;

    const comp1 = compFromSlots(team1);
    const comp2 = compFromSlots(team2);

    const snap1 = lightTeamSnapshot(SC, D, IX, team1, byName, meta);
    const snap2 = lightTeamSnapshot(SC, D, IX, team2, byName, meta);
    const wSnap = g.winner === 1 ? snap1 : snap2;
    const lSnap = g.winner === 1 ? snap2 : snap1;
    const pk = `${wSnap.plan}>${lSnap.plan}`;
    const bucket = planMatchups.get(pk) || { wins: 0, total: 0 };
    bucket.wins++;
    bucket.total++;
    planMatchups.set(pk, bucket);

    const reason = deriveWinReason(wSnap.plan, lSnap.plan, wSnap.metrics, lSnap.metrics, wSnap.wc, lSnap.wc);
    reasonClusters.set(reason, (reasonClusters.get(reason) || 0) + 1);

    // Metric-level patterns (empirical interaction signals)
    const metricKeys = [];
    if (wSnap.metrics.disengage >= 2 && lSnap.metrics.hardEngage >= 2) metricKeys.push("disengage>hardEngage");
    if (wSnap.plan === "hypercarry" && wSnap.metrics.peel >= 1.2 && lSnap.plan === "teamfight_engage") metricKeys.push("hypercarry_peel>engage");
    if ((wSnap.plan === "poke_disengage" || wSnap.plan === "poke_siege") && lSnap.plan === "teamfight_engage") metricKeys.push("poke_plan>engage_plan");
    if (wSnap.metrics.enchanter >= 2 && lSnap.metrics.dive >= 2) metricKeys.push("double_enchanter>dive_comp");
    if (wSnap.metrics.zone >= 2 && lSnap.metrics.immobile >= 2) metricKeys.push("zone>immobile_carry");
    if (lSnap.plan === "hypercarry" && lSnap.metrics.peel < 1.0 && (wSnap.plan === "all_in" || wSnap.plan === "lane_tempo")) metricKeys.push("tempo>unpeeled_hyper");
    for (const mk of metricKeys) {
      const b = metricPatterns.get(mk) || { wins: 0, total: 0 };
      b.wins++;
      b.total++;
      metricPatterns.set(mk, b);
    }

    const duel = SC.evaluateDraftDuel(team1, team2, { ourComp: comp1, enemyComp: comp2, byName, metaMap: meta });
    const predWinner = duel.margin >= 0 ? 1 : 2;
    if (Math.abs(duel.margin) < 8) ties++;
    else if (predWinner === g.winner) correct++;
    else {
      wrong++;
      const ourPlan = duel.detail?.cross?.plan?.ourPlan;
      const enemyPlan = duel.detail?.cross?.plan?.enemyPlan;
      if (g.winner === 2 && ourPlan === "teamfight_engage" && enemyPlan === "hypercarry") biases.underPeel++;
      if (g.winner === 1 && ourPlan === "poke_disengage" && enemyPlan === "teamfight_engage") biases.overPoke++;
      if (g.winner === 2 && ourPlan === "teamfight_engage" && enemyPlan === "poke_disengage") biases.underDisengage++;
      if (g.winner === 1 && ourPlan === "teamfight_engage" && enemyPlan === "hypercarry") biases.overEngage++;
    }

    if (analyzed % 5000 === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const acc = correct + wrong > 0 ? ((correct / (correct + wrong)) * 100).toFixed(1) : "?";
      console.log(`  ... ${analyzed} games (${elapsed}s) acc=${acc}%`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const decisive = correct + wrong;
  const accuracy = decisive > 0 ? (correct / decisive) * 100 : 0;

  const topPatterns = [...planMatchups.entries()]
    .filter(([, v]) => v.total >= 60)
    .map(([k, v]) => ({ key: k, winRate: (v.wins / v.total) * 100, n: v.total }))
    .sort((a, b) => b.winRate - a.winRate || b.n - a.n)
    .slice(0, 15);

  const topMetrics = [...metricPatterns.entries()]
    .map(([k, v]) => ({ key: k, winRate: (v.wins / v.total) * 100, n: v.total }))
    .sort((a, b) => b.winRate - a.winRate || b.n - a.n)
    .slice(0, 12);

  const topReasons = [...reasonClusters.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  const userOur = ["Galio", "Naafiri", "Ryze", "Caitlyn", "Bard"];
  const userEnemy = ["Rumble", "Trundle", "Cassiopeia", "Ashe", "Séraphine"];
  const userDuel = SC.evaluateDraftDuel(userOur, userEnemy, {
    ourComp: compFromSlots(userOur),
    enemyComp: compFromSlots(userEnemy),
    byName,
    metaMap: meta,
  });

  const report = {
    analyzed,
    skipped,
    unknownChamps: [...unknown].slice(0, 30),
    accuracyBefore: Number(accuracy.toFixed(2)),
    decisive,
    correct,
    wrong,
    ties,
    biases,
    topPatterns,
    topMetrics,
    topReasons: Object.fromEntries(topReasons),
    userComp: {
      margin: userDuel.margin,
      winProb: userDuel.winProb,
      plans: { our: userDuel.detail?.cross?.plan?.ourPlan, enemy: userDuel.detail?.cross?.plan?.enemyPlan },
    },
  };

  writeFileSync(join(root, "scripts", "analyze_games_report.json"), JSON.stringify(report, null, 2));

  console.log("\n=== CSV ANALYSIS SUMMARY ===");
  console.log(`Games analyzed: ${analyzed} (skipped ${skipped}, unknown champs: ${unknown.size})`);
  console.log(`Elapsed: ${elapsed}s`);
  console.log(`Prediction accuracy (decisive): ${accuracy.toFixed(2)}% (${correct}/${decisive})`);
  console.log(`Biases: ${JSON.stringify(biases)}`);
  console.log("\n--- Top plan matchup win rates ---");
  for (const p of topPatterns.slice(0, 10)) console.log(`  ${p.key}: ${p.winRate.toFixed(1)}% (n=${p.n})`);
  console.log("\n--- Metric interaction patterns ---");
  for (const p of topMetrics) console.log(`  ${p.key}: ${p.winRate.toFixed(1)}% (n=${p.n})`);
  console.log("\n--- User comp ---");
  console.log(`  margin=${userDuel.margin} win%=${Math.round(userDuel.winProb.our * 100)}/${Math.round(userDuel.winProb.enemy * 100)}`);
  console.log(`  plans: ${report.userComp.plans.our} vs ${report.userComp.plans.enemy}`);
  console.log(`Report: scripts/analyze_games_report.json`);
}

main();
