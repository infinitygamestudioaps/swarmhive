# 3D view

Open any character page and tap **3D view**. You see the ground around that character, built live from the game's own data:

- **The ground and walls** come from the geodata. Hills and cliffs have their real shape; in dungeons (catacombs, necropolises, Cruma Tower, Tower of Insolence) only the floor the character stands on is drawn, with its walls.
- **The map picture** of the area lies on the ground.
- **Characters and monsters** move live (about once a second). Blue = your party, grey = other characters, red = aggressive monsters, pink = other monsters, gold = raid bosses, green = NPCs.
- **Lines**: red from a character to its target, yellow dashed for its walking route.
- **Effects**: a coloured ring while casting (green heals, blue buffs, orange attacks) with the skill name, a red flash on a big hit, a red cross where someone died, a green ring when raised, an orange marker when someone dropped off a ledge.
- **Events** appear in the corner; tap one and the camera flies there.
- **Replay 10 min** plays back the last 10 minutes (from when the dashboard started).

## Moving a character

Tap the ground: **Walk <name> here** or **Walk the whole party here**. It always asks first. The character (or party) walks there and waits for your next order.

## Game models

Monsters and NPCs close to the camera can be shown with their **real game models and animations** (idle, run, attack, death). They are taken from **your own Lineage 2 client** and converted on your PC the first time a monster is seen; they are kept in `Dashboard\l2cache\` and are never shared or uploaded.

The conversion uses **UE Viewer** (free, by Gildor). If it is not installed yet, the 3D view tells you; the dashboard can download it once from its author's site (gildor.org) into `tools\umodel\` in your swarm folder. Your client is found through `"l2Client"` in `swarm.config.json`; to use another UE Viewer, set `"umodel": "C:\path\to\umodel.exe"`.

Characters still show as simple figures; buildings and dungeon models come later.
