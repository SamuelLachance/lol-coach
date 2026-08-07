#!/usr/bin/env node
/**
 * Tests draft-scoring — sémantique des counters (threats/victims), antisymétrie,
 * verdict even, piliers ±100, win% logistique, MTG re-centré, blind Top/Support,
 * profils AD/AP, mémoïsation, aucune reco NaN sur 172 champions × 5 slots.
 */
import { loadSandbox, loadData, assert } from "./_harness.mjs";

const { sandbox } = loadSandbox();
const { champs, meta, byName } = loadData();
const SC = sandbox.LoLDraftScoring;
const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];

function compOf(names) {
  const c = {};
  SLOTS.forEach((s, i) => { c[s] = names[i]; });
  return c;
}

function duel(a, b) {
  return SC.evaluateDraftDuel(a, b, { ourComp: compOf(a), enemyComp: compOf(b), byName, metaMap: meta });
}

// --- 1. namesFrom sans fallback : liste absente => threats vides (jamais les pairings) ---
{
  const fake = { name: "TestSansCounters" };
  const fakeMeta = { TestSansCounters: { bestPairings: ["Lulu", "Jinx"] } };
  const prof = SC.buildProfile(fake, fakeMeta);
  assert(Array.isArray(prof.threats) && prof.threats.length === 0,
    `threats doit être [] sans données counters, obtenu ${JSON.stringify(prof.threats)}`);
  assert(prof.pairings.includes("Lulu"), "pairings doit venir de bestPairings du meta");
}

// --- 2. Sémantique threats : bestCounters = « qui ME bat » ---
{
  const malph = SC.buildProfile(byName.get("Malphite"), meta);
  assert(malph.threats.includes("Vayne") && malph.threats.includes("Gwen"),
    `threats(Malphite) doit contenir Vayne et Gwen, obtenu ${malph.threats.join(",")}`);

  // evaluateTeam : le camp qui a le counter est crédité
  const vayneSide = SC.evaluateTeam(["Vayne"], { byName, metaMap: meta, oppNames: ["Malphite"] });
  const malphSide = SC.evaluateTeam(["Malphite"], { byName, metaMap: meta, oppNames: ["Vayne"] });
  assert(vayneSide.breakdown.counter > 0,
    `Vayne vs Malphite doit avoir un edge counter positif, obtenu ${vayneSide.breakdown.counter}`);
  assert(malphSide.breakdown.counter < 0,
    `Malphite vs Vayne doit avoir un edge counter négatif, obtenu ${malphSide.breakdown.counter}`);
  assert(vayneSide.breakdown.counter === -malphSide.breakdown.counter,
    "edge counter doit être antisymétrique (net sans rabais)");

  // lane matchup : Vayne gagne la lane contre Malphite
  const lane = SC.scoreLaneMatchup("Vayne", "Malphite", "Top", byName, meta);
  const laneBack = SC.scoreLaneMatchup("Malphite", "Vayne", "Top", byName, meta);
  assert(lane.margin > 0, `Vayne doit gagner la lane vs Malphite, marge ${lane.margin}`);
  assert(lane.margin === -laneBack.margin, "marge de lane antisymétrique");

  // macroSynergyScore : l'edge counter suit la même direction
  const synA = SC.macroSynergyScore(["Vayne", "Lulu"], { byName, metaMap: meta, oppNames: ["Malphite"] });
  const synNeutral = SC.macroSynergyScore(["Vayne", "Lulu"], { byName, metaMap: meta, oppNames: [] });
  assert(synA > synNeutral, "counter Malphite doit augmenter le score matchup de Vayne");
}

// --- 3. Index inverse victims, mémoïsé par identité de dataset ---
{
  const victims = SC.getVictims("Vayne", byName, meta);
  assert(victims.some((x) => x.name === "Malphite"),
    `victims(Vayne) doit contenir Malphite, obtenu ${victims.map((x) => x.name).slice(0, 8).join(",")}`);
  const again = SC.getVictims("Vayne", byName, meta);
  assert(victims === again, "victims doit être mémoïsé (même référence pour le même dataset)");
}

