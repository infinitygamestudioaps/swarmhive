// OFFLINE TEST of the engine audit fix group "ops" (2026-10-12; audit findings #18 #19 #23 #32 #33 #34). Nothing reaches the game, L2Swarm,
// the live brain pool (port 8094) or the dashboard: every pool here listens on a random local port with a throw-away script in a temp folder.
//   node docs/plan/tools/test_engine_ops.js                    (the live files; exit code 1 when a check fails)
//   node docs/plan/tools/test_engine_ops.js --bh <brain_host dir> --server <server.js> --swarm <swarm.js>
//   ... --patches <dir with patch_engine_ops.js + patch_engine_resilience.js> [--patch-base <unpatched swarm.js>]: both patch orders apply
//        (the same checks against other copies, e.g. the backups from before the fix: they must FAIL there)
// #34 vfs File.Move must throw when the destination exists (.NET), so swarm.js's spot-claim lock (withClaimLock) stays exclusive.
// #23/#33 the pool reads + syntax-checks the DEPLOYED Scripts/swarm.js ONCE and hands that text to every worker: a restart never compiles a
//        half-edited file, a broken file is refused (no 200 ms crash loop), --watch-script / IPC reload brings a deploy to every party, restart backoff.
// #32 the dashboard supervisor never starts swarm.js inside L2Swarm for a brain character (Scripts/data/brain_host.json): it asks the pool.
// #18 supply run: the loot handover runs inside the hold only when the receiver is reachable on foot, else right after it; failures are failures.
// #19 the spot picker's acceptance (spot.pickedFor) wins over 'outgrew the spot' (no area hop every 3 min at a wide-window pick).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? path.resolve(process.argv[i + 1]) : d; };
const BH = arg('--bh', path.join(ROOT, 'Dashboard', 'brain_host'));
const SERVER = arg('--server', path.join(ROOT, 'Dashboard', 'server.js'));
const SWARM = arg('--swarm', path.join(ROOT, 'Scripts_dev', 'swarm.js'));
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const tryCheck = async (what, fn) => { try { check(!!(await fn()), what); } catch (e) { check(false, `${what} (threw: ${String(e && e.message || e).split('\n')[0].slice(0, 160)})`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const mkTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'engine_ops_'));
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const blk = (src, b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); return i < 0 || j < i ? null : src.slice(i, j); };
console.log(`brain_host: ${BH}\nserver.js:  ${SERVER}\nswarm.js:   ${SWARM}\n`);

