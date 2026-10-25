// Headless check of the LIVE PARTY VIEW (#/live/<leader>, Dashboard/liveparty.js + liveparty_api.js, user 2026-10-09) and of the
// EXP DELTA ("+1,234 exp (+0.01%)" next to the exp %), on iPhone portrait (390x844) and desktop (1440x900).
// SANDBOX: a temp folder with fixture data (anonymised copies of party Tank3's Logs/swarm_state_*.json + synthetic states: route,
// stuck, casting, selling, healing, aggro, dead + exp loss, resting, escaping, 3 stacked kills) is used as the install root; server.js runs
// from the real Dashboard folder (so the real index.html / liveparty.* are tested) with MCP MOCKED (monsters come from the fixture,
// nothing reaches L2Swarm / the game), no background timers / child processes, POSTs blocked in the browser. Real Logs are only READ.
// Screenshots: docs/plan/mobile_check/liveparty_*.png
//   node docs/plan/tools/test_liveparty_ui.js            (test)
//   node docs/plan/tools/test_liveparty_ui.js --server <sandbox>   (internal: the sandbox server)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..');

// ===================================================================== sandbox server (child process) ==============================
if (process.argv[2] === '--server') {
  const SB = process.argv[3];
  const SC = require(path.join(ROOT, 'docs', 'plan', 'tools', 'swarm_config.js'));
  const ACC = JSON.parse(fs.readFileSync(path.join(SB, 'accounts.json'), 'utf8'));
  SC.ROOT = SB; SC.ROOT_FWD = SB.replace(/\\/g, '/'); SC.mainLeader = 'Tankard'; SC.reload = () => ({ accounts: ACC }); SC.accounts = ACC;
  SC.dashboardPort = 0; SC.mcpUrl = 'http://127.0.0.1:8083';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url);
    if (/:8083\b/.test(u)) {
      const b = JSON.parse(opt.body || '{}');
      let result;
      if (b.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: {} };
      else {
        const a = b.params.arguments || {};
        let t = JSON.stringify({ success: true, mock: true });
        if (b.params.name === 'get_accounts_status') t = '[]';
        if (b.params.name === 'get_account_data' && a.type === 'mobs') { try { t = fs.readFileSync(path.join(SB, 'mobs.json'), 'utf8'); } catch (e) { t = '[]'; } }
        process.stdout.write('MCP ' + b.params.name + ' ' + JSON.stringify(a) + '\n');
        result = { content: [{ type: 'text', text: t }] };
      }
      const txt = JSON.stringify({ jsonrpc: '2.0', id: b.id, result });
      return { headers: { get: (h) => (h.toLowerCase() === 'mcp-session-id' ? 'mock' : null) }, text: async () => txt, json: async () => JSON.parse(txt) };
    }
    if (/:8090\b/.test(u)) throw new Error('sandbox: real dashboard blocked');
    return realFetch(url, opt);
  };
  const T = { si: global.setInterval, st: global.setTimeout };
  global.setInterval = () => 0; global.setTimeout = () => 0;
  cp.fork = () => ({ on() { }, kill() { } });
  cp.execFile = (cmd, args, opt, cb) => { const f = typeof opt === 'function' ? opt : cb; if (f) process.nextTick(() => f(null, '', '')); return { on() { } }; };
  cp.exec = () => ({ on() { } });
  const realWrite = fs.writeFileSync, realAppend = fs.appendFileSync;
  const inSb = (f) => path.resolve(String(f)).toLowerCase().startsWith(path.resolve(SB).toLowerCase());
  fs.writeFileSync = (f, d, o) => (inSb(f) ? realWrite(f, d, o) : undefined);     // the sandbox writes only inside the sandbox
  fs.appendFileSync = (f, d, o) => (inSb(f) ? realAppend(f, d, o) : undefined);
  const realCreate = http.createServer;
  http.createServer = (h) => { const s = realCreate(h); const L = s.listen.bind(s); s.listen = (p, host, cb) => L(0, '127.0.0.1', () => { process.stdout.write('PORT ' + s.address().port + '\n'); }); return s; };
  console.log = () => { };
  require(path.join(ROOT, 'Dashboard', 'server.js'));
  global.setInterval = T.si; global.setTimeout = T.st;
  return;
}

// ===================================================================== fixtures ===================================================
const OUT = path.join(ROOT, 'docs', 'plan', 'mobile_check');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return d; } };

