#!/usr/bin/env node
/**
 * Logic-based draft analysis — processed_all_games.csv (skills folder).
 *
 * APPROACH (NOT data-driven):
 * - For each game, detect comp plans (hypercarry, poke, engage, split, pick, etc.)
 * - Apply League of Legends composition logic rules (peel vs engage, poke kites engage,
 *   pick punishes immobile scale, split beats slow teamfight, tempo vs unpeeled carry…)
 * - Tag primary win-reason category; aggregate how often logic explains the winner
 * - Compare logic vs evaluateDraftDuel — find gaps where algo favored the loser
 *
 * No win-rate thresholds or "68% when X vs Y" rules — only MOBA theory.
 *
 * Usage: node scripts/analyze_games_logic.mjs [--csv path] [--max N] [--sample N]
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import { buildChampResolver, normKey, MANUAL_ALIASES } from "./champ_abbrev.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CSV = join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".cursor/skills/League-of-Legends/processed_all_games.csv"
);

const SLOT_KEYS = ["Top", "Jungle", "Mid", "Bot", "Support"];

const PLAN_LABELS_FR = {
  hypercarry: "hypercarry protégé",
  poke_disengage: "poke + disengage",
  poke_siege: "poke / siege",
  teamfight_engage: "teamfight engage",
  split_push: "split push",
  pick_global: "pick / global",
  all_in: "all-in tempo",
  lane_tempo: "lane tempo",
  beatdown: "dive / beatdown",
  front_to_back: "front-to-back",
  scaling_late: "scaling late",
};

/**
 * Logic win rules — ordered by specificity. First match = primary explanation.
 * Each rule returns { category, reasonFr } when winner comp satisfies the logic.
 */
