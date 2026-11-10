// GUARD TEST (tester Vykaax 2026-11-10, #14 Atraiban behind the locked Devil's Isle gate; requirement docs/requirements/walls.md R7):
// a raid boss whose way passes a door that needs Unlock is SKIPPED (with the reason) when nobody in the party can open it - raidhunt candidate filter
// + circuit plan - instead of walking to the gate and standing there.
//   node docs/plan/tools/test_door_gate.js   (exit 1 on a failure)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < i) throw new Error('block not found: ' + a); return src.slice(i, j); };
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^﻿/, ''));
const G = new Function(cut('// ROUTESM-PURE-BEGIN', '// ROUTESM-PURE-END') + cut('// DOORGATE-PURE-BEGIN', '// DOORGATE-PURE-END') + '\nreturn { doorGateDoors, doorGateWhy, rsmRules, RSM_RULES };')();
const RC = new Function(cut('// ==== RCIRCUIT-PURE begin', '// ==== RCIRCUIT-PURE end') + '\nreturn { rcPlan, rcConfigOf, rcNext };')();
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

// real data: Atraiban (25029) atlas route has the Unlock door Devil_005; the locked own route (Giran -> Devil Isle, 30 points) passes it
const at = rd('Scripts/data/nav_atlas/t/raid_25029.json'), own = rd('Scripts/data/routes/raid/25029.json').points;
const rules = G.rsmRules({}, 'X');
const doors = G.doorGateDoors(at.steps, own);
check(doors.length === 1 && doors[0].name === 'Devil_005' && doors[0].need && doors[0].need.unlock, `Atraiban: the own route passes the Unlock door Devil_005 (${doors.map(d => d.name).join(',')})`);
const noDagger = G.doorGateWhy(doors, { unlock: false, keys: null, items: {} }, rules);
check(/Devil_005/.test(noDagger) && /Unlock/.test(noDagger), 'no dagger in the party -> skip with the reason: ' + noDagger);
check(G.doorGateWhy(doors, { unlock: true, keys: 20, items: {} }, rules) === '', 'a dagger with Thief Keys -> go');
check(G.doorGateWhy(doors, { unlock: true, keys: null, items: {} }, rules) === '', 'a dagger member (keys unknown, bought on the way) -> go');
check(/buying keys/.test(G.doorGateWhy(doors, { unlock: true, keys: 0, items: {} }, Object.assign({}, rules, { buyKeys: false }))), 'my dagger has no Thief Key and buying keys is off -> skip');
check(/Unlock is switched off/.test(G.doorGateWhy(doors, { unlock: true, keys: 20, items: {} }, Object.assign({}, rules, { unlockDoors: false }))), 'route rule Unlock off -> skip');
// an own route that does not pass the door: no door question
check(G.doorGateDoors(at.steps, [{ x: 43408, y: 206881 }, { x: 44000, y: 207300 }]).length === 0, 'an own route far from the door has no door');
check(G.doorGateDoors([], null).length === 0 && G.doorGateWhy([], {}, rules) === '', 'no doors -> go');
// timed / npc doors are not a dagger question
check(G.doorGateWhy([{ do: 'door', name: 'T', need: { wait: { maxWait: 60 } } }], { unlock: false }, rules) === '', 'a timed door does not need a dagger');

// circuit plan: the boss gets state skip / kind door with the reason, the next boss is picked instead
const db = [{ id: 25029, name: 'Atraiban', level: 53, curseLevel: 52, x: 54941, y: 206705 }, { id: 2, name: 'B', level: 50, curseLevel: 50, x: 0, y: 0 }];
const cfg = RC.rcConfigOf({ parties: { L: { bosses: [25029, 2] } } }, 'L');
const plan = RC.rcPlan(cfg, db, {}, {}, Date.now(), { x: 0, y: 0, teamMax: 55, doorBan: { 25029: noDagger } });
const a = plan.find(r => r.id === 25029);
check(a.state === 'skip' && a.kind === 'door' && a.why === noDagger, 'circuit plan: Atraiban skipped with the door reason');
check(RC.rcNext(plan).next && RC.rcNext(plan).next.id === 2, 'circuit: the next boss is the other one');

// host wiring present
check(/raidDoorGateWhy\(b\); if \(!w\) return true;/.test(src), 'raidhunt filters candidates through raidDoorGateWhy');
check(/doorBan\[String\(e\.id\)\] = w/.test(src) && /teamMax: teamMaxLevel\(\), doorBan \}/.test(src), 'rcMakePlan passes doorBan to rcPlan');
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
