// ROUTE FLOOR FIX (owner 2026-10-14: "why is the team running into the water every time they try to reach this raid boss? Are the points below the
// bridge?" - Water Couatle Ateka's hand-drawn route had every point at z -3624; at the Heine bridge (deck ~-3472, river bed ~-3984) the bots took
// the river bed = under / beside the bridge into the water). For every raid route (Scripts/data/routes/raid/<id>.json) a hand-drawn point (one flat
// z for every point: the map gives no height) is put on the floor the walkers can really reach from the previous point.
// 2026-10-15 (owner: "Route to Ketra Commander Atis is off the Ivory Tower bridge and then down a cliff face. They just get stuck."): the old rule
//   only moved a point whose stored z was > 200 off the floor the walkers pick. Atis point 5 had z -3672 on the Ivory Tower bridge: deck -3512,
//   ground under it -3744 -> the walkers (nearest floor at or below z + 64) took the GROUND under the bridge (only 72 off, so never fixed) and the
//   team left the bridge for a cliff / the ground below it and got stuck. NEW RULE (WALK-CONNECTED FLOOR): where a point has several floors, every
//   floor is tried as the goal of a land walk (geodata, no drops, no swimming) from the previous point's (already fixed) floor; the walkers' pick
//   stays unless it is unreachable or > 1.3x + 300 longer than the best floor (= a bridge deck vs the ground under it, an overhang, a tunnel roof);
//   then the point gets the best floor's z. A single-floor point > 400 off its floor (the path finders' snap limit) gets the floor's z too (Atis points 8 / 9: z -3672 on ground
//   at -3120: "not on walkable geodata" for every check). Dungeon / floor steps reset the chain; swim / drop points and points inside a water
//   zone are left alone; a stored z within 48 of one of the floors is a recorded height and trusted. A route is written only when no leg gets worse
//   (every leg touching a changed point walkable afterwards if it was before) and the floor-jump check (routestore floorCheck) still passes.
//   node docs/plan/tools/route_floor_fix.js            dry run (prints what would change and whether every leg is walkable afterwards)
//   node docs/plan/tools/route_floor_fix.js --write    writes (a history copy of each route first: routes/raid/history/<id>_<time>_before_floor_fix.json)
//   node docs/plan/tools/route_floor_fix.js --only 25026[,id...]   only these routes
// Used by raid_routes.js checkLocked (a point on the wrong floor = a bad leg) and test_raid_routes_all.js.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const D = path.join(ROOT, 'Scripts', 'data', 'routes', 'raid');
let GF = null; const gf = () => GF || (GF = require('./geopath_fast'));
let WZ = null; const wet = (p) => { if (WZ === null) { try { WZ = require('./water_zones'); WZ.load && WZ.load(); } catch (e) { WZ = false; } } try { return !!(WZ && WZ.zoneAt(p.x, p.y, p.z)); } catch (e) { return false; } };
const RULE = { farOff: 400, trusted: 48, factor: 1.3, slack: 300, maxDz: 1500, pad: 1500, maxNodes: 300000, maxMs: 6000 };
const isStep = (e) => !!(e && (e.do === 'floor' || e.do === 'dungeon'));
/** the floors (heights) at a world x/y */
function floorsAt(x, y) {
  const I = gf().internals, gx = I.toGeoX(x), gy = I.toGeoY(y), R = I.reg(gx, gy); if (!R) return [];
  const i = I.cix(gx, gy), n = R.cnt[i], out = []; for (let l = 0; l < n; l++) if (R.N[R.first[i] + l] !== 0) out.push(R.H[R.first[i] + l]); return out;
}
/** the floor the walkers take for a stored z (nearest at or below z + 64, else the nearest at all: geopath layerAt) */
function walkerFloor(L, z) { let best = null, bd = 1e9; for (const h of L) { const d = h <= z + 64 ? z - h : 10000 + h - z; if (d < bd) { bd = d; best = h; } } return best; }
/** land walk length from a to b (b on the floor bz), or null */
function walkLen(a, b, bz) {
  if (Math.hypot(a.x - b.x, a.y - b.y) < 24 && Math.abs(a.z - bz) <= 48) return 0;
  try { const q = gf().findPath(a, { x: b.x, y: b.y, z: bz }, { swim: false, maxNodes: RULE.maxNodes, maxMs: RULE.maxMs, pad: RULE.pad, maxLeg: 1000, noLearned: true });
    if (!q.ok) return null; const e = q.points[q.points.length - 1]; return e && Math.abs(e.z - bz) <= 48 ? q.lengthUnits : null; } catch (e) { return null; }
}
/** PURE-ish (geodata reads only): the route points with every hand-drawn height on its walk-connected floor -> { points, changes: [{ i, from, walker, to, why }] } */
function fixFloors(points) {
  const out = (points || []).map(p => (p && typeof p === 'object' ? Object.assign({}, p) : p)), changes = [];
  let prev = null;
  out.forEach((p, i) => {
    if (isStep(p)) { prev = null; return; }
    if (!p || !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) return;
    if (p.swim || p.water || wet(p)) { prev = p; return; }                 // a swim point: any height in the water column is fine
    const L = floorsAt(p.x, p.y); if (!L.length) { prev = p; return; }
    const pick = walkerFloor(L, p.z);
    let to = null, why = '';
    if (L.length === 1) { if (Math.abs(pick - p.z) > RULE.farOff) { to = pick; why = `${Math.round(Math.abs(pick - p.z))} off its only floor`; } }
    else if (prev && !p.drop && !wet(prev) && Math.abs(p.z - prev.z) <= RULE.maxDz && !L.some(h => Math.abs(h - p.z) <= RULE.trusted)) {   // a z ON a floor (recorded) is trusted
      const cand = L.filter(h => Math.abs(h - prev.z) <= RULE.maxDz || h === pick);
      const lens = new Map(cand.map(h => [h, walkLen(prev, p, h)]));
      let best = null; for (const h of cand) { const v = lens.get(h); if (v === null) continue; if (best === null || v < lens.get(best) || (v === lens.get(best) && Math.abs(h - p.z) < Math.abs(best - p.z))) best = h; }
      const pv = lens.has(pick) ? lens.get(pick) : walkLen(prev, p, pick);
      if (best !== null && best !== pick && (pv === null || pv > RULE.factor * lens.get(best) + RULE.slack)) { to = best; why = pv === null ? `the walkers' floor ${pick} cannot be walked to from the previous point` : `the walkers' floor ${pick} is a ${pv} walk, floor ${best} only ${lens.get(best)}`; }
    } else if (!prev && Math.abs(pick - p.z) > RULE.farOff) {          // first point: nearest floor when the stored z is far off every floor
      const near = L.slice().sort((a, b) => Math.abs(a - p.z) - Math.abs(b - p.z))[0]; if (near !== pick) { to = near; why = `${Math.round(Math.abs(pick - p.z))} off the walkers' floor`; }
    }
    if (to !== null) { changes.push({ i, from: Math.round(p.z), walker: pick, to, why }); p.z = to + 8; }
    prev = p;
  });
  return { points: out, changes };
}
module.exports = { fixFloors, floorsAt, walkerFloor, RULE };

