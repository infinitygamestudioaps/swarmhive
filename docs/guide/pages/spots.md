# Spots (`#/spots`) and the full-screen spot editor (`#/spot`)

The **Spots** tab decides **which party may hunt where, and in which order**. Every row is one hunting spot from
`Scripts/data/custom_zones.json` (the same entries as on the [Zones](zones.md) tab). For every party you tick whether it may use the
spot and give it a priority number. You can switch spots on and off, and add a spot inside a catacomb, a necropolis or a dungeon with
rooms.

The **full-screen spot editor** (`#/spot/<name>`) draws everything about one spot on a big map that works with a mouse and with
fingers: where the team starts (teleport or `.town`), the **waypoints** from there to the hunting area, the **hunting area**, **exclusion
areas** and **exclusion circles**, a **floor** for towers and caves, and **monsters the team must never attack** there.

**How a party leader picks his spot** (see also [Concepts](../02-concepts.md)): a spot chosen for the party on the
[Parties](parties.md) tab always wins. Otherwise he looks at the enabled spots his party is ticked for whose level range contains the
party's **lowest** level, takes the one with the **lowest priority number**, and of equal numbers the **nearest**. Every change on this
page and in the spot editor is saved at once into the file, and swarm.js reads that file at every spot pick: **live, no deploy**.

On this page:

