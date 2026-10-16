// HUNTWALK-2026-10-15: inside the hunting ground (leveling, not travelling, < 8000) the leader's team walk is the plain walk, not the move-together trip walk
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
ok(src.includes("const huntWalk = (() => { try { return !!(autoLvl.active && !autoLvl.stop && !state.inTravel && !currentTownKey() && !inRaid() && distTo(x, y) < 8000); } catch (e) { return false; } })();"), 'hunt walk = leveling, in the field, not travelling, < 8000');
ok(src.includes("if (mtOn() && !huntWalk && teamNames().length"), 'the move-together trip walk is skipped for hunt walks');
console.log(`hunt walk: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
