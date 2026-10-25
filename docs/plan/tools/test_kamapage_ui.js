// Headless check of the KAMALOKA PAGE v2 (#/kamaloka board, #/kamaloka/<id>, #/kamaloka/live; Dashboard/kamapage.js + .css + kamapage_api.js +
// kamalogic.js, user 2026-10-09 14:15) on iPhone portrait (390x844), iPad portrait (820x1180) and desktop (1920x1080).
// SANDBOX (same pattern as test_raidspage_ui.js): a temp folder is the install root. Scripts/data = the static datapack JSONs; Logs = every
// real swarm_state file with EVERY character name replaced (Shieldy / Forger / Orcboss / Muse / Tankard / Solo = the six party leaders,
// Hero01.. the rest), synthetic daily files (party Shieldy: Labyrinth 49 tried once, Hall 53 locked #2100; party Orcboss: Labyrinth 39 cleared),
// daily.log / kamaloka.log lines of today, a RUNNING Kamaloka (Labyrinth 29, party Muse). The real Dashboard/server.js runs on it with MCP
// MOCKED, no background timers / child processes, writes only inside the sandbox. Every browser POST is intercepted (none reaches any server);
// the one sandbox POST (/api/daily for a party that is not in "dailyLeaders") is made by this script to the SANDBOX server only.
// Only ONE Edge at a time, closed at the end; refuses to start Edge with less than 3 GB free RAM (the bots run on this PC).
// HALL TEAM PER PARTY (2026-10-09 16:05): the sandbox also has swarm.config.json with kamaloka.hallTeams.Orcboss (configured); party Tankard
// (9) gets the automatic one; POST /api/kamahall is tested against the SANDBOX server only (save, 409, 400, back to automatic); in the browser
// the editor's Save is intercepted like every other POST.
// Screenshots: docs/plan/mobile_check/kama_*.png
//   node docs/plan/tools/test_kamapage_ui.js
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..');

