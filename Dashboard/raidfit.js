// FIT TO SAFE GROUND (owner 2026-10-14: "at some raid bosses there is very little place to move around ... they end up running off the hill or worse
// in the water and die ... create barriers where the cliffs are or water is"): the raid fight-area editor's "⛰ Fit to safe ground" button.
// From the circle's centre (the boss) it floods the walkable geodata the bots walk on (docs/plan/tools/geopath.js step(): walls and height
// steps > 48 = a cliff stop it; water zones (water_zones.js) are not entered), up to the circle's radius; ground next to a DROP (a cliff edge)
// or water is cut back by `margin`. The result is turned into a star-shaped outline (72 rays from the centre, each ending at the last safe cell),
// simplified to <= 40 points. Returns { ok, poly, cuts: { cliff, water, wall, radius }, cells, ms } or { ok: false, error }.
'use strict';
const path = require('path');
let GP = null, WZ = null;
function libs(ROOT) {
  if (!GP) GP = require(path.join(ROOT, 'docs', 'plan', 'tools', 'geopath.js'));
  if (!WZ) WZ = require(path.join(ROOT, 'docs', 'plan', 'tools', 'water_zones.js'));
  return { GP, WZ };
}
const FIT = { maxR: 5000, minR: 200, margin: 64, rays: 72, maxPts: 40, maxCells: 400000, dropBlock: 48 };

function fitSafeGround(ROOT, o) {
  const t0 = Date.now(), { GP: G, WZ: W } = libs(ROOT);
  const R = Math.max(FIT.minR, Math.min(FIT.maxR, Number(o.r) || 900)), cx = Number(o.x), cy = Number(o.y), cz = Number(o.z);
  if (![cx, cy, cz].every(Number.isFinite)) return { ok: false, error: 'centre x, y, z needed' };
  const gx0 = G.toGeoX(cx), gy0 = G.toGeoY(cy), li0 = G.layerAt(gx0, gy0, cz);
  if (li0 < 0) return { ok: false, error: 'no geodata at the centre (region not loaded?)' };
  const key = (gx, gy) => gx * 65536 + gy, R2 = (R / 16) * (R / 16);
  const isWater = (gx, gy, h) => { try { return !!W.zoneAt(G.toWorldX(gx), G.toWorldY(gy), h + 10) || !!W.cellWater(G.toWorldX(gx), G.toWorldY(gy), [h]); } catch (e) { return false; } };
  const cell = new Map();                      // key -> { li, h, edge: '' | 'cliff' | 'water' }
  const ls0 = G.layers(gx0, gy0); cell.set(key(gx0, gy0), { li: li0, h: ls0[li0].h, edge: '' });
  const q = [[gx0, gy0]];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (q.length && cell.size < FIT.maxCells) {
    const [gx, gy] = q.shift(), c = cell.get(key(gx, gy));
    for (const [dx, dy] of DIRS) {
      const nx = gx + dx, ny = gy + dy, k = key(nx, ny);
      if ((nx - gx0) * (nx - gx0) + (ny - gy0) * (ny - gy0) > R2) continue;
      if (cell.has(k)) continue;
      const nl = G.step(gx, gy, c.li, dx, dy);
      if (nl < 0) {
        // why blocked: a lower floor next door = a DROP (cliff edge); otherwise a wall / a climb
        const L = G.layers(nx, ny) || [];
        const lower = L.length && L.every(l => l.h < c.h - FIT.dropBlock);
        if (lower) c.edge = c.edge || 'cliff';
        continue;
      }
      const h = G.layers(nx, ny)[nl].h;
      if (isWater(nx, ny, h)) { c.edge = 'water'; continue; }
      cell.set(k, { li: nl, h, edge: '' });
      q.push([nx, ny]);
    }
  }
  // cut back from cliff / water edges by margin (cells within margin of such an edge are not safe)
  const mC = Math.ceil(FIT.margin / 16), edges = [];
  cell.forEach((c, k) => { if (c.edge) edges.push([Math.floor(k / 65536), k % 65536, c.edge]); });
  const unsafe = new Map();
  edges.forEach(([gx, gy, why]) => { for (let dx = -mC; dx <= mC; dx++) for (let dy = -mC; dy <= mC; dy++) if (dx * dx + dy * dy <= mC * mC) { const k = key(gx + dx, gy + dy); if (cell.has(k) && !unsafe.has(k)) unsafe.set(k, why); } });
  const safe = (gx, gy) => cell.has(key(gx, gy)) && !unsafe.has(key(gx, gy));
  if (!safe(gx0, gy0)) return { ok: false, error: 'the centre itself is at a cliff edge or in water — move the boss marker / pick another centre', cells: cell.size };
  // rays from the centre: the last safe cell along each
  const cuts = { cliff: 0, water: 0, wall: 0, radius: 0 }, pts = [], rays = [];   // rays: [x, y, why] per direction (2026-10-15: the raid page draws cliff / water edges)
  for (let i = 0; i < FIT.rays; i++) {
    const a = i * 2 * Math.PI / FIT.rays, ux = Math.cos(a), uy = Math.sin(a);
    let last = [cx, cy], why = 'radius';
    for (let d = 16; d <= R; d += 16) {
      const x = cx + ux * d, y = cy + uy * d, gx = G.toGeoX(x), gy = G.toGeoY(y);
      if (!safe(gx, gy)) { const u = unsafe.get(key(gx, gy)); why = u || (cell.has(key(gx, gy)) ? 'wall' : 'wall'); break; }
      last = [x, y];
    }
    cuts[why]++;
    pts.push([Math.round(last[0]), Math.round(last[1])]);
    rays.push([Math.round(last[0]), Math.round(last[1]), why]);
  }
  // simplify: drop points that add little (keeps the outline, <= maxPts)
  let P = pts.slice();
  const dev = (a, b, c) => { const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1; return Math.abs((c[0] - a[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (c[1] - a[1])) / L; };
  while (P.length > FIT.maxPts) { let bi = 0, bd = Infinity; for (let i = 0; i < P.length; i++) { const d = dev(P[(i - 1 + P.length) % P.length], P[i], P[(i + 1) % P.length]); if (d < bd) { bd = d; bi = i; } } P.splice(bi, 1); }
  // drop duplicates / near-duplicates (a ray that stopped at the centre)
  P = P.filter((p, i) => { const q2 = P[(i + 1) % P.length]; return Math.hypot(p[0] - q2[0], p[1] - q2[1]) > 8; });
  if (P.length < 3) return { ok: false, error: 'too little safe ground around the centre', cells: cell.size, cuts };
  return { ok: true, poly: P, cuts, rays, cells: cell.size, unsafe: unsafe.size, r: R, ms: Date.now() - t0 };
}
module.exports = { fitSafeGround, FIT };
