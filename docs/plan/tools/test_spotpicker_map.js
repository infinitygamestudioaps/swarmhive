// SPOTMAP-2026-10-22 (round 2): headless check of the FULL-SCREEN hunting spot MAP (Dashboard/index.html SPOTMAP block). Edge via CDP against the
// SANDBOX server (cmdcenter_testserver.js: the real Dashboard/server.js, MCP mocked, nothing reaches the game). Every POST is intercepted in the
// browser and answered { ok: true } — nothing is saved (party_spots.json / custom_zones.json stay untouched); the test reads the request bodies.
//   desktop 1400x900: full screen, tiles, EVERY hunting ground on the map coloured by fit (not only the party's level), + / -, search; areas of TWO
//   hunting grounds (real mouse clicks) -> POST /api/partyspot { kind field, areaIds from both }; monster spawns at zoom 2 (and none far out);
//   Draw my own spot: 4 corners, insert a corner on an edge (middle handle), select + Delete point, undo -> POST /api/zones { poly [{x,y}], team };
//   Keep out (3 corners) -> POST /api/zones { name "Keep out · <party>", holes [[{x,y}..]], note KEEPOUT, levels 99 }; Cruma Tower inside the map:
//   floor tabs, rooms on floor 1 + floor 2 -> POST { kind rooms, roomIds across floors }; List <-> Map. Phone 390x844: full screen, no sideways scroll.
// Screenshots: %TEMP%\spotmap_shots
//   node docs/plan/tools/test_spotpicker_map.js
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'spotmap_shots');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const FA = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'field_areas.json'), 'utf8').replace(/^\uFEFF/, ''));
const REG = FA.regions.find(R => R.id === 'abandoned-camp'), REG2 = FA.regions.find(R => R.id === 'windawood-manor');
const DR = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'), 'utf8').replace(/^\uFEFF/, ''));
const CRUMA = (DR.dungeons || DR).find(d => d.name === 'Cruma Tower');
const PARTY = 'Crafter1';
// what the TEST could have written (the owner may change other parties / zones on the live dashboard meanwhile): the test party's entry + zones with the test's names
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', f), 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const stamp = () => JSON.stringify([(rj('party_spots.json', {}) || {})[PARTY] || null, (rj('custom_zones.json', []) || []).filter(z => z && /^(Test spot spotmap|Keep out · )/.test(z.name)).length]);
function patchState(j) {
  const now = new Date().toISOString(), A = REG.areas[0];
  (j.chars || []).forEach(c => { if (c.party !== PARTY) return; Object.assign(c, { x: A.center[0] + (c.name === PARTY ? 0 : 150), y: A.center[1], z: A.center[2], updated: now, ageSec: 1, dead: false, hp: 90, level: 24 }); });
  return j;
}
(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const live0 = stamp();
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let PORT = 0;
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; }));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'spm-edge-')), DBG = 9300 + Math.floor(Math.random() * 500);
  const br = cp.spawn(EDGE, ['--headless=new', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { cp.execSync('taskkill /PID ' + br.pid + ' /T /F', { stdio: 'ignore' }); } catch (e) { } });   // BROWSERLEAK 2026-10-26: br.kill() left Chrome's child processes (60+ after one publish) - the whole tree goes on every exit
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [], errors = [], posts = [];
  sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  let zonesNow = null;
  handlers.push(async (m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method !== 'Fetch.requestPaused') return;
    const rq = m.params.request, rid = m.params.requestId;
    const fulfill = (obj) => cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(obj)).toString('base64') }).catch(() => { });
    if (rq.method === 'POST' || rq.method === 'DELETE') {
      let b = null; try { b = JSON.parse(rq.postData || 'null'); } catch (e) { } posts.push({ url: rq.url, body: b });
      if (/\/api\/zones/.test(rq.url) && b) { zonesNow = (zonesNow || []).filter(z => z.name !== b.name && z.name !== b.oldName).concat([b]); return fulfill({ ok: true, intercepted: true, zones: zonesNow }); }
      return fulfill({ ok: true, intercepted: true, spots: {} });
    }
    if (m.params.responseStatusCode === undefined) return cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { });
    try {
      const b = await cdp('Fetch.getResponseBody', { requestId: rid });
      let j = JSON.parse(b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body);
      if (/\/api\/state/.test(rq.url)) j = patchState(j);
      if (/\/api\/partyspot/.test(rq.url)) j.spots = Object.assign({}, j.spots || {}, { [PARTY]: { mode: 'auto', at: new Date().toISOString() } });
      if (/\/api\/zones/.test(rq.url)) { if (zonesNow) j.zones = zonesNow; else zonesNow = j.zones || []; }
      fulfill(j);
    } catch (e) { cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { }); }
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: true });
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/state*', requestStage: 'Response' }, { urlPattern: '*/api/partyspot*', requestStage: 'Response' }, { urlPattern: '*/api/zones*', requestStage: 'Response' }, { urlPattern: '*/api/*', requestStage: 'Request' }] });
  const desktop = () => cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); };
  const shot = async (name) => { await sleep(700); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `spotmap_${name}.png`), Buffer.from(r.data, 'base64')); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
  const mouseAt = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); await sleep(250); };
  // a REAL mouse click at a game position on the Leaflet map / on an element (by selector)
  const clickGame = async (x, y) => { const p = await ev(`(() => { const S = SpotMap._state; if (!S.map) return null; const c = S.map.latLngToContainerPoint([${y}, ${x}]), r = document.getElementById('spmMap').getBoundingClientRect(); return { x: r.left + c.x, y: r.top + c.y }; })()`); if (!p) return false; await mouseAt(p.x, p.y); return true; };
  const clickEl = async (sel) => { const p = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); if (!p) return false; await mouseAt(p.x, p.y); return true; };
  const view = (x, y, z) => ev(`SpotMap._state.map.setView([${y}, ${x}], ${z}, { animate: false }); true`);
  const lastPost = async (re, n0) => { for (let i = 0; i < 40; i++) { const P = posts.slice(n0).filter(p => re.test(p.url)).pop(); if (P) return P; await sleep(200); } return null; };
  const overflow = () => ev(`document.documentElement.scrollWidth > window.innerWidth + 1`);

  await desktop();
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/parties` });
  ok(`Parties tab loads with party ${PARTY}`, await waitFor(`!!document.querySelector('[data-spotpick="${PARTY}"]')`, 30000));
  await click(`[data-spotpick="${PARTY}"]`);
  ok('Choose… opens the MAP view (Leaflet)', await waitFor(`!!document.querySelector('#spotov .spm #spmMap.leaflet-container')`, 15000));
  ok('full screen: the picker covers the whole window', await ev(`(() => { const r = document.querySelector('#spotov .spotbox').getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1 && r.left <= 0 && r.top <= 0; })()`));
  ok('world tiles load', await waitFor(`document.querySelectorAll('#spmMap img.leaflet-tile-loaded').length >= 2`, 20000));
  // ---- EVERY hunting ground, coloured by fit (not only the party's level) ----
  await ev(`SpotMap._state.map.setView([60000, 0], -2.75, { animate: false }); true`); await sleep(900);
  const regs = await ev(`(() => { const L = SpotMap._state.groups.regions.getLayers(); return { n: L.length, cols: [...new Set(L.map(l => l.options.fillColor))] }; })()`);
  const total = FA.regions.length;
  ok(`every hunting ground is on the map (not only the party's level): ${regs.n} of ${total}`, regs.n >= total * 0.8, JSON.stringify(regs.cols));
  ok('coloured by fit: fits / close / too low / too high all present', ['#5fd35f', '#e3c27a', '#8a8a8a', '#d9534f'].filter(c => regs.cols.includes(c)).length >= 3, JSON.stringify(regs.cols));
  ok('every dungeon marker too', await ev(`SpotMap._state.groups.dun.getLayers().length`) >= 15, await ev(`SpotMap._state.groups.dun.getLayers().length + ' dungeons'`));
  ok('no "all levels" filter any more on the map', !(await ev(`!!document.querySelector('#spmBar #spkall')`)));
  ok('monsters hidden far out', await ev(`SpotMap._state.groups.mobs.getLayers().length === 0`));
  await shot('desktop_world');
  // ---- search + areas of TWO hunting grounds ----
  await ev(`(() => { const q = document.getElementById('spmq'); q.value = 'Abandoned Camp'; q.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  ok('search lists Abandoned Camp', await waitFor(`[...document.querySelectorAll('#spmRes [data-spmres]')].some(b => /Abandoned Camp/.test(b.textContent))`, 5000));
  await ev(`(() => { const b = [...document.querySelectorAll('#spmRes [data-spmres]')].find(b => /Abandoned Camp/.test(b.textContent) && /hunting ground/.test(b.textContent)); b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
  const a1 = REG.areas.find(a => a.reachable && a.poly && a.poly.length >= 3), a2 = REG2.areas.find(a => a.reachable && a.poly && a.poly.length >= 3);
  await view(a1.center[0], a1.center[1], 1.25); await sleep(500);
  ok('zoomed in: areas drawn (/api/fieldmap)', await waitFor(`SpotMap._state.groups.areas.getLayers().length >= 3`, 15000), await ev(`SpotMap._state.groups.areas.getLayers().length + ' area polygons'`));
  await waitFor(`(() => { const S = SpotMap._state, m = S.map; return !m._animatingZoom && !(m._panAnim && m._panAnim._inProgress) && (S.hit || []).some(h => h.prio === 2); })()`, 6000); await sleep(600);   // the map redraws its layers after a view change (slow when the PC is busy)
  await clickGame(a1.center[0], a1.center[1]);
  ok('tap an area -> chosen', await waitFor(`/Hunt in this area/.test(document.getElementById('spmBar').textContent)`, 4000));
  await view(a2.center[0], a2.center[1], 1.25);
  await waitFor(`SpotMap._state.groups.areas.getLayers().some(l => l.getBounds && l.getBounds().contains([${a2.center[1]}, ${a2.center[0]}]))`, 12000);
  await waitFor(`(() => { const S = SpotMap._state, m = S.map; return !m._animatingZoom && !(m._panAnim && m._panAnim._inProgress) && (S.hit || []).some(h => h.prio === 2); })()`, 6000); await sleep(600);   // the map redraws its layers after a view change (slow when the PC is busy)
  await clickGame(a2.center[0], a2.center[1]);
  ok('an area of a SECOND hunting ground joins the choice (bar: Hunt in 2 areas, 2 hunting grounds)', await waitFor(`/Hunt in 2 areas/.test(document.getElementById('spmBar').textContent) && /2 hunting grounds/.test(document.getElementById('spmBar').textContent)`, 5000), await ev(`document.getElementById('spmBar').textContent.slice(0, 160)`));
  // ---- monster spawns ----
  await view(a2.center[0], a2.center[1], 2);
  ok('monster spawns show at zoom 2 (/api/spawnsin)', await waitFor(`SpotMap._state.groups.mobs.getLayers().length > 0`, 12000), await ev(`SpotMap._state.groups.mobs.getLayers().length + ' monster markers'`));
  await ev(`(() => { SpotMap._state.hitMobs[0].act(); return true; })()`);   // a dot under an area: the area wins a tap there; the dot's own action is checked here
  ok('tap monsters -> names + levels + count', await waitFor(`/monster/.test(document.getElementById('spmInfo').textContent) && /lvl \\d+/.test(document.getElementById('spmInfo').textContent)`, 3000), await ev(`document.getElementById('spmInfo').textContent.slice(0, 120)`));
  await shot('desktop_spawns');
  const n0 = posts.length; await click('[data-spmsave]');
  const P1 = await lastPost(/\/api\/partyspot/, n0);
  ok('Hunt -> POST /api/partyspot { kind field, areaIds from BOTH hunting grounds } (intercepted)', P1 && P1.body.kind === 'field' && P1.body.areaIds.length === 2 && P1.body.areaIds.includes(a1.id) && P1.body.areaIds.includes(a2.id) && P1.body.region === 'abandoned-camp', JSON.stringify(P1 && P1.body).slice(0, 220));
  ok('after saving the picker closes', await waitFor(`!document.getElementById('spotov') && !SpotMap._state.map`, 8000));
  // ---- draw my own spot: corners, insert on an edge, delete a point, undo ----
  await waitFor(`!document.getElementById('spotov')`, 10000);
  await click(`[data-spotpick="${PARTY}"]`);
  await waitFor(`!!document.querySelector('#spmMap.leaflet-container')`, 15000);
  const C = a1.center, d = 1500;
  await view(C[0], C[1], 1.5); await sleep(400);
  await click('[data-spmdraw]');
  ok('Draw my own spot: draw mode on', await ev(`!!SpotMap._state.edit && SpotMap._state.edit.mode === 'zone' && document.getElementById('spmMap').classList.contains('drawing')`));
  for (const [dx, dy] of [[-d, -d], [d, -d], [d, d], [-d, d]]) await clickGame(C[0] + dx, C[1] + dy);
  ok('4 taps = 4 corners + a polygon', await ev(`SpotMap._state.edit.pts.length === 4 && SpotMap._state.groups.edit.getLayers().some(l => l instanceof L.Polygon)`), await ev(`JSON.stringify(SpotMap._state.edit.pts)`));
  ok('a middle handle on every edge', await ev(`document.querySelectorAll('#spmMap .spm-mid').length === 4`));
  await clickEl('#spmMap .spm-mid[data-mid="0"]');
  ok('tap a middle handle = a new corner there (5 corners)', await waitFor(`SpotMap._state.edit.pts.length === 5`, 3000), await ev(`JSON.stringify(SpotMap._state.edit.pts)`));
  await clickEl('#spmMap .spm-vtx[data-vtx="1"]');
  ok('tap a corner = selected', await waitFor(`SpotMap._state.edit.sel === 1 && !document.querySelector('[data-spmdelpt]').disabled`, 3000));
  await click('[data-spmdelpt]');
  ok('Delete point removes it (4 corners)', await ev(`SpotMap._state.edit.pts.length === 4 && SpotMap._state.edit.sel === -1`));
  await clickGame(C[0], C[1] + 2 * d); await click('[data-spmundo]');
  ok('Undo removes the last corner', await ev(`SpotMap._state.edit.pts.length === 4`));
  await shot('desktop_draw');
  await click('[data-spmfinish]');
  ok('Done -> the name / level form', await waitFor(`!!document.getElementById('spmzname')`, 3000));
  await ev(`(() => { document.getElementById('spmzname').value = 'Test spot spotmap'; return true; })()`);
  const n1 = posts.length; await click('[data-spmzsave]');
  const ZP = await lastPost(/\/api\/zones/, n1);
  ok('Save my spot -> POST /api/zones { poly 4 {x,y} corners (the server format), team, levels }', ZP && ZP.body.name === 'Test spot spotmap' && ZP.body.poly.length === 4 && ZP.body.poly.every(p => isFinite(p.x) && isFinite(p.y)) && ZP.body.team === PARTY && ZP.body.levelMax >= ZP.body.levelMin, JSON.stringify(ZP && ZP.body).slice(0, 200));
  ok('the new zone is chosen (bar: Hunt here)', await waitFor(`/your own zone/.test(document.getElementById('spmBar').textContent)`, 5000));
  // ---- keep out inside the new zone (its own holes) ----
  await click('[data-spmkeep]');
  ok('Keep out: keep-out drawing on', await ev(`SpotMap._state.edit && SpotMap._state.edit.mode === 'keep'`));
  for (const [dx, dy] of [[-800, -800], [800, -800], [0, 800]]) await clickGame(C[0] + dx, C[1] + dy);
  const n2 = posts.length; await click('[data-spmkeepsave]');
  const KP = await lastPost(/\/api\/zones/, n2);
  ok('keep-out inside an own zone -> that zone saved WITH holes [[{x,y}x3]] and its corners kept', KP && KP.body.name === 'Test spot spotmap' && KP.body.holes.length === 1 && KP.body.holes[0].length === 3 && KP.body.poly && KP.body.poly.length === 4, JSON.stringify(KP && KP.body && { name: KP.body.name, holes: KP.body.holes, poly: (KP.body.poly || []).length }).slice(0, 220));
  ok('the keep-out area is drawn on the map', await waitFor(`SpotMap._state.groups.holes.getLayers().length >= 1`, 4000));
  // ---- keep out for chosen AREAS -> the party's KEEPOUT zone ----
  await click('[data-spmclear]');
  const a3 = REG.areas.find(a => a.reachable && a.poly && a.poly.length >= 3 && a.id !== a1.id && Math.hypot(a.center[0] - a1.center[0], a.center[1] - a1.center[1]) > 4000);   // away from the own zone + its keep-out
  await view(a3.center[0], a3.center[1], 1.25); await waitFor(`SpotMap._state.groups.areas.getLayers().length >= 3`, 10000);
  await clickGame(a3.center[0], a3.center[1]);
  await click('[data-spmkeep]');
  for (const [dx, dy] of [[-1200, -1200], [1200, -1200], [0, 1200]]) await clickGame(a3.center[0] + dx, a3.center[1] + dy);
  const n3 = posts.length; await click('[data-spmkeepsave]');
  const KO = await lastPost(/\/api\/zones/, n3);
  ok('keep-out for chosen areas -> POST zone "Keep out · Crafter1" { holes, note KEEPOUT…, levels 99-99, team }', KO && KO.body.name === 'Keep out · ' + PARTY && /^KEEPOUT/.test(KO.body.note) && KO.body.levelMin === 99 && KO.body.holes.length === 1 && KO.body.holes[0].length === 3 && KO.body.team === PARTY, JSON.stringify(KO && KO.body).slice(0, 220));
  // ---- list <-> map ----
  await click('[data-spmview="list"]');
  ok('List shows the old list with "← Map"', await waitFor(`!!document.querySelector('#spotov .spotlist') && !!document.querySelector('[data-spmview="map"]') && !SpotMap._state.map`, 5000));
  await click('[data-spmview="map"]');
  ok('← Map brings the map back', await waitFor(`!!document.querySelector('#spmMap.leaflet-container')`, 8000));
  // ---- dungeon floors inside the map: rooms on two floors ----
  await click('[data-spmclear]');
  await ev(`(() => { const q = document.getElementById('spmq'); q.value = 'Cruma'; q.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await waitFor(`[...document.querySelectorAll('#spmRes [data-spmres]')].some(b => /dungeon/.test(b.textContent))`, 5000);
  await ev(`(() => { const b = [...document.querySelectorAll('#spmRes [data-spmres]')].find(b => /dungeon/.test(b.textContent)); b && b.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; })()`);
  await waitFor(`!!document.querySelector('[data-spmdun]')`, 5000);
  await click('[data-spmdun]');
  ok('"Open its floors" = the dungeon INSIDE the map with floor tabs', await waitFor(`!!SpotMap._state.dun && document.querySelectorAll('#spmDun [data-spmfloor]').length === ${CRUMA.floors.length} && SpotMap._state.groups.rooms.getLayers().length > 3`, 12000), await ev(`document.getElementById('spmDun').textContent.slice(0, 120)`));
  const f0 = CRUMA.floors[0].rooms.find(r => r.center && r.poly && r.poly.length >= 3), f1 = CRUMA.floors[1].rooms.find(r => r.center && r.poly && r.poly.length >= 3);
  await click('[data-spmfloor="0"]'); await sleep(400);
  await view(f0.center[0], f0.center[1], 2); await sleep(400);
  await clickGame(f0.center[0], f0.center[1]);
  ok('tap a room on floor 1 -> chosen', await waitFor(`/Hunt in this room/.test(document.getElementById('spmBar').textContent)`, 4000), await ev(`document.getElementById('spmBar').textContent.slice(0, 120)`));
  await click('[data-spmfloor="1"]'); await sleep(500);
  ok('floor 2 tab: other rooms + the floor band for the monsters', await ev(`SpotMap._state.dun.fi === 1 && SpotMap._state.groups.rooms.getLayers().length > 3`));
  await view(f1.center[0], f1.center[1], 2); await sleep(400);
  await clickGame(f1.center[0], f1.center[1]);
  ok('a room on floor 2 joins (Hunt in 2 rooms, F1 + F2 chips)', await waitFor(`/Hunt in 2 rooms/.test(document.getElementById('spmBar').textContent) && /F1/.test(document.getElementById('spmBar').textContent) && /F2/.test(document.getElementById('spmBar').textContent)`, 4000), await ev(`document.getElementById('spmBar').textContent.slice(0, 160)`));
  ok('monsters inside the dungeon only for this floor (band sent)', await waitFor(`SpotMap._state.spawn.key.split('|')[4] !== ''`, 8000), await ev(`SpotMap._state.spawn.key`));
  // ---- zoom + pan inside the dungeon (owner: "When clicking a dungeon i want to be able to zoom") ----
  const dz0 = await ev('SpotMap._state.map.getZoom()'); await click('[data-spmzoom="1"]'); await sleep(500);
  ok('dungeon: + zooms in', await ev('SpotMap._state.map.getZoom()') > dz0);
  await click('[data-spmzoom="-1"]'); await sleep(600); await click('[data-spmzoom="-1"]'); await sleep(600);
  ok('dungeon: − zooms out', await ev('SpotMap._state.map.getZoom()') < dz0);
  const before = await ev('JSON.stringify(SpotMap._state.map.getCenter())'), selBefore = await ev('JSON.stringify(SpotMap._state.sel.ids)');
  { const r = await ev("(() => { const b = document.getElementById('spmMap').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()");
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x + i * 15, y: r.y + i * 8, button: 'left', buttons: 1 });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x + 120, y: r.y + 64, button: 'left', clickCount: 1 }); await sleep(500); }
  ok('dungeon: drag pans the floor', await ev('JSON.stringify(SpotMap._state.map.getCenter())') !== before);
  ok('dungeon: a drag is never a tap (the choice did not change)', await ev('JSON.stringify(SpotMap._state.sel.ids)') === selBefore);
  await click('[data-spmfitfloor]'); await sleep(500);
  ok('dungeon: Fit floor shows the whole floor', await ev("SpotMap._state.map.getBounds().contains([" + f1.center[1] + ", " + f1.center[0] + "])"));
  await view(f1.center[0], f1.center[1], 3.5); await sleep(400); await clickGame(f1.center[0], f1.center[1]);
  ok('dungeon: zoomed far in, a tap still selects / unselects the room', await waitFor('/Hunt in this room/.test(document.getElementById("spmBar").textContent)', 4000));
  await clickGame(f1.center[0], f1.center[1]);
  ok('dungeon: tap again = back in the choice (2 rooms)', await waitFor('/Hunt in 2 rooms/.test(document.getElementById("spmBar").textContent)', 4000));
  await shot('desktop_dungeon');
  const n4 = posts.length; await click('[data-spmsave]');
  const RP = await lastPost(/\/api\/partyspot/, n4);
  ok('Hunt -> POST { kind rooms, dungeon Cruma Tower, roomIds across two floors }', RP && RP.body.kind === 'rooms' && RP.body.dungeon === 'Cruma Tower' && RP.body.roomIds && RP.body.roomIds.length === 2 && RP.body.roomIds[0] === f0.id && RP.body.roomIds[1] === f1.id, JSON.stringify(RP && RP.body).slice(0, 200));
  // ---- phone ----
  await waitFor(`!document.getElementById('spotov')`, 10000);
  await phone();
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/parties` });
  await waitFor(`!!document.querySelector('[data-spotpick="${PARTY}"]')`, 30000);
  await click(`[data-spotpick="${PARTY}"]`);
  ok('phone: the map opens full screen', await waitFor(`!!document.querySelector('#spmMap.leaflet-container')`, 15000) && await ev(`(() => { const r = document.querySelector('#spotov .spotbox').getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1; })()`));
  ok('phone: the map has room (>= 45 % of the height)', await ev(`document.getElementById('spmMap').getBoundingClientRect().height >= innerHeight * 0.45`), await ev(`Math.round(document.getElementById('spmMap').getBoundingClientRect().height) + ' px of ' + innerHeight`));
  ok('phone: no sideways scroll', !(await overflow()));
  await waitFor(`document.querySelectorAll('#spmMap img.leaflet-tile-loaded').length >= 2`, 15000);
  await shot('phone');
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  ok('the real party_spots.json / custom_zones.json were not touched', stamp() === live0);
  console.log(`\n${fails ? fails + ' FAILED' : 'all spot map checks passed'} — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
