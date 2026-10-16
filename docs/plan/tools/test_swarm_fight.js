// OFFLINE TEST of the party switch "Fight with L2Swarm (Hive only travels)" (SWARMFIGHT-2026-10-16, player Vykaax, owner: "Yes build the switch").
// Never touches the game, MCP or live data.   node docs/plan/tools/test_swarm_fight.js   (SWARM_JS=<file> tests another copy)
// 1) PARTYAUTO-PURE: swarmFight is a party switch, default OFF, a character entry cannot switch it; swarm.js = Dashboard/partyauto_api.js.
// 2) the switch block with stubs: swarmFightOn reads party_auto (2 s cache, said once), the fight phase (leader: his hunting step; member: the
//    leader's swarm.sf < 12 s, not during a route / teleport / escape), never in raids / instances / Kamaloka / missions / raid clears,
//    sfLeaderTick keeps L2Swarm combat on, counts a kill when L2Swarm's target dies, tells the members every 4 s.
// 3) source: Hive skills OFF while the switch is on (outside raids ...), pairs OFF, the leader's hunting step skips Hive targets / focus /
//    pulls / walks, members: no help-a-teammate, no self-defence, no back-to-the-middle walk, no alone escape, no room follow in the phase;
//    the member loop switches L2Swarm Follow (+ Follow Attack once, never healers / no-melee) on.
// 4) dashboard: API kind (group combat, default OFF, party only), the Settings popup, the automation overview.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0, n = 0;
const check = (ok, what, info) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info ? ' — ' + info : '')); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const fnBody = (head) => { const i = src.indexOf(head); if (i < 0) return ''; return src.slice(i, src.indexOf('\n}\n', i) + 3); };

// ---- 1) pure
const PURE = blk('// PARTYAUTO-PURE-BEGIN', '// PARTYAUTO-PURE-END');
const P = new Function(PURE + '\nreturn { PAUTO_KINDS, pautoEffective };')();
const API = require(path.join(ROOT, 'Dashboard', 'partyauto_api.js'));
const E = P.pautoEffective;
check(P.PAUTO_KINDS.swarmFight && P.PAUTO_KINDS.swarmFight.char === false && !P.PAUTO_KINDS.swarmFight.def, 'swarm.js: swarmFight is a party switch, default OFF');
check(E({}, 'swarmFight', 'Bishop1', 'Tank1').on === false && E(null, 'swarmFight', 'X', 'X').on === false, 'nothing set / no file = OFF (nobody changes without asking)');
check(E({ parties: { Tank1: { swarmFight: true } } }, 'swarmFight', 'Bishop1', 'Tank1').on === true, 'party ON = every member of that party');
check(E({ parties: { Tank1: { swarmFight: true } } }, 'swarmFight', 'Destroyer3', 'Destroyer3').on === false, 'another party is not touched');
check(E({ parties: { Tank1: { swarmFight: true } }, chars: { Bishop1: { swarmFight: false } } }, 'swarmFight', 'Bishop1', 'Tank1').on === true, 'a character entry cannot split the party (party switch only)');
check(Object.keys(P.PAUTO_KINDS).join() === API.KEYS.join(), 'swarm.js and the dashboard API know the same switches');

// ---- 2) the switch block with stubs
const BLOCK = blk('// SWARMFIGHT-2026-10-16 (player Vykaax', '/** SUPPLYAMT');
const H = { t: 1e6, file: {}, notes: [], emits: [], leader: false, raid: false, inst: false, kama: false, enabled: true, combat: false, starts: 0, target: 0, mobs: {}, state: { mode: 'autolevel' }, route: { id: null } };
const mk = new Function('H', `
  const now = () => H.t, note = (m) => H.notes.push(m), num = Number;
  const pautoData = () => H.file;
  ${PURE}
  const Me = { Name: 'Bishop1' }, CONFIG = { leader: 'Tank1' };
  const isLeader = () => H.leader, inRaid = () => H.raid, inKamaInstance = () => H.kama;
  const inst = { get on() { return H.inst; } }, state = H.state, memberRoute = H.route;
  const App = { emit: (n, d) => H.emits.push([n, d]), on: () => { } };
  const EnableBot = () => { H.enabled = true; }, startCombatG = () => { H.combat = true; H.starts++; };
  const mobById = (id) => H.mobs[id] || null;
  Object.defineProperty(globalThis, 'IsEnabled', { get: () => H.enabled, configurable: true });
  Object.defineProperty(globalThis, 'IsInCombat', { get: () => H.combat, configurable: true });
  Object.defineProperty(globalThis, 'Target', { get: () => H.target ? { objId: H.target } : null, configurable: true });
  ${BLOCK}
  return { swarmFightOn, swarmFightNow, sfLeaderTick, sfExcluded, SF };`);
