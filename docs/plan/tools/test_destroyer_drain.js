// DESTROYERDRAIN-2026-10-15: the destroyer HP drain (hit each other below 30 % for Frenzy) is a party switch, default OFF
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), ui = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
ok(src.includes("function destroyerDrainOn() { try { return partyTactics().destroyerDrain === true; } catch (e) { return false; } }"), 'switch reads party_tactics.json destroyerDrain, default OFF');
ok(/async function drainAndFrenzy\(reengageBoss, opts\) \{\n  if \(!hiveSkillsOn\(\)\) return;\n  if \(!destroyerDrainOn\(\) && !\(opts && opts\.manual\)\) \{/.test(src), 'drainAndFrenzy stops at once when the switch is off');
ok(src.includes("if (!reengageBoss && !(opts && opts.hold)) { try { App.emit('swarm.dready'"), 'off = the destroyer still reports ready at once');
ok(src.includes("state.role === 'destroyer' && !state.draining && destroyerDrainOn()"), 'no drain helper (hitting the partner) when off');
ok(src.includes("drainAndFrenzy(false, { manual: true })"), "the user's !draintest still runs");
ok(srv.includes("assist: get('assist') !== false, destroyerDrain: get('destroyerDrain') === true"), 'the tactics API keeps assist + destroyerDrain (saving no longer drops them)');
ok(ui.includes('data-pschk="tactics.destroyerDrain"') && ui.includes('data-pschk="tactics.assist"'), 'party settings: both switches on the Fighting card');
console.log(`destroyer drain: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
