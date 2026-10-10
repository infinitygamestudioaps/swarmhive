// Applies the ROOM POLYS patch (2026-10-08) to Scripts_dev/swarm.js — written as a patch because another agent edits swarm.js at the same
// time. Every edit is anchored on an exact text that must occur exactly once; if ANY anchor is missing or not unique, nothing is written
// (the report says which). A backup goes to Settings/backup/swarm_dev_before_roompolys_<time>.js. Running it twice is refused (marker).
// The inserted code lives in apply_room_polys.blocks.js (split at //@@BLOCK lines).
//
// What it does in swarm.js (details: docs/plan/dungeon_rooms.md "Room polygons"):
//  - room spots carry the room polygon + height band: L2Swarm combat zone = SetCombatPolygon(room) (the existing drawn-area branch), the
//    leader's targets only inside the room (+100) and its z band, no zoneScale enlargement; autoLvl.zone.poly for the dashboard;
//  - members get the room (swarm.room): same combat polygon, targets only inside it (unless they are hit), walk back inside after 6 s outside;
//  - catacomb / necropolis rooms (floor enter.how 'ziggurat'): enterDungeon first, then the walk to the room;
//  - occupied by other players decided on arrival (~20 s): 2+ foreign players together, 1 with a summon, or 1 lone hunter in a small area for
//    2 min; shared with our other parties (_occupied in spot_claims.json is now honoured by spotBlock); monsters foreign players fight are
//    never our targets; intent + log line 'occupied by <names>';
//  - manual hunting spot per party (Scripts/data/party_spots.json from the dashboard) wins over pickSpot; level misfit = warning; occupied
//    by others = automatic choice (retry within 5 min) unless "stay"; a change on the dashboard re-picks at once.
//  - datapack spots inside a catacomb are no longer treated as "inside a rooms dungeon" (catacombs are in dungeon_rooms.json now).
//
// Use:  node apply_room_polys.js [--file <swarm.js>] [--dry]      (default file: Scripts_dev/swarm.js)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const argv = process.argv.slice(2);
const fi = argv.indexOf('--file');
const FILE = fi >= 0 ? path.resolve(argv[fi + 1]) : path.join(ROOT, 'Scripts_dev', 'swarm.js');
const DRY = argv.includes('--dry');
const MARK = 'ROOM POLYS PATCH 2026-10-08 BEGIN';

function blocks() {
  const t = fs.readFileSync(path.join(__dirname, 'apply_room_polys.blocks.js'), 'utf8').replace(/\r\n/g, '\n');
  const out = {}; let cur = null, buf = [];
  t.split('\n').forEach(l => { const m = l.match(/^\/\/@@BLOCK (\w+)/); if (m) { if (cur) out[cur] = buf.join('\n'); cur = m[1]; buf = []; } else if (cur) buf.push(l); });
  if (cur) out[cur] = buf.join('\n');
  Object.keys(out).forEach(k => { out[k] = out[k].replace(/\n+$/, '') + '\n'; });
  return out;
}

