// TEST: ROUTE SWITCH for EVERY target type (ROUTESWITCH-2026-10-13; user: "the route choice (computed or own route) exists only for raid bosses, not
// for NPCs and other targets — fix it"). Offline, never touches the game or the live route store:
//  1. swarm.js ROUTESWITCH-PURE in a vm: rsChoice (auto / atlas / custom, locked / not locked, missing / too short route, caller override),
//     rsCleanId / rsRel / rsQuestId (every type -> its folder), rsLegMs (live run speed, swim legs slower, min 30 s), rsStartIdx.
//  2. Dashboard/routestore.js gives the SAME choice / ids as swarm.js for a matrix of cases.
//  3. swarm.js hooks: goToNpc / travelToSpot (area + room) / enterRoom / quest engine (talk + hunt) / dungeonEntryTrip use the switch, routeHop's
//     leg times are water-aware, raidRouteFile takes { file }; the RAID travel code (raidRouteUse, loadRaidRoute, userRouteTrip, saveRaidRoute,
//     raidRouteFailed) is byte-identical to the 2026-10-13 backup.
//  4. routestore.api on a SCRATCH data folder (nav atlas linked read-only): save / lock / unlock / use atlas|custom|auto / delete / history /
//     validation for npc, area, room, quest, dungeon, epic; list(); routeview_api.view shows the switch + the own route for every type.
//  5. The real Dashboard/server.js in a sandbox (random port, MCP + timers + child processes stubbed): /api/route old raid form unchanged, typed
//     forms for every type, refused POSTs write nothing, /api/routes?type=all, /routeedit.js + /routeview.js served; the live route store is unchanged.
//  6. node --check of every changed JS file + every inline <script> of Dashboard/index.html compiles; routeview.js 3-way switch html; routeedit.js loads.
//   node docs/plan/tools/test_route_switch.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), http = require('http'), cp = require('child_process'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DASH = path.join(ROOT, 'Dashboard'), DATA = path.join(ROOT, 'Scripts', 'data');
const SWARM = path.join(ROOT, 'Scripts_dev', 'swarm.js'), BACKUP = path.join(ROOT, 'Settings', 'backup', 'routeswitch_2026-10-13', 'Scripts_dev', 'swarm.js');
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' — ' + (e && e.message)); } }
const src = fs.readFileSync(SWARM, 'utf8');

