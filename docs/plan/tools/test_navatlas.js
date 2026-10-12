// TEST NAV ATLAS (2026-10-12): the world navigation atlas + its bot integration, nothing live (no L2Swarm, no game, no Logs writes outside a temp dir).
//  1) data: Scripts/data/nav_atlas (index, per-target files, grid / npcid shards, nav_doors.json kinds + timed doors)
//  2) the NAV ATLAS block of swarm.js (from a patched swarm.js) in a vm with a fake world: lookup, needs, start step, the step executor
//     (town / gk / walk / timed door / NPC door / Unlock door / floor / enter / arrive), blocked routes, teleportNear part, real routes (Pagan Temple)
//  3) the patch anchors: the 4 call sites use the atlas first and keep the old travel code as fallback
// Usage: node docs/plan/tools/test_navatlas.js [--swarm <patched swarm.js>] [--patch <patch_navatlas.js>]
//        default: Scripts_dev/swarm.js when it already has the block, else the patch applied to a temp copy of it.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data'), AT = path.join(DATA, 'nav_atlas');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

// ---------------------------------------------------------------- 1) data
console.log('1) atlas data');
const ix = J(path.join(AT, 'index.json'));
ok(ix.targets && ix.targets.length > 3000, `index: ${ix.targets.length} targets`);
const split = fs.existsSync(path.join(AT, 'split.json')) ? J(path.join(AT, 'split.json')) : null;
ok(split && split.targets === ix.targets.length, `split.json covers every target (${split && split.targets})`);
const tFiles = fs.readdirSync(path.join(AT, 't'));
ok(tFiles.length === ix.targets.length, `one route file per target (${tFiles.length})`);
const big = tFiles.map(f => fs.statSync(path.join(AT, 't', f)).size).sort((a, b) => b - a)[0];
ok(big < 200000, `largest per-target file ${big} bytes (< 200 KB: cheap for 59 engines)`);
const doors = J(path.join(DATA, 'nav_doors.json'));
ok(doors.doors.length > 1200 && doors.stats.timed > 100, `nav_doors: ${doors.doors.length} doors, ${doors.stats.timed} timed, ${doors.stats.unlockable} unlockable, ${doors.stats.keyed} keyed`);
ok(doors.doors.filter(d => d.timed).every(d => d.timed.openFor[0] >= 0 && d.timed.closedFor[0] >= 0 && d.timed.periodMax >= d.timed.periodMin), 'every timed door has open / closed phases and a period');
ok(doors.conditions.some(c => c.key === 'pagan-temple-gate') && doors.conditions.some(c => c.key === 'hellbound') && doors.conditions.every(c => c.src), 'conditions: Pagan Temple marks, Hellbound warpgate, each with its source');
ok(doors.doors.filter(d => d.kind === 'closed-no-opener').every(d => d.place), 'every door without an opener has a place');

