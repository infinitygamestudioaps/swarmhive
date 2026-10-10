# Daily dungeons, instances and labyrinths (High Five / L2Toggle)

Data: `Scripts/data/dungeons_h5.json`. Generator: `docs/plan/tools/dungeons.js`.
Sources:
- From the L2J High Five datapack: instance Java code and `data/instances/*.xml`, quests 128/129/179, multisell 324840001, and boss drops from the npc stats.
- Marked *(knowledge)*: retail High Five facts that this datapack doesn't contain.

**Verify everything on L2Toggle before relying on it.**

## Two rules that matter for our scripts
1. **Kamaloka, Nornil's Garden, Monastery and the Seeds remove ALL buffs when you enter.** Only the newbie-guide buffs survive, so the Community Board buffs are gone. After entering, every character must either rebuff from the board (test whether the board works inside an instance), or the healers/Chanter1 buff by hand. `swarm.js` must call `buffSelf()` right after the teleport into the instance.
2. **Only the party leader can start most instances.** The rule is "leader talks to the NPC, the whole party is teleported", so only Tank1 needs to click the dialog. Kamaloka's bypass is `Quest Kamaloka <index>` from the captain's dialog (index table below).

## Kamaloka: the main daily dungeon from 18 to 85
- **Entry:** any member may be up to **±5 levels** from the Kamaloka's level. Each Kamaloka can be done **once per day**; they reset at 06:30 server time.
- **Two kinds:**
  - **Hall of the Abyss:** max **6**, 30 min.
  - **Labyrinth of the Abyss:** max **9**, 45 min. This is our full team.
- **Daily loop:** different Kamalokas have separate locks. In a day, the team can do every one within ±5 of its level (for example the 23, 26 and 29 at level 24–28).
- **Rewards:**
  - The boss drops below.
  - The Labyrinth's end gives **Essence of Kamaloka** (13002), more for a better party rank *(knowledge)*.
  - The **Pathfinder Worker** in Gludio (-13948, 123819), Dion (18228, 146030) and the other towns exchanges Essence: 10 → D box, 20 → C, 50 → B, 100 → A, 200 → S, 300 → Bronze/Silver/Gold Kamaloka Circlet.

| Level | Type (max party) | Captain, town | Bypass | Boss (level) | Notable drops |
|---|---|---|---|---|---|
| 23 | Hall (6) | Bathis, **Gludio** (-13900, 123822) | `Quest Kamaloka 0` | Tomlan Kamos 23 | Enchant Weapon/Armor D, Bronze/Bone armor |
| 26 | Hall (6) | Bathis, Gludio | `Quest Kamaloka 1` | Ol Ariosh 26 | Cursed Tunic/Stockings, Enchant D |
| 29 | **Labyrinth (9)** | Bathis, Gludio | `Quest Kamaloka 2` | Lost Captain 29 (raid) | Blessed Enchant Armor D ×3–9, Manticore Skin Shirt, Reinforced Long Bow |
| 33 | Hall (6) | Lucas, **Dion** (18199, 146081) | `Quest Kamaloka 3` | Crimson Hatu Otis 33 | Reinforced Leather / Knowledge gloves+boots |
| 36 | Hall (6) | Lucas, Dion | `Quest Kamaloka 4` | Seer Flouros 36 | Hoplon, Helmet |
| 39 | **Labyrinth (9)** | Lucas, Dion | `Quest Kamaloka 5` | Lost Captain 39 | **Karmian Tunic (casting-speed set)**, Flamberge/Stormbringer, Blessed Enchant Armor C |
| 43 | Hall (6) | Gosta, **Heine** (108384, 221563) | `Quest Kamaloka 6` | Blade Otis 43 | Plate Gaiters, Half Plate, Enchant C |
| 46 | Hall (6) | Gosta, Heine | `Quest Kamaloka 7` | Weird Bunei 46 | Crystallized Ice Bow, Enchant C |
| 49 | **Labyrinth (9)** | Gosta, Heine | `Quest Kamaloka 8` | Lost Captain 49 | Nassen's Earring, Seal jewels, Blessed Enchant Weapon C |
| 53 | Hall (6) | Mouen, **Oren** (81023, 56456) | `Quest Kamaloka 9` | Kaim Abigore 53 | Great Pata, Enchant B |
| 56 | Hall (6) | Mouen, Oren | `Quest Kamaloka 10` | Knight Montagnar 56 | Zubei's/Avadon armor parts |
| 59 | **Labyrinth (9)** | Mouen, Oren | `Quest Kamaloka 11` | Lost Captain 59 | Black Ore jewels, Blessed Enchant Armor B |
| 63 | Hall (6) | Vishotsky, **Schuttgart** (85865, -142153) | `Quest Kamaloka 12` | Venomous Storace 63 | Blue Wolf / Doom patterns, Enchant Armor A |
| 66 | Hall (6) | Vishotsky, Schuttgart | `Quest Kamaloka 13` | Kel Bilette 66 | Sealed Doom/Blue Wolf boots+gloves |
| 69 | **Labyrinth (9)** | Vishotsky, Schuttgart | `Quest Kamaloka 14` | Lost Captain 69 | Soul Bow, Sealed Nightmare/Majestic robe, Blessed Enchant Weapon A |
| 73 | Hall (6) | Mathias, **Rune** (42596, -47988) | `Quest Kamaloka 15` | White Allosce 73 | Sealed Phoenix jewels |
| 78 | **Labyrinth (9)** | Mathias, Rune | `Quest Kamaloka 16` | Lost Captain 78 | Sealed Draconic Leather Armor, Draconic Bow, Enchant Armor S |
| 81 | **Labyrinth (9)** | Mathias, Rune | `Quest Kamaloka 17` | Lost Captain 81 | Demon Splinter, Imperial Crusader shield/helmet, Enchant Armor S |
| 83 | **Labyrinth (9)** | Mathias, Rune | `Quest Kamaloka 18` | Lost Captain 83 | **Icarus Trident (100%)**, Sealed Moirai jewels |

