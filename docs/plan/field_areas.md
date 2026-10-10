# Field areas (outdoor hunting grounds split into areas) + several rooms / areas per choice

User 2026-10-08 22:45: "Just like you created zones you can select from dungeons, you should create the same for hunting zones outside, and they can be
bigger. Make sure you look at the map and take into account the geodata and objects, walls etc. It should work exactly the same as the dungeon
selector for rooms but with hunting grounds. It should be possible to extend the area with more areas, so they can use multiple rooms in a dungeon OR
on a field select multiple areas to hunt in, and the bots will move between the areas or rooms whenever there are no more monsters etc."

## Data: `Scripts/data/field_areas.json`

Made by `node docs/plan/tools/field_areas.js` (full run ~60-90 min on this laptop, `--only <region ids>` merges single regions into the file,
`--dry` writes nothing, `--no-images` skips the check images, `--stats` lists the regions only). Read live: swarm.js leaders re-read it when the
file changes (checked every 10 min), the dashboard server re-reads it when its modification time changes (no restart needed for new data).
Check images: `docs/plan/field_areas/index.html` (one JPEG per region: the map from `Maps/high`, walkable geodata faint cyan, each area in its
colour with its monster spawns as dots (grey = in no area), labels "n levels (quality) far", landings ◆, safe spots as green shields; the table lists
every area with its numbers). Renderer: `docs/plan/tools/render_field_checks.ps1` (= render_room_checks.ps1 with JPEG output).

```
{ generated, version: 1, params, stats, summary,
  regions: [ { id: 'abandoned-camp', name: 'Abandoned Camp', kind: 'field'|'far', nameOrig (the old "(far)" name), reach { areas, reachable, via [landing descs] },
      landings: [{ kind gk|town, from, desc, to, x, y, z, live, liveState, used (areas entered from it; false = only the region seed) }],
      center, bbox, levelRange,
      areas: [ { id: 'abandoned-camp-3', n: 3, name: 'Abandoned Camp 3: Ol Mahum Recruit area (north)', side, center [x,y,z], radius,
                 poly [[x,y],...] (<= 40 corners), zRange [zMin,zMax], area (units²),
                 levelRange [p10,p90], levelAll [min,max], suitsPartyLevel [a,b] (as rooms: [max-2, min+3], else median-2..+3), dangerMax,
                 spawnCount, aggressiveShare, respawnSec (median, l2j_spawnlist.sql), monsters [{ id, name, level, count, aggressive, aggro }],
                 raidBosses [{ name, level, x, y, z, dist }] (within 3000 of the outline),
                 entry { kind gk|town, from, desc, to, town, live, liveState yes|no|unknown, tier, landing [x,y,z], walk, straight, route [[x,y,z],...], far } | null,
                 reachable (a landing within 24500 ON FOOT, 2026-10-09), unreachable '<why>' (only when not reachable), entryNote,
                 neighbours [{ id, walk, touching, route }], safeSpot { id, walk },
                 polyInfo { method geodata|spawn-hull, corners, split, ownSpawns, ownInside %, ownNear %, foreign, overlap %, quality } } ],
      safeSpots: [ { id, name, x, y, z, tier safe|tight, monsterClear, nearAreas [{ id, walk }] } ],
      stats: { spawns, unsnapped, cells, ms } } ],
  zones: { "<x>,<y> of a custom zone": { zones: [names], center, region, areaIds } } }
```

## Method (field_areas.js)

