// ENGINE AUDIT — fix group "identity" (2026-10-12): account ids, brain account lists, worker-restart replay, call ids.
// Nothing live: fake agents (the agent2.js v3 protocol: hello / st / ap in, resync / bridge / appemit out) and a fake L2Swarm App bus (an
// agent re-emits its context's 'appemit' with ITS current account id as the source; every other agent relays an event as 'ap' unless the
// source is in its bridge.brain list = agent2.js:186-197) around the REAL Dashboard/brain_host Runner / Pool / AgentLink, with a tiny
// stand-in script instead of swarm.js (App.on / emit / emitTo / self only).
//   A  #21/#30/#36  agent reconnects with a NEW runtime account id: context re-keyed (App.self), bridge lists carry the new id, a broadcast
//                   reaches the other brain context ONCE (was twice: bus + bridge), emitTo(old id) still arrives
//   B  #22/#31      agent gone for good (rolled back to swarm.js inside L2Swarm, same id): no brain account after linkGraceMs, its L2Swarm
//                   events reach the brain, emitTo to it is bridged
//   C  #39          call ids never repeat across links / module loads: a late answer of an old link cannot resolve a newer call
//   D  pool         A + B across workers (pool.accounts, 'gone', every worker's brain list) and #24: a party worker restart replays the
//                   agent bytes line-aligned (no 'bad line'), keeps what arrived in the gap and the cross-party emitTo sent meanwhile
//   E  #31          the dashboard transfer job (server.js scripts()) starts again what it stopped: agent2.js on a brain character, not swarm.js
//   F  #20          docs/plan/tools/attach_agent.js against a mock MCP server: attaching never rewrites the shared Scripts/agent2.js (a new
//                   per-character copy, or just 'start' when an agent is attached), --sync, the live-raid guard
//   G  #24 review   a worker stopped by the watchdog: agent bytes + cross-party App events posted to it after its last heartbeat are
//                   replayed to the new worker (line-aligned, once)
// Usage: node docs/plan/tools/test_engine_identity.js [--bh <brain_host dir>] [--server <server.js>]   (exit 1 on a failure; --bh / --server =
//        run against other copies, e.g. the backups before the fix: Settings/backup/engine_fixes_2026-10-12/identity/brain_host + .../server.js)
'use strict';
const fs = require('fs'), path = require('path'), net = require('net'), os = require('os'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const BH = process.argv.includes('--bh') ? path.resolve(process.argv[process.argv.indexOf('--bh') + 1]) : path.join(ROOT, 'Dashboard', 'brain_host');
const { Runner } = require(path.join(BH, 'runner.js'));
const { Pool } = require(path.join(BH, 'pool.js'));
const SERVER = process.argv.includes('--server') ? path.resolve(process.argv[process.argv.indexOf('--server') + 1]) : path.join(ROOT, 'Dashboard', 'server.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (cond) pass++; else fail++; };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(f, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await f()) return true; } catch (e) { } await wait(25); } return false; }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'engine_identity_'));
const SCRIPT = path.join(TMP, 'stand_in.js');
fs.writeFileSync(SCRIPT, [
  "var got = [];",
  "App.on('swarm.t', function (e) { got.push({ src: e.source.accountId, d: e.data }); });",
  "function fire(d) { App.emit('swarm.t', d); }",
  "function fireTo(acc, d) { App.emitTo(acc, 'swarm.t', d); }",
  "function me() { return App.self().accountId; }",
].join('\n'));
const LOG = path.join(TMP, 'brain_host.log');

// ------------------------------------------------------------------ fake L2Swarm: agents + engines on one App bus
class FakeL2 {
  constructor() { this.agents = new Set(); this.engines = new Set(); this.seq = 0; }
  route(src, name, j, to) {
    const env = { id: 'l2-' + (++this.seq), name, sentAtUtc: new Date().toISOString(), source: src, j };
    for (const a of this.agents) if (a.up && a.acc !== src.accountId && (!to || a.acc === to)) a.relay(env);
    for (const e of this.engines) if (e.acc !== src.accountId && (!to || e.acc === to)) e.got.push({ src: src.accountId, d: JSON.parse(j) });
  }
}
class Engine {                      // swarm.js still running INSIDE L2Swarm on an account
  constructor(l2, name, acc) { this.l2 = l2; this.name = name; this.acc = acc; this.got = []; l2.engines.add(this); }
  emit(name, d, to) { this.l2.route({ accountId: this.acc, characterName: this.name, scriptId: 's', scriptName: 'swarm.js' }, name, JSON.stringify(d), to || null); }
}
class Agent {                       // agent2.js v3, protocol only
  constructor(l2, port, name, acc) { this.l2 = l2; this.port = port; this.name = name; this.acc = acc; this.bridge = null; this.rx = []; this.up = false; l2.agents.add(this); }
  connect() {
    return new Promise((res) => {
      this.sock = net.connect(this.port, '127.0.0.1', () => {
        this.up = true; this.sock.setNoDelay(true);
        this.send({ t: 'hello', v: 3, caps: ['bridge'], name: this.name, objId: 1, accountId: this.acc, version: 'test' });
        this.st(); res(this);
      });
      let buf = '';
      this.sock.setEncoding('utf8');
      this.sock.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) this.onLine(JSON.parse(line)); } });
      this.sock.on('close', () => { this.up = false; });
      this.sock.on('error', () => { });
    });
  }
  send(o) { if (this.up) this.sock.write(JSON.stringify(o) + '\n'); }
  raw(t) { if (this.up) this.sock.write(t); }
  st() { this.send({ t: 'st', full: true, me: { Name: this.name, objId: 1 }, fl: { IsConnected: true } }); }
  onLine(m) {
    this.rx.push(m);
    if (m.a === 'resync') this.st();
    else if (m.a === 'bridge') this.bridge = m.on ? { names: new Set(m.names || []), brain: new Set((m.brain || []).map(String)) } : null;
    else if (m.a === 'appemit') this.l2.route({ accountId: this.acc, characterName: this.name, scriptId: 'a', scriptName: 'agent2.js' }, m.name, m.j, m.to || null);
  }
  relay(env) {                      // agent2.js:193-197
    if (!this.bridge || !this.bridge.names.has(env.name)) return;
    if (this.bridge.brain.has(String(env.source.accountId || ''))) return;
    this.send({ t: 'ap', name: env.name, id: env.id, sentAtUtc: env.sentAtUtc, source: env.source, j: env.j });
  }
  close() { this.up = false; try { this.sock.destroy(); } catch (e) { } }
  brainList() { return this.bridge ? Array.from(this.bridge.brain) : []; }
}

