# Human fighters: which skills to use, and when (High Five / L2Toggle)

Covers six lines: **Duelist, Dreadnought, Phoenix Knight, Hell Knight, Sagittarius, Adventurer**.
Written 2026-10-26 for the swarm bot. Each class has a table per level band (1-19 base, 20-39 1st class, 40-75 2nd class, 76-85 3rd class).

**Ground truth:** skill names, ids, learn levels, weapons and costs come from `docs/plan/class_skills/<Line>.md`. That file is built from the
L2J H5 `classSkillTree.xml`. Details such as HP cost, abnormal slot, items consumed and target cancel come from `Scripts/data/dp/skills/*.xml`.
Skills marked **[H5-file]** come from the second tree file `Scripts/data/dp/highFiveNewClassSkillTree.xml`.
Since the 06:42 regeneration they are also in the class .md files (see §0.2).

**Board buffs:** they last 12 h, so self-buffs the board already gives are left out. Party buffs such as Haste, Might, Shield and dances are ignored too.
Self-buffs that take the same abnormal slot as a board buff are marked "skip with board buffs".

Markers: ⚠ = uncertain / check live · ⛔ = never auto-cast · 🎯 = situational trigger · ⏱ = toggle (fight only).

---

## 0. Rules for every class (read first)

### 0.1 Bot rules from the datapack

| # | Rule | Why (datapack fact) |
|---|---|---|
| R1 | **Check the weapon before every skill.** Skip a skill whose `weapon` column does not match the equipped weapon. | Most fighter skills have a `<using kind=...>` condition. Power Smash = SWORD/BLUNT, Whirlwind = POLE, Triple Slash = DUAL (a dual sword is NOT "SWORD"), Backstab = DAGGER/DUALDAGGER, Double Shot = BOW. |
| R2 | **Toggles only in fights** (owner rule 2026-10-10). | Every stance drains MP per tick (`ConsumeMpByLevel`). |
| R3 | **Monsters never hit CP.** CP-only skills are PvP-only. | Braveheart 440 (+1000 CP) and Wrath 320 (CP drain) do nothing useful in PvE. |
| R4 | **Skills that eat a corpse** must not run in a party with a spoiler. | Life Scavenge 46 and Corpse Plague 103 have `ConsumeBody`. They destroy the corpse before Sweeper can run. |
| R5 | **Target-cancel skills on the tank's monster.** The tank never uses them on what it tanks. Damage dealers may use them (the monster goes back to the top hater). | `TargetCancel` in Shield Slam 353, Shock Blast 361, Earthquake 347, Shock Stomp 452, Stun Shot 101, Bluff 358, Shadow Step 821. A tank that cancels its own target can drop the boss onto the healer. |
| R6 | **Item-cost skills** run only when the item is in the bag, and never "just because it's ready". | Sonic Buster 9 / Sonic Storm 7 = 3× Energy Stone (5589). Symbols 454/457/458/459/460 = 1× Battle Symbol (8875). Soul of the Phoenix 438 = Phoenix Blood (8873). Dark Panther 283 = Crystal D (1459). Quiver 323/324 and Summon Treasure Key 419 need crystals and free bag room (`invSize`, `weight` conditions). |
| R7 | **Watch the HP cost.** | Earthquake 347 = 340 HP, Shock Blast 361 = 507 HP, Sonic Rage 345 = 50 HP, Sonic Focus 8 = 25 HP, Soul of Sagittarius 303 = 364 HP, Pain of Sagittarius 417 = 407 HP, Touch of Life 341 = 1215 HP, Touch of Death 342 = 669 HP, Sacrifice 69 = 1560 HP. Don't cast below ~40 % HP (except the emergency skills). |
| R8 | **Same-slot buffs replace each other.** Keep only one. | DETECT_WEAKNESS: Detect Insect/Animal/Plant/Beast/Dragon Weakness 75/87/104/80/88, Eye of Hunter 359 and Eye of Slayer 360 all share one slot. FOCUS_DAGGER: Focus Chance 356 and Focus Power 357. MD_UP: Iron Will 72 and the board's Magic Barrier. |
| R9 | **Transformation = never.** | Vanguard 810 (Paladin) / 811 (Dark Avenger) is a 6 h transformation (`TRANSFORM:21600`). It swaps the whole skill bar and halves shield defence (sDef ×0.5). |
| R10 | **Self-root skills** only while the character is meant to stand still. | Ultimate Defense 110, Vengeance 368 and Snipe 313 have `Root`. Never use them while the team walks or the archer kites. |
| R11 | **PvP-only skills = never** in PvE. | Mirage 445 (only vs `L2Playable`), Detection 933 (removes Hide), Touch of Death 342, Wrath 320, Braveheart 440. |

### 0.2 Datapack gaps found while researching (pass these on)

1. **`Scripts/data/dp/highFiveNewClassSkillTree.xml` adds these skills to our classes.** The first generator run (06:30) left it out.
   The regenerated .md files (06:42) include all of them except the passive Sonic Mastery. Checked against Duelist / Phoenix_Knight / Hell_Knight / Sagittarius / Adventurer.md; Dreadnought gets nothing new.

   | Class | Skill | id | Learned | Weapon | Notes |
   |---|---|---|---|---|---|
   | Gladiator / Duelist | Sonic Mastery | 992 | 40-70 (L7), 79 (L8) | — | passive: hits give charges |
   | Duelist | Weapon Blockade | 775 | 80 | DUAL | disarm 5 s, 2 charges, 15 s reuse |
   | Paladin + Dark Avenger | Shield Strike | 984 | 40-74 | SHIELD | `GetAgro` + damage, 6 s reuse |
   | Phoenix Knight + Hell Knight | Shield Strike | 984 | 76-85 (L25) | SHIELD | same skill, higher levels |
   | Phoenix Knight + Hell Knight | Challenge for Fate | 985 | 83 | — | fan aggro, 400 range, `TARGET_LOCK` 5 s, 45 s reuse |
   | Sagittarius | Multiple Shot | 987 | 82 | BOW/CROSSBOW | fan AoE, power 16667, 12 s reuse |
   | Sagittarius | Death Shot | 990 | 83 | BOW/CROSSBOW | single target, power 24306, 12 s reuse |
   | Adventurer | Throwing Dagger | 991 | 80 | DAGGER/DUALDAGGER | 300 range, −80 % speed 10 s, 45 s reuse |
   | Adventurer | Dual Blow | 928 | 83 | DUALDAGGER | blow, power 11234, 8 s reuse |

   These are real H5 skills (lineage2wiki.org lists the same ones). The tables below use them, marked **[H5-file]**.
   Note: Triple Sonic Slash 261 is in the main tree (Gladiator 55-74), not an H5 addition.
