// Headless check of the PARTY STATUS on the Parties tab (#/parties: Dashboard/partystatus.js + activity.js + partystatus.css, user 2026-10-09
// 11:15: "Under /parties it is sooo hard to see what is going on ... I don't know who is trading with who and what the status is"):
// the party banner (sentence + step bar + elapsed + warning + reason), the plain-words member rows (trades with both sides, turns, ready,
// stuck chip), the animated trade lines on the party map, reduced motion, no horizontal scroll — iPhone portrait (390x844) + desktop 1920x1080.
// SANDBOX: a temp folder with SYNTHETIC demo characters (no real names / adena / gear) is the install root; server.js runs from the real
// Dashboard folder with MCP MOCKED (nothing reaches L2Swarm / the game), no background timers / child processes, POSTs blocked in the browser.
// Scenarios, one party each: supply run inside a Giran regroup (trade in progress, waiting turns, a finished trade, stuck), a fund round to
// another team, travelling, hunting with 2 areas, a regroup that takes too long (warning + reason), an OLD swarm.js (task texts only),
// waiting for orders. Screenshots: docs/plan/mobile_check/parties_*.png
//   node docs/plan/tools/test_partystatus_ui.js
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
  fs.writeFileSync = (f, d, o) => (inSb(f) ? realWrite(f, d, o) : undefined);
  fs.appendFileSync = (f, d, o) => (inSb(f) ? realAppend(f, d, o) : undefined);
  const realCreate = http.createServer;
  http.createServer = (h) => { const s = realCreate(h); const L = s.listen.bind(s); s.listen = (p, host, cb) => L(0, '127.0.0.1', () => { process.stdout.write('PORT ' + s.address().port + '\n'); }); return s; };
  console.log = () => { };
  require(path.join(ROOT, 'Dashboard', 'server.js'));
  global.setInterval = T.si; global.setTimeout = T.st;
  return;
}

// ===================================================================== fixtures (synthetic demo characters) =========================
const OUT = path.join(ROOT, 'docs', 'plan', 'mobile_check');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'partystatus-sb-'));
['Logs', 'Settings', path.join('Scripts', 'data'), path.join('docs', 'plan')].forEach(d => fs.mkdirSync(path.join(SB, d), { recursive: true }));
fs.writeFileSync(path.join(SB, 'docs', 'plan', 'README.md'), '# sandbox\n');
fs.mkdirSync(path.join(SB, 'docs', 'plan', 'tools'), { recursive: true });
fs.readdirSync(__dirname).filter(f => /\.js$/.test(f)).forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(SB, 'docs', 'plan', 'tools', f)));
fs.writeFileSync(path.join(SB, 'Logs', 'pause_supervisor'), 'sandbox');
const PARTIES = {
  Tankard: [['Tankard', 'sk', 'Shillien Knight', 33, 31], ['Healix', 'bishop', 'Bishop', 16, 30], ['Chantor', 'doomcryer', 'Warcryer', 52, 30], ['Novara', 'nuker', 'Sorcerer', 12, 29],
    ['Embera', 'nuker', 'Spellsinger', 27, 29], ['Kaelor', 'destroyer', 'Destroyer', 46, 31], ['Necra', 'necromancer', 'Necromancer', 13, 29], ['Ashen', 'destroyer', 'Destroyer', 46, 30], ['Grumm', 'doombringer', 'Berserker', 127, 30]],
  Fundor: [['Fundor', 'sk', 'Shillien Knight', 33, 52], ['Mira', 'bishop', 'Bishop', 16, 51], ['Pell', 'nuker', 'Sorcerer', 12, 51]],
  Quill: [['Quill', 'dagger', 'Treasure Hunter', 8, 22]],
  Rover: [['Rover', 'tank', 'Paladin', 5, 28], ['Rook', 'healer', 'Elven Elder', 30, 28], ['Rhea', 'nuker', 'Spellhowler', 41, 27], ['Rudd', 'destroyer', 'Destroyer', 46, 28]],
  Hunter: [['Hunter', 'tank', 'Dark Avenger', 6, 28], ['Holly', 'healer', 'Shillien Elder', 43, 28], ['Hale', 'archer', 'Silver Ranger', 24, 28], ['Hask', 'nuker', 'Necromancer', 13, 27]],
  Stray: [['Stray', 'sk', 'Shillien Knight', 33, 35], ['Wisp', 'nuker', 'Spellsinger', 27, 34], ['Dusk', 'bishop', 'Bishop', 16, 35]],
  Oldie: [['Oldie', 'tank', 'Paladin', 5, 40], ['Moss', 'healer', 'Elven Elder', 30, 40], ['Fern', 'nuker', 'Sorcerer', 12, 39]],
  Sleepy: [['Sleepy', 'tank', 'Dark Avenger', 6, 45], ['Nod', 'healer', 'Elder', 30, 44]],
};
const ACC = []; Object.keys(PARTIES).forEach(p => PARTIES[p].forEach(([c, role]) => ACC.push({ login: 'sb' + ACC.length, character: c, party: p, role })));
fs.writeFileSync(path.join(SB, 'accounts.json'), JSON.stringify(ACC));
const T0 = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const GIR = [83473, 148554], WINDY = [-87896, 86984];
const ZONE = { x: -87896, y: 86984, r: 5419, name: 'Windy Hill: area 1', room: 'windy-hill-1', area: 'windy-hill-1', region: 'windy-hill',
  poly: [[-87696, 84016], [-89280, 84080], [-89728, 86112], [-90368, 86608], [-89952, 87488], [-89472, 88448], [-89568, 90032], [-88560, 91056], [-87152, 92352], [-86112, 91296], [-85376, 90288], [-86320, 89296], [-86688, 87584], [-86144, 86704], [-85840, 85488], [-86800, 84320]],
  multi: { kind: 'field', place: 'windy-hill', list: [{ id: 'windy-hill-1', n: 1, name: 'area 1', current: true, live: 24, expect: null }, { id: 'windy-hill-5', n: 2, name: 'area 5', current: false, live: null, expect: 6 }] } };
