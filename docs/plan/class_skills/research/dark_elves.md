# Dark Elf class lines: which skills to use, and when (H5 / L2Toggle)

Research notes for the bot's skill logic. Written 2026-10-26.

**Where the facts come from.** Skill names, ids, learn levels and weapons come from `docs/plan/class_skills/<Line>.md`. I re-read those files after they were regenerated with `highFiveNewClassSkillTree.xml`. Every mechanic quoted below (reuse, radius, target cap, buff type, item cost, weapon condition) I checked in the local datapack, `Scripts/data/dp/skills/*.xml`. Those checks are marked **[dp]**. Advice on how players actually play comes from the web sources listed at the end of each line. Old-chronicle sources are flagged.

**What the tables mean.**
- **Single**: the normal rotation on one mob.
- **AoE**: skills that hit several mobs, with the minimum mob count that makes them worth it.
- **Toggles / self-buffs**: what to keep up, and when.
- **Situational**: skills with an explicit trigger.
- **NEVER auto**: skills the bot must not cast on its own.
- **Obsolete**: skills the bot should drop once a newer one replaces them.

Uncertain points are marked **(?)**.

## Global rules for every Dark Elf line

1. **Don't recast what the board already gives.** The 12 h board buffs (including dances) use the same buff types as the class's own copies. For example, Might and Attack Aura are both `PA_UP`, Shield and Defense Aura are both `PD_UP`, and each dance has its own `DANCE_OF_*` type **[dp]**. In L2J an equal or higher level of the same buff type replaces the active one, so a recast turns a 12 h buff into a 2 min dance or a 20 min aura.
   - Rule: never auto-cast a self or party buff whose buff type is already active from the board.
   - (?) This depends on whether the L2Toggle board uses the retail skill ids or custom ones.
2. **Check the weapon before casting.** The skill files list weapon conditions. Examples: dances and blade dances need DUAL; Backstab and the blows need DAGGER or DUALDAGGER; Vengeance, Magical Mirror and Shield Strike need a SHIELD.
3. **Items.** Cubics, summons, Aura Flash, Erase, Betray, Prophecy of Wind and Chain Heal cost Spirit Ore (3031). Symbols, Cyclone, Anti-Summoning Field and Mass Recharge cost item 8875 or 8876 and have 30–60 min reuse. The bot must check stock before casting.
4. **Never auto-cast transformation stances.** Vanguard (813) and Inquisitor (1522) are TRANSFORM, 6 h **[dp]**. They swap your whole skill bar.
5. **Symbols (Symbol of Defense, Noise, Assassin, Sniper) are NEVER auto.** They cost item 8875, have 30 min reuse, and dispel your own `PHYSICAL_STANCE` toggles on cast **[dp]**.

---

## 1. Shillien Templar (Dark Fighter → Palus Knight → Shillien Knight → Shillien Templar). Party TANK

Weapon: one-handed **sword or blunt plus a shield** from 40 on.
- Judgment needs SWORD, BLUNT or DUAL.
- Shield Strike, Vengeance, Magical Mirror, Shield Bash and Shield Deflect Magic need a SHIELD.
- Sting does not work with a blunt; it needs a sword.

The owner's party uses this class as its tank, so the rules are strict. **The tank's job is hate, not damage.** The legacy tanking guide says the tank should be "doing nothing but hating the raid boss the entire time".

How the hate skills work **[dp]**:
- **Aggression (28)**: single target, TargetMe + GetAgro. 6 s reuse; range 400/600/800 at levels 1-12/13-33/34+.
- **Aura of Hate (18)**: point-blank 200 radius, up to 10 mobs, 40 s reuse, 102 MP.
- **Shield Strike (984)** and **Judgment (401)**: deal damage and also add hate (GetAgro). Judgment also lowers the target's crit damage.
- **Challenge for Fate (985)**: a frontal-cone mass taunt, up to 10 mobs within 400, 45 s reuse. Learned at 83.

### 1-19 Dark Fighter (solo leveling)
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | Power Strike (3) | On cooldown with a sword or blunt. This line should use a sword from the start. |
| Single | Drain Health (70) | From 15. Use when own HP < 60% (drains 20% of damage). |
| AoE | none | |
| Self-buffs | Attack Aura (77), Defense Aura (91) | Only if the board's Might/Shield are **not** active (global rule 1). |
| NEVER auto | Mortal Blow (16), Power Shot (56) | Wrong weapon (dagger / bow). |

### 20-39 Palus Knight (begins tanking in party)
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Hate (party) | Aggression (28), from 24 | On every new mob in the pack, and whenever any mob targets someone other than the tank. 6 s reuse; spam it across the pack. |
| Single | Sting (223) | Damage filler between Aggressions (sword only). |
| Single | Power Break (115), from 32 | On hard-hitting mobs. It lowers the mob's P.Atk, which reduces the damage the tank takes. |
| Sustain | Drain Health (70) | Own HP < 60% while solo. In party, leave HP to the healer. |
| Self-buffs | Deflect Arrow (112), from 24 | Keep up against archer mobs (20 min). |
| Situational | Freezing Strike (105), from 36 | On a fleeing mob (60% chance of −20% speed). |
| Emergency | Ultimate Defense (110) | HP < 30% and still taking hits, or 3+ mobs on the tank. It **roots you for 30 s**; 15 min reuse **[dp]**. |
| NEVER auto | Confusion (2) | Randomizes the mob's hate (RandomizeHate). It makes mobs leave the tank. |
| NEVER auto | Poison (129) | Wasted GCD. |

