// Test of the dashboard command center endpoints (Dashboard/server.js /api/command, /api/commands) WITHOUT touching the game:
// global fetch is replaced by a mock MCP (127.0.0.1:8083 -> recorded, never sent), the real dashboard port 8090 is blocked, timers and
// child processes of server.js are stubbed, and the server listens on a random local port. Reads the real Logs/swarm_state_*.json.
//   node docs/plan/tools/test_cmdcenter_server.js
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const cp = require('child_process');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..', '..');

// ---- stubs (before server.js is loaded) ----
const MCP_CALLS = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (/:8083\b/.test(u)) {
    const b = JSON.parse(opt.body || '{}');
    let result;
    if (b.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: {} };
    else {
      MCP_CALLS.push({ tool: b.params.name, args: b.params.arguments });
      const t = b.params.name === 'get_accounts_status' ? '[]' : JSON.stringify({ success: true, mock: true });
      result = { content: [{ type: 'text', text: t }] };
    }
    const txt = JSON.stringify({ jsonrpc: '2.0', id: b.id, result });
    return { headers: { get: (h) => (h.toLowerCase() === 'mcp-session-id' ? 'mock-session' : null) }, text: async () => txt, json: async () => JSON.parse(txt) };
  }
  if (/:8090\b/.test(u)) throw new Error('test: the real dashboard (8090) must never be called: ' + u);
  return realFetch(url, opt);
};
const timers = { setInterval: global.setInterval, setTimeout: global.setTimeout };
global.setInterval = () => 0; global.setTimeout = () => 0;               // no supervisor / clan dispatch / soul writer / pollers
cp.fork = () => ({ on() { }, kill() { } });                               // no geopath service
cp.execFile = (cmd, args, opt, cb) => { const f = typeof opt === 'function' ? opt : cb; if (f) process.nextTick(() => f(null, '', '')); return { on() { } }; };
const LOGW = [];
const realAppend = fs.appendFileSync;
fs.appendFileSync = (f, d, o) => { if (/dashboard_commands\.log$/.test(String(f))) { LOGW.push(String(d)); return; } return realAppend(f, d, o); };
let PORT = 0;
const realCreate = http.createServer;
http.createServer = (h) => { const s = realCreate(h); const L = s.listen.bind(s); s.listen = (p, host, cb) => L(0, '127.0.0.1', () => { PORT = s.address().port; if (cb) cb(); }); return s; };
const realLog = console.log; console.log = () => { };
require(path.join(ROOT, 'Dashboard', 'server.js'));
console.log = realLog;
global.setInterval = timers.setInterval; global.setTimeout = timers.setTimeout;

// ---- helpers ----
const call = (p, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' } }, (res) => {
    let t = ''; res.on('data', c => t += c); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { } resolve({ code: res.statusCode, j, t }); });
  });
  r.on('error', reject); if (data) r.write(data); r.end();
});
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' — ' + e.message); } }

