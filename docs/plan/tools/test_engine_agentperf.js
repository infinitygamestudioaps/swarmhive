// AGENTPERF (2026-10-13): agent2.js in a crowded town with a full bag — the live case of Dagger1 in Giran (dead in the brain 16:45-17:02:
// his full report took > 30 s, L2Swarm's watchdog interrupted it every time, `me` never reached the brain).
// A fake L2Swarm host that COUNTS host reads (every property read on Me / an item / a creature / a skill / a buff, every host call) and can
// make each read cost real time. 400 creatures (300 players, 50 NPCs, 50 monsters), 200 bag items, 100 skills, 30 buffs, party of 3.
// The collections offer the developer snapshot (L2Swarm 3.8.10+ snapshotJson: no IsStunned / TargetObjId on creatures, no Type / Grade /
// IsStackable / Weight on items, Grade would come as a NUMBER where the live read gives the enum name).
//   A  the first message after a (re)connect is the full Me (objId, Name, ClassId) + flags, before any heavy section; IsCharacterReady holds
//      after ONE tick even when every host read costs 0.2 ms (old agent: the whole report in one tick)
//   B  the brain mirror the new agent builds equals the old agent's (bag incl. the fields the snapshot lacks / formats differently, skills,
//      buffs, party, monsters with their live fields; players: the capped live reads)
//   C  host reads per second, standing in town: new agent <= 15 % of the old one (printed)
//   D  slow host: no tick spends much more than the budget on jobs; deferred jobs finish within a few ticks; every section arrives
//   F  TICKMODE: fast 62 ms / calm 250 ms / asleep 1000 ms; brain orders, events that concern me, movement and a bag change wake it
//   E  calibration: static untrusted fields (Type, Grade, ...) are read once per item, not per report; a bag change goes out at the next tick
// Usage: node docs/plan/tools/test_engine_agentperf.js [--agent <new agent2.js>] [--old <old agent2.js>] [--bh <brain_host dir>]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = (k, d) => (process.argv.includes(k) ? path.resolve(process.argv[process.argv.indexOf(k) + 1]) : d);
const AGENT = arg('--agent', path.join(ROOT, 'Scripts_dev', 'agent2.js'));
const OLD = arg('--old', path.join(ROOT, 'Settings', 'backup', 'agentperf_2026-10-13', 'agent2.js'));
const BH = arg('--bh', path.join(ROOT, 'Dashboard', 'brain_host'));
const { Mirror } = require(path.join(BH, 'mirror.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const hostFn = (f) => { const g = function () { return f.apply(this, arguments); }; Object.setPrototypeOf(g, null); return g; };
const busy = (ms) => { if (!ms) return; const t = process.hrtime.bigint() + BigInt(Math.round(ms * 1e6)); while (process.hrtime.bigint() < t) { } };

const GRADES = ['NONE', 'D', 'C', 'B', 'A', 'S'];
class NetEnum { constructor(n, v) { this.n = n; this.v = v; } ToString() { return this.n; } toString() { return this.n; } }
function world() {
  const W = { me: { Name: 'Dagger1', objId: 1001, Id: 0, X: 82000, Y: 148000, Z: -3400, HP: 3000, MaxHP: 3000, HpPercent: 100, MP: 900, MaxMP: 900, MpPercent: 100, CP: 1500, MaxCP: 1500,
    Level: 52, ClassId: 55, ClassName: 'Bounty Hunter', IsDead: false, IsCasting: false, IsInCombat: false, IsMoving: false, Exp: 123456789, SP: 400000, PAtk: 800, Title: 'loot', Heading: 0, InventoryLimit: 220 } };
  W.cr = [];
  for (let i = 0; i < 300; i++) W.cr.push({ objId: 200000 + i, Id: 0, Name: 'Player' + i, crtType: 0, X: W.me.X + ((i * 37) % 5000) - 2500, Y: W.me.Y + ((i * 53) % 5000) - 2500, Z: -3400, HP: 100, MaxHP: 100, HpPercent: 100, Level: 40 + (i % 40), IsDead: false, ClassId: i % 100, IsStunned: false, IsSleeping: false, IsParalyzed: false, IsOutOfControl: false, TargetObjId: i % 7 === 0 ? 300000 + (i % 50) : 0 });
  for (let i = 0; i < 50; i++) W.cr.push({ objId: 100000 + i, Id: 30000 + i, Name: 'Npc' + i, crtType: 1, X: W.me.X + i * 40, Y: W.me.Y - i * 40, Z: -3400, HP: 1, MaxHP: 1, HpPercent: 100, Level: 70, IsDead: false });
  for (let i = 0; i < 50; i++) W.cr.push({ objId: 300000 + i, Id: 20000 + i, Name: 'Mob' + i, crtType: 2, X: W.me.X + 1500 + i * 20, Y: W.me.Y + i * 20, Z: -3400, HP: 500, MaxHP: 500, HpPercent: 100, Level: 50, IsDead: false, IsStunned: i % 5 === 0, IsSleeping: false, IsParalyzed: false, IsOutOfControl: false, TargetObjId: i % 3 === 0 ? 200000 + i : 0 });
  W.party = [{ objId: 1001, Name: 'Dagger1', ClassId: 55, Level: 52, HP: 3000, MaxHP: 3000, HpPercent: 100, IsDead: false, X: W.me.X, Y: W.me.Y, Z: -3400 },
    { objId: 200007, Name: 'Player7', ClassId: 7, Level: 43, HP: 100, MaxHP: 100, HpPercent: 100, IsDead: false, X: W.me.X + 2000, Y: W.me.Y + 2000, Z: -3400 }];
  W.inv = []; for (let i = 0; i < 200; i++) W.inv.push({ objId: 5000 + i, Id: 57 + i * 3, Name: 'Item ' + i, Count: 1 + i * 11, IsEquiped: i < 10, IsQuest: false, IsStackable: i % 2 === 0, EnchantLvl: i % 4, Type: i % 3 === 0 ? 'Weapon' : 'EtcItem', Grade: GRADES[i % 6], Weight: 10 + i, Price: 100 * i, PAtk: i, MAtk: 0, PDef: 0, MDef: 0 });
  W.skills = []; for (let i = 0; i < 100; i++) W.skills.push({ Id: 1000 + i, Level: 1 + (i % 10), Name: 'Skill ' + i, IsActive: i % 2 === 0, IsPassive: i % 2 === 1, IsReady: true, IsToggle: false, IsEnabled: true, CastRange: 600, TargetType: 'ENEMY', MP: 30, ReuseDelay: 10000, Elapsed: 0, IsDebuff: false, AbnormalType: 'NONE', HitTime: 1000, Description: 'A skill that does a thing number ' + i + '. '.repeat(10) });
  W.buffs = []; for (let i = 0; i < 30; i++) W.buffs.push({ Id: 1040 + i, Level: 3, Name: 'Buff ' + i, IsDebuff: false, AbnormalType: 'TYPE' + i, AbnormalLevel: 1, RemainTime: 43000 - i * 10 });
  return W;
}
/** a fake L2Swarm host around world W; readCostMs = real time per host read; dev = developer snapshot (fields missing / numeric Grade) */
function makeAgent(file, W, readCostMs, clk) {
  const C = { reads: 0, tx: '', rx: [], interval: null, cost: readCostMs || 0 };
  const hit = () => { C.reads++; busy(C.cost); };
  const proxy = (o) => new Proxy(o, { get(t, k) { if (typeof k === 'string' && k !== 'then') hit(); const v = t[k]; return k === 'Grade' && typeof v === 'string' ? new NetEnum(v, GRADES.indexOf(v)) : v; } });
  const DROP = { cr: ['IsStunned', 'IsSleeping', 'IsParalyzed', 'IsOutOfControl', 'TargetObjId'], inv: ['Type', 'IsStackable', 'Weight'], skills: ['CastRange', 'TargetType', 'AbnormalType', 'IsDebuff', 'HitTime'] };
  const devRow = (kind, d) => { const r = Object.assign({}, d); (DROP[kind] || []).forEach(f => delete r[f]); if (kind === 'inv' && typeof r.Grade === 'string') r.Grade = GRADES.indexOf(r.Grade); if (kind === 'cr') delete r.Elapsed; return r; };
  const coll = (kind, getArr) => ({
    forEach: hostFn((cb) => { hit(); getArr().forEach((d, i) => cb(proxy(d), i)); }), get Count() { hit(); return getArr().length; },
    snapshotJson: hostFn(() => { hit(); busy(C.cost * 5); return JSON.stringify(getArr().map(d => devRow(kind, d))); }),
    GetItemByObjectID: hostFn((id) => { hit(); const d = getArr().find(x => x.objId === Number(id)); return d ? proxy(kind === 'cr' ? Object.assign({}, d, { targetCrt: d.TargetObjId ? { objId: d.TargetObjId } : null }) : d) : null; }),
    GetItemByID: hostFn((id) => { hit(); const d = getArr().find(x => x.Id === Number(id)); return d ? proxy(d) : null; }),
  });
  const bytes = (b) => { const x = Buffer.from(b); x.Length = x.length; return x; };
  class TcpClient { Connect() { } Close() { } GetStream() { return {
    get DataAvailable() { return C.rx.length > 0; },
    Read(rx, off, len) { if (!C.rx.length) return 0; const b = C.rx[0]; const n = Math.min(len, b.length); b.copy(rx, off, 0, n); if (n < b.length) C.rx[0] = b.subarray(n); else C.rx.shift(); return n; },
    Write(b, off, n) { C.tx += Buffer.from(b.subarray(off, off + n)).toString('utf8'); } }; } }
  const g = {
    get Me() { hit(); return proxy(Object.assign({}, W.me, { Clan: null })); }, get Target() { hit(); return null; }, Options: {},
    CreaturesList: coll('cr', () => W.cr), PartyList: coll('party', () => W.party), BuffsList: coll('buffs', () => W.buffs), Inventory: coll('inv', () => W.inv),
    SkillsList: coll('skills', () => W.skills), DropList: coll('drops', () => []), PetList: coll('pets', () => []), BuyList: coll('buy', () => []),
    get IsConnected() { hit(); return true; }, get IsInCombat() { hit(); return false; }, get IsEnabled() { hit(); return true; }, get IsAttacking() { hit(); return false; },
    get IsSitting() { hit(); return false; }, get IsPartyLeader() { hit(); return true; }, get IsInParty() { hit(); return true; }, get IsFollowModeOn() { hit(); return false; },
    get IsFollowMaster() { hit(); return false; }, get CurrentZone() { hit(); return { ToString: () => 'TOWN', toString: () => 'TOWN' }; }, get LastHTML() { hit(); return ''; },
    IsCharacterReady: () => true, ItemCount: () => 0, UseItem: () => { }, GetQuestState: () => null, Send: {},
    App: { self: () => ({ accountId: 'acc-Q' }), on: () => 1, emit: () => { }, emitTo: () => { } }, AppEvents: { on: () => 'x' },
    TcpClient, Encoding: { UTF8: { GetBytes: (s) => bytes(Buffer.from(String(s), 'utf8')), GetString: (b, i, n) => Buffer.from(b).toString('utf8', i, i + n) } },
    File: { AppendAllText: (p, t) => { if (process.env.AGDBG) console.log("FILE", p, t); } }, __DIR__: 'X:', __VERSION__: 'fake-3.8.18',
    Point3D: function (x, y, z) { this.X = x; this.Y = y; this.Z = z; }, Point: function (x, y) { this.X = x; this.Y = y; },
    setInterval: (f, ms) => { C.interval = f; C.period = ms; return 1; }, clearInterval: () => { }, setTimeout: () => 0, clearTimeout: () => { }, Date: clk ? fakeDate(clk) : Date, console,
  };
  for (const k of ['IsCharacterReady', 'ItemCount', 'UseItem', 'GetQuestState']) g[k] = hostFn(g[k]);
  vm.runInContext(fs.readFileSync(file, 'utf8'), vm.createContext(g), { filename: path.basename(file) });
  const mirror = new Mirror('Dagger1'); const msgs = [];
  const drain = () => { let k; const out = []; while ((k = C.tx.indexOf('\n')) >= 0) { const line = C.tx.slice(0, k); C.tx = C.tx.slice(k + 1); if (!line.trim()) continue; const m = JSON.parse(line); m._bytes = line.length; out.push(m); msgs.push(m); if (m.t === 'st') mirror.apply(m, line.length); } return out; };
  const ready = () => !!(mirror.me.objId && mirror.me.Name && mirror.me.ClassId !== undefined && mirror.fl.IsConnected);
  return { C, g, W, mirror, msgs, ready, drain };
}
function fakeDate(clk) { const D = function (a) { return a === undefined ? new Date(clk.t) : new Date(a); }; D.now = () => clk.t; D.UTC = Date.UTC; D.parse = Date.parse; return D; }
const resetBackoff = (A) => { try { vm.runInContext('AG.nextTick = 0', A.g); } catch (e) { } };
function run(A, n) { const out = []; for (let i = 0; i < n; i++) { const t0 = Date.now(); A.C.interval(); out.push({ ms: Date.now() - t0, msgs: A.drain() }); resetBackoff(A); } return out; }

(async () => {
  if (!fs.existsSync(OLD)) { console.log('skipped: the old agent for the comparison is not here (' + OLD + ') - it only exists in the owner install; pass --old <file>'); process.exit(0); }   // PKGSKIP-2026-10-13
  console.log('new: ' + AGENT + '\nold: ' + OLD);
  // ---------------------------------------------------------------- A: me first
  console.log('\n== A  the full Me reaches the brain first (slow host: 0.2 ms per read)');
  for (const [label, file] of [['old', OLD], ['new', AGENT]]) {
    const A = makeAgent(file, world(), 0.2);
    run(A, 1);                                    // connect + hello
    const t0 = Date.now(); const r = run(A, 1); const ms = Date.now() - t0;
    const st = r[0].msgs.filter(m => m.t === 'st');
    console.log(`   ${label}: tick 1 took ${ms} ms, ${A.C.reads} host reads so far, ${st.length} state message(s), first: ${st[0] ? Object.keys(st[0]).filter(k => k[0] !== '_').join(',') : '-'}`);
    if (label === 'new') {
      ok(st.length >= 2 && st[0].full === true && st[0].me && st[0].me.objId === 1001 && st[0].me.Name === 'Dagger1' && st[0].me.ClassId === 55 && st[0].fl && !st[0].inv && !st[0].cr, 'A1 first state message = full Me + flags + target, no heavy section in it');
      ok(A.ready(), 'A2 IsCharacterReady (mirror me.objId/Name/ClassId + fl.IsConnected) after the first report tick');
      A.__ms = ms;
    } else A.__ms = ms;
  }
  // ---------------------------------------------------------------- B: same mirror
  console.log('\n== B  the new mirror equals the old one');
  const Wb = world(), Ao = makeAgent(OLD, Wb, 0), An = makeAgent(AGENT, Wb, 0);
  run(Ao, 40); run(An, 40);
  const norm = (a) => JSON.stringify(a.map(x => { const r = Object.assign({}, x); Object.keys(r).forEach(k => { if (k[0] === '_') delete r[k]; }); return r; }));
  ok(norm(An.mirror.inv) === norm(Ao.mirror.inv) && An.mirror.inv.length === 200, `B1 bag: ${An.mirror.inv.length} rows identical (Type / Grade enum name / IsStackable / Weight from the live object)`);
  if (norm(An.mirror.inv) !== norm(Ao.mirror.inv)) console.log('   old[0]=' + JSON.stringify(Ao.mirror.inv[0]) + '\n   new[0]=' + JSON.stringify(An.mirror.inv[0]));
  ok(norm(An.mirror.skills) === norm(Ao.mirror.skills) && An.mirror.skills.length === 100, 'B2 skills identical');
  ok(norm(An.mirror.buffs) === norm(Ao.mirror.buffs) && An.mirror.buffs.length === 30, 'B3 buffs identical');
  ok(norm(An.mirror.party) === norm(Ao.mirror.party), 'B4 party identical');
  ok(JSON.stringify(An.mirror.me) === JSON.stringify(Ao.mirror.me), 'B5 Me identical');
  const crO = Ao.mirror.cr, crN = An.mirror.cr; let mobSame = 0, plDiff = 0, other = 0;
  // ENGINELAT-2026-10-13: the new agent no longer reads IsStunned / IsSleeping / IsParalyzed / IsOutOfControl / TargetObjId live (L2Swarm 3.8.18
  // does not expose them on CreaturesList items: always undefined there, ~230 us per failed read); this fake host does expose them, so those 5 fields
  // are compared apart: the new agent must send false / 0 for them (what the brain always got live)
  const LIVE5 = ['IsStunned', 'IsSleeping', 'IsParalyzed', 'IsOutOfControl', 'TargetObjId']; let liveDefault = 0, liveN = 0;
  const strip5 = (c) => { const r = Object.assign({}, c); LIVE5.forEach(k => delete r[k]); return r; };
  for (const [id, n] of crN) if (n.crtType !== 1) { liveN++; if (n.IsStunned === false && n.IsSleeping === false && n.IsParalyzed === false && n.IsOutOfControl === false && Number(n.TargetObjId) === 0) liveDefault++; }
  for (const [id, c] of crO) { const n = crN.get(id); if (!n) { other++; continue; } const same = JSON.stringify(strip5(c)) === JSON.stringify(strip5(n)); if (c.crtType === 2 || c.crtType === 1) { if (same) mobSame++; else other++; } else if (!same) plDiff++; }
  ok(crN.size === crO.size && mobSame === 100 && other === 0, `B6 creatures: ${crN.size} (old ${crO.size}); all 50 monsters + 50 NPCs identical (snapshot fields)`);
  ok(liveN > 0 && liveDefault === liveN, `B7 (ENGINELAT) every monster / player gets IsStunned..false / TargetObjId 0 without a live read (${liveDefault}/${liveN})`);
  console.log(`   players whose live fields are capped to 'none' (beyond the nearest ${40} within 3000): ${plDiff}`);
  // ---------------------------------------------------------------- C: host reads per second
  console.log('\n== C  host reads standing in town (16 ticks = 1 s of agent time, after the first full report)');
  const Wc = world(), Co = makeAgent(OLD, Wc, 0), Cn = makeAgent(AGENT, Wc, 0);
  run(Co, 20); run(Cn, 20); const ro0 = Co.C.reads, rn0 = Cn.C.reads;
  run(Co, 160); run(Cn, 160);
  const ro = (Co.C.reads - ro0) / 10, rn = (Cn.C.reads - rn0) / 10;
  console.log(`   old: ${Math.round(ro)} host reads/s   new: ${Math.round(rn)} host reads/s   (${(100 * rn / ro).toFixed(1)} %)`);
  ok(rn <= ro * 0.15, 'C1 new agent <= 15 % of the old host reads');
  const Wt = world(); Wt.cr = Wt.cr.filter(c => c.crtType !== 2); const To = makeAgent(OLD, Wt, 0), Tn = makeAgent(AGENT, Wt, 0);   // Giran: players + NPCs, no monster
  run(To, 20); run(Tn, 20); const to0 = To.C.reads, tn0 = Tn.C.reads; run(To, 160); run(Tn, 160);
  const tro = (To.C.reads - to0) / 10, trn = (Tn.C.reads - tn0) / 10;
  console.log(`   town without monsters: old ${Math.round(tro)} host reads/s   new: ${Math.round(trn)} host reads/s   (${(100 * trn / tro).toFixed(1)} %)`);
  ok(trn <= tro * 0.08, 'C2 in a town (no monsters) new agent <= 8 % of the old host reads');
  const bo = Co.msgs.slice(-60).reduce((s, m) => s + m._bytes, 0), bn = Cn.msgs.slice(-60).reduce((s, m) => s + m._bytes, 0);
  console.log(`   bytes in the last 60 messages: old ${bo}, new ${bn}`);
  // ---------------------------------------------------------------- D: budget on a slow host
  console.log('\n== D  slow host (0.2 ms per read): jobs spread over ticks');
  const Wd = world(), D = makeAgent(AGENT, Wd, 0.2);
  const rd = run(D, 24);
  const maxMs = Math.max(...rd.slice(1).map(x => x.ms));
  const got = {}; D.msgs.forEach(m => ['inv', 'skills', 'buffs', 'party', 'cr', 'drops', 'pets', 'html'].forEach(k => { if (m[k] !== undefined && !got[k]) got[k] = 1; }));
  console.log(`   tick ms: ${rd.map(x => x.ms).join(' ')}`);
  ok(Object.keys(got).length >= 7, `D1 every section arrived within 24 ticks (${Object.keys(got).join(',')})`);
  const oldD = makeAgent(OLD, world(), 0.2); const rOld = run(oldD, 2);
  console.log(`   old agent, the same host: the full-report tick took ${rOld[1].ms} ms (one tick); new max tick ${maxMs} ms`);
  ok(maxMs < rOld[1].ms, 'D2 no new tick as long as the old full-report tick');
  // ---------------------------------------------------------------- E: calibration + bag change
  console.log('\n== E  calibration, bag change');
  const We = world(), E = makeAgent(AGENT, We, 0); run(E, 20);
  const r0 = E.C.reads; We.inv[5].Count += 7; We.inv.push({ objId: 9999, Id: 1234, Name: 'New thing', Count: 1, IsEquiped: false, IsStackable: false, EnchantLvl: 0, Type: 'Armor', Grade: 'C', Weight: 50, Price: 1, PAtk: 0, MAtk: 0, PDef: 20, MDef: 0 });
  vm.runInContext('OnInventoryUpdate()', E.g); const r1 = run(E, 1);
  const invMsg = r1[0].msgs.find(m => m.inv);
  ok(!!invMsg && invMsg.inv.length === 201 && invMsg.inv.find(i => i.objId === 5005).Count === We.inv[5].Count && invMsg.inv.find(i => i.objId === 9999).Grade === 'C', 'E1 a bag change goes out at the next tick (new item with its live Grade name, the changed Count)');
  console.log(`   host reads for that bag tick: ${E.C.reads - r0} (one snapshot + the new item's untrusted static fields + the per-tick edges)`);
  ok(E.C.reads - r0 < 120, 'E2 a bag change costs < 120 host reads (old agent: 200 items x 18 fields = 3600)');
  // ---------------------------------------------------------------- F: adaptive tick interval (TICKMODE)
  console.log('\n== F  adaptive tick interval (virtual clock)');
  {
    const Wf = world(), clk = { t: 1790000000000 }; const F = makeAgent(AGENT, Wf, 0, clk);
    if (F.C.period === undefined) { ok(false, 'F0 the agent passes its tick interval to setInterval'); }
    else {
      const step = (ms) => { clk.t += ms; F.C.interval(); F.drain(); resetBackoff(F); };
      const runFor = (sec) => { let n = 0, reps = 0, r0 = F.C.reads, m0 = F.msgs.length; const w0 = process.hrtime.bigint(); const end = clk.t + sec * 1000; while (clk.t < end) { const p = F.C.period; step(p); n++; } F.msgs.slice(m0).forEach(m => { if (m.t === 'st' && m.seq && m.me !== undefined || m.t === 'st') reps++; }); return { ticks: n, reads: F.C.reads - r0, msgs: F.msgs.length - m0, ms: Number(process.hrtime.bigint() - w0) / 1e6 }; };
      step(62); step(62);                                      // connect + the full report
      ok(F.C.period === 62, `F1 starts fast (62 ms; now ${F.C.period})`);
      const fast = runFor(9);
      ok(F.C.period === 62, 'F2 still fast 9 s after the start (activity window 10 s)');
      const calm = runFor(20);
      ok(F.C.period === 250, `F3 calm (250 ms) after 10 s without activity (now ${F.C.period})`);
      const sleep0 = runFor(40), sleep = runFor(30);
      ok(F.C.period === 1000, `F4 asleep (1000 ms) after 60 s without activity (now ${F.C.period})`);
      const per = (x, s) => Math.round(x.reads / s);
      const cpu = (x, s) => (x.ms / s).toFixed(1);
      console.log(`   JS + fake-host ms per second of game time (400 creatures, 200 items; incl. the snapshot JSON): fast ${cpu(fast, 9)}, calm ${cpu(calm, 20)}, asleep ${cpu(sleep, 30)}`);
      console.log(`   host reads per second: fast ${per(fast, 9)} (${fast.ticks} ticks), calm ${per(calm, 20)} (${calm.ticks} ticks), asleep ${per(sleep, 30)} (${sleep.ticks} ticks in 30 s)`);
      ok(sleep.ticks <= 31 && per(sleep, 30) * 4 <= per(fast, 9), 'F5 asleep: <= 1 tick/s and <= 1/4 of the fast host reads');
      // a brain order wakes it (read on the next tick), and the following ticks are fast
      F.C.rx.push(Buffer.from(JSON.stringify({ a: 'call', id: 99, fn: 'Attack', args: [300001] }) + '\n')); step(F.C.period);
      ok(F.C.period === 62, `F6 a brain action order (Attack) -> fast at once (now ${F.C.period})`);
      runFor(70); ok(F.C.period === 1000, 'F7 asleep again 60 s after it');
      F.C.rx.push(Buffer.from(JSON.stringify({ a: 'ping', id: 1 }) + '\n')); step(F.C.period);
      ok(F.C.period === 1000, 'F8 a brain ping does not wake it');
      vm.runInContext('OnAttack(300001, 1001, false)', F.g);
      ok(F.C.period === 62, `F9 a monster hitting me re-arms fast from the event itself (now ${F.C.period})`);
      runFor(70); vm.runInContext('OnAttack(300001, 200005, false); OnSay("Player9", "WTS stuff", 1)', F.g);
      ok(F.C.period === 1000, 'F10 other people\'s fights and shouts do not wake it');
      Wf.me.X += 300; step(F.C.period); step(F.C.period);
      ok(F.C.period === 62, `F11 moving (position changed) -> fast (now ${F.C.period})`);
      const st = F.msgs.filter(m => m.t === 'st'); const last = st[st.length - 1];
      ok(F.mirror.me.X === Wf.me.X, 'F12 the mirror has the new position');
      // WAKE2: keepers / setters / reads do not wake, real actions do
      runFor(70);
      const push = (o) => { F.C.rx.push(Buffer.from(JSON.stringify(o) + '\n')); step(F.C.period); };
      push({ a: 'set', path: 'Options.FollowName', v: 'Tank1' }); push({ a: 'call', id: 7, fn: 'StopCombat', args: [] }); push({ a: 'call', id: 8, fn: 'Select', args: ['Player1'] });
      push({ a: 'call', id: 9, fn: 'Send.SendHex', args: ['3A'] }); push({ a: 'call', id: 10, fn: 'RunCommand', args: ['/stand'] }); push({ a: 'call', id: 11, fn: 'Send.RequestTargetCancel', args: [0] });
      push({ a: 'appemit', name: 'swarm.pos', j: '{}' }); push({ a: 'call', id: 12, fn: 'InvSync', args: [], want: 1 }); push({ a: 'call', id: 13, fn: 'DisableBot', args: [] });
      ok(F.C.period === 1000, `F14 setters / keepers / reads (set Options, StopCombat, Select, Appearing 3A, /stand, target cancel, appemit, InvSync, DisableBot) keep it asleep (now ${F.C.period})`);
      vm.runInContext('OnTargetSelected(1001, 0); OnTargetSelected(1001, 200007); OnMagicSkillUse(200007, 1001, 1204)', F.g);
      ok(F.C.period === 1000, 'F15 a target cancel and a teammate buff on me keep it asleep');
      push({ a: 'call', id: 14, fn: 'GoToPoint', args: [82100, 148100], want: 1 });
      ok(F.C.period === 62, `F16 a walk order wakes it (now ${F.C.period})`);
      runFor(70); push({ a: 'call', id: 15, fn: 'Send.RequestMagicSkillUse', args: [1204, 0, 0] });
      ok(F.C.period === 62, 'F17 a skill order wakes it');
      const wk = vm.runInContext('wakeSum()', F.g);
      console.log('   wake reasons: ' + wk);
      ok(/noWake:StopCombat/.test(wk) && /order:Send.RequestMagicSkillUse/.test(wk), 'F18 the wake reasons are counted for agent_perf.log');
      runFor(70); Wf.inv[0].Count += 5; vm.runInContext('OnInventoryUpdate()', F.g); step(F.C.period);
      ok(F.mirror.inv.find(i => i.objId === 5000).Count === Wf.inv[0].Count, 'F13 asleep: a bag change still arrives on the next tick');
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
