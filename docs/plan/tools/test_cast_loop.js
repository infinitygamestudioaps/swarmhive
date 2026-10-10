// OFFLINE TEST of the CAST LOOP (2026-10-09, user 11:20: "spam-cast Twister as soon as it is ready; on a cooldown cast another spell").
// Runs the CASTLOOP block of Scripts_dev/swarm.js in node (no host objects):
//   node docs/plan/tools/test_cast_loop.js          (exit code 1 when a check fails; SWARM_SRC=<file> tests another copy)
// Covers: the pick (primary ready -> primary; on cooldown -> best READY fallback; almost ready -> wait; drains / bursts / AoE / range / MP /
// refused), the cast time estimate, never idle while something is ready, the L2Swarm combat-skill conflict (which entries go off / back on),
// who the script owns (healers / buffers / leaders / fighters never), the assist target, the stats line, and a timeline simulation of the
// old loop vs the new one (expected casts per minute for Nuker7's numbers).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const a = src.indexOf('// CASTLOOP-BEGIN'), b = src.indexOf('// CASTLOOP-END');
if (a < 0 || b < a) { console.error('CASTLOOP block not found'); process.exit(1); }
const M = new Function(src.slice(a, b) + '\nreturn { CASTLOOP, castEstMs, castValue, castPick, castOwnDecide, l2sGuardPlan, assistChoose, castStatsLine, castIsAoe };')();
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

// Nuker7 (Dark Elven Wizard 32, live 2026-10-09: Casting Spd 710; power from the skill texts; Twister reuse 530 ms after Quick Recycle)
const SPD = 710;
const sk = (o) => Object.assign({ scope: 'SINGLE', ready: true, reuseLeftMs: 0, mp: 20, range: 600, cpRole: 'fallback', cpKind: 'nuke', magic: true }, o,
  { castMs: M.castEstMs(o.hit || 4000, SPD, 0) });
const TW = () => sk({ id: 1178, name: 'Twister', power: 38, mp: 27, range: 750, cpRole: 'primary' });
const WS = () => sk({ id: 1177, name: 'Wind Strike', power: 21, mp: 15, range: 600, cpRole: 'primary' });
const SS = () => sk({ id: 1266, name: 'Shadow Spark', power: 47, mp: 33, range: 750 });
const VT = () => sk({ id: 1147, name: 'Vampiric Touch', power: 32, mp: 40, range: 600, cpKind: 'drain' });
const AB = () => sk({ id: 1172, name: 'Aura Burn', power: 30, mp: 27, range: 150, hit: 1500 });
const FS = () => sk({ id: 1181, name: 'Flame Strike', power: 14, mp: 40, range: 500, scope: 'RANGE', cpRole: 'aoe', cpKind: 'aoe' });
const order = (...xs) => xs;     // already in castOrder order: Twister > Wind Strike > Shadow Spark > Aura Burn > Vampiric Touch > Flame Strike
const ctx = (o) => Object.assign({ mp: 500, hpPct: 100, dist: 500, mobs: 1, aoeMinMobs: 3, worth: false, blocked: {}, now: 1000 }, o);
const pick = (list, o) => M.castPick(list, ctx(o));

// ---- 1) cast time estimate -------------------------------------------------------------------------------------------------------
check(M.castEstMs(4000, 710, 0) === 1876, `Twister raw 4000 ms at Casting Spd 710 -> ${M.castEstMs(4000, 710, 0)} ms (L2J x 333 / speed)`);
check(M.castEstMs(4000, 710, 1310) === 1310, 'a measured cast time wins over the estimate');
check(M.castEstMs(0, 710, 0) === 500, 'no HitTime from the client -> 500 ms');
check(M.castEstMs(4000, 0, 0) === 4000, 'no speed -> the raw HitTime');
check(M.castEstMs(200, 2000, 0) === M.CASTLOOP.minCastMs, 'never below minCastMs');

