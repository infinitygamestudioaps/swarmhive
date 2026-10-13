# Changelog

Every published version of the swarm package. Update with `update.cmd` (see README.md). The full story of how it was built: docs/HISTORY.md.

## v1.6.3 (2026-10-13)

- Move accounts to the new engine: Scripts/agent2.js is checked BEFORE anything is stopped and copied from Scripts_dev when an update did not deploy it (tester: every character was left with no script, ENOENT agent2.js)
- update.cmd restarts the running dashboard by itself (the new tabs did nothing until a manual restart)
- Trade tab shows the real error instead of always saying it needs a restart
- Order queue: every dashboard order is delivered exactly once with a receipt (queued, delivered, running, done or failed), survives brain and dashboard restarts, party orders reach every member - Orders button on the dashboard
- Route choice (computed path, own route, auto) for EVERY target: NPCs, quest steps, hunting areas, dungeon rooms and entrances, epic and raid bosses, with a route editor (#/routeedit) - draw, record a walk, paste /loc lines, swim points walk at swim speed
- Seven Signs: the walk to the Priest of Dawn is retried 4 times (.giran again when the party pulled the character out of town)
- Quest engine: waits 15 s for NPC pages, a same page after a click is clicked once more, menus named Quest. are recognised, class-transfer, clan and shop links are never clicked as continue
- Selling: items you mark for sale (all bots / this bot, every enchant level) are really sold - one failed sale no longer bans items for good (strikes, marked items retried after 24 h), junk is sold in every supply run (no-grade, plus lower grades when the whole team is past them), !sell says why when nothing is sold (worn, untradeable, refused before, no merchant)
- Routes into dungeons: a target inside a dungeon floor (e.g. Archon Suscepter, Cruma Tower 1st floor) is reached via the entrance NPC and the floor teleport, own routes can hold dungeon steps, a route that jumps floors is flagged red and the bots use the computed path
- route_snapz tool puts hand-drawn points on the ground
- Tillion and other targets across water: swimming is part of route finding (water zones from the datapack, swim speed, swim legs), Tillion reachable via Devil Isle
- Dashboard: the Parties page no longer jumps (fixed party order, fixed-height member rows with a cast-bar slot, fixed banner strip and map legend)
- party maps show the world map for a party outdoors next to a dungeon (dark map fixed), your own characters as targets are shown as with X instead of fighting X

## v1.6.2 (2026-10-13)

- Seven Signs: Dawn sign-up works on L2Toggle (tested live) - L2Toggle reuses link codes on every page, pages may take > 6 s under load (wait 15 s, no re-click), server message #1275 counts as signed, leveling steps aside during the visit
- 7 Signs tab: Sign up ALL parties now (to town + Dawn)
- choosing a catacomb/necropolis signs the party up by itself
- failed tries from before v1.6.0 no longer close the catacombs
- Ziggurat refusal #1303 recognised (tested live: no sign-up = refused)
- Agents (new engine): back-off after a slow tick - no more L2Swarm watchdog interrupts (ran JS for 30 s), slow-call trace in Logs/agent_slow.log
- Clan: members hand the clan level quest items to the clan leader by themselves (no follow during the trade), clan level shown consistently
- Dashboard: party cards with 9 slots (ghost rows) and equal heights, fixed-column member rows, responsive party grid
- maps show only the viewer's floor and switch map art by themselves on dungeon teleports
- cursed weapon holders shown as such
- Brain engine: a member travelling to a far / in-instance leader no longer freezes its party worker
- L2Swarm headless start option (swarm.config.json l2swarm.noUi, needs 3.8.18)
- the login check leaves mass refusals to the reconnect brake
- release zip built with tar.exe
- New engine is the DEFAULT: Scripts/data/brain_host.json "on": true + "allowAll": true = every character of swarm.config.json runs swarm.js in the dashboard's brain, its L2Swarm account only the small agent2.js (accounts added later join by themselves; "except" keeps single characters on the old engine; "on": false switches everything back)
- Fresh installs: SETUP, the dashboard's + Add account and new_account.ps1 give new-engine characters agent2.js instead of swarm.js (never both)
- update.cmd switches brain_host.json to the new default only when it is still the untouched old one (engine off, nobody listed) - a file you changed is kept; it then says what to do: restart the dashboard, move the accounts
- Dashboard PC tab -> New engine: status + Check accounts / Move accounts to the new engine (one account at a time, swarm.js stopped and checked before the agent starts); same as node docs/plan/tools/attach_agent.js --all --apply, back with --back; with L2Swarm stopped SETUP.cmd -Apply switches the account configs
- The dashboard keeps restarting swarm.js for accounts that are not moved yet; node docs/plan/tools/engine_default.js --status shows who runs where

## v1.6.1 (2026-10-13)

- Nothing is destroyed automatically any more: Newbie Guide / shadow / traveler weapons the shop refused were destroyed after a sale - they are never junk now and unsellable items are kept (gear_auto.json destroyUnsellable: true to destroy)
- Cursed weapons: the bots NEVER pick up Demonic Sword Zariche or Blood Sword Akamanah (the holder is renamed, kicked from the party, gets karma) - option Scripts/data/pickup_rules.json cursedWeapons: true
- Gear: an empty weapon slot is never kept - the recommended weapon is bought (no stray shield for 2h classes)
- 'not enough adena' instead of 'nothing better' when money is short
- Supply run: sales + gear upgrades first, then shots for the NEW weapon grade
- Room/area rotation: moves on after 90 s without monsters, rooms left 2 respawns ago count as full again
- Dashboard: Override on a field/rooms choice works again ('areaIds required')
- update.cmd: a zip install (no .git folder) downloads the newest release zip from GitHub by itself (no git, no token, resumes broken downloads)

## v1.6.0 (2026-10-13)

- New engine (brain host, off by default): swarm.js runs in the dashboard, L2Swarm only a tiny agent - far less RAM
- Quests: all 522 H5 quests, quest page with live progress per character, quest engine (repeatable quests, quest items protected), adena quest farm
- World navigation atlas: precomputed routes to every raid boss/NPC/area/room with doors, keys, timed doors, conditions
- route view everywhere (computed vs your own route, obstacles, where to get key items)
- saved route legs follow the path finder
- Your orders win: a quest/order you start is only interrupted by survival
- 7 Signs tab (opt-in per party/character)
- Town paths layer on all maps
- Skill enchant page (manual only), masterwork in gear choice, soul crystal stage plan, clan automation + nobility ranks
- Enchanting is manual only, safe +4
- Starter weapons are replaced and sold
- Commander: orders over clan chat / whisper
- Log in again button
- Dashboard 3-6x faster (gzip, ETag, no full log reads)
- 149 dashboard commands checked and fixed
- many fixes (healers target teammates, sell guard, height limit on maps)

## v1.5.4 (2026-10-10)

- Trade page (hand loot to the clan leader or any character, item picker with presets) + !handover. Clan warehouse stash (live dest setting, untradeable items stay, clear 'no clan warehouse right' message). Clan invites only for ticked characters (Clan tab). Offline status banner with the reconnect brake's reason + next try
- brake checks the login server every 2 min. Area rotation counts only monsters the party would attack. Silent Move off outside scout trips. In-game (Hook) mode works with L2Swarm 3.8.14. Core: level 40, entry cap 49, real Teleportation Cubic spot + link, routes resume from where the team stands.

## v1.5.3 (2026-10-10)

- Dashboard fixes: Gear page - the new Auto gear upgrades box no longer pushes the gear plan and its item images off the screen (moved below Our characters, folded by default with a one-line summary). All pages - item/skill icons and names load again by themselves when the game data could not be fetched (e.g. a page open while the dashboard server restarted showed ? icons until a full reload).

## v1.5.2 (2026-10-10)

- Buffers no longer recast buffs that are already up (L2Swarm reports running buff types as a per-level list
- now parsed). Toggles only in fights (raids too, and off during trades/gatekeepers). Continuous waypoint walking for everyone
- faster scout (run, speed skills, Silent Move near monsters). Gear upgrades OFF by default with weapon-type/grade/shield guards and per character locks. Song/dance cycles: Swordsinger opens, strict alternation, capped at the slots, no single recasts, MP reserve. Buff groups (improved buffs first, covered buffs skipped), buff slot check, never-keep lists. Buffs page: multi-target buffs, songs/dances off per character or party, buffing off / empty plans, every learned buff selectable (Embroider).

## v1.5.1 (2026-10-10)

- Scout keeps running when it gets hit (it used to turn back at the first hit): it only turns back in real danger (HP below 50 % or 3+ monsters close), never fights

## v1.5.0 (2026-10-10)

- Scout: !scout <boss> [character] and a 'Scout: is it up?' button on every boss page - one character travels alone to a safe look-out, checks whether the boss is up, records it (boss page, raid hunt, respawn timers) and goes back to town
- never fights
- moves as fast as it can: run mode, its own speed skills (Dash and the like) whenever ready, and its stealth toggle (Silent Move and the like) ON while aggressive monsters are near, OFF again when it is clear
- epic bosses (Core, Queen Ant, Orfen): your team is allowed - party composition (melee, few mages, no tank, few healers) is advice only, the only hard stops are the 10-clients-per-IP zone rule, a known zone level cap and the raid curse, each switchable in epic_tactics.json

## v1.4.1 (2026-10-10)

- Route editor: picking another teleport moves point 1 to that teleport's landing and re-fits the map (178 live destinations have known coordinates
- for the others the editor says so and you set point 1 by hand)
- nothing is saved until Save

