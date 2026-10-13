// OFFLINE TEST of the NPC navigation (user 2026-10-09: "I want all the bots to understand where all NPCs are and how to get to them").
//   node docs/plan/tools/test_npc_nav.js        (exit code 1 when a check fails)
// NPCNAV-PURE (npcQueryParse / npcMatch / npcRank / npcTripPlan) on the REAL Scripts/data/npc_atlas.json, and goToNpc (host) with mocks:
// a Giran grocer from Dion, a field NPC, an NPC on Cruma floor 2 / 3, the Priest of Dawn, a Ziggurat, "teleport:Cruma Tower 2nd floor".
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < i) throw new Error('block not found: ' + a); return src.slice(i, j); };
const PURE = cut('// NPCNAV-PURE-BEGIN', '// NPCNAV-PURE-END');
const M = new Function(PURE + '\nreturn { npcQueryParse, npcMatch, npcRank, npcTripPlan, npcNorm };')();
const A = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'npc_atlas.json'), 'utf8'));
const TOWNS = ['Talking Island', 'Elven Village', 'Dark Elf Village', 'Orc Village', 'Dwarven Village', 'Kamael Village', 'Gludin', 'Gludio', 'Dion', 'Giran', 'Oren', 'Aden', 'Hunters Village', 'Heine', 'Goddard', 'Rune', 'Schuttgart', 'Floran'];
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const find = (q, me) => { const Q = M.npcQueryParse(q, TOWNS); return { Q, list: M.npcRank(M.npcMatch(A.npcs, Q), me, Q) }; };
const DION = { x: 15472, y: 142880, z: -2688, town: 'Dion', dungeon: null, floorIdx: null }, GIRAN = { x: 83551, y: 147945, z: -3400, town: 'Giran', dungeon: null, floorIdx: null };
const CR1 = { x: 17847, y: 113962, z: -11680, town: null, dungeon: 'Cruma Tower', floorIdx: 0 };
const kinds = (p) => p.steps.map(s => s.do).join(' ');

