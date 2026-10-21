# Server options (buffs, way to town, gatekeepers)

Hive was built on a server with a free buffer on the Community Board (Alt+B), free `.townname` teleports and the Cabinet setting
"Follow Party Leader's Dialog". Your server may work differently. In **⚙ Settings → Server** on every party card you choose, per party:

- **where buffs come from**,
- **how the party gets back to town**,
- whether **the server takes the party along at gatekeepers**.

Leave everything as it is when your bots already buff, go to town and teleport fine: **nothing set = the old behaviour**.

## Where buffs come from

Tap the sources **in order**. The first one that works is used; the next one is the fallback.

| Source | What happens | Where it works |
|---|---|---|
| **Community Board (Alt+B)** | The free board buffer: Buffs → scheme → Buff Me. | Anywhere out of a fight, when the board works on your server. |
| **The party's own buffers** | Buffers in the party (prophets, songs and dances…) keep everyone buffed by their buff plan (Buffs page). | Anywhere. |
| **Buy from player buff stores** | The character walks to a player buff store whose title has one of your words (for example `cov`, `buff`), checks the price and buys each buff on your list. | In a town. |
| **Own buffers waiting in a town** | Your own buffer characters stand at one spot in a town. The character that needs buffs walks there, leaves its party, joins one buffer's party, gets every buff that buffer knows, leaves, then the next buffer. Its own leader invites it back afterwards. | In that town. |
| **Newbie Helper** | The character stands in front of the Newbie Helper and clicks its buff link (it looks for words like "buff", "magic", "support"). | In a town or village, up to the level you set (default 62). |

The default is **Community Board, then the party's own buffers** — exactly what Hive always did.

Stores, your buffer station and the Newbie Helper are only used **in a town** (supply runs, town visits). Out in the field the next source
in your list is used. Before every buff turn the character first gets **out of combat** (it waits up to 45 s and steps away from monsters
if needed), whatever the source.

### Player buff stores

- **Buffs to buy**: the names as the game shows them, comma between (`Chant of Victory, Prophecy of Fire`).
- **Seller title contains**: words in the seller's title (`cov, buff`). Sellers are found by their title, never by name.
- **At most adena per buff**: a store asking more is skipped.
- **Buy again when less than … minutes** are left (default 60).

### Own buffer station

- **Town** and the spot (**x, y, z** — use `/loc` in the game, standing where the buffers stand).
- **Buffer characters**, in the order they should buff.
- **Go there below … buffs** (default 5).

The buffer characters must be **online and standing at that spot**, and either alone or leading their own party (only a party leader can
invite). They invite the guest, buff it, and send it off again. A character that is not listed as a station buffer refuses.

## Way back to town

Tap the ways **in order**; tap none for **Automatic**.

| Way | What happens |
|---|---|
| **Automatic (as before)** | `.townname` when the server knows it, else the gatekeepers (Hive learns it by itself). A Scroll of Escape only when a character runs from a fight alone. |
| **.townname command** | The free server command (`.giran`, `.dion` …). |
| **Return skill** | A class skill that takes the character to town (skills named Return, Escape …). Extra skill ids can be added. |
| **Scroll of Escape** | Reads a Scroll of Escape (any kind) from the bag. |
| **Gatekeeper** | Walks to the nearest gatekeeper and teleports (inside a dungeon a Scroll of Escape first). |
| **Walk back** | Walks to the nearest town along the wall-checked path, only when it is not farther than your limit (default 40,000). |

Example for a server without `.townname`: **Return skill → Scroll of Escape → Walk back**.

## The server takes my party along at gatekeepers

- **On** (default): only the leader clicks the gatekeeper; the server ("Follow Party Leader's Dialog") brings the party.
- **Off**: the leader still gathers the party and fights off monsters first, then **every member clicks the same gatekeeper link** itself.

Switch it off on servers without the "Follow Party Leader's Dialog" option.

## For the curious

The settings are saved in `Scripts/data/server_options.json` (per party; a "default" entry for every party without its own). The bots read
it within a few seconds — no restart needed. Missing = the old behaviour.
