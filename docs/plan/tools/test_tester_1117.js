// test_tester_1117.js - guards the #swarmhive fixes of 2026-11-17 (testers on L2Swarm 3.12.7 + SwarmHive 1.14.5; list: docs/plan/discord_issues_2026-11-17.md).
//   node docs/plan/tools/test_tester_1117.js   (exit code 1 when a check fails)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fails = 0;
const t = (m, c) => { if (c) { pass++; console.log('  ok   ' + m); } else { fails++; console.log('  FAIL ' + m); } };
const fn = (name) => { const i = SRC.indexOf('function ' + name + '('); if (i < 0) throw new Error('missing ' + name); let d = 0, j = SRC.indexOf('{', i); for (; j < SRC.length; j++) { if (SRC[j] === '{') d++; else if (SRC[j] === '}' && --d === 0) break; } return SRC.slice(i, j + 1); };
const cnst = (name) => { const i = SRC.indexOf('const ' + name + ' = '); if (i < 0) throw new Error('missing const ' + name); let d = 0, j = SRC.indexOf('{', i); for (; j < SRC.length; j++) { if (SRC[j] === '{') d++; else if (SRC[j] === '}' && --d === 0) break; } return SRC.slice(i, j + 1) + ';'; };

// #15 PARKLEVEL: your Level order ends the park before the run gate; the party pause cache resets too
{ const ll = fn('leadLevel'), first = ll.split('\n').slice(0, 4).join('\n');
  t('PARKLEVEL: leadLevel clears your park / stop pause for YOUR order before runAuto', /parkEndForOrder\(why\);/.test(first) && ll.indexOf('parkEndForOrder(why)') < ll.indexOf("runAuto('leveling')") && /function parkEndForOrder\(why\) \{ if \(levelByUser\(why\) && !\/\^clan quest item found\/i\.test\(String\(why \|\| ''\)\)[^&]*&& partyUserPaused\(\)\) \{ setLeadPaused\(false\);/.test(SRC));   // REVIEW: the automatic clan-quest restart keeps the park
  t('PARKLEVEL: setLeadPaused resets the 3 s party pause cache', /function setLeadPaused\(on, why\) \{ leadPauseCache\.at = 0; try \{ partyPauseCache\.at = 0; \}/.test(SRC));
  const lbu = new Function(fn('levelByUser') + '; return levelByUser;')();
  t('PARKLEVEL: !level / !autolevel / !dungeon count as your order, automatic starts do not', lbu('!level') && lbu('!autolevel') && lbu('!dungeon Necropolis') && !lbu('automatic pause expired') && !lbu('watchdog')); }

// #9 REINVITE: a member in a stale party leaves it for its leader's invite; the leader backs off after 3 invites
{ const h = SRC.slice(SRC.indexOf("App.on('swarm.leaderback.invite'"), SRC.indexOf("App.on('swarm.leaderback.invite'") + 1400);
  t('REINVITE: in another party (not my leader\'s) -> RequestWithDrawalParty, then accept', /if \(soInParty\(String\(event\.data\.from\)\) \|\| stationVisit \|\| benched\(\)\) return;/.test(h) && /Send\.RequestWithDrawalParty\(\)/.test(h) && /RequestAnswerJoinParty\(1\)/.test(h));
  t('REINVITE: never during a buff-station visit (SOH waits) or when benched', /Object\.keys\(SOH\.waits \|\| \{\}\)\.length > 0/.test(h));
  t('REINVITE: the leader invites every 30 s, after 3 tries every 5 min; joined = reset', /\(tries >= 3 \? 300000 : 30000\)/.test(SRC) && /inParty\.forEach\(n => \{ delete inviteN\[n\]; \}\)/.test(SRC)); }

// #19 SSWEEK: a suspect priest page (last week's period right after the change) is re-read, never a week-long "closed"
{ const SSL = require(path.join(ROOT, 'Dashboard', 'sslogic.js')), H = 18, E = 6 * 3600e3, T = Date.parse;
  const monChange = T('2026-11-16T18:00:00Z'), now = T('2026-11-16T23:35:00Z');
  const sus = SSL.ssgNow({ period: 'validation', winner: 'dawn', checkedAt: T('2026-11-16T19:00:00Z'), suspect: true }, now, H, E);
  const ok = SSL.ssgNow({ period: 'validation', winner: 'dawn', checkedAt: T('2026-11-16T19:00:00Z') }, now, H, E);
  t('SSWEEK: ssgNow marks a suspect page for a re-read after 30 min (recheck), a normal page not', sus.recheck === true && sus.stale === true && ok.recheck === false && monChange < now);
  const g = SSL.ssGateDecide(sus, [{ name: 'Aa', rec: {} }], 'catacomb', {});
  t('SSWEEK: not signed + suspect page -> check (read the priest again), not closed until next Monday', g.state === 'check' && g.code === 'recheck');
  const g2 = SSL.ssGateDecide(ok, [{ name: 'Aa', rec: {} }], 'catacomb', {});
  t('SSWEEK: a normal validation page still closes for a non-member (the rule itself unchanged)', g2.state === 'closed' && g2.code === 'notsigned');
  t('SSWEEK: ssSaveState flags a page that still shows last week\'s period within 12 h after the change', /prev\.period === r\.period\) s\.suspect = true/.test(SRC) && /now\(\) - lastChange < 12 \* 3600e3/.test(SRC));
  const dash = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8'), api = fs.readFileSync(path.join(ROOT, 'Dashboard', 'sevensigns_api.js'), 'utf8');
  t('SSWEEK: the dashboard copies carry the same recheck', /recheck: rc/.test(dash) && /recheck: rc/.test(api) && /if \(c === 'recheck'\)/.test(dash) && /if \(cur\.recheck &&/.test(dash)); }

// #1 MEMBERNOCOMBAT: a lead-mode member with Hive skills never starts L2Swarm combat; Swarm-skills members defend in the tight square only
{ const mdh = new Function(fn('memberDefendHow') + '; return memberDefendHow;')();
  t('MEMBERNOCOMBAT: member with Hive skills -> script, member with Swarm skills -> tight, leader unchanged', mdh({ member: true, ownCombat: false, how: 'square' }) === 'script' && mdh({ member: true, ownCombat: true, how: 'square' }) === 'tight' && mdh({ member: false, how: 'square' }) === 'square');
  const sc = fn('startCombatG');
  t('MEMBERNOCOMBAT: startCombatG refuses for memberNoCombat()', /if \((typeof memberNoCombat === 'function' && )?memberNoCombat\(\)\) return;/.test(sc));
  const mnc = fn('memberNoCombat');
  t('MEMBERNOCOMBAT: raids / instances / missions / solo / Swarm-skills members keep their own combat', /isLeader\(\) \|\| !leadMode\(\) \|\| hiveOwnCombat\(\)/.test(mnc) && /soloChar\(\)/.test(mnc) && /inRaid\(\) \|\| inst\.on/.test(mnc) && /raid\|raidclear\|mission\|prep/.test(mnc));
  t('MEMBERNOCOMBAT: self-defence + help use the member rule; help squares are tight for members', /const how = memberDefendHow\(\{ member: memberNoCombat\(\)/.test(SRC) && /\|\| memberNoCombat\(\) \|\| defendHow\(\{ stopped: stopCalmStopped\(\), ownCombat: hiveOwnCombat\(\), recHold: recHold\(\), dist: 0 \}\) === 'script'/.test(SRC) && /if \(hiveOwnCombat\(\) && \(stopCalmStopped\(\) \|\| !isLeader\(\)\)\) combatSquare\(STOPCALM\.tightSquare/.test(SRC)); }

// #14 ROUTESKILLS + CASTNOMELEE in engage(): fights on the way
{ const en = fn('engage');
  t('ROUTESKILLS: a Swarm-skills member fights on the way with its own combat in the tight square', /if \(!isLeader\(\) && hiveOwnCombat\(\)\) \{[\s\S]{0,300}combatSquare\(STOPCALM\.tightSquare[\s\S]{0,120}startCombatG\(\)/.test(en));
  t('ROUTESKILLS: casters only select in engage (a 2nd click = melee)', /if \(mageMember\(\) \|\| casterOwnsAttacks\(\)\) \{ try \{ if \(!Target \|\| num\(Target\.objId\) !== num\(t\.objId\)\) Send\.Action\(t\.objId\); \} catch \(e\) \{ \} return; \}/.test(en)); }

// #11 RAIDREVIVE
{ const rr = new Function(fn('raidReviveDecide') + '; return raidReviveDecide;')();
  t('RAIDREVIVE: alive again, routine stopped, 20 s since the last engage -> back in', rr({ dead: false, running: false, last: 0, now: 30000, res: false }) && !rr({ dead: true, running: false, last: 0, now: 30000 }) && !rr({ dead: false, running: true, last: 0, now: 30000 }) && !rr({ dead: false, running: false, last: 20000, now: 30000 }) && !rr({ dead: false, running: false, last: 0, now: 30000, res: true }));
  t('RAIDREVIVE: the 3 s raid tick re-engages; the engage itself resets the timer', /missionTeamAction\('engage', data\)\.catch\(e => logError\('raid revive engage'/.test(fn('raidFightTick')) && /RAIDFIGHT\.reAt = now\(\);\s+\/\/ RAIDREVIVE/.test(SRC)); }

// #16 RAIDSKILL
{ const rw = new Function(fn('raidWorthTarget') + '; return raidWorthTarget;')();
  t('RAIDSKILL: big-target rows only on the boss (a minion is not worth Violent Temper)', rw('Ice Queen', 'Ice Queen') && !rw('Ice Fairy', 'Ice Queen') && rw('x', ''));
  t('RAIDSKILL: the raid cast uses it and keeps the class guide order (no elementOrder with a guide)', /crLive\(cands, tgt, dT, worthT\)/.test(SRC) && /ord = crOn \? ordBase : elementOrder\(ordBase, state\.bossName\)/.test(SRC) && /worth: crOn \? worthT : true/.test(SRC)); }

// #8 FUNDCOLL
t('FUNDCOLL: the collector is not stopped by the "my own leveling first" gate; a member collector may hand out', /if \(!collectorOn\(\) && leadMode\(\) && isLeader\(\) && !leadPaused\(\) && !autoLvl\.active\) return;/.test(SRC) && /!\(isLeader\(\) \|\| collectorOn\(\)\)/.test(fn('fundRound')));

// #13 CWHLOOK
{ t('CWHLOOK: the clan warehouse actor (bank / crafter) may look, not only the clan leader', /if \(Me\.Name !== cwhActorName\(\) && Me\.Name !== clanLeaderName\(\)\) return 'not the clan warehouse actor/.test(SRC));
  const WA = fs.readFileSync(path.join(ROOT, 'Dashboard', 'whauto_api.js'), 'utf8');
  t('CWHLOOK: the dashboard worker = bank > crafter (same as swarm.js cwhActorPick)', /return workerPick\(bk \|\| cr, c\.cwhWithdraw, cl\)/.test(WA)); }

// #10 MANORKEEP
{ const line = (name) => { const i = SRC.indexOf('const ' + name + ' = '); return SRC.slice(i, SRC.indexOf('\n', i)); };
  const crh = new Function(line('CRUN_KEEP_RE') + '\n' + line('CRUN_HAND_ALWAYS_RE') + '\n' + fn('crunHandRows') + '\nreturn crunHandRows;')();
  t('MANORKEEP: Harvester / seeds / crops never go to the runner / bank', crh([{ id: 5125, name: 'Harvester' }, { id: 5016, name: 'Seed: Dark Coda' }, { id: 5066, name: 'Red Coda' }, { id: 5095, name: 'Mature Cobol' }, { id: 1869, name: 'Iron Ore' }]).map(b => b.id).join() === '1869');
  t('MANORKEEP: also kept by the stash classifier, the leader unload and the academy unload', /manor item \(Harvester \/ seed \/ crop\) stays with me/.test(fn('stashClassify')) && /return 'manor item'/.test(fn('unloadKeepWhy')) && /MANORKEEP-2026-11-17/.test(fn('acadUnloadRows'))); }

// #12 FAREFUND + STOPALL
{ const fr = new Function(fn('fareRefused') + '; return fareRefused;')();
  t('FAREFUND: an adena refusal is recognised', fr("clicked 'Giran' at Clarissa but no teleport (REFUSED: not enough adena) — x") && !fr('REFUSED: lands next to level-80 monsters'));
  const gk = fn('gkTeleport');
  t('FAREFUND: the leader collects the fare once (not inside another team task) and tries again', /fareRefused\(gkFail\) && !wanted\._fareTry/.test(gk) && /await leadCollect\('teleport fare'\)/.test(gk) && /_fareTry: true/.test(gk));
  t('STOPALL: STOP_ALL.cmd / UNINSTALL.cmd + docs/plan/tools/uninstall.ps1 exist and are shipped', ['STOP_ALL.cmd', 'UNINSTALL.cmd', 'docs/plan/tools/uninstall.ps1'].every(f => fs.existsSync(path.join(ROOT, f))) && /\['STOP_ALL\.cmd', 'STOP_ALL\.cmd'\], \['UNINSTALL\.cmd', 'UNINSTALL\.cmd'\]/.test(fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'tools', 'release_build.js'), 'utf8')));
  const U = fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'tools', 'uninstall.ps1'), 'utf8');
  t('STOPALL: stop disables MemWatch + Dashboard keep-alives, uninstall deletes every "L2Swarm *" task, never a file', /'L2Swarm MemWatch', 'L2Swarm Dashboard'/.test(U) && /Unregister-ScheduledTask/.test(U) && !/Remove-Item/.test(U)); }

// #6 SPEEDHAVE
{ const sp = new Function(cnst('SCOUT_SPEED') + '\n' + fn('speedBuffUp') + '\nreturn { SCOUT_SPEED, speedBuffUp };')();
  t('SPEEDHAVE: Haste is no run-speed skill', !sp.SCOUT_SPEED.speedRe.test('Haste') && sp.SCOUT_SPEED.speedRe.test('Sprint'));
  t('SPEEDHAVE: Improved Movement / Wind Walk = already fast; an attack-speed buff is not', sp.speedBuffUp([{ name: 'Improved Movement', ab: 'IMPROVE_SPEED_AVOID_UP,1', left: 2000 }]) && sp.speedBuffUp([{ name: 'Wind Walk', ab: 'SPEED_UP,2', left: 900 }]) && !sp.speedBuffUp([{ name: 'Haste', ab: 'ATTACK_TIME_DOWN,2', left: 900 }]) && !sp.speedBuffUp([]));
  t('SPEEDHAVE: scoutSpeedTick casts no speed skill while one is up', /if \(scoutHasSpeed\(\)\) return;/.test(fn('scoutSpeedTick'))); }

// #3 ROUTEMOVE
{ const MTsrc = SRC.slice(SRC.indexOf('const MT = {'), SRC.indexOf('const MT_WORDS'));
  const st = new Function(MTsrc + '\n' + fn('mtStuckTick') + '\nreturn mtStuckTick;')();
  let r = st(null, { now: 0, idx: 3, d: 2000, pos: { x: 0, y: 0 } });
  for (let k = 1; k <= 12; k++) r = st(r.tr, { now: k * 1000, idx: 3, d: 2000, pos: { x: k * 150, y: 0 } });   // walking sideways around a wall: not closer, but moving
  t('ROUTEMOVE: a member that keeps moving (around a bend) is not flagged stuck', !r.stuck);
  let s = st(null, { now: 0, idx: 3, d: 2000, pos: { x: 0, y: 0 } });
  for (let k = 1; k <= 12; k++) s = st(s.tr, { now: k * 1000, idx: 3, d: 2000, pos: { x: 5, y: 5 } });
  t('ROUTEMOVE: standing still for 8 s is still stuck', s.stuck); }

// ---- round 2 (owner "fix everything" on docs/plan/SWARMHIVE_FIX_PLAN_2026-11-17.md) ----
{ const cn = fn('castNow');
  t('RAIDL2S: castNow lets the player\'s own L2Swarm list through with Hive skills off (opts.l2sProfile)', /const l2sP = !!\(opts && opts\.l2sProfile\);\s*\n\s*if \(!hiveSkillsOn\(\) && !l2sP\) return \{ started: false, off: true \};/.test(cn));
  t('RAIDL2S: the raid dealer casts l2sProfilePick for a Swarm-skills member and skips the Hive guide pass', /const ps = l2sProfilePick\(tgt\);[\s\S]{0,200}castNow\(ps, \{ l2sProfile: true \}\)/.test(SRC) && /if \(!hiveOwnCombat\(\)\) \{ const crOn = !!plan\.cr, worthT = raidWorthTarget\(/.test(SRC));
  t('TEAMMARK: a debuff row is told to the team and recorded by teammates', /App\.emit\('swarm\.crmark'/.test(fn('crNoteCast')) && /App\.on\('swarm\.crmark'/.test(SRC));
  t('LOWLV1: a level-1 attack row 20+ levels below me goes (never the last attack row)', /LOWLV1-2026-11-17/.test(fn('crApplyPlan')) && /if \(kept\.some\(isAtk\)\) rows = kept;/.test(fn('crApplyPlan')));
  const ac = new Function(fn('assistChoose') + '; return assistChoose;')();
  t('OWNPICK: the leader has a target -> no own side fight on a monster that fights nobody of us', ac({ assist: true, leader: { id: 7, alive: true, fighting: true, dist: 5000 }, cur: { id: 9, alive: true, mob: true, onUs: false }, chaseMax: 1600 }) === null && (ac({ assist: true, leader: { id: 7, alive: true, fighting: true, dist: 5000 }, cur: { id: 9, alive: true, mob: true, onUs: true }, chaseMax: 1600 }) || {}).id === 9 && (ac({ cur: { id: 9, alive: true, mob: true } }) || {}).id === 9); }
{ const wc = fn('waitCombatClear');
  t('TOWNFIGHT: before a town trip only a monster hitting me / targeting me within 600 is fought', /escAttackers\(\)\.filter\(x => x\.hitMe \|\| \(x\.targetsMe && num\(x\.dist\) < 600\)\)/.test(wc));
  t('RUNNERLVL: on a runner trip never a fight above my level + 5; stealth counts only with a real toggle', /num\(foe\.lvl\) > num\(Me\.Level\) \+ 5/.test(wc) && /crunMeetDecide\(danger, num\(Me\.Level\), S\.stealth !== false && runnerHasStealth\(\)\)/.test(SRC)); }
t('NPCTRIPHOLD: a member\'s NPC trip is an errand; the leader does not wait for a member on its errand', /errandStart\('npc', 20 \* 60000\)/.test(fn('goToNpc')) && /livePos\[m\.name\]\.er && now\(\)/.test(fn('teamToWaitFor')));
t('ROUTENEAR: same-floor path-finder way only close to the straight leg; ladder back before replan', /num\(r\.lengthUnits\) < dLeg \* 1\.35 \+ 400/.test(fn('routeHop')) && /ladder: \['sidestep', 'back', 'replan', 'around'\]/.test(SRC));
t('ROUTEPICK: auto pickup off while a member route walk runs, restored after (also after a script restart: Logs/routepick_<me>.txt)', /const ROUTEPICK = \{ saved: null, boot: false \};/.test(SRC) && /if \(memberRoute\.id\) \{ if \(Options\.PickUp\) \{ ROUTEPICK\.saved = true; Options\.PickUp = false; try \{ File\.WriteAllText\(routePickFile\(\), 'on'\)/.test(SRC) && /if \(File\.Exists\(routePickFile\(\)\)\) ROUTEPICK\.saved = true;/.test(SRC));
t('REVIEW RAIDREVIVE: only after a real death in the fight, never with the boss gone, never a new loot snapshot', /if \(Me\.IsDead\) RAIDFIGHT\.diedAt = now\(\);/.test(SRC) && /if \(RAIDFIGHT\.diedAt && raidReviveDecide\(/.test(SRC) && /if \(!data\.revive\) lootSnapshot\(b\.name\);/.test(SRC));
t('REVIEW RAIDL2S: a Swarm-skills caster with nothing in range still steps in (longest skill range)', /else l2sReach = l2sProfileReach\(\);/.test(SRC) && /function l2sProfileReach\(\)/.test(SRC));
t('REVIEW RUNNERTAB: the rotation interval is editable on the Runner tab', /data-rnprotmin/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'runnerpage.js'), 'utf8')));
t('TOWNNOLOCAL: never a local hunt inside a town', /if \(currentTownKey\(\)\) \{ const whyT = [\s\S]{0,200}autolevel: waiting in town/.test(SRC));
{ const dc = new Function(fn('supplyDue') + '\nvar SUPPLY_RULE = { minGapMs: 1800000 };\nfunction sNum(v) { const n = Number(v); return isFinite(n) ? n : 0; }\n' + fn('supplyDueMode') + '; return supplyDueMode;')();
  t('SUPPLYDAILY: daily = one automatic run per 24 h, low = the 30-min rule', dc('daily', 1000, 1000 + 3600000) === false && dc('daily', 1000, 1000 + 25 * 3600000) === true && dc('low', 1000, 1000 + 3600000) === true && dc('daily', 0, 5) === true);
  const PA = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partyauto_api.js'), 'utf8'), PS = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8');
  t('SUPPLYDAILY: the party settings page + API save supplyMode', /b\.supplyMode !== undefined/.test(PA) && /'supplies\.supplyMode'/.test(PS) && /body\.supplyMode = b\.supplyMode \|\| null/.test(PS)); }
t('TOWNROLE: crafter.json townRole = no automatic work, held for the party, crafts with the switch off', /townRole: \(Array\.isArray\(j\.townRole\)/.test(SRC) && /function townRoleOf\(n\)/.test(SRC) && /townRoleMe\(\) && !RUN_ALWAYS\.test/.test(fn('runAuto')) && /townRoleOf\(name\)\) return true;/.test(fn('runHeld')) && /townRoleMe\(\) && !handsOffMe\(\)/.test(SRC));
t('CWHJUNK: junk / marked-for-sale items are never stored in the clan warehouse', /if \(it\.sell\) return \{ act: 'sell', why: 'junk \/ marked for sale — never stored/.test(fn('stashClassify')) && /bank: junk kept out of the clan warehouse/.test(SRC));
t('ARROWS3: arrows never learned untradeable; an archer without an ammo need is logged', /ammoIdSet\(OWNTYPE\.ammo\)\.has\(num\(r\.id\)\)/.test(SRC) && /function supplyAmmoMissLog\(\)/.test(SRC));
t('SINGLECAP: at most 5 single trades per hand-over', /if \(hovSingleN >= 5\)/.test(fn('hovGive')));
{ const RA = fs.readFileSync(path.join(ROOT, 'Dashboard', 'runstate_api.js'), 'utf8'), RS = fs.readFileSync(path.join(ROOT, 'Dashboard', 'runswitch.js'), 'utf8');
  t('PARTYHOFF: { party, handsOff } sets every member; the party card has Hands off (party) / Hive back on', /b\.party != null && b\.handsOff !== undefined/.test(RA) && /data-runsw="partyhoff"/.test(RS) && /kind === 'partyhoff' \? \{ party: name, handsOff: !!on \}/.test(RS)); }
{ const AF = fs.readFileSync(path.join(ROOT, 'Dashboard', 'autofund.js'), 'utf8');
  t('DEPOSITLOG: a deposit order shows in Recent hand-outs (label key, never the collector\'s own name)', /L\[`\$\{d\.giver\} → \$\{col\} \(deposit\)`\] = Date\.now\(\)/.test(AF)); }

// E08 TOWNEXIT (Vykaax: "this group is stuck in town" - members stuck before point 1/11 for 27 min)
t('TOWNEXIT: a member in a town walks the street graph toward an outside waypoint first (once per waypoint)', /function mtTownExitPoint\(p\)/.test(SRC) && /m\.townExitKey !== `\$\{m\.id\}:\$\{next\}`/.test(SRC) && /rgWalk\(tx\.TD, tx\.pt, \{ team: false, label: 'town exit'/.test(SRC));
t('TOWNEXIT: every unstick step used for 5 min = teleport near the leader\'s waypoint (no endless retry)', /MT\.ownWayMs = 300000;/.test(SRC) && /if \(!lad\.ownWay && now\(\) - \(lad\.since \|\| now\(\)\) >= MT\.ownWayMs\) \{ lad\.ownWay = true; mtOwnWay\(m, next\); return; \}/.test(SRC) && /function mtOwnWay\(m, next\)/.test(SRC));
t('MONEYTEXT: the party settings say per-character targets win over the Top up amounts', /Per character target \(wins over the "Top up" amounts above/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8')));

// ---- full audit 2026-11-17 (12 slices + dashboard + Discord coverage, every finding verified by 2 skeptics) ----
t('AUDIT hands-off: archer shot watch + spacing, soul crystals, weapon watch, beetle step, protect / escort attacks, buff queue never act on a hands-off character',
  /SHOTW\.tid = 0; return; \}/.test(SRC) && (SRC.match(/typeof handsOffMe === 'function' && handsOffMe\(\)\) \|\| \(typeof hiveSkillsOn === 'function' && !hiveSkillsOn\(\)\)/g) || []).length >= 2 &&
  /SOUL\.on \|\| !state\.role \|\| Me\.IsDead \|\| !IsCharacterReady\(\) \|\| \(typeof handsOffMe === 'function' && handsOffMe\(\)\)\) return;/.test(SRC) &&
  /setInterval\(\(\) => \{ try \{ if \(handsOffMe\(\)\) return; \} catch \(e\) \{ \} weaponWatch\('weapon watch'\); \}, 10000\);/.test(SRC) &&
  /if \(handsOffMe\(\) \|\| \(typeof selfHandPlayed === 'function' && selfHandPlayed\(\)\)\) return;/.test(SRC) &&
  /if \(ho\) \{ state\.protect = null; return; \}/.test(SRC) && /if \(!hoA && escort\.active/.test(SRC));
t('AUDIT hands-off: idle loot-to-bank, runner tick, runner/bank sweep, crafter home tick skip a hands-off character',
  /if \(handsOffMe\(\)\) return;\s+\/\/ AUDIT-2026-11-17: a hands-off character never hands its loot away/.test(SRC) && /if \(handsOffMe\(\)\) \{ CRUNS\.state = 'hands off'; return; \}/.test(SRC) && /no runner \/ bank sweep on a hands-off character/.test(SRC) && /busy\(\) \|\| IsInCombat \|\| tradeState \|\| handsOffMe\(\)\) return;/.test(SRC));
t('AUDIT potions switch: boss-fight MP loop, healer brain, buffer upkeep respect hivePotionsOn', /if \(typeof hivePotionsOn === 'function' && !hivePotionsOn\(\)\) return;\s+\/\/ AUDIT-2026-11-17: Hive potions OFF/.test(SRC) && (SRC.match(/itemCount\(728\) > 0 && \(typeof hivePotionsOn !== 'function' \|\| hivePotionsOn\(\)\)\) \{ (BUFFUP\.lastPot|lastHealPot) = now\(\);/g) || []).length === 3);
t('AUDIT /unstuck retry runs with the gatekeeper lock free', /if \(freed\) \{ try \{ return await gkTeleportInner\(\{ \.\.\.wanted, noUnstuck: true \}, `\$\{why\} \(after \/unstuck\)`\); \} finally \{ state\.gkBusy = true; \} \}/.test(SRC));
t('AUDIT teleportNear survives "every town command bad" (no nearTarget)', /best && nearTarget && start !== nearTarget\.k/.test(SRC) && /if \(fp && cmdTowns\.length\)/.test(SRC));
t('AUDIT altGive always releases its control slot / away flag', /try \{ await altGiveRest\(target, me, F, put, trip\); \}\s*\n\s*finally \{ try \{ if \(trip && trip\.ctl\) orderRelease\('!altgive', seq\);/.test(SRC));
t('AUDIT starter gear default keep (never sell unasked)', /return STARTERGEAR\.modes\.includes\(m\) \? m : 'keep';/.test(SRC) && /gearPolicy\(\)\.starterGear \|\| 'keep'/.test(SRC) && /: 'keep';\s*$/m.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'gearauto_api.js'), 'utf8')));
// (the stash keeps ENCHSTORE: the owner's own "store all" mode puts his plused pieces into his own warehouse - agreed 2026-10-25, test_stash)
t('AUDIT PLUSLOCK: the loot unload never hands a plused piece to a teammate', /if \(en >= 1\) return; \}\s+\/\/ AUDIT-2026-11-17 PLUSLOCK/.test(SRC));
t('AUDIT event payloads: swarm.rc.tobank + its done answer read e.data', /const d = \(e && e\.data\) \|\| \{\}; if \(!d\.leader \|\| d\.leader !== CONFIG\.leader/.test(SRC) && /const onDone = \(e\) => \{ const d = \(e && e\.data\) \|\| \{\}; if \(d\.leader === Me\.Name && d\.name\)/.test(SRC));
t('AUDIT regexes / swallowed code: \\s in the gatekeeper text, the order retry passes fatal + dead, dialog stats else-branch, dawnLog click line, SHOTWATCH #id prefix',
  /\.replace\(\/\\s\+\/g, ' '\)\.trim\(\)\.slice\(0, 220\);/.test(SRC) && /superseded: orderReplaced\(seq\) \|\| !!\(o\.abort && o\.abort\(\)\), fatal: orderFatalWhy\(lastWhy\), dead: !!Me\.IsDead,\s*\n/.test(SRC) &&
  /\} else if \(r\.sys\) E\.stats\.refused\+\+; else E\.stats\.fail\+\+;\s*$/m.test(SRC) && /^\s*dawnLog\(`page \$\{i\}: click "\$\{link\.text\}"`\);/m.test(SRC) && /\.replace\(\/\^#\?\\d\+\\s\*\/, ''\)/.test(SRC));
t('AUDIT quest circuit waits for the reload resume (60 s)', /if \(Date\.now\(\) - scriptStartAt < 60000\) return;/.test(SRC));
t('AUDIT !sell: the leader\'s own sale after the trip is not dropped as a duplicate', /oq\.running = true; handleSay\(Me\.Name, '!sell'\);/.test(SRC));
t('AUDIT M13: an adena-only deposit is not blocked by the supply run', /if \(!busy && !adenaOnly && supplyHoldsTeam\(\)\)/.test(SRC));
{ const CA = fs.readFileSync(path.join(ROOT, 'Dashboard', 'crafterpage_api.js'), 'utf8'), CP = fs.readFileSync(path.join(ROOT, 'Dashboard', 'crafterpage.js'), 'utf8'), RP = fs.readFileSync(path.join(ROOT, 'Dashboard', 'runnerpage.js'), 'utf8');
  t('AUDIT TOWNROLE-UI: the Crafter page + API save crafter.json townRole (names checked, never the runner)', /if \(b\.townRole !== undefined\)/.test(CA) && /is the runner \(the runner travels\)/.test(CA) && /data-cftownrole/.test(CP) && /townRole: S\.townRole/.test(CA));
  t('AUDIT Runner tab keeps a typed rotation value across the 10 s refresh', /ae\.id === 'rnpRotMin'/.test(RP) && /S\.rotDraft != null/.test(RP)); }
// ---- verification round 2 (5 reviewers + skeptics) ----
t('AUDIT2 raid revive never re-engages a hands-off character', /if \(Me\.IsDead\) RAIDFIGHT\.diedAt = now\(\);\s*\n\s*if \(RAIDFIGHT\.diedAt && typeof handsOffMe === 'function' && handsOffMe\(\)\) RAIDFIGHT\.diedAt = 0;/.test(SRC));
t('AUDIT2 the automatic soul-hunt refresh keeps the owner\'s park (no "!" = no order)', /leadLevel\(arg === 'auto' \? 'soul hunt \(auto\)' : '!soul hunt'\)/.test(SRC) && (() => { const lb = eval('(' + fn('levelByUser').replace(/^function levelByUser/, 'function') + ')'); return lb('!soul hunt') === true && lb('soul hunt (auto)') === false; })());
// NOTESQUOTE: release notes with double quotes reach make_release intact (in-process, named parameters - no child 'powershell -File')
{ const PUB = fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'tools', 'publish.ps1'), 'utf8'), W = fs.readFileSync(path.join(ROOT, 'release', 'publish_v1.14.6.ps1'), 'utf8');
  t('NOTESQUOTE: publish.ps1 calls make_release in-process with named parameters', /& \(Join-Path \$PSScriptRoot 'make_release\.ps1'\) @mkp/.test(PUB) && !/& powershell @mk\b/.test(PUB) && /\$mkp\.Notes = \$Notes/.test(PUB));
  t('NOTESQUOTE: git commit + tag get the notes through a message file (-F), never -m', /& git commit -q -F \$mf/.test(PUB) && /& git tag -a \$tag -F \$tf/.test(PUB) && !/git commit -q -m/.test(PUB) && !/git tag -a \$tag -m/.test(PUB));
  t('NOTESQUOTE: the v1.14.6 wrapper calls publish.ps1 in-process', /& \(Join-Path \$root 'docs\\plan\\tools\\publish\.ps1'\) @p/.test(W) && !/& powershell @a/.test(W)); }
// no // comment may swallow code on a line (the bug class found 4 times today)
{ const bad = []; SRC.split(/\r?\n/).forEach((l, i) => { const k = l.indexOf('   // '); if (k > 5) { const c = l.slice(k); if (/(\+\+;|\} else |; \}|\belse if \(|\w\(.*\);\s*\}?\s*$)/.test(c) && !/\b(was|e\.g\.|old|example)\b/.test(c.slice(0, 40))) bad.push(i + 1); } });
  t('no trailing // comment swallows code (lines: ' + bad.slice(0, 8).join(',') + ')', bad.length === 0); }

console.log(fails ? `tester 2026-11-17: ${pass} passed, ${fails} failed` : `tester 2026-11-17: ${pass} passed, 0 failed`);
process.exit(fails ? 1 : 0);
