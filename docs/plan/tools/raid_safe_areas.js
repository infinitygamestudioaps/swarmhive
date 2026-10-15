// RAID SAFE AREAS (owner 2026-10-14: "can you detect cliff edges? If so then let's add them all already"): runs Dashboard/raidfit.js
// "fit to safe ground" for EVERY raid boss (raidbosses_h5.json) and reports / writes the result.
//   node docs/plan/tools/raid_safe_areas.js [--r 900] [--write] [--stay] [--only <boss id,boss id>]
//   default = dry run: docs/plan/raid_safe_areas.md + Logs/raid_safe_areas.json (every boss: ok, size, cuts, problems), nothing changed.
//   --write  = add a GENERATED fight area to Scripts/data/raid_areas.json for every boss that has none (an area drawn / saved on the dashboard
//              (manual) is never touched); --stay = those generated areas get "Stay inside" switched on too; --stay-edges = only the ones cut at a
//              cliff edge or water (where running off kills).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const RF = require(path.join(ROOT, 'Dashboard', 'raidfit.js'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg('--only', '') ? new Set(String(arg('--only', '')).split(',').map(x => x.trim()).filter(Boolean)) : null;
const R = Number(arg('--r', 900)), WRITE = process.argv.includes('--write'), STAY = process.argv.includes('--stay'), STAYEDGE = process.argv.includes('--stay-edges');
const rb = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'raidbosses_h5.json'), 'utf8'));
const bosses = (Array.isArray(rb) ? rb : (rb.bosses || Object.values(rb))).filter(b => b && b.id && isFinite(b.x) && isFinite(b.y) && isFinite(b.z));
const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
const rows = [];
bosses.forEach(b => {
  let r = null; try { r = RF.fitSafeGround(ROOT, { x: b.x, y: b.y, z: b.z, r: R }); } catch (e) { r = { ok: false, error: e.message }; }
  const row = { id: b.id, name: b.name, level: b.level, type: b.type || 'raid', zone: b.zoneName || '', ok: !!r.ok, error: r.error || '', cuts: r.cuts || null, cells: r.cells || 0 };
  if (r.ok) {
    row.poly = r.poly; row.area = Math.round(area(r.poly)); row.fill = Math.round(100 * row.area / (Math.PI * R * R));
    const c = r.cuts; row.cliff = c.cliff; row.water = c.water; row.wall = c.wall;
    const probs = [];
    if (row.fill < 15) probs.push('very little safe ground (< 15 % of the circle)');
    else if (row.fill < 35) probs.push('little safe ground');
    if (c.water) probs.push(`water in ${c.water} directions`);
    if (c.cliff >= 18) probs.push(`cliff edges in ${c.cliff} directions`);
    row.problems = probs;
  } else row.problems = ['could not fit: ' + (r.error || '?')];
  rows.push(row);
});
fs.writeFileSync(path.join(ROOT, 'Logs', 'raid_safe_areas.json'), JSON.stringify({ at: new Date().toISOString(), r: R, rows }, null, 1));
const ok = rows.filter(r => r.ok), cl = ok.filter(r => r.cliff > 0), wa = ok.filter(r => r.water > 0), small = ok.filter(r => r.fill < 35), bad = rows.filter(r => !r.ok);
const md = [`# Raid safe areas (cliff / water / wall detection)`, ``, `Generated ${new Date().toISOString()} by docs/plan/tools/raid_safe_areas.js (radius ${R}). ${rows.length} raid bosses: ${ok.length} fitted, ${bad.length} failed.`, ``,
  `- cut at a cliff edge: ${cl.length} bosses · water: ${wa.length} · little safe ground (< 35 % of the circle): ${small.length}`, ``,
  `| Boss | Lvl | Zone | Safe ground | Cliff | Water | Wall | Notes |`, `|---|---|---|---|---|---|---|---|`,
  ...rows.sort((a, b) => (a.ok - b.ok) || ((b.cliff || 0) + (b.water || 0) * 2) - ((a.cliff || 0) + (a.water || 0) * 2) || a.level - b.level)
    .map(r => `| ${r.name} (${r.id}) | ${r.level} | ${r.zone} | ${r.ok ? r.fill + ' %' : '-'} | ${r.ok ? r.cliff : '-'} | ${r.ok ? r.water : '-'} | ${r.ok ? r.wall : '-'} | ${(r.problems || []).join('; ')} |`)];
fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'raid_safe_areas.md'), md.join('\n') + '\n');
console.log(`${rows.length} bosses: ${ok.length} fitted (${cl.length} with cliff edges, ${wa.length} with water, ${small.length} with little safe ground), ${bad.length} failed`);
if (WRITE) {
  const G = require(path.join(__dirname, 'manual_guard.js'));
  const F = path.join(ROOT, 'Scripts', 'data', 'raid_areas.json');
  let n = 0, kept = 0;
  G.withLock(F, () => {
    let data = { areas: {} }; try { data = JSON.parse(fs.readFileSync(F, 'utf8')); } catch (e) { }
    if (!data.areas) data.areas = {};
    if (fs.existsSync(F)) G.saveHistory(F, path.join(ROOT, 'Scripts', 'data'), 50);
    const now = new Date().toISOString();
    ok.forEach(r => {
      if (ONLY && !ONLY.has(String(r.id))) return;                       // --only <id,id>: just these bosses (raid_spawn_apply.js)
      const cur = data.areas[String(r.id)];
      if (cur && (cur.manual || cur.edited)) { kept++; return; }            // drawn / saved on the dashboard: never touched
      data.areas[String(r.id)] = { id: r.id, boss: r.name, fight: r.poly, clear: null, clearMargin: 600, clearPassive: false, stay: STAY || (STAYEDGE && (r.cliff > 0 || r.water > 0)) || !!(cur && cur.stay),   /* 2026-10-15: a re-run keeps the Stay inside switches it set before */ stage: null, enabled: true,
        notes: `generated: safe ground within ${R} (cut: ${r.cliff} cliff, ${r.water} water, ${r.wall} wall of 72)`, generated: { by: 'raid_safe_areas.js', at: now, r: R }, manual: false, updated: now };
      n++;
    });
    G.atomicWrite(F, JSON.stringify(data, null, 1) + '\n');
  }, { who: 'raid_safe_areas' });
  console.log(`wrote ${n} generated areas${STAY ? ' (Stay inside ON)' : STAYEDGE ? ' (Stay inside ON where cut at a cliff / water)' : ''}; kept ${kept} drawn by hand`);
}
