# Combat: Hive or your own L2Swarm profile

Hive can fight for you (it picks the skills, heals, drinks potions), or it can leave the fighting to **your own L2Swarm profile** and
only do the rest: walking, following, teleports, supply runs, selling, resurrection and the dashboard. You choose this per party, and
per character if you want.

This is for players who already have a hand-tuned profile, for example level-85 parties whose skill and heal setup in L2Swarm works
better than Hive's general one.

## Where

- **Party card → ⚙ Settings → Combat**: the three switches for the whole party, and **Per character** to change one member.
- **Character page → box "Combat — Hive or my L2Swarm profile"**: the same three choices for that character, plus the toggles it keeps
  on in fights.

Every switch is **on** until you change it, so nothing changes for anyone who never opens this.

## The three switches

| Switch | On (default) | Off |
|---|---|---|
| **Hive picks my skills** | Hive chooses and casts attacks, area attacks, debuffs, buffs, songs and dances, toggles, cubics, Spoil / Sweeper, and the raid role skills (tank Aggression, destroyer Frenzy, chants, Stigma ...). | Hive casts **nothing** by itself. Your profile's **Combat Skills** tab fights. |
| **Hive heals** | Hive heals the party: the best heal for each case, group heals, cures, Recharge, Chant of Life, self heals. | Hive heals **nobody**. Your profile's **Auto Skills** tab heals. |
| **Hive uses potions** | Hive drinks Healing and Mana Potions when HP or MP run low. | No potions by Hive. Use L2Swarm's own potion settings or the server's `.autohp` / `.automp`. |

A character's own choice wins over the party's switch.

**Before you switch something off:** set it up in that character's L2Swarm profile first (account options → *Combat Skills* /
*Auto Skills*). With Hive off and an empty profile, nobody casts or heals.

## What Hive gives back to your profile

Hive sometimes switches entries in your profile off so they do not fight with its own choices. When you set a switch to off, it puts
them back and leaves the lists alone from then on:

- **Skills off:** every Combat Skills entry Hive had switched off (caster members whose nukes Hive cast itself) is switched **on** again.
  Hive never switches one off again, and it never switches on an entry **you** switched off.
- **Heals off:** the Auto Skills entries Hive had switched off (L2Swarm's *Self Heal* on healers that know stronger heals) are switched
  **on** again, and Hive does not touch the Auto Skills list any more.

## How the characters fight with skills off

- **Party members** fight with **L2Swarm's own combat**, so your Combat Skills are used. This is safe on L2Swarm 3.8.11 and newer (the
  old StartCombat freeze is fixed there). On an older L2Swarm they only auto-attack, without skills.
- **Leaders** already fight with L2Swarm's own combat.
- **Solo characters** fight with L2Swarm's own combat too. Note: L2Swarm's combat may pull more monsters at once than Hive's careful
  solo fighting does.
- **Healers:** with *Hive picks my skills* **on**, Hive keeps a healer from attacking (it only heals). With it **off**, your profile
  decides whether the healer assists and attacks.
- **Raids:** with skills off, the raid order (clear the area, countdown, pull, focus target) still comes from Hive. The skills come from
  your profile. A destroyer does not drain its HP for Frenzy unless your profile does it.

## What still works whatever you choose

- Walking, following, teleports, supply runs, selling, storing, gear, quests, the raid circuit.
- **Resurrection.** It has its own settings (⚙ Settings → Resurrection).
- **Escaping alone:** a character that has to run from a fight alone still uses its crowd control (Sleep, Root ...) and its run buffs
  (Dash, Sprint).
- **Your orders:** *Use now* on the character page (`!ov ...`), Res all dead, `!buff`, the Community Board buffs, class changes,
  Change Weapon, door Unlock on routes, siege orders.

## Toggles in fights

Hive switches toggles **on only in fights**, and **off** after the fight and in towns.

Until 2026-10-15 Hive switched on **every** toggle a character knew. Berserkers and Destroyers burned all their MP on Strike Back and
similar toggles. Now Hive only switches on:

- the toggles that are worth their MP for anyone who knows them: **Soul Cry, Vicious Stance, Accuracy, Focus Attack, Polearm
  Accuracy, Fury Fists**;
- a **tank's** stances (Guard Stance, Fortitude, Final Fortress) when the character's role is tank;
- every toggle **you tick** on the character page ("Toggles to keep on in fights"). When the character is offline and its skill list
  is not known, type the names, separated by commas.

A toggle you switched on by hand is still switched **off** after the fight (they drain MP). With **Hive picks my skills** off, Hive does
not touch toggles at all: your profile owns them.

## Fight with L2Swarm (Hive only travels)

A party switch in the same **Combat** section, **off** by default. Turn it on when you want your L2Swarm profiles to do all the
fighting and Hive to do everything around it.

With it on, Hive still:
- travels to the hunting spot, picks the spot, restocks, gears up, sells and shows everything on the dashboard;
- regroups the team when someone is far away or dead, moves on to another spot, and takes over again for raids, Kamaloka and other
  instances.

At the hunting spot Hive then only:
- sets L2Swarm's **combat zone** (the square, the drawn area or the room) and starts **L2Swarm combat** on the leader;
- switches **Follow** (on the leader) and, once, **Follow Attack** on for the others. Healers and buffers that never melee keep Follow
  Attack off. You can switch Follow Attack off again in a character's profile; Hive does not switch it back on during that fight.

Hive does **not** pick targets, make hunting pairs, walk anyone back to the middle, start fights of its own (help or self-defence),
lead the others along room routes, or run anyone out of a fight with an escape. **Hive picks my skills** counts as off while this switch
is on, so your profiles cast. Set up Combat Skills, Auto Skills (heals) and the profile's Follow / Follow Attack before you switch it on.

## For the technical reader

- File: `Scripts/data/party_auto.json`: `parties.<leader>.skills / heals / potions / swarmFight` (swarmFight: party only, missing = off), `chars.<name>.skills / heals / potions / toggles`.
  A missing value = **on**. The bots read it every 5 seconds, so no restart is needed after a change.
- swarm.js: `hiveSkillsOn()`, `hiveHealsOn()`, `hivePotionsOn()` and `toggleWanted()` (block TOGGLE-PURE). Tests:
  `docs/plan/tools/test_hive_switches.js` and `test_hiveswitch_ui.js`. Fight with L2Swarm: `swarmFightOn()`, `swarmFightNow()`,
  `sfLeaderTick()` (marker SWARMFIGHT-2026-10-16), test `docs/plan/tools/test_swarm_fight.js`.
