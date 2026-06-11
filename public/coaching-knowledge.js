/**
 * Coaching draft knowledge — encoded from league-of-legends skill corpus.
 * Priority stack (draft.txt): (1) Familles, (2) Combos, (3) Trinité 3+.
 */
(function (global) {
  function norm(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  const PICK_ORDER_BLUE = ["Bot", "Jungle", "Mid", "Support", "Top"];
  const PICK_ORDER_RED = ["Bot", "Jungle", "Mid", "Support", "Top"];

  const FIRST_PICK_ADC = ["Caitlyn", "Varus", "Aphelios", "Jinx", "Xayah"];
  const FIRST_PICK_JUNGLE = ["Jarvan IV", "Vi", "Lee Sin", "Elise", "Pantheon", "Sejuani", "Maokai", "Nocturne"];
  const FLEX_PICKS = [
    "Gragas", "Pantheon", "Sylas", "Galio", "Karma", "Lucian", "Viego", "Ekko", "Morgana", "Lux",
    "Seraphine", "Neeko", "Sett", "Swain", "Maokai", "Jax", "Jayce", "Orianna", "Yasuo", "Miss Fortune",
  ];
  const TANK_JUNGLE = ["Sion", "Malphite", "Maokai", "Nautilus", "Ornn", "Shen", "Zac", "Sejuani", "Dr. Mundo"];
  const ENCHANTER_SUPPORTS = ["Karma", "Janna", "Milio", "Soraka", "Yuumi", "Nami", "Lulu"];
  const TANK_ENGAGE_SUPPORTS = ["Rell", "Rakan", "Alistar", "Leona", "Nautilus"];
  const WOMBO_CORE = [
    "Diana", "Yasuo", "Orianna", "Malphite", "Rell", "Wukong", "Miss Fortune", "Aphelios", "Rakan",
    "Jarvan IV", "Nilah", "Fiddlesticks", "Galio", "Amumu", "Kennen",
  ];
  const HYPERCARRY_ADC = ["Kog'Maw", "Jinx", "Twitch", "Zeri", "Vayne"];
  const HYPERCARRY_JUNGLE = ["Master Yi", "Bel'Veth", "Kindred", "Gwen", "Briar"];
  const HYPERCARRY_TOP = ["Kayle", "Fiora", "Gwen", "Camille"];
  const STABLE_TANK_MIDS = ["Galio", "Nautilus", "Cho'Gath", "Sion", "Ornn", "Morgana"];
  const GLOBAL_CORE = [
    "Twisted Fate", "Karthus", "Nocturne", "Galio", "Pantheon", "Senna", "Ryze", "Gangplank",
    "Briar", "Draven", "Jinx", "Xerath", "Lux", "Jhin", "Caitlyn", "Ashe",
  ];
  const SPLITPUSHERS = ["Fiora", "Trundle", "Camille", "Jax", "Yorick"];
  const ASSASSIN_JUNGLE = ["Kha'Zix", "Rengar", "Talon", "Pantheon", "Nocturne"];
  const R_CLICK_MID = ["Malzahar", "Annie", "Lissandra", "Ryze", "Twisted Fate"];
  const COUNTER_PICK_CHAMPS = ["Fizz", "Trundle", "Riven", "Ryze", "Rengar", "Kha'Zix", "Vex"];
  const HIGH_BAN_TARGETS = ["Gangplank", "Twisted Fate", "Yasuo", "Orianna", "Miss Fortune"];

  const ANTI_SYNERGIES = [
    ["Sivir", "Lulu"],
    ["Elise", "Cassiopeia"],
    ["Zeri", "Leona"],
    ["Zeri", "Nautilus"],
    ["Renekton", "Xerath"],
    ["Renekton", "Ziggs"],
  ];

  /** engage | disengage | range — do not mix families (Lol_Database7) */
  const FAMILY_TAGS = {
    engage: new Set(
      [
        "Renekton", "Lee Sin", "Vi", "Jarvan IV", "Malphite", "Ornn", "Shen", "Leona", "Nautilus", "Rell",
        "Rakan", "Alistar", "Amumu", "Sejuani", "Zac", "Wukong", "Pantheon", "Ambessa", "Nocturne", "Elise",
        "Kled", "Pyke", "Draven", "Lucian", "Braum", "Yasuo", "Diana", "Kennen", "Miss Fortune", "Orianna",
      ].map(norm)
    ),
    disengage: new Set(
      [
        "Janna", "Karma", "Lulu", "Milio", "Soraka", "Yuumi", "Nami", "Braum", "Tahm Kench", "Thresh",
        "Morgana", "Zilean", "Ezreal", "Caitlyn", "Varus", "Ashe", "Jhin", "Ziggs", "Xerath", "Hwei",
      ].map(norm)
    ),
    range: new Set(
      [
        "Ziggs", "Xerath", "Jayce", "Zoe", "Lux", "Vel'Koz", "Corki", "Ezreal", "Caitlyn", "Varus", "Ashe",
        "Jhin", "Hwei", "Mel", "Smolder", "Kalista", "Sivir", "Anivia", "Brand", "Heimerdinger",
      ].map(norm)
    ),
  };

  /** Full 5-stacks from Cours 2 */
  const ARCHETYPE_COMPS = [
    { id: "catch_a", label: "Catch A", family: "engage", champs: ["Ambessa", "Vi", "Ahri", "Ashe", "Leona"] },
    { id: "catch_b", label: "Catch B", family: "engage", champs: ["Malphite", "Nocturne", "Vex", "Varus", "Nautilus"] },
    { id: "wombo_a", label: "Wombo A", family: "engage", champs: ["Shen", "Jarvan IV", "Orianna", "Miss Fortune", "Rell"] },
    { id: "wombo_b", label: "Wombo B", family: "engage", champs: ["Ornn", "Diana", "Yasuo", "Kalista", "Kennen"] },
    { id: "early_all_in", label: "Early all-in", family: "engage", champs: ["Renekton", "Pantheon", "LeBlanc", "Lucian", "Braum"] },
    { id: "early_dive", label: "Early dive bot", family: "engage", champs: ["Kled", "Elise", "Lissandra", "Draven", "Pyke"] },
    { id: "hypercarry_adc", label: "Hypercarry ADC", family: "disengage", champs: [...HYPERCARRY_ADC, ...ENCHANTER_SUPPORTS, ...TANK_JUNGLE] },
    { id: "hypercarry_jgl", label: "Hypercarry jungle", family: "disengage", champs: [...HYPERCARRY_JUNGLE, ...ENCHANTER_SUPPORTS, ...STABLE_TANK_MIDS] },
    { id: "hypercarry_top", label: "Hypercarry top", family: "disengage", champs: [...HYPERCARRY_TOP, ...ENCHANTER_SUPPORTS] },
    { id: "poke", label: "Poke / siege", family: "range", champs: ["Caitlyn", "Varus", "Jayce", "Ziggs", "Karma", "Lux", "Ezreal", "Braum", "Thresh"] },
    { id: "global", label: "Global / pick", family: "range", champs: GLOBAL_CORE },
    { id: "split", label: "Split global", family: "range", champs: [...GLOBAL_CORE, ...SPLITPUSHERS] },
    { id: "assassin_pick", label: "Assassin pick", family: "engage", champs: [...ASSASSIN_JUNGLE, ...R_CLICK_MID] },
  ];

  const COMP_TEMPLATES = [
    { id: "all_in", label: "All-in tempo", champs: ["Renekton", "Lee Sin", "LeBlanc", "Lucian", "Braum", "Draven", "Pyke", "Elise", "Lissandra", "Pantheon", "Vi", "Ahri", "Ashe", "Leona"] },
    { id: "wombo", label: "Wombo combo", champs: WOMBO_CORE },
    { id: "hypercarry_adc", label: "Hypercarry ADC", champs: [...HYPERCARRY_ADC, ...ENCHANTER_SUPPORTS, ...TANK_JUNGLE] },
    { id: "hypercarry_jgl", label: "Hypercarry jungle", champs: [...HYPERCARRY_JUNGLE, ...ENCHANTER_SUPPORTS, ...STABLE_TANK_MIDS] },
    { id: "pick", label: "Pick / Catch", champs: ["Vi", "Ahri", "Ashe", "Leona", "Nocturne", "Elise", "Varus", "Jhin", "Vex", "Malphite", "Nautilus"] },
    { id: "poke", label: "Poke", champs: ["Caitlyn", "Varus", "Jayce", "Ziggs", "Karma", "Ezreal", "Braum"] },
  ];

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
    Anivia: { partners: ["Poppy", "Qiyana", "Talon", "Vayne"] },
    Azir: { partners: ["Braum", "Maokai"] },
    Bard: { partners: ["Nunu", "Fiddlesticks", "Caitlyn", "Cho'Gath", "Galio", "Lee Sin", "Sett", "Ekko"] },
    "Bel'Veth": { partners: ["Yuumi", "Braum", "Lulu", "Shen"] },
    Draven: { partners: ["Renata Glasc", "Twisted Fate", "Janna", "Pyke", "Nautilus"], pivot: true },
    Fiddlesticks: { partners: ["Nocturne", "Twisted Fate", "Rell", "Amumu", "Senna"] },
    Galio: { partners: ["Camille", "Nocturne", "Diana", "Vi", "Jarvan IV", "Rakan", "Kennen", "Amumu", "Kled"], pivot: true },
    Ivern: { partners: ["Rengar", "Camille", "Jax", "Fiora", "Trundle", "Garen", "Aatrox", "Darius"] },
    Jhin: { partners: ["Xerath", "Zyra"] },
    "Kha'Zix": { partners: ["Twisted Fate", "Malzahar", "Lissandra", "Annie", "Orianna"] },
    Lucian: { partners: ["Braum", "Nami", "Milio"] },
    Rengar: { partners: ["Ivern", "Senna", "Twisted Fate", "Malzahar", "Annie", "Lissandra"] },
    Samira: { partners: ["Nautilus", "Leona", "Rell", "Rakan"] },
    Sivir: { partners: ["Hecarim", "Kled", "Karma", "Kennen", "Rakan", "Darius", "Aatrox", "Vladimir"], pivot: true },
    Veigar: { partners: ["Alistar", "Viktor", "Poppy", "Cassiopeia", "Gnar"] },
    Malphite: { partners: ["Yasuo", "Orianna", "Miss Fortune", "Rell", "Diana"] },
    Diana: { partners: ["Yasuo", "Kennen", "Galio", "Malphite"] },
    Rakan: { partners: ["Xayah", "Miss Fortune", "Orianna", "Kalista", "Samira", "Galio", "Kennen", "Sivir"] },
    Xayah: { partners: ["Rakan"] },
    Amumu: { partners: ["Miss Fortune", "Kennen", "Galio", "Fiddlesticks"] },
    "Jarvan IV": { partners: ["Orianna", "Miss Fortune", "Cassiopeia", "Galio", "Vi", "Azir"] },
    Lulu: { partners: ["Kog'Maw", "Jinx", "Twitch", "Master Yi", "Bel'Veth", "Kayle"] },
    Nautilus: { partners: ["Varus", "Samira", "Draven", "Kalista"] },
    Maokai: { partners: ["Azir", "Aphelios", "Heimerdinger"] },
    Viktor: { partners: ["Veigar", "Alistar"] },
    Poppy: { partners: ["Anivia", "Veigar"] },
    Tristana: { partners: ["Braum", "Darius"] },
    Kaisa: { partners: ["Galio", "Rell", "Alistar", "Rakan"] },
  };

  const WEIGHTS = { family: 3.2, combo: 2.0, trinity: 1.4, lane: 1.2, counter: 1.0, anti: 2.5, mix: 3.0 };

  function inList(name, list) {
    const n = norm(name);
    return list.some((x) => norm(x) === n);
  }

  function pickOrderForSide(side) {
    return PICK_ORDER_BLUE.slice();
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
    if (all.length < 2) return { score: 0, reasons: [] };
    let totalLinks = 0;
    for (const n of all) totalLinks += countComboLinks(n, all.filter((x) => norm(x) !== norm(n)));
    const direct = countComboLinks(candidate, teamNames);
    if (all.length >= 3 && totalLinks >= 3) return { score: 42, reasons: ["Trinité 3+ liens combo"] };
    if (direct >= 2) return { score: 28, reasons: ["Duo combo fort"] };
    if (direct >= 1 && teamNames.length >= 1) return { score: 12, reasons: ["Lien combo"] };
    return { score: 0, reasons: [] };
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

  function detectArchetypeComp(teamNames) {
    const set = new Set(teamNames.map(norm));
    let best = null;
    for (const comp of ARCHETYPE_COMPS) {
      let hits = 0;
      for (const c of comp.champs) if (set.has(norm(c))) hits++;
      if (!best || hits > best.hits) best = { comp, hits };
    }
    return best && best.hits >= 2 ? best.comp : null;
  }

  function familyTagFor(name) {
    const n = norm(name);
    if (FAMILY_TAGS.engage.has(n)) return "engage";
    if (FAMILY_TAGS.disengage.has(n)) return "disengage";
    if (FAMILY_TAGS.range.has(n)) return "range";
    return null;
  }

  function familyCoherence(candidate, teamNames) {
    const all = teamNames.concat(candidate);
    const tags = all.map(familyTagFor).filter(Boolean);
    if (!tags.length) return { score: 0, reasons: [], family: null, mixed: false };

    const counts = {};
    for (const t of tags) counts[t] = (counts[t] || 0) + 1;
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const family = dominant[0];
    const ratio = dominant[1] / tags.length;
    const mixed = Object.keys(counts).length > 1;

    const archetype = detectArchetypeComp(all);
    let score = 0;
    const reasons = [];

    if (archetype && inList(candidate, archetype.champs)) {
      score += 36;
      reasons.push(`Famille ${archetype.label}`);
    }

    const tpl = detectTemplate(teamNames);
    if (tpl && tpl.champs.some((c) => norm(c) === norm(candidate))) {
      score += 24;
      reasons.push(`Template ${tpl.label}`);
    }

    if (inList(candidate, WOMBO_CORE)) {
      const womboCount = all.filter((n) => inList(n, WOMBO_CORE)).length;
      if (womboCount >= 2) {
        score += 22;
        reasons.push("Famille wombo");
      }
    }

    if (inList(candidate, HYPERCARRY_ADC) || inList(candidate, HYPERCARRY_JUNGLE) || inList(candidate, HYPERCARRY_TOP)) {
      const hasEnch = all.some((n) => inList(n, ENCHANTER_SUPPORTS));
      const hasTank = all.some((n) => inList(n, TANK_JUNGLE) || inList(n, STABLE_TANK_MIDS));
      if (hasEnch && hasTank) {
        score += 30;
        reasons.push("Hypercarry complet");
      } else if (hasEnch || hasTank) {
        score += 14;
        reasons.push("Hypercarry en cours");
      }
    }

    if (inList(candidate, GLOBAL_CORE)) {
      const globalCount = all.filter((n) => inList(n, GLOBAL_CORE)).length;
      if (globalCount >= 2) {
        score += 18;
        reasons.push("Famille global");
      }
    }

    if (ratio >= 0.8) {
      score += 16;
      reasons.push(`Cohérence ${family}`);
    } else if (ratio >= 0.6) {
      score += 8;
    }

    return { score, reasons, family, mixed };
  }

  function familyMixPenalty(candidate, teamNames) {
    const all = teamNames.concat(candidate);
    const tags = new Set(all.map(familyTagFor).filter(Boolean));
    if (tags.size <= 1) return { score: 0, reasons: [] };

    const hasEngage = [...tags].includes("engage");
    const hasRange = [...tags].includes("range");
    if (hasEngage && hasRange) {
      return { score: -48, reasons: ["Mélange engage + range — familles incompatibles"] };
    }
    if (tags.size >= 3) {
      return { score: -32, reasons: ["Trop de familles mélangées"] };
    }
    return { score: -18, reasons: ["Familles mixtes"] };
  }

  function antiSynergyPenalty(candidate, teamNames) {
    let score = 0;
    const reasons = [];
    for (const ally of teamNames) {
      for (const [a, b] of ANTI_SYNERGIES) {
        const hit =
          (norm(candidate) === norm(a) && norm(ally) === norm(b)) ||
          (norm(candidate) === norm(b) && norm(ally) === norm(a));
        if (hit) {
          score -= 40;
          reasons.push(`Antisynergie ${candidate}+${ally}`);
        }
      }
    }
    if (inList(candidate, ["Zeri"]) && teamNames.some((n) => inList(n, ["Leona", "Nautilus", "Rell"]) && !inList(n, ["Kai'Sa"]))) {
      score -= 28;
      reasons.push("Zeri sans follow-up dash");
    }
    return { score, reasons };
  }

  function coachingSynergyScore(candidate, teamNames) {
    const links = countComboLinks(candidate, teamNames);
    if (!links) return { score: 0, reasons: [] };
    const { pivot } = getPartners(candidate);
    let score = links * 20 + (pivot ? 14 : 0);
    const reasons = [];
    if (links >= 2) reasons.push(`Combo coaching (${links} liens)`);
    else reasons.push("Combo coaching documenté");
    if (pivot) reasons.push("Pivot **");
    return { score, reasons };
  }

  function lanePriorityBonus(slot) {
    if (slot === "Bot") return { score: 18, reasons: ["Priorité lane bot"] };
    if (slot === "Mid" || slot === "Jungle") return { score: 10, reasons: ["Lane mid/jgl"] };
    return { score: 0, reasons: [] };
  }

  function counterPickSlotBonus(side, pickN, slot) {
    if (side !== "red") return { score: 0, reasons: [] };
    if (pickN >= 3 && (slot === "Top" || slot === "Support")) {
      return { score: 22, reasons: ["Counter-pick R4/R5"] };
    }
    if (pickN >= 2 && inList(slot, ["Mid", "Jungle"])) {
      return { score: 10, reasons: ["Slot flex red"] };
    }
    return { score: 0, reasons: [] };
  }

  function tankJungleBonus(name, slot) {
    if (slot !== "Jungle" || !inList(name, TANK_JUNGLE)) return { score: 0, reasons: [] };
    return { score: 34, reasons: ["Tank jgl ultra OP"] };
  }

  function tankSuppAllowsAp(candidate, slot, allies) {
    const hasTankSupp = allies.some((a) => inList(a, TANK_ENGAGE_SUPPORTS));
    if (!hasTankSupp) return { score: 0, reasons: [] };
    if (slot === "Mid") return { score: 24, reasons: ["Tank supp → AP mid OK"] };
    if (slot === "Top") return { score: 16, reasons: ["Tank supp → bruiser top OK"] };
    return { score: 0, reasons: [] };
  }

  function firstPickBonus(name, slot, pickN, side) {
    if (pickN !== 0) return { score: 0, reasons: [] };
    if (side === "blue" && slot === "Bot" && inList(name, FIRST_PICK_ADC)) {
      return { score: 32, reasons: ["FP ADC coaching (Cait/Varus/Aphelios/Jinx/Xayah)"] };
    }
    if (side === "blue" && inList(name, FLEX_PICKS)) {
      return { score: 16, reasons: ["Flex FP Blue"] };
    }
    return { score: 0, reasons: [] };
  }

  function firstPickJungleBonus(name, slot, pickN, side) {
    if (pickN > 1) return { score: 0, reasons: [] };
    if (slot === "Jungle" && inList(name, FIRST_PICK_JUNGLE)) {
      const bonus = pickN === 0 && side === "blue" ? 22 : 26;
      return { score: bonus, reasons: ["Jungle OP / flex FP"] };
    }
    return { score: 0, reasons: [] };
  }

  function familyBonus(candidate, teamNames) {
    return familyCoherence(candidate, teamNames);
  }

  function denyComboBanScore(champName, enemyNames) {
    let score = 0;
    const reasons = [];
    for (const e of enemyNames) {
      const links = countComboLinks(champName, [e]);
      if (links) {
        score += 24 + links * 10;
        reasons.push(`Casse combo ${e}+${champName}`);
      }
    }
    if (inList(champName, HIGH_BAN_TARGETS)) {
      score += 14;
      reasons.push("Ban meta coaching");
    }
    return { score, reasons };
  }

  function banCoachingScore(champName, enemyNames, { enemyNeedsTank = false } = {}) {
    const deny = denyComboBanScore(champName, enemyNames);
    let score = deny.score;
    const reasons = [...deny.reasons];
    if (enemyNeedsTank && inList(champName, TANK_JUNGLE.concat(["Ornn", "Sion", "Malphite", "Maokai", "Nautilus", "Shen", "Zac", "Sejuani", "Dr. Mundo", "Cho'Gath", "K'Sante", "Poppy"]))) {
      score += 28;
      reasons.push("Deny tank — comp sans front");
    }
    if (norm(champName) === norm("Gangplank")) {
      score += 20;
      reasons.push("GP ban prioritaire");
    }
    return { score, reasons };
  }

  /** Unified coaching pick score — hierarchy family > combo > trinity */
  function scoreCoachingPick(name, teamNames, slot, ctx = {}) {
    const { side = "blue", pickN = teamNames.length } = ctx;
    const parts = [
      { key: "family", ...familyCoherence(name, teamNames), w: WEIGHTS.family },
      { key: "combo", ...coachingSynergyScore(name, teamNames), w: WEIGHTS.combo },
      { key: "trinity", ...trinityBonus(name, teamNames), w: WEIGHTS.trinity },
      { key: "lane", ...lanePriorityBonus(slot), w: WEIGHTS.lane },
      { key: "counter", ...counterPickSlotBonus(side, pickN, slot), w: WEIGHTS.counter },
      { key: "tankjgl", ...tankJungleBonus(name, slot), w: 1 },
      { key: "tanksupp", ...tankSuppAllowsAp({ name }, slot, teamNames), w: 1 },
      { key: "fpadc", ...firstPickBonus(name, slot, pickN, side), w: 1 },
      { key: "fpjgl", ...firstPickJungleBonus(name, slot, pickN, side), w: 1 },
    ];
    const anti = antiSynergyPenalty(name, teamNames);
    const mix = familyMixPenalty(name, teamNames);

    let score = 0;
    const reasons = [];
    const breakdown = {};

    for (const p of parts) {
      const contrib = Math.round((p.score || 0) * (p.w || 1));
      if (contrib) {
        score += contrib;
        breakdown[p.key] = contrib;
        reasons.push(...(p.reasons || []).slice(0, 1));
      }
    }
    if (anti.score) {
      score += Math.round(anti.score * WEIGHTS.anti);
      breakdown.anti = anti.score;
      reasons.push(...anti.reasons.slice(0, 1));
    }
    if (mix.score) {
      score += Math.round(mix.score * WEIGHTS.mix);
      breakdown.mix = mix.score;
      reasons.push(...mix.reasons.slice(0, 1));
    }

    return { score, reasons: [...new Set(reasons)].slice(0, 6), breakdown };
  }

  global.CoachingDraftKnowledge = {
    WEIGHTS,
    PICK_ORDER_BLUE,
    PICK_ORDER_RED,
    pickOrderForSide,
    FIRST_PICK_ADC,
    FIRST_PICK_JUNGLE,
    FLEX_PICKS,
    TANK_JUNGLE,
    ENCHANTER_SUPPORTS,
    TANK_ENGAGE_SUPPORTS,
    WOMBO_CORE,
    HYPERCARRY_ADC,
    HYPERCARRY_JUNGLE,
    HYPERCARRY_TOP,
    STABLE_TANK_MIDS,
    GLOBAL_CORE,
    SPLITPUSHERS,
    ASSASSIN_JUNGLE,
    R_CLICK_MID,
    COUNTER_PICK_CHAMPS,
    HIGH_BAN_TARGETS,
    ANTI_SYNERGIES,
    FAMILY_TAGS,
    ARCHETYPE_COMPS,
    COMP_TEMPLATES,
    COMBO_GRAPH,
    countComboLinks,
    trinityBonus,
    coachingSynergyScore,
    familyCoherence,
    familyMixPenalty,
    antiSynergyPenalty,
    lanePriorityBonus,
    counterPickSlotBonus,
    tankJungleBonus,
    tankSuppAllowsAp,
    firstPickBonus,
    firstPickJungleBonus,
    familyBonus,
    denyComboBanScore,
    banCoachingScore,
    scoreCoachingPick,
    detectTemplate,
    detectArchetypeComp,
    inList,
    norm,
  };
})(typeof window !== "undefined" ? window : globalThis);
