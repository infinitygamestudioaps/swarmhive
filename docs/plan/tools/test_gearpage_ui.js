// Headless check of the GEAR PLANNER (#/gear, Dashboard/gearpage.js + gearpage_api.js), the MAP GUARD (Dashboard/mapguard.js: scrolling
// the page over a map scrolls the page) and the READABILITY pass (Dashboard/readability.css) on iPhone portrait (390x844), iPad portrait
// (820x1180) and desktop (1920x1080). User 2026-10-09 12:45.
// SANDBOX: a temp folder is the install root (Scripts/data = copies of the static JSONs incl. gear_prefs.json + shopscan_giran.json;
// Logs = the characters' state files with every real name replaced). server.js runs from the real Dashboard folder with MCP MOCKED,
// no timers / child processes, and writes ONLY inside the sandbox (gear plan saves go to the sandbox's gear_prefs.json and are checked
// there). Every other POST is intercepted in the browser. Real files are only READ.
// Screenshots: docs/plan/mobile_check/gear_*.png, mapguard_*.png, read_<page>_<device>_{before,after}.png
//   node docs/plan/tools/test_gearpage_ui.js              (gear + map guard + readability audit)
//   node docs/plan/tools/test_gearpage_ui.js --audit-only (only the readability audit, before + after screenshots)
//   node docs/plan/tools/test_gearpage_ui.js --server <sandbox>   (internal: the sandbox server)
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
  const realWrite = fs.writeFileSync, realAppend = fs.appendFileSync, realCopy = fs.copyFileSync, realRename = fs.renameSync, realUnlink = fs.unlinkSync, realMk = fs.mkdirSync;
  const inSb = (f) => path.resolve(String(f)).toLowerCase().startsWith(path.resolve(SB).toLowerCase());
  fs.writeFileSync = (f, d, o) => (inSb(f) ? realWrite(f, d, o) : undefined);
  fs.appendFileSync = (f, d, o) => (inSb(f) ? realAppend(f, d, o) : undefined);
  fs.copyFileSync = (a, b, m) => (inSb(b) ? realCopy(a, b, m) : undefined);
  fs.renameSync = (a, b) => (inSb(b) ? realRename(a, b) : undefined);
  fs.unlinkSync = (f) => (inSb(f) ? realUnlink(f) : undefined);
  fs.mkdirSync = (f, o) => (inSb(f) ? realMk(f, o) : undefined);
  const realCreate = http.createServer;
  http.createServer = (h) => { const s = realCreate(h); const L = s.listen.bind(s); s.listen = (p, host, cb) => L(0, '127.0.0.1', () => { process.stdout.write('PORT ' + s.address().port + '\n'); }); return s; };
  console.log = () => { };
  require(path.join(ROOT, 'Dashboard', 'server.js'));
  global.setInterval = T.si; global.setTimeout = T.st;
  return;
}

// ===================================================================== fixtures ===================================================
const AUDIT_ONLY = process.argv.includes('--audit-only'), MG_ONLY = process.argv.includes('--mapguard-only');
const OUT = path.join(ROOT, 'docs', 'plan', 'mobile_check');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
const readT = (f) => { try { return fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''); } catch (e) { return null; } };
const readJ = (f, d) => { try { return JSON.parse(readT(f)); } catch (e) { return d; } };

const REALN = fs.readdirSync(path.join(ROOT, 'Logs')).map(f => (f.match(/^swarm_state_(.+)\.json$/) || [])[1]).filter(n => n && n !== 'null');
const PARTY_A = ['Tank3', 'Destroyer9', 'Nuker11', 'Nuker7', 'Bishop4', 'Chanter4', 'Nuker9', 'Nuker8', 'Nuker10'];
const PARTY_B = ['Tank1', 'Bishop1', 'Destroyer1', 'Destroyer2', 'Doombringer1', 'Necro1', 'Inspector1', 'Chanter1', 'Saint1'];
const ANON = { Tank3: 'Tankard', Tank1: 'Shieldy', Destroyer1: 'Smasha', Destroyer2: 'Smashu' };
let k = 1; REALN.concat(PARTY_A, PARTY_B).forEach(n => { if (!ANON[n]) ANON[n] = 'Hero' + String(k++).padStart(2, '0'); });
const NAMES_RE = new RegExp('\\b(' + Object.keys(ANON).sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'g');
const anon = (t) => String(t).replace(NAMES_RE, (m) => ANON[m] || m);

const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'gearpage-sb-'));
['Logs', 'Settings', path.join('Scripts', 'data'), path.join('docs', 'plan', 'tools')].forEach(d => fs.mkdirSync(path.join(SB, d), { recursive: true }));
fs.writeFileSync(path.join(SB, 'docs', 'plan', 'README.md'), '# sandbox\n');
fs.readdirSync(__dirname).filter(f => /\.js$/.test(f)).forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(SB, 'docs', 'plan', 'tools', f)));
fs.writeFileSync(path.join(SB, 'Logs', 'pause_supervisor'), 'sandbox');
const DSRC = path.join(ROOT, 'Scripts', 'data');
fs.readdirSync(DSRC).filter(f => /\.json$/.test(f) && fs.statSync(path.join(DSRC, f)).size < 6e6).forEach(f => fs.copyFileSync(path.join(DSRC, f), path.join(SB, 'Scripts', 'data', f)));
const PREFS_SB = path.join(SB, 'Scripts', 'data', 'gear_prefs.json');
const PREFS0 = readT(PREFS_SB);
const ACC = [];
PARTY_A.forEach((n, i) => ACC.push({ login: 'sa' + i, character: ANON[n], party: 'Tankard' }));
PARTY_B.forEach((n, i) => ACC.push({ login: 'sb' + i, character: ANON[n], party: 'Shieldy' }));
fs.writeFileSync(path.join(SB, 'accounts.json'), JSON.stringify(ACC));
const STATES = PARTY_A.concat(PARTY_B).map(n => { const t = readT(path.join(ROOT, 'Logs', `swarm_state_${n}.json`)); return t ? JSON.parse(anon(t)) : null; }).filter(Boolean);
function writeFixtures() {
  const now = Date.now();
  STATES.forEach(s => { s.updated = new Date(now).toISOString(); s.adena = 0; s.clan = ''; fs.writeFileSync(path.join(SB, 'Logs', `swarm_state_${s.name}.json`), JSON.stringify(s)); });
}

