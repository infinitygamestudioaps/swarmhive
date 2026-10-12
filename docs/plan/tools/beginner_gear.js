// BEGINNER GEAR (2026-10-12): forum topic 78 "Beginners gear for Lineage2 High Five" (Scrapyard 2020-05-13, 1 page, 2 replies without facts)
// checked against the L2J High Five datapack (github.com/Shagooh/l2j-server-datapack master: quests/Q00174_SupplyCheck, quests/Q00255_Tutorial,
// ai/npc/Teleports/NewbieGuide/NewbieGuide.java + newbie-guide-001.htm, multisell 305986001/305986002, stats/items 10400-10499, skill 2490).
//   node docs/plan/tools/beginner_gear.js            writes Scripts/data/beginner_gear.json + Scripts/data/beginner_gear_plan.json
//   node docs/plan/tools/beginner_gear.js --plan     only the plan (from Logs/swarm_state_<Name>.json + Logs/quest_state_<Name>.json)
//   node docs/plan/tools/beginner_gear.js --fix174   corrects Scripts/data/quests/174.json + the 174 record in quests_h5.json (backups first;
//                                                    the extractor merged cond 2 and cond 4 of Marcela into one "end" and lost the reward items)
// Every fact carries a tag: GUIDE (forum 78), DATAPACK (checked in the datapack / local copies), LIVE (seen on L2Toggle), INFERRED (our conclusion).
// Positions are checked against Scripts/data/spawns_h5.json, item names against Dashboard/data/items.json, multisells against Scripts/data/dp/multisell.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data'), LOGS = path.join(ROOT, 'Logs');
const L = require(path.join(ROOT, 'Dashboard', 'beginnergear_logic.js'));
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
function writeAtomic(f, s) { const t = f + '.tmp' + process.pid; fs.writeFileSync(t, s); fs.renameSync(t, f); }
const BACKUP = path.join(ROOT, 'Settings', 'backup', 'serverguides_2026-10-12');

