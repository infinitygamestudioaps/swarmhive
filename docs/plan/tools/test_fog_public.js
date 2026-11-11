// OFFLINE TEST of FOGPUBLIC-2026-11-10 (public testers, Discord #swarmhive after v1.14.1: Forge of the Gods rooms "Not reachable now -> auto").
// Two causes on a tester install:
//   a) pickRoom's roomTripWhy said "walk-in" for the FoG Lower level (enter.how = walk) although its walk-in link from outside is switched off
//      (verified:false since FOG2WALK = reached via Chandra / the lava stairs) -> its stale atlas route ("walk not on the geodata") refused all
//      12 Lower-level rooms. Fix: roomFloorWalkIn(d, fi).
//   b) the package shipped the owner's geo_blocked.json as a normal file (every update overwrote the tester's own) with old learned points that
//      were counted as "2 episodes" before GEOEPISODE (FoG Top level 179272,-116968: two hits 67 ms apart = an active wall on the first room).
//      Fix: geoBlockActive needs 2 REAL episodes (> GEOLEARN.episodeMs apart), geopath.js the same, release_build ships geo_blocked.json as an
//      example (seed) with only really active points.
//   node docs/plan/tools/test_fog_public.js        (exit code 1 when a check fails)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < i) throw new Error('block not found: ' + a); return src.slice(i, j); };
const num = (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0);
const DATA = path.join(ROOT, 'Scripts', 'data');

// ---- a) roomFloorWalkIn on the real FoG data ---------------------------------------------------------------------------------------------
console.log('-- a) Lower level rooms are not refused as a walk-in');
const RFW = cut('function roomFloorWalkIn(d, fi) {', '// FOG2WALK-PURE-END');
const W = new Function(RFW + '\nreturn { roomFloorWalkIn };')();
const FRP = cut('// FOGREACH-PURE-BEGIN', '// FOGREACH-PURE-END');
const RGP = cut('// ROOMGRAPH-PURE-BEGIN', '// ROOMGRAPH-PURE-END');
const M = new Function('num', RGP + '\n' + FRP + '\nreturn { roomTripWhy, FOGREACH };')(num);
const fog = rd(path.join(DATA, 'dungeon_rooms.json')).find(d => d.key === 'forge');
check(!!fog && fog.floors.length >= 3, 'FoG in dungeon_rooms.json with 3 floors');
check(W.roomFloorWalkIn(fog, 0) === true, 'Top level: entered on foot from the landing (walk-in)');
check(W.roomFloorWalkIn(fog, 1) === false, 'Lower level: its walk-in link is verified:false -> NOT a walk-in (Chandra / lava stairs)');
check(W.roomFloorWalkIn(fog, 2) === false, 'Hall of Flames: teleporter, not a walk-in');
check(W.roomFloorWalkIn({ floors: [{ enter: { how: 'walk' } }, { enter: { how: 'walk' } }], entryLinks: [] }, 1) === true, 'a walk floor without entry links stays a walk-in (old behaviour)');
check(W.roomFloorWalkIn({ floors: [{}, { enter: { how: 'walk' } }], entryLinks: [{ from: -1, to: 1, kind: 'walk', verified: false }, { from: -1, to: 1, kind: 'walk', verified: true }] }, 1) === true, 'one verified walk-in link is enough');
check(W.roomFloorWalkIn(null, 0) === false && W.roomFloorWalkIn({ floors: [] }, 3) === false, 'no dungeon / no floor: false');
{ const atlas = (id) => { try { return rd(path.join(DATA, 'nav_atlas', 't', `room_${id}.json`)); } catch (e) { return null; } };
  const lim = M.FOGREACH.maxRoomWalk, LOW = fog.floors[1].rooms;
  let oldRefused = 0, newRefused = [];
  LOW.forEach(r => { const at = atlas(r.id); if (!at) return;
    if (M.roomTripWhy(at, { maxRoomWalk: lim, walkIn: true, deep: true })) oldRefused++;
    const w = M.roomTripWhy(at, { maxRoomWalk: lim, walkIn: W.roomFloorWalkIn(fog, 1), deep: true }); if (w) newRefused.push(r.id + ': ' + w); });
  console.log(`     (atlas files for ${LOW.filter(r => atlas(r.id)).length} of ${LOW.length} Lower-level rooms; refused before the fix: ${oldRefused})`);
  check(newRefused.length === 0, `no Lower-level room refused as "no verified walk" / too long walk-in (${newRefused.slice(0, 3).join(' | ') || 'none'})`); }
