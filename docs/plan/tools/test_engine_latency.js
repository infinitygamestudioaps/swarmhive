// TEST ENGINE LATENCY (ENGINELAT-2026-10-13; owner 22:10 "the agents' delay ('no answer' on casts). A thorough review of the engine.").
// Nothing live: no L2Swarm, no game, no real Logs. What it checks:
//   1  CRTYPED   agent2's creature job reads NOTHING per creature any more (the live supplement read members L2Swarm 3.8.18 does not expose on
//                CreaturesList items: L2Mob has no IsStunned / targetCrt, L2Character's are hidden by ClearScript's type restriction; each failed
//                read ~230 us in patches/tools/perf/AgentBench.exe micro) and the brain gets the same values it always got (false / 0)
//   2  PUSH      { a: 'cfg', push: true } -> orders run the moment the async read delivers (no tick), the read re-arms, one read at a time;
//                a host without ReadAsync -> push off + tick reads; a pending read that never delivers while pinged -> push off + reconnect
//   3  PROBES    brain call ts -> agent 'ord' latency; my RequestMagicSkillUse -> my OnMagicSkillUse = 'cast'; perf line carries lat[...] + push=;
//                ev messages carry 'at'; res carries xt; caps ack / push / hot
//   4  HOT       { a: 'hot' } wakes an asleep agent to fast ticks; runner.partyHot sends it to every agent of a fighting party (throttled), not when
//                nobody fights, held 15 s after the fight; off with partyHot false; runner.pushFor / setAgentPush
//   5  LINK      call() stamps ts; callAck resolves { sent, xt, got } (an old agent without xt: xt = got)
//   6  CASTACK   swarm.js castNow with an agent that runs orders 900 ms late (a slow L2Swarm tick): without __sendAck = 'no answer' (the old
//                live symptom), with __sendAck = started + the start latency learned from the agent's run time; an agent that never runs it
//                = 'agent behind', not 'no answer'
//   7  SOURCES   node --check of the touched files; markers present
// Usage: node docs/plan/tools/test_engine_latency.js [--agent Scripts_dev/agent2.js] [--bh Dashboard/brain_host] [--swarm Scripts_dev/swarm.js]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = (k, d) => (process.argv.includes(k) ? path.resolve(process.argv[process.argv.indexOf(k) + 1]) : d);
const AGENT = arg('--agent', path.join(ROOT, 'Scripts_dev', 'agent2.js'));
const BH = arg('--bh', path.join(ROOT, 'Dashboard', 'brain_host'));
const SWARM = arg('--swarm', path.join(ROOT, 'Scripts_dev', 'swarm.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const hostFn = (f) => { const g = function () { return f.apply(this, arguments); }; Object.setPrototypeOf(g, null); return g; };

// ---------------------------------------------------------------- a fake L2Swarm host for agent2 (real-API shaped)
// Creatures: the snapshot lacks IsStunned / TargetObjId (as 3.8.10+); GetItemByObjectID returns an object WITHOUT those members (as ClearScript
// shows a CreaturesList item: type L2Creature) and counts every read of them ('dead reads').
function makeAgent(o) {
  o = o || {};
  const C = { tx: '', rx: [], interval: null, period: 0, sends: [], deadReads: 0, reads: 0, asyncReads: [], tNow: 1000000, logs: [] };
  const clk = { now: () => C.tNow };
  const W = { me: { Name: 'Nuker7', objId: 1001, X: 1000, Y: 1000, Z: 0, HP: 100, MaxHP: 100, HpPercent: 100, MP: 100, MaxMP: 100, MpPercent: 100, CP: 1, MaxCP: 1, Level: 53, ClassId: 40, IsCasting: false, IsInCombat: !!o.fight },
    cr: [] };
  for (let i = 0; i < 60; i++) W.cr.push({ objId: 300000 + i, Id: 20000 + i, Name: 'Mob' + i, crtType: 2, X: 1200 + i, Y: 1100, Z: 0, HP: 50, MaxHP: 100, HpPercent: 50, Level: 52, IsDead: false, LastCombatAggroTargetObjId: i % 3 ? 1001 : 0 });
  for (let i = 0; i < 20; i++) W.cr.push({ objId: 200000 + i, Name: 'Player' + i, crtType: 0, X: 1300 + i, Y: 1000, Z: 0, HP: 100, MaxHP: 100, HpPercent: 100, Level: 50, IsDead: false });
  const live = (d) => new Proxy(Object.assign({}, d), { get(t, k) { if (['IsStunned', 'IsSleeping', 'IsParalyzed', 'IsOutOfControl', 'targetCrt', 'TargetObjId'].includes(k)) { C.deadReads++; return undefined; } C.reads++; return t[k]; } });
  const coll = (getArr, liveFn) => ({
    forEach: hostFn((cb) => getArr().forEach((d) => cb(d))), get Count() { return getArr().length; },
    snapshotJson: hostFn(() => JSON.stringify(getArr())), SnapshotJson: hostFn(() => JSON.stringify(getArr())),
    GetItemByObjectID: hostFn((id) => { const d = getArr().find(x => x.objId === Number(id)); return d ? (liveFn ? liveFn(d) : d) : null; }),
    GetItemByID: hostFn((id) => getArr().find(x => x.Id === Number(id)) || null),
  });
  const bytes = (b) => { const x = Buffer.from(b); x.Length = x.length; return x; };
  const stream = {
    get DataAvailable() { return C.rx.length > 0; },
    Read(rx, off, len) { if (!C.rx.length) return 0; const b = C.rx.shift(); b.copy(rx, off, 0, b.length); return b.length; },
    Write(b, off, n) { C.tx += Buffer.from(b.subarray(off, off + n)).toString('utf8'); },
  };
  if (o.async !== false) stream.ReadAsync = (rx, off, len) => {           // .NET Task<int> -> a promise (EnableTaskPromiseConversion)
    const p = {}; p.promise = new Promise((res, rej) => { p.res = res; p.rej = rej; }); p.rx = rx; C.asyncReads.push(p);
    if (o.asyncHang) return p.promise;
    if (C.rx.length) { const b = C.rx.shift(); b.copy(rx, 0, 0, b.length); p.res(b.length); p.done = true; }
    return p.promise;
  };
  class TcpClient { Connect() { } Close() { C.closed = (C.closed || 0) + 1; } GetStream() { return stream; } }
  const g = {
    get Me() { return Object.assign({}, W.me, { Clan: null }); }, get Target() { return null; }, Options: {},
    CreaturesList: coll(() => W.cr, live), PartyList: coll(() => []), BuffsList: coll(() => []), Inventory: coll(() => []), SkillsList: coll(() => [{ Id: 1239, Level: 8, Name: 'Hurricane', IsReady: true, ReuseDelay: 0 }]),
    DropList: coll(() => []), PetList: coll(() => []), BuyList: coll(() => []),
    IsConnected: true, IsInCombat: !!o.fight, IsEnabled: true, IsAttacking: !!o.fight, IsSitting: false, IsPartyLeader: false, IsInParty: true, IsFollowModeOn: true, IsFollowMaster: false, CurrentZone: 'GENERAL', LastHTML: '',
    IsCharacterReady: hostFn(() => true), ItemCount: hostFn(() => 0), UseItem: hostFn(() => { }), GetQuestState: hostFn(() => null),
    Send: { RequestMagicSkillUse: hostFn((id) => C.sends.push(['RequestMagicSkillUse', id, C.tNow])), MoveBackwardToLocation: hostFn(() => C.sends.push(['Move'])) },
    App: { self: () => ({ accountId: 'acc-V' }), on: () => 1, emit: () => { }, emitTo: () => { } }, AppEvents: { on: () => 'x' },
    TcpClient, Encoding: { UTF8: { GetBytes: (s) => bytes(Buffer.from(String(s), 'utf8')), GetString: (b, i, n) => Buffer.from(b).toString('utf8', i, i + n) } },
    File: { AppendAllText: (p, t) => { C.logs.push(String(t)); } }, __DIR__: 'X:', __VERSION__: 'fake-3.8.18',
    Point3D: function (x, y, z) { this.X = x; this.Y = y; this.Z = z; }, Point: function (x, y) { this.X = x; this.Y = y; },
    setInterval: (f, ms) => { C.interval = f; C.period = ms; return 1; }, clearInterval: () => { }, setTimeout: () => 0, clearTimeout: () => { }, console,
    Date: (() => { function D(...a) { return a.length ? new Date(...a) : new Date(C.tNow); } D.now = () => C.tNow; D.prototype = Date.prototype; return D; })(),
  };
  const ctx = vm.createContext(g);
  vm.runInContext(fs.readFileSync(AGENT, 'utf8'), ctx, { filename: 'agent2.js' });
  C.ctx = ctx; C.W = W;
  C.ev = (code) => vm.runInContext(code, ctx);
  C.tick = (ms) => { C.tNow += (ms || 62); C.interval(); };
  C.brain = (o2) => { C.rx.push(Buffer.from(JSON.stringify(o2) + '\n', 'utf8')); };
  C.msgs = () => C.tx.split('\n').filter(Boolean).map(l => JSON.parse(l));
  C.flushAsync = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  C.deliverAsync = async () => { const p = C.asyncReads.find(x => !x.done); if (!p || !C.rx.length) return false; const b = C.rx.shift(); b.copy(p.rx, 0, 0, b.length); p.done = true; p.res(b.length); await C.flushAsync(); return true; };
  return C;
}

(async () => {
  console.log('1) CRTYPED: the creature job reads nothing per creature');
  {
    const A = makeAgent({ fight: true });
    for (let i = 0; i < 40; i++) { A.W.cr.forEach((m, k) => { if (k % 3 === i % 3) m.HP = (m.HP + 7) % 100; }); A.tick(); }
    const crMsgs = A.msgs().filter(m => m.cr);
    const mob = (() => { for (const m of crMsgs) { const s = (m.cr.set || []).find(x => x.objId === 300001); if (s) return s; } return null; })();
    ok(crMsgs.length > 5, `creature sections went out while fighting (${crMsgs.length})`);
    ok(A.deadReads === 0, `0 reads of members CreaturesList items do not have (was 5 per monster + 1-2 per player per creature job): ${A.deadReads}`);
    ok(mob && mob.IsStunned === false && mob.TargetObjId === 0 && mob.IsSleeping === false, `the brain still gets IsStunned false / TargetObjId 0 for monsters (what it always got): ${mob && JSON.stringify({ s: mob.IsStunned, t: mob.TargetObjId })}`);
    ok(mob && mob.LastCombatAggroTargetObjId === 1001, 'snapshot fields (LastCombatAggroTargetObjId) still pass through');
    const src = fs.readFileSync(AGENT, 'utf8'); const crf = src.slice(src.indexOf('function creatures()'), src.indexOf('function section('));
    ok(!/GetItemByObjectID|\.targetCrt|o\.Is(Stunned|Sleeping|Paralyzed|OutOfControl)/.test(crf), 'source: creatures() has no live per-creature read left');
  }

  console.log('2) PUSH: orders by the async read');
  {
    const A = makeAgent({ fight: false });
    A.tick(); A.tick();                                                   // connect + first report
    A.brain({ a: 'cfg', push: true }); A.tick();                         // read by a tick -> push armed
    ok(A.ev('AG.push === true && AG.pr === true'), 'cfg push: an async read is pending after the tick that read the switch');
    const n0 = A.sends.length;
    A.brain({ a: 'call', id: 11, fn: 'Send.RequestMagicSkillUse', args: [1239], ts: A.tNow });
    await A.deliverAsync();
    ok(A.sends.length === n0 + 1, 'the order ran at once when the bytes arrived (no tick in between)');
    ok(A.ev('AG.pr === true') && A.asyncReads.filter(x => !x.done).length === 1, 'the read re-armed (exactly one pending)');
    const before = A.asyncReads.length; A.brain({ a: 'ping', id: 1 }); A.tick(); A.tick();
    ok(A.asyncReads.length === before && A.rx.length === 1, 'ticks do not read the socket while the async read owns it');
    await A.deliverAsync();
    ok(A.ev('AG.pinged === true') && A.rx.length === 0, 'the ping went through the async read');
    // several lines in one chunk + a line split across two chunks
    const s = JSON.stringify({ a: 'call', id: 12, fn: 'Send.RequestMagicSkillUse', args: [1239] }) + '\n' + JSON.stringify({ a: 'call', id: 13, fn: 'Send.RequestMagicSkillUse', args: [1240] });
    A.rx.push(Buffer.from(s.slice(0, s.length - 10), 'utf8')); await A.deliverAsync();
    A.rx.push(Buffer.from(s.slice(s.length - 10) + '\n', 'utf8')); await A.deliverAsync();
    ok(A.sends.slice(-2).map(x => x[1]).join(',') === '1239,1240', 'two orders in a chunk / one split across chunks: both ran in order');
    A.brain({ a: 'cfg', push: false }); await A.deliverAsync();
    ok(A.ev('AG.push === false && AG.pr === false'), 'cfg push false: no new async read');
    A.brain({ a: 'call', id: 14, fn: 'Send.RequestMagicSkillUse', args: [1241] }); A.tick();
    ok(A.sends[A.sends.length - 1][1] === 1241, 'after push off the tick reads orders again');
  }
  {
    const A = makeAgent({ async: false }); A.tick(); A.tick();
    A.brain({ a: 'cfg', push: true }); A.tick();
    ok(A.ev('AG.pushOff === true && AG.pr === false') && A.msgs().some(m => m.t === 'log' && /push read unavailable/.test(m.text)), 'no ReadAsync on this host: push off, logged, tick reads go on');
    A.brain({ a: 'call', id: 21, fn: 'Send.RequestMagicSkillUse', args: [1239] }); A.tick();
    ok(A.sends.length === 1, '... and orders still run by the tick');
  }
  {
    const A = makeAgent({ asyncHang: true }); A.tick(); A.tick();
    A.brain({ a: 'ping', id: 1 }); A.tick();
    A.brain({ a: 'cfg', push: true }); A.tick();
    ok(A.ev('AG.pr === true'), 'hanging host: the read is pending');
    for (let i = 0; i < 70; i++) A.tick();                                // 4.3 s of agent time, the read never delivers
    ok(A.ev('AG.pushOff === true') && A.closed >= 1 && A.msgs().some(m => m.t === 'log' && /push OFF/.test(m.text)), 'a pending read silent > 4 s while the brain pings: push OFF + reconnect');
    for (let i = 0; i < 60; i++) A.tick();                                // reconnect (3 s gap)
    A.brain({ a: 'cfg', push: true }); A.tick(); A.tick();
    ok(A.ev('AG.pr === false && AG.pushOff === true'), 'after that: push stays off for this engine (tick reads)');
  }

  console.log('3) PROBES');
  {
    const A = makeAgent({ fight: true }); A.tick(); A.tick();
    const hello = A.msgs().find(m => m.t === 'hello');
    ok(hello && ['ack', 'push', 'hot'].every(c => hello.caps.includes(c)), 'hello caps: ack, push, hot');
    A.brain({ a: 'call', id: 31, fn: 'Send.RequestMagicSkillUse', args: [1239], ts: A.tNow, want: 1 }); A.tNow += 40; A.tick();
    const res = A.msgs().find(m => m.t === 'res' && m.id === 31);
    ok(res && res.xt > 0, 'res carries xt (when the order ran)');
    A.tNow += 180; A.ev('OnMagicSkillUse(1001, 300001, 1239)');
    const ev = A.msgs().find(m => m.t === 'ev' && m.h === 'OnMagicSkillUse');
    ok(ev && ev.at === A.tNow, 'ev carries at');
    A.tNow += 301000; A.ev('AG.ps.at = Date.now() - 301000'); A.tick();
    const perf = A.logs.find(l => / perf /.test(l)) || '';
    ok(/lat\[p50\/p95\/max ms\]=.*ord=\d+\/\d+\/\d+\(\d+\)/.test(perf) && /cast=180\/180\/180\(1\)/.test(perf) && /gap=/.test(perf) && / push=no /.test(perf), 'perf line: ord / cast (180 ms request -> start) / gap + push state: ' + perf.slice(perf.indexOf('lat['), perf.indexOf(' wakes')));
  }

  console.log('4) HOT');
  {
    const A = makeAgent({ fight: false }); A.tick(); A.tick();
    A.ev('AG.actAt = Date.now() - 120000'); A.tick();
    ok(A.ev("AG.mode") === 'sleep', 'idle agent fell asleep');
    A.brain({ a: 'hot' }); A.tick(1000);
    ok(A.ev("AG.mode") === 'fast' && A.period === 62, "{ a: 'hot' } -> fast ticks (62 ms)");
    const { Runner } = require(path.join(BH, 'runner.js'));
    const mk = (name, fight, caps) => { const w = []; return { name, w, mirror: { fl: { IsInCombat: fight }, me: {}, agentCaps: caps || ['hot'] }, link: { connected: () => true, write: (m) => w.push(m) } }; };
    const R = { o: {}, st: {}, ctxs: new Map() };
    const a = mk('Tank', true), b = mk('Healer', false), c = mk('OldAgent', false, []);
    [a, b, c].forEach(x => R.ctxs.set(x.name, x));
    Runner.prototype.partyHot.call(R);
    ok(a.w.some(m => m.a === 'hot') && b.w.some(m => m.a === 'hot') && !c.w.length, 'a fighting party member -> hot to every agent of the party that knows it (an old agent gets nothing)');
    Runner.prototype.partyHot.call(R);
    ok(b.w.filter(m => m.a === 'hot').length === 1, 'throttled (once per 4 s)');
    a.mirror.fl.IsInCombat = false; b.hotAt -= 5000; Runner.prototype.partyHot.call(R);
    ok(b.w.filter(m => m.a === 'hot').length === 2, 'held after the fight (15 s)');
    for (const k of R.hotUntilP.keys()) R.hotUntilP.set(k, Date.now() - 1); b.hotAt -= 5000; Runner.prototype.partyHot.call(R);   // FARMPERF: hold kept per party
    ok(b.w.filter(m => m.a === 'hot').length === 2, 'nobody fights and the hold is over: no hint');
    const RP = { o: { partyOf: (n) => n[0] }, st: {}, ctxs: new Map() };   // FARMPERF worker slots: two parties in one worker (party = first letter)
    const pa = mk('Atank', true), pb = mk('Ahealer', false), qa = mk('Bidle', false);
    [pa, pb, qa].forEach(x => RP.ctxs.set(x.name, x)); Runner.prototype.partyHot.call(RP);
    ok(pb.w.some(m => m.a === 'hot') && !qa.w.length, 'two parties in one worker: only the fighting party gets the hint');
    const R2 = { o: { partyHot: false }, st: {}, ctxs: new Map([['T', mk('T', true)]]) }; Runner.prototype.partyHot.call(R2);
    ok(!R2.ctxs.get('T').w.length, 'partyHot false: off');
    const R3 = { o: { agentPush: ['Tank'] }, ctxs: new Map([['Tank', mk('Tank', false)], ['Healer', mk('Healer', false)]]) };
    ok(Runner.prototype.pushFor.call(R3, { name: 'Tank' }) && !Runner.prototype.pushFor.call(R3, { name: 'Healer' }), 'pushFor: per name list');
    R3.pushFor = Runner.prototype.pushFor; Runner.prototype.setAgentPush.call(R3, true);
    ok(R3.ctxs.get('Healer').link && R3.ctxs.get('Healer').w.some(m => m.a === 'cfg' && m.push === true) && !R3.ctxs.get('Tank').w.length, 'setAgentPush(true): only the agents whose state changed get cfg');
  }

  console.log('5) LINK');
  {
    const { AgentLink } = require(path.join(BH, 'link.js'));
    const out = []; const L = new AgentLink({ destroyed: false, write: (s) => out.push(JSON.parse(s)) });
    L.call('Send.MoveBackwardToLocation', [1, 2, 3], false);
    ok(out[0].ts > 0, 'call() stamps ts');
    const p = L.callAck('Send.RequestMagicSkillUse', [1239]);
    ok(out[1].want === 1, 'callAck = a call with want');
    L.onResult({ id: out[1].id, ok: true, v: null, xt: 12345 });
    const v = await p; ok(v && v.xt === 12345 && v.sent > 0 && v.got >= v.sent, 'callAck resolves { sent, xt, got }');
    const p2 = L.callAck('Send.RequestMagicSkillUse', [1239]); L.onResult({ id: out[2].id, ok: true, v: null });
    const v2 = await p2; ok(v2.xt === v2.got, 'an old agent without xt: xt = got');
    const p3 = L.call('GoToPoint', [1, 2], true); L.onResult({ id: out[3].id, ok: true, v: true, xt: 5 });
    ok((await p3) === true, 'a plain want call still resolves with the value');
  }

  console.log('6) CASTACK: castNow with an agent that runs orders late');
  {
    const src = fs.readFileSync(SWARM, 'utf8');
    const a = src.indexOf('// CASTLOOP-BEGIN'), b = src.indexOf('// CASTLOOP-END'), ha = src.indexOf('// CASTLOOP host side'), hb = src.indexOf('/** Mana Potion while a caster fights');
    ok(a > 0 && b > a && ha > 0 && hb > ha, 'swarm.js CASTLOOP slices found');
    // the server starts a cast 60 ms after the AGENT ran the request; the agent runs it agentLag ms after the brain sent it
    const run = async (agentLag, withAck, never) => {
      const sv = { started: 0 }; let hooks = null;
      const exec = (id) => { if (never) return; setTimeout(() => { sv.started++; hooks.started(id); }, 60); };
      const env = { now: () => Date.now(), sleep: (ms) => new Promise(r => setTimeout(r, Math.max(1, ms))), num: (v) => Number(v) || 0,
        Me: { IsCasting: false, MP: 500, MAtkSpd: 333, PAtkSpd: 333 }, SkillsList: { GetItemByID: (id) => ({ Id: id }) }, skillPlan: { attacks: [{ id: 1239, name: 'Hurricane' }] },
        Send: { RequestMagicSkillUse: (id) => setTimeout(() => exec(id), agentLag) }, File: {}, Options: {}, state: {}, log() { }, note() { }, logError() { }, appendShared() { }, __useAck: !!withAck, hiveSkillsOn: () => true };   // HIVESW-2026-10-15: Hive picks the skills (the default)   // v1.6.6 hotfix: the ack path is behind CASTLOOP.useAck (off live)
      if (withAck) env.__sendAck = (fn, args, ms) => new Promise((res, rej) => { if (never) { setTimeout(() => rej(new Error('no ack')), Math.min(ms, 3000)); return; } const sent = Date.now(); setTimeout(() => { exec(args[0]); res({ sent, xt: Date.now(), got: Date.now() + 1 }); }, agentLag); });
      const names = Object.keys(env);
      const H = new Function(...names, src.slice(a, b) + '\n' + src.slice(ha, hb) + '\nif (__useAck) CASTLOOP.useAck = true;\nreturn { castNow, castLoopOnMine, castSysPush, castStats, castLat };')(...names.map(k => env[k]));
      if (withAck) { try { H.castLoopOnMine.__cl = 1; } catch (e) { } }
      hooks = { started: (id) => H.castLoopOnMine(id, 99) };
      const t0 = Date.now(); const r = await H.castNow({ id: 1239, name: 'Hurricane', hit: 300, magic: true });
      return { r, ms: Date.now() - t0, lat: H.castLat.v, why: H.castStats.refusedWhy };
    };
    const old = await run(900, false);
    ok(!old.r.started && old.r.refuse && old.r.refuse.key === 'none', `before (no ack), agent 900 ms behind: 'no answer' after ${old.ms} ms — the live symptom`);
    const neu = await run(900, true);
    ok(neu.r.started, `with __sendAck, agent 900 ms behind: started (${neu.ms} ms)`);
    ok(neu.lat > 0 && neu.lat < 300, `the learned start latency is the GAME part (agent ran it -> started): ${neu.lat} ms (not 900+)`);
    const fast = await run(20, true);
    ok(fast.r.started && fast.ms < 800, `agent on time: started in ${fast.ms} ms`);
    const dead = await run(0, true, true);
    ok(!dead.r.started && dead.r.refuse && (dead.r.refuse.key === 'agent' || dead.r.refuse.key === 'none'), `the agent never runs it: not started, refused as '${dead.r.refuse && dead.r.refuse.label}' (v1.6.6: a failed ack is re-sent the plain way, so 'no answer' is right when that fails too; ${dead.ms} ms)`);
  }

  console.log('7) SOURCES');
  {
    for (const f of [AGENT, SWARM, path.join(BH, 'host.js'), path.join(BH, 'link.js'), path.join(BH, 'runner.js'), path.join(BH, 'pool.js'), path.join(BH, 'worker.js')]) {
      let good = true; try { cp.execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { good = false; }
      ok(good, 'node --check ' + path.relative(ROOT, f));
    }
    const host = fs.readFileSync(path.join(BH, 'host.js'), 'utf8'), pool = fs.readFileSync(path.join(BH, 'pool.js'), 'utf8'), wk = fs.readFileSync(path.join(BH, 'worker.js'), 'utf8');
    ok(/local\.__sendAck = /.test(host), 'host.js exposes __sendAck');
    ok(/monitorEventLoopDelay/.test(pool) && /monitorEventLoopDelay/.test(wk) && /LAG \(worst 10 s window/.test(pool), 'pool + worker measure event-loop delay (stats file + LAG line)');
    ok(/applyAgentCfg\(j\)/.test(pool) && /case 'agentcfg'/.test(wk), 'brain_host.json agentPush / partyHot reach the workers live');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
