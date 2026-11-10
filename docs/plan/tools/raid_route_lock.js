// LOCK A SANE RAID ROUTE FROM A CHOSEN GATEKEEPER LANDING (tester Vykaax 2026-11-10, Discord #swarmhive #15: "path to Paniel the Unicorn goes
// straight up a mountain into EV (Enchanted Valley). Somehow they manage to get up the hill, but then they fall through the terrain coming down
// and go underground.")
//
// Root cause (Paniel 25159): the atlas route (raid policy, nav_atlas.js) starts at Aden -> Coliseum, climbs the ridge east of the valley to
// z -2616 and then takes a policy DROP off a cliff (127720,42120,-3144 -> 126840,42120,-4616: 1,470 down over 880 units, slope up to 3.3 = 73 deg)
// - in the client that is falling through the terrain. The old recording (Tank1 2026-10-11, Aden -> Coliseum, not locked) ends ON the ridge
// (127660,43410,-2944, 2.7 km from the boss). The Southern Pathway has a 1,150-down slide too (slope 2.7). The Northern Pathway of Enchanted
// Valley (Hunters gatekeeper Esmeralda, live menu "Enchanted Valley, Northern Region") walks the valley floor: steepest 96-unit stretch 1.33.
//
// This tool plans landing -> boss on the geodata (geopath, legs <= 300, no swimming), refuses a route with a stretch steeper than --max-slope
// (default 1.5 over 96 units) and writes it as a LOCKED own route (routes/raid/<id>.json, manual: true, start = the gatekeeper teleport; the old
// file goes to routes/raid/history/) + the same walk into the nav atlas entry (raid.json + t/raid_<id>.json: town + gk + walk + arrive), so
// 'auto' (locked = own route) and 'computed path' are both sane. raid_routes.js never overwrites a locked route.
//   node docs/plan/tools/raid_route_lock.js --boss 25159 --gk "Hunters -> Northern Pathway of Enchanted Valley" [--max-slope 1.5] [--dry]
// Test: docs/plan/tools/test_paniel_route.js
'use strict';
const fs = require('fs'), path = require('path');
const geo = require('./geopath');
const MG = require('./manual_guard');
const ROOT = path.join(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data'), ATLAS = path.join(DATA, 'nav_atlas');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

/** the steepest stretches of a walk: sample every 16 units on the geodata (the layer nearest the last height), height change over 96 units.
 *  pts = [{x,y,z}] -> [{ at: [x,y,z], dz, d, slope, leg }] steepest first */
function slopes(pts, win) {
  win = win || 96; const s = []; let z = pts[0].z;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 16));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n, ls = geo.layers(geo.toGeoX(x), geo.toGeoY(y)) || [];
      let best = null; for (const l of ls) if (!best || Math.abs(l.h - z) < Math.abs(best.h - z)) best = l;
      if (best) z = best.h;
      s.push({ x, y, z, leg: i });
    }
  }
  const cum = [0]; for (let i = 1; i < s.length; i++) cum.push(cum[i - 1] + Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y));
  const out = []; let j = 0;
  for (let i = 0; i < s.length; i++) {
    while (j < s.length - 1 && cum[j] - cum[i] < win) j++;
    const dz = s[j].z - s[i].z, d = Math.max(16, cum[j] - cum[i]);
    out.push({ at: [Math.round(s[i].x), Math.round(s[i].y), s[i].z], dz, d: Math.round(d), slope: Math.abs(dz) / d, leg: s[i].leg });
  }
  return out.sort((a, b) => b.slope - a.slope);
}
const flatPts = (P) => { const o = []; for (let i = 0; i < P.length; i += 3) o.push({ x: P[i], y: P[i + 1], z: P[i + 2] }); return o; };

