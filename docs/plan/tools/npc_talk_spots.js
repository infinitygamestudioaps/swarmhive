// npc_talk_spots.js — talk spots for NPCs that stand in a closed pocket of the geodata (2026-10-13 datafix, Rune guild).
// Some NPCs stand on a fenced platform / behind a counter (Rune Township Guild: Innocentin, Eliyah, Wagner, Valdis, Amelia, Rumiel on one dais,
// Kayan, Tifaren, Rahorakti, Mekara on another): no walk can END at their spawn point (geopath_fast.pocketIn < 60000 cells), so the atlas
// worker wrote their routes off as "straight". The talk spot = the nearest walkable cell (rings of 16 out to 200) on about the NPC's height
// (+-120) that is open to the rest of the world (pocketIn >= 60000); the NPC dialog works from there (interaction range ~150-200).
// Output: Scripts/data/nav_atlas_extra.json npcTalkSpots { "<npc key>": { at: [x,y,z], r, pocket, name, read } } (merged, atomic, locked);
// nav_atlas.js planTarget walks to `at` and keeps the NPC position on the arrive step (talkFrom).
//   node docs/plan/tools/npc_talk_spots.js --keys npc:31328@36476,-49032,...     (or --failed: every npc route whose walk is still straight)
'use strict';
const fs = require('fs'), path = require('path');
const MG = require('./manual_guard');
const geo = require('./geopath_fast'), G = geo.internals;
const ROOT = path.resolve(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data'), EXTRA = path.join(DATA, 'nav_atlas_extra.json');
const ARG = process.argv.slice(2), argv = (f) => { const i = ARG.indexOf(f); return i >= 0 ? ARG[i + 1] : null; };
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const OPEN = 60000, RMAX = 200;

function talkSpot(x, y, z) {
  const p = geo.pocketIn(x, y, z, OPEN);
  if (p >= OPEN) return { open: true, pocket: p };
  for (let r = 16; r <= RMAX; r += 16) {
    let best = null;
    for (let a = 0; a < 360; a += 5) {
      const px = x + r * Math.cos(a * Math.PI / 180), py = y + r * Math.sin(a * Math.PI / 180), s = G.snap(px, py, z, 1); if (!s) continue;
      const h = G.hAt(s.gx, s.gy, s.li); if (Math.abs(h - z) > 120) continue;
      const wx = G.toWorldX(s.gx), wy = G.toWorldY(s.gy), d = Math.hypot(wx - x, wy - y);
      if ((!best || d < best.d) && geo.pocketIn(wx, wy, h, OPEN) >= OPEN) best = { d, at: [Math.round(wx), Math.round(wy), h] };
    }
    if (best) return { open: false, pocket: p, at: best.at, r: Math.round(best.d) };
  }
  return { open: false, pocket: p, none: true };
}

if (require.main === module) {
  let keys = (argv('--keys') || '').split(/,(?=\s*[a-z]+:)/i).map(s => s.trim()).filter(Boolean);
  if (ARG.includes('--failed')) {
    const R = rd(path.join(DATA, 'nav_atlas', 'npc.json'), { routes: {} }).routes || {};
    Object.values(R).forEach(r => { if ((r.steps || []).some(s => s.do === 'walk' && s.how === 'straight')) keys.push(r.key); });
  }
  keys = [...new Set(keys)].filter(k => /^npc:\d+@-?\d+,-?\d+$/.test(k));
  const SP = rd(path.join(DATA, 'npc_atlas.json'), { npcs: [] }).npcs || [];
  const found = {};
  for (const k of keys) {
    const m = /^npc:(\d+)@(-?\d+),(-?\d+)$/.exec(k), id = +m[1], x = +m[2], y = +m[3];
    const n = SP.find(q => q.id === id && Math.round(q.x) === x && Math.round(q.y) === y); if (!n) { console.log(`${k}: not in npc_atlas.json`); continue; }
    const t = talkSpot(n.x, n.y, n.z);
    if (t.open) continue;
    if (t.none) { console.log(`${k} ${n.name}: closed pocket of ${t.pocket} cells, no open cell within ${RMAX}`); continue; }
    found[k] = { at: t.at, r: t.r, pocket: t.pocket, name: n.name, read: `INFERRED (geodata: the NPC stands in a closed pocket of ${t.pocket} cells; nearest open cell ${t.r} away, ${new Date().toISOString().slice(0, 10)})` };
    console.log(`${k} ${n.name}: pocket ${t.pocket} -> talk spot ${t.at.join(',')} (${t.r} away)`);
  }
  if (Object.keys(found).length && !ARG.includes('--dry')) MG.withLock(EXTRA, () => {
    const raw = fs.readFileSync(EXTRA, 'utf8'), fm = MG.formatOf(raw), j = JSON.parse(raw.replace(/^﻿/, ''));
    j.npcTalkSpots = Object.assign(j.npcTalkSpots || {}, found);
    MG.atomicWrite(EXTRA, MG.stringifyLike(j, fm));
  }, { who: 'npc_talk_spots.js' });
  console.log(`${Object.keys(found).length} talk spot(s)${ARG.includes('--dry') ? ' (dry run)' : ' written to nav_atlas_extra.json npcTalkSpots'}`);
}
module.exports = { talkSpot };
