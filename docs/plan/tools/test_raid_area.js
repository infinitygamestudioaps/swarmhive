// OFFLINE TEST of the RAID FIGHT AREA (user 2026-10-09 10:40: "Under 'Raid clearing' it is clearing a HUGE area before the raid actually
// starts. I want to be able to select the raid 'area' where they should fight."):
//   node docs/plan/tools/test_raid_area.js            (exit code 1 when a check fails; temp copies only, never the live files)
// 1) the RAIDAREA-PURE block of Scripts_dev/swarm.js: the clear rule with / without an area, passive vs aggressive, staging, the tank's
//    pull-into-the-area plan + pacing (with a small chase simulation), the members' clamp into the area
// 2) raidClearArea itself, run in node with mocked host calls (a synthetic boss camp): what gets killed, where the team stages
// 3) the dashboard API (Dashboard/polyedit_api.js kind 'raidarea') on a temp data dir: default item, save, history, 409, validation, remove
// 4) wiring checks: swarm.js uses the rule / hold / clamp / live area; the files parse; no new Map() in the pure block
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

// ---- 1) the pure block -----------------------------------------------------------------------------------------------------
const a = src.indexOf('// RAIDAREA-PURE-BEGIN'), b = src.indexOf('// RAIDAREA-PURE-END');
if (a < 0 || b < a) { console.error('RAIDAREA-PURE block not found'); process.exit(1); }
const PURE = src.slice(a, b);
const M = new Function(PURE + '\nreturn { RAIDAREA, raInPoly, raDistPoly, raidAreaAnchor, raidAreaNorm, raidAreaInClear, raidClearWanted, raidStagePoint, raidAreaHold, raidAreaHoldStep, raidAreaHoldBusy, raidAreaClamp, raidLeashOk, raidLeashBack, raidLeashFocus };')();
check(!/new Map\(/.test(PURE), 'pure block: no new Map() (the L2Swarm world-map host type)');

const BOSS = { x: 10000, y: 20000, z: -3000 };
const sq = (cx, cy, h) => [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]];
// fight area: an 1200 x 1200 square around the boss; stage 1800 south (y +) of the boss
const RAW = { id: 25001, boss: 'Test Boss', fight: sq(BOSS.x, BOSS.y, 600), clear: null, clearMargin: 400, stage: [BOSS.x, BOSS.y + 1800, -3000] };
check(M.raidAreaNorm(null) === null && M.raidAreaNorm({ fight: [[0, 0], [1, 1]] }) === null, 'norm: missing / fewer than 3 points -> no area');
check(M.raidAreaNorm({ ...RAW, enabled: false }) === null, 'norm: switched off on the dashboard -> no area (defaults)');
const A = M.raidAreaNorm(RAW);
check(A && A.fight.length === 4 && A.margin === 400 && A.stage[1] === BOSS.y + 1800 && !A.clear, 'norm: fight, margin, stage');
check(M.raidAreaNorm({ ...RAW, fight: RAW.fight.map(p => ({ x: p[0], y: p[1] })), clearMargin: undefined }).margin === 600, 'norm: {x,y} points, default margin 600');