// ===================================================================== browser test ===============================================
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  writeFixtures(); const fx = setInterval(writeFixtures, 1500);
  const srv = cp.spawn(process.execPath, [__filename, '--server', SB], { stdio: ['ignore', 'pipe', 'pipe'] });
  let PORT = 0; const mcp = [], serr = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcp.push(l); }));
  srv.stderr.on('data', d => serr.push(String(d)));
  for (let i = 0; i < 150 && !PORT; i++) await sleep(100);
  if (!PORT) { console.log(serr.join('')); throw new Error('sandbox server did not start'); }
  console.log('sandbox', SB, 'port', PORT);
  const base = `http://127.0.0.1:${PORT}`;
  const get = async (u) => (await fetch(base + u)).json();
  const post = async (u, b) => (await fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();

  if (!AUDIT_ONLY) {
    // ---------------------------------------------------------------- API
    ok('/gearpage.js, /gearpage.css, /mapguard.js, /readability.css are served', (await Promise.all(['/gearpage.js', '/gearpage.css', '/mapguard.js', '/readability.css'].map(async u => (await fetch(base + u)).status))).every(s => s === 200));
    const meta = await get('/api/gearplanner/classes');
    ok('classes: every H5 class (base, 1st, 2nd, 3rd, Kamael) = 103', meta.classes && meta.classes.length === 103, String(meta.classes && meta.classes.length));
    ok('classes: 8 grades No-grade..S84', (meta.grades || []).join() === 'NONE,D,C,B,A,S,S80,S84');
    ok('our characters with their class', (meta.ours || []).some(o => o.name === 'Smasha' && o.classId === 46));
    const d46 = await get('/api/gearplanner?class=46&grade=C');
    ok('Destroyer C: the old role choice (Berserker Blade) shows as inherited', d46.plan && d46.plan.weapon && d46.plan.weapon.id === 5286 && d46.plan.weapon.from === 'role:destroyer', JSON.stringify(d46.plan && d46.plan.weapon).slice(0, 120));
    ok('Destroyer C weapons: two-handed swords / blunts fit, a 1h sword does not', d46.cand.weapon.some(r => r.id === 5286 && r.fit) && d46.cand.weapon.some(r => !r.two && r.t === 'SWORD' && !r.fit));
    ok('every slot incl. belt / bracelet / talisman / cloak has candidates or a reason', ['weapon', 'head', 'chest', 'legs', 'gloves', 'feet', 'neck', 'earring', 'ring', 'belt', 'talisman'].every(s => (d46.cand[s] || []).length > 0), Object.entries(d46.cand).map(([s, L]) => s + ':' + L.length).join(' '));
    ok('items carry stats + sources (Giran price / shop / craft / drop)', d46.cand.weapon.some(r => r.gc || r.gr) && d46.cand.weapon.some(r => r.src && r.src.cr) && d46.cand.weapon.some(r => r.src && r.src.dr) && d46.cand.weapon.every(r => r.pa != null));
    ok('our Destroyers are listed with slot status', (d46.chars || []).filter(c => c.own).length >= 2 && Object.values(d46.chars[0].slots).some(x => x.st), (d46.chars || []).map(c => c.name).join(','));
    ok('RECOMMENDED plan for Destroyer C: every main slot with a one-line why', ['weapon', 'chest', 'head', 'gloves', 'feet', 'neck', 'earring', 'ring'].every(s => d46.rec && d46.rec[s] && d46.rec[s].why && d46.rec[s].why.length > 10), d46.rec && d46.rec.chest && d46.rec.chest.why);
    ok('recommended files for the bots: Scripts/data/gear_rec/<classId>.json (sandbox)', fs.existsSync(path.join(SB, 'Scripts', 'data', 'gear_rec', '46.json')) && fs.readdirSync(path.join(SB, 'Scripts', 'data', 'gear_rec')).length === 103);
    const k131 = await get('/api/gearplanner?class=131&grade=C');
    ok('Doombringer (Kamael): no shield, no heavy armor, swords listed as Change Weapon twins', !k131.kit.sh && !k131.cand.chest.some(r => r.t === 'HEAVY') && k131.cand.weapon.some(r => r.change) && !k131.cand.weapon.some(r => r.t === 'BOW'));
    const k16 = await get('/api/gearplanner?class=16&grade=C');
    ok('Bishop C: robes fit, magic weapons fit, sigils allowed in the off-hand', k16.cand.chest.some(r => r.t === 'MAGIC' && r.fit) && k16.cand.weapon.filter(r => r.fit).every(r => r.mw) && (k16.kit.sig === true));
    const bad = await post('/api/gearplanner', { action: 'set', class: 131, grade: 'C', slot: 'chest', id: 2382 });
    ok('server refuses an item the class cannot wear (Kamael + heavy armor)', !!bad.error, bad.error);
  }

  if (process.argv.includes('--api-only')) {          // no browser (e.g. while the PC is short of RAM)
    clearInterval(fx); srv.kill(); await sleep(300); try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
    console.log(fails ? `${fails} FAILED` : 'ALL OK (API only)'); process.exit(fails ? 1 : 0);
  }
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-edge-'));
  const DBG = 9300 + Math.floor(Math.random() * 500);
  const br = cp.spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [], jsErr = [], dialogs = [];
  let acceptDialogs = false, noReadability = false;
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
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); cdp('Page.handleJavaScriptDialog', { accept: acceptDialogs }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') jsErr.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method !== 'Fetch.requestPaused') return;
    const rq = m.params.request, rid = m.params.requestId;
    if (/\/readability\.css/.test(rq.url) && noReadability) return cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/css' }], body: '' }).catch(() => { });
    if (rq.method === 'POST' && !/\/api\/gearplanner/.test(rq.url)) { posts.push(rq.url + ' ' + (rq.postData || '')); return cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"ok":true,"intercepted":true}').toString('base64') }).catch(() => { }); }
    if (rq.method === 'POST') posts.push('SANDBOX ' + rq.url + ' ' + (rq.postData || ''));
    cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { });
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: false, onDialog: (d) => dialogs.push(d.msg) });   // UIDIALOG 2026-10-10: the shared dialog answers itself
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }, { urlPattern: '*/readability.css*', requestStage: 'Request' }] });
  const FS_OK = new Set([11, 12, 13, 14, 16, 20]);
  const DEVS = [{ tag: 'iphone', w: 390, h: 844, s: 2, mobile: true }, { tag: 'ipad', w: 820, h: 1180, s: 2, mobile: true }, { tag: 'desktop', w: 1920, h: 1080, s: 1, mobile: false }];
  const setDev = async (dev) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: dev.s, mobile: dev.mobile });
    await cdp('Emulation.setTouchEmulationEnabled', dev.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await cdp('Emulation.setUserAgentOverride', { userAgent: dev.mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36 Edg/140' });
  };
  let navN = 0;
  // a real page load every time (a hash-only change would keep the old page state)
  const nav = async (hash) => { await cdp('Page.navigate', { url: `${base}/?t=${++navN}${hash}` }); await waitFor(`document.readyState === 'complete' && typeof STATE !== 'undefined'`, 20000); await waitFor(`!!STATE`, 15000); };
  const prefs = () => readJ(PREFS_SB, {});
  const typeScale = async (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest('svg') && e.offsetParent !== null)
      .map(e => Math.round(parseFloat(getComputedStyle(e).fontSize)) + ':' + (e.className || e.tagName)).filter(v => !${JSON.stringify([...FS_OK])}.includes(+v.split(':')[0]))`);

  if (!AUDIT_ONLY) {
    let first = true;
    for (const dev of (MG_ONLY ? [] : DEVS)) {
      console.log(`--- GEAR ${dev.tag} ${dev.w}x${dev.h}`);
      await setDev(dev);
      await nav('#/gear/46/C');
      ok('#/gear opens the planner (old Gear tab hidden), tab button marked', await waitFor(`!!window.GearPage && !document.getElementById('tab-gearpage').hidden && document.getElementById('tab-gear').hidden && document.querySelector('#tabs [data-tab="gear"]').classList.contains('on')`, 20000));
      ok('plan for Destroyer / C rendered: doll + 17 slot rows (SHIRTSLOT-2026-10-23: + shirt)', await waitFor(`document.querySelectorAll('#gpPlan .gp-cell').length >= 17 && document.querySelectorAll('#gpPlan .gp-rows > *').length === 17`, 15000));
      const s1 = await ev(`(() => ({ title: document.getElementById('gpPlanT').innerText, inh: [...document.querySelectorAll('#gpPlan .gp-row')].map(r => r.innerText).find(t => /Weapon/.test(t)) || '',
        grades: document.querySelectorAll('#gpGrades button').length, chars: document.querySelectorAll('#gpOurs .gp-char').length, strip: document.querySelectorAll('#gpOurs .gp-s').length,
        hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, side: getComputedStyle(document.getElementById('gpSide')).display }))()`);
      ok('title + inherited weapon (the old destroyer role choice; after the copy: Orc Raider)', /Destroyer/.test(s1.title) && /Berserker Blade/.test(s1.inh) && (first ? /from the old/ : /from /).test(s1.inh), s1.inh.replace(/\s+/g, ' ').slice(0, 140));
      ok('8 grade tabs, our characters with a slot strip', s1.grades === 8 && s1.chars >= 2 && s1.strip >= 20, JSON.stringify({ g: s1.grades, c: s1.chars, s: s1.strip }));
      ok(dev.tag === 'desktop' ? 'desktop: class list is a left column' : 'phone / tablet: class list is a closed drawer', dev.tag === 'desktop' ? s1.side === 'block' : s1.side === 'none', s1.side);
      ok('no horizontal page scroll', !s1.hscroll);
      const recRows = await ev(`[...document.querySelectorAll('#gpPlan .gp-row')].filter(r => r.querySelector('.gp-c.rec') && r.querySelector('.gp-why')).map(r => r.innerText.replace(/\\s+/g, ' ')).slice(0, 2)`);
      ok('pre-filled: slots without a choice show the RECOMMENDED item + why', recRows.length >= 1, (recRows[0] || '').slice(0, 160));
      const bad1 = await typeScale('#tab-gearpage *');
      ok('type scale: only the site tokens', bad1.length === 0, bad1.slice(0, 6).join(','));
      await ev('window.scrollTo(0, 0)'); await sleep(300);
      await shot(`gear_${dev.tag}_1_plan.png`); await shot(`gear_${dev.tag}_1_plan_full.png`, true);
      // class picker (drawer on phones)
      if (dev.tag !== 'desktop') {
        await ev(`document.getElementById('gpClsBtn').click()`);
        ok('class button opens the class list (grouped by race, tiers indented, our characters named)', await waitFor(`getComputedStyle(document.getElementById('gpSide')).display === 'block' && document.querySelectorAll('#gpClsList .gp-race').length === 6 && document.querySelectorAll('#gpClsList .gp-cl').length === 103`, 5000));
        await shot(`gear_${dev.tag}_0_classes.png`);
      }
      await ev(`(() => { const i = document.getElementById('gpClsQ'); i.value = 'shillien temp'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(300);
      const found = await ev(`[...document.querySelectorAll('#gpClsList .gp-cl')].map(b => b.innerText.trim())`);
      ok('class search', found.length === 1 && /Shillien Templar/.test(found[0]), found.join('|'));
      await ev(`(() => { const i = document.getElementById('gpClsQ'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      // picker: chest
      await ev(`document.querySelector('#gpPlan .gp-row[data-gpslot="chest"]').click()`);
      ok('slot tap opens the picker with items', await waitFor(`!document.getElementById('gpPick').hidden && document.querySelectorAll('#gpPanel .gp-it').length > 3`, 5000));
      const pk = await ev(`(() => ({ n: document.querySelectorAll('#gpPanel .gp-it').length, buy: document.querySelectorAll('#gpPanel .gp-c.buy').length, src: [...document.querySelectorAll('#gpPanel .gp-in .w')].map(x => x.innerText).join(' | ').slice(0, 300), full: document.getElementById('gpPanel').getBoundingClientRect().width }))()`);
      ok('picker rows: Giran prices + other sources', pk.buy > 0 && /craft|drop|shop|exchange/.test(pk.src), pk.src.slice(0, 160));
      const badP = await typeScale('#gpPanel *');
      ok('picker type scale: only the site tokens', badP.length === 0, badP.slice(0, 6).join(','));
      await shot(`gear_${dev.tag}_2_picker.png`);
      // expand one (details: all sources, set bonus)
      const tid = await ev(`(() => { const r = GearPage._gp; const d = r.data; const x = d.cand.chest.find(c => c.fit && c.gc && c.set != null) || d.cand.chest.find(c => c.fit && c.gc) || d.cand.chest.find(c => c.fit); return x.id; })()`);
      await ev(`document.querySelector('#gpPanel [data-gpexp="${tid}"]').click()`); await sleep(300);
      const det = await ev(`(document.querySelector('#gpPanel .gp-it.open .gp-det') || {}).innerText || ''`);
      ok('tap an item: details with Giran / sources / set', /Giran/.test(det) && det.length > 30, det.replace(/\s+/g, ' ').slice(0, 160));
      await shot(`gear_${dev.tag}_3_detail.png`);
      if (first) {
        // choose it -> saved in the sandbox prefs
        await ev(`document.querySelector('#gpPanel .gp-it.open [data-gpchoose]').click()`);
        ok('Choose saves _class[46].C.chest in gear_prefs.json (sandbox)', await waitFor(`(GearPage._gp.data.plan.chest || {}).id === ${tid}`, 8000) && (((prefs()._class || {})['46'] || {}).C || {}).chest && prefs()._class['46'].C.chest.id === tid, JSON.stringify((((prefs()._class || {})['46'] || {}).C || {}).chest || null).slice(0, 160));
        ok('the old role entries and the destroyer _weapon rule are untouched', JSON.stringify(prefs().destroyer) === JSON.stringify(JSON.parse(PREFS0).destroyer));
        ok('_parents written for swarm.js (Titan -> Destroyer)', (prefs()._parents || {})['113'] === 46);
        ok('history copy written', fs.readdirSync(path.join(SB, 'Scripts', 'data', 'gear_prefs_history')).length >= 1);
        // add an alternative + move it up + remove
        const alt = await ev(`GearPage._gp.data.cand.chest.find(c => c.fit && c.id !== ${tid}).id`);
        await ev(`document.querySelector('#gpPanel [data-gpexp="${alt}"]').click()`); await sleep(250);
        await ev(`document.querySelector('#gpPanel .gp-it.open [data-gpalt]').click()`);
        ok('Add as alternative', await waitFor(`(GearPage._gp.data.plan.chest.alt || []).includes(${alt})`, 6000) && prefs()._class['46'].C.chest.alt.includes(alt));
        await ev(`document.querySelector('#gpPanel [data-gpup="${alt}"]').click()`);
        ok('move the alternative up = it becomes the first choice', await waitFor(`GearPage._gp.data.plan.chest.id === ${alt}`, 6000) && prefs()._class['46'].C.chest.id === alt && prefs()._class['46'].C.chest.alt[0] === tid);
        await ev(`document.querySelector('#gpPanel [data-gpdrop="${tid}"]').click()`);
        ok('remove an alternative', await waitFor(`!(GearPage._gp.data.plan.chest.alt || []).length`, 6000));
        // buy rule
        await ev(`(() => { const s = document.getElementById('gpBuy'); s.value = 'real'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        ok('buy rule "real only" saved', await waitFor(`GearPage._gp.data.plan.chest.buy === 'real'`, 6000) && prefs()._class['46'].C.chest.buy === 'real');
        await ev(`document.querySelector('[data-gpclose]').click()`);
        // a MANUAL item: a necklace that Giran does not sell
        await ev(`document.querySelector('#gpPlan .gp-row[data-gpslot="neck"]').click()`); await waitFor(`!document.getElementById('gpPick').hidden`, 4000);
        const man = await ev(`(() => { const L = GearPage._gp.data.cand.neck; const x = L.find(c => !c.gc && !c.gr && !c.gx && c.src && !c.src.sh && (c.src.dr || c.src.cr)) || L.find(c => !c.gc && !c.gr && !c.gx && c.src && (c.src.dr || c.src.cr)); return x ? x.id : null; })()`);
        await ev(`document.querySelector('#gpPanel [data-gpexp="${man}"]').click()`); await sleep(250);
        await ev(`document.querySelector('#gpPanel .gp-it.open [data-gpchoose]').click()`);
        await waitFor(`(GearPage._gp.data.plan.neck || {}).id === ${man}`, 6000);
        await ev(`document.querySelector('[data-gpclose]').click()`); await sleep(300);
        const neckRow = await ev(`document.querySelector('#gpPlan .gp-row[data-gpslot="neck"]').innerText`);
        ok('an item no shop sells is saved and shows "manual" with where it comes from', /manual/.test(neckRow) && /drop|craft/.test(neckRow), neckRow.replace(/\s+/g, ' ').slice(0, 160));
        const chestRow = await ev(`document.querySelector('#gpPlan .gp-row[data-gpslot="chest"]').innerText`);
        ok('a chest sold in Giran shows the gold "Giran" chip', /Giran/.test(chestRow), chestRow.replace(/\s+/g, ' ').slice(0, 160));
        // belt: the bots do not buy belts
        await ev(`document.querySelector('#gpPlan .gp-row[data-gpslot="belt"]').click()`); await waitFor(`!document.getElementById('gpPick').hidden && document.querySelectorAll('#gpPanel .gp-it').length > 0`, 4000);
        const belt = await ev(`GearPage._gp.data.cand.belt[0].id`);
        await ev(`document.querySelector('#gpPanel [data-gpexp="${belt}"]').click()`); await sleep(250);
        await ev(`document.querySelector('#gpPanel .gp-it.open [data-gpchoose]').click()`); await waitFor(`!!GearPage._gp.data.plan.belt`, 6000);
        await ev(`document.querySelector('[data-gpclose]').click()`); await sleep(300);
        ok('belt chosen: "manual · bots do not buy belts"', /bots do not buy belts/.test(await ev(`document.querySelector('#gpPlan .gp-row[data-gpslot="belt"]').innerText`)));
        // our characters now show gold / grey / green cells
        const st = await ev(`[...document.querySelectorAll('#gpOurs .gp-char:not(.line) .gp-s')].map(x => x.className.replace('gp-s ', ''))`);
        ok('our characters: status colours per slot (has / buy / manual / none)', st.includes('man') && st.some(x => x !== 'none'), [...new Set(st)].join(','));
        // fallback rule
        await ev(`(() => { const s = document.getElementById('gpFallback'); s.value = 'keep'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        ok('fallback "keep what they wear" saved', await waitFor(`GearPage._gp.data.fallback === 'keep'`, 6000) && prefs()._class['46'].C._fallback === 'keep');
        // copy to the similar classes (confirm accepted)
        acceptDialogs = true; await UID.set(ev, true);
        // D9 (2026-10-12): "Copy to similar" is a panel now (classes of the same weapon kind ticked by default) -> open it, then copy
        await ev(`document.querySelector('[data-gptool="copy"]').click()`); await waitFor(`!!document.querySelector('[data-gpcopygo]')`, 3000);
        await ev(`document.querySelector('[data-gpcopygo]').click()`);
        ok('Copy to similar classes: Orc Raider + Titan get the plan', await waitFor(`true`, 100) && (await (async () => { for (let i = 0; i < 40; i++) { const p = prefs(); if (p._class && p._class['113'] && p._class['113'].C && p._class['45'] && p._class['45'].C) return true; await sleep(150); } return false; })()), Object.keys(prefs()._class || {}).join(','));
        acceptDialogs = false; await UID.set(ev, false);
        ok('copied plan keeps the order + buy rule', prefs()._class['113'].C.chest.buy === 'real' && prefs()._class['113'].C.chest.id === prefs()._class['46'].C.chest.id);
        // Titan S80: inherits nothing at C... but Titan C uses its own copy; Destroyer B shows the old role choice
        await ev(`document.querySelector('#gpGrades [data-gpgrade="B"]').click()`);
        ok('grade tab B: Star Buster from the old destroyer role choice', await waitFor(`GearPage._gp.data && GearPage._gp.data.grade === 'B' && (GearPage._gp.data.plan.weapon || {}).id === 7901`, 8000) && /\/46\/B$/.test(await ev('location.hash')));
        // inheritance: Titan at B has no plan of its own -> uses Destroyer's (the role choice)
        await ev(`go('#/gear/113/B')`);
        ok('Titan B (no own plan) shows the Destroyer line choice as inherited', await waitFor(`GearPage._gp.data && GearPage._gp.data.class.id === 113 && (GearPage._gp.data.plan.weapon || {}).id === 7901`, 8000));
        // Use recommended: removes the own chest choice, the recommendation takes over
        await ev(`go('#/gear/46/C')`); await waitFor(`GearPage._gp.data && GearPage._gp.data.class.id === 46 && GearPage._gp.data.grade === 'C'`, 8000); await sleep(300);
        ok('own choice row says \"your choice\"', /your choice/.test(await ev(`document.querySelector('#gpPlan .gp-row[data-gpslot=\"chest\"]').innerText`)));
        await ev(`document.querySelector('#gpPlan .gp-row[data-gpslot=\"chest\"]').click()`); await waitFor(`!!document.querySelector('#gpPanel .gp-recl [data-gpuserec]')`, 5000);
        await shot(`gear_${dev.tag}_5_recommended_picker.png`);
        await ev(`document.querySelector('#gpPanel [data-gpuserec]').click()`);
        ok('Use recommended: the own chest choice is removed (the copy gave Orc Raider one, so Destroyer now inherits it)', await waitFor(`!(GearPage._gp.data.plan.chest && GearPage._gp.data.plan.chest.from === 46) && /from Orc Raider|recommended/.test(document.querySelector('#gpPlan .gp-row[data-gpslot=\"chest\"]').innerText)`, 6000) && !prefs()._class['46'].C.chest);
        await ev(`document.querySelector('[data-gpclose]').click()`); await sleep(200);
        const ndR = dialogs.length; await ev(`document.querySelector('[data-gpreset=\"all\"]').click()`); await sleep(400);
        ok('Reset ALL classes asks first (dismissed = nothing removed)', dialogs.length === ndR + 1 && !!prefs()._class['113']);
        await ev(`go('#/gear/46/C')`); await waitFor(`GearPage._gp.data && GearPage._gp.data.class.id === 46 && GearPage._gp.data.grade === 'C'`, 8000); await sleep(400);
        await ev('window.scrollTo(0, 0)'); await sleep(300);
        await shot(`gear_${dev.tag}_4_planned.png`); await shot(`gear_${dev.tag}_4_planned_full.png`, true);
        // clear (confirm dismissed = nothing happens)
        const nd = dialogs.length; await ev(`document.querySelector('[data-gpclear]').click()`); await sleep(400);
        ok('Clear asks first (dismissed = plan stays)', dialogs.length === nd + 1 && !!prefs()._class['46'].C.neck);
      } else {
        await ev(`document.querySelector('[data-gpclose]').click()`); await sleep(200);
        await ev('window.scrollTo(0, 0)'); await sleep(300);
        await shot(`gear_${dev.tag}_4_planned.png`);
      }
      ok('Escape / close hides the picker', await waitFor(`document.getElementById('gpPick').hidden`, 3000));
      // another tab closes the page
      await ev(`go('#/parties')`);
      ok('another tab hides the planner', await waitFor(`document.getElementById('tab-gearpage').hidden && !GearPage._gp.open`, 5000));
      first = false;
    }

    // ---------------------------------------------------------------- MAP GUARD
    for (const dev of [DEVS[2], DEVS[0]]) {
      console.log(`--- MAP GUARD ${dev.tag}`);
      await setDev(dev);
      await nav('#/char/Shieldy');
      ok('character page map present', await waitFor(`!!document.querySelector('#cpMap') && CharPage._cp.view && document.querySelector('#cpMap').getBoundingClientRect().height > 100`, 20000));
      await sleep(3000);                                          // let the page finish loading (its height grows while the boxes fill)
      // put the map in the middle of the screen with room to scroll
      await ev(`(() => { const m = document.querySelector('#cpMap'); const r = m.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - 120); })()`); await sleep(400);
      const geo = await ev(`(() => { const r = document.querySelector('#cpMap').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, 200) / 2, sy: window.scrollY, hw: CharPage._cp.view.hw, cx: CharPage._cp.view.cx, max: document.documentElement.scrollHeight - window.innerHeight }; })()`);
      if (!dev.mobile) {
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geo.x, y: geo.y });
        await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: geo.x, y: geo.y, deltaX: 0, deltaY: 240 }); await sleep(500);
        const a = await ev(`({ sy: window.scrollY, hw: CharPage._cp.view.hw, follow: CharPage._cp.follow, hint: (document.querySelector('.mg-hint') || {}).textContent || '' })`);
        ok('desktop: wheel over the idle map scrolls the PAGE, the map does not zoom', (a.sy > geo.sy || geo.sy >= geo.max - 1) && a.follow === true,   // follow stays on = the map's wheel handler never ran (hw itself changes with the live follow-fit)
           JSON.stringify({ before: geo.sy, after: a.sy, hw0: geo.hw, hw: a.hw }));
        ok('...and shows the hint "Ctrl + scroll or click the map to zoom it"', /scroll or click the map to zoom/.test(a.hint), a.hint);
        await ev(`(() => { const m = document.querySelector('#cpMap'); const r = m.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - 120); })()`); await sleep(300);
        const g2 = await ev(`(() => { const r = document.querySelector('#cpMap').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 60, sy: window.scrollY, hw: CharPage._cp.view.hw }; })()`);
        await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: g2.x, y: g2.y, deltaX: 0, deltaY: -240, modifiers: 2 }); await sleep(400);
        const b = await ev(`({ sy: window.scrollY, hw: CharPage._cp.view.hw })`);
        ok('desktop: Ctrl + wheel zooms the map, the page stays', b.hw !== g2.hw && b.sy === g2.sy, JSON.stringify({ hw0: g2.hw, hw: b.hw, sy0: g2.sy, sy: b.sy }));
        await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: g2.x, y: g2.y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g2.x, y: g2.y, button: 'left', clickCount: 1 }); await sleep(200);
        const hw3 = await ev('CharPage._cp.view.hw');
        await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: g2.x, y: g2.y, deltaX: 0, deltaY: 240 }); await sleep(400);
        const c = await ev(`({ sy: window.scrollY, hw: CharPage._cp.view.hw, on: document.querySelector('#cpMap').classList.contains('mg-on') })`);
        ok('desktop: after a click into the map the wheel zooms it (gold outline)', c.on && c.hw !== hw3 && c.sy === g2.sy, JSON.stringify(c));
        await shot(`mapguard_${dev.tag}_active.png`);
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: geo.y }); await sleep(150);
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g2.x, y: g2.y }); await sleep(150);
        const hw4 = await ev('CharPage._cp.view.hw');
        await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: g2.x, y: g2.y, deltaX: 0, deltaY: -120 }); await sleep(400);
        const d2 = await ev(`({ sy: window.scrollY, hw: CharPage._cp.view.hw, on: document.querySelector('#cpMap').classList.contains('mg-on') })`);
        ok('desktop: the mouse leaving the map hands the wheel back to the page', !d2.on && d2.hw === hw4 && d2.sy < g2.sy, JSON.stringify(d2));
        // the live party map, the route editor and the world map
        await nav('#/live/Shieldy');
        if (await waitFor(`!!document.querySelector('#lpMap') && LiveParty._lp.view && document.querySelector('#lpMap').getBoundingClientRect().height > 100`, 15000)) {
          await ev(`(() => { const r = document.querySelector('#lpMap').getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - 60); })()`); await sleep(300);
          const L0 = await ev(`(() => { const r = document.querySelector('#lpMap').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 80, sy: window.scrollY, hw: LiveParty._lp.view.hw, max: document.documentElement.scrollHeight - window.innerHeight }; })()`);
          await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: L0.x, y: L0.y, deltaX: 0, deltaY: 240 }); await sleep(400);
          const L1 = await ev(`({ sy: window.scrollY, hw: LiveParty._lp.view.hw })`);
          ok('live party map: wheel scrolls the page, no zoom', L1.hw === L0.hw && (L1.sy > L0.sy || L0.sy >= L0.max), JSON.stringify({ L0, L1 }));
        } else ok('live party map present', false);
        await nav('#/map');
        if (await waitFor(`typeof MAP !== 'undefined' && !!MAP && document.getElementById('map').getBoundingClientRect().height > 100`, 15000)) {
          await sleep(800);
          const W0 = await ev(`(() => { const r = document.getElementById('map').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, z: MAP.getZoom(), sy: window.scrollY }; })()`);
          await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: W0.x, y: W0.y, deltaX: 0, deltaY: -240 }); await sleep(600);
          const W1 = await ev(`({ z: MAP.getZoom(), sy: window.scrollY })`);
          ok('world map (Leaflet): wheel without a click does not zoom', W1.z === W0.z, JSON.stringify({ W0, W1 }));
          await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: W0.x, y: W0.y, deltaX: 0, deltaY: -240, modifiers: 2 }); await sleep(700);
          ok('world map: Ctrl + wheel zooms', await ev(`MAP.getZoom()`) !== W0.z);
        } else ok('world map present', false);
      } else {
        // phone: a finger swipe that starts on the map scrolls the page (touch-action pan-y), the map stays put
        // control: the same swipe on plain page text scrolls the page (proves the gesture works in this browser)
        await ev(`window.scrollTo(0, 300)`); await sleep(200);
        const c0 = await ev('window.scrollY'); await cdp('Input.synthesizeScrollGesture', { x: 30, y: 400, yDistance: -200, gestureSourceType: 'touch', speed: 1200 }); await sleep(600);
        const c1 = await ev('window.scrollY'), touchScrolls = c1 !== c0;
        console.log('    control swipe on page text: scrollY', c0, '->', c1, touchScrolls ? '' : '(synthetic touch scrolling does not move the page in this headless browser: only the map side is checked)');
        await ev(`(() => { const m = document.querySelector('#cpMap'); const r = m.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - 120); })()`); await sleep(300);
        Object.assign(geo, await ev(`(() => { const r = document.querySelector('#cpMap').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, 200) / 2, sy: window.scrollY, max: document.documentElement.scrollHeight - window.innerHeight }; })()`));
        const sy0 = geo.sy, room = geo.max - geo.sy, dist = room > 200 ? -260 : 260;   // CDP: positive yDistance scrolls up
        await cdp('Input.synthesizeScrollGesture', { x: Math.round(geo.x), y: Math.round(geo.y + 40), yDistance: dist, gestureSourceType: 'touch', speed: 1200 }); await sleep(700);
        const a = await ev(`({ sy: window.scrollY, cx: CharPage._cp.view.cx, follow: CharPage._cp.follow, ta: getComputedStyle(document.querySelector('#cpMap')).touchAction })`);
        ok('phone: a swipe on the idle map does not pan the map (touch-action pan-y = the browser scrolls the page)' + (touchScrolls ? ' and the page scrolled' : ''), (!touchScrolls || Math.abs(a.sy - sy0) > 50) && a.follow === true && /pan-y/.test(a.ta), JSON.stringify({ sy0, sy: a.sy, ta: a.ta, follow: a.follow }));
        await ev(`(() => { const m = document.querySelector('#cpMap'); const r = m.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - 120); })()`); await sleep(300);
        const g = await ev(`(() => { const r = document.querySelector('#cpMap').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 80), sy: window.scrollY }; })()`);
        await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.x, y: g.y }] }); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300);
        const on = await ev(`document.querySelector('#cpMap').classList.contains('mg-on')`);
        ok('phone: a tap activates the map (gold outline + hint)', on && /Map active/.test(await ev(`(document.querySelector('.mg-hint') || {}).textContent || ''`)));
        await shot(`mapguard_${dev.tag}_active.png`);
        await cdp('Input.synthesizeScrollGesture', { x: g.x, y: g.y + 20, yDistance: -160, gestureSourceType: 'touch', speed: 1200 }); await sleep(700);
        const b = await ev(`({ sy: window.scrollY, follow: CharPage._cp.follow })`);
        ok('phone: on the ACTIVE map a swipe pans the map, the page stays', b.sy === g.sy && b.follow === false, JSON.stringify({ sy0: g.sy, sy: b.sy, follow: b.follow }));
        await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 10, y: 120 }] }); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(250);
        ok('phone: a tap outside releases the map', !(await ev(`document.querySelector('#cpMap').classList.contains('mg-on')`)));
      }
      // no page jump on refresh: stay still 5 s on the character page (map refreshes every 1.5 s)
      await nav('#/char/Shieldy'); await waitFor(`!!document.querySelector('#cpMap')`, 15000); await sleep(1500);
      await ev(`window.scrollTo(0, Math.min(500, document.documentElement.scrollHeight - window.innerHeight))`); await sleep(300);
      const y0 = await ev('window.scrollY'); await sleep(5200);
      const y1 = await ev('window.scrollY');
      ok('no automatic page scroll while the page refreshes (5 s)', y0 === y1, `${y0} -> ${y1}`);
    }
  }

  // ---------------------------------------------------------------- READABILITY AUDIT (before = readability.css stripped, after = with it)
  if (MG_ONLY) { console.log('(map guard only)'); }
  const PAGES = MG_ONLY ? [] : ['parties', 'map', 'logs', 'tp', 'raids', 'kamaloka', 'forts', 'castles', 'crystals', 'clan', 'zones', 'spots', 'rooms', 'gear', 'accounts', 'plan', 'pc', 'live/Shieldy', 'char/Shieldy'];
  const audit = {};
  for (const phase of ['before', 'after']) {
    noReadability = phase === 'before';
    for (const dev of [DEVS[0], DEVS[2]]) {
      await setDev(dev);
      for (const pg of PAGES) {
        await nav('#/' + pg); await sleep(pg === 'map' ? 2500 : 1800);
        const r = await ev(`(() => {
          const vis = [...document.querySelectorAll('main > section')].filter(s => !s.hidden && s.offsetParent !== null);
          const els = vis.flatMap(s => [...s.querySelectorAll('*')]).filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest('svg') && e.offsetParent !== null);
          const sizes = {}; els.forEach(e => { const v = Math.round(parseFloat(getComputedStyle(e).fontSize)); sizes[v] = (sizes[v] || 0) + 1; });
          const odd = els.filter(e => ![11, 12, 13, 14, 16, 20].includes(Math.round(parseFloat(getComputedStyle(e).fontSize)))).map(e => Math.round(parseFloat(getComputedStyle(e).fontSize)) + 'px ' + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : e.tagName.toLowerCase()) + ' "' + e.textContent.trim().slice(0, 24) + '"');
          const wide = vis.flatMap(s => [...s.querySelectorAll('table, pre, .box, .win, img, svg')]).filter(e => e.getBoundingClientRect().right > window.innerWidth + 2 && !e.closest('.leaflet-container, .scroll, .lgwrap, pre.log, .cp-igrid, .gp-grades, nav, .peers, .dmap, .tl, [style*="overflow"]')).map(e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '')) + ' ' + Math.round(e.getBoundingClientRect().right));
          return { sizes, odd: [...new Set(odd)].slice(0, 12), oddN: odd.length, wide: [...new Set(wide)].slice(0, 6), hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, n: els.length };
        })()`);
        audit[`${pg}|${dev.tag}|${phase}`] = r;
        console.log(`  ${phase.padEnd(6)} ${dev.tag.padEnd(7)} ${pg.padEnd(13)} text ${String(r.n).padStart(4)} odd ${String(r.oddN).padStart(3)}${r.wide.length ? ' WIDE ' + r.wide.join(', ') : ''}${r.hscroll ? ' HSCROLL' : ''}${r.odd.length ? '  ' + r.odd.slice(0, 4).join(' | ') : ''}`);
        if (['parties', 'tp', 'kamaloka', 'crystals', 'clan', 'spots', 'gear', 'accounts', 'pc', 'zones'].includes(pg)) { await ev('window.scrollTo(0, 0)'); await sleep(150); await shot(`read_${pg.replace('/', '_')}_${dev.tag}_${phase}.png`); }
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'readability_audit.json'), JSON.stringify(audit, null, 1));
  const after = Object.entries(audit).filter(([k2]) => k2.endsWith('|after'));
  ok('readability: no page scrolls sideways (phone + desktop)', after.every(([, r]) => !r.hscroll), after.filter(([, r]) => r.hscroll).map(([k2]) => k2).join(', '));
  ok('readability: only the site font sizes on every page', after.every(([, r]) => r.oddN === 0), after.filter(([, r]) => r.oddN).map(([k2, r]) => k2 + ':' + r.oddN).join(', '));

  ok('no JavaScript errors', jsErr.length === 0, jsErr.slice(0, 3).join(' | '));
  ok('only gear-planner POSTs reached the (sandbox) server; nothing else was sent', posts.every(p => /^SANDBOX .*\/api\/gearplanner/.test(p)), posts.filter(p => !/^SANDBOX/.test(p)).slice(0, 3).join(' || '));
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
