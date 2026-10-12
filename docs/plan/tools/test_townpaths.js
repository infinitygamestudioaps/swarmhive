// Test of the TOWN PATHS layer (user 2026-10-12: "why no blue paths in Giran? It works in Heine." / "I want to see ALL computed paths in ALL
// towns on the maps"): Dashboard/townpaths_api.js (GET /api/townpaths) + Dashboard/townpaths.js (SVG layer, toggle, legend, Leaflet picker).
// A tiny local server (random port, 127.0.0.1) runs ONLY the townpaths hook (+ compress.js) on the REAL Scripts/data files, read-only.
// Nothing reaches the game, MCP, L2Swarm or the real dashboard (port 8090).
// Part A: the API for Heine, Giran (recorded routes), a town with no dungeon under it (Dark Elf Village), point lookup, key check, gzip.
// Part B: a 390 px headless Edge page (only when >= 3 GB RAM is free): the layer on an SVG map like the character page / Parties map, the toggle
// (+ localStorage), Giran's labelled routes, and the Map tab's Leaflet layer + town picker (when Leaflet loads from cdnjs). No alert/confirm.
//   node docs/plan/tools/test_townpaths.js            (add --no-browser for part A only)
// Screenshot: docs/plan/mobile_check/townpaths_390.png
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os'), cp = require('child_process'), zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DASH = path.join(ROOT, 'Dashboard'), DATA = path.join(ROOT, 'Scripts', 'data');
const OUT = path.join(ROOT, 'docs', 'plan', 'mobile_check');
const TP = require(path.join(DASH, 'townpaths_api.js')), CMP = require(path.join(DASH, 'compress.js'));
const KEY = 'test-key-' + Math.random().toString(36).slice(2);
let fails = 0;
const ok = (name, cond, info) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && info ? ' — ' + info : ''}`); if (!cond) fails++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TEST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Town paths test</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>:root{--fs-mini:11px;--muted:#9aa;--line2:#456}body{margin:0;background:#111;color:#ddd;font:13px Tahoma,sans-serif;padding:0 16px}
.pmap{border:1px solid #456;background:#0d2a33}.pmap svg{display:block;width:100%;height:auto;aspect-ratio:1/1}.pmlegend{display:flex;flex-wrap:wrap;gap:3px 10px;font-size:11px;padding:3px 6px}
#map{height:300px;margin-top:8px}.mapbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.muted{color:#9aa}</style></head><body>
<h3>Town paths</h3><div class="pmap" id="pm"></div>
<section id="tab-map"><div class="whead"><div class="mapbar"><select id="mapFocus"><option>Everyone</option></select><label><input type="checkbox" id="mapFollow" checked> follow</label></div></div><div id="map"></div></section>
<script>const KEY = ${JSON.stringify(KEY)}; const api = (u) => fetch(u, { headers: { 'x-key': KEY } }).then(r => r.json());
window.VIEW = { x: 81800, y: 148200, R: 3400 }; window.ACTIVE = { intent: { action: 'walk', what: 'Giran recorded route to grocer (8 points)' } };
function draw() { const v = VIEW, W = 2 * v.R, x0 = v.x - v.R, y0 = v.y - v.R, u = W / 358;
  const T = TownPaths.layer({ x0, y0, W, H: W, u }, { active: TownPaths.activeOf(ACTIVE), fs: 8.5 }); window.LAST = T;
  document.getElementById('pm').innerHTML = '<svg viewBox="' + x0 + ' ' + y0 + ' ' + W + ' ' + W + '"><rect x="' + x0 + '" y="' + y0 + '" width="' + W + '" height="' + W + '" fill="#0d2a33"/>' + T.base + T.labels +
    '<polyline points="' + (v.x) + ',' + (v.y) + ' ' + (v.x - 900) + ',' + (v.y - 300) + '" fill="none" stroke="#3ddc84" stroke-width="' + 2.4 * u + '" id="myroute"/></svg><div class="pmlegend">' + (T.towns.length ? TownPaths.legendHtml(T.towns) : '') + TownPaths.toggleHtml() + '</div>'; }
window.addEventListener('townpaths:change', draw);
</script><script src="/townpaths.js"></script>
<script>draw(); window.LEAFLET = !!window.L; if (window.L) { const crs = L.extend({}, L.CRS.Simple, { transformation: new L.Transformation(1 / 128, 20 * 256, 1 / 128, 18 * 256) });
  window.MAP = L.map('map', { crs, minZoom: -3, maxZoom: 3, zoomSnap: 0.5, attributionControl: false, center: [44500, -120000], zoom: -1 }); TownPaths.attach(MAP, { onPick: () => { document.getElementById('mapFollow').checked = false; } }); }</script>
</body></html>`;

