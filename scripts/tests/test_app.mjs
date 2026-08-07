#!/usr/bin/env node
/** Tests app.js & co — parties testables sans DOM : données guide, exports draft-scoring, hygiène des sources. */
import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";
import { root, loadSandbox, assert } from "./_harness.mjs";

const read = (rel) => readFileSync(join(root, rel), "utf8");

// --- guide-fr.json : structure + typo corrigée -------------------------------
{
  const guide = JSON.parse(read("public/data/guide-fr.json"));
  assert(typeof guide.title === "string" && guide.title.length > 0, "guide-fr.json : title manquant");
  assert(Array.isArray(guide.sections) && guide.sections.length > 0, "guide-fr.json : sections[] manquant");
  for (const s of guide.sections) {
    assert(typeof s.id === "string" && s.id, `guide-fr.json : section sans id`);
    assert(typeof s.title === "string" && s.title, `guide-fr.json : section ${s.id} sans title`);
    assert(typeof s.html === "string" && s.html, `guide-fr.json : section ${s.id} sans html`);
  }
  const ids = guide.sections.map((s) => s.id);
  assert(new Set(ids).size === ids.length, "guide-fr.json : ids de sections dupliqués");
  const rawText = JSON.stringify(guide);
  assert(!/fearles(?!s)/.test(rawText), "guide-fr.json : typo « fearles » non corrigée");
  console.log(`guide-fr.json OK (${guide.sections.length} sections)`);
}

// --- draft-scoring : exports consommés par app.js ----------------------------
{
  const { sandbox } = loadSandbox();
  const SC = sandbox.LoLDraftScoring;
  assert(Array.isArray(SC.COMP_TYPE_COUNTERS), "LoLDraftScoring.COMP_TYPE_COUNTERS absent");
  assert(SC.COMP_TYPE_COUNTERS.length >= 13, "COMP_TYPE_COUNTERS incomplet (version unique attendue)");
  assert(Array.isArray(SC.INCOMPATIBLE_COMP_PAIRS), "LoLDraftScoring.INCOMPATIBLE_COMP_PAIRS absent");
  assert(SC.INCOMPATIBLE_COMP_PAIRS.length >= 5, "INCOMPATIBLE_COMP_PAIRS incomplet");
  for (const pair of [...SC.COMP_TYPE_COUNTERS, ...SC.INCOMPATIBLE_COMP_PAIRS]) {
    assert(Array.isArray(pair) && pair.length === 2, "paire comp invalide");
  }
  console.log("Exports draft-scoring OK");
}

// --- app.js : symboles supprimés absents, nouveaux points d'entrée présents --
{
  const app = read("public/app.js");
  const forbidden = [
    "ADMIN_PASSWORD",
    "pushSiteDefaults",
    "pushAsSiteDefaults",
    "verifyAdminPassword",
    "patchPushDefaults",
    "mdInline",
    "mdBlock",
    "renderMarkdownTable",
    "linkChampionNames",
    "linkItemNames",
    "colorSpectrumHtml",
    "DRAFT_STORAGE_KEY",
    "renderDetailGamePlan",
    "MATCHUP_SOURCE_LABELS",
    "renderMatchupChips",
    "renderMiniMatchupList",
    "renderCardMatchupsPanel",
    "renderDetailHighlights",
    "renderMatchupRows",
    "renderLaneRateBars",
    "renderChampionFamilySection",
    "renderTipsList",
    "ITEM_NAMES_SORTED",
    "CHAMP_NAMES_SORTED",
    "tacticsCoachNotes",
    "sidebarDraft",
    "sidebarTactics",
  ];
  for (const sym of forbidden) {
    assert(!app.includes(sym), `app.js : symbole mort encore présent : ${sym}`);
  }
  const dupConsts = ["const COMP_TYPE_COUNTERS", "const INCOMPATIBLE_COMP_PAIRS"];
  for (const c of dupConsts) {
    assert(!app.includes(c), `app.js : constante dupliquée de draft-scoring : ${c}`);
  }
  const required = [
    "LoLDraftScoring?.COMP_TYPE_COUNTERS",
    "LoLDraftScoring?.INCOMPATIBLE_COMP_PAIRS",
    "tactics-templates-inline",
    "view-guide",
    "guide-content",
    "data/guide-fr.json",
    "tierRank(a.tierMeta) - tierRank(b.tierMeta)",
    "Hors rotation",
    "Égal",
    "history.back()",
    "loadSecondaryAssets",
    "aria-hidden=\"true\">${TACTICS_SLOT_ICONS[slot]}",
    "tactics-cell-remove",
    "patch-export",
    "patch-import",
  ];
  for (const sym of required) {
    assert(app.includes(sym), `app.js : attendu mais absent : ${sym}`);
  }
  assert(
    app.includes('document.getElementById("view-guide")') || app.includes("getElementById('view-guide')"),
    "app.js : #view-guide non consommé"
  );
  assert(/if \(view === state\.view\) return;/.test(app), "app.js : navigateToView sans no-op vers la vue courante");
  console.log("Sources app.js OK");
}

