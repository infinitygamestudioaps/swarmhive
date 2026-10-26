# Kamael skill usage per level band (H5 / L2Toggle)

Covers Doombringer, Soul Hound (male and female), Trickster and Judicator.

**Scope and confidence**
- Skill names, ids and learn levels come from `../Doombringer.md`, `../Soul_Hound.md`, `../Trickster.md` and `../Judicator.md`. Mechanics (conditions, durations, AoE radius, soul cost, abnormal slots) were checked in `Scripts/data/dp/skills/*.xml`, which is the L2J H5 datapack. Those datapack facts are marked **[DP]** and are the most reliable part of this document.
- Web guides for H5 Kamael are thin. l2wiki.com returned 403, fandom 402, and hopzone, exilium and maxcheaters were unreachable. The readable guides are mostly Gracia Final or Classic, or only describe skills. The playstyle advice below is built from those guides plus the datapack mechanics. **(unc)** marks inference or a single weak source.
- **Board buffs** are assumed: Might, Haste, Empower, Shield, Focus, Death Whisper, Wind Walk and so on. Several Kamael self-buffs share an abnormal slot with board buffs and must not be auto-cast (see the global rules).
- Ranges and AoE values below are taken from the datapack. "Mobs" means the minimum cluster size that makes the AoE worth more than single-target. Every Kamael AoE has `affectLimit 5-12`, so it hits at most about 5 to 12 targets.

---

## 0. Global Kamael rules (apply to every line)

### Souls [DP]
- **Soul Mastery** is a passive (not listed in the md files). It gains souls automatically from EXP and also on crits. The soul cap grows with level: 5 at 5, 10 at 15, 20 at 36, 24 at 49, 30 at 62, 40 at 74. Souls expire 10 min after the last one is absorbed (legacy-lineage2 CT1 notes).
- Almost every Kamael attack has `soulMaxConsumeCount 5`. It uses **up to 5 souls per cast** for bonus power, and it **still works with 0 souls**, just weaker. The bot should never block an attack because souls are low.
- Ways to refill souls:
  - **Life to Soul 502** (40+): costs 193 to 328 HP and gives 1 to 5 souls (by skill level), 11 s reuse, and cannot be cast at 40 souls. Auto-use rule: `souls < 5 && HP > 70% && (not in combat || target HP high)`.
  - **Soul Gathering 625** (46+): gives +50 souls (capped), costs 10 Spirit Ore (id 3031) and 200 HP, 30 min reuse. Auto-use before a pull or a raid when `souls < 10` and Spirit Ore ≥ 10.
  - **Soul Rage 939** (78+): gives +1 soul per cast and does a 0-power hit, for 25 HP and 5 MP. Use it only as a filler while main skills are on cooldown and `souls < 5`. Never spam it at 40 souls.
- **Final Form 538** (79+) **[DP]**: needs 20 souls and uses all 20, plus 200 HP. It is a 5 min transform that doubles P.Atk, P.Def, M.Atk and M.Def. Reuse is **1 hour**. It is a **transformation**: the normal skill bar is replaced by transform skills (Nail Attack, Wing Assault, and so on, per l2info). **Do NOT auto-use it unless the bot has a transform skill set.** Use it manually for raids and PvP. (unc: which normal skills stay usable while transformed has not been verified.)

### Abnormal-slot conflicts with board buffs [DP]

| Kamael skill | Shares a slot with | Bot rule |
|---|---|---|
| Increase Power 1432 (PA_UP) | Might, Chant of Battle | Never cast while board Might is up. Increase Power is weaker (+8/12% vs +15%). |
| Rapid Attack 469 (ATTACK_TIME_DOWN) | Haste, Chant of Fury | Never cast while Haste is up. |
| Soul to Empower 1441 (MA_UP) | Empower | Never cast while Empower is up. |
| Furious Soul 482 (PA_UP_SPECIAL) | Rage | Fine unless a Rage buff is present. |
| Sword Shield 483 / Prahnah 1470 (PD_UP_SPECIAL) | Ultimate Defense, Vengeance, Harmony/Symphony of Noblesse, each other | Emergency only; don't overwrite each other. |
| Dark Weapon 1443 (HOLY_ATTACK) | Holy Weapon, Fire/Ice/Wind/Earth Weapon | Only cast it if no other weapon-element buff is on the target. |
| Courage 499 (RESIST_SPIRITLESS) | Lionheart | Situational. |
| Soul Barrier 1514 (PD_UP_BOW) | Deflect Arrow | Emergency. |
| Appetite / Protection Instinct / Vampiric / Magic Impulse / Soul Harmony (INSTINCT) | each other | Only one Inspector "instinct" is active at a time. |

