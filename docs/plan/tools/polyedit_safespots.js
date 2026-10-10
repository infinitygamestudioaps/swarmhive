// SAFE SPOTS OF ONE FLOOR after a room outline was edited on the dashboard (POLYEDIT 2026-10-08). Started by Dashboard/polyedit_api.js as a
// child process (the dashboard server never loads the geodata grid itself). Same algorithm as safe_spots.js (floorSafeSpots), but only one
// floor, ids kept where a spot stayed (< 200 away), and the write is a locked read-modify-write of just that floor's safeSpots
// (+ the floor's safeSpotsStale mark removed), atomic, manual rooms untouched.
//
// Use: node polyedit_safespots.js --dungeon "Cruma Tower" --floor 0 [--dry]
//      env POLYEDIT_DATA = data dir (default Scripts/data), POLYEDIT_REF = dir of spawns_h5/npcs_h5/aggro_h5 (default = data dir)
'use strict';
const fs = require('fs'), path = require('path');
const G = require('./manual_guard');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = process.env.POLYEDIT_DATA || path.join(ROOT, 'Scripts', 'data');
const REF = process.env.POLYEDIT_REF || DATA;
const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const dName = arg('--dungeon'), fi = +arg('--floor'), dry = argv.includes('--dry');
const FILE = path.join(DATA, 'dungeon_rooms.json');

function main() {
  if (!dName || !Number.isInteger(fi)) throw new Error('--dungeon <name> --floor <index> required');
  const SS = require('./safe_spots');
  const all = G.readJson(FILE, null); if (!all) throw new Error('cannot read ' + FILE);
  const d = all.find(x => x.name === dName || x.key === dName); if (!d) throw new Error('no dungeon ' + dName);
  const F = (d.floors || [])[fi]; if (!F) throw new Error(`no floor ${fi} in ${d.name}`);
  const t0 = Date.now();
  const ctx = { spawns: G.readJson(path.join(REF, 'spawns_h5.json'), []), NPC: G.readJson(path.join(REF, 'npcs_h5.json'), {}), AGGRO: G.readJson(path.join(REF, 'aggro_h5.json'), {}) };
  const ss = SS.floorSafeSpots(d, F, fi, ctx);
  const old = F.safeSpots || [];
  // keep the old ids where the spot stayed (as room_refine.js does), new ones continue the numbering
  const used = new Set(), pre = (old[0] && old[0].id.replace(/-\d+$/, '')) || (ss[0] && ss[0].id.replace(/-\d+$/, ''));
  ss.forEach(s => { const o = old.find(o2 => !used.has(o2.id) && Math.hypot(o2.x - s.x, o2.y - s.y) < 200 && Math.abs(o2.z - s.z) < 200); if (o) { s.id = o.id; used.add(o.id); s._keep = true; } });
  let n = Math.max(0, ...old.map(o => +String(o.id).split('-').pop() || 0));
  ss.forEach(s => { if (!s._keep) s.id = `${pre}-${++n}`; delete s._keep; });
  ss.sort((a, b) => (+String(a.id).split('-').pop()) - (+String(b.id).split('-').pop()));
  const msg = `${d.name} / ${F.name}: safe spots ${old.length} -> ${ss.length} (${ss.filter(s => old.some(o => o.id === s.id)).length} kept their id), ${Date.now() - t0} ms`;
  if (dry) { console.log('DRY ' + msg); return; }
  G.withLock(FILE, () => {
    const t = G.readText(FILE), disk = JSON.parse(t.text);
    const dd = disk.find(x => x.name === d.name), FF = dd && dd.floors && dd.floors[fi];
    if (!FF || FF.name !== F.name) throw new Error('the floor changed on disk meanwhile — not written');
    FF.safeSpots = ss; delete FF.safeSpotsStale;
    G.atomicWrite(FILE, G.stringifyLike(disk, t.fmt));
  }, { who: 'polyedit_safespots' });
  console.log(msg);
}
try { main(); } catch (e) { console.log('ERROR ' + e.message); process.exitCode = 1; }
