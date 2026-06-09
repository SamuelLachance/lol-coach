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
  for (const file of ["mtg-color-pie.js", "draft-scoring.js", "draft-engine.js"]) {
    vm.runInNewContext(readFileSync(join(root, "public", file), "utf8"), sandbox);
  }
  return sandbox.LoLDraft;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function main() {
  const D = loadLoLDraft();
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

  console.log("OK — LoL draft scoring smoke tests passed");
  console.log(`  phaseWeights depth0→1: tier ${w0.tier.toFixed(2)}→${w1.tier.toFixed(2)}, counter ${w0.counter.toFixed(2)}→${w1.counter.toFixed(2)}`);
  console.log(`  hypercarry plan: ${plan.label} (${plan.completeness}%)`);
}

main();
