// OFFLINE TEST of SMOOTH-2026-10-20 + SLIM-2026-10-20 (brain host under load, slim agent reports). Nothing live: no sockets, no game.
//   node docs/plan/tools/test_brain_smooth.js        (exit code 1 when a check fails)
// Background: 2026-10-20 22:24 the watchdog killed party Tank2 10 s into the Archon Suscepter pull and quarantined the leader for 30 min
// although no callback had run longer than ~0.5 s (the worker was overloaded, its heartbeat starved) -> 8 of 9 dead.
// 1) Pool watchdog: an overloaded worker (heartbeat late, progress counter moving) is NOT restarted; a stuck one (no progress) is; a starved one
//    past hardStallMs is; a context that ran only briefly is never blamed; in a live fight one stall = restart, the 2nd = quarantine.
// 2) Pool batching: everything for a worker goes out as ONE 'batch' per tick, in order.
// 3) Memory guard: a 1-character party is judged without the isolate's fixed cost (no restart loop for Nuker19).
// 4) AppBus: emitTo of one data object to many targets serialises once (same turn), a mutated object in a later turn is serialised again,
//    the delivered envelope equals the old format, a burst of events yields to the event loop.
// 5) Worker: batches are worked off in time slices (setImmediate between slices), the progress counter counts.
'use strict';
const path = require('path'), fs = require('fs');
const BH = path.join(__dirname, '..', '..', '..', 'Dashboard', 'brain_host');
const { Pool } = require(path.join(BH, 'pool.js'));
const { AppBus } = require(path.join(BH, 'appbus.js'));
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

function fakeWorker(pool, party, o) {
  const sab = new SharedArrayBuffer(32), posted = [];
  const W = { party, w: { postMessage: (m) => posted.push(m), terminate: () => {} }, sab, mark: new Int32Array(sab, 0, 4), markT: new Float64Array(sab, 16, 2),
    lastHb: o.lastHb, names: o.names || [party], ready: true, gen: 1, dead: false, hash: 'x', startedAt: o.startedAt || 0, posted };
  pool.workers.set(party, W); return W;
}
function mkPool(extra) {
  const p = new Pool(Object.assign({ port: 0, allow: [], logFile: path.join(require('os').tmpdir(), 'smooth_test_pool.log'), stallMs: 8000, liveFight: () => '' }, extra || {}));
  p.restarted = []; p.restart = (W, why) => { p.restarted.push([W.party, why]); W.dead = true; p.workers.delete(W.party); };
  p.alert = () => {}; return p;
}

