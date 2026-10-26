# Orc and Dwarf lines: which skill, when (H5 / L2Toggle)

This covers Titan, Grand Khavatari, Dominator, Doomcryer, Fortune Seeker and Maestro, for the level bands 1-19, 20-39, 40-75 and 76-85.

**How this was made.** Skill names, ids, learn levels and weapons come from the regenerated `docs/plan/class_skills/<Line>.md` (classSkillTree.xml plus highFiveNewClassSkillTree.xml). Mechanics marked **[DP]** were checked directly in `Scripts/data/dp/skills/*.xml` and `Scripts/data/buff_groups.json`. Play-style advice comes from the web sources listed at the end and from common H5 practice. **[?]** means I'm not sure; test in game on L2Toggle.

**HP and CP conditions.** In L2J, `<player hp="X"/>` means the skill needs **HP ≤ X %**, and `<player cp="X"/>` means it needs **CP ≥ X %**.

---

## 0. Cross-class findings the bot must respect

### 0.1 Weapon gates [DP]
A skill cast with the wrong weapon fails with "cannot be used", and the bot wastes a tick on it.

| Weapon | Skills that need it |
|---|---|
| Polearm (POLE) | Wild Sweep 245, Whirlwind 36, Earthquake 347, Wrath 320, Polearm Accuracy 422 |
| Sword or blunt (1H or 2H) | Power Strike 3, Power Smash 255, Fatal Strike 190, Armor Crush 362, Crushing Strike 997, Spoil Crush 348 (*) |
| Blunt only | Stun Attack 100, Hammer Crush 260 |
| **2H** sword or 2H blunt only (`slot lrhand`) | Crush of Doom 315 |
| Fist (DUALFIST) | Iron Punch 29, Stunning Fist 120, Cripple 95, Force Blaster 54, Hurricane Assault 284, Burning Fist 280, Soul Breaker 281, Force Burst 17, Force Storm 35, Punch of Doom 81, Raging Force 346, all Spirit Totems |
| Any melee except bow | Burning Chop 927, Blazing Boost 998 (also needs the target ≥ 200 away) |

**Frenzy 176 has no weapon gate on the cast.** The "SWORD,BLUNT" in the extract is the condition for its *bonus*.
- Base effect: P.Atk ×1.15 with any weapon.
- Extra while HP ≤ 60 %, **2H sword/blunt only**: ×1.6 and ×1.1 P.Atk, plus accuracy.
- So a polearm Destroyer gets almost nothing from Frenzy (×1.15 against about ×2.0 with a 2H weapon) [DP].

(*) Sweeper 42, Spoil Crush 348 and Bandage 34 are in classSkillTree.xml, but `class_skills_extract.js` filters them out by name. They do exist for the dwarves.

### 0.2 Buff slot conflicts: same abnormalType means only one stays [DP]
These come from `buff_groups.json` and the skill xml. When two buffs share a type and the new one's abnormalLvl is ≥ the old one, the new one **replaces** the old.

| Slot (abnormalType) | Members | What it means for the bot |
|---|---|---|
| **PINCH** | **Frenzy 176, Guts 139** | **Never cast both.** The second one overwrites the first. Pick Frenzy for damage, or Guts for survival. l2-servera's Destroyer guide also says "only one applies". |
| **MULTI_BUFF** | Over the Body 536 (Titan), Chant of Victory 1363, Magnus' Chant 1413, Victory of Pa'agrio 1414 | One per character. A Titan casting Over the Body wipes the Doomcryer's Chant of Victory from himself. Victory and Magnus overwrite each other. |
| **MAX_HP_UP** | Battle Roar 121, Battle Cry 1561 (Warsmith), Bless the Body (board) | Battle Roar lvl 6 has the same abnormalLvl (6) as Bless the Body 6, so it **replaces the 12-h board Bless the Body with a 10-min buff**. When it expires, the +35 % Max HP is gone until the next board visit. [?] This doesn't happen if the board uses a special Bless the Body with abnormalLvl 26 (ids 21052 or 22065). Check which id the board gives. |
| PA_UP | Chant of Battle 1007, Pa'agrian Gift 1003 = board **Might** | Same values as the board version. Recasting swaps a 12-h buff for a 20-min one. |
| ATTACK_TIME_DOWN | Chant of Fury 1251, Fury of Pa'agrio 1563 = **Haste** | same |
| CRITICAL_DMG_UP | Chant of Rage 1253 = **Death Whisper** | same |
| CRITICAL_PROB_UP | Chant of Predator 1308 = **Focus** | same |
| HIT_UP | Chant of Eagle 1309, The Vision of Pa'agrio 1249 = **Guidance** | same |
| AVOID_UP | Chant of Evasion 1252, The Tact of Pa'agrio 1260 = **Agility** | same |
| PD_UP | Chant of Shielding 1009, Blessings of Pa'agrio 1005, Soul Shield 1010 = **Shield** | same |
| MD_UP | Chant of Fire 1006, The Glory of Pa'agrio 1008 = **Magic Barrier** | same |
| CASTING_TIME_DOWN | Flame Chant 1002, The Wisdom of Pa'agrio 1004 = **Acumen** | same |
| BERSERKER | Chant of Berserker 1562, Rage of Pa'agrio 1261 = **Berserker Spirit** | same |
| SPEED_UP | Pa'agrian Haste 1282 = **Wind Walk** | same |
| VAMPIRIC_ATTACK | Chant of Vampire 1310 = **Vampiric Rage** | same |
| PA_PD_UP | War Chant 1390, Earth Chant 1391, Greater Might, Greater Shield | Only one of the four. Pick War Chant for a DPS party. |
| RESIST_DEBUFF_DISPEL | Chant of Spirit 1362, Pa'agrio's Emblem 1415, Arcane Protection | Only one. |
| LIFE_FORCE_ORC | Chant of Life 1229, The Heart of Pa'agrio 1256 | These HoTs overwrite each other. |
| POSSESSION | every Spirit Totem | One totem at a time. |
| DOT_ATTR (on the target) | Chill Flame, Frost Flame, Freezing Flame, Blaze Quake, Seal of Flame, Burning Chop | Only one DoT of this type stays on a mob. Don't chain them. |

