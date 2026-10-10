// RAID VERIFY (user 2026-10-05 23:30: "why are you so misaligned about where the raid bosses are — update your data so you KNOW where
// monsters are and what level they are"). For every raid boss in Scripts/data/raidbosses_h5.json:
//   1) landings: every "Town -> Field" teleport from one of the 11 .townname towns, checked against the LIVE gatekeeper menus the bots
//      saw on L2Toggle (Scripts/data/gk_live/*.json); a town whose menu we never saw is allowed but marked unverified
//   2) the REAL walk: our wall path finder (geopath.js) from the 4 nearest landings to the boss; the shortest working one wins;
//      none = unreachable (with the reason)
//   3) danger ALONG THAT WALK: the strongest monster within 1200 of the path, on the same height (+-600), raid bosses/minions excluded
// Writes back: nearestTeleport (= the verified landing), routeMaxMobLevel / routeDanger (along the real walk), walkReal, reachable,
// verified { ... }. Backup of the old file first. Run: node docs/plan/tools/raid_verify.js [maxLevel]
const fs = require('fs');
const path = require('path');
const geo = require('./geopath');
const ROOT = path.join(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8').replace(/^﻿/, ''));
const maxLevel = Number(process.argv[2] || 90);
const onlyNames = process.argv[3] ? process.argv[3].split(',').map(s => s.trim().toLowerCase()) : null;   // test: only these bosses
const rbFile = path.join(DATA, 'raidbosses_h5.json'), outFile = path.join(DATA, 'raidbosses_h5.verified.json');   // checked by hand, then copied over
const rb = read('raidbosses_h5.json');
fs.copyFileSync(rbFile, path.join(ROOT, 'Settings', 'backup', `raidbosses_h5_before_verify_${Date.now()}.json`));
const tps = read('teleports_h5.json'), npcs = read('npcs_h5.json'), spawns = read('spawns_h5.json');
const TOWNS = { Gludin: 'Gludin', Gludio: 'Gludio', Dion: 'Dion', Giran: 'Giran', Oren: 'Oren', Aden: 'Aden', Hunters: 'Hunters', Heine: 'Heine', Goddard: 'Goddard', Rune: 'Rune', Schuttgart: 'Schuttgart' };
const TOWN_ALIASES = { 'Town of Gludio': 'Gludio', 'Town of Aden': 'Aden', 'Town of Giran': 'Giran', 'Town of Dion': 'Dion', 'Town of Oren': 'Oren', 'Town of Goddard': 'Goddard', 'Town of Schuttgart': 'Schuttgart', 'Rune Township': 'Rune', 'Hunters Village': 'Hunters' };
const townOf = (s) => { s = String(s || '').trim(); return TOWNS[s] || TOWN_ALIASES[s] || null; };
// a town / village as destination ("The Town of Giran", "The Village of Gludin", "Rune Township"): never a field landing
const isTownDest = (s) => !!townOf(s) || /\b(town of|village of|township|airship|harbor|harbour)\b|\btown$|^the (elven|dark elf|dwarven|orc|kamael) village$|village$/i.test(String(s || '').trim());
// datapack destination -> the name on L2Toggle's live menus (2026-10-05: Gludio's Bella shows 'The Ant Nest' for the datapack's 'Ant Cave')
const ALIAS = { 'ant cave': 'ant nest' };
// apostrophes dropped ("Breka's" = "Brekas"), "the"/"town of"/price suffixes dropped, plural s dropped per word
const norm = (t) => { let s = String(t || '').toLowerCase().replace(/<[^>]+>/g, '').replace(/['’`]/g, '').replace(/\s*\(.*$/, '').replace(/\b(the|town of)\b/g, '').replace(/\b(free|\d[\d,]*\s*adena)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); return ALIAS[s] || s; };
const words = (s) => norm(s).split(' ').filter(w => w.length >= 3 && w !== 'entrance' && w !== 'to').map(w => w.replace(/s$/, ''));
// live gatekeeper menus by town
const live = {};
for (const f of fs.readdirSync(path.join(DATA, 'gk_live')).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(DATA, 'gk_live', f), 'utf8').replace(/^﻿/, ''));
    const t = townOf(j.town) || j.town; if (!t) continue;
    const links = (live[t] = live[t] || new Set());
    Object.values(j.pages || {}).forEach(ls => ls.forEach(l => links.add(norm(l))));
  } catch (e) { }
}
// word match: every significant word of the shorter name is in the longer one ("Alligator Island" ~ "Entrance to Alligator Islands")
const onLiveMenu = (town, dest) => {
  const s = live[town]; if (!s) return null;
  const dw = words(dest); if (!dw.length) return false;
  for (const l of s) {
    const lw = l.split(' ').filter(w => w.length >= 3 && w !== 'entrance' && w !== 'to').map(w => w.replace(/s$/, ''));
    if (!lw.length) continue;
    const [a, b] = dw.length <= lw.length ? [dw, lw] : [lw, dw];
    if (a.every(w => b.includes(w))) return true;
  }
  return false;
};
// landings: Town -> Field, town has .townname
const landings = [];
for (const e of tps) {
  const [a, b] = String(e.desc || '').split('->').map(s => s.trim());
  const town = townOf(a); if (!town || !b || isTownDest(b) || e.x == null) continue;
  const lm = onLiveMenu(town, b);
  if (lm === false) continue;                                       // the town's real menu has no such link
  landings.push({ town, desc: `${town} -> ${b}`, dest: b, x: e.x, y: e.y, z: e.z, price: e.price || 0, liveMenu: lm === true });
}
// monsters for the danger check (raid bosses + minions excluded)
const skip = new Set(); rb.bosses.forEach(b => { skip.add(b.name); (b.minions || []).forEach(m => skip.add(m)); });
const B = 1500, grid = new Map();
for (const s of spawns) { const n = npcs[s.id]; if (!n || n.ty !== 'L2Monster' || !n.l || skip.has(n.n)) continue; const k = Math.floor(s.x / B) + ',' + Math.floor(s.y / B); (grid.get(k) || grid.set(k, []).get(k)).push({ x: s.x, y: s.y, z: s.z, l: n.l, n: n.n }); }
function dangerAlong(pts) {
  let max = 0, worst = null;
  // the LANDING itself, like the bot's teleport check: 3000 around it, same height band (Sejarr 2026-10-05: level-85 Drakos at the Antharas Lair landing)
  { const L = pts[0]; for (let gx = Math.floor((L.x - 3000) / B); gx <= Math.floor((L.x + 3000) / B); gx++) for (let gy = Math.floor((L.y - 3000) / B); gy <= Math.floor((L.y + 3000) / B); gy++) for (const m of grid.get(gx + ',' + gy) || []) if (m.l > max && Math.hypot(m.x - L.x, m.y - L.y) <= 3000 && Math.abs(m.z - L.z) < 950) { max = m.l; worst = m; } }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(d / 300));
    for (let s = 0; s <= steps; s++) {
      const x = a.x + (b.x - a.x) * s / steps, y = a.y + (b.y - a.y) * s / steps, z = a.z + (b.z - a.z) * s / steps;
      for (let gx = Math.floor((x - 1200) / B); gx <= Math.floor((x + 1200) / B); gx++) for (let gy = Math.floor((y - 1200) / B); gy <= Math.floor((y + 1200) / B); gy++)
        for (const m of grid.get(gx + ',' + gy) || []) if (m.l > max && Math.hypot(m.x - x, m.y - y) <= 1200 && Math.abs(m.z - z) < 600) { max = m.l; worst = m; }
    }
  }
  return { max, worst };
}
let done = 0, ok = 0, bad = 0;
const t0 = Date.now();
for (const b of rb.bosses) {
  if (b.level > maxLevel) continue;
  if (onlyNames && !onlyNames.some(n => b.name.toLowerCase().includes(n))) continue;
  const cands = landings.map(l => ({ ...l, d: Math.hypot(l.x - b.x, l.y - b.y) })).filter(l => l.d < 40000).sort((p, q) => p.d - q.d).slice(0, 4);
  let best = null; const tried = [];
  const tryOne = (l, ms, pad) => {
    const r = geo.findPath({ x: l.x, y: l.y, z: l.z }, { x: b.x, y: b.y, z: b.z }, { maxMs: ms, pad, maxLeg: 1000, maxNodes: 8e6 });
    tried.push(`${l.desc}: ${r.ok ? r.lengthUnits + ' units' : r.reason}`);
    if (r.ok && (!best || r.lengthUnits < best.len)) best = { l, len: r.lengthUnits, pts: [{ x: l.x, y: l.y, z: l.z }].concat(r.points) };
  };
  for (const l of cands) tryOne(l, 8000, 4000);
  if (!best) for (const l of cands.slice(0, 2)) tryOne(l, 25000, 6000);     // long routes: a second, longer try
  done++;
  if (best) {
    const dg = dangerAlong(best.pts);
    b.nearestTeleport = { from: best.l.town, to: best.l.dest, desc: best.l.desc, x: best.l.x, y: best.l.y, z: best.l.z, price: best.l.price, walkDist: best.len, verified: true, liveMenu: best.l.liveMenu };
    b.walkReal = best.len; b.reachable = true;
    b.routeMaxMobLevel = dg.max; b.routeDanger = dg.worst ? `${dg.worst.n} lvl ${dg.worst.l} at ${dg.worst.x},${dg.worst.y} (on the walk)` : '';
    b.verified = { at: new Date().toISOString(), landing: best.l.desc, walk: best.len, waypoints: best.pts.length - 1, liveMenu: best.l.liveMenu, tried };
    ok++;
  } else {
    b.reachable = false;
    b.verified = { at: new Date().toISOString(), landing: null, reason: cands.length ? 'no walkable route from any of the nearest landings' : 'no town landing within 40 km', tried };
    bad++;
  }
  if (done % 10 === 0) { fs.writeFileSync(outFile, JSON.stringify(rb, null, 1)); process.stdout.write(`${done} bosses, ${Math.round((Date.now() - t0) / 1000)} s (saved)\n`); }
}
rb.verifiedNote = 'nearestTeleport / walkReal / routeMaxMobLevel verified with live gatekeeper menus + the geodata path finder (docs/plan/tools/raid_verify.js)';
fs.writeFileSync(outFile, JSON.stringify(rb, null, 1));
console.log(`done: ${done} bosses checked, ${ok} reachable, ${bad} not reachable, ${Math.round((Date.now() - t0) / 1000)} s`);
for (const b of rb.bosses.filter(b => b.level >= 28 && b.level <= 45 && b.verified).sort((p, q) => p.level - q.level))
  console.log(`${String(b.level).padStart(2)} ${b.name.padEnd(36)} ${b.reachable ? `${b.nearestTeleport.desc} + ${Math.round(b.walkReal / 100) / 10}k walk, danger ${b.routeMaxMobLevel}${b.nearestTeleport.liveMenu ? '' : ' (menu unverified)'}` : 'NOT REACHABLE: ' + b.verified.reason}`);
