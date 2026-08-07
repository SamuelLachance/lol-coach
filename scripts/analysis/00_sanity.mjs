/** Verification du jeu de donnees : volume, prevalence bleu, couverture champions. */
import { readGames, foldOf } from "./lib_data.mjs";

const games = readGames();
const blueWins = games.filter((g) => g.blueWin).length;
const champs = new Map();
for (const g of games) {
  for (const c of g.blue.concat(g.red)) champs.set(c, (champs.get(c) || 0) + 1);
}
const counts = [...champs.values()].sort((a, b) => a - b);
const folds = new Array(5).fill(0);
for (const g of games) folds[foldOf(g.id, 5)] += 1;

const teams = new Map();
for (const g of games) {
  teams.set(g.blueTeam, (teams.get(g.blueTeam) || 0) + 1);
  teams.set(g.redTeam, (teams.get(g.redTeam) || 0) + 1);
}

console.log(JSON.stringify({
  parties: games.length,
  bleuGagne: blueWins,
  prevalenceBleu: +(blueWins / games.length).toFixed(5),
  championsDistincts: champs.size,
  picksMin: counts[0],
  picksMedian: counts[Math.floor(counts.length / 2)],
  picksMax: counts[counts.length - 1],
  championsSous30Picks: counts.filter((c) => c < 30).length,
  equipesDistinctes: teams.size,
  parPli: folds,
  ligues: new Set(games.map((g) => g.league)).size,
  patches: new Set(games.map((g) => g.patch)).size,
  dateMin: games[0].date,
  dateMax: games[games.length - 1].date,
}, null, 2));
