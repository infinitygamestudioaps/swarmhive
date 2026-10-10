// Tests for the dashboard shape editor API (Dashboard/polyedit_api.js) + the manual guard of the generator tools (manual_guard.js,
// polyedit_safespots.js, zone_subareas.js). Everything runs on TEMP COPIES of the data files (never the live Scripts/data).
// Use: node docs/plan/tools/test_polyedit.js [--quick]     (--quick skips the slow child-process runs: safe spots + zone sub-areas)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const LIVE = path.join(ROOT, 'Scripts', 'data');
const QUICK = process.argv.includes('--quick');
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'polyedit_test_'));
const SET = path.join(SB, 'Settings'), LOGS = path.join(SB, 'Logs');
fs.mkdirSync(SET, { recursive: true }); fs.mkdirSync(LOGS, { recursive: true });
['dungeon_rooms.json', 'custom_zones.json', 'hunting_spots_h5.json', 'zone_subareas.json'].forEach(f => fs.copyFileSync(path.join(LIVE, f), path.join(SB, f)));
const liveStat = ['dungeon_rooms.json', 'custom_zones.json', 'hunting_spots_h5.json', 'zone_subareas.json'].map(f => [f, fs.statSync(path.join(LIVE, f)).mtimeMs]);
const G = require('./manual_guard');
const mk = (o = {}) => require(path.join(ROOT, 'Dashboard', 'polyedit_api.js'))({ DATA: SB, REF: LIVE, ROOT, LOGS, SETTINGS: SET, TOOLS: __dirname, noJobs: true, ...o });
let PE = mk();
const q = (o) => new URLSearchParams(o);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const rd = (f) => JSON.parse(fs.readFileSync(path.join(SB, f), 'utf8').replace(/^﻿/, ''));
const roomOf = (all, id) => { for (const d of all) for (const F of d.floors) for (const r of F.rooms || []) if (r.id === id) return r; return null; };
const tmpLeft = () => fs.readdirSync(SB).filter(n => n.endsWith('.tmp') || n.endsWith('.lock'));

