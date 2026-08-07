#!/usr/bin/env node
/** Tests moteur de draft + UI (fonctions pures) — séquence, history, swap, fearless, timeline. */
import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";
import { loadSandbox, loadData, assert, root } from "./_harness.mjs";

const { sandbox } = loadSandbox();
vm.runInNewContext(readFileSync(join(root, "public", "draft-ui.js"), "utf8"), sandbox, {
  filename: "draft-ui.js",
});
const { champs, meta, byName } = loadData();
const D = sandbox.LoLDraft;
const UI = sandbox.LoLDraftUI;
const SCng = sandbox.LoLDraftScoring;
const ctx = { byName, metaMap: meta };

assert(D, "LoLDraft manquant");
assert(UI?.buildTimelineSteps, "LoLDraftUI.buildTimelineSteps manquant");

/* ---- 1. Séquence complète de 20 actions : stepLabel / pickNo / banNo ---- */
const banNames = [
  "Orianna", "Twisted Fate", "Akali", "Camille", "Kayle", "Kog'Maw",
  "Syndra", "Zed", "Azir", "Yasuo",
];
const pickPlan = {
  6: { name: "Jinx", slot: "Bot" },
  7: { name: "Caitlyn", slot: "Bot" },
  8: { name: "Vi", slot: "Jungle" },
  9: { name: "Lee Sin", slot: "Jungle" },
  10: { name: "Ahri", slot: "Mid" },
  11: { name: "Viktor", slot: "Mid" },
  16: { name: "Lulu", slot: "Support" },
  17: { name: "Thresh", slot: "Support" },
  18: { name: "Malphite", slot: "Top" },
  19: { name: "Renekton", slot: "Top" },
};
for (const p of Object.values(pickPlan)) {
  assert(byName.has(p.name), `champion fixture absent des données : ${p.name}`);
}

const seq = D.createSession("seq", "blue");
let banIdx = 0;
for (let i = 0; i < 20; i++) {
  const step = D.getStep(seq);
  assert(step, `étape ${i} manquante`);
  const label = D.stepLabel(seq);
  const sideFr = step.side === "blue" ? "Bleu" : "Rouge";
  if (step.type === "ban") {
    const banNo = banIdx + 1;
    const phase = step.banPhase === 2 ? "Phase 2" : "Phase 1";
    assert(
      label === `Ban ${phase} · ${banNo}/10 (${sideFr})`,
      `stepLabel ban étape ${i} : attendu "Ban ${phase} · ${banNo}/10 (${sideFr})", obtenu "${label}"`
    );
    const r = D.applyAction(seq, { championName: banNames[banIdx], banIndex: step.banIndex }, [], ctx);
    assert(r.ok, `ban ${banIdx} devrait réussir : ${r.error}`);
    banIdx++;
  } else {
    const pickNo = i < 12 ? i - 5 : i - 9;
    assert(
      label === `Pick ${pickNo}/10 — ${sideFr}`,
      `stepLabel pick étape ${i} : attendu "Pick ${pickNo}/10 — ${sideFr}", obtenu "${label}"`
    );
    assert(!/-\d/.test(label), `stepLabel négatif à l'étape ${i} : ${label}`);
    const plan = pickPlan[i];
    const r = D.applyAction(seq, { championName: plan.name, slot: plan.slot }, [], ctx);
    assert(r.ok, `pick étape ${i} (${plan.name}) devrait réussir : ${r.error}`);
  }
  assert(seq.stepIndex === i + 1, `stepIndex doit être ${i + 1}, obtenu ${seq.stepIndex}`);
}
assert(D.isComplete(seq), "draft doit être complète après 20 actions");
assert(D.stepLabel(seq) === "Draft terminé", `label final : ${D.stepLabel(seq)}`);
assert(seq.history.length === 20, `history doit contenir 20 entrées, obtenu ${seq.history.length}`);

