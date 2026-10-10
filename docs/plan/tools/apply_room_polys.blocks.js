// Code blocks inserted into Scripts_dev/swarm.js by apply_room_polys.js (not a module; split at the //@@BLOCK lines).
//@@BLOCK helpers
// ===== ROOM POLYS PATCH 2026-10-08 BEGIN (docs/plan/tools/apply_room_polys.js; data: docs/plan/tools/room_polys.js, safe_spots.js) =====
// ROOM POLYGONS (user 2026-10-08 17:35: "In Cruma Tower there are multiple rooms; ideally it should take a room and stay there, so the square
// should fit the room"). Every room of dungeon_rooms.json has  poly [[x,y],...]  + zRange (outline from the geodata, doorways cut off).
// A room spot carries  poly [{x,y}]  + floor {zMin,zMax}: L2Swarm's combat zone = SetCombatPolygon(room), the leader's targets = monsters
// inside the room (+100) and its z band, the hunting circle is not enlarged (noScale). The leader tells the members which room (swarm.room,
// every 15 s): they take the same combat polygon, never pick a monster outside it (unless it hits them) and walk back inside when they
// stand outside it for 6 s with nothing to do. swarm_state.zone.poly -> the dashboard draws the room instead of the square.
// OCCUPIED (user 2026-10-08 17:55: "we are not alone"): other players' parties in our spot are seen ON ARRIVAL (decide in ~20 s, was 2 min):
// 2+ foreign players in the area together, or one fighting with a summon/pet, or one lone player hunting a small area (room / sub-area) for
// 2 min -> the spot is occupied (30 min), shared with our other parties through spot_claims.json _occupied; monsters a foreign player
// fights are never our targets. MANUAL SPOT (user 2026-10-08 17:55): Scripts/data/party_spots.json { "<leader>": { mode:'auto'|'manual',
// kind:'zone'|'datapack'|'rooms', spot, dungeon, roomId ('any' = any free room), stay, at } } from the dashboard wins over pickSpot.
const roomPolyPts = (r) => (r && Array.isArray(r.poly) && r.poly.length >= 3) ? r.poly.map(p => ({ x: num(p[0]), y: num(p[1]) })) : null;
/** inside the polygon P ([{x,y}]) or within margin of its edge */
function nearPolygon(x, y, P, margin) {
  if (!P || P.length < 3) return false;
  if (inPolygon(x, y, P)) return true;
  if (!margin) return false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    let t = L ? ((x - a.x) * dx + (y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= margin) return true;
  }
  return false;
}
/** member side: the room my leader hunts in (swarm.room) */
const MROOM = { id: null, name: '', poly: null, z: null, center: null, at: 0, applied: null, outSince: 0, walking: false };
/** The room this window hunts in now: leader / solo -> its own room spot, member -> the leader's room (fresh 60 s). null = no room. */
function huntRoom() {
  if (isLeader() || autoLvl.solo || soloChar()) {
    const sp = autoLvl.active && autoLvl.spot;
    return sp && sp.room && sp.poly && sp.poly.length >= 3 ? { id: sp.room.id, name: sp.name, poly: sp.poly, z: sp.floor ? [sp.floor.zMin, sp.floor.zMax] : null, center: sp.center } : null;
  }
  return MROOM.poly && now() - MROOM.at < 60000 ? MROOM : null;
}
/** A monster (X/Y/Z) inside the room I hunt (+margin, default 100) and its z band (+150); true when there is no room. */
function inHuntRoom(m, margin) {
  const R = huntRoom(); if (!R) return true;
  const z = m.Z === undefined || m.Z === null ? null : num(m.Z);
  if (R.z && z !== null && isFinite(z) && (z < R.z[0] - 150 || z > R.z[1] + 150)) return false;
  return nearPolygon(num(m.X), num(m.Y), R.poly, margin === undefined ? 100 : margin);
}
// leader: tell the members the room (and that it ended)
const roomCast = { id: null, at: 0 };
function roomBroadcast(force) {
  try {
    if (!isLeader()) return;
    const R = autoLvl.active && autoLvl.zone && autoLvl.zone.poly ? autoLvl.zone : null;
    if (!R) { if (roomCast.id) { App.emit('swarm.room', { id: null }); roomCast.id = null; } return; }
    if (!force && roomCast.id === R.room && now() - roomCast.at < 15000) return;
    App.emit('swarm.room', { id: R.room, name: R.name, poly: R.poly, z: R.zr || null, center: { x: R.x, y: R.y } });
    roomCast.id = R.room; roomCast.at = now();
  } catch (e) { }
}
setInterval(() => roomBroadcast(false), 5000);
App.on('swarm.room', (e) => {
  try {
    if (isLeader() || e.source.characterName !== CONFIG.leader) return;
    const d = e.data || {};
    if (!d.id || !Array.isArray(d.poly) || d.poly.length < 3) { Object.assign(MROOM, { id: null, poly: null, z: null, center: null, at: 0 }); return; }
    if (MROOM.id !== d.id) note(`room: hunting with ${CONFIG.leader} inside ${d.name || d.id} — staying in the room`);
    Object.assign(MROOM, { id: d.id, name: d.name || d.id, poly: d.poly.map(p => ({ x: num(p[0]), y: num(p[1]) })), z: Array.isArray(d.z) ? d.z : null, center: d.center || null, at: now() });
  } catch (er) { logError('swarm.room', er); }
});
// member: the same combat polygon (once per room), back inside the room when outside it with nothing to do (6 s)
setInterval(() => {
  try {
    if (isLeader() || !state.role || !IsCharacterReady() || Me.IsDead) return;
    const R = MROOM.poly && now() - MROOM.at < 60000 ? MROOM : null;
    if (!R) {
      if (MROOM.applied) { MROOM.applied = null; try { UseCombatSquareZone(); zoneCache.last = null; } catch (e) { } }   // the room ended: the square again
      MROOM.outSince = 0; return;
    }
    if (MROOM.applied !== R.id && typeof SetCombatPolygon === 'function') {
      try { hostCallMark('SetCombatPolygon room pending'); SetCombatPolygon(R.poly.map(p => [Math.round(p.x), Math.round(p.y)]), []); hostCallMark('SetCombatPolygon room done'); zoneCache.last = null; MROOM.applied = R.id; }
      catch (e) { MROOM.applied = R.id; logError('room combat polygon', e); }
    }
    const me = meSnap();
    if (nearPolygon(num(me.X), num(me.Y), R.poly, 150) || MROOM.walking) { MROOM.outSince = 0; return; }
    if (R.center && Math.hypot(R.center.x - me.X, R.center.y - me.Y) > 5000) { MROOM.outSince = 0; return; }   // far away (travel, regroup): not my job
    let busy = false;
    try { busy = Me.IsAttacking || Me.IsCasting || now() - lastAttackerOnMe.at < 5000 || (Target && Target.objId && !!mobById(Target.objId) && !Target.IsDead); } catch (e) { busy = true; }
    if (busy || state.gkBusy || state.escaping || tradeState || state.buffTurn || inRaid() || memberRoute.id || now() < (state.followHoldUntil || 0) || resBusy) { MROOM.outSince = 0; return; }
    if (!MROOM.outSince) { MROOM.outSince = now(); return; }
    if (now() - MROOM.outSince < 6000) return;
    // to the leader when he stands in the room, else to the room centre (straight moves: no native path search in dungeons)
    const lp = livePos[CONFIG.leader], p = lp && now() - (lp.at || 0) < 8000 && nearPolygon(num(lp.X), num(lp.Y), R.poly, 0) ? { x: num(lp.X), y: num(lp.Y) } : R.center;
    if (!p) return;
    MROOM.walking = true; MROOM.outSince = 0;
    note(`room: outside ${R.name} — walking back inside`);
    walkDirect(p.x + (Math.random() - 0.5) * 200, p.y + (Math.random() - 0.5) * 200, me.Z, 150, 15000, null, true).catch(() => { }).then(() => { MROOM.walking = false; });
  } catch (e) { MROOM.walking = false; }
}, 2000);

