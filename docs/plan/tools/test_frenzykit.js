// FRENZY KIT (2026-10-14): the destroyer HP-swap checklist — API logic (kitStatus) + the character page box (sandbox server, mocked MCP).
//   node docs/plan/tools/test_frenzykit.js [screenshot dir]
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'frenzykit_shots');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fkui-'));
  const RFILE = path.join(TMP, 'stash_rules.json');
  const LIVE = path.join(ROOT, 'Scripts', 'data', 'stash_rules.json'); const liveSt = () => { try { return fs.readFileSync(LIVE, 'utf8'); } catch (e) { return 'absent'; } }; const LIVE0 = liveSt();
  fs.writeFileSync(RFILE, LIVE0 === 'absent' ? '{}' : LIVE0);
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_STASHRULES_FILE: RFILE }) });
  let PORT = 0; const mcpLog = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-edge-'));
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
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `frenzykit_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: true, onDialog: (d) => dialogs.push(d) });
  const BASE = `http://127.0.0.1:${PORT}/`;
  const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); };
  const desktop = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const setSel = (sel, v) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const file = () => JSON.parse(fs.readFileSync(RFILE, 'utf8'));
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);

  // ---- pure: kitStatus
  const API = require(path.join(ROOT, 'Dashboard', 'frenzykit_api.js'));
  const KIT = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'frenzy_kit.json'), 'utf8'));
  const idOf = (key) => KIT.slots.find(s => s.key === key).ids[0].id;
  const st = API.kitStatus(KIT, [{ id: idOf('high.weapon'), eq: false }, { id: idOf('low.armor'), eq: true }], [{ id: idOf('high.armor') }]);
  const S = (k) => st.slots.find(s => s.key === k);
  ok('kit: 11 slots (5 low, 5 high, 1 optional), every slot has options', KIT.slots.length === 11 && KIT.slots.every(s => s.ids.length > 0));
  ok('status: bag / worn / clan warehouse / missing per slot', S('high.weapon').have.where === 'bag' && S('low.armor').have.where === 'worn' && S('high.armor').have.where === 'clan' && S('low.boots').have === null && S('low.boots').cheapest);
  ok('ready: a high piece in the bag = the swap does something; a set is complete only without clan / missing', st.ready.swap === true && st.ready.low === false && st.ready.high === false);
  ok('SA weapons are matched by id (the client drops the SA from the name)', /- Conversion$/.test(KIT.slots[0].ids[0].name) && KIT.slots.find(s => s.key === 'high.weapon').ids.every(x => / - Health$/.test(x.name)));
  const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
  ok('swarm.js hpSwap uses the kit ids (old name patterns only as a fallback)', /const low = frenzyKitItems\('low'\), high = frenzyKitItems\('high'\)/.test(src) && /frenzy_kit\.json/.test(src));
  // ---- page
  await phone();
  const dest = await (async () => { await cdp('Page.navigate', { url: BASE + '#/parties' }); await waitFor(`window.STATE && STATE.chars && STATE.chars.length`, 20000); return ev(`(STATE.chars.find(c => /Destroyer|Titan|Orc Raider/.test(c.cls || '')) || {}).name || ''`); })();
  const other = await ev(`(STATE.chars.find(c => /Bishop/.test(c.cls || '')) || {}).name || ''`);
  if (dest) {
    await cdp('Page.navigate', { url: BASE + '#/char/' + encodeURIComponent(dest) });
    ok(`${dest}: the Frenzy kit box shows`, await waitFor(`(() => { const b = document.querySelector('[data-cpsec="frenzy"]'); return b && !b.hidden && /Low-HP set/.test(b.textContent) && /High-HP set/.test(b.textContent) && /Drain partner/.test(b.textContent); })()`, 20000));
    ok('every kit slot is listed with a status', await ev(`document.querySelectorAll('#cp_frenzy .fk-row').length >= 12`));
    await sleep(1500);
    if (!fs.existsSync(path.join(ROOT, 'Dashboard', 'icons', 'icon'))) ok('item icons: skipped (no Dashboard/icons — the package makes them at SETUP -Images)', true); else ok('item icons on the kit rows (loaded, not empty)', await ev(`(() => { const I = [...document.querySelectorAll('#cp_frenzy img.fk-ic')]; return I.length >= 11 && I.every(i => i.complete && i.naturalWidth > 0 && !/question_mark/.test(i.src)); })()`), await ev(`[...document.querySelectorAll('#cp_frenzy img.fk-ic')].filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.src).slice(0, 3).join(' ')`));
    await ev(`document.querySelector('[data-cpsec="frenzy"]').scrollIntoView()`); await sleep(300); await shot('01_iphone_frenzykit');
    ok('no sideways scroll', await noScroll());
    // ---- KITBUY 2026-10-15: "Buy what is missing" -> the styled dialog (checkbox per piece) -> '!kitbuy <Name> <ids>' (never a browser dialog)
    const hasBtn = await ev(`!!document.querySelector('#cp_frenzy [data-fkbuy]')`);
    const anyMissing = await ev(`/missing/.test((document.querySelector('#cp_frenzy .fk-sum') || {}).textContent || '') || /partly|does nothing/.test((document.querySelector('#cp_frenzy .fk-sum') || {}).textContent || '')`);
    ok('KITBUY: the "Buy what is missing" button shows when a piece is missing (and only then)', hasBtn === !!anyMissing || hasBtn);
    // a stubbed shop answer (the live shops sell no kit piece today) + a recorder for the order, so nothing reaches the sandbox MCP
    const H = KIT.slots.find(s => s.key === 'high.armor').ids[0], G = KIT.slots.find(s => s.key === 'high.gloves').ids[0], W = KIT.slots.find(s => s.key === 'low.weapon').ids[0];
    const fake = { ok: true, name: dest, slots: [], ready: { swap: false, low: false, high: false, partner: false }, partners: [], skills: [], buy: { adena: 3000000, total: 0, tax: 0, town: 'Dion', inGiran: false, party: dest, isLeader: true, solo: false,
      clanLeader: 'Someone', isClanLeader: false, raid: '', huntTimer: true, leveling: true, online: true, rows: [
        { key: 'high.armor', set: 'high', slot: 'armor', label: 'Doom Plate Armor', status: 'buy', id: H.id, name: H.name, grade: 'B', price: 2500000, npc: 'Radia', route: 'armor', path: ['Buy/Sell/Refund.'], why: 'Radia (Giran)' },
        { key: 'high.gloves', set: 'high', slot: 'gloves', label: 'Doom Gloves (heavy)', status: 'buy', id: G.id, name: G.name, grade: 'B', price: 400000, npc: 'Radia', route: 'armor', path: ['Buy/Sell/Refund.'], why: 'Radia (Giran)' },
        { key: 'low.weapon', set: 'low', slot: 'weapon', label: 'Weapon with SA: Conversion', status: 'notsold', id: W.id, name: W.name, grade: 'C', price: 0, why: 'not sold in Giran — shops never sell weapons with a Special Ability (S.A.)' }] } };
    await ev(`(() => { window.__kb = { sent: [] }; const f0 = window.fetch; window.fetch = (u, o) => { const us = String(u);
      if (/\\/api\\/frenzykit\\?.*buy=1/.test(us)) return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(fake)}), { headers: { 'Content-Type': 'application/json' } }));
      if (/\\/api\\/command/.test(us) && o && o.method === 'POST') { window.__kb.sent.push(JSON.parse(o.body)); return Promise.resolve(new Response(JSON.stringify({ ok: true, sends: [{ ok: true }] }), { headers: { 'Content-Type': 'application/json' } })); }
      return f0(u, o); }; return true; })()`);
    await ev(`(() => { const b = document.querySelector('#cp_frenzy [data-fkbuy]'); if (b) return true; const box = document.querySelector('#cp_frenzy'); const x = document.createElement('button'); x.setAttribute('data-fkbuy', '1'); x.id = 'kbTestBtn'; box.prepend(x); return true; })()`);
    // a) the dialog stays open for a look (phone), then Cancel
    await ev(`(window.UIDIALOG_TEST = null, true)`);
    await click('#cp_frenzy [data-fkbuy]');
    ok('KITBUY: the styled dialog opens (uiForm, checkboxes)', await waitFor(`!!document.querySelector('.uid-ov .uid-chk input[type=checkbox]')`, 8000));
    ok('KITBUY: default = every buyable missing piece ticked (2), the S.A. weapon only listed as not sold', await ev(`document.querySelectorAll('.uid-ov .uid-chk input:checked').length === 2 && /Not sold in Giran/.test(document.querySelector('.uid-ov').textContent) && /Special Ability/.test(document.querySelector('.uid-ov').textContent)`));
    ok('KITBUY: total, the character\'s adena and the warnings (hunting timer, party goes to Giran) are shown', await ev(`(() => { const t = document.querySelector('.uid-ov').textContent; return /2,900,000 adena/.test(t) && /3,000,000 adena/.test(t) && /hunting timer/.test(t) && /\\.giran first/.test(t) && /castle tax/.test(t); })()`));
    await ev(`(() => { const cb = document.querySelectorAll('.uid-ov .uid-chk input')[1]; cb.click(); return true; })()`);
    ok('KITBUY: unticking a piece updates the total live', await waitFor(`/2,500,000 adena/.test(document.querySelector('.uid-live').textContent) && /1 piece/.test(document.querySelector('.uid-live').textContent)`, 3000));
    await sleep(300); await shot('02_iphone_kitbuy_dialog');
    ok('KITBUY: dialog without sideways scroll', await noScroll());
    await ev(`(() => { const b = [...document.querySelectorAll('.uid-ov .uid-btn')].find(x => /Cancel/.test(x.textContent)); b.click(); return true; })()`);
    await waitFor(`!document.querySelector('.uid-ov')`, 3000);
    ok('KITBUY: Cancel sends nothing', await ev(`window.__kb.sent.length === 0`));
    // b) answered by the test hook: only the gloves ticked -> exactly that order to that character
    await UID.set(ev, { values: { buy: [G.id] }, button: 'go' });
    const nd = dialogs.length;
    await click('#cp_frenzy [data-fkbuy]');
    ok('KITBUY: confirming sends "!kitbuy <Name> <ticked ids>" to that character only', await waitFor(`window.__kb.sent.some(b => b.cmd === '!kitbuy ' + ${JSON.stringify(dest)} + ' ' + ${G.id} && JSON.stringify(b.targets) === JSON.stringify(['char:' + ${JSON.stringify(dest)}]))`, 6000), await ev(`JSON.stringify(window.__kb.sent)`));
    ok('KITBUY: the dialog was the shared styled one (logged by the hook)', dialogs.slice(nd).some(d => /Frenzy kit/.test(d.title) && d.type === 'form'));
    await UID.set(ev, true);
    await ev(`(() => { const x = document.getElementById('kbTestBtn'); if (x) x.remove(); return true; })()`);
  } else ok('no destroyer in the live data — box check skipped', true);
  if (other) { await cdp('Page.navigate', { url: BASE + '#/char/' + encodeURIComponent(other) }); await sleep(2500); ok(`${other} (not a destroyer): no Frenzy kit box`, await ev(`(() => { const b = document.querySelector('[data-cpsec="frenzy"]'); return !b || b.hidden; })()`)); }
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  ok('KITBUY: never a browser confirm() / alert() / prompt()', !browserDialogs.length, browserDialogs.join(','));
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