// real party Tank3 -> anonymous names (class, level, role, the hunting zone polygon are kept; adena, clan, gear, notes are not)
const ANON = { Tank3: 'Tankard', Bishop4: 'Healix', Chanter4: 'Chantor', Nuker7: 'Novara', Nuker8: 'Embera', Nuker9: 'Kaelor', Nuker10: 'Necra', Nuker11: 'Ashen', Destroyer9: 'Grumm' };
const REAL = {};
Object.keys(ANON).forEach(n => { REAL[ANON[n]] = readJ(path.join(ROOT, 'Logs', `swarm_state_${n}.json`), null) || { role: 'nuker', cls: 'Wizard', classId: 11, level: 27 }; });
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'liveparty-sb-'));
['Logs', 'Settings', path.join('Scripts', 'data'), path.join('docs', 'plan')].forEach(d => fs.mkdirSync(path.join(SB, d), { recursive: true }));
fs.writeFileSync(path.join(SB, 'docs', 'plan', 'README.md'), '# sandbox\n');
// server.js / polyedit_api.js require helper modules from <root>/docs/plan/tools (code only, no data): copies in the sandbox
fs.mkdirSync(path.join(SB, 'docs', 'plan', 'tools'), { recursive: true });
fs.readdirSync(__dirname).filter(f => /\.js$/.test(f)).forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(SB, 'docs', 'plan', 'tools', f)));
fs.writeFileSync(path.join(SB, 'Logs', 'pause_supervisor'), 'sandbox');
fs.writeFileSync(path.join(SB, 'accounts.json'), JSON.stringify(Object.values(ANON).map((c, i) => ({ login: 'sb' + i, character: c, party: 'Tankard', role: REAL[c].role }))));
const ZONE = (REAL.Tankard.zone && REAL.Tankard.zone.poly) ? REAL.Tankard.zone : { x: -46024, y: 145032, r: 1778, name: 'Abandoned Camp - area 2', poly: null };
const T0 = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const ROUTE = [[-46500, 145500, -3008], [-46200, 145150, -3008], [-45900, 144800, -3008], [-45600, 144450, -3008], [-45250, 144200, -3008], [-44850, 144250, -3008]];
const MOBS = [
  { id: 9001, n: 'Ol Mahum Patrol', x: -45880, y: 145020, lvl: 28, hp: 64 }, { id: 9002, n: 'Ol Mahum Guard', x: -45760, y: 145140, lvl: 27, hp: 100 },
  { id: 9003, n: 'Ol Mahum Recruit', x: -45950, y: 144860, lvl: 26, hp: 100 }, { id: 9004, n: 'Ol Mahum Guard', x: -46420, y: 145330, lvl: 27, hp: 88 },
  { id: 9005, n: 'Ol Mahum Patrol', x: -46820, y: 145880, lvl: 28, hp: 100 }, { id: 9006, n: 'Ol Mahum Recruit', x: -45200, y: 145600, lvl: 26, hp: 100 },
  { id: 9007, n: 'Ol Mahum Guard', x: -44700, y: 144700, lvl: 27, hp: 100 }, { id: 9008, n: 'Ol Mahum Patrol', x: -47100, y: 144900, lvl: 28, hp: 100 },
  { id: 9009, n: 'Ol Mahum Recruit', x: -46650, y: 144500, lvl: 26, hp: 71 }, { id: 9010, n: 'Ol Mahum Guard', x: -45500, y: 146100, lvl: 27, hp: 100 },
];
const mob = (id, extra) => { const m = MOBS.find(x => x.id === id); return Object.assign({ id: m.id, n: m.n, x: m.x, y: m.y, lvl: m.lvl, hit: false, on: true, cc: null }, extra || {}); };
function intentLines(name, now) {
  const L = [], t = (s) => iso(now - s * 1000), here = '-46100,145100,-3008';
  const add = (s, line) => L.push(t(s) + ' ' + line);
  add(300, `walk: to the hunting area | from ${here} -> -46024,145032,-3008 (120 away) | task: autolevel`); add(290, `  -> walk OK: arrived | now at ${here}`);
  add(200, `attack: Ol Mahum Guard (100% HP) | from ${here} -> -46043,145096,-3024 (294 away) | task: autolevel`);
  add(150, `attack: Ol Mahum Recruit (100% HP) | from ${here} -> -45951,144860,-3024 (260 away) | task: autolevel`);
  if (name === 'Tankard') { add(40, `lead team: to -44850,144250,-3008 with Healix, Chantor, Novara, Embera, Kaelor, Necra, Ashen, Grumm | from -46500,145500,-3008 -> -44850,144250,-3008 (2100 away) | task: autolevel: area 3`); }
  if (name === 'Novara') { add(60, `walk: to Helvetia | from 81000,148600,-3464 -> 81340,148720,-3464 (360 away) | task: selling`); add(50, `  -> walk OK: arrived | now at 81340,148720,-3464`); add(20, `npc: talking to Helvetia (Grocer) | from 81340,148720,-3464 -> 81360,148730,-3464 (20 away) | task: selling at Helvetia (3/7)`); }
  if (name === 'Kaelor') { add(45, `walk: to -45250,144200 | from -46350,145650,-3008 -> -45250,144200,-3008 (1820 away) | task: autolevel: following the route`); }
  if (name === 'Necra') { add(12, `escape: alone in a fight (HP 31%) | from -46900,145900,-3008 | task: escape`); }
  if (name === 'Ashen') { add(8, `attack: Ol Mahum Guard (40% HP) | from -46380,145300,-3008 -> -46420,145330,-3008 (50 away) | task: autolevel`); add(4, `  -> attack FAIL: died | now at -46380,145300,-3008`); }
  if (name === 'Grumm') { add(6, `attack: Ol Mahum Patrol (90% HP) | from -45960,145060,-3008 -> -45880,145020,-3008 (90 away) | task: autolevel`); }
  return L.join('\n') + '\n';
}
function states(now) {
  const base = (name, x, y, extra) => {
    const R = REAL[name];
    return Object.assign({ name, role: R.role, gearRole: R.gearRole, cls: R.cls, classId: R.classId, level: R.level, exp: Math.round((R.exp || 40) * 10) / 10,
      hp: 100, mp: 92, cp: 100, dead: false, x, y, z: -3008, bot: true, combat: false, mode: 'autolevel', task: 'autolevel: Abandoned Camp - area 2', leader: false,
      adena: 2000000 + name.length * 1000, soe: 5, res: 3, shotId: 1463, shots: 4200, buffs: 26, buffLeft: 19000, deb: [], notes: [], updated: iso(now),
      intent: null, zone: null, escape: null, cast: null, rescue: null, manualSpot: null, combatRange: 1200,
      doing: { activity: 'autolevel', target: null, resting: false, busy: false, escaping: false, trading: false, follow: 'Tankard', zone: '' },
      aggro: [], expLog: [], expDelta: null, expHour: { pct: 0.9, amt: 61000, n: 46, mins: 60 } }, extra || {});
  };
  const cyc = Math.floor((now - T0) / 12000), evAt = T0 + cyc * 12000 + 600;            // a fresh exp event every 12 s (the test waits for it)
  const k = (now - T0) / 1000, prog = Math.min(1, (k % 40) / 40);
  const li = Math.min(ROUTE.length - 2, Math.floor(prog * (ROUTE.length - 1))), f = prog * (ROUTE.length - 1) - li;
  const lx = Math.round(ROUTE[li][0] + (ROUTE[li + 1][0] - ROUTE[li][0]) * f), ly = Math.round(ROUTE[li][1] + (ROUTE[li + 1][1] - ROUTE[li][1]) * f);
  const castStart = T0 + Math.floor((now - T0) / 3500) * 3500;
  const cdLeft = (per) => per - ((now - T0) % per);                                   // a cooldown that restarts every per ms
  const BUFFS = [[1068, 41000], [1040, 40500], [1204, 39000], [1086, 38000], [1062, 30000], [1035, 29000], [1045, 28000], [1048, 27000], [1077, 26000], [264, 7000], [267, 6800], [268, 6500], [269, 6400], [304, 6200]];
  const bl = (n, deb) => BUFFS.slice(0, n).map(([id, left]) => ({ id, lvl: 1, left: left - Math.floor((now - T0) / 1000), deb: false })).concat(deb || []);
  return [
    base('Tankard', lx, ly, { leader: true, task: 'autolevel: Abandoned Camp - moving to area 3', zone: Object.assign({}, ZONE, { name: 'Abandoned Camp - area 2' }),
      route: { pts: ROUTE, i: li + 1, target: { x: ROUTE[ROUTE.length - 1][0], y: ROUTE[ROUTE.length - 1][1], label: 'area 3 (Abandoned Camp)' }, stuck: false, stuckSince: null, replans: 0 },
      aggro: [mob(9004, { hit: true })], doing: { activity: 'autolevel', target: null, resting: false, follow: null, autolevel: { spot: 'Abandoned Camp - area 2', levels: '20-33', kills5m: 14 } },
      expLog: [{ amt: 1180, pct: 0.0112, at: evAt - 300, why: 'kill Ol Mahum Guard', lvl: 27, up: 0 }], expHour: { pct: 1.12, amt: 118000, n: 58, mins: 60 } }),
    base('Grumm', -45960, 145060, { combat: true, hp: 71, doing: { activity: 'autolevel', target: { name: 'Ol Mahum Patrol', hp: 64, dist: 90 }, resting: false, follow: 'Tankard' },
      tpos: { id: 9001, x: -45880, y: 145020 }, aggro: [mob(9001, { hit: true }), mob(9002, { hit: true }), mob(9003)],
      expLog: [{ amt: 1234, pct: 0.0101, at: evAt - 3500, why: 'kill Ol Mahum Recruit', lvl: 27, up: 0 }, { amt: 1234, pct: 0.0101, at: evAt - 1700, why: 'kill Ol Mahum Recruit', lvl: 27, up: 0 }, { amt: 1234, pct: 0.0101, at: evAt, why: 'kill Ol Mahum Patrol', lvl: 27, up: 0 }],
      lastSkill: { id: 260, tgt: 'Ol Mahum Patrol', at: iso(now - 1500) },
      ov: { skills: [{ id: 260, lvl: 1, ready: false, cd: cdLeft(9000), mp: 30 }, { id: 176, lvl: 1, ready: false, cd: cdLeft(60000), mp: 20 }, { id: 121, lvl: 1, ready: true, cd: 0, mp: 10 }, { id: 287, lvl: 1, ready: true, cd: 0, mp: 0, tog: true }], items: [], inv: [] },
      buffList: bl(12, [{ id: 1164, lvl: 1, left: 25 - Math.floor(((now - T0) / 1000) % 25), deb: true }]) }),
    base('Embera', -46180, 144880, { combat: true, mp: 64, cast: { kind: 'skill', id: 1230, skill: 1230, name: 'Prominence', start: iso(castStart), ms: 3500, target: 'Ol Mahum Patrol', ended: '', endedAt: null },
      doing: { activity: 'autolevel', target: { name: 'Ol Mahum Patrol', hp: 64, dist: 330 }, resting: false, follow: 'Tankard' }, tpos: { id: 9001, x: -45880, y: 145020 },
      expLog: [{ amt: 980, pct: 0.0093, at: evAt - 200, why: 'kill Ol Mahum Patrol', lvl: 27, up: 0 }],
      ov: { skills: [{ id: 1230, lvl: 1, ready: false, cd: cdLeft(3500), mp: 60 }, { id: 1239, lvl: 1, ready: false, cd: cdLeft(15000), mp: 40 }], items: [], inv: [] }, buffList: bl(14) }),
    base('Kaelor', -46380, 145620, { task: 'route to area 3: walking', route: { pts: [[-46380, 145620, -3008], [-46050, 145250, -3008], [-45600, 144450, -3008], [-45250, 144200, -3008]], i: 1,
      target: 'area 3 (Abandoned Camp)', stuck: true, stuckSince: iso(T0 - 25000), replans: 2 } }),
    base('Novara', 81350, 148725, { z: -3464, task: 'selling at Helvetia (3/7)', mode: 'idle', doing: { activity: null, target: null, resting: false, trading: false, follow: null } }),
    base('Healix', -46250, 145240, { mp: 58, lastSkill: { id: 1217, tgt: 'Grumm', at: iso(now - 900) }, buffList: bl(10), ov: { skills: [{ id: 1217, lvl: 1, ready: false, cd: cdLeft(4000), mp: 40 }, { id: 1219, lvl: 1, ready: false, cd: cdLeft(20000), mp: 80 }] }, doing: { activity: 'autolevel', target: null, resting: false, follow: 'Tankard' } }),
    base('Ashen', -46380, 145300, { dead: true, hp: 0, mp: 40, cp: 0, combat: false, task: 'dead', doing: { activity: null, target: null, resting: false, follow: 'Tankard' },
      expLog: [{ amt: 1100, pct: 0.0099, at: evAt - 60000, why: 'kill Ol Mahum Guard', lvl: 27, up: 0 }, { amt: -12345, pct: -0.2481, at: evAt, why: 'death', lvl: 27, up: 0 }], expHour: { pct: 0.31, amt: 30000, n: 30, mins: 60 } }),
    base('Chantor', -46320, 144980, { hp: 62, mp: 21, doing: { activity: 'autolevel', target: null, resting: true, follow: 'Tankard' }, task: 'resting' }),
    base('Necra', -46900, 145900, { hp: 31, combat: true, deb: ['POISON', 'SPEED_DOWN'], aggro: [mob(9005, { hit: true }), mob(9008)],
      escape: { on: true, why: 'alone in a fight', phase: 'run', text: 'running to the safe spot', round: 1, result: null, started: iso(now - 12000), endedAt: null, me: { x: -46900, y: 145900, z: -3008 }, hp: 31, noHitSec: 1,
        target: { x: -46200, y: 145300, z: -3008, label: 'the party', path: [[-46600, 145650], [-46200, 145300]] }, moved: 300, mobs: [{ id: 9005, n: 'Ol Mahum Patrol', x: -46820, y: 145880, lvl: 28, on: true, hit: true }], cc: [], steps: [] },
      doing: { activity: 'autolevel', target: { name: 'Ol Mahum Patrol', hp: 100, dist: 80 }, resting: false, escaping: true, follow: 'Tankard' } }),
  ];
}
function writeFixtures() {
  const now = Date.now();
  states(now).forEach(s => fs.writeFileSync(path.join(SB, 'Logs', `swarm_state_${s.name}.json`), JSON.stringify(s)));
  Object.values(ANON).forEach(n => fs.writeFileSync(path.join(SB, 'Logs', `intent_${n}.log`), intentLines(n, now)));
  fs.writeFileSync(path.join(SB, 'mobs.json'), JSON.stringify({ mobs: MOBS.map(m => ({ obj_id: m.id, name: m.n, x: m.x, y: m.y, z: -3008, level: m.lvl, hp_percent: m.hp, is_dead: false, title: 'LvL: ' + m.lvl + ' A' })) }));
}