// ---- 2) the pick -----------------------------------------------------------------------------------------------------------------
let r = pick(order(TW(), WS(), SS(), AB(), VT(), FS()));
check(r.skill && r.skill.name === 'Twister' && r.why === 'primary', `Twister ready -> Twister (${r.skill && r.skill.name}, ${r.why})`);
r = pick(order(Object.assign(TW(), { ready: false, reuseLeftMs: 1000 }), WS(), SS(), AB(), VT(), FS()));
check(r.skill && r.skill.name === 'Shadow Spark' && /fallback \(Twister on cooldown\)/.test(r.why), `Twister on cooldown (1 s) -> best READY fallback by damage/cast s: ${r.skill && r.skill.name} (${r.why})`);
r = pick(order(Object.assign(TW(), { ready: false, reuseLeftMs: 1000 }), WS(), Object.assign(SS(), { ready: false, reuseLeftMs: 3000 }), AB(), VT(), FS()), { dist: 500 });
check(r.skill && r.skill.name === 'Vampiric Touch', `Twister + Shadow Spark on cooldown, Aura Burn out of range (150) -> ${r.skill && r.skill.name} (32 power > Wind Strike 21)`);
r = pick(order(Object.assign(TW(), { ready: false, reuseLeftMs: 1000 }), WS(), Object.assign(SS(), { ready: false, reuseLeftMs: 3000 }), AB(), VT(), FS()), { dist: 100 });
check(r.skill && r.skill.name === 'Aura Burn', `... standing next to it (100): Aura Burn (30 power, 1.5 s raw cast = most damage per second) -> ${r.skill && r.skill.name}`);
r = pick(order(Object.assign(TW(), { ready: false, reuseLeftMs: 180 }), WS(), SS(), AB(), VT(), FS()));
check(!r.skill && r.wait === 180, `Twister ready in 180 ms -> wait for it, no fallback that would delay it a whole cast (${r.why})`);
r = pick(order(TW(), WS(), SS()), { mp: 20 });
check(r.skill && r.skill.name === 'Wind Strike', `MP 20: Twister (27) not affordable -> Wind Strike (15) instead of idle (${r.why})`);
r = pick(order(TW(), WS(), SS()), { blocked: { 1178: 2000 } });
check(r.skill && r.skill.name === 'Shadow Spark' && /refused/.test(r.why), `Twister just refused by the server -> the next best ready skill (${r.why})`);
r = pick(order(TW(), WS(), SS(), FS()), { mobs: 4, dist: 400 });
check(r.skill && r.skill.name === 'Flame Strike' && /aoe/.test(r.why), `4 monsters at the target: Flame Strike 14 x 4 > Twister 38 -> ${r.skill && r.skill.name}`);
r = pick(order(TW(), WS(), SS(), FS()), { mobs: 2, dist: 400 });
check(r.skill && r.skill.name === 'Twister', '2 monsters: no AoE (needs 3) -> Twister');
r = pick(order(TW(), WS(), SS(), FS()), { mobs: 3, dist: 400 });
check(r.skill && r.skill.name === 'Flame Strike', '3 monsters: Flame Strike 14 x 3 = 42 > Twister 38 at the same cast time -> ' + (r.skill && r.skill.name));
r = pick(order(TW(), WS(), SS(), Object.assign(FS(), { power: 12 })), { mobs: 3, dist: 400 });
check(r.skill && r.skill.name === 'Twister', '3 monsters, a weaker AoE (12 x 3 = 36 < 38): the primary -> ' + (r.skill && r.skill.name));
r = pick(order(TW(), WS(), SS(), VT()), { hpPct: 40 });
check(r.skill && r.skill.name === 'Vampiric Touch' && /drain/.test(r.why), 'HP 40 %: the drain first');
const BURST = () => sk({ id: 1263, name: 'Demon Wind', power: 120, mp: 80, range: 750, cpKind: 'burst' });
r = pick(order(BURST(), TW(), WS()), { worth: false });
check(r.skill && r.skill.name === 'Twister', 'a 5-min burst nuke never on trash');
r = pick(order(BURST(), TW(), WS()), { worth: true });
check(r.skill && r.skill.name === 'Demon Wind', 'a burst nuke first on a worth target (raid boss / long fight)');
r = pick(order(TW(), WS(), SS()), { dist: 900, chase: true });
check(!r.skill && r.approach, `900 away (Twister reaches 750): step in (${r.why})`);
r = pick(order(TW(), WS(), SS()), { dist: 900, chase: false });
check(!r.skill && !r.approach && r.wait > 0, `900 away, no chase (raid / instance own the movement): nothing, wait (${r.why})`);
r = pick(order(TW(), WS(), SS()), { dist: 700 });
check(r.skill && r.skill.name === 'Twister', '700 away: Twister (750) reaches, Wind Strike (600) does not');
r = pick(order(Object.assign(TW(), { ready: false, reuseLeftMs: 900 }), WS(), SS()), { dist: 700 });
check(r.skill && r.skill.name === 'Shadow Spark', '700 away, Twister on cooldown: Shadow Spark (750), not Wind Strike (600, out of range)');
r = pick(order(TW(), WS(), SS()), { primaryId: 1266 });
check(r.skill && r.skill.name === 'Shadow Spark', 'raid template (weak element first): its first single skill is the primary');
r = pick(order(TW(), WS(), SS()), { dpsFirst: true });
check(r.skill && r.skill.name === 'Shadow Spark', 'dpsFirst option: the ready skill with the most damage per cast second (Shadow Spark 47 > Twister 38)');
r = pick(order(Object.assign(TW(), { ready: false, reuseLeftMs: 1000 }), Object.assign(WS(), { ready: false, reuseLeftMs: 400 }), Object.assign(SS(), { ready: false, reuseLeftMs: 3000 })));
check(!r.skill && r.wait === 400, `everything on cooldown -> wait for the first one ready (${r.wait} ms), not a fixed tick`);
r = pick([], {});
check(!r.skill && r.why === 'no attack skills', 'no attack skills -> nothing');
// never idle while a usable damage skill is ready: random states
let idleBug = 0;
for (let i = 0; i < 3000; i++) {
  const rnd = (p) => Math.random() < p;
  const list = [TW(), WS(), SS(), AB(), VT(), FS()].map(s => Object.assign(s, { ready: rnd(0.5), reuseLeftMs: Math.floor(Math.random() * 3000) }));
  const c = { mp: Math.floor(Math.random() * 60), dist: Math.floor(Math.random() * 1000), mobs: 1 + Math.floor(Math.random() * 5), hpPct: 20 + Math.random() * 80 };
  const out = pick(list, c);
  const anyUsable = list.some(s => s.ready && c.mp >= s.mp && c.dist <= s.range + 60 && (!M.castIsAoe(s) || c.mobs >= 3));
  const waitsForPrimary = !out.skill && out.wait > 0 && /ready in/.test(out.why || '');
  if (anyUsable && !out.skill && !waitsForPrimary) idleBug++;
  if (out.skill && !(out.skill.ready && c.mp >= out.skill.mp && c.dist <= out.skill.range + 60)) idleBug++;
}
check(idleBug === 0, `3000 random states: a usable damage skill is always cast (or the primary is <= 250 ms away), never an unusable one (${idleBug} bad)`);