const npc = (id, name, title, pos, town, tag) => ({ id, name, title: title || '', pos, town, tag: tag || 'DATAPACK' });
function buildData() {
  const NEWBIE_GUIDES = [
    npc(30598, 'Newbie Guide', '', [-84081, 243227, -3728], 'Talking Island Village'), npc(30599, 'Newbie Guide', '', [45475, 48359, -3056], 'Elven Village'),
    npc(30600, 'Newbie Guide', '', [12111, 16686, -4584], 'Dark Elf Village'), npc(30601, 'Newbie Guide', '', [115632, -177996, -896], 'Dwarven Village'),
    npc(30602, 'Newbie Guide', '', [-45032, -113598, -192], 'Orc Village'), npc(31076, 'Newbie Guide', '', [-83123, 150868, -3120], 'Gludin Village'),
    npc(31077, 'Newbie Guide', '', [-13920, 121977, -2984], 'Town of Gludio'), npc(32135, 'Newbie Guide', '', [-119692, 44504, 360], 'Kamael Village')];
  const HELPERS = [
    { race: 'Human fighter', master: npc(30008, 'Roien', 'Grand Master', [-71384, 258304, -3104], 'Talking Island'), helper: npc(30009, 'Newbie Helper', '', [-71424, 258336, -3104], 'Talking Island') },
    { race: 'Human mystic', master: npc(30017, 'Gallint', 'Grand Magister', [-91008, 248016, -3560], 'Talking Island'), helper: npc(30019, 'Newbie Helper', '', [-91036, 248044, -3560], 'Talking Island') },
    { race: 'Elf', master: npc(30370, 'Nerupa', '', [46048, 41200, -3504], 'Elven Village'), helper: npc(30400, 'Newbie Helper', '', [46112, 41200, -3504], 'Elven Village') },
    { race: 'Dark Elf', master: npc(30129, 'Mitraell', 'Hierarch', [28384, 11008, -4232], 'Dark Elf Village'), helper: npc(30131, 'Newbie Helper', '', [28384, 11056, -4232], 'Dark Elf Village') },
    { race: 'Dwarf', master: npc(30528, 'Laferon', 'Foreman', [108593, -174041, -408], 'Dwarven Village'), helper: npc(30530, 'Newbie Helper', '', [108567, -173994, -408], 'Dwarven Village') },
    { race: 'Orc', master: npc(30573, 'Vulkus', 'Flame Guardian', [-56736, -113536, -672], 'Orc Village'), helper: npc(30575, 'Newbie Helper', '', [-56736, -113680, -672], 'Orc Village') },
    { race: 'Kamael', master: npc(32133, 'Perwan', 'Vice Hierarch', [-125872, 38208, 1232], 'Kamael Village'), helper: npc(32134, 'Newbie Helper', '', [-125872, 38016, 1232], 'Kamael Village') }];
  const W = (id, name, type, pAtk, mAtk, extra) => Object.assign({ id, name, type, pAtk, mAtk, minutes: 180, tag: 'DATAPACK' }, extra || {});
  return {
    _about: 'Beginner gear chain (forum topic 78) checked against the L2J High Five datapack. Built by docs/plan/tools/beginner_gear.js — do not edit by hand. Plan per character: Scripts/data/beginner_gear_plan.json (same tool, --plan) and live on the dashboard Quests page -> Beginner gear (GET /api/quests/beginner, Dashboard/beginnergear_logic.js).',
    generated: new Date().toISOString(),
    tags: { GUIDE: 'forum topic 78 (Scrapyard 2020-05-13, edited 2020-05-23; 1 page; replies by Jdub and Emzy hold no facts; 20 screenshots)', DATAPACK: 'L2J High Five datapack (Shagooh/l2j-server-datapack master) or its local copies in Scripts/data', LIVE: 'seen on L2Toggle Kain by our bots', INFERRED: 'our conclusion, not verified' },
    sources: {
      forum: 'https://community.lineage2toggle.com/index.php?/topic/78-beginners-gear-for-lineage2-high-five/',
      datapack: ['quests/Q00174_SupplyCheck/Q00174_SupplyCheck.java', 'quests/Q00255_Tutorial/Q00255_Tutorial.java', 'ai/npc/Teleports/NewbieGuide/NewbieGuide.java + newbie-guide-001.htm/-011.htm',
        'Scripts/data/dp/multisell/305986001.xml, 305986002.xml', 'Scripts/data/dp/stats/items/10400-10499.xml', 'Scripts/data/dp/skills/02400-02499.xml (2490)', 'Scripts/data/spawns_h5.json (positions)'],
      notCut: 'The forum post is complete (1 page). Its facts are a walk-through with screenshots; numbers below come from the datapack unless tagged GUIDE.'
    },
    guideSteps: [
      'Create the character, take the board buffs (Alt+B).', 'Talk to the Newbie Helper in the start town (right of the class master).',
      'Kill Gremlins until the Blue Gemstone drops; reach level 3+.', 'Back to the Newbie Helper: beginner soulshots / spiritshots.',
      'Talk to the class master on the left (e.g. Grand Master Roien for human fighters): "I brought the recommendation".', 'Choose to go to the Isle of Souls.',
      'Map -> World Info -> Quest tab: find "Supply Check".', 'Talk to Marcela, accept Supply Check.', 'Follow the quest markers (Alt+M, Tracking).',
      'Finish the chain (reach level 5): beginner armor (wooden light armor for fighters, leather robe for mystics).', 'Hunt to level 6 if needed.',
      'Newbie Helper/Guide: shadow weapon with the coupons, chosen from the apprentice weapon warehouse (time-limited).',
      'Class change: buy it on the board (Career) or do the class quests. Party members can follow the leader\'s dialog.'
    ],
    steps: {
      tutorial: {
        key: 'tutorial', title: 'Tutorial: Newbie Helper (Blue Gemstone)', questId: 255, engine: false, tag: 'GUIDE+DATAPACK',
        engineWhy: 'Q00255 is a memo-state quest driven by tutorial events; quests/255.json parse is "partial" (no state transitions) — do it by hand.',
        levels: { min: 1, max: 5 }, class: 'base class',
        task: 'Kill Tutorial Gremlins (npc 18342, 100 spawns in the start areas) until the Blue Gemstone (6353) drops, then talk to the Newbie Helper.',
        reward: { fighter: [{ id: 5789, name: 'Soulshot: No Grade for Beginners', count: 200 }], mystic: [{ id: 5790, name: 'Spiritshot: No Grade for Beginners', count: 100 }],
          letter: 'Recommendation 1067/1068 (human), Blood of Mitraell 1070 (dark elf), Leaf of the Mother Tree 1069 (elf), License of Miner 1498 (dwarf), Voucher of Flame 1496 (orc), 9881 (kamael)', tag: 'DATAPACK' },
        npcs: HELPERS,
        next: 'With the letter at the class master: "I brought the recommendation." -> more beginner shots, then the choice Talking Island / Isle of Souls. Isle of Souls = teleport to -120050,44500,360 (Kamael Village; DATAPACK Q00255 teleportPlayer).'
      },
      supplyCheck: {
        key: 'supplyCheck', title: 'Supply Check (quest 174)', questId: 174, engine: true, tag: 'GUIDE+DATAPACK', command: '!quest 174 solo <Name>',
        levels: { min: 2, max: null }, class: 'any (no race / class rule)', oneTime: true, town: 'Kamael Village (Isle of Souls)',
        npcs: [npc(32173, 'Marcela', 'Zerstorer', [-119378, 49242, 8], 'Kamael Village'), npc(32170, 'Benis', 'Warehouse Keeper', [-114975, 44658, 512], 'Kamael Village'), npc(32167, 'Nika', 'Grocer', [-117153, 48075, 456], 'Kamael Village')],
        conds: ['start: Marcela, "Say yes." (event 32173-03.htm) -> cond 1', '1: Benis gives the Warehouse Manifest (9792) -> cond 2', '2: Marcela takes it -> cond 3',
          '3: Nika gives the Grocery Store Manifest (9793) -> cond 4', '4: Marcela: reward, quest done'],
        reward: { adena: 2466, exp: 5672, sp: 446, tag: 'DATAPACK',
          items: [{ id: 23, name: 'Wooden Breastplate' }, { id: 43, name: 'Wooden Helmet' }, { id: 49, name: 'Gloves' }, { id: 2386, name: 'Wooden Gaiters' }, { id: 37, name: 'Leather Shoes' }],
          mysticOnL2Toggle: { items: [{ id: 429, name: 'Leather Tunic' }, { id: 464, name: 'Leather Stockings' }, { id: 43, name: 'Wooden Helmet' }, { id: 37, name: 'Leather Shoes' }, { id: 49, name: 'Gloves' }], tag: 'GUIDE (screenshot: mystics got the leather robe; the datapack gives the fighter set to everyone)' } },
        after: 'Marcela shows "Delivery duty complete. Go find the Newbie Guide." (DATAPACK) -> weapon coupons.'
      },
      weaponCoupon: {
        key: 'weaponCoupon', title: 'Apprentice weapon coupons (5) -> shadow weapons', item: { id: 7832, name: "Apprentice Adventurer's Weapon Exchange Coupon", count: 5 }, tag: 'GUIDE+DATAPACK',
        levels: { min: 6, max: 19 }, class: 'base class only (ClassId.level() == 0)', once: 'one-time flag 207 per character', exchangeRule: 'the exchange (multisell 305986001) has the same rule: level 6-19 and base class — exchange BEFORE the class change',
        npcs: NEWBIE_GUIDES, links: { coupon: "Receive the Apprentice Adventurer's Weapon Exchange Coupon.", exchange: 'Select a No-Grade Shadow Weapon.', tag: 'DATAPACK newbie-guide-001.htm; how L2Toggle reaches that page from the first dialog is not verified (INFERRED: a "newbie item" link)' },
        multisell: 305986001,
        weapons: [W(10474, "Shadow Item - Apprentice's Staff", 'BLUNT 2-hand, magic', 23, 24), W(10475, 'Shadow Item - Bone Club', 'BLUNT', 24, 17), W(10476, 'Shadow Item - Shining Knife', 'DAGGER', 21, 17),
          W(10477, 'Shadow Item - Cestus', 'FIST 2-hand', 29, 17), W(10478, 'Shadow Item - Forest Bow', 'BOW 2-hand', 49, 17), W(10479, 'Shadow Item - Long Sword', 'SWORD', 24, 17)],
        flags: 'not tradable / droppable / sellable; chaotic characters cannot use them (DATAPACK); the 180 minutes run while equipped (GUIDE: "Shadow weapons lose duration when equipped/unequipped")'
      },
      accessoryCoupon: {
        key: 'accessoryCoupon', title: 'Magic accessory coupon (1) -> shadow D-grade jewelry', item: { id: 7833, name: "Adventurer's Magic Accessory Exchange Coupon", count: 1 }, tag: 'DATAPACK',
        levels: { min: 6, max: 39 }, class: '1st class only (ClassId.level() == 1)', once: 'one-time flag 208 per character', npcs: NEWBIE_GUIDES,
        links: { coupon: "Receive the Adventurer's Magic Accessory Exchange Coupon.", exchange: 'Select Magic Accessory.', tag: 'DATAPACK newbie-guide-001.htm' },
        multisell: 305986002, box: { id: 10473, name: 'Magic Accessory Set', skill: 2490, contents: [{ id: 10470, name: 'Shadow Item - Red Crescent', count: 2, mDef: 24, grade: 'D' }, { id: 10471, name: 'Shadow Item - Ring of Devotion', count: 2, mDef: 16, grade: 'D' }, { id: 10472, name: 'Shadow Item - Necklace of Devotion', count: 1, mDef: 32, grade: 'D' }], minutes: 180 },
        note: 'The guide page text says "Shadow Armor" for this coupon; the datapack multisell gives the jewelry box (DATAPACK wins until seen live).'
      }
    },
    classChange: { guide2020: { first: 100000, second: 3000000, third: 15000000, tag: 'GUIDE (2020 prices)' }, live2026: { first: 20000, second: 200000, tag: 'LIVE (Logs/career_*.html)' },
      how: 'Alt+B -> Career -> Professions (CLAUDE.md §2d). Class plans need the user\'s approval.' }
  };
}

