// Requirement hunting.md R5 (owner 2026-10-23: "make a permanent fix this time ... a Lineage 2 bot should be able to level fast").
// LEVELHEALTH + ROUTESTALE + ATTACKFIRST / DEFENDSTILL / FOLLOWSWING wiring in Scripts_dev/swarm.js, offline.
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..', '..');
const SW = fs.readFileSync(path.join(R, fs.existsSync(path.join(R, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev/swarm.js' : 'Scripts/swarm.js'), 'utf8');
const PS = fs.readFileSync(path.join(R, 'Dashboard', 'partystatus.js'), 'utf8');
let ok = 0, bad = 0;
const t = (name, c) => { if (c) ok++; else { bad++; console.log('FAIL', name); } };
const i = SW.indexOf('// LEVELHEALTH-PURE-BEGIN'), j = SW.indexOf('// LEVELHEALTH-PURE-END');
if (i < 0 || j < 0) { console.log('FAIL LEVELHEALTH-PURE block missing'); process.exit(1); }
const P = new Function(SW.slice(i, j) + '\nreturn { levelHealthDecide, LEVELHEALTH };')();
const M = 60000;
t('just arrived (< 3 min at the spot): never a repair', P.levelHealthDecide({ kills5: 0, mobs: 20, atSpotMs: 2 * M, bad: 5 }).fix === false);
let s = { bad: 0 };
for (let k = 0; k < 2; k++) { s = P.levelHealthDecide({ kills5: 0, mobs: 20, atSpotMs: 10 * M, bad: s.bad }); }
t('two slow checks: not yet', s.bad === 2 && s.fix === false);
s = P.levelHealthDecide({ kills5: 1, mobs: 20, atSpotMs: 10 * M, bad: s.bad });
t('third slow check (90 s): repair', s.fix === true);
t('a repair less than 3 min ago: not again', P.levelHealthDecide({ kills5: 0, mobs: 20, atSpotMs: 10 * M, bad: 2, lastFixAgo: M }).fix === false);
t('kills fine: the count resets', P.levelHealthDecide({ kills5: 12, mobs: 20, atSpotMs: 10 * M, bad: 2 }).bad === 0);
t('no monsters here (a slow respawn, not a stalled hunt): no repair', P.levelHealthDecide({ kills5: 0, mobs: 1, atSpotMs: 10 * M, bad: 2 }).bad === 0);
t('the leader tells the whole party (swarm.levelfix) and every member clears its own state', /App\.emit\('swarm\.levelfix'/.test(SW) && /App\.on\('swarm\.levelfix', \(e\) => \{ try \{ if \(e\.source\.characterName !== CONFIG\.leader \|\| isLeader\(\)\) return; levelFixMine\(/.test(SW));
t('the repair ends stale route walks, follow routes and drops a target stuck at 0 % HP', /function levelFixMine\(why\)[\s\S]{0,300}memberRouteStop\(\)[\s\S]{0,300}rgFollow\.pts = \[\][\s\S]{0,400}num\(t\.HpPercent\) <= 0\) \{ huntBlack\[/.test(SW));
t('missing shots are named in the repair note', /NO SHOTS: buy shots from player shops/.test(SW));
t('the card shows SLOW HUNTING (swarm_state levelHealth)', /levelHealth: \(typeof LH2 !== 'undefined'/.test(SW) && /<b>SLOW HUNTING<\/b>/.test(PS));
// the related permanent fixes of the same day stay wired
t('ROUTESTALE: a quiet member walk ends after 2 min', /memberRoute\.id && !memberRoute\.busy && now\(\) > \(memberRoute\.until \|\| 0\)\) routeStaleEnd\(/.test(SW));
t('ATTACKFIRST in the hunting loop', /const af = attackFirstNow\(lastTarget\);/.test(SW));
t('DEFENDSTILL: standing still = self-defence', /now\(\) - \(MTRUN\.at \|\| 0\) < 3000\) return; \}/.test(SW));
t('FOLLOWSWING: no hallway walk while the leader fights close by', /if \(dd <= 1500 && lp && now\(\) - lp\.at < 6000 && \(lp\.fight \|\| lp\.hit\)\)/.test(SW));
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