const runnerOpts = { bridge: true, pingMs: 0, linkGraceMs: 150, sweepMs: 50, heldMs: 2000, disposeAfterMs: 600000, logFile: LOG, root: TMP, script: SCRIPT };

async function testRunner() {
  console.log('A/B  single runner (#21/#30/#36, #22/#31)');
  const l2 = new FakeL2();
  const r = new Runner(Object.assign({ port: 0, host: '127.0.0.1' }, runnerOpts));
  await r.start(); const port = r.server.address().port;
  const run = (n, code) => vm.runInContext(code, r.ctxs.get(n).ctx);
  const alpha = await new Agent(l2, port, 'Alpha', 'a1').connect(), beta = await new Agent(l2, port, 'Beta', 'b1').connect(), gamma = await new Agent(l2, port, 'Gamma', 'g1').connect();
  await until(() => r.ctxs.size === 3 && alpha.bridge && beta.bridge && gamma.bridge, 3000);
  await wait(100);
  // ---- A: Alpha's account gets a new runtime id (L2Swarm restart / close+open) and its agent reconnects within disposeAfterMs
  alpha.close(); await wait(60);
  const alpha2 = await new Agent(l2, port, 'Alpha', 'a2').connect(); l2.agents.delete(alpha);
  await until(() => beta.brainList().includes('a2'), 1500);
  ok(run('Alpha', 'me()') === 'a2', `A  App.self().accountId follows the agent's new id (got ${run('Alpha', 'me()')})`);
  ok(beta.brainList().includes('a2'), `A  the other agents' bridge.brain list carries the new id (${beta.brainList().join(',')})`);
  run('Beta', 'got.length = 0'); run('Alpha', "fire({ k: 'bc' })");
  await wait(300);
  const n = run('Beta', "got.filter(function (g) { return g.d && g.d.k === 'bc'; }).length");
  ok(n === 1, `A  a broadcast of the re-keyed context reaches the other brain context once (got ${n})`);
  ok(run('Beta', "got.filter(function (g) { return g.d && g.d.k === 'bc'; }).every(function (g) { return g.src === 'a2'; })"), 'A  ... with the new id as its source');
  run('Alpha', 'got.length = 0'); run('Beta', "fireTo('a1', { k: 'old' })");
  await wait(200);
  ok(run('Alpha', "got.filter(function (g) { return g.d && g.d.k === 'old'; }).length") === 1, 'A  an emitTo to the OLD id still reaches the context');
  // ---- B: Gamma is rolled back (agent stopped, swarm.js started inside L2Swarm on the same account g1)
  ok(r.isBrainAccount('g1') && beta.brainList().includes('g1'), 'B  setup: Gamma is a brain account while its agent is connected');
  gamma.close(); l2.agents.delete(gamma);
  const alphaL2 = new Engine(l2, 'Gamma', 'g1');
  await until(() => !r.isBrainAccount('g1'), 1500);
  await wait(100);
  ok(!r.isBrainAccount('g1'), 'B  agent gone > linkGraceMs -> the account is no brain account any more');
  ok(!beta.brainList().includes('g1'), `B  the other agents are told (bridge.brain = ${beta.brainList().join(',')})`);
  run('Beta', 'got.length = 0'); alphaL2.emit('swarm.t', { k: 'fromL2' });
  await wait(250);
  ok(run('Beta', "got.filter(function (g) { return g.d && g.d.k === 'fromL2'; }).length") === 1, "B  the rolled-back character's swarm.js events reach the brain");
  run('Beta', "fireTo('g1', { k: 'toL2' })");
  await wait(250);
  ok(alphaL2.got.filter(g => g.d && g.d.k === 'toL2').length === 1, 'B  an emitTo from the brain to it is bridged into L2Swarm');
  // it comes back to the brain: brain account again
  l2.engines.delete(alphaL2); const gamma2 = await new Agent(l2, port, 'Gamma', 'g1').connect();
  await until(() => beta.brainList().includes('g1'), 1500);
  ok(r.isBrainAccount('g1') && beta.brainList().includes('g1'), 'B  ... and counts as a brain account again when its agent is back');
  gamma2.close(); alpha2.close(); beta.close();
  await r.stop('test');
}