// ---------------------------------------------------------------- verification against local data
function verify(d) {
  const errs = [], sp = readJ(path.join(DATA, 'spawns_h5.json'), []), items = readJ(path.join(ROOT, 'Dashboard', 'data', 'items.json'), {});
  const spawns = Array.isArray(sp) ? sp : [];
  const checkNpc = (n) => { const m = spawns.filter(s => Number(s.id) === n.id); if (!m.length) { errs.push('npc ' + n.id + ' not in spawns_h5.json'); return; }
    if (!m.some(s => s.x === n.pos[0] && s.y === n.pos[1] && s.z === n.pos[2])) errs.push('npc ' + n.id + ' position differs: ' + m.map(s => s.x + ',' + s.y + ',' + s.z).join(' | ')); };
  const S = d.steps;
  S.supplyCheck.npcs.forEach(checkNpc); S.weaponCoupon.npcs.forEach(checkNpc); S.tutorial.npcs.forEach(h => { checkNpc(h.master); checkNpc(h.helper); });
  const checkItem = (id, name) => { const it = items[id]; if (!it) errs.push('item ' + id + ' missing in items.json'); else if (name && it[0] !== name) errs.push('item ' + id + ' is "' + it[0] + '" not "' + name + '"'); };
  [S.weaponCoupon.item, S.accessoryCoupon.item, ...S.weaponCoupon.weapons, ...S.accessoryCoupon.box.contents, S.accessoryCoupon.box, ...S.supplyCheck.reward.items, ...S.supplyCheck.reward.mysticOnL2Toggle.items].forEach(i => checkItem(i.id, i.name));
  const ms = (id) => { try { return fs.readFileSync(path.join(DATA, 'dp', 'multisell', id + '.xml'), 'utf8'); } catch (e) { errs.push('multisell ' + id + ' missing'); return ''; } };
  const m1 = ms(305986001), m2 = ms(305986002);
  S.weaponCoupon.weapons.forEach(w => { if (m1 && !m1.includes('id="' + w.id + '"')) errs.push('multisell 305986001 lacks ' + w.id); });
  if (m1 && (m1.match(/ingredient count="1" id="7832"/g) || []).length !== 6) errs.push('multisell 305986001: expected 6 x coupon 7832');
  if (m2 && !(m2.includes('id="7833"') && m2.includes('id="10473"'))) errs.push('multisell 305986002 is not 7833 -> 10473');
  S.weaponCoupon.npcs.forEach(n => { if (m1 && !m1.includes('<npc>' + n.id + '</npc>')) errs.push('Newbie Guide ' + n.id + ' not on multisell 305986001'); });
  return errs;
}