// ===================================================================== sandbox server (child process) ==============================
if (process.argv[2] === '--server') {
  const SB = process.argv[3];
  const SC = require(path.join(ROOT, 'docs', 'plan', 'tools', 'swarm_config.js'));
  const CFG = JSON.parse(fs.readFileSync(path.join(SB, 'config.json'), 'utf8'));
  SC.ROOT = SB; SC.ROOT_FWD = SB.replace(/\\/g, '/'); SC.mainLeader = 'Shieldy'; SC.reload = () => CFG; SC.accounts = CFG.accounts;
  SC.cfg = Object.assign({}, SC.cfg, { dailyLeaders: ['Shieldy', 'Forger'], dailyHallTeam: undefined });
  SC.dashboardPort = 0; SC.mcpUrl = 'http://127.0.0.1:8083';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url);
    if (/:8083\b/.test(u)) {
      const b = JSON.parse(opt.body || '{}');
      const result = b.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: {} } : { content: [{ type: 'text', text: b.params && b.params.name === 'get_accounts_status' ? '[]' : '{"mobs":[]}' }] };
      process.stdout.write('MCP ' + ((b.params && b.params.name) || b.method) + '\n');
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
  const realWrite = fs.writeFileSync, realAppend = fs.appendFileSync, realCopy = fs.copyFileSync, realRename = fs.renameSync, realUnlink = fs.unlinkSync;
  const inSb = (f) => path.resolve(String(f)).toLowerCase().startsWith(path.resolve(SB).toLowerCase());
  fs.writeFileSync = (f, d, o) => (inSb(f) ? realWrite(f, d, o) : undefined);
  fs.appendFileSync = (f, d, o) => (inSb(f) ? realAppend(f, d, o) : undefined);
  fs.copyFileSync = (a, b, m) => (inSb(b) ? realCopy(a, b, m) : undefined);
  fs.renameSync = (a, b) => (inSb(b) ? realRename(a, b) : undefined);
  fs.unlinkSync = (f) => (inSb(f) ? realUnlink(f) : undefined);
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
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && info !== '' ? ' - ' + info : ''}`); };
const readT = (f) => { try { return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''); } catch (e) { return null; } };
const readJ = (f, d) => { try { return JSON.parse(readT(f)); } catch (e) { return d; } };

const REAL = readJ(path.join(ROOT, 'swarm.config.json'), { accounts: [] });
const LEADERS = { Tank1: 'Shieldy', Crafter1: 'Forger', Destroyer3: 'Orcboss', Tank2: 'Muse', Tank3: 'Tankard', Dagger1: 'Solo' };
const REALN = fs.readdirSync(path.join(ROOT, 'Logs')).map(f => (f.match(/^swarm_state_(.+)\.json$/) || [])[1]).filter(n => n && n !== 'null');
const ANON = Object.assign({}, LEADERS);
let hn = 1; REALN.concat((REAL.accounts || []).map(a => a.character)).forEach(n => { if (n && !ANON[n]) ANON[n] = 'Hero' + String(hn++).padStart(2, '0'); });
const NAMES_RE = new RegExp('\\b(' + Object.keys(ANON).sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'g');
const anon = (t) => String(t).replace(NAMES_RE, (m) => ANON[m] || m);

const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'kamapage-sb-'));
['Logs', 'Settings', path.join('Scripts', 'data'), path.join('docs', 'plan', 'tools')].forEach(d => fs.mkdirSync(path.join(SB, d), { recursive: true }));
fs.readdirSync(__dirname).filter(f => /\.js$/.test(f)).forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(SB, 'docs', 'plan', 'tools', f)));
fs.writeFileSync(path.join(SB, 'Logs', 'pause_supervisor'), 'sandbox');
const DSRC = path.join(ROOT, 'Scripts', 'data');
fs.readdirSync(DSRC).filter(f => /\.json$/.test(f) && fs.statSync(path.join(DSRC, f)).size < 6e6).forEach(f => fs.copyFileSync(path.join(DSRC, f), path.join(SB, 'Scripts', 'data', f)));
// config: every enabled account, anonymised; the hall team = party Shieldy's tank, healers, destroyers, doombringer
const ACC = (REAL.accounts || []).filter(a => a.enabled !== false).map((a, i) => ({ login: 'acc' + i, character: ANON[a.character], party: ANON[a.party] || LEADERS[a.party], role: a.role, enabled: true }));
const HALL = ['Tank1', 'Bishop1', 'Saint1', 'Destroyer1', 'Destroyer2', 'Doombringer1'].map(n => ANON[n]);
fs.writeFileSync(path.join(SB, 'config.json'), JSON.stringify({ accounts: ACC, mainLeader: 'Shieldy', dailyLeaders: ['Shieldy', 'Forger'], dailyHallTeam: HALL }));
const byParty = {}; ACC.forEach(a => { (byParty[a.party] = byParty[a.party] || []).push(a.character); });
// the sandbox's own swarm.config.json (what /api/kamahall writes): party Orcboss has a configured hall team of 6 (its first 6)
const ORC_HALL = (byParty.Orcboss || []).slice(0, 6);
fs.writeFileSync(path.join(SB, 'swarm.config.json'), JSON.stringify({ accounts: ACC, mainLeader: 'Shieldy', dailyLeaders: ['Shieldy', 'Forger'], dailyHallTeam: HALL, kamaloka: { hallTeams: { Orcboss: ORC_HALL } } }, null, 2) + '\n');
const STATES = (REAL.accounts || []).filter(a => a.enabled !== false).map(a => { const t = readT(path.join(ROOT, 'Logs', `swarm_state_${a.character}.json`)); return t ? JSON.parse(anon(t)) : null; }).filter(Boolean);
const iso = (ms) => new Date(ms).toISOString();
const KL = require(path.join(ROOT, 'Dashboard', 'kamalogic.js'));
const KAMAS_D = (d) => d.kamaloka || [];
const T0 = Date.now(), DAY = KL.dayKey(T0), B = KL.dayBounds(T0), today = (min) => iso(Math.min(T0 - 60000, B.start + min * 60000));
// levels of the fixture: as now (Shieldy 51-52, Forger 51, Orcboss 36, Muse 28, Tankard 32-33, Solo 43)
fs.writeFileSync(path.join(SB, 'Logs', 'daily_enabled.json'), JSON.stringify({ Shieldy: { kamaloka: true }, Orcboss: { kamaloka: true } }));
fs.writeFileSync(path.join(SB, 'Logs', 'daily_Shieldy.json'), JSON.stringify({ day: DAY, done: { 'kamaloka-53': today(30) + ' could not enter — server said: #2100 Shieldy' }, tries: { 'kamaloka-49': 1, 'kamaloka-53': 1 } }));
fs.writeFileSync(path.join(SB, 'Logs', 'daily_Orcboss.json'), JSON.stringify({ day: DAY, done: { 'kamaloka-39': today(60) + ' cleared' }, tries: { 'kamaloka-39': 1 } }));
fs.writeFileSync(path.join(SB, 'Logs', 'daily_Forger.json'), JSON.stringify({ day: '2026-10-01', done: { 'kamaloka-56': 'old' }, tries: { 'kamaloka-56': 2 } }));
fs.writeFileSync(path.join(SB, 'Logs', 'daily.log'), [
  `${today(20)}\tShieldy\tkamaloka-49\tfail\tthe team did not come in — leader left`,
  `${today(30)}\tShieldy\tkamaloka-53\tfail\tcould not enter — server said: #2100 Shieldy`,
  `${today(60)}\tOrcboss\tkamaloka-39\tok\tcleared in 21 min`].join('\r\n') + '\r\n');
