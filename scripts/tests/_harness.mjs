/** Harnais partagé : charge les modules public/*.js dans un sandbox vm + les données. */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadSandbox() {
  const sandbox = { global: {}, window: {}, globalThis: {}, console };
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
    "tactics-engine.js",
  ]) {
    vm.runInNewContext(readFileSync(join(root, "public", file), "utf8"), sandbox, { filename: file });
  }
  const laneData = JSON.parse(readFileSync(join(root, "public/data/lane-matchups.json"), "utf8"));
  sandbox.LoLLaneMatchupLogic.loadPrecomputed(laneData);
  const classData = JSON.parse(readFileSync(join(root, "public/data/champion-classes.json"), "utf8"));
  sandbox.LoLChampionClasses.loadPrecomputed(classData);
  return { sandbox, laneData, classData };
}

export function loadData() {
  const champs = JSON.parse(readFileSync(join(root, "public/data/champions.json"), "utf8")).champions;
  const meta = JSON.parse(readFileSync(join(root, "public/data/tactics-meta.json"), "utf8")).champions;
  const byName = new Map(champs.map((c) => [c.name, c]));
  return { champs, meta, byName };
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
