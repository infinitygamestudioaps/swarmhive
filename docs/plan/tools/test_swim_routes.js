// TEST: SWIMMING ROUTES (2026-10-13, user: "Tillion is reached through the Pirate Tunnel and WATER where the character swims").
// Offline, read-only (geodata + data files; never the game, never MCP). Proves:
//  1) the water zones (Scripts/data/water_zones.json from the L2J datapack water.xml) load and answer the server's zone check;
//  2) the swim model: open sea = swim slot, a floor under another floor (the Pirate Tunnel below the sea floor) = NOT swum (walked);
//  3) Tillion (raid 25484): the land-only finder has no way (why it was "unreachable"); with swimming both finders (geopath.js for the
//     bots, geopath_fast.js for the atlas) find the route from the REAL landing (Giran -> Devil Isle, teleports_h5.json); every leg passes
//     the server move check (legOk: wall check on land, water check + <= 700 for a swim), the swim passes the Light Bringer spawns the
//     user saw in the water, and it ends on Tillion's beach;
//  4) the saved computed route routes/raid/25484.json (unlocked) and the atlas entry t/raid_25484.json (after the rebuild) carry it;
//  5) Plains of Lizardmen area 33 stays unreachable: no water zone, and the cells that can walk INTO the pit are a closed set (pocketIn);
//  6) a dry route is unchanged by the swim rules; 7) swarm.js (Scripts_dev): navAtlasPts marks swim points, swimPlan + the #297 guard exist.
// Use: node docs/plan/tools/test_swim_routes.js            (about 30-60 s: geodata searches)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };
const WATER = require('./water_zones'), geo = require('./geopath'), fast = require('./geopath_fast');

// ---- 1. water zones
const Z = WATER.load();
ok(Z.length >= 400, `water zones loaded (${Z.length})`);
ok(!!WATER.zoneAt(44120, 217928, -3819), 'the sea south of Devil\'s Isle at -3819 is inside a water zone (21_24_water1)');
ok(!WATER.zoneAt(43160, 220463, -3680), 'Tillion himself (z -3680) stands above the water: dry');
ok(WATER.zonesAt(96088, 85688).length === 0, 'Plains of Lizardmen area 33 has no water zone');

// ---- 2. swim model
const SW = WATER.swimGraph(fast.internals.SWACC), I = fast.internals;
const cellOf = (x, y) => [I.toGeoX(x), I.toGeoY(y)];
{ const [gx, gy] = cellOf(44120, 217928), s = SW.info(gx, gy); ok(!!s && s.some(o => o.open && o.z <= -3779 && o.z >= -4779), 'open sea cell = a swim slot whose swim height lies inside the zone'); }
{ const s = WATER.cellWater(44120, 217928, [-3900, -4576]);       // a floor under another floor below the surface (a tunnel / cave under the sea floor)
  ok(!!s && s.length === 1 && s[0].h === -3900 && s[0].open, 'a floor under another floor below the surface is walked (geodata rules), only the open one is swum'); }
{ const s = WATER.cellWater(44120, 217928, [-3500, -4000]);       // a rock / jetty top 279 above the surface over open water: the water below is swum
  ok(!!s && s.length === 1 && s[0].h === -4000, 'water under a floor high above the surface is still open water'); }
{ const [gx, gy] = cellOf(42232, 192312);
  ok(!!SW.info(gx, gy), 'the sea channel west of Giran Harbor (sea floor -4576, nothing above it in the geodata) is open water'); }

// ---- 3. Tillion
const TP = J(path.join(DATA, 'teleports_h5.json')).find(e => e.desc === 'Giran -> Devil Isle');
ok(!!TP && TP.x === 43408 && TP.y === 206881, 'start = the real landing Giran -> Devil Isle (teleports_h5.json)');
const RB = J(path.join(DATA, 'raidbosses_h5.json')).bosses.find(b => b.id === 25484);
const L = { x: TP.x, y: TP.y, z: TP.z }, T = { x: RB.x, y: RB.y, z: RB.z };
const dry = fast.findPath(L, T, { swim: false, maxNodes: 6e6, maxMs: 120000, pad: 6000 });
ok(!dry.ok, `land-only: no way to Tillion (${dry.reason || ''}) — why the atlas said "closed pocket"`);
ok(fast.pocket(T.x, T.y, T.z, 60000, { swim: false }) < 60000 && fast.pocket(T.x, T.y, T.z, 60000) >= 60000, 'Tillion\'s beach: a closed pocket on land, open with swimming');
const rs = geo.findPath(L, T, { maxNodes: 1.5e7, maxMs: 300000, pad: 6000 }), rf = fast.findPath(L, T, { maxNodes: 1.5e7, maxMs: 300000, pad: 6000 });
ok(rs.ok && rf.ok, 'with swimming: geopath.js AND geopath_fast.js find the route');
ok(rs.ok && rf.ok && Math.abs(rs.lengthUnits - rf.lengthUnits) / rs.lengthUnits < 0.05, `both finders agree (${rs.lengthUnits} / ${rf.lengthUnits})`);
ok(rs.ok && rs.swimUnits > 2000 && rs.swimUnits < 8000, `the route swims ${rs.swimUnits} units (longest unbroken ${rs.maxSwimRun})`);
if (rs.ok) {
  let p = L, bad = [], longSwim = 0, swimPts = 0;
  rs.points.forEach((q, i) => {
    if (!geo.legOk(p, q)) bad.push(i);
    if (geo.legOk(p, q) && WATER.zoneAt(p.x, p.y, p.z) && Math.hypot(q.x - p.x, q.y - p.y) > 700) longSwim++;
    if (q.swim) { swimPts++; if (!WATER.zoneAt(q.x, q.y, q.z)) bad.push('zone' + i); }
    p = q;
  });
  ok(bad.length === 0, `every leg passes the server move check (legOk) and every swim point lies in a water zone${bad.length ? ' — bad: ' + bad.join(',') : ''}`);
  ok(longSwim === 0, 'no swim leg longer than 700 (the server cuts water moves there)');
  ok(swimPts >= 5, `${swimPts} waypoints are marked swim`);
  const last = rs.points[rs.points.length - 1];
  ok(Math.hypot(last.x - T.x, last.y - T.y) < 100 && !last.swim, 'the route ends dry on Tillion\'s beach');
  const LB = J(path.join(DATA, 'spawns_h5.json')).filter(s => s.name === 'Light Bringer');
  ok(LB.length > 0 && rs.points.some(q => q.swim && LB.some(s => Math.hypot(s.x - q.x, s.y - q.y) < 1000)), 'the swim passes the Light Bringer spawns the user met in the water (screenshot 13:44)');
}

