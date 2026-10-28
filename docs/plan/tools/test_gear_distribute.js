// GEARPASS-2026-10-27 test (tester Vykaax: "I want the collector to grab everything from the parties as they come to town and then hand off
// certain things to certain distributors" + a "give to distributor" choice in the item pop-up; owner 2026-10-27: "Yes").
// Runs the swarm.js GEARPASS-PURE block + the GEARPASS host block in a node sandbox (no game), the dashboard API (Dashboard/gearauto_api.js) on a
// scratch folder, and checks the UI files. Covers: grade routing (D -> the D distributor; no match = stays + note), the switch default OFF, never
// +10 / worn / quest items, only marked gear, the locked + atomic API write, the pop-up / Gear page options.
//   node docs/plan/tools/test_gear_distribute.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const SW = fs.readFileSync(path.join(ROOT, fs.existsSync(path.join(ROOT, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev/swarm.js' : 'Scripts/swarm.js'), 'utf8');
const D = (f) => fs.readFileSync(path.join(ROOT, 'Dashboard', f), 'utf8');
let fails = 0, n = 0; const ok = (c, m, x) => { n++; if (c) console.log('ok   ' + m); else { fails++; console.log('FAIL ' + m + (x !== undefined ? ' — ' + JSON.stringify(x).slice(0, 400) : '')); } };
const blk = (a, b) => { const i = SW.indexOf(a), j = SW.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('block not found: ' + a); return SW.slice(i, j); };