const SUP = ['collect needs', 'buy at Helvetia', 'hand out', 'enchant', 'unload loot', 'members sell', 'gear upgrades', 'dyes', 'collect adena'];
const WHAT = 'Soulshot (D) x1999, Mana Potion x500';
function states(now) {
  const out = [];
  const base = (name, x, y, extra) => {
    const p = Object.keys(PARTIES).find(k => PARTIES[k].some(r => r[0] === name)), r = PARTIES[p].find(q => q[0] === name);
    return Object.assign({ name, role: r[1], cls: r[2], classId: r[3], level: r[4], exp: 41.5, hp: 100, mp: 90, cp: 100, dead: false, x, y, z: -3464, bot: true, combat: false,
      mode: 'idle', task: 'farming (bot)', leader: name === p, adena: 2400000, soe: 5, res: 3, shotId: 1463, shots: 3000, buffs: 26, buffLeft: 30000, deb: [], notes: [], updated: iso(now),
      intent: null, zone: null, escape: null, cast: null, route: null, combatRange: 3600, trade: null, teamStep: null, partyStatus: null,
      doing: { activity: null, target: null, resting: false, busy: false, escaping: false, trading: false, follow: name === p ? null : p, zone: '' } }, extra || {});
  };
  const g = (dx, dy) => [GIR[0] + dx, GIR[1] + dy];
  // 1) SUPPLY RUN inside the Giran regroup before Windy Hill: Tankard -> Healix trade waiting for the confirm
  out.push(base('Tankard', ...g(0, 0), { task: 'regroup: ', trade: { role: 'give', other: 'Healix', what: WHAT, stage: 'confirm', since: iso(T0 - 25000), stageAt: iso(now - 6000), tries: 1, step: 'trade#s2' },
    teamStep: { a: 'trade#s2', at: iso(T0 - 25000), lead: 'Tankard', g: 'Tankard', r: 'Healix', what: WHAT, done: false, ok: true, doneAt: null, wait: null, rank: 0, until: null },
    partyStatus: { what: 'supply', label: 'automatic at the Giran regroup', step: 'hand out', i: 2, of: 9, steps: SUP, since: iso(T0 - 170000), stepAt: iso(T0 - 40000), n: 2, m: 8, cur: 'Healix',
      pending: ['Healix', 'Chantor', 'Embera', 'Kaelor', 'Necra', 'Ashen'], parent: { what: 'regroup', label: 'next hunting spot: Windy Hill', step: 'supplies' },
      ts: { a: 'trade#s2', at: iso(T0 - 25000), n: 7, m: 9, pending: ['Tankard', 'Healix'], g: 'Tankard', r: 'Healix', what: WHAT } } }));
  out.push(base('Healix', ...g(40, 30), { task: 'trade <- ', doing: { trading: true, follow: null }, trade: { role: 'take', other: 'Tankard', what: WHAT, stage: 'confirm', since: iso(T0 - 25000), stageAt: iso(now - 5000), tries: 0, step: 'trade#s2' } }));
  out.push(base('Chantor', ...g(-50, 20), { task: 'regroup: ', teamStep: { a: 'trade#s2', at: iso(T0 - 25000), lead: 'Tankard', g: 'Tankard', r: 'Healix', what: WHAT, done: true, ok: true, doneAt: iso(T0 - 24000) } }));
  out.push(base('Novara', ...g(30, -40), { task: 'regroup: ', trade: { role: 'take', other: 'Tankard', what: 'Spiritshot (D) x1000', stage: 'done', since: iso(now - 40000), stageAt: iso(now - 8000), tries: 0, step: 'trade#s1', ok: true, msg: 'completed', endedAt: iso(now - 8000) },
    teamStep: { a: 'trade#s2', at: iso(T0 - 25000), lead: 'Tankard', g: 'Tankard', r: 'Healix', done: true, ok: true } }));
  out.push(base('Embera', ...g(-1300, 900), { task: 'regroup: ', teamStep: { a: 'sellrun', at: iso(T0 - 20000), lead: 'Tankard', done: false },
    intent: { action: 'walk', detail: 'Giran recorded route to start (4 points)', from: `${GIR[0] - 1400},${GIR[1] + 1000},-3464`, to: `${GIR[0]},${GIR[1]},-3464`, dist: 1700, at: iso(now - 9000) } }));
  out.push(base('Kaelor', ...g(60, 60), { task: 'regroup: ', teamStep: { a: 'sellrun', at: iso(T0 - 20000), lead: 'Tankard', done: false, wait: 'Helvetia (grocer)', rank: 3, until: iso(now + 14000) } }));
  out.push(base('Necra', ...g(-30, -60), { task: 'regroup: ' }));
  out.push(base('Ashen', ...g(-2600, -1800), { task: 'route to Giran start: point 2/4', route: { pts: [[GIR[0] - 2900, GIR[1] - 2100, -3464], [GIR[0] - 2400, GIR[1] - 1500, -3464], [GIR[0] - 1200, GIR[1] - 600, -3464], [GIR[0], GIR[1], -3464]], i: 1,
    target: 'the Giran start', stuck: true, stuckSince: iso(T0 - 45000), replans: 1 } }));
  out.push(base('Grumm', ...g(70, -20), { task: 'farming (bot)' }));
  // 2) FUND ROUND: Fundor gives 2.0M adena to Quill (another team), Sable has not come to the start yet
  out.push(base('Fundor', ...g(150, 120), { adena: 61000000, task: 'regroup: ', trade: { role: 'give', other: 'Quill', what: '2.0M adena', stage: 'open', since: iso(now - 14000), stageAt: iso(now - 8000), tries: 1, step: 'fund' },
    partyStatus: { what: 'fund', label: 'giving adena to characters below their target in Giran', step: 'handing out', since: iso(T0 - 60000), stepAt: iso(T0 - 50000), n: 1, m: 3, cur: 'Quill', pending: ['Quill', 'Sable'], away: ['Sable'] } }));
  out.push(base('Mira', ...g(190, 150)));
  out.push(base('Pell', ...g(120, 170)));
  out.push(base('Quill', ...g(210, 90), { adena: 120000, task: 'trade <- ', trade: { role: 'take', other: 'Fundor', what: '2.0M adena', stage: 'open', since: iso(now - 14000), stageAt: iso(now - 7000), tries: 0, step: 'fund' } }));
  // 3) TRAVELLING to Windy Hill: the walk from the landing
  const RT = [[-84200, 83100, -3400], [-85300, 84400, -3400], [-86400, 85500, -3400], [-87200, 86300, -3400]];
  out.push(base('Rover', -84500, 83500, { z: -3400, task: 'route to Windy Hill: area 1: point 2/4', route: { pts: RT, i: 1, target: 'Windy Hill: area 1', stuck: false, replans: 0 },
    partyStatus: { what: 'travel', label: 'Windy Hill: area 1', step: 'walk', i: 3, of: 4, steps: ['regroup in Giran', 'gather', 'teleport', 'walk'], since: iso(T0 - 200000), stepAt: iso(T0 - 35000), info: '2400 to the centre' } }));
  ['Rook', 'Rhea', 'Rudd'].forEach((n, i) => out.push(base(n, -84560 - i * 50, 83440 + i * 40, { z: -3400 })));
  // 4) HUNTING Windy Hill area 1, rotating 2 areas
  out.push(base('Hunter', -87700, 87100, { z: -3392, mode: 'autolevel', task: 'autolevel: Windy Hill: area 1 · lvl 28 · 72 kills', zone: ZONE, combat: true,
    doing: { activity: 'autolevel', target: { name: 'Babbling Wind', hp: 70, dist: 80 }, follow: null, autolevel: { spot: 'Windy Hill: area 1', levels: '27-29', kills5m: 25 } } }));
  [['Holly', -87760, 87180, null], ['Hale', -87620, 87250, { name: 'Giggling Wind', hp: 40, dist: 300 }], ['Hask', -87810, 86990, { name: 'Babbling Wind', hp: 70, dist: 260 }]].forEach(([n, x, y, tg]) =>
    out.push(base(n, x, y, { z: -3392, combat: !!tg, doing: { activity: 'autolevel', target: tg, follow: 'Hunter' } })));
  // 5) REGROUP that takes too long: Stray waits 4+ min for Wisp (1.2k away) and Dusk (dead)
  out.push(base('Stray', ...g(-200, 300), { task: 'waiting for team: Wisp 1234, Dusk dead',
    partyStatus: { what: 'regroup', label: 'leveling (!level)', step: 'gather', i: 2, of: 6, steps: ['teleport to Giran', 'walk to the start', 'gather', 'supplies', 'fund other teams', 'seven signs'],
      since: iso(T0 - 300000), stepAt: iso(T0 - 250000), hold: { why: 'regroup in Giran', msg: 'waiting for Wisp 1234, Dusk dead', at: iso(now - 2000), since: iso(T0 - 250000) } } }));
  out.push(base('Wisp', ...g(-200 - 1234, 300), { task: 'farming (bot)' }));
  out.push(base('Dusk', ...g(-260, 380), { dead: true, hp: 0, task: 'dead' }));
  // 6) an OLD swarm.js: only the task texts (no trade / teamStep / partyStatus)
  const old = (n, x, y, task) => { const s = base(n, x, y, { task }); delete s.trade; delete s.teamStep; delete s.partyStatus; return s; };
  out.push(old('Oldie', ...g(400, -300), 'trade -> '));
  out.push(old('Moss', ...g(440, -280), 'trade <- '));
  out.push(old('Fern', ...g(380, -330), 'regroup: '));
  // 7) waiting for orders
  out.push(base('Sleepy', 82760, 53578, { z: -1496, task: 'waiting for orders since 21:26 (stop from the dashboard)' }));
  out.push(base('Nod', 82800, 53600, { z: -1496, task: 'waiting for orders since 21:26 (stop from the dashboard)' }));
  return out;
}
function writeFixtures() {
  const now = Date.now();
  states(now).forEach(s => fs.writeFileSync(path.join(SB, 'Logs', `swarm_state_${s.name}.json`), JSON.stringify(s)));
  const mobs = [];
  for (let i = 0; i < 24; i++) mobs.push({ obj_id: 9000 + i, name: i % 2 ? 'Giggling Wind' : 'Babbling Wind', x: -87900 + (i % 6) * 260 - 650, y: 86900 + Math.floor(i / 6) * 240 - 360, z: -3392, level: 28, hp_percent: 100, is_dead: false, title: 'LvL: 28 A' });
  fs.writeFileSync(path.join(SB, 'mobs.json'), JSON.stringify({ mobs }));
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
  ok('/activity.js, /partystatus.js, /partystatus.css are served', (await fetch(`http://127.0.0.1:${PORT}/activity.js`)).status === 200 && (await fetch(`http://127.0.0.1:${PORT}/partystatus.js`)).status === 200 && (await fetch(`http://127.0.0.1:${PORT}/partystatus.css`)).status === 200);
  const st = await (await fetch(`http://127.0.0.1:${PORT}/api/state`)).json();
  ok('/api/state passes trade / teamStep / partyStatus through', !!(st.chars || []).find(c => c.name === 'Tankard' && c.partyStatus && c.trade) && !!(st.chars || []).find(c => c.name === 'Kaelor' && c.teamStep));

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-edge-'));
  const DBG = 9300 + Math.floor(Math.random() * 500);
  const br = cp.spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [], jsErr = [];
  sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const shot = async (name, clip) => { const r = await cdp('Page.captureScreenshot', Object.assign({ format: 'png' }, clip ? { clip, captureBeyondViewport: true } : {})); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); console.log('  shot', name); };
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
  const banner = (p) => `(document.querySelector('.psb[data-psb="${p}"] .psb-t') || {}).innerText || ''`;
  const row = (n) => `(document.querySelector('.mem2[data-char="${n}"] .task') || {}).innerText || ''`;
  const cardOf = (p) => `document.querySelector('.psb[data-psb="${p}"]').closest('.win')`;

  for (const dev of [{ tag: 'phone', w: 390, h: 844, s: 2, mobile: true }, { tag: 'desktop', w: 1920, h: 1080, s: 1, mobile: false }]) {
    console.log(`--- ${dev.tag} ${dev.w}x${dev.h}`);
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await cdp('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: dev.s, mobile: dev.mobile });
    await cdp('Emulation.setTouchEmulationEnabled', dev.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    if (dev.mobile) await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/parties` });
    ok('Parties tab shows a status banner on every party', await waitFor(`document.querySelectorAll('.psb[data-psb]').length >= 8`, 30000), await ev(`document.querySelectorAll('.psb').length + ' banners'`).catch(e => e.message));
    await sleep(600);
    const B = await ev(`(() => { const o = {}; ['Tankard','Fundor','Quill','Rover','Hunter','Stray','Oldie','Sleepy'].forEach(p => { o[p] = (document.querySelector('.psb[data-psb="' + p + '"] .psb-t') || {}).innerText || ''; }); return o; })()`);
    console.log('   banners:', JSON.stringify(B, null, 1).replace(/\n/g, '\n     '));
    ok('supply run inside the regroup: sentence + step + progress', /Regrouping in Giran before going to Windy Hill — supply run step 3\/9: handing out \(2\/8 done, now Healix\)/.test(B.Tankard), B.Tankard);
    ok('fund round sentence (n of m, waiting for the receiver)', /Fund round: Fundor gives adena to characters below their target \(1 of 3 done, waiting for Quill to accept\)/.test(B.Fundor), B.Fundor);
    ok('travelling sentence', /Travelling to Windy Hill: area 1 — step 4\/4: walking to the area — 2400 to the centre/.test(B.Rover), B.Rover);
    ok('hunting sentence (monsters here, rotating areas, kills)', /Hunting Windy Hill: area 1 · 24 monsters here · rotating 2 areas · 25 kills in 5 min/.test(B.Hunter), B.Hunter);
    ok('regroup sentence', /Regrouping in Giran to start leveling — step 3\/6: gathering the team/.test(B.Stray), B.Stray);
    ok('old script: the trade found from the task texts', /Trading in town: Oldie → Moss — 1 member waits for their turn/.test(B.Oldie), B.Oldie);
    ok('waiting for orders', /Waiting for orders since 21:26/.test(B.Sleepy), B.Sleepy);
    const T = await ev(`(() => { const q = (p, s) => [...document.querySelectorAll('.psb[data-psb="' + p + '"] ' + s)]; return {
      bar: q('Tankard', '.psb-bar i').length, now: q('Tankard', '.psb-bar i').findIndex(i => i.classList.contains('now')), done: q('Tankard', '.psb-bar i.done').length,
      meta: (q('Tankard', '.psb-meta')[0] || {}).innerText || '', subs: q('Tankard', '.psb-sub').map(x => x.innerText), age: (q('Tankard', '.psb-age')[0] || {}).innerText || '',
      warnStray: !!document.querySelector('.psb.warn[data-psb="Stray"]'), whyStray: (q('Stray', '.psb-why')[0] || {}).innerText || '', warnTankard: !!document.querySelector('.psb.warn[data-psb="Tankard"]'),
      fundSubs: q('Fundor', '.psb-sub').map(x => x.innerText), hunterWarn: !!document.querySelector('.psb.warn[data-psb="Hunter"]'),
      hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 }; })()`);
    ok('step bar: 9 segments, step 3 pulsing, 2 done', T.bar === 9 && T.now === 2 && T.done === 2, `${T.bar} / now ${T.now} / done ${T.done}`);
    ok('meta line: step n/m + next', /step 3\/9 · next: enchanting gear/.test(T.meta), T.meta);
    ok('elapsed time on the banner', /^\d+ s$|^\d+m\d\ds$/.test(T.age), T.age);
    ok('trade line in the banner: both sides, what, stage', T.subs.some(s => /Trade: Tankard → Healix · Soulshot \(D\) x1999, Mana Potion x500 · confirmed, waiting for Healix to confirm/.test(s)), T.subs.join(' | '));
    ok('the finished trade is listed as done', T.subs.some(s => /Tankard → Novara .*done ✓/.test(s)), T.subs.join(' | '));
    ok('fund: who has not come to the start yet', T.fundSubs.some(s => /not at the Giran start yet: Sable/.test(s)) && T.fundSubs.some(s => /Fundor → Quill · 2\.0M adena \(fund round\) · window open/.test(s)), T.fundSubs.join(' | '));
    ok('a step that takes too long: warning + reason with distance', T.warnStray && /waiting for Wisp \(1\.2k away\), Dusk \(dead\) — for \dm/.test(T.whyStray), T.whyStray);
    ok('no warning while a step is on time / while hunting', !T.warnTankard && !T.hunterWarn);
    const R = await ev(`(() => { const o = {}; ['Tankard','Healix','Chantor','Novara','Embera','Kaelor','Necra','Ashen','Grumm','Quill','Moss','Fern','Wisp','Dusk','Hale'].forEach(n => { o[n] = (document.querySelector('.mem2[data-char="' + n + '"] .task') || {}).innerText || ''; }); return o; })()`);
    console.log('   rows:', JSON.stringify(R, null, 1).replace(/\n/g, '\n     '));
    ok('giver row: trading with the receiver, what + stage', /Trading with Healix: giving Soulshot \(D\) x1999, Mana Potion x500 \(confirmed, waiting for Healix to confirm\)/.test(R.Tankard), R.Tankard);
    ok('receiver row: trading with the giver', /Trading with Tankard: receiving Soulshot \(D\) x1999, Mana Potion x500 \(items in, confirmed — waiting for the trade to finish\)/.test(R.Healix), R.Healix);
    ok('member in the step, not trading: who trades with whom', /waiting while Tankard trades with Healix/.test(R.Chantor), R.Chantor);
    ok('finished trade on the receiver', /Traded with Tankard: received Spiritshot \(D\) x1000 \(done ✓\)/.test(R.Novara), R.Novara);
    ok('walking the recorded Giran route', /walking to the Giran start point \(1\.\dk left\)/.test(R.Embera), R.Embera);
    ok('waiting for its turn at Helvetia', /waiting for its turn at Helvetia \(grocer\) — 3rd in line, ~\d+ s/.test(R.Kaelor), R.Kaelor);
    ok('older member without a team-step report: the leader\'s trade', /waiting while Tankard trades with Healix/.test(R.Necra), R.Necra);
    ok('stuck member: line + chip', /stuck for \d+ s — re-planning \(try 1\) on the way to the Giran start/.test(R.Ashen) && /stuck \d+/.test(R.Ashen), R.Ashen);
    ok('following', /following Tankard/.test(R.Grumm), R.Grumm);
    ok('fund receiver of another team', /Trading with Fundor: receiving 2\.0M adena \(fund round\) \(window open, waiting for the items/.test(R.Quill), R.Quill);
    ok('old script receiver: partner found by the task', /trading with Oldie \(receiving\)/.test(R.Moss), R.Moss);
    ok('old script bystander: who trades with whom', /waiting while Oldie trades with Moss/.test(R.Fern), R.Fern);
    ok('dead + fighting rows', /dead/.test(R.Dusk) && /fighting Giggling Wind/.test(R.Hale), R.Dusk + ' | ' + R.Hale);
    ok('every row has an activity icon', await ev(`[...document.querySelectorAll('.mem2 .task.ps-act')].every(t => t.querySelector('img.gi'))`));
    const M = await ev(`(() => { const svg = ${cardOf('Tankard')}.querySelector('.pmap svg'), f = ${cardOf('Fundor')}.querySelector('.pmap svg');
      return { lines: svg ? svg.querySelectorAll('path.ps-tline').length : -1, anim: svg ? svg.querySelectorAll('path.ps-tline animate').length : -1, dots: svg ? svg.querySelectorAll('circle animateMotion').length : -1,
        label: svg ? [...svg.querySelectorAll('text')].map(t => t.textContent).filter(t => /→/.test(t)) : [], fund: f ? f.querySelectorAll('path.ps-tline').length : -1 }; })()`);
    ok('party map: a line per trade (shadow + line), animated, direction dot', M.lines === 4 && M.anim === 1 && M.dots === 1, JSON.stringify(M));
    ok('party map: trade labels giver → receiver', M.label.some(t => /Tankard → Healix: Soulshot/.test(t)) && M.label.some(t => /Tankard → Novara.*✓/.test(t)), M.label.join(' | '));
    ok('party map: the fund trade to another team is drawn', M.fund === 2, String(M.fund));
    ok('no horizontal page scroll', !T.hscroll);
    // screenshots: each scenario's card
    const shotCard = async (p, name) => { await ev(`${cardOf(p)}.scrollIntoView({ block: 'start' })`); await sleep(400); if (dev.mobile) await shot(name); else { const r = await ev(`(() => { const b = ${cardOf(p)}.getBoundingClientRect(); return { x: 0, y: b.top + window.scrollY, width: window.innerWidth, height: Math.min(b.height, 1400) }; })()`); await shot(name, Object.assign(r, { scale: 1 })); } };
    if (dev.mobile) {
      await shotCard('Tankard', 'parties_phone_supply_trade.png');
      await ev(`document.querySelector('.mem2[data-char="Tankard"]').scrollIntoView({ block: 'start' })`); await sleep(300); await shot('parties_phone_supply_rows.png');
      await shotCard('Fundor', 'parties_phone_fund.png');
      await shotCard('Rover', 'parties_phone_travel.png');
      await shotCard('Hunter', 'parties_phone_hunting.png');
      await shotCard('Stray', 'parties_phone_regroup_warn.png');
      await shotCard('Oldie', 'parties_phone_old_script.png');
    } else {
      await ev(`window.scrollTo(0, 0)`); await sleep(300); await shot('parties_desktop_top.png');
      await shotCard('Tankard', 'parties_desktop_supply_trade.png');
      await shotCard('Stray', 'parties_desktop_regroup_warn.png');
    }
    // reduced motion: no SMIL animation, no pulsing
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await ev(`(document.getElementById('tab-parties')._last = null, renderParties())`); await sleep(500);
    const RM = await ev(`(() => { const svg = ${cardOf('Tankard')}.querySelector('.pmap svg'); const now = document.querySelector('.psb[data-psb="Tankard"] .psb-bar i.now');
      return { anim: svg.querySelectorAll('animate, animateMotion').length, lines: svg.querySelectorAll('path.ps-tline').length, pulse: now ? getComputedStyle(now).animationName : '?' }; })()`);
    ok('reduced motion: lines stay, no animation', RM.anim === 0 && RM.lines === 4 && RM.pulse === 'none', JSON.stringify(RM));
    if (dev.mobile) await shotCard('Tankard', 'parties_phone_reduced_motion.png');
  }
  ok('no JavaScript errors', jsErr.length === 0, jsErr.slice(0, 3).join(' | '));
  ok('no POST requests were sent', posts.length === 0, posts.join(', '));
  ok('MCP calls: only reads', mcp.every(l => /^MCP (get_account_data|get_accounts_status|get_account_status) /.test(l)), mcp.filter(l => !/get_account_data|get_accounts_status|get_account_status/.test(l)).slice(0, 3).join(' | '));
  clearInterval(fx);
  try { sock.close(); } catch (e) { }
  br.kill(); srv.kill();
  await sleep(500);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { }
  try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  console.log(fails ? `${fails} FAILED` : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
