# Shape editor (`#/edit/<room|zone|spot|area>/<id>`)

The **shape editor** is a full-screen map for changing the **outline** of one thing the bots hunt in, by dragging its points with a finger
or the mouse. It edits four kinds of shapes:

| Kind | What it is | File | Opened from |
|---|---|---|---|
| **Dungeon room** (`#/edit/room/<room id>`) | a room inside a dungeon floor | `Scripts/data/dungeon_rooms.json` | [Rooms](rooms.md): **✎ Edit this room's outline** |
| **Hunting zone** (`#/edit/zone/<name>`) | a zone / spot of the Zones and Spots tabs | `Scripts/data/custom_zones.json` | [Zones](zones.md): **✎ Drag-edit shape** or **✎ Edit a zone's shape**; [Spots](spots.md): **✎ Edit a spot's shape** |
| **Datapack spot** (`#/edit/spot/<number>`) | a spot of the built-in fallback list (made from the game's spawn list) | `Scripts/data/hunting_spots_h5.json` | [Spots](spots.md): **✎ Edit a spot's shape** |
| **Field area** (`#/edit/area/<id>`) | one generated outdoor hunting area (see [Field areas](#field-areas)) | `Scripts/data/field_areas.json` | [Zones](zones.md) and [Spots](spots.md) pickers |

It only changes the shape and a few simple fields (name, levels, on/off, centre, radius, height band, notes). Waypoints, exclusions, pull
routes and floors of a zone stay as they are (they are edited in the [spot editor](spots.md#full-screen-spot-editor-spot) and the
[zone editor](zones.md#zone-editor)).

**The pickers** on the Zones and Spots tabs (box "✎ Edit a zone's shape" / "✎ Edit a spot's shape"): type in the filter, pick an item and
press **Edit shape**. Items are grouped by file and sorted by level; the marks are `▱` polygon, `○` circle, `· rooms` (hunts inside
dungeon rooms), `✎` edited on the dashboard, `OFF`. If the dashboard server is older than the shape editor, the list says "The dashboard
server does not know the shape editor yet — it needs a restart".

## The screen

![The shape editor with a dungeon room](../img/shape_room_phone.png) ![The shape editor with a dungeon room](../img/shape_room_desktop.png)

1. **◀ Back**: back to the tab you came from (Esc too). With unsaved changes it asks "Leave without saving? Your changes to this shape are
   lost.".
2. **Title**: the kind ("Dungeon room", "Hunting zone", "Datapack spot", "Field area"), the name, and where it is (dungeon · floor, the
   file, or the field region), plus "· edited on the dashboard" when it was saved here before.
3. **↶ / ↷**: undo / redo (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z). Up to 200 steps.
4. **⤢**: show the whole shape.
5. **☰**: the fields panel.
6. **Save**: greyed out until there is a change, and while the outline has an error.
7. **Legend** (not shown on phones): this room / zone (red-orange for rooms, green otherwise), others, safe spot (rooms) or "square today" (circles), and the
   monster colours: grey = more than 3 levels below the item's levels, green = fits, orange = up to 4 above, red = more; "white ring = its
   own" monsters.
8. **Live numbers**: points (or "circle r *n*"), the area as an equal square ("area ≈ 1721 × 1721"), the monsters inside by level, the
   share of the item's own monsters that are inside ("own 100 %"), "unsaved", and lines with **✕ errors** (cannot save) and **⚠ warnings**
   (can save).
9. **Hint**: what you can do now.

What the map shows around the shape:

- **Other rooms / zones / spots / field areas** nearby, faint, with name and levels (dashed when they are circles or monster outlines).
- **Monsters** from the game's spawn list: bright inside the shape, faded outside, white ring = the item's own monsters, purple crown =
  raid boss.
- **Safe spots** (green shields; yellow = "tight") of the floor or region.
- **Lines**: the room's walk-in route (grey, dashed), a field area's walk from its landing (grey), a zone's pull routes (yellow) and
  waypoints (light blue). **Points**: the floor entry / landings (blue squares).
- For zones: its **exclusion areas** and **circles** (red), and its **sub-areas** (dashed light-blue circles "sub-area *n*").
- For a circle: the dashed yellow **"hunting square today"**: the square the bots really hunt in now (3 x the radius, at least 9 000 wide).
- For a datapack spot: its monster outline (dotted purple).

### The tool row

![The tool row](../img/shape_tools_phone.png) ![The tool row](../img/shape_tools_desktop.png)

1. **✎ Points**: the normal mode: drag points, add and delete them.
2. **✥ Move shape**: drag anywhere to move the whole shape (a room's centre moves along).
3. **✕ Point**: deletes the selected point (Delete / Backspace key too). At least 3 points stay ("A shape needs at least 3 points.").
4. **☠ Fit to monsters**: replaces the outline with one around the item's own monsters (or, when it has fewer than 3, the monsters of
   its level range ±3 inside), pushed out a little. It asks first and warns that it ignores walls.
5. **⌖ Snap**: when on, every edit is checked against the geodata, and a point you drag onto rock or a wall is moved to the nearest
   walkable ground (up to about 320 away), with a message "Point *n* snapped onto walkable ground (*d* away).".
6. **Check walls**: checks every point and edge against the geodata once.
7. **☠** monsters, 8. **▱ others**, 9. **⛨** safe spots: show or hide those layers.

**▱ Make polygon** appears instead of the point tools when the item is a circle.

## Editing points

| Do | Phone | Mouse |
|---|---|---|
| move a point | drag it | drag it |
| add a point | tap the small **+** in the middle of an edge (or drag the + to add and move at once) | click / drag the + |
| delete a point | double-tap it, or hold it for about 0.7 s | double-click it, or select it and press ✕ Point / Delete |
| select a point | tap it (white, numbered) | click it |
| unselect | tap the empty map | click the empty map, or Esc |
| move the view | drag the empty map | drag the empty map |
| zoom | two fingers (pinch) | mouse wheel |
| move the whole shape | ✥ Move shape, then drag | the same |

The + handles are only drawn on edges that are long enough on screen; zoom in to get more.

![A point selected](../img/shape_point_phone.png) ![A point selected](../img/shape_point_desktop.png)

1. The selected point: white, a bit bigger, with its number. 2. **✕ Point** can now delete it.

![A point inserted with the +](../img/shape_insert_phone.png) ![A point inserted](../img/shape_insert_desktop.png)

1. A **+** handle on an edge. 2. The live numbers show one more point and "unsaved". 3. Undo is active.

![An outline that crosses itself](../img/shape_cross_phone.png) ![An outline that crosses itself](../img/shape_cross_desktop.png)

1. **✕ the outline crosses itself (red edges)**: the crossing edges are drawn red. 2. **Save** stays greyed out until it is fixed.

![Move shape](../img/shape_move_phone.png) ![Move shape](../img/shape_move_desktop.png)

1. **✥ Move shape** is on. 2. The hint: "Move shape: drag anywhere to move the whole shape. Two fingers / wheel = zoom."

![Layers off](../img/shape_layers_off_phone.png) ![Layers off](../img/shape_layers_off_desktop.png)

1. - 3. Monsters, other shapes and safe spots switched off.

### Geodata: Check walls and Snap

![Check walls](../img/shape_geo_phone.png) ![Check walls](../img/shape_geo_desktop.png)

1. **Check walls**. 2. The result, for example "Geodata: every point is on walkable ground, no edge crosses a wall.", or which points are
   not on walkable ground (drawn with an **orange ring**) and which edges cross a wall (drawn **orange, dashed**). "fine where the outline
   follows a wall": an outline may touch a wall; an edge that cuts through rock into the next corridor is the problem. Points where the
   map has no geodata are counted separately.

The check uses the item's height band (a room: its height ±300; a floor zone: its floor; a field area: its height band), so on a tower
floor it looks at that floor only. A point counts as walkable when walkable ground is within 48 units; an edge "crosses a wall" when 128
units or more of it in a row have no walkable ground near it.

![Snap](../img/shape_snap_phone.png) ![Snap](../img/shape_snap_desktop.png)

1. **⌖ Snap** is on (gold). 2. The geodata message. Here point 4 was dragged out of the room: it still stands on walkable ground (so
   it was not moved), but two of its edges now cut through the wall: they are drawn orange and dashed, and the live numbers warn
   "2 edges cross a wall".

## The fields panel (☰)

![The fields of a room](../img/shape_panel_room_phone.png) ![The fields of a room](../img/shape_panel_room_desktop.png)

1. **Name** (up to 100 characters). For a zone this is its key: renaming is allowed when the new name is free, but a party that chose this
   spot by name on the [Parties](parties.md) tab has to choose it again (the save says so).
2. **Monster levels** (rooms) / **Levels** (the others): 1 - 99, min ≤ max.
3. **Suits party lvl** (rooms, field areas): the party levels this place is good for.
4. **Enabled**: off = the bots never pick it.
5. **Centre x / y / z** (rooms and circles). A room's centre is where the leader walks to and what "is someone in this room" measures;
   you can also drag the red cross on the map.
6. **Radius** (rooms and circles): 100 - 20 000. For a room it is used for "is someone in this room"; for a circle the bots hunt in a
   square of max(3 x radius, 9 000).
7. **Height band** (rooms, field areas): monsters and members outside it do not count. At most 4 000 between the two numbers.
8. **Notes**.
9. **✕**: close the panel.

![The lower part of the panel](../img/shape_panel_room_2_phone.png) ![The lower part of the panel](../img/shape_panel_room_2_desktop.png)

1. **update the room's monster list from the spawns inside the new outline on save** (rooms only).
2. **Apply**: puts the typed values on the map (changing a field and leaving it does the same).
3. **Levels from monsters inside**: sets the levels to the lowest and highest monster inside the shape ("No monsters inside." if none).
4. **☠ Fit to monsters** (as in the tool row). **▱ Make polygon** is here too for circles.
5. **Undo all changes**: back to the shape as it was when you opened it (asks first when there are changes).
6. **When the bots use it**: a note about when the bots pick up a change, then the file name, the id, and "every save keeps a copy in
   Scripts/data/history/". When the item was saved here before, **Reset to generated** is shown with the date (see below); otherwise "generated
   / original shape — your first save marks it manual, so the generator tools keep it".

> The "when the bots use it" note in the panel and in the save question can be older than the scripts: current swarm.js versions re-read
> `dungeon_rooms.json`, `hunting_spots_h5.json` and `field_areas.json` within about a minute after a save, and skip rooms, datapack
> spots and field areas that are switched off. A party that is hunting there now uses the new shape the next time it picks its spot.

## Saving

![Save asks first](../img/shape_save_confirm_phone.png) ![Save asks first](../img/shape_save_confirm_desktop.png)

**Save** (or Ctrl+S) first asks, with a summary: "Save dungeon room "*name*"? — 24 points, area ≈ ..., 11 monsters inside (lvl 47-49),
levels 47-49 — Used by every party (the leader hunts only inside this room outline). Marked as edited by hand, so the generator tools keep
it. A copy of the file goes to Scripts/data/history/." plus the note about when the bots use it.

![Saved](../img/shape_saved_phone.png) ![Saved](../img/shape_saved_desktop.png)

1. **✓ Saved (poly, ...)**: the list of what changed, warnings after **⚠**, and "Recomputing: safe spots of this floor…" when a background
   job was started. 2. The title now says "edited on the dashboard".

What a save does on the server:

1. **Checks** (an error = nothing is written): 3 to 400 points, inside the world, no two neighbouring points on top of each other, no
   crossing edges, at least 200 x 200 in size, at most 40 000 wide for a room and 80 000 for the others; levels 1 - 99 with min ≤ max;
   radius 100 - 20 000; height band at most 4 000; a zone name that is not used by another zone; a spot that hunts inside dungeon rooms
   cannot get an outline ("this spot hunts inside dungeon rooms — edit the rooms on the Rooms tab instead").
2. **Warnings** (saved anyway): "the room centre is outside the outline — the leader walks to the centre first"; "the outline moved more
   than 6000 from the old room centre — the saved walk-in route still ends at the old place"; a renamed zone.
3. **Changed on disk**: if the file changed since you opened the shape (a tool, or the same shape saved in another window), you get "changed
   on disk since you opened it ... — reload and edit again" and the question "Reload the shape from the file now? (Your changes are lost;
   Cancel keeps them on screen.)".
4. **Writes** only that one item, safely (lock, temporary file, rename), in the file's own format. A copy of the whole file goes to
   `Scripts/data/history/<file>_<time>.json` (the last 50 are kept).
5. **Marks** the item as edited by hand (`manual`), keeping its original generated values, so the generator tools never overwrite it and
   **Reset to generated** can bring the original back.
6. **Derived values**: a polygon zone / spot / area gets its centre (average of the corners) and radius (farthest corner); a zone also gets
   its L2Swarm zone map `Settings/zones/<name>.zmap`. A room gets its new area and outline quality "manual".
7. **Background jobs**: a room whose outline, centre or height band changed gets the safe spots of its floor recomputed (a message reports
   when it is done); a circle zone that moved or changed size, or got an outline, gets its sub-areas recomputed. A field area's region is
   only marked; its safe spots are recomputed by the field-area tool.

![The server refuses a save](../img/shape_save_err_phone.png) ![The server refuses a save](../img/shape_save_err_desktop.png)

1. "Not saved: levels: 1-99, min <= max": the server's reason (red message, stays 15 seconds; ✕ closes it).

![Reset to generated asks first](../img/shape_reset_confirm_phone.png) ![Reset to generated](../img/shape_reset_confirm_desktop.png)

**Reset to generated** (☰ panel, only for items saved here before) asks "Reset "*name*" to the generated shape and values? The manual mark
is removed, so the generator tools may change it again. A history copy is kept." and answers "✓ Reset to the generated shape.".

![Leaving with unsaved changes](../img/shape_back_confirm_phone.png) ![Leaving with unsaved changes](../img/shape_back_confirm_desktop.png)

## Each kind

### Dungeon room

The screenshots above show a room: the room in red-orange, its **red cross centre** (drag it), the other rooms of the floor, safe spots,
the walk-in route and the floor entry. Rooms have **Suits party lvl**, a **Height band** and the monster-list option in ☰. Warnings to
watch: "*n* of its own monsters are outside" and "*n* monsters of other rooms inside" (the outline swallows part of the next room), and
"centre is outside the outline".

### Hunting zone: a circle

![A circle zone](../img/shape_zone_circle_phone.png) ![A circle zone](../img/shape_zone_circle_desktop.png)

1. **Centre**: drag the red cross to move the zone. 2. **Radius handle**: drag the yellow handle; its label shows the radius.
3. **▱ Make polygon**: turns the circle into a 12-corner outline the size of today's hunting square.
4. The hint: "Circle: drag the red centre or the yellow radius handle, or "Make polygon" to draw the exact area."

The dashed circles are the zone's **sub-areas**: when two of your parties use the same circle zone, each takes one sub-area so they do not
hunt on top of each other (made by `docs/plan/tools/zone_subareas.js`, recomputed after a save here).

![Circle turned into a polygon](../img/shape_zone_convert_phone.png) ![Circle turned into a polygon](../img/shape_zone_convert_desktop.png)

1. "Now a polygon: drag the points to fit. Saving makes the bots hunt only inside it." 2. 12 points.

### Hunting zone: drawn

![A drawn zone](../img/shape_zone_poly_phone.png) ![A drawn zone](../img/shape_zone_poly_desktop.png)

1. The title says "Hunting zone (custom_zones.json)". 2. The live numbers.

The zone's exclusion areas and circle (red), pull route (yellow) and waypoints (light blue) are drawn for orientation; edit them in the
[spot editor](spots.md#full-screen-spot-editor-spot) or [zone editor](zones.md#zone-editor).

### A spot that hunts inside dungeon rooms

![A rooms spot](../img/shape_rooms_zone_phone.png) ![A rooms spot](../img/shape_rooms_zone_desktop.png)

1. "This spot hunts inside the rooms of *dungeon* — edit the rooms on the Rooms tab. Here: levels, on/off, notes (☰)."

### Datapack spot

![A datapack spot](../img/shape_spot_phone.png) ![A datapack spot](../img/shape_spot_desktop.png)

1. The title: "Datapack spot · *region* (hunting_spots_h5.json)". 2. **▱ Make polygon**.

![Make polygon asks which outline](../img/shape_spot_convert_confirm_phone.png) ![Make polygon](../img/shape_spot_convert_confirm_desktop.png)

For a datapack spot **Make polygon** asks "Start from the monster area of this spot (dotted purple outline)? Cancel = start from the
square the bots hunt in today."

### Field area

![A field area](../img/shape_area_phone.png) ![A field area](../img/shape_area_desktop.png)

1. The title: "Field area · *region*". 2. The legend. 3. The live numbers (monsters inside, own %).

![Fields of a field area](../img/shape_area_panel_phone.png) ![Fields of a field area](../img/shape_area_panel_desktop.png)

1. **Levels**. 2. **Suits party lvl**. 3. **Height band**. 4. **Enabled**.

![Fit to monsters asks first](../img/shape_fitmobs_confirm_phone.png) ![Fit to monsters](../img/shape_fitmobs_confirm_desktop.png)

"Replace the outline with one around *n* monster spawns (its own monsters), *m* points? It ignores walls — check the edges afterwards."

### A wrong link

![Unknown item](../img/shape_bad_link_phone.png) ![Unknown item](../img/shape_bad_link_desktop.png)

1. "not found: *id*" (or "Nothing to edit: the link needs #/edit/<room|zone|spot|area>/<id>"). The map stays empty; press ◀ to go back
   (the buttons are shown but do nothing useful).

## Field areas

**Field areas** are the outdoor version of dungeon rooms. A tool (`docs/plan/tools/field_areas.js`, run by hand; a full run takes about
an hour) splits every outdoor hunting ground into **regions** (one per gatekeeper landing that leads to a field, for example "Abandoned
Camp", "Windy Hill"; plus "<Town> outskirts" and "(far)" regions) and each region into **areas**: groups of monsters of similar level on
one piece of walkable ground, with an outline that follows walls, cliffs and water edges from the geodata. The result,
`Scripts/data/field_areas.json`, has about 120 regions and 1 700 areas, each with its levels, the party levels it suits, its monsters
(aggressive ones marked), raid bosses nearby, the landing to use and the walk from it, its neighbours and the nearest safe spot.

How the bots use them:

- **You choose them** on the [Parties](parties.md) tab: open a hunting ground's region map and tap one or more areas; the leader hunts the
  first and moves on to the next when an area has had no monster for a while (nearest first, or in your order).
- **Automatically**: when no custom zone fits, the leader picks the best free field area for the party's level (reachable from a live
  gatekeeper landing, not too dangerous, not taken by another of your parties) plus its fitting neighbours to rotate through.
- **Plain circle zones**: a zone without a drawn area, pull route, waypoints or `.town` start is hunted as the field areas inside its
  square.
- Inside an area the leader only takes monsters inside the outline (and anything that attacks the team); members walk back inside.

You edit an area's outline, levels, height band or on/off state here (`#/edit/area/<id>`); the field-area tool keeps areas you saved (it
never regenerates an item marked as edited by hand). After changing an outline, the region's safe spots are recomputed the next time the
tool runs for that region (`node docs/plan/tools/field_areas.js --only <region id>`).

## Notes and safety

- Every save asks first and keeps a history copy of the whole file in `Scripts/data/history/` (last 50 per file). Reset to generated asks
  first too.
- Nothing on this screen sends anything to the game; it only changes data files that the bots read.
- Keys (desktop): Ctrl+Z / Ctrl+Y undo / redo, Ctrl+S save, Delete / Backspace delete the selected point, Esc closes the panel, then
  unselects, then goes back.
- The background jobs and the server part need a dashboard server that knows the shape editor (Dashboard/server.js with the
  "POLYEDIT" block); after updating the dashboard files, restart the dashboard server once.
