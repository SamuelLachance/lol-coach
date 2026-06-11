#!/usr/bin/env node
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { global: {}, window: {}, globalThis: {} };
sandbox.global = sandbox.window = sandbox.globalThis = sandbox;
for (const file of ["lane-viability.js", "coaching-knowledge.js", "mtg-color-pie.js", "draft-scoring.js", "draft-engine.js"]) {
  vm.runInNewContext(readFileSync(join(root, "public", file), "utf8"), sandbox);
}

const meta = JSON.parse(readFileSync(join(root, "public/data/tactics-meta.json"), "utf8")).champions;
const champs = JSON.parse(readFileSync(join(root, "public/data/champions.json"), "utf8")).champions;
const byName = new Map(champs.map((c) => [c.name, c]));
const D = sandbox.LoLDraft;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const s = D.createSession("test", "blue");
s.bans.blue = ["Orianna", "Akali", "Kayle", null, null];
s.bans.red = ["Twisted Fate", "Camille", "Kog'Maw", null, null];
s.picks.blue = [{ name: "Varus", slot: "Bot", order: 1 }];
D.normalizeSession(s);
while (D.getStep(s)?.side !== "red") s.stepIndex++;

console.log("step", D.getStep(s));

s.focus = { type: "pick", side: "red", slot: "Bot" };
const rec = D.getRecommendations(s, champs, meta, byName, [s], 6, null, { skipCache: true });
console.log("typed focus hint:", rec.coachHint);
console.log("typed focus items:", rec.items.map((i) => i.champion.name).join(", "));

s.focus = { side: "red", slot: "Bot" };
const rec2 = D.getRecommendations(s, champs, meta, byName, [s], 6, null, {
  focusTarget: { side: "red", slot: "Bot" },
  skipCache: true,
});
console.log("legacy focusTarget hint:", rec2.coachHint);
console.log("legacy focusTarget items:", rec2.items.slice(0, 6).map((i) => i.champion.name).join(", "));

D.normalizeSession(s);
const rec3 = D.getRecommendations(s, champs, meta, byName, [s], 6, null, { skipCache: true });
console.log("legacy session focus hint:", rec3.coachHint);
console.log("legacy session items:", rec3.items.slice(0, 6).map((i) => i.champion.name).join(", "));
assert(rec3.coachHint.includes("ADC") || rec3.coachHint.includes("≥"), "legacy focus must scope ADC");