function testCallIds() {
  console.log('C  call ids (#39)');
  const linkPath = require.resolve(path.join(BH, 'link.js'));
  const sock = () => ({ destroyed: false, write() { }, destroy() { this.destroyed = true; } });
  const { AgentLink } = require(linkPath);
  const L1 = new AgentLink(sock(), {}); const p1 = L1.call('FindPath', [], true); p1.catch(() => { });
  const id1 = Array.from(L1.pending.keys())[0];
  L1.close();                                                   // agent reconnect
  const L2 = new AgentLink(sock(), {}); let res2 = 'pending'; L2.call('FindPath', [], true).then(v => { res2 = v; }, () => { });
  const id2 = Array.from(L2.pending.keys())[0];
  L2.onResult({ t: 'res', id: id1, ok: true, v: 'STALE' });   // the old link's late answer
  ok(id2 !== id1 && L2.pending.has(id2), `C  a new link never reuses an id of the old one (${id1} vs ${id2}); the late answer is ignored`);
  delete require.cache[linkPath];                              // a pool worker restart = a fresh module load
  const { AgentLink: AgentLinkB } = require(linkPath);
  const L3 = new AgentLinkB(sock(), {}); L3.call('GoToPoint', [], true).catch(() => { });
  const id3 = Array.from(L3.pending.keys())[0];
  ok(id3 > id2 && id3 > id1, `C  a fresh module (worker restart) starts above every earlier id (${id3})`);
  return Promise.resolve().then(() => ok(res2 === 'pending', 'C  the newer call was not resolved by the stale answer'));
}

