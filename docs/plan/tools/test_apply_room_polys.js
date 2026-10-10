// Offline test of apply_room_polys.js (no game, no L2Swarm): patches a COPY of Scripts_dev/swarm.js, checks it parses and that a second run
// is refused, then runs the inserted helper code in a vm with mocked host objects (players, monsters, claims, party_spots.json).
// Use: node test_apply_room_polys.js        (exit 0 = all passed)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'Scripts_dev', 'swarm.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

// 1) patch a copy
const tmp = path.join(os.tmpdir(), 'swarm_roompolys_test_' + process.pid + '.js');
fs.copyFileSync(SRC, tmp);
const run = (args) => { try { return { code: 0, out: cp.execFileSync(process.execPath, [path.join(__dirname, 'apply_room_polys.js'), ...args], { encoding: 'utf8', stdio: 'pipe' }) }; } catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; } };
console.log('patch a copy of Scripts_dev/swarm.js');
const r1 = run(['--file', tmp]);
ok(r1.code === 0 && /PATCHED/.test(r1.out), 'first run patches the copy');
const r2 = run(['--file', tmp]);
ok(r2.code === 3 && /REFUSED/.test(r2.out), 'second run is refused (already patched)');
let syntax = true; try { cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); } catch (e) { syntax = false; }
ok(syntax, 'patched copy parses (node --check)');
const broken = path.join(os.tmpdir(), 'swarm_roompolys_broken_' + process.pid + '.js');
fs.writeFileSync(broken, fs.readFileSync(SRC, 'utf8').replace('function pickRoom(dName, lvl) {', 'function pickRoomX(dName, lvl) {'));
const r3 = run(['--file', broken]);
ok(r3.code === 4 && /anchor found 0x/.test(r3.out) && fs.readFileSync(broken, 'utf8').includes('pickRoomX') && !fs.readFileSync(broken, 'utf8').includes('ROOM POLYS PATCH'), 'a missing anchor refuses and writes nothing');
const patched = fs.readFileSync(tmp, 'utf8').replace(/\r\n/g, '\n');
[tmp, broken].forEach(f => { try { fs.unlinkSync(f); } catch (e) { } });
['occupiedCheckOld(spot, center, radius)', 'manualSpot(level, solo)', 'if (!inHuntRoom(m) || foreignTagged(m)) return;', 'roomBroadcast(true);', "target.enter.how === 'ziggurat'", '!d.catacomb && (d.floors', 'sharedOccupied(key); if (so) return so;', '!autoLvl.spot.manualStay']
  .forEach(s => ok(patched.includes(s), 'patched file contains: ' + s));

