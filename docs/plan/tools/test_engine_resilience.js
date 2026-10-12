// ENGINE AUDIT, GROUP "RESILIENCE" (2026-10-12): tests for findings #17, #25, #26, #35, #37, #38, #40 (engine_audit.json). Nothing live: no
// L2Swarm, no game, no real Logs (overlays in the temp folder), no dashboard.
//   A  swarm.js pure blocks   #17 spotResumeDecide / spotResumeInside (SPOTRESUME-PURE), #25 raidFightResumeDecide (RAIDRESUME-PURE)
//   B  brain ping + agent     #25 the runner pings every agent; a SILENT brain (socket open, worker stuck) -> agent2 drinks potions itself
//   C  orphan dispose         #40 OnBeforeScriptStop runs on dispose only while the agent is connected (else its writes would be lost)
//   D  worker pool            #37 a stall after an await is attributed to its context + 3 stalls -> quarantine; #25 one stall during a live
//                             raid -> quarantine; quarantine ends; #26/#35 live allow list (add / remove without a restart, a broken file
//                             changes nothing); #38 stats file
//   E  dashboard rules        #26/#35 Dashboard/brain_host/supervise.js: no restart for allow changes, keep running on a bad read, defer in fights
//   F  memory guard           #38 above maxRssMb: alert + restart of the biggest worker WITHOUT a live fight
//   G  swarm.js in the brain  #25 a raid fight record -> straight back into raid mode at boot; #17 a saved spot I stand in is kept after a restart
// Usage: node docs/plan/tools/test_engine_resilience.js [--bh <brain_host dir>] [--agent <agent2.js>] [--swarm <swarm.js>] [--only A,B,...]
//   default: Dashboard/brain_host, Scripts_dev/agent2.js, a temp copy of Scripts_dev/swarm.js with patch_engine_resilience.js applied
//   (when Scripts_dev/swarm.js is not patched yet). "Before" run: --bh Settings/backup/engine_fixes_2026-10-12/timing --agent
//   Settings/backup/engine_fixes_2026-10-12/timing/agent2.js --swarm Scripts_dev/swarm.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), net = require('net'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const BH = path.resolve(arg('--bh', path.join(ROOT, 'Dashboard', 'brain_host')));
const AGENT = path.resolve(arg('--agent', path.join(ROOT, 'Scripts_dev', 'agent2.js')));
const ONLY = arg('--only', '') ? arg('--only').split(',') : null;
const PATCH = process.env.RES_PATCH || '%TEMP%/scratch';
const T1 = require('./test_brain_host.js');
const { World, GIRAN } = T1;
const { Clock } = require(path.join(BH, 'clock.js'));
const { Runner } = require(path.join(BH, 'runner.js'));

let pass = 0, fail = 0; const results = [];
const ok = (cond, msg) => { const l = (cond ? '  ok   ' : '  FAIL ') + msg; results.push(l); if (cond) pass++; else fail++; console.log(l); };
const sleepR = (ms) => new Promise(r => setTimeout(r, ms));
const mkTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'engine_res_'));
const on = (k) => !ONLY || ONLY.includes(k);

function swarmFile() {
  const given = arg('--swarm', '');
  if (given) return path.resolve(given);
  const dev = path.join(ROOT, 'Scripts_dev', 'swarm.js'), src = fs.readFileSync(dev, 'utf8');
  if (src.includes('SPOTRESUME-PURE-BEGIN')) return dev;
  const f = path.join(mkTmp(), 'swarm.js'); fs.writeFileSync(f, src);
  const r = cp.spawnSync(process.execPath, [PATCH, f], { encoding: 'utf8' });
  if (r.status !== 0) { console.log('patch failed:', r.stdout, r.stderr); }
  return f;
}
function block(src, name) { const a = src.indexOf('// ' + name + '-BEGIN'), b = src.indexOf('// ' + name + '-END'); return a >= 0 && b > a ? src.slice(a, b) : null; }

