// Headless check of the RAIDS PAGE v2 (#/raids board + #/raid/<id> boss page, Dashboard/raidspage.js + .css, user 2026-10-09 11:05) on
// iPhone portrait (390x844), iPad portrait (820x1180) and desktop (1920x1080).
// SANDBOX: a temp folder is the install root: Scripts/data (the static datapack JSONs + the saved raid routes, character names anonymised,
// one synthetic learned route with 'by'), Logs (raid status / seen / respawn / loot logs, reports, raidhunt + raid_live, two parties' state
// files) — every real character name replaced (Hero01.. / Tankard / Shieldy). server.js runs from the real Dashboard folder (so the real
// index.html / raidspage.* are tested) with MCP MOCKED (nothing reaches L2Swarm / the game), no background timers / child processes, POSTs
// intercepted in the browser (none reaches the sandbox either). Real Logs / data are only READ.
// Screenshots: docs/plan/mobile_check/raidspage_*.png
//   node docs/plan/tools/test_raidspage_ui.js            (test)
//   node docs/plan/tools/test_raidspage_ui.js --server <sandbox>   (internal: the sandbox server)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..');

// ===================================================================== sandbox server (child process) ==============================
if (process.argv[2] === '--server') {
  const SB = process.argv[3];
  const SC = require(path.join(ROOT, 'docs', 'plan', 'tools', 'swarm_config.js'));
  const ACC = JSON.parse(fs.readFileSync(path.join(SB, 'accounts.json'), 'utf8'));
  SC.ROOT = SB; SC.ROOT_FWD = SB.replace(/\\/g, '/'); SC.mainLeader = 'Shieldy'; SC.reload = () => ({ accounts: ACC }); SC.accounts = ACC;
  SC.dashboardPort = 0; SC.mcpUrl = 'http://127.0.0.1:8083';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url);
    if (/:8083\b/.test(u)) {
      const b = JSON.parse(opt.body || '{}');
      const result = b.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: {} } : { content: [{ type: 'text', text: b.params && b.params.name === 'get_accounts_status' ? '[]' : '{"mobs":[]}' }] };
      process.stdout.write('MCP ' + (b.params ? b.params.name : b.method) + '\n');
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
  fs.writeFileSync = (f, d, o) => (inSb(f) ? realWrite(f, d, o) : undefined);     // the sandbox writes only inside the sandbox
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
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
const readT = (f) => { try { return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''); } catch (e) { return null; } };
const readJ = (f, d) => { try { return JSON.parse(readT(f)); } catch (e) { return d; } };

// every real character name -> an anonymous one (whole words); the two parties of the sandbox keep their levels / classes / roles
const REALN = fs.readdirSync(path.join(ROOT, 'Logs')).map(f => (f.match(/^swarm_state_(.+)\.json$/) || [])[1]).filter(n => n && n !== 'null');
const PARTY_A = ['Tank3', 'Destroyer9', 'Nuker11', 'Nuker7', 'Bishop4', 'Chanter4', 'Nuker9', 'Nuker8', 'Nuker10'];
const PARTY_B = ['Tank1', 'Bishop1', 'Destroyer1', 'Destroyer2', 'Doombringer1', 'Necro1', 'Inspector1', 'Chanter1', 'Saint1'];
const ANON = { Tank3: 'Tankard', Tank1: 'Shieldy' };
let k = 1; REALN.concat(PARTY_A, PARTY_B).forEach(n => { if (!ANON[n]) ANON[n] = 'Hero' + String(k++).padStart(2, '0'); });
const NAMES_RE = new RegExp('\\b(' + Object.keys(ANON).sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'g');
const anon = (t) => String(t).replace(NAMES_RE, (m) => ANON[m] || m);

