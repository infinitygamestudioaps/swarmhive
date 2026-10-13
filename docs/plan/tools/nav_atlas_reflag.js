// NAV ATLAS RE-FLAG (2026-10-13 19:50, release check): recompute the swim fields + flags of EVERY stored route from its own points with the
// current rule (nav_atlas.js swimInfo: a point inside a water zone is swum; the length is 3D since the owner's 19:10 "deep down" rule; one breath
// = 2,800) — no re-planning. Walk steps: swim [indices], swimLen, maxSwim, pol.overBreath (that walk's own longest swim > breath). Routes: flags
// swim / long-swim (> 3000) / over-breath (> 2800). Then index.json flags and the per-target split files (nav_atlas_split.js). Atomic writes.
// Run: node docs/plan/tools/nav_atlas_reflag.js
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..'), OUT = path.join(ROOT, 'Scripts', 'data', 'nav_atlas');
const WATER = require('./water_zones'), mg = require('./manual_guard');
const BREATH = 2800, LONG = 3000;
function swimInfo(pts) {
  const idx = []; for (let i = 0, k = 0; i < pts.length; i += 3, k++) if (WATER.zoneAt(pts[i], pts[i + 1], pts[i + 2])) idx.push(k);
  if (!idx.length) return null;
  let len = 0, run = 0, max = 0; const set = new Set(idx);
  for (let k = 1; k * 3 < pts.length; k++) { const d = Math.hypot(pts[k * 3] - pts[k * 3 - 3], pts[k * 3 + 1] - pts[k * 3 - 2], pts[k * 3 + 2] - pts[k * 3 - 1]); if (set.has(k)) { len += d; run += d; if (run > max) max = run; } else run = 0; }
  return { swim: idx, swimLen: Math.round(len), maxSwim: Math.round(max) };
}
function reflagSteps(steps) {
  let ch = 0;
  for (const s of steps || []) {
    if (s.do !== 'walk' || !Array.isArray(s.points) || s.how === 'straight') continue;
    const before = JSON.stringify([s.swim, s.swimLen, s.maxSwim, s.pol && s.pol.overBreath]);
    const si = swimInfo(s.points);
    if (si) Object.assign(s, si); else { delete s.swim; delete s.swimLen; delete s.maxSwim; }
    if (s.pol) { if (si && si.maxSwim > BREATH) s.pol = Object.assign({}, s.pol, { overBreath: si.maxSwim }); else if (s.pol.overBreath) { s.pol = Object.assign({}, s.pol); delete s.pol.overBreath; } }
    if (JSON.stringify([s.swim, s.swimLen, s.maxSwim, s.pol && s.pol.overBreath]) !== before) ch++;
  }
  return ch;
}
function reflagRoute(r) {
  let ch = reflagSteps(r.steps);
  if (r.fortressAlt) ch += reflagSteps(r.fortressAlt.steps);
  const walks = (r.steps || []).filter(s => s.do === 'walk');
  const f0 = (r.flags || []).filter(f => !['swim', 'long-swim', 'over-breath'].includes(f));
  if (walks.some(s => s.swim && s.swim.length)) f0.push('swim');
  if (walks.some(s => (s.maxSwim || 0) > LONG)) f0.push('long-swim');
  if (walks.some(s => (s.maxSwim || 0) > BREATH)) f0.push('over-breath');
  if (JSON.stringify(f0) !== JSON.stringify(r.flags || [])) { r.flags = f0; ch++; }
  return ch;
}
const files = ['raid.json', 'npc.json', 'area.json', 'room.json', 'dungeon.json'];
let routesCh = 0, total = 0; const flagsOf = {};
for (const fn of files) {
  const file = path.join(OUT, fn); if (!fs.existsSync(file)) continue;
  mg.withLock(file, () => {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    let n = 0; for (const r of Object.values(j.routes || {})) { total++; if (reflagRoute(r)) n++; flagsOf[r.key] = r.flags; }
    if (n) mg.atomicWrite(file, JSON.stringify(j));
    routesCh += n; console.log(`${fn}: ${n} routes changed`);
  }, { who: 'nav_atlas_reflag.js' });
}
// index.json: the flags column
{ const f = path.join(OUT, 'index.json'), ix = JSON.parse(fs.readFileSync(f, 'utf8')); const fc = ix.cols.indexOf('flags'); let n = 0;
  ix.targets.forEach(t => { const fl = flagsOf[t[0]]; if (fl && t[fc] !== fl.join(',')) { t[fc] = fl.join(','); n++; } });
  const tmp = f + '.tmp' + process.pid; fs.writeFileSync(tmp, JSON.stringify(ix)); fs.renameSync(tmp, f); console.log(`index.json: ${n} rows`); }
cp.spawnSync(process.execPath, [path.join(__dirname, 'nav_atlas_split.js')], { stdio: 'inherit', windowsHide: true });
console.log(`nav_atlas_reflag: ${routesCh} of ${total} routes re-flagged`);
