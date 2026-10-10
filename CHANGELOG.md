# Changelog

Every published version of the swarm package. Update with `update.cmd` (see README.md). The full story of how it was built: docs/HISTORY.md.

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

