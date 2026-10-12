#!/usr/bin/env node
// SKILL ENCHANT DATA (user 2026-10-12: "add the skill enchant for each chars skills", forum topic 2753 "Skill Enchant Table").
// Builds Scripts/data/skill_enchant.json (GENERATED - do not edit; run this tool again) and, with --plan, Scripts/data/skill_enchant_plan.json
// (the bots' compact per-character plan, see Dashboard/skillenchant_logic.js buildPlanFile).
//
// Sources (every value carries its tag in meta.tags):
//   DATAPACK  L2J High Five datapack (github.com/Shagooh/l2j-server-datapack): Scripts/data/dp/enchantSkillGroups.xml (SP / adena / chance
//             per +level and character level 76-85), Scripts/data/dp/skills/*.xml (enchantGroupN = route N uses group G; base max level;
//             kind of skill from operateType / effects), Scripts/data/dp/classSkillTree.xml (who learns the skill, at which character level),
//             multisell/ + buylists/ (where the Giant's Codex books come from).
//   SERVER    L2J game server code (Shagooh/l2j-server-game): RequestExEnchantSkill (+Safe / Untrain / RouteChange), L2EnchantSkillGroup.getRate,
//             L2EnchantSkillLearn.getMinSkillLevel, config NormalEnchantCostMultipiler=1, SafeEnchantCostMultipiler=5, EnchantSkillSpBookNeeded=True.
//   CLIENT    L2Swarm Data/base.db (ZIP) entry "Skills": route names (ENCH_DESCR "+N <route>") and the per-level effect text (ENCH_WITH_DESCR).
//   GUIDE     forum https://community.lineage2toggle.com/index.php?/topic/2753-skill-enchant-table/ (yoyoyaya 2024-12-03, two images, no text,
//             no replies; transcribed cell by cell). Every shaded cell equals the datapack except 2nd-class +24 @ level 85 (forum 51, datapack 46).
//   INFERRED  the "kind" of a skill and the route recommendation rules (Dashboard/skillenchant_logic.js).
// L2Toggle itself was NOT verified live (nobody is level 76 yet).
//
// Usage: node docs/plan/tools/skill_enchant.js [--root C:\L2Swarm] [--out <file>] [--plan] [--plan-only] [--check]
//   --plan       also write Scripts/data/skill_enchant_plan.json from swarm.config.json + Logs/swarm_state_*.json + skill_enchant_settings.json
//   --plan-only  only the plan (the data file must exist)
//   --check      print a short summary + the forum/datapack comparison, write nothing
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ROOT = path.resolve(opt('--root') || path.join(__dirname, '..', '..', '..'));
const DATA = path.join(ROOT, 'Scripts', 'data'), DP = path.join(DATA, 'dp'), DASH = path.join(ROOT, 'Dashboard');
const OUT = opt('--out') || path.join(DATA, 'skill_enchant.json');
const CHECK = argv.includes('--check'), PLAN = argv.includes('--plan') || argv.includes('--plan-only'), PLAN_ONLY = argv.includes('--plan-only');
const L = require(path.join(DASH, 'skillenchant_logic.js'));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return d; } };
const attrs = (s) => { const o = {}; String(s).replace(/(\w+)="([^"]*)"/g, (_, k, v) => (o[k] = v)); return o; };
const LV = L.LEVELS;   // [76..85]