1. **Outdoor monster spawns:** `spawns_h5.json` entries whose npc (`npcs_h5.json`) is an `L2Monster` (no Treasure Chests), minus: inside a dungeon of
   `dungeon_rooms.json` (bbox + a floor's z band ± 300: those are rooms already), on an underground map layer (`map_regions.json` `X_Y_n.jpg` z bands),
   under a roof (a geodata layer more than 600 above the spawn's layer).
2. **Regions:** every gatekeeper landing of `teleports_h5.json` reached from a town / village gatekeeper ("Gludin -> Abandoned Camp"; castle, fortress,
   noble and harbour gatekeepers, siege fronts, instances and dungeon entrances are left out). Town landings make "<Town> outskirts" (entry kind
   `town` = `.townname` + a walk, never picked automatically in lead mode: "never walk out of a town"), racial villages "<Village> outskirts"
   (their gatekeeper link). Landings with the same name within 6000 are one seed. Every spawn goes to the nearest landing (<= 22000, |dz| < 3500);
   spawns farther from every landing are grouped (single link 4000) and named after the nearest named datapack spot + " (far)".
   `live` = the link text is on a live gatekeeper menu (`gk_live`).
3. **Walkable ground per region:** `room_polys.js buildFloor` over the region box (spawns + 2500, plus every landing within 4000), z band of the
   spawns ± 1500: flood fill from every spawn and landing over the L2J geodata (16-unit cells, NSWE walls, height steps <= 48 — the same rule as
   `geopath.js`). Connected pieces of ground are labelled: two plateaus with no walkable way between them never share an area.
4. **Clusters:** leader clustering of the region's spawns (radius 2300; a monster level counts as 150 units, so a level-20 and a level-30 group split),
   per piece of ground, 8 Lloyd rounds; a cluster whose monsters spread wider than 3600 (90th percentile) is split in two; clusters under 8
   spawns are merged into a neighbour of the same piece (<= 3800), else dropped under 4.
5. **Cells of an area:** one multi-source Dijkstra (walking distance on the geodata) from every cluster's spawns at once: a cell belongs to the
   cluster whose monsters are nearest on foot, up to 1100 from them, or up to 2600 inside the cluster's spawn hull (+300). An area whose cells fall
   apart (a wall / cliff / water edge in the middle) keeps its main piece; another piece with >= 6 spawns becomes its own area, smaller ones are dropped.
6. **Outline:** `room_polys.js outline` (holes filled) + `simplifyLoop` (<= 40 corners, never self-intersecting). Fallback: spawn hull.
7. **Check (polyInfo):** own spawns inside / within 150 of the outline (good >= 90 %), foreign spawns inside, overlap with other areas (sampled every
   64 units), size (small < 1.2 km²).
8. **Entry (REACHABLE ENTRY, 2026-10-09):** `regionEntries`: every destination a town / village gatekeeper offers (`entryLandings`, 110 landings:
   field landings incl. dungeon / tower entrances such as "Oren -> Ivory Tower"; no town squares, arenas, harbours, instances) within 27k (straight)
   of an area, one walkable grid over the region + those landings, one multi-source Dijkstra per **tier**: 0 = field landing on a live gatekeeper menu
   (`gk_live`), 1 = field landing of a town whose menu was never recorded, 2 = village / town (.townname) landing, 3 = datapack link not seen on the
   live menu (swarm.js `spotReachable` judges it at run time). An area takes the FIRST tier with a landing within **24500 on foot** (= travel.maxWalk
   25000 - 500; swarm.js `walkTo` refuses every walk > 25000), else it is NOT reachable: `unreachable` says why and the nearest landing on foot (up
   to 32000) stays as a `far` entry for the dashboard. Was: nearest landing on foot within 30000 (= maxUsefulLanding) -> Dagger1 2026-10-09 16:11
   teleported to Sea of Spores three times in 45 s for Ivory Tower areas 6/5/4 (27.5-29.5k walks) and banned the region.
   `node field_areas.js --entries [--only ids] [--dry]` recomputes only the entries + region names / landings of the existing file (area ids,
   outlines, neighbours unchanged; ~25 min for all 117 regions; report `Logs/field_areas_entries_<date>.json`). The full run uses the same code.
   `fixRegion`: a "(far)" region is renamed to the place name when some area is reachable, else "<place> (unreachable)" (`nameOrig` keeps the old
   name; area names follow; ids never change); `landings` = the landings its areas really use first.
9. **Neighbours:** a bounded Dijkstra (9000) from every area centre: areas that touch it or lie within 6500 on foot, with walk + route (max 6).
10. **Safe spots:** walkable cells (every 4th) outside every area (+150), >= 48 from a wall, >= max(1200, aggro + 300) from aggressive and >= 900 from
    passive monsters ('tight' 900 / aggro + 150 / 600). Every area gets the nearest by walking ('safe' within 4000, else a 'tight' one when it is
    less than half as far); spots within 700 merged. Used by the escape (`escFloor`) of a leader / solo character hunting that area.
11. **Zones map:** every plain outdoor custom zone (no rooms / dungeon / drawn polygon / zmap / waypoints / pull routes) -> the areas whose centre
    lies in its hunting square (radius x 3 / 2 + 500, |dz| <= 1200). swarm.js computes the same on the fly for a zone drawn after the last run.

**Water / objects:** the L2J geodata has no water flag (the sea floor is walkable ground), so an area can reach into shallow water; areas only
grow around monsters, so they stay on the shore. Walls, rocks, buildings, fences and cliffs are NSWE / height steps in the geodata and stop the
flood (see the Windy Hill check image: the ridge east of the landing separates area 9).

## Results (full run 2026-10-08)

- 34,876 monster spawns: 8,588 in dungeons (rooms already), 1,560 on underground map layers, 1,481 under a roof → **23,247 outdoor** (2,607 of them
  farther than 22k from every landing → 31 "(far)" regions).
- **117 regions, 1,697 areas** (≈ 14.5 per region), 1,509 safe spots. Full run 1,768 s (~30 min CPU; ~70 min wall clock while the bots ran), file 4.5 MB
  (compact; neighbour routes ≈ 0.6 MB, entry routes ≈ 0.4 MB).
- Quality: **1,691 good**, 3 small (Red Rock Ridge 25-27, < 1.2 km²), 3 check (plains-of-dion-12 own 80 %, ketra-orc-outpost-24 86 %,
  varka-silenos-stronghold-10 60 %). Overlap > 10 %: 0. Centre inside its outline: 1,697/1,697. No self-intersecting outline; 2 outlines have
  more than 40 corners (simplifyLoop could not get below 40 without crossing itself; <= 80).
- Size: equivalent radius p10 / median / p90 = 1,389 / 1,811 / 2,812 (rooms: ~500-1,200).
- **1,547 reachable** on foot from a landing within 30k (the others are behind cliffs / water or in "far" regions: drawn dashed, never picked automatically).
- "Never across a cliff": 20 sampled areas (Abandoned Camp, Windy Hill, Fields of Massacre, Forest of Mirrors): every own spawn inside the outline is
  reached from the centre WITHOUT leaving the outline (test). Windy Hill area 9 lies behind the ridge east of the landing and is not reachable from it.
- Zones: all four "Abandoned Camp (… route 20-40)" zones → 4 areas, the Fields of Massacre route zones → 2 areas (+ the areas outside the square are
  reachable through the auto pick / the dashboard); zones with a drawn polygon / zmap (Trio Abandoned Camp) keep their drawing.
- **Manual edits:** the dashboard shape editor (Dashboard/polyedit*.js) may edit areas (manual: true): field_areas.js never regenerates such an area
  (the stored one replaces the computed one with that id) and writes through `docs/plan/tools/manual_guard.js writeGuarded(FILE, out, 'area')`
  (lock, re-read, user fields kept, atomic). swarm.js skips `enabled: false` areas / rooms / datapack spots and re-reads dungeon_rooms.json /
  hunting_spots_h5.json / field_areas.json when their write time changes (checked at most every 60 s).

## swarm.js (Scripts_dev, NOT deployed)

- **Field area spot** (`areaSpotOf`, MULTISPOT-PURE block): like a room spot — `poly` (combat zone `SetCombatPolygon`), `zr`, `noScale` (no x3
  square), `area {region, id, n, ...}`, key `area:<id>` (claims, skip list, occupied), `gk` = its landing's "Town -> Field" link (`travel` town for
  outskirts), region safe spots. The leader only takes monsters inside the polygon (+100) and those hitting us; the members get the polygon via
  `swarm.room` and walk back inside (the room code).
- **Automatic pick:** (a) a plain outdoor custom zone (all the parties' route zones) is hunted as its field areas: the fitting ones (best level fit +1)
  form the rotation pool (`zoneAreaSpot`, keeps the zone's level range) — this REPLACES the sub-areas; `zone_subareas.json` is only the fallback
  for a zone with no field areas at all. (b) new step 3a before the datapack squares: `fieldAreaAutoSpot` = `faAutoPick` (fits the level, dangerMax
  <= team max + 6, reachable, a live gatekeeper link, lead mode: no town walks, not skipped / occupied / claimed, party pool >= 20 spawns; score:
  pool spawns, own spawns, level fit, landing walk, distance; solo: passive monsters preferred) + its fitting neighbours (<= 6500 walk, max 4) as the
  pool; sticky (the 5-min re-pick does not hop away while the current area fits).
- **Reachable entry (2026-10-09, MULTISPOT-PURE `faEntryWhy` / `faLandingKey` / `spotLandingWhy`):** an area whose entry walk or straight line
  landing -> centre is longer than travel.maxWalk - 500, or that the data marks `unreachable`, is never offered (faAutoPick, zoneAreaSpot, multiTargets
  -> `unreachable` = blocked in multiPick / multiDecide, also for a dashboard choice). A failed trip to a field area bans its **landing + region pair**
  (`landing:<region>|<entry desc>`) with the area, so the siblings from the same landing are not tried one teleport after another. `travelToSpot`
  checks the walk from the PLANNED landing (field area: its landing + geodata walk; any other gatekeeper spot: the teleports_h5 landing) before the
  Giran regroup and the gatekeeper click: too far = `REFUSED: ...` (12 h skip), no teleport.
- **Learned blocked spots + day skips (2026-10-09, GEOLEARN-PURE):** `Scripts/data/geo_blocked.json` = spots where the server blocks every move
  although the geodata is open (seeded: Abandoned Camp area 3 north pocket, Tank3 2x); active points are walls for geopath.js (restart the
  geopath service = the dashboard server), for field_areas.js entry routes, and huntTarget skips monsters inside; geoWalk records each give-up
  (2 episodes / 2 characters = active). `Scripts/data/spot_learned.json`: the 2nd could-not-reach of a spot in one day (any party) = skipped by
  every party until 06:30. `node field_areas.js --names` re-applies the region names only.
- **Manual choice (dashboard):** `party_spots.json` `{ mode:'manual', kind:'field', region, spot, areaIds:[...], order:'nearest'|'rotate', stay, override }`
  or `{ kind:'rooms', dungeon, roomId (= the first), roomIds:[...], order }`; a single `roomId` without `roomIds` is the old one-room choice
  (unchanged); `'any'` unchanged. `multiSel` normalises it, `partySpotSig` adds the lists (old entries keep their old signature). The level gate looks
  at the highest monsters of ALL chosen ones; Seven Signs gate unchanged (rooms of a catacomb).
- **Rotation** (`multiTick` every 5 s at the current target, `multiDecide`): stay while fighting or monsters are inside; after 35 s without a live
  monster in the polygon: the next target (rotate = the next in the chosen order, nearest = the nearest by travel time; other floor +60 s) that is
  expected to hold >= 3 monsters on arrival (never visited = all its spawns; visited = alive when we left + kills whose respawn time passed); every
  one empty = stay where the most respawns come next (kills due here within 60 s vs the others on arrival). The current one occupied by other players
  (occupied rule) or claimed by another of our parties (rival claim) -> the next free one; every chosen one taken -> the automatic spot meanwhile.
  A move = `multiSt.forceNext` + the normal pick / claim / travel: same region = walk (no Giran regroup), a room on another floor of the dungeon we
  are in = `multiRoomMove` (the rescue planner's floor graph: walk + floor teleporters up and down, members click the same teleporter), else the
  normal trip. Party chat: "[lead] area 2/4 (...) has had no monster for 36 s — moving on to area 3/4: ...". Kills per target feed the respawn estimate.
- **Dashboard state:** `swarm_state.zone` gets `area`, `region`, `multi` { kind, place, order, auto, current, moves, decision, list [{ id, n, name,
  current, live, expect, kills, visited, blocked }] }; `manualSpot` gets `region`, `area`, `multi`.

## Dashboard

- Not reachable areas (2026-10-09): dark grey, dashed, label "not reachable"; a tap shows the reason (`/api/fieldmap` `unreachable`) and never adds
  the area to the choice; the list says "(N not reachable)".
- Picker list: "Hunting grounds (outdoor) — pick areas on the map" (every region in the level window, number of areas, far ones, landing, our
  parties there). Tap = full-screen **region map** (`/api/fieldmap?id=`): world map tiles, every area outline coloured by fit for the party level
  (green fits, gold ±3, grey too low, red too high / above the safe limit), red = other players, party colour = one of our parties, dashed = far
  from any landing, green shields = safe spots, ◆ = landings, the tapped area's way in (dashed blue), all our characters. Tap areas to choose them
  (numbered in order, tap again = remove), "Select all fitting", "Clear", "Next: nearest first / in my order", "Hunt in N areas" (the existing
  Seven Signs / level-override dialogs, then POST).
- Dungeon room map: the same multi-select (also across floors: chips show "F1 ..." for rooms on other floors), "Hunt in N rooms"; "Hunt only in this
  room" and "Any free room" stay.
- Parties tab: the rotation chip ("rotating 3 areas (nearest first): now 1 · 0 here · no monster for 20 s"), the party map draws the current area
  ("area: ...", legend "hunting area") and the other chosen ones numbered with the expected monsters (✕ = taken).
- server.js (**needs a dashboard restart**): `/api/fieldmap`, `/api/partyspot` GET `options.regions` + claims with `area`, POST `kind:'field'`
  (`region`, `areaIds`, `order`) and `roomIds` / `order` for rooms (validated).

## Tests

- `node docs/plan/tools/test_field_areas.js` (`--quick` skips re-building two regions): data quality, "never across a cliff" flood check, the tool on
  real regions, MULTISPOT-PURE, a simulated leader rotating through 3 areas, the REAL pickSpot / zoneSpot / multiSpotFor host code in a sandbox
  with the live data, source checks of the call sites.
- `node docs/plan/tools/test_fieldareas_ui.js`: headless Edge (iPhone 390x844 + desktop) against the sandbox server, every POST intercepted;
  screenshots `docs/plan/mobile_check/fieldareas_*.png`.
