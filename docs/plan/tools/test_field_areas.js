// OFFLINE TEST of the FIELD AREAS + several rooms / areas per choice (user 2026-10-08 22:45: "Just like you created zones you can select from
// dungeons, you should create the same for hunting zones outside ... select multiple areas to hunt in, and the bots will move between the areas
// or rooms whenever there are no more monsters"). Node only, nothing reaches the game:
//   node docs/plan/tools/test_field_areas.js [--quick]      (exit code 1 when a check fails; --quick skips re-building two regions)
// 1) the data (Scripts/data/field_areas.json): counts, named regions, polygons (corners, no self-intersection, centre inside), size, own
//    spawns inside >= 90 %, overlap, zones map, entries; "never across a cliff": for sampled areas every own spawn inside the polygon is reached
//    from the area centre on foot WITHOUT leaving the polygon (geodata flood fill, 16-unit cells, walls / height steps).
// 2) the tool on real regions (bee-hive, orc-barracks): the areas are built again and match the file.
// 3) MULTISPOT-PURE of Scripts_dev/swarm.js: multiSel (old single roomId = one-room selection), multiPick, multiDecide (empty 35 s -> next,
//    not before, fighting, occupied / claimed -> skip, every one empty -> stay where the most respawns come, rotate vs nearest), faAutoPick on
//    the real data (level fit, danger, lead mode = gatekeeper landings only, blocked areas).
// 4) a simulated leader rotating through 3 areas (virtual clock: kills, respawns, an area taken by another party).
// 5) the REAL host functions of Scripts_dev/swarm.js (pickSpot, zoneSpot, zoneAreaSpot, multiSpotFor, multiTargets, spotBlock, areaTaken,
//    claimOverlaps ...) in a node sandbox with mocks + the live custom_zones / field_areas / dungeon_rooms / hunting_spots data.
// 6) source checks of the call sites.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const quick = process.argv.includes('--quick');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };

const F = readJson(path.join(DATA, 'field_areas.json'));
const RP = require('./room_polys'), geo = require('./geopath');
const segX = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
const selfX = (P) => { const n2 = P.length; for (let i = 0; i < n2; i++) for (let j = i + 2; j < n2; j++) { if (i === 0 && j === n2 - 1) continue; if (segX(P[i], P[(i + 1) % n2], P[j], P[(j + 1) % n2])) return true; } return false; };
const distSeg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
const distPoly = (x, y, P) => RP.inPoly(x, y, P) ? 0 : Math.min(...P.map((p, i) => distSeg(x, y, p, P[(i + 1) % P.length])));
const allAreas = F.regions.flatMap(R => R.areas.map(a => Object.assign({ R }, a)));

