// OFFLINE TEST of the clan warehouse defaults (WHAUTO-2026-10-16: "select which should be crystallized and which should be sold by default ... then
// the collector will run around and sell and take out items for dwarfs to disenchant") + every Dwarf with Crystallize on the crafter page (CRYALL).
// Never touches the game or the live data (scratch files in os.tmpdir()).   node docs/plan/tools/test_whauto.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
let fails = 0, n = 0;
const check = (ok, what, info) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info ? ' — ' + info : '')); if (!ok) fails++; };
const W = require(path.join(ROOT, 'Dashboard', 'whauto_api.js'));
const T = Date.parse('2026-10-16T12:00:00Z');

// ---- 1) settings
const d0 = W.norm({});
check(d0.on === false && d0.everyMin === 30 && Object.keys(d0.items).length === 0 && d0.crafter === '', 'no file = off, every 30 min, no defaults');
check(Object.keys(W.norm({ items: { 12: { act: 'sell' }, x: { act: 'sell' }, 13: { act: 'burn' }, 14: { act: 'cry', name: 'Zubei' } } }).items).join() === '12,14', 'only sell / cry on real ids survive');
let a = W.applyChange({}, { set: [{ id: 612, act: 'cry', name: "Sealed Zubei's Gauntlets" }, { id: 1878, act: 'sell', name: 'Braided Hemp' }] });
check(!a.error && a.data.items[612].act === 'cry' && a.data.items[1878].act === 'sell', 'set defaults (crystallize / sell)');
a = W.applyChange(a.data, { set: [{ id: 1878, act: null }] }); check(!a.data.items[1878] && a.data.items[612], '"No default" removes one, keeps the rest');
check(W.applyChange({}, { set: [{ id: 5, act: 'destroy' }] }).error, 'an unknown action is refused');
check(W.applyChange({}, { everyMin: 5 }).error && W.applyChange({}, { everyMin: 45 }).data.everyMin === 45, 'interval 10 - 1440 min');
check(W.applyChange({}, { crafter: 'bad name!' }).error && W.applyChange({}, { crafter: 'Crafter1' }).data.crafter === 'Crafter1', 'crafter name checked');
check(W.applyChange({}, { on: true }).data.on === true, 'switch on');

// ---- 2) who is free
const idle = { name: 'Dagger1', updated: new Date(T - 20000).toISOString(), mode: 'idle', task: 'waiting for orders', x: 83480, y: 148552, dead: false };
check(W.collectorFree(idle, { on: true }, T).ok, 'clan leader online, idle, in Giran = free');
check(!W.collectorFree(Object.assign({}, idle, { updated: new Date(T - 600000).toISOString() }), {}, T).ok, 'offline (old state) = not free');
check(!W.collectorFree(Object.assign({}, idle, { mode: 'autolevel' }), {}, T).ok, 'leveling = not free');
check(!W.collectorFree(Object.assign({}, idle, { task: '[whsell] taking out 12 kinds' }), {}, T).ok, 'already selling / taking out = not free');
check(!W.collectorFree(Object.assign({}, idle, { x: 147000, y: 25800 }), {}, T).ok, 'outside Giran = not free');
check(!W.collectorFree(idle, { on: false }, T).ok, 'collector switched off = not free');
check(!W.collectorFree(Object.assign({}, idle, { dead: true }), {}, T).ok, 'dead = not free');

// ---- 3) what to order
const D = { on: true, items: { 612: { act: 'cry' }, 2503: { act: 'cry' }, 1878: { act: 'sell' }, 1879: { act: 'sell' } } };
const wh = { seenAt: '2026-10-16T11:00:00Z', items: [{ id: 612, name: "Sealed Zubei's Gauntlets", count: 1, enchant: 0 }, { id: 612, name: "Sealed Zubei's Gauntlets", count: 1, enchant: 0 },
  { id: 2503, name: 'Yaksa Mace', count: 1, enchant: 3 }, { id: 1878, name: 'Braided Hemp', count: 140, enchant: 0 }, { id: 84, name: "Homunkulus's Sword", count: 1, enchant: 0 }] };
