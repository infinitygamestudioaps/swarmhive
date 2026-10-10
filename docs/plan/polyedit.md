# Shape editor (POLYEDIT) — edit rooms, spots, zones and field areas on the dashboard

User 2026-10-08 22:50: *"Under /rooms, /spots and /zones it should be possible for me to edit each thing, so I can drag or change the zone to my fitting."*

## Where

| Tab | Entry point | What it edits | File |
|---|---|---|---|
| **Rooms** (`#/rooms`) | pick dungeon / floor / room → **✎ Edit this room's outline** | a dungeon room (all 914 rooms, catacombs included) | `Scripts/data/dungeon_rooms.json` |
| **Spots** (`#/spots`) | box **✎ Edit a spot's shape** (filter + list) | hunting spots of the Spots table (custom zones), the datapack spots (the bots' fallback list), field areas | `custom_zones.json`, `hunting_spots_h5.json`, `field_areas.json` |
| **Zones** (`#/zones`) | **✎ Drag-edit shape** in the Zone editor title (the zone picked there), or the box **✎ Edit a zone's shape** | custom zones, field areas | `custom_zones.json`, `field_areas.json` |

Direct links: `#/edit/room/<room id>`, `#/edit/zone/<zone name>`, `#/edit/spot/<index in hunting_spots_h5.json>`, `#/edit/area/<area id>`.

The editor opens full screen (works on iPhone, iPad and desktop). The old Zone editor and the full-screen spot editor (`#/spot/...`: waypoints, exclusions, pull routes, floors) stay as they are; this editor only changes the shape and the simple fields.

## How to use