// ======================================================================= #34 vfs File.Move like .NET
function vfsChecks() {
  console.log('--- #34 vfs File.Move');
  const { createVfs } = require(path.join(BH, 'vfs.js'));
  const tmp = mkTmp(), root = path.join(tmp, 'root'); fs.mkdirSync(path.join(root, 'Logs'), { recursive: true });
  const W = (p) => path.win32.join(root.replace(/\//g, '\\'), p);
  const A = createVfs({ root }).File, B = createVfs({ root }).File;      // two contexts / two workers on the same real files
  const lock = W('Logs\\spot_claims.lock');
  A.WriteAllText(W('Logs\\a.tmp'), 'A'); A.Move(W('Logs\\a.tmp'), lock);
  check(A.Exists(lock) && A.ReadAllText(lock) === 'A' && !A.Exists(W('Logs\\a.tmp')), 'Move to a free destination: moved, source gone');
  B.WriteAllText(W('Logs\\b.tmp'), 'B');
  let threw = null; try { B.Move(W('Logs\\b.tmp'), lock); } catch (e) { threw = e; }
  check(!!threw, `Move onto an EXISTING destination throws (.NET IOException) — ${threw ? threw.name + ': ' + threw.message.slice(0, 70) : 'it did NOT throw'}`);
  check(A.ReadAllText(lock) === 'A' && B.Exists(W('Logs\\b.tmp')), 'the holder\'s lock is untouched and the loser keeps its temp file');
  // swarm.js withClaimLock with two contexts: the second one must NOT get the lock while the first holds it
  const withClaimLock = (F, who, fn) => { const tmpf = W(`Logs\\spot_claims.lock.${who}`); let got = false;
    for (let i = 0; i < 3 && !got; i++) { try { F.WriteAllText(tmpf, who); F.Move(tmpf, lock); got = true; } catch (e) { try { F.Delete(tmpf); } catch (e2) { } } }
    if (!got) return 'busy'; try { return fn(); } finally { try { F.Delete(lock); } catch (e) { } } };
  let inner = null;
  const outer = withClaimLock(A, 'Spoiler6', () => { inner = withClaimLock(B, 'Spoiler2', () => 'got it too'); return 'held'; });
  // (the lock from the first part is still there: clear it so the first context can take it)
  check(outer === 'busy' || inner === 'busy', `withClaimLock: a second leader is refused while the lock is held (outer ${outer}, inner ${inner})`);
  try { A.Delete(lock); } catch (e) { }
  inner = null;
  const outer2 = withClaimLock(A, 'Spoiler6', () => { inner = withClaimLock(B, 'Spoiler2', () => 'got it too'); return 'held'; });
  check(outer2 === 'held' && inner === 'busy' && !A.Exists(lock), `withClaimLock: free lock -> first gets it, the nested second is refused, the lock is released after (${outer2}/${inner})`);
  let ow = true; try { A.WriteAllText(W('Logs\\c.tmp'), 'C'); A.WriteAllText(W('Logs\\d.txt'), 'D'); A.Move(W('Logs\\c.tmp'), W('Logs\\d.txt'), true); } catch (e) { ow = false; }
  check(ow && A.ReadAllText(W('Logs\\d.txt')) === 'C', 'Move(a, b, true) = the overwrite overload replaces b');
  // overlay mode (simulator): an existing destination in the overlay or in the real tree also refuses
  const ov = path.join(tmp, 'ov'); fs.mkdirSync(ov);
  const O = createVfs({ root, overlay: ov }).File;
  O.WriteAllText(W('Logs\\o1.tmp'), '1'); O.WriteAllText(W('Logs\\o.lock'), 'held');
  let othrew = false; try { O.Move(W('Logs\\o1.tmp'), W('Logs\\o.lock')); } catch (e) { othrew = true; }
  check(othrew && O.ReadAllText(W('Logs\\o.lock')) === 'held', 'overlay: Move onto an existing destination throws too');
  // review 2026-10-12: a REAL file moved through the overlay must not be hard-linked into it (shared inode: a write to the moved file
  // would land in the real tree = a simulator / dry run writing live state)
  fs.writeFileSync(path.join(root, 'Logs', 'real_src.txt'), 'REAL');
  O.Move(W('Logs\\real_src.txt'), W('Logs\\moved.txt')); O.WriteAllText(W('Logs\\moved.txt'), 'OVERLAY WRITE');
  const realNow = fs.readFileSync(path.join(root, 'Logs', 'real_src.txt'), 'utf8');
  check(realNow === 'REAL' && O.ReadAllText(W('Logs\\moved.txt')) === 'OVERLAY WRITE' && !O.Exists(W('Logs\\real_src.txt')), `overlay: moving a real file and then writing it leaves the real file alone (real file now "${realNow}")`);
  // review 2026-10-12: the destination is written but the source cannot be removed (Windows EPERM while another process reads it): the move
  // happened, so it must NOT throw (swarm.js would think it lost the lock while its lock file exists)
  const unl = fs.unlinkSync; let mthrew = null;
  A.WriteAllText(W('Logs\\e.tmp'), 'E');
  fs.unlinkSync = (p) => { if (/e\.tmp$/i.test(String(p))) { const e = new Error('EPERM: operation not permitted'); e.code = 'EPERM'; throw e; } return unl(p); };
  try { A.Move(W('Logs\\e.tmp'), W('Logs\\e.lock')); } catch (e) { mthrew = e; } finally { fs.unlinkSync = unl; }
  check(!mthrew && A.ReadAllText(W('Logs\\e.lock')) === 'E', `Move whose source cannot be removed afterwards: no exception, the destination is there (${mthrew ? 'threw ' + mthrew.message : 'ok'})`);
}

// ======================================================================= #23/#33 pool: one deployed source, reload, backoff
async function poolChecks() {
  console.log('--- #23/#33 pool');
  const { Pool } = require(path.join(BH, 'pool.js'));
  const def = new Pool({ allow: [], partyOf: (x) => x, logFile: null });
  check(/[\\/]Scripts[\\/]swarm\.js$/i.test(def.o.script), `the pool runs the DEPLOYED Scripts/swarm.js by default (${path.relative(ROOT, def.o.script)})`);
  const pjs = fs.readFileSync(path.join(BH, 'pool.js'), 'utf8');
  check(/opt\('--script', path\.join\(ROOT, 'Scripts', 'swarm\.js'\)\)/.test(pjs), 'pool.js CLI default --script = Scripts/swarm.js');
  const tmp = mkTmp(), script = path.join(tmp, 'swarm.js'), logFile = path.join(tmp, 'pool.log');
  const v1 = 'var VERSION = 1;\n', v2 = 'var VERSION = 2;\n', v3 = 'var VERSION = 3;\n', broken = 'var VERSION = ;\n function (\n';
  fs.writeFileSync(script, v1);
  const port = 22400 + Math.floor(Math.random() * 400);
  const P = new Pool({ port, allow: [], partyOf: (x) => x, script, logFile, root: tmp, stallMs: 60000, hbMs: 250, watchScriptMs: 0, reloadGapMs: 300 });
  await P.start();
  const waitReady = async (party, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 15000)) { const W = P.workers.get(party); if (W && W.ready) return W; await sleep(100); } return P.workers.get(party) || null; };
  try {
    P.worker('PartyA'); P.worker('PartyB');
    const a = await waitReady('PartyA'), b = await waitReady('PartyB');
    check(a && b && a.ready && b.ready, 'two party workers start');
    await tryCheck(`every worker runs the text the pool read once (worker hash ${a && a.runHash} = pool ${P.srcHash} = file ${sha(v1)})`, () => a.runHash === sha(v1) && b.runHash === sha(v1) && P.srcHash === sha(v1));
    // the file is edited (half-written / broken) and a watchdog / crash restart happens: the new worker must NOT compile the file
    fs.writeFileSync(script, broken);
    const restartsBefore = P.st.workerRestarts;
    P.restart(a, 'test: watchdog');
    await sleep(2500);
    const a2 = await waitReady('PartyA', 8000);
    const restarts = P.st.workerRestarts - restartsBefore;
    check(a2 && a2.ready && restarts <= 1, `a restart while the file is broken: the party comes back at once on the loaded version, no crash loop (${restarts} restart(s) in 2.5 s, ready ${!!(a2 && a2.ready)})`);
    await tryCheck(`... and it runs the SAME version as the other party (${a2 && a2.runHash} = ${b.runHash})`, () => a2.runHash === b.runHash && a2.runHash === sha(v1));
    // a reload of a broken file is refused loudly and nothing restarts
    let r = null; try { r = P.reload('test broken'); } catch (e) { r = { threw: e.message }; }
    const log1 = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    check(r && r.ok === false && /does NOT compile/.test(log1) && P.workers.get('PartyA') === a2, `reload of a broken file: refused, logged "does NOT compile", workers untouched (${JSON.stringify(r).slice(0, 120)})`);
    // a good new version (= a deploy): every party restarts on it
    fs.writeFileSync(script, v2);
    try { r = P.reload('test deploy'); } catch (e) { r = { threw: e.message }; }
    await sleep(1500);
    const a3 = await waitReady('PartyA'), b3 = await waitReady('PartyB');
    await tryCheck(`reload of a good version: both parties restart on it (${r && r.hash}; A ${a3 && a3.runHash}, B ${b3 && b3.runHash})`, () => r.ok && r.changed && a3.runHash === sha(v2) && b3.runHash === sha(v2));
    // restart backoff: 200 ms twice, then growing (no 200 ms loop)
    await tryCheck('restart backoff: 200, 200, then 5 s, 10 s, 20 s ... (max 5 min)', () => { const d = [1, 2, 3, 4, 5].map(() => P.backoff('Loop')); return d[0] === 200 && d[1] === 200 && d[2] === 5000 && d[3] === 10000 && d[4] === 20000; });
    // a worker that reports 'fatal' (its Runner could not start) is restarted with that backoff, not in 200 ms
    await tryCheck("worker 'fatal' -> logged + restart with backoff", async () => {
      const fake = { party: 'Fatal', w: { terminate() { return Promise.resolve(); }, postMessage() { } }, names: [], dead: false, gen: 999, hash: 'x' };
      P.fails.set('Fatal', [Date.now(), Date.now()]);
      P.workers.set('Fatal', fake); P.fromWorker(fake, { k: 'fatal', why: 'SyntaxError: Unexpected token' });
      await sleep(400);
      const lg = fs.readFileSync(logFile, 'utf8');
      const ok = /FATAL party Fatal/.test(lg) && /backing off 5 s/.test(lg) && !P.workers.has('Fatal');
      P.fails.delete('Fatal'); for (const t of P.timers) clearTimeout(t); P.timers.clear();
      return ok;
    });
    // health / revive for the dashboard supervisor
    await tryCheck('health(): script, hash, workers, quarantined', () => { const h = P.health(); return h.hash === sha(v2) && h.workers.length >= 2 && Array.isArray(h.quarantined); });
    await tryCheck("revive(): a quarantined character is refused ('quarantined'), an unknown one 'agent not connected'", () => {
      P.quarantined.add('Ghost'); const q = P.revive('Ghost'); P.quarantined.delete('Ghost'); const u = P.revive('Nobody');
      return q.ok === false && q.why === 'quarantined' && u.ok === false && u.why === 'agent not connected';
    });
    // review 2026-10-12: the supervisor asks once per stale CHARACTER -> one party worker start per 2 min, never past a pending backoff
    await tryCheck('revive(): 2 stale characters of one party -> ONE worker restart; a worker that started < 2 min ago is not restarted', async () => {
      const fakeSock = { destroyed: false, write() { return true; }, end() { }, destroy() { } };
      P.conns.set(9901, { sock: fakeSock, name: 'ReviveOne', party: 'PartyB', hello: '{"t":"x"}', refused: false });
      P.conns.set(9902, { sock: fakeSock, name: 'ReviveTwo', party: 'PartyB', hello: '{"t":"x"}', refused: false });
      try {
        const Wb = P.workers.get('PartyB'); const r0 = P.st.workerRestarts;
        const fresh = P.revive('ReviveOne', 'test');                          // PartyB restarted by the reload above: seconds ago
        const freshOk = P.st.workerRestarts === r0 && P.workers.get('PartyB') === Wb;
        Wb.startedAt = Date.now() - 600000;                                    // pretend it has run 10 min
        const r1 = P.revive('ReviveOne', 'test'); await sleep(50);
        const r2 = P.revive('ReviveTwo', 'test');                              // same party, right after
        await sleep(400);
        const n = P.st.workerRestarts - r0;
        return freshOk && fresh.ok && r1.ok && r2.ok && n === 1;
      } finally { P.conns.delete(9901); P.conns.delete(9902); }
    });
    await tryCheck('revive(): a party waiting out its restart backoff is NOT started early', async () => {
      const fakeSock = { destroyed: false, write() { return true; }, end() { }, destroy() { } };
      P.conns.set(9903, { sock: fakeSock, name: 'ReviveThree', party: 'PartyA', hello: '{"t":"x"}', refused: false });
      try {
        const Wa = P.workers.get('PartyA'); P.restart(Wa, 'test: backoff', 60000);   // pending restart in 60 s
        const r = P.revive('ReviveThree', 'test'); await sleep(300);
        return r.ok && !P.workers.has('PartyA');
      } finally { P.conns.delete(9903); }
    });
  } finally { await P.stop(); }
  // --watch-script: a deploy (file changed + stable) reaches the running workers by itself
  const P2 = new Pool({ port: port + 1, allow: [], partyOf: (x) => x, script, logFile, root: tmp, stallMs: 60000, watchScriptMs: 300 });
  await P2.start();
  try {
    P2.worker('PartyW');
    let W = null; for (let i = 0; i < 150 && !(W && W.ready); i++) { await sleep(100); W = P2.workers.get('PartyW'); }
    fs.writeFileSync(script, v3);
    let ok = false; for (let i = 0; i < 100 && !ok; i++) { await sleep(100); const X = P2.workers.get('PartyW'); ok = !!(X && X.ready && X.runHash === sha(v3)); }
    check(ok, `--watch-script: a changed file (deploy) is reloaded and the party runs it within 10 s (${P2.workers.get('PartyW') && P2.workers.get('PartyW').runHash} = ${sha(v3)})`);
  } catch (e) { check(false, '--watch-script threw: ' + e.message); } finally { await P2.stop(); }
  // a pool that starts with a broken file: no worker, no crash loop; the first good version starts it
  fs.writeFileSync(script, broken);
  const P3 = new Pool({ port: port + 2, allow: [], partyOf: (x) => x, script, logFile, root: tmp, stallMs: 60000, watchScriptMs: 300 });
  await P3.start();
  try {
    let W0 = null; try { W0 = P3.worker('PartyX'); } catch (e) { }
    await sleep(1500);
    const st = P3.st.workerRestarts;
    check(!W0 && st === 0, `start with a file that does not compile: no worker, no restart loop (worker ${!!W0}, restarts ${st})`);
    // review 2026-10-12: an agent that connects while there is no compiling script: the lines after its hello in the SAME chunk are kept for
    // the replay (they were dropped)
    const EE = require('events'), fake = new EE();
    Object.assign(fake, { setNoDelay() { }, setEncoding() { }, write() { return true; }, end() { }, destroy() { }, destroyed: false });
    P3.o.allow = null; P3.handle(fake);
    fake.emit('data', JSON.stringify({ t: 'hello', name: 'Early', accountId: 'e1' }) + '\n{"t":"st","early":1}\n');
    const ce = Array.from(P3.conns.values()).find(x => x.name === 'Early');
    const kept = ce ? (ce.tail || '') + (ce.q ? ce.q.join('') : '') : '';
    check(!!ce && kept.indexOf('"early":1') >= 0, `no worker yet: the agent's first chunk after its hello is kept for the replay (${JSON.stringify(kept).slice(0, 60)})`);
  } catch (e) { check(false, 'broken start threw: ' + e.message); } finally { await P3.stop(); }
  const wjs = fs.readFileSync(path.join(BH, 'worker.js'), 'utf8');
  check(/k: 'fatal'/.test(wjs), "worker.js reports a Runner start failure as 'fatal' instead of dying (exit 1)");
  const rjs = fs.readFileSync(path.join(BH, 'runner.js'), 'utf8');
  check(/typeof this\.o\.source === 'string'/.test(rjs), 'runner.js compiles opts.source (the pool\'s text) when given');
}