const ctxA = { area: A, boss: BOSS, stage: { x: A.stage[0], y: A.stage[1] }, defaultR: 1200 };
const ctx0 = { area: null, boss: BOSS, stage: { x: BOSS.x, y: BOSS.y + 1500 }, defaultR: 1200 };
const mob = (dx, dy, o = {}) => ({ x: BOSS.x + dx, y: BOSS.y + dy, dm: o.dm != null ? o.dm : 1500, aggro: !!o.aggro, ar: o.ar || (o.aggro ? 300 : 0), hitsUs: !!o.hitsUs });
// with an area
check(M.raidClearWanted(mob(300, 0, { aggro: true }), ctxA) === 'aggr', 'area: aggressive inside the fight area -> cleared');
check(M.raidClearWanted(mob(900, 0, { aggro: true }), ctxA) === 'aggr', 'area: aggressive in the margin (fight + 400) -> cleared');
check(M.raidClearWanted(mob(1300, 0, { aggro: true }), ctxA) === '', 'area: aggressive OUTSIDE the clear area -> left alone (the old rule cleared it: 1300 < 2000)');
check(M.raidClearWanted(mob(300, 0), ctxA) === 'passive', 'area: passive inside the fight area -> cleared (it would get hit and join)');
check(M.raidClearWanted(mob(900, -200), ctxA) === '', 'area: passive in the margin, off the way in -> left alone');
check(M.raidClearWanted(mob(900, -200), { ...ctxA, area: { ...A, passive: true } }) === 'passive', 'area + "also passive": passive in the clear area -> cleared');
check(M.raidClearWanted(mob(150, 900), ctxA) === 'passive', 'area: passive on the stage -> boss path -> cleared');
check(M.raidClearWanted(mob(3000, 0, { hitsUs: true, dm: 300 }), ctxA) === 'attacker', 'area: a monster hitting us -> killed wherever it is (it is on us)');
check(M.raidClearWanted(mob(3000, 0, { hitsUs: true, dm: 2500 }), ctxA) === '', 'area: hitting a teammate 2500 away from me -> not chased (never walk out of the area)');
check(M.raidClearWanted(mob(400, 2000, { aggro: true, ar: 300, dm: 300 }), ctxA) === 'aggr', 'area: aggressive next to the stage (within its aggro range) -> cleared (it would come anyway)');
const own = M.raidAreaNorm({ ...RAW, clear: sq(BOSS.x + 600, BOSS.y, 1000) });
check(M.raidClearWanted(mob(1500, 0, { aggro: true }), { ...ctxA, area: own }) === 'aggr' && M.raidClearWanted(mob(-900, 0, { aggro: true }), { ...ctxA, area: own }) === '', 'own clear outline wins over the margin');
// without an area
check(M.raidClearWanted(mob(1100, 0, { aggro: true }), ctx0) === 'aggr', 'no area: aggressive 1100 from the boss -> cleared');
check(M.raidClearWanted(mob(1600, -600, { aggro: true }), ctx0) === '', 'no area: aggressive 1700 from the boss, off the path -> left alone (old rule: within 2000 = cleared)');
check(M.raidClearWanted(mob(100, 1300, { aggro: true, dm: 300 }), ctx0) === 'aggr', 'no area: aggressive on the way in (path, 1300 from the boss) -> cleared');
check(M.raidClearWanted(mob(1500, 2600, { aggro: true, dm: 1600 }), ctx0) === '', 'no area: aggressive behind the stage, off the path, not near me -> left alone');
check(M.raidClearWanted(mob(300, 0), ctx0) === 'passive', 'no area: passive right at the boss -> cleared');
check(M.raidClearWanted(mob(900, -300), ctx0) === '', 'no area: passive 950 from the boss, off the path -> left alone');
check(M.raidClearWanted(mob(100, 1000), ctx0) === 'passive', 'no area: passive on the path near the boss -> cleared');
// a synthetic boss camp: how much is cleared
const camp = [];
for (let r = 300; r <= 2600; r += 230) for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4 + r / 1000; camp.push({ dx: Math.round(r * Math.cos(ang)), dy: Math.round(r * Math.sin(ang)), aggro: (k + Math.round(r / 230)) % 3 === 0 }); }
const oldRule = (m) => { const db = Math.hypot(m.dx, m.dy), dm = Math.hypot(m.dx, m.dy - 1500); const passive = !m.aggro; if (passive && dm > 400 && db > 400) return false; return db < 2000 || dm < 1200; };
const cnt = (ctx, me) => camp.filter(m => M.raidClearWanted({ x: BOSS.x + m.dx, y: BOSS.y + m.dy, dm: Math.hypot(m.dx - me[0], m.dy - me[1]), aggro: m.aggro, ar: m.aggro ? 300 : 0 }, ctx)).length;
const nOld = camp.filter(oldRule).length, nDef = cnt(ctx0, [0, 1500]), nArea = cnt(ctxA, [0, 1800]);
console.log(`     camp of ${camp.length} monsters (${camp.filter(m => m.aggro).length} aggressive): old rule clears ${nOld}, new default ${nDef}, with the fight area ${nArea}`);
check(nDef < nOld && nArea < nOld, 'camp: the new default and the fight area clear fewer monsters than the old 2000 rule');
// staging
let st = M.raidStagePoint(A, BOSS, { x: 0, y: 0 }, 1500);
check(st.set && st.x === BOSS.x && st.y === BOSS.y + 1800 && st.z === -3000, 'stage: the area\'s stage point');
st = M.raidStagePoint(null, BOSS, { x: BOSS.x, y: BOSS.y + 6000 }, 1500);
check(!st.set && st.x === BOSS.x && st.y === BOSS.y + 1500, 'stage: no area -> 1500 from the boss toward me (the old way)');
st = M.raidStagePoint(M.raidAreaNorm({ ...RAW, stage: null }), BOSS, { x: BOSS.x + 800, y: BOSS.y }, 1500);
check(!st.set && st.x === BOSS.x + 800, 'stage: area without a stage, me already closer than 1500 -> stay where I am');
// pull into the area
check(M.raidAreaHold({ area: A, boss: BOSS, aggro: false }).act === 'none', 'hold: no aggro yet -> nothing (the pull comes first)');
check(M.raidAreaHold({ area: null, boss: BOSS, aggro: true }).act === 'none', 'hold: no area -> nothing (fight where it stands)');
check(M.raidAreaHold({ area: A, boss: { x: BOSS.x + 200, y: BOSS.y }, aggro: true }).act === 'hold', 'hold: boss inside -> hold');
check(M.raidAreaHold({ area: A, boss: { x: BOSS.x + 700, y: BOSS.y }, aggro: true }).act === 'hold', 'hold: boss 100 outside (tolerance 150) -> hold');
let h = M.raidAreaHold({ area: A, boss: { x: BOSS.x + 1500, y: BOSS.y + 100 }, aggro: true });
check(h.act === 'reposition' && M.raInPoly(h.to.x, h.to.y, A.fight) && M.raDistPoly(h.to.x, h.to.y, A.fight) >= 400 && h.out === 900, `hold: boss 900 outside -> the tank walks to ${h.to.x - BOSS.x},${h.to.y - BOSS.y} (inside, ${Math.round(M.raDistPoly(h.to.x, h.to.y, A.fight))} from the edge)`);
const U = M.raidAreaNorm({ fight: [[0, 0], [3000, 0], [3000, 3000], [2000, 3000], [2000, 1000], [1000, 1000], [1000, 3000], [0, 3000]] });   // a U: centroid in the gap
const anc = M.raidAreaAnchor(U.fight);
check(M.raInPoly(anc.x, anc.y, U.fight), `anchor of a concave (U) area lies inside (${Math.round(anc.x)},${Math.round(anc.y)})`);
h = M.raidAreaHold({ area: U, boss: { x: 1500, y: 2500 }, aggro: true });
check(h.act === 'reposition' && M.raInPoly(h.to.x, h.to.y, U.fight), 'U area: boss in the gap -> a spot inside the U');
// pacing
const S1 = { since: 0, last: 0, moves: 0, gaveUp: false }, rp = { act: 'reposition', to: { x: 0, y: 0 } };
check(M.raidAreaHoldStep(S1, rp, 100000) === true && M.raidAreaHoldStep(S1, rp, 101000) === false && M.raidAreaHoldStep(S1, rp, 103600) === true, 'pacing: walk, wait 3.5 s, walk again');
M.raidAreaHoldStep(S1, { act: 'hold' }, 104000);
check(S1.since === 0 && M.raidAreaHoldStep(S1, rp, 108000) === true, 'pacing: the boss back inside resets the give-up clock');
for (let t = 108000; t <= 160000; t += 500) M.raidAreaHoldStep(S1, rp, t);
check(S1.gaveUp && M.raidAreaHoldStep(S1, rp, 170000) === false, 'pacing: gives up after 45 s outside (fight where it is)');
// chase simulation: boss at its spawn 1400 east of a fight area; the tank pulls; the boss follows the tank (speed 140/s, melee 60)
{
  const F = M.raidAreaNorm({ fight: sq(0, 0, 700) }), boss = { x: 2100, y: 0 }, tank = { x: 2050, y: 0 }, S2 = { since: 0, last: 0, moves: 0, gaveUp: false };
  let goal = null, inside = -1;
  for (let t = 0; t <= 60000; t += 250) {
    const p = M.raidAreaHold({ area: F, boss, aggro: true });
    if (p.act === 'hold' && inside < 0) inside = t;
    M.raidAreaHoldStep(S2, p, t);
    goal = M.raidAreaHoldBusy(S2, tank, t) ? S2.goal : null;   // the tank walks while busy, then attacks (stands next to the boss)
    if (goal) { const d = Math.hypot(goal.x - tank.x, goal.y - tank.y), s = Math.min(d, 150 * 0.25); if (d) { tank.x += (goal.x - tank.x) / d * s; tank.y += (goal.y - tank.y) / d * s; } }
    const db = Math.hypot(tank.x - boss.x, tank.y - boss.y); if (db > 60) { const s = Math.min(db - 60, 140 * 0.25); boss.x += (tank.x - boss.x) / db * s; boss.y += (tank.y - boss.y) / db * s; }
  }
  check(inside > 0 && inside < 20000 && M.raInPoly(boss.x, boss.y, F.fight) && M.raDistPoly(boss.x, boss.y, F.fight) > 200 && !S2.gaveUp, `chase: the boss is pulled into the area in ${(inside / 1000).toFixed(1)} s and stays (tank moves ${S2.moves})`);
}
// members: clamp
let c = M.raidAreaClamp(A, BOSS.x + 100, BOSS.y);
check(!c.moved && c.x === BOSS.x + 100, 'clamp: a spot inside stays');
c = M.raidAreaClamp(A, BOSS.x, BOSS.y + 1400);
check(c.moved && M.raInPoly(c.x, c.y, A.fight) && Math.abs(c.y - (BOSS.y + 540)) <= 2, `clamp: caster spot 800 outside -> the edge facing the boss, 60 inside (${c.x - BOSS.x},${c.y - BOSS.y})`);
check(M.raidAreaClamp(null, 5, 6).x === 5, 'clamp: no area -> unchanged');