// ---------------------------------------------------------------------------------------------------------------- GUIDE: forum images
// null = empty cell, 'w:N' = white unshaded cell with N % (its meaning is not stated in the post; INFERRED "not worth it" marker)
const FORUM_2ND = [
  [82, 92, 97, 97, 97, null, 97, 97, 97, 97], [80, 90, 95, 95, 95, 95, 95, 95, 95, 95], [78, 88, 93, 93, 93, 93, 93, 93, 93, 93],
  [52, 76, 86, 91, 91, 91, 91, 91, 91, 91], [50, 74, 84, 89, 89, 89, 89, 89, 89, 89], [48, 72, 82, 87, 87, 87, 87, 87, 87, 87],
  ['w:6', 46, 70, 80, 85, 85, 85, 85, 85, 85], ['w:6', 44, 68, 78, 83, 83, 83, 83, 83, 83], ['w:6', 42, 66, 76, 81, 81, 81, 81, 81, 81],
  ['w:2', 'w:6', 40, 64, 74, 79, 79, 79, 79, 79], [null, null, 38, 62, 72, 77, 77, 77, 77, 77], [null, null, 36, 60, 70, 75, 75, 75, 75, 75],
  [null, null, 'w:6', 34, 58, 68, 73, 73, 73, 73], [null, null, 'w:6', 32, 56, 66, 71, 71, 71, 71], [null, null, 'w:6', 30, 54, 64, 69, 69, 69, 69],
  [null, null, 'w:2', 'w:2', 28, 52, 62, 67, 67, 67], [null, null, null, null, 26, 50, 60, 65, 65, 65], [null, null, null, null, 24, 48, 58, 63, 63, 63],
  [null, null, null, null, 'w:2', 22, 46, 56, 61, 61], [null, null, null, null, null, 20, 44, 54, 59, 59], [null, null, null, null, null, 18, 42, 52, 57, 57],
  [null, null, null, null, null, 'w:1', 16, 40, 50, 55], [null, null, null, null, null, null, 14, 38, 48, 53], [null, null, null, null, null, null, 12, 36, 46, 51],
  [null, null, null, null, null, null, 'w:1', 10, 34, 44], [null, null, null, null, null, null, null, 8, 32, 42], [null, null, null, null, null, null, null, 6, 30, 40],
  [null, null, null, null, null, null, null, 'w:1', 4, 28], [null, null, null, null, null, null, null, null, 2, 26], [null, null, null, null, null, null, null, null, 1, 24],
];
const FORUM_3RD = [
  [18, 28, 38, 48, 58, 82, 92, 97, 97, 97], ['w:2', 'w:1', 'w:1', 46, 56, 80, 90, 95, 95, 95], [null, null, null, 'w:1', 54, 78, 88, 93, 93, 93],
  [null, null, null, null, 42, 52, 76, 86, 91, 91], [null, null, null, null, 'w:1', 50, 74, 84, 89, 89], [null, null, null, null, null, 48, 72, 82, 87, 87],
  [null, null, null, null, null, 'w:1', 46, 70, 80, 85], [null, null, null, null, null, null, 44, 68, 78, 83], [null, null, null, null, null, null, 42, 66, 76, 81],
  [null, null, null, null, null, null, 'w:1', 40, 64, 74], [null, null, null, null, null, null, null, 38, 62, 72], [null, null, null, null, null, null, null, 36, 60, 70],
  [null, null, null, null, null, null, null, 'w:1', 34, 58], [null, null, null, null, null, null, null, null, 32, 56], [null, null, null, null, null, null, null, null, 30, 54],
];
const FORUM_OF_GROUP = { 1: '2nd', 2: '2nd', 5: '3rd', 6: '3rd' };   // forum table <-> datapack group (identical chances, see compare())