/* ---- 2. Action invalide ⇒ history inchangé, undo cohérent ---- */
const inv = D.createSession("invalid", "blue");
const st0 = D.getStep(inv);
assert(D.applyAction(inv, { championName: "Orianna", banIndex: st0.banIndex }, [], ctx).ok, "ban valide");
assert(inv.history.length === 1, "history = 1 après ban valide");
const dup = D.applyAction(inv, { championName: "Orianna", banIndex: D.getStep(inv).banIndex }, [], ctx);
assert(!dup.ok, "champion déjà banni doit échouer");
assert(inv.history.length === 1, `échec ne doit pas pousser dans history (obtenu ${inv.history.length})`);
const badBan = D.applyAction(inv, { championName: "Zed", banIndex: 99 }, [], ctx);
assert(!badBan.ok && inv.history.length === 1, "banIndex invalide ne doit pas toucher history");
assert(D.applyAction(inv, { championName: "Twisted Fate", banIndex: D.getStep(inv).banIndex }, [], ctx).ok, "ban rouge valide");
assert(inv.history.length === 2, "history = 2 après deux bans valides");
const filledBan = D.applyAction(inv, { championName: "Zed", banIndex: 0 }, [], ctx);
assert(!filledBan.ok && inv.history.length === 2, "case ban remplie ne doit pas toucher history");
assert(D.undo(inv), "premier undo doit réussir");
assert(inv.stepIndex === 1 && !inv.bans.red[0], "un seul undo doit annuler le dernier ban");
assert(D.undo(inv), "second undo doit réussir");
assert(inv.stepIndex === 0 && !inv.bans.blue[0], "deux undos ⇒ état initial");
assert(!D.undo(inv), "troisième undo doit échouer (pas d'entrée fantôme)");

const invM = D.createSession("invalid-manual", "blue");
D.applyAction(invM, { championName: "Orianna", banIndex: 0 }, [], ctx);
const histLen = invM.history.length;
const unavailable = D.manualAssign(invM, { type: "pick", side: "red", name: "Orianna", slot: "Mid" }, [], ctx);
assert(!unavailable.ok, "manualAssign d'un champion banni côté adverse doit échouer");
assert(invM.history.length === histLen, "manualAssign en échec ne doit pas pousser dans history");
const fullPicks = D.createSession("full-picks", "blue");
for (const [n, sl] of [["Jinx", "Bot"], ["Vi", "Jungle"], ["Ahri", "Mid"], ["Lulu", "Support"], ["Malphite", "Top"]]) {
  assert(D.manualAssign(fullPicks, { type: "pick", side: "blue", name: n, slot: sl }, [], ctx).ok, `place ${n}`);
}
const before = fullPicks.history.length;
const noRoom = D.manualAssign(fullPicks, { type: "pick", side: "blue", name: "Caitlyn" }, [], ctx);
assert(!noRoom.ok, "picks pleins sans slot doit échouer");
assert(fullPicks.history.length === before, "échec picks pleins ne doit pas pousser dans history");

/* ---- 3. Swap conserve order et pinned ---- */
const swp = D.createSession("swap", "blue");
D.manualAssign(swp, { type: "pick", side: "blue", name: "Jinx", slot: "Bot" }, [], ctx);
D.manualAssign(swp, { type: "pick", side: "blue", name: "Lulu", slot: "Support" }, [], ctx);
const jinxBefore = D.pickAtSlot(swp, "blue", "Bot");
const luluBefore = D.pickAtSlot(swp, "blue", "Support");
assert(jinxBefore.order === 1 && luluBefore.order === 2, "orders initiaux P1/P2");
const swapRes = D.swapPickSlots(swp, "blue", "Bot", "Support");
assert(swapRes.ok, "swap doit réussir");
const jinxAfter = D.pickAtSlot(swp, "blue", "Support");
const luluAfter = D.pickAtSlot(swp, "blue", "Bot");
assert(jinxAfter?.name === "Jinx" && luluAfter?.name === "Lulu", "champions échangés");
assert(jinxAfter.order === 1 && luluAfter.order === 2, `order conservé après swap (${jinxAfter.order}/${luluAfter.order})`);
assert(jinxAfter.pinned === true && luluAfter.pinned === true, "pinned=true après swap");
const mv = D.createSession("move", "blue");
D.applyAction(mv, { championName: "Orianna", banIndex: 0 }, [], ctx);
for (let i = 1; i < 6; i++) D.applyAction(mv, { championName: banNames[i], banIndex: D.getStep(mv).banIndex }, [], ctx);
D.applyAction(mv, { championName: "Jinx" }, [], ctx);
const auto = mv.picks.blue.find((p) => p.name === "Jinx");
const autoSlot = auto.slot;
const autoOrder = auto.order;
const targetSlot = autoSlot === "Top" ? "Mid" : "Top";
const moveRes = D.swapPickSlots(mv, "blue", autoSlot, targetSlot);
assert(moveRes.ok, "déplacement vers case vide doit réussir");
const moved = mv.picks.blue.find((p) => p.name === "Jinx");
assert(moved.slot === targetSlot, "champion déplacé sur la case cible");
assert(moved.order === autoOrder, "order conservé au déplacement");
assert(moved.pinned === true, "déplacement manuel épingle le pick");
assert(D.undo(mv), "undo après swap");
const restored = mv.picks.blue.find((p) => p.name === "Jinx");
assert(restored.slot === autoSlot, "undo restaure le slot d'origine");