// ============================================================================================ 1) the pure rules
const PURE = blk('// GEARPASS-PURE-BEGIN', '// GEARPASS-PURE-END');
ok(!/\b(Send|Inventory|File|App|Me)\./.test(PURE), 'GEARPASS-PURE has no host calls');
const P = new Function(PURE + '\nreturn { gpassCfg, gpassKind, gpassPieceOk, gpassRoute, gpassPlan, GPASS_GRADES };')();
// the switch: default OFF
ok(P.gpassCfg({}).on === false && P.gpassCfg(null).on === false && P.gpassCfg({ distributors: { on: true, names: ['DistD'] } }).on === false, 'switch default OFF (no file / no pass key)');
ok(P.gpassCfg({ distributors: { on: true, pass: 'yes', names: [] } }).on === false && P.gpassCfg({ distributors: { on: false, pass: true } }).on === false && P.gpassCfg({ distributors: { pass: true } }).on === true, 'switch ON only with pass === true (and distributors not switched off)');
{ let live = {}; try { live = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_sources.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { }
  ok(P.gpassCfg(live).on === false, 'the owner\'s gear_sources.json: the switch is OFF (nothing changes until switched on)'); }
const cfg = P.gpassCfg({ distributors: { on: true, pass: true, names: ['DistD', 'DistC', 'DistD2', 'DistJ'], grades: { DistD: ['d'], DistC: ['C', 'X'], DistD2: ['D'], DistJ: ['A'], Stranger: ['D'] }, kinds: { DistJ: ['jewel', 'hat'] }, marked: [100, 57, 'x', 101] } });
ok(cfg.grades.DistD.join() === 'D' && cfg.grades.DistC.join() === 'C' && !cfg.grades.Stranger && cfg.kinds.DistJ.join() === 'jewel' && cfg.marked.join() === '100,101', 'config cleaned: grades upper-cased, unknown grades / kinds / names / adena dropped', cfg);
ok(P.GPASS_GRADES.join() === 'NONE,D,C,B,A,S,S80,S84', 'grades as the gear data names them: NONE D C B A S S80 S84');
const RING = { n: 'Mithril Ring', s: 'ring', g: 'D' }, SWD = { n: 'Sword of Revolution', s: 'weapon', g: 'C' }, NECK = { n: 'Necklace of Black Ore', s: 'neck', g: 'A' }, BOOTS = { n: 'Boots of Doom', s: 'feet', g: 'A' }, S84 = { n: 'Vesper Cutter', s: 'weapon', g: 'S84' };
ok(P.gpassKind(RING) === 'jewel' && P.gpassKind(SWD) === 'weapon' && P.gpassKind(BOOTS) === 'armor' && P.gpassKind({ s: 'shield' }) === 'armor' && P.gpassKind(null) === '', 'kinds: weapon / armor (incl. shield) / jewel');
const me = { x: 0, y: 0, town: 'Giran' };
const dists = [{ name: 'DistD', town: 'Giran', x: 900, y: 0 }, { name: 'DistD2', town: 'Giran', x: 300, y: 0 }, { name: 'DistC', town: 'Giran', x: 100, y: 0 }, { name: 'DistJ', town: 'Giran', x: 50, y: 0 }];
// grade routing
let r = P.gpassRoute(RING, cfg, dists, me);
ok(r.to === 'DistD2', 'D ring -> the NEAREST idle D distributor (DistD2 at 300, not DistD at 900, never DistC)', r);
r = P.gpassRoute(RING, cfg, [dists[0], Object.assign({}, dists[1], { busy: 'in a raid' }), dists[2]], me);
ok(r.to === 'DistD', 'the nearer D distributor is busy -> the other idle D distributor', r);
r = P.gpassRoute(SWD, cfg, dists, me); ok(r.to === 'DistC', 'C weapon -> the C distributor', r);
r = P.gpassRoute(S84, cfg, dists, me); ok(r.to === '' && /no distributor holds S84/.test(r.why) && !r.wait, 'no distributor holds S84 -> stays, the reason says so', r);
r = P.gpassRoute(BOOTS, cfg, dists, me); ok(r.to === '' && /no distributor holds A armors/.test(r.why), 'kinds: the A distributor takes only jewels -> A boots stay', r);
r = P.gpassRoute(NECK, cfg, dists, me); ok(r.to === 'DistJ', 'kinds: A necklace -> the jewel-only A distributor', r);
r = P.gpassRoute(RING, cfg, [Object.assign({}, dists[0], { town: 'Dion' }), null, dists[2]], me);
ok(r.to === '' && r.wait && /DistD is not in Giran/.test(r.why) && /DistD2 does not answer/.test(r.why), 'D distributors away / offline -> waits, says why', r);
r = P.gpassRoute(RING, cfg, [Object.assign({}, dists[0], { dead: true }), Object.assign({}, dists[1], { busy: 'fighting' })], me);
ok(r.to === '' && /dead/.test(r.why) && /busy \(fighting\)/.test(r.why), 'dead / fighting distributor: never handed to', r);
// piece rules: never +10 / worn / quest / unmarked
const M = { ids: new Set([100, 101, 102, 103]), queued: {} };
const pc = (o) => Object.assign({ objId: 1, id: 100, name: 'Mithril Ring', info: RING, enchant: 0, equipped: false, quest: false, prot: false, notrade: false }, o);
ok(P.gpassPieceOk(pc({}), M).ok, 'a marked, unworn, +0 D ring may be passed');
ok(P.gpassPieceOk(pc({ enchant: 9 }), M).ok && !P.gpassPieceOk(pc({ enchant: 10 }), M).ok && !P.gpassPieceOk(pc({ enchant: 16 }), M).ok && /\+10 and up/.test(P.gpassPieceOk(pc({ enchant: 12 }), M).why), 'never +10 or higher (+9 is fine)');
ok(!P.gpassPieceOk(pc({ enchant: NaN }), M).ok, 'unknown enchant level = never moved');
ok(!P.gpassPieceOk(pc({ equipped: true }), M).ok && /worn/.test(P.gpassPieceOk(pc({ equipped: true }), M).why), 'never a worn piece');
ok(!P.gpassPieceOk(pc({ quest: true }), M).ok && !P.gpassPieceOk(pc({ prot: true }), M).ok, 'never quest / protected items');
ok(!P.gpassPieceOk(pc({ notrade: true }), M).ok, 'never an item the server refuses to trade');
ok(!P.gpassPieceOk(pc({ id: 999 }), M).ok && /not marked/.test(P.gpassPieceOk(pc({ id: 999 }), M).why), 'only marked gear: an unmarked ring stays');
ok(!P.gpassPieceOk(pc({ id: 57, info: null }), M).ok && !P.gpassPieceOk(pc({ info: { n: 'Soulshot', s: '' } }), M).ok, 'only weapons / armor / jewels');
// the plan
const bag = [pc({ objId: 1 }), pc({ objId: 2, enchant: 10 }), pc({ objId: 3, equipped: true }), pc({ objId: 4, id: 999 }), pc({ objId: 5, id: 101, name: 'Sword of Revolution', info: SWD }),
  pc({ objId: 6, id: 102, name: 'Vesper Cutter', info: S84 }), pc({ objId: 7, id: 200, name: 'Mithril Ring', info: RING }), pc({ objId: 8, id: 200, name: 'Mithril Ring', info: RING })];
const plan = P.gpassPlan(bag, { ids: new Set([100, 101, 102]), queued: { 200: 1 } }, cfg, dists, me);
ok((plan.give.DistD2 || []).map(x => x.objId).join() === '1,7' && (plan.give.DistC || []).map(x => x.objId).join() === '5', 'plan: the marked D ring + ONE queued old-gear ring -> DistD2, the C sword -> DistC', plan.give);
ok(plan.stay.length === 1 && plan.stay[0].name === 'Vesper Cutter' && /no distributor holds S84/.test(plan.stay[0].why), 'plan: the S84 piece stays with the collector + why', plan.stay);
ok(!JSON.stringify(plan.give).match(/"objId":(2|3|4|8)\b/) && plan.hold.join() === '1,5,6,7', 'plan: the +10, the worn, the unmarked piece and the 2nd ring (queued only once) are not moved; hold = the marked ones', plan.hold);
ok(plan.waiting.DistD2 === 2 && plan.waiting.DistC === 1, 'plan: "waiting for" counts per distributor', plan.waiting);
ok(Object.values(plan.give).every(L => L.every(x => x.count === 1 && x.stack === false)), 'plan: one piece per row');

// ============================================================================================ 2) the host: the collector's tick (stubbed game)
const HOST = blk('// GEARPASS host', '// FULLWARN 2026-10-14');
function host(o) {
  const W = Object.assign({ files: {}, hov: [], notes: [], emits: [], logs: [], pass: true, distOn: true, busy: '', town: 'Giran', bag: null, where: null, hovBusy: false }, o || {});
  const DB = { 100: RING, 101: SWD, 102: S84, 200: RING };
  W.bag = W.bag || [{ objId: 11, Id: 100, Name: 'Mithril Ring', EnchantLvl: 0 }, { objId: 12, Id: 100, Name: 'Mithril Ring', EnchantLvl: 12 }, { objId: 13, Id: 101, Name: 'Sword of Revolution', EnchantLvl: 0, IsEquiped: true }, { objId: 14, Id: 102, Name: 'Vesper Cutter', EnchantLvl: 0 }];
  W.where = W.where || { DistD: { name: 'DistD', town: 'Giran', x: 100, y: 0, busy: '' }, DistC: { name: 'DistC', town: 'Giran', x: 50, y: 0, busy: '' } };
  const sb = {
    SWARM_ROOT: 'R', HOV_DIR: 'H', HOV_CFG: { batch: 8 }, CONFIG: { roster: { Coll: 1, DistD: 1, DistC: 1, Bishop1: 1 } }, Me: { Name: 'Coll', X: 0, Y: 0 }, tradeState: null, IsInCombat: false,
    console, JSON, Math, Date, String, Number, Array, Object, Set, Promise, isFinite,
    num: (v) => { const x = Number(v); return isFinite(x) ? x : 0; }, now: () => W.t || (W.t = 1e9), sleep: async () => { W.t = (W.t || 1e9) + 5000; },
    note: (m, say) => W.notes.push(m), logError: (w, e) => W.notes.push('ERR ' + w + ' ' + (e && e.message)), appendShared: (f, t) => W.logs.push([f, t]),
    File: { Exists: (f) => W.files[f] !== undefined, ReadAllText: (f) => { if (W.files[f] === undefined) throw new Error('no ' + f); return W.files[f]; }, WriteAllText: (f, t) => { W.files[f] = t; } },
    gearSources: () => ({ dist: W.distOn, pass: P.gpassCfg({ distributors: { on: W.distOn, pass: W.pass, names: ['DistD', 'DistC'], grades: { DistD: ['D'], DistC: ['C'] }, marked: [100, 101, 102] } }) }),
    gearDb: () => ({ items: DB }), hovNotrade: () => new Set(), stashJobKeep: () => new Set(), qeProtected: () => false, collectorOn: () => true,
    Inventory: { forEach: (f) => W.bag.slice().forEach(f) }, currentTownKey: () => W.town, hovBusyWhy: () => W.busy,
    HOV: { busy: false, id: '' }, hovWhere: async (nm) => W.where[nm] || null,
    hovBag: () => W.bag.map(b => ({ objId: b.objId, id: b.Id })),
    App: { on: (nm, f) => { (W.handlers = W.handlers || {})[nm] = f; }, emit: (nm, d) => W.emits.push([nm, d]) },
    hovCommand: (p) => { W.hov.push(p[1]); const ord = JSON.parse(W.files['H\\' + p[1] + '.json']); const ids = ord.givers.Coll.items.map(r => r.objId); if (!W.refuse) W.bag = W.bag.filter(b => !ids.includes(b.objId)); },
  };
  vm.createContext(sb); vm.runInContext(PURE + HOST + '\n;globalThis.GPASS = GPASS;', sb); W.sb = sb; return W;
}
(async () => {
  // switch OFF: nothing moves
  { const W = host({ pass: false }); await W.sb.gpassTick(); ok(!W.hov.length && W.bag.length === 4 && /switch off/.test(JSON.parse(W.files['R\\Logs\\gear_pass.json'] || '{}').why || ''), 'host: switch OFF -> no hand-over, the status says "switch off"'); }
  // busy collector (raid / fight / mission): nothing
  { const W = host({ busy: 'in a raid' }); await W.sb.gpassTick(); ok(!W.hov.length, 'host: collector busy (raid / fight / mission) -> nothing'); }
  { const W = host(); W.sb.tradeState = { open: 1 }; await W.sb.gpassTick(); ok(!W.hov.length, 'host: collector in a trade -> nothing'); }
  // ON: the D ring goes to DistD through the HANDOVER machinery; the +12 ring, the worn sword and the S84 piece stay
  const W = host(); await W.sb.gpassTick(); await new Promise(res => setTimeout(res, 20));
  const ord = W.hov.length ? JSON.parse(W.files['H\\' + W.hov[0] + '.json']) : {};
  ok(W.hov.length === 1 && /^gpass_distd_/.test(W.hov[0]) && ord.receiver === 'DistD' && ord.givers.Coll.adena === 0 && ord.givers.Coll.items.map(x => x.objId).join() === '11', 'host ON: one HANDOVER order gpass_* to DistD with only the +0 D ring', ord);
  ok(W.emits.some(([nm, d]) => nm === 'swarm.hovcall' && d.id === W.hov[0]), 'host: the hand-over is started like every other one (swarm.hovcall + !handover)');
  ok(W.bag.some(b => b.objId === 12) && W.bag.some(b => b.objId === 13) && W.bag.some(b => b.objId === 14), 'host: the +12 ring, the worn sword and the S84 piece stay with the collector');
  ok(W.notes.some(m => m === 'collector: gave Mithril Ring (D) to DistD'), 'host: note "collector: gave Mithril Ring (D) to DistD"', W.notes);
  ok(W.notes.some(m => /Vesper Cutter \(S84\) stays with me — no distributor holds S84/.test(m)), 'host: no match -> note says why it stays', W.notes);
  const got = W.emits.find(([nm]) => nm === 'swarm.gpass.got');
  ok(got && got[1].to === 'DistD' && got[1].from === 'Coll' && got[1].items[0].name === 'Mithril Ring', 'host: the distributor is told (swarm.gpass.got)');
  ok(W.logs.some(([f, t]) => /handover\.log$/.test(f) && /GEARPASS gpass_distd_.* -> DistD: gave 1 \(Mithril Ring \(D\)\)/.test(t)), 'host: a GEARPASS line in Logs/handover.log', W.logs);
  const st = JSON.parse(W.files['R\\Logs\\gear_pass.json']);
  ok(st.on && st.waiting.DistD === 1 && st.stay.some(s => s.name === 'Vesper Cutter') && st.last.some(x => x.to === 'DistD' && x.name === 'Mithril Ring'), 'host: Logs/gear_pass.json = waiting per distributor, what stays + why, the last hand-overs', st);
  // the distributor's side note
  { const Wd = host(); Wd.sb.Me.Name = 'DistD'; Wd.handlers['swarm.gpass.got']({ data: got[1] }); ok(Wd.notes.some(m => /^distributor: got Mithril Ring \(D\) from the collector Coll/.test(m)), 'host: the distributor notes "got Mithril Ring (D) from the collector"', Wd.notes); }
  { const Wd = host(); Wd.sb.Me.Name = 'DistD'; Wd.handlers['swarm.gpass.got']({ data: { to: 'DistD', from: 'Stranger', items: [] } }); ok(!Wd.notes.length, 'host: an event from a non-roster name is ignored'); }
  // a hand-over that did not finish: the piece is reported as still with the collector
  { const Wr = host({ refuse: true }); await Wr.sb.gpassTick(); await new Promise(res => setTimeout(res, 20)); ok(Wr.notes.some(m => /Mithril Ring \(D\) still with me \(the hand-over to DistD did not finish\)/.test(m)) && !Wr.emits.some(([nm]) => nm === 'swarm.gpass.got'), 'host: an unfinished hand-over says so (no "gave")'); }
  // the old-gear queue: the giver's file, used once by the collector
  { const Wq = host({ bag: [{ objId: 21, Id: 200, Name: 'Mithril Ring', EnchantLvl: 0 }, { objId: 22, Id: 200, Name: 'Mithril Ring', EnchantLvl: 0 }] });
    Wq.sb.Me.Name = 'Bishop1'; Wq.sb.gpassQueueAdd([{ objId: 21, id: 200, name: 'Mithril Ring', grade: 'D' }], 'Coll'); Wq.sb.Me.Name = 'Coll';
    ok(/gear_pass_q_Bishop1\.json$/.test(Object.keys(Wq.files).find(f => /gear_pass_q_/.test(f)) || ''), 'old gear: the giver writes its OWN queue file Logs/gear_pass_q_<giver>.json');
    ok(Wq.sb.gpassQueued().queued[200] === 1, 'old gear: the collector reads the queue (1 Mithril Ring)');
    await Wq.sb.gpassTick(); await new Promise(res => setTimeout(res, 20));
    const o2 = Wq.hov.length ? JSON.parse(Wq.files['H\\' + Wq.hov[0] + '.json']) : {};
    ok(Wq.hov.length === 1 && o2.givers.Coll.items.length === 1 && Wq.bag.length === 1, 'old gear: ONE queued ring is passed (the other identical ring is not marked)', o2);
    ok(!Wq.sb.gpassQueued().queued[200], 'old gear: the queue entry is used up after the hand-over'); }
  // the stash keeps marked pieces in the collector's bag while the switch is on
  { const Wh = host(); const h = Wh.sb.gpassHoldIds(); ok(h && h.has(11) && h.has(14) && !h.has(12) && !h.has(13), 'stash hold: marked pieces stay out of the collector\'s store (not the +12 / worn ones)'); }
  { const Wh = host({ pass: false }); ok(Wh.sb.gpassHoldIds() === null, 'stash hold: switch OFF = nothing held (store as today)'); }

  // ============================================================================================ 3) wiring in swarm.js
  ok(/if \(here === 'Giran'\) \{ try \{ await gpassTick\(\); \}/.test(SW), 'the collector tick (COLLT, idle checks first) calls gpassTick in Giran');
  ok(/ctx\.distHold\.has\(Number\(it\.objId\)\)\) return K\('marked for the distributors/.test(SW) && /distHold: \(\(\) => \{ try \{ return typeof gpassHoldIds === 'function'/.test(SW), 'stashClassify keeps the held pieces (stashCtx distHold)');
  ok(/pass: gpassCfg\(j\)/.test(SW), 'gearSources() carries the pass config (read live, 60 s cache)');
  const GG = new Function(blk('// GEARGUARD-BEGIN', '// GEARGUARD-END') + '\nreturn { OLDGEAR, ogNorm, ogDecide, ogAllKeep };')();
  const dcfg = GG.ogNorm({ oldGear: { D: 'distributor', C: 'collector' } });
  ok(dcfg.D === 'distributor' && !GG.ogAllKeep(dcfg) && GG.ogNorm({ oldGear: { D: 'sell' } }).D === 'keep', 'old gear: "distributor" is a mode; "sell" still = keep');
  const dd = GG.ogDecide(dcfg, { info: { n: 'Mithril Ring', s: 'ring', g: 'D' } }), dc = GG.ogDecide(dcfg, { info: { n: 'Sword of Revolution', s: 'weapon', g: 'C' } });
  ok(dd.to === 'collector' && dd.dist === true && dc.to === 'collector' && !dc.dist, 'old gear: D = distributor -> to the collector AND queued; C = collector -> only to the collector');
  const og = SW.slice(SW.indexOf('async function oldGearGive('), SW.indexOf('async function upgradeRun('));
  ok(/d\.dist && enchLevelOf\(num\(r\.objId\)\) < 10\) distObj\.add/.test(og) && /typeof gpassQueueAdd === 'function'\) gpassQueueAdd\(/.test(og), 'oldGearGive queues only distributor pieces below +10, after they reached the collector');
  const gp = PURE + HOST;
  ok(!/sellPacket|whSellLoop|sellAt\(|townSell|destroyItem|Send\.Destroy|RequestEnchant/i.test(gp), 'GEARPASS never sells, destroys or enchants');
  ok(/HOV_DIR \+ '\\\\' \+ hid \+ '\.json'/.test(HOST) && /hovCommand\(\['!handover', hid\]\)/.test(HOST) && !/giveItems\(|Send\.TradeRequest|tradeStart/.test(HOST), 'GEARPASS moves items only through the HANDOVER machinery (no own trade code: reach + wall check stay)');

  // ============================================================================================ 4) the API (scratch folder)
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gearpass-')); process.env.SWARM_GEARAUTO_FILE = path.join(TMP, 'gear_auto.json');
  delete require.cache[require.resolve(path.join(ROOT, 'Dashboard', 'gearauto_api.js'))];
  const API = require(path.join(ROOT, 'Dashboard', 'gearauto_api.js'));
  const ctx = { DATA: TMP, ROOT, LOGS: TMP };
  const SF = path.join(TMP, 'gear_sources.json');
  const names = [].concat(...(API.info(ctx).parties || []).map(p => p.members.map(m => m.name)));
  ok(names.length >= 2, 'API: swarm.config.json has characters to use as distributors', names.length);
  const [d1, d2] = names;
  ok(API.info(ctx).sources.pass === false, 'API: no file = the switch is OFF');
  let rr = API.post(ctx, { scope: 'sources', names: [d1, d2] });
  ok(rr.code === 200 && rr.sources.pass === false, 'API: adding distributors leaves the switch OFF');
  rr = API.post(ctx, { scope: 'sources', grades: { [d1]: ['D', 'c'] }, kinds: { [d1]: ['weapon', 'jewel'] } });
  let j = JSON.parse(fs.readFileSync(SF, 'utf8'));
  ok(rr.code === 200 && j.distributors.grades[d1].join() === 'D,C' && j.distributors.kinds[d1].join() === 'weapon,jewel' && rr.sources.grades[d1].join() === 'D,C', 'API: grades + kinds per distributor saved (distributors.grades { name: [..] })', j.distributors);
  ok(!fs.existsSync(SF + '.lock') && !fs.readdirSync(TMP).some(f => /\.tmp$/.test(f)), 'API: the write is locked + atomic (no lock / tmp left behind)');
  ok(API.post(ctx, { scope: 'sources', grades: { [d1]: ['Z'] } }).code === 400 && API.post(ctx, { scope: 'sources', grades: ['D'] }).code === 400 && API.post(ctx, { scope: 'sources', kinds: { [d1]: ['hat'] } }).code === 400, 'API: an unknown grade / kind / not a table is refused');
  ok(API.post(ctx, { scope: 'sources', grades: { NotADistributor: ['D'] } }).code === 400 && JSON.parse(fs.readFileSync(SF, 'utf8')).distributors.grades[d1].join() === 'D,C', 'API: grades for a non-distributor refused; the file is unchanged');
  ok(API.post(ctx, { scope: 'sources', pass: 'on' }).code === 400, 'API: pass must be true / false');
  rr = API.post(ctx, { scope: 'sources', pass: true }); ok(rr.code === 200 && JSON.parse(fs.readFileSync(SF, 'utf8')).distributors.pass === true && rr.sources.pass === true, 'API: the switch ON is saved');
  rr = API.post(ctx, { scope: 'sources', grades: { [d1]: [] } }); ok(rr.code === 200 && !(JSON.parse(fs.readFileSync(SF, 'utf8')).distributors.grades || {})[d1], 'API: an empty grade list removes the entry');
  API.post(ctx, { scope: 'sources', grades: { [d2]: ['A'] } }); API.post(ctx, { scope: 'sources', names: [d1] });
  ok(!(JSON.parse(fs.readFileSync(SF, 'utf8')).distributors.grades || {})[d2], 'API: removing a distributor drops its grades');
  ok(API.markDistribute(ctx, 1234, true) === '' && API.markDistribute(ctx, 1234, true) === '' && JSON.parse(fs.readFileSync(SF, 'utf8')).distributors.marked.join() === '1234', 'API: the pop-up mark is saved once (locked write)');
  ok(API.markDistribute(ctx, 1234, false) === '' && JSON.parse(fs.readFileSync(SF, 'utf8')).distributors.marked.length === 0 && API.markDistribute(ctx, 57, true) === 'bad item id', 'API: unmark works; adena can never be marked');
  { const f2 = path.join(TMP, 'gear_sources.json'); fs.writeFileSync(f2 + '.lock', 'x'); const t0 = Date.now(); let thrown = false; try { fs.utimesSync(f2 + '.lock', new Date(), new Date()); API.markDistribute(ctx, 5, true); } catch (e) { thrown = /locked/.test(e.message); } fs.unlinkSync(f2 + '.lock');
    ok(thrown || Date.now() - t0 > 10000, 'API: a held lock blocks the write (never two writers at once)'); }
  rr = API.post(ctx, { scope: 'policy', oldGear: { D: 'distributor' } });
  ok(rr.code === 200 && JSON.parse(fs.readFileSync(path.join(TMP, 'gear_auto.json'), 'utf8')).oldGear.D === 'distributor' && API.post(ctx, { scope: 'policy', oldGear: { D: 'sell' } }).code === 400, 'API: old gear "to the distributor" saved; "sell" refused');
  fs.writeFileSync(path.join(TMP, 'gear_pass.json'), JSON.stringify({ on: true, collector: 'Coll', waiting: { [d1]: 3 }, stay: [{ name: 'X', grade: 'S84', why: 'no distributor holds S84' }], last: [] }));
  ok(API.info(ctx).sources.passStatus.waiting[d1] === 3, 'API: GET shows the collector\'s report (waiting for N)');
  delete process.env.SWARM_GEARAUTO_FILE;

  // ============================================================================================ 5) the UI
  const CP = D('charpage.js'), GPg = D('gearpage.js'), SV = D('server.js');
  ok(/q\('distributor', 'give to the distributor for its grade'\)/.test(CP) && /q\('collector', 'give to the collector'\)/.test(CP), 'pop-up: "otherwise" offers "give to the distributor for its grade" next to "give to the collector"');
  ok(/\$\{q\('', 'automatic'\)\}/.test(CP), 'pop-up: the default stays "automatic"');
  ok(/\['', 'keep', 'store', 'collector', 'distributor'\]\.includes\(rule\)/.test(SV) && /markDistribute\(\{ DATA, ROOT, LOGS \}, id, rule === 'distributor'\)/.test(SV), '/api/itemrule takes "distributor" (to the collector + the mark)');
  ok(/<option value="distributor" \$\{O\[k\] === 'distributor' \? 'selected' : ''\}>to the distributor for its grade<\/option>/.test(GPg), 'Gear page: old gear per grade offers "to the distributor for its grade" (default keep)');
  ok(/data-gpdgrade=/.test(GPg) && /data-gpdkind=/.test(GPg) && /data-gppass="1"/.test(GPg) && /Collector passes gear to the distributors/.test(GPg) && /waiting for: /.test(GPg), 'Gear page: per distributor a grade picker + kinds, the switch, "waiting for: N"');
  ok(/Off — nothing changes until you switch it on/.test(GPg) && /if \(to && !await uiConfirm\(\{ title: 'Collector passes gear to the distributors\?'/.test(GPg), 'Gear page: the switch says OFF and asks before switching on');
  console.log(`\ngear distribute (GEARPASS 2026-10-27): ${n - fails} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + e.stack); process.exit(1); });
