# Raid route editor — how to write a route (user guide, 2026-10-06)

Dashboard -> **Raid bosses** -> tap a boss -> scroll to **Route to this boss**.

## 1. Choose the start
- **gatekeeper teleport**: type the teleport like `Heine -> Entrance to Alligator Islands` (as the gatekeeper menu says it).
- **.townname (walk from the town)**: pick the town (Gludin, Gludio, Dion, Giran, Oren, Aden, Hunters, Heine, Goddard, Rune, Schuttgart).
  The bots use `.heine` (etc.) and land at the town's fixed landing spot (green square on the map). Press **Town landing = point 1**
  to start the route there. The route may lead through the town first (e.g. to Heine's gate) — it is the road you choose, the
  "never walk out of Heine" rule does not apply to your routes.

## 2. Add the points
- **Tap the map**: a new point after the selected (red) one. Drag = move the map, mouse wheel / Zoom = zoom.
- **+ its current position**: pick a character in the list, it adds where it stands now (exact x, y, z).
- **● Record its walk**: pick a character and walk it yourself in the game: a point every ~250 units and at every floor change.
  Press **■ Stop recording** when you are there. This is the easiest way inside dungeons (the height z comes from the character).
- **Paste coordinates**: `/loc` lines from the game, or `x y z` per line.
- In the list below the map you can correct x / y / z, move points up/down (↑ ↓), insert (+) or delete (✕).

## 3. Dungeons (Elven Fortress, Tower of Insolence, Cruma Tower, Giant's Cave, Antharas' Lair …)
- **Map** -> `dungeon / floor 1, 2, 3…` shows the client's own map of the inside (only where the client has one for that area).
- Points you add while a floor is shown belong to that floor (purple). Points on another floor are dimmed; tap a point to switch to its map.
- Walk from the entrance outside (world map) to the door, then switch the map to the floor and go on inside.
- The height (z) matters inside: use **Record** or **+ its current position**, or correct z in the list. A tapped point takes the z of the selected point.

## 4. Save
- **Save & lock**: the bots use exactly this route from now on (never replaced by their own recordings).
- Every party walks it, and **every member walks the points itself** (no following): the leader waits for everyone at a checkpoint every
  ~1500 units and at every floor change. If the leader gets stuck, he says at which point — correct it here.
- Old versions are kept in `Scripts/data/routes/raid/history/`.

## Town routes (Giran)
Dashboard -> **Teleports** -> **Giran town routes**: the same editor for start -> grocer / warehouse / weapons / armor / jewelry / blacksmith.

## Hunting spots on the full-screen map (spot editor, 2026-10-07)

Dashboard -> **Hunting spots** -> **+ New spot on the map**, or **map** next to a spot (also **Open full screen** in the Zones tab).
Address: `#/spot/<spot name>`, `#/spot/new`, `#/spot` (list). The map fills the whole screen (phone, iPad, laptop).

- **Move / zoom**: drag the map (in every tool), mouse wheel or two-finger pinch to zoom. ⤢ = show the whole spot.
- **☰** opens the settings: levels, which parties may use it, enabled, start, hunting floor, avoided monsters, **Find a place**
  (dungeons, towns, teleports, characters, other spots — picking a dungeon also shows its first floor).
- Tools at the bottom (keys 1-7):
  1. **✋ Move map** — tap a point to select it.
  2. **⚑ Start** — tap a blue square (gatekeeper landing, e.g. `Dion -> Cruma Tower`) or a gold square (`.giran` etc.).
  3. **➜ Waypoints** — tap the walk from the landing to the area, point by point; tap on a line to insert a point. Every member walks
     every point itself (like the raid routes). A red leg marked "⚠ wall?" runs into a wall according to the geodata: add a point around it.
  4. **▱ Hunt area** — tap around the area (tap on an edge to insert a corner). The team only picks monsters inside it.
  5. **⛔ Exclude area** — tap around a place the team must never fight in (cliff edge, a raid boss, a bad pack); **+ New** for another one.
  6. **⭘ Exclude circle** — tap to drop a round no-fight zone; drag the centre to move it, the small handle to resize (or type the radius).
  7. **☠ Avoid monster** — tap a monster dot: that monster kind is never fought in this spot (black dot = avoided). Tap again to allow it.
- **Selected point** (bottom left): its x / y, the height z, "floors here" (every geodata floor at that spot — tap one to put the point
  on that floor), **Delete** (or the Del key). Drag a point to move it. **↶ / ↷** (Ctrl+Z / Ctrl+Y) undo and redo everything.
- **Floors (towers, caves)**: the menu at the top picks which floor the map shows (Cruma Tower, Tower of Insolence 1-12, Giant's Cave,
  Antharas' Lair, Elven Fortress, Ant Nest, Mithril Mines, Monastery of Silence, catacombs / necropolises, or "height a..b" bands found
  in the monster spawns). The map switches to that floor's picture where the client has one, only that floor's monsters are shown, and
  new points get that floor's height. The first hunt-area corner you draw with a floor shown makes it the **hunting floor** (☰ to change):
  the team then only fights monsters on that floor and never uses L2Swarm's path search there (attack only, the server walks to the monster).
- **Save** (Ctrl+S). Needs a hunt area (3+ corners). Saved into `Scripts/data/custom_zones.json` (fields `waypoints`, `circles`, `floor`,
  `avoidMobs`, `teams` next to the old `poly` / `holes` / `travel`); the leaders use it on their next spot pick (within 5 min, no deploy).
  Every save / delete keeps the old file in `Scripts/data/routes/spots_history/`.
- What the bots do with it (swarm.js): start -> waypoints (leader: `leadRouteWalk`, every member walks each point) -> hunt inside the area
  (`SetCombatPolygon` with the exclusions when L2Swarm has it, else the `.zmap`); exclusions + avoided monsters are never a target and
  never "helped" against — but a monster from an excluded area that actually hits a character is fought back.
- Not possible yet: NPC teleports inside a dungeon (Cruma Tower's floor teleporters) as a waypoint step — for those use the Rooms tab.
