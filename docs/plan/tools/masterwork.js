#!/usr/bin/env node
// MASTERWORK DATA (2026-10-12, forum topic 430 "Weapon Masterwork Bonus specifics", Scrapyard 2021-12-11).
// Builds Scripts/data/masterwork.json from the L2J High Five datapack (Scripts/data/dp/gear_db.json = stats/items, skills 3825-3902 in
// Scripts/data/dp/skills/0380*-0399*.xml) and checks every value of the forum chart against it (GUIDE vs DATAPACK).
// Plus the Mammon exchange / varnish data from the earlier scratch build (masterwork_h5.json, copied into the output when found).
//   node docs/plan/tools/masterwork.js            write Scripts/data/masterwork.json
//   node docs/plan/tools/masterwork.js --check    only print the forum check
// Read by: Dashboard/gearpage_api.js (MW badge on the gear page); swarm.js MASTERWORK block (patch_masterwork.js: gear scoring) reads the slim
// copy Scripts/data/masterwork_ids.json written next to it.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DP = path.join(ROOT, 'Scripts', 'data', 'dp');
const OUT = path.join(ROOT, 'Scripts', 'data', 'masterwork.json');
const OUT_IDS = path.join(ROOT, 'Scripts', 'data', 'masterwork_ids.json');
const SCRATCH_MW =process.env.MW_SCRATCH || '';

const MW_MIN = 3825, MW_MAX = 3902, NOT_MW = new Set([3866]);   // 3866 = Dynasty Leather Gloves (armor set skill inside the range)

// ---------------------------------------------------------------------------------------- forum chart (GUIDE), transcribed row by row
// [benefit, values, mw name, weapon kind as written]. The author: "not complete", "in rough shape" (sources l2j.ru, L2db.info).
const FORUM = [
  ['Increase Atk. Spd.', ['5%'], 'Gale', ''], ['Increase Atk. Spd.', ['5%'], 'Great Gale', ''],
  ['Increase Crit Rate', [54.4], 'Lightning', 'Sword'], ['Increase Crit Rate', [52.2], 'Lightning', 'Blunt'],
  ['Increase Crit Rate', [54.4], 'Lightning', 'Dual Sword'], ['Increase Crit Rate', [54.4], 'Lightning', 'Polearm'],
  ['Increase Crit Dmg', [220], 'Thunder', '1H Sword'], ['Increase Crit Dmg', [340], 'Thunder', '2H Sword'],
  ['Increase Crit Dmg', [415], 'Thunder', '2H Blunt'], ['Increase Crit Dmg', [528], 'Thunder', 'Fist'],
  ['Increase Crit Dmg', [268], 'Thunder', 'Dual Swords'], ['Increase Crit Dmg', [156, 377], 'Thunder', 'Polearm'],
  ['Increase Max HP', [319, 492], 'Earth', '1H Sword'], ['Increase Max HP', [398], 'Earth', '2H Sword'],
  ['Increase Max HP', [294, 345, 511], 'Earth', '1H Blunt'], ['Increase Max HP', [444], 'Earth', 'Bow'],
  ['Increase Max HP', [372], 'Earth', 'Fist'], ['Increase Max HP', [319, 444], 'Earth', 'Dual Sword'],
  ['Increase Max HP', [319, 492], 'Earth', 'Polearm'],
  ['Recovers HP', [3], 'Evil Spirit', ''],
  ['Increase Accuracy', [4.2], 'Concentration', 'Blunt'], ['Increase Accuracy', [3.9], 'Concentration', 'Sword'],
  ['Increase Accuracy', [3.3], 'Concentration', 'Dagger'], ['Increase Accuracy', [3.3], 'Concentration', 'Bow'],
  ['Increase P. Atk.', [17.42, 22.1, 42.12], 'Destruction', ''], ['Increase P. Atk.', [32.97], 'Destruction', '2H Blunt'],
  ['Increase P. Atk.', [21.2, 26.9, 51.26], 'Destruction', 'Fist'], ['Increase P. Atk.', [21.2, 26.9, 51.26], 'Destruction', 'Dual Swords'],
  ['Increase P. Atk.', [31.25], 'Destruction', 'Polearm'],
  ['Activation chance to stun', [5, 8], 'Landslide', ''],
  ['Increase HP Regen', ['5%'], 'On Fire', ''],
  ['Increase Evasion', [3.3], 'Confusion', ''],
  ['Chance to poison', [], 'Molar', ''],
  ['increase P. Atk of bow range', [100], 'Clairvoyance', ''],
];
// forum weapon kind -> datapack weapon_type + hands
const KIND = {
  '': null, 'Sword': { t: ['SWORD'] }, '1H Sword': { t: ['SWORD'], h: 1 }, '2H Sword': { t: ['SWORD', 'ANCIENTSWORD'], h: 2 },
  'Blunt': { t: ['BLUNT'] }, '1H Blunt': { t: ['BLUNT'], h: 1 }, '2H Blunt': { t: ['BLUNT'], h: 2 },
  'Dual Sword': { t: ['DUAL'] }, 'Dual Swords': { t: ['DUAL'] }, 'Polearm': { t: ['POLE'] }, 'Fist': { t: ['DUALFIST', 'FIST'] },
  'Dagger': { t: ['DAGGER'] }, 'Bow': { t: ['BOW'] },
};

