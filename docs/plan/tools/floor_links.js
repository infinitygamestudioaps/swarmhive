// FLOOR LINKS (user 2026-10-09 07:30: "It can't reach level 2 of Cruma Tower. You HAVE to use the teleporter and then go through each room
// one by one to get there. This is the same principle for all dungeons, there is no straight path to a room." + 08:00: "There are 2
// gatekeepers in Cruma Tower").
//
// Writes  floors[].links  into Scripts/data/dungeon_rooms.json: every way OFF a floor
//   { to: <floor index> | -1 (out of the dungeon), kind: 'npc'|'device'|'walk', at: {x,y,z}, land: {x,y,z}, npc: {id,name,spawnlistName,x,y,z},
//     linkText, tpId, verified: true|false, evidence, viaRoom }
// and fixes  floors[].enter  where the datapack says another NPC does the job (Cruma 2nd floor: Penelope 30487, NOT Ponti 30484).
// Sources (in this order of trust): saved live pages (Logs/floor_*_*.html, Logs/npc_*.html), the datapack teleporter html
// (raw copies in Scripts/data/dp/html_teleporter/*.htm, fetched from github.com/Shagooh/l2j-server-datapack), teleports_h5.json (id -> landing),
// spawns_h5.json (where the NPC stands). The NPC names are the CLIENT names (= the name in the html page: "Gatekeeper Ponti"), the spawn list
// has older names (Janssen / Rombel / Belkadhi / Ian / Carsus).
//   node docs/plan/tools/floor_links.js [--dry]
// Never touches rooms (manual_guard writeGuarded 'room' keeps every dashboard edit).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const G = require('./manual_guard.js');
const FILE = path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const dry = process.argv.includes('--dry');

const TP = {}; rd(path.join(ROOT, 'Scripts', 'data', 'teleports_h5.json')).forEach(t => { TP[t.id] = t; });
const SP = rd(path.join(ROOT, 'Scripts', 'data', 'spawns_h5.json'));
const spawnOf = (id) => SP.find(s => s.id === id) || null;
const P = (s) => s ? { x: s.x, y: s.y, z: s.z } : null;

/** live pages saved by the bots: NPC name -> link texts seen */
function livePages() {
  const out = {}, dir = path.join(ROOT, 'Logs');
  fs.readdirSync(dir).filter(f => /^floor_.+_.+\.html$/i.test(f)).forEach(f => {
    const html = fs.readFileSync(path.join(dir, f), 'utf8'), name = f.replace(/^floor_/, '').replace(/_[^_]+\.html$/i, '');
    const links = []; const re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi; let m; while ((m = re.exec(html))) links.push(m[1].replace(/<[^>]+>/g, '').trim());
    (out[name] = out[name] || { files: [], links: new Set() }).files.push(f); links.forEach(l => out[name].links.add(l));
  });
  return out;
}

// Every NPC teleporter link inside a multi-floor dungeon that the datapack has (html page + teleport id). from/to = floor index, -1 = outside.
// verifiedText: the exact link text seen on a saved live page (Logs/floor_<npc>_*.html) -> verified.
const KNOWN = {
  'Cruma Tower': [
    { from: -1, to: 0, npcId: 30483, name: 'Mozella', spawnlistName: 'Carsus', linkText: 'Teleport into the Tower.', land: [17781, 113999, -11672],
      evidence: 'live page Logs/floor_Mozella_*.html + dungeon.log "clicked Teleport into the Tower. -> teleported (17847,113962,-11680)"; datapack CrumaTower.java' },
    { from: 0, to: -1, npcId: 30484, name: 'Ponti', spawnlistName: 'Janssen', linkText: 'Return to the ground', tpId: 22,
      evidence: 'live page Logs/floor_Ponti_*.html ("Return to the ground | Quest" = datapack html/teleporter/30484.htm, teleport 22)' },
    { from: 0, to: 1, npcId: 30487, name: 'Penelope', spawnlistName: 'Rombel', linkText: 'Teleport to the 2nd floor.', tpId: 23,
      evidence: 'datapack html/teleporter/30487.htm "Teleport to the 2nd floor." (teleport 23 "Cruma Tower 1st floor -> 2nd floor"); spawn 17877,113970,-11672 = 30 from the Mozella landing. Not clicked live yet.' },
    { from: 1, to: 0, npcId: 30485, name: 'Capella', spawnlistName: 'Belkadhi', linkText: 'Return to the first floor.', tpId: 24,
      evidence: 'datapack html/teleporter/30485.htm (teleport 24); stands at the floor 2 landing (north end)' },
    { from: 1, to: 2, npcId: 30486, name: 'Hanna', spawnlistName: 'Ian', linkText: 'Go to the 3rd floor.', tpId: 55,
      evidence: 'datapack html/teleporter/30486.htm (teleport 55); stands at the SOUTH end of floor 2 (17722,119749): reached by walking room by room through floor 2' },
    { from: 2, to: 1, npcId: 31843, name: 'Teleportation Cubic', spawnlistName: 'Teleportation Cubic', kind: 'device', linkText: 'Go back to the 2nd floor.', tpId: 58,
      evidence: 'datapack html/teleporter/31843.htm (teleport 58, lands next to Hanna)' },
    { from: 2, to: 'core', npcId: 31843, name: 'Teleportation Cubic', spawnlistName: 'Teleportation Cubic', kind: 'device', linkText: 'Teleport into The Core room.', tpId: 56,
      evidence: 'datapack html/teleporter/31843.htm (teleport 56, the Core grand boss room; not a hunting floor)' },
  ],
};