// --- foreign players (not on our roster, not in my party, not my clan / MyClan) ---
const foreignCache = { at: 0, list: [], mobTag: new Set() };
function foreignPlayers() {
  if (now() - foreignCache.at < 1000) return foreignCache.list;
  const list = [], tag = new Set(), mobs = {};
  try { snapMobs().forEach(m => { mobs[num(m.objId)] = m; }); } catch (e) { }
  const myClan = (() => { try { return myClanName(); } catch (e) { return ''; } })(), myCid = (() => { try { return myClanId(); } catch (e) { return 0; } })();
  try {
    snapChars().forEach(c => {
      const n = String(c.Name || ''); if (!n || n === Me.Name || CONFIG.roster[n] || livePos[n] || c.IsDead) return;
      try { if (c.IsPartyMember) return; } catch (e) { }
      try { const C = c.Clan; if (C) { const cn = typeof C === 'object' ? String(C.Name || C.ClanName || '') : ''; const cid = typeof C === 'object' ? num(C.Id || C.ClanId || 0) : num(C);
        if ((cn && cn !== 'undefined' && (cn === myClan || /swarm\s*legion/i.test(cn))) || (cid && myCid && cid === myCid)) return; } } catch (e) { }
      const id = num(c.objId);
      let tgt = 0; try { tgt = num(c.TargetObjId) || (c.targetCrt ? num(c.targetCrt.objId) : 0); } catch (e) { }
      let fighting = false; try { fighting = !!c.IsInCombat; } catch (e) { }
      if (tgt && mobs[tgt]) { fighting = true; tag.add(tgt); }
      list.push({ name: n, objId: id, x: num(c.X), y: num(c.Y), z: c.Z === undefined || c.Z === null ? null : num(c.Z), fighting, target: tgt });
    });
  } catch (e) { }
  // monsters that fight a foreign player (their target is him)
  const ids = new Set(list.map(c => c.objId));
  Object.keys(mobs).forEach(k => { const m = mobs[k]; let t = 0; try { t = num(m.TargetObjId) || (m.targetCrt ? num(m.targetCrt.objId) : 0); } catch (e) { } if (t && ids.has(t)) { tag.add(num(k)); const c = list.find(x => x.objId === t); if (c) c.fighting = true; } });
  foreignCache.at = now(); foreignCache.list = list; foreignCache.mobTag = tag; foreignCache.mobs = mobs;
  return list;
}
/** a monster a foreign player is fighting: never ours (no fighting over a spot) */
function foreignTagged(m) { try { foreignPlayers(); return foreignCache.mobTag.has(num(m.objId)); } catch (e) { return false; } }
/** Another of our parties saw foreign players in this spot (spot_claims.json _occupied of the other teams) -> 'occupied by ...', else ''. */
function sharedOccupied(key) {
  try {
    foreignClaims();
    const O = (claimCache.j && claimCache.j._occupied) || {}, mine = claimTeam();
    for (const tm of Object.keys(O)) {
      if (tm === mine || !Array.isArray(O[tm])) continue;
      const o = O[tm].find(x => x && x.key === key && num(x.until) > now() && !/^party /.test(String(x.by || '')));
      if (o) return `occupied by ${o.by} (seen by party ${tm})`;
    }
  } catch (e) { }
  return '';
}
/** ON ARRIVAL (every 4 s): foreign players in the hunting area. Area = the room polygon (+250) and its z band when the spot has one, else
 *  the old circle. Returns { by } when the spot is taken by others, else null. Our own other parties: occupiedCheckOld (unchanged). */