// ---- 2) raidClearArea in node with mocks ----------------------------------------------------------------------------------
const fa = src.indexOf('async function raidClearArea(b, runId) {'), fb = src.indexOf('function raidCursed(b) {');
const FN = src.slice(fa, fb);
function runClear(area, mobs, start) {
  let clock = 1e9; const calls = { walks: [], killed: [], said: [], events: [], emits: [] };
  const Me = { X: start[0], Y: start[1], Z: -3000, IsDead: false, Name: 'Lead' };
  const live = mobs.map((m, i) => ({ objId: 1000 + i, Name: m.name || ('Mob' + i), Title: m.title || '', X: BOSS.x + m.dx, Y: BOSS.y + m.dy, Z: -3000, IsDead: false, aggro: !!m.aggro }));
  live.forEach(m => { m.ref = m; });
  const g = {
    CONFIG: { mission: { clearRadius: 1200, clearMaxMs: 480000, stageDist: 1500 } }, RAIDAREA: M.RAIDAREA, raidStagePoint: M.raidStagePoint, raidClearWanted: M.raidClearWanted,
    raidAreaOf: () => area, now: () => clock, sleep: async (ms) => { clock += ms; }, raidCursed: () => false, minionNames: () => ['Guard of Boss'], ownMinionName: () => false,
    findMobByName: (n) => n === 'Test Boss' ? { X: BOSS.x, Y: BOSS.y, Z: BOSS.z, IsDead: false } : null,
    leadTeamWalk: async (x, y, z, d) => { calls.walks.push([Math.round(x), Math.round(y), d]); const L = Math.hypot(x - Me.X, y - Me.Y), k = L > d ? (L - d) / L : 0; Me.X += (x - Me.X) * k; Me.Y += (y - Me.Y) * k; return true; },
    regroupAlive: () => true, note: () => { }, raidEvent: (t) => calls.events.push(t), File: { ReadAllText: () => { throw new Error('none'); } }, SWARM_ROOT: 'X',
    state: { mode: 'idle' }, stopCombatG: () => { }, App: { emit: (k, d) => calls.emits.push([k, d]) }, SayToParty: (t) => calls.said.push(t),
    raidClearLive: { on: false, left: [], killed: 0 }, clearWatch: { boss: '', minions: [], hitAt: 0 }, lastAttackerOnMe: { id: 0, at: 0 }, inst: { attackers: {} },
    mobById: (id) => live.find(m => m.objId === id) || null, snapMobs: () => live.filter(m => !m.IsDead), meSnap: () => Me, Me, ignoredMob: () => false,
    aggroRange: (name) => live.some(m => m.Name === name && m.aggro) ? 300 : 0, setTask: () => { }, Target: null, Send: { Action: () => { } },
    srvAttack: (id) => { const m = live.find(x => x.objId === id); if (m && !m.IsDead) { m.IsDead = true; calls.killed.push(m.Name); } }, enableShots: () => { }, num: Number,
  };
  const f = new Function(...Object.keys(g), FN + '\nreturn raidClearArea;')(...Object.values(g));
  return f({ id: 25001, name: 'Test Boss', x: BOSS.x, y: BOSS.y, z: BOSS.z }, 'run').then(r => ({ r, calls, Me, live, rcl: g.raidClearLive, mode: g.state.mode }));
}
const CAMP = [
  { name: 'Orc A', dx: 300, dy: 100, aggro: true },        // inside the fight area
  { name: 'Orc B', dx: 900, dy: 0, aggro: true },          // fight + margin (400)
  { name: 'Orc C', dx: 1600, dy: -500, aggro: true },      // 1680 from the boss, off the path: the old rule (2000) killed it
  { name: 'Deer D', dx: 200, dy: -200 },                   // passive inside the fight area
  { name: 'Deer E', dx: -900, dy: -300 },                  // passive, 950 from the boss, off the path
  { name: 'Deer F', dx: -1500, dy: 0 },                    // passive far away
  { name: 'Guard of Boss', dx: 100, dy: 50, aggro: true }, // minion: never cleared
];
(async () => {
  const r1 = await runClear(null, CAMP, [BOSS.x, BOSS.y + 6000]);
  check(r1.r === true && r1.calls.walks.length === 1 && r1.calls.walks[0][1] === BOSS.y && r1.calls.walks[0][2] === 1500, `no area: the team walks to 1500 from the boss (walk ${JSON.stringify(r1.calls.walks[0])})`);
  check(JSON.stringify(r1.calls.killed.sort()) === JSON.stringify(['Deer D', 'Orc A', 'Orc B']), `no area: killed ${r1.calls.killed.join(', ')} (aggressive within 1200 + the passive one at the boss; Orc C, Deer E/F and the minion left)`);
  check(r1.calls.events.some(e => /CLEAR: aggressive monsters within 1200/.test(e)) && r1.calls.said.some(t => /aggressive monsters around/.test(t)), 'no area: party chat + raid event say "aggressive monsters within 1200"');
  check(r1.mode === 'idle' && r1.rcl.on === false, 'no area: raid mode back to idle, live clear flag off');
  const r2 = await runClear(A, CAMP, [BOSS.x, BOSS.y + 6000]);
  check(r2.calls.walks.length === 1 && r2.calls.walks[0][0] === A.stage[0] && r2.calls.walks[0][1] === A.stage[1] && r2.calls.walks[0][2] === 250, `area: the team walks to the area's stage point (walk ${JSON.stringify(r2.calls.walks[0])})`);
  check(JSON.stringify(r2.calls.killed.sort()) === JSON.stringify(['Deer D', 'Orc A', 'Orc B']), `area: killed ${r2.calls.killed.join(', ')} (inside the clear area only; Orc C outside it left alone)`);
  check(r2.calls.events.some(e => /CLEAR: the clear area of Test Boss's fight area \(fight area \+ 400\)/.test(e)), 'area: raid event names the clear area');
  const r3 = await runClear(M.raidAreaNorm({ ...RAW, clearPassive: true, clearMargin: 800 }), CAMP, [A.stage[0], A.stage[1]]);
  check(r3.calls.walks.length === 0 && r3.calls.killed.includes('Deer E') && !r3.calls.killed.includes('Orc C') && !r3.calls.killed.includes('Deer F'), `area + also passive + margin 800, already at the stage (no walk): killed ${r3.calls.killed.join(', ')}`);
  const camp2 = CAMP.concat([{ name: 'Wolf G', dx: 2600, dy: 2600, title: 'LvL: 30 A' }]);   // L2Toggle title tag says aggressive
  const r4 = await runClear(A, camp2, [A.stage[0], A.stage[1]]);
  check(!r4.calls.killed.includes('Wolf G'), 'area: an aggressive (title tag) monster far outside the clear area is left alone');

  // ---- 3) the dashboard API on a temp data dir ----------------------------------------------------------------------------
  const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'raidarea_test_'));
  const LIVE = path.join(ROOT, 'Scripts', 'data');
  const PE = require(path.join(ROOT, 'Dashboard', 'polyedit_api.js'))({ DATA: SB, REF: LIVE, ROOT, LOGS: SB, SETTINGS: SB, TOOLS: path.join(ROOT, 'docs', 'plan', 'tools'), noJobs: true });
  const q = (s) => new URLSearchParams(s);
  let g1 = PE.handle('GET', q('kind=raidarea&id=25001'));
  check(g1.code === 200 && g1.body.item.isNew && g1.body.item.poly.length === 12 && g1.body.item.name === 'Greyclaw Kutus' && g1.body.orig === false, 'API: no area yet -> a 900 circle around the spawn, not saved');
  check(g1.body.context.raid && g1.body.context.raid.minions.length === 2 && Array.isArray(g1.body.context.raid.defaultStage) && g1.body.context.spawns.length > 0, 'API: context has the boss, minions, default stage, spawns');
  check(PE.handle('GET', q('kind=raidarea&id=1')).code === 404, 'API: unknown boss id -> 404');
  const it = g1.body.item, bz = it.boss;
  it.stage = [bz.x, bz.y + 1600, bz.z];
  let p1 = PE.handle('POST', q('kind=raidarea&id=25001'), { rev: g1.body.rev, item: it });
  const file = path.join(SB, 'raid_areas.json');
  check(p1.code === 200 && p1.body.ok && fs.existsSync(file), 'API: first save creates Scripts/data/raid_areas.json');
  let j = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(j.areas['25001'] && j.areas['25001'].fight.length === 12 && j.areas['25001'].stage[1] === bz.y + 1600 && j.areas['25001'].manual === true && j.about, 'API: entry has fight, stage, manual mark, the file has "about"');
  check(M.raidAreaNorm(j.areas['25001']) !== null, 'the saved entry is readable by swarm.js (raidAreaNorm)');
  // clear layer edit: item.poly = clear, fightPoly = fight
  const it2 = p1.body.item; const F0 = it2.poly;
  const lay = { ...it2, layer: 'clear', fightPoly: F0, poly: F0.map(p => [Math.round(bz.x + (p[0] - bz.x) * 1.8), Math.round(bz.y + (p[1] - bz.y) * 1.8)]), clearPoly: null };
  let p2 = PE.handle('POST', q('kind=raidarea&id=25001'), { rev: p1.body.rev, item: lay });
  j = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(p2.code === 200 && j.areas['25001'].clear && j.areas['25001'].clear.length === 12 && JSON.stringify(j.areas['25001'].fight) === JSON.stringify(F0), 'API: saving from the clear layer keeps the fight area and stores the clear outline');
  check(fs.readdirSync(path.join(SB, 'history')).filter(f => f.startsWith('raid_areas_')).length >= 1, 'API: history copy in Scripts/data/history/');
  check(PE.handle('POST', q('kind=raidarea&id=25001'), { rev: p1.body.rev, item: it2 }).code === 409, 'API: stale rev -> 409 conflict');
  const bad = { ...p2.body.item, poly: [[0, 0], [1000, 1000], [1000, 0], [0, 1000]] };
  let p3 = PE.handle('POST', q('kind=raidarea&id=25001'), { rev: p2.body.rev, item: bad });
  check(p3.code === 400 && /crosses itself/.test(p3.body.error), 'API: a self-crossing outline is refused');
  const far = { ...p2.body.item, stage: [bz.x + 5000, bz.y, bz.z] };
  let p4 = PE.handle('POST', q('kind=raidarea&id=25001'), { rev: p2.body.rev, item: far });
  check(p4.code === 400 && /stage/.test(p4.body.error), 'API: a stage 5000 from the boss is refused (the leader must see the boss)');
  const off = { ...p2.body.item, poly: p2.body.item.poly.map(p => [p[0] + 3000, p[1]]) };
  let p5 = PE.handle('POST', q('kind=raidarea&id=25001'), { rev: p2.body.rev, item: off });
  check(p5.code === 200 && p5.body.warnings.some(w => /boss spawn is .* outside the fight area/.test(w)), 'API: a fight area away from the spawn saves with a warning');
  // STAY INSIDE + FIT TO SAFE GROUND (2026-10-14)
  { const st = { ...p5.body.item, stay: true };
    const ps = PE.handle('POST', q('kind=raidarea&id=25001'), { rev: p5.body.rev, item: st });
    const jj = JSON.parse(fs.readFileSync(file, 'utf8'));
    check(ps.code === 200 && jj.areas['25001'].stay === true && ps.body.item.stay === true && (ps.body.changed || []).includes('stay') && M.raidAreaNorm(jj.areas['25001']).stay === true, 'API: "Stay inside" is saved and read by swarm.js');
    p5.body.rev = ps.body.rev; p5.body.item = ps.body.item;
    const fr = PE.handle('POST', q('action=fit&kind=raidarea&id=25001'), { r: 900 });
    const n1 = JSON.parse(fs.readFileSync(file, 'utf8'));
    check(fr.code === 200 && fr.body.ok && fr.body.poly.length >= 3 && fr.body.poly.length <= 40 && fr.body.cuts && JSON.stringify(n1) === JSON.stringify(jj), 'API: "Fit to safe ground" returns an outline (<= 40 points, cuts per reason) and saves nothing', JSON.stringify(fr.body.cuts || fr.body.error));
    const bz2 = p5.body.item.boss, far = fr.body.ok ? Math.max(...fr.body.poly.map(p => Math.hypot(p[0] - bz2.x, p[1] - bz2.y))) : 0;
    check(far <= 905, 'fit: no point beyond the radius', String(Math.round(far)));
    const RF = require(path.join(ROOT, 'Dashboard', 'raidfit.js'));
    const cl = RF.fitSafeGround(ROOT, { x: 124240, y: 75376, z: -2800, r: 900 });   // Retreat Spider Cletu (owner's screenshot): a hill
    check(cl.ok && cl.cuts.cliff > 0, 'fit: Retreat Spider Cletu (a hill) is cut back at cliff edges', JSON.stringify(cl.cuts));
  }
  const L1 = PE.handle('GET', q('list=raidarea'));
  check(L1.code === 200 && L1.body.raidarea.length === 1 && L1.body.raidarea[0].id === '25001' && L1.body.raidarea[0].clear === true, 'API: list=raidarea (dashboard badge "area set")');
  const before = fs.readFileSync(file, 'utf8');
  check(PE.handle('POST', q('kind=raidarea&id=25001'), { rev: 'nope', item: bad }).code === 409 && fs.readFileSync(file, 'utf8') === before, 'API: refused saves leave the file untouched');
  let p6 = PE.handle('POST', q('action=reset&kind=raidarea&id=25001'), { rev: p5.body.rev });
  j = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(p6.code === 200 && !j.areas['25001'] && p6.body.item.isNew, 'API: "Remove this fight area" deletes the entry (the bots use the defaults)');
  check(PE.handle('POST', q('action=reset&kind=raidarea&id=25001'), { rev: p6.body.rev }).code === 400, 'API: removing again -> 400 nothing to remove');

  // ---- 4) wiring ------------------------------------------------------------------------------------------------------------
  check(/raidClearWanted\(\{ x: m\.X, y: m\.Y, dm, aggro/.test(FN) && /const A = raidAreaOf\(b\)/.test(FN), 'swarm.js: raidClearArea uses raidAreaOf + raidClearWanted');
  check(/raidAreaHold\(\{ area: raA, boss: \{ x: boss\.X/.test(src) && /raidAreaHoldStep\(raHold, hp, now\(\)\)/.test(src), 'swarm.js: raidSK pulls / holds the boss in the area');
  check(/raidAreaClamp\(raA, x, y\)/.test(src) && (src.match(/raClampXY\(/g) || []).length >= 4, 'swarm.js: raid spacing + dealers clamp their spots into the area');
  check(/area: raidLiveArea\(rcl\)/.test(src) && /Raid clearing: \$\{raidClearLive\.left\.length\} left inside/.test(src), 'swarm.js: raid_live.json shows the clear phase with monsters left');
  check(/clearRadius: 1200,/.test(src), 'swarm.js: CONFIG.mission.clearRadius 1200 (was 2000)');
  check(!/\x08/.test(src), 'swarm.js: no raw backspace characters');
  check(!/new Map\(/.test(src.slice(src.indexOf('// RAID FIGHT AREA loader'), src.indexOf('// RAID START (user 2026-10-05'))), 'swarm.js: loader without new Map()');
  // STAY INSIDE (owner 2026-10-14): a leash - nobody leaves, nobody chases
  { const sq = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]];
    const A = M.raidAreaNorm({ fight: sq, stay: true }), A0 = M.raidAreaNorm({ fight: sq });
    check(A.stay === true && A0.stay === false, 'stay: switched on per area (default off)');
    check(M.raidLeashOk(A, 500, 500, 'melee') && M.raidLeashOk(A, 1060, 500, 'melee') && !M.raidLeashOk(A, 1200, 500, 'melee'), 'stay: melee only on targets inside / within 80 of the edge');
    check(M.raidLeashOk(A, 1450, 500, 'caster', 600) && !M.raidLeashOk(A, 1600, 500, 'caster', 600), 'stay: casters hit what their reach covers from inside (600 - 80)');
    check(M.raidLeashOk(A, 1500, 500, 'tank') && !M.raidLeashOk(A, 1700, 500, 'tank'), 'stay: the tank takes a loose one only within Aggression reach of the edge');
    check(M.raidLeashOk(A0, 5000, 5000, 'melee') && M.raidLeashBack(A0, 5000, 5000) === null, 'no stay = old behaviour (anything, anywhere)');
    const bk = M.raidLeashBack(A, 1300, 500);
    check(bk && M.raInPoly(bk.x, bk.y, sq) && M.raidLeashBack(A, 1030, 500) === null && M.raidLeashBack(A, 500, 500) === null, 'stay: outside -> a point just inside; on the edge (40) / inside -> stay');
    const f = M.raidLeashFocus(A, [{ x: 1400, y: 500, n: 'edge' }, { x: 3000, y: 500, n: 'far' }, { x: 500, y: 500, n: 'in' }]);
    check(f.map(m => m.n).join() === 'in,edge', 'stay: the focus never picks a minion outside; the ones inside first', f.map(m => m.n).join());
    check(src.includes('if (RA && RA.stay) { const pos = minsAll') && src.includes('raidLeashOk(RA, num(tgt.X)') && src.includes('raidLeashBack(A, num(Me.X), num(Me.Y))') && src.includes('not chasing'), 'swarm.js: leader focus, dealer target, the 600 ms leash and the tank use it');
  }
  console.log(`\n${n - fails}/${n} checks ok${fails ? ` — ${fails} FAILED` : ''}`);
  try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