// ---- 1) data -------------------------------------------------------------------------------------------------------------------
{
  check(F.regions.length >= 80, `regions: ${F.regions.length} (>= 80)`);
  check(allAreas.length >= 600, `areas: ${allAreas.length} (>= 600)`);
  const want = ['Abandoned Camp', 'Windy Hill', 'Fields of Massacre', 'Forest of Mirrors', 'Sel Mahum Training Grounds', 'Ruins of Agony', 'Plains of Dion', 'Pavel Ruins', 'Wall of Argos', 'Den of Evil'];
  want.forEach(w => check(F.regions.some(R => R.name.startsWith(w) && R.areas.length >= 2), `region "${w}" with >= 2 areas (${(F.regions.filter(R => R.name.startsWith(w)).map(R => R.areas.length)).join('/') || 'missing'})`));
  const bad = { corners: [], selfX: [], centre: [], size: [], own: [], overlap: [], foreign: [], ids: [] };
  const ids = new Set();
  allAreas.forEach(a => {
    if (ids.has(a.id)) bad.ids.push(a.id); ids.add(a.id);
    if (!(a.poly.length >= 3 && a.poly.length <= 40)) bad.corners.push(a.id);
    if (selfX(a.poly)) bad.selfX.push(a.id);
    if (distPoly(a.center[0], a.center[1], a.poly) > 150) bad.centre.push(a.id);
    if (!(a.area >= 0.25e6 && a.area <= 80e6)) bad.size.push(`${a.id} ${(a.area / 1e6).toFixed(2)}`);
    if (a.polyInfo.ownNear < 90) bad.own.push(`${a.id} ${a.polyInfo.ownNear}%`);
    if (a.polyInfo.overlap > 10) bad.overlap.push(`${a.id} ${a.polyInfo.overlap}%`);
    if (a.polyInfo.foreign > Math.max(2, a.spawnCount * 0.1)) bad.foreign.push(`${a.id} ${a.polyInfo.foreign}`);
  });
  check(!bad.ids.length, `area ids unique (${bad.ids.slice(0, 3).join(', ')})`);
  check(bad.corners.length <= allAreas.length * 0.01 && allAreas.every(a => a.poly.length >= 3 && a.poly.length <= 80), `polygons have 3..40 corners (${allAreas.length - bad.corners.length}/${allAreas.length}; never > 80)`);
  check(!bad.selfX.length, `no polygon crosses itself (${bad.selfX.slice(0, 5).join(', ')})`);
  check(bad.centre.length <= allAreas.length * 0.01, `area centre inside its polygon (+150): ${allAreas.length - bad.centre.length}/${allAreas.length} (${bad.centre.slice(0, 5).join(', ')})`);
  check(bad.size.length <= allAreas.length * 0.02, `sane size 0.25-80 km² (units/1e6): ${allAreas.length - bad.size.length}/${allAreas.length} (${bad.size.slice(0, 5).join(', ')})`);
  check(bad.own.length <= allAreas.length * 0.05, `own spawns inside / within 150 >= 90 %: ${allAreas.length - bad.own.length}/${allAreas.length} (${bad.own.slice(0, 5).join(', ')})`);
  check(bad.overlap.length <= allAreas.length * 0.05, `overlap with other areas <= 10 %: ${allAreas.length - bad.overlap.length}/${allAreas.length} (${bad.overlap.slice(0, 5).join(', ')})`);
  check(bad.foreign.length <= allAreas.length * 0.05, `foreign spawns inside <= 10 %: ${allAreas.length - bad.foreign.length}/${allAreas.length}`);
  const sizes = allAreas.map(a => Math.sqrt(a.area / Math.PI)).sort((x, y) => x - y);
  check(sizes[Math.floor(sizes.length / 2)] >= 1000 && sizes[Math.floor(sizes.length / 2)] <= 3500, `median equivalent radius ${Math.round(sizes[Math.floor(sizes.length / 2)])} (bigger than rooms: 1000-3500)`);
  const reach = allAreas.filter(a => a.reachable);
  check(reach.length >= allAreas.length * 0.7, `reachable from a gatekeeper landing on foot (<= 24.5k = travel.maxWalk - 500): ${reach.length}/${allAreas.length}`);
  // REACHABLE ENTRY (BUG 2026-10-09 16:11, Dagger1: Ivory Tower areas 6/5/4 were 27.5-29.5k walks from Sea of Spores and 'reachable')
  check(reach.every(a => a.entry && a.entry.route && a.entry.route.length >= 1 && a.entry.walk <= 24500), `every reachable area has an entry route and walk <= 24500 (${reach.filter(a => !(a.entry && a.entry.walk <= 24500)).slice(0, 4).map(a => a.id + ' ' + (a.entry && a.entry.walk)).join(', ')})`);
  check(reach.every(a => Math.hypot(a.center[0] - a.entry.landing[0], a.center[1] - a.entry.landing[1]) <= 24500), 'every reachable area: straight line landing -> centre <= 24500 (swarm.js walkTo refuses > 25000)');
  check(allAreas.filter(a => !a.reachable).every(a => typeof a.unreachable === 'string' && a.unreachable.length > 10), `every unreachable area says why (${allAreas.filter(a => !a.reachable && !a.unreachable).slice(0, 3).map(a => a.id).join(', ')})`);
  check(allAreas.filter(a => a.reachable && a.entry.kind === 'gk').every(a => a.entry.liveState !== undefined), 'entries carry the live state of their gatekeeper link');
  const ivo = F.regions.find(R => R.id === 'ivory-tower-area-far');
  check(ivo && !/[(]far[)]/.test(ivo.name) && ivo.areas.filter(a => a.reachable).every(a => a.entry.walk <= 24500) && ivo.areas.some(a => a.reachable && /Ivory Tower/.test(a.entry.desc)), `Ivory Tower region: renamed (${ivo && ivo.name}), reachable areas via a landing within 24.5k (${ivo ? ivo.areas.map(a => a.n + ':' + (a.reachable ? a.entry.desc.split('-> ')[1] + ' ' + a.entry.walk : 'NO')).join(', ') : '-'})`);
  check(!F.regions.some(R => /[(]far[)][ ]*$/.test(R.name) && R.areas.some(a => a.reachable)), `no region with reachable areas is still called "(far)" (${F.regions.filter(R => /(far)s*$/.test(R.name) && R.areas.some(a => a.reachable)).map(R => R.name).slice(0, 3).join(', ')})`);
  check(F.regions.every(R => R.areas.every(a => !a.manual || String(a.name || '').length)), 'manual (dashboard-edited) areas keep their names');
  check(allAreas.every(a => a.suitsPartyLevel && a.suitsPartyLevel[0] <= a.suitsPartyLevel[1] && a.levelRange[0] <= a.levelRange[1]), 'levels: levelRange + suitsPartyLevel sane');
  check(allAreas.filter(a => a.neighbours.length).length >= allAreas.length * 0.7, `areas with walking legs to neighbours: ${allAreas.filter(a => a.neighbours.length).length}/${allAreas.length}`);
  check(allAreas.every(a => a.neighbours.every(nb => ids.has(nb.id) && nb.walk > 0)), 'neighbour ids exist, walks > 0');
  check(allAreas.filter(a => a.safeSpot).length >= allAreas.length * 0.8, `areas with a safe spot: ${allAreas.filter(a => a.safeSpot).length}/${allAreas.length}`);
  check(F.regions.every(R => R.safeSpots.every(s => s.tier === 'safe' || s.tier === 'tight')), 'safe spot tiers');
  // zones map: the route zones of every party resolve to areas
  const ac = F.zones['-49448,146406'];
  check(ac && ac.areaIds.length >= 4 && ac.zones.some(z => /Abandoned Camp/.test(z)), `zone "Abandoned Camp (route 20-40)" -> ${ac ? ac.areaIds.length : 0} areas of ${ac ? ac.region : '?'}`);
  const fom = F.zones['183056,-14703'];
  check(fom && fom.areaIds.length >= 2, `zone "Fields of Massacre (route 52-61)" -> ${fom ? fom.areaIds.length : 0} areas`);
  // the Windy Hill cliff: the area east of the ridge has no walkable way from the landing within 30k
  const wh = F.regions.find(R => R.id === 'windy-hill');
  // (since the 2026-10-09 entries every landing within 25k counts: area 9 behind the ridge is entered from "DE Village -> Spider Nest" instead)
  const behind = wh ? wh.areas.filter(a => !a.reachable || !/Windy Hill/.test(a.entry.desc)) : [];
  check(wh && behind.length && wh.areas.filter(a => a.reachable && /Windy Hill/.test(a.entry.desc)).length >= 5, `Windy Hill: areas behind the eastern cliff are not reached from the Windy Hill landing (${behind.map(a => a.n + ': ' + (a.reachable ? 'via ' + a.entry.desc : 'not reachable')).join(', ') || '-'}), the rest is`);
  // never across a cliff / wall: flood inside each sampled polygon from its centre — every own spawn inside the polygon is reached on foot
  const spawns = readJson(path.join(DATA, 'spawns_h5.json'));
  const sample = ['abandoned-camp', 'windy-hill', 'fields-of-massacre', 'forest-of-mirrors'].flatMap(id => (F.regions.find(R => R.id === id) || { areas: [] }).areas.slice(0, 5));
  let okA = 0, tot = 0; const worst = [];
  sample.forEach(a => {
    const xs = a.poly.map(p => p[0]), ys = a.poly.map(p => p[1]);
    const box = [Math.min(...xs) - 50, Math.max(...xs) + 50, Math.min(...ys) - 50, Math.max(...ys) + 50];
    const ids2 = new Set(a.monsters.map(m => m.id));
    const own = spawns.filter(s => ids2.has(s.id) && RP.inPoly(s.x, s.y, a.poly) && s.z >= a.zRange[0] - 300 && s.z <= a.zRange[1] + 300);
    const G = RP.buildFloor(box, [a.zRange[0] - 600, a.zRange[1] + 600], [{ x: a.center[0], y: a.center[1], z: a.center[2] }]);
    // BFS from the centre restricted to cells inside the polygon (+48)
    const inside = (i) => { const x = (G.gx0 + (i % G.w)) * 16 - 294912 + 8, y = (G.gy0 + ((i / G.w) | 0)) * 16 - 262144 + 8; return distPoly(x, y, a.poly) <= 48; };
    const seen = new Uint8Array(G.n), q = [G.seedIdx[0]]; if (q[0] < 0) return; seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) for (let k = 0; k < 4; k++) { const j = RP.nbOpen(G, q[h], k); if (j >= 0 && !seen[j] && inside(j)) { seen[j] = 1; q.push(j); } }
    let r = 0; own.forEach(s => { const gx = geo.toGeoX(s.x) - G.gx0, gy = geo.toGeoY(s.y) - G.gy0; let hit = false; for (let dy = -6; dy <= 6 && !hit; dy++) for (let dx = -6; dx <= 6 && !hit; dx++) { const X = gx + dx, Y = gy + dy; if (X >= 0 && Y >= 0 && X < G.w && Y < G.h && seen[Y * G.w + X]) hit = true; } if (hit) r++; });
    tot++; const share = own.length ? r / own.length : 1; if (share >= 0.9) okA++; else worst.push(`${a.id} ${Math.round(share * 100)}%`);
  });
  check(okA >= tot * 0.9, `never across a cliff / wall: own spawns reached on foot inside the polygon >= 90 % in ${okA}/${tot} sampled areas (${worst.slice(0, 4).join(', ')})`);
}