const occFast = { at: 0, key: '', seen: {}, arrivedAt: 0 };
function occupiedFast(spot, center) {
  if (!spot || !center || spot.assist || spot.manualStay || now() - occFast.at < 4000) return null;
  occFast.at = now();
  const key = spotKeyOf(spot);
  if (occFast.key !== key) Object.assign(occFast, { key, seen: {}, arrivedAt: 0 });
  const P = spot.poly && spot.poly.length >= 3 ? spot.poly : null;
  const small = !!(spot.room || spot.sub || P);
  const R = (spot.room || spot.sub) ? Math.max(700, num(spot.radius) + 300) : Math.min(num(spot.radius) || 3000, leadNum('occupiedRange', 3000));
  const zr = spot.floor ? [spot.floor.zMin - 300, spot.floor.zMax + 300] : null;
  const inArea = (x, y, z) => {
    if (z !== null && isFinite(z)) { if (zr && (z < zr[0] || z > zr[1])) return false; if (!zr && isFinite(center.z) && center.z !== null && Math.abs(z - center.z) > 800) return false; }
    return P ? nearPolygon(x, y, P, 250) : Math.hypot(x - center.x, y - center.y) <= R;
  };
  const me = meSnap();
  const arrived = P ? nearPolygon(num(me.X), num(me.Y), P, 1500) : Math.hypot(center.x - me.X, center.y - me.Y) <= R + 1500;
  if (!arrived) { occFast.arrivedAt = 0; return null; }
  if (!occFast.arrivedAt) occFast.arrivedAt = now();
  const t = now(), list = foreignPlayers();
  list.forEach(c => {
    if (!inArea(c.x, c.y, c.z)) return;
    const s = occFast.seen[c.name] || (occFast.seen[c.name] = { first: t, last: t, fightFirst: 0, fightLast: 0 });
    s.last = t; if (c.fighting) { if (!s.fightFirst) s.fightFirst = t; s.fightLast = t; }
  });
  Object.keys(occFast.seen).forEach(n => { const s = occFast.seen[n]; if (t - s.last > 15000) delete occFast.seen[n]; else if (s.fightFirst && t - s.fightLast > 20000) s.fightFirst = 0; });
  const decide = leadNum('occupiedDecideMs', 20000), lone = leadNum('occupiedLoneMs', 120000);
  const present = Object.keys(occFast.seen).filter(n => t - occFast.seen[n].last < 6000);
  // a party of other players: 2+ of them in the area together for decideMs
  const together = present.filter(n => t - occFast.seen[n].first >= decide);
  if (together.length >= 2) return { by: together.slice(0, 6).join(', ') };
  // one player fighting with a summon/pet: monsters near him fight something we do not see as a player or monster (his summon)
  const fighters = present.filter(n => occFast.seen[n].fightFirst);
  if (fighters.length) {
    const f = fighters[0], c = list.find(x => x.name === f), known = new Set(list.map(x => x.objId));
    let summon = false;
    try { (foreignCache.mobs ? Object.values(foreignCache.mobs) : []).forEach(m => { let tg = 0; try { tg = num(m.TargetObjId) || (m.targetCrt ? num(m.targetCrt.objId) : 0); } catch (e) { }
      if (!tg || known.has(tg) || (foreignCache.mobs && foreignCache.mobs[tg]) || tg === num(me.objId) || livePosByObj(tg)) return;
      if (c && Math.hypot(num(m.X) - c.x, num(m.Y) - c.y) < 1500) summon = true; }); } catch (e) { }
    if (summon && t - occFast.seen[f].fightFirst >= decide) return { by: `${f} (with a summon/pet)` };
    // a lone player hunting a SMALL area (a room, a sub-area) for 2 min
    if (small && t - occFast.seen[f].fightFirst >= lone) return { by: `${f} (hunting alone here)` };
  }
  return null;
}
/** one of our characters by objId (their summons are not known: only the characters) */
function livePosByObj(id) { try { return Object.keys(livePos).some(n => num(livePos[n].objId) === id); } catch (e) { return false; } }
/** status for the dashboard / log: who is seen here now */
function occFastSeen() { return Object.keys(occFast.seen); }

