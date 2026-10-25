// TRADE page (HANDOVER 2026-10-10): headless browser check of #/trade (Edge via CDP) against the SANDBOX server (cmdcenter_testserver.js:
// mocked MCP, nothing reaches the game). Inventories come from a scratch fixture (env SANDBOX_INVENTORY), orders + presets go to scratch
// folders (SWARM_HANDOVER_DIR / SWARM_TRADEPRESETS_FILE); every uidialog question answers itself (uidialog_testhook).
// iPhone 390x844 + desktop 1366x900. Reads the real Logs/swarm_state_*.json and swarm.config.json (read-only).
//   node docs/plan/tools/test_tradepage_ui.js [screenshot dir]     (default: %TEMP%\tradepage_shots — never the repo)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'tradepage_shots');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'trdui-'));
  const team = require(path.join(ROOT, 'swarm.config.json')).accounts.filter(a => a.party === 'Tank1' && a.enabled !== false).map(a => a.character);
  const inv = {};
  team.forEach((n, i) => { inv[n] = [
    { item_id: 57, obj_id: 1000 + i * 100, name: 'Adena', count: 100000 + i, is_equipped: false, type: 'Etc' },
    { item_id: 955, obj_id: 1001 + i * 100, name: 'Scroll: Enchant Weapon (D)', count: 3 + i, type: 'Etc' },
    { item_id: 1935, obj_id: 1002 + i * 100, name: 'Scale Mail Fragment', count: 40, type: 'Etc' },
    { item_id: 1458, obj_id: 1003 + i * 100, name: 'Crystal (D-Grade)', count: 250, type: 'Etc' },
    { item_id: 348, obj_id: 1004 + i * 100, name: 'Scale Mail', count: 1, type: 'Armor' },
    { item_id: 349, obj_id: 1005 + i * 100, name: 'Worn Armor', count: 1, is_equipped: true, type: 'Armor' },
    { item_id: 728, obj_id: 1006 + i * 100, name: 'Mana Potion', count: 500, type: 'Etc' },
  ]; });
  const INV = path.join(TMP, 'inv.json'); fs.writeFileSync(INV, JSON.stringify(inv));
  const HDIR = path.join(TMP, 'handover'), PFILE = path.join(TMP, 'trade_presets.json');
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SANDBOX_INVENTORY: INV, SWARM_HANDOVER_DIR: HDIR, SWARM_TRADEPRESETS_FILE: PFILE }) });
  let PORT = 0; const mcpLog = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'trd-edge-'));
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
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `tradepage_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: true, prompt: 'UI test preset', onDialog: (d) => dialogs.push(d) });
  const BASE = `http://127.0.0.1:${PORT}/`;
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  try {
    // ===================== iPhone =====================
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp('Page.navigate', { url: BASE + '#/parties' });
    ok('nav: a Trade tab', await waitFor(`!!document.querySelector('#tabs [data-tab="trade"]')`, 20000));
    ok('party header: a Trade… link', await waitFor(`!!document.querySelector('a.trdbtn[href^="#/trade/party%3A"]')`, 15000));
    await cdp('Page.navigate', { url: BASE + '#/trade/party:Tank1' });
    ok('#/trade/party:Tank1 pre-selects the party as givers', await waitFor(`document.querySelectorAll('#trdGivers .trd-chip.on[data-trdchar]').length >= 2`, 15000), String(await ev(`document.querySelectorAll('#trdGivers .trd-chip.on[data-trdchar]').length`)));
    ok('receiver default = the clan leader', await ev(`document.getElementById('trdRecvSel').value === '@clanleader' && /Clan leader/.test(document.getElementById('trdRecvSel').selectedOptions[0].textContent)`));
    ok('items from the live bags, grouped by category, with icons', await waitFor(`document.querySelectorAll('#trdItems .trd-cat').length >= 4 && !!document.querySelector('#trdItems .trd-it img')`, 15000));
    ok('worn armour listed as not tradeable (disabled tick)', await ev(`[...document.querySelectorAll('.trd-it.no')].some(e => /Worn Armor/.test(e.textContent) && e.querySelector('input[type=checkbox]').disabled)`));
    await click('[data-trdquick="materials"]');
    const nMat = await ev(`document.querySelectorAll('.trd-it.on').length`);
    ok('quick "All materials" ticks raid + crafting materials of every giver', nMat >= 4, String(nMat));
    ok('adena never ticked by a button', await ev(`[...document.querySelectorAll('[data-trdadena]')].every(i => !i.value)`));
    ok('bottom bar counts the selection', await ev(`/\\b${nMat}\\b kinds?/.test(document.getElementById('trdBar').textContent)`), await ev(`document.getElementById('trdBar').textContent.trim()`));
    ok('phone: no horizontal page scroll', await ev(`document.documentElement.scrollWidth <= window.innerWidth + 1`), await ev(`document.documentElement.scrollWidth + ' / ' + window.innerWidth`));
    await shot('phone_picker');
    await ev("document.querySelector('#trdItems details').open = true; document.getElementById('trdQuick').scrollIntoView(); true"); await sleep(2500); await shot('phone_items');
    ok('item icons + checkboxes load', await waitFor("(() => { const im = [...document.querySelectorAll('#trdItems details[open] .trd-it img')]; const cb = document.querySelector('#trdItems .trd-it input[type=checkbox]'); return im.length > 0 && im.every(i => i.complete && i.naturalWidth > 0) && !!cb && cb.getBoundingClientRect().width >= 20; })()", 8000), await ev("JSON.stringify([...document.querySelectorAll('#trdItems details[open] .trd-it img')].slice(0,2).map(i => [i.src.slice(-40), i.complete, i.naturalWidth, i.getBoundingClientRect().width]))"));
    await click('[data-trd="presave"]');
    ok('save as preset (styled prompt) -> scratch presets file', await waitFor(`(async () => { const r = await api('/api/trade/info'); return r.presets.some(p => p.name === 'UI test preset'); })()`, 8000) && fs.existsSync(PFILE));
    await click('[data-trd="preview"]');
    ok('preview + styled confirm -> order file written', await waitFor(`(async () => { const r = await api('/api/trade/info'); return r.orders.length > 0; })()`, 15000));
    const files = fs.existsSync(HDIR) ? fs.readdirSync(HDIR).filter(f => /^h[a-z0-9]+\.json$/.test(f)) : [];
    const order = files.length ? JSON.parse(fs.readFileSync(path.join(HDIR, files[0]), 'utf8')) : null;
    ok('order: receiver = clan leader, only materials, no adena, no worn items', !!order && Object.values(order.givers).every(g => g.adena === 0 && g.items.every(i => [1935, 1458].includes(i.id))), order ? JSON.stringify(Object.values(order.givers)[0]).slice(0, 160) : 'no file');
    ok('"!handover <id>" sent through the (mock) command center', mcpLog.some(l => /run_account_command|send_game_action/.test(l) && l.includes('!handover ' + (order && order.id))), mcpLog.filter(l => /handover/.test(l)).slice(0, 2).join(' | '));
    ok('confirm dialog listed every giver + the receiver', dialogs.some(d => d.type === 'confirm' && /Start this hand-over/.test(d.title) && /Scale Mail Fragment/.test(d.msg)));
    ok('hand-overs list shows the order', await waitFor(`document.querySelectorAll('#trdOrders .trd-o').length >= 1`, 8000));
    await shot('phone_orders');
    // ===================== desktop =====================
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp('Page.navigate', { url: BASE + '#/trade' });
    ok('desktop: page renders with givers kept', await waitFor(`document.querySelectorAll('#trdGivers .trd-chip.on[data-trdchar]').length >= 2 && document.querySelectorAll('#trdItems .trd-cat').length >= 4`, 15000));
    await shot('desktop');
    ok('no browser alert / confirm / prompt', browserDialogs.length === 0, browserDialogs.join(','));
    ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) { ok('UI run', false, e.stack); }
  try { sock.close(); } catch (e) { } try { br.kill(); } catch (e) { } try { srv.kill(); } catch (e) { }
  await sleep(500);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  const f = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - f}/${results.length} ok — screenshots in ${OUT}`);
  process.exit(f ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
