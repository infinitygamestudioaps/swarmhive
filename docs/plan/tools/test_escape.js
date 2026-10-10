// OFFLINE TEST of the escape-from-a-fight code (2026-10-08). Runs the ESCPURE block of Scripts_dev/swarm.js in node with mocks:
//   node docs/plan/tools/test_escape.js            (exit code 1 when a check fails)
// Covers: CC skill choice by name / AbnormalType (Bishop, Elder, Shillien Saint, fighters, necro, kamael), pickCC rules, the escape state
// machine (incident replay + interrupted SoE + no scroll / rescue + .townname), the leader's 'nobody left behind in a fight' area rule,
// and the wall-aware flee spot (geopath fleeSpot) at the real Cruma corner where the team was stuck.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const a = src.indexOf('// ESCPURE-BEGIN'), b = src.indexOf('// ESCPURE-END');
if (a < 0 || b < a) { console.error('ESCPURE block not found'); process.exit(1); }
const block = src.slice(a, b);
const M = new Function(block + '\nreturn { classifyCC, pickCC, escapeRun, sameArea, portBlockers, CC_RULES };')();
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const sk = (Id, Name, o) => Object.assign({ Id, Name, IsActive: true, IsToggle: false, TargetType: 'ENEMY', AbnormalType: '', AbnormalTime: 0, CastRange: 600, HitTime: 1500, MP: 20, AffectScope: 'SINGLE' }, o || {});

// ---- 1) CC classification -------------------------------------------------------------------------------------------------
const bishop = [sk(1011, 'Heal', { TargetType: 'ONE' }), sk(1217, 'Greater Heal', { TargetType: 'ONE' }), sk(1218, 'Greater Battle Heal', { TargetType: 'ONE' }),
  sk(1016, 'Resurrection', { TargetType: 'CORPSE_PLAYER' }), sk(1068, 'Might', { TargetType: 'ONE', AbnormalType: 'PA_UP', AbnormalTime: 1200 }),
  sk(1201, 'Dryad Root', { AbnormalType: 'ROOT_MAGICALLY', AbnormalTime: 30, HitTime: 2000 }), sk(1075, 'Peace', { AbnormalType: '', HitTime: 2500 }),
  sk(1069, 'Sleep', { AbnormalType: 'SLEEP', AbnormalTime: 30, HitTime: 2500 }), sk(1043, 'Holy Weapon', { TargetType: 'SELF' })];
let c = M.classifyCC(bishop);
check(c.map(k => k.kind).join(',') === 'sleep,root,peace', `Bishop CC = sleep, root, peace (got ${c.map(k => k.name).join(', ')})`);
const elder = [sk(1069, 'Sleep', { AbnormalType: 'SLEEP', AbnormalTime: 30 }), sk(1201, 'Dryad Root', { AbnormalType: 'ROOT_MAGICALLY', AbnormalTime: 30 }),
  sk(1102, 'Aura Sink', {}), sk(1257, 'Decrease Weight', { TargetType: 'ONE' }), sk(1394, 'Trance', { AbnormalType: 'SLEEP', AbnormalTime: 20 })];
c = M.classifyCC(elder);
check(c[0].kind === 'sleep' && c.some(k => k.name === 'Trance') && c.some(k => k.kind === 'root') && !c.some(k => k.name === 'Aura Sink'), `Elder: Sleep/Trance (by AbnormalType) first, Dryad Root kept, Aura Sink ignored (${c.map(k => k.name).join(', ')})`);
const saint = [sk(1531, 'Stigma of Shilen', { AbnormalType: 'STIGMA', AbnormalTime: 30 }), sk(1263, 'Curse Gloom', { AbnormalType: 'MD_DOWN', AbnormalTime: 30 }),
  sk(1539, 'Mass Slow', { AbnormalType: 'SPEED_DOWN', AbnormalTime: 30, AffectScope: 'RANGE' }), sk(1069, 'Sleep', { AbnormalType: 'SLEEP', AbnormalTime: 30 })];