// ---- 2) the tool on real regions ------------------------------------------------------------------------------------------------
if (!quick) {
  const FA = require('./field_areas');
  const A = FA.loadAll(), sp = FA.outdoorSpawns(A), mk = FA.makeRegions(A, sp.list);
  ['bee-hive', 'orc-barracks'].forEach(id => {
    const reg = mk.regs.find(r => r.key === id); if (!reg) { check(false, `tool: region ${id} exists`); return; }
    const t0 = Date.now(), res = FA.buildRegion(reg, A, mk.allLandings), rec = FA.regionRecord(reg, res, A);
    const file = F.regions.find(R => R.id === id);
    check(rec.areas.length >= 2 && file && rec.areas.length === file.areas.length, `tool: ${id} rebuilt in ${Date.now() - t0} ms -> ${rec.areas.length} areas (file: ${file ? file.areas.length : '-'})`);
    check(rec.areas.every(a => a.polyInfo.ownNear >= 90 && a.polyInfo.overlap <= 10), `tool: ${id} every area own >= 90 %, overlap <= 10 % (${rec.areas.map(a => a.polyInfo.ownNear + '/' + a.polyInfo.overlap).join(' ')})`);
    // no area holds cells of two separate pieces of ground
    const pieces = res.areas.map(a => { const set = new Set(a.cells), seen = new Set([a.cells[0]]), q = [a.cells[0]]; for (let h = 0; h < q.length; h++) for (let k = 0; k < 4; k++) { const j = RP.nbOpen(res.G, q[h], k); if (j >= 0 && set.has(j) && !seen.has(j)) { seen.add(j); q.push(j); } } return seen.size === set.size; });
    check(pieces.every(Boolean), `tool: ${id} every area is ONE connected piece of walkable ground (${pieces.filter(Boolean).length}/${pieces.length})`);
  });
}

