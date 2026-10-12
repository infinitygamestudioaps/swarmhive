# Trade (hand-over)

Route: `#/trade` · also `#/trade/party:<leader>` and `#/trade/char:<name>` (the **Trade…** button on every party header and on the
character page opens the page with those givers already picked).

Send one character, several, a whole party or everyone to the clan leader, or to any character you pick, and hand over exactly the
items you tick. The bots do the travelling and the trading. Nothing moves until you have seen the preview and pressed **Start hand-over**.

## 1 · Who gives

- **Party &lt;leader&gt;**: tap it to add or remove the whole party.
- Tap a single character to add or remove it. The green dot means online. The level and the town it stands in are shown next to the name.
- **Everyone** / **Nobody**.
- The receiver can never give. It is greyed out in the list.

## 2 · Who receives

The default is **Clan leader**. That is `clan.leader` in `Scripts/data/clan_quests.json`, else `clanLeader` in `swarm.config.json`.
You can pick any other character from the list. The line next to the list says whether the receiver is online, which town it is in,
and what it is doing.

## 3 · What

The givers' bags are read **live** from the game, with the item icons. When MCP is down, the page uses each bot's own bag report
(`Logs/bag_<name>.json`, at most 2 minutes old). The line above the list says which source each bag came from. **↻ Bags** reads them again.

Items are grouped: **Raid materials** (materials raid bosses drop), **Crafting materials**, **Recipes**, **Enchant scrolls**
(enchant, attribute and enchant-chance scrolls), **Gear (not worn)**, **Dyes**, **Life stones**, **Consumables** and **Everything else**.
Tap a group to open it, or use **all** to tick the whole group.

- **Quick buttons**: All materials · Raid materials · All recipes · All enchant scrolls · All unequipped gear · All life stones · All dyes ·
  Everything tradeable. "Everything tradeable" leaves consumables (potions, shots, scrolls) and adena out; tick those by hand.
  The number on a button is how many kinds it would tick. Tap it again to untick.
- **Per item**: the tick box takes the whole stack. Type a number in the count field to give only part of a stack.
- **Search**: by name, category or item id.
- **Adena**: never ticked by a button. Each giver has its own **Adena from &lt;name&gt;** field. Leave it empty to give none.
- **Never offered** (shown greyed under "Not tradeable here", with the reason): worn items, quest items, and items the server does
  not let you trade (Shadow items and the like, from the High Five item data: `Scripts/data/trade_items.json`).

### Presets

Pick a preset and tap **Apply**: it sets the receiver and ticks the matching items in the loaded bags. Built-in presets:
"Raid loot to clan leader" (raid materials, recipes, enchant scrolls, life stones), "All materials + recipes to clan leader",
"Old gear to clan leader". **Save as preset** stores the receiver, the quick buttons you have on, the single items you ticked
outside them, and the largest adena amount (given per giver). Saved presets (★) are stored in `Scripts/data/trade_presets.json`.
**Delete** removes a saved preset. Built-in presets cannot be deleted.

## Preview and start

The bar at the bottom shows how many kinds, how much adena and how many givers, and who receives. **Preview + start…** reads the
bags again and lists, per giver, exactly what it will hand over and in how many trade windows (8 kinds each). Anything it cannot
give is listed with the reason. **Start hand-over** saves the order (`Logs/handover/<id>.json`) and sends `!handover <id>` to every
giver and to the receiver.

What the bots then do:

1. Each giver stops what it is doing. It refuses during a raid, Kamaloka or a mission and reports that, so send it again afterwards.
   A more important task (survival, rescue, escape) goes first, and the order waits for it.
2. It goes to the receiver. In the same town it walks. In another town it uses `.townname`. In the field it takes the same route
   planner as the return trip (`.town` → gatekeeper → dungeon / floor teleporters → walk). A **party leader** who gives takes his
   party along on `.townname` (server follow). Members go alone and rejoin their party afterwards. The leader's split watchdog
   leaves a giver alone while it is away.
3. It asks the receiver to stand still. The receiver stops fighting and following while it is not in a fight, raid or Kamaloka, and
   accepts trades **only from our own characters**.
4. It trades in windows of 8 kinds (adena in the last one). When the server refuses a window, the giver tries the items one by one,
   so a single forbidden item never blocks the rest. Each window is reported in party chat and in "What they do".
5. At the end the giver writes its result (given, failed and why, skipped and why) to `Logs/handover/<id>_<name>.json`, adds a
   line to `Logs/handover.log`, and goes back to what it did. A leader resumes leveling.

## Hand-overs list

The last 8 hand-overs: givers → receiver, kinds, preset, time and how many givers are done. **Details** shows one line per giver
(working: the current step; done: what it gave; FAILED: why), plus the items that failed and why. The list refreshes every 5 seconds.
**Stop** sends `!handover stop <id>`: the givers stop after the trade window they are in. Whatever was already traded stays traded.

The command center also has **Hand-over (Trade page order)** and **Stop a hand-over** (Supply / Items). Build orders on this page.

## Files

| File | What |
|---|---|
| `Logs/handover/<id>.json` | the order (written by the dashboard) |
| `Logs/handover/<id>_<name>.json` | each giver's result and the receiver's status (written by the bots) |
| `Logs/handover.log` | one line per giver per hand-over |
| `Logs/bag_<name>.json` | each bot's bag report (fallback when MCP is down) |
| `Scripts/data/trade_presets.json` | your saved presets |
| `Scripts/data/trade_items.json` | categories + not-tradeable items (`node docs/plan/tools/trade_items.js` rebuilds it) |