// ================================================================== A. swarm.js pure blocks (#17, #25)
function partA(SW) {
  console.log('A. swarm.js pure blocks (' + path.relative(ROOT, SW) + ')');
  const src = fs.readFileSync(SW, 'utf8');
  const rp = block(src, 'SPOTREPICK-PURE'), sr = block(src, 'SPOTRESUME-PURE'), rr = block(src, 'RAIDRESUME-PURE');
  ok(!!(rp && sr && rr), `#17/#25 pure blocks present (SPOTREPICK ${!!rp}, SPOTRESUME ${!!sr}, RAIDRESUME ${!!rr})`);
  if (!(rp && sr && rr)) return;
  const sb = { Math, Number, String, isFinite, JSON, Object, Array };
  vm.createContext(sb);
  vm.runInContext(`function inPolygon(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)) c = !c; } return c; }
    function nearPolygon(x, y, P, m) { if (!P || P.length < 3) return false; if (inPolygon(x, y, P)) return true; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[j], b = P[i], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; let t = L ? ((x - a.x) * dx + (y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= m) return true; } return false; }
    ${rp}\n${sr}\n${rr}\nthis.T = { spotResumeDecide, spotResumeInside, raidFightResumeDecide, spotRepickKey };`, sb);
  const T = sb.T, t = 1e12;
  const area = { name: 'Frozen Waterfall: area 11', levelMin: 16, levelMax: 22, center: { x: 1000, y: 1000, z: -100 }, area: { id: 'fw-11' }, poly: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }, { x: 0, y: 2000 }], zr: [-300, 100] };
  const base = { now: t, saved: { spot: area, at: t - 60000 }, pickKey: 'area:nz-2', pickManual: false, level: 18, me: { x: 1200, y: 900, z: -120 }, bad: () => false, inside: T.spotResumeInside };
  const D = (o) => T.spotResumeDecide(Object.assign({}, base, o));
  ok(D({}).keep === true, `#17 a restart while hunting Frozen Waterfall area 11 keeps it (fresh pick was Neutral Zone area 2): ${D({}).why}`);
  ok(D({ pickKey: 'area:fw-11' }).keep === true, '#17 fresh pick = the saved spot: kept');
  ok(D({ me: { x: 9000, y: 9000, z: -100 } }).keep === false, `#17 not at the saved spot any more: not kept (${D({ me: { x: 9000, y: 9000, z: -100 } }).why})`);
  ok(D({ me: { x: 1200, y: 900, z: -2000 } }).keep === false, '#17 another floor: not kept');
  ok(D({ level: 25 }).keep === false, `#17 outgrown (pick level 25 > 22 + 2): not kept (${D({ level: 25 }).why})`);
  ok(D({ pickManual: true }).keep === false, '#17 a dashboard choice elsewhere wins');
  ok(D({ bad: (k) => k === 'area:fw-11' }).keep === false, '#17 a spot on the skip list is not kept');
  ok(D({ saved: { spot: area, at: t - 3600000 } }).keep === false, '#17 a record older than 30 min is not used');
  ok(D({ saved: { spot: Object.assign({}, area, { manual: true }) }, pickKey: 'area:other' }).keep === false, '#17 a former dashboard choice that changed is not kept');
  const R = T.raidFightResumeDecide;
  ok(R({ boss: { name: 'Kraven' }, at: t - 9000 }, t, {}).resume === true, '#25 a raid fight record 9 s old -> resume the fight at once');
  ok(R({ boss: { name: 'Kraven' }, at: t - 120000 }, t, {}).resume === false, '#25 a record 2 min old (the fight is long over) -> no resume');
  ok(R({}, t, {}).resume === false && R(null, t, {}).resume === false, '#25 no record / cleared record -> no resume');
  ok(R({ boss: { name: 'Kraven' }, at: t - 5000 }, t, { dead: true }).resume === false, '#25 dead -> no resume');
}

