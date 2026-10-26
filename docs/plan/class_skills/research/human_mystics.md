# Human mystic lines: which skill, when (H5 / L2Toggle)

Covers **Archmage, Soultaker, Arcana Lord, Cardinal, Hierophant**. Skill names, ids and learn levels come from
`docs/plan/class_skills/<Line>.md` (L2J H5 datapack). Extra facts such as element, item cost, AoE size and duration come from
`Scripts/data/dp/skills/*.xml` (read 2026-10-26). Play advice comes from the guides listed under **Sources** at the end.
`[U]` = uncertain, check in game. `[rec]` = my own recommendation (no guide says it), based on the skill data.

**Ground rules used in this document**
- **Board buffs (12 h, Alt+B):** they cover P.Atk/P.Def/M.Atk/M.Def, Haste, crit, speed/Wind Walk, Focus, Guidance, Berserker, Empower,
  Acumen, Concentration, Mental Shield, Magic Barrier, Improved buffs, Blessing of Queen, songs and dances. There are **pet schemes** too
  (`docs/plan/skills.md`, `server_features_kain.md`). The board does **not** give Prophecy of Fire/Wind/Water, Chant of Victory,
  Magnus' Chant or Voice of Prophecy, and gives most resists only with premium. A class buff with the same abnormal type as a board
  buff is a **board conflict**: cast it only when the board buff is missing.
- **Owner rule: healers ONLY heal.** On these lines that means Bishop/Cardinal. I flag every place where guides tell healers to attack.
- **Item costs:** 3031 = Spirit Ore, 8874 = Einhasad's Holy Water, 8876 = Magic Symbol. A skill fails without its item.
- **AoE rule** (as in `caster_skills.md`): AoE only when 3+ mobs stand inside the skill's radius.

---

## 0. Read first: data problems that cause "wrong skills"

### 0.1 The `kind` column in the ground-truth md is wrong for these skills
The extractor (`class_skills_extract.js`) labels skills by target type. Several POINT_BLANK enemy effects, transforms and teleports come out
as **"self buff"**, and some party heals come out as "self-heal". If the bot auto-casts "self buffs", the skills below are a real danger.

| Skill (id) | md says | What it really does | Correct handling |
|---|---|---|---|
| Inquisitor (1520) | self buff | **Transforms** the Bishop into a holy attacker (6 h). Heals are blocked while transformed. | Never auto |
| Return (1050) | self buff | **Teleports you to town** | Never auto |
| Invocation (1430) | self buff | **Stuns yourself** for 30 s, P.Def x0.1, gives MP per tick, 15 min reuse | Manual only, out of combat |
| Body To Mind (1157) | self buff | Spends HP to gain MP | MP tool (rules below) |
| Requiem (1049), Repose (1034) | self buff | AoE around you that affects **undead enemies** | Never (healer) |
| Word of Fear (1272) | self buff | AoE **fear** on enemies around you, 150 s reuse | Emergency only |
| Mass Warrior Bane (1344), Mass Mage Bane (1345) | self buff | AoE that **strips buffs from enemies** (PvP) | Never in PvE |
| Mass Block Shield (1360), Mass Block Wind Walk (1361) | self buff | AoE enemy debuff (strips and blocks buffs, PvP) | Never in PvE |
| Seed of Fire (1285) | self buff | Real self buff (+20 fire attack, 10 min) | Keep up (Sorcerer 66+) |
| Group Heal (1027), Greater Group Heal (1219), Major Group Heal (1402) | self-heal | **Party heals** (range 1000) | Party heal logic |
| Mass Resurrection (1254) | self-heal | Resurrects **dead clan members only** (DEAD_PLEDGE), not the party | Only if the dead are clanmates |
| Purification Field (1425), Miracle (1426) | self-heal / party buff | **Clan-wide** (PLEDGE) cleanse / full heal, cost a Magic Symbol, 20 / 60 min reuse | Manual only |
| Balance Life (1335), Benediction (1271) | party buff | Party **heals** (Balance Life evens out HP %, Benediction full-heals the party but only works when your MP is 25 % or less) | Heal logic |
| Restore Life (1258) | debuff/CC | Heals a friendly target for 15-30 % of its max HP (cannot target monsters) | Heal logic |
| Cancellation (1056) | heal/support | Strips **enemy** buffs (25 % chance, up to 5) | Never in PvE |
| Curse Gloom (1263) | attack | Debuff (M.Def down, unholy weakness) that also does small damage | Opener debuff |
| Day of Doom (1422), Anti-Summoning Field (1424) | summon | Places a ground NPC field (PvP debuff / anti-summon), costs a Magic Symbol, 30 min reuse | Never auto |
| Mass Surrender to Fire (1383) | debuff | Centered on **your servitor** (SUMMON POINT_BLANK) | Only when the pet stands in a pack |

| Chain Heal (1553) | debuff/CC | **Party heal** (target plus up to 9 most-hurt nearby allies, 30 % of max HP each, diminishing) | Heal logic (Cardinal 83+) |
| Arcane Shield (1556) | self buff | Emergency: 70 % of damage taken goes to MP for 10 s, 5 min reuse | Emergency only, never as a routine buff |

### 0.2 H5 additions (from `highFiveNewClassSkillTree.xml`)
The first md generation missed these. The md files regenerated on 2026-10-26 06:42 **include them now**, so they count as ground truth and
they are used in the band tables below.

