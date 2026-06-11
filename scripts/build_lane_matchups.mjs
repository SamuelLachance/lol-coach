#!/usr/bin/env node
/** Precompute all champ×champ×lane kit margins into public/data/lane-matchups.json */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "public/data/lane-matchups.json");

function loadLogic() {
  const sandbox = { global: {}, window: {}, globalThis: {} };
  sandbox.global = sandbox.window = sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(join(root, "public/lane-matchup-logic.js"), "utf8"), sandbox);
  return sandbox.LoLLaneMatchupLogic;
}

function main() {
  const LML = loadLogic();
  const champsData = JSON.parse(readFileSync(join(root, "public/data/champions.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(root, "public/data/tactics-meta.json"), "utf8")).champions;
  const champs = champsData.champions;
  const names = champs.map((c) => c.name);
  const n = names.length;
  const SLOTS = LML.SLOTS;
  const profiles = new Map(champs.map((c) => [c.name, LML.buildKitProfile(c, meta)]));

  const champIndex = {};
  names.forEach((name, i) => {
    champIndex[name] = i;
    champIndex[LML.norm(name)] = i;
  });

  const margins = {};
  let nonZero = 0;
  let total = 0;

  for (const slot of SLOTS) {
    const arr = new Int16Array(n * n);
    for (let ia = 0; ia < n; ia++) {
      const a = profiles.get(names[ia]);
      for (let ib = 0; ib < n; ib++) {
        if (ia === ib) continue;
        const b = profiles.get(names[ib]);
        const edge = LML.computeLaneKitEdge(a, b, slot);
        const margin = clamp(edge.margin, -127, 127);
        arr[ia * n + ib] = margin;
        total++;
        if (margin !== 0) nonZero++;
      }
    }
    margins[slot] = [...arr];
  }

  const payload = {
    version: "20250611-36",
    generatedAt: new Date().toISOString(),
    championCount: n,
    champs: names,
    champIndex,
    slots: SLOTS,
    margins,
    stats: {
      pairsPerLane: n * (n - 1),
      totalPairs: n * (n - 1) * SLOTS.length,
      nonZeroMargins: nonZero,
    },
  };

  writeFileSync(outPath, JSON.stringify(payload));
  console.log(`Wrote ${outPath}`);
  console.log(`  ${n} champions × ${SLOTS.length} lanes = ${payload.stats.totalPairs} directed pairs`);
  console.log(`  non-zero margins: ${nonZero} (${((nonZero / payload.stats.totalPairs) * 100).toFixed(1)}%)`);

  // Spot-check known matchups
  const checks = [
    ["Caitlyn", "Ashe", "Bot", "win"],
    ["Darius", "Malphite", "Top", "win"],
    ["Ashe", "Caitlyn", "Bot", "lose"],
    ["Malphite", "Darius", "Top", "lose"],
    ["Zed", "Lux", "Mid", "win"],
  ];
  for (const [a, b, slot, expect] of checks) {
    const ia = champIndex[a];
    const ib = champIndex[b];
    const m = margins[slot][ia * n + ib];
    const ok = expect === "win" ? m > 0 : m < 0;
    console.log(`  ${ok ? "OK" : "FAIL"} ${a} vs ${b} ${slot}: margin=${m}`);
    if (!ok) process.exitCode = 1;
  }
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

main();
