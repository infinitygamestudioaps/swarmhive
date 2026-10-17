# Items: buy, enchant, Special Ability, give — and Crafting

One page for every item any of your characters can reach.

## Items (`Items` tab, `#/items/<name>`)

1. **Who?** Tap a character (big class icons; 👑 = clan leader, ⚒ = crafter).
2. **Where?** 🎒 **Bag** · 🏠 **Warehouse** (its private warehouse; *Look now* sends it to the Giran keeper to read the list) ·
   🏰 **Clan warehouse** (only the clan leader takes things out; for anyone else he brings them) · 🛒 **Giran shops** (everything Giran's
   merchants sell, with prices).
3. **Tap an item.** A sheet opens:
   - ✨ **Enchant to** +1 … +16: the chance per level and in total (green = safe), what it gains (about +P.Atk / P.Def), *Blessed scroll*
     (a fail drops it to +0 instead of destroying it). **If it fails, it fails** — the job stops there.
   - 💎 **Special Ability** (weapons): every choice with its soul crystal, gemstones and adena.
   - 🤝 **Give to (and wear it)**: any character. Its party comes to Giran, it gets the item and puts it on in place of what it wears there,
     then the party carries on.
   - 📋 **What happens**: the steps, what is needed from where (bag → warehouse → clan warehouse) and what is missing.
   - **✔ Do it** — only when nothing is missing. You watch every step live on the sheet.

Order of the steps: get the item (buy / take out) → enchant → Special Ability (after enchanting: a destroyed item never costs you the soul
crystal) → give + wear.

Enchant scrolls are not sold by any Giran merchant: they come from your bags and warehouses. The success rates are an **estimate** (66 % per
try above the safe +4) until you put the real ones in `Scripts/data/enchant_rates.json` (`{ "safe": 4, "weapon": 66, "armor": 66, "jewel": 66 }`).

The Special Ability exchange reads the blacksmith's list from the server first; when the list cannot be read exactly, **nothing is
exchanged** and the job says so.

## Crafting (`Crafting` tab, `#/crafting/<name>`)

Only characters that can craft (Create Item: Dwarves) are offered. Every recipe its level allows, with the materials counted from its bag, its
warehouse and the clan warehouse — **Can make now** / **Missing materials** / **All**, by grade, search. **⚒ Make** N: it takes what is missing
from the warehouse(s) (the clan leader brings clan items), then crafts, resting for MP when needed.
