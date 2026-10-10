// TOWN STREET GRAPHS (user 2026-10-09 10:10: "The same thing you did with all dungeons and paths with the lines, I want the same done with ALL
// TOWNS, so each character always knows how to find each NPC in all towns.")
//
// Per town / village: the walkable geodata of the town area (buildings and walls block; room_polys.js buildFloor flood fill from the arrival
// points and every NPC), the street CENTRELINE network between: the arrival points (.townname / gatekeeper landing / the town's respawn points),
// the walkable cell in front of EVERY NPC of the town (npc_atlas.json place.town) and spine points along the streets/plazas (farthest-point
// sampling, pulled onto the middle line). Edges = clearance-weighted Dijkstra paths (1 + 200/(1+clearance)^2: the middle of the street) cut
// into straight wall-checked legs <= 280 (room_graph.js legs()), each vertex joined to its KEEP cheapest neighbours + a spanning tree.
// Output: Scripts/data/town_graph/<key>.json  { town, key, built, z: [lo, hi], arrive: [ids], v: [[id,x,y,z,kind,ref]], e: [[a,b,len,cost,[x,y,z,...]]],
//         npcs: { "<npcId>@<x>,<y>": vertex }, unreachable: [{ id, name, why }] }  + Scripts/data/town_graph/index.json
//         docs/plan/town_graphs/<key>_meta.json + _overlay.png (render: render_room_checks.ps1 -Dir docs\plan\town_graphs) + index.html
//         docs/plan/town_graphs/report.json (per town: NPCs reachable / unreachable + why; Giran: computed vs the recorded routes)
//   node docs/plan/tools/town_graph.js [--only giran,dion]
// swarm.js loads a town graph as a one-floor pseudo dungeon (townGraphD) and walks it with the same rgPlan / rgWalk as the dungeons.
'use strict';
const fs = require('fs'), path = require('path');
const RP = require('./room_polys'), RGx = require('./room_graph');
const ROOT = path.join(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data');
const OUTD = path.join(DATA, 'town_graph'), IMG = path.join(ROOT, 'docs', 'plan', 'town_graphs');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const argv = process.argv.slice(2), only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const CELL = 16, KEEP = 14, KNN = 18, SPINE = 450, MAXSPINE = 600;
const { legs, nb8, Heap, cellXY } = RGx;
const TOWNS = [
  ['talkingisland', 'Talking Island', -84318, 244579, 'talking_island_town'], ['elven', 'Elven Village', 46951, 51550, 'elf_town'], ['darkelf', 'Dark Elf Village', 9745, 15606, 'darkelf_town'],
  ['orc', 'Orc Village', -45158, -112583, 'orc_town'], ['dwarven', 'Dwarven Village', 115120, -178224, 'dwarf_town'], ['kamael', 'Kamael Village', -117251, 46771, 'kamael_town'],
  ['gludin', 'Gludin', -80684, 149770, 'gludin_town'], ['gludio', 'Gludio', -12787, 122779, 'gludio_castle_town'], ['dion', 'Dion', 15472, 142880, 'dion_castle_town'],
  ['giran', 'Giran', 83473, 148554, 'giran_castle_town'], ['oren', 'Oren', 82956, 53162, 'oren_castle_town'], ['aden', 'Aden', 146331, 25762, 'aden_town'],
  ['hunters', 'Hunters Village', 116819, 76994, 'hunter_town'], ['heine', 'Heine', 111455, 219400, 'heiness_town'], ['goddard', 'Goddard', 148024, -55281, 'godard_town'],
  ['rune', 'Rune', 43835, -47749, 'rune_town'], ['schuttgart', 'Schuttgart', 87126, -143520, 'town_of_schuttgart'], ['floran', 'Floran', 17838, 170274, 'floran_town']];
const A = rd(path.join(DATA, 'npc_atlas.json'), { npcs: [] });
const geo = require('./geopath');
function respawns(file) {
  try { const x = fs.readFileSync(path.join(DATA, 'dp', 'mapregion', file + '.xml'), 'utf8'); const out = []; const re = /<respawnPoint X="(-?\d+)" Y="(-?\d+)" Z="(-?\d+)"\s*\/>/g; let m; while ((m = re.exec(x))) out.push({ x: +m[1], y: +m[2], z: +m[3] }); return out; } catch (e) { return []; }
}
function zAt(x, y, zHint) { const L = geo.layers(geo.toGeoX(x), geo.toGeoY(y)) || []; let b = null; L.forEach(l => { if (!b || Math.abs(l.h - zHint) < Math.abs(b.h - zHint)) b = l; }); return b ? b.h : zHint; }

function buildTown(T) {
  const [key, name, lx, ly, xml] = T;
  const npcs = A.npcs.filter(n => n.place && n.place.town === name);
  const landing = { x: lx, y: ly, z: zAt(lx, ly, npcs.length ? npcs.reduce((s, n) => s + n.z, 0) / npcs.length : -3000) };
  const rsp = respawns(xml).slice(0, 4);
  const pts = [landing].concat(rsp).concat(npcs.map(n => ({ x: n.x, y: n.y, z: n.z })));
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), zs = pts.map(p => p.z);
  const box = [Math.min(...xs) - 1500, Math.max(...xs) + 1500, Math.min(...ys) - 1500, Math.max(...ys) + 1500];
  const zBand = [Math.min(...zs) - 500, Math.max(...zs) + 500];
  const G = RP.buildFloor(box, zBand, pts);
  RGx.symmetrize(G);                                   // two-way steps only (one-way NSWE edges next to walls broke 21 legs)
  const CLR = RP.clearance(G);
  const W = new Uint16Array(G.n); for (let i = 0; i < G.n; i++) if (G.OK[i]) { const c = CLR[i] / 10; W[i] = Math.min(60000, Math.round(10 * (1 + 200 / ((1 + c) * (1 + c))))); }
  const snap = (p, r) => RGx.snapCell(G, p, r || 14);
  // component of the main arrival point: what is reachable on foot
  const comp = new Int32Array(G.n).fill(-1); let nc = 0; const q = new Int32Array(G.n);
  for (let s = 0; s < G.n; s++) { if (!G.OK[s] || comp[s] >= 0) continue; let h = 0, t = 0; q[t++] = s; comp[s] = nc; while (h < t) { const i = q[h++]; for (let k = 0; k < 4; k++) { const j = RP.nbOpen(G, i, k); if (j >= 0 && comp[j] < 0) { comp[j] = nc; q[t++] = j; } } } nc++; }
  const V = [], unreachable = [], npcV = {}; const out0 = {};
  const addV = (id, cell, kind, ref) => { const [x, y] = cellXY(G, cell); V.push({ id, x: Math.round(x), y: Math.round(y), z: G.H[cell], cell, kind, ref }); return V.length - 1; };
  const lc = snap(landing, 30); if (lc < 0) return { key, name, error: 'the arrival point is not on walkable geodata' };
  const main = comp[lc];
  addV('arrive', lc, 'arrive', name + ' arrival');
  rsp.forEach((p, i) => { const c = snap(p, 20); if (c >= 0 && comp[c] === main) addV('respawn' + i, c, 'arrive', 'respawn point'); });
  // HOUSES + DOORS (user 2026-10-09 10:15: "NPCs that most of the time stand INSIDE a house, so the path should go in via the doorway"):
  // cut the walkable floor at clearance >= HT cells: openings narrower than ~2*HT*16 (doors) fall away, so every house interior becomes its own
  // piece; the biggest piece = the streets. Grown back by HT+2 cells, the place where an interior piece meets another piece = its DOOR (a door
  // node in the middle of the opening: the cell with the most clearance). An interior without such a meeting place = no door found (joined by
  // stairs / another height only) -> reported.
  const HT = 4, LBL = new Int32Array(G.n).fill(-1), area = [];
  { let lab = 0; for (let s0 = 0; s0 < G.n; s0++) { if (!G.OK[s0] || comp[s0] !== main || CLR[s0] < HT * 10 || LBL[s0] >= 0) continue; let h = 0, t = 0; q[t++] = s0; LBL[s0] = lab;
      while (h < t) { const i = q[h++]; for (let k = 0; k < 4; k++) { const j = RP.nbOpen(G, i, k); if (j >= 0 && LBL[j] < 0 && comp[j] === main && CLR[j] >= HT * 10) { LBL[j] = lab; q[t++] = j; } } } area.push(t); lab++; } }
  const street = area.indexOf(Math.max(...area.concat([0])));
  { const DG = new Int32Array(G.n).fill(-1); let h = 0, t = 0; for (let i = 0; i < G.n; i++) if (LBL[i] >= 0) { DG[i] = 0; q[t++] = i; }
    while (h < t) { const i = q[h++]; if (DG[i] > HT + 2) continue; for (let k = 0; k < 4; k++) { const j = RP.nbOpen(G, i, k); if (j >= 0 && LBL[j] < 0 && comp[j] === main) { LBL[j] = LBL[i]; DG[j] = DG[i] + 1; q[t++] = j; } } } }
  const isHouse = (l) => l >= 0 && l !== street && area[l] >= 20 && area[l] <= 25000;
  const doorsOf = {}, pairs = new Map();
  for (let i = 0; i < G.n; i++) { const a = LBL[i]; if (!isHouse(a)) continue; for (let k = 0; k < 4; k++) { const j = RP.nbOpen(G, i, k); if (j < 0) continue; const b = LBL[j]; if (b < 0 || b === a) continue; const key2 = a + ',' + b; (pairs.get(key2) || pairs.set(key2, []).get(key2)).push(i); } }
  pairs.forEach((cells, key2) => {
    const [a, b] = key2.split(',').map(Number), pts = cells.map(i => ({ i, x: i % G.w, y: (i / G.w) | 0, c: -1 })); let nc2 = 0;
    for (let s0 = 0; s0 < pts.length; s0++) { if (pts[s0].c >= 0) continue; const st = [s0]; pts[s0].c = nc2; while (st.length) { const u = pts[st.pop()]; pts.forEach((v2, t2) => { if (v2.c < 0 && Math.abs(v2.x - u.x) <= 3 && Math.abs(v2.y - u.y) <= 3) { v2.c = nc2; st.push(t2); } }); } nc2++; }
    for (let c = 0; c < nc2; c++) { const P = pts.filter(p => p.c === c); if (P.length < 2) continue; let bp = P[0]; P.forEach(p => { if (CLR[p.i] > CLR[bp.i]) bp = p; });
      const vi = addV(`door${a}_${b}_${c}`, bp.i, 'door', `house ${a} -> ${b === street ? 'street' : 'house ' + b}`); (doorsOf[a] = doorsOf[a] || []).push(vi); if (isHouse(b)) (doorsOf[b] = doorsOf[b] || []).push(vi); }
  });
  const indoor = [];
  npcs.forEach(n => {
    // the NPC's FRONT: on the NPC's side of the wall / counter — the walkable cell of the SAME piece (house / street) as the cell the NPC stands
    // on (or next to), same level (|dz| <= 120), nearest; else the nearest walkable cell within ~250 (talk range)
    let best = -1, bd = 1e9; const cx = Math.floor((n.x + 294912) / CELL) - G.gx0, cy = Math.floor((n.y + 262144) / CELL) - G.gy0;
    const own = (() => { for (let r = 0; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= G.w || y >= G.h) continue; const i = y * G.w + x; if (G.OK[i] && comp[i] === main && Math.abs(G.H[i] - n.z) <= 120) return i; } return -1; })();
    const want = own >= 0 ? LBL[own] : -2;
    for (let pass = 0; pass < 2 && best < 0; pass++) for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= G.w || y >= G.h) continue; const i = y * G.w + x;
      if (!G.OK[i] || comp[i] !== main || Math.abs(G.H[i] - n.z) > (pass ? 250 : 120) || (pass === 0 && want !== -2 && LBL[i] !== want)) continue; const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = i; } }
    if (best >= 0 && isHouse(LBL[best])) indoor.push({ n, house: LBL[best], doors: (doorsOf[LBL[best]] || []).length });
    const k = `${n.id}@${n.x},${n.y}`;
    if (best < 0) { unreachable.push({ id: n.id, name: n.name, roles: n.roles, x: n.x, y: n.y, z: n.z, why: snap(n, 16) >= 0 ? 'stands on walkable ground that is not connected to the streets (inside a closed building / another level / behind a wall)' : 'no walkable cell within 250 of it (inside a wall / on a roof)' }); return; }
    npcV[k] = addV('npc:' + k, best, 'npc', n.name);
  });
  // spine points along the streets (farthest-point sampling in the main component, pulled to the middle line): one Dijkstra from the seeds,
  // then an incremental one from each new spine point (only where it is nearer) — until every walkable cell is within SPINE of a point
  const tmp = new Int32Array(16), DD = new Int32Array(G.n).fill(2147483647);
  const relax = (seeds) => { const Q = new Heap(); seeds.forEach(c => { if (DD[c] > 0) { DD[c] = 0; } Q.push(0, c); });
    while (Q.size) { const [dd, i] = Q.pop(); if (dd > DD[i]) continue; const c = nb8(G, i, tmp); for (let t = 0; t < c; t += 2) { const j = tmp[t], nd = dd + tmp[t + 1]; if (nd < DD[j]) { DD[j] = nd; Q.push(nd, j); } } } };
  relax(V.map(v => v.cell));
  for (let k = 0; k < MAXSPINE; k++) {
    let far = -1, fd = 0; for (let i = 0; i < G.n; i++) if (G.OK[i] && comp[i] === main && DD[i] < 2147483647 && DD[i] > fd) { fd = DD[i]; far = i; }
    if (far < 0 || fd / 10 * CELL < SPINE) break;
    let best = far; for (let st2 = 0; st2 < 30; st2++) { const c = nb8(G, best, tmp); let nb2 = best; for (let t = 0; t < c; t += 2) if (comp[tmp[t]] === main && CLR[tmp[t]] > CLR[nb2]) nb2 = tmp[t]; if (nb2 === best) break; best = nb2; }
    addV('s' + k, best, 'street', null); relax([best]); if (best !== far) relax([far]);
  }
  // IN THROUGH THE DOOR (user 10:15): an edge may join two vertices only when they share a piece — the street (and houses without a door
  // found) count as one piece, a house with doors is its own piece, a DOOR vertex belongs to both sides of its opening. So the only way from
  // the street to a vertex inside such a house (the spot in front of its NPC) is street -> door (the middle of the opening) -> inside.
  const hasDoor = (l) => !!(doorsOf[l] && doorsOf[l].length);
  const pieceOfCell = (c) => { const l = c >= 0 ? LBL[c] : -1; return isHouse(l) && hasDoor(l) ? 'h' + l : 'S'; };
  const doorSides = new Map(); Object.keys(doorsOf).forEach(h => doorsOf[h].forEach(vi => { const S2 = doorSides.get(vi) || new Set(); S2.add('h' + h); doorSides.set(vi, S2); }));
  const piecesOf = (vi) => { const v = V[vi], S2 = new Set([pieceOfCell(v.cell)]); if (v.kind === 'door') { (doorSides.get(vi) || new Set()).forEach(x => S2.add(x)); const m = String(v.id).match(/^door(d+)_(d+)_/); if (m) { const b = +m[2]; S2.add(isHouse(b) && hasDoor(b) ? 'h' + b : 'S'); } } return S2; };
  const sharePiece = (a, b) => { const A2 = piecesOf(a), B2 = piecesOf(b); for (const x of A2) if (B2.has(x)) return true; return false; };
  // edges: from each vertex, clearance-weighted Dijkstra until its KNN cheapest vertices are found
  const at = new Map(); V.forEach((v, i) => { const L = at.get(v.cell) || []; L.push(i); at.set(v.cell, L); });
  const found = [];
  V.forEach((v, s) => {
    const D = new Map(), PR = new Map(), Q = new Heap(); D.set(v.cell, 0); Q.push(0, v.cell); let got = 0;
    while (Q.size && got < KNN) {
      const [dd, i] = Q.pop(); if (dd > D.get(i)) continue;
      const L = at.get(i); if (L && i !== v.cell) { L.forEach(t => { if (t !== s) { const cells = []; for (let c = i; c !== undefined; c = PR.get(c)) cells.push(c); cells.reverse(); found.push([s, t, dd, cells]); got++; } }); }
      const c = nb8(G, i, tmp);
      for (let t = 0; t < c; t += 2) { const j = tmp[t], nd = dd + Math.round(tmp[t + 1] * W[j] / 10), o = D.get(j); if (o === undefined || nd < o) { D.set(j, nd); PR.set(j, i); Q.push(nd, j); } }
    }
  });
  const allowed = found.map(f => sharePiece(f[0], f[1]));
  const keep = new Set(), byV = new Map(); found.forEach((f, fi) => { if (!allowed[fi]) return; [f[0], f[1]].forEach(x => { (byV.get(x) || byV.set(x, []).get(x)).push(fi); }); });
  byV.forEach(L => L.sort((a, b) => found[a][2] - found[b][2]).slice(0, KEEP).forEach(fi => keep.add(fi)));
  const par = V.map((_, i) => i), root = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  const order = found.map((f, i) => i).sort((a, b) => found[a][2] - found[b][2]);
  order.forEach(fi => { if (!allowed[fi]) return; const a = root(found[fi][0]), b = root(found[fi][1]); if (a !== b) { par[a] = b; keep.add(fi); } });
  let crossKept = 0; order.forEach(fi => { if (allowed[fi]) return; const a = root(found[fi][0]), b = root(found[fi][1]); if (a !== b) { par[a] = b; keep.add(fi); crossKept++; } });   // only where nothing else joins a part
  const em = new Map();
  keep.forEach(fi => { const f = found[fi], k2 = Math.min(f[0], f[1]) + ',' + Math.max(f[0], f[1]); if (em.has(k2) && em.get(k2)[2] <= f[2]) return; em.set(k2, f); });
  const E = [...em.values()].map(f => { let len = 0; for (let i = 1; i < f[3].length; i++) { const [x1, y1] = cellXY(G, f[3][i - 1]), [x2, y2] = cellXY(G, f[3][i]); len += Math.hypot(x2 - x1, y2 - y1); } return [f[0], f[1], Math.round(len), Math.round(f[2] / 10 * CELL), legs(G, f[3])]; });
  // MULTI-LEVEL BUILDINGS: the grid holds ONE height per cell, so a ground-floor room under an upper floor / roof that the flood reached
  // first is missing (Orc Village temple, Rune). Such an NPC is joined by a geodata walk (geopath.js: every layer) from the nearest graph
  // point, legs <= 280 that are wall-free BOTH ways (geo.lineClear), its front = the walk's last point next to it.
  for (let ui = unreachable.length - 1; ui >= 0; ui--) {
    const u = unreachable[ui], goal = { x: u.x, y: u.y, z: u.z };
    const cand = V.map((v, i) => ({ i, d: Math.hypot(v.x - u.x, v.y - u.y) + Math.abs(v.z - u.z) })).sort((p, q) => p.d - q.d).slice(0, 6);
    let best = null;
    for (const c of cand) {
      const v = V[c.i], r = geo.findPath({ x: v.x, y: v.y, z: v.z }, goal, { pad: 2500, maxNodes: 1.5e6, maxMs: 15000, maxLeg: 20 });
      if (!r.ok || !r.points.length) continue;
      const P = [{ x: v.x, y: v.y, z: v.z }].concat(r.points);
      if (P.some((p, k) => k && !geo.lineClear(P[k - 1], p))) continue;                  // walkable toward the NPC
      const oneWay = P.filter((p, k) => k && !geo.lineClear(p, P[k - 1])).length;          // steps the geodata allows only inward (one-way NSWE)
      const score = r.lengthUnits + oneWay * 3000;
      if (!best || score < best.score) best = { i: c.i, P, len: r.lengthUnits, oneWay, score };
    }
    if (!best) continue;
    // merge short legs back up to 280 while both directions stay wall-free
    const Q = [best.P[0]]; let k = 0;
    const both = (p, q) => geo.lineClear(p, q) && geo.lineClear(q, p);
    while (k < best.P.length - 1) { let j = k + 1; const two = both(best.P[k], best.P[k + 1]); while (j + 1 < best.P.length && Math.hypot(best.P[j + 1].x - best.P[k].x, best.P[j + 1].y - best.P[k].y) <= 280 && geo.lineClear(best.P[k], best.P[j + 1]) && (!two || both(best.P[k], best.P[j + 1]))) j++; Q.push(best.P[j]); k = j; }
    const end = Q[Q.length - 1], kk = `${u.id}@${u.x},${u.y}`;
    V.push({ id: 'npc:' + kk, x: Math.round(end.x), y: Math.round(end.y), z: end.z, cell: -1, kind: 'npc', ref: u.name }); const vi = V.length - 1; npcV[kk] = vi;
    const mid = []; Q.slice(1, -1).forEach(p => mid.push(Math.round(p.x), Math.round(p.y), p.z));
    E.push([best.i, vi, Math.round(best.len), Math.round(best.len * 1.6), mid]);
    unreachable.splice(ui, 1); (out0.joined = out0.joined || []).push(`${u.name} (${u.id}): joined by a geodata walk of ${Math.round(best.len)} (multi-level building)${best.oneWay ? ', ' + best.oneWay + ' step(s) one-way in the geodata (inward only)' : ''}`);
  }
  // reachability over the graph from the arrival
  const adj = V.map(() => []); E.forEach(e => { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
  const seen = new Set([0]), st = [0]; while (st.length) { const u = st.pop(); adj[u].forEach(w => { if (!seen.has(w)) { seen.add(w); st.push(w); } }); }
  V.forEach((v, i) => { if (v.kind === 'npc' && !seen.has(i)) unreachable.push({ id: +String(v.id).split(':')[1].split('@')[0], name: v.ref, x: v.x, y: v.y, z: v.z, why: 'its front is walkable but the street graph does not reach it' }); });
  // every indoor NPC: does the street route from the arrival pass one of its house's doors?
  const indoorRep = indoor.map(x => {
    const k = `${x.n.id}@${x.n.x},${x.n.y}`, vi = npcV[k]; if (vi === undefined) return { name: x.n.name, id: x.n.id, house: x.house, doors: x.doors, viaDoor: false, why: 'unreachable' };
    // BFS over the graph with the path, then: any door vertex of the house on it, or any waypoint within 48 of one
    const prev = new Array(V.length).fill(-2); prev[0] = -1; const qq = [0]; while (qq.length) { const u = qq.shift(); adj[u].forEach(w => { if (prev[w] === -2) { prev[w] = u; qq.push(w); } }); }
    const path = []; for (let u = vi; u >= 0; u = prev[u]) path.unshift(u);
    const D2 = (doorsOf[x.house] || []).map(d => V[d]); const via = path.some(u => (doorsOf[x.house] || []).includes(u)) || path.some(u => D2.some(d => Math.hypot(d.x - V[u].x, d.y - V[u].y) < 48));
    return { name: x.n.name, id: x.n.id, house: x.house, doors: x.doors, viaDoor: via || !x.doors ? via : true, why: x.doors ? '' : 'no door found (joined by stairs / another height, or the house is open)' };
  });
  const out = { town: name, key, built: new Date().toISOString(), z: [Math.min(...V.map(v => v.z)), Math.max(...V.map(v => v.z))], box,
    arrive: V.filter(v => v.kind === 'arrive').map(v => v.id), v: V.map(v => [v.id, v.x, v.y, v.z, 0, v.kind, v.ref]), e: E, npcs: npcV, unreachable,
    houses: Object.keys(doorsOf).length, indoor: indoorRep, joinedByGeopath: out0.joined || [],
    stats: { indoorNpcs: indoorRep.length, indoorNoDoor: indoorRep.filter(r => !r.doors).length, doors: V.filter(v => v.kind === 'door').length, npcs: npcs.length, reachable: Object.keys(npcV).length - unreachable.filter(u => /graph does not/.test(u.why)).length, vertices: V.length, edges: E.length, cells: G.cells } };
  return { out, G, comp, main, box, LBL, street, isHouse, doorsOf };
}
/** the town graph as a one-floor pseudo dungeon for the ROOMGRAPH-PURE planner (same as swarm.js townGraphD) */
function asDungeon(t) { return { name: t.town, key: 'town-' + t.key, isTown: true, floors: [{ name: 'streets', z: [t.z[0] - 200, t.z[1] + 200], rooms: [], graph: { v: t.v, nodes: [{ id: 'c0', kind: 'corridor', poly: null }], e: t.e.map(e => e.concat([0])) } }], entryLinks: [] }; }
function draw(T, res, routes) {
  const { out, G, box } = res, scale = Math.max(6, Math.ceil(Math.max(box[1] - box[0], box[3] - box[2]) / 2400));
  const Wd = Math.ceil((box[1] - box[0]) / scale), Hd = Math.ceil((box[3] - box[2]) / scale), img = Buffer.alloc(Wd * Hd * 4);
  const px = (x, y, c, a) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= Wd || y >= Hd) return; const o = (y * Wd + x) * 4, A2 = a / 255, B = img[o + 3] / 255, o2 = A2 + B * (1 - A2); for (let k = 0; k < 3; k++) img[o + k] = Math.round((c[k] * A2 + img[o + k] * B * (1 - A2)) / (o2 || 1)); img[o + 3] = Math.round(o2 * 255); };
  const toPx = (x, y) => [(x - box[0]) / scale, (y - box[2]) / scale];
  for (let i = 0; i < G.n; i++) { if (!G.OK[i]) continue; const [x, y] = cellXY(G, i), [X, Y] = toPx(x - 8, y - 8); const c = res.comp[i] === res.main ? [0, 255, 255] : [255, 120, 0]; for (let a = 0; a < Math.max(1, CELL / scale); a++) for (let b = 0; b < Math.max(1, CELL / scale); b++) px(X + a, Y + b, c, 35); }
  const line = (a, b, c, th, al) => { const [x1, y1] = toPx(a[0], a[1]), [x2, y2] = toPx(b[0], b[1]); const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1)) + 1; for (let s = 0; s <= n; s++) { const x = x1 + (x2 - x1) * s / n, y = y1 + (y2 - y1) * s / n; for (let dx = -th; dx <= th; dx++) for (let dy = -th; dy <= th; dy++) px(x + dx, y + dy, c, al); } };
  const dot = (p, c, r) => { const [X, Y] = toPx(p[0], p[1]); for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (dx * dx + dy * dy <= r * r) px(X + dx, Y + dy, dx * dx + dy * dy > (r - 1) * (r - 1) ? [0, 0, 0] : c, 255); };
  out.e.forEach(e => { const P = [[out.v[e[0]][1], out.v[e[0]][2]]]; for (let i = 0; i < e[4].length; i += 3) P.push([e[4][i], e[4][i + 1]]); P.push([out.v[e[1]][1], out.v[e[1]][2]]); for (let i = 1; i < P.length; i++) line(P[i - 1], P[i], [120, 255, 160], 0, 190); });
  (routes || []).forEach(r => { for (let i = 1; i < r.pts.length; i++) line(r.pts[i - 1], r.pts[i], r.c, 1, 255); });
  out.v.forEach(v => dot([v[1], v[2]], v[5] === 'npc' ? [255, 230, 0] : v[5] === 'arrive' ? [255, 60, 255] : v[5] === 'door' ? [255, 140, 0] : [255, 255, 255], v[5] === 'street' ? 2 : v[5] === 'door' ? 3 : 4));
  out.unreachable.forEach(u => dot([u.x, u.y], [255, 40, 40], 5));
  fs.writeFileSync(path.join(IMG, out.key + '_overlay.png'), RP.png(Wd, Hd, img));
  const regions = []; for (let rx = Math.floor(box[0] / 32768) + 20; rx <= Math.floor(box[1] / 32768) + 20; rx++) for (let ry = Math.floor(box[2] / 32768) + 18; ry <= Math.floor(box[3] / 32768) + 18; ry++) regions.push({ file: rx + '_' + ry, x0: (rx - 20) * 32768, y0: (ry - 18) * 32768 });
  const labels = out.v.filter(v => v[5] === 'npc' || v[5] === 'arrive').map(v => ({ text: String(v[6] || v[0]).slice(0, 18), x: (v[1] - box[0]) / scale, y: (v[2] - box[2]) / scale, c: v[5] === 'arrive' ? [255, 90, 255] : [255, 230, 0] }))
    .concat(out.unreachable.map(u => ({ text: 'X ' + u.name, x: (u.x - box[0]) / scale, y: (u.y - box[2]) / scale, c: [255, 60, 60] })));
  fs.writeFileSync(path.join(IMG, out.key + '_meta.json'), JSON.stringify({ out: out.key + '.png', overlay: out.key + '_overlay.png', box, scale, W: Wd, H: Hd, regions, labels, safe: [],
    title: `${out.town}: street graph ${out.v.length} points, ${out.e.length} edges — ${out.stats.reachable}/${out.stats.npcs} NPCs reachable${routes && routes.length ? ' — magenta: recorded Giran routes, green: computed' : ''}` }));
}

