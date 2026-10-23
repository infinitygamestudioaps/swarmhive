// ITEMS + CRAFTING pages (ITEMS-2026-10-17, Dashboard/itemspage.js + craftpage.js): headless Edge against the SANDBOX server (cmdcenter_testserver.js,
// mocked MCP). Only PLANS are asked for, never "Do it": no job file, no order. iPhone 390x844: pick the clan leader, the four places, tap an item in
// the Giran shops, enchant +6 + Acumen -> the plan; the Crafting page of a crafter. Logs/itemjobs + the order queue are compared before / after.
//   node docs/plan/tools/test_items_ui.js [screenshot dir]     (default: %TEMP%\items_shots)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'items_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !cond ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const LOGS = path.join(ROOT, 'Logs');
const dirList = (d) => { try { return fs.readdirSync(d).sort().join('|'); } catch (e) { return ''; } };

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const JOBS0 = dirList(path.join(LOGS, 'itemjobs')), OQ0 = dirList(path.join(LOGS, 'orders'));
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let port = 0; const mcp = []; srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) port = +m[1]; if (/^MCP /.test(l)) mcp.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 150 && !port; i++) await sleep(100);
  if (!port) throw new Error('sandbox server did not start');
  const BASE = `http://127.0.0.1:${port}/`;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'itp-edge-'));
  const DBG = 9450 + Math.floor(Math.random() * 140);
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
  const shot = async (name, sel) => { if (sel) await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b) b.scrollIntoView({ block: 'start' }); return true; })()`).catch(() => { }); await sleep(250); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `items_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: false, uiMode: 'simple' });
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);
  try {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Page.navigate', { url: BASE + '#/parties' });
    ok('0: page + modules load', await waitFor(`!!window.ItemsPage && !!window.CraftPage && !!window.ItemsLogic`, 30000));
    await ev(`(location.hash = '#/items', true)`);
    ok('1: the character buttons show', await waitFor(`document.querySelectorAll('#itpChars [data-itchar]').length > 10`, 20000));
    const leader = await ev(`(ItemsPage._state.chars.chars.find(c => c.clanLeader) || ItemsPage._state.chars.chars[0]).name`);
    ok('1: no sideways scroll', await noScroll());
    await shot('1_who', '#tab-items');
    // ITEMFIND-2026-10-23: the hive-wide "Find an item" works with no character picked; a result opens that character on that place
    ok('1: the find box shows with no character picked', await ev(`!!document.getElementById('itpFind') && !ItemsPage._state.name`));
    await ev(`(() => { const q = document.getElementById('itpFind'); q.value = 'h'; q.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    ok('1: one letter asks for a second one', await waitFor(`/at least 2 letters/.test(document.getElementById('itpFindRes').textContent)`, 3000));
    const findQ = 'sword';
    await ev(`(() => { const q = document.getElementById('itpFind'); q.value = ${JSON.stringify(findQ)}; q.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    const found = await waitFor(`document.querySelectorAll('#itpFindRes [data-itfgo]').length > 0 || /Nobody has anything|restart/.test(document.getElementById('itpFindRes').textContent)`, 10000);
    const nFound = await ev(`document.querySelectorAll('#itpFindRes [data-itfgo]').length`);
    ok('1: find answers (results or "nobody has it")', found, await ev(`document.getElementById('itpFindRes').textContent.slice(0, 200)`));
    if (nFound) {
      ok('1: results grouped by item, each holder with where + how old', await ev(`(() => { const g = document.querySelector('.itp-fg'); return !!g && !!g.querySelector('.itp-fgh .itp-fnm') && !!document.querySelector('#itpFindRes .itp-fh .itp-fw') && /ago|just now|yesterday/.test(document.getElementById('itpFindRes').textContent); })()`));
      ok('1: find results fit the phone', await noScroll());
      await shot('1b_find', '#itpFindBox');
      const tgt = await ev(`(() => { const R = ItemsPage._state.fres; for (let gi = 0; gi < R.items.length; gi++) { const hi = R.items[gi].holders.findIndex(H => H.kind === 'char'); if (hi >= 0) return { gi, hi, name: R.items[gi].holders[hi].name, item: R.items[gi].name, wh: !R.items[gi].holders[hi].rows.some(x => x.where !== 'wh') }; } const H = R.items[0].holders[0]; return { gi: 0, hi: 0, name: '', item: R.items[0].name, clan: H.kind === 'clan' }; })()`);
      await click(`[data-itfgo="${tgt.gi}|${tgt.hi}"]`);
      if (tgt.name) ok(`1: tapping a holder opens ${tgt.name} on ${tgt.wh ? 'the warehouse' : 'the bag'}, searching for ${tgt.item}`, await waitFor(`(() => { const S = ItemsPage._state; return S.name === ${JSON.stringify(tgt.name)} && S.d && S.d.name === S.name && S.place === ${JSON.stringify(tgt.wh ? 'wh' : 'bag')} && S.q === ${JSON.stringify(tgt.item)} && location.hash === '#/items/' + encodeURIComponent(${JSON.stringify(tgt.name)}); })()`, 20000));
      else ok('1: tapping the clan warehouse opens the clan warehouse tab', await waitFor(`ItemsPage._state.place === 'clan' && !!ItemsPage._state.name`, 20000));
      if (tgt.name) ok('1: the found item shows as a tile there', await waitFor(`[...document.querySelectorAll('.itp-tile')].some(t => t.title === ${JSON.stringify(tgt.item)})`, 8000));
      await click('[data-itfindx]');
      ok('1: Clear empties the find box', await waitFor(`document.getElementById('itpFind').value === '' && document.getElementById('itpFindRes').textContent.trim() === ''`, 3000));
      await click('[data-itclear]');
      await ev(`(ItemsPage._state.place = 'bag', true)`);
    }
    // ITEMS-COMPACT: once a character is picked the big list folds into one strip
    if (!(await ev(`ItemsPage._state.name === ${JSON.stringify(leader)}`))) {
      if (await ev(`!ItemsPage._state.name`)) await click(`[data-itchar="${leader}"]`);
      else { await click('[data-itchange]'); await waitFor(`!!document.querySelector('[data-itchar="${leader}"]')`, 5000); await click(`[data-itchar="${leader}"]`); }
    } else await ev(`(ItemsPage._state.place = 'bag', ItemsPage.open(${JSON.stringify(leader)}), true)`);
    ok(`2: ${leader}'s items load`, await waitFor(`!!(ItemsPage._state.d && ItemsPage._state.d.name === ${JSON.stringify(leader)})`, 20000), await ev(`document.getElementById('itpMsg').textContent`));
    ok('2: the character list folds into one strip (tap = switch)', await waitFor(`document.querySelectorAll('#itpChars [data-itchar]').length === 0 && !!document.querySelector('#itpChars .itp-who[data-itchange]')`, 5000));
    await click('[data-itchange]');
    ok('2: Switch opens the searchable list again', await waitFor(`document.querySelectorAll('#itpChars [data-itchar]').length > 10 && !!document.getElementById('itpCq')`, 5000));
    await click('[data-itchange]');
    ok('2: four places as tabs', (await ev(`document.querySelectorAll('.itp-tabs [data-itplace][role=tab]').length`)) === 4);
    ok('2: type + grade filters on one row (selects) + "only what it can wear"', await ev(`!!document.querySelector('.itp-filt select[data-itfsel]') && !!document.querySelector('.itp-filt select[data-itgsel]') && !!document.querySelector('.itp-filt [data-itusable]') && !!document.querySelector('.itp-filt #itpQ')`));
    ok('2: compact tiles: icon >= 40 px, every tile >= 44 px to tap, 4 per row on the phone', await waitFor(`(() => { const t = [...document.querySelectorAll('.itp-tile')]; const i = document.querySelector('.itp-tile .itp-ic img'); if (!i || !t.length) return false; const r0 = t[0].getBoundingClientRect(); return i.getBoundingClientRect().width >= 40 && t.every(x => { const r = x.getBoundingClientRect(); return r.height >= 44 && r.width >= 44; }) && t.filter(x => Math.abs(x.getBoundingClientRect().top - r0.top) < 2).length >= 4; })()`, 8000));
    ok('2: "Enchant several" is a clear button on the bag', await ev(`!!document.querySelector('.itp-bar2 .itp-mode[data-itmulti="1"]')`));
    ok('2: recent jobs + "What happened" are folded away', await ev(`[...document.querySelectorAll('#itpBody details.itp-more')].length >= 1 && [...document.querySelectorAll('#itpBody details.itp-more')].every(d => !d.open)`));
    await ev(`(() => { const s = document.querySelector('select[data-itfsel]'); s.value = 'weapon'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    ok('2: the type filter works (weapons only)', await waitFor(`ItemsPage._state.filter === 'weapon' && [...document.querySelectorAll('.itp-grp')].every(g => /Weapons|Worn/.test(g.textContent))`, 3000));
    await click('[data-itclear]');
    ok('2: "Show all" clears the filters', await waitFor(`ItemsPage._state.filter === 'all' && !document.querySelector('[data-itclear]')`, 3000));
    await click('[data-itmulti="1"]');
    ok('2: Enchant several opens its panel', await waitFor(`!!document.querySelector('.itp-multi [data-itmgo]')`, 3000));
    await click('.itp-multi [data-itmulti="0"]');
    ok('2: the bag has no sideways scroll', await noScroll());
    await shot('2_bag', '#itpBody');
    await click('[data-itplace="clan"]');
    ok('2: clan warehouse tiles', await waitFor(`document.querySelectorAll('.itp-tile').length > 5`, 5000));
    await shot('3_clan', '#itpBody');
    await click('[data-itplace="shop"]');
    ok('3: Giran shop tiles load', await waitFor(`document.querySelectorAll('.itp-tile').length > 50`, 15000));
    ok('3: the shops show "Buy several" (BUYMANY)', await ev(`!!document.querySelector('.itp-bar2 .itp-mode[data-itbuy="1"]')`));
    await click('[data-itbuy="1"]');
    ok('3: Buy several opens the buy list', await waitFor(`!!document.querySelector('.itp-multi [data-itcartgo]') && document.querySelector('[data-itcartgo]').disabled`, 3000));
    await click('.itp-multi [data-itbuy="0"]');
    await ev(`(() => { const q = document.getElementById('itpQ'); q.value = 'Homunkulus'; q.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await sleep(300);
    const tileIdx = await ev(`(() => { const t = [...document.querySelectorAll('.itp-tile[data-itsel]')].find(x => /^Homunkulus's Sword$/.test(x.title)); return t ? Number(t.dataset.itsel) : -1; })()`);
    ok("3: Homunkulus's Sword is for sale", tileIdx >= 0);
    await click(`[data-itsel="${tileIdx}"]`);
    ok('4: the item sheet opens', await waitFor(`!!document.querySelector('.itp-sheet')`, 5000));
    ok('4: the plan arrives', await waitFor(`!!(ItemsPage._state.plan && (ItemsPage._state.plan.steps || ItemsPage._state.plan.error))`, 10000));
    await click('[data-itto="6"]');
    ok('4: +6 shows the chance ladder (6 steps)', await waitFor(`document.querySelectorAll('.itp-lv').length === 6`, 5000));
    ok('4: Special Ability choices (Acumen, Conversion, Magic Paralyze)', await waitFor(`document.querySelectorAll('[data-itsa]').length === 4 && /Acumen/.test(document.querySelector('.itp-sas').textContent)`, 8000));
    await click('[data-itsa="6313"]');
    ok('4: the plan lists buy, enchant, Special Ability', await waitFor(`(() => { const P = ItemsPage._state.plan; return P && P.saId === 6313 && P.enchantTo === 6 && [...new Set(P.steps.map(x => x.k))].join() === 'buy,enchant,sa'; })()`, 10000), await ev(`JSON.stringify(ItemsPage._state.plan && ItemsPage._state.plan.steps)`));
    ok('4: missing materials -> "Do it" stays off', await ev(`(() => { const P = ItemsPage._state.plan; const b = document.querySelector('[data-itgo]'); return P.ok ? !b.disabled : b.disabled; })()`));
    ok('4: the sheet fits the phone (no sideways scroll)', await ev(`(() => { const s = document.querySelector('.itp-sheet'); return s.getBoundingClientRect().width <= innerWidth && s.scrollWidth <= s.clientWidth + 1; })()`));
    await shot('4_sheet_top', '.itp-sheet');
    await ev(`(() => { const s = document.querySelector('.itp-sheet'); s.scrollTop = 500; return true; })()`); await shot('5_sheet_plan');
    await click('[data-itclose]');
    // crafting
    const crafter = await ev(`(ItemsPage._state.chars.chars.find(c => c.crafter) || {}).name`);
    await ev(`(location.hash = '#/crafting/' + encodeURIComponent(${JSON.stringify(crafter)}), true)`);
    ok(`5: ${crafter}'s recipes load`, await waitFor(`!!(CraftPage._state.d && CraftPage._state.d.recipes && CraftPage._state.d.recipes.length > 50)`, 20000));
    await click('[data-cronly="all"]');
    ok('5: recipe rows with material chips', await waitFor(`document.querySelectorAll('.crp-row').length > 10 && document.querySelectorAll('.crp-mat').length > 10`, 5000));
    ok('5: no sideways scroll', await noScroll());
    await shot('6_crafting', '#crpBody');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev(`(location.hash = '#/items/' + encodeURIComponent(${JSON.stringify(leader)}), true)`); await sleep(1500); await shot('7_desktop', '#tab-items');
    ok('6: no browser alert / confirm / prompt', browserDialogs.length === 0, browserDialogs);
    ok('6: no page errors', errors.length === 0, errors.slice(0, 3));
    ok('6: no job file and no order written', dirList(path.join(LOGS, 'itemjobs')) === JOBS0 && dirList(path.join(LOGS, 'orders')) === OQ0);
    ok('6: no MCP call that changes anything', !mcp.some(l => /run_account_command|close_account|open_account|send_game_action/.test(l)), mcp.slice(-3));
  } finally {
    try { sock.close(); } catch (e) { } try { br.kill(); } catch (e) { } try { srv.kill(); } catch (e) { }
    try { cp.execSync(`taskkill /F /T /PID ${br.pid}`, { stdio: 'ignore' }); } catch (e) { }
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed — screenshots in ${OUT}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
