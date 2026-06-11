/**
 * Configuration du patch actuel — pool, tiers et rôles (localStorage).
 */
(function (global) {
  const STORAGE_KEY = "lol-patch-config-v2";
  const DEFAULTS_STORAGE_KEY = "lol_coach_patch_defaults";
  const SITE_DEFAULTS_URL = "data/patch-defaults.json";
  const ADMIN_PASSWORD = "24372";
  const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const TIERS = ["S", "A", "B", "C", "D"];

  let siteDefaults = null;
  let siteDefaultsReady = null;

  function defaultEntry(champ) {
    return {
      enabled: true,
      tierMeta: champ.tierMeta || "C",
      optimalSlots: [...(champ.optimalSlots || [])],
    };
  }

  function createDefaultConfig(champions, label = "Patch actuel") {
    const overrides = {};
    for (const c of champions) overrides[c.name] = defaultEntry(c);
    return { version: 1, label, updatedAt: Date.now(), overrides };
  }

  function mergeWithBase(config, champions) {
    const overrides = { ...(config?.overrides || {}) };
    for (const c of champions) {
      const prev = overrides[c.name];
      if (!prev) {
        overrides[c.name] = defaultEntry(c);
        continue;
      }
      const slots = Array.isArray(prev.optimalSlots) ? prev.optimalSlots.filter((s) => SLOTS.includes(s)) : [];
      overrides[c.name] = {
        enabled: prev.enabled !== false,
        tierMeta: TIERS.includes(prev.tierMeta) ? prev.tierMeta : c.tierMeta || "C",
        optimalSlots: slots.length ? slots : [...(c.optimalSlots || [])],
      };
    }
    for (const name of Object.keys(overrides)) {
      if (!champions.some((c) => c.name === name)) delete overrides[name];
    }
    return {
      version: 1,
      label: config?.label || "Patch actuel",
      updatedAt: config?.updatedAt || Date.now(),
      overrides,
    };
  }

  function resolveDefaultConfig(champions) {
    if (siteDefaults) return mergeWithBase(siteDefaults, champions);
    return createDefaultConfig(champions);
  }

  function readLocalSiteDefaults() {
    try {
      const raw = localStorage.getItem(DEFAULTS_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  async function fetchSiteDefaults() {
    if (siteDefaultsReady) return siteDefaultsReady;
    siteDefaultsReady = (async () => {
      try {
        const res = await fetch(SITE_DEFAULTS_URL);
        if (res.ok) {
          const parsed = await res.json();
          if (parsed && typeof parsed === "object") siteDefaults = parsed;
        }
      } catch {
        /* fichier absent ou réseau indisponible */
      }
      if (!siteDefaults) siteDefaults = readLocalSiteDefaults();
      return siteDefaults;
    })();
    return siteDefaultsReady;
  }

  function load(champions) {
    try {
      if (global.LoLUserSession) {
        const fromSession = global.LoLUserSession.getPatch();
        if (fromSession) return mergeWithBase(fromSession, champions);
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return resolveDefaultConfig(champions);
      return mergeWithBase(JSON.parse(raw), champions);
    } catch {
      return resolveDefaultConfig(champions);
    }
  }

  function save(config) {
    config.updatedAt = Date.now();
    if (global.LoLUserSession) {
      global.LoLUserSession.setPatch(config);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  function applyToChampion(base, entry) {
    const slots = entry?.optimalSlots?.length ? entry.optimalSlots : base.optimalSlots || [];
    const positions =
      slots.length > 0
        ? `Toutes · ${slots.length === 1 ? "optimal : " : "jouable : "}${slots.join(", ")}`
        : base.positions;
    return {
      ...base,
      tierMeta: entry?.tierMeta || base.tierMeta,
      optimalSlots: [...slots],
      positions,
      patchEnabled: entry?.enabled !== false,
    };
  }

  function getPlayable(baseChampions, config) {
    return baseChampions
      .filter((c) => config.overrides[c.name]?.enabled !== false)
      .map((c) => applyToChampion(c, config.overrides[c.name]))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }

  function getAllWithPatch(baseChampions, config) {
    return baseChampions
      .map((c) => applyToChampion(c, config.overrides[c.name]))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }

  function countEnabled(config) {
    return Object.values(config.overrides).filter((o) => o.enabled !== false).length;
  }

  function setEntry(config, name, patch) {
    const prev = config.overrides[name] || { enabled: true, tierMeta: "C", optimalSlots: [] };
    config.overrides[name] = {
      enabled: patch.enabled ?? prev.enabled,
      tierMeta: patch.tierMeta ?? prev.tierMeta,
      optimalSlots: patch.optimalSlots ?? prev.optimalSlots,
    };
    return config;
  }

  function setAllEnabled(config, enabled) {
    for (const name of Object.keys(config.overrides)) {
      config.overrides[name].enabled = enabled;
    }
    return config;
  }

  function resetToDefaults(champions) {
    return resolveDefaultConfig(champions);
  }

  function pushAsSiteDefaults(config, champions) {
    const snapshot = mergeWithBase(JSON.parse(JSON.stringify(config)), champions);
    snapshot.updatedAt = Date.now();
    siteDefaults = snapshot;
    try {
      localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      /* quota ou mode privé */
    }
    return snapshot;
  }

  function downloadSiteDefaults(config) {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "patch-defaults.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function verifyAdminPassword(input) {
    return String(input || "") === ADMIN_PASSWORD;
  }

  global.LoLPatch = {
    STORAGE_KEY,
    DEFAULTS_STORAGE_KEY,
    SITE_DEFAULTS_URL,
    SLOTS,
    TIERS,
    load,
    save,
    fetchSiteDefaults,
    pushAsSiteDefaults,
    downloadSiteDefaults,
    verifyAdminPassword,
    createDefaultConfig,
    mergeWithBase,
    applyToChampion,
    getPlayable,
    getAllWithPatch,
    countEnabled,
    setEntry,
    setAllEnabled,
    resetToDefaults,
  };
})(typeof window !== "undefined" ? window : globalThis);
