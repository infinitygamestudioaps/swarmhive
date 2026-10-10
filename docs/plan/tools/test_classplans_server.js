// CLASS PLANS: sandbox test of the dashboard endpoints (Dashboard/server.js -> classpage_api.js) WITHOUT touching the game or the live data:
// the MCP server is mocked, the real dashboard (8090) is never called, timers / child processes of server.js are off, the server listens on a
// random local port, and the plans file is a SCRATCH copy (env SWARM_CLASSPLANS_FILE in os.tmpdir()). Reads the real Logs/swarm_state_*.json
// and swarm.config.json (read-only). Checks that Scripts/data/class_plans.json is never created or changed.
//   node docs/plan/tools/test_classplans_server.js
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), cp = require('child_process'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'classplans-'));
const PFILE = path.join(TMP, 'class_plans.json');
process.env.SWARM_CLASSPLANS_FILE = PFILE;
const LIVE = path.join(ROOT, 'Scripts', 'data', 'class_plans.json');
const liveStat = () => { try { const s = fs.statSync(LIVE); return s.size + ':' + s.mtimeMs; } catch (e) { return 'absent'; } };
const LIVE0 = liveStat();

// ---- stubs (before server.js is loaded) ----
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (/:8083\b/.test(u)) { const b = JSON.parse(opt.body || '{}'); const result = b.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: {} } : { content: [{ type: 'text', text: b.params && b.params.name === 'get_accounts_status' ? '[]' : '{"success":true,"mock":true}' }] };
    const txt = JSON.stringify({ jsonrpc: '2.0', id: b.id, result }); return { headers: { get: (h) => (h.toLowerCase() === 'mcp-session-id' ? 'mock' : null) }, text: async () => txt, json: async () => JSON.parse(txt) }; }
  if (/:8090\b/.test(u)) throw new Error('test: the real dashboard (8090) must never be called');
  return realFetch(url, opt);
};
const T0 = { si: global.setInterval, st: global.setTimeout };
global.setInterval = () => 0; global.setTimeout = () => 0;
cp.fork = () => ({ on() { }, kill() { } });
cp.execFile = (cmd, args, opt, cb) => { const f = typeof opt === 'function' ? opt : cb; if (f) process.nextTick(() => f(null, '', '')); return { on() { } }; };
cp.exec = () => ({ on() { } });
const LOGW = [];
const realAppend = fs.appendFileSync;
fs.appendFileSync = (f, d, o) => { if (/dashboard_commands\.log$/.test(String(f))) { LOGW.push(String(d)); return; } return realAppend(f, d, o); };
let PORT = 0;
const realCreate = http.createServer;
http.createServer = (h) => { const s = realCreate(h); const L = s.listen.bind(s); s.listen = (p, host, cb) => L(0, '127.0.0.1', () => { PORT = s.address().port; if (cb) cb(); }); return s; };
const realLog = console.log; console.log = () => { };
require(path.join(ROOT, 'Dashboard', 'server.js'));
console.log = realLog;
global.setInterval = T0.si; global.setTimeout = T0.st;

const call = (p, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' } }, (res) => {
    let t = ''; res.on('data', c => t += c); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { } resolve({ code: res.statusCode, j, t, type: res.headers['content-type'] }); });
  });
  r.on('error', reject); if (data) r.write(data); r.end();
});
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' — ' + e.message); } }
const mem = (d, leader, name) => d.parties.find(p => p.leader === leader).members.find(m => m.name === name);
const post = async (b) => { const g = await call('/api/classplans'); return call('/api/classplans', Object.assign({ rev: g.j.rev }, b)); };

