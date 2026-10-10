// Headless iPhone check of the Parties tab: room polygon on the party map + the live status of the dashboard hunting-spot choice
// (user 2026-10-08 19:55). Edge via CDP against the SANDBOX server (cmdcenter_testserver.js: MCP mocked, nothing reaches the game).
// The browser rewrites /api/state + /api/partyspot answers (Fetch domain) so party Crafter1 shows each state:
//   travelling (still in the old spot, the chosen Catherok room drawn white + "chosen 19:43 · travelling · ETA"), arrived (zone without its
//   polygon -> looked up by room id in /api/dungeonmap, legend "hunting room", "in the room ✓"), occupied, waiting after a fight.
// Screenshots: docs/plan/mobile_check/manualspot_*.png
//   node docs/plan/tools/test_manualspot_ui.js
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'plan', 'mobile_check');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'), 'utf8').replace(/^\uFEFF/, ''));
const cr = D.find(d => d.name === 'Cruma Tower'); let ROOM = null; cr.floors.forEach(F => (F.rooms || []).forEach(r => { if (r.id === 'cruma-1-left-a') ROOM = r; }));
const ROOMPOLY = ROOM.poly.map(p => Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y]);
const CHOSEN_AT = new Date(Date.now() - 90000).toISOString();
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const SPOTS = { Crafter1: { mode: 'manual', kind: 'rooms', spot: 'Cruma Tower', dungeon: 'Cruma Tower', roomId: 'cruma-1-left-a', stay: false, at: CHOSEN_AT, by: 'dashboard' } };
// scenario -> how Crafter1's own state looks
const LEADER_POS = { x: 15032, y: 118760, z: -12096 };
const SCEN = {
  travelling: { pos: { x: 17000, y: 119500, z: -12096 }, zone: { x: 17400, y: 119900, r: 1800, name: 'Cruma Tower: 1st floor, right: Excuro room' },
    manualSpot: { mode: 'manual', label: 'Cruma Tower / cruma-1-left-a', status: 'travelling', detail: 'walking there on this floor (3400 away)', chosenAt: CHOSEN_AT, since: iso(-5000), etaAt: iso(75000), retryAt: null, dungeon: 'Cruma Tower', room: 'cruma-1-left-a', spot: 'Cruma Tower: 1st floor, left: Catherok room', poly: null } },
  arrived: { pos: LEADER_POS, zone: { x: 14560, y: 117039, r: 1509, name: 'Cruma Tower: 1st floor, left: Catherok room', room: 'cruma-1-left-a', manual: true },   // NO poly: the page looks it up
    manualSpot: { mode: 'manual', label: 'Cruma Tower / cruma-1-left-a', status: 'arrived', detail: 'in the room ✓ (1st floor, left: Catherok room)', chosenAt: CHOSEN_AT, since: iso(-2000), etaAt: null, retryAt: null, dungeon: 'Cruma Tower', room: 'cruma-1-left-a', spot: 'Cruma Tower: 1st floor, left: Catherok room', poly: null } },
  occupied: { pos: { x: 17000, y: 119500, z: -12096 }, zone: { x: 17400, y: 119900, r: 1800, name: 'Cruma Tower: 1st floor, right: Excuro room' },
    manualSpot: { mode: 'manual', label: 'Cruma Tower / cruma-1-left-a', status: 'occupied', detail: 'occupied by 3 players (FooBar +summon) → automatic spot for now', chosenAt: CHOSEN_AT, since: iso(-30000), etaAt: null, retryAt: iso(270000), dungeon: 'Cruma Tower', room: 'cruma-1-left-a', spot: null, poly: ROOMPOLY } },
  waiting: { pos: LEADER_POS, zone: { x: 15032, y: 118760, r: 3000, name: 'local' },
    manualSpot: { mode: 'manual', label: 'Cruma Tower / cruma-1-left-a', status: 'pending', detail: 'waiting: after the fight (Spoiler1 34 %)', chosenAt: CHOSEN_AT, since: iso(-8000), etaAt: null, retryAt: null, dungeon: 'Cruma Tower', room: 'cruma-1-left-a', spot: null, poly: null } },
};
let scen = 'travelling';
function patchState(j) {
  const S = SCEN[scen]; const now = new Date().toISOString();
  (j.chars || []).forEach(c => {
    if (c.party !== 'Crafter1') return;
    const lead = c.name === 'Crafter1';
    const dx = lead ? 0 : (c.name.length % 3 - 1) * 180, dy = lead ? 0 : (c.name.length % 2 ? 160 : -140);
    Object.assign(c, { x: S.pos.x + dx, y: S.pos.y + dy, z: S.pos.z, updated: now, ageSec: 1, dead: false, hp: 90 });
    if (lead) { c.leader = true; c.zone = S.zone; c.manualSpot = S.manualSpot; c.spotClaim = { claimed: S.zone.name, occupied: [] }; }
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-edge-'));
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
  const posts = [];
  handlers.push(async (m) => {
    if (m.method === 'Page.javascriptDialogOpening') cdp('Page.handleJavaScriptDialog', { accept: false }).catch(() => { });
    if (m.method !== 'Fetch.requestPaused') return;
    const rq = m.params.request, rid = m.params.requestId;
    const fulfill = (obj) => cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(obj)).toString('base64') }).catch(() => { });
    if (rq.method === 'POST') { posts.push(rq.url); return fulfill({ ok: true, intercepted: true }); }            // nothing is ever saved / sent
    if (m.params.responseStatusCode === undefined) return cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { });
    try {
      const b = await cdp('Fetch.getResponseBody', { requestId: rid });
      let j = JSON.parse(b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body);
      if (/\/api\/state/.test(rq.url)) j = patchState(j);
      if (/\/api\/partyspot/.test(rq.url)) j.spots = Object.assign({}, j.spots || {}, SPOTS);
      fulfill(j);
    } catch (e) { cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { }); }
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: false });   // UIDIALOG 2026-10-10: the shared dialog answers itself
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/state*', requestStage: 'Response' }, { urlPattern: '*/api/partyspot*', requestStage: 'Response' }, { urlPattern: '*/api/*', requestStage: 'Request' }] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/parties` });
  ok('Parties tab loads with party Crafter1', await waitFor(`!!document.querySelector('[data-spotpick="Crafter1"]')`, 30000));
  const card = `document.querySelector('[data-spotpick="Crafter1"]').closest('.win')`;
  const info = () => ev(`(() => { const w = ${card}; const sl = w.querySelector('.spotline'); const svg = w.querySelector('.pmap svg'); const lg = w.querySelector('.pmlegend');
    return { spot: sl ? sl.innerText.replace(/\\s+/g, ' ') : '', polys: svg ? [...svg.querySelectorAll('polygon')].map(p => ({ stroke: p.getAttribute('stroke'), n: p.getAttribute('points').split(' ').length })) : [],
      rects: svg ? svg.querySelectorAll('rect[stroke="#e3c27a"]').length : 0, legend: lg ? lg.innerText.replace(/\\s+/g, ' ') : '', texts: svg ? [...svg.querySelectorAll('text')].map(t => t.textContent).join(' | ') : '',
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1 }; })()`);
  const show = async (name) => {
    await ev(`(() => { const w = ${card}; w.scrollIntoView({ block: 'start' }); window.scrollBy(0, -6); return true; })()`); await sleep(700);
    const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `manualspot_${name}.png`), Buffer.from(r.data, 'base64'));
  };
  const step = async (name) => { scen = name; await ev(`refresh()`).catch(() => { }); await sleep(1500); await ev(`refresh()`).catch(() => { }); await sleep(1500); return info(); };

  let I = await step('travelling');
  ok('travelling: status chip "chosen HH:MM · travelling · ETA m:ss"', /chosen \d\d:\d\d · travelling · ETA \d+:\d\d/.test(I.spot), I.spot.slice(0, 160));
  ok('travelling: the chosen room is drawn (white polygon, looked up by room id)', I.polys.some(p => p.stroke === '#fff' && p.n === ROOMPOLY.length), JSON.stringify(I.polys));
  ok('travelling: legend "hunting square" (old spot) + "chosen room"', /hunting square/.test(I.legend) && /chosen room/.test(I.legend), I.legend);
  ok('no horizontal scroll at 390 px', !I.overflow);
  await show('travelling');
  I = await step('arrived');
  ok('arrived: "in the room ✓"', /in the room ✓/.test(I.spot), I.spot.slice(0, 160));
  ok('arrived: zone without poly -> the room polygon from /api/dungeonmap is drawn (gold), no square', I.polys.some(p => p.stroke === '#e3c27a' && p.n === ROOMPOLY.length) && I.rects === 0, JSON.stringify(I.polys) + ' rects ' + I.rects);
  ok('arrived: legend says "hunting room", not "hunting square"', /hunting room/.test(I.legend) && !/hunting square/.test(I.legend), I.legend);
  ok('arrived: no "chosen" outline any more', !I.polys.some(p => p.stroke === '#fff'));
  await show('arrived');
  I = await step('occupied');
  ok('occupied: "occupied by others → auto · retry in m:ss"', /occupied by others → auto · retry in \d+:\d\d/.test(I.spot), I.spot.slice(0, 160));
  ok('occupied: chosen room drawn from manualSpot.poly', I.polys.some(p => p.stroke === '#fff'));
  await show('occupied');
  I = await step('waiting');
  ok('waiting: "chosen HH:MM · waiting: after the fight (Spoiler1 34 %)"', /chosen \d\d:\d\d · waiting: after the fight \(Spoiler1 34 %\)/.test(I.spot), I.spot.slice(0, 160));
  await show('waiting');
  ok('nothing was POSTed (no order sent, nothing saved)', posts.length === 0, posts.join(', '));
  ok('no MCP call that changes anything', !mcp.some(l => !/get_accounts_status|get_account_status|get_account_data/.test(l)), mcp.filter(l => !/get_accounts_status/.test(l)).slice(0, 3).join(' ; '));
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
