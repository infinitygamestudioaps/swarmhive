// OWNERRUN + CAMPLEADER guard (owner 2026-11-04, FoG level 2 AOE room: 3 runners run the owner's recorded routes back and forth, the team
// fights ONLY at the centre = 0 from the leader)
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const F = new Function(SRC.slice(SRC.indexOf('// OWNERRUN-PURE-BEGIN'), SRC.indexOf('// OWNERRUN-PURE-END')) + '\nreturn { ownerRunRules, ownerLegMs, aoeCampOnLeader };')();
const R = F.ownerRunRules({ ownerRoutes: true }), N = F.ownerRunRules({});
t('owner routes: out again at once (no quiet-camp wait)', R.quietGate === false && N.quietGate === true);
t('owner routes: no room / 200 limit on the recorded points', R.roomCheck === false && N.roomCheck === true);
t('owner routes run while hold is on; others stay blocked', R.holdOk === true && N.holdOk === false);
t('leg time grows with the distance', F.ownerLegMs(1200) === 12000 && F.ownerLegMs(0) === 2000);
const c = { camp: { x: 186560, y: -110000, z: -5888 }, healers: { x: 1, y: 1 }, dealers: { x: 1, y: 1 } };
const m = F.aoeCampOnLeader(c, { X: 186700, Y: -110100, Z: -5888, at: 1000 }, 5000);
t('camp, healers and dealers = the leader (0 from him)', m.camp.x === 186700 && m.healers.x === 186700 && m.dealers.y === -110100);
t('a stale leader position keeps the ground camp', F.aoeCampOnLeader(c, { X: 186700, Y: -110100, at: 0 }, 30000).camp.x === 186560);
t('the leader far from the ground keeps the ground camp', F.aoeCampOnLeader(c, { X: 176000, Y: -110100, at: 1000 }, 2000).camp.x === 186560);
t('the pull uses the owner rules', /const OR = ownerRunRules\(c\);/.test(SRC) && /if \(OR\.quietGate\)/.test(SRC) && /OR\.roomCheck && !pullPointOk/.test(SRC));
t('AOEBACK: the walk back to my place at the owner AOE centre is allowed in hold (only then)', /if \(ownerRunRules\(c\)\.holdOk\) \{ AOE\.placeWalk = true;/.test(SRC) && /kind === 'walk' && typeof AOE !== 'undefined' && AOE\.placeWalk\) return false/.test(SRC));
t('AOEHAND: the hand-played-leader follow keeper leaves an AOE team alone (runners were pulled back to the owner)', /try \{ const ac = aoeCfg\(\); if \(ac && aoeActive\(ac\)\) return; \} catch \(e\) \{ \}\s*\n\s*if \(NNAV\) NNAV\.wantFollow = false;/.test(SRC));
t('OWNERRUN2: a missed point never ends the owner route (on to the next point)', /if \(!OR\.roomCheck\) \{[^\n]*\n\s*if \(!\(await ownerLeg\([^\n]*on to the next point`\);/.test(SRC));
t('OWNERRUN2: no L2Swarm combat / follow restart under a runner on his route', /if \(typeof AOE !== 'undefined' && AOE\.pulling\) return;/.test(SRC));
// OWNERGATE + OWNERNOFIGHT (owner 2026-11-05: "Ja" to: runners wait until under ~10 monsters at the camp; no fighting back while running)
const G = new Function(SRC.slice(SRC.indexOf('// OWNERRUN-PURE-BEGIN'), SRC.indexOf('// OWNERRUN-PURE-END')) + '\nreturn ownerCampGate;')();
t('OWNERGATE: 44 at the camp = wait, 9 = out again, 10 = still wait', G(44, {}).go === false && G(9, {}).go === true && G(10, {}).go === false);
t('OWNERGATE: the ground may set its own limit', G(14, { ownerMaxCampMobs: 15 }).go === true);
const run = SRC.slice(SRC.indexOf('async function aoePullRun('), SRC.indexOf('/** everyone but the pullers'));
t('OWNERGATE: the owner route checks the camp before the run starts', /ownerCampGate\(aoeCampMobs\(c, 900\)\.length, c\)/.test(run) && run.indexOf('ownerCampGate(') < run.indexOf('AOE.runs++'));
t('OWNERNOFIGHT: L2Swarm combat + assist off on the route, assist back after', /if \(!OR\.roomCheck\) \{ try \{ StopCombat\(\); \}/.test(run) && /if \(AOE\.faWas\) \{ AOE\.faWas = false; try \{ Options\.FollowAtk = true;/.test(run));
t('OWNERNOFIGHT: a leg that gets into a fight stops it and moves on', /if \(\(IsInCombat \|\| Me\.IsAttacking\) && now\(\) - last\.at > 400\) \{ try \{ StopCombat\(\); \}/.test(SRC));
const J = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../Scripts/data/aoe_teams.json'), 'utf8').replace(/^﻿/, ''));
const g = J.grounds['fog-l2-aoe'], tm = J.teams.Destroyer3;
t('the FoG level 2 ground holds the 3 recorded routes, owner routes, camp on the leader', g && g.routes.length === 3 && g.ownerRoutes === true && g.campOnLeader === true);
t('3 runners, one per route; the healers are healers', tm.pullers.length === 3 && ['r1', 'r2', 'r3'].every(r => tm.pullers.some(p => tm.roles[p].route === r)) && tm.roles.Bishop2.role === 'healer' && tm.roles.Chanter2.role === 'healer');
console.log(`ownerrun: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