const LOGIC_WIN_RULES = [
  {
    category: "peel_vs_engage",
    test: (w, l) =>
      w.plan === "hypercarry" &&
      l.plan === "hypercarry" &&
      w.metrics.enchanter >= 1 &&
      w.metrics.peel >= 1.0 &&
      (l.metrics.dive >= 1 || l.metrics.hardEngage >= 1) &&
      w.metrics.peel >= l.metrics.peel + 0.2,
    reasonFr: (w, l) =>
      `Hypercarry mieux protégé (${w.champs.join("/")}) : enchanter + peel supérieur absorbe le dive/engage de ${l.champs.join("/")}.`,
  },
  {
    category: "peel_vs_engage",
    test: (w, l) =>
      w.plan === "hypercarry" &&
      (l.plan === "beatdown" || l.plan === "pick_global" || l.plan === "teamfight_engage") &&
      w.metrics.enchanter >= 1 &&
      w.metrics.peel >= 1.0,
    reasonFr: (w, l) =>
      `${PLAN_LABELS_FR[w.plan]} (${w.champs.join("/")}) : Séraphine/enchanter peel neutralise le dive ${PLAN_LABELS_FR[l.plan]} de ${l.champs.join("/")}.`,
  },
  {
    category: "peel_vs_engage",
    test: (w, l) =>
      w.plan === "front_to_back" &&
      l.plan === "teamfight_engage" &&
      w.metrics.peel >= 1.0 &&
      w.metrics.front >= 1,
    reasonFr: (w, l) =>
      `Front-to-back avec peel (${w.champs.join("/")}) : frontline + support protège le carry pendant que ${PLAN_LABELS_FR[l.plan]} engage dans le vide.`,
  },
  {
    category: "poke_vs_engage",
    test: (w, l) =>
      (w.plan === "poke_disengage" || w.plan === "poke_siege") &&
      l.plan === "teamfight_engage" &&
      w.metrics.disengage >= 1 &&
      (w.metrics.poke >= 2 || w.metrics.siege >= 2),
    reasonFr: (w, l) =>
      `${PLAN_LABELS_FR[w.plan]} kite ${PLAN_LABELS_FR[l.plan]} : range + disengage empêche le engage mélée de toucher la backline.`,
  },
  {
    category: "range_vs_melee",
    test: (w, l) =>
      w.metrics.siege >= 2 &&
      l.metrics.hardEngage >= 2 &&
      w.metrics.disengage >= 1 &&
      l.metrics.siege === 0,
    reasonFr: (w, l) =>
      `Abus de portée (${w.champs.join("/")}) : siege/poke punition une comp engage mélée sans réponse range.`,
  },
  {
    category: "disengage_vs_wombo",
    test: (w, l) =>
      w.metrics.disengage >= 2 &&
      l.metrics.hardEngage >= 2 &&
      l.metrics.womboSetup >= 1,
    reasonFr: (w, l) =>
      `Disengage casse le wombo : ${w.champs.join("/")} reset la fight quand ${l.champs.join("/")} commit l'engage.`,
  },
  {
    category: "pick_vs_scaling",
    test: (w, l) =>
      (w.plan === "pick_global" || w.metrics.global >= 2) &&
      l.plan === "hypercarry" &&
      l.metrics.immobile >= 1 &&
      l.metrics.peel < 1.2,
    reasonFr: (w, l) =>
      `Pick/global (${w.champs.join("/")}) punition un hypercarry immobile (${l.champs.join("/")}) — cross-map picks avant le scale.`,
  },
  {
    category: "tempo_vs_scale",
    test: (w, l) =>
      (w.plan === "all_in" || w.plan === "lane_tempo") &&
      l.plan === "hypercarry" &&
      l.metrics.peel < 1.0 &&
      w.metrics.early >= 1.5,
    reasonFr: (w, l) =>
      `Tempo early (${PLAN_LABELS_FR[w.plan]}) ferme la game avant que l'hypercarry (${l.champs.join("/")}) scale — pas assez de peel.`,
  },
  {
    category: "split_vs_teamfight",
    test: (w, l) =>
      w.plan === "split_push" &&
      l.plan === "teamfight_engage" &&
      w.metrics.split >= 1,
    reasonFr: (w, l) =>
      `Split 1-3-1 (${w.champs.join("/")}) force des réponses isolées ; ${PLAN_LABELS_FR[l.plan]} ne peut pas group 5v5 efficacement.`,
  },
  {
    category: "engage_vs_split",
    test: (w, l) =>
      w.plan === "teamfight_engage" &&
      l.plan === "split_push" &&
      w.metrics.hardEngage >= 2 &&
      w.metrics.global >= 1,
    reasonFr: (w, l) =>
      `Engage + catch (${w.champs.join("/")}) force le 5v5 et punition le split isolé de ${l.champs.join("/")}.`,
  },
  {
    category: "dive_vs_poke",
    test: (w, l) =>
      w.plan === "beatdown" &&
      (l.plan === "poke_siege" || l.plan === "poke_disengage") &&
      w.metrics.dive >= 2 &&
      l.metrics.front < 2,
    reasonFr: (w, l) =>
      `Dive coordonné (${w.champs.join("/")}) gap-close sur la backline poke immobile de ${l.champs.join("/")}.`,
  },
  {
    category: "zone_vs_dive",
    test: (w, l) =>
      w.metrics.zone >= 2 &&
      l.metrics.dive >= 2 &&
      w.metrics.front >= 1,
    reasonFr: (w, l) =>
      `Contrôle de zone (${w.champs.join("/")}) choke les angles — la comp dive (${l.champs.join("/")}) ne peut pas entrer.`,
  },
  {
    category: "scaling_timing",
    test: (w, l) =>
      w.plan === "scaling_late" &&
      (l.plan === "all_in" || l.plan === "lane_tempo") &&
      w.metrics.scaling >= 1.5 &&
      w.metrics.front >= 1,
    reasonFr: (w, l) =>
      `Outscale : ${PLAN_LABELS_FR[w.plan]} (${w.champs.join("/")}) survit à la window ${PLAN_LABELS_FR[l.plan]} puis domine en late.`,
  },
  {
    category: "scaling_timing",
    test: (w, l) =>
      w.metrics.scaling >= 1.4 &&
      l.metrics.early >= 1.6 &&
      w.metrics.front >= 1 &&
      w.metrics.peel >= 0.8,
    reasonFr: (w, l) =>
      `Scale + front (${w.champs.join("/")}) : absorbe le spike early de ${l.champs.join("/")}, win condition late supérieure.`,
  },
  {
    category: "double_enchanter_vs_dive",
    test: (w, l) =>
      w.metrics.enchanter >= 2 &&
      l.metrics.dive >= 2 &&
      w.metrics.peel >= 1.2,
    reasonFr: (w, l) =>
      `Double enchanter (${w.champs.join("/")}) : layers de peel rendent le dive (${l.champs.join("/")}) inefficace.`,
  },
  {
    category: "anti_dash_vs_dive",
    test: (w, l) =>
      w.metrics.antiDash >= 1 &&
      l.metrics.dive >= 2 &&
      w.metrics.front >= 1,
    reasonFr: (w, l) =>
      `Anti-dash + front (${w.champs.join("/")}) neutralise la mobilité du dive ${l.champs.join("/")}.`,
  },
  {
    category: "win_condition",
    test: (w, l) =>
      w.plan === "teamfight_engage" &&
      l.metrics.front === 0 &&
      l.metrics.hardEngage === 0,
    reasonFr: (w, l) =>
      `Engage vs backline nue (${l.champs.join("/")}) : pas de frontline pour absorber — wombo free.`,
  },
  {
    category: "win_condition",
    test: (w, l) => w.wc > l.wc + 35,
    reasonFr: (w, l) =>
      `Win condition plus complète (${w.plan} ${Math.round(w.wc)} vs ${l.plan} ${Math.round(l.wc)}) : moins de gaps structurels.`,
  },
  {
    category: "execution_skillcheck",
    test: () => true,
    reasonFr: (w, l) =>
      `Comps ${PLAN_LABELS_FR[w.plan] || w.plan} vs ${PLAN_LABELS_FR[l.plan] || l.plan} — exécution, gold lead et macro décident (pas de clash structurel dominant).`,
  },
];

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

