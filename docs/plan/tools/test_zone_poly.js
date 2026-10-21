// OFFLINE TEST of ZONEPOLY (public tester 2026-10-13 21:52, v1.6.4): a custom zone DRAWN as a polygon on the dashboard Zones tab
// ("Abandoned Camp Commanders 1", 8 points round one fenced camp) must be hunted as THAT polygon — no square, no zoneScale — and an EMPTY one
// must be held inside (gather, rest, wait for respawns), never a walk out of it.
//   node docs/plan/tools/test_zone_poly.js
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_SRC || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
const piece = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); if (i < 0 || j < 0) { console.log('FAIL block not found: ' + a); process.exit(1); } return src.slice(i, j); };
let fails = 0; const ok = (c, w) => { console.log((c ? 'ok   ' : 'FAIL ') + w); if (!c) fails++; };

// ---- the pure block ----
const pure = piece('// ZONEPOLY-PURE-BEGIN', '// ZONEPOLY-PURE-END');
const Z = new Function(pure + '\nreturn { ZONEPOLY, zonePolyOf, zonePolyInner, zoneEmptyDecide, zoneNextRespawn, zoneHoldText, zoneHoldRest, zpNear, zpIn, zpPts };')();
// the tester's shape: an 8-point polygon (~1400 wide) round one fenced camp
const C = { x: -50800, y: 145200 };
const OCT = Array.from({ length: 8 }, (_, k) => ({ x: Math.round(C.x + Math.cos(k * Math.PI / 4) * 700), y: Math.round(C.y + Math.sin(k * Math.PI / 4) * 700) }));
const zone = { name: 'Abandoned Camp Commanders 1', x: C.x, y: C.y, z: -3100, radius: 700, levelMin: 18, levelMax: 30, poly: OCT, zmap: 'zones\\Abandoned_Camp_Commanders_1.zmap', enabled: true };

ok(Z.zonePolyOf({ poly: OCT, custom: true }) === OCT, 'a drawn custom zone spot is recognised');
ok(Z.zonePolyOf({ poly: OCT, room: { id: 'r1' } }) === null && Z.zonePolyOf({ poly: OCT, area: { id: 'a1' } }) === null, 'dungeon rooms / field areas keep their own code');
ok(Z.zonePolyOf({ center: C, radius: 3000 }) === null, 'a plain (square) zone is not a drawn zone');
// concave L-shape: the corner average lies OUTSIDE it
const L = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 600 }, { x: 600, y: 600 }, { x: 600, y: 3000 }, { x: 0, y: 3000 }];
const avg = { x: L.reduce((t, p) => t + p.x, 0) / L.length, y: L.reduce((t, p) => t + p.y, 0) / L.length };
ok(!Z.zpIn(avg.x, avg.y, L), '(setup) the L-shape corner average lies outside the L');
const inL = Z.zonePolyInner(L);
ok(Z.zpIn(inL.x, inL.y, L), `zonePolyInner: a point INSIDE a concave area (${inL.x},${inL.y}), not its outside corner average`);
const inO = Z.zonePolyInner(OCT);
ok(Math.hypot(inO.x - C.x, inO.y - C.y) < 5, 'zonePolyInner: a convex area -> its centre');
const hole = [{ x: C.x - 200, y: C.y - 200 }, { x: C.x + 200, y: C.y - 200 }, { x: C.x + 200, y: C.y + 200 }, { x: C.x - 200, y: C.y + 200 }];
const inH = Z.zonePolyInner(OCT, [hole]);
ok(Z.zpIn(inH.x, inH.y, Z.zpPts(OCT)) && !Z.zpIn(inH.x, inH.y, hole), 'zonePolyInner: never inside an exclusion hole');

// empty zone decisions
let d = Z.zoneEmptyDecide({ poly: OCT, me: { x: C.x + 300, y: C.y - 200 } });
ok(d.act === 'hold' && d.to.x === C.x + 300, 'empty zone, leader inside: HOLD where he stands (no move, no random walk)');
d = Z.zoneEmptyDecide({ poly: OCT, me: { x: C.x + 720, y: C.y } });
ok(d.act === 'hold', 'empty zone, leader on the edge (< 60 outside): hold');
d = Z.zoneEmptyDecide({ poly: OCT, me: { x: C.x + 2500, y: C.y } });
ok(d.act === 'walkIn' && Z.zpIn(d.to.x, d.to.y, Z.zpPts(OCT)), 'leader outside the area: walk back INSIDE it');
d = Z.zoneEmptyDecide({ poly: L, me: { x: 5000, y: 5000 } });
ok(d.act === 'walkIn' && Z.zpIn(d.to.x, d.to.y, L), 'concave area: the walk-in point is inside (not the outside corner average)');

