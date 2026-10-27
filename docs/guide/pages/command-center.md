# Command center

The command center is the one place where you can give **any** order to **any** character, party, several of them, all parties or the
clan. It is a search window: type a few letters, pick what you mean, fill in a short form, check exactly what will be sent, confirm. It
knows all 121 commands of the system (the full list with every detail is the [command reference](../05-commands.md)).

Nothing is sent before you confirm, and the server checks every order again before it reaches the game.

## Opening it

- Tap **Search or give an order...** at the top of any page.
- On a PC: press **Ctrl K** (press it again to close), or **/** when no text field has the focus.
- Tap **Commands** on a party card (Parties tab), or **All commands for &lt;name&gt;...** on a character page: the command center opens on that
  party's or character's [command sheet](#command-sheets).

On a phone it slides up from the bottom and fills most of the screen; on a desktop it opens as a window near the top. Close it with **✕**,
**Esc**, the phone's or browser's **back** button, or by tapping the dark area outside it. **‹** goes one step back (form -> sheet or
search -> closed).

## Search

![Command center opened on a phone](../img/cmd_palette_phone.png) ![Command center opened on a desktop](../img/cmd_palette_desktop.png)

1. **Search field** - type here. The list below changes with every letter.
2. **Section heading** - results are grouped (see below).
3. **Recent order** - the last orders you sent from this browser, with their target and how long ago. Tap one (↻) to open the same
   form again with the same details and targets already filled in; you still confirm before it is sent.
4. **✕** - close.
5. **Hints** - `↑↓ choose · Enter open · Esc close · ! swarm · / L2Swarm`.

With an empty field you see, in this order:

| Section | What is in it |
|---|---|
| **Recent** | Up to 6 of your last orders (the browser keeps 12). Stored only in this browser. |
| **Common orders** | Level, Supply run, STOP everything, Town teleport, Status report, Raid a boss, Kamaloka, Retreat, Rebuff, Class change. |
| **Parties** | Every party: size, level range, how many are online. Opens the party's command sheet. |
| **Pages** | Every tab, plus "Live raid view" and "Hunting-spot map editor". Opens the page (↗). |

### Typing

![Search for "tele giran"](../img/cmd_search_phone.png) ![Search on a desktop](../img/cmd_search_desktop.png)

1. **Best hit** - highlighted; **Enter** opens it. Move with **↑ ↓**.
2. **Sections** - the section with the best hit comes first.

The search is forgiving: letters only have to appear in order ("tlpt" finds "Town teleport"), and several words must each match something
("tele giran" finds Town teleport, because Giran is one of its keywords). It searches command titles, templates, keywords, category names
and descriptions, character names, classes, roles, party names and page names. Legacy commands are pushed down.

| You type | You get |
|---|---|
| Part of a character name, class or role | **Characters**: name, level, class, party, offline mark, what it is doing. Opens its command sheet (›). |
| Part of a party (leader) name | **Parties**: opens the party's command sheet (›). |
| Part of a command | **Commands**: title and the template that will be sent. Chips: **L2Swarm** (an L2Swarm chat-box command), **dashboard** (an action the dashboard does itself), **safe**, **destructive**. |
| A page name | **Pages**: opens it (↗). |
| Text that starts with `!`, `/` or `@` | **Send as typed**: sends your text exactly as written. You pick the target in the form. |
| Any other text longer than 2 letters | **Tell them "..."** (last row): free text that the server turns into a command, such as "restock" -> `!supply`. |

![Characters in the search](../img/cmd_search_char_phone.png) ![Send as typed](../img/cmd_search_raw_phone.png) ![Free text](../img/cmd_search_text_phone.png) ![Pages in the search](../img/cmd_search_pages_phone.png)

The PC commands (Start / Restart / Stop L2Swarm, Deploy swarm.js) are only found through the search, because they have no character target:

![PC commands in the search](../img/cmd_search_pc_phone.png)

When nothing matches, the window says `Nothing found for "...". Commands start with ! (swarm) or / (L2Swarm).`

## Command sheets

A command sheet lists every command that fits **one party** or **one character**, sorted into categories.

![Party command sheet on a phone](../img/cmd_party_sheet_phone.png) ![Party command sheet on a desktop](../img/cmd_party_sheet_desktop.png)

1. **Who** - for a party: its size, how many are online, who is busy, and a row of class icons. For a character: level, class, party,
   offline mark and what it is doing now.
2. **Open** / **Open page** - closes the command center and opens the Parties tab or the character page.
3. **Filter commands...** - narrows the list.
4. **Category** - tap to fold or unfold. The dashboard remembers which categories you keep open (at first: Move, Fight, Party, Supply,
   Leveling, Raids).
5. **Command tile** - title and template (`…` marks an optional part). The title colour shows its safety (green = safe, normal = confirm, red = destructive); hold the mouse over it on a PC
   to read the description. Tap it to open the [form](#the-command-form).

![Every category folded](../img/cmd_cats_all_phone.png) ![Every category folded on a desktop](../img/cmd_cats_all_desktop.png)

Which commands appear:

- On a **party** sheet: every command that can target a party.
- On a **character** sheet: every command that can target one or several characters.
- **Clan leader** commands (clan level, clan quests, siege registration, clan warehouse ...) only appear on the clan leader's own sheet and
  on his party's sheet.
- **PC** commands never appear on a sheet (search only).

![Character command sheet](../img/cmd_char_sheet_phone.png) ![Character command sheet on a desktop](../img/cmd_char_sheet_desktop.png)

1. **The character**. 2. **Open page**. 3. A **destructive** tile is drawn in red.

### The categories

Each picture shows one category unfolded. The [command reference](../05-commands.md) explains every command in it.

| Category | Typical commands | Picture |
|---|---|---|
| **Move / Travel** | Town teleport, Gatekeeper teleport, Walk to..., Park in Giran, Park at the safe spot, Retreat, Regroup / Return, saved places, L2Swarm move / run / walk, `/unstuck` | ![Move](../img/cmd_cat_move_phone.png) |
| **Fight** | STOP everything, Kill a monster, Help a character / stop helping, Rebuff, Auto-rebuff, Fight in a .zmap zone, L2Swarm attack / target / combat / sit / stand | ![Fight](../img/cmd_cat_fight_phone.png) |
| **Party** | Status report, Collect adena, Cabinet setting, party info, invite, leave, social actions, ignore, trade | ![Party](../img/cmd_cat_party_phone.png) |
| **Supply / Items** | Supply run, Restock, Sell, Better gear, Gear plan, Upgrade, Enchant, Dyes, Shop scan, soul crystals, L2Swarm buy / sell / click link | ![Supply](../img/cmd_cat_supply_phone.png) |
| **Leveling / Spots** | Level, Auto-level (party / solo / stop), Dungeon on / off, Class change | ![Leveling](../img/cmd_cat_level_phone.png) |
| **Raids / Kamaloka** | Raid a boss, Kamaloka, Stop mission, Raid hunter / stop, Joint raid, Route test, Loot, Boss rebuff wave, Drain test | ![Raids](../img/cmd_cat_raid_phone.png) |
| **Clan / Sieges** | Clan level (now / automatic), Clan quest step, Clan skill, Clan warehouse, Create the clan, siege plan / fortress / castle / stop, siege registration | ![Clan](../img/cmd_cat_clan_phone.png) (the clan leader's sheet) |
| **Seven Signs** | Sign up with the Lords of Dawn | ![Seven Signs](../img/cmd_cat_signs_phone.png) |
| **Bot control** | Bot ON / OFF, route points, run a macro, Config set / save / load | ![Bot control](../img/cmd_cat_bot_phone.png) |
| **Client mode / Account** | In-game (l2.exe client), Out of game, Log out, Log in | ![Client mode](../img/cmd_cat_client_phone.png) |
| **PC / L2Swarm** | Start, Restart, Stop L2Swarm, Deploy swarm.js | search only (picture above) |
| **Debug / Reports** | Navigation test, Escape test (and FULL), Dump skills, `/loc`, game time, instance zone info | ![Debug](../img/cmd_cat_debug_phone.png) |
| **Legacy** | Old commands that are switched off in the leader-controlled design (farm, camp, `!go`, `!raid`, career, escort, quest, gear share, shop) | ![Legacy](../img/cmd_cat_legacy_phone.png) |

![Move / Travel on a desktop](../img/cmd_cat_move_desktop.png)

## The command form

![Town teleport form on a phone](../img/cmd_form_town_phone.png) ![Town teleport form on a desktop](../img/cmd_form_town_desktop.png)

1. **Command** - icon, title, category; "L2Swarm chat-box command" for `/` commands; a **safe** or **destructive** chip.
   Below it the description: what the command does.
2. **Details** - the arguments (only when the command has some). Required ones must be filled in; optional ones are marked *optional*.
3. **Who** - the target picker (see [Targets](#targets)).
4. **What will be sent** - the preview (see [Preview](#preview-dry-run)).
5. **Send** - grey until a target is picked and every required argument is filled in. **Back** returns to where you came from.

### Argument fields

Every kind of argument has its own control:

| Kind | Control | Example form |
|---|---|---|
| Town | List of the 11 towns with a `.townname` command | ![Town](../img/cmd_form_town_phone.png) (above) |
| Raid boss | Text field with suggestions: every boss with its level, sorted by level (from the Raid bosses data) | ![Raid a boss](../img/cmd_form_boss_phone.png) |
| Character | List of every character, grouped by party, with level and class | ![Help a character](../img/cmd_form_char_phone.png) |
| Party / several parties | List of parties; for several: one chip per party, tap to add or remove (the target party itself is not offered) | ![Joint raid](../img/cmd_form_parties_phone.png) |
| Number | Number field | ![Raid hunter](../img/cmd_form_number_phone.png) |
| Kamaloka | List from the server: name, level range, party size | ![Kamaloka](../img/cmd_form_kamaloka_phone.png) |
| Dungeon | List of catacombs and necropolises with their level range | ![Dungeon](../img/cmd_form_dungeon_phone.png) |
| Gatekeeper destination | Text field with suggestions from every live gatekeeper menu | ![Gatekeeper](../img/cmd_form_gk_phone.png) |
| Place in Giran | List: grocer, warehouse, weapons, armor, jewelry, blacksmith, symbol, start | ![Park](../img/cmd_form_park_phone.png) |
| Cabinet setting + ON/OFF | Text field with the Cabinet rows as suggestions, and an **ON / OFF** switch | ![Cabinet](../img/cmd_form_onoff_phone.png) |
| Clan quest | List: Blood Mark (clan level 2 -> 3), Q501 (3 -> 4), Q503 (4 -> 5); plus an optional step or "reset" | ![Clan quest](../img/cmd_form_clan_phone.png) |
| Fortress / castle | List of fortresses or castles | ![Fortress registration](../img/cmd_form_fort_phone.png) |
| Siege plan | List of saved siege plans (or "no saved plans (Fortresses / Castles tab)") | ![Siege plan](../img/cmd_form_siegeplan_phone.png) |
| Item | Text field: type 2+ letters of an item name (or its id); suggestions show id and name; the chosen item's name appears under it | ![Buy item](../img/cmd_form_item_phone.png) |
| Optional character | List with "— none —" first: empty = everyone who hears it | ![Sell](../img/cmd_form_optional_phone.png) |
| Free text / file name | Plain text field, sometimes with an example in grey | ![Fight in a zone](../img/cmd_form_zone_phone.png) |

Lists that come from the server (bosses, Kamalokas, dungeons, gatekeepers, sieges) show "loading…" for a moment the first time; they are
kept for 5 minutes.

![A required argument is missing](../img/cmd_form_missing_phone.png)

1. **Fill in: &lt;field&gt;** - a required argument is empty. 2. **Send** stays grey.

### Targets

![Target picker on a phone](../img/cmd_targets_phone.png) ![Target picker on a desktop](../img/cmd_targets_desktop.png)

1. **All parties** - every party (with the number of characters).
2. **Clan &lt;name&gt;** - every clan member we play.
3. **Party &lt;name&gt;** - a party (with its size). Picked chips are drawn pressed.
4. **▸ Characters** - opens the list of single characters, grouped by party (with "(n picked)").
5. **A character** - with class icon and level; offline characters are dimmed.

Only the kinds of target that make sense for the command are offered (for example `/trade` only offers one character). The rules:

- You can pick **several** parties and characters at once. **All parties** and **Clan** stand alone: picking one of them drops the rest.
- Commands made for exactly one party or one character take only one.
- A command that does not allow "several characters" lets you pick only one character (picking another replaces it).
- **Clan leader** commands have a fixed target: the clan leader (shown as a fixed chip, "Only the clan leader's window acts on this command").
- **PC** commands have no target: "Runs on this PC (no character target)".
- **Client mode** needs exactly one character.
- The form starts with a sensible target: the party or character whose sheet you came from; for a character-only command opened from a party
  sheet, that party's leader; otherwise the target you used last (remembered in this browser), or the main party.

![Nothing picked](../img/cmd_nobody_phone.png)

1. **Pick who gets it.** - no target yet; Send stays grey.

### Preview (dry run)

![Preview checked by the server](../img/cmd_preview_phone.png) ![Preview on a desktop](../img/cmd_preview_desktop.png)

While you fill in the form, the dashboard asks the server what it **would** send (a dry run: nothing reaches the game). The preview shows
one line per send:

1. **The exact text**, for example `#!level`. Swarm commands get a `#` in front: that makes the line party chat.
2. **How and from whom**: `party chat from <leader>` (a party target: the whole party hears it once), `party chat from <name>` with
   "only &lt;name&gt;'s own window obeys" (a single character), `normal chat from (no party)` (a character without a party), `L2Swarm command on <name>`
   (a `/` command, one line per character), `logout on` / `login on` (account actions). A red **offline** marks characters that will
   not get it.
3. **Summary** - number of sends, how many characters are affected, how many are offline, who is busy, **checked by the server** when the dry
   run answered (otherwise the page's own estimate), and who acts: "Only the party leader acts; the others follow him.", "Every character that
   hears it acts." or "Each character that hears it acts for itself."

![L2Swarm command for a whole party](../img/cmd_preview_multi_phone.png)

1. A `/` command to a party: one line per member.

If the server refuses the order (unknown command, wrong file for `/config load` ...), a red line `Server: <reason>` appears above the
preview. Dashboard actions (client mode, PC) show only their label, for example `client mode: in-game → Edwyn`.

![Client mode form](../img/cmd_form_clientmode_phone.png) ![PC action form](../img/cmd_form_noargs_pc_phone.png)

## Confirm and send

Press **Send**. A question names exactly what happens:

![Confirmation on a phone](../img/cmd_confirm_phone.png) ![Confirmation on a desktop](../img/cmd_confirm_desktop.png)

```
Send to the WHOLE party Aldric (9 characters):

   Level (Giran -> hunting spot)   (!level)

Busy right now and will change orders: ...
Offline (will not get it): ...

Continue?
```

The target part reads `the WHOLE party <name> (n characters)`, `<name> only`, `ALL parties (n characters)` or `the clan (n characters)`;
several targets are joined with `+` and the total is added:

![Confirmation for several targets](../img/cmd_confirm_multi_phone.png)

### Destructive commands

![Destructive command form](../img/cmd_destructive_phone.png) ![Destructive command form on a desktop](../img/cmd_destructive_desktop.png)

1. The **destructive** chip. 2. The button reads **Send… (confirm twice)**.

After the normal question, a second one asks you to type `YES`:

![Typed confirmation](../img/cmd_destructive_yes_phone.png) ![Typed confirmation on a desktop](../img/cmd_destructive_yes_desktop.png)

`DESTRUCTIVE: <command>`, the description, and `Type YES to send it to n characters.` Anything other than `YES` (capital letters) means it is
**not sent**, and the form says so. A command you typed by hand gets the same second question when the server marks it destructive.

### PC and client-mode actions

These do not go through chat:

- **Start / Restart / Stop L2Swarm, Deploy swarm.js**: first `<title>? <description> Continue?`, and for the destructive ones (restart,
  stop, deploy) a second `<title> is destructive. Type YES to do it now.` They run the same task as the buttons on the [PC tab](pc.md).
- **In-game / Out of game**: the same question as on the character page (`Switch <name> to IN-GAME? ...`). You must pick exactly one
  character, otherwise the form says "pick exactly one character".

![PC action confirmation](../img/cmd_dlg_system_phone.png) ![Client mode confirmation](../img/cmd_dlg_clientmode_phone.png)

## Result

After sending, the result appears at the bottom of the form, and the same text goes to the [message line](../03-dashboard-basics.md#message-line):

![Result: sent](../img/cmd_result_ok_phone.png) ![Result on a desktop](../img/cmd_result_ok_desktop.png)

- **✓ green**: `<command> → <target>: n/m sent`. When everything went out the window closes by itself after about 1.5 seconds.
- **⚠ yellow**: some sends failed; one line per failed character with the reason. The window stays open.
- **✗ red**: nothing was sent, with the reason (for example "not sent (no YES)", "nobody to send it to", or the server's refusal).

![Result: not sent](../img/cmd_result_noyes_phone.png)

"Sent" means the line reached that character's game window. Whether it could carry it out shows a few seconds later in its notes (Parties
tab, character page, "What they do").

A sent order is added to **Recent** (free-text sentences and PC / client-mode actions are not), and a single target is remembered as the
next default.

### Free text

![Free text sent](../img/cmd_result_text_phone.png)

A free-text order ("Tell them ...", listed under Debug / Reports) is translated by the server only when you press Send, so the form
cannot show the real command in advance:

1. The preview shows a red line `Server: a command starts with ! (swarm), / (L2Swarm) or @ (account)` and, below it, your sentence as
   typed. For free text you can ignore that red line (the description's "The preview shows what it became" is not true here: the result
   does).
2. The **result** shows the command the server made of it (here `!supply`), and so does the message line. If the server does not
   understand the sentence, the result says `don't understand "..."` with a list of phrases it knows (see the
   [command reference](../05-commands.md#free-text)).

## How an order travels

You do not need this to use the command center, but it explains the preview:

- **`!` swarm commands** go as party chat (`#!command`) through L2Swarm's control interface (MCP): once per party, from the party leader's
  window; for a single character from that character's window. A character without a party gets it as normal chat. Our script in every
  window of the party reads the line and acts according to the command's rule (leader / each / self / clan leader).
- **`/` L2Swarm commands** are typed into each chosen character's L2Swarm chat box, one by one.
- **`@login` / `@logout`** open or close the account in L2Swarm.
- **File channel:** when L2Swarm's control interface does not answer at all, swarm commands (and the simple `/` commands the script can do
  itself) are written to `Logs\cmd\inbox.json` instead. Every window reads that file once a second and confirms what it did. The result then
  says `sent via file channel - <why>`. Commands that need L2Swarm itself (`/config`, `/sellitem`, `/partyinfo`, `@login`, `@logout` ...)
  fail with "needs MCP". An order that timed out after the interface had answered is **not** sent again (it may still run), so do not resend it
  at once.
- Every sent order is written to `Logs\dashboard_commands.log` (time, command, target, how many went out, errors).

### What the server checks

The server checks every order again, whatever the page did:

- the command word must be in the catalog (`!` words the script knows, `/` words L2Swarm knows), one line, at most 300 characters;
- a command that names a password is refused; passwords are never read or set;
- `/config set <key> <value>`, `/config save` (never with a file name: saving to another file would re-point the account) and
  `/config load <file.xml>` (the file must exist in `Settings` and belong to that character);
- the targets must exist (`party:<leader>`, `char:<name>`, `chars:<a>,<b>`, `all`, `clan`);
- a **destructive** command is refused (HTTP 409, "confirm it explicitly in the command center") unless the page sent the typed confirmation.

For scripts and tools: `POST /api/command { cmd | text, targets: [...], confirmDanger, dryRun }` sends (or, with `dryRun: true`, only
plans) an order; `GET /api/commands` returns the catalog, the parties and the clan. The page itself loads the catalog from `/commands.js`.

## Notes

- The command list lives in one file, `Dashboard/commands.js`. A new command must exist in the script (or in L2Swarm) before it is added
  there; then it appears in the search, on the sheets, in the server checks and, after `node docs/guide/tools/build_commands.js`, in the
  command reference.
- If the dashboard server is older than the page (it does not answer `/api/commands`), the command center still sends `!` commands one
  target at a time; `/` and `@` commands then fail with "the dashboard server runs the old code: restart Dashboard/server.js ...".
- Recent orders, open categories and the last target are kept in this browser only.
- **Park at the safe spot** (`!safespot`, Move sheet): the leader stops leveling, the party walks to the hunting spot's safe-spot route
  (drawn in the spot editor) or, without one, to the nearest point out of every aggressive monster's range, and everyone stands still
  (defend only, no new pulls) until your next order. Use it instead of parking in town before you close the client for an update. It is
  refused inside a raid or an instance (use Retreat there); Start or any other order ends the hold.