With 9 members, a **Hall** (max 6) needs a 6 + 3 split: the 3 extra do another Hall, farm, or wait. The **Labyrinths are the 9-man runs**.

## Other instances and dungeons
| Dungeon | Level | Party | Lock | Entry | Why |
|---|---|---|---|---|---|
| **Nornil's Garden** | 18–22 | 2–9, leader enters, **party must contain a Kamael** | no daily lock | Garden Guard (32330) at (-84728, 60089), Kamael lands | Kamael quest 179 (needs 178, level 17–21, no class change yet): Puma Skin Shirt + Gaiters, 2 Red Crescent Earrings, 2 Rings and a Necklace of Devotion **for Doombringer1 and Inspector1**. Buffs removed. |
| **Pailaka 128, Song of Ice and Fire** | 36–42 | **solo** | one-time | Inspector Adler, **Gludin** (-80570, 151298) | 810k exp + **Pailaka Ring + Earring** for every character |
| **Pailaka 129, Devil's Legacy** | 61–67 | **solo** | one-time | Devil's Isle Survivor, **Giran** (85104, 147616) | 10.8M exp + **Pailaka Bracelet** |
| Pailaka 144, Injured Dragon *(knowledge, not in datapack)* | 73–77 | solo | one-time | Ketra/Varka border | big exp + Pailaka Shirt |
| **Dimensional Rift** *(knowledge)* | 20+ in rooms: 20–29, 30–39, 40–49, 50–59, 60–69, 70+ | 2–9 | unlimited, paid | Oracle (Seven Signs) → rift | Group exp. Costs **Dimensional Fragments** (7079) per member: 18/21/24/27/30/33. Fragments drop for quest 634 from every monster level 20+, so take 634 at 20. |
| **Seven Signs catacombs & necropolises** *(knowledge)* | 20–80 (see list) | any | open | Gatekeeper Ziggurat at each entrance; register Dawn/Dusk with a town priest (free) | Very dense mobs. **Seal Stones → Ancient Adena → Mammon merchants: SA crystals, Life Stones, weapon upgrades.** |
| Crystal Caverns (Baylor) | 78+ | 2–27 | 24 h | Hellbound/Seed area | Soul Crystal stages, crystals |
| Dark Cloud Mansion | 78+ | party | per entry | | Puzzle; part of the Crystal Caverns chain |
| Hall of Suffering (Seed of Infinity) | 75+ | 2–9 | daily 06:30 | Seed of Infinity | Exp, Soul Crystal stages |
| Chambers of Delusion (6 kinds) | **80+** | 2–9 | daily 06:30 | Delusion hall via the Dimensional Rift gatekeepers | Aenkinel raid + boxes: Enria, Asofe, Thons, Leonard (A/S craft materials) |
| Seed of Destruction | 75+ | **18+ (command channel)** | Wed + Sat | | Too big for 9 |
| Monastery of Silence, Den of Evil, Forge of the Gods, Primeval Isle | 76–85 | any | open field | | Best open-world exp at 80+ |