// 2) run the helper block + roomSpotOf in a sandbox
const hb = patched.slice(patched.indexOf('// ===== ROOM POLYS PATCH 2026-10-08 BEGIN'), patched.indexOf('// ===== ROOM POLYS PATCH 2026-10-08 END'));
const rs = patched.slice(patched.indexOf('function roomSpotOf(b, z) {'), patched.indexOf('const onFloor = (F) =>'));
let T = 1000000;
const logs = [], intervals = [], handlers = {}, walks = [], polys = [];
const ctx = {
  console, Math, JSON, Number, String, Array, Object, Set, Map, isFinite, RegExp, Date, Promise,
  now: () => T, num: (v) => { const n = Number(v); return isFinite(n) ? n : 0; },
  inPolygon(x, y, P) { let inside = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x)) inside = !inside; } return inside; },
  CONFIG: { leader: 'Lead', roster: { Lead: 'sk', Mem: 'bishop' } }, livePos: {}, state: { role: 'sk' }, autoLvl: { active: true, spot: null, solo: false },
  isLeaderV: true, soloChar: () => false, IsCharacterReady: () => true,
  Me: { Name: 'Lead', X: 0, Y: 0, Z: -12000, IsDead: false, IsAttacking: false, IsCasting: false, objId: 1 }, Target: null,
  chars: [], mobs: [], claim: { j: {} }, files: {},
  note: (m) => logs.push(m), pickLog: (m) => logs.push(m), logError: (w, e) => logs.push('ERR ' + w + ' ' + (e && e.message)), dungeonLog: (m) => logs.push(m),
  App: { on: (n, f) => { handlers[n] = f; }, emit: (n, d) => logs.push('emit ' + n + ' ' + JSON.stringify(d).slice(0, 80)) },
  setInterval: (f, ms) => { intervals.push(f); return intervals.length; },
  myClanName: () => 'MyClan', myClanId: () => 77,
  spotKeyOf: (s) => (s && s.room && s.room.id) ? `room:${s.room.id}` : String((s && s.name) || ''),
  leadNum: (k, d) => d, spotOcc: {}, claimTeam: () => 'Lead', inRaid: () => false, tradeState: null, memberRoute: { id: null }, resBusy: false,
  lastAttackerOnMe: { id: 0, at: 0 }, mobById: () => null, zoneCache: { last: 1 }, hostCallMark: () => { }, UseCombatSquareZone: () => logs.push('square again'),
  SetCombatPolygon: (o, i) => polys.push(o.length), walkDirect: (x, y, z) => { walks.push([x, y]); return Promise.resolve(true); },
  __DIR__: 'C:\\L2', gkNorm: (s) => String(s || '').toLowerCase(),
  customZones: () => [], huntingSpots: () => [{ name: 'Field A', levelMin: 20, levelMax: 25, center: { x: 5, y: 5, z: 0 } }], zoneSpot: () => null,
};
ctx.isLeader = () => ctx.isLeaderV;
ctx.meSnap = () => ctx.Me;
ctx.snapChars = () => ctx.chars; ctx.snapMobs = () => ctx.mobs;
ctx.foreignClaims = () => []; ctx.claimCache = ctx.claim;
ctx.spotOccupied = (k) => !!(ctx.spotOcc[k] && ctx.spotOcc[k].until > T);
ctx.File = { ReadAllText: (p) => { if (ctx.files[p] === undefined) throw new Error('no file'); return ctx.files[p]; } };
// a dungeon with two rooms (squares), for manualRoomSpot / roomSpotOf
const sq = (x, y, h) => [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]];
const D = { name: 'Cruma Tower', levelRange: [40, 50], gatekeeperRoute: { town: 'Dion', destination: 'Cruma Tower' },
  floors: [{ name: '1st floor', z: [-12700, -11300], safeSpots: [{ id: 'cruma-1-safe-1', x: 3000, y: 0, z: -12000 }],
    rooms: [{ id: 'cruma-1-left-a', name: '1st floor, left: A room', center: [0, 0, -12000], radius: 500, levelRange: [40, 42], suitsPartyLevel: [40, 43], poly: sq(0, 0, 800), zRange: [-12200, -11800], route: [[1, 1, 1]] },
      { id: 'cruma-1-right-a', name: '1st floor, right: B room', center: [5000, 0, -12000], radius: 500, levelRange: [42, 44], suitsPartyLevel: [42, 45], poly: sq(5000, 0, 600), zRange: [-12200, -11800], route: [[1, 1, 1]] }] }] };
ctx.dungeonRooms = () => [D];
// 2026-10-08 22:xx (Seven Signs gate + level override in manualSpot): the gate / level helpers it calls — not a catacomb, team max = 43
ctx.ssSpotKindOf = () => ''; ctx.ssTeamAllowed = () => ({ ok: true, state: 'enter', why: '' }); ctx.teamMaxLevel = () => 43; ctx.ssgUntilText = () => '';
ctx.CONFIG.danger = { margin: 6 };
ctx.manualLevelGate = new Function((() => { const s = patched.slice(patched.indexOf('function manualLevelGate('), patched.indexOf('/** a failed trip: true = take the next spot now')); return s + '\nreturn manualLevelGate;'; })())();
ctx.pickRoom = (n, lvl) => ({ d: D, f: D.floors[0], fi: 0, r: D.floors[0].rooms[1], off: 0, busy: false });
vm.createContext(ctx);
vm.runInContext(hb + '\n' + rs + '\nthis.X = { nearPolygon, huntRoom, inHuntRoom, occupiedFast, occFast, foreignPlayers, foreignTagged, foreignCache, sharedOccupied, manualSpot, manualSpotChanged, manualState, MROOM, roomSpotOf, roomSpot, roomBroadcast };', ctx);
const X = ctx.X;