// ---------------------------------------------------------------------------------------- stat labels for the dashboard / bots
const STAT = {
  pAtk: 'P. Atk.', mAtk: 'M. Atk.', pAtkSpd: 'Atk. Spd.', mAtkSpd: 'Casting Spd.', critRate: 'Critical rate', rCrit: 'Critical rate',
  critDmg: 'Critical damage', critDmgAdd: 'Critical damage', healEffect: 'Heal power', cAtk: 'Critical damage', cAtkAdd: 'Critical damage', maxHp: 'Max HP', maxMp: 'Max MP', rEvas: 'Evasion',
  accCombat: 'Accuracy', absorbDam: 'HP absorb (% of damage dealt)', regHp: 'HP regen', regMp: 'MP regen', pAtkRange: 'Attack range',
  magicalMpConsumeRate: 'MP cost (magic)', physicalMpConsumeRate: 'MP cost (physical)', danceMpConsumeRate: 'MP cost (dances)',
};
const TRIGGER = { 5665: "stun", 5666: "stun", 5667: "stun", 5668: "poison", 5669: "stun", 5670: "stun", 5671: "stun", 5672: "stun" };

function parseSkills() {
  const out = {};
  ['03800-03899.xml', '03900-03999.xml'].forEach(f => {
    const xml = fs.readFileSync(path.join(DP, 'skills', f), 'utf8');
    const re = /<skill id="(\d+)" levels="(\d+)" name="([^"]+)">([\s\S]*?)<\/skill>/g; let m;
    while ((m = re.exec(xml))) {
      const id = +m[1]; if (id < MW_MIN || id > MW_MAX || NOT_MW.has(id)) continue;
      const levels = +m[2], body = m[4], tables = {};
      body.replace(/<table name="(#[^"]+)">([^<]*)<\/table>/g, (_, n, v) => { tables[n] = v.trim().split(/\s+/).map(Number); return ''; });
      const at = (v, lv) => { v = String(v).trim(); if (v[0] === '#') { const t = tables[v] || []; return t[Math.min(lv, t.length) - 1]; } return Number(v); };
      const per = [];
      for (let lv = 1; lv <= levels; lv++) {
        const eff = [];
        body.replace(/<effect name="([^"]+)">([\s\S]*?)<\/effect>/g, (_, en, eb) => {
          if (en === 'MaxHp' || en === 'MaxMp') { const p = /power="([^"]+)"/.exec(eb); if (p) eff.push({ stat: en === 'MaxHp' ? 'maxHp' : 'maxMp', op: 'add', val: at(p[1], lv) }); }
          else if (en === 'TriggerSkillByAttack') {
            // skillId may be a table ref (#triggeredId); the datapack names the triggered skill in a trailing comment (<!-- Stun -->)
            const ch = /chance="([^"]+)"/.exec(eb), sk = /skillId="([^"]+)"[^>]*\/>[ \t]*(?:<!--\s*([A-Za-z ]+?)\s*-->)?/.exec(eb);
            const sid = sk ? at(sk[1], lv) : null, cm = sk && sk[2] ? sk[2].toLowerCase() : '';
            eff.push({ stat: 'trigger', op: 'chance', val: ch ? at(ch[1], lv) : null, skill: sid, what: TRIGGER[sid] || cm || ('skill ' + sid) });
          } else eb.replace(/<(add|mul|sub)\s+stat="([^"]+)"\s+val="([^"]+)"/g, (__, op, st, v) => { eff.push({ stat: st, op, val: at(v, lv) }); return ''; });
          return '';
        });
        per.push(eff);
      }
      const name = m[3];
      out[id] = { id, name, levels, effects: per };
    }
  });
  return out;
}
function round(v) { return Math.round(v * 100) / 100; }
function effText(e) {
  if (e.stat === 'trigger') return `${e.val}% chance to ${e.what} on hit`;
  const L = STAT[e.stat] || e.stat;
  if (e.op === 'mul') { const p = round((e.val - 1) * 100); return `${L} ${p >= 0 ? '+' : ''}${p}%`; }
  if (e.op === 'sub') return `${L} -${e.val}`;
  return `${L} +${e.val}`;
}
/** comparable numbers of one effect (mul -> "5%") */
function effNum(e) { return e.op === 'mul' ? round(Math.abs(e.val - 1) * 100) + '%' : e.val; }

