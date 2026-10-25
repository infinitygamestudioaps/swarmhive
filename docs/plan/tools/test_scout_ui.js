// Headless check of the boss page SCOUT button + the EPIC Guide box (Dashboard/raidspage.js, user 2026-10-10) on iPhone portrait and desktop.
// SANDBOX (like test_raidspage_ui.js, whose --server mode runs the sandbox server: real Dashboard/server.js + index.html + raidspage.*, MCP
// mocked, nothing reaches L2Swarm / the game): a temp install root with the static datapack JSONs and ONE synthetic party "Shieldy"
// (made-up names, no real character in it). POSTs are intercepted in the browser (the !scout order never leaves it).
// Flow: #/raid/29006 (Core) -> Guide box (green / amber / red) -> "Scout: is it up?" -> the shared dialog (uiChoice) suggests the most
// expendable member -> POST /api/command "!scout 29006 <name>" -> a scout result in Logs/raid_status.json -> header badge + toast.
//   node docs/plan/tools/test_scout_ui.js         (screenshots: docs/plan/mobile_check/scout_*.png)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'plan', 'mobile_check');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
if (!EDGE) { console.log('no Edge / Chrome — skipped'); process.exit(0); }

const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-sb-'));
['Logs', path.join('Logs', 'raid_reports'), 'Settings', path.join('Scripts', 'data', 'routes', 'raid', 'history'), path.join('docs', 'plan', 'tools')].forEach(d => fs.mkdirSync(path.join(SB, d), { recursive: true }));
fs.writeFileSync(path.join(SB, 'docs', 'plan', 'README.md'), '# sandbox\n');
fs.readdirSync(__dirname).filter(f => /\.js$/.test(f)).forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(SB, 'docs', 'plan', 'tools', f)));
fs.writeFileSync(path.join(SB, 'Logs', 'pause_supervisor'), 'sandbox');
const DSRC = path.join(ROOT, 'Scripts', 'data');
fs.readdirSync(DSRC).filter(f => /\.json$/.test(f) && fs.statSync(path.join(DSRC, f)).size < 6e6).forEach(f => fs.copyFileSync(path.join(DSRC, f), path.join(SB, 'Scripts', 'data', f)));
const PARTY = [['Shieldy', 55, 'sk', 'Shillien Knight'], ['Hero01', 55, 'bishop', 'Bishop'], ['Hero02', 52, 'destroyer', 'Destroyer'], ['Hero03', 51, 'dagger', 'Treasure Hunter'],
  ['Hero04', 53, 'nuker', 'Sorcerer'], ['Hero05', 53, 'nuker', 'Spellhowler'], ['Hero06', 54, 'shilliensaint', 'Shillien Elder']];
