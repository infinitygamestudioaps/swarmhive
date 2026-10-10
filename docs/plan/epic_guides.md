# Epic boss guides from the L2Toggle community (Core, Queen Ant, Orfen)

Fetched 2026-10-10 for the user ("I want this guide used when you are attempting the raid boss Core. Same for Ant Queen and Orfen").
These are faithful plain-text summaries of the three forum posts (short quotes in "quotes"). The bots run them from
`Scripts/data/epic_tactics.json` (swarm.js EPIC-PURE + EPIC HOST blocks, dashboard boss page "Guide" box). Tune values there, not in code.

Our server facts that override the guides:
- **Core is level 50 on our server** (user 2026-10-10; the guide says 40, our datapack says 50). The bots use the live level when they see Core, else 50.
- Orfen: the guide says 60 (aggressive), our datapack says 50. The bots use the live level when seen, else the datapack 50 (open question for the user).
- All our accounts share ONE IP: never more than 10 of our characters inside a "max 10 clients per IP" zone, so one party at a time.

---

## Core — https://community.lineage2toggle.com/index.php?/topic/477-how-to-core-raid-guide/

**Header.** Raid boss Core, level 40 (passive) in the guide; spawn Cruma Tower (Dion). Minions: yes, about 80, level 42-44, all aggressive.
No quest, no quest item, no starting NPC.

**Party.** "Tank & 2 Bishops with noble and blessed blood and 6-7 mages (Sorc or SPH). Melee classes are worthless here."
Suggested level 43. Max clients per IP: 10 (zone with a level cap and no transformations). Gear: C-grade, at least +6 on all weapons,
armour and jewels, more on the tank and the bishops; +0 gear is "poor preparation".

**Route.** Buff in Dion, teleport to Cruma Tower (normal port), port into the tower, port to the 2nd floor, run down the ramp, go left or
right (both take about the same time), port to the 3rd floor. Clear or skip the mobs before the boss room as you like.
(Our data: Dion -> Cruma Tower gatekeeper; Mozella "Teleport into the Tower." (datapack: level <= 55); Penelope "Teleport to the 2nd floor."
at the 1st floor landing; walk to Hanna at the SOUTH end of floor 2, "Go to the 3rd floor."; Teleportation Cubic "Teleport into The Core room.")

**Setup.** Stop all automation before the pull. Take the damage buffs (Berserker Spirit / Zerk dance) off the tank so he keeps his P.Def.
Mages at about 70 attack range, healers at 120 or more. Healers keep blessed blood on themselves and auto-resurrect everyone, the bishops
first; everyone accepts a resurrection and re-applies Noblesse at once.

**Positioning ("This spacing is EXTREMELY IMPORTANT on this one").** Tank in front, mages in the middle, healers at the back at the
furthest distance that is still inside the mages' AoE range, so the polearm minions do not reach the casters and healers.

**Tactic.**
1. The tank goes round a corner and gathers about 40 minions (half the room) WITHOUT starting a fight, then runs back to the agreed wall
   position. This splits the 80 minions into two waves. Do not hit or aggro the boss yet.
2. When the tank holds the first wave, all mages spam AoE at once. Their damage pulls aggro onto the damage dealers; healers that draw
   aggro die and the party wipes.
3. Hate aura ONLY when the second wave comes round the corner (about a one-second window): too early and the second wave goes for the
   bishops, too late and the healers are dead first.
4. Ultimate Defense right after that hate aura.
5. When the minion waves are dead and the dead are raised: Core. Its main threat is an AoE nuke. Minions respawn several times during the
   fight (depending on when they died) until the boss dies. Keep the same positions (spread: tank away from the casters away from the
   healers). Keep hate aura for emergencies — Ultimate Defense is already used.

**Notes.** "This is by far the hardest boss currently on L2Toggle"; the author wipes now and then even with +10 armour / +12 weapons.
Reward: Ring of Core (magic critical damage + casting speed, for mages) plus C/B-grade items and enchant scrolls.

---

## Queen Ant — https://community.lineage2toggle.com/index.php?/topic/476-how-to-ant-queen-raid-guide/

**Header.** Raid boss Queen Ant, level 40 (passive), spawn Ant's Nest (Gludio). Minions: many, level 35-38. No quest, no starting NPC.

