# Class rotation data: the format (owner 2026-10-26: "Implement this line for line")

One JSON file per race group in `Scripts/data/class_rotations/<group>.json`:
`human_fighters`, `human_mystics`, `elves`, `dark_elves`, `orcs_dwarves`, `kamael`.
The guide (`docs/plan/class_skills/research/<group>.md`) is the source. Every table row in it becomes one row here. Nothing is left out, nothing is added.
Hive (swarm.js) and the dashboard page `#/combat` both read these files.

```jsonc
{
  "group": "orcs_dwarves",
  "source": "docs/plan/class_skills/research/orcs_dwarves.md",
  "rules": [                       // the "read first" / cross-class rules of the guide, as short plain sentences
    { "text": "Frenzy 176 and Guts 139 share one buff slot: never cast both; the second overwrites the first.", "skills": [176, 139], "src": "DP" }
  ],
  "classes": {
    "46": {                          // class id (every tier of every line: base, 1st, 2nd, 3rd), as in docs/plan/class_skills/class_skills.json
      "name": "Destroyer",
      "band": "40-75",               // "1-19" | "20-39" | "40-75" | "76-85"
      "line": "Titan",               // the 3rd-class name of the line (a base / 1st class shared by several lines: the first one; "lines" lists all)
      "lines": ["Titan"],
      "notes": ["Weapon choice: 2H sword/blunt for raids and single targets; polearm for AoE farming."],
      "rows": [
        {
          "aspect": "single",        // see the list below
          "skill": 315,              // skill id (must exist in class_skills.json for this class or one of its parent classes)
          "name": "Crush of Doom",
          "learn": "60-74",          // learn levels from class_skills.json (from-to)
          "weapon": ["2H_SWORD", "2H_BLUNT"],   // see weapon codes below; [] = any weapon
          "trigger": "On cooldown; first in the single-target order. Costs about 208-261 HP, no MP.",   // the guide's rule / trigger text, plain English
          "when": { "onCooldown": true },       // machine conditions, see below ({} = always)
          "auto": true,              // false = Hive never casts it by itself (never / manual / PvP / obsolete)
          "why": "",                 // reason for auto:false or a note (optional)
          "replacedBy": [],          // for aspect "obsolete": the skill ids that replace it
          "src": "DP"                // "DP" datapack, "G" guide, "?" uncertain (the guide's marks)
        }
      ]
    }
  }
}
```

## aspect (one per row)

| aspect | meaning | Hive uses it in |
|---|---|---|
| `single` | single-target attack; order of the rows = priority | attack order |
| `opener` | first hit on a new target / gap closer | attack order (before `single`) |
| `aoe` | area attack centred on the TARGET (or a fan in front) | attack, when `when.mobsMin` met |
| `aoe-self` | area attack centred on ME (Whirlwind, Earthquake, Blazing Circle, Slashing Blade ...) | attack, mobs counted around me |
| `burst` | big cooldown on bosses / elites / raids | attack on big targets |
| `debuff` | debuff on the target (Surrender, Hex, Death Mark, Stigma ...) | before attacks when `when` met |
| `cc` | sleep / root / stun / fear / silence / slow | only when `when` says (adds, runners, casters) |
| `toggle` | toggle skill | toggle keeper (fight only unless `when.always`) |
| `selfbuff` | buff on myself | upkeep |
| `partybuff` | buff on the party / a member | upkeep |
| `heal` `groupheal` `recharge` `cure` `res` | healer skills | healer brain |
| `summon` `pet` | summon / cubic / golem and pet skills | summon upkeep |
| `spoil` `sweep` | spoiler skills | spoiler step |
| `mp` | own MP recovery (Body to Mind ...) | upkeep |
| `emergency` | low-HP / danger skills | emergency check first |
| `never` | never auto-cast (auto:false) | blocked everywhere |
| `obsolete` | replaced by a newer skill (auto:false, `replacedBy`) | blocked once a replacement is learned |

## weapon codes

`SWORD` (1H sword), `BLUNT` (1H blunt), `2H_SWORD`, `2H_BLUNT`, `DAGGER`, `DUALDAGGER`, `DUAL` (dual swords), `POLE`, `BOW`, `CROSSBOW`, `FIST` (DUALFIST), `RAPIER`, `ANCIENT` (ancient sword), `SHIELD` (needs a shield), `NOT_BOW` (any but bow / crossbow).
Write what the skill really needs (datapack `<using kind=...>`; "2H only" from `slot lrhand`). `[]` = any.

## when (all keys optional; all given keys must hold)

| key | value | means |
|---|---|---|
| `onCooldown` | true | cast every time it is ready |
| `mobsMin` | n | at least n monsters in the fight within the skill's radius (`aoe`: around the target, `aoe-self`: around me) |
| `mobsMax` | n | at most n |
| `hpBelow` / `hpAbove` | % | my HP |
| `mpBelow` / `mpAbove` | % | my MP |
| `cpAbove` | % | my CP |
| `targetHpAbove` / `targetHpBelow` | % | the target's HP |
| `distMin` / `distMax` | units | distance to the target |
| `targetHas` | "bleed" / "death_mark" / "ice_vortex" / "poison" / "stun" ... | the target must carry that effect |
| `targetLacks` | skill id | the target does not carry the effect of that skill yet (recast a debuff) |
| `behind` | true | I stand behind the target |
| `bigTarget` | true | raid boss, minion, champion or a long-lived monster |
| `raidOnly` / `notRaid` | true | only in / never in a raid |
| `soloOnly` / `partyOnly` | true | |
| `fightOnly` / `outOfCombat` | true | |
| `always` | true | toggles that stay on outside fights too |
| `alliesBelow` | { "pct": 70, "n": 3 } | at least n party members under pct HP |
| `allyBelow` | % | any party member under this HP |
| `tankBelow` | % | the tank under this HP |
| `mobsOnMe` | n | at least n monsters attacking me |
| `onTank` | true | cast on the tank (heals / buffs) or on the tank's target (debuffs) |
| `boardMissing` | "Bless the Body" / "Might" / ... | only when that board buff is missing (class buff that would replace a 12 h board buff) |
| `item` | item id | needs this item (Spirit Ore 3031, Battle Symbol 8875 ...) |
| `corpse` | true | needs a fresh corpse |
| `noSpoiler` | true | not when a spoiler is in the party (eats the corpse) |
| `summonOut` | true | only while my summon is out |
| `noFrenzyWindow` | true | not while destroyers are in their Frenzy window (heals) |
| `afterSkill` | skill id | right after that skill (sequences) |
| `charges` | n | needs n charges (Duelist / Tyrant) |
| `souls` | n | uses souls (Kamael), n wanted |
| `mobType` | "undead" / "caster" / "archer" / "melee" | the monster kind it is meant for |
| `text` | "..." | a condition Hive cannot check (the row then counts as `auto:false` unless the rest is checkable) |
