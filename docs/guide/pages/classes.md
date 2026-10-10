# Class plans (`#/classes`)

A **class plan** says which class a character becomes at level **20**, **40** and **76** (1st, 2nd and 3rd profession). A character
changes class **only** when you have saved **and approved** its plan on this page. A character with no plan, or with a plan you have
not approved, never changes class. The bots say this once in party chat when such a character reaches the level.

Every class in High Five is covered: all races, the fighter and mystic lines, the Dwarven Scavenger / Artisan lines, Orc Shamans, and the
separate male and female Kamael trees. The class data comes from the game data file `Scripts/data/class_tree.json`, which is generated
from the L2J datapack.

## Where you see missing plans

- **Parties tab:** a red banner on top, *"N characters without an approved class plan"*, lists the parties. Each party header shows a
  pulsing badge (*"5 no class plan"*). Each member row without an approved plan shows **No plan** (red) or **Not approved** (amber).
  On a phone the row shows the short text; the full explanation is in the tooltip and is read out by screen readers.
- **Character page:** the same badge next to the party name. It also shows *Class plan ✓* when the plan is approved.
- **Classes page:** the same banner, a count on each party tab, and a red edge on each member row that needs attention.

The badges pulse to catch your eye. If your device is set to *reduce motion*, they stay still and keep their text.

## The Classes page

Open **Classes** in the tab bar. Pick a party at the top (parties are named after their leader, the same as on the Parties tab).

| Column | Meaning |
|---|---|
| Character | class icon, name, level, swarm role |
| Now | the current class and the next profession level |
| Plan | the steps: faded = already taken, gold = the next change, the small number = its level. *suggested: …* = a suggestion that has not been saved yet |
| Status | **No plan** · **Not approved** · **Approved** (waiting for the level) · **Change due** · **Plan complete** · **Broken plan** / **Off plan** (the plan no longer fits the class) |

Buttons on each row:

- **Plan…** opens the class picker (see below).
- **Approve…** approves a saved plan. The confirm dialog lists every remaining change, the level it happens at, and that the server
  takes its fee (200,000 adena on L2Toggle). A class change cannot be undone.
- **Unapprove** keeps the plan but stops the class change until you approve it again.
- **Copy to same class (n)…** gives this plan to every character (in all parties) who has the same class right now. You can copy it
  approved or not approved.
- **Remove** deletes the plan, so the character never changes class.

**Approve N plans…** above the table approves every saved plan in the party that is not approved yet, after one confirm dialog that
lists them all.

## The class picker

The picker has three steps: 1st, 2nd and 3rd profession. Each step only offers the classes the game allows after the step before it.
Steps the character has already taken are shown as **taken** and cannot be changed. Each class shows its role (tank, healer, nuker, …)
and a short description. **Inspector** and **Judicator** are marked *subclass only?*: on retail High Five they are subclass classes, so
check the Career page before you plan them. When a class has only one next profession (for example Orc Raider › Destroyer › Titan), that
step is filled in for you. **stop before this step** ends the plan early, and the character then stays in the last class of the plan.

When a character has no plan yet, the picker is pre-filled from a suggestion (the role's usual path, or `classPlan` in
`swarm.config.json`). Nothing is saved until you tap a save button:

- **Save (not approved):** the plan is stored, but the character does **not** change class.
- **Save & approve…:** asks you first, then stores the plan as approved.

On a phone the picker opens as a sheet from the bottom of the screen. Close it with ✕, **Cancel**, a tap outside it, or Escape.

## Group templates

A template is a set of plans for a whole group, for example *"Shillien tank + healers + 2 destroyers + …"*. Each slot has a label, a
swarm role, a base class and a path.

- **Save party as template…** stores the party's saved plans as a new template.
- **Apply template… / Apply to party …** first shows a **preview**: which member gets which plan, which existing plans it replaces, and
  which slots nobody fits. A member fits a slot when its current class is on the slot's path. A matching role and the exact class are
  preferred. Untick anyone you want to leave as they are. Tick *approve these plans now* to approve them; otherwise they are saved as
  not approved.
- The shipped **example** templates (raid team, spoil & craft trio, Elven and Dark Elven mage parties, Orc destroyer party) are always
  listed and cannot be deleted. Templates you make yourself can be deleted.

## What the bots do

- The bots read `Scripts/data/class_plans.json` within 10 seconds of each save, without a restart.
- When a member with an **approved** plan reaches the level, the party leader orders `!classchange`. The character opens Alt+B ›
  Career › Professions, clicks the one button whose label is exactly the planned class, and checks that its class id afterwards is
  exactly that class. If no button matches, or two do, it does not click.
- `!classchange` from the dashboard or from party chat follows the same rule. Without an approved plan the character refuses and says
  why in party chat.
- `!classplan` (Commands › Leveling) makes every character report its plan status in party chat.
- Each character reports its status in its dashboard state (`classPlan`: `missing`, `needs-approval`, `waiting <class> @<level>`,
  `ready <class>`, `done`), and the Classes page shows it as *bot says: …* when it differs from the page.

## Files

| File | What it is |
|---|---|
| `Scripts/data/class_plans.json` | your plans and templates (yours: an update never overwrites it; it is created from `class_plans.example.json` when missing) |
| `Scripts/data/class_plans.example.json` | the format plus the example templates |
| `Scripts/data/class_tree.json` | every class: parent, children, race, change level, role, names (generated by `docs/plan/tools/class_tree.js`) |
| `Scripts/data/history/class_plans_*.json` | the last 50 versions (every save) |
| `Logs/dashboard_commands.log` | one line per save (`classplans`) |

Every save is checked against the class tree, so no invalid jump is possible. It is written atomically under a lock. If the plans were
changed somewhere else after you opened the page, the save is refused and asks you to reload, so nothing is overwritten by accident.