2. **Rush Impact** (lineage2wiki: Duelist 83, Dreadnought 83) and **Rush** (la2era: Warlord) are in **neither** tree file. Definitions exist (Rush Impact 793 / 995, Rush 994),
   but no class learns them in our datapack. ⚠ Use them only if the live `get_account_data type=skills` shows them. They are left out of the rotations below.
3. Forgotten-scroll skills (Final Secret, Hide, Dread Pool, Shield Bash …) are mentioned in guides but are in no class tree. Out of scope.

---

## 1. Base Human Fighter (1-19), the same for all six lines

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Levels 1-4 | — | Auto-attack only (no attack skill yet). | any |
| Single target | **Power Strike (3)** | Spam on cooldown (3 s, 17 MP). | SWORD/BLUNT |
| | **Mortal Blow (16)** | Spam (3 s, 30 MP). It's a blow (`blowChance` 20): it lands more often from the side or behind. | DAGGER |
| | **Power Shot (56)** | Opener from range, then on cooldown (6 s, 67 MP: heavy MP for level 5-19, keep it as the opener only). | BOW |
| AoE / toggles / buffs | — | None in this band. | |
| Weapon choice by future line | | Duelist / Dreadnought / knights: sword (knights + shield) → Power Strike. Adventurer: dagger → Mortal Blow. Sagittarius: bow → Power Shot. Pick the skill from the **equipped** weapon (R1). | |
| Party role | | Everyone is a melee/ranged DD. The future knight can already hold monsters with its sword + shield, but has no aggro skill until 24. | |

---

## 2. Duelist line (Warrior → Gladiator → Duelist), dual-sword melee DD

### 2.1 Warrior (20-39)

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Single target | **Power Smash (255)** | Main skill, spam (3 s, 34 MP). | SWORD/BLUNT |
| | Stun Attack (100) | Only with a blunt. A Duelist-to-be uses a sword → skip. | BLUNT |
| AoE | Wild Sweep (245) | Fan attack, **polearm only**. Not for the Gladiator path (sword). | POLE |
| Toggles ⏱ | Vicious Stance (312) | Fight only (crit damage +). | — |
| | Accuracy (256) | From 24, fight only, when misses are visible (cheap). | — |
| Self-buffs | **War Cry (78)** | P.Atk +, 60 s, reuse 45 s → cast at fight start and whenever it has dropped. | — |
| | Battle Roar (121) | Max HP + heals the added HP (10 min, reuse 150 s). 🎯 HP < 50 % in a fight. | — |
| | Lionheart (287) | Stun/sleep/hold/paralyze resist 60 s (reuse 150 s). 🎯 After being stunned/slept, or vs bosses that stun. | — |
| | Detect Insect Weakness (75) | 🎯 Only when the hunting ground's monsters are insects (R8 slot). | — |
| Never auto | — | — | |
| Party role | | Melee DD: assist the leader's target. | |
| Obsolete from the old class | Power Strike (3) | Replaced by Power Smash at 20. | |

### 2.2 Gladiator (40-75): switch to a **dual sword** at 40

How charges work (datapack): **Sonic Focus (8)** = +1 charge (max 7 as Gladiator). Hits also add charges (passive Sonic Mastery 992 [H5-file]). Charge costs:
Sonic Blaster (6) 2 · Sonic Buster (9) 2 · Sonic Storm (7) 2 · Double Sonic Slash (5) 3 · Triple Sonic Slash (261) 4 · Sonic Move (451) 3.

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Before the fight | Sonic Focus (8) | Out of combat, charge to max (5 MP, 0.9 s cast each). | DUAL/SWORD/BLUNT |
| Opener | **Sonic Blaster (6)** | Ranged (600) single hit, 2 charges, on the way in. | DUAL/SWORD/BLUNT |
| Single target, in order | 1. **Triple Sonic Slash (261)** (55+) | Charges ≥ 4 and ready (5 s reuse). Strongest hit. Guides: "the most important skill". | DUAL |
| | 2. **Double Sonic Slash (5)** (49+) | Charges ≥ 3. | DUAL |
| | 3. **Triple Slash (1)** | Filler, no charges (3 s). | DUAL |
| | 4. Sonic Focus (8) | When charges < 3 and nothing else is ready. | |
| | Fatal Strike (190) / Hammer Crush (260) | Need SWORD/BLUNT. **Not usable with duals** → skip (R1). | SWORD/BLUNT |
| AoE | **Sonic Buster (9)** | 3+ monsters in the **front fan** in melee. 2 charges + **3 Energy Stones**. Guide: "the most important skill" for groups. | DUAL/SWORD/BLUNT |
| | Sonic Storm (7) (49+) | 3+ monsters clumped around the target (radius 150, cast range 500). 2 charges + 3 Energy Stones. | DUAL/SWORD/BLUNT |
| | (no Energy Stones) | Single-target rotation only. | |
| Toggles ⏱ | Vicious Stance (312) | Fight only. | — |
| | War Frenzy (424) (58+) | Stun/sleep resist. 🎯 Raids / bosses with stun or sleep. Otherwise off (MP drain). | — |
| Self-buffs | **Duelist Spirit (297)** (64+) | Atk speed + (60 s, reuse 30 s): keep it up in every fight. | DUAL |
| | **War Cry (78)** | As at 20-39: every fight. | — |
| | Battle Roar (121) / Lionheart (287) | Same triggers as 20-39. | — |
| | Detect Animal/Plant/Beast/Dragon Weakness (87/104/80/88) | 🎯 Only the one that matches the monster race of the hunting ground (one slot, R8). | — |
| Situational 🎯 | Sonic Move (451) (62+) | +run speed 15 s, 3 charges: only to catch a fleeing monster / leave. Guide: not worth it before level 2. | DUAL |
| Never auto ⛔ | — | (nothing dangerous in this band) | |
| Party role | | Top single-target melee DD. Attacks the leader/tank's target. Sonic Buster only on monsters the tank already holds (it is a front fan, it can hit monsters that are not pulled yet). | |
| Obsolete | Power Smash (255), Stun Attack (100), Wild Sweep (245) | Need sword/blunt/polearm: replaced by Triple Slash / sonic skills on duals. Detect Insect Weakness keeps working, but its slot is shared (R8). | |

