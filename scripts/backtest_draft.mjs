#!/usr/bin/env node
/**
 * Backtest du moteur de draft sur des parties réelles (Oracle's Elixir).
 *
 * Mesure : accuracy, Brier, log loss, calibration par bin, accuracy sur les
 * drafts les plus tranchées, coupes par ligue / patch, et contrôle de symétrie
 * (les côtés inversés doivent produire la prédiction miroir).
 *
 * Usage : node scripts/backtest_draft.mjs [--csv chemin] [--max N] [--json sortie]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
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
  const lanePath = join(root, "public/data/lane-matchups.json");
  if (existsSync(lanePath)) {
    sandbox.LoLLaneMatchupLogic.loadPrecomputed(JSON.parse(readFileSync(lanePath, "utf8")));
  }
  const classPath = join(root, "public/data/champion-classes.json");
  if (existsSync(classPath)) {
    sandbox.LoLChampionClasses.loadPrecomputed(JSON.parse(readFileSync(classPath, "utf8")));
  }
  return sandbox;
}

/** Parseur CSV tolérant aux guillemets et virgules internes. */
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
  const text = readFileSync(csvPath, "utf8");
  const lines = text.split(/\r?\n/);
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
      g = {
        id,
        league: f[col.league],
        patch: f[col.patch],
        date: f[col.date],
        playoffs: f[col.playoffs] === "1",
        complete: f[col.datacompleteness] === "complete",
        blue: {},
        red: {},
        blueWin: null,
      };
      games.set(id, g);
    }
    const side = (f[col.side] || "").toLowerCase() === "blue" ? "blue" : "red";
    g[side][POSITION_SLOT[pos]] = f[col.champion];
    if (side === "blue") g.blueWin = f[col.result] === "1";
    if (maxGames && games.size > maxGames * 1.2) break;
  }
  const out = [];
  for (const g of games.values()) {
    if (g.blueWin == null) continue;
    const b = Object.values(g.blue).filter(Boolean);
    const r = Object.values(g.red).filter(Boolean);
    if (b.length !== 5 || r.length !== 5) continue;
    out.push(g);
    if (maxGames && out.length >= maxGames) break;
  }
  return out;
}

function buildNameMap(champs) {
  const m = new Map();
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  for (const c of champs) {
    for (const alias of [c.name, c.nameEn, c.key, c.id]) {
      if (alias) m.set(norm(alias), c.name);
    }
  }
  // Alias historiques Oracle's Elixir
  const extra = {
    "nunuwillump": "Nunu et Willump",
    "renata": "Renata Glasc",
    "wukong": "Wukong",
    "monkeyking": "Wukong",
  };
  for (const [k, v] of Object.entries(extra)) if (!m.has(k)) m.set(k, v);
  return { map: m, norm };
}

function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

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
  const { map: nameMap, norm } = buildNameMap(champs);

  const games = readGames(csvPath, maxGames);
  const unknown = new Map();
  const rows = [];

  for (const g of games) {
    const toFr = (list) =>
      list.map((n) => {
        const fr = nameMap.get(norm(n));
        if (!fr) unknown.set(n, (unknown.get(n) || 0) + 1);
        return fr;
      });
    const blue = toFr(Object.values(g.blue));
    const red = toFr(Object.values(g.red));
    if (blue.some((x) => !x) || red.some((x) => !x)) continue;

    const duel = SC.evaluateDraftDuel(blue, red, { byName, metaMap: meta });
    const margin = duel.margin;
    const p = duel.winProb?.our ?? 0.5;
    rows.push({
      id: g.id,
      league: g.league,
      patch: g.patch,
      playoffs: g.playoffs,
      blueWin: g.blueWin,
      margin,
      p,
      blue,
      red,
    });
  }

  const n = rows.length;
  const stats = (subset, label) => {
    const m = subset.length;
    if (!m) return null;
    let correct = 0;
    let ties = 0;
    let brier = 0;
    let logloss = 0;
    for (const r of subset) {
      if (r.margin === 0) ties += 1;
      else if (r.margin > 0 === r.blueWin) correct += 1;
      const y = r.blueWin ? 1 : 0;
      const p = Math.min(0.999, Math.max(0.001, r.p));
      brier += (p - y) ** 2;
      logloss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    }
    const decisive = m - ties;
    return {
      label,
      games: m,
      accuracyPct: decisive ? +((correct / decisive) * 100).toFixed(2) : null,
      correct,
      wrong: decisive - correct,
      ties,
      brier: +(brier / m).toFixed(4),
      logLoss: +(logloss / m).toFixed(4),
    };
  };

  const blueWinRate = rows.filter((r) => r.blueWin).length / n;
  const sorted = [...rows].sort((a, b) => Math.abs(b.margin) - Math.abs(a.margin));
  const topSlice = (pct) => sorted.slice(0, Math.max(1, Math.round(n * pct)));

  const calibration = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const bin = rows.filter((r) => r.p * 100 >= lo && r.p * 100 < lo + 10);
    if (!bin.length) continue;
    calibration.push({
      bin: `${lo}-${lo + 10}%`,
      games: bin.length,
      predicted: +((bin.reduce((s, r) => s + r.p, 0) / bin.length) * 100).toFixed(1),
      observed: +((bin.filter((r) => r.blueWin).length / bin.length) * 100).toFixed(1),
    });
  }

  const byLeague = {};
  for (const r of rows) (byLeague[r.league] = byLeague[r.league] || []).push(r);
  const leagueStats = Object.entries(byLeague)
    .filter(([, v]) => v.length >= 200)
    .map(([k, v]) => stats(v, k))
    .sort((a, b) => b.games - a.games);

  // Contrôle de symétrie : la prédiction doit s'inverser quand on échange les côtés.
  const symSample = rows.slice(0, Math.min(300, rows.length));
  let symViolations = 0;
  for (const r of symSample) {
    const back = SC.evaluateDraftDuel(r.red, r.blue, { byName, metaMap: meta });
    if (Math.abs(back.margin + r.margin) > 2) symViolations += 1;
  }

  const report = {
    dataset: csvPath.split(/[\\/]/).pop(),
    gamesEvaluated: n,
    gamesInCsv: games.length,
    unknownChampions: [...unknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
    baselineBlueAlwaysPct: +(blueWinRate * 100).toFixed(2),
    overall: stats(rows, "toutes les parties"),
    decisiveSlices: [
      stats(topSlice(0.03), "3 % des drafts les plus tranchées"),
      stats(topSlice(0.05), "5 % les plus tranchées"),
      stats(topSlice(0.1), "10 % les plus tranchées"),
      stats(topSlice(0.2), "20 % les plus tranchées"),
      stats(topSlice(0.5), "50 % les plus tranchées"),
    ],
    calibration,
    byLeague: leagueStats,
    symmetryCheck: { sample: symSample.length, violations: symViolations },
    marginStats: {
      mean: +(rows.reduce((s, r) => s + r.margin, 0) / n).toFixed(1),
      meanAbs: +(rows.reduce((s, r) => s + Math.abs(r.margin), 0) / n).toFixed(1),
      p95Abs: +[...rows.map((r) => Math.abs(r.margin))].sort((a, b) => a - b)[Math.floor(n * 0.95)],
    },
  };

  const outPath = arg("--json");
  if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