fs.writeFileSync(path.join(SB, 'accounts.json'), JSON.stringify(PARTY.map((p, i) => ({ login: 'sc' + i, character: p[0], party: 'Shieldy' }))));
const iso = (ms) => new Date(ms).toISOString();
fs.writeFileSync(path.join(SB, 'Logs', 'raid_status.json'), '{}');
function writeStates() {
  PARTY.forEach(([name, level, role, cls], i) => fs.writeFileSync(path.join(SB, 'Logs', `swarm_state_${name}.json`), JSON.stringify({ name, level, role, cls, classId: 0, hp: 100, mp: 100, dead: false,
    x: 83473 + i * 40, y: 148554, z: -3400, leader: name === 'Shieldy', mode: 'idle', task: 'waiting in Giran', updated: iso(Date.now()), buffs: 20, adena: 0, clan: '' })));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  writeStates(); const fx = setInterval(writeStates, 1000);
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'test_raidspage_ui.js'), '--server', SB], { stdio: ['ignore', 'pipe', 'pipe'] });
  let PORT = 0; const serr = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; }));
  srv.stderr.on('data', d => serr.push(String(d)));
  for (let i = 0; i < 150 && !PORT; i++) await sleep(100);
  if (!PORT) { console.log(serr.join('')); throw new Error('sandbox server did not start'); }
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-edge-'));
  const DBG = 9800 + Math.floor(Math.random() * 150);
  const br = cp.spawn(EDGE, ['--headless=new', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [], jsErr = [], dialogs = [], posts = [], native = [];
  sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); console.log('  shot', name); };
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { native.push(m.params.message); cdp('Page.handleJavaScriptDialog', { accept: false }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') jsErr.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method !== 'Fetch.requestPaused') return;
    const rq = m.params.request, rid = m.params.requestId;
    if (rq.method === 'POST') { posts.push(rq.url + ' ' + (rq.postData || '')); return cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"ok":true,"command":"sandbox","target":"party:Shieldy"}').toString('base64') }).catch(() => { }); }
    cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { });
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: true, onDialog: (d) => dialogs.push(d) });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });

  for (const dev of [{ tag: 'iphone', w: 390, h: 844, s: 2, mobile: true }, { tag: 'desktop', w: 1440, h: 900, s: 1, mobile: false }]) {
    console.log(`--- ${dev.tag}`);
    await cdp('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: dev.s, mobile: dev.mobile });
    posts.length = 0; dialogs.length = 0;
    fs.writeFileSync(path.join(SB, 'Logs', 'raid_status.json'), '{}');
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/raid/29006` });
    ok('boss page Core opens with the Guide box', await waitFor(`!!document.getElementById('rpbGuideBox') && !document.getElementById('rpbGuideBox').hidden && document.querySelectorAll('#rpbGuide .rpg-r').length > 3`, 20000));
    await waitFor(`(document.getElementById('rpbParty') || {}).value === 'Shieldy'`, 8000);
    const g = await ev(`(() => { const q = (s) => [...document.querySelectorAll(s)]; return { ok: q('#rpbGuide .rpg-r.ok').length, warn: q('#rpbGuide .rpg-r.warn').length, bad: q('#rpbGuide .rpg-r.bad').length,
      verdict: (document.querySelector('#rpbGuide .rpg-verdict') || {}).className || '', src: !!document.querySelector('#rpbGuideSrc a[href*="topic/477"]'), hscroll: document.documentElement.scrollWidth > innerWidth + 1 }; })()`);
    console.log('   ', JSON.stringify(g));
    ok('Guide: the synthetic party (2 nukers, 1 melee + dagger, lvl 51-55) MAY go — composition is advice (amber), nothing red', /ok/.test(g.verdict) && g.bad === 0 && g.warn >= 1 && g.ok >= 3);
    ok('Guide: the L2Toggle guide link', g.src);
    ok('no horizontal page scroll', !g.hscroll);
    ok('Scout button in the boss header', await waitFor(`!!document.getElementById('rpbScout')`, 5000));
    await ev(`document.getElementById('rpbScout').click()`);
    ok('the shared dialog asks who goes (uiChoice), suggesting the most expendable member', await waitFor(`true`, 10) && await (async () => { for (let i = 0; i < 40 && !dialogs.length; i++) await sleep(100); return dialogs.length === 1 && dialogs[0].type === 'choice' && /Scout Core/.test(dialogs[0].title) && /suggested: Hero03/.test(dialogs[0].msg); })(), dialogs[0] && dialogs[0].msg.replace(/\s+/g, ' ').slice(0, 160));
    let sent = ''; for (let i = 0; i < 40 && !sent; i++) { sent = posts.find(p => /\/api\/command/.test(p)) || ''; await sleep(100); }
    ok('POST /api/command: !scout 29006 Hero03 to party Shieldy (the suggested one)', /!scout 29006 Hero03/.test(sent) && /party:Shieldy/.test(sent), sent.slice(-120));
    if (dev.tag === 'iphone') await shot('scout_core_iphone.png');
    // the scout's result arrives (the leader writes raid_status.json)
    fs.writeFileSync(path.join(SB, 'Logs', 'raid_status.json'), JSON.stringify({ 29006: { name: 'Core', alive: true, at: iso(Date.now()), src: 'scouted by Hero03: ALIVE' } }));
    ok('header badge "scouted HH:MM: ALIVE" after the result (fast poll after a scout order)', await waitFor(`/scouted .*ALIVE/.test((document.querySelector('.rp-b.scout.up') || {}).textContent || '')`, 25000));
    fs.writeFileSync(path.join(SB, 'Logs', 'raid_status.json'), JSON.stringify({ 29006: { name: 'Core', alive: false, at: iso(Date.now() + 1000), src: 'scouted by Hero03: not there' } }));
    ok('a newer result -> toast + badge "not there"', await waitFor(`/not there/.test((document.querySelector('.rp-b.scout.gone') || {}).textContent || '') && /scouted by Hero03.*not there/.test([...document.querySelectorAll('.rp-toast, .ov-toast, .cp-toast, [class*=toast]')].map(x => x.textContent).join(' '))`, 25000));
    if (dev.tag === 'desktop') await shot('scout_core_desktop.png');
  }
  ok('no browser alert / confirm / prompt', !native.length, native.join(' | '));
  ok('no JS errors', !jsErr.length, jsErr.slice(0, 3).join(' | '));
  clearInterval(fx); br.kill(); srv.kill();
  await sleep(500);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { }
  try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  console.log(fails ? `${fails} FAILED` : 'all ok');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
