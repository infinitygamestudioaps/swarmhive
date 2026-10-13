# Loot (who gets what the party finds)

Each party has its own **loot rule**. It decides what happens to the items the party picks up while hunting: hand them to one
character (the **collector**), or let the character that found them keep them.

**Off by default.** A party without a loot rule hands nothing over by itself. Everyone keeps what it finds.

Where: party card → **⚙ Settings** → **Loot**. The **Storage** page has a line per party with a **⚙ Loot settings** button that opens
the same place.

## When it happens

Loot only moves at the end of a **supply run in Giran**, and only when the collector is in Giran too. It also moves when you press
**Hand loot over now**, where your install has that button. Loot only moves between your own characters. Some things always stay with
the character:

- what it wears,
- quest items,
- what it uses itself (shots, potions, scrolls of escape / resurrection, arrows),
- upgrades it can wear.

## The choices

1. **Hand the party's loot to a collector**: on or off.
2. **Who collects.** The clan leader, or a character you choose.
3. **What goes to the collector:**

| Choice | What goes | What stays with the finder |
|---|---|---|
| **Everything** | materials, recipes, event letters, old gear nobody uses | only what it wears / uses |
| **All but valuable gear** | the same, except the gear you tick | the grades you tick (for example S, S80, S84), and if ticked: enchanted gear (+1 and up), gear with a special ability |
| **Only non-gear** | materials, recipes, letters … | every weapon, armour and jewel |
| **Only listed items** | only the items on the *Always give* list | everything else |

4. **More** (inside the Loot section):
   - **Hand enchant scrolls too** (on by default when the rule is on).
   - **Hand adena above …**: for example *5m* = a character keeps 5,000,000 and hands the rest. Empty or 0 = it keeps all its adena.
   - **Never give**: these always stay with the finder, whatever the choice above says. Type a name, part of a name, or an item id, then
     press **Add** or Enter. Example: *Moirai* keeps every Moirai piece; *15694* keeps only that item. The never list also protects items
     in the event-letters hand-over and the clan-level-item hand-over.
   - **Always give**: these always go to the collector, also items a character would normally keep (for example *Mana Potion*). *Never
     give* wins over this list.

The section shows **examples** for your rule. They update as you change it. For example:

- ✋ *Sealed Moirai Helmet* (S80 helmet) stays with the finder (S80 gear — party rule: keep S-grade)
- ➜ *Stem* (crafting material) goes to Dagger1

Save with **Save** at the bottom of the window. Turning the rule on asks once and says who will receive the loot.

## What the rule kept

When the rule keeps something that would have been handed over, the character notes it:

> kept: Sealed Moirai Helmet (S80 gear — party rule: keep S-grade)

The leader also says it in party chat at the supply run. The Loot section lists the last items kept for this party under **Kept lately**.
Each item is noted once, not at every supply run. The item stays in the finder's bag **until you decide**. To give it to someone, use
the **Trade page**: pick the item and who gets it.

## Your own hand-overs

The rule only filters the **automatic** hand-overs: the supply-run loot step, the leader's unload of a full bag to a teammate, event
letters and clan-level items (for the last two, only the never list and the gear rules count). What you hand over yourself on the
**Trade page** is never filtered.

## For the technically curious

- File: `Scripts/data/loot_rules.json`, `parties.<leader>`. It is read live by the bots. A missing file or a missing party means off.
- Kept items: `Logs/loot_kept.log`.
- The rules are in `Dashboard/lootlogic.js`, with the same copy in swarm.js `LOOTRULE-PURE`.
- Tests: `docs/plan/tools/test_loot_rules.js` (the rules) and `test_loot_ui.js` (the dashboard).
