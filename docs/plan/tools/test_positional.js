// OFFLINE TEST of the POSITIONAL SKILLS block (user 2026-10-09 13:50: "some skills like Backstab work better from behind the enemy, and they
// should try to move behind the enemy if they can"). Runs the POSBEHIND-PURE block of Scripts_dev/swarm.js in node (no host objects):
//   node docs/plan/tools/test_positional.js          (exit code 1 when a check fails; SWARM_SRC=<file> tests another copy)
// Covers: the rules file (Backstab behindOnly, blows behindBonus, Bluff, Shadow Step), facing inference (moving > target > heading),
// the zone / angle check, the behind point, danger + wall avoidance, solo (target on me) vs aggro on a teammate, the give-up timer,
// the Backstab filter, raids (noMove) and the once-per-kind log keys.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const a = src.indexOf('// POSBEHIND-PURE-BEGIN'), b = src.indexOf('// POSBEHIND-PURE-END');
if (a < 0 || b < a) { console.error('POSBEHIND-PURE block not found'); process.exit(1); }
const M = new Function(src.slice(a, b) + '\nreturn { POSBEHIND, POS_STEP_RULES, posNormDeg, posFacing, posZone, posStepDist, posCandidates, posPickPoint, posState, posDecide, posTurned };')();
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const near = (x, y, eps) => Math.abs(x - y) <= (eps || 1e-6);

// ---- 0) the rules file (generated from the datapack) ------------------------------------------------------------------------------
const J = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'positional_skills.json'), 'utf8'));
const rules = {}; Object.keys(J.skills).forEach(k => { rules[k] = J.skills[k].rule; });
check(rules[30] === 'behindOnly', 'Backstab 30 = behindOnly');
check([16, 263, 344, 409, 321, 505].every(id => rules[id] === 'behindBonus'), 'Mortal / Deadly / Lethal / Critical / Blinding Blow + Shining Edge = behindBonus');
check(rules[358] === 'turnsTarget' && (J.skills[321].also || []).includes('turnsTarget'), 'Bluff 358 turns the target (Blinding Blow too)');
check(rules[821] === 'stepsBehind', 'Shadow Step 821 = stepsBehind');
check(!Object.values(rules).includes('frontOnly'), 'no frontOnly skill in the H5 datapack');
check(J.blowPositionMod.side === 1.5 && J.blowPositionMod.behind === 2, 'blow position mod: side 1.5, behind 2');

// ---- 1) facing inference -----------------------------------------------------------------------------------------------------------
const deg = (r) => Math.round(((r * 180 / Math.PI) % 360 + 360) % 360);
let f = M.posFacing({ mob: { x: 0, y: 0, dx: 0, dy: 500, heading: 0 }, tgt: { x: 100, y: 0 } });
check(f && f.src === 'move' && deg(f.ang) === 90, `a moving monster faces where it walks (src ${f && f.src}, ${f && deg(f.ang)} deg)`);
f = M.posFacing({ mob: { x: 0, y: 0, dx: 10, dy: 5, heading: 0 }, tgt: { x: -100, y: 0 } });
check(f && f.src === 'target' && deg(f.ang) === 180, 'a standing monster faces its target (dX/dY within 40 = not moving)');
f = M.posFacing({ mob: { x: 0, y: 0, dx: 0, dy: 0, heading: 16384 }, tgt: null });
check(f && f.src === 'heading' && deg(f.ang) === 90, 'no target, not moving: the client heading (16384 = 90 deg)');
check(M.posFacing({ mob: { x: 0, y: 0 }, tgt: null }) === null, 'nothing known -> null');
f = M.posFacing({ mob: { x: 0, y: 0, dx: 0, dy: 0 }, tgt: { x: null, y: null } });
check(f === null, 'a target without a position does not count');

// ---- 2) zone + angle ---------------------------------------------------------------------------------------------------------------
const mob = { x: 1000, y: 1000 };
check(M.posZone({ x: 1100, y: 1000 }, mob, 0).zone === 'front', 'standing where it faces = front');
check(M.posZone({ x: 900, y: 1000 }, mob, 0).zone === 'behind', 'opposite side = behind (180 deg)');
check(M.posZone({ x: 1000, y: 1100 }, mob, 0).zone === 'side', '90 deg = side');
check(M.posZone({ x: 1000 + 100 * Math.cos(2.2), y: 1000 + 100 * Math.sin(2.2) }, mob, 0).zone === 'behind', '126 deg = behind (> 120)');
check(M.posZone({ x: 1000 + 100 * Math.cos(1.0), y: 1000 + 100 * Math.sin(1.0) }, mob, 0).zone === 'front', '57 deg = front (<= 60)');
check(near(M.posNormDeg(350), -10) && near(M.posNormDeg(-190), 170), 'angle normalisation');