## v1.4.0 (2026-10-10)

- Epic bosses Core, Queen Ant and Orfen follow the L2Toggle community guides (Scripts/data/epic_tactics.json, docs/plan/epic_guides.md, guide box with green/red requirements on the boss page
- checks party, levels, raid curse and the 10-clients-per-IP rule BEFORE any trip
- Core: half-room pull, hate aura on the 2nd wave
- Queen Ant: rush the larva, AoE the nurses
- Orfen: follow her to the nest at 50 %) - not battle-tested yet
- Hunters Village fixed: the bots now recognise every town by its .town landing, gatekeepers without a town get the nearest one and a known town is never overwritten (they used .hunters inside Hunters and looped)
- 16 saved raid routes used datapack teleport names the live menus write differently - all 64 routes now find their gatekeeper link
- route editor: the teleport field is a real dropdown grouped by town (iPhone), and the route editor / fight area no longer render into a hidden copy (they showed for a second and vanished)
- Exclude from raid hunt button at the top of every boss page

## v1.3.6 (2026-10-10)

- Raid hunt: exclude bosses you do not want (e.g. ones you have to swim to): boss page -> Exclude from raid hunt (and Include again), for every party
- the list shows an 'excluded' badge
- the bots read it live (Scripts/data/raid_excluded.json), a manual Raid it order still works