### Weapons and Change Weapon [DP + legacy-lineage2]
- Ancient Sword (2H) is used by Trooper/Berserker/Doombringer. Rapier (1H) is used by Soul Breaker/Soul Hound/Inspector/Judicator melee. Crossbow is used by Warder/Arbalester/Trickster. The Soul Breaker/Soul Hound magic skills (Abyssal Blaze, Soul of Pain, Dark Flame, Annihilation Circle, Soul Strike, Soul Vortex, Leopold) **have no weapon requirement**.
- **Change Weapon 1473** converts the equipped D-grade or higher weapon between 2H sword and Ancient Sword, 1H sword and Rapier, or Bow and Crossbow. Enchant, SA and attribute carry over, and an augmented weapon cannot be converted. It has a 15 s reuse. It is a **one-time setup action and never a combat skill. Never auto-use it.**
- **Charge skills cannot be used in melee** **[DP]**: Shoulder Charge 494, Blade Rush 495, Storm Assault 493 and Rush Impact 793 have `target mindistance=200`. The bot must only cast them when the target is **≥ 200 units away**. Use them as gap-closers or openers. This is a likely source of "wrong skill" spam.
- **Conditional skills [DP]**:
  - Checkmate 506 needs a rapier and **Death Mark 1435 on the target**.
  - Contagion 498 needs an ancient sword and **a bleed on the target** (from Blade Rush 495).
  - Soul Vortex Extinction 1513 needs **Soul Vortex 1512 on the target** and removes it.
  - Restoration Impact 1488 needs **Restoration 1487 on the target**.
  - Deadly Roulette 510 needs **your own HP ≤ 10%**.

### Owner rules that override the tables (from CLAUDE.md)
- **All toggles run ONLY in fights** (2026-10-10). "Always on" in the tables below means "on whenever fighting". This includes Dark Armor and Dark Blade, even though they drain no MP.
- **No self-buffs while board buffs are on** (2026-10-02 rule a). The exceptions are buffs the board does not give: Dark Weapon 1443 and Pride of Kamael 1444 (swarm.js `partyBuffs.inspector` already keeps these up), Furious Soul, Blood Pact, Fast Shot and Lightning Barrier, which share no slot with board buffs. Whether those exceptions are allowed is the owner's call. **(unc)**

### Always-never list (all Kamael)
- **Detect Trap 470** and **Defuse Trap 471**: only for player traps or chests.
- **Erase Mark 1475** **[DP]**: removes **Death Mark** from a target. Its only use is cleansing an ally hit by an enemy Kamael. Never auto-cast it on a mob, because it would remove your own Death Mark.
- **Change Weapon 1473**: see above.
- **Hard March 479**: +20 run speed with an MP drain. It is a travel toggle only; turn it on when moving with no target and off in combat (or ignore it if Wind Walk is up).
- **Soul Harmony 1480** **[DP]**: party-wide **Stun + P.Def ×0.1 + 200 MP restore**. **NEVER auto-use it.** It stuns and strips your own party.

---

## 1. Doombringer line (male): Kamael Soldier → Trooper → Berserker → Doombringer
Weapon: **Ancient Sword**. Physical melee with strong point-blank and charge AoE. **Doombringer1** plays this line.

### 1-19 Kamael Soldier (male)

| Category | Skills | When / trigger |
|---|---|---|
| Core single | **Fallen Attack 468** (melee, 3 s; requires **sword/blunt/rapier, not ancient sword**), **Fallen Arrow 1431** (wind magic, 600 range, 2 s) | If you wield an ancient sword, Fallen Attack fails, so use Fallen Arrow as the opener and filler and auto-attack otherwise. With a sword, open with Fallen Arrow and then spam Fallen Attack. |
| AoE | none | none |
| Souls | Passive only (cap 5 to 10) | Nothing to manage. |
| Self-buff | Increase Power 1432 (10+) | **Only if there is no board Might** (slot conflict). |
| Never | none | none |

### 20-39 Trooper

