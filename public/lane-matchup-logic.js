/**
 * Lane matchup logic — kit vectors + lane rules for every champ×champ×slot pair.
 * Precomputed margins in public/data/lane-matchups.json (scripts/build_lane_matchups.mjs).
 */
(function (global) {
  const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const SLOT_LABELS = { Bot: "ADC", Jungle: "Jungle", Mid: "Mid", Support: "Support", Top: "Top" };

  let precomputed = null;
  let nameToIdx = null;

  function norm(name) {
    return String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  /** ADC / mage carries with low mobility — siege targets. */
  const IMMOBILE_CARRIES = new Set(
    [
      "Ashe", "Jinx", "Kog'Maw", "Aphelios", "Miss Fortune", "Jhin", "Xerath", "Vel'Koz", "Brand", "Swain",
      "Lux", "Syndra", "Veigar", "Annie",
    ].map(norm)
  );

  const SPELL_SHIELD = new Set(["Morgana", "Sivir", "Nocturne", "Olaf", "Malzahar", "Briar"].map(norm));
  const HOOK_CC = new Set(["Blitzcrank", "Nautilus", "Thresh", "Pyke", "Morgana"].map(norm));

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function spellTraits(text) {
    const t = (text || "").toLowerCase();
    return {
      cc: /étourdi|étourdit|charme|immobilis|enracin|supprime|effraie|silenc|stun|root/.test(t),
      knockup: /projet|en l'air|airborne|knock/.test(t),
      root: /enracin|immobilis|root/.test(t),
      slow: /ralentit|ralentiss|slow/.test(t),
      mobility: /dash|bond|saut|charge|glisse|ruée|bondit|téléport|rush|se rue|blink/.test(t),
      invis: /invisible|stealth|camouflage|fumée/.test(t),
      shield: /bouclier|shield/.test(t),
      heal: /soin|soigne|heal|régén|restaure/.test(t),
      aoe: /zone|cercle|tous les ennemis|cone|cône|rayon|radius/.test(t),
      poke: /distance|ligne|projectile|lance/.test(t),
      antiHeal: /anti-soin|anti-soins|blessures graves|grievous/.test(t),
      execute: /exécute|exécut|seuil|execute/.test(t),
      spellShield: /anti-magie|rideau de feu|sceau|spell.?shield/.test(t),
      percentHp: /% des pv|% pv|pourcentage.*vie|pv max|points de vie max|percent/.test(t),
      untargetable: /intouchable|invuln|invulnér|inattaquable/.test(t),
      dashBlock: /anti-dash|interrompt.*dash|empêche.*dash|mur|bloque.*dash/.test(t),
      pull: /tire|attire|ramène|traction|hook|grappin/.test(t),
      disengage: /repousse|recule|disengage|contre-engage|repouss/.test(t),
    };
  }

  /** Kit profile from champions.json matchupProfile + draftProfile + abilities. */
  function buildKitProfile(champ, metaMap) {
    const name = champ?.name || "";
    const m = metaMap?.[name] || {};
    const mp = champ?.matchupProfile || {};
    const dp = champ?.draftProfile || m.draftProfile || {};
    const tags = new Set([...(mp.tags || []), ...(m.tags || []), ...(champ?.tags || [])]);
    const roles = new Set(mp.roles || []);
    const type = (champ?.type || m.type || "").toLowerCase();
    const abilityText = (champ?.abilities || []).map((a) => a.description || "").join(" ");
    const traits = spellTraits(abilityText);
    if (SPELL_SHIELD.has(norm(name))) traits.spellShield = true;
    if (HOOK_CC.has(norm(name)) && name !== "Morgana") traits.pull = true;

    if (/marksman|tireur|à distance/i.test(type)) {
      tags.add("marksman");
      roles.add("Marksman");
    }
    if (/assassin/i.test(type)) tags.add("assassin");
    if (/mage/i.test(type)) tags.add("mage");
    if (/combattant|fighter/i.test(type)) tags.add("fighter");
    if (/tank/i.test(type)) tags.add("frontline");
    if (/support/i.test(type)) tags.add("support");

    const attackRange =
      mp.attackRange ??
      (dp.range === "long" ? 650 : dp.range === "medium" ? 550 : dp.range === "melee" ? 175 : 500);
    const attackKind = mp.attackKind || (attackRange >= 400 ? "ranged" : "melee");
    const tankiness = mp.tankiness ?? (dp.tanky ? 8 : dp.squishy ? 3 : 5);
    const damage = mp.damage ?? Math.round((dp.dpsWeight ?? 0.5) * 10);
    const utility = mp.utility ?? 5;

    return {
      name,
      roles: [...roles],
      tags,
      traits,
      attackKind,
      attackRange,
      damage,
      tankiness,
      utility,
      difficulty: mp.difficulty ?? 5,
      squishy: dp.squishy ?? tankiness <= 4,
      tanky: dp.tanky ?? (tankiness >= 7 || tags.has("frontline")),
      superTank: tankiness >= 8 && (tags.has("frontline") || /tank/i.test(type)),
      waveClear: dp.waveClear ?? (traits.aoe || damage >= 6),
      enemyTips: mp.enemyTips || [],
      allyTips: mp.allyTips || [],
      family: champ?.championFamily?.key || mp.family || m.family || "",
      assassin: tags.has("assassin") || /assassin/i.test(type),
      mage: tags.has("mage") || /mage/i.test(type),
      marksman: tags.has("marksman") || /marksman|tireur/i.test(type),
      fighter: tags.has("fighter") || /combattant|fighter/i.test(type),
      support: tags.has("support") || /support/i.test(type),
      abilityText,
      immobile:
        IMMOBILE_CARRIES.has(norm(name)) ||
        (!traits.mobility && attackRange >= 500 && squishyFrom(dp, tankiness)),
      engage: tags.has("engage") || traits.knockup,
      peel: tags.has("peel") || traits.shield || traits.heal,
      burst: damage >= 7 || tags.has("assassin"),
      early: damage >= 7 && tankiness <= 5,
      scaling: tags.has("scaling") || (tags.has("marksman") && damage <= 6),
    };
  }

  function squishyFrom(dp, tankiness) {
    if (dp.squishy != null) return dp.squishy;
    return tankiness <= 4;
  }

  function tipMatchCounter(attacker, defender) {
    let s = 0;
    for (const tip of defender.enemyTips || []) {
      const tl = tip.toLowerCase();
      if (/(esquiv|prévisib)/.test(tl) && attacker.traits.mobility) s += 6;
      if (/(distance|loin|derrière)/.test(tl) && attacker.attackRange >= defender.attackRange + 100) s += 8;
      if (/(ult|ultime)/.test(tl) && attacker.damage >= 6) s += 5;
      if (/(immobilis|étourdi|enracin)/.test(tl) && attacker.traits.cc) s += 7;
      if (/(bouclier|type de dégâts)/.test(tl) && attacker.traits.antiHeal) s += 6;
      if (/silence/.test(tl) && attacker.traits.cc) s += 4;
      if (/(group|regroup)/.test(tl) && attacker.traits.aoe) s += 5;
      if (/(fui|fuir|échapp)/.test(tl) && attacker.traits.root) s += 6;
      if (/soin/.test(tl) && attacker.traits.antiHeal) s += 8;
      if (/(invisible|fumée)/.test(tl) && defender.traits.invis && attacker.traits.aoe) s += 5;
      if (/sbires/.test(tl) && attacker.attackRange >= 500 && !attacker.marksman) s += 3;
    }
    return s;
  }

  /** Core kit counter — positive = attacker beats defender. Returns { score, hits[] }. */
  function kitCounterScore(attacker, defender) {
    let s = 0;
    const hits = [];
    const add = (pts, reason) => {
      if (pts <= 0) return;
      s += pts;
      hits.push({ pts, reason });
    };

    const at = attacker;
    const de = defender;

    if (at.attackRange >= 500 && de.attackKind === "melee" && de.squishy) {
      add(10 + Math.max(0, Math.floor((at.attackRange - de.attackRange) / 80)), `${at.name} portée > ${de.name} mélée`);
    }
    if (at.attackRange > de.attackRange + 150 && de.squishy) {
      add(8, `${at.name} kite range vs ${de.name}`);
    }

    if ((at.assassin || (at.tags.has("assassin") && at.traits.mobility)) && de.squishy) {
      add(14, `${at.name} assassin vs ${de.name} fragile`);
    }
    if ((at.assassin || at.tags.has("assassin")) && (de.marksman || (de.mage && de.squishy))) {
      add(10, `${at.name} burst vs carry ${de.name}`);
    }
    if (at.traits.invis && de.squishy) add(8, `${at.name} stealth punition ${de.name}`);

    if ((at.traits.cc || at.traits.root) && de.traits.mobility) {
      add(12, `${at.name} CC vs mobilité ${de.name}`);
    }
    if (at.traits.knockup && de.traits.mobility && de.assassin) {
      add(10, `${at.name} knockup vs dash ${de.name}`);
    }

    if (at.traits.cc && de.mage && de.support && /silenc/.test(at.abilityText.toLowerCase())) {
      add(14, `${at.name} silence vs mage ${de.name}`);
    }
    if (at.traits.spellShield && de.mage) add(6, `${at.name} spell-shield vs ${de.name}`);

    if (at.tanky && de.squishy && de.damage >= 6) add(10, `${at.name} frontline absorbe ${de.name}`);
    if (at.tanky && de.assassin) add(8, `${at.name} tank vs assassin ${de.name}`);
    if (at.fighter && de.assassin && at.tankiness >= de.tankiness) {
      add(8, `${at.name} bruiser vs ${de.name} assassin`);
    }

    if ((at.marksman || at.damage >= 7) && de.superTank) {
      add(10, `${at.name} DPS vs super tank ${de.name}`);
    }
    if (at.traits.execute && de.tanky) add(10, `${at.name} execute vs tank ${de.name}`);

    if (at.traits.antiHeal && de.traits.heal) add(12, `${at.name} anti-soin vs sustain ${de.name}`);

    if (at.traits.aoe && de.utility >= 6 && de.support) {
      add(6, `${at.name} AOE vs support ${de.name}`);
    }

    if (at.traits.percentHp && (de.tanky || de.superTank)) {
      add(16, `${at.name} %PV vs tank ${de.name}`);
    }
    if (at.traits.execute && de.tanky && de.traits.heal) {
      add(8, `${at.name} execute vs sustain ${de.name}`);
    }

    if (at.traits.spellShield && (de.traits.pull || de.tags.has("cc"))) {
      add(14, `${at.name} spell-shield vs hook ${de.name}`);
    }
    if (at.traits.dashBlock && de.traits.mobility) {
      add(14, `${at.name} anti-dash vs ${de.name}`);
    }
    if (at.traits.root && de.traits.mobility && de.fighter) {
      add(10, `${at.name} root vs bruiser mobile ${de.name}`);
    }
    if (at.traits.slow && de.attackKind === "melee" && !de.tanky) {
      add(8, `${at.name} slow vs mélée ${de.name}`);
    }

    if (at.traits.pull && de.squishy && !de.traits.mobility) {
      add(10, `${at.name} catch vs ${de.name} immobile`);
    }

    if (at.traits.aoe && de.traits.invis) add(10, `${at.name} AOE vs stealth ${de.name}`);
    if (at.traits.cc && de.traits.invis) add(8, `${at.name} CC vs stealth ${de.name}`);

    if (at.mage && at.damage >= 7 && de.support && de.tags.has("enchanter")) {
      add(12, `${at.name} burst mage vs enchanter ${de.name}`);
    }

    if (at.traits.disengage && de.traits.mobility && de.damage >= 7) {
      add(8, `${at.name} disengage vs all-in ${de.name}`);
    }
    if (at.tags.has("disengage") && (de.tags.has("dive") || de.assassin)) {
      add(10, `${at.name} disengage vs dive ${de.name}`);
    }

    if (at.superTank && de.marksman && de.damage >= 7) {
      add(6, `${at.name} super tank vs ADC ${de.name}`);
    }

    if (at.attackRange >= 550 && de.attackRange <= 175 && de.damage >= 6) {
      add(8, `${at.name} poke range vs all-in ${de.name}`);
    }

    if (de.difficulty >= 7 && at.difficulty <= 4 && at.attackRange >= 500) add(4, `${at.name} poke vs skill ${de.name}`);

    const tip = tipMatchCounter(at, de);
    if (tip > 0) add(tip, `${at.name} exploite kit ${de.name}`);

    return { score: s, hits };
  }

  /** Lane-specific kit modifiers. */
  function laneKitModifiers(attacker, defender, slot) {
    let our = 0;
    let enemy = 0;
    const hits = [];
    const addOur = (pts, reason) => {
      if (pts <= 0) return;
      our += pts;
      hits.push({ pts, reason, side: "our" });
    };
    const addEnemy = (pts, reason) => {
      if (pts <= 0) return;
      enemy += pts;
      hits.push({ pts, reason, side: "enemy" });
    };

    const a = attacker;
    const d = defender;

    if (slot === "Bot") {
      if (a.marksman && d.marksman) {
        const rangeDiff = a.attackRange - d.attackRange;
        if (rangeDiff >= 50 && (d.immobile || !d.traits.mobility)) {
          addOur(20 + Math.floor(rangeDiff / 40), `${a.name} portée > ${d.name} immobile`);
        } else if (rangeDiff <= -50 && (a.immobile || !a.traits.mobility)) {
          addEnemy(20 + Math.floor(-rangeDiff / 40), `${d.name} portée > ${a.name} immobile`);
        } else if (rangeDiff >= 80) {
          addOur(14, `${a.name} range advantage vs ${d.name}`);
        } else if (rangeDiff <= -80 && a.traits.mobility) {
          addOur(10, `${a.name} mobile vs ${d.name} poke`);
        }
        if (a.attackRange <= 500 && d.attackRange >= 600 && a.burst && a.early) {
          addOur(14, `${a.name} all-in vs ${d.name} poke`);
        }
        if (d.attackRange <= 500 && a.attackRange >= 600 && d.burst) {
          addEnemy(14, `${d.name} all-in vs ${a.name} poke`);
        }
        if (a.waveClear && !d.waveClear) addOur(6, `${a.name} push prio vs ${d.name}`);
      }
      if (a.marksman && !d.marksman && d.support && d.traits.pull) {
        addEnemy(10, `${d.name} hook vs ${a.name} ADC`);
      }
    }

    if (slot === "Top") {
      if (a.attackRange >= 500 && d.attackKind === "melee") {
        addOur(12, `${a.name} ranged top vs ${d.name} mélée`);
        if (!d.traits.mobility && !d.tanky) addOur(8, `${a.name} poke vs ${d.name} immobile`);
      }
      if (d.attackRange >= 500 && a.attackKind === "melee" && !a.traits.mobility) {
        addEnemy(12, `${d.name} ranged top vs ${a.name} mélée`);
      }
      if (a.traits.percentHp && d.tanky) addOur(14, `${a.name} %PV vs tank ${d.name}`);
      if (a.fighter && d.tanky && a.damage >= d.damage) {
        addOur(8, `${a.name} bruiser vs tank ${d.name}`);
      }
      if (a.tags.has("split") && d.tanky && !d.tags.has("split")) {
        addOur(6, `${a.name} split vs ${d.name} teamfight tank`);
      }
      if (a.waveClear && !d.waveClear) addOur(6, `${a.name} waveclear > ${d.name}`);
    }

    if (slot === "Mid") {
      if (a.burst > d.burst + 0.15) addOur(12, `${a.name} burst > ${d.name}`);
      if (a.assassin && d.mage && d.squishy) addOur(14, `${a.name} assassin vs mage ${d.name}`);
      if (a.mage && d.assassin && a.traits.cc) addOur(10, `${a.name} CC vs assassin ${d.name}`);
      if (a.traits.mobility && d.mage && !d.traits.mobility) {
        addOur(10, `${a.name} mobile vs mage immobile ${d.name}`);
      }
      if (a.waveClear && !d.waveClear) addOur(8, `${a.name} push prio vs ${d.name}`);
    }

    if (slot === "Jungle") {
      const earlyDiff = a.early - d.early;
      if (earlyDiff > 0.1) addOur(Math.round(earlyDiff * 40), `${a.name} early > ${d.name} jungle`);
      if (a.burst > d.burst + 0.1) addOur(10, `${a.name} duel burst vs ${d.name}`);
      if (a.tags.has("invade") || a.family === "jungle_offensive") {
        if (d.scaling && !d.early) addOur(8, `${a.name} invade vs scale ${d.name}`);
      }
      if (a.traits.mobility && d.tanky) addOur(6, `${a.name} mobile jgl vs tank ${d.name}`);
    }

    if (slot === "Support") {
      if (a.peel > d.peel + 0.1) addOur(14, `${a.name} peel > engage ${d.name}`);
      if (a.engage && d.peel) addEnemy(10, `${d.name} peel vs engage ${a.name}`);
      if (a.traits.pull && d.immobile) addOur(16, `${a.name} hook vs ${d.name} immobile`);
      if (a.traits.spellShield && d.traits.pull) addOur(18, `${a.name} black shield vs hook ${d.name}`);
      if (d.traits.spellShield && a.traits.pull) addEnemy(18, `${d.name} black shield vs hook ${a.name}`);
      if (a.tags.has("enchanter") && d.tags.has("dive")) addEnemy(12, `${d.name} dive vs enchanter ${a.name}`);
      if (a.traits.disengage && d.engage) addOur(12, `${a.name} disengage vs engage ${d.name}`);
    }

    return { our, enemy, hits };
  }

  function pickTopReason(hits, attacker, defender, slot) {
    if (!hits.length) return null;
    hits.sort((x, y) => y.pts - x.pts);
    const top = hits[0];
    const label = SLOT_LABELS[slot] || slot;
    return `${label}: ${top.reason}`;
  }

  /** Full lane edge from kit profiles — our vs enemy point totals. */
  function computeLaneKitEdge(profA, profB, slot) {
    const fwd = kitCounterScore(profA, profB);
    const rev = kitCounterScore(profB, profA);
    const lane = laneKitModifiers(profA, profB, slot);

    let our = Math.round(fwd.score * 1.15 + lane.our);
    let enemy = Math.round(rev.score * 1.15 + lane.enemy);

    const allHits = [
      ...fwd.hits.map((h) => ({ ...h, side: "our" })),
      ...rev.hits.map((h) => ({ ...h, side: "enemy", reason: h.reason.replace(profB.name, profA.name).replace(profA.name, profB.name) })),
      ...lane.hits,
    ];

    const margin = our - enemy;
    const reasons = [];
    if (margin > 0) {
      const r = pickTopReason(
        allHits.filter((h) => h.side === "our"),
        profA,
        profB,
        slot
      );
      if (r) reasons.push(r.replace(/^[^:]+:\s*/, ""));
    } else if (margin < 0) {
      const r = pickTopReason(
        allHits.filter((h) => h.side === "enemy"),
        profB,
        profA,
        slot
      );
      if (r) reasons.push(r.replace(/^[^:]+:\s*/, ""));
    }

    return { our, enemy, margin, reasons };
  }

  function loadPrecomputed(data) {
    precomputed = data || null;
    nameToIdx = null;
    if (precomputed?.champIndex) {
      nameToIdx = precomputed.champIndex;
    } else if (precomputed?.champs) {
      nameToIdx = {};
      precomputed.champs.forEach((n, i) => {
        nameToIdx[n] = i;
        nameToIdx[norm(n)] = i;
      });
    }
  }

  function lookupMargin(nameA, nameB, slot) {
    if (!precomputed?.margins?.[slot] || !nameToIdx) return null;
    const ia = nameToIdx[nameA] ?? nameToIdx[norm(nameA)];
    const ib = nameToIdx[nameB] ?? nameToIdx[norm(nameB)];
    if (ia == null || ib == null) return null;
    const n = precomputed.champs?.length || precomputed.championCount || 0;
    if (!n) return null;
    const idx = ia * n + ib;
    const packed = precomputed.margins[slot];
    if (Array.isArray(packed)) return packed[idx] ?? 0;
    return null;
  }

  /**
   * Primary API — kit edge for lane scoring.
   * profA/profB may be draft-scoring vectors OR raw champ objects (+ metaMap in ctx).
   */
  function laneKitEdge(profA, profB, slot, ctx) {
    const metaMap = ctx?.metaMap;
    const kitA = profA?.attackRange != null ? profA : buildKitProfile(profA?.champ || profA, metaMap);
    const kitB = profB?.attackRange != null ? profB : buildKitProfile(profB?.champ || profB, metaMap);

    const cached = lookupMargin(kitA.name, kitB.name, slot);
    if (cached != null) {
      const abs = Math.abs(cached);
      const our = cached > 0 ? abs : 0;
      const enemy = cached < 0 ? abs : 0;
      const computed = computeLaneKitEdge(kitA, kitB, slot);
      return {
        our,
        enemy,
        margin: cached,
        reasons: computed.reasons,
        source: "precomputed",
      };
    }

    const edge = computeLaneKitEdge(kitA, kitB, slot);
    return { ...edge, source: "live" };
  }

  function initFromFetch(url) {
    return fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) loadPrecomputed(data);
        return !!data;
      })
      .catch(() => false);
  }

  global.LoLLaneMatchupLogic = {
    SLOTS,
    SLOT_LABELS,
    buildKitProfile,
    kitCounterScore,
    laneKitModifiers,
    computeLaneKitEdge,
    laneKitEdge,
    loadPrecomputed,
    lookupMargin,
    initFromFetch,
    norm,
  };
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : global);
