// OFFLINE TEST SELLTRIP-2026-10-30 (owner: "I asked Tank2 team to go sell? But he is not going?"): !sell outside a town = the leader takes the
// team to Giran first (orderTownTrip, the safe team trip), passes !sell on in party chat, sells himself, leveling resumes; members wait for him.
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let oks = 0, fails = 0; const check = (ok, w) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + w); };
const i = SRC.indexOf("case '!sell': {"), blk = SRC.slice(i, i + 9000);
const trip = blk.slice(blk.indexOf('SELLTRIP-2026-10-30'), blk.indexOf('(async () => {\n        await bagSync();'));
check(i > 0 && trip.length > 200, 'the !sell handler has the town trip block before the sale itself');
check(/if \(!currentTownKey\(\) && leadMode\(\) && !state\.sellTrip\)/.test(trip), 'only outside a town (in a town the sale runs at once, as before), never twice at the same time');
check(/if \(leaderHere\) \{ note\([^)]*takes the team to/.test(trip), 'a member with its leader in the party waits for the leader (no "stand in a town" refusal)');
check(/orderTownTrip\('!sell', hub, \{ control: '!sell', solo: soloChar\(\) \|\| !isLeader\(\) \}\)/.test(trip), 'the leader uses the safe team trip (regroup, out of the fight, .giran); a lone character goes alone');
const sn = SRC.slice(SRC.indexOf("App.on('swarm.sellnow'"), SRC.indexOf("App.on('swarm.sellnow'") + 500);
check(/App\.emit\('swarm\.sellnow'/.test(trip) && !/SayToParty\('!sell'\)/.test(trip) && /handleSay\(Me\.Name, '!sell'\)/.test(trip), 'in Giran: the leader signals the members (an App event, not a chat copy the queue drops as a duplicate) and sells himself');
check(/d\.leader !== CONFIG\.leader \|\| isLeader\(\) \|\| !currentTownKey\(\)/.test(sn) && /handleSay\(Me\.Name, '!sell'\)/.test(sn), 'member: the leader\'s signal in a town = its own !sell now');
check(/state\.sellResumeLvl = wasLvl && isLeader\(\);/.test(trip) && /sellLvl = !!state\.sellResumeLvl; state\.sellResumeLvl = false;/.test(blk), 'leveling that ran before the trip resumes after the sale');
check(/could not get to \$\{hub\}[^;]*nothing sold/.test(trip), 'a trip that fails says so and goes back to leveling');
console.log(`\nsell trip: ${oks} ok, ${fails} failed`); process.exit(fails ? 1 : 0);