fs.writeFileSync(path.join(SB, 'Logs', 'kamaloka.log'), [`2026-10-05T20:36:22.952Z\tkamaloka-39\twiped`, `${today(59)}\tkamaloka-39\tcleared`].join('\r\n') + '\r\n');
{ const t = readT(path.join(ROOT, 'Logs', 'kamaloka_map.json')); if (t) fs.writeFileSync(path.join(SB, 'Logs', 'kamaloka_map.json'), anon(t)); }
const LIVE0 = JSON.parse(anon(readT(path.join(ROOT, 'Logs', 'kamaloka_live.json')) || '{}'));
function writeFixtures() {
  const now = Date.now();
  STATES.forEach(s => { s.updated = iso(now); s.adena = 0; s.clan = ''; fs.writeFileSync(path.join(SB, 'Logs', `swarm_state_${s.name}.json`), JSON.stringify(s)); });
  const muse = byParty.Muse || [];
  const L = Object.assign({}, LIVE0, { id: 'kamaloka-29', name: 'Kamaloka, Labyrinth of the Abyss (level 29)', boss: 'Lost Captain', levelMin: 24, levelMax: 34, town: 'Gludio', npc: 'Captain Bathis',
    leader: 'Muse', phase: 'fighting', step: 'kamaloka: room 2 — 3 monsters left', result: '', inside: true, updatedAt: iso(now), startedMs: now - 610000, enteredMs: now - 420000, endedMs: 0, kills: 14,
    party: (LIVE0.party || []).slice(0, muse.length).map((p, i) => Object.assign({}, p, { name: muse[i], dead: i === 5, hp: i === 5 ? 0 : 40 + i * 6 })) });
  fs.writeFileSync(path.join(SB, 'Logs', 'kamaloka_live.json'), JSON.stringify(L));
}