/* ---- 4. Fearless : picks G1 exclus en G2 ---- */
const g1 = D.createSession("Game 1", "blue", { fearless: true });
D.manualAssign(g1, { type: "pick", side: "blue", name: "Jinx", slot: "Bot" }, [], ctx);
D.manualAssign(g1, { type: "pick", side: "red", name: "Caitlyn", slot: "Bot" }, [], ctx);
const g2 = D.createSession("Game 2", "red", { fearless: true });
const all = [g1, g2];
const takenG2 = D.takenNames(g2, all);
assert(takenG2.has("Jinx") && takenG2.has("Caitlyn"), "fearless : picks G1 indisponibles en G2");
const availG2 = D.availableChampions(champs, g2, all);
assert(!availG2.some((c) => c.name === "Jinx"), "available exclut les picks G1");
const st = D.getStep(g2);
const fearlessBan = D.applyAction(g2, { championName: "Jinx", banIndex: st.banIndex }, all, ctx);
assert(!fearlessBan.ok && /fearless/i.test(fearlessBan.error), `erreur fearless attendue : ${fearlessBan.error}`);
assert(g2.history.length === 0, "échec fearless ne doit pas pousser dans history");

/* ---- 5. Cache des recommandations sensible au focusTarget ---- */
const rc = D.createSession("reco-cache", "blue");
rc.stepIndex = 6;
const recBot = D.getRecommendations(rc, champs, meta, byName, [], 6, null, {
  focusTarget: { type: "pick", side: "blue", slot: "Bot" },
});
const recSup = D.getRecommendations(rc, champs, meta, byName, [], 6, null, {
  focusTarget: { type: "pick", side: "blue", slot: "Support" },
});
assert(recBot.items.length && recSup.items.length, "recos non vides");
for (const item of recSup.items) {
  assert(
    D.playsSlotFor(item.champion, meta, "Support"),
    `cache périmé : ${item.champion.name} n'est pas viable Support`
  );
}
const recSup2 = D.getRecommendations(rc, champs, meta, byName, [], 6, null, {
  focusTarget: { type: "pick", side: "blue", slot: "Support" },
});
assert(
  recSup2.items[0]?.champion.name === recSup.items[0]?.champion.name,
  "même focusTarget ⇒ même résultat (cache stable)"
);

/* ---- 6. Liste ADC blind générée depuis les données ---- */
const adcs = D.blindSafeAdcNames(byName, meta);
assert(adcs.length >= 3, `liste ADC blind trop courte : ${adcs.length}`);
for (const name of adcs) {
  const c = byName.get(name);
  assert(c, `ADC blind inconnu : ${name}`);
  assert((c.tags || []).includes("Marksman"), `${name} doit être Marksman`);
  assert(c.tierMeta === "S" || c.tierMeta === "A", `${name} doit être tier S/A (${c.tierMeta})`);
  assert(D.playsSlotFor(c, meta, "Bot"), `${name} doit jouer Bot`);
}
const hintB1 = D.getDraftCoachHint(D.createSession("hint", "blue"), "blue", byName, meta);
assert(hintB1.includes("ADC OP"), `hint B1 : ${hintB1}`);
assert(hintB1.includes(adcs[0]), `hint B1 doit citer les ADC générés : ${hintB1}`);