// respawn knowledge
const T = 1e9;
ok(Z.zoneNextRespawn([], 60, T) === null, 'no kill seen: respawn unknown');
let n = Z.zoneNextRespawn([T - 20000, T - 50000], 60, T);
ok(n && Math.abs(n.ms - 10000) < 1 && n.count === 2, 'kills 20 s / 50 s ago, respawn 60 s: next in ~10 s');
n = Z.zoneNextRespawn([T - 200000], 60, T);
ok(n && n.overdue, 'kills long ago: respawn overdue');
let tx = Z.zoneHoldText('Abandoned Camp Commanders 1', 200000, { ms: 40000, count: 1 });
ok(/^waiting for respawns in Abandoned Camp Commanders 1 — 0 monsters, next expected in ~40 s/.test(tx) && /3 min/.test(tx), 'live line: "waiting for respawns in <zone> — 0 monsters, next expected in ~40 s (waiting 3 min ...)"');
tx = Z.zoneHoldText('X', 5000, null);
ok(/respawn time unknown/.test(tx), 'live line without kills: respawn time unknown');

// members' rest during a hold
ok(Z.zoneHoldRest({ hold: true, sitting: false, hp: 80, mp: 100 }) === 'sit', 'member at 80 % HP during a hold: sit');
ok(Z.zoneHoldRest({ hold: true, sitting: false, hp: 100, mp: 60 }) === 'sit', 'member at 60 % MP during a hold: sit');
ok(Z.zoneHoldRest({ hold: true, sitting: false, hp: 99, mp: 95 }) === '', 'fresh member during a hold: nothing');
ok(Z.zoneHoldRest({ hold: true, sitting: true, byHold: true, hp: 98, mp: 95 }) === 'stand', 'hold-rested member fresh again: stand');
ok(Z.zoneHoldRest({ hold: false, sitting: true, byHold: true, hp: 70, mp: 50 }) === 'stand', 'hold ended (a monster respawned inside): the member stands up at once');
ok(Z.zoneHoldRest({ hold: false, sitting: true, byHold: false, hp: 30, mp: 50 }) === '', 'a normal low-HP rest is not touched by the hold');

// ---- zoneSpot: a drawn zone is not scaled, not split ----
const zs = piece('function zoneSpot(z, level, why) {', '\n}\n') + '\n}';
const envZ = { roomSpot: () => null, zoneDungeonOf: () => '', dungeonRooms: () => [], zoneAreaSpot: () => { throw new Error('a drawn zone must not become field areas'); },
  zoneSubAreas: () => ({ radius: 1500, areas: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }), areaTaken: () => '', zoneShared: () => [], spotBlock: () => '', num: Number,
  autoLvl: { spot: null }, zonePolyInner: Z.zonePolyInner };
const zoneSpot = new Function(...Object.keys(envZ), zs + '\nreturn zoneSpot;')(...Object.values(envZ));
const sp = zoneSpot(zone, 22, []);
ok(sp && sp.noScale === true && sp.drawn === true && sp.poly === OCT, 'zoneSpot: drawn zone -> noScale + drawn + its polygon');
ok(sp && !sp.whole && !sp.subKey && sp.name === zone.name, 'zoneSpot: a drawn zone is never split into square sub-areas');
ok(sp && sp.inner && Math.hypot(sp.inner.x - C.x, sp.inner.y - C.y) < 5, 'zoneSpot: carries a point well inside (members walk back to it)');
const plain = zoneSpot({ name: 'plain', x: 0, y: 0, z: 0, radius: 3000, levelMin: 1, levelMax: 80, waypoints: [{ x: 1, y: 1 }] }, 22, []);
ok(plain && !plain.noScale, 'zoneSpot: a plain square zone still scales (unchanged)');
// the autolevel radius formula honours noScale -> the drawn zone's hunting circle is its own radius (700), not 700 x 3
ok(/radius = \(autoLvl\.spot\.radius \|\| 3000\) \* \(autoLvl\.spot\.noScale \? 1 : zoneScale\(\) \* tacticsZoneScale\(\)\)/.test(src), 'autolevel radius = spot radius x (noScale ? 1 : zoneScale x tactics)');

