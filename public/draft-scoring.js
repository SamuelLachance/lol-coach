/**
 * LoL Draft Scoring v1 — pipeline unique : profils, archetypes, scoreBan, scorePick.
 * Théorie draft MOBA : blind safe → synergie → counter → complétion win condition.
 */
(function (global) {
  const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const BLIND_SLOTS = ["Bot", "Jungle", "Mid"];
  const LATE_SLOTS = ["Support", "Top"];
  const SLOT_LABELS = { Bot: "ADC", Jungle: "Jungle", Mid: "Mid", Support: "Support", Top: "Top" };
  const LV = () => global.LoLLaneViability;
  const MIN_LANE_RATE = () => LV()?.MIN_LANE_RATE ?? 10;

  const TIER_PTS = { S: 40, A: 30, B: 20, C: 10, D: 3 };
  const SYN_W = [36, 28, 22, 16, 12];
  const CTR_W = [40, 32, 24, 18, 14];

  /** Duos wombo documentés — deny prioritaire si l'adversaire en a un. */
  const WOMBO_PAIRS = [
    ["Malphite", "Yasuo"],
    ["Gragas", "Yasuo"],
    ["Jarvan IV", "Yasuo"],
    ["Yasuo", "Malphite"],
    ["Yasuo", "Gragas"],
    ["Yasuo", "Jarvan IV"],
    ["Amumu", "Miss Fortune"],
    ["Orianna", "Miss Fortune"],
    ["Sejuani", "Miss Fortune"],
    ["Nautilus", "Yasuo"],
    ["Alistar", "Yasuo"],
  ];
  const WOMBO_THEMES = new Set(["knockup_wombo", "teamfight_engage"]);

  const CK = () => global.CoachingDraftKnowledge;

  const COMP_LABELS = {
    hypercarry: "Hypercarry",
    poke_siege: "Poke / Siege",
    poke_disengage: "Poke + Disengage",
    teamfight_engage: "Teamfight engage",
    split_push: "Split push",
    pick_global: "Pick / Global",
    all_in: "All-in tempo",
    lane_tempo: "Lane tempo",
    beatdown: "Beatdown / Dive",
    front_to_back: "Front-to-back",
    scaling_late: "Scaling late",
  };

  function clamp01(x) {
    return Math.max(0, Math.min(1, Number(x) || 0));
  }

  function getData(byName, meta, name) {
    return byName?.get?.(name) || meta?.[name] || { name, optimalSlots: [], abilities: [] };
  }

  function listScore(name, list, w) {
    if (!list?.length) return 0;
    const i = list.findIndex((x) => (typeof x === "string" ? x : x?.name) === name);
    return i >= 0 ? w[Math.min(i, w.length - 1)] : 0;
  }

  function namesFrom(list, metaEntry) {
    const raw = list || metaEntry?.bestPairings || metaEntry?.bestCounters || metaEntry?.worstMatchups || [];
    return raw.map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean);
  }

  function playableSlots(champ, meta) {
    const lane = LV();
    if (lane) return lane.playableSlots(champ, meta);
    return [];
  }

  function playsSlot(champ, meta, slot) {
    const lane = LV();
    if (lane) return lane.playsSlot(champ, meta, slot);
    return false;
  }

  function primarySlot(champ, meta) {
    const lane = LV();
    if (lane) return lane.primarySlot(champ, meta);
    return null;
  }

  function parseSpells(text) {
    const t = (text || "").toLowerCase();
    return {
      cc: /étourdi|étourdit|enracin|immobilis|silenc|stun|root/.test(t),
      knockup: /projet|en l'air|knock/.test(t),
      aoe: /tous les ennemis|zone|cercle|rayon|radius/.test(t),
      peel: /bouclier|sanctuaire|téléporte vers lui|save|soin/.test(t),
    };
  }

  function abilityText(champ) {
    return (champ.abilities || []).map((a) => a.description || "").join(" ");
  }

  /** Profil draft enrichi par champion. */
  function buildProfile(champ, meta) {
    const name = champ.name;
    const m = meta?.[name] || {};
    const tags = new Set(m.tags || []);
    const type = (champ.type || m.type || "").toLowerCase();
    const dp = champ.draftProfile || m.draftProfile || {};
    const slots = playableSlots(champ, meta);
    const spells = parseSpells(abilityText(champ));
    const tierMeta = champ.tierMeta || m.tierMeta || "C";
    const fam = champ.championFamily || {};
    const compTypes = fam.compTypes || m.compTypes || [];
    const familyKey = fam.key || m.family || "";

    if (/support/i.test(type)) tags.add("peel");
    if (/combattant|tank|fighter/i.test(type)) tags.add("frontline");
    if (/marksman|à distance|artillerie/i.test(type)) tags.add("marksman");
    if (familyKey === "adc_hypercarry" || compTypes.includes("hypercarry")) tags.add("scaling");
    if (compTypes.includes("split_push")) tags.add("split");
    if (compTypes.includes("poke_siege") || compTypes.includes("poke_disengage")) tags.add("poke");
    if (tags.has("assassin") || tags.has("dive")) tags.add("dive");

    const engage = clamp01(
      (tags.has("engage") ? 0.55 : 0) +
        (spells.knockup ? 0.35 : 0) +
        (tags.has("frontline") && tags.has("dive") ? 0.25 : 0)
    );
    const peel = clamp01((tags.has("peel") ? 0.6 : 0) + (spells.peel ? 0.3 : 0));
    const scaling = clamp01(
      (tags.has("scaling") ? 0.6 : 0) + (/marksman|à distance/i.test(type) ? 0.35 : 0)
    );
    const early = clamp01(
      (tags.has("assassin") || tags.has("dive") ? 0.4 : 0) +
        (tierMeta === "S" && !tags.has("scaling") ? 0.2 : 0)
    );
    const flex = clamp01(slots.length / 5);
    const carry = clamp01(
      (TIER_PTS[tierMeta] || 10) / 40 * 0.35 +
        ((dp.dpsWeight ?? 0) / 1.25) * 0.35 +
        (tags.has("marksman") ? 0.3 : 0)
    );
    const specialist = clamp01(carry * (1.15 - flex * 0.75));
    const tank = clamp01((dp.tankWeight ?? 0) / 1.25);
    const burst = clamp01(
      ((dp.dpsWeight ?? 0) / 1.25) * 0.5 + (tags.has("assassin") ? 0.4 : 0) + (spells.aoe ? 0.15 : 0)
    );
    const ad = clamp01(dp.adShare ?? (tags.has("mage_burst") ? 0.1 : 0.85));
    const ap = clamp01(dp.apShare ?? (tags.has("mage_burst") ? 0.85 : 0.15));
    const spellSetup = clamp01((spells.cc ? 0.35 : 0) + (spells.knockup ? 0.45 : 0));

    return {
      name,
      champ,
      tags,
      tierMeta,
      slots,
      pairings: namesFrom(champ.bestPairings, m),
      counters: namesFrom(champ.bestCounters, m),
      counteredBy: namesFrom(champ.worstMatchups, m),
      compTypes,
      familyKey,
      engage,
      peel,
      scaling,
      early,
      flex,
      carry,
      specialist,
      tank,
      burst,
      ad,
      ap,
      spellSetup,
      spells,
      isMarksman: tags.has("marksman") || /marksman|tireur|à distance/i.test(type),
      isSupportOnly: (slots.length <= 1 && slots[0] === "Support") || (/support/i.test(type) && !tags.has("marksman")),
    };
  }

  function profiles(names, byName, meta) {
    return names.map((n) => buildProfile(getData(byName, meta, n), meta));
  }

  function sumKey(vs, key) {
    return vs.reduce((s, v) => s + (v[key] || 0), 0);
  }

  /** Détection archetype comp (engage, poke, hypercarry, dive, peel, split, scaling). */
  function detectArchetype(vs) {
    if (!vs.length) return { plan: null, label: "", completeness: 0, gaps: [], carry: null };
    const typeCounts = {};
    for (const v of vs) {
      for (const t of v.compTypes || []) typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const axes = {
      engage: sumKey(vs, "engage"),
      peel: sumKey(vs, "peel"),
      scaling: sumKey(vs, "scaling"),
      front: vs.filter((v) => v.tags.has("frontline")).length,
      burst: sumKey(vs, "burst"),
      early: sumKey(vs, "early"),
    };
    const gaps = [];
    let plan = null;
    let completeness = 0;

    const hyper = typeCounts.hypercarry || 0;
    const poke = (typeCounts.poke_siege || 0) + (typeCounts.poke_disengage || 0);
    const engage = typeCounts.teamfight_engage || 0;

    if (hyper >= 1 || (axes.scaling >= 1.2 && axes.peel >= 0.8)) {
      plan = "hypercarry";
      completeness = 25 + (vs.some((v) => v.familyKey === "support_enchanter") ? 35 : 0);
      if (axes.front < 1) gaps.push("frontline");
      if (axes.peel < 0.8) gaps.push("peel");
    } else if (poke >= 2) {
      plan = typeCounts.poke_disengage >= 2 ? "poke_disengage" : "poke_siege";
      completeness = poke * 18 + 20;
    } else if (engage >= 2 || axes.engage >= 1.5) {
      plan = "teamfight_engage";
      completeness = engage * 16 + (axes.front >= 1 ? 25 : 0);
      if (axes.front < 1) gaps.push("frontline");
    } else if (axes.engage >= 1 && axes.burst >= 1.5) {
      plan = "beatdown";
      completeness = 30;
    } else if (axes.front >= 1 && axes.scaling >= 0.8 && axes.peel >= 0.8) {
      plan = "front_to_back";
      completeness = 40;
    } else if (axes.scaling >= 1.5) {
      plan = "scaling_late";
      completeness = 20;
    } else {
      const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
      plan = sorted[0]?.[0] || null;
      completeness = sorted[0] ? sorted[0][1] * 14 : 0;
    }

    const carry = vs.reduce((best, v) => ((v.carry || 0) > (best?.carry || 0) ? v : best), null);
    return {
      plan,
      label: COMP_LABELS[plan] || plan || "",
      completeness: Math.min(100, completeness),
      gaps,
      carry: carry?.name || null,
    };
  }

  function teamBalance(vs, slotsLeft) {
    if (!vs.length) return { score: 0, gaps: [] };
    const urg = slotsLeft <= 1 ? 2 : slotsLeft === 2 ? 1.5 : 1;
    const engage = sumKey(vs, "engage");
    const peel = sumKey(vs, "peel");
    const front = vs.filter((v) => v.tags.has("frontline")).length;
    const ad = sumKey(vs, "ad");
    const ap = sumKey(vs, "ap");
    const wave = vs.filter((v) => v.tags.has("wave_clear")).length;
    let score = 0;
    const gaps = [];
    const dmg = ad + ap;
    if (dmg > 0) {
      const apR = ap / dmg;
      if (apR >= 0.28 && apR <= 0.62) score += 18;
      else score -= 14;
    }
    if (front < 1) { score -= 45 * urg; gaps.push("frontline"); }
    if (peel < 0.8) { score -= 38 * urg; gaps.push("peel"); }
    if (engage > 2 && peel < 0.5) score -= 22;
    if (wave < 1 && vs.length >= 3) { score -= 20; gaps.push("wave clear"); }
    return { score, gaps };
  }

  function pairingSynergy(vs) {
    if (vs.length < 2) return 0;
    let s = 0;
    for (let i = 0; i < vs.length; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        s += listScore(vs[j].name, vs[i].pairings, SYN_W);
        s += Math.round(listScore(vs[i].name, vs[j].pairings, SYN_W) * 0.85);
        if (vs[i].spells.knockup && vs[j].spells.aoe) s += 22;
        if (vs[i].spells.peel && vs[j].carry > 0.55) s += 24;
        const ck = CK();
        if (ck?.countComboLinks) {
          const links = ck.countComboLinks(vs[i].name, [vs[j].name]);
          if (links) s += 14 + links * 10;
        }
      }
    }
    return s;
  }

  function evaluateTeam(names, ctx) {
    const { byName, metaMap, oppNames = [], slotsLeft = Math.max(0, 5 - names.length) } = ctx;
    const vs = profiles(names, byName, metaMap);
    const bal = teamBalance(vs, slotsLeft);
    const syn = pairingSynergy(vs);
    const arch = detectArchetype(vs);
    const oppVs = profiles(oppNames, byName, metaMap);
    let ctr = 0;
    for (const u of vs) {
      for (const e of oppVs) {
        ctr += listScore(u.name, e.counters, CTR_W);
        ctr -= Math.round(listScore(e.name, u.counters, CTR_W) * 0.45);
      }
    }
    let coachingAdj = 0;
    const ck = CK();
    if (ck?.scoreCoachingPick && names.length >= 2) {
      let mixTotal = 0;
      for (const n of names) mixTotal += ck.familyMixPenalty(n, names.filter((x) => x !== n)).score;
      coachingAdj += mixTotal / Math.max(1, names.length);
      const archetype = ck.detectArchetypeComp(names);
      if (archetype) coachingAdj += archetype.hits * 8;
    }

    const total = bal.score + syn * 0.9 + ctr * 0.9 + arch.completeness * 0.45 + coachingAdj;
    return {
      total,
      vs,
      gaps: bal.gaps,
      archetype: arch,
      breakdown: { balance: bal.score, synergy: syn, counter: ctr, coaching: coachingAdj },
    };
  }

  /** Macro tab — score = synergie + familles uniquement. */
  function macroFamilyScore(names, byName, metaMap) {
    const vs = profiles(names, byName, metaMap);
    const arch = detectArchetype(vs);
    let score = Math.round(arch.completeness * 1.25);
    const ck = CK();
    if (!ck || names.length < 2) return score;

    let coherence = 0;
    for (const n of names) {
      coherence += ck.familyCoherence(n, names.filter((x) => x !== n)).score;
    }
    score += Math.round(coherence / names.length);

    const archetype = ck.detectArchetypeComp(names);
    if (archetype) score += archetype.hits * 14;

    const tpl = ck.detectTemplate(names);
    if (tpl) score += 22;

    let mix = 0;
    for (const n of names) mix += ck.familyMixPenalty(n, names.filter((x) => x !== n)).score;
    score += Math.round(mix / names.length);

    return Math.round(score);
  }

  function evaluateTeamMacro(names, ctx) {
    const { byName, metaMap } = ctx;
    const vs = profiles(names, byName, metaMap);
    const synergy = Math.round(pairingSynergy(vs));
    const family = macroFamilyScore(names, byName, metaMap);
    const arch = detectArchetype(vs);
    return {
      total: synergy + family,
      vs,
      archetype: arch,
      gaps: [],
      breakdown: { synergy, family },
    };
  }

  function phaseWeights(depth) {
    const d = clamp01(depth);
    return {
      tier: Math.max(0.06, 1 - d * 0.92),
      flex: Math.max(0.12, 1 - d * 0.88),
      synergy: 0.45 + d * 1.35,
      counter: 0.25 + d * 1.35,
      plan: 0.55 + d * 1.2,
      deny: 0.4 + d * 0.45,
      blind: Math.max(0.15, 1 - d * 0.8),
      coaching: 0.85 + d * 0.9,
    };
  }

  function isWomboPair(a, b) {
    return WOMBO_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  }

  function enemyWomboThreat(enemyNames, champName, meta, byName) {
    let threat = 0;
    const reasons = [];
    for (const e of enemyNames) {
      if (isWomboPair(e, champName)) {
        threat += 48;
        reasons.push(`Duo wombo ${e}+${champName}`);
      }
      const ep = buildProfile(getData(byName, meta, e), meta);
      if (listScore(champName, ep.pairings, SYN_W) >= 28) {
        threat += Math.round(listScore(champName, ep.pairings, SYN_W) * 0.6);
        reasons.push(`Synergie avec ${e}`);
      }
      for (const p of ep.pairings) {
        if (p === champName && ep.compTypes.some((t) => WOMBO_THEMES.has(t))) {
          threat += 20;
          reasons.push("Complète wombo engage");
        }
      }
    }
    return { threat, reasons };
  }

  function counterability(v, slot) {
    const pool = v.counteredBy.length;
    const isAdcBlind = slot === "Bot" && v.isMarksman;
    const risk = pool * (isAdcBlind ? 5 : 11) +
      v.specialist * (isAdcBlind ? 6 : 30) +
      (v.flex < 0.35 && !isAdcBlind ? 16 : 0);
    return { risk: isAdcBlind ? risk * 0.4 : risk, pool };
  }

  /** Infer enemy lane assignments (explicit slot or primary/flex from data). */
  function inferEnemyPickSlots(state, side, byName, meta) {
    const opp = side === "blue" ? "red" : "blue";
    const picks = (state.picks[opp] || []).filter((p) => p.name);
    const oppBySlot = {};

    for (const p of picks) {
      if (p.slot) oppBySlot[p.slot] = p.name;
    }

    for (const p of picks) {
      if (Object.values(oppBySlot).includes(p.name)) continue;
      const champ = getData(byName, meta, p.name);
      const slots = playableSlots(champ, meta);
      const open = SLOTS.filter((sl) => !oppBySlot[sl]);
      const lane = LV();
      const slot = lane?.bestOpenSlot(champ, meta, open) || slots.find((sl) => open.includes(sl)) || null;

      if (slot) oppBySlot[slot] = p.name;
    }

    return oppBySlot;
  }

  /** Enemy pick slots — open vs filled lanes for ban targeting. */
  function enemySlotState(state, side, byName, meta) {
    const opp = side === "blue" ? "red" : "blue";
    const oppBySlot = inferEnemyPickSlots(state, side, byName, meta);
    const oppNames = (state.picks[opp] || []).map((p) => p.name).filter(Boolean);
    const filledSlots = SLOTS.filter((sl) => oppBySlot[sl]);
    const openSlots = SLOTS.filter((sl) => !oppBySlot[sl]);
    return { opp, oppBySlot, oppNames, filledSlots, openSlots };
  }

  /** Open enemy lanes this champion can realistically still be picked for. */
  function getBanViableOpenSlots(champ, meta, openSlots) {
    if (!openSlots.length) return [];
    const viable = playableSlots(champ, meta).filter((sl) => openSlots.includes(sl));
    if (!viable.length) return [];

    const primary = primarySlot(champ, meta);
    if (primary && viable.includes(primary)) {
      return [primary, ...viable.filter((sl) => sl !== primary)];
    }
    return viable;
  }

  /**
   * Returns whether a ban is worth suggesting given enemy lane state.
   * disqualified = champion cannot fill any remaining enemy lane.
   */
  function analyzeBanSlotFit(v, champ, meta, slotState, { comboDenyScore = 0, banPhase = 1 } = {}) {
    const { filledSlots, openSlots, oppBySlot } = slotState;
    if (!filledSlots.length) {
      return { disqualified: false, viableOpen: openSlots, score: 0, reasons: [] };
    }

    const viableOpen = getBanViableOpenSlots(champ, meta, openSlots);
    const strongCombo = comboDenyScore >= 40;

    if (!viableOpen.length) {
      if (strongCombo) {
        return {
          disqualified: false,
          viableOpen: [],
          score: -8,
          reasons: ["Deny combo — postes fermés mais synergie menace"],
        };
      }
      const filledLabels = filledSlots.map((sl) => SLOT_LABELS[sl] || sl).join("/");
      const occupants = filledSlots.map((sl) => oppBySlot[sl]).filter(Boolean).join(", ");
      return {
        disqualified: true,
        viableOpen: [],
        score: -9999,
        reasons: [
          occupants
            ? `Ban inutile — ${filledLabels} pris (${occupants})`
            : `Ban inutile — ${filledLabels} déjà pris`,
        ],
      };
    }

    let score = 0;
    const reasons = [];
    const tierW = (TIER_PTS[v.tierMeta] || 10) * 0.45;
    score += tierW;

    const primary = viableOpen[0];
    if (viableOpen.length === 1 && playableSlots(champ, meta).length <= 2) {
      score += banPhase === 2 ? 40 : 32;
      reasons.push(`Deny ${SLOT_LABELS[primary] || primary} (poste ouvert)`);
    } else {
      score += 14 + viableOpen.length * 10;
      const labels = viableOpen.map((sl) => SLOT_LABELS[sl] || sl).join(", ");
      reasons.push(`Menace postes ouverts: ${labels}`);
    }

    if (openSlots.length <= 2) {
      score += 12;
      reasons.push("Peu de postes restants");
    }

    if (banPhase === 2) score += 8;

    return { disqualified: false, viableOpen, score, reasons };
  }

  function scoreBan(champ, ctx) {
    const { state, side, byName, meta, depth = 0, banPhase = 1 } = ctx;
    const v = buildProfile(champ, meta);
    const w = phaseWeights(depth);
    const reasons = [];

    const allies = (state.picks[side] || []).map((p) => p.name);
    const slotState = enemySlotState(state, side, byName, meta);
    const { oppNames, filledSlots, openSlots } = slotState;
    const enemyHasPicks = filledSlots.length > 0;

    let comboDenyScore = 0;

    const wombo = enemyWomboThreat(oppNames, champ.name, meta, byName);
    if (wombo.threat > 0) comboDenyScore += wombo.threat;

    const ck = CK();
    if (ck?.denyComboBanScore) {
      const deny = ck.denyComboBanScore(champ.name, oppNames);
      if (deny.score) comboDenyScore += deny.score;
    }
    if (ck?.banCoachingScore) {
      const enemyNeedsTank = filledSlots.length >= 3 && !oppNames.some((n) => {
        const p = buildProfile(getData(byName, meta, n), meta);
        return p.tags.has("frontline") || p.tank > 0.5;
      });
      const banCoach = ck.banCoachingScore(champ.name, oppNames, { enemyNeedsTank });
      if (banCoach.score) comboDenyScore += banCoach.score;
    }

    for (const e of oppNames) {
      const syn = listScore(champ.name, buildProfile(getData(byName, meta, e), meta).pairings, SYN_W);
      if (syn >= 24) comboDenyScore += syn;
    }

    const slotFit = analyzeBanSlotFit(v, champ, meta, slotState, { comboDenyScore, banPhase });
    if (slotFit.disqualified) {
      return {
        score: -9999,
        disqualified: true,
        reasons: slotFit.reasons,
      };
    }

    let score = 0;
    if (!enemyHasPicks) {
      score = TIER_PTS[v.tierMeta] * w.tier * 0.55 + v.flex * 18 * w.flex;
    }

    if (slotFit.score) {
      score += Math.round(slotFit.score * (0.9 + depth * 0.4));
      reasons.push(...slotFit.reasons.slice(0, 2));
    }

    const ourArch = detectArchetype(profiles(allies, byName, meta));

    for (const a of allies) {
      const hit = listScore(champ.name, namesFrom(getData(byName, meta, a).bestCounters, meta[a]), CTR_W);
      if (hit) { score += hit + 6; reasons.push(`Counter ${a}`); }
    }

    if (wombo.threat > 0) {
      score += Math.round(wombo.threat * w.deny);
      reasons.push(...wombo.reasons.slice(0, 2));
    }

    if (ck?.denyComboBanScore) {
      const deny = ck.denyComboBanScore(champ.name, oppNames);
      if (deny.score) {
        score += Math.round(deny.score * w.deny);
        reasons.push(...deny.reasons.slice(0, 2));
      }
    }

    for (const e of oppNames) {
      const syn = listScore(champ.name, buildProfile(getData(byName, meta, e), meta).pairings, SYN_W);
      if (syn >= 24) {
        score += Math.round(syn * 0.5 * w.deny);
        reasons.push(`Casse synergie avec ${e}`);
      }
    }

    if (enemyHasPicks && slotFit.viableOpen?.length) {
      const denyEval = evaluateTeam(oppNames.concat(champ.name), {
        byName, metaMap: meta, oppNames: allies,
        slotsLeft: Math.max(0, openSlots.length - 1),
      });
      const beforeEval = evaluateTeam(oppNames, {
        byName, metaMap: meta, oppNames: allies,
        slotsLeft: openSlots.length,
      });
      const delta = denyEval.total - beforeEval.total;
      if (delta > 8) {
        score += Math.round(delta * 0.35);
        reasons.push("Affaiblit leur comp sur poste ouvert");
      }
    } else if (!enemyHasPicks) {
      const denyEval = evaluateTeam(oppNames.concat(champ.name), { byName, metaMap: meta, oppNames: allies, slotsLeft: Math.max(0, 5 - oppNames.length - 1) });
      const beforeEval = evaluateTeam(oppNames, { byName, metaMap: meta, oppNames: allies, slotsLeft: Math.max(0, 5 - oppNames.length) });
      const delta = denyEval.total - beforeEval.total;
      if (delta > 8) {
        score += Math.round(delta * 0.5);
        reasons.push("Renforce leur comp");
      }
    }

    if (ourArch.carry && v.counters.includes(ourArch.carry)) {
      score += 34;
      reasons.push(`Menace carry ${ourArch.carry}`);
    }
    if (ourArch.plan === "hypercarry" && (v.tags.has("assassin") || v.tags.has("dive"))) {
      score += 28;
      reasons.push("Anti-dive vs hypercarry");
    }
    if (banPhase === 1 && !enemyHasPicks) {
      if (v.tierMeta === "S") {
        score += 16;
        reasons.push("Deny S flex");
      }
      if (v.flex >= 0.45) {
        score += 10;
        reasons.push("Flex ban — cache intent");
      }
    }

    if (!reasons.length) reasons.push(`Tier ${v.tierMeta} — deny meta`);
    return { score: Math.round(score), disqualified: false, reasons: [...new Set(reasons)].slice(0, 7) };
  }

  function scorePick(champ, slot, ctx) {
    const { state, side, byName, meta, depth = 0, hintSlot = null } = ctx;
    const v = buildProfile(champ, meta);
    const w = phaseWeights(depth);
    const reasons = [];

    if (!playsSlot(champ, meta, slot)) {
      return { score: -9999, reasons: [`Lane incompatible (${SLOT_LABELS[slot]})`], slot };
    }

    const allies = (state.picks[side] || []).map((p) => p.name).filter((n) => n !== champ.name);
    const opp = side === "blue" ? "red" : "blue";
    const oppNames = (state.picks[opp] || []).map((p) => p.name);
    const oppBySlot = {};
    for (const p of state.picks[opp] || []) if (p.slot) oppBySlot[p.slot] = p.name;

    const before = evaluateTeam(allies, { byName, metaMap: meta, oppNames, slotsLeft: 5 - allies.length });
    const after = evaluateTeam(allies.concat(champ.name), { byName, metaMap: meta, oppNames, slotsLeft: 4 - allies.length });
    let score = Math.round(after.total - before.total);

    score += Math.round(TIER_PTS[v.tierMeta] * w.tier);
    score += Math.round(v.flex * 22 * w.flex);

    const pickN = allies.length;
    const inBlind = BLIND_SLOTS.includes(slot) && pickN < 3;

    if (inBlind) {
      if (slot === "Bot") {
        if (v.isMarksman && (v.tierMeta === "S" || v.tierMeta === "A")) {
          score += v.tierMeta === "S" ? 72 : 52;
          score += Math.max(0, 24 - v.counteredBy.length * 4);
          reasons.push("Blind-safe flex ADC");
        } else if (v.isMarksman) {
          score += 28;
          reasons.push("Blind ADC");
        } else if (v.isSupportOnly) {
          score -= 180;
          reasons.push("Support interdit en B1");
        } else {
          score -= 100;
          reasons.push("ADC blind requis");
        }
      } else if (slot === "Jungle") {
        if (v.slots.includes("Jungle") && (v.tierMeta === "S" || v.tierMeta === "A")) {
          score += 42;
          reasons.push("Blind Jungle tier");
        } else if (v.slots.includes("Jungle")) {
          score += 18;
          reasons.push("Blind Jungle");
        } else {
          score -= 100;
        }
      } else if (slot === "Mid") {
        if (v.slots.includes("Mid") && v.flex >= 0.35) {
          score += 28;
          reasons.push("Blind Mid flex");
        } else if (v.slots.includes("Mid") && v.tierMeta === "S") {
          score += 22;
          reasons.push("Blind Mid tier S");
        }
      }
      if (LATE_SLOTS.includes(slot) && pickN < 3) {
        score -= 160;
        reasons.push("Top/Sup = counter pick only");
      }
      const { risk, pool } = counterability(v, slot);
      if (risk >= 30 && !(slot === "Bot" && v.isMarksman && pickN === 0)) {
        const pen = Math.round(risk * w.blind * (pickN === 0 ? 0.55 : 0.4));
        score -= pen;
        if (pool >= 4 && !v.isMarksman) reasons.push(`Counterable (${pool} menaces pool)`);
        else if (pool >= 4 && v.isMarksman) reasons.push("Pool counters — rester flex");
        else if (pool >= 1 && !v.isMarksman) reasons.push("Matchup risqué en blind");
        if (v.specialist > 0.55 && !v.isMarksman) reasons.push("Spécialiste — éviter blind");
      }
      if (v.tierMeta === "D" || v.tierMeta === "C") {
        score -= pickN === 0 ? 45 : 25;
        if (pickN === 0) reasons.push("Off-meta — éviter B1");
      }
    } else {
      const oppLane = oppBySlot[slot];
      if (oppLane) {
        const hit = listScore(champ.name, namesFrom(getData(byName, meta, oppLane).worstMatchups, meta[oppLane]), CTR_W);
        const counterHit = listScore(oppLane, v.counters, CTR_W);
        if (counterHit) {
          score += Math.round(counterHit * w.counter);
          reasons.push(`Counters enemy ${SLOT_LABELS[slot] || slot}`);
        }
        if (hit) score -= Math.round(hit * 0.4);
      }
    }

    for (const a of allies) {
      const syn = listScore(a, v.pairings, SYN_W) + listScore(champ.name, buildProfile(getData(byName, meta, a), meta).pairings, SYN_W);
      if (syn) {
        score += Math.round(syn * w.synergy * 0.45);
        if (!reasons.some((r) => r.includes("Synergie"))) reasons.push("Synergie alliés");
      }
    }

    const beforeArch = detectArchetype(before.vs);
    const afterArch = detectArchetype(after.vs);
    const compDelta = afterArch.completeness - beforeArch.completeness;
    if (compDelta >= 10) {
      score += Math.round(compDelta * w.plan * 0.5);
      for (const g of beforeArch.gaps) {
        if (!afterArch.gaps.includes(g)) {
          reasons.push(`Fills ${g} gap`);
          break;
        }
      }
      if (afterArch.label) reasons.push(`Plan ${afterArch.label}`);
    }

    if (v.engage > 0.55 && after.breakdown.balance > before.breakdown.balance) reasons.push("Apporte l'engage");
    if (v.peel > 0.55) reasons.push("Peel / disengage");
    if (v.tierMeta === "S") reasons.push("Tier S");
    else if (v.tierMeta === "A") reasons.push("Tier A");

    if (hintSlot === slot) score += 8;

    const ck = CK();
    if (ck?.scoreCoachingPick) {
      const coaching = ck.scoreCoachingPick(champ.name, allies, slot, { side, pickN });
      if (coaching.score) {
        score += Math.round(coaching.score * w.coaching);
        reasons.push(...coaching.reasons.slice(0, 4));
      }
    } else if (ck) {
      const tri = ck.trinityBonus(champ.name, allies);
      if (tri.score) score += Math.round(tri.score * w.synergy * 0.55);
      const syn = ck.coachingSynergyScore(champ.name, allies);
      if (syn.score) score += Math.round(syn.score * w.synergy * 0.4);
      const fam = ck.familyBonus(champ.name, allies);
      if (fam.score) score += Math.round(fam.score * w.plan * 0.45);
    }

    if (ck?.inList?.(champ.name, ck.COUNTER_PICK_CHAMPS) && side === "red" && pickN >= 3) {
      score += Math.round(18 * w.counter);
      reasons.push("Pocket counter coaching");
    }

    if (!reasons.length) reasons.push(`${SLOT_LABELS[slot] || slot} optimal`);

    return { score, reasons: [...new Set(reasons)].slice(0, 8), slot, eval: after };
  }

  function scorePickCandidate(champ, ctx) {
    const { allowedSlots, preferredSlot, hintSlot, meta } = ctx;
    let slots = allowedSlots?.length ? allowedSlots.slice() : SLOTS.slice();
    const lane = LV();
    slots = lane ? lane.filterSlots(champ, meta, slots) : slots.filter((sl) => playsSlot(champ, meta, sl));
    if (!slots.length) {
      return { score: -9999, reasons: [`Aucun poste ≥${MIN_LANE_RATE()}% lane rate`], slot: null };
    }
    if (preferredSlot && slots.includes(preferredSlot)) slots = [preferredSlot, ...slots.filter((s) => s !== preferredSlot)];

    let best = null;
    for (const slot of slots) {
      const r = scorePick(champ, slot, { ...ctx, hintSlot });
      if (!best || r.score > best.score) best = r;
    }
    return best || { score: -9999, reasons: ["Aucun slot viable"], slot: null };
  }

  global.LoLDraftScoring = {
    SLOTS,
    BLIND_SLOTS,
    LATE_SLOTS,
    SLOT_LABELS,
    MIN_LANE_RATE: MIN_LANE_RATE(),
    getMinLaneRate: MIN_LANE_RATE,
    TIER_PTS,
    buildProfile,
    buildVector: buildProfile,
    profiles,
    detectCompPlan: detectArchetype,
    detectArchetype,
    evaluateTeam,
    evaluateTeamMacro,
    macroFamilyScore,
    phaseWeights,
    playableSlotsFor: playableSlots,
    playsSlotFor: playsSlot,
    scoreBan,
    analyzeBanSlotFit,
    enemySlotState,
    inferEnemyPickSlots,
    getBanViableOpenSlots,
    isBanViable: (champ, ctx) => {
      const v = buildProfile(champ, ctx.meta);
      const slotState = enemySlotState(ctx.state, ctx.side, ctx.byName, ctx.meta);
      const fit = analyzeBanSlotFit(v, champ, ctx.meta, slotState, {
        comboDenyScore: 0,
        banPhase: ctx.banPhase || 1,
      });
      return !fit.disqualified;
    },
    scorePick,
    scorePickCandidate,
    enemyWomboThreat,
    isWomboPair,
  };
})(typeof window !== "undefined" ? window : globalThis);
