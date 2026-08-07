#!/usr/bin/env node
/**
 * AXE 2 — Q3 & Q5 : ampleur du décalage entre les données 2026 du site et la méta 2022.
 * - Q3 : winrate réel 2022 par champion vs tierMeta 2026 (corrélations).
 * - Q5 : champions absents de 2022, champions 2022 absents du roster, dérive de rôle,
 *        dérive de popularité (pickrate 2022 vs tier 2026).
 * Usage : node scripts/analysis/meta_drift.mjs [--json out.json]
 */
import { writeFileSync } from "fs";
import { loadChampionData, readGames, buildNameMap, pearson, spearman, rCI, wilson, TIER_PTS, SLOTS, CSV } from "./lib.mjs";

function arg(f, d = null) {
  const i = process.argv.indexOf(f);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
}

const { champs } = loadChampionData();
const { map: nameMap, norm } = buildNameMap(champs);
const { games, picks } = readGames(CSV);

const byName = new Map(champs.map((c) => [c.name, c]));

/* ---------- agrégation des picks 2022 ---------- */
const stat = new Map(); // nomFR -> {picks, wins, byPos:{}}
const unmapped = new Map();
for (const p of picks) {
  const fr = nameMap.get(norm(p.champion));
  if (!fr) {
    unmapped.set(p.champion, (unmapped.get(p.champion) || 0) + 1);
    continue;
  }
  let s = stat.get(fr);
  if (!s) {
    s = { name: fr, picks: 0, wins: 0, byPos: {} };
    stat.set(fr, s);
  }
  s.picks += 1;
  if (p.win) s.wins += 1;
  s.byPos[p.position] = (s.byPos[p.position] || 0) + 1;
}

const totalPicks = picks.length;
const totalGames = games.length;

/* ---------- Q5a : couverture roster ---------- */
const played2022 = new Set(stat.keys());
const absent2022 = champs.filter((c) => !played2022.has(c.name));
const rare2022 = [...stat.values()].filter((s) => s.picks < 20);

/* ---------- Q3 : winrate 2022 vs tier 2026 ---------- */
function tierPts(n) {
  return TIER_PTS[byName.get(n)?.tierMeta || "C"] ?? 10;
}

function corrTable(minPicks) {
  const rowsAll = [...stat.values()].filter((s) => s.picks >= minPicks);
  const xs = rowsAll.map((s) => tierPts(s.name));
  const wr = rowsAll.map((s) => (s.wins / s.picks) * 100);
  const pr = rowsAll.map((s) => (s.picks / totalGames) * 100); // présence % des parties (2 équipes)
  return {
    minPicks,
    nChampions: rowsAll.length,
    // Corrélation tier 2026 <-> winrate 2022
    winrate: {
      pearson: +(pearson(xs, wr) ?? 0).toFixed(3),
      ic95: rCI(pearson(xs, wr), rowsAll.length),
      spearman: +(spearman(xs, wr) ?? 0).toFixed(3),
    },
    // Corrélation tier 2026 <-> popularité 2022 (mesure directe de la dérive de méta)
    pickrate: {
      pearson: +(pearson(xs, pr) ?? 0).toFixed(3),
      ic95: rCI(pearson(xs, pr), rowsAll.length),
      spearman: +(spearman(xs, pr) ?? 0).toFixed(3),
    },
  };
}

// winrate moyen (pondéré) par tier 2026
const parTier = {};
for (const s of stat.values()) {
  const t = byName.get(s.name)?.tierMeta || "?";
  const b = (parTier[t] = parTier[t] || { tier: t, champions: 0, picks: 0, wins: 0 });
  b.champions += 1;
  b.picks += s.picks;
  b.wins += s.wins;
}
// tiers sans aucun pick 2022
for (const c of absent2022) {
  const t = c.tierMeta || "?";
  const b = (parTier[t] = parTier[t] || { tier: t, champions: 0, picks: 0, wins: 0 });
  b.champions += 1;
}
const tierRows = ["S", "A", "B", "C", "D"]
  .filter((t) => parTier[t])
  .map((t) => {
    const b = parTier[t];
    return {
      tier: t,
      championsRoster2026: champs.filter((c) => c.tierMeta === t).length,
      picks2022: b.picks,
      presenceMoyennePctParties: +((b.picks / (totalGames * 10)) * 100).toFixed(2),
      winrate2022Pct: b.picks ? +((b.wins / b.picks) * 100).toFixed(2) : null,
      ic95: b.picks ? wilson(b.wins, b.picks) : null,
    };
  });

