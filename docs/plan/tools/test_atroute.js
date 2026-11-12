// ATROUTE-2026-11-12 guard (team.md R?, Destroyer3's team at the FoG Chandra landing): the landing (z -5200) lies above the Lower level's height band
// (-6900..-5500) - Destroyer4 and Chanter2, 200 from the leader, were "not on that floor", never took his route walk, and the leader waited at point 1.
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const i = SRC.indexOf('// ATROUTE-PURE-BEGIN'), j = SRC.indexOf('// ATROUTE-PURE-END');
const near = new Function(SRC.slice(i, j) + '\nreturn mtNearRoute;')();
const pts = [[174280, -112088, -5304], [174440, -112088, -5376], [174632, -112056, -5440]];
ok(near(pts, { x: 173816, y: -112376, z: -5184 }) === true, 'replay Destroyer4 08:44 (546 from point 1, 120 height): at the route');
ok(near(pts, { x: 173768, y: -112408, z: -5184 }) === true, 'replay Chanter2 08:44: at the route');
ok(near(pts, { x: 174280, y: -112088, z: -3600 }) === false, 'on the floor above (1700 higher) = not at the route (a floor teleport turn may still come)');
ok(near(pts, { x: 180000, y: -112088, z: -5304 }) === false, 'far along the floor = not at the route');
ok(near([{ x: 174280, y: -112088, z: -5304 }], { x: 174300, y: -112100, z: -5300 }) === true, 'object points work too');
ok(near([[0, 0]], { x: 10, y: 0 }) === false, 'no height known = not at the route (floors cannot be told apart)');
ok(SRC.includes("const between = !(w && w.d && w.d.name === d.floor.dungeon && w.fi >= 0);") && SRC.includes("!(between && mtNearRoute(d.points, { x: Me.X, y: Me.Y, z: Me.Z }))"), "a member on NO floor (between the height bands, FoG Chandra landing) but at the route takes it; one placed on another floor still waits");
console.log(`\ntest_atroute: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
