// MAP FLOORS test (2026-10-13, user 09:37: "still showing monsters from different levels in a dungeon and shows areas from the dungeon on
// outside hunting zones"). Offline: Dashboard/mapfloors.js on the real Scripts/data/dungeon_rooms.json + real Cruma Tower positions, and
// Dashboard/liveparty_api.js live() with a fake MCP. No server, no game.   node docs/plan/tools/test_map_floors.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..', '..');
const DASH = path.join(ROOT, 'Dashboard');
const DATA = path.join(ROOT, 'Scripts', 'data');
const MF = require(path.join(DASH, 'mapfloors.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };

const M = MF.load(path.join(DATA, 'dungeon_rooms.json'));
ok(M && M.dungeons.length >= 20, 'model built');
ok(MF.load(path.join(DATA, 'dungeon_rooms.json')) === M, 'model cached (same object on a second load)');

// real positions (Logs/swarm_state_*.json 2026-10-13 09:40 + datapack spawns / NPCs)
const P = {
  gorrukOutside: { x: 17225, y: 114173, z: -3440 },      // Dion gatekeeper landing at the tower door (surface)
  mozella: { x: 17296, y: 114176, z: -3439 },            // the door NPC (surface)
  duskF2: { x: 17880, y: 110232, z: -9312 },             // Tank3, floor 2
  grumvakF2: { x: 23256, y: 113416, z: -9040 },          // Destroyer9 escaping, floor 2 (room left-c)
  capellaF2: { x: 17725, y: 108220, z: -9057 },          // floor 2 landing
  hannaF2: { x: 17722, y: 119749, z: -9068 },            // floor 2 south end
  pyrelithF1: { x: 14744, y: 111560, z: -12096 },        // party Tank2 member, floor 1
  cubicF3: { x: 17719, y: 115430, z: -6582 },            // Teleportation Cubic, floor 3 (just outside floor 3's only room)
};
const lv = (k) => MF.levelKey(M, P[k]);
ok(lv('gorrukOutside') === 'surface' && lv('mozella') === 'surface', 'tower door = surface');
ok(lv('duskF2') === 'cruma#1' && lv('grumvakF2') === 'cruma#1' && lv('capellaF2') === 'cruma#1' && lv('hannaF2') === 'cruma#1', 'floor 2 positions = cruma#1');
ok(lv('pyrelithF1') === 'cruma#0', 'floor 1 = cruma#0');
ok(lv('cubicF3') === 'cruma#2', 'floor 3 device = cruma#2 (floor area includes devices / landing)');
ok(MF.levelName(M, P.duskF2) === 'Cruma Tower, 2nd floor', 'level name');

// 1) a floor-2 viewer gets no floor-1 / floor-3 monsters, keeps floor-2 ones (spawns of the datapack at the same x/y)
const spawns = JSON.parse(fs.readFileSync(path.join(DATA, 'spawns_h5.json'), 'utf8').replace(/^\uFEFF/, ''));
const inCruma = spawns.filter(s => s.x > 9000 && s.x < 27000 && s.y > 104000 && s.y < 124000);
const f1 = inCruma.filter(s => s.z < -11000), f2 = inCruma.filter(s => s.z > -9800 && s.z < -8300), f3 = inCruma.filter(s => s.z > -7400 && s.z < -6200);
ok(f1.length > 20 && f2.length > 20 && f3.length > 3, `Cruma spawns found (f1 ${f1.length}, f2 ${f2.length}, f3 ${f3.length})`);
ok(f1.every(m => !MF.sameLevel(M, P.duskF2, m, 600)), 'floor-2 viewer: no floor-1 monster');
ok(f3.every(m => !MF.sameLevel(M, P.duskF2, m, 600)), 'floor-2 viewer: no floor-3 monster');
const f2kept = f2.filter(m => MF.sameLevel(M, P.grumvakF2, m, 600)).length;
ok(f2kept === f2.length, `floor-2 viewer keeps every floor-2 monster (${f2kept}/${f2.length})`);
// even a monster straight below / above at a z the old |dz| <= 600 would never reach is decided by the floor, and stairs between bands
ok(!MF.sameLevel(M, P.duskF2, { x: P.duskF2.x, y: P.duskF2.y, z: -12000 }, 600), 'same x/y one floor down: hidden');
ok(MF.sameLevel(M, P.duskF2, { x: P.duskF2.x + 300, y: P.duskF2.y, z: -9250 }, 600), 'same floor nearby: shown');

// 2) other parties: floor-2 viewer must not get floor-1 characters nor the ones outside the tower
ok(!MF.sameLevel(M, P.duskF2, P.pyrelithF1, MF.CHAR_DZ), 'party on floor 1 not on the floor-2 map');
ok(!MF.sameLevel(M, P.duskF2, P.gorrukOutside, MF.CHAR_DZ), 'party outside not on the floor-2 map');
ok(MF.sameLevel(M, P.duskF2, P.grumvakF2, MF.CHAR_DZ), 'teammate on floor 2 is on the floor-2 map');

// 3) a surface viewer: no floor room outline, no underground characters / monsters, surface ones kept
ok(MF.roomOnLevel(M, P.gorrukOutside, 'cruma-2-right-b') === false, 'surface viewer: no cruma-2-right-b outline');
ok(MF.roomOnLevel(M, P.duskF2, 'cruma-2-right-b') === true, 'floor-2 viewer: cruma-2-right-b outline');
ok(MF.roomOnLevel(M, P.pyrelithF1, 'cruma-2-right-b') === false, 'floor-1 viewer: no floor-2 outline');
ok(MF.roomOnLevel(M, P.gorrukOutside, 'no-such-room') === null, 'unknown room = null (caller decides)');
ok(MF.zoneOnLevel(M, P.gorrukOutside, { x: 12495, y: 109575, room: 'cruma-2-right-b', zr: [-9215, -8843] }) === false, 'surface viewer: floor-2 hunting zone hidden');
ok(MF.zoneOnLevel(M, P.duskF2, { x: 12495, y: 109575, room: 'cruma-2-right-b', zr: [-9215, -8843] }) === true, 'floor-2 viewer: its hunting zone shown');
ok(MF.zoneOnLevel(M, P.duskF2, { x: 5106, y: 126916, area: 'cruma-marsh-1', zr: [-3800, -3500] }) === false, 'floor-2 viewer: a surface field area hidden');
ok(MF.zoneOnLevel(M, P.gorrukOutside, { x: 5106, y: 126916, area: 'cruma-marsh-1', zr: [-3800, -3500] }) === true, 'surface viewer: a surface field area shown');
ok(!MF.sameLevel(M, P.gorrukOutside, P.duskF2, MF.CHAR_DZ) && !MF.sameLevel(M, P.gorrukOutside, P.pyrelithF1, MF.CHAR_DZ), 'surface viewer: no underground characters');
ok(f2.every(m => !MF.sameLevel(M, P.gorrukOutside, m, 600)), 'surface viewer: no floor-2 monsters');
const marsh = spawns.filter(s => Math.hypot(s.x - P.gorrukOutside.x, s.y - P.gorrukOutside.y) < 3000 && s.z > -4200 && s.z < -3000);
ok(marsh.length > 0 && marsh.every(m => MF.sameLevel(M, P.gorrukOutside, m, 600)), `surface viewer keeps the marsh monsters (${marsh.length})`);

// 4) fallbacks: unknown height = shown; no model = the old |dz| rule; surface vs surface = |dz| rule
ok(MF.sameLevel(M, P.duskF2, { x: 1, y: 1 }, 600) === true, 'unknown height: shown');
ok(MF.sameLevel(M, P.duskF2, { x: 1, y: 1, z: null }, 600) === true, 'null height: shown');
ok(MF.sameLevel(null, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 700 }, 600) === false && MF.sameLevel(null, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 500 }, 600) === true, 'no model: |dz| rule');
ok(MF.sameLevel(M, { x: 83473, y: 148554, z: -3408 }, { x: 83600, y: 148600, z: -2700 }, 600) === false && MF.sameLevel(M, { x: 83473, y: 148554, z: -3408 }, { x: 83600, y: 148600, z: -3000 }, 600) === true, 'Giran surface: |dz| 600 rule');