// ---- 3) MULTISPOT-PURE ----------------------------------------------------------------------------------------------------------
const M = new Function(blk('// MULTISPOT-PURE-BEGIN', '// MULTISPOT-PURE-END') + '\nreturn { MULTI, multiSel, multiKey, multiSigPart, multiTravelSec, multiExpectAt, multiDue, multiPick, multiDecide, faOff, areaSpotOf, faAutoPick, faEntryWhy, faLandingKey, spotLandingWhy, multiUnreach };')();
{
  // backward compatibility of party_spots.json
  check(M.multiSel({ mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: 'cruma-1-left-a' }).ids.join() === 'cruma-1-left-a', 'old single roomId = a one-room selection');
  check(M.multiSel({ mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: 'any' }) === null, "roomId 'any' = the old any-free-room path (no selection)");
  check(M.multiSel({ mode: 'auto' }) === null && M.multiSel({ mode: 'manual', kind: 'zone', spot: 'x' }) === null, 'auto / zone / datapack: no selection');
  const s2 = M.multiSel({ mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: 'a', roomIds: ['a', 'b', 'a', 'c'], order: 'rotate' });
  check(s2.ids.join() === 'a,b,c' && s2.order === 'rotate', 'roomIds: order kept, duplicates dropped, order rotate');
  const s3 = M.multiSel({ mode: 'manual', kind: 'field', region: 'abandoned-camp', spot: 'Abandoned Camp', areaIds: ['abandoned-camp-2', 'abandoned-camp-1'] });
  check(s3.kind === 'field' && s3.place === 'abandoned-camp' && s3.order === 'nearest' && s3.ids[0] === 'abandoned-camp-2', 'field selection: region, areaIds in order, default order nearest');
  check(M.multiSigPart({ mode: 'manual', kind: 'rooms', roomId: 'x' }) === '', 'old entries keep their old partySpotSig (no extra part)');
  check(M.multiSigPart({ roomIds: ['a', 'b'], order: 'nearest' }) !== M.multiSigPart({ roomIds: ['a', 'c'], order: 'nearest' }), 'a changed room list changes the signature');
  // pick
  const T = [{ key: 'area:a', x: 0, y: 0 }, { key: 'area:b', x: 3000, y: 0 }, { key: 'area:c', x: 9000, y: 0 }];
  check(M.multiPick(T, { pos: { x: 8000, y: 0 }, order: 'nearest' }).key === 'area:c', 'pick: nothing current -> nearest to me');
  check(M.multiPick(T, { pos: { x: 8000, y: 0 }, order: 'rotate', cur: '' }).key === 'area:a', 'pick: rotate with nothing current -> the first in my order');
  check(M.multiPick(T, { cur: 'area:b', pos: { x: 9000, y: 0 } }).key === 'area:b', 'pick: the current one stays (sticky)');
  check(M.multiPick(T, { cur: 'area:b', forceNext: 'area:c' }).key === 'area:c', 'pick: a rotation decision (forceNext) wins');
  check(M.multiPick(T.map((t, i) => Object.assign({}, t, { blocked: i === 1 ? 'occupied by Foo, Bar' : '' })), { cur: 'area:b', order: 'rotate' }).key === 'area:c', 'pick: current occupied -> the next free one in my order');
  check(M.multiPick(T.map(t => Object.assign({}, t, { blocked: 'claimed by party X' })), { cur: 'area:a' }) === null, 'pick: every one taken -> null (automatic spot meanwhile)');
  // decide
  const base = (o) => Object.assign({ now: 1e6, cur: 'area:a', targets: [{ key: 'area:a', name: 'a', x: 0, y: 0, spawns: 20, respawnSec: 60 }, { key: 'area:b', name: 'b', x: 3000, y: 0, spawns: 15, respawnSec: 60 }, { key: 'area:c', name: 'c', x: 6000, y: 0, spawns: 30, respawnSec: 60 }], st: {}, live: 0, fighting: false, order: 'nearest' }, o);
  check(M.multiDecide(base({ live: 4 })).action === 'stay', 'decide: monsters here -> stay');
  check(M.multiDecide(base({ fighting: true })).action === 'stay', 'decide: fighting -> stay (never leave in a fight)');
  check(M.multiDecide(base({ st: { 'area:a': { emptySince: 1e6 - 20000, visitedAt: 1 } } })).action === 'wait', 'decide: empty 20 s -> wait (not yet)');
  const d1 = M.multiDecide(base({ st: { 'area:a': { emptySince: 1e6 - 36000, visitedAt: 1 } } }));
  check(d1.action === 'move' && d1.to === 'area:b', `decide: empty 36 s -> move to the nearest with monsters (${d1.to}: ${d1.why})`);
  const d2 = M.multiDecide(base({ order: 'rotate', cur: 'area:b', st: { 'area:b': { emptySince: 1e6 - 40000, visitedAt: 1 } } }));
  check(d2.action === 'move' && d2.to === 'area:c', `decide: rotate -> the next in my order (${d2.to})`);
  const occT = base({}).targets.map(t => t.key === 'area:b' ? Object.assign({}, t, { blocked: 'occupied by Foo' }) : t);
  const d3 = M.multiDecide(base({ targets: occT, st: { 'area:a': { emptySince: 1e6 - 40000, visitedAt: 1 } } }));
  check(d3.action === 'move' && d3.to === 'area:c', 'decide: the occupied one is skipped');
  const d4 = M.multiDecide(base({ cur: 'area:b', targets: occT, live: 6 }));
  check(d4.action === 'move' && d4.to !== 'area:b', `decide: the CURRENT one is occupied / claimed -> leave even with monsters (${d4.to}: ${d4.why})`);
  // every one empty: stay where the most respawns come
  const t = 1e6, kills = (n2, at) => Array.from({ length: n2 }, (_, i) => at + i * 100);
  const st5 = { 'area:a': { emptySince: t - 50000, visitedAt: 1, kills: kills(10, t - 50000) },                        // 10 due within 60 s
    'area:b': { visitedAt: 1, leftAt: t - 2000, leftLive: 0, kills: kills(15, t - 1500) },                                 // back only after we would arrive
    'area:c': { visitedAt: 1, leftAt: t - 10000, leftLive: 0, kills: [] } };                                               // left empty, nothing comes back
  const d5 = M.multiDecide(base({ st: st5 }));
  check(d5.action === 'stay' && /staying here/.test(d5.why), `decide: all empty, the most respawns come here -> stay (${d5.why})`);
  const st6 = { 'area:a': { emptySince: t - 50000, visitedAt: 1, kills: [] }, 'area:b': { visitedAt: 1, leftAt: t - 200000, leftLive: 0, kills: kills(12, t - 180000) }, 'area:c': { visitedAt: 1, leftAt: t - 5000, leftLive: 0, kills: [] } };
  const d6 = M.multiDecide(base({ st: st6 }));
  check(d6.action === 'move' && d6.to === 'area:b', `decide: nothing comes back here, area b has respawned -> move there (${d6.to}: ${d6.why})`);
  check(M.multiExpectAt({ spawns: 20, respawnSec: 60 }, null, t) === 20, 'expect: never visited = all its spawns');
  check(M.multiExpectAt({ spawns: 20, respawnSec: 60 }, { visitedAt: 1, leftAt: t - 30000, leftLive: 2, kills: kills(10, t - 70000) }, t) === 12, 'expect: left 2 alive + 10 kills respawned since = 12');
  check(M.multiTravelSec({ x: 0, y: 0, floor: 1 }, { x: 0, y: 0, floor: 2 }) === M.MULTI.floorSec, 'travel: another floor costs the floor teleport time');
  // the real data: automatic pick
  const blocked = new Set();
  const o = (x) => Object.assign({ level: 25, teamMax: 27, margin: 6, solo: false, lead: true, pos: { x: 83000, y: 148000 }, minPool: 20, blocked: (k) => blocked.has(k) ? 'claimed' : '' }, x);
  const p1 = M.faAutoPick(F, o({}));
  check(p1 && M.faOff(p1.a, 25) === 0 && p1.a.reachable && p1.a.entry.kind === 'gk', `faAutoPick lvl 25: ${p1 ? p1.R.name + ' ' + p1.a.id + ' (' + p1.a.levelRange.join('-') + ', ' + p1.pool.length + ' in the pool)' : 'none'}`);
  check(p1 && p1.pool.every(a => M.faOff(a, 25) === 0 && a.dangerMax <= 33), 'faAutoPick: every pooled area fits and is under the safe limit');
  p1.pool.forEach(a => blocked.add('area:' + a.id));
  const p2 = M.faAutoPick(F, o({}));
  check(p2 && !p2.pool.some(a => blocked.has('area:' + a.id)), `faAutoPick: areas claimed by another party are never taken (now ${p2 ? p2.a.id : 'none'})`);
  check(!F.regions.some(R => R.areas.some(a => a.entry && a.entry.kind === 'town' && M.faAutoPick({ regions: [{ ...R, areas: [a] }] }, o({ level: M.faOff(a, 1) ? a.suitsPartyLevel[0] : 1, teamMax: 99, minPool: 0 })))), 'faAutoPick in lead mode: never an area reached by walking out of a town');
  const p3 = M.faAutoPick(F, o({ level: 70, teamMax: 72, pos: { x: 147000, y: 26000 } }));
  check(p3 && p3.a.levelRange[1] >= 65, `faAutoPick lvl 70: ${p3 ? p3.R.name + ' ' + p3.a.id : 'none'}`);
  // ---- REACHABLE ENTRY (BUG 2026-10-09 16:11) ----
  // the OLD data of the bug (backup before the --entries fix, else a copy built here): Ivory Tower areas 4/5/6 'reachable' with 27.5-29.5k walks
  let OLD = null; try { OLD = readJson(path.join(ROOT, 'Settings', 'backup', '2026-10-09_fieldarea_reach', 'field_areas.json')); } catch (e) { }
  const oldIvo = OLD ? OLD.regions.find(R => R.id === 'ivory-tower-area-far') : { id: 'ivory-tower-area-far', name: 'Ivory Tower area (far)', areas: [41, 42, 43, 44, 45, 46].map((lv, i) => ({ id: 'ivory-tower-area-far-' + (i + 1), n: i + 1, center: [80000 + i * 1800, 12000, -5288], poly: [[0, 0], [1, 0], [1, 1]], levelRange: [40, 43], suitsPartyLevel: [41, 43], dangerMax: 43, spawnCount: 30, reachable: true, neighbours: [], entry: { kind: 'gk', from: 'Oren', desc: 'Oren -> Sea of Spores', landing: [64328, 26803, -3768], walk: [24275, 24672, 25219, 27536, 28320, 29514][i] } })) };
  const tooFar = oldIvo.areas.filter(a => a.entry && a.entry.walk > 24500);
  check(tooFar.length >= 3 && tooFar.every(a => M.faEntryWhy(a, 25000)), `faEntryWhy: the bug's areas (walk > 24.5k) are refused (${tooFar.map(a => a.n + ': ' + M.faEntryWhy(a, 25000)).slice(0, 2).join(' | ')})`);
  check(M.faEntryWhy({ reachable: true, center: [0, 0, 0], entry: { desc: 'X -> Y', landing: [24800, 0, 0], walk: 1000 } }, 25000) !== '', 'faEntryWhy: a straight line landing -> centre over the limit is refused even with a short (wrong) walk');
  check(M.faEntryWhy({ reachable: true, center: [0, 0, 0], entry: { desc: 'X -> Y', landing: [9000, 0, 0], walk: 12000 } }, 25000) === '', 'faEntryWhy: a 12k walk is fine');
  check(/walls/.test(M.faEntryWhy({ reachable: false, unreachable: 'no walkable way from any gatekeeper landing (walls, cliffs or water)', center: [0, 0, 0], entry: null }, 25000)), 'faEntryWhy: the data reason is passed on');
  // pickSpot mock over the real data: every level 1..85, solo and party, never an area whose walk from its landing exceeds the limit
  const offenders = [];
  for (let L = 1; L <= 85; L += 2) for (const solo of [false, true]) {
    const p = M.faAutoPick(F, o({ level: L, teamMax: L + 2, solo, minPool: solo ? 0 : 20, maxWalk: 25000, pos: { x: 83000, y: 148000 } }));
    if (p) p.pool.forEach(a => { const w = M.faEntryWhy(a, 25000); if (w) offenders.push(`lvl ${L}: ${a.id} ${w}`); });
  }
  check(!offenders.length, `faAutoPick lvl 1-85 (solo + party): no area > maxWalk from its landing is ever offered (${offenders.slice(0, 3).join(' | ')})`);
  // the bug: Dagger1 solo lvl 41 (44 - 3) with ONLY the old Ivory Tower region -> never areas 3-6
  const QF = { regions: [oldIvo] };
  const q1 = M.faAutoPick(QF, o({ level: 41, teamMax: 44, solo: true, minPool: 0, maxWalk: 25000, pos: { x: 82992, y: 53171 } }));
  check(!q1 || (!q1.pool.some(a => a.entry.walk > 24500) && q1.a.entry.walk <= 24500), `the bug replayed on the old data: Dagger1 lvl 41 solo -> ${q1 ? q1.a.id + ' (walk ' + q1.a.entry.walk + ', pool ' + q1.pool.map(a => a.n).join(',') + ')' : 'nothing'} — never areas 3-6`);
  // sibling ban: the landing + region pair failed once -> no other area of that region with the same landing
  const lk = M.faLandingKey(oldIvo.id, oldIvo.areas[0]);
  check(lk === 'landing:ivory-tower-area-far|Oren -> Sea of Spores', `faLandingKey = ${lk}`);
  const q2 = M.faAutoPick(QF, o({ level: 41, teamMax: 44, solo: true, minPool: 0, maxWalk: 25000, landingBad: (k) => k === lk }));
  check(!q2, `sibling ban: after one failed trip from Oren -> Sea of Spores no other Ivory Tower area with that landing is offered (${q2 ? q2.a.id : 'none'})`);
  // the same on the NEW data: a failed landing removes exactly its own areas from the pick
  const newIvo = F.regions.find(R => R.id === 'ivory-tower-area-far');
  if (newIvo) { const keys = new Set(newIvo.areas.filter(a => a.reachable).map(a => M.faLandingKey(newIvo.id, a))); const k1 = [...keys][0];
    const q3 = M.faAutoPick({ regions: [newIvo] }, o({ level: 41, teamMax: 44, solo: true, minPool: 0, maxWalk: 25000, landingBad: (k) => k === k1 }));
    check(!q3 || M.faLandingKey(newIvo.id, q3.a) !== k1, `sibling ban on the new data: ${k1} banned -> ${q3 ? q3.a.id + ' via ' + q3.a.entry.desc : 'nothing'}`); }
  // rotation: an unreachable target is never moved to / picked
  const UT = [{ key: 'area:a', x: 0, y: 0, spawns: 20 }, { key: 'area:b', x: 2000, y: 0, spawns: 30, unreachable: '29.5k walk from Oren -> Sea of Spores' }, { key: 'area:c', x: 6000, y: 0, spawns: 30 }];
  check(M.multiPick(UT, { pos: { x: 2000, y: 0 }, order: 'nearest' }).key !== 'area:b', 'multiPick: an unreachable area is never the next target (even the nearest)');
  const du = M.multiDecide({ now: 1e6, cur: 'area:a', targets: UT, st: { 'area:a': { emptySince: 1e6 - 40000, visitedAt: 1 } }, live: 0, fighting: false, order: 'rotate' });
  check(du.action === 'move' && du.to === 'area:c', `multiDecide: rotate skips the unreachable area b (${du.action} ${du.to || ''})`);
  const du2 = M.multiDecide({ now: 1e6, cur: 'area:b', targets: UT, st: {}, live: 5, fighting: false, order: 'nearest' });
  check(du2.action === 'move' && du2.to !== 'area:b', `multiDecide: standing in an area marked unreachable -> move to a reachable one (${du2.to})`);
  // travelToSpot's check before the teleport
  const ivSpot = (a) => M.areaSpotOf(oldIvo, a, {});
  const a6 = oldIvo.areas.find(a => a.n === 6) || oldIvo.areas[oldIvo.areas.length - 1];
  check(/^REFUSED: Oren -> Sea of Spores lands 2[0-9][.][0-9]k/.test(M.spotLandingWhy(ivSpot(a6), ivSpot(a6).area.landing, 25000)), `spotLandingWhy: Ivory Tower area 6 from Sea of Spores -> ${M.spotLandingWhy(ivSpot(a6), ivSpot(a6).area.landing, 25000)}`);
  const a1 = oldIvo.areas.find(a => a.n === 1);
  check(M.spotLandingWhy(ivSpot(a1), ivSpot(a1).area.landing, 25000) === '', 'spotLandingWhy: area 1 (24.3k walk) is allowed');
  check(M.spotLandingWhy({ name: 'x', center: { x: 0, y: 0 }, gk: { desc: 'A -> B' } }, { x: 26000, y: 0 }, 25000).startsWith('REFUSED'), 'spotLandingWhy: a datapack spot 26k from its landing is refused (straight line)');
  check(ivSpot(a6).area.landingKey === M.faLandingKey(oldIvo.id, a6) && ivSpot(a6).area.walk === a6.entry.walk, 'areaSpotOf carries the landing, walk and landing key');
  const R0 = F.regions.find(R => R.id === 'abandoned-camp'), sp = M.areaSpotOf(R0, R0.areas[0], {});
  check(sp.area.id === R0.areas[0].id && sp.poly.length === R0.areas[0].poly.length && sp.noScale && sp.gk && /Abandoned Camp/.test(sp.gk.desc), 'areaSpotOf: polygon, no x3 scaling, the gatekeeper link of its landing');
}