// --- 4. Antisymétrie du duel + miroir => 50 % ---
{
  const pairs = [
    [["Malphite", "Jarvan IV", "Orianna", "Miss Fortune", "Rell"], ["Jayce", "Nidalee", "Ziggs", "Caitlyn", "Karma"]],
    [["Galio", "Naafiri", "Ryze", "Caitlyn", "Bard"], ["Rumble", "Trundle", "Cassiopeia", "Ashe", "Séraphine"]],
    [["Ornn", "Sejuani", "Orianna", "Jinx", "Rell"], ["Fiora", "Viego", "Twisted Fate", "Ezreal", "Karma"]],
  ];
  for (const [a, b] of pairs) {
    const d1 = duel(a, b);
    const d2 = duel(b, a);
    assert(Math.sign(d1.margin) !== Math.sign(d2.margin) || (d1.margin === 0 && d2.margin === 0),
      `duel swap doit inverser le signe : ${d1.margin} vs ${d2.margin}`);
    assert(Math.abs(d1.margin + d2.margin) <= 1,
      `duel swap doit inverser la marge (±1 d'arrondi) : ${d1.margin} vs ${d2.margin}`);
    assert(Math.abs(d1.winProb.our + d2.winProb.our - 1) < 0.01,
      "win% swap doit être complémentaire");
  }
  for (const [a] of pairs) {
    const dm = duel(a, a);
    assert(dm.margin === 0, `compo miroir => marge nulle, obtenu ${dm.margin}`);
    assert(Math.abs(dm.winProb.our - 0.5) < 1e-9, `compo miroir => 50 %, obtenu ${dm.winProb.our}`);
  }
}

// --- 5. normalizePillar : clamp réel à ±100 (raw clampé à 1× typicalAbs) ---
{
  assert(SC.normalizePillar(1e9, 100) === 100, "pilier saturé positif = +100");
  assert(SC.normalizePillar(-1e9, 100) === -100, "pilier saturé négatif = -100");
  assert(SC.normalizePillar(250, 100) === 100, "raw clampé à 1× typicalAbs (pas 2.5×)");
  assert(SC.normalizePillar(50, 100) === 50, "zone linéaire inchangée");
  for (const names of [
    ["Jinx", "Lulu", "Malphite", "Jarvan IV", "Orianna"],
    ["Fiora", "Viego", "Twisted Fate", "Ezreal", "Karma"],
  ]) {
    const r = SC.evaluateTeamInternal(names, { byName, metaMap: meta });
    for (const [k, v] of Object.entries(r.pillars)) {
      assert(v >= -100 && v <= 100, `pilier ${k} hors bornes : ${v}`);
    }
  }
}

// --- 6. Verdict 'even' si |marge| < 5, fini le tie-break alphabétique ---
{
  const self = SC.scoreLaneMatchup("Ashe", "Ashe", "Bot", byName, meta);
  assert(self.verdict === "even" && self.margin === 0,
    `miroir de lane => even/0, obtenu ${self.verdict}/${self.margin}`);
  const missing = SC.scoreLaneMatchup(null, "Ashe", "Bot", byName, meta);
  assert(missing.verdict === "unknown" && missing.margin === 0, "lane incomplète => unknown");
  let evens = 0;
  for (const [a, b, slot] of [
    ["Caitlyn", "Ashe", "Bot"], ["Darius", "Malphite", "Top"], ["Zed", "Lux", "Mid"],
    ["Morgana", "Blitzcrank", "Support"], ["Ahri", "Orianna", "Mid"], ["Jinx", "Caitlyn", "Bot"],
  ]) {
    const r = SC.scoreLaneMatchup(a, b, slot, byName, meta);
    if (r.verdict === "even") {
      evens += 1;
      assert(Math.abs(r.margin) < 5, `even exige |marge| < 5 : ${a} vs ${b} (${r.margin})`);
    } else {
      assert(Math.abs(r.margin) >= 5, `win/lose exige |marge| >= 5 : ${a} vs ${b} (${r.margin})`);
    }
  }
}

// --- 7. Win% : logistique douce bornée [15, 85], 50 à marge nulle ---
{
  const zero = SC.winProbFromMargin(0);
  assert(Math.abs(zero.our - 0.5) < 1e-9, "marge nulle => 50 %");
  const big = SC.winProbFromMargin(1e6);
  const neg = SC.winProbFromMargin(-1e6);
  assert(big.our <= 0.85 + 1e-9 && big.our > 0.84, `borne haute 85 %, obtenu ${big.our}`);
  assert(neg.our >= 0.15 - 1e-9 && neg.our < 0.16, `borne basse 15 %, obtenu ${neg.our}`);
  let prev = -1;
  for (const m of [-800, -400, -100, 0, 100, 400, 800]) {
    const p = SC.winProbFromMargin(m);
    assert(Math.abs(p.our + p.enemy - 1) < 1e-9, "our + enemy = 1");
    assert(p.our > prev, "win% strictement croissante avec la marge");
    prev = p.our;
  }
  const disp = SC.duelWinProbFromDisplayScores(600, 400);
  assert(Math.abs(disp.our - SC.winProbFromMargin(200).our) < 1e-9,
    "duelWinProbFromDisplayScores = logistique sur la différence");
}