| Category | Skills | When / trigger |
|---|---|---|
| Core single (AS) | **Dark Strike 476** (3 s, sword/blunt/AS) | Main spam on cooldown. |
| Core single (rapier, SB-bound only) | Double Thrust 478 (rapier) | Only if the character holds a rapier. A Doombringer-bound character uses Dark Strike. |
| Ranged / pull | **Abyssal Blaze 1433** (dark magic, 750 range, 2 s) | Pull or opener from range, and when the target is out of melee range. |
| AoE | **Dark Explosion 1434** (24+, magic AoE around the target, 500 cast range) | Use at 3+ mobs clustered. |
| Debuffs | Death Mark 1435 (24+, 30 s DoT plus P.Def/M.Def −23%) | On tougher mobs or bosses only. Skip it on trash. |
| Toggles | **Dark Armor 481** (32+, dark resist, no MP drain), **Dark Blade 480** (36+, +10 dark attack, no MP drain) | Keep both on at all times. |
| Toggles (optional) | Strike Back 475 (small P-damage reflect, MP drain) | Optional. Off is fine. |
| Self-buffs | **Furious Soul 482** (24+, 90 s, crit rate/dmg up, P.Def −5%, 75 s reuse) | Recast on cooldown while in combat. |
| Self-buffs | Increase Power 1432 lvl 2 | Only if there is no board Might. |
| Emergency | Courage 499 (36+, fear/confusion resist 60 s) | When feared or facing fear mobs. |
| Emergency | Sword Shield 483 (36+, 30 s huge P.Def, −40% speed, 15 min reuse) | When HP < 30% and in melee. |
| Gap-closer | Rush 484 (32+, AS/rapier, 400 range, no damage) | Only as a gap-closer when the target is > 200 away. Low value. |
| Never auto | Disarm 485 (PvP), Surrender to Dark 1445 (a dark-resist debuff that does little for Ancient Sword damage; **unc**), Erase Mark, Hard March in combat | none |

### 40-75 Berserker

| Category | Skills | When / trigger |
|---|---|---|
| Core single | **Dark Smash 477** (40+, 3 s, AS) as the spam filler. **Crush of Pain 497** (60+, 7 s, power 7635, AS) on cooldown. **Contagion 498** (64+, 7 s, power 7635, AS, **needs a bleed on the target**) right after Blade Rush. | Priority: Contagion (if bleeding) > Crush of Pain > Dark Smash. |
| Opener from range (≥ 200) | **Shoulder Charge 494** (40+, charge plus 9 s stun at 70%, AS). **Blade Rush 495** (55+, charge fan 300, bleed at 50%, AS). **Storm Assault 493** (49+, charge plus AoE r150 at the target, AS). | Pick by mob count: 1 mob → Shoulder Charge; 2+ → Blade Rush (enables Contagion); 3+ clustered → Storm Assault. Only cast at distance ≥ 200. |
| AoE point-blank | **Slashing Blade 496** (46+, r150 around self, 4 s, AS). **Spread Wing 492** (52+, r150 around self, 4 s). | Use at 3+ mobs in melee range. Alternate the two, since each has a 4 s reuse. |
| Souls | Life to Soul 502, Soul Gathering 625 (46+) | Use the global rules. |
| Toggles | **True Berserker 500** (40+, P.Atk/Atk.Spd +5 to 8%, P.Def −10%, MP drain). **Dark Armor 481** and **Dark Blade 480**. | Keep True Berserker on while hunting (turn it off if MP < 15%). Dark Armor and Dark Blade stay on always. |
| Self-buffs | **Furious Soul 482** lvl 2 on cooldown. **Blood Pact 834** (55+, party +10% Max HP and regen, 120 s, 75 s reuse). | Furious Soul in combat. Blood Pact on cooldown when in a party. |
| Debuff | **Violent Temper 501** (49+, target P.Def −23% and Cast Spd −15%, 30 s, 600 range) | On bosses, raids and long fights. Skip it on trash. |
| Emergency | **Body Reconstruction 833** (52+, **heals 100% HP**, 15 min) | When HP < 25%. |
| Emergency | Sword Shield 483 lvl 2 | When HP < 30% and Body Reconstruction is on cooldown. |
| Emergency | **Soul Barrier 1514** (58+, 10 s M.Def ×2 plus bow/crossbow resist, 45 s) | When hit by mages or archers. |
| Emergency | **Soul Cleanse 1510** (66+, removes up to 3 debuffs) | When rooted, slowed, poisoned, bleeding or silenced. |
| Emergency | Courage 499 | When feared. |
| Never auto | Scorn 503 (frontal **aggro** fan; it would pull aggro off the tank in a party), Disarm 485 (PvP), Rush 484, Erase Mark | none |
| Obsolete from 40 | Dark Strike 476 (→ Dark Smash), Double Thrust 478, Dark Explosion 1434 (→ Slashing Blade/Storm Assault), Abyssal Blaze 1433 (keep only as a ranged pull), Death Mark lvl 2 (→ Violent Temper), Surrender to Dark, Increase Power, Strike Back | none |