function build() {
  const items = require(path.join(DP, 'gear_db.json')).items;
  const SK = parseSkills();
  const byName = {};
  Object.values(items).forEach(x => { if (x.type === 'Weapon' && !byName[x.name]) byName[x.name] = x; });
  const list = [];
  Object.values(items).forEach(x => {
    if (x.type !== 'Weapon') return;
    const parts = String(x.item_skill || '').split(';').map(t => t.split('-').map(Number));
    const sk = parts.find(p => p[0] >= MW_MIN && p[0] <= MW_MAX && !NOT_MW.has(p[0]));
    if (!sk) return;
    const seg = String(x.name).split(/\s*-\s+/);                         // "Vesper Cutter- Thunder {PvP}" has no space before the dash
    const pvp = /\{PvP\}/.test(x.name);
    const mwName = (seg[1] || '').replace(/\s*\{PvP\}\s*/, '').trim();
    const sa = seg.slice(2).join(' - ').trim();
    const baseName = seg[0].trim();
    const base = byName[baseName];
    const S = SK[sk[0]], lv = sk[1] || 1, eff = S ? (S.effects[lv - 1] || []) : [];
    const hands = x.bodypart === 'lrhand' ? 2 : 1;
    list.push({
      id: +x.id, name: x.name, baseId: base ? +base.id : null, baseName, grade: x.crystal_type || 'NONE', wtype: x.weapon_type, hands,
      pvp, sa: sa || '', mw: mwName, skill: { id: sk[0], level: lv, name: S ? S.name : '' },
      bonus: eff.map(effText).join(', '), effects: eff.map(e => Object.assign({}, e)),
      pAtk: Number((x.stats || {}).pAtk) || 0, mAtk: Number((x.stats || {}).mAtk) || 0,
    });
  });
  list.sort((a, b) => a.id - b.id);
  // forum check
  const checks = FORUM.map(([benefit, vals, mw, kind]) => {
    const K = KIND[kind];
    const its = list.filter(i => i.mw === mw && (!K || (K.t.includes(i.wtype) && (!K.h || K.h === i.hands))));
    const dp = new Set(); its.forEach(i => i.effects.forEach(e => dp.add(String(effNum(e)))));
    const want = vals.map(String);
    const missing = want.filter(v => !dp.has(v));
    return { benefit, mw, kind, forum: vals, datapack: [...dp].sort(), items: its.length, ok: !its.length ? false : !missing.length, missing,
      note: !its.length ? 'no datapack masterwork of this name + kind' : missing.length ? 'forum value(s) not on any datapack item of this name + kind: ' + missing.join(', ') : '' };
  });
  const names = {};
  list.forEach(i => {
    const n = names[i.mw] || (names[i.mw] = { items: 0, bonuses: {} });
    n.items++; if (i.bonus) n.bonuses[i.bonus] = (n.bonuses[i.bonus] || 0) + 1;
  });
  // DATAPACK quirks: items whose skill kind differs from the usual kind of their MW name (e.g. a "Thunder" weapon with a crit RATE skill)
  const kindOf = (i) => (i.effects[0] ? i.effects[0].stat : '');
  const usual = {}; list.forEach(i => { const u = usual[i.mw] || (usual[i.mw] = {}); u[kindOf(i)] = (u[kindOf(i)] || 0) + 1; });
  const quirks = list.filter(i => { const u = usual[i.mw]; const top = Object.keys(u).sort((a, b) => u[b] - u[a])[0]; return kindOf(i) !== top; })
    .map(i => `${i.id} ${i.name}: ${i.bonus} (skill ${i.skill.id}-${i.skill.level} ${i.skill.name})`);
  let scratch = null;
  if (SCRATCH_MW && fs.existsSync(SCRATCH_MW)) try { scratch = JSON.parse(fs.readFileSync(SCRATCH_MW, 'utf8')); } catch (e) { }
  const out = {
    _readme: 'Masterwork (MW) weapons. GENERATED by docs/plan/tools/masterwork.js — do not edit by hand. byId[itemId] = index into items. ' +
      'Each item: name, baseId (the plain weapon), grade, wtype, hands, pvp, sa (special ability part of the name), mw (bonus name), skill (datapack item skill), ' +
      'bonus (text for the dashboard), effects (stat/op/val per the datapack skill level the item carries). Tags: GUIDE = forum topic 430, DATAPACK = L2J H5, INFERRED = ours.',
    generated: new Date().toISOString(),
    sources: {
      forum: { url: 'https://community.lineage2toggle.com/index.php?/topic/430-weapon-masterwork-bonus-specifics/', author: 'Scrapyard', posted: '2021-12-11', pages: 1, replies: 0,
        note: 'GUIDE: the author calls the chart "not complete" and "in rough shape" (sources l2j.ru, L2db.info). No L2Toggle-specific values.' },
      datapack: 'DATAPACK: L2J High Five (Shagooh) stats/items (Scripts/data/dp/gear_db.json) + skills 3825-3902 (Scripts/data/dp/skills/03800-03899.xml, 03900-03999.xml)',
    },
    rules: {
      scoring: 'INFERRED (user rule 2026-10-12): a masterwork weapon is never replaced by a plain weapon of the SAME grade unless the plain one beats it by more than the MW bonus (mwMarginPct of P./M. Atk.); a higher grade still wins. swarm.js MASTERWORK block (patch_masterwork.js).',
      mwMarginPct: 10,
      howToGet: 'DATAPACK: crafted (rare result of a normal recipe) or exchanged at the Blacksmith of Mammon (Foundation item + Mammon\'s Varnish Enhancer) — see mammonExchange / varnishPerGrade.',
      enchant: 'Masterwork items enchant like any weapon. Enchanting is NEVER automatic (user rule): recommendations + the manual !enchant order only.',
    },
    forumChart: FORUM.map(([benefit, values, mw, kind]) => ({ benefit, values, mw, kind })),
    forumCheck: checks,
    forumMismatches: checks.filter(c => !c.ok).map(c => `${c.mw}${c.kind ? ' (' + c.kind + ')' : ''}: forum ${c.forum.join('/') || '—'}; datapack ${c.datapack.join('/') || 'none'}${c.note ? ' — ' + c.note : ''}`),
    datapackQuirks: quirks,
    names,
    items: list,
    byId: list.reduce((o, i, k) => { o[i.id] = k; return o; }, {}),
    byBase: list.reduce((o, i) => { if (i.baseId) (o[i.baseId] = o[i.baseId] || []).push(i.id); return o; }, {}),
    mammonExchange: scratch ? scratch.mammonExchange : undefined,
    varnishPerGrade: scratch ? scratch.varnishPerGrade : undefined,
  };
  return out;
}

