#!/usr/bin/env node
/**
 * Diagnostic : accuracy de CHAQUE composante du duel prise isolément.
 *
 * But — savoir si le moteur a de l'information avec le mauvais signe (composante
 * anti-corrélée au résultat) ou simplement pas d'information (≈ 50 %).
 *
 * Usage : node scripts/backtest_components.mjs [--csv chemin] [--max N]
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CSV = join(
  process.env.USERPROFILE || process.env.HOME || "",
  "Documents/lolcoach/model/2022_LoL_esports_match_data_from_OraclesElixir.csv"
);

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function loadEngine() {
  const sandbox = { global: {}, window: {}, globalThis: {}, console };
  sandbox.global = sandbox.window = sandbox.globalThis = sandbox;
  for (const file of [
    "lane-viability.js",
    "lane-matchup-logic.js",
    "champion-classes.js",
    "coaching-knowledge.js",
    "mtg-color-pie.js",
    "draft-interactions.js",
    "draft-scoring.js",
  ]) {
    vm.runInNewContext(readFileSync(join(root, "public", file), "utf8"), sandbox, { filename: file });
  }
  sandbox.LoLLaneMatchupLogic.loadPrecomputed(
    JSON.parse(readFileSync(join(root, "public/data/lane-matchups.json"), "utf8"))
  );
  sandbox.LoLChampionClasses.loadPrecomputed(
    JSON.parse(readFileSync(join(root, "public/data/champion-classes.json"), "utf8"))
  );
  return sandbox;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const POSITION_SLOT = { top: "Top", jng: "Jungle", mid: "Mid", bot: "Bot", sup: "Support" };

function readGames(csvPath, maxGames) {
  const lines = readFileSync(csvPath, "utf8").split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const games = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i]) continue;
    const f = parseCsvLine(lines[i]);
    const pos = (f[col.position] || "").toLowerCase();
    if (!POSITION_SLOT[pos]) continue;
    const id = f[col.gameid];
    if (!id) continue;
    let g = games.get(id);
    if (!g) {
      g = { id, league: f[col.league], patch: f[col.patch], blue: {}, red: {}, blueWin: null };
      games.set(id, g);
    }
    const side = (f[col.side] || "").toLowerCase() === "blue" ? "blue" : "red";
    g[side][POSITION_SLOT[pos]] = f[col.champion];
    if (side === "blue") g.blueWin = f[col.result] === "1";
  }
  const out = [];
  for (const g of games.values()) {
    if (g.blueWin == null) continue;
    if (Object.values(g.blue).filter(Boolean).length !== 5) continue;
    if (Object.values(g.red).filter(Boolean).length !== 5) continue;
    out.push(g);
    if (maxGames && out.length >= maxGames) break;
  }
  return out;
}

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function main() {
  const csvPath = arg("--csv", DEFAULT_CSV);
  const maxGames = Number(arg("--max", "0")) || 0;
  if (!existsSync(csvPath)) {
    console.error(`CSV introuvable : ${csvPath}`);
    process.exit(2);
  }

  const sandbox = loadEngine();
  const SC = sandbox.LoLDraftScoring;
  const champs = JSON.parse(readFileSync(join(root, "public/data/champions.json"), "utf8")).champions;
  const meta = JSON.parse(readFileSync(join(root, "public/data/tactics-meta.json"), "utf8")).champions;
  const byName = new Map(champs.map((c) => [c.name, c]));
  const nameMap = new Map();
  for (const c of champs) for (const a of [c.name, c.nameEn, c.key, c.id]) if (a) nameMap.set(norm(a), c.name);

  const games = readGames(csvPath, maxGames);
  const ctx = { byName, metaMap: meta };

  /** Chaque composante : valeur signée en faveur du bleu. */
  const components = {
    margeDuel: (b, r, d) => d.margin,
    internalMargin: (b, r, d) => d.internalMargin ?? 0,
    crossMatchup: (b, r, d) => d.detail?.cross?.matchup ?? 0,
    totalDelta: (b, r, d) => (d.our?.total ?? 0) - (d.enemy?.total ?? 0),
    winCondition: (b, r, d) => (d.our?.breakdown?.winCondition ?? 0) - (d.enemy?.breakdown?.winCondition ?? 0),
    famille: (b, r, d) => (d.our?.breakdown?.family ?? 0) - (d.enemy?.breakdown?.family ?? 0),
    wombo: (b, r, d) => (d.our?.breakdown?.wombo ?? 0) - (d.enemy?.breakdown?.wombo ?? 0),
    classes: (b, r, d) => (d.our?.breakdown?.classes ?? 0) - (d.enemy?.breakdown?.classes ?? 0),
    interaction: (b, r, d) => (d.our?.breakdown?.interaction ?? 0) - (d.enemy?.breakdown?.interaction ?? 0),
    synergie: (b, r, d) => (d.our?.breakdown?.synergy ?? 0) - (d.enemy?.breakdown?.synergy ?? 0),
    matchupBd: (b, r, d) => (d.our?.breakdown?.matchup ?? 0) - (d.enemy?.breakdown?.matchup ?? 0),
    equilibre: (b, r, d) => (d.our?.breakdown?.balance ?? 0) - (d.enemy?.breakdown?.balance ?? 0),
    coaching: (b, r, d) => (d.our?.breakdown?.coaching ?? 0) - (d.enemy?.breakdown?.coaching ?? 0),
    mtg: (b, r, d) => (d.our?.breakdown?.mtg ?? 0) - (d.enemy?.breakdown?.mtg ?? 0),
    tiersPro: (b, r) => {
      const rank = { S: 4, A: 3, B: 2, C: 1, D: 0 };
      const sum = (list) => list.reduce((s, n) => s + (rank[byName.get(n)?.tierMeta] ?? 1), 0);
      return sum(b) - sum(r);
    },
    lanes: (b, r) => {
      const slots = ["Top", "Jungle", "Mid", "Bot", "Support"];
      let s = 0;
      for (let i = 0; i < 5; i += 1) s += SC.scoreLaneMatchup(b[i], r[i], slots[i], byName, meta).margin;
      return s;
    },
  };

  const acc = {};
  for (const k of Object.keys(components)) acc[k] = { correct: 0, wrong: 0, ties: 0, sumX: 0, sumY: 0, sumXY: 0, sumX2: 0, sumY2: 0 };
  let n = 0;

  const slots = ["Top", "Jungle", "Mid", "Bot", "Support"];
  for (const g of games) {
    const blue = slots.map((s) => nameMap.get(norm(g.blue[s])));
    const red = slots.map((s) => nameMap.get(norm(g.red[s])));
    if (blue.some((x) => !x) || red.some((x) => !x)) continue;
    const duel = SC.evaluateDraftDuel(blue, red, ctx);
    const y = g.blueWin ? 1 : 0;
    n += 1;
    for (const [k, fn] of Object.entries(components)) {
      let v = 0;
      try {
        v = Number(fn(blue, red, duel)) || 0;
      } catch {
        v = 0;
      }
      const a = acc[k];
      if (v === 0) a.ties += 1;
      else if (v > 0 === g.blueWin) a.correct += 1;
      else a.wrong += 1;
      a.sumX += v;
      a.sumY += y;
      a.sumXY += v * y;
      a.sumX2 += v * v;
      a.sumY2 += y * y;
    }
  }

  const rows = Object.entries(acc).map(([k, a]) => {
    const dec = a.correct + a.wrong;
    const num = n * a.sumXY - a.sumX * a.sumY;
    const den = Math.sqrt((n * a.sumX2 - a.sumX ** 2) * (n * a.sumY2 - a.sumY ** 2));
    return {
      composante: k,
      accuracyPct: dec ? +((a.correct / dec) * 100).toFixed(2) : null,
      decisives: dec,
      nuls: a.ties,
      correlation: den ? +(num / den).toFixed(4) : 0,
    };
  });
  rows.sort((a, b) => (b.accuracyPct ?? 0) - (a.accuracyPct ?? 0));

  const report = { games: n, composantes: rows };
  const out = arg("--json");
  if (out) writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(`parties évaluées : ${n}\n`);
  console.log("composante          accuracy   décisives   corrélation");
  for (const r of rows) {
    console.log(
      `${r.composante.padEnd(18)} ${String(r.accuracyPct).padStart(7)}%   ${String(r.decisives).padStart(7)}   ${String(r.correlation).padStart(8)}`
    );
  }
}

main();
