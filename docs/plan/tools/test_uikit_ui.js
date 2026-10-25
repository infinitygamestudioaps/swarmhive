// UI KIT + PLAIN WORDS (UX audit 2026-10-13, batches B1 B3 B4 B5): headless browser check (Edge via CDP) against the SANDBOX server
// (cmdcenter_testserver.js: mocked MCP, nothing reaches the game; real Logs/*.json read-only). iPhone 390x844 (+ one desktop check).
//   B1  /ui_kit.css + /ui_kit.js + /plainwords.js served; window.UIKit + window.Plain; the Simple / Advanced switch under the title
//   B3  character page + Live view in Simple: plain step lines (no coordinates / ids / #nnn / !commands / step codes), login + coordinates
//       hidden, header buttons never break inside a word; Advanced: the raw timeline is back
//   B4  Orders sheet: identical results grouped, no "FAILED" shouting, a !stop interrupted by a restart reads "stays stopped"
//   B5  commands sheet in Simple: plain player actions only (no !syntax, no Legacy / Debug / L2Swarm groups); "stuck" finds a way out
//   node docs/plan/tools/test_uikit_ui.js [screenshot dir]     (default: %TEMP%\uikit_shots — never the repo)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'uikit_shots');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const RAW = String.raw`-?\d{3,7},\s?-?\d{3,7}|(?:^|[\s(])#\d{2,}|\(P\d\)|(?:^|[\s(])![a-z]{3,}|\b[A-Z]{2,}_[A-Z]{2,}\b|_m[a-z0-9]{6,}\b|\.json\b`;

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let PORT = 0; const mcpLog = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'uik-edge-'));
  const DBG = 9300 + Math.floor(Math.random() * 500);
  const br = cp.spawn(EDGE, ['--headless=new', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [];
  sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(200); } return false; };
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `after_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: false }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: false, uiMode: null });   // this test switches the view itself   // every question is answered "Cancel": nothing is ever sent
  const BASE = `http://127.0.0.1:${PORT}/`;
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);
  const setMode = async (m) => { await ev(`(() => { try { localStorage.setItem('swarm.uimode', ${JSON.stringify(m)}); } catch (e) { } if (window.UIKit) UIKit.setMode(${JSON.stringify(m)}); return true; })()`); await sleep(400); };

  // ===================== B1 =====================
  for (const f of ['ui_kit.css', 'ui_kit.js', 'plainwords.js']) { const r = await fetch(BASE + f); ok(`B1: /${f} is served (${r.status})`, r.ok); }
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  ok('B1: window.UIKit + window.Plain load', await waitFor(`!!window.UIKit && !!window.Plain`, 25000), await ev(`JSON.stringify({ kit: !!window.UIKit, plain: !!window.Plain })`));
  await waitFor(`!!(window.STATE && STATE.chars && STATE.chars.length)`, 40000);
  await setMode('simple');
  await cdp('Page.navigate', { url: BASE + '#/parties' }); await waitFor(`!!window.UIKit && !!window.Plain && !!(window.STATE && STATE.chars && STATE.chars.length)`, 25000);
  ok('B1: the Simple / Advanced switch sits under the title', await waitFor(`!!document.querySelector('header .uk-mode[data-ukmount] button[data-ukmode="advanced"]')`, 8000));
  ok('B1: Simple view after the reload (html.uk-simple)', await ev(`document.documentElement.classList.contains('uk-simple') && UIKit.mode() === 'simple'`));
  await ev(`document.querySelector('header .uk-mode button[data-ukmode="advanced"]').click()`); await sleep(300);
  ok('B1: tapping "Advanced" switches the view (html.uk-adv, remembered)', await ev(`document.documentElement.classList.contains('uk-adv') && localStorage.getItem('swarm.uimode') === 'advanced'`));
  await ev(`document.querySelector('header .uk-mode button[data-ukmode="simple"]').click()`); await sleep(300);
  ok('B1: components render (switch, chip, empty, toast)', await ev(`(() => { const d = document.createElement('div'); d.innerHTML = UIKit.switchHtml({ on: false, label: 'Test' }) + UIKit.chip('problem', 'x') + UIKit.empty({ text: 'none' }); return /nothing happens until you switch it on/.test(d.textContent) && !!d.querySelector('[role=switch][aria-checked=false]') && !!d.querySelector('.uk-chip.k-problem') && !!d.querySelector('.uk-empty'); })()`));
  ok('B1: phone text is larger (body 14 px)', await ev(`getComputedStyle(document.documentElement).getPropertyValue('--fs-body').trim() === '14px'`), await ev(`getComputedStyle(document.documentElement).getPropertyValue('--fs-body')`));
  ok('B1: no horizontal page scroll (Parties)', await noScroll());

  // pick a live character + its party
  const who = await ev(`(() => { const c = (STATE.chars || []).filter(c => c.ageSec <= 120).sort((a, b) => (b.name === b.party) - (a.name === a.party))[0] || STATE.chars[0]; return { name: c.name, party: c.party || c.name }; })()`);

  // ===================== B3: character page =====================
  await cdp('Page.navigate', { url: BASE + '#/char/' + encodeURIComponent(who.name) });
  ok(`B3: character page ${who.name} opens with its plain timeline`, await waitFor(`!!document.querySelector('#cp_timeline .cp-ptl')`, 25000), await ev(`(document.getElementById('cp_timeline') || {}).innerText || 'none'`).then(t => String(t).slice(0, 80)));
  const tl = await ev(`[...document.querySelectorAll('#cp_timeline .cp-ptl .pw, #cp_timeline .cp-ptl .pwhy, #cp_timeline .cp-ptl .pres')].filter(e => e.offsetParent).map(e => e.innerText).join('\\n')`);
  ok('B3: no raw text in the Simple timeline', !new RegExp(RAW).test(tl), (tl.match(new RegExp(RAW)) || [''])[0] + ' … ' + tl.slice(0, 160));
  ok('B3: the account login and coordinates are hidden in Simple', await ev(`[...document.querySelectorAll('#cpHead [data-adv]')].every(e => !e.offsetParent)`));
  ok('B3: header buttons never break inside a word (each one ≤ 2 lines)', await ev(`[...document.querySelectorAll('#cpHead .cp-acts > button')].filter(b => b.offsetParent).every(b => b.getBoundingClientRect().height <= 60)`), await ev(`[...document.querySelectorAll('#cpHead .cp-acts > button')].map(b => b.innerText.replace(/\\s+/g,' ') + ':' + Math.round(b.getBoundingClientRect().height)).join(', ')`));
  ok('B3: no horizontal page scroll (character page)', await noScroll());
  await ev('window.scrollTo(0, 0)'); await shot('char_top_simple');
  await ev(`document.getElementById('cp_timeline').scrollIntoView()`); await sleep(300); await shot('char_timeline_simple');
  await setMode('advanced'); await sleep(600);
  ok('B3: Advanced shows the raw timeline again (coordinates option)', await waitFor(`!!document.querySelector('#cp_timeline [data-tl="xy"]') && !document.querySelector('#cp_timeline .cp-ptl')`, 6000));
  await setMode('simple');

  // ===================== B3: Live view =====================
  await cdp('Page.navigate', { url: BASE + '#/live/' + encodeURIComponent(who.party) });
  ok(`B3: Live view of party ${who.party} opens`, await waitFor(`document.querySelectorAll('#lpCards .lpm').length >= 1`, 25000));
  await sleep(1500);
  const lpt = await ev(`[...document.querySelectorAll('#lpCards .tl5 .w')].map(e => e.innerText).join('\\n')`);
  ok('B3: Live cards show plain steps', !new RegExp(RAW).test(lpt), (lpt.match(new RegExp(RAW)) || [''])[0] + ' … ' + lpt.slice(0, 160));
  ok('B3: "monsters: mcp" is gone from the Simple header', await ev(`!/monsters: /.test(document.getElementById('lpSum').innerText)`), await ev(`document.getElementById('lpSum').innerText`));
  await ev('window.scrollTo(0, 0)'); await shot('live_simple');

  // ===================== B4: Orders =====================
  await cdp('Page.navigate', { url: BASE + '#/parties' }); await waitFor(`!!window.OrdersView && !!window.Plain && !!(window.STATE && STATE.chars && STATE.chars.length)`, 25000);
  // the sandbox has no order queue (its timers are off): the page gets the REAL 2026-10-13 17:39 case as a fixture — "!stop" to a
  // 9-character party, every recipient "failed" with "swarm.js restarted while it ran" (Logs/orders/<name>.state.json), plus a mixed order
  await ev(`(() => {
    const names = STATE.chars.filter(c => (c.party || c.name) === ${JSON.stringify(who.party)}).map(c => c.name).concat(['Extra1', 'Extra2', 'Extra3', 'Extra4', 'Extra5', 'Extra6', 'Extra7', 'Extra8']).slice(0, 9);
    const why = 'swarm.js restarted while it ran - not run again (a town trip still on the way resumes by itself); send it again if it is still needed';
    const now = Date.now();
    const FIX = { enabled: true, now, pending: {}, orders: [
      { id: 'otest1stop0001', cmd: '!stop', label: 'party ${who.party}', at: now - 60000, state: 'failed', recipients: names.map(n => ({ name: n, state: 'failed', why, how: 'running - it holds until it is done' })) },
      { id: 'otest2levl0002', cmd: '!level', label: 'party ${who.party}', at: now - 30000, state: 'pending', until: now + 600000, recipients: names.map((n, i) => i < 2 ? { name: n, state: 'queued', pending: true, waiting: true, why: 'logging in / not in the game yet' } : i < 4 ? { name: n, state: 'superseded', why: 'replaced by !stop before it ran (!stop clears the pending orders)' } : { name: n, state: 'done', why: 'done: regroup in Giran before leveling' }) },
    ] };
    const rf = window.fetch; window.fetch = (u, o) => /\\/api\\/orders/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify(FIX), { status: 200, headers: { 'Content-Type': 'application/json' } })) : rf(u, o);
    return true; })()`);
  await ev(`OrdersView.open('all')`);
  ok('B4: the Orders sheet opens', await waitFor(`!!document.querySelector('#ordOv .ordwin') && !/loading/.test(document.querySelector('#ordOv').innerText)`, 15000));
  const ot = await ev(`document.getElementById('ordOv').innerText`);
  ok('B4: no shouting "FAILED" and no raw bot reason in Simple', !/FAILED|swarm\.js restarted|older than \d+ min when I could read/.test(ot), ot.slice(0, 200));
  ok('B4: the stopped party reads "Stop · done · all 9 · it stays stopped" (one line, not 9)', await ev(`(() => { const r = [...document.querySelectorAll('#ordOv .ordrow')].find(r => (r.querySelector('.ordttl') || {}).innerText === 'Stop'); return !!r && r.querySelectorAll('.ordgrp').length === 1 && /done/.test(r.innerText) && /all 9/.test(r.innerText) && /stays stopped/.test(r.innerText); })()`), await ev(`[...document.querySelectorAll('#ordOv .ordrow')].map(r => r.innerText.replace(/\s+/g, ' ')).join(' || ')`));
  ok('B4: a mixed order = one line per outcome (waiting / replaced / done)', await ev(`(() => { const r = [...document.querySelectorAll('#ordOv .ordrow')].find(r => (r.querySelector('.ordttl') || {}).innerText === 'Leveling'); return !!r && r.querySelectorAll('.ordgrp').length === 3 && /waiting until the character is in the game/.test(r.innerText) && /replaced by “Stop”|replaced by "Stop"/.test(r.innerText); })()`));
  await shot('orders_simple');
  await ev(`OrdersView.close()`);
  ok('B4: Plain.order turns a !stop cut by a restart into "stays stopped"', await ev(`/stays stopped/.test(Plain.order('swarm.js restarted while it ran - not run again', 'failed', '!stop'))`));

  // ===================== B5: commands sheet =====================
  await ev(`(() => { const b = document.querySelector('[data-cmdsheet="party:${who.party}"]'); if (b) { b.click(); return true; } return false; })()`);
  ok('B5: the party commands sheet opens', await waitFor(`!!document.querySelector('.cctile')`, 10000));
  const sheet = await ev(`({ tiles: [...document.querySelectorAll('.cctile')].map(t => t.innerText), cats: [...document.querySelectorAll('.cccat summary')].map(s => s.innerText) })`);
  ok(`B5: Simple sheet = plain player actions (${sheet.tiles.length} tiles)`, sheet.tiles.length >= 10 && sheet.tiles.length <= 40, sheet.tiles.length + '');
  ok('B5: no !command / /command syntax on the tiles', sheet.tiles.every(t => !/(^|\s)[!/][a-z]/.test(t)), sheet.tiles.filter(t => /(^|\s)[!/][a-z]/.test(t)).slice(0, 3).join(' | '));
  ok('B5: no Legacy / Debug / L2Swarm-program groups', sheet.cats.every(c => !/Legacy|Debug|PC \/ L2Swarm|Bot control/.test(c)), sheet.cats.join(' | '));
  await shot('commands_simple');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(300);
  // search "stuck"
  await ev(`(() => { const b = document.getElementById('ccTrig'); if (b) b.click(); return !!b; })()`);
  await waitFor(`!!document.querySelector('#ccQ, .ccq input, input.ccq')`, 5000);
  await ev(`(() => { const i = document.querySelector('#ccQ, .ccq input, input.ccq'); i.value = 'stuck'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); await sleep(500);
  const found = await ev(`[...document.querySelectorAll('.ccrow b')].map(b => b.innerText)`);
  ok('B5: searching "stuck" offers a gentle way out first (Back to town / Free teleport)', /Back to town|Free teleport/.test(found.slice(0, 3).join(' | ')), found.slice(0, 5).join(' | '));
  ok('B5: no keyboard hints on a phone', await ev(`!/Enter open|Esc close/.test((document.querySelector('.ccfoot') || document.body).innerText)`));
  await shot('search_stuck_simple');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);

  ok('no browser alert / confirm / prompt was used', !browserDialogs.length, browserDialogs.join(','));
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  const writes = mcpLog.filter(l => /^MCP (run_account_command|send_game_action|close_account|open_account|manage_)/.test(l));
  ok('no game command reached even the mock MCP', !writes.length, writes.slice(0, 3).join(' | '));
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