function main() {
  const id = Number(arg('--boss')), desc = arg('--gk'), maxSlope = Number(arg('--max-slope', 1.5)), dry = argv.includes('--dry');
  if (!id || !desc) { console.log('usage: --boss <id> --gk "<Town> -> <Destination>"'); process.exit(2); }
  const RB = rd(path.join(DATA, 'raidbosses_h5.json')), b = (RB.bosses || RB).find(x => x.id === id); if (!b) throw new Error('boss ' + id + ' not in raidbosses_h5.json');
  // the gatekeeper step (town + gk) from any atlas route that already uses this teleport (live menu link, npc, landing)
  const RJ = rd(path.join(ATLAS, 'raid.json')); let pre = null;
  for (const r of Object.values(RJ.routes || {})) { const k = (r.steps || []).findIndex(s => s.do === 'gk' && s.desc === desc); if (k > 0 && r.steps[k - 1].do === 'town') { pre = [r.steps[k - 1], r.steps[k]]; break; } }
  if (!pre) throw new Error(`no atlas route uses "${desc}" - its town / gatekeeper step is unknown`);
  const L = pre[1].landing, land = { x: L[0], y: L[1], z: L[2] }, boss = { x: b.x, y: b.y, z: b.z };
  const p = geo.findPath(land, boss, { pad: 4000, maxMs: 120000, maxNodes: 8e6, maxLeg: 300, noSwim: true });
  if (!p.ok) throw new Error('no path: ' + p.reason);
  const pts = [land].concat(p.points.map(q => ({ x: Math.round(q.x), y: Math.round(q.y), z: Math.round(q.z) })));
  const st = slopes(pts), worst = st[0];
  console.log(`${b.name}: ${desc}, ${pts.length} points, ${p.lengthUnits} units, steepest ${worst.slope.toFixed(2)} at ${worst.at.join(',')} (dz ${worst.dz} over ${worst.d})`);
  if (worst.slope > maxSlope) throw new Error(`refused: a stretch steeper than ${maxSlope} (cliff / slide) - choose another start`);
  if (dry) return;
  const file = path.join(DATA, 'routes', 'raid', id + '.json');
  if (fs.existsSync(file)) { fs.mkdirSync(path.join(DATA, 'routes', 'raid', 'history'), { recursive: true }); fs.copyFileSync(file, path.join(DATA, 'routes', 'raid', 'history', `${id}_${Date.now()}.json`)); }
  const from = pre[1].from, at = new Date().toISOString();
  const route = { boss: b.name, id, landing: desc, start: { kind: 'gk', desc, from }, length: p.lengthUnits, points: pts, savedAt: at, editedAt: at, uses: 0, lastOk: null, fails: 0, manual: true,
    by: 'raid_route_lock.js', note: `locked ${at.slice(0, 10)} (tester report: the Aden -> Coliseum way climbs the ridge and drops off a cliff); steepest stretch ${worst.slope.toFixed(2)}` };
  MG.atomicWrite(file, JSON.stringify(route, null, 1));
  // the nav atlas entry: same walk (so a party that picks "computed path" walks it too)
  const key = 'raid:' + id, walk = { do: 'walk', points: [].concat(...pts.map(q => [q.x, q.y, q.z])), len: p.lengthUnits, danger: (RJ.routes[key] && RJ.routes[key].maxDanger) || 0, how: 'geodata', locked: true };
  const fixR = (R) => { if (!R) return; const oldLen = R.length || 0; R.steps = [pre[0], pre[1], walk, { do: 'arrive', target: key, x: b.x, y: b.y, z: b.z }]; R.from = pre[0].cmd; R.length = p.lengthUnits; R.sec = Math.round((R.sec || 0) + (p.lengthUnits - oldLen) / 120);
    R.flags = (R.flags || []).filter(f => f !== 'drop'); R.source = 'locked'; R.note = route.note; delete R.alt; };
  fixR(RJ.routes[key]); MG.atomicWrite(path.join(ATLAS, 'raid.json'), JSON.stringify(RJ));
  const tf = path.join(ATLAS, 't', 'raid_' + id + '.json'); if (fs.existsSync(tf)) { const T = rd(tf); fixR(T); MG.atomicWrite(tf, JSON.stringify(T)); }
  console.log(`written: ${path.relative(ROOT, file)} (locked) + nav atlas ${key}`);
}
if (require.main === module) main();
module.exports = { slopes, flatPts };