## v1.3.5 (2026-10-10)

- Phones: text no longer too big. iPhone Safari enlarged some lines by itself (text autosizing: the party heading and the level-ETA line showed huge and ran off the screen)
- the dashboard now keeps its own font sizes, and on phones the party heading is smaller with the details as one wrapping caption line

## v1.3.4 (2026-10-10)

- Parties tab: a calm raidhunt strip, one fixed line per hunting party (party, boss, step, Watch, Stop) instead of the big hunt box and live raid panel that made the whole page jump up and down
- the live raid view stays on the Raids tab and #/live
- several hunting parties are shown in a stable order and do not replace each other, also with older scripts (the dashboard remembers each leader's last progress)

## v1.3.3 (2026-10-10)

- Raidhunt with several parties: every party's progress is shown (each leader writes its own Logs/raidhunt_party_<leader>.json
- before, all leaders overwrote one shared file, so only one party showed)
- the Raids page, the Parties tab (one box per hunting party, each Stop button stops its own party), the live party view and the party map all use the party's own hunt

## v1.3.2 (2026-10-10)

- Board buffs ON/OFF is now a switch per party on the dashboard Buffs page (tap the badge next to the party name, a dialog explains what changes)
- the bots pick it up within about 20 seconds, no restart
- the switch wins over swarm.config.json (boardBuffs still works as the default)