### 40-75 Shillien Knight (main party tank)
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Hate, AoE | **Aura of Hate (18)** | 2+ mobs within 200 of the tank, or right after the pull lands. 40 s reuse. |
| Hate, single | **Aggression (28)** | Any mob not targeting the tank, or the RB/primary target every ~6 s. This is the highest-priority skill. |
| Hate + damage | **Shield Strike (984)**, from 40 | Main attack on the current target; 6 s reuse. |
| Hate + damage | **Judgment (401)**, from 55 | Second attack; 4 s reuse; adds hate and a −crit-damage debuff. |
| Debuffs (tank target) | Hex (122) −23% P.Def; Power Break (115) −P.Atk | Hex on mobs the party is killing; Power Break on heavy hitters. Use only once aggro is safe. |
| Control | Arrest (402), from 55 | Root a mob that is running toward the healer or caster. Range 150, 10 s root. |
| Control | Lightning Strike (279), from 58 | 15 s reuse; 40% paralysis. Use on a dangerous add, not in the rotation. The pmfun H5 poster calls it a nifty skill "nobody ever uses" with a decent land rate. |
| Toggles (always on while tanking) | **Guard Stance (288)**, from 43 | +P.Def and +50% shield block. Drains MP: this is why the Saint recharges the tank. |
| Toggles (always on while tanking) | **Shield Fortress (322)**, from 64 | +shield defence. |
| Self-buffs | Deflect Arrow (112) | Keep up (20 min). |
| Party buff | Combat Aura (982), from 52 | Keep up (20 min, `KNIGHT_AURA`). Skip only if the board supplies it. |
| Cubics | Vampiric Cubic (22), Viper Cubic (278), Phantom Cubic (33) | Summon before the pull and re-summon when expired (15 min). Up to the Cubic Mastery limit; they cost Spirit Ore. The legacy guide calls the healing (vampiric) cubic "not really useful most of the time". Priority: Phantom (debuffs mobs), then Viper, then Vampiric. (?) |
| Emergency | Ultimate Defense (110) | HP < 30% with several mobs on the tank, or the healer is down. Roots the tank for 30 s; 15 min reuse. The legacy guide says to save it for RBs with minions. |
| Emergency | Shield Deflect Magic (916), from 60 | 8 s magic reflect; use when caster mobs or an RB start a nuke chain. |
| Sustain | Drain Health (70), Life Leech (289) | Solo only, at HP < 50%. In party, keep the GCD for hate. |
| NEVER auto | **Confusion (2)** | Drops aggro (see above). |
| NEVER auto | **Vanguard (813)** | A transformation stance: shield defence ×0.5, 6 h **[dp]**. It is the anti-tank stance. |
| NEVER auto | Corpse Plague (103) | AoE poison from a corpse (150 radius). It pulls extra mobs. |
| NEVER auto | Banish Seraph (450) | Works only on DIVINE-race mobs and consumes an item. |
| NEVER auto | Poison (129), Freezing Strike (105) | No value for the tank. |
| Obsolete | Sting (223) | Replaced by Shield Strike and Judgment from 55. |
| Obsolete | Power Strike (3) | No longer used past 20. |

### 76-85 Shillien Templar
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Hate | Aggression, Aura of Hate, Shield Strike, Judgment | Same priority order as 40-75. |
| Hate | **Challenge for Fate (985)**, from 83 | Mass taunt on a big pull: 3+ mobs in front, 45 s reuse. Alternate it with Aura of Hate. |
| Toggles | Guard Stance + Shield Fortress + **Fortitude (335)** | Keep all three on while tanking. Fortitude gives +30 stun/paralysis resistance. |
| Self-buff | **Iron Shield (527)** | Keep up (20 min, 150 s reuse). It has a 30% chance to proc a defensive skill when hit for ≥ 100. |
| Cubics | Smart Cubic (780), from 80 | Replaces one damage cubic (it cleanses debuffs and heals (?)). Keep Phantom + Smart if the cubic limit allows. |
| Situational | **Magical Mirror (351)** | Caster mobs or a caster RB: reflects 30% of magic skills for 5 min; 150 s reuse; shield required. |
| Emergency | **Vengeance (368)** | AoE panic button: 3+ mobs loose on the party, or the healer is being hit. 40% chance to taunt everything within 200; huge P.Def/M.Def for 30 s; **roots self**; 15 min reuse; shield required. |
| Emergency | **Shield of Faith (528)** | Party (healer or caster) is taking heavy AoE damage. For 15 s it moves 90% of party members' damage onto the tank. Only when tank HP > 60%. 15 min reuse. |
| Emergency | Ultimate Defense (110) | As before. Don't stack it with Vengeance: both are `PD_UP_SPECIAL` and replace each other **[dp]**. |
| NEVER auto | **Touch of Death (342)** | Costs **669 HP**. It cuts CP by 90%, raises debuff vulnerability, and strips buffs. CP and debuff resistance only matter in PvP, so it is useless on mobs and harmful to the tank's own HP. |
| NEVER auto | **Shield Bash (352)** | 2 s stun plus 80% target cancel **[dp]**. Cancelling a mob's target can make it switch to the healer. PvP only. |
| NEVER auto | Symbol of Defense (454) | Global rule 5. |
| NEVER auto | Vanguard, Confusion, Corpse Plague | See 40-75. |