console.log('sandbox', SB);
// ---------------------------------------------------------------------------------------------------------- validation
console.log('validation');
{
  const V = PE._t.validate, base = { name: 'x', levelMin: 10, levelMax: 20, center: [0, 0, 0], radius: 1000, shape: 'poly' };
  ok(V('zone', { ...base, poly: [[0, 0], [1000, 0]] }, {}).errors.some(e => /at least 3/.test(e)), 'fewer than 3 points refused');
  ok(V('zone', { ...base, poly: [[0, 0], [1000, 1000], [1000, 0], [0, 1000]] }, {}).errors.some(e => /crosses itself/.test(e)), 'bow-tie (self-intersection) refused');
  ok(V('zone', { ...base, poly: [[0, 0], [100, 0], [100, 100]] }, {}).errors.some(e => /too small/.test(e)), 'tiny shape refused');
  ok(V('room', { ...base, poly: [[0, 0], [50000, 0], [50000, 50000], [0, 50000]] }, {}).errors.some(e => /too big/.test(e)), 'huge room refused');
  ok(V('zone', { ...base, levelMin: 30, levelMax: 20, poly: [[0, 0], [1000, 0], [1000, 1000]] }, {}).errors.some(e => /levels/.test(e)), 'min > max level refused');
  ok(V('zone', { ...base, name: '  ', poly: [[0, 0], [1000, 0], [1000, 1000]] }, {}).errors.some(e => /name/.test(e)), 'empty name refused');
  ok(V('zone', { ...base, poly: [[0, 0], [1000, 0], [1000, 0], [0, 1000]] }, {}).errors.some(e => /on top of each other/.test(e)), 'duplicate neighbour points refused');
  ok(V('room', { ...base, center: [9000, 9000, 0], poly: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]] }, { center: [500, 500, 0] }).warnings.some(w => /centre is outside/.test(w)), 'room centre outside the outline = warning');
  ok(V('zone', { ...base, poly: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]] }, {}).errors.length === 0, 'a clean square passes');
  ok(V('zone', { ...base, shape: 'poly', poly: [[0, 0], [1000, 0], [1000, 1000]] }, { rooms: 'Cruma Tower' }).errors.some(e => /Rooms tab/.test(e)), 'a rooms-spot cannot get a polygon');
}
// ---------------------------------------------------------------------------------------------------------- room: get, save, format, history, guard fields
console.log('room save');
const RID = 'cruma-1-left-a';
let g = PE.handle('GET', q({ kind: 'room', id: RID }));
ok(g.code === 200 && g.body.item.shape === 'poly' && g.body.context.neighbours.length > 5 && g.body.context.spawns.length > 0, `GET room: ${g.body.item && g.body.item.poly.length} points, ${g.body.context && g.body.context.neighbours.length} neighbours, ${g.body.context && g.body.context.spawns.length} spawns`);
ok(g.body.context.stats.ownPct === 100, 'own monsters 100 % inside the generated outline');
const before = rd('dungeon_rooms.json');
// history pruning: 55 old fake copies -> at most 50 after the save
fs.mkdirSync(path.join(SB, 'history'), { recursive: true });
for (let i = 0; i < 55; i++) fs.writeFileSync(path.join(SB, 'history', `dungeon_rooms_2020-01-01T00-00-${String(i).padStart(2, '0')}-000Z.json`), '[]');
const it = JSON.parse(JSON.stringify(g.body.item));
it.poly[0] = [it.poly[0][0] - 250, it.poly[0][1] - 150]; it.levelMin = 41; it.notes = 'edited by test';
let s = PE.handle('POST', q({ kind: 'room', id: RID }), { rev: g.body.rev, item: it });
ok(s.code === 200 && s.body.ok, 'POST room saved' + (s.body.error ? ': ' + s.body.error : ''));
ok(s.body.changed.includes('poly') && s.body.changed.includes('levelRange') && s.body.changed.includes('notes'), 'changed fields reported: ' + (s.body.changed || []).join(','));
const raw = fs.readFileSync(path.join(SB, 'dungeon_rooms.json'), 'utf8');
ok(!raw.includes('\n') && raw.charCodeAt(0) === 91, 'dungeon_rooms.json still compact, no BOM');
const after = JSON.parse(raw), r1 = roomOf(after, RID);
ok(r1.manual === true && r1.edited && r1.edited.by === 'dashboard' && r1.edited.orig && r1.edited.orig.poly, 'room marked manual + edited.orig kept');
ok(r1.polyInfo.quality === 'manual' && r1.polyInfo.before && isFinite(r1.area) && r1.area > 0, 'polyInfo/area recomputed (quality manual)');
ok(r1.levelRange[0] === 41 && r1.notes === 'edited by test', 'simple fields written');
{ let other = 0; before.forEach((d, i) => d.floors.forEach((F, fi) => F.rooms.forEach((r, ri) => { if (r.id !== RID && JSON.stringify(r) !== JSON.stringify(after[i].floors[fi].rooms[ri])) other++; })));
  ok(other === 0, 'no other room changed'); }
ok(after[0].floors[0].safeSpotsStale && after[0].floors[0].safeSpotsStale.room === RID, 'floor marked "safe spots stale"');
ok(s.body.jobs && s.body.jobs[0] && s.body.jobs[0].type === 'safespots', 'safe-spot recompute job requested for the floor');
const hist = fs.readdirSync(path.join(SB, 'history')).filter(n => n.startsWith('dungeon_rooms_'));
ok(hist.length === 50 && !hist.some(n => n.startsWith('dungeon_rooms_2020-01-01T00-00-00')), `history kept to the last 50 (${hist.length})`);
ok(tmpLeft().length === 0, 'no .tmp / .lock files left');
// stale rev -> 409
let c = PE.handle('POST', q({ kind: 'room', id: RID }), { rev: g.body.rev, item: it });
ok(c.code === 409, 'save with an old rev = 409 conflict');
// invalid -> 400, file unchanged
const m0 = fs.statSync(path.join(SB, 'dungeon_rooms.json')).mtimeMs;
const bad = JSON.parse(JSON.stringify(s.body.item)); bad.poly = [[0, 0], [1000, 1000], [1000, 0], [0, 1000]];
c = PE.handle('POST', q({ kind: 'room', id: RID }), { rev: s.body.rev, item: bad });
ok(c.code === 400 && fs.statSync(path.join(SB, 'dungeon_rooms.json')).mtimeMs === m0, 'invalid shape = 400, file untouched');
// applyMonsters
const it2 = JSON.parse(JSON.stringify(s.body.item));
s = PE.handle('POST', q({ kind: 'room', id: RID }), { rev: s.body.rev, item: it2, applyMonsters: true });
ok(s.code === 200 && roomOf(rd('dungeon_rooms.json'), RID).monsters.length > 0, 'applyMonsters rebuilds the monster list');