check(/roomTripWhyHost\(r, f, fi, d\)/.test(src) && /walkIn: d \? roomFloorWalkIn\(d, fi\)/.test(src), 'wiring: pickRoom passes the dungeon, roomTripWhyHost uses roomFloorWalkIn');

// ---- b) learned walls: 2 REAL episodes -----------------------------------------------------------------------------------------------------
console.log('-- b) learned wall points');
const GL = cut('// GEOLEARN-PURE-BEGIN', '// GEOLEARN-PURE-END');
const G = new Function('num', GL + '\nreturn { GEOLEARN, geoRealEpisodes, geoBlockActive };')(num);
const t0 = Date.parse('2026-11-04T17:01:14.515Z');
const hit = (ms) => ({ by: 'X', at: new Date(t0 + ms).toISOString() });
const fogPt = { x: 179272, y: -116968, z: -5800, episodes: 2, active: true, hits: [hit(0), hit(67)] };
check(G.geoRealEpisodes(fogPt) === 1 && G.geoBlockActive(fogPt) === false, 'FoG Top level 179272,-116968 (2 hits 67 ms apart, stored "2 episodes", active): 1 real episode -> NOT a wall');
check(G.geoBlockActive({ episodes: 2, active: true, hits: [hit(0), hit(G.GEOLEARN.episodeMs + 1000)] }) === true, 'two hits > episodeMs apart: an active wall');
check(G.geoBlockActive({ manual: true, episodes: 0, hits: [] }) === true, 'a manual point stays a wall');
check(G.geoBlockActive({ manual: true, disabled: true }) === false && G.geoBlockActive({ episodes: 5, active: true, disabled: true, hits: [hit(0), hit(9e6)] }) === false, 'a disabled point is never a wall');
check(G.geoBlockActive({ episodes: 2, active: true }) === true, 'no hit list: the stored count decides (old files)');
check(G.geoBlockActive({ episodes: 3, active: true, hits: Array.from({ length: 20 }, (_, i) => hit(i)) }) === true, 'a hit list cut at maxHits: the stored count decides');
check(G.geoBlockActive({ episodes: 1, hits: [hit(0)] }) === false, 'one episode: not a wall');
const geo = require('./geopath');
const real = rd(path.join(DATA, 'geo_blocked.json')).points || [];
{ let diff = 0; real.forEach(p => { if (geo.realEpisodes(p) !== G.geoRealEpisodes(p)) diff++; });
  check(typeof geo.realEpisodes === 'function' && diff === 0, `geopath.js realEpisodes = swarm.js geoRealEpisodes on all ${real.length} real points (${diff} differ)`); }

// ---- c) the package ships geo_blocked.json as an example --------------------------------------------------------------------------------
console.log('-- c) release: geo_blocked.json is a seed');
const rb = fs.readFileSync(path.join(__dirname, 'release_build.js'), 'utf8');
check(/DATA_SEEDS\.push\('geo_blocked\.json'\)/.test(rb), 'release_build.js: geo_blocked.json in DATA_SEEDS (shipped as geo_blocked.example.json, never over the tester\'s file)');
const RBF = (() => { const a = rb.indexOf('function geoRealEpisodes(p) {'), s = rb.indexOf('const geoShipPoint = ', a), b = rb.indexOf('\n', s); return rb.slice(a, b); })();
const R = new Function(RBF + '\nreturn { geoShipPoint };')();
{ let diff = 0, kept = 0; real.forEach(p => { const k = R.geoShipPoint(p); if (k) kept++; if (k !== G.geoBlockActive(p)) diff++; });
  check(diff === 0, `release_build geoShipPoint = swarm.js geoBlockActive on all ${real.length} points (ships ${kept}; ${diff} differ)`);
  const fp = real.find(p => Math.abs(p.x - 179272) < 50 && Math.abs(p.y + 116968) < 50);
  check(!fp || R.geoShipPoint(fp) === false, 'the false FoG point is not shipped'); }
check(/case 'geo_blocked\.json':/.test(rb) && /hit names removed/.test(rb), 'seedTransform: geo_blocked.json filtered (character names out of the hits)');
{ const up = fs.readFileSync(path.join(ROOT, 'release', 'package', 'update.ps1'), 'utf8');
  check(/\.example\.json/.test(up) && /created .* from the example/.test(up), 'update.ps1 creates a missing data file from its example and keeps the tester\'s own file'); }

console.log(`\n${n - fails}/${n} checks OK`);
process.exit(fails ? 1 : 0);
