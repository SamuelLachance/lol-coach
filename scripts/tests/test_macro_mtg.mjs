#!/usr/bin/env node
/** Tests macro (tactics-engine), matchups de lane (lane-matchup-logic) et roue MTG (mtg-color-pie). */
import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";
import { loadSandbox, loadData, assert, root } from "./_harness.mjs";

function loadTacticsOnly(stubScoring) {
  const sandbox = { global: {}, window: {}, globalThis: {}, console };
  sandbox.global = sandbox.window = sandbox.globalThis = sandbox;
  if (stubScoring) sandbox.LoLDraftScoring = stubScoring;
  vm.runInNewContext(readFileSync(join(root, "public", "tactics-engine.js"), "utf8"), sandbox, {
    filename: "tactics-engine.js",
  });
  return sandbox;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function main() {
  const { sandbox } = loadSandbox();
  const { champs, meta, byName } = loadData();
  const P = sandbox.MTGColorPie;
  const T = sandbox.LoLTactics;
  const LML = sandbox.LoLLaneMatchupLogic;
  assert(P && T && LML, "exports MTGColorPie / LoLTactics / LoLLaneMatchupLogic manquants");

  // ── MTG : les 10 paires nommées résolvent (dans les deux ordres) ──
  const expected = {
    WU: "Azorius", UB: "Dimir", BR: "Rakdos", RG: "Gruul", GW: "Selesnya",
    WB: "Silverquill", WR: "Boros", UR: "Izzet", UG: "Simic", BG: "Golgari",
  };
  for (const [pair, name] of Object.entries(expected)) {
    const [a, b] = pair.split("");
    for (const codes of [[a, b], [b, a]]) {
      const combo = P.detectCombination(codes);
      assert(
        (combo.type === "guild" || combo.type === "enemy_dual") && combo.name === name,
        `${codes.join("")} doit résoudre vers ${name}, obtenu ${combo.type}/${combo.name}`
      );
      const entry = P.GUILDS[P.pairKey(...codes)] || P.ENEMY_DUAL[P.pairKey(...codes)];
      assert(entry?.name === name, `table ${codes.join("")} doit contenir ${name}`);
    }
  }
  for (const k of [...Object.keys(P.GUILDS), ...Object.keys(P.ENEMY_DUAL)]) {
    assert(k === P.pairKey(k[0], k[1]), `clé ${k} doit être canonique (ordre roue)`);
  }

  // ── MTG : score macro zéro-centré sur équipes aléatoires ──
  const withCI = champs.filter((c) => c.colorIdentity);
  const randomScores = [];
  for (let s = 0; s < 30; s += 1) {
    const rnd = mulberry32(1234 + s);
    const pool = [...withCI];
    const team = [];
    for (let k = 0; k < 5; k += 1) team.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    const r = P.teamMacroIdentityScore(team.map((c) => ({ name: c.name, colors: c.colorIdentity })));
    assert(Number.isFinite(r.score), "score macro doit être un nombre fini");
    randomScores.push(r.score);
  }
  randomScores.sort((a, b) => a - b);
  const median = randomScores[15];
  assert(
    median >= -60 && median <= 60,
    `médiane des équipes aléatoires doit être dans [-60,60], obtenu ${median}`
  );

  // ── MTG : poke canonique > mix incohérent (théorie Shanei §5) ──
  const vecs = (names) =>
    names.map((n) => ({ name: n, colors: byName.get(n)?.colorIdentity })).filter((v) => v.colors);
  const pokeNames = ["Caitlyn", "Braum", "Xerath", "Varus", "Maokai"];
  const mixNames = ["Ezreal", "Leona", "Malphite", "Xerath", "Amumu"];
  const pokeScore = P.teamMacroIdentityScore(vecs(pokeNames));
  const mixScore = P.teamMacroIdentityScore(vecs(mixNames));
  assert(
    pokeScore.score > mixScore.score,
    `poke canonique (${pokeScore.score}) doit scorer strictement plus haut que le mix (${mixScore.score})`
  );
  assert(pokeScore.score > 0, `identité poke cohérente doit être positive, obtenu ${pokeScore.score}`);
  assert(
    ["guild", "enemy_dual"].includes(pokeScore.combination?.type),
    `poke doit avoir une identité nommée, obtenu ${pokeScore.combination?.type}`
  );

  // ── MTG : hoser non constant ──
  const enemySum = P.sumVectors(vecs(mixNames).map((v) => P.colorVectorFrom(v.colors)));
  const hoserScores = new Set();
  for (const c of withCI.slice(0, 60)) {
    const h = P.colorMatchupPenalty(c.colorIdentity, enemySum);
    hoserScores.add(h.score);
    if (h.score >= 0) assert(h.reasons.length === 0, `pas de raison hoser sans pénalité (${c.name})`);
  }
  assert(hoserScores.size > 1, `colorMatchupPenalty ne doit pas être constant, obtenu ${[...hoserScores].join(",")}`);

  // ── MTG : activeColorsFromSum proportionnel — pas de WUBRG systématique sur 5 picks ──
  const active5 = P.activeColorsFromSum(enemySum);
  assert(active5.length < 5, `5 picks ne doivent pas activer les 5 couleurs, obtenu ${active5.join("")}`);

  // ── Tactics : plans split/poke → assignations non vides ──
  const enemyComp = { Top: "Renekton", Jungle: "Lee Sin", Mid: "LeBlanc", Bot: "Lucian", Support: "Braum" };
  const splitComp = { Top: "Fiora", Jungle: "Trundle", Mid: "Jax", Bot: "Caitlyn", Support: "Thresh" };
  const splitRec = T.recommend(splitComp, enemyComp, meta, byName);
  assert(splitRec.tactics.compType === "split_push", `comp Fiora/Trundle/Jax doit être split_push, obtenu ${splitRec.tactics.compType}`);
  assert(
    splitRec.tactics.midGame.value === "Split side lane" && splitRec.tactics.midGame.assign.length > 0,
    `plan split doit assigner des splitters, obtenu ${JSON.stringify(splitRec.tactics.midGame)}`
  );
  assert(
    splitRec.tactics.winCondition.value.includes("Split") && splitRec.tactics.winCondition.assign.length > 0,
    "win condition split doit assigner des splitters"
  );
  assert(
    splitRec.tactics.midGame.assign.some((a) => a.name === "Fiora"),
    "Fiora doit être assignée au plan split"
  );

  const pokeComp = { Top: "Maokai", Jungle: "Elise", Mid: "Xerath", Bot: "Varus", Support: "Braum" };
  const pokeRec = T.recommend(pokeComp, enemyComp, meta, byName);
  assert(
    pokeRec.tactics.waveState.value === "Slow push → roam" && pokeRec.tactics.waveState.assign.length > 0,
    `comp poke doit assigner des pokeurs au plan de wave, obtenu ${JSON.stringify(pokeRec.tactics.waveState)}`
  );
  assert(
    pokeRec.tactics.midGame.assign.length > 0,
    `plan mid game poke doit avoir des assignés, obtenu ${JSON.stringify(pokeRec.tactics.midGame)}`
  );

  // ── Tactics : pathing jungle décidé par le jungler lui-même ──
  const baseComp = { Top: "Malphite", Jungle: "Elise", Mid: "Orianna", Bot: "Jinx", Support: "Lulu" };
  const eliseRec = T.recommend(baseComp, enemyComp, meta, byName);
  assert(
    eliseRec.tactics.junglePath.value === "Gank lvl 3",
    `Elise doit gank early, obtenu ${eliseRec.tactics.junglePath.value}`
  );
  const karthusRec = T.recommend({ ...baseComp, Jungle: "Karthus" }, enemyComp, meta, byName);
  assert(
    karthusRec.tactics.junglePath.value === "Full clear → gank",
    `Karthus doit farmer, obtenu ${karthusRec.tactics.junglePath.value}`
  );

  // ── Tactics : moteur indisponible ⇒ verdict unknown, jamais lose ──
  const bare = loadTacticsOnly(null);
  const noEngine = bare.LoLTactics.laneVerdict("Ashe", "Caitlyn", {}, "Bot", {});
  assert(
    noEngine.verdict === "unknown" && noEngine.margin === 0,
    `sans moteur le verdict doit être unknown/0, obtenu ${noEngine.verdict}/${noEngine.margin}`
  );

  // ── Tactics : verdict 'even' géré (lanePriority + roleAdvice) ──
  const evenStub = {
    scoreLaneMatchup: () => ({ verdict: "even", margin: 2, note: "Matchup égal — skill check." }),
  };
  const evenBox = loadTacticsOnly(evenStub);
  const evenRec = evenBox.LoLTactics.recommend(baseComp, enemyComp, meta, byName);
  assert(
    evenRec.tactics.lanePriority.value === "Équilibré" && /skill check/i.test(evenRec.tactics.lanePriority.reason),
    `lanes égales ⇒ priorité neutre skill check, obtenu ${JSON.stringify(evenRec.tactics.lanePriority)}`
  );
  for (const slot of evenBox.LoLTactics.SLOTS) {
    const advice = evenRec.roleAdvice.slots[slot];
    assert(advice.matchupVerdict === "even", `${slot} doit propager le verdict even`);
    assert(
      advice.early.some((l) => /égal/i.test(l) && /skill check/i.test(l)),
      `${slot} doit formuler « matchup égal — skill check », obtenu ${advice.early.join(" | ")}`
    );
  }

  // ── Tactics : prio Bot side = 2v2 (ADC + Support), pas le seul 1v1 ADC ──
  const stub2v2 = (margins) => ({
    scoreLaneMatchup: (ours, theirs, slot) => {
      const m = margins[slot] ?? 0;
      const verdict = Math.abs(m) < 5 ? "even" : m > 0 ? "win" : "lose";
      return { verdict, margin: m, note: "stub" };
    },
  });
  const botWinSupLose = loadTacticsOnly(
    stub2v2({ Top: 0, Jungle: 0, Mid: 0, Bot: 6, Support: -40 })
  ).LoLTactics.recommend(baseComp, enemyComp, meta, byName);
  assert(
    botWinSupLose.tactics.lanePriority.value !== "Bot side",
    `ADC win + support très perdant ⇒ pas de prio bot, obtenu ${botWinSupLose.tactics.lanePriority.value}`
  );
  const botEvenSupWin = loadTacticsOnly(
    stub2v2({ Top: 0, Jungle: 0, Mid: 0, Bot: 3, Support: 40 })
  ).LoLTactics.recommend(baseComp, enemyComp, meta, byName);
  assert(
    botEvenSupWin.tactics.lanePriority.value === "Bot side",
    `ADC égal + support gagnant ⇒ prio bot 2v2, obtenu ${botEvenSupWin.tactics.lanePriority.value}`
  );

  // ── Tactics : plus de tags fantômes — countTags dérive split/poke des compTypes ──
  const splitAdvice = splitRec.roleAdvice.slots.Top;
  assert(/split/i.test(splitAdvice.roleLabel), `Fiora top doit être identifiée split, obtenu ${splitAdvice.roleLabel}`);

  // ── Lane logic : burst/early/peel numériques 0-1 ──
  for (const c of champs) {
    const kit = LML.buildKitProfile(c, meta);
    for (const f of ["burst", "early", "peel"]) {
      assert(
        typeof kit[f] === "number" && kit[f] >= 0 && kit[f] <= 1,
        `${c.name}.${f} doit être numérique dans [0,1], obtenu ${kit[f]}`
      );
    }
  }
  const eliseKit = LML.buildKitProfile(byName.get("Elise"), meta);
  const karthusKit = LML.buildKitProfile(byName.get("Karthus"), meta);
  assert(
    eliseKit.early > karthusKit.early,
    `Elise doit être plus early que Karthus (${eliseKit.early} vs ${karthusKit.early})`
  );

  // ── Lane logic : modificateur jungle gradué (±15 max) ──
  const jglMods = LML.laneKitModifiers(eliseKit, karthusKit, "Jungle");
  for (const h of jglMods.hits) {
    if (/early/.test(h.reason)) assert(h.pts <= 15, `bonus early jungle ≤ 15, obtenu ${h.pts}`);
  }

  // ── Lane logic : raisons du côté perdant avec les bons noms (fini le double replace) ──
  const luxKit = LML.buildKitProfile(byName.get("Lux"), meta);
  const zedKit = LML.buildKitProfile(byName.get("Zed"), meta);
  const luxVsZed = LML.computeLaneKitEdge(luxKit, zedKit, "Mid");
  if (luxVsZed.margin < 0 && luxVsZed.reasons.length) {
    assert(
      luxVsZed.reasons.some((r) => r.includes("Zed")),
      `raison côté ennemi doit citer Zed, obtenu ${luxVsZed.reasons.join("; ")}`
    );
  }

  // ── Lane logic : marge précalculée 0 ⇒ even cohérent, pas de raisons contradictoires ──
  const saved = JSON.parse(readFileSync(join(root, "public/data/lane-matchups.json"), "utf8"));
  LML.loadPrecomputed({ champs: ["Lux", "Zed"], margins: { Mid: [0, 0, 0, 0] } });
  const evenEdge = LML.laneKitEdge(byName.get("Lux"), byName.get("Zed"), "Mid", { metaMap: meta });
  assert(evenEdge.margin === 0 && evenEdge.our === 0 && evenEdge.enemy === 0, "marge 0 précalculée ⇒ edge nul");
  assert(evenEdge.reasons.length === 0, `marge 0 ⇒ aucune raison d'avantage, obtenu ${evenEdge.reasons.join("; ")}`);
  LML.loadPrecomputed(saved);

  // ── Lane logic : marge précalculée non nulle ⇒ raison alignée sur le signe ──
  const cached = LML.lookupMargin("Caitlyn", "Ashe", "Bot");
  if (cached != null && cached !== 0) {
    const edge = LML.laneKitEdge(byName.get("Caitlyn"), byName.get("Ashe"), "Bot", { metaMap: meta });
    assert(edge.margin === cached, "edge précalculé doit reprendre la marge cachée");
  }

  console.log("OK — tests macro / lane / MTG passés");
  console.log(`  médiane équipes aléatoires: ${median} · poke ${pokeScore.score} > mix ${mixScore.score}`);
}

main();
