// EXPERZONES-2026-11-05 (owner: "Byg spot rotation og Exper-zonerne først"): imports the Adrenaline Exper plugin's hunting zones
// (C:\l2\Script\Scripts\Exper\Settings\Zones\<Classic|Essence|Main>\*.zmap = the L2Swarm .zmap format: <ExternalPoly> + <InternalPolies>)
// into Scripts/data/custom_zones.json as choosable hunting spots. The LEVELS are recomputed for High Five from OUR datapack spawns inside the
// polygon (Exper is made for Classic / Essence / Main: the levels in its file names are not H5 levels). Zones with fewer than 3 H5 monster
// spawns inside are skipped. Every imported zone: team "exper" (never picked automatically), enabled false, source "exper", the nearest
// gatekeeper landing. A zone edited on the dashboard (manual: true) is never overwritten. Re-run: node docs/plan/tools/exper_zones.js [--dry]
'use strict';
const fs = require('fs'), path = require('path');
const MG = require('./manual_guard');
const ROOT = path.join(__dirname, '../../..'), DATA = path.join(ROOT, 'Scripts', 'data');
const SRC = process.env.EXPER_ZONES || 'C:/l2/Script/Scripts/Exper/Settings/Zones';
const dry = process.argv.includes('--dry');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8').replace(/^\uFEFF/, ''));

// ---- pure part (test_exper_zones.js) ----
/** .zmap text -> { poly: [[x,y]...], holes: [[[x,y]...]...] } */
function parseZmap(t) {
  const pts = (s) => [...String(s).matchAll(/<point\s+x="(-?\d+(?:\.\d+)?)"\s+y="(-?\d+(?:\.\d+)?)"/g)].map(m => [Math.round(+m[1]), Math.round(+m[2])]);
  const ext = (String(t).match(/<ExternalPoly>([\s\S]*?)<\/ExternalPoly>/) || [])[1] || '';
  const inner = (String(t).match(/<InternalPolies>([\s\S]*?)<\/InternalPolies>/) || [])[1] || '';
  const holes = [...inner.matchAll(/<poly>([\s\S]*?)<\/poly>/g)].map(m => pts(m[1])).filter(p => p.length >= 3);
  return { poly: pts(ext), holes };
}
function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
function inZone(x, y, z) { return inPoly(x, y, z.poly) && !z.holes.some(h => inPoly(x, y, h)); }
/** the display name from the file: "Ant_Nest_29-38_1.zmap" -> "Ant Nest #1" */
function zoneTitle(file) { const b = path.basename(file, '.zmap').replace(/_/g, ' '); const m = b.match(/^(.*?)\s+\d+[\s-]\d+\s+(\d+)$/) || b.match(/^(.*?)\s+(\d+)$/); return m ? `${m[1].trim()} #${m[2]}` : b; }
/** the monsters inside -> { n, levelMin, levelMax, median, names, center:{x,y,z} } */
function zoneMobs(zone, spawns, npcs) {
  const L = [], names = {}; let sx = 0, sy = 0, sz = 0, k = 0;
  spawns.forEach(s => { const n = npcs[s.id]; if (!n || n.ty !== 'L2Monster' || !(n.l > 0)) return; if (!inZone(s.x, s.y, zone)) return;
    const c = Math.max(1, Number(s.count) || 1); for (let i = 0; i < c; i++) L.push(n.l); names[n.n] = (names[n.n] || 0) + c; sx += s.x; sy += s.y; sz += s.z; k++; });
  if (!L.length) return { n: 0 };
  L.sort((a, b) => a - b);
  const q = (p) => L[Math.min(L.length - 1, Math.floor(p * L.length))];
  return { n: L.length, levelMin: q(0.1), levelMax: q(0.9), median: q(0.5), names: Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0]), center: { x: Math.round(sx / k), y: Math.round(sy / k), z: Math.round(sz / k) } };
}
function nearestLanding(c, tps) {
  let best = null, bd = 1e12;
  tps.forEach(t => { const m = String(t.desc || '').match(/^(.+?)\s*->\s*(.+)$/); if (!m || /^(Town of|.*Village|.*Castle Town)/i.test(m[2])) return; const d = Math.hypot(t.x - c.x, t.y - c.y); if (d < bd) { bd = d; best = { from: m[1].replace(/^Town of\s+/i, '').trim(), desc: `${m[1].replace(/^Town of\s+/i, '').trim()} -> ${m[2].trim()}`, dist: Math.round(d) }; } });
  return best;
}
module.exports = { parseZmap, inPoly, inZone, zoneTitle, zoneMobs, nearestLanding };

