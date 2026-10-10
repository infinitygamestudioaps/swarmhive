# Dashboard commands — inventory (command center, 2026-10-08)

Generated from `Dashboard/commands.js` by `node docs/plan/tools/dashboard_commands_doc.js` — edit the catalog, then re-run this.
Every command below can be given from the dashboard: the **search field** at the top (Ctrl+K or "/"; finds characters, parties, commands, pages)
or the **Commands** button on a party card / character page (command sheet by category). Every order shows a preview of exactly what is sent
and asks first (who gets it, how many characters, who is busy); destructive ones need a second, typed YES and the server refuses them without it.

How a command travels (server.js `commandPlan`):
- **! swarm commands** (Scripts_dev/swarm.js `handleSay`): party chat. Party target = once, from the party leader (the whole party hears it);
  character target = from that character (only its own window obeys — a leader's own line is heard by his party). A character without a party
  (Dagger1) gets it as normal chat. All = every party leader; clan = every clan member.
- **/ L2Swarm chat-box commands** (CLAUDE.md §3): sent to every chosen character one by one (`run_account_command`); a party = each member.
- **@login / @logout**: MCP open_account (the character's config) / close_account.
- Passwords are never read or set (any / command naming a password is refused); `/config save` never takes a file name (it would re-point the account).

Counts: 134 catalog entries — 92 swarm (67 distinct !words = every !command swarm.js handles except the internal !ready),
34 L2Swarm chat-box (32 distinct /words), 8 dashboard actions.
Safety: 21 safe, 99 confirm, 14 destructive.

## Move / Travel

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `!town {town}` | <town>: town | party leader acts, party follows | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Town teleport (.town): The leader stops hunting, fights off / steps away, regroups and uses .<town> (the server takes the party along). Giran = the safe regroup trip. A member alone ports itself only when the leader is gone. |
| `!gk {dest}` | <dest>: gk | party leader acts, party follows | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Gatekeeper teleport: Walk to the nearest gatekeeper and click the link containing this text (the leader clicks, the server brings the party, followers check). |
| `!goto {place}` | <place>: text | every window that hears it | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Walk to…: Walk to an NPC, a saved place (!mark) or "x y". Party target = every member walks. |
| `!goto npc {npc}` | <npc>: text | party leader acts, party follows | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Go to an NPC (anywhere)…: NPC atlas (Scripts/data/npc_atlas.json): the leader takes the party to the best matching NPC — .town to its town, the dungeon way in + room by room (floor teleporters on the way), or teleport near + walk — and opens its dialog. By id (#30487), name (Penelope), role (grocer, gatekeeper, warehouse, priest of dawn, class master, blacksmith … + optional town: "grocer dion") or what it offers ("teleport:Cruma Tower 2nd floor"). Add a character name at the end for that character alone. |
| `!park[ {place}]` | <place>: park | every window that hears it | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Park in Giran: Everyone stops, goes to Giran, walks the recorded route to the place and waits for orders (leveling stays paused). |
| `!soe` | — | every window that hears it | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Retreat (escape to town): Everyone (leader too) runs out of the fight and uses .townname (never a scroll). Not inside a raid: raids are fought to the end. |
| `!regroup` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Regroup (home, restock, back): Old regroup: everyone home, restock, back together. In leader mode !level / !supply are the normal way. |
| `!return` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Return (restock in town, back together): Old regroup without going home first. |
| `!mark {name}` | <name>: text | party leader acts, party follows | party | safe | palette · party sheet | Save leader position as a place: The leader saves where he stands; "Walk to…" can use the name later. |
| `!places` | — | party leader acts, party follows | party | safe | palette · party sheet | List saved places: The leader lists the saved places in party chat. |
| `/moveto {x} {y}[ {z}]` | <x>: number, <y>: number, [z]: number | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Move to x y (L2Swarm): L2Swarm's own move command (no team logic). |
| `/run` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Run: Switch to running. |
| `/walk` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Walk (slow): Switch to walking speed. |
| `/unstuck` | — | each chosen character (L2Swarm) | one character, several characters | **destructive** (confirm + typed YES; server refuses without it) | palette · character sheet | /unstuck (to the nearest town): Last resort: the server sends the character to a town after a long cast. Breaks off whatever it does. |

## Fight

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `!stop` | — | every window that hears it | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | STOP everything: Everyone idle + stop combat. The leader stays stopped (no auto-leveling) until the next order. |
| `!kill {name}` | <name>: text | every window that hears it | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Kill a monster by name: Everyone who hears it attacks the nearest monster with that name (within 4000). |
| `!assist {who}` | <who>: char | party leader acts, party follows | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Help a character (party goes there): The leader takes the team to that character and hunts around him until "!assist off". |
| `!assist off` | — | party leader acts, party follows | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Stop helping (normal spots): Back to the normal hunting spots / follow the leader. |
| `!ov {name} cast {skill}[ {on}]` | <name>: char, <skill>: number, [on]: text | each character for itself ([name] = only that one) | one character | needs confirm | palette · character sheet | Override: cast a skill: That character casts the skill once (skill id), on: boss \| focus \| self \| <teammate> (default: its target / the boss). |
| `!ov {name} use {item}` | <name>: char, <item>: number | each character for itself ([name] = only that one) | one character | needs confirm | palette · character sheet | Override: use an item: That character uses the item once (item id): Mana Potion 728, Greater Healing Potion 1061 (and 1539), CP potions, scrolls. |
| `!ov {name} target {on}` | <name>: char, <on>: text | each character for itself ([name] = only that one) | one character | needs confirm | palette · character sheet | Override: target: That character selects boss \| focus \| <name> (a teammate or a monster in sight). |
| `!ov {name} attack[ {on}]` | <name>: char, [on]: text | each character for itself ([name] = only that one) | one character | needs confirm | palette · character sheet | Override: attack: That character attacks boss \| focus \| <monster> (default: the focus, else the boss). |
| `!ov {name} stop` | <name>: char | each character for itself ([name] = only that one) | one character | needs confirm | palette · character sheet | Override: stop attacking: That character stops its attack / cast and drops the target once (its raid routine may pick a target again). |
| `!ov {name} move {to}` | <name>: char, <to>: text | each character for itself ([name] = only that one) | one character | needs confirm | palette · character sheet | Override: move to: That character walks next to tank \| boss \| <teammate>. |
| `!ov {name} res {who}` | <name>: char, <who>: char | each character for itself ([name] = only that one) | one character | needs confirm | palette · character sheet | Override: resurrect a teammate: That character resurrects the dead teammate (its res skill; a Scroll of Resurrection only when it has no res skill). |
| `!ov {name} soe` | <name>: char | each character for itself ([name] = only that one) | one character | needs confirm | palette · character sheet | Override: Scroll of Escape NOW: That character reads a Scroll of Escape at once (an explicit order; the bots themselves only use .townname). A hit can interrupt the cast. |
| `!ov {name} drop {obj}[ {count}]` | <name>: char, <obj>: number, [count]: number | each character for itself ([name] = only that one) | one character | **destructive** (confirm + typed YES; server refuses without it) | palette · character sheet | Override: DROP an item: That character drops the item (inventory OBJECT id) on the ground. Never equipped or quest items (it refuses). Destructive: typed YES. |
| `!buff` | — | every window that hears it | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Rebuff (board buffs, one at a time): Forced rebuff queue; characters that already have their buffs skip it. |
| `!buffauto {on}` | <on>: onoff | every window that hears it | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Auto-rebuff on/off: Automatic rebuff rotation on or off (until a script reload). |
| `!zone {file}` | <file>: zmap | party leader acts, party follows | party | needs confirm | palette · party sheet | Fight in a .zmap zone: The leader loads a Settings\<file>.zmap as its combat zone. |
| `/attack` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Attack target: Attack the current target (L2Swarm). |
| `/attackforce` | — | each chosen character (L2Swarm) | one character, several characters | **destructive** (confirm + typed YES; server refuses without it) | palette · character sheet | Force attack target: Force attack (works on players: PvP flag / karma risk). |
| `/attackround` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Attack around: Attack monsters around (L2Swarm). |
| `/target {name}` | <name>: text | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Target by name: Select a target by name. |
| `/startcombat` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Start L2Swarm combat: L2Swarm's own combat loop. Members use script attacks since the 2026-10-08 deadlock (patch v6 installed, still careful). |
| `/stopcombat` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Stop L2Swarm combat: Stop L2Swarm's combat loop. |
| `/sit` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Sit: Sit down (a sitting character cannot walk). |
| `/stand` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Stand up: Stand up. |

## Party

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `!status` | — | every window that hears it | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Status report: Everyone reports role, mode, HP/MP, buffs in party chat. |
| `!collect` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Collect adena to the leader: Members trade adena above their keep (2M <40, 2.5M 40-75, 3M 76+) to their leader (team trades are pre-approved). |
| `!cabinet {setting} {on}` | <setting>: cabinet, <on>: onoff | every window that hears it | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Cabinet setting on/off: Alt+B -> Cabinet -> Settings: toggle a row (e.g. Forward Drop). |
| `/partyinfo` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Party info: L2Swarm party info (shows in the bot's log). |
| `/invite {name}` | <name>: char | each chosen character (L2Swarm) | one character | needs confirm | palette · character sheet | Invite to party: Invite a player to this character's party (the bots re-invite their own team by themselves). |
| `/leave` | — | each chosen character (L2Swarm) | one character, several characters | **destructive** (confirm + typed YES; server refuses without it) | palette · character sheet | Leave party: Leave the party (the leader re-invites teammates within ~10 s). |
| `/socialyes` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Social: yes: Social action. |
| `/socialdance` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Social: dance: Social action. |
| `/socialhello` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Social: hello: Social action. |
| `/ignore {name}` | <name>: text | each chosen character (L2Swarm) | one character, several characters | needs confirm | palette · character sheet | Ignore a player: Block a player's chat. |
| `/trade` | — | each chosen character (L2Swarm) | one character | **destructive** (confirm + typed YES; server refuses without it) | palette · character sheet | Trade with target: Open a trade with the current target. Trades with players outside our teams need your OK. |

## Supply / Items

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `!supply` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Supply run (Giran): Leader takes the team to Giran, buys SoE/SoR/shots/spirit ore/potions for everyone at Helvetia and hands it out (also gear upgrades + enchants when enabled). |
| `!restock` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Restock (= supply in leader mode): Same as Supply in the leader-controlled design. |
| `!sell[ {name}]` | [name]: char | each character for itself ([name] = only that one) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Sell marked items + junk: Walk to the nearest merchant (towns only) and sell what Scripts/data/sell_list.json marks + junk. |
| `!gearup[ {name}]` | [name]: char | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Better gear now: Leader takes the team to Giran; everyone (or only <name>) buys + puts on the upgrades, then leveling resumes. |
| `!gearplan[ {name}]` | [name]: char | each character for itself ([name] = only that one) | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Gear plan (dry run): What each would buy (never buys) -> Logs/gear_plan_<name>.json + party chat. |
| `!upgrade[ {name}]` | [name]: char | each character for itself ([name] = only that one) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Buy + wear upgrades here (in Giran): Must stand in Giran. Buys and equips the planned upgrades. |
| `!stash[ {name}]` | [name]: char | each character for itself ([name] = only that one) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Warehouse: deposit what I do not use: Private warehouse at Taurin (Giran, recorded route): crafting materials (not the crafter), recipes it cannot use, seal stones, ancient adena, L2Day letters, old gear nobody plans. Consumables, quest items, upgrades stay. A leader / solo character outside Giran goes there first; members must be in Giran. Fee 30 adena per item. UNTESTED live (2026-10-09). |
| `!stashplan[ {name}]` | [name]: char | each character for itself ([name] = only that one) | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Warehouse plan (dry run): What would go into the warehouse and why (deposits nothing) -> Logs/stash_plan_<name>.json + party chat. |
| `!enchant[ {name}]` | [name]: char | each character for itself ([name] = only that one) | party, one character, all parties, clan, several characters | **destructive** (confirm + typed YES; server refuses without it) | palette · party sheet + character sheet | Enchant worn gear (safe limit): Enchant real worn pieces to the safe limit (+3, full armor +4) with the scrolls in the bag. Never Common items. |
| `!dyeplan[ {name}]` | [name]: char | each character for itself ([name] = only that one) | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Dye plan (dry run): Which symbol would be drawn next (buys nothing). |
| `!dyes[ {name}]` | [name]: char | each character for itself ([name] = only that one) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Buy dyes + draw symbol (Giran): Must stand in Giran. UNTESTED. |
| `!shopscan {name}` | <name>: char | each character for itself ([name] = only that one) | party, one character | safe | palette · party sheet + character sheet | Scan the Giran equipment shops: That character reads every Giran equipment shop (never buys) -> Logs/shopscan.json. |
| `!soul get` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Soul crystals: fetch (Gideon, Oren): Lvl 40+: the leader takes the team to Gideon for free crystals. |
| `!soul store` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Soul crystals: store finished ones: Finished crystals into the Giran warehouse. |
| `!soul` | — | every window that hears it | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Soul crystals: status: Everyone reports its crystals in party chat. |
| `!soul {on}` | <on>: onoff | every window that hears it | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Soul crystals: use on/off: Crystal use on or off (until a reload). |
| `/buyitem {id} {count}` | <id>: item, <count>: number | each chosen character (L2Swarm) | one character, several characters | needs confirm | palette · character sheet | Buy item (open shop): L2Swarm buy from the open NPC shop (the bots use their own buy packets). |
| `/sellitem {id} {count}` | <id>: item, <count>: number | each chosen character (L2Swarm) | one character | **destructive** (confirm + typed YES; server refuses without it) | palette · character sheet | Sell item (open shop): L2Swarm sell to the open NPC shop (often ignored by L2Toggle; !sell is the working way). |
| `/clicklink {text}` | <text>: text | each chosen character (L2Swarm) | one character, several characters | needs confirm | palette · character sheet | Click dialog link: Click a link with this text in the open NPC dialog. |

## Leveling / Spots

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `!level` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Level (Giran -> hunting spot): Regroup in Giran, the leader picks a spot for the lowest level (or the party spot chosen on the Parties tab) and teleports the team. |
| `!autolevel` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Auto-level (same as Level): In leader mode = !level. |
| `!autolevel solo` | — | every window that hears it | one character, several characters | needs confirm | palette · character sheet | Auto-level solo: This character levels on its own (no party logic). |
| `!autolevel stop` | — | every window that hears it | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Stop leveling: Stop the leveling loop (no full stop). |
| `!dungeon {dungeon}` | <dungeon>: dungeon | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Level inside a catacomb / necropolis: The team levels in that dungeon until "!dungeon off" (Seven Signs: Dawn needed). |
| `!dungeon off` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Dungeon off (normal spots): Back to the normal hunting spots. |
| `!classchange[ {name}]` | [name]: char | each character for itself ([name] = only that one) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Class change (Community Board): Alt+B -> Career -> Professions — ONLY the next step of each character’s APPROVED class plan (Classes page, Scripts/data/class_plans.json) once its level allows it (20/40/76). No plan / not approved = refused (said in party chat). The leader also orders it by himself for approved plans. |
| `!classplan[ {name}]` | [name]: char | each character for itself ([name] = only that one) | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Class plan status (report): Each character says its class plan in party chat: missing / needs-approval / waiting <class> @<level> / ready <class> / done, with the path. Plans are made and approved on the Classes page. |

## Raids / Kamaloka

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `!mission raid {boss}` | <boss>: boss | party leader acts, party follows | party | needs confirm | palette · party sheet | Raid a boss: Travel, clear the area, countdown, pull. Never escapes: fights to the end. |
| `!mission kamaloka[ {lvl}]` | [lvl]: kamaloka | party leader acts, party follows | party | needs confirm | palette · party sheet | Kamaloka: Run a Kamaloka (empty = the one that fits). |
| `!mission stop` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Stop mission: Abort the running mission trip. |
| `!raidhunt[ {min} {max}]` | [min]: number, [max]: number | party leader acts, party follows | party | needs confirm | palette · party sheet | Raid hunter: Take the bosses that fit, lowest first, until a wipe/timeout. Optional level range. |
| `!raidhunt stop` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Stop raid hunter: During a fight: after the current boss. |
| `!jointraid {boss} with {parties}[ cc {cc}]` | <boss>: boss, <parties>: parties, [cc]: party | party leader acts, party follows | party | needs confirm | palette · party sheet | Joint raid (several parties): Order the MAIN party: it leads, the listed parties join on the same boss (optional Command Channel leader). |
| `!routetest {boss}` | <boss>: boss | party leader acts, party follows | party | needs confirm | palette · party sheet | Route test to a boss (no raid): Everyone .townname, then walks the boss's saved route. |
| `!loot` | — | every window that hears it | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Loot the ground: Members pick up everything within 1500 (60 s), e.g. after a raid. |
| `!raidbuff` | — | party leader acts, party follows | party | needs confirm | palette · party sheet | Boss rebuff wave: Buff wave without stopping (doomcryer Buff Party + casters Mystic). |
| `!draintest` | — | every window that hears it | party | needs confirm | palette · party sheet | Destroyer drain test: TEST outside a town: destroyers drain each other < 30 % then Frenzy & co; healers wait. |

## Clan / Sieges

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `!clanlevel` | — | clan leader only | one character | needs confirm | palette · character sheet (clan leader / his party) | Clan level up now: The clan leader raises the clan level if SP/adena/items allow. |
| `!clanlevel auto {on}` | <on>: onoff | clan leader only | one character | needs confirm | palette · character sheet (clan leader / his party) | Clan level automatic on/off: Automatic clan level-ups. |
| `!clanquest {quest}[ {step}]` | <quest>: clanquest, [step]: text | clan leader only | one character, party | needs confirm | palette · party sheet + character sheet (clan leader / his party) | Clan quest step: Run the next (or a given) step of a clan level quest; "reset" starts over. Hunt steps are run by a party leader. |
| `!clanskill` | — | clan leader only | one character | needs confirm | palette · character sheet (clan leader / his party) | Learn the clan focus skill: At Gesto (clan leader). |
| `!clanwh` | — | clan leader only | one character | safe | palette · character sheet (clan leader / his party) | Look in the clan warehouse: The clan leader opens the clan warehouse and reports what is in it. |
| `!clancreate` | — | clan leader only | one character | needs confirm | palette · character sheet (clan leader / his party) | Create the clan: Only when there is no clan yet (the code refuses a second clan). |
| `!siege plan {plan}` | <plan>: siegeplan | party leader acts, party follows | party | needs confirm | palette · party sheet | Siege: run a saved plan now: Order the plan's main (CC) party. Plans: Fortresses / Castles tab. |
| `!siege fort {fort}` | <fort>: fort | party leader acts, party follows | party | needs confirm | palette · party sheet | Siege a fortress now: Ad-hoc fortress siege with this party. UNTESTED. |
| `!siege castle {castle}` | <castle>: castle | party leader acts, party follows | party | needs confirm | palette · party sheet | Siege a castle now: Ad-hoc castle siege with this party. UNTESTED. |
| `!siege stop` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Stop the siege: Stop a running siege. |
| `!siegereg fort {fort}` | <fort>: fort | clan leader only | one character | needs confirm | palette · character sheet (clan leader / his party) | Register for a fortress siege: The clan leader registers at the Suspicious Merchant (the first clan pays 250,000 adena). |
| `!siegereg castle {castle}` | <castle>: castle | clan leader only | one character | needs confirm | palette · character sheet (clan leader / his party) | Register for a castle siege: The clan leader registers at the castle Messenger. |

## Seven Signs

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `!dawn` | — | party leader acts, party follows | party, all parties, clan | needs confirm | palette · party sheet | Sign up with the Lords of Dawn: The leader takes the team to the Priest of Dawn in Giran (always Dawn, never Dusk). |

## Bot control

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `/enablebot` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Bot ON: Enable the L2Swarm bot (follow, assist, auto skills). |
| `/disablebot` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Bot OFF: Disable the L2Swarm bot (the script keeps running). |
| `/startpoints` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Start route points: L2Swarm route points on. |
| `/stoppoints` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Stop route points: L2Swarm route points off. |
| `/runmacro {name}` | <name>: text | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Run a macro: Run an L2Swarm macro by name. |
| `/config set {key} {value}` | <key>: text, <value>: text | each chosen character (L2Swarm) | one character, several characters, party | **destructive** (confirm + typed YES; server refuses without it) | palette · party sheet + character sheet | Config: set a value: Live config change (then "Config: save" to keep it). Passwords can never be set here. |
| `/config save` | — | each chosen character (L2Swarm) | one character, several characters, party | needs confirm | palette · party sheet + character sheet | Config: save: Save the live config to its own XML (never to another file). |
| `/config load {file}` | <file>: text | each chosen character (L2Swarm) | one character | **destructive** (confirm + typed YES; server refuses without it) | palette · character sheet | Config: load XML: Load a config file from Settings (must be this character's own file). |

## Client mode / Account

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `client mode: in-game` | — | dashboard | one character | needs confirm | palette · character sheet | In-game (l2.exe client): L2Swarm Hook: logs out, starts l2.exe, logs in through the client (~2 min, 1-2 GB RAM). Only ONE hooked client at a time. |
| `client mode: out of game` | — | dashboard | one character | needs confirm | palette · character sheet | Out of game (no client): Close the l2.exe client and play out of game again. |
| `@logout` | — | dashboard | one character, several characters | **destructive** (confirm + typed YES; server refuses without it) | palette · character sheet | Log out (close the account): MCP close_account: the character leaves the game; a character left in a hunting ground stays in the world and can die. |
| `@login` | — | dashboard | one character, several characters | needs confirm | palette · character sheet | Log in (open the account): MCP open_account with the character's config file. |

## PC / L2Swarm

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `L2Swarm start` | — | dashboard | PC | needs confirm | palette (search) · PC tab | Start L2Swarm: Through the elevated task; logs everyone in 20 s apart. |
| `L2Swarm restart` | — | dashboard | PC | **destructive** (confirm + typed YES; server refuses without it) | palette (search) · PC tab | Restart L2Swarm: Every restart costs ~4 min of logins and breaks raids. Never during a raid/Kamaloka. |
| `L2Swarm stop` | — | dashboard | PC | **destructive** (confirm + typed YES; server refuses without it) | palette (search) · PC tab | Stop L2Swarm: Everyone goes offline. Send the parties to a town first. |
| `deploy swarm.js` | — | dashboard | PC | **destructive** (confirm + typed YES; server refuses without it) | palette (search) · PC tab | Deploy swarm.js: Copies Scripts_dev/swarm.js live (memory leak per reload; refused during raids; may restart L2Swarm above the size limit). |

## Debug / Reports

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `!navtest {x} {y}[ {name}]` | <x>: number, <y>: number, [name]: char | every window that hears it | one character, party | needs confirm | palette · party sheet + character sheet | Navigation test: Walk test with logging -> Logs/navtest_<name>.log (disables the bot for 60 s). |
| `!escapetest[ {name}]` | [name]: char | every window that hears it | one character, party | needs confirm | palette · party sheet + character sheet | Escape test (no teleport): Runs the real escape on one character in TEST mode: CC on the nearest monster (only within 900), run to the nearest safe spot, wait for no hits, then STOPS before .townname / Scroll of Escape. Live escape box + map on the Parties tab; result in Logs/escape.log. Refused in raids / Kamaloka / missions and below 70 % HP. No name = the target character (party target = its leader). |
| `!escapetest {name} full` | <name>: char | every window that hears it | one character, party | **destructive** (confirm + typed YES; server refuses without it) | palette · party sheet + character sheet | Escape test FULL (.townname / Scroll of Escape): Like "Escape test" but goes all the way: .townname, and a Scroll of Escape when .townname is refused — the character ends up in a town. |
| `!dumpskills` | — | every window that hears it | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Dump skills to a file: -> Logs/skills_<name>.json |
| `/loc` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Location (/loc): Prints the position in the bot log. |
| `/time` | — | each chosen character (L2Swarm) | one character | safe | palette · character sheet | Game time: Server time message. |
| `/instancezone` | — | each chosen character (L2Swarm) | party, one character, all parties, clan, several characters | safe | palette · party sheet + character sheet | Instance zone info: Which instances are locked (Kamaloka re-entry times). |

## Legacy (off in leader mode)

| Command | Args | Who acts | Target scope | Safety | Where in the UI | What it does |
|---|---|---|---|---|---|---|
| `!farm` | — | every window that hears it | party | needs confirm | palette · party sheet | Farm at the camp point: Old farm mode: tank pulls to the camp, others fight in a box (set the camp first). |
| `!camp` | — | party leader acts, party follows | party | needs confirm | palette · party sheet | Camp here (leader position): The leader broadcasts his position as the camp point. |
| `!setcamp {x} {y} {z}` | <x>: number, <y>: number, <z>: number | every window that hears it | party | needs confirm | palette · party sheet | Set camp point: Camp point by coordinates. |
| `!go[ {boss}]` | [boss]: boss | every window that hears it | party | needs confirm | palette · party sheet | Raid prep (!go): Old raid prep: destroyers drain + Frenzy, then the leader posts !raid. Use "Raid a boss" instead. |
| `!raid[ {boss}]` | [boss]: boss | every window that hears it | party | needs confirm | palette · party sheet | Raid sequence now (!raid): Old: every role runs its raid routine at the current spot. |
| `!career` | — | every window that hears it | one character | needs confirm | palette · character sheet | Career (solo 1-40): Off in leader mode (answers "switched off"). |
| `!escort` | — | party leader acts, party follows | party | needs confirm | palette · party sheet | Class-quest escort: Off in leader mode; class quests removed 2026-10-03. |
| `!quest[ {text}]` | [text]: text | every window that hears it | one character | needs confirm | palette · character sheet | Quest: Off in leader mode. |
| `!queststop` | — | every window that hears it | party, one character, all parties, clan, several characters | needs confirm | palette · party sheet + character sheet | Stop quest: Stops a running quest. |
| `!gear` | — | party leader acts, party follows | party | needs confirm | palette · party sheet | Gear share (!gear): Off in leader mode. |
| `!shop` | — | every window that hears it | one character | needs confirm | palette · character sheet | Shop trip (!shop): Off in leader mode. |
| `!kamaloka` | — | every window that hears it | party | safe | palette · party sheet | !kamaloka (placeholder): Old placeholder ("not built"); use Raids -> Kamaloka. |

## Other dashboard actions (their own tabs / endpoints, unchanged)

| Action | Endpoint | Scope | Safety | Where |
|---|---|---|---|---|
| Party quick buttons Status / Level / Supply / Collect / Class / Buff / Stop + task dropdown "Do" | POST /api/command | party / character | confirm | party card, character page (kept) |
| Raidhunt / stop raidhunt, Raid <boss> | POST /api/command | party | confirm | Raid bosses tab, raid page |
| Kamaloka run, daily Kamaloka on/off | POST /api/command, POST /api/daily | party | confirm | Kamaloka tab |
| Siege plans (save / delete / status), siege now, register | POST /api/sieges, /api/command | clan / party | confirm | Fortresses / Castles tabs (sieges.js) |
| Clan name, active clan quests, skill focus, clan warehouse, clan event (joint raid) | POST /api/clan, /api/command | clan | confirm | Clan tab |
| Hunting spot per party, tactics (hunting pairs) | POST /api/partyspot, /api/tactics | party | confirm | Parties tab |
| Zones, spots, rooms, raid routes, Giran town routes | /api/zones, /api/route, /api/roomroute, /api/townroute | data files | confirm | Zones / Spots / Rooms / Raid / Teleports tabs |
| Sell list, gear preferences, soul crystal plan | /api/sell, /api/gearprefs, /api/soul | data files | safe | character page, Gear, Crystals tabs |
| Client mode in-game / out of game | POST /api/clientmode | one character | confirm | character page + command center (Client mode) |
| Transfer adena / items X -> Y | POST /api/transfer | two characters | needs confirm (trades) | Accounts tab |
| Create character / academy account | POST /api/newchar, /api/newaccount | account | confirm (password stored encrypted, never shown) | Accounts tab |
| L2Swarm start / restart / stop, deploy swarm.js | POST /api/system | PC | restart/stop/deploy destructive | PC tab + command center (PC / L2Swarm) |

## Not exposed on purpose
- MCP low-level game actions (`send_game_action`: raw_packet, destroy_item, drop_item, crystallize, enchant packets, mail, trades with outsiders):
  Claude-only, each needs the user's explicit OK (CLAUDE.md §4). The dashboard's `/trade` (destructive) is the only trade opener.
- `manage_account_config modify Password` / any password field (never).
- `!ready` (internal: destroyers report to the leader during !go).
