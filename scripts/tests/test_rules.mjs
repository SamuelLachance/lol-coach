#!/usr/bin/env node
/**
 * Tests règles — draft-interactions, coaching-knowledge, pool-role-filters.
 * Antisymétrie, convention des counters, validation des noms, prédicats dupliqués,
 * trinité/antisynergies coaching, chips de rôle accessibles.
 */
import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";
import { loadSandbox, loadData, assert, root } from "./_harness.mjs";

const { sandbox } = loadSandbox();
const { champs, meta, byName } = loadData();

const IX = sandbox.LoLDraftInteractions;
const CK = sandbox.CoachingDraftKnowledge;
const SC = sandbox.LoLDraftScoring;
assert(IX && CK && SC, "exports LoLDraftInteractions / CoachingDraftKnowledge / LoLDraftScoring manquants");

const norm = CK.norm;
const index = JSON.parse(readFileSync(join(root, "public/data/champions-index.json"), "utf8"));
const indexNames = new Set(index.champions.map((c) => norm(c.name)));

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// 1. Normalisation partagée (NFD + strip accents)
// ---------------------------------------------------------------------------
assert(norm("Zoé") === norm("Zoe"), "norm doit plier les accents (Zoé/Zoe)");
assert(norm("Séraphine") === norm("Seraphine"), "norm doit plier les accents (Séraphine)");
assert(norm("K'Santé") === norm("K'Sante"), "norm doit plier les accents (K'Santé)");
assert(norm("Maître Yi") === norm("Maitre Yi"), "norm doit plier les accents (Maître Yi)");

// ---------------------------------------------------------------------------
// 2. Validation des noms : toute table curée référence un champion des données
// ---------------------------------------------------------------------------
const badNames = [];
function checkName(name, source) {
  if (!indexNames.has(norm(name))) badNames.push(`${source}: ${name}`);
}

for (const [key, set] of Object.entries(IX.MECH)) {
  for (const member of set) if (!indexNames.has(member)) badNames.push(`MECH.${key}: ${member}`);
}
for (const [defender, attacker] of IX.CURATED_COUNTERS) {
  checkName(defender, "CURATED defender");
  checkName(attacker, "CURATED attacker");
}
for (const [key, entry] of Object.entries(CK.COMBO_GRAPH)) {
  checkName(key, "COMBO_GRAPH clé");
  for (const p of entry.partners) checkName(p, `COMBO_GRAPH ${key}`);
}
const ckLists = {
  FIRST_PICK_ADC: CK.FIRST_PICK_ADC,
  FIRST_PICK_JUNGLE: CK.FIRST_PICK_JUNGLE,
  FLEX_PICKS: CK.FLEX_PICKS,
  TANK_JUNGLE: CK.TANK_JUNGLE,
  ENCHANTER_SUPPORTS: CK.ENCHANTER_SUPPORTS,
  TANK_ENGAGE_SUPPORTS: CK.TANK_ENGAGE_SUPPORTS,
  WOMBO_CORE: CK.WOMBO_CORE,
  HYPERCARRY_ADC: CK.HYPERCARRY_ADC,
  HYPERCARRY_JUNGLE: CK.HYPERCARRY_JUNGLE,
  HYPERCARRY_TOP: CK.HYPERCARRY_TOP,
  STABLE_TANK_MIDS: CK.STABLE_TANK_MIDS,
  GLOBAL_CORE: CK.GLOBAL_CORE,
  SPLITPUSHERS: CK.SPLITPUSHERS,
  ASSASSIN_JUNGLE: CK.ASSASSIN_JUNGLE,
  R_CLICK_MID: CK.R_CLICK_MID,
  COUNTER_PICK_CHAMPS: CK.COUNTER_PICK_CHAMPS,
  HIGH_BAN_TARGETS: CK.HIGH_BAN_TARGETS,
};
for (const [listName, list] of Object.entries(ckLists)) {
  for (const name of list) checkName(name, listName);
}
for (const [a, b] of CK.ANTI_SYNERGIES) {
  checkName(a, "ANTI_SYNERGIES");
  checkName(b, "ANTI_SYNERGIES");
}
for (const comp of CK.ARCHETYPE_COMPS) for (const c of comp.champs) checkName(c, `ARCHETYPE ${comp.id}`);
for (const tpl of CK.COMP_TEMPLATES) for (const c of tpl.champs) checkName(c, `TEMPLATE ${tpl.id}`);
for (const [family, set] of Object.entries(CK.FAMILY_TAGS)) {
  for (const member of set) if (!indexNames.has(member)) badNames.push(`FAMILY_TAGS.${family}: ${member}`);
}
assert(badNames.length === 0, `noms inconnus dans les tables curées :\n  ${badNames.join("\n  ")}`);