/** edits: { name, anchor, mode: 'before' | 'after' | 'replace' | 'afterLine', text } — anchor must be unique */
function edits(B) {
  const OLD_ROOMSPOT = [
    'function roomSpot(z, lvl) {',
    '  const b = pickRoom(z.rooms, lvl); if (!b) return null;',
    '  const g = b.d.gatekeeperRoute || {};',
    '  return { name: `${b.d.name}: ${b.r.name}`, levelMin: z.levelMin, levelMax: z.levelMax, center: { x: b.r.center[0], y: b.r.center[1], z: b.r.center[2] },',
    '    radius: Math.max(600, b.r.radius || 800), noScale: true, gk: g.town && g.destination ? { from: g.town, desc: `${g.town} -> ${g.destination}` } : null,',
    '    custom: true, room: { dungeon: b.d.name, floor: b.fi, id: b.r.id, name: b.r.name, fit: b.off === 0, busy: b.busy } };',
    '}', ''].join('\n');
  return [
    { name: 'helpers (room polygons, members, occupied, manual spot)', anchor: 'function pickRoom(dName, lvl) {', mode: 'before', text: B.helpers + '\n' },
    { name: 'roomSpot -> roomSpotOf (polygon, z band, radius covers the polygon)', anchor: OLD_ROOMSPOT, mode: 'replace', text: B.roomspot },
    { name: 'enterRoom: catacombs via enterDungeon', anchor: '  if (!onFloor(target)) {\n    for (let i = 0; i <= spot.room.floor; i++) {', mode: 'before', text: B.enterzig },
    { name: 'huntTarget: room polygon +100, foreign players\' monsters',
      anchor: "    if (autoLvl.spot && autoLvl.spot.poly && autoLvl.spot.poly.length >= 3 && !inPolygon(mb.X, mb.Y, autoLvl.spot.poly)) return;   // outside the drawn area",
      mode: 'replace',
      text: "    if (autoLvl.spot && autoLvl.spot.poly && autoLvl.spot.poly.length >= 3 && !(autoLvl.spot.room ? nearPolygon(mb.X, mb.Y, autoLvl.spot.poly, 100) : inPolygon(mb.X, mb.Y, autoLvl.spot.poly))) return;   // outside the drawn area / the room (ROOM POLYS PATCH: +100 for rooms)\n" +
            "    if (foreignTagged(mb)) return;                                          // another player's monster: never ours (ROOM POLYS PATCH 2026-10-08)" },
    { name: 'hunt loop: zone carries the room polygon', anchor: "autoLvl.zone = { x: Math.round(center.x), y: Math.round(center.y), r: Math.round(usedMap ? radius : sqSide()), name: autoLvl.spot ? autoLvl.spot.name : 'local', zmap: usedMap ? autoLvl.spot.zmap : null };", mode: 'afterLine', text: B.zonepoly },
    { name: 'occupiedCheck: fast foreign check first (old one kept as occupiedCheckOld)', anchor: 'function occupiedCheck(spot, center, radius) {', mode: 'replace',
      text: "function occupiedCheck(spot, center, radius) {   // ROOM POLYS PATCH 2026-10-08: on-arrival check first (occupiedFast), then the old one\n" +
            "  const f = occupiedFast(spot, center); if (f) return f;\n  return occupiedCheckOld(spot, center, radius);\n}\nfunction occupiedCheckOld(spot, center, radius) {" },
    { name: 'markOccupied: intent + manual spots retry in 5 min', anchor: "  const m = `autolevel: ${spot.name} is occupied by ${by} — skipped for ${Math.round(ms / 60000)} min, picking another spot`;", mode: 'afterLine',
      text: "  try { intent('occupied', m.replace(/^autolevel: /, ''), spot.center); } catch (e) { }   // ROOM POLYS PATCH 2026-10-08\n" +
            "  if (spot.manual && !spot.manualStay) spotOcc[key].until = now() + 300000;              // the dashboard's choice: try it again in 5 min\n" },
    { name: 'spotBlock: occupied spots seen by our other parties', anchor: "  if (spotOccupied(key)) return `occupied by ${spotOcc[key].by || 'others'}`;", mode: 'afterLine',
      text: "  { const so = sharedOccupied(key); if (so) return so; }   // another of our parties saw other players there (ROOM POLYS PATCH 2026-10-08)\n" },
    { name: 'pickSpot: the manual spot first', anchor: '  if (autoLvl.forceSpot) return autoLvl.forceSpot;                       // !dungeon <name> / !assist <name>', mode: 'afterLine',
      text: "  { const ms = manualSpot(level, solo); if (ms) return ms; }              // the party's hunting spot chosen on the dashboard (ROOM POLYS PATCH 2026-10-08)\n" },
    { name: 'hunt loop: dashboard choice changed -> re-pick', anchor: '      // NO SHARED HUNTING AREAS (user 2026-10-08 16:55): foreign players hunting in our area', mode: 'before', text: B.huntloopmanual },
    { name: 'hunt loop: a "stay" manual spot is never given up as occupied', anchor: '      if (autoLvl.spot && !autoLvl.forceSpot) {\n        const occ = occupiedCheck(autoLvl.spot, center, radius);', mode: 'replace',
      text: '      if (autoLvl.spot && !autoLvl.forceSpot && !autoLvl.spot.manualStay) {\n        const occ = occupiedCheck(autoLvl.spot, center, radius);' },
    { name: 'nnFight: members/leader pick only monsters inside the room',
      anchor: "try { snapMobs().forEach(m => { if (!ok(m) || huntBlacklisted(m.objId) || (boss && String(m.Name) === boss)) return; const dz = Math.hypot(m.X - Z.x, m.Y - Z.y); if (dz > Z.r) return;",
      mode: 'replace',
      text: "try { snapMobs().forEach(m => { if (!ok(m) || huntBlacklisted(m.objId) || (boss && String(m.Name) === boss)) return; const dz = Math.hypot(m.X - Z.x, m.Y - Z.y); if (dz > Z.r) return; if (!inHuntRoom(m) || foreignTagged(m)) return;" },
    { name: 'pickSpot: catacombs are not a "rooms dungeon" for datapack spots', anchor: 'dungeonRooms().some(d => (d.floors || []).some(f => f.z && c.z >= f.z[0] - 300', mode: 'replace',
      text: 'dungeonRooms().some(d => !d.catacomb && (d.floors || []).some(f => f.z && c.z >= f.z[0] - 300' },
  ];
}

