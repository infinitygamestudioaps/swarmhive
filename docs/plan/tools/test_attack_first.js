// ATTACKFIRST-2026-10-23 (owner: "characters getting stuck and dying because they try to kill something while another monster is hitting them").
// Offline: the pure decision (ATTACKFIRST-PURE of Scripts_dev/swarm.js) + the hunting-loop wiring.
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..', '..');
const SW = fs.readFileSync(path.join(R, fs.existsSync(path.join(R, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev/swarm.js' : 'Scripts/swarm.js'), 'utf8');
let ok = 0, bad = 0;
const t = (name, c) => { if (c) ok++; else { bad++; console.log('FAIL', name); } };
const i = SW.indexOf('// ATTACKFIRST-PURE-BEGIN'), j = SW.indexOf('// ATTACKFIRST-PURE-END');
if (i < 0 || j < 0) { console.log('FAIL ATTACKFIRST-PURE block missing'); process.exit(1); }
const P = new Function(SW.slice(i, j) + '\nreturn { attackFirstPick, ATTACKFIRST };')();
const N = 100000, base = { me: 'Spoiler7', team: ['Healer7'], healers: ['Healer7'], now: N };
t('nobody is hit: keep the target', P.attackFirstPick({ ...base, cur: 5, hits: [] }) === null);
t('my target is hitting me: finish it', P.attackFirstPick({ ...base, cur: 5, hits: [{ id: 5, on: 'Spoiler7', at: N - 1000, d: 80 }, { id: 6, on: 'Spoiler7', at: N - 500, d: 90 }] }) === null);
const a = P.attackFirstPick({ ...base, cur: 5, hits: [{ id: 6, on: 'Spoiler7', at: N - 500, d: 90 }] });
t('another monster hits me, my target hits nobody: switch to it', a && a.id === 6 && /hitting me/.test(a.why));
const b = P.attackFirstPick({ ...base, cur: 5, hits: [{ id: 6, on: 'Spoiler7', at: N - 500, d: 90 }, { id: 7, on: 'Healer7', at: N - 800, d: 700 }] });
t('the healer is hit: its attacker first (even when farther away)', b && b.id === 7 && /healer Healer7/.test(b.why));
t('no target at all: take the attacker', (P.attackFirstPick({ ...base, cur: 0, hits: [{ id: 8, on: 'Healer7', at: N - 100, d: 300 }] }) || {}).id === 8);
t('an old hit (> 5 s) is ignored', P.attackFirstPick({ ...base, cur: 5, hits: [{ id: 6, on: 'Spoiler7', at: N - 9000, d: 90 }] }) === null);
t('a monster beyond 1500 is left alone', P.attackFirstPick({ ...base, cur: 5, hits: [{ id: 6, on: 'Healer7', at: N - 100, d: 2600 }] }) === null);
t('a hit on a player outside the party is ignored', P.attackFirstPick({ ...base, cur: 5, hits: [{ id: 6, on: 'Stranger', at: N - 100, d: 100 }] }) === null);
const c = P.attackFirstPick({ ...base, team: ['Healer7', 'Bob'], cur: 0, hits: [{ id: 9, on: 'Bob', at: N - 100, d: 900 }, { id: 10, on: 'Bob', at: N - 100, d: 200 }] });
t('two monsters on a dealer: the nearest', c && c.id === 10);
t('wired into the hunting loop before the current-target check', /const af = attackFirstNow\(lastTarget\); if \(af && num\(af\.objId\) !== num\(lastTarget\)\) \{ lastTarget = af\.objId;[^\n]*await engage\(af\); await sleep\(200\); continue; \}[^\n]*\n\s*const cur = !sfMode && lastTarget && mobById\(lastTarget\);/.test(SW));
t('a healer never switches to attacking', /function attackFirstNow\(curId\) \{\n  try \{\n    if \(isHealerRole\(\)\) return null;/.test(SW));
t('a given-up (unreachable) monster stays skipped', /ignoredMob\(m\) \|\| huntBlacklisted\(m\.objId\)\) return;/.test(SW));
t('DEFENDSTILL: the "back to the team first" skip only while I really move (standing still 3 s = self-defence)', /MT\.regroupR && num\(Me\.HpPercent\) >= MT\.critHp && now\(\) - \(MTRUN\.at \|\| 0\) < 3000\) return; \}/.test(SW));
t('FOLLOWSWING: no hallway route walk while the leader fights within 1500 (assist range)', /if \(dd <= 1500 && lp && now\(\) - lp\.at < 6000 && \(lp\.fight \|\| lp\.hit\)\) \{ if \(rgFollow\.pts\.length\) rgFollow\.pts = \[\]; return false; \}/.test(SW));
t('FOLLOWSWING: a graph detour (> 3x the straight line to a leader < 2500 away) is not walked', /if \(dd < 2500 && len > Math\.max\(3 \* dd, dd \+ 1500\)\) \{ rgFollow\.pts = \[\]; return false; \}/.test(SW));
t('FOLLOWSWING: a follow route nobody drives is cleared from the card (ISO time parsed)', /const drove = rgFollowTick\(\); if \(!drove && state\.route && state\.route\.kind === 'follow' && !\(Date\.now\(\) - \(Date\.parse\(state\.route\.at\) \|\| 0\) < 3000\)\) state\.route = null;/.test(SW));
t('ROUTESTALE: 2 min without a word from the leader (idle walk) = the member route walk ends', /setInterval\(\(\) => \{ try \{ if \(!isLeader\(\) && memberRoute\.id && !memberRoute\.busy && now\(\) > \(memberRoute\.until \|\| 0\)\) routeStaleEnd\(/.test(SW));
t('ROUTESTALE: the leader hunting at its spot (Fight with L2Swarm signal) ends a stale member walk', /SF\.until = d\.on \? now\(\) \+ 12000 : 0; if \(d\.on\) routeStaleEnd\('the leader hunts at the spot'\);/.test(SW));
t('ROUTESTALE: only a RUNNING walk takes a member back from Fight with L2Swarm', /memberRoute\.id && memberRoute\.busy\)\) return false; \} catch \(e\) \{ \}   \/\/ ROUTESTALE/.test(SW));
t('ROUTESTALE: a running walk is never ended', /function routeStaleEnd\(why\) \{ try \{ if \(!memberRoute\.id \|\| memberRoute\.busy\) return false;/.test(SW));
t('ORDERFLOOD: attack first pauses after engage (no tight loop)', SW.includes('await engage(af); await sleep(200); continue;'));
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