// ---------------------------------------------------------------------------------------------------------------- CLIENT: base.db (ZIP)
function zipEntry(file, wanted) {
  const b = fs.readFileSync(file);
  let eocd = -1; for (let i = b.length - 22; i >= Math.max(0, b.length - 70000); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(file + ': not a ZIP');
  const n = b.readUInt16LE(eocd + 10); let p = b.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) break;
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nl);
    if (name === wanted) {
      const ln = b.readUInt16LE(off + 26), le = b.readUInt16LE(off + 28), d = b.subarray(off + 30 + ln + le, off + 30 + ln + le + csize);
      return (method === 8 ? zlib.inflateRawSync(d) : d).toString('utf8');
    }
    p += 46 + nl + el + cl;
  }
  return null;
}
/** id -> { base: {row at the max base level}, routes: { route: { name, steps: [text per +level], max } } } */
function clientSkills() {
  let txt = null;
  try { txt = zipEntry(path.join(ROOT, 'Data', 'base.db'), 'Skills'); } catch (e) { console.log('base.db:', e.message); }
  if (!txt) { const alt = opt('--skills-txt'); if (alt) txt = fs.readFileSync(alt, 'utf8'); }
  if (!txt) throw new Error('no client skill data (Data/base.db entry "Skills"); pass --skills-txt <file>');
  const lines = txt.split(/\r?\n/), head = lines[0].split('=');           // _ID=ID=LEVEL=OPERATE_TYPE=...; rows: key=OPERATE_TYPE=...
  const col = (name) => head.indexOf(name) - 2;
  const C = { op: col('OPERATE_TYPE'), name: col('NAME'), icon: col('ICON'), desc: col('DESCRIPTION'), ed: col('ENCH_DESCR'), ew: col('ENCH_WITH_DESCR'), debuff: col('IS_DEBUFF'), magic: col('IS_MAGIC'), target: col('TARGET_TYPE'), ep: col('EFFECT_POINT'), atime: col('ABNORMAL_TIME'), scope: col('AFFECT_SCOPE') };
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]; if (!line) continue;
    const f = line.split('='), key = +f[0]; if (!Number.isFinite(key)) continue;
    const id = Math.floor(key / 65536), lvl = key % 65536;
    const s = out[id] || (out[id] = { rows: {}, routes: {} });
    if (lvl < 100) { s.rows[lvl] = { op: f[C.op], name: f[C.name], icon: f[C.icon], debuff: f[C.debuff] === '1', magic: f[C.magic], target: f[C.target], ep: +f[C.ep] || 0, atime: +f[C.atime] || 0, scope: f[C.scope] }; continue; }
    const route = Math.floor(lvl / 100), plus = lvl % 100; if (!plus) continue;
    const r = s.routes[route] || (s.routes[route] = { name: '', steps: [], max: 0 });
    const ed = String(f[C.ed] || '').trim();
    const m = ed.match(/^\+(\d+)\s+(.*)$/), m2 = ed.match(/^(.*?)\s+\+(\d+)$/);   // "+1 Power" (most) or "Power +1" (Prominence, Aura Flare)
    if (!r.name && (m || m2)) r.name = (m ? m[2] : m2[1]).trim();
    r.steps[plus - 1] = String(f[C.ew] || '').trim();
    if (plus > r.max) r.max = plus;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- DATAPACK
