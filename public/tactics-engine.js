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

  function laneVerdict(ours, theirs, metaMap, slot, byName) {
    const scoring = global.LoLDraftScoring || global.LoLDraft?.LoLDraftScoring;
    if (!ours || !theirs) return { verdict: "unknown", margin: 0, note: "Lane incomplète." };
    if (!slot) return { verdict: "unknown", margin: 0, note: "Lane incomplète." };
    if (scoring?.scoreLaneMatchup) {
      return scoring.scoreLaneMatchup(ours, theirs, slot, byName || {}, metaMap);
    }
    return { verdict: "lose", margin: -1, note: `${theirs} avantage — moteur matchup indisponible.` };
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

  function recommendMacro(comp, enemy, metaMap, byName) {
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
    for (const s of SLOTS) lanes[s] = laneVerdict(comp[s], enemy[s], metaMap, s, byName);
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

  function buildWinPlan(tactics, comp) {
    const parts = [];
    if (tactics.winCondition) parts.push(tactics.winCondition.value);
    if (tactics.lanePriority) parts.push(tactics.lanePriority.value);
    if (tactics.junglePath) parts.push(tactics.junglePath.value);
    return parts.length ? parts : ["Jouer les forces de la comp", "Contrôle vision", "Objectifs on tempo"];
  }

  const SLOT_LABELS = {
    Top: "Top",
    Jungle: "Jungle",
    Mid: "Mid",
    Bot: "ADC",
    Support: "Support",
  };

  /** Conseils de base par type de comp dominante × poste */
  const COMP_SLOT_GUIDE = {
    split_push: {
      Top: {
        role: "Split pusher principal",
        early: ["Push la vague top en priorité — plates et prio herald.", "Communique TP / ult global avant de push deep."],
        mid: ["Side opposée à l'objectif d'équipe (drake ↔ top).", "Ne group jamais mid sans raison — la pression side est le wincon."],
        teamfight: ["Split pendant le 4v4 mid ; TP uniquement pour inhib ou fin de fight.", "Force une 2e réponse adverse avant de commit."],
        avoid: ["Group mid sans TP", "Split sans vision profonde"],
      },
      Jungle: {
        role: "Cover split + tempo opposé",
        early: ["Path vers la side du split si prio ; invade côté faible.", "Herald pour le top split si lane gagnante."],
        mid: ["Crée de la pression côté opposé au carry adverse.", "Track le jungler — punir le rotate sur ton split."],
        teamfight: ["Start l'objectif pendant que top split ; smite sécurisé.", "Ne 5v5 pas si le split est la win condition."],
        avoid: ["Forcer un 5v5 mid sans side pressure", "Gank bot au détriment du plan split"],
      },
      Mid: {
        role: "Mid waveclear + roam side",
        early: ["Clear rapide pour libérer le split top.", "Roams vers la side avec prio, pas vers bot sans raison."],
        mid: ["Tiens mid 1-3-1 : clear → press side → reset.", "Ne reste pas mid si top split — tu es le relais de pression."],
        teamfight: ["4 mid pendant split ; zone control sans overcommit.", "Clear la wave mid avant drake/baron si split actif."],
        avoid: ["Aram mid sans objectif", "Abandonner la wave mid"],
      },
      Bot: {
        role: "Safe farm bot-side",
        early: ["Farm safe — la map joue autour du split top.", "Prio bot seulement si jungle cover."],
        mid: ["Reste bot-side avec support ; plates si lane safe.", "Ne chase pas les picks isolés sans vision."],
        teamfight: ["Backline safe pendant 4v4 ; DPS sur front ennemi engagé.", "Position max range — tu n'es pas le wincon macro."],
        avoid: ["Face-check river sans vision", "Overextend sans TP cover"],
      },
      Support: {
        role: "Vision side + peel bot",
        early: ["Wards profondes côté split (top/jungle ennemi).", "Peel bot si dive — le plan split ne passe pas par bot."],
        mid: ["Pink bot-side + sweep avant objectif.", "Rotate mid seulement pour reset wave puis retour bot."],
        teamfight: ["Zone control bot-side ; exhaust sur divers.", "Communique timer TP adverse au split."],
        avoid: ["Roaming mid sans cover bot", "Engager un 5v5 bot"],
      },
    },
    teamfight_engage: {
      Top: {
        role: "Frontline / flank",
        early: ["Trade pour prio ; TP pour drake/herald si bot prio.", "Build tank/bruiser — tu absorbes les cooldowns."],
        mid: ["Group mid avec jungle pour skirmish 4v4.", "Flank side avant le fight si bruiser mobile."],
        teamfight: ["Engage ou absorb en premier ; ne dive pas seul.", "Zone autour de l'objectif — force le 5v5."],
        avoid: ["Split push isolé", "Chase sans ton engage support"],
      },
      Jungle: {
        role: "Engage / follow-up",
        early: ["Gank lanes avec CC pour snowball.", "Path vers la prio lane (souvent bot ou mid)."],
        mid: ["Cherche pick avant objectif ; flash engage si setup.", "Contrôle vision rivière pour setup fight."],
        teamfight: ["Follow l'engage du support/top ; flash sur carry.", "Smite contest — ne start pas baron sans frontline."],
        avoid: ["Invade solo sans prio lanes", "Baron sans vision sweep"],
      },
      Mid: {
        role: "AOE / zone derrière front",
        early: ["Prio wave pour roam avec jungle.", "Ne trade pas 1v1 si tu es le scaling AOE."],
        mid: ["Group mid — tu scales le fight 5v5.", "Poke avant engage si mage ; attend le go frontline."],
        teamfight: ["Position derrière frontline ; AOE sur groupe engagé.", "Ne front pas — DPS zone en sécurité."],
        avoid: ["Face-check sans frontline", "Engager avant le tank"],
      },
      Bot: {
        role: "Backline DPS",
        early: ["Farm avec prio jungle ; plates si lane gagnante.", "Ne die pas — tu es le DPS late."],
        mid: ["Group mid pour skirmish avec l'équipe.", "Position arrière derrière frontline."],
        teamfight: ["DMS le front le plus proche puis carry ; kiting.", "Ne flash in — laisse l'engage venir."],
        avoid: ["Frontline sans peel", "Fight avant item spike"],
      },
      Support: {
        role: "Hard engage / setup",
        early: ["Roams mid/bot avec jungle si prio.", "Vision rivière pour drake setup."],
        mid: ["Cherche l'angle engage avant objectif.", "Sweep puis pink sur pit."],
        teamfight: ["Engage quand frontline + jungle prêts ; CC chain.", "Peel carry seulement si engage impossible."],
        avoid: ["Engager sans follow-up", "Face-check bush"],
      },
    },
    hypercarry: {
      Top: {
        role: "Frontline / peel zone",
        early: ["Ne die pas — la comp scale autour de l'ADC.", "Hold side ; TP défensif plutôt qu'agressif."],
        mid: ["Peel zone mid ; ne split pas sauf si hyper safe.", "Group pour protéger le farm bot."],
        teamfight: ["Absorb cooldowns sur le carry ; zone devant l'ADC.", "Ne chase — protège la backline."],
        avoid: ["Split push", "Dive backline sans peel sur l'ADC"],
      },
      Jungle: {
        role: "Protect bot-side / peel",
        early: ["Full clear puis cover bot ; counter-gank si dive threat.", "Ne force pas l'invade — le temps joue pour vous."],
        mid: ["Farm efficace ; shadow bot-side avant drake.", "Peel sur divers/assassins au lieu de engage."],
        teamfight: ["Exhaust/ peel sur le diver ennemi ; smite défensif.", "Ne engage pas — la win condition est l'ADC."],
        avoid: ["Force fight early 5v5", "Gank top au détriment du bot"],
      },
      Mid: {
        role: "Waveclear / zone safe",
        early: ["Clear safe ; pas de roam risqué sans vision.", "Scale — tu protèges les lanes avec waveclear."],
        mid: ["Mid waveclear puis group bot-side.", "Zone control devant l'ADC — pas de flanks risqués."],
        teamfight: ["Poke puis zone ; ne flash in.", "Clear les waves avant baron si possible."],
        avoid: ["Pick 1v1 isolé", "Roams deep sans info"],
      },
      Bot: {
        role: "Hypercarry — win condition",
        early: ["Zéro mort ; farm max sous cover jungle/support.", "Plates seulement si jungle présent."],
        mid: ["Farm camps + waves ; 2 items avant fight commit.", "Position extrême arrière — tu es la win condition."],
        teamfight: ["Max range ; DPS le front le plus proche puis carry.", "Ne face-check — laisse frontline/peel travailler."],
        avoid: ["Fight avant 2 items", "Face-check sans vision"],
      },
      Support: {
        role: "Peel total sur le carry",
        early: ["Babysit bot ; exhaust sur gankers.", "Pink bot-side + deny dive setup."],
        mid: ["Ne roam pas sans cover ADC farm.", "Ardent/enchanter peel — exhaust sur threat #1."],
        teamfight: ["Peel priority sur assassin/diver ; Locket/exhaust.", "Ne engage pas — ta job est de garder l'ADC en vie."],
        avoid: ["Roaming mid long", "Engager un 5v5 sans items ADC"],
      },
    },
    poke_disengage: {
      Top: {
        role: "Frontline légère / soak poke",
        early: ["Trade poke si ranged ; sinon farm safe.", "TP pour group mid poke."],
        mid: ["Slow push mid puis poke tourelle.", "Ne engage pas — laisse l'ennemi venir."],
        teamfight: ["Soak poke ; disengage si all-in.", "Front léger — ne dive pas."],
        avoid: ["All-in", "Chase après poke"],
      },
      Jungle: {
        role: "Vision + disengage follow",
        early: ["Farm + vision ; gank seulement si setup poke.", "Contrôle rivière sans force fight."],
        mid: ["Sweep puis setup siege mid.", "Smite contest sans commit body."],
        teamfight: ["Zone devant pokeurs ; peel si all-in.", "Ne flash engage — disengage après poke."],
        avoid: ["Force 5v5 all-in", "Baron sans poke setup"],
      },
      Mid: {
        role: "Poke / waveclear",
        early: ["Poke under tower ; prio wave.", "Roams seulement avec vision."],
        mid: ["Siege mid — poke tourelle avant fight.", "Disengage avec ult si all-in."],
        teamfight: ["Poke max range ; recule si engage.", "Ne commit pas sans poke advantage."],
        avoid: ["All-in avant poke", "Face-check"],
      },
      Bot: {
        role: "Poke DPS / siege",
        early: ["Poke lane ; plates à distance.", "Farm safe si lane lose."],
        mid: ["Siege bot-side puis rotate mid.", "Poke tourelles — ne force pas fight."],
        teamfight: ["Poke puis recule ; DMS si front engage.", "Position max range toujours."],
        avoid: ["All-in short range", "Fight sans disengage support"],
      },
      Support: {
        role: "Disengage / anti-engage",
        early: ["Anti-engage tools up ; vision river.", "Ne engage pas — poke comp."],
        mid: ["Disengage si dive ; exhaust sur engage.", "Pink siege line."],
        teamfight: ["Disengage après poke ; Braum/Taric style.", "Ne flash forward — recule et re-poke."],
        avoid: ["Hard engage", "Forcer all-in"],
      },
    },
    poke_siege: {
      Top: { role: "Front soak / split léger", early: ["Hold side ; TP group pour siege.", "Ne die pas avant mid game."], mid: ["Slow push side pendant siege mid.", "Join group pour poke tourelle."], teamfight: ["Soak ; siege derrière poke.", "Disengage si all-in."], avoid: ["All-in", "Split deep sans TP"] },
      Jungle: { role: "Objectif trade + vision", early: ["Vision pour siege ; farm efficace.", "Trade drake/herald selon prio."], mid: ["Setup siege mid ; sweep pits.", "Ne force pas 5v5."], teamfight: ["Zone control ; smite sécurisé.", "Poke setup avant contest."], avoid: ["Force fight", "Baron sans siege"] },
      Mid: { role: "Siege poke central", early: ["Prio wave mid.", "Poke under tower."], mid: ["Slow push mid → poke inhib line.", "Reset après chunk adverse."], teamfight: ["Siege tourelles ; poke max range.", "Recule si engage."], avoid: ["All-in", "Aram sans objectif"] },
      Bot: { role: "Siege DPS", early: ["Poke plates.", "Farm safe."], mid: ["Rotate mid pour siege bot/inhib.", "Poke tourelles."], teamfight: ["DMS from max range ; siege.", "Ne flash in."], avoid: ["Short range all-in", "Fight sans poke"] },
      Support: { role: "Siege setup / disengage", early: ["Vision siege line.", "Poke avec ADC."], mid: ["Pink mid ; disengage tools ready.", "Slow push setup."], teamfight: ["Disengage if all-in ; re-siege.", "Exhaust diver."], avoid: ["Hard engage", "Face-check"] },
    },
    pick_global: {
      Top: {
        role: "Side pressure / TP flank",
        early: ["Trade si favorable ; sinon scale.", "TP pour pick mid/bot si global."],
        mid: ["Side pressure ; vision profonde.", "Flank angle pour pick avant objectif."],
        teamfight: ["Flank ou TP backline après pick.", "Ne front pas seul — attend le pick."],
        avoid: ["5v5 sans pick setup", "Split sans vision"],
      },
      Jungle: {
        role: "Pick setup / vision profonde",
        early: ["Gank avec CC ; invade si tracking.", "Deep wards jungle ennemi."],
        mid: ["Bush control ; punir rotations isolées.", "Pick avant drake/baron."],
        teamfight: ["Flank après vision ; flash sur carry isolé.", "Ne start baron sans pick."],
        avoid: ["5v5 frontal", "Objectif sans vision deep"],
      },
      Mid: {
        role: "Pick / roam global",
        early: ["Roams avec prio ; punir overextend.", "Waveclear puis disappear."],
        mid: ["Vision profonde ; pick mid/jungle.", "Global ult coordination."],
        teamfight: ["Flank ; burst carry après CC chain.", "Ne show before fight."],
        avoid: ["Front 5v5", "Face-check"],
      },
      Bot: {
        role: "Follow-up pick / safe DPS",
        early: ["Farm safe ; follow jungle pick.", "Plates après pick bot."],
        mid: ["Mid avec team après pick.", "Position for follow-up ult."],
        teamfight: ["DMS carry après pick ; clean up.", "Max range until pick lands."],
        avoid: ["Face-check", "5v5 sans pick"],
      },
      Support: {
        role: "Vision pick / hook angle",
        early: ["Deep wards ; roam mid avec jungle.", "Hook/CC sur rotations."],
        mid: ["Sweep puis bush pick.", "Pink on rotation paths."],
        teamfight: ["Pick before fight ; CC chain.", "Ne engage 5 sans pick."],
        avoid: ["Hard 5v5 engage", "No vision roam"],
      },
    },
    all_in: {
      Top: { role: "Frontline / dive setup", early: ["Trade agressif ; prio lvl 2-3.", "Dive setup avec jungle."], mid: ["Force skirmish 4v4.", "Front engage ou soak."], teamfight: ["Dive backline ou absorb ; all-in coordonné.", "Ne recule pas mid-fight."], avoid: ["Scale passif", "Split"] },
      Jungle: { role: "Early gank / snowball", early: ["Gank lvl 3 ; répète sur lane gagnante.", "Invade si lanes prio."], mid: ["Force fight avant scale adverse.", "Flash engage on carry."], teamfight: ["All-in avec team ; commit full.", "Smite après kill."], avoid: ["Full clear farm", "Scale late"] },
      Mid: { role: "Burst / follow all-in", early: ["Roams agressifs ; prio wave.", "Kill pressure lvl 3-6."], mid: ["Force mid skirmish.", "Burst carry after CC."], teamfight: ["All-in backline ; commit avec flash.", "Ne poke — burst."], avoid: ["Farm scale", "Disengage"] },
      Bot: { role: "All-in DPS", early: ["Fight lane lvl 2-3 avec support.", "Snowball plates."], mid: ["Group pour skirmish.", "Follow engage with DPS."], teamfight: ["DMS carry ; commit when CC lands.", "Flash forward if kill secured."], avoid: ["Farm safe late", "Max range kiting only"] },
      Support: { role: "Engage / lockdown", early: ["Lvl 2 all-in bot.", "Roams mid avec CC."], mid: ["Engage on sight if ahead.", "Vision for skirmish."], teamfight: ["Hard engage ; CC chain carry.", "Commit with team."], avoid: ["Disengage", "Scale peel"] },
    },
    lane_tempo: {
      Top: { role: "Lane prio / plates", early: ["Win lane ; plates + herald.", "TP agressif si ahead."], mid: ["Side prio ; rotate if ahead.", "Snowball lead."], teamfight: ["Front if ahead ; dive if snowball.", "Convert lead to inhib."], avoid: ["Scale passif", "Throw lead"] },
      Jungle: { role: "Snowball lanes / tempo", early: ["Gank winning lanes ; invade.", "Herald for plates."], mid: ["Force fights while ahead.", "Track and punish farm."], teamfight: ["Frontline if fed ; close game.", "Baron early if ahead."], avoid: ["Farm when ahead", "Scale"] },
      Mid: { role: "Roams / tempo", early: ["Prio wave ; roam bot/top.", "Plates mid + side."], mid: ["Mid prio ; force skirmish.", "Snowball before enemy scale."], teamfight: ["Carry if fed ; zone or burst.", "Close before late."], avoid: ["Farm scale", "Late game"] },
      Bot: { role: "Tempo carry", early: ["Win bot ; plates + drake.", "Fight with support lvl 2."], mid: ["Group mid with lead.", "Siege with lead."], teamfight: ["DPS from ahead ; close game.", "Don't throw lead."], avoid: ["Scale late", "Passive farm"] },
      Support: { role: "Roaming tempo", early: ["Roams after bot prio.", "Deep wards for invades."], mid: ["Mid roams ; vision for skirmish.", "Engage when ahead."], teamfight: ["Engage if ahead ; peel if even.", "Close game."], avoid: ["Babysit scale", "Late peel only"] },
    },
    _default: {
      Top: { role: "Side laner", early: ["Farm/trade selon matchup.", "TP pour objectifs."], mid: ["Side pressure ou group selon comp.", "Vision top side."], teamfight: ["Front ou flank selon build.", "Suivre le call objectif."], avoid: ["Overextend sans vision"] },
      Jungle: { role: "Jungle flex", early: ["Path selon lanes prio.", "Vision rivière."], mid: ["Objectifs on tempo.", "Track enemy jg."], teamfight: ["Follow team call.", "Smite contest."], avoid: ["Invade solo"] },
      Mid: { role: "Mid flex", early: ["Prio wave.", "Roams si prio."], mid: ["Group ou side selon comp.", "Waveclear."], teamfight: ["Position selon champion.", "Follow engage."], avoid: ["Face-check"] },
      Bot: { role: "ADC", early: ["Farm safe.", "Plates si cover."], mid: ["Group ou farm selon comp.", "Position arrière."], teamfight: ["Backline DPS.", "Kiting."], avoid: ["Face-check"] },
      Support: { role: "Support", early: ["Vision bot.", "Roams si prio."], mid: ["Vision objectifs.", "Peel ou engage selon comp."], teamfight: ["Rôle utility.", "Exhaust/CC."], avoid: ["Face-check bush"] },
    },
  };

  function pickGuide(compType, slot) {
    return COMP_SLOT_GUIDE[compType]?.[slot] || COMP_SLOT_GUIDE._default[slot];
  }

  function refineRoleLabel(slot, meta, compType, baseRole) {
    const tags = meta?.tags || [];
    if (compType === "hypercarry" && slot === "Bot") return "Hypercarry — win condition";
    if (compType === "split_push" && tags.includes("split")) return "Split pusher principal";
    if (tags.includes("split") && (slot === "Top" || slot === "Mid")) return "Split pusher";
    if (tags.includes("frontline") && slot === "Top") return "Frontline top";
    if (tags.includes("engage") && slot === "Support") return "Engage support";
    if (tags.includes("peel") && slot === "Support") return "Peel / protection";
    if (tags.includes("assassin") && slot === "Mid") return "Assassin / flank mid";
    if (tags.includes("assassin") && slot === "Jungle") return "Pick jungle";
    if (tags.includes("scaling") && slot === "Bot") return "Carry scale";
    if (tags.includes("poke") && (slot === "Mid" || slot === "Bot")) return "Poke / siege";
    return baseRole;
  }

  function buildSlotAdvice(slot, ourComp, enemyComp, metaMap, tactics, lane) {
    const name = ourComp[slot];
    const meta = metaMap[name];
    const enemyName = enemyComp[slot];
    const compType = tactics.compType || "_default";
    const guide = pickGuide(compType, slot);
    const early = [...(guide.early || [])];
    const mid = [...(guide.mid || [])];
    const teamfight = [...(guide.teamfight || [])];
    const avoid = [...(guide.avoid || [])];
    const tags = meta?.tags || [];

    if (lane?.verdict === "lose" && enemyName) {
      early.unshift(`Matchup défavorable vs ${enemyName} — joue safe, scale avec le plan ${tactics.compTypeLabel || "d'équipe"}.`);
    } else if (lane?.verdict === "win" && enemyName) {
      early.unshift(`Lane favorable vs ${enemyName} — convertis en plates/vision sans overextend.`);
    } else if (lane?.note) {
      early.push(lane.note);
    }

    if (tags.includes("split") && compType !== "split_push" && slot === "Top") {
      mid.push("Tu peux side lane si la comp le permet — communique avec l'équipe.");
    }
    if (tags.includes("scaling") && compType === "hypercarry" && slot !== "Bot" && slot !== "Support") {
      mid.push("Protège le bot-side — le temps joue pour votre carry.");
    }
    if (hasTag(meta, "gank_jungle") && slot === "Jungle") {
      early.push("Profil gank — répète sur les lanes avec prio/CC.");
    }
    if (tactics.lanePriority?.value === "Bot side" && (slot === "Bot" || slot === "Support")) {
      mid.push("Prio bot-side — drake et setup dive sont ton focus.");
    }
    if (tactics.lanePriority?.value === "Top side" && slot === "Top") {
      mid.push("Prio top — herald et pression topside.");
    }
    if (tactics.winCondition?.value && slot === "Jungle") {
      mid.push(`Win condition équipe : ${tactics.winCondition.value.toLowerCase()}.`);
    }

    return {
      slot,
      slotLabel: SLOT_LABELS[slot] || slot,
      champion: name,
      roleLabel: refineRoleLabel(slot, meta, compType, guide.role),
      early: [...new Set(early)].slice(0, 5),
      mid: [...new Set(mid)].slice(0, 5),
      teamfight: [...new Set(teamfight)].slice(0, 5),
      avoid: [...new Set(avoid)].slice(0, 4),
      matchupNote: lane?.note || "",
      matchupVerdict: lane?.verdict || "unknown",
    };
  }

  function buildRoleAdvice(ourComp, enemyComp, metaMap, tactics, byName) {
    const slots = {};
    for (const slot of SLOTS) {
      const lane = laneVerdict(ourComp[slot], enemyComp[slot], metaMap, slot, byName);
      slots[slot] = buildSlotAdvice(slot, ourComp, enemyComp, metaMap, tactics, lane);
    }
    return {
      compType: tactics.compType,
      compTypeLabel: tactics.compTypeLabel || COMP_LABELS[tactics.compType] || tactics.compType,
      slots,
    };
  }

  function recommend(ourComp, enemyComp, metaMap, championsByName) {
    const byName = championsByName || {};
    const lanes = {};
    for (const s of SLOTS) {
      lanes[s] = laneVerdict(ourComp[s], enemyComp[s], metaMap, s, byName);
    }

    const tactics = recommendMacro(ourComp, enemyComp, metaMap, byName);
    const avoid = buildAvoid(ourComp, enemyComp, metaMap, tactics);
    const winPlan = buildWinPlan(tactics, ourComp);
    const roleAdvice = buildRoleAdvice(ourComp, enemyComp, metaMap, tactics, byName);

    return { lanes, tactics, avoid, winPlan, roleAdvice, itemGuides: null };
  }

  global.LoLTactics = {
    SLOTS,
    SLOT_LABELS,
    recommend,
    laneVerdict,
    buildRoleAdvice,
  };
})(typeof window !== "undefined" ? window : globalThis);