function teamSnapshot(SC, D, IX, names, byName, meta) {
  const vs = names.map((n) => SC.buildProfile(byName.get(n) || { name: n }, meta));
  const arch = D.detectCompPlan(vs);
  const plan = arch.plan || "unknown";
  const metrics = IX.buildTeamMetrics(vs);
  const wc = Math.round((arch.completeness || 0) * 6.5 + (plan ? 95 : 0));
  return { plan, metrics, wc, vs, champs: names, completeness: arch.completeness || 0 };
}

function explainGameLogic(wSnap, lSnap) {
  for (const rule of LOGIC_WIN_RULES) {
    if (rule.test(wSnap, lSnap)) {
      return {
        category: rule.category,
        reasonFr: rule.reasonFr(wSnap, lSnap),
        winnerPlan: wSnap.plan,
        loserPlan: lSnap.plan,
      };
    }
  }
  return { category: "execution_skillcheck", reasonFr: "Exécution.", winnerPlan: wSnap.plan, loserPlan: lSnap.plan };
}

function logicPredictsWinner(wSnap, lSnap) {
  const ex = explainGameLogic(wSnap, lSnap);
  if (ex.category === "execution_skillcheck") return null;
  return ex;
}

function main() {
  const args = process.argv.slice(2);
  let csvPath = DEFAULT_CSV;
  let maxGames = Infinity;
  let sampleCount = 5;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--csv" && args[i + 1]) csvPath = args[++i];
    if (args[i] === "--max" && args[i + 1]) maxGames = parseInt(args[++i], 10);
    if (args[i] === "--sample" && args[i + 1]) sampleCount = parseInt(args[++i], 10);
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
  const { resolve, unknown, abbrevMap, mapSize } = buildChampResolver(champs);

  const rawGames = loadGames(csvPath);
  console.log(`CSV: ${csvPath}`);
  console.log(`Raw rows: ${rawGames.length}`);
  console.log(`Abbrev map size: ${mapSize} (+ ${Object.keys(MANUAL_ALIASES).length} manual aliases)`);

  const categoryCounts = new Map();
  const logicAlgoAgree = { bothCorrect: 0, logicOnly: 0, algoOnly: 0, bothWrong: 0, skillcheck: 0 };
  const algoGaps = new Map();
  let skipped = 0;
  let analyzed = 0;
  let logicExplained = 0;
  let algoCorrect = 0;
  let algoWrong = 0;
  let algoTies = 0;
  const sampleGames = [];

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
    const snap1 = teamSnapshot(SC, D, IX, team1, byName, meta);
    const snap2 = teamSnapshot(SC, D, IX, team2, byName, meta);
    const wSnap = g.winner === 1 ? snap1 : snap2;
    const lSnap = g.winner === 1 ? snap2 : snap1;

    const logic = explainGameLogic(wSnap, lSnap);
    categoryCounts.set(logic.category, (categoryCounts.get(logic.category) || 0) + 1);
    if (logic.category !== "execution_skillcheck") logicExplained++;

    const duel = SC.evaluateDraftDuel(team1, team2, { ourComp: comp1, enemyComp: comp2, byName, metaMap: meta });
    const predWinner = duel.margin >= 0 ? 1 : 2;
    const algoHit = Math.abs(duel.margin) < 8 ? "tie" : predWinner === g.winner ? "correct" : "wrong";
    if (algoHit === "tie") algoTies++;
    else if (algoHit === "correct") algoCorrect++;
    else {
      algoWrong++;
      const gapKey = `${logic.category}|algo_favored_${predWinner === 1 ? "blue" : "red"}|actual_${g.winner === 1 ? "blue" : "red"}`;
      const gap = algoGaps.get(gapKey) || { count: 0, example: null };
      gap.count++;
      if (!gap.example) {
        gap.example = {
          blue: team1,
          red: team2,
          winner: g.winner,
          logicReason: logic.reasonFr,
          algoMargin: duel.margin,
          plans: { blue: snap1.plan, red: snap2.plan },
        };
      }
      algoGaps.set(gapKey, gap);
    }

    const hasLogic = logic.category !== "execution_skillcheck";
    const algoOk = algoHit === "correct";
    if (hasLogic && algoOk) logicAlgoAgree.bothCorrect++;
    else if (hasLogic && !algoOk && algoHit !== "tie") logicAlgoAgree.logicOnly++;
    else if (!hasLogic && algoOk) logicAlgoAgree.algoOnly++;
    else if (!hasLogic && !algoOk && algoHit !== "tie") logicAlgoAgree.bothWrong++;
    else logicAlgoAgree.skillcheck++;

    if (sampleGames.length < sampleCount && hasLogic) {
      const stride = Math.max(500, Math.floor(analyzed / (sampleCount + 1)));
      if (sampleGames.length === 0 || analyzed % stride === 0) {
      sampleGames.push({
        blue: team1.join("/"),
        red: team2.join("/"),
        winner: g.winner === 1 ? "blue" : "red",
        category: logic.category,
        reasonFr: logic.reasonFr,
        plans: `${snap1.plan} vs ${snap2.plan}`,
        algoMargin: duel.margin,
        algoAligned: predWinner === g.winner,
      });
      }
    }

    if (analyzed % 10000 === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ... ${analyzed} games (${elapsed}s) logic-explained=${logicExplained}`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const decisive = algoCorrect + algoWrong;
  const algoAccuracy = decisive > 0 ? (algoCorrect / decisive) * 100 : 0;
  const logicRate = analyzed > 0 ? (logicExplained / analyzed) * 100 : 0;

  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => ({ category: cat, count: n, pct: Number(((n / analyzed) * 100).toFixed(1)) }));

  const topGaps = [...algoGaps.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([key, v]) => ({ key, count: v.count, example: v.example }));

  const userOur = ["Galio", "Naafiri", "Ryze", "Caitlyn", "Bard"];
  const userEnemy = ["Rumble", "Trundle", "Cassiopeia", "Ashe", "Séraphine"];
  const userSnap1 = teamSnapshot(SC, D, IX, userOur, byName, meta);
  const userSnap2 = teamSnapshot(SC, D, IX, userEnemy, byName, meta);
  const userWinner = userSnap2;
  const userLoser = userSnap1;
  const userLogic = explainGameLogic(userWinner, userLoser);
  const userDuel = SC.evaluateDraftDuel(userOur, userEnemy, {
    ourComp: compFromSlots(userOur),
    enemyComp: compFromSlots(userEnemy),
    byName,
    metaMap: meta,
  });

  const report = {
    approach: "logic-based (MOBA composition theory, NOT win-rate statistics)",
    analyzed,
    skipped,
    unknownChamps: [...unknown],
    abbrevMapSize: mapSize,
    manualAliases: Object.keys(MANUAL_ALIASES).length,
    logicExplained,
    logicExplainRatePct: Number(logicRate.toFixed(1)),
    algoAccuracyPct: Number(algoAccuracy.toFixed(2)),
    algoCorrect,
    algoWrong,
    algoTies,
    logicAlgoAgree,
    topCategories,
    topAlgoGaps: topGaps,
    sampleGames,
    userComp: {
      logic: userLogic,
      duel: {
        margin: userDuel.margin,
        winProb: userDuel.winProb,
        plans: { blue: userSnap1.plan, red: userSnap2.plan },
        aligned: userDuel.margin < 0,
      },
    },
    logicRuleCategories: LOGIC_WIN_RULES.map((r) => r.category).filter((c, i, a) => a.indexOf(c) === i),
  };

  writeFileSync(join(root, "scripts", "analyze_games_logic_report.json"), JSON.stringify(report, null, 2));

  console.log("\n=== LOGIC ANALYSIS SUMMARY (NOT data-driven) ===");
  console.log(`Games analyzed: ${analyzed} (skipped ${skipped}, unknown: ${unknown.size})`);
  console.log(`Abbrev map: ${mapSize} entries, ${Object.keys(MANUAL_ALIASES).length} manual`);
  console.log(`Logic explained: ${logicExplained}/${analyzed} (${logicRate.toFixed(1)}%) — skillcheck rest`);
  console.log(`Algo accuracy (decisive): ${algoAccuracy.toFixed(2)}% (${algoCorrect}/${decisive})`);
  console.log(`Logic/algo agreement: ${JSON.stringify(logicAlgoAgree)}`);
  console.log("\n--- Top logic categories ---");
  for (const c of topCategories.slice(0, 10)) console.log(`  ${c.category}: ${c.count} (${c.pct}%)`);
  console.log("\n--- Sample game explanations (French) ---");
  for (const s of sampleGames) {
    console.log(`\n  ${s.blue} vs ${s.red} → ${s.winner}`);
    console.log(`  [${s.category}] ${s.reasonFr}`);
    console.log(`  Plans: ${s.plans} | Algo margin: ${s.algoMargin} aligned=${s.algoAligned}`);
  }
  console.log("\n--- User test comp ---");
  console.log(`  ${userOur.join("/")} vs ${userEnemy.join("/")}`);
  console.log(`  Logic: [${userLogic.category}] ${userLogic.reasonFr}`);
  console.log(`  Algo: margin=${userDuel.margin} win=${Math.round(userDuel.winProb.our * 100)}/${Math.round(userDuel.winProb.enemy * 100)} plans=${userSnap1.plan}/${userSnap2.plan}`);
  console.log(`\nReport: scripts/analyze_games_logic_report.json`);
  console.log(`Elapsed: ${elapsed}s`);
}

main();