### 2.3 Duelist (76-85)

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Charging | **Sonic Rage (345)** (78) | Ranged (600) hit that also charges up to **8** (5 MP + 50 HP). Use it when charges < 4 in a fight (replaces mid-fight Sonic Focus). Sonic Focus (8) L8 (79) stays the out-of-combat charger. | DUAL |
| Single target | Triple Sonic Slash (261) > Double Sonic Slash (5) > Triple Slash (1) > Sonic Rage (345) | Same order as the Gladiator. Opener Sonic Blaster (6). | DUAL |
| AoE | Sonic Buster (9) / Sonic Storm (7) | Same as the Gladiator (needs Energy Stones). | |
| Toggles ⏱ | Vicious Stance (312) | Fight only. | |
| | War Frenzy (424) | 🎯 Raids. | |
| Self-buffs | Duelist Spirit (297), War Cry (78) | Every fight. | |
| | **Eye of Hunter (359)** (77) / **Eye of Slayer (360)** (78) | 10 min, one slot (R8). Hunter = insects/plants/animals. Slayer = beasts/constructs/giants/dragons. Pick by the target's race. They replace every Detect … Weakness. | |
| Emergency 🎯 | **Sonic Barrier (442)** (79) | 10 s invincible + debuff immune, 5 charges, 15 min reuse. HP < 25 % with charges ≥ 5, or a raid boss AoE. Keep ≥ 5 charges once HP < 40 %. | DUAL |
| | Lionheart (287) | Boss stun/sleep (as before). | |
| Raid / special 🎯 | Weapon Blockade (775) [H5-file] (80) | Disarm 5 s + P.Atk −40 %, 2 charges. ⚠ Raid bosses usually resist disarm. Use on hard-hitting melee elites only, never as a rotation skill. | DUAL |
| | Symbol of Energy (458) (80) | Seal that buffs allies around it (P.Atk), 1 Battle Symbol, 30 min reuse. Raids only, once the party stands still. | |
| Never auto ⛔ | **Riposte Stance (340)** | Reflect 30 %, but atk speed −20 %, speed −10 %, accuracy −4: a DPS loss in PvE. PvP/Olympiad only. | |
| | **Braveheart (440)** | +1000 CP: PvP only (R3). | |
| Party role | | Best single-target melee DD of the humans (raids). Stands behind the boss (CLAUDE.md "melee DDs stand behind the boss"). | |
| Obsolete | Detect … Weakness (75/87/104/80/88) → Eye of Hunter / Slayer. Sonic Focus as the in-fight charger → Sonic Rage. | | |

---

## 3. Dreadnought line (Warrior → Warlord → Dreadnought), polearm AoE DD

Polearm basics: a polearm auto-attack already hits several monsters in front. Guide (la2era): 3 targets by default, the passive raises it to 8 / 13, Fell Swoop +5 → 18.
**Every Warlord/Dreadnought attack skill needs `POLE`.**

### 3.1 Warrior (20-39), Warlord path: take a polearm from 20

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| AoE (main) | **Wild Sweep (245)** | Fan attack (4 s, 34 MP), spam whenever 2+ monsters are in front. Also fine on a single target. | POLE |
| Single target | Auto-attack + Wild Sweep | Power Smash (255) / Stun Attack (100) need sword/blunt → not with a polearm. | |
| Toggles ⏱ / self-buffs | Vicious Stance (312), Accuracy (256), War Cry (78), Battle Roar (121), Lionheart (287), Detect Insect Weakness (75) | Same triggers as the Warrior in §2.1. | |
| Party role | | Melee DD with splash. Only swing at monsters the tank holds (the fan pulls monsters that are not pulled yet). | |
| Obsolete | Power Strike (3) | No polearm skill. | |

### 3.2 Warlord (40-75)

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| AoE, in order | 1. **Whirlwind (36)** | 2+ monsters within 150 of **me** (point blank), 4 s, 75 MP. Ignores shields. | POLE |
| | 2. **Thunder Storm (48)** | Point-blank damage + stun 9 s, 5 s, 107 MP. 2+ monsters within 150. | POLE |
| | **Fell Swoop (421)** (58+) | +5 polearm targets for 120 s, reuse 75 s. 🎯 3+ monsters engaged. | POLE |
| | **Howl (116)** (43+) | Enemies around (200) P.Atk −23 % for 30 s. 🎯 3+ monsters hitting me / the party around me. | — |
| Single target | **Power Crush (920)** | Spam on single targets (3 s). la2era calls it weak, but it is the only polearm single-target skill before 76. | POLE |
| Toggles ⏱ | Vicious Stance (312) | Fight only. | |
| | **Focus Attack (317)** | ⚠ Effect `SingleTarget`: your attacks hit ONE target only, with crit damage + accuracy +. ON only vs a boss / single elite, **OFF while AoE farming** (it removes the polearm splash). | POLE |
| | War Frenzy (424) (58+) | 🎯 Raids (stun/sleep resist). | |
| | Polearm Accuracy (422) (58+) | Guide: "expensive and useless". Only on when misses are visible. | POLE |
| Self-buffs | War Cry (78), Battle Roar (121), Lionheart (287), Detect … Weakness | As before. | |
| | Thrill Fight (130) (46+) | Atk speed + but run speed −20 %, 5 min. Cast at fight start only. ⚠ It slows the team walk, so never while travelling. | |
| Emergency 🎯 | **Revival (181)** (55) | Heals 100 % HP, condition HP ≤ 10 %, 15 min reuse. | |
| | Shock Stomp (452) (55+) | Point-blank stun + target cancel. 🎯 3+ monsters on me and HP < 40 % (buys time for the healer). | POLE |
| Never auto ⛔ | **Provoke (286)** | Aggro on EVERY monster within **900**. A party/train-pull disaster. Only by an explicit user order for solo train farming. | |
| | **Wrath (320)** | Fan CP drain: PvP only (R3). | POLE |
| Party role | | Mass-mob DD. Best when the tank gathers packs. Weak on bosses (lineage2.fandom: "single target damage is not that great"). | |
| Obsolete | Wild Sweep (245) → Whirlwind / Thunder Storm. Power Smash / Stun Attack (sword/blunt). | | |

