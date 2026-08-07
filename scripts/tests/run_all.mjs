#!/usr/bin/env node
/** Exécute tous les scripts/tests/test_*.mjs + le smoke test historique. Sort ≠ 0 au premier échec. */
import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const suites = readdirSync(here)
  .filter((f) => f.startsWith("test_") && f.endsWith(".mjs"))
  .map((f) => join(here, f));
suites.push(join(root, "scripts", "test_draft_scoring.mjs"));

let failed = 0;
for (const suite of suites) {
  const r = spawnSync(process.execPath, [suite], { stdio: "inherit" });
  if (r.status !== 0) {
    failed += 1;
    console.error(`FAIL ${suite}`);
  }
}
if (failed) {
  console.error(`${failed} suite(s) en échec`);
  process.exit(1);
}
console.log(`OK — ${suites.length} suites passées`);