// ---------------------------------------------------------------- plan from the bots' state files
function gearStats() {
  const g = readJ(path.join(DATA, 'dp', 'gear_db.json'), { items: [] }), by = {};
  (Array.isArray(g.items) ? g.items : Object.values(g.items || {})).forEach(i => { if (i && i.name && !by[i.name]) by[i.name] = i.stats || {}; });
  return (n) => by[n] || null;
}
function expToNextFn() { const e = readJ(path.join(DATA, 'exp_table.json'), { levels: [] }); const by = {}; (e.levels || []).forEach(r => { by[r.level] = r.toNext; }); return (l) => by[l] || 0; }
function charsFromLogs() {
  const out = {};
  let files = []; try { files = fs.readdirSync(LOGS).filter(f => /^swarm_state_[A-Za-z0-9_-]+\.json$/.test(f)); } catch (e) { }
  files.forEach(f => { const s = readJ(path.join(LOGS, f), null); if (!s || !s.name || f !== 'swarm_state_' + s.name + '.json') return;
    const q = readJ(path.join(LOGS, 'quest_state_' + s.name + '.json'), {}) || {};
    out[s.name] = { name: s.name, level: Number(s.level) || 0, classId: s.classId, cls: s.cls || '', gear: s.gear || {}, quests: q.quests || {}, updated: s.updated }; });
  return Object.values(out);
}
function buildPlan(data) {
  const chars = charsFromLogs(), P = L.planAll(chars, data, { expToNext: expToNextFn(), itemStats: gearStats() });
  return { _about: 'Which character should do which beginner-gear step (built by docs/plan/tools/beginner_gear.js --plan from Logs/swarm_state_*.json; the dashboard Quests page -> Beginner gear computes the same live). verdict: do | optional | wait | done | skip | gone | no.',
    generated: new Date().toISOString(), summary: P.summary, rows: P.rows };
}