### 3.3 Dreadnought (76-85)

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| AoE opener | **Shock Blast (361)** (77) | Ranged (500) AoE at the target (radius 150): stun 9 s + P.Def/M.Def −30 %, 8 s reuse, **507 HP**. Opener on a clumped pack (3+). | POLE |
| AoE, in order | **Earthquake (347)** (78) > Whirlwind (36) > Thunder Storm (48) | Earthquake: point blank power 4848, 8 s reuse, **340 HP**, 60 % target cancel. 2+ monsters within 150. | POLE |
| Single target | **Cursed Pierce (921)** (76) > Power Crush (920) | Cursed Pierce: power 3849, 3 s, crit 30 %. Replaces Power Crush as the top single-target skill. | POLE |
| Buffs / toggles | Fell Swoop (421), Howl (116), War Cry (78), Vicious Stance (312), Focus Attack (317) on bosses only | Same as the Warlord. | |
| | Eye of Hunter (359) / Eye of Slayer (360) | Replace Detect … Weakness (one slot, R8). | |
| Emergency 🎯 | Revival (181), Shock Stomp (452) | As before. | |
| Raid 🎯 | War Frenzy (424), Lionheart (287), Symbol of Honor (457) | Symbol (80): area HP/CP regen seal, 1 Battle Symbol, 30 min. la2era: "least useful class skill". Raids only. | |
| Never auto ⛔ | **Parry Stance (339)** (78) | P.Def/M.Def +25 % but atk speed −20 %, speed −10 %, accuracy −4. Only for solo train tanking by user order, **off in a party**. | |
| | Provoke (286), Wrath (320), Braveheart (440) | See above (R3). | |
| Party role | | AoE DD on packs the tank holds; his stuns protect the healer. On bosses: Cursed Pierce + auto-attack with Focus Attack on. | |
| Obsolete | Power Crush (920) becomes filler behind Cursed Pierce. Detect … Weakness → Eye skills. | | |

---

## 4. Phoenix Knight line (Human Knight → Paladin → Phoenix Knight), the party tank

### 4.1 Human Knight (20-39): sword + shield

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Aggro | **Aggression (28)** (24+) | Single taunt, range 800, 6 s reuse (`TargetMe` + `GetAgro`). The pull, plus any monster hitting a non-tank member. | — |
| Damage | Power Strike (3) (stays L9) | Melee filler. | SWORD/BLUNT |
| | Drain Health (70) | Range 600 hit that heals 20 % of the damage. Sustain filler when MP allows. | — |
| CC | **Shield Stun (92)** | Stun 9 s. 🎯 A loose monster on the healer / a fleeing monster. | SHIELD |
| Self-buffs | Majesty (82) | P.Def + / evasion − (5 min). Keep it up while hunting. | |
| | Deflect Arrow (112) (24+) | 20 min, cheap. Keep it up (vs archer monsters). | |
| Heal | Divine Heal (45) (28+) | Self heal, 85 MP. 🎯 HP < 50 % and no healer in the party / healer dead. | |
| Emergency 🎯 | **Ultimate Defense (110)** | Root + huge P/M.Def 30 s, 15 min reuse. HP < 25 % (raids: < 40 %, CLAUDE.md). Never while walking (R10). | |
| Party role | | Tank from 24 (Aggression). Before 24: melee with the party. | |
| Obsolete | Mortal Blow (16), Power Shot (56) | Dagger / bow. | |

### 4.2 Paladin (40-75)

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Aggro rotation | 1. **Aggression (28)** | Pull + re-taunt any monster not targeting me (6 s). | — |
| | 2. **Shield Strike (984)** [H5-file] | Melee hit + aggro (6 s). Spam on the current target. Guide: "use without icons or vs high-evasion targets, eats a lot of MP". | SHIELD |
| | 3. **Aura of Hate (18)** | Point-blank aggro radius 200, 40 s reuse, 102 MP. 🎯 2+ monsters on the party. Guides: "rarely but on point". | — |
| | **Tribunal (400)** (55+) | Hit + target crit rate −50 % for 30 s. Use it on the tanked target (boss / hard hitter) when Shield Strike is on cooldown. | SWORD/BLUNT |
| | Sanctuary (97) (52+) | Point blank 200: enemies P.Atk −23 % 30 s + small damage. 🎯 3+ monsters on me. | — |
| Toggles ⏱ | **Shield Fortress (322)** (64+) | Shield defence +. Fight only. | — |
| | Aegis Stance (318) (46+) | 360° shield block, sDef −30 %. 🎯 ON with 2+ monsters around me (attacks from the side/back), off on single bosses. | — |
| | Divine Armor (197) | Dark resist. 🎯 Vs dark-magic monsters only. | |
| | Divine Blade (196) | Holy attack +10. Low value. ⚠ Optional. | |
| Self-buffs (keep up) | Majesty (82), Deflect Arrow (112) | As before. | |
| | **Combat Aura (982)** (52+) | Party (500 radius) atk speed + P.Atk, 20 min: a real party buff, keep it up (not given by the board). | — |
| | Iron Will (72) | M.Def. **Skip with board buffs** (same MD_UP slot as Magic Barrier, R8). | |
| | Shield Deflect Magic (916) (60+) | Reflects magic damage 8 s, 45 s reuse. 🎯 Vs a casting boss / caster mobs. | SHIELD |
| Heals (support) | Divine Blessing (262) | Heal ally (191 MP) + removes poison/bleed. 🎯 Ally < 40 % and healer dead/out of MP. | |
| | Sacrifice (69) (52+) | Heals an ally with MY HP (1560 HP). 🎯 Ally < 25 % and my HP > 70 %. | |
| | Remedy (44) | Removes bleed/poison from me. 🎯 When bleeding/poisoned and no healer cure. | |
| CC 🎯 | Shield Stun (92) | Adds on the healer. | SHIELD |
| | Shackle (403) / Mass Shackling (404) (55/58+) | Root 10 s single (600) / point blank 150. A runner, or adds while the pack is gathered. | |
| Emergency 🎯 | Ultimate Defense (110) L2 | HP < 25 % (raid < 40 %). | |
| | **Angelic Icon (406)** (58+) | Only at HP ≤ 30 %. Big stats, but **heals received −80 %** → ⛔ never in a party with a living healer. Solo only. | SWORD/BLUNT |
| Never auto ⛔ | **Vanguard (810)** | Transformation (R9). | SWORD |
| | Banish Undead (405) | Undead only + fear (`RunAway`): scattered undead pull more monsters. Never in a party. | |
| | Divine Strike (49) | Magic hit, undead only. 🎯 Solo vs undead only. | |
| Party role | | **Main tank**: holds everything on himself, pulls with Aggression, uses Aura of Hate on packs, no target cancel on his own target (R5). | |
| Obsolete | Divine Heal (45) → Divine Blessing (262). Drain Health (70) stops at L13 (Paladin gets no higher levels) → use Shield Strike / Tribunal. Power Strike → Shield Strike. | | |

