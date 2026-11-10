// GUARD TEST (tester Vykaax 2026-11-10, #15: "path to Paniel the Unicorn goes straight up a mountain into EV ... they fall through the terrain coming
// down and go underground"; requirement docs/requirements/walls.md R8): the route to Paniel (25159) is a LOCKED own route from the Northern Pathway of
// Enchanted Valley along the valley floor, and neither it nor the nav atlas entry has a leg with an impossible height jump (no stretch steeper than
// 1.5 over 96 units on the geodata, no point-to-point jump > 400, no drop step), ending at the boss.
//   node docs/plan/tools/test_paniel_route.js   (exit 1 on a failure)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const { slopes, flatPts } = require('./raid_route_lock');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^﻿/, ''));
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const boss = { x: 124984, y: 43200, z: -3625 };
const jumps = (P) => { let m = 0; for (let i = 1; i < P.length; i++) m = Math.max(m, Math.abs(P[i].z - P[i - 1].z)); return m; };

const R = rd('Scripts/data/routes/raid/25159.json');
check(R.manual === true && R.start && R.start.kind === 'gk' && R.start.desc === 'Hunters -> Northern Pathway of Enchanted Valley', 'own route locked, start = Hunters -> Northern Pathway of Enchanted Valley');
const P = R.points.filter(p => isFinite(p.x));
const last = P[P.length - 1];
check(Math.hypot(last.x - boss.x, last.y - boss.y) < 300 && Math.abs(last.z - boss.z) < 250, `own route ends at the boss (${last.x},${last.y},${last.z})`);
check(!P.some(p => p.drop), 'own route has no drop step');
check(jumps(P) <= 400, `own route: largest height change between two points ${jumps(P)} (<= 400)`);
const s1 = slopes(P)[0];
check(s1.slope <= 1.5, `own route: steepest 96-unit stretch ${s1.slope.toFixed(2)} at ${s1.at.join(',')} (<= 1.5; the old Coliseum ridge drop was 3.3)`);
check(!P.some(p => p.x > 126000 && p.z > -3300), 'own route never climbs the ridge east of the valley (x > 126000 above z -3300)');

const A = rd('Scripts/data/nav_atlas/t/raid_25159.json'), w = A.steps.filter(s => s.do === 'walk');
check(A.steps.some(s => s.do === 'gk' && s.desc === 'Hunters -> Northern Pathway of Enchanted Valley') && !(A.flags || []).includes('drop'), 'nav atlas entry: Northern Pathway start, no drop flag');
const AP = flatPts([].concat(...w.map(s => s.points)));
check(!w.some(s => Array.isArray(s.drops) && s.drops.length) && jumps(AP) <= 400 && slopes(AP)[0].slope <= 1.5, `nav atlas walk: no drops, max jump ${jumps(AP)}, steepest ${slopes(AP)[0].slope.toFixed(2)}`);
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