- **Drag a point** to move it. **Tap / click the small +** on an edge to add a point there (or drag the + to add and move at once).
- **Delete a point:** double-tap / double-click it, hold it (touch, 0.65 s), or select it and press **✕ Point** / Del. At least 3 points stay.
- **✥ Move shape:** drag anywhere to move the whole shape (a room's centre moves along). **✎ Points** goes back.
- **Rooms:** the red cross is the room centre (where the leader walks to and what "is someone in this room" measures) — drag it.
- **Circles** (zones / datapack spots without a polygon): drag the red centre or the yellow radius handle. The dashed yellow square is the area the bots hunt in today (3 × radius, at least 9000). **▱ Make polygon** turns it into a 12-point polygon of that size (datapack spots: optionally the monster area, the dotted purple outline); after saving, the party hunts only inside the polygon.
- **☠ Fit to monsters:** outline around the item's own monsters (or the monsters of its level range inside), padded; ignores walls — check the edges.
- **Zoom / pan:** two fingers (pinch), mouse wheel; drag the empty map with one finger / the mouse. **⤢** fits the shape.
- **Undo / redo:** ↶ ↷ or Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z). Ctrl+S saves. Esc closes the panel / unselects / goes back.
- **☰ panel:** name, levels (rooms: monster levels + "suits party level"), enabled, centre x/y/z + radius (rooms, circles), height band (rooms, field areas), notes; "Levels from monsters inside"; "Undo all changes"; **Reset to generated** (only for items edited here before); for rooms "update the monster list from the spawns inside" on save.
- **Context on the map:** the other rooms of the floor / nearby zones, spots and field areas (faint, toggle **▱ others**), monsters from the datapack spawns (☠; colour = level against the item's range: grey low, green fits, orange a bit above, red too high; purple = raid boss; white ring = its own monsters; faded = outside the shape), safe spots (⛨), the walk-in route, floor entry, exclusions / pull routes / waypoints / sub-areas of a zone.
- **Live numbers** (bottom): points, area (as an equal square), monsters inside by level, % of its own monsters inside, monsters of other rooms inside, warnings (outline crosses itself = cannot save, centre outside, geodata).
- **Geodata:** **Check walls** asks the server (docs/plan/tools/geopath.js, L2J geodata) whether every point stands on walkable ground of the item's height band (within 48) and whether an edge runs through ≥ 128 units of rock / wall (orange ring / orange dashes). **⌖ Snap** checks after every edit and moves a dragged point that landed off the walkable ground onto the nearest walkable cell (up to ~320 away). Generated room outlines give no warnings; touching a wall is fine.

## Saving

Save asks for confirmation (summary of points, area, monsters, levels, and when the bots pick it up) and then `POST /api/polyedit?kind=..&id=..`:

1. **Validation** (server and page): ≥ 3 and ≤ 400 points, numbers inside the world, no self-intersection, no two neighbouring points on top of each other, size ≥ 200 × 200 and ≤ 40000 wide (rooms) / 80000 (others), levels 1-99 with min ≤ max, radius 100-20000, height band ≤ 4000. Warnings (saved anyway): room centre outside the outline, outline moved > 6000 from the old centre (the saved walk-in route still ends at the old place), zone renamed (a party's spot chosen by the old name must be chosen again). A "rooms" spot (hunts inside a dungeon's rooms) cannot get a polygon.
2. **Conflict check:** the item's revision (hash) from when it was opened must still match the file; otherwise 409 "changed on disk" and the page offers to reload.
3. **Write:** under the lock `<file>.lock`, re-read, change only that item, then **atomic** write (`<file>.<pid>.tmp` → parse check → rename). The file keeps its format: `dungeon_rooms.json` and `field_areas.json` compact, `custom_zones.json` / `hunting_spots_h5.json` / `zone_subareas.json` as on disk (indent 1). Ids never change (a zone's id is its name; renaming is allowed when unique).
4. **History:** before every write the whole file is copied to `Scripts/data/history/<file>_<time>.json`; the last 50 per file are kept.
5. **Marks:** the item gets `manual: true` and `edited: { by: 'dashboard', at, orig }` — `orig` = the generated values from before the first edit (used by **Reset to generated**). Datapack spots also get `edited.key` (original centre) + `origName`, because their names are not unique.
6. **Derived fields:** rooms: `area`, `polyInfo` (`method/quality: 'manual'`, corners, `ownInside` %, `foreignInside`, `insideSpawns`, `before` = old quality); zones / spots / areas with a polygon: centre = average of the corners, radius = farthest corner (same as the old zone editor), zones also get their L2Swarm `.zmap` (`Settings/zones/<name>.zmap`, as `POST /api/zones` does). Field areas: `polyInfo` manual.
7. **Background recomputes** (child processes, never in the dashboard process; status `GET /api/polyedit?action=jobs`, log `Logs/polyedit.log`):
   - room outline / centre / height band changed → the floor gets `safeSpotsStale` and `docs/plan/tools/polyedit_safespots.js --dungeon <name> --floor <i>` recomputes that floor's safe spots (same algorithm as safe_spots.js, ids kept where a spot stayed, locked read-modify-write of only that floor, ~1 s for Cruma floor 1); the mark is removed when done.
   - a plain circle zone moved / resized, or a polygon added → `zone_subareas.js` re-runs (zones with a polygon are not split into sub-areas).
   - field area outline changed → the region gets `safeSpotsStale`; recompute with `node docs/plan/tools/field_areas.js --only <region>` (not started automatically: a region run takes minutes).

## Generator tools keep your edits (manual guard)

`docs/plan/tools/manual_guard.js`: `isManual(item)`, `writeGuarded(file, data, kind)` = lock + re-read the file on disk + copy the user-owned fields of every manual item from disk into the data the tool writes + atomic write in the file's own format. So an edit survives even when it was made while a tool was running.

| Tool | Guard |
|---|---|
| `room_polys.js` | skips manual rooms when it replaces outlines; guarded write |
| `room_refine.js` | manual rooms are never "problem rooms", never merged / marked duplicate, centre z not snapped; guarded write |
| `safe_spots.js` | guarded write (it only writes `floor.safeSpots`; clears `safeSpotsStale`) |
| `spots.js` | guarded write (`hunting_spots_h5.json`, manual spots matched by name + original centre) |
| `zone_subareas.js` | guarded write; entries marked `manual` are kept; env `POLYEDIT_DATA` / `POLYEDIT_REF` for sandbox runs |
| `field_areas.js` | **TODO (another agent's file, not edited by the shape-editor work):** replace `fs.writeFileSync(FILE, JSON.stringify(out))` with `require('./manual_guard').writeGuarded(FILE, out, 'area')` (it then keeps dashboard-edited areas by id; one whose region vanished is reported). |

User-owned fields per kind: `manual_guard.js` `USER_FIELDS`.

## When the bots use a change (swarm.js, Scripts_dev 2026-10-08)

| Kind | Read by swarm.js | Effect of a save |
|---|---|---|
| room | `dungeonRooms()` caches `dungeon_rooms.json` **forever** (until the script reloads); `escFloor()` (escape map) re-reads every 5 min only while that cache is empty | the leader hunts in the new outline after the next swarm.js reload / deploy; members' escape map within 5 min |
| zone | `customZones()` reads `custom_zones.json` at every spot pick | next pick (a party hunting there now keeps the old shape until it picks again) |
| spot | `huntingSpots()` caches `hunting_spots_h5.json` **forever** | after the next reload / deploy (`spot.poly` [{x,y}] is honoured by the hunt loop like a custom zone's polygon — not yet tested live) |
| area | `fieldAreas()` re-reads `field_areas.json` when its write time changed, checked every 10 min (leaders / solo) | within 10 min |
| zone sub-areas | `zoneSubAreas` re-reads `zone_subareas.json` every 10 min | within 10 min |

**Needed in swarm.js (not done — swarm.js is another agent's file):**
1. Re-read `dungeon_rooms.json` when it changes: in `dungeonRooms()` keep the `File.GetLastWriteTime` stamp (as `fieldAreas()` does) and reset `DROOMS` when it differs (checked at most every 1-5 min — it is a 2.2 MB parse). Same for `huntingSpots()` (`spotsCache`).
2. "Enabled" off is honoured only for custom zones today. One-line checks: rooms in `pickRoom` (`if (r.enabled === false) return;`), datapack spots in the `pickSpot` datapack loop (`if (s.enabled === false) continue;`), field areas in the field-area filter (`if (a.enabled === false) return false;`).

## API (Dashboard/server.js block "POLYEDIT", module Dashboard/polyedit_api.js)

- `GET /api/polyedit?list=room,zone,spot,area` → pickers.
- `GET /api/polyedit?kind=&id=` → `{ item, rev, context { neighbours, safeSpots, spawns (+own), stats, band, effSquare, hull, holes, circles, lines, subareas, points, mapZ }, live, file }`.
- `POST /api/polyedit?kind=&id=` `{ rev, item, applyMonsters, force }` → `{ ok, id, rev, item, changed, warnings, history, live, jobs }` (400 invalid, 404 unknown, 409 conflict).
- `POST /api/polyedit?action=reset&kind=&id=` `{ rev }` → back to `edited.orig`, manual mark removed.
- `POST /api/polyedit?action=geocheck` `{ points:[[x,y]], band:[zLo,zHi], open }` → `{ points:[{ok, z, snap}], edges:[true|false|null] }`.
- `GET /api/polyedit?action=jobs`.

Needs a **dashboard server restart** to become active (server.js changed; until then the page shows "needs a restart" in the pickers). index.html / polyedit.js / polyedit.css are read on every request.

## Tests

- `node docs/plan/tools/test_polyedit.js` (66 checks, temp copies only; `--quick` skips the child processes): validation, room save (format, only that room, manual + orig, polyInfo, stale mark, job), history pruning to 50, 409 conflict, invalid = file untouched, applyMonsters, guarded tool writes (survives a stale tool write, dropped room put back, spots / sub-areas / field areas merges), static guard check of every tool, reset, zones (circle, polygon, format, .zmap, rename collision, rooms spot), datapack spot, field areas (both file shapes), geodata, the safe-spot child with a concurrent edit, zone_subareas.js with a manual entry.
- `node docs/plan/tools/mobile_check/polyedit_cdp.mjs [iphone] [desktop]`: headless Edge against a sandbox server (:8097, temp data copies, /api/polyedit on the copies, every other GET proxied read-only to :8090, other POSTs refused): opens the editor from the Rooms tab, drags a vertex, inserts a point, undo / redo, pinch (iPhone) / wheel zoom, geodata check, panel, save; zone circle → polygon → drag → move shape → save; Spots / Zones pickers; page width; console errors. Screenshots `docs/plan/mobile_check/polyedit_<device>_<n>_<step>.png`, report `polyedit_report.json`.

## Kind `raidarea` (2026-10-09): raid fight areas

`#/edit/raidarea/<raid boss npc id>` (boss page -> **✎ Edit fight area**). File `Scripts/data/raid_areas.json` (`{ about, areas: { "<id>": { boss, fight, clear, clearMargin, clearPassive, stage, enabled, notes, manual, edited, updated } } }`, created on the first save; same lock / atomic write / history / 409 as the other kinds; "Reset" = **Remove this fight area**). Two layers in one item (fight = `poly`; while the clear layer is edited `poly` is the clear outline and `fightPoly` the fight area), a draggable stage flag, a circle starter. Server: RAID FIGHT AREAS block in `polyedit_api.js` (`raHandle`, `raValidate`, `raList`; `GET ?list=raidarea`). Bots: swarm.js RAIDAREA (see `docs/guide/pages/raid-area.md`). Tests: `test_raid_area.js`, `mobile_check/raidarea_cdp.mjs`.
