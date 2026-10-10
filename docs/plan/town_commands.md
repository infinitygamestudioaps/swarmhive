# L2Toggle `.townname` teleports (tested live 2026-10-03 on Spoiler1)

Free and instant. Type it in normal chat (from a script: `Send.Say2(0, '.giran', '', true)`).
Server text: "Usage: .townname - Teleports you and your party to the specified town. Cannot be used while in combat, with karma,
PvP flag, or during siege." With "Follow Party Leader's .town: On" (all 12 characters), the party follows when the **party leader**
uses it, if everyone is within range and nobody is in combat (forum topic 57).

| Command | Lands at (x, y, z) | Nearby for raid bosses / leveling |
|---|---|---|
| `.gludin` | -80786, 150251, -3040 | Gludin: Windmill Hill, Fellmere, Orc Barracks (via GK) |
| `.gludio` | -12712, 122776, -3120 | Gludio: Ruins of Agony/Despair, Ant Nest, Windawood |
| `.dion` | 15619, 143132, -2720 | Dion: Cruma Tower, Floran, Execution Grounds |
| `.giran` | 83473, 148554, -3408 | Giran: Dragon Valley, Antharas Lair, Breka's Stronghold |
| `.oren` | 82760, 53578, -1488 | Oren: Ivory Tower, Plains of Lizardmen, Sea of Spores |
| `.aden` | 147448, 25816, -2016 | Aden: Blazing Swamp, Forest of Mirrors, Fields of Massacre |
| `.hunters` | 116589, 76268, -2736 | Hunters Village: Enchanted Valley, Forest of Mirrors |
| `.heine` | 111381, 218981, -3536 | Heine: Garden of Eva, Field of Silence/Whispers, Alligator Island |
| `.goddard` | 147732, -56554, -2784 | Goddard: Varka Silenos, Hot Springs, Forge of the Gods |
| `.rune` | 43759, -48122, -800 | Rune: Swamp of Screams, Beast Farm, Valley of Saints |
| `.schuttgart` | 87355, -142095, -1344 | Schuttgart: Den of Evil, Crypts of Disgrace, Frozen Labyrinth |

**No command** ("Command not found"): `.floran`, `.talkingisland`/`.ti`, `.elven`/`.elf`, `.darkelven`/`.darkelf`, `.orc`, `.dwarven`/`.dwarf`,
`.kamael`, `.hunter`, `.innadril`, `.stronghold`, `.keucereus`, `.gracia`, `.primeval`, `.runetownship`.
For those villages: `.` the nearest town above, then a gatekeeper. `.hellbound` is a different command (shows Hellbound confidence).

Raid-boss farming: `.<town>` → gatekeeper → the boss's nearest teleport (Dashboard "Raid bosses" lists the teleport + walk distance).
In swarm.js: `TOWN_CMD` + `townCommand(why, wantTown)`.