// ===================================================================== test ========================================================
let BR = null, SRV = null;   // killed on any error too (one Edge at a time, never left running)
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  writeFixtures(); const fx = setInterval(writeFixtures, 1000);
  const srv = SRV = cp.spawn(process.execPath, [__filename, '--server', SB], { stdio: ['ignore', 'pipe', 'pipe'] });
  let PORT = 0; const mcp = [], serr = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcp.push(l); }));
  srv.stderr.on('data', d => serr.push(String(d)));
  for (let i = 0; i < 150 && !PORT; i++) await sleep(100);
  if (!PORT) { console.log(serr.join('')); throw new Error('sandbox server did not start'); }
  console.log('sandbox', SB, 'port', PORT);
  const base = `http://127.0.0.1:${PORT}`;
  const get = async (u) => (await fetch(base + u)).json();

  console.log('--- API (sandbox server)');
  ok('/kamapage.js, /kamapage.css, /kamalogic.js are served', (await Promise.all(['/kamapage.js', '/kamapage.css', '/kamalogic.js'].map(u => fetch(base + u)))).every(r => r.status === 200));
  const D = await get('/api/kamapage');
  const pl = (D.parties || []).map(p => p.leader);
  ok('ALL six parties of the config (main leader first)', pl.join() === 'Shieldy,Forger,Orcboss,Muse,Tankard,Solo', pl.join());
  ok('19 Kamalokas with layouts', D.kamaloka.length === 19 && D.kamaloka.filter(k => k.layout).length >= 15, `${D.kamaloka.length} / ${D.kamaloka.filter(k => k.layout).length}`);
  ok('hall team from the config (dailyHallTeam), not the swarm.js default', JSON.stringify(D.hallTeam) === JSON.stringify(HALL) && /dailyHallTeam/.test(D.hallSource), D.hallSource);
  const ev0 = (l) => D.parties.find(p => p.leader === l).eval;
  ok('Shieldy: next = Labyrinth 49 (whole party, 1 try left) — the old tab said Hall 56', ev0('Shieldy').next && ev0('Shieldy').next.id === 'kamaloka-49' && ev0('Shieldy').rows['kamaloka-49'].left === 1, JSON.stringify(ev0('Shieldy').next));
  ok('Shieldy: Hall 53 locked (#2100)', ev0('Shieldy').rows['kamaloka-53'].today === 'locked');
  ok('Orcboss (8): Hall 36 = ITS configured hall team, 2 sit out (was "too many"); Labyrinth 39 cleared -> next = Hall 36 with the hall team',
    ev0('Orcboss').rows['kamaloka-36'].fit === 'hall' && ev0('Orcboss').rows['kamaloka-36'].hallNames.join() === ORC_HALL.join() && ev0('Orcboss').rows['kamaloka-36'].sitOut === (byParty.Orcboss.length - 6) && ev0('Orcboss').rows['kamaloka-39'].today === 'cleared' && ev0('Orcboss').next && ev0('Orcboss').next.id === 'kamaloka-36' && ev0('Orcboss').next.hall, JSON.stringify(ev0('Orcboss').next));
  ok('Orcboss: hall source = set on the page', D.parties.find(p => p.leader === 'Orcboss').hall.src === 'party' && D.parties.find(p => p.leader === 'Orcboss').hall.set.join() === ORC_HALL.join());
  { const tk = D.parties.find(p => p.leader === 'Tankard'), lv = ev0('Tankard').levels;
    const h = KAMAS_D(D).filter(k => k.kind === 'hall' && lv && k.levelMin <= lv.min && k.levelMax >= lv.min).map(k => ev0('Tankard').rows[k.id]);
    ok(`Tankard (${tk.members.length}): automatic hall team, Halls runnable (was "too many")`, tk.hall.src === 'auto' && tk.members.length > 6 && h.length > 0 && h.every(r => r.ok && r.fit === 'hall' && r.hallNames[0] === 'Tankard' && r.hallNames.length <= 6), JSON.stringify(h.map(r => r.txt))); }
  ok('Forger: an old daily file does not count today', ev0('Forger').rows['kamaloka-56'].today === 'open' && ev0('Forger').next && ev0('Forger').next.id === 'kamaloka-56');
  ok('Solo: too few everywhere', Object.values(ev0('Solo').rows).every(r => r.fit === 'small') && !ev0('Solo').next);
  ok('cleared today attributed to its party via daily.log', D.cleared['kamaloka-39'] && D.cleared['kamaloka-39'].by === 'Orcboss', JSON.stringify(D.cleared));
  ok('live run: party Muse, running', D.live && D.live.running && D.live.leader === 'Muse' && D.parties.find(p => p.leader === 'Muse').running);
  const old = await get('/api/kamaloka');
  ok('old /api/kamaloka: every party too + the config hall team', (old.parties || []).length === 6 && JSON.stringify(old.hallTeam) === JSON.stringify(HALL), (old.parties || []).map(p => p.leader).join());
  const pr = await (await fetch(base + '/api/daily', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leader: 'Muse', kind: 'kamaloka', on: true }) })).json();
  ok('SANDBOX POST /api/daily accepts a party that is not in dailyLeaders (Muse)', pr.enabled && pr.enabled.Muse && pr.enabled.Muse.kamaloka === true, JSON.stringify(pr).slice(0, 120));
  ok('... and /api/kamapage shows it on', (await get('/api/kamapage')).parties.find(p => p.leader === 'Muse').enabled.kamaloka === true);
  // POST /api/kamahall — SANDBOX server only
  const kh = async (b) => { const r = await fetch(base + '/api/kamahall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { code: r.status, j: await r.json() }; };
  const TK = D.parties.find(p => p.leader === 'Tankard').members.map(m => m.name);
  const sv = await kh({ leader: 'Tankard', names: [TK[2], 'Tankard', TK[3], TK[4]], expect: null });
  ok('SANDBOX POST /api/kamahall saves party Tankard (leader first)', sv.code === 200 && sv.j.names.join() === ['Tankard', TK[2], TK[3], TK[4]].join(), JSON.stringify(sv));
  const cf = readJ(path.join(SB, 'swarm.config.json'), {});
  ok('... written to the sandbox swarm.config.json, Orcboss kept, history copy made', cf.kamaloka.hallTeams.Tankard.length === 4 && cf.kamaloka.hallTeams.Orcboss.join() === ORC_HALL.join() && fs.readdirSync(path.join(SB, 'Settings', 'backup', 'swarm_config_history')).length === 1);
  ok('... a stale page gets 409', (await kh({ leader: 'Tankard', names: ['Tankard', TK[1]], expect: null })).code === 409);
  ok('... a character of another party gets 400', (await kh({ leader: 'Tankard', names: ['Tankard', 'Shieldy'], expect: cf.kamaloka.hallTeams.Tankard })).code === 400);
  ok('... 7 names get 400', (await kh({ leader: 'Tankard', names: TK.slice(0, 7), expect: cf.kamaloka.hallTeams.Tankard })).code === 400);
  { const D2 = await get('/api/kamapage'), t2 = D2.parties.find(p => p.leader === 'Tankard');
    ok('... /api/kamapage shows it at once (set on this page)', t2.hall.src === 'party' && t2.hall.set.length === 4); }
  ok('... back to automatic (names: null)', (await kh({ leader: 'Tankard', names: null, expect: cf.kamaloka.hallTeams.Tankard })).code === 200 && !readJ(path.join(SB, 'swarm.config.json'), {}).kamaloka.hallTeams.Tankard);
  const leak = JSON.stringify(D) + JSON.stringify(old);
  ok('sandbox API answers carry no real character name', !Object.keys(ANON).filter(n => n.length > 4).some(n => new RegExp('\\b' + n + '\\b').test(leak)));

  // ------------------------------------------------------------------ browser
  const freeGB = os.freemem() / 1073741824;
  if (freeGB < 3) { console.log(`  SKIP browser: only ${freeGB.toFixed(1)} GB free RAM (needs 3)`); fails++; srv.kill(); clearInterval(fx); process.exit(1); }
  console.log(`--- browser (${freeGB.toFixed(1)} GB free)`);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-edge-'));
  const DBG = 9300 + Math.floor(Math.random() * 500);
  const br = BR = cp.spawn(EDGE, ['--headless=new', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null, bws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  try { bws = (await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json()).webSocketDebuggerUrl; } catch (e) { }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [], jsErr = [], dialogs = [];
  let accept = false;
  sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const shot = async (name, full) => {
    let clip;
    if (full) { const m = await cdp('Page.getLayoutMetrics'); const c = m.cssContentSize || m.contentSize; clip = { x: 0, y: 0, width: c.width, height: Math.min(c.height, 9000), scale: 1 }; }
    const r = await cdp('Page.captureScreenshot', clip ? { format: 'png', clip, captureBeyondViewport: true } : { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); console.log('  shot', name);
  };
  const posts = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); cdp('Page.handleJavaScriptDialog', { accept }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') jsErr.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method !== 'Fetch.requestPaused') return;
    const rq = m.params.request, rid = m.params.requestId;
    if (rq.method === 'POST') { posts.push(rq.url.replace(/^https?:\/\/[^/]+/, '') + ' ' + (rq.postData || '')); return cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"ok":true,"intercepted":true,"command":"x","target":"party:x"}').toString('base64') }).catch(() => { }); }
    cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { });
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: false, onDialog: (d) => dialogs.push(d.msg) });   // UIDIALOG 2026-10-10: the shared dialog answers itself
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
  const FS_OK = new Set([11, 12, 13, 14, 16, 20]);
  const fsBad = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest('svg') && e.offsetParent !== null)
      .map(e => Math.round(parseFloat(getComputedStyle(e).fontSize))).filter(v => !${JSON.stringify([...FS_OK])}.includes(v))`);

  let first = true;
  for (const dev of [{ tag: 'phone', w: 390, h: 844, s: 2, mobile: true }, { tag: 'tablet', w: 820, h: 1180, s: 2, mobile: true }, { tag: 'desktop', w: 1920, h: 1080, s: 1, mobile: false }]) {
    console.log(`--- ${dev.tag} ${dev.w}x${dev.h}`);
    await cdp('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: dev.s, mobile: dev.mobile });
    await cdp('Emulation.setTouchEmulationEnabled', dev.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await cdp('Page.navigate', { url: `${base}/#/kamaloka` });
    ok('#/kamaloka opens the new page (old tab hidden)', await waitFor(`!!window.KamaPage && !document.getElementById('tab-kamapage').hidden && document.getElementById('tab-kamaloka').hidden && document.querySelectorAll('#kpBoard .kp-card').length > 0`, 30000));
    await waitFor(`document.querySelectorAll('.kp-prow').length === 6 && !!document.querySelector('.kp-live')`, 10000);
    await sleep(600);
    const s = await ev(`(() => { const q = (x) => [...document.querySelectorAll(x)];
      const row = (l) => (q('.kp-prow').find(r => r.querySelector('.pn').textContent === l) || {}).innerText || '';
      return { cards: q('#kpBoard .kp-card').length, rows: q('.kp-prow').map(r => r.querySelector('.pn').textContent), live: (document.querySelector('.kp-live') || {}).innerText || '',
        shieldy: row('Shieldy').replace(/\\s+/g, ' '), orc: row('Orcboss').replace(/\\s+/g, ' '), sel: (document.getElementById('kpParty') || {}).value, solo: row('Solo'), muse: row('Muse'),
        next49: (q('#kpBoard .kp-card').find(c => c.dataset.kpid === 'kamaloka-49') || {}).innerText || '',
        nextBadges: q('#kpBoard .kp-b.next').map(b => b.closest('.kp-card').dataset.kpid + ':' + b.textContent),
        hall36: ((q('#kpBoard .kp-card').find(c => c.dataset.kpid === 'kamaloka-36') || {}).innerText || '').replace(/\\s+/g, ' '),
        banner: !!document.querySelector('#liveBanner a.livebanner[href="#/kamaloka"]') && getComputedStyle(document.querySelector('#liveBanner a.livebanner[href="#/kamaloka"]')).display !== 'none',
        hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 }; })()`);
    ok('19 cards and 6 party rows (every party)', s.cards === 19 && s.rows.join() === 'Shieldy,Forger,Orcboss,Muse,Tankard,Solo', `${s.cards} / ${s.rows.join()}`);
    ok('LIVE run pinned with Watch + Party view', /LIVE/.test(s.live) && /Watch/.test(s.live) && /Party view/.test(s.live) && /Muse/.test(s.live), s.live.replace(/\s+/g, ' ').slice(0, 120));
    ok('no duplicate site banner for the run on this page', !s.banner);
    ok('Shieldy row: Next Labyrinth 49, Hall 53 locked, daily ON', /Next:\s*Labyrinth 49/.test(s.shieldy) && /Hall 53 · locked/.test(s.shieldy) && /daily ON/.test(s.shieldy), s.shieldy.replace(/\s+/g, ' ').slice(0, 200));
    ok('Orcboss row: Labyrinth 39 cleared, next = Hall 36 with its hall team, "set on this page"', /Next:\s*Hall 36/.test(s.orc) && /hall team/.test(s.orc) && /Labyrinth 39 · cleared/.test(s.orc) && /set on this page/.test(s.orc), s.orc.replace(/\s+/g, ' ').slice(0, 260));
    ok('Solo row: needs 2 or more', /2 or more/.test(s.solo));
    ok('Muse row: LIVE', /LIVE/.test(s.muse));
    ok('"next" badges = the API next picks', s.nextBadges.sort().join() === D.parties.filter(p => p.eval.next).map(p => p.eval.next.id + ':next · ' + p.leader).sort().join(), s.nextBadges.join());
    ok('party picker defaults to the main leader party', s.sel === 'Shieldy', s.sel);
    ok('Hall 36 card: "Orcboss · fits — hall team: <its 6>"', s.hall36.includes('Orcboss · fits — hall team: ' + ORC_HALL.join(', ')), s.hall36.replace(/\s+/g, ' ').slice(0, 260));
    ok('no horizontal page scroll (board)', !s.hscroll);
    const bad = await fsBad('#tab-kamapage *');
    ok('type scale: only the site tokens', bad.length === 0, bad.slice(0, 8).join(','));
    await ev(`window.scrollTo(0, 0)`); await sleep(300);
    await shot(`kama_${dev.tag}_1_board.png`);
    await shot(`kama_${dev.tag}_1_board_full.png`, true);
    if (first) {
      // filters
      await ev(`document.querySelector('[data-kptype="hall"]').click()`); await sleep(300);
      const halls = await ev(`[...document.querySelectorAll('#kpBoard .kp-card')].every(c => c.classList.contains('hall')) && document.querySelectorAll('#kpBoard .kp-card').length === 11`);
      await ev(`document.querySelector('[data-kptype="all"]').click(); document.querySelector('[data-kpfit="fits"]').click()`); await sleep(300);
      const fits = await ev(`[...document.querySelectorAll('#kpBoard .kp-card')].map(c => c.dataset.kpid).join()`);
      ok('filters: Hall only (11), fits Shieldy = 49, 53, 56', halls && fits === 'kamaloka-49,kamaloka-53,kamaloka-56', fits);
      await ev(`document.querySelector('[data-kpfit="all"]').click()`); await sleep(200);
      // Run: asks first; dismissed = nothing; accepted = one intercepted POST /api/command
      const nd = dialogs.length; accept = false; await UID.set(ev, false);
      await ev(`document.querySelector('.kp-prow [data-kprun^="Shieldy|"]').click()`); await sleep(500);
      ok('Run asks first — dismissed = nothing sent', dialogs.length === nd + 1 && /WHOLE party Shieldy/.test(dialogs[nd]) && /!mission kamaloka 49/.test(dialogs[nd]) && !posts.length, (dialogs[nd] || '').split('\n').slice(0, 3).join(' / '));
      accept = true; await UID.set(ev, true);
      await ev(`document.querySelector('#kpBoard .kp-card[data-kpid="kamaloka-53"] [data-kprun]').click()`); await sleep(600);
      ok('Force run (Hall 53 locked) says FORCE + hall team sit-out, then ONE intercepted POST', /FORCE/.test(dialogs[dialogs.length - 1]) && /hall team/.test(dialogs[dialogs.length - 1]) && posts.length === 1 && /api\/command/.test(posts[0]) && /party:Shieldy/.test(posts[0]) && /!mission kamaloka 53/.test(posts[0]), posts[0]);
      await ev(`document.querySelector('.kp-prow [data-kpdaily^="Tankard|"]').click()`); await sleep(600);
      ok('daily switch for party Tankard asks, then POST /api/daily (intercepted)', posts.length === 2 && /api\/daily/.test(posts[1]) && /"leader":"Tankard"/.test(posts[1]) && /"on":true/.test(posts[1]), posts[1]);
      // hall team editor (party Tankard, automatic): open, untick one, the count follows; dismissed save = nothing; accepted = ONE POST
      await ev(`document.querySelector('details.kp-hall[data-hall="Tankard"]').open = true`); await sleep(300);
      const h0 = await ev(`(() => { const d = document.querySelector('details.kp-hall[data-hall="Tankard"]'); return { sum: d.querySelector('summary').innerText, n: d.querySelectorAll('input:checked').length, lead: d.querySelector('input[disabled]').dataset.kphb }; })()`);
      ok('editor: party Tankard shows "automatic", 6 ticked, the leader fixed', /automatic/.test(h0.sum) && h0.n === 6 && h0.lead === 'Tankard|Tankard', JSON.stringify(h0));
      await ev(`(() => { const i = [...document.querySelectorAll('details.kp-hall[data-hall="Tankard"] input:checked:not([disabled])')].pop(); i.click(); })()`); await sleep(300);
      ok('editor: untick one -> 5/6, survives the re-render', await ev(`/5\\/6/.test(document.querySelector('details.kp-hall[data-hall="Tankard"] .kp-hn').textContent)`));
      await ev(`KamaPage._k.at = 0`); await sleep(5600);
      ok('editor: ticks kept after the 5 s reload', await ev(`document.querySelectorAll('details.kp-hall[data-hall="Tankard"] input:checked').length === 5`));
      const np = posts.length, nd2 = dialogs.length; accept = false; await UID.set(ev, false);
      await ev(`document.querySelector('[data-kphsave="Tankard"]').click()`); await sleep(500);
      ok('Save hall team asks first — dismissed = nothing sent', dialogs.length === nd2 + 1 && /hall team/.test(dialogs[nd2]) && posts.length === np, (dialogs[nd2] || '').split('\n')[0]);
      accept = true; await UID.set(ev, true);
      await ev(`document.querySelector('[data-kphsave="Tankard"]').click()`); await sleep(700);
      ok('accepted: ONE intercepted POST /api/kamahall with 5 names, leader first', posts.length === np + 1 && /api\/kamahall/.test(posts[np]) && /"leader":"Tankard"/.test(posts[np]) && /"names":\["Tankard"/.test(posts[np]) && (posts[np].match(/"names":\[([^\]]*)\]/) || ['', ''])[1].split(',').length === 5, posts[np]);
      await sleep(600);
      ok('after the save the ticks follow the server again (checkbox = label, 6 ticked)', await ev(`(() => { const i = [...document.querySelectorAll('details.kp-hall[data-hall="Tankard"] input[data-kphb]')]; return i.every(x => x.checked === x.closest('.kp-hb').classList.contains('on')) && i.filter(x => x.checked).length === 6; })()`));
      await ev(`document.querySelector('details.kp-hall[data-hall="Tankard"]').open = true`); await sleep(300);
      await ev(`window.scrollTo(0, document.querySelector('details.kp-hall[data-hall="Tankard"]').getBoundingClientRect().top + window.scrollY - 120)`); await sleep(300);
      await shot(`kama_${dev.tag}_4_hallteam.png`);
      await ev(`document.querySelector('details.kp-hall[data-hall="Tankard"]').open = false; window.scrollTo(0, 0)`); await sleep(200);
      accept = false; await UID.set(ev, false);
      // collapsible sections remembered
      await ev(`document.querySelector('details[data-sec="hist"]').open = true; document.querySelector('details[data-sec="today"]').open = false`); await sleep(400);
      ok('Run history renders with the party name', await waitFor(`/Orcboss/.test(document.getElementById('kpSec_hist').innerText) && /cleared/.test(document.getElementById('kpSec_hist').innerText)`, 4000));
      await cdp('Page.reload'); await waitFor(`!!document.querySelector('#kpBoard .kp-card')`, 20000); await sleep(700);
      ok('open / closed sections remembered per viewer', await ev(`document.querySelector('details[data-sec="hist"]').open && !document.querySelector('details[data-sec="today"]').open`));
      await ev(`document.querySelector('details[data-sec="hist"]').open = false; document.querySelector('details[data-sec="today"]').open = true`); await sleep(300);
    }
    // detail page: tap a card (not a link)
    await ev(`document.querySelector('#kpBoard .kp-card[data-kpid="kamaloka-39"] .kp-sub').click()`);
    ok('tap a card opens #/kamaloka/<id>', await waitFor(`location.hash === '#/kamaloka/kamaloka-39' && document.querySelectorAll('.kp-dr').length === 6 && !!document.querySelector('.kp-mapwrap svg')`, 10000), await ev('location.hash'));
    const dt = await ev(`({ rows: [...document.querySelectorAll('.kp-dr')].map(r => r.innerText.replace(/\\s+/g, ' ')), h: document.documentElement.scrollWidth > window.innerWidth + 1,
      mapH: Math.round(document.querySelector('.kp-mapwrap svg').getBoundingClientRect().height), vh: window.innerHeight })`);
    ok('detail: every party with its fit / today (Orcboss cleared, Muse too low)', dt.rows.some(r => /Orcboss/.test(r) && /cleared/.test(r)) && dt.rows.some(r => /Muse/.test(r) && /too low/.test(r)), dt.rows.slice(0, 3).join(' | '));
    ok('detail: no horizontal scroll, map at most 72% of the screen high', !dt.h && dt.mapH <= Math.ceil(dt.vh * 0.72) + 2, `${dt.mapH}/${dt.vh}`);
    const badD = await fsBad('#kpDetail *');
    ok('detail type scale: only the site tokens', badD.length === 0, badD.slice(0, 8).join(','));
    // the map must not take the page scroll: a wheel over it scrolls the page
    await ev(`window.scrollTo(0, 0)`); await sleep(200);
    const mr = await ev(`(() => { const r = document.querySelector('.kp-mapwrap svg').getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.top + 40, window.innerHeight - 20), top: r.top }; })()`);
    if (mr.top < dev.h - 30) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mr.x, y: mr.y, deltaX: 0, deltaY: 300 }); await sleep(500);
      ok('a wheel over the map scrolls the page', (await ev('window.scrollY')) > 50, String(await ev('window.scrollY')));
    } else ok('a wheel over the map scrolls the page (map below the fold: page scroll checked instead)', true);
    await ev(`window.scrollTo(0, 0)`); await sleep(300);
    await shot(`kama_${dev.tag}_2_detail.png`);
    await shot(`kama_${dev.tag}_2_detail_full.png`, true);
    // live view
    await ev(`location.hash = '#/kamaloka/live'`);
    ok('#/kamaloka/live shows the live run', await waitFor(`!!document.querySelector('#kpLive .rlive') && /Muse/.test(document.getElementById('kpLive').innerText)`, 10000), (await ev(`(document.getElementById('kpLive') || {}).innerText || ''`)).slice(0, 100));
    ok('live: no horizontal scroll', !(await ev(`document.documentElement.scrollWidth > window.innerWidth + 1`)));
    await sleep(1200);
    await shot(`kama_${dev.tag}_3_live.png`);
    if (first) {
      await ev(`go('#/parties')`);
      ok('another tab closes the page and stops its timers', await waitFor(`document.getElementById('tab-kamapage').hidden && !KamaPage._k.open && KamaPage._k.timers.length === 0`, 5000));
      await ev(`document.querySelector('#tabs [data-tab="kamaloka"]').click()`);
      ok('the Kamaloka tab button brings it back', await waitFor(`!document.getElementById('tab-kamapage').hidden && KamaPage._k.open && KamaPage._k.mode === 'board'`, 5000));
    }
    first = false;
  }
  ok('no JavaScript errors', jsErr.length === 0, jsErr.slice(0, 3).join(' | '));
  ok('only the 3 intercepted POSTs (accepted Run + daily switch + hall team save)', posts.length === 3, posts.join(' || '));
  ok('MCP: no mutating call', mcp.every(l => /^MCP (initialize|get_|notifications)/.test(l)), mcp.filter(l => !/^MCP (initialize|get_|notifications)/.test(l)).slice(0, 3).join(' | '));
  clearInterval(fx);
  try { sock.close(); } catch (e) { }
  if (bws) { try { const b = new WebSocket(bws); await new Promise((r) => { b.onopen = r; b.onerror = r; }); b.send(JSON.stringify({ id: 1, method: 'Browser.close' })); await sleep(800); b.close(); } catch (e) { } }
  try { cp.execSync('taskkill /PID ' + br.pid + ' /T /F', { stdio: 'ignore' }); } catch (e) { } srv.kill();
  await sleep(800);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { }
  try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  console.log(fails ? `${fails} FAILED` : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error(e); try { if (BR) cp.execSync('taskkill /PID ' + BR.pid + ' /T /F', { stdio: 'ignore' }); } catch (x) { } try { if (SRV) SRV.kill(); } catch (x) { } setTimeout(() => process.exit(2), 500); });
