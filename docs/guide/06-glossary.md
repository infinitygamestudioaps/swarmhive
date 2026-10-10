# Glossary

Lineage 2 words and the words this system uses, in plain English, A to Z. Where a word belongs to one dashboard page, the entry links there.

---

**A (aggressive monster)** - A monster that attacks you on sight. The game server shows it with an "A" in the monster's title, for example
"LvL: 17 A". Passive monsters only fight back. The bots only count aggressive monsters (or one that is hitting them) as a danger, for example
before a teleport. The **aggro range** is how close you can come before an aggressive monster attacks.

**Adena** - The game's money. Members keep a small amount (2M below level 40, 2.5M at 40-75, 3M at 76+); the rest can be collected to the
party leader with `!collect`.

**Aggro** - Who a monster is angry at. The **tank** pulls aggro onto himself with skills such as Aggression and Aura of Hate, so the monster
hits him and not the healers.

**Alt+B** - The key that opens the **Community Board** in the game client. The bots open the same board without a client.

**Ancient Adena, Seal Stones** - What the monsters in catacombs and necropolises drop instead of adena (see **Seven Signs**).

**Appearing packet** - A short message the game client sends to the server after a teleport or login ("I am here now"). Without it the
character sees no monsters, NPCs or players and cannot move. L2Swarm does not always send it, so `swarm.js` sends it after every teleport, at
start and whenever a character sees nothing at all. A frozen character is often fixed by this.

**Area (field area)** - A piece of an outdoor hunting ground, drawn on the map with its own outline, monster list and level range. A party
can hunt in one area or move between several. See [Spots](pages/spots.md) and the [Shape editor](pages/shape-editor.md).

**Assist (FollowAtk)** - L2Swarm's setting that makes a member attack whatever the character it follows is attacking. Members assist their
leader; that is how a party fights together.

**Bishop** - A human healer class. In this system every healer role (bishop, shillien saint, elder ...) only heals, never attacks.

**Board buffs** - Free buffs from the server's Community Board (Alt+B -> Buffs -> a scheme such as Warrior, Defender or Mystic -> Buff Me).
They last 12 hours and are lost when the character dies. The bots rebuff themselves one at a time; `!buff` forces a round.

**BSS (Blessed Spiritshot)** - See **Shots**.

**Busy** - In confirmations: a character that is doing something right now (leveling, a trip, a raid). A new order replaces what it is doing,
so the dashboard lists who is busy before you send.

**Cabinet settings** - A page of per-character switches on the server's Community Board (Alt+B -> Cabinet -> Settings). The important ones:
- **Follow Party Leader's Dialog** - when the leader clicks a gatekeeper teleport, the server teleports the whole party with him (only party
  members close to the leader, out of combat, without karma or PvP flag).
- **Follow Party Leader's .town** - the same for the `.townname` command.
- **Follow Party Leader's Dead to Village** - when the leader is sent to town after death, the party goes too.
- **Forward Drop to Party Leader** - every drop goes to the party leader (he sells and shares).
- **Quick Trade / skip confirmations** (Master Account, Party, Same IP) - trades inside the team open without the extra "accept?" step.
The bots change these with `!cabinet <setting> on|off`.

**Catacomb, Necropolis** - Underground dungeons of the **Seven Signs**. You enter through a **Ziggurat** (a talking blue globe) after you
signed up with a side. Most monsters are aggressive and packed close together. `!dungeon <name>` makes a party level inside one.

**CC (crowd control)** - Skills that stop a monster from fighting for a while: sleep, root, stun, fear, silence.

**CC (Command Channel)** - In a joint raid: several parties joined under one channel leader.

**Character page** - The dashboard page of one character (`#/char/<name>`). See [Character page](pages/character.md).

**Claim (spot claim), occupied** - When a party leader picks a hunting spot, he writes a claim for it. Another of our parties that wants the
same spot sees the claim and picks a different one. "Occupied" means other players (not ours) hunt there; the leader then leaves the spot and
tries it again later. The Parties tab shows both.

**Clan leader** - The character that owns the clan. A few commands (`!clanlevel`, `!clanquest`, `!siegereg` ...) are only carried out by his
window.

**Class change levels** - The levels where a character can take its next class: **20** (1st class), **40** (2nd class) and **76** (3rd
class). On this server the change is free on the Community Board (Alt+B -> Career -> Professions); `!classchange` does it for everyone whose
level allows it.

**Command center** - The search field at the top of the dashboard: find a character, party, page or command and send an order. See
[Command center](pages/command-center.md).

**Common Items** - Shop items with the same stats as the real armor or weapon for about 1/20 of the price, but without set bonus and they
cannot be enchanted on this server. Fighters buy Common Items; casters and healers buy the real sets.

**Community Board** - The server's in-game web page (Alt+B): buffs, class change, Cabinet settings and more.

**Confirm / destructive** - The two levels of asking before an order is sent. Every order asks once; a **destructive** one (such as
`/unstuck`, `/leave`, enchanting, restarting L2Swarm) also asks you to type `YES`.