const ok = { ok: true };
let r = W.decide(D, wh, {}, ok, T);
check(r.act === 'sell' && r.items.length === 1 && r.items[0].id === 1878 && r.items[0].count === 140, 'sell first: only the kinds with a sell default that are in the warehouse', JSON.stringify(r));
r = W.decide(D, wh, { lastAt: T - 31 * 60000, ordered: { 1878: wh.seenAt } }, ok, T);
check(r.act === 'cry' && r.items.length === 1 && r.items[0].id === 612 && r.items[0].count === 2, 'then crystallize: pieces of a kind summed, the enchanted Yaksa Mace +3 never', JSON.stringify(r));
check(W.decide(D, wh, { lastAt: T - 5 * 60000 }, ok, T).act === '', 'waits for the interval');
check(W.decide(D, wh, { lastAt: 0, ordered: { 1878: wh.seenAt, 612: wh.seenAt } }, ok, T).act === '', 'a kind is never ordered twice for the same warehouse look');
check(W.decide(D, Object.assign({}, wh, { seenAt: '2026-10-16T11:45:00Z' }), { lastAt: 0, ordered: { 1878: wh.seenAt } }, ok, T).act === 'sell', '... a new look (still there) orders it again');
check(W.decide(Object.assign({}, D, { on: false }), wh, {}, ok, T).act === '', 'switch off = nothing');
check(W.decide(D, wh, {}, { ok: false, why: 'busy' }, T).why === 'busy', 'collector busy = nothing, and says why');
check(W.decide(D, null, {}, ok, T).act === '' && /never looked/.test(W.decide(D, null, {}, ok, T).why), 'warehouse never seen = nothing');
const many = { seenAt: 'x', items: Array.from({ length: 60 }, (_, i) => ({ id: 5000 + i, name: 'Thing ' + i, count: 1, enchant: 0 })) };
const Dm = { on: true, items: {} }; many.items.forEach(i => { Dm.items[i.id] = { act: 'sell' }; });
check(W.decide(Dm, many, {}, ok, T).items.length === 40, 'at most 40 kinds per order');

