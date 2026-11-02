// OFFLINE TEST: SFSOLO + SKIPSAY (tester Vykaax 2026-11-02, solo vRunner lvl 20 at Abandoned Camp; videos streamable a0t3qu / vextbw).
//  - "Fight with L2Swarm" also counts for a character ALONE: the leader / solo character owns L2Swarm's combat (StartCombat for real, no Hive
//    script fight, no Hive picks), and the combat zone Hive set at the spot is put back (at once when L2Swarm shows Off, else every minute).
//  - Hive's own picking names the monster kinds it leaves alone as too high (SKIPSAY).
// Never touches the game, MCP or live data.   node docs/plan/tools/test_sf_solo.js   (SWARM_JS=<file> tests another copy)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0, n = 0;
const check = (ok, what, info) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info ? ' - ' + info : '')); if (!ok) fails++; };
const fnSrc = (head) => { const i = src.indexOf(head); if (i < 0) { console.error('not found: ' + head); process.exit(1); } return src.slice(i, src.indexOf('\n}\n', i) + 3); };

// ---- 1) pure parts
const F = new Function(`const SF_ZONE_MS = 60000;\n${fnSrc('function sfZoneDue(')}\n${fnSrc('function skipSayText(')}\nreturn { sfZoneDue, skipSayText };`)();
const z = { kind: 'square', at: 1000 };
check(F.sfZoneDue(z, 'Off', 1001) === true, 'L2Swarm shows no zone (Off): the zone is set again at once');
check(F.sfZoneDue(z, 'off', 1001) === true, 'Off in any case');
check(F.sfZoneDue(z, 'Polygon', 1000 + 59000) === false, 'a zone set < 1 min ago is not touched');
check(F.sfZoneDue(z, 'Polygon', 1000 + 60000) === true, 'after a minute it is put back (a reload / hand change cannot leave it gone)');
check(F.sfZoneDue(z, '', 1000 + 60000) === true, 'unknown zone type: the minute rule');
check(F.sfZoneDue(null, 'Off', 5) === false && F.sfZoneDue({}, 'Off', 5) === false, 'no zone chosen by Hive: nothing to put back');
const s1 = F.skipSayText({ 'Ol Mahum Commander': 29, 'Ol Mahum Raider': 23 }, 20, true, false);
check(/Ol Mahum Commander \(29\)/.test(s1) && /lvl 20/.test(s1) && /\+1/.test(s1), 'SKIPSAY names the skipped kind, its level, my level and the limit (alone +1)', s1);
check(s1.indexOf('Commander') < s1.indexOf('Raider'), 'highest first');
check(/Fight with L2Swarm/.test(s1), 'the note says how to let L2Swarm pick instead');
check(/\+6, your spot/.test(F.skipSayText({ A: 30 }, 20, false, true)) && /\+3/.test(F.skipSayText({ A: 30 }, 20, false, false)), 'limits: chosen spot +6, party +3');
check(F.skipSayText({}, 20, true, false) === '' && F.skipSayText(null, 20, true, false) === '', 'nothing skipped = no note');
check(/ \.\.\.$/.test(F.skipSayText({ a: 1, b: 2, c: 3, d: 4, e: 5 }, 0, false, false).split(' - ')[0]), 'more than 4 kinds: shortened');

// ---- 2) sfOwnsCombat / soloScriptFight with stubs
const H = { leader: true, on: true, ex: false, solo: true };
const G = new Function('H', `
  const isLeader = () => H.leader, swarmFightOn = () => H.on, sfExcluded = () => H.ex;
  const SOLOSAFE = { scriptFight: true }, soloChar = () => H.solo, state = { mode: 'autolevel' }, currentTownKey = () => '', isHealerRole = () => false, inRaid = () => false, inst = { on: false };
  ${fnSrc('function sfOwnsCombat(')}
  ${fnSrc('function soloScriptFight(')}
  return { sfOwnsCombat, soloScriptFight };`)(H);
check(G.sfOwnsCombat() === true, 'switch on + leader / solo character: L2Swarm owns the combat');
check(G.soloScriptFight() === false, 'switch on: a solo character is NOT swapped to the Hive script fight (no StopCombat, StartCombat for real)');
H.on = false; check(G.sfOwnsCombat() === false && G.soloScriptFight() === true, 'switch off: the solo script fight (Hive safety picks) as before');
H.on = true; H.ex = true; check(G.sfOwnsCombat() === false && G.soloScriptFight() === true, 'raids / instances / missions stay Hive\'s');
H.ex = false; H.leader = false; check(G.sfOwnsCombat() === false, 'a member never owns L2Swarm combat (Follow + Follow Attack only)');

// ---- 3) source wiring
const loop = src.slice(src.indexOf('// SWARMFIGHT-2026-10-16: the switch on = L2Swarm'), src.indexOf('// SWARMFIGHT-2026-10-16: the switch on = L2Swarm') + 600);
check(/const sfMode = \(\(\) => \{ try \{ return sfOwnsCombat\(\);/.test(loop) && !/!solo; \} catch/.test(loop), 'the hunting step: sfMode = sfOwnsCombat() (no more "&& !solo")');
check(/function sfLeaderTick\(\) \{[\s\S]{0,200}sfZoneKeep\(\)/.test(src), 'sfLeaderTick keeps the zone every hunting step');
const setup = src.slice(src.indexOf('zoneSetup: {'), src.indexOf('autoLvl.zone = { x: Math.round(center.x)'));
check((setup.match(/sfZoneSet\(\{ kind: 'poly'/g) || []).length === 2 && /sfZoneSet\(\{ kind: 'map'/.test(setup) && (setup.match(/sfZoneSet\(\{ kind: 'square'/g) || []).length === 2, 'every zone the hunting step sets (drawn area, room fallback, zmap, square, same-spot square) is remembered');
check(/function startCombatG\(\)[\s\S]{0,1400}soloScriptFight\(\) && !hiveOwnCombat\(\)/.test(src), 'startCombatG still asks soloScriptFight (now false with the switch on)');
check(/lvHigh\[String\(mb\.Name\)\] = lvl/.test(src) && /skipSayText\(lvHigh, L, solo, userSpot\)/.test(src), 'huntTarget collects the too-high kinds and says them (SKIPSAY)');

console.log(`\n${n - fails}/${n} ok`);
process.exit(fails ? 1 : 0);