if (require.main === module) {
  const spawns = rd('spawns_h5.json'), npcs = rd('npcs_h5.json'), tps = rd('teleports_h5.json');
  const S = Array.isArray(spawns) ? spawns : (spawns.spawns || Object.values(spawns)), T = Array.isArray(tps) ? tps : (tps.teleports || Object.values(tps));
  const out = [], skipped = [], seen = new Set();
  for (const chron of ['Classic', 'Essence', 'Main']) {
    const dir = path.join(SRC, chron); if (!fs.existsSync(dir)) continue;
    fs.readdirSync(dir).filter(f => /\.zmap$/i.test(f)).forEach(f => {
      const z = parseZmap(fs.readFileSync(path.join(dir, f), 'utf8')); if (z.poly.length < 3) { skipped.push(`${chron}/${f}: no polygon`); return; }
      const m = zoneMobs(z, S, npcs); if (m.n < 3) { skipped.push(`${chron}/${f}: ${m.n} H5 monsters inside`); return; }
      const sig = z.poly.map(p => p.join(',')).join(';');                 // the same area in Classic and Essence: kept once (Classic first)
      if (seen.has(sig) || out.some(o => o.exper && Math.hypot(o.x - m.center.x, o.y - m.center.y) < 300 && o.levelMin === m.levelMin && o.levelMax === m.levelMax)) { skipped.push(`${chron}/${f}: same area as an imported zone`); return; }
      seen.add(sig);
      const gk = nearestLanding(m.center, T), title = zoneTitle(f);
      out.push({ name: `Exper: ${title} (${chron}, H5 lvl ${m.levelMin}-${m.levelMax})`, x: m.center.x, y: m.center.y, z: m.center.z, radius: 1500, levelMin: m.levelMin, levelMax: m.levelMax,
        team: 'exper', enabled: false, poly: z.poly, holes: z.holes.length ? z.holes : undefined, gkFrom: gk ? gk.from : undefined, gkDesc: gk ? gk.desc : undefined,
        source: 'exper', exper: { file: `${chron}/${f}`, monsters: m.n, median: m.median, names: m.names, landingDist: gk ? gk.dist : null },
        note: `Imported from the Exper plugin zone ${chron}/${f}; H5 monsters inside: ${m.names.join(', ')} (lvl ${m.levelMin}-${m.levelMax}, median ${m.median}). Not used automatically - choose it on the dashboard.`, updated: new Date().toISOString() });
    });
  }
  console.log(`${out.length} zones imported, ${skipped.length} skipped`); skipped.slice(0, 10).forEach(s => console.log('  skipped ' + s));
  if (dry) { out.slice(0, 5).forEach(z => console.log(' ', z.name, '|', z.exper.names.slice(0, 3).join(', '), '| gk', z.gkDesc)); process.exit(0); }
  const F = path.join(DATA, 'custom_zones.json');
  MG.withLock(F, () => {
    const t = MG.readText(F), disk = JSON.parse(t.text), list = Array.isArray(disk) ? disk : (disk.zones || []);
    try { MG.saveHistory(F, DATA); } catch (e) { console.log('history copy failed: ' + e.message); }
    const keepManual = list.filter(z => z && z.source === 'exper' && MG.isManual(z)), mNames = new Set(keepManual.map(z => z.name));
    const next = list.filter(z => !(z && z.source === 'exper' && !MG.isManual(z))).concat(out.filter(z => !mNames.has(z.name)));
    const data = Array.isArray(disk) ? next : Object.assign({}, disk, { zones: next });
    MG.atomicWrite(F, MG.stringifyLike(data, t.fmt));
    console.log(`custom_zones.json: ${list.length} -> ${next.length} zones (${keepManual.length} edited Exper zones kept)`);
  }, { who: 'exper_zones.js' });
}
