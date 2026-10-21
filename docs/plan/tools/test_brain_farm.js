// OFFLINE TEST of FARMPERF-2026-10-20 (docs: AUTOMATION_LOG 2026-10-20 "FARMPERF"). Nothing live: a temp overlay, a tiny script, fake agents.
//   node docs/plan/tools/test_brain_farm.js        (exit code 1 when a check fails)
// The REAL pool (Dashboard/brain_host/pool.js + worker.js + runner.js) with brain_host.json "perf":
//   A  worker slots: 4 parties in 2 worker threads (biggest party first, balanced by characters); every character boots
//   B  plain context globals (DONT_CONTEXTIFY): host globals (Me, App, File, ...) work, top-level functions are found by the host
//   C  App events across slots: swarm.pos goes worker -> worker over a direct port (main relays nothing), a trade signal goes through main
//   D  a slot restart: its parties come back, the direct ports are wired again, swarm.pos still arrives
//   E  V8 code cache: written once, used by the next compile, a broken cache is rejected + deleted (Runner alone)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const ROOT = path.join(__dirname, '..', '..', '..');
const BH = path.join(ROOT, 'Dashboard', 'brain_host');
let fails = 0, passes = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (c) passes++; else fails++; };
const sleepR = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, step) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { } await sleepR(step || 100); } return false; }
const mkTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'brain_farm_'));

const TINY = `globalThis.__boot = (globalThis.__boot || 0) + 1;
var __pos = 0, __posFrom = '', __tr = 0;
function OnTestTrigger(x) { globalThis.__trig = x; }
App.on('swarm.pos', function (e) { __pos++; __posFrom = e.source.characterName; });
App.on('swarm.trade.x', function (e) { __tr++; });
`;
function fakeAgent(port, name, objId) {
  const s = net.connect(port, '127.0.0.1'); const A = { name, s, bye: false };
  s.setEncoding('utf8'); let buf = '';
  s.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(l); if (m.a === 'bye') A.bye = m.why || true; if (m.a === 'ping') s.write(JSON.stringify({ t: 'pong', id: m.id }) + '\n'); if (m.a === 'resync') s.write(JSON.stringify({ t: 'st', seq: 1, full: true, me: { objId, Name: name, ClassId: 1, X: 0, Y: 0, Z: 0 }, fl: { IsConnected: true } }) + '\n'); } catch (e) { } } });
  s.on('error', () => { });
  s.on('connect', () => s.write(JSON.stringify({ t: 'hello', v: 3, name, accountId: 'acc-' + name, caps: ['hot'] }) + '\n'));
  return A;
}