c = M.classifyCC(saint);
check(c.map(k => k.kind).join(',') === 'sleep,slow' && c[1].aoe, `Shillien Saint: Sleep then Mass Slow (aoe), Stigma + Curse Gloom never (${c.map(k => k.name).join(', ')})`);
const sk1 = [sk(28, 'Aggression', { AbnormalType: 'TARGET_LOCK' }), sk(92, 'Shield Stun', { AbnormalType: 'STUN', AbnormalTime: 9, HitTime: 1080 }),
  sk(122, 'Hex', { AbnormalType: 'PD_DOWN', AbnormalTime: 15 }), sk(115, 'Power Break', { AbnormalType: 'PA_DOWN' }), sk(110, 'Ultimate Defense', { TargetType: 'SELF', AbnormalType: 'ROOT_PHYSICALLY' }),
  sk(18, 'Aura of Hate', { AffectScope: 'POINT_BLANK' }), sk(402, 'Arrest', { AbnormalType: 'ROOT_PHYSICALLY', AbnormalTime: 30 })];
c = M.classifyCC(sk1);
check(c.map(k => k.name).join(',') === 'Shield Stun,Arrest', `Shillien Knight: Shield Stun, Arrest — never Aggression/Hex/Ultimate Defense/Aura of Hate (${c.map(k => k.name).join(', ')})`);
const necro = [sk(1169, 'Curse Fear', { AbnormalType: 'TURN_FLEE', AbnormalTime: 8 }), sk(1170, 'Anchor', { AbnormalType: 'PARALYZE', AbnormalTime: 15 }), sk(1160, 'Slow', { AbnormalType: 'SPEED_DOWN', AbnormalTime: 60 }),
  sk(1064, 'Silence', { AbnormalType: 'SILENCE', AbnormalTime: 30 }), sk(1263, 'Curse Gloom', {}), sk(1234, 'Vampiric Claw', {}), sk(1129, 'Summon Reanimated Man', { TargetType: 'SELF' })];
c = M.classifyCC(necro);
check(c.map(k => k.kind).join(',') === 'fear,hold,slow,silence', `Necromancer: Curse Fear > Anchor > Slow > Silence (${c.map(k => k.name).join(', ')})`);
const kamael = [sk(1437, 'Shadow Bind', { AbnormalType: 'ROOT_MAGICALLY', AbnormalTime: 15 }), sk(1445, 'Surrender to the Unholy', { AbnormalType: 'DARK_DEF_DOWN' }), sk(1436, 'Soul of Pain', {})];
c = M.classifyCC(kamael);
check(c.length === 1 && c[0].name === 'Shadow Bind', `Kamael: Shadow Bind only (${c.map(k => k.name).join(', ')})`);
c = M.classifyCC([sk(1069, 'Sleep', { AbnormalType: 'SLEEP', IsToggle: true }), sk(1201, 'Dryad Root', { IsActive: false })]);
check(c.length === 0, 'toggles / passives are never CC');
c = M.classifyCC([sk(1069, 'Sleep', { AbnormalType: 'SLEEP' })], /Sleep/);
check(c.length === 0, 'CONFIG.autoSkills.neverCast is respected');

// ---- 2) pickCC ------------------------------------------------------------------------------------------------------------
const bc = M.classifyCC(bishop);
const mob = { id: 7, n: 'Catherok', dist: 66 };
check(M.pickCC(bc, mob, { ready: () => true, mp: 500, ccState: {} }).name === 'Sleep', 'pickCC: best ready skill (Sleep)');
check(M.pickCC(bc, mob, { ready: id => id !== 1069, mp: 500, ccState: {} }).name === 'Dryad Root', 'pickCC: Sleep on cooldown -> Dryad Root');
check(M.pickCC(bc, mob, { ready: () => true, mp: 500, ccState: { 7: { resisted: { 1069: 2 } } } }).name === 'Dryad Root', 'pickCC: Sleep resisted twice -> next skill');
check(M.pickCC(bc, { id: 8, n: 'far', dist: 2000 }, { ready: () => true, mp: 500, ccState: {} }) === null, 'pickCC: out of range -> none');
check(M.pickCC(bc, mob, { ready: () => true, mp: 5, ccState: {} }) === null, 'pickCC: not enough MP -> none');