**What the L2Toggle board already gives (CLAUDE.md §2b).**
- Warrior scheme: Greater Might, Berserker Spirit, Guidance, Sharp Edge, Hard Tanning, Improved Combat/Condition/Crit/Shield Def/Movement, Mental Shield, Magic Barrier, Resist Shock, **Chant of Protection**, Chant of Blood Awakening, plus dances and songs.
- Defender scheme: Greater Shield and Case Harden.

That means:
- **War Chant and Earth Chant are redundant.** Greater Might is in their PA_PD_UP slot.
- **Chant of Protection is redundant.**
- **Sharp Edge, Hard Tanning and Case Harden are redundant** for players who took that scheme.

**So with 12-h board buffs, these orc and dwarf buffs are still worth casting:**
- **Doomcryer:** Chant of Victory, Chant of Elements, Chant of Spirit (unless the board's Arcane Protection is on), Chant of Revenge (one member), Chant of Life (heal), and Magnus' Chant for mage parties.
- **Dominator/Overlord:** Soul of Pa'agrio (M.Atk +75 %, unique), Eye of Pa'agrio, Pa'agrio's Fist, The Heart of Pa'agrio (heal), The Honor of Pa'agrio and Ritual of Life (CP), and Victory of Pa'agrio (only when no Chant of Victory).
- **Warsmith:** only the weapon/armor buff the board scheme lacks. Spike for blunt users is the useful one; Embroider and Restring where they fit.

Everything else duplicates the board, so **don't auto-cast it while board buffs are on.** Use it only as a fallback when the matching board buff is missing.

**Problems in the current swarm.js plan (CLAUDE.md §6 / §6f):**
- It casts "Frenzy 176 / Zealot 420 / **Rage 137**", but in this datapack **Rage is id 94**.
- The Destroyer opening fires "ALL skills (Frenzy, Zealot, Guts, Battle Roar, Rage)". **Guts would overwrite Frenzy** (PINCH slot). **Battle Roar heals** the Destroyer out of the low-HP window and may replace board Bless the Body.
- Correct order: Zealot, then Frenzy, then Lionheart (if needed). Rage and Battle Roar go *before* the drain, and Guts is left out.
- The spoiler code uses Sweeper Festival 444, which is **not in the H5 class tree** (see §5). Check that the character actually has it.

### 0.3 "Seals" are not self buffs [DP]
The extract labels every Seal "self buff SELF POINT_BLANK". In fact each Seal is an **AoE debuff on up to 10 enemies within 200 of the caster**.
- They aggro every mob in that radius, including ones nobody has pulled.
- Cast them only when the mobs around the shaman are already engaged.

### 0.4 Never auto-use, for every line
- Gate Chant 1429 (party summon; costs 4 Summoning Crystals).
- All Symbols (456, 457, 458: an item plus a 30-min reuse).
- Flames of Invincibility 1427 (item 8876; affects clan only).
- Summon Siege Golem 13, Summon Wild Hog Cannon 299 and Summon Swoop Cannon 448: siege only, and they cost 180 C, 70 B and 27 A crystals.
- Summon Merchant Golem 831 (a shop NPC).
- Fake Death 60, except as a scripted escape.
- Force Meditation 441: it **stuns you and sets your P.Def ×0.2**.
- Wrath 320: it only removes CP, and mobs have no CP, so it is PvP only.
- Seal of Disease 1367: it reduces healing received, so it is PvP only.
- Madness 1105, Fear 1092 and Seal of Mirage 1213 in a party: mobs run off and bring adds.

---

## 1. Titan line (Orc Fighter → Orc Raider → Destroyer → Titan)

### Weapon choice
- **2H sword or 2H blunt** for raids, bosses and single big mobs. You get Crush of Doom, Fatal Strike, Frenzy's 2H bonus, and Zealot's crit bonus (×2 crit damage with blunt, +100 crit rate with sword).
- **Polearm** for AoE farming: Wild Sweep, then Whirlwind, then Earthquake.
- Interlude and H5 guides both say "pole for trains, 2H for single targets" (l2-servera Destroyer guide, pmfun forum).
- The bot must **switch the skill set with the weapon**. With a polearm the only damage skills are Whirlwind and Earthquake, even on a single mob. With a 2H weapon, Whirlwind and Earthquake are unavailable.

### 1-19 Orc Fighter
| Role | Skills (id) | When / trigger |
|---|---|---|
| Single | Power Strike 3 (sword/blunt) | Every time it's off cooldown (3 s) against the current target. |
| Single (fist) | Iron Punch 29 | Only if wielding fists. A future Raider should use sword/blunt plus Power Strike. |
| AoE | none | none |
| Never | none | none |

### 20-39 Orc Raider
| Role | Skills (id) | When / trigger |
|---|---|---|
| Single, sword/blunt | Power Smash 255 (3 s); Stun Attack 100 (blunt, stun) | Spam Power Smash. Use Stun Attack only with a blunt, on a mob attacking a squishy, or as filler. |
| AoE, polearm | Wild Sweep 245 (FAN 80° × 150, up to 5-12 targets, 4 s) | When ≥ 2 mobs are **in front of you** within 150. Face the pack. |
| Toggles | Vicious Stance 312 (crit damage; MP drain); Accuracy 256 | Vicious Stance on in combat, off when MP < 25 %. Accuracy on only against high-evasion mobs (MP is tight at this level). |
| Self buffs | Rage 94 (24); Battle Roar 121 (28) | Rage: 90 s duration, 75 s reuse, so keep it permanently up in combat (P.Atk +, P.Def ×0.8). Battle Roar: see 0.2; only without board Bless the Body, or as an emergency heal. |
| Low-HP | Frenzy 176 (32, HP ≤ 60 %), Guts 139 (36, HP ≤ 30 %), Lionheart 287 (36) | Frenzy when HP falls ≤ 60 % in a hard fight. Guts **instead of** Frenzy when HP ≤ 30 % and you're losing (they share a slot). Lionheart against stunning or sleeping mobs. |
| Never | none | none |

### 40-75 Destroyer
| Role | Skills (id) | When / trigger |
|---|---|---|
| Single, 2H sword/blunt | **Crush of Doom 315 (60+)**: 7635 power, 7 s reuse, **costs about 208-261 HP and no MP**; **Fatal Strike 190**: 3653 power, 3 s, 75 MP | Priority: Crush of Doom when off cooldown, then Fatal Strike. Before 60, Fatal Strike only. |
| Single, blunt extra | Hammer Crush 260 (2411 power, 50 % stun, 3 s) | Filler while Fatal Strike is on cooldown, or when a stun matters (an add on the healer). With a sword it is unusable, so skip it. |
| AoE, polearm | Whirlwind 36 (PBAoE r150, 6-12 targets, 4 s) | **≥ 2 mobs within 150 of yourself.** With a polearm it is also the single-target skill. |
| Toggles | Vicious Stance 312; War Frenzy 424 (58+: shock/sleep resistance); Polearm Accuracy 422 (58+, polearm only) | Vicious Stance and War Frenzy on in combat. Polearm Accuracy only while holding a polearm (it does nothing otherwise). Drop the toggles first when MP < 20 %. |
| Permanent self buffs | Rage 94 (keep up); Dark Form 423 (58+, 5 min, fire attack +20 and fire resistance) | Rage in every fight. Dark Form only if your weapon has no attribute or fire [?]; it competes with element weapon buffs (HOLY_ATTACK). |
| Low-HP window | Zealot 420 (58+, HP ≤ 30 %), Frenzy 176, Guts 139, Lionheart 287 | See the raid sequence below. |
| Emergency | Guts 139 when HP ≤ 30 % with Frenzy down; Battle Roar 121 when HP < 15 % and no healer | Battle Roar heals (+35 % Max HP with heal), which ends the low-HP window. |
| Never | Wrath 320 (CP only, PvP); Power Smash 255 and Wild Sweep 245 once Fatal Strike and Whirlwind are learned | Obsolete: Power Smash goes to Fatal Strike, Stun Attack to Hammer Crush, Wild Sweep to Whirlwind. |

**Destroyer pre-raid / low-HP sequence (the two Destroyers in the owner's party) [DP and WEB]**
1. Before draining: board buffs are on. Toggles on: Vicious Stance, War Frenzy, and Fortitude for a Titan. Cast **Rage**, plus **Dark Form** if useful.
   - Battle Roar only if board Bless the Body is missing. Do it now, before the drain, never inside the window.
2. Drain to **≤ 30 %**. Use the frenzy_kit gear swap (Conversion weapon), or the attacks that cost HP: Crush of Doom (about 250 HP each), Earthquake (340 HP, Titan) or Armor Crush (338 HP, Titan) on trash.
3. **Zealot** first. It needs HP ≤ 30 % and itself costs 204 HP and 136 MP, so make sure HP is above about 250.
   - It gives Atk.Spd ×1.3, ×2 crit damage (blunt) or +100 crit rate (sword/pole), debuff resistance, and **halves healing received**, which helps keep HP low.
   - 60 s duration, 5 min reuse.
4. **Frenzy** (90 s, 5 min reuse). Its 2H bonus holds only **while HP stays ≤ 60 %**.
   - **Not Guts.** Guts would overwrite Frenzy (PINCH slot). Keep Guts as the panic button for when Frenzy is on cooldown.
5. **Lionheart** if the raid stuns or sleeps (60 s, 150 s reuse).
6. Titan extras:
   - **Over the Body** (79): needs CP ≥ 80 % [?]. It sets CP to 0, gives Max HP +35 % *without a heal* (so HP % drops further), P.Atk ×1.25, P.Def ×1.3 and Atk.Spd ×1.1. 60 s duration, 15 min reuse.
   - Then **Braveheart** (+1000 CP, 150 s reuse).
   - **Skip Over the Body when a Doomcryer's Chant of Victory is on** (MULTI_BUFF).
7. Fight: Armor Crush (Titan) as the opener, then Crush of Doom on cooldown, then Fatal Strike, then Hammer Crush.
   - **Healers:** don't heal the Destroyers above 60 % during the window. No Chant of Life, Heart of Pa'agrio or Chain Heal unless HP < 15 %.
8. The window ends when Zealot ends (60 s). Re-drain after the 5-min cooldowns.

GF data (l2hub) and the l2-servera guide say Frenzy needs HP < 30 %, while this H5 datapack says ≤ 60 % [?]. Draining to ≤ 30 % satisfies both.

### 76-85 Titan
| Role | Skills (id) | When / trigger |
|---|---|---|
| Single, sword/blunt | Armor Crush 362 (3077 power, 40 % stun, **P.Def/M.Def ×0.7 on the target for 9 s**, 338 HP, 4 s) | Opener on every tough single target or boss (it softens the target for the whole party), then Crush of Doom, then Fatal Strike, as in the 40-75 band. |
| AoE, polearm | **Earthquake 347** (PBAoE r150, 4848 power, 340 HP, 78 MP, 8 s, 60 % target cancel); Whirlwind 36 | Earthquake when off cooldown and ≥ 2 mobs are within 150, then Whirlwind in between. Earthquake's HP cost doubles as the Frenzy drain on trash (l2-servera guide). |
| Toggles | Fortitude 335 (shock/paralyze resistance, MP drain); Parry Stance 339 (P.Def/M.Def ×1.25 but Atk.Spd ×0.8) | Fortitude on against stunners and raids. **Parry Stance off for DPS.** Turn it on only when tanking or when HP < 30 % with no Guts available. |
| Burst | Over the Body 536, Braveheart 440 | See the raid sequence. Braveheart can also be a CP refill in PvP. |
| Never | Symbol of Resistance 456 (item + 30-min reuse, manual), Wrath 320 | none |

---

## 2. Grand Khavatari line (Orc Fighter → Orc Monk → Tyrant → Grand Khavatari)

The line uses **fists only**. Every attack and totem needs DUALFIST.

**Charges.** Focused Force 50 adds one charge per cast (20 HP, 5 MP). Raging Force 346 (78) fills **8 charges at once**. Skills consume charges as follows:

| Skill | Charges used |
|---|---|
| Force Blaster 54 | 1 |
| Force Burst 17 | 1 |
| Force Storm 35 | 1 |
| Hurricane Assault 284 | 2 |
| Break Duress 461 | 2-3 |
| Force Meditation 441 | 3 |
| Force Barrier 443 | 4 |

The bot should top up charges between pulls (Focused Force out of combat) so they are full at the start of each pull [DP].

### 1-19 Orc Fighter
| Role | Skills | When |
|---|---|---|
| Single | Iron Punch 29 (fist) | Spam it while wielding fists. A future Monk should level with fists. |

### 20-39 Orc Monk
| Role | Skills (id) | When / trigger |
|---|---|---|
| Single | Iron Punch 29 (4 s); Stunning Fist 120 (stun, 3 s); Hurricane Assault 284 (36, 2 charges, 3196 power at max) | Main skill until 36: Iron Punch. From 36: Hurricane Assault when ≥ 2 charges, then Iron Punch. Stunning Fist on a runner or an add. |
| Ranged | Force Blaster 54 (24, 1 charge, 600 range) | Pull a mob from range, or finish a fleeing mob. |
| Charges | Focused Force 50 (24) | Between mobs, until the charges are full. |
| Totem | Wolf 83 (20: accuracy +3, run speed ×1.2); **Bear 76 (28: P.Atk ×1.2, crit damage ×1.2, run speed ×0.7)** | Bear in combat from 28. Wolf for travel only. |
| Situational | Cripple 95 (slow) | On a fleeing mob only. |

### 40-75 Tyrant
| Role | Skills (id) | When / trigger |
|---|---|---|
| Single | **Hurricane Assault 284** (2 charges, strongest); **Burning Fist 280** (no charge, 4 s); Soul Breaker 281 (stun, 3 s); Force Blaster 54 | Priority: Hurricane Assault (charges ≥ 2), then Burning Fist, then Soul Breaker as filler or stun. Wikibooks: "most are toys except Hurricane Assault". |
| AoE | Force Burst 17 (43+, FAN 180° r200, 1 charge, 3 s); Force Storm 35 (49+, AoE r150 **around the target**, 500 cast range, 1 charge, 5 s) | Use ≥ 3 mobs as the threshold, since AoE power is low (533) and each use costs a charge. Force Burst for mobs in front of you. Force Storm on a clumped group at range (it pulls them all). |
| Big hit | Punch of Doom 81 (55+, about 9132 power, **costs about 400-500 HP**, 5 min reuse) | Raid or champion mobs only, never trash. |
| Toggle | Fury Fists 222 (43: Atk.Spd ×1.25, **drains 12 HP per tick**); War Frenzy 424 (58+) | Fury Fists on in combat while HP > 50 %, or as an HP-drain tool before Zealot or Bison. War Frenzy always on. |
| Totem (one only) | Puma 282 (40: Atk.Spd ×1.2, accuracy +6); **Ogre 109 (46: P.Atk/P.Def/M.Def ×1.3)**; Rabbit 298 (62: Atk.Spd ×1.3, evasion +12, speed ×1.3); Bison 292 (68: P.Atk ×1.3/×1.1, **crit rate +300 at HP ≤ 30 %**, 60 s, 10 min reuse); Hawk 425 (74: crit damage ×1.3, crit rate +100, accuracy +6) | Default: Ogre (damage plus survival, solid for a bot) [?]. Swap to Bison for a 60 s raid burst at low HP, then back to Ogre or Hawk. At 74+, Hawk if well buffed (Focus/Death Whisper on); otherwise Ogre. Rabbit only for escaping. |
| Self buffs | Dark Form 423; Zealot 420 (HP ≤ 30 %) | Same rules as the Destroyer. The GK low-HP combo is Zealot plus Bison with Fury Fists on (lineage2universe). |
| Emergency | Break Duress 461 (60+, removes root/slow) | When rooted or slowed and ≥ 3 charges. |
| Obsolete | Iron Punch, then Burning Fist; Stunning Fist, then Soul Breaker; Wolf and Bear, then Ogre/Puma | none |
| Never | Cripple 95 in a party (pointless) | none |

### 76-85 Grand Khavatari
| Role | Skills (id) | When / trigger |
|---|---|---|
| Charge refill | **Raging Force 346** (8 charges, 600 range, 50 HP) | Whenever charges < 2 in combat. |
| Rotation | Same as Tyrant: Hurricane Assault, then Burning Fist, then Soul Breaker | none |
| Toggles | Fortitude 335; Riposte Stance 340 (reflects 30 % but Atk.Spd ×0.8) | Fortitude on against stunners. **Riposte off for PvE DPS.** |
| Emergency | **Force Barrier 443** (10 s invincible, 4 charges, 15 min reuse) | HP < 20 % with no heal coming. |
| Never | Force Meditation 441 (stuns self, P.Def ×0.2); Symbol of Energy 458 (manual) | none |

---

## 3. Dominator line (Orc Mystic → Orc Shaman → Overlord → Dominator)

The line has two jobs: clan/party buffer with off-heals, and mass debuffer. It does weak damage.
- **In the owner's party with board buffs**, most Pa'agrio 20-min buffs are redundant (0.2).
- What matters: Seal debuffs on raids and big pulls, Heart of Pa'agrio and Chain Heal as off-heals, CP buffs, and the 3rd-class unique buffs.

### 1-19 Orc Mystic (same for the Doomcryer line)
| Role | Skills (id) | When |
|---|---|---|
| Damage | Life Drain 1090 (drain, 600 range); Chill Flame 1100 (DoT); Venom 1095 (poison DoT) | Pull with Chill Flame or Venom, then Life Drain, then melee with a blunt or staff. |
| Toggle | Soul Cry 1001 (P.Atk +) | Always on while meleeing. |
| Self | Chant of Battle 1007 (14) | Only if there are no board buffs. |
| Situational | Dreaming Spirit 1097 (sleep) on a 2nd mob; Soul Shield 1010 (overwrites board Shield) | none |
| Never | Fear 1092 near other mobs | none |

### 20-39 Orc Shaman
| Role | Skills (id) | When / trigger |
|---|---|---|
| Single | Life Drain 1090; Frost Flame 1107 (DoT, 750 range); Stun Attack 100 (blunt); Aura Sink 1102 (MP burn) | Frost Flame, then Life Drain, then melee. Aura Sink only against casters with MP. |
| AoE | Blaze Quake 1101 (PB DoT, 35 % land rate); Seal of Poison 1209 | Only when ≥ 3 mobs are already on you. Low value. |
| Chants | Chant of Life 1229 (party HoT 15 s) plus the board-duplicate chants | Chant of Life when ≥ 2 members < 70 %. Others only if the board buff is missing. |
| CC | Seal of Binding 1208 (root), Seal of Slow 1099, Dreaming Spirit 1097 | Root or sleep an add while the party kills the main target. |
| Never | Madness 1105, Fear 1092 in a party | none |

### 40-75 Overlord
| Role | Skills (id) | When / trigger |
|---|---|---|
| Damage | **Steal Essence 1245** (magic drain, 900 range, 142 MP); Burning Chop 927 (any melee weapon); Hammer Crush 260 (blunt) | Solo: Steal Essence spam. In a party: assist with Steal Essence only when MP > 60 %. |
| Party debuff seals (on engaged mobs, r200 around **you**) | **Seal of Winter 1104** (Atk.Spd ×0.77, 30 s); Seal of Slow 1099; Seal of Chaos 1096 (accuracy −); **Seal of Suspension 1248** (48+, skill reuse ×3, 2 min); Seal of Silence 1246 (48+, mute 60 s); Seal of Scourge 1247 (no HP regen 2 min) | Big melee pulls (≥ 3 engaged): Winter, then Chaos. Caster mobs: Silence. Raid or champion: Suspension and Scourge (both resisted often; one try each). |
| Emergency CC | Seal of Binding 1208 (root 30 s) | Adds running at the healer. |
| Heals | **The Heart of Pa'agrio 1256** (party heal plus HoT); **The Honor of Pa'agrio 1305** (66+, party CP); **Ritual of Life 1306** (64+, target CP) | Heart when ≥ 2 members < 60 % (except Destroyers in their Frenzy window). Honor and Ritual in PvP or against CP-damaging bosses. |
| Toggle | Soul Guard 1283 (P.Def +, MP drain); Soul Cry 1001 | Soul Guard when being hit. Soul Cry only when meleeing. |
| Party buffs | Pa'agrian Gift, Glory, Tact, Wisdom, Under the Protection of Pa'agrio 1250, Blessings, Rage of Pa'agrio, Vision, Fury of Pa'agrio 1563, Pa'agrian Haste | **Skip when board buffs are on** (0.2). These buffs only reach party and clan members (PARTY_PLEDGE). |
| Never | Madness 1105, Fear 1092, Seal of Mirage 1213 in a party; Seal of Gloom 1210 (MP burn) against mobs without MP; Seal of Poison and Seal of Flame on unpulled mobs | none |
| Obsolete | Life Drain, then Steal Essence; Frost Flame (stops at 30); Blaze Quake | none |

### 76-85 Dominator
| Role | Skills (id) | When / trigger |
|---|---|---|
| Unique buffs, 20 min | **Soul of Pa'agrio 1365** (M.Atk ×1.75, M.Def ×1.3); **Eye of Pa'agrio 1364** (accuracy +4, crit received ×0.7) | Keep up on the party, always. |
| 5-min burst | **Victory of Pa'agrio 1414** (40 Spirit Ore; MULTI_BUFF); **Pa'agrio's Fist 1416** (+800 Max CP, 20 Spirit Ore); Pa'agrio's Emblem 1415 | Before a raid, or before an epic/hard pull. Victory only if no Doomcryer Chant of Victory and no Titan using Over the Body. Emblem only if no Chant of Spirit is on. |
| Debuff | **Seal of Despair 1366** (Atk.Spd/crit/M.Def ×0.7, accuracy −6, P.Atk ×0.9, speed ×0.8; 30 s, 30 s reuse) | Raid or champion pull, on cooldown while ≥ 1 big target is in r200. |
| Emergency | **Seal of Blockade 1462** (blocks normal attacks of ≤ 10 enemies for 10 s, 75 s reuse); **Chain Heal 1553** (83: heals up to 10 friends ≤ 300 around the target by 30 % Max HP, 4 Spirit Ore) | Blockade when the party is taking heavy melee damage. Chain Heal when ≥ 3 members < 50 %. |
| Toggle | Arcane Power 337 (M.Atk ×1.3, drains HP) | Only while nuking with Steal Essence. Off otherwise. |
| Never | Seal of Disease 1367 (PvP), Flames of Invincibility 1427 (manual, clan only) | none |

---

## 4. Doomcryer line (Orc Mystic → Orc Shaman → Warcryer → Doomcryer)

Base and Orc Shaman bands are the same as section 3. A Warcryer is a buffer first; its own damage is about a third of a Tyrant's (Wikibooks).

### 40-75 Warcryer
| Role | Skills (id) | When / trigger |
|---|---|---|
| Heal | **Chant of Life 1229** (party HoT 15 s, LIFE_FORCE_ORC) | When ≥ 2 members < 70 %, or one < 40 %. **Hold it while Destroyers are in their Frenzy window** (HP must stay ≤ 60 %). |
| Chants still useful with board | **Chant of Revenge 1284** (62+, reflect, DMG_SHIELD); War Chant 1390 / Earth Chant 1391 (58+, Spirit Ore) | Revenge every 20 min. **War Chant and Earth Chant: skip.** The board's Greater Might / Greater Shield sit in the same PA_PD_UP slot and the chant would replace the 12-h buff. Use them only when the board buff is missing. |
| Board-duplicate chants | Chant of Battle, Fury, Rage, Predator, Eagle, Evasion, Shielding, Fire, Flame Chant, Vampire, Berserker 1562 | **Don't auto-cast when board buffs are on.** Use them as fill-in for a missing buff, or for 40-51 characters without board access. |
| Damage (solo / assist) | Steal Essence 1245; Freezing Flame 1244 (DoT, 900 range); Hammer Crush 260 (blunt); Burning Chop 927 | Solo: Freezing Flame, then Steal Essence, then melee. In a party: only when buffs are up and MP > 70 %. |
| CC | Dreaming Spirit 1097 (sleep 30 s) | Sleep an add. |
| Toggle | Soul Cry 1001 | Only when meleeing. |
| Never | Fear, Madness; Aura Sink against mobs without MP | none |
| Obsolete | Frost Flame, then Freezing Flame; Life Drain, then Steal Essence | none |

### 76-85 Doomcryer
| Role | Skills (id) | When / trigger |
|---|---|---|
| Burst | **Chant of Victory 1363** (5 min; 40 Spirit Ore; 5 min reuse; party heal 20 %, Max HP +20 %, Atk.Spd ×1.2, crit damage ×1.2, M.Atk/M.Def ×1.2, speed −20 %) | Fighter party: before every raid or hard pull, and on cooldown while fighting tough content. Not for trash if Spirit Ore is scarce. |
| Burst, mage party | Magnus' Chant 1413 (same slot as Victory) | Instead of Victory when the party is mostly casters. Never cast both. |
| 20-min unique | **Chant of Elements 1549** (+20 resistance to all four elements); **Chant of Spirit 1362** (debuff/cancel resistance); Chant of Protection 1461 (crit damage received ×0.7) | Elements and Spirit: keep up always (skip Spirit if board Arcane Protection is on). **Chant of Protection is already in the board's Warrior scheme**, so cast it only when it's missing. |
| Toggle | Arcane Wisdom 336 (MP cost ×0.7, cast speed ×0.9, drains HP) | On during long buff rounds. Off in combat when HP < 50 %. |
| Never | Gate Chant 1429 (manual party summon) | none |

---

## 5. Fortune Seeker line (Dwarven Fighter → Scavenger → Bounty Hunter → Fortune Seeker)

### Spoil logic, all bands [DP and WEB]
1. **Spoil the target before it dies, ideally as the first action.** Spoil 254 has a magic land chance and a 40 range.
   - If it says "spoil failed", retry once or twice while the mob has > 30 % HP. Skip low-value mobs.
   - In a party, the spoiler spoils while the others hold their attacks for about 1 s, or the spoiler opens the pull.
2. **Packs (≥ 3 mobs):**
   - Spoil Bomb 537 (79+: up to 12 targets in r200, 80 % rate, 15 s reuse).
   - Spoil Festival 302 (28+: up to 10 in r200 around the target; **204 MP**).
   - Then AoE them down. This is the classic loop: "Spoil Festival, then mass attack with a pike, then sweep" (l2-servera).
3. **Sweeper 42** (0.5 s reuse, 20 range, needs a corpse).
   - Sweep every spoiled corpse **right after the kill, before picking up drops**. Drops stay on the ground longer than corpses do.
   - [?] On L2J, corpses last about 7 s, longer for spoiled ones. Make sweep priority 1 the moment a spoiled mob dies.
   - Sweeper Festival 444 is a skill file but **not in this class tree**, so sweep corpses one by one.
4. **Spoil Crush 348** (76): a melee spoil on a sword/blunt hit with power 0. It is an alternative opener when Spoil keeps failing [?]. It is not a damage skill.

### 1-19 Dwarven Fighter
| Role | Skills (id) | When |
|---|---|---|
| Attack | auto-attack (dagger or blunt) | No damage skills in this band. |
| Spoil | Spoil 254 (10), Sweeper 42 (10) | Per the spoil logic, from 10 on. |

### 20-39 Scavenger
| Role | Skills (id) | When / trigger |
|---|---|---|
| Single | Stun Attack 100 (blunt) | Filler with a blunt. |
| AoE | Wild Sweep 245 (polearm, FAN) | ≥ 2 mobs in front. |
| Spoil | Spoil 254; Spoil Festival 302 (28+); Sweeper 42 | Packs of 3+: Festival, then Wild Sweep, then sweep each corpse. |
| Self-heal | Bandage 34 (excluded from the extract) | Out of combat only. |

### 40-75 Bounty Hunter
| Role | Skills (id) | When / trigger |
|---|---|---|
| Single, sword/blunt | **Crushing Strike 997** (H5 skill; 5 s reuse; up to about 4689 power at 74; 80 % chance of P.Def/M.Def ×0.9 for 3 s); Fatal Strike 190 (3 s); Hammer Crush 260 (blunt, stun) | Crushing Strike, then Fatal Strike, then Hammer Crush in the gaps (blunt only). |
| Gap closer | Blazing Boost 998 (dash, target ≥ 200 away) | Use it to reach a ranged or caster mob, or a spoil target that is running away. Never in melee range (the cast fails). |
| AoE, polearm | Whirlwind 36 (PB r150) | ≥ 2 mobs on you, after Spoil Festival. |
| Toggles | War Frenzy 424 (58+); Polearm Accuracy 422 (polearm only) | On in combat. |
| Emergency | Fake Death 60 (200 MP, sheds aggro) | Only when HP < 15 %, solo, with no heal coming. Scripted escape only. |
| Never | Wrath 320; Stun Attack and Wild Sweep (obsolete: replaced by Hammer Crush and Whirlwind) | none |

### 76-85 Fortune Seeker
| Role | Skills (id) | When / trigger |
|---|---|---|
| Single | Armor Crush 362 (opener: stun plus defense ×0.7); Crushing Strike 997 (to 5704 power at 85); Fatal Strike 190 | Armor Crush, then Crushing Strike, then Fatal Strike. |
| AoE | **Spoil Bomb 537**, then Earthquake 347 (polearm, 8 s), then Whirlwind 36 | Packs of 3+. |
| Toggles | Riposte Stance 340; Parry Stance 339 | Off for DPS. Parry on only when tanking a pack with HP < 40 %. |
| Self | Braveheart 440 (CP +1000) | PvP or CP-damaging bosses. |
| Never | Symbol of Resistance 456 (manual), Wrath 320 | none |

---

## 6. Maestro line (Dwarven Fighter → Artisan → Warsmith → Maestro)

### Golem logic [DP and WEB]
- **Summon Mechanic Golem 25** (28+) costs D crystals at levels 1-2 and C crystals from level 3.
  - It also eats crystals **over time** (`itemConsumeCountOT`). The bot must keep crystals stocked, or the golem vanishes.
  - Summon it before the hunt, and resummon when it dies. It tanks and adds damage. Interlude guides say it "helps a little" while leveling.
  - [?] The servitor takes a share of the XP.
- Keep the golem alive and buffed:
  - Golem Reinforcement 824 and Strengthen Golem 823 (20 min each; cast on summon).
  - Repair Golem 822 (heals the golem) when golem HP < 50 %.
- **Summon Big Boom 301** (58+, D crystals): an explosive servitor for an AoE burst on a big pack that doesn't put aggro on the dwarf (StrategyWiki snippet). Situational only, not part of the normal loop [?].
- Siege Golem, Wild Hog Cannon and Swoop Cannon: **siege only, never.** Merchant Golem: **never in combat.**

### 1-19 Dwarven Fighter
Auto-attack only. Spoil 254 and Sweeper 42 are optional; Spoil stays at level 1 for this line.

### 20-39 Artisan
| Role | Skills (id) | When |
|---|---|---|
| Single | Stun Attack 100 (blunt) | Filler. |
| AoE | Wild Sweep 245 (polearm) | ≥ 2 mobs in front. |
| Pet | Summon Mechanic Golem 25 (28+) | Keep it summoned. |

### 40-75 Warsmith
| Role | Skills (id) | When / trigger |
|---|---|---|
| Single | Fatal Strike 190 (sword/blunt); Hammer Crush 260 (blunt, stun) | Fatal Strike, then Hammer Crush filler. |
| AoE | Whirlwind 36 (polearm) | ≥ 2 mobs on you. The l2-hub guide says polearm group pulls from 40 give "far more XP". |
| Pet | Mechanic Golem plus its 3 support skills | See the golem logic. |
| Party buffs (dwarf slots) | Sharp Edge 825 (sword/dagger/polearm/fist/dual users); Spike 826 (blunt users); Restring 827 (bow users); Case Harden 828 (heavy armor); Hard Tanning 829 (light armor); Embroider 830 (robe) | Every 20 min, **matching each member's equipped weapon and armor type** (otherwise it does nothing). The board's Warrior scheme already gives Sharp Edge and Hard Tanning, and Defender gives Case Harden. So only cast the one a member lacks: **Spike for blunt users**, Case Harden for heavy-armor members on the Warrior scheme, Embroider and Restring. |
| Self | Battle Cry 1561 (H5 skill: Max HP +35 % with heal; MAX_HP_UP) | Same as Battle Roar: it overwrites board Bless the Body. Emergency heal only. |
| Toggles | War Frenzy 424; Polearm Accuracy 422 (polearm) | On in combat. |
| Never | Siege Golem 13, Wild Hog Cannon 299, Swoop Cannon 448, Merchant Golem 831, Wrath 320 | none |
| Obsolete | Stun Attack and Wild Sweep | none |

### 76-85 Maestro
| Role | Skills (id) | When / trigger |
|---|---|---|
| Single | Armor Crush 362 (opener, defense ×0.7 for the party), then Fatal Strike, then Hammer Crush | none |
| AoE | Earthquake 347, then Whirlwind 36 (polearm) | ≥ 2 mobs on you. |
| Toggles | Riposte Stance 340, Parry Stance 339 | Off for DPS. Parry on when tanking. |
| Self | Braveheart 440 | CP refill. |
| Never | Symbol of Honor 457 (manual) | none |

---

## 7. Open questions to check in game on L2Toggle
1. Does Frenzy activate at ≤ 60 % HP (this datapack) or ≤ 30 % (GF retail)? Cast it at 50 % and see.
2. Cast Guts, then Frenzy, and check that only one icon stays (PINCH).
3. Which Bless the Body id does the board give? Does Battle Roar or Battle Cry replace it?
4. Do the board buffs include Greater Might, Greater Shield, Arcane Protection or prophecies? That decides War Chant and Chant of Spirit.
5. Over the Body CP condition: is it CP ≥ 80 % or ≤ 80 %?
6. Corpse time for sweeping on L2Toggle.

## Sources
- Local datapack: `Scripts/data/dp/classSkillTree.xml`, `highFiveNewClassSkillTree.xml`, `Scripts/data/dp/skills/*.xml`, `Scripts/data/buff_groups.json`. This is the primary source for every number above.
- lineage2wiki.org H5 class pages: [Doomcryer](https://lineage2wiki.org/hi-five/class/doomcryer/), [Warcryer](https://lineage2wiki.org/hi-five/class/warcryer/), [Dominator](https://lineage2wiki.org/hi-five/class/dominator/), [Overlord](https://lineage2wiki.org/hi-five/class/overlord/)
- [l2hub.info Destroyer (Gracia Final)](https://l2hub.info/classes/destroyer): Frenzy and Guts at < 30 % HP, Rage values.
- [l2-servera Destroyer guide (Interlude)](https://l2-servera.com/en/kategorii/ob-igre/destroyer-guide/): weapon per band, Zealot then Frenzy order, Guts not combined with Frenzy, Earthquake as an HP drain.
- [lineage2universe low-HP tactics](https://www.lineage2universe.com/articles/lineage-2-low-hp-tactics-for-different-classes/): Titan and GK pre-frenzy, Zealot plus Bison with Fury Fists.
- [Wikibooks Tyrant](https://en.wikibooks.org/wiki/Lineage_2/The_Player_Character_(PC)_Classes_&_Character_Guides/Tyrant) and [Wikibooks Warcryer](https://en.wikibooks.org/wiki/Lineage_2/The_Player_Character_(PC)_Classes_&_Character_Guides/Warcryer) (old, pre-H5).
- [l2-servera Bounty Hunter guide](https://l2-servera.com/en/kategorii/ob-igre/gajd-bounty-hunter/): Spoil Festival, pike and sweep loop.
- [devtrackers: 2023 Titan changes](https://devtrackers.gg/lineageii/p/769d6146-titan-class-changes-05-16-2023): modern retail, **not H5**. It only confirms that Frenzy and Guts are exclusive.
- [l2calendar H5 classes](https://l2calendar.com/blog/high-five-best-classes): low reliability. It names "Lucky Blow", which is not a Fortune Seeker active skill in this datapack.
- StrategyWiki Warsmith (snippet only; the page returned 403) and the l2-hub.com Warsmith leveling guide (snippet).
