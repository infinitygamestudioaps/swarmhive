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
t('the repair ends stale route walks, follow routes and drops a target stuck at 0 % HP', /function levelFixMine\(why\)[\s\S]{0,300}memberRouteStop\(\)[\s\S]{0,300}rgFollow\.pts = \[\][\s\S]{0,400}hpZeroKnown\(t\)\) \{ huntBlack\[/.test(SW) && /function hpZeroKnown\(m\)[^\n]*num\(m\.MaxHP !== undefined \? m\.MaxHP : m\.MaxHp\) > 0/.test(SW));
t('missing shots are named in the repair note', /NO SHOTS: buy shots from player shops/.test(SW));
t('the card shows SLOW HUNTING (swarm_state levelHealth)', /levelHealth: \(typeof LH2 !== 'undefined'/.test(SW) && /<b>SLOW HUNTING<\/b>/.test(PS));
// the related permanent fixes of the same day stay wired
t('ROUTESTALE: a quiet member walk ends after 2 min', /memberRoute\.id && !memberRoute\.busy && now\(\) > \(memberRoute\.until \|\| 0\)\) routeStaleEnd\(/.test(SW));
t('ATTACKFIRST in the hunting loop', /const af = attackFirstNow\(lastTarget\);/.test(SW));
t('DEFENDSTILL: standing still = self-defence', /now\(\) - \(MTRUN\.at \|\| 0\) < 3000\) return; \}/.test(SW));
t('FOLLOWSWING: no hallway walk while the leader fights close by', /if \(dd <= 1500 && lp && now\(\) - lp\.at < 6000 && \(lp\.fight \|\| lp\.hit\)\)/.test(SW));
t('KILLCOUNT: kills = the larger of the hunt loop count and the experience gains (L2Swarm combat / assist kills counted too)', /function killsIn\(ms\)[^\n]*LIVEP\.hour[^\n]*return Math\.max\(own, xp\);/.test(SW) && /kills5 = killsIn\(LEVELHEALTH\.windowMs\)/.test(SW) && /kills5m: killsIn\(300000\)/.test(SW));
// FASTHUNT-2026-10-23 (owner: "L2Swarm and Adrenaline attack almost instantly ... boom boom boom"): no fixed waits around a monster
t('FASTHUNT: engage waits only until the attack starts / the target dies (no fixed 2.5 s)', /await fastWait\(2500, \(\) => !!\(Me\.IsAttacking \|\| Me\.IsCasting\) \|\| targetGone\(t\.objId\), 100\);/.test(SW) && !/Send\.Action\(t\.objId\);                          \/\/ andet klik på en valgt mob = angrib \(serveren går hen\)\n  await sleep\(2500\);/.test(SW));
t('FASTHUNT: the next monster the moment the current one dies (no fixed 1.5 s per round)', SW.includes('await sleep(250);') && /\{ const lt = lastTarget; await fastWait\(1250, \(\) => !!lt && targetGone\(lt\)/.test(SW));
t('FASTHUNT: an empty room waits only until a monster shows up', /await fastWait\(4000, \(\) => !!huntTarget\(center\.x, center\.y, radius\)/.test(SW));
t('ORDERFLOOD: brain Send proxy drops repeated Action / Attack orders', /ORDERFLOOD-2026-10-24/.test(fs.readFileSync(path.join(R, 'Dashboard', 'brain_host', 'host.js'), 'utf8')) && SW.includes('if (srvAtkLast.id === o && now() - srvAtkLast.at < 600) return;'));
t('UNFREEZE: hit but not fighting back = Appearing resync', SW.includes("sendAppearing('hit but not fighting back for 8 s')"));
{ const src = (SW.match(/function hpZeroKnown\(m\)[^\n]*/) || [''])[0]; const hz = new Function('num', src + '\nreturn hpZeroKnown;')((v) => Number(v) || 0);
  t('HPKNOWN: a monster nobody targeted yet (HP 0 / MaxHP 0) is NOT "0 % HP" (it is attacked, never put aside)', hz({ HpPercent: 0, MaxHP: 0 }) === false && hz({ HpPercent: 0, MaxHP: 900 }) === true && hz({ HpPercent: 55, MaxHP: 900 }) === false); }
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
