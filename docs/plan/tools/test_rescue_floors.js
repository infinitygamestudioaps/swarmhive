// OFFLINE TEST of the cross-floor rescue + the escape test mode / hold-for-the-leader (2026-10-08 19:25 task). Runs the ESCPURE block of
// Scripts_dev/swarm.js in node with mocks and the REAL Scripts/data/dungeon_rooms.json:
//   node docs/plan/tools/test_rescue_floors.js        (exit code 1 when a check fails)
// Covers: dzFloor (which dungeon/floor a point is on), rescuePlan (Cruma floor 1 -> 2 via Penelope (was Ponti until 2026-10-09: his live menu has no 2nd floor link), 2 -> 1 via Capella, 3 -> 1, Giran ->
// Cruma floor 2 via .dion + gatekeeper + Mozella + Penelope, catacomb inside far / from outside, open world near / far, Tower of Insolence
// stairs), rescueRunPlan (step order, z check after a floor teleporter + one retry, failure reason), escapeRun hold (the leader is coming:
// no .townname / SoE; HP critical -> escapes; leader stops coming -> escapes) and TEST mode (stops before .townname / SoE, CC only within 900).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const a = src.indexOf('// ESCPURE-BEGIN'), b = src.indexOf('// ESCPURE-END');
if (a < 0 || b < a) { console.error('ESCPURE block not found'); process.exit(1); }
const M = new Function(src.slice(a, b) + '\nreturn { classifyCC, pickCC, escapeRun, dzFloor, rescuePlan, rescueRunPlan, rescueEtaLeft, floorEdges, FLOOR_DOWN };')();
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'), 'utf8').replace(/^﻿/, ''));
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const dos = (p) => p.steps.map(s => s.do + (s.npc ? ':' + s.npc.name : s.dest ? ':' + s.dest : s.town ? ':' + s.town : s.name ? ':' + s.name : s.do === 'walk' && !s.final ? ':' + s.label.replace(/^to /, '') : '')).join(' ');

// ---- 1) where am I --------------------------------------------------------------------------------------------------------
const CR1 = { x: 21752, y: 116392, z: -12080 }, CR2 = { x: 16952, y: 110248, z: -9312 }, CR2S = { x: 17592, y: 119336, z: -9064 }, CR3 = { x: 17736, y: 110760, z: -6648 }, DOOR = { x: 17296, y: 114176, z: -3439 };
const GIRAN = { x: 83473, y: 148554, z: -3408 };
let w = M.dzFloor(D, CR1.x, CR1.y, CR1.z); check(w && w.d.name === 'Cruma Tower' && w.fi === 0, `Excuro corner (incident) = Cruma Tower 1st floor (${w && w.d.name} ${w && w.fi})`);
w = M.dzFloor(D, CR2.x, CR2.y, CR2.z); check(w && w.fi === 1, 'Cruma 2nd floor point = floor index 1');
w = M.dzFloor(D, CR2S.x, CR2S.y, CR2S.z); check(w && w.fi === 1, 'Cruma 2nd floor south end = floor index 1');
w = M.dzFloor(D, DOOR.x, DOOR.y, DOOR.z); check(w && w.d.name === 'Cruma Tower' && w.fi === -1, 'Mozella at the tower door = Cruma, on no floor (-1)');
check(M.dzFloor(D, GIRAN.x, GIRAN.y, GIRAN.z) === null, 'Giran = no dungeon');

// ---- 2) plans ---------------------------------------------------------------------------------------------------------------
let p = M.rescuePlan(D, CR1, CR2, { name: 'Bishop1' });
check(p.ok && p.kind === 'floors' && dos(p) === 'walk:Penelope npc:Penelope walk' && p.route === '1st floor -> Penelope -> 2nd floor -> Bishop1',
  `Cruma floor 1 -> floor 2: ${dos(p)} | "${p.route}" | ETA ${p.etaSec} s`);