function count(hay, needle) { let n = 0, i = -1; while ((i = hay.indexOf(needle, i + 1)) >= 0) n++; return n; }
function apply(src, list) {
  const problems = [];
  list.forEach(e => { const n = count(src, e.anchor); if (n !== 1) problems.push(`${e.name}: anchor found ${n}x — ${JSON.stringify(e.anchor.slice(0, 110))}`); });
  if (problems.length) return { ok: false, problems };
  let out = src;
  list.forEach(e => {
    const i = out.indexOf(e.anchor);
    if (e.mode === 'before') out = out.slice(0, i) + e.text + out.slice(i);
    else if (e.mode === 'after') out = out.slice(0, i + e.anchor.length) + e.text + out.slice(i + e.anchor.length);
    else if (e.mode === 'replace') out = out.slice(0, i) + e.text + out.slice(i + e.anchor.length);
    else if (e.mode === 'afterLine') { let j = out.indexOf('\n', i + e.anchor.length); if (j < 0) j = out.length; out = out.slice(0, j + 1) + e.text + out.slice(j + 1); }
  });
  return { ok: true, out };
}

module.exports = { blocks, edits, apply, MARK };

if (require.main === module) {
  if (!fs.existsSync(FILE)) { console.error('no such file: ' + FILE); process.exit(2); }
  const raw = fs.readFileSync(FILE, 'utf8');
  const crlf = /\r\n/.test(raw), src = raw.replace(/\r\n/g, '\n');
  if (src.includes(MARK)) { console.error(`REFUSED: ${FILE} already contains the patch (${MARK}).`); process.exit(3); }
  const B = blocks(), list = edits(B);
  const r = apply(src, list);
  if (!r.ok) { console.error('REFUSED — nothing written. Anchors not found exactly once:\n  ' + r.problems.join('\n  ')); process.exit(4); }
  // syntax check of the result before anything is written
  const tmp = path.join(require('os').tmpdir(), 'swarm_roompolys_check_' + process.pid + '.js');
  fs.writeFileSync(tmp, r.out);
  try { cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
  catch (e) { console.error('REFUSED — the patched file does not parse:\n' + String(e.stderr || e.message).slice(0, 2000)); try { fs.unlinkSync(tmp); } catch (er) { } process.exit(5); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  list.forEach(e => console.log('ok  ' + e.name));
  if (DRY) { console.log(`DRY RUN: ${list.length} edits would apply to ${FILE} (+${r.out.length - src.length} chars). Nothing written.`); process.exit(0); }
  const bdir = path.join(ROOT, 'Settings', 'backup'); fs.mkdirSync(bdir, { recursive: true });
  const bak = path.join(bdir, 'swarm_dev_before_roompolys_' + new Date().toISOString().replace(/[:.]/g, '-') + '.js');
  fs.copyFileSync(FILE, bak);
  fs.writeFileSync(FILE, crlf ? r.out.replace(/\n/g, '\r\n') : r.out);
  console.log(`PATCHED ${FILE} (${list.length} edits, backup ${bak}). Deploy as usual (docs/plan/tools/deploy_swarm.ps1).`);
}