// ---- 3) who the script owns + the L2Swarm combat-skill conflict -------------------------------------------------------------------
const own = (o) => M.castOwnDecide(Object.assign({ role: 'nuker', leader: false, healer: false, buffer: false, classType: 'MAGE', magicAttacks: true, enabled: true }, o));
check(own({}) === true, 'Dark Wizard member (MAGE, nuker): the script owns its attack skills');
check(own({ role: 'necromancer' }) === true, 'Necromancer member: owned');
check(own({ leader: true }) === false, 'a caster LEADER keeps L2Swarm combat (it picks his hunting targets)');
check(own({ healer: true, classType: 'SUPPORT', role: 'bishop' }) === false, 'healers never (they only heal)');
check(own({ buffer: true, classType: 'SUPPORT', role: 'doomcryer' }) === false, 'buffers (doomcryer) never');
check(own({ classType: 'FIGHTER', role: 'inspector' }) === false, 'Kamael soul hybrid (FIGHTER): keeps L2Swarm melee + its combat skills');
check(own({ classType: 'TANK', role: 'sk' }) === false, 'tank never');
check(own({ classType: '', role: 'nuker' }) === true && own({ classType: '', role: 'destroyer' }) === false, 'class type unreadable: by role');
check(own({ enabled: false }) === false, 'autoSkills off / script stopping: L2Swarm gets its skills back');
check(own({ magicAttacks: false }) === false, 'no magic attack in the plan yet: not owned');
let g = M.l2sGuardPlan([{ id: 1177, enabled: true }, { id: 1069, enabled: true }], { own: true, attackIds: [1178, 1177, 1266], off: {} });
check(g.disable.join() === '1177' && !g.restore.length, 'owned: Wind Strike (an attack) switched off, Sleep (not an attack) left alone');
g = M.l2sGuardPlan([{ id: 1177, enabled: false }], { own: false, attackIds: [], off: { 1177: true } });
check(g.restore.join() === '1177', 'no longer owned (class change to healer / leader / script stop): Wind Strike back on');
g = M.l2sGuardPlan([{ id: 1177, enabled: false }], { own: false, attackIds: [], off: {} });
check(!g.restore.length, 'a skill the USER disabled is never switched on');
g = M.l2sGuardPlan([{ id: 1177, enabled: false }], { own: true, attackIds: [1177], off: { 1177: true } });
check(!g.disable.length && !g.restore.length, 'already off: nothing to do (no switching every 5 s)');

// ---- 4) the assist target ----------------------------------------------------------------------------------------------------------
const L = (o) => Object.assign({ id: 77, alive: true, fighting: true, hpPct: 100, targetsUs: false, dist: 600, dz: 0 }, o);
let t = M.assistChoose({ assist: true, leader: L({}), cur: null });
check(t && t.id === 77 && t.why === 'assist', "the leader fights it -> assist (L2Swarm's FollowAtk did this)");
t = M.assistChoose({ assist: true, leader: L({ fighting: false }), cur: null });
check(t === null, 'the leader only SELECTED a monster (not fighting, full HP, not on us): wait for the tank');
t = M.assistChoose({ assist: true, leader: L({ fighting: false, hpPct: 80 }), cur: null });
check(t && t.id === 77, 'the monster is already hurt -> assist');
t = M.assistChoose({ assist: true, leader: L({ dist: 2500 }), cur: null });
check(t === null, 'too far (2500 > 1600) -> no assist');
t = M.assistChoose({ assist: true, leader: L({ dz: 900 }), cur: null });
check(t === null, 'another floor -> no assist');
t = M.assistChoose({ assist: true, leader: L({}), attacker: { id: 55, alive: true }, cur: null });
check(t && t.id === 55 && t.why === 'hitting me', 'a monster hitting me first');
t = M.assistChoose({ assist: false, leader: L({}), cur: { id: 9, alive: true, mob: true } });
check(t && t.id === 9 && t.why === 'current', 'FollowAtk off: keep the current monster (no switch)');

