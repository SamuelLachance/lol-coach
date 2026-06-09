/**
 * LoL Draft Engine v3 — théorie MOBA : axes, rule-of-three, synergie sorts, flex/carry par profondeur.
 */
(function (global) {
  const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const BANS_PER_TEAM = 5;
  const BAN_PHASE1_COUNT = 3;
  const BAN_PHASE2_COUNT = 2;

  /** Ordre officiel ranked Summoner's Rift — 2 phases de ban (3+2) entrecoupées de picks. */
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

  const TIER = { S: 1.0, A: 0.82, B: 0.62, C: 0.38, D: 0.15 };
  const TIER_PTS = { S: 40, A: 30, B: 20, C: 10, D: 3 };
  const SYN_W = [36, 28, 22, 16, 12];
  const CTR_W = [40, 32, 24, 18, 14];

  const MTG_COLORS = ["W", "U", "B", "R", "G"];
  const COLOR_LABELS = { W: "Blanc", U: "Bleu", B: "Noir", R: "Rouge", G: "Vert" };
  const COLOR_HEX = { W: "#f5f0dc", U: "#4a9fd4", B: "#6b6b7a", R: "#e05238", G: "#3d9e5a" };

  function mtgPie() {
    return global.MTGColorPie || null;
  }

  const COLOR_ALLIED = [["W", "U"], ["U", "B"], ["B", "R"], ["R", "G"], ["G", "W"]];
  const COLOR_ENEMY = [["W", "B"], ["W", "R"], ["U", "R"], ["U", "G"], ["B", "G"]];

  const WAVE_CLEAR = new Set();

  function clamp01(x) {
    return Math.max(0, Math.min(1, Number(x) || 0));
  }

  function hasWaveClear(name, byName) {
    const c = getData(byName, {}, name);
    return Boolean(c?.draftProfile?.waveClear);
  }

  // ─── Session ────────────────────────────────────────────────────────────

  function buildDraftSteps() {
    return LOL_DRAFT_STEPS.slice();
  }

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

  function getSteps(s) { return buildDraftSteps(); }
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
    const t = taken(s, all);
    return allChamps.filter((c) => !t.has(c.name));
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

  function phaseWeights(depth) {
    const d = Math.max(0, Math.min(1, depth));
    return {
      tier: Math.max(0.06, 1 - d * 0.94),
      flex: Math.max(0.12, 1 - d * 0.88),
      carry: d * 0.95,
      synergy: 0.28 + d * 1.12,
      counter: 0.18 + d * 1.28,
      balance: 0.4 + d * 0.85,
      lane: 0.15 + d * 0.78,
      plan: 0.2 + d * 1.05,
      deny: 0.35 + d * 0.45,
    };
  }

  const COMP_PLAN_LABELS = {
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

  /** Blind pick : ADC → Jungle → Mid ; Top/Support le plus tard possible (matchup). */
  const PICK_SLOT_PRIORITY = ["Bot", "Jungle", "Mid", "Support", "Top"];
  const BLIND_PICK_SLOTS = ["Bot", "Jungle", "Mid"];
  const LATE_MATCHUP_SLOTS = ["Support", "Top"];
  const SLOT_LABELS = { Bot: "ADC", Jungle: "Jungle", Mid: "Mid", Support: "Support", Top: "Top" };

  function sidePickCount(s, side) {
    return sidePicks(s, side).length;
  }

  function enemyPickBySlot(s, side) {
    const opp = side === "blue" ? "red" : "blue";
    return pickBySlot(s, opp);
  }

  /** Top/Support : matchup connu si l'adversaire a révélé la lane (bot pour sup). */
  function isLaneMatchupKnown(s, side, slot) {
    const enemy = enemyPickBySlot(s, side);
    if (slot === "Top") return Boolean(enemy.Top);
    if (slot === "Support") return Boolean(enemy.Support) || Boolean(enemy.Bot);
    return true;
  }

  function isBlindPickPhase(s, side) {
    return nextBlindSlot(s, side) !== null;
  }

  /** Prochain poste blind obligatoire : Bot → Jungle → Mid. */
  function nextBlindSlotFrom(by) {
    for (const slot of BLIND_PICK_SLOTS) {
      if (!by[slot]) return slot;
    }
    return null;
  }

  function nextBlindSlot(s, side) {
    return nextBlindSlotFrom(pickBySlot(s, side));
  }

  function pickBySlotExcluding(s, side, excludeName) {
    const m = {};
    for (const p of sidePicks(s, side)) {
      if (p.name === excludeName) continue;
      if (p.slot) m[p.slot] = p.name;
    }
    return m;
  }

  function openSlotsFrom(by) {
    return SLOTS.filter((sl) => !by[sl]);
  }

  /** Postes autorisés pour le prochain pick (un seul en phase blind). */
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

  /** Postes utilisables pour relayout (Top/Sup interdits tant que blind incomplet). */
  function layoutAllowedSlots(s, side, excludeName = null) {
    const by = excludeName ? pickBySlotExcluding(s, side, excludeName) : pickBySlot(s, side);
    const n = excludeName
      ? sidePicks(s, side).filter((p) => p.name !== excludeName).length + 1
      : sidePicks(s, side).length;
    if (nextBlindSlotFrom(by) !== null) {
      return BLIND_PICK_SLOTS.slice(0, n);
    }
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
    if (allowed.length) return allowed[0];
    const by = excludeName ? pickBySlotExcluding(s, side, excludeName) : pickBySlot(s, side);
    const open = openSlotsFrom(by);
    return open[0] || "Top";
  }

  function isBlueFirstPick(s) {
    const step = getStep(s);
    return step?.type === "pick" && step.side === "blue" && sidePickCount(s, "blue") === 0;
  }

  function recommendedSlotForPick(s, side) {
    return preferredBlindSlot(s, side);
  }

  /** Lane jouable en ranked (lolalytics) — seuil draft. */
  const MIN_LANE_PLAY_RATE = 5;

  function getLaneRates(champ, meta) {
    return champ?.laneRates || meta?.[champ?.name]?.laneRates || null;
  }

  function hasLaneRateData(champ, meta) {
    const rates = getLaneRates(champ, meta);
    return Boolean(rates && Object.keys(rates).length);
  }

  function lanePlayRate(champ, meta, slot) {
    const rates = getLaneRates(champ, meta);
    if (!rates?.[slot]) return null;
    return Number(rates[slot].rate) || 0;
  }

  /** Postes où le champion a ≥ MIN_LANE_PLAY_RATE % de pick rate. */
  function playableSlotsFor(champ, meta) {
    const rates = getLaneRates(champ, meta);
    if (rates && Object.keys(rates).length) {
      return SLOTS.filter((sl) => (rates[sl]?.rate || 0) >= MIN_LANE_PLAY_RATE);
    }
    const slots = new Set(champ?.optimalSlots || meta?.[champ?.name]?.optimalSlots || []);
    const main = champ?.mainRole || meta?.[champ?.name]?.mainRole;
    if (main) slots.add(main);
    for (const sl of champ?.flexRoles || meta?.[champ?.name]?.flexRoles || []) slots.add(sl);
    return [...slots].filter(Boolean);
  }

  function playsSlotFor(champ, meta, slot) {
    if (hasLaneRateData(champ, meta)) {
      const rate = lanePlayRate(champ, meta, slot);
      return rate !== null && rate >= MIN_LANE_PLAY_RATE;
    }
    return playableSlotsFor(champ, meta).includes(slot);
  }

  function playsSlot(v, champ, slot, meta) {
    if (meta && hasLaneRateData(champ, meta)) {
      return playsSlotFor(champ, meta, slot);
    }
    return v.slots.includes(slot);
  }

  function assignmentRespectsLaneRates(assignment, byName, metaMap) {
    return assignment.every(({ name, slot }) => {
      const c = getData(byName, metaMap, name);
      return playsSlotFor(c, metaMap, slot);
    });
  }

  function isFlexPick(v) {
    return v.flex >= 0.4 || v.slots.length >= 2;
  }

  function isOpTier(v) {
    return v.tierMeta === "S";
  }

  function isStrongTier(v) {
    return v.tierMeta === "S" || v.tierMeta === "A";
  }

  function isTeamFirstPick(s, side) {
    return sidePickCount(s, side) === 0;
  }

  /** Bonus blind selon le poste cible (ADC → Jgl → Mid). */
  function scoreFirstBlindPick(champ, v, targetSlot) {
    let bonus = 0;
    const reasons = [];
    const adc = playsSlot(v, champ, "Bot");
    const jgl = playsSlot(v, champ, "Jungle");
    const mid = playsSlot(v, champ, "Mid");

    if (targetSlot === "Bot") {
      if (adc && isOpTier(v)) {
        bonus += 58;
        reasons.push("Blind ADC (Tier S) — peu punissable");
      } else if (adc && v.tierMeta === "A") {
        bonus += 38;
        reasons.push("Blind ADC (Tier A)");
      } else if (adc) {
        bonus += 22;
        reasons.push("Blind ADC");
      } else {
        bonus -= 120;
        reasons.push("ADC blind obligatoire au 1er pick");
      }
    } else if (targetSlot === "Jungle") {
      if (jgl && isOpTier(v)) {
        bonus += 52;
        reasons.push("Blind Jungle (Tier S)");
      } else if (jgl && v.tierMeta === "A") {
        bonus += 34;
        reasons.push("Blind Jungle (Tier A)");
      } else if (jgl) {
        bonus += 20;
        reasons.push("Blind Jungle");
      } else {
        bonus -= 120;
        reasons.push("Jungle blind requis (2e pick équipe)");
      }
    } else if (targetSlot === "Mid") {
      if (mid && isStrongTier(v)) {
        bonus += 28;
        reasons.push("Blind Mid tier");
      } else if (mid && isFlexPick(v)) {
        bonus += 24;
        reasons.push("Blind Mid flex");
      } else if (mid) {
        bonus += 16;
        reasons.push("Blind Mid");
      } else {
        bonus -= 120;
        reasons.push("Mid blind requis (3e pick équipe)");
      }
    } else if (isFlexPick(v)) {
      bonus += 42;
      reasons.push("Blind flex (safe)");
    } else {
      bonus -= 80;
      reasons.push("Top/Sup = counter pick uniquement");
    }

    if (v.familyKey || (v.compTypes?.length && v.familyLabel)) {
      bonus += 16;
      reasons.push(`Famille ${v.familyLabel || v.familyKey || "claire"}`);
    }
    if ((v.pairings?.length || 0) >= 2 || v.spellSetup > 0.45) {
      bonus += 14;
      reasons.push("Potentiel synergies / combos");
    }
    if (v.colors?.dominant?.length === 1) {
      bonus += 20;
      reasons.push(`Trinité ${v.colors.identity || v.colors.dominant[0]}`);
    } else if (v.colors?.dominant?.length === 2) {
      bonus += 11;
      reasons.push("Identité bicolore");
    }

    return { bonus, reasons };
  }

  /** Bonus / malus blind par ordre ADC → Jgl → Mid ; repousse Top/Support. */
  function scoreBlindPickBonus(champ, v, s, side, excludeName = null) {
    const preferred = preferredBlindSlot(s, side, excludeName);
    const open = excludeName ? openSlotsFrom(pickBySlotExcluding(s, side, excludeName)) : openSlots(s, side);
    let bonus = 0;
    const reasons = [];

    if (playsSlot(v, champ, preferred)) {
      const weights = { Bot: 28, Jungle: 24, Mid: 20, Support: 10, Top: 8 };
      bonus += weights[preferred] || 12;
      const n = sidePickCount(s, side) + 1;
      if (preferred === "Bot") {
        reasons.push(`Blind ADC (${n}e pick — dur à punir)`);
        if (isStrongTier(v)) bonus += 14;
        if (v.scaling > 0.45 || v.flex >= 0.35) bonus += 8;
      } else if (preferred === "Jungle") {
        reasons.push(`Blind Jungle (${n}e pick)`);
        if (isStrongTier(v)) bonus += 12;
        if (v.flex >= 0.4) bonus += 10;
      } else if (preferred === "Mid") {
        reasons.push(`Blind Mid (${n}e pick)`);
        if (isFlexPick(v)) bonus += 12;
        else if (isStrongTier(v)) bonus += 8;
      } else if (preferred === "Support") {
        reasons.push("Support : matchup bot connu");
      } else if (preferred === "Top") {
        reasons.push("Top : matchup top connu");
      }
    }

    const nextBlind = nextBlindSlotFrom(
      excludeName ? pickBySlotExcluding(s, side, excludeName) : pickBySlot(s, side)
    );
    if (nextBlind !== null) {
      if (LATE_MATCHUP_SLOTS.some((late) => playsSlot(v, champ, late))) {
        bonus -= 150;
        reasons.push("Top/Sup interdits en blind — counter pick only");
      }
      if (!playsSlot(v, champ, preferred)) {
        bonus -= 150;
        reasons.push(`Blind ${SLOT_LABELS[preferred]} requis`);
      }
    } else if (isBlindPickPhase(s, side) === false) {
      for (const late of LATE_MATCHUP_SLOTS) {
        if (!playsSlot(v, champ, late) || isLaneMatchupKnown(s, side, late)) continue;
        bonus -= 40;
        reasons.push(`${SLOT_LABELS[late]} : attendre le matchup adverse`);
      }
    }

    return { bonus, reasons, preferredSlot: preferred };
  }

  function scoreSlotOrderBonus(v, champ, s, side, excludeName = null) {
    const preferred = preferredBlindSlot(s, side, excludeName);
    if (!preferred || !playsSlot(v, champ, preferred)) return { bonus: 0, reasons: [] };
    const weights = { Bot: 22, Jungle: 18, Mid: 14, Support: 5, Top: 4 };
    return {
      bonus: weights[preferred] || 10,
      reasons: [`Ordre blind : ${SLOT_LABELS[preferred] || preferred}`],
    };
  }

  function scoreCompFoundationBonus(before, after, links, depth) {
    if (depth > 0.65) return { bonus: 0, reasons: [] };
    let bonus = 0;
    const reasons = [];
    const fDelta = (after.family?.score || 0) - (before.family?.score || 0);
    if (fDelta > 5) {
      bonus += Math.round(fDelta * 0.55);
      reasons.push("Respecte la famille");
    }
    const cDelta = (after.colors?.score || 0) - (before.colors?.score || 0);
    if (cDelta > 5) {
      bonus += Math.round(cDelta * 0.5);
      reasons.push("Trinité / couleurs MTG");
    }
    if (links.links > 0) {
      bonus += Math.round(links.links * 10);
      if (!reasons.some((r) => r.includes("synergie"))) reasons.push("Synergies / combos");
    }
    return { bonus, reasons };
  }

  function getDraftCoachHint(s, side, byName, meta) {
    const slot = preferredBlindSlot(s, side);
    const label = SLOT_LABELS[slot] || slot;
    const n = sidePickCount(s, side) + 1;
    const parts = [];

    if (byName && meta) {
      const allies = sidePicks(s, side).map((p) => p.name);
      const opp = side === "blue" ? "red" : "blue";
      const oppNames = sidePicks(s, opp).map((p) => p.name);
      const ev = evaluateTeam(allies, {
        byName, metaMap: meta, oppNames, w: phaseWeights(draftDepth(s)), slotsLeft: openSlots(s, side).length,
      });
      if (ev.colors?.combination?.name) parts.push(ev.colors.combination.name);
      else if (ev.colors?.identity) parts.push(`Couleurs ${ev.colors.identity}`);
    }

    if (isTeamFirstPick(s, side)) {
      return parts.length ? `${parts.join(" · ")} · Blind 1 : ADC · Top/Sup counter only` : "Blind 1 : ADC obligatoire · Top/Sup = counter pick uniquement";
    }
    if (isBlindPickPhase(s, side)) {
      const blind = slot === "Bot" ? `Blind ${n} : ADC (dur à punir)`
        : slot === "Jungle" ? `Blind ${n} : Jungle · Top/Sup interdits`
        : slot === "Mid" ? `Blind ${n} : Mid · Top/Sup après matchup adverse`
        : `Blind ${n} : ${label} · Top/Sup = counter only`;
      return parts.length ? `${parts.join(" · ")} · ${blind}` : blind;
    }
    if (LATE_MATCHUP_SLOTS.includes(slot)) {
      const lane = isLaneMatchupKnown(s, side, slot)
        ? `Pick ${label} : matchup révélé · counter possible`
        : `Pick ${label} · blind ADC/Jgl/Mid épuisés`;
      return parts.length ? `${parts.join(" · ")} · ${lane}` : lane;
    }
    const base = `Pick : ${label} · Familles · Synergies · Trinité`;
    return parts.length ? `${parts.join(" · ")} · ${base}` : base;
  }

  // ─── Champion model ───────────────────────────────────────────────────────

  function getData(byName, meta, name) {
    return byName?.get?.(name) || meta[name] || { name, optimalSlots: [], abilities: [] };
  }

  function abilityText(champ) {
    return (champ.abilities || []).map((a) => a.description || "").join(" ");
  }

  function parseSpells(text) {
    const t = text.toLowerCase();
    return {
      cc: /étourdi|étourdit|enracin|immobilis|silenc|stun|root/.test(t),
      knockup: /projet|en l'air|knock/.test(t),
      aoe: /tous les ennemis|zone|cercle|rayon|radius/.test(t),
      dash: /dash|téléport|charge|saut|se déplace/.test(t),
      heal: /soin|heal|régén|restaure/.test(t),
      shield: /bouclier|shield/.test(t),
      peel: /bouclier|sanctuaire|téléporte vers lui|save/.test(t),
    };
  }

  function tagsFor(name, meta, byName) {
    const tags = new Set(meta[name]?.tags || []);
    if (WAVE_CLEAR.has(name) || hasWaveClear(name, byName)) tags.add("wave_clear");
    const type = (meta[name]?.type || "").toLowerCase();
    if (/combattant|tank|fighter/i.test(type) && !tags.has("assassin")) tags.add("frontline");
    if (/support/i.test(type)) tags.add("peel");
    if (tags.has("mage_burst") && tags.has("poke")) tags.add("wave_clear");
    return tags;
  }

  /** Vecteur normalisé 0–1 par champion — axes MOBA. */
  function buildVector(champ, meta) {
    const dp = champ.draftProfile || meta[champ.name]?.draftProfile || {};
    const tags = tagsFor(champ.name, meta);
    if (champ.draftProfile?.waveClear) tags.add("wave_clear");
    const type = (champ.type || meta[champ.name]?.type || "").toLowerCase();
    const spells = parseSpells(abilityText(champ));
    const slots = playableSlotsFor(champ, meta);
    const tier = TIER[champ.tierMeta || meta[champ.name]?.tierMeta] ?? 0.35;

    const fam = champ.championFamily || {};
    const familyKey = fam.key || meta[champ.name]?.family || "";
    const compTypes = fam.compTypes || meta[champ.name]?.compTypes || [];
    if (familyKey === "bruiser_split" || compTypes.includes("split_push")) tags.add("split");
    if (compTypes.includes("poke_siege") || compTypes.includes("poke_disengage")) tags.add("poke");

    let engage = clamp01(
      (tags.has("engage") ? 0.55 : 0) +
        (tags.has("frontline") && tags.has("dive") ? 0.25 : 0) +
        (spells.knockup ? 0.35 : 0) +
        (spells.dash && tags.has("frontline") ? 0.2 : 0)
    );

    let disengage = clamp01(
      (tags.has("peel") ? 0.5 : 0) +
        (tags.has("poke") ? 0.35 : 0) +
        (spells.peel || spells.heal ? 0.3 : 0) +
        (tags.has("wave_clear") ? 0.15 : 0)
    );

    let scaling = clamp01(
      (tags.has("scaling") ? 0.6 : 0) +
        (/marksman|à distance|artillerie/i.test(type) ? 0.35 : 0) +
        (dp.dpsWeight > 0.7 ? 0.2 : 0)
    );

    if (familyKey === "support_disengage" || familyKey === "tank_disengage") {
      disengage = clamp01(disengage + 0.35);
    }
    if (familyKey === "support_engage" || familyKey === "tank_engage") {
      engage = clamp01(engage + 0.3);
    }
    if (familyKey === "adc_hypercarry" || compTypes.includes("hypercarry")) {
      scaling = clamp01(scaling + 0.35);
    }

    const early = clamp01(
      (tags.has("aggressive_jungle") || tags.has("pick_jungle") ? 0.45 : 0) +
        (tags.has("assassin") || tags.has("dive") ? 0.4 : 0) +
        (tier >= 0.82 && !tags.has("scaling") ? 0.25 : 0)
    );

    const tank = clamp01((dp.tankWeight ?? 0) / 1.25);
    const burst = clamp01(
      ((dp.dpsWeight ?? 0) / 1.25) * 0.5 +
        (tags.has("assassin") ? 0.45 : 0) +
        (tags.has("mage_burst") ? 0.35 : 0) +
        (spells.aoe ? 0.15 : 0)
    );

    const ad = clamp01(dp.adShare ?? (tags.has("mage_burst") ? 0 : 0.85));
    const ap = clamp01(dp.apShare ?? (tags.has("mage_burst") ? 0.85 : 0.15));

    const flex = clamp01(slots.length / 5);
    const carry = clamp01(
      tier * 0.35 +
        ((dp.dpsWeight ?? 0) / 1.25) * 0.35 +
        (tags.has("assassin") || /marksman|à distance/i.test(type) ? 0.25 : 0)
    );
    const specialist = clamp01(carry * (1.1 - flex * 0.7));

    const spellSetup = clamp01((spells.cc ? 0.4 : 0) + (spells.knockup ? 0.35 : 0) + (spells.aoe ? 0.25 : 0));
    const spellFollow = clamp01((spells.aoe ? 0.4 : 0) + (burst > 0.5 ? 0.35 : 0));

    return {
      name: champ.name,
      champ,
      tags,
      tier,
      tierMeta: champ.tierMeta || meta[champ.name]?.tierMeta || "C",
      slots,
      spells,
      engage,
      disengage,
      scaling,
      early,
      tank,
      burst,
      ad,
      ap,
      flex,
      carry,
      specialist,
      spellSetup,
      spellFollow,
      front: tags.has("frontline") ? 1 : 0,
      peel: tags.has("peel") ? 1 : 0,
      wave: tags.has("wave_clear") ? 1 : 0,
      pairings: pairingNames(champ.bestPairings, meta[champ.name]),
      counters: matchupNames(champ.bestCounters, meta[champ.name]),
      counteredBy: matchupNames(champ.worstMatchups, meta[champ.name]),
      familyKey,
      compTypes,
      familyLabel: fam.label || meta[champ.name]?.familyLabel || "",
      colors: getColorIdentity(champ, meta),
    };
  }

  function matchupNames(list, metaEntry) {
    const raw = list || metaEntry?.bestCounters || metaEntry?.worstMatchups || [];
    return raw.map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean);
  }

  function pairingNames(list, metaEntry) {
    const raw = list || metaEntry?.bestPairings || [];
    return raw.map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean);
  }

  /** Profil couleur MTG (W/U/B/R/G, somme 24) — source Kaze oracle. */
  function getColorIdentity(champ, meta) {
    const ci = champ.colorIdentity || meta[champ.name]?.colorIdentity;
    if (!ci) return null;
    return {
      W: ci.W ?? 0,
      U: ci.U ?? 0,
      B: ci.B ?? 0,
      R: ci.R ?? 0,
      G: ci.G ?? 0,
      dominant: ci.dominant || [],
      identity: ci.identity || "",
      vector: ci.vector || MTG_COLORS.map((k) => (ci[k] || 0) / 24),
    };
  }

  function colorVectorFrom(ci) {
    if (!ci) return MTG_COLORS.map(() => 0);
    return MTG_COLORS.map((k) => (ci[k] || 0) / 24);
  }

  function sumColorVectors(vectors) {
    const out = MTG_COLORS.map(() => 0);
    for (const v of vectors) {
      if (!v) continue;
      for (let i = 0; i < 5; i += 1) out[i] += v[i] || 0;
    }
    return out;
  }

  function dominantFromSum(sum) {
    const pairs = MTG_COLORS.map((c, i) => [c, sum[i]]).sort((a, b) => b[1] - a[1]);
    return pairs.filter(([, v]) => v >= 0.35).slice(0, 2).map(([c]) => c);
  }

  function pairColorScore(a, b) {
    const pie = mtgPie();
    if (pie) return pie.pairRelationScore(a, b);
    if (!a?.length || !b?.length) return 0;
    let allied = 0;
    let enemy = 0;
    for (const [x, y] of COLOR_ALLIED) {
      if ((a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))) allied += 1;
    }
    for (const [x, y] of COLOR_ENEMY) {
      if (a.includes(x) && b.includes(y)) enemy += 1;
    }
    return allied * 16 - enemy * 24;
  }

  function colorCoherence(vs) {
    const pie = mtgPie();
    if (pie) return pie.colorCoherence(vs);
    if (!vs.length) return { score: 0, dominant: [], conflicts: [], identity: "", combination: null };
    const cis = vs.map((v) => v.colors).filter(Boolean);
    if (!cis.length) return { score: 0, dominant: [], conflicts: [], identity: "", combination: null };
    const teamSum = sumColorVectors(cis.map((c) => colorVectorFrom(c)));
    const dominant = dominantFromSum(teamSum);
    let score = 0;
    const conflicts = [];
    if (dominant.length === 1 && vs.length >= 2) score += 18 + vs.length * 6;
    else if (dominant.length === 2) score += 12;
    else if (dominant.length >= 3 && vs.length >= 4) {
      score -= 20;
      conflicts.push("Identités couleur dispersées (4+ sans plan)");
    }
    for (let i = 0; i < cis.length; i += 1) {
      for (let j = i + 1; j < cis.length; j += 1) {
        const d1 = cis[i].dominant || dominantFromSum(colorVectorFrom(cis[i]));
        const d2 = cis[j].dominant || dominantFromSum(colorVectorFrom(cis[j]));
        score += pairColorScore(d1, d2);
        for (const [x, y] of COLOR_ENEMY) {
          if (d1.includes(x) && d2.includes(y)) {
            conflicts.push(`${COLOR_LABELS[x]} vs ${COLOR_LABELS[y]} (${vs[i].name}/${vs[j].name})`);
            score -= 18;
          }
        }
      }
    }
    return {
      score: Math.round(score), dominant, conflicts: [...new Set(conflicts)].slice(0, 4),
      identity: dominant.join("") || "", combination: null, teamSum,
    };
  }

  function colorPickBonus(champColors, teamColors, teamSum) {
    const pie = mtgPie();
    if (pie) {
      const r = pie.colorPickBonus(champColors, teamColors, teamSum);
      return typeof r === "object" ? r.score : r;
    }
    if (!champColors || !teamColors?.length) return 0;
    let s = 0;
    const dom = champColors.dominant || [];
    for (const tc of teamColors) {
      s += pairColorScore(dom, tc.dominant || []);
      const dot = colorVectorFrom(champColors).reduce(
        (acc, v, i) => acc + v * (colorVectorFrom(tc)[i] || 0),
        0
      );
      s += Math.round(dot * 35);
    }
    return s;
  }

  function colorPickDetail(champColors, teamColors, teamSum) {
    const pie = mtgPie();
    if (pie) return pie.colorPickBonus(champColors, teamColors, teamSum);
    return { score: colorPickBonus(champColors, teamColors, teamSum), label: null };
  }

  function teamColorSummary(names, byName, meta) {
    const vs = names.map((n) => buildVector(getData(byName, meta, n), meta));
    const coh = colorCoherence(vs);
    return {
      ...coh,
      bars: MTG_COLORS.map((c, i) => ({
        code: c,
        label: COLOR_LABELS[c],
        hex: COLOR_HEX[c],
        value: coh.teamSum?.[i] || 0,
      })),
    };
  }

  function listScore(name, list, w) {
    const i = list?.indexOf(name);
    return i >= 0 ? w[i] ?? w[w.length - 1] : 0;
  }

  // ─── Team aggregation ─────────────────────────────────────────────────────

  function teamVectors(names, byName, meta) {
    return names.map((n) => buildVector(getData(byName, meta, n), meta));
  }

  function sumAxis(vs, key) {
    return vs.reduce((s, v) => s + v[key], 0);
  }

  function avgAxis(vs, key) {
    return vs.length ? sumAxis(vs, key) / vs.length : 0;
  }

  /** Rule-of-three : score max quand les 3 pôles sont présents, pénalité si mono-pôle. */
  function triangleBalance(a, b, c, idealEach = 0.35) {
    if (a + b + c < 0.15) return -40;
    const spread = Math.min(a, b, c);
    const mono = Math.max(a, b, c) / Math.max(0.01, a + b + c);
    let s = spread * 80;
    if (mono > 0.75) s -= 35;
    if (a >= idealEach && b >= idealEach && c >= idealEach) s += 25;
    return s;
  }

  function compBalance(vs, slotsLeft, complete) {
    const n = vs.length;
    if (!n) return { score: 0, gaps: [] };

    const engage = sumAxis(vs, "engage");
    const disengage = sumAxis(vs, "disengage");
    const poke = avgAxis(vs, "disengage") * n;
    const early = sumAxis(vs, "early");
    const scale = sumAxis(vs, "scaling");
    const tank = sumAxis(vs, "tank");
    const burst = sumAxis(vs, "burst");
    const ad = sumAxis(vs, "ad");
    const ap = sumAxis(vs, "ap");
    const front = sumAxis(vs, "front");
    const peel = sumAxis(vs, "peel");
    const wave = sumAxis(vs, "wave");

    let score = 0;
    const gaps = [];
    const urg = slotsLeft <= 1 ? 2.2 : slotsLeft === 2 ? 1.6 : 1;

    score += triangleBalance(engage, disengage, poke * 0.5 + wave * 0.3, 0.4);
    score += triangleBalance(early, scale, (engage + burst) * 0.3, 0.35);
    score += triangleBalance(tank, burst * 0.7, scale * 0.5, 0.3);

    const dmgTotal = ad + ap;
    if (dmgTotal > 0) {
      const apR = ap / dmgTotal;
      if (apR >= 0.28 && apR <= 0.62) score += 22;
      else score -= 18;
    }

    if (front < 1) { score -= 55 * urg * (complete ? 1.2 : 0.65); gaps.push({ k: "frontline", urgent: slotsLeft <= 1 }); }
    if (peel < 1) { score -= 48 * urg * (complete ? 1.1 : 0.6); gaps.push({ k: "peel", urgent: slotsLeft <= 1 }); }
    if (wave < 1) { score -= 42 * urg * (complete ? 1 : 0.55); gaps.push({ k: "wave clear", urgent: slotsLeft <= 2 }); }

    if (burst >= 2.2 && tank < 0.8 && peel < 1) score -= 38;
    if (scale >= 1.8 && early < 0.6) score -= 28;
    if (engage >= 2 && disengage < 0.5) score -= 22;

    if (complete && front >= 1 && peel >= 1 && wave >= 1) score += 30;

    return { score, gaps, axes: { engage, disengage, early, scale, tank, burst, ad, ap, front, peel, wave } };
  }

  function spellSynergy(vs) {
    if (vs.length < 2) return 0;
    let s = 0;
    const setup = sumAxis(vs, "spellSetup");
    const follow = sumAxis(vs, "spellFollow");
    if (setup >= 0.8 && follow >= 0.8) s += 45;
    if (setup >= 1.2 && burst(vs) >= 1.5) s += 35;
    for (let i = 0; i < vs.length; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        if (vs[i].spells.knockup && vs[j].spells.aoe) s += 18;
        if (vs[i].spells.cc && vs[j].burst > 0.55) s += 16;
        if (vs[i].spells.peel && vs[j].carry > 0.6) s += 22;
        if (vs[i].spells.shield && vs[j].scaling > 0.5) s += 14;
      }
    }
    return s;
  }

  function burst(vs) { return sumAxis(vs, "burst"); }

  /** Cohérence familles / types de comp (cours Shanei). */
  function familyCoherence(vs) {
    if (vs.length < 2) return { score: 0, dominant: null, conflicts: [] };
    const typeCounts = {};
    const familyKeys = new Set();
    for (const v of vs) {
      if (v.familyKey) familyKeys.add(v.familyKey);
      for (const t of v.compTypes || []) {
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
    }
    const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const dominant = sorted[0]?.[0] || null;
    let score = 0;
    const conflicts = [];

    if (dominant && sorted[0][1] >= 2) {
      score += 15 + sorted[0][1] * 12;
      if (sorted[0][1] >= 3) score += 25;
    }

    const hasPoke = (typeCounts.poke_disengage || 0) + (typeCounts.poke_siege || 0) >= 2;
    const hasEngageSup = vs.some((v) => v.familyKey === "support_engage");
    const hasDisengageSup = vs.some((v) => v.familyKey === "support_disengage");
    const hasHyper = (typeCounts.hypercarry || 0) >= 1;
    const hasEnchanter = vs.some((v) => v.familyKey === "support_enchanter");
    const hasSplit = (typeCounts.split_push || 0) >= 2;

    if (hasPoke && hasEngageSup) {
      score -= 45;
      conflicts.push("Poke/disengage + support engage (ex. Xerath+Leona)");
    }
    if (hasHyper && !hasEnchanter && vs.some((v) => v.familyKey === "support_engage")) {
      score -= 20;
      conflicts.push("Hypercarry sans enchanter");
    }
    if (hasHyper && hasEnchanter) score += 30;
    if (hasPoke && hasDisengageSup) score += 28;
    if (hasSplit && (typeCounts.pick_global || 0) >= 1) score += 18;

    if (familyKeys.size > 4 && vs.length >= 4) {
      score -= 15;
      conflicts.push("Trop de familles différentes — manque cohérence");
    }

    return { score, dominant, conflicts };
  }

  /** Détecte le plan macro (poke, dive, hypercarry…) et sa complétude. */
  function detectCompPlan(vs) {
    if (!vs.length) return { plan: null, label: "", completeness: 0, gaps: [], carry: null };
    const typeCounts = {};
    for (const v of vs) {
      for (const t of v.compTypes || []) typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const axes = aggregateAxes(vs);
    const poke = (typeCounts.poke_siege || 0) + (typeCounts.poke_disengage || 0);
    const engage = typeCounts.teamfight_engage || 0;
    const hyper = typeCounts.hypercarry || 0;
    const split = typeCounts.split_push || 0;
    const pick = typeCounts.pick_global || 0;
    const gaps = [];
    let plan = null;
    let completeness = 0;

    if (hyper >= 1 || (axes.scaling >= 1.5 && sumAxis(vs, "peel") >= 1)) {
      plan = "hypercarry";
      completeness = hyper >= 1 ? 30 : 15;
      if (vs.some((x) => x.familyKey === "support_enchanter")) completeness += 35;
      else gaps.push("enchanter");
      if (sumAxis(vs, "front") >= 1) completeness += 20;
      else gaps.push("frontline");
      if (sumAxis(vs, "peel") < 1) gaps.push("peel");
    } else if (poke >= 2 || (axes.disengage >= 1.2 && sumAxis(vs, "wave") >= 1)) {
      plan = typeCounts.poke_disengage >= 2 ? "poke_disengage" : "poke_siege";
      completeness = poke * 20 + (axes.disengage >= 0.8 ? 25 : 0);
      if (vs.some((x) => x.familyKey === "support_engage")) gaps.push("engage_sup_conflict");
      if (sumAxis(vs, "wave") < 1) gaps.push("wave clear");
    } else if (engage >= 2 || axes.engage >= 1.8) {
      plan = "teamfight_engage";
      completeness = engage * 18 + (sumAxis(vs, "front") >= 1 ? 25 : 0);
      if (sumAxis(vs, "front") < 1) gaps.push("frontline");
      if (axes.burst < 1) gaps.push("burst follow");
    } else if (split >= 1) {
      plan = "split_push";
      completeness = split * 22 + (pick >= 1 ? 20 : 0);
      if (!pick) gaps.push("global pressure");
    } else if (pick >= 1 || axes.early >= 1.5) {
      plan = pick >= 1 ? "pick_global" : "lane_tempo";
      completeness = 25;
    } else if (axes.engage >= 1.2 && axes.burst >= 1.5) {
      plan = "beatdown";
      completeness = 30;
      if (sumAxis(vs, "front") < 1) gaps.push("frontline");
    } else if (sumAxis(vs, "front") >= 1 && axes.scaling >= 1 && sumAxis(vs, "peel") >= 1) {
      plan = "front_to_back";
      completeness = 40;
    } else if (axes.scaling >= 1.8) {
      plan = "scaling_late";
      completeness = 20;
      if (axes.early < 0.5) gaps.push("early tempo");
    } else {
      const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
      plan = sorted[0]?.[0] || null;
      completeness = sorted[0] ? sorted[0][1] * 15 : 0;
    }

    const carry = vs.reduce((best, x) => ((x.carry || 0) > (best?.carry || 0) ? x : best), null);
    return {
      plan,
      label: COMP_PLAN_LABELS[plan] || plan || "",
      completeness: Math.min(100, completeness),
      gaps,
      carry: carry?.name || null,
    };
  }

  function scoreWinConditionBonus(beforeVs, afterVs, depth) {
    const before = detectCompPlan(beforeVs);
    const after = detectCompPlan(afterVs);
    let bonus = 0;
    const reasons = [];
    const compDelta = after.completeness - before.completeness;
    if (compDelta >= 12) {
      bonus += Math.round(compDelta * (0.45 + depth * 0.55));
      if (after.label) reasons.push(`Plan ${after.label} (${after.completeness}%)`);
    }
    if (before.gaps.length > after.gaps.length && after.plan) {
      bonus += Math.round(22 + depth * 18);
      const filled = before.gaps.find((g) => !after.gaps.includes(g));
      if (filled) reasons.push(`Complète : ${filled}`);
    }
    if (depth >= 0.55 && after.completeness >= 68 && after.gaps.length <= 1) {
      bonus += 32;
      reasons.push("Win condition presque verrouillée");
    }
    return { bonus, reasons, before, after };
  }

  function counterabilityScore(v, meta, byName, name) {
    const data = getData(byName, meta, name);
    const counteredBy = matchupNames(data.worstMatchups, meta[name]);
    const poolThreat = counteredBy.length;
    const blindRisk = poolThreat * 12 + (v.specialist || 0) * 28 + (v.flex < 0.35 ? 18 : 0);
    return { blindRisk, poolThreat, counteredBy };
  }

  function scoreAntiBlindPenalty(champ, v, s, side, byName, meta) {
    const inBlind = isBlindPickPhase(s, side) || isTeamFirstPick(s, side);
    if (!inBlind) return { penalty: 0, reasons: [] };
    const { blindRisk, poolThreat } = counterabilityScore(v, meta, byName, champ.name);
    if (blindRisk < 35) return { penalty: 0, reasons: [] };
    const pickN = sidePickCount(s, side);
    const weight = pickN === 0 ? 1 : pickN === 1 ? 0.75 : 0.5;
    const penalty = Math.round(blindRisk * weight * (1 - draftDepth(s) * 0.35));
    const reasons = [];
    if (poolThreat >= 3) reasons.push(`Counterable (${poolThreat} menaces pool)`);
    else if (poolThreat >= 1) reasons.push("Matchup risqué en blind");
    if (v.specialist > 0.55 && v.flex < 0.4) reasons.push("Spécialiste — éviter blind");
    return { penalty, reasons };
  }

  function pairingSynergy(vs) {
    if (vs.length < 2) return 0;
    let s = 0;
    let links = 0;
    let mutual = 0;
    for (let i = 0; i < vs.length; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        const ab = listScore(vs[j].name, vs[i].pairings, SYN_W);
        const ba = listScore(vs[i].name, vs[j].pairings, SYN_W);
        if (ab || ba) {
          links++;
          s += ab + Math.round(ba * 0.9);
          if (ab && ba) mutual++;
        }
      }
    }
    if (links >= 4) s += 50;
    else if (links >= 3) s += 32;
    if (mutual >= 2) s += 40;
    return s + spellSynergy(vs);
  }

  function counterScore(us, them, byName, meta) {
    if (!them.length || !us.length) return 0;
    let s = 0;
    let covered = 0;
    for (const u of us) {
      for (const e of them) {
        const ed = getData(byName, meta, e);
        const hit = listScore(u.name, matchupNames(ed.bestCounters, meta[e]), CTR_W);
        if (hit) { s += hit; covered++; }
        const back = listScore(e, u.counters, CTR_W);
        if (back) s -= Math.round(back * 0.5);
      }
    }
    if (covered >= them.length * us.length * 0.35) s += 40;
    return s;
  }

  function axisCounter(us, them, byName, meta) {
    const u = aggregateAxes(teamVectors(us, byName, meta));
    const t = aggregateAxes(teamVectors(them, byName, meta));
    let s = 0;
    if (t.burst > u.tank + 0.5 && u.tank < 1) s -= 25;
    if (u.burst > t.tank + 0.5) s += 28;
    if (t.engage > 1.5 && u.disengage < 0.8) s -= 30;
    if (u.engage > t.disengage + 0.5) s += 25;
    if (t.scaling > 1.5 && u.early < 0.8) s -= 22;
    if (u.early > t.scaling * 0.8) s += 20;
    return s;
  }

  function aggregateAxes(vs) {
    return {
      engage: sumAxis(vs, "engage"),
      disengage: sumAxis(vs, "disengage"),
      early: sumAxis(vs, "early"),
      scaling: sumAxis(vs, "scaling"),
      tank: sumAxis(vs, "tank"),
      burst: sumAxis(vs, "burst"),
      ad: sumAxis(vs, "ad"),
      ap: sumAxis(vs, "ap"),
    };
  }

  function laneScore(assign, oppComp, byName, meta) {
    let s = 0;
    for (const { name, slot } of assign) {
      const v = buildVector(getData(byName, meta, name), meta);
      const opp = oppComp[slot];
      if (opp) {
        const od = getData(byName, meta, opp);
        s += listScore(name, matchupNames(od.bestCounters, meta[opp]), CTR_W);
        s += listScore(opp, v.counters, CTR_W) * -0.5;
      }
      if (v.slots.includes(slot)) {
        const rate = lanePlayRate(getData(byName, meta, name), meta, slot);
        s += rate != null ? 12 + Math.min(22, Math.round(rate * 0.3)) : 24;
      } else {
        s -= 40;
      }
    }
    return s;
  }

  function evaluateTeam(names, ctx) {
    const { byName, metaMap, oppNames = [], oppComp = {}, assignment, slotsLeft, w } = ctx;
    const vs = teamVectors(names, byName, metaMap);
    const left = slotsLeft ?? Math.max(0, 5 - names.length);
    const complete = names.length >= 5;
    const bal = compBalance(vs, left, complete);
    const fam = familyCoherence(vs);
    const col = colorCoherence(vs);
    const syn = pairingSynergy(vs) + fam.score + col.score;
    const ctr = counterScore(names, oppNames, byName, metaMap);
    const lane = assignment ? laneScore(assignment, oppComp, byName, metaMap) : 0;

    let h2h = 0;
    if (oppNames.length) {
      h2h = counterScore(names, oppNames, byName, metaMap) -
        counterScore(oppNames, names, byName, metaMap) * 0.85;
      h2h += (pairingSynergy(vs) - pairingSynergy(teamVectors(oppNames, byName, metaMap)) * 0.7);
      h2h += axisCounter(names, oppNames, byName, metaMap);
    }

    const wt = w || { balance: 1, synergy: 1, counter: 1, lane: 1 };
    const total =
      bal.score * wt.balance +
      syn * wt.synergy +
      ctr * wt.counter +
      lane * wt.lane +
      h2h * wt.counter * 0.85;

    return {
      total,
      vs,
      breakdown: { balance: bal.score, synergy: syn, family: fam.score, color: col.score, counter: ctr, lane, h2h },
      gaps: bal.gaps,
      axes: bal.axes,
      family: fam,
      colors: col,
    };
  }

  // ─── Layout ───────────────────────────────────────────────────────────────

  function permute(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      for (const p of permute(arr.slice(0, i).concat(arr.slice(i + 1)))) out.push([arr[i]].concat(p));
    }
    return out;
  }

  function comb(arr, k) {
    if (k === 0) return [[]];
    if (k > arr.length) return [];
    const [h, ...t] = arr;
    return comb(t, k - 1).map((c) => [h].concat(c)).concat(comb(t, k));
  }

  function bestLayout(names, ctx, slotPool = SLOTS) {
    const n = names.length;
    if (!n) return { assignment: [], eval: null };
    const pool = slotPool.length >= n ? slotPool : SLOTS;
    let best = { assignment: [], eval: null, score: -Infinity };
    for (const slots of comb(pool, n)) {
      for (const order of permute(names)) {
        const assignment = order.map((name, i) => ({ name, slot: slots[i] }));
        if (!assignmentRespectsLaneRates(assignment, ctx.byName, ctx.metaMap)) continue;
        const ev = evaluateTeam(names, { ...ctx, assignment, slotsLeft: 5 - n });
        if (ev.total > best.score) best = { assignment, eval: ev, score: ev.total };
      }
    }
    return best;
  }

  function optimizeLayout(s, side, byName, meta) {
    const picks = sidePicks(s, side);
    if (!picks.length) { s.picks[side] = []; return; }
    const pinned = picks.filter((p) => p.pinned && p.slot);
    const unpinned = picks.filter((p) => !p.pinned);
    const names = unpinned.map((p) => p.name);
    if (!names.length) return;
    const usedSlots = new Set(pinned.map((p) => p.slot));
    const opp = side === "blue" ? "red" : "blue";
    const depth = draftDepth(s);
    const ctx = {
      byName, metaMap: meta,
      oppNames: sidePicks(s, opp).map((p) => p.name),
      oppComp: pickBySlot(s, opp),
      w: phaseWeights(depth),
    };
    const slotPool = layoutAllowedSlots(s, side).filter((sl) => !usedSlots.has(sl));
    const { assignment } = bestLayout(names, ctx, slotPool.length ? slotPool : SLOTS.filter((sl) => !usedSlots.has(sl)));
    if (assignment.length) {
      const orderByName = Object.fromEntries(unpinned.map((p) => [p.name, p.order]));
      const merged = assignment.map((a) => ({
        ...a,
        order: orderByName[a.name] ?? nextPickOrder(s, side),
        pinned: false,
      }));
      s.picks[side] = [...pinned, ...merged];
    }
  }

  function assignPickDirect(s, side, name, slot, { pinned = true } = {}) {
    const list = sidePicks(s, side).filter((p) => p.name !== name && p.slot !== slot);
    list.push({ name, slot, order: nextPickOrder(s, side), pinned });
    s.picks[side] = list;
  }

  function relayoutAll(s, ctx = {}) {
    if (!ctx.byName) return;
    normalizeSession(s);
    optimizeLayout(s, "blue", ctx.byName, ctx.metaMap || {});
    optimizeLayout(s, "red", ctx.byName, ctx.metaMap || {});
  }

  // ─── Pick / Ban scoring ───────────────────────────────────────────────────

  function pickLinks(champName, allies, byName, meta) {
    const v = buildVector(getData(byName, meta, champName), meta);
    let s = 0;
    let links = 0;
    for (const a of allies) {
      const av = buildVector(getData(byName, meta, a), meta);
      s += listScore(a, v.pairings, SYN_W) + listScore(champName, av.pairings, SYN_W);
      if (listScore(a, v.pairings, SYN_W) || listScore(champName, av.pairings, SYN_W)) links++;
      if (v.spells.knockup && av.spells.aoe) s += 20;
      if (v.spells.cc && av.burst > 0.5) s += 18;
      if (v.spells.peel && av.carry > 0.55) s += 22;
    }
    return { s, links };
  }

  function explain(before, after, champ, slot, allies, links, w, meta, colorDetail = null) {
    const r = [];
    const v = buildVector(champ, meta);
    if (colorDetail?.label) r.push(colorDetail.label);
    if (after.colors?.combination?.name && after.colors.combination.type !== "multicolor") {
      r.push(`Comp ${after.colors.combination.name}`);
    }
    if (links.links) r.push(`Synergie sorts/combo (${links.links})`);
    if (after.breakdown.synergy > before.breakdown.synergy + 20) r.push("Renforce la synergie");
    if (after.breakdown.h2h > before.breakdown.h2h + 18) r.push("Avantage vs adversaire");
    if (after.breakdown.counter > before.breakdown.counter + 15) r.push("Counter leur comp");
    if (v.engage > 0.55 && (after.axes?.engage || 0) > (before.axes?.engage || 0)) r.push("Apporte l'engage");
    if (v.disengage > 0.55 && (after.axes?.disengage || 0) > (before.axes?.disengage || 0)) r.push("Disengage / peel");
    if (v.scaling > 0.55 && w.carry > 0.4) r.push("Win condition scale");
    const afterPlan = detectCompPlan(after.vs || []);
    if (afterPlan.completeness >= 65 && afterPlan.label) r.push(`Win condition : ${afterPlan.label}`);
    if (v.specialist > 0.6 && w.carry > 0.5) r.push("Carry solo potential");
    if (v.flex > 0.5 && w.flex > 0.5) r.push("Flex pick");
    if (v.tierMeta === "S") r.push("Tier S");
    else if (v.tierMeta === "A") r.push("Tier A");
    if (v.colors?.identity) r.push(`Identité ${v.colors.identity}`);
    if (after.colors?.dominant?.length && v.colors?.dominant?.length) {
      const bonus = pairColorScore(v.colors.dominant, after.colors.dominant);
      if (bonus > 0) r.push("Harmonie couleur MTG");
      if ((after.colors.conflicts || []).some((c) => c.includes(v.name))) r.push("Conflit identité");
    }
    if (slot && v.slots.includes(slot)) {
      const lr = lanePlayRate(champ, meta, slot);
      if (lr != null && lr >= MIN_LANE_PLAY_RATE) {
        r.push(`Lane ${SLOT_LABELS[slot]} ${lr.toFixed(1)}%`);
      } else {
        r.push(`${slot} optimal`);
      }
    }
    for (const g of (after.gaps || []).filter((x) => x.urgent).slice(0, 1)) r.push(`Manque : ${g.k}`);
    return [...new Set(r)].slice(0, 7);
  }

  function scorePick(champ, s, side, byName, meta, hintSlot = null) {
    const depth = draftDepth(s);
    const w = phaseWeights(depth);
    const allies = sidePicks(s, side).map((p) => p.name).filter((n) => n !== champ.name);
    const opp = side === "blue" ? "red" : "blue";
    const oppNames = sidePicks(s, opp).map((p) => p.name);
    const oppComp = pickBySlot(s, opp);
    const open = openSlots(s, side);
    const left = open.length;
    const allowed = allowedSlotsForNextPick(s, side, champ.name);
    const targetSlot = allowed[0] || preferredBlindSlot(s, side, champ.name);

    const v = buildVector(champ, meta);
    const validSlot = allowed.find((sl) => playsSlot(v, champ, sl, meta));
    if (!validSlot) {
      const rateHint = allowed.map((sl) => {
        const r = lanePlayRate(champ, meta, sl);
        return r != null ? `${SLOT_LABELS[sl]} ${r.toFixed(1)}%` : SLOT_LABELS[sl];
      }).join(", ");
      return {
        score: -9999,
        reasons: [`Lane rate < ${MIN_LANE_PLAY_RATE}% (${rateHint || "poste incompatible"})`],
        slot: targetSlot,
        eval: null,
      };
    }

    const ctx = { byName, metaMap: meta, oppNames, oppComp, w, slotsLeft: left - 1 };
    const slotPool = layoutAllowedSlots(s, side, champ.name);
    const before = evaluateTeam(allies, { ...ctx, slotsLeft: left });
    const withTeam = allies.concat(champ.name);
    const { assignment, eval: after } = bestLayout(withTeam, { ...ctx, slotsLeft: left - 1 }, slotPool);

    let slot = validSlot;
    const layoutSlot = assignment.find((a) => a.name === champ.name)?.slot;
    if (layoutSlot && allowed.includes(layoutSlot)) slot = layoutSlot;

    const links = pickLinks(champ.name, allies, byName, meta);

    let score = Math.round(after.total - before.total);
    score += Math.round(links.s * w.synergy * (0.5 + allies.length * 0.12));
    score += Math.round(TIER_PTS[v.tierMeta] * w.tier);
    score += Math.round(v.flex * 28 * w.flex);
    score += Math.round(v.carry * 32 * w.carry);
    score += Math.round(v.specialist * 22 * w.carry);

    const teamColors = before.vs?.map((x) => x.colors).filter(Boolean) || [];
    const colorDetail = colorPickDetail(v.colors, teamColors, before.colors?.teamSum);
    score += Math.round(colorDetail.score * w.synergy * 0.85);
    if (after.colors?.conflicts?.length > (before.colors?.conflicts?.length || 0)) {
      score -= Math.round(25 * w.synergy);
    }

    if (allies.length >= 2 && links.links === 0) score -= Math.round(40 * w.synergy);
    if (oppNames.length >= 3 && after.breakdown.counter <= before.breakdown.counter) {
      score -= Math.round(25 * w.counter);
    }

    if (withTeam.length >= 5) {
      if (after.breakdown.h2h > 30) score += 50;
      if (after.breakdown.synergy >= 100) score += 35;
      if (after.breakdown.balance > before.breakdown.balance + 15) score += 20;
    }

    const slotOrder = scoreSlotOrderBonus(v, champ, s, side, champ.name);
    score += slotOrder.bonus;

    const blindPick = scoreBlindPickBonus(champ, v, s, side, champ.name);
    score += blindPick.bonus;

    const blindTarget = blindPick.preferredSlot || targetSlot;
    const firstBlindBonus = scoreFirstBlindPick(champ, v, blindTarget);
    score += firstBlindBonus.bonus;

    if (open.includes(blindTarget) && playsSlot(v, champ, blindTarget)) {
      slot = blindTarget;
    } else if (hintSlot && allowed.includes(hintSlot) && playsSlot(v, champ, hintSlot)) {
      slot = hintSlot;
    }

    const foundation = scoreCompFoundationBonus(before, after, links, depth);
    score += foundation.bonus;

    const beforeVs = before.vs || teamVectors(allies, byName, meta);
    const afterVs = after.vs || teamVectors(withTeam, byName, meta);
    const winCond = scoreWinConditionBonus(beforeVs, afterVs, depth);
    score += Math.round(winCond.bonus * (w.plan || 1));

    const antiBlind = scoreAntiBlindPenalty(champ, v, s, side, byName, meta);
    score -= antiBlind.penalty;

    const reasons = explain(before, after, champ, slot, allies, links, w, meta, colorDetail);
    const extraReasons = [
      ...slotOrder.reasons,
      ...blindPick.reasons,
      ...(firstBlindBonus?.reasons || []),
      ...foundation.reasons,
      ...winCond.reasons,
      ...antiBlind.reasons,
    ];
    for (const r of extraReasons) {
      if (!reasons.includes(r)) reasons.unshift(r);
    }
    return { score, reasons: reasons.slice(0, 8), slot, eval: after };
  }

  function scoreCandidate(s, side, champ, byName, meta, hintSlot = null) {
    return scorePick(champ, s, side, byName, meta, hintSlot);
  }

  function quickPlaysSlot(champ, meta, slot) {
    return playsSlotFor(champ, meta, slot);
  }

  function pickCandidatesForSide(s, side, avail, meta) {
    const allowed = allowedSlotsForNextPick(s, side);
    return avail.filter((c) => allowed.some((sl) => playsSlotFor(c, meta, sl)));
  }

  let recommendationCache = null;

  function recommendationCacheKey(s, side, all, step) {
    const fearlessBlock = s.fearless
      ? [...fearlessUsed(all, s.id)].sort().join(",")
      : "";
    return [
      s.id,
      s.stepIndex,
      s.fearless ? 1 : 0,
      fearlessBlock,
      side,
      step?.type || "",
      JSON.stringify(s.bans),
      JSON.stringify(s.picks),
    ].join("\0");
  }

  function invalidateRecommendationCache() {
    recommendationCache = null;
  }

  function scoreBan(champ, s, side, byName, meta) {
    const depth = draftDepth(s);
    const w = phaseWeights(depth);
    const v = buildVector(champ, meta);
    const r = [];
    let score = Math.round(TIER_PTS[v.tierMeta] * w.tier + v.flex * 22 * w.flex);

    const allies = sidePicks(s, side).map((p) => p.name);
    const opp = side === "blue" ? "red" : "blue";
    const oppNames = sidePicks(s, opp).map((p) => p.name);
    const oppOpen = openSlots(s, opp);
    const step = getStep(s);
    const banPhase = step?.banPhase || 1;

    for (const a of allies) {
      const hit = listScore(champ.name, matchupNames(getData(byName, meta, a).bestCounters, meta[a]), CTR_W);
      if (hit) { score += hit + 8; r.push(`Counter ${a}`); }
    }

    for (const e of oppNames) {
      const ev = buildVector(getData(byName, meta, e), meta);
      const syn = listScore(champ.name, ev.pairings, SYN_W) + listScore(e, v.pairings, SYN_W);
      if (syn >= 28) {
        score += Math.round(syn * 0.55 * w.deny);
        r.push(`Casse synergie avec ${e}`);
      }
      if (listScore(e, v.pairings, SYN_W) && listScore(champ.name, ev.pairings, SYN_W)) {
        score += 24;
        r.push(`Deny duo ${e}+${champ.name}`);
      }
    }

    const ctx = { byName, metaMap: meta, oppNames: allies, w };
    const before = evaluateTeam(oppNames, { ...ctx, slotsLeft: oppOpen.length });
    const after = evaluateTeam(oppNames.concat(champ.name), { ...ctx, slotsLeft: Math.max(0, oppOpen.length - 1) });
    const delta = after.total - before.total;
    if (delta > 0) {
      score += Math.round(delta * (0.55 + depth * 0.15));
      r.push("Améliore leur comp");
    }

    score += counterScore(oppNames.concat(champ.name), allies, byName, meta) * (0.18 + depth * 0.12);

    if (allies.length >= 2) {
      const ourPlan = detectCompPlan(teamVectors(allies, byName, meta));
      if (ourPlan.plan === "hypercarry" && (v.tags.has("assassin") || v.tags.has("dive"))) {
        score += 32;
        r.push("Anti-dive vs hypercarry");
      }
      if (ourPlan.plan?.includes("poke") && v.tags.has("engage")) {
        score += 28;
        r.push("Engage vs notre poke");
      }
      if (ourPlan.carry && listScore(ourPlan.carry, v.counters, CTR_W)) {
        score += 36;
        r.push(`Menace carry ${ourPlan.carry}`);
      }
      if (ourPlan.completeness >= 50 && delta > 8) {
        score += 22;
        r.push("Brise réponse à notre plan");
      }
    }

    if (v.tierMeta === "S" && oppOpen.length >= 2) {
      score += 18 + banPhase * 4;
      r.push("Deny S flex");
    }
    if (v.carry > 0.65 && w.carry > 0.3) { score += 14; r.push("Deny carry"); }
    if (v.flex >= 0.5 && banPhase === 1) { score += 12; r.push("Flex ban — cache intent"); }

    if (banPhase === 2 && oppNames.length >= 3) {
      const oppPlan = detectCompPlan(teamVectors(oppNames, byName, meta));
      for (const gap of oppPlan.gaps) {
        if (gap === "peel" && v.peel) { score += 20; r.push("Deny peel manquant"); break; }
        if (gap === "frontline" && v.front) { score += 18; r.push("Deny frontline"); break; }
      }
    }

    return { score, reasons: [...new Set(r)].slice(0, 7) };
  }

  // ─── Session actions (unchanged API) ────────────────────────────────────

  function applyAction(s, action, all = [], ctx = {}) {
    s.history.push(JSON.stringify({ stepIndex: s.stepIndex, bans: s.bans, picks: s.picks }));
    const step = getStep(s);
    if (!step) return { ok: false, error: "Draft terminé." };
    if (taken(s, all).has(action.championName)) {
      if (s.fearless && fearlessUsed(all, s.id).has(action.championName)) {
        return { ok: false, error: "Champion indisponible (fearless)." };
      }
      return { ok: false, error: "Champion déjà pris ou banni." };
    }
    if (step.type === "ban") {
      const idx = action.banIndex ?? step.banIndex;
      if (idx == null || idx < 0 || idx >= BANS_PER_TEAM) return { ok: false, error: "Case ban invalide." };
      if (s.bans[step.side][idx]) return { ok: false, error: "Case ban déjà remplie." };
      s.bans[step.side][idx] = action.championName;
    } else {
      if (!ctx.byName) return { ok: false, error: "Données manquantes." };
      const list = sidePicks(s, step.side).filter((p) => p.name !== action.championName);
      if (list.length >= 5) return { ok: false, error: "Picks pleins." };
      clearFromBoard(s, action.championName);
      const by = pickBySlot(s, step.side);
      if (action.slot && !by[action.slot]) {
        assignPickDirect(s, step.side, action.championName, action.slot, { pinned: true });
      } else {
        s.picks[step.side] = list.concat([{ name: action.championName, slot: SLOTS[0], order: nextPickOrder(s, step.side) }]);
        relayoutAll(s, ctx);
      }
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
    const prev = JSON.parse(s.history.pop());
    Object.assign(s, prev);
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
    const na = comp[a];
    const nb = comp[b];
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
    const { byName, metaMap } = ctx;

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
      let idx = banIndex;
      if (idx == null || idx < 0 || idx >= BANS_PER_TEAM) idx = s.bans[side].findIndex((n) => !n);
      if (idx < 0 || idx >= BANS_PER_TEAM) return { ok: false, error: "Bans pleins." };
      s.bans[side][idx] = name;
    } else {
      const list = sidePicks(s, side).filter((p) => p.name !== name);
      if (list.length >= 5) return { ok: false, error: "Picks pleins." };
      const by = pickBySlot(s, side);
      if (hintSlot && !by[hintSlot]) {
        assignPickDirect(s, side, name, hintSlot, { pinned: true });
      } else {
        s.picks[side] = list.concat([{ name, slot: SLOTS[0], order: nextPickOrder(s, side) }]);
        relayoutAll(s, ctx);
      }
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
      if (banIndex == null || banIndex < 0 || banIndex >= BANS_PER_TEAM) {
        return { ok: false, error: "Case ban invalide." };
      }
      if (!s.bans[side][banIndex]) return { ok: false, error: "Case déjà vide." };
    } else if (type === "pick") {
      if (!slot || !pickBySlot(s, side)[slot]) return { ok: false, error: "Poste déjà vide." };
    } else {
      return { ok: false, error: "Type invalide." };
    }
    const removed =
      type === "ban" ? s.bans[side][banIndex] : pickBySlot(s, side)[slot];
    const result = manualAssign(s, { type, side, name: null, slot, banIndex }, all, ctx);
    if (result.ok) {
      result.cleared = removed;
      result.inOrder = false;
    }
    return result;
  }

  function recordAction(s, action, all = [], ctx = {}) {
    const step = getStep(s);
    const inOrder = step && step.type === action.type && step.side === action.side && !action.forceManual;
    if (inOrder) {
      const banIndex = action.type === "ban" ? (action.banIndex ?? step.banIndex) : action.banIndex;
      const result = applyAction(s, { championName: action.name, slot: action.slot, banIndex }, all, ctx);
      if (result.ok && action.type === "pick") {
        result.slot = s.picks[action.side]?.find((p) => p.name === action.name)?.slot;
      }
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
      const slot = preferredBlindSlot(s, step.side);
      s.focus = { type: "pick", side: step.side, slot: slot || null };
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
      if (f.slot) {
        const label = SLOT_LABELS[f.slot] || f.slot;
        return `Pick ${fr} · ${label} → champion (clic ou glisser)`;
      }
      const hint = getDraftCoachHint(s, f.side, byName, meta);
      return hint ? `Pick ${fr} → champion · ${hint}` : `Pick ${fr} → champion (poste auto)`;
    }
    const step = getStep(s);
    if (!step || isComplete(s)) return null;
    if (step.type === "pick") {
      const hint = getDraftCoachHint(s, step.side, byName, meta);
      return hint ? `Pick → champion · ${hint}` : "Pick → champion";
    }
    return "Ban → champion";
  }

  function getRecommendations(s, champs, meta, byName, all = [], limit = 8, forSide = null) {
    const step = getStep(s);
    if (!step || isComplete(s)) return { type: "none", items: [], forSide: null };
    const avail = available(champs, s, all);
    const side = forSide || step.side;
    const cacheKey = recommendationCacheKey(s, side, all, step);

    if (recommendationCache?.key === cacheKey && recommendationCache.limit >= limit) {
      const cached = recommendationCache.result;
      return {
        ...cached,
        items: cached.items.slice(0, limit),
      };
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
    })
      .filter((item) => item.score > -1000)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

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

  function suggestSlot(s, side, meta, byName) {
    const open = openSlots(s, side);
    const preferred = preferredBlindSlot(s, side);
    if (preferred && open.includes(preferred)) return preferred;

    if (isBlindPickPhase(s, side)) {
      for (const sl of BLIND_PICK_SLOTS) {
        if (open.includes(sl)) return sl;
      }
    }

    const names = sidePicks(s, side).map((p) => p.name);
    const vs = teamVectors(names, byName, meta);
    const bal = compBalance(vs, open.length, false);
    if (bal.axes.front < 1 && open.includes("Top") && isLaneMatchupKnown(s, side, "Top")) return "Top";
    if (bal.axes.peel < 1 && open.includes("Support") && isLaneMatchupKnown(s, side, "Support")) {
      return "Support";
    }
    if (bal.axes.wave < 1 && open.includes("Mid")) return "Mid";
    return open[0] || "Top";
  }

  function resolvePickSlot(s, side, name, byName, meta, hint, obj) {
    const c = obj || getData(byName, meta, name);
    return scorePick(c, s, side, byName, meta, hint).slot;
  }

  function bestSlotForChampion(c, s, side, meta, hint) {
    return resolvePickSlot(s, side, c?.name, null, meta, hint, c);
  }

  function toComps(s) {
    const fill = (m) => {
      const o = {};
      for (const sl of SLOTS) o[sl] = m[sl] || "";
      return o;
    };
    return { ourComp: fill(pickBySlot(s, ourSide(s))), enemyComp: fill(pickBySlot(s, enemySide(s))) };
  }

  function analyzeLive(s, meta) {
    const our = sidePicks(s, ourSide(s)).map((p) => p.name);
    const en = sidePicks(s, enemySide(s)).map((p) => p.name);
    const w = phaseWeights(draftDepth(s));
    const ev = evaluateTeam(our, { metaMap: meta, oppNames: en, w, slotsLeft: 5 - our.length });
    const notes = [];

    if (ev.breakdown.h2h > 25) notes.push("Avantage net vs adversaire");
    else if (ev.breakdown.h2h < -15) notes.push("Comp adverse favorisée");
    if (ev.breakdown.synergy >= 90) notes.push("Synergie sorts + paires forte");
    else if (our.length >= 3 && ev.breakdown.synergy < 35) notes.push("Synergie insuffisante");

    const plan = detectCompPlan(ev.vs || []);
    if (plan.label) {
      notes.push(`Plan : ${plan.label} (${plan.completeness}%)`);
      if (plan.carry) notes.push(`Carry : ${plan.carry}`);
    } else if (ev.family?.dominant) {
      const labels = {
        poke_siege: "Poke / Siege",
        poke_disengage: "Poke + Disengage",
        teamfight_engage: "Teamfight engage",
        split_push: "Split push",
        hypercarry: "Hypercarry",
        all_in: "All-in",
        lane_tempo: "Lane tempo",
        pick_global: "Pick / Global",
      };
      notes.push(`Plan détecté : ${labels[ev.family.dominant] || ev.family.dominant}`);
    }
    for (const c of (ev.family?.conflicts || []).slice(0, 2)) notes.push(`⚠ ${c}`);

    const ax = ev.axes || {};
    if (ax.engage > 1.8 && ax.disengage < 0.5) notes.push("Trop engage — manque disengage");
    if (ax.burst > 2 && ax.tank < 0.8) notes.push("Burst sans front — fragile");
    if (ax.scaling > 1.5 && ax.early < 0.5) notes.push("Full scale — manque tempo early");
    for (const g of ev.gaps.slice(0, 2)) notes.push(`Manque ${g.k}`);

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
      const teamBanNum = (st.banIndex ?? 0) + 1;
      const globalBan = s.stepIndex + 1;
      return `Ban ${phase} · ${teamBanNum}/5 (${side}) — ${globalBan}/${banSteps.length}`;
    }
    const pickNum = s.stepIndex - banSteps.length + 1;
    return `Pick ${pickNum}/${pickSteps.length} — ${side}`;
  }

  function formatSummary(s) {
    normalizeSession(s);
    return [`5 bans · 2 phases · Ranked SR`, s.fearless ? "Fearless" : null].filter(Boolean).join(" · ");
  }

  function assignmentFromComp(comp) {
    return SLOTS.filter((sl) => comp[sl]).map((slot) => ({ name: comp[slot], slot }));
  }

  function namesFromComp(comp) {
    return SLOTS.map((sl) => comp[sl]).filter(Boolean);
  }

  /** Win % aligné sur les scores affichés (ratio) ; logistic sur marge si totaux ≤ 0. */
  function winProbFromScores(ourTotal, enemyTotal) {
    if (!Number.isFinite(ourTotal) || !Number.isFinite(enemyTotal)) {
      return { our: 0.5, enemy: 0.5 };
    }
    const sum = ourTotal + enemyTotal;
    if (sum > 0) {
      const our = ourTotal / sum;
      return { our, enemy: 1 - our };
    }
    const margin = ourTotal - enemyTotal;
    if (margin === 0) return { our: 0.5, enemy: 0.5 };
    const scale = 42;
    const raw = 1 / (1 + Math.exp(-margin / scale));
    const our = Math.min(0.93, Math.max(0.07, raw));
    return { our, enemy: 1 - our };
  }

  /** Compare deux comps complètes — score draft + probabilité de victoire. */
  function compareComps(ourComp, enemyComp, byName, metaMap) {
    const ourNames = namesFromComp(ourComp);
    const enemyNames = namesFromComp(enemyComp);
    if (ourNames.length < 5 || enemyNames.length < 5) {
      return { complete: false, ourCount: ourNames.length, enemyCount: enemyNames.length };
    }

    const w = phaseWeights(1);
    const ourAssign = assignmentFromComp(ourComp);
    const enemyAssign = assignmentFromComp(enemyComp);

    const ourEval = evaluateTeam(ourNames, {
      byName,
      metaMap,
      oppNames: enemyNames,
      oppComp: enemyComp,
      assignment: ourAssign,
      slotsLeft: 0,
      w,
    });

    const enemyEval = evaluateTeam(enemyNames, {
      byName,
      metaMap,
      oppNames: ourNames,
      oppComp: ourComp,
      assignment: enemyAssign,
      slotsLeft: 0,
      w,
    });

    const margin = ourEval.total - enemyEval.total;
    const winProb = winProbFromScores(ourEval.total, enemyEval.total);

    return {
      complete: true,
      our: {
        score: Math.round(ourEval.total),
        breakdown: ourEval.breakdown,
      },
      enemy: {
        score: Math.round(enemyEval.total),
        breakdown: enemyEval.breakdown,
      },
      margin: Math.round(margin),
      winProb,
    };
  }

  global.LoLDraft = {
    SLOTS,
    BANS_PER_TEAM,
    BAN_PHASE1_COUNT,
    BAN_PHASE2_COUNT,
    PICK_STEPS,
    PICK_SLOT_PRIORITY,
    BLIND_PICK_SLOTS,
    MIN_LANE_PLAY_RATE,
    playableSlotsFor,
    lanePlayRate,
    playsSlotFor,
    LATE_MATCHUP_SLOTS,
    SLOT_LABELS,
    buildDraftSteps,
    normalizeSession,
    createSession,
    getSteps,
    totalSteps,
    getStep,
    isComplete,
    fearlessUsedNames: fearlessUsed,
    takenNames: taken,
    availableChampions: available,
    sidePicks,
    pickBySlot,
    pickAtSlot,
    nextPickOrder,
    ourSide,
    enemySide,
    isOurTurn,
    canEditFormat,
    suggestSlot,
    bestSlotForChampion,
    resolvePickSlot,
    relayoutAllPickSlots: relayoutAll,
    optimizeTeamLayout: optimizeLayout,
    getRecommendations,
    invalidateRecommendationCache,
    isBlueFirstPick,
    isTeamFirstPick,
    nextBlindSlot,
    allowedSlotsForNextPick,
    layoutAllowedSlots,
    recommendedSlotForPick,
    preferredBlindSlot,
    isBlindPickPhase,
    isLaneMatchupKnown,
    getDraftCoachHint,
    applyAction,
    recordAction,
    manualAssign,
    clearSlot,
    actionLabel,
    suggestNextFocus,
    syncLegacySlots,
    resyncStepIndex,
    undo,
    resetSession,
    swapPickSlots,
    toComps,
    analyzeLive,
    stepLabel,
    formatSummary,
    scorePick: (c, s, side, slot, meta, byName) => scorePick(c, s, side, byName, meta, slot),
    scoreBan,
    evaluateTeam,
    measureTeam: teamVectors,
    buildVector,
    phaseWeights,
    detectCompPlan,
    compareComps,
    teamColorSummary,
    colorCoherence,
    COLOR_LABELS,
    COLOR_HEX,
    MTG_COLORS,
  };
})(typeof window !== "undefined" ? window : globalThis);