- [Spots table](#spots-table-spots)
- [Add a dungeon spot](#add-a-dungeon-spot)
- [Full-screen spot editor](#full-screen-spot-editor-spot)
- [How to ...](#how-to)
- [Notes and safety](#notes-and-safety)

## Spots table (`#/spots`)

![Spots tab on a phone](../img/spots_overview_phone.png) ![Spots tab on a desktop](../img/spots_overview_desktop.png)

1. **+ New spot on the map**: opens the spot editor with a new spot (`#/spot/new`).
2. **Map editor**: opens the spot editor's picker (`#/spot`).
3. **Filter**: shows only rows whose spot name, way in or kind contains the text.
4. **only spots that fit a party**: hides rows that fit no party's lowest level.
5. **How the leader picks**: the rules above, in short.
6. **✎ Edit a spot's shape**: picker for the [shape editor](shape-editor.md): hunting spots, the datapack spots (the bots' built-in
   fallback list) and the field areas, with a filter and **Edit shape**.

### The columns

![Spot rows](../img/spots_table_phone.png) ![Spot rows](../img/spots_table_desktop.png)

1. **Spot** + **map**: the spot's name. **map** opens it in the full-screen spot editor. "✓ saved" appears for 5 seconds after a change
   to that row.
2. **Kind**: **outdoor** (a circle: centre + radius), **drawn area** (a drawn hunting area), **dungeon** (inside a catacomb or necropolis),
   **rooms** (the rooms of a dungeon with floors; the leader picks a room that fits the level).
3. **ON / OFF**: tap to switch the spot on or off. OFF rows are faded and never picked.
4. **Party ticks**: one column per party (named after its leader; under the name the party's lowest and highest level). Tick = this party
   may use the spot. When every party is ticked the spot is stored as "all" and the cell shows "all".
5. **Priority**: shown next to a tick. 1 = first choice; empty = 50 = normal. Any number from 1 to 99. Unticking a party also removes
   its priority.
6. **✕**: delete. Only for spots that were added with **Add a dungeon spot** (asks first). Other spots can only be switched OFF.

The other columns: **Lvl** (the spot's level range), **Way in** (the gatekeeper destination, `.town`, "inside *dungeon*" or "rooms in
*dungeon*"). A **green cell** means the spot's level range contains that party's lowest level right now. The table reloads every 20
seconds while the tab is open.

### Filter and "only spots that fit"

> After you type in the filter or tick "only spots that fit", the ticks and priority boxes of the rows that moved can show the values
> of the row that was in that place before, until the table reloads (every 20 seconds, or when you open the tab again). Wait for the
> reload before you change a tick in a filtered table.

![Filter + only spots that fit](../img/spots_filter_phone.png) ![Filter + only spots that fit](../img/spots_filter_desktop.png)

1. **Filter** text ("route").
2. **only spots that fit a party** ticked.
3. A green cell: the spot fits that party's lowest level.

![A spot for all parties](../img/spots_all_phone.png) ![A spot for all parties](../img/spots_all_desktop.png)

1. "all": the spot is open to every party. Untick one party and the others stay ticked by name.

### Saving a change

![A priority saved (desktop)](../img/spots_saved_desktop.png)

1. A priority typed into a party's box (saved when you leave the box or press Enter).
2. **✓ saved** next to the spot name.

Every tick, priority and ON/OFF change is sent at once (no Save button, no confirmation). If the server refuses, the reason appears
under the page header and the table reloads. Before every change the server copies the file to `Settings/backup/custom_zones_<time>.json`.

## Add a dungeon spot

![Add a dungeon spot](../img/spots_add_phone.png) ![Add a dungeon spot](../img/spots_add_desktop.png)

1. **Type**: **Catacomb / Necropolis** (the Seven Signs dungeons, from `catacombs.json`) or **Dungeon with floors / rooms** (Cruma Tower,
   Tower of Insolence, Ant Nest, ... from `dungeon_rooms.json`).
2. **Dungeon**: the dungeon, with its level range.
3. **Level min** and 4. **Level max**: filled with the dungeon's levels when you pick it; change them if you want.
5. **Parties**: tick at least one party.
6. **Add spot**: adds a spot named `<dungeon> (<min>-<max>)`. No confirmation.

What the new spot does: a **Catacomb / Necropolis** spot makes the leader take the party inside that dungeon and hunt there; a **rooms**
spot makes him walk into the dungeon and hunt in a room that fits the party's level (see [Rooms](rooms.md)). The entry is marked "added
on the dashboard", so it can be deleted with ✕ later.

![Spot added](../img/spots_add_done_phone.png) ![Spot added](../img/spots_add_done_desktop.png)

1. The message under the header: "spot added: *dungeon*".

![Add without a party](../img/spots_add_err_phone.png) ![Add without a party](../img/spots_add_err_desktop.png)

1. Without a party ticked: "tick at least one party". Without a dungeon or with min above max: "pick a dungeon and a level range (min ≤
   max)".

![Delete asks first](../img/spots_delete_confirm_phone.png) ![Delete asks first](../img/spots_delete_confirm_desktop.png)

**✕** asks "Delete the spot "*name*"?". Only spots added on the dashboard can be deleted; the server refuses the others with "only spots
added on the dashboard can be deleted (switch others off)".

## Full-screen spot editor (`#/spot`)

Open it with **+ New spot on the map**, **Map editor** or a row's **map** link here, or **Open full screen** / **+ New spot on the map**
on the [Zones](zones.md) tab. Addresses:

| Address | Opens |
|---|---|
| `#/spot` | the picker panel (no spot open) |
| `#/spot/new` | a new spot |
| `#/spot/<name>` | that spot (the name URL-encoded). An unknown name shows "No spot called ... — pick one or start a new one" and the picker. |

It covers the whole screen. On a phone use one finger to drag and tap, two fingers to zoom; on a desktop drag with the mouse and zoom
with the wheel (Ctrl + wheel zooms faster).

### Picker (`#/spot`)

![The spot picker](../img/spoted_pick_phone.png) ![The spot picker](../img/spoted_pick_desktop.png)

1. **✕**: closes the panel (the map stays).
2. **+ New spot**: starts a new spot.
3. **Filter**: shortens the list.
4. **The spots**: name, levels, parties, `OFF`, `route` (has waypoints), `area` (has a drawn area). Tap one to open it.
5. **Find a place**: search for a dungeon, town, teleport, character or spot and jump there on the map (see [Find a place](#find-a-place)).

### The screen

![A spot in the spot editor](../img/spoted_overview_phone.png) ![A spot in the spot editor](../img/spoted_overview_desktop.png)

1. **◀ Back**: back to where you came from. With unsaved changes it asks "Leave without saving the changes to this spot?".
2. **Spot name**: type to rename. Saving under a new name renames the spot (if that name is taken it asks "A spot called ... exists
   already — replace it?").
3. **Floor shown**: which height the map shows: **All heights**, the spot's own floor (★), the floors of the dungeons in view (for
   example "Cruma Tower: 1st floor"), and height bands found in the monster spawns in view ("height -2900..-2700 (40 spawns)"). For
   towers and caves the map art of that level is shown and only the monsters, characters and points of that floor are drawn bright.
   This only changes the view; the spot's hunting floor is set in ☰.
4. **↶ / ↷**: undo and redo (also Ctrl+Z / Ctrl+Y).
5. **⤢**: fit the whole spot on the screen.
6. **☰**: the settings panel.
7. **Save**: saves the spot. It shows **Save •** while there are unsaved changes. Ctrl+S saves too.
8. **Legend** (not shown on phones): waypoints (light blue), hunt area (green), excluded (red), teleport landing (blue square), `.town` (gold square), monster
   colours (grey low, green fits, orange above, red too high, purple raid boss).
9. **Hint**: what the current tool does, then a summary: start ✓ / **no start yet**, number of waypoints, area corners and size,
   exclusions, avoided monsters, floor, and **N leg(s) may hit a wall** when the wall check failed.
10. **Tools**: see below.

What is on the map: the start (a white ring labelled `START <teleport>`), a dashed line from the start to waypoint 1 and solid lines
between the waypoints (a **red** line with "⚠ wall?" = the straight walk between those two points runs into a wall according to the
geodata), the green hunting area, red exclusion areas (solid while you edit them) and circles, pull routes from the Zones tab (dashed
yellow, shown but not editable here), your online characters, the monsters (datapack spawns, plus small red squares for the monsters a
party leader in view sees right now) and the names of dungeon entrances (⌂). A spot without a drawn area yet shows its old centre and
radius as a dashed green circle with "old centre + radius — draw the hunt area".

### Tools

![The tool buttons](../img/spoted_tools_phone.png) ![The tool buttons](../img/spoted_tools_desktop.png)

On a phone the row scrolls sideways:

![The end of the tool row on a phone](../img/spoted_tools_end_phone.png)

1. **✋ Move map** (key 1): drag to move the map; tap a point to select it. Nothing is added.
2. **⚑ Start** (key 2): tap a **blue square** (gatekeeper landing) or a **gold square** (`.town` landing). That is where the team starts.
   If several destinations land on the same square, a box asks which one ("Which teleport? 1) ... 2) ..."). Missing the square gives "Tap
   right on a blue (gatekeeper landing) or gold (.town) square — or pick the start in ☰". After a start the tool switches to Waypoints if
   there are none yet.
3. **➜ Waypoints** (key 3): each tap adds the next waypoint; a tap on a line inserts one there. The whole team walks every point, member by
   member, from the start to the area.
4. **▱ Hunt area** (key 4): tap around the hunting area; a tap near an edge inserts a corner. The team only fights inside it. If the map
   shows a floor and the spot has no floor yet, the first corner sets the hunting floor to that floor (a message says so).
5. **⛔ Exclude area** (key 5): tap around a place the team must never fight in.
6. **⭘ Exclude circle** (key 6): tap to drop a no-fight circle. Drag its centre to move it, drag the small handle on its edge to resize.
7. **☠ Avoid monster** (key 7): tap a monster dot: that monster kind is never attacked in this spot ("*name*: never fought in this
   spot"); tap one again to allow it ("allowed again"). Avoided monsters are drawn black with a red ring.
8. **+ New**: only with Exclude area: starts another exclusion area.

Every new point gets its height (z) from the geodata: the ground under it closest to the floor shown, or to the previous point.

### Selecting a point

![A waypoint selected](../img/spoted_waypoint_phone.png) ![A waypoint selected](../img/spoted_waypoint_desktop.png)

1. The selected point is white and larger. Tap it again to unselect, or press Esc.
2. **The selected point box**: its name ("Waypoint 2", "Area corner 3", "Exclusion 1, corner 2", "Exclusion circle 1") and x / y.
3. **z**: the height. Type a number, or, where the geodata has several floors at that spot (towers, caves), tap one of the buttons after
   "floors here:". A single floor shows "ground *z*".
4. **Delete**: removes the point (also the Delete / Backspace key).

Drag any point to move it; when you let go it gets a new height from the geodata and the waypoint legs are checked again.

![An exclusion circle selected](../img/spoted_circle_phone.png) ![An exclusion circle selected](../img/spoted_circle_desktop.png)

1. The circle's centre (drag to move). 2. The radius handle (drag to resize). 3. **radius**: type the radius (50 or more).

![A corner of an exclusion area selected](../img/spoted_hole_phone.png) ![A corner of an exclusion area selected](../img/spoted_hole_desktop.png)

1. A corner of an exclusion area. 2. **Delete this exclusion**: removes the whole exclusion area.

### Drawing, step by step pictures

![Start tool](../img/spoted_start_phone.png) ![Start tool](../img/spoted_start_desktop.png)

1. **⚑ Start** is on. 2. The hint tells you to tap a blue or gold square.

![A waypoint added](../img/spoted_way_add_phone.png) ![A waypoint added](../img/spoted_way_add_desktop.png)

1. The new waypoint (number 5). The new leg is checked against the geodata about a second later; a red leg with "⚠ wall?" means
   the team cannot walk it in a straight line: add a waypoint in between or move the point.
2. The summary line counts the legs that may hit a wall.

![A corner inserted into the hunt area](../img/spoted_area_phone.png) ![A corner inserted](../img/spoted_area_desktop.png)

1. **▱ Hunt area** is on. 2. The new corner is selected (its box shows "Area corner N").

![A new exclusion area](../img/spoted_new_hole_phone.png) ![A new exclusion area](../img/spoted_new_hole_desktop.png)

1. **+ New**. 2. A new exclusion area drawn with three taps.

![A new exclusion circle](../img/spoted_new_circle_phone.png) ![A new exclusion circle](../img/spoted_new_circle_desktop.png)

1. The new circle (its size depends on the zoom; change it with the radius box or the handle). 2. **radius**.

![Avoid monster](../img/spoted_mob_phone.png) ![Avoid monster](../img/spoted_mob_desktop.png)

1. **☠ Avoid monster** is on. 2. The message after tapping a monster dot.

### Settings panel (☰)

![Settings: levels, parties, start](../img/spoted_settings_1_phone.png) ![Settings: levels, parties, start](../img/spoted_settings_1_desktop.png)

1. **Levels**: lowest and highest party level.
2. **enabled (the parties may pick it)**.
3. **Team kind**: any, mage, melee, small (as on the [Zones](zones.md#fields) tab).
4. **Parties that may use it**: **all parties** or single parties. Ticking "all" clears the others; ticking a party clears "all";
   unticking the last one sets "all" again.
5. **Start**: **— none (walk / automatic) —**, **gatekeeper teleport** or **.town and walk**.
6. **Gatekeeper destination** (a list of every known destination) or the **town**. Or use the ⚑ Start tool on the map.

![Settings: floor, avoided monsters, map layers](../img/spoted_settings_2_phone.png) ![Settings: floor, avoided monsters, map layers](../img/spoted_settings_2_desktop.png)

1. **Hunting floor (towers, caves)**: **— any height (outdoor) —**, the spot's floor, "the floor the map shows", or a floor of a dungeon in
   view. With a floor the team only fights monsters on that height band, and in towers and caves it never uses L2Swarm's path search
   (it attacks and lets the server walk to the monster).
2. **Monsters never fought here**: the avoided monsters as chips; **✕** on a chip allows it again.
3. **Monster name** and 4. **Add**: avoid a monster by typing its name.
5. **monsters**, 6. **teleport landings**, 7. **characters**: map layers on/off.

![Settings: find, note, danger zone](../img/spoted_settings_3_phone.png) ![Settings: find, note, danger zone](../img/spoted_settings_3_desktop.png)

1. **Find a place**. 2. **Note**: free text kept with the spot. 3. **Clear all drawing**: removes the waypoints, the hunt area and every
   exclusion after a confirmation (Undo brings them back). 4. **Delete spot**: deletes the saved spot after a confirmation and goes back
   to the picker.

Below the danger zone: "Keys: 1-7 tools, Ctrl+Z / Ctrl+Y undo/redo, Del deletes the selected point, Ctrl+S saves. Every save keeps the old
file in Scripts/data/routes/spots_history." If the spot has pull routes from the Zones tab, the panel says they are kept; a rooms or
dungeon spot says that way in comes first.

#### Find a place

![Find a place](../img/spoted_find_phone.png) ![Find a place](../img/spoted_find_desktop.png)

1. Type at least 2 letters. The list shows dungeons (⌂, with their number of floors), `.town` landings, teleport landings (⚑), characters
   (●, with level) and spots (▱). Tap one: the map jumps there and zooms in. For a dungeon the map switches to its first floor. On a
   phone the panel closes.

### A new spot (`#/spot/new`)

![A new spot](../img/spoted_new_phone.png) ![A new spot](../img/spoted_new_desktop.png)

1. The message: "New spot: 1) Start — tap where the team teleports in · 2) Waypoints · 3) Hunt area. Use ☰ to find a place."
2. The ⚑ Start tool is already on.
3. The settings panel is open (use **Find a place** to get to the right part of the world).

The new spot is called `New spot <month-day hour:minute>`, with levels and party taken from the first online character (its level −3 to
+5).

### Saving

![Saved](../img/spoted_save_ok_phone.png) ![Saved](../img/spoted_save_ok_desktop.png)

1. "Saved — the leaders use it on their next spot pick (within 5 min, no deploy needed)".

Save checks, in this order:

| Check | What you see |
|---|---|
| a name | "Give the spot a name first" |
| a hunt area with at least 3 corners | "Draw the hunt area first (▱ Hunt area, at least 3 corners)" and the Hunt area tool switches on |
| a start (not needed for rooms / dungeon spots) | confirmation "No start (teleport / .town) is set: the team walks from wherever it is. Save anyway?" |
| levels | "Level min is above level max" |
| the name is free | confirmation "A spot called ... exists already — replace it?" |

![Save without a hunt area](../img/spoted_noarea_phone.png) ![Save without a hunt area](../img/spoted_noarea_desktop.png)

![Save without a start asks first](../img/spoted_nostart_confirm_phone.png) ![Save without a start asks first](../img/spoted_nostart_confirm_desktop.png)

The spot is written into `Scripts/data/custom_zones.json` with everything you drew: hunting area, exclusion areas (3+ corners), circles,
waypoints, start, floor (its height is stored as the middle of the floor band, else the average height of the area corners), avoided
monsters, parties, levels, kind, note. A copy of the old file goes to `Scripts/data/routes/spots_history/`. A failed save shows "Not
saved: *reason*".

![Leaving with unsaved changes](../img/spoted_back_confirm_phone.png) ![Leaving with unsaved changes](../img/spoted_back_confirm_desktop.png)

![Clear all drawing asks first](../img/spoted_clear_confirm_phone.png) ![Clear all drawing](../img/spoted_clear_confirm_desktop.png)

![Delete spot asks first](../img/spoted_delete_confirm_phone.png) ![Delete spot](../img/spoted_delete_confirm_desktop.png)

The browser also warns before closing the page while a spot has unsaved changes.

### A spot on one floor of a tower

![A tower-floor spot](../img/spoted_floor_phone.png) ![A tower-floor spot](../img/spoted_floor_desktop.png)

1. **Floor shown**: the spot's floor. The map art is that floor's.
2. The summary ends with "floor *name*", and the map writes "hunting floor: *name* (z ...)" in the middle of the area.

With a hunting floor the bots ignore monsters more than 150 above or below the floor band, and a team member outside the band does not
count as "in the area".

## How to ...

**Let only one party use a spot, as its first choice**

1. On the Spots tab, untick every other party in that row (or tick only that party if it showed "all").
2. Type **1** in that party's priority box.

**Make a spot for a new hunting ground from scratch**

1. **+ New spot on the map**. In ☰ use **Find a place** to jump to the area, close the panel.
2. ⚑ **Start**: tap the gatekeeper landing (blue) the team should teleport to.
3. ➜ **Waypoints**: tap the way from the landing to the hunting ground. Watch for red legs ("⚠ wall?"): add points around the obstacle.
4. ▱ **Hunt area**: tap around the area.
5. Optional: ⛔ / ⭘ for places to avoid, ☠ for monsters to leave alone.
6. ☰: set the levels, the parties, the name (top bar).
7. **Save**.

**Hunt on one floor of a tower**: pick the floor in the floor menu at the top, draw the hunt area (the first corner sets the spot's
hunting floor to the floor shown), check ☰ → Hunting floor, Save.

## Notes and safety

- Everything here is live for the bots (custom_zones.json is read at every spot pick). The leader picks again every few minutes, so a
  party that is hunting keeps its spot until then.
- Confirmations: ✕ on the Spots tab, Save without a start, Save over an existing name, Clear all drawing, Delete spot, leaving with
  unsaved changes. Ticks, priorities, ON/OFF and Add spot are sent without asking.
- Backups: Spots tab changes → `Settings/backup/custom_zones_<time>.json`; spot editor saves and deletes →
  `Scripts/data/routes/spots_history/`.
- What the bots do with the drawing: after the teleport every member walks the waypoints point by point by itself and they all wait at
  the last one (only when the team landed near the route; otherwise they walk the normal way); then the leader hunts only monsters inside the area and outside every exclusion (a circle or exclusion drawn
  with a height only counts on that floor, ±400-500); avoided monster kinds are never attacked within the spot's area plus 3 000.
- To change only the outline of a spot by dragging, the [shape editor](shape-editor.md) is quicker; it keeps everything else.