// ---- 5) stats line ---------------------------------------------------------------------------------------------------------------
const line = M.castStatsLine({ counts: { Twister: 18, 'Wind Strike': 4 }, other: { 'Wind Strike': 2 }, fightMs: 52000, castMs: 46000, refused: 1, pots: 2, why: {} });
check(line === 'casts: Twister 18, Wind Strike 4 | L2Swarm/other: Wind Strike 2 | idle 6 s of 52 s fighting | refused 1 | MP potions 2', 'stats line: ' + line);
check(M.castStatsLine({ counts: {}, other: {}, fightMs: 0, castMs: 0 }) === null, 'nothing fought / cast: no line');

// ---- 6) timeline simulation: old loop vs cast loop (Nuker7's numbers, one target, 60 s, 80 ms request latency) ---------------------
function simulate(kind, castMsReal, reuse, minutes) {
  const end = minutes * 60000, lat = 80; let t = 0, n = {}, busyUntil = 0; const readyAt = { 1178: 0, 1177: 0, 1266: 0 };
  const list = () => [TW(), WS(), SS()].map(s => Object.assign(s, { castMs: castMsReal, ready: t >= readyAt[s.id], reuseLeftMs: Math.max(0, readyAt[s.id] - t) }));
  const cast = (s) => { const start = Math.max(t + lat, busyUntil); busyUntil = start + castMsReal; readyAt[s.id] = start + reuse[s.id]; n[s.name] = (n[s.name] || 0) + 1; return start; };
  while (t < end) {
    if (kind === 'old') {             // 400 ms tick, first ready skill in order, then sleep raw HitTime 4000 + 250
      const s = list().find(x => x.ready); if (s) { cast(s); t += 4250; } t = Math.ceil(t / 400) * 400 + 400;
    } else {                          // cast loop: pick, wait for the real cast end (+ 40 ms poll), go
      const p = M.castPick(list(), ctx({ now: t }));
      if (p.skill) { const st = cast(p.skill); t = st + castMsReal + 20; } else t += Math.max(20, p.wait || 300);
    }
  }
  return n;
}
const sOld = simulate('old', 1876, { 1178: 530, 1177: 530, 1266: 3536 }, 1), sNew = simulate('new', 1876, { 1178: 530, 1177: 530, 1266: 3536 }, 1);
console.log('     sim old loop  (1 min):', JSON.stringify(sOld));
console.log('     sim cast loop (1 min):', JSON.stringify(sNew));
check((sNew.Twister || 0) >= 28 && (sOld.Twister || 0) <= 15, `Twister per minute: old ${sOld.Twister} -> new ${sNew.Twister} (cast 1876 ms, reuse 530 ms: Twister every cast)`);
const sLong = simulate('new', 1876, { 1178: 4000, 1177: 530, 1266: 3536 }, 1);
console.log('     sim cast loop, Twister reuse 4 s:', JSON.stringify(sLong));
check((sLong['Shadow Spark'] || 0) > 0 && Object.values(sLong).reduce((x, y) => x + y, 0) >= 28, 'a primary with a LONG cooldown: the gaps are filled with the best ready fallbacks, still a cast every ~1.9 s');

// =====================================================================================================================================
// CAST REACH (2026-10-09 16:10, Logs/caster_stats.log 13:59Z: casters idle most of each fight because the target was out of range and
// they did not close in; Necro1 'refused 13' without a reason): step into range, the in-range alternative, refusal classes + filters
// =====================================================================================================================================
const R = new Function(src.slice(a, b) + '\nreturn { CASTREACH, reachDecide, reachAlt, reachPick, reachCandidates, reachState, castRefuseClass, crSegInPoly, crNearPoly, castPick, castStatsLine, assistChoose };')();
const RC = R.CASTREACH;
const rctx = (o) => Object.assign({ now: 10000, me: { x: 0, y: 0 }, tgt: { id: 5, x: 1500, y: 0 }, dist: 1500, range: 750, leader: { x: 1400, y: 0 }, leash: RC.leash,
  dangers: [], poly: null, alt: false, runSpeed: 150 }, o);

// ---- 7) stepping into range ---------------------------------------------------------------------------------------------------------
let st = R.reachState();
let d = R.reachDecide(rctx({ st }));
check(d.act === 'step' && Math.abs(Math.hypot(d.point.x - 1500, d.point.y) - 750 * RC.frac) < 2 && d.point.x < 1500 && d.send === true,
  `target 1500 away, Twister 750, no alternative -> step to ${RC.frac * 100} % of the range on the line target -> me (${JSON.stringify(d.point)}, ${d.why})`);
check(d.wait <= RC.recheckMs, `re-check within ${RC.recheckMs} ms (${d.wait})`);
d = R.reachDecide(rctx({ st, now: 10500, me: { x: 75, y: 0 }, dist: 1425 }));
check(d.act === 'step' && d.send === false, 'next re-check, same step point: no new move packet (send false)');
d = R.reachDecide(rctx({ st, now: 12000, me: { x: 300, y: 0 }, dist: 1200 }));
check(d.act === 'step' && d.send === true, 'after resendMs: the move is sent again (L2Swarm follow / the server may have dropped it)');
d = R.reachDecide(rctx({ st, now: 15000, me: { x: 760, y: 0 }, dist: 740 }));
check(d.act === 'in' && d.stepped === true, "in range (740 <= 750 + 60): 'in', stepped = true (counted as 'stepped into range')");
d = R.reachDecide(rctx({ st, now: 15100, me: { x: 760, y: 0 }, dist: 740 }));
check(d.act === 'in' && d.stepped === false, 'still in range: no second count');