function groupsFromXml() {
  const gx = fs.readFileSync(path.join(DP, 'enchantSkillGroups.xml'), 'utf8');
  const groups = {};
  gx.replace(/<!--\s*(.*?)\s*-->\s*<group id="(\d+)">([\s\S]*?)<\/group>/g, (_, c, id, body) => {
    const lv = [];
    body.replace(/<enchant ([^>]*)\/>/g, (__, a) => { const o = attrs(a); lv.push({ plus: +o.level, sp: +o.sp, adena: +o.adena, exp: +o.exp, chance: LV.map(l => +(o['chance' + l] || 0)) }); });
    lv.sort((a, b) => a.plus - b.plus);
    groups[id] = { id: +id, name: c, table: FORUM_OF_GROUP[id] || null, maxEnchant: lv.length, levels: lv };
  });
  if (Object.keys(groups).length < 4) throw new Error('enchantSkillGroups.xml: expected 4 groups, got ' + Object.keys(groups).length);
  return groups;
}
const DAMAGE_RE = /^(PhysicalAttack\w*|PhysicalSoulAttack|MagicalAttack\w*|MagicalSoulAttack|MagicalDirectAttack|FatalBlow|Backstab|EnergyAttack|DeathLink|HpDrain|SoulBlow|Lethal|MagicalAttackMp|DamOverTime\w*|Blow)$/;
/** the kind of a skill from its datapack definition (INFERRED rules, see the README in the output) */
function kindOf(x, name) {
  const op = x.set.operateType || '', eff = x.effects, target = x.set.targetType || '';
  const has = (re) => eff.some(e => re.test(e));
  if (op === 'P') return 'passive';
  if (op === 'T') return 'toggle';
  if (has(/^(GetAgro|TargetMe|TargetMeProbability)$/)) return 'aggro';
  if (has(/^(Summon\w*|SummonCubic|SummonNpc|SummonTrap|SummonAgathion)$/)) return 'summon';
  if (eff.some(e => DAMAGE_RE.test(e))) return 'attack';
  if (has(/^Sweeper$/)) return 'other';                       // Sweeper / Life Scavenge: spoil collection, not a heal
  if (has(/^(Heal\w*|ManaHeal\w*|CpHeal\w*|HealPercent|HpPerMax|MpPerMax|Cp|Mp|Resurrection|RebalanceHP|ConsumeBody)$/) && !/^ENEMY(_ONLY)?$/.test(target)) return /Resurrection/.test(eff.join(' ')) ? 'resurrect' : 'heal';
  if (x.set.isDebuff === 'true' || /^(ENEMY|ENEMY_ONLY|AREA_CORPSE_MOB|AURA_CORPSE_MOB)$/.test(target) || /^-/.test(x.set.effectPoint || '')) return 'debuff';
  if (/^(Song|Dance|Chant|Prophecy|Pa'agrian|Victories|Magnus|Gift)/i.test(name) || has(/^(Buff|ChameleonRest|HealOverTime|Heal)$/) || +(x.set.abnormalTime || 0) > 0) return 'buff';
  return 'other';
}
function skillsFromXml() {
  const dir = path.join(DP, 'skills'), out = {};
  for (const f of fs.readdirSync(dir).filter(f => /\.xml$/i.test(f))) {
    const x = fs.readFileSync(path.join(dir, f), 'utf8');
    x.replace(/<skill (id="\d+"[^>]*)>([\s\S]*?)<\/skill>/g, (_, a, body) => {
      const o = attrs(a), routes = [];
      for (let i = 1; i <= 9; i++) if (o['enchantGroup' + i]) routes.push({ route: i, group: +o['enchantGroup' + i] });
      if (!routes.length) return;
      const set = {}; body.replace(/<set name="(\w+)" val="([^"]*)"\s*\/>/g, (__, k, v) => { set[k] = v; });
      const effBlock = (body.match(/<effects>([\s\S]*?)<\/effects>/) || [])[1] || '';
      const effects = []; effBlock.replace(/<effect name="(\w+)"/g, (__, n) => { if (!effects.includes(n)) effects.push(n); });
      out[+o.id] = { id: +o.id, name: o.name, levels: +o.levels, routes, set, effects, file: f };
    });
  }
  return out;
}
/** classSkillTree.xml: classId -> parent, and skill id -> classId -> { maxLevel, getLevel of that max level } */
function classTree() {
  const tree = fs.readFileSync(path.join(DP, 'classSkillTree.xml'), 'utf8');
  const parent = {}, learn = {};
  tree.replace(/<skillTree ([^>]*)>([\s\S]*?)<\/skillTree>/g, (_, a, body) => {
    const t = attrs(a); if (t.type !== 'classSkillTree') return;
    const cid = +t.classId; parent[cid] = t.parentClassId !== undefined ? +t.parentClassId : null;
    body.replace(/<skill ([^>]*?)\/?>/g, (__, sa) => {
      const s = attrs(sa); const id = +s.skillId, lvl = +s.skillLvl, get = +s.getLevel; if (!id) return;
      const by = (learn[id] = learn[id] || {}), cur = by[cid];
      if (!cur || lvl > cur.maxLevel) by[cid] = { maxLevel: lvl, getLevel: get };
    });
  });
  return { parent, learn };
}
/** where the codex books come from (DATAPACK multisell / buylists; L2Toggle not verified) */
function bookSources(itemIds) {
  const out = {}; itemIds.forEach(i => { out[i] = []; });
  const npcNames = (() => { const n = readJson(path.join(DATA, 'npcs_h5.json'), null); const m = {}; if (n) (Array.isArray(n) ? n : Object.values(n)).forEach(x => { if (x && x.id) m[x.id] = x.name; }); return m; })();
  const ms = path.join(DP, 'multisell');
  try {
    for (const f of fs.readdirSync(ms).filter(f => /\.xml$/.test(f))) {
      const x = fs.readFileSync(path.join(ms, f), 'utf8');
      const npcs = []; ((x.match(/<npcs>([\s\S]*?)<\/npcs>/) || [])[1] || '').replace(/<npc>(\d+)<\/npc>(?:\s*<!--\s*(.*?)\s*-->)?/g, (_, id, c) => npcs.push({ id: +id, name: c || npcNames[+id] || '' }));
      x.replace(/<item>([\s\S]*?)<\/item>/g, (_, it) => {
        const prod = []; it.replace(/<production count="(\d+)" id="(\d+)"/g, (__, c, id) => prod.push({ id: +id, count: +c }));
        const p = prod.find(p => out[p.id]); if (!p) return;
        const ing = []; it.replace(/(?:<!--\s*(.*?)\s*-->\s*)?<ingredient count="(\d+)" id="(\d+)"/g, (__, c, n, id) => ing.push({ id: +id, count: +n, name: c || '' }));
        const key = JSON.stringify([p.id, ing.map(i => i.id + 'x' + i.count)]);
        const list = out[p.id]; if (list.some(e => e._k === key)) { const e = list.find(e => e._k === key); npcs.forEach(n => { if (!e.npcs.some(m => m.id === n.id)) e.npcs.push(n); }); return; }
        list.push({ _k: key, how: 'multisell', list: f.replace(/\.xml$/, ''), npcs: npcs.slice(), pay: ing });
      });
    }
  } catch (e) { }
  const bl = path.join(DP, 'buylists');
  try {
    for (const f of fs.readdirSync(bl).filter(f => /\.xml$/.test(f))) {
      const x = fs.readFileSync(path.join(bl, f), 'utf8');
      x.replace(/<item id="(\d+)" price="(\d+)"/g, (_, id, pr) => { if (out[+id]) out[+id].push({ how: 'buylist', list: f.replace(/\.xml$/, ''), price: +pr, note: +pr === 0 ? 'price 0 = GM / test shop list' : '' }); });
    }
  } catch (e) { }
  const rd = readJson(path.join(DATA, 'raid_drops_h5.json'), null);
  if (rd) Object.keys(rd).forEach(bid => (rd[bid].categories || []).forEach(c => (c.items || []).forEach(it => { if (out[it.id]) out[it.id].push({ how: 'raid drop', bossId: +bid, chance: it.overall != null ? it.overall : it.chance, min: it.min, max: it.max }); })));
  Object.values(out).forEach(list => list.forEach(e => { delete e._k; }));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- compare GUIDE vs DATAPACK
function compare(tbl, g) {
  const diffs = [], white = [], blanks = [];
  tbl.forEach((row, r) => row.forEach((v, c) => {
    const dp = g.levels[r].chance[c];
    if (v === null) { blanks.push({ plus: r + 1, level: LV[c], datapack: dp }); return; }
    if (typeof v === 'string') { white.push({ plus: r + 1, level: LV[c], forum: +v.slice(2), datapack: dp }); return; }
    if (v !== dp) diffs.push({ plus: r + 1, level: LV[c], forum: v, datapack: dp });
  }));
  return { diffs, whiteCells: white, blankCells: blanks.length, blankWithDatapackAbove1: blanks.filter(b => b.datapack > 1) };
}

// ---------------------------------------------------------------------------------------------------------------- build
function build() {
  const groups = groupsFromXml(), xml = skillsFromXml(), client = clientSkills(), tree = classTree();
  const classesJson = readJson(path.join(DASH, 'data', 'classes.json'), {}), ct = readJson(path.join(DATA, 'class_tree.json'), { classes: {} });
  const items = readJson(path.join(DASH, 'data', 'items.json'), {}), iconsJson = readJson(path.join(DASH, 'data', 'skills.json'), {});
  const cname = (id) => (ct.classes[id] && ct.classes[id].name) || classesJson[id] || String(id);
  const M = L.DEFAULT_RULES.multipliers;
  // per-level cost rows for every mode (SERVER rules)
  Object.values(groups).forEach(g => g.levels.forEach(l => {
    l.guide = g.table ? (g.table === '2nd' ? FORUM_2ND : FORUM_3RD)[l.plus - 1] || null : null;
    l.normal = { sp: l.sp * M.normal, adena: l.adena * M.normal, book: l.plus === 1 ? { id: L.BOOKS.normal, count: 1 } : null };
    l.safe = { sp: l.sp * M.safe, adena: l.adena * M.safe, book: { id: L.BOOKS.safe, count: 1 } };
    l.untrain = { spBack: Math.floor(l.sp * 0.8), adena: l.adena, book: { id: L.BOOKS.untrain, count: 1 }, note: 'this level -> one lower (+1 -> base level)' };
    l.routeChange = { sp: l.sp, adena: l.adena, book: { id: L.BOOKS.routeChange, count: 1 }, note: 'same +N on the other route, then -Rnd(min(4,N)) levels' };
  }));
  const skills = {};
  let noName = 0, noClient = 0;
  Object.values(xml).sort((a, b) => a.id - b.id).forEach(x => {
    const c = client[x.id] || { rows: {}, routes: {} };
    if (!client[x.id]) noClient++;
    const base = c.rows[x.levels] || c.rows[Object.keys(c.rows).map(Number).sort((a, b) => b - a)[0]] || {};
    const icon = (iconsJson[x.id] && iconsJson[x.id][1]) || (base.icon ? base.icon.replace(/^icon\./, 'icon/') : '');
    const learnBy = tree.learn[x.id] || {};
    const learnedBy = Object.keys(learnBy).map(Number).sort((a, b) => a - b).map(cid => ({ classId: cid, className: cname(cid), tier: ct.classes[cid] ? ct.classes[cid].tier : null, maxLevel: learnBy[cid].maxLevel, getLevel: learnBy[cid].getLevel }));
    const routes = x.routes.map(r => {
      const g = groups[r.group], cr = c.routes[r.route] || {};
      if (!cr.name) noName++;
      const steps = (cr.steps || []).slice(0, g ? g.maxEnchant : 30).map(s => s || '');
      // compact: one text when every +level says the same
      const same = steps.length && steps.every(s => s === steps[0]);
      return { route: r.route, group: r.group, name: cr.name || `Route ${r.route}`, maxEnchant: g ? g.maxEnchant : null, firstLevel: r.route * 100 + 1,
        clientMax: cr.max || 0, plus1: steps[0] || '', plusMax: steps[steps.length - 1] || '', steps: same ? [steps[0]] : steps };
    });
    skills[x.id] = { id: x.id, name: x.name, icon, baseMaxLevel: x.levels, kind: kindOf(x, x.name), op: x.set.operateType || base.op || '',
      magic: x.set.isMagic ? +x.set.isMagic : 0, debuff: x.set.isDebuff === 'true' || !!base.debuff, target: x.set.targetType || base.target || '', scope: x.set.affectScope || base.scope || '',
      abnormalTime: +(x.set.abnormalTime || 0) || base.atime || 0, abnormalType: x.set.abnormalType || '', effects: x.effects,
      table: routes.some(r => groups[r.group] && groups[r.group].table === '3rd') ? '3rd' : '2nd', learnedBy, routes };
  });
  const forumVsDatapack = { second: compare(FORUM_2ND, groups[1]), secondAttack: compare(FORUM_2ND, groups[2]), third: compare(FORUM_3RD, groups[5]), thirdAttack: compare(FORUM_3RD, groups[6]),
    note: 'Every shaded forum cell equals the DATAPACK except 2nd +24 @ 85 (forum 51, datapack 46; the forum fits the -2 pattern 55/53/51, so the datapack value looks like a typo). The logic uses the DATAPACK value (the lower one). White cells (6/2/1 %) do NOT match the datapack and are probably the author\'s "not worth it" marker (INFERRED). +1 @ 81 is empty in the 2nd image (datapack 97: image glitch).' };
  const book = (id, when, per) => ({ id, name: (items[id] && items[id][0]) || '', icon: (items[id] && items[id][1]) || '', when, perAttempt: per });
  const out = {
    _about: 'GENERATED by docs/plan/tools/skill_enchant.js — do not edit by hand. Skill enchant (H5, level 76+, 3rd class): groups (SP / adena / books / chance per +level and character level), every enchantable skill with its routes, the rules. Logic: Dashboard/skillenchant_logic.js. Plan for the bots: Scripts/data/skill_enchant_plan.json.',
    meta: { generated: new Date().toISOString(), tool: 'docs/plan/tools/skill_enchant.js',
      sources: { forum: 'https://community.lineage2toggle.com/index.php?/topic/2753-skill-enchant-table/ (yoyoyaya 2024-12-03; 2 images, no text, no replies, 1 page)',
        datapack: 'L2J H5 Shagooh/l2j-server-datapack: data/enchantSkillGroups.xml (copy: Scripts/data/dp/enchantSkillGroups.xml), data/stats/skills/*.xml (Scripts/data/dp/skills), data/skillTrees/classSkillTree.xml, multisell/, buylists/',
        server: 'L2J Shagooh/l2j-server-game: RequestExEnchantSkill D0:0F, RequestExEnchantSkillSafe D0:32, RequestExEnchantSkillUntrain D0:33, RequestExEnchantSkillRouteChange D0:34, RequestExEnchantSkillInfoDetail D0:31 (all: skillId, skillLevel as int32); L2EnchantSkillGroup.getRate; config general.properties + character.properties',
        client: 'L2Swarm Data/base.db entry "Skills" (route names ENCH_DESCR, per-level text ENCH_WITH_DESCR)' },
      tags: { groups: 'DATAPACK', 'groups.levels[].guide': 'GUIDE (forum cells)', rules: 'SERVER (L2J code; L2Toggle not verified live)', 'skills[].routes[].name|steps': 'CLIENT', 'skills[].kind': 'INFERRED', bookSources: 'DATAPACK (L2Toggle shops not verified)' },
      counts: { skills: Object.keys(skills).length, routes: Object.values(skills).reduce((n, s) => n + s.routes.length, 0), routesWithoutClientName: noName, skillsWithoutClientRow: noClient } },
    rules: Object.assign({}, L.DEFAULT_RULES, {
      requirement: '3rd class (class tier 3) and character level >= 76; not while attacking, transformed or on a boat (isAllowedToEnchantSkills). No NPC is needed in the L2J code (the client opens the enchant window from the skill list); L2Toggle not verified.',
      startLevel: '+1 of a route needs the skill at its MAX base level (getMinSkillLevel: x01 -> base max level, else level - 1). Skill level on the wire = route * 100 + plus (101 = route 1 +1).',
      chance: 'column of the CHARACTER level 76..85 (level - 76); below 76 = 0. Roll: Rnd.get(100) <= rate, i.e. really (rate + 1) %; the logic uses rate % (a little conservative).',
      normal: 'Giant\'s Codex (6622) only for the first enchant of a route (+1) — EnchantSkillSpBookNeeded=True. Fail = the skill drops to its BASE level (all + lost; every SP / adena spent is gone).',
      safe: 'Giant\'s Codex - Mastery (9627) for EVERY attempt, SP and adena x5 (SafeEnchantCostMultipiler). Fail = level stays.',
      untrain: 'Giant\'s Codex - Oblivion (9625): pays the adena of the current level, gives back 80 % of its SP, -1 level.',
      routeChange: 'Giant\'s Codex - Discipline (9626): pays SP + adena of that level, keeps +N on the new route then loses Rnd.get(min(4, N)) levels (0-3).',
      exp: 'exp cost is always 0',
    }),
    books: { normal: book(L.BOOKS.normal, 'first enchant of a route (+1) only', 1), safe: book(L.BOOKS.safe, 'every safe enchant attempt', 1), untrain: book(L.BOOKS.untrain, 'every untrain (-1 level)', 1), routeChange: book(L.BOOKS.routeChange, 'every route change', 1) },
    bookSources: bookSources([L.BOOKS.normal, L.BOOKS.safe, L.BOOKS.untrain, L.BOOKS.routeChange]),
    levels: LV,
    forum: { url: 'https://community.lineage2toggle.com/index.php?/topic/2753-skill-enchant-table/', secondProfession: FORUM_2ND, thirdProfession: FORUM_3RD,
      legend: 'rows = +1..+N, columns = character level 76..85; number = shaded cell %, "w:N" = white unshaded cell N % (meaning not stated), null = empty cell', groups: { '2nd': [1, 2], '3rd': [5, 6] } },
    forumVsDatapack,
    groups,
    skills,
  };
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- plan (per character)
function writePlan(data) {
  const cfg = readJson(path.join(ROOT, 'swarm.config.json'), {}) || {};
  const settings = readJson(path.join(DATA, 'skill_enchant_settings.json'), {}) || {};
  const ct = readJson(path.join(DATA, 'class_tree.json'), { classes: {} });
  const states = {};
  try { fs.readdirSync(path.join(ROOT, 'Logs')).filter(f => /^swarm_state_.+\.json$/.test(f)).forEach(f => { const s = readJson(path.join(ROOT, 'Logs', f), null); if (s && s.name) states[s.name] = s; }); } catch (e) { }
  const chars = L.charactersFrom(cfg, states, ct);
  const cp = readJson(path.join(DATA, 'caster_primary.json'), null);
  const plan = L.buildPlanFile(data, chars, settings, ct, new Date().toISOString(), { primaryOf: (ch) => L.primaryFrom(cp, ch) });
  const F = path.join(DATA, 'skill_enchant_plan.json');
  const tmp = F + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(plan, null, 1) + '\n'); fs.renameSync(tmp, F);
  console.log(`plan: ${Object.keys(plan.chars).length} characters -> ${F}`);
  return plan;
}

if (require.main === module) {
  let data;
  if (PLAN_ONLY) data = readJson(OUT, null);
  else data = build();
  if (!data) { console.error('no data'); process.exit(1); }
  const c = data.meta.counts;
  console.log(`skills ${c.skills}, routes ${c.routes} (without client name ${c.routesWithoutClientName}, skills without client row ${c.skillsWithoutClientRow})`);
  const f = data.forumVsDatapack; console.log('forum vs datapack diffs:', JSON.stringify([f.second.diffs, f.secondAttack.diffs, f.third.diffs, f.thirdAttack.diffs]));
  const kinds = {}; Object.values(data.skills).forEach(s => { kinds[s.kind] = (kinds[s.kind] || 0) + 1; }); console.log('kinds', JSON.stringify(kinds));
  if (CHECK) process.exit(0);
  if (!PLAN_ONLY) {
    const txt = JSON.stringify(data) + '\n', tmp = OUT + '.tmp';
    fs.writeFileSync(tmp, txt); fs.renameSync(tmp, OUT);
    console.log(`wrote ${OUT} (${Math.round(txt.length / 1024)} KB)`);
  }
  if (PLAN) writePlan(data);
}
module.exports = { build, writePlan, FORUM_2ND, FORUM_3RD, kindOf, compare };
