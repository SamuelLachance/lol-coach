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
  for (const file of ["lane-viability.js", "coaching-knowledge.js", "mtg-color-pie.js", "draft-scoring.js", "draft-engine.js"]) {
    vm.runInNewContext(readFileSync(join(root, "public", file), "utf8"), sandbox);
  }
  return sandbox;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function main() {
  const sandbox = loadLoLDraft();
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
  assert(macroTeam.breakdown.winCondition > 0, "win condition breakdown present");
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

  const userDuel = SC.evaluateDraftDuel(
    Object.values(userComp),
    Object.values(enemyComp),
    { ourComp: userComp, enemyComp, byName, metaMap: meta }
  );
  assert(
    userDuel.margin < 0 && userDuel.winProb.enemy > userDuel.winProb.our,
    `protected hypercarry should win duel: margin=${userDuel.margin} win=${Math.round(userDuel.winProb.enemy * 100)}%`
  );
  assert(
    (userDuel.detail?.cross?.plan?.enemy || 0) > 0,
    "hypercarry vs engage should register plan clash edge for red"
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

  const hoverSession = D.createSession("hover-priority", "blue");
  assert(
    D.HOVER_SLOT_PRIORITY.join(",") === "Bot,Jungle,Mid,Support,Top",
    "hover priority must be ADC → Jungle → Mid → Support → Top"
  );
  assert(D.dynamicHoverPriority(hoverSession, "blue")[0] === "Bot", "default hover starts ADC");
  hoverSession.picks.red = [{ name: "Rumble", slot: "Top", order: 1, pinned: true }];
  hoverSession.stepIndex = 6;
  assert(
    D.dynamicHoverPriority(hoverSession, "blue")[0] === "Top",
    "enemy Top revealed should prioritize our Top counter"
  );
  hoverSession.picks.red.push({ name: "Ashe", slot: "Bot", order: 2, pinned: true });
  const priEnemy = D.dynamicHoverPriority(hoverSession, "blue");
  assert(priEnemy[0] === "Bot" && priEnemy[1] === "Top", `counter order ADC before Top: ${priEnemy.join(",")}`);
  const mirror = D.resolveHoverPick(hoverSession, "red", "Top");
  assert(mirror?.side === "blue" && mirror?.slot === "Top", "hover enemy Top → blue Top counter");

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

  const luluBot = SC.scoreMacroPick(lulu, "Bot", {
    teamNames: [],
    enemyNames: [],
    byName,
    metaMap: meta,
    side: "our",
    allowOffRole: false,
  });
  assert(luluBot.score < -500, `Lulu Bot macro should reject off-role, got ${luluBot.score}`);

  console.log("OK — LoL draft scoring smoke tests passed");
  console.log(`  phaseWeights depth0→1: tier ${w0.tier.toFixed(2)}→${w1.tier.toFixed(2)}, counter ${w0.counter.toFixed(2)}→${w1.counter.toFixed(2)}`);
  console.log(`  hypercarry plan: ${plan.label} (${plan.completeness}%)`);
}

main();