// ---- 8) the target cannot be reached in ~3 s: the in-range alternative -------------------------------------------------------------
st = R.reachState();
d = R.reachDecide(rctx({ st, alt: true }));
check(d.act === 'switch' && /walk/.test(d.why), `1500 away = ~5.8 s walk at 150 with an in-range fight monster -> switch at once (${d.why})`);
d = R.reachDecide(rctx({ st, alt: true, now: 10300 }));
check(d.act === 'switch', 'that target stays given up (altHoldMs) while the alternative exists');
st = R.reachState();
d = R.reachDecide(rctx({ st, alt: true, dist: 900, tgt: { id: 6, x: 900, y: 0 } }));
check(d.act === 'step', `900 away (~1.7 s walk) -> step in even with an alternative (${d.why})`);
let mx = 0;
for (let k = 1; k <= 8; k++) { mx = k * 40; d = R.reachDecide(rctx({ st, alt: true, now: 10000 + k * 500, me: { x: mx, y: 0 }, dist: 900 - k * 5, tgt: { id: 6, x: 900 + mx - k * 5, y: 0 } })); if (d.act !== 'step') break; }
check(d.act === 'switch' && /not in range after/.test(d.why), `slow progress (40 per 0.5 s, the target keeps away): after ~3 s -> the alternative (${d.why})`);
// no alternative: keep stepping (up to maxMs), then wait + decide again
st = R.reachState();
let acts = [];
for (let k = 0; k <= 20; k++) { d = R.reachDecide(rctx({ st, now: 10000 + k * 500, me: { x: k * 60, y: 0 }, dist: 1500 - k * 60 + 900, tgt: { id: 7, x: 2400, y: 0 } })); acts.push(d.act); }
check(acts.slice(0, 17).every(x => x === 'step') && acts.includes('wait'), `no alternative: steps for ${RC.maxMs / 1000} s, then waits (${acts.join(',')})`);
// stuck against a wall: no progress -> the spot is avoided, after stuckMax: give up
st = R.reachState();
const stuckActs = [];
for (let k = 0; k <= 12; k++) { d = R.reachDecide(rctx({ st, now: 10000 + k * 500, me: { x: 0, y: 0 } })); stuckActs.push(d.act + (d.point ? `@${d.point.x},${d.point.y}` : '')); if (d.act !== 'step') break; }
check(st.bad.length >= 1 && /^wait|^switch/.test(stuckActs[stuckActs.length - 1]) && new Set(stuckActs.filter(x => x.startsWith('step')).map(x => x.split('@')[1])).size >= 2,
  `stuck (no progress for ${RC.stuckMs} ms): that spot is avoided (another angle next), after ${RC.stuckMax} -> give up (${stuckActs.join(' ')})`);

// ---- 9) never into another monster's aggro, never past the leash, never out of the hunting area ------------------------------------
st = R.reachState();
const lineSpot = { x: 1500 - 750 * RC.frac, y: 0 };
d = R.reachDecide(rctx({ st, dangers: [{ x: lineSpot.x, y: 0, r: 300 }] }));
check(d.act === 'step' && Math.hypot(d.point.x - lineSpot.x, d.point.y) > 300 + RC.dangerPad - 1, `an aggressive monster at the straight-line spot -> a point round the target outside its aggro (${JSON.stringify(d.point)})`);
st = R.reachState();
d = R.reachDecide(rctx({ st, me: { x: 0, y: 0 }, dangers: [{ x: 0, y: 0, r: 2500 }] }));
check(d.act === 'step', 'an aggro circle I am ALREADY inside is no new danger (stepping does not change it)');
st = R.reachState();
d = R.reachDecide(rctx({ st, dangers: [{ x: 1500, y: 0, r: 900 }].map(x => ({ x: 1500, y: 0, r: 900 })), tgt: { id: 8, x: 1500, y: 0 } }));
check(d.act === 'wait' && /aggro/.test(d.why), `every point round the target inside another aggressive monster's circle -> no step (${d.why})`);
st = R.reachState();
d = R.reachDecide(rctx({ st, leader: { x: -1000, y: 0 }, leash: 1300 }));
check(d.act === 'wait' && /leash/.test(d.why), `the leader stands 1000 behind me: every spot near the target is > 1300 from him -> no step (${d.why})`);
st = R.reachState();
d = R.reachDecide(rctx({ st, leader: { x: 300, y: 600 }, leash: 1300 }));
check(d.act === 'step' && Math.hypot(d.point.x - 300, d.point.y - 600) <= 1300, `leash: the chosen point stays within 1300 of the leader (${JSON.stringify(d.point)})`);
const room = [{ x: -200, y: -300 }, { x: 1000, y: -300 }, { x: 1000, y: 300 }, { x: -200, y: 300 }];
st = R.reachState();
d = R.reachDecide(rctx({ st, poly: room, polyMargin: 60 }));
check(d.act === 'step' && R.crNearPoly(d.point.x, d.point.y, room, 60), `a hunting room: the point stays inside it (+60) (${JSON.stringify(d.point)})`);
check(R.crSegInPoly({ x: 0, y: 0 }, { x: 900, y: 0 }, room, 0) === true && R.crSegInPoly({ x: 0, y: 0 }, { x: 0, y: 800 }, room, 0) === false, 'segment check: inside the room / through its wall');

