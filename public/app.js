const state = {
  baseChampions: [],
  champions: [],
  byName: new Map(),
  patchConfig: null,
  patchSearch: "",
  patchPoolFilter: "all",
  items: [],
  byItemName: new Map(),
  view: "champions",
  selectedId: null,
  championPageId: null,
  mtgGuideReturnView: null,
  slotFilter: "all",
  typeFilter: "all",
  tierFilter: "all",
  colorFilter: "all",
  familyFilter: "all",
  compFilter: "all",
  search: "",
  tacticsMeta: null,
  mtgMeta: null,
  fullChampionsReady: false,
  draftSessions: [],
  activeDraftId: null,
  draftPoolSearch: "",
  draftPoolTier: "all",
  draftPoolRole: "all",
  tacticsFocus: null,
  tacticsPoolSearch: "",
  tacticsPoolRole: "all",
  ourComp: { Top: "", Jungle: "", Mid: "", Bot: "", Support: "" },
  enemyComp: { Top: "", Jungle: "", Mid: "", Bot: "", Support: "" },
};

let userSessionSaveTimer = null;

function applyUserSessionToState() {
  if (!window.LoLUserSession) return;
  const ui = window.LoLUserSession.getUi();
  state.slotFilter = ui.slotFilter ?? state.slotFilter;
  state.typeFilter = ui.typeFilter ?? state.typeFilter;
  state.tierFilter = ui.tierFilter ?? state.tierFilter;
  state.colorFilter = ui.colorFilter ?? state.colorFilter;
  state.familyFilter = ui.familyFilter ?? state.familyFilter;
  state.compFilter = ui.compFilter ?? state.compFilter;
  state.search = ui.search ?? state.search;
  state.patchSearch = ui.patchSearch ?? state.patchSearch;
  state.patchPoolFilter = ui.patchPoolFilter ?? state.patchPoolFilter;
  state.draftPoolSearch = ui.draftPoolSearch ?? state.draftPoolSearch;
  state.draftPoolTier = ui.draftPoolTier ?? state.draftPoolTier;
  state.draftPoolRole = ui.draftPoolRole ?? state.draftPoolRole;
  state.tacticsPoolSearch = ui.tacticsPoolSearch ?? state.tacticsPoolSearch;
  state.tacticsPoolRole = ui.tacticsPoolRole ?? state.tacticsPoolRole;

  const tactics = window.LoLUserSession.getTactics();
  if (tactics?.ourComp) Object.assign(state.ourComp, tactics.ourComp);
  if (tactics?.enemyComp) Object.assign(state.enemyComp, tactics.enemyComp);

  const draft = window.LoLUserSession.getDraft();
  if (draft?.sessions?.length) {
    state.draftSessions = draft.sessions.map((s) => window.LoLDraft?.normalizeSession?.(s) || s);
    state.activeDraftId = draft.activeId || state.draftSessions[0]?.id || null;
  }
}

function collectUserSessionSnapshot() {
  return {
    patch: state.patchConfig,
    draft: { sessions: state.draftSessions, activeId: state.activeDraftId },
    ui: {
      slotFilter: state.slotFilter,
      typeFilter: state.typeFilter,
      tierFilter: state.tierFilter,
      colorFilter: state.colorFilter,
      familyFilter: state.familyFilter,
      compFilter: state.compFilter,
      search: state.search,
      patchSearch: state.patchSearch,
      patchPoolFilter: state.patchPoolFilter,
      draftPoolSearch: state.draftPoolSearch,
      draftPoolTier: state.draftPoolTier,
      draftPoolRole: state.draftPoolRole,
      tacticsPoolSearch: state.tacticsPoolSearch,
      tacticsPoolRole: state.tacticsPoolRole,
    },
    tactics: {
      ourComp: { ...state.ourComp },
      enemyComp: { ...state.enemyComp },
    },
  };
}

function persistUserSession() {
  if (!window.LoLUserSession) return;
  const current = window.LoLUserSession.load();
  window.LoLUserSession.save({
    ...current,
    ...collectUserSessionSnapshot(),
  });
}

function scheduleUserSessionSave() {
  if (!window.LoLUserSession) return;
  clearTimeout(userSessionSaveTimer);
  userSessionSaveTimer = setTimeout(persistUserSession, 350);
}

function syncUiControlsFromSession() {
  if (els.search) els.search.value = state.search;
  syncFilterChips(els.slotFilters, "slot", state.slotFilter);
  syncFilterChips(els.typeFilters, "type", state.typeFilter);
  syncFilterChips(els.tierFilters, "tier", state.tierFilter);
  syncFilterChips(els.familyFilters, "family", state.familyFilter);
  syncFilterChips(els.compFilters, "comp", state.compFilter);
  syncMobileSelect("slotFilter");
  syncMobileSelect("typeFilter");
  syncMobileSelect("tierFilter");
  syncMobileSelect("familyFilter");
  syncMobileSelect("compFilter");
  syncMobileSelect("colorFilter");
  els.colorFilters?.querySelectorAll(".mtg-dot-btn").forEach((c) => {
    c.classList.toggle("is-active", c.dataset.color === state.colorFilter);
  });
}

const els = {
  grid: document.getElementById("grid"),
  empty: document.getElementById("empty"),
  countLabel: document.getElementById("count-label"),
  galleryCountLabel: document.getElementById("gallery-count-label"),
  search: document.getElementById("search"),
  headerSearchWrap: document.getElementById("header-search-wrap"),
  detail: document.getElementById("detail"),
  detailContent: document.getElementById("detail-content"),
  overlay: document.getElementById("overlay"),
  closeDetail: document.getElementById("close-detail"),
  slotFilters: document.getElementById("slot-filters"),
  typeFilters: document.getElementById("type-filters"),
  tierFilters: document.getElementById("tier-filters"),
  colorFilters: document.getElementById("color-filters"),
  familyFilters: document.getElementById("family-filters"),
  compFilters: document.getElementById("comp-filters"),
  familyStats: document.getElementById("family-stats"),
  championsHero: document.getElementById("champions-hero"),
  championsHeroMain: document.getElementById("champions-hero-main"),
  mtgCompass: document.getElementById("mtg-compass"),
  viewChampions: document.getElementById("view-champions"),
  viewChampionPage: document.getElementById("view-champion-page"),
  championPageContent: document.getElementById("champion-page-content"),
  viewMtgColors: document.getElementById("view-mtg-colors"),
  mtgColorsGuideContent: document.getElementById("mtg-colors-guide-content"),
  viewDraft: document.getElementById("view-draft"),
  viewTactics: document.getElementById("view-tactics"),
  viewPatch: document.getElementById("view-patch"),
  sidebarChampions: document.getElementById("sidebar-champions"),
  sidebarPatch: document.getElementById("sidebar-patch"),
  patchTableBody: document.getElementById("patch-table-body"),
  patchEmpty: document.getElementById("patch-empty"),
  patchSearch: document.getElementById("patch-search"),
  patchNameInput: document.getElementById("patch-name-input"),
  patchStatCount: document.getElementById("patch-stat-count"),
  patchSaveStatus: document.getElementById("patch-save-status"),
  patchPoolFilters: document.getElementById("patch-pool-filters"),
  patchEnableAll: document.getElementById("patch-enable-all"),
  patchDisableAll: document.getElementById("patch-disable-all"),
  patchResetDefaults: document.getElementById("patch-reset-defaults"),
  sidebarDraft: document.getElementById("sidebar-draft"),
  sidebarTactics: document.getElementById("sidebar-tactics"),
  ourSlots: document.getElementById("our-slots"),
  enemySlots: document.getElementById("enemy-slots"),
  tacticsPool: document.getElementById("tactics-pool"),
  tacticsFocusHint: document.getElementById("tactics-focus-hint"),
  tacticsResult: document.getElementById("tactics-result"),
  tacticsCompScore: document.getElementById("tactics-comp-score"),
  tacticsCoachNotes: document.getElementById("tactics-coach-notes"),
  tacticsCoachNotesMain: document.getElementById("tactics-coach-notes-main"),
  analyzeTactics: document.getElementById("analyze-tactics"),
  clearTactics: document.getElementById("clear-tactics"),
  importDraftTactics: document.getElementById("import-draft-tactics"),
  filterToggle: document.getElementById("filter-toggle"),
  sidebarBackdrop: document.getElementById("sidebar-backdrop"),
  sidebarClose: document.getElementById("sidebar-close"),
  tabBarItems: document.querySelectorAll(".tab-bar-item"),
  navTabs: document.querySelectorAll(".nav-tab"),
};

const CHAMP_NAMES_SORTED = [];
const ITEM_NAMES_SORTED = [];

const TIER_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4 };

const FAMILY_PALETTE = {
  tank_engage: "#5b9cf5",
  tank_disengage: "#4caf82",
  bruiser_teamfight: "#e05d5d",
  bruiser_split: "#f0a030",
  mage_control: "#7eb3ff",
  mage_dps: "#b06cf0",
  assassin_ad_pick: "#ff6b6b",
  assassin_ap_pick: "#c084fc",
  adc_hypercarry: "#ffd166",
  adc_poke: "#06d6a0",
  adc_tempo: "#118ab2",
  adc_short_allin: "#ef476f",
  support_enchanter: "#83c5be",
  support_engage: "#e63946",
  support_disengage: "#457b9d",
  global_pick: "#9b5de5",
  jungle_offensive: "#fb5607",
  jungle_defensive: "#3a86ff",
  default: "#8b97a8",
};

const MATCHUP_SOURCE_LABELS = {
  curated: "",
  family: "",
  profile: "",
};

function compactGamePlanLines(champ) {
  const fam = champ.championFamily;
  if (!fam) {
    const style = champGameplayStyle(champ);
    return style ? [{ phase: "Macro", text: style }] : [];
  }
  const lines = [];
  if (fam.macroEarly) lines.push({ phase: "Early", text: fam.macroEarly });
  if (fam.macroMid) lines.push({ phase: "Mid", text: fam.macroMid });
  if (fam.teamfightPlan) lines.push({ phase: "Teamfight", text: fam.teamfightPlan });
  return lines;
}

function renderDetailGamePlan(champ) {
  const comp = compTypeLabelsEn(champ);
  const lines = compactGamePlanLines(champ);
  return `
    ${comp.length ? `<p class="detail-comp-type">${comp.map((c) => escapeHtml(c)).join(" · ")}</p>` : ""}
    <div class="detail-macro-lines">
      ${lines
        .map(
          ({ phase, text }) =>
            `<p class="detail-macro-line"><strong>${phase}</strong> ${escapeHtml(text)}</p>`
        )
        .join("")}
    </div>`;
}

const CLASS_TYPE_EN = {
  Combattant: "Fighter",
  Tank: "Tank",
  Mage: "Mage",
  Assassin: "Assassin",
  Tireur: "Marksman",
  Support: "Support",
};

const COMP_TYPE_EN = {
  poke_siege: "Poke / Siege",
  poke_disengage: "Poke + Disengage",
  teamfight_engage: "Teamfight / Engage",
  split_push: "Split Push",
  hypercarry: "Hypercarry",
  lane_tempo: "Lane Tempo",
  all_in: "All-in / Catch",
  pick_global: "Pick / Global",
};

/** Libellés comp courts pour les cartes grille. */
const COMP_TYPE_SHORT = {
  poke_siege: "Poke siege",
  poke_disengage: "Poke/dis",
  teamfight_engage: "TF engage",
  split_push: "Split",
  hypercarry: "Hypercarry",
  lane_tempo: "Tempo",
  all_in: "All-in",
  pick_global: "Pick",
};

const LOL_TERM_REPLACEMENTS = [
  [/contre-engage/gi, "disengage"],
  [/tourelles?/gi, "tower"],
  [/objectifs?( majeurs)?/gi, "objective"],
  [/portée/gi, "range"],
  [/mobilité/gi, "mobility"],
  [/mêlée|mélée|corps à corps/gi, "melee"],
  [/à distance/gi, "ranged"],
  [/contrôle de foule/gi, "crowd control"],
  [/sbires/gi, "minions"],
  [/ultime/gi, "ult"],
  [/anti-soin/gi, "anti-heal"],
  [/cible fragile/gi, "squishy"],
  [/Freeze ou slow push/gi, "freeze or slow push"],
  [/slow push/gi, "slow push"],
  [/teamfight/gi, "teamfight"],
  [/backline/gi, "backline"],
  [/frontline/gi, "frontline"],
  [/split push/gi, "split push"],
  [/win condition/gi, "win condition"],
];

/** Normalise uniquement le vocabulaire LoL en anglais — le reste du texte reste tel quel (FR). */
function formatLolTerms(text = "") {
  if (!text) return "";
  let out = text;
  for (const [re, term] of LOL_TERM_REPLACEMENTS) out = out.replace(re, term);
  return out;
}

function classTypeEn(type = "") {
  return CLASS_TYPE_EN[type] || CLASS_TYPE_EN[getTypeCategory(type)] || type || "—";
}

function compTypeLabelsEn(champ) {
  const keys = champ.championFamily?.compTypes || [];
  return keys.map((k) => COMP_TYPE_EN[k] || k.replace(/_/g, " "));
}

const COMP_TYPE_COUNTERS = [
  ["poke_disengage", "teamfight_engage"],
  ["pick_global", "hypercarry"],
  ["all_in", "hypercarry"],
  ["lane_tempo", "hypercarry"],
  ["poke_siege", "teamfight_engage"],
];

const INCOMPATIBLE_COMP_PAIRS = [
  ["poke_disengage", "all_in"],
  ["poke_disengage", "teamfight_engage"],
  ["poke_siege", "all_in"],
  ["hypercarry", "lane_tempo"],
  ["split_push", "teamfight_engage"],
];

const TAG_STRENGTH_LABELS = {
  high_damage: "Gros dégâts en teamfight",
  frontline: "Frontline fiable",
  peel: "Peel pour les carries",
  mobility: "Forte mobilité",
  wave_clear: "Bon wave clear",
  cc: "Outils de crowd control",
  engage: "Engage pour les picks",
  disengage: "Options de disengage",
  aoe: "Dégâts AoE en teamfight",
  dive: "Menace de dive sur backline",
  poke: "Pression poke en sécurité",
  split: "Pression split push",
  global: "Pression globale sur la map",
  percent_hp: "Scale avec les PV ennemis",
  reset: "Reset après les kills",
  sustain: "Fort sustain",
  shield: "Shield pour les alliés",
  knockup: "Knockup pour combos",
  fighter: "Trades prolongés solides",
  tank: "Absorbe bien les dégâts",
  assassin: "Potentiel de pick",
  marksman: "DPS constant",
  enchanter: "Buffs et protection",
};

const TAG_WEAKNESS_LABELS = {
  squishy: "Squishy — facile à focus",
  wants_cc_ally: "Besoin d'alliés pour le setup",
  melee: "Courte range (melee)",
  immobile: "Faible mobilité",
  skill_floor: "Demande de la mécanique",
};

function deriveChampionHighlights(champ) {
  const profile = champ.matchupProfile;
  const d = champ.draftProfile;
  const tags = [...(champ.tacticTags || []), ...(profile?.tags || [])];
  const strengths = [];
  const weaknesses = [];

  if (profile) {
    if (profile.damage >= 7) strengths.push("Gros dégâts");
    else if (profile.damage <= 4) weaknesses.push("Menace de dégâts limitée");
    if (profile.tankiness >= 7) strengths.push("Très tanky");
    else if (profile.tankiness <= 4) weaknesses.push("Faible survie");
    if (profile.utility >= 7) strengths.push("Forte utilité d'équipe");
    else if (profile.utility <= 4) weaknesses.push("Faible utilité d'équipe");
    if (profile.difficulty >= 8) weaknesses.push("Plafond mécanique élevé");
  }

  for (const tag of tags) {
    const label = TAG_STRENGTH_LABELS[tag];
    if (label && strengths.length < 5 && !strengths.includes(label)) strengths.push(label);
  }

  if (d?.squishy) weaknesses.push(TAG_WEAKNESS_LABELS.squishy);
  if (tags.includes("wants_cc_ally")) weaknesses.push(TAG_WEAKNESS_LABELS.wants_cc_ally);
  if (tags.includes("melee") && !tags.includes("mobility") && !tags.includes("dash")) {
    weaknesses.push("Vulnérable au kiting");
  }

  const topCounter = getMatchupList(champ, "bestCounters")[0];
  if (topCounter?.reason) {
    const theme = formatLolTerms(topCounter.reason).split("·")[0].trim();
    if (theme && weaknesses.length < 5) weaknesses.push(theme);
  }

  return {
    strengths: [...new Set(strengths)].slice(0, 4),
    weaknesses: [...new Set(weaknesses)].slice(0, 4),
  };
}

function deriveChampionDraftVerdict(champ) {
  const fam = champ.championFamily;
  const famKey = fam?.key;
  const compTypes = fam?.compTypes || [];
  const compGuide = state.tacticsMeta?.compGuide?.compTypes || {};
  const tags = champ.tacticTags || champ.matchupProfile?.tags || [];
  const draftWhen = [];
  const avoidWhen = [];

  if (famKey === "mage_dps") {
    draftWhen.push("Comp all-in / engage avec hard CC");
    draftWhen.push("Alliés qui lock un carry avant ton burst");
    draftWhen.push("Tank ou support engage qui setup ton combo");
    avoidWhen.push("Poke + disengage — pas d'accès all-in");
    avoidWhen.push("Pas de setup engage — tu n'atteins pas les carries seul");
    avoidWhen.push("Comps zone control qui reset avant ton burst");
    return {
      draftWhen: [...new Set(draftWhen)].slice(0, 4),
      avoidWhen: [...new Set(avoidWhen)].slice(0, 4),
    };
  }

  if (famKey === "mage_control") {
    draftWhen.push("Comp poke + disengage avec zone control");
    draftWhen.push("Backline safe pour DPS à range");
    draftWhen.push("Outils disengage pour reset les mauvais fights");
    avoidWhen.push("All-in hard sans peel pour toi");
    avoidWhen.push("Comps dive forcées — pas de place pour DPS safe");
    avoidWhen.push("Même équipe full all-in sans disengage");
    return {
      draftWhen: [...new Set(draftWhen)].slice(0, 4),
      avoidWhen: [...new Set(avoidWhen)].slice(0, 4),
    };
  }

  for (const ct of compTypes) {
    const label = COMP_TYPE_EN[ct] || compGuide[ct]?.label || ct.replace(/_/g, " ");
    draftWhen.push(`Construire vers ${label}`);
    const guide = compGuide[ct];
    if (guide?.needsFrontline && !tags.includes("frontline") && !tags.includes("tank")) {
      draftWhen.push("Il te manque encore une frontline ailleurs");
    }
    if (guide?.needsEnchanter) draftWhen.push("Pair avec un enchanter peel");
    if (guide?.needsDisengage) draftWhen.push("Garde des outils disengage dans l'équipe");
    if (guide?.needsSidePressure) draftWhen.push("L'équipe peut jouer split 1-3");
  }

  if (tags.includes("wants_cc_ally")) draftWhen.push("Des alliés apportent hard CC ou knockup");

  for (const ct of compTypes) {
    for (const [enemyCt, ourCt] of COMP_TYPE_COUNTERS) {
      if (ourCt === ct) {
        const enemyLabel = COMP_TYPE_EN[enemyCt] || enemyCt.replace(/_/g, " ");
        avoidWhen.push(`Ennemi ${enemyLabel} outscale ta win condition`);
      }
    }
    for (const [a, b] of INCOMPATIBLE_COMP_PAIRS) {
      if (ct === a) {
        const badLabel = COMP_TYPE_EN[b] || b.replace(/_/g, " ");
        avoidWhen.push(`Même équipe empile ${badLabel} — win conditions conflictuelles`);
      }
    }
  }

  if (compTypes.includes("teamfight_engage")) {
    avoidWhen.push("Full poke/siege sans moyen de forcer le 5v5");
    avoidWhen.push("Range/kite lourd quand tu ne peux pas engage");
  }
  if (compTypes.includes("hypercarry")) {
    avoidWhen.push("Draft sans peel ou frontline");
  }
  if (compTypes.includes("pick_global")) {
    avoidWhen.push("Comps 5v5 teamfight forcées");
  }
  if (compTypes.includes("split_push")) {
    avoidWhen.push("Engage wombo hard sans pression side");
  }
  if (compTypes.includes("all_in") && famKey !== "mage_dps") {
    avoidWhen.push("Comp poke/disengage — win condition all-in incompatible");
  }
  if (compTypes.includes("poke_disengage") && famKey !== "mage_control") {
    avoidWhen.push("All-in forcé sans backup disengage");
  }

  if (!draftWhen.length && fam?.label) {
    draftWhen.push(`Plan de jeu ${fam.label}`);
  }

  return {
    draftWhen: [...new Set(draftWhen)].slice(0, 4),
    avoidWhen: [...new Set(avoidWhen)].slice(0, 4),
  };
}

