/**
 * Coaching draft knowledge — encoded from league-of-legends skill files.
 * Pillars: (1) Respect families, (2) Synergies/combos, (3) Trinity (3+ links).
 */
(function (global) {
  const FIRST_PICK_ADC = ["Caitlyn", "Varus", "Aphelios", "Jinx", "Xayah"];
  const FIRST_PICK_JUNGLE = ["Jarvan IV", "Vi", "Lee Sin", "Elise", "Pantheon", "Sejuani", "Maokai"];
  const FLEX_PICKS = ["Gragas", "Pantheon", "Sylas", "Galio", "Karma", "Lucian", "Viego", "Ekko", "Morgana", "Lux", "Seraphine", "Neeko", "Sett", "Swain"];
  const TANK_JUNGLE = ["Sion", "Malphite", "Maokai", "Nautilus", "Ornn", "Shen", "Zac", "Sejuani", "Dr. Mundo"];
  const ENCHANTER_SUPPORTS = ["Karma", "Janna", "Milio", "Soraka", "Yuumi", "Nami", "Lulu"];
  const TANK_ENGAGE_SUPPORTS = ["Rell", "Rakan", "Alistar", "Leona", "Nautilus"];
  const WOMBO_CORE = ["Diana", "Yasuo", "Orianna", "Malphite", "Rell", "Wukong", "Miss Fortune", "Aphelios", "Rakan", "Jarvan IV", "Nilah", "Fiddlesticks", "Galio", "Amumu"];
  const HYPERCARRY_ADC = ["Kog'Maw", "Jinx", "Twitch", "Zeri", "Vayne", "Kayle"];
  const HYPERCARRY_JUNGLE = ["Master Yi", "Bel'Veth", "Kindred", "Gwen", "Briar"];
  const STABLE_TANK_MIDS = ["Galio", "Nautilus", "Cho'Gath", "Sion", "Ornn", "Morgana"];

  /** pivot: true = anchor champ (marked ** in coaching notes) */
  const COMBO_GRAPH = {
    Yasuo: { partners: ["Malphite", "Diana", "Nautilus", "Rell", "Orianna", "Trundle", "Gragas", "Rakan"], pivot: true },
    Orianna: { partners: ["Malphite", "Nocturne", "Rell", "Miss Fortune", "Rengar", "Jarvan IV", "Rakan", "Vi"], pivot: true },
    "Miss Fortune": { partners: ["Amumu", "Rell", "Malphite", "Rakan", "Zoe", "Annie", "Jarvan IV"], pivot: true },
    Zilean: { partners: ["Udyr", "Hecarim", "Tryndamere", "Rammus", "Darius", "Olaf", "Master Yi"] },
    Braum: { partners: ["Lucian", "Tristana", "Akshan", "Xin Zhao", "Bel'Veth", "Katarina", "Azir", "Pantheon", "Fiora", "Ezreal"] },
    Camille: { partners: ["Galio", "Shen", "Twisted Fate", "Nocturne", "Talon", "Ryze", "Rengar"] },
    Cassiopeia: { partners: ["Jarvan IV", "Singed", "Teemo", "Twitch", "Sivir", "Karma"], pivot: true },
    "Dr. Mundo": { partners: ["Soraka", "Yuumi", "Karma", "Lulu", "Janna"] },
    Olaf: { partners: ["Soraka", "Yuumi", "Karma", "Lulu", "Janna"] },
    Kalista: { partners: ["Alistar", "Rakan", "Rell", "Sett", "Pyke", "Leona"] },
    Karthus: { partners: ["Garen", "Zed", "Talon", "Qiyana", "Akshan", "Pyke"] },
    Kennen: { partners: ["Zilean", "Amumu", "Rell", "Karma", "Sivir", "Diana", "Aurora"], pivot: true },
    Leona: { partners: ["Twitch", "Brand", "Teemo", "Cassiopeia", "Singed", "Malzahar", "Lillia", "Fizz"], pivot: true },
    "Master Yi": { partners: ["Taric", "Lulu", "Morgana", "Zilean", "Kayle", "Yuumi"] },
    "Twisted Fate": { partners: ["Nocturne", "Pantheon", "Draven", "Morgana", "Vayne", "Kog'Maw", "Kayle", "Gangplank"] },
    Vi: { partners: ["Ahri", "Taliyah", "Fizz", "Orianna", "LeBlanc", "Vex", "Akali", "Ekko"], pivot: true },
    Yuumi: { partners: ["Twitch", "Garen", "Dr. Mundo", "Darius", "Hecarim", "Olaf", "Warwick"] },
    Hecarim: { partners: ["Karma", "Zilean", "Sivir", "Kled", "Yuumi"], pivot: true },
    Heimerdinger: { partners: ["Maokai", "Zyra", "Yorick", "Teemo", "Aphelios", "Shaco", "Illaoi", "Bard", "Pyke", "Nautilus"] },
    Alistar: { partners: ["Yasuo", "Kalista", "Veigar"] },
    Azir: { partners: ["Braum", "Maokai"] },
    "Bel'Veth": { partners: ["Yuumi", "Braum", "Lulu", "Shen"] },
    Draven: { partners: ["Renata Glasc", "Twisted Fate", "Janna", "Pyke", "Nautilus"], pivot: true },
    Fiddlesticks: { partners: ["Nocturne", "Twisted Fate", "Rell", "Amumu", "Senna"] },
    Galio: { partners: ["Camille", "Nocturne", "Diana", "Vi", "Jarvan IV", "Rakan", "Kennen", "Amumu", "Kled"], pivot: true },
    Lucian: { partners: ["Braum", "Nami", "Milio"] },
    Rengar: { partners: ["Ivern", "Senna", "Twisted Fate", "Malzahar", "Annie", "Lissandra"] },
    Samira: { partners: ["Nautilus", "Leona", "Rell", "Rakan"] },
    Sivir: { partners: ["Hecarim", "Kled", "Karma", "Kennen", "Rakan", "Darius", "Aatrox", "Vladimir"], pivot: true },
    Malphite: { partners: ["Yasuo", "Orianna", "Miss Fortune", "Rell", "Diana"] },
    Diana: { partners: ["Yasuo", "Kennen", "Galio", "Malphite"] },
    Rakan: { partners: ["Xayah", "Miss Fortune", "Orianna", "Kalista", "Samira", "Galio", "Kennen", "Sivir"] },
    Xayah: { partners: ["Rakan"] },
    Amumu: { partners: ["Miss Fortune", "Kennen", "Galio", "Fiddlesticks"] },
    "Jarvan IV": { partners: ["Orianna", "Miss Fortune", "Cassiopeia", "Galio", "Vi", "Azir"] },
    Lulu: { partners: ["Kog'Maw", "Jinx", "Twitch", "Master Yi", "Bel'Veth", "Kayle"] },
    Nautilus: { partners: ["Varus", "Samira", "Draven", "Kalista"] },
    "Kha'Zix": { partners: ["Twisted Fate", "Malzahar", "Lissandra", "Annie", "Orianna"] },
  };

  const COMP_TEMPLATES = [
    { id: "all_in", label: "All-in tempo", champs: ["Renekton", "Lee Sin", "LeBlanc", "Lucian", "Braum", "Draven", "Pyke", "Elise", "Lissandra"] },
    { id: "wombo", label: "Wombo combo", champs: WOMBO_CORE },
    { id: "hypercarry_adc", label: "Hypercarry ADC", champs: [...HYPERCARRY_ADC, ...ENCHANTER_SUPPORTS, ...TANK_JUNGLE] },
    { id: "hypercarry_jgl", label: "Hypercarry jungle", champs: [...HYPERCARRY_JUNGLE, ...ENCHANTER_SUPPORTS, ...STABLE_TANK_MIDS] },
    { id: "pick", label: "Pick / Catch", champs: ["Vi", "Ahri", "Ashe", "Leona", "Nocturne", "Elise", "Varus", "Jhin"] },
  ];

  function norm(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function inList(name, list) {
    const n = norm(name);
    return list.some((x) => norm(x) === n);
  }

  function getPartners(name) {
    const direct = COMBO_GRAPH[name];
    if (direct) return { partners: direct.partners, pivot: !!direct.pivot };
    const key = Object.keys(COMBO_GRAPH).find((k) => norm(k) === norm(name));
    if (key) return { partners: COMBO_GRAPH[key].partners, pivot: !!COMBO_GRAPH[key].pivot };
    return { partners: [], pivot: false };
  }

  function countComboLinks(candidate, teamNames) {
    let links = 0;
    const teamSet = new Set(teamNames.map(norm));
    const { partners } = getPartners(candidate);
    for (const p of partners) if (teamSet.has(norm(p))) links++;
    for (const ally of teamNames) {
      const { partners: ap } = getPartners(ally);
      if (ap.some((p) => norm(p) === norm(candidate))) links++;
    }
    return links;
  }

  function trinityBonus(candidate, teamNames) {
    const all = teamNames.concat(candidate);
    if (all.length < 2) return 0;
    let totalLinks = 0;
    for (const n of all) totalLinks += countComboLinks(n, all.filter((x) => norm(x) !== norm(n)));
    const direct = countComboLinks(candidate, teamNames);
    if (all.length >= 3 && totalLinks >= 3) return 38;
    if (direct >= 2) return 26;
    if (direct >= 1 && teamNames.length >= 1) return 14;
    return 0;
  }

  function detectTemplate(teamNames) {
    const set = new Set(teamNames.map(norm));
    let best = null;
    for (const t of COMP_TEMPLATES) {
      let score = 0;
      for (const c of t.champs) if (set.has(norm(c))) score++;
      if (!best || score > best.score) best = { template: t, score };
    }
    return best && best.score >= 2 ? best.template : null;
  }

  function coachingSynergyScore(candidate, teamNames) {
    const links = countComboLinks(candidate, teamNames);
    if (!links) return { score: 0, reasons: [] };
    const { pivot } = getPartners(candidate);
    let score = links * 18 + (pivot ? 10 : 0);
    const reasons = [];
    if (links >= 2) reasons.push(`Trinité combo (${links} liens)`);
    else reasons.push("Combo coaching documenté");
    if (pivot) reasons.push("Champion pivot **");
    return { score, reasons };
  }

  function tankJungleBonus(name, slot) {
    if (slot !== "Jungle" || !inList(name, TANK_JUNGLE)) return { score: 0, reasons: [] };
    return { score: 32, reasons: ["Tank jgl — ultra OP (coaching)"] };
  }

  function tankSuppAllowsAp(candidate, slot, allies) {
    const hasTankSupp = allies.some((a) => inList(a, TANK_ENGAGE_SUPPORTS));
    if (!hasTankSupp) return { score: 0, reasons: [] };
    if (slot === "Mid" && (candidate.ap > 0.5 || candidate.tags?.has?.("mage_burst"))) {
      return { score: 22, reasons: ["Tank supp → droit AP mid"] };
    }
    if (slot === "Top" && candidate.tags?.has?.("frontline")) {
      return { score: 16, reasons: ["Tank supp → bruiser top OK"] };
    }
    return { score: 0, reasons: [] };
  }

  function firstPickBonus(name, slot, pickN, side) {
    if (pickN !== 0 || slot !== "Bot") return { score: 0, reasons: [] };
    if (inList(name, FIRST_PICK_ADC)) return { score: 28, reasons: ["FP ADC coaching (Cait/Varus/Aphelios/Jinx/Xayah)"] };
    if (side === "blue" && inList(name, FLEX_PICKS)) return { score: 12, reasons: ["Flex FP Blue"] };
    return { score: 0, reasons: [] };
  }

  function firstPickJungleBonus(name, slot, pickN) {
    if (pickN !== 0 && pickN !== 1) return { score: 0, reasons: [] };
    if (slot === "Jungle" && inList(name, FIRST_PICK_JUNGLE)) {
      return { score: pickN === 0 ? 20 : 24, reasons: ["Jungle OP / flex FP"] };
    }
    return { score: 0, reasons: [] };
  }

  function familyBonus(candidate, teamNames) {
    const all = teamNames.concat(candidate);
    const tpl = detectTemplate(teamNames);
    let score = 0;
    const reasons = [];
    if (tpl && tpl.champs.some((c) => norm(c) === norm(candidate))) {
      score += 20;
      reasons.push(`Famille ${tpl.label}`);
    }
    const womboCount = all.filter((n) => inList(n, WOMBO_CORE)).length;
    if (inList(candidate, WOMBO_CORE) && womboCount >= 2) {
      score += 18;
      reasons.push("Famille wombo");
    }
    if (inList(candidate, HYPERCARRY_ADC)) {
      const hasEnch = all.some((n) => inList(n, ENCHANTER_SUPPORTS));
      const hasTank = all.some((n) => inList(n, TANK_JUNGLE));
      if (hasEnch && hasTank) { score += 24; reasons.push("Hypercarry complet"); }
      else if (hasEnch || hasTank) { score += 10; reasons.push("Hypercarry en cours"); }
    }
    return { score, reasons };
  }

  function denyComboBanScore(champName, enemyNames) {
    let score = 0;
    const reasons = [];
    for (const e of enemyNames) {
      const links = countComboLinks(champName, [e]);
      if (links) {
        score += 22 + links * 8;
        reasons.push(`Casse combo ${e}+${champName}`);
      }
    }
    return { score, reasons };
  }

  global.CoachingDraftKnowledge = {
    FIRST_PICK_ADC,
    FIRST_PICK_JUNGLE,
    FLEX_PICKS,
    TANK_JUNGLE,
    ENCHANTER_SUPPORTS,
    TANK_ENGAGE_SUPPORTS,
    WOMBO_CORE,
    COMBO_GRAPH,
    countComboLinks,
    trinityBonus,
    coachingSynergyScore,
    tankJungleBonus,
    tankSuppAllowsAp,
    firstPickBonus,
    firstPickJungleBonus,
    familyBonus,
    denyComboBanScore,
    detectTemplate,
    inList,
  };
})(typeof window !== "undefined" ? window : globalThis);