// ---------------------------------------------------------------- 2) the block in a vm
console.log('2) swarm.js NAV ATLAS block (vm, fake world)');
let SW = arg('--swarm', null);
const DEV = path.join(ROOT, 'Scripts_dev', 'swarm.js');
if (!SW) {
  if (fs.readFileSync(DEV, 'utf8').includes('NAVATLAS-PURE begin')) SW = DEV;
  else {
    const P = arg('--patch', '%TEMP%/scratch');
    SW = path.join(os.tmpdir(), `swarm_navatlas_test_${process.pid}.js`); fs.copyFileSync(DEV, SW);
    const r = cp.spawnSync(process.execPath, [P, SW], { encoding: 'utf8' }); ok(r.status === 0, 'patch applied to a temp copy: ' + String(r.stdout).trim());
    const r2 = cp.spawnSync(process.execPath, [P, SW], { encoding: 'utf8' }); ok(r2.status === 2, 'a second run of the patch is refused');
    const c = cp.spawnSync(process.execPath, ['--check', SW], { encoding: 'utf8' }); ok(c.status === 0, 'node --check on the patched copy' + (c.status ? ': ' + c.stderr.slice(0, 300) : ''));
  }
}
const SRC = fs.readFileSync(SW, 'utf8');
const a = SRC.indexOf('// ===== NAV ATLAS ('), b = SRC.indexOf('// ===== NAV ATLAS end');
ok(a > 0 && b > a, 'block found in ' + path.basename(SW));
const BLOCK = SRC.slice(a, b);
// call sites
ok(/navAtlasNear\(x, y, why\)\) === true\) return true/.test(SRC), 'teleportNear asks the atlas first');
ok(/navAtlasTrip\(\{ type: 'raid'[\s\S]{0,400}there = na && na\.ok \? true : await travelToSpot\(spot\)/.test(SRC), 'raid travel: atlas first, travelToSpot as fallback');
ok(/navAtlasTrip\(\{ type: 'npc'[\s\S]{0,600}else if \(na\) plan = npcTripPlan/.test(SRC), 'goToNpc: atlas first, the old plan re-made from where we stand on failure');
ok(/if \(!er\.manual && typeof navAtlasTrip === 'function'\)/.test(SRC), 'dungeonEntryTrip: atlas only for non-manual saved routes (manual routes win)');

function world(opts) {
  const W = { t: 1e9, calls: [], said: [], notes: [], me: Object.assign({ X: 0, Y: 0, Z: 0, Level: 40, Name: 'Tester', IsDead: false, ClassId: 0 }, opts.me || {}), items: opts.items || {}, skills: opts.skills || {}, doors: opts.doors || {}, town: opts.town || null, npcs: opts.npcs || [] };
  const towns = opts.towns || {}, land = opts.land || {};
  const ctx = {
    console, Math, JSON, Date: { now: () => W.t }, String, Number, Object, Array, isFinite, Promise, setTimeout: (f) => { W.calls.push('setTimeout'); }, RegExp,
    __SCRIPTS__: path.join(ROOT, 'Scripts'), SWARM_ROOT: os.tmpdir(),
    File: { ReadAllText: (p) => fs.readFileSync(String(p).replace(/\\/g, '/'), 'utf8') },
    Me: W.me, CONFIG: { leader: 'Tester', mission: {} }, state: {}, control: { gen: 1 }, gkFail: '',
    PartyList: { forEach: (f) => (opts.party || []).forEach(f) },
    SkillsList: { GetItemByID: (id) => W.skills[id] || null },
    App: { on: () => { }, emit: (n, d) => W.calls.push('emit ' + n) },
    Send: { ReqBypassToServer: (c) => { W.calls.push('bypass ' + c); const n = W.npcs.find(x => x.cmd === c); if (n && n.to) Object.assign(W.me, { X: n.to[0], Y: n.to[1], Z: n.to[2] }); }, Action: (id) => W.calls.push('action ' + id),
      RequestMagicSkillUse: (id) => { W.calls.push('skill ' + id); if (id === 27) Object.values(W.doors).forEach(d => { if (d.unlockable) d.open = true; }); } },
    UseItem: (id) => { W.calls.push('use ' + id); Object.values(W.doors).forEach(d => { if (d.key === id) d.open = true; }); },
    now: () => W.t, sleep: async (ms) => { W.t += ms; Object.values(W.doors).forEach(d => { if (d.opensAt && W.t >= d.opensAt) d.open = true; }); },
    num: (v) => Number(v) || 0, P: (x, y, z) => `${Math.round(x)},${Math.round(y)}`, distTo: (x, y) => Math.hypot(W.me.X - x, W.me.Y - y),
    note: (m, say) => W.notes.push((say ? '! ' : '') + m), SayToParty: (m) => W.said.push(m), setTask: () => { }, intent: (a, d) => W.calls.push('intent ' + a), intentDone: (a, ok2, d) => W.calls.push(`done ${a} ${ok2} ${d}`),
    logError: (w, e) => W.calls.push('ERROR ' + w + ' ' + (e && e.message)), appendShared: () => { }, interrupted: () => false, isLeader: () => !!opts.leader, teamNames: () => opts.team || [],
    currentTownKey: () => W.town, townKeyFor: (t) => { const k = String(t || ''); return towns[k] ? k : null; }, itemCount: (id) => W.items[id] || 0,
    teamTeleport: async (text, why) => { W.calls.push('tp ' + text); if (towns[text]) { Object.assign(W.me, { X: towns[text][0], Y: towns[text][1], Z: towns[text][2] }); W.town = text; return true; } if (land[text]) { Object.assign(W.me, { X: land[text][0], Y: land[text][1], Z: land[text][2] }); W.town = null; return true; } return false; },
    walkTo: async (x, y, z) => { if (opts.wallAt && W.doors[opts.wallAt] && !W.doors[opts.wallAt].open && Math.hypot(x - opts.wallAfter[0], y - opts.wallAfter[1]) < 5) return false; W.calls.push('walk'); Object.assign(W.me, { X: x, Y: y, Z: z }); W.t += 1000; return true; },
    leadRouteWalk: async (pts) => { W.calls.push('leadRouteWalk ' + pts.length); const p = pts[pts.length - 1]; Object.assign(W.me, { X: p.x, Y: p.y, Z: p.z }); return true; },
    appearBurst: () => { }, sendAppearing: () => { },
    SIEGE: { hook: false, on: false, statics: {} }, siegeHookOn: () => { ctx.SIEGE.hook = true; }, siegeHookOff: () => { ctx.SIEGE.hook = false; },
    snapNpcs: () => W.npcs.map(n => ({ Id: n.id, Name: n.name, X: n.x, Y: n.y, IsDead: false, ref: n })),
    openNpc: async (ref) => { W.calls.push('talk ' + ref.name); if (ref.opensDoor) W.doors[ref.opensDoor].open = true; return ref.html || '<html>hi</html>'; },
    npcLinks: (h) => [...String(h).matchAll(/<a action="bypass ([^"]+)">([^<]+)<\/a>/g)].map(m => ({ cmd: m[1], text: m[2] })),
    npcNorm: (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
    floorTeleport: async (F) => { W.calls.push('floor ' + F.name); return true; }, dungeonRooms: () => opts.dungeons || [], enterDungeon: async (n) => { W.calls.push('enterDungeon ' + n); return true; },
    livePos: {},
  };
  // door packets: SIEGE.statics mirrors W.doors on every read (the hook would fill it from 0x9F / 0x4D)
  Object.defineProperty(ctx.SIEGE, 'statics', { get: () => { const o = {}; Object.entries(W.doors).forEach(([id, d]) => { if (!d.noPacket) o[id] = { objId: 7000 + Number(id) % 1000, closed: !d.open, at: W.t }; }); return o; } });
  vm.createContext(ctx);
  vm.runInContext(BLOCK + '\n;globalThis.__api = { navAtlasRoute, navAtlasUsable, navAtlasNeeds, navAtlasStartIdx, navAtlasPts, navAtlasRun, navAtlasTrip, navAtlasNear, navAtlasDoorWaitMs, NAVATLAS };', ctx);
  W.api = ctx.__api; W.ctx = ctx;
  return W;
}
const run = (p) => p.then(r => r, e => ({ ok: false, why: 'THROW ' + e.message }));

(async () => {
  // a synthetic route: town -> gk -> walk -> timed door -> walk -> floor -> walk -> arrive
  const R = { key: 'raid:999', type: 'raid', name: 'Test Boss', status: 'ok', target: { x: 10000, y: 0, z: 0 }, needs: {}, steps: [
    { do: 'town', town: 'Giran', cmd: '.giran' },
    { do: 'gk', from: 'Giran', link: 'Test Field', desc: 'Giran -> Test Field', landing: [1000, 0, 0] },
    { do: 'walk', points: [1000, 0, 0, 2000, 0, 0, 3000, 0, 0], len: 2000, how: 'geodata' },
    { do: 'door', doorId: 111, name: 'gate', kind: 'timed', at: [3000, 0, 0], need: { wait: { closedFor: [20, 30], openFor: [20, 30], maxWait: 30 } } },
    { do: 'walk', points: [3000, 0, 0, 4000, 0, 0], len: 1000, how: 'geodata' },
    { do: 'floor', dungeon: 'D', floor: 1, floorName: 'F2', npc: { id: 5, name: 'Porter', x: 4000, y: 0, z: 0 } },
    { do: 'walk', points: [4000, 0, -500, 6000, 0, -500, 8000, 0, -500, 10000, 0, -500], len: 6000, how: 'geodata' },
    { do: 'arrive', target: 'raid:999', x: 10000, y: 0, z: -500 }] };
  const base = { towns: { Giran: [83000, 148000, -3400] }, land: { 'Test Field': [1000, 0, 0] }, dungeons: [{ name: 'D', floors: [{ name: 'F1' }, { name: 'F2', enter: { npc: { id: 5 } } }] }] };
  {
    const W = world(Object.assign({}, base, { me: { X: 83000, Y: 148000, Z: -3400 }, doors: { 111: { open: false, opensAt: 1e9 + 25000 } } }));
    W.town = null;
    const r = await run(W.api.navAtlasRun(R, { why: 'test', stop: { x: 10000, y: 0, dist: 1500 } }));
    ok(r.ok, `full route: ok (${r.why || ''})`);
    ok(W.calls.indexOf('tp Giran') >= 0 && W.calls.indexOf('tp Test Field') > W.calls.indexOf('tp Giran'), 'town then gatekeeper, in order');
    ok(W.t - 1e9 >= 25000, `waited for the timed door (${Math.round((W.t - 1e9) / 1000)} s virtual)`);
    ok(W.calls.includes('floor F2'), 'floor teleporter used (floorTeleport with the dungeon floor)');
    ok(Math.hypot(W.me.X - 10000, W.me.Y) <= 1500 + 1 && W.me.X < 10000, `stopped at the stage distance (${W.me.X})`);
  }
  {
    const W = world(Object.assign({}, base, { me: { X: 2000, Y: 10, Z: 0 }, doors: { 111: { open: true } } }));
    const r = await run(W.api.navAtlasRun(R, { why: 'resume' }));
    ok(r.ok && !W.calls.some(c => /^tp /.test(c)), 'standing on the walk: starts there (no town / gatekeeper)');
  }
  {
    const W = world(Object.assign({}, base, { me: { X: 83000, Y: 148000, Z: -3400 }, doors: { 111: { open: false } } }));
    const r = await run(W.api.navAtlasRun(R, { why: 'never opens' }));
    ok(!r.ok && /still closed/.test(r.why), `a timed door that never opens fails with a reason: ${r.why}`);
    ok(W.api.navAtlasDoorWaitMs(R.steps[3].need) === (30 + 30 + 30) * 1000, 'wait limit = closed phase + open phase + 30 s');
  }
  {
    const RB = JSON.parse(JSON.stringify(R)); RB.status = 'blocked'; RB.why = ['door 5 owner only'];
    const W = world(base);
    ok(!W.api.navAtlasUsable(RB).ok, 'a blocked route is not used (the old travel code runs)');
    const RS = JSON.parse(JSON.stringify(R)); RS.steps[6].how = 'straight'; RS.steps[6].len = 9000;
    ok(!W.api.navAtlasUsable(RS).ok, 'a route with > 5000 uncomputed (straight) walking is not used');
  }
  {
    // unlock door, NPC door, key door
    const RU = { key: 'room:x', name: 'Doors', status: 'conditional', target: { x: 5000, y: 0, z: 0 }, needs: { items: [{ id: 8067, name: "Pagan's Mark" }] }, steps: [
      { do: 'walk', points: [0, 0, 0, 1000, 0, 0], len: 1000, how: 'geodata' },
      { do: 'door', doorId: 201, name: 'npcdoor', kind: 'npc', at: [1000, 0, 0], need: { npc: [{ id: 32034, name: 'Temple Gatekeeper', x: 900, y: 50, z: 0 }], anyItem: [8064, 8067], closesAfterSec: 10 } },
      { do: 'walk', points: [1000, 0, 0, 2000, 0, 0], len: 1000, how: 'geodata' },
      { do: 'door', doorId: 202, name: 'lockdoor', kind: 'unlock', at: [2000, 0, 0], need: { unlock: { skillId: 27 } } },
      { do: 'walk', points: [2000, 0, 0, 3000, 0, 0], len: 1000, how: 'geodata' },
      { do: 'door', doorId: 203, name: 'keydoor', kind: 'key', at: [3000, 0, 0], need: { items: [{ id: 8275, name: 'Key of Darkness', skillId: 2237 }], unlock: { skillId: 27 } } },
      { do: 'walk', points: [3000, 0, 0, 5000, 0, 0], len: 2000, how: 'geodata' }, { do: 'arrive', x: 5000, y: 0, z: 0 }] };
    const W = world({ me: { X: 0, Y: 0, Z: 0 }, skills: { 27: { Id: 27 } }, items: { 8275: 1 }, npcs: [{ id: 32034, name: 'Temple Gatekeeper', x: 900, y: 50, opensDoor: 201 }], doors: { 201: { open: false }, 202: { open: false, unlockable: true }, 203: { open: false, key: 8275 } } });
    const r = await run(W.api.navAtlasRun(RU, { why: 'doors' }));
    ok(r.ok, `NPC door + Unlock door + key door: ok (${r.why || ''})`);
    ok(W.calls.includes('talk Temple Gatekeeper') && W.calls.includes('skill 27') && W.calls.includes('use 8275'), 'talked to the gatekeeper, cast Unlock, used the key');
    ok(W.notes.some(n => /needs item Pagan's Mark/.test(n)) && W.notes.some(n => /trying anyway/.test(n)), 'missing items are said before leaving (warn, never refuse)');
    const W2 = world({ me: { X: 0, Y: 0, Z: 0 }, npcs: [{ id: 32034, name: 'Temple Gatekeeper', x: 900, y: 50, opensDoor: 201 }], doors: { 201: { open: false }, 202: { open: false, unlockable: true }, 203: { open: false } } });
    const r2 = await run(W2.api.navAtlasRun(RU, { why: 'no dagger' }));
    ok(!r2.ok && /lockdoor/.test(r2.why), `no Unlock and no key: fails at that door with a reason (${r2.why})`);
    const n = W2.api.navAtlasNeeds(RU, { itemCount: () => 0, level: 40, hasSkill: () => false, partyHasUnlock: false });
    ok(n.missing.length === 1, 'needs: one missing item listed');
  }
  {
    // teleportNear part: only the transport steps
    const W = world(Object.assign({}, base, { me: { X: 83000, Y: 148000, Z: -3400 } }));
    W.town = 'Giran';
    W.api.NAVATLAS.cache['t\\raid_999.json'] = { v: R, at: W.t };
    const RN = JSON.parse(JSON.stringify(R)); RN.steps = RN.steps.slice(0, 3).concat([{ do: 'arrive', x: 3000, y: 0, z: 0 }]); RN.target = { x: 3000, y: 0, z: 0 };
    W.ctx.navAtlasRoute = undefined;
    const q = await run((async () => { const usable = W.api.navAtlasUsable(RN); if (!usable.ok) return { ok: false }; return W.api.navAtlasRun(RN, { upTo: 1 }); })());
    ok(q.ok && Math.hypot(W.me.X - 1000, W.me.Y) < 10 && !W.calls.includes('walk'), 'teleportNear: town + gatekeeper only, the caller walks');
  }
  // ---- real data
  {
    const W = world(Object.assign({}, base, { me: { X: 83000, Y: 148000, Z: -3400 } }));
    const r1 = W.api.navAtlasRoute('raid:25146');
    ok(r1 && r1.name && Array.isArray(r1.steps), `real lookup by key: raid:25146 = ${r1 && r1.name} (${r1 && r1.status}, ${r1 && r1.steps.length} steps)`);
    const r2 = W.api.navAtlasRoute({ type: 'raid', id: 25146 });
    ok(r2 && r2.key === 'raid:25146', 'real lookup by raid id');
    const any = ix.targets.find(t => t[1] === 'npc' && t[6] === 'ok');
    const r3 = W.api.navAtlasRoute({ type: 'npc', id: any[10], x: any[3], y: any[4] });
    ok(r3 && r3.key === any[0], `real lookup by npc id + position: ${any[2]}`);
    const r4 = W.api.navAtlasRoute({ x: any[3] + 300, y: any[4] - 200, z: any[5] });
    ok(r4 && Math.hypot(r4.target.x - any[3], r4.target.y - any[4]) < 1500, 'real lookup by position (grid shard)');
    ok(Object.keys(W.api.NAVATLAS.cache).length <= 24, `engine cache stays small (${Object.keys(W.api.NAVATLAS.cache).length} files)`);
    // a real Pagan Temple room route through the executor (every step shape the planner writes)
    const pg = W.api.navAtlasRoute('room:pagan-1-straight-q');
    if (pg) {
      const npcs = []; const doorsW = {};
      pg.steps.forEach(s => { if (s.do === 'door') { doorsW[s.doorId] = { open: false, unlockable: true }; (s.need.npc || []).forEach(n => npcs.push({ id: n.id, name: n.name, x: n.x, y: n.y, opensDoor: s.doorId })); } if (s.do === 'floor' || s.do === 'enter') npcs.push({ id: s.npc.id, name: s.npc.name, x: s.npc.x, y: s.npc.y, html: `<a action="bypass go1">${s.link || 'Teleport'}</a>`, cmd: 'go1', to: s.landing || [s.npc.x + 3000, s.npc.y, s.npc.z] }); });
      const towns = {}; pg.steps.filter(s => s.do === 'town').forEach(s => { towns[s.town] = s.at || [0, 0, 0]; });
      const W3 = world({ towns, land: {}, me: { X: 0, Y: 0, Z: 0 }, skills: { 27: {} }, npcs, doors: doorsW, dungeons: [] });
      const r = await run(W3.api.navAtlasRun(pg, { why: 'pagan sim' }));
      ok(!W3.calls.some(c => /^ERROR/.test(c)) && r.why.indexOf('THROW') < 0, `real Pagan Temple route runs through the executor without errors (${r.ok ? 'arrived' : r.why})`);
      ok(W3.calls.filter(c => /^talk Temple Gatekeeper/.test(c)).length >= 1, 'the Pagan Temple gatekeeper door was handled by talking to him');
    } else ok(false, 'room:pagan-1-straight-q route file');
  }
  // ---- 4) NAVATLAS2 (2026-10-12 unreachable research): dialog chains, height-aware arrival, vehicles, walk-in zones, manual steps, the hubs
  console.log('4) NAVATLAS2 step kinds + researched routes');
  if (!BLOCK.includes('NAVATLAS2')) console.log('  (skipped: ' + path.basename(SW) + ' has no NAVATLAS2 patch — run with --swarm <copy patched by patch_navatlas2.js>)');
  else {
    // a world where a bypass can open the next dialog page (waitNpcHtml) or teleport
    const world2 = (opts) => {
      const W = world(opts); W.pages = opts.pages || {}; W.next = null;
      W.ctx.waitNpcHtml = () => new Promise(res => { W.next = res; });
      const old = W.ctx.Send.ReqBypassToServer;
      W.ctx.Send.ReqBypassToServer = (c) => { const r = W.next; W.next = null; if (W.pages[c]) { W.calls.push('bypass ' + c); if (r) r(W.pages[c]); return; } if (!(opts.onBypass && opts.onBypass(c, W))) old(c); if (r) r(null); };   // no page: waitNpcHtml gives null
      return W;
    };
    {
      // Ivory Tower: Verona "Go to another floor." -> page 2 "Underground Shopping Area" -> the basement 630 lower, only ~480 away on x/y
      const V = { id: 30727, name: 'Verona', x: 85336, y: 16194, z: -3664 };
      const R2 = { key: 'npc:t1', name: 'Karin', status: 'ok', target: { x: 84814, y: 15886, z: -4291 }, needs: {}, steps: [
        { do: 'enter', how: 'npc-teleport', npc: V, link: 'Underground Shopping Area', links: ['Go to another floor.', 'Underground Shopping Area'], landing: [84915, 15969, -4294] },
        { do: 'walk', points: [84915, 15969, -4294, 84814, 15886, -4291], len: 130, how: 'geodata' }, { do: 'arrive', x: 84814, y: 15886, z: -4291 }] };
      const W = world2({ me: { X: 85330, Y: 16190, Z: -3664 }, npcs: [Object.assign({}, V, { html: '<a action="bypass chat2">Go to another floor.</a><a action="bypass q">Quest.</a>', cmd: 'goto31', to: [84915, 15969, -4294] })],
        pages: { chat2: '<a action="bypass goto31">Underground Shopping Area</a><a action="bypass goto33">2nd Floor Human Wizard Guild</a>' } });
      const r = await run(W.api.navAtlasRun(R2, { why: 'chain' }));
      ok(r.ok && W.calls.indexOf('bypass chat2') >= 0 && W.calls.indexOf('bypass goto31') > W.calls.indexOf('bypass chat2'), `dialog chain: page link then the floor link, arrived on the floor 630 lower (${r.why || 'ok'})`);
    }
    {
      // a first-page link that teleports at once although a 2nd page was expected (live "Gludio Airship Field." vs the datapack's 2 pages)
      const BE = { id: 30256, name: 'Bella', x: -12736, y: 122816, z: -3114 };
      const R7 = { key: 'npc:t6', name: 'wharf', status: 'ok', target: { x: -149406, y: 255247, z: -80 }, needs: {}, steps: [
        { do: 'enter', how: 'npc-teleport', npc: BE, link: 'Teleport to Gludio Airship Field.', links: ['Gludio Airship Field.', 'Teleport to Gludio Airship Field.'], landing: [-149406, 255247, -80], landingR: 1500 }, { do: 'arrive', x: -149406, y: 255247, z: -80 }] };
      const W7 = world2({ me: { X: -12730, Y: 122820, Z: -3114 }, npcs: [Object.assign({}, BE, { html: '<a action="bypass gaf">Gludio Airship Field.</a>', cmd: 'gaf', to: [-149406, 255247, -80] })] });
      const r7 = await run(W7.api.navAtlasRun(R7, { why: 'early teleport' }));
      ok(r7.ok, `dialog chain: a page link that teleports at once counts as arrived (${r7.why || 'ok'})`);
    }
    {
      // the airship: not docked at the first click, boards on a retry, ousted at the Keucereus base minutes later
      const FC = { id: 32609, name: 'Flight Control', x: -149360, y: 252936, z: -136 };
      const R3 = { key: 'npc:t2', name: 'Lionel', status: 'conditional', target: { x: -183980, y: 242722, z: 1576 }, needs: {}, steps: [
        { do: 'enter', how: 'vehicle', npc: FC, link: 'Board the Airship.', landing: [-186563, 243590, 2608], wait: { sec: 900, retrySec: 20 } }, { do: 'arrive', x: -186563, y: 243590, z: 2608 }] };
      let clicks = 0, boardedAt = 0;
      const W = world2({ me: { X: -149340, Y: 252950, Z: -136 }, npcs: [Object.assign({}, FC, { html: '<a action="bypass board">Board the Airship.</a>' })],
        onBypass: (c, W0) => { if (c !== 'board') return false; clicks++; W0.calls.push('bypass board'); if (clicks >= 2 && !boardedAt) boardedAt = W0.t; return true; } });
      const sl = W.ctx.sleep; W.ctx.sleep = async (ms) => { await sl(ms); if (boardedAt && W.t - boardedAt > 240000) Object.assign(W.me, { X: -186563, Y: 243590, Z: 2608 }); };
      const r = await run(W.api.navAtlasRun(R3, { why: 'airship' }));
      ok(r.ok && clicks >= 2 && W.t - 1e9 > 240000, `vehicle: boarded on a retry (${clicks} clicks), rode ${Math.round((W.t - 1e9) / 1000)} s virtual, ousted at the base (${r.why || 'ok'})`);
    }
    {
      // a walk-in portal (Seed of Annihilation 60004) and a manual step
      const R4 = { key: 'raid:t3', name: 'Torumba', status: 'ok', target: { x: -174800, y: 186738, z: -15100 }, needs: {}, steps: [
        { do: 'walk', points: [-180218, 185923, -10576, -178458, 188167, -10750], len: 3000, how: 'geodata' },
        { do: 'enter', how: 'zone', at: [-178458, 188167, -10750], landing: [-180211, 182984, -15152] },
        { do: 'walk', points: [-180211, 182984, -15152, -174800, 186738, -15100], len: 7000, how: 'geodata' }, { do: 'arrive', x: -174800, y: 186738, z: -15100 }] };
      const W = world2({ me: { X: -180218, Y: 185923, Z: -10576 } });
      const wt = W.ctx.walkTo; W.ctx.walkTo = async (x, y, z, ...a) => { const r0 = await wt(x, y, z, ...a); if (Math.hypot(x + 178458, y - 188167) < 50) Object.assign(W.me, { X: -180211, Y: 182984, Z: -15152 }); return r0; };
      const r = await run(W.api.navAtlasRun(R4, { why: 'portal' }));
      ok(r.ok && Math.hypot(W.me.X + 174800, W.me.Y - 186738) < 10, `walk-in zone: through the portal to the lower level (${r.why || 'ok'})`);
      const R5 = { key: 'epic:t4', name: 'Beleth', status: 'conditional', target: { x: 0, y: 0, z: 0 }, needs: {}, steps: [
        { do: 'walk', points: [0, 0, 0, 500, 0, 0], len: 500, how: 'geodata' }, { do: 'need', manual: true, text: 'kill Darion on the roof' }, { do: 'arrive', x: 0, y: 0, z: 0 }] };
      const W5 = world2({ me: { X: 0, Y: 0, Z: 0 } });
      const r5 = await run(W5.api.navAtlasRun(R5, { why: 'manual' }));
      ok(!r5.ok && /manual step/.test(r5.why) && /Darion/.test(r5.why), `a manual step stops the route with its text: ${r5.why}`);
    }
    {
      // a door machine (Tully's Gatekeeper): the link opens the door, no teleport wait
      const R6 = { key: 'raid:t5', name: 'Tully', status: 'ok', target: { x: 3000, y: 0, z: -9000 }, needs: {}, steps: [
        { do: 'walk', points: [0, 0, -9000, 1000, 0, -9000], len: 1000, how: 'geodata' },
        { do: 'door', doorId: 19260019, name: 'tolles_door_19', kind: 'npc', at: [1000, 0, -9000], need: { npc: [{ id: 18455, name: "Tully's Gatekeeper", x: 900, y: 80, z: -9000 }], link: 'Attempt to operate the machine.', closesAfterSec: 120 } },
        { do: 'walk', points: [1000, 0, -9000, 3000, 0, -9000], len: 2000, how: 'geodata' }, { do: 'arrive', x: 3000, y: 0, z: -9000 }] };
      const W6 = world2({ me: { X: 0, Y: 0, Z: -9000 }, doors: { 19260019: { open: false } }, npcs: [{ id: 18455, name: "Tully's Gatekeeper", x: 900, y: 80, html: '<a action="bypass openit">Attempt to operate the machine.</a>' }],
        onBypass: (c, W0) => { if (c !== 'openit') return false; W0.calls.push('bypass openit'); W0.doors[19260019].open = true; return true; } });
      const r6 = await run(W6.api.navAtlasRun(R6, { why: 'door machine' }));
      ok(r6.ok && W6.calls.includes('bypass openit'), `door machine: clicked "Attempt to operate the machine." and walked through (${r6.why || 'ok'})`);
    }
    // the researched targets (docs/plan/unreachable_research.md) now have routes; the two left are documented
    const st = (k) => (ix.targets.find(t => t[0] === k) || [])[6];
    const keys = { 'raid:25544': 'Tully', 'raid:29054': 'Benom', 'raid:25698': 'Dopagen', 'raid:25696': 'Taklacan', 'raid:25697': 'Torumba', 'raid:29118': 'Beleth', 'raid:29163': 'Tiat', 'raid:29150': 'Ekimus',
      'npc:30162@84814,15886': 'Karin (Ivory basement)', 'npc:30171@85332,16592': 'Gaius (Ivory 2F)', 'npc:32782@-183980,242722': 'Lionel (Keucereus)', 'npc:32534@-212831,209536': 'Jaedin', 'npc:32734@-178467,153371': 'Klemis',
      'npc:30995@12962,181603': 'Race Manager', 'npc:32491@-82168,-49167': 'Underground Coliseum Helper', 'npc:4318@-58015,-53375': 'Photo Snow', 'npc:31114@42608,143952': 'Gatekeeper Ziggurat (Heretic)', 'npc:31454@169589,-91293': 'Ghost of Wigoth', 'npc:32039@34842,-49756': "Triol's Mirror" };
    const bad = Object.entries(keys).filter(([k]) => !st(k) || st(k) === 'unreachable');
    ok(!bad.length, `researched targets have a route (${Object.keys(keys).length}): ${bad.map(([k, n]) => n + '=' + st(k)).join(', ') || 'all routable'}`);
    const rT = W0route('raid:25544');
    ok(rT && rT.steps.some(s => s.npc && s.npc.id === 32313) && rT.steps.some(s => s.npc && s.npc.id === 32373) && rT.steps.filter(s => s.do === 'enter' && /Go upstairs/.test(s.link || '')).length === 4, 'Tully: Warpgate -> Deltuva -> Dorian -> 4 floor devices');
    const rB = W0route('raid:29118');
    ok(rB && rB.steps.some(s => s.do === 'need' && s.manual) && rB.steps.some(s => s.do === 'enter' && s.link === 'Meet Beleth.'), 'Beleth: the chain ends at the Naia Cube "Meet Beleth." with the manual fight steps marked');
    function W0route(k) { try { return world(base).api.navAtlasRoute(k); } catch (e) { return null; } }
  }
  console.log(`\nnav atlas tests: ${pass} ok, ${fail} failed`);
  if (path.basename(SW).startsWith('swarm_navatlas_test_')) try { fs.unlinkSync(SW); } catch (e) { }   // only our temp copy (an install under %TEMP% must keep its Scripts_dev/swarm.js)
  process.exit(fail ? 1 : 0);
})();
