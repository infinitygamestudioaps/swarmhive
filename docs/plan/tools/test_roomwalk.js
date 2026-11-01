// OFFLINE TEST ROOMWALK-2026-10-30 (owner screenshot: Spoiler6 + Healer6 4 h in a dead-end corridor beside the Cruma Ossiud room, "you are trying to
// access through a wall"): walking back into the room takes the room-graph walk (walkTo -> rgWalkInside), and 2 level-health repairs in a row while
// the leader stands OUTSIDE the room's outline = the party goes to Giran and takes the normal way in again.
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let oks = 0, fails = 0; const check = (ok, w) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + w); };
const back = SRC.slice(SRC.indexOf("note(`room: outside ${R.name} — walking back inside`);"), SRC.indexOf("note(`room: outside ${R.name} — walking back inside`);") + 700);
check(/walkTo\(p\.x \+ \(Math\.random\(\) - 0\.5\) \* 200, p\.y \+ \(Math\.random\(\) - 0\.5\) \* 200, me\.Z, 150, 30000\)/.test(back) && !/walkDirect\(p\.x/.test(back), 'members walk back into the room with walkTo (room-graph centrelines first), not a straight move');
const zh = SRC.slice(SRC.indexOf('async function zoneHoldStep('), SRC.indexOf('async function zoneHoldStep(') + 900);
check(/await walkTo\(d\.to\.x, d\.to\.y, z, 150, 60000\);/.test(zh) && !/walkDirect\(d\.to\.x/.test(zh), "the leader's walk into his drawn area: walkTo on dungeon floors too");
const wt = SRC.slice(SRC.indexOf('async function walkToInner('), SRC.indexOf('async function walkToInner(') + 3000);
check(/rgWalkInside\(/.test(wt), 'walkTo tries the room-graph walk first inside a dungeon');
const lh = SRC.slice(SRC.indexOf('LH2.fixAt = t; LH2.bad = 0;'), SRC.indexOf('LH2.fixAt = t; LH2.bad = 0;') + 2200);
check(/out = !!poly && !nearPolygon\(num\(Me\.X\), num\(Me\.Y\), poly, 150\)/.test(lh) && /LH2\.outFix >= 2/.test(lh), 'level health: outside the room outline at 2 repairs in a row');
check(/await leadGoGiran\(`stuck outside \$\{sp\.name\}`\)/.test(lh) && /autoLvl\.spot = null;/.test(lh) && /leadLevel\(/.test(lh) && /SayToParty\(/.test(lh), '-> party chat, the team to Giran, the spot picked + travelled again the normal way');
console.log(`\nroom walk: ${oks} ok, ${fails} failed`); process.exit(fails ? 1 : 0);
