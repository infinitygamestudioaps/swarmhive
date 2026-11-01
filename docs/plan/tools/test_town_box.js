// test_town_box.js - requirement towns.md R1 (owner 2026-10-30 "Fix this" / "did you make sure that this wont happend again"): the NPCs in the
// Giran outskirts (Pushkin, Rupio, Kusto ~77458,148169, 6,000 from the Giran landing, inside the walls) count as Giran for every part of the bot:
// currentTownKey() (TOWNBOX), the town NPC walk (OUTSKIRT, with its options line) and the item job's Giran check (IJGIRAN).
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (start, end) => { const i = SRC.indexOf(start); return i < 0 ? '' : SRC.slice(i, SRC.indexOf(end, i) + end.length); };

// 1) currentTownKey: run it for real with the TOWN_BOX + TOWN_LAND constants and a stubbed town graph (no gatekeepers, no datapack towns)
const box = cut('const TOWN_BOX = ', ';\n'), land = cut('const TOWN_LAND = ', '};\n'), ctk = cut('function currentTownKey() {', '\n}\n');
check(!!box && !!land && !!ctk, 'TOWN_BOX, TOWN_LAND and currentTownKey() exist');
const run = (x, y) => new Function('Me', 'buildTownGraph', box + land + ctk + 'return currentTownKey();')({ X: x, Y: y }, () => ({ pos: {}, livePos: [], edges: {} }));
check(run(77458, 148169) === 'Giran', 'Pushkin (77458,148169) = Giran');
check(run(77712, 148288) === 'Giran' && run(77659, 148089) === 'Giran', 'Rupio and Kusto = Giran');
check(run(83473, 148554) === 'Giran', 'the Giran landing = Giran');
check(run(80744, 146424) === 'Giran', 'Taurin (warehouse) = Giran');
check(run(123176, -46040) !== 'Giran', 'Varka (a hunting ground far away) is not Giran');
check(run(-12712, 122776) === 'Gludio', 'other towns still work (Gludio landing)');

// 2) the town NPC walk: an NPC filed under "Giran outskirts" (nearTown) walks, and the options object exists (the 'o is not defined' bug)
const tw = cut('async function townWalkToNpc(npc, opts) {', '\n}\n');
check(/const o = opts \|\| \{\}, pl0 = /.test(tw), "townWalkToNpc defines its options 'o' (the 17:22 bug: 'o is not defined')");
check(/pl0\.nearTown && num\(pl0\.nearTown\.dist\) < 8000/.test(tw), 'townWalkToNpc: an NPC near a town counts as that town (Pushkin = Giran outskirts)');

// 3) the item job: the member's trip check uses the Giran area
check(/function ijInGiran\(\)/.test(SRC) && /x >= 75900 && x <= 85100 && y >= 144800 && y <= 152400/.test(cut('function ijInGiran()', '\n')), 'ijInGiran() = the Giran box');
const ij = SRC.slice(SRC.indexOf('IJHOLD-2026-10-17'), SRC.indexOf('IJHOLD-2026-10-17') + 1500);
check(/if \(ijInGiran\(\)\) \{ o\.ok = true; o\.member/.test(ij) && /while \(!ijInGiran\(\)/.test(ij), 'item job: a member at Pushkin is in Giran (no endless "take the party to Giran")');
console.log(`town box: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
