// Headless check of the HUNT TIMER popup (owner 2026-10-15: "I asked Tank1's team to go to the catacomb but I did not get asked how many
// hours etc."). Edge via CDP against the SANDBOX server (cmdcenter_testserver.js: the real Dashboard/server.js with MCP mocked, nothing reaches
// the game). The hunt timer file is a SCRATCH copy (SWARM_HUNTTIMER_FILE / SWARM_HUNTTIMER_LOGS); POST /api/partyspot and /api/command are
// intercepted in the browser (never saved / sent); /api/state is patched so party Crafter1 carries known supplies.
//   iPhone 390x844: the popup itself (two rows of big choices, the supply estimate redraws when the hours change, the runs-out warning,
//   no horizontal scroll) -> a spot choice with 2 h + "Town, supplies, come back" (timer written) -> the party card line -> Extend (+2 h)
//   -> End now -> "Supply run first" (!supply to the party) -> "Until I stop it" (timer removed) -> Back to auto.
// Screenshots: %TEMP%\hunttimer_shots (or the dir given)
//   node docs/plan/tools/test_hunttimer_ui.js [screenshot dir]
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'hunttimer_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const PARTY = 'Crafter1';
function patchState(j) {
  const now = new Date().toISOString(); let i = 0;
  (j.chars || []).forEach(c => {
    if (c.party !== PARTY) return;
    const lead = c.name === PARTY;
    Object.assign(c, { updated: now, ageSec: 1, dead: false, hp: 90, level: 30, leader: lead, shotId: lead ? 1463 : 3948, shots: lead ? 900 : 4000,
      sup: { k: lead ? 'fighter' : 'mage', h: i === 1, mana: 400, heal: 20, ore: i === 1 ? 40 : 0, oreSk: i === 1 ? ['Major Heal'] : [], holySk: [], soulSk: [], seenH: 0, use: {} } });
    i++;
  });
  return j;
}
const readTimers = (F) => { try { return JSON.parse(fs.readFileSync(F, 'utf8')); } catch (e) { return null; } };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'htui-'));
  const HTF = path.join(TMP, 'hunt_timers.json'); fs.mkdirSync(path.join(TMP, 'Logs'));
  const LIVE = path.join(ROOT, 'Scripts', 'data', 'hunt_timers.json'); const liveSt = () => { try { const s = fs.statSync(LIVE); return s.size + ':' + s.mtimeMs; } catch (e) { return 'absent'; } }; const LIVE0 = liveSt();
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_HUNTTIMER_FILE: HTF, SWARM_HUNTTIMER_LOGS: path.join(TMP, 'Logs') }) });
  let PORT = 0; const mcp = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcp.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-edge-'));
  const DBG = 9300 + Math.floor(Math.random() * 500);
  const br = cp.spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [];
  sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const posts = [], dialogs = [], errors = [];
  handlers.push(async (m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 300));
    if (m.method !== 'Fetch.requestPaused') return;
    const rq = m.params.request, rid = m.params.requestId;
    const fulfill = (obj) => cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(obj)).toString('base64') }).catch(() => { });
    if (rq.method === 'POST' && !/\/api\/hunttimer/.test(rq.url)) { let b = null; try { b = JSON.parse(rq.postData || 'null'); } catch (e) { } posts.push({ url: rq.url, body: b }); return fulfill({ ok: true, intercepted: true, spots: {}, command: (b && b.cmd) || '', target: (b && b.target) || '' }); }
    if (rq.method === 'POST') { let b = null; try { b = JSON.parse(rq.postData || 'null'); } catch (e) { } posts.push({ url: rq.url, body: b }); }
    if (m.params.responseStatusCode === undefined) return cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { });
    try {
      const b = await cdp('Fetch.getResponseBody', { requestId: rid });
      let j = JSON.parse(b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body);
      if (/\/api\/state/.test(rq.url)) j = patchState(j);
      fulfill(j);
    } catch (e) { cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { }); }
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: true, onDialog: (d) => dialogs.push(d) });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/state*', requestStage: 'Response' }, { urlPattern: '*/api/*', requestStage: 'Request' }] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/parties` });
  ok(`Parties tab loads with party ${PARTY}`, await waitFor(`!!document.querySelector('[data-spotpick="${PARTY}"]')`, 30000));
  ok('HuntTimer + HuntLogic + uiForm are loaded', await ev(`!!(window.HuntTimer && window.HuntLogic && typeof uiForm === 'function')`));
  const shot = async (name) => { await sleep(500); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `hunttimer_${name}.png`), Buffer.from(r.data, 'base64')); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);

  // ---- 1) the popup itself (the test hook switched off for it: a real open dialog) ----
  await ev(`(window.__htAsk = (delete window.UIDIALOG_TEST, HuntTimer.ask(${JSON.stringify(PARTY)}, 'Catacomb of the Branded · any free room', { stay: false })), true)`);
  ok('popup opens (shared dialog)', await waitFor(`!!document.querySelector('.uid-ov .uid-seg')`, 5000));
  const pop = await ev(`(() => { const ov = document.querySelector('.uid-ov'); const opts = [...ov.querySelectorAll('.uid-opt span')]; return { title: ov.querySelector('h2').textContent, groups: ov.querySelectorAll('.uid-seg').length,
    labels: opts.map(s => s.textContent), minH: Math.min(...opts.map(s => s.getBoundingClientRect().height)), live: ov.querySelector('.uid-live').innerText, btns: [...ov.querySelectorAll('.uid-btn')].map(b => b.textContent),
    over: document.documentElement.scrollWidth > innerWidth + 1, cardW: ov.querySelector('.uid-card').getBoundingClientRect().width }; })()`);
  ok('two rows of choices: How long? + When the time is up', pop.groups === 2 && pop.labels.includes('Until I stop it') && pop.labels.includes('8 h') && pop.labels.includes('Go to town and wait') && pop.labels.includes('Town, supplies, come back') && pop.labels.includes('Keep hunting'), pop.labels.join(' | '));
  ok('big tap targets (>= 44 px)', pop.minH >= 43.5, String(pop.minH));
  ok('default "Until I stop it": per-hour use + "no timer" note', /about how much they use/i.test(pop.live) && /No timer/.test(pop.live), pop.live.slice(0, 160).replace(/\s+/g, ' '));
  ok('buttons: Cancel / Supply run first / Go there', pop.btns.join('|') === 'Cancel|Supply run first|Go there', pop.btns.join('|'));
  ok('no horizontal scroll at 390 px', !pop.over, String(pop.cardW));
  await shot('phone_popup_untilstop');
  await ev(`(() => { const r = [...document.querySelectorAll('.uid-ov input[type=radio]')].find(x => x.closest('.uid-opt').textContent === '4 h'); r.click(); return true; })()`);
  await sleep(150);
  const live4 = await ev(`document.querySelector('.uid-ov .uid-live').innerText`);
  ok('4 h chosen: the estimate redraws ("Supplies for 4 h") + the rules for the time', /Supplies for 4 h/i.test(live4) && /While the 4 h run/i.test(live4) && /clock starts when they arrive/.test(live4), live4.slice(0, 120).replace(/\s+/g, ' '));
  ok(`warning: ${PARTY} runs out of soulshots (900 at ~1,200 an hour)`, new RegExp(`${PARTY} runs out of Soulshot \\(D-Grade\\) after about 45 min`).test(live4), (live4.match(/runs out[^\n]*/) || [''])[0]);
  ok('Spirit Ore shown (a healer with Major Heal)', /Spirit Ore/.test(live4));
  await shot('phone_popup_4h');
  await ev(`(() => { [...document.querySelectorAll('.uid-ov .uid-btn')].find(b => b.textContent === 'Cancel').click(); return true; })()`);
  const cancelled = await ev(`window.__htAsk.then(v => v === null)`);
  ok('Cancel = nothing chosen (null)', cancelled === true);
  ok('nothing written by the popup alone', !fs.existsSync(HTF));
  await UID.set(ev, true);

  // ---- 2) a spot choice with 2 h + "Town, supplies, come back" ----
  await UID.set(ev, { values: { hours: 2, end: 'resupply' }, button: 'go' });
  await click(`[data-spotpick="${PARTY}"]`);
  await waitFor(`!!document.querySelector('#spotov .spotlist')`, 10000);
  await ev(`(() => { const a = document.getElementById('spkall'); if (a && !a.checked) { a.checked = true; a.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`);
  await waitFor(`!!document.querySelector('[data-spkdp]')`, 8000);
  const dpName = await ev(`document.querySelector('[data-spkdp]').dataset.spkdp`);
  dialogs.length = 0;
  await click('[data-spkdp]');
  ok('the spot choice saved (POST /api/partyspot, intercepted)', await waitFor(`true`, 10) && await (async () => { for (let i = 0; i < 60; i++) { if (posts.some(p => /\/api\/partyspot/.test(p.url) && p.body && p.body.spot === dpName)) return true; await sleep(100); } return false; })());
  for (let i = 0; i < 60 && !readTimers(HTF); i++) await sleep(100);
  let T = readTimers(HTF), e = T && T.parties && T.parties[PARTY];
  ok('timer written: 2 h, Town + supplies + come back, from arrival, the spot label', e && e.hours === 2 && e.endAction === 'resupply' && e.from === 'arrival' && /\(datapack spot\)/.test(e.spot), JSON.stringify(e || null).slice(0, 160));
  const fa = dialogs.find(d => d.type === 'form-answer');
  ok('the popup was the confirmation (no extra "Go there?" dialog)', dialogs.some(d => d.type === 'form') && !dialogs.some(d => d.type === 'confirm' && /Hunting spot for party/.test(d.title)), dialogs.map(d => d.type + ':' + d.title).join(' | '));
  ok('its estimate for 2 h', fa && /Supplies for 2 h/.test(fa.msg) && /runs out of Soulshot/.test(fa.msg), fa ? fa.msg.slice(0, 120).replace(/\s+/g, ' ') : 'none');
  ok('nothing sent to the party (no Supply run first)', !posts.some(p => /\/api\/command/.test(p.url)));
  // ---- 3) the party card line ----
  await ev(`(HuntTimer.load(true), true)`); await sleep(800); await ev(`(renderParties(), true)`).catch(() => { });
  ok('party card: "⏱ 2 h at … — the clock starts when they arrive" + Extend / End now', await waitFor(`(() => { const c = document.querySelector('[data-spotpick="${PARTY}"]').closest('.spotline'); const h = c && c.querySelector('.htchip'); return !!(h && /2 h at .* the clock starts when they arrive/.test(h.textContent) && c.querySelector('[data-htext]') && c.querySelector('[data-htend]')); })()`, 8000),
    await ev(`(() => { const h = document.querySelector('.htchip'); return h ? h.textContent : 'no chip'; })()`));
  await ev(`(() => { const c = document.querySelector('[data-spotpick="${PARTY}"]').closest('.win') || document.querySelector('.htchip'); c.scrollIntoView({ block: 'start' }); return true; })()`);
  await shot('phone_card');
  ok('party card: no horizontal scroll', !(await ev(`document.documentElement.scrollWidth > innerWidth + 1`)));
  // ---- 4) Extend +2 h, End now ----
  await click(`[data-htext="${PARTY}"]`);
  for (let i = 0; i < 50; i++) { T = readTimers(HTF); if (T && T.parties[PARTY].hours === 4) break; await sleep(100); }
  ok('Extend: +2 h (the primary choice) -> 4 h, same timer id', T.parties[PARTY].hours === 4 && T.parties[PARTY].id === e.id, `${T.parties[PARTY].hours} h`);
  await click(`[data-htend="${PARTY}"]`);
  for (let i = 0; i < 50; i++) { T = readTimers(HTF); if (T && T.parties[PARTY].endNow) break; await sleep(100); }
  ok('End now: the time is stamped (the leader runs the end action within 15 s)', !!T.parties[PARTY].endNow);
  // ---- 5) Supply run first ----
  await UID.set(ev, { values: { hours: 3, end: 'town' }, button: 'supply' });
  await click(`[data-spotpick="${PARTY}"]`); await waitFor(`!!document.querySelector('[data-spkdp]')`, 8000);
  await click('[data-spkdp]');
  ok('"Supply run first": !supply sent to the party (intercepted)', await (async () => { for (let i = 0; i < 60; i++) { if (posts.some(p => /\/api\/command/.test(p.url) && p.body && p.body.cmd === '!supply' && p.body.target === 'party:' + PARTY)) return true; await sleep(100); } return false; })());
  T = readTimers(HTF);
  ok('... and the 3 h timer is set (go to town and wait)', T.parties[PARTY].hours === 3 && T.parties[PARTY].endAction === 'town' && T.parties[PARTY].id !== e.id);
  // ---- 6) Until I stop it / Back to auto ----
  await UID.set(ev, { values: { hours: 'stop' }, button: 'go' });
  await click(`[data-spotpick="${PARTY}"]`); await waitFor(`!!document.querySelector('[data-spkdp]')`, 8000);
  await click('[data-spkdp]');
  for (let i = 0; i < 50; i++) { T = readTimers(HTF); if (T && !T.parties[PARTY]) break; await sleep(100); }
  ok('"Until I stop it": the timer is removed (today\'s behaviour)', T && !T.parties[PARTY]);
  await UID.set(ev, { values: { hours: 1 }, button: 'go' });
  await click(`[data-spotpick="${PARTY}"]`); await waitFor(`!!document.querySelector('[data-spkdp]')`, 8000); await click('[data-spkdp]');
  for (let i = 0; i < 50; i++) { T = readTimers(HTF); if (T && T.parties[PARTY]) break; await sleep(100); }
  await UID.set(ev, true);
  await ev(`(HuntTimer.load(true), true)`); await sleep(500);
  await click(`[data-spotpick="${PARTY}"]`); await waitFor(`!!document.querySelector('[data-spkauto]')`, 8000); await click('[data-spkauto]');
  for (let i = 0; i < 50; i++) { T = readTimers(HTF); if (T && !T.parties[PARTY]) break; await sleep(100); }
  ok('Back to auto: the timer is removed too', T && !T.parties[PARTY]);
  ok('no page errors', !errors.length, errors.slice(0, 2).join(' ; '));
  ok('the live Scripts/data/hunt_timers.json was never touched', liveSt() === LIVE0);
  ok('no MCP call that changes anything', !mcp.some(l => !/get_accounts_status|get_account_status|get_account_data/.test(l)), mcp.filter(l => !/get_accounts_status/.test(l)).slice(0, 3).join(' ; '));
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  console.log(fails ? `\n${fails} check(s) FAILED — screenshots in ${OUT}` : `\nall checks passed — screenshots in ${OUT}`); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
