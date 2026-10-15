// CRAFTER ITEMS (CRAFTITEMS-2026-10-15, owner: "He is my designated crafter, he should also have the option to disenchant items into crystals.
// So there should be an option to hand him items he can then disenchant. And he should also be able to send recipes and materials to him.")
// Pure checks of swarm.js CRYST-PURE + CRYIN-PURE and Dashboard/crafter_api.js (no game, no MCP, temp folders only):
//   the data file (Scripts/data/crafter_items.json = docs/plan/tools/crafter_items.js from the H5 datapack), the crystallize packet against
//   L2Swarm's own packet catalog (Data/base.db PacketsGSClient 2F) + the JS API, crystal maths (L2J enchant bonus), the exclusion rules
//   (worn / skill level / enchanted / quest / untradeable / augmented / S.A.), order parsing, recipe learn checks, the same-town hand-in
//   decision + pending housekeeping, recipe / material filters, the API (crystallize check, hand-in orders, go now, clan warehouse), and
//   source checks that NOTHING crystallizes, learns or hands in by itself.      node docs/plan/tools/test_crafter_items.js
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
// NO_DP_SKIP 2026-10-15: the server datapack (Scripts/data/dp) is not shipped in the public package — these checks need its recipes.xml
if (!fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'recipes.xml'))) { console.log('skipped: needs the server datapack (Scripts/data/dp/recipes.xml), not in this install'); process.exit(0); }
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b); if (i < 0 || j < i) throw new Error('block missing: ' + a); return src.slice(i, j); };
const P = new Function(cut('// CRYST-PURE-BEGIN', '// CRYST-PURE-END') + cut('// CRYIN-PURE-BEGIN', '// CRYIN-PURE-END') +
  '\nreturn { CRY_GRADE, cryGrade, cryCount, cryJudge, cryBlock, cryTotals, cryParseOrder, cryHex, rcpJudge, crinDecide, crinPendClean };')();