// ---- 3b) GEOLEARN-PURE: learned blocked spots + day skips (coordinator 2026-10-09 16:36, Tank3 stuck twice in Abandoned Camp) ----
{
  const GL = new Function(blk('// GEOLEARN-PURE-BEGIN', '// GEOLEARN-PURE-END') + '\nreturn { GEOLEARN, geoBlockActive, geoBlockMerge, geoBlockedIn, spotLearnFail };')();
  const t0 = Date.parse('2026-10-09T13:00:00Z');
  let r = GL.geoBlockMerge({}, { x: -53976, y: 146072, z: -2880, by: 'Tank3', at: t0, why: 'stuck' });
  check(r.doc.points.length === 1 && !GL.geoBlockActive(r.point) && !r.became, 'geoBlock: the first stuck episode only records the spot (not active yet)');
  r = GL.geoBlockMerge(r.doc, { x: -54024, y: 145992, z: -2880, by: 'Tank3', at: t0 + 120000, why: 'stuck again, same trip' });
  check(r.doc.points.length === 1 && r.point.episodes === 1 && !GL.geoBlockActive(r.point), 'geoBlock: more give-ups of the SAME trip (2 min later, same character, 90 away) = one episode');
  r = GL.geoBlockMerge(r.doc, { x: -54120, y: 146248, z: -2880, by: 'Tank3', at: t0 + 96 * 60000, why: 'stuck at 16:34' });
  check(r.became && r.point.episodes === 2 && GL.geoBlockActive(r.point), 'geoBlock: the 2nd episode (1.5 h later, 200 away) makes the spot ACTIVE for every route');
  const r2 = GL.geoBlockMerge({ points: [] }, { x: 0, y: 0, z: 0, by: 'A', at: t0 }); const r3 = GL.geoBlockMerge(r2.doc, { x: 50, y: 0, z: 0, by: 'B', at: t0 + 1000 });
  check(r3.became, 'geoBlock: two different characters stuck at the same spot = active at once');
  const r4 = GL.geoBlockMerge(r3.doc, { x: 50, y: 0, z: -1500, by: 'C', at: t0 + 2000 });
  check(r4.doc.points.length === 2, 'geoBlock: the same x,y on another floor (1500 lower) is another spot');
  check(GL.geoBlockedIn(r.doc.points, -54080, 146150, -2880, 150) && !GL.geoBlockedIn(r.doc.points, -52824, 143256, -2904, 150), 'geoBlockedIn: a monster in the pocket is skipped, one at the area 3 centre is not');
  check(GL.geoBlockActive({ manual: true }) && !GL.geoBlockActive({ manual: true, disabled: true }), 'geoBlock: manual points are active, "disabled" switches one off');
  // day skips
  const day = '2026-10-09', end = Date.parse('2026-10-10T04:30:00Z');
  let s = GL.spotLearnFail({}, 'area:abandoned-camp-2', { at: t0 + 4 * 60000, by: 'Tank3', why: 'stuck' }, day, end);
  check(s.count === 1 && !s.skipUntil, 'spot day skip: the 1st "could not reach" today = the old 1 h skip only');
  s = GL.spotLearnFail(s.doc, 'area:abandoned-camp-2', { at: t0 + 96 * 60000, by: 'Tank3', why: 'stuck' }, day, end);
  check(s.count === 2 && s.skipUntil === end, 'spot day skip: the 2nd time today -> skipped until the day ends (06:30)');
  const s2 = GL.spotLearnFail(s.doc, 'area:abandoned-camp-2', { at: end + 3600000, by: 'Tank2', why: 'x' }, '2026-10-10', end + 86400000);
  check(s2.count === 1 && !s2.skipUntil, 'spot day skip: a new day starts counting again');
  const s3 = GL.spotLearnFail({}, 'room:x', { at: 1, by: 'Destroyer3' }, day, end); const s4 = GL.spotLearnFail(s3.doc, 'room:x', { at: 2, by: 'Tank2' }, day, end);
  check(s4.skipUntil === end, 'spot day skip: two different parties failing the same spot count together');
  // the data file + the path finder
  const GB = readJson(path.join(DATA, 'geo_blocked.json'));
  const pocket = GB.points.find(p => p.id === 'abandoned-camp-3-north-pocket');
  check(pocket && GL.geoBlockActive(pocket) && ['-53976,146072', '-54120,146248', '-54024,145992', '-54136,146200'].every(t => { const [x, y] = t.split(',').map(Number); return Math.hypot(x - pocket.x, y - pocket.y) <= pocket.r; }), 'geo_blocked.json: the Abandoned Camp pocket covers all 4 positions Tank3 was stuck at');
  const rt = geo.findPath({ x: -49853, y: 147089, z: -2784 }, { x: -55200, y: 146300, z: -2850 }, { maxLeg: 1000 });
  check(rt.ok && rt.points.every(p => Math.hypot(p.x - pocket.x, p.y - pocket.y) > pocket.r), `geopath: a route past the pocket keeps out of it (closest waypoint ${rt.ok ? Math.round(Math.min(...rt.points.map(p => Math.hypot(p.x - pocket.x, p.y - pocket.y)))) : '-'})`);
  const out = geo.findPath({ x: -54120, y: 146248, z: -2880 }, { x: -46024, y: 145032, z: -3024 }, { maxLeg: 1000 });
  check(out.ok, 'geopath: a bot standing INSIDE the pocket still gets a route out');
  const ac = F.regions.find(R => R.id === 'abandoned-camp');
  const dseg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const near = ac.areas.map(a => { const q = (a.entry && a.entry.route) || []; let m = 1e9; for (let i = 1; i < q.length; i++) m = Math.min(m, dseg([pocket.x, pocket.y], q[i - 1], q[i])); return { id: a.id, m }; });
  check(near.every(x => x.m > pocket.r + 200), `Abandoned Camp: no area's entry route crosses the pocket (closest ${near.sort((a, b) => a.m - b.m).slice(0, 2).map(x => x.id.split('-').pop() + ': ' + Math.round(x.m)).join(', ')})`);
}

