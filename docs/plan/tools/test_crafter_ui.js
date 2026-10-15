// OUR CRAFTER (CRAFTER-2026-10-15): headless browser check of the Storage page box "Our crafter" + the party settings line (Edge via CDP) against
// the SANDBOX server (cmdcenter_testserver.js: mocked MCP, nothing reaches the game). The crafter file is a SCRATCH copy (env SWARM_CRAFTER_FILE);
// uidialog questions answer themselves (uidialog_testhook). iPhone 390x844. Reads the real Logs/swarm_state_*.json (read-only).
// CRAFTITEMS-2026-10-15: also the "Items" part of the card (crystallize / recipes / give items) against a scratch bag report
// (SWARM_CRAFTER_BAG_DIR), a mocked inventory (SANDBOX_INVENTORY) and scratch order / inbox / hand-over folders (nothing reaches a live bot).
//   node docs/plan/tools/test_crafter_ui.js [screenshot dir]     (default: %TEMP%\crafter_shots — never the repo)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'crafter_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crfui-'));
  const RFILE = path.join(TMP, 'crafter_rules.json');
  const LIVE = path.join(ROOT, 'Scripts', 'data', 'crafter_rules.json'); const liveSt = () => { try { return fs.readFileSync(LIVE, 'utf8'); } catch (e) { return 'absent'; } }; const LIVE0 = liveSt();
  // the crafter = a Dwarf crafter from the real state files (Crafter1 on the owner's PC), else a made-up name
  let CR = 'Crafter1';
  try { const f = fs.readdirSync(path.join(ROOT, 'Logs')).filter(x => /^swarm_state_.+\.json$/.test(x)); for (const x of f) { const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'Logs', x), 'utf8').replace(/^\uFEFF/, '')); if (s && (s.roleKind === 'crafter' || /Artisan|Warsmith|Maestro/.test(s.cls || ''))) { CR = s.name; break; } } } catch (e) { }
  fs.writeFileSync(RFILE, JSON.stringify({ v: 1, crafters: { [CR]: { on: false, town: 'Giran', parties: [], stock: { 'soulshot:C': 5000 } } } }));
  // CRAFTITEMS-2026-10-15: scratch folders + the crafter's bag report + every character's mocked inventory
  const BAGDIR = path.join(TMP, 'bag'), HDIR = path.join(TMP, 'handover'), CMDDIR = path.join(TMP, 'cmd'), ORDDIR = path.join(TMP, 'orders'), INV = path.join(TMP, 'inv.json');
  [BAGDIR, HDIR, CMDDIR, ORDDIR].forEach(d => fs.mkdirSync(d, { recursive: true }));
  const J = (o) => Object.assign({ name: 'Elven Long Sword', id: 2499, grade: 'D', kind: 'w', crystalId: 1458, crystals: 2561, enchant: 0, special: [], hard: '', equipped: false }, o);
  fs.writeFileSync(path.join(BAGDIR, `crafter_bag_${CR}.json`), JSON.stringify({ name: CR, atMs: Date.now() + 3600000, town: 'Giran', skill: 4, createLvl: 7, commonLvl: 0, book: { dwarven: 12 },
    cryst: [J({ objId: 101 }), J({ objId: 102, enchant: 2, crystals: 2741 }), J({ objId: 103, equipped: true, hard: 'worn (equipped) — never' })],
    recipes: [{ scroll: 1804, objId: 201, name: 'Recipe: Soulshot (D-Grade)', count: 1, list: 20, lvl: 2, type: 'd', ok: true, known: false, why: 'Create Item level 7 is enough' },
      { scroll: 1808, objId: 202, name: 'Recipe: Soulshot (S-Grade)', count: 1, list: 24, lvl: 8, type: 'd', ok: false, known: false, why: 'needs Create Item level 8 (mine 7)' }] }));
  const invRows = [{ item_id: 1804, obj_id: 501, name: 'Recipe: Soulshot (D-Grade)', count: 1 }, { item_id: 1458, obj_id: 502, name: 'Crystal: D-Grade', count: 400 }, { item_id: 2499, obj_id: 503, name: 'Elven Long Sword', count: 1, type: 'Weapon' }, { item_id: 1463, obj_id: 504, name: 'Soulshot: D-grade', count: 3000 }];
  const inv = {}; try { fs.readdirSync(path.join(ROOT, 'Logs')).forEach(f => { const m = f.match(/^swarm_state_(.+)\.json$/); if (m) inv[m[1]] = invRows; }); } catch (e) { } fs.writeFileSync(INV, JSON.stringify(inv));
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_CRAFTER_FILE: RFILE, SWARM_CRAFTER_BAG_DIR: BAGDIR, SWARM_HANDOVER_DIR: HDIR, SWARM_CMD_DIR: CMDDIR, SWARM_ORDERS_DIR: ORDDIR, SANDBOX_INVENTORY: INV }) });
  let PORT = 0; const mcpLog = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'crf-edge-'));
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
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `crafter_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: true, prompt: 'YES', onDialog: (d) => dialogs.push(d) });
  const BASE = `http://127.0.0.1:${PORT}/`;
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const file = () => JSON.parse(fs.readFileSync(RFILE, 'utf8'));
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);
  const S = (s) => JSON.stringify(s);

  await cdp('Page.navigate', { url: BASE + '#/storage' });
  ok('Storage page: the "Our crafter" box', await waitFor(`!!document.getElementById('stgCraft')`, 20000));
  ok(`the crafter card for ${CR} fills in by itself`, await waitFor(`!!document.querySelector('#stgCraft [data-crfcard=${S(CR)}]')`, 15000), await ev(`(document.getElementById('stgCraft')||{}).textContent`).then(t => String(t).slice(0, 200)));
  ok('off says "nothing happens until you switch it on"', await ev(`/nothing happens until you switch it on/.test(document.querySelector('#stgCraft [data-crfcard]').textContent)`));
  ok('15 shot rows (soulshot / spiritshot / blessed, D-S) with "Keep in stock"', await ev(`document.querySelectorAll('#stgCraft input[data-stock]').length === 15`));
  ok('the saved stock target is shown (C soulshots 5000)', await ev(`document.querySelector('#stgCraft input[data-stock="soulshot:C"]').value === '5000'`));
  ok('the "never crystallizes" sentence is on the card', await ev(`/never crystallizes anything/.test(document.getElementById('stgCraft').textContent)`));
  ok('no horizontal page scroll (iPhone)', await noScroll(), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
  await ev(`document.getElementById('stgCraft').scrollIntoView()`); await sleep(300); await shot('01_iphone_card');
  // switch on, tick every party, set D soulshots 2000, save
  await ev(`(() => { const c = document.querySelector('#stgCraft input[data-k="on"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await waitFor(`!!document.querySelector('#stgCraft input[data-party="*"]')`, 3000);
  await ev(`(() => { const c = document.querySelector('#stgCraft input[data-party="*"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await ev(`(() => { const e = document.querySelector('#stgCraft input[data-stock="soulshot:D"]'); e.value = '2000'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  ok('Save turns on after a change', await waitFor(`!document.querySelector('#stgCraft [data-crfact="save"]').disabled`, 3000));
  await click('#stgCraft [data-crfact="save"]');
  ok('saved into the (scratch) crafter file', await waitFor(`true`, 10) && await (async () => { for (let i = 0; i < 40; i++) { const f = file(); const c = f.crafters && f.crafters[CR]; if (c && c.on === true && (c.parties || []).includes('*') && c.stock && c.stock['soulshot:D'] === 2000 && c.stock['soulshot:C'] === 5000) return true; await sleep(250); } return false; })(), JSON.stringify(file()).slice(0, 300));
  ok('the card shows On after saving', await waitFor(`/On — /.test(document.querySelector('#stgCraft [data-crfcard]').textContent)`, 8000));
  // Craft now -> one !craft command to the MOCK
  const before = mcpLog.length;
  await click('#stgCraft [data-crfact="craft"]');
  ok('"Craft now" sends "!craft <name>" (to the mock MCP only)', await (async () => { for (let i = 0; i < 40; i++) { if (mcpLog.slice(before).some(l => l.includes('!craft ' + CR))) return true; await sleep(250); } return false; })(), mcpLog.slice(before).join(' | ').slice(0, 300));
  // ---- CRAFTITEMS-2026-10-15: the Items part (crystallize / recipes / give items)
  const sentAfter = async (n, re) => { for (let i = 0; i < 40; i++) { if (mcpLog.slice(n).some(l => re.test(l))) return true; await sleep(250); } return false; };
  const openSec = (k) => ev(`(() => { const d = document.querySelector('#stgCraft details[data-crfsec="${CR}:${k}"]'); if (!d) return false; d.open = true; d.dispatchEvent(new Event('toggle')); d.scrollIntoView(); return true; })()`);
  const setBox = (sel, on) => ev(`(() => { const c = document.querySelector(${S(sel)}); if (!c) return false; c.checked = ${on ? 'true' : 'false'}; c.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  ok('Items: "Turn items into crystals" says 1 of 3 can go (worn + enchanted held back)', await waitFor(`/Turn items into crystals \\(crystallize\\) — 1 of 3 can go/.test(document.getElementById('stgCraft').textContent)`, 10000),
    await ev(`(document.querySelector('#stgCraft [data-crfsec$=":cry"] summary') || {}).textContent`).then(t => String(t).slice(0, 120)));
  await openSec('cry');
  ok('crystallize rows: 1 free, the worn one and the enchanted one greyed out with the reason', await ev(`document.querySelectorAll('#stgCraft input[data-crysel]:not([disabled])').length === 1 && document.querySelectorAll('#stgCraft input[data-crysel][disabled]').length === 2 && /worn \\(equipped\\) — never/.test(document.getElementById('stgCraft').textContent) && /tick "include enchanted items"/.test(document.getElementById('stgCraft').textContent)`));
  await setBox('#stgCraft input[data-crytick="enchanted"]', true);
  ok('"Include enchanted items" frees the +2 sword (the worn one never)', await waitFor(`document.querySelectorAll('#stgCraft input[data-crysel]:not([disabled])').length === 2`, 3000));
  await click('#stgCraft [data-crfact="cryall"]');
  ok('Tick all: the button says how many and the crystals (2 items, 5,302 D)', await waitFor(`/Crystallize 2 items… \\(5,302 D crystals\\)/.test((document.querySelector('#stgCraft [data-crfact="cry"]') || {}).textContent || '')`, 3000),
    await ev(`(document.querySelector('#stgCraft [data-crfact="cry"]') || {}).textContent`));
  ok('no horizontal page scroll with the items open (iPhone)', await noScroll(), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
  await sleep(300); await shot('03_iphone_crystallize');
  let n0 = mcpLog.length, d0 = dialogs.length;
  await click('#stgCraft [data-crfact="cry"]');
  ok('crystallize sends exactly "!crystallize <name> 101,102 enchanted" (mock MCP)', await sentAfter(n0, new RegExp('!crystallize ' + CR + ' (101,102|102,101) enchanted')), mcpLog.slice(n0).join(' | ').slice(0, 300));
  const dd = dialogs.slice(d0).find(d => /Crystallize 2 items/.test(d.title || ''));
  ok('it asked first with the RED danger dialog: "This destroys the items", the list, the crystals, YES typed for the enchanted one', !!dd && dd.danger === true && dd.typeToConfirm === 'YES' && /This destroys the items/.test(dd.msg) && /Elven Long Sword \+2/.test(dd.msg) && /5,302/.test(dd.msg), JSON.stringify(dd || {}).slice(0, 300));
  // recipes: Learn
  await openSec('rcp');
  ok('recipes in its bag: Learn on the D recipe, off on the S recipe (level too low, said why)', await ev(`!document.querySelector('#stgCraft [data-crfact="learn"][data-scroll="1804"]').disabled && document.querySelector('#stgCraft [data-crfact="learn"][data-scroll="1808"]').disabled && /needs Create Item level 8 \\(mine 7\\)/.test(document.getElementById('stgCraft').textContent)`));
  ok('the recipe book size + the 50-per-book limit are said', await ev(`/holds 12 recipes/.test(document.getElementById('stgCraft').textContent) && /50 recipes on a standard server/.test(document.getElementById('stgCraft').textContent)`));
  n0 = mcpLog.length; await click('#stgCraft [data-crfact="learn"][data-scroll="1804"]');
  ok('Learn sends "!craft learn 1804 <name>" after a question', await sentAfter(n0, new RegExp('!craft learn 1804 ' + CR)), mcpLog.slice(n0).join(' | ').slice(0, 200));
  // give items from one character
  await openSec('give');
  const GV = await ev(`(() => { const s = document.querySelector('#stgCraft select[data-giver]'); const o = s && [...s.options].find(x => x.value); if (!o) return ''; s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return o.value; })()`);
  ok('Give items: a character list to choose from', !!GV, GV);
  await waitFor(`!document.querySelector('#stgCraft [data-crfact="giveload"]').disabled`, 3000);
  await click('#stgCraft [data-crfact="giveload"]');
  ok(`${GV}'s bag: recipe, crystals, crystallizable gear offered; shots not`, await waitFor(`document.querySelectorAll('#stgCraft input[data-givesel]').length === 3 && !/Soulshot: D-grade/.test(document.querySelector('#stgCraft [data-crfsec$=":give"]').textContent)`, 15000),
    await ev(`document.querySelectorAll('#stgCraft input[data-givesel]').length + ' rows'`));
  await click('#stgCraft [data-crfact="givetick"][data-kind="recipe"]');
  await waitFor(`!document.querySelector('#stgCraft [data-crfact="givesend"]').disabled`, 3000);
  ok('the go-now switch is OFF by default (wait for the next town visit)', await ev(`!document.querySelector('#stgCraft input[data-givenow]').checked && /next time it is in/.test(document.querySelector('#stgCraft [data-crfsec$=":give"]').textContent)`));
  await sleep(200); await shot('04_iphone_give');
  n0 = mcpLog.length; d0 = dialogs.length;
  await click('#stgCraft [data-crfact="givesend"]');
  ok('Hand ticked items: asks, then one "!handover crin…" order (mock MCP)', await sentAfter(n0, /!handover crin[a-z0-9]+/), mcpLog.slice(n0).join(' | ').slice(0, 200));
  const ofile = fs.readdirSync(HDIR).find(f => /^crin[a-z0-9]+\.json$/.test(f)), ord = ofile ? JSON.parse(fs.readFileSync(path.join(HDIR, ofile), 'utf8')) : null;
  ok('the order (scratch folder): receiver = the crafter, sameTown, only the recipe, no adena', !!ord && ord.receiver === CR && ord.sameTown === true && ord.givers[GV] && ord.givers[GV].items.length === 1 && ord.givers[GV].items[0].id === 1804 && ord.givers[GV].adena === 0, JSON.stringify(ord || {}).slice(0, 300));
  ok('the hand-in question said who, what and the same-town rule', dialogs.slice(d0).some(d => /Hand 1 item from/.test(d.title || '') && /Recipe: Soulshot/.test(d.msg) && /nobody travels for it/.test(d.msg)));
  // party settings: the crafter line in Supplies
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  ok('party cards have ⚙ Settings', await waitFor(`document.querySelectorAll('#tab-parties [data-psopen]').length > 0`, 25000));
  const L = await ev(`(() => { const b = [...document.querySelectorAll('#tab-parties [data-psopen]')].find(x => x.dataset.psopen !== ${S(CR)}); return b ? b.dataset.psopen : ''; })()`);
  await click(`#tab-parties [data-psopen=${S(L)}]`);
  await waitFor(`!document.getElementById('psOv').hidden && document.querySelectorAll('#psBody details.ps-sec').length >= 8`, 20000);
  await ev(`(() => { const d = document.querySelector('#psBody details[data-pssec="supplies"]'); if (d) { d.open = true; d.scrollIntoView(); } return !!d; })()`);
  ok(`party ${L}: Supplies says our crafter ${CR} supplies it`, await waitFor(`(() => { const s = document.querySelector('#psBody [data-crafter-party=${S(L)}]'); return !!s && s.textContent.includes(${S(CR)}) && /takes shots from our crafter/.test(s.textContent); })()`, 10000),
    await ev(`(document.querySelector('#psBody [data-crafter-party]') || {}).textContent`).then(t => String(t).slice(0, 200)));
  await sleep(300); await shot('02_iphone_party');
  ok('no browser alert / confirm / prompt was used', !browserDialogs.length, browserDialogs.join(','));
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  const other = mcpLog.filter(l => /^MCP (send_game_action|close_account|open_account|manage_)/.test(l));
  ok('nothing but the one order reached even the mock MCP', !other.length, other.slice(0, 3).join(' | '));
  ok('the live Scripts/data/crafter_rules.json was not changed', liveSt() === LIVE0);
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