(async () => {
  // ---------------------------------------------------------------- 1) watchdog
  {
    const p = mkPool(), t = Date.now();
    const W = fakeWorker(p, 'Busy', { lastHb: t - 9000, startedAt: t - 600000 });
    Atomics.store(W.mark, 2, 1); W.markT[1] = t - 200;                // "after an await" of context 1, 200 ms ago
    W.prog = 5; W.progAt = t - 300; Atomics.store(W.mark, 3, 9);      // the counter moved since the last look
    p.watch();
    check(p.restarted.length === 0, 'overloaded worker (heartbeat 9 s late, progress moving) is NOT restarted');
    check(p.quarantined.size === 0, '... and nobody is quarantined');
  }
  {
    const p = mkPool(), t = Date.now();
    const W = fakeWorker(p, 'Stuck', { lastHb: t - 9000, startedAt: t - 600000, names: ['Tank2'] });
    Atomics.store(W.mark, 0, 1); W.markT[0] = t - 9000; Atomics.store(W.mark, 3, 7); W.prog = 7; W.progAt = t - 9000;
    p.watch();
    check(p.restarted.length === 1 && p.restarted[0][1] === 'watchdog', 'stuck worker (no progress for 9 s, inside one callback) is restarted');
    check((p.stalls.get('Tank2') || []).length === 1, '... and the context that sat in the callback gets a quarantine count');
  }
  {
    const p = mkPool({ liveFight: () => 'raid' }), t = Date.now();
    const W = fakeWorker(p, 'Raid', { lastHb: t - 9000, startedAt: t - 600000, names: ['Tank2'] });
    Atomics.store(W.mark, 0, 1); W.markT[0] = t - 9000; Atomics.store(W.mark, 3, 3); W.prog = 3; W.progAt = t - 9000;
    p.watch();
    check(p.restarted.length === 1, 'stuck worker in a live raid is restarted');
    check(!p.quarantined.has('Tank2'), '... but after ONE stall its leader is NOT quarantined (a raid without its brain is a wipe)');
    W.dead = false; p.workers.set('Raid', W); W.lastHb = Date.now() - 9000; W.progAt = Date.now() - 9000; W.markT[0] = Date.now() - 9000; p.watch();
    check(p.quarantined.has('Tank2'), '... a SECOND real stall in the same fight does quarantine it (fightQuarantineAfter 2)');
  }
  {
    const p = mkPool(), t = Date.now();
    const W = fakeWorker(p, 'Await', { lastHb: t - 9000, startedAt: t - 600000, names: ['Char1'] });
    Atomics.store(W.mark, 2, 1); W.markT[1] = t - 150; Atomics.store(W.mark, 3, 4); W.prog = 4; W.progAt = t - 9000;
    for (let i = 0; i < 4; i++) { W.dead = false; p.workers.set('Await', W); W.lastHb = Date.now() - 9000; W.progAt = Date.now() - 9000; p.watch(); }
    check(!p.quarantined.has('Char1') && !(p.stalls.get('Char1') || []).length, 'a context that only ran briefly before the stall ("after an await", 150 ms) is never blamed (4 stalls, 0 counts)');
  }
  {
    const p = mkPool({ hardStallMs: 45000 }), t = Date.now();
    const W = fakeWorker(p, 'Starved', { lastHb: t - 46000, startedAt: t - 600000 });
    Atomics.store(W.mark, 3, 1); W.prog = 0; W.progAt = t - 1000;      // still moving, but no heartbeat for 46 s
    p.watch();
    check(p.restarted.length === 1, 'a starved worker (progress but no heartbeat for > hardStallMs) is restarted');
  }
  {
    const p = mkPool(); const src = fs.readFileSync(path.join(BH, 'pool.js'), 'utf8');
    check(p.o.fightQuarantineAfter === 2, 'default fightQuarantineAfter = 2 (one stall in a live fight = restart only)');
    check(/Atomics\.add\(mark, 3, 1\)/.test(fs.readFileSync(path.join(BH, 'worker.js'), 'utf8')), 'worker.js counts progress in SAB Int32 [3]');
    check(/hardStallMs/.test(src), 'pool.js has the hard stall limit');
  }
  // ---------------------------------------------------------------- 2) batching
  {
    const p = mkPool(), t = Date.now();
    const W = fakeWorker(p, 'B', { lastHb: t, startedAt: t });
    p.send(W, { k: 'data', cid: 1, chunk: 'a\n' }); p.send(W, { k: 'appin', env: { name: 'x' } }); p.send(W, { k: 'close', cid: 1 });
    check(W.posted.length === 0, 'nothing is posted inside the same tick');
    await new Promise(r => setImmediate(r));
    check(W.posted.length === 1 && W.posted[0].k === 'batch' && W.posted[0].items.map(m => m.k).join(',') === 'data,appin,close', 'one batch per tick, items in order');
    p.send(W, { k: 'brain', accounts: [] }); await new Promise(r => setImmediate(r));
    check(W.posted.length === 2 && W.posted[1].k === 'brain', 'a single item is posted as itself');
    W.dead = true; p.send(W, { k: 'data', cid: 1, chunk: 'b\n' }); await new Promise(r => setImmediate(r));
    check(W.posted.length === 2, 'nothing goes to a dead worker');
  }
  // ---------------------------------------------------------------- 3) memory guard
  {
    const p = mkPool({ maxRssMb: 3000, memRestart: true }); const t = Date.now();
    ['Nuker19', 'Tank1', 'Spoiler7', 'Destroyer4'].forEach(n => fakeWorker(p, n, { lastHb: t, startedAt: t }));
    const ctx = (n) => Array.from({ length: n }, (_, i) => ({ name: 'c' + i }));
    p.memGuard(3600, { workers: [{ party: 'Nuker19', heapMb: 65, contexts: ctx(1) }, { party: 'Tank1', heapMb: 140, contexts: ctx(9) }, { party: 'Spoiler7', heapMb: 70, contexts: ctx(2) }, { party: 'Destroyer4', heapMb: 120, contexts: ctx(7) }] });
    check(p.restarted.length === 0, 'memory guard: a 1-character party at 65 MB is not a leak (isolate base subtracted)');
    p.memRestartAt = 0;
    p.memGuard(3600, { workers: [{ party: 'Nuker19', heapMb: 260, contexts: ctx(1) }, { party: 'Tank1', heapMb: 140, contexts: ctx(9) }, { party: 'Spoiler7', heapMb: 70, contexts: ctx(2) }, { party: 'Destroyer4', heapMb: 120, contexts: ctx(7) }] });
    check(p.restarted.length === 1 && p.restarted[0][0] === 'Nuker19', '... a real outlier (260 MB for one character) is still restarted');
  }
  // ---------------------------------------------------------------- 4) AppBus
  {
    let delivered = [];
    const bus = new AppBus({ schedule: (f) => setImmediate(f) });
    const mk = (id, name) => ({ accountId: id, name, scriptId: 's', scriptName: 'swarm.js', connected: () => true, parse: (j) => JSON.parse(j) });
    bus.join(mk('A', 'Alpha')); for (let i = 0; i < 30; i++) bus.join(mk('T' + i, 'Target' + i));
    for (let i = 0; i < 30; i++) bus.api('T' + i).on('swarm.pos', (e) => delivered.push(e));
    const A = bus.api('A'), data = { x: 1, y: 2, n: 'Alpha' };
    for (let i = 0; i < 30; i++) A.emitTo('T' + i, 'swarm.pos', data);
    check(bus.st.packReused === 29, 'emitTo of one data object to 30 targets: serialised once, reused 29 times');
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    check(delivered.length === 30 && delivered.every(e => e.data.x === 1 && e.source.characterName === 'Alpha' && typeof e.id === 'string' && typeof e.sentAtUtc === 'string'), 'all 30 delivered with the full envelope');
    check(new Set(delivered.map(e => e.id)).size === 30, 'every envelope keeps its own id');
    await Promise.resolve();
    data.x = 99; delivered = []; A.emitTo('T0', 'swarm.pos', data); await new Promise(r => setImmediate(r));
    check(delivered.length === 1 && delivered[0].data.x === 99, 'a mutated object in a later turn is serialised again (x = 99)');
    // old envelope format: JSON.stringify({id,name,sentAtUtc,source,data:null}) with the payload spliced in
    const env = { id: 'b1', name: 'n', sentAtUtc: undefined, source: { accountId: 'A', characterName: 'Alpha' }, json: '{"q":[1,2]}' };
    const old = JSON.parse(JSON.stringify({ id: env.id, name: env.name, sentAtUtc: env.sentAtUtc, source: env.source, data: null }).replace(/"data":null}$/, `"data":${env.json}}`));
    let got = null; const bus2 = new AppBus({ schedule: (f) => setImmediate(f) }); bus2.join(mk('R', 'Recv')); bus2.api('R').on('n', (e) => { got = e; });
    bus2.inject(env, 'R'); await new Promise(r => setImmediate(r));
    check(got && JSON.stringify(got) === JSON.stringify(old), 'delivered envelope = the old format (also with a missing sentAtUtc)');
    // a burst yields
    let n = 0; const bus3 = new AppBus({ schedule: (f) => setImmediate(f), sliceMs: 10 }); bus3.join(mk('S', 'Src')); bus3.join(mk('R', 'Recv'));
    let timerRan = -1;
    bus3.api('R').on('burst', () => { if (n === 0) setTimeout(() => { timerRan = n; }, 0); const t0 = Date.now(); while (Date.now() - t0 < 2) { } n++; });   // the timer starts INSIDE the drain
    for (let i = 0; i < 50; i++) bus3.api('S').emit('burst', { i });
    while (n < 50) await new Promise(r => setImmediate(r));
    check(timerRan >= 0 && timerRan < 50, `a burst of 50 slow App events yields: a timer ran after ${timerRan} of them (not after all 50)`);
    check((bus3.st.yields || 0) >= 1, '... the drain yielded at least once');
  }
  // ---------------------------------------------------------------- 6) SLIM deltas (mirror side + agent source)
  {
    const { Mirror } = require(path.join(BH, 'mirror.js'));
    const M = new Mirror('T');
    M.apply({ t: 'st', inv: [{ objId: 1, Id: 1463, Count: 500, Name: 'Soulshot' }, { objId: 2, Id: 57, Count: 1000, Name: 'Adena' }, { objId: 3, Id: 728, Count: 30, Name: 'Mana Potion' }], iv: 1 });
    const shot = M.inv[0];
    M.apply({ t: 'st', invd: { upd: [{ objId: 1, Id: 1463, Count: 497, Name: 'Soulshot' }, { objId: 4, Id: 1061, Count: 5, Name: 'Healing Potion' }], del: [3] }, iv: 2 });
    check(M.inv.length === 3 && M.inv[0] === shot && shot.Count === 497 && M.inv.some(x => x.objId === 4) && !M.inv.some(x => x.objId === 3), 'invd: changed row updated in place (same object), new row added, removed row gone');
    check(M.invVer === 2 && M.invAt > 0, 'invd: bag version + time move like a full bag');
    M.apply({ t: 'st', party: [{ objId: 10, Name: 'A', HP: 100, X: 1 }, { objId: 11, Name: 'B', HP: 50, X: 2, Title: 'x' }] });
    const b = M.party[1];
    M.apply({ t: 'st', partyd: [[11, { HP: 40, Title: null }]] });
    check(M.party[1] === b && b.HP === 40 && !('Title' in b) && M.party[0].HP === 100, 'partyd: field diffs applied to the same member object, null = field gone');
    const a2 = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'agent2.js'), 'utf8');
    check(/'hot', 'slim'\]/.test(a2) && /case 'cfg':[^\n]*m\.slim/.test(a2), 'agent2 (dev) offers caps slim and switches on the brain cfg');
    check(/const force = full && \(AG\.fullForce \|\| !AG\.slim\)/.test(a2), 'agent2: a timed full report re-sends only changed sections under slim (forced on connect / resync / login / teleport)');
    check(/case 'resync': AG\.full = true; AG\.fullForce = true;/.test(a2) && /function OnLogin\(\) \{[^\n]*AG\.fullForce = true/.test(a2), 'agent2: resync + login force a real full report');
    check(/InvSync: \(\) => \{ invPush\(true\)/.test(a2), 'agent2: InvSync still sends the whole bag (the bag barrier)');
    const rn = fs.readFileSync(path.join(BH, 'runner.js'), 'utf8');
    check(/agentSlim !== false && C\.mirror\.agentCaps\.includes\('slim'\)/.test(rn), 'runner tells a slim-capable agent cfg {slim:true} (kill switch agentSlim false)');
  }
  // ---------------------------------------------------------------- 5) worker slicing (source checks; the engine tests run the real worker)
  {
    const src = fs.readFileSync(path.join(BH, 'worker.js'), 'utf8');
    check(/m\.k === 'batch'/.test(src) && /function inqRun\(\)/.test(src) && /setImmediate\(inqRun\)/.test(src), 'worker.js works batches off in slices (inqRun + setImmediate)');
    check(/m\.k === 'stats' \|\| m\.k === 'eval'/.test(src), 'worker.js answers stats / eval at once (never behind a backlog)');
  }
  console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
