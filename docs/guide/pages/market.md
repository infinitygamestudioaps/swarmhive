# Market (player shops in town)

Open it with the **Market** tab (`#/market`). It shows what the other players' private shops in a town sell, want to buy and
craft, as one of your characters last saw them.

## Scanning the shops

1. Pick the character that scans in **Who scans** (it must stand in a town; in Giran it should be near the market square).
2. Press **Scan now** and confirm. The character walks the town's streets to every player shop it sees, opens each one and writes
   down its list. A full Giran scan takes a few minutes. It goes back to what it was doing afterwards.
3. The list fills in when the scan is done. "N shop(s) could not be read" means those owners left or did not answer. Scan again.

Order in chat or the command bar: `!market <name>`.

## Selling, Buying, Crafting

- **Selling**: every item on sale, with the count and the price per piece.
- **Buying**: what shops want to buy, how many, and what they pay.
- **Crafting**: recipes a crafter offers and the fee.

Use the search box (item or shop name), the sort list (name, price, shop) and the town list.

## Shots B/A/S

**Shots B/A/S** shows the cheapest B, A and S grade soulshots, blessed spiritshots and plain spiritshots in Giran's player shops
from the newest scan, next to the max price each party set (party ⚙ Settings → Supplies → *Buy shots from player shops*):

- a green chip with ✓: the cheapest offer is at or below that party's max price, so the leader buys it in the next supply run;
- a red chip with ✗: too expensive, so it is not bought;
- a grey chip with (off): the party has prices but the switch is off.

Under the list, **Last purchases from player shops** shows what each leader bought last time (or why he did not buy).

## Try it by hand

- `!pshop plan <shot> <count> <leader>` buys **nothing**. It says in party chat which shops the leader would buy from, and for how
  much. Shot numbers: soulshot B/A/S 1465/1466/1467, blessed spiritshot 3950/3951/3952, spiritshot 2512/2513/2514.
- `!pshop buy <shot> <count> <leader>` buys now (the leader stands in Giran). It works only while *Buy shots from player shops* is on
  for that party, and it keeps to the max price, the "always keep" adena and the per-run limit.

Both are in the command bar as *Player shops: what would shots cost?* and *Player shops: buy shots now*.