check(p.steps[1].z[0] === -9700 && p.steps[1].floor === 1 && p.steps[1].dungeon === 'Cruma Tower', 'the Penelope step carries the 2nd floor z band (-9700..-8400) for the height check');
check(p.etaSec > 30 && p.etaSec < 400, `ETA is sane (${p.etaSec} s)`);
p = M.rescuePlan(D, CR2, CR1, { name: 'Bishop1' });
check(p.ok && dos(p) === 'walk:Capella npc:Capella walk', `Cruma floor 2 (north half) -> floor 1 goes DOWN via Capella, not out of the tower: ${dos(p)} | ${p.route}`);
p = M.rescuePlan(D, CR2S, CR1, { name: 'Bishop1' });
check(p.ok && (dos(p) === 'walk:Capella npc:Capella walk' || dos(p) === 'town:Dion gk:Cruma Tower walk:Mozella npc:Mozella walk'), `Cruma floor 2 far south end -> floor 1: the cheaper of Capella (11k walk) and leaving via .dion: ${dos(p)} (ETA ${p.etaSec} s)`);
p = M.rescuePlan(D, CR3, CR2S, { name: 'Bishop1' });
check(p.ok && dos(p) === 'walk:Teleportation Cubic npc:Teleportation Cubic walk', `Cruma floor 3 -> floor 2 (south, next to Hanna): down via the Teleportation Cubic (${dos(p)})`);
p = M.rescuePlan(D, CR3, { x: 17781, y: 113999, z: -11672 }, { name: 'Bishop1' });
check(p.ok && (/npc:Teleportation Cubic .*npc:Capella/.test(dos(p)) || /^town:Dion gk:Cruma Tower walk:Mozella npc:Mozella/.test(dos(p))), `Cruma floor 3 -> floor 1: Cubic + Capella (11k walk across floor 2) or out via .dion, whichever is faster (${dos(p)}, ETA ${p.etaSec} s)`);
p = M.rescuePlan(D, GIRAN, CR2, { name: 'Bishop1' });
check(p.ok && dos(p) === 'town:Dion gk:Cruma Tower walk:Mozella npc:Mozella walk:Penelope npc:Penelope walk', `Giran -> Cruma floor 2: ${dos(p)} | "${p.route}" | ETA ${p.etaSec} s`);
p = M.rescuePlan(D, DOOR, CR1, { name: 'Bishop1' });
check(p.ok && dos(p) === 'walk:Mozella npc:Mozella walk', `at the tower door -> floor 1: ${dos(p)}`);
p = M.rescuePlan(D, { x: 21000, y: 116000, z: -12080 }, { x: 16376, y: 117064, z: -12160 }, { name: 'Bishop1' });
check(p.ok && p.kind === 'walk' && p.steps.length === 1, `same floor, other side of floor 1: one wall-aware walk (${p.kind})`);
// catacomb: inside far (same floor) and from outside
const sac = D.find(d => d.name === 'Necropolis of Sacrifice'), r0 = sac.floors[0].rooms[0], rN = sac.floors[0].rooms[sac.floors[0].rooms.length - 1];
const in1 = { x: r0.center[0], y: r0.center[1], z: r0.center[2] }, in2 = { x: rN.center[0], y: rN.center[1], z: rN.center[2] };
p = M.rescuePlan(D, in1, in2, { name: 'Necro1' });
check(p.ok && p.kind === 'walk' && Math.hypot(in1.x - in2.x, in1.y - in2.y) > 2000, `catacomb inside, far on the same floor (${Math.round(Math.hypot(in1.x - in2.x, in1.y - in2.y))}): walk (${p.kind})`);
p = M.rescuePlan(D, GIRAN, in2, { name: 'Necro1' });
check(p.ok && dos(p) === 'enter:Necropolis of Sacrifice walk', `catacomb from Giran: enterDungeon (town + gatekeeper + walk/Ziggurat) then walk: ${dos(p)}`);
// open world
p = M.rescuePlan(D, { x: -84744, y: 81384, z: -3216 }, { x: -80000, y: 84000, z: -3200 }, { name: 'Destroyer6' });
check(p.ok && p.kind === 'walk', 'open world 5.4k away: walk');
p = M.rescuePlan(D, GIRAN, { x: -84744, y: 81384, z: -3216 }, { name: 'Destroyer6' });
check(p.ok && p.kind === 'travel' && p.steps[0].do === 'travel', `open world 180k away: travel (.town / gatekeeper / walk) — ${p.route}`);
p = M.rescuePlan(D, { x: 0, y: 0, z: -3000 }, { x: 300, y: 200, z: -5200 }, { name: 'X' });
check(!p.ok && /below me and no dungeon floor data/.test(p.why), `teammate 2200 below me where no floor data exists: no walk (old "walk into the floor" bug) — ${p.why}`);
p = M.rescuePlan(D, CR1, GIRAN, { name: 'X' });
check(p.ok && p.kind === 'travel', 'leader on a Cruma floor, teammate in the open world: travel (walkTo leaves by teleport)');
// Tower of Insolence: stairs (walk edges both ways)
const toi = D.find(d => d.name === 'Tower of Insolence');
const t1 = toi.floors[0].enter.landing, t3 = toi.floors[2].enter.landing;
p = M.rescuePlan(D, { x: t1[0], y: t1[1], z: t1[2] }, { x: t3[0], y: t3[1], z: t3[2] }, { name: 'Doombringer1' });
check(p.ok && p.steps.every(s => s.do === 'walk') && /2nd floor.*3rd floor/.test(p.route), `ToI 1st -> 3rd floor: stairs walks only (${p.route})`);
p = M.rescuePlan(D, { x: t3[0], y: t3[1], z: t3[2] }, { x: t1[0], y: t1[1], z: t1[2] }, { name: 'Doombringer1' });
check(p.ok && p.steps.every(s => s.do === 'walk'), `ToI 3rd -> 1st floor: walks down (${p.route})`);
check(M.rescueEtaLeft(M.rescuePlan(D, CR1, CR2, {}), 0, CR1) >= M.rescueEtaLeft(M.rescuePlan(D, CR1, CR2, {}), 2, { x: 17776, y: 108288 }), 'ETA shrinks along the plan');