### 76-85 Doombringer

| Category | Skills | When / trigger |
|---|---|---|
| Core single | Same as Berserker: Contagion > Crush of Pain > Dark Smash | none |
| Charge AoE (≥ 200) | **Rush Impact 793** (78+, charge fan 600×60°, 9 s stun at 60%, AS) | Use as the main group opener: charge into a pack of 3+, then switch to point-blank AoE. |
| Burst AoE | **Enuma Elish 526** (78+, front fan 400×90°, power 6060, **75 s reuse**) | When 3+ mobs are in front and HP > 50%. |
| AoE point-blank | Slashing Blade 496 and Spread Wing 492 | Use at 3+ mobs around. |
| Example AoE loop | Rush Impact → Enuma Elish → Slashing Blade → Spread Wing → Storm Assault (when a target is ≥ 200 away) | This matches the lineage2.com forum "pull with Rush Impact, stun, AoE the whole room" style (post-GoD source, **unc** for H5). |
| Souls | **Soul Rage 939** filler when souls < 5 | Plus the global rules. |
| Toggles | **Fortitude 335** (76+, stun/paralyze resist, MP drain −1) | Raids, PvP, and stun-heavy mobs only. Off for normal farming. |
| Burst | Final Form 538 | **Manual only** (transform, 1 h reuse). |
| Never auto | **Mass Disarm 794** (PvP, 150 s), Scorn, Disarm | none |
| Older skills | All Berserker damage skills stay useful (they max at 74). Nothing new is obsolete. | none |

---

## 2. Soul Hound line (male): Kamael Soldier (m) → Trooper → Soul Breaker → Soul Hound
**Inspector1** plays this line. Base and 1st-class skills come from the **Doombringer.md** tables (male Soldier and Trooper). The Soul Breaker (class 128) and Soul Hound (132) skill lists are **identical to the female ones** (verified in class_skills.json).

Playstyle: a **dark magic nuker and debuffer** with a rapier melee backup. Surrender to Dark (−30 dark resist) stacks with the dark-attribute (UNHOLY) nukes **[DP]**: Abyssal Blaze, Dark Explosion, Soul of Pain, Dark Flame and Annihilation Circle are all UNHOLY. Dark Weapon adds +20 dark attack power, and in L2J the attacker's element power also boosts skills of the same element (**unc**, from the formula reading).

### 1-19 Kamael Soldier (male)
Same as the Doombringer line, but **use a rapier or sword** so Fallen Attack 468 works. Open with Fallen Arrow 1431, then use Fallen Attack. Increase Power 1432 only without board Might.

### 20-39 Trooper (Soul Breaker-bound)

| Category | Skills | When / trigger |
|---|---|---|
| Core single | **Abyssal Blaze 1433** (dark magic, 750 range, 2 s) as the main nuke. **Double Thrust 478** (rapier, 3 s) when the mob reaches melee. | Kite-cast Abyssal Blaze and finish in melee with Double Thrust. |
| AoE | **Dark Explosion 1434** (24+, around the target) | Use at 3+ clustered. |
| Debuffs | **Surrender to Dark 1445** (28+, 900 range, 30 s, 80%). **Death Mark 1435** (24+). | On mobs that take more than about 3 nukes: Surrender, then Death Mark, then nukes. Skip both on trash. |
| Toggles | Dark Armor 481 and Dark Blade 480 | Always on. |
| Self-buffs | Furious Soul 482 | Only while meleeing. It is a physical crit buff and does nothing for nukes. |
| Self-buffs | Increase Power | Only if there is no board Might. |
| Emergency | Courage 499, Sword Shield 483 | When HP < 30%. |
| Never auto | Dark Strike 476 (no ancient sword on this path), Rush 484, Disarm 485, Strike Back 475 (optional), Erase Mark | none |

### 40-75 Soul Breaker

