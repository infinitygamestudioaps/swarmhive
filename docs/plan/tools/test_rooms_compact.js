// OFFLINE TEST ROOMSCOMPACT (2026-11-17, owner: "fix 2" = the rooms file must not get bloated again).
// dungeon_rooms.json + field_areas.json are big files every bot reads. One indented write on 2026-11-10 20:58 made dungeon_rooms.json 5.7 MB
// (2.4 MB compact) and manual_guard / the dashboard room editor then KEPT that layout on every later write. Now both always write them
// compact (no BOM); every other file keeps its own layout. Scratch folder only - the live data files are only READ.
//   node docs/plan/tools/test_rooms_compact.js
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const G = require(path.join(ROOT, 'docs', 'plan', 'tools', 'manual_guard.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m); } };
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'roomscompact-'));
const compact = (f) => { const raw = fs.readFileSync(f, 'utf8'); return raw.charCodeAt(0) !== 0xFEFF && !raw.includes('\n'); };
try {
  const rooms = [{ name: 'Test Dungeon', floors: [{ name: 'F1', rooms: [{ id: 'room-a', name: 'A', poly: [[0, 0], [10, 0], [10, 10]] }, { id: 'room-b', name: 'B', poly: [[1, 1], [2, 2], [3, 1]] }] }] }];
  // 1) an INDENTED + BOM dungeon_rooms.json, written by a tool with kind 'room' -> compact, no BOM
  const RF = path.join(SB, 'dungeon_rooms.json');
  fs.writeFileSync(RF, '\uFEFF' + JSON.stringify(rooms, null, 2).replace(/\n/g, '\r\n'));
  G.writeGuarded(RF, JSON.parse(JSON.stringify(rooms)), 'room', { quiet: true });
  ok(compact(RF), 'tool write (kind room) of an indented + BOM dungeon_rooms.json -> compact, no BOM');
  ok(JSON.stringify(JSON.parse(fs.readFileSync(RF, 'utf8'))) === JSON.stringify(rooms), 'the content is unchanged');
  // 2) the same without a kind (cave_rooms.js / cave_dungeon.js call writeGuarded(file, data))
  fs.writeFileSync(RF, JSON.stringify(rooms, null, 1));
  G.writeGuarded(RF, JSON.parse(JSON.stringify(rooms)));
  ok(compact(RF), 'tool write WITHOUT a kind -> compact (the rule goes by the file name)');
  // 3) field_areas.json indented -> compact
  const AF = path.join(SB, 'field_areas.json');
  const areas = { regions: [{ id: 'r1', name: 'R', areas: [{ id: 'a1', poly: [[0, 0], [5, 0], [5, 5]] }] }] };
  fs.writeFileSync(AF, JSON.stringify(areas, null, 1));
  G.writeGuarded(AF, JSON.parse(JSON.stringify(areas)), 'area', { quiet: true });
  ok(compact(AF), 'tool write of an indented field_areas.json -> compact');
  // 4) any other file keeps its own layout (hand-readable files stay indented)
  const OF = path.join(SB, 'hunting_spots_h5.json');
  fs.writeFileSync(OF, JSON.stringify([{ name: 'x', x: 1 }], null, 1));
  G.writeGuarded(OF, [{ name: 'x', x: 2 }], 'spot', { quiet: true });
  ok(/\n /.test(fs.readFileSync(OF, 'utf8')), 'another file (hunting_spots_h5.json) keeps its indented layout');
  // 5) fmtFor: the one rule both writers use
  ok(typeof G.fmtFor === 'function' && G.fmtFor('C:\\x\\Scripts\\data\\dungeon_rooms.json', { bom: true, indent: 2, eol: '\r\n' }).indent === null
    && G.fmtFor('/a/field_areas.json', { indent: 1 }).indent === null && G.fmtFor('C:\\x\\custom_zones.json', { indent: 1 }).indent === 1, 'fmtFor: compact for the two bot files, the given format for others');
  // 6) the dashboard room editor uses it on every rooms / areas write (save, reset, merge, id remap)
  const PE = fs.readFileSync(path.join(ROOT, 'Dashboard', 'polyedit_api.js'), 'utf8');
  ok((PE.match(/G\.fmtFor \? G\.fmtFor\((file|f), t\.fmt\) : t\.fmt/g) || []).length >= 3 && !/G\.stringifyLike\((data|j), t\.fmt\)\)/.test(PE), 'polyedit_api.js writes rooms / areas through fmtFor (no raw t.fmt layout copy left)');
  // 7) the live files are compact now (read only)
  for (const f of ['dungeon_rooms.json', 'field_areas.json']) {
    const p = path.join(ROOT, 'Scripts', 'data', f);
    if (fs.existsSync(p)) ok(compact(p), `live Scripts/data/${f} is compact`);
  }
} finally { try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { } }
console.log(`rooms compact (ROOMSCOMPACT 2026-11-17): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
