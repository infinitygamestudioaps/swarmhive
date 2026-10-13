// RAID ROUTE POLICY (owner 2026-10-13 15:15: "go around obstacles and navigate the centre ... do not choose positions where we must swim if it can
// be avoided ... long swims over open water should not be necessary ... Pirate Cave / Garden of Eva: swim down, doors to open"). The search
// rules for every walk of a raid / epic target in docs/plan/tools/nav_atlas.js (worker) and the tests (test_raid_routes_all.js):
//   1. DRY first: never on a floor inside a water zone (wet: 'block' — walking the sea floor IS swimming on the server) and no swim graph;
//      clearance (keep >= 48 from walls / cliffs where the ground allows: clear 5 cells, weight 6), one-way drops off ledges (fall height recorded),
//      danger circles (aggressive monsters > the boss level + 6) as a cost. A* first, then the bidirectional flood + join (geopath_fast).
//   2. Only when no dry way exists, or the dry way is > swimFactor (4) x the straight line AND > swimExtra (15 km) longer: the WET search
//      (floors inside water zones at swim cost x12: a diving descent, a flooded tunnel), then the swim graph (open water at the surface, x12).
//      The swim way is taken when there is no dry way (mode 'swim-only') or the dry way is > 4x and > 15 km longer than it ('swim-shorter').
//   3. BREATH: one breath = 60 s (L2J WaterTask) ≈ 2,800 units at swim speed 50 (+ speed buffs): a swim way whose longest unbroken swim is longer
//      gets one more search with swim cost x40 (fewer / shorter swims); still longer = recorded as pol.overBreath (the route view / table mark it).
'use strict';
const RPOL = { v: 2, clear: 5, clearW: 6, clearNeed: 3, hWeight: 1.6, swimCost: 12, swimCostHard: 40, breath: 2800, swimFactor: 4, swimExtra: 15000, dropCost: 40, maxDrop: 3000, safeFall: 333,
  dangerMargin: 6, dangerPad: 250, maxSearch: 70000, maxNodes: 1500000, maxMs: 25000, floodCap: 2500000, floodPad: 24000, floodMs: 150000, maxLeg: 1000 };