Catacomb and necropolis levels:
- Necropolis of Sacrifice: 20–30
- Catacomb of the Heretic: 30–40
- 40–50: Pilgrim's Necropolis, Catacomb of the Branded
- 50–60: Necropolis of Worship, Catacomb of Apostate
- 60–70: Patriot's Necropolis, Catacomb of the Witch
- 70–80: Devotion, Martyrdom, Saint's, Disciple's, Dark Omens, Forbidden Path

## Daily schedule for our 9-man team
Times are rough, for 9 characters. "Daily" means after the 06:30 reset.

**1–20**
- Hunt the Wasteland, then do the 1st-class quests at 17–19 (see `routes/first_class_team.md`).
- **At 18–19:** one **Nornil's Garden** run. The party must contain a Kamael (Doombringer1 or Inspector1), all members 18–22. That's about 70 min, and Doombringer1 and Inspector1 finish Kamael quest 179 for a free set of jewelry and light armor.
- **At 18+:** the **Kamaloka 23 Hall** (Gludio, Bathis) becomes available (23 − 5 = 18). Take 6 members; the other 3 hunt or do their class quest. About 30 min.

**20–30, daily (about 2 h)**
1. Kamaloka 23 Hall (6 of us), until we pass 28.
2. Kamaloka 26 Hall (the other 6), from 21.
3. **Kamaloka 29 Labyrinth with all 9**, from 24. It gives Essence of Kamaloka and the Lost Captain raid.
4. The rest of the day: **Necropolis of Sacrifice** (Seal Stones) or the Forgotten Temple / Orc Barracks spots. Keep quest 634 running for Dimensional Fragments.
5. When everyone has 18 fragments: **Recruit Dimensional Rift** runs for exp.

**30–40, daily (about 2.5 h)**
1. Kamaloka 33 / 36 Halls (Dion, Lucas), split 6 + 3.
2. **Kamaloka 39 Labyrinth with all 9.** It can drop the Karmian Tunic, the casting-speed set for our 4 casters.
3. **Catacomb of the Heretic** for Seal Stones, then Ancient Adena.
4. Soldier rift with fragments.
5. **At 36–42, each character solos Pailaka 128 once** (Inspector Adler, Gludin, about 60 min each): ring + earring + 810k exp. Run it while the others farm. Only one character can be in its own Pailaka at a time; nine separate solo instances can run in parallel.

**40–52**
- Kamaloka 43/46 Halls and **49 Labyrinth** (Heine, Gosta).
- Pilgrim's Necropolis / Catacomb of the Branded.
- Officer rift.
- Collect Ancient Adena for **SA crystals** before C/B-grade weapons.

**52–61**
- Kamaloka 53/56 Halls and **59 Labyrinth** (Oren, Mouen).
- Necropolis of Worship / Catacomb of Apostate.
- Captain rift.

**61–76**
- Kamaloka 63/66 Halls and **69 Labyrinth** (Schuttgart), then 73 Hall (Rune).
- Patriot's Necropolis / Catacomb of the Witch.
- Commander rift.
- **Each character solos Pailaka 129 once at 61–67** (Giran): 10.8M exp + bracelet.
- Pailaka 144 at 73–77.

**76–85**
- Kamaloka **78 / 81 / 83 Labyrinths** (Rune). The 83's boss drops the Icarus Trident 100% of the time.
- **Chambers of Delusion** at 80+, daily.
- Hall of Suffering.
- Crystal Caverns.
- Hero rift.
- Fields: Monastery, Den of Evil, Forge of the Gods, Primeval Isle.