// ---------------------------------------------------------------- quest 174 fix (datapack Q00174_SupplyCheck.java)
const FIX174 = {
  manual: true, edited: { at: '2026-10-12', by: 'docs/plan/tools/beginner_gear.js --fix174', why: 'quest_extract merged Marcela cond 2 (takes the manifest -> cond 3) and cond 4 (reward) into one "end" transition and lost the 5 reward items; corrected from Q00174_SupplyCheck.java' },
  steps: [{ cond: 0, title: 'Talk to Marcela – accept the quest', talk: [32173] }, { cond: 1, title: 'Get the Warehouse Manifest from Benis', talk: [32170] },
    { cond: 2, title: 'Bring the Warehouse Manifest to Marcela', talk: [32173] }, { cond: 3, title: 'Get the Grocery Store Manifest from Nika', talk: [32167] },
    { cond: 4, title: 'Report to Marcela – reward', talk: [32173] }],
  transitions: [
    { to: 1, start: true, trigger: { type: 'event', npcs: [32173], events: ['32173-03.htm'], links: ['Say yes.'] } },
    { from: [1], to: 2, trigger: { type: 'talk', npcs: [32170], state: 'STARTED' }, gives: [{ id: 9792, count: 1 }] },
    { from: [2], to: 3, trigger: { type: 'talk', npcs: [32173], state: 'STARTED' }, takes: [{ id: 9792, count: -1 }] },
    { from: [3], to: 4, trigger: { type: 'talk', npcs: [32167], state: 'STARTED' }, gives: [{ id: 9793, count: 1 }] },
    { from: [4], to: 'end', end: 'one-time', trigger: { type: 'talk', npcs: [32173], state: 'STARTED' }, gives: [{ id: 23, count: 1 }, { id: 43, count: 1 }, { id: 49, count: 1 }, { id: 2386, count: 1 }, { id: 37, count: 1 }], adena: 2466, exp: 5672, sp: 446 }],
  rewards: { final: [{ trigger: { type: 'talk', npcs: [32173], state: 'STARTED' }, conds: [4], adena: 2466, exp: 5672, sp: 446,
    items: [{ name: 'Wooden Breastplate', id: 23, count: 1 }, { name: 'Wooden Helmet', id: 43, count: 1 }, { name: 'Gloves', id: 49, count: 1 }, { name: 'Wooden Gaiters', id: 2386, count: 1 }, { name: 'Leather Shoes', id: 37, count: 1 }] }] }
};
function apply174(q) {
  const o = Object.assign({}, q, { steps: FIX174.steps, transitions: FIX174.transitions, rewards: FIX174.rewards, manual: true, edited: FIX174.edited });
  (o.items || []).forEach(i => { if (i.id === 9792) { i.givenBy = [1]; i.takenBy = [2]; } if (i.id === 9793) { i.givenBy = [3]; } });
  o.parse = Object.assign({}, o.parse || {}, { status: 'full', reasons: ['corrected by hand from Q00174_SupplyCheck.java (beginner_gear.js --fix174)'] });
  return o;
}
function fix174() {
  fs.mkdirSync(BACKUP, { recursive: true });
  const f1 = path.join(DATA, 'quests', '174.json');
  const q1 = readJ(f1, null); if (!q1) throw new Error('quests/174.json missing');
  if (!fs.existsSync(path.join(BACKUP, 'quests_174.json'))) fs.copyFileSync(f1, path.join(BACKUP, 'quests_174.json'));
  writeAtomic(f1, JSON.stringify(apply174(q1)));
  const f2 = path.join(DATA, 'quests_h5.json'), Q = readJ(f2, null);
  if (Q && Q.quests && Q.quests[174]) {
    if (!fs.existsSync(path.join(BACKUP, 'quests_h5.json'))) fs.copyFileSync(f2, path.join(BACKUP, 'quests_h5.json'));
    Q.quests[174] = apply174(Q.quests[174]);
    writeAtomic(f2, JSON.stringify(Q));
  }
  return 'quest 174 corrected (quests/174.json' + (Q ? ' + quests_h5.json' : '') + '); backups in ' + path.relative(ROOT, BACKUP);
}

