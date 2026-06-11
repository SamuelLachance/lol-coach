#!/usr/bin/env node
/**
 * Generate public/data/champion-classes.json from champions.json + Riot subclass mapping.
 * Run: node scripts/build_champion_classes.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "public/data/champions.json");
const dst = join(root, "public/data/champion-classes.json");

const PRIMARY_CLASS = {
  Marksman: "Marksman",
  Artillery: "Mage",
  Burst: "Mage",
  Battlemage: "Mage",
  Assassin: "Slayer",
  Skirmisher: "Slayer",
  Diver: "Fighter",
  Juggernaut: "Fighter",
  Vanguard: "Tank",
  Warden: "Tank",
  Catcher: "Controller",
  Enchanter: "Controller",
  Specialist: "Specialist",
};

/** Wiki class wheel — each subclass counters the two preceding entries. */
const WHEEL = [
  "Marksman",
  "Artillery",
  "Burst",
  "Battlemage",
  "Assassin",
  "Skirmisher",
  "Diver",
  "Juggernaut",
  "Vanguard",
  "Warden",
  "Catcher",
  "Enchanter",
];

const SUBCLASS_LISTS = {
  Enchanter: [
    "Janna", "Lulu", "Milio", "Soraka", "Yuumi", "Nami", "Karma", "Seraphine", "Séraphine",
    "Sona", "Taric", "Renata Glasc", "Ivern",
  ],
  Catcher: [
    "Blitzcrank", "Thresh", "Nautilus", "Pyke", "Morgana", "Leona", "Alistar", "Rell",
    "Bard", "Zilean", "Zyra", "Rakan", "Neeko",
  ],
  Warden: [
    "Braum", "Tahm Kench", "Poppy", "Shen", "Maokai", "Galio", "Taric", "Braum",
  ],
  Vanguard: [
    "Malphite", "Ornn", "Sejuani", "Amumu", "Sion", "Zac", "Rammus", "Skarner",
    "Cho'Gath", "Nunu et Willump", "Jarvan IV", "Wukong", "Gragas", "Ambessa",
  ],
  Juggernaut: [
    "Aatrox", "Darius", "Garen", "Mordekaiser", "Nasus", "Trundle", "Urgot", "Volibear",
    "Illaoi", "Yorick", "Sett", "Gwen", "K'Santé", "Dr. Mundo", "Olaf", "Shyvana", "Sion",
  ],
  Diver: [
    "Camille", "Irelia", "Vi", "Lee Sin", "Hecarim", "Jarvan IV", "Xin Zhao", "Pantheon",
    "Renekton", "Riven", "Diana", "Ekko", "Elise", "Warwick", "Nocturne", "Rek'Sai",
    "Graves", "Bel'Veth", "Viego", "Kayn", "Kha'Zix", "Poppy",
  ],
  Burst: [
    "Annie", "Syndra", "Veigar", "Lux", "LeBlanc", "Zoé", "Zoe", "Ahri", "Brand",
    "Malzahar", "Orianna", "Viktor", "Hwei", "Mel", "Vel'Koz", "Fizz", "Katarina",
    "Taliyah", "Lissandra", "Anivia", "Xerath",
  ],
  Battlemage: [
    "Cassiopeia", "Ryze", "Vladimir", "Swain", "Sylas", "Rumble", "Karthus", "Azir",
    "Aurelion Sol", "Singed", "Vladimir", "Kassadin", "Taliyah",
  ],
  Artillery: [
    "Xerath", "Ziggs", "Jayce", "Varus", "Corki", "Heimerdinger", "Zoé", "Zoe",
    "Lux", "Vel'Koz", "Hwei", "Mel",
  ],
  Assassin: [
    "Zed", "Talon", "Kha'Zix", "Rengar", "Evelynn", "Fizz", "LeBlanc", "Qiyana",
    "Akali", "Katarina", "Elise", "Naafiri", "Briar", "Shaco", "Nocturne", "Diana",
  ],
  Skirmisher: [
    "Yasuo", "Yone", "Fiora", "Jax", "Tryndamere", "Master Yi", "Maître Yi", "Riven",
    "Irelia", "Camille", "Gwen", "Lucian", "Nilah", "Samira", "Bel'Veth", "Viego",
    "Kayn", "Kindred", "Graves", "Pyke", "Akshan", "Yunara",
  ],
  Marksman: [
    "Ashe", "Caitlyn", "Draven", "Ezreal", "Jhin", "Jinx", "Kai'Sa", "Kalista",
    "Kog'Maw", "Lucian", "Miss Fortune", "Samira", "Sivir", "Tristana", "Twitch",
    "Varus", "Vayne", "Xayah", "Zeri", "Aphelios", "Smolder", "Corki", "Yunara",
  ],
  Specialist: [
    "Cho'Gath", "Gangplank", "Gnar", "Jayce", "Kennen", "Neeko", "Quinn", "Teemo",
    "Kayle", "Nidalee", "Shyvana", "Urgot", "Zaahen", "Ambessa", "Aurora", "Yorick",
    "Heimerdinger", "Twisted Fate", "Senna", "Graves", "Kindred", "Taric",
  ],
};