async function testPool() {
  console.log('D  worker pool (#21/#22/#31 across workers, #24 restart replay)');
  const l2 = new FakeL2();
  const pool = new Pool({ port: 0, host: '127.0.0.1', script: SCRIPT, root: TMP, logFile: LOG, allowEval: true, partyOf: (n) => 'P' + n, stallMs: 60000,
    runner: Object.assign({}, runnerOpts) });
  await pool.start(); const port = pool.server.address().port;
  const ev = async (n, code) => { const r = await pool.eval(n, code); return r.ok ? r.v : undefined; };
  const alpha = await new Agent(l2, port, 'Alpha', 'a1').connect(), beta = await new Agent(l2, port, 'Beta', 'b1').connect(), gamma = await new Agent(l2, port, 'Gamma', 'g1').connect();
  await until(() => beta.brainList().includes('a1') && beta.brainList().includes('g1') && alpha.brainList().includes('b1'), 8000);
  ok(beta.brainList().includes('a1'), 'D  setup: both parties up, brain lists exchanged');
  // re-key across workers
  alpha.close(); l2.agents.delete(alpha); await wait(60);
  const alpha2 = await new Agent(l2, port, 'Alpha', 'a2').connect();
  await until(() => beta.brainList().includes('a2'), 3000);
  ok(pool.accounts.has('a2') && beta.brainList().includes('a2'), "D  re-key reaches pool.accounts and the other party's agents");
  await ev('Beta', 'got.length = 0'); await ev('Alpha', "fire({ k: 'bc' })");
  await wait(400);
  const n = await ev('Beta', "got.filter(function (g) { return g.d && g.d.k === 'bc'; }).length");
  ok(n === 1, `D  cross-party broadcast of the re-keyed context arrives once (got ${n})`);
  // #24: Beta's worker restarts while its agent is in the middle of a line, more lines arrive in the gap, Alpha emitTo Beta in the gap
  const line = (k) => JSON.stringify({ t: 'ap', name: 'swarm.t', id: 'x-' + k, sentAtUtc: new Date().toISOString(), source: { accountId: 'eng1', characterName: 'Eng', scriptId: 's', scriptName: 'swarm.js' }, j: JSON.stringify({ k }) }) + '\n';
  const split = line('split'); beta.raw(split.slice(0, 40)); await wait(80);
  const W = pool.workers.get('PBeta'); pool.restart(W, 'test', 400);
  await wait(30);
  beta.raw(split.slice(40) + line('gap'));
  await ev('Alpha', "fireTo('b1', { k: 'to' })");
  await until(async () => (await ev('Beta', 'got.length')) >= 3, 6000);
  const got = (await ev('Beta', 'JSON.stringify(got.map(function (g) { return g.d && g.d.k; }))')) || '[]';
  ok(/split/.test(got), `D  #24 the line cut by the restart is complete in the new worker (got ${got})`);
  ok(/gap/.test(got), 'D  #24 an L2Swarm App event that arrived during the restart gap is delivered');
  ok(/"to"/.test(got), 'D  #24 a cross-party emitTo sent during the restart gap is delivered');
  const stats = await pool.stats();
  const bad = (stats.workers || []).some(w => (w.errors || []).some(([k]) => /bad line/.test(k)));
  ok(!bad, "D  #24 no 'bad line' after the restart");
  // gone across workers: Gamma (its own party) is rolled back; Alpha (re-keyed) goes too
  gamma.close(); l2.agents.delete(gamma); alpha2.close(); l2.agents.delete(alpha2);
  await until(() => !pool.accounts.has('g1') && !pool.accounts.has('a2') && !beta.brainList().includes('g1'), 3000);
  ok(!pool.accounts.has('g1') && !pool.accounts.has('a2') && !pool.accounts.has('a1'), `D  agent gone -> its ids leave pool.accounts (${Array.from(pool.accounts.keys()).join(',')})`);
  ok(!beta.brainList().includes('g1') && !beta.brainList().includes('a2'), `D  ... and the other party's agents' bridge lists (${beta.brainList().join(',')})`);
  const alphaL2 = new Engine(l2, 'Gamma', 'g1');
  await ev('Beta', 'got.length = 0'); alphaL2.emit('swarm.t', { k: 'fromL2' });
  await wait(300);
  ok((await ev('Beta', "got.filter(function (g) { return g.d && g.d.k === 'fromL2'; }).length")) === 1, 'D  the rolled-back character reaches the brain again');
  await ev('Beta', "fireTo('g1', { k: 'toL2' })");
  await wait(300);
  ok(alphaL2.got.filter(g => g.d && g.d.k === 'toL2').length === 1, 'D  emitTo from another worker to it is bridged into L2Swarm');
  beta.close();
  await pool.stop();
}