/* ---------- Q5b : dérive de rôle ---------- */
function siteMainSlot(c) {
  const r = c.laneRates;
  if (r) {
    let best = null;
    let bv = -1;
    for (const s of SLOTS) {
      const v = Number(r[s]?.rate) || 0;
      if (v > bv) {
        bv = v;
        best = s;
      }
    }
    return best;
  }
  return c.mainRole || c.optimalSlots?.[0] || null;
}
function siteViableSlots(c) {
  const r = c.laneRates;
  if (r) return SLOTS.filter((s) => (Number(r[s]?.rate) || 0) >= 10);
  return c.optimalSlots || [];
}

const roleDrift = [];
for (const s of stat.values()) {
  if (s.picks < 30) continue;
  const c = byName.get(s.name);
  const pos2022 = Object.entries(s.byPos).sort((a, b) => b[1] - a[1]);
  const main2022 = pos2022[0][0];
  const main2026 = siteMainSlot(c);
  const viable = siteViableSlots(c);
  const sharePlayedInViable =
    Object.entries(s.byPos).reduce((a, [k, v]) => a + (viable.includes(k) ? v : 0), 0) / s.picks;
  if (main2022 !== main2026 || sharePlayedInViable < 0.8) {
    roleDrift.push({
      champion: s.name,
      picks2022: s.picks,
      roleMajoritaire2022: main2022,
      roleMajoritaire2026: main2026,
      slotsViables2026: viable,
      pctPicks2022DansSlotsViables2026: +(sharePlayedInViable * 100).toFixed(1),
    });
  }
}
roleDrift.sort((a, b) => b.picks2022 - a.picks2022);

// Combien de picks 2022, au total, tombent hors des slots jugés viables en 2026 ?
let picksHorsViable = 0;
for (const s of stat.values()) {
  const c = byName.get(s.name);
  if (!c) continue;
  const viable = siteViableSlots(c);
  for (const [pos, n] of Object.entries(s.byPos)) if (!viable.includes(pos)) picksHorsViable += n;
}

/* ---------- Q5c : discordance popularité ---------- */
const withPicks = [...stat.values()].sort((a, b) => b.picks - a.picks);
const top30_2022 = withPicks.slice(0, 30).map((s) => ({
  champion: s.name,
  picks2022: s.picks,
  presencePct: +((s.picks / (totalGames * 2)) * 100).toFixed(1),
  winrate2022: +((s.wins / s.picks) * 100).toFixed(1),
  tier2026: byName.get(s.name)?.tierMeta || "?",
}));
const tiersDuTop30 = {};
for (const r of top30_2022) tiersDuTop30[r.tier2026] = (tiersDuTop30[r.tier2026] || 0) + 1;

const sTier2026 = champs.filter((c) => c.tierMeta === "S");
const sTierIn2022 = sTier2026.map((c) => {
  const s = stat.get(c.name);
  return {
    champion: c.name,
    tier2026: "S",
    picks2022: s?.picks || 0,
    presencePct2022: +(((s?.picks || 0) / (totalGames * 2)) * 100).toFixed(1),
    winrate2022: s && s.picks >= 20 ? +((s.wins / s.picks) * 100).toFixed(1) : null,
  };
}).sort((a, b) => b.picks2022 - a.picks2022);

const out = {
  dataset: { parties: totalGames, picksJoueurs: totalPicks, championsDistincts2022: stat.size },
  championsNonMappes: [...unmapped.entries()].sort((a, b) => b[1] - a[1]),
  Q5_couvertureRoster: {
    rosterSite2026: champs.length,
    joues2022: stat.size,
    absentsDe2022: absent2022.map((c) => ({ champion: c.name, nameEn: c.nameEn, tier2026: c.tierMeta })),
    nbAbsentsDe2022: absent2022.length,
    nbMoinsDe20Picks2022: rare2022.length,
    picks2022HorsSlotsViables2026: picksHorsViable,
    pctPicks2022HorsSlotsViables2026: +((picksHorsViable / totalPicks) * 100).toFixed(2),
  },
  Q3_correlationTier2026: [corrTable(20), corrTable(50), corrTable(200)],
  Q3_parTier: tierRows,
  Q5_deriveDeRole: { nbChampions: roleDrift.length, detail: roleDrift.slice(0, 40) },
  Q5_top30Populaires2022: top30_2022,
  Q5_repartitionTiers2026DuTop30_2022: tiersDuTop30,
  Q5_tierS2026DansLa2022: sTierIn2022,
};

const o = arg("--json");
if (o) writeFileSync(o, JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));
