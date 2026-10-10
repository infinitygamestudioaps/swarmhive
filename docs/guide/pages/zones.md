# Zones (`#/zones`)

The **Zones** tab is where you define your own **hunting zones**: places where a party levels up. A zone has a name, a level range, the
parties that may use it, how the team gets there (a gatekeeper teleport or a `.town` command), and either a simple circle (centre +
radius) or a drawn **hunting area** with **exclusion zones** (places the team must never fight in) and **pull routes** (a path the tank
runs to gather monsters).

All zones live in one file, `Scripts/data/custom_zones.json`. The same entries appear on the [Spots](spots.md) tab (where you tick which
party may use which spot and set priorities) and in the full-screen [spot editor](spots.md#full-screen-spot-editor-spot) (waypoints,
round exclusions, floors, monsters to avoid). The [shape editor](shape-editor.md) can drag the outline of any zone.

**How the bots use zones.** When a party leader needs a hunting spot (auto-level, see [Concepts](../02-concepts.md)), he first takes the
party's own choice from the [Parties](parties.md) tab, if there is one. Otherwise he takes the custom zones that are **enabled**, whose
level range contains the party's **lowest** level, whose party list contains his party (or "all") and whose **Kind** fits the team. Of
those, the one with the lowest priority number for his party wins (set on the [Spots](spots.md) tab, empty = 50); equal priority = the
nearest. Only when no zone fits does he use the generated outdoor areas and the built-in spot list. swarm.js reads the file at every spot
pick, so **every save is live**: no deploy and no restart. A party already hunting in a zone keeps the old version until its next spot
check (every few minutes).

On this page:

- [The top of the tab](#the-top-of-the-tab)
- [Zone editor](#zone-editor): fields, the map, drawing modes, layers, zoom, save and delete
- [Simple zone form and the zone table](#simple-zone-form-and-the-zone-table)
- [How to ...](#how-to)
- [Notes and safety](#notes-and-safety)

## The top of the tab

![Zones tab on a phone](../img/zones_overview_phone.png) ![Zones tab on a desktop](../img/zones_overview_desktop.png)

1. **What the zones are for**: a one-line reminder that auto-level uses these zones first and that edits apply live.
2. **✎ Edit a zone's shape**: a filter box, a list of every hunting zone and every field area (grouped "Hunting zones / spots
   (custom_zones.json)" and "Field areas (field_areas.json)"), and **Edit shape**. It opens the full-screen [shape editor](shape-editor.md)
   for the picked item. The list shows each item's levels and a mark: `▱` drawn polygon, `○` circle, `· rooms` hunts inside dungeon rooms,
   `✎` edited on the dashboard, `OFF` switched off. Type in the filter to shorten the list.
3. **Open full screen**: opens the zone that is open in the editor below in the full-screen [spot editor](spots.md#full-screen-spot-editor-spot)
   (`#/spot/<name>`). With no zone open it opens the spot editor's picker (`#/spot`).
4. **+ New spot on the map**: starts a new spot in the full-screen spot editor (`#/spot/new`).
5. **✎ Drag-edit shape** (on a phone the title row is wider than the screen; scroll it sideways to reach this button): opens the zone picked in the zone picker (6) in the [shape editor](shape-editor.md). With nothing picked you
   get "Pick something to edit first.".
6. **Zone picker** ("— pick a zone —"): every zone, sorted by its lowest level, shown as `name (min-max, party)` and `OFF` when it is
   switched off. Picking one opens it in the zone editor.
7. **New zone at…**: starts a new zone at the position of the character chosen in (8).
8. **Character**: every character the dashboard knows. The list fills once the live data has arrived (open the tab again if it is
   empty).

## Zone editor

The zone editor works on one zone at a time. Nothing is written until you press **Save zone**; the summary line says **unsaved changes**
while you have edits that are not saved.

### Fields

![Zone editor fields on a phone](../img/zones_editor_form_phone.png) ![Zone editor fields on a desktop](../img/zones_editor_form_desktop.png)

1. **Name**: the zone's name. It is also its key: saving under a new name renames the zone.
2. **Team**: `all` or one party (a party is named after its leader). Note: once you have ticked parties for this zone on the
   [Spots](spots.md) tab, those ticks decide and this field is ignored; change the parties there.
3. **Levels**: lowest and highest party level the zone is meant for. The leader compares the party's **lowest** level with this range.
   The map recolours the monsters as soon as you change the numbers.
4. **Kind**: which kind of team may use it: **any team**, **mage team** (at least half of the party are nukers / necromancers),
   **melee team** (the others), **small team** (3 characters or fewer).
5. **enabled**: untick to switch the zone off. The bots never pick a zone that is off.
6. **Get there**: **gatekeeper teleport** (the leader takes the team to the town and uses its gatekeeper) or **.town and walk** (the
   leader uses the `.townname` command and the team walks from the town).
7. **Gatekeeper destination**: shown text like `Gludin -> Abandoned Camp`. Type it (the list suggests every destination the bots have
   seen on a live gatekeeper menu) or tap a **blue square** on the map.
8. **Town**: for **.town and walk**: pick the town, or tap a **gold square** on the map.

### Drawing buttons and layers

![Zone editor buttons on a phone](../img/zones_editor_map_phone.png) ![Zone editor buttons on a desktop](../img/zones_editor_map_desktop.png)

1. **Hunting area**: drawing mode for the green outline: the area the team fights in. A tap on the map adds a corner. A tap close to an
   edge inserts the corner into that edge, so the outline stays clean.
2. **Exclusion zone**: drawing mode for the red outlines: places inside the hunting area where the team must never fight (a cliff, a
   spot next to a raid boss). The exclusion that is being edited has a solid outline, the others are dashed.
3. **+ new exclusion**: starts another exclusion zone and switches to Exclusion mode.
4. **Pull route**: drawing mode for the yellow line. Taps add points at the end. The **first point** is where the team waits ("tank waits
   here"); the leader runs along the other points, tags monsters and brings them back. While you draw, the points are numbered.
5. **+ new pull route**: starts another pull route ("pull 2", ...). With several routes the leader uses them in turn.
6. **Move / pan**: tapping no longer adds points; drag the map to move the view.
7. **Delete point**: deletes the selected point (tap a point first; it turns white).
8. **Delete this shape**: in Hunting area mode it clears the whole outline; in Exclusion or Pull route mode it removes the exclusion /
   route that is being edited. There is no confirmation, but nothing is saved until you press Save zone (open the zone again from the
   picker to throw your edits away).
9. **teleport landings**: show or hide the blue squares (gatekeeper landings) and gold squares (`.town` landings).
10. **monsters**: show or hide the monster spawns (from the game's datapack).
11. **+ / − / Fit**: zoom in, zoom out, and fit the whole zone. A mouse wheel over the map zooms too.
12. **Summary line**: `6 area points · 1 exclusions · 1 pull routes · area 13.2 km²` and `· unsaved changes` after edits.
13. **The map**: see below.

### The map, legend, Save and Delete

![Zone editor map on a phone](../img/zones_map_legend_phone.png) ![Zone editor map on a desktop](../img/zones_map_legend_desktop.png)

1. **The map**: the game's map art with the zone drawn on it. **Green** = hunting area, **red** = exclusion zones, **yellow** = pull
   routes (the label at the first point says "(tank waits here)"), **blue squares** = gatekeeper landings with their name, **white
   square** = the landing the zone uses, **gold squares** = `.town` landings, coloured dots with names = your characters that are online
   nearby. **Monster dots** are coloured against the zone's level range: grey = more than 3 levels below, green = fits, orange = up to 4
   above, red = more. A purple dot with a crown is a raid boss.
2. **Legend**: the same colours as a list.

The zone editor does not draw a zone's waypoints and round exclusions (circles); open the zone in the full-screen
[spot editor](spots.md#full-screen-spot-editor-spot) to see and edit those.
3. **Save zone**: writes the zone (see [Saving](#saving)).
4. **Delete zone**: removes the zone after a confirmation.

The points of the shape you are editing are big and draggable; the points of the other shapes are small. **Drag any point** to move it
(also a point of a shape that is not active). **Tap a point** to select it (white, with its number).

#### Exclusion mode and a selected point

![Exclusion mode with a selected point](../img/zones_mode_hole_phone.png) ![Exclusion mode with a selected point](../img/zones_mode_hole_desktop.png)

1. The selected point: white and numbered. **Delete point** removes it.

#### Pull route mode

![Pull route mode](../img/zones_mode_pull_phone.png) ![Pull route mode](../img/zones_mode_pull_desktop.png)

1. Point 1: the team waits here; the label reads "pull 1 (tank waits here)".
2. The last point: the far end of the run.

#### Adding and dragging points

![A corner added and another dragged](../img/zones_edit_points_phone.png) ![A corner added and another dragged](../img/zones_edit_points_desktop.png)

1. A corner that was dragged further out.
2. A corner that was added by tapping next to the east edge (it went into that edge, not at the end of the list).

![The summary says unsaved changes](../img/zones_info_unsaved_phone.png) ![The summary says unsaved changes](../img/zones_info_unsaved_desktop.png)

1. After any edit the summary line ends with **unsaved changes**.

#### Zoom and layers

![Zoomed in: monster levels are written next to the dots](../img/zones_zoom_phone.png) ![Zoomed in](../img/zones_zoom_desktop.png)

1. Zoomed in far enough, every monster dot shows its level. The white square is the gatekeeper landing this zone starts from; tap any
   blue square to make it the zone's start (the "Get there" fields follow).

![Both layers off](../img/zones_layers_off_phone.png) ![Both layers off](../img/zones_layers_off_desktop.png)

1. **teleport landings** off. 2. **monsters** off. Only the zone's own shapes and your characters stay on the map.

### New zone at a character

![A new zone at a character](../img/zones_new_at_phone.png) ![A new zone at a character](../img/zones_new_at_desktop.png)

1. **Character**: the character to start from.
2. **New zone at…**: opens a new, unsaved zone: a square hunting area of 4 000 x 4 000 around the character.
3. **Name**: `New zone <month-day hour:minute>`; change it before you save.
4. **Levels**: the character's level −3 to +5. The Team is the character's party.

### Saving

![Saved](../img/zones_save_ok_phone.png) ![Saved](../img/zones_save_ok_desktop.png)

1. **Save zone**.
2. The result: "saved — the bots use it on their next spot check", or the error.

What **Save zone** does:

- The page checks: a name is needed ("give the zone a name"), and the hunting area needs at least 3 points ("the hunting area needs at
  least 3 points"). Exclusions with fewer than 3 points and pull routes with fewer than 2 points are dropped.
- The server writes the zone into `Scripts/data/custom_zones.json`. A copy of the old file goes to `Scripts/data/routes/spots_history/`.
- With a drawn hunting area the server sets the zone's centre (average of the corners) and radius (farthest corner) and writes the
  outline as an L2Swarm zone map, `Settings/zones/<name>.zmap`, so L2Swarm's own combat also stays inside it.
- Fields the zone editor does not show (waypoints, round exclusions, floor, avoided monsters, party ticks and priorities) are kept.

![Save refused](../img/zones_save_err_phone.png) ![Save refused](../img/zones_save_err_desktop.png)

1. Here the hunting area was cleared with **Delete this shape**; Save answers "the hunting area needs at least 3 points" and nothing is
   written.

![Delete zone asks first](../img/zones_delete_confirm_phone.png) ![Delete zone asks first](../img/zones_delete_confirm_desktop.png)

**Delete zone** asks "Delete zone *name*?". OK removes the zone from the file (the old file is copied to `routes/spots_history/` first).

## Simple zone form and the zone table

Under the zone editor is an older, simpler way to make a **circle zone**: a centre, a radius and the basic fields. Under it, the table
lists every zone.

![The simple zone form](../img/zones_simple_form_phone.png) ![The simple zone form](../img/zones_simple_form_desktop.png)

1. **Name**: the zone's name (required). Saving with the name of an existing zone replaces that zone.
2. **X / Y / Z**: the centre (X and Y required).
3. **Radius**: default 2500. The bots hunt in a square around the centre of 3 x the radius, at least 9 000 wide.
4. **Level min / Level max**: default 1 and 85.
5. **Party**: `all` or one party.
6. **Teleport**: optional gatekeeper destination, for example `Gludio -> Ruins of Agony` (the part before `->` is the town).
7. **Take position from**: pick a character to copy its current X, Y and Z into the fields.
8. **Save zone**: saves without a confirmation. The message under the page header says "zone saved — auto-level picks it up on its
   next check".

![The zone table](../img/zones_table_phone.png) ![The zone table](../img/zones_table_desktop.png)

1. **Columns**: Zone, Levels, Party, Center / radius (x, y, z · r), Teleport. Sorted by the lowest level. The Party column
   shows the zone's single party field; it is empty (or out of date) for zones whose parties were ticked on the [Spots](spots.md) tab.
2. **Edit**: copies the zone's values into the simple form above (it does not open the zone editor; use the zone picker for that).
3. **Delete**: removes the zone after "Delete zone *name*?".

![Simple form saved](../img/zones_form_saved_phone.png) ![Simple form saved](../img/zones_form_saved_desktop.png)

1. The message line under the page header.

![Delete in the table asks first](../img/zones_table_delete_confirm_phone.png) ![Delete in the table asks first](../img/zones_table_delete_confirm_desktop.png)

> **Warning:** the simple form only knows circles. Saving a zone that has a drawn hunting area through the simple form (Edit, then Save
> zone) **removes its drawn hunting area, its exclusion zones and its pull routes**, and resets "Get there" to the Teleport text. Use the
> zone editor or the spot editor for drawn zones.

## How to ...

**Draw a new hunting zone around a party that is hunting now**

1. Pick the party leader in the character list next to **New zone at…** and press **New zone at…**.
2. Change the **Name**, the **Levels** and, if needed, **Kind**.
3. With **Hunting area** on, drag the 4 corners to the edge of the area you want, and tap next to an edge to add corners where the
   outline must bend.
4. Tap the blue square of the gatekeeper landing the team should use (or choose **.town and walk** and a town).
5. Press **Save zone**. The leader uses the zone at his next spot check if it fits his party.

**Keep the team away from a dangerous corner**

1. Open the zone in the zone picker.
2. Press **+ new exclusion** and tap around the dangerous place (at least 3 points).
3. Press **Save zone**.

**Add a pull route**

1. Open the zone, press **+ new pull route**.
2. Tap the waiting point first (where the team stands), then the points the tank should run along.
3. Press **Save zone**.

**Delete a single point**: tap it (it turns white), then **Delete point**.

## Notes and safety

- Every save and delete on this tab is **live** for the bots (no deploy). Only **Delete zone** asks for confirmation; Save zone and the
  simple form's Save do not.
- Backups: every save or delete through the zone editor or the simple form copies the whole file to `Scripts/data/routes/spots_history/`.
- A drawn hunting area becomes `Settings/zones/<name>.zmap` too; deleting a zone does not delete that file.
- Who may use a zone and in which order is easier to set on the [Spots](spots.md) tab. Waypoints from the landing to the area, round
  exclusions, a tower floor and monsters to avoid are only in the [spot editor](spots.md#full-screen-spot-editor-spot).
- What the bots do inside a zone: the leader only takes monsters inside the hunting area and outside every exclusion zone (and any
  monster that attacks the team). With a pull route the leader (only a party leader in a party, not a solo character) runs the route,
  tags up to 4 monsters at each point, turns back below 50 % HP and brings them to the waiting team; melee damage dealers switch to a
  polearm from their bag for the pack if they carry one.
- A plain circle zone (no drawn area, no pull route, no waypoints) is hunted as the generated **field areas** inside its square,
  rotating between the free ones that fit; see [field areas](shape-editor.md#field-areas).