// ---------------------------------------------------------------------------------------------------------- manual guard: a generator tool writing old data keeps the edit
console.log('manual guard (tools)');
{
  const toolData = JSON.parse(JSON.stringify(before));                    // what a tool read BEFORE the user's edit
  const tr = roomOf(toolData, RID); tr.poly = [[1, 1], [2, 2], [3, 1]]; tr.polyInfo = { quality: 'good' };    // and "recomputed"
  const other = toolData[0].floors[0].rooms.find(r => r.id !== RID); other.notes = 'tool changed this';
  const kept = G.writeGuarded(path.join(SB, 'dungeon_rooms.json'), toolData, 'room', { quiet: true });
  const now = rd('dungeon_rooms.json'), nr = roomOf(now, RID);
  ok(kept === 1 && nr.manual && nr.polyInfo.quality === 'manual' && nr.poly.length > 3, 'writeGuarded: the dashboard-edited room survives a tool write');
  ok(now[0].floors[0].rooms.find(r => r.id === other.id).notes === 'tool changed this', 'writeGuarded: the tool\'s own changes to other rooms are written');
  ok(!fs.readFileSync(path.join(SB, 'dungeon_rooms.json'), 'utf8').includes('\n'), 'writeGuarded keeps the compact format');
  // a tool that dropped the room entirely: it is put back
  const td2 = JSON.parse(JSON.stringify(now)); td2[0].floors[0].rooms = td2[0].floors[0].rooms.filter(r => r.id !== RID);
  G.writeGuarded(path.join(SB, 'dungeon_rooms.json'), td2, 'room', { quiet: true });
  ok(!!roomOf(rd('dungeon_rooms.json'), RID), 'writeGuarded: a manual room dropped by a tool is put back');
  // spots: name + original centre
  const spots = rd('hunting_spots_h5.json'), ms = JSON.parse(JSON.stringify(spots[5])); ms.manual = true; ms.edited = { by: 'dashboard', key: `${spots[5].center.x},${spots[5].center.y}` }; ms.radius = 1234;
  const gen = JSON.parse(JSON.stringify(spots)); G.mergeSpots(gen, [ms]); ok(gen[5].radius === 1234 && gen[5].manual, 'mergeSpots: matched by name + original centre');
  // sub-areas: manual entries kept
  const sa = rd('zone_subareas.json'), k0 = Object.keys(sa.zones)[0]; const disk = JSON.parse(JSON.stringify(sa)); disk.zones[k0].manual = true; disk.zones[k0].areas[0].x = 1;
  const genS = JSON.parse(JSON.stringify(sa)); G.mergeSubareas(genS, disk); ok(genS.zones[k0].areas[0].x === 1, 'mergeSubareas: manual entry kept');
  // static: every generator writes through the guard
  const src = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  ok(/MG\.isManual\(R\.r\)/.test(src('room_polys.js')) && /writeGuarded\(FILE, all, 'room'\)/.test(src('room_polys.js')), 'room_polys.js: skips manual rooms + guarded write');
  ok(/isProblem = \(r\) => \{ if \(MG\.isManual\(r\)\)/.test(src('room_refine.js')) && /writeGuarded\(FILE, all, 'room'\)/.test(src('room_refine.js')), 'room_refine.js: manual rooms are never problems + guarded write');
  ok(/writeGuarded\(FILE, all, 'room'\)/.test(src('safe_spots.js')), 'safe_spots.js: guarded write');
  ok(/writeGuarded\(`\$\{DATA\}\/hunting_spots_h5\.json`, out, 'spot'/.test(src('spots.js')), 'spots.js: guarded write');
  ok(/writeGuarded\(file, \{ generated/.test(src('zone_subareas.js')), 'zone_subareas.js: guarded write');
  const fa = path.join(__dirname, 'field_areas.js');
  if (fs.existsSync(fa) && /manual_guard/.test(fs.readFileSync(fa, 'utf8'))) ok(true, 'field_areas.js: guarded write (manual_guard)');
  else if (fs.existsSync(fa)) console.log('  TODO field_areas.js (another agent\'s file, not edited here) writes with fs.writeFileSync — replace it by require(\'./manual_guard\').writeGuarded(FILE, out, \'area\')');
  else console.log('  --   field_areas.js does not exist yet (being written by another agent) — must use manual_guard.writeGuarded(file, data, \'area\')');
}

// ---------------------------------------------------------------------------------------------------------- reset
console.log('reset');
{
  g = PE.handle('GET', q({ kind: 'room', id: RID }));
  const rs = PE.handle('POST', q({ action: 'reset', kind: 'room', id: RID }), { rev: g.body.rev });
  const rr = roomOf(rd('dungeon_rooms.json'), RID), orig = roomOf(before, RID);
  ok(rs.code === 200 && !rr.manual && !rr.edited && JSON.stringify(rr.poly) === JSON.stringify(orig.poly) && JSON.stringify(rr.levelRange) === JSON.stringify(orig.levelRange), 'reset restores the generated outline + fields, manual mark removed');
  ok(rr.polyInfo.quality === orig.polyInfo.quality, 'reset restores polyInfo');
}

// ---------------------------------------------------------------------------------------------------------- zone
console.log('zone save');
{
  const ZN = 'Abandoned Camp (route 20-40)';
  const z0 = fs.readFileSync(path.join(SB, 'custom_zones.json'), 'utf8');
  g = PE.handle('GET', q({ kind: 'zone', id: ZN }));
  ok(g.code === 200 && g.body.item.shape === 'circle' && g.body.context.effSquare, 'GET zone (circle) + today\'s hunting square');
  // circle edit -> radius / centre, sub-area job requested
  let zi = JSON.parse(JSON.stringify(g.body.item)); zi.radius = 2500; zi.center = [zi.center[0] + 100, zi.center[1], zi.center[2]];
  s = PE.handle('POST', q({ kind: 'zone', id: ZN }), { rev: g.body.rev, item: zi });
  const zz = rd('custom_zones.json').find(z => z.name === ZN);
  ok(s.code === 200 && zz.radius === 2500 && zz.x === g.body.item.center[0] + 100 && !zz.poly, 'circle zone: centre + radius saved, stays a circle');
  ok(s.body.jobs.some(j => j.type === 'subareas'), 'circle change requests the zone sub-area recompute');
  const txt = fs.readFileSync(path.join(SB, 'custom_zones.json'), 'utf8');
  ok(G.formatOf(txt).indent === G.formatOf(z0).indent && G.formatOf(txt).bom === G.formatOf(z0).bom, `custom_zones.json keeps its format (indent ${G.formatOf(txt).indent}, BOM ${G.formatOf(txt).bom})`);
  // to polygon
  zi = JSON.parse(JSON.stringify(s.body.item)); const [cx, cy] = zi.center;
  zi.shape = 'poly'; zi.poly = [[cx - 3000, cy - 2000], [cx + 3000, cy - 2500], [cx + 3500, cy + 2000], [cx - 2500, cy + 3000]];
  s = PE.handle('POST', q({ kind: 'zone', id: ZN }), { rev: s.body.rev, item: zi });
  const zp = rd('custom_zones.json').find(z => z.name === ZN);
  ok(s.code === 200 && zp.poly.length === 4 && zp.poly[0].x === cx - 3000 && zp.manual === true, 'zone polygon saved as [{x,y}] + manual');
  ok(zp.x === Math.round(zi.poly.reduce((t, p) => t + p[0], 0) / 4) && zp.radius > 3000, 'zone centre/radius recomputed from the corners (like POST /api/zones)');
  ok(zp.zmap && fs.existsSync(path.join(SET, zp.zmap.replace(/\\/g, '/'))), 'L2Swarm .zmap written (sandbox Settings): ' + zp.zmap);
  // rename collision
  const other = rd('custom_zones.json').find(z => z.name !== ZN);
  zi = JSON.parse(JSON.stringify(s.body.item)); zi.name = other.name;
  c = PE.handle('POST', q({ kind: 'zone', id: ZN }), { rev: s.body.rev, item: zi });
  ok(c.code === 400 && /already has this name/.test(c.body.error), 'rename onto an existing zone name refused');
  // a rooms-spot: levels/on-off only
  const rz = rd('custom_zones.json').find(z => z.rooms);
  g = PE.handle('GET', q({ kind: 'zone', id: rz.name })); zi = JSON.parse(JSON.stringify(g.body.item)); zi.enabled = false;
  s = PE.handle('POST', q({ kind: 'zone', id: rz.name }), { rev: g.body.rev, item: zi });
  ok(s.code === 200 && rd('custom_zones.json').find(z => z.name === rz.name).enabled === false && !s.body.jobs.length, 'rooms-spot: switched off, no sub-area job');
}

// ---------------------------------------------------------------------------------------------------------- datapack spot
console.log('datapack spot');
{
  g = PE.handle('GET', q({ kind: 'spot', id: '5' }));
  ok(g.code === 200 && g.body.context.hull && g.body.item.shape === 'circle', 'GET spot: circle + monster hull for "Make polygon"');
  const si = JSON.parse(JSON.stringify(g.body.item)); si.shape = 'poly'; si.poly = g.body.context.hull;
  s = PE.handle('POST', q({ kind: 'spot', id: '5' }), { rev: g.body.rev, item: si });
  const sp = rd('hunting_spots_h5.json')[5];
  ok(s.code === 200 && sp.poly.length === si.poly.length && sp.poly[0].x === si.poly[0][0] && sp.manual && sp.edited.key, 'spot polygon saved ([{x,y}], the format swarm.js uses for spot.poly) + edited.key');
  ok(isFinite(sp.radius) && sp.radius > 0 && sp.hull.length > 0, 'spot radius from the corners, generator hull kept');
}

// ---------------------------------------------------------------------------------------------------------- field area (fake file, generic formats)
console.log('field area');
{
  fs.writeFileSync(path.join(SB, 'field_areas.json'), JSON.stringify({ generated: 'test', areas: [{ id: 'fa-1', name: 'Test field', levelRange: [20, 25], center: [-49448, 146406, -3339], poly: [[-50448, 145406], [-48448, 145406], [-48448, 147406], [-50448, 147406]] }] }, null, 2));
  PE = mk();
  g = PE.handle('GET', q({ kind: 'area', id: 'fa-1' }));
  ok(g.code === 200 && g.body.item.shape === 'poly' && g.body.item.levelMin === 20, 'GET area from { areas: [...] } with levelRange');
  const ai = JSON.parse(JSON.stringify(g.body.item)); ai.poly[0] = [-50648, 145206]; ai.levelMax = 27;
  s = PE.handle('POST', q({ kind: 'area', id: 'fa-1' }), { rev: g.body.rev, item: ai });
  const fa = rd('field_areas.json'), a = fa.areas[0], ft = fs.readFileSync(path.join(SB, 'field_areas.json'), 'utf8');
  ok(s.code === 200 && Array.isArray(a.poly[0]) && a.poly[0][0] === -50648 && a.levelRange[1] === 27 && a.manual && G.formatOf(ft).indent === 2, 'area saved in its own formats ([[x,y]], levelRange, indent 2)');
  const L = PE.handle('GET', q({ list: 'room,zone,spot,area' })).body;
  ok(L.room.length > 800 && L.zone.length > 10 && L.spot.length > 300 && L.area.length === 1 && L.areaFile, `lists: ${L.room.length} rooms, ${L.zone.length} zones, ${L.spot.length} spots, ${L.area.length} areas`);
  // the real format of docs/plan/tools/field_areas.js: { regions: [{ id, name, safeSpots, areas: [{ id, poly [[x,y]], zRange, levelRange, suitsPartyLevel, monsters, polyInfo }] }] }, compact
  const area = (id, dx) => ({ id, n: 1, name: 'Abandoned Camp ' + id, center: [-49448 + dx, 146406, -3339], radius: 1500, poly: [[-50448 + dx, 145406], [-48448 + dx, 145406], [-48448 + dx, 147406], [-50448 + dx, 147406]], zRange: [-3600, -3100],
    area: 4000000, levelRange: [20, 24], suitsPartyLevel: [22, 27], monsters: [{ id: 20058, name: 'Ol Mahum Guard', level: 20, count: 4, aggressive: false }], polyInfo: { method: 'geodata', quality: 'good' } });
  fs.writeFileSync(path.join(SB, 'field_areas.json'), JSON.stringify({ generated: 'test', regions: [{ id: 'abandoned-camp', name: 'Abandoned Camp', safeSpots: [{ id: 'abandoned-camp-safe-1', x: -47000, y: 146000, z: -3400, tier: 'safe' }], areas: [area('abandoned-camp-1', 0), area('abandoned-camp-2', 4000)] }], zones: {} }));
  PE = mk();
  g = PE.handle('GET', q({ kind: 'area', id: 'abandoned-camp-1' }));
  ok(g.code === 200 && g.body.item.suitsMin === 22 && g.body.item.zMin === -3600 && g.body.context.safeSpots.length === 1 && g.body.context.neighbours.some(n => n.id === 'abandoned-camp-2'), 'GET area (regions format): suits, height band, region safe spots, the other area as neighbour');
  const ri = JSON.parse(JSON.stringify(g.body.item)); ri.poly[1] = [-48248, 145206]; ri.suitsMax = 28;
  s = PE.handle('POST', q({ kind: 'area', id: 'abandoned-camp-1' }), { rev: g.body.rev, item: ri });
  const fr = rd('field_areas.json'), a1 = fr.regions[0].areas[0], frt = fs.readFileSync(path.join(SB, 'field_areas.json'), 'utf8');
  ok(s.code === 200 && a1.poly[1][0] === -48248 && a1.suitsPartyLevel[1] === 28 && a1.polyInfo.quality === 'manual' && a1.manual && fr.regions[0].safeSpotsStale && !frt.includes('\n'), 'area saved (regions format, compact), polyInfo manual, region safe spots marked stale');
  // a field_areas.js run that read the file before the edit: the edit survives the guarded write
  const toolOut = { generated: 'tool', regions: [{ id: 'abandoned-camp', name: 'Abandoned Camp', safeSpots: [], areas: [area('abandoned-camp-1', 0), area('abandoned-camp-2', 4000)] }], zones: {} };
  G.writeGuarded(path.join(SB, 'field_areas.json'), toolOut, 'area', { quiet: true });
  const fr2 = rd('field_areas.json');
  ok(fr2.generated === 'tool' && fr2.regions[0].areas[0].manual && fr2.regions[0].areas[0].poly[1][0] === -48248, 'writeGuarded(area): a field_areas.js write keeps the dashboard-edited area');
}

// ---------------------------------------------------------------------------------------------------------- geodata
console.log('geodata check');
{
  const r = PE.handle('POST', q({ action: 'geocheck' }), { points: [[14560, 117039], [15000, 117039], [15000, 117500]], band: [-12235, -11885] });
  ok(r.code === 200 && r.body.points.every(p => p.ok === true) && r.body.edges.length === 3, 'points inside the Cruma Catherok room are walkable');
  const r2 = PE.handle('POST', q({ action: 'geocheck' }), { points: [[14560, 117039], [14560, 117039 + 4000], [12000, 117039]], band: [-12235, -11885] });
  ok(r2.code === 200 && (r2.body.points.some(p => p.ok === false) || r2.body.edges.some(e => e === false)), 'a shape reaching into the rock gets a warning');
  const sn = r2.body.points.find(p => p.ok === false && p.snap); console.log('       (snap example: ' + JSON.stringify(sn || r2.body.points) + ')');
}

// ---------------------------------------------------------------------------------------------------------- child processes (slow): safe spots of one floor, zone sub-areas
if (!QUICK) {
  console.log('child processes (safe spots of one floor, zone sub-areas)');
  // edit a room again so it is manual, then run the floor's safe-spot recompute AND save another room while it runs
  PE = mk();
  g = PE.handle('GET', q({ kind: 'room', id: RID })); const ri = JSON.parse(JSON.stringify(g.body.item)); ri.poly[0] = [ri.poly[0][0] - 200, ri.poly[0][1] - 100];
  s = PE.handle('POST', q({ kind: 'room', id: RID }), { rev: g.body.rev, item: ri });
  const env = { ...process.env, POLYEDIT_DATA: SB, POLYEDIT_REF: LIVE };
  const t0 = Date.now();
  const child = cp.spawn(process.execPath, [path.join(__dirname, 'polyedit_safespots.js'), '--dungeon', 'Cruma Tower', '--floor', '0'], { env });
  let out = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d);
  // meanwhile: another room of the same floor
  const R2 = 'cruma-1-left-b';
  const g2 = PE.handle('GET', q({ kind: 'room', id: R2 })), i2 = JSON.parse(JSON.stringify(g2.body.item)); i2.notes = 'edited while the safe spots ran';
  const s2 = PE.handle('POST', q({ kind: 'room', id: R2 }), { rev: g2.body.rev, item: i2 });
  child.on('exit', (cd) => {
    const all = rd('dungeon_rooms.json'), F = all.find(d => d.name === 'Cruma Tower').floors[0];
    ok(cd === 0 && /safe spots/.test(out), `polyedit_safespots.js finished in ${Math.round((Date.now() - t0) / 1000)} s: ${out.trim().split('\n').pop()}`);
    ok(!F.safeSpotsStale && Array.isArray(F.safeSpots) && F.safeSpots.length > 0, 'floor safe spots rewritten, stale mark removed');
    ok(roomOf(all, RID).manual && JSON.stringify(roomOf(all, RID).poly) === JSON.stringify(ri.poly), 'the manual room outline is untouched');
    ok(s2.code === 200 && roomOf(all, R2).notes === 'edited while the safe spots ran', 'an edit saved while the child ran is not lost');
    ok(tmpLeft().length === 0, 'no .tmp / .lock files left');
    // zone sub-areas with a manual entry
    const sa = rd('zone_subareas.json'); sa.zones['1,1'] = { zones: ['hand made'], center: { x: 1, y: 1, z: 0 }, radius: 1500, areas: [{ x: 1, y: 1, z: 0, mobs: 9, lvl: [1, 2] }], manual: true };
    fs.writeFileSync(path.join(SB, 'zone_subareas.json'), JSON.stringify(sa, null, 1));
    const t1 = Date.now();
    const z = cp.spawnSync(process.execPath, [path.join(__dirname, 'zone_subareas.js')], { env, encoding: 'utf8', timeout: 600000 });
    const sa2 = rd('zone_subareas.json');
    ok(z.status === 0 && sa2.zones['1,1'] && sa2.zones['1,1'].manual && sa2.generated !== sa.generated, `zone_subareas.js (${Math.round((Date.now() - t1) / 1000)} s) rewrote the file and kept the manual entry`);
    ok(sa2.zones[`${rd('custom_zones.json').find(x => x.name === 'Abandoned Camp (route 20-40)').x},${rd('custom_zones.json').find(x => x.name === 'Abandoned Camp (route 20-40)').y}`] === undefined, 'the zone that now has a polygon is no longer split (sub-areas are for plain circles)');
    finish();
  });
} else finish();

function finish() {
  const touched = liveStat.filter(([f, m]) => fs.statSync(path.join(LIVE, f)).mtimeMs !== m).map(([f]) => f);
  console.log(touched.length ? `  NOTE live files changed during the run (by someone else? the test writes only the sandbox): ${touched.join(', ')}` : '  ok   the LIVE data files were not touched');
  console.log(`\n${pass} passed, ${fail} failed  (sandbox ${SB})`);
  if (!fail) try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  process.exitCode = fail ? 1 : 0;
}