if (require.main === module) {
  const o = build();
  const bad = o.forumCheck.filter(c => !c.ok);
  console.log(`masterwork items: ${o.items.length}, names: ${Object.keys(o.names).length}; forum rows ${o.forumCheck.length}, mismatches ${bad.length}`);
  bad.forEach(c => console.log('  ' + c.mw + (c.kind ? ' (' + c.kind + ')' : '') + ': forum ' + (c.forum.join('/') || '-') + ' | datapack ' + (c.datapack.join('/') || 'none')));
  if (!process.argv.includes('--check')) {
    if (!o.mammonExchange && fs.existsSync(OUT)) { try { const old = JSON.parse(fs.readFileSync(OUT, 'utf8')); o.mammonExchange = old.mammonExchange; o.varnishPerGrade = old.varnishPerGrade; } catch (e) { } }
    fs.writeFileSync(OUT, JSON.stringify(o, null, 1)); console.log('wrote ' + OUT);
    // slim copy for swarm.js (12 engines read it): id -> [mw name, bonus text, grade]
    const slim = { _readme: 'GENERATED by docs/plan/tools/masterwork.js from masterwork.json (slim copy read by swarm.js MASTERWORK, patch_masterwork.js). ids[itemId] = [mw, bonus, grade].',
      generated: o.generated, mwMarginPct: o.rules.mwMarginPct, ids: {} };
    o.items.forEach(i => { slim.ids[i.id] = [i.mw, i.bonus, i.grade]; });
    fs.writeFileSync(OUT_IDS, JSON.stringify(slim)); console.log('wrote ' + OUT_IDS);
  }
}
module.exports = { build, parseSkills, effText, FORUM };
