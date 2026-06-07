/**
 * LoL Macro Recommender — analyse comp vs comp → plan de match (macro).
 */
(function (global) {
  const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];

  function hasTag(meta, tag) {
    return meta?.tags?.includes(tag);
  }

  function teamTags(comp, metaMap) {
    const tags = new Set();
    for (const slot of SLOTS) {
      const name = comp[slot];
      if (!name) continue;
      (metaMap[name]?.tags || []).forEach((t) => tags.add(t));
    }
    return tags;
  }

  function countTags(comp, metaMap, tag) {
    return SLOTS.filter((s) => hasTag(metaMap[comp[s]], tag)).length;
  }

  function countersOf(meta) {
    return meta?.bestCounters || meta?.worstMatchups || [];
  }

  function laneVerdict(ours, theirs, metaMap) {
    if (!ours || !theirs) return { verdict: "unknown", note: "Lane incomplète." };
    const o = metaMap[ours];
    const e = metaMap[theirs];
    if (countersOf(o).includes(theirs)) {
      return { verdict: "lose", note: `${ours} est en difficulté vs ${theirs} (counter).` };
    }
    if (countersOf(e).includes(ours)) {
      return { verdict: "win", note: `${theirs} est counter par ${ours}.` };
    }
    if (hasTag(o, "scaling") && hasTag(e, "assassin")) {
      return { verdict: "lose", note: `${ours} doit respecter le spike de ${theirs} avant de scale.` };
    }
    if (hasTag(o, "poke") && hasTag(e, "frontline")) {
      return { verdict: "even", note: "Poke vs front — jouer la distance et les resets." };
    }
    if (hasTag(o, "frontline") && hasTag(e, "mage_burst")) {
      return { verdict: "win", note: `Frontline absorbe le burst de ${theirs}.` };
    }
    return { verdict: "even", note: "Matchup skill — prio vague et jungle décident." };
  }

  function pickAssignees(comp, metaMap, tag, max = 2) {
    const out = [];
    for (const slot of SLOTS) {
      const name = comp[slot];
      if (!name || !hasTag(metaMap[name], tag)) continue;
      out.push({ name, slot });
      if (out.length >= max) break;
    }
    return out;
  }

  function formatAssign(assignees) {
    if (!assignees?.length) return "";
    return assignees.map((a) => `${a.name} (${a.slot})`).join(", ");
  }

  function dominantCompType(comp, metaMap) {
    const counts = {};
    for (const slot of SLOTS) {
      const name = comp[slot];
      if (!name) continue;
      const types = metaMap[name]?.compTypes || [];
      for (const t of types) counts[t] = (counts[t] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || null;
  }

  const COMP_LABELS = {
    poke_siege: "Poke / Siege",
    poke_disengage: "Poke + Disengage",
    teamfight_engage: "Teamfight / Engage",
    split_push: "Split push (1-3)",
    hypercarry: "Hypercarry",
    lane_tempo: "Lane tempo",
    all_in: "All-in / Catch",
    pick_global: "Pick / Global",
  };

  function recommendMacro(comp, enemy, metaMap) {
    const ourTags = teamTags(comp, metaMap);
    const enTags = teamTags(enemy, metaMap);
    const compType = dominantCompType(comp, metaMap);
    const engage = countTags(comp, metaMap, "engage");
    const peel = countTags(comp, metaMap, "peel");
    const split = countTags(comp, metaMap, "split");
    const scaling = countTags(comp, metaMap, "scaling");
    const assassin = countTags(comp, metaMap, "assassin");
    const poke = countTags(comp, metaMap, "poke");
    const front = countTags(comp, metaMap, "frontline");
    const enEngage = countTags(enemy, metaMap, "engage");
    const enAssassin = countTags(enemy, metaMap, "assassin");

    const tactics = { compType, compTypeLabel: COMP_LABELS[compType] || compType };

    // Lane priority
    const lanes = {};
    for (const s of SLOTS) lanes[s] = laneVerdict(comp[s], enemy[s], metaMap);
    const wins = SLOTS.filter((s) => lanes[s]?.verdict === "win");
    const loses = SLOTS.filter((s) => lanes[s]?.verdict === "lose");

    if (wins.includes("Bot") && !loses.includes("Bot")) {
      tactics.lanePriority = {
        value: "Bot side",
        reason: "Bot lane gagnante — prio drake et setup dive.",
        assign: pickAssignees(comp, metaMap, "scaling", 1),
      };
    } else if (wins.includes("Top")) {
      tactics.lanePriority = {
        value: "Top side",
        reason: "Top favorable — herald, invade topside, TP pressure.",
        assign: pickAssignees(comp, metaMap, "split", 1),
      };
    } else if (wins.includes("Mid")) {
      tactics.lanePriority = {
        value: "Mid prio",
        reason: "Mid prio — roams jungle, vision rivière.",
        assign: [{ name: comp.Mid, slot: "Mid" }],
      };
    } else {
      tactics.lanePriority = {
        value: "Équilibré",
        reason: "Pas de lane dominante — farm safe, scale.",
        assign: [],
      };
    }

    // Jungle
    const jungler = comp.Jungle;
    const jMeta = metaMap[jungler];
    if (hasTag(jMeta, "gank_jungle") || assassin >= 1) {
      tactics.junglePath = {
        value: "Gank lvl 3",
        reason: `${jungler || "Jungle"} profite des lanes avec prio ou CC.`,
        assign: [{ name: jungler, slot: "Jungle" }],
      };
    } else if (hasTag(jMeta, "farm_jungle") || scaling >= 2) {
      tactics.junglePath = {
        value: "Full clear → gank",
        reason: "Comp scale — farm efficace puis objectifs.",
        assign: [{ name: jungler, slot: "Jungle" }],
      };
    } else if (enAssassin >= 1) {
      tactics.junglePath = {
        value: "Couverture lanes faibles",
        reason: "Protège les lanes vulnérables vs assassins.",
        assign: [{ name: jungler, slot: "Jungle" }],
      };
    } else {
      tactics.junglePath = {
        value: "Trade flexible",
        reason: "Adapt pathing selon le tracking ennemi.",
        assign: [{ name: jungler, slot: "Jungle" }],
      };
    }

    // Herald / Drake
    if (scaling >= 2 && front >= 1) {
      tactics.heraldDrake = {
        value: "Drake stack",
        reason: "Comp teamfight — stack drakes pour soul fight.",
        assign: pickAssignees(comp, metaMap, "frontline", 2),
      };
    } else if (split >= 1 && wins.includes("Top")) {
      tactics.heraldDrake = {
        value: "Herald → plate",
        reason: "Split top — herald pour plates et pression.",
        assign: pickAssignees(comp, metaMap, "split", 1),
      };
    } else {
      tactics.heraldDrake = {
        value: "Trade flexible",
        reason: "Trade drake vs herald selon spawn et prio lanes.",
        assign: [],
      };
    }

    // Wave
    if (poke >= 2) {
      tactics.waveState = {
        value: "Slow push → roam",
        reason: "Poke comp — setup slow push mid puis group.",
        assign: pickAssignees(comp, metaMap, "poke", 2),
      };
    } else if (loses.length >= 2) {
      tactics.waveState = {
        value: "Freeze / deny",
        reason: "Lanes perdantes — freeze sous tourelle, JG cover.",
        assign: [],
      };
    } else {
      tactics.waveState = {
        value: "Fast push → reset",
        reason: "Prio pour reset et objectifs.",
        assign: [],
      };
    }

    // Mid game — priorité au type de comp détecté (cours Shanei)
    if (compType === "split_push" || split >= 2) {
      tactics.midGame = {
        value: "Split side lane",
        reason: "Plan split — side opposée à l'objectif, breaker inhib, jamais mid group.",
        assign: pickAssignees(comp, metaMap, "split", 2),
      };
    } else if (compType === "poke_disengage" || compType === "poke_siege" || poke >= 2) {
      tactics.midGame = {
        value: "Siege & disengage",
        reason: "Poke/disengage — slow push towers, never force all-in (Braum/Taric).",
        assign: pickAssignees(comp, metaMap, "poke", 2),
      };
    } else if (compType === "hypercarry" || (scaling >= 2 && peel >= 1)) {
      tactics.midGame = {
        value: "Farm safe → teamfight",
        reason: "Hypercarry — éviter fights avant 2 items, peel obligatoire.",
        assign: pickAssignees(comp, metaMap, "scaling", 2),
      };
    } else if (compType === "pick_global" || assassin >= 1) {
      tactics.midGame = {
        value: "Pick vision / bush",
        reason: "Pick/global — vision profonde, punir rotations isolées.",
        assign: pickAssignees(comp, metaMap, "assassin", 2),
      };
    } else if (compType === "all_in" || compType === "lane_tempo") {
      tactics.midGame = {
        value: "Force fights",
        reason: "All-in/tempo — snowball avant scale adverse.",
        assign: pickAssignees(comp, metaMap, "engage", 2),
      };
    } else if (engage >= 2 || front >= 2) {
      tactics.midGame = {
        value: "Group 4 mid",
        reason: "Engage/front — cherche skirmish 4v4 mid.",
        assign: pickAssignees(comp, metaMap, "engage", 2),
      };
    } else if (assassin >= 1 || hasTag(jMeta, "pick")) {
      tactics.midGame = {
        value: "Pick vision / bush",
        reason: "Pick comp — vision profonde et bush control.",
        assign: pickAssignees(comp, metaMap, "assassin", 2),
      };
    } else {
      tactics.midGame = {
        value: "Shadow jungler",
        reason: "Mid game flexible — shadow carry et contest camps.",
        assign: [{ name: jungler, slot: "Jungle" }],
      };
    }

    // Baron / late objective
    if (scaling >= 2) {
      tactics.baronDrake = {
        value: "Fight soul / elder",
        reason: "Scale late — fight autour des objectifs majeurs.",
        assign: pickAssignees(comp, metaMap, "scaling", 2),
      };
    } else if (split >= 1) {
      tactics.baronDrake = {
        value: "Split press",
        reason: "Baron bait pendant split side pressure.",
        assign: pickAssignees(comp, metaMap, "split", 1),
      };
    } else {
      tactics.baronDrake = {
        value: "Baron setup",
        reason: "Clear vision, slow push side, start baron avec prio.",
        assign: pickAssignees(comp, metaMap, "frontline", 1),
      };
    }

    // Teamfight style
    if (front >= 1 && peel >= 1 && scaling >= 1) {
      tactics.teamfight = {
        value: "Front to back",
        reason: "Front + peel — protège le carry backline.",
        assign: [...pickAssignees(comp, metaMap, "frontline", 1), ...pickAssignees(comp, metaMap, "peel", 1)],
      };
    } else if (assassin >= 1 || enEngage >= 2) {
      tactics.teamfight = {
        value: "Flank / dive backline",
        reason: "Dive ou flank sur carry adverse.",
        assign: pickAssignees(comp, metaMap, "dive", 2),
      };
    } else if (poke >= 2) {
      tactics.teamfight = {
        value: "Poke siege",
        reason: "Siege tourelles avant fight commit.",
        assign: pickAssignees(comp, metaMap, "poke", 2),
      };
    } else {
      tactics.teamfight = {
        value: "Reset / pick",
        reason: "Fight par reset après pick.",
        assign: pickAssignees(comp, metaMap, "engage", 1),
      };
    }

    // Vision
    if (assassin >= 1 || hasTag(jMeta, "pick")) {
      tactics.vision = {
        value: "Deep enemy jungle",
        reason: "Pick comp — deep wards pour picks.",
        assign: [{ name: jungler, slot: "Jungle" }],
      };
    } else if (tactics.lanePriority?.value === "Bot side") {
      tactics.vision = {
        value: "River / pixel",
        reason: "Contrôle rivière bot pour drake.",
        assign: [{ name: comp.Support, slot: "Support" }],
      };
    } else {
      tactics.vision = {
        value: "Sweep avant objectif",
        reason: "Deny vision puis contest objectif.",
        assign: [{ name: comp.Support, slot: "Support" }],
      };
    }

    // Win condition
    if (compType === "split_push" || split >= 2) {
      tactics.winCondition = {
        value: "Split push (usure)",
        reason: "Win par pression side — force 2+ réponses, usure macro.",
        assign: pickAssignees(comp, metaMap, "split", 2),
      };
    } else if (compType === "poke_disengage" || compType === "poke_siege") {
      tactics.winCondition = {
        value: "Siege & disengage",
        reason: "Plates + tourelles à distance ; laisser l'ennemi engage.",
        assign: pickAssignees(comp, metaMap, "poke", 2),
      };
    } else if (compType === "hypercarry" || (scaling >= 2 && front + peel >= 2)) {
      tactics.winCondition = {
        value: "Scale late",
        reason: "Survivre early, gagner teamfight late.",
        assign: pickAssignees(comp, metaMap, "scaling", 2),
      };
    } else if (engage >= 2) {
      tactics.winCondition = {
        value: "Teamfight 5v5",
        reason: "Force les fights avec engage supérieur.",
        assign: pickAssignees(comp, metaMap, "engage", 2),
      };
    } else {
      tactics.winCondition = {
        value: "Pick / pickoff",
        reason: "Crée des picks avant objectifs.",
        assign: pickAssignees(comp, metaMap, "assassin", 1),
      };
    }

    return tactics;
  }

  function buildAvoid(comp, enemy, metaMap, tactics) {
    const avoid = [];
    const enTags = teamTags(enemy, metaMap);
    if (countTags(comp, metaMap, "scaling") >= 2 && countTags(enemy, metaMap, "engage") >= 2) {
      avoid.push({ setting: "Fight early 5v5", why: "Comp scale — évite les fights groupées avant 2 items." });
    }
    if (tactics.lanePriority?.value === "Bot side" && !comp.Bot) {
      avoid.push({ setting: "Drake sans prio bot", why: "Bot lane manquante pour le plan drake." });
    }
    if (enTags.has("assassin") && countTags(comp, metaMap, "peel") === 0) {
      avoid.push({ setting: "Face-check sans vision", why: "Peu de peel vs assassins — ward et joue groupé." });
    }
    if ((tactics.compType === "poke_disengage" || tactics.compType === "poke_siege") && countTags(comp, metaMap, "engage") >= 2) {
      avoid.push({ setting: "Forcer all-in", why: "Comp poke/siege — laisser l'ennemi engage (Braum/Taric)." });
    }
    if (tactics.compType === "hypercarry") {
      avoid.push({ setting: "Fight avant 2 items carry", why: "Hypercarry — farm safe jusqu'au spike." });
    }
    if (tactics.winCondition?.value === "Split push" && countTags(enemy, metaMap, "engage") >= 2) {
      avoid.push({ setting: "Split sans vision TP", why: "Engage ennemi punît le split isolé." });
    }
    return avoid;
  }

  function buildWinPlan(tactics, comp) {
    const parts = [];
    if (tactics.winCondition) parts.push(tactics.winCondition.value);
    if (tactics.lanePriority) parts.push(tactics.lanePriority.value);
    if (tactics.junglePath) parts.push(tactics.junglePath.value);
    return parts.length ? parts : ["Jouer les forces de la comp", "Contrôle vision", "Objectifs on tempo"];
  }

  function recommend(ourComp, enemyComp, metaMap, championsByName) {
    const lanes = {};
    for (const s of SLOTS) {
      lanes[s] = laneVerdict(ourComp[s], enemyComp[s], metaMap);
    }

    const tactics = recommendMacro(ourComp, enemyComp, metaMap);
    const avoid = buildAvoid(ourComp, enemyComp, metaMap, tactics);
    const winPlan = buildWinPlan(tactics, ourComp);

    return { lanes, tactics, avoid, winPlan, itemGuides: null };
  }

  global.LoLTactics = {
    SLOTS,
    recommend,
    laneVerdict,
  };
})(typeof window !== "undefined" ? window : globalThis);