// ---- atlas ---------------------------------------------------------------------------------------------------------------------------
check(A.npcs.length > 2000 && A.stats.withTeleports > 50, `atlas: ${A.npcs.length} NPC spawns, ${A.stats.withTeleports} with teleports, ${A.stats.liveSeen} seen live, ${A.stats.mismatches} mismatches`);
const pen = A.npcs.find(n => n.id === 30487), pon = A.npcs.find(n => n.id === 30484);
check(pen && pen.name === 'Penelope' && pen.spawnName === 'Rombel' && pen.place.dungeon === 'Cruma Tower' && pen.place.floorIdx === 0 && (pen.teleports || []).some(t => /2nd floor/.test(t.text)), 'Penelope: client name, spawn name Rombel, Cruma 1st floor, "Teleport to the 2nd floor."');
check(pen.live && pen.live.links.includes('Teleport to the 2nd floor.') && pon.live && pon.live.links.includes('Return to the ground'), 'Penelope and Ponti carry their LIVE menus');
check(!(A.validation.doubtful || []).some(x => !x.soft), `validation: every dungeon floor link + town->field teleport is backed by the atlas (${A.validation.checked} checked, ${(A.validation.doubtful || []).filter(x => x.soft).length} only datapack)`);
// ---- query parsing ---------------------------------------------------------------------------------------------------------------------
let Q = M.npcQueryParse('grocer giran', TOWNS); check(Q.kind === 'role' && Q.value === 'grocer' && Q.town === 'Giran', 'query "grocer giran" = role grocer in Giran');
Q = M.npcQueryParse('warehouse in Dion', TOWNS); check(Q.kind === 'role' && Q.value === 'warehouse' && Q.town === 'Dion', 'query "warehouse in Dion"');
Q = M.npcQueryParse('#30487', TOWNS); check(Q.kind === 'id' && Q.value === 30487, 'query "#30487" = id');
Q = M.npcQueryParse('teleport:Cruma Tower 2nd floor', TOWNS); check(Q.kind === 'teleport' && Q.value === 'Cruma Tower 2nd floor', 'query "teleport:..." = by what it offers');
// ---- plans -------------------------------------------------------------------------------------------------------------------------
let r = find('grocer giran', DION);
let p = r.list.length && M.npcTripPlan(r.list[0].npc, DION, { townKey: (x) => x });
check(r.list.length && r.list[0].npc.place.town === 'Giran' && kinds(p) === 'town walk talk', `Giran grocer from Dion: ${r.list.length ? r.list[0].npc.name : '-'} — ${p ? p.text : ''}`);
r = find('grocer', GIRAN); check(r.list.length && r.list[0].npc.place.town === 'Giran' && r.list[0].why.includes('in my town'), `"grocer" standing in Giran: the Giran one first (${r.list[0] && r.list[0].npc.name})`);
r = find('priest of dawn', GIRAN); p = r.list.length && M.npcTripPlan(r.list[0].npc, GIRAN, { townKey: (x) => x });
check(r.list.length && r.list[0].npc.place.town === 'Giran' && kinds(p) === 'walk talk', `Priest of Dawn from Giran: ${r.list[0] && r.list[0].npc.name} in Giran (${p ? p.text : ''})`);
r = find('Hanna', DION); p = r.list.length && M.npcTripPlan(r.list[0].npc, DION, {});
check(r.list.length && r.list[0].npc.place.dungeon === 'Cruma Tower' && r.list[0].npc.place.floorIdx === 1 && kinds(p) === 'dungeon room-walk talk', `Hanna (Cruma floor 2, south end) from Dion: ${p ? p.text : ''}`);
p = M.npcTripPlan(r.list[0].npc, CR1, {}); check(kinds(p) === 'room-walk talk', 'Hanna from the Cruma floor 1 landing: only the room-by-room walk (Penelope on the way is part of it)');
r = find('Teleportation Cubic', DION); check(r.list.length && r.list[0].npc.place.floorIdx === 2, `Teleportation Cubic = Cruma 3rd floor (${r.list[0] && r.list[0].npc.place.floor})`);
r = find('teleport:Cruma Tower 2nd floor', CR1);
check(r.list.length && r.list[0].npc.name === 'Penelope' && !r.list.some(c => c.npc.name === 'Ponti'), `"teleport:Cruma Tower 2nd floor" -> ${r.list.map(c => c.npc.name + ' (' + c.why + ')').join(', ')} (never Ponti)`);
r = find('ziggurat gatekeeper', GIRAN); p = r.list.length && M.npcTripPlan(r.list[0].npc, GIRAN, { townKey: (x) => x });
check(r.list.length > 0 && p && /talk$/.test(kinds(p)), `nearest Ziggurat gatekeeper from Giran: ${r.list[0] && r.list[0].npc.name} ${r.list[0] && JSON.stringify(r.list[0].npc.place)} (${p ? p.text : ''})`);
const field = A.npcs.find(n => !n.place.town && !n.place.dungeon && n.place.region && (n.roles || []).includes('gatekeeper'));
if (field) { p = M.npcTripPlan(field, GIRAN, { townKey: (x) => x }); check(/^travel walk talk$/.test(kinds(p)), `a field NPC (${field.name}, ${field.place.region}): travel near + walk + talk`); }
r = find('NoSuchNpcAnywhere', GIRAN); check(r.list.length === 0, 'unknown NPC: no candidates (goToNpc says "not in the atlas")');