**CP / HP / MP** - Combat Points (an extra bar that is lost first in PvP), Hit Points (life) and Mana Points (for skills). The dashboard
shows them as bars and percentages.

**Crafter** - The dwarf of the spoil and craft party (Artisan -> Warsmith). He crafts and keeps a golem summoned.

**Dagger** - A fast melee class that hits from behind (here: the solo clan leader).

**Dawn / Dusk** - The two sides of the **Seven Signs**. Every character here signs up with **Dawn** (Priest of Dawn), never Dusk.

**Deploy** - Copying the development copy of the script (`Scripts_dev/swarm.js`) to the live copy (`Scripts/swarm.js`). L2Swarm then
reloads the script in every window. Each reload costs memory, so deploys are rare and spaced out (PC tab).

**Destroyer** - An orc two-handed fighter. In raids destroyers drain their own HP below 30 % and then use Frenzy / Zealot / Guts for huge
damage; healers leave them alone while they drain.

**Doombringer** - A kamael heavy melee fighter (male).

**Doomcryer** - The orc buffer. Its job here: party buffs, Chant of Victory and Magnus' Chant at high level, and Chant of Life in danger.

**Dry run** - Working out what would happen without doing it. The command center asks the server for a dry run of every order (who gets
which text) before you send it. `!gearplan` and `!dyeplan` are dry runs in the game.

**Escape** - Leaving a fight to a town. Here always with `.townname` (free), never with a Scroll of Escape; in a fight the character first
runs out of range. Raids are never escaped.

**Exclusion zone** - A part of a hunting area the bots must not enter (a wall, a cliff, a dangerous corner). Drawn in the spot editor as a
red polygon or circle inside the hunt area.

**Fixture, sandbox** - Only for the guide tools: the **fixture** is an anonymised copy of the live data; the **sandbox** is a copy of the
dashboard server that reads the fixture and cannot reach the game. All screenshots in this guide come from the sandbox.

**Focus (focus fire)** - Every damage dealer attacks the same monster as the leader. The normal way of fighting.

**Free text** - A plain sentence such as "restock" or "teleport gludio" typed into the command center; the dashboard turns it into a
command.

**Gatekeeper (GK)** - The teleport NPC in every town. The leader clicks a destination, the server takes the party along (Cabinet setting).
Field destinations are always reached this way; towns are reached with `.townname`.

**Giran** - The central town. The parties regroup and shop here; Giran is the "safe" trip (`!town Giran`).

**Giran routes** - Recorded walking routes inside Giran (to the grocer, warehouse, weapon shops ...). The bots walk only these routes in
Giran, never short-cuts. Editable on the Teleports tab.

**Healer** - A character whose job is to heal (bishop, shillien saint, elder). Healers here never attack.

**Helvetia** - The grocer in Giran where the leader buys scrolls, shots and potions for the whole party during `!supply`.

**Hooked, in-game, OOG** - **OOG** (out of game) means L2Swarm plays the character without a game client: no window, little memory. **In-game**
or **hooked** means L2Swarm starts the real game client (`l2.exe`) and plays through it, so you can watch. Switch per character on the
character page or in the command center ("Client mode").

**Hunting pairs** - An optional way of fighting while leveling: the leader splits the damage dealers into small groups, each with its own
monster, while the healers keep healing. Off by default; set per party in the Tactics box on the Parties tab. Falls back to focus fire when
someone gets low or dies.

**Inspector** - The role name for the kamael that is played as Soul Breaker -> Soul Hound (Inspector comes later as a subclass). Debuffs the
boss with dark magic and gives party buffs.

**Kamaloka** - A daily instance dungeon for one party. **Halls** (up to 6 characters) have one room and a boss; **Labyrinths** (up to 9) have
several rooms. Each Kamaloka can be done once a day (the day starts 06:30 local time). See [Kamaloka](pages/kamaloka.md).

**Karma, PvP flag** - Karma comes from killing players who did not fight back; a PvP flag from attacking a player. Both block teleports and
the `.townname` command. `/attackforce` can cause them, so it is destructive.

**Landing** - The exact place a teleport puts you. A hunting spot starts at a landing; the team then walks from it.

**Lead mode** - The design this system runs in: the **party leader** decides everything (where to hunt, when to shop, when to travel) and the
members only follow, assist, heal, rest, rebuff and defend. Commands marked "leader" are carried out by him.

**Leader, member, party** - A party is up to 9 characters with one **leader**. In this guide a party is always named after its leader
("party Aldric"). **Members** follow the leader.

**L2Swarm** - The commercial bot program that logs the characters in and plays them. It runs our script in every window and offers its own
`/` chat-box commands.

**MCP** - The local control interface of L2Swarm (Model Context Protocol, a small web service on this PC). The dashboard sends every order
through it. When it does not answer, swarm orders go through a file instead (the "file channel").

**MemWatch** - A scheduled task that checks L2Swarm's memory use every 2 minutes and restarts it when the PC runs low on memory or L2Swarm
froze. Its log is shown on the PC tab.