// ---- 10) line of sight ('Cannot see target'): closer, sideways first ---------------------------------------------------------------
st = R.reachState();
d = R.reachDecide(rctx({ st, dist: 700, me: { x: 800, y: 0 }, los: true }));
check(d.act === 'step' && /line of sight/.test(d.why) && Math.hypot(d.point.x - 1500, d.point.y) < 700 * RC.losFrac + 1 && Math.abs(d.point.y) > 50,
  `'Cannot see target' at 700 (in range): step closer (< ${Math.round(700 * RC.losFrac)}) and sideways (arc ${RC.losArcs[0]} deg first) (${JSON.stringify(d.point)}, ${d.why})`);
d = R.reachDecide(rctx({ st, now: 11500, dist: 380, me: { x: 1150, y: 200 } }));
check(d.act === 'in', 'closer than the LOS need: cast again');

// ---- 11) the in-range alternative (reachAlt) --------------------------------------------------------------------------------------
const mob = (o) => Object.assign({ id: 1, x: 300, y: 0, z: 0, dead: false, ignored: false, hp: 100, onUs: false, inArea: true }, o);
const ao = { me: { x: 0, y: 0, z: 0 }, reach: 750, leader: { x: 1400, y: 0 }, leaderTgt: { x: 1500, y: 0 }, near: 900, zLimit: 500 };
let al = R.reachAlt([mob({ id: 1, x: 500, onUs: true }), mob({ id: 2, x: 300, hp: 60 })], ao);
check(al && al.id === 2, 'the NEAREST in-range monster of our fight (hurt) is the alternative');
al = R.reachAlt([mob({ id: 3, x: 300, y: 300 })], ao);
check(al === null, 'an untouched passive monster far from the leader and his target is NOT pulled (no new fights)');
al = R.reachAlt([mob({ id: 4, x: 700, y: 0 })], ao);
check(al && al.id === 4, 'a monster within 900 of the leader / his target counts as the fight');
al = R.reachAlt([mob({ id: 5, x: 900, onUs: true }), mob({ id: 6, x: 200, dead: true, onUs: true }), mob({ id: 7, x: 200, onUs: true, ignored: true }),
  mob({ id: 8, x: 200, onUs: true, z: 900 }), mob({ id: 9, x: 200, onUs: true, inArea: false })], ao);
check(al === null, 'out of reach / dead / ignored (chest, foreign-tagged, invalid target) / another floor / outside the hunting room: never');

// ---- 12) castPick: step in also while the primary is on cooldown; the approach range ----------------------------------------------
r = R.castPick([Object.assign(TW(), { ready: false, reuseLeftMs: 400 }), WS(), SS()].map(x => Object.assign(x, x.name === 'Shadow Spark' ? { ready: false, reuseLeftMs: 3000 } : {})), ctx({ dist: 1200, chase: true }));
check(!r.skill && r.approach && r.approachRange === 750, `1200 away, Twister on cooldown: walk now (approachRange ${r.approachRange}) instead of 'nothing ready'`);
r = R.castPick([TW(), WS(), SS()], ctx({ dist: 1200, chase: true, mp: 20 }));
check(!r.skill && r.approach && r.approachRange === 600 && r.approachFor === 'Wind Strike', `no MP for Twister (27), Wind Strike (15) affordable: step in for Wind Strike (${r.why})`);
r = R.castPick([TW(), WS(), SS()], ctx({ dist: 1200, chase: true, blocked: { 1178: 99999 } }));
check(!r.skill && r.approach && r.approachFor === 'Shadow Spark', 'Twister refused/blocked: step in for the next skill (Shadow Spark 750)');
r = R.castPick([TW(), WS(), SS()], ctx({ dist: 1200, chase: false }));
check(!r.skill && !r.approach, 'chase off (raid / instance / pair / not script-owned): no stepping');

// ---- 13) refusals: classes + what the cast loop does -------------------------------------------------------------------------------
const rc = (id, same) => R.castRefuseClass({ msgId: id, sameJustEnded: !!same });
check(rc(181).act === 'step' && rc(181).key === 'los', "#181 'Cannot see target' -> step closer / sideways (no 1.2 s block)");
check(rc(22).key === 'range' && rc(22).blockMs === 0, "#22 'Your target is out of range' -> range cut + step");
check(rc(24).act === 'mp', "#24 'Not enough MP' -> learn the real MP need of that skill");
check(rc(109).act === 'switch' && rc(144).act === 'switch', '#109 / #144 invalid target -> another target');
check(rc(113).blockMs >= 30000 && rc(2066).blockMs >= 30000, '#113 unsuitable terms / #2066 weapon cannot attack -> that skill out for 30 s');
check(rc(48).blockMs > 0 && rc(48).blockMs < 1200, '#48 still on reuse -> a short block only');
check(rc(0, true).act === 'retry' && rc(0, true).blockMs === 0, 'no message, the SAME skill ended < 900 ms ago -> L2J same-skill-while-casting: retry after a short gap');
check(rc(0, false).act === 'block' && rc(0, false).blockMs === 1200, 'no message otherwise -> the old 1.2 s block');

