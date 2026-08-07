#!/usr/bin/env node
/** Tests CSS / index.html — références, cache-busting, tokens, accents, IDs. */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { assert, root } from "./_harness.mjs";

const pub = join(root, "public");
const html = readFileSync(join(pub, "index.html"), "utf8");

const cssFiles = readdirSync(pub).filter((f) => f.endsWith(".css"));
const jsFiles = readdirSync(pub).filter((f) => f.endsWith(".js"));
const cssText = Object.fromEntries(cssFiles.map((f) => [f, readFileSync(join(pub, f), "utf8")]));
const jsText = jsFiles.map((f) => readFileSync(join(pub, f), "utf8")).join("\n");

/* ---- 1. index.html ne référence que des fichiers existants, aucune feuille orpheline ---- */
const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith("data:"));
for (const ref of refs) {
  const file = ref.split(/[?#]/)[0];
  assert(existsSync(join(pub, file)), `index.html référence un fichier absent : ${ref}`);
}
for (const f of cssFiles) {
  assert(html.includes(`href="${f}?`) || html.includes(`href="${f}"`), `feuille CSS orpheline (non référencée) : ${f}`);
}

/* ---- 2. cache-busting : un seul ?v= partagé par tous les CSS/JS ---- */
const assets = refs.filter((u) => /\.(css|js)(\?|$)/.test(u));
const versions = new Set(assets.map((u) => (u.match(/\?v=([^&"]+)/) || [])[1]));
assert(assets.length > 0, "aucun asset CSS/JS référencé");
assert(!versions.has(undefined), `asset sans ?v= : ${assets.filter((u) => !/\?v=/.test(u)).join(", ")}`);
assert(versions.size === 1, `versions ?v= divergentes : ${[...versions].join(", ")}`);

/* ---- 3. tokens : mono centralisé, variables toutes définies ---- */
for (const [f, s] of Object.entries(cssText)) {
  if (f !== "tokens.css") {
    assert(!s.includes("JetBrains Mono"), `« JetBrains Mono » en dur hors tokens.css : ${f}`);
  }
  assert(!/var\(\s*--bg-panel\b/.test(s), `var(--bg-panel) fantôme dans ${f}`);
  assert(!/var\(\s*--muted\s*[,)]/.test(s), `var(--muted) fantôme dans ${f}`);
}
const definedVars = new Set();
const usedNoFallback = new Map();
for (const [f, s] of Object.entries(cssText)) {
  for (const m of s.matchAll(/(--[\w-]+)\s*:/g)) definedVars.add(m[1]);
  for (const m of s.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
    const before = s.slice(0, m.index).replace(/\s+$/, "");
    if (before.endsWith(",")) continue; /* fallback d'un autre var() */
    if (!usedNoFallback.has(m[1])) usedNoFallback.set(m[1], f);
  }
}
for (const [name, f] of usedNoFallback) {
  const ok = definedVars.has(name) || jsText.includes(name);
  assert(ok, `variable CSS jamais définie : var(${name}) (vue dans ${f})`);
}

/* ---- 4. accents d'équipe : plus de rgba codées en dur hors tokens.css ---- */
const hardAccent = /rgba\(\s*(?:110\s*,\s*231\s*,\s*183|224\s*,\s*93\s*,\s*93|240\s*,\s*138\s*,\s*114)\s*,/;
for (const [f, s] of Object.entries(cssText)) {
  if (f === "tokens.css") continue;
  assert(!hardAccent.test(s), `accent d'équipe codé en dur (utiliser --team-our/--team-enemy) : ${f}`);
}
assert(cssText["tokens.css"].includes("--team-our"), "tokens.css doit définir --team-our");
assert(cssText["tokens.css"].includes("--team-enemy"), "tokens.css doit définir --team-enemy");

/* ---- 5. les IDs consommés par app.js / draft-ui.js existent ---- */
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const consumers = ["app.js", "draft-ui.js"];
for (const f of consumers) {
  const s = readFileSync(join(pub, f), "utf8");
  const ids = new Set(
    [...s.matchAll(/getElementById\("([^"]+)"\)/g)]
      .concat([...s.matchAll(/querySelector\("#([\w-]+)"\)/g)])
      .map((m) => m[1])
  );
  for (const id of ids) {
    const staticOk = htmlIds.has(id);
    const dynamicOk =
      jsText.includes(`id="${id}"`) ||
      jsText.includes(`.id = "${id}"`) ||
      jsText.split(`"${id}"`).length - 1 > (jsText.split(`getElementById("${id}")`).length - 1);
    assert(staticOk || dynamicOk, `${f} consomme #${id}, absent d'index.html et jamais créé dynamiquement`);
  }
}
for (const id of [
  "view-guide",
  "guide-content",
  "tactics-templates-inline",
  "draft-board",
  "draft-pool",
  "draft-flash",
  "draft-session-bar",
  "tactics-result",
  "tactics-comp-score",
  "our-slots",
  "enemy-slots",
  "patch-table-body",
]) {
  assert(htmlIds.has(id), `ID critique absent d'index.html : #${id}`);
}

console.log("OK — test_css : références, versions, tokens, accents, IDs");
