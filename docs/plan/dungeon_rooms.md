# Dungeon floors and rooms (levelling inside dungeons)

Data: `Scripts/data/dungeon_rooms.json` (one entry per dungeon, floors, rooms, walk routes). Generated 2026-10-07 from the L2J High Five datapack copy in `Scripts/data`
(spawns, npc stats, teleports), the live gatekeeper menus in `Scripts/data/gk_live`, and our geodata path finder `docs/plan/tools/geopath.js`. Nothing here was walked in game yet.

How to read it:
- **Floor** = a height band (z) of the dungeon. Floors are reached by walking, stairs, or a teleporter NPC inside the dungeon.
- **Room** = a group of monster spawn points close together (spawns within ~900 of each other, big groups split so a room is at most ~2000 across).
- **Side** = left / right / straight / behind as seen from the floor entry looking into the floor (the "facing" is given per floor). The compass direction is given too, because it is less ambiguous (y grows to the south in L2).
- **Walk** = length of the geodata route to the room centre: from the floor entry (where the walk routes step onto that floor) / from where the floor is entered (landing or dungeon entrance). One number = both are the same. "no route" = the path finder found no way; check by hand. The waypoints are in the JSON (`route`).
- **Party level** = the party's LOWEST level that fits the room: monsters from (party - 3) to (party + 2).
- **(A)** = aggressive according to the datapack npc stats (`<ai isAggressive>` + aggroRange). Not checked live; L2Toggle shows aggressive monsters with an "A" in the title.
- Rooms marked **DANGER** have monsters 5+ levels above the rooms next to them.

## Floor links, room graph and hallway centrelines (2026-10-09)

User 07:30: "It can't reach level 2 of Cruma Tower. You HAVE to use the teleporter and then go through each room one by one to get there. This is the
same principle for all dungeons, there is no straight path to a room." 08:00: "There are 2 gatekeepers in Cruma Tower." 09:10 (members stuck behind
walls on Cruma floor 2): "teach it to walk in the middle of these walkways ... walk point by point in hallways via rooms until you get to your
destination". 09:15: "routes always follow those centerlines, in points 150–300 units apart ... never a straight line."

**Cruma Tower, the real floor connections** (datapack html `Scripts/data/dp/html_teleporter/*.htm` + `ai_teleports/CrumaTower__*`, spawn list, live pages):

| From | NPC (client name / spawn list name, id) | Stands at | Link | Leads to | Evidence |
|---|---|---|---|---|---|
| outside (tower door) | Mozella / Carsus 30483 | 17296,114176,-3439 | "Teleport into the Tower." (script, level <= 55) | 1st floor landing ~17776,113968,-11671 | live page + dungeon.log |
| 1st floor landing | **Penelope** / Rombel 30487 | 17877,113970,-11672 (30 from the landing) | "Teleport to the 2nd floor." (tp 23) | 2nd floor north end 17776,108288,-9056 | **live: Logs/floor_Penelope_*.html, 06:52 / 06:57 / 07:12 teleported** |
| 1st floor landing | Ponti / Janssen 30484 | 17555,113967,-11675 | "Return to the ground" (tp 22) | outside 17253,114232,-3440 | live page (the old wrong choice for floor 2) |
| 2nd floor north end | Capella / Belkadhi 30485 | 17725,108220,-9057 | "Return to the first floor." (tp 24) | 1st floor landing | datapack |
| 2nd floor SOUTH end | Hanna / Ian 30486 | 17722,119749,-9068 | "Go to the 3rd floor." (tp 55) | 3rd floor 17719,115590,-6584 | datapack; reached room by room across floor 2 |
| 3rd floor | Teleportation Cubic 31843 | 17719,115430,-6582 | "Go back to the 2nd floor." (58) / "Teleport into The Core room." (56) | 2nd floor next to Hanna / Core | datapack |

The "2 gatekeepers" on the 1st floor are Ponti (way out) and Penelope (way up), 300 apart at the same landing; the bots clicked the wrong one.

**Data.**
- `floors[].links` (docs/plan/tools/floor_links.js): every way OFF a floor `{ to (floor index | -1 outside | 'core'), kind npc|device|walk, at, land, npc {id, name, spawnlistName, x,y,z, link}, linkText, tpId|ev, needs, verified (true = seen live | 'geodata' | false), evidence, path (stairs waypoints) }`; `d.entryLinks` = ways in from outside. Sources: the floor's `enter`, a KNOWN table (Cruma), and every teleporter NPC standing in/at the dungeon whose datapack menu (html `goto` ids -> l2j_teleport.sql landings, AI scripts' Location tables: Mithril Teleport Crystals, Separated Souls, Klein) lands on a floor. Stairs / ramps (room_graph.js): geopath between floors, the part between the bands = `path`.
- **Room graph** per floor in `Scripts/data/dungeon_graph/<key>.json` (docs/plan/tools/room_graph.js; dungeon_rooms.json keeps `floors[].graphStats` only — every bot window reads dungeon_rooms.json, only the ones walking in a dungeon load its graph): `{ v: [[id, x, y, z, node, kind, ref]], nodes: [{id, kind room|corridor, room?, poly? (corridor outline), cells}], e: [[a, b, len, cost, [x,y,z,...] waypoints, node]] }`.
  - nodes = the room polygons (cells inside the outline + z band) and the corridors (connected walkable cells outside every room; pieces < 400 cells join their neighbour)
  - doors = where two nodes touch: a cluster of boundary cells, the door vertex = its cell with the most clearance (the MIDDLE of the opening)
  - vertices: doors, room centres, the floor entry, link starts (`la<i>`) and landings (`lb<from>_<i>`), safe spots, spine points (`m…`) on every corridor / dead end (farthest-point, pulled onto the middle line)
  - edges: inside one node, Dijkstra with step cost x (1 + 200/(1+clearance)^2) (the middle of hallways, ~8 cells off room walls), each vertex kept with its 4 cheapest + a spanning tree; the path is cut into straight legs <= 280 that are wall-checked on the grid (a diagonal step needs both ways round the corner open, like geopath.js) and stay <= 40 off the path
  - pockets (parts of a floor the in-band flood could not join: stairwells, halls at other heights) are stitched to the main part by the shortest of 8 geopath walks
- **Planner** (swarm.js ROOMGRAPH-PURE `rgBuild` / `rgPlan` / `rgLocate`): all floors + links in one graph (+ an 'outside' vertex), Dijkstra on walk length (+15 % of the narrow-passage penalty), npc links 1500, raid bosses within 1200 of an edge +40000 unless they are the target. A start / end point is put onto the NEAREST CENTRELINE point (an edge waypoint inside the room/corridor that holds it). Steps: walk (the leg's waypoints) / stairs / npc (floorTeleport, z check) / enter.
- **Walking** (`rgWalk`): waypoint by waypoint (straight server moves, L2Swarm's pathing as a fallback for one leg), stuck = re-plan from where I stand (max 4), the leader waits for the team at every door, sends the route to the members (`swarm.roomroute`) and every floor teleport (`swarm.floortp` with the NPC that worked). Used by enterRoom / multiRoomMove (room trips), walkToInner inside a dungeon (rescue, stuck-follow, walking back to stragglers, disengage), the escape walk to its safe spot, goToNpc; members follow along the centreline (`rgFollowTick`, > 700 from the leader on the same floor).
- **Live:** `Logs/floor_links_live.json` (per "<dungeon>|<floor>" which NPC had the link / not), `swarm_state.route` (the waypoints being walked, next index, target, stuck, re-plans), intent "route", dungeon.log "route: ...".
- **Check images:** `docs/plan/room_polys/graph/<key>_f<n>.png` (render: `powershell docs\plan\tools\render_room_checks.ps1 -Dir docs\plan\room_polys\graph`): walkable cells, room outlines, green centreline edges, yellow doors, magenta links/landings; Cruma f1/f2/f3 carry the planned route outside -> 3rd floor, `cruma_f2_west_to_left-b.png` the user's 09:10 case. Report: `docs/plan/room_polys/graph_report.json`.
- **Tests:** test_floor_links.js, test_room_graph.js, test_rescue_floors.js (Penelope), test_npc_nav.js, test_town_graph.js.

## Room polygons, new rooms, catacombs and safe spots (2026-10-08)

User 2026-10-08 17:35: "In Cruma Tower there are multiple rooms; ideally it should take a room and stay there, so the square should fit the room ...
same for all other dungeons, catacombs, necropolis, Antharas Lair, Monastery of Silence". 18:12: "It should also add 'safe' spots in corridors".

**Data (Scripts/data/dungeon_rooms.json, compact JSON now, 2.2 MB, 30 dungeons, 914 rooms after the refine pass of 2026-10-08 evening (906 + 8 split off), of which 503 new: 82 in the 16 old dungeons, 421 in the catacombs/necropolises; 328 safe spots):** every room has
`poly` [[x,y],...] (8-40 corners), `zRange` [zMin,zMax], `area` (game units²), `polyInfo` {quality, method, T, ownSpawns, ownWithin150 %,
foreignInside, ...}; `center`/`radius`/ids are unchanged. Every floor has `safeSpots` [{id, name, x, y, z, clearance, monsterClear, roomClear,
wallClear, tier 'safe'|'tight', nearRooms:[{id, walk}]}]. New rooms carry `added: '2026-10-08'`. The 14 catacombs/necropolises are new dungeon
entries (`catacomb: <name>`, one floor "Inside" with `enter.how: 'ziggurat'`, `monsterIds`).

**Tools:** `docs/plan/tools/room_polys.js` (polygons + new rooms + catacombs, ~10 min because of the walk routes of new rooms;
`--images-only` re-draws the check images from the data in ~1 min), `docs/plan/tools/safe_spots.js` (safe spots, 20 s; room_polys.js calls it too),
`docs/plan/tools/render_room_checks.ps1` (check images). Check images: `docs/plan/room_polys/index.html` (one PNG per floor: the floor's map layer,
walkable geodata faint cyan, each room in its colour with its spawns as dots, labels "id NEW (quality) levels", safe spots as green shields;
the table lists every room with its quality numbers and every safe spot). Backups of the data file: `Settings/backup/dungeon_rooms_before_*`.

### Method
1. **Walkable cells of the floor:** flood fill over the L2J geodata (16-unit cells, NSWE walls, height steps <= 48, same rule as geopath.js) inside
   the floor's z band, from every room centre, every monster spawn of the floor and the floor entry.
2. **Clearance:** walking distance from each cell to the nearest wall/edge (walls between two cells count, so two rooms behind a thin wall stay apart).
3. **Cut the doorways:** for T = 4..28 cells the "core" = cells with clearance >= T; doorways/corridors narrower than 2T fall away. Each room takes
   the smallest T at which its core holds no other room centre (the biggest shape that is still only this room); rooms that never separate (two
   spawn groups in one hall) split the shared core by walking distance ("shared-hall").
4. **Grow back** by T (first come first served), cap at max(1600, 2.4 x radius) walking distance ("open-capped" in open caves).
5. **Neck cut:** a wide corridor that leads nowhere stays attached at the isolating T (Cruma 2nd floor alcoves). For bigger T the room body's
   convex hull + T*16+100 is kept; accepted only when it keeps (almost) all the room's monsters and what goes is a real protrusion (>= 55 % of it
   more than 300 outside the hull of what stays) — big halls with inner wall rings keep their corners.
6. **Outline:** holes filled, boundary traced along cell edges, Douglas-Peucker (tolerance raised until <= 40 corners, never self-intersecting).
7. **Fallback "spawn-hull":** when the geodata gives no clean room (own monsters < 50 % near the outline, tiny area, centre not inside): convex hull
   of the room's own spawns + 250, clipped to walkable cells connected to the centre that no other room holds.
8. **New rooms:** monster spawns that no polygon covers (rooms the 2026-10-07 clustering merged away, monster corridors, and every room of the
   catacombs) are grouped by the geodata room they stand in (core at the floor's typical T) — big open areas split by distance (900) — and become
   rooms in the old format (id `<prefix>-<floor>-<side>-<next letter>`, name, monsters with level/count/aggressive, levelRange, suitsPartyLevel,
   walk `route` from the floor entry via geopath, `routeLength`). A new room without a route is never picked automatically (pickRoom needs `route`).
9. **Check:** spawns of the floor are assigned to the nearest room centre (as when the rooms were made): own = share of the room's spawns inside /
   within 150 of its outline, foreign = other rooms' spawns inside. Quality: good | open-capped | shared-hall | spawn-hull | check (own < 70 % or
   foreign > 20 %) | none.
10. **Safe spots:** walkable cells outside every room polygon (+150), >= 48 from a wall, >= max(1200, aggro range + 300) from every monster
    spawn of the band (aggro_h5.json; 'tight' = >= max(900, aggro + 150) when nothing better is in reach). Every room gets the one nearest by
    walking (12000 max; a 'safe' one unless it is > 4000 away and a 'tight' one is less than half as far); spots within 700 merged.

### Per dungeon (rooms / new / quality / safe spots / rooms without a walk route), after the refine pass of 2026-10-08 19:55

| Dungeon | Floors | Rooms | New | good | open-capped | shared-hall | spawn-hull | check | none | duplicate | Safe spots | No route |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cruma Tower | 3 | 35 | 4 | 29 | 3 | 0 | 3 | 0 | 0 | 0 | 11 | 0 |
| Giant's Cave | 2 | 32 | 6 | 27 | 1 | 0 | 4 | 0 | 0 | 0 | 18 | 0 |
| Antharas' Lair | 2 | 51 | 11 | 39 | 3 | 2 | 3 | 0 | 0 | 4 | 22 | 1 |
| Monastery of Silence | 2 | 40 | 10 | 34 | 1 | 0 | 5 | 0 | 0 | 0 | 18 | 0 |
| Mithril Mines | 4 | 35 | 2 | 30 | 3 | 1 | 1 | 0 | 0 | 0 | 12 | 0 |
| Forge of the Gods + Valakas approach (Hall of Flames) | 3 | 45 | 5 | 38 | 4 | 0 | 3 | 0 | 0 | 0 | 24 | 0 |
| Ant Nest | 1 | 35 | 9 | 24 | 1 | 0 | 9 | 0 | 0 | 1 | 4 | 0 |
| Elven Fortress (underground) | 1 | 13 | 3 | 11 | 0 | 0 | 2 | 0 | 0 | 0 | 1 | 0 |
| Abandoned Coal Mines | 3 | 16 | 1 | 8 | 2 | 5 | 1 | 0 | 0 | 0 | 14 | 0 |
| Cave of Trials | 1 | 23 | 2 | 17 | 3 | 1 | 2 | 0 | 0 | 0 | 3 | 0 |
| Tower of Insolence | 12 | 41 | 7 | 33 | 2 | 0 | 6 | 0 | 0 | 0 | 20 | 0 |
| Pagan Temple | 2 | 53 | 19 | 33 | 0 | 0 | 20 | 0 | 0 | 0 | 18 | 0 |
| Crypts of Disgrace | 1 | 14 | 1 | 7 | 1 | 1 | 5 | 0 | 0 | 0 | 13 | 0 |
| Frozen Labyrinth (open area by the Ice Merchant Cabin) | 1 | 39 | 1 | 29 | 3 | 7 | 0 | 0 | 0 | 0 | 36 | 0 |
| Imperial Tomb (outer halls) | 3 | 14 | 1 | 10 | 2 | 0 | 2 | 0 | 0 | 0 | 9 | 0 |
| Dragon Valley cave (Death Pass) | 1 | 7 | 0 | 0 | 0 | 6 | 1 | 0 | 0 | 0 | 3 | 0 |
| Necropolis of Sacrifice | 1 | 38 | 38 | 38 | 0 | 0 | 0 | 0 | 0 | 0 | 11 | 0 |
| Catacomb of the Heretic | 1 | 36 | 36 | 36 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 0 |
| Pilgrim's Necropolis | 1 | 29 | 29 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 0 |
| Catacomb of the Branded | 1 | 38 | 38 | 38 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 0 |
| Necropolis of Worship | 1 | 21 | 21 | 21 | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 0 |
| Catacomb of the Apostate | 1 | 37 | 37 | 37 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 0 |
| Patriot's Necropolis | 1 | 32 | 32 | 32 | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 0 |
| Catacomb of the Witch | 1 | 36 | 36 | 36 | 0 | 0 | 0 | 0 | 0 | 0 | 13 | 0 |
| Necropolis of Devotion | 1 | 27 | 27 | 27 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 0 |
| Necropolis of Martyrdom | 1 | 19 | 19 | 19 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 |
| Catacomb of Dark Omens | 1 | 28 | 28 | 28 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 |
| Catacomb of the Forbidden Path | 1 | 18 | 18 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 |
| Saint's Necropolis | 1 | 29 | 29 | 29 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 0 |
| Disciple's Necropolis | 1 | 33 | 33 | 33 | 0 | 0 | 0 | 0 | 0 | 0 | 13 | 0 |

"No route" counts rooms without a walk route; duplicates are not counted (they are never picked). 914 rooms, 908 with a walk route, 328 safe spots.

### Refine pass 2026-10-08 evening (`docs/plan/tools/room_refine.js`)
User 19:25: "Fix: 66 of the room outlines in open caves are marked 'check' and may be rough". The same pass also covered the 3 Antharas rooms without a polygon and the 12 rooms without a walk route.

**Before → after** (problem = quality check / none): 63 check + 3 none → **0 check, 0 none**. Per dungeon before (check + none): Giant's Cave 4, Antharas 7 + 3,
Monastery 5, Mithril 6, Forge 2, Ant Nest 8, Elven Fortress 2, Cave of Trials 3, ToI 8, Pagan 6, Crypts 3, Frozen 7, Imperial Tomb 2. All of them are 0 now. Rooms without
a walk route: 12 → 1 (`antharas-1-behind-c`, see "What remains"). Every one of the 914 rooms passes the gates below (`gates on all 914 rooms: 0 fail`).

**What was wrong (diagnosis):**
- Most "check" rooms were a **counting artefact plus real rough edges**. room_polys.js gave every spawn to the nearest room centre of ANY room. So a 1-monster
  room (pagan-1-right-a, Zombie Worker) "owned" 3 Zombie Workers wandering in the corridors 2000 away, and some rooms "owned" monsters that stand inside the
  neighbour's outline. The real problems on top of that:
  - outlines that ran into the next room through wide openings, so other rooms' monsters were inside (antharas-1-straight-c, forge-1-straight-g with 11, pagan-1-straight-e/h)
  - rooms whose monsters stand partly in a second piece of cave behind a wall or another room
  - outlines that overlapped each other (pagan-1-straight-e / -h)
- **Antharas straight-o/-p/-q** (no polygon): the datapack spawn heights are wrong (z -776 / -3552 where the geodata only has the mountain top at z 160 and the
  lower dens). L2J puts those monsters on the ground below, which is inside the floor-2 rooms `antharas-2-left-e`, `-2-left-a` and `-2-left-c`. Those rooms already
  hold them. → quality **duplicate**, with `duplicateOf`, no polygon and no route (never picked).
- `antharas-1-straight-u` (a new room of 2026-10-08) has the same 10 Dragon Guards/Mages as `antharas-1-straight-j`, 279 apart → duplicate of j (j keeps them).
  `antnest-1-straight-w` (new, spawn-hull) was left with 1 spawn of its own → merged into `antnest-1-straight-u`.
- **Routes:**
  - Forge Hall of Flames (4 rooms) had no landing. Klein's teleport lands at 183813,-115157,-3303 (`Scripts/data/dp/npcs/ai/GrandBossTeleporters.java`
    ENTER_HALL_OF_FLAMES), behind the gate Klein guards. All 4 rooms are walkable from there → `floor.enter.landing` + `entryPoint` set, routes 16-28k.
  - forge-1-right-m/-n: the direct search from the dungeon entrance ran out of search space. Going via the floor entry point works (55k).
  - forge-2-straight-f: forge-2-left-a's route + 1.2k.
  - imperialtomb-1-behind-c: the datapack centre z -3034 is 340 below the only ground layer (-2696) → centre z snapped (`centerZDatapack` keeps the old value), route 30k.

**Method (room_refine.js).** Only problem rooms change. Every other outline stays as it is, and ids never change.
1. *Ownership rule (validation):* a spawn that stands inside a kept outline belongs to that room. Otherwise it belongs to the nearest centre of a room that LISTS its
   monster, within that room's radius + 900 (the 2026-10-07 clustering distance). A spawn farther away is a stray that no room owns.
