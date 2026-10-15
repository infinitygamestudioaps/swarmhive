# Automations (what runs by itself)

The **Automations** tab (`#/auto`, right after *Parties*) lists **everything the bots can do on their own**, for one party at a time:
whether it is **on or off right now**, **why**, what it is doing now when that is known, and a button that takes you to **the place
where it is switched**. The page itself never changes anything - it only shows and points.

It was asked for by a player who wanted one place to see "what is running by itself and why".

On this page:

- [The page](#the-page)
- [The states](#the-states)
- [Why a row is on or off](#why-a-row-is-on-or-off)
- [The list](#the-list)
- [Seven Signs line](#seven-signs-line)
- [Notes](#notes)

## The page

1. **Party buttons** at the top (a green dot = the party is started, grey = stopped). Tap one to see its automations; the address
   becomes `#/auto/<leader>` so you can bookmark it.
2. **The party box**: *STARTED* or *STOPPED*, what the leader is doing now, and how many automations are running, waiting for Start,
   off or always on.
3. **Filters**: *Everything*, *Running* (on + always on), *Off*, *Waits for Start*.
4. **⚙ Party settings** opens the party's settings window; **▶ Start / ■ Stop is on the party card** takes you to the party card.
5. **Groups** of rows: the master switch, survival, fighting, leveling and moving, supplies and money, storage and loot, gear and class,
   daily and events, clan. Each row has:
   - a **state pill** (see below) and the **name**,
   - **what it does** in one sentence,
   - **why** it is in that state right now (the switch, where it was set - for this party, for all parties, per character, or nobody
     changed it - and the important details),
   - **Now:** what it is doing now, when known (for example the leader's current task, the minutes left on a hunting timer, or the
     Seven Signs sentence),
   - **Switch:** where it is switched and what a new install has, and a **button** that opens exactly that place (a section of the
     party settings window, the Storage page, the 7 Signs tab, the Clan tab, the Classes / Buffs page, the Quests page, the party card).

The page refreshes every 30 seconds.

## The states

| Pill | Meaning |
|---|---|
| **ON** | It runs: its own switch is on (or it has none) and, if it needs it, the party is started. |
| **OFF** | Its switch is off - nothing happens until you switch it on. |
| **WAITS FOR START** | Its switch is on (or it has none), but the party is **stopped**: it starts working when you press **Start**. |
| **ALWAYS ON** | It does not need Start (survival, getting unstuck, your orders and trades, heal choices, own buffs, route rules, soul crystals). |
| **YOUR ORDER** | It only runs when you order it (raid hunt), and only while the party is started. |
| **NEVER BY ITSELF** | Never automatic: enchanting and siege registration are always your own order. |

## Why a row is on or off

The **Start / Stop** switch of the party (the *master switch*) comes first: a stopped party does nothing on its own except survival,
trades and your orders. Most automations also have **their own switch** - both must be on. A few have only their own switch and work
whether the party is started or not (resurrection, "Hive picks the skills / heals / drinks potions", gear upgrades, the collector).

The clan automations (level-up, the level item hand-over, level quests, invites, raid quests, the clan warehouse list, clan skills) have
**one switch for the whole clan** on the Clan tab, and they run while **the clan leader's party** is started - their rows say which party
that is.

## The list

| Group | Automations |
|---|---|
| The master switch | Party Start / Stop |
| Survival - always on | Stay alive · Get unstuck · Your orders and trades · Resurrect the dead |
| Fighting | Hive picks the skills · Hive heals · Hive drinks potions · Heal choices · Own buffs, songs and dances · Hunting pairs |
| Leveling and moving | Leveling · Hunting timer · Keep the party together · Party plan · Route rules · Raid hunt · Quest farm |
| Supplies and money | Supply runs · Sell junk · Draw symbols (dyes) · Shots from player shops · Adena hand-outs |
| Storage and loot | Store in the warehouse · Hand in event letters · Collector · Hand loot to a collector |
| Gear and class | Buy gear upgrades · Class change · Level soul crystals · Enchanting (never by itself) |
| Daily and events | Daily Kamaloka · Seven Signs sign-up · Siege registration (never by itself) |
| Clan | Clan level-up · Clan level item hand-over · Clan level quests · Clan invites · Clan raid quests · Clan warehouse list · Clan skills |

## Seven Signs line

The *Seven Signs sign-up* row also says, in one sentence, whether the party can get into **catacombs and necropolises** right now and
why - the same sentence the bots write when they skip one, and the same one the hunting-spot picker shows. The full list of sentences
is in [Parties → Seven Signs check](parties.md#seven-signs-why).

## Notes

- The page is read-only: switching happens on the page the button opens, so every switch keeps its own safety questions.
- Missing settings mean the bots' defaults: on a new install almost everything is **off** until you switch it on; survival is always on.
- For the people who build SwarmHive: the list is one file, `Dashboard/autocatalog.js`. A new automation gets one entry there; the test
  `docs/plan/tools/test_auto_overview.js` fails when the bots have an automation that the list does not show.
