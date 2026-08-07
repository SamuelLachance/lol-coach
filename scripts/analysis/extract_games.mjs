#!/usr/bin/env node
/**
 * AXE 1 — étape 1 : extraction.
 * Lit le CSV Oracle's Elixir, reconstruit une ligne par partie (10 champions,
 * les deux teamname, la date, le vainqueur) et calcule la marge de draft du
 * moteur du site. Sortie : analysis/games_margins.json
 *
 * Usage : node scripts/analysis/extract_games.mjs [--csv chemin] [--out fichier]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
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
  if (existsSync(lanePath))
    sandbox.LoLLaneMatchupLogic.loadPrecomputed(JSON.parse(readFileSync(lanePath, "utf8")));
  const classPath = join(root, "public/data/champion-classes.json");
  if (existsSync(classPath))
    sandbox.LoLChampionClasses.loadPrecomputed(JSON.parse(readFileSync(classPath, "utf8")));
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

function readGames(csvPath) {
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
        blue: {},
        red: {},
        blueTeam: null,
        redTeam: null,
        blueWin: null,
      };
      games.set(id, g);
    }
    const side = (f[col.side] || "").toLowerCase() === "blue" ? "blue" : "red";
    g[side][POSITION_SLOT[pos]] = f[col.champion];
    g[side === "blue" ? "blueTeam" : "redTeam"] = f[col.teamname];
    if (side === "blue") g.blueWin = f[col.result] === "1";
  }
  const out = [];
  for (const g of games.values()) {
    if (g.blueWin == null) continue;
    if (Object.values(g.blue).filter(Boolean).length !== 5) continue;
    if (Object.values(g.red).filter(Boolean).length !== 5) continue;
    if (!g.blueTeam || !g.redTeam) continue;
    out.push(g);
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
  for (const c of champs) for (const a of [c.name, c.nameEn, c.key, c.id]) if (a) m.set(norm(a), c.name);
  const extra = {
    nunuwillump: "Nunu et Willump",
    renata: "Renata Glasc",
    monkeyking: "Wukong",
  };
  for (const [k, v] of Object.entries(extra)) if (!m.has(k)) m.set(k, v);
  return { map: m, norm };
}

function main() {
  const csvPath = arg("--csv", DEFAULT_CSV);
  const outPath = arg("--out", join(here, "games_margins.json"));
  const sandbox = loadEngine();
  const SC = sandbox.LoLDraftScoring;
  const champs = JSON.parse(readFileSync(join(root, "public/data/champions.json"), "utf8")).champions;
  const meta = JSON.parse(readFileSync(join(root, "public/data/tactics-meta.json"), "utf8")).champions;
  const byName = new Map(champs.map((c) => [c.name, c]));
  const { map: nameMap, norm } = buildNameMap(champs);

  const games = readGames(csvPath);
  const rows = [];
  let skipped = 0;
  for (const g of games) {
    const toFr = (list) => list.map((n) => nameMap.get(norm(n)));
    const blue = toFr(Object.values(g.blue));
    const red = toFr(Object.values(g.red));
    if (blue.some((x) => !x) || red.some((x) => !x)) {
      skipped += 1;
      continue;
    }
    const duel = SC.evaluateDraftDuel(blue, red, { byName, metaMap: meta });
    rows.push({
      id: g.id,
      league: g.league,
      patch: g.patch,
      date: g.date,
      playoffs: g.playoffs,
      blueTeam: g.blueTeam,
      redTeam: g.redTeam,
      blueWin: g.blueWin ? 1 : 0,
      margin: duel.margin,
      p: duel.winProb?.our ?? 0.5,
    });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  writeFileSync(outPath, JSON.stringify({ n: rows.length, skipped, rows }), "utf8");
  console.log(`parties écrites : ${rows.length} (ignorées : ${skipped}) -> ${outPath}`);
}

main();
