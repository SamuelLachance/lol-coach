/**
 * LoL Draft Scoring v1 — pipeline unique : profils, archetypes, scoreBan, scorePick.
 * Théorie draft MOBA : blind safe → synergie → counter → complétion win condition.
 */
(function (global) {
  const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const BLIND_SLOTS = ["Bot", "Jungle", "Mid"];
  const LATE_SLOTS = ["Support", "Top"];
  const SLOT_LABELS = { Bot: "ADC", Jungle: "Jungle", Mid: "Mid", Support: "Support", Top: "Top" };
  const MIN_LANE_RATE = 5;

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

  function laneRates(champ, meta) {
    return champ?.laneRates || meta?.[champ?.name]?.laneRates || null;
  }

  function playableSlots(champ, meta) {
    const rates = laneRates(champ, meta);
    if (rates && Object.keys(rates).length) {
      return SLOTS.filter((sl) => (rates[sl]?.rate || 0) >= MIN_LANE_RATE);
    }
    const slots = new Set(champ?.optimalSlots || meta?.[champ?.name]?.optimalSlots || []);
    const main = champ?.mainRole || meta?.[champ?.name]?.mainRole;
    if (main) slots.add(main);
    for (const sl of champ?.flexRoles || meta?.[champ?.name]?.flexRoles || []) slots.add(sl);
    return [...slots].filter(Boolean);
  }

  function playsSlot(champ, meta, slot) {
    const rates = laneRates(champ, meta);
    if (rates && Object.keys(rates).length) {
      const r = rates[slot]?.rate;
      return r != null && r >= MIN_LANE_RATE;
    }
    return playableSlots(champ, meta).includes(slot);
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
    const total = bal.score + syn * 0.85 + ctr * 0.9 + arch.completeness * 0.35;
    return { total, vs, gaps: bal.gaps, archetype: arch, breakdown: { balance: bal.score, synergy: syn, counter: ctr } };
  }

  function phaseWeights(depth) {
    const d = clamp01(depth);
    return {
      tier: Math.max(0.08, 1 - d * 0.9),
      flex: Math.max(0.15, 1 - d * 0.85),
      synergy: 0.3 + d * 1.1,
      counter: 0.2 + d * 1.25,
      plan: 0.25 + d * 1.0,
      deny: 0.35 + d * 0.4,
      blind: Math.max(0.2, 1 - d * 0.75),
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

  function scoreBan(champ, ctx) {
    const { state, side, byName, meta, depth = 0, banPhase = 1 } = ctx;
    const v = buildProfile(champ, meta);
    const w = phaseWeights(depth);
    const reasons = [];
    let score = TIER_PTS[v.tierMeta] * w.tier * 0.55 + v.flex * 18 * w.flex;

    const allies = (state.picks[side] || []).map((p) => p.name);
    const opp = side === "blue" ? "red" : "blue";
    const oppNames = (state.picks[opp] || []).map((p) => p.name);
    const ourArch = detectArchetype(profiles(allies, byName, meta));

    for (const a of allies) {
      const hit = listScore(champ.name, namesFrom(getData(byName, meta, a).bestCounters, meta[a]), CTR_W);
      if (hit) { score += hit + 6; reasons.push(`Counter ${a}`); }
    }

    const wombo = enemyWomboThreat(oppNames, champ.name, meta, byName);
    if (wombo.threat > 0) {
      score += Math.round(wombo.threat * w.deny);
      reasons.push(...wombo.reasons.slice(0, 2));
    }

    const ck = CK();
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

    const denyEval = evaluateTeam(oppNames.concat(champ.name), { byName, metaMap: meta, oppNames: allies, slotsLeft: Math.max(0, 5 - oppNames.length - 1) });
    const beforeEval = evaluateTeam(oppNames, { byName, metaMap: meta, oppNames: allies, slotsLeft: Math.max(0, 5 - oppNames.length) });
    const delta = denyEval.total - beforeEval.total;
    if (delta > 8) {
      score += Math.round(delta * 0.5);
      reasons.push("Renforce leur comp");
    }

    if (ourArch.carry && v.counters.includes(ourArch.carry)) {
      score += 34;
      reasons.push(`Menace carry ${ourArch.carry}`);
    }
    if (ourArch.plan === "hypercarry" && (v.tags.has("assassin") || v.tags.has("dive"))) {
      score += 28;
      reasons.push("Anti-dive vs hypercarry");
    }
    if (v.tierMeta === "S" && banPhase === 1) {
      score += 16;
      reasons.push("Deny S flex");
    }
    if (v.flex >= 0.45 && banPhase === 1) {
      score += 10;
      reasons.push("Flex ban — cache intent");
    }

    if (!reasons.length) reasons.push(`Tier ${v.tierMeta} — deny meta`);
    return { score: Math.round(score), reasons: [...new Set(reasons)].slice(0, 7) };
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
    if (ck) {
      const allyNames = allies;
      const tri = ck.trinityBonus(champ.name, allyNames);
      if (tri) {
        score += Math.round(tri * w.synergy * 0.55);
        if (tri >= 26) reasons.push("Trinité combo (3+ liens)");
        else if (tri >= 14) reasons.push("Combo coaching");
      }
      const syn = ck.coachingSynergyScore(champ.name, allyNames);
      if (syn.score) {
        score += Math.round(syn.score * w.synergy * 0.4);
        reasons.push(...syn.reasons.slice(0, 1));
      }
      const fam = ck.familyBonus(v, allyNames);
      if (fam.score) {
        score += Math.round(fam.score * w.plan * 0.45);
        reasons.push(...fam.reasons.slice(0, 1));
      }
      const tj = ck.tankJungleBonus(champ.name, slot);
      if (tj.score) { score += tj.score; reasons.push(...tj.reasons); }
      const ts = ck.tankSuppAllowsAp(v, slot, allyNames);
      if (ts.score) { score += ts.score; reasons.push(...ts.reasons); }
      const fp = ck.firstPickBonus(champ.name, slot, pickN, side);
      if (fp.score) { score += fp.score; reasons.push(...fp.reasons); }
      const fj = ck.firstPickJungleBonus(champ.name, slot, pickN);
      if (fj.score) { score += fj.score; reasons.push(...fj.reasons); }
      if (ck.inList(champ.name, ck.FIRST_PICK_ADC) && slot === "Bot" && inBlind) {
        score += 12;
        if (!reasons.some((r) => /FP ADC/i.test(r))) reasons.push("ADC coaching tier-list");
      }
    }

    if (!reasons.length) reasons.push(`${SLOT_LABELS[slot] || slot} optimal`);

    return { score, reasons: [...new Set(reasons)].slice(0, 8), slot, eval: after };
  }

  function scorePickCandidate(champ, ctx) {
    const { allowedSlots, preferredSlot, hintSlot } = ctx;
    let slots = allowedSlots?.length ? allowedSlots.slice() : SLOTS.slice();
    if (preferredSlot && slots.includes(preferredSlot)) slots = [preferredSlot, ...slots.filter((s) => s !== preferredSlot)];

    let best = null;
    for (const slot of slots) {
      const r = scorePick(champ, slot, { ...ctx, hintSlot });
      if (!best || r.score > best.score) best = r;
    }
    return best || { score: -9999, reasons: ["Aucun slot"], slot: slots[0] };
  }

  global.LoLDraftScoring = {
    SLOTS,
    BLIND_SLOTS,
    LATE_SLOTS,
    SLOT_LABELS,
    MIN_LANE_RATE,
    TIER_PTS,
    buildProfile,
    buildVector: buildProfile,
    profiles,
    detectCompPlan: detectArchetype,
    detectArchetype,
    evaluateTeam,
    phaseWeights,
    playableSlotsFor: playableSlots,
    playsSlotFor: playsSlot,
    scoreBan,
    scorePick,
    scorePickCandidate,
    enemyWomboThreat,
    isWomboPair,
  };
})(typeof window !== "undefined" ? window : globalThis);
