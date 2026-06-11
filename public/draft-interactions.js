/**
 * Draft & macro duel interactions — règles encodées depuis le corpus LoL (familles, compos, counters).
 * Comp-level (dizaines–centaines) · champ pairs (unités–dizaines) · team traits.
 */
(function (global) {
  function norm(name) {
    return String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function setOf(names) {
    return new Set(names.map(norm));
  }

  /** Mécaniques champion — corpus skills + curated_matchups. */
  const MECH = {
    spellShield: setOf(["Morgana", "Sivir", "Nocturne", "Olaf", "Malzahar", "Briar"]),
    antiDash: setOf(["Poppy", "Vex", "Cassiopeia", "Azir", "Janna"]),
    hookCc: setOf(["Blitzcrank", "Nautilus", "Thresh", "Pyke", "Morgana"]),
    pointCc: setOf(["Leona", "Nautilus", "Alistar", "Annie", "Lissandra", "Vi", "Rammus", "Skarner"]),
    globalUlt: setOf([
      "Twisted Fate", "Nocturne", "Pantheon", "Galio", "Shen", "Taliyah", "Ryze", "Karthus",
      "Gangplank", "Senna", "Bard", "Ashe", "Jinx", "Ezreal",
    ]),
    splitPush: setOf([
      "Fiora", "Camille", "Jax", "Tryndamere", "Trundle", "Yorick", "Nasus", "Sion", "Gangplank", "Quinn",
    ]),
    siegePoke: setOf([
      "Caitlyn", "Varus", "Ezreal", "Jayce", "Ziggs", "Xerath", "Hwei", "Lux", "Vel'Koz", "Zoe", "Corki",
    ]),
    immobileCarry: setOf([
      "Ashe", "Jinx", "Kog'Maw", "Aphelios", "Miss Fortune", "Jhin", "Xerath", "Vel'Koz", "Brand", "Swain",
    ]),
    diveAssassin: setOf([
      "Zed", "Talon", "Qiyana", "Naafiri", "Kha'Zix", "Rengar", "Evelynn", "Akali", "Fizz", "Diana",
    ]),
    antiHeal: setOf(["Gwen", "Mordekaiser", "Kled", "Olaf"]),
    percentHp: setOf(["Vayne", "Gwen", "Fiora", "Kog'Maw", "Kayle", "Bel'Veth"]),
    tankShred: setOf(["Trundle", "Gwen", "Vayne", "Fiora", "Gnar", "Mordekaiser"]),
    windwall: setOf(["Yasuo", "Samira", "Braum"]),
    enchanter: setOf([
      "Lulu", "Janna", "Milio", "Soraka", "Yuumi", "Nami", "Karma", "Seraphine", "Séraphine", "Sona", "Taric",
    ]),
    hardEngage: setOf([
      "Malphite", "Ornn", "Sejuani", "Amumu", "Rell", "Jarvan IV", "Wukong", "Alistar", "Leona", "Nautilus",
      "Galio", "Ambessa", "Sion", "Zac",
    ]),
    disengage: setOf([
      "Janna", "Gragas", "Braum", "Tahm Kench", "Thresh", "Poppy", "Azir", "Ziggs", "Caitlyn", "Ashe",
      "Seraphine", "Séraphine", "Karma", "Ezreal",
    ]),
    zoneControl: setOf([
      "Anivia", "Veigar", "Heimerdinger", "Zyra", "Taliyah", "Azir", "Cassiopeia", "Rumble", "Hwei",
    ]),
    cleansePeel: setOf(["Milio", "Morgana", "Olaf", "Tenacity"]),
    knockupSetup: setOf([
      "Malphite", "Gragas", "Jarvan IV", "Alistar", "Rell", "Ornn", "Zac", "Nautilus", "Diana", "Yasuo",
    ]),
    stealth: setOf(["Twitch", "Shaco", "Rengar", "Kha'Zix", "Evelynn", "Neeko", "Viego"]),
    revealStealth: setOf(["Lee Sin", "Twisted Fate", "Rengar", "Kha'Zix"]),
    channelUlt: setOf([
      "Miss Fortune", "Karthus", "Katarina", "Lucian", "Jhin", "Fiddlesticks", "Nunu et Willump", "Urgot",
    ]),
    interruptChannel: setOf([
      "Galio", "Malzahar", "Vi", "Nocturne", "Blitzcrank", "Thresh", "Leona", "Nautilus", "Alistar",
    ]),
    aoeMage: setOf(["Brand", "Vel'Koz", "Malzahar", "Annie", "Orianna", "Viktor", "Syndra", "Rumble"]),
    shieldBreak: setOf(["Brand", "Gwen", "Mordekaiser", "Seraphine", "Séraphine"]),
    shortRangeAdc: setOf(["Samira", "Nilah", "Lucian", "Draven", "Kalista"]),
    longRangeAdc: setOf(["Caitlyn", "Varus", "Ezreal", "Jhin", "Ashe", "Ziggs", "Xerath"]),
    invadeEarly: setOf(["Lee Sin", "Elise", "Nidalee", "Graves", "Rek'Sai", "Pantheon", "Jarvan IV"]),
    scaleJungle: setOf(["Master Yi", "Bel'Veth", "Kindred", "Graves", "Kayn", "Viego", "Diana"]),
    peelTank: setOf(["Braum", "Poppy", "Tahm Kench", "Maokai", "Shen", "Galio", "Trundle"]),
  };

  function hasMech(v, key) {
    return MECH[key]?.has(norm(v.name));
  }

  function countMech(vs, key) {
    return vs.filter((v) => hasMech(v, key)).length;
  }

  function sumKey(vs, key) {
    return vs.reduce((s, v) => s + (v[key] || 0), 0);
  }

  function buildTeamMetrics(vs) {
    const tags = (t) => vs.filter((v) => v.tags?.has?.(t)).length;
    const cl = global.LoLChampionClasses;
    const classM = cl?.buildTeamClassMetrics ? cl.buildTeamClassMetrics(vs) : null;
    return {
      vs,
      engage: sumKey(vs, "engage"),
      peel: sumKey(vs, "peel"),
      scaling: sumKey(vs, "scaling"),
      burst: sumKey(vs, "burst"),
      early: sumKey(vs, "early"),
      front: tags("frontline"),
      poke: tags("poke"),
      dive: tags("dive"),
      assassin: tags("assassin"),
      marksman: vs.filter((v) => v.isMarksman).length,
      ccHeavy: vs.filter((v) => (v.spellSetup || 0) >= 0.45).length,
      enchanter: countMech(vs, "enchanter"),
      global: countMech(vs, "globalUlt"),
      split: countMech(vs, "splitPush") + tags("split"),
      siege: countMech(vs, "siegePoke"),
      hardEngage: countMech(vs, "hardEngage"),
      disengage: countMech(vs, "disengage"),
      zone: countMech(vs, "zoneControl"),
      antiDash: countMech(vs, "antiDash"),
      spellShield: countMech(vs, "spellShield"),
      immobile: countMech(vs, "immobileCarry"),
      womboSetup: countMech(vs, "knockupSetup"),
      classFrontline: classM?.frontline ?? 0,
      classSlayer: classM?.slayer ?? 0,
      classMageBurst: classM?.mageBurst ?? 0,
      classPeel: classM?.peel ?? 0,
      classEngage: classM?.engage ?? 0,
      classMarksman: classM?.marksman ?? 0,
      classDiversity: classM?.uniqueSubclasses ?? 0,
    };
  }

  /**
   * Comp-level clash rules — [when(ourM, enemyM, ourPlan, enemyPlan) => bool, score, reason, favorsOur?]
   * favorsOur defaults true; set false for enemy-favoring when condition describes enemy advantage.
   */
  const COMP_CLASH_RULES = [
    // Poke / disengage vs engage
    [(o, e) => o.poke >= 2 && e.hardEngage >= 2 && o.disengage >= 1, 145, "Poke + disengage > engage frontal"],
    [(o, e) => o.siege >= 2 && e.hardEngage >= 2 && o.peel >= 1.0, 132, "Siege à distance > engage mélée"],
    [(o, e) => o.poke >= 2 && e.engage >= 1.4 && o.disengage >= 2, 118, "Kite range vs comp engage"],
    [(o, e) => o.siege >= 3 && e.hardEngage >= 1, 95, "Triple poke/siege abuse vs engage lent"],
    [(o, e, op, ep) => (op === "poke_disengage" || op === "poke_siege") && ep === "teamfight_engage", 95, "Poke/disengage kite > engage frontal"],
    [(o, e, op, ep) => (op === "poke_disengage" || op === "poke_siege") && ep === "all_in", 82, "Poke/siege > all-in tempo"],

    // Hypercarry protected — both directions
    [(o, e, op, ep) => op === "hypercarry" && ep === "teamfight_engage" && o.peel >= 1.4 && o.scaling >= 1.0, 165, "Hypercarry protégé > engage frontal"],
    [(o, e, op, ep) => ep === "hypercarry" && op === "teamfight_engage" && e.peel >= 1.4 && e.scaling >= 1.0, 165, "Hypercarry protégé > engage frontal", false],
    [(o, e, op, ep) => op === "hypercarry" && (ep === "all_in" || ep === "lane_tempo") && o.peel >= 1.2, 95, "Peel + scale > tempo all-in"],
    [(o, e, op, ep) => ep === "hypercarry" && (op === "all_in" || op === "lane_tempo") && e.peel >= 1.2, 95, "Peel + scale > tempo all-in", false],
    [(o, e, op, ep) => op === "hypercarry" && ep === "beatdown" && o.enchanter >= 1 && o.front >= 1, 88, "Front-to-back protégé > dive"],
    [(o, e, op, ep) => ep === "hypercarry" && op === "beatdown" && e.enchanter >= 1 && e.front >= 1, 88, "Front-to-back protégé > dive", false],
    [(o, e) => o.scaling >= 1.6 && o.enchanter >= 2 && e.early >= 1.8, 115, "Double enchanter scale > spike early"],
    [(o, e, op, ep) => op === "front_to_back" && (ep === "beatdown" || ep === "all_in"), 108, "Front-to-back > dive all-in"],

    // Split vs teamfight
    [(o, e, op, ep) => op === "split_push" && ep === "teamfight_engage", 95, "Split 1-3-1 > force teamfight"],
    [(o, e) => o.split >= 2 && e.hardEngage >= 2 && e.front >= 2, 72, "Double split > comp groupée"],
    [(o, e) => o.split >= 1 && o.global >= 2 && e.hardEngage >= 2, 68, "Global + side lane > force 5v5"],
    [(o, e, op, ep) => op === "split_push" && ep === "hypercarry", 62, "Side pressure > ADC scale immobile"],

    // Pick vs scale
    [(o, e, op, ep) => op === "pick_global" && ep === "hypercarry" && e.peel < 1.0 && e.enchanter === 0, 88, "Pick/global punition > hypercarry"],
    [(o, e) => o.global >= 2 && e.scaling >= 1.2 && e.immobile >= 1 && e.peel < 1.2, 55, "Double global punition scale"],
    [(o, e) => o.assassin >= 2 && e.enchanter >= 1 && e.marksman >= 1, 58, "Assassin pick > carry protégé lent"],
    [(o, e, op, ep) => op === "pick_global" && ep === "scaling_late", 65, "Pick cross-map > scaling late"],

    // All-in vs hypercarry / poke
    [(o, e, op, ep) => op === "all_in" && ep === "hypercarry", 88, "All-in tempo > hypercarry non protégé"],
    [(o, e, op, ep) => op === "lane_tempo" && ep === "hypercarry", 78, "Lane tempo > hypercarry"],
    [(o, e) => o.early >= 2.0 && e.scaling >= 1.4 && e.peel < 1.0, 118, "Tempo early > scale sans peel"],

    // Beatdown / dive
    [(o, e, op, ep) => op === "beatdown" && ep === "poke_siege", 175, "Dive coordonné > poke immobile"],
    [(o, e) => o.dive >= 2 && e.siege >= 2 && e.front < 2, 112, "Multi-dive > backline poke fragile"],
    [(o, e, op, ep) => op === "teamfight_engage" && ep === "split_push", 95, "Teamfight groupé > split isolé"],

    // Zone / wombo — disengage casse le wombo (les deux polarités)
    [(o, e) => o.disengage >= 2 && e.womboSetup >= 2, 118, "Disengage casse le wombo"],
    [(o, e) => o.womboSetup >= 2 && e.disengage >= 2, 118, "Disengage casse le wombo", false],
    [(o, e) => e.womboSetup >= 2 && o.disengage >= 1 && o.peel >= 1.0, 102, "Peel/disengage > wombo setup"],
    [(o, e) => o.womboSetup >= 2 && e.disengage < 1 && e.front >= 1, 88, "Wombo setup > comp sans disengage"],
    [(o, e) => o.zone >= 2 && e.hardEngage >= 2, 108, "Zone control > engage dans choke"],
    [(o, e) => o.zone >= 2 && e.dive >= 2 && o.front >= 1, 125, "Zone choke > comp dive"],

    // Frontline gaps
    [(o, e, op) => op === "teamfight_engage" && e.front < 1, 98, "Engage vs comp sans frontline"],
    [(o, e) => o.hardEngage >= 2 && e.front === 0, 86, "Engage frontal vs backline nue"],

    // Range vs melee
    [(o, e) => o.siege >= 2 && e.front >= 2 && e.siege === 0, 78, "Range abuse vs frontline mélée"],
    [(o, e) => o.poke >= 2 && e.dive >= 2 && o.disengage >= 1, 72, "Poke kite vs comp dive"],

    // Scaling late
    [(o, e, op, ep) => op === "scaling_late" && (ep === "all_in" || ep === "lane_tempo"), 105, "Scale late > window all-in"],
    [(o, e) => o.scaling >= 2.0 && e.early >= 1.6 && o.front >= 1, 88, "Outscale > spike early avec front"],

    // Anti-heal / sustain wars
    [(o, e) => countMech(o.vs, "antiHeal") >= 1 && e.enchanter >= 2, 68, "Anti-heal > double enchanter"],
    [(o, e) => countMech(o.vs, "shieldBreak") >= 1 && e.enchanter >= 2, 62, "AOE/shield break > peel enchanter"],

    // CC stack vs mobility
    [(o, e) => o.ccHeavy >= 3 && e.dive >= 2, 74, "CC lockdown > comp mobile dive"],
    [(o, e) => o.antiDash >= 1 && e.dive >= 2, 108, "Anti-dash > comp dive"],
    [(o, e) => o.antiDash >= 1 && e.dive >= 2 && o.front >= 1, 132, "Anti-dash + front > comp dive"],
    [(o, e) => o.antiDash >= 2 && e.dive >= 2, 118, "Double anti-dash > comp dive"],

    // Jungle tempo
    [(o, e) => countMech(o.vs, "invadeEarly") >= 1 && countMech(e.vs, "scaleJungle") >= 1, 58, "Invade early > jungler scale"],
    [(o, e) => countMech(o.vs, "scaleJungle") >= 1 && e.early >= 2.0, 52, "Jungle scale vs comp snowball early", false],

    // Famille coaching — engage vs range mix
    [(o, e) => o.disengage >= 2 && e.hardEngage >= 2, 105, "Famille disengage > engage"],
    [(o, e) => o.hardEngage >= 3 && e.siege >= 2 && e.disengage === 0, 98, "Triple engage > poke sans disengage"],

    // Front-to-back mirror
    [(o, e, op, ep) => ep === "front_to_back" && op === "teamfight_engage" && e.peel >= 1.2, 95, "Front-to-back peel > engage brut", false],
    [(o, e, op, ep) => ep === "hypercarry" && op === "poke_siege" && e.peel >= 1.0, 88, "Scale protégé > poke siege", false],

    // Catch comp
    [(o, e) => o.global >= 1 && o.hardEngage >= 1 && e.immobile >= 2, 102, "Catch comp > carries immobiles"],
    [(o, e, op, ep) => op === "pick_global" && ep === "front_to_back", 115, "Pick global > front-to-back groupé"],

    // Trundle / shred vs tanks
    [(o, e) => countMech(o.vs, "tankShred") >= 1 && e.front >= 2, 65, "Shred %PV > double frontline"],

    // Stealth
    [(o, e) => countMech(o.vs, "stealth") >= 1 && countMech(e.vs, "revealStealth") >= 1, 72, "Reveal/vision > stealth comp", false],
    [(o, e) => countMech(o.vs, "stealth") >= 1 && countMech(e.vs, "revealStealth") === 0 && countMech(e.vs, "aoeMage") === 0, 70, "Stealth > comp sans reveal"],

    // Channel
    [(o, e) => countMech(o.vs, "channelUlt") >= 1 && countMech(e.vs, "interruptChannel") >= 2, 85, "Interrupt CC > canalisation", false],
    [(o, e) => countMech(o.vs, "channelUlt") >= 1 && countMech(e.vs, "interruptChannel") === 0, 78, "Canalisation libre > sans interrupt"],

    // Short vs long range bot
    [(o, e) => countMech(o.vs, "longRangeAdc") >= 1 && countMech(e.vs, "shortRangeAdc") >= 1 && o.disengage >= 1, 55, "ADC long range + disengage > all-in bot"],

    // Logic corpus (MOBA theory)
    [(o, e, op, ep) => op === "hypercarry" && ep === "teamfight_engage" && o.enchanter >= 1 && o.peel >= 1.0, 178, "Hypercarry enchanter > engage frontal"],
    [(o, e, op, ep) => op === "front_to_back" && (ep === "beatdown" || ep === "all_in") && o.peel >= 1.1, 125, "Front-to-back peel > dive all-in"],
    [(o, e, op, ep) => op === "hypercarry" && ep === "beatdown" && o.enchanter >= 1 && o.front >= 1, 112, "ADC protégé > dive coordonné"],
    [(o, e, op, ep) => op === "teamfight_engage" && ep === "hypercarry" && e.peel < 0.85 && e.enchanter === 0, 102, "Engage frontal > hypercarry sans peel"],
    [(o, e, op, ep) => op === "poke_disengage" && ep === "teamfight_engage" && o.disengage >= 1, 152, "Poke/disengage kite > engage frontal"],
    [(o, e, op, ep) => op === "poke_siege" && ep === "teamfight_engage" && o.siege >= 2, 138, "Siege range > engage mélée"],
    [(o, e, op, ep) => op === "lane_tempo" && ep === "hypercarry" && e.peel < 1.1, 108, "Lane tempo > hypercarry lent"],
    [(o, e, op, ep) => op === "all_in" && ep === "hypercarry" && e.peel < 1.0, 118, "All-in spike > scale sans peel"],
    [(o, e, op, ep) => op === "teamfight_engage" && ep === "split_push" && o.hardEngage >= 2, 108, "Force 5v5 > split isolé"],
    [(o, e, op, ep) => op === "pick_global" && ep === "hypercarry" && o.global >= 1 && e.peel < 1.2 && e.enchanter === 0, 102, "Pick/global punition > hypercarry immobile"],
    [(o, e, op, ep) => op === "scaling_late" && (ep === "lane_tempo" || ep === "all_in"), 118, "Outscale > window tempo"],
    [(o, e) => o.enchanter >= 2 && e.dive >= 2 && o.peel >= 1.2, 148, "Double enchanter peel > comp dive"],
    [(o, e) => o.zone >= 2 && e.immobile >= 2 && o.peel >= 0.8, 115, "Zone + peel > carries immobiles"],
    [(o, e) => o.disengage >= 2 && e.hardEngage >= 2 && o.siege >= 1, 138, "Disengage + poke > engage frontal"],
    [(o, e) => o.disengage >= 2 && e.hardEngage >= 2, 112, "Double disengage > engage frontal"],
    [(o, e) => o.hardEngage >= 2 && e.siege >= 2 && e.disengage === 0, 82, "Engage > poke sans disengage"],
    [(o, e, op, ep) => op === "beatdown" && ep === "hypercarry" && e.peel < 1.2, 98, "Dive tempo > hypercarry non protégé"],
    [(o, e, op, ep) => op === "hypercarry" && ep === "poke_siege" && o.peel >= 1.0, 95, "Scale protégé > poke siege"],
    [(o, e) => countMech(o.vs, "peelTank") >= 1 && o.enchanter >= 1 && e.dive >= 2, 118, "Front peel + enchanter > dive"],
    [(o, e) => o.global >= 1 && o.hardEngage >= 1 && e.immobile >= 1 && e.disengage < 2, 98, "Catch global > backline immobile"],
    [(o, e, op, ep) => op === "front_to_back" && ep === "poke_siege" && o.peel >= 1.0, 88, "Front-to-back > poke siege kite"],
    [(o, e) => countMech(o.vs, "antiDash") >= 1 && e.dive >= 2 && o.front >= 1, 108, "Anti-dash + front > comp dive"],
    [(o, e) => o.scaling >= 1.5 && o.enchanter >= 1 && e.early >= 1.7 && e.peel < 1.0, 105, "Enchanter scale > spike early non protégé"],
    [(o, e, op, ep) => op === "pick_global" && ep === "teamfight_engage" && o.global >= 2, 88, "Double global pick > force teamfight"],
    [(o, e) => countMech(o.vs, "tankShred") >= 1 && e.front >= 2 && o.marksman >= 1, 72, "Shred + ADC > double frontline"],
    [(o, e, op, ep) => (op === "poke_disengage" || op === "poke_siege") && ep === "teamfight_engage" && o.disengage >= 2, 158, "Disengage kite > wombo/engage"],
    [(o, e) => e.womboSetup >= 2 && o.disengage >= 1 && o.peel >= 1.0, 102, "Peel/disengage > wombo setup"],
    [(o, e, op, ep) => op === "lane_tempo" && ep === "scaling_late", 82, "Tempo early > scale late non protégé"],
    [(o, e) => o.siege >= 2 && e.hardEngage >= 2 && o.disengage >= 2, 135, "Triple disengage poke > engage"],
    [(o, e, op, ep) => op === "hypercarry" && ep === "lane_tempo" && o.peel >= 1.1, 92, "Hypercarry peel > lane tempo"],
    [(o, e, op, ep) => ep === "teamfight_engage" && op === "hypercarry" && o.enchanter >= 1 && o.peel >= 1.0 && o.scaling >= 0.9, 195, "Peel enchanter absorbe l'engage — carry scale", false],
    [(o, e, op, ep) =>
      ep === "hypercarry" &&
      (op === "teamfight_engage" || op === "pick_global" || op === "beatdown" || op === "all_in") &&
      e.enchanter >= 1 &&
      e.peel >= 1.0 &&
      e.scaling >= 0.9,
      188,
      "Hypercarry protégé > engage/dive frontal",
      false],
    [(o, e, op, ep) => op === "hypercarry" && (ep === "teamfight_engage" || ep === "pick_global" || ep === "beatdown") && o.enchanter >= 1 && o.peel >= 1.0 && o.scaling >= 0.9, 178, "Peel enchanter > engage/dive frontal"],
    [(o, e, op, ep) => ep === "beatdown" && op === "hypercarry" && o.enchanter >= 1 && o.front >= 1, 142, "Front + enchanter > dive sur hypercarry", false],
    [(o, e, op, ep) => ep === "all_in" && op === "front_to_back" && o.peel >= 1.0 && o.front >= 1, 118, "Front-to-back peel > all-in tempo", false],
    [(o, e) => e.hardEngage >= 2 && o.disengage >= 1 && o.enchanter >= 1 && o.scaling >= 1.0, 148, "Enchanter disengage > engage brut", false],
    [(o, e, op, ep) => ep === "teamfight_engage" && op === "poke_disengage" && o.disengage >= 2, 148, "Double disengage annule le engage", false],
    [(o, e) => countMech(e.vs, "immobileCarry") >= 1 && o.enchanter >= 1 && o.peel >= 1.2 && e.dive >= 1, 108, "Peel enchanter > dive sur carry immobile", false],

    // Riot class wheel — comp-level
    [(o, e) => o.classFrontline >= 2 && e.classSlayer >= 2, 95, "Double frontline Tank > comp Slayer"],
    [(o, e) => o.classMageBurst >= 2 && e.classFrontline === 0, 88, "Double burst Mage > comp sans frontline"],
    [(o, e) => o.classMarksman >= 1 && e.classFrontline >= 2 && e.classMageBurst === 0, 72, "Marksman DPS > double Tank sans burst"],
    [(o, e) => o.classMarksman >= 1 && o.classPeel >= 1 && e.classSlayer >= 2, 82, "ADC + peel Enchanter > dive Slayer"],
    [(o, e) => o.classEngage >= 2 && e.classPeel === 0 && e.classFrontline <= 1, 78, "Engage Vanguard/Diver > backline sans peel"],
    [(o, e) => o.classDiversity >= 4 && e.classDiversity <= 2, 48, "Diversité sous-classes > comp mono-classe"],
    [(o, e) => o.classFrontline >= 1 && e.classMageBurst >= 2, 65, "Tank absorbe le burst Mage"],
    [(o, e) => e.classFrontline >= 1 && o.classMageBurst >= 2, 65, "Tank absorbe le burst Mage", false],
  ];

  /** Champion pair rules — [test(ourV, enemyV), ourScore, enemyScore, reasonFn] */
  const CHAMP_PAIR_RULES = [
    [(u, e) => hasMech(u, "spellShield") && hasMech(e, "hookCc"), 42, 0, (u, e) => `${u.name} spell-shield > hook ${e.name}`],
    [(u, e) => hasMech(u, "spellShield") && (e.engage || 0) >= 0.5 && (e.spellSetup || 0) >= 0.4, 28, 0, (u) => `${u.name} black shield > CC chain`],
    [(u, e) => hasMech(u, "antiDash") && ((e.tags?.has?.("dive") || hasMech(e, "diveAssassin"))), 38, 0, (u, e) => `${u.name} anti-dash > mobilité ${e.name}`],
    [(u, e) => hasMech(u, "pointCc") && hasMech(e, "diveAssassin"), 32, 0, (u, e) => `${u.name} CC point-click > dash ${e.name}`],
    [(u, e) => (u.peel || 0) >= 0.55 && (e.engage || 0) >= 0.5, 24, 0, (u) => `${u.name} peel vs engage`],
    [(u, e) => (u.peel || 0) >= 0.55 && hasMech(e, "diveAssassin"), 30, 0, (u, e) => `${u.name} peel > dive ${e.name}`],
    [(u, e) => hasMech(u, "disengage") && hasMech(e, "hardEngage"), 26, 0, (u, e) => `${u.name} disengage > engage ${e.name}`],
    [(u, e) => (u.tags?.has?.("poke") || hasMech(u, "siegePoke")) && (e.tags?.has?.("frontline") || (e.tank || 0) >= 0.5) && (e.scaling || 0) < 0.5, 22, 0, (u, e) => `${u.name} poke > frontline ${e.name} non-scale`],
    [(u, e) => hasMech(u, "percentHp") && (e.tank || 0) >= 0.55, 35, 0, (u, e) => `${u.name} %PV > tank ${e.name}`],
    [(u, e) => hasMech(u, "tankShred") && (e.tank || 0) >= 0.5, 32, 0, (u, e) => `${u.name} shred > ${e.name} tank`],
    [(u, e) => (u.burst || 0) >= 0.55 && e.isMarksman && !hasMech(e, "disengage"), 28, 0, (u, e) => `${u.name} burst > ADC ${e.name}`],
    [(u, e) => hasMech(u, "diveAssassin") && hasMech(e, "immobileCarry"), 34, 0, (u, e) => `${u.name} dive > immobile ${e.name}`],
    [(u, e) => hasMech(u, "globalUlt") && hasMech(e, "immobileCarry"), 26, 0, (u, e) => `${u.name} global > ${e.name} immobile`],
    [(u, e) => hasMech(u, "windwall") && (hasMech(e, "siegePoke") || (e.tags?.has?.("poke"))), 30, 0, (u) => `${u.name} windwall > skillshots`],
    [(u, e) => hasMech(u, "interruptChannel") && hasMech(e, "channelUlt"), 36, 0, (u, e) => `${u.name} interrupt > channel ${e.name}`],
    [(u, e) => hasMech(u, "antiHeal") && hasMech(e, "enchanter"), 28, 0, (u, e) => `${u.name} anti-heal > ${e.name} sustain`],
    [(u, e) => hasMech(u, "revealStealth") && hasMech(e, "stealth"), 32, 0, (u, e) => `${u.name} reveal > stealth ${e.name}`],
    [(u, e) => hasMech(u, "aoeMage") && hasMech(e, "stealth"), 26, 0, (u) => `${u.name} AOE > stealth attach`],
    [(u, e) => hasMech(u, "zoneControl") && (e.tags?.has?.("dive") || hasMech(e, "diveAssassin")), 24, 0, (u, e) => `${u.name} zone > dive ${e.name}`],
    [(u, e) => hasMech(u, "splitPush") && (e.tank || 0) >= 0.6 && (e.scaling || 0) < 0.45, 22, 0, (u, e) => `${u.name} split > ${e.name} tank side`],
    [(u, e) => hasMech(u, "peelTank") && hasMech(e, "diveAssassin"), 26, 0, (u, e) => `${u.name} peel tank > ${e.name} assassin`],
    [(u, e) => hasMech(u, "longRangeAdc") && hasMech(e, "shortRangeAdc"), 20, 0, (u, e) => `${u.name} range > ${e.name} all-in bot`],
    [(u, e) => hasMech(u, "knockupSetup") && (e.spells?.knockup || hasMech(e, "knockupSetup")), 0, 18, (u, e) => `${e.name} knockup setup vs ${u.name}`],
    [(u, e) => hasMech(e, "spellShield") && hasMech(u, "hookCc"), 0, 38, (u, e) => `${e.name} spell-shield > hook ${u.name}`],
    [(u, e) => hasMech(e, "antiDash") && (hasMech(u, "diveAssassin") || u.tags?.has?.("dive")), 0, 34, (u, e) => `${e.name} anti-dash > ${u.name}`],
    [(u, e) => (e.peel || 0) >= 0.55 && (u.burst || 0) >= 0.55 && u.isMarksman, 0, 28, (u, e) => `${e.name} peel > burst ${u.name}`],
    [(u, e) => hasMech(e, "disengage") && hasMech(u, "hardEngage"), 0, 24, (u, e) => `${e.name} disengage > engage ${u.name}`],
    [(u, e) => hasMech(e, "globalUlt") && hasMech(u, "immobileCarry"), 0, 26, (u, e) => `${e.name} global > ${u.name} immobile`],
    [(u, e) => hasMech(e, "windwall") && (u.tags?.has?.("poke") || hasMech(u, "siegePoke")), 0, 28, (u, e) => `${e.name} windwall > poke ${u.name}`],
    [(u, e) => hasMech(e, "interruptChannel") && hasMech(u, "channelUlt"), 0, 36, (u, e) => `${e.name} interrupt > channel ${u.name}`],
    [(u, e) => hasMech(e, "percentHp") && (u.tank || 0) >= 0.55, 0, 35, (u, e) => `${e.name} %PV > tank ${u.name}`],
    [(u, e) => hasMech(e, "diveAssassin") && hasMech(u, "immobileCarry"), 0, 34, (u, e) => `${e.name} dive > immobile ${u.name}`],
    [(u, e) => hasMech(e, "pointCc") && hasMech(u, "diveAssassin"), 0, 32, (u, e) => `${e.name} CC lock > dash ${u.name}`],
    [(u, e) => hasMech(e, "zoneControl") && u.isMarksman && !hasMech(u, "disengage"), 0, 24, (u, e) => `${e.name} zone > ADC ${u.name}`],
    [(u, e) => hasMech(e, "aoeMage") && hasMech(u, "enchanter"), 0, 22, (u, e) => `${e.name} AOE > enchanter ${u.name}`],
    [(u, e) => hasMech(e, "invadeEarly") && (u.early || 0) < 0.35, 0, 22, (u, e) => `${e.name} invade early > ${u.name} scale`],
    [(u, e) => hasMech(u, "cleansePeel") && (e.spellSetup || 0) >= 0.5, 26, 0, (u) => `${u.name} cleanse/peel > CC heavy`],
    [(u, e) => norm(u.name) === norm("Galio") && hasMech(e, "diveAssassin"), 30, 0, () => "Galio taunt/MR > assassin AP"],
    [(u, e) => norm(u.name) === norm("Galio") && (e.burst || 0) >= 0.55 && (e.ap || 0) >= 0.6, 24, 0, () => "Galio MR stack > burst AP"],
    [(u, e) => norm(u.name) === norm("Bard") && hasMech(e, "immobileCarry"), 22, 0, () => "Bard pick/roam > carry immobile"],
    [(u, e) => norm(u.name) === norm("Ryze") && hasMech(e, "splitPush"), 20, 0, () => "Ryze Realm Warp > split isolé"],
    [(u, e) => norm(u.name) === norm("Caitlyn") && hasMech(e, "shortRangeAdc"), 24, 0, () => "Caitlyn siege/traps > all-in bot"],
    [(u, e) => norm(u.name) === norm("Naafiri") && hasMech(e, "enchanter"), 0, 26, (u, e) => `${e.name} peel > dive Naafiri`],
    [(u, e) => (norm(e.name) === norm("Seraphine") || norm(e.name) === norm("Séraphine")) && hasMech(u, "diveAssassin"), 0, 28, () => "Séraphine peel/reset > dive"],
    [(u, e) => norm(e.name) === norm("Ashe") && hasMech(u, "diveAssassin"), 0, 22, () => "Ashe peel ult > dive"],
    [(u, e) => norm(e.name) === norm("Trundle") && (u.tank || 0) >= 0.5, 0, 30, (u) => `Trundle R shred > ${u.name} tank`],
    [(u, e) => norm(e.name) === norm("Cassiopeia") && hasMech(u, "diveAssassin"), 0, 32, () => "Cassiopeia anti-dash W > dive"],
    [(u, e) => norm(u.name) === norm("Cassiopeia") && hasMech(e, "diveAssassin"), 32, 0, () => "Cassiopeia anti-dash W > dive"],
    [(u, e) => norm(e.name) === norm("Rumble") && u.isMarksman && !hasMech(u, "disengage"), 0, 26, () => "Rumble zone > ADC immobile"],
    [(u, e) => norm(u.name) === norm("Rumble") && e.isMarksman, 26, 0, () => "Rumble zone > ADC backline"],

    // Riot subclass wheel — champ pairs
    [(u, e) => (u.subclass || u.championClass?.primary) === "Vanguard" && (e.subclass || e.championClass?.primary) === "Assassin", 26, 0, () => "Tank absorbe le burst Assassin"],
    [(u, e) => (u.subclass || u.championClass?.primary) === "Vanguard" && (e.subclass || e.championClass?.primary) === "Burst", 24, 0, () => "Frontline > Burst Mage setup"],
    [(u, e) => (u.subclass || u.championClass?.primary) === "Marksman" && ["Vanguard", "Warden"].includes(e.subclass || e.championClass?.primary), 22, 0, () => "Marksman DPS > Tank sans gapclose"],
    [(u, e) => ["Juggernaut", "Diver"].includes(u.subclass || u.championClass?.primary) && ["Vanguard", "Warden"].includes(e.subclass || e.championClass?.primary), 20, 0, (u) => `${u.name} bruiser > Tank sustain`],
    [(u, e) => (u.subclass || u.championClass?.primary) === "Assassin" && ["Artillery", "Burst"].includes(e.subclass || e.championClass?.primary), 24, 0, () => "Assassin gapclose > Mage immobile"],
    [(u, e) => (u.subclass || u.championClass?.primary) === "Enchanter" && (e.subclass || e.championClass?.primary) === "Assassin", 20, 0, (u) => `${u.name} peel > dive Assassin`],
    [(u, e) => (e.subclass || e.championClass?.primary) === "Vanguard" && (u.subclass || u.championClass?.primary) === "Assassin", 0, 26, () => "Tank absorbe le burst Assassin"],
    [(u, e) => (e.subclass || e.championClass?.primary) === "Marksman" && ["Vanguard", "Warden"].includes(u.subclass || u.championClass?.primary), 0, 22, () => "Marksman DPS > Tank sans gapclose"],
    [(u, e) => (e.subclass || e.championClass?.primary) === "Assassin" && ["Artillery", "Burst"].includes(u.subclass || u.championClass?.primary), 0, 24, () => "Assassin gapclose > Mage immobile"],
  ];

  /** Curated pairwise counters (mirrors curated_matchups.json — usable without re-run apply script). */
  const CURATED_COUNTERS = [
    ["Thresh", "Morgana", "Black shield vs hook — counter bot historique."],
    ["Blitzcrank", "Morgana", "Black shield vs hook."],
    ["Nautilus", "Morgana", "Black shield vs CC chain."],
    ["Leona", "Morgana", "Black shield vs all-in CC."],
    ["Yasuo", "Vex", "Vex anti-dash — counter reconnu Yasuo."],
    ["Yone", "Vex", "Vex anti-dash vs Yone."],
    ["Zed", "Vex", "Vex R follow dash."],
    ["Camille", "Poppy", "Poppy W anti-dash — counter Camille."],
    ["Jarvan IV", "Poppy", "Poppy W stop E-Q dash."],
    ["Naafiri", "Poppy", "Poppy W vs Naafiri dash."],
    ["Malphite", "Trundle", "Trundle R vs armor stack."],
    ["Ornn", "Trundle", "Trundle R steal stats — counter classique des tanks."],
    ["Dr. Mundo", "Vayne", "Vayne %PV true damage — counter super tanks."],
    ["Lux", "Fizz", "Fizz E dodge + burst — counter mage immobile."],
    ["Xerath", "Fizz", "Fizz gap close vs poke immobile."],
    ["Syndra", "Zed", "Zed outplay et burst vs mage immobile."],
    ["Ashe", "Nocturne", "Nocturne gap close vs immobile ADC."],
    ["Jinx", "Nocturne", "Nocturne dive immobile ADC."],
    ["Akali", "Galio", "Galio MR + taunt vs AP assassin."],
    ["Katarina", "Galio", "Galio MR + interrupt channel."],
    ["Twisted Fate", "Nocturne", "Nocturne R deny TF R vision."],
    ["Varus", "Yasuo", "Yasuo windwall vs Varus Q."],
    ["Lucian", "Nautilus", "Nautilus point CC vs Lucian dash."],
    ["Seraphine", "Leona", "Leona gap close vs enchanter immobile."],
    ["Séraphine", "Leona", "Leona gap close vs enchanter immobile."],
    ["Samira", "Poppy", "Poppy W stop Samira dash combo."],
    ["Hecarim", "Poppy", "Poppy W stop Hecarim E."],
    ["Master Yi", "Rammus", "Rammus W reflect vs auto-attack."],
    ["Soraka", "Gwen", "Gwen anti-heal vs Soraka."],
    ["Aatrox", "Gwen", "Gwen anti-heal + dodge Aatrox Q."],
    ["Zed", "Malzahar", "Malzahar R suppress + passive shield."],
    ["Darius", "Quinn", "Quinn kiting — counter classique Darius."],
    ["Nasus", "Teemo", "Teemo poke vs Nasus stack."],
    ["Heimerdinger", "Syndra", "Syndra burst turrets + Heimer."],
    ["Azir", "Cassiopeia", "Cassiopeia DPS sustain vs Azir immobile."],
    ["Kalista", "Nautilus", "Nautilus CC stop Kalista hop."],
    ["Pyke", "Lulu", "Lulu peel vs Pyke execute."],
    ["Milio", "Leona", "Leona all-in before Milio cleanse timing."],
    ["Ambessa", "Poppy", "Poppy W anti-dash fighter."],
    ["Bel'Veth", "Poppy", "Poppy W vs Bel'Veth dashes."],
    ["Zeri", "Poppy", "Poppy W vs Zeri wall dash."],
    ["Nilah", "Poppy", "Poppy W vs Nilah dash."],
    ["Smolder", "Nocturne", "Nocturne dive before Smolder scale."],
    ["Hwei", "Zed", "Zed gap close vs immobile mage."],
    ["Brand", "Yuumi", "Brand AOE vs Yuumi attach heal."],
    ["Brand", "Soraka", "Brand AOE heal break."],
    ["Swain", "Kassadin", "Kassadin scale + MR."],
    ["Orianna", "Syndra", "Syndra burst vs Orianna immobile."],
    ["Elise", "Lee Sin", "Lee Sin early duel vs Elise."],
    ["Skarner", "Olaf", "Olaf ult ignore suppress."],
    ["Amumu", "Olaf", "Olaf ult ignore Amumu R."],
    ["Sejuani", "Olaf", "Olaf ult ignore CC."],
    ["Illaoi", "Vayne", "Vayne %PV vs tentacles tank."],
    ["Sett", "Vayne", "Vayne kiting vs Sett W."],
    ["Gnar", "Vayne", "Vayne %PV vs Mega Gnar."],
    ["Renata Glasc", "Blitzcrank", "Hook catch immobile support."],
    ["Caitlyn", "Nocturne", "Nocturne bypass traps."],
    ["Aphelios", "Nocturne", "Nocturne dive immobile ADC."],
    ["Briar", "Poppy", "Poppy W vs Briar dash."],
    ["Mel", "Zed", "Zed bypass reflect avec R timing."],
    ["Ryze", "Kassadin", "Kassadin R chase Ryze."],
    ["Galio", "Akali", "Galio MR + taunt vs AP assassin."],
    ["Bard", "Leona", "Leona all-in vs Bard roam immobile."],
    ["Trundle", "Malphite", "Trundle R vs armor stack."],
    ["Trundle", "Sejuani", "Trundle duel et steal stats en TF."],
    ["Rumble", "Malphite", "Malphite armor + zone vs AP bruiser."],
    ["Ashe", "Naafiri", "Ashe peel ult > Naafiri dive."],
    ["Naafiri", "Seraphine", "Séraphine peel > Naafiri dive."],
    ["Naafiri", "Séraphine", "Séraphine peel > Naafiri dive."],
    ["Cassiopeia", "Naafiri", "Cassiopeia W > Naafiri dash."],
    ["Trundle", "Galio", "Trundle R shred > Galio tank."],
    ["Ashe", "Caitlyn", "Caitlyn range/traps > Ashe immobile."],
    ["Ryze", "Trundle", "Ryze group TP > Trundle split isolé."],
  ];

  const curatedMap = new Map();
  for (const [defender, attacker, reason] of CURATED_COUNTERS) {
    const d = norm(defender);
    if (!curatedMap.has(d)) curatedMap.set(d, []);
    curatedMap.get(d).push({ attacker: norm(attacker), reason, attackerName: attacker });
  }

  function curatedCounterEdge(ourV, enemyV) {
    const ourKey = norm(ourV.name);
    const enemyKey = norm(enemyV.name);
    let ourHit = null;
    let enemyHit = null;

    const defUs = curatedMap.get(enemyKey);
    if (defUs) {
      const hit = defUs.find((c) => c.attacker === ourKey);
      if (hit) ourHit = { score: 48, reason: `${ourV.name} > ${enemyV.name} · ${hit.reason}` };
    }
    const defThem = curatedMap.get(ourKey);
    if (defThem) {
      const hit = defThem.find((c) => c.attacker === enemyKey);
      if (hit) enemyHit = { score: 48, reason: `${enemyV.name} > ${ourV.name} · ${hit.reason}` };
    }

    if (ourHit && enemyHit) {
      if (ourHit.score >= enemyHit.score) return { our: 48, enemy: 0, reason: ourHit.reason };
      return { our: 0, enemy: 48, reason: enemyHit.reason };
    }
    if (ourHit) return { our: 48, enemy: 0, reason: ourHit.reason };
    if (enemyHit) return { our: 0, enemy: 48, reason: enemyHit.reason };
    return null;
  }

  function evaluateCompClashes(ourVs, enemyVs, ourPlan, enemyPlan, ourArch, enemyArch) {
    const ourM = buildTeamMetrics(ourVs);
    const enemyM = buildTeamMetrics(enemyVs);
    let our = 0;
    let enemy = 0;
    const hits = [];

    for (const [when, score, reason, favorsOur = true] of COMP_CLASH_RULES) {
      try {
        if (!when(ourM, enemyM, ourPlan, enemyPlan, ourArch, enemyArch)) continue;
        if (favorsOur) {
          our += score;
          hits.push({ edge: score, reason, our: ourPlan || "plan", enemy: enemyPlan || "plan" });
        } else {
          enemy += score;
          hits.push({ edge: -score, reason, our: enemyPlan || "plan", enemy: ourPlan || "plan" });
        }
      } catch (_) {
        /* skip malformed rule */
      }
    }

    return { our, enemy, hits, ourM, enemyM };
  }

  function evaluateChampPair(ourV, enemyV) {
    let our = 0;
    let enemy = 0;
    const reasons = [];

    const curated = curatedCounterEdge(ourV, enemyV);
    if (curated) {
      our += curated.our;
      enemy += curated.enemy;
      if (curated.reason) reasons.push(curated.reason);
    }

    for (const [test, oScore, eScore, reasonFn] of CHAMP_PAIR_RULES) {
      try {
        if (!test(ourV, enemyV)) continue;
        our += Math.round(oScore * 0.45);
        enemy += Math.round(eScore * 0.45);
        const r = reasonFn(ourV, enemyV);
        if (r) reasons.push(r);
      } catch (_) {
        /* skip */
      }
    }

    our = Math.min(our, 52);
    enemy = Math.min(enemy, 52);

    return { our, enemy, reasons: [...new Set(reasons)] };
  }

  /** Team-wide cross interactions (not 1v1 duplicate). */
  function evaluateTeamTraitClashes(ourVs, enemyVs) {
    const ourM = buildTeamMetrics(ourVs);
    const enemyM = buildTeamMetrics(enemyVs);
    let our = 0;
    let enemy = 0;
    const hits = [];

    const teamRules = [
      [(o, e) => o.enchanter >= 2 && e.dive >= 2, 68, "Double enchanter > comp dive"],
      [(o, e) => o.global >= 2 && e.split >= 1 && e.global === 0, 48, "Double global > split sans réponse"],
      [(o, e) => o.hardEngage >= 2 && e.immobile >= 2 && e.peel < 1.0 && e.enchanter === 0, 52, "Engage > duo immobile non protégé"],
      [(o, e) => o.siege >= 2 && e.peel < 0.8 && e.front < 1, 45, "Siege > backline sans front"],
      [(o, e) => o.antiDash >= 1 && e.dive >= 2, 58, "Anti-dash équipe > dive"],
      [(o, e) => o.antiDash >= 1 && e.dive >= 2 && o.front >= 1, 72, "Anti-dash + front équipe > dive"],
      [(o, e) => o.spellShield >= 1 && countMech(e.vs, "hookCc") >= 1, 38, "Spell-shield > hook comp"],
      [(o, e) => countMech(o.vs, "peelTank") >= 2 && e.dive >= 2, 52, "Double peel > dive"],
      [(o, e) => e.womboSetup >= 2 && o.disengage >= 2, 72, "Disengage casse le wombo comp"],
      [(o, e) => o.zone >= 2 && e.dive >= 2, 62, "Zone control équipe > dive"],
      [(o, e) => countMech(o.vs, "percentHp") >= 1 && e.front >= 2, 40, "Carry %PV > double frontline"],
      [(o, e) => countMech(o.vs, "invadeEarly") >= 2 && e.scaling >= 1.4, 36, "Double invade > comp scale"],
    ];

    for (const row of teamRules) {
      const [when, score, reason, favorsOur = true] = row;
      if (!when(ourM, enemyM)) continue;
      if (favorsOur) {
        our += score;
        hits.push({ edge: score, reason, our: "équipe", enemy: "équipe" });
      } else {
        enemy += score;
        hits.push({ edge: -score, reason, our: "équipe", enemy: "équipe" });
      }
    }

    return { our, enemy, hits };
  }

  global.LoLDraftInteractions = {
    MECH,
    COMP_CLASH_RULES,
    CHAMP_PAIR_RULES,
    CURATED_COUNTERS,
    evaluateCompClashes,
    evaluateChampPair,
    evaluateTeamTraitClashes,
    curatedCounterEdge,
    buildTeamMetrics,
    ruleCount: () => COMP_CLASH_RULES.length + CHAMP_PAIR_RULES.length + CURATED_COUNTERS.length,
  };
})(typeof window !== "undefined" ? window : globalThis);