| Class | Skill (id), level | Data |
|---|---|---|
| Warlock / Arcana Lord | **Dimension Spiral (1558)**, 40-85 | The summoner's own single-target nuke (15 s reuse, PvE power higher than PvP) |
| Archmage | Aura Blast (1554) 81, Aura Cannon (1555) 82, Arcane Shield (1556) 83 | Non-elemental nukes that **restore MP**. Arcane Shield: 70 % of damage goes to MP for 10 s, 5 min reuse |
| Soultaker, Arcana Lord | Servitor Share (1557) 83 | Pet inherits master stats, 20 min |
| Cardinal | **Chain Heal (1553)** 83 | Heals 30 % max HP on the target and up to 9 most-hurt nearby allies (diminishing), 4 Spirit Ore, 5 s reuse. Cardinal's best party heal at 83+ |
| Prophet | Resist Earth (1548) 60-68 | Earth resist buff |
| Hierophant | Piercing Attack (1564) 80 | Passive (not in the md, which lists active skills only; no action needed) |

Forgotten Scroll skills (Enlightenment, Sublime Self-Sacrifice, Servitor Barrier, Vampiric Mist, Meteor, Improved Combat/Condition,
Counter Critical, ...) are in no class tree. L2Toggle does not auto-learn them. Use them only if a character owns them.