## v1.3.1 (2026-10-10)

- New dashboard page Buffs (#/buffs): per party and per buffer character choose which of its own buffs it casts and on whom (whole party, fighters, mages, itself, servitors, named characters), the song/dance cycle order, templates (save a party, apply to another), overlaps between two buffers shown
- buffers without a reviewed plan get an animated warning badge
- Board buffs ON/OFF shown per party
- works on the phone

## v1.3.0 (2026-10-10)

- Roles for EVERY class: tank, healer, buffer, melee, archer, dagger, nuker, summoner, spoiler, crafter or auto (from the character's class)
- skills come from each character's own skill data, no skill ids
- Community Board buffs are optional (boardBuffs true/false, per party on the leader's entry) - old-school parties buff themselves
- buffers (Prophet, Warcryer, Overlord, SwS, BD and their 3rd classes) keep the party buffed, fighter buffs on fighters and mage buffs on mages
- Bladedancer + Swordsinger cast songs and dances in full cycles (dance, song, dance...) and recast when the set has run out
- summoners keep their best servitor out, the servitor attacks the party's target, the summoner heals/recharges/buffs it and uses the servitor's own skills
- buff plans per party in Scripts/data/buff_plans.json (example file with templates), suggested buffs run when board buffs are off
- the importer assigns a role to every class
- NOT yet tried in game: servitor action ids and the song/dance timing between two windows - please report how it goes

## v1.2.2 (2026-10-10)

- Fix: L2Swarm 3.8.14 refused account files made from our templates ("The account options XML does not match the internal schema ... /Option/LastLoadedUtc ... is not a valid DateTime"). The templates now carry a valid date, and SETUP repairs existing account files with an empty LastLoadedUtc (run SETUP.cmd -Apply once).
- Fix: SETUP found no account when swarm.config.json had exactly ONE account.

## v1.2.1 (2026-10-10)

- The PDF user manual is now in the repository (docs/guide/L2Swarm_User_Manual.pdf) and linked at the top of the README
- every release also attaches it as its own download
- the PDF no longer contains links to local files

## v1.2.0 (2026-10-10)

- First public release (MIT): no L2Swarm files in the repository any more (no patched binaries, vendor hashes, IL tools, API dumps or client data
- npc strings are generated locally)
- automatic installer INSTALL.cmd + importer for existing L2Swarm accounts (80+ fine, never passwords)
- class plans: no class change without a plan you approved on the new Classes page (every class, data-driven, templates, animated warnings)
- orders stick: an order holds until done or replaced and failed steps are retried
- styled dialogs instead of browser pop-ups
- PDF user manual in the release zip
- L2Swarm 3.8.14 recommended (it contains every fix our patches carried)
- ships the town street graphs, dungeon room graphs and gear recommendations the bots need
- disclaimer: a fan project made for fun

## v1.1.0 (2026-10-09)

- L2Swarm 3.8.12 + DLL patch v8.1 are now the supported pair (apply_patch_v8_1.ps1 installs on vanilla 3.8.12 or upgrades v8 in place, revert_patch_v8_1.ps1 undoes it). 3.8.11 + v7.2 stays shipped as legacy, 3.8.10 + v7.1 is legacy (not shipped). SETUP.cmd -Apply -Patch and update.cmd pick the patch from version.txt
- Patch v8: only what 3.8.12 still lacks (hook packet event only with a subscriber, thread-pool floor 128/64, V8 engine lifecycle hooks) plus a memory census every 10 min (Logs\l2swarm_mem.log), idle V8 GC per script, one GC after a script reload and no V8 heap limits
- Patch v8.1 (Perf.dll only): memory probes P-A..P-F (heap statistics on request off by default) and fix W1 WpfSyncOnUiThread (WPF collection-sync records left on worker threads, shipped off, switch in L2Swarm.Perf.ini)
- Memory: party members fight with script attacks again (L2Swarm's own combat on ~30 accounts was the main managed-heap growth since 3.8.10), switchable live in Scripts/data/runtime_flags.json (memberScriptFight)
- Team movement: regroup holds have a hard cap (a town port goes after 75 s, a field port is dropped after 5 min), stuck escalation for members that do not come closer (re-plan, leader fetches, .town alone, click free), members far from the team (e.g. after a respawn) walk or port back by themselves
- Hunting pairs switch off at once before any travel or teleport hold, the hold only waits for teammates that are really being hit
- Autolevel: no more spot re-pick loop every few seconds while hunting, move-on checks use the team's pick level and the High Five exp-penalty rule
- Field areas are only chosen when the bots can really walk there, blocked spots are learned and skipped for the day
- Solo safety: a real escape for solo characters (crowd control incl. rogue detarget skills, reachable flee spot, second direction), a solo area filter and a 24 h skip after a solo death, script-controlled pulls
- Monsters with a raid title are treated as raid bosses (never a hunt or self-defence target outside a raid)
- Casters: primary nuke of the class line first (Scripts/data/caster_primary.json), cast loop without gaps, step into range instead of waiting, team Surrender on long fights
- Positional skills (backstab and blows from behind, step behind a held monster), toggles and cubics kept up by a 5 s keeper
- Warehouse stash: characters deposit what they do not use into their private warehouse in Giran
- Kamaloka: a Hall team per party (9-member parties can run Halls, benched members wait in town), per-character day locks, loot pickup after the boss, a live view per party
- Gear planner page (#/gear): every class x grade incl. items no shop sells, with a recommended plan
- Level ETA (when the next level comes) on the character page, member rows, live party and Accounts
- Dashboard: new Raids page v2 with raid fight areas, Kamaloka page v2, Live party view v2, Parties status banner, character page v2, one type scale, 16 bugs found by the user-guide writers fixed
- Navigation data: town street graphs (18 towns), dungeon room graphs with hallway centrelines and real floor links (Cruma floor 2 = Penelope), NPC atlas with !goto npc
- 3.8.13 + patch v8.2 (recommended), 3.8.12 + v8.1 and plain L2Swarm without the patch are supported (SETUP / update pick the patch from L2Swarm.exe's FileVersion via patches\patch_status.ps1)
- User guide: screenshots retaken for every page (anonymised, phone + desktop)
- Known gaps: 54 guide screenshots failed (Clan tab, Kamaloka live view, some raid-live / rooms shots), 5 README images are missing (party_map_room, dungeon_room_picker, field_area_picker, escape_live_map, shape_editor), and the PDF user manual is not built yet (printing timed out)

## v1.0.0 (2026-10-09)

- First public package (private repository for the L2Swarm developer and the server owner)
- swarm.js for every L2Swarm window: leader-controlled parties, leveling (dungeon rooms + field areas), supply runs, gear, Kamaloka, raid hunting, escape/rescue
- roster, parties and class paths come from swarm.config.json
- web dashboard (phone + desktop): parties, live maps, command center, shape editor, raids, Kamaloka
- one-file setup: swarm.config.json + SETUP.cmd (accounts, encrypted passwords, groups, scheduled tasks, dashboard images generated from your own L2Swarm data)
- update.cmd: one-command updates that keep your config, accounts, data files and dashboard edits
- optional DLL patch v7.2 for vanilla L2Swarm 3.8.11 with apply/revert scripts and the upstream checker