module.exports = { buildData, verify, buildPlan, apply174, FIX174, charsFromLogs };
if (require.main === module) {
  const a = process.argv.slice(2);
  if (a.includes('--fix174')) { console.log(fix174()); process.exit(0); }
  let data = readJ(path.join(DATA, 'beginner_gear.json'), null);
  if (!a.includes('--plan') || !data) {
    data = buildData();
    const errs = verify(data);
    data.checks = { at: new Date().toISOString(), ok: !errs.length, errors: errs };
    writeAtomic(path.join(DATA, 'beginner_gear.json'), JSON.stringify(data, null, 1));
    console.log('beginner_gear.json written; checks: ' + (errs.length ? errs.length + ' problem(s):\n  ' + errs.join('\n  ') : 'all NPC positions, items and multisells agree'));
  }
  const P = buildPlan(data);
  writeAtomic(path.join(DATA, 'beginner_gear_plan.json'), JSON.stringify(P, null, 1));
  console.log('beginner_gear_plan.json: ' + JSON.stringify(P.summary));
  P.rows.filter(r => r.best).forEach(r => console.log('  ' + r.name + ' ' + r.level + ' ' + r.cls + ': ' + r.steps.filter(s => s.verdict === 'do' || s.verdict === 'optional').map(s => s.key + '=' + s.verdict).join(', ')));
}