// ---- 3) running a plan (mock game) ------------------------------------------------------------------------------------------
async function runPlan(plan, o) {
  const W = Object.assign({ pos: Object.assign({}, CR1), log: [], npcFails: 0 }, o);
  const io = {
    stop: () => false, pos: () => W.pos, note: (m) => W.log.push('note:' + m), report: (i, s) => W.log.push('step:' + s.label),
    walk: async (s) => { W.pos = { x: s.x, y: s.y, z: W.pos.z }; return true; },
    npc: async (s) => { if (W.npcFails > 0) { W.npcFails--; return true; } const L = s.npc.name === 'Penelope' ? { z: -9056 } : s.npc.name === 'Capella' ? { z: -11672 } : { z: s.z[0] + 100 }; W.pos = { x: W.pos.x, y: W.pos.y, z: L.z }; return true; },
    town: async () => true, gk: async () => true, enter: async () => true, travel: async () => true,
  };
  const R = {};
  const r = await M.rescueRunPlan(io, plan, R);
  return { r, W, R };
}
(async () => {
  let x = await runPlan(M.rescuePlan(D, CR1, CR2, { name: 'Bishop1' }));
  check(x.r.ok && x.W.pos.z === -9056 && Math.hypot(x.W.pos.x - CR2.x, x.W.pos.y - CR2.y) < 1, `run floor 1 -> 2: arrives next to Bishop1 on floor 2 (z ${x.W.pos.z})`);
  check(x.W.log.filter(l => l.startsWith('step:')).join(' | ') === 'step:to Penelope | step:Penelope -> 2nd floor | step:to Bishop1', 'every step reported in order (intent / note / dungeon.log / ETA)');
  x = await runPlan(M.rescuePlan(D, CR1, CR2, { name: 'Bishop1' }), { npcFails: 1 });
  check(x.r.ok && x.W.log.some(l => /not on 2nd floor after the click .*once more/.test(l)), 'teleporter clicked but still on floor 1 (z check) -> clicked once more -> OK');
  x = await runPlan(M.rescuePlan(D, CR1, CR2, { name: 'Bishop1' }), { npcFails: 2 });
  check(!x.r.ok && /step 2\/3 failed: Penelope -> 2nd floor/.test(x.r.why), `still on floor 1 after 2 clicks -> stops with the reason (${x.r.why})`);

  // ---- 4) escape: hold for the leader / test mode -------------------------------------------------------------------------
  const sk = (Id, Name, o2) => Object.assign({ Id, Name, IsActive: true, IsToggle: false, TargetType: 'ENEMY', AbnormalType: '', AbnormalTime: 0, CastRange: 600, HitTime: 1500, MP: 20, AffectScope: 'SINGLE' }, o2 || {});
  const bishop = [sk(1069, 'Sleep', { AbnormalType: 'SLEEP', AbnormalTime: 30, HitTime: 2500 }), sk(1201, 'Dryad Root', { AbnormalType: 'ROOT_MAGICALLY', AbnormalTime: 30 })];
  function world(o2) {
    const W = Object.assign({ t: 0, hitAt: 0, cc: false, inTown: false, soe: 7, soeResults: ['ok'], townResults: [false, false], leaderNearAt: Infinity, dead: false, hp: 80, log: [], coming: null, mobs: null }, o2);
    const E = { cc: {}, steps: [] };
    const io = {
      now: () => W.t, sleep: async (ms) => { W.t += ms; if (!W.cc && W.t - W.hitAt > 1500 && W.attacking) W.hitAt = W.t; if (W.hpDrop) W.hp = Math.max(1, W.hp - W.hpDrop * ms / 1000); },
      dead: () => W.dead, mp: () => 500, hp: () => W.hp,
      attackers: () => W.mobs ? W.mobs : W.cc ? [{ id: 7, n: 'Catherok', dist: 900, targetsMe: true, hitMe: false, cc: 'sleep' }] : W.attacking ? [{ id: 7, n: 'Catherok', dist: 66, targetsMe: true, hitMe: true, cc: null }] : [],
      lastHitAgo: () => W.t - W.hitAt, ccList: () => M.classifyCC(bishop), ready: () => true,
      castCC: async (k, m) => { W.t += 2500; W.log.push('cc:' + k.name + '@' + m.n); W.cc = true; W.attacking = false; if (W.mobs) W.mobs = W.mobs.map(q => q.id === m.id ? Object.assign({}, q, { cc: 'sleep' }) : q); return 'ok'; },
      fleePlan: async () => ({ label: 'safe spot "corridor"', dist: 960, points: [{ x: 1, y: 1 }] }),
      walkPlan: async () => { W.t += 9000; W.log.push('run'); return 960; },
      inTown: () => W.inTown, town: async () => { W.t += 20000; const r = W.townResults.length ? W.townResults.shift() : false; W.log.push('town:' + r); if (r) W.inTown = true; return r; },
      soeCount: () => W.soe, castSoe: async () => { W.t += 20000; const r = W.soeResults.length ? W.soeResults.shift() : 'failed'; W.log.push('soe:' + r); if (r === 'ok') { W.soe--; W.inTown = true; } return r; },
      selfHeal: async () => { }, leaderNear: () => W.t >= W.leaderNearAt,
      report: (phase, text) => { E.steps.push(phase + ': ' + text); }, rescue: (s) => W.log.push('rescue:' + s),
      rescueComing: () => (W.coming && W.t < W.coming.until ? { by: 'Tank1', text: '1st floor -> Penelope -> 2nd floor -> Bishop1', etaMs: Math.max(0, W.coming.arrive - W.t), phase: 'travel' } : null),
    };
    return { W, E, io };
  }
  // A) the leader is coming (ETA 90 s): CC -> run -> quiet -> HOLD (no .town, no SoE) -> leader arrives -> rescued
  let wd = world({ attacking: true, coming: { until: 1e9, arrive: 120000 }, leaderNearAt: 120000 });
  let r = await M.escapeRun(wd.io, wd.E);
  check(r === 'rescued' && !wd.W.log.some(l => /^(town|soe):/.test(l)) && wd.W.log.includes('rescue:hold'), `leader coming -> holds at the safe spot, no .town / SoE -> ${r} (${wd.W.log.join(' ')})`);
  check(wd.E.steps.some(s => /^hold: leader coming: 1st floor -> Penelope -> 2nd floor -> Bishop1 \(ETA/.test(s)), 'the escape box text says "leader coming: <route> (ETA m:ss)"');
  // B) holding, HP drops below 35 % -> escapes after all (SoE)
  wd = world({ attacking: true, coming: { until: 1e9, arrive: 900000 }, hp: 60, hpDrop: 1 });
  r = await M.escapeRun(wd.io, wd.E);
  check(r === 'soe' && wd.E.steps.some(s => /critical, escaping after all/.test(s)), `holding, HP critical -> Scroll of Escape after all -> ${r}`);
  // C) holding, the leader stops coming (no message for 45 s) -> escapes by himself
  wd = world({ attacking: true, coming: { until: 60000, arrive: 900000 } });
  r = await M.escapeRun(wd.io, wd.E);
  check(r === 'soe' && wd.E.steps.some(s => /stopped coming/.test(s)), `the leader stopped coming -> escapes by itself -> ${r}`);
  // D) HP already critical when the leader says he comes -> no hold
  wd = world({ attacking: true, coming: { until: 1e9, arrive: 60000 }, hp: 20 });
  r = await M.escapeRun(wd.io, wd.E);
  check(r === 'soe' && !wd.W.log.includes('rescue:hold'), `HP 20 % -> no hold, escapes at once -> ${r}`);
  // E) TEST mode: one monster within 900 (not attacking) -> CC on it, run, wait, STOP before .town / SoE
  wd = world({ mobs: [{ id: 9, n: 'Excuro', dist: 640, targetsMe: false, hitMe: false, cc: null }, { id: 10, n: 'Far One', dist: 1400, targetsMe: false, hitMe: false, cc: null }], hitAt: -60000 });
  r = await M.escapeRun(wd.io, wd.E, { test: true });
  check(r === 'test' && wd.W.log.join(' ') === 'cc:Sleep@Excuro run', `TEST: CC on the monster within 900 only, run, wait, stop -> ${r} (${wd.W.log.join(' ')})`);
  check(wd.E.steps.some(s => /^test: TEST done/.test(s)) && !wd.W.log.some(l => /^(town|soe)/.test(l)), 'TEST: no .townname, no Scroll of Escape');
  // F) TEST mode, nothing within 900 -> no CC at all (never pulls a monster), still runs + waits
  wd = world({ mobs: [{ id: 10, n: 'Far One', dist: 1400, targetsMe: false, hitMe: false, cc: null }], hitAt: -60000 });
  r = await M.escapeRun(wd.io, wd.E, { test: true });
  check(r === 'test' && !wd.W.log.some(l => l.startsWith('cc:')) && wd.W.log.includes('run'), `TEST, no monster within 900: no CC, runs, stops -> ${r}`);
  // G) TEST in a town still runs (no instant 'town' end); FULL test goes all the way (.townname)
  wd = world({ inTown: true, hitAt: -60000 });
  r = await M.escapeRun(wd.io, wd.E, { test: true });
  check(r === 'test', `TEST inside a town still runs the phases -> ${r}`);
  wd = world({ attacking: true, townResults: [true] });
  r = await M.escapeRun(wd.io, wd.E, { test: true, full: true });
  check(r === 'town' && wd.W.log.includes('town:true'), `FULL test: goes on to .townname -> ${r}`);
  // H) a test never waits for / holds for the leader
  wd = world({ attacking: true, coming: { until: 1e9, arrive: 60000 }, townResults: [true] });
  r = await M.escapeRun(wd.io, wd.E, { test: true, full: true });
  check(r === 'town' && !wd.W.log.includes('rescue:hold'), 'FULL test ignores "leader coming" (a test never holds for the leader)');

  console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})();