### 4.3 Phoenix Knight (76-85)

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Aggro rotation | Aggression (28) > **Shield Strike (984)** [H5-file] > Tribunal (400) > Aura of Hate (18) | As the Paladin. | |
| | **Challenge for Fate (985)** [H5-file] (83) | Fan aggro (400), `TARGET_LOCK` 5 s, 45 s reuse, plus a P/M.Def self-buff 15 s (linedia). 🎯 3+ monsters in front. Alternate with Aura of Hate. | — |
| Toggles ⏱ | Shield Fortress (322), Aegis Stance (318) | As before. | |
| | **Fortitude (335)** (76) | Shock/paralyze resist. 🎯 Raids / stunning bosses. | |
| Self-buffs | **Iron Shield (527)** (79) | 20 min, proc on hits ≥ 100 damage. Keep it up while hunting. | |
| | Combat Aura (982), Majesty (82), Deflect Arrow (112) | Keep them up. | |
| | Physical Mirror (350) (78) | Reflects debuffs 5 min, 150 s reuse. 🎯 Raids vs debuffing bosses. | SHIELD |
| Emergency 🎯 | **Vengeance (368)** (77) | Root + P.Def +5400 / M.Def +4050 30 s, 40 % taunt chance around (200), 15 min reuse. Big pull / raid boss spike, HP < 50 %. | SHIELD |
| | Ultimate Defense (110) | HP < 25 % (raid < 40 %). Not at the same time as Vengeance (stagger them). | |
| | **Shield of Faith (528)** (79) | Party (1000): +P/M.Def and **90 % of their damage goes to me**, 15 s, 15 min reuse. 🎯 Raid AoE: 3+ members < 50 % while my HP > 70 %. Never when I'm low. | |
| | **Touch of Life (341)** (78) | Heals a FRIEND 50 % max HP + heal received +30 % 2 min, costs 1215 HP, 5 min reuse. 🎯 An ally < 25 % with no heal coming / healer dead. | |
| | Divine Blessing (262), Sacrifice (69) | As the Paladin. | |
| Raid / special 🎯 | **Soul of the Phoenix (438)** (79) | 30 min buff: you rise after death (100 %). 1 Phoenix Blood (8873), 1 h reuse. Raids only, before the pull, only if the item is in the bag. | |
| | Symbol of Defense (454) (80) | Defence seal, 1 Battle Symbol. Raid only, when the party stands still. | |
| Never auto ⛔ | **Shield Slam (353)** | Physical silence 60 s but 80 % **target cancel**. Never on my own tanked target (R5). ⚠ OK on an add that is hitting the healer. | SHIELD |
| | Angelic Icon (406), Vanguard (810), Banish Undead (405) | As the Paladin. | |
| Party role | | Raid/party main tank. "Every instance and raid wants one" (l2calendar). The defensive knight. | |
| Obsolete | Aura of Hate is complemented (not replaced) by Challenge for Fate. Nothing else replaced. | | |

---

## 5. Hell Knight line (Human Knight → Dark Avenger → Hell Knight), off-tank / second tank

### 5.1 Human Knight (20-39)
Same as §4.1.

### 5.2 Dark Avenger (40-75)

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Aggro rotation | Aggression (28) > **Shield Strike (984)** [H5-file] > Aura of Hate (18) | As the Paladin. | |
| | **Judgment (401)** (55+) | Hit + `GetAgro` + target crit damage −35 % 30 s. Spam on the tanked target (second aggro tool). | SWORD/BLUNT/DUAL |
| Damage / sustain | **Drain Health (70)** (to L53) | Range 600 drain. The DA keeps it to 74: filler when MP allows. | — |
| Toggles ⏱ | Shield Fortress (322) (64+) | Fight only. | |
| Self-buffs (keep up) | **Reflect Damage (86)** | 20 min reflect melee. Keep it up. | |
| | Majesty (82), Deflect Arrow (112), Combat Aura (982) (52+) | Keep them up. | |
| | Iron Will (72) | **Skip with board buffs** (R8). | |
| | Shield Deflect Magic (916) | 🎯 Vs casters. | SHIELD |
| CC 🎯 | Shield Stun (92), Shackle (403), Hamstring (127) | Shield Stun / Shackle: adds on the healer. Hamstring (run speed −30 %): a runner. | |
| Emergency 🎯 | Ultimate Defense (110) | HP < 25 % (raid < 40 %). | |
| Solo only ⛔ in a party | **Summon Dark Panther (283)** | Costs Crystal D (1459), and the panther takes **15 % of the exp** (`expMultiplier 0.85`). Solo leveling only. Old guides call it "the main weapon" solo. Never in the 9-man party. | |
| | **Life Scavenge (46)** | HP from a corpse: destroys it (`ConsumeBody`) → never with a spoiler (R4). Solo: 🎯 HP < 60 % with a corpse near. | |
| | **Corpse Plague (103)** | Corpse AoE poison: corpse eaten (R4), low damage. Never. | |
| Never auto ⛔ | **Horror (65)** | Fear: the monster runs and pulls others. | |
| | **Vanguard (811)** | Transformation (R9). | |
| | Banish Seraph (450) | Divine race only + fear. | |
| Party role | | Second tank / off-tank: takes the adds while the main tank holds the boss. With no other knight he is the main tank (same rotation). | |
| Obsolete | Divine Heal (45) (DA gets no higher levels), Power Strike (3). | | |

