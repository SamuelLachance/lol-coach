#!/usr/bin/env node
/** Rebuild validation — LoL draft scoring scenarios. */
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

function topPicks(D, session, champs, byName, meta, side, n = 8) {
  return champs
    .map((c) => {
      const r = D.scorePick(c, session, side, byName, meta);
      return { name: c.name, score: r.score, slot: r.slot, tier: meta[c.name]?.tierMeta || c.tierMeta, reasons: r.reasons };
    })
    .filter((x) => x.score > -1000)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function main() {
  const D = loadLoLDraft();
  assert(D, "LoLDraft missing");

  const meta = JSON.parse(readFileSync(join(root, "public/data/tactics-meta.json"), "utf8")).champions;
  const champs = JSON.parse(readFileSync(join(root, "public/data/champions.json"), "utf8")).champions;
  const byName = new Map(champs.map((c) => [c.name, c]));

  const w0 = D.phaseWeights(0);
  const w1 = D.phaseWeights(1);
  assert(w0.tier > w1.tier, "tier weight drops with depth");
  assert(w1.counter > w0.counter, "counter weight rises with depth");

  // Scenario: empty B1 blue
  const b1Session = D.createSession("b1", "blue");
  b1Session.stepIndex = 6;
  const b1Top = topPicks(D, b1Session, champs, byName, meta, "blue", 12);
  console.log("\n=== LoL B1 blue (top picks) ===");
  for (const p of b1Top.slice(0, 3)) {
    console.log(`  ${p.name}: ${Math.round(p.score)} (${p.tier}) slot=${p.slot} — ${p.reasons.slice(0, 2).join("; ")}`);
  }

  assert(b1Top[0].score > 0, `B1 top should score positively, got ${b1Top[0].name} ${b1Top[0].score}`);
  assert(["S", "A"].includes(b1Top[0].tier),
    `B1 top should be tier S/A flex, got ${b1Top[0].name} (${b1Top[0].tier})`);
  assert(
    b1Top[0].reasons.some((r) => /ADC|Blind/i.test(r)),
    `B1 top should mention blind ADC, got ${b1Top[0].reasons.join("; ")}`
  );

  const gimmicks = ["Yuumi", "Kalista", "Singed", "Taric"];
  for (const name of gimmicks) {
    const g = b1Top.find((p) => p.name === name);
    const score = D.scorePick(champs.find((c) => c.name === name), b1Session, "blue", byName, meta).score;
    if (g) assert(g.score < b1Top[0].score - 20, `${name} should not rank near top B1`);
    else assert(score < b1Top[2].score, `${name} B1 score should be below top 3`);
  }

  // Scenario: enemy Malphite + Yasuo partial wombo
  const womboSession = D.createSession("wombo", "blue");
  womboSession.stepIndex = 6;
  womboSession.picks.red = [
    { name: "Malphite", slot: "Top" },
    { name: "Yasuo", slot: "Mid" },
  ];
  const malph = champs.find((c) => c.name === "Malphite");
  const yas = champs.find((c) => c.name === "Yasuo");
  const malphBan = D.scoreBan(malph, womboSession, "blue", byName, meta);
  const yasBan = D.scoreBan(yas, womboSession, "blue", byName, meta);
  console.log("\n=== LoL wombo threat (Malphite+Yasuo) ===");
  console.log(`  Ban Malphite: ${malphBan.score} — ${malphBan.reasons.slice(0, 3).join("; ")}`);
  console.log(`  Ban Yasuo: ${yasBan.score} — ${yasBan.reasons.slice(0, 3).join("; ")}`);
  assert(
    malphBan.reasons.some((r) => /wombo|synergie|duo|Yasuo/i.test(r)) ||
      yasBan.reasons.some((r) => /wombo|synergie|duo|Malphite/i.test(r)),
    "Should recognize wombo threat in ban reasons"
  );
  assert(Math.max(malphBan.score, yasBan.score) >= 50, "Wombo ban should score high");

  // Hypercarry plan smoke
  const jinx = champs.find((c) => c.name === "Jinx");
  const lulu = champs.find((c) => c.name === "Lulu");
  const jv = D.buildVector(jinx, meta);
  const lv = D.buildVector(lulu, meta);
  const planBefore = D.detectCompPlan([jv]);
  const planAfter = D.detectCompPlan([jv, lv]);
  assert(planAfter.completeness > planBefore.completeness, "Lulu improves hypercarry plan");

  console.log("\nOK — LoL draft rebuild tests passed");
}

main();
