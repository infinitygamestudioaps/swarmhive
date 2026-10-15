# Our crafter (a Dwarf that makes shots for your parties)

A Dwarf crafter (Artisan, Warsmith or Maestro) can make soulshots, spiritshots and blessed spiritshots from crystals and
Soul Ore / Spirit Ore. With **Our crafter** switched on, one of your Dwarves stays in town and keeps the shots you choose in stock. In
their supply runs, the parties you tick take shots from it **first**. Only the rest is bought from the shop NPC and then from player
shops.

Everything is **off** until you switch it on. Nothing is crystallized automatically: the crafter uses the crystals and ore it already
has, and it tells you what is missing ("needs 4 C crystals + 60 Soul Ore for 1,000 Soulshot (C)"). You can turn gear into crystals
yourself, and give the crafter recipes and materials: see [Items](#items-crystallize-recipes-and-giving-it-things) below.

## Where to set it up

- **Storage page → Our crafter** (`#/storage`): every Dwarf crafter that has logged in has its own card here.
- **Party ⚙ Settings → Supplies**: one line that shows which crafter supplies this party, with a switch for *Take shots from our
  crafter first*. The switch saves straight away.

## The crafter card

| Setting | What it does |
|---|---|
| **On / Off** | Off = nothing happens. On = it crafts by itself while it stands in its town. Its party must also be started (▶ Start), or it must be the collector. |
| **Where it waits and crafts** | Giran by default. It crafts only while it is there, and it never travels there by itself. Send it with `!town giran` or a party order. |
| **Parties it supplies** | Tick parties, or tick *Every party*. In those parties' supply runs, the leader takes shots from the crafter first. |
| **Keep in stock** | The target count per shot. Empty means the shot is never made. The crafter always works on the shot that is furthest below its target. |
| **Daily limits** | The most crystals of each grade, Soul Ore and Spirit Ore it may use per day (the day starts at 06:30). Empty means no limit. |
| **Crafts per round** | How many crafts it does in one go (default 20) before it checks everything again. |
| **Learn a missing recipe from the bag** | Off by default. When it is on and a shot recipe scroll is in the crafter's bag, the crafter uses the scroll to learn the recipe. |

The card also shows how many of each shot it has, what it can make right now, and what is missing. It lists the crystals and ore in
its bag and its last crafts.

Buttons:

- **Craft now**: one round now (`!craft <name>`). This also works while the crafter is switched off.
- **Read recipe book**: asks the server which recipes the crafter knows (`!craft book <name>`).
- **Craft one batch…**: exactly one craft of the shot you pick (`!craft one soulshot:D <name>`). Use it for the first test.

## Items: crystallize, recipes and giving it things

Under the buttons, every crafter card has a part called **Items** with three folding sections. Nothing in them happens by itself:
you tick, you press the button, and a question asks you first.

### Turn items into crystals (crystallize)

This lists the gear in the **crafter's own bag** that can be turned into crystals, with the grade and how many crystals each piece
gives. Tick the pieces, then press **Crystallize N items…**. A red question lists every piece and the crystals per grade, and warns
that the items are destroyed. Only after you confirm does the crafter crystallize exactly those pieces (`!crystallize <name> <ids>`).

Rules (the crafter checks them again for every piece, just before it crystallizes it):

| Piece | What happens |
|---|---|
| Worn (equipped) | Never. |
| Grade above its skill | Not offered. Crystallize level 1 = D, 2 = C, 3 = B, 4 = A, 5 = S (S80 and S84 too). A Warsmith learns level 2 at 40, 3 at 52, 4 at 60, 5 at 70. |
| Enchanted (+1 and more) | Only when you tick **Include enchanted items**. They give extra crystals (the number shown includes that). |
| Special ability (S.A.) weapons, augmented pieces, untradeable pieces, quest items | Only when you tick **Include special items**. |

If any ticked piece is enchanted or special, you must type YES in the question. After each piece the crafter checks that it is gone
from its bag and that the crystals arrived. The report goes to party chat, `Logs/crystallize.log` and this card. It never crystallizes
while it is fighting, trading, crafting or on a hand-over.

To crystallize gear another character holds, give it to the crafter first (see below).

### Recipes in its bag

Every recipe in the crafter's bag, with the level it needs and whether it can be learned now. **Learn** uses the recipe (it goes into
the recipe book and the recipe item is used up). It checks first that the Create Item level is high enough (Create Common Item for
common recipes) and that the recipe is not already in the book. A recipe book holds 50 recipes on a standard server (dwarven and
common each). A full book refuses it, and the server's message shows in party chat.

### Give items to the crafter

- **From everyone online in its town**: *Send all recipes…* / *Send all materials…* collect them from every character that is online
  in the crafter's town right now.
- **From one character**: choose the character, then *Show its bag* to tick single items (quick buttons: all recipes, all materials,
  all crystallizable gear), or *All its recipes…* / *All its materials…* at once.