### 5.3 Hell Knight (76-85)

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Aggro rotation | Aggression (28) > Shield Strike (984) [H5-file] > Judgment (401) > Aura of Hate (18) > **Challenge for Fate (985)** [H5-file] (83, 3+ in front) | | |
| Toggles ⏱ | Shield Fortress (322), Fortitude (335) (raids) | | |
| Self-buffs | Iron Shield (527) (79), Reflect Damage (86), Combat Aura (982), Majesty (82) | Keep them up. | |
| | **Shield of Revenge (439)** (79) | 5 min: reflects melee physical **skills** 20 %, 150 s reuse. 🎯 In fights vs melee bosses / elites. | |
| | Physical Mirror (350) (78) | 🎯 Raids vs debuffers. | SHIELD |
| Emergency 🎯 | Vengeance (368), Ultimate Defense (110), Shield of Faith (528) | Same triggers as the Phoenix Knight. | |
| Raid 🎯 | Symbol of Defense (454) | Battle Symbol, raids. | |
| Never auto ⛔ | **Touch of Death (342)** | PvP skill: CP −90 %, removes up to 5 buffs, costs 669 HP. ⚠ On a boss only the debuff part works (debuff vulnerability +30 %, heal received −30 % for 2 min). Use it only if the raid plan asks for it, never in the rotation. | |
| | Shield Slam (353) (R5), Horror (65), Dark Panther (283) in a party, Vanguard (811), Life Scavenge / Corpse Plague (R4) | | |
| Party role | | Off-tank / second raid tank, more damage than the PK, fewer party saves (no Touch of Life / Soul of the Phoenix). | |
| Obsolete | — (Drain Health becomes minor next to Judgment / Shield Strike) | | |

---

## 6. Sagittarius line (Rogue → Hawkeye → Sagittarius), bow archer DD

### 6.1 Rogue (20-39), Sagittarius path: bow

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Single target | **Power Shot (56)** | Main skill (to L24), 6 s, 67 MP. Spam while MP > 30 %, otherwise auto-shots. | BOW |
| | **Stun Shot (101)** (36) | Damage + stun 9 s (40 % chance), 3 s. 🎯 A monster on me / on the healer, or a runner. | BOW |
| Toggles ⏱ | Vicious Stance (312), Accuracy (256) | Fight only. | |
| Self-buffs | **Rapid Shot (99)** (32) | Bow atk speed +, 20 min: keep it up. | BOW |
| | Dash (4) | +speed 15 s: 🎯 to escape / reposition, never as a routine buff. | |
| Emergency 🎯 | **Ultimate Evasion (111)** (28) | Evasion + 30 s, 15 min reuse. HP < 40 % with a monster on me. | |
| Never auto ⛔ | Unlock (27) | Chests/doors only (the bot ignores Treasure Chests). | |
| | Mortal Blow (16), Bleed (96) | Dagger only → skip with a bow. | DAGGER |
| Party role | | Ranged DD. Stands 600-900 behind the tank and shoots the tank's target. Never pulls in a party. | |

### 6.2 Hawkeye (40-75)

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Single target | **Double Shot (19)** | Main skill, 3 s, 150 MP. Spam. | BOW |
| | Stun Shot (101) | 🎯 As before (CC on an add, peel for the healer). Also a filler when MP is fine. | BOW |
| AoE | **Burst Shot (24)** (46+) | AoE at the target (radius 150), 6 s, **224 MP**. 🎯 3+ monsters clumped on the tank. | BOW |
| Toggles ⏱ | Vicious Stance (312) | Fight only. | |
| Self-buffs (20 min, keep up) | Rapid Shot (99), **Spirit of Sagittarius (415)** (physical MP cost −30 %), **Blessing of Sagittarius (416)** (physical reuse −20 %) | 58+. Keep them up. | |
| | Soul of Sagittarius (303) | Max MP +, **costs 364 HP**. Cast when HP > 80 % (out of combat). | |
| | Hawk Eye (131) | Accuracy +, own P.Def −10 %, 5 min. Fight only. ⚠ Skip while tanking adds. | |
| MP 🎯 | **Pain of Sagittarius (417)** (58+) | MP from HP (407 HP). MP < 30 % and HP > 70 %. | |
| Raid / party 🎯 | **Snipe (313)** (60+) | +range 200, P.Atk, crit +20 %, 120 s, 75 s reuse, **roots you**. ON only standing in place behind a tank (party spot, raid). **Never** when a monster is on me, while kiting or while the team moves (R10). | BOW |
| Emergency 🎯 | Ultimate Evasion (111) L2, Dash (4) | As before. | |
| Never auto ⛔ | Quiver of Arrow A/S (323/324) | Makes arrows from crystals, needs bag room: supply logic only, never in a fight. | |
| | Detection (933) (74) | Removes Hide: PvP only. | |
| Party role | | Ranged DD. With Snipe on he outranges everything: stand still at the edge of the fight. | |
| Obsolete | Power Shot (56) → Double Shot (19). Mortal Blow / Bleed (dagger). | | |

