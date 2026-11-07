// IJERRAND-2026-11-04 guard: a member's whole item job (Upgrade / Items page job) is ONE errand = no follow until the job ends
// owner (Destroyer3 team gear-up): "they are running back and forth to the leader because they are following him"
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const i = SRC.indexOf('async function itemJobOrder('), body = i < 0 ? '' : SRC.slice(i, SRC.indexOf('\nasync function ', i + 30) > 0 ? SRC.indexOf('\nasync function ', i + 30) : i + 20000);
t('itemJobOrder exists', !!body);
t('a member starts ONE errand for the whole item job (not only per NPC walk)', /if \(!isLeader\(\)\) \{ errandStart\('itemjob', 90 \* 60000\); ijErrand = true; \}/.test(body));
t('the errand starts before the first step (right after IJ.busy is set)', body.indexOf("errandStart('itemjob'") > body.indexOf('IJ.busy = id;') && body.indexOf("errandStart('itemjob'") < body.indexOf('const seq = orderState.seq'));
t('it ends only in the finally (job over), never in the middle', /finally \{\s*IJ\.busy = ''; state\.gkBusy = false;\s*try \{ if \(ijErrand\) errandEnd\(\); \}/.test(body) && (body.match(/errandEnd\(/g) || []).length === 1);
// the follow rule really honours an errand for members
const f = SRC.slice(SRC.indexOf('function followOk('), SRC.indexOf('function followOk(') + 1500);
t('followOk: a member on an errand gets no follow', /if \(!isLeader\(\) && typeof errandNow === 'function' && errandNow\(\)\) return false;/.test(f));
// the per-NPC-walk errand does not end ours (it only ends its own 'npc' kind and only starts when no errand runs)
t('the NPC walk errand starts only when no errand runs and ends only its own kind', /!errandNow\(\) && currentTownKey\(\) && Distance\(npc\) > 300\) \{ errandStart\('npc'/.test(SRC) && /if \(ownErrand\) errandEnd\('npc'\)/.test(SRC));
console.log(`ijerrand: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