// Régressions précises attrapées par ce test
assert(IX.MECH.scaleJungle.has(norm("Maître Yi")), "Maître Yi doit être dans scaleJungle");
assert(!IX.MECH.cleansePeel.has("tenacity"), "Tenacity n'est pas un champion");
assert(IX.MECH.hardEngage.has(norm("K'Santé")), "K'Santé doit être dans hardEngage");
assert(IX.MECH.peelTank.has(norm("K'Santé")), "K'Santé doit être dans peelTank");
assert(IX.MECH.antiDash.has(norm("K'Santé")), "K'Santé doit être dans antiDash");
assert(IX.MECH.windwall.has(norm("Mel")), "Mel doit être dans windwall");
assert(IX.MECH.zoneControl.has(norm("Aurora")), "Aurora doit être dans zoneControl");
assert(IX.MECH.siegePoke.has(norm("Smolder")), "Smolder doit être dans siegePoke");
assert(IX.MECH.immobileCarry.has(norm("Yunara")), "Yunara doit être dans immobileCarry");

// ---------------------------------------------------------------------------
// 3. Familles coaching disjointes (un champion = une famille)
// ---------------------------------------------------------------------------
const famNames = Object.keys(CK.FAMILY_TAGS);
for (let i = 0; i < famNames.length; i++) {
  for (let j = i + 1; j < famNames.length; j++) {
    const a = CK.FAMILY_TAGS[famNames[i]];
    const b = CK.FAMILY_TAGS[famNames[j]];
    const overlap = [...a].filter((x) => b.has(x));
    assert(overlap.length === 0, `familles ${famNames[i]}/${famNames[j]} se recouvrent: ${overlap.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// 4. CURATED_COUNTERS : convention [defender, attacker], pas de paire mutuelle
// ---------------------------------------------------------------------------
const curatedPairs = new Set();
for (const [defender, attacker] of IX.CURATED_COUNTERS) {
  const key = `${norm(defender)}|${norm(attacker)}`;
  assert(!curatedPairs.has(key), `entrée curée dupliquée: ${defender} < ${attacker}`);
  curatedPairs.add(key);
}
for (const [defender, attacker] of IX.CURATED_COUNTERS) {
  const reverse = `${norm(attacker)}|${norm(defender)}`;
  assert(!curatedPairs.has(reverse), `counters curés contradictoires: ${defender} ↔ ${attacker}`);
}

// Direction : l'attaquant est crédité (Trundle counter Malphite, Ashe counter Naafiri)
const edgeTrundle = IX.curatedCounterEdge({ name: "Trundle" }, { name: "Malphite" });
assert(edgeTrundle && edgeTrundle.our === 48 && edgeTrundle.enemy === 0, "Trundle doit être crédité contre Malphite");
const edgeMalph = IX.curatedCounterEdge({ name: "Malphite" }, { name: "Trundle" });
assert(edgeMalph && edgeMalph.our === 0 && edgeMalph.enemy === 48, "sens inverse: Trundle crédité côté ennemi");
const pairAsheNaafiri = IX.evaluateChampPair(
  SC.buildProfile(byName.get("Ashe"), meta),
  SC.buildProfile(byName.get("Naafiri"), meta)
);
assert(pairAsheNaafiri.our > pairAsheNaafiri.enemy, "Ashe (peel ult) doit dominer Naafiri (convention curated)");
const pairBrandYuumi = IX.evaluateChampPair(
  SC.buildProfile(byName.get("Brand"), meta),
  SC.buildProfile(byName.get("Yuumi"), meta)
);
assert(pairBrandYuumi.our > pairBrandYuumi.enemy, "Brand (AOE) doit dominer Yuumi (entrée permutée)");

// ---------------------------------------------------------------------------
// 5. Antisymétrie evaluateChampPair
// ---------------------------------------------------------------------------
const rng = mulberry32(42);
const sampleChamps = [...champs].sort(() => rng() - 0.5).slice(0, 48);
const profiles = sampleChamps.map((c) => SC.buildProfile(c, meta));
for (let i = 0; i < profiles.length; i++) {
  for (let j = 0; j < profiles.length; j++) {
    if (i === j) continue;
    const ab = IX.evaluateChampPair(profiles[i], profiles[j]);
    const ba = IX.evaluateChampPair(profiles[j], profiles[i]);
    assert(
      ab.our === ba.enemy && ab.enemy === ba.our,
      `evaluateChampPair non antisymétrique: ${profiles[i].name} vs ${profiles[j].name} (${ab.our}/${ab.enemy} ↔ ${ba.our}/${ba.enemy})`
    );
  }
}

// ---------------------------------------------------------------------------
// 6. Antisymétrie evaluateCompClashes (et team traits)
// ---------------------------------------------------------------------------
const PLANS = [
  "poke_disengage", "poke_siege", "teamfight_engage", "hypercarry", "all_in", "lane_tempo",
  "beatdown", "front_to_back", "split_push", "pick_global", "scaling_late",
];
const allProfiles = champs.map((c) => SC.buildProfile(c, meta));
function randTeam(r) {
  const team = [];
  const used = new Set();
  while (team.length < 5) {
    const k = Math.floor(r() * allProfiles.length);
    if (used.has(k)) continue;
    used.add(k);
    team.push(allProfiles[k]);
  }
  return team;
}
const rng2 = mulberry32(1337);
for (let t = 0; t < 40; t++) {
  const A = randTeam(rng2);
  const B = randTeam(rng2);
  const pa = PLANS[Math.floor(rng2() * PLANS.length)];
  const pb = PLANS[Math.floor(rng2() * PLANS.length)];
  const ab = IX.evaluateCompClashes(A, B, pa, pb);
  const ba = IX.evaluateCompClashes(B, A, pb, pa);
  assert(
    ab.our === ba.enemy && ab.enemy === ba.our,
    `evaluateCompClashes non antisymétrique (essai ${t}): ${ab.our}/${ab.enemy} ↔ ${ba.our}/${ba.enemy}`
  );
  const tab = IX.evaluateTeamTraitClashes(A, B);
  const tba = IX.evaluateTeamTraitClashes(B, A);
  assert(
    tab.our === tba.enemy && tab.enemy === tba.our,
    `evaluateTeamTraitClashes non antisymétrique (essai ${t})`
  );
}
// Miroir exact : même compo des deux côtés ⇒ égalité
const mirrorTeam = ["Malphite", "Jarvan IV", "Orianna", "Jinx", "Lulu"].map((n) => SC.buildProfile(byName.get(n), meta));
const mirrorClash = IX.evaluateCompClashes(mirrorTeam, mirrorTeam, "teamfight_engage", "teamfight_engage");
assert(mirrorClash.our === mirrorClash.enemy, "compo miroir: edges égaux");

// ---------------------------------------------------------------------------
// 7. Prédicats comp-level dupliqués (échantillonnage aléatoire)
// ---------------------------------------------------------------------------
const rng3 = mulberry32(2024);
function randMetrics(r) {
  const int = (n) => Math.floor(r() * (n + 1));
  return {
    vs: randTeam(r),
    engage: r() * 3,
    peel: r() * 2.6,
    scaling: r() * 3,
    burst: r() * 3,
    early: r() * 3,
    front: int(3),
    poke: int(3),
    dive: int(3),
    assassin: int(3),
    marksman: int(3),
    ccHeavy: int(4),
    enchanter: int(2),
    global: int(3),
    split: int(3),
    siege: int(3),
    hardEngage: int(3),
    disengage: int(3),
    zone: int(2),
    antiDash: int(2),
    spellShield: int(2),
    immobile: int(3),
    womboSetup: int(3),
    classFrontline: int(3),
    classSlayer: int(3),
    classMageBurst: int(3),
    classPeel: int(2),
    classEngage: int(3),
    classMarksman: int(2),
    classDiversity: int(5),
  };
}
const S = 600;
const samples = [];
for (let i = 0; i < S; i++) {
  samples.push([
    randMetrics(rng3),
    randMetrics(rng3),
    PLANS[Math.floor(rng3() * PLANS.length)],
    PLANS[Math.floor(rng3() * PLANS.length)],
  ]);
}
const vectors = IX.COMP_CLASH_RULES.map(([when]) =>
  samples.map(([o, e, op, ep]) => {
    try {
      return when(o, e, op, ep) ? 1 : 0;
    } catch (_) {
      return 0;
    }
  }).join("")
);
for (let i = 0; i < vectors.length; i++) {
  for (let j = i + 1; j < vectors.length; j++) {
    if (!vectors[i].includes("1")) continue;
    assert(
      vectors[i] !== vectors[j],
      `règles comp ${i} et ${j} identiques sur ${S} échantillons: "${IX.COMP_CLASH_RULES[i][2]}" / "${IX.COMP_CLASH_RULES[j][2]}"`
    );
  }
}
const firedCount = vectors.filter((v) => v.includes("1")).length;
assert(firedCount >= IX.COMP_CLASH_RULES.length * 0.8, `échantillonnage trop pauvre: ${firedCount} règles vues actives`);

// ---------------------------------------------------------------------------
// 8. Coaching — trinité, antisynergies, familles, breakdown, tank supp
// ---------------------------------------------------------------------------
assert(CK.trinityBonus("Teemo", ["Orianna", "Malphite"]).score === 0, "Teemo sans lien ne doit pas hériter de la trinité du duo");
assert(CK.trinityBonus("Yasuo", ["Malphite", "Diana"]).score === 42, "Yasuo+Malphite+Diana = vraie trinité");
assert(CK.trinityBonus("Yasuo", ["Malphite"]).score > 0, "duo combo documenté doit scorer");

const zeriKaisa = CK.antiSynergyPenalty("Zeri", ["Leona", "Kai'Sa"]);
assert(!zeriKaisa.reasons.some((r) => /follow-up/.test(r)), "Kai'Sa dans l'équipe = pas de clause « sans follow-up »");
const zeriRellKaisa = CK.antiSynergyPenalty("Zeri", ["Rell", "Kai'Sa"]);
assert(zeriRellKaisa.score === 0, `Zeri+Rell+Kai'Sa ne doit rien pénaliser, obtenu ${zeriRellKaisa.score}`);
const zeriRell = CK.antiSynergyPenalty("Zeri", ["Rell"]);
assert(zeriRell.score === -28, `Zeri+Rell sans follow-up = -28, obtenu ${zeriRell.score}`);
const zeriLeona = CK.antiSynergyPenalty("Zeri", ["Leona"]);
assert(zeriLeona.score === -40, `Zeri+Leona = une seule pénalité (-40), obtenu ${zeriLeona.score}`);

assert(
  CK.familyCoherence("Maître Yi", ["Lulu", "Sion"]).score >= 30,
  "familyCoherence('Maître Yi') doit reconnaître l'hypercarry jungle (nom français)"
);
const pokeMix = CK.familyMixPenalty("Jayce", ["Caitlyn", "Ziggs", "Karma", "Braum"]);
assert(pokeMix.score === 0, `comp poke archétype ne doit pas s'auto-pénaliser, obtenu ${pokeMix.score}`);

const tsMage = CK.tankSuppAllowsAp("Syndra", "Mid", ["Leona"]);
assert(tsMage.score === 24, `Syndra mid + tank supp = bonus AP, obtenu ${tsMage.score}`);
const tsAdc = CK.tankSuppAllowsAp("Jinx", "Mid", ["Leona"]);
assert(tsAdc.score === 0, `Jinx mid n'est pas un mage: pas de bonus AP, obtenu ${tsAdc.score}`);
const tsBruiser = CK.tankSuppAllowsAp("Renekton", "Top", ["Leona"]);
assert(tsBruiser.score === 16, `Renekton top + tank supp = bonus bruiser, obtenu ${tsBruiser.score}`);
const tsTank = CK.tankSuppAllowsAp("Malphite", "Top", ["Leona"]);
assert(tsTank.score === 0, `Malphite top n'est pas un bruiser, obtenu ${tsTank.score}`);

const zeriPick = CK.scoreCoachingPick("Zeri", ["Leona"], "Bot", { side: "blue", pickN: 2 });
assert(
  zeriPick.breakdown.anti === Math.round(-40 * CK.WEIGHTS.anti),
  `breakdown.anti doit stocker la contribution pondérée, obtenu ${zeriPick.breakdown.anti}`
);

assert(CK.pickOrderForSide("blue").join(",") === CK.PICK_ORDER_BLUE.join(","), "pickOrderForSide blue");
assert(CK.pickOrderForSide("red").join(",") === CK.PICK_ORDER_RED.join(","), "pickOrderForSide red");

// ---------------------------------------------------------------------------
// 9. Chips de rôle — spans fermés, nom accessible
// ---------------------------------------------------------------------------
const poolSandbox = { global: {}, window: {}, globalThis: {}, console };
poolSandbox.global = poolSandbox.window = poolSandbox.globalThis = poolSandbox;
vm.runInNewContext(readFileSync(join(root, "public/pool-role-filters.js"), "utf8"), poolSandbox);
const chipsHtml = poolSandbox.LoLPoolRoles.renderRoleFilterChips("all");
const opens = (chipsHtml.match(/<span/g) || []).length;
const closes = (chipsHtml.match(/<\/span>/g) || []).length;
assert(opens === closes, `spans non équilibrés dans les chips: ${opens} ouvrants vs ${closes} fermants`);
for (const label of ["Tous", "Top", "Jgl", "Mid", "ADC", "Sup"]) {
  assert(chipsHtml.includes(`<span>${label}</span>`), `chip "${label}" doit avoir un nom accessible dans un span fermé`);
}

console.log("OK — test_rules: antisymétrie, noms, counters, coaching, chips");