**Party.** "Tank & 2 Bishops and 6-7 mages (Sorc or SPH). The only Melee class which stands half a chance would be gladiators spamming AOE
skills." Noble characters are better because of the PvP over Queen Ant. Suggested level 43. Max clients per IP: 10 (with a level cap and
no transformations). Gear: C-grade, +6 or more on weapons and armour; +++ jewels not needed for PvE (but for PvP).

**Route.** Buff up, port Gludio -> Ant's Nest (normal port), run down into the cave. "If you hug the right wall you can't get lost" and it is
the safest route. "If you see a giant bridge you are going the right way."

**Monsters.**
- Guard Ant: the only aggressive monster in the boss room; high aggro range, social, about 10x the HP of a normal monster, boosted
  attack/defence, slow respawn.
- Royal Court Ant: stronger than a guard ant. "When you see these boys rushing you have your hate aura ready, and the Queen isn't far
  behind!" Slow respawn.
- Nurse Ant: weak and slow; heals the Queen and the Larva (about 5 % each heal), the larva first when it is at 0 HP. Almost instant respawn.
- Queen Ant Larva: does not attack, does not move, cannot die. Nurses heal the larva before the Queen.
- Queen Ant: "hits like a mule kicks and just as fast" — bring a tank.

**Tactic.** Mages at follow distance 70, healers at 120. Run straight past the guard ants, royal ants, nurses and the Queen to the LARVA
("LEEROY JENKINS"). There wait for the mages and healers (a good moment to take Zerk / Zerk dance off the tank for P.Def), then target the
larva. Mages spam AoE plus their main nuke, AoE first. Mages stand on top of the boss but still inside AoE range of the larva: constant AoE
damage on the larva means a nurse heal goes to the larva and NOT to the Queen. The tank holds the Queen's aggro.

**Notes.** Mages in "glass cannon" mode (Zerk / Zerk dance) unless their weapons are well enchanted; +6 is the minimum; Acumen weapons for
mages/healers, Health for the tank weapon. Reward: Ring of Queen Ant (critical damage + accuracy, for fighters).

---

## Orfen — https://community.lineage2toggle.com/index.php?/topic/475-how-to-orfen-raid-guide/

**Header.** Raid boss Orfen, level 60 (AGGRESSIVE) in the guide; spawn: a random place in the Sea of Spores (Oren), moves to her nest at
half life. Minions: many, level 58-59. No quest, no starting NPC.

**Party.** "Tank & Bishop for sure. Melee with poles survive his from minions if tank loses aggro but mages do a much better job AOEing."
Suggested level 61. Max clients per IP: unlimited in stage 1 (Sea of Spores), 10 in stage 2 (the nest). Gear: A-grade, +0 works, higher is
better.

**Route.** Buff up, port Oren -> Sea of Spores (normal port), run into the Sea of Spores. Find her by spamming `/target Orfen` (macro) or by
looking for "a giant in the distance".

**Stage 1.** When you first pull Orfen her minions rush you — "resist the urge to UD here. You will need it later." Either focus Orfen with
AoE or thin out some minions so the party survives. At 50 % life Orfen "will instantly teleport back to her nest".

**Stage 2 (the nest, a PvP zone, max 10 clients per IP).** Orfen acts the same, with more minions. "Run in with your tank, NOT hitting
anything", only far enough for Orfen to aggro you, and run back to the entrance of the nest — fewer mobs rush you that way. When the adds
converge: "this is a great time to use hate aura and then UD". The tank keeps the aggro with hate aura while the damage dealers focus
Orfen and the mages AoE the minions. Minions respawn a number of times (depending on gear); later waves are smaller when the positions hold.

**Notes.** "Not that hard as far as skill required compared to other bosses" — positioning and timing matter more than mechanics.
Reward: Earring of Orfen (minor stats + casting speed, for mages/healers).

---

## Server rules for these zones (all three guides)
- Max 10 clients per IP in the Core room, the Queen Ant zone and Orfen's nest (stage 1 of Orfen is unlimited).
- A level cap at the entrance (the real cap per zone is not given; characters above it get ported out). Known: Mozella (Cruma Tower
  entrance) refuses level > 55 (datapack, not checked live). Queen Ant / Orfen nest caps: unknown.
- No transformations in these zones.
- Raid curse: a member more than 8 levels above the boss (or its minions) is cursed.