// ---- 4) simulated leader rotating through 3 areas ------------------------------------------------------------------------------
{
  const W = { t: 0, st: {}, cur: 'area:a', log: [], blocked: {} };
  const targets = () => [['area:a', 0], ['area:b', 2500], ['area:c', 6000]].map(([k, x]) => ({ key: k, name: k, x, y: 0, spawns: 8, respawnSec: 120, blocked: W.blocked[k] || '' }));
  const alive = { 'area:a': 8, 'area:b': 8, 'area:c': 8 }, dead = { 'area:a': [], 'area:b': [], 'area:c': [] };
  for (W.t = 0; W.t <= 900000; W.t += 1000) {
    Object.keys(dead).forEach(k => { dead[k] = dead[k].filter(d => { if (d + 120000 <= W.t) { alive[k]++; return false; } return true; }); });
    if (W.t === 300000) W.blocked['area:b'] = 'claimed by party Destroyer3';
    const s = W.st[W.cur] || (W.st[W.cur] = { kills: [], visitedAt: W.t });
    if (alive[W.cur] > 0 && W.t % 6000 === 0) { alive[W.cur]--; dead[W.cur].push(W.t); s.kills.push(W.t); }       // one kill every 6 s
    if (W.t % 5000) continue;
    const live = alive[W.cur]; if (live > 0) s.emptySince = 0; else if (!s.emptySince) s.emptySince = W.t;
    const d = M.multiDecide({ now: W.t, cur: W.cur, targets: targets(), st: W.st, live, fighting: false, order: 'nearest' });
    if (d.action === 'move') { s.leftAt = W.t; s.leftLive = live; s.emptySince = 0; W.log.push(`${Math.round(W.t / 1000)}s ${W.cur}->${d.to}`); W.cur = d.to; if (!W.st[W.cur]) W.st[W.cur] = { kills: [], visitedAt: W.t }; }
  }
  const moves = W.log.length;
  check(moves >= 3, `simulation: the leader moved on ${moves} times in 15 min (${W.log.slice(0, 6).join(', ')})`);
  check(W.log.every(l => !/->area:b/.test(l) || +l.split('s')[0] < 300), 'simulation: never back into area b after another party claimed it (300 s)');
  const firstMove = W.log[0] ? +W.log[0].split('s')[0] : 0;
  check(firstMove >= 42 + 35 && firstMove <= 42 + 45, `simulation: the first move came ~35 s after the area was cleared (last kill at 42 s, moved at ${firstMove} s)`);
}