console.log('room polygon helpers');
const P = sq(0, 0, 800).map(p => ({ x: p[0], y: p[1] }));
ok(X.nearPolygon(0, 0, P, 0) && X.nearPolygon(850, 0, P, 100) && !X.nearPolygon(1000, 0, P, 100), 'nearPolygon: inside / +100 margin / outside');
const spot = X.roomSpotOf({ d: D, f: D.floors[0], fi: 0, r: D.floors[0].rooms[0], off: 0, busy: false }, { levelMin: 40, levelMax: 42 });
ok(spot.poly && spot.poly.length === 4 && spot.floor && spot.floor.zMin === -12200 && spot.radius >= 1131 && spot.noScale && spot.safeSpots.length === 1, 'roomSpotOf: polygon, z band, radius covers the polygon, noScale, safe spots');
ok(X.roomSpot({ rooms: 'Cruma Tower', levelMin: 40, levelMax: 50 }, 43).room.id === 'cruma-1-right-a', 'roomSpot still goes through pickRoom');
ctx.autoLvl.spot = spot;
ok(X.inHuntRoom({ X: 100, Y: 100, Z: -12000 }) && !X.inHuntRoom({ X: 2000, Y: 0, Z: -12000 }) && !X.inHuntRoom({ X: 100, Y: 100, Z: -9000 }), 'leader: inHuntRoom inside / other room / other floor');
ctx.autoLvl.active = false; ok(X.inHuntRoom({ X: 9000, Y: 0, Z: 0 }), 'no active room: every monster allowed');
ctx.autoLvl.active = true;

console.log('occupied: other players');
const chr = (name, x, y, o) => Object.assign({ Name: name, objId: 1000 + name.length * 7 + x, X: x, Y: y, Z: -12000, IsDead: false, IsPartyMember: false, Clan: null, IsInCombat: false }, o || {});
ctx.chars = [chr('Bob', 100, 100), chr('Ann', -200, 50)];
ok(X.occupiedFast(spot, spot.center) === null, '2 strangers just arrived: not yet');
T += 21000;
const o1 = X.occupiedFast(spot, spot.center);
ok(o1 && /Bob/.test(o1.by) && /Ann/.test(o1.by), '2 strangers together for 20 s: occupied by Bob, Ann');
// clan / party / roster are not strangers
T += 60000; X.occFast.key = ''; ctx.chars = [chr('Clanny', 100, 100, { Clan: { Name: 'MyClan' } }), chr('Partner', 0, 0, { IsPartyMember: true }), chr('Mem', 10, 10)];
X.occupiedFast(spot, spot.center); T += 25000;
ok(X.occupiedFast(spot, spot.center) === null, 'clan member, party member and roster character are ignored');
// a stranger outside the room (other room) does not count
T += 60000; X.occFast.key = ''; ctx.chars = [chr('Far1', 5000, 0), chr('Far2', 5100, 0)];
X.occupiedFast(spot, spot.center); T += 25000;
ok(X.occupiedFast(spot, spot.center) === null, 'strangers in the next room do not count');
// one lone hunter fighting in the room: 2 min
T += 60000; X.occFast.key = ''; ctx.mobs = [{ objId: 501, X: 200, Y: 200, Z: -12000, TargetObjId: 0 }];
ctx.chars = [chr('Solo', 150, 150, { TargetObjId: 501, IsInCombat: true })];
X.occupiedFast(spot, spot.center); T += 60000; X.foreignCache.at = 0;
ok(X.occupiedFast(spot, spot.center) === null, 'lone hunter after 1 min: not yet');
T += 65000; X.foreignCache.at = 0;
const o2 = X.occupiedFast(spot, spot.center);
ok(o2 && /Solo \(hunting alone here\)/.test(o2.by), 'lone hunter fighting in a room for 2 min: occupied');
ok(X.foreignTagged({ objId: 501 }) && !X.foreignTagged({ objId: 502 }), 'his monster is never our target');
// a lone player with a summon (monster fights an unknown object next to him)
T += 60000; X.occFast.key = ''; X.foreignCache.at = 0;
ctx.mobs = [{ objId: 601, X: 300, Y: 300, Z: -12000, TargetObjId: 99999 }, { objId: 602, X: 320, Y: 300, Z: -12000, TargetObjId: 0 }];
ctx.chars = [chr('Summoner', 250, 250, { TargetObjId: 601, IsInCombat: true })];
X.occupiedFast(spot, spot.center); T += 21000; X.foreignCache.at = 0;
const o3 = X.occupiedFast(spot, spot.center);
ok(o3 && /Summoner \(with a summon\/pet\)/.test(o3.by), 'one player + summon fighting for 20 s: occupied');
// I am far from the spot (travelling): no decision
T += 60000; X.occFast.key = ''; ctx.Me.X = 30000; ctx.chars = [chr('Bob', 100, 100), chr('Ann', -200, 50)];
X.occupiedFast(spot, spot.center); T += 25000;
ok(X.occupiedFast(spot, spot.center) === null, 'not arrived yet: no decision'); ctx.Me.X = 0;
// shared with our other parties
ctx.claim.j = { _occupied: { Destroyer3: [{ key: 'room:cruma-1-left-a', by: 'Bob, Ann', until: T + 100000 }, { key: 'room:x', by: 'party Lead (A, B)', until: T + 100000 }], Lead: [{ key: 'room:own', by: 'Z', until: T + 1e6 }] } };
ok(/occupied by Bob, Ann \(seen by party Destroyer3\)/.test(X.sharedOccupied('room:cruma-1-left-a')), 'occupied spot seen by party Destroyer3 is shared');
ok(X.sharedOccupied('room:x') === '' && X.sharedOccupied('room:own') === '', 'our own parties and my own list are not "others"');