## What our scripts need for instances
- **Entering:** the leader walks to the captain or guard, opens the dialog (`openNpc`), and sends the bypass (`Quest Kamaloka <i>`, or the dialog link for the others). The whole party is teleported; followers detect it with `OnTeleportToLocation`. The existing gatekeeper code (`gkTeleport` with `wanted.cmd`) already handles "send this bypass".
- **After entering:** rebuff (the buffs were removed), then farm with `StartCombat` inside the instance. Kamaloka ends when the boss dies, then a 5-minute eject timer runs; the Labyrinth also has an exit gatekeeper (32496).
- **Lock tracking:** keep a per-character "done today" list (Kamaloka index → date), so the daily loop skips finished ones. The server answers "C1 may not re-enter yet" if we try.
- **Pailaka:** one character at a time per instance, but every character can run its own in parallel. It's a solo quest script (talk → kill → use items), so it needs a quest runner much like the class quests.
- **Not scriptable by us:** the Seed of Destruction and the Antharas/Valakas/Baium raids need 18–45+ players.

## Kamaloka strategies per dungeon (l2scroll guide, read 2026-10-07)
Source: https://www.l2scroll.com/2016/01/guide-kamaloka.html. The guide names the Hall bosses by look; matched by level to the H5 names above.
The bot uses this as `KAMA_TACTICS` in swarm.js (`instanceFight`). Default for every Kamaloka: escorts/minions before the boss, anything
hitting a healer or caster first, archers early; the tank pulls one group at a time; healers keep 450+ away and only heal.

| Lvl | Boss (H5 name / guide name) | What it does | Tactic (bot setting) |
|---|---|---|---|
| 23 | Tomlan Kamos / Bugbear | AoE stun, weak damage | just fight (2 melee can duo it) |
| 26 | Ol Ariosh / Ol Mahum | summons ONE melee minion; AoE hit (no pets close) | the tank keeps the minion, everyone else on the boss (`bossFirst`) |
| 33 | Crimson Hatu Otis / Undead Bear | stationary AoE smash x5; Haste at 10 % HP | step ~550 away while it casts (`dodgeCast`), then back |
| 36 | Seer Flouros / Floating Eye | endless minions; Aura Flare, Drain Health | kill every minion at once (5 at a time kill you); tank on a polearm (`tankPole`) |
| 43 | Blade Otis / Mutant Stakato | below 50 % summons a healer that heals it a lot | kill (or keep sleeping) the healer first |
| 46 | Weird Bunei / Dragon | Soul Confine on one player (~10 s) | nothing to do, keep the damage up |
| 53 | Kaim Abigore / Demon | disarms the top damage dealer; Sonic Blaster on casters; suicide-bomb adds | weapon back on at once (`reequip`); keep HP near full |
| 56 | Knight Montagnar / Undead Knight | endless Dark Panthers chase one player | needs 3+; the chased one runs, everyone else on the boss (`bossFirst`) |
| 63 | Venomous Storace / Demon | one minion that heals the boss | kill the minion first |
| 66 | Kel Bilette / Angel | one helping minion; AoE damage + AoE fear | kill the minion first |
| 73 | White Allosce / Eye | eyeball minions with a 2 s AoE petrify; Wind Shackle, Ice Bolt | kill the eyeballs first |
| 76-83 | — | the guide has no details ("infos soon") | default tactic |

**Labyrinths of the Abyss (29/39/49/59/69/78/81/83, Lost Captain), 2-9 players, 45 min:** four rooms.
1. Room 1: 9 monsters, only ONE is real (the "queen"); killing it stops the fakes and takes 1/3 of the Labyrinth Guard's P.Def.
2. Room 2: all real; clearing it takes 1/3 of the Guard's M.Def.
3. Room 3: one strong monster, a raid boss; killing it takes 1/3 of the Guard's attack.
4. Room 4: Labyrinth Guard + 2 warriors + 2 healers/buffers (Lost Assistant Guard): **kill the healers first** (`firstRe: /Assistant/`), then the warriors, then the Guard.

**General (guide):** Halls 2-6 players, 30 min; Labyrinths 2-9, 45 min; every member within ±5 levels of the instance; the leader enters at the
Guard Captain; daily reset 06:30; buffs from outside are removed (the Community Board works inside); a failed try can be retried after leaving
(the boss is back at full HP); time warnings at 10/5/2/1 min and 30 s.
