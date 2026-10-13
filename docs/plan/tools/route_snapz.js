// ROUTE SNAP-Z (ROUTESWITCH 2026-10-13, DUNGEON STEPS): saved routes drawn by hand often carry ONE z for every point (the editor copies the selected
// point's z), so the floor check (two points > 1500 apart in height with no dungeon step = "jumps floors") flags routes whose real walk is level or a
// slope: Queen Ant 29001 (z -5734 on points where the geodata ground is -4152 ... -5024), Boss Akata 25501 (-3744 where the ground is -3264 ... -1568).
// This tool reads the L2J geodata (docs/plan/tools/geopath_fast.js) and moves every plain point onto the ground layer nearest to its neighbour's
// corrected height (walking order), dungeon steps restart from the step's landing. DRY RUN by default (prints the changes + the floor check after);
// --write saves (old version to <folder>/history first). The user decides: never run --write on a locked route without the user's OK.
//   node docs/plan/tools/route_snapz.js Scripts/data/routes/raid/29001.json [--write]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const G = require('./geopath_fast'), I = G.internals, RS = require(path.join(ROOT, 'Dashboard', 'routestore.js'));
function layers(x, y) { const gx = I.toGeoX(x), gy = I.toGeoY(y), r = I.reg(gx, gy); if (!r) return []; const i = I.cix(gx, gy), n = r.cnt[i], o = []; for (let l = 0; l < n; l++) o.push(r.H[r.first[i] + l]); return o; }
/** points (+ steps) -> { pts, changes: [{ n, from, to }] } */
function snap(points) {
  let prevZ = null, n = 0; const changes = [];
  const pts = points.map(e => {
    if (RS.isStep(e)) { prevZ = Array.isArray(e.landing) ? e.landing[2] : null; return e; }
    if (!e || !isFinite(e.x) || !isFinite(e.y)) return e;
    n++;
    const L = layers(e.x, e.y); if (!L.length) { prevZ = e.z; return e; }
    const ref = prevZ == null ? e.z : prevZ;
    const z = L.slice().sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref))[0];
    prevZ = z;
    const other = L.filter(h => Math.abs(h - z) > 1500);   // a floor far above / below at this spot (a tower over a dungeon: Cruma, Garden of Eva)
    if (Math.abs(z - e.z) > 64) { changes.push({ n, from: e.z, to: z, ambiguous: other.length && other.some(h => Math.abs(h - e.z) < Math.abs(z - e.z)) ? other : null }); return Object.assign({}, e, { z }); }
    return e;
  });
  return { pts, changes };
}
if (require.main === module) {
  const f = process.argv[2]; if (!f) { console.log('usage: node route_snapz.js <route file> [--write]'); process.exit(1); }
  const file = path.resolve(f), r = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const before = RS.floorCheck(r), { pts, changes } = snap(r.points || []), after = RS.floorCheck(Object.assign({}, r, { points: pts }));
  console.log(`${path.basename(file)} ${r.boss || r.name || ''}: ${changes.length} point(s) moved onto the ground`);
  changes.forEach(c => console.log(`  point ${c.n}: z ${c.from} -> ${c.to}${c.ambiguous ? '   !! the stored z is nearer ANOTHER floor here (' + c.ambiguous.join(' / ') + '): this point is meant for a dungeon floor — add the dungeon step instead of snapping' : ''}`));
  const amb = changes.filter(c => c.ambiguous);
  if (amb.length) console.log(`!! ${amb.length} point(s) belong to another floor (see above): snapping would move them onto the wrong floor — NOT written; fix them with a dungeon step in the route editor`);
  console.log(`floor check before: ${before.ok ? 'ok' : before.why}\nfloor check after:  ${after.ok ? 'ok' : after.why}`);
  if (process.argv.includes('--write') && changes.length && !changes.some(c => c.ambiguous)) {
    const hist = path.join(path.dirname(file), 'history'); fs.mkdirSync(hist, { recursive: true });
    fs.copyFileSync(file, path.join(hist, path.basename(file, '.json') + '_' + Date.now() + '.json'));
    const o = Object.assign({}, r, { points: pts, editedAt: new Date().toISOString(), snapZ: { at: new Date().toISOString(), moved: changes.length } }); delete o.floorCheck;
    const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(o)); fs.renameSync(tmp, file);
    console.log('written (old version in history/)');
  }
}
module.exports = { snap, layers };