// ---- 4. saved computed route + atlas entry
const rf25484 = path.join(DATA, 'routes', 'raid', '25484.json');
if (fs.existsSync(rf25484)) {
  const r = J(rf25484);
  ok(r.manual !== true && r.computed, 'routes/raid/25484.json is a computed, UNLOCKED route');
  ok(r.start && r.start.kind === 'gk' && r.start.desc === 'Giran -> Devil Isle' && r.points[0].x === TP.x && r.points[0].y === TP.y, 'saved route starts at the Devil Isle landing');
  let p = r.points[0], bad = 0; r.points.slice(1).forEach(q => { if (!geo.legOk(p, q)) bad++; p = q; });
  ok(bad === 0, `saved route: every leg passes legOk (${r.points.length} points, ${r.points.filter(q => q.swim).length} swim)`);
} else ok(false, 'routes/raid/25484.json exists');
const at = path.join(DATA, 'nav_atlas', 't', 'raid_25484.json');
if (fs.existsSync(at)) {
  const a = J(at), walks = (a.steps || []).filter(s => s.do === 'walk');
  ok(a.status !== 'unreachable', `atlas raid:25484 status ${a.status} (was unreachable)`);
  ok(walks.some(s => Array.isArray(s.swim) && s.swim.length > 0) && (a.flags || []).includes('swim'), 'atlas walk step carries swim point indices + flag swim');
  ok((a.steps || []).some(s => s.do === 'gk' && /devil isle/i.test(s.desc || s.link || '')), 'atlas route uses the Devil Isle gatekeeper link');
  const lw = walks[walks.length - 1], n = lw ? lw.points.length : 0;
  ok(lw && Math.hypot(lw.points[n - 3] - T.x, lw.points[n - 2] - T.y) < 300, 'atlas walk ends at Tillion');
} else ok(false, 'atlas t/raid_25484.json exists');

// ---- 5. Plains of Lizardmen area 33
const A33 = { x: 96088, y: 85688, z: -3728 };
ok(fast.pocketIn(A33.x, A33.y, A33.z, 60000) < 60000 && fast.pocketIn(A33.x, A33.y, A33.z, 60000, { swim: false }) < 60000, `area 33: only ${fast.pocketIn(A33.x, A33.y, A33.z, 60000)} cells can walk into the pit (closed set): unreachable`);

// ---- 6. a dry route is not changed by the swim rules (Gludin -> Abandoned Camp -> Greyclaw Kutus)
{ const a = { x: -49853, y: 147089, z: -2784 }, b = { x: -54416, y: 146480, z: -2887 };
  const w = geo.findPath(a, b, { maxLeg: 1000 }), d = geo.findPath(a, b, { maxLeg: 1000, swim: false });
  ok(w.ok && d.ok && w.lengthUnits === d.lengthUnits && !w.swimUnits && w.points.length === d.points.length, `dry route identical with and without swimming (${w.lengthUnits})`); }

// ---- 7. swarm.js (Scripts_dev): the walker side
{ const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
  const i = src.search(/function navAtlasPts\(flat, me, stop, swimIdx(, drops)?\) \{/), j = src.indexOf('\n}\n', i);   // RAID ROUTES 2026-10-13: + drops
  ok(i > 0, 'swarm.js navAtlasPts takes the swim indices');
  if (i > 0) {
    const ctx = {}; vm.createContext(ctx); vm.runInContext(src.slice(i, j + 2) + '\nthis.f = navAtlasPts;', ctx);
    const out = ctx.f([0, 0, 0, 500, 0, -3819, 1000, 0, -3819, 1500, 0, 0], { x: 0, y: 0, z: 0 }, null, [1, 2]);
    ok(out.length === 4 && !out[0].swim && out[1].swim && out[2].swim && !out[3].swim, 'navAtlasPts marks exactly the swim points');
  }
  ok(/function swimPlan\(ms\)/.test(src) && /const SWIM_SPEED = 50;/.test(src), 'swarm.js: swimPlan + SWIM_SPEED');
  ok(/now\(\) < \(state\.swimPlanUntil \|\| 0\)/.test(src), 'swarm.js: #297 drowning on a planned swim does not turn the walker back');
  ok(/p\.swim \? SWIM_SPEED : 110/.test(src), 'swarm.js: geoWalk gives swim legs the swim speed'); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