| Category | Skills | When / trigger |
|---|---|---|
| Debuff opener (non-trash) | **Surrender to Dark 1445** (900 range), then **Death Mark 1435** (600 range, DoT plus P.Def/M.Def −23%, 70%) | Recast when they expire (30 s each). Death Mark also **enables Checkmate**. |
| Core single magic | **Soul of Pain 1436** (dark magic, 700 range, 3 s) as filler spam. **Curse of Divinity 1439** (66+, damage scales with the **number of debuffs on the target**, 4 s). | Cast Curse of Divinity after the debuffs are up. |
| Core single melee (rapier) | **Checkmate 506** (52+, **needs Death Mark**) → **Shining Edge 505** (49+, blow) → **Triple Thrust 504** | When a mob is in melee or the bot plays melee. This is the "Death Mark + Checkmate + Shining Edge" combo from l2info and mmoauctions. |
| AoE | **Annihilation Circle 1438** (58+, r150 around the target, 500 range, 5 s) | Use at 3+ clustered. This is the main ranged AoE. |
| AoE | **Dark Flame 1437** (46+, frontal fan r200×180°, 40% slow, 4 s) | Use at 3+ mobs in front at close range. |
| AoE | **Spread Wing 492** (52+, point-blank r150, physical) | Use at 3+ mobs on you. |
| Souls | Life to Soul 502, Soul Gathering 625 | Use the global rules. Keep ≥ 5 souls for full nuke power. |
| Party/self buffs | **Dark Weapon 1443** (46+, +20 dark attack, **20 min**, 400 range, target) | Self plus party melee, if no other weapon-element buff is on them. |
| Party/self buffs | **Pride of Kamael 1444** (49+, +10% P.Atk/M.Atk/blow rate **only with ancient sword, crossbow or rapier**, **3 min**, 30 s reuse) | Self plus Kamael party members, recast every 3 min. Useless on non-Kamael. |
| Self-buff | Soul to Empower 1441 (MA_UP) | Only if there is no board Empower. |
| Toggles | Dark Armor 481 | Always on. |
| Control | Shadow Bind 1446 (52+, root 15 s, 400 range) | Root a melee mob to kite it (solo). |
| Control | Voice Bind 1447 (58+, silence 20 s) | On caster mobs. |
| Control | Soul Web 1529 (62+, AoE slow r200, 60 s) | When kiting several mobs. |
| Party debuff | Curse of Life Flow 1511 (60+, party members heal when they hit the target, 30 s) | On a boss or raid target in a party. |
| Emergency | **Painkiller 837** (58+, 8 s damage and debuff immunity, 5 min) | When HP < 20%. |
| Emergency | **Blink 1448** (60+, point-blank stun r150 plus blink 400 backwards) | When 2+ mobs are on you and you are low. (unc: the blink can land in walls; risky for pathing) |
| Emergency | Soul Cleanse 1510 (66+) | When debuffed by root, slow, silence or poison. |
| Never auto | **Steal Divinity 1440** (steals buffs; PvP or buffed raids only), Protection from Darkness 1442 (only vs dark-damage bosses; it shares a slot with Surrender to Dark), Erase Mark 1475, Detect/Defuse Trap | none |
| Obsolete from 40 | Abyssal Blaze 1433 (→ Soul of Pain), Dark Explosion 1434 (→ Annihilation Circle), Double Thrust 478 (→ Triple Thrust), Furious Soul (male only; not in the SB tree), Increase Power, Strike Back, Courage, Sword Shield (they stay at low level and are replaced by Painkiller) | none |

### 76-85 Soul Hound

| Category | Skills | When / trigger |
|---|---|---|
| Opener (non-trash) | Surrender to Dark → Death Mark → **Soul Vortex 1512** (77+, 900 range, Atk.Spd/Cast.Spd −30%, speed −20%, MP drain, 30 s, 15 s reuse) | none |
| Burst single | **Curse of Divinity 1439** (while 3 debuffs are up) → **Soul Strike 1516** (76+, 750 range, 15 s) → **Soul Vortex Extinction 1513** (79+, **needs Vortex**, removes it, 15 s) | Cast SVE **after** Curse of Divinity, because SVE removes a debuff. |
| Filler | **Soul of Pain 1436** | Spam while the others are on cooldown. |
| Suggested single loop | (Surrender → Death Mark) → Soul Vortex → Curse of Divinity → Soul Strike → Soul Vortex Extinction → Soul of Pain ×N → repeat Vortex when off cooldown | **unc**: built from mechanics, not a published H5 rotation. |
| AoE | **Leopold 1469** (78+, fire AoE r100 around the target, 45 s, 4 s cast) | Use at 3+ tightly clustered. |
| AoE | **Annihilation Circle 1438** | Use at 3+ clustered, on cooldown. |
| AoE | Dark Flame 1437 | Use at 3+ in front. |
| Souls | **Soul Rage 939** filler when souls < 5 | Plus the global rules. |
| Self-buff | **Lightning Barrier 1515** (80+, 20 min, 20% chance to paralyze attackers) | Keep it up at all times. It is cheap. |
| Party buffs | Dark Weapon 1443 and Pride of Kamael 1444 | As in Soul Breaker. |
| Burst | Final Form 538 | **Manual only.** |
| Emergency | Painkiller, Blink, Soul Cleanse | As in Soul Breaker. |
| Never auto | Steal Divinity, Erase Mark, Protection from Darkness | Same as Soul Breaker. |
| Older skills | All Soul Breaker skills stay (max lvl 74). Triple Thrust/Shining Edge/Checkmate become backup only if the bot plays caster. | none |
| H5-only extras (not in md) | `highFiveNewClassSkillTree.xml` adds **Aura Blast 1554** (81), **Aura Cannon 1555** (82) and **Arcane Shield 1556** (83). The male and female Soul Breaker trees also add **Mana Pump 1565** and Soul to Empower lvl 3. | Verify them on the server before adding to a profile. |

