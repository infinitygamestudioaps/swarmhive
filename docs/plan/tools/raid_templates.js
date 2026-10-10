#!/usr/bin/env node
// raid_templates.js — builds Scripts/data/raid_templates.json: one raid-team TEMPLATE per raid / grand boss.
//
// Usage:  node docs/plan/tools/raid_templates.js            (writes the JSON)
//         node docs/plan/tools/raid_templates.js --print    (also prints the epic table)
//
// Offline. Inputs (all local, read only):
//   Scripts/data/npcstats/*.xml          L2J High Five datapack data/stats/npcs (attribute defence/attack, race, minions, skills)
//   Scripts/data/dp/npcs/*.xml           optional extra npc xml (same format, read after npcstats, wins on duplicates)
//   Scripts/data/dp/npcs/ai/*.java       grand boss AI scripts downloaded from github.com/Shagooh/l2j-server-datapack
//                                        (QueenAnt, Core, Orfen, Baium, Antharas, Valakas, Beleth, GrandBossTeleporters,
//                                        FinalEmperialTomb, CavernOfThePirateCaptain) — entry items / player limits are parsed from them
//   Scripts/data/dp/skills/*.xml         skill data (attributeType + MagicalAttack effects = elemental nukes)
//   Scripts/data/dp/classSkillTree.xml   + highFiveNewClassSkillTree.xml: which class learns which skill at which level
//   Scripts/data/raidbosses_h5.json      our raid boss list (positions, minions, curseLevel, recommended levels)
//   Scripts/data/npcs_h5.json            id -> name/level fallback
//   Scripts/data/spawns_h5.json          spawnlist (counts of script minions that live in the lair)
//   Dashboard/data/classes.json          client class names (= what L2Swarm reports as Me.ClassName)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const D = (...p) => path.join(ROOT, 'Scripts', 'data', ...p);
const OUT = D('raid_templates.json');
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const exists = p => { try { fs.statSync(p); return true; } catch (e) { return false; } };

// ---------------------------------------------------------------- class names (client names = Me.ClassName)
const CLASS_FALLBACK = { 0: 'Human Fighter', 10: 'Human Mystic' };
const CLASSES = exists(path.join(ROOT, 'Dashboard', 'data', 'classes.json'))
  ? readJson(path.join(ROOT, 'Dashboard', 'data', 'classes.json')) : CLASS_FALLBACK;
const cn = id => CLASSES[id] || ('class#' + id);

// profession tier per class id (0 = base, 1 = 1st class lvl 20, 2 = 2nd lvl 40, 3 = 3rd lvl 76)
const TIER = {};
[0, 10, 18, 25, 31, 38, 44, 49, 53, 123, 124].forEach(i => TIER[i] = 0);
[1, 4, 7, 11, 15, 19, 22, 26, 29, 32, 35, 39, 42, 45, 47, 50, 54, 56, 125, 126].forEach(i => TIER[i] = 1);
[2, 3, 5, 6, 8, 9, 12, 13, 14, 16, 17, 20, 21, 23, 24, 27, 28, 30, 33, 34, 36, 37, 40, 41, 43, 46, 48, 51, 52, 55, 57,
  127, 128, 129, 130, 135].forEach(i => TIER[i] = 2);
for (let i = 88; i <= 118; i++) TIER[i] = 3;
[131, 132, 133, 134, 136].forEach(i => TIER[i] = 3);
const TIER_LEVEL = [1, 20, 40, 76];

// role -> class ids (curated: H5 class design; names come from classes.json)
const ROLE_DEF = {
  tank: { description: 'Holds the boss and pulls / holds every minion away from the damage dealers (Aggression, Hate Aura, Ultimate Defense).',
    ids: [4, 19, 32, 5, 6, 20, 33, 90, 91, 99, 106] },
  healer: { description: 'Keeps the party alive; never attacks (team rule). Group heals, cleanse, res outside the fight.',
    ids: [15, 29, 42, 16, 30, 43, 97, 105, 112] },
  nuker: { description: 'Magic damage dealer. On element-weak bosses only the matching element (see elementNukers).',
    ids: [11, 26, 39, 12, 13, 27, 40, 94, 95, 103, 110, 128, 129, 132, 133] },
  summoner: { description: 'Servitor class: the servitor tanks/kills minions or adds steady damage; the master can heal/buff the servitor. Elemental/Phantom/Warlock lines.',
    ids: [14, 28, 41, 96, 104, 111] },
  melee: { description: 'Physical damage dealer standing behind the boss (away from the tank). Destroyers = Frenzy/Zealot opening.',
    ids: [1, 7, 22, 35, 45, 47, 125, 2, 3, 8, 23, 36, 46, 48, 127, 88, 89, 93, 101, 108, 113, 114, 131, 56, 57, 118] },
  archer: { description: 'Ranged physical damage (bows / crossbows); can also pull single minions.',
    ids: [9, 24, 37, 92, 102, 109, 126, 130, 134] },
  buffer: { description: 'Party buffs during the fight (chants, songs, dances, Prophet/Warcryer/Doomcryer buffs). L2Toggle board buffs cover the basics; class buffs add raid-only ones (Victory, Magnus, Greater Battle Chants).',
    ids: [17, 50, 52, 21, 34, 51, 98, 100, 107, 115, 116, 135, 136] },
  debuffer: { description: 'Debuffs the boss (curses, Surrender to <element>, Hex, Death Mark, Stigma). Raid bosses resist most CC; damage/defence debuffs are what counts.',
    ids: [13, 95, 12, 27, 40, 94, 103, 110, 33, 106, 43, 112, 51, 115, 128, 129, 132, 133, 135, 136, 6, 91] },
  spoiler: { description: 'Spoils minions (Spoil + Sweeper). Raid/grand bosses themselves cannot be spoiled; minions and lair monsters can.',
    ids: [54, 55, 117] },
};

