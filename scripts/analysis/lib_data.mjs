/**
 * Chargement du CSV Oracle's Elixir 2022 -> une ligne par partie.
 * Filtre identique a scripts/backtest_draft.mjs (10 champions valides, resultat connu).
 * Aucune dependance externe.
 */
import { readFileSync } from "fs";

export const DEFAULT_CSV =
  "C:/Users/Admin/Documents/lolcoach/model/2022_LoL_esports_match_data_from_OraclesElixir.csv";

export function parseCsvLine(line) {
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

const POSITION_SLOT = { top: 0, jng: 1, mid: 2, bot: 3, sup: 4 };

export function readGames(csvPath = DEFAULT_CSV) {
  const text = readFileSync(csvPath, "utf8");
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const games = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i]) continue;
    const f = parseCsvLine(lines[i]);
    const pos = (f[col.position] || "").toLowerCase();
    if (!(pos in POSITION_SLOT)) continue;
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
        blue: new Array(5).fill(null),
        red: new Array(5).fill(null),
        blueTeam: null,
        redTeam: null,
        blueWin: null,
      };
      games.set(id, g);
    }
    const side = (f[col.side] || "").toLowerCase() === "blue" ? "blue" : "red";
    g[side][POSITION_SLOT[pos]] = f[col.champion];
    if (side === "blue") {
      g.blueTeam = f[col.teamname];
      g.blueWin = f[col.result] === "1";
    } else {
      g.redTeam = f[col.teamname];
    }
  }
  const out = [];
  for (const g of games.values()) {
    if (g.blueWin == null) continue;
    if (g.blue.some((x) => !x) || g.red.some((x) => !x)) continue;
    out.push(g);
  }
  // tri temporel stable (utile pour le split chronologique)
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  return out;
}

/** Hash deterministe d'une chaine -> entier positif (FNV-1a 32 bits). */
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function foldOf(gameid, k) {
  return hashStr(gameid) % k;
}

/** Intervalle de Wilson 95 % pour une proportion. */
export function wilson95(succ, n) {
  if (!n) return [0, 0];
  const z = 1.959964;
  const p = succ / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - s) / d, (c + s) / d];
}
