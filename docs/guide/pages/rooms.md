# Rooms (`#/rooms`)

Inside a dungeon the bots do not hunt "somewhere in the dungeon": they hunt in one **room**. The **Rooms** tab shows every dungeon, its
floors and its rooms, and lets you draw the **walk-in route** for a room: the points the party leader walks, in straight lines, from the
place where he arrives on the floor (the **floor entry**) to the room. Without a route of yours he uses the **computed route** (found
with the geodata). From here you also open a room's outline in the [shape editor](shape-editor.md).

**Dungeons, floors and rooms** (data file `Scripts/data/dungeon_rooms.json`, made by the tools in `docs/plan/tools`, about 30 dungeons and
900 rooms, including the catacombs and necropolises):

- A **floor** is a height band of a dungeon (Cruma Tower 1st, 2nd, 3rd floor; Tower of Insolence 1st to 12th floor; one floor "Inside" for
  a catacomb). Floors are reached on foot or with a teleporter NPC in the dungeon; the leader takes the party there by himself.
- A **room** is a group of monster spawns close together, with an outline found from the geodata (walls and doorways), its monster levels,
  the party levels it suits, its monsters, and the **side** (left / right / straight / behind) as seen from the floor entry.
- A floor has **safe spots** (green shields on the maps): places in the corridors away from every room and every aggressive monster,
  used when a character has to get away from a fight.
- Caves mapped room by room from the geodata: **Devil's Isle Caves** (Heine, levels 43-54) and **Forgotten Temple** (Gludin gatekeeper
  → "Forgotten Temple", 2000 adena, then walk down the ramp south of the landing; upper temple and lower water halls, levels 27-35, every
  monster aggressive; raid bosses Unrequited Kael 24 and Tirak 28 inside).