// ===================================================================== browser test ===============================================
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  writeFixtures(); const fx = setInterval(writeFixtures, 1000);
  const srv = cp.spawn(process.execPath, [__filename, '--server', SB], { stdio: ['ignore', 'pipe', 'pipe'] });
  let PORT = 0; const mcp = [], serr = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcp.push(l); }));
  srv.stderr.on('data', d => serr.push(String(d)));
  for (let i = 0; i < 150 && !PORT; i++) await sleep(100);
  if (!PORT) { console.log(serr.join('')); throw new Error('sandbox server did not start'); }
  console.log('sandbox', SB, 'port', PORT);
  // the API itself
  const api = await (await fetch(`http://127.0.0.1:${PORT}/api/live?party=Tankard`)).json();
  ok('/api/live answers with 9 members', api.members && api.members.length === 9, api.error);
  ok('/api/live: intents + mobs from (mocked) MCP', api.members && api.members.every(m => Array.isArray(m.intents)) && api.mobs.length === MOBS.length && /mcp/.test(api.mobsSrc), `mobs ${api.mobs && api.mobs.length} src ${api.mobsSrc}`);
  ok('/api/live: route + aggro + expLog passed through', !!(api.members.find(m => m.name === 'Tankard') || {}).route && (api.members.find(m => m.name === 'Grumm') || {}).aggro.length === 3);
  const bad = await (await fetch(`http://127.0.0.1:${PORT}/api/live?party=Nobody`)).json();
  ok('/api/live: unknown party -> error + party list', !!bad.error && Array.isArray(bad.parties));
  ok('/liveparty.js + .css are served', (await fetch(`http://127.0.0.1:${PORT}/liveparty.js`)).status === 200 && (await fetch(`http://127.0.0.1:${PORT}/liveparty.css`)).status === 200);

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-edge-'));
  const DBG = 9300 + Math.floor(Math.random() * 500);
  const br = cp.spawn(EDGE, ['--headless=new', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [], jsErr = [];
  sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); console.log('  shot', name); };
  const posts = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') cdp('Page.handleJavaScriptDialog', { accept: false }).catch(() => { });
    if (m.method === 'Runtime.exceptionThrown') jsErr.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method !== 'Fetch.requestPaused') return;
    const rq = m.params.request, rid = m.params.requestId;
    if (rq.method === 'POST') { posts.push(rq.url); return cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"ok":true,"intercepted":true}').toString('base64') }).catch(() => { }); }
    cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { });
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: false });   // UIDIALOG 2026-10-10: the shared dialog answers itself
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
  // waits until a fresh exp event (fixture: every 12 s) is ~1.5 s old, so the green/red pop-ups are on screen
  const waitExp = async () => { for (let i = 0; i < 140; i++) { const age = (Date.now() - T0) % 12000; if (age > 1800 && age < 2600) return; await sleep(100); } };

  for (const dev of [{ tag: 'iphone', w: 390, h: 844, s: 2, mobile: true, cols: 1 }, { tag: 'tablet', w: 820, h: 1180, s: 2, mobile: true, cols: 2 }, { tag: 'desktop', w: 1920, h: 1080, s: 1, mobile: false, cols: 3 }]) {
    console.log(`--- ${dev.tag} ${dev.w}x${dev.h}`);
    await cdp('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: dev.s, mobile: dev.mobile });
    await cdp('Emulation.setTouchEmulationEnabled', dev.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    if (dev.mobile) await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/parties` });
    ok('Parties tab shows the Live button on the party card', await waitFor(`!!document.querySelector('[data-livep="Tankard"]')`, 30000));
    if (dev.tag === 'iphone') {
      await waitExp();                                          // the Parties tab refreshes every 4 s: wait for the render after the event
      await waitFor(`[...document.querySelectorAll('.mem2 .xpd')].some(x => /loss/.test(x.className)) && [...document.querySelectorAll('.mem2 .xpd')].some(x => /gain/.test(x.className))`, 6000);
      const xr = await ev(`[...document.querySelectorAll('.mem2 .xpd')].map(x => x.className + ': ' + x.textContent)`);
      ok('Parties tab member rows: exp delta pop-ups (green gain / red loss)', xr.some(t => /gain/.test(t)) && xr.some(t => /loss/.test(t) && /died/.test(t)), xr.join(' | '));
      await ev(`document.querySelector('[data-livep="Tankard"]').closest('.win').scrollIntoView()`); await sleep(300);
      await shot('liveparty_v2_iphone_0_parties_xp.png');
    }
    await ev(`document.querySelector('[data-livep="Tankard"]').click()`);
    ok('Live button opens #/live/Tankard', await waitFor(`location.hash === '#/live/Tankard' && !document.getElementById('tab-liveparty').hidden && document.querySelectorAll('#lpCards .lpc').length === 9`, 15000));
    await ev(`LiveParty._lp.sel = null, LiveParty._lp.info = ''`);
    ok('other tabs hidden while the live page is open', await ev(`[...document.querySelectorAll('main > section')].filter(s => !s.hidden).map(s => s.id).join() === 'tab-liveparty'`));
    await waitExp(); await sleep(1200);
    const info = await ev(`(() => { const t = (n) => { const c = document.getElementById('lpc_' + n); return c ? c.querySelector('.lact').innerText.replace(/\\s+/g, ' ') : ''; };
      const svg = document.getElementById('lpSvg');
      return { act: Object.fromEntries(['Tankard','Grumm','Embera','Kaelor','Novara','Healix','Ashen','Chantor','Necra'].map(n => [n, t(n)])),
        aggroChip: (document.querySelector('#lpc_Grumm .chip.aggro') || {}).textContent || '', deb: [...document.querySelectorAll('#lpc_Necra .chip.deb')].map(x => x.textContent),
        xpd: [...document.querySelectorAll('#lpCards .xpd')].map(x => x.closest('.lpc').dataset.lpsel + ' ' + x.className + ': ' + x.textContent),
        tl: document.querySelectorAll('#lpc_Tankard .tl5 > div').length, rate: (document.querySelector('#lpc_Tankard .rate') || {}).textContent || '',
        route: [...svg.querySelectorAll('polyline')].filter(p => p.getAttribute('stroke') === '#3fdc6a').length,
        aggroLines: [...svg.querySelectorAll('line')].filter(p => p.getAttribute('stroke') === '#ff7a45').length,
        tgtLines: [...svg.querySelectorAll('line')].filter(p => p.getAttribute('stroke') === '#ffd34d').length,
        pulse: svg.querySelectorAll('.lp-pulse').length, arc: (svg.querySelector('.lp-arc') || { getAttribute: () => '' }).getAttribute('stroke-dasharray'),
        tiles: svg.querySelectorAll('#lpTiles image').length, zone: [...svg.querySelectorAll('polygon, rect')].filter(p => p.getAttribute('stroke') === '#e3c27a').length,
        sum: document.getElementById('lpSum').innerText, infoLine: document.getElementById('lpInfo').innerText,
        hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 }; })()`);
    console.log('   activities:', JSON.stringify(info.act, null, 1).replace(/\n/g, '\n     '));
    ok('fighting line', /fighting Ol Mahum Patrol \(64% HP/.test(info.act.Grumm), info.act.Grumm);
    ok('casting line (time left is on the cast bar)', /casting Prominence/.test(info.act.Embera), info.act.Embera);
    ok('stuck line (route reports stuck, re-planning)', /stuck for \d+ s.*re-planning.*try 2/.test(info.act.Kaelor), info.act.Kaelor);
    ok('selling line (NPC + item n/m)', /selling at Helvetia.*item 3\/7/.test(info.act.Novara), info.act.Novara);
    ok('healing line', /healing Grumm \(Greater Heal\)/.test(info.act.Healix), info.act.Healix);
    ok('dead line', /dead/.test(info.act.Ashen), info.act.Ashen);
    ok('resting line', /resting/.test(info.act.Chantor), info.act.Chantor);
    ok('escaping line', /escaping \(running to the party\)/.test(info.act.Necra), info.act.Necra);
    ok('leader walking the route (point i/n, distance left)', /walking to area 3 \(Abandoned Camp\) \(point \d\/6, [\d.k]+ left\)/.test(info.act.Tankard), info.act.Tankard);
    ok('aggro chip "3 monsters on me"', /3 monsters on me/.test(info.aggroChip), info.aggroChip);
    ok('debuff chips', info.deb.length === 2, info.deb.join(', '));
    ok('exp delta on the cards: stacked kills (green) + death (red)', info.xpd.some(t => /Grumm .*gain.*inl.*\+3 kills: \+3,702 exp \(\+0\.030%\)/.test(t)) && info.xpd.some(t => /Ashen .*loss.*12,345 exp.*died/.test(t)), info.xpd.join(' | '));
    ok('exp per hour on the card', /%\/h/.test(info.rate), info.rate);
    ok('timeline: the last intents (max 3)', info.tl >= 2 && info.tl <= 3, String(info.tl));
    // v2 (user 13:00): page-level grid, no inner scroll, rich animated cards
    const v2 = await ev(`(() => { const g = document.getElementById('lpCards'), cs = getComputedStyle(g), cards = [...g.querySelectorAll('.lpc')];
      const lefts = [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().left)))];
      const bottom = Math.max(...cards.map(c => c.getBoundingClientRect().bottom + scrollY));
      const ci = document.querySelector('#lpc_Embera .rlh-ci.casting[data-t0]');
      return { overflow: cs.overflowY, maxH: cs.maxHeight, inner: g.scrollHeight > g.clientHeight + 2 && cs.overflowY !== 'visible', cols: lefts.length, bottom, vh: innerHeight, docH: document.documentElement.scrollHeight,
        castP: ci ? ci.style.getPropertyValue('--p') : '', castBar: !!document.querySelector('#lpc_Embera .castbar[data-start]'),
        cd: document.querySelectorAll('#lpc_Grumm .rlh-cd.on').length, cdAll: document.querySelectorAll('#lpc_Grumm .rlh-cd').length, cdn: (document.querySelector('#lpc_Grumm .rlh-cd.on .cdn') || {}).textContent || '',
        bf: document.querySelectorAll('#lpc_Grumm .lp-bf').length, bfDeb: document.querySelectorAll('#lpc_Grumm .lp-bf.deb').length,
        tg: (document.querySelector('#lpc_Grumm .lp-tg') || {}).innerText || '', rt: (document.querySelector('#lpc_Tankard .lp-rt') || {}).innerText || '',
        stuck: (document.querySelector('#lpc_Kaelor .chip.stuck') || {}).textContent || '', aggroAnim: getComputedStyle(document.querySelector('#lpc_Grumm .chip.aggro')).animationName,
        hpTrans: getComputedStyle(document.querySelector('#lpc_Grumm .lp-r2 .gauge.hp i')).transitionDuration }; })()`);
    let castP2 = v2.castP; for (let i = 0; i < 12 && castP2 === v2.castP; i++) { await sleep(300); castP2 = await ev(`(document.querySelector('#lpc_Embera .rlh-ci.casting') || { style: { getPropertyValue: () => '' } }).style.getPropertyValue('--p')`); }
    console.log('   v2:', JSON.stringify(v2));
    ok('cards: no inner scroll box (the page scrolls)', !v2.inner && v2.maxH === 'none' && /visible/.test(v2.overflow), v2.overflow + ' / ' + v2.maxH);
    ok('cards grid columns = ' + dev.cols, v2.cols === dev.cols, String(v2.cols));
    if (dev.tag === 'desktop') ok('desktop: all 9 cards within one page scroll', v2.bottom <= 2 * v2.vh, `last card bottom ${Math.round(v2.bottom)} px, viewport ${v2.vh}`);
    ok('cast icon sweep moves between refreshes', v2.castP !== '' && castP2 !== '' && v2.castP !== castP2, v2.castP + ' -> ' + castP2);
    ok('cast bar with time left', v2.castBar);
    ok('key skills with cooldown sweeps (+ seconds)', v2.cd >= 1 && v2.cdAll >= 2 && /^\d+$/.test(v2.cdn), `${v2.cd}/${v2.cdAll} on, ${v2.cdn} s`);
    ok('buff + debuff icons with time bars', v2.bf >= 10 && v2.bfDeb === 1, `${v2.bf} icons, ${v2.bfDeb} debuff`);
    ok('target row with HP', /Ol Mahum Patrol/.test(v2.tg) && /64%/.test(v2.tg), v2.tg.replace(/\s+/g, ' '));
    ok('route progress row', /area 3/.test(v2.rt) && /\d\/6/.test(v2.rt), v2.rt.replace(/\s+/g, ' '));
    ok('stuck chip', /stuck \d+ s/.test(v2.stuck), v2.stuck);
    ok('aggro chip pulses + HP bar transition', v2.aggroAnim === 'lpAggro' && v2.hpTrans !== '0s', v2.aggroAnim + ' / ' + v2.hpTrans);
    ok('map: green route polylines (leader + stuck one)', info.route >= 2, String(info.route));
    ok('map: aggro lines monster -> member', info.aggroLines >= 5, String(info.aggroLines));
    ok('map: target lines member -> monster', info.tgtLines >= 2, String(info.tgtLines));
    ok('map: stuck ring pulsing', info.pulse >= 1, String(info.pulse));
    ok('map: cast progress arc', /^\d+(\.\d)? 100$/.test(info.arc), info.arc);
    ok('map: /minitile art + hunting area outline', info.tiles > 0 && info.zone === 1, `tiles ${info.tiles}, zone ${info.zone}`);
    ok('far away member listed (Novara in Giran)', /Novara/.test(info.infoLine), info.infoLine);
    ok('no horizontal page scroll', !info.hscroll);
    await ev(`window.scrollTo(0, 0)`); await sleep(200);
    await shot(`liveparty_v2_${dev.tag}_1_top.png`);
    await ev(`document.getElementById('lpCards').scrollIntoView()`); await sleep(300); await shot(`liveparty_v2_${dev.tag}_2_cards.png`);
    if (dev.tag !== 'desktop') { await ev(`document.getElementById('lpc_Necra').scrollIntoView()`); await sleep(300); await shot(`liveparty_v2_${dev.tag}_3_cards_more.png`); }
    else { await ev(`window.scrollTo(0, document.documentElement.scrollHeight)`); await sleep(300); await shot('liveparty_v2_desktop_3_scrolled.png'); }
    await ev(`window.scrollTo(0, 0)`);
    // tap a card -> highlighted on the map + link to the character page
    await ev(`document.querySelector('#lpc_Grumm .lact').click()`); await sleep(400);
    const sel = await ev(`({ sel: document.getElementById('lpc_Grumm').classList.contains('sel'), halo: [...document.querySelectorAll('#lpOver circle')].some(c => c.getAttribute('fill') === 'rgba(255,255,255,.18)'), link: (document.querySelector('#lpc_Grumm a.open') || {}).getAttribute ? document.querySelector('#lpc_Grumm a.open').getAttribute('href') : '', info: document.getElementById('lpInfo').innerText })`);
    ok('tap a card: selected + halo on the map + info line', sel.sel && sel.halo && /^Grumm:/.test(sel.info), sel.info);
    ok('card links to the full character page', sel.link === '#/char/Grumm', sel.link);
    // zoom (button) turns follow off; follow button fits again
    const hw0 = await ev(`LiveParty._lp.view.hw`); await ev(`document.getElementById('lpZin').click()`); await sleep(300);
    const z1 = await ev(`({ hw: LiveParty._lp.view.hw, follow: LiveParty._lp.follow })`);
    ok('zoom in button: smaller view, follow off', z1.hw < hw0 && !z1.follow, `${Math.round(hw0)} -> ${Math.round(z1.hw)}`);
    await sleep(300); await shot(`liveparty_v2_${dev.tag}_4_selected_zoomed.png`);
    // tap a marker on the map selects that member (Embera)
    const tapOk = await ev(`(() => { const lp = LiveParty._lp; const w = document.getElementById('lpMap').getBoundingClientRect(); const v = lp.view, hh = v.hw * w.height / w.width;
      const m = lp.data.members.find(x => x.name === 'Embera'); const px = (m.x - (v.cx - v.hw)) / (2 * v.hw) * w.width + w.left, py = (m.y - (v.cy - hh)) / (2 * hh) * w.height + w.top;
      const el = document.getElementById('lpMap'); const o = { bubbles: true, clientX: px, clientY: py, pointerId: 7, isPrimary: true };
      el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); return lp.sel; })()`);
    ok('tap a marker on the map selects that member', tapOk === 'Embera', tapOk);
    await ev(`document.getElementById('lpFollow').click()`); await sleep(300);
    ok('follow button fits the party again', await ev(`LiveParty._lp.follow === true`));
    // back to the parties tab closes the live page (no timer left)
    await ev(`document.getElementById('lpBack').click()`);
    ok('Back closes the live view', await waitFor(`!location.hash.startsWith('#/live/') && document.getElementById('tab-liveparty').hidden && !LiveParty._lp.timer`, 5000), await ev('location.hash'));
    // #/live (no leader) is still the raid live view
    await ev(`location.hash = '#/live'`); await sleep(500);
    ok('#/live without a leader = the old raid live view', await ev(`!document.getElementById('tab-live').hidden && document.getElementById('tab-liveparty').hidden`));
  }
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await ev(`location.hash = '#/live/Tankard'`); await waitFor(`document.querySelectorAll('#lpCards .lpc').length === 9`, 10000); await sleep(1600);
  const redm = await ev(`({ a: getComputedStyle(document.querySelector('#lpc_Grumm .chip.aggro')).animationName, t: getComputedStyle(document.querySelector('#lpc_Grumm .lp-r2 .gauge.hp i')).transitionDuration })`);
  ok('reduced motion: no pulse, no bar transitions', redm.a === 'none' && redm.t === '0s', JSON.stringify(redm));
  await cdp('Emulation.setEmulatedMedia', { features: [] });
  // party switcher + unknown party
  await ev(`location.hash = '#/live/Nobody'`); await sleep(2500);
  ok('unknown party: error shown, no crash', /unknown party/.test(await ev(`document.getElementById('lpSum').innerText`)));
  ok('no JavaScript errors', jsErr.length === 0, jsErr.slice(0, 3).join(' | '));
  ok('no POST requests were sent', posts.length === 0, posts.join(', '));
  ok('MCP calls: only reads (get_account_data mobs ...)', mcp.every(l => /^MCP (get_account_data|get_accounts_status|get_account_status) /.test(l)), mcp.filter(l => !/get_account_data|get_accounts_status|get_account_status/.test(l)).slice(0, 3).join(' | '));
  clearInterval(fx);
  try { sock.close(); } catch (e) { }
  br.kill(); srv.kill();
  await sleep(500);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { }
  try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  console.log(fails ? `${fails} FAILED` : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