// ---- 4) the tick with stubs (scratch files)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whauto-'));
const DATA = path.join(tmp, 'data'), LOGS = path.join(tmp, 'logs'); fs.mkdirSync(DATA); fs.mkdirSync(LOGS);
fs.writeFileSync(path.join(DATA, 'wh_auto.json'), JSON.stringify(D));
fs.writeFileSync(path.join(DATA, 'stash_rules.json'), JSON.stringify({ collector: { on: true, name: '', town: 'Giran' } }));
fs.writeFileSync(path.join(LOGS, 'clan_state.json'), JSON.stringify({ warehouse: wh }));
process.env.SWARM_WHSELL_FILE = path.join(LOGS, 'whsell_order.json');
const sentCmds = [], cryOrders = [];
const CA = require(path.join(ROOT, 'Dashboard', 'crafter_api.js'));
const realInfo = CA.info, realCry = CA.cwhCryOrder;
CA.info = () => ({ clanLeader: 'Dagger1', crafters: [{ name: 'Crafter1' }, { name: 'Spoiler2' }] });
CA.cwhCryOrder = async (ctx, b) => { cryOrders.push(b); return { ok: true, queued: 'cq1' }; };
const ctx = { DATA, LOGS, readStates: () => [Object.assign({}, idle, { updated: new Date().toISOString() })], commandRun: async (b) => { sentCmds.push(b); return { body: { ok: true } }; } };
(async () => {
  let t = await W.tick(ctx);
  const o = JSON.parse(fs.readFileSync(path.join(LOGS, 'whsell_order.json'), 'utf8'));
  check(t.ok && t.act === 'sell' && sentCmds.length === 1 && sentCmds[0].cmd === '!whsell order' && sentCmds[0].targets[0] === 'chars:Dagger1', 'tick: the sell order goes to the clan leader ("!whsell order")', JSON.stringify(t));
  check(o.items.length === 1 && o.items[0].id === 1878 && o.items[0].count === 'all' && o.sell === true, '... with Logs/whsell_order.json = the sell kinds (all of each)');
  t = await W.tick(ctx); check(!t.act && /waits/.test(t.why), 'the next minute: waits for the interval');
  t = await W.tick(ctx, true);
  check(t.ok && t.act === 'cry' && cryOrders.length === 1 && cryOrders[0].crafter === 'Crafter1' && cryOrders[0].confirm === true && cryOrders[0].items[0].id === 612, 'Run now: the crystallize order for the first crafter (the same path as the Storage button)', JSON.stringify(cryOrders));
  fs.writeFileSync(path.join(DATA, 'wh_auto.json'), JSON.stringify(Object.assign({}, D, { crafter: 'Spoiler2' })));
  const st = JSON.parse(fs.readFileSync(path.join(LOGS, 'whauto_state.json'), 'utf8')); st.ordered = {}; st.lastAt = 0; fs.writeFileSync(path.join(LOGS, 'whauto_state.json'), JSON.stringify(st));
  await W.tick(ctx); t = await W.tick(ctx, true);
  check(cryOrders.length === 2 && cryOrders[1].crafter === 'Spoiler2', 'the chosen crafter is used', JSON.stringify(cryOrders[1]));
  fs.writeFileSync(path.join(DATA, 'stash_rules.json'), JSON.stringify({ collector: { on: true, name: 'Crafter1' } }));
  t = await W.tick(ctx, true); check(!t.act && /not the clan leader/.test(t.why), 'a collector that is not the clan leader cannot take items out: nothing, and says why');
  CA.info = realInfo; CA.cwhCryOrder = realCry;

  // ---- 5) source / wiring
  const srv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
  check(/require\('\.\/whauto_api'\)\.handle\(req, res, url, \{[^}]*commandRun \}\)/.test(srv), 'server.js mounts /api/whauto (with the command runner)');
  check(/setInterval\(\(\) => \{ try \{ require\('\.\/whauto_api'\)\.tick\(/.test(srv), 'server.js runs the tick every minute');
  const pg = fs.readFileSync(path.join(ROOT, 'Dashboard', 'storagepage.js'), 'utf8');
  check(/data-cwhact="defsell"/.test(pg) && /data-cwhact="defcry"/.test(pg) && /data-cwhact="defnone"/.test(pg), 'Storage page: Always sell / Always crystallize / No default for the ticked');
  check(/data-wa="on"/.test(pg) && /data-wa="crafter"/.test(pg) && /data-wa="everyMin"/.test(pg) && /data-waact="run"/.test(pg), 'Storage page: the switch, crafter, interval and Run now');
  check(/WA_GEAR = \['weapon', 'armor', 'accessory'\]/.test(pg) && /Only D-grade or better weapons, armor and jewelry can be crystallized/.test(pg), 'Storage page: crystallize only for D+ gear');
  check(/function waTag\(r\)/.test(pg) && /\$\{waTag\(r\)\}<\/label>/.test(pg), 'Storage page: every row shows its default');
  const ca = fs.readFileSync(path.join(ROOT, 'Dashboard', 'crafter_api.js'), 'utf8');
  check(/CRYALL-2026-10-16/.test(ca) && ca.includes('cand.push({ name: n, cls: st.cls'), 'crafter page: every Dwarf with a Crystallize bag report is a candidate');
  // CRYALL with a scratch bag report
  const L2 = path.join(tmp, 'logs2'); fs.mkdirSync(L2);
  fs.writeFileSync(path.join(L2, 'crafter_bag_Spoiler4.json'), JSON.stringify({ name: 'Spoiler4', at: new Date().toISOString(), atMs: Date.now(), skill: 2, createLvl: 1, cryst: [{ objId: 1, id: 612, name: 'x' }] }));
  fs.writeFileSync(path.join(L2, 'crafter_bag_Oldie.json'), JSON.stringify({ name: 'Oldie', at: new Date(Date.now() - 3 * 86400000).toISOString(), atMs: Date.now() - 3 * 86400000, skill: 2, createLvl: 0, cryst: [] }));
  fs.writeFileSync(path.join(L2, 'crafter_bag_NoSkill.json'), JSON.stringify({ name: 'NoSkill', at: new Date().toISOString(), atMs: Date.now(), skill: 0, createLvl: 0, cryst: [] }));
  const ctx2 = { DATA, LOGS: L2, ROOT, DIR: path.join(ROOT, 'Dashboard'), readJson: (f, dd) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dd; } },
    readStates: () => [{ name: 'Spoiler4', cls: 'Bounty Hunter', level: 43, ageSec: 5 }, { name: 'Crafter1', cls: 'Warsmith', level: 63, ageSec: 5 }] };
  process.env.SWARM_CRAFTER_FILE = path.join(DATA, 'crafter_rules.json');
  const I = CA.info(ctx2), names = I.crafters.map(c => c.name);
  check(names.includes('Spoiler4') && names.includes('Crafter1'), 'a Bounty Hunter with Crystallize is listed (was only Artisan / Warsmith / Maestro)', names.join());
  check(!names.includes('Oldie') && !names.includes('NoSkill'), 'an old (> 1 day) report or no Crystallize skill = not listed', names.join());
  console.log(`whauto: ${n - fails} passed, ${fails} failed`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