// ---- 5) the real host code in a sandbox -------------------------------------------------------------------------------------------
function grab(name) {
  // a top-level `function name(` / `async function name(` / `const name =` of swarm.js, up to its end (braces outside strings / comments)
  let i = src.search(new RegExp('\\n(async )?function ' + name + '\\('));
  let isConst = false;
  if (i < 0) { i = src.search(new RegExp('\\n(const|let) ' + name + ' =')); isConst = true; }
  if (i < 0) throw new Error('not found: ' + name);
  i++;
  if (isConst) return src.slice(i, src.indexOf(String.fromCharCode(10), i));            // (the grabbed consts are one line each)
  // a top-level function ends at the first line that is only '}' (the file's formatting; one-line functions end on their own line)
  const nl = src.indexOf(String.fromCharCode(10), i), line = src.slice(i, nl);
  const opens = line.split('{').length - 1, closes = line.split('}').length - 1;
  if (opens > 0 && opens === closes) return line;
  const e = src.indexOf(String.fromCharCode(10) + '}', i); if (e > 0) return src.slice(i, e + 2);
  throw new Error('unterminated: ' + name);
}
{
  const names = ['pickSpot', 'zoneSpot', 'zoneSubAreas', 'zoneShared', 'spotBlock', 'areaTaken', 'claimOverlaps', 'foreignClaims', 'claimCache', 'spotKeyOf', 'spotBad', 'spotOccupied',
    'zoneTeamOk', 'leadMode', 'zoneScale', 'leadNum', 'faArea', 'faRegion', 'multiSt', 'roomById', 'multiTargets', 'multiTargetSpot', 'multiSpotFor', 'manualMultiSpot', 'zoneAreaSpot', 'fieldAreaAutoSpot',
    'roomSpotOf', 'roomSpot', 'pickRoom', 'roomPolyPts', 'gkNorm', 'inPolygon', 'nearPolygon'];
  const code = blk('// ESCPURE-BEGIN', '// ESCPURE-END') + '\n' + blk('// MULTISPOT-PURE-BEGIN', '// MULTISPOT-PURE-END') + '\n' + names.map(grab).join('\n');
  const env = { claims: {}, picks: [], now: 2e12 };
  const D = readJson(path.join(DATA, 'dungeon_rooms.json')), Z = readJson(path.join(DATA, 'custom_zones.json')), HS = readJson(path.join(DATA, 'hunting_spots_h5.json'));
  const FA = JSON.parse(JSON.stringify(F)); FA.byId = {}; FA.regions.forEach(R => R.areas.forEach(a => { FA.byId[a.id] = { R, a }; }));
  const H = new Function('env', 'D', 'Z', 'HS', 'FA', `
    const now = () => env.now, num = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
    const Me = env.me; const CONFIG = env.CONFIG; const livePos = {}; const control = { gen: 0 };
    const autoLvl = env.autoLvl; const spotOcc = env.spotOcc; const SOLO = { levelsBelow: 3 };
    const soloChar = () => false, assistSpot = () => null, manualSpot = () => null, teamKind = () => 'melee', ssSpotOk = () => true, teamRoute = () => null;
    const customZones = () => Z, huntingSpots = () => HS, dungeonRooms = () => D, fieldAreas = () => FA, spotReachable = (s) => !env.unreach || !env.unreach.test(String((s.gk && s.gk.desc) || ''));
    const pickLog = (m) => env.picks.push(m), logError = (w, e) => env.picks.push('ERROR ' + w + ' ' + (e && e.stack)), note = () => {}, dungeonLog = () => {};
    const readClaims = () => env.claims, claimTeam = () => env.team, myClaimSince = () => 0, sharedOccupied = () => '';
    const teamMaxLevel = () => env.teamMax, teamMinLevel = () => env.level, isLeader = () => true, teamOf = (n) => n; const currentTownKey = () => env.town || null;
    let ZSUB = null, zsubAt = 0; const __SCRIPTS__ = ''; const File = { ReadAllText: () => '{"zones":{}}' };
    ${code}
    return { pickSpot, zoneSpot, zoneAreaSpot, multiSpotFor, multiTargets, spotBlock, claimOverlaps, multiSt, spotKeyOf };`);
  const mk = (o) => {
    Object.assign(env, { me: { Name: o.leader, X: o.x || 83000, Y: o.y || 148000, Z: -3400, Level: o.level }, level: o.level, teamMax: o.teamMax || o.level + 2, team: o.leader, claims: o.claims || {}, picks: [], unreach: o.unreach || null,
      CONFIG: { leader: o.leader, lead: { on: true, zoneScale: 3, avoidLanding: /Ruins of Despair/i, claimRadius: 1500, claimTtlMs: 180000 }, danger: { margin: 6 }, teams: {}, travel: { maxWalk: 25000, maxUsefulLanding: 30000 } },
      autoLvl: { bad: o.bad || {}, spot: o.spot || null, forceSpot: null }, spotOcc: o.occ || {} });
    return H(env, D, Z, HS, o.fa ? Object.assign({ zones: {} }, o.fa, { byId: (() => { const b = {}; o.fa.regions.forEach(R => R.areas.forEach(a => { b[a.id] = { R, a }; })); return b; })() }) : FA);
  };
  // Destroyer3 lvl 25: his own Abandoned Camp route zone -> one of its field areas, rotating (no x3 square)
  let X = mk({ leader: 'Destroyer3', level: 25 });
  let s = X.pickSpot(25, false);
  check(s && s.area && s.multi && s.multi.auto && /Abandoned Camp/.test(s.name) && s.noScale && s.poly.length >= 3, `pickSpot Destroyer3 lvl 25 -> ${s ? s.name + ' (' + (s.multi ? s.multi.ids.length + ' areas in the rotation' : 'no rotation') + ')' : 'null'} ${env.picks.filter(p => /ERROR/.test(p)).join(' ')}`);
  check(s && X.spotKeyOf(s) === 'area:' + s.area.id, 'claim / skip key of a field area = area:<id>');
  const first = s && s.area.id, pool = s ? s.multi.ids.slice() : [];
  // another party claims that area -> the next area of the same zone
  const cl = {}; cl['area:' + first] = { team: 'Tank2', at: env.now - 1000, since: env.now - 50000, name: 'x', center: { x: s.center.x, y: s.center.y, z: s.center.z }, radius: s.radius, area: first };
  X = mk({ leader: 'Destroyer3', level: 25, claims: cl });
  const s2 = X.pickSpot(25, false);
  check(s2 && s2.area && s2.area.id !== first && /Abandoned Camp/.test(s2.name), `claimed area -> another area of the same zone (${s2 ? s2.area.id : 'null'})`);
  check(!!(s2 && cl['area:' + first] && X.claimOverlaps(Object.assign({ key: 'area:' + first }, cl['area:' + first]), s2.center, s2.radius, 'area:' + s2.area.id) === false), 'two different field areas never "overlap" as claims (neighbours can be hunted by two parties)');
  // all areas of the zone banned -> another zone / field area, never the banned ones
  const bad = {}; pool.forEach(id => { bad['area:' + id] = env.now + 1800000; });
  X = mk({ leader: 'Destroyer3', level: 25, bad });
  const s3 = X.pickSpot(25, false);
  check(s3 && !(s3.area && pool.includes(s3.area.id)), `every area of the zone skipped -> something else (${s3 ? s3.name : 'null'})`);
  // occupied by other players (spotOcc) -> skipped too
  const occ = {}; occ['area:' + first] = { until: env.now + 1800000, by: 'Foo, Bar', name: 'x' };
  X = mk({ leader: 'Destroyer3', level: 25, occ });
  const s4 = X.pickSpot(25, false);
  check(s4 && s4.area && s4.area.id !== first, `occupied area -> another one (${s4 ? s4.area.id : 'null'})`);
  // Tank1 lvl 55: Fields of Massacre route zone -> areas
  X = mk({ leader: 'Tank1', level: 55, x: 147000, y: 26000 });
  const s5 = X.pickSpot(55, false);
  check(s5 && s5.area && /Fields of Massacre/.test(s5.name), `pickSpot Tank1 lvl 55 -> ${s5 ? s5.name : 'null'}`);
  // a party with NO route zone for its level (Dagger1-like, lvl 12): the automatic field-area step before the datapack squares
  X = mk({ leader: 'Nobody', level: 12 });
  const s6 = X.pickSpot(12, false);
  check(s6 && s6.area && s6.multi && s6.multi.auto && env.picks.some(p => /field area/.test(p)), `no zone for the level -> automatic field area ${s6 ? s6.name : 'null'} (${env.picks.find(p => /field area/.test(p)) || env.picks.join(' | ')})`);
  check(s6 && s6.gk && /->/.test(s6.gk.desc), 'the automatic field area comes with its "Town -> Field" gatekeeper link (lead mode)');
  // manual multi: a field selection, then a rooms selection across floors (backward: a single roomId is NOT a rotation)
  X = mk({ leader: 'Crafter1', level: 25 });
  const sel = M.multiSel({ mode: 'manual', kind: 'field', region: 'abandoned-camp', spot: 'Abandoned Camp', areaIds: ['abandoned-camp-3', 'abandoned-camp-1', 'abandoned-camp-2'], order: 'rotate' });
  const m1 = X.multiSpotFor(sel, 25, []);
  check(m1 && m1.area && m1.multi.ids.length === 3 && !m1.multi.auto, `manual field selection -> ${m1 ? m1.name : 'null'} (rotate, 3 areas)`);
  const rs = M.multiSel({ mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomIds: ['cruma-1-left-a', 'cruma-2-left-a', 'cruma-1-right-b'], order: 'nearest' });
  const m2 = X.multiSpotFor(rs, 45, []);
  const floors = m2 ? new Set(X.multiTargets(rs).map(t => t.floor)) : new Set();
  check(m2 && m2.room && m2.multi && floors.size === 2, `manual rooms selection across 2 floors -> ${m2 ? m2.room.id : 'null'} (floors ${[...floors].join(',')})`);
  check(m2 && m2.levelMax >= Math.max(...X.multiTargets(rs).map(t => t.h.r.levelRange[1])), 'the level gate of a selection uses the highest monsters of ALL chosen rooms');
  check(!env.picks.some(p => /ERROR/.test(p)), `no errors in the host code (${env.picks.filter(p => /ERROR/.test(p)).slice(0, 2).join(' | ')})`);
  // REACHABLE ENTRY (BUG 2026-10-09 16:11) replayed in the REAL host pickSpot / multiTargets: Dagger1 lvl 44 solo in Oren, only the OLD Ivory
  // Tower region (areas 4-6: 27.5-29.5k walks from Oren -> Sea of Spores, 'reachable' in the old data)
  let OLD = null; try { OLD = readJson(path.join(ROOT, 'Settings', 'backup', '2026-10-09_fieldarea_reach', 'field_areas.json')); } catch (e) { }
  const oldIvo = OLD && OLD.regions.find(R => R.id === 'ivory-tower-area-far');
  if (oldIvo) {
    const fa = { regions: [JSON.parse(JSON.stringify(oldIvo))] };
    X = mk({ leader: 'Dagger1', level: 41, x: 82992, y: 53171, fa });
    const q = X.pickSpot(41, true);
    const far = (id) => { const a = oldIvo.areas.find(x => x.id === id); return a && a.entry.walk > 24500; };
    check(!(q && q.area && far(q.area.id)) && !(q && q.multi && q.multi.ids.some(far)), `host pickSpot, old data: Dagger1 lvl 41 -> ${q ? q.name + (q.multi ? ' (pool ' + q.multi.ids.map(i => i.split('-').pop()).join(',') + ')' : '') : 'null'} — never an area > 24.5k from its landing`);
    const lk = 'landing:ivory-tower-area-far|Oren -> Sea of Spores', bad2 = {}; bad2[lk] = env.now + 3600000;
    X = mk({ leader: 'Dagger1', level: 41, x: 82992, y: 53171, fa, bad: bad2 });
    const q2 = X.pickSpot(41, true);
    check(!(q2 && q2.area && /ivory-tower/.test(q2.area.id)), `host pickSpot: the failed landing + region pair skips every sibling (${q2 ? q2.name : 'null'})`);
    const sel = { kind: 'field', place: 'ivory-tower-area-far', ids: ['ivory-tower-area-far-4', 'ivory-tower-area-far-5', 'ivory-tower-area-far-6', 'ivory-tower-area-far-1'], order: 'rotate', stay: false };
    X = mk({ leader: 'Dagger1', level: 41, x: 82992, y: 53171, fa });
    const T = X.multiTargets(sel);
    check(T.filter(t => t.unreachable).map(t => t.id.split('-').pop()).join(',') === '4,5,6' && !T.find(t => t.id.endsWith('-1')).unreachable, `host multiTargets (a dashboard choice of 4,5,6,1): 4, 5, 6 unreachable (${(T.find(t => t.unreachable) || {}).unreachable || '-'})`);
    const m = X.multiSpotFor(sel, 41, []);
    check(m && m.area && m.area.id === 'ivory-tower-area-far-1', `host multiSpotFor: the rotation goes straight to the reachable area 1 (${m ? m.area.id : 'null'})`);
  } else check(true, 'host replay skipped (no backup of the old data)');
}