// ================================================================== B + C. runner ping, silent brain reflex, orphan dispose (virtual clock)
const TINY = (overlay) => `globalThis.__boot = (globalThis.__boot || 0) + 1;
globalThis.OnBeforeScriptStop = function () { try { File.WriteAllText(__DIR__ + '\\\\Logs\\\\obss_' + Me.Name + '.txt', 'ran'); } catch (e) { } };
`;
async function partBC() {
  console.log('B/C. brain ping + silent-brain reflex, orphan dispose (' + path.relative(ROOT, BH) + ', ' + path.relative(ROOT, AGENT) + ')');
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(overlay);
  const script = path.join(tmp, 'tiny.js'); fs.writeFileSync(script, TINY());
  const port = 23100 + Math.floor(Math.random() * 400);
  const clock = new Clock({ virtual: true, start: Date.now() });
  const runner = new Runner({ port, clock, overlay, isolate: ['Logs'], script, allow: ['Crafter1', 'Spoiler1', 'Healer1'], logFile: path.join(tmp, 'runner.log'), root: ROOT.replace(/\//g, '\\'), disposeAfterMs: 3600000 });
  await runner.start();
  const world = new World(clock); world.sockets = new Set();
  const F = world.addChar('Crafter1', 57, 45, GIRAN.x, GIRAN.y, { leader: true });
  const S = world.addChar('Spoiler1', 55, 44, GIRAN.x + 100, GIRAN.y);
  const L = world.addChar('Healer1', 30, 44, GIRAN.x - 100, GIRAN.y);
  const src = fs.readFileSync(AGENT, 'utf8');
  for (const c of world.chars.values()) world.startAgent(c, port, src);
  const run = async (ms) => { for (let t = 0; t < ms; t += 100) { await clock.advance(100); world.step(100); await sleepR(1); } };
  const ag = (c, expr) => { try { return vm.runInContext(expr, c.ctx); } catch (e) { return undefined; } };
  await run(4000);
  ok(runner.ctxs.size === 3 && Array.from(runner.ctxs.values()).every(C => C.link.connected()), `3 agents connected to the runner (${runner.ctxs.size})`);
  ok(ag(F, 'AG.pinged') === true, `#25 the brain pings the agent (agent saw a ping: ${ag(F, 'AG.pinged')})`);
  // ---- B0 (review): a HEALTHY brain (pings on) and 30 % HP: the agent leaves the potions to the brain (no reflex while pings arrive)
  F.me.HpPercent = 30; F.me.HP = 600;
  { const c0 = world.calls.length; await run(6000); const own = world.calls.slice(c0).filter(k => k.who === 'Crafter1' && k.fn === 'UseItem');
    ok(own.length === 0, `#25 a healthy brain (pings arriving) at 30 % HP: the agent does NOT drink by itself (${own.length} UseItem)`); }
  // ---- B: the brain goes silent (its thread is stuck: no ping, nothing else) while the socket stays open; Crafter1 at 30 % HP
  if (runner.pingT) { runner.pingT.dispose(); runner.pingT = null; }
  F.me.HpPercent = 30; F.me.HP = 600;
  const calls0 = world.calls.length;
  await run(6000);
  const pots = world.calls.slice(calls0).filter(k => k.who === 'Crafter1' && k.fn === 'UseItem');
  ok(pots.length >= 1 && runner.ctxs.get('Crafter1').link.connected(), `#25 silent brain (socket still open): the agent drank a potion itself within 6 s (${pots.map(p => p.args[0]).join(', ') || 'none'})`);
  // ---- C: orphan dispose. Healer1's agent is stopped and its socket closed; Spoiler1's stays connected
  L.T.dispose(); try { L.lastSock.destroy(); } catch (e) { }
  await run(1000);
  const CL = runner.ctxs.get('Healer1'), CS = runner.ctxs.get('Spoiler1');
  ok(CL && !CL.link.connected(), 'C Healer1\'s agent is gone (context kept, link down)');
  runner.dispose(CL, 'agent gone (test)');
  runner.dispose(CS, 'test with the agent connected');
  await run(500);
  const obss = (n) => fs.existsSync(path.join(overlay, 'Logs', `obss_${n}.txt`));
  ok(!obss('Healer1'), `#40 orphan dispose (no agent): OnBeforeScriptStop NOT run (its L2Swarm writes would be dropped; the castloop record stays) — ran: ${obss('Healer1')}`);
  ok(obss('Spoiler1'), `#40 dispose with the agent connected: OnBeforeScriptStop runs (ran: ${obss('Spoiler1')})`);
  await runner.stop('end');
  for (const s of world.sockets) try { s.destroy(); } catch (e) { }
  for (const c of world.chars.values()) c.T.dispose();
  world.timers.dispose();
}

// ================================================================== D + F. worker pool (real time)
function fakeAgent(port, name) {
  const s = net.connect(port, '127.0.0.1'); const A = { name, s, lines: [], bye: false, closed: false };
  s.setEncoding('utf8'); let buf = '';
  s.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); A.lines.push(l); try { const m = JSON.parse(l); if (m.a === 'bye') A.bye = m.why || true; if (m.a === 'ping') s.write(JSON.stringify({ t: 'pong', id: m.id }) + '\n'); } catch (e) { } } });
  s.on('close', () => { A.closed = true; }); s.on('error', () => { });
  s.on('connect', () => s.write(JSON.stringify({ t: 'hello', v: 3, name, accountId: 'acc-' + name }) + '\n'));
  return A;
}
async function waitFor(fn, ms, step) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { } await sleepR(step || 100); } return false; }
const logOf = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };
async function partD() {
  console.log('D. worker pool (' + path.relative(ROOT, BH) + ')');
  const { Pool } = require(path.join(BH, 'pool.js'));
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(path.join(overlay, 'Logs'), { recursive: true });
  const script = path.join(tmp, 'tiny.js'); fs.writeFileSync(script, TINY());
  const cfgF = path.join(tmp, 'brain_host.json'), statsF = path.join(tmp, 'stats.json'), logF = path.join(tmp, 'pool.log');
  const parties = { A1: 'P1', A2: 'P1', B1: 'P2', D1: 'P3', E1: 'P4' };
  fs.writeFileSync(cfgF, JSON.stringify({ on: true, allow: ['A1', 'A2', 'B1', 'D1'] }));
  const port = 23600 + Math.floor(Math.random() * 300);
  const P = new Pool({ port, allow: ['A1', 'A2', 'B1', 'D1'], partyOf: (n) => parties[n] || n, script, overlay, isolate: ['Logs'], logFile: logF, stallMs: 1500, hbMs: 100, allowEval: true,
    root: ROOT.replace(/\//g, '\\'), backoffBaseMs: 300, quarantineMs: 8000, configFile: cfgF, configPollMs: 300, statsFile: statsF, statsMs: 500 });
  await P.start();
  const A = { A1: fakeAgent(port, 'A1'), A2: fakeAgent(port, 'A2'), B1: fakeAgent(port, 'B1'), D1: fakeAgent(port, 'D1') };
  const ev = (n, code) => P.eval(n, code);
  const booted = (n) => waitFor(async () => { const r = await ev(n, 'globalThis.__boot'); return r && r.ok && r.v >= 1; }, 8000, 150);
  ok(await booted('A1') && await booted('B1') && await booted('D1'), 'D pool: contexts A1 (P1), B1 (P2), D1 (P3) booted');
  // ---- D1: a stall in a promise continuation (code after an await) is attributed to its context; 3 of them -> quarantine
  const stall = (n, ms) => ev(n, `setTimeout(function () { Promise.resolve().then(function () { const t = Date.now(); while (Date.now() - t < ${ms}) { } }); }, 20); 'armed'`);
  let q = false;
  for (let k = 1; k <= 3; k++) {
    await booted('A1');
    const kills0 = P.st.watchdogKills; await stall('A1', 3500);
    await waitFor(() => P.st.watchdogKills > kills0, 6000);
    if (k === 1) { const wd = logOf(logF).split(/\r?\n/).filter(l => /WATCHDOG party P1/.test(l)).pop() || ''; ok(/context A1 after an await/.test(wd), `#37 a stall after an await is attributed to its context: "${wd.replace(/^\S+ \[pool\] /, '').slice(0, 150)}"`); }
    if (P.quarantined.has('A1')) { q = k; break; }
  }
  await waitFor(() => A.A1.bye, 2000);                                         // review: the bye travels over a socket (was read in the same tick: flaky)
  ok(q === 3 && A.A1.bye, `#37 A1 stalled its worker 3 times (async code) -> QUARANTINED (stall #${q}), its agent told bye (${A.A1.bye})`);
  ok(await booted('A2'), '#37 the rest of party P1 (A2) runs again in a fresh worker');
  // ---- D2: a live raid of party P2: ONE stall of B1 quarantines it
  fs.writeFileSync(path.join(overlay, 'Logs', 'raid_live_P2.json'), JSON.stringify({ boss: 'Kraven', at: new Date().toISOString() }));
  { const kills0 = P.st.watchdogKills; await stall('B1', 3000); await waitFor(() => P.st.watchdogKills > kills0, 6000); }
  await waitFor(() => A.B1.bye, 2000);
  ok(P.quarantined.has('B1') && !!A.B1.bye, `#25 one stall during a live raid of its party -> B1 quarantined at once (agent bye: ${A.B1.bye})`);
  // ---- D3: live allow list: D1 removed, E1 added; party P1 (A2) keeps running (no restart), a broken file changes nothing
  await ev('A2', 'globalThis.__keep = 4242');
  const restarts0 = P.st.workerRestarts;
  fs.writeFileSync(cfgF, JSON.stringify({ on: true, allow: ['A1', 'A2', 'B1', 'E1'] }));
  await waitFor(() => A.D1.bye, 4000);
  ok(!!A.D1.bye, `#26/#35 D1 removed from brain_host.json -> its agent told bye without a pool restart (${A.D1.bye})`);
  const dLog = await waitFor(() => /D1 left the brain/.test(logOf(logF)), 3000);
  ok(dLog, `#26/#35 D1's context disposed in its worker ("D1 left the brain" logged: ${dLog})`);
  A.E1 = fakeAgent(port, 'E1');
  ok(await booted('E1') && !A.E1.bye, '#26/#35 E1 added to brain_host.json -> its hello is accepted at once (context booted)');
  const keep = await ev('A2', 'globalThis.__keep');
  ok(keep && keep.v === 4242 && P.st.workerRestarts === restarts0, `#26/#35 party P1 was NOT restarted by the list change (A2 kept its state: ${keep && keep.v}; worker restarts +${P.st.workerRestarts - restarts0})`);
  fs.writeFileSync(cfgF, '{ "on": true, "allow": [ "A2", ');                      // half-written file
  await sleepR(1200);
  const keep2 = await ev('A2', 'globalThis.__keep');
  ok(keep2 && keep2.v === 4242 && !A.A2.bye && !A.E1.bye && (P.o.allow || []).includes('E1'), '#35 an unreadable brain_host.json changes nothing (list kept, nobody dropped)');
  // ---- D4: stats file
  await waitFor(() => fs.existsSync(statsF), 3000);
  let S = null; try { S = JSON.parse(fs.readFileSync(statsF, 'utf8')); } catch (e) { }
  ok(!!(S && S.pid === process.pid && S.rssMb > 0 && Array.isArray(S.workers) && S.workers.length >= 2 && S.quarantined.some(x => x.name === 'A1') && S.alerts.some(a => a.kind === 'quarantine')),
    `#38 stats file: pid ${S && S.pid}, RSS ${S && S.rssMb} MB, ${S && S.workers.length} workers (${S ? S.workers.map(w => w.party + ' ' + w.heapMb + ' MB').join(', ') : '-'}), quarantined ${S ? JSON.stringify(S.quarantined.map(x => x.name)) : '-'}, ${S ? S.alerts.length : 0} alerts`);
  // ---- D4b (review): swarm.js names the live file after the writer (liveFileName() = Me.Name); party P4's file is raid_live_E1.json
  fs.writeFileSync(path.join(overlay, 'Logs', 'raid_live_E1.json'), JSON.stringify({ boss: 'Kraven', at: new Date().toISOString() }));
  { const kills0 = P.st.watchdogKills; await stall('E1', 3000); await waitFor(() => P.st.watchdogKills > kills0, 6000); }
  await waitFor(() => A.E1.bye, 2000);
  ok(P.quarantined.has('E1') && !!A.E1.bye, `#25 a live raid file named after the party's leader (raid_live_E1.json, party key P4) counts: one stall quarantines E1 (bye: ${A.E1.bye})`);
  // ---- D5: a quarantine ends (quarantineMs 8 s here): A1's next hello is accepted again
  await waitFor(() => !P.quarantined.has('A1') || (P.quarExpire && (P.quarExpire(), !P.quarantined.has('A1'))), 12000, 500);
  A.A1b = fakeAgent(port, 'A1');
  await sleepR(1500);
  ok(!A.A1b.bye && !P.quarantined.has('A1'), `#37 the quarantine of A1 ended after quarantineMs: its next hello is accepted (bye: ${A.A1b.bye})`);
  for (const a of Object.values(A)) try { a.s.destroy(); } catch (e) { }
  await P.stop();
}
async function partF() {
  console.log('F. pool memory guard (' + path.relative(ROOT, BH) + ')');
  const { Pool } = require(path.join(BH, 'pool.js'));
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(path.join(overlay, 'Logs'), { recursive: true });
  const script = path.join(tmp, 'tiny.js'); fs.writeFileSync(script, TINY());
  const logF = path.join(tmp, 'pool.log'), port = 23950 + Math.floor(Math.random() * 40);
  const parties = { M1: 'Q1', N1: 'Q2' };
  const P = new Pool({ port, allow: ['M1', 'N1'], partyOf: (n) => parties[n], script, overlay, isolate: ['Logs'], logFile: logF, stallMs: 4000, hbMs: 100, allowEval: true, root: ROOT.replace(/\//g, '\\'),
    statsMs: 400, maxRssMb: 1, memRestart: true, memRestartGapMs: 0 });
  fs.writeFileSync(path.join(overlay, 'Logs', 'kamaloka_live_Q1.json'), '{}');      // party Q1 is in a Kamaloka right now
  await P.start();
  const A = [fakeAgent(port, 'M1'), fakeAgent(port, 'N1')];
  await waitFor(() => /memory guard|restarting party/.test(logOf(logF)), 6000);
  const log = logOf(logF);
  ok(/ALERT memory/.test(log), '#38 pool RSS above maxRssMb -> ALERT memory');
  ok(/restarting party Q2/.test(log) && !/restarting party Q1/.test(log), '#38 the memory guard restarts the biggest worker WITHOUT a live fight (Q2), never the party in a Kamaloka (Q1)');
  for (const a of A) try { a.s.destroy(); } catch (e) { }
  await P.stop();
  // ---- F2 (review): a pool that is big because of its REAL load (4 similar workers) only gets the alert; a worker that stands out is restarted
  const P2 = new Pool({ port: 0, allow: [], partyOf: (n) => n, script, overlay, isolate: ['Logs'], logFile: logF, maxRssMb: 1000, memRestart: true, memRestartGapMs: 0 });
  const got = []; P2.restart = (W, why) => got.push(W.party);
  for (const p of ['a', 'b', 'c', 'd']) P2.workers.set(p, { party: p, dead: false, names: [] });
  P2.memGuard(1500, { workers: [{ party: 'a', heapMb: 300 }, { party: 'b', heapMb: 310 }, { party: 'c', heapMb: 290 }, { party: 'd', heapMb: 305 }] });
  ok(got.length === 0 && P2.alerts.some(a => a.kind === 'memory'), `#38 (review) real load (4 workers 290-310 MB, RSS 1500 > 1000): alert only, no restart (restarted: ${JSON.stringify(got)})`);
  P2.memRestartAt = 0;
  P2.memGuard(1500, { workers: [{ party: 'a', heapMb: 300 }, { party: 'b', heapMb: 310 }, { party: 'c', heapMb: 900 }, { party: 'd', heapMb: 305 }] });
  ok(got.length === 1 && got[0] === 'c', `#38 (review) one worker stands out (900 MB vs median 305 MB): that one is restarted (${JSON.stringify(got)})`);
}

// ================================================================== E. dashboard rules (supervise.js)
function partE() {
  console.log('E. dashboard brain-host rules (' + path.relative(ROOT, path.join(BH, 'supervise.js')) + ')');
  let S = null; try { S = require(path.join(BH, 'supervise.js')); } catch (e) { }
  ok(!!S, '#26/#35 Dashboard/brain_host/supervise.js exists');
  if (!S) return;
  const c1 = S.readCfg({ on: true, allow: ['Spoiler6', 'Healer6'], bridge: true, pool: true }, null);
  const c2 = S.readCfg({ on: true, allow: ['Spoiler6', 'Healer6', 'Spoiler2', 'Healer2'], bridge: true, pool: true }, c1);
  ok(S.restartSig(c1) === S.restartSig(c2), '#26 adding a party to the allow list does NOT change the restart signature (pool mode)');
  ok(S.decide({ running: true, sig: S.restartSig(c1), cfg: c2, fights: [] }).act === 'none', '#26 -> no pool restart for an allow-list change');
  ok(S.restartSig(S.readCfg({ on: true, allow: ['A'], pool: false }, null)) !== S.restartSig(S.readCfg({ on: true, allow: ['A', 'B'], pool: false }, null)), '#26 single-process runner mode: a list change still needs a restart');
  const bad = S.readCfg(null, c2);
  ok(bad === c2 && bad.on === true, '#35 an unreadable brain_host.json keeps the last good config (was: {} = on:false = pool killed)');
  const c3 = S.readCfg({ on: true, allow: ['Spoiler6'], bridge: false, pool: true }, c2);
  const tmp = mkTmp(); fs.writeFileSync(path.join(tmp, 'raid_live_Spoiler6.json'), '{}');
  const fights = S.liveFights(tmp, S.brainParties(['Spoiler6', 'Healer6'], [{ character: 'Spoiler6', party: 'Spoiler6' }, { character: 'Healer6', party: 'Spoiler6' }]), Date.now(), 30000);
  ok(fights.length === 1 && fights[0].kind === 'raid', `#26 live raid of a brain party found (${JSON.stringify(fights)})`);
  { const t2 = mkTmp(); fs.writeFileSync(path.join(t2, 'raid_live_Healer6.json'), '{}'); const acc = [{ character: 'Spoiler6', party: 'Spoiler6' }, { character: 'Healer6', party: 'Spoiler6' }];
    const f2 = typeof S.fightKeys === 'function' ? S.liveFights(t2, S.fightKeys(['Spoiler6', 'Healer6'], acc), Date.now(), 30000) : [];
    ok(f2.length === 1, `#26 (review) a live raid file named after the writer (raid_live_Healer6.json, party Spoiler6) also defers a restart (${JSON.stringify(f2)})`); }
  const d = S.decide({ running: true, sig: S.restartSig(c2), cfg: c3, fights });
  ok(d.act === 'defer', `#26 a needed restart (bridge off) WAITS while a brain party raids: ${d.act} (${d.why})`);
  ok(S.decide({ running: true, sig: S.restartSig(c2), cfg: c3, fights: [] }).act === 'restart', '#26 ... and restarts once no fight is live');
}

// ================================================================== G. swarm.js in the brain: raid resume + spot resume (#25, #17)
async function partG(SW) {
  console.log('G. swarm.js in the brain: raid resume + spot resume (' + path.relative(ROOT, SW) + ')');
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(path.join(overlay, 'Logs'), { recursive: true });
  const port = 24100 + Math.floor(Math.random() * 300);
  const clock = new Clock({ virtual: true, start: Date.now() });
  const TIMAK = { x: 70969, y: 69956, z: -3691 };
  // Crafter1's window was in a raid fight 5 s ago (pool restart); the leader's activity record says autolevel at a spot he stands in
  fs.writeFileSync(path.join(overlay, 'Logs', 'raidfight_Spoiler1.json'), JSON.stringify({ boss: { name: 'Timak Orc Warrior', x: TIMAK.x - 400, y: TIMAK.y + 450, z: TIMAK.z }, lead: false, startedAt: clock.now() - 60000, at: clock.now() - 5000 }));
  const spot = { name: 'Resume Test Spot', levelMin: 40, levelMax: 50, center: { x: TIMAK.x, y: TIMAK.y, z: TIMAK.z }, radius: 2000, noScale: true, custom: true };
  fs.writeFileSync(path.join(overlay, 'Logs', 'activity_Crafter1.json'), JSON.stringify({ type: 'autolevel', solo: false, spot, spotKey: spot.name, spotAt: clock.now() - 120000, at: new Date().toISOString() }));
  const runner = new Runner({ port, clock, overlay, isolate: ['Logs'], script: SW, allow: ['Crafter1', 'Spoiler1', 'Healer1'], logFile: path.join(tmp, 'runner.log'), root: ROOT.replace(/\//g, '\\'), geopath: true });
  await runner.start(); T1.setCur(runner);
  const world = new World(clock); world.sockets = new Set();
  world.addChar('Crafter1', 57, 45, TIMAK.x, TIMAK.y, { leader: true, skills: [[1216, 'Self Heal', 1, 'SELF'], [255, 'Power Smash', 10, 'ENEMY']] });
  world.addChar('Spoiler1', 55, 44, TIMAK.x + 150, TIMAK.y + 60, { skills: [[254, 'Spoil', 5, 'ENEMY'], [42, 'Sweeper', 1, 'SELF']] });
  world.addChar('Healer1', 30, 44, TIMAK.x - 120, TIMAK.y + 80, { skills: [[1011, 'Heal', 18, 'ONE'], [1015, 'Battle Heal', 15, 'ONE']] });
  world.addMob('Timak Orc Warrior', 20586, 43, TIMAK.x - 400, TIMAK.y + 450, TIMAK.z); world.addMob('Timak Orc Soldier', 20585, 42, TIMAK.x + 500, TIMAK.y + 300, TIMAK.z);
  for (const c of world.chars.values()) { c.flags.CurrentZone = 'GENERALZONE'; c.me.Z = TIMAK.z; }
  const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'agent2.js'), 'utf8');
  for (const c of world.chars.values()) world.startAgent(c, port, src);
  const ctxOf = (n) => runner.ctxs.get(n) && runner.ctxs.get(n).ctx;
  const inC = (n, code) => { try { return vm.runInContext(code, ctxOf(n)); } catch (e) { return 'ERR ' + e.message; } };
  let modeAt = null; const t0 = clock.now();
  for (let i = 0; i < 120 && !modeAt; i++) { await T1.run(clock, world, 100); if (ctxOf('Spoiler1') && inC('Spoiler1', 'state.mode') === 'raid') modeAt = clock.now() - t0; }
  ok(modeAt !== null && modeAt < 10000, `#25 restart mid-raid: Spoiler1's window is back in raid mode ${modeAt !== null ? 'after ' + (modeAt / 1000).toFixed(1) + ' s' : 'NOT within 12 s'} (boss ${inC('Spoiler1', 'state.bossName')}; before: idle + 20 s sleep + no raid part)`);
  // spot resume: the leader resumes autolevel after the 20 s resume sleep + team wait
  let kept = null;
  for (let i = 0; i < 90 && kept === null; i++) { await T1.run(clock, world, 1000); const n = String(inC('Crafter1', "(state.notes || []).join(' | ')")); if (/after the restart (keeping|not keeping)/.test(n)) kept = n; }
  const travelled = (world.towns || 0) > 0;
  ok(!!kept && /after the restart keeping Resume Test Spot/.test(kept) && !travelled, `#17 restart while hunting: the leader keeps the saved spot (no trip; .town used: ${world.towns || 0}): ${(kept || 'no resume note within 90 s').split(' | ').filter(x => /restart|spot/.test(x)).slice(-2).join(' / ').slice(0, 220)}`);
  let act = null; try { act = JSON.parse(fs.readFileSync(path.join(overlay, 'Logs', 'activity_Crafter1.json'), 'utf8')); } catch (e) { }
  ok(!!(act && act.type === 'autolevel' && act.spot && act.spot.name === 'Resume Test Spot' && act.spotKey), `#17 the activity record keeps the spot for the next restart (${act ? act.spotKey : '-'})`);
  // final check 2026-10-12: patch_cmdfix2_clanlevel.js adds dungeon: <name> to the autolevel record ("!dungeon" survives a restart); the spot save
  // must keep it (before: it rewrote the record as { type, solo, spot, ... } and dropped dungeon)
  const withDg = inC('Crafter1', "setActivity({ type: 'autolevel', solo: false, dungeon: 'Cruma Tower' }); spotSave.at = 0; spotSave.key = ''; spotResumeSave(autoLvl.spot, false); JSON.stringify(getActivity())");
  ok(/"spotKey"/.test(String(withDg)) && /"dungeon":"Cruma Tower"/.test(String(withDg)), `#17 (final) the spot save keeps the other fields of the record (dungeon): ${String(withDg).replace(/"spot":\{.*?\},"spotKey"/, '"spot":{..},"spotKey"').slice(0, 140)}`);
  const cleared = inC('Crafter1', "setActivity(null); spotSave.at = 0; spotSave.key = ''; spotResumeSave(autoLvl.spot, false); JSON.stringify(getActivity())");
  ok(typeof cleared === 'string' && !/autolevel/.test(cleared), `#17 (review) a stop that cleared the activity record is not undone by the spot save (record after the save: ${String(cleared).slice(0, 80)})`);
  await runner.stop('end');
  for (const s of world.sockets) try { s.destroy(); } catch (e) { }
  for (const c of world.chars.values()) c.T.dispose();
  world.timers.dispose();
}

(async () => {
  const t0 = Date.now();
  const SW = swarmFile();
  if (on('A')) partA(SW);
  if (on('B')) await partBC();
  if (on('D')) await partD();
  if (on('E')) partE();
  if (on('F')) await partF();
  if (on('G')) await partG(SW);
  console.log(`\n${pass} passed, ${fail} failed (${Math.round((Date.now() - t0) / 1000)} s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e && e.stack || e); process.exit(1); });
