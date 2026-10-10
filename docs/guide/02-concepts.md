# Concepts: how the swarm works

This chapter explains the ideas behind the bots' behaviour. Each section says **what it does** and **how you control it** (the dashboard
page and the command). Commands are typed in the dashboard's [command center](pages/command-center.md) or picked from a party's
"Commands" sheet; the full list is in the [command reference](05-commands.md). Unknown words: see the [glossary](06-glossary.md).

Contents:
[Lead mode](#lead-mode-the-leader-decides) ·
[Parties](#parties-are-named-after-their-leader) ·
[Priorities](#priorities-p0-to-p6) ·
[Survival, rest and healing](#survival-rest-and-healing) ·
[Board buffs](#board-buffs) ·
[Hunting spots](#hunting-spots) ·
[Hunting pairs](#hunting-pairs) ·
[Travel rules](#travel-rules) ·
[Supply runs](#supply-runs) ·
[Adena](#adena-collect-and-hand-out) ·
[Class changes](#class-changes) ·
[Gear and enchanting](#gear-upgrades-and-enchanting) ·
[Raids](#raids) ·
[Kamaloka](#kamaloka-dailies) ·
[Seven Signs](#seven-signs) ·
[Escape and rescue](#escape-and-rescue) ·
[Sieges](#sieges) ·
[Clan](#clan) ·
[Client mode](#client-mode-in-game-or-out-of-game) ·
[Memory and deploys](#memory-and-deploy-discipline)

---

## Lead mode: the leader decides

**What it does.** Every party has one leader (usually the tank). The leader's swarm.js window decides everything for the party: where it
hunts, when it travels, when it buys supplies, which raid boss it fights. The members have **no plans of their own**. They:

- **follow** the leader and **assist** him (they attack what he attacks; healers never attack);
- **defend** themselves and every teammate who is being hit;
- **rest** (sit) when their HP or MP is low and nothing hits them;
- **rebuff** from the Community Board when their buffs run out or after a death;
- **resurrect** the dead (one teammate is chosen for it; a resurrection skill is preferred over a scroll);
- run the fast **survival** loops (potions, self heals, escape when left alone in a fight).

The leader regroups the team before every trip, never leaves anyone behind (a teammate who is stranded or far away makes the whole team
regroup in **Giran**), and buys and hands out what the team needs. When a party has nothing to do for 3 minutes, its leader starts leveling
by himself.

**How you control it.** Give orders to the **party** (they go to the leader). The main ones: `!level` (go leveling), `!supply` (supply run),
`!stop` (stop everything and wait for orders), `!town <town>`, `!mission raid <boss>`, `!raidhunt`. Watch the result on the
[Parties](pages/parties.md) page and the [What they do](pages/what-they-do.md) timeline.

After `!stop` the party waits until your next order. An **automatic** pause (for example after a raid wipe) ends by itself after 15 minutes
and the party goes back to leveling; the Parties page shows "waiting for orders since ...".

## Parties are named after their leader

**What it does.** A party is all characters whose `party` field in `swarm.config.json` is the same leader name. The party is always called
by that leader's name: "party Aldric", "party Borin". The dashboard, party chat messages and the logs all use this name. A character alone in
its own party is a **solo** character and levels alone.

**How you control it.** Change `party` (and `role`) in `swarm.config.json`, then run SETUP with L2Swarm stopped (see
[Getting started](01-getting-started.md#5-accounts-characters-parties-and-roles)).

## Priorities P0 to P6

**What it does.** Every window runs many loops at once. Only one task at a time holds the **control** of the character (or of the team, for
the leader). A more important task takes control from a less important one; the less important one notices and steps aside, and less
important tasks wait until control is free.

| Level | Task |
|---|---|
| P0 Survive | heal, potions, run away when alone, respawn |
| P1 Unfreeze | Appearing packet, click free from terrain, `.town` as a last resort |
| P2 Team safety | help teammates under attack, resurrect the dead, regroup anyone left behind (Giran) |
| P3 Safe teleport | fight off monsters, move to a safe spot, everyone together and out of combat |
| P4 Orders | your orders: `!stop`, `!supply`, `!collect`, `!level`, missions, raid hunt |
| P5 Leveling | pick a spot, travel together, hunt |
| P6 Upkeep | rebuff, class change, selling |

Long tasks (walks, waits at checkpoints, gathering the team, the regroup before a teleport, Giran routes) check whether they were
interrupted and stop cleanly. Survival (heals, potions) and the Appearing packet run in their own fast loops and never wait for control.

**How you control it.** You do not set priorities; you see them. The dashboard shows each character's current task, and a refused order says
which task holds control. An order you give is P4: it interrupts leveling and upkeep, but not an escape or a rescue.

## Survival, rest and healing

**What it does.**

- **Everyone:** below 25 % MP a Mana Potion (every 6 s); below 45 % HP the best self heal it knows; below 30 % HP with no heal a Healing
  Potion. Casters that know a heal stop attacking below 35 % MP.
- **Rest:** a character sits down below 40 % HP (casters also below 20 % MP) when nothing hits it, and stands up at 85 % HP / 70 % MP or when
  attacked. It never sits in a town, while far from its leader, or while a more important task owns the team. A sitting character cannot
  walk, so swarm.js stands up before every walk.
- **Healers only heal** (bishop, shillien saint, healer roles): never an attack, not even in self-defence. Each tick: the fastest heal on
  anyone below 40 %, a group heal when 3 or more are below 70 %, cures for debuffs, a normal heal below 75 %, Recharge for casters below
  40 % MP. In raids and dungeons they heal anyone below 80 % and drink Mana Potions freely.
- **Hive help:** everyone attacks a monster that hits a teammate nearby; the dead are resurrected by the one chosen teammate.
- **Ignored monsters:** Treasure Chests are never attacked (they hit hard and are not worth it); a character hit by one steps away.

**How you control it.** Nothing to set. Character state, HP/MP bars and cast bars are on the [Parties](pages/parties.md) and
[Character](pages/character.md) pages.

## Board buffs

**What it does.** Buffs come for free from the server's **Community Board** (Alt+B -> Buffs -> a scheme -> Buff Me). One click gives 18-28
buffs that last 12 hours. The scheme depends on the role: **Defender** (tank), **Warrior** (melee fighters, dwarves, dagger), **Mystic**
(casters and healers).

- Every window checks its buffs every 10 seconds. It needs a rebuff after a **death**, or when fewer than 10 buffs have more than 5 minutes
  left.
- The leader keeps a **rebuff queue** (the revived first, then whoever's buffs end soonest). **One character at a time** leaves the fight,
  waits until its combat flag is gone (the board refuses buffs in combat), clicks through the board (3 tries) and goes back. The others
  protect it meanwhile. A failed turn waits 5 minutes before the next try; with no answer from the leader for 2 minutes the character buffs
  itself.
- **Boss fights:** nobody leaves the fight. The doomcryer gives the whole party Warrior buffs with "Buff Party", then every caster adds
  Mystic on top; at most one wave a minute, and after 2 failed waves they stop until the fight ends.
- While board buffs are on, characters do **not** cast their own self-buffs. Exceptions are party buffs the board cannot give: the
  doomcryer's Chant of Victory and Magnus' Chant, and the Soul Breaker's Dark Weapon and Pride of Kamael.
- Toggle skills (for example Vicious Stance, Accuracy) are switched **on only in a fight** and off in towns and about 12 seconds after the
  fight.
- A Kamaloka instance removes all buffs on entry; the board works inside.

**How you control it.** `!buff` (rebuff now, one at a time), `!buffauto on|off` (automatic rebuff), `!raidbuff` (a boss buff wave now). Each
member's buff state shows on the [Parties](pages/parties.md) page (a chip when buffs are low).

## Hunting spots

**What it does.** The leader chooses where the party levels. There are four kinds of places:

| Kind | What it is | Where you see / edit it |
|---|---|---|
| **Custom zones** | Your own zones per level range, for all parties or for one party (`Scripts\data\custom_zones.json`). | [Zones](pages/zones.md) |
| **Datapack spots** | Hunting spots generated from the game's spawn list (`Scripts\data\hunting_spots_h5.json`). | [Spots](pages/spots.md) |
| **Dungeon rooms** | Every room of the dungeons, catacombs and necropolises as an outline, with levels, entry and walk route (`Scripts\data\dungeon_rooms.json`). A party hunts **inside one room** and only attacks monsters in it. | [Rooms](pages/rooms.md) |
| **Field areas** | Outdoor hunting grounds cut into areas along walls, cliffs and height steps (`Scripts\data\field_areas.json`), with levels, safe spots and the way in from the nearest landing. | the spot picker on [Parties](pages/parties.md) |

All four can be reshaped in the [shape editor](pages/shape-editor.md).

**Automatic choice (Auto).** The leader picks for the party's **lowest** level, in this order: the party's own fitting zones, the level route
zones near its level, another party's zone for this level, the party's route file, a free field area, datapack spots (busy ones first), and
as a last resort a route zone up to 8 levels lower. It skips:

- spots on the skip list (a failed trip, "occupied", too few kills);
- spots **claimed by another of our parties** (`Logs\spot_claims.json`; a claim is refreshed every minute and dropped after 3 minutes) and
  anything within 1500 of another party's hunting centre on the same floor. When two of our parties share a big zone, the later one moves
  into a sub-area of it;
- catacombs and necropolises the [Seven Signs](#seven-signs) rule closes;
- landings where monsters are more than 6 levels above the party's highest level (the **danger rule**).

An automatic spot is left when the party gets fewer than 3 kills in 5 minutes, too little exp, monsters more than 2 levels below it on
average, or when it outgrows the spot. The hunting area is the spot's circle or square times 3 (rooms and areas use their own outline), and
members who drift away walk back to it. **Nobody fights inside a town.**

**Occupied by other players.** While hunting, the leader checks every 10 seconds. When **2 or more foreign players** (not ours, not in the
party or clan; private stores do not count) stay inside the area for **2 minutes**, the spot is "occupied": skipped for 30 minutes and the
party moves on. If another of our parties is in the same area, the one with the newer claim yields.

**Manual choice (dashboard).** On the [Parties](pages/parties.md) page, "Hunting spot: ... Choose…" opens a full-screen picker:

- one or more **rooms** of a dungeon (across floors), "Any free room", or one or more outdoor **areas** of a hunting ground ("Select all
  fitting");
- the **order** for several rooms/areas: nearest next, or in your order. The party **rotates**: it stays while it fights; after about 35
  seconds without monsters it moves to the next one that should hold at least 3 monsters, skipping occupied and claimed ones; on the same
  floor or in the same region it walks, a room on another floor is reached through the floor teleporters;
- **stay even if occupied**: never give the spot up because of other players;
- **move on when outgrown**: when the party's lowest level is more than 3 above the monsters there, the choice ends by itself and the party
  goes back to Auto. Without this box, a chosen spot is **never** given up for few kills or low monsters (the party only says so in party
  chat every 30 minutes);
- **level override**: a spot above the safe level asks "Yes, override" / "Save without override". Without the override the party hunts
  an automatic spot and the line says "needs your OK";
- a closed catacomb/necropolis can be saved anyway; it waits until the Seven Signs let the party in;
- **Back to auto** ends the choice.

A new choice takes effect within seconds: walks and waits step aside, and the party goes there (a supply run that is already running finishes
first, without gear and dye shopping). It waits during raids, Kamaloka, escapes and rescues, and while a teammate below 50 % HP is fighting.
The choice is saved in `Scripts\data\party_spots.json`; the Parties page shows its live status (travelling, ETA, in the room, occupied, waiting).

**How you control it.** `!level` (go leveling), `!autolevel stop` (stop leveling), `!dungeon <name>` / `!dungeon off` (level inside a
catacomb or necropolis), `!assist <name>` / `!assist off` (the party hunts around another character to help him). Pages: [Parties](pages/parties.md)
(picker, map, status), [Zones](pages/zones.md), [Spots](pages/spots.md), [Rooms](pages/rooms.md), [Shape editor](pages/shape-editor.md).

## Hunting pairs

**What it does.** A party with many damage dealers can split them into small groups, each with its own monster, instead of everyone hitting
the same one. Only while **leveling** (never in raids, Kamaloka, missions, travel or towns). The leader gives each group a monster within the
leash distance of himself and close enough to every teammate for the exp to count (party range). Healers keep healing, spare dealers assist
the leader. Monsters hitting a healer are taken first. The party goes **back to focus fire at once** when someone drops below the fallback HP,
someone dies, or too many monsters are on the team (then 2 minutes before groups may form again).

Modes: **off** (default), **on**, or **auto** (only when the party has enough dealers, the monsters are not above its level plus a margin, the
HP average was at least 70 % for a minute and nobody died in the last 10 minutes). Settings: group size (1-3), max groups, leash, zone size,
minimum dealers, level margin, fallback HP, include the doomcryer.

**How you control it.** The "Tactics" box of each party on the [Parties](pages/parties.md) page (saved in `Scripts\data\party_tactics.json`, read
live). Switches are announced in party chat and logged in `Logs\tactics.log`.

## Travel rules

**What it does.**

- **Towns only with `.townname`.** The server teleports you and your party for free with `.giran`, `.dion`, `.aden` and so on (11 towns:
  Gludin, Gludio, Dion, Giran, Oren, Aden, Hunters, Heine, Goddard, Rune, Schuttgart). The swarm never chains town-to-town gatekeepers and
  never uses a Scroll of Escape to travel.
- **Gatekeeper only for town -> field.** The last step from a town to a hunting ground uses that town's gatekeeper. With "Follow Party
  Leader's Dialog" on (Cabinet setting), only the leader clicks and the server takes the party along.
- **Regroup before every teleport.** The leader first fights off every monster on any teammate, moves away from aggressive monsters to a safe
  spot, waits until everyone is within 900 and **everyone is out of combat** for 10 seconds, says "teleporting: X in 3 s" in party chat, then
  ports. He never ports while a teammate in his area is still fighting.
- **After a teleport** the leader waits about 10 seconds (the team loads in) and holds a roll call. Members the server did not take along use
  the same `.town` themselves; the leader waits until the whole team is there.
- **Never walk out of a town.** Leveling trips teleport to a field landing and walk from there (exception: raid routes you recorded
  yourself).
- **Giran** is the hub: every trip to a new spot regroups there first. Inside Giran the characters walk **only** along the recorded town
  routes (start, grocer, warehouse, weapons, armor, jewelry, blacksmith, symbol maker).
- **Danger rule:** a field teleport is refused when monsters near the landing are more than 6 levels above the party's highest level.
- **Nobody is left behind:** a teammate reported left behind, or more than 15000 away for 90 seconds, makes the leader regroup the whole team
  in Giran.

**How you control it.** `!town <town>` (the party goes there together), `!gk <destination>` (gatekeeper teleport), `!park [place]` (the party
goes to Giran and waits at a recorded place), `!goto <place>`, `!soe` (retreat: everyone leaves the fight and goes to town). The
[Teleports](pages/teleports.md) page shows every gatekeeper menu and edits the Giran town routes.

## Supply runs

**What it does.** The leader buys for the whole team in **Giran** at the grocer **Helvetia** and hands out each member's share by trade.

- Each member reports what it lacks: Scroll of Escape (top up to 5), Scroll of Resurrection (to 3), soulshots or spiritshots for its weapon
  grade (fighters up to 10,000, casters up to 5,000, when below 2,000), Mana Potions (up to 2,000 when below 500), Spirit Ore for a tank's
  cubics, Healing Potions.
- The leader buys the total, then trades each member its share at the Giran start point.
- The same run also does: gear upgrades and safe enchanting, dyes, selling junk and marked items, unloading the leader's full bag to the
  teammate with the most free slots, and adena collection. Only characters that have something to buy, draw or sell walk to a shop. One
  summary line per run (with each step's time) goes to party chat and `Logs\supply_runs.log`.
- **Automatic:** every window checks every 30 seconds whether it is low (fewer than 2 Scrolls of Escape, no Scroll of Resurrection, fewer
  than 200 shots, fewer than 100 Mana Potions, fewer than 5 Healing Potions) and the leader starts a run by himself. A run also happens at a
  Giran regroup when the last one is more than 30 minutes old. At most one automatic run per 30 minutes (not during raids or missions, not
  after `!stop`).

**How you control it.** `!supply` (also `!restock`), `!sell [name]` (sell now). The items to sell are chosen on the [Character](pages/character.md)
page (saved in `Scripts\data\sell_list.json`). Supply state per member is shown on the [Parties](pages/parties.md) page (chips for low SoE,
shots, buffs).

## Adena: collect and hand out

**What it does.**

- **Collect:** members trade the adena above what they should keep to their leader: **2M** below level 40, **2.5M** at 40-75, **3M** at 76+.
  Amounts below 50,000 are not traded. Loot goes to the leader anyway (Cabinet "Forward Drop to Party Leader").
- **Cross-party funding:** a rich party leader (above 30M) standing in Giran tops up characters of other parties that are **already in
  Giran**: a party leader to 8M (he buys the team's supplies), a member to 3M. Nobody is called away from hunting for it. Logged in
  `Logs\fund_log.json`.
- Trades inside your own teams are automatic. Trades with anyone else are never done by the bots.

**How you control it.** `!collect` (to a party). Adena per character is on the [Parties](pages/parties.md) and [Character](pages/character.md) pages.

## Class changes

**What it does.** Class changes go through the Community Board: **Alt+B -> Career -> Professions**, at levels **20, 40 and 76**. The window
clicks the button that contains its next class name from its class plan (the role's default path, or `classPlan` in `swarm.config.json`).
When a character reaches the level, its leader orders the change automatically (once per level). The pages are saved to
`Logs\career_<Name>.html`. There are no class quests.

**How you control it.** `!classchange [name]`. The class plan is in `swarm.config.json` (see
[Getting started](01-getting-started.md#fields-of-each-account)); current classes show on [Parties](pages/parties.md).

## Gear upgrades and enchanting

**What it does.**

- At every supply run (and with `!gearup` / `!upgrade`) each character compares the Giran shops' equipment with what it wears and buys
  better pieces it can afford, keeping 300,000 adena. Fighters and tanks buy the cheap **Common** versions (same stats, no set bonus);
  casters and healers buy the real armor sets, with a Common weapon and jewelry. A worn special-ability weapon or an enchanted piece of the
  same grade is never replaced. Kamael weapons are bought as swords and changed with Change Weapon.
- **Enchanting:** worn real pieces up to the safe limit, **+3**, or **+4** for a full-body armor, with normal scrolls only. **Common items
  are never enchanted** (the server refuses them).
- **Dyes (symbols):** planned per role, bought and drawn at the symbol maker in Giran.
- Gear found as loot is not put on or traded around automatically; it goes to the leader.

**How you control it.** The [Gear](pages/gear.md) page: the items each class buys per grade and your preferred item per class and grade
(saved in `Scripts\data\gear_prefs.json`, read live). Commands: `!gearup [name]` (party to Giran, everyone buys and wears upgrades),
`!gearplan [name]` (dry run, writes `Logs\gear_plan_<Name>.json`), `!upgrade [name]`, `!enchant [name]` (destructive: typed YES), `!dyes` / `!dyeplan`.

## Raids

**What it does.** Raid bosses are not aggressive, so the party fights them on its own terms:

1. **Stage:** the team walks to about 1500 from the boss and stops. A raid only goes on when the team got within 3000 of the boss; a boss the
   team cannot reach twice is skipped for good (`Logs\raid_unreachable.json`).
2. **Clear the area:** every other monster within 2000 of the boss (never the boss or its minions) is killed first, one target at a time,
   with every damage dealer on it.
3. **Countdown:** gather, raise the dead, count down in party chat (10, 5, 3, 2, 1, GO).
4. **Pull:** the tank pulls and keeps the aggro (Aggression whenever ready, area aggro on loose minions, Ultimate Defense when his HP drops
   fast). **Destroyers** lower their HP below 30 % before the pull and wait; healers leave them alone meanwhile. The moment the tank has the
   boss they fire Frenzy, Zealot, Guts, Battle Roar and Rage, and the healers heal them up. The leader sets one **focus** target for all damage
   dealers: minions first, then the boss. Debuffers (tank, necromancer, Kamael, shillien saint) put their debuffs on the boss.
5. **Never escape from a raid.** The party fights until the boss dies or the last of them falls. **No Scroll of Resurrection** in a raid; the
   resurrection skill only when every living teammate is above 85 % HP. The shillien saint debuffs only while everyone is above 80 %.
6. **After a kill** everyone picks up the loot. **After a wipe** the party stops and waits (an automatic pause, 15 minutes).

**Raid curse:** a raid boss and its minions curse anyone more than 8 levels above them. The swarm uses the lowest level of the boss and its
minions and never pulls a boss that would curse a member.

**Raid hunt** (`!raidhunt [min max]`): the party works through the raid bosses, lowest level first. It skips bosses that would curse it, bosses
more than 3 levels above its lowest member, dungeon bosses and unreachable ones, and stops at the first wipe or timeout.

**How you control it.** `!mission raid <boss>`, `!mission stop`, `!raidhunt` / `!raidhunt stop`, `!routetest <boss>` (walk the route without
fighting), `!jointraid <boss> with <parties> [cc <leader>]` (several parties together, in a Command Channel if the leader has the right),
`!loot`. Pages: [Raid bosses](pages/raid-bosses.md) (boss list, route editor, reports) and the [Raid live view](live/raid-live.md).

## Kamaloka dailies

**What it does.** Every leader whose daily switch is on checks every minute for a Kamaloka his whole party fits (level window; **Halls** take
at most 6 players, **Labyrinths** at most 9) that was not done today (the day starts at 06:30 local time). Leveling or a raid hunt steps aside
after the current boss or spot, the party travels to the captain, enters and fights, then the previous activity resumes. At most 2 tries per
Kamaloka per day; "may not re-enter yet" counts as done. The leader enters only when he sees every online teammate within 900. Inside, the team
holds a spot, the tank pulls one monster at a time and everyone hits the focus target; healers stay back and heal.

**How you control it.** The [Kamaloka](pages/kamaloka.md) page (which Kamaloka fits which party, done today, daily on/off per party leader
listed in `dailyLeaders`, a Run button, maps) and the [Kamaloka live view](live/kamaloka-live.md). Command: `!mission kamaloka [level]`.
Logs: `Logs\kamaloka.log`, `Logs\daily.log`.

## Seven Signs

**What it does.**

- **Every character signs up with the Lords of Dawn**, never Dusk. Leaders take their party to the Priest of Dawn in Giran during the
  **competition period** and sign everyone up, one at a time. On a server where Dawn costs a fee or an item, the bot logs the page and stops.
- **Catacombs and necropolises:** the only way in is the **Gatekeeper Ziggurat**, and only for characters who are registered (during the seal
  validation period: only the winning side). The rule is checked **before** any trip. When the dungeon is closed, the party does not travel
  at all; the spot is skipped until the period changes ("possible again from <date>").
- The swarm reads the period from the priest's first page (at most every 6 hours) and calculates the weekly change (Monday 18:00 server time).
- Optionally the characters hand in their seal stones at the priest.

**How you control it.** `!dawn` (sign up now). The Seven Signs box on the [Clan](pages/clan.md) page shows the period, the last winner, the next
change and every character's state (Dawn / Dusk / not registered, may enter or closed). Each member row on [Parties](pages/parties.md) has a
Dawn/Dusk mark. Logs: `Logs\dawn.log`, `Logs\sevensigns_state.json`.

## Escape and rescue

**What it does.**

- **Alone in a fight** (no teammate who can fight nearby on the same floor; for a healer after 6 seconds, for others when HP is below 50 %,
  3 or more attackers, or after 45 seconds): the character escapes. It puts a crowd-control skill on the attacker if it has one (sleep, fear,
  stun, root, ...; healers may too, it is not an attack), runs to a **walkable** safe spot (a dungeon floor's safe spot, a hallway outside the
  rooms, or open ground out of every aggro range; the wall-aware path finder plans it), stands still until nothing has hit it for 7 seconds
  (self heals, potions, crowd control again), then uses `.townname`. If the server refuses that (still in combat), it uses a **Scroll of
  Escape** while standing still. When the leader announces he is coming, the character holds at the safe spot instead and waits for him.
- **Rescue:** the leader walks to a teammate who is fighting alone (up to about 15 minutes away), across dungeon floors through the floor
  teleporters if needed, and kills what is on him. Members left behind click the same teleporters.
- **Never in a raid** (raid rules apply there) and never during a siege.
- Every escape writes one line to `Logs\escape.log`.

**How you control it.** It is automatic. `!soe` makes the whole party retreat to town. `!escapetest [name]` runs the real escape in test
mode (crowd control only on a monster within 900, stops before the teleport); `!escapetest <name> full` goes all the way (destructive: typed
YES). The escape box, its live map and the cast bar appear under the member's row on [Parties](pages/parties.md); see
[Party live states](live/party-live.md).

## Sieges

**What it does.** Fortress and castle sieges with several of your parties together: you plan the siege (target, time, which parties, regroup
time, Command Channel leader, flag carrier, commander assignment, regroup point outside the siege zone); at the regroup time the parties stop,
regroup in Giran, travel to the regroup point, wait for each other, form the Command Channel and fight the objectives in order. A fortress needs
clan level 4, a castle clan level 5. Like raids, nobody escapes during a siege. This feature has not been used in a real siege yet.

**How you control it.** The [Fortresses and castles](pages/sieges.md) pages (map, details, planner, plans list) and the
[Siege live view](live/siege-live.md). Commands: `!siege plan <plan>`, `!siege fort <fort>`, `!siege castle <castle>`, `!siege stop`,
`!siegereg fort|castle <name>` (the clan leader registers).

## Clan

**What it does.**

- The **clan leader** (`clanLeader` in `swarm.config.json`) founds the clan by himself when he is level 10 or higher and stands in a town
  (at most 3 tries a day; the name comes from `Scripts\data\clan_quests.json`), then invites teammates who stand next to him.
- **Clan level:** `!clanlevel` checks what the next level needs (SP, adena, an item, reputation, members), says exactly what is missing, or
  levels the clan up at a village master. `!clanlevel auto on` does it by itself when everything is there.
- **Clan quests:** `!clanquest <quest> [step]` runs the automated steps of the clan level quests; some steps are manual (the dashboard says
  which).
- **Academy:** accounts flagged as academy members are invited into the academy once the clan is level 5 and they are level 40 or lower.
- Clan focus skill (`!clanskill`), clan warehouse view (`!clanwh`).

**How you control it.** The [Clan](pages/clan.md) page: a sub-tab per clan, level and reputation checklist, clan quests, clan events (joint raids
with a Command Channel), raid team templates, Seven Signs, new academy accounts.

## Client mode: in game or out of game

**What it does.** A character runs either **out of game** ("oog": network only, no game window, the normal way) or **in game** with the real
game client through L2Swarm's Hook button (you can watch it and play it by hand). The wanted mode per character is in
`Settings\client_mode.json`. MemWatch applies it every 2 minutes: for "in game" it logs the network session out, starts `l2.exe`, injects the
hook and types the login. Because that typing goes to the window in front, it only hooks when nobody has used the mouse or keyboard for 60
seconds, at most 3 times per character per hour. "Out of game" closes that client and logs the account in normally again. Log:
`Logs\client_mode.log`.

Hooked characters cannot be found by name over MCP; the dashboard uses their config path instead (see
[Troubleshooting](01-getting-started.md#a-character-in-in-game-mode-is-not-found-by-name)).

**How you control it.** The [Character](pages/character.md) page: Client: **In-game** / **Out of game** (or the "Client mode" commands). The
default for new accounts is `clientMode` in `swarm.config.json`.

## Memory and deploy discipline

**What it does.** L2Swarm's memory grows while it runs, and every reload of swarm.js on all accounts adds more. Too many reloads have crashed a
PC. The safeguards:

- you edit `Scripts_dev\swarm.js`, never the live `Scripts\swarm.js`;
- `deploy_swarm.ps1` copies it at most every 15 minutes, never during a live raid or Kamaloka, never while accounts log in;
- MemWatch restarts L2Swarm only when the PC is nearly out of memory, never during a live fight unless it is an emergency;
- the script supervisor restarts a dead script at most 6 times an hour;
- data files are read live, so most changes need no deploy at all.

**How you control it.** The [PC](pages/pc.md) page (L2Swarm memory and threads, Start / Restart / Stop, Deploy swarm.js). Details:
[Getting started, sections 6 and 8](01-getting-started.md#6-scheduled-tasks-start-and-stop).

## Other features

- **Soul crystals:** fetching crystals, using them on monsters, storing finished ones (`!soul get`, `!soul store`, `!soul on|off`): the
  [Crystals](pages/crystals.md) page.
- **The plan:** the [Plan](pages/plan.md) page.
- **Every command** with its arguments, who acts on it and its safety class: the [command reference](05-commands.md).