// --- MANUAL HUNTING SPOT per party (dashboard Parties tab -> Scripts/data/party_spots.json, read live) ---
const manualState = { at: 0, j: null, applied: '', warned: '' };
function partySpots() {
  if (now() - manualState.at > 15000) {
    manualState.at = now();
    try { const t = String(File.ReadAllText(`${__DIR__}\\Scripts\\data\\party_spots.json`) || '').replace(/^﻿/, ''); manualState.j = t.trim() ? JSON.parse(t) : {}; } catch (e) { if (manualState.j === null) manualState.j = {}; }
  }
  return manualState.j || {};
}
const partySpotEntry = () => { const j = partySpots(); const e = j[CONFIG.leader] || j[claimTeam()]; return e && typeof e === 'object' ? e : null; };
const partySpotSig = (e) => e && e.mode === 'manual' ? [e.mode, e.kind, e.spot || '', e.dungeon || '', e.roomId || '', e.stay ? 1 : 0, e.at || ''].join('|') : 'auto';
/** the dashboard choice changed since the current spot was picked */
function manualSpotChanged() { try { const sig = partySpotSig(partySpotEntry()); if (!manualState.applied) { manualState.applied = sig; return false; } return sig !== manualState.applied; } catch (e) { return false; } }
/** A room of a dungeon as a spot; roomId 'any' (or empty) = the best free room (pickRoom). */
function manualRoomSpot(dName, roomId, level, z) {
  const d = dungeonRooms().find(x => gkNorm(x.name) === gkNorm(dName)); if (!d) return null;
  const zz = z || { rooms: d.name, levelMin: (d.levelRange || [1, 99])[0], levelMax: (d.levelRange || [1, 99])[1] };
  if (!roomId || roomId === 'any') return roomSpot(zz, level);
  for (let fi = 0; fi < (d.floors || []).length; fi++) {
    const r = (d.floors[fi].rooms || []).find(x => x.id === roomId);
    if (r) { const s = r.suitsPartyLevel || r.levelRange || [1, 99]; return roomSpotOf({ d, f: d.floors[fi], fi, r, off: level < s[0] ? s[0] - level : level > s[1] ? level - s[1] : 0, busy: false }, { levelMin: (r.levelRange || s)[0], levelMax: (r.levelRange || s)[1] }); }
  }
  return null;
}
/** pickSpot: the party's manual choice (null = automatic). Level misfit = a warning only; occupied by others = automatic for now (5 min),
 *  unless the user chose "stay". */