// --- patch-config.js : chemin « Définir comme défaut » supprimé --------------
{
  const pc = read("public/patch-config.js");
  for (const sym of [
    "ADMIN_PASSWORD",
    "pushAsSiteDefaults",
    "pushSiteDefaultsViaForm",
    "pushSiteDefaultsToServer",
    "verifyAdminPassword",
    "getPatchDefaultsApiUrl",
  ]) {
    assert(!pc.includes(sym), `patch-config.js : symbole sensible encore présent : ${sym}`);
  }
  for (const kept of ["fetchSiteDefaults", "mergeWithBase", "getAllWithPatch", "getPlayable"]) {
    assert(pc.includes(kept), `patch-config.js : API attendue manquante : ${kept}`);
  }
  console.log("patch-config.js OK");
}

// --- site-config.js : plus d'endpoint patch-defaults -------------------------
{
  const sc = read("public/site-config.js");
  assert(!sc.includes("PATCH_DEFAULTS_API"), "site-config.js : PATCH_DEFAULTS_API encore présent");
  assert(!sc.includes("patchDefaultsTunnelApi"), "site-config.js : patchDefaultsTunnelApi encore présent");
  console.log("site-config.js OK");
}

// --- user-session.js : clé itemTierFilter purgée -----------------------------
{
  const sandbox = { console };
  sandbox.global = sandbox.window = sandbox.globalThis = sandbox;
  sandbox.localStorage = {
    _data: new Map(),
    getItem(k) {
      return this._data.has(k) ? this._data.get(k) : null;
    },
    setItem(k, v) {
      this._data.set(k, String(v));
    },
    removeItem(k) {
      this._data.delete(k);
    },
  };
  vm.runInNewContext(read("public/user-session.js"), sandbox, { filename: "user-session.js" });
  const ui = sandbox.LoLUserSession.defaultUi();
  assert(!("itemTierFilter" in ui), "user-session.js : itemTierFilter encore dans defaultUi");
  sandbox.localStorage.setItem(
    sandbox.LoLUserSession.SESSION_KEY,
    JSON.stringify({ ui: { itemTierFilter: "S", search: "zoé" } })
  );
  const loaded = sandbox.LoLUserSession.load();
  assert(!("itemTierFilter" in loaded.ui), "user-session.js : itemTierFilter survit au load");
  assert(loaded.ui.search === "zoé", "user-session.js : ui légitime perdu au load");
  assert("patchSearch" in ui && "patchPoolFilter" in ui, "user-session.js : clés patch persistées attendues");
  console.log("user-session.js OK");
}

// --- tactics-meta.json : labels des 9 cartes macro ---------------------------
{
  const meta = JSON.parse(read("public/data/tactics-meta.json"));
  const cardKeys = [
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
  for (const key of cardKeys) {
    assert(meta.tacticOptions?.[key]?.label, `tactics-meta.json : tacticOptions.${key}.label manquant`);
  }
  const app = read("public/app.js");
  for (const key of cardKeys) {
    assert(app.includes(key), `app.js : carte macro ${key} non référencée`);
  }
  console.log("tactics-meta OK (9 cartes macro)");
}

// --- mtg-colors-guide.js : exemples data-driven ------------------------------
{
  const mg = read("public/mtg-colors-guide.js");
  assert(!mg.includes("COLOR_LOL_EXAMPLES"), "mtg-colors-guide.js : liste en dur COLOR_LOL_EXAMPLES encore présente");
  assert(!mg.includes("Evelynn"), "mtg-colors-guide.js : exemple champion en dur encore présent");
  assert(mg.includes("topChampionsByColor"), "mtg-colors-guide.js : génération data-driven absente");
  assert(mg.includes("colorIdentity"), "mtg-colors-guide.js : ne lit pas les poids de couleur réels");
  console.log("mtg-colors-guide.js OK");
}

console.log("test_app.mjs : OK");