// ---- 3) the behind point -------------------------------------------------------------------------------------------------------------
check(M.posStepDist(0) === 50 && M.posStepDist(30) === 60 && M.posStepDist(200) === 90, 'step distance = collision radius + 30, 50..90');
const cs = M.posCandidates(mob, 0, 60);
check(cs[0].x === 940 && cs[0].y === 1000 && cs[0].zone === 'behind', `straight behind a monster facing east: (940, 1000) — got (${cs[0].x}, ${cs[0].y})`);
check(cs.filter(p => p.zone === 'behind').length === 3 && cs.filter(p => p.zone === 'side').length === 2, '3 behind spots (0, +-40 deg) + 2 side spots');
check(cs.every(p => M.posZone(p, mob, 0).zone === p.zone), 'every candidate really lies in its zone');
// pick: shortest walk among the behind ones
let p = M.posPickPoint(cs, { x: 1000, y: 1100 }, [], []);
check(p && p.zone === 'behind' && p.y > 1000, 'from the north side: the behind spot on my side (shortest walk)');
// danger: an aggressive monster whose aggro circle covers the behind spots, and I am outside it
const danger = [{ x: 800, y: 1000, r: 150 }];
p = M.posPickPoint(cs, { x: 1100, y: 1000 }, danger, []);
check(p && p.zone === 'side', 'every behind spot in a NEW aggro circle -> a side spot');
p = M.posPickPoint(cs, { x: 880, y: 1000 }, danger, []);
check(p && p.zone === 'behind', 'already inside that aggro circle -> stepping inside it is no new danger');
p = M.posPickPoint(cs, { x: 1500, y: 1000 }, [{ x: 1000, y: 1000, r: 400 }], []);
check(p === null, 'everything around it in a new aggro circle -> no spot');
p = M.posPickPoint(cs, { x: 1100, y: 1000 }, [], [{ x: 940, y: 1000 }]);
check(p && !(p.x === 940 && p.y === 1000) && p.zone === 'behind', 'a spot where a step got stuck (wall) is skipped');