// ---- 14) assist: the alternative is kept while the leader's target is out of reach -------------------------------------------------
t = R.assistChoose({ assist: true, leader: L({}), keep: { id: 42, alive: true }, cur: null });
check(t && t.id === 42 && /in range/.test(t.why), 'keep: the in-range alternative wins over the far leader target (held 6 s)');
t = R.assistChoose({ assist: true, leader: L({}), keep: { id: 42, alive: true }, attacker: { id: 55, alive: true } });
check(t && t.id === 55, 'a monster hitting me still comes first');

// ---- 15) stats line: walking into range / melee are not idle; steps, switches, refusal reasons, grouped waits -----------------------
const line2 = R.castStatsLine({ counts: { 'Aqua Swirl': 12 }, other: {}, fightMs: 30000, castMs: 20000, moveMs: 5000, meleeMs: 0, steps: 6, switches: 2, refused: 3,
  refusedWhy: { 'cannot see target': 2, 'still casting (same skill)': 1 }, pots: 0, why: { 'out of range (1004 > 750)': 3, 'out of range (1100 > 750)': 2 } });
check(line2 === 'casts: Aqua Swirl 12 | idle 5 s of 30 s fighting (walking into range 5 s) | stepped into range 6 | switched target 2 | refused 3 (cannot see target 2, still casting (same skill) 1) | waits: out of range 5',
  'stats line: ' + line2);