const MENUS = require('./npc_menus.js');
const NPCS = rd(path.join(ROOT, 'Scripts', 'data', 'npcs_h5.json'));
const zFloor = (d, z) => { let best = -1, bd = 1e9; d.floors.forEach((f, i) => { if (!f.z) return; if (z >= f.z[0] && z <= f.z[1]) { const c = Math.abs(z - (f.z[0] + f.z[1]) / 2); if (c < bd) { bd = c; best = i; } } }); if (best >= 0) return best;
  d.floors.forEach((f, i) => { if (!f.z) return; if (z >= f.z[0] - 500 && z <= f.z[1] + 500) { const c = Math.min(Math.abs(z - f.z[0]), Math.abs(z - f.z[1])); if (c < bd) { bd = c; best = i; } } }); return best; };
const inBox = (d, p, pad) => { const b = d.bbox; return b && p.x >= b[0] - pad && p.x <= b[1] + pad && p.y >= b[2] - pad && p.y <= b[3] + pad; };
/** every teleporter NPC standing in / at the dungeon whose datapack menu lands on one of its floors (or leads out): generic links */
function autoLinks(d, live) {
  const fl = d.floors || [], zs = fl.map(f => f.z).flat(), z0 = Math.min(...zs) - 600, z1 = Math.max(...zs) + 600;
  const door = d.entrance ? { x: d.entrance.x, y: d.entrance.y } : null;
  const isNpc = (id) => { const n = NPCS[id]; return n && !/Monster|RaidBoss|GrandBoss|Minion|Chest/i.test(n.ty || ''); };
  const near = SP.filter(s => isNpc(s.id) && ((inBox(d, s, 1500) && s.z >= z0 && s.z <= z1) || (door && Math.hypot(s.x - door.x, s.y - door.y) < 2500)));
  const out = [];
  near.forEach(s => {
    const m = MENUS.menuOf(s.id), nf = inBox(d, s, 300) ? zFloor(d, s.z) : -1;
    const all = m.teleports.map(t => ({ text: t.text, tpId: t.tpId || null, ev: t.ev || null, dest: t.dest, desc: t.desc, price: t.price, needs: t.needs || null, page: t.page }))
      .concat(m.scripted.filter(x => x.dest).map(x => ({ text: x.text, tpId: null, ev: x.script, dest: x.dest, desc: x.script, price: 0, needs: x.needs || null, page: 'ai/' + x.script })));
    all.forEach(t => {
      const df = inBox(d, t.dest, 300) ? zFloor(d, t.dest.z) : -1;
      if (df === nf) return;                                              // same floor / both outside: not a floor link
      const nm = (NPCS[s.id] && NPCS[s.id].n) || s.name;
      const lp = live[nm], seen = !!(lp && lp.links.has(t.text));
      out.push({ from: nf, to: df, kind: /cub|device|crystal|mirror|vortex/i.test(nm) ? 'device' : 'npc', at: { x: s.x, y: s.y, z: s.z }, land: { x: t.dest.x, y: t.dest.y, z: t.dest.z },
        npc: { id: s.id, name: nm, spawnlistName: s.name, x: s.x, y: s.y, z: s.z, link: t.text }, linkText: t.text, tpId: t.tpId, ev: t.ev, needs: t.needs, price: t.price,
        verified: seen, evidence: `datapack ${t.page} "${t.text}" -> ${t.desc || ''} (${t.dest.x},${t.dest.y},${t.dest.z})${t.needs ? ' — needs ' + t.needs : ''}${seen ? ' [link text seen live]' : ''}`, source: 'datapack-auto' });
    });
  });
  return out;
}
function buildLinks(d, live) {
  const K = KNOWN[d.name] || [];
  const fl = d.floors || [];
  fl.forEach(f => { f.links = (f.links || []).filter(l => l.source && l.source !== 'datapack-npc' && l.source !== 'datapack-auto'); });
  d.entryLinks = (d.entryLinks || []).filter(l => l.source !== 'datapack-auto');
  let n = 0;
  K.forEach(k => {
    const s = spawnOf(k.npcId), at = P(s);
    const land = k.land ? { x: k.land[0], y: k.land[1], z: k.land[2] } : k.tpId && TP[k.tpId] ? { x: TP[k.tpId].x, y: TP[k.tpId].y, z: TP[k.tpId].z } : null;
    const lp = live[k.name], seen = !!(lp && lp.links.has(k.linkText));
    const npc = { id: k.npcId, name: k.name, spawnlistName: k.spawnlistName, x: at.x, y: at.y, z: at.z, link: k.linkText };
    const L = { to: k.to, kind: k.kind || 'npc', at, land, npc, linkText: k.linkText, tpId: k.tpId || null, verified: seen, evidence: k.evidence + (seen ? ' [link text seen live]' : ''), source: 'datapack-npc' };
    if (k.from >= 0) { (fl[k.from].links = fl[k.from].links || []).push(L); n++; }
    // the floor's own enter: the NPC whose link lands on it (from the floor below / outside)
    if (typeof k.to === 'number' && k.to >= 0 && fl[k.to] && (k.from === -1 || k.from === k.to - 1)) {
      const F = fl[k.to], old = F.enter && F.enter.npc;
      F.enter = Object.assign({}, F.enter || {}, { how: 'teleporter', from: [at.x, at.y, at.z], npc, landing: land ? [land.x, land.y, land.z] : (F.enter && F.enter.landing) });
      if (old && old.id !== npc.id) {
        F.enter.note = `${k.name} (${k.npcId}) at ${at.x},${at.y},${at.z}: "${k.linkText}" (teleport ${k.tpId}). FIXED 2026-10-09: was ${old.name} (${old.id}), whose live menu is only "Return to the ground | Quest". ` + String(F.enter.note || '').replace(/^Ponti or Penelope[^.]*\.\s*/, '');
        F.enter.fixed = { at: '2026-10-09', was: { id: old.id, name: old.name } };
      }
      F.enter.verified = seen; F.enter.evidence = L.evidence;
    }
  });
  // a floor entered by a teleporter NPC that stands on ANOTHER floor (Klein -> Hall of Flames, Dwyph -> lower layer): that floor's link
  fl.forEach((F, k) => {
    const en = F.enter || {}; if (en.how !== 'teleporter' || !en.npc || !Array.isArray(en.from)) return;
    if (fl.some((G, j) => j < k && G.enter && G.enter.npc && G.enter.npc.id === en.npc.id)) return;     // the same NPC as an upper floor's (Mithril: Tarun for 3 floors)
    const src = zFloor(d, en.from[2]); if (src < 0 || src === k) return;
    if ((fl[src].links || []).some(x => x.to === k && x.npc && x.npc.id === en.npc.id)) return;
    const land = Array.isArray(en.landing) ? { x: en.landing[0], y: en.landing[1], z: en.landing[2] } : null;
    (fl[src].links = fl[src].links || []).push({ to: k, kind: 'npc', at: { x: en.from[0], y: en.from[1], z: en.from[2] }, land, npc: en.npc, linkText: en.npc.link || null, tpId: null,
      verified: false, evidence: `dungeon_rooms.json enter of ${F.name}: ${String(en.note || '').slice(0, 200)}`, source: 'datapack-auto' }); n++;
  });
  // generic: every other teleporter NPC of the dungeon (datapack html / AI menus)
  autoLinks(d, live).forEach(L => {
    const dup = (L.from >= 0 ? (fl[L.from].links || []) : (d.entryLinks || [])).some(x => x.npc && x.npc.id === L.npc.id && x.to === L.to);
    if (dup) return;
    if (L.from >= 0) { (fl[L.from].links = fl[L.from].links || []).push(L); n++; }
    else if (L.to >= 0) { const E = Object.assign({}, L); (d.entryLinks = d.entryLinks || []).push(E); n++; }
  });
  return n;
}

const D = rd(FILE), live = livePages();
let total = 0;
D.forEach(d => { const n = buildLinks(d, live); if (n) { total += n; console.log(`${d.name}: ${n} floor links`); d.floors.forEach((f, i) => console.log(`  ${i} ${f.name}: enter ${f.enter && f.enter.npc ? f.enter.npc.name + ' "' + f.enter.npc.link + '"' : f.enter && f.enter.how} | links ${(f.links || []).map(l => `${l.npc ? l.npc.name : l.kind} -> ${l.to}${l.verified ? ' (live)' : ''}`).join(', ')}`)); } });
if (dry) { console.log('dry run, nothing written'); process.exit(0); }
const bak = path.join(ROOT, 'Settings', 'backup', `dungeon_rooms_before_floorlinks_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.copyFileSync(FILE, bak);
G.writeGuarded(FILE, D, 'room', { who: 'floor_links.js' });
console.log(`written: ${total} links, backup ${path.relative(ROOT, bak)}`);