console.log('manual hunting spot (party_spots.json)');
ctx.claim.j = {};   // (the shared-occupied entry above would block the room)
const PS = 'C:\\L2\\Scripts\\data\\party_spots.json';
ok(X.manualSpot(43, false) === null, 'no file: automatic');
ok(X.manualSpotChanged() === false, 'first check only remembers the current choice');
ctx.files[PS] = JSON.stringify({ Lead: { mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: 'cruma-1-left-a', at: '1' } });
X.manualState.at = 0;
ok(X.manualSpotChanged() === true, 'a new choice on the dashboard is noticed');
let m = X.manualSpot(43, false);
ok(m && m.manual && m.room.id === 'cruma-1-left-a' && m.poly && !m.manualStay, 'manual room is picked (polygon included)');
ok(X.manualSpotChanged() === false, 'after the pick it is the current choice');
logs.length = 0; m = X.manualSpot(60, false);
ok(m && logs.some(l => /does not fit party lvl 60 — going anyway/.test(l)), 'level misfit: a warning, still picked');
ctx.spotOcc['room:cruma-1-left-a'] = { until: T + 100000, by: 'Bob, Ann' }; logs.length = 0;
ok(X.manualSpot(43, false) === null && logs.some(l => /occupied by Bob, Ann — automatic choice for now/.test(l)), 'occupied by others: automatic for now');
ctx.files[PS] = JSON.stringify({ Lead: { mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: 'cruma-1-left-a', stay: true, at: '2' } }); X.manualState.at = 0;
m = X.manualSpot(43, false);
ok(m && m.manualStay, '"stay": picked even when occupied');
ctx.files[PS] = JSON.stringify({ Lead: { mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomId: 'any', at: '3' } }); X.manualState.at = 0; delete ctx.spotOcc['room:cruma-1-left-a'];
ok(X.manualSpot(43, false).room.id === 'cruma-1-right-a', '"any free room" goes through pickRoom');
ctx.files[PS] = JSON.stringify({ Lead: { mode: 'manual', kind: 'datapack', spot: 'Field A', at: '4' } }); X.manualState.at = 0;
ok(X.manualSpot(22, false).name === 'Field A', 'a datapack spot');
ctx.files[PS] = JSON.stringify({ Lead: { mode: 'auto', at: '5' } }); X.manualState.at = 0;
ok(X.manualSpot(22, false) === null, 'back to auto');

console.log('members: the leader\'s room');
ctx.isLeaderV = false; ctx.CONFIG.leader = 'Lead'; ctx.Me.Name = 'Mem'; ctx.state.role = 'bishop';
handlers['swarm.room']({ source: { characterName: 'Lead' }, data: { id: 'cruma-1-left-a', name: 'A room', poly: sq(0, 0, 800), z: [-12200, -11800], center: { x: 0, y: 0 } } });
ok(X.MROOM.id === 'cruma-1-left-a' && X.inHuntRoom({ X: 0, Y: 0, Z: -12000 }) && !X.inHuntRoom({ X: 3000, Y: 0, Z: -12000 }), 'member: room from swarm.room, monsters outside it are not picked');
handlers['swarm.room']({ source: { characterName: 'Stranger' }, data: { id: 'evil', poly: sq(9, 9, 9) } });
ok(X.MROOM.id === 'cruma-1-left-a', 'swarm.room from anyone but my leader is ignored');
const memberTick = intervals[1];
ctx.Me.X = 2500; ctx.Me.Y = 0; walks.length = 0; polys.length = 0;
memberTick(); ok(polys.length === 1, 'member: combat polygon set once for the room');
memberTick(); ok(walks.length === 0, 'member outside the room: not at once');
T += 7000; memberTick();
ok(walks.length === 1 && Math.abs(walks[0][0]) < 200, 'member outside the room for 6 s with nothing to do: walks back inside');
handlers['swarm.room']({ source: { characterName: 'Lead' }, data: { id: null } });
logs.length = 0; memberTick(); ok(logs.includes('square again') && X.MROOM.id === null, 'room ended: member back to the square zone');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
