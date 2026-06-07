/**
 * Session utilisateur locale — une session individuelle par navigateur (cache localStorage).
 */
(function (global) {
  const CLIENT_ID_KEY = "lol-coach-client-id";
  const SESSION_KEY = "lol-coach-user-session-v1";
  const LEGACY_PATCH_KEY = "lol-patch-config-v2";
  const LEGACY_DRAFT_KEY = "lol-draft-sessions-v1";
  const SESSION_VERSION = 1;

  function createClientId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `lc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function getClientId() {
    try {
      let id = localStorage.getItem(CLIENT_ID_KEY);
      if (!id) {
        id = createClientId();
        localStorage.setItem(CLIENT_ID_KEY, id);
      }
      return id;
    } catch {
      return "offline";
    }
  }

  function defaultUi() {
    return {
      slotFilter: "all",
      typeFilter: "all",
      tierFilter: "all",
      colorFilter: "all",
      familyFilter: "all",
      compFilter: "all",
      search: "",
      itemTierFilter: "all",
      patchSearch: "",
      patchPoolFilter: "all",
      draftPoolSearch: "",
      draftPoolTier: "all",
      tacticsPoolSearch: "",
    };
  }

  function defaultTactics() {
    return {
      ourComp: { Top: "", Jungle: "", Mid: "", Bot: "", Support: "" },
      enemyComp: { Top: "", Jungle: "", Mid: "", Bot: "", Support: "" },
    };
  }

  function defaultDraft() {
    return { sessions: [], activeId: null };
  }

  function createEmptySession() {
    const now = Date.now();
    return {
      version: SESSION_VERSION,
      clientId: getClientId(),
      createdAt: now,
      updatedAt: now,
      patch: null,
      draft: defaultDraft(),
      ui: defaultUi(),
      tactics: defaultTactics(),
    };
  }

  function readRawSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function migrateLegacy(session) {
    let changed = false;

    if (!session.patch) {
      try {
        const rawPatch = localStorage.getItem(LEGACY_PATCH_KEY);
        if (rawPatch) {
          session.patch = JSON.parse(rawPatch);
          changed = true;
        }
      } catch {
        /* ignore */
      }
    }

    const draftEmpty = !session.draft?.sessions?.length;
    if (draftEmpty) {
      try {
        const rawDraft = localStorage.getItem(LEGACY_DRAFT_KEY);
        if (rawDraft) {
          const parsed = JSON.parse(rawDraft);
          session.draft = {
            sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
            activeId: parsed.activeId || null,
          };
          changed = true;
        }
      } catch {
        /* ignore */
      }
    }

    if (changed) {
      try {
        localStorage.removeItem(LEGACY_PATCH_KEY);
        localStorage.removeItem(LEGACY_DRAFT_KEY);
      } catch {
        /* ignore */
      }
    }

    return session;
  }

  function normalizeSession(raw) {
    const base = createEmptySession();
    const session = {
      ...base,
      ...raw,
      clientId: getClientId(),
      ui: { ...base.ui, ...(raw?.ui || {}) },
      tactics: {
        ourComp: { ...base.tactics.ourComp, ...(raw?.tactics?.ourComp || {}) },
        enemyComp: { ...base.tactics.enemyComp, ...(raw?.tactics?.enemyComp || {}) },
      },
      draft: {
        sessions: Array.isArray(raw?.draft?.sessions) ? raw.draft.sessions : [],
        activeId: raw?.draft?.activeId || null,
      },
      patch: raw?.patch || null,
    };
    return migrateLegacy(session);
  }

  function load() {
    const raw = readRawSession();
    if (!raw) return migrateLegacy(createEmptySession());
    return normalizeSession(raw);
  }

  function save(session) {
    const payload = {
      ...session,
      version: SESSION_VERSION,
      clientId: getClientId(),
      updatedAt: Date.now(),
      createdAt: session.createdAt || Date.now(),
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
      return payload;
    } catch (err) {
      console.warn("Impossible d'enregistrer la session utilisateur", err);
      return payload;
    }
  }

  function getPatch() {
    return load().patch;
  }

  function setPatch(patchConfig) {
    const session = load();
    session.patch = patchConfig;
    return save(session);
  }

  function getDraft() {
    return load().draft || defaultDraft();
  }

  function setDraft(draft) {
    const session = load();
    session.draft = {
      sessions: Array.isArray(draft?.sessions) ? draft.sessions : [],
      activeId: draft?.activeId || null,
    };
    return save(session);
  }

  function getUi() {
    return load().ui || defaultUi();
  }

  function setUi(ui) {
    const session = load();
    session.ui = { ...defaultUi(), ...session.ui, ...ui };
    return save(session);
  }

  function getTactics() {
    return load().tactics || defaultTactics();
  }

  function setTactics(tactics) {
    const session = load();
    session.tactics = {
      ourComp: { ...defaultTactics().ourComp, ...(tactics?.ourComp || {}) },
      enemyComp: { ...defaultTactics().enemyComp, ...(tactics?.enemyComp || {}) },
    };
    return save(session);
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_PATCH_KEY);
      localStorage.removeItem(LEGACY_DRAFT_KEY);
    } catch {
      /* ignore */
    }
    return createEmptySession();
  }

  global.LoLUserSession = {
    CLIENT_ID_KEY,
    SESSION_KEY,
    getClientId,
    load,
    save,
    getPatch,
    setPatch,
    getDraft,
    setDraft,
    getUi,
    setUi,
    getTactics,
    setTactics,
    clearSession,
    defaultUi,
    defaultTactics,
    defaultDraft,
  };
})(typeof window !== "undefined" ? window : globalThis);
