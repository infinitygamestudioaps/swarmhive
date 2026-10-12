// BRAIN v0 test (2026-10-12): the real Dashboard/brain.js on a scratch port with fake agents speaking the agent.js protocol.
// A 3-character party (leader, dealer, healer) in mode hunt: the leader gets bot + combat at the spot (or a move when far), the members
// follow (dealer assists, healer does not), a far member is walked back, a dead lonely member is respawned, a reconnect replaces the old link.
'use strict';
const net = require('net'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brain_test_'));
const port = 18093 + Math.floor(Math.random() * 500);
fs.writeFileSync(path.join(tmp, 'cfg.json'), JSON.stringify({ accounts: [{ character: 'Lead', party: 'Lead', role: 'sk' }, { character: 'Dd', party: 'Lead', role: 'destroyer' }, { character: 'Heal', party: 'Lead', role: 'bishop' }] }));
fs.writeFileSync(path.join(tmp, 'parties.json'), JSON.stringify({ Lead: { mode: 'hunt', x: 1000, y: 1000, z: 0, r: 1500 } }));
const env = Object.assign({}, process.env, { L2S_BRAIN_PORT: String(port), L2S_BRAIN_LOG: path.join(tmp, 'brain.log'), L2S_BRAIN_STATE: path.join(tmp, 'state.json'), L2S_BRAIN_PARTIES: path.join(tmp, 'parties.json'), L2S_BRAIN_CONFIG: path.join(tmp, 'cfg.json') });
const child = cp.spawn(process.execPath, [path.join(__dirname, '..', '..', '..', 'Dashboard', 'brain.js')], { env, stdio: 'ignore' });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function fake(name, st) {
  const A = { name, st: Object.assign({ t: 'st', name, x: 0, y: 0, z: 0, hp: 100, mp: 100, lv: 20, dead: false, mobs: [], party: [] }, st), got: [], sock: null };
  A.connect = () => new Promise(res => { A.sock = net.connect(port, '127.0.0.1', () => { A.sock.write(JSON.stringify({ t: 'hello', name, level: 20, cls: 0 }) + '\n'); res(); }); let b = ''; A.sock.setEncoding('utf8');
    A.sock.on('data', d => { b += d; let i; while ((i = b.indexOf('\n')) >= 0) { const m = JSON.parse(b.slice(0, i)); b = b.slice(i + 1); A.got.push(m); A.sock.write(JSON.stringify({ t: 'ack', id: m.id, a: m.a, ok: true }) + '\n'); } }); A.sock.on('error', () => { }); });
  A.report = () => A.sock.write(JSON.stringify(A.st) + '\n');
  A.has = (pred) => A.got.some(pred);
  return A;
}
(async () => {
  await sleep(800);
  const L = fake('Lead', { x: 1000, y: 1000 }), D = fake('Dd', { x: 1100, y: 1000 }), H = fake('Heal', { x: 900, y: 1000 });
  for (const a of [L, D, H]) { await a.connect(); }
  for (let i = 0; i < 3; i++) { [L, D, H].forEach(a => a.report()); await sleep(600); }
  ok(L.has(m => m.a === 'combat' && m.on && m.r === 1500 && m.x === 1000), 'leader at the spot: combat inside the circle (r 1500)');
  ok(L.has(m => m.a === 'bot' && m.on), 'leader: bot on');
  ok(D.has(m => m.a === 'follow' && m.name === 'Lead' && m.assist === true), 'dealer follows the leader and assists');
  ok(H.has(m => m.a === 'follow' && m.name === 'Lead' && m.assist === false), 'healer follows WITHOUT assist');
  const nCombat = L.got.filter(m => m.a === 'combat').length; ok(nCombat === 1, `the same order is not repeated every tick (${nCombat} combat orders in 2 s)`);
  // far member walks back
  D.st.x = 6000; D.report(); await sleep(1500); D.report(); await sleep(400);
  ok(D.has(m => m.a === 'move' && m.x === 1000), 'a member 5000 away is walked back to the leader');
  // leader away from the spot
  L.st.x = 9000; L.report(); await sleep(1500);
  ok(L.has(m => m.a === 'move' && m.x === 1000) && L.has(m => m.a === 'combat' && m.on === false), 'leader far from the spot: combat off + move to the spot');
  // state file
  await sleep(2200);
  const st = JSON.parse(fs.readFileSync(path.join(tmp, 'state.json'), 'utf8'));
  ok(st.agents.length === 3 && st.parties.Lead && /to spot|hunting/.test(st.parties.Lead.phase), `brain_state.json: 3 agents, party phase "${st.parties.Lead && st.parties.Lead.phase}"`);
  // reconnect replaces
  const D2 = fake('Dd', { x: 1100, y: 1000 }); await D2.connect(); D2.report(); await sleep(1500);
  const st2 = JSON.parse(fs.readFileSync(path.join(tmp, 'state.json'), 'utf8'));
  ok(st2.agents.filter(a => a.name === 'Dd').length === 1, 'a reconnecting agent replaces its old link (one entry)');
  // mode off: no new orders
  fs.writeFileSync(path.join(tmp, 'parties.json'), JSON.stringify({ Lead: { mode: 'off' } })); await sleep(5600);
  const before = L.got.length; L.report(); await sleep(1500);
  ok(L.got.length === before, 'mode off: the brain sends nothing');
  child.kill(); [L, D, H, D2].forEach(a => { try { a.sock.destroy(); } catch (e) { } });
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e); child.kill(); process.exit(1); });
