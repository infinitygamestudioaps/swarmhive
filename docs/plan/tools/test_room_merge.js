// ROOMMERGE-2026-10-22: combine rooms (Dashboard/roommerge.js + POST /api/polyedit?action=merge in Dashboard/polyedit_api.js) on a SCRATCH copy of
// Scripts/data/dungeon_rooms.json + made-up party_spots.json / party_plans.json in a temp folder (the real files are never written; jobs off).
//   node docs/plan/tools/test_room_merge.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const REAL = path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'), real0 = fs.statSync(REAL).mtimeMs;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'roommerge-')), DATA = path.join(TMP, 'data'); fs.mkdirSync(DATA, { recursive: true });
fs.copyFileSync(REAL, path.join(DATA, 'dungeon_rooms.json'));
const D0 = JSON.parse(fs.readFileSync(REAL, 'utf8').replace(/^﻿/, '')), dlist = D0.dungeons || D0;
const cr = dlist.find(d => d.name === 'Cruma Tower'), F0 = cr.floors[0];
// two touching rooms on floor 1 (bounding boxes within 40 units)
const R = F0.rooms.filter(r => r.poly && r.poly.length >= 3);
const bb = (r) => { const xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
let A = null, B = null;
for (let i = 0; i < R.length && !A; i++) for (let j = i + 1; j < R.length && !A; j++) { const a = bb(R[i]), b = bb(R[j]); if (a[0] <= b[2] + 40 && b[0] <= a[2] + 40 && a[1] <= b[3] + 40 && b[1] <= a[3] + 40) { A = R[i]; B = R[j]; } }
t('found two touching rooms on Cruma floor 1', !!A, A && [A.id, B.id]);
const far = R.find(r => { const a = bb(A), b = bb(r); return r !== A && (b[0] > a[2] + 3000 || a[0] > b[2] + 3000); });
fs.writeFileSync(path.join(DATA, 'party_spots.json'), JSON.stringify({ _updated: 'x', Crafter1: { mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: A.id, roomIds: [A.id, B.id], order: 'nearest' }, Destroyer3: { mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: B.id } }, null, 1));
fs.writeFileSync(path.join(DATA, 'party_plans.json'), JSON.stringify({ plans: { Tank1: { steps: [{ kind: 'level', spot: { mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: B.id } }] } } }, null, 1));
const PE = require(path.join(ROOT, 'Dashboard', 'polyedit_api.js'))({ DATA, ROOT: TMP, LOGS: TMP, SETTINGS: TMP, TOOLS: __dirname, noJobs: true });
const M = require(path.join(ROOT, 'Dashboard', 'roommerge.js'));
// ---- refusal: rooms far apart ----
const q = (o) => ({ get: (k) => o[k] === undefined ? null : o[k] });
const r1 = PE.handle('POST', q({ action: 'merge' }), { ids: [A.id, far.id] });
t('rooms far apart -> refused with a plain sentence (nothing written)', r1.code === 400 && /do not touch/.test(r1.body.error) && /units apart/.test(r1.body.error), r1.body);
t('one room only -> refused', PE.handle('POST', q({ action: 'merge' }), { ids: [A.id] }).code === 400);
const otherFloor = cr.floors[1].rooms[0];
t('rooms on different floors -> refused', /same floor/.test((PE.handle('POST', q({ action: 'merge' }), { ids: [A.id, otherFloor.id] }).body || {}).error || ''));
t('a refusal writes no history', !fs.existsSync(path.join(DATA, 'history')) || fs.readdirSync(path.join(DATA, 'history')).length === 0);
// ---- merge ----
const r = PE.handle('POST', q({ action: 'merge' }), { ids: [A.id, B.id], name: 'Big room' });
t('merge -> 200 ok, keeps the first id', r.code === 200 && r.body.ok && r.body.id === A.id, r.body.error);
const D1 = JSON.parse(fs.readFileSync(path.join(DATA, 'dungeon_rooms.json'), 'utf8').replace(/^﻿/, '')), d1 = (D1.dungeons || D1).find(d => d.name === 'Cruma Tower');
const K = d1.floors[0].rooms.find(x => x.id === A.id), X = d1.floors[0].rooms.find(x => x.id === B.id);
const inP = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const area = (P) => { let s = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]); return Math.abs(s / 2); };
// union check: sample points inside A or B must be inside the new outline (except right at the edge: 2-cell tolerance by sampling the inner grid)
let inside = 0, miss = 0;
[A, B].forEach(rm => { const b = bb(rm); for (let x = b[0]; x <= b[2]; x += 64) for (let y = b[1]; y <= b[3]; y += 64) { if (!inP(x, y, rm.poly)) continue; const edge = rm.poly.some((p, i) => { const q2 = rm.poly[(i + 1) % rm.poly.length], L = Math.hypot(q2[0] - p[0], q2[1] - p[1]) || 1; const tt = Math.max(0, Math.min(1, ((x - p[0]) * (q2[0] - p[0]) + (y - p[1]) * (q2[1] - p[1])) / (L * L))); return Math.hypot(x - (p[0] + tt * (q2[0] - p[0])), y - (p[1] + tt * (q2[1] - p[1]))) < 48; }); if (edge) continue; if (inP(x, y, K.poly)) inside++; else miss++; } });
t('union: every inner point of both rooms is inside the combined outline', inside > 20 && miss <= Math.ceil(inside * 0.01), { inside, miss });
const aU = area(K.poly), aA = area(A.poly), aB = area(B.poly);
t('union: area ~ both rooms together (not a convex hull, not one room)', aU >= Math.max(aA, aB) * 1.05 && aU <= (aA + aB) * 1.25, { aU, aA, aB });
t('combined room: name, manual, polyInfo.merged, edited.orig kept, levels merged', K.name === 'Big room' && K.manual === true && JSON.stringify(K.polyInfo.merged) === JSON.stringify([A.id, B.id]) && K.edited && K.edited.orig && K.edited.orig.poly && K.levelRange[0] === Math.min(A.levelRange[0], B.levelRange[0]) && K.levelRange[1] === Math.max(A.levelRange[1], B.levelRange[1]));
t('absorbed room: switched off, mergedInto, manual (a generator keeps it)', X.enabled === false && X.mergedInto === A.id && X.manual === true);
t('history copy written', fs.readdirSync(path.join(DATA, 'history')).some(f => /dungeon_rooms/.test(f)));
const S = JSON.parse(fs.readFileSync(path.join(DATA, 'party_spots.json'), 'utf8'));
t('party_spots: roomIds remapped + deduped (2 rooms -> the combined one: back to the single-room format)', S.Crafter1.roomId === A.id && !S.Crafter1.roomIds, S.Crafter1);
t('party_spots: another party\'s roomId remapped', S.Destroyer3.roomId === A.id);
const P = JSON.parse(fs.readFileSync(path.join(DATA, 'party_plans.json'), 'utf8'));
t('party_plans: a plan step room remapped', P.plans.Tank1.steps[0].spot.roomId === A.id);
t('remapped counts reported', r.body.remapped['party_spots.json'] === 2 && r.body.remapped['party_plans.json'] === 1, r.body.remapped);
t('room graph rebuild started (skipped in the sandbox)', Array.isArray(r.body.jobs) && r.body.jobs.length === 1 && r.body.jobs[0].type === 'roomgraph' && /sandbox/.test(r.body.jobs[0].skipped), r.body.jobs);
t('merging an absorbed room again -> refused', /already combined/.test((PE.handle('POST', q({ action: 'merge' }), { ids: [B.id, A.id] }).body || {}).error || ''));
// ---- a generator run keeps it (manual_guard) ----
const G = require('./manual_guard.js');
const gen = JSON.parse(JSON.stringify(dlist));                                   // the generator's fresh rooms (no merge)
G.mergeRooms(gen, D1.dungeons || D1);
const g0 = gen.find(d => d.name === 'Cruma Tower').floors[0].rooms;
t('manual_guard: after a generator run the combined outline stays', JSON.stringify(g0.find(x => x.id === A.id).poly) === JSON.stringify(K.poly));
t('manual_guard: the absorbed room stays switched off with mergedInto', g0.find(x => x.id === B.id).enabled === false && g0.find(x => x.id === B.id).mergedInto === A.id);
// ---- other places that follow the alias ----
const SW = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8'), RG = fs.readFileSync(path.join(__dirname, 'room_graph.js'), 'utf8'), SV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), IX = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
t('swarm.js roomById follows mergedInto (old ids in orders / claims find the combined room)', /function roomById\(id, depth\)[^\n]*r\.mergedInto && r\.mergedInto !== id/.test(SW));
t('room_graph.js skips absorbed rooms', RG.includes('&& !r.mergedInto);'));
t('/api/dungeonmap passes mergedInto (the map hides absorbed rooms)', SV.includes('mergedInto: r.mergedInto || undefined') && IX.includes('if (!r.center || r.mergedInto) return;'));
t('the page: "Combine into one room" + restart notice + "Change shape" through /api/polyedit', IX.includes('data-spmmerge') && IX.includes('available after the next dashboard restart') && IX.includes("api('/api/polyedit?kind=room&id='"));
t('the real dungeon_rooms.json was not touched', fs.statSync(REAL).mtimeMs === real0);
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
