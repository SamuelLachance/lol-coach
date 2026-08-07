/** Constructions de features creuses a partir des parties. */

export function buildChampIndex(games) {
  const set = new Set();
  for (const g of games) for (const c of g.blue.concat(g.red)) set.add(c);
  const list = [...set].sort();
  return { list, idx: new Map(list.map((c, i) => [c, i])) };
}

export function buildTeamIndex(games) {
  const set = new Set();
  for (const g of games) {
    set.add(g.blueTeam);
    set.add(g.redTeam);
  }
  const list = [...set].sort();
  return { list, idx: new Map(list.map((t, i) => [t, i])) };
}

/** Cle canonique d'une paire non ordonnee d'indices. */
export function pairKey(a, b) {
  return a < b ? a * 1000 + b : b * 1000 + a;
}

function row(pairsIdx, pairsVal, y) {
  return { idx: Int32Array.from(pairsIdx), val: Float64Array.from(pairsVal), y };
}

/** Modele "indicatrices asymetriques" : champion c cote bleu (col c), cote rouge (col N+c). */
export function rowsChampAsym(games, ci) {
  const N = ci.list.length;
  return {
    nFeatures: 2 * N,
    rows: games.map((g) => {
      const idx = [];
      const val = [];
      for (const c of g.blue) {
        idx.push(ci.idx.get(c));
        val.push(1);
      }
      for (const c of g.red) {
        idx.push(N + ci.idx.get(c));
        val.push(1);
      }
      return row(idx, val, g.blueWin ? 1 : 0);
    }),
  };
}

/** Modele symetrique : x_c = 1(bleu) - 1(rouge). Le biais capte l'avantage de cote. */
export function rowsChampSym(games, ci) {
  const N = ci.list.length;
  return {
    nFeatures: N,
    rows: games.map((g) => {
      const idx = [];
      const val = [];
      for (const c of g.blue) {
        idx.push(ci.idx.get(c));
        val.push(1);
      }
      for (const c of g.red) {
        idx.push(ci.idx.get(c));
        val.push(-1);
      }
      return row(idx, val, g.blueWin ? 1 : 0);
    }),
  };
}

/**
 * Compte le support des paires (synergie intra-equipe, counter inter-equipe)
 * sur un sous-ensemble de parties.
 */
export function countPairs(games, ci) {
  const syn = new Map();
  const cnt = new Map();
  for (const g of games) {
    const B = g.blue.map((c) => ci.idx.get(c));
    const R = g.red.map((c) => ci.idx.get(c));
    for (const team of [B, R]) {
      for (let i = 0; i < 5; i += 1)
        for (let j = i + 1; j < 5; j += 1) {
          const k = pairKey(team[i], team[j]);
          syn.set(k, (syn.get(k) || 0) + 1);
        }
    }
    for (const a of B)
      for (const b of R) {
        const k = pairKey(a, b);
        cnt.set(k, (cnt.get(k) || 0) + 1);
      }
  }
  return { syn, cnt };
}

/**
 * Modele symetrique + paires. Les tables synMap / cntMap (cle -> colonne)
 * doivent etre construites UNIQUEMENT sur le pli d'entrainement.
 */
export function rowsChampPairs(games, ci, synMap, cntMap, offsets) {
  const { offSyn, offCnt, nFeatures } = offsets;
  return {
    nFeatures,
    rows: games.map((g) => {
      const idx = [];
      const val = [];
      const B = g.blue.map((c) => ci.idx.get(c));
      const R = g.red.map((c) => ci.idx.get(c));
      for (const c of B) {
        idx.push(c);
        val.push(1);
      }
      for (const c of R) {
        idx.push(c);
        val.push(-1);
      }
      // synergie : +1 si la paire est cote bleu, -1 cote rouge
      for (const [team, sign] of [[B, 1], [R, -1]]) {
        for (let i = 0; i < 5; i += 1)
          for (let j = i + 1; j < 5; j += 1) {
            const col = synMap.get(pairKey(team[i], team[j]));
            if (col === undefined) continue;
            idx.push(offSyn + col);
            val.push(sign);
          }
      }
      // counter : paire {a,b} avec a<b ; +1 si a est cote bleu, -1 si a est cote rouge
      for (const a of B)
        for (const b of R) {
          const col = cntMap.get(pairKey(a, b));
          if (col === undefined) continue;
          idx.push(offCnt + col);
          val.push(a < b ? 1 : -1);
        }
      return row(idx, val, g.blueWin ? 1 : 0);
    }),
  };
}

/** Indicatrices d'equipe : +1 equipe bleue, -1 equipe rouge. */
export function rowsTeamSym(games, ti) {
  return {
    nFeatures: ti.list.length,
    rows: games.map((g) => {
      const idx = [ti.idx.get(g.blueTeam), ti.idx.get(g.redTeam)];
      const val = [1, -1];
      return row(idx, val, g.blueWin ? 1 : 0);
    }),
  };
}

/** Equipes + champions (symetrique). */
export function rowsTeamChamp(games, ti, ci) {
  const T = ti.list.length;
  return {
    nFeatures: T + ci.list.length,
    rows: games.map((g) => {
      const idx = [ti.idx.get(g.blueTeam), ti.idx.get(g.redTeam)];
      const val = [1, -1];
      for (const c of g.blue) {
        idx.push(T + ci.idx.get(c));
        val.push(1);
      }
      for (const c of g.red) {
        idx.push(T + ci.idx.get(c));
        val.push(-1);
      }
      return row(idx, val, g.blueWin ? 1 : 0);
    }),
  };
}
