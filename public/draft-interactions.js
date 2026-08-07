/**
 * Draft & macro duel interactions — règles encodées depuis le corpus LoL (familles, compos, counters).
 * Comp-level (dizaines–centaines) · champ pairs (unités–dizaines) · team traits.
 * Chaque règle décrit l'avantage du camp qui remplit la condition ; l'évaluation est
 * appliquée dans les deux orientations, donc edge(A,B) = -edge(B,A).
 */
(function (global) {
  function norm(name) {
    return String(name || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function setOf(names) {
    return new Set(names.map(norm));
  }

  /** Mécaniques champion — corpus skills + curated_matchups. */
  const MECH = {
    spellShield: setOf(["Morgana", "Sivir", "Nocturne", "Olaf", "Malzahar", "Briar"]),
    antiDash: setOf(["Poppy", "Vex", "Cassiopeia", "Azir", "Janna", "K'Santé"]),
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
      "Caitlyn", "Varus", "Ezreal", "Jayce", "Ziggs", "Xerath", "Hwei", "Lux", "Vel'Koz", "Zoé", "Corki",
      "Smolder",
    ]),
    immobileCarry: setOf([
      "Ashe", "Jinx", "Kog'Maw", "Aphelios", "Miss Fortune", "Jhin", "Xerath", "Vel'Koz", "Brand", "Swain",
      "Yunara",
    ]),
    diveAssassin: setOf([
      "Zed", "Talon", "Qiyana", "Naafiri", "Kha'Zix", "Rengar", "Evelynn", "Akali", "Fizz", "Diana",
    ]),
    percentHp: setOf(["Vayne", "Gwen", "Fiora", "Kog'Maw", "Kayle", "Bel'Veth"]),
    tankShred: setOf(["Trundle", "Gwen", "Vayne", "Fiora", "Gnar", "Mordekaiser"]),
    windwall: setOf(["Yasuo", "Samira", "Braum", "Mel"]),
    enchanter: setOf([
      "Lulu", "Janna", "Milio", "Soraka", "Yuumi", "Nami", "Karma", "Séraphine", "Sona", "Taric",
    ]),
    hardEngage: setOf([
      "Malphite", "Ornn", "Sejuani", "Amumu", "Rell", "Jarvan IV", "Wukong", "Alistar", "Leona", "Nautilus",
      "Galio", "Ambessa", "Sion", "Zac", "K'Santé",
    ]),
    disengage: setOf([
      "Janna", "Gragas", "Braum", "Tahm Kench", "Thresh", "Poppy", "Azir", "Ziggs", "Caitlyn", "Ashe",
      "Séraphine", "Karma", "Ezreal",
    ]),
    zoneControl: setOf([
      "Anivia", "Veigar", "Heimerdinger", "Zyra", "Taliyah", "Azir", "Cassiopeia", "Rumble", "Hwei",
      "Aurora",
    ]),
    cleansePeel: setOf(["Milio", "Morgana", "Olaf"]),
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
    shieldBreak: setOf(["Brand", "Gwen", "Mordekaiser", "Séraphine"]),
    shortRangeAdc: setOf(["Samira", "Nilah", "Lucian", "Draven", "Kalista"]),
    longRangeAdc: setOf(["Caitlyn", "Varus", "Ezreal", "Jhin", "Ashe", "Ziggs", "Xerath"]),
    invadeEarly: setOf(["Lee Sin", "Elise", "Nidalee", "Graves", "Rek'Sai", "Pantheon", "Jarvan IV"]),
    scaleJungle: setOf(["Maître Yi", "Bel'Veth", "Kindred", "Graves", "Kayn", "Viego", "Diana"]),
    peelTank: setOf(["Braum", "Poppy", "Tahm Kench", "Maokai", "Shen", "Galio", "Trundle", "K'Santé"]),
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
   * Comp-level clash rules — [when(ourM, enemyM, ourPlan, enemyPlan) => bool, score, reason]
   * Chaque règle décrit l'avantage du camp `o` ; l'orientation miroir est évaluée automatiquement.
   */
  const COMP_CLASH_RULES = [
    // Poke / disengage vs engage
    [(o, e) => o.poke >= 2 && e.hardEngage >= 2 && o.disengage >= 1, 145, "Poke + disengage > engage frontal"],
    [(o, e) => o.siege >= 2 && e.hardEngage >= 2 && o.peel >= 1.0, 132, "Siege à distance > engage mélée"],
    [(o, e) => o.poke >= 2 && e.engage >= 1.4 && o.disengage >= 2, 118, "Kite range vs comp engage"],
    [(o, e) => o.siege >= 3 && e.hardEngage >= 1, 95, "Triple poke/siege abuse vs engage lent"],
    [(o, e, op, ep) => (op === "poke_disengage" || op === "poke_siege") && ep === "teamfight_engage", 150, "Poke/disengage kite > engage frontal"],
    [(o, e, op, ep) => (op === "poke_disengage" || op === "poke_siege") && ep === "all_in", 82, "Poke/siege > all-in tempo"],

    // Hypercarry / front-to-back protégés
    [(o, e, op, ep) =>
      op === "hypercarry" &&
      ["teamfight_engage", "pick_global", "beatdown", "all_in"].includes(ep) &&
      ((o.enchanter >= 1 && o.peel >= 1.0) || (o.peel >= 1.4 && o.scaling >= 1.0)),
      178,
      "Hypercarry protégé > engage/dive frontal"],
    [(o, e, op, ep) => op === "hypercarry" && ep === "lane_tempo" && o.peel >= 1.1, 95, "Hypercarry peel > lane tempo"],
    [(o, e) => o.scaling >= 1.6 && o.enchanter >= 2 && e.early >= 1.8, 115, "Double enchanter scale > spike early"],
    [(o, e, op, ep) => op === "front_to_back" && (ep === "beatdown" || ep === "all_in"), 115, "Front-to-back > dive all-in"],
    [(o, e, op, ep) => op === "front_to_back" && ep === "teamfight_engage" && o.peel >= 1.2, 95, "Front-to-back peel > engage brut"],
    [(o, e, op, ep) => op === "front_to_back" && ep === "poke_siege" && o.peel >= 1.0, 88, "Front-to-back > poke siege kite"],
    [(o, e, op, ep) => op === "hypercarry" && ep === "poke_siege" && o.peel >= 1.0, 95, "Scale protégé > poke siege"],

    // Split vs teamfight
    [(o, e) => o.split >= 2 && e.hardEngage >= 2 && e.front >= 2, 72, "Double split > comp groupée"],
    [(o, e) => o.split >= 1 && o.global >= 2 && e.hardEngage >= 2, 68, "Global + side lane > force 5v5"],
    [(o, e, op, ep) => op === "split_push" && ep === "hypercarry", 62, "Side pressure > ADC scale immobile"],
    [(o, e, op, ep) => op === "teamfight_engage" && ep === "split_push", 100, "Teamfight groupé > split isolé"],

    // Pick / catch vs scale
    [(o, e, op, ep) => op === "pick_global" && ep === "hypercarry" && e.peel < 1.0 && e.enchanter === 0, 88, "Pick/global punition > hypercarry"],
    [(o, e) => o.global >= 2 && e.scaling >= 1.2 && e.immobile >= 1 && e.peel < 1.2, 55, "Double global punition scale"],
    [(o, e) => o.assassin >= 2 && e.enchanter >= 1 && e.marksman >= 1, 58, "Assassin pick > carry protégé lent"],
    [(o, e, op, ep) => op === "pick_global" && ep === "scaling_late", 65, "Pick cross-map > scaling late"],
    [(o, e) => o.global >= 1 && o.hardEngage >= 1 && e.immobile >= 2, 102, "Catch comp > carries immobiles"],
    [(o, e, op, ep) => op === "pick_global" && ep === "front_to_back", 115, "Pick global > front-to-back groupé"],
    [(o, e, op, ep) => op === "pick_global" && ep === "teamfight_engage" && o.global >= 2, 88, "Double global pick > force teamfight"],

    // All-in / tempo vs hypercarry
    [(o, e, op, ep) => op === "all_in" && ep === "hypercarry", 88, "All-in tempo > hypercarry non protégé"],
    [(o, e, op, ep) => op === "lane_tempo" && ep === "hypercarry", 78, "Lane tempo > hypercarry"],
    [(o, e, op, ep) => op === "teamfight_engage" && ep === "hypercarry" && e.peel < 0.85 && e.enchanter === 0, 102, "Engage frontal > hypercarry sans peel"],
    [(o, e, op, ep) => op === "beatdown" && ep === "hypercarry" && e.peel < 1.2, 98, "Dive tempo > hypercarry non protégé"],
    [(o, e) => o.early >= 2.0 && e.scaling >= 1.4 && e.peel < 1.0, 118, "Tempo early > scale sans peel"],
    [(o, e, op, ep) => op === "lane_tempo" && ep === "scaling_late" && e.peel < 1.0, 82, "Tempo early > scale late non protégé"],

    // Beatdown / dive
    [(o, e, op, ep) => op === "beatdown" && ep === "poke_siege", 175, "Dive coordonné > poke immobile"],
    [(o, e) => o.dive >= 2 && e.siege >= 2 && e.front < 2, 112, "Multi-dive > backline poke fragile"],

    // Zone / wombo — disengage casse le wombo
    [(o, e) => o.disengage >= 2 && e.womboSetup >= 2, 118, "Disengage casse le wombo"],
    [(o, e) => o.disengage === 1 && o.peel >= 1.0 && e.womboSetup >= 2, 102, "Peel/disengage > wombo setup"],
    [(o, e) => o.womboSetup >= 2 && e.disengage < 1 && e.front >= 1, 88, "Wombo setup > comp sans disengage"],
    [(o, e) => o.zone >= 2 && e.hardEngage >= 2, 108, "Zone control > engage dans choke"],
    [(o, e) => o.zone >= 2 && e.dive >= 2 && o.front >= 1, 125, "Zone choke > comp dive"],
    [(o, e) => o.zone >= 2 && e.immobile >= 2 && o.peel >= 0.8, 115, "Zone + peel > carries immobiles"],

    // Frontline gaps
    [(o, e, op) => op === "teamfight_engage" && e.front < 1, 98, "Engage vs comp sans frontline"],
    [(o, e) => o.hardEngage >= 2 && e.front === 0, 86, "Engage frontal vs backline nue"],

    // Range vs melee
    [(o, e) => o.siege >= 2 && e.front >= 2 && e.siege === 0, 78, "Range abuse vs frontline mélée"],
    [(o, e) => o.poke >= 2 && e.dive >= 2 && o.disengage >= 1, 72, "Poke kite vs comp dive"],

    // Scaling late
    [(o, e, op, ep) => op === "scaling_late" && (ep === "all_in" || ep === "lane_tempo"), 105, "Scale late > window all-in"],
    [(o, e) => o.scaling >= 2.0 && e.early >= 1.6 && o.front >= 1, 88, "Outscale > spike early avec front"],
    [(o, e) => o.scaling >= 1.5 && o.enchanter >= 1 && e.early >= 1.7 && e.peel < 1.0, 105, "Enchanter scale > spike early non protégé"],

    // Anti-heal / shield break
    [(o, e) => countMech(o.vs, "shieldBreak") >= 1 && e.enchanter >= 2, 62, "AOE/shield break > peel enchanter"],

    // CC / peel vs mobility
    [(o, e) => o.ccHeavy >= 3 && e.dive >= 2, 74, "CC lockdown > comp mobile dive"],
    [(o, e) => o.antiDash >= 1 && e.dive >= 2 && o.front < 1, 118, "Anti-dash > comp dive"],
    [(o, e) => o.antiDash >= 1 && e.dive >= 2 && o.front >= 1, 195, "Anti-dash + front > comp dive"],
    [(o, e) => o.enchanter >= 2 && e.dive >= 2 && o.peel >= 1.2, 148, "Double enchanter peel > comp dive"],
    [(o, e) => countMech(o.vs, "peelTank") >= 1 && o.enchanter >= 1 && e.dive >= 2, 118, "Front peel + enchanter > dive"],
    [(o, e) => countMech(o.vs, "immobileCarry") >= 1 && o.enchanter >= 1 && o.peel >= 1.2 && e.dive >= 1, 108, "Peel enchanter > dive sur carry immobile"],

    // Jungle tempo
    [(o, e) => countMech(o.vs, "invadeEarly") >= 1 && countMech(e.vs, "scaleJungle") >= 1, 58, "Invade early > jungler scale"],
    [(o, e) => o.early >= 2.0 && countMech(e.vs, "scaleJungle") >= 1, 52, "Snowball early > jungler scale"],

    // Famille coaching — engage vs range
    [(o, e, op) => op !== "split_push" && o.disengage >= 2 && e.hardEngage >= 2, 108, "Famille disengage > engage"],
    [(o, e) => o.hardEngage >= 2 && e.siege >= 2 && e.disengage === 0, 90, "Engage > poke sans disengage"],
    [(o, e, op) => op !== "split_push" && e.hardEngage >= 2 && o.disengage >= 1 && o.enchanter >= 1 && o.scaling >= 1.0, 148, "Enchanter disengage > engage brut"],

    // Shred vs tanks
    [(o, e) => countMech(o.vs, "tankShred") >= 1 && e.front >= 2, 65, "Shred %PV > double frontline"],

    // Stealth
    [(o, e) => countMech(o.vs, "revealStealth") >= 1 && countMech(e.vs, "stealth") >= 1, 72, "Reveal/vision > stealth comp"],
    [(o, e) => countMech(o.vs, "stealth") >= 1 && countMech(e.vs, "revealStealth") === 0 && countMech(e.vs, "aoeMage") === 0, 70, "Stealth > comp sans reveal"],

    // Channel
    [(o, e) => countMech(o.vs, "interruptChannel") >= 2 && countMech(e.vs, "channelUlt") >= 1, 85, "Interrupt CC > canalisation"],
    [(o, e) => countMech(o.vs, "channelUlt") >= 1 && countMech(e.vs, "interruptChannel") === 0, 78, "Canalisation libre > sans interrupt"],

    // Short vs long range bot
    [(o, e) => countMech(o.vs, "longRangeAdc") >= 1 && countMech(e.vs, "shortRangeAdc") >= 1 && o.disengage >= 1, 55, "ADC long range + disengage > all-in bot"],

    // Riot class wheel — comp-level
    [(o, e) => o.classFrontline >= 2 && e.classSlayer >= 2, 95, "Double frontline Tank > comp Slayer"],
    [(o, e) => o.classMageBurst >= 2 && e.classFrontline === 0, 88, "Double burst Mage > comp sans frontline"],
    [(o, e) => o.classMarksman >= 1 && e.classFrontline >= 2 && e.classMageBurst === 0, 72, "Marksman DPS > double Tank sans burst"],
    [(o, e) => o.classMarksman >= 1 && o.classPeel >= 1 && e.classSlayer >= 2, 82, "ADC + peel Enchanter > dive Slayer"],
    [(o, e) => o.classEngage >= 2 && e.classPeel === 0 && e.classFrontline <= 1, 78, "Engage Vanguard/Diver > backline sans peel"],
    [(o, e) => o.classDiversity >= 4 && e.classDiversity <= 2, 48, "Diversité sous-classes > comp mono-classe"],
    [(o, e) => o.classFrontline >= 1 && e.classMageBurst >= 2, 65, "Tank absorbe le burst Mage"],
  ];

  /**
   * Champion pair rules — [test(attacker, defender), score, reasonFn(attacker, defender)]
   * Évaluées dans les deux orientations (notre champion attaquant puis l'ennemi attaquant).
   */
  const subOf = (v) => v.subclass || v.championClass?.primary;

  const CHAMP_PAIR_RULES = [
    [(a, d) => hasMech(a, "spellShield") && hasMech(d, "hookCc"), 40, (a, d) => `${a.name} spell-shield > hook ${d.name}`],
    [(a, d) => hasMech(a, "spellShield") && (d.engage || 0) >= 0.5 && (d.spellSetup || 0) >= 0.4, 28, (a) => `${a.name} black shield > CC chain`],
    [(a, d) => hasMech(a, "antiDash") && (d.tags?.has?.("dive") || hasMech(d, "diveAssassin")), 36, (a, d) => `${a.name} anti-dash > mobilité ${d.name}`],
    [(a, d) => hasMech(a, "pointCc") && hasMech(d, "diveAssassin"), 32, (a, d) => `${a.name} CC point-click > dash ${d.name}`],
    [(a, d) => (a.peel || 0) >= 0.55 && (d.engage || 0) >= 0.5, 24, (a) => `${a.name} peel vs engage`],
    [(a, d) => (a.peel || 0) >= 0.55 && hasMech(d, "diveAssassin"), 30, (a, d) => `${a.name} peel > dive ${d.name}`],
    [(a, d) => (a.peel || 0) >= 0.55 && (d.burst || 0) >= 0.55 && d.isMarksman, 28, (a, d) => `${a.name} peel > burst ${d.name}`],
    [(a, d) => hasMech(a, "disengage") && hasMech(d, "hardEngage"), 25, (a, d) => `${a.name} disengage > engage ${d.name}`],
    [(a, d) => (a.tags?.has?.("poke") || hasMech(a, "siegePoke")) && (d.tags?.has?.("frontline") || (d.tank || 0) >= 0.5) && (d.scaling || 0) < 0.5, 22, (a, d) => `${a.name} poke > frontline ${d.name} non-scale`],
    [(a, d) => hasMech(a, "percentHp") && (d.tank || 0) >= 0.55, 35, (a, d) => `${a.name} %PV > tank ${d.name}`],
    [(a, d) => hasMech(a, "tankShred") && (d.tank || 0) >= 0.5, 32, (a, d) => `${a.name} shred > ${d.name} tank`],
    [(a, d) => (a.burst || 0) >= 0.55 && d.isMarksman && !hasMech(d, "disengage"), 28, (a, d) => `${a.name} burst > ADC ${d.name}`],
    [(a, d) => hasMech(a, "diveAssassin") && hasMech(d, "immobileCarry"), 34, (a, d) => `${a.name} dive > immobile ${d.name}`],
    [(a, d) => hasMech(a, "globalUlt") && hasMech(d, "immobileCarry"), 26, (a, d) => `${a.name} global > ${d.name} immobile`],
    [(a, d) => hasMech(a, "windwall") && (hasMech(d, "siegePoke") || d.tags?.has?.("poke")), 30, (a) => `${a.name} windwall > skillshots`],
    [(a, d) => hasMech(a, "interruptChannel") && hasMech(d, "channelUlt"), 36, (a, d) => `${a.name} interrupt > channel ${d.name}`],
    [(a, d) => hasMech(a, "revealStealth") && hasMech(d, "stealth"), 32, (a, d) => `${a.name} reveal > stealth ${d.name}`],
    [(a, d) => hasMech(a, "aoeMage") && hasMech(d, "stealth"), 26, (a) => `${a.name} AOE > stealth attach`],
    [(a, d) => hasMech(a, "aoeMage") && hasMech(d, "enchanter"), 22, (a, d) => `${a.name} AOE > enchanter ${d.name}`],
    [(a, d) => hasMech(a, "zoneControl") && (d.tags?.has?.("dive") || hasMech(d, "diveAssassin")), 24, (a, d) => `${a.name} zone > dive ${d.name}`],
    [(a, d) => hasMech(a, "zoneControl") && d.isMarksman && !hasMech(d, "disengage"), 24, (a, d) => `${a.name} zone > ADC ${d.name}`],
    [(a, d) => hasMech(a, "splitPush") && (d.tank || 0) >= 0.6 && (d.scaling || 0) < 0.45, 22, (a, d) => `${a.name} split > ${d.name} tank side`],
    [(a, d) => hasMech(a, "peelTank") && hasMech(d, "diveAssassin"), 26, (a, d) => `${a.name} peel tank > ${d.name} assassin`],
    [(a, d) => hasMech(a, "longRangeAdc") && hasMech(d, "shortRangeAdc"), 20, (a, d) => `${a.name} range > ${d.name} all-in bot`],
    [(a, d) => hasMech(a, "invadeEarly") && (d.early || 0) < 0.35, 22, (a, d) => `${a.name} invade early > ${d.name} scale`],
    [(a, d) => hasMech(a, "cleansePeel") && (d.spellSetup || 0) >= 0.5, 26, (a) => `${a.name} cleanse/peel > CC heavy`],
    [(a, d) => norm(a.name) === norm("Galio") && hasMech(d, "diveAssassin"), 30, () => "Galio taunt/MR > assassin AP"],
    [(a, d) => norm(a.name) === norm("Galio") && (d.burst || 0) >= 0.55 && (d.ap || 0) >= 0.6, 24, () => "Galio MR stack > burst AP"],
    [(a, d) => norm(a.name) === norm("Bard") && hasMech(d, "immobileCarry"), 22, () => "Bard pick/roam > carry immobile"],
    [(a, d) => norm(a.name) === norm("Ryze") && hasMech(d, "splitPush"), 20, () => "Ryze Realm Warp > split isolé"],
    [(a, d) => norm(a.name) === norm("Caitlyn") && hasMech(d, "shortRangeAdc"), 24, () => "Caitlyn siege/traps > all-in bot"],
    [(a, d) => hasMech(a, "enchanter") && norm(d.name) === norm("Naafiri"), 26, (a) => `${a.name} peel > dive Naafiri`],
    [(a, d) => norm(a.name) === norm("Séraphine") && hasMech(d, "diveAssassin"), 28, () => "Séraphine peel/reset > dive"],
    [(a, d) => norm(a.name) === norm("Ashe") && hasMech(d, "diveAssassin"), 22, () => "Ashe peel ult > dive"],
    [(a, d) => norm(a.name) === norm("Trundle") && (d.tank || 0) >= 0.5, 30, (a, d) => `Trundle R shred > ${d.name} tank`],
    [(a, d) => norm(a.name) === norm("Cassiopeia") && hasMech(d, "diveAssassin"), 32, () => "Cassiopeia anti-dash W > dive"],
    [(a, d) => norm(a.name) === norm("Rumble") && d.isMarksman && !hasMech(d, "disengage"), 26, () => "Rumble zone > ADC immobile"],

    // Riot subclass wheel — champ pairs
    [(a, d) => subOf(a) === "Vanguard" && subOf(d) === "Assassin", 26, () => "Tank absorbe le burst Assassin"],
    [(a, d) => subOf(a) === "Vanguard" && subOf(d) === "Burst", 24, () => "Frontline > Burst Mage setup"],
    [(a, d) => subOf(a) === "Marksman" && ["Vanguard", "Warden"].includes(subOf(d)), 22, () => "Marksman DPS > Tank sans gapclose"],
    [(a, d) => ["Juggernaut", "Diver"].includes(subOf(a)) && ["Vanguard", "Warden"].includes(subOf(d)), 20, (a) => `${a.name} bruiser > Tank sustain`],
    [(a, d) => subOf(a) === "Assassin" && ["Artillery", "Burst"].includes(subOf(d)), 24, () => "Assassin gapclose > Mage immobile"],
    [(a, d) => subOf(a) === "Enchanter" && subOf(d) === "Assassin", 20, (a) => `${a.name} peel > dive Assassin`],
  ];

  /** Curated pairwise counters — convention [defender, attacker, raison] (attacker counter defender). */
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
    ["Séraphine", "Leona", "Leona gap close vs enchanter immobile."],
    ["Samira", "Poppy", "Poppy W stop Samira dash combo."],
    ["Hecarim", "Poppy", "Poppy W stop Hecarim E."],
    ["Maître Yi", "Rammus", "Rammus W reflect vs auto-attack."],
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
    ["Yuumi", "Brand", "Brand AOE vs Yuumi attach heal."],
    ["Soraka", "Brand", "Brand AOE heal break."],
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
    ["Bard", "Leona", "Leona all-in vs Bard roam immobile."],
    ["Sejuani", "Trundle", "Trundle duel et steal stats en TF."],
    ["Rumble", "Malphite", "Malphite armor + zone vs AP bruiser."],
    ["Naafiri", "Ashe", "Ashe peel ult > Naafiri dive."],
    ["Naafiri", "Séraphine", "Séraphine peel > Naafiri dive."],
    ["Naafiri", "Cassiopeia", "Cassiopeia W > Naafiri dash."],
    ["Galio", "Trundle", "Trundle R shred > Galio tank."],
    ["Ashe", "Caitlyn", "Caitlyn range/traps > Ashe immobile."],
    ["Trundle", "Ryze", "Ryze group TP > Trundle split isolé."],
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
      console.warn(`Counters curés contradictoires ignorés : ${ourV.name} ↔ ${enemyV.name}`);
      return null;
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

    for (const [when, score, reason] of COMP_CLASH_RULES) {
      try {
        if (when(ourM, enemyM, ourPlan, enemyPlan, ourArch, enemyArch)) {
          our += score;
          hits.push({ edge: score, reason, our: ourPlan || "plan", enemy: enemyPlan || "plan" });
        }
      } catch (_) {
        /* skip malformed rule */
      }
      try {
        if (when(enemyM, ourM, enemyPlan, ourPlan, enemyArch, ourArch)) {
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

    for (const [test, score, reasonFn] of CHAMP_PAIR_RULES) {
      try {
        if (test(ourV, enemyV)) {
          our += Math.round(score * 0.45);
          const r = reasonFn(ourV, enemyV);
          if (r) reasons.push(r);
        }
      } catch (_) {
        /* skip */
      }
      try {
        if (test(enemyV, ourV)) {
          enemy += Math.round(score * 0.45);
          const r = reasonFn(enemyV, ourV);
          if (r) reasons.push(r);
        }
      } catch (_) {
        /* skip */
      }
    }

    our = Math.min(our, 52);
    enemy = Math.min(enemy, 52);

    return { our, enemy, reasons: [...new Set(reasons)] };
  }

  /** Team-wide cross interactions (not 1v1 duplicate). */
  const TEAM_TRAIT_RULES = [
    [(o, e) => o.enchanter >= 2 && e.dive >= 2, 68, "Double enchanter > comp dive"],
    [(o, e) => o.global >= 2 && e.split >= 1 && e.global === 0, 48, "Double global > split sans réponse"],
    [(o, e) => o.hardEngage >= 2 && e.immobile >= 2 && e.peel < 1.0 && e.enchanter === 0, 52, "Engage > duo immobile non protégé"],
    [(o, e) => o.siege >= 2 && e.peel < 0.8 && e.front < 1, 45, "Siege > backline sans front"],
    [(o, e) => o.antiDash >= 1 && e.dive >= 2 && o.front < 1, 58, "Anti-dash équipe > dive"],
    [(o, e) => o.antiDash >= 1 && e.dive >= 2 && o.front >= 1, 115, "Anti-dash + front équipe > dive"],
    [(o, e) => o.spellShield >= 1 && countMech(e.vs, "hookCc") >= 1, 38, "Spell-shield > hook comp"],
    [(o, e) => countMech(o.vs, "peelTank") >= 2 && e.dive >= 2, 52, "Double peel > dive"],
    [(o, e) => o.disengage >= 2 && e.womboSetup >= 2, 72, "Disengage casse le wombo comp"],
    [(o, e) => o.zone >= 2 && e.dive >= 2, 62, "Zone control équipe > dive"],
    [(o, e) => countMech(o.vs, "percentHp") >= 1 && e.front >= 2, 40, "Carry %PV > double frontline"],
    [(o, e) => countMech(o.vs, "invadeEarly") >= 2 && e.scaling >= 1.4, 36, "Double invade > comp scale"],
  ];

  function evaluateTeamTraitClashes(ourVs, enemyVs) {
    const ourM = buildTeamMetrics(ourVs);
    const enemyM = buildTeamMetrics(enemyVs);
    let our = 0;
    let enemy = 0;
    const hits = [];

    for (const [when, score, reason] of TEAM_TRAIT_RULES) {
      if (when(ourM, enemyM)) {
        our += score;
        hits.push({ edge: score, reason, our: "équipe", enemy: "équipe" });
      }
      if (when(enemyM, ourM)) {
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