async function testStallReplay() {
  console.log('G  watchdog stall window (#24 family, review): bytes / App events posted to a stuck worker reach the new one');
  const l2 = new FakeL2();
  const pool = new Pool({ port: 0, host: '127.0.0.1', script: SCRIPT, root: TMP, logFile: LOG, allowEval: true, partyOf: (n) => 'P' + n, stallMs: 700, hbMs: 100,
    runner: Object.assign({}, runnerOpts) });
  await pool.start(); const port = pool.server.address().port;
  const ev = async (n, code) => { const r = await pool.eval(n, code); return r.ok ? r.v : undefined; };
  const alpha = await new Agent(l2, port, 'Alpha', 'a1').connect(), beta = await new Agent(l2, port, 'Beta', 'b1').connect();
  await until(() => beta.brainList().includes('a1') && alpha.brainList().includes('b1'), 8000);
  await until(async () => (await ev('Beta', 'got.length')) === 0, 3000);
  const gen0 = pool.workers.get('PBeta').gen;
  pool.eval('Beta', 'var t0 = Date.now(); while (Date.now() - t0 < 2500) { }').catch(() => { });   // Beta's worker blocks -> watchdog
  await wait(250);
  const line = (k) => JSON.stringify({ t: 'ap', name: 'swarm.t', id: 'y-' + k, sentAtUtc: new Date().toISOString(), source: { accountId: 'eng1', characterName: 'Eng', scriptId: 's', scriptName: 'swarm.js' }, j: JSON.stringify({ k }) }) + String.fromCharCode(10);
  const l1 = line('stuck1'); beta.raw(l1.slice(0, 30)); await wait(30); beta.raw(l1.slice(30) + line('stuck2'));
  await ev('Alpha', "fireTo('b1', { k: 'stuckTo' })");
  await until(() => { const W = pool.workers.get('PBeta'); return W && W.gen !== gen0; }, 6000);
  const restarted = (pool.workers.get('PBeta') || {}).gen !== gen0;
  ok(restarted, 'G  setup: the stuck worker was terminated by the watchdog and restarted');
  await until(async () => (await ev('Beta', 'got.length')) >= 3, 6000);
  const got = (await ev('Beta', 'JSON.stringify(got.map(function (g) { return g.d && g.d.k; }))')) || '[]';
  ok(/stuck1/.test(got) && /stuck2/.test(got), `G  L2Swarm App events the stuck worker never read are delivered by the new worker (got ${got})`);
  ok(/stuckTo/.test(got), 'G  a cross-party emitTo posted to the stuck worker is delivered by the new worker');
  const n1 = (got.match(/stuck1/g) || []).length;
  ok(n1 === 1, `G  ... exactly once (stuck1 x${n1})`);
  alpha.close(); beta.close();
  await pool.stop();
}

async function testTransferScripts() {
  console.log('E  transfer job restarts the stopped scripts (#31)');
  const src = fs.readFileSync(SERVER, 'utf8');
  const i0 = src.indexOf('async function scripts(sel, action)'); if (i0 < 0) return ok(false, 'E  scripts() not found in ' + SERVER);
  const iS = src.lastIndexOf('const SCRIPTS_STOPPED', i0), from = iS >= 0 && i0 - iS < 400 ? iS : i0;
  const code = src.slice(from, src.indexOf('\n}\n', i0) + 2);
  const acc = { scripts: [{ name: 'swarm.js', enabled: false }, { name: 'agent2.js', enabled: true }] }, calls = [];
  const mcpJ = async (tool, a) => { calls.push(a.action + ' ' + (a.script_name || '')); if (a.action === 'list') return JSON.parse(JSON.stringify(acc)); const sc = acc.scripts.find(x => x.name === a.script_name); if (sc) sc.enabled = a.action === 'start'; return { ok: true }; };
  const scripts = new Function('mcpJ', code + '\nreturn scripts;')(mcpJ);
  const sel = { account_id: 'x1' };
  await scripts(sel, 'stop'); await scripts(sel, 'stop');      // the job stops twice (switch, then before the trade)
  await scripts(sel, 'start');
  const on = acc.scripts.filter(x => x.enabled).map(x => x.name).join(',');
  ok(on === 'agent2.js', `E  a brain character gets agent2.js back, swarm.js stays off (enabled now: ${on || 'nothing'})`);
  const acc2 = { scripts: [{ name: 'swarm.js', enabled: true }] }; Object.assign(acc, acc2);
  await scripts({ account_id: 'x2' }, 'stop'); await scripts({ account_id: 'x2' }, 'start');
  ok(acc.scripts[0].enabled, 'E  an L2Swarm character gets swarm.js back as before');
  // review: the job failed before it paused the receiver (never reached Giran) -> finally 'start' with nothing recorded on a brain character
  acc.scripts = [{ name: 'swarm.js', enabled: false }, { name: 'agent2_Spoiler6.js', enabled: true }];
  await scripts({ account_id: 'x3' }, 'start');
  ok(!acc.scripts[0].enabled && acc.scripts[1].enabled, `E  a brain receiver that was never paused does not get swarm.js started next to its agent (${JSON.stringify(acc.scripts)})`);
}

