# Dispatch: send a party or a character anywhere

`Dispatch` tab (`#/dispatch`).

1. **Who goes?** 👥 a party (its leader takes everyone) or 🧍 one character. One character can **sneak**: Silent Move near monsters, no
   fighting, back to town below 40 % HP. A party member sent alone is *benched* first (its party carries on without it; switch it on again on
   its character page).
2. **Where to?** Big buttons for the epics (Baium — to the Angelic Vortex door, Klein for Valakas, Valakas, Antharas, Core, Queen Ant,
   Orfen, Zaken, Frintezza, Primeval Isle for Sailren, Cabrio), or search every place the bots know: 👹 raid bosses, 🐉 epics, 🧙 NPCs,
   🌲 hunting areas, 🚪 dungeon rooms, 🏰 dungeons — or 📍 a point on the map (x, y). Each place shows its route
   (✓ ok · ⚠ with a condition · ? not checked yet · ✗ blocked) and whether **we** got there the last time.
3. **The tour**: add as many stops as you like (max 40) and order them. *Add all shown* builds a tour to check many routes at once.
   *Keep going when one fails* · *Go into an epic boss zone when the entry item is in the bag* (otherwise it stops at the door).
4. **🧭 Go** — the page shows every stop live: ✓ / ✗, how it got there and how long it took.

**How it gets there.** First the route the bots know (the computed path, or your own saved route for that place); it fixes stuck spots,
doors and teleports while it walks. When that route fails, it tries another way (teleport closer, then walk with the path finder) and
**records** that walk. When the other way arrives, the walk is saved as the place's **learned route** (🧠) and used from then on — a route you
locked in the route editor is never overwritten. The party waits at the last stop; **Start** on the party card carries on.
