# Elf classes: which skills to use, and when (H5, L2Toggle)

Research 2026-10-26. Scope: the 7 Elf lines, per level band (1-19 base, 20-39 1st class, 40-75 2nd, 76-85 3rd).
Skill names and ids come from `docs/plan/class_skills/<Line>.md` (the ground truth). I checked effects, cast times and ranges against the
datapack on disk (`Scripts/data/dp/skills/*.xml`). Playstyle advice comes from web guides, listed under Sources at the end.

Confidence tags: **[DP]** = read from the datapack XML. **[G]** = from a player guide. **[?]** = uncertain or my own inference, verify in game.

---

## 0. Read this first (applies to all 7 lines)

### 0.1 High Five additions (from `highFiveNewClassSkillTree.xml`)

The class_skills/*.md files were regenerated on 2026-10-26 06:42 and now include `highFiveNewClassSkillTree.xml`. The earlier version
left these skills out. Several of them are core skills, so check that the bot's skill tables have them **[DP]**:

| Line | Skill (id) | Learned | What it is [DP] |
|---|---|---|---|
| Temple Knight / Eva's Templar | Shield Strike (984) | 40-85 (lv 1-25) | Shield required. Damage plus GetAgro, 6 s reuse. **The main tank attack** |
| Eva's Templar | Challenge for Fate (985) | 83 | Frontal-fan taunt plus target lock, 45 s reuse |
| Swordsinger / Sword Muse | Deadly Strike (986) | 40-85 (lv 1-25) | Physical attack, 5 s reuse. Works with sword, blunt, dagger, pole and dual. **The main SWS damage skill** |
| Swordsinger | Battle Whisper (988) | 46 / 52 / 60 | Self buff for 2 min: P.Atk x1.05-1.15, crit damage and attack speed x1.05-1.10 |
| Wind Rider | Throwing Dagger (991) | 80 | Damage plus a 10 s slow (speed x0.2), 45 s reuse |
| Wind Rider | Dual Blow (928) | 83 | Blow skill with Lethal. **Needs DUALDAGGER** |
| Moonlight Sentinel | Multiple Shot (987) | 82 | Bow fan AoE (900 range, 60 deg cone, up to 8 targets), 12 s reuse |
| Moonlight Sentinel | Death Shot (990) | 83 | Big single-target bow shot, 12 s reuse |
| Mystic Muse | Aura Blast (1554) / Aura Cannon (1555) / Arcane Shield (1556) | 81 / 82 / 83 | Target AoE, 15 s reuse / short-range (150) nuke, 10 s reuse / 70 % of damage taken from MP for 10 s, 5 min reuse |
| Elemental Summoner / Elemental Master | Dimension Spiral (1558) | 40-85 (lv 1-24) | **The summoner's own nuke**, 900 range, 15 s reuse |
| Elemental Master | Servitor Share (1557) | 83 | 20 min self buff that shares the owner's stats with the servitor |
| Eva's Saint | Mass Vitalize (1552) / Mass Cure Poison (1550) | 76 | Party heal plus poison/bleed cleanse (3 s cast, 9 s reuse) / party poison cure |
| Eva's Saint | Chain Heal (1553) | 83 | Heals the lowest-HP members near the target for 30 % max HP. Costs 4 Spirit Ore, 5 s reuse |

**Check:** any bot skill logic built from the old .md files (or from `classSkillTree.xml` alone) is missing Shield Strike, Deadly Strike and
Dimension Spiral. That may be part of the "wrong skills" problem.
Skills that guides list at 81+ (Hide, Wind Riding, Arrow Rain, Seven Arrow, Silent Mind, Star Fall, Enlightenment, Blessing of Eva,
Turn to Stone, Song of Purification, Spirit of the Unicorn, Servitor Barrier, Touch of Eva, Anti Magic Armor and others) are **not** in
this datapack. Ignore them.

### 0.2 Board buffs (12 h) versus class buffs: do not overwrite them

L2J replaces a buff that has the same `abnormalType` when the new `abnormalLvl` is greater than or equal to the old one **[DP + ? engine rule, verify]**.
A self-cast class buff can therefore *replace* a 12 h board buff with a 2 min or 20 min copy, or fail silently and waste MP:

| Class skill (id) | abnormalType | Collides with board buff | Bot rule |
|---|---|---|---|
| Defense Aura (91) | PD_UP | Shield | Skip while board buffs are on |
| Attack Aura (77) | PA_UP | Might | Skip while board buffs are on |
| Spirit Barrier (123) | MD_UP | Magic Barrier (same abnormalLvl 3, so it **replaces**) | Skip while board buffs are on |
| Sprint (230) | SPEED_UP | Wind Walk | Skip while board buffs are on |
| All SWS songs (2 min) | SONG_OF_* | Board songs (12 h) | **Never cast** songs that the board gives |
| Prophecy of Water (1355), Wizard Servitor (1347), Final Servitor (1349) | MULTI_BUFF lvl 1 | Chant of Victory (MULTI_BUFF lvl 1) | Never on a target that has CoV |
| Elder/Oracle target buffs (Might, Shield, Wind Walk, Agility, Concentration, Mental Shield, Clarity, Wild Magic, ...) | same as board | Board | Never while board buffs are on |

Only self buffs with their own abnormalType need upkeep. Examples: Rapid Shot (99), Soul/Spirit/Blessing of Sagittarius (303/415/416),
Combat Aura (982), Battle Whisper (988), Seed of Water (1286), Spirit Sharing (1547), Iron Shield (527), Mortal Strike (410), Focus Death (355).

### 0.3 Never auto-use, any Elf class

- **Symbols / ground fields** consume a Battle Symbol (8875) or Magic Symbol (8876) and have a 30 min reuse: Symbol of Defense (454), Symbol of Noise (455),
  Symbol of the Assassin (460), Symbol of the Sniper (459), Raging Waves (1421), Anti-Summoning Field (1424), Mass Recharge (1428) **[DP]**.
- **Utility skills that cost items**: Unlock (27), Summon Treasure Key (419), Quiver of Arrow: A Grade / S Grade (323/324; only when out of arrows), Find Trap (623), Remove Trap (624).
- **Escape or travel**: Return (1050), Party Recall (1255), Silent Move (221), Chameleon Rest (296), Fake Death (60; emergency only, see Wind Rider).
- **PvP-only**: Cancellation (1056), Warrior Bane (1350), Betray (1380), Erase (1395), Block Wind Walk (1359), Detection (933), Mana Burn (1398).
- **Skills that root the caster** (Ultimate Defense 110, Vengeance 368, Servitor Empowerment 1299 roots the pet, Invocation 1430 stuns self) are emergencies only.

---

## 1. Shared base tables

### 1.1 Elven Fighter, 1-19 (Eva's Templar, Sword Muse, Wind Rider and Moonlight Sentinel all start here)

| Slot | Skill (id) | When | Notes |
|---|---|---|---|
| Single target | Power Strike (3) **or** Mortal Blow (16) **or** Power Shot (56) | On reuse while mob HP > 30 % | Pick by equipped weapon: Power Strike = SWORD/BLUNT, Mortal Blow = DAGGER, Power Shot = BOW (700 range, 6 s reuse) **[DP]**. A future tank or SWS uses a sword, a future WR a dagger, a future MS a bow |
| AoE | none | - | Fight one mob at a time |
| Self buffs | Attack Aura (77), Defense Aura (91) | Only when board buffs are missing | See 0.2 |
| Self heal | Elemental Heal (58), from lvl 15 | HP < 50 % **between** mobs | 5 s cast, also cures poison |
| Never | - | - | - |

### 1.2 Elven Mystic, 1-19 (Mystic Muse, Elemental Master and Eva's Saint start here)

| Slot | Skill (id) | When | Notes |
|---|---|---|---|
| Single target | Wind Strike (1177), from lvl 1 | Spam | 600 range, 4 s cast |
| Slow / kite | Ice Bolt (1184), from lvl 7 | Mob is running at you from range | Slow for 60 s |
| Self heal | Self Heal (1216) at 1-6; Heal (1011) / Battle Heal (1015) from 7 / 14 | HP < 50 %: Heal. HP < 30 %: Battle Heal (2 s cast) | |
| Party heal | Group Heal (1027), from lvl 14 | Only in a party and only if this is a future Oracle | |
| Debuff / CC | Curse Weakness (1164), Wind Shackle (1206) | Not worth casting on farm mobs | |
| Buffs | Might (1068), Shield (1040) | Board covers them | Never while board buffs are on |
| Never | Cure Poison (1012) | Unless poisoned | |

Owner rule note: at 1-19 a future healer has nothing to kill with except Wind Strike. Solo she must nuke. In a party with damage dealers she should only heal **[?]**.

### 1.3 Elven Knight, 20-39 (Eva's Templar and Sword Muse)

| Slot | Skill (id) | When | Notes |
|---|---|---|---|
| Single target | Auto-attack + Power Strike (3) (stays at lvl 9) | On reuse | The Knight gets **no new damage skill** at 20-39 **[DP]**. Weapon: sword + shield |
| Aggro (party) | Aggression (28), from lvl 24 | A mob attacks a party member other than me | Single-target taunt, 6 s reuse **[DP]**. Use it in a party only |
| AoE | none | - | |
| Self buffs | Deflect Arrow (112), from lvl 24 | Hunting archer mobs | Bow/crossbow damage resistance, 20 min |
| Emergency | Ultimate Defense (110) | HP < 25 % with 2+ mobs on me and no healer | **Roots self** for 30 s, 15 min reuse **[DP]** |
| Cleanse | Poison Recovery (21), Cure Bleeding (61) | When poisoned / bleeding | |
| Slow | Entangle (102), from lvl 36 | A mob runs away at low HP | |
| Heal | Elemental Heal (58) | HP < 50 % between mobs, no healer | |
| Never | Charm (15) | - | It *removes* hate from me (AddHate is negative) **[DP]**, the opposite of tanking. A guide calls it nearly useless **[G linedia]** |
| Skip | Sprint (230), Defense Aura (91), Attack Aura (77) | - | Covered by board buffs (0.2) |

### 1.4 Elven Scout, 20-39 (Wind Rider and Moonlight Sentinel)

| Slot | Skill (id) | When | Notes |
|---|---|---|---|
| Single target, dagger (future WR) | Mortal Blow (16) | On reuse | Blow skill. Lands more often from the side or back (x1.5 / x2) **[DP, positional_skills.md]** |
| Single target, bow (future MS) | Power Shot (56); Stun Shot (101) from lvl 36 | Power Shot on reuse. Stun Shot when a mob reaches melee range (stun, then step back) | Stun Shot also cancels the mob's target **[DP]** |
| Toggles | Vicious Stance (312) for daggers; Accuracy (256) | Vicious Stance on while MP > 40 %. Accuracy on vs high-evasion mobs | Both drain MP |
| Self buffs | Rapid Shot (99), from lvl 32 (bow only) | Keep up, 20 min | Not covered by the board |
| Debuff | Bleed (96), dagger | Only on long fights | 89 MP, low value **[?]** |
| Emergency | Ultimate Evasion (111), from lvl 28 | HP < 30 % with a melee mob on me | 30 s, 15 min reuse |
| Slow | Entangle (102), from lvl 36 | A mob runs away or chases me while I kite with a bow | |
| Cleanse / heal | Poison Recovery (21), Cure Bleeding (61), Elemental Heal (58) | As needed | |
| Situational | Charm (15) | A mob switches onto me in a party | Reduces my hate |
| Never | Unlock (27) | - | Consumes keys |

### 1.5 Elven Wizard, 20-39 (Mystic Muse and Elemental Master)

| Slot | Skill (id) | When | Notes |
|---|---|---|---|
| Main nuke | Aqua Swirl (1175) | Spam | Water, 750 range, 4 s cast **[DP]** |
| Second nuke | Solar Spark (1264), from lvl 25 | On reuse (8 s), especially vs undead | Holy |
| Close-range filler | Energy Bolt (1274) (400 range); Aura Burn (1172) (150 range, 1.5 s cast) | Only when the mob is already in melee range | Short range breaks kiting |
| AoE | Flame Strike (1181) | 3+ mobs within 200 of the target | 500 cast range |
| CC | Sleep (1069), from lvl 25 | A second mob joins (add) | |
| Summoner only | Summon Boxer the Unicorn (1226), Servitor Heal (1127), Servitor Recharge (1126) | Boxer as the leveling pet. Servitor Heal at pet HP < 60 %. Servitor Recharge at pet MP < 30 % | Boxer restores the owner's MP **[G ES thread]** |
| Never | Summon Mirage the Unicorn (1227) | - | XP penalty: the datapack has `expMultiplier=0.1` and guides say "absorbs 90 % XP" **[DP+G]** |
| Skip | Concentration (1078), Resist Aqua (1182), Bright Servitor (1145) | - | Board / low value |
| Obsolete | Wind Strike (1177), Ice Bolt (1184) | - | Replaced by Aqua Swirl |

---

## 2. Eva's Templar line (Elven Fighter → Elven Knight → Temple Knight → Eva's Templar)

Role: **shield tank**. Weapon: **one-handed SWORD + SHIELD**. Many skills need the shield, and Vanguard and Tribunal need a sword or blunt **[DP]**.

**1-19:** table 1.1 with a sword (Power Strike). **20-39:** table 1.3.

### 40-75 Temple Knight

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Single target | **Shield Strike (984, H5)** → Tribunal (400, from 55) → auto-attack | Shield Strike on every reuse (6 s) on the current mob. Tribunal on reuse (4 s) | Shield Strike = damage + aggro **[DP]**. Tribunal = damage + lowers the mob's crit rate |
| Aggro, single | Aggression (28) | A mob is hitting anyone but me | Target lock for 3 s, 6 s reuse |
| Aggro, AoE | Aura of Hate (18) | 3+ mobs nearby, or right after a pull, or adds aggro on the healer | Point-blank taunt, 40 s reuse **[DP]** |
| Pull / hold | Arrest (402, from 55) | Mob runs, or a caster mob stays at range | Root for 10 s |
| AoE damage | none | - | The TK has no real AoE damage. Divine Aura (107, from 58) is a point-blank magical root around me, 10 s **[DP]**. One guide says it affects undead only **[G linedia, ?]**. Use it only to hold a big pack, never as a damage skill |
| Toggles | Guard Stance (288, from 43); Shield Fortress (322, from 64); Divine Armor (197) | Guard Stance + Shield Fortress **on while tanking a pack or a raid**, off when solo or MP < 30 %. Divine Armor (dark resistance) costs almost no MP: on vs dark/undead mobs | Guard Stance drains MP heavily **[G linedia]** |
| Self / party buffs | **Combat Aura (982, from 52)** party P.Atk/Spd, 20 min; Deflect Arrow (112) vs archer mobs | Keep Combat Aura up (not a board buff) | Spirit Barrier (123): skip, it collides with Magic Barrier (0.2) |
| Cubics | Storm Cubic (10) damage; Life Cubic (67, from 43) heals owner and party; Attractive Cubic (449, from 62) hate + root | **Solo: Storm + Life. Party tank: Life + Attractive** (Attractive helps hold aggro). Resummon when one is missing. Cubics last 15 min **[DP]** and vanish on death **[G]** | Cost Spirit Ore (3031). The cubic count comes from Cubic Mastery, 2 at 40 **[G]**, 3 later **[?]** |
| Emergency | Ultimate Defense (110) | HP < 25 % and the healer is dead, out of MP or absent | Roots self, 15 min reuse |
| Emergency | Shield Deflect Magic (916, from 60) | A caster pack or a raid boss starts casting at me | 8 s reflect, 45 s reuse **[DP]** |
| Heal | Elemental Heal (58) | No healer and HP < 40 % between pulls | 5 s cast, high MP cost |
| Never auto | Vanguard (812) | - | 6 h transformation that **halves shield defense** (sDef x0.5) **[DP]**. A solo XP option at most **[G estranky]** |
| Never auto | Charm (15) | - | Removes my own hate |
| Obsolete | Power Strike (3), Sprint (230), Defense Aura (91), Attack Aura (77) | - | Replaced by Shield Strike / Tribunal; the rest is covered by board buffs |

### 76-85 Eva's Templar

All of the Temple Knight table still applies. Add:

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Single target | Shield Strike (984) lv 16-25 → Tribunal (400) | As at 40-75 | |
| Aggro, AoE | Aura of Hate (18); Challenge for Fate (985, at 83) | Pull or 3+ loose mobs. Challenge for Fate covers a frontal fan, 45 s reuse | |
| Toggle | **Fortitude (335)** | On in party and raid (resists stun/paralyze); off when solo and MP < 30 % | MP drain |
| Self buff | Iron Shield (527) | Keep up while tanking (20 min, 150 s reuse) | Triggers on damage taken |
| Debuff defense | Magical Mirror (351) | Raid or mobs that debuff | Reflects debuffs for 5 min, 150 s reuse, needs a shield |
| Party emergency | Shield of Faith (528) | Party AoE damage, several members < 50 %, my HP > 70 % | For 15 s, 90 % of the party's damage goes to me. 15 min reuse **[DP]** |
| Ally emergency | Touch of Life (341) | A party member < 25 % and the healer can't keep up | Heals the target for 50 % HP, 5 min reuse. Guides say it costs my own HP **[G estranky]** |
| Self emergency | Vengeance (368) | Big pull, HP < 40 %, many mobs on the party | Point-blank taunt (40 %) + P.Def +5400, **roots self** for 30 s, 15 min reuse |
| Cubics | Summon Smart Cubic (779, from 80) | From 80: **Life + Smart** (+ Attractive if a 3rd slot) | Smart Cubic removes debuffs from me **[G]**, costs 38 Spirit Ore |
| Never auto | Shield Bash (352) | - | Stun **+ TargetCancel** **[DP]**: the mob drops me as a target, which is the opposite of tanking. Use it only to interrupt a deadly cast (manual) |
| Never auto | Symbol of Defense (454) | - | Battle Symbol |

---

## 3. Sword Muse line (Elven Fighter → Elven Knight → Swordsinger → Sword Muse)

Role: light tank or melee damage that also carries songs. On L2Toggle, the board gives the songs, so **the SWS fights and does not sing**.
Weapon: sword (one-handed + shield, or a duals or two-handed sword build **[G]**). Deadly Strike accepts SWORD/BLUNT/DAGGER/POLE/DUAL **[DP]**.

**1-19:** table 1.1 with a sword. **20-39:** table 1.3. Aggression only if the SWS is the party's tank.

### 40-75 Swordsinger

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Single target | **Deadly Strike (986, H5)** → Sword Symphony (98, from 55) → auto-attack | Deadly Strike on reuse (5 s). Sword Symphony on reuse (15 s), **first on caster mobs** (silence 10 s) | |
| AoE (2+ in melee) | Psycho Symphony (407, from 55) | 3+ mobs within melee range | Point-blank damage + attack/cast/run speed slow for 10 s, 15 s reuse **[DP]** |
| Self buff | **Battle Whisper (988, from 46)** | Keep up (2 min) | Not on the board |
| Toggle | Divine Blade (196) | Always on (holy damage, no upkeep drain) | |
| CC | Arrest (402, from 55); Entangle (102) | Runner, or the SWS is kiting | |
| Songs | Song of Earth (264), Water (266), Wind (268), Hunter (269), Warding (267), Life (265), Invocation (270), Flame Guard (306), Vitality (304), Storm Guard (308), Vengeance (305) | **Never while board songs are up.** These songs last only 120 s **[DP]**, so a recast swaps the 12 h board song for a 2 min one | Fallback if the board isn't bought: party, out of combat, Earth > Hunter > Warding > Wind > Life, recast every 2 min |
| Emergency | Ultimate Defense (110) | HP < 25 %, no healer | Guides call it the main emergency button **[G estranky]** |
| Heal | Elemental Heal (58) | HP < 40 % between mobs | |
| Never | Charm (15) unless tanking; Spirit Barrier (123), Sprint (230) | - | 0.2 |
| Obsolete | Power Strike (3) | - | Replaced by Deadly Strike |

### 76-85 Sword Muse

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Single target / AoE | As at 40-75 (Deadly Strike lv 16-25, Sword Symphony, Psycho Symphony) | | |
| Party songs not usually on a board | Song of Renewal (349), Song of Meditation (363), Song of Champion (364) | **Check the L2Toggle board list first.** If the board has them: never cast. If it doesn't: keep up in party (2 min each) | Renewal/Champion lower reuse and MP cost, Meditation adds mage MP regen **[DP]** |
| Situational | Song of Elemental (529) | Raid or elemental mobs | +30 all-element resistance, 2 min, 150 s reuse |
| Never auto | Song of Silence (437) | - | Point-blank silence on all mobs, 150 s reuse. A mass-PvP tool **[G estranky]**. Manual vs caster raid adds |
| Never auto | Symbol of Noise (455) | - | Battle Symbol |

---

## 4. Wind Rider line (Elven Fighter → Elven Scout → Plainswalker → Wind Rider)

Role: **dagger blow DPS**. Weapon: **DAGGER** (DUALDAGGER for Dual Blow at 83). All blows need a dagger; positional bonus from the side x1.5 and from behind x2;
Backstab works **only from behind** **[DP, positional_skills.md]**.

**1-19:** table 1.1 with a dagger (Mortal Blow). **20-39:** table 1.4, dagger rows.

### 40-75 Plainswalker

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Single target | Deadly Blow (263) → Backstab (30) when behind → Blinding Blow (321, from 66) | Deadly Blow on reuse (3 s). Backstab whenever I'm behind the mob (usually when the mob is fighting the tank). Blinding Blow on reuse (30 s): it turns the mob's back to me, so follow with Backstab **[DP]** | Deadly Blow and Blinding Blow can half-kill |
| Opener | Shadow Step (821) | Fresh target that isn't attacking me: teleport behind it, then Backstab. Also a gap-closer for runners | 75 s reuse; it cancels the mob's target |
| Toggle | Vicious Stance (312) | On while MP > 30 % | Crit damage + |
| Self buff | Mortal Strike (410, from 58) | Turn on at the start of each fight, or keep up (2 min, 150 s reuse) | Blow rate + **[DP]** |
| Debuff | Sand Bomb (412, from 55) | Hard-hitting single mob or a raid boss on me | Lowers the mob's accuracy for 30 s |
| Aggro control (party) | Switch (12) | A mob switches onto me while a tank is present | Randomizes hate + cancels target. Never solo |
| Pull | Lure (51) | Pulling single mobs to the party | Adds hate from range |
| Emergency | Ultimate Evasion (111) at HP < 35 %; Fake Death (60) at HP < 15 % with 2+ mobs | Fake Death makes mobs drop aggro. Toggle it off again after they leave | |
| Cleanse | Escape Shackle (453, from 60) | When physically rooted | |
| Never | Silent Move (221), Chameleon Rest (296), Unlock (27), Summon Treasure Key (419), Find Trap (623), Remove Trap (624) | - | 0.3 |
| Obsolete | Mortal Blow (16) | - | Replaced by Deadly Blow at 40 |
| Low value | Bleed (96), Charm (15), Entangle (102) | Bleed only on long single fights | |

### 76-85 Wind Rider

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Single target | **Lethal Blow (344)** → Deadly Blow (263) → Backstab (30) when behind → Blinding Blow (321) | Lethal Blow on every reuse (4 s, power 5773). Fill the gaps with Deadly Blow. Backstab when behind | Lethal Blow half-kill 15 % **[DP]** |
| Pre-fight / boss | Critical Wound (531) | Mobs with high HP, party targets and raids **[G estranky]** | +30 % crit damage taken by the target for 30 s, 8 s reuse |
| Focus buff | **Focus Death (355)** (or Focus Chance 356, same slot) | Keep Focus Death up (2 min, 30 s reuse) | Blow rate x1.6, rear crit damage x1.9, frontal x0.7 **[DP]**. Focus Chance raises rear/side crit *rate*. Death is the better pick for blow PvE **[G estranky]** |
| Self buff | Mortal Strike (410) | As at 40-75 | |
| Toggle | Focus Skill Mastery (334) | On only when MP > 50 % (raids, long fights) | Raises Skill Mastery procs (reuse reset). MP drain |
| CC | Bluff (358) | Single strong mob, or a mob that turned onto me in a party: Bluff (it turns its back and stuns 9 s), then Backstab | Also **deletes my hate** **[DP]**, so the mob goes back to the tank. Good in party |
| Emergency | Dodge (446) | Mob or raid casting physical skills on me, HP < 50 % | 10 s skill evasion, 75 s reuse |
| Slow | Throwing Dagger (991, at 80) | A low-HP mob running away | 45 s reuse |
| 83+ | Dual Blow (928) | Only with a DUALDAGGER | |
| Never | Symbol of the Assassin (460) | - | Battle Symbol |

---

## 5. Moonlight Sentinel line (Elven Fighter → Elven Scout → Silver Ranger → Moonlight Sentinel)

Role: **bow DPS** that kites solo. Weapon: **BOW** (all shots need it). Arrows must be kept stocked. The class is weak in melee, so keep
distance **[G estranky]**.

**1-19:** table 1.1 with a bow (Power Shot). **20-39:** table 1.4, bow rows (Rapid Shot from 32, Stun Shot from 36).

### 40-75 Silver Ranger

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Single target | **Double Shot (19)** → auto-attack | Double Shot on reuse (3 s, 900 range) | Main damage skill. Power Shot (56) stops at lvl 15, so it is obsolete |
| Kite / control | Stun Shot (101) | Solo: when a melee mob gets within ~200, stun it and step back. In party: only on a mob that is hitting me | Stun 9 s + **target cancel** **[DP]** |
| AoE (packed mobs) | Burst Shot (24, from 46) | 3+ mobs within 150 of the target (party AoE farm) | 224 MP at max level, 6 s reuse. Expensive, so not for solo |
| Self buffs (keep up) | Rapid Shot (99); Soul of Sagittarius (303) max MP; Spirit of Sagittarius (415, from 58) skill MP cost down; Blessing of Sagittarius (416, from 58) reuse down | Recast when missing (20 min each) | Not on the board |
| Burst | Rapid Fire (413, from 60) | Party fights, or when the mob is already close / a big single mob | P.Atk + attack speed x1.2 for 2 min, but **halves attack range** **[DP]**. Don't use while kiting solo |
| Toggle | Vicious Stance (312) | On while MP > 40 % | |
| Slow | Entangle (102) | Runner or chaser | |
| Emergency | Ultimate Evasion (111) at HP < 35 %; Elemental Heal (58) between mobs | | |
| Never | Quiver of Arrow: A Grade / S Grade (323/324) unless out of arrows; Detection (933) (PvP) | - | Quivers cost crystals |

### 76-85 Moonlight Sentinel

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Single target | **Lethal Shot (343)** → Double Shot (19) → auto-attack | Lethal Shot on every reuse (8 s, power 7698, half-kill) | |
| Kite | Hamstring Shot (354) | Melee mob approaching, or a runner | 30 % slow for 60 s, 15 s reuse |
| Defensive damage | Evade Shot (369) | I'm being hit (HP < 70 %), or in a raid | Damage + self Evasion +6 for 30 s, 75 s reuse |
| AoE | Burst Shot (24); Multiple Shot (987, at 82) | 3+ mobs. Multiple Shot is a 900-range 60 deg fan | |
| 83+ | Death Shot (990) | On reuse (12 s) | |
| Toggle | Focus Skill Mastery (334) | MP > 50 % only | MP drain |
| Never | Symbol of the Sniper (459) | - | Battle Symbol |

---

## 6. Mystic Muse line (Elven Mystic → Elven Wizard → Spellsinger → Mystic Muse)

Role: **water nuker**. Weapon: a magic weapon (blunt or staff). Cast times come from the datapack: Hydro Blast 4 s / 900 range, Ice Vortex 6 s, Aqua Splash 5 s **[DP]**.

**1-19:** table 1.2. **20-39:** table 1.5 (no summons).

### 40-75 Spellsinger

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Main nuke | **Hydro Blast (1235)** | Spam | Water, 1.2 s reuse. The core skill **[G hopzone snippet, asterios]** |
| Water debuff | Surrender To Water (1071) | Before Hydro Blast on mobs that take 3+ nukes (party mobs, elites, raids) | -20 water res for 30 s, 1.5 s cast |
| DoT | Ice Dagger (1237, from 44) | Once per high-HP mob, then go back to Hydro Blast | Water DoT, 20 s |
| Holy option | Solar Flare (1265) | On reuse (8 s) vs undead/dark mobs | 5 s cast |
| Melee-range filler | Aura Flare (1231) (150 range); Aura Bolt (1275) (400 range) | Only when the mob is already on me | |
| Slow / kite | Frost Bolt (1236) | Mob approaching from range, or a runner | Slow 20 % for 60 s |
| AoE | **Aqua Splash (1295, from 58)** target-centered, radius 200. Frost Wall (1174, from 52) frontal fan, cast at melee range (40) | 3+ mobs packed: Aqua Splash. Mobs in front of me and close: Frost Wall | Both hit up to 5-12 targets **[DP]** |
| CC | Sleep (1069) | An add joins while I'm on another mob (solo) | Don't sleep mobs that the party AoEs |
| Self buffs | Seed of Water (1286, from 66) (+water power, 10 min); Mana Regeneration (1047) | Keep up | Mana Regeneration: check the board for an MP_REGEN_UP buff **[?]** |
| Burst (boss/elite) | Aura Symphony (1288), Blizzard (1290), Elemental Symphony (1293) | Elite or raid only | 200 MP, **5 min reuse** **[DP]** |
| Emergency | Aura Flash (1417, from 58) | Surrounded solo with HP < 40 %: drop targets and step away | Point-blank + target cancel, costs Spirit Ore. **Never as DPS in a party** |
| Never | Curse Fear (1169) | - | Fleeing mobs pull adds |
| Never | Cancellation (1056) | - | PvP only |
| Never | Sleeping Cloud (1072) | - | 15 s cast **[DP]** |
| Low value | Freezing Shackle (1183), Curse Weakness (1164), Surrender To Earth (1223), Freezing Skin (1238), Resist Aqua (1182) | - | |
| Obsolete | Aqua Swirl (1175), Energy Bolt (1274), Aura Burn (1172), Solar Spark (1264), Flame Strike (1181), Ice Bolt (1184), Wind Strike (1177) | - | Elven Wizard skills that stop at lvl 35 |

### 76-85 Mystic Muse

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Main nuke | Hydro Blast (1235) | Spam | |
| Opener debuff | **Ice Vortex (1340)** | First cast on any mob that will take 3+ nukes | -20 water res + slows, 30 s, 15 s reuse, 6 s cast. It has its own abnormalType, so it **stacks with Surrender To Water** **[DP]** |
| Finisher | Ice Vortex Crusher (1453) | On reuse, **after** Ice Vortex has done its work (target < 40 %), or on mobs without a vortex | In this datapack it **dispels the target's Ice Vortex** when it hits **[DP]**. Don't cast it right after the vortex. A guide uses Vortex → Crusher as a PvP burst combo **[G estranky]** |
| Holy | Light Vortex (1342) + Solar Flare (1265) | Undead / dark mobs | Light Vortex = -30 holy res |
| Boss | Arcane Chaos (1338) | Raid or boss, before other debuffs | +30 debuff vulnerability |
| AoE | Aqua Splash (1295); Diamond Dust (1454) | 3+ packed mobs: Aqua Splash. Mobs on me (radius 200): Diamond Dust, which also slows 40 % | |
| DoT | Throne of Ice (1455) | Single high-HP mob | 75 s reuse |
| Toggle | **Arcane Power (337)** | On while HP > 60 % and a healer is present (or HP regen is enough). Off when HP < 50 % | M.Atk x1.3, MP cost x1.1, **drains HP** **[DP]**. Guides say use it sparingly **[G estranky]** |
| 81-83 | Aura Blast (1554) (AoE), Aura Cannon (1555) (150 range), Arcane Shield (1556) | Arcane Shield when HP < 30 % and MP is high | |
| Never | Raging Waves (1421) | - | Magic Symbol, 30 min reuse |

---

## 7. Elemental Master line (Elven Mystic → Elven Wizard → Elemental Summoner → Elemental Master)

Role: **summoner**. The servitor does the damage. The owner keeps it alive and buffed, adds cubics, and nukes with Dimension Spiral.
Owner rule: the summoner heals **only its own servitor**.

**1-19:** table 1.2. **20-39:** table 1.5 (summoner rows). Guides say summons are weak before 40 **[G ES thread]**, so nuke with Aqua Swirl and keep Boxer
out for MP.

### 40-75 Elemental Summoner

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Servitor | **Summon Merrow the Unicorn (1277)** | Main leveling and party pet from 40 to 79 **[G ES thread, scryde/linedia]** | 1 h lifetime **[DP]**. Resummon on death or expiry |
| Alt. servitor | Summon Seraphim the Unicorn (1332, from 56) | Only in a mage party when the owner wants its buffs (MP regen, reuse) rather than damage **[G estranky, ES thread]** | |
| Alt. servitor | Summon Boxer the Unicorn (1226) | Owner MP is the bottleneck | Restores the owner's MP |
| Never | Summon Mirage the Unicorn (1227) | - | XP penalty (see 1.5) |
| Owner nuke | **Dimension Spiral (1558, H5)** | On reuse (15 s) at the servitor's target | 900 range |
| Owner debuff | Wind Shackle (1206) | On a melee mob attacking me | Attack speed slow |
| AoE support | Mass Surrender to Water (1384, from 58) | Party AoE with water nukers, 3+ mobs around the pet | Point-blank on the pet: -30 water res. Costs Spirit Ore |
| Cubics | Summon Aqua Cubic (1280) or Mass Summon Aqua Cubic (1329) (damage/DoT); Summon Life Cubic (67) (heals) | **Life + Aqua** at all times. Mass version only in party | 15 min. Cost Spirit Ore |
| Pet heal | Servitor Heal (1127) | Pet HP < 60 % (2 casts at < 35 %) | 4 s cast |
| Pet MP | Servitor Recharge (1126) | Pet MP < 30 % | |
| Pet cleanse | Servitor Cure (1300); Servitor Blessing (1301, at 62) | Pet poisoned or bleeding / pet rooted, paralyzed or slowed | |
| Pet buffs | Servitor Physical Shield (1140), Servitor Magic Shield (1139), Servitor Haste (1141), Bright Servitor (1145) | Keep up on the pet (20 min) **only if the board doesn't buff the pet** **[?]** | |
| Self | **Transfer Pain (1262)** toggle; Spirit Sharing (1547, from 44) | Transfer Pain **always on while the pet is out** (moves part of my damage to the pet) **[G estranky, ES thread]**. Spirit Sharing: keep up (20 min) | |
| Pet emergency | Servitor Empowerment (1299, from 52) | Pet HP < 30 % with several mobs on it | Huge defense, but roots the pet for 30 s, 15 min reuse **[DP]** |
| Never | Betray (1380) | - | PvP / summoner targets |
| Obsolete | Aqua Swirl (1175), Aura Burn (1172), Energy Bolt (1274), Solar Spark (1264), Flame Strike (1181), Sleep (1069), Surrender To Earth (1223) | - | No ES upgrades. Use Dimension Spiral instead |

### 76-85 Elemental Master

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Servitor | **Summon Magnus the Unicorn (1407, at 79)** | Replaces Merrow at 79 | The strongest damage pet **[G estranky, ES thread]**. Costs Spirit Ore over time |
| Pet burst buffs | Final Servitor (1349); Wizard Servitor (1347) | Boss, elite or raid only. Final Servitor for a melee/hybrid pet, 20 Spirit Ore; Wizard Servitor 10 Spirit Ore | 5 min, 60 s reuse. Both are MULTI_BUFF and **collide with Chant of Victory** if the pet has it (0.2) |
| Toggle | Arcane Agility (338) | On while HP > 60 %; off below 50 % | Cast speed x1.2, reuse x0.9, MP x1.1, **drains HP** |
| Cubics | Summon Smart Cubic (782, at 80) | Life + Smart (debuff removal) **[G]** | 38 Spirit Ore |
| Owner nuke | Dimension Spiral (1558) lv 15-24 | On reuse | |
| 83 | Servitor Share (1557) | Keep up (20 min) | |
| Never | Warrior Bane (1350) | - | Strips enemy speed/haste buffs, PvP only |
| Never | Anti-Summoning Field (1424) | - | Magic Symbol |

---

## 8. Eva's Saint line (Elven Mystic → Elven Oracle → Elven Elder → Eva's Saint)

Role: **healer and recharger**. **Owner rule: heals only.** No nukes, no CC, no transformations, and no board-duplicate buffs.
Recharge (1013) **cannot target any class that also has Recharge** (EE/SE/Bishop/Prophet...), and that includes the caster herself **[DP cond]**.

**1-19:** table 1.2 (solo she has to nuke; in a party she heals).

### 20-39 Elven Oracle

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Single heal | Heal (1011) | Member HP < 70 %, nothing urgent | 5 s cast, cheap |
| Fast heal | Battle Heal (1015) | Member HP < 40 % | 2 s cast, 1 s reuse, costly MP |
| Group heal | Group Heal (1027) | 3+ members < 70 % | 7 s cast |
| MP | Recharge (1013, from 30) | A mage or fighter with MP < 50 % (not a healer class), my MP > 40 % | 6 s cast |
| Res | Resurrection (1016) | Dead member, no mob aggro on me | 6 s cast |
| Cleanse | Cure Poison (1012) | Member poisoned | |
| Never (owner rule) | Disrupt Undead (1031), Wind Shackle (1206), Dryad Root (1201), Sleep (1069) | - | |
| Never (board) | Might (1068), Shield (1040), Wind Walk (1204), Agility (1087), Mental Shield (1035), Holy Weapon (1043), Regeneration (1044), Concentration (1078), Resist Poison (1033) | Only if board buffs are missing | |
| Never | Kiss of Eva (1073), Decrease Weight (1257) | - | Nearly useless **[G l2vika]** |

### 40-75 Elven Elder

Heal priority (check every tick, lowest HP % first, tank first when tied):

| Priority | Condition | Skill (id) | Notes [DP] |
|---|---|---|---|
| 1 | Anyone < 30 % | Vitalize (1020, from 48) | 3 s cast, power 780. Before 48: Battle Heal (1015) |
| 2 | 3+ members < 65 % | Greater Group Heal (1219, from 48) | 378 + HoT for 15 s, 7 s cast. Before 48: Group Heal (1027) |
| 3 | Tank or member < 60 % and Spirit Ore in bag | Major Heal (1401, from 56) | Power 946, 5 s cast, **1 Spirit Ore per cast**. Guides call it the best heal per MP **[G l2vika]** |
| 4 | Member < 75 % | Greater Heal (1217) | 472 + HoT for 15 s. Don't recast on the same target while its HoT is running **[G l2vika]** |
| 5 | Member poisoned or bleeding | Vitalize (1020) if HP is also low, else Cure Poison (1012) | |
| 6 | Nobody < 80 %, a non-healer has MP < 50 % | Recharge (1013) | |
| 7 | Out of combat | Resurrection (1016) on dead members | |

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Self emergency | Serenade of Eva (1273, from 44) | 2+ mobs hitting **me** and the tank can't take them back | Point-blank hate wipe, 15 min reuse. Defensive, so it fits "only heal" **[?]** |
| Self MP | Invocation (1430, from 56) | **Only out of combat**, no mobs near, MP < 30 % | Stuns self for 30 s and cuts P.Def to x0.1 **[DP]**. Never in combat |
| Optional party buffs | Clarity (1397), Advanced Block (1304), Bless Shield (1243), Resist Dark (1393), Wild Magic (1303), Resist Shock (1259) | Only if the board doesn't give them (Advanced Block and Bless Shield only on a shield tank). Cast out of combat | Owner decides. Default **off** |
| Never (owner rule) | Might of Heaven (1028), Mana Burn (1398), Turn Undead (1400), Trance (1394), Sleep (1069), Wind Shackle (1206), Erase (1395), **Inquisitor (1521)** | - | Inquisitor is a 6 h combat transformation |
| Never | Return (1050), Party Recall (1255) | - | Escape skills |
| Obsolete | Heal (1011), Group Heal (1027), Battle Heal (1015) | - | Replaced by Greater Heal, Greater Group Heal and Vitalize at 40-48. Battle Heal only as a fallback when out of Spirit Ore and MP is plentiful |

### 76-85 Eva's Saint

All of the Elder heal priority still applies. Changes and additions:

| Slot | Skill (id) | When / trigger | Notes |
|---|---|---|---|
| Group heal | **Mass Vitalize (1552, at 76)** | 3+ members < 70 %, or the party is poisoned/bleeding | 3 s cast, 9 s reuse. Faster than Greater Group Heal; use it first, GGH second |
| Group heal (83) | Chain Heal (1553) | 3+ members < 50 % in a cluster | 30 % max HP to the lowest members. 4 Spirit Ore, 5 s reuse |
| Toggle | **Arcane Wisdom (336)** | On while recharging or MP is tight and own HP > 70 %. Off when own HP < 50 % | MP cost x0.7, cast speed x0.9, **drains HP** **[DP]**. Guides recommend it for recharging **[G estranky, l2vika]** |
| MP support | Mana Gain (1460) | Cast once on the main recharge targets (mages) before recharging | +85 to Recharge received, 20 min, 150 s reuse |
| Optional buffs | Arcane Protection (1354), Divine Protection (1353) | Raids with debuffs or dark/holy damage, out of combat | Default off (owner rule) |
| Never | Prophecy of Water (1355) | - | 5 min, 10 Spirit Ore, and it **overwrites the board's Chant of Victory** (MULTI_BUFF) |
| Never | Mass Recharge (1428) | - | Magic Symbol, 1 h reuse |
| Never | Block Wind Walk (1359) | - | PvP |

---

## Sources

- l2info.estranky.cz class guides (H5/GoD-era, Czech): [Wind Rider](https://l2info.estranky.cz/clanky/wind-rider.html), [Eva's Templar](https://l2info.estranky.cz/clanky/evas-templar.html),
  [Elemental Master](https://l2info.estranky.cz/clanky/elemental-master.html), [Moonlight Sentinel](https://l2info.estranky.cz/clanky/moonlight-sentinel.html),
  [Mystic Muse](https://l2info.estranky.cz/clanky/mystic-muse.html), [Eva's Saint](https://l2info.estranky.cz/clanky/eva_s-saint.html), [Sword Muse](https://l2info.estranky.cz/clanky/sword-muse.html)
- [Elven Elder guide, l2vika.ru](https://l2vika.ru/gameplay/gaid-elven-elder.html) (Interlude-era: heal choice, Recharge limits, useless buffs)
- [Temple Knight guide (Interlude), linedia.ru](https://linedia.ru/wiki/%D0%93%D0%B0%D0%B9%D0%B4_Temple_Knight_(Interlude)) (cubics, toggles, Charm useless)
- [Гайд по ТК 2.0, Asterios forum](https://forum.asterios.tm/topic/91472-%D0%B3%D0%B0%D0%B9%D0%B4-%D0%BF%D0%BE-%D1%82%D0%BA-20/) (2010)
- [Гайд по Mystic Muse, Asterios forum](https://forum.asterios.tm/topic/94526-gajd-po-mystic-muse/) (2010: Hydro Blast core, Ice Vortex/Crusher, Arcane Power)
- [Elemental Summoner High Five thread, forum.lineage2.com.pl](https://forum.lineage2.com.pl/index.php?topic=36709.0) (Merrow 40-79, Magnus, Transfer Pain, Mirage XP)
- [Elemental Summoner, linedia.ru](https://linedia.ru/wiki/Elemental_Summoner)
- [Wind Rider class skills H5, l2db.info](https://l2db.info/high-five/classes?class=101); [MaxCheaters Wind Rider guide](https://maxcheaters.com/topic/77412-guide-wind-rider/) (search snippet only: Shadow Step)
- [Spellsinger Guide, HopZone](https://forums.hopzone.net/forum/pc-gaming/lineage-2/l2-guides/1523-spellsinger-guide-full) (search snippet only: Surrender to Water before Hydro Blast; the site did not resolve)
- Local datapack: `Scripts/data/dp/skills/*.xml`, `classSkillTree.xml`, `highFiveNewClassSkillTree.xml`, and `docs/plan/positional_skills.md`

Gaps: StrategyWiki returned 403, and I found no H5-specific English PvE rotation guide for Silver Ranger, Swordsinger or Plainswalker. Those rows rely on
datapack effects plus general L2 play patterns, so treat them as **[?]** where no [G] tag is given.
