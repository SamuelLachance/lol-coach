/**
 * LoL Draft Scoring — profils, archetypes, scoreBan, scorePick, evaluateDraftDuel.
 * Chaque axe théorique (win condition, synergie, MTG, classes, lanes, coaching, etc.)
 * est normalisé puis combiné à poids égal via normalizePillar / combineEqualPillars.
 */
(function (global) {
  const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const COACH_SLOT_ORDER = ["Bot", "Jungle", "Mid", "Support", "Top"];
  const BLIND_SLOTS = ["Bot", "Jungle", "Mid"];
  const LATE_SLOTS = ["Support", "Top"];
  const SLOT_LABELS = { Bot: "ADC", Jungle: "Jungle", Mid: "Mid", Support: "Support", Top: "Top" };
  const LV = () => global.LoLLaneViability;
  const LML = () => global.LoLLaneMatchupLogic;
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
  const MTG = () => global.MTGColorPie;
  const IX = () => global.LoLDraftInteractions;
  const CL = () => global.LoLChampionClasses;

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

  /** Win-condition counters — [counter plan, victim plan] (MOBA composition logic). */
  const COMP_TYPE_COUNTERS = [
    ["poke_disengage", "teamfight_engage"],
    ["poke_siege", "teamfight_engage"],
    ["pick_global", "hypercarry"],
    ["all_in", "hypercarry"],
    ["lane_tempo", "hypercarry"],
    ["split_push", "teamfight_engage"],
    ["teamfight_engage", "split_push"],
    ["front_to_back", "beatdown"],
    ["front_to_back", "all_in"],
    ["scaling_late", "lane_tempo"],
    ["scaling_late", "all_in"],
    ["pick_global", "poke_siege"],
    ["beatdown", "poke_siege"],
  ];

  const INCOMPATIBLE_COMP_PAIRS = [
    ["poke_disengage", "all_in"],
    ["poke_disengage", "teamfight_engage"],
    ["poke_siege", "all_in"],
    ["hypercarry", "lane_tempo"],
    ["split_push", "teamfight_engage"],
  ];

  const LANE_MATCHUP_WEIGHT = { Top: 1.7, Jungle: 1, Mid: 1, Bot: 1, Support: 1.5 };
  const LANE_CROSS_DUEL_WEIGHT = 0.55;
  const JGL_GANK_WEIGHT = { Top: 0.42, Mid: 0.48, Bot: 0.38 };

  /** Each MOBA theory axis is normalized to [-PILLAR_MAX, +PILLAR_MAX], then averaged equally. */
  const PILLAR_MAX = 100;
  const TEAM_PILLAR_SCALE = 4.8;
  const DUEL_PILLAR_SCALE = 7.5;
  const PICK_PILLAR_SCALE = 2.4;

  function clamp01(x) {
    return Math.max(0, Math.min(1, Number(x) || 0));
  }

  function normalizePillar(raw, typicalAbs = 100) {
    const t = Math.max(1, Math.abs(typicalAbs) || 100);
    const x = Math.max(-t * 2.5, Math.min(t * 2.5, Number(raw) || 0));
    return Math.round((x / t) * PILLAR_MAX);
  }

  function combineEqualPillars(scores) {
    const vals = scores.filter((s) => s != null && Number.isFinite(s));
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  function nameLookupKey(name) {
    return String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function getData(byName, meta, name) {
    if (byName?.get?.(name)) return byName.get(name);
    if (meta?.[name]) return meta[name];
    const key = nameLookupKey(name);
    if (key && byName instanceof Map) {
      for (const [k, v] of byName) {
        if (nameLookupKey(k) === key) return v;
        if (v?.nameEn && nameLookupKey(v.nameEn) === key) return v;
        if (v?.key && nameLookupKey(v.key) === key) return v;
      }
    }
    if (key && meta) {
      for (const [k, v] of Object.entries(meta)) if (nameLookupKey(k) === key) return v;
    }
    return { name, optimalSlots: [], abilities: [] };
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

  function getColorIdentity(champ, meta) {
    return champ?.colorIdentity || meta?.[champ?.name]?.colorIdentity || null;
  }

  /** MTG WUBRG + beatdown role — pick & comp scoring */
  function applyMtgPickScore(v, allies, oppNames, byName, metaMap, w) {
    const pie = MTG();
    if (!pie || !v.colors) return { score: 0, reasons: [] };

    const allyVs = profiles(allies, byName, metaMap);
    const enemyVs = profiles(oppNames, byName, metaMap);
    const allyColors = allyVs.map((p) => p.colors).filter(Boolean);
    const teamSum = pie.sumVectors(allyColors.map((c) => pie.colorVectorFrom(c)));

    let score = 0;
    const reasons = [];

    const harmony = pie.colorPickBonus(v.colors, allyColors, teamSum);
    if (harmony.score) {
      score += Math.round(harmony.score * (w?.plan || 0.55) * 1.35);
      if (harmony.label) reasons.push(harmony.label);
      else if (harmony.teamCombo?.name) reasons.push(`Identité ${harmony.teamCombo.name}`);
    }

    if (enemyVs.length) {
      const oppColors = enemyVs.map((p) => p.colors).filter(Boolean);
      const oppSum = pie.sumVectors(oppColors.map((c) => pie.colorVectorFrom(c)));
      const hoser = pie.colorMatchupPenalty(v.colors, oppSum);
      score += hoser.score;
      reasons.push(...hoser.reasons);

      const beat = pie.pickBeatdownFit(v, allyVs, enemyVs);
      score += beat.score;
      reasons.push(...beat.reasons);
    }

    const projected = allyVs.concat([v]);
    const coh = pie.colorCoherence(projected.map((p) => ({ name: p.name, colors: p.colors })));
    if (coh.conflicts?.length) {
      score -= Math.min(70, coh.conflicts.length * 22);
      reasons.push(coh.conflicts[0]);
    } else if (coh.combination?.type === "guild" && allyVs.length >= 1) {
      score += 28;
    }

    return { score, reasons: [...new Set(reasons)].slice(0, 4) };
  }

  function macroMtgScore(names, ctx) {
    const pie = MTG();
    if (!pie || names.length < 2) return { score: 0, detail: null };

    const { byName, metaMap, oppNames = [] } = ctx;
    const vs = profiles(names, byName, metaMap);
    const vectors = vs.map((p) => ({ name: p.name, colors: p.colors })).filter((p) => p.colors);
    const macroFn = pie.teamMacroIdentityScore || pie.colorCoherence;
    const coherence = macroFn(vectors);
    let score = coherence.score;

    let beatdown = null;
    if (oppNames.length) {
      const oppVs = profiles(oppNames, byName, metaMap);
      beatdown = pie.analyzeBeatdownMatchup(vs, oppVs);
      score += Math.max(-45, Math.min(120, (beatdown.alignmentBonus || 0) * 2.5));
    }

    return {
      score: Math.round(Math.max(0, Math.min(580, score))),
      detail: { coherence, beatdown },
    };
  }

  /** Profil draft enrichi par champion. */
  function buildProfile(champ, meta) {
    const name = champ.name;
    const m = meta?.[name] || {};
    const colors = getColorIdentity(champ, meta);
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
      colors,
      championClass: CL()?.getProfile?.(name) || null,
      subclass: CL()?.getProfile?.(name)?.primary || null,
    };
  }

  function profiles(names, byName, meta) {
    return names.map((n) => buildProfile(getData(byName, meta, n), meta));
  }

  function normNameKey(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function archetypeHitCount(archetype, names) {
    if (!archetype?.champs?.length) return 0;
    const hitSet = new Set(names.map(normNameKey));
    let hits = 0;
    for (const c of archetype.champs) {
      if (hitSet.has(normNameKey(c))) hits++;
    }
    return hits;
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

    const scalingCarries = vs.filter((v) => v.isMarksman || (v.carry || 0) >= 0.55 || v.compTypes?.includes("hypercarry")).length;
    const marksmanCount = vs.filter((v) => v.isMarksman).length;
    const peelTotal = axes.peel;
    const hasEnchanter = vs.some((v) => v.familyKey === "support_enchanter" || (v.tags?.has?.("peel") && v.tags?.has?.("support")));
    const diveAssassins = vs.filter((v) => v.tags?.has?.("dive") || v.tags?.has?.("assassin")).length;
    const globalCount = vs.filter((v) => v.compTypes?.includes("pick_global") || v.tags?.has?.("global")).length;
    const protectedCarry = marksmanCount >= 1 && hasEnchanter && diveAssassins === 0;

    if (diveAssassins >= 1 && !protectedCarry) {
      plan = globalCount >= 1 ? "pick_global" : "beatdown";
      completeness = 28 + diveAssassins * 14 + (globalCount >= 2 ? 16 : 0) + (axes.engage >= 1 ? 10 : 0);
    } else if (protectedCarry || (hyper >= 1 && marksmanCount >= 1 && peelTotal >= 1.0)) {
      plan = "hypercarry";
      completeness = 22 + scalingCarries * 12 + (hasEnchanter ? 32 : 0) + (peelTotal >= 1.5 ? 18 : peelTotal >= 0.9 ? 10 : 0);
      if (axes.front < 1) gaps.push("frontline");
      if (peelTotal < 0.8) gaps.push("peel");
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
    const cl = CL();
    if (cl?.teamClassGapPenalty && vs.length >= 4) {
      const cg = cl.teamClassGapPenalty(vs);
      score += Math.round(cg.score * urg * 0.28);
      for (const g of cg.gaps || []) if (!gaps.includes(g)) gaps.push(g);
    }
    if (cl?.teamClassDiversity && vs.length >= 4) {
      score += Math.round(cl.teamClassDiversity(vs).score * 0.22);
    }
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
      coachingAdj += (mixTotal / Math.max(1, names.length)) * 2.4;
      const archetype = ck.detectArchetypeComp(names);
      if (archetype) coachingAdj += archetypeHitCount(archetype, names) * 18;
    }

    let mtgAdj = 0;
    const pie = MTG();
    if (pie && vs.length >= 2) {
      const mtgVec = vs.map((p) => ({ name: p.name, colors: p.colors })).filter((p) => p.colors);
      const macroFn = pie.teamMacroIdentityScore || pie.colorCoherence;
      const mtgCoh = macroFn(mtgVec);
      mtgAdj = mtgCoh.score;
      if (oppNames.length) {
        const beat = pie.analyzeBeatdownMatchup(vs, oppVs);
        mtgAdj += beat.alignmentBonus || 0;
      }
    }

    const pillarTotal = combineEqualPillars([
      normalizePillar(bal.score, 85),
      normalizePillar(syn, 280),
      normalizePillar(ctr, 120),
      normalizePillar(arch.completeness * 1.15, 115),
      normalizePillar(coachingAdj, 90),
      normalizePillar(mtgAdj, 220),
    ]);
    const total = Math.round(pillarTotal * TEAM_PILLAR_SCALE);
    return {
      total,
      vs,
      gaps: bal.gaps,
      archetype: arch,
      breakdown: { balance: bal.score, synergy: syn, counter: ctr, coaching: coachingAdj, mtg: mtgAdj },
    };
  }

  /** Macro tab — familles (draft.txt #1): cohérence, templates, archétypes, mix. */
  function macroFamilyScore(names, byName, metaMap) {
    const vs = profiles(names, byName, metaMap);
    const arch = detectArchetype(vs);
    let score = Math.round(arch.completeness * 2.1);
    const ck = CK();
    if (!ck || names.length < 2) return score;

    let coherence = 0;
    for (const n of names) {
      coherence += ck.familyCoherence(n, names.filter((x) => x !== n)).score;
    }
    score += Math.round(coherence / names.length);

    const archetype = ck.detectArchetypeComp(names);
    if (archetype) {
      const archHits = archetypeHitCount(archetype, names);
      score += archHits * 16;
      if (archHits >= 3) score += 18;
    }

    const tpl = ck.detectTemplate(names);
    if (tpl) {
      const hitSet = new Set(names.map(normNameKey));
      let tplHits = 0;
      for (const c of tpl.champs || []) {
        if (hitSet.has(normNameKey(c))) tplHits++;
      }
      if (tplHits >= 3) score += 32;
      else if (tplHits >= 2) score += 22;
    }

    let mix = 0;
    for (const n of names) mix += ck.familyMixPenalty(n, names.filter((x) => x !== n)).score;
    score += Math.round((mix * (ck.WEIGHTS?.mix || 3) / 3 / names.length) * 2.2);

    const tags = names.map((n) => {
      const key = normNameKey(n);
      if (ck.FAMILY_TAGS?.engage?.has(key)) return "engage";
      if (ck.FAMILY_TAGS?.disengage?.has(key)) return "disengage";
      if (ck.FAMILY_TAGS?.range?.has(key)) return "range";
      return null;
    }).filter(Boolean);
    if (tags.length >= 3) {
      const counts = {};
      for (const t of tags) counts[t] = (counts[t] || 0) + 1;
      const dominant = Math.max(...Object.values(counts));
      if (dominant / tags.length >= 0.75) score += 14;
    }

    return Math.round(score);
  }

  /** Macro tab — synergie (draft.txt #2–3): pairings, combos coaching, trinité, counters matchup. */
  function macroSynergyScore(names, ctx) {
    const { byName, metaMap, oppNames = [] } = ctx;
    const vs = profiles(names, byName, metaMap);
    let synergy = Math.round(pairingSynergy(vs));
    const ck = CK();

    if (ck && names.length >= 2) {
      let coachingSyn = 0;
      let trinity = 0;
      let anti = 0;
      for (const n of names) {
        const allies = names.filter((x) => x !== n);
        coachingSyn += ck.coachingSynergyScore(n, allies).score;
        trinity += ck.trinityBonus(n, allies).score;
        anti += ck.antiSynergyPenalty(n, allies).score;
      }
      const n = names.length;
      synergy += Math.round((coachingSyn / n) * (ck.WEIGHTS?.combo || 2));
      synergy += Math.round((trinity / n) * (ck.WEIGHTS?.trinity || 1.4));
      synergy += Math.round((anti / n) * (ck.WEIGHTS?.anti || 2.5));
    }

    if (oppNames.length && names.length >= 2) {
      let ctrEdge = 0;
      for (const n of names) {
        const v = buildProfile(getData(byName, metaMap, n), metaMap);
        for (const e of oppNames) {
          ctrEdge += listScore(e, v.counters, CTR_W);
          const ep = buildProfile(getData(byName, metaMap, e), metaMap);
          ctrEdge -= Math.round(listScore(n, ep.counters, CTR_W) * 0.38);
        }
      }
      synergy += Math.round((ctrEdge / Math.max(1, names.length)) * 0.42);
    }

    return Math.round(synergy);
  }

  /** Macro tab — même moteur que draft (evaluateTeamInternal / evaluateDraftDuel). */
  function evaluateTeamMacro(names, ctx) {
    return evaluateTeamInternal(names, ctx);
  }

  function compsToDraftState(ourComp, enemyComp) {
    const toPicks = (comp) => {
      const picks = [];
      let order = 1;
      for (const slot of COACH_SLOT_ORDER) {
        const name = comp?.[slot];
        if (name) picks.push({ name, slot, order: order++, pinned: true });
      }
      return picks;
    };
    return {
      picks: { blue: toPicks(ourComp || {}), red: toPicks(enemyComp || {}) },
      bans: { blue: Array(5).fill(null), red: Array(5).fill(null) },
      ourSide: "blue",
      stepIndex: 10,
    };
  }

  function teamNamesToDraftState(teamNames, enemyNames, side = "our") {
    const ours = side === "enemy" || side === "red" ? enemyNames || [] : teamNames || [];
    const theirs = side === "enemy" || side === "red" ? teamNames || [] : enemyNames || [];
    const assign = (names, ontoBlue) => {
      const out = [];
      let order = 1;
      for (let i = 0; i < names.length; i += 1) {
        out.push({
          name: names[i],
          slot: COACH_SLOT_ORDER[i] || null,
          order: order++,
          pinned: false,
        });
      }
      return out;
    };
    const blue = side === "enemy" || side === "red" ? assign(theirs, true) : assign(ours, true);
    const red = side === "enemy" || side === "red" ? assign(ours, false) : assign(theirs, false);
    return {
      picks: { blue, red },
      bans: { blue: Array(5).fill(null), red: Array(5).fill(null) },
      ourSide: "blue",
      stepIndex: 10,
    };
  }

  function macroPickCtx(slot, ctx) {
    const {
      teamNames,
      enemyNames,
      byName,
      metaMap,
      side = "our",
      allowOffRole,
      ourComp,
      enemyComp,
      state,
      depth,
    } = ctx;
    const draftSide = side === "enemy" || side === "red" ? "red" : "blue";
    const draftState =
      state ||
      (ourComp && enemyComp
        ? compsToDraftState(ourComp, enemyComp)
        : teamNamesToDraftState(teamNames, enemyNames, side));
    const pickCount =
      (draftState.picks?.blue?.length || 0) + (draftState.picks?.red?.length || 0);
    return {
      state: draftState,
      side: draftSide,
      byName,
      meta: metaMap,
      depth: depth ?? Math.min(1, pickCount / 10),
      hintSlot: slot,
      focusSlot: slot,
      allowOffRole: allowOffRole === true,
    };
  }

  function teamTypeCounts(vs) {
    const counts = {};
    for (const v of vs) {
      for (const t of v.compTypes || []) counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }

  function teamEnchanterCount(vs) {
    const ench = IX()?.MECH?.enchanter;
    return vs.filter(
      (v) => v.familyKey === "support_enchanter" || (ench?.has?.(nameLookupKey(v.name)))
    ).length;
  }

  function isProtectedHypercarryTeam(vs, plan) {
    if (plan !== "hypercarry" && plan !== "front_to_back") return false;
    const peel = sumKey(vs, "peel");
    const scale = sumKey(vs, "scaling");
    const marksman = vs.filter((v) => v.isMarksman).length;
    return marksman >= 1 && teamEnchanterCount(vs) >= 1 && peel >= 1.0 && scale >= 0.8;
  }

  function primaryTeamPlan(vs) {
    const counts = teamTypeCounts(vs);
    const arch = detectArchetype(vs);
    const metrics = IX()?.buildTeamMetrics?.(vs) || {};
    const poke = (counts.poke_siege || 0) + (counts.poke_disengage || 0);
    const engage = (counts.teamfight_engage || 0) + (counts.all_in || 0);
    const hyper = counts.hypercarry || 0;
    const split = counts.split_push || 0;
    const pick = counts.pick_global || 0;
    const tempo = counts.lane_tempo || 0;
    const peelSum = sumKey(vs, "peel");
    const scaleSum = sumKey(vs, "scaling");
    const marksman = vs.filter((v) => v.isMarksman).length;
    const frontCount = vs.filter((v) => v.tags?.has?.("frontline")).length;
    const enchanterN = metrics.enchanter || teamEnchanterCount(vs);

    if (poke >= 2 && poke >= engage) {
      return (counts.poke_disengage || 0) >= (counts.poke_siege || 0) ? "poke_disengage" : "poke_siege";
    }
    // ADC protégé — un seul marksman bot (pas TF + Ezreal split)
    if (marksman === 1 && enchanterN >= 1 && peelSum >= 1.0 && scaleSum >= 0.8) return "hypercarry";
    if (split >= 2 || metrics.split >= 2) return "split_push";
    // Pick/dive (Galio/Naafiri/Bard) — avant le tag engage d'un seul tank
    if (pick >= 2) return "pick_global";
    if (arch.plan === "pick_global" || arch.plan === "beatdown") {
      if (metrics.dive >= 1 || metrics.global >= 2 || pick >= 1) return arch.plan;
    }
    if (pick >= 1 && metrics.global >= 2) return "pick_global";
    if (engage >= 2 || ((counts.teamfight_engage || 0) >= 1 && engage >= hyper + 1 && pick < 2 && metrics.global < 2)) {
      return (counts.teamfight_engage || 0) >= (counts.all_in || 0) ? "teamfight_engage" : "all_in";
    }
    // ADC + peel sans enchanter explicite
    if (marksman >= 1 && enchanterN >= 1 && peelSum >= 1.1 && scaleSum >= 0.88) return "hypercarry";
    if (marksman >= 1 && peelSum >= 1.2 && scaleSum >= 1.0 && (hyper >= 1 || enchanterN >= 1)) return "hypercarry";
    if (marksman >= 1 && peelSum >= 1.0 && frontCount >= 1 && (counts.front_to_back || 0) >= 1) return "front_to_back";
    if (hyper >= 1 && peelSum >= 1.1 && scaleSum >= 0.8 && engage < 2) return "hypercarry";
    if (hyper >= 2) return "hypercarry";
    if (split >= 1 && metrics.global >= 2) return "split_push";
    if (pick >= 1) return "pick_global";
    if (tempo >= 2) return "lane_tempo";
    return arch.plan || null;
  }

  function dominantCompPlan(vs) {
    return primaryTeamPlan(vs);
  }

  function teamPatternBonus(vs) {
    const counts = teamTypeCounts(vs);
    let bonus = 0;
    const poke = (counts.poke_siege || 0) + (counts.poke_disengage || 0);
    const engage = (counts.teamfight_engage || 0) + (counts.all_in || 0);
    if (poke >= 3) bonus += 52;
    else if (poke >= 2) bonus += 28;
    if (engage >= 3) bonus += 48;
    else if (engage >= 2) bonus += 26;
    if ((counts.hypercarry || 0) >= 2 && vs.some((v) => v.tags?.has?.("peel"))) bonus += 32;
    const ck = CK();
    if (ck?.FAMILY_TAGS) {
      const tags = vs.map((v) => {
        const key = normNameKey(v.name);
        if (ck.FAMILY_TAGS.engage?.has(key)) return "engage";
        if (ck.FAMILY_TAGS.disengage?.has(key)) return "disengage";
        if (ck.FAMILY_TAGS.range?.has(key)) return "range";
        return null;
      }).filter(Boolean);
      if (tags.length >= 3) {
        const dom = Math.max(...["engage", "disengage", "range"].map((t) => tags.filter((x) => x === t).length));
        if (dom / tags.length >= 0.7) bonus += 22;
      }
    }
    return bonus;
  }

  function teamWomboPower(vs) {
    let power = 0;
    const reasons = [];
    for (let i = 0; i < vs.length; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        if (isWomboPair(vs[i].name, vs[j].name)) {
          power += 58;
          reasons.push(`Wombo ${vs[i].name}+${vs[j].name}`);
        }
        const ck = CK();
        if (ck?.countComboLinks) {
          const links = ck.countComboLinks(vs[i].name, [vs[j].name]);
          if (links >= 2) {
            power += 16 + links * 9;
            reasons.push(`Combo ${vs[i].name}+${vs[j].name}`);
          }
        }
        if (vs[i].spells?.knockup && vs[j].spells?.aoe) power += 18;
      }
    }
    return { power, reasons };
  }

  function internalCoachingScore(names) {
    const ck = CK();
    if (!ck || names.length < 2) return 0;
    let mix = 0;
    for (const n of names) mix += ck.familyMixPenalty(n, names.filter((x) => x !== n)).score;
    let score = Math.round((mix / names.length) * 2.8);
    const archetype = ck.detectArchetypeComp(names);
    if (archetype) score += archetypeHitCount(archetype, names) * 28;
    const tpl = ck.detectTemplate(names);
    if (tpl) {
      const hitSet = new Set(names.map(normNameKey));
      const hits = (tpl.champs || []).filter((c) => hitSet.has(normNameKey(c))).length;
      if (hits >= 3) score += 42;
      else if (hits >= 2) score += 26;
    }
    return score;
  }

  function winConditionScore(vs, names, byName, metaMap) {
    const arch = detectArchetype(vs);
    arch.plan = primaryTeamPlan(vs) || arch.plan;
    arch.label = COMP_LABELS[arch.plan] || arch.label;
    let score = Math.round(arch.completeness * 6.5);
    if (arch.plan) score += 95;
    const gapCount = (arch.gaps || []).length;
    for (const g of arch.gaps || []) {
      if (g === "frontline") score -= 72;
      else if (g === "peel") score -= 58;
      else score -= 38;
    }
    if (isProtectedHypercarryTeam(vs, arch.plan)) score += 28;
    if (gapCount === 0 && arch.completeness >= 85) score += 18;
    const ck = CK();
    if (ck && names.length >= 2) {
      const archetype = ck.detectArchetypeComp(names);
      if (archetype) score += archetypeHitCount(archetype, names) * 58;
    }
    const plan = primaryTeamPlan(vs);
    if (plan) {
      const typeCounts = teamTypeCounts(vs);
      score += Math.min(120, (typeCounts[plan] || 0) * 28);
    }
    return Math.round(score);
  }

  function internalIncoherencePenalty(vs) {
    const plan = dominantCompPlan(vs);
    if (!plan) return 0;
    const types = new Set();
    for (const v of vs) for (const t of v.compTypes || []) types.add(t);
    let penalty = 0;
    for (const [a, b] of INCOMPATIBLE_COMP_PAIRS) {
      if (types.has(a) && types.has(b)) penalty -= 22;
    }
    return penalty;
  }

  /** Standalone team quality — synergy, family, balance, coaching, MTG identity. */
  function evaluateTeamInternal(names, ctx) {
    const { byName, metaMap } = ctx;
    const vs = profiles(names, byName, metaMap);
    const synergyRaw = macroSynergyScore(names, { byName, metaMap, oppNames: [] });
    const synergy = Math.min(400, synergyRaw);
    const family = macroFamilyScore(names, byName, metaMap);
    const bal = teamBalance(vs, 0);
    const arch = detectArchetype(vs);
    arch.plan = primaryTeamPlan(vs) || arch.plan;
    arch.label = COMP_LABELS[arch.plan] || arch.label;
    arch.gapCount = (arch.gaps || []).length;
    const mtgBlock = macroMtgScore(names, { byName, metaMap, oppNames: [] });
    const coaching = internalCoachingScore(names) + internalIncoherencePenalty(vs) + teamPatternBonus(vs);
    const winCondition = winConditionScore(vs, names, byName, metaMap);
    const wombo = teamWomboPower(vs);
    const clBlock = CL()?.teamClassDiversity?.(vs) || { score: 0 };
    const clGap = CL()?.teamClassGapPenalty?.(vs) || { score: 0 };
    const classScore = Math.round(clBlock.score * 0.45 + clGap.score * 0.35);
    const pillarTotal = combineEqualPillars([
      normalizePillar(winCondition, 380),
      normalizePillar(synergy, 320),
      normalizePillar(family, 300),
      normalizePillar(bal.score, 90),
      normalizePillar(coaching, 130),
      normalizePillar(mtgBlock.score, 260),
      normalizePillar(wombo.power, 95),
      normalizePillar(classScore, 75),
    ]);
    const total = Math.round(pillarTotal * TEAM_PILLAR_SCALE);
    return {
      total,
      vs,
      archetype: arch,
      breakdown: {
        synergy,
        family,
        balance: bal.score,
        coaching,
        winCondition,
        archetype: winCondition,
        mtg: mtgBlock.score,
        wombo: Math.round(wombo.power * 0.32),
        classes: classScore,
      },
      wombo,
      mtgDetail: mtgBlock.detail,
    };
  }

  /** One champ vs one champ — counters, style clash, wombo links, ability rules. */
  function pairwiseChampEdge(ourV, enemyV) {
    let our = 0;
    let enemy = 0;
    const reasons = [];

    const ctrUs = listScore(enemyV.name, ourV.counters, CTR_W);
    const ctrThem = listScore(ourV.name, enemyV.counters, CTR_W);
    our += ctrUs;
    enemy += Math.round(ctrThem * 0.52);
    if (ctrUs >= 18) reasons.push(`${ourV.name} > ${enemyV.name}`);
    if (ctrThem >= 18) reasons.push(`${enemyV.name} > ${ourV.name}`);

    const ix = IX();
    if (ix?.evaluateChampPair) {
      const extra = ix.evaluateChampPair(ourV, enemyV);
      our += extra.our;
      enemy += extra.enemy;
      reasons.push(...(extra.reasons || []));
    } else {
      if (ourV.peel >= 0.55 && enemyV.engage >= 0.5) {
        our += 7;
        reasons.push(`${ourV.name} peel vs engage`);
      }
      if (enemyV.peel >= 0.55 && ourV.engage >= 0.5) enemy += 7;
      if (ourV.tags?.has?.("poke") && enemyV.tags?.has?.("frontline") && enemyV.scaling < 0.5) our += 5;
      if (enemyV.tags?.has?.("poke") && ourV.tags?.has?.("frontline") && ourV.scaling < 0.5) enemy += 5;
      if (ourV.burst >= 0.55 && enemyV.isMarksman) our += 6;
      if (enemyV.burst >= 0.55 && ourV.isMarksman) enemy += 6;
    }

    const ck = CK();
    if (ck?.coachingSynergyScore) {
      const syn = ck.coachingSynergyScore(ourV.name, [enemyV.name]).score;
      if (syn < -8) {
        enemy += Math.round(Math.abs(syn) * 0.35);
        reasons.push(`Anti-synergie ${ourV.name}/${enemyV.name}`);
      }
    }

    const cl = CL();
    if (cl?.pairClassEdge) {
      const ce = cl.pairClassEdge(ourV.name, enemyV.name, { lane: false });
      our += Math.round(ce.our * 0.4);
      enemy += Math.round(ce.enemy * 0.4);
      if (ce.reason && (ce.our >= 10 || ce.enemy >= 10)) reasons.push(ce.reason);
    }

    return { our, enemy, reasons: [...new Set(reasons)] };
  }

  function laneMatchupEdge(ourV, enemyV, slot, ctx) {
    const w = LANE_MATCHUP_WEIGHT[slot] || 1;
    const tierUs = (TIER_PTS[ourV.tierMeta] || 10) - (TIER_PTS[enemyV.tierMeta] || 10);
    const reasons = [];

    const kit = LML()?.laneKitEdge?.(ourV, enemyV, slot, ctx);
    let our = kit ? Math.round(kit.our * w) : 0;
    let enemy = kit ? Math.round(kit.enemy * w) : 0;

    if (kit?.reasons?.length) reasons.push(...kit.reasons);

    const curated = IX()?.evaluateChampPair?.(ourV, enemyV);
    if (curated) {
      our += Math.round(curated.our * 0.35 * w);
      enemy += Math.round(curated.enemy * 0.35 * w);
      for (const r of curated.reasons || []) {
        if (r.includes(">")) reasons.push(r.replace(/^[^:]+:\s*/, ""));
      }
    }

    if (tierUs >= 8) our += 8;
    else if (tierUs <= -8) enemy += 8;
    else if (tierUs >= 4) our += 4;
    else if (tierUs <= -4) enemy += 4;

    if (ourV.counteredBy?.includes(enemyV.name)) enemy += 14;
    if (enemyV.counteredBy?.includes(ourV.name)) our += 14;

    const cl = CL();
    if (cl?.pairClassEdge) {
      const ce = cl.pairClassEdge(ourV.name, enemyV.name, { lane: true });
      our += Math.round(ce.our * w);
      enemy += Math.round(ce.enemy * w);
      if (ce.reason && (ce.our >= 8 || ce.enemy >= 8)) reasons.push(ce.reason);
    }

    const label = SLOT_LABELS[slot] || slot;
    return {
      our,
      enemy,
      reasons: [...new Set(reasons)].map((r) => (r.startsWith(label) ? r : `${label}: ${r}`)),
    };
  }

  function laneMatchupNote(ourName, enemyName, ourV, enemyV, margin, reasons, slot) {
    if (reasons.length) {
      const top = reasons.find((r) => r.includes(">")) || reasons[0];
      if (top) return top.replace(/^[^:]+:\s*/, "");
    }
    if (margin >= 14) return `${ourName} domine ${enemyName} sur ${SLOT_LABELS[slot] || slot}.`;
    if (margin >= 5) return `${ourName} favorable — prio vague et plates.`;
    if (margin > 0) return `${ourName} léger avantage — skill check mais lane playable.`;
    if (margin <= -14) return `${enemyName} domine — joue disengage/scale.`;
    if (margin <= -5) return `${enemyName} favorable — respecte le spike adverse.`;
    return `${enemyName} léger avantage — farm safe et jungle prio.`;
  }

  /** 1v1 lane — toujours un gagnant (pas d'égal MOBA). */
  function scoreLaneMatchup(ourName, enemyName, slot, byName, metaMap) {
    if (!ourName || !enemyName) return { verdict: "unknown", margin: 0, note: "Lane incomplète." };
    const ourV = buildProfile(getData(byName, metaMap, ourName), metaMap);
    const enemyV = buildProfile(getData(byName, metaMap, enemyName), metaMap);
    const edge = laneMatchupEdge(ourV, enemyV, slot, { metaMap });
    let margin = edge.our - edge.enemy;

    if (margin === 0) {
      const tierD = (TIER_PTS[ourV.tierMeta] || 10) - (TIER_PTS[enemyV.tierMeta] || 10);
      if (tierD !== 0) margin = tierD > 0 ? 3 : -3;
      else if (Math.abs(ourV.early - enemyV.early) > 0.04) margin = ourV.early > enemyV.early ? 2 : -2;
      else if (Math.abs(ourV.carry - enemyV.carry) > 0.04) margin = ourV.carry > enemyV.carry ? 2 : -2;
      else margin = ourName.localeCompare(enemyName, "fr") >= 0 ? 1 : -1;
    }

    const verdict = margin >= 0 ? "win" : "lose";
    return {
      verdict,
      margin,
      note: laneMatchupNote(ourName, enemyName, ourV, enemyV, margin, edge.reasons, slot),
    };
  }

  function jungleCrossEdge(jungleV, laneV, laneSlot) {
    const w = JGL_GANK_WEIGHT[laneSlot] || 0.3;
    let our = 0;
    let enemy = 0;
    const ctr = listScore(laneV.name, jungleV.counters, CTR_W);
    const ctrBack = listScore(jungleV.name, laneV.counters, CTR_W);
    our += Math.round(ctr * w);
    enemy += Math.round(ctrBack * w * 0.55);
    if (jungleV.early >= 0.45 && laneV.peel < 0.45) our += Math.round(8 * w);
    if (laneV.early >= 0.45 && jungleV.peel < 0.45) enemy += Math.round(8 * w);
    return { our, enemy };
  }

  function planClashEdge(ourVs, enemyVs) {
    const ourPlan = primaryTeamPlan(ourVs);
    const enemyPlan = primaryTeamPlan(enemyVs);
    let our = 0;
    let enemy = 0;
    const reasons = [];
    const hits = [];

    function skipVictimsProtectedHyper(victimPlan, victimVs) {
      if (victimPlan !== "hypercarry" && victimPlan !== "front_to_back") return false;
      return isProtectedHypercarryTeam(victimVs, victimPlan);
    }

    for (const [counter, victim] of COMP_TYPE_COUNTERS) {
      if (ourPlan === counter && enemyPlan === victim) {
        if (skipVictimsProtectedHyper(victim, enemyVs)) continue;
        if (counter === "teamfight_engage" && victim === "hypercarry") continue;
        if (counter === "pick_global" && victim === "hypercarry" && isProtectedHypercarryTeam(enemyVs, victim)) continue;
        our += counter === "teamfight_engage" ? 165 : 205;
        reasons.push(`Win condition : ${COMP_LABELS[counter] || counter} > ${COMP_LABELS[victim] || victim}`);
      }
      if (enemyPlan === counter && ourPlan === victim) {
        if (skipVictimsProtectedHyper(victim, ourVs)) continue;
        if (counter === "teamfight_engage" && victim === "hypercarry") continue;
        if (counter === "pick_global" && victim === "hypercarry" && isProtectedHypercarryTeam(ourVs, victim)) continue;
        enemy += counter === "teamfight_engage" ? 165 : 205;
        reasons.push(`Win condition : ${COMP_LABELS[counter] || counter} > ${COMP_LABELS[ourPlan] || ourPlan}`);
      }
    }

    const ourArch = detectArchetype(ourVs);
    const enemyArch = detectArchetype(enemyVs);

    const ix = IX();
    if (ix?.evaluateCompClashes) {
      const clash = ix.evaluateCompClashes(ourVs, enemyVs, ourPlan, enemyPlan, ourArch, enemyArch);
      our += Math.round(clash.our * 0.82);
      enemy += Math.round(clash.enemy * 0.82);
      for (const h of clash.hits || []) {
        reasons.push(h.reason);
        hits.push({ ...h, edge: Math.round(h.edge * 0.72) });
      }
    } else {
      const ourRange = ourVs.filter((v) => v.tags?.has?.("poke")).length;
      const enemyRange = enemyVs.filter((v) => v.tags?.has?.("poke")).length;
      const ourEngage = ourVs.filter((v) => v.engage >= 0.45 || (v.compTypes || []).includes("teamfight_engage")).length;
      const enemyEngage = enemyVs.filter((v) => v.engage >= 0.45 || (v.compTypes || []).includes("teamfight_engage")).length;
      if (ourRange >= 2 && enemyEngage >= 2) {
        our += 38;
        reasons.push("Range/poke kite vs engage");
      }
      if (enemyRange >= 2 && ourEngage >= 2) {
        enemy += 38;
        reasons.push("Range/poke kite vs engage");
      }
      if (ourArch.plan === "hypercarry" && (enemyPlan === "all_in" || enemyPlan === "lane_tempo")) enemy += 22;
      if (enemyArch.plan === "hypercarry" && (ourPlan === "all_in" || ourPlan === "lane_tempo")) our += 22;
      if (ourPlan === "teamfight_engage" && enemyArch.gaps?.includes("frontline")) our += 14;
      if (enemyPlan === "teamfight_engage" && ourArch.gaps?.includes("frontline")) enemy += 14;
      if (enemyPlan === "hypercarry" && ourPlan === "teamfight_engage") {
        const enemyPeel = sumKey(enemyVs, "peel");
        const enemyScale = sumKey(enemyVs, "scaling");
        if (enemyPeel >= 1.4 && enemyScale >= 1.0) {
          enemy += 165;
          reasons.push("Hypercarry protégé > engage frontal");
        }
      }
      if (ourPlan === "hypercarry" && enemyPlan === "teamfight_engage") {
        const ourPeel = sumKey(ourVs, "peel");
        const ourScale = sumKey(ourVs, "scaling");
        if (ourPeel >= 1.4 && ourScale >= 1.0) {
          our += 165;
          reasons.push("Hypercarry protégé > engage frontal");
        }
      }
    }

    return { our, enemy, ourPlan, enemyPlan, reasons: [...new Set(reasons)], hits };
  }

  /**
   * Full cross-draft interaction matrix — every our×enemy champ + lane matchups + jungle
   * + win-condition clash + MTG beatdown + color hosers + wombo threats.
   */
  function crossDraftInteractions(ourVs, enemyVs, ourComp, enemyComp, ctx) {
    const { byName, metaMap } = ctx;
    let ourEdge = 0;
    let enemyEdge = 0;
    const topPairs = [];
    const pie = MTG();

    for (const u of ourVs) {
      for (const e of enemyVs) {
        const pair = pairwiseChampEdge(u, e);
        ourEdge += pair.our;
        enemyEdge += pair.enemy;
        const net = pair.our - pair.enemy;
        if (Math.abs(net) >= 12 && pair.reasons.length) {
          topPairs.push({ our: u.name, enemy: e.name, edge: net, reason: pair.reasons[0] });
        }
      }
    }

    for (const slot of SLOTS) {
      const on = ourComp?.[slot];
      const en = enemyComp?.[slot];
      if (!on || !en) continue;
      const u = buildProfile(getData(byName, metaMap, on), metaMap);
      const e = buildProfile(getData(byName, metaMap, en), metaMap);
      const lane = laneMatchupEdge(u, e, slot, ctx);
      ourEdge += Math.round(lane.our * LANE_CROSS_DUEL_WEIGHT);
      enemyEdge += Math.round(lane.enemy * LANE_CROSS_DUEL_WEIGHT);
      const net = Math.round((lane.our - lane.enemy) * LANE_CROSS_DUEL_WEIGHT);
      if (Math.abs(net) >= 10) {
        topPairs.push({ our: on, enemy: en, edge: net, reason: lane.reasons[0] || `${slot} matchup` });
      }
    }

    const ourJgl = ourComp?.Jungle;
    const enemyJgl = enemyComp?.Jungle;
    if (ourJgl) {
      const jv = buildProfile(getData(byName, metaMap, ourJgl), metaMap);
      for (const laneSlot of ["Top", "Mid", "Bot"]) {
        const target = enemyComp?.[laneSlot];
        if (!target) continue;
        const lv = buildProfile(getData(byName, metaMap, target), metaMap);
        const g = jungleCrossEdge(jv, lv, laneSlot);
        ourEdge += g.our;
        enemyEdge += g.enemy;
      }
    }
    if (enemyJgl) {
      const jv = buildProfile(getData(byName, metaMap, enemyJgl), metaMap);
      for (const laneSlot of ["Top", "Mid", "Bot"]) {
        const target = ourComp?.[laneSlot];
        if (!target) continue;
        const lv = buildProfile(getData(byName, metaMap, target), metaMap);
        const g = jungleCrossEdge(jv, lv, laneSlot);
        enemyEdge += g.our;
        ourEdge += g.enemy;
      }
    }

    const plan = planClashEdge(ourVs, enemyVs);
    ourEdge += plan.our;
    enemyEdge += plan.enemy;
    if (plan.reasons.length) {
      topPairs.push({ our: plan.ourPlan || "?", enemy: plan.enemyPlan || "?", edge: plan.our - plan.enemy, reason: plan.reasons[0] });
    }
    for (const h of plan.hits || []) {
      if (Math.abs(h.edge) >= 55) {
        topPairs.push({ our: h.our || plan.ourPlan, enemy: h.enemy || plan.enemyPlan, edge: h.edge, reason: h.reason });
      }
    }

    const ix = IX();
    if (ix?.evaluateTeamTraitClashes) {
      const teamIx = ix.evaluateTeamTraitClashes(ourVs, enemyVs);
      ourEdge += Math.round(teamIx.our * 0.6);
      enemyEdge += Math.round(teamIx.enemy * 0.6);
      for (const h of teamIx.hits || []) {
        if (Math.abs(h.edge) >= 35) topPairs.push(h);
      }
    }

    const cl = CL();
    if (cl?.teamClassClashEdge) {
      const classIx = cl.teamClassClashEdge(ourVs, enemyVs);
      ourEdge += Math.round(classIx.our * 0.4);
      enemyEdge += Math.round(classIx.enemy * 0.4);
      for (const h of classIx.hits || []) {
        if (Math.abs(h.edge) >= 42) topPairs.push(h);
      }
    }

    const ourWombo = teamWomboPower(ourVs);
    const enemyWombo = teamWomboPower(enemyVs);

    if (pie) {
      const ourColors = ourVs.map((p) => p.colors).filter(Boolean);
      const enemyColors = enemyVs.map((p) => p.colors).filter(Boolean);
      const ourSum = pie.sumVectors(ourColors.map((c) => pie.colorVectorFrom(c)));
      const enemySum = pie.sumVectors(enemyColors.map((c) => pie.colorVectorFrom(c)));

      for (const u of ourVs) {
        const h = pie.colorMatchupPenalty(u.colors, enemySum);
        const capped = Math.max(-16, Math.min(12, h.score));
        ourEdge += capped;
        if (capped <= -10) topPairs.push({ our: u.name, enemy: "MTG", edge: capped, reason: h.reasons[0] || "Hoser couleur" });
      }
      for (const e of enemyVs) {
        const h = pie.colorMatchupPenalty(e.colors, ourSum);
        enemyEdge += Math.max(-16, Math.min(12, h.score));
      }

      const beat = pie.analyzeBeatdownMatchup(ourVs, enemyVs);
      if (beat.alignmentBonus) {
        ourEdge += beat.alignmentBonus;
        if (beat.alignmentBonus < 0) enemyEdge += Math.abs(beat.alignmentBonus) * 0.65;
        if (beat.hint) topPairs.push({ our: beat.ourRole, enemy: beat.enemyRole, edge: beat.alignmentBonus, reason: beat.hint });
      }
    }

    const ck = CK();
    if (ck?.denyComboBanScore) {
      for (const n of ourVs.map((v) => v.name)) {
        const deny = ck.denyComboBanScore(n, enemyVs.map((v) => v.name));
        if (deny.score > 0) enemyEdge += Math.round(deny.score * 0.28);
      }
      for (const n of enemyVs.map((v) => v.name)) {
        const deny = ck.denyComboBanScore(n, ourVs.map((v) => v.name));
        if (deny.score > 0) ourEdge += Math.round(deny.score * 0.28);
      }
    }

    topPairs.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));

    return {
      our: Math.round(ourEdge),
      enemy: Math.round(enemyEdge),
      matchup: Math.round(ourEdge - enemyEdge),
      topPairs: topPairs.slice(0, 12),
      plan,
      ourWombo,
      enemyWombo,
    };
  }

  function duelWinProb(ourTotal, enemyTotal) {
    const margin = ourTotal - enemyTotal;
    if (Math.abs(margin) < 0.5) return { our: 0.5, enemy: 0.5 };
    const raw = 1 / (1 + Math.exp(-margin / 30));
    const our = Math.min(0.94, Math.max(0.06, raw));
    return { our, enemy: 1 - our };
  }

  function duelWinProbFromMargin(margin) {
    if (Math.abs(margin) < 0.5) return { our: 0.5, enemy: 0.5 };
    const raw = 1 / (1 + Math.exp(-margin / 26));
    const our = Math.min(0.94, Math.max(0.06, raw));
    return { our, enemy: 1 - our };
  }

  /** Win % shown in Macro — must match displayed point totals (648 vs 527 → ~55/45). */
  function duelWinProbFromDisplayScores(ourTotal, enemyTotal) {
    const sum = (ourTotal || 0) + (enemyTotal || 0);
    if (sum <= 0) return { our: 0.5, enemy: 0.5 };
    const our = ourTotal / sum;
    return { our, enemy: 1 - our };
  }

  /**
   * Full 5v5 draft duel — internal comp quality + every cross interaction.
   * Used by Macro tab comp prediction (compareComps).
   */
  function evaluateDraftDuel(ourNames, enemyNames, ctx) {
    const { ourComp = {}, enemyComp = {}, byName, metaMap } = ctx;
    const ourInternal = evaluateTeamInternal(ourNames, { byName, metaMap });
    const enemyInternal = evaluateTeamInternal(enemyNames, { byName, metaMap });
    const cross = crossDraftInteractions(
      ourInternal.vs,
      enemyInternal.vs,
      ourComp,
      enemyComp,
      { byName, metaMap }
    );

    let winCondDelta =
      (ourInternal.breakdown.winCondition || 0) - (enemyInternal.breakdown.winCondition || 0);
    const planNet = (cross.plan?.our || 0) - (cross.plan?.enemy || 0);
    const ourSecondary =
      ourInternal.total - (ourInternal.breakdown.winCondition || 0);
    const enemySecondary =
      enemyInternal.total - (enemyInternal.breakdown.winCondition || 0);
    const secondaryDelta = ourSecondary - enemySecondary;
    const crossNet = cross.our - cross.enemy;
    const crossWithoutPlan = crossNet - planNet;
    const ourPlan = cross.plan?.ourPlan;
    const enemyPlan = cross.plan?.enemyPlan;
    const ourGaps = ourInternal.archetype?.gapCount ?? (ourInternal.archetype?.gaps || []).length;
    const enemyGaps = enemyInternal.archetype?.gapCount ?? (enemyInternal.archetype?.gaps || []).length;
    const gapDelta = enemyGaps - ourGaps;

    if (Math.abs(planNet) >= 70 && planNet * winCondDelta < 0) {
      winCondDelta = Math.round(winCondDelta * 0.42);
    } else if (Math.abs(planNet) >= 100 && planNet * winCondDelta > 0) {
      winCondDelta = Math.round(winCondDelta * 0.55);
    }

    const marginPillars = [
      normalizePillar(winCondDelta, 280),
      normalizePillar(planNet, 160),
      normalizePillar(gapDelta, 4),
      normalizePillar(secondaryDelta, 260),
      normalizePillar(crossWithoutPlan, 360),
      normalizePillar(cross.matchup, 320),
    ];
    let margin = Math.round(combineEqualPillars(marginPillars) * DUEL_PILLAR_SCALE);

    const ourPeel = sumKey(ourInternal.vs, "peel");
    const enemyPeel = sumKey(enemyInternal.vs, "peel");
    const ourScale = sumKey(ourInternal.vs, "scaling");
    const enemyScale = sumKey(enemyInternal.vs, "scaling");
    const ourEnch = teamEnchanterCount(ourInternal.vs);
    const enemyEnch = teamEnchanterCount(enemyInternal.vs);
    const engagePlans = new Set(["teamfight_engage", "pick_global", "beatdown", "all_in", "lane_tempo"]);
    const ourProtected = isProtectedHypercarryTeam(ourInternal.vs, ourPlan);
    const enemyProtected = isProtectedHypercarryTeam(enemyInternal.vs, enemyPlan);
    const bothMarksmanScale =
      ourInternal.vs.some((v) => v.isMarksman) &&
      enemyInternal.vs.some((v) => v.isMarksman) &&
      ourPeel >= 1.0 &&
      enemyPeel >= 1.0;

    if (engagePlans.has(ourPlan) && enemyProtected && margin < 0) {
      margin = Math.max(margin, -340);
    } else if (engagePlans.has(enemyPlan) && ourProtected && margin > 0) {
      margin = Math.min(margin, 340);
    }

    const symmetricHyperMirror =
      ourPlan === enemyPlan &&
      (ourPlan === "hypercarry" || ourPlan === "front_to_back") &&
      Math.abs(ourPeel - enemyPeel) < 0.45 &&
      Math.abs(ourScale - enemyScale) < 0.35 &&
      ourEnch >= 1 &&
      enemyEnch >= 1;
    if (symmetricHyperMirror || (ourPlan === enemyPlan && bothMarksmanScale && Math.abs(ourPeel - enemyPeel) < 0.5)) {
      margin = Math.round(margin * 0.12);
    } else if (ourPlan === enemyPlan && bothMarksmanScale && ourPeel >= 1.0 && enemyPeel >= 1.0) {
      margin = Math.round(margin * 0.1);
    } else if (ourPlan === enemyPlan && ourPlan === "hypercarry") {
      margin = Math.round(margin * 0.28);
    } else if (bothMarksmanScale && Math.abs(ourPeel - enemyPeel) < 0.55 && Math.abs(ourScale - enemyScale) < 0.4) {
      margin = Math.round(margin * 0.38);
    }

    const displayBase = 500;
    const ourTotal = Math.max(120, displayBase + Math.round(margin / 2));
    const enemyTotal = Math.max(120, displayBase - Math.round(margin / 2));
    const ourInteraction = Math.round(cross.our * 0.72);
    const enemyInteraction = Math.round(cross.enemy * 0.72);

    return {
      our: {
        total: ourTotal,
        internal: ourInternal.total,
        breakdown: {
          ...ourInternal.breakdown,
          interaction: ourInteraction,
          matchup: cross.matchup,
        },
        archetype: ourInternal.archetype,
      },
      enemy: {
        total: enemyTotal,
        internal: enemyInternal.total,
        breakdown: {
          ...enemyInternal.breakdown,
          interaction: enemyInteraction,
          matchup: -cross.matchup,
        },
        archetype: enemyInternal.archetype,
      },
      margin,
      internalMargin: margin,
      winProb: duelWinProbFromDisplayScores(ourTotal, enemyTotal),
      detail: {
        cross,
        plans: { our: cross.plan?.ourPlan, enemy: cross.plan?.enemyPlan },
        beatdown: ourInternal.mtgDetail?.beatdown || enemyInternal.mtgDetail?.beatdown,
        topInteractions: cross.topPairs,
        internalMargin: margin,
      },
    };
  }

  /** Macro tab — délègue à scorePick (pipeline identique au draft). */
  function scoreMacroPick(champ, slot, ctx) {
    return scorePick(champ, slot, macroPickCtx(slot, ctx));
  }

  function phaseWeights(depth) {
    const d = clamp01(depth);
    return {
      tier: Math.max(0.06, 1 - d * 0.92),
      flex: Math.max(0.12, 1 - d * 0.88),
      synergy: 0.45 + d * 1.35,
      counter: 0.25 + d * 1.35,
      plan: 1.15 + d * 1.75,
      deny: 0.4 + d * 0.45,
      blind: Math.max(0.15, 1 - d * 0.8),
      coaching: 1.55 + d * 1.45,
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
    const { state, side, byName, meta, depth = 0, hintSlot = null, allowOffRole = false, focusSlot = null } = ctx;
    const v = buildProfile(champ, meta);
    const w = phaseWeights(depth);
    const reasons = [];
    const offRole = !playsSlot(champ, meta, slot);

    if (offRole && !allowOffRole) {
      return { score: -9999, reasons: [`Lane incompatible (${SLOT_LABELS[slot]})`], slot };
    }

    const allies = (state.picks[side] || []).map((p) => p.name).filter((n) => n !== champ.name);
    const opp = side === "blue" ? "red" : "blue";
    const oppNames = (state.picks[opp] || []).map((p) => p.name);
    const oppBySlot = {};
    for (const p of state.picks[opp] || []) if (p.slot) oppBySlot[p.slot] = p.name;

    const before = evaluateTeam(allies, { byName, metaMap: meta, oppNames, slotsLeft: 5 - allies.length });
    const after = evaluateTeam(allies.concat(champ.name), { byName, metaMap: meta, oppNames, slotsLeft: 4 - allies.length });
    const teamDelta = Math.round(after.total - before.total);
    const tierFlex =
      Math.round(TIER_PTS[v.tierMeta] * w.tier) + Math.round(v.flex * 22 * w.flex);

    const pickN = allies.length;
    const inBlind = BLIND_SLOTS.includes(slot) && pickN < 3;
    let blindPillar = 0;
    let hardCap = null;

    if (inBlind) {
      if (slot === "Bot") {
        if (v.isMarksman && (v.tierMeta === "S" || v.tierMeta === "A")) {
          blindPillar += v.tierMeta === "S" ? 72 : 52;
          blindPillar += Math.max(0, 24 - v.counteredBy.length * 4);
          reasons.push("Blind-safe flex ADC");
        } else if (v.isMarksman) {
          blindPillar += 28;
          reasons.push("Blind ADC");
        } else if (v.isSupportOnly) {
          hardCap = -9999;
          reasons.push("Support interdit en B1");
        } else {
          blindPillar -= 100;
          reasons.push("ADC blind requis");
        }
      } else if (slot === "Jungle") {
        if (v.slots.includes("Jungle") && (v.tierMeta === "S" || v.tierMeta === "A")) {
          blindPillar += 42;
          reasons.push("Blind Jungle tier");
        } else if (v.slots.includes("Jungle")) {
          blindPillar += 18;
          reasons.push("Blind Jungle");
        } else {
          blindPillar -= 100;
        }
      } else if (slot === "Mid") {
        if (v.slots.includes("Mid") && v.flex >= 0.35) {
          blindPillar += 28;
          reasons.push("Blind Mid flex");
        } else if (v.slots.includes("Mid") && v.tierMeta === "S") {
          blindPillar += 22;
          reasons.push("Blind Mid tier S");
        }
      }
      if (LATE_SLOTS.includes(slot) && pickN < 3) {
        blindPillar -= 160;
        reasons.push("Top/Sup = counter pick only");
      }
      const { risk, pool } = counterability(v, slot);
      if (risk >= 30 && !(slot === "Bot" && v.isMarksman && pickN === 0)) {
        blindPillar -= Math.round(risk * w.blind * (pickN === 0 ? 0.55 : 0.4));
        if (pool >= 4 && !v.isMarksman) reasons.push(`Counterable (${pool} menaces pool)`);
        else if (pool >= 4 && v.isMarksman) reasons.push("Pool counters — rester flex");
        else if (pool >= 1 && !v.isMarksman) reasons.push("Matchup risqué en blind");
        if (v.specialist > 0.55 && !v.isMarksman) reasons.push("Spécialiste — éviter blind");
      }
      if (v.tierMeta === "D" || v.tierMeta === "C") {
        blindPillar -= pickN === 0 ? 45 : 25;
        if (pickN === 0) reasons.push("Off-meta — éviter B1");
      }
    }

    let counterPillar = 0;
    if (!inBlind) {
      const oppLane = oppBySlot[slot];
      if (oppLane) {
        const hit = listScore(champ.name, namesFrom(getData(byName, meta, oppLane).worstMatchups, meta[oppLane]), CTR_W);
        const counterHit = listScore(oppLane, v.counters, CTR_W);
        if (counterHit) {
          counterPillar += Math.round(counterHit * w.counter);
          reasons.push(`Counters enemy ${SLOT_LABELS[slot] || slot}`);
        }
        if (hit) counterPillar -= Math.round(hit * 0.4);
      }
    }

    let synergyPillar = 0;
    for (const a of allies) {
      const syn =
        listScore(a, v.pairings, SYN_W) +
        listScore(champ.name, buildProfile(getData(byName, meta, a), meta).pairings, SYN_W);
      if (syn) {
        synergyPillar += Math.round(syn * w.synergy * 0.45);
        if (!reasons.some((r) => r.includes("Synergie"))) reasons.push("Synergie alliés");
      }
    }

    const beforeArch = detectArchetype(before.vs);
    const afterArch = detectArchetype(after.vs);
    const compDelta = afterArch.completeness - beforeArch.completeness;
    let archetypePillar = 0;
    if (compDelta >= 10) {
      archetypePillar = Math.round(compDelta * w.plan * 0.95);
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

    let coachingPillar = 0;
    const ck = CK();
    if (ck?.scoreCoachingPick) {
      const coaching = ck.scoreCoachingPick(champ.name, allies, slot, { side, pickN });
      if (coaching.score) {
        coachingPillar = Math.round(coaching.score * w.coaching);
        reasons.push(...coaching.reasons.slice(0, 4));
      }
    } else if (ck) {
      const tri = ck.trinityBonus(champ.name, allies);
      if (tri.score) coachingPillar += Math.round(tri.score * w.synergy * 0.55);
      const syn = ck.coachingSynergyScore(champ.name, allies);
      if (syn.score) coachingPillar += Math.round(syn.score * w.synergy * 0.4);
      const fam = ck.familyBonus(champ.name, allies);
      if (fam.score) coachingPillar += Math.round(fam.score * w.plan * 0.45);
    }

    if (ck?.inList?.(champ.name, ck.COUNTER_PICK_CHAMPS) && side === "red" && pickN >= 3) {
      counterPillar += Math.round(18 * w.counter);
      reasons.push("Pocket counter coaching");
    }

    let focusPillar = 0;
    if (offRole && allowOffRole) {
      focusPillar -= 28;
      reasons.push(`Flex ${SLOT_LABELS[slot] || slot} (<${MIN_LANE_RATE()}%)`);
    } else if (focusSlot === slot) {
      focusPillar += 12;
      reasons.push(`Cible ${SLOT_LABELS[slot] || slot}`);
    }
    if (hintSlot === slot) focusPillar += 8;

    const mtg = applyMtgPickScore(v, allies, oppNames, byName, meta, w);
    reasons.push(...mtg.reasons);

    let classPillar = 0;
    const cl = CL();
    if (cl?.scorePickClassFit) {
      const classPick = cl.scorePickClassFit(champ.name, slot, oppBySlot[slot] || null);
      classPillar = Math.round(classPick.score * w.counter * 0.45);
      reasons.push(...classPick.reasons.slice(0, 3));
    }

    const oppLane = oppBySlot[slot];
    let lanePillar = 0;
    if (oppLane) {
      const laneEdge = laneMatchupEdge(
        v,
        buildProfile(getData(byName, meta, oppLane), meta),
        slot,
        { byName, metaMap: meta }
      );
      lanePillar = Math.round((laneEdge.our - laneEdge.enemy) * 0.85);
      if (laneEdge.reasons[0]) reasons.push(laneEdge.reasons[0]);
    }

    const pillarTotal = combineEqualPillars([
      normalizePillar(teamDelta, 48),
      normalizePillar(tierFlex, 48),
      normalizePillar(blindPillar, 75),
      normalizePillar(counterPillar, 38),
      normalizePillar(synergyPillar, 38),
      normalizePillar(archetypePillar, 42),
      normalizePillar(coachingPillar, 55),
      normalizePillar(mtg.score, 95),
      normalizePillar(classPillar, 38),
      normalizePillar(lanePillar, 32),
      normalizePillar(focusPillar, 14),
    ]);
    let score = Math.round(pillarTotal * PICK_PILLAR_SCALE);
    if (hardCap != null) score = hardCap;

    if (!reasons.length) reasons.push(`${SLOT_LABELS[slot] || slot} optimal`);

    return { score, reasons: [...new Set(reasons)].slice(0, 8), slot, eval: after };
  }

  function scorePickCandidate(champ, ctx) {
    const { allowedSlots, preferredSlot, hintSlot, meta, focusSlot, allowOffRole } = ctx;

    if (focusSlot) {
      return scorePick(champ, focusSlot, { ...ctx, hintSlot: focusSlot, allowOffRole: allowOffRole === true });
    }

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
    evaluateTeamInternal,
    evaluateDraftDuel,
    duelWinProbFromDisplayScores,
    crossDraftInteractions,
    evaluateTeamMacro,
    macroFamilyScore,
    macroSynergyScore,
    macroMtgScore,
    applyMtgPickScore,
    getColorIdentity,
    scoreMacroPick,
    macroPickCtx,
    compsToDraftState,
    teamNamesToDraftState,
    COACH_SLOT_ORDER,
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
    normalizePillar,
    combineEqualPillars,
    scorePick,
    scorePickCandidate,
    enemyWomboThreat,
    isWomboPair,
    scoreLaneMatchup,
    laneMatchupEdge,
  };
})(typeof window !== "undefined" ? window : globalThis);