---

## 3. Soul Hound line (female): Kamael Soldier (f) → Warder → Soul Breaker → Soul Hound
40-85 is the **same as section 2**. The differences are in 1-39.

### 1-19 Kamael Soldier (female)

| Category | Skills | When / trigger |
|---|---|---|
| Core | Fallen Arrow 1431 opener, Fallen Attack 468 (rapier or sword) | none |
| Self-buff | Rapid Attack 469 (10+, +15% Atk.Spd) | **Only without board Haste.** |
| Never | Detect Trap 470, Defuse Trap 471 | none |

### 20-39 Warder (Soul Breaker-bound)

| Category | Skills | When / trigger |
|---|---|---|
| Core single | **Abyssal Blaze 1433** (main), **Double Thrust 478** (rapier, melee finish) | none |
| AoE | Dark Explosion 1434 | Use at 3+ clustered. |
| Debuffs | Surrender to Dark 1445 (28+), Death Mark 1435 (24+) | Non-trash only. |
| Toggles | Dark Armor 481, Dark Blade 480 | Always on. |
| Self-buffs | Furious Soul 482 | Melee only. |
| Emergency | Ultimate Escape 622 (36+, evasion plus speed 20 s, 15 min) | When HP < 25%, to flee. |
| Emergency | Warp 628 (32+, blink 500 **forward**) | **Never auto** (it blinks toward the facing direction). |
| Never auto | Penetrating Shot 487, Fast Shot 490, Soul Shock 627 (crossbow-only; this path uses a rapier), Fire Trap 514, traps, Erase Mark | none |

---

## 4. Trickster line (female): Kamael Soldier (f) → Warder → Arbalester → Trickster
Weapon: **Crossbow** from 20 (Change Weapon from a bow). Ranged physical. Forum consensus: weaker raw damage than bow archers, strong debuffs and tricks (pmfun, maxcheaters titles).

### 1-19
Same as the female Soldier (section 3). Use Fallen Arrow 1431 as the main ranged attack, Fallen Attack in melee, and Rapid Attack only without Haste.

### 20-39 Warder (crossbow)

| Category | Skills | When / trigger |
|---|---|---|
| Core single | **Penetrating Shot 487** (crossbow, 500 range, 6 s, 120 MP), auto-attacks, Abyssal Blaze 1433 (magic filler, 750 range) | none |
| AoE | Dark Explosion 1434 (magic) | Use at 3+ clustered. Kamael archers have no other AoE before 46. |
| Self-buffs | **Fast Shot 490** (32+, crossbow Atk.Spd; **does not conflict with Haste**) | Keep it up. |
| Toggles | Dark Armor 481 (32+), Dark Blade 480 (36+) | Always on. |
| Emergency | **Soul Shock 627** (36+, crossbow, 200 range, fear) | When a mob reaches melee range (solo), to make it flee and get free shots. |
| Emergency | Ultimate Escape 622 | When HP < 25%. |
| Debuffs | Death Mark 1435 | On tough mobs (optional). |
| Never auto | Double Thrust 478 (rapier), Surrender to Dark (the crossbow is not dark element; **unc**), Fire Trap 514, Warp 628, Erase Mark, traps | none |

### 40-75 Arbalester

