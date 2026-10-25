// Headless check of the LEVEL ETA (Dashboard/levelEta.js, user 2026-10-09 13:20: "an estimate of when they will level up based on the
// current experience they are getting") on every page that shows it: Parties member rows + party header (when the LOWEST level goes up),
// the character page (line under the EXP bar, 30-min marker, "Next level" KPI), the live party view (cards + summary), Accounts.
// iPhone portrait (390x844) + desktop 1920x1080, ONE headless Edge (closed at the end).
// SANDBOX: a temp folder with SYNTHETIC demo characters is the install root; server.js runs from the real Dashboard folder with MCP MOCKED
// (nothing reaches L2Swarm / the game), no background timers / child processes, POSTs blocked in the browser.
// Screenshots: docs/plan/mobile_check/leveleta_*.png
//   node docs/plan/tools/test_leveleta_ui.js
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..');

// ===================================================================== sandbox server (child process) ==============================
if (process.argv[2] === '--server') {
  const SB = process.argv[3];
  const SC = require(path.join(ROOT, 'docs', 'plan', 'tools', 'swarm_config.js'));
  const ACC = JSON.parse(fs.readFileSync(path.join(SB, 'accounts.json'), 'utf8'));
  SC.ROOT = SB; SC.ROOT_FWD = SB.replace(/\\/g, '/'); SC.mainLeader = 'Lead'; SC.reload = () => ({ accounts: ACC }); SC.accounts = ACC;
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
        if (b.params.name === 'get_account_data') t = '[]';
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
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'leveleta-sb-'));
['Logs', 'Settings', path.join('Scripts', 'data'), path.join('docs', 'plan')].forEach(d => fs.mkdirSync(path.join(SB, d), { recursive: true }));
fs.writeFileSync(path.join(SB, 'docs', 'plan', 'README.md'), '# sandbox\n');
fs.mkdirSync(path.join(SB, 'docs', 'plan', 'tools'), { recursive: true });
fs.readdirSync(__dirname).filter(f => /\.js$/.test(f)).forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(SB, 'docs', 'plan', 'tools', f)));
fs.writeFileSync(path.join(SB, 'Logs', 'pause_supervisor'), 'sandbox');
// name, role, class, classId, level, exp %, exp size (points per level), exp/h in points (0 = none), lastGainAgoMin, deathAgoMin
const SZ = { 51: 5736455, 52: 6100000, 53: 6500000, 60: 12000000 };
const PARTIES = {
  Lead: [['Lead', 'sk', 'Shillien Knight', 33, 53, 40.2, 600000, 0.2, null], ['Mira', 'bishop', 'Bishop', 16, 51, 71.4, 520000, 0.1, null],
    ['Pell', 'nuker', 'Sorcerer', 12, 51, 22.8, 480000, 0.2, null], ['Dex', 'destroyer', 'Destroyer', 46, 52, 63.0, 560000, 0.3, 6],
    ['Idle', 'doomcryer', 'Warcryer', 52, 52, 12.5, 300000, 22, null]],
  Slow: [['Slow', 'tank', 'Paladin', 5, 60, 3.1, 50000, 0.5, null], ['Late', 'healer', 'Elven Elder', 30, 60, 50.0, 0, null, null]],
};
const ACC = []; Object.keys(PARTIES).forEach(p => PARTIES[p].forEach(([c, role]) => ACC.push({ login: 'sb' + ACC.length, character: c, party: p, role })));
fs.writeFileSync(path.join(SB, 'accounts.json'), JSON.stringify(ACC));
ACC.forEach(a => fs.writeFileSync(path.join(SB, 'Settings', a.character + '.xml'), `<?xml version="1.0"?><Option><Name>${a.login}</Name><SelectedCharacter>${a.character}</SelectedCharacter></Option>`));
const iso = (ms) => new Date(ms).toISOString();
function states(now) {
  const out = [];
  Object.keys(PARTIES).forEach(p => PARTIES[p].forEach(([name, role, cls, classId, level, exp, ptsH, lastAgo, deathAgo], k) => {
    const size = SZ[level], log = [];
    if (ptsH && lastAgo != null) {
      const per = Math.round(ptsH / 120);   // a kill every 30 s
      for (let i = 9; i >= 0; i--) log.push({ amt: per, pct: Math.round(per / size * 100 * 10000) / 10000, at: now - lastAgo * 60000 - i * 30000, why: 'kill Validus', lvl: level, up: 0 });
    }
    if (deathAgo) { const amt = -Math.round(size * 0.02); log.shift(); log.push({ amt, pct: -2, at: now - deathAgo * 60000, why: 'death', lvl: level, up: 0 }); log.sort((a, b) => a.at - b.at); }   // the log keeps 10
    const lossAmt = log.filter(e => e.amt < 0).reduce((a, e) => a + e.amt, 0);
    const hourAmt = ptsH ? (lastAgo > 10 ? Math.round(ptsH * 0.5) : ptsH) + lossAmt : 0;
    const expHour = { pct: Math.round(hourAmt / size * 100 * 1000) / 1000, amt: hourAmt, n: ptsH ? 100 : 0, mins: 60 };
    out.push({ name, role, cls, classId, level, exp, hp: 100, mp: 90, cp: 100, dead: false, x: 83473 + k * 60, y: 148554 + k * 40, z: -3464, bot: true, combat: false,
      mode: 'autolevel', task: 'autolevel: Plains of Glory · lvl ' + level, leader: name === p, adena: 2400000, soe: 5, res: 3, shotId: 1463, shots: 3000, buffs: 26, buffLeft: 30000,
      deb: [], notes: [], updated: iso(now), expDelta: log[log.length - 1] || null, expLog: log, expHour,
      doing: { activity: 'autolevel', target: null, resting: false, busy: false, escaping: false, trading: false, follow: name === p ? null : p, zone: '' } });
  }));
  return out;
}
function writeFixtures() { const now = Date.now(); states(now).forEach(s => fs.writeFileSync(path.join(SB, 'Logs', `swarm_state_${s.name}.json`), JSON.stringify(s))); }

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
  const r0 = await fetch(`http://127.0.0.1:${PORT}/levelEta.js`);
  ok('/levelEta.js is served (public, no-cache)', r0.status === 200 && /no-cache/.test(r0.headers.get('cache-control') || ''));
  const st = await (await fetch(`http://127.0.0.1:${PORT}/api/state`)).json();
  ok('/api/state carries expHour + expLog', !!(st.chars || []).find(c => c.name === 'Mira' && c.expHour && c.expLog && c.expLog.length));

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'le-edge-'));
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
  const hscroll = `document.documentElement.scrollWidth > window.innerWidth + 1`;

  for (const dev of [{ tag: 'phone', w: 390, h: 844, s: 2, mobile: true }, { tag: 'desktop', w: 1920, h: 1080, s: 1, mobile: false }]) {
    console.log(`--- ${dev.tag} ${dev.w}x${dev.h}`);
    await cdp('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: dev.s, mobile: dev.mobile });
    await cdp('Emulation.setTouchEmulationEnabled', dev.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    if (dev.mobile) await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
    // ---- Parties tab
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/parties` });
    ok('levelEta.js loaded', await waitFor(`!!window.LevelEta`, 20000));
    ok('member rows show the compact ETA', await waitFor(`document.querySelectorAll('.mem2 .le-s').length >= 6`, 20000), await ev(`document.querySelectorAll('.mem2 .le-s').length + ' rows'`).catch(e => e.message));
    await sleep(500);
    const P = await ev(`(() => { const t = (n) => (document.querySelector('.mem2[data-char="' + n + '"] .le-s') || {}).textContent || ''; const ti = (n) => (document.querySelector('.mem2[data-char="' + n + '"] .le-s') || {}).title || '';
      const ph = [...document.querySelectorAll('.le-party')].map(x => x.textContent); return { mira: t('Mira'), pell: t('Pell'), dex: t('Dex'), idle: t('Idle'), late: t('Late'), slow: t('Slow'), tip: ti('Mira'), ph,
      xpRect: (() => { const x = document.querySelector('.mem2[data-char="Pell"] .xp'), row = document.querySelector('.mem2[data-char="Pell"]'); const a = x.getBoundingClientRect(), b = row.getBoundingClientRect(); return a.right <= b.right + 1; })(),
      h: ${hscroll} }; })()`);
    console.log('   rows:', JSON.stringify({ mira: P.mira, pell: P.pell, dex: P.dex, idle: P.idle, late: P.late, slow: P.slow }), '| party:', P.ph.join(' / '));
    ok('Mira (51, 71.4 %, 9.1 %/h): lvl in 3hNN', /^lvl in 3h\d\d$/.test(P.mira), P.mira);
    ok('Pell (51, 22.8 %, 8.4 %/h): lvl in ~9h', /^lvl in 9h\d\d$/.test(P.pell), P.pell);
    ok('Dex died 6 min ago: rate without the death (9.2 %/h, 37 % left -> ~4h)', /^lvl in [34]h\d\d$/.test(P.dex), P.dex);
    ok('Idle: no exp for 22 min', P.idle === 'no exp 22m', P.idle);
    ok('Late: no exp at all', P.late === 'no exp', P.late);
    ok('Slow: 0.42 %/h, 97 % left -> days', /^lvl in \d+d$/.test(P.slow), P.slow);
    ok('tooltip explains the calculation', /Rate: .* %\/h/.test(P.tip) && /How:/.test(P.tip), P.tip.split('\n')[2]);
    ok('party header: lowest 51 -> 52, Pell is the last one', P.ph.some(t => /^lowest 51→52 in 9h\d\d \(Pell last\)$/.test(t)), P.ph.join(' / '));
    ok('party header: a lowest-level member without an estimate', P.ph.some(t => /^lowest lvl 60: no level-up estimate yet$/.test(t)), P.ph.join(' / '));
    ok('the exp cell stays inside the row', P.xpRect);
    ok('no horizontal scroll (Parties)', !P.h);
    if (dev.mobile) { await ev(`document.querySelector('.mem2[data-char="Lead"]').closest('.win').scrollIntoView({ block: 'start' })`); await sleep(300); await shot('leveleta_phone_parties.png'); }
    else { await ev(`window.scrollTo(0, 0)`); await sleep(300); await shot('leveleta_desktop_parties.png'); }
    // ---- character page
    await ev(`location.hash = '#/char/Pell'`);
    ok('character page: the ETA line under the EXP bar', await waitFor(`!!document.querySelector('#cpHead .cp-bars .le-line')`, 20000));
    await sleep(800);
    const C = await ev(`(() => { const l = document.querySelector('#cpHead .cp-bars .le-line'), mk = document.querySelector('#cpHead .cp-xp .gauge .le-mk'), fut = document.querySelector('#cpHead .cp-xp .gauge .le-fut');
      const kpi = [...document.querySelectorAll('.cp-kpis > div')].map(d => d.innerText.replace(/\\s+/g, ' ')).find(t => /Next level/.test(t)) || '';
      const g = document.querySelector('#cpHead .cp-xp .gauge').getBoundingClientRect(), lr = l.getBoundingClientRect();
      return { line: l.innerText.replace(/\\s+/g, ' '), mk: mk ? mk.style.left : '', fut: !!fut, kpi, below: lr.top >= g.bottom - 1, money: (document.querySelector('#cpHead .cp-money') || {}).innerText || '', h: ${hscroll} }; })()`);
    console.log('   char:', JSON.stringify(C));
    ok('line: lvl 52 in ~9h NNm, clock, rate, window', /lvl 52 in ~9h \d+m at ~(\w{3} )?\d\d:\d\d 8\.\d %\/h last 60 min/.test(C.line), C.line);
    ok('the line sits under the EXP bar', C.below);
    ok('30-min marker on the EXP bar (22.8 % + ~4.2 %)', /^2[67]\.\d\d%$/.test(C.mk) && C.fut, C.mk);
    ok('"Next level" KPI in Progress', /Next level 9h\d\d · (\w{3} )?\d\d:\d\d/.test(C.kpi), C.kpi);
    ok('header rate uses the same rate', /exp 8\.\d %\/h/.test(C.money), C.money);
    ok('no horizontal scroll (character page)', !C.h);
    await ev(`window.scrollTo(0, 0)`); await sleep(300);
    if (dev.mobile) await shot('leveleta_phone_char.png'); else await shot('leveleta_desktop_char.png', { x: 0, y: 0, width: dev.w, height: 420, scale: 1 });
    await ev(`location.hash = '#/char/Dex'`);
    ok('character page after a death: "1 death left out"', await waitFor(`/1 death left out/.test((document.querySelector('#cpHead .cp-bars .le-line') || {}).innerText || '')`, 15000),
      await ev(`(document.querySelector('#cpHead .cp-bars .le-line') || {}).innerText || ''`));
    await ev(`location.hash = '#/char/Idle'`);
    ok('character page while idle: "no exp for 22 min (was …)" and no marker', await waitFor(`/no exp for 22 min \\(was /.test((document.querySelector('#cpHead .cp-bars .le-line') || {}).innerText || '') && !document.querySelector('#cpHead .cp-xp .le-mk')`, 15000),
      await ev(`(document.querySelector('#cpHead .cp-bars .le-line') || {}).innerText || ''`));
    if (dev.mobile) { await ev(`window.scrollTo(0, 0)`); await sleep(300); await shot('leveleta_phone_char_idle.png', { x: 0, y: 0, width: dev.w, height: 300, scale: 1 }); }
    // ---- live party view
    await ev(`location.hash = '#/live/Lead'`);
    ok('live view: cards with the compact ETA', await waitFor(`document.querySelectorAll('#lpCards .lpc .xp .le-s').length >= 4`, 20000), await ev(`document.querySelectorAll('#lpCards .lpc .xp .le-s').length + ''`).catch(e => e.message));
    await sleep(800);
    const L = await ev(`(() => ({ sum: (document.querySelector('#lpSum .le-party') || {}).textContent || '', mira: (document.querySelector('#lpc_Mira .xp .le-s') || {}).textContent || '', h: ${hscroll} }))()`);
    ok('live summary: when the lowest level goes up', /^lowest 51→52 in 9h\d\d \(Pell last\)$/.test(L.sum), L.sum);
    ok('live card: Mira lvl in 3hNN', /^lvl in 3h\d\d$/.test(L.mira), L.mira);
    ok('no horizontal scroll (live view)', !L.h);
    if (dev.mobile) { await ev(`document.getElementById('lpCards').scrollIntoView({ block: 'start' })`); await sleep(400); await shot('leveleta_phone_live.png'); }
    else { await ev(`window.scrollTo(0, 0)`); await sleep(300); await shot('leveleta_desktop_live.png'); }
    await ev(`location.hash = '#/parties'`); await sleep(800);
    // ---- Accounts
    await ev(`location.hash = '#/accounts'`);
    ok('Accounts: the compact ETA next to level / class', await waitFor(`document.querySelectorAll('#accBody .le-s').length >= 5`, 15000), await ev(`document.querySelectorAll('#accBody .le-s').length + ''`).catch(e => e.message));
    ok('no horizontal page scroll (Accounts)', !(await ev(hscroll)));
    if (dev.mobile) { await ev(`document.getElementById('accBody').scrollIntoView({ block: 'start' })`); await sleep(300); await shot('leveleta_phone_accounts.png'); }
  }
  ok('no JavaScript errors', jsErr.length === 0, jsErr.slice(0, 3).join(' | '));
  ok('no POST requests were sent', posts.length === 0, posts.join(', '));
  ok('MCP calls: only reads', mcp.every(l => /^MCP (get_account_data|get_accounts_status|get_account_status|get_static_data) /.test(l)), mcp.filter(l => !/get_account_data|get_accounts_status|get_account_status|get_static_data/.test(l)).slice(0, 3).join(' | '));
  clearInterval(fx);
  try { sock.close(); } catch (e) { }
  br.kill(); srv.kill();
  await sleep(800);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { }
  try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  console.log(fails ? `${fails} FAILED` : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