(async () => {
  for (let i = 0; i < 50 && !PORT; i++) await new Promise(r => T0.st(r, 50));
  console.log(`sandbox server on ${PORT}, plans file ${PFILE}`);
  const g0 = await call('/api/classplans');
  const shaded = g0.j && g0.j.parties.find(p => p.leader === 'Tank1');
  const has = (n) => shaded && shaded.members.some(m => m.name === n && m.classId != null);

  await t('static files: /classpage.js, /classpage.css, /classlogic.js', async () => {
    for (const f of ['/classpage.js', '/classpage.css', '/classlogic.js']) { const r = await call(f); assert.strictEqual(r.code, 200, f); assert.ok(r.t.length > 1000, f); }
  });
  await t('GET /api/classtree: 103 classes', async () => { const r = await call('/api/classtree'); assert.strictEqual(r.code, 200); assert.strictEqual(Object.keys(r.j.classes).length, 103); });
  await t('GET /api/classplans with no file: every character warned (missing), parties = leaders, rev empty', () => {
    assert.strictEqual(g0.code, 200); assert.strictEqual(g0.j.exists, false); assert.strictEqual(g0.j.rev, '');
    assert.ok(shaded, 'party Tank1'); assert.strictEqual(g0.j.counts.warn, g0.j.counts.total); assert.strictEqual(g0.j.counts.missing, g0.j.counts.total);
    assert.ok(g0.j.parties.every(p => p.members[0].name === p.leader), 'leader first');
    assert.ok(g0.j.templates.some(x => x.id === 'example-raid-9' && x.example && !x.own), 'example templates listed');
  });
  await t('a suggestion is offered for a character without a plan (never approved)', () => {
    const m = shaded.members.find(x => x.suggestion); assert.ok(m, 'some suggestion'); assert.strictEqual(m.approved, false); assert.strictEqual(m.status, 'missing');
  });
  if (!has('Necro1') || !has('Destroyer1') || !has('Destroyer2')) { console.log('  (skipping write tests: Necro1 / Destroyer1 / Destroyer2 have no state)'); return done(); }
  const necro1 = mem(g0.j, 'Tank1', 'Necro1');
  await t('approve without confirm -> 400', async () => { const r = await post({ action: 'set', leader: 'Tank1', name: 'Necro1', plan: [11, 13, 95], approve: true }); assert.strictEqual(r.code, 400); assert.ok(/confirm/.test(r.j.error)); assert.ok(!fs.existsSync(PFILE)); });
  await t('invalid jump [Human Wizard, Sorcerer -> Cardinal] -> 400', async () => { const r = await post({ action: 'set', leader: 'Tank1', name: 'Necro1', plan: [11, 12, 97] }); assert.strictEqual(r.code, 400); assert.ok(/does not follow/.test(r.j.error), r.j.error); });
  await t('a plan without the current class (Necromancer on a Sorcerer plan) -> 400', async () => { const r = await post({ action: 'set', leader: 'Tank1', name: 'Necro1', plan: [11, 12, 94] }); assert.strictEqual(r.code, 400); assert.ok(/not on/.test(r.j.error), r.j.error); });
  await t('name not in the party -> 400; unknown party -> 400', async () => {
    assert.strictEqual((await post({ action: 'set', leader: 'Tank1', name: 'Nobody', plan: [11, 13, 95] })).code, 400);
    assert.strictEqual((await post({ action: 'set', leader: 'NoSuchParty', name: 'Necro1', plan: [11, 13, 95] })).code, 400);
  });
  await t('save + approve (confirm) -> file written atomically, approved by dashboard, status from the gate', async () => {
    const r = await post({ action: 'set', leader: 'Tank1', name: 'Necro1', plan: [11, 13, 95], approve: true, confirm: true });
    assert.strictEqual(r.code, 200, JSON.stringify(r.j)); assert.ok(fs.existsSync(PFILE));
    const f = JSON.parse(fs.readFileSync(PFILE, 'utf8')); const e = f.parties.Tank1.members.Necro1;
    assert.deepStrictEqual(e.plan, [11, 13, 95]); assert.strictEqual(e.approved, true); assert.strictEqual(e.approvedBy, 'dashboard'); assert.ok(e.approvedAt);
    const g = await call('/api/classplans'); const m = mem(g.j, 'Tank1', 'Necro1');
    const want = necro1.level >= 76 ? (necro1.classId === 95 ? 'done' : 'ready') : 'waiting';
    assert.strictEqual(m.status, necro1.classId === 95 ? 'done' : want, m.status); assert.strictEqual(g.j.counts.warn, g.j.counts.total - 1);
    assert.ok(!fs.readdirSync(TMP).some(x => /\.tmp$/.test(x)), 'no tmp left');
  });
  await t('stale rev -> 409 (another page changed it)', async () => { const r = await call('/api/classplans', { rev: 'deadbeef', action: 'unapprove', leader: 'Tank1', names: ['Necro1'] }); assert.strictEqual(r.code, 409); });
  await t('unapprove -> needs-approval; history copy made', async () => {
    const r = await post({ action: 'unapprove', leader: 'Tank1', names: ['Necro1'] }); assert.strictEqual(r.code, 200);
    const g = await call('/api/classplans'); assert.strictEqual(mem(g.j, 'Tank1', 'Necro1').status, 'needs-approval');
    assert.ok(fs.readdirSync(path.join(TMP, 'history')).some(x => /^class_plans_.*\.json$/.test(x)), 'history');
  });
  await t('approve needs confirm; with confirm -> approved again', async () => {
    assert.strictEqual((await post({ action: 'approve', leader: 'Tank1', names: ['Necro1'] })).code, 400);
    assert.strictEqual((await post({ action: 'approve', leader: 'Tank1', names: ['Necro1'], confirm: true })).code, 200);
    const g = await call('/api/classplans'); assert.ok(mem(g.j, 'Tank1', 'Necro1').approved);
  });
  await t('changing the plan drops the approval (same plan keeps it)', async () => {
    await post({ action: 'set', leader: 'Tank1', name: 'Necro1', plan: [11, 13, 95] });
    let g = await call('/api/classplans'); assert.ok(mem(g.j, 'Tank1', 'Necro1').approved, 'same plan keeps approval');
    await post({ action: 'set', leader: 'Tank1', name: 'Necro1', plan: [11, 13] });
    g = await call('/api/classplans'); assert.ok(!mem(g.j, 'Tank1', 'Necro1').approved, 'a changed plan is not approved');
  });
  await t('copy to the same class: Destroyer1 -> Destroyer2 (dry run lists, approve needs confirm)', async () => {
    const d = mem(g0.j, 'Tank1', 'Destroyer1'), u = mem(g0.j, 'Tank1', 'Destroyer2');
    assert.strictEqual((await post({ action: 'set', leader: 'Tank1', name: 'Destroyer1', plan: [45, 46, 113], approve: true, confirm: true })).code, 200);
    const dry = await post({ action: 'copyClass', leader: 'Tank1', from: 'Destroyer1', scope: 'all', dryRun: true });
    assert.strictEqual(dry.code, 200); if (d.classId === u.classId) assert.ok(dry.j.targets.some(x => x.name === 'Destroyer2'), JSON.stringify(dry.j.targets));
    assert.ok(dry.j.targets.every(x => { const p = g0.j.parties.find(q => q.leader === x.leader); return p.members.find(m => m.name === x.name).classId === d.classId; }), 'only the same class');
    assert.strictEqual((await post({ action: 'copyClass', leader: 'Tank1', from: 'Destroyer1', scope: 'all', approve: true })).code, 400);
    const r = await post({ action: 'copyClass', leader: 'Tank1', from: 'Destroyer1', scope: 'all', approve: true, confirm: true }); assert.strictEqual(r.code, 200);
    if (d.classId === u.classId) { const g = await call('/api/classplans'); const x = mem(g.j, 'Tank1', 'Destroyer2'); assert.deepStrictEqual(x.plan, [45, 46, 113]); assert.ok(x.approved); }
  });
  let tplId = null;
  await t('save party as template -> own template with valid slots', async () => {
    const r = await post({ action: 'saveTemplate', leader: 'Tank1', templateName: 'Test team' }); assert.strictEqual(r.code, 200, JSON.stringify(r.j)); tplId = r.j.id;
    const g = await call('/api/classplans'); const tp = g.j.templates.find(x => x.id === tplId); assert.ok(tp && tp.own && tp.slots.length >= 2);
  });
  await t('apply example raid template to party Tank1: dry run matches every member with a state', async () => {
    const r = await post({ action: 'applyTemplate', leader: 'Tank1', id: 'example-raid-9', dryRun: true }); assert.strictEqual(r.code, 200, JSON.stringify(r.j));
    const known = shaded.members.filter(m => m.classId != null).length;
    assert.strictEqual(r.j.match.assign.length, known, JSON.stringify(r.j.match));
    const ins = r.j.match.assign.find(x => x.name === 'Inspector1'); if (ins) assert.deepStrictEqual(ins.plan, [125, 128, 132]);
    const doom = r.j.match.assign.find(x => x.name === 'Doombringer1'); if (doom) assert.deepStrictEqual(doom.plan, [125, 127, 131]);
  });
  await t('apply template: approve needs confirm; "only" limits the rows; not approved by default', async () => {
    assert.strictEqual((await post({ action: 'applyTemplate', leader: 'Tank1', id: 'example-raid-9', approve: true, only: ['Bishop1'] })).code, 400);
    const r = await post({ action: 'applyTemplate', leader: 'Tank1', id: 'example-raid-9', only: ['Bishop1', 'Saint1'] }); assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.j.applied.sort(), ['Bishop1', 'Saint1']);
    const g = await call('/api/classplans'); assert.strictEqual(mem(g.j, 'Tank1', 'Bishop1').status, 'needs-approval'); assert.strictEqual(mem(g.j, 'Tank1', 'Doombringer1').status, 'missing');
  });
  await t('delete own template ok, a shipped example cannot be deleted', async () => {
    assert.strictEqual((await post({ action: 'deleteTemplate', id: tplId })).code, 200);
    assert.strictEqual((await post({ action: 'deleteTemplate', id: 'example-raid-9' })).code, 400);
  });
  await t('clear removes a plan -> missing again', async () => {
    assert.strictEqual((await post({ action: 'clear', leader: 'Tank1', names: ['Bishop1'] })).code, 200);
    const g = await call('/api/classplans'); assert.strictEqual(mem(g.j, 'Tank1', 'Bishop1').status, 'missing');
  });
  await t('unknown action -> 400; bad JSON -> 400', async () => {
    assert.strictEqual((await post({ action: 'nope' })).code, 400);
    const r = await new Promise((res) => { const q = http.request({ host: '127.0.0.1', port: PORT, path: '/api/classplans', method: 'POST' }, (s) => { s.resume(); s.on('end', () => res(s.statusCode)); }); q.end('{bad'); });
    assert.strictEqual(r, 400);
  });
  await t('every write logged (Logs/dashboard_commands.log intercepted)', () => { assert.ok(LOGW.length >= 8 && LOGW.every(l => /\tclassplans\t/.test(l)), LOGW.length); });
  done();
})().catch(e => { console.log('  FAIL ' + e.stack); fail++; done(); });

function done() {
  try { assert.strictEqual(liveStat(), LIVE0); pass++; console.log('  ok  the live Scripts/data/class_plans.json was never created or changed'); } catch (e) { fail++; console.log('  FAIL the live class_plans.json changed!'); }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  console.log(`\n${pass}/${pass + fail} passed${fail ? ' — ' + fail + ' FAILED' : ''}`);
  process.exit(fail ? 1 : 0);
}