const SECONDARY = {
  "Kayle": "Battlemage",
  "Nidalee": "Assassin",
  "Jayce": "Fighter",
  "Gangplank": "Fighter",
  "Senna": "Marksman",
  "Twisted Fate": "Burst",
  "Karma": "Burst",
  "Morgana": "Burst",
  "Lux": "Artillery",
  "Varus": "Artillery",
  "Corki": "Artillery",
  "Lucian": "Skirmisher",
  "Samira": "Skirmisher",
  "Graves": "Marksman",
  "Kindred": "Marksman",
  "Pyke": "Assassin",
  "Pantheon": "Diver",
  "Diana": "Assassin",
  "Ekko": "Assassin",
  "Elise": "Assassin",
  "Nocturne": "Assassin",
  "Viego": "Skirmisher",
  "Bel'Veth": "Skirmisher",
  "Gwen": "Skirmisher",
  "Sylas": "Skirmisher",
  "Swain": "Battlemage",
  "Vladimir": "Battlemage",
  "Galio": "Warden",
  "Maokai": "Vanguard",
  "Shen": "Warden",
  "Poppy": "Warden",
  "Jarvan IV": "Vanguard",
  "Gragas": "Vanguard",
  "Wukong": "Vanguard",
  "Volibear": "Juggernaut",
  "Olaf": "Juggernaut",
  "Dr. Mundo": "Juggernaut",
  "Shyvana": "Juggernaut",
  "Urgot": "Juggernaut",
  "Neeko": "Burst",
  "Zaahen": "Skirmisher",
  "Ambessa": "Diver",
  "Aurora": "Burst",
  "Yunara": "Marksman",
  "Smolder": "Marksman",
  "Mel": "Artillery",
  "Briar": "Diver",
  "Naafiri": "Assassin",
  "Akshan": "Marksman",
};

const nameToSubclass = new Map();
for (const [sub, names] of Object.entries(SUBCLASS_LISTS)) {
  for (const n of names) nameToSubclass.set(n, sub);
}

function normKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function classifyHeuristic(champ) {
  const tag = champ.tags?.[0] || "";
  const type = (champ.type || "").toLowerCase();
  const dp = champ.draftProfile || {};
  const name = champ.name;

  if (/marksman|tireur|à distance/i.test(type) || tag === "Marksman") return "Marksman";
  if (tag === "Tank" || /tank/i.test(type)) {
    if (dp.engageWeight >= 0.55 || dp.tanky) return "Vanguard";
    return "Warden";
  }
  if (tag === "Support" || /support/i.test(type)) {
    if (dp.peelWeight >= 0.5 || /enchant|soin|bouclier/i.test(champ.raison || "")) return "Enchanter";
    return "Catcher";
  }
  if (tag === "Assassin" || /assassin/i.test(type)) {
    if (dp.dpsWeight >= 0.55) return "Skirmisher";
    return "Assassin";
  }
  if (tag === "Mage" || /mage/i.test(type)) {
    if (dp.range === "long" || dp.pokeWeight >= 0.5) return "Artillery";
    if (dp.dpsWeight >= 0.55) return "Battlemage";
    return "Burst";
  }
  if (tag === "Fighter" || /combattant|fighter/i.test(type)) {
    if (dp.tankWeight >= 0.45 || dp.tanky) return "Juggernaut";
    return "Diver";
  }
  return "Specialist";
}