if (require.main === module) {
  const WRITE = process.argv.includes('--write'), oi = process.argv.indexOf('--only'), ONLY = oi > 0 ? new Set(String(process.argv[oi + 1] || '').split(',')) : null;
  let changedRoutes = 0, flagged = 0;
  for (const f of fs.readdirSync(D).filter(f => /^\d+\.json$/.test(f))) {
    if (ONLY && !ONLY.has(f.replace('.json', ''))) continue;
    let r; try { r = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8').replace(/^﻿/, '')); } catch (e) { continue; }
    const P = r.points || []; if (P.length < 2) continue;
    const { points: out, changes } = fixFloors(P);
    if (!changes.length) continue; flagged++;
    // every leg touching a changed point: walkable afterwards (a short way around is fine), or already not walkable before (never worse)
    const legOk = (A, B) => { const L = Math.hypot(A.x - B.x, A.y - B.y); try { const q = gf().findPath(A, B, { swim: false, drops: true, maxNodes: RULE.maxNodes, maxMs: 8000, pad: RULE.pad, maxLeg: 1000, noLearned: true }); return q.ok && q.lengthUnits < L * 3 + 600; } catch (e) { return false; } };
    const bad = [], worse = [];
    const idx = new Set(changes.map(c => c.i));
    const legs = new Set(); idx.forEach(i => { legs.add(i - 1); legs.add(i); });
    legs.forEach(a => { const b = a + 1; if (a < 0 || b >= out.length || isStep(out[a]) || isStep(out[b])) return;
      if (!legOk(out[a], out[b])) { const k = `${a + 1}->${b + 1}`; bad.push(k); if (legOk(P[a], P[b])) worse.push(k); } });
    let fcBad = ''; try { const RS = require(path.join(ROOT, 'Dashboard', 'routestore.js')); if (RS.floorCheck(r).ok && !RS.floorCheck(Object.assign({}, r, { points: out })).ok) fcBad = RS.floorCheck(Object.assign({}, r, { points: out })).why; } catch (e) { }
    console.log(`${f} ${r.manual ? 'manual' : 'auto'} ${r.boss || r.name || ''}: ${changes.map(c => `point ${c.i + 1}: z ${c.from} (walkers took ${c.walker}) -> ${c.to} (${c.why})`).join(' | ')}${bad.length ? '  LEGS NOT WALKABLE: ' + bad.join(',') + (worse.length ? ' (WORSE than before: ' + worse.join(',') + ' -> not written)' : ' (as before)') : '  (legs ok)'}${fcBad ? '  FLOOR CHECK WOULD FAIL -> not written: ' + fcBad : ''}`);
    if (WRITE && !worse.length && !fcBad) {
      fs.mkdirSync(path.join(D, 'history'), { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '_');
      fs.copyFileSync(path.join(D, f), path.join(D, 'history', f.replace('.json', `_${stamp}_before_floor_fix.json`)));
      r.points = out; r.edited = Object.assign({}, r.edited || {}, { by: `route_floor_fix.js (walk-connected floors: ${changes.length} point(s))`, at: new Date().toISOString() });
      const t = path.join(D, f) + '.tmp' + process.pid; fs.writeFileSync(t, JSON.stringify(r, null, 1)); fs.renameSync(t, path.join(D, f)); changedRoutes++;
    }
  }
  console.log(`${flagged} route(s) with points on the wrong floor; ` + (WRITE ? `wrote ${changedRoutes}` : 'dry run - nothing written (use --write)'));
}