const S = mk(H);
check(S.swarmFightOn() === false && H.notes.length === 0, 'OFF: nothing said');
H.file = { parties: { Tank1: { swarmFight: true } } }; H.t += 2500;
check(S.swarmFightOn() === true && H.notes.some(m => /Fight with L2Swarm ON/.test(m)), 'ON: read live (2 s cache) and said once');
H.t += 500; H.file = {}; check(S.swarmFightOn() === true, '... cached for 2 s');
H.file = { parties: { Tank1: { swarmFight: true } } }; H.t += 2500; S.swarmFightOn(); check(H.notes.filter(m => /Fight with L2Swarm ON/.test(m)).length === 1, '... said only once while it stays ON');
// member phase
check(S.swarmFightNow() === false, 'member: no fight phase before the leader hunts (travel / town = Hive)');
S.SF.leader = 'Tank1'; S.SF.until = H.t + 12000;
check(S.swarmFightNow() === true, 'member: the leader hunts at the spot (signal < 12 s) = hands off');
H.route.id = 'r1'; check(S.swarmFightNow() === false, 'member: walking a team route = Hive'); H.route.id = null;
H.state.gkBusy = true; check(S.swarmFightNow() === false, 'member: at a gatekeeper = Hive'); H.state.gkBusy = false;
H.raid = true; check(S.swarmFightNow() === false && S.sfExcluded() === true, 'raid = Hive (raid rules)'); H.raid = false;
H.inst = true; check(S.swarmFightNow() === false, 'instance = Hive'); H.inst = false;
H.kama = true; check(S.swarmFightNow() === false, 'Kamaloka = Hive'); H.kama = false;
H.state.mode = 'mission'; check(S.swarmFightNow() === false, 'mission = Hive'); H.state.mode = 'raidclear'; check(S.swarmFightNow() === false, 'raid clear = Hive'); H.state.mode = 'autolevel';
S.SF.leader = 'Destroyer3'; check(S.swarmFightNow() === false, "another leader's signal does not count"); S.SF.leader = 'Tank1';
H.t += 13000; check(S.swarmFightNow() === false, 'member: the signal is older than 12 s (the leader left the spot) = Hive again');
// leader
H.leader = true; S.SF.until = 0; H.t += 2500; S.swarmFightOn();
check(S.swarmFightNow() === false, 'leader: not in the phase before his hunting step');
H.enabled = false; H.combat = false; H.emits = [];
let k = S.sfLeaderTick();
check(S.swarmFightNow() === true && H.enabled && H.combat && k === 0, 'leader hunting step: bot on, L2Swarm combat on, phase on');
check(H.emits.length === 1 && H.emits[0][0] === 'swarm.sf' && H.emits[0][1].on === true && H.emits[0][1].leader === 'Bishop1', '... and tells the members (swarm.sf)');
H.t += 1500; S.sfLeaderTick(); check(H.emits.length === 1, '... not more often than every 4 s');
H.t += 3000; S.sfLeaderTick(); check(H.emits.length === 2, '... again after 4 s');
H.mobs = { 11: { IsDead: false } }; H.target = 11; k = S.sfLeaderTick(); check(k === 0, 'L2Swarm picked a monster: no kill yet');
H.mobs[11].IsDead = true; H.target = 12; H.mobs[12] = { IsDead: false }; k = S.sfLeaderTick(); check(k === 1, 'its monster died and it took the next: one kill');
H.target = 0; delete H.mobs[12]; k = S.sfLeaderTick(); check(k === 1, 'the target vanished (dead, despawned): one kill');
k = S.sfLeaderTick(); check(k === 0, '... counted once');
H.combat = false; S.sfLeaderTick(); check(H.combat === true, 'combat stopped by something else: switched on again in the next step');
H.file = {}; H.t += 2500; check(S.swarmFightNow() === false && H.notes.some(m => /Fight with L2Swarm OFF/.test(m)), 'switch OFF: Hive runs the fights again at once, said once');

