/**
 * Magic: The Gathering — color pie (WUBRG)
 * Roue : W → U → B → R → G → W
 * Alliées = adjacentes · Ennemies = non-adjacentes (2 crans)
 * Réf. : docs/mtg-color-pie.md
 */
(function (global) {
  const WHEEL = ["W", "U", "B", "R", "G"];

  const LABELS = {
    W: "Blanc", U: "Bleu", B: "Noir", R: "Rouge", G: "Vert",
  };

  const HEX = {
    W: "#f5f0dc", U: "#4a9fd4", B: "#6b6b7a", R: "#e05238", G: "#3d9e5a",
  };

  /** 5 paires alliées (adjacentes sur la roue) — guildes Ravnica */
  const ALLIED_PAIRS = [
    ["W", "U"], ["U", "B"], ["B", "R"], ["R", "G"], ["G", "W"],
  ];

  /** 5 paires ennemies (non-adjacentes) — collèges Strixhaven */
  const ENEMY_PAIRS = [
    ["W", "B"], ["W", "R"], ["U", "R"], ["U", "G"], ["B", "G"],
  ];

  const GUILDS = {
    WU: { name: "Azorius", colors: ["W", "U"], kind: "allied" },
    UB: { name: "Dimir", colors: ["U", "B"], kind: "allied" },
    BR: { name: "Rakdos", colors: ["B", "R"], kind: "allied" },
    RG: { name: "Gruul", colors: ["R", "G"], kind: "allied" },
    GW: { name: "Selesnya", colors: ["G", "W"], kind: "allied" },
  };

  const ENEMY_DUAL = {
    WB: { name: "Silverquill", colors: ["W", "B"], kind: "enemy" },
    WR: { name: "Boros", colors: ["W", "R"], kind: "enemy" },
    UR: { name: "Izzet", colors: ["U", "R"], kind: "enemy" },
    BG: { name: "Golgari", colors: ["B", "G"], kind: "enemy" },
    GU: { name: "Simic", colors: ["G", "U"], kind: "enemy" },
  };

  const SHARDS = {
    Bant: { colors: ["G", "W", "U"], kind: "shard" },
    Esper: { colors: ["W", "U", "B"], kind: "shard" },
    Grixis: { colors: ["U", "B", "R"], kind: "shard" },
    Jund: { colors: ["B", "R", "G"], kind: "shard" },
    Naya: { colors: ["R", "G", "W"], kind: "shard" },
  };

  const WEDGES = {
    Abzan: { colors: ["W", "B", "G"], kind: "wedge" },
    Sultai: { colors: ["B", "G", "U"], kind: "wedge" },
    Temur: { colors: ["G", "U", "R"], kind: "wedge" },
    Jeskai: { colors: ["U", "R", "W"], kind: "wedge" },
    Mardu: { colors: ["R", "W", "B"], kind: "wedge" },
  };

  function pairKey(a, b) {
    return [a, b].sort().join("");
  }

  const ALLIED_SET = new Set(ALLIED_PAIRS.map(([a, b]) => pairKey(a, b)));
  const ENEMY_SET = new Set(ENEMY_PAIRS.map(([a, b]) => pairKey(a, b)));

  function wheelIndex(c) {
    return WHEEL.indexOf(c);
  }

  function isAdjacent(a, b) {
    const i = wheelIndex(a);
    const j = wheelIndex(b);
    if (i < 0 || j < 0) return false;
    const d = Math.abs(i - j);
    return d === 1 || d === 4;
  }

  function isAllied(a, b) {
    return ALLIED_SET.has(pairKey(a, b));
  }

  function isEnemy(a, b) {
    return ENEMY_SET.has(pairKey(a, b));
  }

  function colorVectorFrom(ci) {
    if (!ci) return WHEEL.map(() => 0);
    return WHEEL.map((k) => (ci[k] || 0) / 24);
  }

  function sumVectors(vectors) {
    const out = WHEEL.map(() => 0);
    for (const v of vectors) {
      if (!v) continue;
      for (let i = 0; i < 5; i += 1) out[i] += v[i] || 0;
    }
    return out;
  }

  function dominantFromSum(sum, threshold = 0.35) {
    return WHEEL.map((c, i) => [c, sum[i]]).filter(([, v]) => v >= threshold).map(([c]) => c);
  }

  function activeColorsFromSum(sum, threshold = 0.12) {
    return WHEEL.filter((c, i) => sum[i] >= threshold);
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    return b.every((x) => s.has(x));
  }

  function detectCombination(colorCodes) {
    const sorted = [...colorCodes].sort((a, b) => wheelIndex(a) - wheelIndex(b));
    const key = sorted.join("");
    if (colorCodes.length === 0) return { type: "none", name: "", colors: [] };
    if (colorCodes.length === 1) {
      return { type: "mono", name: LABELS[colorCodes[0]], colors: colorCodes, key };
    }
    if (colorCodes.length === 2) {
      const pk = pairKey(colorCodes[0], colorCodes[1]);
      if (GUILDS[pk]) return { type: "guild", name: GUILDS[pk].name, colors: colorCodes, key: pk, kind: "allied" };
      if (ENEMY_DUAL[pk]) return { type: "enemy_dual", name: ENEMY_DUAL[pk].name, colors: colorCodes, key: pk, kind: "enemy" };
      return { type: "dual", name: pk, colors: colorCodes, key: pk };
    }
    if (colorCodes.length === 3) {
      for (const [name, def] of Object.entries(SHARDS)) {
        if (sameSet(colorCodes, def.colors)) return { type: "shard", name, colors: colorCodes, key: name, kind: "shard" };
      }
      for (const [name, def] of Object.entries(WEDGES)) {
        if (sameSet(colorCodes, def.colors)) return { type: "wedge", name, colors: colorCodes, key: name, kind: "wedge" };
      }
      return { type: "tricolor", name: key, colors: colorCodes, key };
    }
    if (colorCodes.length === 4) return { type: "four", name: key, colors: colorCodes, key };
    if (colorCodes.length >= 5) return { type: "five", name: "WUBRG", colors: WHEEL.slice(), key: "WUBRG" };
    return { type: "multicolor", name: key, colors: colorCodes, key };
  }

  function combinationScore(combo) {
    switch (combo.type) {
      case "mono": return 32;
      case "guild": return 48;
      case "enemy_dual": return 40;
      case "shard": return 58;
      case "wedge": return 52;
      case "dual": return 30;
      case "tricolor": return 24;
      case "four": return 20;
      case "five": return 14;
      default: return 8;
    }
  }

  /** Closest named MTG identity (guild / shard / wedge / enemy pair) for a spread team. */
  function bestFitCombination(active, dominant, teamSum) {
    let codes = (dominant?.length >= 2 ? dominant : active) || [];
    if (codes.length >= 4 && dominant?.length >= 2) codes = dominant;
    if (codes.length >= 5 && teamSum?.length === 5) {
      const ranked = WHEEL.map((c, i) => [c, teamSum[i] || 0]).sort((a, b) => b[1] - a[1]);
      codes = ranked.slice(0, 3).map(([c]) => c);
    }
    const direct = detectCombination(codes);
    if (["mono", "guild", "enemy_dual", "shard", "wedge"].includes(direct.type)) {
      return direct;
    }

    let best = direct;
    let bestScore = combinationScore(direct);
    const pools = [
      ...Object.entries(GUILDS).map(([key, def]) => ({ type: "guild", name: def.name, colors: def.colors, key })),
      ...Object.entries(ENEMY_DUAL).map(([key, def]) => ({ type: "enemy_dual", name: def.name, colors: def.colors, key })),
      ...Object.entries(SHARDS).map(([name, def]) => ({ type: "shard", name, colors: def.colors, key: name })),
      ...Object.entries(WEDGES).map(([name, def]) => ({ type: "wedge", name, colors: def.colors, key: name })),
    ];

    for (const cand of pools) {
      const overlap = cand.colors.filter((c) => codes.includes(c)).length;
      if (overlap < 2) continue;
      const coverage = overlap / cand.colors.length;
      if (coverage < 0.55) continue;
      const fitScore = combinationScore(cand) + overlap * 10 + Math.round(coverage * 18);
      if (fitScore > bestScore) {
        best = cand;
        bestScore = fitScore;
      }
    }
    return best;
  }

  function pairRelationScore(d1, d2) {
    if (!d1?.length || !d2?.length) return 0;
    let s = 0;
    for (const x of d1) {
      for (const y of d2) {
        if (x === y) s += 10;
        else if (isAllied(x, y)) s += 16;
        else if (isEnemy(x, y)) s -= 24;
      }
    }
    return s;
  }

  function identityAlignBonus(champIdentity, teamCombo) {
    if (!champIdentity || !teamCombo?.colors?.length) return 0;
    const id = champIdentity.toUpperCase().replace(/[^WUBRG]/g, "");
    if (!id) return 0;
    const champColors = [...new Set(id.split(""))].filter((c) => WHEEL.includes(c));
    const champCombo = detectCombination(champColors);
    if (teamCombo.type === "guild" && champCombo.key === teamCombo.key) return 38;
    if (teamCombo.type === "shard" && champColors.every((c) => teamCombo.colors.includes(c))) return 32;
    if (teamCombo.type === "wedge" && champColors.every((c) => teamCombo.colors.includes(c))) return 28;
    if (teamCombo.type === "mono" && champColors.length === 1 && champColors[0] === teamCombo.colors[0]) return 26;
    let overlap = 0;
    for (const c of champColors) if (teamCombo.colors.includes(c)) overlap += 1;
    return overlap * 12;
  }

  function colorCoherence(vectors) {
    if (!vectors?.length) {
      return { score: 0, dominant: [], conflicts: [], identity: "", combination: null, teamSum: null };
    }
    const cis = vectors.map((v) => v.colors).filter(Boolean);
    if (!cis.length) {
      return { score: 0, dominant: [], conflicts: [], identity: "", combination: null, teamSum: null };
    }

    const teamSum = sumVectors(cis.map((c) => colorVectorFrom(c)));
    const dominant = dominantFromSum(teamSum);
    const active = activeColorsFromSum(teamSum);
    const combination = bestFitCombination(active, dominant, teamSum);
    let score = combinationScore(combination);

    if (combination.type === "mono" && vectors.length >= 2) score += vectors.length * 10;
    if (combination.type === "guild" && vectors.length >= 3) score += 28;
    if (combination.type === "enemy_dual" && vectors.length >= 3) score += 24;
    if (combination.type === "shard" && vectors.length >= 4) score += 38;
    if (combination.type === "wedge" && vectors.length >= 4) score += 32;
    if (combination.type === "five" && vectors.length >= 4) score += 8;
    if (active.length >= 4 && ["guild", "enemy_dual", "shard", "wedge"].includes(combination.type)) score += 22;

    const conflicts = [];
    if (active.length >= 4 && ["dual", "tricolor", "multicolor"].includes(combination.type)) {
      score -= 10;
      conflicts.push("Identité couleur diffuse — clarifie le plan");
    }

    for (let i = 0; i < cis.length; i += 1) {
      for (let j = i + 1; j < cis.length; j += 1) {
        const d1 = cis[i].dominant || dominantFromSum(colorVectorFrom(cis[i]));
        const d2 = cis[j].dominant || dominantFromSum(colorVectorFrom(cis[j]));
        score += Math.round(pairRelationScore(d1, d2) * 0.85);
        for (const x of d1) {
          for (const y of d2) {
            if (isEnemy(x, y)) {
              if (combination.type === "wedge" || combination.type === "enemy_dual") {
                score += 4;
              } else {
                conflicts.push(`${LABELS[x]} vs ${LABELS[y]} (${vectors[i].name}/${vectors[j].name})`);
                score -= 5;
              }
            }
          }
        }
        if (cis[i].identity && cis[j].identity) {
          const ci = detectCombination([...new Set(`${cis[i].identity}${cis[j].identity}`.split(""))].filter((c) => WHEEL.includes(c)));
          if (ci.type === "guild") score += 10;
          if (ci.type === "enemy_dual") score += 8;
          if (ci.type === "shard" || ci.type === "wedge") score += 6;
        }
      }
    }

    return {
      score: Math.round(score),
      dominant,
      conflicts: [...new Set(conflicts)].slice(0, 4),
      identity: combination.name || dominant.join("") || active.join("") || "",
      combination,
      teamSum,
      active,
    };
  }

  function colorPickBonus(champColors, teamColors, teamSum) {
    if (!champColors || !teamColors?.length) return { score: 0, label: null };
    let s = 0;
    const dom = champColors.dominant || [];
    const sum = teamSum || sumVectors(teamColors.map((c) => colorVectorFrom(c)));
    const active = activeColorsFromSum(sum);
    const teamCombo = detectCombination(active.length ? active : dominantFromSum(sum));

    for (const tc of teamColors) {
      s += pairRelationScore(dom, tc.dominant || []);
      const dot = colorVectorFrom(champColors).reduce(
        (acc, v, i) => acc + v * (colorVectorFrom(tc)[i] || 0),
        0
      );
      s += Math.round(dot * 52);
    }

    s += identityAlignBonus(champColors.identity, teamCombo);

    const champActive = detectCombination(
      dom.length ? dom : [...new Set((champColors.identity || "").split(""))].filter((c) => WHEEL.includes(c))
    );
    let label = null;
    if (champActive.type === "guild") label = `Guild ${champActive.name}`;
    else if (teamCombo.type === "shard" && identityAlignBonus(champColors.identity, teamCombo) >= 28) {
      label = `Shard ${teamCombo.name}`;
    } else if (teamCombo.type === "wedge" && identityAlignBonus(champColors.identity, teamCombo) >= 24) {
      label = `Wedge ${teamCombo.name}`;
    } else if (teamCombo.type === "guild") label = `Vers ${teamCombo.name}`;

    return { score: Math.round(s), label, teamCombo, champCombo: champActive };
  }

  /** Philosophies WUBRG — Rosewater "X through Y" */
  const PHILOSOPHY = {
    W: { goal: "Paix", means: "Structure", lol: "peel, frontline, protection" },
    U: { goal: "Perfection", means: "Connaissance", lol: "contrôle, setup, tempo" },
    B: { goal: "Pouvoir", means: "Opportunité", lol: "pick, snowball, finisher" },
    R: { goal: "Liberté", means: "Action", lol: "aggro, tempo, all-in" },
    G: { goal: "Croissance", means: "Acceptation", lol: "scaling, front, nature" },
  };

  function colorWeight(ci, code) {
    if (!ci) return 0;
    return Number(ci[code]) || 0;
  }

  /** Team vectors for Who's The Beatdown? (Mike Flores / Dojo) */
  function teamMetrics(vs) {
    if (!vs?.length) return { damage: 0, removal: 0, control: 0 };
    const dmg = vs.reduce((s, v) => {
      let x = (v.early || 0) * 28 + (v.burst || 0) * 22;
      if (v.tags?.has?.("dive")) x += 18;
      if (v.tags?.has?.("marksman") && (v.carry || 0) > 0.5) x += 14;
      x += colorWeight(v.colors, "R") * 0.9;
      return s + x;
    }, 0);
    const removal = vs.reduce((s, v) => {
      let x = (v.spellSetup || 0) * 18;
      if (v.tags?.has?.("assassin")) x += 16;
      x += colorWeight(v.colors, "B") * 0.8;
      return s + x;
    }, 0);
    const control = vs.reduce((s, v) => {
      let x = (v.peel || 0) * 22 + (v.scaling || 0) * 16;
      if (v.tags?.has?.("poke")) x += 12;
      x += colorWeight(v.colors, "U") * 0.75 + colorWeight(v.colors, "W") * 0.6;
      return s + x;
    }, 0);
    return { damage: Math.round(dmg), removal: Math.round(removal), control: Math.round(control) };
  }

  function inferBeatdownRole(metrics) {
    const beat = metrics.damage;
    const ctrl = metrics.removal + Math.round(metrics.control * 0.85);
    if (ctrl > beat + 18) return "control";
    if (beat > ctrl + 12) return "beatdown";
    return beat >= ctrl ? "beatdown" : "control";
  }

  /**
   * Who's the beatdown? — damage → beatdown, removal/control → control.
   * Misassignment of role in similar comps = predicted loss.
   */
  function analyzeBeatdownMatchup(ourVs, enemyVs) {
    const our = teamMetrics(ourVs);
    const enemy = teamMetrics(enemyVs);
    let ourRole = inferBeatdownRole(our);
    let enemyRole = inferBeatdownRole(enemy);

    if (enemy.damage > our.damage + 22 && ourRole === "beatdown") ourRole = "control";
    if (our.damage > enemy.damage + 22 && enemyRole === "beatdown") enemyRole = "control";

    let alignmentBonus = 0;
    const hints = [];
    if (ourRole === "control" && our.removal + our.control < enemy.damage * 0.45) {
      alignmentBonus -= 16;
      hints.push("Control sans removal — race perdue");
    } else if (ourRole === "beatdown" && our.damage < enemy.damage - 8) {
      alignmentBonus -= 14;
      hints.push("Beatdown plus lent que l'adversaire");
    } else if (ourRole === "control" && our.removal + our.control >= enemy.damage * 0.5) {
      alignmentBonus += 16;
      hints.push("Rôle control viable vs aggro");
    } else if (ourRole === "beatdown" && our.damage >= enemy.damage) {
      alignmentBonus += 14;
      hints.push("Rôle beatdown viable");
    }

    return {
      ourRole,
      enemyRole,
      our,
      enemy,
      alignmentBonus,
      hint: hints[0] || (ourRole === "beatdown" ? "Jouer la race" : "Stabiliser puis outscale"),
    };
  }

  function pickBeatdownFit(champV, allyVs, enemyVs) {
    if (!champV || !enemyVs?.length) return { score: 0, reasons: [], needRole: null };
    const before = teamMetrics(allyVs);
    const enemy = teamMetrics(enemyVs);
    const needRole =
      enemy.damage > before.damage + 15
        ? "control"
        : before.damage + 8 < enemy.damage
          ? "control"
          : inferBeatdownRole(before);

    const champAggro =
      (champV.early || 0) * 30 + (champV.burst || 0) * 18 + colorWeight(champV.colors, "R");
    const champCtrl =
      (champV.peel || 0) * 25 + colorWeight(champV.colors, "W") + colorWeight(champV.colors, "U");

    let score = 0;
    const reasons = [];
    if (needRole === "control") {
      if (champAggro > 28 && champCtrl < 12) {
        score -= 22;
        reasons.push("Mauvais rôle — aggro vs comp rapide");
      }
      if (champCtrl >= 14) {
        score += 16;
        reasons.push("Pick control (peel/setup)");
      }
      if (colorWeight(champV.colors, "B") >= 6) {
        score += 8;
        reasons.push("Removal/pick noir");
      }
    } else {
      if (champAggro >= 16) {
        score += 14;
        reasons.push("Pick beatdown (tempo)");
      }
      if (champCtrl > 22 && champAggro < 10) {
        score -= 12;
        reasons.push("Trop lent pour la race");
      }
    }
    return { score, reasons, needRole };
  }

  /** Enemy color hosers — tension W/B, W/R, U/R, U/G, B/G */
  function colorMatchupPenalty(champColors, enemyTeamSum) {
    if (!champColors || !enemyTeamSum) return { score: 0, reasons: [] };
    const enemyDom = dominantFromSum(enemyTeamSum, 0.28);
    const champDom = champColors.dominant || dominantFromSum(colorVectorFrom(champColors), 0.22);
    let score = 0;
    const reasons = [];
    for (const e of enemyDom) {
      for (const c of champDom) {
        if (isEnemy(e, c)) {
          score -= 14;
          reasons.push(`Hoser ${LABELS[e]} vs ${LABELS[c]}`);
        } else if (isAllied(e, c)) {
          score += 6;
        }
      }
    }
    return { score, reasons: [...new Set(reasons)].slice(0, 2) };
  }

  function teamColorSummary(names, byName, meta) {
    const vectors = (names || [])
      .map((n) => {
        const champ = byName?.get?.(n) || meta?.[n] || { name: n };
        const ci = champ.colorIdentity || meta?.[n]?.colorIdentity;
        return ci ? { name: n, colors: ci } : null;
      })
      .filter(Boolean);

    const coherence = colorCoherence(vectors);
    const bars = WHEEL.map((c, i) => ({
      code: c,
      label: LABELS[c],
      hex: HEX[c],
      value: Math.round((coherence.teamSum?.[i] || 0) * 24),
    }));
    const tags = harmonyTags(coherence.dominant, coherence.combination);

    return {
      score: coherence.score,
      dominant: coherence.dominant,
      active: coherence.active,
      conflicts: coherence.conflicts,
      identity: coherence.identity,
      combination: coherence.combination,
      bars,
      tags,
      philosophy: (coherence.dominant || [])
        .map((c) => PHILOSOPHY[c])
        .filter(Boolean)
        .map((p) => `${p.goal} par ${p.means}`)
        .slice(0, 2),
    };
  }

  function harmonyTags(dominantCodes, combination) {
    const tags = [];
    const combo = combination || detectCombination(dominantCodes || []);
    if (combo.type === "guild") tags.push({ kind: "ally", text: combo.name });
    else if (combo.type === "enemy_dual") tags.push({ kind: "enemy", text: combo.name });
    else if (combo.type === "shard") tags.push({ kind: "shard", text: `Shard ${combo.name}` });
    else if (combo.type === "wedge") tags.push({ kind: "wedge", text: `Wedge ${combo.name}` });
    else if (combo.type === "mono") tags.push({ kind: "mono", text: `Mono ${combo.name}` });

    for (const [a, b] of ALLIED_PAIRS) {
      if (dominantCodes?.includes(a) && dominantCodes?.includes(b)) {
        const g = GUILDS[pairKey(a, b)];
        if (g && !tags.some((t) => t.text === g.name)) tags.push({ kind: "ally", text: g.name });
      }
    }
    for (const [a, b] of ENEMY_PAIRS) {
      if (dominantCodes?.includes(a) && dominantCodes?.includes(b)) {
        const e = ENEMY_DUAL[pairKey(a, b)];
        if (e && !tags.some((t) => t.text === e.name)) tags.push({ kind: "enemy", text: e.name });
      }
    }
    return tags;
  }

  global.MTGColorPie = {
    WHEEL,
    LABELS,
    HEX,
    ALLIED_PAIRS,
    ENEMY_PAIRS,
    GUILDS,
    ENEMY_DUAL,
    SHARDS,
    WEDGES,
    pairKey,
    isAllied,
    isEnemy,
    isAdjacent,
    colorVectorFrom,
    sumVectors,
    dominantFromSum,
    activeColorsFromSum,
    detectCombination,
    bestFitCombination,
    combinationScore,
    pairRelationScore,
    identityAlignBonus,
    PHILOSOPHY,
    colorWeight,
    teamMetrics,
    inferBeatdownRole,
    analyzeBeatdownMatchup,
    pickBeatdownFit,
    colorMatchupPenalty,
    teamColorSummary,
    colorCoherence,
    colorPickBonus,
    harmonyTags,
  };
})(typeof window !== "undefined" ? window : globalThis);
