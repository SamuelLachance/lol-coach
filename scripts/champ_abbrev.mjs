/**
 * Champion abbreviation resolver — CSV short names → canonical champions.json names.
 * Built from champions.json keys + curated CSV aliases + prefix/fuzzy fallback.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function normKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Curated CSV / esports abbreviations not inferable from normKey alone. */
export const MANUAL_ALIASES = {
  xin: "Xin Zhao",
  xinzhao: "Xin Zhao",
  blitz: "Blitzcrank",
  mundo: "Dr. Mundo",
  drmundo: "Dr. Mundo",
  cassio: "Cassiopeia",
  cassiopeia: "Cassiopeia",
  shyv: "Shyvana",
  shyvana: "Shyvana",
  morde: "Mordekaiser",
  mordekaiser: "Mordekaiser",
  heim: "Heimerdinger",
  heimerdinger: "Heimerdinger",
  malz: "Malzahar",
  malzahar: "Malzahar",
  aurelion: "Aurelion Sol",
  aurelionsol: "Aurelion Sol",
  nunu: "Nunu et Willump",
  nunuwillump: "Nunu et Willump",
  twisted: "Twisted Fate",
  twistedfate: "Twisted Fate",
  tahm: "Tahm Kench",
  tahmkench: "Tahm Kench",
  leesin: "Lee Sin",
  jarvan: "Jarvan IV",
  jarvaniv: "Jarvan IV",
  missfortune: "Miss Fortune",
  kogmaw: "Kog'Maw",
  chogath: "Cho'Gath",
  velkoz: "Vel'Koz",
  belveth: "Bel'Veth",
  renata: "Renata Glasc",
  renataglasc: "Renata Glasc",
  monkeyking: "Wukong",
  seraphine: "Séraphine",
  fiddle: "Fiddlesticks",
  masteryi: "Master Yi",
  ksante: "K'Sante",
  khazix: "Kha'Zix",
  reksai: "Rek'Sai",
  mister: "Fiddlesticks",
  mf: "Miss Fortune",
  tf: "Twisted Fate",
  gp: "Gangplank",
  j4: "Jarvan IV",
  asol: "Aurelion Sol",
  kog: "Kog'Maw",
  cho: "Cho'Gath",
  vel: "Vel'Koz",
  bel: "Bel'Veth",
  yi: "Master Yi",
};

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

/**
 * @param {object[]} champs — champions.json champions array
 * @returns {{ resolve: Function, unknown: Set, abbrevMap: Map, mapSize: number }}
 */
export function buildChampResolver(champs, extraAliases = {}) {
  const byNorm = new Map();
  const canonical = new Set();
  const abbrevMap = new Map();

  for (const c of champs) {
    canonical.add(c.name);
    const keys = [c.name, c.nameEn, c.key, c.id].filter(Boolean);
    for (const k of keys) {
      byNorm.set(normKey(k), c.name);
      abbrevMap.set(normKey(k), c.name);
    }
    // First token prefix (Lee Sin → lee)
    const first = normKey(String(c.name).split(/\s+/)[0]);
    if (first.length >= 3 && !abbrevMap.has(first)) abbrevMap.set(first, c.name);
    // Compact no-space form
    const compact = normKey(c.name);
    if (!abbrevMap.has(compact)) abbrevMap.set(compact, c.name);
  }

  for (const [alias, target] of Object.entries({ ...MANUAL_ALIASES, ...extraAliases })) {
    if (target) {
      byNorm.set(alias, target);
      abbrevMap.set(alias, target);
    }
  }

  // Prefix index: normKey → [canonical names] for unique prefix resolution
  const prefixBuckets = new Map();
  for (const c of champs) {
    const nk = normKey(c.name);
    for (let len = 3; len <= Math.min(6, nk.length); len++) {
      const p = nk.slice(0, len);
      if (!prefixBuckets.has(p)) prefixBuckets.set(p, new Set());
      prefixBuckets.get(p).add(c.name);
    }
  }
  for (const [p, names] of prefixBuckets) {
    if (names.size === 1) {
      const name = [...names][0];
      if (!abbrevMap.has(p)) abbrevMap.set(p, name);
      if (!byNorm.has(p)) byNorm.set(p, name);
    }
  }

  const unknown = new Set();
  const fuzzyCache = new Map();

  function fuzzyResolve(key) {
    if (fuzzyCache.has(key)) return fuzzyCache.get(key);
    let best = null;
    let bestDist = Infinity;
    for (const c of champs) {
      const nk = normKey(c.name);
      const d = levenshtein(key, nk);
      const threshold = Math.max(2, Math.floor(nk.length * 0.28));
      if (d <= threshold && d < bestDist) {
        bestDist = d;
        best = c.name;
      }
    }
    fuzzyCache.set(key, best);
    return best;
  }

  function resolve(raw) {
    if (!raw || !String(raw).trim()) return null;
    const trimmed = String(raw).trim();
    if (canonical.has(trimmed)) return trimmed;
    const key = normKey(trimmed);
    if (MANUAL_ALIASES[key]) return MANUAL_ALIASES[key];
    if (byNorm.has(key)) return byNorm.get(key);
    if (abbrevMap.has(key)) return abbrevMap.get(key);
    const fuzzy = fuzzyResolve(key);
    if (fuzzy) {
      abbrevMap.set(key, fuzzy);
      return fuzzy;
    }
    unknown.add(trimmed);
    return null;
  }

  return { resolve, unknown, abbrevMap, mapSize: abbrevMap.size };
}

export function loadChampResolver(championsPath = join(root, "public/data/champions.json")) {
  const champs = JSON.parse(readFileSync(championsPath, "utf8")).champions;
  return buildChampResolver(champs);
}