const API = require(path.join(ROOT, 'Dashboard', 'crafter_api.js'));
const CI = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'crafter_items.json'), 'utf8'));
let fails = 0; const check = (c, n, info) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${!c && info ? ' — ' + info : ''}`); if (!c) fails++; };

(async () => {
// ---- 1. the data file = the datapack
{ const B = require('./crafter_items.js').build();
  check(B.counts.crystal === CI.counts.crystal && B.counts.recipes === CI.counts.recipes && B.counts.crystal > 4500 && B.counts.recipes > 990, 'Scripts/data/crafter_items.json is up to date with the datapack (re-run docs/plan/tools/crafter_items.js)', JSON.stringify([B.counts, CI.counts]));
  check(JSON.stringify(CI.crystal[2499]) === '[2561,"D","w",""]', 'Elven Long Sword: 2561 D crystals, weapon (gear_db.json crystal_count / crystal_type)', JSON.stringify(CI.crystal[2499]));
  check(CI.crystal[4681][3].includes('s') && CI.crystal[82][3].includes('t') && CI.crystal[11605][3].includes('c') && !CI.crystal[11605][3].includes('s'), 'flags: "Stormbringer - Critical Anger" = special ability, Gaz Blade = not tradeable, a Common Item is not an S.A.');
  check(['1458', '1785', '57', '728'].every(id => !CI.crystal[id]), 'crystals, ore, adena, potions are not crystallizable');
  const C = require(path.join(ROOT, 'Dashboard', 'crafter_api.js')).CRAFT_RECIPES;
  check(C.every(r => JSON.stringify(CI.recipes[r.scroll]) === JSON.stringify([r.list, r.lvl, 'd', r.product])), 'recipes: scroll -> [list id, level, d, product] agrees with the 15 shot recipes of the crafter block'); }
// ---- 2. the packet
{ let line = '', why = '';
  try {
    const z = fs.readFileSync(path.join(ROOT, 'Data', 'base.db')); const eocd = z.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    let cd = z.readUInt32LE(eocd + 16); const n = z.readUInt16LE(eocd + 10);
    for (let i = 0; i < n; i++) { const meth = z.readUInt16LE(cd + 10), csz = z.readUInt32LE(cd + 20), nl = z.readUInt16LE(cd + 28), el = z.readUInt16LE(cd + 30), cl = z.readUInt16LE(cd + 32), off = z.readUInt32LE(cd + 42);
      if (z.toString('utf8', cd + 46, cd + 46 + nl) === 'PacketsGSClient') { const lnl = z.readUInt16LE(off + 26), lel = z.readUInt16LE(off + 28), d = z.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csz); line = ((meth === 8 ? zlib.inflateRawSync(d) : d).toString('utf8').split(/\r?\n/).find(l => l.startsWith('2F=')) || '').trim(); }
      cd += 46 + nl + el + cl; }
  } catch (e) { why = e.message; }
  if (!line && why) console.log('skip Data/base.db not readable here (' + why + ')');
  else check(line === '2F=ReqCrystallizeItem=d(ObjectID)q(Count)', "L2Swarm's packet catalog: 2F = ReqCrystallizeItem d(ObjectID) q(Count)", line);
  const api = fs.readFileSync(path.join(ROOT, 'docs', 'js-api', 'host-methods.txt'), 'utf8');
  check(/Packet ReqCrystallizeItem\(int objId, bool send = true\)/.test(api), 'the JS API has Send.ReqCrystallizeItem(objId) (used only as the fallback)');
  check(P.cryHex(0x10203040, 1) === '2F' + '40302010' + '0100000000000000', 'cryHex: 2F + d(objId) LE + q(count) LE, upper-case, no spaces (Send.SendHex)', P.cryHex(0x10203040, 1));
  check(P.cryHex(268481234, 0) === P.cryHex(268481234, 1) && P.cryHex(268481234, 3).endsWith('0300000000000000'), 'count at least 1; a stack count goes into the q field'); }
// ---- 3. grades + crystal maths (L2J Item.getCrystalCount)
check(P.cryGrade('S80') === 'S' && P.cryGrade('s84') === 'S' && P.cryGrade('D') === 'D' && P.cryGrade('NONE') === '', 'S80 / S84 give S crystals; NONE is no grade');
check(P.cryCount(2561, 'w', 0, 'D') === 2561 && P.cryCount(2561, 'w', 1, 'D') === 2561 + 90 && P.cryCount(2561, 'w', 4, 'D') === 2561 + 90 * 5 && P.cryCount(100, 'a', 2, 'C') === 112 && P.cryCount(100, 'a', 5, 'A') === 100 + 20 * 9,
  'enchant bonus: +1..+3 = bonus x level, above +3 weapon bonus x (2e-3) / armor bonus x (3e-6)');
// ---- 4. the exclusion rules
const E = (id) => CI.crystal[id];
const row = (o) => Object.assign({ objId: 1, id: 2499, name: 'Elven Long Sword', count: 1, enchant: 0, equipped: false, quest: false, aug: 0 }, o);
{ const ok = P.cryJudge(row(), E(2499), { skillLvl: 1 });
  check(!ok.hard && P.cryBlock(ok) === '' && ok.grade === 'D' && ok.crystalId === 1458 && ok.crystals === 2561, 'a plain D sword with Crystallize 1: may go, 2561 D crystals', JSON.stringify(ok));
  check(/worn/.test(P.cryJudge(row({ equipped: true }), E(2499), { skillLvl: 5 }).hard) && /worn/.test(P.cryBlock(P.cryJudge(row({ equipped: true }), E(2499), { skillLvl: 5 }), { enchanted: true, special: true })), 'worn = never, not even with both ticks');
  check(P.cryJudge(row(), E(2499), { skillLvl: 0 }).hard === 'no Crystallize skill', 'no Crystallize skill = no');
  const cRow = row({ id: 4681, name: 'Stormbringer - Critical Anger' });
  check(/C-grade needs Crystallize level 2 \(mine 1\)/.test(P.cryJudge(cRow, E(4681), { skillLvl: 1 }).hard) && !P.cryJudge(cRow, E(4681), { skillLvl: 2 }).hard, 'grade vs skill level: C needs 2, B 3, A 4, S 5');
  const s84 = Object.keys(CI.crystal).find(k => CI.crystal[k][1] === 'S84');
  check(/needs Crystallize level 5/.test(P.cryJudge(row({ id: +s84 }), E(s84), { skillLvl: 4 }).hard) && !P.cryJudge(row({ id: +s84 }), E(s84), { skillLvl: 5 }).hard, 'S84 needs level 5 like S');
  const en = P.cryJudge(row({ enchant: 3 }), E(2499), { skillLvl: 1 });
  check(/tick "include enchanted items"/.test(P.cryBlock(en)) && P.cryBlock(en, { enchanted: true }) === '' && en.crystals === 2561 + 270, 'enchanted: only with "include enchanted", and it counts the bonus');
  const sa = P.cryJudge(cRow, E(4681), { skillLvl: 2 });
  check(/special ability/.test(P.cryBlock(sa)) && P.cryBlock(sa, { special: true }) === '', 'S.A. weapon: only with "include special items"');
  check(/augmented/.test(P.cryBlock(P.cryJudge(row({ aug: 12345 }), E(2499), { skillLvl: 1 }))), 'augmented: special');
  check(/quest item/.test(P.cryBlock(P.cryJudge(row({ quest: true }), E(2499), { skillLvl: 1 }))), 'quest item: special');
  check(/not tradeable/.test(P.cryBlock(P.cryJudge(row({ id: 82 }), E(82), { skillLvl: 5 }))) && /not tradeable/.test(P.cryBlock(P.cryJudge(row(), E(2499), { skillLvl: 1, notrade: new Set([2499]) }))), 'untradeable (datapack flag or Scripts/data/trade_items.json notrade): special');
  check(P.cryJudge(row({ id: 1458 }), undefined, { skillLvl: 5 }).hard === 'cannot be crystallized', 'not in the table = cannot be crystallized');
  const list = [ok, en, sa, P.cryJudge(row({ equipped: true }), E(2499), { skillLvl: 5 })];
  const t0 = P.cryTotals(list), t1 = P.cryTotals(list, { enchanted: true, special: true });
  check(t0.pieces === 1 && t0.D === 2561 && t1.pieces === 3 && t1.D === 2561 * 2 + 270 && t1.C === 705, 'totals per grade follow the ticks (worn never counted)', JSON.stringify([t0, t1]));
  // the dashboard uses the same rule
  const t = [{}, { enchanted: true }, { special: true }, { enchanted: true, special: true }];
  check(list.every(j => t.every(x => P.cryBlock(j, x) === API.cryBlock(j, x))), 'Dashboard/crafter_api.js cryBlock = swarm.js cryBlock'); }
// ---- 5. order parsing
{ const a = P.cryParseOrder(['!crystallize', 'Crafter1', '11,22,11', 'enchanted', 'SPECIAL']);
  check(a.name === 'Crafter1' && JSON.stringify(a.ids) === '[11,22]' && a.enchanted && a.special && !a.err, '"!crystallize Crafter1 11,22,11 enchanted special": ids deduped, both ticks', JSON.stringify(a));
  const b = P.cryParseOrder(['!crystallize', 'Crafter1', '11']);
  check(!b.enchanted && !b.special && !b.err, 'no words = no extra items allowed');
  check(/not an item object id/.test(P.cryParseOrder(['!crystallize', 'Crafter1', '11,x2']).err) && /no items/.test(P.cryParseOrder(['!crystallize', 'Crafter1']).err) && /no crafter/.test(P.cryParseOrder(['!crystallize']).err)
    && /unknown word/.test(P.cryParseOrder(['!crystallize', 'Crafter1', '11', 'all']).err) && /at most 100/.test(P.cryParseOrder(['!crystallize', 'X', Array.from({ length: 101 }, (_, i) => i + 1).join(',')]).err), 'bad ids / no ids / no name / unknown words / more than 100 = refused'); }
// ---- 6. recipe learn checks
{ const r = P.rcpJudge(1804, CI.recipes[1804], { createLvl: 7, known: [21] }), k = P.rcpJudge(1804, CI.recipes[1804], { createLvl: 7, known: [20] }), lo = P.rcpJudge(1808, CI.recipes[1808], { createLvl: 7, known: [] });
  const common = Object.keys(CI.recipes).find(id => CI.recipes[id][2] === 'c'), cm = P.rcpJudge(+common, CI.recipes[common], { createLvl: 9, commonLvl: 0 });
  check(r.ok && r.list === 20 && r.known === false, 'Soulshot (D) recipe: learnable with Create Item 7 when not in the book');
  check(!k.ok && k.known === true && /already in the recipe book/.test(k.why), 'already known = no');
  check(!lo.ok && /needs Create Item level 8 \(mine 7\)/.test(lo.why), 'level too low = no (S soulshot needs Create Item 8)');
  check(!cm.ok && /Create Common Item/.test(cm.why) && cm.known === null, 'a common recipe checks Create Common Item (the dwarven book does not tell if it is known)');
  check(P.rcpJudge(1458, undefined, {}).why === 'not a recipe', 'not a recipe'); }
// ---- 7. same-town hand-in
{ const rv = { name: 'Crafter1', town: 'Giran' };
  check(P.crinDecide({ goNow: true }).act === 'now', 'go now = now (even when the crafter does not answer)');
  check(P.crinDecide({ recv: null, me: { town: 'Giran' } }).act === 'wait' && P.crinDecide({ recv: Object.assign({ dead: true }, rv), me: { town: 'Giran' } }).act === 'wait', 'no answer / dead crafter = wait');
  const d = P.crinDecide({ recv: rv, me: { town: 'Dion' } });
  check(d.act === 'wait' && /next visit to Giran/.test(d.why), 'another town = wait for the next visit (nobody travels)', d.why);
  check(P.crinDecide({ recv: rv, me: { town: '' } }).act === 'wait' && P.crinDecide({ recv: { name: 'Crafter1', town: '' }, me: { town: 'Giran' } }).act === 'wait', 'field (me or the crafter) = wait');
  check(P.crinDecide({ recv: rv, me: { town: 'Giran', busy: 'a raid' } }).act === 'wait' && P.crinDecide({ recv: Object.assign({ busy: 'trading' }, rv), me: { town: 'Giran' } }).act === 'wait', 'busy (me or the crafter) = wait');
  check(P.crinDecide({ recv: rv, me: { town: 'Giran' } }).act === 'now', 'both idle in Giran = now');
  const c = P.crinPendClean([{ id: 'a', at: 1000 }, { id: 'b', at: 1000 }, { id: 'c', at: 10 }, { id: 'a', at: 1000 }], { b: { state: 'done' } }, 2000, 1500);
  check(JSON.stringify(c.keep) === '[{"id":"a","at":1000}]' && c.drop.map(x => x.id + ':' + x.why).join() === 'b:done,c:expired', 'pending list: done ones and expired ones (7 days) leave, duplicates once', JSON.stringify(c)); }
// ---- 8. recipe / material filters (the dashboard)
{ const TI = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'trade_items.json'), 'utf8')), X = API.craftItems({ DATA: path.join(ROOT, 'Scripts', 'data') });
  const k = (id, name) => API.crinKind({ id, name: name || '', cat: TI.cat[id] }, X);
  const want = { 1458: 'material', 1462: 'material', 1785: 'material', 3031: 'material', 1864: 'material', 1804: 'recipe', 3953: 'recipe', 2499: 'gear', 1463: 'other', 2510: 'other', 3948: 'other', 728: 'other', 57: 'other', 1835: 'other' };
  const bad = Object.keys(want).filter(id => k(+id) !== want[id]).map(id => `${id}=${k(+id)}`);
  check(!bad.length, 'kinds: crystals / Soul Ore / Spirit Ore / ingredients = material, recipes = recipe, crystallizable gear = gear, shots + potions + adena = other', bad.join(' '));
  check(k(99999, 'Recipe: Something New') === 'recipe', 'a name starting with "Recipe" is a recipe'); }
// ---- 9. the API with temp folders (no MCP: bag reports; commandRun stubbed — nothing is sent anywhere)
{ const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crfitems-')), LOGS = path.join(TMP, 'Logs'), HD = path.join(LOGS, 'handover'); fs.mkdirSync(HD, { recursive: true });
  process.env.SWARM_HANDOVER_DIR = HD;
  const giran = { x: 83473, y: 148554 }, dion = { x: 15619, y: 143132 };
  const states = [Object.assign({ name: 'Crafter1', level: 61, cls: 'Warsmith', ageSec: 5 }, giran), Object.assign({ name: 'Bishop1', level: 60, cls: 'Bishop', ageSec: 5 }, giran), Object.assign({ name: 'Necro1', level: 60, ageSec: 5 }, giran), Object.assign({ name: 'Doombringer1', level: 60, ageSec: 5 }, dion)];
  const sent = [];
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
  const ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA: path.join(ROOT, 'Scripts', 'data'), LOGS, ROOT, readJson, readStates: () => states, reloadCfg: () => ({}),
    teamMap: () => ({ Crafter1: 'Crafter1', Bishop1: 'Tank1', Necro1: 'Tank1', Doombringer1: 'Tank1', Tank1: 'Tank1' }), mainLeader: 'Tank1',
    commandRun: async (b) => { sent.push(b); return { code: 200, body: { ok: true, mock: true } }; } };
  const W = (f, o) => fs.writeFileSync(path.join(LOGS, f), JSON.stringify(o));
  const now = Date.now();
  W('crafter_bag_Crafter1.json', { name: 'Crafter1', atMs: now, town: 'Giran', skill: 4, cryst: [
    P.cryJudge(row({ objId: 101 }), E(2499), { skillLvl: 4 }), P.cryJudge(row({ objId: 102, enchant: 2 }), E(2499), { skillLvl: 4 }), P.cryJudge(row({ objId: 103, equipped: true }), E(2499), { skillLvl: 4 })], recipes: [] });
  const c1 = API.cryCheck(ctx, { name: 'Crafter1', objIds: [101] });
  check(c1.ok && c1.cmd === '!crystallize Crafter1 101' && c1.totals.D === 2561, 'API crystallize check: a free piece -> the exact order + crystal totals', JSON.stringify(c1).slice(0, 200));
  check(API.cryCheck(ctx, { name: 'Crafter1', objIds: [101, 102] }).code === 400 && API.cryCheck(ctx, { name: 'Crafter1', objIds: [102], enchanted: true }).cmd === '!crystallize Crafter1 102 enchanted', 'enchanted refused without the tick; with it the order carries "enchanted"');
  check(/worn/.test(API.cryCheck(ctx, { name: 'Crafter1', objIds: [103], enchanted: true, special: true }).error || '') && /not in its bag/.test(API.cryCheck(ctx, { name: 'Crafter1', objIds: [999] }).error || ''), 'worn / unknown pieces refused by the API too');
  W('crafter_bag_Crafter1.json', { name: 'Crafter1', atMs: now - 3600000, town: 'Giran', cryst: [] });
  check(API.cryCheck(ctx, { name: 'Crafter1', objIds: [101] }).code === 409, 'an old bag report (1 h) = refused (is it online?)');
  W('crafter_bag_Crafter1.json', { name: 'Crafter1', atMs: now, town: 'Giran', skill: 4, cryst: [], recipes: [] });
  // giver bags (the Trade page fallback: Logs/bag_<name>.json)
  W('bag_Bishop1.json', { at: new Date().toISOString(), items: [{ id: 1804, objId: 501, name: 'Recipe: Soulshot (D-Grade)', count: 1 }, { id: 1458, objId: 502, name: 'Crystal: D-Grade', count: 400 }, { id: 2499, objId: 503, name: 'Elven Long Sword', count: 1 }, { id: 1463, objId: 504, name: 'Soulshot: D-grade', count: 3000 }, { id: 2499, objId: 505, name: 'Elven Long Sword', count: 1, eq: true }] });
  W('bag_Necro1.json', { at: new Date().toISOString(), items: [{ id: 1785, objId: 601, name: 'Soul Ore', count: 50 }, { id: 3953, objId: 602, name: 'Recipe: Blessed Spiritshot (D)', count: 1 }] });
  W('bag_Doombringer1.json', { at: new Date().toISOString(), items: [{ id: 3031, objId: 701, name: 'Spirit Ore', count: 70 }] });
  const pl = await API.handinPlan(ctx, { crafter: 'Crafter1', from: '@town', kind: 'materials' });
  const gv = pl.preview ? pl.preview.givers.map(g => g.name + ':' + g.rows.map(r => r.id).join('+')).join(' ') : pl.error;
  check(gv === 'Bishop1:1458 Necro1:1785', 'everyone in the crafter\'s town (Giran): all materials — crystals + Soul Ore, never shots; Doombringer1 in Dion is not asked', gv);
  const pr = await API.handinPlan(ctx, { crafter: 'Crafter1', from: 'Bishop1', kind: 'recipes' });
  check(pr.preview && pr.preview.givers.length === 1 && pr.preview.givers[0].rows.map(r => r.id).join() === '1804', 'one character: all its recipes');
  const pp = await API.handinPlan(ctx, { crafter: 'Crafter1', pick: { Bishop1: [503, 505, 504] } });
  check(pp.preview.givers[0].rows.map(r => r.objId).join() === '503,504' && pp.preview.givers[0].problems.length === 1 && /worn/.test(pp.preview.givers[0].problems[0]), 'picked items: a worn one is left out with a reason', JSON.stringify(pp.preview.givers[0].problems));
  check((await API.handinPlan(ctx, { crafter: 'Crafter1', pick: { Crafter1: [1] } })).error === 'nobody to give (the crafter never gives to itself)', 'the crafter never gives to itself');
  check((await API.handinOrder(ctx, { crafter: 'Crafter1', from: 'Bishop1', kind: 'recipes' })).code === 409, 'no order without confirm: true');
  sent.length = 0;
  const o1 = await API.handinOrder(ctx, { crafter: 'Crafter1', from: 'Doombringer1', kind: 'materials', confirm: true });
  const of = o1.id && JSON.parse(fs.readFileSync(path.join(HD, o1.id + '.json'), 'utf8'));
  check(o1.ok && /^crin[a-z0-9]+$/.test(o1.id) && of.receiver === 'Crafter1' && of.sameTown === true && of.goNow === false && of.kind === 'crafter-in' && of.givers.Doombringer1.items[0].id === 3031 && of.givers.Doombringer1.adena === 0,
    'order file: crafter-in, sameTown (Doombringer1 is in Dion: he waits for his next Giran visit), no adena', JSON.stringify(of).slice(0, 300));
  check(/^[a-z0-9][a-z0-9_-]{3,40}$/i.test(o1.id), 'the order id passes the swarm.js HANDOVER id check (HOV_ID_RE)');
  check(sent.length === 1 && sent[0].cmd === `!handover ${o1.id}` && sent[0].targets[0] === 'chars:Doombringer1,Crafter1', '"!handover <id>" goes to the giver + the crafter only', JSON.stringify(sent));
  // go now
  fs.writeFileSync(path.join(HD, `${o1.id}_Doombringer1.json`), JSON.stringify({ state: 'pending', msg: 'waiting' }));
  sent.length = 0;
  const g = await API.handinGo(ctx, { id: o1.id }); const of2 = JSON.parse(fs.readFileSync(path.join(HD, o1.id + '.json'), 'utf8'));
  check(g.ok && of2.goNow === true && of2.sameTown === false && sent[0].cmd === `!handover ${o1.id}`, 'Go now: the order becomes goNow and is sent again');
  fs.writeFileSync(path.join(HD, `${o1.id}_Doombringer1.json`), JSON.stringify({ state: 'done' }));
  check((await API.handinGo(ctx, { id: o1.id })).code === 400, 'Go now on a finished order = refused');
  const hl = API.handins(ctx, 'Crafter1', 6);
  check(hl.length === 1 && hl[0].givers[0].state === 'done' && hl[0].over, 'the crafter card lists its hand-ins with each giver\'s state');
  // clan warehouse
  sent.length = 0;
  const cw = await API.cwhOrder(ctx, { crafter: 'Crafter1', items: [{ id: 1804, count: 'all' }, { id: 1458, count: 20 }], confirm: true });
  check(cw.ok && cw.cmd === '!whtake 1804:all,1458:20 clan Crafter1' && sent[0].targets[0] === `chars:${cw.clanLeader}`, 'clan warehouse: "!whtake <id:n> clan <crafter>" goes to the clan leader (he takes it out and trades it over)', JSON.stringify([cw.cmd, sent[0] && sent[0].targets]));
  check((await API.cwhOrder(ctx, { crafter: 'Crafter1', items: [{ id: 1 }] })).code === 409, 'clan warehouse: no order without confirm');
  // crystallize send: destructive -> confirmDanger
  W('crafter_bag_Crafter1.json', { name: 'Crafter1', atMs: now, town: 'Giran', skill: 4, cryst: [P.cryJudge(row({ objId: 101 }), E(2499), { skillLvl: 4 })], recipes: [] });
  sent.length = 0;
  const fakeRes = { json: (code, o) => { fakeRes.code = code; fakeRes.body = o; } };
  const mkReq = (b) => { const r = (async function* () { yield JSON.stringify(b); })(); r.method = 'POST'; return r; };
  const ctx2 = Object.assign({}, ctx, { allowed: () => true, json: (res, code, o) => { res.code = code; res.body = o; } });
  await API.handle(mkReq({ name: 'Crafter1', objIds: [101] }), fakeRes, new URL('http://x/api/crafter/crystallize'), ctx2);
  check(fakeRes.code === 409 && sent.length === 0, 'POST /api/crafter/crystallize without confirm: nothing sent');
  await API.handle(mkReq({ name: 'Crafter1', objIds: [101], confirm: true }), fakeRes, new URL('http://x/api/crafter/crystallize'), ctx2);
  check(fakeRes.code === 200 && sent.length === 1 && sent[0].cmd === '!crystallize Crafter1 101' && sent[0].confirmDanger === true, 'with confirm: one "!crystallize" with confirmDanger (the catalog marks it destructive)', JSON.stringify(sent));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { } }
// ---- 10. source checks: nothing by itself
{ const host = cut('const CRY = { busy: false', '/** !whtake <id>[:count],<id>[:count] [private|clan] [name] */');
  const calls = (re) => [...src.matchAll(re)].length;
  check(calls(/\bcryRun\(/g) === 2 && /function cryCommand[\s\S]*?cryRun\(p\)/.test(host), 'cryRun is called from exactly one place: the "!crystallize" order (cryCommand)');
  check(calls(/\bcryCommand\(/g) === 2 && /case '!crystallize': \{[^}]*cryCommand\(parts\)/.test(src), 'cryCommand is called only by the "!crystallize" case of the command switch');
  check(calls(/cryHex\(/g) === 2 && calls(/Send\.ReqCrystallizeItem\(objId\);/g) === 1, 'the crystallize packet is built in one place (inside cryRun); the host helper once as its fallback');
  check(calls(/\brcpLearn\(/g) === 2 && /a === 'learn'\) \{[^\n]*rcpLearn\(sc\)/.test(src), 'rcpLearn (uses a recipe) only from "!craft learn"');
  const iv = [...host.matchAll(/setInterval\(\(\) => \{([\s\S]*?)\n\}, (\d+)\);/g)];
  check(iv.length === 2 && iv.every(m => !/cryRun|rcpLearn|UseItem|SendHex/.test(m[1])), 'the two timers of the block only write the bag report / pick up parked hand-ins — no crystallize, no learn');
  check(/crinGiver\(o, true\)/.test(host) && /if \(o\.sameTown\) \{ crinGiver\(o, false\)/.test(src), 'a parked hand-in is only ever an order the owner sent ("!handover <id>" with sameTown)');
  check(/function craftBusyWhy\(\) \{\n  if \(CRY\.busy\) return 'crystallizing';/.test(src), 'never crafting while crystallizing');
  check(/crinPendStop\(id\)/.test(cut('function hovCommand(parts) {', '// --- CLAN LEVEL ITEM TO THE CLAN LEADER')), '"!handover stop" also ends a parked hand-in');
  const C = require(path.join(ROOT, 'Dashboard', 'commands.js')), cr = C.COMMANDS.find(c => c.id === 'crystallize'), cl = C.COMMANDS.find(c => c.id === 'craftlearn');
  check(cr && cr.safety === 'destructive' && C.classify('!crystallize Crafter1 1,2').id === 'crystallize', 'catalog: crystallize is DESTRUCTIVE (the command center asks a second time)');
  check(cl && cl.safety === 'confirm' && C.classify('!craft learn 1804 Crafter1').id === 'craftlearn' && C.classify('!craft Crafter1').id === 'craft', 'catalog: "!craft learn" is its own entry; "!craft <name>" still the craft round');
  const panel = fs.readFileSync(path.join(ROOT, 'Dashboard', 'crafterpanel.js'), 'utf8');
  check(!/\b(alert|confirm|prompt)\(/.test(panel.replace(/uiConfirm\(|uiAlert\(|uiPrompt\(/g, '')), 'the panel uses no browser alert / confirm / prompt');
  check(/danger: true, typeToConfirm: risky\.length \? 'YES' : ''/.test(panel) && /This destroys the items/.test(panel), 'crystallize asks with the red danger dialog ("This destroys the items"), YES typed for enchanted / special pieces'); }
console.log(fails ? `\n${fails} FAILED` : '\nall crafter items checks passed');
process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