// ---- 6) source checks -----------------------------------------------------------------------------------------------------------
{
  const has = (re, what) => check(re.test(src), 'source: ' + what);
  has(/const spotKeyOf = \(s\) => [^\n]*`area:\$\{s\.area\.id\}`/, 'spotKeyOf knows area:<id>');
  has(/\(autoLvl\.spot\.room \|\| autoLvl\.spot\.area\) \? nearPolygon\(mb\.X, mb\.Y, autoLvl\.spot\.poly, 100\)/, 'huntTarget: only monsters inside the area (+100)');
  has(/autoLvl\.spot\.multi && !autoLvl\.forceSpot && multiTick\(autoLvl\.spot, solo\) === 'move'/, 'autolevel loop calls multiTick and picks again on "move"');
  has(/multiKill\(autoLvl\.spot\)/, 'kills are counted per target (respawn estimate)');
  has(/const fa = zoneAreaSpot\(z, level, why\); if \(fa !== undefined\) return fa;/, 'zoneSpot: a plain outdoor zone is hunted as its field areas');
  has(/fieldAreaAutoSpot\(level, solo, wide, \(c\) => nearSkipped\(c\)\)/, 'pickSpot: the automatic field-area step before the datapack squares');
  has(/if \(spot\.room && spot\.multiMove\) \{ const mv = await multiRoomMove\(spot\)/, 'travelToSpot: a room on another floor of the same dungeon via the floor teleporters');
  has(/\+ multiSigPart\(e\) : 'auto'/, 'partySpotSig includes the room / area lists');
  has(/const ms = multiSel\(e\);\n\s*if \(ms && \(ms\.kind === 'field' \|\| ms\.ids\.length > 1\)\) s = manualMultiSpot\(ms, level, why\);/, 'manualSpot: several rooms / field areas');
  has(/area: spot\.area \? spot\.area\.id : null, region: spot\.area \? spot\.area\.region : null/, 'claims carry the area id');
  has(/autoLvl\.zone\.room = autoLvl\.spot\.room \? autoLvl\.spot\.room\.id : autoLvl\.spot\.area\.id/, 'members get the area polygon through swarm.room');
  has(/zone: autoLvl\.active && autoLvl\.zone \? Object\.assign\(\{\}, autoLvl\.zone, \{ multi: multiPublic\(\) \}\)/, 'swarm_state zone.multi for the dashboard');
  has(/floor: 'outdoor', safeSpots/, 'escape: the safe spots of the hunted field area');
  const hasT = (t, what) => check(src.includes(t), 'source: ' + what);
  hasT('autoLvl.bad[spot.area.landingKey] = autoLvl.bad[spotKeyOf(spot)]', 'a failed field-area trip bans its landing + region pair (siblings)');
  hasT('const why = spotLandingWhy(spot, land, CONFIG.travel.maxWalk);', 'travelToSpot checks the walk from the planned landing before any teleport');
  hasT('if (why) { gkFail = why; note(`travel: ${why} — not teleporting`', 'travelToSpot: a refused walk ends the trip before the regroup / teleport');
  hasT('maxWalk: CONFIG.travel.maxWalk, landingBad: (k) => spotBad(k)', 'fieldAreaAutoSpot passes maxWalk + the landing ban to faAutoPick');
  hasT('!faEntryWhy(h.a, CONFIG.travel.maxWalk) && !spotBad(faLandingKey(h.R.id, h.a))', 'zoneAreaSpot: only reachable areas with a working landing');
  hasT("try { geoBlockLearn(`route walk gave up stuck (waypoint ${i + 1}/${r.points.length})`, { x, y }); } catch (e) { }", 'geoWalk: a give-up records the stuck spot (learned blocked spots)');
  hasT('if (geoBlockedAt(mb.X, mb.Y, mb.Z, 150)) return no(mb);', 'huntTarget: never a monster standing in a blocked spot');
  hasT('const lf = spotLearnFailHost(spot, gkFail || ', 'the 2nd could-not-reach of the day skips the spot for every party until 06:30');
}
console.log(`\n${n - fails}/${n} passed${fails ? ', ' + fails + ' FAILED' : ''}`);
process.exit(fails ? 1 : 0);