function shortMatchupReason(reason = "") {
  const first = formatLolTerms(reason).split("·")[0].trim();
  return truncateText(first, 72);
}

function truncateText(text = "", max = 140) {
  const t = String(text).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function rebuildEffectiveChampions() {
  if (!Array.isArray(state.baseChampions) || !state.baseChampions.length || !state.patchConfig) {
    state.champions = Array.isArray(state.baseChampions) ? [...state.baseChampions] : [];
    state.byName.clear();
    state.champions.forEach((c) => state.byName.set(c.name, c));
    return;
  }
  state.champions = window.LoLPatch.getPlayable(state.baseChampions, state.patchConfig);
  state.byName.clear();
  state.champions.forEach((c) => state.byName.set(c.name, c));
}

function persistPatchConfig() {
  if (!state.patchConfig) return;
  window.LoLPatch.save(state.patchConfig);
  rebuildEffectiveChampions();
  refreshPatchDependentViews();
  markPatchSaved();
  scheduleUserSessionSave();
}

function markPatchSaved() {
  els.patchSaveStatus?.classList.remove("is-dirty");
  if (els.patchSaveStatus) els.patchSaveStatus.textContent = "Synchronisé · utilisé partout";
}

function refreshPatchDependentViews() {
  updatePatchStats();
  if (state.view === "champions") renderGrid();
  if (state.view === "patch") renderPatchTable();
  if (state.view === "draft" && window.LoLDraftUI) window.LoLDraftUI.renderAll?.();
  if (state.view === "tactics") renderTacticsPool();
}

function updatePatchStats() {
  if (!state.patchConfig) return;
  const total = state.baseChampions.length;
  const enabled = window.LoLPatch.countEnabled(state.patchConfig);
  if (els.patchStatCount) {
    els.patchStatCount.textContent = `${enabled} / ${total} en rotation`;
  }
  if (els.countLabel && state.view === "champions") {
    els.countLabel.textContent = `${state.champions.length} en rotation (patch)`;
  }
}

function patchEntryFor(name) {
  return state.patchConfig?.overrides?.[name];
}

function updatePatchEntry(name, patch) {
  if (!state.patchConfig) return;
  window.LoLPatch.setEntry(state.patchConfig, name, patch);
  persistPatchConfig();
}

function renderPatchTable() {
  if (!els.patchTableBody || !state.patchConfig) return;

  const q = (state.patchSearch || "").toLowerCase();
  const filter = state.patchPoolFilter;
  const rows = state.baseChampions.filter((c) => {
    const entry = patchEntryFor(c.name);
    const enabled = entry?.enabled !== false;
    if (filter === "enabled" && !enabled) return false;
    if (filter === "disabled" && enabled) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.nameEn || "").toLowerCase().includes(q) ||
      (c.type || "").toLowerCase().includes(q)
    );
  });

  els.patchEmpty?.classList.toggle("hidden", rows.length > 0);
  els.patchTableBody.innerHTML = rows
    .map((c) => {
      const entry = patchEntryFor(c.name);
      const enabled = entry?.enabled !== false;
      const tier = entry?.tierMeta || "C";
      const slots = entry?.optimalSlots || [];
      const display = window.LoLPatch.applyToChampion(c, entry);

      const slotChips = window.LoLPatch.SLOTS.map((slot) => {
        const active = slots.includes(slot);
        return `<label class="patch-slot-chip${active ? " is-active" : ""}" title="${slot}">
          <input type="checkbox" data-patch-slot="${slot}" data-champ="${escapeHtml(c.name)}"${active ? " checked" : ""} />
          ${slot}
        </label>`;
      }).join("");

      const tierOptions = window.LoLPatch.TIERS.map(
        (t) => `<option value="${t}"${t === tier ? " selected" : ""}>${t}</option>`
      ).join("");

      return `<tr class="${enabled ? "" : "is-disabled"}" data-champ="${escapeHtml(c.name)}">
        <td>
          <div class="patch-champ-cell">
            ${championIconHtml(display, { size: "coach" })}
            <span class="patch-champ-name">${escapeHtml(c.name)}</span>
          </div>
        </td>
        <td>
          <label class="patch-toggle">
            <input type="checkbox" class="patch-enabled-toggle" data-champ="${escapeHtml(c.name)}"${enabled ? " checked" : ""} />
            ${enabled ? "Actif" : "Hors rotation"}
          </label>
        </td>
        <td>
          <select class="patch-tier-select tier-${tier.toLowerCase()}" data-champ="${escapeHtml(c.name)}" aria-label="Tier ${escapeHtml(c.name)}">
            ${tierOptions}
          </select>
        </td>
        <td><div class="patch-slots">${slotChips}</div></td>
      </tr>`;
    })
    .join("");

  bindPatchTableEvents();
  updatePatchStats();
}

function bindPatchTableEvents() {
  els.patchTableBody?.querySelectorAll(".patch-enabled-toggle").forEach((input) => {
    input.addEventListener("change", () => {
      updatePatchEntry(input.dataset.champ, { enabled: input.checked });
    });
  });

  els.patchTableBody?.querySelectorAll(".patch-tier-select").forEach((select) => {
    select.addEventListener("change", () => {
      select.className = `patch-tier-select tier-${select.value.toLowerCase()}`;
      updatePatchEntry(select.dataset.champ, { tierMeta: select.value });
    });
  });

  els.patchTableBody?.querySelectorAll(".patch-slot-chip input").forEach((input) => {
    input.addEventListener("change", () => {
      const name = input.dataset.champ;
      const entry = patchEntryFor(name);
      const slots = new Set(entry?.optimalSlots || []);
      if (input.checked) slots.add(input.dataset.patchSlot);
      else slots.delete(input.dataset.patchSlot);
      updatePatchEntry(name, { optimalSlots: window.LoLPatch.SLOTS.filter((s) => slots.has(s)) });
    });
  });
}

function setupPatchUI() {
  if (els.patchNameInput) {
    els.patchNameInput.value = state.patchConfig?.label || "Patch actuel";
    els.patchNameInput.addEventListener("change", () => {
      if (!state.patchConfig) return;
      state.patchConfig.label = els.patchNameInput.value.trim() || "Patch actuel";
      persistPatchConfig();
    });
  }

  els.patchSearch?.addEventListener("input", (e) => {
    state.patchSearch = e.target.value;
    renderPatchTable();
  });

  els.patchPoolFilters?.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    els.patchPoolFilters.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.patchPoolFilter = chip.dataset.pool;
    renderPatchTable();
  });

  els.patchEnableAll?.addEventListener("click", () => {
    if (!state.patchConfig || !confirm("Activer tous les champions dans la rotation ?")) return;
    window.LoLPatch.setAllEnabled(state.patchConfig, true);
    persistPatchConfig();
  });

  els.patchDisableAll?.addEventListener("click", () => {
    if (!state.patchConfig || !confirm("Retirer tous les champions de la rotation ?")) return;
    window.LoLPatch.setAllEnabled(state.patchConfig, false);
    persistPatchConfig();
  });

  els.patchResetDefaults?.addEventListener("click", () => {
    if (!confirm("Réinitialiser tiers, postes et pool depuis les données de base ?")) return;
    state.patchConfig = window.LoLPatch.resetToDefaults(state.baseChampions);
    if (els.patchNameInput) els.patchNameInput.value = state.patchConfig.label;
    persistPatchConfig();
  });
}

function tierRank(tier) {
  return TIER_ORDER[tier] ?? 99;
}

function tierBadgeHtml(tier, large = false) {
  if (!tier) return "";
  const cls = `tier-badge tier-${tier.toLowerCase()}${large ? " tier-badge-lg" : ""}`;
  return `<span class="${cls}" title="Tier meta ${tier}">${tier}</span>`;
}

const MTG_CODES = ["W", "U", "B", "R", "G"];

const MTG_COLOR_META = {
  W: { label: "Blanc", hex: "#f5f0dc", philosophy: "Structure, peel, altruisme" },
  U: { label: "Bleu", hex: "#4a9fd4", philosophy: "Contrôle, setup, information" },
  B: { label: "Noir", hex: "#6b6b7a", philosophy: "Greed, picks, sacrifice" },
  R: { label: "Rouge", hex: "#e05238", philosophy: "Aggro, tempo, chaos" },
  G: { label: "Vert", hex: "#3d9e5a", philosophy: "Scaling, durée, tradition" },
};

function openMtgColorsGuide() {
  closeFilterDrawer();
  if (state.view !== "mtg-colors") {
    state.mtgGuideReturnView = state.view;
    history.pushState(
      { view: "mtg-colors", returnView: state.mtgGuideReturnView },
      "",
      "#colors"
    );
  }
  setView("mtg-colors");
  window.MtgColorsGuide?.renderPage(els.mtgColorsGuideContent);
}

function closeMtgColorsGuide() {
  const returnView = state.mtgGuideReturnView || "champions";
  state.mtgGuideReturnView = null;
  if (state.view !== "mtg-colors") return;
  if (history.state?.view === "mtg-colors") {
    history.back();
    return;
  }
  navigateToView(returnView);
}

function setupMtgColorGuideNav() {
  document.querySelectorAll("[data-mtg-guide]").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMtgColorsGuide();
    });
  });
}

function initMtgMeta(mtgJson) {
  state.mtgMeta = mtgJson || null;
  if (!mtgJson?.colors) return;
  for (const [code, meta] of Object.entries(mtgJson.colors)) {
    MTG_COLOR_META[code] = { ...MTG_COLOR_META[code], ...meta };
  }
}

function dominantMtgColor(champ) {
  const ci = champ?.colorIdentity;
  if (!ci) return null;
  return ci.dominant?.[0] || (ci.identity || "").charAt(0) || null;
}

function mtgAccentHex(code) {
  return MTG_COLOR_META[code]?.hex || "#c9a227";
}

function getMtgColorPair(champ) {
  const ci = champ?.colorIdentity;
  if (!ci) return [];
  return MTG_CODES.map((c) => ({ code: c, val: ci[c] || 0 }))
    .filter((x) => x.val > 0)
    .sort((a, b) => b.val - a.val)
    .slice(0, 2);
}

function mtgPastilleTitle(pair) {
  return pair.map((p) => `${MTG_COLOR_META[p.code].label} ${p.val}/24`).join(" · ");
}

function mtgPastillesHtml(champ, { variant = "card" } = {}) {
  const pair = getMtgColorPair(champ);
  if (!pair.length) return "";
  const title = mtgPastilleTitle(pair);
  return `<span class="mtg-pastilles mtg-pastilles--${variant}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${pair
    .map(
      (p, i) =>
        `<span class="mtg-pastille mtg-pastille--${p.code.toLowerCase()} mtg-pastille--${i === 0 ? "primary" : "secondary"}" style="--pastille-weight:${p.val}"></span>`
    )
    .join("")}</span>`;
}

function colorSpectrumHtml() {
  return "";
}

function mtgHarmonyTagsHtml(dominantCodes, combination) {
  const pie = window.MTGColorPie;
  if (pie) {
    const tags = pie.harmonyTags(dominantCodes, combination);
    if (!tags.length) return "";
    const kindClass = { ally: "ally", enemy: "enemy", shard: "shard", wedge: "wedge", mono: "mono" };
    return `<div class="mtg-harmony-tags">${tags
      .map(
        (t) =>
          `<span class="mtg-harmony-tag mtg-harmony-tag--${kindClass[t.kind] || "ally"}">${escapeHtml(t.text)}</span>`
      )
      .join("")}</div>`;
  }
  const pairs = state.mtgMeta?.pairs || {};
  const dom = dominantCodes || [];
  const allies = [];
  const enemies = [];
  for (const [a, b] of pairs.allied || []) {
    if (dom.includes(a) && dom.includes(b)) allies.push(`${MTG_COLOR_META[a].label}+${MTG_COLOR_META[b].label}`);
  }
  for (const [a, b] of pairs.enemy || []) {
    if (dom.includes(a) && dom.includes(b)) enemies.push(`${MTG_COLOR_META[a].label} vs ${MTG_COLOR_META[b].label}`);
  }
  if (!allies.length && !enemies.length) return "";
  return `<div class="mtg-harmony-tags">${allies
    .map((t) => `<span class="mtg-harmony-tag mtg-harmony-tag--ally">${escapeHtml(t)}</span>`)
    .join("")}${enemies.map((t) => `<span class="mtg-harmony-tag mtg-harmony-tag--enemy">${escapeHtml(t)}</span>`).join("")}</div>`;
}

function mtgDetailInlineHtml(champ) {
  const pair = getMtgColorPair(champ);
  if (!pair.length) return "";
  const philo = pair.map((p) => MTG_COLOR_META[p.code]?.philosophy).filter(Boolean).join(" · ");
  return `<span class="detail-mtg">${mtgPastillesHtml(champ, { variant: "detail" })}${
    philo ? `<span class="detail-mtg-philo">${escapeHtml(philo)}</span>` : ""
  }</span>`;
}

function mtgDetailBlockHtml(champ) {
  return mtgDetailInlineHtml(champ);
}

function compPickNames(comp) {
  return Object.values(comp || {}).filter(Boolean);
}

function mtgTeamPanelHtml(names, title) {
  if (!names.length || !window.LoLDraft?.teamColorSummary) return "";
  const summary = window.LoLDraft.teamColorSummary(names, state.byName, state.tacticsMeta?.champions || {});
  const pair = (summary.dominant || [])
    .slice(0, 2)
    .map((code) => ({ code, val: summary.bars?.find((b) => b.code === code)?.value || 12 }));
  const pastilles =
    pair.length > 0
      ? `<span class="mtg-pastilles mtg-pastilles--inline">${pair
          .map(
            (p, i) =>
              `<span class="mtg-pastille mtg-pastille--${p.code.toLowerCase()} mtg-pastille--${i === 0 ? "primary" : "secondary"}" style="--pastille-weight:${Math.round(p.val)}"></span>`
          )
          .join("")}</span>`
      : "";
  const comboLabel = summary.combination?.name || summary.identity || "";
  const identityExtra = comboLabel && summary.combination?.type && !["multicolor", "dual", "four"].includes(summary.combination.type)
    ? ` · ${escapeHtml(comboLabel)}`
    : "";
  return `<div class="mtg-team-panel">
    <div class="mtg-team-panel-head">
      <span class="mtg-team-panel-title">${escapeHtml(title)}</span>
      <span class="mtg-team-identity">${pastilles}${identityExtra}</span>
    </div>
    ${mtgHarmonyTagsHtml(summary.dominant, summary.combination)}
  </div>`;
}

function countChampionsByColor(code) {
  if (!code || code === "all") return state.champions.length;
  return state.champions.filter((c) => colorFilterMatches(c, code)).length;
}

function selectColorFilter(code) {
  state.colorFilter = code || "all";
  els.colorFilters?.querySelectorAll(".mtg-dot-btn").forEach((c) => {
    c.classList.toggle("is-active", c.dataset.color === state.colorFilter);
  });
  syncMobileSelect("colorFilter");
  renderGrid();
  scheduleUserSessionSave();
}

function buildColorFilterUI() {
  if (!els.colorFilters) return;
  const active = state.colorFilter;
  els.colorFilters.innerHTML = `
    <div class="mtg-filter-dots">
      <button type="button" class="mtg-dot-btn${active === "all" ? " is-active" : ""}" data-color="all" title="Toutes les couleurs">
        <span class="mtg-pastille mtg-pastille--all"></span>
      </button>
      ${MTG_CODES.map((c) => {
        const meta = MTG_COLOR_META[c];
        const n = countChampionsByColor(c);
        return `<button type="button" class="mtg-dot-btn mtg-dot-btn--${c.toLowerCase()}${active === c ? " is-active" : ""}" data-color="${c}" title="${escapeHtml(meta.label)} · ${n}" style="--chip-color:${meta.hex}">
          <span class="mtg-pastille mtg-pastille--${c.toLowerCase()} mtg-pastille--primary" style="--pastille-weight:12"></span>
        </button>`;
      }).join("")}
    </div>`;

  const mobileColor = document.getElementById("mobile-color");
  if (mobileColor) {
    mobileColor.innerHTML = `<option value="all">Toutes les couleurs</option>${MTG_CODES.map(
      (c) => `<option value="${c}">${escapeHtml(MTG_COLOR_META[c].label)}</option>`
    ).join("")}`;
    mobileColor.value = active;
  }
}

function setupColorFilters() {
  els.colorFilters?.addEventListener("click", (e) => {
    const chip = e.target.closest(".mtg-dot-btn");
    if (!chip) return;
    selectColorFilter(chip.dataset.color);
    if (window.matchMedia("(max-width: 900px)").matches) closeFilterDrawer();
  });
}