function countersOf(subclass) {
  const i = WHEEL.indexOf(subclass);
  if (i < 0) return [];
  const len = WHEEL.length;
  return [WHEEL[(i - 2 + len) % len], WHEEL[(i - 1 + len) % len]];
}

function counteredByOf(subclass) {
  const i = WHEEL.indexOf(subclass);
  if (i < 0) return [];
  const len = WHEEL.length;
  return [WHEEL[(i + 1) % len], WHEEL[(i + 2) % len]];
}

const REASON_FR = {
  "Vanguard>Assassin": "Tank absorbe le burst Assassin",
  "Vanguard>Skirmisher": "Vanguard CC > Slayer mobile",
  "Vanguard>Burst": "Tank absorbe le burst Mage",
  "Vanguard>Artillery": "Frontline ferme > poke Artillery",
  "Warden>Assassin": "Warden peel > Assassin",
  "Warden>Burst": "Warden absorbe burst Mage",
  "Warden>Battlemage": "Frontline > Battlemage mêlée",
  "Marksman>Vanguard": "Marksman DPS > Tank sans gapclose",
  "Marksman>Warden": "ADC sustained > Warden immobile",
  "Juggernaut>Vanguard": "Bruiser DPS > Tank engage",
  "Juggernaut>Warden": "Juggernaut out-sustain Warden",
  "Diver>Vanguard": "Diver gapclose > Vanguard lent",
  "Diver>Warden": "Diver dive > Warden peel limité",
  "Assassin>Artillery": "Assassin gapclose > Artillery immobile",
  "Assassin>Burst": "Slayer burst > Mage setup",
  "Skirmisher>Battlemage": "Skirmisher mobile > Battlemage",
  "Skirmisher>Assassin": "Duelist > Assassin fragile",
  "Burst>Marksman": "Burst Mage > ADC early",
  "Artillery>Marksman": "Artillery poke > Marksman immobile",
  "Enchanter>Catcher": "Enchanter peel > hook Catcher",
  "Enchanter>Warden": "Enchanter sustain > Warden",
  "Catcher>Enchanter": "Catch > Enchanter immobile",
  "Catcher>Warden": "Hook punition > Warden lent",
};

function reasonKey(a, b) {
  return `${a}>${b}`;
}

function deriveAttributes(sub, champ, meta) {
  const dp = champ.draftProfile || meta?.[champ.name]?.draftProfile || {};
  const tags = new Set([...(champ.tags || []), ...(meta?.[champ.name]?.tags || [])]);
  const attrs = [];
  if (tags.has("marksman") || sub === "Marksman") {
    attrs.push("carry");
    if ((dp.scalingWeight ?? 0) >= 0.55 || champ.championFamily?.compTypes?.includes("hypercarry")) {
      attrs.push("hypercarry");
    }
  }
  if ((dp.dpsWeight ?? 0) >= 0.45 && !["Vanguard", "Warden", "Enchanter", "Catcher"].includes(sub)) {
    attrs.push("damageDealer");
  }
  if (champ.optimalSlots?.includes("Jungle")) attrs.push("jungler");
  if ((dp.waveClear ?? 0) >= 0.55 || dp.waveClear === true) attrs.push("pusher");
  if ((dp.earlyWeight ?? 0) >= 0.55 || tags.has("lane_bully")) attrs.push("bully");
  if (sub === "Artillery" || sub === "Burst") attrs.push("bully");
  if (sub === "Juggernaut" && (dp.earlyWeight ?? 0) >= 0.45) attrs.push("bully");
  return [...new Set(attrs)];
}

const SLOT_FIT = {
  Top: ["Juggernaut", "Diver", "Battlemage", "Skirmisher", "Vanguard", "Specialist"],
  Jungle: ["Diver", "Assassin", "Skirmisher", "Vanguard", "Specialist"],
  Mid: ["Burst", "Artillery", "Assassin", "Battlemage", "Specialist"],
  Bot: ["Marksman", "Artillery", "Burst"],
  Support: ["Enchanter", "Catcher", "Warden", "Burst", "Vanguard"],
};

const data = JSON.parse(readFileSync(src, "utf8"));
const metaPath = join(root, "public/data/tactics-meta.json");
let meta = {};
try {
  meta = JSON.parse(readFileSync(metaPath, "utf8")).champions || {};
} catch {
  /* optional */
}

const champions = {};
const unresolved = [];