// ---- 4) the decision ---------------------------------------------------------------------------------------------------------------
const BS = { id: 30, name: 'Backstab' }, DB = { id: 263, name: 'Deadly Blow' }, MB = { id: 16, name: 'Mortal Blow' }, PS = { id: 3, name: 'Power Strike' };
const BLUFF = { id: 358, name: 'Bluff', ready: true, range: 40 }, SSTEP = { id: 821, name: 'Shadow Step', ready: true, range: 600 };
const MOB = (o) => Object.assign({ id: 77, name: 'Grave Robber', x: 1000, y: 1000, dx: 1000, dy: 1000, heading: 0, r: 20 }, o);
const dec = (o, st) => M.posDecide(Object.assign({ now: 10000, rules, cands: [BS, DB, MB], me: { x: 1060, y: 1000 }, mob: MOB(), dist: 60, dangers: [] }, o, { st: st || M.posState(0) }));
// a) no positional skill
check(M.posDecide({ now: 1, rules, cands: [PS, { id: 1177, name: 'Wind Strike' }], me: { x: 0, y: 0 }, mob: MOB(), st: M.posState(0) }) === null, 'no positional skill in the plan -> null (cast as usual)');
// b) the target fights a teammate standing east: it faces east; I stand east (front) -> step behind (west)
let st = M.posState(0);
let d = dec({ tgt: { who: 'mate', x: 1200, y: 1000 } }, st);
check(d.act === 'step' && d.point.x < 1000 && d.zone === 'front', `aggro on a teammate, I am in front -> step behind (${d.act} to ${d.point && d.point.x},${d.point && d.point.y})`);
check(d.exclude.includes(30) && !d.exclude.includes(263), 'while in front Backstab is left out, the blows stay');
check(/stepping behind Grave Robber for Backstab/.test(d.why) && d.kind === 'step', `log line: "${d.why}"`);
check(d.wait >= 300 && d.wait <= 1000, `re-check within <= 1 s (${d.wait} ms)`);
// c) I arrived behind -> cast everything
d = M.posDecide({ now: 10600, rules, cands: [BS, DB, MB], me: { x: 940, y: 1000 }, mob: MOB(), tgt: { who: 'mate', x: 1200, y: 1000 }, dist: 60, dangers: [], st });
check(d.act === 'cast' && d.zone === 'behind' && d.exclude.length === 0, 'behind -> cast, Backstab allowed');
check(st.wantSince === 0, 'arriving behind resets the give-up timer');
// d) the monster keeps turning (the teammate moves round it): give up after 3 s, retry after 12 s
st = M.posState(0);
let t = 20000; dec({ now: t, tgt: { who: 'mate', x: 1200, y: 1000 } }, st);
d = M.posDecide({ now: t + 1500, rules, cands: [BS, DB], me: { x: 1060, y: 1000 }, mob: MOB(), tgt: { who: 'mate', x: 1200, y: 1000 }, dist: 60, dangers: [], st });
check(d.act === 'step', '1.5 s in: still stepping (re-check while it moves)');
d = M.posDecide({ now: t + 3100, rules, cands: [BS, DB], me: { x: 1060, y: 1000 }, mob: MOB(), tgt: { who: 'mate', x: 1200, y: 1000 }, dist: 60, dangers: [], st });
check(d.act === 'cast' && d.kind === 'gaveup' && d.exclude.includes(30), 'after 3 s: give up, cast from the front without Backstab');
d = M.posDecide({ now: t + 9000, rules, cands: [BS, DB], me: { x: 1060, y: 1000 }, mob: MOB(), tgt: { who: 'mate', x: 1200, y: 1000 }, dist: 60, dangers: [], st });
check(d.act === 'cast' && d.kind === 'gaveup', 'no new try within 12 s of giving up');
d = M.posDecide({ now: t + 15200, rules, cands: [BS, DB], me: { x: 1060, y: 1000 }, mob: MOB(), tgt: { who: 'mate', x: 1200, y: 1000 }, dist: 60, dangers: [], st });
check(d.act === 'step', '12 s later: tries again');
// e) given up while on the SIDE: Backstab allowed (L2J: Backstab only fails from the front)
st = M.posState(0); st.mobId = 77; st.gaveUpAt = 50000;
d = M.posDecide({ now: 51000, rules, cands: [BS, DB], me: { x: 1000, y: 1060 }, mob: MOB(), tgt: { who: 'mate', x: 1200, y: 1000 }, dist: 60, dangers: [], st });
check(d.act === 'cast' && d.zone === 'side' && d.exclude.length === 0, 'given up on the side: everything allowed (side x1.5)');
// f) SOLO: the target fights me -> no walking; Bluff first, else Shadow Step, else no Backstab
d = dec({ tgt: { who: 'me', x: 1060, y: 1000 }, turn: BLUFF, step: SSTEP });
check(d.act === 'turn' && d.skill.id === 358 && /faces me — Bluff first/.test(d.why), `solo: Bluff first ("${d.why}")`);
d = dec({ tgt: { who: 'me', x: 1060, y: 1000 }, turn: Object.assign({}, BLUFF, { ready: false }), step: SSTEP });
check(d.act === 'shadow' && d.skill.id === 821, 'solo, Bluff on cooldown: Shadow Step');
d = dec({ tgt: { who: 'me', x: 1060, y: 1000 }, turn: null, step: Object.assign({}, SSTEP, { ready: false }) });
check(d.act === 'cast' && d.exclude.includes(30) && !d.exclude.includes(263) && d.kind === 'faces-me', 'solo without helpers: no Backstab, blows from the front, no walking');
d = dec({ tgt: { who: 'me', x: 1060, y: 1000 }, turn: BLUFF, dist: 300 });
check(d.act === 'cast', 'Bluff out of reach (melee 40): not chased');
// g) after my Bluff / Shadow Step I count as behind for 2.5 s
st = M.posState(0); st.mobId = 77; M.posTurned(st, 70000);
d = M.posDecide({ now: 71000, rules, cands: [BS, DB], me: { x: 1060, y: 1000 }, mob: MOB(), tgt: { who: 'me', x: 1060, y: 1000 }, dist: 60, dangers: [], turn: BLUFF, st });
check(d.act === 'cast' && d.zone === 'behind' && d.exclude.length === 0, 'just Bluffed: behind -> Backstab');
d = M.posDecide({ now: 73000, rules, cands: [BS, DB], me: { x: 1060, y: 1000 }, mob: MOB(), tgt: { who: 'me', x: 1060, y: 1000 }, dist: 60, dangers: [], turn: Object.assign({}, BLUFF, { ready: false }), st });
check(d.act === 'cast' && d.zone === 'front' && d.exclude.includes(30), '3 s later it has turned back to me: front again');
// h) raids / instances / pairs: no stepping, only the filter
d = dec({ tgt: { who: 'mate', x: 1200, y: 1000 }, noMove: true });
check(d.act === 'cast' && d.exclude.includes(30) && d.kind === 'nomove-front', 'raid (noMove), in front: no step, no Backstab');
d = dec({ tgt: { who: 'mate', x: 1200, y: 1000 }, noMove: true, me: { x: 940, y: 1000 } });
check(d.act === 'cast' && d.exclude.length === 0, 'raid, behind the boss (formation slot): Backstab allowed');
// i) a monster that walks (chases the teammate north): facing = its walk, not the old target spot
d = dec({ mob: MOB({ dx: 1000, dy: 1600 }), tgt: { who: 'mate', x: 1200, y: 1000 }, me: { x: 1000, y: 940 } });
check(d.zone === 'behind' && d.act === 'cast', 'moving north, I am south of it = behind');
// j) danger: the only behind spots are in a new aggro circle, I am beside it -> no step (side is fine), gave up
st = M.posState(0);
d = dec({ tgt: { who: 'mate', x: 1200, y: 1000 }, me: { x: 1000, y: 1060 }, dangers: [{ x: 800, y: 1000, r: 150 }] }, st);
check(d.act === 'cast' && d.kind === 'nospot' && d.exclude.length === 0, 'behind is in another monster\'s aggro, I am on the side: cast from the side');
d = dec({ tgt: { who: 'mate', x: 1200, y: 1000 }, dangers: [{ x: 800, y: 1000, r: 150 }] }, M.posState(0));
check(d.act === 'step' && d.point.zone === 'side', 'in front + behind blocked by aggro: step to the side (x1.5) instead');
// k) wall: a step that did not move me marks the spot, the next pick avoids it
st = M.posState(0);
d = dec({ tgt: { who: 'mate', x: 1200, y: 1000 }, me: { x: 1060, y: 1000 } }, st);
const first = d.point;
d = M.posDecide({ now: 10600, rules, cands: [BS, DB], me: { x: 1061, y: 1001 }, mob: MOB(), tgt: { who: 'mate', x: 1200, y: 1000 }, dist: 60, dangers: [], st });
check(st.bad.length === 1 && d.act === 'step' && !(d.point.x === first.x && d.point.y === first.y), 'stuck against a wall: another behind spot next time');
// l) far away (approach): no walking round from > 600
d = dec({ tgt: { who: 'mate', x: 1200, y: 1000 }, dist: 900 });
check(d.act === 'cast' && d.kind === 'far', 'more than 600 away: cast as usual (no long walk round)');
// m) unknown facing: cast as usual
d = dec({ mob: MOB({ dx: undefined, dy: undefined, heading: undefined }), tgt: { who: 'none' } });
check(d.act === 'cast' && d.kind === 'unknown' && d.exclude.length === 0, 'facing unknown: cast as usual');
// n) nobody fights it yet (opener): step behind it, its heading tells where it faces
d = dec({ mob: MOB({ heading: 32768 }), tgt: { who: 'none' }, me: { x: 940, y: 1000 } });
check(d.zone === 'front' && d.deg === 0, 'an idle monster facing west (heading 32768), I am west of it: front (0 deg)');
d = dec({ mob: MOB({ heading: 32768 }), tgt: { who: 'none' }, me: { x: 940, y: 1000 } }, M.posState(0));
check(d.zone === 'front' && (d.act === 'step' && d.point.x > 1000), 'opener: steps behind an idle monster (east of it)');
// o) a new monster resets the state
st = M.posState(0); st.mobId = 77; st.gaveUpAt = 10000;
d = dec({ mob: MOB({ id: 78 }), tgt: { who: 'mate', x: 1200, y: 1000 } }, st);
check(st.mobId === 78 && d.act === 'step', 'a new target: fresh start (no carried-over give-up)');
// p) only blows (no Backstab yet, e.g. a level 20 Rogue with Mortal Blow): still steps behind for the x2
d = dec({ cands: [MB, PS], tgt: { who: 'mate', x: 1200, y: 1000 } });
check(d.act === 'step' && /for Mortal Blow/.test(d.why) && d.exclude.length === 0, 'blows only: steps behind for the bonus, nothing filtered');