// ---------------------------------------------------------------- npc xml
function parseNpcXml(text, map) {
  const re = /<npc id="(\d+)"([^>]*)>([\s\S]*?)<\/npc>/g;
  let m;
  while ((m = re.exec(text))) {
    const head = m[2], body = m[3];
    const a = n => { const r = head.match(new RegExp('\\b' + n + '="([^"]*)"')); return r ? r[1] : null; };
    const def = body.match(/<attribute>[\s\S]*?<defence([^/]*)\/>/);
    const atk = body.match(/<attribute>[\s\S]*?<attack type="(\w+)" value="(\d+)"/);
    const d = {};
    if (def) for (const k of ['fire', 'water', 'wind', 'earth', 'holy', 'dark']) {
      const r = def[1].match(new RegExp('\\b' + k + '="(-?\\d+)"'));
      if (r) d[k] = +r[1];
    }
    const minions = [];
    const mn = body.match(/<minions[^>]*>([\s\S]*?)<\/minions>/);
    if (mn) for (const x of mn[1].matchAll(/<npc id="(\d+)" count="(\d+)"/g)) minions.push({ id: +x[1], count: +x[2] });
    const skills = [...body.matchAll(/<skill id="(\d+)" level="(\d+)"\s*\/>\s*(?:<!--\s*([^-]*?)\s*-->)?/g)]
      .map(x => ({ id: +x[1], level: +x[2], name: x[3] || null }));
    const race = (body.match(/<race>(\w+)<\/race>/) || [])[1] || null;
    const hp = (body.match(/<vitals hp="([\d.]+)"/) || [])[1];
    map[m[1]] = {
      id: +m[1], name: a('name'), title: a('title'), level: +a('level'), type: a('type'), race,
      hp: hp ? Math.round(+hp) : null,
      attrDefence: def ? d : null,
      attackElement: atk ? { type: atk[1].toLowerCase(), value: +atk[2] } : null,
      minions, skills,
      aggressive: /isAggressive="true"/.test(body) || (/aggroRange="\d+"/.test(body) && !/isAggressive="false"/.test(body)),
    };
  }
}
const NPC = {};
const npcFiles = [];
for (const dir of [D('npcstats'), D('dp', 'npcs')]) {
  if (!exists(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.xml')).sort()) {
    parseNpcXml(fs.readFileSync(path.join(dir, f), 'utf8'), NPC);
    npcFiles.push(rel(path.join(dir, f)));
  }
}
const NPCS_H5 = readJson(D('npcs_h5.json'));
const npcName = id => (NPC[id] && NPC[id].name) || (NPCS_H5[id] && NPCS_H5[id].n) || ('npc#' + id);
const npcLevel = id => (NPC[id] && NPC[id].level) || (NPCS_H5[id] && NPCS_H5[id].l) || null;

// ---------------------------------------------------------------- AI scripts (constants)
const AI_DIR = D('dp', 'npcs', 'ai');
const AI_URL = 'https://raw.githubusercontent.com/Shagooh/l2j-server-datapack/master/src/main/java/com/l2jserver/datapack/';
const AI_PATHS = {
  'QueenAnt.java': 'ai/individual/QueenAnt.java', 'Core.java': 'ai/individual/Core.java', 'Orfen.java': 'ai/individual/Orfen.java',
  'Baium.java': 'ai/individual/Baium/Baium.java', 'Antharas.java': 'ai/individual/Antharas/Antharas.java',
  'Valakas.java': 'ai/individual/Valakas.java', 'Beleth.java': 'ai/individual/Beleth.java',
  'GrandBossTeleporters.java': 'ai/npc/Teleports/GrandBossTeleporters/GrandBossTeleporters.java',
  'FinalEmperialTomb.java': 'instances/FinalEmperialTomb/FinalEmperialTomb.java',
  'CavernOfThePirateCaptain.java': 'instances/CavernOfThePirateCaptain/CavernOfThePirateCaptain.java',
};
const aiText = f => (exists(path.join(AI_DIR, f)) ? fs.readFileSync(path.join(AI_DIR, f), 'utf8') : '');
const aiSrc = f => `${rel(path.join(AI_DIR, f))} (from ${AI_URL}${AI_PATHS[f]})`;
function aiConst(f, name) {
  const r = aiText(f).match(new RegExp('\\b' + name + '\\s*=\\s*(-?\\d+)'));
  return r ? +r[1] : null;
}
const countLocs = (f, name) => {
  const r = aiText(f).match(new RegExp(name + '\\s*=\\s*\\{([\\s\\S]*?)\\};'));
  return r ? (r[1].match(/new Location\(/g) || []).length : null;
};

// ---------------------------------------------------------------- skills + class trees -> elemental nukes per class
const ELEM = { FIRE: 'fire', WATER: 'water', WIND: 'wind', EARTH: 'earth', HOLY: 'holy', UNHOLY: 'dark', DARK: 'dark' };
const NUKE_EFFECTS = new Set(['MagicalAttack', 'MagicalAttackRange', 'MagicalSoulAttack', 'MagicalAttackMp',
  'MagicalAttackByAbnormal', 'DeathLink', 'HpDrain', 'InstantMagicalAttackOverHit']);
const SKILL = {};
for (const f of fs.readdirSync(D('dp', 'skills')).filter(f => f.endsWith('.xml'))) {
  const t = fs.readFileSync(D('dp', 'skills', f), 'utf8');
  for (const m of t.matchAll(/<skill id="(\d+)"[^>]*?name="([^"]*)"[^>]*>([\s\S]*?)<\/skill>/g)) {
    const top = m[3].split(/<enchant\dEffects/)[0];
    const g = n => { const r = top.match(new RegExp('<set name="' + n + '" val="([^"]*)"')); return r ? r[1] : null; };
    const eff = [...top.matchAll(/<effect name="(\w+)"/g)].map(x => x[1]);
    SKILL[m[1]] = { id: +m[1], name: m[2], attr: g('attributeType'), op: g('operateType'), magic: g('isMagic'),
      scope: g('affectScope'), eff };
  }
}
const isNuke = s => s && s.attr && ELEM[s.attr] && s.op === 'A1' && s.magic && s.magic !== '0' && s.eff.some(e => NUKE_EFFECTS.has(e));

const PARENT = {}; const TREE = {}; // classId -> [{id, lvl}]
for (const f of ['classSkillTree.xml', 'highFiveNewClassSkillTree.xml']) {
  const p = D('dp', f);
  if (!exists(p)) continue;
  const t = fs.readFileSync(p, 'utf8');
  for (const m of t.matchAll(/<skillTree type="classSkillTree" classId="(\d+)"(?: parentClassId="(\d+)")?[^>]*>([\s\S]*?)<\/skillTree>/g)) {
    const c = +m[1];
    if (m[2] != null) PARENT[c] = +m[2];
    TREE[c] = TREE[c] || [];
    for (const s of m[3].matchAll(/<skill skillName="[^"]*" skillId="(\d+)" skillLvl="\d+" getLevel="(\d+)"/g)) TREE[c].push({ id: +s[1], lvl: +s[2] });
  }
}
const chain = c => { const out = []; let x = c; const seen = new Set(); while (x != null && !seen.has(x)) { seen.add(x); out.push(x); x = PARENT[x]; } return out; };
// classNukes[classId][element] = [{id,name,lvl,aoe}] (own + inherited)
const classNukes = {};
const nukeIndex = {}; // skill name -> {id, element, aoe, classes:{name:lvl}}
for (const cStr of Object.keys(CLASSES)) {
  const c = +cStr;
  const per = {};
  for (const anc of chain(c)) for (const e of TREE[anc] || []) {
    const s = SKILL[e.id];
    if (!isNuke(s)) continue;
    const el = ELEM[s.attr];
    per[el] = per[el] || {};
    if (!per[el][s.id] || per[el][s.id].lvl > e.lvl) per[el][s.id] = { id: s.id, name: s.name, lvl: e.lvl, aoe: s.scope && s.scope !== 'SINGLE' };
  }
  classNukes[c] = {};
  for (const el of Object.keys(per)) {
    classNukes[c][el] = Object.values(per[el]).sort((a, b) => a.lvl - b.lvl);
    for (const s of classNukes[c][el]) {
      const k = s.name;
      nukeIndex[k] = nukeIndex[k] || { id: s.id, element: el, aoe: !!s.aoe, classes: {} };
      const prev = nukeIndex[k].classes[cn(c)];
      if (prev == null || prev > s.lvl) nukeIndex[k].classes[cn(c)] = s.lvl;
    }
  }
}
const ELEMENTS = ['fire', 'water', 'wind', 'earth', 'holy', 'dark'];
// A class is an element nuker for E when it learns at least one NON-generic nuke of E (generic = learned by >= 11 classes:
// Wind Strike, Vampiric Touch, Flame Strike, Drain Health, Disrupt Undead (undead only), Kamael basics) and E is at least half as
// strong in its kit as its main element (count of non-generic nukes). Healers/buffers are listed too (e.g. Bishop: holy) but the
// compositions only take nuker-role classes.
const GENERIC_MIN_CLASSES = 11;
const isGeneric = name => Object.keys(nukeIndex[name].classes).length >= GENERIC_MIN_CLASSES;
const casterIds = new Set([...ROLE_DEF.nuker.ids, ...ROLE_DEF.summoner.ids, ...ROLE_DEF.healer.ids, ...ROLE_DEF.buffer.ids,
  10, 25, 38, 49, 11, 26, 39]);
const elementNukers = {};
const elementNukerLevel = {}; // el -> className -> level of its first non-generic nuke of that element
for (const el of ELEMENTS) { elementNukers[el] = []; elementNukerLevel[el] = {}; }
for (const cStr of Object.keys(CLASSES)) {
  const c = +cStr;
  if (!casterIds.has(c) || !classNukes[c]) continue;
  const own = {};
  for (const el of ELEMENTS) own[el] = ((classNukes[c][el]) || []).filter(x => !isGeneric(x.name));
  const best = Math.max(...ELEMENTS.map(el => own[el].length));
  if (!best) continue;
  for (const el of ELEMENTS) {
    if (!own[el].length || own[el].length * 2 < best) continue;
    elementNukers[el].push(cn(c));
    elementNukerLevel[el][cn(c)] = own[el][0].lvl;
  }
}

// ---------------------------------------------------------------- raid boss list, spawns
const RB = readJson(D('raidbosses_h5.json'));
const RBMAP = {}; for (const b of RB.bosses) RBMAP[b.id] = b;
const SPAWNS = readJson(D('spawns_h5.json'));
const spawnCount = id => SPAWNS.filter(s => s.id === id).reduce((n, s) => n + (s.count || 1), 0);

// ---------------------------------------------------------------- helpers
function weakAvoid(d) {
  if (!d) return { weakTo: null, avoidElement: null };
  const vals = ELEMENTS.filter(k => d[k] != null);
  if (!vals.length) return { weakTo: null, avoidElement: null };
  const min = Math.min(...vals.map(k => d[k])), max = Math.max(...vals.map(k => d[k]));
  if (min === max) return { weakTo: null, avoidElement: null };
  const lo = vals.filter(k => d[k] === min), hi = vals.filter(k => d[k] === max);
  // a tie of 3+ elements is no real weakness / no real resistance (e.g. Baium: 5 x 20, dark 53 -> weakTo null, avoid dark)
  const pick = set => (set.length === 1 ? set[0] : set.length === 2 ? set : null);
  return { weakTo: pick(lo), avoidElement: pick(hi) };
}
const classesForRole = (role, maxLevel) => ROLE_DEF[role].ids.filter(i => TIER_LEVEL[TIER[i] || 0] <= maxLevel).map(cn);
function nukersFor(el, maxLevel, avoid) {
  if (typeof el === 'string') {
    return ROLE_DEF.nuker.ids.filter(i => TIER_LEVEL[TIER[i] || 0] <= maxLevel).map(cn)
      .filter(n => elementNukerLevel[el][n] != null && elementNukerLevel[el][n] <= maxLevel);
  }
  const bad = new Set([].concat(avoid || []));
  return ROLE_DEF.nuker.ids.filter(i => TIER_LEVEL[TIER[i] || 0] <= maxLevel).map(cn)
    .filter(n => ![...bad].some(b => elementNukers[b] && elementNukers[b].includes(n) && !ELEMENTS.filter(e => !bad.has(e)).some(e => elementNukers[e].includes(n))));
}
function summonersFor(maxLevel) { return classesForRole('summoner', maxLevel); }

// minion records from raidbosses_h5 strings ("Dementia Beast x3") + datapack <minions>
function minionsFromData(id) {
  const n = NPC[id];
  const out = [];
  if (n && n.minions.length) for (const m of n.minions) out.push({ id: m.id, name: npcName(m.id), level: npcLevel(m.id), count: m.count });
  else if (RBMAP[id] && RBMAP[id].minions) for (const s of RBMAP[id].minions) {
    const r = String(s).match(/^(.*?)\s+x(\d+)$/);
    const name = r ? r[1] : String(s);
    const hit = Object.values(NPC).find(x => x.name === name);
    out.push({ id: hit ? hit.id : null, name, level: hit ? hit.level : null, count: r ? +r[2] : null });
  }
  return out;
}
const healerMinion = id => NPC[id] && NPC[id].skills.some(s => /heal/i.test(s.name || ''));

// ---------------------------------------------------------------- composition
// One 9-man party per 9 people. Element-weak boss: fire/water/... nukers + a summoner (user idea: "Queen Ant: sorcerers + summoner + tank").
function composition({ people, weak, avoid, maxLevel, minionCount, epic }) {
  const parties = Math.max(1, Math.ceil(people / 9));
  const single = typeof weak === 'string';
  const roles = [];
  const add = (role, count, classes, job) => { if (count > 0) roles.push({ role, count, classes, job }); };
  const minionTanks = minionCount >= 4 ? Math.max(1, Math.floor(parties / 2)) : 0;
  add('tank', parties + minionTanks, classesForRole('tank', maxLevel),
    minionTanks ? `${parties} boss tank(s) + ${minionTanks} minion tank(s): keep the boss turned away from the group, pull and hold every minion away from the boss`
      : (minionCount ? 'holds the boss and pulls every minion to himself, away from the boss and the healers' : 'holds the boss, keeps it facing away from the group'));
  add('healer', parties * 2, classesForRole('healer', maxLevel), 'heal only (team rule): main healer on the tanks, second on the group; no res scrolls in a raid');
  add('buffer', parties, classesForRole('buffer', maxLevel), 'class buffs/chants the board lacks; Doomcryer: Chant of Victory + Magnus when learned');
  if (single) {
    const nukers = nukersFor(weak, maxLevel);
    const n = nukers.length ? 4 : 2;
    add('nuker', parties * n, nukers.length ? nukers : nukersFor(null, maxLevel, avoid),
      nukers.length ? `${weak} skills ONLY (boss defence ${weak} is the lowest)` : `no ${weak} nuke class at this level: any element except ${[].concat(avoid || []).join('/') || 'none'}`);
    add('summoner', parties, summonersFor(maxLevel), minionCount ? 'servitor on the minions, master stays back (and heals the servitor)' : 'servitor adds damage on the boss from behind');
    add('melee', parties * (nukers.length ? 0 : 2), classesForRole('melee', maxLevel), 'physical damage from behind the boss');
  } else {
    add('nuker', parties * 2, nukersFor(null, maxLevel, avoid),
      avoid ? `any element except ${[].concat(avoid).join('/')} (highest boss defence)` : 'no element weakness: strongest nukes');
    add('melee', parties * 2, classesForRole('melee', maxLevel), 'physical damage from behind the boss (Destroyers: drain + Frenzy opening)');
    add('archer', parties, classesForRole('archer', maxLevel), 'ranged damage; pulls single minions to the tank');
  }
  // never more than the parties hold: trim archer -> melee -> summoner -> nuker
  const cap = parties * 9;
  for (const role of ['archer', 'melee', 'summoner', 'nuker']) {
    let over = roles.reduce((n, r) => n + r.count, 0) - cap;
    const r = roles.find(x => x.role === role);
    if (over > 0 && r) { const cut = Math.min(over, r.count - (role === 'nuker' ? 1 : 0)); r.count -= cut; }
  }
  for (let i = roles.length - 1; i >= 0; i--) if (roles[i].count <= 0) roles.splice(i, 1);
  const total = roles.reduce((n, r) => n + r.count, 0);
  if (epic && total < people) {
    // fill up with damage dealers of the right kind
    const r = roles.find(x => x.role === 'nuker') || roles.find(x => x.role === 'melee');
    if (r) r.count += people - total;
  }
  return { parties, roles };
}

// ---------------------------------------------------------------- epic data (curated, cross-checked against the AI scripts)
const ITEM = { portalStone: aiConst('Antharas.java', 'STONE'), floatingStone: aiConst('GrandBossTeleporters.java', 'VACUALITE_FLOATING_STONE'),
  fabric: aiConst('Baium.java', 'FABRIC') };
const ZAKEN = {
  pathfinder: aiConst('CavernOfThePirateCaptain.java', 'PATHFINDER'),
  min60: aiConst('CavernOfThePirateCaptain.java', 'MIN_LV_60'), min83: aiConst('CavernOfThePirateCaptain.java', 'MIN_LV_83'),
  p60min: aiConst('CavernOfThePirateCaptain.java', 'PLAYERS_60_MIN'), p60max: aiConst('CavernOfThePirateCaptain.java', 'PLAYERS_60_MAX'),
  p83min: aiConst('CavernOfThePirateCaptain.java', 'PLAYERS_83_MIN'), p83max: aiConst('CavernOfThePirateCaptain.java', 'PLAYERS_83_MAX'),
};
const FRIN = { min: aiConst('FinalEmperialTomb.java', 'MIN_PLAYERS'), max: aiConst('FinalEmperialTomb.java', 'MAX_PLAYERS'),
  guide: aiConst('FinalEmperialTomb.java', 'GUIDE'), dewdrop: aiConst('FinalEmperialTomb.java', 'DEWDROP_OF_DESTRUCTION_ITEM_ID') };
const FRIN_SCROLL = /getItemByItemId\((\d+)\)/.exec(aiText('FinalEmperialTomb.java'));
const FRIN_LVL = /channelMember\.getLevel\(\) < (\d+)/.exec(aiText('FinalEmperialTomb.java'));
const ANTH_MAX = aiConst('Antharas.java', 'MAX_PEOPLE');
const BAIUM_ARCH = countLocs('Baium.java', 'ARCHANGEL_LOC');

// L2J L2CommandChannel.meetRaidWarCondition (gameserver, not in the datapack): loot goes to a command channel only when it has MORE than N members
const CC_LOOT = { 29001: 36, 29006: 36, 29014: 36, 29022: 36, 29020: 56, 29019: 225, 29028: 99 };
const CC_LOOT_DEFAULT = 18;

const EPIC = [
  { id: 29001, people: 18,
    where: 'The Ant Nest (Wasteland, south of Gludio); queen room at -21610,181594,-5734. Teleport: Gludio gatekeeper -> The Ant Nest (live menu name; datapack "Ant Cave").',
    entry: 'Open world (no item, no instance). Walk through the Ant Nest to the queen room.',
    minions: [{ id: 29002, count: 1, note: 'Queen Ant Larva: immortal, immobile (QueenAnt.java setIsMortal(false)) — ignore it' },
      { id: 29003, count: null, note: 'Nurse Ant: heals the Queen and the Larva every 2 s (QueenAnt.java HEAL timer)' },
      { id: 29005, count: null, note: 'Court Guard Ant (royal guard), raid minion' },
      { id: 29004, count: 'spawnlist', note: 'Guard Ant: lair guards' }],
    tactics: [
      'Kill every Nurse Ant first — they heal the Queen (Heal Queen Ant 4020/4024) as long as one lives.',
      'Tank pulls the Court Guard Ants off the group and holds them; AoE / summoner kills them after the nurses.',
      'Ignore the Larva (immortal).',
      'Casters stand 500-900 from the Queen: she casts Decrease Speed on attackers > 150 away and Queen Ant Brandish at < 250.',
      'Fire nukes only: datapack fire defence -83 (all others 20).',
      'QueenAnt.java curses anyone more than 8 levels above her inside the zone: mages get Raid Curse - Silence, fighters Raid Curse - Stone.',
    ],
    verify: ['Nurse Ant / Court Guard Ant counts are not in this datapack (spawned as the Queen\'s privates server-side); classic values are 4 nurses + 8 royal guards.'] },
  { id: 29006, people: 18,
    where: 'Cruma Tower, Core\'s room at 17726,108915,-6480 (below the tower). Teleport: Dion gatekeeper -> Cruma Tower.',
    entry: 'Open world. Through Cruma Tower to the core room (teleport device inside the tower).',
    minions: [{ id: 29007, count: 10, note: 'Death Knight (Core.java spawns 2 rows of 5)' },
      { id: 29008, count: 5, note: 'Doom Wraith' }, { id: 29011, count: 4, note: 'Susceptor' }],
    tactics: [
      'Core spawns with 10 Death Knights, 5 Doom Wraiths and 4 Susceptors (Core.java): the tanks gather them away from Core, AoE + summoners clear them first.',
      'Minions respawn while Core lives (Core.java respawns killed minions) — keep the tank on them and burn Core once the room is under control.',
      'No element weakness (all defences 20): any nuke, physical DPS is fine.',
    ],
    verify: ['Exact way into the core room on L2Toggle (teleport device on Cruma Tower floor 3).'] },
  { id: 29014, people: 18,
    where: 'Sea of Spores (Oren). Spawns at one of 55024,17368 / 53504,21248 / 53248,24576; below 50 % HP she teleports to 43728,17220,-4342 (Orfen.java ORFEN_LOC_1). Teleport: Oren gatekeeper -> Sea of Spores.',
    entry: 'Open world.',
    minions: [{ id: 29015, count: 'spawnlist', note: 'Raikel' }, { id: 29016, count: null, note: 'Raikel Leos' },
      { id: 29018, count: 'spawnlist', note: 'Riba Iren: heals Orfen (Orfen.java S_ORFEN_HEAL)' }],
    tactics: [
      'Kill Riba Iren first: it heals Orfen whenever she is hurt.',
      'Below 50 % HP Orfen teleports to her nest at 43728,17220 — the whole team follows at once (it is a run), stay together.',
      'Fire nukes only (fire defence -83; wind 53 = avoid wind).',
      'Orfen Strike/Dispel (Orfen.java): rebuff after the fight, not during.',
    ],
    verify: ['Raikel Leos count (spawned as privates).'] },
  { id: 29022, people: 18,
    where: 'Devil\'s Isle / Zaken\'s ship (Cavern of the Pirate Captain).',
    entry: 'Night-time Zaken (lvl 60). The L2J H5 datapack used here has NO script for 29022 (only the daytime instance, see 29176/29181). Official H5: instance through the Pathfinder Worker at Zaken\'s ship, command channel.',
    minions: [{ id: 29023, count: null }, { id: 29024, count: null }, { id: 29026, count: null }, { id: 29027, count: null }],
    tactics: ['Same minion set as daytime Zaken (Doll Blader, Veil Master, Pirate Zombie Captain, Pirate Zombie): tank holds them, AoE clears.',
      'Undead: no element weakness except avoid dark (dark 53).'],
    verify: ['Whether L2Toggle runs night-time Zaken at all, its entry NPC, party/CC size and level limits.'] },
  { id: 29176, people: ZAKEN.p60min || 9, levelMin: ZAKEN.min60,
    where: 'Cavern of the Pirate Captain (Day Dream) instance — enter at the Pathfinder Worker (npc ' + ZAKEN.pathfinder + ') by Zaken\'s ship, Devil\'s Isle.',
    entry: `Instance "enter60" (CavernOfThePirateCaptain.java): party leader / CC leader enters, ${ZAKEN.p60min}-${ZAKEN.p60max} members, every member level >= ${ZAKEN.min60} and within 1000 of the leader, instance re-entry timer per member.`,
    minions: [{ id: 29023, count: null }, { id: 29024, count: null }, { id: 29026, count: null }, { id: 29027, count: null }],
    tactics: ['Find Zaken with the candles: Zaken\'s Candles light up red (wrong room) or blue (Zaken\'s room) when clicked.',
      'Each room has Doll Bladers, Veil Masters and Pirate Zombies: tank pulls them, AoE kills.',
      'Undead: avoid dark (dark defence 53), anything else is fine.'],
    verify: ['L2Toggle may change the instance limits; levels/members here are the datapack values.'] },
  { id: 29181, people: ZAKEN.p83min || 9, levelMin: ZAKEN.min83,
    where: 'Cavern of the Pirate Captain (Day Dream, high level) instance — Pathfinder Worker (npc ' + ZAKEN.pathfinder + ').',
    entry: `Instance "enter83": ${ZAKEN.p83min}-${ZAKEN.p83max} members, level >= ${ZAKEN.min83}, within 1000 of the leader.`,
    minions: [{ id: 29182, count: null }, { id: 29183, count: null }, { id: 29184, count: null }, { id: 29185, count: null }],
    tactics: ['Candle search as for the level 60 version.', 'Holy is the lowest defence (250 vs 300, dark 370): Bishop/Cardinal holy nukes help, never dark.'],
    verify: ['Raid curse for this instance boss follows the general raid rule (level 83 + 8 = 91 — not a limit in practice).'] },
  { id: 29020, people: 27,
    where: 'Tower of Insolence 14th floor (Baium\'s room 116033,17447,10107). Teleport: Aden -> Tower of Insolence, then up the tower to the 13th floor Angelic Vortex.',
    entry: `Each player needs Bloody Fabric (item ${ITEM.fabric}); the Angelic Vortex (npc 31862) takes one and teleports you in (Baium.java). Baium sleeps as a statue (npc 29025) until someone talks to it.`,
    minions: [{ id: 29021, count: BAIUM_ARCH, note: 'Archangels (Baium.java ARCHANGEL_LOC), they attack players and Baium\'s targets' }],
    tactics: [`Kill the ${BAIUM_ARCH} Archangels first — tanks pull them apart, the rest kill them one by one.`,
      'Baium: Earthquake, Striking of Thunderbolt and Group Stun (Baium.java) — spread out, healers out of melee range.',
      'The one who wakes Baium is killed at once (Baium\'s Gift) — use a throwaway character / the tank with full res support.',
      'Undead: avoid dark (dark 53); no single weakness.'],
    verify: ['How to obtain Bloody Fabric on L2Toggle (official: quest / from Fabric exchanged at the Angelic Vortex).'] },
  { id: 29068, people: 45,
    where: 'Antharas\' Lair (Dragon Valley); Heart of Warding (npc 13001) at the lair entrance. Teleport: Giran/Hunters -> Antharas\' Lair.',
    entry: `The party leader / CC leader with a Portal Stone (item ${ITEM.portalStone}, checked not consumed) talks to the Heart of Warding: members within 1000 go in, max ${ANTH_MAX} players in the zone (Antharas.java).`,
    minions: [{ id: 29069, count: null, note: 'Behemoth Dragon' }, { id: 29070, count: null, note: 'Dragon Bomber (self-destructs)' },
      { id: 29190, count: null, note: 'Tarask Dragon' }],
    tactics: ['Antharas spawns Behemoth Dragons, Dragon Bombers and Tarask Dragons in waves (Antharas.java): minion tanks pull them away; kill Bombers at range before they reach the healers.',
      'Fear, Stun, Fossilization, Meteor and breath attacks: spread the parties, keep healers far back.',
      'Wind nukes (wind defence 250, earth 370 = avoid earth). Antharas hits with earth 370: earth resistance helps.'],
    verify: ['Minion counts grow with time and players inside (Antharas.java minionMultipler) — no fixed numbers.',
      'meetRaidWarCondition lists Antharas as 29019 (> 225 members); 29068 then falls to the default (> 18). Check on L2Toggle.'] },
  { id: 29019, people: 45, variantOf: 29068,
    where: 'Old Antharas template (level 79). Not spawned by the H5 Antharas.java (it uses 29068).',
    entry: 'Not used in H5 (see 29068).', minions: [], tactics: ['See 29068.'],
    verify: ['Unused template in this datapack.'] },
  { id: 29066, people: 45, variantOf: 29068, where: 'Old Antharas (weak) template, not used by the H5 script.', entry: 'Not used in H5 (see 29068).', minions: [], tactics: ['See 29068.'], verify: ['Unused template in this datapack.'] },
  { id: 29067, people: 45, variantOf: 29068, where: 'Old Antharas (normal) template, not used by the H5 script.', entry: 'Not used in H5 (see 29068).', minions: [], tactics: ['See 29068.'], verify: ['Unused template in this datapack.'] },
  { id: 29028, people: 45,
    where: 'Lair of Valakas (Hall of Flames, Forge of the Gods). Watcher of Valakas Klein (npc 31540) at the volcano, Heart of Volcano (npc 31385) inside. Teleport: Goddard -> Forge of the Gods.',
    entry: `Each player needs a Vacualite Floating Stone (item ${ITEM.floatingStone}): Klein teleports you into the Hall of Flames, then the Heart of Volcano into the lair (GrandBossTeleporters.java); max 200 players, entry closes when the fight starts.`,
    minions: [],
    tactics: ['No minions; Valakas has huge AoE (Lava Skin, meteor-like AoE) — spread out, separate tank party in front, healers far back.',
      'Water nukes (water defence 250, fire 370 = never fire). Valakas hits with fire 370: fire resistance gear/buffs.',
      'Valakas regenerates when not attacked (Valakas.java regeneration levels): keep the damage constant.'],
    verify: ['How to obtain the Floating Stone on L2Toggle.'] },
  { id: 29045, cc: true, people: FRIN.min || 18, levelMin: FRIN_LVL ? +FRIN_LVL[1] : 80,
    where: 'Imperial Tomb (Last Imperial Tomb instance). Imperial Tomb Guide (npc ' + FRIN.guide + '). Teleport: Rune -> Imperial Tomb area.',
    entry: `Command channel REQUIRED (FinalEmperialTomb.java): only the CC leader enters, he must carry Frintezza's Magic Force Field Removal Scroll (item ${FRIN_SCROLL ? FRIN_SCROLL[1] : 8073}), CC ${FRIN.min}-${FRIN.max} members, everyone level >= ${FRIN_LVL ? FRIN_LVL[1] : 80} and within 1000.`,
    minions: [{ id: 29048, count: null, note: 'Evil Spirit (portraits)' }, { id: 29050, count: null, note: 'Breath of Halisha' }],
    tactics: ['Two halls of monsters (Hall Alarm devices, Dark Choir) before Frintezza\'s room.',
      'Kill the 4 portraits (Evil Spirits keep respawning from them) first; demons spawn every 20 s, max 24 (FinalEmperialTomb.java).',
      `Frintezza plays songs; Dewdrop of Destruction (item ${FRIN.dewdrop}) / Soul Breaking Arrow stop them.`,
      'Then Scarlet van Halisha (29046, then 29047 second form): holy nukes (holy 250), tanks rotate.',
      'Frintezza himself: earth nukes (earth 250, wind 370 = avoid wind).'],
    verify: ['Soul Breaking Arrow item id (skill 2234) not confirmed here.'] },
  { id: 29046, cc: true, people: FRIN.min || 18, levelMin: FRIN_LVL ? +FRIN_LVL[1] : 80, variantOf: 29045,
    where: 'Inside the Frintezza instance (first form of Scarlet van Halisha).', entry: 'See Frintezza 29045.',
    minions: [], tactics: ['Holy nukes (holy 250); dark 270 is still below 300 — avoid fire/water/wind/earth (300) only by preference.', 'Tank holds her away from Frintezza\'s songs area.'], verify: [] },
  { id: 29047, cc: true, people: FRIN.min || 18, levelMin: FRIN_LVL ? +FRIN_LVL[1] : 80, variantOf: 29045,
    where: 'Inside the Frintezza instance (second form of Scarlet van Halisha).', entry: 'See Frintezza 29045.',
    minions: [{ id: 29050, count: null, note: 'Breath of Halisha' }], tactics: ['Holy nukes (holy 250).', 'Second form hits harder and morphs again: healers on the tank, rotate tanks.'], verify: [] },
  { id: 29118, cc: 'unverified', people: 36,
    where: 'Steel Citadel (Hellbound), Beleth\'s room.', entry: 'Hellbound Steel Citadel; command channel. Beleth.java gives the kill/loot to the CC leader.',
    minions: [{ id: 29119, count: null, note: 'fake Beleth copies' }],
    tactics: ['Many fake Beleths: find and kill the real one; dark attack.', 'Holy nukes (holy 250, dark 370 = avoid dark).'],
    verify: ['Hellbound level, entry rules and CC size on L2Toggle.'] },
  { id: 29179, cc: 'unverified', people: 18, where: 'Ice Queen\'s Castle (Freya instance, Jinia / Kegor quest line).', entry: 'Instance; command channel.',
    minions: [], tactics: ['Fire nukes (fire 250, water 370 = avoid water).'], verify: ['Entry rules not checked (no script fetched).'] },
  { id: 29163, cc: 'unverified', people: 18, where: 'Seed of Destruction (Gracia).', entry: 'Seed of Destruction instance; command channel.',
    minions: [], tactics: ['Water nukes (water 150).'], verify: ['Entry rules not checked (no script fetched).'] },
  { id: 29150, cc: 'unverified', people: 18, where: 'Seed of Infinity — Heart of Infinity Attack (Gracia).', entry: 'Seed of Infinity instance; command channel.',
    minions: [], tactics: ['Holy nukes (holy 150, dark 250 = avoid dark).'], verify: ['Entry rules not checked (no script fetched).'] },
];

// ---------------------------------------------------------------- build
function buildRecord(id, cur) {
  const n = NPC[id];
  const rb = RBMAP[id];
  const level = (n && n.level) || (rb && rb.level) || npcLevel(id);
  const name = (n && n.name) || (rb && rb.name) || npcName(id);
  const epic = !!cur || (rb && rb.type !== 'raid') || (n && n.type === 'L2GrandBoss');
  const attrDefence = n ? n.attrDefence : null;
  const { weakTo, avoidElement } = weakAvoid(attrDefence);
  const sources = [];
  const verify = [];
  if (n) sources.push(`attrDefence/attackElement/race/minions: ${npcFiles.find(f => {
    const base = path.basename(f, '.xml').split('-').map(Number); return id >= base[0] && id <= base[1];
  }) || 'npcstats'}`);
  else verify.push('npc not found in the local datapack xml (no element data)');

  // minions
  let minions;
  if (cur && cur.minions) {
    minions = cur.minions.map(m => {
      let count = m.count;
      if (count === 'spawnlist') { count = spawnCount(m.id) || null; if (count) sources.push(`${npcName(m.id)} count: Scripts/data/spawns_h5.json`); }
      return { id: m.id, name: npcName(m.id), level: npcLevel(m.id), count, ...(m.note ? { note: m.note } : {}) };
    });
  } else minions = minionsFromData(id);
  if (minions.length && !cur) sources.push(n && n.minions.length ? 'minions: datapack <minions name="Privates">' : 'minions: Scripts/data/raidbosses_h5.json');
  const minionCount = minions.reduce((s, m) => s + (typeof m.count === 'number' ? m.count : 3), 0);

  // level window
  const curse = rb && rb.curseLevel != null ? rb.curseLevel : level;
  const levelWindow = {
    min: cur && cur.levelMin != null ? cur.levelMin
      : (rb && rb.recommendedPartyLevel ? rb.recommendedPartyLevel.min : Math.max(1, level - 3)),
    max: Math.min(level, curse) + 8,
  };
  if (rb && rb.recommendedPartyLevel) sources.push('levelWindow.min: raidbosses_h5.json recommendedPartyLevel' + (cur && cur.levelMin != null ? ' (overridden by the instance minimum level)' : ''));
  if (curse < level) levelWindow.note = `max = lowest minion level ${curse} + 8 (minions curse too)`;

  const people = cur ? cur.people : 9;
  const comp = composition({ people, weak: weakTo, avoid: avoidElement, maxLevel: levelWindow.max, minionCount, epic });

  // tactics
  const tactics = [];
  if (cur && cur.tactics) tactics.push(...cur.tactics);
  else {
    tactics.push('Stage ~1500 from the boss, clear every other monster within 2000 first, countdown, then the tank pulls (raid rules).');
    if (minions.length) {
      const healers = minions.filter(m => m.id && healerMinion(m.id)).map(m => m.name);
      if (healers.length) tactics.push(`Kill ${[...new Set(healers)].join(', ')} first (heals the boss).`);
      tactics.push(`Tank pulls and holds ALL minions (${minions.map(m => m.name + (m.count ? ' x' + m.count : '')).join(', ')}) away from the boss; damage dealers kill minions first, lowest HP first.`);
    }
    if (typeof weakTo === 'string') tactics.push(`Nukers use ${weakTo} skills only (defence ${weakTo} ${attrDefence[weakTo]} = lowest).`);
    if (avoidElement) tactics.push(`Never ${[].concat(avoidElement).join('/')} attacks (highest defence).`);
  }
  if (n && n.attackElement) tactics.push(`Boss attacks with ${n.attackElement.type} (${n.attackElement.value}): ${n.attackElement.type} resistance helps the tank.`);
  tactics.push(`Raid curse: nobody above level ${levelWindow.max} (L2J petrifies/silences attackers more than 8 levels above the boss${curse < level ? ' or its minions' : ''}).`);

  let elementSkills = null;
  if (typeof weakTo === 'string') {
    elementSkills = {};
    elementSkills[weakTo] = Object.keys(nukeIndex).filter(k => nukeIndex[k].element === weakTo
      && Object.entries(nukeIndex[k].classes).some(([c, l]) => l <= levelWindow.max && casterIds.has(+Object.keys(CLASSES).find(i => CLASSES[i] === c))))
      .sort((a, b) => Math.min(...Object.values(nukeIndex[a].classes)) - Math.min(...Object.values(nukeIndex[b].classes)));
    if (!elementSkills[weakTo].length) { elementSkills = null; verify.push(`no player class has ${weakTo} nukes in H5 (datapack skill trees): use any element except the avoided one`); }
    else sources.push('elementSkills: Scripts/data/dp/skills/*.xml (attributeType + MagicalAttack effect, operateType A1) x dp/classSkillTree.xml (getLevel <= levelWindow.max)');
  }

  let where;
  if (cur && cur.where) where = cur.where;
  else if (rb) {
    const t = rb.nearestTeleport;
    where = [rb.zoneName || null, rb.near ? 'near ' + rb.near : null, t ? `teleport ${t.desc}` + (t.walkDist ? ` then walk ~${Math.round(t.walkDist / 1000)} km` : '') : null,
      rb.x != null ? `boss at ${rb.x},${rb.y},${rb.z}` : null].filter(Boolean).join('; ');
    sources.push('where: Scripts/data/raidbosses_h5.json');
  } else where = null;

  const entry = cur && cur.entry ? cur.entry : 'Open world (raid boss spawn, no item needed).';
  if (cur) {
    for (const f of Object.keys(AI_PATHS)) if (aiText(f) && new RegExp('\\b' + id + '\\b').test(aiText(f))) sources.push('entry/minions/tactics: ' + aiSrc(f));
    if (cur.verify) verify.push(...cur.verify);
  }
  const ccNeeded = !!(cur && cur.cc);
  if (cur && cur.cc === 'unverified') verify.push('command channel assumed for entry (official H5), not checked against a script');
  if (epic && CC_LOOT[id] == null) verify.push(`ccLootMembers ${CC_LOOT_DEFAULT} is the L2J default for ids not listed in L2CommandChannel.meetRaidWarCondition`);
  sources.push('ccLootMembers: L2J gameserver L2CommandChannel.meetRaidWarCondition (from memory of the L2J source, not in this datapack)');
  if (epic && !cur) verify.push('no curated epic data for this boss');
  if (people > 9 && cur && !/script|java/i.test(String(cur.entry))) verify.push(`minPeople ${people} is an estimate`);

  return {
    id, name, ...(n && n.title ? { title: n.title } : {}), level, epic, ...(cur && cur.variantOf ? { variantOf: cur.variantOf } : {}),
    race: n ? n.race : null, hp: n ? n.hp : (rb ? rb.hp : null),
    where, entry,
    levelWindow,
    attrDefence, attackElement: n ? n.attackElement : null,
    weakTo, avoidElement,
    minions,
    ccNeeded,
    ccLootMembers: CC_LOOT[id] != null ? CC_LOOT[id] : CC_LOOT_DEFAULT,
    minPeople: people,
    parties: comp.parties,
    composition: comp.roles,
    tactics,
    ...(elementSkills ? { elementSkills } : {}),
    sources: [...new Set(sources)],
    verify: [...new Set(verify)],
  };
}

const bosses = {};
for (const e of EPIC) bosses[String(e.id)] = buildRecord(e.id, e);
const raids = RB.bosses.filter(b => !bosses[String(b.id)]).sort((a, b) => (b.type !== 'raid') - (a.type !== 'raid') || a.level - b.level || a.id - b.id);
for (const b of raids) bosses[String(b.id)] = buildRecord(b.id, null);

const roles = {};
for (const [k, v] of Object.entries(ROLE_DEF)) roles[k] = { description: v.description, classes: v.ids.map(cn) };

const out = {
  note: 'Raid-team TEMPLATE per raid / grand boss (key = npc id). Element defences, attack element, race and minions come from the L2J High Five '
    + 'datapack npc xml (Scripts/data/npcstats + Scripts/data/dp/npcs), grand boss entry rules from the datapack AI scripts in Scripts/data/dp/npcs/ai, '
    + 'element nukes from dp/skills x dp/classSkillTree. weakTo = element with the LOWEST defence (string; an array on ties; null when all are equal), '
    + 'avoidElement = highest defence. levelWindow.max = boss (or lowest minion) level + 8 (raid curse). ccLootMembers = a command channel gets the loot '
    + 'only with MORE than this many members (L2J L2CommandChannel.meetRaidWarCondition). composition = per role count + fitting classes '
    + '(client class names = Me.ClassName, Dashboard/data/classes.json), only classes reachable at levelWindow.max. L2Toggle may differ from the datapack: see "verify". '
    + 'Regenerate: node docs/plan/tools/raid_templates.js (offline; --print shows the epic table).',
  generated: new Date().toISOString(),
  classNames: CLASSES,
  roles,
  elementNukers,
  elementNukerFirstLevel: elementNukerLevel,
  elementSkillIndex: nukeIndex,
  bosses,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`wrote ${rel(OUT)}: ${Object.keys(bosses).length} bosses (${Object.values(bosses).filter(b => b.epic).length} epic/grand)`);

if (process.argv.includes('--print')) {
  for (const b of Object.values(bosses).filter(b => b.epic)) {
    const d = b.attrDefence ? ELEMENTS.map(k => k[0].toUpperCase() + k.slice(1, 2) + ' ' + b.attrDefence[k]).join(' ') : '-';
    console.log(`${String(b.id).padEnd(6)} ${b.name.padEnd(20)} L${String(b.level).padEnd(3)} weak=${JSON.stringify(b.weakTo).padEnd(28)} ${d} | min ${b.minions.map(m => m.name + (m.count ? 'x' + m.count : '')).join(', ') || '-'} | people ${b.minPeople} cc=${b.ccNeeded} ccLoot>${b.ccLootMembers}`);
  }
}
