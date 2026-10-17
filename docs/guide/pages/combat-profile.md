# Combat profile: set up L2Swarm's combat in the Hive

Every character has its own **L2Swarm profile**: what it attacks with, how it heals and buffs, which potions it drinks, whom it follows
and assists, how far it fights, what it picks up. You can now set all of that up **in the Hive**, the same way as in L2Swarm's own
options, without opening L2Swarm.

## Where

- **Character page → box "⚔ Combat profile" → edit**, or open `#/combat/<name>`.

## The six parts

| Part | Same as in L2Swarm | What you set |
|---|---|---|
| **Attacks** | Combat Skills | The skills it attacks with, **top first**. For each: on / off, cast again and again, wait between casts, and **when** to cast it. |
| **Heals & buffs** | Auto Skills | Heal myself / party members, group heal, buff myself / party / pet, cleanse, resurrect: the skill, the % line (HP / MP / CP), how many members must be low, every how many seconds, and **for whom** (tick the names). |
| **Items** | Auto Items | Potions at a % line (HP / MP / CP), optionally also on a timer; recover the death penalty. |
| **Follow & range** | Follow / Combat options | Follow, follow the party leader or one character, follow distance, follow attack (assist), attack what I select, protect party members, start combat by itself, combat range, height limit, combat zone kind. |
| **Pick up & more** | Pick up / Shots / Resurrection / Pet | Pick up drops (range, which items), which shots, accept resurrection and from whom, resurrection scroll, mass resurrection, pet summon / assist. |
| **Monsters** | Monster settings | Monsters it must never attack (Treasure Chests ...) or should spoil. |

### When to cast (conditions)

Each attack skill has **condition sets**. A set is a list of conditions that must **all** be true (*and*). With several sets, **any**
set is enough (*or*). The conditions are L2Swarm's own: my HP / MP / CP above or below a %, the target's HP, how many monsters are
near me or the target, the distance to the target, charges, souls, a buff or effect I or the target have or lack, the target alive /
dead / spoiled / sweepable, always.

Example: *Hurricane* — set 1: "my MP is above 30 %" **and** "target HP above 20 %"; set 2: "at least 3 monsters near me within 300".

## Saving

**Save to L2Swarm** writes the profile into the character's L2Swarm settings:

1. the character **logs out** (L2Swarm writes its profile on log-out; a change while it is logged in would be lost),
2. the profile is written: only the parts you changed; a copy of the old profile is kept,
3. the character **logs in** again, about 30 seconds in all. Its party waits for it.

You see every step on the page. While its party fights a raid or Kamaloka, or the character itself fights or is dead, the page asks
before it goes ahead. An offline character's profile is written at once and used at its next login.

## Hive or the profile?

The profile is what **L2Swarm** does. Whether L2Swarm or the Hive picks skills, heals and drinks potions is set by the switches in
**Party card → ⚙ Settings → Combat** ([Combat: Hive or your own L2Swarm profile](hive-switches.md)):

- **Hive picks my skills** ON: the Hive casts; the **Attacks** list stays off. OFF: the Attacks list fights.
- **Hive heals** ON: the Hive heals; the **Heals & buffs** list is not used for healing. OFF: the list heals.
- **Fight with L2Swarm** ON: L2Swarm picks the monsters at the hunting spot; with the two switches above OFF it fights exactly with this profile.
