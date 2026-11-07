// ACADGROUP-2026-11-02 (owner: "four parties of five people, five nukers hitting the same target, then should never ever die" -> "Yes do 4 groups"):
// fixed academy groups of 5, one group plan per leader, personal academy steps for every member, group bag unload, the next character joins.
// Pure + source checks only (sandbox): node docs/plan/tools/test_academy_groups.js
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(R, 'Scripts_dev', 'swarm.js'), 'utf8');
const API_SRC = fs.readFileSync(path.join(R, 'Dashboard', 'academy_api.js'), 'utf8');
const AL = require(path.join(R, 'Dashboard', 'academy_logic.js'));
let ok = 0, bad = 0; const check = (c, m, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };

// 1) the groups: by login number, 5 each, the lowest login leads
const accs = []; for (let i = 20; i >= 1; i--) accs.push({ login: 'igs' + i, character: 'C' + i, party: 'C' + i, academyMage: true });
accs.push({ login: 'mylogin1', character: 'Tank1', party: 'Tank1' });
const G = AL.academyGroups(accs, 5);
check(G.length === 4 && G[0].leader === 'C1' && G[0].members.join(',') === 'C1,C2,C3,C4,C5' && G[3].leader === 'C16' && G[3].members.length === 5, 'groups: mylogin82-5 / 6-10 / 11-15 / 16-20, the lowest login leads', G.map(g => g.members.join(',')));
check(!G.some(g => g.members.includes('Tank1')), 'groups: only academy mages');
check(AL.academyGroupOf(accs, 'mylogin93', 5).leader === 'C11', 'groupOf: mylogin93 -> group 3 led by mylogin92');
const mv = AL.academyGroupMoves(accs, 5);
check(mv.length === 16 && mv.every(m => m.to && ['C1', 'C6', 'C11', 'C16'].includes(m.to)) && mv.find(m => m.name === 'C2').to === 'C1', 'moves: the 16 members join their leader (4 leaders stay)', mv.slice(0, 3));
const moved = accs.map(a => { const m = mv.find(x => x.name === a.character); return m ? Object.assign({}, a, { party: m.to }) : a; });
check(AL.academyGroupMoves(moved, 5).length === 0, 'moves: nothing left to move once the groups are real');

// 2) the group plan: the same route, the 35-40 room = the group's own room
const C = { spots: { to40: { mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: 'cruma-1-right-c', roomIds: ['cruma-1-right-c', 'cruma-1-left-c'], order: 'nearest', override: true, stay: true }, to40Rooms: ['cruma-1-right-c', 'cruma-1-left-c', 'cruma-1-right-h', 'cruma-1-right-a'] } };
const p0 = AL.academyPlan(C, 'C1', 0), p3 = AL.academyPlan(C, 'C16', 3), solo = AL.academyPlan(C, 'X');
const r40 = (p) => p.steps.find(s => s.id === 'aclv40').spot;
check(r40(p0).roomId === 'cruma-1-right-c' && r40(p3).roomId === 'cruma-1-right-a' && r40(p3).roomIds.length === 1, 'group plan: each group its own Cruma floor-1 room', [r40(p0).roomId, r40(p3).roomId]);
check(p0.steps.map(s => s.id).join(' ') === solo.steps.map(s => s.id).join(' ') && p0.template === 'academy', 'group plan: same step ids as the solo route (progress kept)');
check(AL.academyCfg({}).groups.on === true && AL.academyCfg({}).groups.size === 5, 'config: groups on, size 5 by default');

// 3) setup of a new character: a member gets no own plan / run switch; a leader gets its group plan
const AP = require(path.join(R, 'Dashboard', 'academy_api.js'));
const CF = AL.academyCfg({});
check(AP.acadSetupRole({ login: 'mylogin83', character: 'N2', party: 'C1' }, accs, CF).member === true, 'setup: a member of C1\'s group = member (no own plan)');
check(AP.acadSetupRole({ login: 'mylogin87', character: 'C6', party: 'C6' }, accs, CF).index === 1, 'setup: the mylogin87 leader gets group 2\'s plan');
check(/if \(!grp\.member\) try \{   \/\/ 2\) the party plan/.test(API_SRC) && /if \(!grp\.member\) try \{   \/\/ 4\) run switch ON/.test(API_SRC) && /if \(!grp\.member\) try \{   \/\/ 5\) ACADSTORE/.test(API_SRC), 'setup: plan, run switch and party switches only for leaders');
check(/x !== a && String\(x\.party \|\| ''\) === String\(oldName\)\) x\.party = newName/.test(API_SRC), 'rename: a group leader\'s next character keeps the group (members follow the new name)');

// 4) swarm.js: team steps, member runner, bag unload gate
const i = SRC.indexOf('// ACADGROUP-PURE-BEGIN'), e = SRC.indexOf('// ACADGROUP-PURE-END');
const P = new Function(SRC.slice(i, e) + '\nreturn { acadTeamWait, acadWorstFull, acadGroupUnloadGate, ACADTEAM_MS };')();
const t0 = Date.parse('2026-11-02T17:00:00Z');
const w = P.acadTeamWait(['A', 'B', 'C'], { A: { id: 'acbuy2', at: '2026-11-02T17:00:05Z', end: true, ok: true }, B: { id: 'acbuy2', at: '2026-11-02T17:00:05Z', end: false }, C: { id: 'acbuy1', at: '2026-11-02T17:00:05Z', end: true } }, 'acbuy2', t0);
check(w.done.join() === 'A' && w.wait.join() === 'B,C', 'team wait: only finished answers to THIS step count', w);
check(P.acadTeamWait(['A'], { A: { id: 'acbuy2', at: '2026-11-02T16:00:00Z', end: true } }, 'acbuy2', t0).wait.length === 1, 'team wait: an old answer of the same step does not count');
check(P.acadGroupUnloadGate({ leader: true, myLvl: '', mateLvls: ['', 'near'] }).go && P.acadGroupUnloadGate({ leader: true, myLvl: '', mateLvls: ['', 'near'] }).team, 'unload: the leader takes the group to Giran for a mate\'s bag');
check(!P.acadGroupUnloadGate({ member: true, myLvl: 'full', inGiran: false }).go && P.acadGroupUnloadGate({ member: true, myLvl: 'near', inGiran: true }).go, 'unload: a member never makes its own trip - only in Giran');
// ACADREPEAT-2026-11-03: the join step also waits for the roster mates (the new generation joins minutes apart) and re-sends every 60 s
check(/async function planStepAcademy\(step\) \{[\s\S]{0,200}const mates = isLeader\(\) \? \[\.\.\.new Set\(acadTeamMates\(\)\.concat\(roster\)\)\] : \[\];[\s\S]{0,300}planSend\(`!acadstep \$\{step\.id\}`\)/.test(SRC), 'planStepAcademy: a group leader sends the step to every member (the online ones + at the join step its roster mates)');
check(/if \(cmd === '!acadstep'\) \{[^\n]*acadStepMember\(/.test(SRC) && /async function acadStepMember\(id\)[\s\S]{0,1600}planStepAcademyOne\(step\)/.test(SRC), 'members run their leader\'s academy step themselves (!acadstep)');
check(/const gate = acadGroupUnloadGate\(\{ leader: isLeader\(\)/.test(SRC) && /await groupWait\(\);/.test(SRC), 'unload watch: group gate + the leader waits for its mates in Giran');
console.log(`academy groups: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
