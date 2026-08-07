/**
 * LoL Macro Recommender — analyse comp vs comp → plan de match (macro).
 */
(function (global) {
  const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];

  /** Tags enrichis d'un champion : tags de tactics-meta + tags dérivés des compTypes (split, poke, dive). */
  function tagsOf(name, metaMap) {
    const m = name ? metaMap?.[name] : null;
    const tags = new Set(m?.tags || []);
    const compTypes = m?.compTypes || [];
    if (compTypes.includes("split_push")) tags.add("split");
    if (compTypes.includes("poke_siege") || compTypes.includes("poke_disengage")) tags.add("poke");
    if (tags.has("assassin")) tags.add("dive");
    return tags;
  }

  function countTags(comp, metaMap, tag) {
    return SLOTS.filter((s) => tagsOf(comp[s], metaMap).has(tag)).length;
  }

  function laneVerdict(ours, theirs, metaMap, slot, byName) {
    const scoring = global.LoLDraftScoring || global.LoLDraft?.LoLDraftScoring;
    if (!ours || !theirs) return { verdict: "unknown", margin: 0, note: "Lane incomplète." };
    if (!slot) return { verdict: "unknown", margin: 0, note: "Lane incomplète." };
    if (scoring?.scoreLaneMatchup) {
      return scoring.scoreLaneMatchup(ours, theirs, slot, byName || {}, metaMap);
    }
    return { verdict: "unknown", margin: 0, note: "Moteur matchup indisponible." };
  }

  function pickAssignees(comp, metaMap, tag, max = 2) {
    const out = [];
    for (const slot of SLOTS) {
      const name = comp[slot];
      if (!name || !tagsOf(name, metaMap).has(tag)) continue;
      out.push({ name, slot });
      if (out.length >= max) break;
    }
    return out;
  }

  /** Assignés dive sélectifs : assassins d'abord, sinon divers mobiles à gros dégâts. */
  function pickDiveAssignees(comp, metaMap, max = 2) {
    const out = [];
    for (const slot of SLOTS) {
      const name = comp[slot];
      if (!name) continue;
      const tags = tagsOf(name, metaMap);
      if (tags.has("assassin") || (tags.has("dive") && tags.has("mobility") && tags.has("high_damage"))) {
        out.push({ name, slot });
        if (out.length >= max) break;
      }
    }
    return out;
  }

  /** Profil de pathing du jungler lui-même (pas de l'équipe). */
  function junglePathProfile(jungler, metaMap) {
    if (!jungler) return null;
    const tags = tagsOf(jungler, metaMap);
    if (tags.has("assassin") || tags.has("pick") || tags.has("dive") || (tags.has("engage") && tags.has("cc"))) {
      return "gank";
    }
    if (tags.has("scaling") || tags.has("enchanter") || (tags.has("mage") && !tags.has("engage"))) {
      return "farm";
    }
    return null;
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

  function recommendMacro(comp, enemy, metaMap, byName, precomputedLanes) {
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
    for (const s of SLOTS) {
      lanes[s] = precomputedLanes?.[s] || laneVerdict(comp[s], enemy[s], metaMap, s, byName);
    }
    const wins = SLOTS.filter((s) => lanes[s]?.verdict === "win");
    const loses = SLOTS.filter((s) => lanes[s]?.verdict === "lose");
    const evens = SLOTS.filter((s) => lanes[s]?.verdict === "even");

    const botSideMargin = Math.round((lanes.Bot?.margin || 0) * 0.6 + (lanes.Support?.margin || 0) * 0.4);
    if (botSideMargin >= 5 && lanes.Bot?.verdict !== "lose") {
      tactics.lanePriority = {
        value: "Bot side",
        reason: "2v2 bot favorable (ADC + support) — prio drake et setup dive.",
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
    } else if (evens.length >= 2 && !loses.length) {
      tactics.lanePriority = {
        value: "Équilibré",
        reason: "Matchups égaux — skill check, la prio se gagne à l'exécution et par la jungle.",
        assign: [],
      };
    } else {
      tactics.lanePriority = {
        value: "Équilibré",
        reason: "Pas de lane dominante — farm safe, scale.",
        assign: [],
      };
    }

    // Jungle — pathing décidé par le profil du jungler lui-même
    const jungler = comp.Jungle;
    const jProfile = junglePathProfile(jungler, metaMap);
    if (jProfile === "gank") {
      tactics.junglePath = {
        value: "Gank lvl 3",
        reason: `${jungler || "Jungle"} a un profil gank (pick/CC) — punis les lanes avec prio.`,
        assign: [{ name: jungler, slot: "Jungle" }],
      };
    } else if (jProfile === "farm" || scaling >= 2) {
      tactics.junglePath = {
        value: "Full clear → gank",
        reason: `${jungler || "Jungle"} farmeur — clear efficace puis objectifs.`,
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
        reason: "Poke/disengage — slow push vers les tourelles, ne force jamais l'all-in (Braum/Taric).",
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
    } else if (tagsOf(jungler, metaMap).has("pick")) {
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
    } else if (assassin >= 1) {
      tactics.teamfight = {
        value: "Flank / dive backline",
        reason: "Assassins — flank et dive sur le carry adverse.",
        assign: pickDiveAssignees(comp, metaMap, 2),
      };
    } else if (enEngage >= 2) {
      tactics.teamfight = {
        value: "Front-to-back + peel",
        reason: "Engage ennemi lourd — front-to-back, peel et disengage sur le carry.",
        assign: [...pickAssignees(comp, metaMap, "peel", 1), ...pickAssignees(comp, metaMap, "disengage", 1)],
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
    if (assassin >= 1 || tagsOf(jungler, metaMap).has("pick")) {
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

  function buildWinPlan(tactics, comp) {
    const parts = [];
    if (tactics.winCondition) parts.push(tactics.winCondition.value);
    if (tactics.lanePriority) parts.push(tactics.lanePriority.value);
    if (tactics.junglePath) parts.push(tactics.junglePath.value);
    return parts.length ? parts : ["Jouer les forces de la comp", "Contrôle vision", "Objectifs au bon tempo"];
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
        teamfight: ["Start l'objectif pendant que top split ; smite sécurisé.", "Ne force pas le 5v5 si le split est la win condition."],
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
        mid: ["Reste bot-side avec support ; plates si lane safe.", "Ne poursuis pas les picks isolés sans vision."],
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
        mid: ["Group mid — tu scales le fight 5v5.", "Poke avant l'engage si mage ; attends le go de la frontline."],
        teamfight: ["Position derrière la frontline ; AOE sur le groupe engagé.", "Ne front pas — zone en sécurité avec ton DPS."],
        avoid: ["Face-check sans frontline", "Engager avant le tank"],
      },
      Bot: {
        role: "Backline DPS",
        early: ["Farm avec prio jungle ; plates si lane gagnante.", "Ne meurs pas — tu es le DPS late."],
        mid: ["Group mid pour skirmish avec l'équipe.", "Position arrière derrière frontline."],
        teamfight: ["DPS le front le plus proche puis le carry ; kite.", "Ne flash pas dedans — laisse l'engage venir."],
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
        early: ["Ne meurs pas — la comp scale autour de l'ADC.", "Hold side ; TP défensif plutôt qu'agressif."],
        mid: ["Peel zone mid ; ne split pas sauf si hyper safe.", "Group pour protéger le farm bot."],
        teamfight: ["Absorb cooldowns sur le carry ; zone devant l'ADC.", "Ne poursuis pas — protège la backline."],
        avoid: ["Split push", "Dive backline sans peel sur l'ADC"],
      },
      Jungle: {
        role: "Protect bot-side / peel",
        early: ["Full clear puis cover bot ; counter-gank si dive threat.", "Ne force pas l'invade — le temps joue pour vous."],
        mid: ["Farm efficace ; shadow bot-side avant drake.", "Peel sur divers/assassins au lieu de engage."],
        teamfight: ["Exhaust/peel sur le diver ennemi ; smite défensif.", "N'engage pas — la win condition est l'ADC."],
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
        teamfight: ["Priorité peel sur l'assassin/diver ; Locket/exhaust.", "N'engage pas — ton job est de garder l'ADC en vie."],
        avoid: ["Roaming mid long", "Engager un 5v5 sans items ADC"],
      },
    },
    poke_disengage: {
      Top: {
        role: "Frontline légère / soak poke",
        early: ["Trade poke si ranged ; sinon farm safe.", "TP pour group mid poke."],
        mid: ["Slow push mid puis poke tourelle.", "N'engage pas — laisse l'ennemi venir."],
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
        teamfight: ["Poke puis recule ; DPS si le front engage.", "Position à distance max en permanence."],
        avoid: ["All-in courte portée", "Fight sans disengage support"],
      },
      Support: {
        role: "Disengage / anti-engage",
        early: ["Outils anti-engage prêts ; vision rivière.", "N'engage pas — comp poke."],
        mid: ["Disengage si dive ; exhaust sur l'engage.", "Pink sur la ligne de siege."],
        teamfight: ["Disengage après le poke ; style Braum/Taric.", "Ne flash pas en avant — recule et re-poke."],
        avoid: ["Hard engage", "Forcer all-in"],
      },
    },
    poke_siege: {
      Top: { role: "Front soak / split léger", early: ["Hold side ; TP pour grouper au siege.", "Ne meurs pas avant le mid game."], mid: ["Slow push side pendant le siege mid.", "Rejoins le groupe pour poke la tourelle."], teamfight: ["Soak ; siege derrière le poke.", "Disengage si all-in."], avoid: ["All-in", "Split deep sans TP"] },
      Jungle: { role: "Objectif trade + vision", early: ["Vision pour siege ; farm efficace.", "Trade drake/herald selon prio."], mid: ["Setup siege mid ; sweep pits.", "Ne force pas 5v5."], teamfight: ["Zone control ; smite sécurisé.", "Poke setup avant contest."], avoid: ["Force fight", "Baron sans siege"] },
      Mid: { role: "Siege poke central", early: ["Prio wave mid.", "Poke sous tourelle."], mid: ["Slow push mid → poke la ligne d'inhib.", "Reset après avoir chunk l'adversaire."], teamfight: ["Siege les tourelles ; poke à distance max.", "Recule si engage."], avoid: ["All-in", "Aram sans objectif"] },
      Bot: { role: "Siege DPS", early: ["Poke pour les plates.", "Farm safe."], mid: ["Rotate mid pour siege bot/inhib.", "Poke les tourelles."], teamfight: ["DPS à distance max ; siege.", "Ne flash pas dedans."], avoid: ["All-in courte portée", "Fight sans poke"] },
      Support: { role: "Siege setup / disengage", early: ["Vision sur la ligne de siege.", "Poke avec l'ADC."], mid: ["Pink mid ; outils de disengage prêts.", "Setup de slow push."], teamfight: ["Disengage si all-in ; re-siege.", "Exhaust sur le diver."], avoid: ["Hard engage", "Face-check"] },
    },
    pick_global: {
      Top: {
        role: "Side pressure / TP flank",
        early: ["Trade si favorable ; sinon scale.", "TP pour pick mid/bot si global."],
        mid: ["Side pressure ; vision profonde.", "Flank angle pour pick avant objectif."],
        teamfight: ["Flank ou TP backline après le pick.", "Ne front pas seul — attends le pick."],
        avoid: ["5v5 sans pick setup", "Split sans vision"],
      },
      Jungle: {
        role: "Pick setup / vision profonde",
        early: ["Gank avec CC ; invade si tracking.", "Deep wards jungle ennemi."],
        mid: ["Bush control ; punir rotations isolées.", "Pick avant drake/baron."],
        teamfight: ["Flank après vision ; flash sur le carry isolé.", "Ne start pas le baron sans pick."],
        avoid: ["5v5 frontal", "Objectif sans vision deep"],
      },
      Mid: {
        role: "Pick / roam global",
        early: ["Roams avec prio ; punis les overextends.", "Waveclear puis disparais de la map."],
        mid: ["Vision profonde ; pick mid/jungle.", "Coordonne les ults globales."],
        teamfight: ["Flank ; burst le carry après la chaîne de CC.", "Ne te montre pas avant le fight."],
        avoid: ["Front 5v5", "Face-check"],
      },
      Bot: {
        role: "Follow-up pick / safe DPS",
        early: ["Farm safe ; follow jungle pick.", "Plates après pick bot."],
        mid: ["Group mid avec l'équipe après un pick.", "Positionne-toi pour enchaîner ton ult."],
        teamfight: ["DPS le carry après le pick ; nettoie le fight.", "Reste à distance max jusqu'au pick."],
        avoid: ["Face-check", "5v5 sans pick"],
      },
      Support: {
        role: "Vision pick / hook angle",
        early: ["Deep wards ; roam mid avec jungle.", "Hook/CC sur rotations."],
        mid: ["Sweep puis pick depuis les bushs.", "Pinks sur les chemins de rotation."],
        teamfight: ["Pick avant le fight ; enchaîne les CC.", "N'engage pas à 5 sans pick."],
        avoid: ["Engage 5v5 frontal", "Roam sans vision"],
      },
    },
    all_in: {
      Top: { role: "Frontline / dive setup", early: ["Trade agressif ; prio lvl 2-3.", "Dive setup avec jungle."], mid: ["Force skirmish 4v4.", "Front engage ou soak."], teamfight: ["Dive backline ou absorb ; all-in coordonné.", "Ne recule pas mid-fight."], avoid: ["Scale passif", "Split"] },
      Jungle: { role: "Early gank / snowball", early: ["Gank lvl 3 ; répète sur la lane gagnante.", "Invade si les lanes ont la prio."], mid: ["Force les fights avant le scaling adverse.", "Flash-engage sur le carry."], teamfight: ["All-in avec l'équipe ; commit total.", "Smite après le kill."], avoid: ["Full clear passif", "Attendre le late"] },
      Mid: { role: "Burst / follow all-in", early: ["Roams agressifs ; prio wave.", "Kill pressure lvl 3-6."], mid: ["Force le skirmish mid.", "Burst le carry après le CC."], teamfight: ["All-in backline ; commit avec flash.", "Ne poke pas — burst."], avoid: ["Farm passif", "Disengage"] },
      Bot: { role: "All-in DPS", early: ["Fight la lane lvl 2-3 avec ton support.", "Snowball les plates."], mid: ["Group pour les skirmishs.", "Suis l'engage avec ton DPS."], teamfight: ["DPS le carry ; commit quand le CC touche.", "Flash offensif seulement si le kill est assuré."], avoid: ["Farm safe passif", "Rester à distance max sans commit"] },
      Support: { role: "Engage / lockdown", early: ["All-in lvl 2 bot.", "Roams mid avec CC."], mid: ["Engage à vue si en avance.", "Vision pour les skirmishs."], teamfight: ["Hard engage ; enchaîne les CC sur le carry.", "Commit avec l'équipe."], avoid: ["Disengage", "Peel passif"] },
    },
    lane_tempo: {
      Top: { role: "Lane prio / plates", early: ["Gagne ta lane ; plates + herald.", "TP agressif si en avance."], mid: ["Prio side ; rotate si en avance.", "Snowball ton avance."], teamfight: ["Front si en avance ; dive si snowball.", "Convertis l'avance en inhibiteur."], avoid: ["Scale passif", "Jeter l'avance"] },
      Jungle: { role: "Snowball lanes / tempo", early: ["Gank les lanes gagnantes ; invade.", "Herald pour les plates."], mid: ["Force les fights tant que tu es en avance.", "Track le jungler adverse et punis son farm."], teamfight: ["Frontline si fed ; ferme la partie.", "Baron tôt si en avance."], avoid: ["Farmer en étant en avance", "Attendre le late"] },
      Mid: { role: "Roams / tempo", early: ["Prio wave ; roam bot/top.", "Plates mid + side."], mid: ["Prio mid ; force les skirmishs.", "Snowball avant le scaling adverse."], teamfight: ["Carry si fed ; zone ou burst.", "Ferme avant le late game."], avoid: ["Farm passif", "Miser sur le late"] },
      Bot: { role: "Tempo carry", early: ["Gagne la bot ; plates + drake.", "Fight avec ton support au lvl 2."], mid: ["Group mid avec l'avance.", "Siege avec l'avance."], teamfight: ["DPS en avance ; ferme la partie.", "Ne jette pas l'avance."], avoid: ["Attendre le late", "Farm passif"] },
      Support: { role: "Roaming tempo", early: ["Roams après la prio bot.", "Wards profondes pour les invades."], mid: ["Roams mid ; vision pour les skirmishs.", "Engage quand vous êtes en avance."], teamfight: ["Engage si en avance ; peel si égalité.", "Ferme la partie."], avoid: ["Babysitter en attendant le scale", "Peel passif uniquement"] },
    },
  };

  /** Guide de secours dérivé des tags réels du champion (remplace l'ancien _default générique). */
  function tagDerivedGuide(slot, tags) {
    const early = [];
    const mid = [];
    const teamfight = [];
    const avoid = [];
    let role = SLOT_LABELS[slot] || slot;

    if (tags.has("split")) {
      role = "Split pusher";
      early.push("Push ta vague en priorité — plates et pression side.");
      mid.push("Side lane opposée à l'objectif ; force une réponse adverse.");
      teamfight.push("Split pendant le 4v4 ; rejoins seulement pour finir le fight.");
      avoid.push("Grouper mid sans raison");
    }
    if (tags.has("poke")) {
      role = tags.has("support") ? "Poke / disengage" : "Poke / siege";
      early.push("Poke à distance ; ne force pas l'all-in.");
      mid.push("Slow push puis siege les tourelles derrière ton poke.");
      teamfight.push("Poke à distance max ; recule si engage.");
      avoid.push("All-in courte portée");
    }
    if (tags.has("assassin")) {
      role = "Assassin / flank";
      early.push("Cherche le kill pressure lvl 3-6 ; roam si prio.");
      mid.push("Vision profonde ; punis les rotations isolées.");
      teamfight.push("Flank ; burst le carry adverse après le CC.");
      avoid.push("Engager en premier de face");
    }
    if (tags.has("engage") && !tags.has("poke")) {
      early.push("Trade pour la prio ; prépare les setups de gank.");
      mid.push("Cherche l'angle d'engage avant les objectifs.");
      teamfight.push("Engage quand l'équipe est prête ; enchaîne les CC.");
      avoid.push("Engager sans follow-up");
    }
    if (tags.has("frontline") && !tags.has("assassin")) {
      if (role === (SLOT_LABELS[slot] || slot)) role = "Frontline";
      teamfight.push("Absorbe les cooldowns devant tes carries ; zone l'objectif.");
      avoid.push("Chase isolé sans vision");
    }
    if (tags.has("scaling")) {
      early.push("Farm safe — le temps joue pour toi.");
      mid.push("Prends les ressources sans risque avant tes spikes d'items.");
      teamfight.push("Position arrière ; DPS le front le plus proche puis le carry.");
      avoid.push("Fight avant ton spike d'items");
    }
    if (tags.has("peel") && (slot === "Support" || tags.has("enchanter"))) {
      if (role === (SLOT_LABELS[slot] || slot)) role = "Peel / protection";
      mid.push("Garde tes outils de peel pour la menace principale.");
      teamfight.push("Peel ton carry ; exhaust/CC sur le diver.");
    }

    if (!early.length) early.push("Farm/trade selon le matchup.", "Vision de ta zone.");
    if (!mid.length) mid.push("Group ou side selon le plan d'équipe.", "Joue les objectifs au bon tempo.");
    if (!teamfight.length) teamfight.push("Suis le call d'équipe ; position selon ton champion.");
    if (!avoid.length) avoid.push("Face-check sans vision");

    return { role, early, mid, teamfight, avoid };
  }

  function pickGuide(compType, slot, tags) {
    return COMP_SLOT_GUIDE[compType]?.[slot] || tagDerivedGuide(slot, tags || new Set());
  }

  function refineRoleLabel(slot, tags, compType, baseRole) {
    if (compType === "hypercarry" && slot === "Bot") return "Hypercarry — win condition";
    if (compType === "split_push" && tags.has("split")) return "Split pusher principal";
    if (tags.has("split") && (slot === "Top" || slot === "Mid")) return "Split pusher";
    if (tags.has("frontline") && slot === "Top") return "Frontline top";
    if (tags.has("engage") && slot === "Support") return "Engage support";
    if (tags.has("peel") && slot === "Support") return "Peel / protection";
    if (tags.has("assassin") && slot === "Mid") return "Assassin / flank mid";
    if (tags.has("assassin") && slot === "Jungle") return "Pick jungle";
    if (tags.has("scaling") && slot === "Bot") return "Carry scale";
    if (tags.has("poke") && (slot === "Mid" || slot === "Bot")) return "Poke / siege";
    return baseRole;
  }

  function buildSlotAdvice(slot, ourComp, enemyComp, metaMap, tactics, lane) {
    const name = ourComp[slot];
    const meta = metaMap[name];
    const enemyName = enemyComp[slot];
    const compType = tactics.compType || "_default";
    const tagSet = tagsOf(name, metaMap);
    const guide = pickGuide(compType, slot, tagSet);
    const early = [...(guide.early || [])];
    const mid = [...(guide.mid || [])];
    const teamfight = [...(guide.teamfight || [])];
    const avoid = [...(guide.avoid || [])];

    if (lane?.verdict === "lose" && enemyName) {
      early.unshift(`Matchup défavorable vs ${enemyName} — joue safe, scale avec le plan ${tactics.compTypeLabel || "d'équipe"}.`);
    } else if (lane?.verdict === "win" && enemyName) {
      early.unshift(`Lane favorable vs ${enemyName} — convertis en plates/vision sans overextend.`);
    } else if (lane?.verdict === "even" && enemyName) {
      early.unshift(`Matchup égal vs ${enemyName} — skill check : joue propre, cherche l'écart via jungle et vision.`);
    } else if (lane?.note) {
      early.push(lane.note);
    }

    if (tagSet.has("split") && compType !== "split_push" && slot === "Top") {
      mid.push("Tu peux side lane si la comp le permet — communique avec l'équipe.");
    }
    if (tagSet.has("scaling") && compType === "hypercarry" && slot !== "Bot" && slot !== "Support") {
      mid.push("Protège le bot-side — le temps joue pour votre carry.");
    }
    if (slot === "Jungle" && junglePathProfile(name, metaMap) === "gank") {
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
      roleLabel: refineRoleLabel(slot, tagSet, compType, guide.role),
      early: [...new Set(early)].slice(0, 5),
      mid: [...new Set(mid)].slice(0, 5),
      teamfight: [...new Set(teamfight)].slice(0, 5),
      avoid: [...new Set(avoid)].slice(0, 4),
      matchupNote: lane?.note || "",
      matchupVerdict: lane?.verdict || "unknown",
    };
  }

  function buildRoleAdvice(ourComp, enemyComp, metaMap, tactics, byName, precomputedLanes) {
    const slots = {};
    for (const slot of SLOTS) {
      const lane =
        precomputedLanes?.[slot] || laneVerdict(ourComp[slot], enemyComp[slot], metaMap, slot, byName);
      slots[slot] = buildSlotAdvice(slot, ourComp, enemyComp, metaMap, tactics, lane);
    }
    return {
      compType: tactics.compType,
      compTypeLabel: tactics.compTypeLabel || COMP_LABELS[tactics.compType] || tactics.compType,
      slots,
    };
  }

  /** Verdicts de lane calculés une seule fois — réutilisables par l'UI via recommend().lanes. */
  function computeLanes(ourComp, enemyComp, metaMap, byName) {
    const lanes = {};
    for (const s of SLOTS) {
      lanes[s] = laneVerdict(ourComp[s], enemyComp[s], metaMap, s, byName);
    }
    return lanes;
  }

  function recommend(ourComp, enemyComp, metaMap, championsByName) {
    const byName = championsByName || {};
    const lanes = computeLanes(ourComp, enemyComp, metaMap, byName);

    const tactics = recommendMacro(ourComp, enemyComp, metaMap, byName, lanes);
    const winPlan = buildWinPlan(tactics, ourComp);
    const roleAdvice = buildRoleAdvice(ourComp, enemyComp, metaMap, tactics, byName, lanes);

    return { lanes, tactics, winPlan, roleAdvice };
  }

  global.LoLTactics = {
    SLOTS,
    SLOT_LABELS,
    recommend,
    laneVerdict,
    computeLanes,
    buildRoleAdvice,
  };
})(typeof window !== "undefined" ? window : globalThis);