| Category | Skills | When / trigger |
|---|---|---|
| Debuff opener | **Real Target 522** (900 range, bow/crossbow resist down, 30 s, 3 s reuse) | On every non-trash target. Recast when it expires. |
| Core single | **Twin Shot 507** (3 s, power 4870, main nuke). **Bleeding Shot 509** (43+, 8 s, bleed DoT). | Priority: Real Target (if missing) > Bleeding Shot (if no bleed) > Twin Shot > auto-attack. |
| AoE | **Rising Shot 508** (46+, AoE around the target, 6 s, **202 MP**) | Use at 3+ clustered. It is MP heavy, so keep MP > 30%. |
| Self-buffs | **Fast Shot 490** lvl 2 | Always. |
| Self-buffs | **Sharpshooting 521** (60+, P.Atk/crit/accuracy/range up for 120 s, **roots you**) | **Only when stationary** (party, boss, static pulls). Never while kiting. |
| Self-buffs | Life to Soul / Soul Gathering | Use the global rules. |
| Toggles | Dark Armor 481 | Always on. |
| Emergency | Soul Shock 627 (fear) | When a mob is in melee range (solo only; in a party fear scatters mobs). |
| Emergency | Ultimate Escape 622 | When HP < 25%. |
| Emergency | **Decoy 525** (43+, summons a decoy, 10 min) | When HP < 30% and a mob is on you. |
| Emergency | Soul Barrier 1514 (58+) | Vs archers or mages. |
| Emergency | Soul Cleanse 1510 (66+) | When debuffed. |
| Emergency | **Shift Target 489** (40+, moves aggro to a party member) | Only in a party, when a mob targets you and the tank is next to you. |
| Upkeep (out of combat) | **Create Special Bolt 621** (43+), **Quiver of Bolts B/A/S 620/519/520** (52/60/74, 366 to 398 MP, 10 min) | Use when bolt count is low, with no target and MP > 60%. |
| Never auto | **Deadly Roulette 510** (needs **own HP ≤ 10%**; desperation only). **Temptation 511** (adds 500 aggro; never in a party). Traps 514/515/516/517/518/836 (cast at your own feet; the maxcheaters and pmfun forums say "traps are useless" in L2J; **unc**). Create Dark Seed 513, Imbue Dark Seed 523, Imbue Seed of Destruction 835, Cure Dark Seed 524 (melee range 40, item upkeep; PvP gimmick). Detect/Defuse Trap. | none |
| Obsolete from 40 | Penetrating Shot 487 (→ Twin Shot), Abyssal Blaze, Dark Explosion (→ Rising Shot), Death Mark, Surrender to Dark, Fire Trap lvl 2, Furious Soul (not in the Arbalester tree), Dark Blade (it gives a dark attack attribute that a crossbow user rarely benefits from; keep it on only if nothing better; **unc**) | none |

### 76-85 Trickster

| Category | Skills | When / trigger |
|---|---|---|
| Core | Same as Arbalester: Real Target → Bleeding Shot → Twin Shot. Rising Shot at 3+. | none |
| Souls | Soul Rage 939 filler when souls < 5 | none |
| Party buff | **Prahnah 1470** (78+, party +3000 M.Def for 30 s, 5 min) | Vs magic bursts or raid AoE, or when the party HP drops fast from magic. |
| Toggles | Focus Skill Mastery 334 (78+, raises the Skill Mastery proc chance, MP drain −2) | Boss or raid only. Off for farming. (unc) |
| Burst | Final Form 538 | Manual only. |
| Never auto | **Betrayal Mark 792** (a PvP trigger debuff) | none |
| H5 extras (not in md) | **Multiple Shot 987** (82), **Death Shot 990** (83) from highFiveNewClassSkillTree.xml | Verify on the server. |

---

## 5. Judicator line: Warder → Inspector → Judicator (subclass only)
Inspector (class 135) is **subclass-only** (parent Warder). Forums say it unlocks after two other subclasses reach 75 (pmfun, l2scroll, legacy-lineage2). In practice a **subclass starts at 40**, so **the 1-39 bands do not apply**. The character begins as Inspector at 40 with Warder skills learnable. Role: a rapier melee support with party "instinct" burst buffs and curse debuffs.

### 40-75 Inspector