/* ---- 7. analyzeLive passe byName au scoring ---- */
{
  const s = D.createSession("live", "blue");
  D.manualAssign(s, { type: "pick", side: "blue", name: "Jinx", slot: "Bot" }, [], ctx);
  const orig = SCng.evaluateTeam;
  let captured = null;
  SCng.evaluateTeam = (names, c) => { captured = c; return orig(names, c); };
  try {
    D.analyzeLive(s, meta, byName);
  } finally {
    SCng.evaluateTeam = orig;
  }
  assert(captured?.byName === byName, "analyzeLive doit transmettre byName au ctx d'evaluateTeam");
}

/* ---- 8. Constantes et libellés ---- */
assert(
  D.MIN_LANE_PLAY_RATE === sandbox.LoLLaneViability.MIN_LANE_RATE,
  "MIN_LANE_PLAY_RATE doit venir de LoLLaneViability"
);
const summary = D.formatSummary(D.createSession("fmt", "blue"));
assert(summary.includes("Draft tournoi"), `formatSummary : ${summary}`);
assert(!summary.includes("Ranked SR"), `formatSummary ne doit plus dire Ranked SR : ${summary}`);
const fearlessSummary = D.formatSummary(D.createSession("fmt2", "blue", { fearless: true }));
assert(fearlessSummary.includes("Fearless"), `formatSummary fearless : ${fearlessSummary}`);

/* ---- 9. Timeline : 20 étapes, ordre réel, états ---- */
const tl = UI.buildTimelineSteps(seq);
assert(tl.length === 20, `timeline doit avoir 20 étapes, obtenu ${tl.length}`);
const expectedSeq = [
  ["ban", "blue"], ["ban", "red"], ["ban", "blue"], ["ban", "red"], ["ban", "blue"], ["ban", "red"],
  ["pick", "blue"], ["pick", "red"], ["pick", "red"], ["pick", "blue"], ["pick", "blue"], ["pick", "red"],
  ["ban", "red"], ["ban", "blue"], ["ban", "red"], ["ban", "blue"],
  ["pick", "red"], ["pick", "blue"], ["pick", "blue"], ["pick", "red"],
];
for (let i = 0; i < 20; i++) {
  assert(
    tl[i].type === expectedSeq[i][0] && tl[i].side === expectedSeq[i][1],
    `timeline étape ${i} : attendu ${expectedSeq[i].join("/")}, obtenu ${tl[i].type}/${tl[i].side}`
  );
}
assert(tl[12].label === "B4" && tl[15].label === "B5", `bans phase 2 : ${tl[12].label}/${tl[15].label}`);
assert(tl[16].label === "P4" && tl[19].label === "P5", `picks phase 2 : ${tl[16].label}/${tl[19].label}`);
assert(tl.every((c) => c.state === "done"), "draft complète ⇒ toutes les étapes done");
assert(tl[6].name === "Jinx" && tl[7].name === "Caitlyn", `noms picks timeline : ${tl[6].name}/${tl[7].name}`);
assert(tl[0].name === "Orianna", `nom ban timeline : ${tl[0].name}`);

const mid = D.createSession("timeline-mid", "blue");
D.applyAction(mid, { championName: "Orianna", banIndex: 0 }, [], ctx);
D.applyAction(mid, { championName: "Zed", banIndex: 0 }, [], ctx);
const tlMid = UI.buildTimelineSteps(mid);
assert(tlMid[0].state === "done" && tlMid[1].state === "done", "étapes passées done");
assert(tlMid[2].state === "current", "étape courante marquée current");
assert(tlMid[3].state === "upcoming", "étapes futures upcoming");
assert(tlMid[1].name === "Zed", "ban rouge affiché dans la frise");

/* ---- 10. Nommage Game N sans doublon ---- */
assert(
  UI.nextGameNumber([{ name: "Game 1" }, { name: "Game 3" }]) === 4,
  "nextGameNumber doit prendre max+1"
);
assert(UI.nextGameNumber([{ name: "Scrim finale" }]) === 2, "sans numéro : count+1");

console.log("OK — tests moteur/UI draft passés");