if (require.main === module) {
  fs.mkdirSync(OUTD, { recursive: true }); fs.mkdirSync(IMG, { recursive: true });
  const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8'), a = src.indexOf('// ROOMGRAPH-PURE-BEGIN'), b = src.indexOf('// ROOMGRAPH-PURE-END');
  const PURE = new Function('num', src.slice(a, b) + '\nreturn { rgBuild, rgPlan, rgPlanPoints };')(Number);
  const report = { generated: new Date().toISOString(), towns: [] }, index = [];
  TOWNS.forEach(T => {
    if (only && !only.includes(T[0])) { const old = rd(path.join(OUTD, T[0] + '.json'), null); if (old) index.push({ key: old.key, town: old.town, box: old.box, z: old.z, stats: old.stats }); return; }
    const t0 = Date.now(), res = buildTown(T);
    if (!res.out) { report.towns.push({ key: T[0], town: T[1], error: res.error }); console.log(`${T[1]}: ${res.error}`); return; }
    const o = res.out, rep = { key: o.key, town: o.town, npcs: o.stats.npcs, reachable: o.stats.reachable, indoorNpcs: o.stats.indoorNpcs, indoorNoDoor: o.stats.indoorNoDoor, doors: o.stats.doors, indoorNotViaDoor: (o.indoor || []).filter(r => r.doors && !r.viaDoor).map(r => r.name), vertices: o.stats.vertices, edges: o.stats.edges, unreachable: o.unreachable.map(u => `${u.name} (${u.id}) ${u.x},${u.y},${u.z}: ${u.why}`), ms: Date.now() - t0 };
    // Giran: the user's recorded routes vs the computed street routes
    let routes = [];
    if (o.key === 'giran') {
      const GR = rd(path.join(DATA, 'giran_routes.json'), { routes: {} }), RG = PURE.rgBuild(asDungeon(o));
      rep.giranRoutes = Object.entries(GR.routes || {}).map(([k, r]) => {
        const P = r.points || [], s = P[0], e = P[P.length - 1]; if (!s || !e) return { route: k, error: 'no points' };
        const nk = Object.keys(o.npcs).find(k2 => o.v[o.npcs[k2]][6] === r.npc), fv = nk ? o.v[o.npcs[nk]] : null; const plan = PURE.rgPlan(RG, { x: s[0], y: s[1], z: s[2] }, fv ? { x: fv[1], y: fv[2], z: fv[3] } : { x: e[0], y: e[1], z: e[2] }), C = plan.ok ? [[s[0], s[1]]].concat(PURE.rgPlanPoints(plan).map(p => [p.x, p.y])) : [];
        const len = (L) => L.reduce((t, p, i) => i ? t + Math.hypot(p[0] - L[i - 1][0], p[1] - L[i - 1][1]) : 0, 0);
        const dev = C.length ? Math.max(...P.map(p => Math.min(...C.map(c => Math.hypot(c[0] - p[0], c[1] - p[1]))))) : null;
        routes.push({ pts: P.map(p => [p[0], p[1]]), c: [255, 0, 200] }); if (C.length) routes.push({ pts: C, c: [60, 220, 120] });
        return { route: k, npc: r.npc, recordedLength: Math.round(len(P)), computedLength: plan.ok ? Math.round(len(C)) : null, maxDeviation: dev !== null ? Math.round(dev) : null, ok: plan.ok, why: plan.why || '' };
      });
    }
    fs.writeFileSync(path.join(OUTD, o.key + '.json'), JSON.stringify(o));
    index.push({ key: o.key, town: o.town, box: o.box, z: o.z, stats: o.stats });
    draw(T, res, routes);
    report.towns.push(rep);
    console.log(`${o.town}: ${o.stats.reachable}/${o.stats.npcs} NPCs reachable, ${o.v.length} points, ${o.e.length} edges (${Math.round(rep.ms / 1000)} s)${o.unreachable.length ? ' — unreachable: ' + o.unreachable.map(u => u.name).join(', ') : ''}`);
  });
  fs.writeFileSync(path.join(OUTD, 'index.json'), JSON.stringify({ built: new Date().toISOString(), towns: index }));
  fs.writeFileSync(path.join(IMG, 'report.json'), JSON.stringify(report, null, 1));
  const html = ['<!doctype html><meta charset="utf-8"><title>Town street graphs</title><style>body{background:#111;color:#ddd;font:13px sans-serif}img{max-width:100%;border:1px solid #333}h2{margin:18px 0 4px}</style>',
    '<h1>Town street graphs (docs/plan/tools/town_graph.js)</h1><p>Green = street centrelines (legs <= 280), yellow = the walkable spot in front of each NPC (on its side of the wall/counter), orange = house doors (middle of the opening), magenta = arrival points, red = NPCs not reachable on foot from the arrival.</p>'];
  report.towns.forEach(t => html.push(`<h2>${t.town}: ${t.reachable}/${t.npcs} NPCs reachable · ${t.indoorNpcs || 0} indoor (${t.indoorNoDoor || 0} without a door found)</h2>${(t.unreachable || []).length ? '<p>Unreachable: ' + t.unreachable.map(u => u.replace(/</g, '&lt;')).join('<br>') + '</p>' : ''}${t.giranRoutes ? '<p>Recorded vs computed: ' + t.giranRoutes.map(g => `${g.route}: recorded ${g.recordedLength}, computed ${g.computedLength}, max deviation ${g.maxDeviation}`).join(' · ') + '</p>' : ''}<img src="${t.key}.png">`));
  fs.writeFileSync(path.join(IMG, 'index.html'), html.join('\n'));
  console.log('written Scripts/data/town_graph/*.json + index.json, docs/plan/town_graphs/ (render: powershell docs\\plan\\tools\\render_room_checks.ps1 -Dir docs\\plan\\town_graphs)');
}
module.exports = { buildTown, asDungeon, TOWNS };