**How rooms are used:** a party hunts in rooms when its spot is a "rooms" spot (see [Spots](spots.md#add-a-dungeon-spot)) or when you
chose a room (or several) for the party on the [Parties](parties.md) tab. The leader takes the party to the floor, walks your saved points
in straight hops (if a hop fails he stops following them), then walks to the room centre and hunts only inside the room outline.
swarm.js reads a room's saved route every time it walks into that room, so **a saved route is used from the next walk in, no deploy**.

## Pick a dungeon, floor and room

![Rooms tab on a phone](../img/rooms_overview_phone.png) ![Rooms tab on a desktop](../img/rooms_overview_desktop.png)

1. **Dungeon**: every dungeon with its monster level range.
2. **Floor**: the floors of that dungeon with their level ranges.
3. **Room**: the rooms of that floor, with their monster levels. A **✓** in front of a room means it has a saved route.
4. **✎ Edit this room's outline**: opens the room in the [shape editor](shape-editor.md) (drag its corners on the floor map, move it, set
   its levels and centre).
5. **Room facts**: the room's name, side, monster levels, the party levels it suits, **✓ saved route** or **computed route only**, and
   (in grey) its monsters with levels.
6. **Entry, floor height, saved route**: how the floor is entered (for example "teleporter via *NPC* → x, y, z"), the floor's height
   band, and "**Saved:** N points, *date*" or "none". A note about the room follows when there is one.

## The map

![The walk-in route on the floor map](../img/rooms_map_phone.png) ![The walk-in route on the floor map](../img/rooms_map_desktop.png)

1. **Zoom +** and 2. **Zoom −**. The mouse wheel zooms around the pointer.
3. **Fit**: the whole route, the room and the floor entry.
4. **Start from the computed route**: copies the computed route into your point list (asks first if you already have points).
5. **Floor entry = point 1**: puts the floor entry in front of your points (only shown when the floor entry is known).
6. **The floor map**: the map art of that floor (towers and caves use the picture of the right level). On it: the **room** in red with
   its name, the other rooms of the floor faint blue with their short ids, **safe spots** as green shields, the **floor entry** as a blue
   square, the **computed route** as a dashed grey line, **your points** as a yellow line with numbered dots (the selected one red), and
   your characters on that floor.
7. **Legend**, with the controls: tap = new point after the selected one · drag a point = move it · drag the map = pan · wheel = zoom.

The line above the buttons says how many points you have, the length of the walk and **unsaved changes** after an edit.

## Points, Save and the point table

![Character position, Save, the point table](../img/rooms_points_phone.png) ![Character position, Save, the point table](../img/rooms_points_desktop.png)

1. **Character**: every character that reported in the last 2 minutes.
2. **Add its position**: inserts that character's position (x, y, z) after the selected point. Walk a character to a good spot in game,
   then press it.
3. **Save**: saves the points (at least 2).
4. **Delete saved route**: removes the saved route after a confirmation; the leader then uses the computed one. Only shown when a route
   is saved.
5. **Undo changes**: drops your edits and loads the saved route again (no confirmation).
6. **x / y / z**: type a number to change a point.
7. **↑ / ↓ / ✕**: move a point earlier or later in the list, or delete it. Tap a row (not a box) to select that point; the selected row is
   highlighted and new points are added after it.
8. **Paste coordinates**: opens the paste box.

The **step** column shows the distance from the previous point ("start" for the first).

### Paste coordinates

![Paste coordinates](../img/rooms_paste_phone.png) ![Paste coordinates](../img/rooms_paste_desktop.png)

1. One point per line: `x y z`, or a line copied from the game's `/loc` output. Every line with three numbers becomes a point.
2. **Add after the selected point**. Without any usable line you get "No x y z found".

## A room without a saved route

![A room without a saved route](../img/rooms_no_route_phone.png) ![A room without a saved route](../img/rooms_no_route_desktop.png)

1. **computed route only**.
2. "No saved route: the leader uses the computed one (grey). Tap the map to add points, or start from the computed route."

## Editing, step by step pictures

![A point added by tapping the map](../img/rooms_add_point_phone.png) ![A point added by tapping the map](../img/rooms_add_point_desktop.png)

1. "added point 9": a tap on the map adds a point after the selected one, at the floor's middle height.
2. The count line now says **unsaved changes**.

![Switching rooms with unsaved changes](../img/rooms_drop_confirm_phone.png) ![Switching rooms with unsaved changes](../img/rooms_drop_confirm_desktop.png)

Picking another dungeon, floor or room with unsaved points asks "Drop the unsaved changes of *room id*?". Cancel keeps you on the room.

![Start from the computed route asks first](../img/rooms_copy_confirm_phone.png) ![Start from the computed route](../img/rooms_copy_confirm_desktop.png)

"Replace your N points with the computed route (M points)?"

![Route saved](../img/rooms_save_ok_phone.png) ![Route saved](../img/rooms_save_ok_desktop.png)

1. **saved ✓**. The room now has a ✓ in the room list.

![Save with fewer than 2 points](../img/rooms_save_err_phone.png) ![Save with fewer than 2 points](../img/rooms_save_err_desktop.png)

"A route needs at least 2 points". Errors from the server (for example an unknown room) appear the same way.

![Delete saved route asks first](../img/rooms_delete_confirm_phone.png) ![Delete saved route](../img/rooms_delete_confirm_desktop.png)

"Delete the saved route for *room*? The leader then uses the computed one."

## How to ...

**Draw a walk-in route for a room**

1. Pick the dungeon, floor and room.
2. Press **Floor entry = point 1** (or **Start from the computed route** to start from the computed line and fix it).
3. Tap the map along the corridors to the room. Each tap adds a point after the selected (red) one. Keep the legs straight through open
   corridor: the leader walks them in straight lines.
4. Drag points to fine-tune; use ↑ / ↓ / ✕ in the table.
5. Press **Save**.

**Record a route by walking a character there in game**: put the character at each corner of the way and press **Add its position**
each time (or paste `/loc` lines into **Paste coordinates**).

## Notes and safety

- Files: `Scripts/data/routes/rooms/<room id>.json` (`{ id, dungeon, floor, room, points: [{x, y, z}], by, updated }`). Every save or delete
  first copies the old file to `Scripts/data/routes/rooms/history/`.
- Confirmations: Delete saved route, Start from the computed route (when you have points), switching rooms with unsaved changes. Save
  and Undo changes do not ask.
- A new point gets the floor's middle height. Points you add from a character or paste keep their own z; a point saved without a z gets
  the room centre's height.
- To change a room's **outline**, levels or centre, use **✎ Edit this room's outline** ([shape editor](shape-editor.md)). The walk-in route
  always ends at the room centre, so after moving a room far, draw its route again.
- Which room a party hunts in is chosen on the [Parties](parties.md) tab (one room, several rooms in rotation, or any free room).
