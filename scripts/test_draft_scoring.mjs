#!/usr/bin/env node
/** Smoke tests — LoL draft scoring (phase weights, comp plan, ban deny). */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadLoLDraft() {
  const sandbox = { global: {}, window: {}, globalThis: {} };
  sandbox.global = sandbox.window = sandbox.globalThis = sandbox;
  for (const file of [
    "lane-viability.js",
    "lane-matchup-logic.js",
    "champion-classes.js",
    "coaching-knowledge.js",
    "mtg-color-pie.js",
    "draft-interactions.js",
    "draft-scoring.js",
    "draft-engine.js",
  ]) {
    vm.runInNewContext(readFileSync(join(root, "public", file), "utf8"), sandbox);
  }
  const laneData = JSON.parse(readFileSync(join(root, "public/data/lane-matchups.json"), "utf8"));
  sandbox.LoLLaneMatchupLogic.loadPrecomputed(laneData);
  const classData = JSON.parse(readFileSync(join(root, "public/data/champion-classes.json"), "utf8"));
  sandbox.LoLChampionClasses.loadPrecomputed(classData);
  return { sandbox, laneData, classData };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function main() {
  const { sandbox, laneData, classData } = loadLoLDraft();
  const D = sandbox.LoLDraft;
  assert(D, "LoLDraft export missing");

  const w0 = D.phaseWeights(0);
  const w1 = D.phaseWeights(1);
  assert(w0.tier > w1.tier, "tier weight should drop with depth");
  assert(w1.counter > w0.counter, "counter weight should rise with depth");
  assert(w1.synergy > w0.synergy, "synergy weight should rise with depth");
  assert(w1.plan > w0.plan, "plan weight should rise with depth");

  const meta = JSON.parse(readFileSync(join(root, "public/data/tactics-meta.json"), "utf8")).champions;
  const champs = JSON.parse(readFileSync(join(root, "public/data/champions.json"), "utf8")).champions;
  const byName = new Map(champs.map((c) => [c.name, c]));

  const session = D.createSession("smoke", "blue");
  const jinx = champs.find((c) => c.name === "Jinx");
  const lulu = champs.find((c) => c.name === "Lulu");
  assert(jinx && lulu, "fixture champions missing");

  const blind = D.scorePick(jinx, session, "blue", null, meta, byName);
  assert(blind.score > -1000, "Jinx blind should be scorable");
  assert(blind.reasons.length > 0, "Jinx pick should have reasons");

  const jinxV = D.buildVector(jinx, meta);
  const luluV = D.buildVector(lulu, meta);
  const planBefore = D.detectCompPlan([jinxV]);
  const planAfter = D.detectCompPlan([jinxV, luluV]);
  assert(planAfter.completeness > planBefore.completeness,
    `Lulu should improve hypercarry plan: ${planBefore.completeness}% → ${planAfter.completeness}%`);
  assert(planAfter.plan === "hypercarry" || /hypercarry/i.test(planAfter.label),
    `expected hypercarry after Jinx+Lulu, got ${planAfter.plan}`);

  const banS = D.scoreBan(lulu, session, "blue", byName, meta);
  assert(banS.score > 0, "Tier support ban should score positively");

  const vs = [D.buildVector(jinx, meta), D.buildVector(lulu, meta)];
  const plan = D.detectCompPlan(vs);
  assert(plan.plan === "hypercarry" || plan.label.includes("Hyper"), `expected hypercarry plan, got ${plan.plan}`);

  const SC = sandbox.LoLDraftScoring;
  assert(
    SC.combineEqualPillars([SC.normalizePillar(100, 100), SC.normalizePillar(-100, 100)]) === 0,
    "equal pillar combine should balance opposing theory axes"
  );
  const macroPick = SC.scoreMacroPick(lulu, "Support", {
    teamNames: ["Jinx"],
    enemyNames: ["Malphite", "Yasuo"],
    byName,
    metaMap: meta,
    side: "our",
  });
  assert(macroPick.score > 40, `Lulu+Jinx hypercarry macro pick should score high, got ${macroPick.score}`);

  const macroTeam = SC.evaluateTeamMacro(
    ["Jinx", "Lulu", "Malphite", "Jarvan IV", "Orianna"],
    { byName, metaMap: meta, oppNames: ["Renekton", "Lee Sin", "Ahri", "Caitlyn", "Thresh"] }
  );
  const internalTeam = SC.evaluateTeamInternal(
    ["Jinx", "Lulu", "Malphite", "Jarvan IV", "Orianna"],
    { byName, metaMap: meta }
  );
  assert(macroTeam.total === internalTeam.total, "macro team eval must match draft internal eval");
  assert(macroTeam.breakdown.winCondition > 150, `win condition must scale 200+ range, got ${macroTeam.breakdown.winCondition}`);
  assert(
    macroTeam.breakdown.winCondition > macroTeam.breakdown.synergy * 0.5,
    `win condition should dominate synergy: wc=${macroTeam.breakdown.winCondition} syn=${macroTeam.breakdown.synergy}`
  );
  assert(macroTeam.breakdown.synergy > 0, "synergy should be positive");

  const unifyOur = { Top: "", Jungle: "", Mid: "", Bot: "Jinx", Support: "" };
  const unifyEnemy = { Top: "Malphite", Jungle: "", Mid: "", Bot: "", Support: "" };
  const macroLulu = SC.scoreMacroPick(lulu, "Support", { ourComp: unifyOur, enemyComp: unifyEnemy, byName, metaMap: meta, side: "our" });
  const draftSession = D.createSession("unify", "blue");
  draftSession.picks.blue = [{ name: "Jinx", slot: "Bot", order: 1, pinned: true }];
  draftSession.picks.red = [{ name: "Malphite", slot: "Top", order: 1, pinned: true }];
  draftSession.stepIndex = 8;
  const draftLulu = D.scorePickForSlot(lulu, draftSession, "blue", "Support", byName, meta);
  assert(
    macroLulu.score === draftLulu.score,
    `macro/draft unified score: macro=${macroLulu.score} draft=${draftLulu.score}`
  );

  const luluProf = SC.buildProfile(lulu, meta);
  const jinxProf = SC.buildProfile(jinx, meta);
  assert(luluProf.colors?.identity, "Lulu should have MTG color identity");
  const mtgHarmony = sandbox.MTGColorPie.colorPickBonus(luluProf.colors, [jinxProf.colors], sandbox.MTGColorPie.sumVectors([sandbox.MTGColorPie.colorVectorFrom(jinxProf.colors)]));
  assert(mtgHarmony.score > 0, "Lulu should harmonize MTG-wise with Jinx hypercarry");

  const rec = D.getMacroRecommendations(
    { Top: "", Jungle: "", Mid: "", Bot: "Jinx", Support: "" },
    { Top: "Malphite", Jungle: "", Mid: "", Bot: "", Support: "" },
    { type: "pick", side: "our", slot: "Support" },
    null,
    champs,
    meta,
    byName,
    8
  );
  assert(rec.items.length > 0, "macro recommendations should return items");
  const topNames = rec.items.slice(0, 5).map((i) => i.champion.name);
  console.log(`  macro Support for Jinx top5: ${topNames.join(", ")}`);
  for (const item of rec.items) {
    assert(
      D.playsSlotFor(item.champion, meta, "Support"),
      `macro suggest ${item.champion.name} must be ≥10% Support lane rate`
    );
  }
  assert(
    rec.coachHint.includes("Notre équipe") && rec.coachHint.includes("Support"),
    `macro coach hint should use draft-style French labels: ${rec.coachHint}`
  );

  const macroSession = D.compsToMacroSession(
    { Top: "", Jungle: "", Mid: "", Bot: "Jinx", Support: "" },
    { Top: "Malphite", Jungle: "", Mid: "", Bot: "", Support: "" }
  );
  const draftSupportRec = D.getRecommendations(macroSession, champs, meta, byName, [], 8, "blue", {
    skipCache: true,
    focusTarget: { type: "pick", side: "blue", slot: "Support" },
  });
  assert(
    rec.items[0]?.champion.name === draftSupportRec.items[0]?.champion.name,
    `macro pipeline must match draft getRecommendations: macro=${rec.items[0]?.champion.name} draft=${draftSupportRec.items[0]?.champion.name}`
  );
  assert(
    rec.items[0]?.score === draftSupportRec.items[0]?.score,
    `macro/draft unified top score: macro=${rec.items[0]?.score} draft=${draftSupportRec.items[0]?.score}`
  );

  const draftRec = D.getRecommendations(session, champs, meta, byName, [], 12, "blue", {
    skipCache: true,
    focusTarget: { type: "pick", side: "blue", slot: "Bot" },
  });
  const redBotFocus = D.getRecommendations(session, champs, meta, byName, [], 12, null, {
    skipCache: true,
    focusTarget: { side: "red", slot: "Bot" },
  });
  assert(
    redBotFocus.coachHint.includes("ADC") || redBotFocus.coachHint.includes("≥"),
    `red Bot focus hint should mention ADC lane: ${redBotFocus.coachHint}`
  );
  for (const item of redBotFocus.items) {
    assert(
      D.playsSlotFor(item.champion, meta, "Bot"),
      `red Bot suggest ${item.champion.name} must be ≥10% Bot lane rate`
    );
  }

  const legacyFocus = D.createSession("legacy-focus", "blue");
  legacyFocus.focus = { side: "red", slot: "Bot" };
  D.normalizeSession(legacyFocus);
  const legacyRec = D.getRecommendations(legacyFocus, champs, meta, byName, [], 8, null, { skipCache: true });
  assert(
    legacyRec.coachHint.includes("ADC") || legacyRec.coachHint.includes("≥"),
    `legacy focus without type must lane-scope Bot: ${legacyRec.coachHint}`
  );
  for (const item of legacyRec.items) {
    assert(D.playsSlotFor(item.champion, meta, "Bot"), `legacy Bot ${item.champion.name}`);
  }
  for (const item of draftRec.items) {
    assert(
      D.playsSlotFor(item.champion, meta, "Bot"),
      `draft Bot suggest ${item.champion.name} must be ≥10% Bot lane rate`
    );
  }

  const womboOur = {
    Top: "Malphite",
    Jungle: "Jarvan IV",
    Mid: "Orianna",
    Bot: "Miss Fortune",
    Support: "Rell",
  };
  const pokeEnemy = {
    Top: "Jayce",
    Jungle: "Nidalee",
    Mid: "Ziggs",
    Bot: "Caitlyn",
    Support: "Karma",
  };
  const duel = SC.evaluateDraftDuel(
    Object.values(womboOur),
    Object.values(pokeEnemy),
    { ourComp: womboOur, enemyComp: pokeEnemy, byName, metaMap: meta }
  );
  assert(duel.our.total > 0 && duel.enemy.total > 0, "duel should score both teams");
  assert(duel.detail?.cross?.topPairs?.length > 0, "duel should surface key interactions");
  assert(
    duel.margin < 0 && duel.winProb.enemy > duel.winProb.our,
    `poke/disengage should beat wombo engage: margin=${duel.margin} win=${Math.round(duel.winProb.enemy * 100)}%`
  );

  const cmp = D.compareComps(womboOur, pokeEnemy, byName, meta);
  assert(cmp.complete && cmp.margin < 0 && cmp.winProb.enemy > cmp.winProb.our, "compareComps should favor poke vs wombo");
  assert(cmp.our.breakdown?.winCondition > 150, `wombo win condition scale, got ${cmp.our.breakdown?.winCondition}`);
  assert(
    (cmp.our.breakdown?.winCondition || 0) > (cmp.our.breakdown?.synergy || 0) * 0.5,
    "win condition should dominate internal breakdown"
  );

  function assertWinProbMatchesDisplayScores(cmp, label) {
    const sum = cmp.our.score + cmp.enemy.score;
    const expectedOur = cmp.our.score / sum;
    assert(
      Math.abs(cmp.winProb.our - expectedOur) < 0.0001,
      `${label}: winProb must match score ratio (${cmp.winProb.our} vs ${expectedOur})`
    );
    assert(
      (cmp.our.score > cmp.enemy.score) === (cmp.winProb.our > 0.5),
      `${label}: favored side in points must match win %`
    );
  }
  assertWinProbMatchesDisplayScores(cmp, "wombo vs poke");

  const sample648 = SC.duelWinProbFromDisplayScores(648, 527);
  assert(
    Math.round(sample648.our * 100) === 55 && Math.round(sample648.enemy * 100) === 45,
    `648 vs 527 should read ~55/45, got ${Math.round(sample648.our * 100)}/${Math.round(sample648.enemy * 100)}`
  );

  const userComp = {
    Top: "Galio",
    Jungle: "Naafiri",
    Mid: "Ryze",
    Bot: "Caitlyn",
    Support: "Bard",
  };
  const enemyComp = {
    Top: "Rumble",
    Jungle: "Trundle",
    Mid: "Cassiopeia",
    Bot: "Ashe",
    Support: "Séraphine",
  };
  for (const slot of ["Top", "Jungle", "Mid", "Bot", "Support"]) {
    const lane = SC.scoreLaneMatchup(userComp[slot], enemyComp[slot], slot, byName, meta);
    assert(lane.verdict === "win" || lane.verdict === "lose", `${slot} must resolve win/lose, got ${lane.verdict}`);
    assert(lane.verdict !== "even", `${slot} must never be even`);
    assert(lane.note && !lane.note.includes("prio vague et jungle décident"), `${slot} note must be specific`);
    console.log(`  lane ${slot}: ${lane.verdict} (${lane.margin}) — ${lane.note}`);
  }

  const LML = sandbox.LoLLaneMatchupLogic;
  assert(LML, "LoLLaneMatchupLogic export missing");
  assert(laneData.stats.totalPairs >= 170 * 169 * 5, `lane matrix too small: ${laneData.stats.totalPairs}`);
  const kitChecks = [
    ["Caitlyn", "Ashe", "Bot", "win", /portée|range/i],
    ["Darius", "Malphite", "Top", "win", /%PV|bruiser|tank|anti-dash/i],
    ["Ashe", "Caitlyn", "Bot", "lose", /portée|range/i],
    ["Zed", "Lux", "Mid", "win", /assassin|burst/i],
    ["Morgana", "Blitzcrank", "Support", "win", /hook|black|shield|spell|immobile/i],
  ];
  for (const [a, b, slot, expect, reasonRx] of kitChecks) {
    const lane = SC.scoreLaneMatchup(a, b, slot, byName, meta);
    assert(lane.verdict === expect, `${a} vs ${b} ${slot} expected ${expect}, got ${lane.verdict} (${lane.margin})`);
    assert(reasonRx.test(lane.note), `${a} vs ${b} note should match kit logic: ${lane.note}`);
    const margin = LML.lookupMargin(a, b, slot);
    assert(margin != null && (expect === "win" ? margin > 0 : margin < 0), `${a} vs ${b} precomputed margin=${margin}`);
    console.log(`  kit ${slot} ${a}>${expect === "win" ? b : a}: margin=${lane.margin} — ${lane.note}`);
  }

  const userDuel = SC.evaluateDraftDuel(
    Object.values(userComp),
    Object.values(enemyComp),
    { ourComp: userComp, enemyComp, byName, metaMap: meta }
  );
  assert(
    userDuel.enemy.breakdown.winCondition > 150,
    `red hypercarry win condition must be 200+ range, got ${userDuel.enemy.breakdown.winCondition}`
  );
  assert(
    userDuel.enemy.breakdown.winCondition > userDuel.enemy.breakdown.synergy * 0.5,
    `hypercarry win condition should dominate synergy: wc=${userDuel.enemy.breakdown.winCondition} syn=${userDuel.enemy.breakdown.synergy}`
  );
  assert(
    userDuel.margin < 0 && userDuel.winProb.enemy > userDuel.winProb.our,
    `protected hypercarry should win duel: margin=${userDuel.margin} win=${Math.round(userDuel.winProb.enemy * 100)}%`
  );
  const scoreFav = userDuel.our.total >= userDuel.enemy.total ? "our" : "enemy";
  const probFav = userDuel.winProb.our >= userDuel.winProb.enemy ? "our" : "enemy";
  assert(
    scoreFav === probFav,
    `display score favorite must match win%: scores ${userDuel.our.total}/${userDuel.enemy.total} win% ${Math.round(userDuel.winProb.our * 100)}/${Math.round(userDuel.winProb.enemy * 100)}`
  );
  assert(
    (userDuel.detail?.cross?.plan?.enemy || 0) > 0,
    "hypercarry vs engage should register plan clash edge for red"
  );

  const LDI = sandbox.LoLDraftInteractions;
  assert(LDI, "LoLDraftInteractions export missing");
  const ruleCount = LDI.ruleCount();
  assert(ruleCount >= 150, `expected 150+ interaction rules, got ${ruleCount}`);
  console.log(`  interaction rules loaded: ${ruleCount} (comp=${LDI.COMP_CLASH_RULES.length} pair=${LDI.CHAMP_PAIR_RULES.length} curated=${LDI.CURATED_COUNTERS.length})`);

  const topIx = userDuel.detail?.topInteractions || userDuel.detail?.cross?.topPairs || [];
  assert(topIx.length >= 3, `user comp duel should surface key interactions, got ${topIx.length}`);
  const ixReasons = topIx.map((p) => p.reason || "").join(" | ");
  console.log(`  user comp top interactions: ${ixReasons.slice(0, 240)}`);
  assert(
    ixReasons.includes("Hypercarry protégé") || ixReasons.includes("front-to-back") || ixReasons.includes("Séraphine") || ixReasons.includes("Seraphine") || ixReasons.includes("peel"),
    `expected hypercarry/peel interaction in: ${ixReasons.slice(0, 120)}`
  );

  const galioProf = SC.buildProfile(byName.get("Galio"), meta);
  const naafiriProf = SC.buildProfile(byName.get("Naafiri"), meta);
  const seraphineChamp = champs.find((c) => c.name === "Séraphine") || champs.find((c) => c.name === "Seraphine");
  const seraphineProf = SC.buildProfile(seraphineChamp, meta);
  const pairNaafiriSeraphine = LDI.evaluateChampPair(naafiriProf, seraphineProf);
  assert(pairNaafiriSeraphine.enemy >= pairNaafiriSeraphine.our, "Seraphine should counter Naafiri dive");
  assert(
    pairNaafiriSeraphine.reasons.some((r) => /peel|dive|Séraphine|Seraphine/i.test(r)),
    `Naafiri vs Seraphine reason: ${pairNaafiriSeraphine.reasons.join("; ")}`
  );

  const caitlynProf = SC.buildProfile(byName.get("Caitlyn"), meta);
  const asheProf = SC.buildProfile(byName.get("Ashe"), meta);
  const pairCaitAshe = LDI.evaluateChampPair(caitlynProf, asheProf);
  assert(pairCaitAshe.our >= 15, `Caitlyn should edge Ashe: ${pairCaitAshe.our}`);

  const womboVsPokeIx = duel.detail?.cross?.topPairs || [];
  assert(
    womboVsPokeIx.some((p) => /poke|disengage|engage|Win condition/i.test(p.reason || "")),
    `wombo vs poke should show comp clash: ${womboVsPokeIx.map((p) => p.reason).join("; ")}`
  );

  const hyperTest = SC.evaluateDraftDuel(
    ["Jinx", "Lulu", "Malphite", "Jarvan IV", "Orianna"],
    ["Renekton", "Lee Sin", "LeBlanc", "Lucian", "Braum"],
    {
      ourComp: { Top: "Malphite", Jungle: "Jarvan IV", Mid: "Orianna", Bot: "Jinx", Support: "Lulu" },
      enemyComp: { Top: "Renekton", Jungle: "Lee Sin", Mid: "LeBlanc", Bot: "Lucian", Support: "Braum" },
      byName,
      metaMap: meta,
    }
  );
  assert(
    hyperTest.enemy.breakdown.winCondition <= hyperTest.our.breakdown.winCondition + 50,
    "protected hypercarry should not lose badly to all-in in win condition axis"
  );

  const enemyCompFr = { ...enemyComp, Support: "Séraphine" };
  const aliasDuel = SC.evaluateDraftDuel(
    Object.values(userComp),
    Object.values(enemyCompFr),
    { ourComp: userComp, enemyComp: enemyCompFr, byName, metaMap: meta }
  );
  assert(
    aliasDuel.enemy.breakdown.winCondition === userDuel.enemy.breakdown.winCondition,
    "Séraphine and Seraphine must resolve to the same win-condition score"
  );

  const cmpUser = D.compareComps(userComp, enemyCompFr, byName, meta);
  assert(cmpUser.complete && cmpUser.winProb.enemy > cmpUser.winProb.our, "macro compareComps should favor red hypercarry comp");
  assertWinProbMatchesDisplayScores(cmpUser, "hypercarry comp");

  const borosNames = ["Jarvan IV", "Pantheon", "Leona", "Xayah", "Tristana"];
  const borosMtg = sandbox.MTGColorPie.colorCoherence(
    borosNames.map((n) => ({ name: n, colors: SC.buildProfile(byName.get(n), meta).colors })).filter((p) => p.colors)
  );
  assert(borosMtg.score > 20, `multi-color spread should score positively, got ${borosMtg.score}`);
  assert(
    ["guild", "enemy_dual", "shard", "wedge"].includes(borosMtg.combination?.type),
    `expected named MTG identity (Boros/Gruul/etc.), got ${borosMtg.combination?.type} (${borosMtg.combination?.name})`
  );

  const userMacroMtgOur = SC.macroMtgScore(Object.values(userComp), { byName, metaMap: meta, oppNames: [] });
  const userMacroMtgEn = SC.macroMtgScore(Object.values(enemyCompFr), { byName, metaMap: meta, oppNames: [] });
  assert(
    userMacroMtgOur.score >= 200 && userMacroMtgEn.score >= 150,
    `MTG identity must scale to hundreds in breakdown: blue=${userMacroMtgOur.score} red=${userMacroMtgEn.score}`
  );
  assert(
    userDuel.our.breakdown.mtg === userMacroMtgOur.score && userDuel.enemy.breakdown.mtg === userMacroMtgEn.score,
    `breakdown MTG must match macroMtgScore: ui ${userDuel.our.breakdown.mtg}/${userDuel.enemy.breakdown.mtg} macro ${userMacroMtgOur.score}/${userMacroMtgEn.score}`
  );
  assert(
    userDuel.our.breakdown.mtg >= userDuel.our.breakdown.synergy * 0.35,
    `MTG identity should weigh visibly vs synergy: mtg=${userDuel.our.breakdown.mtg} syn=${userDuel.our.breakdown.synergy}`
  );

  function pastilleCodes(names) {
    return sandbox.MTGColorPie.pastillePairFromSummary(
      sandbox.MTGColorPie.teamColorSummary(names, byName, meta)
    )
      .map((p) => p.code)
      .join("");
  }

  const bluePastilles = pastilleCodes(["Galio", "Naafiri", "Ryze", "Caitlyn", "Bard"]);
  const redPastilles = pastilleCodes(["Rumble", "Trundle", "Cassiopeia", "Ashe", "Séraphine"]);
  const rbPastilles = pastilleCodes(["Draven", "Nautilus", "Renekton", "Elise", "Syndra"]);
  assert(bluePastilles !== "WU", `blue comp pastilles must not default to WU, got ${bluePastilles}`);
  assert(redPastilles !== "WU", `red comp pastilles must not default to WU, got ${redPastilles}`);
  assert(rbPastilles !== "WU", `RB comp pastilles must not default to WU, got ${rbPastilles}`);
  assert(rbPastilles.includes("R"), `RB comp should show red, got ${rbPastilles}`);
  assert(bluePastilles.includes("U"), `blue comp should show blue, got ${bluePastilles}`);
  console.log(`  MTG pastilles blue=${bluePastilles} red=${redPastilles} rb=${rbPastilles}`);

  const hoverSession = D.createSession("hover-priority", "blue");
  assert(
    D.HOVER_SLOT_PRIORITY.join(",") === "Bot,Jungle,Mid,Support,Top",
    "hover priority must be ADC → Jungle → Mid → Support → Top"
  );
  assert(D.dynamicHoverPriority(hoverSession, "blue")[0] === "Bot", "no enemy picks → blind Bot first");
  hoverSession.picks.red = [{ name: "Rumble", slot: "Top", order: 1, pinned: true }];
  hoverSession.stepIndex = 6;
  assert(
    D.dynamicHoverPriority(hoverSession, "blue")[0] === "Top",
    "enemy Top only → dynamicHoverPriority blue returns Top first"
  );
  const botOnly = D.createSession("enemy-bot-only", "blue");
  botOnly.picks.red = [{ name: "Varus", slot: "Bot", order: 1, pinned: true }];
  botOnly.stepIndex = 6;
  assert(
    D.dynamicHoverPriority(botOnly, "blue")[0] === "Bot",
    "enemy Bot only (Varus) → Bot first"
  );
  hoverSession.picks.red.push({ name: "Ashe", slot: "Bot", order: 2, pinned: true });
  const priEnemy = D.dynamicHoverPriority(hoverSession, "blue");
  assert(priEnemy[0] === "Bot" && priEnemy[1] === "Top", `counter order ADC before Top: ${priEnemy.join(",")}`);
  assert(priEnemy.indexOf("Jungle") === 2, `counter lanes before Jungle: ${priEnemy.join(",")}`);
  const mirror = D.resolveHoverPick(hoverSession, "red", "Top");
  assert(mirror?.side === "blue" && mirror?.slot === "Top", "hover enemy Top → blue Top counter");
  const emptyEnemy = D.resolveHoverPick(hoverSession, "red", "Jungle");
  assert(
    emptyEnemy?.side === "blue" && emptyEnemy?.slot === "Bot",
    "hover enemy empty cell → next dynamic counter lane, not hovered lane"
  );
  const exploreJungle = D.resolveHoverPick(hoverSession, "blue", "Jungle");
  assert(
    exploreJungle?.side === "blue" && exploreJungle?.slot === "Jungle",
    "hover our empty cell previews that lane"
  );

  const redVsAdc = D.createSession("red-vs-adc-hover", "blue");
  redVsAdc.picks.blue = [{ name: "Varus", slot: "Bot", order: 1, pinned: true }];
  redVsAdc.stepIndex = 7;
  assert(D.defaultHoverPick(redVsAdc, "red")?.slot === "Bot", "red turn + enemy ADC → hover Bot");
  const hoverEnemyAdc = D.resolveHoverPick(redVsAdc, "blue", "Bot");
  assert(hoverEnemyAdc?.side === "red" && hoverEnemyAdc?.slot === "Bot", "hover blue ADC → red Bot counter");

  const asRed = D.createSession("as-red-hover", "red");
  asRed.picks.blue = [{ name: "Varus", slot: "Bot", order: 1, pinned: true }];
  asRed.stepIndex = 7;
  assert(D.defaultHoverPick(asRed, "red")?.slot === "Bot", "playing red: enemy ADC → Bot priority");
  assert(
    D.resolveHoverPick(asRed, "blue", "Bot")?.side === "red",
    "playing red: hover enemy ADC coaches red side"
  );

  const redCounterAdc = D.createSession("red-vs-adc", "blue");
  redCounterAdc.bans.blue = ["Orianna", "Akali", "Kayle", null, null];
  redCounterAdc.bans.red = ["Twisted Fate", "Camille", "Kog'Maw", null, null];
  redCounterAdc.picks.blue = [{ name: "Varus", slot: "Bot", order: 1, pinned: true }];
  redCounterAdc.stepIndex = 7;
  const redSlot = D.preferredBlindSlot(redCounterAdc, "red");
  assert(redSlot === "Bot", `red should target ADC counter when blue has Varus, got ${redSlot}`);
  D.suggestNextFocus(redCounterAdc);
  assert(
    redCounterAdc.focus?.slot === "Bot" && !redCounterAdc.focus?.userLocked,
    `default focus after enemy Varus must be Bot, got ${redCounterAdc.focus?.slot}`
  );
  redCounterAdc.focus = { type: "pick", side: "red", slot: "Top", userLocked: true };
  D.normalizeSession(redCounterAdc);
  assert(
    redCounterAdc.focus?.slot === "Top" && redCounterAdc.focus?.userLocked,
    `user-locked Top must survive normalize after enemy Varus, got ${redCounterAdc.focus?.slot}`
  );
  const topHover = D.resolveHoverPick(redCounterAdc, "red", "Top");
  assert(topHover?.slot === "Top", `hovering red Top when user-locked must preview Top, got ${topHover?.slot}`);
  const coachTop = D.coachPickTarget(redCounterAdc, "red");
  assert(coachTop?.slot === "Top", `coachPickTarget must respect user-locked Top, got ${coachTop?.slot}`);
  const recTop = D.getRecommendations(redCounterAdc, champs, meta, byName, [], 6, null, { skipCache: true });
  assert(
    recTop.slot === "Top" && recTop.coachHint.includes("Top"),
    `recommendations must coach user-locked Top: ${recTop.coachHint}`
  );
  assert(
    D.DISPLAY_SLOTS.join(",") === "Top,Jungle,Mid,Bot,Support",
    "display order must be standard lane order (Top → Support)"
  );
  assert(
    D.HOVER_SLOT_PRIORITY.join(",") === "Bot,Jungle,Mid,Support,Top",
    "hover/coach priority must stay Bot-first"
  );
  const hoverRecSession = D.createSession("hover-rec", "blue");
  hoverRecSession.stepIndex = 6;
  hoverRecSession.hoverSource = { side: "blue", slot: "Jungle" };
  hoverRecSession.hoverPick = { side: "blue", slot: "Jungle" };
  const hoverRec = D.getRecommendations(hoverRecSession, champs, meta, byName, [], 6, null, { skipCache: true });
  assert(hoverRec.slot === "Jungle", `hover pick must drive recommendations, got ${hoverRec.slot}`);

  const pickFlow = D.createSession("pick-flow", "blue");
  const banNames = [
    "Orianna",
    "Twisted Fate",
    "Akali",
    "Camille",
    "Kayle",
    "Kog'Maw",
    "Syndra",
    "Zed",
    "Azir",
    "Yasuo",
  ];
  let banIdx = 0;
  for (let i = 0; i < 6; i++) {
    const st = D.getStep(pickFlow);
    const banResult = D.applyAction(
      pickFlow,
      { championName: banNames[banIdx++], banIndex: st.banIndex },
      [],
      { byName, metaMap: meta }
    );
    assert(banResult.ok, `ban ${i} should succeed`);
  }
  assert(pickFlow.stepIndex === 6, `after bans stepIndex must be 6, got ${pickFlow.stepIndex}`);
  assert(D.getStep(pickFlow)?.type === "pick", "first pick step expected");

  const banFocus = D.createSession("ban-focus", "blue");
  banFocus.focus = { type: "ban", side: "blue", banIndex: 0 };
  const b1 = D.getStep(banFocus);
  const b1Result = D.applyAction(
    banFocus,
    { championName: "Renata Glasc", banIndex: b1.banIndex },
    [],
    { byName, metaMap: meta }
  );
  assert(b1Result.ok, "first ban should succeed");
  assert(banFocus.bans.blue[0] === "Renata Glasc", "B1 must be filled");
  assert(
    banFocus.focus?.type === "ban" && banFocus.focus.side === "red" && banFocus.focus.banIndex === 0,
    `focus must advance to enemy B1, got ${JSON.stringify(banFocus.focus)}`
  );
  assert(!banFocus.hoverPick && !banFocus.hoverSource, "hover must clear after ban");

  pickFlow.focus = { type: "pick", side: "blue", slot: "Bot", userLocked: true };
  D.normalizeSession(pickFlow, { resyncStep: false });
  assert(
    pickFlow.focus?.slot === "Bot" && pickFlow.focus?.userLocked,
    "user-locked lane must survive lightweight normalize"
  );
  const pickResult = D.recordAction(
    pickFlow,
    { type: "pick", side: "blue", name: jinx.name, slot: "Bot" },
    [],
    { byName, metaMap: meta }
  );
  assert(pickResult.ok && pickResult.inOrder, "in-order pick should succeed");
  assert(pickFlow.stepIndex === 7, `pick must advance stepIndex to 7, got ${pickFlow.stepIndex}`);
  assert(
    pickFlow.picks.blue.some((p) => p.name === "Jinx" && p.slot === "Bot"),
    "Jinx must be placed on Bot"
  );

  const luluBot = SC.scoreMacroPick(lulu, "Bot", {
    teamNames: [],
    enemyNames: [],
    byName,
    metaMap: meta,
    side: "our",
    allowOffRole: false,
  });
  assert(luluBot.score < -500, `Lulu Bot macro should reject off-role, got ${luluBot.score}`);

  // Logic-based comp rules (NOT win-rate statistics)
  const pokePlanHits = (duel.detail?.cross?.plan?.hits || []).map((h) => h.reason).join(" ");
  assert(
    /poke|disengage|Disengage kite/i.test(pokePlanHits),
    `Logic poke>engage: plan clash must cite disengage, got ${pokePlanHits}`
  );

  const hyperPeelProfiles = ["Ashe", "Séraphine", "Rumble", "Trundle", "Cassiopeia"].map((n) =>
    SC.buildProfile(byName.get(n) || champs.find((c) => c.name === n || c.nameEn === n), meta)
  );
  const engageProfiles = ["Galio", "Naafiri", "Ryze", "Caitlyn", "Bard"].map((n) =>
    SC.buildProfile(byName.get(n), meta)
  );
  const peelClash = LDI.evaluateCompClashes(
    hyperPeelProfiles,
    engageProfiles,
    "hypercarry",
    "teamfight_engage",
    D.detectCompPlan(hyperPeelProfiles),
    D.detectCompPlan(engageProfiles)
  );
  assert(
    peelClash.hits.some((h) => /Hypercarry|Peel enchanter|protégé|enchanter/i.test(h.reason)),
    `Logic peel>engage must fire for protected hypercarry: ${peelClash.hits.map((h) => h.reason).join("; ")}`
  );

  const engageVsSplit = SC.evaluateDraftDuel(
    ["Ornn", "Sejuani", "Orianna", "Jinx", "Rell"],
    ["Fiora", "Viego", "Twisted Fate", "Ezreal", "Karma"],
    {
      ourComp: { Top: "Ornn", Jungle: "Sejuani", Mid: "Orianna", Bot: "Jinx", Support: "Rell" },
      enemyComp: { Top: "Fiora", Jungle: "Viego", Mid: "Twisted Fate", Bot: "Ezreal", Support: "Karma" },
      byName,
      metaMap: meta,
    }
  );
  assert(
    engageVsSplit.margin > 0 && engageVsSplit.winProb.our > engageVsSplit.winProb.enemy,
    `Logic engage>split: margin=${engageVsSplit.margin}`
  );

  const tempoProfiles = ["Renekton", "Lee Sin", "LeBlanc", "Lucian", "Nautilus"].map((n) =>
    SC.buildProfile(byName.get(n), meta)
  );
  const unpeeledHyperProfiles = ["Gangplank", "Lillia", "Viktor", "Aphelios", "Blitzcrank"].map((n) =>
    SC.buildProfile(byName.get(n), meta)
  );
  const tempoClash = LDI.evaluateCompClashes(
    tempoProfiles,
    unpeeledHyperProfiles,
    "all_in",
    "hypercarry",
    D.detectCompPlan(tempoProfiles),
    D.detectCompPlan(unpeeledHyperProfiles)
  );
  assert(
    tempoClash.hits.some((h) => /All-in tempo > hypercarry non protégé/i.test(h.reason)),
    `Logic all-in>unpeeled hyper rule must fire: ${tempoClash.hits.map((h) => h.reason).join("; ")}`
  );

  const logicGalioComp = SC.evaluateDraftDuel(
    Object.values(userComp),
    Object.values(enemyCompFr),
    { ourComp: userComp, enemyComp: enemyCompFr, byName, metaMap: meta }
  );
  assert(
    logicGalioComp.detail?.cross?.plan?.enemyPlan === "hypercarry",
    `Logic user comp: red must be hypercarry, got ${logicGalioComp.detail?.cross?.plan?.enemyPlan}`
  );
  assert(
    logicGalioComp.detail?.cross?.plan?.hits?.some((h) => /Hypercarry|front-to-back|peel|Peel enchanter/i.test(h.reason)),
    "Logic hypercarry peel > engage rule must fire for user comp"
  );
  assert(
    logicGalioComp.margin < 0,
    `Logic user comp: protected hypercarry (red) must win duel, margin=${logicGalioComp.margin}`
  );

  assert(ruleCount >= 210, `Logic tuning should load 210+ rules, got ${ruleCount}`);

  const engageVsPeel = SC.evaluateDraftDuel(
    ["Malphite", "Jarvan IV", "Orianna", "Miss Fortune", "Leona"],
    ["Gnar", "Trundle", "Cassiopeia", "Ashe", "Séraphine"],
    {
      ourComp: { Top: "Malphite", Jungle: "Jarvan IV", Mid: "Orianna", Bot: "Miss Fortune", Support: "Leona" },
      enemyComp: { Top: "Gnar", Jungle: "Trundle", Mid: "Cassiopeia", Bot: "Ashe", Support: "Séraphine" },
      byName,
      metaMap: meta,
    }
  );
  assert(
    engageVsPeel.margin < 0 && engageVsPeel.winProb.enemy > engageVsPeel.winProb.our,
    `engage vs protected hypercarry must favor peel side: margin=${engageVsPeel.margin}`
  );
  assert(
    engageVsPeel.detail?.cross?.plan?.enemyPlan === "hypercarry",
    `protected ADC comp must be hypercarry, got ${engageVsPeel.detail?.cross?.plan?.enemyPlan}`
  );

  const antiDashVsDive = SC.evaluateDraftDuel(
    ["Camille", "Xin Zhao", "Vex", "Ezreal", "Bard"],
    ["Sion", "Rek'Sai", "LeBlanc", "Aphelios", "Lulu"],
    {
      ourComp: { Top: "Camille", Jungle: "Xin Zhao", Mid: "Vex", Bot: "Ezreal", Support: "Bard" },
      enemyComp: { Top: "Sion", Jungle: "Rek'Sai", Mid: "LeBlanc", Bot: "Aphelios", Support: "Lulu" },
      byName,
      metaMap: meta,
    }
  );
  assert(
    antiDashVsDive.margin > 0 && antiDashVsDive.winProb.our > antiDashVsDive.winProb.enemy,
    `anti-dash comp must beat dive: margin=${antiDashVsDive.margin}`
  );
  const antiDashHits = (antiDashVsDive.detail?.cross?.plan?.hits || [])
    .concat(antiDashVsDive.detail?.cross?.topPairs || [])
    .map((h) => h.reason || "")
    .join(" ");
  assert(
    /Anti-dash|anti-dash/i.test(antiDashHits),
    `anti-dash vs dive must cite anti-dash rule: ${antiDashHits.slice(0, 120)}`
  );

  assert(
    Math.abs(userDuel.margin) <= 450 && userDuel.winProb.enemy >= 0.52 && userDuel.winProb.enemy <= 0.72,
    `user comp margin should be moderate peel win: margin=${userDuel.margin} win=${Math.round(userDuel.winProb.enemy * 100)}%`
  );
  assert(
    userDuel.detail?.cross?.plan?.ourPlan === "pick_global",
    `Galio dive comp must be pick_global, got ${userDuel.detail?.cross?.plan?.ourPlan}`
  );

  const CL = sandbox.LoLChampionClasses;
  assert(CL, "LoLChampionClasses export missing");
  assert(classData.championCount === 172, `expected 172 champs mapped, got ${classData.championCount}`);
  assert(CL.ruleCount() >= 30, `class interaction rules: ${CL.ruleCount()}`);

  const malph = CL.getProfile("Malphite");
  const zed = CL.getProfile("Zed");
  assert(malph.primary === "Vanguard", `Malphite should be Vanguard, got ${malph.primary}`);
  assert(zed.primary === "Assassin", `Zed should be Assassin, got ${zed.primary}`);

  const tankVsAss = CL.pairClassEdge("Malphite", "Zed", { lane: true });
  assert(tankVsAss.our > 0, `Vanguard should beat Assassin in lane: ${tankVsAss.reason}`);
  assert(/Tank absorbe|Frontline/i.test(tankVsAss.reason || ""), `French reason expected, got ${tankVsAss.reason}`);

  const adcVsTank = CL.pairClassEdge("Jinx", "Malphite", { lane: true });
  assert(adcVsTank.our > 0 || adcVsTank.enemy > 0, "Marksman vs Tank should have class edge");

  const classDuel = SC.evaluateDraftDuel(
    ["Malphite", "Sejuani", "Orianna", "Jinx", "Lulu"],
    ["Darius", "Lee Sin", "Ahri", "Caitlyn", "Thresh"],
    {
      ourComp: { Top: "Malphite", Jungle: "Sejuani", Mid: "Orianna", Bot: "Jinx", Support: "Lulu" },
      enemyComp: { Top: "Darius", Jungle: "Lee Sin", Mid: "Ahri", Bot: "Caitlyn", Support: "Thresh" },
      byName,
      metaMap: meta,
    }
  );
  const classIx = (classDuel.detail?.cross?.topPairs || []).some((p) =>
    /Tank|Marksman|Frontline|Slayer|burst|classe|Vanguard|Assassin/i.test(p.reason || "")
  );
  assert(classIx || classDuel.detail?.cross?.matchup !== 0, "class interactions should affect duel");
  console.log(`  class duel example: margin=${classDuel.margin} top=${(classDuel.detail?.topInteractions || classDuel.detail?.cross?.topPairs || []).slice(0, 2).map((p) => p.reason).join(" · ")}`);

  const vaynePick = CL.scorePickClassFit("Vayne", "Bot", "Malphite");
  assert(vaynePick.score > 0, "Vayne Bot vs Malphite should score class counter");
  assert(vaynePick.reasons.some((r) => /Marksman|Tank|gapclose|Classe/i.test(r)), `class pick reasons: ${vaynePick.reasons.join("; ")}`);

  const swapFocusS = D.createSession("swap-focus", "blue");
  swapFocusS.focus = { type: "swap", side: "blue", slot: "Bot" };
  D.normalizeSession(swapFocusS);
  assert(swapFocusS.focus?.type === "swap" && swapFocusS.focus.slot === "Bot", "normalizeSession must preserve swap focus");
  assert(!D.needsCoachPickAlign(swapFocusS), "swap focus must not trigger coach pick align");

  const swapS = D.createSession("swap", "blue");
  D.recordAction(swapS, { type: "pick", side: "blue", name: "Jinx", slot: "Bot" }, [swapS], { byName, metaMap: meta });
  D.recordAction(swapS, { type: "pick", side: "blue", name: "Lulu", slot: "Support" }, [swapS], { byName, metaMap: meta });
  const swapRes = D.swapPickSlots(swapS, "blue", "Bot", "Support");
  assert(swapRes.ok, "swapPickSlots filled-filled should succeed");
  assert(/échangés/i.test(swapRes.message), `swap message expected: ${swapRes.message}`);
  const afterSwap = D.pickBySlot(swapS, "blue");
  assert(afterSwap.Bot === "Lulu" && afterSwap.Support === "Jinx", "swapPickSlots should exchange champions");

  const moveS = D.createSession("move", "blue");
  D.recordAction(moveS, { type: "pick", side: "blue", name: "Malphite", slot: "Top" }, [moveS], { byName, metaMap: meta });
  const moveRes = D.swapPickSlots(moveS, "blue", "Top", "Mid");
  assert(moveRes.ok, "swapPickSlots move to empty should succeed");
  assert(D.pickBySlot(moveS, "blue").Mid === "Malphite" && !D.pickBySlot(moveS, "blue").Top, "champ should move to empty slot");

  const replaceS = D.createSession("replace", "blue");
  D.recordAction(replaceS, { type: "pick", side: "blue", name: "Jinx", slot: "Bot" }, [replaceS], { byName, metaMap: meta });
  const replaceRes = D.manualAssign(replaceS, { type: "pick", side: "blue", name: "Caitlyn", slot: "Bot" }, [replaceS], { byName, metaMap: meta });
  assert(replaceRes.ok, "manualAssign should replace occupied slot");
  assert(D.pickBySlot(replaceS, "blue").Bot === "Caitlyn", "occupied slot should be replaced");

  console.log("OK — LoL draft scoring smoke tests passed");
  console.log(`  phaseWeights depth0→1: tier ${w0.tier.toFixed(2)}→${w1.tier.toFixed(2)}, counter ${w0.counter.toFixed(2)}→${w1.counter.toFixed(2)}`);
  console.log(`  hypercarry plan: ${plan.label} (${plan.completeness}%)`);
}

main();