// ---- 16) castNow against a mock server: same-skill guard, refusal reasons, MP learning ---------------------------------------------
const ha = src.indexOf('// CASTLOOP host side'), hb = src.indexOf('/** Mana Potion while a caster fights');
check(ha > 0 && hb > ha, 'host slice found (castEvt ... castNow)');
function mockHost(server) {
  const T0 = Date.now();
  const env = {
    now: () => Date.now(), sleep: (ms) => new Promise(res => setTimeout(res, Math.max(1, ms))), num: (v) => Number(v) || 0,
    Me: { get IsCasting() { return server.casting && Date.now() < server.castUntil; }, get MP() { return server.mp; }, MAtkSpd: 333, PAtkSpd: 333 },
    SkillsList: { GetItemByID: (id) => ({ Id: id }) }, skillPlan: { attacks: [{ id: 1178, name: 'Twister' }, { id: 1266, name: 'Shadow Spark' }] },
    Send: { RequestMagicSkillUse: (id) => server.request(id) },
    File: {}, Options: {}, state: {}, log() { }, note() { }, logError() { }, appendShared() { },
  };
  return env;
}
function makeServer(o) {
  const sv = Object.assign({ casting: false, castUntil: 0, curId: 0, castMs: 300, clientEarlyMs: 0, mp: 500, los: false, refusedSame: 0, started: 0, sys: [] }, o);
  sv.request = (id) => {
    setTimeout(() => {
      const t = Date.now();
      const serverCasting = sv.curId && t < sv.serverUntil;
      if (serverCasting && sv.curId === id) { sv.refusedSame++; return; }                  // L2J: same skill while casting -> ActionFailed, no message
      if (sv.los) { sv.hooks.sys(181); return; }
      if (sv.mp < 30) { sv.hooks.sys(24); return; }
      const start = serverCasting ? sv.serverUntil : t;                                   // a different skill queues behind the running one
      setTimeout(() => {
        sv.curId = id; sv.serverUntil = Date.now() + sv.castMs; sv.casting = true; sv.castUntil = sv.serverUntil - sv.clientEarlyMs;   // client: IsCasting ends clientEarlyMs early (MagicSkillLaunched)
        sv.started++; sv.hooks.started(id);
      }, Math.max(0, start - t));
    }, 20);                                                                                 // 20 ms latency
  };
  return sv;
}
async function hostRun(serverOpts, fn) {
  const sv = makeServer(serverOpts);
  const env = mockHost(sv);
  const names = Object.keys(env);
  const H = new Function(...names, src.slice(a, b) + '\n' + src.slice(ha, hb) + '\nreturn { castNow, castLoopOnMine, castSysPush, castStats, castEnd, castBlocked, castMpNeed, castCands, castRangeCut };')(...names.map(k => env[k]));
  sv.hooks = { sys: (id) => H.castSysPush(id), started: (id) => H.castLoopOnMine(id, 99) };
  return fn(H, sv);
}
(async () => {
  // a) Twister spam where the client's IsCasting ends 250 ms before the server's cast (L2J MagicSkillLaunched): the loop retries a
  //    'still casting (same skill)' refusal after the learned gap; after <= 2 such refusals the gap is learned and they stop
  await hostRun({ castMs: 400, clientEarlyMs: 250 }, async (H, sv) => {
    const info = { id: 1178, name: 'Twister', hit: 400, magic: true };
    let ok = 0, tries = 0; const late = [];
    for (let i = 0; i < 10; i++) {
      for (let k = 0; k < 4; k++) { tries++; const r = await H.castNow(info); if (r.started) { ok++; break; } if (i >= 5) late.push(r.refuse && r.refuse.key); await new Promise(res => setTimeout(res, Math.max(30, H.castEnd.gap))); }
    }
    check(ok === 10 && sv.refusedSame <= 2 && !late.length && H.castStats.refusedWhy['still casting (same skill)'] === sv.refusedSame,
      `10 Twister in a row, client cast end 250 ms early: ${ok}/10 started in ${tries} requests, ${sv.refusedSame} same-skill refusals (all early, labelled 'still casting'), learned gap ${H.castEnd.gap} ms`);
  });
  // b) 'Cannot see target' -> refuse class los, no 1.2 s block, reason in the stats
  await hostRun({ los: true }, async (H, sv) => {
    const r = await H.castNow({ id: 1178, name: 'Twister', hit: 300, magic: true });
    check(!r.started && r.refuse && r.refuse.key === 'los' && !(H.castBlocked[1178] > Date.now()) && H.castStats.refusedWhy['cannot see target'] === 1,
      `server #181: refused with reason 'cannot see target', not blocked (the loop steps instead) (${JSON.stringify(r.refuse)})`);
  });
  // c) 'Not enough MP' -> the skill's MP need is learned, castCands filters it until MP is there
  await hostRun({ mp: 20 }, async (H, sv) => {
    const r = await H.castNow({ id: 1178, name: 'Twister', hit: 300, magic: true });
    const cand = H.castCands([{ id: 1178, name: 'Twister', mp: 15, range: 750, hit: 300 }])[0];
    check(!r.started && r.refuse.key === 'mp' && H.castMpNeed[1178] && cand.mp === 21, `server #24 at MP 20: Twister needs > 20 now (castCands mp ${cand && cand.mp}), castPick skips it until then`);
  });
  // d) a different skill queued behind a running cast still starts (not 'refused')
  await hostRun({ castMs: 500 }, async (H, sv) => {
    const p1 = H.castNow({ id: 1178, name: 'Twister', hit: 500, magic: true });
    await p1;
    sv.casting = true; sv.castUntil = Date.now() + 400; sv.curId = 1178; sv.serverUntil = Date.now() + 400;   // another engine's Twister still running
    const r = await H.castNow({ id: 1266, name: 'Shadow Spark', hit: 300, magic: true });
    check(r.started, 'a different skill during a running cast queues on the server and starts (no false refusal)');
  });

  // ---- 17) timeline: a caster whose targets come at 800..1550 (Nuker2 13:59Z), fight 12 s per monster, run speed 150 -------------
  // old: approach only when Twister was ready, a straight step to range - 120 every 600 ms that L2Swarm's follow undid half of (measured:
  // ~31 'out of range' waits / 26 s); new: reachDecide every 0.5 s, follow held, the in-range alternative after the ~3 s rule.
  function simFight(kind, withAlt) {
    let tms = 0, casts = 0, idle = 0, walk = 0, seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const st2 = R.reachState(); let fightEnd = 0, dist = 0, tid = 0;
    while (tms < 60000) {
      if (tms >= fightEnd) { tid++; dist = 800 + rnd() * 750; fightEnd = tms + 12000; }
      if (dist <= 810) { casts++; tms += 1900; continue; }                                         // Aqua Swirl cast (raw 4000 at Casting Spd ~700)
      if (kind === 'old') { const step = 0.6 * 150 * 0.5; dist = Math.max(630, dist - step); tms += 600; idle += 600; continue; }   // follow pulled half back
      const d2 = R.reachDecide(rctx({ st: st2, now: 100000 + tms, me: { x: 1500 - dist, y: 0 }, tgt: { id: tid, x: 1500, y: 0 }, dist, alt: withAlt }));
      if (d2.act === 'switch') { dist = 700; tms += 150; idle += 150; continue; }                  // the in-range fight monster
      if (d2.act === 'step') { dist = Math.max(0, dist - 150 * d2.wait / 1000); tms += d2.wait; walk += d2.wait; continue; }
      tms += 500; idle += 500;
    }
    return { casts, idleS: Math.round(idle / 1000), walkS: Math.round(walk / 1000) };
  }
  const so = simFight('old', false), sn = simFight('new', false), sa = simFight('new', true);
  console.log('     sim 1 min, targets 800-1550 away, 12 s each:', 'old', JSON.stringify(so), '| new', JSON.stringify(sn), '| new + in-range alternative', JSON.stringify(sa));
  check(sn.casts > so.casts && sa.casts >= sn.casts, `casts per minute: old ${so.casts} -> stepping ${sn.casts} -> with the alternative ${sa.casts}`);
  check(sn.idleS * 4 < 60 && sa.idleS * 4 < 60, `idle < 25 % of the fight (stepping: ${sn.idleS} s, with alternative: ${sa.idleS} s of 60)`);

  console.log(fails ? `\n${fails} FAILED` : '\nall ok');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