function renderMtgCompass() {
  if (!els.mtgCompass) return;
  const active = state.colorFilter;
  els.mtgCompass.innerHTML = `
    <button type="button" class="mtg-dot-btn${active === "all" ? " is-active" : ""}" data-color="all" role="tab" aria-selected="${active === "all"}" title="Toutes">
      <span class="mtg-pastille mtg-pastille--all"></span>
    </button>
    ${MTG_CODES.map((c) => {
      const meta = MTG_COLOR_META[c];
      return `<button type="button" class="mtg-dot-btn mtg-dot-btn--${c.toLowerCase()}${active === c ? " is-active" : ""}" data-color="${c}" role="tab" aria-selected="${active === c}" title="${escapeHtml(meta.label)}">
        <span class="mtg-pastille mtg-pastille--${c.toLowerCase()} mtg-pastille--primary" style="--pastille-weight:12"></span>
      </button>`;
    }).join("")}`;

  els.mtgCompass.querySelectorAll("[data-color]").forEach((btn) => {
    btn.addEventListener("click", () => selectColorFilter(btn.dataset.color));
  });
}

function colorIdentityHtml(champ, { compact = false, showBars = false, variant = "inline" } = {}) {
  if (showBars) {
    const pair = getMtgColorPair(champ);
    const rest = MTG_CODES.filter((c) => !pair.some((p) => p.code === c))
      .map((c) => ({ code: c, val: champ?.colorIdentity?.[c] || 0 }))
      .filter((x) => x.val >= 4);
    const all = [...pair, ...rest.slice(0, compact ? 0 : 3 - pair.length)];
    if (!all.length) return mtgPastillesHtml(champ, { variant });
    const title = all.map((p) => `${MTG_COLOR_META[p.code].label} ${p.val}/24`).join(" · ");
    return `<span class="mtg-pastilles mtg-pastilles--${variant}" title="${escapeHtml(title)}">${all
      .map(
        (p, i) =>
          `<span class="mtg-pastille mtg-pastille--${p.code.toLowerCase()} mtg-pastille--${i === 0 ? "primary" : i === 1 ? "secondary" : "tertiary"}" style="--pastille-weight:${p.val}"></span>`
      )
      .join("")}</span>`;
  }
  return mtgPastillesHtml(champ, { variant: compact ? "compact" : variant });
}

function colorFilterMatches(champ, filter) {
  if (!filter || filter === "all") return true;
  const ci = champ?.colorIdentity;
  if (!ci) return false;
  const dom = ci.dominant || [];
  const id = ci.identity || "";
  return dom.includes(filter) || id.includes(filter) || (ci[filter] || 0) >= 6;
}

function getTypeClass(type = "") {
  const t = type.toLowerCase();
  if (t.includes("combattant") || t.includes("fighter")) return "type-guerrier";
  if (t.includes("tank")) return "type-guerrier";
  if (t.includes("mage")) return "type-mage";
  if (t.includes("support")) return "type-support";
  if (t.includes("tireur") || t.includes("marksman")) return "type-distance";
  if (t.includes("assassin")) return "type-assassin";
  return "type-default";
}

function getTypeCategory(type = "") {
  const t = type.toLowerCase();
  if (t.includes("combattant") || t.includes("fighter")) return "Combattant";
  if (t.includes("tank")) return "Tank";
  if (t.includes("assassin")) return "Assassin";
  if (t.includes("support")) return "Support";
  if (t.includes("tireur") || t.includes("marksman")) return "Tireur";
  if (t.includes("mage")) return "Mage";
  return "Autre";
}

