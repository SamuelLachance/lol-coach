/**
 * LoL Draft Engine v4 — session + UI API ; scoring → LoLDraftScoring.
 */
(function (global) {
  const SC = () => global.LoLDraftScoring;
  const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const BANS_PER_TEAM = 5;
  const BAN_PHASE1_COUNT = 3;
  const BAN_PHASE2_COUNT = 2;

  const LOL_DRAFT_STEPS = [
    { type: "ban", side: "blue", banIndex: 0, banPhase: 1 },
    { type: "ban", side: "red", banIndex: 0, banPhase: 1 },
    { type: "ban", side: "blue", banIndex: 1, banPhase: 1 },
    { type: "ban", side: "red", banIndex: 1, banPhase: 1 },
    { type: "ban", side: "blue", banIndex: 2, banPhase: 1 },
    { type: "ban", side: "red", banIndex: 2, banPhase: 1 },
    { type: "pick", side: "blue" },
    { type: "pick", side: "red" },
    { type: "pick", side: "red" },
    { type: "pick", side: "blue" },
    { type: "pick", side: "blue" },
    { type: "pick", side: "red" },
    { type: "ban", side: "red", banIndex: 3, banPhase: 2 },
    { type: "ban", side: "blue", banIndex: 3, banPhase: 2 },
    { type: "ban", side: "red", banIndex: 4, banPhase: 2 },
    { type: "ban", side: "blue", banIndex: 4, banPhase: 2 },
    { type: "pick", side: "red" },
    { type: "pick", side: "blue" },
    { type: "pick", side: "blue" },
    { type: "pick", side: "red" },
  ];

  const PICK_STEPS = LOL_DRAFT_STEPS.filter((s) => s.type === "pick");
  const BLIND_PICK_SLOTS = ["Bot", "Jungle", "Mid"];
  const LATE_MATCHUP_SLOTS = ["Support", "Top"];
  const PICK_SLOT_PRIORITY = ["Bot", "Jungle", "Mid", "Support", "Top"];
  const SLOT_LABELS = { Bot: "ADC", Jungle: "Jungle", Mid: "Mid", Support: "Support", Top: "Top" };
  const MIN_LANE_PLAY_RATE = 5;

  const MTG_COLORS = ["W", "U", "B", "R", "G"];
  const COLOR_LABELS = { W: "Blanc", U: "Bleu", B: "Noir", R: "Rouge", G: "Vert" };
  const COLOR_HEX = { W: "#f5f0dc", U: "#4a9fd4", B: "#6b6b7a", R: "#e05238", G: "#3d9e5a" };

  let recommendationCache = null;

  function buildDraftSteps() { return LOL_DRAFT_STEPS.slice(); }

  function normalizeSession(s) {
    if (!s) return s;
    s.bansPerTeam = BANS_PER_TEAM;
    if (typeof s.fearless !== "boolean") s.fearless = false;
    if (!s.bans) s.bans = { blue: [], red: [] };
    if (!s.picks) s.picks = { blue: [], red: [] };
    for (const side of ["blue", "red"]) {
      const c = (s.bans[side] || []).filter(Boolean);
      s.bans[side] = Array.from({ length: BANS_PER_TEAM }, (_, i) => c[i] || null);
    }
    if (s.focus === undefined) s.focus = null;
    return s;
  }

  function createSession(name, ourSide = "blue", opts = {}) {
    return normalizeSession({
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name, ourSide,
      bansPerTeam: BANS_PER_TEAM,
      fearless: Boolean(opts.fearless),
      stepIndex: 0,
      bans: { blue: [], red: [] },
      picks: { blue: [], red: [] },
      activeSlot: "Top",
      enemyActiveSlot: "Top",
      focus: null,
      history: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  function getSteps() { return buildDraftSteps(); }
  function totalSteps(s) { return getSteps(s).length; }
  function getStep(s) { return getSteps(s)[s.stepIndex] || null; }
  function isComplete(s) { return s.stepIndex >= totalSteps(s); }

  function fearlessUsed(all, id) {
    const out = new Set();
    for (const sess of all || []) {
      if (sess.id === id) break;
      normalizeSession(sess);
      for (const side of ["blue", "red"]) (sess.picks[side] || []).forEach((p) => out.add(p.name));
    }
    return out;
  }

  function taken(s, all = []) {
    normalizeSession(s);
    const names = new Set();
    for (const side of ["blue", "red"]) {
      s.bans[side].forEach((n) => n && names.add(n));
      (s.picks[side] || []).forEach((p) => names.add(p.name));
    }
    if (s.fearless) fearlessUsed(all, s.id).forEach((n) => names.add(n));
    return names;
  }

  function available(allChamps, s, all = []) {
    return allChamps.filter((c) => !taken(s, all).has(c.name));
  }

  function sidePicks(s, side) { return s.picks[side] || []; }
  function pickBySlot(s, side) {
    const m = {};
    for (const p of sidePicks(s, side)) if (p.slot) m[p.slot] = p.name;
    return m;
  }
  function pickAtSlot(s, side, slot) {
    return sidePicks(s, side).find((p) => p.slot === slot) || null;
  }
  function nextPickOrder(s, side) {
    const orders = sidePicks(s, side).map((p) => p.order || 0);
    return orders.length ? Math.max(...orders) + 1 : 1;
  }
  function ourSide(s) { return s.ourSide; }
  function enemySide(s) { return s.ourSide === "blue" ? "red" : "blue"; }
  function isOurTurn(s) { const st = getStep(s); return st && st.side === ourSide(s); }
  function canEditFormat(s) { return s.stepIndex === 0; }
  function openSlots(s, side) { return SLOTS.filter((sl) => !pickBySlot(s, side)[sl]); }
  function draftDepth(s) {
    return Math.min(1, (sidePicks(s, "blue").length + sidePicks(s, "red").length) / 10);
  }
  function sidePickCount(s, side) { return sidePicks(s, side).length; }
  function isTeamFirstPick(s, side) { return sidePickCount(s, side) === 0; }
  function isBlueFirstPick(s) {
    const step = getStep(s);
    return step?.type === "pick" && step.side === "blue" && sidePickCount(s, "blue") === 0;
  }

  function enemyPickBySlot(s, side) {
    return pickBySlot(s, side === "blue" ? "red" : "blue");
  }

  function isLaneMatchupKnown(s, side, slot) {
    const enemy = enemyPickBySlot(s, side);
    if (slot === "Top") return Boolean(enemy.Top);
    if (slot === "Support") return Boolean(enemy.Support) || Boolean(enemy.Bot);
    return true;
  }

  function nextBlindSlotFrom(by) {
    for (const slot of BLIND_PICK_SLOTS) if (!by[slot]) return slot;
    return null;
  }
  function nextBlindSlot(s, side) { return nextBlindSlotFrom(pickBySlot(s, side)); }
  function isBlindPickPhase(s, side) { return nextBlindSlot(s, side) !== null; }

  function pickBySlotExcluding(s, side, excludeName) {
    const m = {};
    for (const p of sidePicks(s, side)) {
      if (p.name === excludeName) continue;
      if (p.slot) m[p.slot] = p.name;
    }
    return m;
  }
  function openSlotsFrom(by) { return SLOTS.filter((sl) => !by[sl]); }

  function allowedSlotsForNextPick(s, side, excludeName = null) {
    const by = excludeName ? pickBySlotExcluding(s, side, excludeName) : pickBySlot(s, side);
    const open = openSlotsFrom(by);
    const nextBlind = nextBlindSlotFrom(by);
    if (nextBlind && open.includes(nextBlind)) return [nextBlind];
    const allowed = open.filter((sl) => BLIND_PICK_SLOTS.includes(sl));
    for (const slot of LATE_MATCHUP_SLOTS) {
      if (open.includes(slot) && isLaneMatchupKnown(s, side, slot)) allowed.push(slot);
    }
    return allowed.length ? allowed : open;
  }

  function layoutAllowedSlots(s, side, excludeName = null) {
    const by = excludeName ? pickBySlotExcluding(s, side, excludeName) : pickBySlot(s, side);
    const n = excludeName
      ? sidePicks(s, side).filter((p) => p.name !== excludeName).length + 1
      : sidePicks(s, side).length;
    if (nextBlindSlotFrom(by) !== null) return BLIND_PICK_SLOTS.slice(0, Math.min(n, 3));
    const slots = BLIND_PICK_SLOTS.slice();
    const open = openSlotsFrom(by);
    for (const slot of LATE_MATCHUP_SLOTS) {
      if (by[slot] || (open.includes(slot) && isLaneMatchupKnown(s, side, slot))) {
        if (!slots.includes(slot)) slots.push(slot);
      }
    }
    return slots;
  }

  function preferredBlindSlot(s, side, excludeName = null) {
    const allowed = allowedSlotsForNextPick(s, side, excludeName);
    return allowed[0] || openSlotsFrom(excludeName ? pickBySlotExcluding(s, side, excludeName) : pickBySlot(s, side))[0] || "Bot";
  }
  function recommendedSlotForPick(s, side) { return preferredBlindSlot(s, side); }

  function getData(byName, meta, name) {
    return byName?.get?.(name) || meta?.[name] || { name, optimalSlots: [] };
  }

  function playableSlotsFor(champ, meta) {
    return SC()?.playableSlotsFor(champ, meta) || champ?.optimalSlots || [];
  }
  function playsSlotFor(champ, meta, slot) {
    return SC()?.playsSlotFor(champ, meta, slot) ?? playableSlotsFor(champ, meta).includes(slot);
  }

  function scoringCtx(s, side, byName, meta, hintSlot = null) {
    return {
      state: s,
      side,
      byName,
      meta,
      depth: draftDepth(s),
      hintSlot,
      allowedSlots: allowedSlotsForNextPick(s, side),
      preferredSlot: preferredBlindSlot(s, side),
      banPhase: getStep(s)?.banPhase || 1,
    };
  }

  function scoreBan(champ, s, side, byName, meta) {
    const sc = SC();
    if (!sc) return { score: 0, reasons: ["Scoring indisponible"] };
    return sc.scoreBan(champ, scoringCtx(s, side, byName, meta));
  }

  function scorePick(champ, s, side, byName, meta, hintSlot = null) {
    const sc = SC();
    if (!sc) return { score: 0, reasons: ["Scoring indisponible"], slot: hintSlot || "Bot" };
    const ctx = scoringCtx(s, side, byName, meta, hintSlot);
    ctx.allowedSlots = allowedSlotsForNextPick(s, side, champ.name);
    ctx.preferredSlot = preferredBlindSlot(s, side, champ.name);
    return sc.scorePickCandidate(champ, ctx);
  }

  function scoreCandidate(s, side, champ, byName, meta, hintSlot = null) {
    return scorePick(champ, s, side, byName, meta, hintSlot);
  }

  function pickCandidatesForSide(s, side, avail, meta) {
    const allowed = allowedSlotsForNextPick(s, side);
    return avail.filter((c) => allowed.some((sl) => playsSlotFor(c, meta, sl)));
  }

  function buildVector(champ, meta) {
    return SC()?.buildProfile(champ, meta) || { name: champ.name };
  }

  function phaseWeights(depth) {
    return SC()?.phaseWeights(depth) || { tier: 1, counter: 1, synergy: 1, plan: 1 };
  }

  function detectCompPlan(vs) {
    if (!SC()) return { plan: null, label: "", completeness: 0, gaps: [] };
    if (Array.isArray(vs) && vs[0]?.engage !== undefined) return SC().detectArchetype(vs);
    return SC().detectArchetype(vs);
  }

  function evaluateTeam(names, ctx) {
    return SC()?.evaluateTeam(names, ctx) || { total: 0, breakdown: {}, gaps: [] };
  }

  function measureTeam(names, byName, meta) {
    return SC()?.profiles(names, byName, meta) || [];
  }

  function getColorIdentity(champ, meta) {
    return champ.colorIdentity || meta[champ.name]?.colorIdentity || null;
  }

  function teamColorSummary(names, byName, meta) {
    const pie = global.MTGColorPie;
    if (pie?.teamColorSummary) return pie.teamColorSummary(names, byName, meta);
    const vs = measureTeam(names, byName, meta);
    return { score: 0, dominant: [], conflicts: [], identity: "", bars: MTG_COLORS.map((c) => ({ code: c, label: COLOR_LABELS[c], hex: COLOR_HEX[c], value: 0 })) };
  }

  function colorCoherence(vs) {
    const pie = global.MTGColorPie;
    if (pie?.colorCoherence) return pie.colorCoherence(vs);
    return { score: 0, dominant: [], conflicts: [], identity: "" };
  }

  function assignPickDirect(s, side, name, slot, { pinned = true } = {}) {
    const list = sidePicks(s, side).filter((p) => p.name !== name && p.slot !== slot);
    list.push({ name, slot, order: nextPickOrder(s, side), pinned });
    s.picks[side] = list;
  }

  function optimizeLayout(s, side, byName, meta) {
    const picks = sidePicks(s, side);
    if (!picks.length) { s.picks[side] = []; return; }
    const pinned = picks.filter((p) => p.pinned && p.slot);
    const unpinned = picks.filter((p) => !p.pinned);
    const used = new Set(pinned.map((p) => p.slot));
    const pool = layoutAllowedSlots(s, side).filter((sl) => !used.has(sl));
    const open = pool.length ? pool : SLOTS.filter((sl) => !used.has(sl));
    let i = 0;
    const merged = [...pinned];
    for (const p of unpinned) {
      const slot = open[i] || SLOTS.find((sl) => !used.has(sl)) || p.slot;
      if (slot) used.add(slot);
      merged.push({ ...p, slot, pinned: false });
      i++;
    }
    s.picks[side] = merged;
  }

  function relayoutAll(s, ctx = {}) {
    if (!ctx.byName) return;
    normalizeSession(s);
    optimizeLayout(s, "blue", ctx.byName, ctx.metaMap || {});
    optimizeLayout(s, "red", ctx.byName, ctx.metaMap || {});
  }

  function invalidateRecommendationCache() { recommendationCache = null; }

  function recommendationCacheKey(s, side, all, step) {
    return [s.id, s.stepIndex, side, step?.type, JSON.stringify(s.bans), JSON.stringify(s.picks)].join("\0");
  }

  function getRecommendations(s, champs, meta, byName, all = [], limit = 8, forSide = null) {
    const step = getStep(s);
    if (!step || isComplete(s)) return { type: "none", items: [], forSide: null };
    const avail = available(champs, s, all);
    const side = forSide || step.side;
    const cacheKey = recommendationCacheKey(s, side, all, step);
    if (recommendationCache?.key === cacheKey && recommendationCache.limit >= limit) {
      return { ...recommendationCache.result, items: recommendationCache.result.items.slice(0, limit) };
    }

    if (step.type === "ban") {
      const items = avail.map((c) => {
        const { score, reasons } = scoreBan(c, s, side, byName, meta);
        return { champion: c, score, reasons };
      }).sort((a, b) => b.score - a.score).slice(0, limit);
      const result = { type: "ban", side, items, forSide: side };
      recommendationCache = { key: cacheKey, limit, result };
      return result;
    }

    const hint = recommendedSlotForPick(s, side);
    const candidates = pickCandidatesForSide(s, side, avail, meta);
    const items = candidates.map((c) => {
      const { score, reasons, slot } = scoreCandidate(s, side, c, byName, meta, hint);
      return { champion: c, score, reasons, slot };
    }).filter((item) => item.score > -1000).sort((a, b) => b.score - a.score).slice(0, limit);

    const result = {
      type: "pick",
      side,
      slot: hint,
      coachHint: getDraftCoachHint(s, side, byName, meta),
      items,
      forSide: side,
    };
    recommendationCache = { key: cacheKey, limit, result };
    return result;
  }

  function getDraftCoachHint(s, side, byName, meta) {
    const slot = preferredBlindSlot(s, side);
    const label = SLOT_LABELS[slot] || slot;
    const n = sidePickCount(s, side) + 1;
    if (isTeamFirstPick(s, side)) return "Blind 1 : ADC obligatoire · Top/Sup = counter pick uniquement";
    if (isBlindPickPhase(s, side)) {
      if (slot === "Bot") return `Blind ${n} : ADC (dur à punir)`;
      if (slot === "Jungle") return `Blind ${n} : Jungle · Top/Sup interdits`;
      if (slot === "Mid") return `Blind ${n} : Mid flex · Top/Sup après matchup`;
      return `Blind ${n} : ${label}`;
    }
    if (LATE_MATCHUP_SLOTS.includes(slot)) {
      return isLaneMatchupKnown(s, side, slot)
        ? `Pick ${label} : matchup révélé · counter possible`
        : `Pick ${label} · blind épuisés`;
    }
    return `Pick : ${label} · synergie · complétion comp`;
  }

  function suggestSlot(s, side, meta, byName) {
    const open = openSlots(s, side);
    const preferred = preferredBlindSlot(s, side);
    if (preferred && open.includes(preferred)) return preferred;
    if (isBlindPickPhase(s, side)) {
      for (const sl of BLIND_PICK_SLOTS) if (open.includes(sl)) return sl;
    }
    const allies = sidePicks(s, side).map((p) => p.name);
    const ev = evaluateTeam(allies, { byName, metaMap: meta, slotsLeft: open.length });
    if (ev.gaps?.includes("frontline") && open.includes("Top") && isLaneMatchupKnown(s, side, "Top")) return "Top";
    if (ev.gaps?.includes("peel") && open.includes("Support") && isLaneMatchupKnown(s, side, "Support")) return "Support";
    return open[0] || "Top";
  }

  function resolvePickSlot(s, side, name, byName, meta, hint, obj) {
    const c = obj || getData(byName, meta, name);
    return scorePick(c, s, side, byName, meta, hint).slot;
  }
  function bestSlotForChampion(c, s, side, meta, hint) {
    return resolvePickSlot(s, side, c?.name, null, meta, hint, c);
  }

  function applyAction(s, action, all = [], ctx = {}) {
    s.history.push(JSON.stringify({ stepIndex: s.stepIndex, bans: s.bans, picks: s.picks }));
    const step = getStep(s);
    if (!step) return { ok: false, error: "Draft terminé." };
    if (taken(s, all).has(action.championName)) {
      if (s.fearless && fearlessUsed(all, s.id).has(action.championName)) return { ok: false, error: "Champion indisponible (fearless)." };
      return { ok: false, error: "Champion déjà pris ou banni." };
    }
    if (step.type === "ban") {
      const idx = action.banIndex ?? step.banIndex;
      if (idx == null || idx < 0 || idx >= BANS_PER_TEAM) return { ok: false, error: "Case ban invalide." };
      if (s.bans[step.side][idx]) return { ok: false, error: "Case ban déjà remplie." };
      s.bans[step.side][idx] = action.championName;
    } else {
      if (!ctx.byName) return { ok: false, error: "Données manquantes." };
      clearFromBoard(s, action.championName);
      const slot = action.slot && !pickBySlot(s, step.side)[action.slot]
        ? action.slot
        : scorePick(getData(ctx.byName, ctx.metaMap, action.championName), s, step.side, ctx.byName, ctx.metaMap || {}).slot;
      assignPickDirect(s, step.side, action.championName, slot, { pinned: Boolean(action.slot) });
      if (!action.slot) relayoutAll(s, ctx);
    }
    s.stepIndex++;
    s.updatedAt = Date.now();
    invalidateRecommendationCache();
    if (step.type === "pick") {
      return { ok: true, slot: s.picks[step.side].find((p) => p.name === action.championName)?.slot };
    }
    return { ok: true };
  }

  function clearFromBoard(s, name) {
    for (const side of ["blue", "red"]) {
      s.bans[side] = s.bans[side].map((n) => (n === name ? null : n));
      s.picks[side] = s.picks[side].filter((p) => p.name !== name);
    }
  }

  function undo(s) {
    if (!s.history.length) return false;
    Object.assign(s, JSON.parse(s.history.pop()));
    s.updatedAt = Date.now();
    invalidateRecommendationCache();
    return true;
  }

  function resetSession(s) {
    s.stepIndex = 0;
    s.bans = { blue: [], red: [] };
    s.picks = { blue: [], red: [] };
    s.history = [];
    s.focus = null;
    s.updatedAt = Date.now();
    invalidateRecommendationCache();
  }

  function resyncStepIndex(s) {
    const steps = getSteps(s);
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      if (st.type === "ban") {
        const idx = st.banIndex ?? steps.slice(0, i + 1).filter((x) => x.type === "ban" && x.side === st.side).length - 1;
        if (!s.bans[st.side]?.[idx]) { s.stepIndex = i; return; }
      } else {
        const need = steps.slice(0, i + 1).filter((x) => x.type === "pick" && x.side === st.side).length;
        if ((s.picks[st.side] || []).length < need) { s.stepIndex = i; return; }
      }
    }
    s.stepIndex = steps.length;
  }

  function swapPickSlots(s, side, a, b) {
    normalizeSession(s);
    const comp = pickBySlot(s, side);
    const na = comp[a]; const nb = comp[b];
    if (!na && !nb) return { ok: false, error: "Postes vides." };
    s.history.push(JSON.stringify({ stepIndex: s.stepIndex, bans: s.bans, picks: s.picks }));
    s.picks[side] = s.picks[side].filter((p) => p.slot !== a && p.slot !== b);
    if (nb) s.picks[side].push({ name: nb, slot: a });
    if (na) s.picks[side].push({ name: na, slot: b });
    s.updatedAt = Date.now();
    invalidateRecommendationCache();
    return { ok: true };
  }

  function manualAssign(s, action, all = [], ctx = {}) {
    s.history.push(JSON.stringify({ stepIndex: s.stepIndex, bans: s.bans, picks: s.picks }));
    normalizeSession(s);
    const { type, side, name, slot: hintSlot, banIndex } = action;
    if (!name) {
      if (type === "ban" && banIndex != null) s.bans[side][banIndex] = null;
      else if (type === "pick" && hintSlot) {
        s.picks[side] = s.picks[side].filter((p) => p.slot !== hintSlot);
        relayoutAll(s, ctx);
      }
      resyncStepIndex(s);
      s.updatedAt = Date.now();
      invalidateRecommendationCache();
      return { ok: true };
    }
    if (taken(s, all).has(name) && !s.bans[side].includes(name) && !sidePicks(s, side).some((p) => p.name === name)) {
      return { ok: false, error: "Indisponible." };
    }
    clearFromBoard(s, name);
    if (type === "ban") {
      let idx = banIndex ?? s.bans[side].findIndex((n) => !n);
      if (idx < 0 || idx >= BANS_PER_TEAM) return { ok: false, error: "Bans pleins." };
      s.bans[side][idx] = name;
    } else {
      const list = sidePicks(s, side).filter((p) => p.name !== name);
      if (list.length >= 5) return { ok: false, error: "Picks pleins." };
      const slot = hintSlot && !pickBySlot(s, side)[hintSlot]
        ? hintSlot
        : scorePick(getData(ctx.byName, ctx.metaMap, name), s, side, ctx.byName, ctx.metaMap || {}, hintSlot).slot;
      assignPickDirect(s, side, name, slot, { pinned: Boolean(hintSlot) });
      if (!hintSlot) relayoutAll(s, ctx);
      const placed = s.picks[side].find((p) => p.name === name);
      if (!placed) return { ok: false, error: "Placement impossible." };
      resyncStepIndex(s);
      s.updatedAt = Date.now();
      invalidateRecommendationCache();
      return { ok: true, slot: placed.slot, manual: true };
    }
    resyncStepIndex(s);
    s.updatedAt = Date.now();
    invalidateRecommendationCache();
    return { ok: true };
  }

  function clearSlot(s, action, all = [], ctx = {}) {
    normalizeSession(s);
    const { type, side, slot, banIndex } = action;
    if (type === "ban") {
      if (banIndex == null || banIndex < 0 || banIndex >= BANS_PER_TEAM) return { ok: false, error: "Case ban invalide." };
      if (!s.bans[side][banIndex]) return { ok: false, error: "Case déjà vide." };
    } else if (type === "pick") {
      if (!slot || !pickBySlot(s, side)[slot]) return { ok: false, error: "Poste déjà vide." };
    } else return { ok: false, error: "Type invalide." };
    const removed = type === "ban" ? s.bans[side][banIndex] : pickBySlot(s, side)[slot];
    const result = manualAssign(s, { type, side, name: null, slot, banIndex }, all, ctx);
    if (result.ok) { result.cleared = removed; result.inOrder = false; }
    return result;
  }

  function recordAction(s, action, all = [], ctx = {}) {
    const step = getStep(s);
    const inOrder = step && step.type === action.type && step.side === action.side && !action.forceManual;
    if (inOrder) {
      const banIndex = action.type === "ban" ? (action.banIndex ?? step.banIndex) : action.banIndex;
      const result = applyAction(s, { championName: action.name, slot: action.slot, banIndex }, all, ctx);
      if (result.ok && action.type === "pick") result.slot = s.picks[action.side]?.find((p) => p.name === action.name)?.slot;
      result.inOrder = true;
      return result;
    }
    const result = manualAssign(s, action, all, ctx);
    if (result.ok) result.inOrder = false;
    return result;
  }

  function suggestNextFocus(s) {
    normalizeSession(s);
    if (isComplete(s)) { s.focus = null; return null; }
    const step = getStep(s);
    if (!step) return null;
    if (step.type === "ban") {
      const idx = step.banIndex;
      if (idx != null && !s.bans[step.side][idx]) {
        s.focus = { type: "ban", side: step.side, banIndex: idx };
        return s.focus;
      }
    } else {
      s.focus = { type: "pick", side: step.side, slot: preferredBlindSlot(s, step.side) || null };
      return s.focus;
    }
    s.focus = null;
    return null;
  }

  function syncLegacySlots(s) {
    if (!s.focus || s.focus.type !== "pick" || s.focus.slot) return;
    const side = s.focus.side;
    const next = preferredBlindSlot(s, side);
    if (!next) return;
    if (side === ourSide(s)) s.activeSlot = next;
    else s.enemyActiveSlot = next;
  }

  function actionLabel(s, byName, meta) {
    const f = s.focus;
    if (f) {
      const fr = f.side === "blue" ? "Bleu" : "Rouge";
      if (f.type === "ban") {
        const phase = f.banIndex < BAN_PHASE1_COUNT ? "phase 1" : "phase 2";
        return `Ban ${fr} (${phase}, ${f.banIndex + 1}/5) → champion`;
      }
      if (f.type === "swap") return `Swap ${fr} · clique un autre poste`;
      if (f.slot) return `Pick ${fr} · ${SLOT_LABELS[f.slot] || f.slot} → champion`;
      const hint = getDraftCoachHint(s, f.side, byName, meta);
      return hint ? `Pick ${fr} → champion · ${hint}` : `Pick ${fr} → champion`;
    }
    const step = getStep(s);
    if (!step || isComplete(s)) return null;
    const hint = step.type === "pick" ? getDraftCoachHint(s, step.side, byName, meta) : null;
    if (step.type === "pick") return hint ? `Pick → champion · ${hint}` : "Pick → champion";
    return "Ban → champion";
  }

  function toComps(s) {
    const fill = (m) => { const o = {}; for (const sl of SLOTS) o[sl] = m[sl] || ""; return o; };
    return { ourComp: fill(pickBySlot(s, ourSide(s))), enemyComp: fill(pickBySlot(s, enemySide(s))) };
  }

  function analyzeLive(s, meta) {
    const our = sidePicks(s, ourSide(s)).map((p) => p.name);
    const en = sidePicks(s, enemySide(s)).map((p) => p.name);
    const ev = evaluateTeam(our, { metaMap: meta, oppNames: en, slotsLeft: 5 - our.length });
    const notes = [];
    const plan = detectCompPlan(ev.vs || []);
    if (plan.label) notes.push(`Plan : ${plan.label} (${plan.completeness}%)`);
    for (const g of ev.gaps?.slice(0, 2) || []) notes.push(`Manque ${g}`);
    return { ourTags: [], enemyTags: [], notes: notes.slice(0, 7) };
  }

  function stepLabel(s) {
    const steps = getSteps(s);
    const st = steps[s.stepIndex];
    if (!st) return "Draft terminé";
    const side = st.side === "blue" ? "Bleu" : "Rouge";
    const banSteps = steps.filter((x) => x.type === "ban");
    const pickSteps = steps.filter((x) => x.type === "pick");
    if (st.type === "ban") {
      const phase = st.banPhase === 2 ? "Phase 2" : "Phase 1";
      return `Ban ${phase} · ${(st.banIndex ?? 0) + 1}/5 (${side}) — ${s.stepIndex + 1}/${banSteps.length}`;
    }
    return `Pick ${s.stepIndex - banSteps.length + 1}/${pickSteps.length} — ${side}`;
  }

  function formatSummary(s) {
    normalizeSession(s);
    return [`5 bans · 2 phases · Ranked SR`, s.fearless ? "Fearless" : null].filter(Boolean).join(" · ");
  }

  function assignmentFromComp(comp) {
    return SLOTS.filter((sl) => comp[sl]).map((slot) => ({ name: comp[slot], slot }));
  }
  function namesFromComp(comp) { return SLOTS.map((sl) => comp[sl]).filter(Boolean); }

  function winProbFromScores(ourTotal, enemyTotal) {
    const sum = ourTotal + enemyTotal;
    if (sum > 0) {
      const our = ourTotal / sum;
      return { our, enemy: 1 - our };
    }
    const margin = ourTotal - enemyTotal;
    if (margin === 0) return { our: 0.5, enemy: 0.5 };
    const raw = 1 / (1 + Math.exp(-margin / 42));
    const our = Math.min(0.93, Math.max(0.07, raw));
    return { our, enemy: 1 - our };
  }

  function compareComps(ourComp, enemyComp, byName, metaMap) {
    const ourNames = namesFromComp(ourComp);
    const enemyNames = namesFromComp(enemyComp);
    if (ourNames.length < 5 || enemyNames.length < 5) {
      return { complete: false, ourCount: ourNames.length, enemyCount: enemyNames.length };
    }
    const w = phaseWeights(1);
    const ourEval = evaluateTeam(ourNames, { byName, metaMap, oppNames: enemyNames, oppComp: enemyComp, slotsLeft: 0 });
    const enemyEval = evaluateTeam(enemyNames, { byName, metaMap, oppNames: ourNames, oppComp: ourComp, slotsLeft: 0 });
    const margin = ourEval.total - enemyEval.total;
    return {
      complete: true,
      our: { score: Math.round(ourEval.total), breakdown: ourEval.breakdown },
      enemy: { score: Math.round(enemyEval.total), breakdown: enemyEval.breakdown },
      margin: Math.round(margin),
      winProb: winProbFromScores(ourEval.total, enemyEval.total),
    };
  }

  global.LoLDraft = {
    SLOTS, BANS_PER_TEAM, BAN_PHASE1_COUNT, BAN_PHASE2_COUNT, PICK_STEPS, PICK_SLOT_PRIORITY,
    BLIND_PICK_SLOTS, LATE_MATCHUP_SLOTS, SLOT_LABELS, MIN_LANE_PLAY_RATE,
    MTG_COLORS, COLOR_LABELS, COLOR_HEX,
    buildDraftSteps, normalizeSession, createSession, getSteps, totalSteps, getStep, isComplete,
    fearlessUsedNames: fearlessUsed, takenNames: taken, availableChampions: available,
    sidePicks, pickBySlot, pickAtSlot, nextPickOrder, ourSide, enemySide, isOurTurn, canEditFormat,
    suggestSlot, bestSlotForChampion, resolvePickSlot, relayoutAllPickSlots: relayoutAll, optimizeTeamLayout: optimizeLayout,
    getRecommendations, invalidateRecommendationCache, isBlueFirstPick, isTeamFirstPick, nextBlindSlot,
    allowedSlotsForNextPick, layoutAllowedSlots, recommendedSlotForPick, preferredBlindSlot,
    isBlindPickPhase, isLaneMatchupKnown, getDraftCoachHint,
    applyAction, recordAction, manualAssign, clearSlot, actionLabel, suggestNextFocus, syncLegacySlots,
    resyncStepIndex, undo, resetSession, swapPickSlots, toComps, analyzeLive, stepLabel, formatSummary,
    scorePick: (c, s, side, slot, meta, byName) => scorePick(c, s, side, byName, meta, slot),
    scoreBan, evaluateTeam, measureTeam: measureTeam, buildVector, phaseWeights, detectCompPlan,
    compareComps, teamColorSummary, colorCoherence, playableSlotsFor, playsSlotFor, lanePlayRate: () => null,
  };
})(typeof window !== "undefined" ? window : globalThis);
