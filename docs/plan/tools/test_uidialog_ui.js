// UIDIALOG (2026-10-10): headless check of the ONE shared dashboard dialog (Dashboard/uidialog.js + .css) that replaced every browser
// confirm() / alert() / prompt(). Edge via CDP against the SANDBOX server (cmdcenter_testserver.js: mocked MCP, never the live
// dashboard on 8090, never the game) bound to this PC's LAN address, so every request is a NON-local one and server.js's key check
// really applies (the phone-over-LAN case). Scratch class-plan file (SWARM_CLASSPLANS_FILE); every POST /api/command is intercepted.
// Checks: class-plan approval (structured), command-center destructive confirm with typed YES, a Kamaloka confirmOrder (+ its fallback),
// an error alert (escaping), prompts with validation, Esc / backdrop / Enter / Tab trap / focus return / aria / queue / reduced motion,
// cancel changes nothing; screenshots at iPhone 390x844 and desktop 1366x900.
//   node docs/plan/tools/test_uidialog_ui.js [screenshot dir]     (default: %TEMP%\uidialog_shots — never the repo)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'uidialog_shots');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const LAN = (Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal) || {}).address || '';
const KEY = (() => { try { return fs.readFileSync(path.join(ROOT, 'Dashboard', 'key.txt'), 'utf8').trim(); } catch (e) { return ''; } })();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'uidui-'));
  const PFILE = path.join(TMP, 'class_plans.json');
  fs.copyFileSync(path.join(ROOT, 'Scripts', 'data', 'class_plans.migrated.json'), PFILE);
  const LIVE = path.join(ROOT, 'Scripts', 'data', 'class_plans.json'); const liveSt = () => { try { const s = fs.statSync(LIVE); return s.size + ':' + s.mtimeMs; } catch (e) { return 'absent'; } }; const LIVE0 = liveSt();
  const HOST = LAN || '127.0.0.1';
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_CLASSPLANS_FILE: PFILE, SANDBOX_HOST: HOST }) });
  let PORT = 0; const mcpLog = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const ORIGIN = `http://${HOST}:${PORT}`;

  // ===================== 0) LAN access: the dialog files are public (before the key check), the page itself needs the key =====================
  console.log(`--- LAN access via ${ORIGIN} (non-local: the key check applies)${LAN ? '' : ' — NO LAN ADDRESS FOUND, loopback only'}`);
  const st = async (p) => { try { const r = await fetch(ORIGIN + p); return r.status + ' ' + (r.headers.get('content-type') || ''); } catch (e) { return 'ERR ' + e.message; } };
  const sJs = await st('/uidialog.js'), sCss = await st('/uidialog.css'), sPage = await st('/'), sPageKey = KEY ? await st('/?key=' + encodeURIComponent(KEY)) : 'no key.txt';
  ok('LAN: /uidialog.js without key = 200 javascript', /^200 text\/javascript/.test(sJs), sJs);
  ok('LAN: /uidialog.css without key = 200 css', /^200 text\/css/.test(sCss), sCss);
  ok('LAN: the key check really applies here (/ without key = 401)', /^401/.test(sPage), sPage);
  ok('LAN: / with ?key = 200 html', /^200 text\/html/.test(sPageKey), sPageKey.replace(KEY, '***'));

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'uid-edge-'));
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
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(120); } return false; };
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `uidialog_${name}.png`), Buffer.from(r.data, 'base64')); };
  const native = [], errors = [], posts = [], failed = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { native.push(m.params.type + ': ' + m.params.message.slice(0, 80)); cdp('Page.handleJavaScriptDialog', { accept: false }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method === 'Network.responseReceived' && m.params.response.status === 401) failed.push(m.params.response.url.replace(KEY, '***'));
    if (m.method === 'Fetch.requestPaused') {
      const rq = m.params.request; let b = {}; try { b = JSON.parse(rq.postData || '{}'); } catch (e) { }
      if (rq.method === 'POST' && /\/api\/command(\?|$)/.test(rq.url) && !b.dryRun) {          // a REAL order: never forwarded
        posts.push(b);
        const body = JSON.stringify({ ok: true, command: b.cmd || b.text, target: (b.targets || [b.target]).join(' + ') + ' (intercepted by the test)', sent: 1, sends: [{ to: 'test', ok: true }] });
        cdp('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(body).toString('base64') }).catch(() => { });
      } else cdp('Fetch.continueRequest', { requestId: m.params.requestId }).catch(() => { });
    }
  });
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
  const BASE = `${ORIGIN}/?key=${encodeURIComponent(KEY)}`;
  const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); };
  const desktop = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const key = async (k, extra = {}) => {   // a REAL key press (native button activation, focus moves)
    const codes = { Enter: 13, Escape: 27, Tab: 9 }; const base = { key: k, code: k, windowsVirtualKeyCode: codes[k], nativeVirtualKeyCode: codes[k], modifiers: extra.shift ? 8 : 0 };
    await cdp('Input.dispatchKeyEvent', Object.assign({ type: 'rawKeyDown' }, base));
    if (k === 'Enter') await cdp('Input.dispatchKeyEvent', Object.assign({ type: 'char', text: '\r' }, base));
    await cdp('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
  };
  const typeText = async (sel, text) => { await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.select && e.select(); return true; })()`); await cdp('Input.insertText', { text }); };
  const tapAt = async (x, y) => { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
  const open = () => waitFor(`document.querySelectorAll('.uid-ov').length === 1 && !document.querySelector('.uid-ov.uid-out')`, 8000);
  const closed = () => waitFor(`!document.querySelector('.uid-ov')`, 4000);
  const dlg = () => ev(`(() => { const o = document.querySelector('.uid-ov'); if (!o) return null; const c = o.querySelector('.uid-card'), t = document.getElementById(c.getAttribute('aria-labelledby')), d = document.getElementById(c.getAttribute('aria-describedby'));
    const r = c.getBoundingClientRect(), f = o.querySelector('.uid-foot').getBoundingClientRect(), a = document.activeElement;
    return { role: c.getAttribute('role'), modal: c.getAttribute('aria-modal'), title: t && t.textContent, desc: !!(d && d.textContent.trim()), text: c.innerText,
      btns: [...o.querySelectorAll('.uid-btn')].map(b => ({ t: b.textContent, prim: b.classList.contains('uid-primary'), red: b.classList.contains('uid-red'), dis: b.disabled, h: Math.round(b.getBoundingClientRect().height), x: Math.round(b.getBoundingClientRect().left), y: Math.round(b.getBoundingClientRect().top) })),
      card: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), b: Math.round(r.bottom) }, foot: Math.round(f.bottom), vw: innerWidth, vh: innerHeight,
      focusIn: c.contains(a), focus: a && (a.textContent || a.tagName), path: [...o.querySelectorAll('.uid-pathp .uid-step')].map(s => s.textContent), list: [...o.querySelectorAll('.uid-list li')].map(l => l.textContent),
      warn: [...o.querySelectorAll('.uid-warn')].map(w => w.textContent), input: !!o.querySelector('.uid-in'), err: (o.querySelector('.uid-err') || {}).textContent || '', bodyScroll: getComputedStyle(o.querySelector('.uid-body')).overflowY }; })()`);
  const file = () => JSON.parse(fs.readFileSync(PFILE, 'utf8'));
  const btnBy = (txt) => `[...document.querySelectorAll('.uid-ov .uid-btn')].find(b => b.textContent === ${JSON.stringify(txt)})`;

  // ===================== 1) iPhone: class-plan approval =====================
  await phone();
  await cdp('Page.navigate', { url: BASE + '#/classes/Tank2' });
  ok('page loads over the LAN with ?key (classes, party Tank2)', await waitFor(`!!window.uiConfirm && document.querySelectorAll('.cpl-mrow[data-cpname]').length === 9`, 30000), await ev(`document.querySelectorAll('.cpl-mrow[data-cpname]').length + ' rows'`).catch(e => e.message));
  ok('uidialog.css is applied (the overlay rule exists)', await ev(`[...document.styleSheets].some(s => { try { return /uidialog\\.css/.test(s.href || '') && s.cssRules.length > 20; } catch (e) { return false; } })`));
  await click('.cpl-mrow[data-cpname="Nuker1"] [data-cpact="pick"]');
  await waitFor(`!document.getElementById('cpSheet').hidden && document.querySelectorAll('.cpl-col').length === 3`);
  await click('.cpl-opt[data-cpstep="2"][data-cpid="27"]'); await sleep(250);
  const before = JSON.stringify((file().parties.Tank2.members || {}).Nuker1 || null);
  await click('[data-cpact="saveApprove"]');
  ok('Save & approve opens the shared dialog (not a browser confirm)', await open() && !native.length);
  await sleep(350);
  let d = await dlg();
  ok('title "Approve class plan", role=dialog aria-modal, labelled + described', d.title === 'Approve class plan' && d.role === 'dialog' && d.modal === 'true' && d.desc, `${d.title} / ${d.role} / ${d.modal}`);
  ok('the class path is a highlighted path (… Elven Wizard › Spellsinger › Mystic Muse)', d.path.slice(-3).join(' › ') === 'Elven Wizard › Spellsinger › Mystic Muse', d.path.join(' › '));
  ok('"What happens" is a list with the levels', /What happens/i.test(d.text) && d.list.some(l => /^at level 40: Spellsinger/.test(l)) && d.list.some(l => /^at level 76: Mystic Muse/.test(l)), d.list.join(' | '));
  ok('who orders it + where + fee rows', /Who orders it/.test(d.text) && /party leader Tank2/.test(d.text) && /Community Board/.test(d.text), d.text.split('\n').filter(l => /orders|Fee|Where/.test(l)).join(' | '));
  ok('"cannot be undone" is a warning line', d.warn.some(w => /cannot be undone/.test(w)));
  ok('buttons "Cancel" | "Approve plan", primary on the right', d.btns.map(b => b.t).join('|') === 'Cancel|Approve plan' && d.btns[1].prim && d.btns[1].x > d.btns[0].x, JSON.stringify(d.btns.map(b => [b.t, b.x])));
  ok('phone: bottom sheet (full width, at the bottom), buttons visible, tap targets >= 44 px', d.card.w === d.vw && Math.abs(d.card.b - d.vh) <= 2 && d.foot <= d.vh && d.btns.every(b => b.h >= 44), JSON.stringify(d.card) + ' btn h ' + d.btns.map(b => b.h));
  ok('focus is inside the dialog (on the primary button)', d.focusIn && d.focus === 'Approve plan', d.focus);
  ok('the opener (Save & approve) is disabled while it is open', await ev(`document.querySelector('[data-cpact="saveApprove"]').disabled === true`));
  await shot('phone_01_class_approve');
  // Tab trap
  await key('Tab'); await key('Tab'); await key('Tab');
  ok('Tab stays inside the dialog (focus trap)', await ev(`document.querySelector('.uid-card').contains(document.activeElement)`));
  await key('Tab', { shift: true }); await key('Tab', { shift: true });
  ok('Shift+Tab stays inside too', await ev(`document.querySelector('.uid-card').contains(document.activeElement)`));
  // Esc = cancel; the picker behind stays open (Esc did not reach it); nothing saved; focus back to the opener
  await key('Escape');
  ok('Esc closes the dialog', await closed());
  ok('Esc did not reach the picker behind it (still open)', await ev(`!document.getElementById('cpSheet').hidden`));
  ok('cancel changed nothing (scratch file)', JSON.stringify((file().parties.Tank2.members || {}).Nuker1 || null) === before, before);
  ok('focus went back to the opener, which is enabled again', await ev(`(() => { const b = document.querySelector('[data-cpact="saveApprove"]'); return document.activeElement === b && !b.disabled; })()`), await ev(`document.activeElement && (document.activeElement.dataset.cpact || document.activeElement.tagName)`));
  // backdrop = cancel
  await click('[data-cpact="saveApprove"]'); await open(); await sleep(600);
  await tapAt(195, 40);   // above the bottom sheet = the backdrop
  ok('backdrop tap closes it (cancel), nothing saved', await closed() && JSON.stringify((file().parties.Tank2.members || {}).Nuker1 || null) === before);
  // a double tap on the opener does NOT cancel at once (the second tap lands on the backdrop within 450 ms)
  await click('[data-cpact="saveApprove"]'); await open(); await tapAt(195, 40); await sleep(150);
  ok('a quick second tap on the backdrop (double tap) does not close it', await ev(`!!document.querySelector('.uid-ov')`));
  // Enter = confirm (focused primary button)
  await sleep(400); await ev(`${btnBy('Approve plan')}.focus()`); await key('Enter');
  ok('Enter confirms: the plan is saved APPROVED in the scratch file', await closed() && await waitFor(`true`) && (() => { const m = file().parties.Tank2.members.Nuker1; return m && m.approved === true && JSON.stringify(m.plan) === '[26,27,103]'; })(), JSON.stringify(file().parties.Tank2.members.Nuker1 || null));

  // ===================== 2) iPhone: prompt with validation (class page "Save party as template…") =====================
  await waitFor(`!!document.querySelector('[data-cpact="saveTpl"]')`, 8000);
  const tplN0 = Object.keys(file().templates || {}).length;
  await click('[data-cpact="saveTpl"]'); await open(); await sleep(350);
  d = await dlg();
  ok('prompt: field prefilled "Party Tank2 plan", focus in the field', d.input && await ev(`document.activeElement.classList.contains('uid-in') && document.activeElement.value === 'Party Tank2 plan'`));
  await typeText('.uid-in', ' '); await ev(`(() => { const i = document.querySelector('.uid-in'); i.value = ''; i.dispatchEvent(new Event('input')); return true; })()`); await sleep(100);
  await typeText('.uid-in', '   '); await sleep(100);
  d = await dlg();
  ok('validation: blank name -> error text + "Save template" disabled', /Give it a name/.test(d.err) && d.btns.find(b => b.t === 'Save template').dis, d.err);
  await key('Enter'); await sleep(200);
  ok('Enter does nothing while invalid', await ev(`!!document.querySelector('.uid-ov')`));
  await shot('phone_02_prompt_invalid');
  await ev(`(() => { const i = document.querySelector('.uid-in'); i.value = ''; return true; })()`); await typeText('.uid-in', 'UI dialog test <b>tpl</b>'); await sleep(100);
  d = await dlg();
  ok('valid name -> no error, button enabled', !d.err && !d.btns.find(b => b.t === 'Save template').dis);
  await key('Enter');
  ok('Enter submits: the template is saved (scratch file)', await closed() && await waitFor(`true`) && await (async () => { for (let i = 0; i < 30; i++) { const T = file().templates || {}; if (Object.values(T).some(t => t && t.name === 'UI dialog test <b>tpl</b>')) return true; await sleep(150); } return false; })(), `${tplN0} -> ${Object.keys(file().templates || {}).length}`);

  // ===================== 3) iPhone: command center, destructive confirm + typed YES =====================
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  await waitFor(`!!window.CmdCenter && document.querySelectorAll('.mem2').length > 5`, 30000);
  await sleep(800);
  posts.length = 0;
  await ev(`CmdCenter.openCommand('b_unstuck', 'char:Bishop1')`); await sleep(700);
  await click('[data-ccsend]'); await open(); await sleep(350);
  d = await dlg();
  ok('step 1: the order confirm (who + command), Send on the right', /Bishop1/.test(d.text) && /\/unstuck/.test(d.text) && d.btns.map(b => b.t).join('|') === 'Cancel|Send', d.btns.map(b => b.t).join('|'));
  await shot('phone_03_cmd_confirm');
  await ev(`${btnBy('Cancel')}.click()`); await closed(); await sleep(300);
  ok('Cancel at step 1 = nothing sent', posts.length === 0);
  await click('[data-ccsend]'); await open(); await sleep(350);
  await ev(`${btnBy('Send')}.click()`);
  await waitFor(`!!document.querySelector('.uid-ov .uid-ttc')`, 6000); await sleep(350);
  d = await dlg();
  ok('step 2: DESTRUCTIVE dialog with a "Type YES" field, red button disabled', /DESTRUCTIVE/.test(d.title) && d.input && d.btns.some(b => b.red && b.dis), JSON.stringify(d.btns));
  ok('danger dialog: focus starts in the YES field', await ev(`document.activeElement.classList.contains('uid-in')`));
  await key('Escape'); await sleep(250);
  ok('danger dialog: Esc does not dismiss it', await ev(`!!document.querySelector('.uid-ov')`));
  await sleep(500); await tapAt(195, 30); await sleep(250);
  ok('danger dialog: backdrop tap does not dismiss it', await ev(`!!document.querySelector('.uid-ov')`));
  await typeText('.uid-in', 'yes'); await sleep(100);
  ok('"yes" (lower case) does not unlock it', (await dlg()).btns.find(b => b.red).dis);
  await shot('phone_04_destructive_locked');
  await ev(`(() => { const i = document.querySelector('.uid-in'); i.value = ''; return true; })()`); await typeText('.uid-in', 'YES'); await sleep(100);
  d = await dlg();
  ok('"YES" unlocks the red button', !d.btns.find(b => b.red).dis);
  await shot('phone_05_destructive_yes');
  await key('Enter');
  ok('Enter in the YES field sends it: ONE POST with confirmDanger (intercepted)', await closed() && await waitFor(`true`) && posts.length === 1 && posts[0].cmd === '/unstuck' && posts[0].confirmDanger === true, JSON.stringify(posts[0] || {}));
  await sleep(600); try { await ev(`CmdCenter.close()`); } catch (e) { }

  // ===================== 4) iPhone: Kamaloka confirmOrder (+ the kamapage fallback when confirmOrder throws) =====================
  await cdp('Page.navigate', { url: BASE + '#/kamaloka' });
  const hasRun = await waitFor(`!!window.KamaPage && !!document.querySelector('[data-kprun]')`, 30000);
  ok('Kamaloka page has a Run button (real sandbox data)', hasRun);
  if (hasRun) {
    posts.length = 0;
    await click('[data-kprun]'); await open(); await sleep(350);
    d = await dlg();
    ok('Run -> confirmOrder dialog "Order for party …" with the command', /^Order for party /.test(d.title) && /!mission kamaloka \d+/.test(d.text) && d.btns.map(b => b.t).join('|') === 'Cancel|Send order', d.title + ' / ' + d.btns.map(b => b.t).join('|'));
    await shot('phone_06_kama_confirmorder');
    await ev(`${btnBy('Cancel')}.click()`); await closed(); await sleep(400);
    ok('Cancel = nothing sent', posts.length === 0);
    await ev(`window.__co = window.confirmOrder; window.confirmOrder = () => { throw new Error('test: confirmOrder missing'); }; true`);
    await click('[data-kprun]'); await open(); await sleep(350);
    d = await dlg();
    ok('kamapage fallback (confirmOrder throws) asks through the shared dialog too', /^Order for party /.test(d.title) && /!mission kamaloka/.test(d.text), d.title);
    await ev(`${btnBy('Send order')}.click()`); await closed(); await sleep(600);
    ok('fallback confirmed -> ONE intercepted POST /api/command', posts.length === 1 && /^!mission kamaloka \d+$/.test(posts[0].cmd || ''), JSON.stringify(posts[0] || {}));
    await ev(`window.confirmOrder = window.__co; true`);
  }

  // ===================== 5) error alert (escaping), queue, prompt validation (drop-count style), reduced motion =====================
  await ev(`(window.__r = null, uiAlert({ title: 'Not saved', kind: 'error', body: ['Character <img src=x onerror="window.__pwn=1"> says: <b>no</b>', uiNote('(The dashboard server needs a restart for this.)')] }).then(() => { window.__r = 'closed'; }), true)`);
  await open(); await sleep(350);
  d = await dlg();
  ok('error alert: role=alertdialog, red icon, one OK button', d.role === 'alertdialog' && await ev(`!!document.querySelector('.uid-ov .uid-ic-error')`) && d.btns.length === 1 && d.btns[0].t === 'OK');
  ok('names are escaped (no <img>, text shown as typed)', await ev(`!document.querySelector('.uid-ov img') && /<img src=x/.test(document.querySelector('.uid-ov .uid-body').textContent) && window.__pwn === undefined`));
  await shot('phone_07_error_alert');
  await key('Enter');
  ok('Enter closes the alert', await closed() && await ev(`window.__r === 'closed'`));
  // queue: two at once -> one at a time, in order
  await ev(`(window.__q = [], uiConfirm({ title: 'First', body: 'one', confirmText: 'Yes 1' }).then(v => __q.push('1:' + v)), uiConfirm({ title: 'Second', body: 'two', confirmText: 'Yes 2' }).then(v => __q.push('2:' + v)), true)`);
  await open(); await sleep(350);
  ok('queue: only ONE dialog on screen, the first', await ev(`document.querySelectorAll('.uid-ov').length === 1 && document.querySelector('.uid-ov h2').textContent === 'First'`));
  await ev(`${btnBy('Yes 1')}.click()`); await sleep(600);
  ok('queue: the second follows after the first is answered', await ev(`document.querySelectorAll('.uid-ov').length === 1 && document.querySelector('.uid-ov h2').textContent === 'Second'`));
  await ev(`${btnBy('Cancel')}.click()`); await closed();
  ok('queue: answers 1:true, 2:false in order', await ev(`__q.join() === '1:true,2:false'`), await ev(`__q.join()`));
  await ev(`(window.__p = undefined, uiPrompt({ title: 'Drop Soulshot?', body: 'Bishop1: drop how many Soulshot? (1-3)', label: 'How many', value: '3', inputmode: 'numeric', confirmText: 'Next', validate: (v) => (/^\\s*\\d+\\s*$/.test(v) && +v >= 1 && +v <= 3 ? '' : 'A whole number from 1 to 3') }).then(v => { window.__p = v; }), true)`);
  await open(); await sleep(350);
  ok('numeric prompt: inputmode=numeric', await ev(`document.querySelector('.uid-in').getAttribute('inputmode') === 'numeric'`));
  await ev(`(() => { const i = document.querySelector('.uid-in'); i.value = ''; return true; })()`); await typeText('.uid-in', '5'); await sleep(100);
  d = await dlg();
  ok('numeric prompt: 5 of max 3 -> error, Next disabled', /1 to 3/.test(d.err) && d.btns.find(b => b.t === 'Next').dis, d.err);
  await ev(`(() => { const i = document.querySelector('.uid-in'); i.value = ''; return true; })()`); await typeText('.uid-in', '2'); await sleep(100);
  await key('Enter'); await closed();
  ok('numeric prompt: 2 -> resolves "2"', await ev(`window.__p === '2'`), await ev(`String(window.__p)`));
  await ev(`(window.__p = undefined, uiPrompt({ title: 'x', label: 'y', value: 'z' }).then(v => { window.__p = v; }), true)`); await open(); await sleep(350); await key('Escape'); await closed();
  ok('prompt: Esc -> null', await ev(`window.__p === null`));
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await ev(`(uiConfirm({ title: 'Motion', body: 'reduced' }), true)`); await open();
  ok('prefers-reduced-motion: no animation on the sheet', await ev(`getComputedStyle(document.querySelector('.uid-card')).animationName === 'none' && getComputedStyle(document.querySelector('.uid-ov')).animationName === 'none'`));
  await ev(`${btnBy('Cancel')}.click()`); await closed();
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  ok('animated otherwise (slide up)', await ev(`(uiConfirm({ title: 'Motion', body: 'on' }), new Promise(r => setTimeout(() => r(getComputedStyle(document.querySelector('.uid-card')).animationName), 30)))`) === 'uid-up');
  await sleep(300); await ev(`${btnBy('Cancel')}.click()`); await closed();
  ok('no horizontal page scroll with a dialog open (iPhone)', await ev(`(uiConfirm({ title: 'A very long title that should wrap nicely on a small phone screen without making the page wider', body: 'x'.repeat(400) }), new Promise(r => setTimeout(() => r(document.documentElement.scrollWidth <= innerWidth + 1), 300)))`));
  await ev(`${btnBy('Cancel')}.click()`); await closed();

  // ===================== 6) desktop: the same dialogs as a centred card =====================
  await desktop();
  await cdp('Page.navigate', { url: BASE + '#/classes/Tank2' });
  await waitFor(`!!window.uiConfirm && document.querySelectorAll('.cpl-mrow[data-cpname]').length === 9`, 30000);
  await click('.cpl-mrow[data-cpname="Nuker2"] [data-cpact="pick"]');
  await waitFor(`!document.getElementById('cpSheet').hidden && document.querySelectorAll('.cpl-col').length === 3`);
  await click('.cpl-opt[data-cpstep="2"][data-cpid="27"]'); await sleep(250);
  const beforeP = JSON.stringify((file().parties.Tank2.members || {}).Nuker2 || null);
  await click('[data-cpact="saveApprove"]'); await open(); await sleep(400);
  d = await dlg();
  ok('desktop: centred card (not a bottom sheet), max 560 px wide', d.card.w <= 560 && d.card.l > 100 && d.card.t > 20 && d.card.b < d.vh - 20 && Math.abs((d.card.l + d.card.w / 2) - d.vw / 2) <= 2, JSON.stringify(d.card));
  await waitFor(`[...document.querySelectorAll('img')].every(i => i.complete)`, 3000);
  await shot('desktop_01_class_approve');
  await ev(`${btnBy('Cancel')}.click()`); await closed();
  ok('desktop cancel: Nuker2 unchanged', JSON.stringify((file().parties.Tank2.members || {}).Nuker2 || null) === beforeP);
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  await waitFor(`!!window.CmdCenter && document.querySelectorAll('.mem2').length > 5`, 30000); await sleep(800);
  posts.length = 0;
  await ev(`CmdCenter.openCommand('b_unstuck', 'char:Bishop1')`); await sleep(700);
  await click('[data-ccsend]'); await open(); await sleep(350); await ev(`${btnBy('Send')}.click()`);
  await waitFor(`!!document.querySelector('.uid-ov .uid-ttc')`, 6000); await sleep(400);
  await typeText('.uid-in', 'YES'); await sleep(100);
  await shot('desktop_02_destructive_yes');
  await ev(`${btnBy('Cancel')}.click()`); await closed(); await sleep(300);
  ok('desktop: Cancel on the YES step = nothing sent', posts.length === 0);
  try { await ev(`CmdCenter.close()`); } catch (e) { }
  await ev(`(uiAlert({ title: 'Not saved', kind: 'error', body: 'The dashboard server needs a restart for this.' }), true)`); await open(); await sleep(350);
  await shot('desktop_03_error_alert');
  await key('Escape'); await closed();

  // ===================== summary =====================
  ok('no browser confirm/alert/prompt was ever opened', !native.length, native.slice(0, 3).join(' | '));
  const fail401 = failed.filter(u => !/\/api\/|\/favicon\.ico$/.test(u));   // favicon.ico: the dashboard has no icon file (401 before this change too)
  ok('no page file got a 401 over the LAN', !fail401.length, fail401.slice(0, 4).join(' | '));
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  const writes = mcpLog.filter(l => /^MCP (run_account_command|send_game_action|close_account|open_account|manage_)/.test(l));
  ok('no game command reached even the mock MCP', !writes.length, writes.slice(0, 3).join(' | '));
  ok('the live Scripts/data/class_plans.json was never created or changed', liveSt() === LIVE0);
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