| Category | Skills | When / trigger |
|---|---|---|
| Core single (rapier) | **Shining Edge 505** (49+, blow), **Triple Thrust 504** | Alternate them on cooldown (3 s each). |
| AoE | **Spread Wing 492** (52+, point-blank r150) | Use at 3+ around you. |
| Party "instinct" (one at a time, 15 s, 5 min reuse) [DP] | **Appetite for Destruction 1476**: party P.Atk/crit rate/crit dmg +30 to 50% | At boss or raid engage, or at the start of a big pull in a melee party. |
| Party "instinct" | **Protection Instinct 1478**: party P.Def/M.Def up | When party HP drops sharply or a raid AoE is coming. Use it instead of Appetite. |
| Party "instinct" | **Vampiric Impulse 1477**: melee absorb HP | Melee party with low HP and no healer. |
| Party "instinct" | **Magic Impulse 1479**: party M.Atk/Cast Spd/M.Crit | Mage-heavy party at burst time. |
| Heal | **Restoration 1487**: 15 s HoT on an ally or self | When an ally has HP < 70%. |
| Heal | **Restoration Impact 1488**: **requires Restoration on the target**, consumes it for a % Max HP heal | When an ally has HP < 40% and Restoration is on them. |
| Curse debuffs (60 s, 70%, proc on damage) | **Spite 1485**: more crit damage taken. **Thin Skin 1483**: wound/bleed proc. **Weak Constitution 1482**: stun proc. **Enervation 1484**: slow proc. **Oblivion 1481**: lose-target proc. **Mental Impoverish 1486**: MP burn. | Bosses and long fights only: Spite + Thin Skin first, Weak Constitution if stuns are useful. Skip on trash. |
| Souls | Life to Soul 502, Soul Gathering 625 | Global rules. |
| Toggles | Dark Armor 481 | On. |
| Emergency | **Painkiller 837** (58+) | When HP < 20%. |
| Emergency | Soul Cleanse 1510 (66+) | When debuffed. |
| Never auto | **Soul Harmony 1480** (stuns your party; see global), Mental Impoverish on mobs without MP, Oblivion in a party (the target loses aggro or target randomly; **unc**), Erase Mark | none |
| Note | pmfun lists soul costs (instincts 5 souls, curses 2 to 3, Restoration 1). **The datapack has no soul cost on these.** Trust the datapack: they are MP-only. | none |

### 76-85 Judicator

| Category | Skills | When / trigger |
|---|---|---|
| Core | Same as Inspector | none |
| Self-buff | **Lightning Barrier 1515** (80+, 20 min) | Keep it up. |
| Souls | Soul Rage 939 filler when souls < 5 | none |
| Burst | Final Form 538 | Manual only. |
| Older skills | All Inspector skills stay (max lvl 74). Thin Skin lvl 7 at 74 comes from the H5 supplement file. | none |

---

## 6. Quick "most likely wrong skill" checklist for the bot
1. Charge skills (494, 495, 493, 793) cast in melee. They need **distance ≥ 200**.
2. Checkmate 506 without Death Mark, Contagion 498 without a bleed, and Soul Vortex Extinction 1513 without Soul Vortex all fail.
3. Increase Power 1432, Rapid Attack 469 and Soul to Empower 1441 overwrite board Might, Haste and Empower.
4. Erase Mark 1475 removes your own Death Mark. Soul Harmony 1480 stuns your party. Deadly Roulette 510 only works at HP ≤ 10%.
5. Fallen Attack 468 with an ancient sword fails. Rapier skills fail on a Doombringer and crossbow skills fail on a rapier user. Filter by the equipped weapon.
6. Final Form 538 transforms the character. Change Weapon 1473 converts the weapon. Both are manual only.
7. Sharpshooting 521 roots you, so never use it while kiting. Temptation 511 and Scorn 503 pull aggro.

## Sources
- Local datapack: `Scripts/data/dp/skills/*.xml`, `classSkillTree.xml`, `highFiveNewClassSkillTree.xml`, and `docs/plan/class_skills/*.md` (primary).
- Soul Hound skills and tips (Death Mark + Checkmate + Shining Edge; Steal Divinity, Voice Bind, Blink use): https://l2info.estranky.cz/clanky/soul-hound.html
- Inspector skill descriptions: https://lineage.pmfun.com/list/skill/c135/kamael-inspector.html
- Kamael class overview (Soul Breaker opener Death Mark then Checkmate/Shining Edge/Triple Thrust; Arbalester Real Target/Sharpshooting; Berserker Soul Barrier/Body Reconstruction) (Classic): https://mmoauctions.com/news/lineage-2-kamael-guide
- Souls duration and weapon conversion pairs (CT1): https://legacy-lineage2.com/news/kamael_01.html
- Doombringer "Rush Impact, Crushing Pain, Enuma" combo, no skill crits (H5 server forum): https://forum.lineage2dex.com/threads/3654/
- Doombringer Olympiad notes, Soul Barrier/Blood Pact/Furious Soul usage (GF): https://l2tox.com/news/163
- Doombringer PvE "pull with Rush Impact, AoE the room" (post-GoD, unc): https://forums.lineage2.com/topic/21061-doombringer-help-stupid-pve/
- Trickster forum notes (traps weak in L2J): https://forum.pmfun.com/viewtopic.php?t=4693
- Inspector unlock conditions: https://forum.pmfun.com/viewtopic.php?t=8673 and https://www.l2scroll.com/2017/11/kamael-sub-class-quests.html
- H5 skill database listings (seen in search only, not fetched): https://l2elo.com/en/database/classes/soul-breaker and https://l2elo.com/en/database/classes/berserker