2. *Partition* (geodesic Voronoi with chokepoint cost) of the floor's walkable geodata, on the same grid as room_polys.js:
   - cells inside kept outlines are taken
   - each problem room grows from its own spawns (snapped to the floor layer nearest the spawn's z) and from its centre
   - kept rooms' spawns outside their outline grow 300, so no other room swallows them
   - step cost x (1 + 3 x max(0, 1 - clearance / 8 cells)): cheap in the open, expensive in narrow passages → two rooms meet in the doorway or the narrow part
   - growth: 700 (cost units) from the own spawns, max(1600, 2.4 x radius) from the centre
3. *Split:* own spawns that stand in a second, separate piece of ground:
   - 3 or more monsters → a NEW room. 8 were made: antharas-1-straight-v, monastery-1-left-n, monastery-2-right-r, -right-s, -straight-b, -straight-c,
     antnest-1-straight-y, toi-10-right-a. Ids follow the room_polys.js rule, and each got a walk route.
   - 1-2 monsters → strays (`polyInfo.strays`, 45 spawns over 28 rooms, owned by no room).
   - A kept room's spawn that a new outline walls in on every side → it belongs to that new room (`enclosedSpawns`).
4. *Outline:* the component with the most own spawns, holes filled. Douglas-Peucker uses the smallest tolerance that gives <= 40 corners and loses no own
   spawn and takes no neighbour's. 48 / 64 corners are allowed when needed (frozen-1-behind-d has 61).
5. *Gates* (every room):
   - own spawns inside or within 100 of the outline (= the bots' hunting rule, huntTarget room + 100) >= 90 %
   - other rooms' spawns inside <= 5 % of own (in practice 0)
   - overlap with any other outline of the floor (overlapping z bands) < 5 %
   - area >= 100,000 and <= pi x cap²

   The old outline is kept when it scores as well. 3 passes, because a changed room changes its neighbours' counts: 102, 15 and 1 rooms.
   Rooms that failed only under the new rule (62 "good" rooms with monsters in the corridor outside) were refined too (`before.quality` = good).
6. *Monster list:* for a refined room this is the spawns it really holds now. `polyInfo.listedBefore` keeps the old count, and levelRange / suitsPartyLevel follow the new list.
7. *Safe spots* were recomputed (safe_spots.js, same grid) on the 24 floors that changed. A spot within 200 of an old one keeps its id. Every safe spot is
   at least 150 outside every outline.

Fields:
- refined rooms: `polyInfo.method 'partition'`, `refined`, `before {quality, method, ownWithin150, foreignInside}`, `ownInside` (= the +100 rule), `overlapPct`,
  `strays`, `enclosedSpawns`, `splitFrom`, `listedBefore`
- duplicates: `quality 'duplicate'`, `duplicateOf`

Run log: `docs/plan/room_polys/refine_report.json`. Backup: `Settings/backup/dungeon_rooms_before_refine_2026-10-08T17-54-03-136Z.json`.
Use: `node docs/plan/tools/room_refine.js [--only key] [--dry] [--debug] [--no-routes]`, then `node docs/plan/tools/room_polys.js --images-only`. A rerun finds nothing to do.
Note: a full `room_polys.js` run (not `--images-only`) would recompute every outline the old way and undo this pass. Run room_refine.js after it.

### What remains
- **antharas-1-behind-c** (1 Drakos Assassin) has no walk route. It stands on a ledge at z -2480 above the cave floor (-3296). The ledge (about 1.9 M units²)
  has no walkable link to the lair: geopath found no way from the entrance, the floor entry point or 6 junctions on the neighbours' routes. It is one monster,
  not a hunting room, and is never picked automatically.
- 5 duplicates (antharas-1-straight-o/-p/-q/-u, antnest-1-straight-w) keep their ids but have no polygon and no route.
- 45 stray spawns (1-2 monsters cut off behind a wall from their room) are in no room. The bots only fight them when attacked.
- Nothing here was walked in game. The partition outlines follow the geodata, not the map art. The map images were not used as a wall hint, because the geodata walls were enough.

### Rooms changed by the refine pass (130; quality before → after, own spawns, inside (+100), foreign, area, notes)
| Dungeon | Room | Before | After | Method | Own | Inside | Foreign | Area | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Giant's Cave | giants-1-left-b | check | good | partition | 15 | 100% | 0 | 3.07 M | list 22->15 |
| Giant's Cave | giants-1-straight-e | good | good | partition | 27 | 100% | 0 | 5.05 M | list 28->27 |
| Giant's Cave | giants-1-left-g | good | good | partition | 4 | 100% | 0 | 1.52 M |  |
| Giant's Cave | giants-2-left-a | check | good | partition | 8 | 100% | 0 | 3.28 M | 3 stray, list 17->8 |
| Giant's Cave | giants-2-left-b | check | good | partition | 12 | 100% | 0 | 5.57 M | 1 stray |
| Giant's Cave | giants-2-left-d | check | good | partition | 2 | 100% | 0 | 1.39 M | 3 stray, list 5->2 |
| Giant's Cave | giants-2-straight-d | good | good | geodata | 5 | 100% | 0 | 0.82 M | 1 stray |
| Giant's Cave | giants-2-left-e | good | good | partition | 5 | 100% | 0 | 0.92 M | list 4->5 |
| Antharas' Lair | antharas-1-straight-c | check | good | partition | 10 | 100% | 0 | 1.5 M | list 19->10 |
| Antharas' Lair | antharas-1-straight-d | check | good | partition | 11 | 100% | 0 | 2.38 M | list 17->11 |
| Antharas' Lair | antharas-1-right-b | check | good | partition | 6 | 100% | 0 | 1.33 M | list 12->6 |
| Antharas' Lair | antharas-1-right-c | check | good | partition | 11 | 100% | 0 | 2.8 M | 1 enclosed, list 12->11 |
| Antharas' Lair | antharas-1-straight-i | good | good | partition | 21 | 100% | 0 | 3.11 M | list 22->21 |
| Antharas' Lair | antharas-1-straight-j | check | good | partition | 10 | 100% | 0 | 0.76 M |  |
| Antharas' Lair | antharas-1-straight-o | none | duplicate of antharas-2-left-e | none |  |  |  |  |  |
| Antharas' Lair | antharas-1-straight-p | none | duplicate of antharas-2-left-a | none |  |  |  |  |  |
| Antharas' Lair | antharas-1-straight-q | none | duplicate of antharas-2-left-c | none |  |  |  |  |  |
| Antharas' Lair | antharas-1-straight-u | spawn-hull | duplicate of antharas-1-straight-j | none |  |  |  |  |  |
| Antharas' Lair | antharas-1-right-f | good | good | partition | 6 | 100% | 0 | 1.13 M | list 4->6 |
| Antharas' Lair | antharas-1-straight-v | (new, split from antharas-1-straight-d) | good | partition | 7 | 100% | 0 | 0.86 M |  |
| Antharas' Lair | antharas-2-left-b | check | good | partition | 20 | 100% | 0 | 0.88 M |  |
| Antharas' Lair | antharas-2-left-d | check | good | partition | 29 | 100% | 0 | 2.79 M | list 40->29 |
| Antharas' Lair | antharas-2-left-e | good | good | partition | 25 | 100% | 0 | 2.52 M | list 26->25 |
| Antharas' Lair | antharas-2-left-f | good | good | partition | 15 | 100% | 0 | 3.46 M |  |
| Monastery of Silence | monastery-1-left-d | open-capped | good | partition | 4 | 100% | 0 | 0.55 M | list 8->4 |
| Monastery of Silence | monastery-1-left-n | (new, split from monastery-1-left-d) | good | partition | 4 | 100% | 0 | 0.47 M |  |
| Monastery of Silence | monastery-2-right-b | shared-hall | good | partition | 6 | 100% | 0 | 1.71 M | list 11->6 |
| Monastery of Silence | monastery-2-right-c | check | good | partition | 9 | 100% | 0 | 2.57 M | list 14->9 |
| Monastery of Silence | monastery-2-right-d | check | good | partition | 3 | 100% | 0 | 0.64 M |  |
| Monastery of Silence | monastery-2-right-f | check | good | geodata | 4 | 100% | 0 | 2.03 M | list 9->4 |
| Monastery of Silence | monastery-2-right-k | check | good | partition | 6 | 100% | 0 | 1.49 M | list 15->6 |
| Monastery of Silence | monastery-2-right-l | check | good | partition | 6 | 100% | 0 | 1.95 M | list 13->6 |
| Monastery of Silence | monastery-2-right-q | good | good | geodata | 3 | 100% | 0 | 0.98 M | 1 stray, list 4->3 |
| Monastery of Silence | monastery-2-right-r | (new, split from monastery-2-right-c) | good | partition | 6 | 100% | 0 | 1.94 M | list 3->6 |
| Monastery of Silence | monastery-2-straight-b | (new, split from monastery-2-right-k) | good | partition | 6 | 100% | 0 | 1.51 M |  |
| Monastery of Silence | monastery-2-straight-c | (new, split from monastery-2-right-k) | good | partition | 3 | 100% | 0 | 1.17 M |  |
| Monastery of Silence | monastery-2-right-s | (new, split from monastery-2-right-b) | good | partition | 3 | 100% | 0 | 0.98 M |  |
| Mithril Mines | mithril-1-right-b | good | good | partition | 12 | 100% | 0 | 2.39 M |  |
| Mithril Mines | mithril-1-left-b | check | good | partition | 2 | 100% | 0 | 0.24 M | 2 stray, list 4->2 |
| Mithril Mines | mithril-1-straight-c | check | good | partition | 1 | 100% | 0 | 0.19 M | 2 stray, list 5->1 |
| Mithril Mines | mithril-1-straight-d | good | good | geodata | 9 | 100% | 0 | 1.06 M | 2 stray, list 11->9 |
| Mithril Mines | mithril-2-straight-b | check | good | geodata | 1 | 100% | 0 | 0.56 M | list 2->1 |
| Mithril Mines | mithril-2-straight-e | good | good | partition | 11 | 100% | 0 | 4.16 M | list 12->11 |
| Mithril Mines | mithril-2-straight-g | check | good | geodata | 1 | 100% | 0 | 0.2 M | list 3->1 |
| Mithril Mines | mithril-2-straight-i | good | good | geodata | 8 | 100% | 0 | 1.68 M | 1 stray, list 10->8 |
| Mithril Mines | mithril-3-left-b | check | good | geodata | 3 | 100% | 0 | 0.4 M | list 5->3 |
| Mithril Mines | mithril-3-straight-d | check | good | partition | 8 | 100% | 0 | 1.15 M |  |
| Mithril Mines | mithril-3-straight-e | spawn-hull | good | partition | 7 | 100% | 0 | 1.42 M |  |
| Mithril Mines | mithril-3-right-b | good | good | partition | 2 | 100% | 0 | 1.06 M |  |
| Forge of the Gods + Valakas approach | forge-1-straight-f | good | good | partition | 16 | 100% | 0 | 2.1 M | list 31->16 |
| Forge of the Gods + Valakas approach | forge-1-straight-g | check | good | partition | 21 | 100% | 0 | 4.04 M | list 20->21 |
| Forge of the Gods + Valakas approach | forge-1-right-b | check | good | partition | 25 | 100% | 0 | 3.16 M | list 28->25 |
| Forge of the Gods + Valakas approach | forge-1-straight-k | good | good | geodata | 3 | 100% | 0 | 0.5 M | 1 stray |
| Forge of the Gods + Valakas approach | forge-3-right-b | good | good | partition | 4 | 100% | 0 | 0.78 M |  |
| Ant Nest | antnest-1-straight-a | check | good | geodata | 2 | 100% | 0 | 0.19 M |  |
| Ant Nest | antnest-1-straight-b | check | good | partition | 20 | 100% | 0 | 3.46 M |  |
| Ant Nest | antnest-1-straight-c | check | good | partition | 5 | 100% | 0 | 1.22 M | list 4->5 |
| Ant Nest | antnest-1-straight-e | good | good | partition | 27 | 100% | 0 | 2.25 M | list 28->27 |
| Ant Nest | antnest-1-straight-f | check | good | partition | 11 | 100% | 0 | 3.33 M | list 20->11 |
| Ant Nest | antnest-1-straight-h | good | good | partition | 6 | 100% | 0 | 1.53 M |  |
| Ant Nest | antnest-1-straight-j | check | spawn-hull | spawn-hull | 11 | 100% | 0 | 1.09 M | list 20->11 |
| Ant Nest | antnest-1-right-b | check | good | partition | 12 | 100% | 0 | 1.61 M |  |
| Ant Nest | antnest-1-straight-m | check | spawn-hull | spawn-hull | 6 | 100% | 0 | 1.32 M | list 8->6 |
| Ant Nest | antnest-1-straight-o | open-capped | good | partition | 7 | 100% | 0 | 1.26 M |  |
| Ant Nest | antnest-1-straight-q | spawn-hull | good | partition | 29 | 100% | 0 | 2.16 M | 4 stray, list 32->29 |
| Ant Nest | antnest-1-left-f | good | good | partition | 8 | 100% | 0 | 0.54 M |  |
| Ant Nest | antnest-1-straight-u | check | spawn-hull | spawn-hull | 10 | 100% | 0 | 0.24 M | list 6->10 |
| Ant Nest | antnest-1-straight-v | good | good | partition | 8 | 100% | 0 | 0.95 M | list 5->8 |
| Ant Nest | antnest-1-straight-w | spawn-hull | duplicate of antnest-1-straight-u | none |  |  |  |  |  |
| Ant Nest | antnest-1-left-g | good | good | partition | 5 | 100% | 0 | 0.39 M | list 3->5 |
| Ant Nest | antnest-1-straight-y | (new, split from antnest-1-straight-j) | good | partition | 9 | 100% | 0 | 2.5 M |  |
| Elven Fortress | elvenfortress-1-left-c | check | good | geodata | 4 | 100% | 0 | 0.37 M | 2 stray, list 6->4 |
| Elven Fortress | elvenfortress-1-left-e | good | good | geodata | 5 | 100% | 0 | 1.01 M | 1 stray, list 6->5 |
| Elven Fortress | elvenfortress-1-left-g | check | spawn-hull | spawn-hull | 5 | 100% | 0 | 1.68 M | 2 stray, list 9->5 |
| Elven Fortress | elvenfortress-1-left-i | good | good | geodata | 4 | 100% | 0 | 0.36 M | 1 stray |
| Abandoned Coal Mines | coalmines-1-left-c | shared-hall | good | partition | 14 | 100% | 0 | 7.13 M | list 16->14 |
| Cave of Trials | caveoftrials-1-straight-a | check | good | partition | 8 | 100% | 0 | 1.95 M |  |
| Cave of Trials | caveoftrials-1-straight-b | check | good | partition | 15 | 100% | 0 | 3.8 M | list 16->15 |
| Cave of Trials | caveoftrials-1-straight-g | good | good | partition | 11 | 100% | 0 | 0.87 M | list 15->11 |
| Cave of Trials | caveoftrials-1-left-j | check | good | geodata | 1 | 100% | 0 | 1.09 M |  |
| Cave of Trials | caveoftrials-1-straight-i | good | good | partition | 4 | 100% | 0 | 0.47 M | list 3->4 |
| Tower of Insolence | toi-4-left-a | good | good | partition | 16 | 100% | 0 | 3.88 M | list 18->16 |
| Tower of Insolence | toi-4-right-a | check | good | partition | 15 | 100% | 0 | 4.24 M |  |
| Tower of Insolence | toi-4-straight-a | check | good | partition | 11 | 100% | 0 | 3.89 M | list 12->11 |
| Tower of Insolence | toi-4-straight-b | check | good | partition | 12 | 100% | 0 | 4.55 M | list 13->12 |
| Tower of Insolence | toi-4-left-b | good | good | partition | 3 | 100% | 0 | 1.01 M | 1 stray |
| Tower of Insolence | toi-5-left-a | good | good | geodata | 6 | 100% | 0 | 2.03 M | 2 stray, list 9->6 |
| Tower of Insolence | toi-5-straight-a | good | good | partition | 10 | 100% | 0 | 3.7 M | list 15->10 |
| Tower of Insolence | toi-5-right-a | check | good | partition | 5 | 100% | 0 | 1.07 M | 2 stray, list 4->5 |
| Tower of Insolence | toi-5-right-b | check | good | partition | 6 | 100% | 0 | 1.92 M | list 11->6 |
| Tower of Insolence | toi-5-straight-b | good | good | partition | 7 | 100% | 0 | 1.68 M | list 6->7 |
| Tower of Insolence | toi-7-left-a | good | good | geodata | 8 | 100% | 0 | 3.21 M | 1 stray, list 12->8 |
| Tower of Insolence | toi-10-straight-a | check | good | partition | 7 | 100% | 0 | 3.43 M |  |
| Tower of Insolence | toi-10-straight-b | check | good | partition | 9 | 100% | 0 | 3.05 M | list 8->9 |
| Tower of Insolence | toi-10-straight-c | check | good | geodata | 4 | 100% | 0 | 1.31 M | list 7->4 |
| Tower of Insolence | toi-10-straight-d | spawn-hull | spawn-hull | spawn-hull | 5 | 100% | 0 | 1.43 M | 2 stray, list 8->5 |
| Tower of Insolence | toi-10-right-a | (new, split from toi-10-straight-c) | good | partition | 3 | 100% | 0 | 1.78 M |  |
| Pagan Temple | pagan-1-right-a | check | good | geodata | 1 | 100% | 0 | 0.22 M |  |
| Pagan Temple | pagan-1-left-a | check | good | geodata | 1 | 100% | 0 | 0.21 M |  |
| Pagan Temple | pagan-1-straight-a | check | good | geodata | 17 | 100% | 0 | 12.38 M | 1 stray, list 20->17 |
| Pagan Temple | pagan-1-right-g | check | good | geodata | 3 | 100% | 0 | 0.29 M |  |
| Pagan Temple | pagan-1-straight-b | good | good | partition | 13 | 100% | 0 | 3 M | 1 stray, list 21->13 |
| Pagan Temple | pagan-1-straight-c | good | good | partition | 16 | 100% | 0 | 3.41 M | list 17->16 |
| Pagan Temple | pagan-1-straight-d | spawn-hull | spawn-hull | spawn-hull | 13 | 100% | 0 | 3.49 M | 2 stray, list 21->13 |
| Pagan Temple | pagan-1-straight-e | check | good | partition | 18 | 100% | 0 | 3.27 M | list 37->18 |
| Pagan Temple | pagan-1-straight-h | check | good | partition | 10 | 100% | 0 | 2.7 M | list 17->10 |
| Pagan Temple | pagan-1-straight-y | spawn-hull | good | partition | 7 | 100% | 0 | 2.23 M | list 6->7 |
| Crypts of Disgrace | crypts-1-right-a | check | good | geodata | 8 | 100% | 0 | 4.49 M | list 10->8 |
| Crypts of Disgrace | crypts-1-straight-a | good | good | partition | 4 | 100% | 0 | 2.85 M | list 5->4 |
| Crypts of Disgrace | crypts-1-right-b | check | good | geodata | 2 | 100% | 0 | 1.32 M |  |
| Crypts of Disgrace | crypts-1-straight-e | check | good | partition | 13 | 100% | 0 | 5.57 M | 1 stray |
| Frozen Labyrinth | frozen-1-straight-b | check | good | partition | 2 | 100% | 0 | 1.38 M |  |
| Frozen Labyrinth | frozen-1-left-a | good | good | partition | 4 | 100% | 0 | 1.88 M | list 5->4 |
| Frozen Labyrinth | frozen-1-left-c | check | good | partition | 3 | 100% | 0 | 1.6 M | list 2->3 |
| Frozen Labyrinth | frozen-1-left-e | check | good | partition | 13 | 100% | 0 | 7.15 M | 1 stray, list 14->13 |
| Frozen Labyrinth | frozen-1-left-f | spawn-hull | good | partition | 8 | 100% | 0 | 3.92 M | list 9->8 |
| Frozen Labyrinth | frozen-1-behind-d | shared-hall | good | partition | 17 | 100% | 0 | 7.48 M | list 19->17 |
| Frozen Labyrinth | frozen-1-left-h | check | good | partition | 2 | 100% | 0 | 1.9 M | 1 stray |
| Frozen Labyrinth | frozen-1-straight-f | check | good | partition | 2 | 100% | 0 | 1.29 M | list 1->2 |
| Frozen Labyrinth | frozen-1-straight-i | check | good | partition | 9 | 100% | 0 | 3.35 M | list 10->9 |
| Frozen Labyrinth | frozen-1-straight-k | check | good | partition | 7 | 100% | 0 | 3.42 M |  |
| Imperial Tomb | imperialtomb-1-left-d | good | good | partition | 15 | 100% | 0 | 2.02 M |  |
| Imperial Tomb | imperialtomb-1-right-a | check | good | geodata | 7 | 100% | 0 | 3.56 M |  |
| Imperial Tomb | imperialtomb-1-left-f | check | spawn-hull | spawn-hull | 4 | 100% | 0 | 0.31 M | list 15->4 |
| Necropolis of Worship | worship-1-straight-b | good | good | partition | 10 | 100% | 0 | 1.29 M | 2 stray, list 9->10 |
| Necropolis of Worship | worship-1-straight-d | good | good | geodata | 6 | 100% | 0 | 1.01 M | 1 stray |
| Necropolis of Worship | worship-1-straight-g | good | good | partition | 6 | 100% | 0 | 1.3 M | list 5->6 |
| Necropolis of Worship | worship-1-straight-h | good | good | partition | 8 | 100% | 0 | 1.52 M | list 5->8 |
| Necropolis of Worship | worship-1-left-g | good | good | partition | 4 | 100% | 0 | 0.96 M | list 3->4 |
| Necropolis of Worship | worship-1-straight-l | good | good | partition | 4 | 100% | 0 | 1.08 M | list 3->4 |

### swarm.js wiring (patch, not deployed): `node docs/plan/tools/apply_room_polys.js` then the usual deploy
The patch (`apply_room_polys.js` + `apply_room_polys.blocks.js`, anchor-checked, backup in Settings/backup/swarm_dev_before_roompolys_*.js, refuses
when an anchor is missing or the patch is already in) changes Scripts_dev/swarm.js:
- `roomSpot` -> `roomSpotOf`: the room spot carries `poly` [{x,y}], `floor` {zMin,zMax} (= zRange), `safeSpots`, and a radius that covers the
  whole polygon; `noScale` as before (zoneScale/tactics never enlarge a room). The existing drawn-area branch then does `SetCombatPolygon(room)`
  (L2Swarm 3.8.8 prelude: `SetCombatPolygon(outer [[x,y]], inner [])` -> `Context.SetCombatPolygonJson(json, json)`, selects Polygon mode; the
  square stays the fallback when the call fails). `huntTarget`: only monsters inside the room +100 and inside its z band (+150).
- `autoLvl.zone.poly/room/zr` -> swarm_state.zone (dashboard) and `swarm.room` to the members every 15 s; members set the same combat polygon,
  `nnFight` picks only monsters inside the room (monsters that hit them are still fought), and a member standing outside the room for 6 s with
  nothing to do walks back to the leader (if he is inside) or the room centre (straight moves). The room ending -> the square zone again.
- Catacomb rooms: `enterRoom` calls `enterDungeon()` first (walk in, else the Ziggurat), then walks to the room.
- Occupied by other players, decided on arrival (every 4 s): 2+ foreign players (not roster, not party, not my clan / MyClan) in the room
  polygon (+250, z band) for 20 s, or one fighting with a summon/pet (monsters near him fight an object that is neither a player nor a monster),
  or one lone player fighting in a small area (room / sub-area) for 2 min -> occupied 30 min, `intent('occupied', ...)` + the old log line
  "is occupied by <names>". Shared: `spotBlock` now also honours the `_occupied` lists the other parties write into Logs/spot_claims.json.
  Monsters a foreign player fights (his target, or their target is him) are never our targets (`foreignTagged`).
- Manual hunting spot per party: `Scripts/data/party_spots.json` (dashboard), read every 15 s; wins over pickSpot; level misfit = warning in
  party chat; occupied by others = automatic choice now and the manual spot again within 5 min, unless "stay" (then the occupied check is skipped);
  a change on the dashboard makes the leader pick again at once.
- Datapack spots inside a catacomb are not excluded as "inside a rooms dungeon" (the catacombs are in this file now).
- Test: `node docs/plan/tools/test_apply_room_polys.js` (45 checks, patches a copy, mocks players/monsters/claims/party_spots).

**Field names used by other code:** `room.poly`, `room.zRange`, `floor.safeSpots` (the escape fix reads it live), `floor.enter.how === 'ziggurat'`.

## Overview

| Dungeon | Levels | Get in | Floors | Rooms |
|---|---|---|---|---|
| [Cruma Tower](#cruma) | 40-50 | Dion: gatekeeper Trisha "Cruma Tower" | 3 | 31 |
| [Giant's Cave](#giants) | 80-82 | Aden (datapack link, live text not recorded) | 2 | 26 |
| [Antharas' Lair](#antharas) | 83-86 | Hunters Village: gatekeeper Esmeralda "Antharas's Lair" | 2 | 40 |
| [Monastery of Silence](#monastery) | 83-84 | Goddard (datapack link, live text not recorded) | 2 | 30 |
| [Mithril Mines](#mithril) | 81-82 | Schuttgart: gatekeeper Bilia "Mithril Mines" | 4 | 33 |
| [Forge of the Gods + Valakas approach (Hall of Flames)](#forge) | 78-78 | Goddard (datapack link, live text not recorded) | 3 | 40 |
| [Ant Nest](#antnest) | 29-38 | Gludio: gatekeeper Bella "The Ant Nest" | 1 | 26 |
| [Elven Fortress (underground)](#elvenfortress) | 10-17 | Elven Village: gatekeeper Mirabel "Elven Fortress" | 1 | 10 |
| [Abandoned Coal Mines](#coalmines) | 10-19 | Dwarven Village: gatekeeper Wirphy "Abandoned Coal Mines" | 3 | 15 |
| [Cave of Trials](#caveoftrials) | 10-22 | Orc Village: gatekeeper Tamil "Cave of Trials" | 1 | 21 |
| [Tower of Insolence](#toi) | 60-75 | Aden (datapack link, live text not recorded) | 12 | 34 |
| [Pagan Temple](#pagan) | 78-78 | Rune | 2 | 34 |
| [Crypts of Disgrace](#crypts) | 81-82 | Schuttgart: gatekeeper Bilia "Crypts of Disgrace" | 1 | 13 |
| [Frozen Labyrinth (open area by the Ice Merchant Cabin)](#frozen) | 53-63 | Schuttgart (datapack link, live text not recorded) | 1 | 38 |
| [Imperial Tomb (outer halls)](#imperialtomb) | 74-78 | Goddard (datapack link, live text not recorded) | 3 | 13 |
| [Dragon Valley cave (Death Pass)](#dvcave) | 45-60 | Hunters Village: gatekeeper Esmeralda "Dragon Valley" | 1 | 7 |

<a id="cruma"></a>
## Cruma Tower (monsters 40-50)

**How to get in.** Teleport from Dion with gatekeeper Trisha -> "Cruma Tower" (~2300 adena) (text seen in the live menu), landing (17225, 114173, -3440).

**Entrance.** Gatekeeper Mozella (30483) stands at the tower door, ~70 from the Dion gatekeeper landing (17225,114173,-3440). The tower floors are NOT walkable from outside: every floor is reached by an NPC teleport. The marsh monsters around the tower (lvl 25-35) are the "outside" hunting that party Tank1 did. (17296, 114176, -3439).
Other teleports: Dion -> Cruma Marshlands (5106, 126916, -3664).

**Map layers** (`Maps/high`): 20_21, 20_21_1, 20_21_2, 20_21_3.

### 1st floor (z -12700 to -11300, monsters 40-45)

**Getting there:** teleporter via Mozella (30483, called Carsus in the spawn list) at (17296, 114176, -3439), floor entry (17781, 113999, -11672). Mozella teleports into the 1st floor (datapack AI CrumaTower.java, knowledge: random of (17776,113968,-11671)/(17680,113968,-11671); players above level 55 are refused). Landing used here = the datapack "2nd floor -> 1st floor" landing (17781,113999,-11672), same hall. Link text not recorded live.
Facing for left/right: north (entry is in the middle of the floor: facing north (left = west, right = east)).
Teleporters Ponti (30484, 17555,113967) and Penelope (30487, 17877,113970) stand at the landing: "1st floor -> Entrance" and "1st floor -> 2nd floor" (free).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| cruma-1-left-a | left (south-west) | 6306 | Catherok 42 (A) x5, Excuro 41 x4, Porta 40 x1 | 40-42 | 40-43 | DANGER: near Archon Suscepter (raid 45, 2010 away) |
| cruma-1-right-a | right (south-east) | 6482 | Excuro 41 x4, Catherok 42 (A) x4, Porta 40 x2, Mordeo 42 (A) x1 | 40-42 | 40-43 |  |
| cruma-1-left-b | left (south-west) | 8367 | Excuro 41 x3, Catherok 42 (A) x2, Porta 40 x1 | 40-42 | 40-43 | DANGER: near Archon Suscepter (raid 45, 191 away) |
| cruma-1-behind-a | behind (south-east) | 9721 | Excuro 41 x3, Catherok 42 (A) x3, Mordeo 42 (A) x2, Porta 40 x1 | 40-42 | 40-43 |  |
| cruma-1-left-c | left (south-west) | 10445 | Porta 40 x5 | 40-40 | 38-43 | DANGER: near Archon Suscepter (raid 45, 1620 away) |
| cruma-1-right-b | right (north-east) | 11791 | Ricenseo 43 x3, Catherok 42 (A) x3, Krator 44 x2 | 42-44 | 42-45 |  |
| cruma-1-right-c | right (south-east) | 11795 | Porta 40 x4, Mordeo 42 (A) x4, Catherok 42 (A) x4, Excuro 41 x3 | 40-42 | 40-43 |  |
| cruma-1-left-d | left (north-west) | 12345 | Ricenseo 43 x10, Catherok 42 (A) x5, Krator 44 x4, Snipe 44 x1 | 42-44 | 42-45 |  |
| cruma-1-left-e | left (south-west) | 14099 | Catherok 42 (A) x10, Excuro 41 x8, Mordeo 42 (A) x7, Porta 40 x5 | 40-42 | 40-43 | DANGER: near Archon Suscepter (raid 45, 3488 away) |
| cruma-1-right-d | right (south-east) | 14666 | Catherok 42 (A) x5, Excuro 41 x4, Mordeo 42 (A) x3, Porta 40 x2 | 40-42 | 40-43 |  |
| cruma-1-right-e | right (north-east) | 14673 | Shindebarn 44 x7, Ricenseo 43 x3, Krator 44 x2, Premo 45 x2, Snipe 44 x2 | 43-45 | 43-46 |  |
| cruma-1-left-f | left (north-west) | 16009 | Ricenseo 43 x3, Shindebarn 44 x3, Premo 45 x2 | 43-45 | 43-46 |  |
| cruma-1-left-g | left (north-west) | 16266 | Ricenseo 43 x8, Shindebarn 44 x8, Krator 44 x3, Snipe 44 x2, Premo 45 x1, Catherok 42 (A) x1 | 42-45 | 43-45 |  |
| cruma-1-left-h | left (north-west) | 16545 | Ricenseo 43 x4, Premo 45 x2, Shindebarn 44 x2, Snipe 44 x1 | 43-45 | 43-46 |  |
| cruma-1-right-f | right (north-east) | 19596 | Shindebarn 44 x5, Krator 44 x3, Ricenseo 43 x2, Snipe 44 x2, Premo 45 x1 | 43-45 | 43-46 |  |
| cruma-1-right-g | right (north-east) | 19827 | Ricenseo 43 x3, Shindebarn 44 x2, Krator 44 x1, Premo 45 x1, Snipe 44 x1 | 43-45 | 43-46 |  |

### 2nd floor (z -9700 to -8400, monsters 46-50)

**Getting there:** teleporter via Ponti (30484, called Janssen in the spawn list) at (17555, 113967, -11675), floor entry (17776, 108288, -9056). Ponti or Penelope (30487, 17877,113970,-11672) on the 1st floor landing, datapack teleport 23 "Cruma Tower 1st floor -> Cruma Tower 2nd floor" (free). Lands at the NORTH end of floor 2 (small y = north); Capella (30485, 17725,108220) there takes you back down (teleport 24).
Facing for left/right: south (floor entry -> centre of the floor spawns).
Hanna (30486) at the SOUTH end (17722,119749,-9068) teleports to the 3rd floor (teleport 55 "Cruma level 2 -> level 3", free).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| cruma-2-right-a | right (west) | 5222 | Validus 46 x3, Dicor 47 (A) x3 | 46-47 | 45-49 |  |
| cruma-2-left-a | left (east) | 5308 | Validus 46 x3, Dicor 47 (A) x3 | 46-47 | 45-49 |  |
| cruma-2-right-b | right (west) | 8285 | Ossiud 47 (A) x7, Validus 46 x5, Torfe 49 x4, Perum 48 (A) x2 | 46-49 | 47-49 |  |
| cruma-2-right-c | right (south-west) | 9743 | Ossiud 47 (A) x3, Torfe 49 x2, Perum 48 (A) x1 | 47-49 | 47-50 |  |
| cruma-2-left-b | left (east) | 9865 | Ossiud 47 (A) x5, Torfe 49 x4, Perum 48 (A) x2 | 47-49 | 47-50 |  |
| cruma-2-straight-a | straight (south-west) | 11714 | Torfe 49 x2, Ossiud 47 (A) x2 | 47-49 | 47-50 |  |
| cruma-2-right-d | right (south-west) | 11836 | Dicor 47 (A) x3 | 47-47 | 45-50 |  |
| cruma-2-left-c | left (south-east) | 14486 | Liangma 49 (A) x5, Torfe 49 x4, Death Knight 50 (A) x2, Perum 48 (A) x2, Dark Lord 50 (A) x2 | 48-50 | 48-51 |  |
| cruma-2-straight-b | straight (south-west) | 15114 | Torfe 49 x6, Liangma 49 (A) x6, Death Knight 50 (A) x3, Dark Lord 50 (A) x2 | 49-50 | 48-52 |  |
| cruma-2-left-d | left (south-east) | 17514 | Ossiud 47 (A) x4, Torfe 49 x2, Perum 48 (A) x1 | 47-49 | 47-50 |  |
| cruma-2-straight-c | straight (south) | 17570 | Torfe 49 x4, Liangma 49 (A) x3, Death Knight 50 (A) x1 | 49-50 | 48-52 |  |
| cruma-2-right-e | right (south-west) | 17761 | Liangma 49 (A) x5, Torfe 49 x2, Dark Lord 50 (A) x1 | 49-50 | 48-52 |  |
| cruma-2-left-e | left (south-east) | 18249 | Torfe 49 x3, Liangma 49 (A) x3, Death Knight 50 (A) x1, Dark Lord 50 (A) x1 | 49-50 | 48-52 |  |
| cruma-2-straight-d | straight (south) | 22281 | Torfe 49 x4, Liangma 49 (A) x3, Death Knight 50 (A) x1 | 49-50 | 48-52 |  |

### 3rd floor (z -7300 to -6300, monsters 45-49)

**Getting there:** teleporter via Hanna (30486, called Ian in the spawn list) at (17722, 119749, -9068), floor entry (17719, 115590, -6584). Hanna at the south end of floor 2, datapack teleport 55 (free). Teleportation Cubic (31843, 17719,115430) next to the landing: "level 3 -> Core" (56, Core's room 17691,111726) and "3rd floor -> 2nd floor" (58, lands next to Hanna).
Facing for left/right: north (floor entry -> centre of the floor spawns).
Small floor (27 spawn points). The Core (grand boss) room is behind the Teleportation Cubic, not a hunting room.

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| cruma-3-straight-a | straight (north) | 4017 | Susceptor 49 (A) x11, Dicor 47 (A) x7, Perum 48 (A) x5, Premo 45 x2, Validus 46 (A) x1 | 45-49 | 47-48 |  |

**Dangers.** Raid/epic bosses: Archon Suscepter 45 (raid at 15000,119000,-11900); Core 50 (grand at 17726,108915,-6480). Rooms much higher than their neighbours: cruma-1-left-a, cruma-1-left-b, cruma-1-left-c, cruma-1-left-e. Aggressive (datapack): Catherok, Mordeo, Dicor, Ossiud, Perum, Liangma, Death Knight, Dark Lord, Susceptor, Validus.

**Notes.** Floor levels: 1st 40-45, 2nd 46-50, 3rd 45-49. Outside marsh 25-35. Knowledge (datapack AI, not checked live): Mozella refuses characters above level 55. Core (grand boss) sits at the top (17726,108915,-6480).

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 40-41 | cruma-1-right-c | 1st floor | 15 spawns, monsters 40-42, walk 11795 |
| 42 | cruma-1-left-d | 1st floor | 20 spawns, monsters 42-44, walk 12345 |
| 43-45 | cruma-1-left-g | 1st floor | 23 spawns, monsters 42-45, walk 16266 |
| 46 | cruma-1-right-e | 1st floor | 16 spawns, monsters 43-45, walk 14673 |
| 47-48 | cruma-3-straight-a | 3rd floor | 26 spawns, monsters 45-49, walk 4017 |
| 49 | cruma-2-right-b | 2nd floor | 18 spawns, monsters 46-49, walk 8285 |
| 50-52 | cruma-2-straight-b | 2nd floor | 17 spawns, monsters 49-50, walk 15114 |

Sources: datapack l2j_teleport.sql, spawns_h5.json, npcs_h5.json, npcstats isAggressive, gk_live/Trisha.json, geopath.js on Geodata.

<a id="giants"></a>
## Giant's Cave (monsters 80-82)

**How to get in.** Aden: landing (174491, 50942, -4360).  Aden's live gatekeeper menu is not recorded (gk_live has no Aden file). Datapack: "Aden GK -> The Giant's Cave" (id 200922, 7400 adena, landing 174491,50942,-4360 = the cave mouth next to Head Researcher Sobling). Also Aden Castle / Narsell / Bayou Fortress -> Upper/Lower Layer (owners only).

**Entrance.** Cave mouth on the west side (Sobling 31147 at 174473,52854). Walk east into the upper layer. (174491, 50942, -4360).
Other teleports: The Giant's Cave Upper Layer (retail noble/Olympiad) (183985, 61424, -3992); The Giant's Cave Lower Layer (retail noble/Olympiad) (191754, 56760, -7624).

**Map layers** (`Maps/high`): 25_19.

### Upper layer (z -5300 to -3800, monsters 80-82)

**Getting there:** walk from (174491, 50942, -4360). Walk in from the cave mouth.
Floor entry point (first point of the walk routes inside this floor (12/18 routes pass within 1500)): (174632, 52440, -4360).
Facing for left/right: south (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| giants-1-straight-a | straight (south) | 3523 / 5215 | Palit 80 x12, Hirokai 80 x10, Imagro 80 x5, Cursed Lord 80 (A) x1 | 80-80 | 78-83 |  |
| giants-1-straight-b | straight (south) | 9715 / 11678 | Imagro 80 x10, Palit 80 x10, Hamlet 80 x5, Cursed Lord 80 (A) x1 | 80-80 | 78-83 |  |
| giants-1-straight-c | straight (south-east) | 12349 / 14341 | Klennot 80 (A) x7 | 80-80 | 78-83 |  |
| giants-1-straight-d | straight (south-east) | 15383 / 17356 | Hirokai 80 x5, Imagro 80 x5, Hamlet 80 x5, Cursed Lord 80 (A) x1 | 80-80 | 78-83 |  |
| giants-1-left-a | left (south-east) | 16336 | Hirokai 80 x10, Palit 80 x10, Imagro 80 x5, Cursed Lord 80 (A) x1 | 80-80 | 78-83 |  |
| giants-1-left-b | left (south-east) | 17202 / 19223 | Hamlet 80 x6, Hirokai 80 x5, Gamlin 81 (A) x3, Imagro 80 x3, Lesser Giant Soldier 81 x2, Lesser Giant Scout 82 x2, Barif 82 x1 | 80-82 | 80-83 | DANGER: near Gorgolos (raid 82, 4381 away) |
| giants-1-straight-e | straight (south-east) | 18464 / 20617 | Imagro 80 x15, Hamlet 80 x7, Hirokai 80 x5, Cursed Lord 80 (A) x1 | 80-80 | 78-83 |  |
| giants-1-left-c | left (east) | 21706 | Imagro 80 x12, Palit 80 x12, Hirokai 80 x6, Cursed Lord 80 (A) x1 | 80-80 | 78-83 |  |
| giants-1-left-d | left (east) | 25469 / 27592 | Lesser Giant Soldier 81 x21, Lesser Giant Scout 82 x4, Leogul 81 (A) x1 | 81-82 | 80-84 | DANGER: near Last Titan Utenus (raid 83, 758 away) |
| giants-1-left-e | left (east) | 27598 | Hamlet 80 x18, Hirokai 80 x10, Imagro 80 x6, Cursed Lord 80 (A) x2 | 80-80 | 78-83 | DANGER: near Giant Marpanak (raid 82, 3784 away) |
| giants-1-left-f | left (east) | 27891 | Hamlet 80 x12, Hirokai 80 x5, Imagro 80 x5, Cursed Lord 80 (A) x1 | 80-80 | 78-83 | DANGER: near Giant Marpanak (raid 82, 3961 away) |
| giants-1-left-g | left (south-east) | 29276 / 31494 | Lesser Giant Soldier 81 x2, Lesser Giant Scout 82 x1, Leogul 81 (A) x1 | 81-82 | 80-84 |  |
| giants-1-left-h | left (south-east) | 29440 / 31725 | Lesser Giant Soldier 81 x2, Gamlin 81 (A) x2 | 81-81 | 79-84 |  |
| giants-1-left-i | left (east) | 30228 | Hirokai 80 x16, Hamlet 80 x14, Cursed Lord 80 (A) x2 | 80-80 | 78-83 | DANGER: near Giant Marpanak (raid 82, 1812 away) |
| giants-1-left-j | left (south-east) | 33288 / 35759 | Lesser Giant Soldier 81 x6, Lesser Giant Scout 82 x4, Gamlin 81 (A) x2 | 81-82 | 80-84 |  |
| giants-1-left-k | left (south-east) | 33520 / 35792 | Lesser Giant Scout 82 x2, Gamlin 81 (A) x2, Lesser Giant Soldier 81 x1 | 81-82 | 80-84 |  |
| giants-1-left-l | left (east) | 34016 | Klennot 80 (A) x8, Gamlin 81 (A) x4 | 80-81 | 79-83 | DANGER: near Giant Marpanak (raid 82, 3576 away) |
| giants-1-left-m | left (east) | 35515 / 37858 | Lesser Giant Scout 82 x4, Gamlin 81 (A) x4, Lesser Giant Soldier 81 x3 | 81-82 | 80-84 |  |

### Lower layer (z -7900 to -5600, monsters 81-82)

**Getting there:** teleporter via Dwyph (32649) at (184458, 61446, -3992), floor entry (191754, 56760, -7624). Dwarf Adventurer Dwyph in the upper layer, datapack "Giant's Cave -> Lower" (200919, free). Droph (32711, 191391,57074,-7616) in the lower layer takes you back up (200920 -> 183985,61424,-3992).
Geodata walk check (174491, 50942, -4360) -> (191754, 56760, -7624): route found, ~47082 units.
Facing for left/right: south-west (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| giants-2-left-a | left (south) | 4622 | Lesser Giant Elder 82 x10, Lesser Giant Mage 82 x4, Barif 82 x2, Lesser Giant Shooter 82 x1 | 82-82 | 80-85 |  |
| giants-2-left-b | left (south) | 4757 | Lesser Giant Elder 82 x6, Lesser Giant Mage 82 x4, Lesser Giant Shooter 82 x1, Barif 82 x1 | 82-82 | 80-85 |  |
| giants-2-right-a | right (west) | 5021 | Lesser Giant Elder 82 x16, Lesser Giant Mage 82 x4, Barif 82 x3, Leogul 81 (A) x3, Lesser Giant Shooter 82 x1 | 81-82 | 80-84 |  |
| giants-2-straight-a | straight (south-west) | 8266 | Lesser Giant Elder 82 x9, Lesser Giant Mage 82 x7, Lesser Giant Shooter 82 x2, Lesser Giant Soldier 81 x1, Barif 82 x1 | 81-82 | 80-84 |  |
| giants-2-straight-b | straight (west) | 11557 | Lesser Giant Shooter 82 x7, Lesser Giant Elder 82 x4, Lesser Giant Mage 82 x3 | 82-82 | 80-85 |  |
| giants-2-straight-c | straight (west) | 12023 | Lesser Giant Elder 82 x8, Lesser Giant Shooter 82 x5, Lesser Giant Mage 82 x5 | 82-82 | 80-85 |  |
| giants-2-left-c | left (south) | 13818 | Lesser Giant Soldier 81 x8, Lesser Giant Scout 82 x2 | 81-82 | 80-84 |  |
| giants-2-left-d | left (south) | 14686 | Lesser Giant Soldier 81 x1, Lesser Giant Scout 82 x1, Lesser Giant Mage 82 x1, Lesser Giant Elder 82 x1, Leogul 81 (A) x1 | 81-82 | 80-84 |  |

**Dangers.** Raid/epic bosses: Last Lesser Giant Glaki 78 (raid at 188809,47780,-5968); Giant Marpanak 82 (raid at 193902,54135,-4184); Gorgolos 82 (raid at 186210,61479,-4000); Last Titan Utenus 83 (raid at 186919,56297,-4480). Rooms much higher than their neighbours: giants-1-left-b, giants-1-left-d, giants-1-left-e, giants-1-left-f, giants-1-left-i, giants-1-left-l. Aggressive (datapack): Cursed Lord, Klennot, Gamlin, Leogul.

**Notes.** All monsters level 80-82: only for an 80+ party. Silent Valley next to it (lvl 73-78, z -6000) is an open valley, not part of the cave, and is not listed.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 78-83 | giants-1-straight-a | Upper layer | 28 spawns, monsters 80-80, walk 5215 |
| 84 | giants-2-right-a | Lower layer | 27 spawns, monsters 81-82, walk 5021 |
| 85 | giants-2-left-a | Lower layer | 17 spawns, monsters 82-82, walk 4622 |

Sources: datapack l2j_teleport.sql, spawns_h5.json, npcs_h5.json, npcstats, geopath.js.

<a id="antharas"></a>
## Antharas' Lair (monsters 83-86)

**How to get in.** Teleport from Hunters Village with gatekeeper Esmeralda -> "Antharas's Lair" (~7000 adena) (text seen in the live menu), landing (131557, 114509, -3712). Live menu text "Antharas's Lair" (gk_live/Esmeralda.json, price not shown live). Landing from datapack 'Hunters -> Antharas Lair' (16002, 7000). 'The Heart of Antharas Lair' (154396,121235,-3808) is nobles only.

**Entrance.** Lair entrance; Antharas Watchman Theodric (30755) and a Separated Soul (32891) right there. Walk east. (131557, 114509, -3712).
Other teleports: Hunters (Noble) -> The Heart of Antharas Lair (154396, 121235, -3808); Separated Souls inside: 32868 (148558,110541,-3976), 32869 (146014,111226,-3599); H5 Separated Souls teleport between Dragon Valley / lair points (knowledge, menu not recorded).

**Map layers** (`Maps/high`): 23_21, 24_21, 24_21_1.

### Main lair (z -4400 to -500, monsters 83-86)

**Getting there:** walk from (131557, 114509, -3712). Walk east from the landing.
Floor entry point (first point of the walk routes inside this floor (23/25 routes pass within 1500)): (133880, 114344, -3720).
Facing for left/right: east (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| antharas-1-straight-a | straight (east) | 1912 / 4029 | Maluk Warlord 85 (A) x2, Maluk Hunter 85 (A) x2, Maluk Princess 85 (A) x2 | 85-85 | 83-88 |  |
| antharas-1-straight-b | straight (east) | 3142 / 5369 | Maluk Warlord 85 (A) x2, Maluk Hunter 85 (A) x2, Maluk Princess 85 (A) x2 | 85-85 | 83-88 |  |
| antharas-1-behind-a | behind (west) | 6073 | Parasitic Leech 83 (A) x9, Drakos Assassin 83 (A) x1 | 83-83 | 81-86 |  |
| antharas-1-straight-c | straight (east) | 7218 / 9538 | Maluk Hunter 85 (A) x7, Maluk Warlord 85 (A) x6, Maluk Princess 85 (A) x5, Dragon Knight 85 (A) x1 | 85-85 | 83-88 |  |
| antharas-1-behind-b | behind (west) | 7545 | Drakos Assassin 83 (A) x3, Drakos Hunter 83 (A) x2, Drakos Warrior 83 (A) x1 | 83-83 | 81-86 |  |
| antharas-1-straight-d | straight (east) | 8872 / 11070 | Maluk Warlord 85 (A) x7, Maluk Hunter 85 (A) x5, Maluk Leader 85 (A) x3, Maluk Princess 85 (A) x2 | 85-85 | 83-88 |  |
| antharas-1-left-a | left (north-east) | 11241 / 13616 | Maluk Warlord 85 (A) x4, Maluk Hunter 85 (A) x2, Maluk Banshee 85 (A) x2, Maluk Sniper 85 (A) x1 | 85-85 | 83-88 |  |
| antharas-1-straight-e | straight (east) | 11513 / 13961 | Maluk Warlord 85 (A) x4, Maluk Princess 85 (A) x3, Maluk Leader 85 (A) x2, Maluk Hunter 85 (A) x2, Dragon Knight 85 (A) x1 | 85-85 | 83-88 |  |
| antharas-1-straight-f | straight (north-east) | 12399 / 14773 | Maluk Warlord 85 (A) x3, Maluk Leader 85 (A) x2, Maluk Hunter 85 (A) x2, Maluk Princess 85 (A) x1 | 85-85 | 83-88 |  |
| antharas-1-right-a | right (south-east) | 13362 | Maluk Warlord 85 (A) x8, Maluk Hunter 85 (A) x4, Maluk Sniper 85 (A) x4, Maluk Banshee 85 (A) x3, Dragon Knight 85 (A) x1 | 85-85 | 83-88 |  |
| antharas-1-left-b | left (north-east) | 13716 / 16086 | Maluk Warlord 85 (A) x2, Maluk Hunter 85 (A) x1, Maluk Sniper 85 (A) x1 | 85-85 | 83-88 |  |
| antharas-1-straight-g | straight (east) | 13852 / 16262 | Drake Warrior 85 (A) x38, Drake Leader 85 (A) x15, Drake Scout 85 (A) x11, Drake Mage 85 (A) x7 | 85-85 | 83-88 |  |
| antharas-1-straight-h | straight (east) | 14265 | Maluk Warlord 85 (A) x7, Maluk Leader 85 (A) x5, Maluk Hunter 85 (A) x4, Maluk Princess 85 (A) x3, Dragon Knight 85 (A) x2 | 85-85 | 83-88 |  |
| antharas-1-left-c | left (north-east) | 14603 / 17185 | Maluk Warlord 85 (A) x3, Maluk Hunter 85 (A) x3, Maluk Banshee 85 (A) x1, Maluk Sniper 85 (A) x1 | 85-85 | 83-88 |  |
| antharas-1-right-b | right (south-east) | 15758 | Maluk Warlord 85 (A) x6, Maluk Hunter 85 (A) x6 | 85-85 | 83-88 |  |
| antharas-1-right-c | right (south-east) | 15768 | Maluk Warlord 85 (A) x5, Maluk Sniper 85 (A) x4, Maluk Hunter 85 (A) x2, Dragon Knight 85 (A) x1 | 85-85 | 83-88 | DANGER: near Behemoth Leader (raid 85, 2955 away) |
| antharas-1-left-d | left (north-east) | 17209 / 19803 | Maluk Warlord 85 (A) x8, Maluk Hunter 85 (A) x5, Maluk Sniper 85 (A) x5, Maluk Princess 85 (A) x3, Dragon Knight 85 (A) x2 | 85-85 | 83-88 |  |
| antharas-1-right-d | right (south-east) | 17363 | Maluk Warlord 85 (A) x5, Maluk Princess 85 (A) x5, Maluk Hunter 85 (A) x3, Maluk Sniper 85 (A) x3, Dragon Knight 85 (A) x1 | 85-85 | 83-88 | DANGER: near Behemoth Leader (raid 85, 2011 away) |
| antharas-1-straight-i | straight (east) | 18307 | Maluk Warlord 85 (A) x10, Maluk Hunter 85 (A) x5, Maluk Sniper 85 (A) x3, Maluk Princess 85 (A) x2, Maluk Banshee 85 (A) x2 | 85-85 | 83-88 | DANGER: near Behemoth Leader (raid 85, 1712 away), Dragon Beast (raid 85, 3431 away) |
| antharas-1-left-e | left (north-east) | 19526 / 22014 | Maluk Warlord 85 (A) x4, Maluk Leader 85 (A) x2, Maluk Hunter 85 (A) x2, Maluk Princess 85 (A) x2 | 85-85 | 83-88 |  |
| antharas-1-straight-j | straight (east) | 20062 | Dragon Guard 85 (A) x5, Dragon Mage 85 (A) x5 | 85-85 | 83-88 | DANGER: near Behemoth Leader (raid 85, 2104 away), Dragon Beast (raid 85, 1896 away) |
| antharas-1-straight-k | straight (east) | 20100 / 22736 | Maluk Warlord 85 (A) x5, Maluk Hunter 85 (A) x3, Maluk Banshee 85 (A) x2, Maluk Sniper 85 (A) x1, Dragon Knight 85 (A) x1 | 85-85 | 83-88 |  |
| antharas-1-straight-l | straight (east) | 21314 | Maluk Warlord 85 (A) x9, Maluk Hunter 85 (A) x4, Maluk Princess 85 (A) x4, Maluk Sniper 85 (A) x4 | 85-85 | 83-88 | DANGER: near Dragon Beast (raid 85, 2208 away) |
| antharas-1-straight-m | straight (east) | 23973 | Maluk Warlord 85 (A) x13, Maluk Leader 85 (A) x10, Maluk Hunter 85 (A) x8, Maluk Princess 85 (A) x7, Drake Warrior 85 (A) x3, Drake Scout 85 (A) x3, Drake Leader 85 (A) x2, Drake Mage 85 (A) x1 | 85-85 | 83-88 |  |
| antharas-1-straight-n | straight (east) | 25015 | Maluk Warlord 85 (A) x8, Maluk Hunter 85 (A) x8, Maluk Leader 85 (A) x5, Maluk Princess 85 (A) x4, Drake Warrior 85 (A) x3, Drake Leader 85 (A) x1, Drake Mage 85 (A) x1 | 85-85 | 83-88 |  |
| antharas-1-behind-c | behind (west) | no route | Drakos Assassin 83 (A) x1 | 83-83 | 81-86 | 2026-10-08 refine: still no route: a ledge at z -2480 with no walkable link to the lair (1 monster) |
| antharas-1-straight-o | straight (east) | no route | Bloody Karik 86 (A) x1 | 86-86 | 84-89 | 2026-10-08 refine: DUPLICATE of antharas-2-left-e (datapack z wrong / same monsters), never picked |
| antharas-1-straight-p | straight (south-east) | no route | Bloody Karinness 86 (A) x3 | 86-86 | 84-89 | 2026-10-08 refine: DUPLICATE of antharas-2-left-a (datapack z wrong / same monsters), never picked |
| antharas-1-straight-q | straight (east) | no route | Bloody Karinness 86 (A) x2, Bloody Karik 86 (A) x1 | 86-86 | 84-89 | 2026-10-08 refine: DUPLICATE of antharas-2-left-c (datapack z wrong / same monsters), never picked |

### Lower dens (z -6500 to -4400, monsters 85-86)

**Getting there:** walk from (131557, 114509, -3712). Ramps down from the east part of the main lair (x 147000-155000). Routes start at the lair entrance.
Floor entry point (first point of the walk routes inside this floor (6/11 routes pass within 1500)): (147160, 119240, -4264).
Facing for left/right: south (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| antharas-2-left-a | left (south-east) | 3396 / 24675 | Bloody Karik 86 (A) x15, Bloody Berserker 86 (A) x11, Bloody Karinness 86 (A) x8, Dragon Guard 85 (A) x7, Dragon Mage 85 (A) x7, Drake Scout 85 (A) x3, Drake Leader 85 (A) x2, Drake Warrior 85 (A) x2, Drake Mage 85 (A) x2 | 85-86 | 84-88 |  |
| antharas-2-left-b | left (east) | 7830 / 28830 | Dragon Guard 85 (A) x11, Dragon Mage 85 (A) x9 | 85-85 | 83-88 |  |
| antharas-2-left-c | left (north-east) | 11169 / 32257 | Bloody Karinness 86 (A) x15, Bloody Karik 86 (A) x14, Bloody Berserker 86 (A) x11 | 86-86 | 84-89 |  |
| antharas-2-left-d | left (north-east) | 11929 / 33033 | Bloody Karik 86 (A) x13, Dragon Guard 85 (A) x6, Dragon Mage 85 (A) x6, Bloody Berserker 86 (A) x5, Bloody Karinness 86 (A) x5, Drake Warrior 85 (A) x2, Drake Mage 85 (A) x2, Drake Leader 85 (A) x1 | 85-86 | 84-88 |  |
| antharas-2-left-e | left (north-east) | 13934 / 35022 | Bloody Karinness 86 (A) x13, Bloody Karik 86 (A) x9, Bloody Berserker 86 (A) x4 | 86-86 | 84-89 |  |
| antharas-2-left-f | left (north-east) | 15352 / 36505 | Maluk Warlord 85 (A) x6, Maluk Hunter 85 (A) x4, Maluk Banshee 85 (A) x2, Maluk Sniper 85 (A) x2, Dragon Knight 85 (A) x1 | 85-85 | 83-88 | DANGER: near Drake Lord (raid 85, 2261 away) |
| antharas-2-behind-a | behind (north) | 24254 | Maluk Leader 85 (A) x4, Maluk Warlord 85 (A) x4, Maluk Princess 85 (A) x2 | 85-85 | 83-88 |  |
| antharas-2-left-g | left (north-east) | 28635 | Maluk Warlord 85 (A) x15, Maluk Hunter 85 (A) x8, Maluk Sniper 85 (A) x8, Maluk Princess 85 (A) x7, Dragon Knight 85 (A) x1 | 85-85 | 83-88 | DANGER: near Drake Lord (raid 85, 2207 away) |
| antharas-2-behind-b | behind (north-east) | 30625 | Maluk Leader 85 (A) x2, Maluk Warlord 85 (A) x2, Maluk Hunter 85 (A) x2, Maluk Princess 85 (A) x1 | 85-85 | 83-88 | DANGER: near Drake Lord (raid 85, 1370 away) |
| antharas-2-behind-c | behind (north) | 32297 | Maluk Leader 85 (A) x2, Maluk Warlord 85 (A) x2, Maluk Hunter 85 (A) x1, Maluk Princess 85 (A) x1 | 85-85 | 83-88 | DANGER: near Drake Lord (raid 85, 2516 away) |
| antharas-2-behind-d | behind (north-east) | 34577 | Maluk Warlord 85 (A) x9, Maluk Princess 85 (A) x5, Maluk Leader 85 (A) x4, Maluk Hunter 85 (A) x4 | 85-85 | 83-88 | DANGER: near Drake Lord (raid 85, 2089 away) |

**Dangers.** Raid/epic bosses: Behemoth Leader 85 (raid at 145734,120031,-3912); Dragon Beast 85 (raid at 148482,117859,-3752); Drake Lord 85 (raid at 152316,110439,-5520); Antharas 79 (epic at 185708,114298,-8221) Antharas' nest (epic boss, via the Heart of Warding with a Portal Stone): not a hunting area. Rooms much higher than their neighbours: antharas-1-right-c, antharas-1-right-d, antharas-1-straight-i, antharas-1-straight-j, antharas-1-straight-l, antharas-2-left-f, antharas-2-left-g, antharas-2-behind-b, antharas-2-behind-c, antharas-2-behind-d. Aggressive (datapack): Maluk Warlord, Maluk Hunter, Maluk Princess, Parasitic Leech, Drakos Assassin, Dragon Knight, Drakos Hunter, Drakos Warrior, Maluk Leader, Maluk Banshee, Maluk Sniper, Drake Warrior, Drake Leader, Drake Scout, Drake Mage, Dragon Guard, Dragon Mage, Bloody Karik, Bloody Karinness, Bloody Berserker. No geodata route found to: antharas-1-behind-c, antharas-1-straight-o, antharas-1-straight-p, antharas-1-straight-q.

**Notes.** Every monster is level 83-86 (Maluk, Drake, Dragon Guard/Mage, Bloody Karik/Berserker/Karinness): only for 82+ parties.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 81-82 | antharas-1-behind-a | Main lair | 10 spawns, monsters 83-83, walk 6073 |
| 83-88 | antharas-1-straight-g | Main lair | 71 spawns, monsters 85-85, walk 16262 |
| 89 | antharas-2-left-c | Lower dens | 40 spawns, monsters 86-86, walk 32257 |

Sources: datapack l2j_teleport.sql, gk_live/Esmeralda.json, spawns_h5.json, npcs_h5.json, npcstats, geopath.js.

<a id="monastery"></a>
## Monastery of Silence (monsters 83-84)

**How to get in.** Goddard: landing (106414, -87799, -2920).  Goddard and Rune live menus are not recorded. Datapack: 'Goddard -> Monastery of silence' (1097, 10000), 'Rune -> Monastery of Silence' (1105, 14000), both land at 106414,-87799,-2920.

**Entrance.** Landing west of the monastery grounds (Sumiel 32764 / Aquilani 32780 nearby). Walk east. (106414, -87799, -2920).

**Map layers** (`Maps/high`): 23_14, 23_14_1, 23_15, 23_15_1, 23_15_2, 23_15_3.

### Grounds (outside the building) (z -4300 to -2950, monsters 83-83)

**Getting there:** walk from (106414, -87799, -2920).
Floor entry point (first point of the walk routes inside this floor (16/16 routes pass within 1500)): (110584, -86392, -3264).
Facing for left/right: south (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| monastery-1-straight-a | straight (south) | 1616 / 7587 | Guide Solina 83 (A) x7, Savior Solina 83 (A) x3, Ascetic Solina 83 (A) x2, Seeker Solina 83 (A) x1 | 83-83 | 81-86 |  |
| monastery-1-straight-b | straight (south) | 6176 / 12254 | Guide Solina 83 (A) x4, Seeker Solina 83 (A) x1, Savior Solina 83 (A) x1, Ascetic Solina 83 (A) x1 | 83-83 | 81-86 |  |
| monastery-1-straight-c | straight (south) | 7546 / 13132 | Solina Knights 83 (A) x9, Solina Knight Captain 83 (A) x5 | 83-83 | 81-86 |  |
| monastery-1-left-a | left (south-east) | 8744 / 14339 | Savior Solina 83 (A) x6, Guide Solina 83 (A) x5, Ascetic Solina 83 (A) x5, Seeker Solina 83 (A) x1 | 83-83 | 81-86 |  |
| monastery-1-left-b | left (south-east) | 11758 / 17397 | Guide Solina 83 (A) x2, Savior Solina 83 (A) x2, Ascetic Solina 83 (A) x2, Seeker Solina 83 (A) x1 | 83-83 | 81-86 |  |
| monastery-1-left-c | left (east) | 14417 / 20154 | Ascetic Solina 83 (A) x4 | 83-83 | 81-86 |  |
| monastery-1-left-d | left (north-east) | 18156 / 23958 | Guide Solina 83 (A) x8 | 83-83 | 81-86 |  |
| monastery-1-left-e | left (east) | 20837 / 26652 | Ascetic Solina 83 (A) x4 | 83-83 | 81-86 |  |
| monastery-1-left-f | left (east) | 22802 / 28618 | Guide Solina 83 (A) x1, Seeker Solina 83 (A) x1, Savior Solina 83 (A) x1, Ascetic Solina 83 (A) x1 | 83-83 | 81-86 |  |
| monastery-1-left-g | left (east) | 24709 / 30552 | Ascetic Solina 83 (A) x5, Guide Solina 83 (A) x4, Seeker Solina 83 (A) x3, Savior Solina 83 (A) x3 | 83-83 | 81-86 |  |
| monastery-1-left-h | left (east) | 26837 / 32806 | Guide Solina 83 (A) x2, Savior Solina 83 (A) x2, Ascetic Solina 83 (A) x2, Seeker Solina 83 (A) x1 | 83-83 | 81-86 |  |
| monastery-1-left-i | left (south-east) | 27812 / 33671 | Ascetic Solina 83 (A) x6, Guide Solina 83 (A) x5, Seeker Solina 83 (A) x4, Savior Solina 83 (A) x4 | 83-83 | 81-86 |  |
| monastery-1-left-j | left (south-east) | 31259 / 37160 | Ascetic Solina 83 (A) x3 | 83-83 | 81-86 |  |
| monastery-1-left-k | left (south-east) | 33828 / 39885 | Guide Solina 83 (A) x2, Seeker Solina 83 (A) x2, Savior Solina 83 (A) x2, Ascetic Solina 83 (A) x2 | 83-83 | 81-86 |  |
| monastery-1-left-l | left (south-east) | 37575 / 43668 | Guide Solina 83 (A) x2, Savior Solina 83 (A) x2, Ascetic Solina 83 (A) x2, Seeker Solina 83 (A) x1 | 83-83 | 81-86 |  |
| monastery-1-left-m | left (south-east) | 39203 / 45406 | Guide Solina 83 (A) x2, Savior Solina 83 (A) x2, Ascetic Solina 83 (A) x2, Seeker Solina 83 (A) x1 | 83-83 | 81-86 |  |

### Inside the monastery (Divinity halls) (z -2700 to 400, monsters 84-84)

**Getting there:** walk from (106414, -87799, -2920). Halls at several heights inside the building (Furnace rooms). Routes start at the landing.
Floor entry point (first point of the walk routes inside this floor (14/14 routes pass within 1500)): (118696, -81000, -2688).
Facing for left/right: south (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| monastery-2-right-a | right (south-west) | 2592 / 38359 | Divinity Worshipper 84 (A) x4, Divinity Judge 84 (A) x1, Divinity Manager 84 (A) x1, Divinity Supervisor 84 (A) x1 | 84-84 | 82-87 |  |
| monastery-2-right-b | right (west) | 10451 / 46200 | Divinity Protector 84 (A) x3, Divinity Magus 84 (A) x3, Divinity Judge 84 (A) x1, Divinity Manager 84 (A) x1, Divinity Supervisor 84 (A) x1, Divinity Worshipper 84 (A) x1, Divinity Fighter 84 (A) x1 | 84-84 | 82-87 |  |
| monastery-2-right-c | right (west) | 11808 / 47652 | Divinity Fighter 84 (A) x7, Divinity Protector 84 (A) x4, Divinity Magus 84 (A) x3 | 84-84 | 82-87 |  |
| monastery-2-right-d | right (west) | 13826 / 49664 | Divinity Magus 84 (A) x2, Divinity Protector 84 (A) x1 | 84-84 | 82-87 |  |
| monastery-2-right-e | right (west) | 15410 / 51200 | Divinity Worshipper 84 (A) x3 | 84-84 | 82-87 |  |
| monastery-2-right-f | right (west) | 18250 / 54046 | Divinity Fighter 84 (A) x3, Divinity Judge 84 (A) x1, Divinity Manager 84 (A) x1, Divinity Supervisor 84 (A) x1, Divinity Worshipper 84 (A) x1, Divinity Protector 84 (A) x1, Divinity Magus 84 (A) x1 | 84-84 | 82-87 |  |
| monastery-2-right-g | right (south-west) | 21304 / 57198 | Divinity Protector 84 (A) x7, Divinity Magus 84 (A) x7, Divinity Fighter 84 (A) x5 | 84-84 | 82-87 |  |
| monastery-2-right-h | right (south-west) | 23716 / 59644 | Divinity Worshipper 84 (A) x3 | 84-84 | 82-87 |  |
| monastery-2-right-i | right (south-west) | 26154 / 62078 | Divinity Judge 84 (A) x1, Divinity Manager 84 (A) x1, Divinity Supervisor 84 (A) x1, Divinity Worshipper 84 (A) x1 | 84-84 | 82-87 |  |
| monastery-2-right-j | right (south-west) | 28359 / 64411 | Divinity Protector 84 (A) x8, Divinity Fighter 84 (A) x8, Divinity Magus 84 (A) x8 | 84-84 | 82-87 |  |
| monastery-2-straight-a | straight (south) | 32478 / 68603 | Divinity Worshipper 84 (A) x3 | 84-84 | 82-87 |  |
| monastery-2-right-k | right (south-west) | 36341 / 72408 | Divinity Protector 84 (A) x4, Divinity Magus 84 (A) x4, Divinity Fighter 84 (A) x3, Divinity Judge 84 (A) x1, Divinity Manager 84 (A) x1, Divinity Supervisor 84 (A) x1, Divinity Worshipper 84 (A) x1 | 84-84 | 82-87 | DANGER: near Anais (raid 84, 3431 away) |
| monastery-2-right-l | right (south-west) | 37708 / 73947 | Divinity Fighter 84 (A) x5, Divinity Protector 84 (A) x4, Divinity Magus 84 (A) x4 | 84-84 | 82-87 |  |
| monastery-2-right-m | right (west) | 42225 / 78395 | Divinity Judge 84 (A) x2, Divinity Manager 84 (A) x2, Divinity Supervisor 84 (A) x2, Divinity Worshipper 84 (A) x2 | 84-84 | 82-87 |  |

**Dangers.** Raid/epic bosses: Anais 84 (raid at 112798,-76800,-10). Rooms much higher than their neighbours: monastery-2-right-k. Aggressive (datapack): Guide Solina, Savior Solina, Ascetic Solina, Seeker Solina, Solina Knights, Solina Knight Captain, Divinity Worshipper, Divinity Judge, Divinity Manager, Divinity Supervisor, Divinity Protector, Divinity Magus, Divinity Fighter.

**Notes.** Grounds: Solina monsters level 83; inside: Divinity monsters level 84 with Furnaces (quest mechanic). Only for 80+.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 81-86 | monastery-1-left-a | Grounds (outside the building) | 17 spawns, monsters 83-83, walk 14339 |
| 87 | monastery-2-right-j | Inside the monastery (Divinity halls) | 24 spawns, monsters 84-84, walk 64411 |

Sources: datapack l2j_teleport.sql, spawns_h5.json, npcs_h5.json, npcstats, geopath.js.

<a id="mithril"></a>
## Mithril Mines (monsters 81-82)

**How to get in.** Teleport from Schuttgart with gatekeeper Bilia -> "Mithril Mines" (~17000 adena) (text seen in the live menu), landing (171946, -173352, 3440). Live: Bilia (Schuttgart) 'Mithril Mines - 17000'; Wirphy (Dwarven Village) 'Mithril Mines Western Entrance' and 'Mithril Mines Eastern Entrance'. Datapack landings: Western 171946,-173352,3440; Eastern 178591,-184615,-360.

**Entrance.** Western entrance high on the mountain (Krun 32653 and a Teleport Crystal next to it). Eastern entrance 178591,-184615,-360 (Tarun 32654 + a Teleport Crystal). (171946, -173352, 3440).
Other teleports: Mithril Mines Eastern Entrance (Wirphy, Dwarven Village, live) (178591, -184615, -360); The Center of the Mithril Mines (retail noble) (175499, -181586, -904); Teleport Crystals 32652 at 173147,-173762,3480 (west), 179560,-182956,-256 (east), 181941,-174614,-3568 (deepest): menu not recorded.

**Map layers** (`Maps/high`): 25_12, 25_12_1, 25_12_2, 25_12_3, 25_12_4, 25_12_5.

### Upper tunnels (west entrance side) (z 700 to 3600, monsters 81-82)

**Getting there:** teleporter via Krun (32653) at (172201, -173495, 3480), floor entry (173147, -173762, 3480). GEODATA: the Western Entrance landing is a closed chamber (only Krun and the landing are reachable on foot; the mine tunnels are not). Krun is an L2Teleporter; his destination is not in the datapack teleport list. ASSUMED landing = the Teleport Crystal just inside (173147,-173762,3480), from where every upper/middle room is reachable. Verify live.
Facing for left/right: north-east (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| mithril-1-right-a | right (south-east) | 1971 | Grave Robber Summoner 81 x3, Grave Robber Worker 81 x3 | 81-81 | 79-84 |  |
| mithril-1-right-b | right (east) | 4069 | Mine Bug 82 (A) x4, Grave Robber Summoner 81 x3, Grave Robber Worker 81 x3, Earthworm's Descendant 82 x2 | 81-82 | 80-84 |  |
| mithril-1-straight-a | straight (north-east) | 7570 | Grave Robber Summoner 81 x4, Grave Robber Worker 81 x4, Grave Robber Warrior 82 x1, Evil Spirits of the Mine 82 (A) x1, Earthworm's Descendant 82 x1 | 81-82 | 80-84 |  |
| mithril-1-left-a | left (north) | 10479 | Mine Bug 82 (A) x4, Grave Robber Summoner 81 x3, Grave Robber Worker 81 x2, Earthworm's Descendant 82 x2 | 81-82 | 80-84 |  |
| mithril-1-left-b | left (north) | 12884 | Grave Robber Summoner 81 x2, Grave Robber Worker 81 x2 | 81-81 | 79-84 |  |
| mithril-1-straight-b | straight (north-east) | 15482 | Grave Robber Summoner 81 x4, Mine Bug 82 (A) x4, Grave Robber Worker 81 x3, Earthworm's Descendant 82 x2, Grave Robber Warrior 82 x1 | 81-82 | 80-84 |  |
| mithril-1-right-c | right (east) | 19241 | Mine Bug 82 (A) x4, Grave Robber Summoner 81 x3, Grave Robber Worker 81 x3, Earthworm's Descendant 82 x2 | 81-82 | 80-84 |  |
| mithril-1-straight-c | straight (north-east) | 22347 | Grave Robber Worker 81 x3, Grave Robber Summoner 81 x2 | 81-81 | 79-84 |  |
| mithril-1-left-c | left (north) | 25295 | Mine Bug 82 (A) x5, Grave Robber Warrior 82 x4, Grave Robber Magician 82 x3, Grave Robber Warrior of Light 82 (A) x1 | 82-82 | 80-85 |  |
| mithril-1-straight-d | straight (north-east) | 27512 | Grave Robber Magician 82 x5, Grave Robber Warrior 82 x4, Grave Robber Warrior of Light 82 (A) x2 | 82-82 | 80-85 |  |

### Middle tunnels (z -1150 to 700, monsters 81-82)

**Getting there:** teleporter via Tarun (32654) at (178884, -184227, -336), floor entry (179560, -182956, -256). GEODATA: the Eastern Entrance landing is a closed chamber too (only Tarun reachable). ASSUMED landing = the Teleport Crystal inside (179560,-182956,-256). Verify live.
Facing for left/right: south (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| mithril-2-straight-a | straight (south) | 3014 | Mine Bug 82 (A) x5, Grave Robber Summoner 81 x4, Grave Robber Worker 81 x4, Earthworm's Descendant 82 x2 | 81-82 | 80-84 |  |
| mithril-2-straight-b | straight (south) | 5693 | Grave Robber Summoner 81 x1, Grave Robber Worker 81 x1 | 81-81 | 79-84 |  |
| mithril-2-straight-c | straight (south) | 7628 | Grave Robber Summoner 81 x1, Grave Robber Worker 81 x1 | 81-81 | 79-84 |  |
| mithril-2-straight-d | straight (south) | 13289 | Mine Bug 82 (A) x5, Grave Robber Summoner 81 x4, Grave Robber Worker 81 x2, Earthworm's Descendant 82 x2 | 81-82 | 80-84 |  |
| mithril-2-straight-e | straight (south) | 17195 | Grave Robber Magician 82 x4, Mine Bug 82 (A) x4, Grave Robber Warrior 82 x3, Grave Robber Warrior of Light 82 (A) x1 | 82-82 | 80-85 |  |
| mithril-2-right-a | right (south-west) | 21186 | Grave Robber Magician 82 x2, Mine Bug 82 (A) x2 | 82-82 | 80-85 |  |
| mithril-2-straight-f | straight (south-west) | 22081 | Grave Robber Warrior 82 x3, Mine Bug 82 (A) x3, Grave Robber Magician 82 x1, Grave Robber Warrior of Light 82 (A) x1 | 82-82 | 80-85 |  |
| mithril-2-straight-g | straight (south) | 24217 | Grave Robber Magician 82 x2, Grave Robber Warrior 82 x1 | 82-82 | 80-85 |  |
| mithril-2-left-a | left (south-east) | 27282 | Grave Robber Magician 82 x4, Grave Robber Warrior 82 x3, Grave Robber Warrior of Light 82 (A) x2, Grave Robber Worker 81 x1 | 81-82 | 80-84 |  |
| mithril-2-straight-h | straight (south-west) | 83214 | Grave Robber Magician 82 x2, Grave Robber Warrior 82 x2 | 82-82 | 80-85 |  |
| mithril-2-straight-i | straight (south-west) | 85996 | Grave Robber Magician 82 x4, Grave Robber Warrior 82 x4, Grave Robber Warrior of Light 82 (A) x2 | 82-82 | 80-85 |  |

### Lower tunnels (z -2800 to -1150, monsters 82-82)

**Getting there:** teleporter via Tarun (32654) at (178884, -184227, -336), floor entry (179560, -182956, -256). Same assumed landing as the middle tunnels; walk down.
Facing for left/right: south (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| mithril-3-left-a | left (south-east) | 31715 | Mine Bug 82 (A) x5, Grave Robber Magician 82 x3, Grave Robber Warrior 82 x2, Grave Robber Warrior of Light 82 (A) x1 | 82-82 | 80-85 |  |
| mithril-3-left-b | left (east) | 33088 | Grave Robber Magician 82 x2, Grave Robber Warrior 82 x1, Evil Spirits of the Mine 82 (A) x1, Earthworm's Descendant 82 x1 | 82-82 | 80-85 |  |
| mithril-3-atentry-a | at entry (north) | 37155 | Grave Robber Magician 82 x6, Mine Bug 82 (A) x6, Grave Robber Warrior 82 x4, Evil Spirits of the Mine 82 (A) x4 | 82-82 | 80-85 |  |
| mithril-3-straight-a | straight (south) | 38976 | Mine Bug 82 (A) x6, Grave Robber Magician 82 x3, Earthworm's Descendant 82 x3, Grave Robber Warrior 82 x1, Evil Spirits of the Mine 82 (A) x1 | 82-82 | 80-85 |  |
| mithril-3-straight-b | straight (south) | 42444 | Mine Bug 82 (A) x5, Earthworm's Descendant 82 x1 | 82-82 | 80-85 |  |
| mithril-3-straight-c | straight (south) | 55770 | Earthworm's Descendant 82 x4, Mine Bug 82 (A) x3 | 82-82 | 80-85 |  |
| mithril-3-straight-d | straight (south) | 57983 | Mine Bug 82 (A) x5, Earthworm's Descendant 82 x3 | 82-82 | 80-85 |  |
| mithril-3-straight-e | straight (south-west) | 59619 | Grave Robber Magician 82 x2, Mine Bug 82 (A) x2, Earthworm's Descendant 82 x2, Grave Robber Warrior 82 x1 | 82-82 | 80-85 |  |
| mithril-3-right-a | right (north-west) | 67161 | Grave Robber Magician 82 x1, Grave Robber Warrior 82 x1 | 82-82 | 80-85 |  |
| mithril-3-right-b | right (west) | 68913 | Grave Robber Magician 82 x1, Grave Robber Warrior 82 x1 | 82-82 | 80-85 |  |
| mithril-3-right-c | right (west) | 69899 | Grave Robber Magician 82 x1, Grave Robber Warrior 82 x1 | 82-82 | 80-85 |  |

### Deepest hall (z -4200 to -3200, monsters 82-82)

**Getting there:** teleporter via Tarun (32654) at (178884, -184227, -336), floor entry (179560, -182956, -256). A Teleport Crystal stands in this hall (181941,-174614,-3568); its menu is not recorded. Routes start at the eastern crystal.
Facing for left/right: south (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| mithril-4-straight-a | straight (south) | 59694 | Mine Bug 82 (A) x12, Earthworm's Descendant 82 x4, Grave Robber Magician 82 x3 | 82-82 | 80-85 |  |

**Dangers.** Aggressive (datapack): Mine Bug, Evil Spirits of the Mine, Grave Robber Warrior of Light.

**Notes.** Grave Robbers, Mine Bugs and Earth Wyrm Descendants level 81-82 everywhere; the mine is one long spiral, the "floors" are height bands. Goblins/golems lvl 24-25 on the southern slopes are outside (excluded). Only for 80+. GEODATA: both gatekeeper landings (west and east entrance) are closed chambers that do not connect to the mine tunnels; Krun (west) and Tarun (east) are teleporters and are assumed to bring you to the Teleport Crystal inside. Verify live.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 79 | mithril-1-right-a | Upper tunnels (west entrance side) | 6 spawns, monsters 81-81, walk 1971 |
| 80-84 | mithril-2-straight-a | Middle tunnels | 15 spawns, monsters 81-82, walk 3014 |
| 85 | mithril-3-atentry-a | Lower tunnels | 20 spawns, monsters 82-82, walk 37155 |

Sources: datapack l2j_teleport.sql, gk_live/Bilia.json, gk_live/Wirphy.json, spawns_h5.json, npcs_h5.json, npcstats, geopath.js.

<a id="forge"></a>
## Forge of the Gods + Valakas approach (Hall of Flames) (monsters 78-78)

**How to get in.** Goddard: landing (169018, -116303, -2432).  Goddard live menu not recorded. Datapack 'Goddard -> Forge of the Gods' (200926, 10000) lands at the entrance 169018,-116303,-2432. Retail noble links: 'Forge of the Gods - Top Level' 173436,-112725,-3680 and 'Lower Level' 180260,-111913,-5851.

**Entrance.** Entrance to the Forge of the Gods (west side). Walk east and down into the volcano. (169018, -116303, -2432).
Other teleports: Forge of the Gods - Top Level (noble) (173436, -112725, -3680); Forge of the Gods - Lower Level (noble) (180260, -111913, -5851).

**Map layers** (`Maps/high`): 25_14, 25_14_1, 25_14_2, 25_14_3.

### Top level (z -4700 to -3000, monsters 78-78)

**Getting there:** walk from (169018, -116303, -2432).
Geodata walk check (169018, -116303, -2432) -> (173436, -112725, -3680): NO route (stairs/ramps not in the geodata, or the floor is cut off).
Floor entry point (first point of the walk routes inside this floor (23/23 routes pass within 1500)): (177800, -116696, -3672).
Facing for left/right: east (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| forge-1-straight-a | straight (east) | 1391 / 13002 | Scarlet Stakato Worker 78 (A) x8, Scarlet Stakato Soldier 78 (A) x8 | 78-78 | 76-81 |  |
| forge-1-right-a | right (south-east) | 2926 / 14578 | Scarlet Stakato Worker 78 (A) x8, Scarlet Stakato Soldier 78 (A) x8 | 78-78 | 76-81 |  |
| forge-1-left-a | left (north) | 6879 / 18712 | Scarlet Stakato Noble 78 (A) x6, Scarlet Stakato Worker 78 (A) x5, Scarlet Stakato Soldier 78 (A) x5 | 78-78 | 76-81 |  |
| forge-1-left-b | left (north) | 7454 / 19335 | Scarlet Stakato Noble 78 (A) x6, Scarlet Stakato Worker 78 (A) x5, Scarlet Stakato Soldier 78 (A) x5 | 78-78 | 76-81 |  |
| forge-1-left-c | left (north-east) | 11725 / 23804 | Scarlet Stakato Worker 78 (A) x8, Scarlet Stakato Soldier 78 (A) x7 | 78-78 | 76-81 |  |
| forge-1-straight-b | straight (east) | 13938 / 26050 | Scarlet Stakato Worker 78 (A) x8, Scarlet Stakato Soldier 78 (A) x8 | 78-78 | 76-81 |  |
| forge-1-straight-c | straight (east) | 18401 / 30516 | Assassin Beetle 78 (A) x6, Tepra Scorpion 78 (A) x5, Tepra Scarab 78 (A) x5 | 78-78 | 76-81 |  |
| forge-1-straight-d | straight (east) | 20975 / 33248 | Assassin Beetle 78 (A) x6, Tepra Scorpion 78 (A) x5, Tepra Scarab 78 (A) x5 | 78-78 | 76-81 |  |
| forge-1-straight-e | straight (north-east) | 22695 / 34897 | Assassin Beetle 78 (A) x6, Tepra Scorpion 78 (A) x5, Tepra Scarab 78 (A) x5 | 78-78 | 76-81 |  |
| forge-1-straight-f | straight (east) | 22936 / 35076 | Assassin Beetle 78 (A) x11, Tepra Scorpion 78 (A) x10, Tepra Scarab 78 (A) x10 | 78-78 | 76-81 |  |
| forge-1-straight-g | straight (east) | 23003 / 35266 | Assassin Beetle 78 (A) x8, Tepra Scorpion 78 (A) x6, Tepra Scarab 78 (A) x6 | 78-78 | 76-81 |  |
| forge-1-straight-h | straight (north-east) | 24080 / 36494 | Assassin Beetle 78 (A) x6, Tepra Scorpion 78 (A) x5, Tepra Scarab 78 (A) x5 | 78-78 | 76-81 |  |
| forge-1-right-b | right (east) | 26797 / 39062 | Assassin Beetle 78 (A) x10, Tepra Scorpion 78 (A) x9, Tepra Scarab 78 (A) x9 | 78-78 | 76-81 |  |
| forge-1-right-c | right (south-east) | 29260 / 41611 | Mercenary of Destruction 78 (A) x16 | 78-78 | 76-81 |  |
| forge-1-right-d | right (east) | 31641 / 44080 | Mercenary of Destruction 78 (A) x32 | 78-78 | 76-81 |  |
| forge-1-right-e | right (south-east) | 31755 / 44128 | Knight of Destruction 78 (A) x16 | 78-78 | 76-81 |  |
| forge-1-right-f | right (south-east) | 32132 / 44558 | Arimanes of Destruction 78 (A) x8, Ashuras of Destruction 78 (A) x6 | 78-78 | 76-81 |  |
| forge-1-right-g | right (south-east) | 32893 / 45295 | Knight of Destruction 78 (A) x16 | 78-78 | 76-81 |  |
| forge-1-right-h | right (south-east) | 34060 / 46486 | Knight of Destruction 78 (A) x16 | 78-78 | 76-81 |  |
| forge-1-right-i | right (south-east) | 36457 / 48782 | Arimanes of Destruction 78 (A) x8, Ashuras of Destruction 78 (A) x8 | 78-78 | 76-81 |  |
| forge-1-right-j | right (south-east) | 39787 / 52262 | Arimanes of Destruction 78 (A) x16, Balrog of Destruction 78 (A) x16 | 78-78 | 76-81 |  |
| forge-1-right-k | right (south-east) | 39928 / 52462 | Arimanes of Destruction 78 (A) x8, Balrog of Destruction 78 (A) x8 | 78-78 | 76-81 |  |
| forge-1-right-l | right (south) | 41598 / 54073 | Arimanes of Destruction 78 (A) x8, Ashuras of Destruction 78 (A) x8 | 78-78 | 76-81 |  |
| forge-1-right-m | right (south-west) | 43608 / 55153 | Arimanes of Destruction 78 (A) x8, Ashuras of Destruction 78 (A) x8 | 78-78 | 76-81 | 2026-10-08 refine: walk route added |
| forge-1-right-n | right (south) | 43099 / 54644 | Arimanes of Destruction 78 (A) x8, Ashuras of Destruction 78 (A) x8 | 78-78 | 76-81 | 2026-10-08 refine: walk route added |

### Lower level (z -6900 to -5500, monsters 78-78)

**Getting there:** walk from (169018, -116303, -2432). Walk down from the top level (checked to the datapack lower-level point 180260,-111913,-5851).
Geodata walk check (169018, -116303, -2432) -> (180260, -111913, -5851): route found, ~72430 units.
Floor entry point (first point of the walk routes inside this floor (10/10 routes pass within 1500)): (174520, -112264, -5392).
Facing for left/right: east (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| forge-2-straight-a | straight (east) | 4599 / 70721 | Arimanes of Destruction 78 (A) x9, Lavasillisk 78 (A) x9 | 78-78 | 76-81 |  |
| forge-2-straight-b | straight (east) | 7777 / 74213 | Lavasillisk 78 (A) x7, Blazing Ifrit 78 (A) x7, Magma Drake 78 (A) x7 | 78-78 | 76-81 |  |
| forge-2-left-a | left (east) | 9774 / 75888 | Arimanes of Destruction 78 (A) x7, Balrog of Destruction 78 (A) x7, Lavasillisk 78 (A) x7 | 78-78 | 76-81 |  |
| forge-2-left-b | left (north-east) | 10276 / 76469 | Arimanes of Destruction 78 (A) x7, Balrog of Destruction 78 (A) x7, Lavasillisk 78 (A) x7 | 78-78 | 76-81 |  |
| forge-2-right-a | right (south-east) | 10874 / 77457 | Lavasillisk 78 (A) x7, Blazing Ifrit 78 (A) x7, Magma Drake 78 (A) x7 | 78-78 | 76-81 |  |
| forge-2-right-b | right (south-east) | 11404 / 77896 | Lavasillisk 78 (A) x8, Blazing Ifrit 78 (A) x8, Magma Drake 78 (A) x8 | 78-78 | 76-81 | DANGER: near Ember (raid 80, 2488 away) |
| forge-2-straight-c | straight (east) | 11859 / 78400 | Lavastone Golem 78 (A) x20, Magma Golem 78 (A) x20 | 78-78 | 76-81 | DANGER: near Ember (raid 80, 4130 away) |
| forge-2-left-c | left (north-east) | 12645 / 78761 | Arimanes of Destruction 78 (A) x7, Balrog of Destruction 78 (A) x7, Lavasillisk 78 (A) x7 | 78-78 | 76-81 |  |
| forge-2-straight-d | straight (south-east) | 12706 / 79306 | Lavasillisk 78 (A) x7, Blazing Ifrit 78 (A) x7, Magma Drake 78 (A) x7 | 78-78 | 76-81 |  |
| forge-2-straight-e | straight (east) | 13707 / 80339 | Lavastone Golem 78 (A) x19, Magma Golem 78 (A) x19 | 78-78 | 76-81 |  |
| forge-2-straight-f | straight (east) | 1733 / 66868 | Arimanes of Destruction 78 (A) x9, Lavasillisk 78 (A) x9 | 78-78 | 76-81 | 2026-10-08 refine: walk route added |

### Hall of Flames (Valakas approach) (z -2300 to -500, monsters 78-78)

**Getting there:** teleporter via Klein (31540) at (183664, -114944, -3335). Knowledge (H5): Valakas Watchman Klein lets you into the Hall of Flames only with a Floating Stone (quest Q00618 Into the Flame); the landing is not in the datapack teleport list. **Landing (2026-10-08): 183813,-115157,-3303** (Scripts/data/dp/npcs/ai/GrandBossTeleporters.java ENTER_HALL_OF_FLAMES), behind the gate Klein guards; the 4 rooms below are walkable from there (walk routes added by room_refine.js). Gatekeeper of Fire Dragon 31384 (191296,-115472,-1580) inside; Heart of Volcano 31385 (189872,-105152,-724) teleports to Valakas. Not a hunting area.
Facing for left/right: east (entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| forge-3-left-a | left (east) | 16480 | Blazing Ifrit 78 (A) x10 | 78-78 | 76-81 | DANGER: near Fenril Hound Kerinne (raid 84, 1798 away), Fenril Hound Freki (raid 84, 1679 away); 2026-10-08 refine: walk route added |
| forge-3-straight-a | straight (east) | 19632 | Elder Lavasaurus 78 (A) x8 | 78-78 | 76-81 | DANGER: near Fenril Hound Freki (raid 84, 2802 away); 2026-10-08 refine: walk route added |
| forge-3-right-a | right (south-east) | 27827 | Elder Lavasaurus 78 (A) x4 | 78-78 | 76-81 | DANGER: near Wings of Flame, Ixion (raid 84, 1608 away), Fenril Hound Uruz (raid 84, 2170 away); 2026-10-08 refine: walk route added |
| forge-3-right-b | right (south-east) | 28431 | Elder Lavasaurus 78 (A) x4 | 78-78 | 76-81 | DANGER: near Wings of Flame, Ixion (raid 84, 2120 away), Fenril Hound Kinaz (raid 84, 2396 away); 2026-10-08 refine: walk route added |

**Dangers.** Raid/epic bosses: Ember 80 (raid at 184542,-106330,-6304); Wings of Flame, Ixion 84 (raid at 189400,-105702,-782); Valakas 85 (epic) Valakas' lair is reached from the Heart of Volcano (189872,-105152,-724); its map area is elsewhere (-105200,-253104,-15264).; Fenril Hound Kerinne 84 (raid at 189964,-116820,-1624) from spawns_h5.json (not in raidbosses_h5.json); Fenril Hound Freki 84 (raid at 193260,-116820,-1444) from spawns_h5.json (not in raidbosses_h5.json); Fenril Hound Uruz 84 (raid at 189388,-109476,-1064) from spawns_h5.json (not in raidbosses_h5.json); Fenril Hound Kinaz 84 (raid at 192156,-108980,-1060) from spawns_h5.json (not in raidbosses_h5.json). Rooms much higher than their neighbours: forge-2-right-b, forge-2-straight-c, forge-3-left-a, forge-3-straight-a, forge-3-right-a, forge-3-right-b. Aggressive (datapack): Scarlet Stakato Worker, Scarlet Stakato Soldier, Scarlet Stakato Noble, Assassin Beetle, Tepra Scorpion, Tepra Scarab, Mercenary of Destruction, Knight of Destruction, Arimanes of Destruction, Ashuras of Destruction, Balrog of Destruction, Lavasillisk, Blazing Ifrit, Magma Drake, Lavastone Golem, Magma Golem, Elder Lavasaurus. No geodata route found to: forge-1-right-m, forge-1-right-n, forge-2-straight-f, forge-3-left-a, forge-3-straight-a, forge-3-right-a, forge-3-right-b.

**Notes.** Forge: all monsters level 78 = a 76-80 party. Hall of Flames: Elder Lavasaurus 78 + four level-84 Fenril Hound raid bosses; Valakas is an epic boss, not levelable.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 76-81 | forge-1-straight-f | Top level | 31 spawns, monsters 78-78, walk 35076 |

Sources: datapack l2j_teleport.sql, spawns_h5.json, npcs_h5.json, npcstats, raidbosses_h5.json, geopath.js.

<a id="antnest"></a>
## Ant Nest (monsters 29-38)

**How to get in.** Teleport from Gludio with gatekeeper Bella -> "The Ant Nest" (~2100 adena) (text seen in the live menu), landing (-9959, 176184, -4160). Live text 'The Ant Nest' (gk_live/Bella.json). Datapack 'Gludio -> Ant Cave' (1031, 2100) lands at -9959,176184,-4160 in the Wasteland, east of the nest.

**Entrance.** Landing in the Wasteland. The tunnels run west under the Wasteland at z -6000..-5000. (-9959, 176184, -4160).

**Map layers** (`Maps/high`): 18_23, 18_23_1, 19_23, 19_23_1.

### Nest tunnels (z -6300 to -4800, monsters 29-38)

**Getting there:** walk from (-9959, 176184, -4160).
Floor entry point (first point of the walk routes inside this floor (19/26 routes pass within 1500)): (-11896, 174216, -4816).
Facing for left/right: south-west (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| antnest-1-straight-a | straight (south-west) | 2163 / 5089 | Ant Larva 29 x2 | 29-29 | 27-32 |  |
| antnest-1-straight-b | straight (south-west) | 6424 / 9568 | Ant 30 x7, Ant Larva 29 x4, Ant Captain 31 (A) x4, Ant Overseer 32 x2, Ant Recruit 33 x1, Ant Patrol 34 x1, Ant Guard 35 x1 | 29-35 | 28-33 | mixed levels: suggestion built on the median monster level 30 |
| antnest-1-straight-c | straight (south-west) | 6717 / 9913 | Ant 30 x1, Ant Captain 31 (A) x1, Ant Overseer 32 x1, Ant Guard 35 x1 | 30-35 | 33-33 |  |
| antnest-1-left-a | left (south) | 7168 / 10362 | Ant Patrol 34 x8, Ant Guard 35 x8, Ant 30 x6, Ant Captain 31 (A) x6, Ant Overseer 32 x6, Ant Recruit 33 x6 | 30-35 | 33-33 |  |
| antnest-1-left-b | left (south) | 8347 / 11611 | Ant Patrol 34 x11, Ant Recruit 33 x10, Ant Soldier 35 (A) x6, Ant Guard 35 x5, Ant Warrior Captain 36 (A) x3 | 33-36 | 34-36 |  |
| antnest-1-straight-d | straight (south-west) | 8847 / 12078 | Ant Patrol 34 x7, Ant Guard 35 x7, Ant Warrior Captain 36 (A) x6 | 34-36 | 34-37 |  |
| antnest-1-straight-e | straight (south-west) | 10391 / 13669 | Ant Warrior Captain 36 (A) x9, Ant Soldier 35 (A) x8, Noble Ant 37 x8, Ant Guard 35 x3 | 35-37 | 35-38 | DANGER: near Queen Ant (grand 40, 3931 away) |
| antnest-1-straight-f | straight (south-west) | 15034 / 18328 | Guard Ant 37 (A) x9, Noble Ant 37 x4, Ant Warrior Captain 36 (A) x3, Noble Ant Leader 38 (A) x3, Ant Soldier 35 (A) x1 | 35-38 | 36-38 | DANGER: near Queen Ant (grand 40, 2233 away) |
| antnest-1-straight-g | straight (south-west) | 18101 / 21501 | Ant Warrior Captain 36 (A) x4, Noble Ant Leader 38 (A) x4, Noble Ant 37 x3, Ant Guard 35 x1 | 35-38 | 36-38 |  |
| antnest-1-straight-h | straight (south-west) | 18180 / 21465 | Ant Warrior Captain 36 (A) x2, Noble Ant 37 x2, Noble Ant Leader 38 (A) x2 | 36-38 | 36-39 | DANGER: near Queen Ant (grand 40, 3223 away) |
| antnest-1-straight-i | straight (south-west) | 19076 / 22497 | Guard Ant 37 (A) x7 | 37-37 | 35-40 | DANGER: near Queen Ant (grand 40, 1890 away) |
| antnest-1-straight-j | straight (south-west) | 20181 / 23554 | Guard Ant 37 (A) x9, Noble Ant 37 x4, Noble Ant Leader 38 (A) x3, Ant Guard 35 x2, Ant Warrior Captain 36 (A) x2 | 35-38 | 36-38 | DANGER: near Queen Ant (grand 40, 1832 away) |
| antnest-1-right-a | right (west) | 20781 | Ant Larva 29 x10, Ant 30 x10 | 29-30 | 28-32 |  |
| antnest-1-straight-k | straight (south-west) | 21109 / 24715 | Ant Captain 31 (A) x4, Ant Patrol 34 x4, Ant Recruit 33 x3, Ant Guard 35 x2, Ant Soldier 35 (A) x2, Ant Warrior Captain 36 (A) x2 | 31-36 | 34-34 |  |
| antnest-1-straight-l | straight (south-west) | 22480 / 25858 | Noble Ant 37 x16, Ant Soldier 35 (A) x14, Ant Warrior Captain 36 (A) x14, Ant Guard 35 x11, Ant Patrol 34 x7 | 34-37 | 35-37 | DANGER: near Queen Ant (grand 40, 3974 away) |
| antnest-1-right-b | right (west) | 23566 | Ant Larva 29 x5, Ant 30 x5, Ant Captain 31 (A) x2 | 29-31 | 29-32 |  |
| antnest-1-left-c | left (south-west) | 23803 / 27416 | Ant Overseer 32 x2, Ant Recruit 33 x2, Ant Patrol 34 x1 | 32-34 | 32-35 |  |
| antnest-1-straight-m | straight (west) | 24682 / 28107 | Ant Warrior Captain 36 (A) x3, Noble Ant 37 x3, Ant Soldier 35 (A) x2 | 35-37 | 35-38 |  |
| antnest-1-straight-n | straight (south-west) | 25363 / 29029 | Ant Captain 31 (A) x9, Ant 30 x8, Ant Overseer 32 x8, Ant Larva 29 x1, Ant Recruit 33 x1 | 29-33 | 31-32 |  |
| antnest-1-straight-o | straight (south-west) | 25518 / 29187 | Ant Captain 31 (A) x3, Ant 30 x2, Ant Overseer 32 x1, Ant Recruit 33 x1 | 30-33 | 31-33 |  |
| antnest-1-left-d | left (south-west) | 25754 | Ant Larva 29 x4, Ant 30 x4, Ant Captain 31 (A) x4 | 29-31 | 29-32 |  |
| antnest-1-straight-p | straight (south-west) | 25812 / 29381 | Noble Ant 37 x15, Ant Warrior Captain 36 (A) x11, Ant Soldier 35 (A) x10, Noble Ant Leader 38 (A) x9, Ant Guard 35 x5 | 35-38 | 36-38 |  |
| antnest-1-straight-q | straight (west) | 25891 | Ant Captain 31 (A) x12, Ant Overseer 32 x6, Ant 30 x4, Ant Recruit 33 x4, Ant Patrol 34 x3, Ant Guard 35 x3 | 30-35 | 33-33 |  |
| antnest-1-left-e | left (south-west) | 27011 | Ant Captain 31 (A) x8, Ant 30 x7, Ant Overseer 32 x5, Ant Larva 29 x4, Ant Patrol 34 x1 | 29-34 | 32-32 |  |
| antnest-1-straight-r | straight (west) | 28189 | Ant Recruit 33 x11, Ant Patrol 34 x10, Ant Overseer 32 x8, Ant 30 x6, Ant Captain 31 (A) x2 | 30-34 | 32-33 |  |
| antnest-1-straight-s | straight (west) | 29073 | Ant Soldier 35 (A) x8, Ant Warrior Captain 36 (A) x6, Ant Patrol 34 x2, Ant Guard 35 x2, Noble Ant 37 x1 | 34-37 | 35-37 |  |

**Dangers.** Raid/epic bosses: Queen Ant 40 (grand at -21610,181594,-5734). Rooms much higher than their neighbours: antnest-1-straight-e, antnest-1-straight-f, antnest-1-straight-h, antnest-1-straight-i, antnest-1-straight-j, antnest-1-straight-l. Aggressive (datapack): Ant Captain, Ant Soldier, Ant Warrior Captain, Guard Ant, Noble Ant Leader.

**Notes.** Ants level 29-38 on one sloping level. The Queen Ant (grand boss) chamber is deep in the south-west (-21610,181594,-5734): avoid it. Wasteland monsters outside (lvl 25-36) are not counted.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 27 | antnest-1-straight-a | Nest tunnels | 2 spawns, monsters 29-29, walk 5089 |
| 28-31 | antnest-1-straight-b | Nest tunnels | 20 spawns, monsters 29-35, walk 9568 |
| 32 | antnest-1-straight-r | Nest tunnels | 37 spawns, monsters 30-34, walk 28189 |
| 33 | antnest-1-left-a | Nest tunnels | 40 spawns, monsters 30-35, walk 10362 |
| 34-36 | antnest-1-left-b | Nest tunnels | 35 spawns, monsters 33-36, walk 11611 |
| 37-38 | antnest-1-straight-p | Nest tunnels | 50 spawns, monsters 35-38, walk 29381 |

Sources: datapack l2j_teleport.sql, gk_live/Bella.json, spawns_h5.json, npcs_h5.json, npcstats, geopath.js.

<a id="elvenfortress"></a>
## Elven Fortress (underground) (monsters 10-17)

**How to get in.** Teleport from Elven Village with gatekeeper Mirabel -> "Elven Fortress" (~820 adena) (text seen in the live menu), landing (29294, 74968, -3776).

**Entrance.** Landing in front of the fortress; the underground part is west of it. (29294, 74968, -3776).

**Map layers** (`Maps/high`): 20_20, 20_20_1.

### Underground (z -4900 to -3950, monsters 10-17)

**Getting there:** walk from (29294, 74968, -3776).
Floor entry point (first point of the walk routes inside this floor (10/10 routes pass within 1500)): (26312, 74936, -4096).
Facing for left/right: west (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| elvenfortress-1-straight-a | straight (west) | 1168 / 4157 | Baraq Orc Fighter 10 (A) x3 | 10-10 | 8-13 |  |
| elvenfortress-1-left-a | left (south-west) | 3366 / 6405 | Baraq Orc Fighter 10 (A) x3, Baraq Orc Warrior Leader 11 x3, Dungeon Skeleton Archer 13 x2, Dungeon Skeleton 12 (A) x2 | 10-13 | 11-13 |  |
| elvenfortress-1-straight-b | straight (west) | 4723 / 7812 | Baraq Orc Warrior Leader 11 x2, Baraq Orc Fighter 10 (A) x1 | 10-11 | 9-13 |  |
| elvenfortress-1-left-b | left (south-west) | 5003 / 8122 | Baraq Orc Fighter 10 (A) x2, Baraq Orc Warrior Leader 11 x2 | 10-11 | 9-13 |  |
| elvenfortress-1-left-c | left (south) | 5373 / 8527 | Baraq Orc Fighter 10 (A) x4, Dungeon Skeleton 12 (A) x2 | 10-12 | 10-13 |  |
| elvenfortress-1-left-d | left (south) | 7787 / 10834 | Dungeon Skeleton 12 (A) x2, Dread Soldier 14 (A) x2, Dungeon Skeleton Archer 13 x1 | 12-14 | 12-15 |  |
| elvenfortress-1-left-e | left (south-west) | 7801 / 10875 | Dungeon Skeleton Archer 13 x2, Dungeon Skeleton 12 (A) x2, Dread Soldier 14 (A) x2 | 12-14 | 12-15 |  |
| elvenfortress-1-left-f | left (south) | 9008 / 12108 | Dungeon Skeleton 12 (A) x2, Dread Soldier 14 (A) x2 | 12-14 | 12-15 |  |
| elvenfortress-1-left-g | left (south-west) | 9851 / 13017 | Dungeon Skeleton 12 (A) x4, Dungeon Skeleton Archer 13 x2, Dread Soldier 14 (A) x2, Shade Horror 17 x1 | 12-17 | 15-15 |  |
| elvenfortress-1-straight-c | straight (west) | 15745 / 18961 | Shade Horror 17 x2, Dark Terror 16 (A) x2, Mist Terror 15 (A) x2 | 15-17 | 15-18 | DANGER: monsters up to level 17, 5+ above the neighbouring rooms (max 11) |

**Dangers.** Rooms much higher than their neighbours: elvenfortress-1-straight-c. Aggressive (datapack): Baraq Orc Fighter, Dungeon Skeleton, Dread Soldier, Dark Terror, Mist Terror.

**Notes.** Level 10-17 (Baraq Orcs, Dungeon Skeletons, Dread Soldiers, Terrors).

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 8 | elvenfortress-1-straight-a | Underground | 3 spawns, monsters 10-10, walk 4157 |
| 9 | elvenfortress-1-left-b | Underground | 4 spawns, monsters 10-11, walk 8122 |
| 10 | elvenfortress-1-left-c | Underground | 6 spawns, monsters 10-12, walk 8527 |
| 11-13 | elvenfortress-1-left-a | Underground | 10 spawns, monsters 10-13, walk 6405 |
| 14 | elvenfortress-1-left-e | Underground | 6 spawns, monsters 12-14, walk 10875 |
| 15 | elvenfortress-1-left-g | Underground | 9 spawns, monsters 12-17, walk 13017 |

Sources: datapack l2j_teleport.sql, gk_live/Mirabel.json, spawns_h5.json, npcstats, geopath.js.

<a id="coalmines"></a>
## Abandoned Coal Mines (monsters 10-19)

**How to get in.** Teleport from Dwarven Village with gatekeeper Wirphy -> "Abandoned Coal Mines" (~690 adena) (text seen in the live menu), landing (139714, -177456, -1536).

**Entrance.** Landing at the west side of the mines. (139714, -177456, -1536).

**Map layers** (`Maps/high`): 24_12, 24_12_1, 24_12_2.

### Lower pit (z -2900 to -1400, monsters 10-19)

**Getting there:** walk from (139714, -177456, -1536).
Floor entry point (first point of the walk routes inside this floor (6/7 routes pass within 1500)): (138520, -174056, -1728).
Facing for left/right: south-west (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| coalmines-1-right-a | right (west) | 1924 / 6332 | Mineshaft Bat 11 x3, Monster Eye Tracker 10 x3, Akaste Bone Soldier 12 (A) x3, Darkstone Golem 13 x2, Gemstone Beast 12 x2, Akaste Bone Archer 14 x1 | 10-14 | 12-13 |  |
| coalmines-1-right-b | right (north) | 9455 | Goblin Brigand Leader 14 (A) x3, Obsidian Golem 15 x2 | 14-15 | 13-17 |  |
| coalmines-1-left-a | left (south-east) | 10457 / 14728 | Mineshaft Bat 11 x1, Monster Eye Tracker 10 x1, Darkstone Golem 13 x1, Boogle Ratman 16 x1, Akaste Bone Warlord 17 (A) x1, Akaste Bone Archer 14 x1, Akaste Bone Soldier 12 (A) x1, Opal Beast 15 (A) x1, Gemstone Beast 12 x1 | 10-17 | 11-16 | mixed levels: suggestion built on the median monster level 13 |
| coalmines-1-left-b | left (south-east) | 11771 / 15995 | Mineshaft Bat 11 x3, Monster Eye Tracker 10 x2, Darkstone Golem 13 x2, Akaste Bone Soldier 12 (A) x2, Gemstone Beast 12 x2, Boogle Ratman 16 x1 | 10-16 | 10-15 | mixed levels: suggestion built on the median monster level 12 |
| coalmines-1-left-c | left (south-east) | 12829 / 17065 | Akaste Bone Warlord 17 (A) x5, Mineshaft Bat 11 x2, Monster Eye Tracker 10 x2, Boogle Ratman 16 x2, Akaste Bone Soldier 12 (A) x2, Gemstone Beast 12 x2, Akaste Bone Archer 14 x1 | 10-17 | 12-17 | mixed levels: suggestion built on the median monster level 14 |
| coalmines-1-left-d | left (east) | 22348 | Akaste Bone Warlord 17 (A) x4, Opal Beast 15 (A) x4, Boogle Ratman 16 x3, Will-O-Wisp 15 x2, Akaste Bone Archer 14 x1 | 14-17 | 15-17 |  |
| coalmines-1-left-e | left (east) | 28776 | Corpse Candle 17 x3, Pitchstone Golem 19 x3, Boogle Ratman Leader 18 x2, Ore Bat 17 x2 | 17-19 | 17-20 |  |

### Middle terraces (z -300 to 800, monsters 14-19)

**Getting there:** walk from (139714, -177456, -1536).
Floor entry point (first point of the walk routes inside this floor (5/5 routes pass within 1500)): (149800, -167672, 88).
Facing for left/right: north (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| coalmines-2-straight-a | straight (north) | 2702 / 29018 | Boogle Ratman 16 x4, Akaste Bone Warlord 17 (A) x3, Opal Beast 15 (A) x3, Akaste Bone Archer 14 x2, Will-O-Wisp 15 x2 | 14-17 | 15-17 |  |
| coalmines-2-left-a | left (west) | 8474 / 34827 | Boogle Ratman 16 x5, Akaste Bone Warlord 17 (A) x2 | 16-17 | 15-19 |  |
| coalmines-2-left-b | left (north-west) | 12073 / 38493 | Opal Beast 15 (A) x3, Will-O-Wisp 15 x3, Akaste Bone Warlord 17 (A) x2, Boogle Ratman 16 x1, Akaste Bone Archer 14 x1 | 14-17 | 15-17 |  |
| coalmines-2-left-c | left (north-west) | 17353 / 43856 | Boogle Ratman Leader 18 x4, Ore Bat 17 x4, Corpse Candle 17 x3, Pitchstone Golem 19 x3 | 17-19 | 17-20 |  |
| coalmines-2-straight-b | straight (north) | 22585 / 49223 | Corpse Candle 17 x3, Pitchstone Golem 19 x3, Boogle Ratman Leader 18 x2, Ore Bat 17 x2 | 17-19 | 17-20 |  |

### Upper terraces (z 1700 to 2700, monsters 17-19)

**Getting there:** walk from (139714, -177456, -1536).
Floor entry point (first point of the walk routes inside this floor (3/3 routes pass within 1500)): (146200, -171944, 2248).
Facing for left/right: east (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| coalmines-3-straight-a | straight (east) | 1716 / 51504 | Pitchstone Golem 19 x3, Boogle Ratman Leader 18 x2, Corpse Candle 17 x2, Ore Bat 17 x1 | 17-19 | 17-20 |  |
| coalmines-3-left-a | left (north-east) | 2719 / 52549 | Boogle Ratman Leader 18 x3, Corpse Candle 17 x3, Ore Bat 17 x3, Pitchstone Golem 19 x2 | 17-19 | 17-20 |  |
| coalmines-3-right-a | right (south-east) | 3386 / 53118 | Corpse Candle 17 x5, Pitchstone Golem 19 x5, Ore Bat 17 x4, Boogle Ratman Leader 18 x3 | 17-19 | 17-20 |  |

**Dangers.** Aggressive (datapack): Akaste Bone Soldier, Goblin Brigand Leader, Akaste Bone Warlord, Opal Beast.

**Notes.** An open-air mine (no roof), level 10-19. The heights are terraces joined by ramps.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 10-11 | coalmines-1-left-b | Lower pit | 12 spawns, monsters 10-16, walk 15995 |
| 12-13 | coalmines-1-right-a | Lower pit | 14 spawns, monsters 10-14, walk 6332 |
| 14-17 | coalmines-1-left-c | Lower pit | 16 spawns, monsters 10-17, walk 17065 |
| 18-20 | coalmines-3-right-a | Upper terraces | 17 spawns, monsters 17-19, walk 53118 |

Sources: datapack l2j_teleport.sql, gk_live/Wirphy.json, spawns_h5.json, npcstats, geopath.js.

<a id="caveoftrials"></a>
## Cave of Trials (monsters 10-22)

**How to get in.** Teleport from Orc Village with gatekeeper Tamil -> "Cave of Trials" (~1500 adena) (text seen in the live menu), landing (9340, -112509, -2536).

**Entrance.** Landing on the Immortal Plateau above the cave; the cave is underground (z -3800..-3300). (9340, -112509, -2536).

**Map layers** (`Maps/high`): 20_14, 20_14_1.

### Cave (z -3900 to -2950, monsters 10-22)

**Getting there:** walk from (9340, -112509, -2536).
Floor entry point (first point of the walk routes inside this floor (21/21 routes pass within 1500)): (12312, -112504, -2976).
Facing for left/right: east (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| caveoftrials-1-straight-a | straight (east) | 4550 / 7552 | Scarlet Salamander 17 x4, Scarlet Salamander Elder 18 x4 | 17-18 | 16-20 |  |
| caveoftrials-1-right-a | right (south-east) | 4775 / 7884 | Slave Skeleton 12 (A) x5, Grave Keeper 13 x4, Evil Eye Watcher 10 x4, Crypt Horror 15 (A) x1 | 10-15 | 13-13 |  |
| caveoftrials-1-left-a | left (north-east) | 4824 / 7854 | Slave Skeleton 12 (A) x3, Grave Keeper 13 x3, Evil Eye Watcher 10 x2 | 10-13 | 11-13 |  |
| caveoftrials-1-left-b | left (north-east) | 5778 / 8913 | Slave Skeleton 12 (A) x3, Grave Keeper 13 x3, Evil Eye Watcher 10 x3, Kuruka Ratman 16 x1 | 10-16 | 10-15 | mixed levels: suggestion built on the median monster level 12 |
| caveoftrials-1-straight-b | straight (east) | 8171 / 11296 | Quicksilver Beast 15 (A) x5, Kuruka Ratman Hunter 17 x4, Kuruka Ratman 16 x3, Grave Keeper 13 x2, Evil Eye Lookout 14 x2 | 13-17 | 15-16 |  |
| caveoftrials-1-right-b | right (south-east) | 8522 / 11594 | Crypt Horror 15 (A) x3, Grave Keeper 13 x2, Evil Eye Lookout 14 x2 | 13-15 | 13-16 |  |
| caveoftrials-1-left-c | left (north-east) | 9857 / 13236 | Kuruka Ratman 16 x1, Quicksilver Beast 15 (A) x1 | 15-16 | 14-18 |  |
| caveoftrials-1-straight-c | straight (east) | 10669 / 13880 | Ghost Guardian 21 (A) x3, Undead Slave 19 x3, Skeleton Longbowman 19 (A) x3, Ghost 20 (A) x3, Varangka's Guard 22 (A) x1, Varangka's Escort 21 (A) x1 | 19-22 | 20-22 |  |
| caveoftrials-1-straight-d | straight (east) | 11027 / 14256 | Scarlet Salamander Elder 18 x2, Undead Slave 19 x1, Scarlet Salamander 17 x1, Crypt Horror 15 (A) x1 | 15-19 | 17-18 |  |
| caveoftrials-1-straight-e | straight (east) | 11244 / 14312 | Kuruka Ratman 16 x1, Kuruka Ratman Hunter 17 x1, Crypt Horror 15 (A) x1 | 15-17 | 15-18 |  |
| caveoftrials-1-right-c | right (south-east) | 11503 / 14632 | Kuruka Ratman Hunter 17 x3, Kuruka Ratman 16 x1, Crypt Horror 15 (A) x1, Skeleton Longbowman 19 (A) x1 | 15-19 | 17-18 |  |
| caveoftrials-1-left-d | left (north-east) | 12165 / 15594 | Evil Eye Lookout 14 x2 | 14-14 | 12-17 |  |
| caveoftrials-1-left-e | left (north-east) | 13404 / 16875 | Evil Eye Lookout 14 x1 | 14-14 | 12-17 |  |
| caveoftrials-1-straight-f | straight (east) | 14122 / 17394 | Varangka's Guard 22 (A) x2, Varangka's Escort 21 (A) x2 | 21-22 | 20-24 |  |
| caveoftrials-1-left-f | left (north-east) | 14316 / 17825 | Evil Eye Lookout 14 x1, Quicksilver Beast 15 (A) x1 | 14-15 | 13-17 |  |
| caveoftrials-1-left-g | left (north-east) | 14787 / 18102 | Undead Slave 19 x4, Ghost Guardian 21 (A) x2, Ghost 20 (A) x1 | 19-21 | 19-22 | DANGER: monsters up to level 21, 5+ above the neighbouring rooms (max 14) |
| caveoftrials-1-straight-g | straight (south-east) | 14951 / 18206 | Undead Slave 19 x8, Skeleton Longbowman 19 (A) x7 | 19-19 | 17-22 |  |
| caveoftrials-1-left-h | left (north-east) | 15761 / 19230 | Evil Eye Lookout 14 x1 | 14-14 | 12-17 |  |
| caveoftrials-1-left-i | left (north-east) | 16548 / 20065 | Evil Eye Lookout 14 x2 | 14-14 | 12-17 |  |
| caveoftrials-1-straight-h | straight (east) | 17280 / 20713 | Ghost 20 (A) x2, Ghost Guardian 21 (A) x1, Undead Slave 19 x1 | 19-21 | 19-22 |  |
| caveoftrials-1-left-j | left (north-east) | 18410 / 21947 | Slave Skeleton 12 (A) x1 | 12-12 | 10-15 |  |

**Dangers.** Rooms much higher than their neighbours: caveoftrials-1-left-g. Aggressive (datapack): Slave Skeleton, Crypt Horror, Quicksilver Beast, Ghost Guardian, Skeleton Longbowman, Ghost, Varangka's Guard, Varangka's Escort.

**Notes.** Level 10-22 undead, ratmen, salamanders. Kasha monsters on the plateau above are excluded.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 10-12 | caveoftrials-1-left-b | Cave | 10 spawns, monsters 10-16, walk 8913 |
| 13 | caveoftrials-1-right-a | Cave | 14 spawns, monsters 10-15, walk 7884 |
| 14 | caveoftrials-1-left-b | Cave | 10 spawns, monsters 10-16, walk 8913 |
| 15-16 | caveoftrials-1-straight-b | Cave | 16 spawns, monsters 13-17, walk 11296 |
| 17-19 | caveoftrials-1-straight-g | Cave | 15 spawns, monsters 19-19, walk 18206 |
| 20-22 | caveoftrials-1-straight-c | Cave | 14 spawns, monsters 19-22, walk 13880 |
| 23-24 | caveoftrials-1-straight-f | Cave | 4 spawns, monsters 21-22, walk 17394 |

Sources: datapack l2j_teleport.sql, gk_live/Tamil.json, spawns_h5.json, npcstats, geopath.js.

<a id="toi"></a>
## Tower of Insolence (monsters 60-75)

**How to get in.** Aden: landing (114649, 11115, -5120).  Aden live menu not recorded; hunting_spots_h5 uses 'Aden -> ToI' (datapack 1088, 4200), landing 114649,11115,-5120 at the tower door.

**Entrance.** Tower door (south side). Walk north into the 1st floor. (114649, 11115, -5120).
Other teleports: Retail noble/Olympiad links to the 3rd, 5th, 7th, 10th, 13th floor.

**Map layers** (`Maps/high`): 23_18, 23_18_1.

### 1st floor (z -5600 to -4800, monsters 60-62)

**Getting there:** walk from (114649, 11115, -5120), floor entry (115168, 16022, -5100). Floor point = datapack GM teleport "TOI - 1st Floor" (not a player teleport). Walk in from the door.
Geodata walk check (114649, 11115, -5120) -> (115168, 16022, -5100): route found, ~5131 units.
Floor entry point (first point of the walk routes inside this floor (4/4 routes pass within 1500)): (115168, 16022, -5100).
Facing for left/right: north (entry is in the middle of the floor: facing north (left = west, right = east)).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| toi-1-right-a | right (north-east) | 1415 / 1489 | Ghost of the Tower 60 (A) x3, Hallate's Seer 60 (A) x3, Ghastly Warrior 61 (A) x3, Blader of Despair 62 (A) x3 | 60-62 | 60-63 |  |
| toi-1-right-b | right (south-east) | 1564 / 1648 | Ghost of the Tower 60 (A) x3, Hallate's Seer 60 (A) x3, Ghastly Warrior 61 (A) x3, Blader of Despair 62 (A) x3 | 60-62 | 60-63 |  |
| toi-1-left-a | left (north-west) | 2128 / 2231 | Ghost of the Tower 60 (A) x3, Hallate's Seer 60 (A) x3, Ghastly Warrior 61 (A) x3, Blader of Despair 62 (A) x3 | 60-62 | 60-63 |  |
| toi-1-left-b | left (south-west) | 2285 / 2354 | Ghost of the Tower 60 (A) x3, Hallate's Seer 60 (A) x3, Ghastly Warrior 61 (A) x3, Blader of Despair 62 (A) x3 | 60-62 | 60-63 |  |

### 2nd floor (z -4100 to -3300, monsters 60-63)

**Getting there:** stairs from (115168, 16022, -5100), floor entry (114649, 18587, -3609). Floor point = datapack GM teleport "TOI - 2nd Floor" (not a player teleport). Walk up from the floor below; floorWalkCheck says whether geodata connects them.
Geodata walk check (115168, 16022, -5100) -> (114649, 18587, -3609): route found, ~17685 units.
Floor entry point (first point of the walk routes inside this floor (4/4 routes pass within 1500)): (114649, 18587, -3609).
Facing for left/right: north (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| toi-2-left-a | left (north-west) | 2788 / 2874 | Hallate's Seer 60 (A) x4, Archer of Despair 61 (A) x4, Hound Dog of Hallate 63 (A) x4, Crendion 62 (A) x3, Slaughter Bathin 63 (A) x1 | 60-63 | 61-63 |  |
| toi-2-right-a | right (north-east) | 3277 / 3400 | Hallate's Seer 60 (A) x4, Hound Dog of Hallate 63 (A) x4, Archer of Despair 61 (A) x3, Crendion 62 (A) x3, Slaughter Bathin 63 (A) x2 | 60-63 | 61-63 |  |
| toi-2-straight-a | straight (north) | 3907 / 4091 | Crendion 62 (A) x5, Hallate's Seer 60 (A) x4, Archer of Despair 61 (A) x4, Hound Dog of Hallate 63 (A) x4, Slaughter Bathin 63 (A) x1 | 60-63 | 61-63 |  |
| toi-2-straight-b | straight (north) | 4097 / 4254 | Hallate's Seer 60 (A) x4, Hound Dog of Hallate 63 (A) x4, Archer of Despair 61 (A) x3, Crendion 62 (A) x3, Slaughter Bathin 63 (A) x1 | 60-63 | 61-63 |  |

### 3rd floor (z -2500 to -1900, monsters 63-66)

**Getting there:** stairs from (114649, 18587, -3609), floor entry (117918, 16039, -2127). Floor point = datapack GM teleport "TOI - 3rd Floor" (not a player teleport). Walk up from the floor below; floorWalkCheck says whether geodata connects them.
Geodata walk check (114649, 18587, -3609) -> (117918, 16039, -2127): route found, ~14570 units.
Floor entry point (first point of the walk routes inside this floor (3/3 routes pass within 1500)): (117918, 16039, -2127).
Facing for left/right: west (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| toi-3-straight-a | straight (north-west) | 3213 / 3313 | Hallate's Knight 65 (A) x6, Hallate's Royal Guard 63 (A) x5, Corrupt Sage 64 (A) x5, Hallate's Maid 66 (A) x3 | 63-66 | 64-66 | DANGER: near Immortal Savior Mardil (raid 71, 3556 away), Death Lord Hallate (raid 73, 2977 away) |
| toi-3-left-a | left (south-west) | 3349 / 3466 | Hallate's Royal Guard 63 (A) x6, Corrupt Sage 64 (A) x6, Hallate's Knight 65 (A) x6, Hallate's Maid 66 (A) x6 | 63-66 | 64-66 | DANGER: near Immortal Savior Mardil (raid 71, 2607 away), Death Lord Hallate (raid 73, 2232 away) |
| toi-3-straight-b | straight (west) | 4658 / 4770 | Hallate's Royal Guard 63 (A) x5, Hallate's Maid 66 (A) x5, Hallate's Knight 65 (A) x4, Corrupt Sage 64 (A) x3 | 63-66 | 64-66 | DANGER: near Immortal Savior Mardil (raid 71, 2719 away), Death Lord Hallate (raid 73, 2208 away) |

### 4th floor (z -1000 to -400, monsters 63-66)

**Getting there:** stairs from (117918, 16039, -2127), floor entry (114622, 12946, -645). Floor point = datapack GM teleport "TOI - 4th Floor" (not a player teleport). Walk up from the floor below; floorWalkCheck says whether geodata connects them.
Geodata walk check (117918, 16039, -2127) -> (114622, 12946, -645): route found, ~15266 units.
Floor entry point (first point of the walk routes inside this floor (4/4 routes pass within 1500)): (114622, 12946, -645).
Facing for left/right: south (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| toi-4-left-a | left (south-east) | 3342 / 3454 | Hound Dog of Hallate 63 (A) x5, Hallate's Warrior 64 (A) x5, Erin Ediunce 66 (A) x5, Archer of Abyss 65 (A) x3 | 63-66 | 64-66 |  |
| toi-4-right-a | right (south-west) | 3453 / 3560 | Hallate's Warrior 64 (A) x6, Erin Ediunce 66 (A) x4, Hound Dog of Hallate 63 (A) x2, Archer of Abyss 65 (A) x2, Elmoradan's Lady 65 (A) x1 | 63-66 | 64-66 |  |
| toi-4-straight-a | straight (south-west) | 4455 / 4543 | Hound Dog of Hallate 63 (A) x3, Hallate's Warrior 64 (A) x3, Archer of Abyss 65 (A) x3, Erin Ediunce 66 (A) x3 | 63-66 | 64-66 |  |
| toi-4-straight-b | straight (south) | 4467 / 4607 | Hallate's Warrior 64 (A) x5, Erin Ediunce 66 (A) x3, Hound Dog of Hallate 63 (A) x2, Archer of Abyss 65 (A) x2, Elmoradan's Lady 65 (A) x1 | 63-66 | 64-66 |  |

### 5th floor (z 600 to 1250, monsters 67-69)

**Getting there:** stairs from (114622, 12946, -645), floor entry (112209, 16078, 928). Floor point = datapack GM teleport "TOI - 5th Floor" (not a player teleport). Walk up from the floor below; floorWalkCheck says whether geodata connects them.
Geodata walk check (114622, 12946, -645) -> (112209, 16078, 928): route found, ~15796 units.
Floor entry point (first point of the walk routes inside this floor (6/6 routes pass within 1500)): (112209, 16078, 928).
Facing for left/right: east (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| toi-5-left-a | left (north-east) | 2349 / 2467 | Hallate's Commander 67 (A) x4, Hallate's Inspector 68 (A) x2, Hallate's Guardian 69 (A) x2, Hallate's Follower Mul 68 (A) x1 | 67-69 | 67-70 |  |
| toi-5-left-b | left (north-east) | 4499 / 4666 | Hallate's Guardian 69 (A) x3, Hallate's Commander 67 (A) x2, Hallate's Inspector 68 (A) x2 | 67-69 | 67-70 |  |
| toi-5-straight-a | straight (east) | 5684 / 6023 | Hallate's Commander 67 (A) x5, Hallate's Guardian 69 (A) x5, Hallate's Inspector 68 (A) x4, Hallate's Follower Mul 68 (A) x1 | 67-69 | 67-70 |  |
| toi-5-right-a | right (south-east) | 6300 / 6620 | Hallate's Commander 67 (A) x3, Hallate's Inspector 68 (A) x1 | 67-68 | 66-70 |  |
| toi-5-right-b | right (south-east) | 6645 / 6999 | Hallate's Inspector 68 (A) x5, Hallate's Guardian 69 (A) x5, Hallate's Commander 67 (A) x1 | 67-69 | 67-70 |  |
| toi-5-right-c | right (south-east) | 7968 / 8529 | Hallate's Commander 67 (A) x2, Hallate's Inspector 68 (A) x2, Hallate's Guardian 69 (A) x2 | 67-69 | 67-70 |  |

### 6th floor (z 1600 to 2300, monsters 67-69)

**Getting there:** stairs from (112209, 16078, 928), floor entry (112376, 16099, 1947). Floor point = datapack GM teleport "TOI - 6th Floor" (not a player teleport). Walk up from the floor below; floorWalkCheck says whether geodata connects them.
Geodata walk check (112209, 16078, 928) -> (112376, 16099, 1947): route found, ~18846 units.
Floor entry point (first point of the walk routes inside this floor (1/1 routes pass within 1500)): (112376, 16099, 1947).
Facing for left/right: east (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| toi-6-straight-a | straight (east) | 3593 / 3674 | Platinum Tribe Soldier 67 (A) x13, Platinum Tribe Warrior 69 (A) x13, Platinum Tribe Archer 68 (A) x11 | 67-69 | 67-70 | DANGER: near Korim (raid 70, 1925 away) |

### 7th floor (z 2600 to 3300, monsters 70-72)

**Getting there:** stairs from (112376, 16099, 1947), floor entry (114448, 16175, 2994). Floor point = datapack GM teleport "TOI - 7th Floor" (not a player teleport). Walk up from the floor below; floorWalkCheck says whether geodata connects them.
Geodata walk check (112376, 16099, 1947) -> (114448, 16175, 2994): route found, ~22479 units.
Floor entry point (first point of the walk routes inside this floor (2/2 routes pass within 1500)): (114448, 16175, 2994).
Facing for left/right: north (entry is in the middle of the floor: facing north (left = west, right = east)).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| toi-7-straight-a | straight (north) | 631 | Guardian Angel 72 (A) x5, Platinum Tribe Shaman 70 (A) x4, Platinum Tribe Overlord 71 (A) x4, Magus Valac 70 (A) x3 | 70-72 | 70-73 |  |
| toi-7-left-a | left (south-west) | 1411 / 1421 | Platinum Tribe Overlord 71 (A) x5, Platinum Tribe Shaman 70 (A) x4, Guardian Angel 72 (A) x3 | 70-72 | 70-73 |  |

### 8th floor (z 3600 to 4300, monsters 70-72)

**Getting there:** stairs from (114448, 16175, 2994), floor entry (111063, 16118, 3967). Floor point = datapack GM teleport "TOI - 8th Floor" (not a player teleport). Walk up from the floor below; floorWalkCheck says whether geodata connects them.
Geodata walk check (114448, 16175, 2994) -> (111063, 16118, 3967): route found, ~8704 units.
Floor entry point (first point of the walk routes inside this floor (1/1 routes pass within 1500)): (111832, 16168, 3960).
Facing for left/right: east (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| toi-8-straight-a | straight (east) | 5235 / 6260 | Messenger Angel 70 (A) x10, Platinum Guardian Warrior 72 (A) x10, Platinum Guardian Archer 71 (A) x7 | 70-72 | 70-73 | DANGER: near Kernon (raid 75, 1375 away) |

### 9th floor (z 4600 to 5300, monsters 72-74)

**Getting there:** stairs from (111063, 16118, 3967), floor entry (117147, 18415, 4977). Floor point = datapack GM teleport "TOI - 9th Floor" (not a player teleport). Walk up from the floor below; floorWalkCheck says whether geodata connects them.
Geodata walk check (111063, 16118, 3967) -> (117147, 18415, 4977): route found, ~18094 units.
Floor entry point (first point of the walk routes inside this floor (2/2 routes pass within 1500)): (117147, 18415, 4977).
Facing for left/right: north-west (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| toi-9-straight-a | straight (north-west) | 2827 / 2885 | Guardian Angel 72 (A) x7, Platinum Guardian Prefect 74 (A) x7, Platinum Guardian Shaman 73 (A) x5, Binder 73 (A) x2 | 72-74 | 72-75 |  |
| toi-9-straight-b | straight (north-west) | 4445 / 4549 | Guardian Angel 72 (A) x5, Platinum Guardian Prefect 74 (A) x5, Platinum Guardian Shaman 73 (A) x4, Binder 73 (A) x1 | 72-74 | 72-75 |  |

### 10th floor (z 5600 to 6300, monsters 73-75)

**Getting there:** stairs from (117147, 18415, 4977), floor entry (118374, 15973, 5987). Floor point = datapack GM teleport "TOI - 10th Floor" (not a player teleport). Walk up from the floor below; floorWalkCheck says whether geodata connects them.
Geodata walk check (117147, 18415, 4977) -> (118374, 15973, 5987): route found, ~13918 units.
Floor entry point (first point of the walk routes inside this floor (4/4 routes pass within 1500)): (118374, 15973, 5987).
Facing for left/right: west (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| toi-10-straight-a | straight (west) | 1575 / 1677 | Platinum Guardian Prefect 74 (A) x3, Seal Angel 73 (A) x2, Seal Archangel 75 (A) x2 | 73-75 | 73-76 |  |
| toi-10-straight-b | straight (west) | 5925 / 6113 | Seal Angel 73 (A) x3, Seal Archangel 75 (A) x3, Platinum Guardian Prefect 74 (A) x2 | 73-75 | 73-76 |  |
| toi-10-straight-c | straight (west) | 8147 / 8366 | Platinum Guardian Prefect 74 (A) x3, Seal Angel 73 (A) x2, Seal Archangel 75 (A) x2 | 73-75 | 73-76 |  |
| toi-10-straight-d | straight (west) | 8686 / 8964 | Seal Angel 73 (A) x3, Seal Archangel 75 (A) x3, Platinum Guardian Prefect 74 (A) x2 | 73-75 | 73-76 |  |

### 11th floor (z 6800 to 7400, monsters 73-75)

**Getting there:** stairs from (118374, 15973, 5987), floor entry (112209, 16078, 7028). Floor point = datapack GM teleport "TOI - 11th Floor" (not a player teleport). Walk up from the floor below; floorWalkCheck says whether geodata connects them.
Geodata walk check (118374, 15973, 5987) -> (112209, 16078, 7028): route found, ~19273 units.
Floor entry point (first point of the walk routes inside this floor (2/2 routes pass within 1500)): (112209, 16078, 7028).
Facing for left/right: east (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| toi-11-straight-a | straight (east) | 2265 / 2386 | Guardian Archangel 74 (A) x7, Platinum Guardian Shaman 73 (A) x5, Platinum Guardian Chief 75 (A) x4, Power Angel Amon 75 (A) x1 | 73-75 | 73-76 | DANGER: near Fire of Wrath Shuriel (raid 78, 1397 away), Longhorn Golkonda (raid 79, 2040 away) |
| toi-11-straight-b | straight (south-east) | 2777 / 2812 | Guardian Archangel 74 (A) x5, Platinum Guardian Chief 75 (A) x5, Platinum Guardian Shaman 73 (A) x4, Power Angel Amon 75 (A) x1 | 73-75 | 73-76 | DANGER: near Fire of Wrath Shuriel (raid 78, 1483 away), Longhorn Golkonda (raid 79, 2276 away) |

### 12th floor (z 7700 to 8400, monsters 73-75)

**Getting there:** stairs from (112209, 16078, 7028), floor entry (114809, 18711, 7996). Floor point = datapack GM teleport "TOI - 12th Floor" (not a player teleport). Walk up from the floor below; floorWalkCheck says whether geodata connects them.
Geodata walk check (112209, 16078, 7028) -> (114809, 18711, 7996): route found, ~9452 units.
Floor entry point (first point of the walk routes inside this floor (1/1 routes pass within 1500)): (114809, 18711, 7996).
Facing for left/right: north (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| toi-12-straight-a | straight (north) | 7166 / 7457 | Guardian Archangel 74 (A) x7, Platinum Guardian Shaman 73 (A) x4, Platinum Guardian Chief 75 (A) x4 | 73-75 | 73-76 |  |

**Dangers.** Raid/epic bosses: Enmity Ghost Ramdal 65 (raid at 113232,17456,-4384); Korim 70 (raid at 116151,16227,1944); Immortal Savior Mardil 71 (raid at 113200,17552,-1424); Death Lord Hallate 73 (raid at 113551,17083,-2120); Kernon 75 (raid at 113432,16403,3960); Fire of Wrath Shuriel 78 (raid at 113102,16002,6992); Longhorn Golkonda 79 (raid at 116263,15916,6992). Rooms much higher than their neighbours: toi-3-straight-a, toi-3-left-a, toi-3-straight-b, toi-6-straight-a, toi-8-straight-a, toi-11-straight-a, toi-11-straight-b. Aggressive (datapack): Ghost of the Tower, Hallate's Seer, Ghastly Warrior, Blader of Despair, Archer of Despair, Hound Dog of Hallate, Crendion, Slaughter Bathin, Hallate's Knight, Hallate's Royal Guard, Corrupt Sage, Hallate's Maid, Hallate's Warrior, Erin Ediunce, Archer of Abyss, Elmoradan's Lady, Hallate's Commander, Hallate's Inspector, Hallate's Guardian, Hallate's Follower Mul, Platinum Tribe Soldier, Platinum Tribe Warrior, Platinum Tribe Archer, Guardian Angel, Platinum Tribe Shaman, Platinum Tribe Overlord, Magus Valac, Messenger Angel, Platinum Guardian Warrior, Platinum Guardian Archer, Platinum Guardian Prefect, Platinum Guardian Shaman, Binder, Seal Angel, Seal Archangel, Guardian Archangel, Platinum Guardian Chief, Power Angel Amon.

**Notes.** Floors 1-4: level 60-66; 5-8: 67-72; 9-12: 72-75. Dimensional Vortex NPCs (1st, 5th, 9th floor) move you between floors for Dimension stones (knowledge). Baium sits on top. Routes: geopath.js run with two local fixes (the search key held only 8 layers per cell, this tower has up to 18; the search could stop on the goal column at another floor). The stock docs/plan/tools/geopath.js gives wrong routes here until those fixes are applied.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 60 | toi-1-right-a | 1st floor | 12 spawns, monsters 60-62, walk 1489 |
| 61-63 | toi-2-straight-a | 2nd floor | 18 spawns, monsters 60-63, walk 4091 |
| 64-66 | toi-4-left-a | 4th floor | 18 spawns, monsters 63-66, walk 3454 |
| 67-69 | toi-5-straight-a | 5th floor | 15 spawns, monsters 67-69, walk 6023 |
| 70-73 | toi-7-straight-a | 7th floor | 16 spawns, monsters 70-72, walk 631 |
| 74-75 | toi-9-straight-a | 9th floor | 21 spawns, monsters 72-74, walk 2885 |
| 76 | toi-12-straight-a | 12th floor | 15 spawns, monsters 73-75, walk 7457 |

Sources: datapack l2j_teleport.sql, spawns_h5.json, npcs_h5.json, npcstats, geopath.js.

<a id="pagan"></a>
## Pagan Temple (monsters 78-78)

**How to get in.** Rune:  No gatekeeper link: walk from Rune to Triol's Mirror (32039) at 34842,-49756,-763 and use it. Knowledge (H5): entry needs a Visitor's Mark / Pagan's Mark (quests Q00636 Truth Beyond the Gate / Q00637 Through the Gate Once More).

**Entrance.** Entrance hall inside (datapack 'Pagan Temple -> exit' target). Temple Gatekeepers 32034/32035 here open the doors. (-16307, -36591, -10725).

**Map layers** (`Maps/high`): 19_16.

### Temple and chapel (z -11250 to -10300, monsters 78-78)

**Getting there:** teleporter via Triol's Mirror (32039) at (34842, -49756, -763), floor entry (-16307, -36591, -10725). Landing assumed = the entrance hall (the datapack has no 'into the temple' teleport). Needs the mark item (knowledge).
Facing for left/right: north (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| pagan-1-right-a | right (north-east) | 4987 | Zombie Worker 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-left-a | left (north-west) | 5023 | Old Aristocrat's Soldier 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-a | straight (north) | 5491 | Zombie Worker 78 (A) x14, Ritual Offering 78 (A) x4, Old Aristocrat's Soldier 78 (A) x1, Forgotten Victim 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-right-b | right (north-east) | 6237 | Penance Guard 78 (A) x6, Zombie Worker 78 (A) x3, Old Aristocrat's Soldier 78 (A) x2, Forgotten Victim 78 (A) x1, Triol's Layperson 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-left-b | left (north-west) | 6544 | Penance Guard 78 (A) x6, Old Aristocrat's Soldier 78 (A) x3, Penance Guard 78 (A) x3, Zombie Worker 78 (A) x2, Forgotten Victim 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-right-c | right (east) | 7644 | Zombie Worker 78 (A) x3, Penance Guard 78 (A) x3, Old Aristocrat's Soldier 78 (A) x2, Forgotten Victim 78 (A) x2 | 78-78 | 76-81 |  |
| pagan-1-left-c | left (west) | 7728 | Penance Guard 78 (A) x3, Old Aristocrat's Soldier 78 (A) x2, Zombie Worker 78 (A) x2, Forgotten Victim 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-right-d | right (north-east) | 7837 | Penance Guard 78 (A) x3 | 78-78 | 76-81 |  |
| pagan-1-left-d | left (north-west) | 8298 | Penance Guard 78 (A) x3, Penance Guard 78 (A) x3, Old Aristocrat's Soldier 78 (A) x2, Zombie Worker 78 (A) x2, Forgotten Victim 78 (A) x2 | 78-78 | 76-81 |  |
| pagan-1-right-e | right (north-east) | 8693 | Zombie Worker 78 (A) x5, Penance Guard 78 (A) x3, Old Aristocrat's Soldier 78 (A) x3, Forgotten Victim 78 (A) x3, Triol's Layperson 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-right-f | right (north-east) | 9121 | Penance Guard 78 (A) x3 | 78-78 | 76-81 |  |
| pagan-1-right-g | right (north-east) | 9423 | Penance Guard 78 (A) x3 | 78-78 | 76-81 |  |
| pagan-1-right-h | right (east) | 9976 | Penance Guard 78 (A) x3, Triol's Layperson 78 (A) x3, Ritual Sacrifice 78 (A) x3, Resurrected Temple Knight 78 (A) x2, Triol's Believer 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-left-e | left (west) | 10029 | Penance Guard 78 (A) x6, Resurrected Temple Knight 78 (A) x4, Ritual Sacrifice 78 (A) x3, Triol's Layperson 78 (A) x2, Triol's Believer 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-b | straight (north) | 10290 | Chapel Guard 78 (A) x11, Triol's Believer 78 (A) x3, Ritual Offering 78 (A) x3, Triol's Priest 78 (A) x1, Ritual Offering 78 (A) x1, Triol's Priest 78 (A) x1, Andreas' Royal Guards 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-c | straight (north) | 10445 | Chapel Guard 78 (A) x5, Ritual Offering 78 (A) x4, Andreas' Royal Guards 78 (A) x3, Triol's Believer 78 (A) x2, Triol's Priest 78 (A) x1, Ritual Offering 78 (A) x1, Triol's Priest 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-right-i | right (north-east) | 10519 | Penance Guard 78 (A) x3 | 78-78 | 76-81 |  |
| pagan-1-left-f | left (north-west) | 10545 | Penance Guard 78 (A) x3 | 78-78 | 76-81 |  |
| pagan-1-left-g | left (north-west) | 11345 | Penance Guard 78 (A) x3, Triol's Layperson 78 (A) x3, Resurrected Temple Knight 78 (A) x3, Triol's Believer 78 (A) x2, Ritual Sacrifice 78 (A) x2 | 78-78 | 76-81 |  |
| pagan-1-right-j | right (north-east) | 11365 | Penance Guard 78 (A) x3, Triol's Layperson 78 (A) x3, Resurrected Temple Knight 78 (A) x3, Ritual Sacrifice 78 (A) x3, Triol's Believer 78 (A) x2 | 78-78 | 76-81 |  |
| pagan-1-straight-d | straight (north) | 12481 | Chapel Guard 78 (A) x6, Zombie Worker 78 (A) x3, Old Aristocrat's Soldier 78 (A) x2, Forgotten Victim 78 (A) x2, Triol's Priest 78 (A) x2, Ritual Offering 78 (A) x2, Triol's Priest 78 (A) x2, Triol's Layperson 78 (A) x1, Triol's Believer 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-e | straight (north) | 12836 | Chapel Guard 78 (A) x18, Andreas' Royal Guards 78 (A) x10, Temple Guard 78 (A) x2, Ritual Sacrifice 78 (A) x2, Triol's Believer 78 (A) x1, Triol's Priest 78 (A) x1, Ritual Offering 78 (A) x1, Ritual Offering 78 (A) x1, Triol's Priest 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-f | straight (north) | 13501 | Triol's Layperson 78 (A) x6, Triol's Believer 78 (A) x5, Chapel Guard 78 (A) x3, Triol's Priest 78 (A) x1, Ritual Offering 78 (A) x1, Triol's Priest 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-g | straight (north) | 15140 | Chapel Guard 78 (A) x6, Triol's Believer 78 (A) x3, Triol's Priest 78 (A) x3, Ritual Offering 78 (A) x3, Triol's Layperson 78 (A) x1, Triol's Priest 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-h | straight (north) | 15534 | Chapel Guard 78 (A) x3, Triol's Believer 78 (A) x3, Temple Guard Captain 78 (A) x3, Ritual Offering 78 (A) x2, Temple Guard 78 (A) x2, Ritual Sacrifice 78 (A) x2, Triol's Priest 78 (A) x1, Triol's Priest 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-i | straight (north) | 15595 | Triol's Believer 78 (A) x7, Chapel Guard 78 (A) x6, Triol's Layperson 78 (A) x2, Triol's Priest 78 (A) x2, Ritual Offering 78 (A) x2, Temple Guard Captain 78 (A) x2, Triol's Priest 78 (A) x2 | 78-78 | 76-81 |  |
| pagan-1-straight-j | straight (north) | 17198 | Chapel Guard 78 (A) x6, Temple Guard Captain 78 (A) x4, Ritual Sacrifice 78 (A) x3, Triol's Believer 78 (A) x2, Triol's Priest 78 (A) x1, Triol's Priest 78 (A) x1, Triol's High Priest 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-k | straight (north) | 17243 | Chapel Guard 78 (A) x6, Triol's Priest 78 (A) x4, Triol's Priest 78 (A) x3, Temple Guard 78 (A) x3, Ritual Sacrifice 78 (A) x3, Triol's Believer 78 (A) x2, Ritual Offering 78 (A) x2, Triol's High Priest 78 (A) x1, Triol's High Priest 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-l | straight (north) | 17430 | Chapel Guard 78 (A) x6, Ritual Sacrifice 78 (A) x4, Triol's Priest 78 (A) x4, Triol's Believer 78 (A) x2, Ritual Offering 78 (A) x2, Triol's Priest 78 (A) x2, Temple Guard 78 (A) x2, Temple Guard Captain 78 (A) x1, Triol's High Priest 78 (A) x1, Triol's Believer 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-m | straight (north) | 20315 | Temple Guard 78 (A) x2, Temple Guard Captain 78 (A) x1, Triol's High Priest 78 (A) x1, Triol's Priest 78 (A) x1, Triol's Believer 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-n | straight (north) | 20323 | Temple Guard 78 (A) x2, Temple Guard Captain 78 (A) x1, Triol's High Priest 78 (A) x1, Triol's Priest 78 (A) x1, Triol's Believer 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-o | straight (north) | 30032 | Triol's Priest 78 (A) x6, Ritual Sacrifice 78 (A) x4, Triol's Priest 78 (A) x3, Triol's High Priest 78 (A) x2, Triol's Priest 78 (A) x2, Triol's High Priest 78 (A) x2, Ritual Sacrifice 78 (A) x2, Triol's Priest 78 (A) x1, Triol's Believer 78 (A) x1, Triol's High Priest 78 (A) x1, Triol's Believer 78 (A) x1, Triol's Priest 78 (A) x1, Triol's Believer 78 (A) x1, Triol's High Priest 78 (A) x1, Triol's Believer 78 (A) x1, Triol's High Priest 78 (A) x1, Ritual Sacrifice 78 (A) x1, Triol's Priest 78 (A) x1, Triol's Priest 78 (A) x1 | 78-78 | 76-81 |  |
| pagan-1-straight-p | straight (north) | 33573 | Andreas' Captain of the Royal Guard 78 (A) x16, Andreas' Royal Guards 78 (A) x3, Ritual Sacrifice 78 x3, Andreas' Captain of the Royal Guard 78 (A) x1 | 78-78 | 76-81 |  |

### Lowest chapel hall (z -12300 to -11250, monsters 78-78)

**Getting there:** walk from (-16307, -36591, -10725). The chapel is deeper south; 'Pagan Chapel -> exit' lands at -16359,-43803,-10725.
Floor entry point (first point of the walk routes inside this floor (1/1 routes pass within 1500)): (-14280, -54152, -11336).
Facing for left/right: west (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| pagan-2-straight-a | straight (west) | 2705 / 24603 | Triol's Believer 78 (A) x4, Triol's High Priest 78 (A) x3, Triol's Priest 78 (A) x3, Triol's Priest 78 (A) x2, Triol's Priest 78 (A) x2, Ritual Sacrifice 78 (A) x2, Triol's Believer 78 (A) x2, Triol's High Priest 78 (A) x1, Triol's Believer 78 (A) x1, Triol's High Priest 78 (A) x1, Triol's Believer 78 (A) x1, Triol's Priest 78 (A) x1, Triol's High Priest 78 (A) x1, Triol's Priest 78 (A) x1, Ritual Sacrifice 78 (A) x1, Triol's High Priest 78 (A) x1, Ritual Sacrifice 78 (A) x1, Triol's Priest 78 (A) x1, Triol's Priest 78 (A) x1 | 78-78 | 76-81 |  |

**Dangers.** Aggressive (datapack): Zombie Worker, Old Aristocrat's Soldier, Ritual Offering, Forgotten Victim, Penance Guard, Triol's Layperson, Ritual Sacrifice, Resurrected Temple Knight, Triol's Believer, Chapel Guard, Triol's Priest, Andreas' Royal Guards, Temple Guard, Temple Guard Captain, Triol's High Priest, Andreas' Captain of the Royal Guard.

**Notes.** All monsters level 78 (Triol's believers and guards): a 76-80 party. The chapel (south end, y < -50000) is reached on foot through the temple. Andreas Van Halter (raid boss) is spawned by a script and is not in the spawn data (knowledge).

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 76-81 | pagan-1-straight-e | Temple and chapel | 37 spawns, monsters 78-78, walk 12836 |

Sources: datapack l2j_teleport.sql, spawns_h5.json, npcs_h5.json, npcstats, geopath.js.

<a id="crypts"></a>
## Crypts of Disgrace (monsters 81-82)

**How to get in.** Teleport from Schuttgart with gatekeeper Bilia -> "Crypts of Disgrace" (~9600 adena) (text seen in the live menu), landing (47692, -115745, -3744).

**Entrance.** Landing at the crypt entrance (north side). (47692, -115745, -3744).

**Map layers** (`Maps/high`): 21_14.

### Crypts (z -4800 to -2950, monsters 81-82)

**Getting there:** walk from (47692, -115745, -3744).
Floor entry point (first point of the walk routes inside this floor (13/13 routes pass within 1500)): (47692, -115745, -3744).
Facing for left/right: north (floor entry -> centre of the floor spawns).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| crypts-1-left-a | left (west) | 1542 / 1553 | Contaminated Morek Warrior 81 x7 | 81-81 | 79-84 |  |
| crypts-1-right-a | right (east) | 3233 / 3304 | Contaminated Morek Warrior 81 x10 | 81-81 | 79-84 |  |
| crypts-1-straight-a | straight (north-east) | 5402 / 5278 | Contaminated Batur Warrior 81 (A) x2, Contaminated Batur Commander 82 (A) x2, Contaminated Morek Warrior 81 x1 | 81-82 | 80-84 |  |
| crypts-1-left-b | left (north-west) | 5748 / 5724 | Contaminated Morek Warrior 81 x12, Contaminated Batur Warrior 81 (A) x11 | 81-81 | 79-84 |  |
| crypts-1-right-b | right (east) | 6019 / 6053 | Contaminated Morek Warrior 81 x2 | 81-81 | 79-84 |  |
| crypts-1-straight-b | straight (north-east) | 6665 / 6499 | Contaminated Batur Warrior 81 (A) x6, Contaminated Morek Warrior 81 x2 | 81-81 | 79-84 |  |
| crypts-1-straight-c | straight (north) | 7256 / 7315 | Contaminated Batur Warrior 81 (A) x11, Contaminated Morek Warrior 81 x10, Contaminated Batur Commander 82 (A) x5 | 81-82 | 80-84 |  |
| crypts-1-right-c | right (east) | 7481 / 7472 | Contaminated Morek Warrior 81 x2 | 81-81 | 79-84 |  |
| crypts-1-right-d | right (north-east) | 7748 / 7706 | Contaminated Morek Warrior 81 x7 | 81-81 | 79-84 |  |
| crypts-1-straight-d | straight (north-east) | 9869 / 9649 | Contaminated Batur Warrior 81 (A) x9, Contaminated Morek Warrior 81 x6, Contaminated Batur Commander 82 (A) x4 | 81-82 | 80-84 |  |
| crypts-1-straight-e | straight (north) | 10347 / 10432 | Contaminated Batur Warrior 81 (A) x7, Contaminated Morek Warrior 81 x3, Contaminated Batur Commander 82 (A) x3 | 81-82 | 80-84 |  |
| crypts-1-straight-f | straight (north) | 11677 / 11521 | Contaminated Batur Warrior 81 (A) x10, Contaminated Morek Warrior 81 x8, Contaminated Batur Commander 82 (A) x5 | 81-82 | 80-84 |  |
| crypts-1-straight-g | straight (north-east) | 12385 / 12239 | Contaminated Batur Commander 82 (A) x6, Contaminated Morek Warrior 81 x5, Contaminated Batur Warrior 81 (A) x5 | 81-82 | 80-84 |  |

**Dangers.** Aggressive (datapack): Contaminated Batur Warrior, Contaminated Batur Commander.

**Notes.** Contaminated Morek/Batur orcs level 81-82: 80+ only.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 79 | crypts-1-left-b | Crypts | 23 spawns, monsters 81-81, walk 5724 |
| 80-84 | crypts-1-straight-c | Crypts | 26 spawns, monsters 81-82, walk 7315 |

Sources: datapack l2j_teleport.sql, gk_live/Bilia.json, spawns_h5.json, npcstats, geopath.js.

<a id="frozen"></a>
## Frozen Labyrinth (open area by the Ice Merchant Cabin) (monsters 53-63)

**How to get in.** Schuttgart: landing (113903, -108752, -856).  Datapack 'Schuttgart -> Icemans Hut' (1118, 3500) lands at the Ice Merchant Cabin. The live text is not recorded (Bilia's saved pages show no such line).

**Entrance.** Ice Merchant Cabin (Rafforty). The frost lake and labyrinth lie south. (113903, -108752, -856).

**Map layers** (`Maps/high`): 23_14, 23_14_1, 23_15, 23_15_1, 23_15_2, 23_15_3.

### Frost lake + labyrinth (z -4300 to -1000, monsters 53-63)

**Getting there:** walk from (113903, -108752, -856).
Floor entry point (first point of the walk routes inside this floor (18/38 routes pass within 1500)): (115208, -111592, -928).
Facing for left/right: north-east (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| frozen-1-straight-a | straight (north-east) | 1368 / 4430 | Lost Gargoyle 55 x2 | 55-55 | 53-58 |  |
| frozen-1-straight-b | straight (north) | 3646 / 6674 | Lost Gargoyle 55 x2 | 55-55 | 53-58 |  |
| frozen-1-behind-a | behind (south-west) | 5013 | Lost Gargoyle 55 x1 | 55-55 | 53-58 |  |
| frozen-1-behind-b | behind (south-west) | 5777 | Lost Watcher 53 x1 | 53-53 | 51-56 |  |
| frozen-1-straight-c | straight (north-east) | 5782 / 8895 | Lost Gargoyle 55 x1 | 55-55 | 53-58 |  |
| frozen-1-left-a | left (west) | 6948 | Elder Lost Watcher 54 x3, Massive Lost Bandersnatch 54 x1, Lost Watcher 53 x1 | 53-54 | 52-56 |  |
| frozen-1-right-a | right (south-east) | 7728 | Lost Gargoyle 55 x4, Lost Gargoyle Youngling 56 (A) x3, Massive Lost Bandersnatch 54 x2 | 54-56 | 54-57 |  |
| frozen-1-left-b | left (north) | 9206 / 12173 | Lost Watcher 53 x2, Elder Lost Watcher 54 x1, Panthera 56 (A) x1 | 53-56 | 54-56 |  |
| frozen-1-left-c | left (west) | 9383 | Massive Lost Bandersnatch 54 x1, Elder Lost Watcher 54 x1 | 54-54 | 52-57 |  |
| frozen-1-right-b | right (south-east) | 9842 | Lost Watcher 53 x6, Elder Lost Watcher 54 x4, Lost Gargoyle 55 x2, Lost Gargoyle Youngling 56 (A) x2 | 53-56 | 54-56 |  |
| frozen-1-left-d | left (north) | 10466 / 13500 | Lost Watcher 53 x3, Panthera 56 (A) x3, Elder Lost Watcher 54 x2, Baby Panthera 55 x1 | 53-56 | 54-56 |  |
| frozen-1-left-e | left (north-west) | 10480 | Lost Watcher 53 x6, Massive Lost Bandersnatch 54 x5, Elder Lost Watcher 54 x3 | 53-54 | 52-56 |  |
| frozen-1-straight-d | straight (north-east) | 11015 / 14268 | Ice Tarantula 57 x1, Frost Tarantula 58 x1 | 57-58 | 56-60 |  |
| frozen-1-behind-c | behind (south-west) | 11055 | Lost Watcher 53 x3, Lost Gargoyle 55 x3, Elder Lost Watcher 54 x2, Lost Gargoyle Youngling 56 (A) x2, Panthera 56 (A) x1 | 53-56 | 54-56 |  |
| frozen-1-straight-e | straight (north) | 11468 / 14143 | Lost Gargoyle 55 x9, Panthera 56 (A) x5, Lost Gargoyle Youngling 56 (A) x1 | 55-56 | 54-58 |  |
| frozen-1-left-f | left (west) | 12156 | Elder Lost Watcher 54 x4, Lost Watcher 53 x3, Massive Lost Bandersnatch 54 x2 | 53-54 | 52-56 |  |
| frozen-1-behind-d | behind (south) | 12486 | Elder Lost Watcher 54 x7, Lost Watcher 53 x6, Massive Lost Bandersnatch 54 x4, Panthera 56 (A) x2 | 53-56 | 54-56 |  |
| frozen-1-left-g | left (south-west) | 12521 | Panthera 56 (A) x3, Lost Gargoyle Youngling 56 (A) x3, Lost Watcher 53 x2, Lost Gargoyle 55 x2, Elder Lost Watcher 54 x1 | 53-56 | 54-56 |  |
| frozen-1-left-h | left (north-west) | 13148 | Massive Lost Bandersnatch 54 x2 | 54-54 | 52-57 |  |
| frozen-1-right-c | right (south-east) | 13163 | Panthera 56 (A) x4, Lost Gargoyle Youngling 56 (A) x3, Lost Gargoyle 55 x2 | 55-56 | 54-58 |  |
| frozen-1-straight-f | straight (north-east) | 13611 / 16431 | Lost Yeti 62 x1 | 62-62 | 60-65 |  |
| frozen-1-left-i | left (west) | 13890 | Elder Lost Watcher 54 x2, Lost Watcher 53 x1 | 53-54 | 52-56 |  |
| frozen-1-right-d | right (north-east) | 14162 / 17432 | Frost Tarantula 58 x4, Frost Iron Golem 59 (A) x2 | 58-59 | 57-61 |  |
| frozen-1-straight-g | straight (north-east) | 14319 / 17321 | Lost Yeti 62 x1 | 62-62 | 60-65 |  |
| frozen-1-behind-e | behind (south) | 15103 | Lost Watcher 53 x3, Elder Lost Watcher 54 x3, Massive Lost Bandersnatch 54 x2, Panthera 56 (A) x2 | 53-56 | 54-56 |  |
| frozen-1-straight-h | straight (north) | 16139 / 19234 | Lost Yeti 62 x1 | 62-62 | 60-65 |  |
| frozen-1-right-e | right (east) | 16867 | Panthera 56 (A) x4, Pronghorn 57 x4 | 56-57 | 55-59 |  |
| frozen-1-right-f | right (east) | 17272 / 20633 | Ice Tarantula 57 x4, Frost Tarantula 58 x4, Frost Iron Golem 59 (A) x4 | 57-59 | 57-60 |  |
| frozen-1-right-g | right (east) | 17651 | Frost Tarantula 58 x5, Pronghorn 57 x2, Ice Tarantula 57 x1 | 57-58 | 56-60 |  |
| frozen-1-straight-i | straight (north-east) | 18119 / 21521 | Frost Yeti 63 x7, Frost Iron Golem 59 (A) x1, Frost Buffalo 61 (A) x1, Lost Yeti 62 x1 | 59-63 | 61-62 |  |
| frozen-1-straight-j | straight (north) | 18588 / 21633 | Frost Iron Golem 59 (A) x1, Ursus 62 x1 | 59-62 | 60-62 |  |
| frozen-1-right-h | right (north-east) | 18721 / 22065 | Frost Yeti 63 x10, Lost Yeti 62 x8, Frost Iron Golem 59 (A) x4, Frost Buffalo 61 (A) x3 | 59-63 | 61-62 |  |
| frozen-1-right-i | right (east) | 19783 | Ice Tarantula 57 x3, Pronghorn 57 x2, Frost Tarantula 58 x2 | 57-58 | 56-60 |  |
| frozen-1-right-j | right (east) | 21114 | Frost Iron Golem 59 (A) x3, Ice Tarantula 57 x2, Frost Tarantula 58 x2 | 57-59 | 57-60 |  |
| frozen-1-straight-k | straight (north-east) | 21514 / 24809 | Ursus 62 x5, Frost Yeti 63 x2 | 62-63 | 61-65 |  |
| frozen-1-right-k | right (east) | 21948 | Lost Gargoyle 55 x4, Lost Gargoyle Youngling 56 (A) x3, Pronghorn 57 x3 | 55-57 | 55-58 |  |
| frozen-1-straight-l | straight (north-east) | 22386 / 25916 | Frost Yeti 63 x6, Frost Buffalo 61 (A) x4, Ursus 62 x3 | 61-63 | 61-64 |  |
| frozen-1-straight-m | straight (north-east) | 22417 / 25256 | Frost Yeti 63 x4, Ursus 62 x3, Lost Yeti 62 x3, Lost Bandersnatch 53 x1 | 53-63 | 60-65 | mixed levels: suggestion built on the median monster level 62 |

**Dangers.** Aggressive (datapack): Lost Gargoyle Youngling, Panthera, Frost Iron Golem, Frost Buffalo.

**Notes.** Open-air ice field (Lost Watchers 53-54, Pantheras, Tarantulas, Frost Yetis 63). The Ice Queen's Castle (Freya) is an instance and is skipped.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 51 | frozen-1-behind-b | Frost lake + labyrinth | 1 spawns, monsters 53-53, walk 5777 |
| 52-53 | frozen-1-left-e | Frost lake + labyrinth | 14 spawns, monsters 53-54, walk 10480 |
| 54-56 | frozen-1-behind-d | Frost lake + labyrinth | 19 spawns, monsters 53-56, walk 12486 |
| 57-58 | frozen-1-straight-e | Frost lake + labyrinth | 15 spawns, monsters 55-56, walk 14143 |
| 59-60 | frozen-1-right-f | Frost lake + labyrinth | 12 spawns, monsters 57-59, walk 20633 |
| 61-62 | frozen-1-right-h | Frost lake + labyrinth | 25 spawns, monsters 59-63, walk 22065 |
| 63-64 | frozen-1-straight-l | Frost lake + labyrinth | 13 spawns, monsters 61-63, walk 25916 |
| 65 | frozen-1-straight-m | Frost lake + labyrinth | 11 spawns, monsters 53-63, walk 25256 |

Sources: datapack l2j_teleport.sql, spawns_h5.json, npcstats, geopath.js.

<a id="imperialtomb"></a>
## Imperial Tomb (outer halls) (monsters 74-78)

**How to get in.** Goddard: landing (186699, -75915, -2826).  Only a retail noble link 'Imperial Tomb' (9068) is in the datapack. Normal access is on foot (not verified).

**Entrance.** Tomb entrance area (Imperial Tomb Guide nearby). (186699, -75915, -2826).

**Map layers** (`Maps/high`): 25_15, 25_15_1, 25_15_2, 25_16.

### Outer tomb (z -3300 to -2500, monsters 74-78)

**Getting there:** walk from (186699, -75915, -2826).
Floor entry point (first point of the walk routes inside this floor (5/8 routes pass within 1500)): (184504, -78312, -2728).
Facing for left/right: north (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| imperialtomb-1-left-a | left (west) | 2937 / 7522 | Ghost of a Doorman 76 x4, Vassal Ghost 77 x4, Ghost of a Doorman 76 x3 | 76-77 | 75-79 |  |
| imperialtomb-1-left-b | left (south-west) | 5931 / 10502 | Ghost of a Doorman 76 x1 | 76-76 | 74-79 |  |
| imperialtomb-1-behind-a | behind (south-east) | 8285 | Grave Ant 74 x2, Scavenger Ant 74 (A) x1, Shrine Guard 75 x1 | 74-75 | 73-77 |  |
| imperialtomb-1-left-c | left (south-west) | 8414 / 12981 | Katraxis 78 (A) x5, Carrion Scarab 78 x3, Soldier Scarab 78 (A) x2, Soldier Scarab 78 (A) x2, Tera Beetle 78 x2, Katraxis 78 (A) x1, Ghost of a Doorman 76 x1, Ghost of a Doorman 76 x1 | 76-78 | 76-79 |  |
| imperialtomb-1-left-d | left (west) | 11451 / 16015 | Katraxis 78 (A) x5, Carrion Scarab 78 x3, Soldier Scarab 78 (A) x2, Soldier Scarab 78 (A) x2, Tera Beetle 78 x2, Katraxis 78 (A) x1 | 78-78 | 76-81 |  |
| imperialtomb-1-right-a | right (south-east) | 12086 | Grave Ant 74 x2, Shrine Knight 75 x2, Shrine Guard 75 x2, Scavenger Ant 74 (A) x1 | 74-75 | 73-77 |  |
| imperialtomb-1-left-e | left (west) | 13740 / 18181 | Katraxis 78 (A) x5, Carrion Scarab 78 x3, Soldier Scarab 78 (A) x2, Soldier Scarab 78 (A) x2, Tera Beetle 78 x2, Katraxis 78 (A) x1 | 78-78 | 76-81 |  |
| imperialtomb-1-behind-b | behind (south-east) | 14967 | Shrine Knight 75 x2 | 75-75 | 73-78 |  |
| imperialtomb-1-behind-c | behind (south) | 29936 | Grave Ant 74 x1 | 74-74 | 72-77 | 2026-10-08 refine: walk route added |

### Scarab halls (z -4300 to -3300, monsters 78-78)

**Getting there:** walk from (186699, -75915, -2826).
Floor entry point (first point of the walk routes inside this floor (3/3 routes pass within 1500)): (178008, -77768, -3376).
Facing for left/right: north (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| imperialtomb-2-atentry-a | at entry (north) | 342 / 15562 | Katraxis 78 (A) x5, Carrion Scarab 78 x3, Soldier Scarab 78 (A) x2, Soldier Scarab 78 (A) x2, Tera Beetle 78 x2, Katraxis 78 (A) x1 | 78-78 | 76-81 |  |
| imperialtomb-2-straight-a | straight (north) | 3431 / 18575 | Guardian Scarab 78 x10, Royal Guard of Empire 78 x5, Guardian Scarab 78 x5, Hexa Beetle 78 (A) x4 | 78-78 | 76-81 |  |
| imperialtomb-2-left-a | left (north-west) | 5614 / 20858 | Guardian Scarab 78 x10, Royal Guard of Empire 78 x6, Guardian Scarab 78 x5, Hexa Beetle 78 (A) x4 | 78-78 | 76-81 |  |

### Lower halls (z -5300 to -4300, monsters 78-78)

**Getting there:** walk from (186699, -75915, -2826).
Floor entry point (first point of the walk routes inside this floor (1/1 routes pass within 1500)): (179624, -81080, -4432).
Facing for left/right: east (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| imperialtomb-3-straight-a | straight (east) | 1261 / 21107 | Guardian Scarab 78 x10, Royal Guard of Empire 78 x8, Guardian Scarab 78 x5, Hexa Beetle 78 (A) x4 | 78-78 | 76-81 |  |

**Dangers.** Aggressive (datapack): Scavenger Ant, Katraxis, Soldier Scarab, Hexa Beetle. No geodata route found to: imperialtomb-1-behind-c.

**Notes.** Level 74-78. The Four Sepulchers below (z -7600..-5400) are a timed event zone with entry passes and are skipped.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 73-74 | imperialtomb-1-right-a | Outer tomb | 7 spawns, monsters 74-75, walk 12086 |
| 75 | imperialtomb-1-left-a | Outer tomb | 11 spawns, monsters 76-77, walk 7522 |
| 76-81 | imperialtomb-3-straight-a | Lower halls | 27 spawns, monsters 78-78, walk 21107 |

Sources: datapack l2j_teleport.sql, spawns_h5.json, npcstats, geopath.js.

<a id="dvcave"></a>
## Dragon Valley cave (Death Pass) (monsters 45-60)

**How to get in.** Teleport from Hunters Village with gatekeeper Esmeralda -> "Dragon Valley" (~1800 adena) (text seen in the live menu), landing (73024, 118485, -3696).

**Entrance.** Dragon Valley landing; the cave is ~13000 north-east. (73024, 118485, -3696).

**Map layers** (`Maps/high`): 22_21.

### Cave (z -3700 to -2500, monsters 45-60)

**Getting there:** walk from (73024, 118485, -3696).
Floor entry point (first point of the walk routes inside this floor (7/7 routes pass within 1500)): (74072, 101640, -2768).
Facing for left/right: east (walking direction when you step onto this floor).

| Room | Side (compass) | Walk from floor entry / total | Monsters | Levels | Party level | Notes |
|---|---|---|---|---|---|---|
| dvcave-1-straight-a | straight (south-east) | 822 / 20822 | Maluk Succubus 55 x1 | 55-55 | 53-58 |  |
| dvcave-1-straight-b | straight (east) | 1895 / 21858 | Maluk Succubus Turen 56 x1 | 56-56 | 54-59 |  |
| dvcave-1-straight-c | straight (east) | 4814 / 24589 | Maluk Succubus 55 x1 | 55-55 | 53-58 |  |
| dvcave-1-right-a | right (south-east) | 21454 | Maluk Succubus Turen 56 x1 | 56-56 | 54-59 |  |
| dvcave-1-straight-d | straight (south-east) | 25030 | Cave Maiden 59 (A) x3, Cave Servant Archer 47 x1, Cave Servant Warrior 48 x1, Maluk Succubus 55 x1, Maluk Succubus Turen 56 x1, Cave Keeper 58 x1 | 47-59 | 56-61 | mixed levels: suggestion built on the median monster level 58 |
| dvcave-1-right-b | right (south) | 25751 | Cave Maiden 59 (A) x5, Cave Keeper 58 x4, Headless Knight 50 (A) x2, Shackle 45 (A) x2, Cave Servant 46 x2, Cave Servant Captain 49 (A) x2, Royal Cave Servant 51 x2, Hunter Gargoyle 52 x2, Cave Servant Archer 47 x1, Cave Servant Warrior 48 x1 | 45-59 | 49-54 | mixed levels: suggestion built on the median monster level 51 |
| dvcave-1-straight-e | straight (south-east) | 27392 | Cave Keeper 58 x5, Blood Queen 60 (A) x3, Cave Maiden 59 (A) x2, Dustwind Gargoyle 53 x1, Bloody Lady 60 (A) x1 | 53-60 | 57-62 | mixed levels: suggestion built on the median monster level 59 |

**Dangers.** Aggressive (datapack): Cave Maiden, Headless Knight, Shackle, Cave Servant Captain, Blood Queen, Bloody Lady.

**Notes.** Small cave (Cave Servants 45-51, Cave Keeper/Maiden 58-59, Blood Queen 60, Gargoyles 52-53): mixed levels.

**Best room for a party of level N** (lowest member):

| N | Room | Floor | Why |
|---|---|---|---|
| 49-54 | dvcave-1-right-b | Cave | 23 spawns, monsters 45-59, walk 25751 |
| 55 | dvcave-1-straight-a | Cave | 1 spawns, monsters 55-55, walk 20822 |
| 56 | dvcave-1-straight-d | Cave | 8 spawns, monsters 47-59, walk 25030 |
| 57-62 | dvcave-1-straight-e | Cave | 12 spawns, monsters 53-60, walk 27392 |

Sources: datapack l2j_teleport.sql, gk_live/Esmeralda.json, spawns_h5.json, npcstats, geopath.js.

## Path finder (geopath.js) and stacked floors

- geopath.js reads every layer of the L2J geodata and follows the layer you stand on (`layerAt` + the neighbour layer within 48 height), so stacked floors are kept apart: Cruma floors 1/2/3 at the same x,y route correctly and end on the right floor.
- **Two bugs found (NOT fixed in the project file; fixed only in the copy used to build this data):**
  1. `KEY = (gx * 32768 + gy) * 8 + li` assumes at most 8 layers per cell. The Tower of Insolence has up to 18 layers per cell, so keys collide and routes jump floors (a 1st-floor route ended on the 5th floor). Fix: `* 64` in KEY and `% 64` / `/ 64` in `unkey`.
  2. The search stops when it reaches the goal x,y on ANY layer (`gx === g.gx && gy === g.gy`), so with stacked floors it can finish on the wrong floor. Fix: also require `li === g.li`.
- Long dungeon walks need a bigger search box than the default (`pad` 6000): the Forge, the inside of the Monastery and the Coal Mines terraces only connect through detours of 40-80k units. This data used pad 12000, maxNodes 6e6, maxMs 40000.
- Mithril Mines: both gatekeeper landings are closed chambers in the geodata (no walkable link into the tunnels); the inner Teleport Crystals connect to every room.
- Hall of Flames: no walkable link from the Forge (Klein's teleport needed).

## Not covered

- Instance-only zones (Kamaloka, Pailaka, Nornil, Seeds, Ice Queen's Castle, Crystal Caverns) and the Seven Signs catacombs/necropolises (see `catacombs.json`).
- Silent Valley: an open valley (z about -6000, Chimera Piece / Ancient monsters 73-78), not a dungeon.
- The Four Sepulchers under the Imperial Tomb (timed event with passes).
- Live checks still needed: Aden, Goddard, Rune and Hunters gatekeeper texts/prices; Cruma inner teleporter link texts; the Mithril Mines Teleport Crystals; Klein / Hall of Flames; the Pagan Temple entry item.