for (const champ of data.champions) {
  const name = champ.name;
  let primary = nameToSubclass.get(name);
  if (!primary) {
    for (const [k, v] of nameToSubclass) {
      if (normKey(k) === normKey(name)) {
        primary = v;
        break;
      }
    }
  }
  if (!primary) primary = classifyHeuristic(champ);
  const secondary = SECONDARY[name] || null;
  const primaryClass = PRIMARY_CLASS[primary] || "Specialist";
  const secondaryClass = secondary ? PRIMARY_CLASS[secondary] || null : null;
  const attributes = deriveAttributes(primary, champ, meta);

  champions[name] = {
    key: champ.key || name,
    primary,
    secondary,
    primaryClass,
    secondaryClass,
    counters: countersOf(primary),
    counteredBy: counteredByOf(primary),
    attributes,
    slots: champ.optimalSlots || [],
  };
  if (primary === "Specialist" && !SUBCLASS_LISTS.Specialist.includes(name)) {
    unresolved.push(name);
  }
}

const interactionRules = [];
for (const sub of WHEEL) {
  for (const target of countersOf(sub)) {
    const key = reasonKey(sub, target);
    interactionRules.push({
      attacker: sub,
      defender: target,
      reason: REASON_FR[key] || `${sub} > ${target} (wheel)`,
      laneWeight: 1,
      teamWeight: 0.6,
    });
  }
}

interactionRules.push(
  { attacker: "Marksman", defender: "Vanguard", reason: "Marksman DPS > Tank sans gapclose", laneWeight: 1.15, teamWeight: 0.8 },
  { attacker: "Marksman", defender: "Warden", reason: "ADC sustained > Warden peel seul", laneWeight: 1.1, teamWeight: 0.75 },
  { attacker: "Juggernaut", defender: "Vanguard", reason: "Fighter DPS > Tank engage", laneWeight: 1.05, teamWeight: 0.7 },
  { attacker: "Diver", defender: "Marksman", reason: "Diver gapclose > ADC immobile", laneWeight: 1.1, teamWeight: 0.65 },
  { attacker: "Vanguard", defender: "Assassin", reason: "Tank absorbe le burst Assassin", laneWeight: 1.2, teamWeight: 0.85 },
  { attacker: "Vanguard", defender: "Burst", reason: "Frontline > Burst Mage setup", laneWeight: 1.15, teamWeight: 0.8 },
  { attacker: "Enchanter", defender: "Assassin", reason: "Enchanter peel > dive Assassin", laneWeight: 0.85, teamWeight: 0.9 },
  { attacker: "Catcher", defender: "Artillery", reason: "Hook punition > Mage immobile", laneWeight: 1.05, teamWeight: 0.7 },
);

const teamGapRules = [
  { gap: "frontline", need: ["Vanguard", "Warden", "Juggernaut"], penalty: 72, label: "Pas de frontline (Tank/Fighter)" },
  { gap: "engage", need: ["Vanguard", "Diver", "Catcher", "Assassin"], penalty: 58, label: "Pas d'engage (Vanguard/Diver/Catcher)" },
  { gap: "peel", need: ["Enchanter", "Warden", "Catcher"], penalty: 48, label: "Pas de peel (Enchanter/Warden)" },
  { gap: "damage", need: ["Marksman", "Burst", "Artillery", "Assassin", "Skirmisher", "Battlemage"], penalty: 55, label: "Pas de damage dealer" },
  { gap: "waveclear", need: ["Artillery", "Battlemage", "Marksman", "Burst"], penalty: 35, label: "Waveclear mage/ADC manquant" },
];

const out = {
  version: data.version,
  source: "Riot subclass wheel + champions.json heuristics",
  championCount: Object.keys(champions).length,
  wheel: WHEEL,
  primaryClass: PRIMARY_CLASS,
  slotFit: SLOT_FIT,
  interactionRules,
  teamGapRules,
  champions,
};

writeFileSync(dst, JSON.stringify(out, null, 2), "utf8");
console.log(`Wrote ${dst}`);
console.log(`  champions mapped: ${out.championCount}`);
console.log(`  interaction rules: ${interactionRules.length}`);
if (unresolved.length) console.log(`  specialist/heuristic: ${unresolved.length} — ${unresolved.slice(0, 8).join(", ")}${unresolved.length > 8 ? "…" : ""}`);