const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'raidspage-sb-'));
['Logs', path.join('Logs', 'raid_reports'), 'Settings', path.join('Scripts', 'data', 'routes', 'raid', 'history'), path.join('docs', 'plan', 'tools')].forEach(d => fs.mkdirSync(path.join(SB, d), { recursive: true }));
fs.writeFileSync(path.join(SB, 'docs', 'plan', 'README.md'), '# sandbox\n');
fs.readdirSync(__dirname).filter(f => /\.js$/.test(f)).forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(SB, 'docs', 'plan', 'tools', f)));
fs.writeFileSync(path.join(SB, 'Logs', 'pause_supervisor'), 'sandbox');
// static datapack JSONs (no personal data)
const DSRC = path.join(ROOT, 'Scripts', 'data');
fs.readdirSync(DSRC).filter(f => /\.json$/.test(f) && fs.statSync(path.join(DSRC, f)).size < 6e6).forEach(f => fs.copyFileSync(path.join(DSRC, f), path.join(SB, 'Scripts', 'data', f)));
// saved raid routes, anonymised; + one synthetic LEARNED route (recorded by a party, used twice) and one failing
const RSRC = path.join(DSRC, 'routes', 'raid');
fs.readdirSync(RSRC).filter(f => /^\d+\.json$/.test(f)).forEach(f => fs.writeFileSync(path.join(SB, 'Scripts', 'data', 'routes', 'raid', f), anon(readT(path.join(RSRC, f)))));
const BOSSES = (readJ(path.join(DSRC, 'raidbosses_h5.json'), { bosses: [] }).bosses || []);
const RENOA = BOSSES.find(b => b.name === 'Elf Renoa'), TUREK = BOSSES.find(b => b.name === 'Turek Mercenary Captain');
const T0 = Date.now(), iso = (ms) => new Date(ms).toISOString();
fs.writeFileSync(path.join(SB, 'Scripts', 'data', 'routes', 'raid', RENOA.id + '.json'), JSON.stringify({ boss: RENOA.name, id: RENOA.id, landing: 'Gludin -> Red Rock Ridge', length: 4480,
  points: [[-42256, 198333], [-41500, 198300], [-40600, 198200], [-39800, 198000], [-38900, 198100], [-38100, 198150]].map(p => ({ x: p[0], y: p[1], z: -2700 })), savedAt: iso(T0 - 5 * 3600e3),
  uses: 2, lastOk: iso(T0 - 3600e3), fails: 1, lastFail: iso(T0 - 600e3), lastFailBy: 'Tankard', by: 'Tankard', lastBy: 'Shieldy' }));
// one fight area (the 'area' badge)
fs.writeFileSync(path.join(SB, 'Scripts', 'data', 'raid_areas.json'), JSON.stringify({ about: 'sandbox', areas: { [RENOA.id]: { id: RENOA.id, boss: RENOA.name,
  fight: [[RENOA.x - 600, RENOA.y - 600], [RENOA.x + 600, RENOA.y - 600], [RENOA.x + 600, RENOA.y + 600], [RENOA.x - 600, RENOA.y + 600]], clear: null, stage: null, enabled: true, updated: iso(T0 - 3600e3) } } }));
// raid logs (boss names are game data; character names anonymised)
['raid_status.json', 'raid_seen.log', 'raid_respawn.log', 'raid_loot.log', 'raid_heals.log', 'daily_enabled.json', 'daily.log', 'kamaloka.log'].forEach(f => { const t = readT(path.join(ROOT, 'Logs', f)); if (t !== null) fs.writeFileSync(path.join(SB, 'Logs', f), anon(t)); });
fs.readdirSync(path.join(ROOT, 'Logs', 'raid_reports')).filter(f => /\.json$/.test(f)).slice(-12).forEach(f => fs.writeFileSync(path.join(SB, 'Logs', 'raid_reports', anon(f)), anon(readT(path.join(ROOT, 'Logs', 'raid_reports', f)))));
// make sure the board shows every status: Turek dead (killed by us 2 h ago: respawn countdown), Renoa in its respawn window
{ const st = readJ(path.join(SB, 'Logs', 'raid_status.json'), {}) || {};
  st[String(TUREK.id)] = { name: TUREK.name, alive: false, at: iso(T0 - 2 * 3600e3), killedAt: iso(T0 - 2 * 3600e3), src: 'killed by us' };
  st[String(RENOA.id)] = { name: RENOA.name, alive: false, at: iso(T0 - 20 * 3600e3), killedAt: iso(T0 - 20 * 3600e3), src: 'killed by us' };
  fs.writeFileSync(path.join(SB, 'Logs', 'raid_status.json'), JSON.stringify(st)); }