function initials(name) {
  const parts = name.split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function championIconHtml(champ, { size = "card", alt = "" } = {}) {
  const label = alt || champ.name;
  const typeClass = getTypeClass(champ.type);
  const iconSrc = champ.icon || (champ.id ? `icons/${champ.id}.png` : "");
  if (iconSrc) {
    return `<div class="champ-icon ${typeClass} champ-icon--${size}" role="img" aria-label="${escapeHtml(label)}">
      <img src="${escapeHtml(iconSrc)}" alt="" loading="lazy" decoding="async" onerror="this.closest('.champ-icon').classList.add('champ-icon--fallback'); this.remove();">
      <span class="champ-icon-fallback" aria-hidden="true">${initials(champ.name)}</span>
    </div>`;
  }
  return `<div class="champ-icon champ-icon--fallback ${typeClass} champ-icon--${size}" aria-label="${escapeHtml(label)}">${initials(champ.name)}</div>`;
}

function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdInline(text = "") {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = linkChampionNames(html);
  html = linkItemNames(html);
  return html;
}

function linkChampionNames(html) {
  for (const name of CHAMP_NAMES_SORTED) {
    if (!state.byName.has(name)) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![\\w-])(${escaped})(?![\\w-])`, "g");
    html = html.replace(
      re,
      `<button type="button" class="champ-link" data-champ="${escapeHtml(name)}">$1</button>`
    );
  }
  return html;
}

function linkItemNames(html) {
  return html;
}

function itemTitle(name) {
  const item = getItemRecord(name);
  if (!item) return name;
  const stats = item.stats ?? item.description ?? "";
  return stats ? `${name} — ${stats}` : name;
}

function getChampionBuild(champ) {
  const core = champ.coreItems?.length
    ? champ.coreItems
    : champ.build?.length
      ? champ.build.slice(0, 2)
      : [];
  const situational = champ.situationalItems?.length ? champ.situationalItems : [];
  const alternatives = champ.buildAlternatives?.length ? champ.buildAlternatives : [];
  return { core, situational, alternatives };
}

function getItemRecord(name) {
  return state.byItemName.get(name);
}

function itemIconHtml(name, { size = "sm" } = {}) {
  const item = getItemRecord(name);
  if (item?.icon) {
    return `<img class="item-chip-icon item-chip-icon--${size}" src="${escapeHtml(item.icon)}" alt="" loading="lazy" decoding="async" />`;
  }
  return `<span class="item-chip-fallback item-chip-icon--${size}" aria-hidden="true">${escapeHtml(name.slice(0, 2))}</span>`;
}

function renderItemChip(name, { compact = false, showName = true, truncate = false } = {}) {
  const label = truncate ? truncateText(name, 22) : name;
  return `<span class="item-chip build-chip${compact ? " item-chip--compact" : ""}" title="${escapeHtml(itemTitle(name))}">
    ${itemIconHtml(name, { size: compact ? "xs" : "sm" })}
    ${showName ? `<span class="item-chip-name">${escapeHtml(label)}</span>` : ""}
  </span>`;
}

function renderDetailCoreItems(champ) {
  const { core, situational } = getChampionBuild(champ);
  if (!core.length && !situational.length) {
    return `<section class="detail-items-block detail-section detail-section--core detail-section--items">
      <h3>Objets</h3>
      <p class="text-block">—</p>
    </section>`;
  }
  return `<section class="detail-items-block detail-section detail-section--core detail-section--items">
    ${
      core.length
        ? `<h3>Core</h3>
           <div class="detail-core-items">${core.slice(0, 4).map((name) => renderItemChip(name, { compact: true, showName: true })).join("")}</div>`
        : ""
    }
    ${
      situational.length
        ? `<h3 class="detail-subheading">Situationnel</h3>
           <div class="detail-core-items detail-core-items--sit">${situational
             .slice(0, 4)
             .map((name) => renderItemChip(name, { compact: true, showName: true }))
             .join("")}</div>`
        : ""
    }
  </section>`;
}

function renderChampionPageItems(champ) {
  const { core, situational, alternatives } = getChampionBuild(champ);
  if (!core.length && !situational.length && !alternatives.length) return `<p class="cp-muted">—</p>`;
  return `<div class="cp-items-section">
    ${
      core.length
        ? `<div class="cp-items-group">
            <h3 class="cp-items-label">Core</h3>
            <div class="cp-items-row">${core.map((name) => renderItemChip(name)).join("")}</div>
          </div>`
        : ""
    }
    ${
      situational.length
        ? `<div class="cp-items-group">
            <h3 class="cp-items-label cp-items-label--sit">Situationnel</h3>
            <div class="cp-items-row cp-items-row--sit">${situational.map((name) => renderItemChip(name)).join("")}</div>
          </div>`
        : ""
    }
    ${
      alternatives.length
        ? `<div class="cp-items-group cp-items-group--alts">
            <h3 class="cp-items-label cp-items-label--alt">Builds alternatifs</h3>
            <div class="cp-build-alts">
              ${alternatives
                .map((alt) => {
                  const wr =
                    alt.winrate != null && !Number.isNaN(Number(alt.winrate))
                      ? `<span class="cp-build-alt-wr">${Number(alt.winrate).toFixed(1)}% WR</span>`
                      : "";
                  return `<div class="cp-build-alt">
                    <div class="cp-build-alt-head">
                      <span class="cp-build-alt-label">${escapeHtml(alt.label || "Alternative")}</span>
                      ${wr}
                    </div>
                    <div class="cp-items-row cp-items-row--alt">${(alt.items || [])
                      .map((name) => renderItemChip(name, { compact: true }))
                      .join("")}</div>
                  </div>`;
                })
                .join("")}
            </div>
          </div>`
        : ""
    }
  </div>`;
}

function mdBlock(text = "") {
  const blocks = text.trim().split(/\n\n+/);
  return blocks
    .map((block) => {
      const trimmed = block.trim();
      if (trimmed.startsWith("|")) {
        return renderMarkdownTable(trimmed);
      }
      if (/^\d+\.\s/.test(trimmed)) {
        const items = trimmed.split(/\n(?=\d+\.\s)/);
        return `<ol>${items.map((li) => `<li>${mdInline(li.replace(/^\d+\.\s*/, ""))}</li>`).join("")}</ol>`;
      }
      if (trimmed.startsWith("- ")) {
        const items = trimmed.split(/\n- /);
        return `<ul>${items.map((li, i) => `<li>${mdInline(i === 0 ? li.replace(/^- /, "") : li)}</li>`).join("")}</ul>`;
      }
      return `<p>${mdInline(trimmed.replace(/\n/g, " "))}</p>`;
    })
    .join("");
}

function renderMarkdownTable(text) {
  const rows = text.split("\n").filter((r) => r.trim());
  if (rows.length < 2) return `<p>${mdInline(text)}</p>`;
  const headerCells = rows[0].split("|").filter(Boolean).map((c) => c.trim());
  const bodyRows = rows.slice(2);
  const thead = `<thead><tr>${headerCells.map((c) => `<th>${mdInline(c)}</th>`).join("")}</tr></thead>`;
  const tbody = bodyRows
    .map((row) => {
      const cells = row.split("|").filter(Boolean).map((c) => c.trim());
      return `<tr>${cells.map((c) => `<td>${mdInline(c)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<table>${thead}<tbody>${tbody}</tbody></table>`;
}

function normalize(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesFilters(champ) {
  const q = normalize(state.search);
  if (q) {
    const hay = normalize(
      [champ.name, champ.nameEn, champ.type, champ.positions, champGameplayStyle(champ), champ.tierMeta, champ.tierNote].join(" ")
    );
    if (!hay.includes(q)) return false;
  }

  if (state.slotFilter !== "all") {
    const slots = champ.optimalSlots || [];
    if (!slots.some((s) => s.includes(state.slotFilter))) return false;
  }

  if (state.typeFilter !== "all") {
    if (getTypeCategory(champ.type) !== state.typeFilter) return false;
  }

  if (state.tierFilter !== "all") {
    if (champ.tierMeta !== state.tierFilter) return false;
  }

  if (state.familyFilter !== "all") {
    const famKey = champ.championFamily?.key;
    if (famKey !== state.familyFilter) return false;
  }

  if (state.compFilter !== "all") {
    const types = champ.championFamily?.compTypes || [];
    if (!types.includes(state.compFilter)) return false;
  }

  if (state.colorFilter !== "all" && !colorFilterMatches(champ, state.colorFilter)) {
    return false;
  }

  return true;
}

function familyColor(key = "") {
  return FAMILY_PALETTE[key] || FAMILY_PALETTE.default;
}

function familyBadgeHtml(champ, { large = false } = {}) {
  const fam = champ.championFamily;
  if (!fam?.label) return "";
  const color = familyColor(fam.key);
  return `<span class="family-badge${large ? " family-badge-lg" : ""}" style="--fam-color:${color}" title="${escapeHtml(fam.key || "")}">${escapeHtml(fam.label)}</span>`;
}

function cardFamilyShort(champ) {
  const label = champ.championFamily?.label;
  if (!label) return "";
  return label.replace(/\s*\([^)]*\)\s*/g, " ").trim() || label;
}

function primaryCompTypeShort(champ) {
  const ct = champ.championFamily?.compTypes?.[0];
  if (!ct) return "";
  return COMP_TYPE_SHORT[ct] || COMP_TYPE_EN[ct] || ct.replace(/_/g, " ");
}

function cardMetaHtml(champ) {
  const fam = champ.championFamily;
  const famShort = cardFamilyShort(champ);
  const compShort = primaryCompTypeShort(champ);
  const pair = getMtgColorPair(champ);
  const colorHtml = mtgPastillesHtml(champ, { variant: "micro" });
  const colorId = champ.colorIdentity?.identity || pair.map((p) => p.code).join("");
  const famColor = familyColor(fam?.key);

  return `<div class="card-meta">
    <span class="card-meta-row card-meta-family" style="--fam-color:${famColor}" title="Famille · ${escapeHtml(fam?.label || famShort || "—")}">${escapeHtml(famShort || "—")}</span>
    <span class="card-meta-row card-meta-comp" title="Comp · ${escapeHtml(compShort || "—")}">${escapeHtml(compShort || "—")}</span>
    <span class="card-meta-row card-meta-color" title="${escapeHtml(mtgPastilleTitle(pair) || "Couleur")}">
      ${colorHtml || `<span class="card-meta-empty">—</span>`}${colorId ? `<span class="card-meta-color-id">${escapeHtml(colorId)}</span>` : ""}
    </span>
  </div>`;
}

const ROLE_SHORT = { Top: "Top", Jungle: "Jgl", Mid: "Mid", Bot: "ADC", Support: "Sup" };

function roleBadgeHtml(champ, { compact = false } = {}) {
  const LV = window.LoLLaneViability;
  const metaMap = tacticsMetaMap();
  const main = LV ? LV.primarySlot(champ, metaMap) : champ.mainRole;
  const playable = LV ? LV.playableSlots(champ, metaMap) : [];
  const flex = playable.filter((s) => s !== main);
  if (!main) return compact ? "" : `<span class="badge badge-slot badge-muted">—</span>`;
  if (compact) {
    const short = ROLE_SHORT[main] || main;
    return `<span class="badge badge-slot badge-main badge-compact" title="${escapeHtml(champ.positions || main)}">${short}</span>`;
  }
  const flexTxt = flex.length ? ` +${flex.join("/")}` : "";
  return `<span class="badge badge-slot badge-main" title="${escapeHtml(champ.positions || "")}">${main}${flexTxt}</span>`;
}

function renderMiniMatchupList(entries, variant, limit = 5) {
  const slice = entries.slice(0, limit);
  if (!slice.length) return `<span class="card-matchup-empty">—</span>`;
  return slice
    .map(({ name, reason }) => {
      const hint = reason ? formatLolTerms(reason).split("·")[0].trim() : "";
      return `<div class="card-matchup-item ${variant}">
        <span class="card-matchup-name">${escapeHtml(name)}</span>
        ${hint ? `<span class="card-matchup-hint">${escapeHtml(hint)}</span>` : ""}
      </div>`;
    })
    .join("");
}

function renderCardMatchupsPanel(champ) {
  const counters = getMatchupList(champ, "bestCounters").slice(0, 6);
  const pairings = getMatchupList(champ, "bestPairings").slice(0, 6);
  const planLines = compactGamePlanLines(champ).slice(0, 2);

  return `<div class="card-matchups">
    <div class="card-matchup-col">
      <span class="card-matchup-label counter">Contres</span>
      <div class="card-matchup-items">${renderMiniMatchupList(counters, "counter", 5)}</div>
    </div>
    <div class="card-matchup-col">
      <span class="card-matchup-label best">Synergies</span>
      <div class="card-matchup-items">${renderMiniMatchupList(pairings, "best", 5)}</div>
    </div>
    ${
      planLines.length
        ? `<div class="card-matchup-foot">${planLines
            .map(
              (line) =>
                `<p class="card-matchup-foot-line"><strong>${escapeHtml(line.phase)}</strong> ${escapeHtml(line.text)}</p>`
            )
            .join("")}</div>`
        : ""
    }
  </div>`;
}

function getFamilySample(familyKey) {
  return state.champions.find((c) => c.championFamily?.key === familyKey)?.championFamily;
}

function countChampionsInFamily(familyKey) {
  return state.champions.filter((c) => c.championFamily?.key === familyKey).length;
}

function selectFamilyFilter(familyKey) {
  const next = state.familyFilter === familyKey && familyKey !== "all" ? "all" : familyKey;
  state.familyFilter = next;
  syncFilterChips(els.familyFilters, "family", next);
  syncMobileSelect("familyFilter");
  renderGrid();
}

function renderChampionsHero() {
  if (!els.championsHeroMain) return;

  const familyKey = state.familyFilter;
  const colorKey = state.colorFilter;
  const toolbar = els.championsHero;

  if (familyKey === "all" && colorKey === "all") {
    toolbar?.classList.remove("is-family-focus", "is-color-focus");
    toolbar?.style.removeProperty("--fam-color");
    els.championsHeroMain.hidden = true;
    els.championsHeroMain.innerHTML = "";
    return;
  }

  els.championsHeroMain.hidden = false;

  if (familyKey !== "all") {
    renderFamilyFilterHero(familyKey);
    return;
  }

  renderColorHero(colorKey);
}

function renderColorHero(colorKey) {
  const meta = MTG_COLOR_META[colorKey];
  if (!meta) {
    state.colorFilter = "all";
    renderChampionsHero();
    return;
  }

  const count = countChampionsByColor(colorKey);
  els.championsHero?.style.setProperty("--fam-color", meta.hex);
  els.championsHero?.classList.remove("is-family-focus");
  els.championsHero?.classList.add("is-color-focus");

  els.championsHeroMain.innerHTML = `
    <div class="toolbar-focus toolbar-focus--color">
      <span class="mtg-pastille mtg-pastille--${colorKey.toLowerCase()} mtg-pastille--primary" style="--pastille-weight:14"></span>
      <span class="toolbar-focus-text"><strong>${escapeHtml(meta.label)}</strong> · ${count} champions</span>
      <button type="button" class="toolbar-focus-clear" id="hero-color-back">×</button>
    </div>`;

  document.getElementById("hero-color-back")?.addEventListener("click", () => selectColorFilter("all"));
}

function renderFamilyFilterHero(key) {
  const fam = getFamilySample(key);
  if (!fam) {
    state.familyFilter = "all";
    renderChampionsHero();
    return;
  }

  const color = familyColor(key);
  if (els.championsHero) {
    els.championsHero.style.setProperty("--fam-color", color);
    els.championsHero.classList.add("is-family-focus");
    els.championsHero.classList.remove("is-color-focus");
  }

  const count = countChampionsInFamily(key);

  els.championsHeroMain.innerHTML = `
    <div class="toolbar-focus toolbar-focus--family" style="--fam-color:${color}">
      <span class="toolbar-focus-dot" style="background:${color}"></span>
      <span class="toolbar-focus-text"><strong>${escapeHtml(fam.label || key)}</strong> · ${count} champions</span>
      <button type="button" class="toolbar-focus-clear" id="hero-family-back">×</button>
    </div>`;

  document.getElementById("hero-family-back")?.addEventListener("click", () => selectFamilyFilter("all"));
}

function renderFamilyStats() {
  if (!els.familyStats) return;
  const counts = new Map();
  for (const c of state.champions) {
    const fk = c.championFamily?.key;
    if (!fk) continue;
    counts.set(fk, (counts.get(fk) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const active = state.familyFilter;

  els.familyStats.innerHTML = `
    <button type="button" class="family-nav-pill${active === "all" ? " is-active" : ""}" data-family-key="all">Toutes</button>
    ${sorted
      .map(([key, n]) => {
        const label = getFamilySample(key)?.label || key;
        const isActive = active === key;
        return `<button type="button" class="family-nav-pill${isActive ? " is-active" : ""}" data-family-key="${escapeHtml(key)}" style="--fam-color:${familyColor(key)}" role="tab" aria-selected="${isActive}">
          <span class="family-nav-label">${escapeHtml(label)}</span>
          <span class="family-nav-count">${n}</span>
        </button>`;
      })
      .join("")}`;

  els.familyStats.querySelectorAll("[data-family-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fk = btn.dataset.familyKey;
      if (fk === "all") {
        state.familyFilter = "all";
        syncFilterChips(els.familyFilters, "family", "all");
        syncMobileSelect("familyFilter");
        renderGrid();
        return;
      }
      selectFamilyFilter(fk);
    });
  });

  const activeBtn = els.familyStats.querySelector(".is-active");
  activeBtn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

function buildFamilyFilterUI() {
  const families = new Map();
  const compTypes = new Map();
  for (const c of state.champions) {
    const fam = c.championFamily;
    if (fam?.key) families.set(fam.key, fam.label || fam.key);
    for (const ct of fam?.compTypes || []) {
      const label = state.tacticsMeta?.compGuide?.compTypes?.[ct]?.label || ct;
      compTypes.set(ct, label);
    }
  }

  const familySorted = [...families.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  if (els.familyFilters) {
    els.familyFilters.innerHTML = `<button class="chip active" data-family="all">Toutes</button>${familySorted
      .map(
        ([key, label]) =>
          `<button class="chip chip-family" data-family="${escapeHtml(key)}" style="--fam-color:${familyColor(key)}">${escapeHtml(label)}</button>`
      )
      .join("")}`;
  }

  const compSorted = [...compTypes.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  if (els.compFilters) {
    els.compFilters.innerHTML = `<button class="chip active" data-comp="all">Toutes</button>${compSorted
      .map(([key, label]) => `<button class="chip" data-comp="${escapeHtml(key)}">${escapeHtml(label)}</button>`)
      .join("")}`;
  }

  const mobileFam = document.getElementById("mobile-family");
  if (mobileFam) {
    mobileFam.innerHTML = `<option value="all">Toutes les familles</option>${familySorted
      .map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`)
      .join("")}`;
  }
  const mobileComp = document.getElementById("mobile-comp");
  if (mobileComp) {
    mobileComp.innerHTML = `<option value="all">Toutes les comps</option>${compSorted
      .map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`)
      .join("")}`;
  }

  const mobileTier = document.getElementById("mobile-tier");
  if (mobileTier) {
    mobileTier.innerHTML = `<option value="all">Tous les tiers</option>
      <option value="S">S</option><option value="A">A</option><option value="B">B</option>
      <option value="C">C</option><option value="D">D</option>`;
    mobileTier.value = state.tierFilter;
  }
  const mobileSlot = document.getElementById("mobile-slot");
  if (mobileSlot) {
    mobileSlot.innerHTML = `<option value="all">Tous les rôles</option>
      <option value="Top">Top</option><option value="Jungle">Jungle</option>
      <option value="Mid">Mid</option><option value="Bot">Bot</option><option value="Support">Support</option>`;
    mobileSlot.value = state.slotFilter;
  }
  const mobileType = document.getElementById("mobile-type");
  if (mobileType) {
    mobileType.innerHTML = `<option value="all">Toutes les classes</option>
      <option value="Combattant">Fighter</option><option value="Tank">Tank</option>
      <option value="Mage">Mage</option><option value="Assassin">Assassin</option>
      <option value="Tireur">Marksman</option><option value="Support">Support</option>`;
    mobileType.value = state.typeFilter;
  }
}

function renderChampionCardHtml(champ, index) {
  const domColor = dominantMtgColor(champ);
  const metaHtml = cardMetaHtml(champ);
  const splashVar = champ.splash ? `--card-splash:url(&quot;${escapeHtml(champ.splash)}&quot;);` : "";
  const styleAttr = domColor
    ? ` style="--i:${index};--mtg-accent:${mtgAccentHex(domColor)};${splashVar}"`
    : splashVar
      ? ` style="--i:${index};${splashVar}"`
      : ` style="--i:${index}"`;
  return `<button type="button" class="champion-card champion-card-v2 champion-card-v2--minimal champion-card-v3 ${getTypeClass(champ.type)}${
    state.selectedId === champ.id ? " selected" : ""
  }" data-id="${escapeHtml(champ.id)}"${styleAttr} aria-label="${escapeHtml(champ.name)} · ${escapeHtml(cardFamilyShort(champ) || "—")} · ${escapeHtml(primaryCompTypeShort(champ) || "—")}">
      ${champ.splash ? `<div class="card-splash" aria-hidden="true"></div>` : ""}
      <div class="card-visual">
        <div class="card-icon-wrap">
          ${championIconHtml(champ, { size: "card" })}
          ${tierBadgeHtml(champ.tierMeta)}
        </div>
        <div class="card-name">${escapeHtml(champ.name)}</div>
        ${metaHtml}
      </div>
    </button>`;
}

function renderGrid() {
  const filtered = state.champions.filter(matchesFilters).sort((a, b) => {
    const tr = tierRank(a.tierMeta) - tierRank(b.tierMeta);
    if (tr !== 0) return tr;
    return a.name.localeCompare(b.name, "fr");
  });
  els.countLabel && (els.countLabel.textContent = `${filtered.length} / ${state.champions.length} (rotation patch)`);
  if (els.galleryCountLabel) {
    els.galleryCountLabel.textContent = `${filtered.length} champion${filtered.length > 1 ? "s" : ""}`;
  }
  els.empty.classList.toggle("hidden", filtered.length > 0);
  renderChampionsHero();
  renderFamilyStats();
  renderMtgCompass();
  els.grid.innerHTML = filtered.map((champ, i) => renderChampionCardHtml(champ, i)).join("");
  ensureUiInteractive();
}

function champGameplayStyle(champ) {
  return champ.gameplayStyle || champ.matchupProfile?.gameplayStyle || "";
}

function normalizeMatchupEntry(entry) {
  if (!entry) return null;
  if (typeof entry === "string") return { name: entry, score: null, reason: "", source: "" };
  return {
    name: entry.name,
    score: entry.score ?? null,
    reason: entry.reason || "",
    source: entry.source || (entry.curated ? "curated" : ""),
    winrate: entry.winrate ?? null,
  };
}

const PLAYABLE_SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];
/** Bonus léger au score — ne remplace pas un gros écart de synergie calculée. */
const SYNERGY_ROLE_PAIR_BONUS = 16;
const SYNERGY_SOFT_PAIR = {
  Support: "Bot",
  Bot: "Support",
  Mid: "Jungle",
  Jungle: "Mid",
};

function tacticsMetaMap() {
  return state.tacticsMeta?.champions || {};
}

function champPlayableSlots(champ) {
  if (!champ) return new Set();
  const LV = window.LoLLaneViability;
  if (LV) return new Set(LV.playableSlots(champ, tacticsMetaMap()));
  return new Set();
}

function synergySharesPlayableSlot(champ, partnerName) {
  const mine = champPlayableSlots(champ);
  if (!mine.size) return false;
  const partner = state.byName.get(partnerName);
  const theirs = champPlayableSlots(partner);
  for (const slot of mine) {
    if (theirs.has(slot)) return true;
  }
  return false;
}

function champAnchorSlot(champ) {
  if (!champ) return null;
  const LV = window.LoLLaneViability;
  if (LV) return LV.primarySlot(champ, tacticsMetaMap());
  return champ.mainRole || null;
}

function synergyRolePairBonus(champ, partnerName) {
  const anchor = champAnchorSlot(champ);
  const target = anchor ? SYNERGY_SOFT_PAIR[anchor] : null;
  if (!target) return 0;
  const partner = state.byName.get(partnerName);
  if (!partner) return 0;
  return champPlayableSlots(partner).has(target) ? SYNERGY_ROLE_PAIR_BONUS : 0;
}

function synergyEffectiveScore(champ, entry) {
  return (entry.score ?? 0) + synergyRolePairBonus(champ, entry.name);
}

function synergySortCompare(champ, a, b) {
  const diff = synergyEffectiveScore(champ, b) - synergyEffectiveScore(champ, a);
  if (diff !== 0) return diff;
  return (b.score ?? 0) - (a.score ?? 0);
}

/** Pairings draftables d'abord (autre poste), puis même poste / flex conflictuel — score + soft prio rôle complémentaire. */
function sortSynergiesByRole(champ, entries) {
  if (!entries?.length) return entries || [];
  const crossRole = [];
  const sameSlot = [];
  for (const entry of entries) {
    (synergySharesPlayableSlot(champ, entry.name) ? sameSlot : crossRole).push(entry);
  }
  crossRole.sort((a, b) => synergySortCompare(champ, a, b));
  sameSlot.sort((a, b) => synergySortCompare(champ, a, b));
  return [...crossRole, ...sameSlot];
}

function getSynergyEntries(champ) {
  const raw = champ?.allPairings?.length ? champ.allPairings : champ?.bestPairings;
  if (!raw?.length) return [];
  return sortSynergiesByRole(champ, raw.map(normalizeMatchupEntry).filter(Boolean));
}

function getMatchupList(champ, field) {
  if (field === "bestPairings" || field === "allPairings") {
    return getSynergyEntries(champ);
  }
  const fullField = field === "bestCounters" ? "allCounters" : null;
  const raw = champ?.[field]?.length ? champ[field] : fullField ? champ?.[fullField] : null;
  if (!raw?.length) {
    if (field === "bestCounters" && champ?.worstMatchups?.length) {
      return champ.worstMatchups.map(normalizeMatchupEntry).filter(Boolean);
    }
    return [];
  }
  return raw.map(normalizeMatchupEntry).filter(Boolean);
}

function getFullMatchupList(champ, kind) {
  if (kind === "synergy") {
    return getSynergyEntries(champ);
  }
  const field = kind === "counter" ? "allCounters" : "allPairings";
  const fallback = kind === "counter" ? "bestCounters" : "bestPairings";
  const raw = champ?.[field]?.length ? champ[field] : champ?.[fallback];
  if (!raw?.length) return [];
  return raw.map(normalizeMatchupEntry).filter(Boolean);
}

function renderMatchupChips(entries, variant) {
  return entries
    .map(
      ({ name }) =>
        `<button type="button" class="matchup-chip ${variant}" data-champ="${escapeHtml(name)}">${escapeHtml(name)}</button>`
    )
    .join("");
}

function renderDetailMatchupList(entries, variant, limit = 4) {
  const slice = entries.slice(0, limit);
  if (!slice.length) return "";
  return slice
    .map(
      ({ name }) =>
        `<button type="button" class="matchup-chip ${variant}" data-champ="${escapeHtml(name)}">${escapeHtml(name)}</button>`
    )
    .join("");
}

function renderDetailHero(champ) {
  const splashImg = champ.splash
    ? `<img class="detail-hero-modern-bg" src="${escapeHtml(champ.splash)}" alt="" loading="eager" decoding="async" />`
    : `<div class="detail-hero-modern-bg detail-hero-modern-bg--fallback" aria-hidden="true"></div>`;
  return `
    <header class="detail-hero-modern">
      ${splashImg}
      <div class="detail-hero-modern-shade" aria-hidden="true"></div>
      <button type="button" class="detail-hero-modern-link" data-champion-page="${escapeHtml(champ.id)}" aria-label="Ouvrir la fiche complète de ${escapeHtml(champ.name)}">
        <div class="detail-hero-modern-body">
          ${championIconHtml(champ, { size: "detail" })}
          <div class="detail-hero-modern-title">
            <h2>${escapeHtml(champ.name)}</h2>
            ${tierBadgeHtml(champ.tierMeta, true)}
          </div>
        </div>
      </button>
    </header>`;
}

function renderDetailHighlights(champ) {
  const { strengths, weaknesses } = deriveChampionHighlights(champ);
  const { draftWhen, avoidWhen } = deriveChampionDraftVerdict(champ);
  const pickTips = draftWhen.slice(0, 2);
  const banTips = avoidWhen.slice(0, 2);
  if (!strengths.length && !weaknesses.length && !pickTips.length && !banTips.length) return "";

  const list = (items, cls) =>
    items.length
      ? `<ul class="detail-hint-list ${cls}">${items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
      : "<span class='text-block'>—</span>";

  return `<div class="detail-highlights-grid">
    <section class="detail-section detail-section--compact">
      <h3>Forces</h3>
      ${list(strengths.length ? strengths : pickTips, "detail-hint-list--plus")}
    </section>
    <section class="detail-section detail-section--compact">
      <h3>Faiblesses</h3>
      ${list(weaknesses.length ? weaknesses : banTips, "detail-hint-list--minus")}
    </section>
  </div>`;
}

function renderMatchupRows(entries, variant) {
  return entries
    .map(({ name, reason }) => {
      const reasonText = reason ? formatLolTerms(reason) : "";
      return `
      <div class="matchup-row ${variant}">
        <div class="matchup-row-head">
          <button type="button" class="matchup-row-name champ-link" data-champ="${escapeHtml(name)}">${escapeHtml(name)}</button>
        </div>
        ${reasonText ? `<p class="matchup-reason">${escapeHtml(truncateText(reasonText, 120))}</p>` : ""}
      </div>`;
    })
    .join("");
}

function renderLaneRateBars(champ) {
  const rates = champ.laneRates;
  if (!rates || !Object.keys(rates).length) {
    return `<p class="text-block">Données de lane indisponibles pour ce champion.</p>`;
  }
  const order = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const maxRate = Math.max(...order.map((s) => rates[s]?.rate || 0), 1);
  return `
    <div class="lane-rate-panel">
      <p class="section-hint">Ranked · lane jouable ≥ 10 %</p>
      <div class="lane-rate-bars">
        ${order
          .map((slot) => {
            const r = rates[slot]?.rate || 0;
            const LV = window.LoLLaneViability;
            const primary = LV ? LV.primarySlot(champ, tacticsMetaMap()) : champ.mainRole;
            const playableSet = LV ? new Set(LV.playableSlots(champ, tacticsMetaMap())) : null;
            const isMain = primary === slot;
            const isFlex = playableSet ? (playableSet.has(slot) && !isMain) : (champ.flexRoles || []).includes(slot);
            const playable = r >= 10;
            return `
            <div class="lane-rate-row${isMain ? " is-main" : ""}${playable ? " is-playable" : ""}">
              <span class="lane-rate-slot">${slot}${isMain ? " ★" : isFlex ? " +" : ""}</span>
              <div class="lane-rate-track"><div class="lane-rate-fill" style="width:${(r / maxRate) * 100}%"></div></div>
              <span class="lane-rate-pct">${r.toFixed(1)}%</span>
            </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function renderChampionFamilySection(champ) {
  const fam = champ.championFamily;
  if (!fam) return "";
  const color = familyColor(fam.key);
  const compLabels = fam.compTypeLabels?.length
    ? fam.compTypeLabels
    : (fam.compTypes || []).map((t) => state.tacticsMeta?.compGuide?.compTypes?.[t]?.label || t);
  return `
    <section class="family-hero-panel" style="--fam-color:${color}">
      <div class="family-hero-head">
        <span class="family-hero-kicker">Famille champion</span>
        <h2>${escapeHtml(fam.label || "—")}</h2>
      </div>
      ${compLabels.length ? `<div class="family-comp-chips">${compLabels.map((l) => `<span class="family-comp-chip">${escapeHtml(l)}</span>`).join("")}</div>` : ""}
      <div class="family-macro-grid">
        ${fam.macroEarly ? `<div class="family-macro-item"><strong>Early</strong><p>${escapeHtml(fam.macroEarly)}</p></div>` : ""}
        ${fam.macroMid ? `<div class="family-macro-item"><strong>Mid</strong><p>${escapeHtml(fam.macroMid)}</p></div>` : ""}
        ${fam.teamfightPlan ? `<div class="family-macro-item"><strong>Teamfight</strong><p>${escapeHtml(fam.teamfightPlan)}</p></div>` : ""}
      </div>
    </section>`;
}

function renderProfileBars(profile, { compact = false } = {}) {
  if (!profile) return "";
  const bars = [
    { label: "Dégâts", val: profile.damage },
    { label: "Tankiness", val: profile.tankiness },
    { label: "Utilité", val: profile.utility },
    { label: "Difficulté", val: profile.difficulty },
  ];
  return bars
    .map(
      ({ label, val }) => `
      <div class="profile-bar-row">
        <span class="profile-bar-label">${label}</span>
        <div class="profile-bar-track"><div class="profile-bar-fill" style="width:${Math.min(100, (val / 10) * 100)}%"></div></div>
        <span class="profile-bar-val">${val}/10</span>
      </div>`
    )
    .join("");
}

function renderTipsList(tips, variant) {
  if (!tips?.length) return "<p class='text-block'>—</p>";
  return `<ul class="tips-list tips-${variant}">${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;
}

function renderDetail(champ) {
  const counterPreview = getMatchupList(champ, "bestCounters").slice(0, 4);
  const pairingPreview = getMatchupList(champ, "bestPairings").slice(0, 4);
  const counterHtml = renderDetailMatchupList(counterPreview, "counter", 4);
  const bestHtml = renderDetailMatchupList(pairingPreview, "best", 4);

  els.detailContent.innerHTML = `
    <div class="detail-sheet">
      ${renderDetailHero(champ)}

      <div class="detail-sheet-body">
        <div class="detail-blocks">
          <section class="detail-block detail-block--counter">
            <h3>Contres</h3>
            <div class="matchup-list">${counterHtml || "<span class='text-block'>—</span>"}</div>
          </section>
          <section class="detail-block detail-block--synergy">
            <h3>Synergies</h3>
            <div class="matchup-list">${bestHtml || "<span class='text-block'>—</span>"}</div>
          </section>
        </div>

        ${renderDetailCoreItems(champ)}
      </div>

      <footer class="detail-sheet-footer">
        <button type="button" class="btn-primary btn-full detail-full-btn" data-champion-page="${escapeHtml(champ.id)}">
          Fiche champion complète
        </button>
      </footer>
    </div>
  `;

  bindChampLinks(els.detailContent);
  els.detailContent.querySelectorAll("[data-champion-page]").forEach((btn) => {
    btn.addEventListener("click", () => openChampionPage(btn.dataset.championPage));
  });
}

function renderCompactLaneRates(champ) {
  const rates = champ.laneRates;
  if (!rates || !Object.keys(rates).length) {
    return `<p class="cp-muted">Taux de lane indisponible</p>`;
  }
  const order = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const maxRate = Math.max(...order.map((s) => rates[s]?.rate || 0), 1);
  return `
    <div class="cp-lanes">
      ${order
        .map((slot) => {
          const r = rates[slot]?.rate || 0;
          const isMain = champ.mainRole === slot;
          const playable = r >= 10;
          return `
          <div class="cp-lane${isMain ? " is-main" : ""}${playable ? "" : " is-muted"}">
            <span class="cp-lane-slot">${slot}${isMain ? " ★" : ""}</span>
            <div class="cp-lane-track"><div class="cp-lane-fill" style="width:${(r / maxRate) * 100}%"></div></div>
            <span class="cp-lane-pct">${r.toFixed(0)}%</span>
          </div>`;
        })
        .join("")}
    </div>`;
}

function renderCompactMatchups(entries, variant, limit = 5) {
  const slice = entries.slice(0, limit);
  if (!slice.length) return `<p class="cp-muted">—</p>`;
  return slice
    .map(({ name, reason }) => {
      return `
      <div class="cp-match cp-match--${variant}">
        <button type="button" class="cp-match-name champ-link" data-champ="${escapeHtml(name)}">${escapeHtml(name)}</button>
        ${reason ? `<p class="cp-match-reason">${escapeHtml(truncateText(formatLolTerms(reason), 72))}</p>` : ""}
      </div>`;
    })
    .join("");
}

function renderChampionPageMatchups(entries, variant, limit = 8) {
  const slice = entries.slice(0, limit);
  if (!slice.length) return `<p class="cp-muted">—</p>`;
  return `<div class="cp-match-grid">${slice
    .map(({ name, reason }) => {
      const other = state.byName.get(name);
      const reasonText = reason ? formatLolTerms(reason) : "";
      return `
      <article class="cp-match-row cp-match-row--${variant}">
        ${other ? championIconHtml(other, { size: "match" }) : `<span class="cp-match-icon-fallback">${initials(name)}</span>`}
        <div class="cp-match-body">
          <button type="button" class="cp-match-name champ-link" data-champ="${escapeHtml(name)}">${escapeHtml(name)}</button>
          ${reasonText ? `<p class="cp-match-reason">${escapeHtml(truncateText(reasonText, 100))}</p>` : ""}
        </div>
      </article>`;
    })
    .join("")}</div>`;
}

function renderChampionPageTopMatchups(entries, variant, limit = 3) {
  const slice = entries.slice(0, limit);
  if (!slice.length) return `<p class="cp-muted">—</p>`;
  return `<div class="cp-top-matchups cp-top-matchups--${variant}">${slice
    .map(({ name, reason }) => {
      const other = state.byName.get(name);
      return `
      <article class="cp-top-match">
        ${other ? championIconHtml(other, { size: "match" }) : `<span class="cp-match-icon-fallback">${initials(name)}</span>`}
        <div class="cp-top-match-body">
          <button type="button" class="cp-match-name champ-link" data-champ="${escapeHtml(name)}">${escapeHtml(name)}</button>
          ${reason ? `<p class="cp-top-match-reason">${escapeHtml(shortMatchupReason(reason))}</p>` : ""}
        </div>
      </article>`;
    })
    .join("")}</div>`;
}

function renderChampionPageSnapshot(champ) {
  const { strengths, weaknesses } = deriveChampionHighlights(champ);
  const { draftWhen, avoidWhen } = deriveChampionDraftVerdict(champ);
  const list = (items, empty) =>
    items.length
      ? `<ul class="cp-bullet-list">${items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
      : `<p class="cp-muted">${empty}</p>`;

  return `
    <div class="cp-snapshot">
      <div class="cp-verdict">
        <div class="cp-verdict-col cp-verdict-col--yes">
          <h3 class="cp-snapshot-title">Quand le pick</h3>
          ${list(draftWhen, "Pick flexible")}
        </div>
        <div class="cp-verdict-col cp-verdict-col--no">
          <h3 class="cp-snapshot-title">À éviter</h3>
          ${list(avoidWhen, "Pas de signal d'alerte majeur")}
        </div>
      </div>
      <div class="cp-highlights">
        <div class="cp-highlight-col cp-highlight-col--pro">
          <h3 class="cp-snapshot-title">Forces</h3>
          ${list(strengths, "—")}
        </div>
        <div class="cp-highlight-col cp-highlight-col--con">
          <h3 class="cp-snapshot-title">Faiblesses</h3>
          ${list(weaknesses, "—")}
        </div>
      </div>
    </div>`;
}

function renderChampionPageKit(champ) {
  const abilities = champ.abilities || [];
  if (!abilities.length) return `<p class="cp-muted">—</p>`;
  return `<div class="cp-kit-list">${abilities
    .map((a) => {
      const slot =
        a.slot === "Ultimate" ? "R" : a.slot === "Passif" || a.slot === "Passive" ? "P" : a.slot;
      const isUlt = a.slot === "Ultimate";
      return `
      <article class="cp-kit-row${isUlt ? " cp-kit-row--ult" : ""}">
        <span class="cp-kit-slot">${escapeHtml(slot)}</span>
        <div class="cp-kit-body">
          <strong class="cp-kit-name">${escapeHtml(a.meta || "")}</strong>
          <p class="cp-kit-desc">${escapeHtml(truncateText(a.description, 150))}</p>
        </div>
        ${a.cooldown && a.cooldown !== "—" ? `<span class="cp-kit-cd">${escapeHtml(a.cooldown)}</span>` : ""}
      </article>`;
    })
    .join("")}</div>`;
}

function renderChampionPageTips(champ) {
  const profile = champ.matchupProfile;
  const ally = (profile?.allyTips || []).slice(0, 3);
  const enemy = (profile?.enemyTips || []).slice(0, 3);
  if (!ally.length && !enemy.length) return `<p class="cp-muted">—</p>`;
  const tipCol = (title, tips, variant) =>
    tips.length
      ? `<div class="cp-tips-col cp-tips-col--${variant}">
          <h3 class="cp-tips-title">${title}</h3>
          <ul class="cp-tips-list">${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
        </div>`
      : "";
  return `<div class="cp-tips-grid">${tipCol("Avec ce champion", ally, "ally")}${tipCol("Contre ce champion", enemy, "enemy")}</div>`;
}

function tierAdviceText(a, field) {
  const raw = a?.[field] || "";
  if (field === "winCondition") {
    return raw.replace(/^Win condition LS\s*:\s*/i, "").replace(/^Win condition\s*:\s*/i, "");
  }
  return raw.replace(/\(\s*LS\s*:\s*/gi, "(");
}

function renderChampionTierAnalysis(champ) {
  const a = champ.tierAnalysis;
  if (!a) {
    return champ.tierNote
      ? `<div class="cp-tier-note">
          <span class="cp-tier-note-label">Tier ${escapeHtml(champ.tierMeta || "—")}</span>
          <p>${escapeHtml(champ.tierNote)}</p>
        </div>`
      : "";
  }
  const roleLabels = {
    beatdown: "Beatdown",
    control: "Control",
    flex: "Flex (lis le matchup)",
  };
  const vectorLabels = {
    lane_tempo: "Tempo lane",
    teamfight_ult: "TF ult",
    pick_assassination: "Pick / assassin",
    split_terror: "Split",
    hyper_scale: "Hyper-scale",
    objective_siege: "Siege",
    fight_reset: "Reset fight",
    global_pressure: "Global",
    skirmish_snowball: "Skirmish",
    carry_enabler: "Enabler",
  };
  const vecs = (a.gameBreakerVectors || [])
    .map((v) => vectorLabels[v] || v)
    .slice(0, 4);
  const riskLabel = { low: "Rôle clair", medium: "Misread possible", high: "Flex — lis le matchup" }[
    a.misidentifyRisk
  ] || a.misidentifyRisk;
  return `
    <div class="cp-tier-analysis">
      <h3 class="cp-tier-analysis-title">Who's the Beatdown</h3>
      <p class="cp-tier-framework-head muted">${escapeHtml(a.framework || "Who's the Beatdown (Mike Flores / MTG) + tempo map")}</p>
      <div class="cp-tier-analysis-head">
        <span class="cp-tier-note-label">Tier ${escapeHtml(champ.tierMeta || "—")} · game-breaker ${a.gameBreakerScore ?? "—"}/100</span>
        <span class="cp-tier-role cp-tier-role--${escapeHtml(a.beatdownRole || "flex")}">${escapeHtml(roleLabels[a.beatdownRole] || a.beatdownRole)}</span>
      </div>
      <p class="cp-tier-summary">${escapeHtml(a.summary || champ.tierNote || "")}</p>
      <div class="cp-tier-scores">
        <div class="cp-tier-score"><span>Beatdown</span><strong>${a.beatdownScore ?? "—"}</strong></div>
        <div class="cp-tier-score"><span>Control</span><strong>${a.controlScore ?? "—"}</strong></div>
        <div class="cp-tier-score"><span>Misread</span><strong>${escapeHtml(riskLabel)}</strong></div>
      </div>
      ${
        vecs.length
          ? `<p class="cp-tier-vectors"><strong>Leviers :</strong> ${vecs.map((v) => escapeHtml(v)).join(" · ")}</p>`
          : ""
      }
      <div class="cp-tier-plan">
        <h4 class="cp-tier-plan-title">Conseils macro</h4>
        <p><strong>Win condition</strong> — ${escapeHtml(tierAdviceText(a, "winCondition") || tierAdviceText({ winCondition: a.lsWinCondition }, "winCondition"))}</p>
        <p><strong>Si tu es beatdown</strong> — ${escapeHtml(tierAdviceText(a, "ifBeatdown"))}</p>
        <p><strong>Si tu es control</strong> — ${escapeHtml(tierAdviceText(a, "ifControl"))}</p>
      </div>
      <p class="cp-tier-framework muted">Framework : ${escapeHtml(a.framework || "Who's the Beatdown (Mike Flores / MTG) + tempo map")}</p>
    </div>`;
}

function renderChampionPageMacro(fam, champ) {
  if (fam) {
    const card = (phase, text, mod) =>
      text
        ? `<article class="cp-macro-card cp-macro-card--${mod}">
            <span class="cp-macro-phase">${phase}</span>
            <p>${escapeHtml(text)}</p>
          </article>`
        : "";
    return `<div class="cp-macro-grid">
      ${card("Early", fam.macroEarly, "early")}
      ${card("Mid", fam.macroMid, "mid")}
      ${card("Teamfight", fam.teamfightPlan, "tf")}
    </div>`;
  }
  const style = champGameplayStyle(champ);
  return style
    ? `<p class="cp-style-block">${escapeHtml(style)}</p>`
    : `<p class="cp-muted">—</p>`;
}

function bindChampionPageTabs(root) {
  root.querySelectorAll(".cp-window").forEach((windowEl) => {
    const tabs = windowEl.querySelectorAll("[data-cp-tab]");
    const panels = windowEl.querySelectorAll("[data-cp-panel]");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const id = tab.dataset.cpTab;
        tabs.forEach((t) => {
          t.classList.toggle("is-active", t === tab);
          t.setAttribute("aria-selected", t === tab ? "true" : "false");
        });
        panels.forEach((p) => p.classList.toggle("is-active", p.dataset.cpPanel === id));
      });
    });
  });
}

function renderChampionPage(champ) {
  const profile = champ.matchupProfile;
  const fam = champ.championFamily;
  const counters = getMatchupList(champ, "bestCounters");
  const synergies = getMatchupList(champ, "bestPairings");
  const allCounters = getFullMatchupList(champ, "counter");
  const allSynergies = getFullMatchupList(champ, "synergy");
  const compLabels = compTypeLabelsEn(champ);
  const famColor = familyColor(fam?.key);
  const attackLabel = profile?.attackKind === "melee" ? "Melee" : "Ranged";
  const rolesEn = (profile?.roles || []).map(classTypeEn).join(" · ") || classTypeEn(champ.type);

  els.championPageContent.innerHTML = `
    <div class="champion-page-v3" style="--cp-fam:${famColor}">
      <section class="cp-hero champions-hero is-family-focus">
        <div class="champions-hero-accent"></div>
        ${champ.splash ? `<img class="cp-hero-splash" src="${escapeHtml(champ.splash)}" alt="" loading="lazy" />` : ""}
        <div class="cp-hero-inner">
          <button type="button" class="cp-back btn-secondary" id="champion-page-back">← Champions</button>
          <div class="cp-identity">
            ${championIconHtml(champ, { size: "page" })}
            <div class="cp-identity-text">
              <div class="cp-name-row">
                <h1>${escapeHtml(champ.name)}</h1>
                ${tierBadgeHtml(champ.tierMeta, true)}
              </div>
              <p class="cp-hero-meta">${attackLabel} · range ${profile?.attackRange ?? "—"} · ${escapeHtml(rolesEn)}</p>
            </div>
          </div>
          <div class="cp-badges">
            <span class="cp-badge cp-badge--class">${escapeHtml(classTypeEn(champ.type))}</span>
            ${fam?.label ? `<span class="cp-badge cp-badge--family">${escapeHtml(fam.label)}</span>` : ""}
            ${compLabels.map((l) => `<span class="cp-badge cp-badge--comp">${escapeHtml(l)}</span>`).join("")}
            ${roleBadgeHtml(champ)}
            ${colorIdentityHtml(champ, { variant: "detail" })}
          </div>
        </div>
      </section>

      <div class="cp-body">
        <section class="cp-panel cp-panel--profile">
          <h2 class="cp-panel-title">Profil</h2>
          ${renderCompactLaneRates(champ)}
          ${
            profile
              ? `<div class="cp-profile">
            <div class="profile-bars profile-bars--page">${renderProfileBars(profile)}</div>
          </div>`
              : ""
          }
          <div class="cp-items-block">
            <h3 class="cp-subtitle">Objets</h3>
            ${renderChampionPageItems(champ)}
          </div>
        </section>

        <section class="cp-window champions-hero cp-window--main">
          <div class="champions-hero-accent"></div>
          <div class="champions-hero-body">
            ${renderChampionPageSnapshot(champ)}
            <div class="champions-hero-nav-wrap cp-detail-nav">
              <span class="champions-hero-nav-label">Détails</span>
              <div class="cp-window-tabs champions-hero-nav" role="tablist">
                <button type="button" class="family-nav-pill is-active" data-cp-tab="macro" role="tab" aria-selected="true">Plan de jeu</button>
                <button type="button" class="family-nav-pill" data-cp-tab="tips" role="tab" aria-selected="false">Conseils</button>
                <button type="button" class="family-nav-pill" data-cp-tab="kit" role="tab" aria-selected="false">Sorts</button>
              </div>
            </div>
            <div class="cp-window-body cp-window-body--detail">
              <div class="cp-window-panel is-active" data-cp-panel="macro">
                ${renderChampionPageMacro(fam, champ)}
                ${renderChampionTierAnalysis(champ)}
              </div>
              <div class="cp-window-panel" data-cp-panel="tips">${renderChampionPageTips(champ)}</div>
              <div class="cp-window-panel" data-cp-panel="kit">${renderChampionPageKit(champ)}</div>
            </div>
          </div>
        </section>

        <section class="cp-panel cp-panel--draft">
          <h2 class="cp-panel-title cp-panel-title--counter">Meilleurs contres</h2>
          ${renderChampionPageTopMatchups(counters, "counter", 3)}
          <h2 class="cp-panel-title cp-panel-title--synergy">Meilleures synergies</h2>
          ${renderChampionPageTopMatchups(synergies, "synergy", 3)}

          <div class="cp-window cp-window--nested champions-hero">
            <div class="champions-hero-nav-wrap">
              <span class="champions-hero-nav-label">Plus</span>
              <div class="cp-window-tabs champions-hero-nav" role="tablist">
                <button type="button" class="family-nav-pill is-active cp-tab--counter" data-cp-tab="counters" role="tab" aria-selected="true">Tous les contres</button>
                <button type="button" class="family-nav-pill cp-tab--synergy" data-cp-tab="synergies" role="tab" aria-selected="false">Toutes les synergies</button>
              </div>
            </div>
            <div class="cp-window-body cp-window-body--nested">
              <div class="cp-window-panel is-active" data-cp-panel="counters">${renderChampionPageMatchups(allCounters.length ? allCounters : counters, "counter", 40)}</div>
              <div class="cp-window-panel" data-cp-panel="synergies">${renderChampionPageMatchups(allSynergies.length ? allSynergies : synergies, "synergy", 40)}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  bindChampLinks(els.championPageContent, { fullPage: true });
  bindChampionPageTabs(els.championPageContent);
  document.getElementById("champion-page-back")?.addEventListener("click", closeChampionPage);
}

function openChampionPage(id) {
  const champ = state.champions.find((c) => c.id === id);
  if (!champ) return;

  dismissBlockingOverlays();
  state.championPageId = id;
  state.selectedId = id;
  renderChampionPage(champ);
  setView("champion-page");
  history.pushState({ view: "champion-page", id }, "", `#champion/${encodeURIComponent(id)}`);
  els.viewChampionPage.scrollTop = 0;
  renderGrid();
}

function closeChampionPage() {
  state.championPageId = null;
  state.selectedId = null;
  if (state.view === "champion-page") {
    history.pushState({ view: "champions" }, "", "#");
    setView("champions");
    renderGrid();
  }
}

function parseRouteFromHash() {
  const m = location.hash.match(/^#champion\/(.+)$/);
  if (!m) return false;
  const id = decodeURIComponent(m[1]);
  const champ = state.champions.find((c) => c.id === id);
  if (!champ) return false;
  state.championPageId = id;
  state.selectedId = id;
  renderChampionPage(champ);
  setView("champion-page");
  return true;
}

function bindChampLinks(root, { fullPage = false } = {}) {
  root.querySelectorAll(".champ-link, .matchup-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const target = state.byName.get(chip.dataset.champ);
      if (!target) return;
      if (fullPage) {
        openChampionPage(target.id);
      } else {
        openDetail(target.id);
      }
    });
  });
}

function openDetail(id) {
  const champ = state.champions.find((c) => c.id === id);
  if (!champ) return;

  closeFilterDrawer();

  if (state.view !== "champions") {
    setView("champions");
  }

  state.selectedId = id;
  try {
    renderDetail(champ);
  } catch (err) {
    console.error(err);
    dismissBlockingOverlays();
    state.selectedId = null;
    return;
  }
  renderGrid();

  els.detail.classList.add("open");
  els.detail.setAttribute("aria-hidden", "false");
  els.overlay.classList.remove("hidden");
}

function closeDetail({ refreshGrid = true } = {}) {
  if (state.view !== "champion-page") {
    state.selectedId = null;
  }
  dismissBlockingOverlays();
  if (refreshGrid && state.view === "champions") renderGrid();
}

const TACTIC_ORDER = [
  "lanePriority",
  "junglePath",
  "heraldDrake",
  "waveState",
  "midGame",
  "baronDrake",
  "teamfight",
  "vision",
  "winCondition",
];

const TACTIC_LABELS = {
  lanePriority: "Priorité de lane",
  junglePath: "Plan jungle early",
  heraldDrake: "Objectif early (14 min)",
  waveState: "Gestion de vague",
  midGame: "Mid game (15–25 min)",
  baronDrake: "Setup objectif late",
  teamfight: "Style teamfight",
  vision: "Vision & contrôle",
  winCondition: "Win condition",
};

const TACTIC_TEMPLATES = {
  drake: {
    our: { Top: "Ornn", Jungle: "Jarvan IV", Mid: "Orianna", Bot: "Jinx", Support: "Thresh" },
    enemy: { Top: "Aatrox", Jungle: "Vi", Mid: "Syndra", Bot: "Kai'Sa", Support: "Leona" },
  },
  scale: {
    our: { Top: "Kayle", Jungle: "Karthus", Mid: "Viktor", Bot: "Kog'Maw", Support: "Lulu" },
    enemy: { Top: "Malphite", Jungle: "Amumu", Mid: "Azir", Bot: "Jinx", Support: "Braum" },
  },
  pick: {
    our: { Top: "Camille", Jungle: "Lee Sin", Mid: "Syndra", Bot: "Kai'Sa", Support: "Pyke" },
    enemy: { Top: "Gnar", Jungle: "Graves", Mid: "Ahri", Bot: "Ezreal", Support: "Nautilus" },
  },
};

function verdictLabel(v) {
  if (v === "win") return '<span class="verdict win">Favorable</span>';
  if (v === "lose") return '<span class="verdict lose">Défavorable</span>';
  return '<span class="verdict even">Égal</span>';
}

const TACTICS_SLOT_ICONS = { Top: "▣", Jungle: "🔥", Mid: "⚡", Bot: "◎", Support: "✚" };
const DRAFT_STORAGE_KEY = "lol-draft-sessions-v1";

function syncDraftSessionsFromStorage() {
  try {
    if (window.LoLUserSession) {
      const draft = window.LoLUserSession.getDraft();
      state.draftSessions = (Array.isArray(draft.sessions) ? draft.sessions : []).map((s) =>
        window.LoLDraft.normalizeSession(s)
      );
      state.activeDraftId = draft.activeId || null;
      return;
    }
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      state.draftSessions = [];
      state.activeDraftId = null;
      return;
    }
    const parsed = JSON.parse(raw);
    state.draftSessions = (Array.isArray(parsed.sessions) ? parsed.sessions : []).map((s) =>
      window.LoLDraft.normalizeSession(s)
    );
    state.activeDraftId = parsed.activeId || null;
  } catch {
    state.draftSessions = [];
    state.activeDraftId = null;
  }
}

function getImportableDraftSession() {
  syncDraftSessionsFromStorage();
  if (!state.draftSessions.length) return null;
  let session = state.draftSessions.find((s) => s.id === state.activeDraftId);
  if (!session) {
    session = [...state.draftSessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  }
  return session;
}

function countCompPicks(comp) {
  return tacticsSlots().filter((s) => comp[s]).length;
}

function updateImportDraftButton() {
  const btn = els.importDraftTactics;
  if (!btn) return;
  const session = getImportableDraftSession();
  if (!session) {
    btn.disabled = true;
    btn.textContent = "Importer la draft";
    btn.title = "Aucune draft — crée-en une dans l’onglet Draft";
    return;
  }
  btn.disabled = false;
  const { ourComp, enemyComp } = window.LoLDraft.toComps(session);
  const picks = countCompPicks(ourComp) + countCompPicks(enemyComp);
  btn.textContent = `Importer ${session.name}`;
  btn.title = `${session.name} — ${picks} pick${picks !== 1 ? "s" : ""} enregistré${picks !== 1 ? "s" : ""}`;
}

function importDraftToTactics() {
  const session = getImportableDraftSession();
  if (!session) {
    if (els.tacticsFocusHint) {
      els.tacticsFocusHint.textContent = "Aucune draft trouvée. Utilise l’onglet Draft d’abord.";
    }
    return;
  }

  const { ourComp, enemyComp } = window.LoLDraft.toComps(session);
  Object.assign(state.ourComp, ourComp);
  Object.assign(state.enemyComp, enemyComp);
  state.tacticsFocus = null;
  renderTacticsDraft({ refreshPool: true });
  updateImportDraftButton();

  const ours = countCompPicks(state.ourComp);
  const theirs = countCompPicks(state.enemyComp);
  const complete = ours === 5 && theirs === 5;

  if (els.tacticsFocusHint) {
    els.tacticsFocusHint.textContent = complete
      ? `Draft « ${session.name} » importée — analyse en cours…`
      : `Draft « ${session.name} » importée (${ours}/5 · ${theirs}/5) — complète les lanes vides.`;
  }

  syncTacticsAdvice();
  scheduleUserSessionSave();
}

function tacticsSlots() {
  return window.LoLTactics?.SLOTS || ["Top", "Jungle", "Mid", "Bot", "Support"];
}

function tacticsComp(side) {
  return side === "our" ? state.ourComp : state.enemyComp;
}

function isTacticsCellFocused(side, slot) {
  const f = state.tacticsFocus;
  if (!f || f.side !== side) return false;
  return f.slot === slot;
}

function isTacticsSwapTarget(side, slot) {
  const f = state.tacticsFocus;
  if (f?.type !== "swap" || f.side !== side || f.slot === slot) return false;
  const comp = tacticsComp(side);
  return Boolean(comp[f.slot] || comp[slot]);
}

/** Sort/highlight slot: focused lane first, else explicit role chip. */
function tacticsPoolSortSlot() {
  const focusSlot =
    state.tacticsFocus?.type === "pick" && state.tacticsFocus.slot ? state.tacticsFocus.slot : null;
  const chipRole = state.tacticsPoolRole || "all";
  return focusSlot || (chipRole !== "all" ? chipRole : null);
}

function setTacticsPickFocus(side, slot, { resortPool = false } = {}) {
  state.tacticsFocus = { type: "pick", side, slot };
  syncTacticsSlotFocus();
  if (resortPool && els.tacticsPool?.querySelector(".draft-pool-grid")) {
    const { filtered, role, sortSlot } = getTacticsPoolFiltered();
    updateTacticsPoolGrid(els.tacticsPool, filtered, role, sortSlot, { preserveScroll: true });
  } else {
    syncTacticsPoolChrome();
  }
  syncTacticsFocusHint();
}

function swapTacticsSlots(side, slotA, slotB) {
  const comp = tacticsComp(side);
  const a = comp[slotA] || "";
  const b = comp[slotB] || "";
  comp[slotA] = b;
  comp[slotB] = a;
  state.tacticsFocus = null;
  renderTacticsDraft();
  syncTacticsAdvice();
  scheduleUserSessionSave();
}

function handleTacticsSlotClick(side, slot) {
  const comp = tacticsComp(side);
  const focus = state.tacticsFocus;

  if (focus?.type === "swap" && focus.side === side) {
    if (focus.slot === slot) {
      state.tacticsFocus = null;
    } else {
      swapTacticsSlots(side, focus.slot, slot);
      if (els.tacticsFocusHint) {
        els.tacticsFocusHint.textContent = `${side === "our" ? "Notre équipe" : "Adversaire"} · ${focus.slot} ↔ ${slot} échangés`;
      }
      return;
    }
    syncTacticsSlotFocus();
    syncTacticsFocusHint();
    syncTacticsPoolChrome();
    return;
  }

  if (comp[slot]) {
    state.tacticsFocus = { type: "swap", side, slot };
    syncTacticsSlotFocus();
    syncTacticsFocusHint();
    syncTacticsPoolChrome();
    return;
  }

  setTacticsPickFocus(side, slot, { resortPool: true });
}

function syncTacticsFocusHint() {
  if (!els.tacticsFocusHint) return;
  const f = state.tacticsFocus;
  if (!f) {
    els.tacticsFocusHint.textContent =
      "Lane vide → choisis un champion · case pleine → clic pour swap · clic droit = retirer";
    return;
  }
  const team = f.side === "our" ? "Notre équipe" : "Adversaire";
  if (f.type === "swap") {
    els.tacticsFocusHint.textContent = `${team} · ${f.slot} — clique un autre poste pour échanger (reclique pour annuler)`;
    return;
  }
  els.tacticsFocusHint.textContent = `${team} · ${f.slot} — choisis un champion dans la liste`;
}

function syncTacticsPoolChrome() {
  if (!els.tacticsPool) return;
  syncTacticsPoolFocus(els.tacticsPool);
  const { filtered, role, sortSlot } = getTacticsPoolFiltered();
  const countEl = els.tacticsPool.querySelector(".draft-pool-count");
  if (countEl) {
    countEl.textContent = `${filtered.length} dispo · ${tacticsPoolSortLabel(role, sortSlot)}`;
  }
  window.LoLPoolRoles?.syncRoleFilterChips(els.tacticsPool, role);
}

function refreshTacticsPoolGrid({ preserveScroll = true } = {}) {
  if (!els.tacticsPool?.querySelector(".draft-pool-grid")) return;
  const { filtered, role, sortSlot } = getTacticsPoolFiltered();
  updateTacticsPoolGrid(els.tacticsPool, filtered, role, sortSlot, { preserveScroll });
}

function syncTacticsSlotFocus() {
  for (const side of ["our", "enemy"]) {
    const container = side === "our" ? els.ourSlots : els.enemySlots;
    if (!container) continue;
    container.querySelectorAll("[data-tactics-side]").forEach((cell) => {
      const s = cell.dataset.tacticsSide;
      const sl = cell.dataset.tacticsSlot;
      cell.classList.toggle("draft-cell-focused", isTacticsCellFocused(s, sl));
      cell.classList.toggle("draft-cell-swap-target", isTacticsSwapTarget(s, sl));
    });
  }
}

function clearTacticsSlot(side, slot) {
  const comp = tacticsComp(side);
  const name = comp[slot];
  if (!name) return;
  comp[slot] = "";
  state.tacticsFocus = { type: "pick", side, slot };
  renderTacticsDraft();
  if (els.tacticsFocusHint) {
    els.tacticsFocusHint.textContent = `${name} retiré · ${side === "our" ? "Notre équipe" : "Adversaire"} · ${slot}`;
  }
  syncTacticsAdvice();
  scheduleUserSessionSave();
}

function assignTacticsChampion(name, { side: forcedSide, slot: forcedSlot } = {}) {
  if (state.tacticsFocus?.type === "swap" && !forcedSlot) return;

  if (forcedSide && forcedSlot) {
    state.tacticsFocus = { type: "pick", side: forcedSide, slot: forcedSlot };
  } else if (!state.tacticsFocus || state.tacticsFocus.type !== "pick") {
    const slots = tacticsSlots();
    for (const side of ["our", "enemy"]) {
      const comp = tacticsComp(side);
      const empty = slots.find((s) => !comp[s]);
      if (empty) {
        state.tacticsFocus = { type: "pick", side, slot: empty };
        break;
      }
    }
  }
  if (!state.tacticsFocus || state.tacticsFocus.type !== "pick") return;

  const { side, slot } = state.tacticsFocus;
  const champ = state.byName.get(name);
  const metaMap = tacticsMetaMap();
  const offMeta =
    window.LoLLaneViability && champ && !window.LoLLaneViability.playsSlot(champ, metaMap, slot);

  // Macro always honors the focused slot — flex/off-meta picks are allowed.
  const comp = tacticsComp(side);
  comp[slot] = name;
  const next = tacticsSlots().find((s) => !comp[s]);
  state.tacticsFocus = next ? { type: "pick", side, slot: next } : null;
  renderTacticsDraft();
  if (els.tacticsFocusHint) {
    const team = side === "our" ? "Notre équipe" : "Adversaire";
    const flexNote = offMeta ? ` · flex hors meta (< ${window.LoLLaneViability.MIN_LANE_RATE}%)` : "";
    els.tacticsFocusHint.textContent = next
      ? `${name} → ${slot}${flexNote} · ${team} · ${next} suivant`
      : `${name} → ${slot}${flexNote} · ${team} · comp complète`;
  }
  syncTacticsAdvice();
  scheduleUserSessionSave();
}

function getTacticsCompCompare() {
  if (!window.LoLDraft?.compareComps) return null;
  const metaMap = state.tacticsMeta?.champions || {};
  return window.LoLDraft.compareComps(state.ourComp, state.enemyComp, state.byName, metaMap);
}

function renderTacticsCompScoreHtml(comp) {
  if (!comp?.complete) {
    const our = comp?.ourCount ?? countCompPicks(state.ourComp);
    const en = comp?.enemyCount ?? countCompPicks(state.enemyComp);
    return `<div class="tactics-comp-score-inner tactics-comp-score-pending">
      <p class="tactics-comp-score-title">Score de comp</p>
      <p class="muted">Complète les deux équipes (5/5) pour générer le plan de match adapté à cette partie.
        <span class="tactics-comp-score-progress">Nous ${our}/5 · Adversaire ${en}/5</span></p>
    </div>`;
  }

  const ourPct = Math.round(comp.winProb.our * 100);
  const enemyPct = 100 - ourPct;
  const fav = ourPct >= enemyPct ? "our" : "enemy";

  const breakdownRow = (label, key) => {
    const o = comp.our.breakdown[key] ?? 0;
    const e = comp.enemy.breakdown[key] ?? 0;
    return `<tr><td>${label}</td><td class="num our-num">${o}</td><td class="num enemy-num">${e}</td></tr>`;
  };

  return `<div class="tactics-comp-score-inner${comp?.complete ? " tactics-comp-score-inner--ready" : ""}">
    <div class="tactics-comp-score-head">
      <span class="tactics-comp-score-kicker">Analyse draft</span>
      <p class="tactics-comp-score-title">Score synergie + familles</p>
    </div>
    <div class="tactics-comp-duel">
      <div class="tactics-comp-side our-team${fav === "our" ? " is-favored" : ""}">
        <span class="tactics-comp-label">Notre comp</span>
        <span class="tactics-comp-points">${comp.our.score}</span>
        <span class="tactics-comp-win">${ourPct}% victoire</span>
      </div>
      <div class="tactics-comp-vs">VS</div>
      <div class="tactics-comp-side enemy-team${fav === "enemy" ? " is-favored" : ""}">
        <span class="tactics-comp-label">Adversaire</span>
        <span class="tactics-comp-points">${comp.enemy.score}</span>
        <span class="tactics-comp-win">${enemyPct}% victoire</span>
      </div>
    </div>
    <div class="tactics-win-bar" role="img" aria-label="Probabilité victoire ${ourPct}% nous, ${enemyPct}% adversaire">
      <div class="tactics-win-bar-our" style="width:${ourPct}%"></div>
      <div class="tactics-win-bar-enemy" style="width:${enemyPct}%"></div>
    </div>
    <p class="tactics-comp-margin">Écart <strong>${comp.margin >= 0 ? "+" : ""}${comp.margin}</strong> · faveur ${fav === "our" ? "bleue" : "rouge"}</p>
    <div class="tactics-mtg-row tactics-mtg-row--score">
      ${mtgTeamPanelHtml(compPickNames(state.ourComp), "Identité couleur · nous")}
      ${mtgTeamPanelHtml(compPickNames(state.enemyComp), "Identité couleur · adversaire")}
    </div>
    <details class="tactics-comp-details">
      <summary>Détail du scoring (synergie + familles)</summary>
      <table class="tactics-comp-breakdown">
        <thead><tr><th>Axe</th><th>Nous</th><th>Ennemi</th></tr></thead>
        <tbody>
          ${breakdownRow("Synergie", "synergy")}
          ${breakdownRow("Familles", "family")}
        </tbody>
      </table>
    </details>
  </div>`;
}

function updateTacticsCompScore() {
  const el = els.tacticsCompScore;
  if (!el) return;
  const comp = getTacticsCompCompare();
  const filled = countCompPicks(state.ourComp) + countCompPicks(state.enemyComp);
  if (filled === 0) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = renderTacticsCompScoreHtml(comp);
}

function tacticsPoolSortLabel(role, sortSlot) {
  const PR = window.LoLPoolRoles;
  const filterLabel = PR ? PR.roleFilterLabel(role) : role;
  const sortLabel =
    sortSlot && sortSlot !== role && sortSlot !== "all"
      ? ` · tri ${PR?.SLOT_LABELS?.[sortSlot] || sortSlot}`
      : "";
  return `${filterLabel}${sortLabel} · tier`;
}

function renderTacticsPoolGrid(champions, sortSlot) {
  const PR = window.LoLPoolRoles;
  const metaMap = state.tacticsMeta?.champions || {};
  const slot = sortSlot && sortSlot !== "all" ? sortSlot : null;
  return champions
    .map((c) => {
      const laneScore = slot && PR ? PR.laneScore(c, slot, metaMap) : 0;
      const lanePick = slot && laneScore >= 10;
      const flexPick = slot && !lanePick;
      const cardClass = lanePick
        ? " draft-pool-card--lane"
        : flexPick
          ? " draft-pool-card--offlane"
          : "";
      const titleExtra = slot
        ? lanePick
          ? ` · viable ${slot}`
          : ` · flex ${slot} (<10%)`
        : "";
      return `
      <button type="button" class="draft-pool-card${cardClass}" draggable="true" data-champ="${escapeHtml(c.name)}" title="${escapeHtml(c.name)}${titleExtra}">
        ${championIconHtml(c, { size: "pool" })}
        <span class="draft-pool-name">${escapeHtml(c.name)}</span>
        ${c.tierMeta ? `<span class="draft-pool-tier tier-${c.tierMeta.toLowerCase()}">${c.tierMeta}</span>` : ""}
      </button>`;
    })
    .join("");
}

function isTacticsCompComplete() {
  return countCompPicks(state.ourComp) === 5 && countCompPicks(state.enemyComp) === 5;
}

/** Conseils macro dynamiques — uniquement quand les deux comps sont complètes (5/5). */
function syncTacticsAdvice() {
  [els.tacticsCoachNotes, els.tacticsCoachNotesMain].forEach((el) => {
    if (!el) return;
    el.classList.add("hidden");
    el.innerHTML = "";
  });

  if (!isTacticsCompComplete()) {
    els.tacticsResult?.classList.add("hidden");
    if (els.tacticsResult) els.tacticsResult.innerHTML = "";
    return;
  }

  runTacticsAnalysis();
}

function getActiveSidebar() {
  const map = {
    champions: els.sidebarChampions,
    patch: els.sidebarPatch,
    tactics: els.sidebarTactics,
  };
  return map[state.view] || null;
}

function dismissBlockingOverlays() {
  els.detail?.classList.remove("open");
  els.detail?.setAttribute("aria-hidden", "true");
  els.overlay?.classList.add("hidden");
  els.sidebarBackdrop?.classList.add("hidden");
  els.sidebarBackdrop?.classList.remove("visible");
  getActiveSidebar()?.classList.remove("sidebar-open");
  els.filterToggle?.setAttribute("aria-expanded", "false");
}

function ensureUiInteractive() {
  const detailOpen = els.detail?.classList.contains("open");
  const overlayVisible = els.overlay && !els.overlay.classList.contains("hidden");
  if (overlayVisible && !detailOpen) {
    els.overlay.classList.add("hidden");
  }

  const drawerOpen = getActiveSidebar()?.classList.contains("sidebar-open");
  const backdropVisible = els.sidebarBackdrop && !els.sidebarBackdrop.classList.contains("hidden");
  if (backdropVisible && !drawerOpen) {
    els.sidebarBackdrop.classList.add("hidden");
    els.sidebarBackdrop.classList.remove("visible");
    els.filterToggle?.setAttribute("aria-expanded", "false");
  }
}

function closeFilterDrawer() {
  getActiveSidebar()?.classList.remove("sidebar-open");
  els.sidebarBackdrop?.classList.add("hidden");
  els.sidebarBackdrop?.classList.remove("visible");
  els.filterToggle?.setAttribute("aria-expanded", "false");
}

function openFilterDrawer() {
  const sidebar = getActiveSidebar();
  if (!sidebar || sidebar.classList.contains("hidden")) return;
  sidebar.classList.add("sidebar-open");
  els.sidebarBackdrop?.classList.remove("hidden");
  requestAnimationFrame(() => els.sidebarBackdrop?.classList.add("visible"));
  els.filterToggle?.setAttribute("aria-expanded", "true");
}

function updateFilterButtonVisibility(view) {
  const hasSidebar = ["champions", "patch", "tactics"].includes(view);
  els.filterToggle?.classList.toggle("hidden", !hasSidebar || view === "mtg-colors");
}

function getTacticsPoolFiltered() {
  const PR = window.LoLPoolRoles;
  const searchQuery = state.tacticsPoolSearch || "";
  const chipRole = state.tacticsPoolRole || "all";
  const sortSlot = tacticsPoolSortSlot();
  const metaMap = state.tacticsMeta?.champions || {};
  const q = searchQuery.toLowerCase();
  let filtered = state.champions.filter((c) => {
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.nameEn || "").toLowerCase().includes(q);
  });
  if (PR && chipRole !== "all") {
    filtered = PR.filterByRole(filtered, chipRole, metaMap);
  }
  if (PR) {
    filtered = PR.sortPool(filtered, { sortSlot, tierRank, metaMap });
  }
  return { searchQuery, filtered, role: chipRole, sortSlot };
}

function tacticsPoolActionText() {
  const focus = state.tacticsFocus;
  if (focus?.type === "swap") {
    return `${focus.side === "our" ? "Notre" : "Adversaire"} · swap ${focus.slot} → clique un autre poste`;
  }
  if (focus?.type === "pick") {
    return `${focus.side === "our" ? "Notre" : "Adversaire"} · ${focus.slot} → choisis un champion`;
  }
  return "Clique une lane ci-dessus, puis un champion";
}

function bindTacticsPoolEvents(el) {
  if (el.dataset.tacticsPoolBound === "1") return;
  el.dataset.tacticsPoolBound = "1";
  el.addEventListener("input", (e) => {
    if (e.target.id !== "tactics-pool-search") return;
    state.tacticsPoolSearch = e.target.value;
    renderTacticsPool({ gridOnly: true });
  });
  el.addEventListener("click", (e) => {
    const roleChip = e.target.closest(".pool-role-chip");
    if (roleChip && el.contains(roleChip)) {
      state.tacticsPoolRole = roleChip.dataset.poolRole || "all";
      window.LoLPoolRoles?.syncRoleFilterChips(el, state.tacticsPoolRole);
      renderTacticsPool({ gridOnly: true });
      scheduleUserSessionSave();
      return;
    }
    const link = e.target.closest(".alpha-jump-link");
    if (link && el.contains(link)) {
      e.preventDefault();
      return;
    }
    const btn = e.target.closest(".draft-pool-card");
    if (btn && el.contains(btn)) {
      e.preventDefault();
      assignTacticsChampion(btn.dataset.champ);
    }
  });
}

function bindTacticsDragDrop() {
  if (document.body.dataset.tacticsDragBound === "1") return;
  document.body.dataset.tacticsDragBound = "1";

  let dragChamp = null;

  document.addEventListener("dragstart", (e) => {
    const card = e.target.closest("#tactics-pool .draft-pool-card");
    if (!card) return;
    dragChamp = card.dataset.champ;
    e.dataTransfer.setData("text/champion", dragChamp);
    e.dataTransfer.effectAllowed = "copy";
  });

  for (const container of [els.ourSlots, els.enemySlots]) {
    if (!container) continue;
    container.addEventListener("dragover", (e) => {
      const cell = e.target.closest("[data-tactics-slot]");
      if (!cell || !dragChamp) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      container.querySelectorAll(".draft-cell-drop-target").forEach((c) => c.classList.remove("draft-cell-drop-target"));
      cell.classList.add("draft-cell-drop-target");
    });
    container.addEventListener("dragleave", (e) => {
      const cell = e.target.closest("[data-tactics-slot]");
      if (cell) cell.classList.remove("draft-cell-drop-target");
    });
    container.addEventListener("drop", (e) => {
      const cell = e.target.closest("[data-tactics-slot]");
      container.querySelectorAll(".draft-cell-drop-target").forEach((c) => c.classList.remove("draft-cell-drop-target"));
      const name = e.dataTransfer.getData("text/champion") || dragChamp;
      if (!cell || !name) return;
      e.preventDefault();
      assignTacticsChampion(name, {
        side: cell.dataset.tacticsSide,
        slot: cell.dataset.tacticsSlot,
      });
      dragChamp = null;
    });
  }
}

function syncTacticsPoolFocus(el) {
  const actionEl = el.querySelector(".draft-pool-action");
  if (!actionEl) return;
  actionEl.textContent = tacticsPoolActionText();
  actionEl.classList.toggle("focus-ready", state.tacticsFocus?.type === "pick");
}

function updateTacticsPoolGrid(el, filtered, role, sortSlot, { preserveScroll = false } = {}) {
  const countEl = el.querySelector(".draft-pool-count");
  if (countEl) {
    countEl.textContent = `${filtered.length} dispo · ${tacticsPoolSortLabel(role, sortSlot)}`;
  }
  window.LoLPoolRoles?.syncRoleFilterChips(el, role);

  const gridEl = el.querySelector(".draft-pool-grid");
  if (gridEl) {
    const scrollTop = preserveScroll ? gridEl.scrollTop : 0;
    gridEl.innerHTML = filtered.length
      ? renderTacticsPoolGrid(filtered, sortSlot)
      : `<p class="muted draft-pool-empty">Aucun champion trouvé${role && role !== "all" ? " pour ce poste" : ""}.</p>`;
    if (preserveScroll) gridEl.scrollTop = scrollTop;
  }
}

function renderTacticsPool({ gridOnly = false } = {}) {
  const el = els.tacticsPool;
  if (!el) return;

  const { searchQuery, filtered, role, sortSlot } = getTacticsPoolFiltered();

  if (gridOnly && el.querySelector("#tactics-pool-search")) {
    updateTacticsPoolGrid(el, filtered, role, sortSlot, { preserveScroll: true });
    syncTacticsPoolFocus(el);
    return;
  }

  const focus = state.tacticsFocus;
  const actionText = tacticsPoolActionText();
  const roleFilters = window.LoLPoolRoles?.renderRoleFilterChips(role) || "";

  el.innerHTML = `
    <div class="draft-pool-header">
      <h2 class="draft-pool-title">Champions</h2>
      <span class="draft-pool-count">${filtered.length} dispo · ${tacticsPoolSortLabel(role, sortSlot)}</span>
    </div>
    <p class="draft-pool-lead muted">Tous les champions restent visibles · lane focusée = tri + pick sur ce poste (flex OK) · glisser-déposer · filtre optionnel · build ${escapeHtml(window.LoLSiteConfig?.APP_BUILD || "?")}.</p>
    <div class="draft-pool-action${focus?.type === "pick" ? " focus-ready" : ""}">${escapeHtml(actionText)}</div>
    ${roleFilters}
    <div class="draft-pool-toolbar">
      <input type="search" class="draft-pool-search" placeholder="Rechercher…" value="${escapeHtml(searchQuery)}" id="tactics-pool-search" />
    </div>
    <div class="draft-pool-grid draft-pool-grid-alpha">
      ${filtered.length ? renderTacticsPoolGrid(filtered, sortSlot) : `<p class="muted draft-pool-empty">Aucun champion trouvé${role && role !== "all" ? " pour ce poste" : ""}.</p>`}
    </div>
  `;

  bindTacticsPoolEvents(el);
}

function renderTacticsSlotGrid(side, container, comp) {
  const slots = tacticsSlots();
  container.innerHTML = slots
    .map((slot) => {
      const name = comp[slot];
      const champ = name ? state.byName.get(name) : null;
      const focused = isTacticsCellFocused(side, slot);
      const swapTarget = isTacticsSwapTarget(side, slot);
      return `
        <button type="button"
          class="draft-cell draft-pick-cell tactics-slot-cell${name ? " filled" : " empty"}${focused ? " draft-cell-focused" : ""}${swapTarget ? " draft-cell-swap-target" : ""}"
          data-tactics-side="${side}" data-tactics-slot="${slot}"
          aria-label="${side === "our" ? "Notre" : "Adversaire"} ${slot}${name ? ` : ${name}` : ""}">
          <span class="draft-cell-tag">${TACTICS_SLOT_ICONS[slot]} ${slot}</span>
          ${
            champ
              ? championIconHtml(champ, { size: "draft" })
              : `<span class="draft-cell-plus">+</span>`
          }
          <span class="draft-cell-name">${name ? escapeHtml(champ?.name || name) : ""}</span>
        </button>`;
    })
    .join("");

  container.querySelectorAll("[data-tactics-side]").forEach((cell) => {
    cell.addEventListener("click", () => {
      handleTacticsSlotClick(cell.dataset.tacticsSide, cell.dataset.tacticsSlot);
    });
    cell.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const side = cell.dataset.tacticsSide;
      const slot = cell.dataset.tacticsSlot;
      if (!comp[slot]) return;
      clearTacticsSlot(side, slot);
    });
  });
}

function renderTacticsDraft({ refreshPool = false } = {}) {
  renderTacticsSlotGrid("our", els.ourSlots, state.ourComp);
  renderTacticsSlotGrid("enemy", els.enemySlots, state.enemyComp);
  const poolReady = Boolean(els.tacticsPool?.querySelector(".draft-pool-grid"));
  if (refreshPool || !poolReady) {
    renderTacticsPool();
  } else {
    refreshTacticsPoolGrid({ preserveScroll: true });
    syncTacticsPoolFocus(els.tacticsPool);
  }
  updateTacticsCompScore();
  syncTacticsFocusHint();
}

function applyTacticTemplate(key) {
  const t = TACTIC_TEMPLATES[key];
  if (!t) return;
  Object.assign(state.ourComp, t.our);
  Object.assign(state.enemyComp, t.enemy);
  renderTacticsDraft({ refreshPool: true });
  syncTacticsAdvice();
  scheduleUserSessionSave();
}

function renderItemCategorySelect(slotRec) {
  const T = window.LoLTactics;
  const order = [
    T?.ITEM_CATEGORY?.PLAYER,
    T?.ITEM_CATEGORY?.AD,
    T?.ITEM_CATEGORY?.AP,
    T?.ITEM_CATEGORY?.AS,
    T?.ITEM_CATEGORY?.ARMOR,
    T?.ITEM_CATEGORY?.MR,
    T?.ITEM_CATEGORY?.HP,
  ].filter(Boolean);
  const labels = T?.ITEM_CATEGORY_LABELS || {};
  const selected = slotRec.label;
  const opts = order
    .map((key) => labels[key])
    .filter(Boolean)
    .map(
      (label) =>
        `<option value="${escapeHtml(label)}"${label === selected ? " selected" : ""}>${escapeHtml(label)}</option>`
    )
    .join("");
  return `<select class="tactics-item-select" disabled title="${escapeHtml(slotRec.reason || "")}">${opts}</select>`;
}

function renderItemGuideTable(guides, teamLabel, teamClass) {
  if (!guides?.length) return "";

  const rows = guides
    .map((guide) => {
      const champ = state.byName.get(guide.champion);
      const champCell = `
        <td>
          <div class="tactics-item-champ">
            ${champ ? championIconHtml(champ, { size: "coach" }) : ""}
            <div class="tactics-item-champ-meta">
              <strong>${escapeHtml(guide.champion)}</strong>
              <span>${escapeHtml(guide.laneSlot)}</span>
            </div>
          </div>
        </td>`;
      const itemCells = guide.slots
        .map((slotRec) => `<td>${renderItemCategorySelect(slotRec)}</td>`)
        .join("");
      return `<tr class="tactics-item-row">${champCell}${itemCells}</tr>`;
    })
    .join("");

  return `
    <div class="tactics-item-team ${teamClass}">
      <h4 class="tactics-item-team-title">${escapeHtml(teamLabel)}</h4>
      <div class="tactics-item-table-wrap">
        <table class="tactics-item-table">
          <thead>
            <tr>
              <th>Champion</th>
              <th>1er Objet</th>
              <th>2e Objet</th>
              <th>3e Objet</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderTacticsItemGuidesSection(itemGuides) {
  if (!itemGuides?.our?.length) return "";

  return `
    <section class="tactics-block tactics-items-block">
      <h3>Objets (écran Tactiques in-game)</h3>
      <p class="tactics-items-hint">
        Catégories à régler pour chaque champion — adaptées au profil, aux matchups lane et aux compositions alliée / ennemie.
        Survole une option pour voir le détail.
      </p>
      ${renderItemGuideTable(itemGuides.our, "Notre équipe", "our-team")}
      ${
        itemGuides.enemy?.length
          ? renderItemGuideTable(itemGuides.enemy, "Adversaire (builds probables)", "enemy-team")
          : ""
      }
    </section>`;
}

function renderTacticAssignees(assignees) {
  if (!assignees?.length) return "";
  return `<div class="tactic-assign">${assignees
    .map((a) => {
      const champ = state.byName.get(a.name);
      const icon = champ ? championIconHtml(champ, { size: "coach" }) : "";
      return `<span class="tactic-assign-chip">${icon}<span>${escapeHtml(a.name)} <em>(${escapeHtml(a.slot)})</em></span></span>`;
    })
    .join("")}</div>`;
}

function renderTacticValueCell(t) {
  return `<strong>${escapeHtml(t.value)}</strong>${renderTacticAssignees(t.assign)}`;
}

function renderRolePhaseBlock(label, items, mod) {
  if (!items?.length) return "";
  return `<div class="tactics-role-phase tactics-role-phase--${mod}">
    <h4 class="tactics-role-phase-title">${escapeHtml(label)}</h4>
    <ul class="tactics-role-list">${items.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
  </div>`;
}

function renderRoleAdviceSection(roleAdvice) {
  if (!roleAdvice?.slots) return "";
  const slots = window.LoLTactics?.SLOTS || tacticsSlots();
  const cards = slots
    .map((slot) => {
      const r = roleAdvice.slots[slot];
      if (!r?.champion) return "";
      const champ = state.byName.get(r.champion);
      const verdictCls = r.matchupVerdict === "win" ? "win" : r.matchupVerdict === "lose" ? "lose" : "even";
      const icon = TACTICS_SLOT_ICONS[slot] || "";
      const slotKey = slot.toLowerCase();
      return `<article class="tactics-role-card tactics-role-card--${slotKey}">
        <header class="tactics-role-head">
          <div class="tactics-role-identity">
            ${champ ? championIconHtml(champ, { size: "draft" }) : ""}
            <div class="tactics-role-identity-text">
              <div class="tactics-role-head-top">
                <span class="tactics-role-slot">${icon} ${escapeHtml(r.slotLabel || slot)}</span>
                <span class="tactics-role-verdict verdict ${verdictCls}">${r.matchupVerdict === "win" ? "Lane +" : r.matchupVerdict === "lose" ? "Lane −" : "Lane ="}</span>
              </div>
              <strong class="tactics-role-champ">${escapeHtml(r.champion)}</strong>
              <span class="tactics-role-label">${escapeHtml(r.roleLabel)}</span>
            </div>
          </div>
          ${r.matchupNote ? `<p class="tactics-role-matchup">${escapeHtml(r.matchupNote)}</p>` : ""}
        </header>
        <div class="tactics-role-phases">
          ${renderRolePhaseBlock("Early · 0–14 min", r.early, "early")}
          ${renderRolePhaseBlock("Mid · 15–25 min", r.mid, "mid")}
          ${renderRolePhaseBlock("Teamfight & objectifs", r.teamfight, "tf")}
        </div>
        ${r.avoid?.length ? `<p class="tactics-role-avoid"><strong>Éviter</strong> ${escapeHtml(r.avoid.join(" · "))}</p>` : ""}
      </article>`;
    })
    .join("");

  return `<section class="tactics-block tactics-roles-block tactics-plan-panel">
    <div class="tactics-plan-panel-head">
      <h3>Conseils par joueur</h3>
      <p class="tactics-roles-hint">Comp <strong class="tactics-comp-badge">${escapeHtml(roleAdvice.compTypeLabel || "détectée")}</strong> — early, mid et late par poste.</p>
    </div>
    <div class="tactics-role-grid">${cards}</div>
  </section>`;
}

function runTacticsAnalysis() {
  const slots = window.LoLTactics?.SLOTS || [];
  const missing = slots.filter((s) => !state.ourComp[s] || !state.enemyComp[s]);
  if (missing.length) {
    els.tacticsResult.classList.remove("hidden");
    updateTacticsCompScore();
    els.tacticsResult.innerHTML = `<div class="tactics-alert">Complète toutes les lanes (${missing.join(", ")} manquant).</div>`;
    return;
  }

  const metaMap = state.tacticsMeta?.champions || {};
  const result = window.LoLTactics.recommend(state.ourComp, state.enemyComp, metaMap, state.byName);

  const laneRows = slots
    .map(
      (s) => `
    <tr>
      <td>${s}</td>
      <td>${escapeHtml(state.ourComp[s])}</td>
      <td>${verdictLabel(result.lanes[s]?.verdict)}</td>
      <td>${escapeHtml(state.enemyComp[s])}</td>
      <td class="lane-note">${escapeHtml(result.lanes[s]?.note || "")}</td>
    </tr>`
    )
    .join("");

  const tacticRows = TACTIC_ORDER.map((key) => {
    const t = result.tactics[key] || { value: "—", reason: "—", assign: [] };
    const label = TACTIC_LABELS[key] || key;
    return `
    <tr>
      <td class="tactic-name">${label}</td>
      <td class="tactic-value">${renderTacticValueCell(t)}</td>
      <td class="tactic-reason">${escapeHtml(t.reason)}</td>
    </tr>`;
  }).join("");

  const avoidHtml = result.avoid.length
    ? `<section class="tactics-block tactics-avoid">
        <h3>À éviter</h3>
        <ul>${result.avoid.map((a) => `<li><strong>${escapeHtml(a.setting)}</strong> — ${escapeHtml(a.why)}</li>`).join("")}</ul>
      </section>`
    : "";

  const buildsHtml = result.itemGuides ? renderTacticsItemGuidesSection(result.itemGuides) : "";
  const roleAdviceHtml = renderRoleAdviceSection(result.roleAdvice);

  els.tacticsResult.classList.remove("hidden");
  updateTacticsCompScore();
  els.tacticsResult.innerHTML = `
    <header class="tactics-result-header tactics-plan-hero">
      <div class="tactics-plan-hero-main">
        <span class="tactics-plan-kicker">Plan de match</span>
        <h2>Macro &amp; objectifs</h2>
        ${
          result.tactics.compTypeLabel
            ? `<p class="tactics-comp-type"><span class="tactics-comp-type-label">Type de comp</span> <span class="tactics-comp-badge">${escapeHtml(result.tactics.compTypeLabel)}</span></p>`
            : ""
        }
        <p class="win-plan">${result.winPlan.map((p) => escapeHtml(p)).join(" · ")}</p>
      </div>
    </header>

    ${roleAdviceHtml}

    <section class="tactics-block">
      <h3>Matchups par lane</h3>
      <table class="tactics-table lane-table">
        <thead><tr><th>Lane</th><th>Nous</th><th></th><th>Ennemi</th><th>Notes</th></tr></thead>
        <tbody>${laneRows}</tbody>
      </table>
    </section>

    <details class="tactics-block tactics-settings-details">
      <summary>Réglages écran Tactiques (optionnel)</summary>
      <table class="tactics-table settings-table">
        <thead><tr><th>Option</th><th>Choix</th><th>Pourquoi</th></tr></thead>
        <tbody>${tacticRows}</tbody>
      </table>
    </details>

    ${avoidHtml}
    ${buildsHtml}
  `;

  els.tacticsResult.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setupTactics() {
  bindTacticsDragDrop();
  updateImportDraftButton();
  renderTacticsDraft({ refreshPool: true });
  syncTacticsAdvice();
  els.importDraftTactics?.addEventListener("click", importDraftToTactics);
  els.analyzeTactics?.addEventListener("click", runTacticsAnalysis);
  els.clearTactics?.addEventListener("click", () => {
    for (const s of tacticsSlots()) {
      state.ourComp[s] = "";
      state.enemyComp[s] = "";
    }
    state.tacticsFocus = null;
    state.tacticsPoolSearch = "";
    state.tacticsPoolRole = "all";
    renderTacticsDraft({ refreshPool: true });
    syncTacticsAdvice();
    scheduleUserSessionSave();
  });
  document.querySelectorAll(".template-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyTacticTemplate(btn.dataset.template));
  });
}

function setView(view) {
  if (view !== "champion-page" && view !== "mtg-colors") {
    state.championPageId = null;
  }

  dismissBlockingOverlays();
  if (view !== "champion-page" && view !== "mtg-colors") {
    state.selectedId = null;
  }

  state.view = view;

  document.querySelector(".app")?.classList.toggle("draft-focus", view === "draft");
  document.querySelector(".app")?.classList.toggle("tactics-focus", view === "tactics");
  document.querySelector(".app")?.classList.toggle("champion-page-focus", view === "champion-page");
  document.querySelector(".app")?.classList.toggle("mtg-guide-focus", view === "mtg-colors");

  els.viewChampions.classList.toggle("hidden", view !== "champions");
  els.viewChampionPage.classList.toggle("hidden", view !== "champion-page");
  els.viewMtgColors?.classList.toggle("hidden", view !== "mtg-colors");
  els.viewDraft.classList.toggle("hidden", view !== "draft");
  els.viewTactics.classList.toggle("hidden", view !== "tactics");
  els.viewPatch.classList.toggle("hidden", view !== "patch");
  els.sidebarChampions.classList.toggle("hidden", view !== "champions");
  els.sidebarPatch.classList.toggle("hidden", view !== "patch");
  els.sidebarDraft.classList.add("hidden");
  els.sidebarTactics.classList.toggle("hidden", view !== "tactics");
  els.headerSearchWrap.classList.toggle("hidden", view !== "champions");

  const navView =
    view === "champion-page" || view === "mtg-colors"
      ? state.mtgGuideReturnView || "champions"
      : view;
  els.navTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === navView);
  });
  els.tabBarItems?.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === navView);
  });

  updateFilterButtonVisibility(view);

  if (view === "patch") renderPatchTable();
  if (view === "draft" && window.LoLDraftUI) window.LoLDraftUI.onViewShow();
  if (view === "tactics") {
    updateImportDraftButton();
    renderTacticsDraft({ refreshPool: true });
    syncTacticsAdvice();
  }
  if (view === "mtg-colors") {
    window.MtgColorsGuide?.renderPage(els.mtgColorsGuideContent);
  }

  ensureUiInteractive();
}

function setupFilters(container, attr, stateKey) {
  container?.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;

    container.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state[stateKey] = chip.dataset[attr];
    syncMobileSelect(stateKey);
    renderGrid();
    scheduleUserSessionSave();
    if (window.matchMedia("(max-width: 900px)").matches) closeFilterDrawer();
  });
}

function navigateToView(view) {
  history.pushState({ view }, "", view === "champions" ? "#" : `#${view}`);
  setView(view);
}

function setupNavigation() {
  els.navTabs.forEach((tab) => {
    tab.addEventListener("click", () => navigateToView(tab.dataset.view));
  });
  els.tabBarItems?.forEach((tab) => {
    tab.addEventListener("click", () => navigateToView(tab.dataset.view));
  });
  els.filterToggle?.addEventListener("click", () => {
    const sidebar = getActiveSidebar();
    if (sidebar?.classList.contains("sidebar-open")) closeFilterDrawer();
    else openFilterDrawer();
  });
  els.sidebarClose?.addEventListener("click", closeFilterDrawer);
  els.sidebarBackdrop?.addEventListener("click", closeFilterDrawer);
}

function syncFilterChips(container, attr, value) {
  container.querySelectorAll(".chip").forEach((c) => {
    c.classList.toggle("active", c.dataset[attr] === value || (value === "all" && c.dataset[attr] === "all"));
  });
}

function syncMobileSelect(stateKey) {
  const map = {
    slotFilter: "mobile-slot",
    typeFilter: "mobile-type",
    tierFilter: "mobile-tier",
    familyFilter: "mobile-family",
    compFilter: "mobile-comp",
    colorFilter: "mobile-color",
  };
  const el = document.getElementById(map[stateKey]);
  if (el) el.value = state[stateKey];
}

function setupKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (getActiveSidebar()?.classList.contains("sidebar-open")) {
        closeFilterDrawer();
        return;
      }
      if (els.detail?.classList.contains("open")) {
        closeDetail();
        return;
      }
      if (state.view === "champion-page") {
        closeChampionPage();
        return;
      }
      if (state.view === "mtg-colors") {
        closeMtgColorsGuide();
        return;
      }
      if (state.view === "tactics" && state.tacticsFocus) {
        state.tacticsFocus = null;
        syncTacticsSlotFocus();
        syncTacticsFocusHint();
        syncTacticsPoolChrome();
        return;
      }
      ensureUiInteractive();
      return;
    }
    if (e.key === "/" && state.view === "champions" && document.activeElement !== els.search) {
      e.preventDefault();
      els.search.focus();
    }
  });
}

function showAppStatus(message, type = "info") {
  const el = document.getElementById("app-status");
  if (!el) return;
  if (!message) {
    el.classList.add("hidden");
    el.textContent = "";
    el.dataset.type = "";
    return;
  }
  el.textContent = message;
  el.dataset.type = type;
  el.classList.remove("hidden");
}

function showInitError(err) {
  const hint =
    location.protocol === "file:"
      ? "Ouvre le site via un serveur local : python -m http.server 8081 --directory public"
      : "Vérifie que le serveur sert bien le dossier public/ (voir README).";
  const msg = err?.message || String(err);
  showAppStatus(`${msg} — ${hint}`, "error");
  if (els.championsHeroMain) {
    els.championsHeroMain.innerHTML = `<div class="hero-panel hero-panel--default"><p class="hero-lead">Impossible de charger les champions. ${escapeHtml(hint)}</p></div>`;
  }
  els.grid.innerHTML = `<div class="empty-state"><p>Données indisponibles.</p><p class="muted">${escapeHtml(hint)}</p></div>`;
  els.empty?.classList.add("hidden");
  if (els.galleryCountLabel) els.galleryCountLabel.textContent = "—";
  if (els.countLabel) els.countLabel.textContent = "— champions";
}

function applyChampionDataset(data, { full = false } = {}) {
  if (!Array.isArray(data.champions)) throw new Error("Format champions invalide");
  state.baseChampions = data.champions;
  state.patchConfig = window.LoLPatch.load(state.baseChampions);
  if (data.version && (!state.patchConfig.label || state.patchConfig.label === "Patch actuel")) {
    state.patchConfig.label = `Patch ${data.version}`;
    if (els.patchNameInput) els.patchNameInput.value = state.patchConfig.label;
  }
  rebuildEffectiveChampions();
  CHAMP_NAMES_SORTED.length = 0;
  CHAMP_NAMES_SORTED.push(...state.champions.map((c) => c.name).sort((a, b) => b.length - a.length));
  if (full) state.fullChampionsReady = true;
}

function renderChampionsUI() {
  buildFamilyFilterUI();
  buildColorFilterUI();
  renderChampionsHero();
  renderFamilyStats();
  renderGrid();
  updatePatchStats();
}

async function loadSecondaryAssets() {
  try {
    const [itemsRes, tacticsRes, mtgRes] = await Promise.all([
      fetch("data/items.json"),
      fetch("data/tactics-meta.json"),
      fetch("data/mtg-colors.json"),
    ]);

    if (itemsRes.ok) {
      const itemsData = await itemsRes.json();
      state.items = itemsData.items || [];
      state.byItemName.clear();
      state.items.forEach((i) => state.byItemName.set(i.name, i));
      ITEM_NAMES_SORTED.length = 0;
      ITEM_NAMES_SORTED.push(...state.items.map((i) => i.name).sort((a, b) => b.length - a.length));
    }

    if (tacticsRes.ok) {
      state.tacticsMeta = await tacticsRes.json();
      syncTacticsAdvice();
      buildFamilyFilterUI();
      if (state.view === "champions") renderFamilyStats();
    }

    if (mtgRes.ok) {
      initMtgMeta(await mtgRes.json());
    }
  } catch (err) {
    console.warn("Secondary assets load failed", err);
  }
}

async function loadFullChampionsInBackground() {
  try {
    const res = await fetch("data/champions.json");
    if (!res.ok) return;
    const data = await res.json();
    applyChampionDataset(data, { full: true });
    if (state.view === "champions") renderGrid();
    if (state.selectedId) {
      const champ = state.champions.find((c) => c.id === state.selectedId);
      if (champ) {
        if (state.view === "champion-page") renderChampionPage(champ);
        else if (els.detail?.classList.contains("open")) renderDetail(champ);
      }
    }
    updatePatchStats();
  } catch (err) {
    console.warn("Full champions load failed", err);
  }
}

async function init() {
  applyUserSessionToState();
  setupNavigation();
  els.grid?.addEventListener("click", (e) => {
    const card = e.target.closest(".champion-card");
    if (!card?.dataset.id) return;
    openDetail(card.dataset.id);
  });
  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 901px)").matches) {
      closeFilterDrawer();
      ensureUiInteractive();
    }
  });
  window.addEventListener("pageshow", ensureUiInteractive);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") ensureUiInteractive();
    else persistUserSession();
  });
  window.addEventListener("beforeunload", persistUserSession);
  showAppStatus("Chargement des champions…", "loading");

  try {
    const indexRes = await fetch("data/champions-index.json");
    if (indexRes.ok) {
      applyChampionDataset(await indexRes.json());
      renderChampionsUI();
      setupPatchUI();
      markPatchSaved();
      showAppStatus("");
      persistUserSession();
      loadFullChampionsInBackground();
      loadSecondaryAssets();
    } else {
      const [champRes, itemsRes, tacticsRes, mtgRes] = await Promise.all([
        fetch("data/champions.json"),
        fetch("data/items.json"),
        fetch("data/tactics-meta.json"),
        fetch("data/mtg-colors.json"),
      ]);
      if (!champRes.ok) throw new Error(`Champions HTTP ${champRes.status}`);
      applyChampionDataset(await champRes.json(), { full: true });

      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        state.items = itemsData.items || [];
        state.items.forEach((i) => state.byItemName.set(i.name, i));
        ITEM_NAMES_SORTED.push(...state.items.map((i) => i.name).sort((a, b) => b.length - a.length));
      }
      if (tacticsRes.ok) {
        state.tacticsMeta = await tacticsRes.json();
        syncTacticsAdvice();
      }
      if (mtgRes.ok) {
        initMtgMeta(await mtgRes.json());
      }

      renderChampionsUI();
      setupPatchUI();
      markPatchSaved();
      showAppStatus("");
      persistUserSession();
    }
  } catch (err) {
    console.error(err);
    showInitError(err);
  }

  setupFilters(els.slotFilters, "slot", "slotFilter");
  setupFilters(els.typeFilters, "type", "typeFilter");
  setupFilters(els.tierFilters, "tier", "tierFilter");
  setupColorFilters();
  setupMtgColorGuideNav();
  setupFilters(els.familyFilters, "family", "familyFilter");
  setupFilters(els.compFilters, "comp", "compFilter");
  syncUiControlsFromSession();
  els.search.addEventListener("input", (e) => {
    state.search = e.target.value;
    renderGrid();
    scheduleUserSessionSave();
  });
  document.getElementById("mobile-slot")?.addEventListener("change", (e) => {
    state.slotFilter = e.target.value;
    syncFilterChips(els.slotFilters, "slot", state.slotFilter);
    renderGrid();
    scheduleUserSessionSave();
  });
  document.getElementById("mobile-type")?.addEventListener("change", (e) => {
    state.typeFilter = e.target.value;
    syncFilterChips(els.typeFilters, "type", state.typeFilter);
    renderGrid();
    scheduleUserSessionSave();
  });
  document.getElementById("mobile-tier")?.addEventListener("change", (e) => {
    state.tierFilter = e.target.value;
    syncFilterChips(els.tierFilters, "tier", state.tierFilter);
    renderGrid();
    scheduleUserSessionSave();
  });
  document.getElementById("mobile-family")?.addEventListener("change", (e) => {
    state.familyFilter = e.target.value;
    syncFilterChips(els.familyFilters, "family", state.familyFilter);
    renderGrid();
    scheduleUserSessionSave();
  });
  document.getElementById("mobile-comp")?.addEventListener("change", (e) => {
    state.compFilter = e.target.value;
    syncFilterChips(els.compFilters, "comp", state.compFilter);
    renderGrid();
    scheduleUserSessionSave();
  });
  document.getElementById("mobile-color")?.addEventListener("change", (e) => {
    selectColorFilter(e.target.value);
  });
  els.closeDetail.addEventListener("click", closeDetail);
  els.overlay.addEventListener("click", closeDetail);
  setupKeyboard();
  setupTactics();

  window.LoLCoach = {
    state,
    els,
    setView,
    championIconHtml,
    escapeHtml,
    tierRank,
    tierBadgeHtml,
    colorIdentityHtml,
    colorSpectrumHtml,
    mtgPastillesHtml,
    mtgTeamPanelHtml,
    dominantMtgColor,
    mtgAccentHex,
    MTG_COLOR_META,
    getTypeClass,
    runTacticsAnalysis,
    rebuildEffectiveChampions,
    openChampionPage,
    closeChampionPage,
    openMtgColorsGuide,
    closeMtgColorsGuide,
    getPlayableChampions: () => state.champions,
    getClientId: () => window.LoLUserSession?.getClientId?.(),
    persistUserSession,
  };
  if (window.LoLDraftUI) window.LoLDraftUI.init(window.LoLCoach);

  window.addEventListener("popstate", (e) => {
    if (e.state?.view === "champion-page" && e.state.id) {
      const champ = state.champions.find((c) => c.id === e.state.id);
      if (champ) {
        state.championPageId = e.state.id;
        state.selectedId = e.state.id;
        renderChampionPage(champ);
        setView("champion-page");
        return;
      }
    }
    if (e.state?.view === "mtg-colors") {
      state.mtgGuideReturnView = e.state.returnView || "champions";
      setView("mtg-colors");
      return;
    }
    if (parseRouteFromHash()) return;
    state.championPageId = null;
    state.mtgGuideReturnView = null;
    state.selectedId = null;
    const hash = location.hash.replace("#", "");
    const known = ["draft", "tactics", "patch"];
    setView(known.includes(hash) ? hash : "champions");
  });

  if (parseRouteFromHash()) {
    /* fiche champion depuis URL */
  } else if (location.hash === "#colors") {
    state.mtgGuideReturnView = "champions";
    history.replaceState({ view: "mtg-colors", returnView: "champions" }, "", "#colors");
    setView("mtg-colors");
  } else if (location.hash === "#items") navigateToView("champions");
  else if (location.hash === "#draft") setView("draft");
  else if (location.hash === "#tactics") setView("tactics");
  else if (location.hash === "#patch") setView("patch");
  else setView("champions");
}

init();