// --- 8. MTG : borne symétrique (le négatif est permis), plus de plancher positif ---
{
  for (const names of [
    ["Galio", "Naafiri", "Ryze", "Caitlyn", "Bard"],
    ["Draven", "Nautilus", "Renekton", "Elise", "Syndra"],
  ]) {
    const r = SC.macroMtgScore(names, { byName, metaMap: meta, oppNames: [] });
    assert(r.score >= -580 && r.score <= 580, `macroMtgScore borné [-580, 580], obtenu ${r.score}`);
  }
  assert(SC.macroMtgScore(["Jinx"], { byName, metaMap: meta }).score === 0, "moins de 2 noms => 0");
}

// --- 9. Détecteur unique : detectArchetype == plan du duel ---
{
  const names = ["Rumble", "Trundle", "Cassiopeia", "Ashe", "Séraphine"];
  const vs = SC.profiles(names, byName, meta);
  const arch = SC.detectArchetype(vs);
  const d = duel(["Galio", "Naafiri", "Ryze", "Caitlyn", "Bard"], names);
  assert(arch.plan === d.detail.plans.enemy,
    `detectArchetype (${arch.plan}) doit correspondre au plan du duel (${d.detail.plans.enemy})`);
}

// --- 10. Détail beatdown branché ---
{
  const d = duel(
    ["Malphite", "Jarvan IV", "Orianna", "Miss Fortune", "Rell"],
    ["Jayce", "Nidalee", "Ziggs", "Caitlyn", "Karma"]
  );
  assert(d.detail.beatdown != null, "detail.beatdown doit être renseigné");
  assert(d.detail.cross.beatdown === d.detail.beatdown, "beatdown vient de crossDraftInteractions");
}

// --- 11. Profils AD/AP : neutre 0.5/0.5 par défaut, fallback tags pour les 0/0 ---
{
  const zed = SC.buildProfile(byName.get("Zed"), meta);
  assert(zed.ad > zed.ap, `Zed (assassin AD) doit être AD-dominant, obtenu ad=${zed.ad} ap=${zed.ap}`);
  const ornn = SC.buildProfile(byName.get("Ornn"), meta);
  assert(ornn.ad === 0.5 && ornn.ap === 0.5, `tank sans données => neutre 0.5/0.5, obtenu ${ornn.ad}/${ornn.ap}`);
  const malph = SC.buildProfile(byName.get("Malphite"), meta);
  assert(malph.ap > malph.ad, "Malphite (apShare 0.65) reste AP-dominant");
  for (const c of champs) {
    const p = SC.buildProfile(c, meta);
    assert(p.ad + p.ap > 0, `${c.name} : équilibre AD/AP jamais 0/0`);
  }
}

// --- 12. Mémoïsation buildProfile par (champion, dataset) ---
{
  const a = SC.buildProfile(byName.get("Jinx"), meta);
  const b = SC.buildProfile(byName.get("Jinx"), meta);
  assert(a === b, "buildProfile doit être mémoïsé pour le même dataset");
  const otherMeta = { ...meta };
  const c = SC.buildProfile(byName.get("Jinx"), otherMeta);
  assert(a !== c, "un autre dataset ne doit pas réutiliser le cache");
}