// ---- 3) the escape state machine ------------------------------------------------------------------------------------------
function world(o) {
  const W = Object.assign({ t: 0, hitAt: 0, cc: false, inTown: false, soe: 7, soeResults: ['ok'], townResults: [false, false], leaderNearAt: Infinity, dead: false, fleeMoves: 960, log: [] }, o);
  const E = { cc: {}, steps: [] };
  const io = {
    now: () => W.t, sleep: async (ms) => { W.t += ms; if (!W.cc && W.t - W.hitAt > 1500 && W.attacking) W.hitAt = W.t; },
    dead: () => W.dead, mp: () => 500,
    attackers: () => W.cc && !W.wakes ? [{ id: 7, n: 'Catherok', dist: W.far ? 900 : 66, targetsMe: true, hitMe: false, cc: 'root' }] : W.attacking ? [{ id: 7, n: 'Catherok', dist: W.far ? 900 : 66, targetsMe: true, hitMe: true, cc: null }] : [],
    lastHitAgo: () => W.t - W.hitAt, ccList: () => M.classifyCC(bishop), ready: () => true,
    castCC: async (k) => { W.t += 2500; W.log.push('cc:' + k.name); if (W.ccWorks !== false) { W.cc = true; W.attacking = false; } return W.ccWorks === false ? 'resisted' : 'ok'; },
    fleePlan: async () => W.noPlan ? null : { label: 'the hallway', dist: 960, points: [{ x: 1, y: 1 }] },
    walkPlan: async () => { W.t += 9000; W.far = true; W.log.push('run'); return W.fleeMoves; },
    inTown: () => W.inTown,
    town: async () => { W.t += 20000; const r = W.townResults.length ? W.townResults.shift() : false; W.log.push('town:' + r); if (r) W.inTown = true; return r; },
    soeCount: () => W.soe,
    castSoe: async () => { W.t += 20000; const r = W.soeResults.length ? W.soeResults.shift() : 'failed'; W.log.push('soe:' + r); if (r === 'ok') { W.soe--; W.inTown = true; } return r; },
    selfHeal: async () => { }, leaderNear: () => W.t >= W.leaderNearAt,
    report: (phase, text) => { E.steps.push(phase + ': ' + text); }, rescue: (s) => W.log.push('rescue:' + s),
  };
  return { W, E, io };
}
(async () => {
  // A) incident replay: Catherok on Bishop1, healer, Cruma corner. Expect: CC (Sleep) -> run to the hallway -> quiet -> .town refused -> SoE ok
  let w = world({ attacking: true, hitAt: 0 });
  let r = await M.escapeRun(w.io, w.E);
  check(r === 'soe' && w.W.log.join(' ') === 'cc:Sleep run town:false soe:ok', `incident replay: ${w.W.log.join(' ')} -> ${r}`);
  // B) SoE interrupted once: CC + run again, second SoE works
  w = world({ attacking: true, soeResults: ['interrupted', 'ok'], wakes: false });
  r = await M.escapeRun(w.io, w.E);
  check(r === 'soe' && w.W.log.filter(x => x.startsWith('soe')).join(',') === 'soe:interrupted,soe:ok', `interrupted SoE -> retried: ${w.W.log.join(' ')} -> ${r}`);
  // C) .townname works -> no scroll used
  w = world({ attacking: true, townResults: [true] });
  r = await M.escapeRun(w.io, w.E);
  check(r === 'town' && !w.W.log.some(x => x.startsWith('soe')), `.townname works -> no SoE: ${w.W.log.join(' ')} -> ${r}`);
  // D) no scroll, no flee spot, CC resisted, still hit: 5 rounds, then wait for the leader -> rescued
  w = world({ attacking: true, soe: 0, noPlan: true, ccWorks: false, leaderNearAt: 400000 });
  r = await M.escapeRun(w.io, w.E);
  check(r === 'rescued' && w.W.log.includes('rescue:wait'), `no scroll + no spot -> waits for the leader -> ${r}`);
  check(w.E.steps.some(s => /no Scroll of Escape/.test(s)), 'says it has no Scroll of Escape');
  // E) dead during the escape
  w = world({ attacking: true, soe: 0, noPlan: true, ccWorks: false });
  const io2 = Object.assign({}, w.io, { sleep: async (ms) => { w.W.t += ms; if (w.W.t > 60000) w.W.dead = true; } });
  r = await M.escapeRun(io2, w.E);
  check(r === 'dead', `dies during the escape -> ${r}`);

  // ---- 4) the leader never leaves anyone behind in a fight --------------------------------------------------------------
  const me = { X: 83473, Y: 148554, Z: -3408 }, t = 1e6;
  const pos = { Bishop1: { X: 21752, Y: 116392, Z: -12080, at: t, fight: true }, Doombringer1: { X: 83500, Y: 148600, Z: -3408, at: t, fight: false } };
  check(M.portBlockers(['Bishop1', 'Doombringer1'], pos, me, t).length === 0, 'leader in Giran: Bishop1 fighting 70k away does NOT block his port (deadlock fixed)');
  const cruma = { X: 21736, Y: 116408, Z: -12080 };
  check(M.portBlockers(['Bishop1'], pos, cruma, t).join() === 'Bishop1', 'leader in the Cruma room: Bishop1 fighting next to him BLOCKS the port');
  check(M.portBlockers(['Bishop1'], { Bishop1: Object.assign({}, pos.Bishop1, { Z: -9050 }) }, cruma, t).length === 0, 'teammate fighting on another floor does not block');
  check(M.portBlockers(['Bishop1'], { Bishop1: Object.assign({}, pos.Bishop1, { at: t - 20000 }) }, cruma, t).length === 0, 'a stale report (20 s) does not block');
  check(M.portBlockers(['Bishop1'], { Bishop1: Object.assign({}, pos.Bishop1, { IsDead: true }) }, cruma, t).length === 0, 'a dead teammate does not block');

  // ---- 5) wall-aware flee spot at the incident corner --------------------------------------------------------------------
  try {
    const g = require('./geopath');
    const at = { x: 21752, y: 116392, z: -12080 }, dangers = [{ x: 21700, y: 116430, r: 750 }];
    const ang = Math.atan2(at.y - 116430, at.x - 21700);
    check(!g.lineClear(at, { x: at.x + Math.cos(ang) * 1500, y: at.y + Math.sin(ang) * 1500, z: at.z }), 'the OLD straight pull-back target from the corner is behind a wall (root cause)');
    const f = g.fleeSpot(at, dangers, {});
    let ok = !!f.ok, p = at; (f.points || []).forEach(q => { if (!g.lineClear(p, q)) ok = false; p = q; });
    check(ok && Math.hypot(f.spot.x - at.x, f.spot.y - at.y) > 500, `fleeSpot: walkable spot ${f.spot && f.spot.x},${f.spot && f.spot.y} (${f.kind}, ${f.lengthUnits} units), every leg wall-free`);
    const s = g.fleeSpot(at, dangers, { safeSpots: [{ id: 'c1', name: 'west corridor', x: 19992, y: 117080, z: -12080 }] });
    check(s.ok && s.kind === 'safeSpot', `fleeSpot prefers a reachable floor safe spot (${s.kind} ${s.name})`);
  } catch (e) { check(false, 'geopath fleeSpot: ' + e.message); }

  console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})();