(async () => {
  for (let i = 0; i < 50 && !PORT; i++) await new Promise(r => timers.setTimeout(r, 50));
  const states = fs.readdirSync(path.join(ROOT, 'Logs')).filter(f => /^swarm_state_.+\.json$/.test(f)).length;
  console.log(`test server on ${PORT}, ${states} state files`);
  const cat = await call('/api/commands');

  await t('GET /api/commands lists the catalog + parties', () => {
    assert.strictEqual(cat.code, 200); assert.strictEqual(cat.j.version, 1);
    assert.ok(cat.j.commands.length > 100, 'catalog size ' + cat.j.commands.length);
    assert.ok(cat.j.parties.some(p => p.leader === 'Tank1'), 'party Tank1');
  });
  await t('ALLOWED = exactly the !commands that Scripts_dev/swarm.js handles (minus internal !ready)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
    const inJs = new Set([...src.matchAll(/'(![a-z]+)'/g)].map(m => m[1]).filter(w => w !== '!ready'));
    const allowed = new Set(cat.j.allowed);
    const missing = [...inJs].filter(w => !allowed.has(w)), extra = [...allowed].filter(w => !inJs.has(w));
    assert.deepStrictEqual(missing, [], 'swarm.js commands missing from ALLOWED: ' + missing);
    assert.deepStrictEqual(extra, [], 'ALLOWED words swarm.js does not handle: ' + extra);
  });
  await t('every catalog swarm command builds to an ALLOWED word', () => {
    const C = require(path.join(ROOT, 'Dashboard', 'commands.js'));
    C.COMMANDS.filter(c => c.kind === 'swarm').forEach(c => assert.ok(cat.j.allowed.includes(C.firstWord(c.tpl)), c.id));
  });
  await t('dryRun !level -> party chat from the leader', async () => {
    const r = await call('/api/command', { cmd: '!level', target: 'party:Tank1', dryRun: true });
    assert.strictEqual(r.code, 200, r.t); assert.strictEqual(r.j.sends.length, 1);
    assert.deepStrictEqual([r.j.sends[0].to, r.j.sends[0].via, r.j.sends[0].text], ['Tank1', 'party', '#!level']);
  });
  await t('dryRun !stop to all -> one send per party, solo Dagger1 by normal chat', async () => {
    const r = await call('/api/command', { cmd: '!stop', targets: ['all'], dryRun: true });
    assert.strictEqual(r.code, 200, r.t);
    const parties = cat.j.parties.length; assert.strictEqual(r.j.sends.length, parties);
    const q = r.j.sends.find(s => s.to === 'Dagger1'); if (q) assert.strictEqual(q.via, 'say');
  });
  await t('dryRun /attack to a party -> every member separately', async () => {
    const r = await call('/api/command', { cmd: '/attack', target: 'party:Tank1', dryRun: true });
    const n = cat.j.parties.find(p => p.leader === 'Tank1').members.length;
    assert.strictEqual(r.code, 200, r.t); assert.strictEqual(r.j.sends.length, n); assert.ok(r.j.sends.every(s => s.via === 'command' && s.text === '/attack'));
  });
  await t('several characters + a party: duplicates merged', async () => {
    const r = await call('/api/command', { cmd: '!buff', targets: ['party:Tank1', 'char:Tank1', 'chars:Bishop1,Necro1'], dryRun: true });
    assert.strictEqual(r.code, 200, r.t); assert.deepStrictEqual(r.j.sends.map(s => s.to), ['Tank1', 'Bishop1', 'Necro1']);
  });
  await t('clan target for a / command -> clan members', async () => {
    const r = await call('/api/command', { cmd: '/loc', targets: ['clan'], dryRun: true });
    assert.strictEqual(r.code, 200, r.t); assert.ok(r.j.sends.length >= 2, 'clan sends ' + r.j.sends.length);
  });
  await t('destructive /unstuck refused without confirmDanger (409), planned with it', async () => {
    const a = await call('/api/command', { cmd: '/unstuck', target: 'char:Bishop1', dryRun: true });
    assert.strictEqual(a.code, 409); assert.strictEqual(a.j.needConfirm, true);
    const b = await call('/api/command', { cmd: '/unstuck', target: 'char:Bishop1', dryRun: true, confirmDanger: true });
    assert.strictEqual(b.code, 200, b.t);
  });
  await t('!enchant is destructive too', async () => { const r = await call('/api/command', { cmd: '!enchant', target: 'char:Bishop1', dryRun: true }); assert.strictEqual(r.code, 409); });
  await t('passwords / config re-pointing / unknown commands refused', async () => {
    for (const cmd of ['/config set Password x', '/config save Other.xml', '/config set', '!ready', '!notacommand', '/format c:', '@delete', '!level\n/unstuck'])
      assert.strictEqual((await call('/api/command', { cmd, target: 'char:Bishop1', dryRun: true, confirmDanger: true })).code, 400, cmd);
  });
  await t('/config load only with the character\'s own file', async () => {
    const own = fs.readdirSync(path.join(ROOT, 'Settings')).find(f => /\.xml$/i.test(f) && /<SelectedCharacter>Bishop1</.test(fs.readFileSync(path.join(ROOT, 'Settings', f), 'utf8')));
    if (!own) return;
    assert.strictEqual((await call('/api/command', { cmd: '/config load ' + own, target: 'char:Tank1', dryRun: true, confirmDanger: true })).code, 400);
    assert.strictEqual((await call('/api/command', { cmd: '/config load ' + own, target: 'char:Bishop1', dryRun: true, confirmDanger: true })).code, 200);
  });
  await t('unknown party / character -> 400', async () => {
    assert.strictEqual((await call('/api/command', { cmd: '!level', target: 'party:Nobody', dryRun: true })).code, 400);
    assert.strictEqual((await call('/api/command', { cmd: '!level', target: 'char:Nobody', dryRun: true })).code, 400);
  });
  await t('old callers: free text "restock" to party Crafter1', async () => {
    const r = await call('/api/command', { text: 'restock', target: 'party:Crafter1', dryRun: true });
    assert.strictEqual(r.code, 200, r.t); assert.strictEqual(r.j.sends[0].text, '#!supply'); assert.strictEqual(r.j.sends[0].to, 'Crafter1');
  });
  await t('REAL run (mock MCP): !level party Tank1 -> run_account_command #!level on Tank1', async () => {
    MCP_CALLS.length = 0;
    const r = await call('/api/command', { cmd: '!level', target: 'party:Tank1' });
    assert.strictEqual(r.code, 200, r.t); assert.strictEqual(r.j.sent, 1);
    const c = MCP_CALLS.find(x => x.tool === 'run_account_command'); assert.ok(c, JSON.stringify(MCP_CALLS));
    assert.deepStrictEqual([c.args.account_name, c.args.command], ['Tank1', '#!level']);
    assert.ok(LOGW.some(l => l.includes('!level')), 'logged');
  });
  await t('REAL run (mock MCP): /stand to two characters -> two run_account_command', async () => {
    MCP_CALLS.length = 0;
    const r = await call('/api/command', { cmd: '/stand', targets: ['chars:Bishop1,Necro1'] });
    assert.strictEqual(r.code, 200, r.t); assert.strictEqual(r.j.sent, 2);
    assert.deepStrictEqual(MCP_CALLS.filter(x => x.tool === 'run_account_command').map(x => x.args.account_name + ' ' + x.args.command).sort(), ['Bishop1 /stand', 'Necro1 /stand']);
  });
  await t('REAL run (mock MCP): @logout with confirm -> close_account', async () => {
    MCP_CALLS.length = 0;
    const r = await call('/api/command', { cmd: '@logout', target: 'char:Bishop1', confirmDanger: true });
    assert.strictEqual(r.code, 200, r.t); assert.ok(MCP_CALLS.some(x => x.tool === 'close_account' && x.args.account_name === 'Bishop1'));
  });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
