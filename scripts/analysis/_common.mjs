/** Utilitaires partagés pour l'analyse empirique des règles (axe 3). */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_CSV = join(
  process.env.USERPROFILE || process.env.HOME || "",
  "Documents/lolcoach/model/2022_LoL_esports_match_data_from_OraclesElixir.csv"
);

export function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export function loadEngine() {
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
  const laneData = JSON.parse(readFileSync(join(root, "public/data/lane-matchups.json"), "utf8"));
  sandbox.LoLLaneMatchupLogic.loadPrecomputed(laneData);
  const classData = JSON.parse(readFileSync(join(root, "public/data/champion-classes.json"), "utf8"));
  sandbox.LoLChampionClasses.loadPrecomputed(classData);
  const champs = JSON.parse(readFileSync(join(root, "public/data/champions.json"), "utf8")).champions;
  const meta = JSON.parse(readFileSync(join(root, "public/data/tactics-meta.json"), "utf8")).champions;
  const byName = new Map(champs.map((c) => [c.name, c]));
  return { sandbox, champs, meta, byName, laneData };
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

export const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];
const POSITION_SLOT = { top: "Top", jng: "Jungle", mid: "Mid", bot: "Bot", sup: "Support" };

export function readGames(csvPath, maxGames = 0) {
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
    if (SLOTS.some((s) => !g.blue[s] || !g.red[s])) continue;
    out.push(g);
    if (maxGames && out.length >= maxGames) break;
  }
  return out;
}

export function buildNameMap(champs) {
  const m = new Map();
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  for (const c of champs) {
    for (const alias of [c.name, c.nameEn, c.key, c.id]) if (alias) m.set(norm(alias), c.name);
  }
  const extra = { nunuwillump: "Nunu et Willump", renata: "Renata Glasc", monkeyking: "Wukong" };
  for (const [k, v] of Object.entries(extra)) if (!m.has(k)) m.set(k, v);
  return { map: m, norm };
}

/** Intervalle de Wilson 95 % pour une proportion. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [null, null];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [+(((c - s) / d) * 100).toFixed(2), +(((c + s) / d) * 100).toFixed(2)];
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (!dx || !dy) return null;
  return num / Math.sqrt(dx * dy);
}

/** Prépare les parties : noms FR + profils + plans + métriques, une fois pour toutes. */
export function prepareGames(csvPath, maxGames, { sandbox, champs, meta, byName }) {
  const SC = sandbox.LoLDraftScoring;
  const IX = sandbox.LoLDraftInteractions;
  const { map: nameMap, norm } = buildNameMap(champs);
  const raw = readGames(csvPath, maxGames);
  const out = [];
  const unknown = new Map();
  for (const g of raw) {
    const toFr = (comp) => {
      const o = {};
      for (const s of SLOTS) {
        const fr = nameMap.get(norm(comp[s]));
        if (!fr) unknown.set(comp[s], (unknown.get(comp[s]) || 0) + 1);
        o[s] = fr;
      }
      return o;
    };
    const blueComp = toFr(g.blue);
    const redComp = toFr(g.red);
    if (SLOTS.some((s) => !blueComp[s] || !redComp[s])) continue;
    const blueNames = SLOTS.map((s) => blueComp[s]);
    const redNames = SLOTS.map((s) => redComp[s]);
    const blueVs = SC.profiles(blueNames, byName, meta);
    const redVs = SC.profiles(redNames, byName, meta);
    // detectArchetype().plan === primaryTeamPlan(vs) (cf. draft-scoring.js:496-505 et 791-836)
    const blueArch = SC.detectArchetype(blueVs);
    const redArch = SC.detectArchetype(redVs);
    out.push({
      id: g.id,
      league: g.league,
      patch: g.patch,
      blueWin: g.blueWin,
      blueComp,
      redComp,
      blueVs,
      redVs,
      blueM: IX.buildTeamMetrics(blueVs),
      redM: IX.buildTeamMetrics(redVs),
      bluePlan: blueArch.plan,
      redPlan: redArch.plan,
      blueArch,
      redArch,
    });
  }
  return { games: out, unknown };
}