let W = null; const water = () => { if (W === null) { try { W = require('./water_zones'); W.load(); } catch (e) { W = false; } } return W || null; };
/** swim length + longest unbroken swim of a path finder result (a point inside a water zone, or marked swim, is reached by swimming) */
function wetStats(q) {
  const Wz = water(); if (!q || !q.ok || !Array.isArray(q.points)) return { len: 0, max: 0 };
  let len = 0, run = 0, max = 0;
  for (let i = 1; i < q.points.length; i++) { const A = q.points[i - 1], B = q.points[i]; if (B.swim || (Wz && Wz.zoneAt(B.x, B.y, B.z))) { const d = Math.hypot(B.x - A.x, B.y - A.y); len += d; run += d; if (run > max) max = run; } else run = 0; }
  return { len: Math.round(len), max: Math.round(max) };
}
/** any water zone near the leg (else the dry search is the only one) */
function waterNear(a, b) {
  const Wz = water(); if (!Wz) return true;
  const x1 = Math.min(a.x, b.x) - 6000, x2 = Math.max(a.x, b.x) + 6000, y1 = Math.min(a.y, b.y) - 6000, y2 = Math.max(a.y, b.y) + 6000;
  for (let x = x1; x <= x2 + 3999; x += 4000) for (let y = y1; y <= y2 + 3999; y += 4000) if (Wz.zonesAt(Math.min(x, x2), Math.min(y, y2)).length) return true;
  return false;
}
/** does the swim search have to run at all? (no dry way, or the dry way is absurdly long against the straight line) */
const needSwimSearch = (dry, straight, wet) => !!wet && (!dry || !dry.ok || (dry.lengthUnits > RPOL.swimFactor * straight && dry.lengthUnits - straight > RPOL.swimExtra));
/** THE choice (pure): dry / swim results -> { pick: 'dry' | 'swim' | null, mode } */
function decide(dry, sw, swLen) {
  if ((!dry || !dry.ok) && sw && sw.ok) return { pick: 'swim', mode: swLen ? 'swim-only' : 'dry' };
  if (dry && dry.ok && sw && sw.ok && swLen && dry.lengthUnits > RPOL.swimFactor * sw.lengthUnits && dry.lengthUnits - sw.lengthUnits > RPOL.swimExtra) return { pick: 'swim', mode: 'swim-shorter' };
  if (dry && dry.ok) return { pick: 'dry', mode: 'dry' };
  return { pick: null, mode: 'none' };
}
/** one walk j = { a, b, avoid, pol: { danger } } under the policy with geo = geopath_fast -> the atlas cache entry */
function policyLeg(geo, j, straight) {
  if (straight > RPOL.maxSearch) return { ok: false, why: `too far for one search (${Math.round(straight)} straight)` };
  const base = { maxLeg: RPOL.maxLeg, hWeight: RPOL.hWeight, noLearned: false, avoid: j.avoid || [], drops: true, maxDrop: RPOL.maxDrop, dropCost: RPOL.dropCost,
    clear: RPOL.clear, clearW: RPOL.clearW, clearNeed: RPOL.clearNeed, danger: (j.pol && j.pol.danger) || [] };
  const box = Math.round(1.6 * ((Math.abs(j.a.x - j.b.x) + 8000) / 16) * ((Math.abs(j.a.y - j.b.y) + 8000) / 16));
  const astar = (o) => geo.findPath(j.a, j.b, Object.assign({}, base, { maxNodes: Math.min(RPOL.maxNodes, box), maxMs: RPOL.maxMs, pad: straight > 20000 ? 3000 : 5000 }, o));
  const flood = (o) => geo.findPathFlood ? geo.findPathFlood(j.a, j.b, Object.assign({}, base, { floodCap: RPOL.floodCap, floodPad: RPOL.floodPad, floodMs: RPOL.floodMs }, o)) : { ok: false, reason: 'no flood' };
  const definite = (p) => /no way through|not on walkable/.test(String(p.reason || ''));
  // A* with the policy -> flood + join -> (last resort) the plain old search (greedier, no clearance / danger cost) so a capped leg still gets a
  // real walk; such a leg is marked clr.fallback (it may graze walls)
  const plain = (o) => { const q = geo.findPath(j.a, j.b, Object.assign({}, base, { clear: 0, danger: [], hWeight: 2, maxNodes: 2000000, maxMs: 20000, pad: straight > 20000 ? 3000 : 5000 }, o)); if (q.ok) q.clr = { need: 0, fallback: true }; return q; };
  const search = (o) => { const p = astar(o); if (p.ok || /not on walkable/.test(String(p.reason || ''))) return p; const q = flood(o); if (q.ok) return q; const r = plain(o); if (r.ok) return r; q.reason = `${p.reason}; ${q.reason}; plain: ${r.reason}`; return q; };
  const wet = waterNear(j.a, j.b);
  const dry = wet ? search({ swim: false, wet: 'block' }) : search({ swim: false });
  let sw = null;
  if (needSwimSearch(dry, straight, wet)) {
    sw = search({ swim: false, wet: RPOL.swimCost });                                     // under water along the floor (diving / flooded tunnels)
    if (!sw.ok) { const s3 = search({ swimCost: RPOL.swimCost, wet: RPOL.swimCost }); if (s3.ok) sw = s3; else sw.reason = `${sw.reason} | swim graph: ${s3.reason}`; }
    if (sw.ok && wetStats(sw).max > RPOL.breath) { const s2 = astar({ swim: false, wet: RPOL.swimCostHard }); if (s2.ok && wetStats(s2).max < wetStats(sw).max) sw = s2; }
  }
  const d = decide(dry, sw, wetStats(sw).len), p = d.pick === 'swim' ? sw : dry;
  if (!d.pick) return { ok: false, why: String(dry.reason || 'no way') + (sw && !sw.ok ? ' | swimming: ' + sw.reason : ''), ms: (dry.ms || 0) + ((sw && sw.ms) || 0), definite: definite(dry) && (!sw || definite(sw)) };
  const pts = [].concat(...p.points.map(q => [q.x, q.y, q.z]));
  const dropAt = p.points.filter(q => q.drop).map(q => [q.x, q.y, q.z, q.drop]);
  const out = { ok: true, pts, len: p.lengthUnits || 0, ms: (dry.ms || 0) + ((sw && sw.ms) || 0), pol: { v: RPOL.v, mode: d.mode, dryLen: dry.ok ? dry.lengthUnits : null, dryWhy: dry.ok ? undefined : String(dry.reason || '').slice(0, 160), swimRouteLen: sw && sw.ok ? sw.lengthUnits : null } };
  { const ws = wetStats(p); if (ws.len) { out.swimLen = ws.len; out.maxSwim = ws.max; if (ws.max > RPOL.breath) out.pol.overBreath = ws.max; } }
  if (dropAt.length) out.dropAt = dropAt;
  if (p.clr) out.clr = p.clr;
  if (p.flood) out.flood = p.flood;
  return out;
}
module.exports = { RPOL, policyLeg, decide, needSwimSearch, wetStats, waterNear };