function serve() {
  const srv = http.createServer(async (req, res) => {
    CMP.wrap(req, res);
    const url = new URL(req.url, 'http://x');
    const send = (r, code, type, body) => { r.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); r.end(body); };
    const json = (r, code, o) => send(r, code, 'application/json', JSON.stringify(o));
    const allowed = (rq, u) => (u.searchParams.get('key') || rq.headers['x-key']) === KEY;   // stricter than server.js (no localhost bypass) so the key check is testable
    if (url.pathname === '/t.html') return send(res, 200, 'text/html; charset=utf-8', TEST_PAGE);
    try { if (await TP.handle(req, res, url, { DIR: DASH, DATA, allowed, json, send })) return; } catch (e) { return json(res, 500, { error: e.message }); }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    send(res, 404, 'text/plain', 'not found');
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}
function req(base, p, headers) {
  return new Promise((resolve, reject) => {
    http.get(base + p, { headers: headers || {} }, (r) => { const ch = []; r.on('data', c => ch.push(c)); r.on('end', () => {
      let b = Buffer.concat(ch); if (r.headers['content-encoding'] === 'gzip') b = zlib.gunzipSync(b);
      let j = null; try { j = JSON.parse(b.toString('utf8')); } catch (e) { }
      resolve({ code: r.statusCode, headers: r.headers, text: b.toString('utf8'), j, raw: Buffer.concat(ch).length });
    }); }).on('error', reject);
  });
}
const inBox = (d, m) => d.lines.every(l => { for (let i = 0; i + 1 < l.length; i += 2) { if (l[i] < d.box[0] - m || l[i] > d.box[1] + m || l[i + 1] < d.box[2] - m || l[i + 1] > d.box[3] + m) return false; } return true; });

(async () => {
  const srv = await serve(), base = `http://127.0.0.1:${srv.address().port}`, K = { 'x-key': KEY };
  console.log('--- A: API (' + base + ')');
  const st = await req(base, '/townpaths.js');
  ok('/townpaths.js is public JavaScript', st.code === 200 && /javascript/.test(st.headers['content-type']) && st.text.includes('window.TownPaths'));
  ok('/api/townpaths without the key = 401', (await req(base, '/api/townpaths?list=1')).code === 401);
  const L = await req(base, '/api/townpaths?list=1', K);
  const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'town_graph', 'index.json'), 'utf8'));
  ok(`?list=1: all ${idx.towns.length} towns with box + centre, Giran flagged`, L.code === 200 && L.j.towns.length === idx.towns.length && L.j.towns.every(t => t.box && t.center) && L.j.towns.filter(t => t.giran).map(t => t.key).join() === 'giran', L.text.slice(0, 200));
  ok('?list=1 is small (< 8 KB)', L.text.length < 8000, L.text.length + ' bytes');

  const H = await req(base, '/api/townpaths?town=heine', K);
  const hg = JSON.parse(fs.readFileSync(path.join(DATA, 'town_graph', 'heine.json'), 'utf8'));
  ok('Heine: one line per street edge of the graph', H.code === 200 && H.j.lines.length === new Set(hg.e.map(e => Math.min(e[0], e[1]) + '-' + Math.max(e[0], e[1]))).size, H.j && H.j.lines.length + ' vs ' + hg.e.length);
  ok('Heine: every line has >= 2 points, all inside the town box (+2000)', H.j.lines.every(l => l.length >= 4 && l.length % 2 === 0) && inBox(H.j, 2000));
  ok('Heine: NPC spots (front of every NPC) with names + roles, doors, arrival points', H.j.npcs.length === Object.keys(hg.npcs).length && H.j.npcs.every(n => n.n && n.role && isFinite(n.fx)) && H.j.npcs.some(n => n.role === 'gk') && H.j.doors.length > 0 && H.j.arrive.length > 0);
  ok('Heine: no Giran routes', !H.j.giran);
  const gz = await req(base, '/api/townpaths?town=heine', Object.assign({ 'accept-encoding': 'gzip' }, K));
  ok('gzipped by compress.js (Heine < 40% of the plain size)', gz.headers['content-encoding'] === 'gzip' && gz.raw < H.text.length * 0.4, `${gz.raw} of ${H.text.length}`);

  const G = await req(base, '/api/townpaths?town=Giran', K);
  const gr = JSON.parse(fs.readFileSync(path.join(DATA, 'giran_routes.json'), 'utf8'));
  ok('Giran (by name): the full street graph too', G.code === 200 && G.j.key === 'giran' && G.j.lines.length > 1000 && inBox(G.j, 2000), G.j && G.j.lines.length);
  ok('Giran: every recorded route (giran_routes.json) with its NPC + points', G.j.giran && G.j.giran.routes.length === Object.keys(gr.routes).length && G.j.giran.routes.every(r => r.pts.length === gr.routes[r.name].points.length && r.npc === (gr.routes[r.name].npc || '')), JSON.stringify(G.j.giran && G.j.giran.routes.map(r => r.name)));
  ok('Giran: the start point of the routes', G.j.giran.start && G.j.giran.start[0] === Math.round(gr.start[0]));
  ok('Giran: Helvetia is a shop spot', G.j.npcs.some(n => n.n === 'Helvetia' && n.role === 'shop'));
  ok('Giran answer < 80 KB gzipped', zlib.gzipSync(G.text).length < 80000, zlib.gzipSync(G.text).length + ' bytes');

  const D = await req(base, '/api/townpaths?town=darkelf', K);
  ok('Dark Elf Village (no dungeon below, not Giran/Heine): graph + NPCs', D.code === 200 && D.j.town === 'Dark Elf Village' && D.j.lines.length > 500 && D.j.npcs.length > 20 && !D.j.giran && inBox(D.j, 2000));
  ok('?town=town-oren (bot key form) works', (await req(base, '/api/townpaths?town=town-oren', K)).j.key === 'oren');
  ok('?x=&y= inside Giran -> Giran', (await req(base, '/api/townpaths?x=83480&y=148552', K)).j.key === 'giran');
  ok('?x=&y=&z= in Heine -> Heine', (await req(base, '/api/townpaths?x=111448&y=219400&z=-3544', K)).j.key === 'heine');
  { const ob = idx.towns.find(t => t.key === 'oren').box; ok('?x=&y= 3000 east of the Oren box -> Oren (nearest within 8000)', (await req(base, `/api/townpaths?x=${ob[1] + 3000}&y=${Math.round((ob[2] + ob[3]) / 2)}`, K)).j.key === 'oren'); }
  ok('?x=0&y=0 (no town) = 404', (await req(base, '/api/townpaths?x=0&y=0', K)).code === 404);
  ok('unknown town = 404', (await req(base, '/api/townpaths?town=atlantis', K)).code === 404);
  { const t0 = Date.now(); for (let i = 0; i < 5; i++) await req(base, '/api/townpaths?town=giran', K); ok('cached by mtime (5 Giran answers < 1.5 s)', Date.now() - t0 < 1500, (Date.now() - t0) + ' ms'); }
  let all = true; for (const t of idx.towns) { const r = await req(base, '/api/townpaths?town=' + t.key, K); if (r.code !== 200 || !r.j.lines.length) { all = false; console.log('    bad', t.key, r.code); } }
  ok(`all ${idx.towns.length} towns answer with paths`, all);

  // ------------------------------------------------------------------ A2: the layer module in node (tiny fake DOM; runs without a browser)
  console.log('--- A2: the layer module (Dashboard/townpaths.js) without a browser');
  {
    const vm = require('vm'), store = {}, evs = {};
    const doc = { querySelectorAll: () => [], getElementById: () => null, addEventListener: () => { }, createElement: () => ({}), head: { appendChild: () => { } } };
    const win = { addEventListener: (n, f) => { (evs[n] = evs[n] || []).push(f); }, dispatchEvent: (e) => (evs[e.type] || []).forEach(f => f(e)) };
    const sb = { window: win, document: doc, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, Event: class { constructor(t) { this.type = t; } },
      api: (u) => req(base, u, K).then(r => r.j), console };
    sb.window.api = sb.api; vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(DASH, 'townpaths.js'), 'utf8'), sb);
    const T = sb.window.TownPaths; let changes = 0; win.addEventListener('townpaths:change', () => { changes++; });
    const view = (x, y, R) => ({ x0: x - R, y0: y - R, W: 2 * R, H: 2 * R, u: 2 * R / 360 });
    const v = view(81800, 148200, 3400), act = { intent: { action: 'walk', what: 'Giran recorded route to grocer (8 points)' } };
    T.layer(v, {}); for (let i = 0; i < 40 && !T._s.idx; i++) await sleep(50);
    ok('index loaded once, a change event fired', !!T._s.idx && T._s.idx.length === idx.towns.length && changes >= 1);
    ok('Giran is the town in a Giran view', T.townsIn(v.x0, v.y0, v.x0 + v.W, v.y0 + v.H)[0] === 'giran');
    T.layer(v, { active: T.activeOf(act) }); for (let i = 0; i < 60 && !T.town('giran'); i++) await sleep(50);
    const r = T.layer(v, { active: T.activeOf(act), fs: 9 });
    ok('activeOf() reads the walked Giran route from the intent', T.activeOf(act) === 'grocer' && T.activeOf({}) === '' && T.activeOf({ intent: { what: 'Giran recorded route to grocer', result: 'ok' } }) === '');
    ok('layer(): one street <path> + 7 route polylines (grocer thick) + labels', /<g class="tp-g" data-town="giran"/.test(r.base) && (r.base.match(/<polyline/g) || []).length === 7 && (r.base.match(/<polyline[^>]*stroke-width="4"/g) || []).length === 1 && /grocer/.test(r.labels), r.key);
    ok('the base part does not depend on the zoom (same key + string at 2x zoom)', (() => { const r2 = T.layer(view(81800, 148200, 1700), { active: 'grocer' }); return r2.key === r.key && r2.base === r.base; })());
    ok('zoomed out past a town scale (W > 70000): nothing', T.layer(view(81800, 148200, 40000), {}).base === '');
    ok('legend names the Giran routes only when Giran is in view', /Giran recorded routes/.test(T.legendHtml(r.towns)) && !/Giran/.test(T.legendHtml([{ key: 'heine' }])));
    T.setOn(false);
    ok('switched off: empty layer, stored "0"', T.layer(v, {}).base === '' && store['townPaths.on'] === '0');
    ok('...but a picked town (force) still draws', /data-town="giran"/.test(T.layer(v, { force: 'giran' }).base));
    T.setOn(true);
    const hv = view(111448, 218400, 3000); T.layer(hv, {}); for (let i = 0; i < 60 && !T.town('heine'); i++) await sleep(50);
    const hr = T.layer(hv, {});
    ok('Heine view: Heine streets, no routes', /data-town="heine"/.test(hr.base) && !/<polyline/.test(hr.base) && store['townPaths.on'] === '1');
    ok('toggle button carries data-tptoggle + aria-pressed', /data-tptoggle aria-pressed="true"/.test(T.toggleHtml()));
  }

  // ------------------------------------------------------------------ B: browser at 390 px
  const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(f => fs.existsSync(f));
  const freeGB = os.freemem() / 1073741824;
  if (process.argv.includes('--no-browser') || !EDGE || freeGB < 3) {
    console.log(`--- B: browser SKIPPED (${process.argv.includes('--no-browser') ? '--no-browser' : !EDGE ? 'no Edge' : freeGB.toFixed(1) + ' GB free RAM, needs 3'})`);
    srv.close(); console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
  }
  console.log(`--- B: browser 390x844 (${freeGB.toFixed(1)} GB free)`);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-edge-')), DBG = 9300 + Math.floor(Math.random() * 500);
  const br = cp.spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  const done = async () => { try { cp.execSync('taskkill /PID ' + br.pid + ' /T /F', { stdio: 'ignore' }); } catch (e) { } srv.close(); await sleep(600); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { } };
  try {
    let ws = null;
    for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
    if (!ws) throw new Error('no browser');
    const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
    let id = 0; const pend = {}, jsErr = [], dialogs = [];
    const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
    sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; return; }
      if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); cdp('Page.handleJavaScriptDialog', { accept: false }).catch(() => { }); }
      if (m.method === 'Runtime.exceptionThrown') jsErr.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text); };
    const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
    const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp('Page.navigate', { url: base + '/t.html' });
    ok('Giran layer drawn on the SVG map (street path + 7 orange routes)', await waitFor(`!!document.querySelector('#pm g.tp-g[data-town="giran"]')`, 15000));
    const a = await ev(`(() => { const g = document.querySelector('#pm g.tp-g[data-town="giran"]'); const pl = [...g.querySelectorAll('polyline')];
      return { d: g.querySelector('path').getAttribute('d').length, routes: pl.length, thick: pl.filter(p => p.getAttribute('stroke-width') === '4').length,
        nss: g.querySelector('path').getAttribute('vector-effect'), labels: [...document.querySelectorAll('#pm text')].map(t => t.textContent),
        routeOnTop: (() => { const all = [...document.querySelectorAll('#pm svg > *')]; return all.indexOf(document.getElementById('myroute')) > all.indexOf(g); })(),
        legend: document.querySelector('#pm .pmlegend').innerText, ls: (() => { try { return localStorage.getItem('townPaths.on'); } catch (e) { return 'x'; } })() }; })()`);
    ok('street path is long and zoom-independent (non-scaling stroke)', a.d > 20000 && a.nss === 'non-scaling-stroke', JSON.stringify({ d: a.d, nss: a.nss }));
    ok('7 recorded routes, the walked one (grocer) thicker', a.routes === 7 && a.thick === 1, JSON.stringify({ routes: a.routes, thick: a.thick }));
    // labelsOf() drops a label that would overlap one already placed (2026-10-12 23:14): weapons sits next to jewelry/armor at this zoom
    const rl = ['grocer', 'warehouse', 'weapons', 'jewelry', 'armor', 'blacksmith', 'symbol'].filter(n => a.labels.some(t => t.startsWith(n)));
    ok('route labels per place (grocer, warehouse + at least 4 places; overlapping ones dropped)', rl.includes('grocer') && rl.includes('warehouse') && rl.length >= 4, a.labels.slice(0, 12).join(' | '));
    ok('the character route stays on top of the town layer', a.routeOnTop);
    ok('legend: town paths + Giran recorded routes + toggle', /town paths/.test(a.legend) && /Giran recorded routes/.test(a.legend) && /Town paths/.test(a.legend), a.legend);
    await cdp('Page.captureScreenshot', { format: 'png' }).then(r => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'townpaths_390.png'), Buffer.from(r.data, 'base64')); console.log('  shot townpaths_390.png'); });
    await ev(`document.querySelector('#pm [data-tptoggle]').click()`);
    ok('toggle off: layer gone, remembered (localStorage 0)', await waitFor(`!document.querySelector('#pm g.tp-g') && localStorage.getItem('townPaths.on') === '0' && !TownPaths.isOn()`, 4000));
    await cdp('Page.reload'); await waitFor(`!!window.TownPaths && !!document.querySelector('#pm .pmlegend')`, 10000); await sleep(800);
    ok('after a reload it stays off', await ev(`!TownPaths.isOn() && !document.querySelector('#pm g.tp-g')`));
    await ev(`document.querySelector('#pm [data-tptoggle]').click()`);
    ok('toggle on again', await waitFor(`!!document.querySelector('#pm g.tp-g[data-town="giran"]') && localStorage.getItem('townPaths.on') === '1'`, 8000));
    await ev(`VIEW.x = 111448; VIEW.y = 218400; ACTIVE = {}; draw()`);
    ok('Heine view: Heine streets, no Giran routes', await waitFor(`!!document.querySelector('#pm g.tp-g[data-town="heine"]') && !document.querySelector('#pm g.tp-g polyline')`, 8000));
    const lf = await ev('window.LEAFLET');
    if (!lf) console.log('  (Leaflet did not load from cdnjs: Map tab part skipped)');
    else {
      ok('Map tab: toggle + town picker in the map bar', await waitFor(`document.querySelectorAll('#tab-map .mapbar [data-tptoggle]').length === 1 && document.querySelector('#tab-map select[data-tppick]').options.length === ${idx.towns.length + 1}`, 8000));
      await ev(`(() => { const s = document.querySelector('#tab-map select[data-tppick]'); s.value = 'dion'; s.dispatchEvent(new Event('change')); })()`);
      ok('picking Dion (nobody there) shows its graph + NPC spots, follow unchecked', await waitFor(`!!TownPaths._s.ll.dion && !document.getElementById('mapFollow').checked && /Dion: \\d+ street paths/.test(document.querySelector('.tp-info').textContent)`, 10000),
        await ev(`document.querySelector('.tp-info').textContent + ' / ' + Object.keys(TownPaths._s.ll).join()`));
      ok('Map legend shown', /town paths/.test(await ev(`document.getElementById('tpMapLegend').innerText`)));
      await ev(`(() => { const s = document.querySelector('#tab-map select[data-tppick]'); s.value = 'giran'; s.dispatchEvent(new Event('change')); })()`);
      ok('picking Giran: recorded routes listed in the info line', await waitFor(`!!TownPaths._s.ll.giran && /7 recorded routes/.test(document.querySelector('.tp-info').textContent)`, 10000));
      await sleep(500);
      await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 390, height: 844, scale: 1 }, captureBeyondViewport: true }).catch(() => null);
    }
    ok('no horizontal scroll at 390 px', await ev(`document.documentElement.scrollWidth <= window.innerWidth + 1`), await ev(`document.documentElement.scrollWidth + ' > ' + window.innerWidth`));
    ok('no alert / confirm / prompt', dialogs.length === 0, dialogs.join(' | '));
    ok('no JavaScript errors', jsErr.length === 0, jsErr.slice(0, 3).join(' | '));
    try { sock.close(); } catch (e) { }
  } catch (e) { console.error(e); fails++; }
  await done();
  console.log(fails ? `${fails} FAILED` : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
