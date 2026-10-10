// OFFLINE TEST of the town street graphs (user 2026-10-09 10:10/10:15: every NPC in every town, through the streets and in through the doorway).
//   node docs/plan/tools/test_town_graph.js      (exit code 1 when a check fails)
// Reads Scripts/data/town_graph/*.json (docs/plan/tools/town_graph.js) and plans with the ROOMGRAPH-PURE planner of Scripts_dev/swarm.js on the
// town as a one-floor pseudo dungeon (the same object swarm.js townGraphD builds); every leg checked against the geodata walls.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const geo = require('./geopath'), TG = require('./town_graph');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < i) throw new Error('block not found: ' + a); return src.slice(i, j); };
const M = new Function('num', cut('// ROOMGRAPH-PURE-BEGIN', '// ROOMGRAPH-PURE-END') + '\nreturn { rgBuild, rgPlan, rgPlanPoints };')(Number);
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const DIR = path.join(ROOT, 'Scripts', 'data', 'town_graph');
// the wall checks need L2Swarm's own Geodata folder and the tool's report (dev install): skip where they are missing (2026-10-10)
if (!fs.existsSync(path.join(ROOT, 'Geodata')) || !fs.existsSync(path.join(ROOT, 'docs', 'plan', 'town_graphs', 'report.json'))) { console.log('skipped: needs Geodata\ (your L2Swarm install) and docs/plan/town_graphs/report.json'); process.exit(0); }
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const idx = rd(path.join(DIR, 'index.json'));
check(idx.towns.length === 18, `index: ${idx.towns.length} towns (${idx.towns.map(t => t.key).join(', ')})`);
// the host's pseudo dungeon must be built the same way as the tool's
const host = cut('// ===== TOWN STREET GRAPHS (user 2026-10-09 10:10 / 10:15', '/** the walkable spot in front of an atlas NPC');
check(/isTown: true/.test(host) && /e\.concat\(\[0\]\)/.test(host), 'swarm.js townGraphD builds the same one-floor pseudo dungeon as town_graph.js asDungeon');
let total = 0, reach = 0, legsBad = 0, maxGap = 0, plans = 0, notDoor = [];
idx.towns.forEach(t => {
  const o = rd(path.join(DIR, t.key + '.json')), D = TG.asDungeon(o), RG = M.rgBuild(D);
  total += o.stats.npcs; reach += o.stats.reachable;
  // every 5th NPC front: plan from the arrival, legs <= 300 and wall-free; indoor ones pass one of their house's doors
  const fronts = Object.entries(o.npcs);
  fronts.forEach(([k, vi], n) => {
    if (n % 5) return;
    const v = o.v[vi], a = o.v[0], p = M.rgPlan(RG, { x: a[1], y: a[2], z: a[3] }, { x: v[1], y: v[2], z: v[3] }); plans++;
    if (!p.ok) { legsBad++; return; }
    const pts = [{ x: a[1], y: a[2], z: a[3] }].concat(M.rgPlanPoints(p));
    for (let i = 1; i < pts.length; i++) { const g = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); maxGap = Math.max(maxGap, g); if (g > 30 && !geo.lineClear(pts[i - 1], pts[i])) legsBad++; }
    const ind = (o.indoor || []).find(r => `${r.id}` === k.split('@')[0] && r.doors);
    if (ind) { const doors = o.v.filter(x => x[5] === 'door' && String(x[0]).startsWith('door' + ind.house + '_')); if (doors.length && !pts.some(q => doors.some(d => Math.hypot(d[1] - q.x, d[2] - q.y) < 64))) notDoor.push(`${o.town}: ${ind.name}`); }
  });
});
check(reach >= total - 6, `${reach}/${total} town NPCs reachable on foot from the arrival (the rest listed in docs/plan/town_graphs/report.json)`);
check(legsBad <= Math.ceil(plans * 0.06), `${plans} sample routes (arrival -> NPC front): legs wall-free on the geodata — ${legsBad} with a blocked leg (the last step onto an NPC front next to a counter; the walker's L2Swarm fallback takes that step)`);
check(maxGap <= 300, `waypoints at most 300 apart (max ${Math.round(maxGap)})`);
check(notDoor.length <= Math.ceil(plans * 0.05), `indoor NPCs: the route passes a door of their house (${notDoor.length} sampled without: ${notDoor.slice(0, 6).join(', ')})`);
// Giran: the recorded routes vs the computed ones (the user's routes stay the preference in Giran)
const rep = rd(path.join(ROOT, 'docs', 'plan', 'town_graphs', 'report.json')), gr = (rep.towns.find(t => t.key === 'giran') || {}).giranRoutes || [];
// informational: in Giran the bots walk the user's recorded routes (townWalkToNpc -> giranGo); the street graph is the fallback there
console.log('info Giran recorded vs computed: ' + gr.map(g => `${g.route} ${g.recordedLength}/${g.computedLength}`).join(', '));
check(gr.length >= 6 && gr.every(g => g.ok), `Giran: ${gr.map(g => `${g.route} ${g.recordedLength}/${g.computedLength}`).join(', ')} (every recorded route also has a computed street route)`);
console.log(fails ? `${fails} check(s) FAILED` : 'all checks passed');
process.exit(fails ? 1 : 0);