Sources: [pmfun H5 Shillien Templar thread](https://forum.pmfun.com/viewtopic.php?t=52038) (enchant choices: Aggression and Hate Aura for −Def, Arrest for chance, Lightning Strike "decent landing rate"); [legacy-lineage2 tanking guide](https://legacy-lineage2.com/guide/guides_tanking3.html) (Guard Stance MP drain, save Ultimate Defense, tank only hates; old chronicle); [linedia SK H5 changes](https://linedia.ru/wiki/%D0%93%D0%B0%D0%B9%D0%B4_Shilien_Knight_High_Five) (Shield Strike and Judgment now add hate in H5); datapack [dp].

---

## 2. Spectral Dancer (Dark Fighter → Palus Knight → Bladedancer → Spectral Dancer). AoE melee and buffer

Weapon: **dual swords** from 40. Every dance and both blade dances need DUAL **[dp]**. From 1 to 39 use a one-handed sword, because Sting needs SWORD/DAGGER/DUAL.

Special rule for this party: **the board already supplies the dances for 12 h.** The SD's own dances last 120 s **[dp]** and would replace the 12 h board copy (global rule 1). So the SD bot should **not auto-dance** while board dances are active. It plays as melee AoE damage.
- (?) If L2Toggle board dances use different skill ids, verify in game before re-enabling any dance.

### 1-19 Dark Fighter
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | Power Strike (3) | On cooldown (sword). |
| Sustain | Drain Health (70) | HP < 60%. |
| Self-buffs | Attack/Defense Aura | Only if no board Might/Shield. |
| NEVER auto | Mortal Blow, Power Shot | Wrong weapon. |

### 20-39 Palus Knight (melee damage, not tank)
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | Sting (223) | On cooldown (3 s). |
| Single | Power Break (115), from 32 | On hard mobs. |
| Sustain | Drain Health (70) | HP < 60%. |
| Situational | Freezing Strike (105) | On a runner. |
| Emergency | Ultimate Defense (110) | Solo, HP < 25% (roots self for 30 s). |
| Self-buff | Deflect Arrow (112) | Against archer mobs. |
| NEVER auto | **Aggression (28)** | This char is not the tank; taunting steals aggro from the Shillien Knight. |
| NEVER auto | Confusion (2), Poison (129) | |

### 40-75 Bladedancer
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | **Deadly Strike (986)**, from 40 | Main hit; 5 s reuse; works with dual swords. |
| Single | Sting (223) | Filler. |
| AoE | **Demonic Blade Dance (408)**, from 55 | **2+ mobs within 150** of the SD. Point-blank, up to 6-12 targets, 15 s reuse. Also lowers P.Atk/M.Atk of the mobs hit. |
| AoE | **Poison Blade Dance (84)**, from 55 | 3+ mobs within 150 and the pack is not dying instantly. Point-blank 30 s poison, 35% chance. Lower priority than Demonic. |
| Debuff | Hex (122) | Before focusing a big mob or an RB. |
| Debuff | Power Break (115) | Only when the SD itself is being hit. |
| Control | Arrest (402), from 55 | Root a runner (150 range). |
| Sustain | Drain Health (70) | HP < 50%, single target only. |
| Self-buff | **Defense Motion (989)**, from 60 | When the SD is the one being hit (+25% P.Def, 2 min). |
| Dances | Dance of Fire, Light, Inspiration, Mystic, Concentration, Warrior, Fury, Earth Guard, Protection, Aqua Guard, Vampire (274/277/272/273/276/271/275/309/311/307/310) | **Off by default** (board). Re-enable a single dance only when the board copy is missing. Dances last 2 min; 1000 party radius. |
| NEVER auto | Aggression (28) | Not the tank. |
| NEVER auto | Confusion (2), Poison (129), Freezing Strike (105) | |
| Obsolete | Power Strike (3) | |

### 76-85 Spectral Dancer
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | Deadly Strike (986), Sting | As 40-75. |
| AoE | Demonic Blade Dance (408), Poison Blade Dance (84) | As 40-75. This is the SD's main value in packs. |
| Situational | Dance of Alignment (530) | Only against holy or dark element RBs and mobs: +30 holy/dark resistance, 2 min, **150 s reuse**. |
| Situational | Dance of Siren (365) | Party with nukers and no board Siren (+magic crit). |
| Emergency | **Dance of Medusa (367)** | Escape only: party wipe imminent, or the SD is alone with 3+ mobs. It petrifies mobs within 150 for 10 s, and **petrified mobs take no damage** (BlockDamage HP) **[dp]**. In normal farming it stalls the kill. |
| NEVER auto | **Dance of Shadows (366)** | Party **−50% run speed** (stealth dance). |
| NEVER auto | Symbol of Noise (455) | Global rule 5. |
| NEVER auto | Dance of Medusa in normal rotation | Blocks damage (see above). |

Sources: [linedia BD H5 changes](https://linedia.ru/wiki/%D0%93%D0%B0%D0%B9%D0%B4_Blade_Dancer_High_Five) (Deadly Strike and Defense Motion added in H5; Demonic Blade Dance buffed; Medusa duration cut); [L2DB H5 Spectral Dancer](https://l2db.info/high-five/classes?race=2&class=107&level=81) (Medusa petrifies; Shadows slows the party); datapack [dp]. No good H5 English rotation guide was found. The AoE thresholds above are my inference from the radius and target caps in the datapack.

---

## 3. Ghost Hunter (Dark Fighter → Assassin → Abyss Walker → Ghost Hunter). Dagger blows

Weapon: **dagger**. Dual daggers from 81 or later enable Dual Blow (83).
- The pmfun H5 thread says a single dagger "tends to be better for large scale PVE" because only it has Backstab and the overall damage is higher.
- Blow skills need DAGGER or DUALDAGGER **[dp]**.

Positioning matters **[dp]**:
- **Backstab (30)** only works from behind (40% blow chance).
- **Focus Death (355)** gives frontal crit damage ×0.7 and rear ×1.9.
- **Focus Power (357)** gives front ×0.7, side ×1.3 and rear ×1.6.
- So when the tank holds the mob, the dagger should stand **behind** it.

### 1-19 Dark Fighter
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | Mortal Blow (16) | On cooldown (dagger). |
| Sustain | Drain Health (70) | HP < 60%. |
| Self-buffs | Attack/Defense Aura | Only without board Might/Shield. |
| NEVER auto | Power Strike, Power Shot | Wrong weapon. |

### 20-39 Assassin
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | **Mortal Blow (16)** | Main skill; 3 s reuse; 20% blow chance. |
| Single | Bleed (96), from 24 | On longer fights: 100% chance, 20 s bleed, −20% speed. |
| Single | Sting (223) | Filler. |
| Single | Power Break (115) | Solo, on hard-hitting mobs. |
| Toggles | **Vicious Stance (312)** | Always on (+crit damage, small MP drain). |
| Toggles | Accuracy (256), from 24 | On while missing mobs or fighting high-evasion mobs; cheap. |
| Emergency | Ultimate Evasion (111), from 28 | HP < 35% and still being hit: big evasion for 30 s; 15 min reuse. |
| Situational | Freezing Strike (105) | On a runner. |
| NEVER auto | Power Shot (56), Rapid Shot (99), Stun Shot (101) | Bow skills. This char uses a dagger. |
| NEVER auto | Confusion (2), Poison (129) | |
| NEVER auto | Unlock (27) | Utility; costs keys. |

### 40-75 Abyss Walker
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single (front or side) | **Deadly Blow (263)** | Main skill; 3 s reuse; 68 MP; 30% blow chance; can half-kill. |
| Single (behind) | **Backstab (30)** | Whenever the dagger is behind the target (the mob is on the tank). 3 s reuse; 112 MP; strongest hit. |
| Single | **Blinding Blow (321)**, from 66 | 30 s reuse. Hits and forces the mob to turn its back (Bluff effect 80%). Follow with Backstab. |
| Opener | Shadow Step (821) | Solo opener: teleport to the target plus target cancel, then Backstab. 75 s reuse. In party, only if the dagger is in front of the mob. |
| Self-buffs | **Mortal Strike (410)**, from 58 | +blow rate for 2 min; 150 s reuse. Cast on cooldown at the start of each fight. |
| Toggles | **Vicious Stance (312)** | Always on. |
| Toggles | Accuracy (256) | As needed. |
| Debuff | Hex (122) | Big or RB targets, before the blows. |
| Debuff | Bleed (96) | Long fights. |
| Emergency | **Trick (11)**, from 49 | The dagger has aggro (mob targeting it) and HP < 50%: 80% chance to delete hate and target cancel. |
| Emergency | Veil (106), from 43 | Makes the mob passive for up to 120 s (70% chance). Use on an add attacking the dagger while solo. |
| Emergency | Sand Bomb (412), from 55 | −accuracy on the mob hitting the dagger. |
| Emergency | Ultimate Evasion (111) | HP < 35%. |
| Emergency | Escape Shackle (453), from 60 | When rooted (removes physical root only). |
| NEVER auto | **Silent Move (221)** | Toggle stealth with **−40% run speed** **[dp]**. Kills farming tempo; travel only. |
| NEVER auto | Lure (51) | Adds 500 hate to the dagger. Pulls mobs onto the dagger, not the tank. |
| NEVER auto | Unlock (27), Summon Treasure Key (419), Find Trap (623), Remove Trap (624) | Utility only. |
| NEVER auto | Confusion (2), Poison (129), Freezing Strike (105), Power Break (115) in party | Wasted GCDs. |
| Obsolete | Mortal Blow (16) | Replaced by Deadly Blow at 40. |
| Obsolete | Sting (223) | Too weak after 40. |

### 76-85 Ghost Hunter
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | **Lethal Blow (344)** | Highest-priority blow: 5773 power, 4 s reuse, 15% half-kill chance. |
| Single | **Deadly Blow (263)** | Fill between Lethal Blows. |
| Single | **Backstab (30)** | When behind the target. |
| Combo | **Bluff (358)** → Backstab | When not behind the mob: 40% stun for 9 s, turns the mob's back, and deletes hate on the dagger. Then Backstab. 8 s reuse. |
| Combo | Blinding Blow (321) → Backstab | Same idea, 30 s reuse. |
| Single | **Dual Blow (928)**, from 83 | Dual daggers only: 11234 power, 60% blow chance, 8 s reuse. The best blow when wielding dual daggers. |
| Debuff | **Critical Wound (531)** | Before the blows on big mobs and RBs: target takes +30% crit damage for 30 s; 8 s reuse. |
| Self-buff | **Focus Death (355)** or **Focus Power (357)** | Pick one; they share the `FOCUS_DAGGER` buff type **[dp]**. Focus Death (+60% blow rate, crit rate ×0.7, rear crit damage ×1.9) suits a Backstab-heavy party dagger standing behind. Focus Power suits side or mixed angles. The old HopZone guide said Focus Death should be "removed when fighting in front". (?) |
| Self-buff | Mortal Strike (410) | On cooldown. |
| Toggles | Vicious Stance (312) | Always on. |
| Toggles | Focus Skill Mastery (334) | On while MP > 40% (+skill-mastery proc chance; drains 2 MP per tick). (?) Value is debated. |
| Situational | Throwing Dagger (991), from 80 | Mob fleeing (−80% speed for 10 s; 300 range; 45 s reuse). |
| Emergency | **Counterattack (447)** | Dagger is being hit by melee mobs and HP < 50%: reflects 90% of physical skill damage for 10 s; 75 s reuse. |
| Emergency | Trick, Ultimate Evasion | As 40-75. |
| NEVER auto | Symbol of the Assassin (460) | Global rule 5. |
| NEVER auto | Silent Move, Lure and the utility skills | As 40-75. |

Sources: [pmfun "General Tips Regarding Hi5/Abyss Walker"](https://forum.pmfun.com/viewtopic.php?t=51660) (single dagger for PvE, Giants Cave half-kills, wolf pet until ~79); [MaxCheaters GH guide](https://maxcheaters.com/topic/73896-guide-ghost-hunter/) and HopZone guide via search snippets (Lethal Blow from the front, Bluff + Backstab + Focus Death; old chronicle); [linedia AW H5](https://linedia.ru/wiki/%D0%93%D0%B0%D0%B9%D0%B4_Abyss_Walker_High_Five) (skill effects; Shadow Step into Backstab); [L2DB GH H5](https://l2db.info/high-five/classes?race=2&class=108); datapack [dp].

---

## 4. Ghost Sentinel (Dark Fighter → Assassin → Phantom Ranger → Ghost Sentinel). Archer

Weapon: **bow** throughout. Every shot skill needs BOW; Multiple Shot and Death Shot also accept a crossbow **[dp]**.

The class is fragile and has no speed buff of its own, so it should kite and keep the tank between itself and mobs.

### 1-19 Dark Fighter
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | Power Shot (56) | On cooldown (6 s, 3.2 s cast); auto-attack otherwise. |
| Sustain | Drain Health (70) | HP < 60%. |
| Self-buffs | Attack/Defense Aura | Only without board buffs. |
| NEVER auto | Power Strike, Mortal Blow | Wrong weapon. |

### 20-39 Assassin (bow build)
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | Power Shot (56) | On cooldown. |
| Single | **Stun Shot (101)**, from 36 | Opener on solo mobs (50% stun for 9 s, then kite). In party, only on a mob running at the archer. |
| Self-buff | **Rapid Shot (99)**, from 32 | Keep up (+bow attack speed, 20 min). |
| Toggles | Vicious Stance (312) | On. |
| Toggles | Accuracy (256) | On while missing. |
| Emergency | Ultimate Evasion (111) | Melee mob on the archer and HP < 40%. |
| Situational | Freezing Strike (105) | Slow a chasing mob (magic cast, 600 range). |
| NEVER auto | Mortal Blow (16), Bleed (96), Sting (223) | Dagger and melee skills. |
| NEVER auto | Confusion (2), Poison (129), Unlock (27) | |

### 40-75 Phantom Ranger
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | **Double Shot (19)** | Main skill: 3 s reuse, 150 MP, 900 range. |
| Single | **Stun Shot (101)** | Opener, and re-stun a mob that reached the archer. Old PR rotation: "stun, hex, hit, run". |
| Debuff | Hex (122) | On big mobs or RBs before damage. |
| Self-buffs (keep up, 20 min) | Rapid Shot (99); **Soul of Sagittarius (303)** +max MP, costs HP; **Spirit of Sagittarius (415)**, from 58, −MP cost of physical skills | |
| Self-buff | **Dead Eye (414)**, from 60 | Fights on a big mob or RB, at range: +P.Atk/crit/accuracy, −10% attack speed, 2 min, 75 s reuse. The Exilium PvP guide says to drop it when in melee. |
| MP | Pain of Sagittarius (417), from 58 | Converts HP into MP. Only when MP < 30% and HP > 70%. |
| Situational | Fatal Counter (314), from 60 | Damage scales up as the archer's own HP goes down (PhysicalAttackHpLink) **[dp]**. Only worth using when HP < 50%. |
| Situational | Freezing Strike (105) | A chaser. |
| NEVER auto | Quiver of Arrow A/S (323/324) | Converts an A/S crystal into arrows; 10 min reuse. Only when out of arrows. |
| NEVER auto | Detection (933) | Reveals hidden players (PvP). |
| NEVER auto | Fatal Counter at high HP | Weak at high HP. The pmfun PR thread calls it "if you like to be on the edge". |
| NEVER auto | Confusion, Poison, Sting | |
| Obsolete | Power Shot (56) | Replaced by Double Shot at 40. |

### 76-85 Ghost Sentinel
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | **Lethal Shot (343)** | Top priority: 7698 power, 8 s reuse, 4 s cast, 10% half-kill. |
| Single | Double Shot (19) | Fill between Lethal Shots. |
| Single | **Death Shot (990)**, from 83 | 24306 power, 12 s reuse. Highest single hit after 83. |
| AoE | **Multiple Shot (987)**, from 82 | **3+ mobs in a frontal cone** within 900 (up to 8 targets); 12 s reuse; 162 MP. |
| Kite | **Hamstring Shot (354)** | Mob chasing the archer, or a runner: −30% speed for 60 s, 15 s reuse. The pmfun thread says it is "fast and really effective" against melee. |
| Kite | Stun Shot (101) | Re-stun a chaser. |
| Escape | **Evade Shot (369)** | Archer is in melee range of a mob and needs to break away: damage plus a self speed boost for 30 s **[dp]**; 75 s reuse. |
| Toggles | Vicious Stance (312) | On. |
| Toggles | Focus Skill Mastery (334) | On while MP > 40%. (?) |
| Self-buffs | Rapid Shot, Soul and Spirit of Sagittarius, Dead Eye | As 40-75. |
| NEVER auto | Symbol of the Sniper (459) | Global rule 5. |
| NEVER auto | Quiver, Detection | As 40-75. |

Sources: [pmfun PR/GS playstyle thread](https://forum.pmfun.com/viewtopic.php?t=411) (stun–hex–hit–run; GS rotation "Hit, Lethal Shot, Hit, Double Shot, Hit, Stun, ... Fatal Counter"; Hamstring vs melee; old chronicle); [Exilium PR PvP guide](https://forum.exiliumworld.com/forum/lineage-ii/tutorials-tips-and-useful-informations/471-guide-phantom-ranger-in-lineage-ii-pvp-server) (Dead Eye off in melee; via search snippet); [linedia PR H5 changes](https://linedia.ru/wiki/%D0%93%D0%B0%D0%B9%D0%B4_Phantom_Ranger_High_Five) (Dead Eye penalty 20%→10%, Lethal Shot buffed, Multiple and Death Shot); datapack [dp].

---

## 5. Storm Screamer (Dark Elven Mystic → Dark Elven Wizard → Spellhowler → Storm Screamer). Wind and dark nuker

Weapon: a magic weapon. No weapon conditions apply.

Element plan:
- **Wind** is the main element (Hurricane, Wind Vortex, Wind Vortex Slug, Seed of Wind).
- **Dark** is secondary (Shadow Flare, Dark Vortex).
- Debuff resistance first on long fights.

The Spanish morlorien Spellhowler page recommends:
- the attack skills for leveling, adding Surrender to Wind for hard mobs;
- alternating Hurricane with Body to Mind;
- Corpse Life Drain when HP drops;
- and it advises against relying on Silence or paralysis CC.

### 1-19 Dark Elven Mystic
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | **Wind Strike (1177)** | Main nuke (1.2 s reuse, 600 range). |
| Single | Ice Bolt (1184), from 7 | Opener on a mob that runs at you (60% slow). Otherwise Wind Strike. |
| Sustain | Vampiric Touch (1147), from 14 | HP < 60%. |
| Sustain | Self Heal (1216) or Heal (1011) | Between fights when HP < 50%. |
| Control | Wind Shackle (1206) | −attack speed on a melee mob hitting you. |
| NEVER auto | Curse Poison (1168), Cure Poison (1012), Might (1068), Shield (1040), Group Heal (1027), Battle Heal (1015) | Not a buffer or healer. Board buffs cover Might and Shield. |

### 20-39 Dark Elven Wizard
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | **Twister (1178)** | Main nuke: wind, 750 range, 1.2 s reuse. |
| Single | Shadow Spark (1266), from 25 | Dark, 8 s reuse; use on cooldown for burst. |
| Single | Aura Burn (1172) | Only when the mob is already in melee (150 range); fast cast. |
| AoE | **Flame Strike (1181)** | **3+ mobs grouped** (200 radius, up to 5-12 targets); 4 s reuse. |
| Sustain | Vampiric Touch (1147) | HP < 60%. |
| Sustain | **Corpse Life Drain (1151)**, from 30 | On a fresh corpse when HP < 70%. |
| MP | **Body To Mind (1157)**, from 25 | MP < 40% and HP > 60% (converts HP into MP). |
| Control | Sleep (1069), from 25 | Solo only, on a second mob. Party: no. |
| Control | Wind Shackle (1206) | A melee mob on you. |
| Control | Slow (1160), from 35 | A runner. |
| NEVER auto | Summon Shadow (1128), Summon Silhouette (1228), Servitor Heal (1127), Servitor Recharge (1126), Mighty Servitor (1146) | Summoner skills; this line is a nuker. **Silhouette also carries an EXP penalty: datapack `expMultiplier=0.1`.** |
| NEVER auto | Concentration (1078) | Buff; board. |
| NEVER auto | Poisonous Cloud (1167), Surrender To Poison (1224), Curse Poison (1168) | Poison is not this line's element; low value. |
| NEVER auto | Curse Chaos (1222) | Only to cut a melee mob's accuracy when solo (optional). |
| Obsolete | Wind Strike (1177) | Replaced by Twister. |
| Obsolete | Ice Bolt (1184) | Only as a slow opener. |

### 40-75 Spellhowler
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Single | **Hurricane (1239)** | Main nuke: wind, 900 range, 1.2 s reuse. |
| Single | **Shadow Flare (1267)** | On cooldown (8 s): dark, overhit. |
| Single | Death Spike (1148), from 44 | Alternate filler, or on wind-resistant mobs. (?) Its element is not stated in the datapack file. |
| Debuff | **Surrender To Wind (1074)** | Before Hurricane spam on any mob that takes more than ~4 nukes, and on every RB: −20 wind resistance, 30 s. |
| AoE | **OldTank (1176)**, from 48 | **3+ mobs grouped** by the tank (200 radius around the target, up to 5-12); 4 s reuse; 5 s cast. |
| AoE | Aura Flash (1417), from 58 | Emergency only: 2+ mobs in melee on the caster. Point-blank 200; target-cancel effect; costs Spirit Ore. |
| Self-buff | **Seed of Wind (1287)**, from 66 | Keep up (+20 wind power, 10 min, 200 MP). |
| Burst openers | Aura Symphony (1288) from 68, Demon Wind (1291) from 70, Elemental Storm (1294) from 72 | RB or a big mob only: 5 min reuse, 200 MP each. Demon Wind also halves the target's healing for 2 min. |
| Sustain | **Vampiric Claw (1234)** | HP < 60% (drains 40%). |
| Sustain | Corpse Life Drain (1151) | On a corpse when HP < 70%. |
| MP | Body To Mind (1157) | MP < 40%, HP > 60%. |
| Control | Sleep (1069) or Curse Fear (1169) | Solo only, on an add. Fear has a 40% chance. |
| Control | Slow (1160) | A runner. |
| NEVER auto | **Curse Death Link (1159)** | DeathLink damage grows as the caster's own HP falls **[dp]**. Near useless at full HP; only as a desperate finisher at HP < 30% while solo. |
| NEVER auto | Silence (1064) | Only against caster mobs, solo. |
| NEVER auto | Curse Chaos, Surrender To Poison, Curse Poison, Poisonous Cloud | Low value. Poisonous Cloud is an AoE that aggros a whole pack. |
| Obsolete | Twister (1178) | Replaced by Hurricane. |
| Obsolete | Shadow Spark (1266) | Replaced by Shadow Flare. |
| Obsolete | Vampiric Touch (1147) | Replaced by Vampiric Claw. |
| Obsolete | Flame Strike (1181) | Replaced by OldTank. |
| Obsolete | Aura Burn, Ice Bolt, Wind Strike | |

### 76-85 Storm Screamer
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Combo (main) | **Wind Vortex (1341)** → **Wind Vortex Slug (1456)** | Wind Vortex (6 s cast, 15 s reuse) puts a wind debuff on the target: −20 wind resistance, slows, MP drain. Wind Vortex Slug **can only be cast while that debuff is on the target**, and it consumes it **[dp]**. Use the pair whenever both are off cooldown. |
| Single | Hurricane (1239) | Filler between vortex cycles. |
| Single | Shadow Flare (1267) | On cooldown. |
| Single | **Aura Cannon (1555)**, from 82 | Mob within 150; 10 s reuse; high power. |
| Debuff | **Dark Vortex (1343)** | Before dark nukes, or as a self-heal (drains 25%, −30 dark resistance); 15 s reuse. |
| Debuff | **Throne of Wind (1458)** | Big mobs or RBs: a 10 s wind DoT; 75 s reuse. |
| Debuff | Arcane Chaos (1338) | RB only: +debuff vulnerability and −MP efficiency, 40% chance. |
| AoE | **Aura Blast (1554)**, from 81 | **2+ mobs** within 200 of the target; 15 s reuse. |
| AoE | OldTank (1176) | 3+ grouped mobs, between Aura Blasts. |
| Self-buff | **Empowering Echo (1457)** | Keep up: +25% M.Atk, but +35% MP cost, 20 min. |
| Self-buff | Seed of Wind (1287) | Keep up. |
| Toggle | **Arcane Power (337)** | On while HP > 50%: +30% M.Atk, −50 HP per tick, +10% MP cost. Turn **off** when HP < 40% or when the healer is busy. |
| Emergency | **Arcane Shield (1556)**, from 83 | Caster under attack and HP < 40%: 70% of damage goes to MP for 10 s; 5 min reuse. Needs a full MP bar. |
| NEVER auto | **Cyclone (1420)** | Ground-targeted channel (15 s), consumes item 8876, 30 min reuse. Manual only. |
| NEVER auto | Curse Death Link, Silence, poison curses | As 40-75. |
| Obsolete | Hurricane | Demoted to filler once the vortex combo exists. |

Sources: [morlorien Spellhowler page](https://sites.google.com/site/morlorien/otros-mmorpg/lineage-ii/clases/spellhowler) (Surrender to Wind on hard mobs, Hurricane + Body to Mind, Corpse Life Drain, avoid Silence/paralysis; via search snippet); [Atlantis SS PvP guide](http://lineage2pvpbuild.blogspot.com/2014/11/storm-scream-guide-lineage-2-atlantis.html) (wind skills, Empowering Echo); [linedia SH H5 changes](https://linedia.ru/wiki/%D0%93%D0%B0%D0%B9%D0%B4_SpellHowler_High_Five) (Aura Blast, Aura Cannon, Arcane Shield); datapack [dp]. The rotation is mostly derived from datapack mechanics; there is no H5 English PvE rotation guide.

---

## 6. Spectral Master (Dark Elven Mystic → Dark Elven Wizard → Phantom Summoner → Spectral Master). Summoner

Weapon: a magic weapon. Damage comes from the **servitor**.

Datapack findings:
- **Summon Silhouette (1228) has `expMultiplier=0.1`**, which means the player keeps only about 10% of EXP. Interlude data says "90% of acquired Exp is consumed". **Never use Silhouette for leveling.**
- Shadow, Soulless, Nightshade and Spectral Lord carry no multiplier in the datapack.
- Summons last 3600 s and use Spirit Ore over time.

### 1-19 Dark Elven Mystic
Same as Storm Screamer 1-19: Wind Strike, Vampiric Touch, Self Heal between fights, and the same NEVER list.

### 20-39 Dark Elven Wizard
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Summon | **Summon Shadow (1128)** | Keep summoned at all times. Re-summon when it dies or expires. |
| Pet care | **Servitor Heal (1127)** | Pet HP < 60%. |
| Pet care | Servitor Recharge (1126), from 25 | Pet MP < 30%. |
| Pet care | Mighty Servitor (1146), from 35 | Keep on the pet (20 min). |
| Player damage | Twister (1178) | Assist the pet's target. MP-cheap filler. |
| Player damage | Shadow Spark (1266) | Optional. |
| Sustain | Corpse Life Drain (1151) | HP < 70%. |
| Sustain | Body To Mind (1157) | MP < 40%. |
| Control | Sleep (1069) | Solo, on an add. |
| Control | Wind Shackle (1206) | On a mob hitting you. |
| NEVER auto | **Summon Silhouette (1228)** | EXP penalty. |
| NEVER auto | Flame Strike (1181) | AoE pulls mobs off the pet onto the summoner. |
| NEVER auto | Poisonous Cloud (1167), Curse Poison (1168), Surrender To Poison (1224), Curse Chaos (1222), Concentration (1078) | |

### 40-75 Phantom Summoner
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Summon | Summon Shadow (1128) from 40 to 55; **Summon Nightshade (1333)** from 56 | (?) Pet choice. Community data is thin. Nightshade is the PS's top 2nd-class servitor (56+). Soulless (1278) is an alternative (?), and the in-game comparison is unverified. |
| Pet buffs (keep up, 20 min) | Servitor Physical Shield (1140), Servitor Magic Shield (1139), Servitor Haste (1141), Mighty Servitor (1146) | Re-apply after every re-summon. |
| Pet care | **Servitor Heal (1127)** | Pet HP < 60%. |
| Pet care | Servitor Recharge (1126) | Pet MP < 30%. |
| Pet care | Servitor Cure (1300) | Pet poisoned or bleeding. |
| Pet care | Servitor Blessing (1301), from 62 | Pet rooted, paralyzed or slowed. |
| Toggle | **Transfer Pain (1262)** | On when solo: part of the summoner's damage goes to the pet. Off if the pet is low. |
| Self-buff | Spirit Sharing (1547), from 44 | Keep up (20 min). |
| Cubics | Summon Spark Cubic (1281) solo, Phantom Cubic (33) | Keep up (15 min). |
| Cubics | Mass Summon Phantom Cubic (1330) | In party, once per 15 min. |
| Player damage | **Dimension Spiral (1558)** | On cooldown (15 s). |
| Player damage | Death Spike (1530), from 44 | Filler on the pet's target. Note it is a different id from the Spellhowler's 1148. |
| Debuff | Mass Surrender to Wind (1385), from 58 | Debuffs mobs within 200 **around the pet**: 3+ mobs on the pet and a wind nuker in the party. 40% chance. |
| Emergency | **Servitor Empowerment (1299)**, from 52 | Pet HP < 30% and still being hit: pet gets huge defence for 30 s but is rooted; 15 min reuse. |
| Control | Wind Shackle (1206) | Mob hitting the summoner. |
| NEVER auto | **Summon Silhouette (1228)** | EXP penalty. |
| NEVER auto | **Betray (1380)** | Turns an enemy's servitor against its owner (PvP); costs Spirit Ore. |
| NEVER auto | Curse Poison (1168) | |
| Obsolete | Twister (1178) | Replaced by Dimension Spiral and Death Spike. |
| Obsolete | Summon Shadow (1128) | Replaced by Nightshade at 56. (?) |

### 76-85 Spectral Master
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Summon | **Summon Spectral Lord (1408)**, from 79 | Replaces Nightshade. 4 Spirit Ore to summon, 11 over time. |
| Pet buff | **Final Servitor (1349)** or Assassin Servitor (1348) | Keep one up: they share the `MULTI_BUFF` buff type, last 5 min, have 60 s reuse, and cost 20 or 10 Spirit Ore. Final Servitor gives broad stats and +20% HP but −20% pet speed; Assassin Servitor gives attack speed, evasion, rear crit and vampiric. Default to Final Servitor. (?) |
| Self-buff | **Servitor Share (1557)**, from 83 | Keep up (20 min). Passes the summoner's stats to the pet. |
| Toggle | **Arcane Agility (338)** | On while HP > 50%: +20% cast speed, −10% reuse, −50 HP per tick. |
| Cubics | Smart Cubic (783), from 80 | Keep up. |
| Pet care | As 40-75 | |
| Player damage | As 40-75 | |
| NEVER auto | **Anti-Summoning Field (1424)** | Consumes item 8876, 30 min reuse, only works near enemy Symbols (PvP). |
| NEVER auto | **Mage Bane (1351)** | Dispels enemy M.Atk and cast-speed buffs (PvP). |
| NEVER auto | Betray, Silhouette | As 40-75. |

Sources: [Interlude.Wiki](https://interlude.wiki/) (PS levels fast through single-target pet damage plus lifesteal; no AoE pet); [l2db/l2hub PS data](https://l2hub.info/classes/phantom_summoner) (Silhouette 90% EXP, Shadow and Soulless costs; Interlude); [L2Ertheia wiki SM](https://wiki.l2ertheia.eu/doku.php?id=general%3Aclasses%3Aspectral-master) (Spectral Lord at 79); [linedia PS H5 changes](https://linedia.ru/wiki/%D0%93%D0%B0%D0%B9%D0%B4_Phantom_Summoner_High_Five) (Dimension Spiral, Servitor Share); datapack [dp]. **Low confidence on Nightshade vs Soulless; test in game.**

---

## 7. Shillien Saint (Dark Elven Mystic → Shillien Oracle → Shillien Elder → Shillien Saint). Party HEALER and debuffer

The owner's rule: **healers ONLY heal.** In this party the Saint is also the **Stigma debuffer**.

Allowed in party:
- heals and the HoT;
- Recharge and the MP tools;
- cleanses;
- Stigma of Shilien;
- optionally Block Shield on RBs, and Blessed Blood on the tank.

Everything else (nukes, Inquisitor, root/sleep spam, buffs the board already covers) is **not** auto in party.

Key mechanics **[dp]**:
- **Greater Heal (1217)** and **Greater Group Heal (1219)**: an instant heal plus a 15 s HoT. Both use the `LIFE_FORCE_OTHERS` buff type, so their HoTs replace each other on the same target. Cast times are 5 s and 7 s.
- **Battle Heal (1015)**: 2 s cast, 1 s reuse. It stays usable after 40 (no skill removal in the tree), but its last learned level is 15.
- **Recharge (1013)**: 6 s cast, 400 range. **It cannot target a class that itself has Recharge** (other Elders, Saints or Oracles).
- **Stigma of Shilien (1539)**: 100% application; 30 s; target takes +16/24/32/40% damage from SWORD, BLUNT, DAGGER, DUAL and DUALFIST weapons. It does nothing for bows or magic. 600–900 range; 1.5 s cast; 3 s reuse. Its hate value is only −1, so it barely aggroes. That contradicts l2-servera's claim that it "provokes"; the datapack wins.
- **Mana Gain (1460)**: the target gets +85 MP from every Recharge for 20 min; 150 s reuse. It cannot target Oracle/Elder/Saint classes (29, 30, 105, 42, 43, 112).
- **Chain Heal (1553)**, from 83: heals 30% max HP on up to 10 party members within 300 of the target, lowest HP first. 3 s cast, 5 s reuse, 4 Spirit Ore.

### 1-19 Dark Elven Mystic
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Solo damage | Wind Strike (1177) | **Solo leveling only.** In party, never attack. |
| Heal | Heal (1011) | Party member HP < 70%. |
| Heal | **Battle Heal (1015)**, from 14 | Member HP < 40% (fast cast). |
| Heal | Group Heal (1027), from 14 | 3+ members < 70%. |
| Heal | Self Heal (1216) | Solo, between fights. |
| Cleanse | Cure Poison (1012) | A party member is poisoned. |
| NEVER auto in party | Wind Strike, Ice Bolt (1184), Vampiric Touch (1147), Curse Poison (1168), Wind Shackle (1206) | |
| NEVER auto in party | Might (1068), Shield (1040) | Board. |

### 20-39 Shillien Oracle
| Slot | Skill (id) | When / trigger |
|---|---|---|
| Heal | **Heal (1011)** | Tank HP < 75%, or other members < 65%. |
| Heal | **Battle Heal (1015)** | Anyone < 40%, or tank < 50% and dropping fast. |
| Heal | **Group Heal (1027)** | 3+ members < 70%. |
| MP | **Recharge (1013)**, from 30 | Tank or caster MP < 50%. The tank's Aggression and Guard Stance eat MP, so the tank is a valid target. Never on another Recharge class. |
| Revive | Resurrection (1016) | Dead party member, with no mobs on the healer. (Treated as part of healing; owner can disable.) |
| Cleanse | Cure Poison (1012), from 35 | A party member is poisoned. |
| Solo only | Disrupt Undead (1031) | Undead targets only (the condition is race UNDEAD). Linedia's H5 SE guide says to learn it first for solo leveling (20-40). |
| Solo only | Dryad Root (1201), from 25 | Root an add. |
| Solo only | Sleep (1069) | |
| NEVER auto in party | Disrupt Undead, Dryad Root, Sleep, Wind Shackle | |
| NEVER auto in party | Kiss of Eva (1073), Wind Walk (1204), Empower (1059), Focus (1077), Mental Shield (1035), Concentration (1078), Vampiric Rage (1268), Resist Wind (1189), Might, Shield | Board buffs; recasting would overwrite them (global rule 1). |
| Obsolete | Wind Strike (1177) | After 20 in party. |

### 40-75 Shillien Elder (owner's healer and debuffer)

Heal and Recharge priority, top down:

| Prio | Skill (id) | When / trigger |
|---|---|---|
| 1 | **Battle Heal (1015)** | Any member HP < 35%, or tank < 45% and dropping. Fast panic heal. |
| 2 | **Greater Group Heal (1219)**, from 48 | 3+ members < 70%. Don't recast while its 15 s HoT is still on most of the party. |
| 3 | **Greater Heal (1217)** | Tank < 75%, or a single member < 65%. Default single heal. Its HoT means one cast per target per ~15 s is often enough. |
| 4 | **Blessed Blood (1531)** | On the tank just before or at the pull, and again when it ends. Party only; 15 s; 20 s reuse. While it lasts, hits of ≥ 60 damage have a 60% chance to proc a heal. |
| 5 | **Recharge (1013)** | MP: tank or caster < 50% (tank first if it is under 30%). Only when every HP > 70%, because of the 6 s cast. |
| 6 | **Purify (1018)**, from 44 | A member is paralyzed, poisoned or bleeding (for a paralyzed tank: immediately). |
| 6 | Cure Poison (1012) | Poison only. |
| 7 | **Stigma of Shilien (1539)** | Debuff duty: on the **tank's target** (assist the tank, never pick its own target). Only when every HP > 70%, the target is a big mob, champion or RB (HP above ~3× a normal mob), and melee DPS is present. Reapply when it expires (30 s). Linedia says it "finally becomes worth using" from skill level 3, roughly level 61+. |
| — | Group Heal (1027), Heal (1011) | Obsolete. Replaced by Greater Group Heal at 48 and Greater Heal at 40. Keep Heal only for very low-MP top-ups. |

| Slot | Skill (id) | Rule |
|---|---|---|
| Revive | Resurrection (1016) | Out of combat, with no mob on the healer. |
| Solo only | Dryad Root (1201), Wind Shackle (1206) | Root an add while leveling solo. In party, never. |
| NEVER auto | **Inquisitor (1522)** | A transformation that turns the Saint into an attacker for 6 h and blocks the heal bar. The worst skill a healer bot can press. |
| NEVER auto | **Invocation (1430)** | Self-stun for 30 s with **P.Def ×0.1**, regaining MP; 15 min reuse. l2info: "you can die easily". Manual only, in a totally safe spot. |
| NEVER auto | **Mana Burn (1398)** | MP damage only (PvP or Olympiad). |
| NEVER auto | **Erase (1395)** | Unsummons an enemy servitor (PvP); costs Spirit Ore. |
| NEVER auto | Buffs: Death Whisper (1242), Guidance (1240), Mental Shield (1035), Might (1068), Concentration (1078), Empower (1059), Focus (1077), Shield (1040), Vampiric Rage (1268), Kiss of Eva (1073), Resist Wind (1189), Resist Holy (1392), Wild Magic (1303) | Board buffs (global rule 1). The owner's rule is heal only. |

### 76-85 Shillien Saint

Heal and Recharge priority, top down:

| Prio | Skill (id) | When / trigger |
|---|---|---|
| 1 | Battle Heal (1015) | Any member < 35%. |
| 2 | **Chain Heal (1553)**, from 83 | 2+ members < 70%. Target the lowest-HP member; it heals 30% max HP each. Replaces Greater Group Heal as the main group heal (faster cast: 3 s vs 7 s). Needs 4 Spirit Ore. |
| 3 | Greater Group Heal (1219) | 3+ members < 70% and Chain Heal is on cooldown or out of ore. |
| 4 | Greater Heal (1217) | Single target, as in 40-75. |
| 5 | Blessed Blood (1531) | On the tank at the pull. |
| 6 | **Mass Purify (1551)** | 2+ members poisoned, bleeding, paralyzed or **petrified (TURN_STONE)**; 9 s reuse. |
| 6 | Purify (1018) | A single member. |
| 6 | Mass Cure Poison (1550) | Poison only on several members. |
| 7 | **Mana Gain (1460)** | On the main Recharge target (tank or caster) before recharging it; 20 min; 150 s reuse. Not on another Saint or Elder. |
| 7 | **Recharge (1013)** | As 40-75. |
| 8 | **Stigma of Shilien (1539)** | As 40-75: tank's target only, big targets only, all HP > 70%. |
| 9 | Block Shield (1358), from 77 | RB or very tanky mob, melee party, all HP > 80%: strips P.Def buffs and −10% P.Def for 2 min (80% chance; 4 s cast). Optional. Mostly a PvP skill (l2info: use it against fighters). |
| Emergency | **Mass Recharge (1428)**, from 80 | Party MP crisis: 2+ casters or tank < 20% MP. +1500 MP to the party; consumes item 8876; 1 h reuse. |
| Emergency | Thorn Root (1508), from 80 | 2+ mobs closing on the healer and not yet in melee: point-blank root (200), 10 s, 30 s reuse. A mob already hitting the healer keeps hitting, so the tank still has to taunt. |

| Slot | Skill (id) | Rule |
|---|---|---|
| Toggle | **Arcane Wisdom (336)** | On while MP < 60% and the party is stable: −30% MP cost, but −10% cast speed and −50 HP per tick. **Off** during heavy-damage phases, when cast speed matters more. |
| Out-of-combat buffs (optional, owner decides) | Arcane Protection (1354) on the tank: −20% debuff and −30% cancel vulnerability, 20 min | Only if the board lacks it and the party is idle. |
| Out-of-combat buffs (optional, owner decides) | Prophecy of Wind (1357): party-only, 5 min, costs 10 Spirit Ore, has a **run-speed penalty** | **Not** auto during farming. RB only, on manual request. |
| NEVER auto | Inquisitor, Invocation, Mana Burn, Erase, all board buffs | As 40-75. |
| Obsolete | Greater Group Heal | Becomes the backup to Chain Heal at 83. |
| Obsolete | Heal (1011), Group Heal (1027) | |

Sources: [linedia Shillien Elder H5 guide (EN)](https://linedia.ru/en/wiki/Shillien_Elder_(High_Five)_guide_%E2%80%94_Shillien_Elder) (Recharge is the main party skill at 40-52; Stigma 100% and worth it from skill level 3; Arcane Wisdom costs; Invocation −90% P.Def; Mass Recharge 1.5k MP / 1 h); [l2info Shillien Saint](https://l2info.estranky.cz/clanky/shillien-saint.html) (Mana Gain before Recharge, Arcane Wisdom while recharging, Chain Heal, Blessed Blood for fighters, Block Shield against fighters, don't rely on Invocation or Inquisitor); [l2-servera Stigma](https://l2-servera.com/en/kategorii/ob-igre/stigma-of-shilen/) (weapon list, apply before the melee focus; its "provoke" claim is contradicted by the datapack); 4gameforum "Ultimate Shillien Saint Guide" (via search snippet: Stigma as the melee-party contribution; MP refill is the PvP role); datapack [dp].

---

## Cross-cutting notes for the bot (owner's party: Shillien Knight tank + Shillien Saint healer)

- **Order inside the party.** The tank opens with Aggression or Aura of Hate. DPS waits for 1–2 tank hits; daggers move behind the mob. The Saint then puts Stigma on the tank's target. Only after that do AoE skills fire (Demonic Blade Dance, OldTank/Aura Blast, Multiple Shot), so the AoE doesn't pull aggro off the tank.
- **Aggro thieves to block in every non-tank bot:** Aggression (28), Lure (51), Corpse Plague (103), Poisonous Cloud (1167), and Aura Flash (1417) used outside emergencies.
- **Tank MP is real.** Guard Stance, Shield Fortress, Fortitude and the hate skills drain it. The Saint's Recharge should treat the Shillien Knight as a priority target (it has no Recharge skill, so the restriction doesn't apply).
- **Biggest uncertainties:**
  1. Whether the board buff ids match retail, which decides whether dances and auras overwrite the board.
  2. Pet choice for Phantom Summoner from 56 to 78 (Nightshade vs Soulless).
  3. The real value of Focus Skill Mastery.
  4. Smart Cubic behaviour.

  Verify these in game.