// ---- huntTarget: only monsters INSIDE the drawn polygon ----
const ht = piece('const huntSkip = {', '/** Mob i passende') + piece('function huntTarget(', '\n}\n') + '\n}';
const mobs = [];
const mk = (id, x, y) => { const m = { objId: id, X: x, Y: y, Z: -3100, IsDead: false, Name: 'Ol Mahum Commander', NpcId: 20438, HpPercent: 100 }; m.ref = m; return m; };
const autoLvl = { spot: Object.assign({}, sp) };
const envH = { now: () => T, num: Number, Me: { Level: 22 }, soloChar: () => false, soloMobList: () => [], soloRaidSpots: () => [], snapMobs: () => mobs,
  ignoredMob: () => false, huntBlacklisted: () => false, pairs: { on: false, taken: new Set() }, meSnap: () => ({ X: C.x, Y: C.y, Z: -3100 }), CONFIG: { rest: { zLimit: 500 } },
  npcLevel: () => 22, autoLvl, nearPolygon: (x, y, P, m) => Z.zpNear(x, y, P, m), inPolygon: (x, y, P) => Z.zpIn(x, y, Z.zpPts(P)), foreignTagged: () => false, geoBlockedAt: () => false,
  soloPullOk: () => ({ ok: true }), SOLOSAFE: {}, soloSafe: {}, note: () => { } };
const H = new Function(...Object.keys(envH), ht + '\nreturn { huntTarget, huntSkip };')(...Object.values(envH));
mobs.push(mk(1, C.x + 1500, C.y), mk(2, C.x, C.y + 1200));      // outside the polygon, inside the old x3 circle (2100)
ok(H.huntTarget(C.x, C.y, 700 * 3) === null, 'empty polygon: monsters OUTSIDE it (even inside the old x3 circle) are never targets');
mobs.push(mk(3, C.x + 400, C.y + 100));
const tgt = H.huntTarget(C.x, C.y, 700);
ok(tgt && tgt.objId === 3, 'a monster respawns INSIDE the polygon: it is the target (engage)');