### 6.3 Sagittarius (76-85)

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Single target, in order | 1. **Death Shot (990)** [H5-file] (83) | Power 24306, 12 s. | BOW/CROSSBOW |
| | 2. **Lethal Shot (343)** (76) | Power 7698 + half-kill chance, 8 s. | BOW |
| | 3. **Double Shot (19)** | Filler. | BOW |
| | Hamstring Shot (354) (77) | Damage + slow −30 % 60 s, 15 s reuse. 🎯 Runners / kiting solo. | BOW |
| AoE | **Multiple Shot (987)** [H5-file] (82) | Fan (900), power 16667, 12 s. 🎯 3+ monsters in front of me (on the tank). Before 82: Burst Shot (24). | BOW/CROSSBOW |
| Toggles ⏱ | **Focus Skill Mastery (334)** (78) | Skill-mastery chance ×11, fight only. ⚠ Together with Vicious Stance? Both are toggles; the datapack shows no shared slot, so keep both on in fights (check live MP drain). | |
| Self-buffs | Rapid Shot, Spirit / Blessing / Soul of Sagittarius, Hawk Eye | As the Hawkeye. | |
| Raid / party 🎯 | Snipe (313) | As the Hawkeye. | BOW |
| | Symbol of the Sniper (459) (80) | Bow/crossbow seal for allies, 1 Battle Symbol. Raids, archer-heavy parties. | |
| Emergency / never | Ultimate Evasion (111), Dash (4) 🎯 · Quiver (323/324), Detection (933) ⛔ | | |
| Party role | | Ranged DD. Best in archer parties and mass fights (l2calendar). | |
| Obsolete | Burst Shot (24) → Multiple Shot (82). Double Shot becomes filler behind Death / Lethal Shot. | | |

---

## 7. Adventurer line (Rogue → Treasure Hunter → Adventurer), dagger blow DD

Positioning: blow skills land more often from the side/back. Backstab works **only from behind**. In a party the tank holds the monster, so the dagger stands behind it.
swarm.js already has `Scripts/data/positional_skills.json` (POSBEHIND, CLAUDE.md §6f). Blow skills should follow it.

### 7.1 Rogue (20-39), Adventurer path: dagger

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Single target | **Mortal Blow (16)** (to L24) | Spam (3 s, 30 MP), from the side/back. | DAGGER |
| | Bleed (96) (24+) | Bleed DoT 20 s + slow. 🎯 Long-lived targets (elites, raid minions); not on trash that dies in 3 hits. | DAGGER/DUALDAGGER |
| | Power Shot (56) | Only if a bow is equipped (some players level the Rogue with a bow); otherwise skip. | BOW |
| Toggles ⏱ / buffs / emergency | Vicious Stance (312), Accuracy (256), Dash (4) 🎯, Ultimate Evasion (111) 🎯 HP < 40 % | As §6.1. | |
| Never auto ⛔ | Unlock (27), Rapid Shot (99), Stun Shot (101) with a dagger | | |
| Party role | | Melee DD behind the tank's target. | |

### 7.2 Treasure Hunter (40-75)

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Opener (behind) | **Critical Blow (409)** (55+) | Blow + 15 s blow-rate buff (`MIGHT_MORTAL`), 30 s reuse. First hit of each fight / on cooldown. | DAGGER/DUALDAGGER |
| Single target, in order | 1. **Backstab (30)** | Only from behind (POSBEHIND). 3 s, 112 MP. | DAGGER/DUALDAGGER |
| | 2. **Deadly Blow (263)** | Any side (better from the side/back), 3 s, 68 MP. The main spam skill. | DAGGER/DUALDAGGER |
| | Bleed (96) | 🎯 Long fights (as before). | |
| AoE | — | Daggers have no AoE. | |
| Toggles ⏱ | Vicious Stance (312) | Fight only. | |
| Situational 🎯 | **Shadow Step (821)** | Teleport behind the target (600 range) + target cancel, 75 s reuse. Gap closer when the target is > 200 away, or to get behind a monster that faces me. | — |
| | **Trick (11)** (49+) | Removes MY hate (80 %). In a party with a tank: when a monster turns to me and HP < 60 %. | |
| | Sand Bomb (412) (55+) | Accuracy down 30 s. 🎯 A monster hitting me. | |
| | Veil (106) (43+) | The monster turns passive 120 s. 🎯 An extra add on me while the party is busy (let it sit). ⚠ It stops when damaged. | |
| | Escape Shackle (453) (60) | Removes root. 🎯 When rooted. | |
| | Dash (4) L2 (46) | 🎯 Catch up / escape. | |
| | Lure (51) (52) | Adds 500 hate to one target from 400. 🎯 Only if the dagger is the chosen puller (not with a tank). | |
| Emergency 🎯 | **Ultimate Evasion (111)** L2 (55) | HP < 40 % with monsters on me. | |
| Never auto ⛔ | **Switch (12)** | Randomizes the monster's hate: it may jump onto the healer. | |
| | **Fake Death (60)** | Toggle, 200 MP: the character lies down "dead". Manual escape only. | |
| | **Silent Move (221)** | Speed −40 %: manual sneaking only. | |
| | **Stealth (411)** (58+) | P.Atk ×0.55, accuracy −12: never in a fight (guides: travel/PvP). | |
| | Summon Treasure Key (419) | Crystals + bag room (R6). | |
| | Unlock (27), Find Trap (623), Remove Trap (624) | Chests/doors/traps only. | |
| Party role | | Burst DD behind the boss/tank target. Fragile: never tanks. Trick / Ultimate Evasion when aggro slips. | |
| Obsolete | Mortal Blow (16) → Deadly Blow / Backstab. Power Shot / Stun Shot / Rapid Shot (bow). | | |

### 7.3 Adventurer (76-85)