**Necromancer** - A dark magic caster with curses and summons.

**Nuker** - A caster whose job is damage spells.

**Occupied** - See **Claim**.

**P0 - P6 (priorities)** - Every window works on one task at a time, the most important first:
P0 Survive (heal, potion, run when alone, respawn) - P1 Get unfrozen / unstuck - P2 Team safety (help, res, regroup anyone left behind) -
P3 Safe teleport (fight off, safe spot, together, out of combat) - P4 Orders (`!stop`, `!supply`, missions ...) - P5 Leveling - P6 Upkeep
(rebuff, class change, selling). A more important task interrupts a less important one. The character page shows the list and who holds
control now.

**Pull route** - A route the tank runs to gather monsters and bring them back to the team, who wait at the first point (the anchor) and kill
the train. Drawn in the Zones tab.

**Raid boss, raid curse** - A raid boss is a strong named monster for a whole party. A raid boss **and its minions** curse (turn to stone)
anyone more than 8 levels above them, so a party only takes bosses within that window. Raids are never escaped: the team fights to the end.

**Raid hunter** - `!raidhunt`: the leader takes every boss that fits the party, lowest first, until a wipe or timeout.

**Role** - What a character does in the team. The roles used here: **sk** (Shillien Knight, the tank and leader), **bishop**, **destroyer**,
**doombringer**, **inspector**, **necromancer**, **doomcryer**, **shillien saint** (shilliensaint), **crafter**, **spoiler**, **healer**,
**nuker**, **dagger**. Set per account in `swarm.config.json`.

**Room** - A group of monster spawns inside a dungeon that belong together, with an outline and a level range. A party can be told to hunt
in one room, or walk a list of rooms. See [Rooms](pages/rooms.md).

**S.A. (special ability), soul crystal** - A weapon's special ability (for example Focus, Health, Acumen) is added with a **soul crystal**
that was charged by killing monsters. The Crystals tab plans which crystal each character charges.

**Safe spot** - A place without monsters near it (worked out from the map and the monster spawns). The team walks there before teleporting
or to rest.

**Scroll of Escape (SoE)** - An item that teleports you to the nearest town after a short cast. The bots keep a few, but use the free
`.townname` command instead.

**Scroll of Resurrection (SoR)** - An item that brings a dead character back. Never used in raids.

**Seven Signs** - A server-wide competition between **Dawn** and **Dusk**. It runs in two periods: the **competition period** (anyone who
signed up may enter the catacombs and necropolises) and the **seal validation period** (only the winning side, and only if it owns the right
seal). Characters sign up with the Priest of Dawn (`!dawn`). The monsters there drop **Seal Stones**, which are traded for **Ancient Adena**.

**Shillien Knight (SK)** - The dark elf tank. In the main parties he is the leader.

**Shillien Saint** - The dark elf healer (Shillien Elder -> Shillien Saint).

**Shots (SS, SPS, BSS)** - Ammunition that makes attacks stronger: **SS** Soulshots for physical attacks, **SPS** Spiritshots for spells,
**BSS** Blessed Spiritshots (stronger spiritshots). Each weapon grade needs its own grade of shots. `!supply` keeps them topped up.

**Siege** - A battle for a fortress or castle. See [Fortresses, castles and sieges](pages/sieges.md).

**Spoil, sweep** - The spoiler casts **Spoil** on a monster; when it dies, **Sweeper** collects extra materials from it.

**Spoiler** - The dwarf that spoils (Scavenger -> Bounty Hunter).

**Spot** - A hunting place for a party: where it starts (a teleport or `.townname`), the waypoints from the landing, the hunt area,
exclusions, levels and which parties may use it. See [Spots](pages/spots.md).

**Stale / not reporting** - A character whose script has not written its status for more than 30 seconds (offline, frozen or the script is
stopped). The header counts how many are reporting.

**swarm.js** - Our script. One copy runs in every L2Swarm window; it reads its role and party from the config and does everything the
dashboard describes. Commands starting with `!` are handled by it.

**swarm.config.json** - The one configuration file of the install: paths, ports, the main leader, and every account with its character,
party and role (no passwords).

**Tank** - The character that holds the monsters' attention (aggro) and takes the hits; here the Shillien Knight.

**.townname, .town** - A free server command that teleports you (and your party, with the Cabinet setting) to a town: `.giran`, `.dion`,
`.aden`, `.gludio`, `.gludin`, `.oren`, `.hunters`, `.heine`, `.goddard`, `.rune`, `.schuttgart`. It does not work in combat, with karma or a
PvP flag. `!town <town>` makes the leader use it safely (fight off, regroup, then port).

**Wipe** - The whole team died.

**Zone** - A hunting zone drawn on the Zones tab: a hunting area with exclusions and pull routes, a level range and the parties allowed to
use it. See [Zones](pages/zones.md).

**Ziggurat** - The talking blue globe at the entrance of a catacomb or necropolis that lets signed-up characters in.