### 0.3 Corrections to `docs/plan/skills.md` (I did not edit it)
- *"Death Spike 1148 (needs corpse)"* is wrong. Death Spike is a normal ENEMY nuke. In H5 it also **needs no Cursed Bone** (no itemConsume in
  the datapack, and linedia's H5 guide says the same). **Corpse Burst 1155** is the skill that needs a corpse.
- *"Restore Life 1258 (44+, HoT)"* is wrong. It is an **instant** heal for a percentage of max HP (15/20/25/30 %), with an 8 s cast and 30 s reuse.
- Necro1 76-85 lists Gehenna, Day of Doom, Mass Warrior Bane and Mass Mage Bane as rotation. Gehenna and Day of Doom have 30 min reuse and
  cost a Magic Symbol, and the Banes are PvP buff strips. **None of them should be in an auto rotation.**
- Bishop 1-19 *"Attacks until 20: Wind Strike, Vampiric Touch"* goes against the healer-only rule (see §1).
- Bishop 76-85 lists Chain Heal 1553. That is correct (83+, now in the md too), but the md labels it "debuff/CC" (see 0.1).

---

## 1. Shared band: Human Mystic 1-19 (all five lines)

| When / trigger | Skill (id) | Notes |
|---|---|---|
| Primary nuke | **Wind Strike (1177)** | Wind, 600 range, 4 s cast. Main attack until 20. |
| Opener on melee mobs | Ice Bolt (1184), 7+ | Water. -20 % move speed for 60 s, so you can kite. Weaker than Wind Strike. |
| Own HP < 60 % and MP > 40 % | Vampiric Touch (1147), 14+ | Dark drain (40 % of damage back as HP). Linedia: expensive, use only when MP is high and HP low. |
| Own HP < 50 % | **Battle Heal (1015)**, 14+ | 2 s cast. Linedia: "instant cast, still useful at 70+". |
| Own HP 50-75 %, out of combat | Heal (1011), 7+ | 5 s cast, cheaper. |
| Party: 2+ members < 70 % | Group Heal (1027), 14+ | 7 s cast, range 1000. |
| Poisoned | Cure Poison (1012) | Only when a poison is on. |
| Board conflict | Might (1068), Shield (1040) | The board gives P.Atk/P.Def. |
| Never / rare | Curse Poison (1168), Curse Weakness (1164) | Linedia: skip. The weak DoT / P.Atk-down is not worth the MP. |
| Obsolete | Self Heal (1216) | Power 42 and a 5 s cast. Replaced by Heal at 7 and Battle Heal at 14. |

**Healer conflict:** guides level future Clerics solo by nuking with Wind Strike. Under the owner rule, a future Bishop/Prophet at 1-19
should level **in a party** (heal only), or the owner allows a 1-19 exception. Pick one deliberately. Never let the bot decide silently.

---

## 2. Shared band: Human Wizard 20-39 (Archmage, Soultaker, Arcana Lord)

| When / trigger | Skill (id) | Notes |
|---|---|---|
| Primary nuke | **Blaze (1220)** | Fire, 750 range, power up to 44. Linedia (Necro H5): "Blaze is the main attack until 44-48". |
| Finisher / cheap filler | Energy Bolt (1274) | Non-elemental, 400 range, 2 s cast, low MP. Use it on fire-resistant mobs too. |
| Target is in melee range | Aura Burn (1172) | 150 range only. Do **not** let a ranged bot walk in to use it. |
| AoE, 3+ mobs within 200 of the target | Flame Strike (1181) | Fire, 500 range, hits 5+ targets. Linedia: spiders at Maille Lizardmen, two Flame Strikes. |
| Long fight (tough mob / boss) | Surrender To Fire (1083), 25+ | -fire resist for 30 s (also +10 water resist). Only if the mob survives 4+ nukes. Linedia: skip on normal mobs. |
| Own MP < 40 % and HP > 70 % | **Body To Mind (1157)**, 25 | Lvl 1: -131 HP, +22 MP. Morlorien: after a kill or every 2-3 nukes. |
| Own HP < 70 %, fresh corpse in 400 | Corpse Life Drain (1151), 30+ | Cheap heal from a corpse. It **uses up the corpse, so the body can't be spoiled**. Don't use it when a spoiler is in the party. |
| Second mob aggroed (solo) | Sleep (1069), 25+ | 30 s. Kill the first mob, then the sleeper. Any damage wakes it. |
| Own HP < 50 % | Battle Heal (1015) | Kept from the Human Mystic tree. |
| Summon | see the line deltas in §3-§5 | |
| Board conflict | Concentration (1078) | The board gives it. |
| Never / rare | Curse Poison (1168), Poisonous Cloud (1167), Curse Chaos (1222), Slow (1160, lvl 1 only), Curse Weakness (1164), Vampiric Touch (1147) | Linedia (Necro H5) says skip Sleep, Poisonous Cloud, Curse Chaos, Surrender, Mew at this band. Slow is useless at 45+. |
| Obsolete at 20 | Wind Strike (1177), Ice Bolt (1184) | Replaced by Blaze / Energy Bolt. |

---

## 3. Archmage line (Human Mystic -> Human Wizard -> Sorcerer -> Archmage). Fire nuker

### 3.1 Base (1-19) and 1st class (20-39)
As §1 and §2. Delta for this line [rec]: summons are optional. Kat (1111) or Mew (1225) give extra damage, but they take a share of
XP and stop levelling at 35 (Sorcerer does not learn them), so drop them at 40.

### 3.2 2nd class (40-75): Sorcerer

| When / trigger | Skill (id) | Notes |
|---|---|---|
| **Primary nuke** | **Prominence (1230)**, 40+ | Fire, **900 range**, power up to 108, 4 s cast. Every guide calls it the main nuke. |
| Fire-resistant mob | Aura Bolt (1275), 40+ | Non-elemental, 400 range, 2 s cast, power 54. |
| Mob in melee range (150) | Aura Flare (1231), 40+ | Fast (1.5 s cast, 1 s reuse), power 87, **range 150**. Use it only when the mob is already on you. |
| AoE: 3+ mobs around **you** (within 200) | **Blazing Circle (1171)**, 40+ | Fire, point blank, 6+ targets, 4 s reuse, power 64. Asterios: "strong fire AoE". |
| AoE: tight pack (within 100 of the target) at range | Rain of Fire (1296), 58+ | Fire, 500 range, **radius only 100**, 5+ targets, power 54. Use it when mobs are bunched (after the tank gathers them). |
| Mobs on you and you need to drop aggro | Aura Flash (1417), 58+ | Non-elemental, point blank, **makes the mobs lose their target**. Costs 4 Spirit Ore. Use it to escape, not as damage AoE. |
| Long fight / boss | Surrender To Fire (1083) | One fire debuffer per party (team element rule). Asterios Archmage guide: skip it in a mage pack (PvP). |
| Boss / elite | Decay (1233), 48+ | Earth DoT, 15 s. Asterios Sorc guide: "often overlooked". |
| Boss / elite, long-lived only | Aura Symphony (1288) 68, Inferno (1289) 70, Elemental Assault (1292) 72 | 5 min reuse, 200 MP. Burst only. Inferno also adds a fire DoT. |
| Keep up, self | **Seed of Fire (1285)**, 66 | +20 fire attack, 10 min, 200 MP. No board conflict. |
| Keep up, self (cheap) [rec] | Blazing Skin (1232), 40-56 | Reflects melee damage, 20 min. Only if melee mobs reach you. |
| Melee mob on you, solo | Curse Fear (1169) | 10 s flee, 3 s reuse. Then nuke it while it runs (no counterattack). |
| Melee mob chasing you | Slow (1160) | -speed 60 s. |
| Party pulled too many | Sleeping Cloud (1072), 44+ | Sleeps 9+ mobs in 200 around the target, 8 s reuse. **Never use it on a pack you are about to AoE.** |
| Second mob (solo) | Sleep (1069) | As before. |
| MP | Body To Mind (1157) | **Sorcerer learns no new levels.** Only the Wizard lvl 1 (+22 MP) remains, so it is weak. Rely on MP potions, a recharger (Elven/Shillien Elder) or rest [rec]. |
| Board conflict | Concentration (1078) | |
| Never in PvE | Cancellation (1056) | Strips enemy buffs, 30 s reuse. A PvP tool (Asterios: the cancel pack). |
| Never | Surrender To Wind (1074) | Sorcerer has no wind nuke. It only helps a wind caster in the party (Storm Screamer/Spellhowler). |
| Obsolete at 40 | Blaze, Energy Bolt, Aura Burn, Vampiric Touch, Kat/Mew summons, Servitor skills | Replaced by Prominence, Aura Bolt and Aura Flare. |
| Obsolete at 58 | Flame Strike (1181, stays at lvl 3) | Replaced by Rain of Fire / Blazing Circle. |

### 3.3 3rd class (76-85): Archmage

| When / trigger | Skill (id) | Notes |
|---|---|---|
| Primary nuke | **Prominence (1230)** | Still the spam nuke (Asterios: "enchant for power"). |
| Opener on anything that lives 3+ nukes | **Fire Vortex (1339)**, 77 | Fire, power 140, 15 s reuse. Its debuff slows the mob, cuts attack/cast speed, drains MP and lowers fire resist (30 s). |
| Right after Fire Vortex lands | **Fire Vortex Buster (1451)**, 79 | Power 195, 15 s reuse. It consumes the Vortex debuff, so cast it only while that debuff is on the target. |
| Boss / elite | Count of Fire (1452), 79 | Fire DoT (-173 HP/s for 10 s), 75 s reuse. |
| Boss: before the debuffs | Arcane Chaos (1338), 78 | Raises debuff success and drains MP, 15 s reuse. Skip it on trash. |
| AoE | Blazing Circle / Rain of Fire | As in 3.2. |
| Toggle | **Arcane Power (337)**, 78 | M.Atk x1.3, MP cost x1.1, **drains HP** (-50 per tick) [U on tick length]. On in a party with a healer, or when own HP > 60 %. **Off** when solo and HP < 50 %, out of combat, or when MP is the limit. |
| Never auto | **Volcano (1419)**, 80 | Ground AoE (15+ targets) that you channel (you can't move), 30 min reuse, **costs a Magic Symbol**. Owner-triggered big pulls only. |
| Burst (boss) | Aura Symphony / Inferno / Elemental Assault | As 3.2. |
| Weave between Prominences when ready (82+) | **Aura Cannon (1555)**, 82 | Non-elemental single nuke, power 178 (PvE 124 extra per linedia), 10 s reuse, 98 MP, **restores MP**. Good on fire-resistant mobs too [rec]. |
| AoE, 3+ mobs around the target (81+) | Aura Blast (1554), 81 | Non-elemental AoE (ENEMY RANGE, up to 10), 15 s reuse, 116 MP, **restores MP**. |
| Emergency: own HP < 30 % with mobs on you (83+) | Arcane Shield (1556), 83 | 70 % of damage goes to MP for 10 s (ends when MP runs out), 5 min reuse. Never as a routine buff. |

---

## 4. Soultaker line (Human Mystic -> Human Wizard -> Necromancer -> Soultaker). Dark nuker, debuffer, corpse summoner

### 4.1 Base (1-19) and 1st class (20-39)
As §1 and §2. Delta: linedia (Necro H5) recommends **Kat the Cat (1111)** at 20-39. Kat deals solid damage and restores the master's MP.
Unsummon it before the last hit on a boss (it takes about 30 % of XP). Heal it with Servitor Heal (1127) when its HP < 50 %.
Mew is not recommended.

### 4.2 2nd class (40-75): Necromancer

| When / trigger | Skill (id) | Notes |
|---|---|---|
| Primary nuke 40-43 | Blaze (1220) | Death Spike only comes at 44. |
| **Primary nuke 44+** | **Death Spike (1148)** | Dark, 900 range, power up to 108, **cheap (40 MP)**. **No corpse and no Cursed Bone needed in H5.** |
| Opener on tough mobs | **Curse Gloom (1263)**, 44+ | M.Def and dark resist down for 30 s, plus small damage. Morlorien: "default first cast". Linedia: "add it when mobs are tough". |
| Own HP < 60 % | Vampiric Claw (1234), 40+ | Dark drain, 98 MP. Morlorien: expensive and slow, only when you need the heal. |
| Own HP < 40 % (KDL) | Curse Death Link (1159), 52+ | Damage x (2 - 2 x **own** HP %): nothing at full HP. Linedia: good for cheap fast farming, but risky. Only with a healer or an intentional KDL setup. |
| AoE after the first kill in a pack | **Corpse Burst (1155)**, 48+ | Needs a **fresh corpse**. Explodes for dark damage in 150 around the corpse, power 108. |
| AoE, 3+ mobs within 200 of the target | Mass Gloom (1382), 58+ | Small AoE damage plus Gloom on up to 10, 12 s reuse, 136 MP. Linedia: "rarely useful". Use it before Corpse Burst on big packs [rec]. |
| Own MP < 50 % and HP > 70 % | **Body To Mind (1157)**, to lvl 5 at 66 | Lvl 5: -366 HP, +61 MP. Morlorien: after each kill or every 2-3 Death Spikes. This is what lets a Necro solo for hours. |
| Own HP < 70 %, fresh corpse | **Corpse Life Drain (1151)**, to 74 | Cheap heal. Morlorien: use it before you switch targets. It **uses up the corpse** (no spoil, and the corpse can't then feed Corpse Burst or a summon). |
| Melee mob on you | Curse Fear (1169) / Anchor (1170) | Fear: 10 s flee, fast. Anchor: short paralyze, 60 s reuse. Morlorien: Gloom, then Fear or Anchor. Most Necro debuffs do not wake a sleeper. |
| Caster mob / raid minion caster | Silence (1064) | 60 s. |
| Mob switched to you in a party | Forget (1156) | Deletes its hate toward you. Party only. |
| Healing mob / raid | Curse Disease (1269), 58+ | Heals on the target are halved for 2 min. |
| Melee pack chasing the party | Mass Slow (1298), 62+ | -30 % speed in 200 for 60 s. **Costs HP, not MP** (linedia). |
| Melee raid boss | Curse Weakness (1164) | P.Atk down. A boss tool only. |
| Second mob (solo) | Sleep (1069) | |
| **Summon** | Reanimated Man (1129) 44+, Corrupted Man (1154) 40+, Cursed Man (1334) 56+ | All need a **fresh corpse** and cost Spirit Ore. Morlorien: Cursed Man = best levelling summon (P.Atk + stun), Reanimated Man = most HP (best Transfer Pain target), Corrupted Man = PvP and takes most of the XP. Linedia calls Cursed Man "mostly passive" [U]. Guides that level without a summon exist too (l2qwerty). |
| Toggle (summon out only) | Transfer Pain (1262), to lvl 5 at 70 | Sends 10-50 % of the damage you take to the summon. Drains MP. Off when there is no summon or MP < 20 %. Morlorien: "effectively doubles your HP". |
| Rare | Curse Discord (1163) | Confused mob attacks others. Group content only, rarely. |
| Rare / emergency | Mass Fear (1381), 58+ | 75 s reuse. Scatters mobs, which is bad in a party. Linedia: weaker than single Fear. |
| Never | Curse Poison (1168), Poisonous Cloud (1167), Curse Chaos (1222) | Weak. |
| Obsolete at 44 | Blaze, Energy Bolt, Aura Burn, Flame Strike, Kat/Mew (stop levelling at 35), Servitor Heal/Recharge (stuck at Wizard levels) | |

### 4.3 3rd class (76-85): Soultaker

| When / trigger | Skill (id) | Notes |
|---|---|---|
| Primary nuke | **Death Spike (1148)** | Unchanged. |
| Opener on long-lived targets | **Dark Vortex (1343)**, 76 | Dark drain, power 139, 15 s reuse, 84 MP. Its debuff lowers dark resist and drains MP. Morlorien: expensive, mostly a debuff (like Gloom). Linedia: "weak vortex". |
| Boss / elite | **Curse of Abyss (1337)**, 78 | Big all-stat debuff ("ultimate"), 30 s reuse. Linedia: "learn it right away". |
| Skill-heavy boss / minion | Curse of Doom (1336), 77 | Blocks magic **and** physical skills for 60 s, 30 s reuse. Short range, slow cast. |
| Toggle | **Arcane Power (337)**, 78 | Same rules as Archmage (HP drain, M.Atk x1.3). |
| Never in PvE | Mass Warrior Bane (1344), Mass Mage Bane (1345) | AoE strips of enemy speed / M.Atk buffs (PvP). |
| Never auto | **Gehenna (1423)** 80, **Day of Doom (1422)** 80 | 30 min reuse plus a Magic Symbol. Gehenna = big ground AoE, Day of Doom = AoE debuff field (PvP). Owner-triggered only. |
| Keep up while a summon is out (83+) | Servitor Share (1557), 83 | Pet inherits master stats, 20 min, 60 s reuse. Only matters if the Soultaker plays with a summon. |
| Obsolete at 76 | Nothing hard | Mass Fear and Curse Discord drop to rare. |

---

## 5. Arcana Lord line (Human Mystic -> Human Wizard -> Warlock -> Arcana Lord). Cat summoner

### 5.1 Base (1-19) and 1st class (20-39)
As §1 and §2. Delta: from 20 the **cat is the main damage**. Summon **Kat the Cat (1111)** (tanky and returns MP to the master, per
oknologia and Asterios) rather than Mew (1225, large XP share, per oknologia and linedia). Master: Servitor Heal (1127) at pet HP < 60 %,
Servitor Recharge (1126, 25+) at pet MP < 30 %, Servitor Wind Walk (1144, 35) when the board pet buff is missing. The master nukes only
to pull or help (Blaze).

### 5.2 2nd class (40-75): Warlock

| When / trigger | Skill (id) | Notes |
|---|---|---|
| **Levelling pet (solo or party)** | **Summon Kai the Cat (1276)**, 40+ | Oknologia and Asterios: Kai is the levelling cat (self buff, melee reflect). It costs Spirit Ore over time. |
| MP short / tank needed | Summon Kat the Cat (1111) | Kat restores the master's MP and has high HP. |
| Party of DDs / raid support | Summon Feline Queen (1331), 56+ | A buffer pet (oknologia, morlorien). **Its Blessing of Queen is a board conflict on L2Toggle**, so the Queen is mostly useless here [rec]. |
| PvP only | Summon Mew the Cat (1225) | Magic cat, large XP share. Never for levelling. |
| Keep up (cubic) | **Summon Storm Cubic (10)** | Magic damage cubic. |
| Keep up, second cubic | Summon Binding Cubic (1279) | Paralyze procs. Oknologia: 44+ in Enchanted Valley. Two cubics need Cubic Mastery (44). |
| Party | Mass Summon Storm Cubic (1328) | A storm cubic for each party member, but **expensive** (many Spirit Ore). Party or raid only. |
| Pet HP < 60 % | **Servitor Heal (1127)** | Main pet heal (to lvl 45). |
| Pet MP < 30 % | Servitor Recharge (1126) | |
| Pet poisoned / bleeding | Servitor Cure (1300), 40-60 | |
| Pet rooted / paralysed / slowed | Servitor Blessing (1301), 62 | |
| Pet under burst (raid hits) | Servitor Empowerment (1299), 52+ | Huge P.Def/M.Def, but **the pet can't move for 30 s**. 15 min reuse. Emergency only. |
| Keep up, self (20 min) | **Spirit Sharing (1547)**, 44+ | Shares master P.Atk, M.Atk, speeds and crit with the pet. No board conflict (PUBLIC_SLOT). |
| Pet buffs: only if the board pet scheme is missing | Servitor Haste (1141), Servitor Magic Shield (1139), Servitor Physical Shield (1140), Servitor Wind Walk (1144) | Board conflict. Note: pet buffs are **lost on re-summon**, so re-buff after every summon. |
| Toggle (pet out) | Transfer Pain (1262) | As Necro. Asterios: it turns off when MP runs out, so turn it back on. |
| Fire nuker in party, pet in the pack | Mass Surrender to Fire (1383), 58+ | Fire weakness on mobs around the **pet**, 3 Spirit Ore. Morlorien: untested. |
| Caster mob | Arcane Disruption (1386), 56+ | Cast speed down 30 s. |
| Master attack (helps the pet, never pulls aggro off it) | **Dimension Spiral (1558)**, 40-74 | The summoner's own nuke: power 98 (linedia: 109 vs monsters), can crit, 15 s reuse. Cast it when ready and MP > 50 %. Linedia: it also triggers Mutual Response. Morlorien: otherwise don't nuke past ~58, let the pet tank. Blaze (1220) is the filler before 40. |
| Never in PvE | Betray (1380) | Turns an **enemy servitor** on its master (PvP, Spirit Ore). |
| Obsolete at 40 | Mew for levelling, Flame Strike, Energy Bolt, Sleep levels | |

### 5.3 3rd class (76-85): Arcana Lord

| When / trigger | Skill (id) | Notes |
|---|---|---|
| Levelling pet 76-78 | Kai the Cat (1276) | Asterios: Kai until Feline King. |
| **Main pet 79+** | **Summon Feline King (1406)**, 79 | Physical pet with a single nuke, a mass nuke and a mass root (Asterios, oknologia). Spirit Ore over time. |
| Keep up (cubic) 80+ | **Summon Smart Cubic (781)** | Removes the master's debuffs and heals (Asterios). 38 Spirit Ore. Pair it with Storm Cubic. |
| Hard fight / raid | **Final Servitor (1349)**, 78 | Big pet buff, 5 min, 20 Spirit Ore, 60 s reuse. |
| Hard fight 77 (before Final Servitor) | Warrior Servitor (1346), 77 | Same buff type as Final Servitor (MULTI_BUFF), 10 Spirit Ore. **Obsolete at 78** [U: Final is stronger]. |
| Toggle | Arcane Agility (338), 78 | Cast speed x1.2, reuse x0.9, MP x1.1, **HP drain**. Asterios: **not** always on, it drains mana. Burst moments only. |
| Never in PvE | Warrior Bane (1350), Mage Bane (1351) | PvP buff strips. |
| Never auto | Anti-Summoning Field (1424), 80 | Ground field (PvP), Magic Symbol, 30 min reuse. |
| Master attack | Dimension Spiral (1558), to lvl 24 at 85 | Same rule as Warlock. |
| Keep up (83+) | **Servitor Share (1557)**, 83 | Pet gets 50 % of master P.Atk/P.Def, 25 % M.Atk/M.Def, 10 % HP/MP, crit (oknologia, linedia). 20 min, 60 s reuse. Oknologia: it replaces Spirit Sharing, so **Spirit Sharing (1547) is obsolete at 83** [U: whether the two stack]. |
| Everything from Warlock | Servitor Heal/Recharge/Blessing/Empowerment, Spirit Sharing, Transfer Pain | Same triggers. |

---

## 6. Shared band: Cleric 20-39 (Cardinal, Hierophant). Healer only

| When / trigger | Skill (id) | Notes |
|---|---|---|
| Party member < 40 % (urgent) | **Battle Heal (1015)** | 2 s cast, 62 MP. |
| Party member 40-75 % | **Heal (1011)** | 5 s cast, 41 MP, better HP per MP. |
| 3+ members < 70 % (2+ when one is the tank) | **Group Heal (1027)** | 7 s cast, range 1000. |
| Dead party member, no mobs on the healer | Resurrection (1016) | 6 s cast, 30 s reuse. |
| Poisoned member | Cure Poison (1012), 35 | |
| Mob attacking the healer (peel, no damage) | Peace (1075), 35 | Deletes the mob's hate (80 %). Allowed under the rule [rec] because it isn't an attack. Owner to confirm. |
| Board conflict, never while board buffs are up | Might, Shield, Wind Walk, Acumen, Focus, Concentration, Mental Shield, Berserker Spirit, Holy Weapon, Regeneration, Resist Fire | Fallback only. |
| Never (healer rule) | Disrupt Undead (1031), Sleep (1069), Dryad Root (1201) | Attack / CC. Root or Sleep only as an owner-approved emergency peel. |
| Never | Kiss of Eva (1073) | Breath buff, useless. |
| Obsolete at 20 | Wind Strike, Ice Bolt, Vampiric Touch, Self Heal | |

---

## 7. Cardinal line (Human Mystic -> Cleric -> Bishop -> Cardinal). Main healer

### 7.1 Base (1-19) and 1st class (20-39)
As §1 (see the healer conflict) and §6.

### 7.2 2nd class (40-75): Bishop

| When / trigger | Skill (id) | Notes |
|---|---|---|
| **Single target 50-80 %, 56+** | **Major Heal (1401)** | Power 946, **64 MP**, 1 Spirit Ore. Oknologia: "your main single heal for the whole game". The datapack says 5 s cast (oknologia says "instant"), so treat it as a normal-cast heal [U]. |
| Single target 50-80 %, 40-55 | Greater Heal (1217) | Power 472 plus a HoT, 5 s cast, 96 MP. Fallback after 56 when you are out of Spirit Ore. |
| Single target < 40 % (urgent) | **Greater Battle Heal (1218)** | Power 858, **2 s cast**, 143 MP (expensive). Oknologia: fast, strong, burns MP. |
| Poisoned or bleeding plus hurt | Vitalize (1020), 48+ | Power 780 plus a poison/bleed cure, 3 s cast. |
| Tank (high max HP) < 60 % | Restore Life (1258), 44-56 | Heals 30 % of max HP (lvl 4), 8 s cast, 30 s reuse. Oknologia: suits tanks. |
| **3+ members < 70 %, 58+** | **Major Group Heal (1402)** | Power 1170, 7 s cast, 3 s reuse, **4 Spirit Ore**, 191 MP. Works through walls (oknologia). |
| 3+ members < 70 %, 40-57 (or no ore) | Greater Group Heal (1219) | Power 378 plus a HoT. |
| Whole party low and **own MP <= 25 %** | Benediction (1271), 66 | Full HP for the party. Usable **only** at MP <= 25 %, 15 min reuse. |
| A member about to die (< 15 %) and heals can't save them | Celestial Shield (1418), 64 | 10 s invulnerability on the target, 10 min reuse. |
| Paralysed / stoned / poisoned member | Purify (1018), 44-62 | Oknologia: use it after every second mob AoE, e.g. Hellbound chimeras. |
| Dead party member, no aggro | Resurrection (1016), to lvl 9 | |
| Dead **clanmates** (several) | Mass Resurrection (1254) | Clan only (DEAD_PLEDGE). 150 s reuse, 353 MP. |
| Keep up (20 min) | **Prayer (1307)**, 66+ | Party heal received +X %. Oknologia: "should always be up". Likely no board equivalent [U]. |
| Board conflict [U] | Body of Avatar (1311), 48-72 | Party max HP +35 %. Same type (MAX_HP_UP) as Bless the Body, 424 MP. Cast only if the board scheme lacks a max-HP buff. |
| Out of combat, nothing aggroed, MP < 30 % | Invocation (1430), 56+ | Stuns yourself for 30 s, P.Def x0.1. Oknologia: the main MP source until you have a recharger. **Never in combat.** |
| Never (healer rule) | Inquisitor (1520), Might of Heaven (1028), Turn Undead (1400), Hold Undead (1042), Mana Burn (1398), Mana Storm (1399), Requiem (1049), Repose (1034), Trance (1394), Magical BackFire (1396), Erase (1395), Sleep (1069) | **Conflict:** oknologia levels Bishops solo on undead with Turn Undead, Might of Heaven and the Inquisitor transform. The owner rule says no. Inquisitor also blocks heals. |
| Obsolete at 40 | Heal (1011), Battle Heal (1015), Group Heal (1027) | Replaced by Greater Heal, Greater Battle Heal and Greater Group Heal. |
| Obsolete at 56 / 58 | Greater Heal (to Major Heal), Greater Group Heal (to Major Group Heal) | Keep both as no-Spirit-Ore fallbacks. Restore Life stops levelling at 56 but stays useful on tanks. |

### 7.3 3rd class (76-85): Cardinal

| When / trigger | Skill (id) | Notes |
|---|---|---|
| Single / group heals | Major Heal, Greater Battle Heal, Major Group Heal | As in 7.2. |
| **2+ members hurt, 83+** | **Chain Heal (1553)**, 83 | Cast on the most-hurt member: 30 % of max HP on them, then up to 9 more of the most hurt nearby (diminishing). 3 s cast, **5 s reuse**, 155 MP, 4 Spirit Ore. Faster than Major Group Heal (7 s cast). Use Major Group Heal while Chain Heal is on cooldown [rec]. |
| **One member low, the rest high** (e.g. tank < 40 % while the party average is > 70 %) | **Balance Life (1335)**, 76 | Evens out HP % across the party (range 1000, through walls). 5 s cast, **30 s reuse**, 98 MP. The party's total HP stays the same, so it **doesn't help when everyone is low**. |
| Member with a hard debuff (root, silence, paralysis, Block Shield, ...) | **Cleanse (1409)**, 78 | Removes up to 10 debuffs, 8 s reuse, **1 Holy Water**. |
| Several members in danger at once | Divine Power (1459), 79 | Heal power boost for 15 s, 15 min reuse. Cast it, then Major Group Heal. |
| Before a raid / hard pull, on the tank or yourself | Salvation (1410), 79 | Revives the target when it dies, with buffs kept, 1 h, **2 Holy Water**. |
| Toggle | Arcane Wisdom (336), 78 | MP cost x0.7, cast speed x0.9, **HP drain**. Oknologia: easy to forget, only for long nonstop healing (raids). Off otherwise. |
| Manual only (clan, Magic Symbol) | Miracle (1426), 80; Purification Field (1425), 80 | Clan-wide full heal (1 h) / clan-wide cleanse (20 min). Party members who aren't clanmates get **nothing**. |
| Rare | Divine Protection (1353), 77 | Holy/dark resist buff. Oknologia: "useless". |
| Never in PvE | Mass Block Shield (1360), Mass Block Wind Walk (1361) | PvP AoE debuffs (md calls them "self buff", see 0.1). |
| Obsolete at 76 | Nothing new | Benediction becomes rare (Balance Life and Major Group Heal cover it). |

---

## 8. Hierophant line (Human Mystic -> Cleric -> Prophet -> Hierophant). Buffer, backup healer

**Key fact:** according to the datapack, Prophet and Hierophant learn **no new heal levels**. Heal (1011, lvl 18), Battle Heal (1015, lvl 15)
and Group Heal (1027, lvl 15) stay at their 35 levels, and Resurrection stays at lvl 2. Linedia's H5 Prophet guide agrees: "no new healing or
resurrection skills". A Hierophant is a **backup healer at best**. Don't make it the party's only healer [rec].
The board covers most Prophet buffs, so the class's value on L2Toggle is the board-excluded ones.

### 8.1 Base (1-19) and 1st class (20-39)
As §1 (see the healer conflict) and §6.

### 8.2 2nd class (40-75): Prophet

| When / trigger | Skill (id) | Notes |
|---|---|---|
| Backup heal | Battle Heal (1015) < 40 %, Heal (1011) 40-75 %, Group Heal (1027) 3+ < 70 % | Cleric levels only. Asterios: Battle Heal on self for 800+ in the endgame (buffed). |
| **Worth casting (board gives resists only with premium)** | Resist Holy (1392), Resist Dark (1393), Resist Aqua (1182), Resist Wind (1189), Resist Fire (1191), Resist Earth (1548, 60+), Resist Poison (1033), 58+ | Only the ones that matter for the zone, e.g. Resist Dark vs undead/dark casters. Asterios: only 2-3 resists are worth slots. |
| Worth casting if the board lacks it [U] | Bless the Body (1045), Bless the Soul (1048) | Max HP / max MP. Check the board scheme. |
| Shield users only | Bless Shield (1243) | Shield block rate. |
| Board conflict, fallback only | Might, Shield, Greater Might (1388), Greater Shield (1389), Haste, Acumen, Focus, Death Whisper, Guidance, Wind Walk, Magic Barrier, Concentration, Mental Shield, Berserker Spirit, Regeneration | Greater Might/Shield also cost 3 Spirit Ore. |
| Peel (no damage) | Peace (1075) | As in §6. |
| Never (rule / PvP) | Mana Burn (1398), Erase (1395, PvP pet unsummon, 5 Spirit Ore), Dryad Root (1201), Sleep (1069), Disrupt Undead (1031) | **Conflict:** Asterios comments mention Prophets nuking with a holy staff. Not a healer's job. |
| Emergency only | Word of Fear (1272), 44+ | AoE fear around you, 150 s reuse. Use it only when mobs are on the support and no tank can take them [rec]. Scattering mobs hurts a party. |
| **Never auto** | **Return (1050)** | Teleports to town (md says "self buff"). |
| Never | Kiss of Eva (1073), Invigor (1032, bleed resist) | Asterios: useless buffs (overbuff fodder in PvP). |
| Obsolete at 40 | Nothing healing-wise | The heals simply stop growing. |

### 8.3 3rd class (76-85): Hierophant

| When / trigger | Skill (id) | Notes |
|---|---|---|
| **Main reason to bring it** | **Prophecy of Fire (1356)**, 78 | **The board excludes it.** Single-target buff: P.Atk x1.1, M.Atk x1.2, P.Def/M.Def x1.2, attack and cast speed x1.2, crit damage x1.2, HP regen x1.2, **-20 % run speed**. 5 min, **10 Spirit Ore per cast**. Cast on the main DDs and tank before each fight / raid. Ore cost limits how often [rec]. Same type as other Prophecies (one at a time). |
| Keep up on the party (20 min) | Elemental Protection (1352), 76 | +20 to fire/water/wind/earth resist. Likely not on the board (premium resists) [U]. |
| Boss about to debuff the tank / DD | Mystic Immunity (1411), 79 | Debuff immunity for 30 s on a party member, 150 s reuse. Asterios: blocks most debuffs, not cancel or damage. |
| Boss casting a big spell, within 150 | Spell Turning (1412), 79 | 50 % chance to cancel the cast, 30 s reuse. Range 150, so rarely usable [rec: manual]. |
| Toggle | Arcane Wisdom (336), 78 | As Cardinal. Only during long buff/heal sessions. |
| Never in PvE | Block Shield (1358), Block Wind Walk (1359) | PvP buff strip and block. |
| Backup heals | As 8.2 | Still Cleric levels. |

---

## 9. Quick never-auto list (all five lines)
Volcano 1419, Gehenna 1423, Day of Doom 1422, Anti-Summoning Field 1424, Miracle 1426, Purification Field 1425 (Magic Symbol, 20-60 min reuse) ·
Return 1050 · Inquisitor 1520 · Invocation 1430 (in combat) · Mass Warrior Bane 1344 / Mass Mage Bane 1345 / Warrior Bane 1350 / Mage Bane 1351 /
Block Shield 1358 / Block Wind Walk 1359 / Mass Block Shield 1360 / Mass Block Wind Walk 1361 / Cancellation 1056 / Betray 1380 / Erase 1395 (PvP) ·
Curse Death Link 1159 at full own HP · Benediction 1271 unless own MP <= 25 % · Celestial Shield 1418 except as a last resort ·
Corpse Life Drain 1151 when a spoiler needs the corpse · Sleeping Cloud 1072 / Mass Fear 1381 / Word of Fear 1272 on a pack the party is fighting.

## Sources
- Datapack: `Scripts/data/dp/classSkillTree.xml`, `highFiveNewClassSkillTree.xml`, `skills/*.xml` (element, item cost, AoE, duration, dispel lists).
- Linedia, Necromancer (High Five) guide: https://linedia.ru/wiki/Гайд_Necromancer_(High_Five)
- Linedia, Sorcerer / Warlock / Bishop / Prophet (High Five) guides: https://linedia.ru/wiki/Гайд_Sorcerer_(High_Five), https://linedia.ru/wiki/Гайд_Warlock_(High_Five), https://linedia.ru/wiki/Гайд_Bishop_(High_Five), https://linedia.ru/wiki/Гайд_Prophet_(High_Five)
- Linedia, H5 change notes: https://linedia.ru/wiki/Гайд_Sorcerer_High_Five (and the _Warlock_, _Bishop_, _Prophet_ variants)
- Morlorien, Necromancer and Warlock (Spanish): https://sites.google.com/site/morlorien/otros-mmorpg/lineage-ii/clases/necromancer, https://sites.google.com/site/morlorien/otros-mmorpg/lineage-ii/clases/warlock
- Oknologia (H5), Bishop and Warlock (Russian): http://oknologia.blogspot.com/p/blog-page_8009.html, http://oknologia.blogspot.com/p/blog-page_4971.html
- Asterios forum: Arcana Lord https://forum.asterios.tm/topic/464249-guide-arcana-lord/, Archmage https://forum.asterios.tm/topic/439490/, Sorcerer https://forum.asterios.tm/topic/100960/, Prophet (H5) https://forum.asterios.tm/topic/165247-prophet-guide-high-five/
- L2DB H5 skill pages: https://l2db.info/high-five/skills/1335 (Balance Life), https://l2db.info/high-five/skills/1402 (Major Group Heal)
- Not reachable (HTTP 403/402): l2wiki.com, lineage2.fandom.com, l2central.info, strategywiki.org. There were no useful English H5 guides or Reddit threads, so most advice comes from Russian and Spanish community guides. Many are from 2010-2016 PvP servers, so their PvE advice is thin. That is why many trigger thresholds are marked [rec].