// ---- the autolevel loop: the drawn-zone branch comes before the random walk and the centre walk ----
const loop = piece('const t = huntTarget(center.x, center.y, radius);', '// Videre til næste område?');
const iHold = loop.indexOf('else if (zonePolyOf(autoLvl.spot))'), iRand = loop.indexOf('Math.random() * Math.PI * 2'), iCentre = loop.indexOf('else if (Math.hypot(center.x - Me.X, center.y - Me.Y) > 800) await walkTo');
ok(iHold > 0 && iHold < iRand && iHold < iCentre, 'autolevel: a drawn zone with nothing to attack HOLDS (zoneHoldStep) before the random 2500 walk / centre walk can run');
ok(/if \(t\) \{ (?:autoLvl\.mobSeenAt = now\(\); )?zoneHoldEnd\(\); lastTarget = t\.objId; await engage\(t\); \}/.test(loop), 'a target found ends the hold (members stand up and assist)');   // EMPTY5-2026-10-20 stamps mobSeenAt first
ok(/!\(await unstick\(\)\) && !zonePolyOf\(autoLvl\.spot\)(?: && !zState\.layered)?\) \{ center = \{ x: Me\.X \+ 1500/.test(src), 'the unstick fallback never moves a drawn zone\'s centre 1500 away');

// ---- zoneSetup: the zone carries the polygon (dashboard + members) ----
const setup = piece('// ZONEPOLY (2026-10-13, public tester): a DRAWN custom zone -> the zone carries its polygon', '}   // zoneSetup');
ok(/autoLvl\.zone\.poly = sp\.poly\.map/.test(setup) && /autoLvl\.zone\.room = 'zone:' \+ sp\.name/.test(setup) && /autoLvl\.zone\.drawn = true/.test(setup) && /roomBroadcast\(true\)/.test(setup), 'zoneSetup: zone.poly + room id + drawn flag, broadcast to the members (swarm.room)');
ok(/SetCombatPolygon\(outer, inner\)/.test(src), "the leader's L2Swarm combat zone = SetCombatPolygon(drawn area, exclusions)");

// ---- huntRoom (leader): the drawn zone is "the room" -> nnFight / cast reach / members filter inside it ----
const hr = piece('function huntRoom() {', '\n}\n') + '\n}' + piece('function inHuntRoom(m, margin) {', '\n}\n') + '\n}';
const envR = { isLeader: () => true, autoLvl: { active: true, solo: false, spot: sp }, soloChar: () => false, MROOM: {}, now: () => T, num: Number, zonePolyOf: Z.zonePolyOf,
  nearPolygon: (x, y, P, m) => Z.zpNear(x, y, P, m) };
const R = new Function(...Object.keys(envR), hr + '\nreturn { huntRoom, inHuntRoom };')(...Object.values(envR));
const room = R.huntRoom();
ok(room && room.id === 'zone:' + zone.name && room.drawn, 'huntRoom (leader): the drawn zone');
ok(R.inHuntRoom({ X: C.x + 100, Y: C.y, Z: -3100 }) && !R.inHuntRoom({ X: C.x + 1500, Y: C.y, Z: -3100 }), 'inHuntRoom: inside yes, outside no (script fights stay inside)');

// ---- zoneHoldStep (leader, host side) with stubs ----
(async () => {
  const hs = piece('const ZHOLD = {', "App.on('swarm.zhold'");
  const calls = { walk: [], sleep: 0, sit: 0, stand: 0, emit: [], task: '', notes: [] };
  let me = { X: C.x + 200, Y: C.y, Z: -3100 }, hp = 100, mp = 100, tgtAfter = 0, htCalls = 0, t = T;
  const env = {
    ZONEPOLY: Z.ZONEPOLY, zoneEmptyDecide: Z.zoneEmptyDecide, zoneHoldText: Z.zoneHoldText, zoneNextRespawn: Z.zoneNextRespawn, zonePolyInner: Z.zonePolyInner,
    meSnap: () => me, num: Number, now: () => t, isLeader: () => true, autoLvl: { solo: false, killTimes: [T - 20000], stop: false }, soloChar: () => false,
    App: { emit: (n, d) => calls.emit.push([n, d]) }, fieldAreas: () => ({ byId: {} }), inPolygon: () => false,
    setTask: (s) => { calls.task = s; }, note: (s) => calls.notes.push(s), intent: () => { },
    walkTo: async (x, y) => { calls.walk.push([x, y]); }, walkDirect: async (x, y) => { calls.walk.push([x, y]); },
    sleep: async (ms) => { calls.sleep++; t += ms; hp = Math.min(100, hp + 3); mp = Math.min(100, mp + 3); },
    lastAttackerOnMe: { at: 0 }, rest: { sitting: false }, Me: { get HpPercent() { return hp; }, get MpPercent() { return mp; } },
    soloRestClear: () => true, stopCombatG: () => { }, toggleOffOne: () => false,
    RunCommand: (c) => { if (c === '/sit') calls.sit++; if (c === '/stand') calls.stand++; },
    huntTarget: () => { htCalls++; return tgtAfter && htCalls >= tgtAfter ? { objId: 9 } : null; },
  };
  const Mod = new Function(...Object.keys(env), hs + '\nreturn { zoneHoldStep, zoneHoldEnd, ZHOLD };')(...Object.values(env));
  const spH = Object.assign({}, sp);
  await Mod.zoneHoldStep(spH, spH.center, 700, false);
  ok(calls.walk.length === 0, 'hold step inside the area: NO walk at all');
  ok(/^autolevel: waiting for respawns in Abandoned Camp Commanders 1 — 0 monsters, next expected in ~40 s/.test(calls.task), `live line set: "${calls.task.slice(0, 110)}..."`);
  ok(calls.emit.some(e => e[0] === 'swarm.zhold' && e[1].on), 'members are told (swarm.zhold on)');
  ok(calls.sit === 0, 'fresh leader: no sitting');
  t += 200000; calls.emit = [];
  await Mod.zoneHoldStep(spH, spH.center, 700, false);
  ok(calls.notes.some(s => /waiting for respawns/.test(s)), 'after 3 min of nothing: said plainly once (note + intent)');
  // low HP: sit, rest until a monster appears inside
  hp = 60; mp = 50; tgtAfter = 3; htCalls = 0;
  await Mod.zoneHoldStep(spH, spH.center, 700, false);
  ok(calls.sit === 1 && calls.stand === 1 && htCalls >= 3 && hp < 97, 'leader at 60 % HP: sits, and stands up as soon as a monster spawns inside (before being full)');
  // outside: walk back inside, never a random direction
  me = { X: C.x + 3000, Y: C.y + 100, Z: -3100 }; calls.walk = [];
  await Mod.zoneHoldStep(spH, spH.center, 700, false);
  ok(calls.walk.length === 1 && Z.zpIn(calls.walk[0][0], calls.walk[0][1], Z.zpPts(OCT)), 'leader outside the area: walks back to a point INSIDE it');
  ok(calls.emit.some(e => e[0] === 'swarm.zhold' && e[1].on === false) || !Mod.ZHOLD.on, 'walking back in ends the hold');
  console.log(fails ? `${fails} FAILED` : 'all zone polygon checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL exception ' + (e && e.stack || e)); process.exit(1); });