function manualSpot(level, solo) {
  const e = partySpotEntry(); manualState.applied = partySpotSig(e);
  if (!e || e.mode !== 'manual' || (solo && !soloChar())) return null;
  const why = []; let s = null;
  try {
    if (e.kind === 'rooms') s = manualRoomSpot(e.dungeon || e.spot, e.roomId, level);
    else if (e.kind === 'zone') { const z = customZones().find(x => x.name === e.spot); if (z) s = z.rooms ? manualRoomSpot(z.rooms, e.roomId || 'any', level, z) : zoneSpot(z, level, why); else why.push('no custom zone called ' + e.spot); }
    else if (e.kind === 'datapack') s = huntingSpots().find(x => x.name === e.spot) || null;
  } catch (er) { logError('manual spot', er); }
  const label = e.kind === 'rooms' ? `${e.dungeon || e.spot}${e.roomId && e.roomId !== 'any' ? ' / ' + e.roomId : ' (any free room)'}` : String(e.spot || '');
  if (!s) { pickLog(`hunting spot chosen on the dashboard: ${label} — not available now (${why[0] || 'not found / no free room'}), automatic choice`); return null; }
  s = Object.assign({}, s, { manual: true, manualStay: !!e.stay });
  const key = spotKeyOf(s);
  if (level < num(s.levelMin) - 3 || level > num(s.levelMax) + 3) { const w = `${key}|${level}`; if (manualState.warned !== w) { manualState.warned = w; note(`hunting spot chosen on the dashboard: ${s.name} (lvl ${s.levelMin}-${s.levelMax}) does not fit party lvl ${level} — going anyway (your choice)`, true); } }
  const occ = spotOccupied(key) ? (spotOcc[key].by || 'others') : sharedOccupied(key);
  if (occ && !e.stay) { pickLog(`hunting spot chosen on the dashboard: ${s.name} is ${/^occupied/.test(occ) ? occ : 'occupied by ' + occ} — automatic choice for now, trying it again within 5 min (choose "stay" to stay anyway)`); return null; }
  return s;
}
// ===== ROOM POLYS PATCH 2026-10-08 END =====
//@@BLOCK roomspot
function roomSpotOf(b, z) {
  const g = b.d.gatekeeperRoute || {}, P = roomPolyPts(b.r), c = { x: b.r.center[0], y: b.r.center[1], z: b.r.center[2] };
  // ROOM POLYS PATCH 2026-10-08: the room's outline + height band; the hunting circle covers the whole polygon (long corridor rooms)
  const polyR = P ? Math.max(...P.map(p => Math.hypot(p.x - c.x, p.y - c.y))) : 0;
  return { name: `${b.d.name}: ${b.r.name}`, levelMin: z.levelMin, levelMax: z.levelMax, center: c,
    radius: Math.round(Math.max(600, b.r.radius || 800, polyR + 100)), noScale: true, gk: g.town && g.destination ? { from: g.town, desc: `${g.town} -> ${g.destination}` } : null,
    custom: true, room: { dungeon: b.d.name, floor: b.fi, id: b.r.id, name: b.r.name, fit: b.off === 0, busy: b.busy },
    poly: P, floor: P && Array.isArray(b.r.zRange) ? { zMin: b.r.zRange[0], zMax: b.r.zRange[1] } : null, safeSpots: (b.f && b.f.safeSpots) || null };
}
function roomSpot(z, lvl) {
  const b = pickRoom(z.rooms, lvl); if (!b) return null;
  return roomSpotOf(b, z);
}
//@@BLOCK enterzig
  // ROOM POLYS PATCH 2026-10-08: a catacomb / necropolis (dungeon_rooms.json floor enter.how 'ziggurat'): the usual way in (enterDungeon:
  // walk in through the entry hall, else the Gatekeeper Ziggurat), then the walk to the room. The entry hall lies in the same height band
  // as the inside, so "on the floor" is not enough there.
  if (target.enter && target.enter.how === 'ziggurat') {
    const cd = findDungeon(target.enter.catacomb || d.catacomb || d.name);
    if (cd && !insideDungeon(cd)) { if (!(await enterDungeon(cd.name))) { gkFail = gkFail || `could not get into ${d.name}`; return false; } }
  }
//@@BLOCK zonepoly
        // ROOM POLYS PATCH 2026-10-08: a room -> the zone carries its polygon (dashboard draws it; the members get it via swarm.room)
        if (autoLvl.spot && autoLvl.spot.room && autoLvl.spot.poly && center === autoLvl.spot.center) {
          autoLvl.zone.poly = autoLvl.spot.poly.map(p => [Math.round(p.x), Math.round(p.y)]); autoLvl.zone.room = autoLvl.spot.room.id;
          autoLvl.zone.zr = autoLvl.spot.floor ? [autoLvl.spot.floor.zMin, autoLvl.spot.floor.zMax] : null;
          if (autoLvl.spot.manual) autoLvl.zone.manual = true;
          roomBroadcast(true);
        }
//@@BLOCK huntloopmanual
      // ROOM POLYS PATCH 2026-10-08: the hunting spot chosen on the dashboard changed (or went back to auto) -> pick again now
      if (manualSpotChanged() && !autoLvl.forceSpot) {
        note(`autolevel: the hunting spot was changed on the dashboard — picking again`, !solo);
        autoLvl.spot = null; lastPick = 0; writeClaim(null); continue;
      }
