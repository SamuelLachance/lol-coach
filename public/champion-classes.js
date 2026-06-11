/**
 * Riot champion class system — subclasses, wheel counters, lane/team scoring.
 * Data: public/data/champion-classes.json (scripts/build_champion_classes.mjs)
 */
(function (global) {
  /** @type {object|null} */
  let DATA = null;

  const DEFAULT_WHEEL = [
    "Marksman", "Artillery", "Burst", "Battlemage", "Assassin", "Skirmisher",
    "Diver", "Juggernaut", "Vanguard", "Warden", "Catcher", "Enchanter",
  ];

  const FR_LABELS = {
    Marksman: "Marksman",
    Artillery: "Artillery Mage",
    Burst: "Burst Mage",
    Battlemage: "Battlemage",
    Assassin: "Assassin",
    Skirmisher: "Skirmisher",
    Diver: "Diver",
    Juggernaut: "Juggernaut",
    Vanguard: "Vanguard",
    Warden: "Warden",
    Catcher: "Catcher",
    Enchanter: "Enchanter",
    Specialist: "Specialist",
  };

  function norm(name) {
    return String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function loadEmbedded(raw) {
    DATA = raw;
    return DATA;
  }

  function loadFromJson(json) {
    return loadEmbedded(typeof json === "string" ? JSON.parse(json) : json);
  }

  function wheel() {
    return DATA?.wheel || DEFAULT_WHEEL;
  }

  function getEntry(name) {
    if (!DATA?.champions) return null;
    if (DATA.champions[name]) return DATA.champions[name];
    const key = norm(name);
    for (const [k, v] of Object.entries(DATA.champions)) {
      if (norm(k) === key || norm(v.key) === key) return v;
    }
    return null;
  }

  function getProfile(name) {
    const e = getEntry(name);
    if (!e) {
      return {
        name,
        primary: "Specialist",
        secondary: null,
        primaryClass: "Specialist",
        attributes: [],
        counters: [],
        counteredBy: [],
      };
    }
    return { name, ...e };
  }

  function attachToVector(v) {
    if (!v || v.championClass) return v;
    const cp = getProfile(v.name);
    v.championClass = cp;
    v.subclass = cp.primary;
    v.subclassSecondary = cp.secondary;
    return v;
  }

  function ruleLookup(attacker, defender) {
    const rules = DATA?.interactionRules || [];
    return rules.find((r) => r.attacker === attacker && r.defender === defender) || null;
  }

  /** Positive = attacker subclass beats defender subclass. */
  function classMatchupEdge(attackerSub, defenderSub, opts = {}) {
    const lane = opts.lane !== false;
    const baseLane = 22;
    const baseTeam = 14;
    if (!attackerSub || !defenderSub || attackerSub === defenderSub) {
      return { our: 0, enemy: 0, reason: null };
    }
    const rule = ruleLookup(attackerSub, defenderSub);
    const rev = ruleLookup(defenderSub, attackerSub);
    if (rule && !rev) {
      const w = lane ? (rule.laneWeight ?? 1) : (rule.teamWeight ?? 0.6);
      const pts = Math.round((lane ? baseLane : baseTeam) * w);
      return { our: pts, enemy: 0, reason: rule.reason };
    }
    if (rev && !rule) {
      const w = lane ? (rev.laneWeight ?? 1) : (rev.teamWeight ?? 0.6);
      const pts = Math.round((lane ? baseLane : baseTeam) * w);
      return { our: 0, enemy: pts, reason: rev.reason };
    }
    if (rule && rev) {
      const wO = lane ? (rule.laneWeight ?? 1) : (rule.teamWeight ?? 0.6);
      const wE = lane ? (rev.laneWeight ?? 1) : (rev.teamWeight ?? 0.6);
      const o = Math.round((lane ? baseLane : baseTeam) * wO);
      const e = Math.round((lane ? baseLane : baseTeam) * wE);
      if (o >= e) return { our: o - Math.round(e * 0.35), enemy: 0, reason: rule.reason };
      return { our: 0, enemy: e - Math.round(o * 0.35), reason: rev.reason };
    }
    return { our: 0, enemy: 0, reason: null };
  }

  function pairClassEdge(ourName, enemyName, opts = {}) {
    const u = getProfile(ourName);
    const e = getProfile(enemyName);
    let best = classMatchupEdge(u.primary, e.primary, opts);
    if (u.secondary) {
      const sec = classMatchupEdge(u.secondary, e.primary, opts);
      if (sec.our + sec.enemy > best.our + best.enemy) best = sec;
    }
    if (e.secondary) {
      const sec = classMatchupEdge(u.primary, e.secondary, opts);
      if (sec.our + sec.enemy > best.our + best.enemy) best = sec;
    }
    return best;
  }

  function slotClassFit(subclass, slot) {
    const fit = DATA?.slotFit?.[slot];
    if (!fit?.length) return 0;
    if (fit.includes(subclass)) return 1;
    return 0.35;
  }

  function scorePickClassFit(champName, slot, enemyName = null) {
    const cp = getProfile(champName);
    let score = 0;
    const reasons = [];
    const fit = slotClassFit(cp.primary, slot);
    if (fit >= 1) {
      score += 18;
      reasons.push(`Classe ${FR_LABELS[cp.primary] || cp.primary} → ${slot}`);
    } else if (fit >= 0.35) {
      score += 4;
      reasons.push(`Flex classe ${FR_LABELS[cp.primary] || cp.primary}`);
    } else {
      score -= 22;
      reasons.push(`Classe ${FR_LABELS[cp.primary] || cp.primary} hors slot ${slot}`);
    }
    if (cp.secondary && slotClassFit(cp.secondary, slot) >= 1) {
      score += 8;
      reasons.push(`Secondaire ${FR_LABELS[cp.secondary]} OK ${slot}`);
    }
    if (enemyName) {
      const edge = pairClassEdge(champName, enemyName, { lane: true });
      if (edge.our) {
        score += Math.round(edge.our * 0.85);
        if (edge.reason) reasons.push(edge.reason);
      }
      if (edge.enemy) score -= Math.round(edge.enemy * 0.7);
    }
    return { score, reasons: [...new Set(reasons)] };
  }

  function buildTeamClassMetrics(vs) {
    const subs = [];
    const primaries = new Set();
    const classes = new Set();
    const attrs = { bully: 0, carry: 0, hypercarry: 0, damageDealer: 0, jungler: 0, pusher: 0 };
    for (const v of vs) {
      const cp = v.championClass || getProfile(v.name);
      subs.push(cp.primary);
      if (cp.secondary) subs.push(cp.secondary);
      primaries.add(cp.primary);
      classes.add(cp.primaryClass);
      for (const a of cp.attributes || []) {
        if (attrs[a] != null) attrs[a] += 1;
      }
    }
    const frontline = subs.filter((s) => ["Vanguard", "Warden", "Juggernaut"].includes(s)).length;
    const engage = subs.filter((s) => ["Vanguard", "Diver", "Catcher", "Assassin"].includes(s)).length;
    const peel = subs.filter((s) => ["Enchanter", "Warden", "Catcher"].includes(s)).length;
    const marksman = subs.filter((s) => s === "Marksman").length;
    const mageBurst = subs.filter((s) => ["Burst", "Artillery"].includes(s)).length;
    const slayer = subs.filter((s) => ["Assassin", "Skirmisher"].includes(s)).length;
    return {
      vs,
      subclasses: subs,
      uniqueSubclasses: primaries.size,
      uniqueClasses: classes.size,
      frontline,
      engage,
      peel,
      marksman,
      mageBurst,
      slayer,
      attrs,
    };
  }

  function teamClassDiversity(vs) {
    const m = buildTeamClassMetrics(vs);
    let bonus = 0;
    const reasons = [];
    if (m.uniqueSubclasses >= 4) {
      bonus += 28 + (m.uniqueSubclasses - 4) * 6;
      reasons.push(`Diversité classes (${m.uniqueSubclasses} sous-classes)`);
    } else if (m.uniqueSubclasses >= 3) {
      bonus += 14;
      reasons.push("Comp classes variée");
    }
    if (m.uniqueClasses >= 4) bonus += 12;
    const dup = m.subclasses.length - m.uniqueSubclasses;
    if (dup >= 3) {
      bonus -= 18;
      reasons.push("Doublons sous-classe");
    }
    return { score: bonus, reasons, metrics: m };
  }

  function teamClassGapPenalty(vs) {
    const m = buildTeamClassMetrics(vs);
    const present = new Set(m.subclasses);
    let penalty = 0;
    const gaps = [];
    for (const rule of DATA?.teamGapRules || []) {
      if (rule.need.some((s) => present.has(s))) continue;
      penalty -= rule.penalty;
      gaps.push(rule.gap);
    }
    return { score: penalty, gaps, metrics: m };
  }

  function teamClassClashEdge(ourVs, enemyVs) {
    let our = 0;
    let enemy = 0;
    const hits = [];
    const ourM = buildTeamClassMetrics(ourVs);
    const enemyM = buildTeamClassMetrics(enemyVs);

    if (ourM.mageBurst >= 2 && enemyM.frontline === 0) {
      our += 68;
      hits.push({ edge: 68, reason: "Double burst Mage > comp sans frontline", our: "Mage", enemy: "backline" });
    }
    if (enemyM.mageBurst >= 2 && ourM.frontline === 0) {
      enemy += 68;
      hits.push({ edge: -68, reason: "Double burst Mage > comp sans frontline", our: "backline", enemy: "Mage" });
    }
    if (ourM.frontline >= 2 && enemyM.slayer >= 2) {
      our += 58;
      hits.push({ edge: 58, reason: "Double frontline > comp Assassin/Slayer", our: "Tank", enemy: "Slayer" });
    }
    if (enemyM.frontline >= 2 && ourM.slayer >= 2) {
      enemy += 58;
      hits.push({ edge: -58, reason: "Double frontline > comp Assassin/Slayer", our: "Slayer", enemy: "Tank" });
    }
    if (ourM.marksman >= 1 && ourM.peel >= 1 && enemyM.slayer >= 2) {
      our += 52;
      hits.push({ edge: 52, reason: "ADC + peel > comp dive Slayer", our: "front-to-back", enemy: "Slayer" });
    }
    if (enemyM.marksman >= 1 && enemyM.peel >= 1 && ourM.slayer >= 2) {
      enemy += 52;
      hits.push({ edge: -52, reason: "ADC + peel > comp dive Slayer", our: "Slayer", enemy: "front-to-back" });
    }
    if (ourM.marksman >= 1 && enemyM.frontline >= 2 && enemyM.mageBurst === 0) {
      our += 48;
      hits.push({ edge: 48, reason: "Marksman DPS > double Tank sans burst", our: "Marksman", enemy: "Tank" });
    }
    if (enemyM.marksman >= 1 && ourM.frontline >= 2 && ourM.mageBurst === 0) {
      enemy += 48;
      hits.push({ edge: -48, reason: "Marksman DPS > double Tank sans burst", our: "Tank", enemy: "Marksman" });
    }
    if (ourM.engage >= 2 && enemyM.peel === 0 && enemyM.frontline <= 1) {
      our += 55;
      hits.push({ edge: 55, reason: "Engage Vanguard/Diver > backline sans peel", our: "engage", enemy: "squishy" });
    }
    if (enemyM.engage >= 2 && ourM.peel === 0 && ourM.frontline <= 1) {
      enemy += 55;
      hits.push({ edge: -55, reason: "Engage Vanguard/Diver > backline sans peel", our: "squishy", enemy: "engage" });
    }

    for (const u of ourVs) {
      for (const e of enemyVs) {
        const edge = pairClassEdge(u.name, e.name, { lane: false });
        if (edge.our >= 12 && edge.reason) {
          our += Math.round(edge.our * 0.35);
          if (edge.our >= 16) hits.push({ edge: edge.our, reason: edge.reason, our: u.name, enemy: e.name });
        }
        if (edge.enemy >= 12 && edge.reason) {
          enemy += Math.round(edge.enemy * 0.35);
          if (edge.enemy >= 16) hits.push({ edge: -edge.enemy, reason: edge.reason, our: e.name, enemy: u.name });
        }
      }
    }

    return { our, enemy, hits };
  }

  function enrichProfiles(vs) {
    return vs.map((v) => attachToVector(v));
  }

  function loadPrecomputed(json) {
    return loadFromJson(json);
  }

  async function loadAsync(url) {
    const res = await fetch(url);
    return loadFromJson(await res.json());
  }

  global.LoLChampionClasses = {
    loadPrecomputed,
    loadAsync,
    loadFromJson,
    getProfile,
    getEntry,
    attachToVector,
    enrichProfiles,
    classMatchupEdge,
    pairClassEdge,
    slotClassFit,
    scorePickClassFit,
    buildTeamClassMetrics,
    teamClassDiversity,
    teamClassGapPenalty,
    teamClassClashEdge,
    wheel,
    FR_LABELS,
    ruleCount: () => (DATA?.interactionRules?.length || 0) + (DATA?.teamGapRules?.length || 0),
  };
})(typeof window !== "undefined" ? window : globalThis);
