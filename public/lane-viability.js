/**
 * Single source of truth — minimum 10% lane play rate to be viable at a role.
 * When laneRates exist, ONLY slots >= MIN_LANE_RATE count (no flexRoles/optimalSlots override).
 */
(function (global) {
  const MIN_LANE_RATE = 10;
  const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];

  function resolveChamp(champ, metaMap) {
    if (!champ) return { champ: null, meta: {} };
    if (typeof champ === "string") {
      const meta = metaMap?.[champ] || {};
      return { champ: { name: champ, ...meta }, meta };
    }
    const meta = metaMap?.[champ.name] || {};
    return { champ, meta };
  }

  function getRates(champ, metaMap) {
    const { champ: c, meta } = resolveChamp(champ, metaMap);
    return c?.laneRates || meta?.laneRates || null;
  }

  function hasRateData(champ, metaMap) {
    const rates = getRates(champ, metaMap);
    return !!(rates && Object.keys(rates).length);
  }

  /** Play rate for slot, or null if unknown. */
  function slotRate(champ, metaMap, slot) {
    const rates = getRates(champ, metaMap);
    if (!rates || rates[slot]?.rate == null) return null;
    return Number(rates[slot].rate) || 0;
  }

  function playsSlot(champ, metaMap, slot) {
    if (!slot) return false;
    const r = slotRate(champ, metaMap, slot);
    if (r != null) return r >= MIN_LANE_RATE;
    if (hasRateData(champ, metaMap)) return false;
    return playableSlots(champ, metaMap).includes(slot);
  }

  function playableSlots(champ, metaMap) {
    const { champ: c, meta } = resolveChamp(champ, metaMap);
    const rates = c?.laneRates || meta?.laneRates;

    if (rates && Object.keys(rates).length) {
      return SLOTS.filter((sl) => (Number(rates[sl]?.rate) || 0) >= MIN_LANE_RATE);
    }

    const out = new Set();
    for (const sl of c?.optimalSlots || meta?.optimalSlots || []) out.add(sl);
    const main = c?.mainRole || meta?.mainRole;
    if (main) out.add(main);
    for (const r of c?.flexRoles || meta?.flexRoles || []) out.add(r);
    return SLOTS.filter((sl) => out.has(sl));
  }

  function primarySlot(champ, metaMap) {
    const playable = playableSlots(champ, metaMap);
    if (!playable.length) return null;

    const { champ: c, meta } = resolveChamp(champ, metaMap);
    const main = c?.mainRole || meta?.mainRole;
    if (main && playable.includes(main)) return main;

    const rates = getRates(champ, metaMap);
    if (rates) {
      let best = null;
      let bestR = -1;
      for (const sl of playable) {
        const r = Number(rates[sl]?.rate) || 0;
        if (r > bestR) {
          bestR = r;
          best = sl;
        }
      }
      if (best) return best;
    }

    return playable[0];
  }

  function laneScore(champ, metaMap, slot) {
    const r = slotRate(champ, metaMap, slot);
    if (r != null) return r;
    return playsSlot(champ, metaMap, slot) ? MIN_LANE_RATE : 0;
  }

  /** Best open slot for a champion (draft layout / inference). */
  function bestOpenSlot(champ, metaMap, openSlots, preferOrder = SLOTS) {
    const playable = new Set(playableSlots(champ, metaMap));
    const primary = primarySlot(champ, metaMap);
    if (primary && openSlots.includes(primary) && playable.has(primary)) return primary;
    for (const sl of preferOrder) {
      if (openSlots.includes(sl) && playable.has(sl)) return sl;
    }
    return openSlots.find((sl) => playable.has(sl)) || null;
  }

  function filterSlots(champ, metaMap, slots) {
    return (slots || []).filter((sl) => playsSlot(champ, metaMap, sl));
  }

  global.LoLLaneViability = {
    MIN_LANE_RATE,
    SLOTS,
    slotRate,
    playsSlot,
    playableSlots,
    primarySlot,
    laneScore,
    bestOpenSlot,
    filterSlots,
    hasRateData,
    getRates,
  };
})(typeof window !== "undefined" ? window : globalThis);