// ---- 3) source wiring
check(/function hiveSkillsOn\(\) \{ return hiveSw\(\)\.skills !== false && !\(swarmFightOn\(\) && !sfExcluded\(\)\); \}/.test(src), 'Hive skills OFF while the switch is on (raids / instances keep Hive skills)');
check(/c\.mode = \/\^\(auto\|on\)\$\/[^\n]+\n  try \{ if \(\(!leader \|\| leader === CONFIG\.leader\) && swarmFightOn\(\)\) c\.mode = 'off'; \}/.test(src), 'hunting pairs OFF with the switch on');
const loop = fnBody('async function autoLevelLoop(solo)');
check(/const sfMode = [^\n]+swarmFightOn\(\) && !sfExcluded\(\) && !solo/.test(loop) && /if \(sfMode\) \{ const sk = sfLeaderTick\(\);/.test(loop), 'leader: the hunting step runs sfLeaderTick with the switch on');
check(/if \(!sfMode && \(!cur \|\| cur\.IsDead \|\| !lastTarget \|\| killed\)\) \{/.test(loop), 'leader: no Hive target pick / engage / pull route / walk back / wander with the switch on');
check(/const cur = !sfMode && lastTarget && mobById\(lastTarget\);/.test(loop), 'leader: no Hive reach checks / unstick on a Hive target');
const i0 = loop.indexOf('if (sfMode) { const sk'), i1 = loop.indexOf('moveOnWhy(', i0), i2 = loop.indexOf('multiTick(autoLvl.spot', i0), i3 = loop.indexOf('occupiedCheck(', i0);
check(i0 > 0 && i1 > i0 && i2 > i0 && i3 > i0, 'leader: the spot checks stay (move on, occupied, room rotation)');
const attAt = src.indexOf("App.on('swarm.attacked', (event) => {\n  const d = event.data;"), att = src.slice(attAt, attAt + 600);   // the HIVE MIND help handler (4 handlers listen to swarm.attacked)
check(/if \(swarmFightNow\(\)\) return;/.test(att), 'member: no Hive help-a-teammate attack in the phase');
check(/  if \(swarmFightNow\(\)\) return;\s+\/\/ SWARMFIGHT: the L2Swarm profile fights, never a Hive self-defence fight on the side\n  if \(isHealerRole\(\) \|\| noMelee\(\)\) return;/.test(src), 'member: no Hive self-defence fight in the phase');
check(/isLeader\(\) \|\| stuckFollow\.busy \|\| benched\(\) \|\| swarmFightNow\(\)\) return;/.test(src), 'member: no back-to-the-middle walk in the phase');
check(/now\(\) < \(state\.fleeUntil \|\| 0\) \|\| swarmFightNow\(\)\) \{ aloneFight\.since = 0; return; \}/.test(src), 'nobody: no Hive alone-in-a-fight escape in the phase');
check(/function rgFollowTick\(\) \{[\s\S]{0,600}try \{ if \(swarmFightNow\(\)\) return false; \}/.test(src), 'member: no Hive room follow in the phase (L2Swarm Follow)');
const mem = src.slice(src.indexOf("App.on('swarm.sf'"), src.indexOf("App.on('swarm.sf'") + 1600);
check(/SF\.until = d\.on \? now\(\) \+ 12000 : 0/.test(mem) && /d\.leader !== CONFIG\.leader/.test(mem), 'member: hears only its own leader');
check(/if \(!swarmFightNow\(\)\) \{ SF\.atkSet = false; return; \}/.test(mem) && /Options\.ActiveFollow = true/.test(mem) && /Options\.FollowName = CONFIG\.leader/.test(mem), 'member: L2Swarm Follow on the leader in the phase');
check(/if \(state\.followHoldUntil > now\(\)\) return;/.test(mem), "member: never over a task's follow hold (trade, teleport, route)");
check(/if \(!SF\.atkSet\) \{ SF\.atkSet = true; if \(!isHealerRole\(\) && !noMelee\(\) && !Options\.FollowAtk\) Options\.FollowAtk = true;/.test(mem), 'member: Follow Attack switched on ONCE per phase, never for healers / no-melee roles (the player may switch it off)');
check(mem.includes("setInterval(() => {\n  try {\n    if (isLeader() || !IsCharacterReady() || Me.IsDead) return;\n    if (!swarmFightNow())"), 'the host part only reads SF inside callbacks (after the whole script loaded)');
check(/function swarmFightOn\(\) \{\n  if \(!SF\) return false;/.test(src), 'swarmFightOn is safe before the top level created SF');

// ---- 4) dashboard
const K = API.KINDS.find(x => x.key === 'swarmFight');
check(K && K.group === 'combat' && K.char === false && !K.def, 'API: Combat section, party switch, default OFF');
const ps = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8');
check(/key: 'swarmFight', char: false, group: 'combat', label: 'Fight with L2Swarm \(Hive only travels\)'/.test(ps) && /swarmFight: 'L2Swarm fights'/.test(ps), 'party Settings popup: the switch in the Combat section');
const ac = fs.readFileSync(path.join(ROOT, 'Dashboard', 'autocatalog.js'), 'utf8');
check(/key: 'swarmFight', group: 'fight', title: 'Fight with L2Swarm', gate: 'switch', def: 'off', eval: 'pauto', pauto: \['swarmFight'\]/.test(ac), 'automation overview: listed (fight group, default off)');

console.log(`swarm fight: ${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
