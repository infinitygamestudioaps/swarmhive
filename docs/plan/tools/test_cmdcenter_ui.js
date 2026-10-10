// Headless browser check of the dashboard command center (2026-10-08): Edge via CDP against the SANDBOX server
// (cmdcenter_testserver.js: mocked MCP, nothing reaches the game). Real /api/command sends are additionally intercepted in the browser
// (Fetch domain) and answered with a fake reply; only dry runs reach the sandbox. iPhone 390x844 + desktop 1366x900.
// Screenshots: docs/plan/mobile_check/cmdcenter_*.png
//   node docs/plan/tools/test_cmdcenter_ui.js
'use strict';
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'plan', 'mobile_check');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond, info }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // 1) sandbox server
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'] });
  const mcpLog = []; let PORT = 0;
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  // 2) browser
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-edge-'));
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
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `cmdcenter_${name}.png`), Buffer.from(r.data, 'base64')); };
  const dialogs = [], posts = [];
  handlers.push(async (m) => {
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push({ type: m.params.type, msg: m.params.message }); cdp('Page.handleJavaScriptDialog', { accept: true, promptText: 'YES' }).catch(() => { }); }
    if (m.method === 'Fetch.requestPaused') {
      const rq = m.params.request; let b = {}; try { b = JSON.parse(rq.postData || '{}'); } catch (e) { }
      if (rq.method === 'POST' && /\/api\/command$/.test(rq.url) && !b.dryRun) {          // a REAL order: never forwarded
        posts.push(b);
        const body = JSON.stringify({ ok: true, command: b.cmd || b.text, target: (b.targets || [b.target]).join(' + ') + ' (intercepted by the test)', sent: 1, sends: [{ to: 'test', ok: true }] });
        cdp('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(body).toString('base64') }).catch(() => { });
      } else if (rq.method === 'POST' && /\/api\/(system|clientmode|transfer|newchar|newaccount)/.test(rq.url)) {
        posts.push({ blocked: rq.url, body: b });
        cdp('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"ok":true}').toString('base64') }).catch(() => { });
      } else cdp('Fetch.continueRequest', { requestId: m.params.requestId }).catch(() => { });
    }
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: true, prompt: 'YES', onDialog: (d) => dialogs.push({ type: d.type, msg: d.msg, typeToConfirm: d.typeToConfirm }) });   // UIDIALOG 2026-10-10: the shared dialog answers itself
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
  const BASE = `http://127.0.0.1:${PORT}/`;
  const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }); };
  const desktop = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 Edg/130' }); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const type = async (sel, text) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(text)}; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

  // ===================== iPhone =====================
  await phone();
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  ok('page loads with party rows', await waitFor(`document.querySelectorAll('.mem2').length > 30`, 25000), await ev(`document.querySelectorAll('.mem2').length + ' rows'`).catch(() => ''));
  await waitFor(`!!window.CmdCenter && !!document.getElementById('ccTrig')`);
  await sleep(1200);                                                   // icons
  ok('new search field in the header, old bar hidden', await ev(`!!document.getElementById('ccTrig') && getComputedStyle(document.getElementById('say')).display === 'none'`));
  ok('no horizontal page scroll (iPhone)', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
  const icons = await ev(`(() => { const im = [...document.querySelectorAll('.mem2 .ic img')]; return { n: im.length, cls: im.filter(i => /\\/icons\\/class\\/class_\\d+\\.png$/.test(i.src)).length, loaded: im.filter(i => i.complete && i.naturalWidth > 0).length,
    bad: im.filter(i => !(i.complete && i.naturalWidth > 0) || !/\\/icons\\/class\\//.test(i.src)).map(i => i.closest('.mem2').dataset.char + ' ' + i.src.split('/').pop()) }; })()`);
  ok('every member row shows a CLASS icon that loaded', icons.n >= 39 && icons.cls === icons.n && icons.loaded === icons.n, `${icons.cls}/${icons.n} class icons, ${icons.loaded} loaded ${icons.bad.join(', ')}`);
  const perClass = await ev(`(() => { const m = {}; STATE.chars.forEach(c => { const img = document.querySelector('.mem2[data-char="' + c.name + '"] .ic img'); m[c.name] = c.classId + '=' + (img ? img.src.split('class_')[1] : 'none'); }); return m; })()`);
  ok('icon file = the character\'s current class id', Object.values(perClass).every(v => { const [a, b] = v.split('='); return b === a + '.png'; }), Object.entries(perClass).filter(([, v]) => { const [a, b] = v.split('='); return b !== a + '.png'; }).map(([k, v]) => k + ' ' + v).join(', ') || '39/39');
  await ev(`window.scrollTo(0, 0)`); await shot('01_iphone_header');
  await ev(`(() => { const r = document.querySelector('.mem2'); if (r) r.scrollIntoView({ block: 'center' }); })()`); await sleep(400); await shot('02_iphone_class_icons');
  await ev(`window.scrollTo(0, 0)`);
  // palette
  await click('#ccTrig'); await sleep(400);
  ok('palette opens (recent / common / parties / pages)', await ev(`!document.getElementById('ccOv').hidden && document.querySelectorAll('#ccBody .ccrow').length > 10`));
  await shot('03_iphone_palette');
  await type('#ccQ', 'tele giran'); await sleep(300);
  ok('fuzzy search "tele giran" finds Town teleport', await ev(`[...document.querySelectorAll('#ccBody .ccrow b')].slice(0, 6).some(b => /Town teleport/.test(b.textContent))`));
  await type('#ccQ', 'bish'); await sleep(300);
  ok('search finds the character Bishop1', await ev(`[...document.querySelectorAll('#ccBody .ccrow b')].slice(0, 3).some(b => b.textContent === 'Bishop1')`));
  await shot('04_iphone_search');
  // every command reachable from the palette by its title
  const reach = await ev(`(() => { const miss = []; SWARM_COMMANDS.COMMANDS.forEach(c => { if (!CmdCenter.search(c.title).some(o => o.kind === 'cmd' && o.c.id === c.id)) miss.push(c.id); }); return { n: SWARM_COMMANDS.COMMANDS.length, miss }; })()`);
  ok('every catalog command is found in the palette', !reach.miss.length, `${reach.n - reach.miss.length}/${reach.n} ${reach.miss.join(',')}`);
  const sheetReach = await ev(`(() => { const ids = new Set(); Object.keys(STATE.chars.reduce((m, c) => (m[c.party || c.name] = 1, m), {})).forEach(L => CmdCenter.sheetCommands('party:' + L).forEach(i => ids.add(i))); STATE.chars.forEach(c => CmdCenter.sheetCommands('char:' + c.name).forEach(i => ids.add(i)));
    const miss = SWARM_COMMANDS.COMMANDS.filter(c => !ids.has(c.id) && !c.targets.includes('none')).map(c => c.id); return { n: ids.size, miss }; })()`);
  ok('every character/party command is on some command sheet', !sheetReach.miss.length, `${sheetReach.n} on sheets ${sheetReach.miss.join(',')}`);
  // town teleport form
  await type('#ccQ', 'town teleport'); await sleep(200);
  await ev(`(() => { const r = [...document.querySelectorAll('#ccBody .ccrow')].find(r => /Town teleport/.test(r.textContent)); r.click(); return true; })()`); await sleep(300);
  await ev(`(() => { const s = document.getElementById('ccA_town'); s.value = 'Dion'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(600);
  ok('town form: dropdown + preview "#!town Dion"', await ev(`/#!town Dion/.test(document.querySelector('#ccBody .ccprev').textContent)`), await ev(`document.querySelector('#ccBody .ccprev').textContent.slice(0, 120)`));
  await shot('05_iphone_form_town');
  await ev(`CmdCenter.close()`); await sleep(300);
  // party command sheet from the party card
  await click('[data-cmdsheet="party:Tank1"]'); await sleep(500);
  ok('party card "Commands" opens the sheet for party Tank1', await ev(`/Party Tank1/.test(document.querySelector('#ccBody .cctarget').textContent) && document.querySelectorAll('#ccBody .cctile').length > 30`), await ev(`document.querySelectorAll('#ccBody .cctile').length + ' tiles'`));
  await shot('06_iphone_party_sheet');
  await click('#ccBody [data-cmd="level"]'); await sleep(900);
  ok('Level form previews party chat from Tank1 (server dry run)', await ev(`(() => { const t = document.querySelector('#ccBody .ccprev').textContent; return /#!level/.test(t) && /party chat from\\s*Tank1/.test(t); })()`), await ev(`document.querySelector('#ccBody .ccprev').textContent.replace(/\\s+/g, ' ').slice(0, 160)`));
  await shot('07_iphone_party_form_level');
  dialogs.length = 0; posts.length = 0;
  await click('[data-ccsend]'); await sleep(1200);
  ok('Send asks confirmOrder-style first', dialogs.length === 1 && /WHOLE party Tank1/.test(dialogs[0].msg), dialogs.map(d => d.msg.split('\n')[0]).join(' | '));
  ok('the order went out as { cmd: "!level", targets: ["party:Tank1"] } (intercepted)', posts.length === 1 && posts[0].cmd === '!level' && JSON.stringify(posts[0].targets) === '["party:Tank1"]', JSON.stringify(posts[0] || {}));
  await shot('08_iphone_sent');
  await sleep(1000); if (await ev(`!document.getElementById('ccOv').hidden`)) await ev(`CmdCenter.close()`);
  // destructive: /unstuck for Bishop1 needs the typed YES
  dialogs.length = 0; posts.length = 0;
  await ev(`CmdCenter.openCommand('b_unstuck', 'char:Bishop1')`); await sleep(700);
  await shot('09_iphone_destructive');
  await click('[data-ccsend]'); await sleep(1200);
  ok('destructive /unstuck: confirm + typed YES, sent with confirmDanger', dialogs.length === 2 && dialogs[1].typeToConfirm === 'YES' && posts.length === 1 && posts[0].confirmDanger === true && posts[0].cmd === '/unstuck', dialogs.map(d => d.type + (d.typeToConfirm ? '+YES' : '')).join(',') + ' ' + JSON.stringify(posts[0] || {}));
  await ev(`CmdCenter.close()`); await sleep(300);
  // multi-target: two characters + a party
  await ev(`CmdCenter.openCommand('buff', 'party:Destroyer3')`); await sleep(300);
  await ev(`(() => { document.querySelector('[data-togglechars]').click(); return true; })()`); await sleep(200);
  await click('[data-tg="char:Bishop1"]'); await sleep(150); await click('[data-tg="char:Necro1"]'); await sleep(900);
  ok('several targets: party Destroyer3 + Bishop1 + Necro1 in one order', await ev(`JSON.stringify(CmdCenter.state.targets) === '["party:Destroyer3","char:Bishop1","char:Necro1"]' && document.querySelectorAll('#ccBody .ccsend > div').length === 3`), await ev(`JSON.stringify(CmdCenter.state.targets)`));
  await shot('10_iphone_multi_target');
  await ev(`CmdCenter.close()`); await sleep(200);
  // character page: class icon + Commands button
  await ev(`location.hash = '#/char/Bishop1'`); await waitFor(`!!document.querySelector('#charBox [data-cmdsheet="char:Bishop1"]')`, 15000);
  ok('character page has a class icon + Commands button', await ev(`/class_16\\.png$/.test(document.querySelector('#charBox .whead img.cls').src) && !!document.querySelector('#charBox [data-cmdsheet="char:Bishop1"]')`));
  await click('#charBox .whead [data-cmdsheet="char:Bishop1"]'); await sleep(500);
  ok('character sheet opens', await ev(`/Bishop1/.test(document.querySelector('#ccBody .cctarget').textContent)`));
  await shot('11_iphone_char_sheet');
  await ev(`CmdCenter.close()`);

  // ===================== desktop =====================
  await desktop();
  await cdp('Page.navigate', { url: BASE + '#/parties' }); await waitFor(`document.querySelectorAll('.mem2').length > 30 && !!document.getElementById('ccTrig')`, 25000); await sleep(1200);
  await shot('12_desktop_parties');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`); await sleep(300);
  ok('Ctrl+K opens the palette on desktop', await ev(`!document.getElementById('ccOv').hidden`));
  await type('#ccQ', 'raid'); await sleep(300); await shot('13_desktop_palette');
  await ev(`CmdCenter.openSheet('party:Tank1')`); await sleep(400); await shot('14_desktop_party_sheet');
  await ev(`CmdCenter.openCommand('jointraid', 'party:Tank1')`); await sleep(1500); await shot('15_desktop_form_jointraid');

  // nothing reached the game: the sandbox's mock MCP saw only read calls (dry runs never call MCP)
  const writes = mcpLog.filter(l => /^MCP (run_account_command|send_game_action|close_account|open_account|manage_)/.test(l));
  ok('no game command reached even the mock MCP', !writes.length, writes.slice(0, 3).join(' | '));
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
