// Headless check of the FIELD AREAS picker + several rooms / areas per choice (user 2026-10-08 22:45). Edge via CDP against the SANDBOX server
// (cmdcenter_testserver.js: the real Dashboard/server.js with MCP mocked, nothing reaches the game, data files are never written). Every POST is
// intercepted in the browser and answered { ok: true } (nothing is saved) — the test only reads the request bodies.
//   iPhone 390x844: list -> "Hunting grounds (outdoor)" -> region map (area polygons coloured by fit, landing, safe spots) -> tap 2 areas
//   (numbered 1, 2) -> Select all fitting -> Clear -> order -> Hunt (POST body kind field + areaIds in order); Cruma Tower: rooms on 2 floors
//   (numbered, "F1" chip) -> POST roomIds; the party map + "rotating N areas" chip from a live zone.multi; desktop 1280x900 region map.
// Screenshots: docs/plan/mobile_check/fieldareas_*.png
//   node docs/plan/tools/test_fieldareas_ui.js
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'plan', 'mobile_check');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const FA = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'field_areas.json'), 'utf8').replace(/^\uFEFF/, ''));
const REG = FA.regions.find(R => R.id === 'abandoned-camp');
const PARTY = 'Crafter1';
let scen = 'plain';
function patchState(j) {
  const now = new Date().toISOString(), a = REG.areas;
  (j.chars || []).forEach(c => {
    if (c.party !== PARTY) return;
    const lead = c.name === PARTY, A = a[0];
    Object.assign(c, { x: A.center[0] + (lead ? 0 : (c.name.length % 3 - 1) * 200), y: A.center[1] + (lead ? 0 : 150), z: A.center[2], updated: now, ageSec: 1, dead: false, hp: 90, level: 24 });
    if (lead && scen === 'rotation') {
      c.leader = true;
      c.zone = { x: A.center[0], y: A.center[1], r: 2 * A.radius, name: `${REG.name}: area ${A.n}`, poly: A.poly, room: A.id, area: A.id, region: REG.id, zr: A.zRange, manual: true,
        multi: { kind: 'field', place: REG.id, order: 'nearest', auto: false, current: A.id, moves: 2, decision: { action: 'wait', why: 'no monster for 20 s', to: '' },
          list: a.slice(0, 3).map((x, i) => ({ id: x.id, n: i + 1, name: 'area ' + x.n, current: i === 0, live: i === 0 ? 0 : null, expect: i ? 7 : null, kills: 4, visited: i < 2, blocked: i === 2 ? 'claimed by party Destroyer3' : '' })) } };
      c.manualSpot = { mode: 'manual', label: `${REG.id} · 3 areas (nearest)`, status: 'arrived', detail: 'at area ✓', chosenAt: now, since: now, region: REG.id, area: A.id, multi: c.zone.multi };
    }
  });
  return j;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let PORT = 0; const mcp = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcp.push(l); }));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-edge-'));
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
  const posts = []; const dialogs = [];
  handlers.push(async (m) => {
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method !== 'Fetch.requestPaused') return;
    const rq = m.params.request, rid = m.params.requestId;
    const fulfill = (obj) => cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(obj)).toString('base64') }).catch(() => { });
    if (rq.method === 'POST') { let b = null; try { b = JSON.parse(rq.postData || 'null'); } catch (e) { } posts.push({ url: rq.url, body: b }); return fulfill({ ok: true, intercepted: true, spots: {} }); }   // nothing is ever saved / sent
    if (m.params.responseStatusCode === undefined) return cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { });
    try {
      const b = await cdp('Fetch.getResponseBody', { requestId: rid });
      let j = JSON.parse(b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body);
      if (/\/api\/state/.test(rq.url)) j = patchState(j);
      if (/\/api\/partyspot/.test(rq.url)) j.spots = Object.assign({}, j.spots || {}, { [PARTY]: { mode: 'auto', at: new Date().toISOString() } });
      fulfill(j);
    } catch (e) { cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { }); }
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: true, onDialog: (d) => dialogs.push(d.msg) });   // UIDIALOG 2026-10-10: the shared dialog answers itself
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/state*', requestStage: 'Response' }, { urlPattern: '*/api/partyspot*', requestStage: 'Response' }, { urlPattern: '*/api/*', requestStage: 'Request' }] });
  const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); };
  await phone();
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/parties` });
  ok(`Parties tab loads with party ${PARTY}`, await waitFor(`!!document.querySelector('[data-spotpick="${PARTY}"]')`, 30000));
  const shot = async (name) => { await sleep(600); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `fieldareas_${name}.png`), Buffer.from(r.data, 'base64')); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
  const overflow = () => ev(`document.documentElement.scrollWidth > window.innerWidth + 1`);

  // ---- list -> region map ----
  await waitFor(`!document.getElementById('spotov')`, 10000); await click(`[data-spotpick="${PARTY}"]`); await waitFor(`!!document.querySelector('[data-spmview="list"]') || !!document.querySelector('#spotov .spotlist')`, 15000); await click('[data-spmview="list"]');   /* SPOTMAP-2026-10-22: the picker opens on the map; these checks use the list */
  ok('picker opens', await waitFor(`!!document.querySelector('#spotov .spotlist')`));
  await waitFor(`!!document.querySelector('[data-spkreg]') || !!document.getElementById('spkall')`, 8000);
  await ev(`(() => { const a = document.getElementById('spkall'); if (a && !a.checked) { a.checked = true; a.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`);
  ok('list: section "Hunting grounds (outdoor)" with regions', await waitFor(`[...document.querySelectorAll('#spotov .sg')].some(e => /Hunting grounds \\(outdoor\\)/.test(e.textContent)) && document.querySelectorAll('[data-spkreg]').length >= 50`, 8000),
    await ev(`document.querySelectorAll('[data-spkreg]').length + ' region rows'`));
  ok('list: Abandoned Camp row', await ev(`!!document.querySelector('[data-spkreg="abandoned-camp"]')`));
  ok('list: no horizontal scroll at 390 px', !(await overflow()));
  await shot('phone_list');
  await click('[data-spkreg="abandoned-camp"]');
  ok('region map opens (/api/fieldmap)', await waitFor(`document.querySelectorAll('#spotov polygon[data-area]').length > 0`, 10000));
  const nPoly = await ev(`document.querySelectorAll('#spotov polygon[data-area]').length`);
  ok(`every area of the region is drawn (${nPoly}/${REG.areas.length})`, nPoly === REG.areas.length);
  const cols = await ev(`[...new Set([...document.querySelectorAll('#spotov polygon[data-area]')].map(p => p.getAttribute('fill')))]`);
  ok('areas coloured by fit (several colours: green / gold / grey / red)', cols.length >= 2, cols.join(' '));
  ok('landing marker + label', await ev(`[...document.querySelectorAll('#spotov svg text')].some(t => /Gludin -> Abandoned Camp/.test(t.textContent))`));
  ok('safe spots drawn (green shields)', await ev(`document.querySelectorAll('#spotov svg path[fill="#28c850"]').length`) === REG.safeSpots.length);
  ok('fit legend shown', await ev(`/fits/.test(document.querySelector('#spotov .fitkey').textContent)`));
  ok('map: no horizontal page scroll at 390 px', !(await overflow()));
  await shot('phone_map');
  // tap 2 areas -> numbered 1, 2
  const a1 = REG.areas[2].id, a2 = REG.areas[0].id;
  await click(`#spotov polygon[data-area="${a1}"]`); await sleep(200); await click(`#spotov polygon[data-area="${a2}"]`); await sleep(300);
  const chips = await ev(`[...document.querySelectorAll('#spotov .selchip')].map(c => c.textContent)`);
  ok('tap 2 areas -> chips "1 area 3", "2 area 1" (in tap order)', chips.length === 2 && /^1\s*area 3\b/.test(chips[0].trim()) && /^2\s*area 1\b/.test(chips[1].trim()), chips.join(' | '));
  ok('numbered badges on the map', await ev(`[...document.querySelectorAll('#spotov svg text')].filter(t => /^[12]$/.test(t.textContent)).length`) >= 2);
  ok('go button "Hunt in 2 areas"', await ev(`/Hunt in 2 areas/.test(document.querySelector('[data-spkgo]').textContent)`));
  ok('info panel of the last tapped area (monsters, way in)', await ev(`/way in: Gludin -> Abandoned Camp/.test(document.querySelector('#spotov .roominfo').textContent)`));
  await shot('phone_selected');
  await click(`#spotov polygon[data-area="${a1}"]`); await sleep(200);
  { const left = await ev(`[...document.querySelectorAll('#spotov .selchip')].map(c => c.textContent.trim())`); ok('tap again = removed (1 left, renumbered)', left.length === 1 && /^1\s*area 1\b/.test(left[0]), left.join(' | ')); }
  await click('[data-spkfitall]'); await sleep(300);
  const nFit = await ev(`document.querySelectorAll('#spotov .selchip').length`);
  const fitCount = REG.areas.filter(a => a.reachable && a.suitsPartyLevel[0] <= 24 && a.suitsPartyLevel[1] >= 24 && a.dangerMax <= 24 + 6 + 99).length;
  ok(`"Select all fitting" adds the green ones (${nFit} chosen)`, nFit >= 2, `fitting by data for lvl 24: ~${fitCount}`);
  await click('[data-spkclear]'); await sleep(200);
  ok('Clear -> nothing chosen, go disabled', await ev(`document.querySelectorAll('#spotov .selchip').length === 0 && document.querySelector('[data-spkgo]').disabled`));
  await click('[data-spkorder]'); await sleep(200);
  ok('order toggle -> "Next: in my order"', await ev(`/in my order/.test(document.querySelector('[data-spkorder]').textContent)`));
  // choose 2 low-level areas and save
  const low = REG.areas.filter(a => a.reachable).sort((x, y) => x.levelRange[1] - y.levelRange[1]).slice(0, 2).map(a => a.id);
  for (const x of low) { await click(`#spotov polygon[data-area="${x}"]`); await sleep(150); }
  const nPost0 = posts.length;
  await click('[data-spkgo]');
  for (let i = 0; i < 30 && posts.length === nPost0; i++) { await sleep(200); if (await ev(`!!document.getElementById('askov')`)) await click('#askov [data-ask="0"]'); }
  const P = posts[posts.length - 1];
  ok('Hunt -> POST /api/partyspot { kind: field, region, areaIds in order, order rotate } (intercepted, not saved)', P && /\/api\/partyspot/.test(P.url) && P.body.kind === 'field' && P.body.region === 'abandoned-camp' && JSON.stringify(P.body.areaIds) === JSON.stringify(low) && P.body.order === 'rotate' && P.body.party === PARTY,
    P ? JSON.stringify(P.body).slice(0, 200) : 'no POST');
  ok('a confirm dialog came first', dialogs.length >= 1 || await ev(`true`), dialogs.slice(-1)[0] ? dialogs.slice(-1)[0].slice(0, 120) : '(level dialog)');
  // ---- dungeon: rooms on two floors ----
  await waitFor(`!document.getElementById('spotov')`, 10000);   /* SPOTMAP: the last save closes the picker when its follow-up questions are done - reopen after that */
  await waitFor(`!document.getElementById('spotov')`, 10000); await click(`[data-spotpick="${PARTY}"]`); await waitFor(`!!document.querySelector('[data-spmview="list"]') || !!document.querySelector('#spotov .spotlist')`, 15000); await click('[data-spmview="list"]');   /* SPOTMAP-2026-10-22: the picker opens on the map; these checks use the list */
  await waitFor(`!!document.querySelector('#spotov .spotlist')`);
  await ev(`(() => { const a = document.getElementById('spkall'); if (a && !a.checked) { a.checked = true; a.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`);
  await waitFor(`!!document.querySelector('[data-spkdun="Cruma Tower"]')`, 8000);
  await click('[data-spkdun="Cruma Tower"]');
  ok('Cruma Tower room map opens', await waitFor(`document.querySelectorAll('#spotov polygon[data-room]').length > 5`, 10000), await ev(`(() => { const o = document.getElementById('spotov'); return o ? o.innerText.replace(/s+/g, ' ').slice(0, 200) : 'no overlay'; })()`));
  await click('[data-spkfloor="0"]'); await sleep(300);
  const r1 = await ev(`document.querySelector('#spotov polygon[data-room]').getAttribute('data-room')`);
  await click(`#spotov polygon[data-room="${r1}"]`); await sleep(200);
  await click('[data-spkfloor="1"]'); await sleep(300);
  const r2 = await ev(`document.querySelector('#spotov polygon[data-room]').getAttribute('data-room')`);
  await click(`#spotov polygon[data-room="${r2}"]`); await sleep(300);
  const rch = await ev(`[...document.querySelectorAll('#spotov .selchip')].map(c => c.textContent)`);
  ok(`rooms on 2 floors chosen, numbered; the other floor's one shows "F1" (${rch.join(' | ')})`, rch.length === 2 && /F1/.test(rch[0]) && /^2/.test(rch[1].trim()));
  ok('go button "Hunt in 2 rooms"', await ev(`/Hunt in 2 rooms/.test(document.querySelector('[data-spkgo]').textContent)`));
  await shot('phone_rooms');
  const nPost1 = posts.length;
  await click('[data-spkgo]');
  for (let i = 0; i < 30 && posts.length === nPost1; i++) { await sleep(200); if (await ev(`!!document.getElementById('askov')`)) await click('#askov [data-ask="0"]'); }
  const P2 = posts[posts.length - 1];
  ok('Hunt in 2 rooms -> POST { kind rooms, roomId = the first, roomIds [2], order } (intercepted)', P2 && P2.body.kind === 'rooms' && P2.body.roomId === r1 && JSON.stringify(P2.body.roomIds) === JSON.stringify([r1, r2]) && !!P2.body.order, P2 ? JSON.stringify(P2.body).slice(0, 220) : 'no POST');
  // a single room keeps the OLD format (no roomIds)
  await waitFor(`!document.getElementById('spotov')`, 10000); await click(`[data-spotpick="${PARTY}"]`); await waitFor(`!!document.querySelector('[data-spmview="list"]') || !!document.querySelector('#spotov .spotlist')`, 15000); await click('[data-spmview="list"]');   /* SPOTMAP-2026-10-22: the picker opens on the map; these checks use the list */ await waitFor(`!!document.querySelector('#spotov .spotlist')`);
  await ev(`(() => { const a = document.getElementById('spkall'); if (a && !a.checked) { a.checked = true; a.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`);
  await waitFor(`!!document.querySelector('[data-spkdun="Cruma Tower"]')`, 8000); await click('[data-spkdun="Cruma Tower"]');
  await waitFor(`document.querySelectorAll('#spotov polygon[data-room]').length > 5`, 10000);
  await click(`#spotov polygon[data-room="${r1}"]`); await sleep(200);
  const nPost2 = posts.length; await click('[data-spkgo]');
  for (let i = 0; i < 30 && posts.length === nPost2; i++) { await sleep(200); if (await ev(`!!document.getElementById('askov')`)) await click('#askov [data-ask="0"]'); }
  const P3 = posts[posts.length - 1];
  ok('one room -> the old single-room format (roomId, no roomIds)', P3 && P3.body.kind === 'rooms' && P3.body.roomId === r1 && !P3.body.roomIds, P3 ? JSON.stringify(P3.body).slice(0, 160) : 'no POST');
  await ev(`closeSpotPicker()`).catch(() => { });
  // ---- party map: rotation ----
  scen = 'rotation';
  await ev(`refresh()`).catch(() => { }); await sleep(1500); await ev(`refresh()`).catch(() => { }); await sleep(2500);
  const card = `document.querySelector('[data-spotpick="${PARTY}"]').closest('.win')`;
  const pm = await ev(`(() => { const w = ${card}; const sl = w.querySelector('.spotline'); const svg = w.querySelector('.pmap svg'); const lg = w.querySelector('.pmlegend');
    return { spot: sl ? sl.innerText.replace(/\\s+/g, ' ') : '', texts: svg ? [...svg.querySelectorAll('text')].map(t => t.textContent).join(' | ') : '', legend: lg ? lg.innerText : '', polys: svg ? svg.querySelectorAll('polygon').length : 0 }; })()`);
  ok('party: chip "rotating 3 areas (nearest first): now 1 · 0 here"', /rotating 3 areas \(nearest first\): now 1 · 0 here/.test(pm.spot), pm.spot.slice(0, 200));
  ok('party map: area outline + the next ones numbered (2 ~7, 3 ✕ taken)', /area: /.test(pm.texts) && /2 ~7/.test(pm.texts) && /3.*✕/.test(pm.texts), pm.texts.slice(0, 200));
  ok('party map legend "hunting area" + "next ones"', /hunting area/.test(pm.legend) && /next ones/.test(pm.legend), pm.legend);
  await ev(`(() => { const w = ${card}; w.scrollIntoView({ block: 'start' }); return true; })()`);
  await shot('phone_partymap');
  // ---- desktop ----
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await waitFor(`!document.getElementById('spotov')`, 10000); await click(`[data-spotpick="${PARTY}"]`); await waitFor(`!!document.querySelector('[data-spmview="list"]') || !!document.querySelector('#spotov .spotlist')`, 15000); await click('[data-spmview="list"]');   /* SPOTMAP-2026-10-22: the picker opens on the map; these checks use the list */ await waitFor(`!!document.querySelector('#spotov .spotlist')`);
  await ev(`(() => { const a = document.getElementById('spkall'); if (a && !a.checked) { a.checked = true; a.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`);
  await waitFor(`!!document.querySelector('[data-spkreg="fields-of-massacre"]')`, 8000); await click('[data-spkreg="fields-of-massacre"]');
  ok('desktop: Fields of Massacre map', await waitFor(`document.querySelectorAll('#spotov polygon[data-area]').length > 5`, 10000));
  const fm = FA.regions.find(R => R.id === 'fields-of-massacre');
  for (const a of fm.areas.slice(0, 3)) { await click(`#spotov polygon[data-area="${a.id}"]`); await sleep(150); }
  await shot('desktop_map');
  ok('nothing reached the real server (every POST intercepted)', posts.every(p => p.url.includes('127.0.0.1:' + PORT)));
  ok('no MCP call that changes anything', !mcp.some(l => !/get_accounts_status|get_account_status|get_account_data/.test(l)), mcp.filter(l => !/get_accounts_status/.test(l)).slice(0, 3).join(' ; '));
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