async function testAttachTool() {
  console.log('F  attach_agent.js (#20)');
  const http = require('http'), cp = require('child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'attach_agent_')); fs.mkdirSync(path.join(root, 'Scripts')); fs.mkdirSync(path.join(root, 'Logs'));
  const shared = path.join(root, 'Scripts', 'agent2.js'); fs.writeFileSync(shared, '// agent v3\n'); const t0 = fs.statSync(shared).mtimeMs;
  const accts = { Alpha: [{ name: 'swarm.js', enabled: true }], Beta: [{ name: 'swarm.js', enabled: true }, { name: 'agent2.js', enabled: false }] }, calls = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => {
    const m = JSON.parse(b); let out = {};
    if (m.method === 'tools/call') {
      const ar = m.params.arguments, list = accts[ar.account_name] || []; calls.push(ar.account_name + ' ' + ar.action + ' ' + (ar.script_name || ar.file_name || ''));
      if (ar.action === 'list') out = { scripts: list };
      else if (ar.action === 'stop' || ar.action === 'start') { const sc = list.find(x => x.name === ar.script_name); if (sc) sc.enabled = ar.action === 'start'; out = { ok: !!sc }; }
      else if (ar.action === 'create') { const p = path.join(root, 'Scripts', ar.file_name); if (fs.existsSync(p)) out = { text: 'error: file exists' }; else { fs.writeFileSync(p, ar.source); list.push({ name: ar.file_name, enabled: false }); out = { script_name: ar.file_name }; } }
      else if (ar.action === 'remove') out = { ok: true };
    }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(out) }] } }));
  }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const tool = path.join(__dirname, 'attach_agent.js'), base = ['--root', root, '--mcp', 'http://127.0.0.1:' + srv.address().port];
  const runTool = (args) => new Promise(r => cp.execFile(process.execPath, [tool].concat(args, base), (e, so, se) => r({ code: e ? e.code : 0, out: String(so) + String(se) })));
  let r = await runTool(['--names', 'Alpha,Beta', '--apply']);
  ok(r.code === 0, 'F  attach Alpha + Beta: exit 0' + (r.code ? ' (code ' + r.code + ') — ' + r.out.slice(0, 900) : ''));
  ok(fs.readFileSync(shared, 'utf8') === '// agent v3\n' && fs.statSync(shared).mtimeMs === t0, 'F  the shared Scripts/agent2.js was not written (no restart of the agents already attached)');
  ok(accts.Alpha.some(x => x.name === 'agent2_Alpha.js' && x.enabled) && !accts.Alpha[0].enabled, `F  Alpha: own copy agent2_Alpha.js created + started, swarm.js stopped (${JSON.stringify(accts.Alpha)})`);
  ok(accts.Beta.find(x => x.name === 'agent2.js').enabled && !calls.some(c => /^Beta create/.test(c)) && !accts.Beta[0].enabled, 'F  Beta (agent already attached): only started, nothing created');
  ok(!calls.some(c => / remove /.test(c + ' ')), 'F  no remove / delete+create of any attached script');
  fs.writeFileSync(shared, '// agent v4\n');
  r = await runTool(['--sync', '--apply']);
  ok(fs.readFileSync(path.join(root, 'Scripts', 'agent2_Alpha.js'), 'utf8') === '// agent v4\n', 'F  --sync copies a new agent version into the per-character copies');
  fs.writeFileSync(path.join(root, 'Logs', 'raid_live_Spoiler6.json'), '{}');
  r = await runTool(['--names', 'Gamma', '--apply']);
  ok(r.code === 2 && /REFUSED/.test(r.out), 'F  refused while a raid is live (--force overrides)');
  srv.close(); try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { }
}

(async () => {
  console.log(`brain_host under test: ${BH}`);
  for (const t of [testRunner, testCallIds, testPool, testStallReplay, testTransferScripts, testAttachTool]) { try { await t(); } catch (e) { ok(false, `${t.name} threw: ${e && e.stack || e}`); } }
  console.log(`\n${pass} passed, ${fail} failed`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fail ? 1 : 0);
})();
