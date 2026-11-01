// OFFLINE TEST ORDERSTOP-2026-10-30 (owner: "why is shaded trying to escape"): a trip to the CHOSEN spot that an order interrupts (!sell 5 s after the
// supply run: "stopped (your Stop)", "a more important task took over") is not a failed trip: no fallback to the automatic spot (Forge of the Gods),
// no skip list; the same spot is picked again when the order is done.
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let oks = 0, fails = 0; const check = (ok, w) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + w); };
const i = SRC.indexOf('if (!(await travelToSpot(spot))) {'), blk = SRC.slice(i, i + 3500);
const iStop = blk.indexOf('ORDERSTOP-2026-10-30'), iFall = blk.indexOf('manualSpotOnTravel(spot, false);');
check(i > 0 && iStop > 0 && iFall > iStop, 'the interruption check comes BEFORE manualSpotOnTravel(spot, false) (= the fallback to the automatic spot)');
const re = /if \(autoLvl\.stop \|\| outranked\(PRIO\.LEVEL\) \|\| \/your Stop\|more important task\|interrupted\|replaced by a newer order\/i\.test\(String\(gkFail \|\| ''\)\)\) \{[\s\S]{0,400}?writeClaim\(null\); autoLvl\.spot = null; lastPick = 0;[\s\S]{0,200}?continue;/;
check(re.test(blk), 'an order / Stop / more important task: no skip list, no fallback, claim freed, the same spot picked again (continue)');
const msgs = ['stopped (your Stop) after the computed path', 'a more important task took over - not teleporting'];
check(msgs.every(m => /your Stop|more important task|interrupted|replaced by a newer order/i.test(m)), "the real messages of 2026-10-30 10:02 match ('stopped (your Stop)', 'a more important task took over')");
check(!/your Stop|more important task|interrupted|replaced by a newer order/i.test('no link to Devil Isle at Clarissa (Giran)') && !/your Stop|more important task/i.test('REFUSED: danger'), 'a real failure (no link / REFUSED) still counts as a failed trip');
console.log(`\norder stop: ${oks} ok, ${fails} failed`); process.exit(fails ? 1 : 0);
