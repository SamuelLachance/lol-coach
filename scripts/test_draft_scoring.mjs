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
  assert(macroTeam.breakdown.synergy > 0, "macro synergy should be positive");
  assert(macroTeam.breakdown.family > 0, "macro family should be positive");
  assert(
    macroTeam.total === macroTeam.breakdown.synergy + macroTeam.breakdown.family + macroTeam.breakdown.mtg,
    "macro total = synergy + family + mtg"
  );
  assert(macroTeam.breakdown.mtg !== undefined, "macro MTG breakdown present");

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