// ======================================================================= #32 dashboard supervisor
function supervisorChecks() {
  console.log('--- #32 dashboard supervisor');
  const src = fs.readFileSync(SERVER, 'utf8');
  const b = blk(src, '// SUPBRAIN-PURE start', '// SUPBRAIN-PURE end');
  check(!!b, 'server.js has the SUPBRAIN-PURE decision block');
  if (!b) return;
  const supDecide = new Function(b + '\nreturn supDecide;')();
  const now = 1e12, brain = { on: true, allow: ['Spoiler6', 'Spoiler4'] };
  const x = (o) => Object.assign({ now, manual: false, last: 0, recent: [], l2mb: 1500, brain, bh: { running: true, ipc: true }, lastPoolKill: 0 }, o || {});
  const stale = { name: 'Spoiler6', ageSec: 300, asyncAge: 0 };
  check(supDecide(stale, x()).act === 'revive', 'brain character, state 300 s old, pool with IPC -> revive (restart its party worker)');
  check(supDecide(stale, x({ bh: { running: true, ipc: false } })).act === 'restartPool', 'brain character, pool without IPC -> restart the pool');
  check(supDecide(stale, x({ bh: { running: true, ipc: false }, lastPoolKill: now - 60000 })).act === 'log', '... at most one pool restart per 15 min');
  check(supDecide(stale, x({ bh: { running: false, ipc: false } })).act === 'log', 'brain character, pool not running -> log only');
  const brainActs = [x(), x({ l2mb: 1000 }), x({ l2mb: 9000 }), x({ bh: { running: false } }), x({ bh: { running: true, ipc: false } }), x({ recent: [now, now, now, now, now, now] })].map(o => supDecide(stale, o).act);
  check(brainActs.every(a => a !== 'restartScript'), `a brain character NEVER gets 'start swarm.js inside L2Swarm' (${brainActs.join(', ')})`);
  check(supDecide({ name: 'Tank1', ageSec: 300, asyncAge: 0 }, x({ l2mb: 1500 })).act === 'restartScript', 'an L2Swarm character (not in brain_host.json) still gets its swarm.js restarted');
  check(supDecide({ name: 'Tank1', ageSec: 300, asyncAge: 0 }, x({ l2mb: 5000 })).act === 'log', '... not while L2Swarm uses > 3000 MB');
  check(supDecide(stale, x({ brain: { on: false, allow: ['Spoiler6'] } })).act === 'restartScript', 'brain_host.json switched off (rollback): the character is an L2Swarm character again');
  check(supDecide(stale, x({ manual: true })).act === 'none' && supDecide({ name: 'Spoiler6', ageSec: 20, asyncAge: 0 }, x()).act === 'none' && supDecide(stale, x({ last: now - 60000 })).act === 'none', 'manual characters, healthy ones and the 5-min limit: nothing');
  const loop = src.slice(src.indexOf('// SUPBRAIN-PURE end'), src.indexOf('// GEOPATH SERVICE'));
  check(/supDecide\(/.test(loop) && /d\.act === 'revive'/.test(loop) && /bhAsk\(\{ k: 'revive'/.test(loop), 'the supervisor loop uses supDecide and asks the pool (IPC revive) for brain characters');
  check(/'--script', path\.join\(ROOT, 'Scripts', 'swarm\.js'\)/.test(src) && /'--watch-script'/.test(src), 'the dashboard starts the brain on the DEPLOYED Scripts/swarm.js with --watch-script');
  check(/stdio: \['ignore', 'ignore', 'ignore', 'ipc'\]/.test(src) && /function bhAsk\(/.test(src), 'the brain pool is spawned with an IPC channel (bhAsk)');
}

// ======================================================================= #18 / #19 swarm.js
function swarmChecks() {
  console.log('--- #18 supply run loot handover / #19 picker vs move-on');
  const src = fs.readFileSync(SWARM, 'utf8');
  const hov = blk(src, '// HANDOVER-PURE-BEGIN', '// HANDOVER-PURE-END');
  let H = null; try { H = new Function(hov + '\nreturn { hovTravelDecide, lootSupplyDecide, lootGiveVerdict };')(); } catch (e) { }
  check(!!H, 'HANDOVER-PURE has lootSupplyDecide + lootGiveVerdict');
  if (H) {
    const me = { x: 83000, y: 148000, z: -3400, town: 'giran' };
    const field = { name: 'Dagger1', x: 80552, y: -3928, z: -3000, town: '', dead: false, busy: '' };   // Outlaw Forest, ~152k away (the incident)
    const inGiran = { name: 'Dagger1', x: 81500, y: 148500, z: -3400, town: 'giran', dead: false, busy: '' };
    const d1 = H.lootSupplyDecide(field, me, {});
    check(d1.act === 'skip', `receiver out hunting in the field (152k): an automatic handover never walks into his hunting ground (2026-10-14, Spoiler5 died in the Necropolis) — '${d1.act}' (${d1.why})`);
    const inOren = Object.assign({}, field, { x: 82698, y: 53190, town: 'oren' }); const d1b = H.lootSupplyDecide(inOren, me, {});
    check(d1b.act === 'after', `receiver in another town: the handover waits until the hold is released — '${d1b.act}' (${d1b.why})`);
    check(H.lootSupplyDecide(field, me, { inline: true }).act === 'skip', "... not inside a trip's inline supply stop (the trip goes on)");
    check(H.lootSupplyDecide(inGiran, me, {}).act === 'now', 'receiver in Giran: handed over inside the run (walk, no teleport)');
    check(H.lootSupplyDecide(null, me, {}).act === 'skip' && H.lootSupplyDecide(Object.assign({}, field, { dead: true }), me, {}).act === 'skip', 'receiver offline / dead: not now');
    const v1 = H.lootGiveVerdict({ Spoiler6: { state: 'failed', msg: 'could not reach Dagger1 (6 tries)' } }, []);
    check(!v1.ok && /FAILED/.test(v1.msg) && /could not reach Dagger1/.test(v1.msg), `a failed handover is reported as a failure: "${v1.msg}"`);
    check(H.lootGiveVerdict({ Spoiler6: { state: 'done' }, Spoiler2: { state: 'done' } }, []).msg === 'done', 'all givers done -> done');
    check(!H.lootGiveVerdict({ Spoiler6: { state: 'done' } }, ['Spoiler2']).ok, 'a giver still busy after 25 min -> not ok');
  }
  // the incident replayed: supply hold on, receiver 152k away. OLD flow = handover inside the hold -> 6 refused teleports; NEW = none
  const holdRefuses = (hold) => hold;                                       // supplyHoldsTeam() for the leader while the hold is set
  const replay = (flowNew) => { let refused = 0, delivered = false; let hold = true;
    const travel = () => { for (let t = 0; t < 6; t++) { if (holdRefuses(hold)) refused++; else { delivered = true; return; } } };
    const act = flowNew && H ? H.lootSupplyDecide({ name: 'Dagger1', x: 82698, y: 53190, z: -1496, town: 'oren' }, { x: 83000, y: 148000, z: -3400, town: 'giran' }, {}).act : 'now';
    if (act === 'now') travel();
    hold = false;                                                            // finally: state.supplyHold = null
    if (act === 'after') travel();
    return { refused, delivered }; };
  const o = replay(false), nw = replay(true);
  check(o.refused === 6 && !o.delivered && nw.refused === 0 && nw.delivered, `replay of Spoiler6 13:55: old flow ${o.refused} refused teleports / delivered ${o.delivered}; new flow ${nw.refused} refused / delivered ${nw.delivered}`);
  const ls = src.slice(src.indexOf('async function leadSupply('), src.indexOf('// --- Adena ---'));
  const iHold = ls.indexOf('if (state.supplyHold === runId) state.supplyHold = null;'), iAfter = ls.indexOf("leadLootGive('after the supply run')");
  check(iAfter > iHold && iHold > 0, 'leadSupply: the deferred handover runs after state.supplyHold = null (finally)');
  check(/ld\.act === 'now'\) \{ const lr = await leadLootGive\('supply run'\)/.test(ls), 'leadSupply: inside the hold only when lootSupplyDecide says now');
  const lg = src.slice(src.indexOf('async function leadLootGive('), src.indexOf('async function leadLootGive(') + 4000);
  check(/lootGiveVerdict\(finalSt, left\)/.test(lg) && /intentDone\('loot', vd\.ok, msg\)/.test(lg), "leadLootGive: intentDone('loot') follows the givers' real states");

  // #19
  const sp = blk(src, '// SPOTREPICK-PURE-BEGIN', '// SPOTREPICK-PURE-END');
  const M = new Function(sp + '\nreturn { SPOT_REPICK, spotRepickDue, MOVE_ON, moveOnWhy };')();
  const base = { mins: 3.2, recentKills: 30, expGain: 2, avgMob: 16, teamMax: 19 };
  const wideSpot = { name: 'Western Mining Zone: area 2', levelMin: 14, levelMax: 17, manual: false, pickedFor: 19 };
  check(M.moveOnWhy(Object.assign({}, base, { pickLvl: 19, spot: wideSpot })) === '', `a wide-window pick for lvl 19 (monsters 14-17) is NOT 'outgrown' at lvl 19 ("${M.moveOnWhy(Object.assign({}, base, { pickLvl: 19, spot: wideSpot }))}")`);
  check(/outgrew/.test(M.moveOnWhy(Object.assign({}, base, { pickLvl: 20, teamMax: 20, spot: wideSpot }))), '... but it is once the team reached lvl 20 (leveled since the pick)');
  check(/outgrew/.test(M.moveOnWhy(Object.assign({}, base, { pickLvl: 19, spot: Object.assign({}, wideSpot, { pickedFor: undefined }) }))), 'a spot without pickedFor (dashboard / older paths) keeps the old rule');
  check(!M.spotRepickDue({ now: 1e9, lastPick: 1e9 - 120000, spot: Object.assign({}, wideSpot, { levelMax: 16 }), level: 19 }), 'spotRepickDue: no outgrown re-pick every minute for a spot picked for this level');
  check(M.spotRepickDue({ now: 1e9, lastPick: 1e9 - 120000, spot: Object.assign({}, wideSpot, { levelMax: 16, pickedFor: 18 }), level: 19 }), '... but yes after the team leveled');
  // Spoiler4 13:36-14:16 replayed: lvl 19, every pick a wide one (14-17); the move-on check runs 180 s after each pick
  const hops = (rule) => { let h = 0; for (let t = 0, picked = 0; t < 40 * 60; t += 5) { if (t - picked >= 180) { const why = rule({ mins: (t - picked) / 60, recentKills: 30, expGain: 2, avgMob: 16, pickLvl: 19, teamMax: 19, spot: { levelMax: 17, pickedFor: 19 } }); if (why) { h++; picked = t; } else if ((t - picked) / 60 >= 5) picked = t; } } return h; };
  const oldMove = (() => { try { const ob = sp.replace(' && !(Number(o.spot.pickedFor) >= Number(o.pickLvl))', ''); return new Function(ob + '\nreturn moveOnWhy;')(); } catch (e) { return null; } })();
  const hNew = hops(M.moveOnWhy), hOld = oldMove ? hops(oldMove) : -1;
  check(hNew === 0, `40 min at lvl 19 on wide-window areas: ${hNew} area changes (old rule: ${hOld})`);
  // (the resilience patch #17 turns 'const spot = pickSpot(...)' into 'let spot = ...' + a resume block: look between the pick and manualSpotOnPick)
  const iPick = src.search(/(const|let) spot = pickSpot\(pickLvl, solo\);/), iMan = iPick >= 0 ? src.indexOf('manualSpotOnPick(spot);', iPick) : -1;
  check(iPick >= 0 && iMan > iPick && /spot\.pickedFor = pickLvl/.test(src.slice(iPick, iMan)), 'autoLevelLoop tags every automatic pick with the level it was picked for (before manualSpotOnPick)');
  // review 2026-10-12: the deferred handover must not start after a !stop / abort (abortRegroup) or a lead pause
  const fin = ls.slice(iHold, iAfter + 10);
  check(/lootAfter && !Me\.IsDead && regroupAlive\(runId\) && !leadPaused\(\)/.test(fin), 'leadSupply: no deferred handover after a !stop / abort / lead pause (regroupAlive + leadPaused)');
}

// ======================================================================= the patch script with the other groups' patches (review 2026-10-12)
// --patches <dir>: apply patch_engine_ops.js before AND after patch_engine_resilience.js (both touch the autoLevelLoop pick) on temp copies
function patchOrderChecks(dir) {
  console.log('--- patch order (ops / resilience)');
  const { execFileSync } = require('child_process');
  const ops = path.join(dir, 'patch_engine_ops.js'), res = path.join(dir, 'patch_engine_resilience.js');
  if (!fs.existsSync(ops) || !fs.existsSync(res)) { check(false, `patch scripts not found in ${dir}`); return; }
  for (const order of [[ops, res], [res, ops]]) {
    const tmp = path.join(mkTmp(), 'swarm.js'); fs.copyFileSync(arg('--patch-base', path.join(ROOT, 'Scripts_dev', 'swarm.js')), tmp);   // the UNPATCHED file
    let ok = true, err = '';
    for (const p of order) { try { execFileSync(process.execPath, [p, tmp], { stdio: 'pipe' }); } catch (e) { ok = false; err = path.basename(p) + ': ' + String(e.stderr || e.message).trim().split('\n')[0].slice(0, 140); break; } }
    if (ok) { try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); } catch (e) { ok = false; err = 'node --check failed'; } }
    const s = ok ? fs.readFileSync(tmp, 'utf8') : '';
    const i = s.search(/let spot = pickSpot\(pickLvl, solo\);/), j = i >= 0 ? s.indexOf('manualSpotOnPick(spot);', i) : -1;
    check(ok && i >= 0 && j > i && /spot\.pickedFor = pickLvl/.test(s.slice(i, j)) && s.slice(i, j).indexOf('spotResumeDecide') >= 0,
      `${order.map(p => path.basename(p, '.js').replace('patch_engine_', '')).join(' then ')}: both apply, node --check ok, pickedFor after the resume block${err ? ' — ' + err : ''}`);
  }
}

(async () => {
  try { vfsChecks(); } catch (e) { check(false, '#34 threw: ' + e.message); }
  try { await poolChecks(); } catch (e) { check(false, '#23/#33 threw: ' + e.message); }
  try { supervisorChecks(); } catch (e) { check(false, '#32 threw: ' + e.message); }
  try { swarmChecks(); } catch (e) { check(false, '#18/#19 threw: ' + e.message); }
  const PD = process.argv.indexOf('--patches') >= 0 ? arg('--patches', null) : null;
  if (PD) { try { patchOrderChecks(PD); } catch (e) { check(false, 'patch order threw: ' + e.message); } }
  console.log(`\n${n - fails}/${n} checks passed${fails ? ` — ${fails} FAILED` : ''}`);
  process.exit(fails ? 1 : 0);
})();