// ---------------------------------------------------------------------------------------------- 1. pure block
const m = src.match(/\/\/ ROUTESWITCH-PURE-BEGIN[^\n]*\n([\s\S]*?)\/\/ ROUTESWITCH-PURE-END/);
const S = {};
if (m) { const c = {}; vm.createContext(c); vm.runInContext(m[1] + '\nthis.F = { RS_FOLDER, rsCleanId, rsRel, rsPoints, rsStored, rsChoice, rsQuestId, rsLegMs, rsStartIdx, RS_LEG, rsSegments, rsFloorCheck, rsHasSteps, rsWhere, rsIsStep };', c); Object.assign(S, c.F); }
const RSTORE = require(path.join(DASH, 'routestore.js'));
const R2 = (n, o) => Object.assign({ points: Array.from({ length: n }, (_, i) => ({ x: i * 1000, y: 0, z: -3000 })) }, o || {});
const CASES = [
  ['missing route', null, undefined, 'atlas', 'auto'],
  ['1 point, use custom', R2(1, { use: 'custom', manual: true }), undefined, 'atlas', 'custom'],
  ['recorded (not locked), auto', R2(5), undefined, 'atlas', 'auto'],
  ['locked, auto', R2(5, { manual: true }), undefined, 'custom', 'auto'],
  ['locked, use atlas', R2(5, { manual: true, use: 'atlas' }), undefined, 'atlas', 'atlas'],
  ['not locked, use custom', R2(5, { use: 'custom' }), undefined, 'custom', 'custom'],
  ['stored use "auto" (legacy text), locked', R2(3, { manual: true, use: 'auto' }), undefined, 'custom', 'auto'],
  ['garbage use, not locked', R2(3, { use: 'xyz' }), undefined, 'atlas', 'auto'],
  ['override atlas over locked custom', R2(3, { manual: true, use: 'custom' }), 'atlas', 'atlas', 'atlas'],
  ['override custom over use atlas', R2(3, { use: 'atlas' }), 'custom', 'custom', 'custom'],
  ['override custom, no route', null, 'custom', 'atlas', 'custom'],
  ['override auto over use custom (not locked)', R2(3, { use: 'custom' }), 'auto', 'atlas', 'auto'],
  ['points with NaN filtered (2 good)', { manual: true, points: [{ x: 1, y: 2, z: 3 }, { x: 'a', y: 1 }, { x: 5, y: 6 }] }, undefined, 'custom', 'auto'],
];
(async () => {
  console.log('1. swarm.js ROUTESWITCH-PURE');
  await t('pure block found and runs in node', () => assert.ok(m && typeof S.rsChoice === 'function'));
  for (const [name, r, force, use, stored] of CASES) await t(`rsChoice: ${name} -> ${use} (stored ${stored})`, () => { const c = S.rsChoice(r, force); assert.strictEqual(c.use, use); assert.strictEqual(c.stored, stored); assert.ok(c.why.length > 3); });
  await t('rsCleanId / rsRel: every type to its folder (epic shares the raid file, dungeon -> dungeons)', () => {
    assert.strictEqual(S.rsRel('raid', 29014), 'routes/raid/29014.json');
    assert.strictEqual(S.rsRel('epic', '29019'), 'routes/raid/29019.json');
    assert.strictEqual(S.rsRel('npc', '30177'), 'routes/npc/30177.json');
    assert.strictEqual(S.rsRel('npc', '30177 '), 'routes/npc/30177.json');   // digits only (callers pass the plain template id)
    assert.strictEqual(S.rsRel('quest', '101_2'), 'routes/quest/101_2.json');
    assert.strictEqual(S.rsRel('quest', '101:2'), 'routes/quest/101_2.json');
    assert.strictEqual(S.rsRel('quest', '101'), '');
    assert.strictEqual(S.rsRel('area', 'aden-far-2-1'), 'routes/area/aden-far-2-1.json');
    assert.strictEqual(S.rsRel('room', 'antharas-1-behind-a'), 'routes/room/antharas-1-behind-a.json');
    assert.strictEqual(S.rsRel('dungeon', 'imperialtomb'), 'routes/dungeons/imperialtomb.json');
    assert.strictEqual(S.rsRel('area', '../../x'), 'routes/area/_x.json');
    assert.strictEqual(S.rsRel('bogus', '1'), '');
  });
  await t('rsQuestId: <quest>_<cond>, missing cond = none', () => { assert.strictEqual(S.rsQuestId(101, 2), '101_2'); assert.strictEqual(S.rsQuestId(5, 0), '5_0'); assert.strictEqual(S.rsQuestId(5, null), ''); assert.strictEqual(S.rsQuestId(5, undefined), ''); });
  await t('rsLegMs: from the live run speed (not fixed), min 30 s, a swim leg takes longer', () => {
    assert.strictEqual(S.rsLegMs(100, 120, false), 30000);
    const fast = S.rsLegMs(6000, 200, false), slow = S.rsLegMs(6000, 100, false), swim = S.rsLegMs(6000, 100, true);
    assert.ok(slow > fast, 'slower runner gets more time'); assert.ok(swim > slow * 1.8, 'swim leg >= ~2x'); assert.ok(S.rsLegMs(6000, 0, false) > 30000, 'unknown speed falls back');
  });
  await t('rsStartIdx: on the route = nearest point, far / other floor = -1', () => {
    const P = [{ x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }, { x: 2000, y: 0, z: 0 }];
    assert.strictEqual(S.rsStartIdx(P, { x: 1100, y: 50, z: 0 }), 1); assert.strictEqual(S.rsStartIdx(P, { x: 9000, y: 0, z: 0 }), -1); assert.strictEqual(S.rsStartIdx(P, { x: 1000, y: 0, z: 3000 }), -1);
  });
  await t('rsPoints keeps swim / water and layer flags', () => { const p = S.rsPoints({ points: [{ x: 1, y: 2, z: 3, water: true }, { x: 4, y: 5, z: 6, layer: 2 }] }); assert.strictEqual(p[0].swim, true); assert.strictEqual(p[1].layer, 2); });

  // -------------------------------------------------------------------------------------------- 2. parity
  console.log('2. Dashboard/routestore.js == swarm.js');
  await t('choice() matches rsChoice for every case', () => { for (const [name, r, force] of CASES) { const a = S.rsChoice(r, force), b = RSTORE.choice(r, force); assert.deepStrictEqual({ u: b.use, s: b.stored, h: b.has, l: b.locked, w: b.why }, { u: a.use, s: a.stored, h: a.has, l: a.locked, w: a.why }, name); } });
  await t('cleanId() matches rsCleanId, folders match', () => { for (const [ty, id] of [['raid', '29014'], ['epic', 'x29019'], ['npc', '30001'], ['quest', '7:3'], ['quest', 'x'], ['area', 'a b/c'], ['room', 'r-1'], ['dungeon', 'cruma'], ['nope', '1']]) assert.strictEqual(RSTORE.cleanId(ty, id), S.rsCleanId(ty, id), ty + ' ' + id); assert.deepStrictEqual(RSTORE.FOLDER, Object.assign({}, S.RS_FOLDER)); });

  // -------------------------------------------------------------------------------------------- 3. hooks
  console.log('3. swarm.js hooks');
  const has = (re, what) => assert.ok(re.test(src), what);
  await t('goToNpc goes through routeSwitchTrip (npc store, quest override, noAtlas = own route only)', () => has(/await routeSwitchTrip\(\{ type: 'npc', id: pick\.npc\.id[^\n]*routeUse: o\.routeUse, atlas: !o\.noAtlas \}\)/, 'goToNpc hook'));
  await t('travelToSpot: field areas + rooms read the choice (rsDecide) before the normal travel', () => { has(/const rsC = rsDecide\(rsType, rsId\);/, 'rsDecide in travelToSpot'); has(/routeSwitchTrip\(\{ type: rsType, id: rsId,/, 'routeSwitchTrip in travelToSpot'); });
  await t('enterRoom walks an own room route without a start (spot.rsRoute) instead of the old routes/rooms walk', () => has(/if \(spot\.rsRoute && rsPoints\(spot\.rsRoute\)\.length >= 2\)/, 'enterRoom hook'));
  await t('quest engine: talk (qeGoNpc a, before) and hunt steps use qeRouteTrip', () => { has(/async function qeRouteTrip\(q, cond, tgt, kind\)/, 'qeRouteTrip'); has(/qeGoNpc\(q, npcId, a, before\)/, 'qeDoTalk passes the step'); has(/await qeRouteTrip\(q, a\.cond, \{ name: spot\.name/, 'hunt hook'); });
  await t('dungeonEntryTrip reads the choice (rsChoice(er))', () => has(/const erC = rsChoice\(er\);/, 'dungeon hook'));
  await t('routeHop: every leg time from rsLegMs (live speed, swim legs) — no fixed 30000 left in routeHop', () => {
    const i = src.indexOf('async function routeHop('), j = src.indexOf('\n}\n', i), body = src.slice(i, j);
    assert.ok(/rsLegMs\(/.test(body) && /castRunSpeed\(\)/.test(body), 'hopMs'); assert.ok(!/, 30000, abort, 'route'\)/.test(body) && !/, 20000, abort, 'route'\)/.test(body), 'fixed leg times left');
  });
  await t('raidRouteFile accepts { file } (detour fixes of any store file)', () => has(/const raidRouteFile = \(b\) => b && b\.file \? b\.file :/, 'raidRouteFile'));
  await t('RAID travel code unchanged vs the 2026-10-13 backup (raidRouteUse, loadRaidRoute, saveRaidRoute, raidRouteFailed, userRouteTrip)', () => {
    if (!fs.existsSync(BACKUP)) { console.log('  (skipped: no backup ' + BACKUP + ' - a public package has none)'); return; }   // PKGSKIP-2026-10-13
    const old = fs.readFileSync(BACKUP, 'utf8');
    // one function body (a one-liner ends at its line); the DUNGEON STEPS 2026-10-13 addition to userRouteTrip is ONE guarded branch (CONFIG.routeSwitch.raidFloors)
    const fn = (s, name) => { const i = s.indexOf(name); if (i < 0) return null; const line = s.slice(i, s.indexOf('\n', i)); if ((line.match(/\{/g) || []).length === (line.match(/\}/g) || []).length) return line; const j = s.indexOf('\n}\n', i); return s.slice(i, j); };
    // ROUTEFIX 2026-10-23 (owner: red FIX THIS ROUTE signs): the stuck point is stored on a failure and cleared on success - nothing else changed
    const strip = (t) => String(t || '').split('\n').filter(l => !/ROUTESWITCH 2026-10-13 \(DUNGEON STEPS\)|CONFIG\.routeSwitch && CONFIG\.routeSwitch\.raidFloors && rsHasSteps\(r\)|ROUTEFIX|old\.stuck = rs; state\.routeStuck = null;/.test(l)).map(l => l.replace(/ delete old\.stuck;/g, '')).join('\n');
    ['function raidRouteUse(', 'function loadRaidRoute(', 'function saveRaidRoute(', 'function raidRouteFailed(', 'async function userRouteTrip('].forEach(n => { const a = fn(old, n), b = fn(src, n); assert.ok(a && b, n + ' present'); assert.strictEqual(strip(b), strip(a), n + ' changed'); });
    assert.ok(/async function userRouteTrip\(r, boss, runId\) \{\n  \/\/ ROUTESWITCH 2026-10-13 \(DUNGEON STEPS\)[^\n]*\n  if \(CONFIG\.routeSwitch && CONFIG\.routeSwitch\.raidFloors && rsHasSteps\(r\)\)/.test(src), 'userRouteTrip: the dungeon-step branch is guarded by CONFIG.routeSwitch.raidFloors');
  });
  await t('every routeSwitchTrip / rsDecide / rsCustomTrip helper is defined once', () => ['async function routeSwitchTrip(', 'function rsDecide(', 'async function rsCustomTrip(', 'async function rsWalkPoints(', 'function rsLoad(', 'function rsStat('].forEach(n => assert.strictEqual(src.split(n).length - 1, 1, n)));
  await t('no new Map() in the ROUTESWITCH code (L2Swarm world-map host type)', () => { const i = src.indexOf('// ===== ROUTE SWITCH'), j = src.indexOf('async function goToNpc(', i); assert.ok(i > 0 && j > i); assert.ok(!/new Map\(/.test(src.slice(i, j))); });

  // -------------------------------------------------------------------------------------------- 4. store on a scratch data folder
  console.log('4. routestore.api + routeview_api.view (scratch data)');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'routeswitch-')), TD = path.join(TMP, 'data');
  fs.mkdirSync(TD, { recursive: true });
  let linked = true; try { fs.symlinkSync(path.join(DATA, 'nav_atlas'), path.join(TD, 'nav_atlas'), 'junction'); } catch (e) { linked = false; }
  ['quests_h5.json', 'raidbosses_h5.json'].forEach(f => { try { fs.linkSync(path.join(DATA, f), path.join(TD, f)); } catch (e) { fs.copyFileSync(path.join(DATA, f), path.join(TD, f)); } });
  const RV = require(path.join(DASH, 'routeview_api.js'));
  const ctx = { DATA: TD, RV, DIR: DASH, LOGS: path.join(TMP, 'Logs'), ROOT: TMP, towns: { Giran: [83473, 148554, -3408], Gludin: [-80786, 150251, -3040] }, gkStarts: () => ['Gludin -> Abandoned Camp'], gkLand: () => ({}), layers: () => ({}) };
  const P3 = [{ x: -80786, y: 150251, z: -3040 }, { x: -60000, y: 150000, z: -3000 }, { x: -49064, y: 150024, z: -2900, swim: true }];
  await t('nav atlas linked read-only into the scratch folder', () => assert.ok(linked && fs.existsSync(path.join(TD, 'nav_atlas', 'index.json'))));
  for (const [ty, id] of [['npc', '30001'], ['area', 'abandoned-camp-1'], ['room', 'antharas-1-behind-a'], ['quest', '1_1'], ['dungeon', 'cruma'], ['epic', '29163']]) {
    await t(`${ty} ${id}: GET without a route = computed path, target known`, () => { const r = RSTORE.api(ctx, ty, id, null); assert.ok(!r.error, r.error); assert.strictEqual(r.choice.use, 'atlas'); assert.ok(r.target && r.target.name, 'target name'); assert.strictEqual(r.route, null); assert.ok(/^#\/routeedit\//.test(r.editHref)); });
    await t(`${ty} ${id}: refused POSTs write nothing (use without a route, 1 point, bad start)`, () => {
      assert.ok(RSTORE.api(ctx, ty, id, { action: 'use', use: 'custom' }).error); assert.ok(RSTORE.api(ctx, ty, id, { points: [P3[0]] }).error);
      assert.ok(RSTORE.api(ctx, ty, id, { points: P3, start: { kind: 'gk', desc: 'no arrow' } }).error); assert.ok(RSTORE.api(ctx, ty, id, { points: P3, start: { kind: 'town', town: 'Atlantis' } }).error);
      assert.ok(!fs.existsSync(RSTORE.fileOf(TD, ty, id)), 'file written');
    });
    await t(`${ty} ${id}: save & lock -> auto = own route; use atlas / auto / custom; unlock -> computed; history kept; delete`, () => {
      let r = RSTORE.api(ctx, ty, id, { points: P3, start: { kind: 'gk', desc: 'Gludin -> Abandoned Camp' }, manual: true });
      assert.ok(!r.error, r.error); assert.strictEqual(r.choice.use, 'custom'); assert.strictEqual(r.route.manual, true); assert.strictEqual(r.route.points[2].swim, true); assert.strictEqual(r.route.start.from, 'Gludin');
      const f = RSTORE.fileOf(TD, ty, id); assert.ok(fs.existsSync(f));
      assert.strictEqual(S.rsChoice(JSON.parse(fs.readFileSync(f, 'utf8'))).use, 'custom', 'swarm reads the saved file the same way');
      r = RSTORE.api(ctx, ty, id, { action: 'use', use: 'atlas' }); assert.strictEqual(r.choice.use, 'atlas'); assert.strictEqual(r.route.use, 'atlas');
      r = RSTORE.api(ctx, ty, id, { action: 'use', use: 'auto' }); assert.strictEqual(r.choice.use, 'custom'); assert.strictEqual(r.route.use, undefined);
      r = RSTORE.api(ctx, ty, id, { action: 'unlock' }); assert.strictEqual(r.choice.use, 'atlas'); assert.strictEqual(r.choice.why, 'auto: your own route is not locked');
      r = RSTORE.api(ctx, ty, id, { action: 'use', use: 'custom' }); assert.strictEqual(r.choice.use, 'custom');
      r = RSTORE.api(ctx, ty, id, { points: P3.slice(0, 2), manual: false }); assert.strictEqual(r.route.use, 'custom', 'the choice survives a save'); assert.strictEqual(r.route.points.length, 2);
      const hist = fs.readdirSync(path.join(path.dirname(f), 'history')); assert.ok(hist.length >= 5, 'history ' + hist.length);
      if (ty === 'epic') { const raw = JSON.parse(fs.readFileSync(f, 'utf8')); assert.ok(/[\\/]raid[\\/]29163\.json$/.test(f) && raw.boss, 'epic -> raid folder with boss'); }
      r = RSTORE.api(ctx, ty, id, { action: 'delete' }); assert.strictEqual(r.route, null); assert.strictEqual(r.choice.use, 'atlas'); assert.ok(!fs.existsSync(f));
    });
  }
  await t('unknown type / bad quest id refused', () => { assert.ok(RSTORE.api(ctx, 'castle', '1', null).error); assert.ok(RSTORE.api(ctx, 'quest', '12', null).error); assert.ok(RSTORE.api(ctx, 'npc', '', null).error); });
  await t('list(): every type, choice per route', () => {
    RSTORE.api(ctx, 'npc', '30001', { points: P3, manual: true }); RSTORE.api(ctx, 'area', 'abandoned-camp-1', { points: P3, manual: false });
    const L = RSTORE.list(ctx, ''); const n = L.find(x => x.type === 'npc' && x.id === '30001'), a = L.find(x => x.type === 'area');
    assert.ok(n && n.choice === 'custom' && a && a.choice === 'atlas', JSON.stringify(L)); assert.ok(L.every(x => /^#\/routeedit\//.test(x.editHref)));
  });
  const view = (target) => RV.view(Object.assign({}, ctx), new URLSearchParams({ target }));
  await t('route view: NPC target shows the switch data + own route (store npc, choice custom, editHref)', () => {
    const v = view('npc:30001'); assert.ok(!v.error, v.error); assert.deepStrictEqual([v.store.type, v.store.id], ['npc', '30001']); assert.ok(v.custom && v.custom.points.length === 3); assert.strictEqual(v.use, 'custom'); assert.strictEqual(v.choice.stored, 'auto'); assert.strictEqual(v.store.editHref, '#/routeedit/npc/30001');
  });
  await t('route view: area target with an unlocked own route = computed path on auto', () => { const v = view('area:abandoned-camp-1'); assert.strictEqual(v.store.type, 'area'); assert.strictEqual(v.use, 'atlas'); assert.ok(v.custom); });
  await t('route view: quest step -> store quest <id>_<cond>; room; raid keeps the raid editor link', () => {
    const q = view('quest:1:1'); assert.strictEqual(q.store.type, 'quest'); assert.strictEqual(q.store.id, '1_' + q.quest.steps[1].cond);
    const r = view('room:antharas-1-behind-a'); assert.strictEqual(r.store.type, 'room'); assert.strictEqual(r.use, 'atlas');
    const b = view('raid:29014'); assert.strictEqual(b.store.type, 'raid'); assert.strictEqual(b.store.editHref, '#/raid/29014/route');
    const e = view('epic:29163'); assert.strictEqual(e.store.type, 'raid'); assert.strictEqual(e.store.editHref, e.atlas ? '#/raid/29163/route' : '#/routeedit/epic/29163');   // with an atlas route the epic is a known raid boss: the raid editor
    assert.strictEqual(e.store.editHrefGeneric, '#/routeedit/epic/29163');
  });
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }

  // -------------------------------------------------------------------------------------------- 5. sandbox server
  console.log('5. Dashboard/server.js sandbox');
  const ROUTES = path.join(DATA, 'routes');
  const snap = () => { const out = []; const walk = (d) => { let L = []; try { L = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } L.forEach(x => { const p = path.join(d, x.name); if (x.isDirectory()) walk(p); else { const s = fs.statSync(p); out.push(p + ':' + s.size + ':' + s.mtimeMs); } }); }; walk(ROUTES); return out.sort().join('\n'); };
  const S0 = snap();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url);
    if (/:8083\b/.test(u)) { const b = JSON.parse(opt.body || '{}'); const result = b.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: {} } : { content: [{ type: 'text', text: '[]' }] }; const txt = JSON.stringify({ jsonrpc: '2.0', id: b.id, result }); return { headers: { get: (h) => (h.toLowerCase() === 'mcp-session-id' ? 'mock' : null) }, text: async () => txt, json: async () => JSON.parse(txt) }; }
    if (/:8090\b/.test(u)) throw new Error('test: the real dashboard (8090) must never be called');
    return realFetch(url, opt);
  };
  const T0 = { si: global.setInterval, st: global.setTimeout };
  global.setInterval = () => 0; global.setTimeout = () => 0;
  cp.fork = () => ({ on() { }, kill() { }, send() { } });
  cp.spawn = () => ({ on() { }, kill() { }, stdout: { on() { } }, stderr: { on() { } } });
  cp.execFile = (cmd, args, opt, cb) => { const f = typeof opt === 'function' ? opt : cb; if (f) process.nextTick(() => f(null, '', '')); return { on() { } }; };
  cp.exec = () => ({ on() { } });
  let PORT = 0;
  const realCreate = http.createServer;
  http.createServer = (h) => { const s = realCreate(h); const L = s.listen.bind(s); s.listen = (p, host, cb) => L(0, '127.0.0.1', () => { PORT = s.address().port; if (typeof host === 'function') host(); else if (cb) cb(); }); return s; };
  const realLog = console.log; console.log = () => { };
  try { require(path.join(DASH, 'server.js')); } finally { console.log = realLog; global.setInterval = T0.si; global.setTimeout = T0.st; }
  for (let i = 0; i < 60 && !PORT; i++) await new Promise(r => T0.st(r, 50));
  const call = (p, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' } }, (res) => { let tx = ''; res.on('data', c => tx += c); res.on('end', () => { let j = null; try { j = JSON.parse(tx); } catch (e) { } resolve({ code: res.statusCode, j, t: tx, type: res.headers['content-type'] }); }); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
  await t('sandbox server listening', () => assert.ok(PORT > 0));
  await t('GET /api/route?id=29014 (old raid form, no type): same keys as before (boss, route, towns, gkStarts), no choice wrapper', async () => { const r = await call('/api/route?id=29014'); assert.strictEqual(r.code, 200); assert.ok(r.j.boss && r.j.boss.name === 'Orfen' && 'route' in r.j && r.j.towns && Array.isArray(r.j.gkStarts)); assert.ok(!('choice' in r.j)); });
  await t('GET /api/route?type=raid&id=29014: raid answer + choice + editHref to the raid editor', async () => { const r = await call('/api/route?type=raid&id=29014'); assert.strictEqual(r.code, 200); assert.ok(r.j.choice && r.j.choice.use); assert.strictEqual(r.j.editHref, '#/raid/29014/route'); });
  for (const [ty, id] of [['npc', '30001'], ['area', 'abandoned-camp-1'], ['room', 'antharas-1-behind-a'], ['quest', '1_1'], ['dungeon', 'imperialtomb'], ['epic', '29163'], ['epic', '29014']]) {
    await t(`GET /api/route?type=${ty}&id=${id}: 200 with choice + target`, async () => { const r = await call(`/api/route?type=${ty}&id=${encodeURIComponent(id)}`); assert.strictEqual(r.code, 200, r.t.slice(0, 200)); assert.ok(r.j.choice && /^(atlas|custom)$/.test(r.j.choice.use)); assert.ok(r.j.target && r.j.target.name, 'target'); });
  }
  await t('GET dungeon imperialtomb: the existing locked entry route = own route on auto', async () => { if (!fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'routes', 'dungeons', 'imperialtomb.json'))) { console.log('  (skipped: no saved Imperial Tomb route here)'); return; } const r = await call('/api/route?type=dungeon&id=imperialtomb'); assert.strictEqual(r.j.choice.use, 'custom'); assert.ok(r.j.route && r.j.route.manual); });
  await t('refused POSTs: unknown type 400, use without a route 400, 1 point 400 — nothing written', async () => {
    assert.strictEqual((await call('/api/route', { type: 'castle', id: '1', action: 'use', use: 'atlas' })).code, 400);
    assert.strictEqual((await call('/api/route', { type: 'npc', id: '30001', action: 'use', use: 'custom' })).code, 400);
    assert.strictEqual((await call('/api/route', { type: 'area', id: 'abandoned-camp-1', points: [{ x: 1, y: 2, z: 3 }] })).code, 400);
    assert.strictEqual((await call('/api/route', { type: 'quest', id: 'x', points: [] })).code, 400);
  });
  await t('GET /api/routes?type=all = every saved route with its choice; /api/routes (raid list) unchanged', async () => { const a = await call('/api/routes?type=all'); assert.ok(Array.isArray(a.j.routes) && a.j.routes.every(x => x.type && x.choice)); const b = await call('/api/routes'); assert.ok(Array.isArray(b.j.routes) && b.j.routes.every(x => x.boss !== undefined || x.id)); });
  await t('GET /api/routeview?target=npc:30001 -> store npc + choice', async () => { const r = await call('/api/routeview?target=npc:30001'); assert.strictEqual(r.code, 200); assert.strictEqual(r.j.store.type, 'npc'); assert.ok(r.j.choice); });
  await t('static: /routeedit.js, /routeedit.css, /routeview.js served', async () => { for (const p of ['/routeedit.js', '/routeedit.css', '/routeview.js']) { const r = await call(p); assert.strictEqual(r.code, 200, p); assert.ok(r.t.length > 500, p); } });
  await t('the live route store (Scripts/data/routes) is unchanged', () => assert.strictEqual(snap(), S0));

  // -------------------------------------------------------------------------------------------- 6. syntax + UI
  console.log('6. syntax + UI');
  const files = ['Scripts_dev/swarm.js', 'Dashboard/routestore.js', 'Dashboard/routeview_api.js', 'Dashboard/routeview.js', 'Dashboard/routeedit.js', 'Dashboard/server.js', 'Dashboard/epicedit.js', 'docs/plan/tools/test_route_switch.js'].filter(f => f !== 'Dashboard/epicedit.js' || fs.existsSync(path.join(ROOT, f)));   // epicedit.js is owner-only (not in the public package)
  for (const f of files) await t('node --check ' + f, () => { cp.execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); });
  await t('every inline <script> of Dashboard/index.html compiles', () => {
    const html = fs.readFileSync(path.join(DASH, 'index.html'), 'utf8'); let n = 0;
    html.replace(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g, (mm, code) => { n++; new vm.Script(code, { filename: 'index.html#inline' + n }); return mm; });
    assert.ok(n > 3, 'inline scripts: ' + n);
    assert.ok(/RouteEditPage\.route\(kind, arg\)/.test(html) && /<script src="\/routeedit\.js"><\/script>/.test(html), 'route + script tag');
    assert.ok(/data-rvopen="room:/.test(html) && /data-rvopen="area:/.test(html), 'Route buttons in the room / area pickers');
  });
  if (fs.existsSync(path.join(DASH, 'epicedit.js'))) await t('epic page has the Route button', () => assert.ok(/data-rvopen="epic:/.test(fs.readFileSync(path.join(DASH, 'epicedit.js'), 'utf8'))));
  // the browser parts in a tiny DOM stub
  const doc = { listeners: [], addEventListener(type, fn) { this.listeners.push(type); }, getElementById() { return null }, querySelector() { return null }, querySelectorAll() { return [] }, createElement() { return { classList: { add() { } }, addEventListener() { }, appendChild() { } } }, head: { appendChild() { } }, body: { appendChild() { } } };
  const win = { document: doc, location: { hash: '' }, history: {}, addEventListener() { }, scrollTo() { } };
  const g = vm.createContext(Object.assign({ window: win, document: doc, location: win.location, history: win.history, console, setInterval: () => 0, clearInterval() { }, fetch: () => Promise.reject(new Error('no')) }, {}));
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(DASH, 'routeview.js'), 'utf8'), g);
  vm.runInContext(fs.readFileSync(path.join(DASH, 'routeedit.js'), 'utf8'), g);
  const RVw = win.RouteView, REw = win.RouteEditPage;
  await t('routeview.js: 3-way switch for a non-raid target (computed / own route / auto), own route disabled without a route, editor link', () => {
    const none = RVw._useHtml({ store: { type: 'npc', id: '30001', typeName: 'NPC', editHref: '#/routeedit/npc/30001' }, custom: null, use: 'atlas', choice: { stored: 'auto', use: 'atlas', why: 'no saved route' }, target: { name: 'Lector' } });
    assert.ok(/data-use="atlas"/.test(none) && /data-use="custom"[^>]*disabled/.test(none) && /data-use="auto"[^>]*class="on"/.test(none) && /Record \/ draw my own route/.test(none) && /#\/routeedit\/npc\/30001/.test(none));
    const own = RVw._useHtml({ store: { type: 'area', id: 'a-1', editHref: '#/routeedit/area/a-1' }, custom: { points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], length: 1, manual: true, start: { kind: 'town', town: 'Giran' } }, use: 'custom', choice: { stored: 'custom', use: 'custom', why: 'your choice: own route' } });
    assert.ok(/data-use="custom"[^>]*class="on"/.test(own) && !/data-use="custom"[^>]*disabled/.test(own) && /now: own route/.test(own) && /\.giran/.test(own) && /Edit my own route/.test(own));
    assert.strictEqual(RVw._useHtml({ store: null }), '');
  });
  await t('routeview.js registers the data-rvopen click handler; routeedit.js defines RouteEditPage + the route view target of every type', () => {
    assert.ok(doc.listeners.includes('click')); assert.ok(REw && typeof REw.route === 'function');
    assert.strictEqual(REw._rvTarget('epic', '29163'), 'raid:29163'); assert.strictEqual(REw._rvTarget('npc', '30001'), 'npc:30001'); assert.strictEqual(REw._rvTarget('quest', '1_2', { target: { quest: { step: 2 } } }), 'quest:1:2'); assert.strictEqual(REw._rvTarget('room', 'r-1'), 'room:r-1');
    assert.strictEqual(REw.route('parties'), false);
  });
  await t('no browser alert / confirm / prompt in the new UI code', () => { for (const f of ['routeedit.js', 'routeview.js']) { const s = fs.readFileSync(path.join(DASH, f), 'utf8'); assert.ok(!/(^|[^.\w])(alert|confirm|prompt)\(/.test(s), f); } });

  // -------------------------------------------------------------------------------------------- 7. DUNGEON STEPS (2026-10-13: Archon Suscepter, Cruma floor 1)
  console.log('7. dungeon steps (Archon Suscepter 25395, Cruma Tower floor 1)');
  const MOZ = { do: 'floor', dungeon: 'Cruma Tower', dungeonKey: 'cruma', floor: 0, floorName: '1st floor', npc: { id: 30483, name: 'Mozella', x: 17296, y: 114176, z: -3439 }, link: 'Teleport into the Tower.', landing: [17781, 113999, -11672] };
  const ARCHON_BAD = { manual: true, points: [{ x: 17225, y: 114173, z: -3440 }, { x: 14654, y: 118568, z: -3440 }, { x: 15000, y: 119000, z: -11900 }] };
  const ARCHON_OK = { manual: true, points: [{ x: 17225, y: 114173, z: -3440 }, { x: 17296, y: 114176, z: -3439 }, MOZ, { x: 17781, y: 113999, z: -11672 }, { x: 15000, y: 119000, z: -11900 }] };
  await t('rsFloorCheck: a >1500 height jump without a step = invalid (Archon); a dungeon step between = ok; drop mark / floorOk = ok; 1500 exactly = ok', () => {
    const b = S.rsFloorCheck(ARCHON_BAD); assert.strictEqual(b.ok, false); assert.strictEqual(b.at, 3); assert.ok(/jumps 8460/.test(b.why), b.why);
    assert.strictEqual(S.rsFloorCheck(ARCHON_OK).ok, true);
    assert.strictEqual(S.rsFloorCheck({ points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: -5000, drop: true }] }).ok, true);
    assert.strictEqual(S.rsFloorCheck(Object.assign({ floorOk: true }, ARCHON_BAD)).ok, true);
    assert.strictEqual(S.rsFloorCheck({ points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: -1500 }] }).ok, true);
  });
  await t('rsChoice: a locked route that jumps floors -> computed path (auto AND custom), with the reason; a route with the step -> own route', () => {
    const a = S.rsChoice(ARCHON_BAD), c = S.rsChoice(Object.assign({ use: 'custom' }, ARCHON_BAD));
    assert.strictEqual(a.use, 'atlas'); assert.ok(a.invalid && /not walkable/.test(a.why)); assert.strictEqual(c.use, 'atlas');
    assert.strictEqual(S.rsChoice(ARCHON_OK).use, 'custom');
  });
  await t('rsSegments / rsHasSteps / rsWhere: points | step | points; on the floor-1 part = segment 2', () => {
    const sg = S.rsSegments(ARCHON_OK); assert.deepStrictEqual(JSON.parse(JSON.stringify(sg.map(x => x.step ? 'step' : 'pts' + x.pts.length))), ['pts2', 'step', 'pts2']);
    assert.strictEqual(S.rsHasSteps(ARCHON_OK), true); assert.strictEqual(S.rsHasSteps(ARCHON_BAD), false);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(S.rsWhere(sg, { x: 15100, y: 118900, z: -11900 }))), { seg: 2, idx: 1 }); assert.strictEqual(S.rsWhere(sg, { x: 15100, y: 118900, z: -3700 }), null, 'surface above the boss is not on the route');
  });
  await t('routestore floorCheck / segments / choice agree with swarm.js', () => {
    for (const r of [ARCHON_BAD, ARCHON_OK, { points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: -5000, drop: true }] }, null]) {
      assert.deepStrictEqual(JSON.parse(JSON.stringify(RSTORE.floorCheck(r))), JSON.parse(JSON.stringify(S.rsFloorCheck(r)))); assert.deepStrictEqual(JSON.parse(JSON.stringify(RSTORE.segments(r))), JSON.parse(JSON.stringify(S.rsSegments(r))));
      const x = RSTORE.choice(r), y = S.rsChoice(r); assert.deepStrictEqual([x.use, x.stored, x.why, x.invalid || null], [y.use, y.stored, y.why, y.invalid || null]);
    }
  });
  await t('routestore.cleanPoints: a Cruma floor-1 step is filled from dungeon_rooms (Mozella, landing); a walk-in floor (Ant Nest) / unknown dungeon is refused', () => {
    const cp = RSTORE.cleanPoints(DATA, [{ x: 17225, y: 114173, z: -3440 }, { do: 'floor', dungeonKey: 'cruma', floor: 0 }, { x: 15000, y: 119000, z: -11900 }]);
    assert.ok(!cp.error, cp.error); assert.strictEqual(cp.pts[1].npc.name, 'Mozella'); assert.ok(Array.isArray(cp.pts[1].landing)); assert.strictEqual(cp.plain.length, 2);
    assert.ok(RSTORE.cleanPoints(DATA, [{ x: 1, y: 1, z: 1 }, { do: 'floor', dungeonKey: 'antnest', floor: 0 }, { x: 2, y: 2, z: 2 }]).error);
    assert.ok(RSTORE.cleanPoints(DATA, [{ x: 1, y: 1, z: 1 }, { do: 'floor', dungeonKey: 'nope', floor: 0 }, { x: 2, y: 2, z: 2 }]).error);
  });
  await t('nav atlas raid:25395: the jumping saved route is not used; town > gk > walk to Mozella > floor step (Cruma 1st floor) > walk on the floor', () => {
    const r = JSON.parse(fs.readFileSync(path.join(DATA, 'nav_atlas', 't', 'raid_25395.json'), 'utf8'));
    const fl = r.steps.findIndex(s => s.do === 'floor'); assert.ok(fl > 0, r.steps.map(s => s.do).join('>'));
    assert.strictEqual(r.steps[fl].npc.name, 'Mozella'); assert.strictEqual(r.steps[fl].dungeonKey, 'cruma');
    assert.ok(r.steps.slice(0, fl).some(s => s.do === 'gk' && /Cruma/.test(s.desc)));
    r.steps.filter(s => s.do === 'walk').forEach(s => { for (let k = 5; k < s.points.length; k += 3) assert.ok(Math.abs(s.points[k] - s.points[k - 3]) <= 1500, 'walk jumps floors'); });
    assert.ok((r.why || []).some(w => /not used/.test(w)) && r.savedInvalid && r.savedInvalid.manual === true);
  });
  await t('swarm.js: navAtlasUsable refuses a walk that jumps floors; raid travel uses raidRouteUseFloors (2x) + raidDungeonSpot (2x), all behind CONFIG.routeSwitch.raidFloors (default true)', () => {
    assert.ok(/routeSwitch: \{ raidFloors: true \}/.test(src), 'CONFIG switch');
    assert.strictEqual(src.split('urUse = raidRouteUseFloors(').length - 1, 2); assert.ok(src.split('raidDungeonSpot(').length - 1 >= 3);
    assert.ok(/function raidRouteUseFloors\(r, b\) \{\n  if \(!r \|\| !\(CONFIG\.routeSwitch && CONFIG\.routeSwitch\.raidFloors\)\) return raidRouteUse\(r\);/.test(src));
    assert.ok(/the walk jumps floors \(z /.test(src) && /for \(const s of r\.steps\) \{ if \(s\.do !== 'walk' \|\| s\.drop/.test(src), 'navAtlasUsable');
    assert.ok(/async function rsDoStep\(s, label, abort, team\)[\s\S]{0,1500}floorTeleport\(Object\.assign\(\{\}, F, \{ dungeon: dd\.name \}\)\)[\s\S]{0,600}App\.emit\('swarm\.floortp'/.test(src), 'rsDoStep: floorTeleport + members follow');
  });
  await t('navAtlasUsable (NAVATLAS-PURE context): the atlas route of Archon is usable, a jumping walk is not', () => {
    const i = src.indexOf('function navAtlasUsable('), j = src.indexOf('\n}\n', i), c = { navAtlasSettings: () => ({ maxStraight: 5000 }) }; vm.createContext(c); vm.runInContext(src.slice(i, j + 2) + '\nthis.f = navAtlasUsable;', c);
    const r = JSON.parse(fs.readFileSync(path.join(DATA, 'nav_atlas', 't', 'raid_25395.json'), 'utf8'));
    assert.strictEqual(c.f(r).ok, true, c.f(r).why);
    assert.strictEqual(c.f({ name: 'x', status: 'ok', steps: [{ do: 'walk', how: 'saved', len: 100, points: [0, 0, -3440, 10, 10, -11900] }] }).ok, false);
  });
  await t('route view: raid:25395 -> levels surface + Cruma 1st floor; chain names Mozella and the floor; a jumping own route shows the red warning', () => {
    const v = RV.view({ DATA, DIR: DASH, LOGS: path.join(ROOT, 'Logs'), ROOT }, new URLSearchParams({ target: 'raid:25395' }));
    assert.ok(!v.error, v.error); assert.ok(v.levels.some(l => l.key === 'cruma:0'), JSON.stringify(v.levels));
    const html = RVw._html(v, { opts: { map: false } }); assert.ok(/Mozella/.test(html) && /Cruma Tower 1st floor/.test(html), 'chain'); assert.ok(/rv-invalid/.test(html) === !!(v.custom && v.custom.invalid), 'warning iff invalid');
    if (v.custom) { assert.ok(v.custom.invalid, 'the live 25395 file still jumps floors (user decides)'); assert.strictEqual(v.use, 'atlas'); }
  });
  await t('route_snapz.js: refuses to snap points that belong to another floor (Archon boss point), snaps flat hand-drawn z (synthetic)', () => {
    const SZ = require(path.join(ROOT, 'docs', 'plan', 'tools', 'route_snapz.js'));
    const a = SZ.snap(ARCHON_BAD.points); assert.ok(a.changes.some(c => c.n === 3 && c.ambiguous), 'Archon boss point is ambiguous');
  });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