// ---- 5) host glue smoke test (posbehindTick / posFilterOrder with mocked host objects) -------------------------------------------
(async () => {
  const h0 = src.indexOf('// POSBEHIND host side'), h1 = src.indexOf('async function autoSkillTick() {');
  if (h0 < 0 || h1 < h0) { check(false, 'POSBEHIND host side found before autoSkillTick'); return; }
  let T = 100000; const moves = [], casts = [], attacks = [], logs = [];
  const mobs = { 77: { objId: 77, Name: 'Grave Robber', X: 1000, Y: 1000, dX: 1000, dY: 1000, Heading: 0, CollisionRadius: 20, TargetObjId: 5, IsDead: false } };
  const skills = { 358: { Name: 'Bluff', IsReady: true, MP: 10, CastRange: 40, HitTime: 500 } };
  const env = {
    num: (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0), now: () => T, castBlocked: {},
    Me: { X: 1060, Y: 1000, Z: -3000, MP: 300, objId: 1, Name: 'Dagger1', IsSitting: false, IsAttacking: false },
    mobById: (id) => mobs[id] || null, charById: (id) => id === 5 ? { X: 1200, Y: 1000 } : null,
    PartyList: { GetItemByObjectID: (id) => id === 5 ? { X: 1200, Y: 1000 } : null }, livePosByObj: () => false,
    dangerMobs: () => [], SkillsList: { GetItemByID: (id) => skills[id] || null }, skillWeapons: () => null, skillDesc: () => '', myWeaponType: () => 'DAGGER',
    Send: { MoveBackwardToLocation: (x, y, z) => moves.push([x, y, z]) }, standUp: () => { }, srvAttack: (id) => attacks.push(id),
    castNow: async (k) => { casts.push(k.id); return { started: true }; }, Distance: () => 60,
    log: (m) => logs.push(m), appendShared: () => { }, __DIR__: 'X', __SCRIPTS__: 'Y',
    File: { ReadAllText: () => fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'positional_skills.json'), 'utf8') },
  };
  const names = Object.keys(env);
  const H = new Function(...names, src.slice(a, b) + src.slice(h0, h1) + '\nreturn { posbehindTick, posFilterOrder, posTrackHit };')(...names.map(k => env[k]));
  const BS = { id: 30, name: 'Backstab' }, DB = { id: 263, name: 'Deadly Blow' };
  let r = await H.posbehindTick({ objId: 77 }, [BS, DB], 60, false);
  check(r && r.next > 0 && moves.length === 1 && moves[0][0] < 1000, 'host: aggro on a teammate -> one straight move behind the monster');
  check(logs.some(l => /positional: stepping behind Grave Robber for Backstab/.test(l)), 'host: logged "positional: stepping behind Grave Robber for Backstab"');
  T += 600; env.Me.X = 942; env.Me.Y = 1000;
  r = await H.posbehindTick({ objId: 77 }, [BS, DB], 60, false);
  check(r && r.cands && r.cands.length === 2 && attacks[0] === 77, 'host: arrived behind -> both skills, swings resumed (srvAttack)');
  const nLogs = logs.length; T += 300; await H.posbehindTick({ objId: 77 }, [BS, DB], 60, false);
  check(logs.length === nLogs, 'host: the same decision is logged once per monster');
  // solo: the monster hits me (no TargetObjId: the OnAttack track)
  mobs[77].TargetObjId = 0; H.posTrackHit(77, 1); env.Me.X = 1060; T += 5000; H.posTrackHit(77, 1);
  r = await H.posbehindTick({ objId: 77 }, [BS, DB], 60, false);
  check(r && r.next === 0 && casts[0] === 358, 'host: solo, it hits me -> Bluff cast');
  r = await H.posbehindTick({ objId: 77 }, [BS, DB], 60, false);
  check(r && r.cands && r.cands.length === 2, 'host: right after Bluff -> Backstab allowed');
  T += 4000; H.posTrackHit(77, 1); skills[358].IsReady = false;
  r = await H.posbehindTick({ objId: 77 }, [BS, DB], 60, false);
  check(r && r.cands && r.cands.length === 1 && r.cands[0].id === 263, 'host: Bluff on cooldown, it faces me -> Deadly Blow only');
  check(H.posFilterOrder({ objId: 77 }, [BS, DB]).length === 1, 'host: raid filter drops Backstab in front');
  check((await H.posbehindTick({ objId: 77 }, [{ id: 1177, name: 'Wind Strike' }], 60, false)) === null, 'host: no positional skill -> null');
})().catch(e => { check(false, 'host smoke test threw: ' + e.message); }).then(() => {
  console.log(fails ? `\n${fails} check(s) FAILED` : '\nall positional checks passed');
  process.exit(fails ? 1 : 0);
});