(async () => {
  console.log('FARMPERF pool test (' + path.relative(ROOT, BH) + ')');
  const { Pool } = require(path.join(BH, 'pool.js'));
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(path.join(overlay, 'Logs'), { recursive: true });
  const script = path.join(tmp, 'tiny.js'); fs.writeFileSync(script, TINY);
  const logF = path.join(tmp, 'pool.log');
  const parties = { A1: 'PA', A2: 'PA', A3: 'PA', B1: 'PB', B2: 'PB', C1: 'PC', D1: 'PD' };
  const names = Object.keys(parties);
  const port = 24100 + Math.floor(Math.random() * 400);
  const P = new Pool({ port, allow: names, partyOf: (n) => parties[n] || n, script, overlay, isolate: ['Logs'], logFile: logF, stallMs: 3000, hbMs: 100, allowEval: true,
    root: ROOT.replace(/\//g, '\\'), backoffBaseMs: 300, perf: { workers: 2, directPorts: true, dontContextify: true, workerOldMb: 512, workerYoungMb: 48, priority: false } });
  await P.start();
  const A = {}; names.forEach((n, i) => { A[n] = fakeAgent(port, n, 1000 + i); });
  const ev = (n, code) => P.eval(n, code);
  const booted = (n) => waitFor(async () => { const r = await ev(n, 'globalThis.__boot'); return r && r.ok && r.v >= 1; }, 10000, 150);
  // ---- A
  let all = true; for (const n of names) all = (await booted(n)) && all;
  const uniq = new Set(P.workers.values());
  ok(all, 'A every character booted (7 characters, 4 parties)');
  ok(uniq.size === 2, `A 4 parties run in ${uniq.size} worker threads (perf.workers 2)`);
  ok(P.sk('PA') !== P.sk('PB') && P.partiesOf(P.sk('PA')).includes('PA'), `A slots balanced by size: PA (3) in ${P.sk('PA')}, PB (2) in ${P.sk('PB')}, PC in ${P.sk('PC')}, PD in ${P.sk('PD')}`);
  const log0 = fs.readFileSync(logF, 'utf8');
  ok(/worker slots: 2 workers for 4 parties/.test(log0), 'A the slot plan is logged');
  // ---- B
  const meOk = await ev('A1', 'typeof Me === "object" && typeof App.emitTo === "function" && typeof File.ReadAllText === "function"');
  ok(meOk && meOk.v === true, 'B host globals work on a plain context global (Me, App, File)');
  await ev('A1', 'TriggerJsEvent("OnTestTrigger", 42)'); await sleepR(200);
  const trig = await ev('A1', 'globalThis.__trig');
  ok(trig && trig.v === 42, `B TriggerJsEvent finds the script's own top-level function (${trig && trig.v})`);
  const st0 = await P.stats(); const plain = st0.workers.reduce((n, w) => n + ((w.st && w.st.plainGlobals) || 0), 0);
  ok(plain === names.length, `B every context has a plain global (plainGlobals ${plain})`);
  // ---- C: wait until the accounts are known everywhere (pushBrain after 'acc'), then emit across slots
  const other = names.find(n => P.sk(parties[n]) !== P.sk('PA'));
  await waitFor(() => P.accounts.size >= names.length, 5000);
  await sleepR(300);
  const relay0 = P.st.appRelayed;
  await ev('A1', `App.emitTo('acc-${other}', 'swarm.pos', { x: 1 }); App.emitTo('acc-${other}', 'swarm.pos', { x: 2 }); 'sent'`);
  const gotPos = await waitFor(async () => { const r = await ev(other, '__pos'); return r && r.v >= 2; }, 4000);
  ok(gotPos && P.st.appRelayed === relay0, `C swarm.pos A1 -> ${other} (other worker) arrived over the direct port; main relayed ${P.st.appRelayed - relay0}`);
  const from = await ev(other, '__posFrom'); ok(from && from.v === 'A1', `C the envelope names the sender (${from && from.v})`);
  await ev('A1', `App.emitTo('acc-${other}', 'swarm.trade.x', { y: 1 }); 'sent'`);
  const gotTr = await waitFor(async () => { const r = await ev(other, '__tr'); return r && r.v >= 1; }, 4000);
  ok(gotTr && P.st.appRelayed > relay0, `C a trade signal still goes through main (relayed +${P.st.appRelayed - relay0}) and arrives`);
  const same = names.find(n => n !== 'A1' && P.sk(parties[n]) === P.sk('PA') && parties[n] !== 'PA');
  if (same) {
    const r1 = P.st.appRelayed;
    await ev('A1', `App.emitTo('acc-${same}', 'swarm.trade.x', { y: 2 }); 'sent'`);
    const g = await waitFor(async () => { const r = await ev(same, '__tr'); return r && r.v >= 1; }, 4000);
    ok(g && P.st.appRelayed === r1, `C another party in the SAME worker (${same}) gets it locally (main relayed ${P.st.appRelayed - r1})`);
  }
  const st1 = await P.stats(); const dsent = st1.workers.reduce((n, w) => n + ((w.direct && w.direct.sent) || 0), 0);
  ok(dsent >= 2, `C worker stats count the direct sends (${dsent})`);
  // ---- D: restart the slot of `other`
  const key = P.sk(parties[other]), W = P.workers.get(key);
  P.restart(W, 'test restart', 0);
  const back = await waitFor(async () => { const T = P.workers.get(key); return T && T !== W && T.ready; }, 10000);
  ok(back, `D slot ${key} restarted (parties ${P.partiesOf(key).join(', ')})`);
  ok(await booted(other), `D ${other} boots again in the new worker`);
  await sleepR(800);
  const relay2 = P.st.appRelayed;
  await ev('A1', `App.emitTo('acc-${other}', 'swarm.pos', { x: 3 }); 'sent'`);
  const gotPos2 = await waitFor(async () => { const r = await ev(other, '__pos'); return r && r.v >= 1; }, 4000);
  ok(gotPos2 && P.st.appRelayed === relay2, `D after the restart swarm.pos goes direct again (main relayed ${P.st.appRelayed - relay2})`);
  for (const a of Object.values(A)) try { a.s.destroy(); } catch (e) { }
  await P.stop();
  // ---- E: code cache (Runner alone)
  {
    const { Runner } = require(path.join(BH, 'runner.js'));
    const cdir = path.join(tmp, 'cache');
    const r1 = new Runner({ port: null, script, overlay, isolate: ['Logs'], logFile: path.join(tmp, 'r.log'), codeCacheDir: cdir, codeCacheAfterMs: 50, root: ROOT.replace(/\//g, '\\') });
    r1.compile(); await sleepR(400);
    const files = fs.existsSync(cdir) ? fs.readdirSync(cdir).filter(f => f.endsWith('.v8cache')) : [];
    ok(r1.st.codeCache === 'none' && files.length === 1, `E first compile: no cache yet, one written after the delay (${files.join(', ')})`);
    const r2 = new Runner({ port: null, script, overlay, isolate: ['Logs'], logFile: path.join(tmp, 'r.log'), codeCacheDir: cdir, root: ROOT.replace(/\//g, '\\') });
    r2.compile();
    ok(r2.st.codeCache === 'used', `E second compile uses the cache (${r2.st.codeCache})`);
    // a script this process never compiled (V8's in-memory compile cache would answer for the first one), with a broken cache file
    const script2 = path.join(tmp, 'tiny2.js'), src2 = TINY + '\nvar __second = 1;\n'; fs.writeFileSync(script2, src2);
    const h2 = require('crypto').createHash('sha1').update(src2).digest('hex').slice(0, 12), bad = path.join(cdir, `swarm_${h2}_${process.version}.v8cache`);
    fs.writeFileSync(bad, Buffer.from('garbage that is no V8 code cache'));
    const r3 = new Runner({ port: null, script: script2, overlay, isolate: ['Logs'], logFile: path.join(tmp, 'r.log'), codeCacheDir: cdir, codeCacheAfterMs: 3600000, root: ROOT.replace(/\//g, '\\') });
    r3.compile();
    ok(r3.st.codeCache === 'rejected' && !fs.existsSync(bad), `E a broken cache is rejected and deleted (${r3.st.codeCache})`);
  }
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