// 5) every room centre lies on its own floor (band overlaps of Mithril Mines / Imperial Tomb are the known exceptions, as in swarm.js dzFloor)
const D = JSON.parse(fs.readFileSync(path.join(DATA, 'dungeon_rooms.json'), 'utf8').replace(/^\uFEFF/, ''));
let rooms = 0, wrong = [];
D.forEach(d => (d.floors || []).forEach((F, fi) => (F.rooms || []).forEach(r => { if (!r.center) return; rooms++; const k = MF.levelKey(M, { x: r.center[0], y: r.center[1], z: r.center[2] }); if (k !== d.key + '#' + fi) wrong.push(r.id); })));
ok(rooms > 500 && wrong.length <= 3, `room centres on their own floor (${rooms - wrong.length}/${rooms}; off: ${wrong.join(', ')})`);
ok(['giran', 'dion', 'aden', 'gludio', 'heine'].every((t, i) => MF.levelKey(M, [{ x: 83473, y: 148554, z: -3408 }, { x: 15670, y: 142983, z: -2705 }, { x: 147450, y: 26741, z: -2204 }, { x: -14225, y: 123540, z: -3121 }, { x: 111409, y: 219364, z: -3545 }][i]) === 'surface'), 'towns are surface');

// 6) the live party endpoint (Dashboard/liveparty_api.js) with a fake MCP: the leader on floor 2 gets only floor-2 monsters
(async () => {
  const LP = require(path.join(DASH, 'liveparty_api.js'));
  const members = [{ name: 'Tank3', leader: true, party: 'Tank3', x: P.duskF2.x, y: P.duskF2.y, z: P.duskF2.z, ageSec: 2 }];
  const mobs = [
    { name: 'Dark Lord', x: 17900, y: 110300, z: -9300, level: 50 },                // floor 2 (shown)
    { name: 'Premo', x: 17880, y: 110232, z: -12090, level: 45 },                   // floor 1 under the leader (hidden)
    { name: 'Susceptor', x: 17765, y: 112901, z: -6580, level: 49 },                // floor 3 (hidden)
    { name: 'Toad Lord', x: 17300, y: 114100, z: -3600, level: 30 },                // surface marsh (hidden)
    { name: 'No Height', x: 17890, y: 110240, level: 40 },                          // height unknown (shown)
  ];
  const ctx = { readStates: () => members, partyOf: (c) => c.party, parseIntents: () => [], readJson: (f, d) => d, LOGS: path.join(ROOT, 'Logs'), DATA,
    mcpCallChar: async () => JSON.stringify(mobs) };
  const r = await LP.live('Tank3', ctx);
  const names = (r.mobs || []).map(m => m.n).sort().join(',');
  ok(names === 'Dark Lord,No Height', '/api/live floor-2 leader: only floor-2 monsters (+ unknown height): ' + names);
  ok((r.mobs || []).find(m => m.n === 'No Height').z === null, '/api/live: a missing height stays null (not 0)');

  // 7) the client hooks are in place (index.html / charpage.js / liveparty.js use window.MapFloors) and server.js uses the model
  const idx = fs.readFileSync(path.join(DASH, 'index.html'), 'utf8'), srv = fs.readFileSync(path.join(DASH, 'server.js'), 'utf8');
  ok(/<script src="\/mapfloors\.js"><\/script>/.test(idx), 'index.html loads /mapfloors.js');
  ok(/MF\.room\(L, chosen\.room\) === false/.test(idx), 'partyMap: chosen room only on the leader floor');
  ok(/c\.y < y0 \+ W && onLvl\(c\)\)/.test(idx), 'partyMap: other parties only on the leader floor');
  ok(/MF\.same\(me, m, MF\.MOB_DZ\)/.test(idx), 'escMap: monsters by floor');
  ok(/function loadLayers\(tries\)/.test(idx), 'map layer tables retried');
  ok(/matesHere\(\)/.test(fs.readFileSync(path.join(DASH, 'charpage.js'), 'utf8')), 'charpage map: teammates on my floor');
  ok(/members: d0\.members\.filter\(c => c === ref \|\| here\(c\)\)/.test(fs.readFileSync(path.join(DASH, 'liveparty.js'), 'utf8')), 'live party map: members on the reference floor');
  ok(/'\/api\/mapfloors'/.test(srv) && /MapFloors\.sameLevel\(FM, me, m, 600\)/.test(srv) && /MapFloors\.sameLevel\(FM, meAt, m, 600\)/.test(srv), 'server.js: /api/mapfloors + partymobs + char filters');

  // 8) MAP ART follows the viewer's floor (user 2026-10-13 10:25): the same layer table as server.js /api/maplayersz, built from Maps/high
  const have = {}; try { fs.readdirSync(path.join(ROOT, 'Maps', 'high')).forEach(n => { const m = n.match(/^(\d+_\d+)_(\d)\.jpg$/); if (m) (have[m[1]] = have[m[1]] || []).push(+m[2]); }); } catch (e) { }
  const zmap = {};
  D.forEach(d => {
    const byRegion = {};
    (d.floors || []).forEach(F => (F.rooms || []).forEach(r => { if (!r.center || !F.z) return; const k = (Math.floor(r.center[0] / 32768) + 20) + '_' + (Math.floor(r.center[1] / 32768) + 18); (byRegion[k] = byRegion[k] || {})[F.z.join(',')] = F.z; }));
    Object.entries(byRegion).forEach(([k, zs]) => {
      const L = (have[k] || []).sort((a, b) => a - b); if (!L.length) return;
      const bands = Object.values(zs).sort((a, b) => a[0] - b[0]); if (bands.length > L.length) return;
      const cs = (d.floors || []).flatMap(F => (F.rooms || []).filter(r => r.center).map(r => r.center));
      const bx = [Math.min(...cs.map(c => c[0])) - 2500, Math.min(...cs.map(c => c[1])) - 2500, Math.max(...cs.map(c => c[0])) + 2500, Math.max(...cs.map(c => c[1])) + 2500];
      zmap[k] = (zmap[k] || []).concat(bands.map((z, i) => [z[0] - 400, z[1] + 400, L[i]].concat(bx)));
    });
  });
  const reg = (p) => [Math.floor(p.x / 32768) + 20, Math.floor(p.y / 32768) + 18];
  // the release package has no Maps/high (game client art is never shipped): the layer-art checks only run where the art exists
  const artOK = Object.keys(have).length > 0; if (!artOK) console.log('  skip map-art layer checks: no Maps/high here (package install)');
  const artIs = (lv, p, want) => !artOK || artAt(lv, p) === want;
  const artAt = (lv, p) => { const [rx, ry] = reg(p); return MF.tileSuffix(lv, rx, ry, p, zmap, have); };
  const S = {}; let t = 1e6;
  const look = (p, dt) => { t += dt == null ? 1500 : dt; return MF.trackLevel(M, S, p, t); };
  const giran = { x: 83473, y: 148554, z: -3408 }, patriotsIn = { x: -13432, y: 77688, z: -5168 }, hereticIn = { x: -44584, y: -247560, z: -7904 };
  let lv = look(giran);
  ok(lv.k === 'surface' && artAt(lv, giran) === '', 'surface viewer (Giran): world art');
  lv = look(patriotsIn);
  ok(lv.changed && lv.k === 'patriots#0' && artIs(lv, patriotsIn, '_L1'), `Ziggurat into Patriot's Necropolis: switches at once to its layer (${lv.k} ${artAt(lv, patriotsIn)})`);
  lv = look({ x: patriotsIn.x + 120, y: patriotsIn.y, z: -5160 });
  ok(!lv.changed && lv.k === 'patriots#0', 'walking inside: stays');
  lv = look(giran);
  ok(lv.changed && lv.k === 'surface' && artAt(lv, giran) === '', 'death -> town: back to the world art at once');
  lv = look(hereticIn);
  ok(lv.changed && lv.k === 'heretic#0' && artAt(lv, hereticIn) === null, 'Catacomb of the Heretic (no layer art): null = room outlines on dark, never the surface art');
  lv = look({ x: -46000, y: -246000, z: -3500 });   // leaves the catacomb (out of its box, surface height)
  ok(lv.changed && lv.k === 'surface', 'out of the catacomb: surface again');
  // Cruma floor teleporters: floor 1 -> floor 2 -> floor 3 art (layers 1 / 2 / 3 of region 20_21)
  const S2 = {}; let t2 = 2e6; const look2 = (p, dt) => { t2 += dt == null ? 1500 : dt; return MF.trackLevel(M, S2, p, t2); };
  let c = look2(P.pyrelithF1); ok(c.k === 'cruma#0' && artIs(c, P.pyrelithF1, '_L1'), 'Cruma floor 1 = layer 1');
  c = look2(P.capellaF2); ok(c.changed && c.k === 'cruma#1' && artIs(c, P.capellaF2, '_L2'), 'teleporter to floor 2: layer 2 at once');
  c = look2(P.cubicF3); ok(c.changed && c.k === 'cruma#2' && artIs(c, P.cubicF3, '_L3'), 'teleporter to floor 3: layer 3 at once');
  c = look2(P.gorrukOutside); ok(c.changed && c.k === 'surface' && artAt(c, P.gorrukOutside) === '', 'out of the tower: world art');
  // stairs / gaps: no flicker
  const S3 = {}; let t3 = 3e6; const look3 = (p, dt) => { t3 += dt == null ? 1500 : dt; return MF.trackLevel(M, S3, p, t3); };
  const st = (z, dx) => ({ x: 17880 + (dx || 0), y: 110232, z });
  look3(st(-8650));
  const seq = [];
  [[-8000, 40], [-7550, 80], [-8000, 120], [-8650, 160], [-8000, 200], [-7560, 240], [-8010, 280]].forEach(([z, dx]) => seq.push(look3(st(z, dx)).k));
  ok(seq.every(k => k === 'cruma#1'), 'stairs: floor 2 <-> gap <-> one look at floor-3 height never switches (' + seq.join(',') + ')');
  let burst = null; for (let i = 0; i < 10; i++) burst = look3(st(-7500, 300 + i), 50);   // 10 renders within 0.5 s at the new height
  ok(burst.k === 'cruma#1', 'many renders within one refresh do not count as 2 looks');
  const sw = look3(st(-7480, 320), 1200);
  ok(sw.changed && sw.k === 'cruma#2', 'second look >= 1 s later on the new floor: switches');
  ok(look3(st(-7470, 330)).k === 'cruma#2' && !look3(st(-7460, 340)).changed, 'then stays');
  // which dungeons have floor art today (the report's list)
  const art = D.map(d => d.key + ':' + d.floors.map((F, fi) => { const r = (F.rooms || []).find(x => x.center); if (!r) return '-'; const p = { x: r.center[0], y: r.center[1], z: r.center[2] }; const a = artAt(MF.lvlOf(M, d.key + '#' + fi), p); return a === null ? 'none' : a; }).join('/'));
  console.log('floor art per dungeon (layer per floor, none = room outlines): ' + art.join('  '));

  // 9) NPC TARGETS (2026-10-13): server.js moves a selected peaceful NPC from doing.target to doing.npc (no more "fighting Helvetia")
  {
    const src = srv, a = src.indexOf('const NPC_ATTACKABLE_RX'), b = src.indexOf('function readStates() {');
    ok(a > 0 && b > a && /try \{ splitNpcTarget\(s\); \}/.test(src), 'server.js: readStates splits NPC targets');
    const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };   // eslint-disable-line no-unused-vars
    const split = new Function('fs', 'path', 'DATA', 'readJson', src.slice(a, b) + '; return splitNpcTarget;')(fs, path, DATA, readJson);
    const kind = (n) => { const s = { doing: { target: { name: n, hp: 100, dist: 533 } } }; split(s); return s.doing.target ? 'mob' : 'npc'; };
    ok(['Priest of Dawn', 'Helvetia', 'Graham', 'Peta', 'Gatekeeper Ziggurat'].every(n => kind(n) === 'npc'), 'merchants / priests / gatekeepers are NPC visits');
    ok(['Dark Lord', 'Giran Guard', 'Zaken', 'Wolf', 'Lucky Pig'].every(n => kind(n) === 'mob'), 'monsters, guards, bosses and names shared with monsters stay fights');
  }

  console.log(`test_map_floors: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL (exception): ' + (e && e.stack || e)); process.exit(1); });
