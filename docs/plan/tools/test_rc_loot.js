// RCLOOT-2026-10-15: the raid circuit's town stop hands the party's loot to the receiver (loot rule) before the warehouse step
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
ok(src.includes("if (why !== 'order' && why !== 'circuit' && rcHolds()) return"), 'leadLootGive allows the circuit itself');
const i = src.indexOf('async function rcStash(why) {'), body = src.slice(i, src.indexOf('\n}\n', i));
ok(body.indexOf("leadLootGive('circuit')") > 0 && body.indexOf("leadLootGive('circuit')") < body.indexOf("teamStep(runId, 'stashrun'"), 'rcStash: hand-over first, then the warehouse');
ok(body.includes('rv.town === currentTownKey()'), 'only when the receiver is in this town');
ok(body.includes('const rule = lootRule(Me.Name)'), "only with the party's loot rule on");
console.log(`rc loot: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