// ---- host: goToNpc with mocks -------------------------------------------------------------------------------------------------------
const HOST = cut('// ===== NPC NAVIGATION (host side of NPCNAV-PURE', "/** Leader: entrance -> floor teleporters -> the room's route.");
async function runGo(query, start, opt) {
  const W = Object.assign({ log: [], tps: [], walks: [], clicks: [], town: start.town, intents: [] }, opt || {});
  const me = { X: start.x, Y: start.y, Z: start.z, IsDead: false, Name: 'Tank1' }, state = {};
  const env = {
    Me: me, state, control: { gen: 1 }, interrupted: () => false, __DIR__: 'C:\\X', fileStamp: () => 'x', File: { ReadAllText: () => JSON.stringify(A), WriteAllText: () => { } },
    npcQueryParse: M.npcQueryParse, npcMatch: M.npcMatch, npcRank: M.npcRank, npcTripPlan: M.npcTripPlan, npcNorm: M.npcNorm, now: () => Date.now(),
    currentTownKey: () => W.town, TOWNS: {}, townKeyFor: (x) => x, dzFloor: () => (W.dz || null), dungeonRooms: () => [], findDungeon: () => null, rgHas: () => false,
    teamTeleport: async (t) => { W.tps.push(t); const T = { Giran: [83551, 147945, -3400], Dion: [15472, 142880, -2688] }[t]; if (T) { W.town = t; me.X = T[0]; me.Y = T[1]; me.Z = T[2]; } return !!T; },
    walkTo: async (x, y, z) => { W.walks.push([x, y]); me.X = x; me.Y = y - 100; me.Z = z; return true; }, teleportNear: async () => true, rgWalk: async () => ({ ok: true }), isLeader: () => true,
    snapNpcs: () => (W.seen || []), num: Number, openNpc: async (n) => W.page || '<a action="bypass -h 00">Buy</a><a action="bypass -h 01">Sell</a>', npcLinks: (h) => { const out = [], re = /<a\b[^>]*action="bypass\s+(?:-h\s+)?([^"]+)"[^>]*>([\s\S]*?)<\/a>/g; let m; while ((m = re.exec(h))) out.push({ cmd: m[1], text: m[2] }); return out; },
    Send: { ReqBypassToServer: (c) => W.clicks.push(c) }, DLG: { click: async (l) => { W.clicks.push(l.cmd); return { ok: true }; } }, sleep: async () => { }, setTask: () => { }, intent: (a, b) => W.intents.push(b), intentDone: (a, ok, why) => W.intents.push((ok ? 'OK ' : 'FAIL ') + why), dungeonLog: (m) => W.log.push(m), logError: (m, e) => W.log.push('ERR ' + m + e),
    townWalkToNpc: async () => false, P: (x, y) => `${Math.round(x)},${Math.round(y)}`, gkFail: '', appearBurst: () => { }, App: { emit: () => { }, on: () => { } },   // App.on: the cut host block now registers an App event handler at load teamRegroupBeforePort: async () => true, floorTeleport: async () => true, teamNames: () => [], lastFloorNpc: null, rgPlan: () => ({ ok: false }), rgFor: () => null,
  };
  const names = Object.keys(env);
  const api = new Function(...names, HOST + '\nreturn { goToNpc, npcFind };')(...names.map(k => env[k]));
  if (W.seenFn) W.seen = W.seenFn(api);
  const res = await api.goToNpc(query, W.o || {});
  return { res, W, me, state };
}
(async () => {
  const g = find('grocer giran', DION).list[0].npc;
  let x = await runGo('grocer giran', DION, { seen: [{ Name: g.name, Id: g.id, X: g.x, Y: g.y, Z: g.z, IsDead: false, ref: { Name: g.name } }], o: { link: 'Buy' } });
  check(x.res.ok && x.W.tps.join() === 'Giran' && x.W.walks.length === 1 && x.W.clicks.join() === '00', `goToNpc "grocer giran" from Dion: .giran, walk to ${g.name}, dialog, "Buy" clicked`);
  check(x.state.npcTrip && x.state.npcTrip.npc.name === g.name && x.state.npcTrip.result === 'talked' && x.state.npcTrip.steps.length === 3, 'state.npcTrip: npc, steps, result');
  x = await runGo('grocer giran', DION, { seen: [] });
  check(!x.res.ok && /not in sight/.test(x.res.why), `NPC not in sight on arrival -> failed with the reason (${x.res.why})`);
  x = await runGo('NoSuchNpcAnywhere', DION, {});
  check(!x.res.ok && /in the atlas/.test(x.res.why), 'unknown NPC -> "not in the atlas"');
  console.log(fails ? `${fails} check(s) FAILED` : 'all checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