| Aspect | Skill (id) | Rule / trigger | Weapon |
|---|---|---|---|
| Fight setup | **Focus Power (357)** (78) | Crit damage side +30 % / back +60 % (front −30 %), 2 min, 30 s reuse. Keep it up in fights. Focus Chance (356) shares the slot: use Focus Power (the TH guide says tune it for back crit power). | DAGGER/DUALDAGGER |
| | **Critical Wound (531)** (79) | Target takes crit damage +30 % for 30 s, 8 s reuse. 🎯 Bosses / elites / anything that lives > 10 s. | DAGGER/DUALDAGGER |
| Single target, in order | 1. **Dual Blow (928)** [H5-file] (83) | Dual daggers only: power 11234, 8 s. | DUALDAGGER |
| | 2. Critical Blow (409) | Opener / cooldown. | |
| | 3. **Lethal Blow (344)** (76) | Power 5773, 4 s, half-kill chance. | DAGGER/DUALDAGGER |
| | 4. Backstab (30) (from behind) / Deadly Blow (263) | Fillers. | |
| Positioning 🎯 | **Bluff (358)** (77) | Stun 9 s + the target turns its back + loses hate on me (80 %), 8 s reuse. Use it when the target faces me (it's hitting me), then Backstab. ⚠ On the tank's target it can move aggro (R5); with a tank holding it, I'm already behind it, so skip. | DAGGER/DUALDAGGER |
| | Shadow Step (821), Throwing Dagger (991) [H5-file] (80) | Throwing Dagger: 300 range, −80 % speed 10 s, 45 s. 🎯 A runner / a monster running to the healer. | |
| Toggles ⏱ | **Focus Skill Mastery (334)** (78), Vicious Stance (312) | Fight only (see the ⚠ in §6.3). | |
| Raid 🎯 | Symbol of the Assassin (460) (80) | Evasion/crit seal, 1 Battle Symbol. Raids. | |
| Emergency 🎯 | Ultimate Evasion (111), Trick (11), Sand Bomb (412), Escape Shackle (453) | As the TH. | |
| Never auto ⛔ | **Mirage (445)** | Works only vs players (`L2Playable`). | |
| | Switch (12), Fake Death (60), Silent Move (221), Stealth (411), Summon Treasure Key (419), Unlock / traps | As the TH. | |
| Party role | | Highest burst DD on single targets (raids, elites). Always behind the target. | |
| Obsolete | Deadly Blow becomes filler behind Lethal / Dual Blow. Focus Chance (356) is never needed (same slot as Focus Power). | | |

---

## 8. Party roles in the automated 9-man party (summary)

| Role | Class (band) | What the bot must guarantee |
|---|---|---|
| Main tank | Phoenix Knight / Paladin (Knight from 24) | Aggression pull + re-taunt every add not on him · Shield Strike spam · Aura of Hate / Challenge for Fate on packs · no target cancel on his own target · Ultimate Defense / Vengeance on HP triggers · Shield of Faith / Touch of Life to save members · Combat Aura always up. |
| Off-tank | Hell Knight / Dark Avenger | Same aggro kit on the adds. Never the panther, Horror, corpse skills in a party. |
| Melee single-target DD | Duelist / Gladiator, Adventurer / TH | Assist the tank's target only after the tank has it (CLAUDE.md raid order). Stand behind it. Sonic Buster (Duelist) only on held monsters. Dagger: Trick / Ultimate Evasion when aggro slips. |
| Melee AoE DD | Dreadnought / Warlord | AoE only on packs the tank holds. Focus Attack OFF when AoE farming, ON on bosses. Never Provoke. Parry Stance off. |
| Ranged DD | Sagittarius / Hawkeye | 600-900 behind the tank. Snipe only standing still. Stun Shot / Hamstring Shot to peel monsters off the healer. Never pull. |

---

## 9. Sources

- lineage2wiki.org H5 class pages (3rd-class skills incl. 80-83 additions, Rush Impact listing): [Duelist](https://lineage2wiki.org/hi-five/class/duelist/), [Dreadnought](https://lineage2wiki.org/hi-five/class/dreadnought/), [Adventurer](https://lineage2wiki.org/hi-five/class/adventurer/), [Sagittarius](https://lineage2wiki.org/hi-five/class/sagittarius/). The Phoenix / Hell Knight pages returned 404.
- [la2era: Warlord / Dreadnought guide for High Five](https://la2era.com/ru/library?item=warlord_HF): polearm target counts, Fell Swoop, Shock Stomp + Shock Blast, Provoke, "Polearm Accuracy useless", "Symbol of Honor least useful", Rush / Rush Impact.
- [linedia: Paladin High Five changes](https://linedia.ru/wiki/%D0%93%D0%B0%D0%B9%D0%B4_Paladin_High_Five): Shield Strike + hate effect, Challenge for Fate (83), Vanguard at 40.
- [ThugzMansion forum: Phoenix Knight guide](https://forum.thugzmansion.ru/index.php?topic=178.0): Aura of Hate / Aggression / Vengeance use, Angelic Icon −80 % heal, Shield of Faith 90 % transfer (⚠ chronicle not stated).
- [Asterios: Paladin guide](https://forum.asterios.tm/topic/223520-%D0%B3%D0%B0%D0%B9%D0%B4-%D0%BF%D0%BE-%D0%BF%D0%B0%D0%BB%D0%B0%D0%B4%D0%B8%D0%BD%D1%83/) (Interlude era) and [Asterios: Treasure Hunter guide, High Five](https://forum.asterios.tm/topic/223433-%D0%B3%D0%B0%D0%B9%D0%B4-%D0%BF%D0%BE-%D1%82%D1%85-%D0%BF%D0%BE%D0%BB%D0%BD%D0%B0%D1%8F-%D0%B2%D0%B5%D1%80%D1%81%D0%B8%D1%8F-high-five/) (mostly PvP: Bluff, Shadow Step, Focus Power for back crit, Trick / Switch).
- [l2argument: Gladiator guide](https://l2argument.ru/moi.html) (charge costs, Triple Sonic Slash / Sonic Buster "most important", War Cry) and [l2argument: Hawkeye guide](https://l2argument.ru/moihawk.html) (Snipe root, Spirit / Blessing / Soul / Pain of Sagittarius).
- [l2vika: Dark Avenger guide](https://l2vika.ru/gameplay/gaid-dark-avenger.html) (Interlude: panther as the solo "main weapon", corpse skills, Judgment aggro).
- [l2calendar: best High Five classes](https://l2calendar.com/blog/high-five-best-classes): class roles.
- lineage2.fandom (via search snippet): Dreadnought "solo farm massive trains … not much value in boss fights".
- Datapack facts (HP costs, slots, item costs, target cancel, conditions): `Scripts/data/dp/skills/*.xml`, `classSkillTree.xml`, `highFiveNewClassSkillTree.xml`.

**Uncertain / check live (⚠):** Rush / Rush Impact availability on L2Toggle · whether Focus Skill Mastery and Vicious Stance run together · Weapon Blockade on raid bosses ·
Touch of Death's value on bosses · Veil breaking on damage · whether the board's "All Buffs" scheme carries a MAX_HP_UP buff (Bless the Body) that would block Battle Roar (the Warrior / Defender schemes do not).
Most English H5 guide pages (l2wiki.com, strategywiki, maxcheaters, l2topzone) refused the fetch (403/503). The advice above therefore leans on Russian H5 guides and the datapack itself.