- **From the clan warehouse**: tick recipes, materials or gear the clan warehouse holds, then *Bring … from the clan warehouse…*. Only
  the clan leader can take items out. If the crafter is the clan leader, he takes them out himself. Otherwise the clan leader takes them
  out and trades them to the crafter.

Materials are crystals, Soul Ore, Spirit Ore and every crafting ingredient of the High Five recipes. Shots and potions are never sent
as materials. Worn, quest and untradeable items are never offered.

**Who walks where.** By default nobody travels for it. A giver that is already in the crafter's town walks over and trades now. A
giver somewhere else keeps the items and hands them over the next time it stands idle in that town (not while it fights, trades, runs
a raid, quest, mission or one of your orders, or while its party's supply run holds the team). Tick **Go to the crafter now** before
sending if the giver should travel at once (.townname / walk). A waiting order can be sent on its way later with **Go now** in the
*Hand-ins* list, or ended with **Stop**. A waiting order is given up after 7 days.

The *Hand-ins* list shows each order and every giver's state: waiting for the same town, on the way, trading, done, failed.

## What a Dwarf can craft

| Shot | Create Item level | Class level | Per craft | Ingredients | MP |
|---|---|---|---|---|---|
| Soulshot (D) | 2 | 20 | 468 | 9 Soul Ore + 3 D crystals | 72 |
| Soulshot (C) | 4 | 36 | 952 | 30 Soul Ore + 2 C crystals | 84 |
| Soulshot (B) | 6 | 49 | 450 | 54 Soul Ore + 1 B crystal | 100 |
| Soulshot (A) | 7 | 55 | 300 | 36 Soul Ore + 1 A crystal | 120 |
| Soulshot (S) | 8 | 62 | 350 | 40 Soul Ore + 1 S crystal | 150 |
| Spiritshot (D) | 2 | 20 | 100 | 3 Spirit Ore + 1 D crystal | 60 |
| Spiritshot (C) | 4 | 36 | 200 | 10 Spirit Ore + 1 C crystal | 120 |
| Spiritshot (B) | 6 | 49 | 150 | 15 Spirit Ore + 1 B crystal | 180 |
| Spiritshot (A) | 7 | 55 | 200 | 22 Spirit Ore + 1 A crystal | 240 |
| Spiritshot (S) | 8 | 62 | 200 | 15 Spirit Ore + 1 S crystal | 300 |
| Blessed Spiritshot (D) | 2 | 20 | 100 | 8 Spirit Ore + 2 D crystals | 60 |
| Blessed Spiritshot (C) | 4 | 36 | 200 | 30 Spirit Ore + 2 C crystals | 120 |
| Blessed Spiritshot (B) | 6 | 49 | 100 | 16 Spirit Ore + 2 B crystals | 180 |
| Blessed Spiritshot (A) | 7 | 55 | 200 | 70 Spirit Ore + 2 A crystals | 240 |
| Blessed Spiritshot (S) | 8 | 62 | 200 | 50 Spirit Ore + 2 S crystals | 300 |

Every one of these succeeds 100 % of the time. The crafter must have **learned** the recipe ("Recipe: Soulshot (C-Grade)" and so on;
a recipe scroll that is still in the bag is not learned yet). Create Item levels: 1 at level 5, 2 at 20, 3 at 28, 4 at 36, 5 at 43,
6 at 49, 7 at 55, 8 at 62, 9 at 70. No-grade shots cannot be crafted. Source: the High Five datapack (`recipes.xml`) and L2Swarm's own
recipe table.

## In a supply run

The supply order is **our crafter → shop NPC (Helvetia) → player shops**:

1. After the team reports what it needs (and after gear upgrades), the leader checks whether a crafter supplies his party.
2. If the crafter reported within the last 10 minutes and stands in the **same town**, it walks over and trades the shots it has
   (the same hand-over as the Trade page). The leader waits at most 8 minutes.
3. The leader then buys only what is still missing at Helvetia and, for B / A / S shots, from player shops (if that is switched on).
4. If the crafter is in another town or out in the field, nobody travels. The leader says so in party chat and buys everything.

## Logs

- `Logs/crafter.log`: every round, every craft, every supply hand-over.
- `Logs/crafter_<name>.json`: the status the dashboard shows.
- `Logs/crafter_usage_<name>.json`: crystals and ore used today (for the daily limits).
- The intent log (*What they do*): `craft`, `craftsupply`, `crystallize`, `craftlearn` and `handover` lines.
- `Logs/crystallize.log`: every crystallize order, every piece, the crystals it gave.
- `Logs/crafter_bag_<name>.json`: the crafter's crystallizable pieces and recipes, for the card (written every minute while it changes).
- `Logs/handover/crin*.json`: the hand-in orders; `Logs/handover/_pending_<name>.json`: a giver's orders that wait for the same town.

## Mail

The client has a mail (post) packet, but mail between our own characters has **not** been checked on L2Toggle, so the crafter does not
use it. It hands shots over by trade in town instead.
