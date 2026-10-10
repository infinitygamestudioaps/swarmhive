// Builds Dashboard/data/kamaloka_layout.json from the L2J datapack Kamaloka.java (Scripts/data/dp/instances):
// per Kamaloka (same order as dungeons_h5.json kamaloka[]): entry point, first room (shaman + respawning minions), second room,
// miniboss, boss, exit teleporter — world coordinates, so the dashboard can draw them on the game's own map tiles.
// Run: node docs/plan/tools/kamaloka_layout.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'instances', 'Kamaloka.java'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const npcs = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'npcs_h5.json'), 'utf8').replace(/^﻿/, ''));
const dung = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dungeons_h5.json'), 'utf8').replace(/^﻿/, '')).kamaloka;

/** `NAME = { ... };` (nested int arrays / null) -> JS value */
function arr(name) {
  const m = new RegExp('\\b' + name + ' =').exec(src);   // \b: 'BOSS' must not match 'MINIBOSS'
  if (!m) throw new Error('no ' + name);
  const i = m.index;
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}' && --depth === 0) break; }
  return JSON.parse(src.slice(j, k + 1).replace(/\{/g, '[').replace(/\}/g, ']').replace(/,(\s*\])/g, '$1'));
}
const LEVEL = arr('LEVEL');
const TELEPORTS = [...src.slice(src.indexOf('TELEPORTS =')).split('};')[0].matchAll(/new Location\((-?\d+),\s*(-?\d+),\s*(-?\d+)\)/g)].map(m => ({ x: +m[1], y: +m[2], z: +m[3] }));
const FIRST_ROOM = arr('FIRST_ROOM'), FIRST_SP = arr('FIRST_ROOM_SPAWNS');
const SECOND_ROOM = arr('SECOND_ROOM'), SECOND_SP = arr('SECOND_ROOM_SPAWNS');
const MINIBOSS = arr('MINIBOSS'), BOSS = arr('BOSS'), TELEPORTERS = arr('TELEPORTERS');
const nm = (id) => (npcs[id] && npcs[id].n) || ('npc ' + id);
const lv = (id) => (npcs[id] && npcs[id].l) || null;
const center = (pts) => ({ x: Math.round(pts.reduce((s, p) => s + p[0], 0) / pts.length), y: Math.round(pts.reduce((s, p) => s + p[1], 0) / pts.length), z: Math.round(pts.reduce((s, p) => s + p[2], 0) / pts.length) });

const out = {};
LEVEL.forEach((level, i) => {
  const d = dung.find(k => k.id === 'kamaloka-' + level) || {};
  const pts = [];
  const o = { id: 'kamaloka-' + level, level, kind: (d.partyMax || 6) >= 9 ? 'labyrinth' : 'hall', entry: TELEPORTS[i], rooms: [] };
  if (FIRST_ROOM[i]) {
    const [shaman, minion] = FIRST_ROOM[i];
    o.rooms.push({ key: 'room1', label: 'Room 1', note: `${nm(minion)} respawn every 25 s until the shaman (${nm(shaman)}) dies — kill it first; then the boss loses P.Def`,
      ...center(FIRST_SP[i]), spawns: FIRST_SP[i].map(p => ({ x: p[0], y: p[1] })), mobs: [nm(shaman), nm(minion)] });
  }
  if (SECOND_ROOM[i]) {
    const [mob] = SECOND_ROOM[i];
    o.rooms.push({ key: 'room2', label: 'Room 2', note: `${SECOND_SP[i].length}× ${nm(mob)}; all dead = the boss loses M.Def`, ...center(SECOND_SP[i]),
      spawns: SECOND_SP[i].map(p => ({ x: p[0], y: p[1] })), mobs: [nm(mob)] });
  }
  if (MINIBOSS[i]) {
    const [id, x, y, z] = MINIBOSS[i];
    o.miniboss = { id, name: nm(id), level: lv(id), x, y, z, note: 'dead = the boss loses P.Atk' };
  }
  const [bid, bx, by, bz] = BOSS[i];
  o.boss = { id: bid, name: nm(bid), level: lv(bid), x: bx, y: by, z: bz };
  if (TELEPORTERS[i]) o.exit = { x: TELEPORTERS[i][0], y: TELEPORTERS[i][1], z: TELEPORTERS[i][2] };
  [o.entry, o.boss, o.miniboss, o.exit, ...o.rooms].filter(Boolean).forEach(p => pts.push(p));
  const pad = o.kind === 'hall' ? 1300 : 1600;
  o.box = { x1: Math.min(...pts.map(p => p.x)) - pad, x2: Math.max(...pts.map(p => p.x)) + pad, y1: Math.min(...pts.map(p => p.y)) - pad, y2: Math.max(...pts.map(p => p.y)) + pad };
  out[o.id] = o;
});
const file = path.join(ROOT, 'Dashboard', 'data', 'kamaloka_layout.json');
fs.writeFileSync(file, JSON.stringify({ generated: new Date().toISOString(), src: 'L2J High Five datapack Kamaloka.java', kamaloka: out }, null, 1));
console.log(Object.values(out).map(o => `${o.id} ${o.kind} entry ${o.entry.x},${o.entry.y} boss ${o.boss.name} (${o.boss.x},${o.boss.y}) rooms ${o.rooms.length}${o.miniboss ? ' mini ' + o.miniboss.name : ''}`).join('\n'));