// accounts: party Tankard (from party Tank3) + party Shieldy (from party Tank1)
const ACC = [];
PARTY_A.forEach((n, i) => ACC.push({ login: 'sa' + i, character: ANON[n], party: 'Tankard' }));
PARTY_B.forEach((n, i) => ACC.push({ login: 'sb' + i, character: ANON[n], party: 'Shieldy' }));
fs.writeFileSync(path.join(SB, 'accounts.json'), JSON.stringify(ACC));
const STATES = PARTY_A.concat(PARTY_B).map(n => { const t = readT(path.join(ROOT, 'Logs', `swarm_state_${n}.json`)); return t ? JSON.parse(anon(t)) : null; }).filter(Boolean);
const HUNT = JSON.parse(anon(readT(path.join(ROOT, 'Logs', 'raidhunt.json')) || '{}'));
const LIVE = JSON.parse(anon(readT(path.join(ROOT, 'Logs', 'raid_live.json')) || '{}'));
function writeFixtures() {
  const now = Date.now();
  STATES.forEach(s => { s.updated = iso(now); s.adena = 0; s.clan = ''; fs.writeFileSync(path.join(SB, 'Logs', `swarm_state_${s.name}.json`), JSON.stringify(s)); });
  fs.writeFileSync(path.join(SB, 'Logs', 'raidhunt.json'), JSON.stringify(Object.assign({}, HUNT, { active: true, leader: 'Tankard', updatedAt: iso(now) })));
  if (LIVE && LIVE.boss) fs.writeFileSync(path.join(SB, 'Logs', 'raid_live.json'), JSON.stringify(Object.assign({}, LIVE, { leader: 'Tankard', updatedAt: iso(now), startedMs: now - 95000 })));
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
  const get = async (u) => (await fetch(`http://127.0.0.1:${PORT}${u}`)).json();
  ok('/raidspage.js + .css are served', (await fetch(`http://127.0.0.1:${PORT}/raidspage.js`)).status === 200 && (await fetch(`http://127.0.0.1:${PORT}/raidspage.css`)).status === 200);
  const rs = await get('/api/routes'), rr = (rs.routes || []).find(r => String(r.id) === String(RENOA.id));
  ok('/api/routes: who recorded / last used it + a small shape', rr && rr.by === 'Tankard' && rr.lastBy === 'Shieldy' && rr.shape.length >= 2 && rr.lastFailBy === 'Tankard', rr && JSON.stringify({ by: rr.by, lastBy: rr.lastBy, shape: rr.shape.length }));
  const ra = await get('/api/raids'), rb = (ra.raids || []).find(r => r.id === RENOA.id);
  ok('/api/raids: curse level + reachability for the board', rb && rb.curseLevel === RENOA.curseLevel && rb.reachable === true && Object.keys(ra.teams || {}).sort().join() === 'Shieldy,Tankard', rb && JSON.stringify({ c: rb.curseLevel, teams: Object.keys(ra.teams || {}) }));
  const leak = JSON.stringify(ra) + JSON.stringify(rs) + JSON.stringify(await get('/api/raidhunt')) + JSON.stringify(await get('/api/raidloot'));
  ok('sandbox API answers carry no real character name', !['Tank3', 'Tank1', 'Nuker9', 'Nuker10', 'Chanter4'].some(n => leak.includes(n)));

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-edge-'));
  const DBG = 9300 + Math.floor(Math.random() * 500);
  const br = cp.spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [], jsErr = [], dialogs = [];
  sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
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
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); cdp('Page.handleJavaScriptDialog', { accept: false }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') jsErr.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method !== 'Fetch.requestPaused') return;
    const rq = m.params.request, rid = m.params.requestId;
    if (rq.method === 'POST') { posts.push(rq.url + ' ' + (rq.postData || '')); return cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"ok":true,"intercepted":true}').toString('base64') }).catch(() => { }); }
    cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { });
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: false, onDialog: (d) => dialogs.push(d.msg) });   // UIDIALOG 2026-10-10: the shared dialog answers itself
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
  const FS_OK = new Set([11, 12, 13, 14, 16, 20]);

  let first = true;
  for (const dev of [{ tag: 'iphone', w: 390, h: 844, s: 2, mobile: true }, { tag: 'ipad', w: 820, h: 1180, s: 2, mobile: true }, { tag: 'desktop', w: 1920, h: 1080, s: 1, mobile: false }]) {
    console.log(`--- ${dev.tag} ${dev.w}x${dev.h}`);
    await cdp('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: dev.s, mobile: dev.mobile });
    await cdp('Emulation.setTouchEmulationEnabled', dev.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await cdp('Emulation.setUserAgentOverride', { userAgent: dev.mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36 Edg/140' });
    if (!first) { await ev(`localStorage.setItem('swarm.raids.fit', '"fits"'); localStorage.setItem('swarm.raids.st', '"any"')`).catch(() => { }); }
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/raids` });
    ok('#/raids opens the new page (old Raids tab hidden)', await waitFor(`!!window.RaidsPage && !document.getElementById('tab-raidspage').hidden && document.getElementById('tab-raids').hidden && document.querySelectorAll('#rpBoard .rp-card').length > 0`, 30000));
    await waitFor(`!!document.querySelector('.rp-live') && document.querySelectorAll('.rp-hrow').length >= 2`, 8000);
    if (first) await ev(`(() => { const b = document.querySelector('[data-rpst="any"]'); if (b) b.click(); })()`);
    await sleep(1300);                                                // countdowns tick once
    const s1 = await ev(`(() => { const q = (s) => [...document.querySelectorAll(s)];
      return { cards: q('#rpBoard .rp-card').length, routesOpen: document.querySelector('details[data-sec="routes"]').open, routeCards: q('.rp-rt').length,
        live: (document.querySelector('.rp-live') || {}).innerText || '', hunting: q('.rp-hrow.on').length, idle: q('.rp-hrow:not(.on)').length,
        nextTxt: q('.rp-hrow .q').map(x => x.innerText).join(' | '), cd: q('#rpBoard [data-cdto]').map(x => x.textContent).filter(Boolean).slice(0, 3),
        badges: { area: q('#rpBoard .rp-b.area').length, route: q('#rpBoard .rp-b.route').length }, fitChips: q('#rpBoard .rp-pf').length,
        sel: (document.getElementById('rpParty') || {}).value, count: document.getElementById('rpCount').innerText,
        hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, oldVisible: !document.getElementById('tab-raids').hidden }; })()`);
    console.log('   ', JSON.stringify(s1).slice(0, 400));
    ok('boss cards rendered', s1.cards >= 5, String(s1.cards));
    if (first) ok("'Saved routes' is COLLAPSED by default (no route cards built)", s1.routesOpen === false && s1.routeCards === 0);
    ok('LIVE raid pinned at the top with links to the live views', /LIVE/.test(s1.live) && /Watch/.test(s1.live) && /Party view/.test(s1.live), s1.live.replace(/\s+/g, ' ').slice(0, 120));
    ok('raidhunt per party: the hunting party (phase + Next) and the idle one (Next if it hunts)', s1.hunting === 1 && s1.idle >= 1 && /Next:/.test(s1.nextTxt) && /Next if it hunts/.test(s1.nextTxt), s1.nextTxt.slice(0, 160));
    ok('live respawn countdowns on the cards', s1.cd.length > 0 && s1.cd.every(t => /\d+(d|h|m)/.test(t)), s1.cd.join(', '));
    ok('fit chips per party on the cards', s1.fitChips > 0, String(s1.fitChips));
    ok('no horizontal page scroll', !s1.hscroll);
    // countdown really ticks
    // the countdown is recomputed every second from data-cdto: its text matches the time left (to the minute)
    const cdOk = await ev(`[...document.querySelectorAll('#rpBoard [data-cdto]')].slice(0, 5).every(e => { const ms = +e.dataset.cdto - Date.now(), t = e.textContent;
      const m = /^(?:([0-9]+)d ?)?(?:([0-9]+)h ?)?(?:([0-9]+)m)?(?: ?([0-9]+)s)?$/.exec(t); if (!m) return false; const got = ((+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 60000;
      return Math.abs(got - ms) < (m[1] ? 3700e3 : 125000); })`);
    ok('countdown text = the time left, recomputed every second', cdOk);
    // type scale: every text inside the page uses one of the site tokens
    const bad = await ev(`[...document.querySelectorAll('#tab-raidspage *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest('svg') && e.offsetParent !== null)
      .map(e => Math.round(parseFloat(getComputedStyle(e).fontSize))).filter(v => !${JSON.stringify([...FS_OK])}.includes(v))`);
    ok('type scale: only the site tokens (11/12/13/14/16/20 px)', bad.length === 0, bad.slice(0, 6).join(','));
    await ev(`window.scrollTo(0, 0)`); await sleep(300);
    await shot(`raidspage_${dev.tag}_1_board.png`);
    await shot(`raidspage_${dev.tag}_1_board_full.png`, true);
    if (first) {
      // filters: search, status segment, fits / all levels
      await ev(`(() => { const i = document.getElementById('rpQ'); i.value = 'Renoa'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(500);
      const fq = await ev(`[...document.querySelectorAll('#rpBoard .rp-card .rp-name')].map(x => x.textContent)`);
      await ev(`document.querySelector('[data-rpfit="any"]').click()`); await sleep(400);
      const fq2 = await ev(`[...document.querySelectorAll('#rpBoard .rp-card .rp-name')].map(x => x.textContent)`);
      ok('search + "all levels" finds Elf Renoa', fq2.includes('Elf Renoa'), `fits: ${fq.join(',')} | all: ${fq2.join(',')}`);
      const renoa = await ev(`(() => { const c = [...document.querySelectorAll('#rpBoard .rp-card')].find(x => x.querySelector('.rp-name').textContent === 'Elf Renoa'); return c ? { st: c.dataset.st, txt: c.innerText.replace(/\\s+/g, ' '), area: !!c.querySelector('.rp-b.area'), route: (c.querySelector('.rp-b.route:not(.bad)') || c.querySelector('.rp-b.route') || {}).textContent } : null; })()`);
      ok('Elf Renoa card: respawn window status, area + route badges, killed + loot line', renoa && renoa.st === 'window' && renoa.area && /route/.test(renoa.route || '') && /killed/.test(renoa.txt), renoa && renoa.txt.slice(0, 200));
      await ev(`(() => { const i = document.getElementById('rpQ'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await ev(`document.querySelector('[data-rpst="dead"]').click()`); await sleep(400);
      const dead = await ev(`[...document.querySelectorAll('#rpBoard .rp-card')].map(c => c.dataset.st)`);
      ok('status filter "dead" shows only dead bosses (with countdowns)', dead.length > 0 && dead.every(s => s === 'dead'), dead.join(','));
      await ev(`document.querySelector('[data-rpst="any"]').click()`); await sleep(300);
      // raid order: confirm dialog (dismissed in the test) -> nothing sent
      const nd = dialogs.length; await ev(`document.querySelector('#rpBoard [data-rpraid]').click()`); await sleep(400);
      ok('Raid button asks first (confirmOrder) — dismissed = nothing sent', dialogs.length === nd + 1 && /party/i.test(dialogs[dialogs.length - 1]) && !posts.some(p => /api\/command/.test(p)), (dialogs[dialogs.length - 1] || '').split('\n')[0]);
      // saved routes: open -> explanation + cards grouped per boss; remembered after a reload
      await ev(`(() => { const d = document.querySelector('details[data-sec="routes"]'); d.open = true; })()`); await sleep(700);
      const rt = await ev(`({ n: document.querySelectorAll('.rp-rt').length, ex: (document.querySelector('.rp-explain') || {}).innerText || '', grp: document.querySelectorAll('.rp-rgroup').length,
        renoa: ([...document.querySelectorAll('.rp-rt')].find(x => /Elf Renoa/.test(x.innerText)) || {}).innerText || '' })`);
      ok('saved routes open: one sentence says these are learned routes, not characters wandering', /learned routes/.test(rt.ex) && /not characters wandering/.test(rt.ex), rt.ex.slice(0, 120));
      ok('route cards grouped (per boss, by region) with origin, uses / fails and Map / Lock / Delete', rt.n > 10 && rt.grp > 1 && /recorded by party Tankard/.test(rt.renoa) && /used 2×/.test(rt.renoa) && /failed 1×/.test(rt.renoa) && /Map/.test(rt.renoa) && /Lock/.test(rt.renoa) && /Delete/.test(rt.renoa), rt.renoa.replace(/\s+/g, ' ').slice(0, 220));
      await ev(`document.querySelector('details[data-sec="routes"]').scrollIntoView()`); await sleep(500);
      await shot(`raidspage_${dev.tag}_2_routes.png`);
      // lock (POST, intercepted) and delete (confirm, dismissed -> no POST)
      const np = posts.length;
      await ev(`[...document.querySelectorAll('.rp-rt')].find(x => /Elf Renoa/.test(x.innerText)).querySelector('[data-rprlock]').click()`); await sleep(500);
      ok('Lock sends POST /api/route {action: lock} (intercepted)', posts.length === np + 1 && /api\/route/.test(posts[np]) && /"action":"lock"/.test(posts[np]), posts[np]);
      const nd2 = dialogs.length; await ev(`[...document.querySelectorAll('.rp-rt')].find(x => /Elf Renoa/.test(x.innerText)).querySelector('[data-rprdel]').click()`); await sleep(400);
      ok('Delete asks first (dismissed = nothing deleted)', dialogs.length === nd2 + 1 && posts.length === np + 1);
      await cdp('Page.reload'); await waitFor(`!!document.querySelector('#rpBoard .rp-card')`, 20000); await sleep(800);
      ok('"Saved routes" open state is remembered per viewer (localStorage)', await ev(`document.querySelector('details[data-sec="routes"]').open && document.querySelectorAll('.rp-rt').length > 0`));
      await ev(`(() => { const d = document.querySelector('details[data-sec="routes"]'); d.open = false; })()`); await sleep(300);
      await cdp('Page.reload'); await waitFor(`!!document.querySelector('#rpBoard .rp-card')`, 20000); await sleep(600);
      ok('...and collapsed again after closing it', await ev(`!document.querySelector('details[data-sec="routes"]').open`));
      // reports / loot / daily sections open and render (old renderers inside)
      await ev(`['reports','loot','daily'].forEach(k => { document.querySelector('details[data-sec="' + k + '"]').open = true; })`);
      ok('reports, loot log and daily dungeons render inside their sections', await waitFor(`document.querySelector('#rpSec_reports .rrgrid') && document.querySelector('#rpSec_loot .lootkill') && document.querySelector('#rpSec_daily .rrgrid')`, 12000));
      await ev(`['reports','loot','daily'].forEach(k => { document.querySelector('details[data-sec="' + k + '"]').open = false; })`);
    }
    // boss page: tap a card
    await ev(`(() => { const c = [...document.querySelectorAll('#rpBoard .rp-card')].find(x => x.querySelector('.rp-name').textContent === 'Elf Renoa') || document.querySelector('#rpBoard .rp-card'); c.querySelector('.rp-sub').click(); })()`);
    ok('tap a card opens the boss page', await waitFor(`/^#\\/raid\\/\\d+/.test(location.hash) && !!document.getElementById('rpbHead') && document.getElementById('rpbHead').innerText.length > 10`, 15000), await ev('location.hash'));
    ok('boss page: drops, facts, fight area (old editor hook), route editor (old), history', await waitFor(`document.querySelectorAll('.rpb-it').length > 0 && /Curse/.test(document.getElementById('rpbFacts').innerText) && !/^…$/.test(document.getElementById('rpAreaInfo').innerText) && !!document.querySelector('#routeEd #redSvg')`, 15000),
      await ev(`JSON.stringify({ it: document.querySelectorAll('.rpb-it').length, area: document.getElementById('rpAreaInfo').innerText.slice(0, 60), red: !!document.querySelector('#routeEd #redSvg') })`));
    ok('boss page: no horizontal page scroll', !(await ev(`document.documentElement.scrollWidth > window.innerWidth + 1`)));
    const badB = await ev(`[...document.querySelectorAll('#tab-raidspage .rpb-head *, #tab-raidspage .rpb-grid > .box:not(#rpbRouteBox) *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest('svg') && e.offsetParent !== null)
      .map(e => Math.round(parseFloat(getComputedStyle(e).fontSize))).filter(v => !${JSON.stringify([...FS_OK])}.includes(v))`);
    ok('boss page type scale: only the site tokens', badB.length === 0, badB.slice(0, 6).join(','));
    await ev(`window.scrollTo(0, 0)`); await sleep(400);
    await shot(`raidspage_${dev.tag}_3_boss.png`);
    await shot(`raidspage_${dev.tag}_3_boss_full.png`, true);
    // back to the board
    await ev(`document.getElementById('rpbBack').click()`);
    ok('Back returns to the board', await waitFor(`location.hash === '#/raids' && !!document.querySelector('#rpBoard .rp-card')`, 8000), await ev('location.hash'));
    if (first) {
      // Map button on a route card -> boss page, scrolled to the route
      await ev(`document.querySelector('details[data-sec="routes"]').open = true`); await sleep(600);
      await ev(`[...document.querySelectorAll('.rp-rt')].find(x => /Elf Renoa/.test(x.innerText)).querySelector('[data-rprmap]').click()`);
      ok('route card "Map" opens the boss page with the route editor', await waitFor(`/^#\\/raid\\/${RENOA.id}/.test(location.hash) && !!document.querySelector('#routeEd #redSvg')`, 15000));
      await ev(`document.querySelector('[data-rpgo="#/raids"]').click()`); await waitFor(`location.hash === '#/raids'`, 5000);
      await ev(`document.querySelector('details[data-sec="routes"]').open = false`);
      // another tab closes the page; coming back reopens it
      await ev(`go('#/parties')`);
      ok('another tab hides the raids page and stops its timers', await waitFor(`document.getElementById('tab-raidspage').hidden && !RaidsPage._rp.open && RaidsPage._rp.timers.length === 0`, 5000));
      await ev(`go('#/raids')`);
      ok('tab button / hash brings it back', await waitFor(`!document.getElementById('tab-raidspage').hidden && RaidsPage._rp.open`, 5000));
    }
    first = false;
  }
  ok('no JavaScript errors', jsErr.length === 0, jsErr.slice(0, 3).join(' | '));
  ok('only the intercepted route lock POST was made (no orders sent)', posts.length === 1, posts.join(' || '));
  ok('MCP: no mutating call', mcp.every(l => /^MCP (initialize|get_|notifications)/.test(l)), mcp.filter(l => !/^MCP (initialize|get_|notifications)/.test(l)).slice(0, 3).join(' | '));
  clearInterval(fx);
  try { sock.close(); } catch (e) { }
  br.kill(); srv.kill();
  await sleep(500);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { }
  try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  console.log(fails ? `${fails} FAILED` : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
