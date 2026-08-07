/**
 * Lib partagée pour l'axe "mismatch de méta".
 * Charge le moteur (public/*.js) dans un sandbox vm, parse le CSV Oracle's Elixir 2022,
 * et fournit des transformations de "neutralisation" du dataset champions 2026.
 * Aucun fichier de public/ n'est modifié : on travaille sur des CLONES.
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CSV = join(
  process.env.USERPROFILE || process.env.HOME || "",
  "Documents/lolcoach/model/2022_LoL_esports_match_data_from_OraclesElixir.csv"
);

export const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];
export const TIER_PTS = { S: 40, A: 30, B: 20, C: 10, D: 3 };

/** Recharge un sandbox neuf (évite tout état résiduel entre variantes). */
export function loadEngine({ laneMatchups = true, classes = true } = {}) {
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
  if (laneMatchups) {
    const p = join(root, "public/data/lane-matchups.json");
    if (existsSync(p)) sandbox.LoLLaneMatchupLogic.loadPrecomputed(JSON.parse(readFileSync(p, "utf8")));
  }
  if (classes) {
    const p = join(root, "public/data/champion-classes.json");
    if (existsSync(p)) sandbox.LoLChampionClasses.loadPrecomputed(JSON.parse(readFileSync(p, "utf8")));
  }
  return sandbox;
}

export function loadChampionData() {
  const champs = JSON.parse(readFileSync(join(root, "public/data/champions.json"), "utf8")).champions;
  const meta = JSON.parse(readFileSync(join(root, "public/data/tactics-meta.json"), "utf8")).champions;
  return { champs, meta };
}

/* ----------------------------- CSV ----------------------------- */

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

/** Lit le CSV : une entrée par partie complète (5v5), + les lignes joueur brutes. */
export function readGames(csvPath = CSV) {
  const text = readFileSync(csvPath, "utf8");
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const games = new Map();
  const picks = []; // {champion, position, win, patch, league, side}
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
        blueWin: null,
      };
      games.set(id, g);
    }
    const side = (f[col.side] || "").toLowerCase() === "blue" ? "blue" : "red";
    g[side][POSITION_SLOT[pos]] = f[col.champion];
    if (side === "blue") g.blueWin = f[col.result] === "1";
    picks.push({
      gameid: id,
      champion: f[col.champion],
      position: POSITION_SLOT[pos],
      win: f[col.result] === "1",
      patch: f[col.patch],
      league: f[col.league],
      side,
    });
  }
  const out = [];
  for (const g of games.values()) {
    if (g.blueWin == null) continue;
    if (Object.values(g.blue).filter(Boolean).length !== 5) continue;
    if (Object.values(g.red).filter(Boolean).length !== 5) continue;
    out.push(g);
  }
  const keep = new Set(out.map((g) => g.id));
  return { games: out, picks: picks.filter((p) => keep.has(p.gameid)) };
}

/* ------------------------- noms EN -> FR ------------------------- */

export function buildNameMap(champs) {
  const m = new Map();
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  for (const c of champs) for (const a of [c.name, c.nameEn, c.key, c.id]) if (a) m.set(norm(a), c.name);
  const extra = { nunuwillump: "Nunu et Willump", renata: "Renata Glasc", monkeyking: "Wukong" };
  for (const [k, v] of Object.entries(extra)) if (!m.has(k)) m.set(k, v);
  return { map: m, norm };
}

/* --------------------- neutralisations --------------------- */

const UNIFORM_RATES = Object.fromEntries(SLOTS.map((s) => [s, { games: 10000, rate: 20 }]));

/**
 * Renvoie {byName, meta} CLONÉS avec les champs demandés neutralisés.
 * mods : tiers | laneRates | family | colors | matchups
 */
export function makeDataset(champs, metaSrc, mods = {}) {
  const meta = JSON.parse(JSON.stringify(metaSrc));
  const byName = new Map();
  for (const src of champs) {
    const c = { ...src };
    if (mods.tiers) {
      c.tierMeta = "B";
      delete c.tierReason;
      delete c.tierAnalysis;
    }
    if (mods.laneRates) {
      c.laneRates = { ...UNIFORM_RATES };
      c.optimalSlots = [...SLOTS];
      c.flexRoles = [...SLOTS];
      delete c.mainRole;
    }
    if (mods.family) {
      c.championFamily = {};
      c.gameplayStyle = undefined;
      c.tacticTags = [];
    }
    if (mods.colors) c.colorIdentity = null;
    if (mods.matchups) {
      c.bestCounters = [];
      c.allCounters = [];
      c.bestPairings = [];
      c.allPairings = [];
      c.matchupProfile = undefined;
    }
    byName.set(c.name, c);
  }
  for (const k of Object.keys(meta)) {
    const m = meta[k];
    if (mods.laneRates) {
      m.optimalSlots = [...SLOTS];
      delete m.laneRates;
      delete m.mainRole;
      m.flexRoles = [...SLOTS];
    }
    if (mods.family) {
      m.compTypes = [];
      m.family = "";
      m.familyLabel = "";
      m.tags = [];
    }
    if (mods.colors) delete m.colorIdentity;
    if (mods.matchups) {
      m.bestCounters = [];
      m.bestPairings = [];
      m.worstMatchups = [];
    }
  }
  return { byName, meta };
}

/* ------------------------- stats ------------------------- */

/** IC 95 % Wilson pour une proportion. */
export function wilson(k, n) {
  if (!n) return [null, null];
  const z = 1.959964;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [+(((c - s) / d) * 100).toFixed(2), +(((c + s) / d) * 100).toFixed(2)];
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}

function ranks(v) {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(xs, ys) {
  return pearson(ranks(xs), ranks(ys));
}

/** IC 95 % de Fisher pour un r de Pearson. */
export function rCI(r, n) {
  if (r == null || n < 5) return [null, null];
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const se = 1 / Math.sqrt(n - 3);
  const lo = Math.tanh(z - 1.959964 * se);
  const hi = Math.tanh(z + 1.959964 * se);
  return [+lo.toFixed(3), +hi.toFixed(3)];
}

/** Test de McNemar apparié (b/c = désaccords) — renvoie chi2 et p approx. */
export function mcnemar(b, c) {
  if (b + c === 0) return { b, c, chi2: 0, p: 1 };
  const chi2 = (Math.abs(b - c) - 1) ** 2 / (b + c);
  // p bilatéral via approximation normale de sqrt(chi2)
  const zz = Math.sqrt(chi2);
  const p = 2 * (1 - normCdf(zz));
  return { b, c, chi2: +chi2.toFixed(3), p: +p.toFixed(4) };
}

function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}