// --- 13. Pénalité Top/Support early active (bug inBlind mort) ---
{
  const D = sandbox.LoLDraft;
  const renekton = byName.get("Renekton");
  const early = D.createSession("blind-top", "blue");
  early.stepIndex = 6;
  const rEarly = SC.scorePick(renekton, "Top", { state: early, side: "blue", byName, meta, depth: 0 });
  assert(rEarly.reasons.some((r) => /Top\/Support early/.test(r)),
    `Top en early sans vis-à-vis doit être signalé risqué : ${rEarly.reasons.join("; ")}`);

  const late = D.createSession("counter-top", "blue");
  late.picks.red = [{ name: "Malphite", slot: "Top", order: 1, pinned: true }];
  late.stepIndex = 8;
  const rLate = SC.scorePick(renekton, "Top", { state: late, side: "blue", byName, meta, depth: 0.6 });
  assert(!rLate.reasons.some((r) => /Top\/Support early/.test(r)),
    "Top avec vis-à-vis connu ne doit plus être pénalisé");
  assert(rLate.score > rEarly.score, "counter pick Top doit scorer mieux que Top blind early");
}

// --- 14. Counter pillar : recommande le counter, pénalise le counté ---
{
  const D = sandbox.LoLDraft;
  const state = D.createSession("counter-dir", "blue");
  state.picks.red = [{ name: "Malphite", slot: "Top", order: 1, pinned: true }];
  state.picks.blue = [
    { name: "Jinx", slot: "Bot", order: 1, pinned: true },
    { name: "Lulu", slot: "Support", order: 2, pinned: true },
    { name: "Lee Sin", slot: "Jungle", order: 3, pinned: true },
  ];
  state.stepIndex = 9;
  const ctx = { state, side: "blue", byName, meta, depth: 0.8 };
  const vayne = SC.scorePick(byName.get("Vayne"), "Top", { ...ctx, allowOffRole: true });
  assert(vayne.reasons.some((r) => /Counter Top adverse/.test(r)),
    `Vayne vs Malphite doit citer le counter : ${vayne.reasons.join("; ")}`);
}

// --- 15. Sanité : compo hypercarry => Lulu/Milio dans le top des supports ---
{
  const D = sandbox.LoLDraft;
  const state = D.createSession("hyper-supports", "blue");
  state.picks.blue = [
    { name: "Jinx", slot: "Bot", order: 1, pinned: true },
    { name: "Sejuani", slot: "Jungle", order: 2, pinned: true },
    { name: "Galio", slot: "Mid", order: 3, pinned: true },
    { name: "Renekton", slot: "Top", order: 4, pinned: true },
  ];
  state.stepIndex = 9;
  const ctx = { state, side: "blue", byName, meta, depth: 0.8 };
  const scored = [];
  for (const c of champs) {
    if (!SC.playsSlotFor(c, meta, "Support")) continue;
    const r = SC.scorePick(c, "Support", ctx);
    scored.push({ name: c.name, score: r.score });
  }
  scored.sort((a, b) => b.score - a.score);
  const top5 = scored.slice(0, 5).map((x) => x.name);
  assert(top5.includes("Lulu") || top5.includes("Milio"),
    `Lulu/Milio attendus dans le top 5 des supports pour la compo hypercarry, obtenu ${top5.join(", ")}`);
}

// --- 16. Aucune reco NaN : 172 champions × 5 slots ---
{
  const D = sandbox.LoLDraft;
  const state = D.createSession("nan-sweep", "blue");
  state.picks.red = [{ name: "Malphite", slot: "Top", order: 1, pinned: true }];
  state.stepIndex = 7;
  const ctx = { state, side: "blue", byName, meta, depth: 0.4 };
  for (const c of champs) {
    for (const slot of SLOTS) {
      const r = SC.scorePick(c, slot, { ...ctx, allowOffRole: true });
      assert(Number.isFinite(r.score), `score NaN pour ${c.name} ${slot}`);
      assert(Array.isArray(r.reasons) && r.reasons.length > 0, `raisons vides pour ${c.name} ${slot}`);
    }
    const ban = SC.scoreBan(c, { state, side: "blue", byName, meta, depth: 0.4 });
    assert(Number.isFinite(ban.score), `ban NaN pour ${c.name}`);
  }
}

// --- 17. API : getter MIN_LANE_RATE dynamique, exports morts purgés ---
{
  assert(SC.MIN_LANE_RATE === sandbox.LoLLaneViability.MIN_LANE_RATE,
    "MIN_LANE_RATE doit suivre LoLLaneViability");
  assert(SC.duelWinProb === undefined && SC.duelWinProbFromMargin === undefined,
    "les fonctions win% mortes doivent être supprimées");
  assert(typeof SC.winProbFromMargin === "function", "winProbFromMargin doit être exporté");
}

console.log("OK — test_scoring : sémantique counters, antisymétrie, even, piliers, win%, blind, profils");
