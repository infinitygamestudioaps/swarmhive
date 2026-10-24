# Changelog

Every published version of the swarm package. Update with `update.cmd` (see README.md). The full story of how it was built: docs/HISTORY.md.

## v1.8.22 (2026-10-24)

- Bots no longer stand still while monsters hit them: a hunting round without a pause flooded the bots with attack orders, so every move arrived minutes late - every round now pauses briefly, the same attack is never sent twice within 0.6 s and the brain host caps repeated clicks. A monster nobody targeted yet is no longer treated as dead (bots stepped away from monsters hitting them). A frozen character re-syncs by itself when hit but not fighting back. Raids: once the tank has the boss the damage dealers keep attacking, the tank keeps using Aggression to win it back. Moving together: the party runs as one group close behind the leader (100 units), he waits at every point until everyone is there, nobody is left behind, and falling behind on the way to the spot no longer sends the party back to Giran. In dungeons the regroup before a town trip no longer walks into the next room
- a healer runs back to its fighting leader and heals instead of using a Scroll of Escape. Stay even if occupied now also works with several rooms or areas. Gear: archers buy the bow from the gear plan instead of keeping a dagger, healers and mages upgrade a lower robe set (Devotion to Karmian), bought pieces get equipped, shopping members are no longer pulled back to the leader, and Giran streets no longer collect false walls that broke the shop routes. Loot page: new layout with totals (items, worth at a shop, kinds, spoiled), grade and party filters, Totals and Every pick-up views
- experience is no longer listed as loot and Sweeper items count as spoiled. The PC clock is kept synced automatically (MemWatch switches the Windows Time service on and resyncs hourly) and the dashboard warns when the clock is off.

## v1.8.21 (2026-10-24)

- Faster hunting: no fixed waits around a monster any more - the next target the moment one dies, an empty room ends its wait when a monster shows up. The kill count now includes kills by L2Swarm combat and the assist (SLOW HUNTING no longer shows for parties that hunt normally). Items: Buy several (a buy list, one trip to Giran), a hive-wide Find an item search (who has it, how many: bag, worn, warehouse, clan warehouse), a compact layout. New Loot page: what every character picked up or spoiled, with filters (time, who, grade, type). Compact, easier Crafting, Dispatch and Quests pages. Party settings: every switch shows the all-parties value and can become the setting for all parties.

## v1.8.20 (2026-10-23)

- Level fast: a slow hunt repairs itself - the leader watches its kill rate and, when monsters are around but hardly any die, clears stale walks and stuck targets on the whole party and says why (SLOW HUNTING on the party card, missing shots named). Members stuck in an old route walk: one lost route-end message used to leave a member walking to an old point forever (no normal follow, no self-defence, and Fight with L2Swarm not hands-off)
- a quiet walk now ends after 2 min, and when the leader hunts at its spot. Fight with L2Swarm stays hands-off unless a team walk really runs. Hunt-spin test measured from the worker start.

## v1.8.19 (2026-10-23)

- Tester fixes. Your chosen hunting spot always wins: a spot, room or plan step above the party level is used with a warning (new party setting: ask me first)
- Override works at once
- Start resumes in the chosen spot instead of going to Giran
- a spot choice confirms on the card at once. Stop and Park stop the fighting at once (only the monster hitting you is fought back)
- a ranged attacker is always answered
- area rotation moves on when an area is empty. Attack first: a monster hitting the healer or you beats the chosen target
- a member standing still always fights back (it waited for a team walk that had ended)
- members no longer walk back and forth on hallway detours while the leader fights close by. Buffs: player buff stores are found by their titles (COV, Zerk, Magus), a store buy no longer fails after buying, every role gets Community Board buffs, Buff with own buffers rebuffs at once
- Forgotten Scroll self buffs can be switched off per character (Counter Critical always on)
- party switch Recommend each other. Gear: starter gear is replaced, a member paid by the leader buys right away, bought set pieces are worn, a shop is opened once for all pieces, a subclass no longer blocks upgrades, the gear follows the class plan (Hawkeye gets bows), a shirt slot, a note that no NPC sells B/A gear. Selling and errands are not pulled back to the leader
- trades check the bag first and never hang
- mark junk on the character page (crossed-out icon)
- no false Out of Spirit Ore
- Storage: remove a crafter, grade filter, item names wrap
- soul crystal abilities up to S84. Plans: gear and supply steps finish, a class change step never stalls, quests continue from each character stage and talk in front of the NPC
- subclass roles (accounts subRoles). Dashboard restart really restarts. Brain engine: every move to the engine is saved in the account file, and a guard moves a character back when it runs the old script after an L2Swarm restart (new requirement engine.md).

## v1.8.18 (2026-10-23)

- Casters: Devotion set until 40, then the Demon set for nukers and the Karmian set for healers and buffers
- set pieces are bought together, never half a set
- Upgrade weapon on the character page (Special Ability crystals can come from another character)
- Magnus' Chant from Giran buff stores (party switch). Long hunts: every party at a hunting spot now hunts in 12-hour sessions with no automatic town trips (per party setting, 0 = off)
- supply runs buy enough for the whole session from the measured use
- shots no NPC sells never cause a trip (the party card says so). Routes: a leader stuck on a route leg plans a way around the blocked step and saves it
- routes that keep failing get a red FIX THIS ROUTE sign on Raids, Circuit and the party card, bosses without a route a NO ROUTE sign. Parties added through the dashboard while the bots run: the running parties learn the new characters at once
- an unknown character is never counted as the main party (a stopped, parked party ported to the new parties
- a party took another party room)
- rescue calls carry their own leader. Hunting spot map: monsters show inside dungeons at every zoom and load faster
- zones and hunting grounds no longer vanish when you zoom in
- dungeon floors without a floor picture show the world map, and the dashboard draws the floor pictures by itself once. Spots drawn on the map without a start teleport now teleport to the nearest landing first instead of refusing
- the Giant Cave teleport marker is back in the spot editor. Party plans: an automation (hunt timer, watchdog, errands) never interrupts leveling that already runs, only your own orders restart it
- a plan leveling step never stops as blocked any more: it pauses 10 min, says why in party chat, and tries again (new requirement plan.md). Party card: the last sale after a supply run (sold, adena, kept and why). Character page: items no shop buys are marked, with Untick and Destroy (typed YES). Silent Move: a character with Silent Move travelling alone switches it on near aggressive monsters

## v1.8.17 (2026-10-23)

- Casters: Devotion set until 40, then the Demon set for nukers and the Karmian set for healers and buffers
- set pieces are bought together, never half a set
- Upgrade weapon on the character page (Special Ability crystals can come from another character)
- Magnus' Chant from Giran buff stores (party switch). Long hunts: every party at a hunting spot now hunts in 12-hour sessions with no automatic town trips (per party setting, 0 = off)
- supply runs buy enough for the whole session from the measured use
- shots no NPC sells never cause a trip (the party card says so). Routes: a leader stuck on a route leg plans a way around the blocked step and saves it
- routes that keep failing get a red FIX THIS ROUTE sign on Raids, Circuit and the party card, bosses without a route a NO ROUTE sign. Parties added through the dashboard while the bots run: the running parties learn the new characters at once
- an unknown character is never counted as the main party (a stopped, parked party ported to the new parties
- a party took another party room)
- rescue calls carry their own leader. Hunting spot map: monsters show inside dungeons at every zoom and load faster
- zones and hunting grounds no longer vanish when you zoom in
- dungeon floors without a floor picture show the world map, and the dashboard draws the floor pictures by itself once. Spots drawn on the map without a start teleport now teleport to the nearest landing first instead of refusing
- the Giant Cave teleport marker is back in the spot editor. Party plans: an automation (hunt timer, watchdog, errands) never interrupts leveling that already runs, only your own orders restart it
- a plan leveling step never stops as blocked any more: it pauses 10 min, says why in party chat, and tries again (new requirement plan.md). Party card: the last sale after a supply run (sold, adena, kept and why). Character page: items no shop buys are marked, with Untick and Destroy (typed YES). Silent Move: a character with Silent Move travelling alone switches it on near aggressive monsters

## v1.8.16 (2026-10-22)

- NPCs: a character always walks right in front of an NPC before clicking (learned standing spots shared by all characters, the NPC front, 8 spots around it, L2Swarm walker fallback) and never clicks from out of range
- the failure now says could not get in front instead of did not answer (most did not answer cases were clicks from 250+ away, e.g. the Gift of Vitality priest in Giran)
- Community Board: no Buffs click during a fight, a stuck in combat flag no longer blocks rebuffs, teleports or route walks (leader not rebuffing in town)
- Party plan: a level step uses the party level override (party stayed at Seal of Shilen instead of ToI)
- Hunting: a monster that takes no damage is dropped by self-defence too and the character steps away from it, a repeat no-damage target is skipped for 10 min
- Spot map: keep-out zones are never picked as a hunting spot (the filter never matched)
- Deploy: refuses while a character is in a regroup, supply run, trade or hand-over
- new requirement docs/requirements/npc.md

## v1.8.15 (2026-10-22)

- Soulshots and spiritshots have no limit any more in the supply amounts: give your characters whatever you want (any whole number, 0 or more)

## v1.8.14 (2026-10-22)

- Buff turn reworked after tester feedback: the party keeps fighting while one character buffs, the buffing character follows without assisting and fights back when attacked, a fight never counts as a failed try
- Death Penalty for every party also without supply runs (Scroll: Recovery bought on every Giran visit, read in the field, short Giran trip at death penalty 4)
- Chant of Victory: with the store switch on the 12 hour rebuff becomes a quick Giran trip and the team goes straight back
- a party that dies 3 times within an hour at a spot the bot picked skips it for 6 hours
- archer or other dealer leader with only a healer now kills everything on the way (also ranged monsters outside the leash) instead of standing still
- player buff store buffs come on top of the other buff sources wherever store is in the list, bought for the whole party on supply runs and rebuff trips, up to 6 stores tried
- supply amount limits raised (Spirit Ore 500k, shots 1M, mana 100k)

## v1.8.13 (2026-10-21)

- Hotfix: update.cmd now repairs an install that is missing files of its version (a v1.8.12 update could leave out Dashboard academy_api.js
- run update.cmd again and it restores what is missing, git or zip)
- the dashboard no longer fails on every page when a new optional module is missing (only that page is off)
- Academy mages: the automatic pipeline now uses its own account field academyMage, accounts that are only invited into the clan academy are never taken over (accounts added as Academy mage with v1.8.12: add them again or set academyMage true in swarm.config.json)
- PC tab: Restart dashboard button (the dashboard restarts itself with its own rights, refused during raids)
- fixed !dyeplan running the vitality order

## v1.8.12 (2026-10-21)

- Board buffs: the turn waits until the character is really out of combat (self-defence pauses, the leader holds new pulls), a refusal in combat no longer counts as a failure, town visits rebuff
- Keep hunting: a party that hunts its spot stays there (others in the room are only noted, the arriving party yields), the dead walk back alone, a whole wipe returns straight to the spot, nearby spot changes are walked without a Giran trip, a failed route step re-plans from where the team stands
- Safe-spot rebuff: 60 min before the board buffs run out the team rebuffs at a safe spot next to its hunting area and walks straight back
- Move together: fight time no longer resets the waiting clock, a leader whose party has only healers fights himself, a member stuck in combat no longer holds the walk, the destination door is fought at instead of run past
- Chosen spot: arrived only inside the chosen room, the chosen outline stays on the map while the party hunts nearby
- Server options per party (party Settings, Server): buff source (Community Board, own party buffers, player buff stores, own buffers standing in town, Newbie Helper), way to town (.townname, return skill, Scroll of Escape, gatekeeper, walk back), switch for the server taking the party along at gatekeepers
- Academy mages: add an account as Academy mage (automatic) and it creates a Dark Elven mage, joins the clan academy, gets its gear and levels 1-40 (Ant Nest), graduates and starts a new one
- Gift of Vitality from the Giran event priest in supply runs and with !vitality
- !npcmap also maps event NPCs
- the Chant of Victory store switch now works
- brain host: several parties per worker, code cache, priority and EcoQoS opt-out, direct worker channels (perf block in brain_host.json)
- dashboard: Restart brain host button on the PC tab, phone fix for the class plan badge

## v1.8.11 (2026-10-18)

- NPC rule: every character walks right in front of an NPC before talking to it (shops, warehouses, teleports, quest givers, buff stores, item jobs
- never from a distance). Raids: no countdown or pull until every damage dealer stands with the leader at the height of the boss (else the boss is skipped as unreachable)
- the minion no-damage skip only counts while a teammate really hits it
- raid circuit countdown 10 s. Your tasks first: the clan collector chores wait while an item job runs. Item jobs walk up to the merchant before buying. Hand-lead follow only while the party is switched off. Healer role message only on a real class change.

## v1.8.10 (2026-10-18)

- Navigation: parties run from waypoint to waypoint and only stop at a waypoint, where the leader holds the monsters and the party kills them, then moves on (no stop for every monster)
- members stay within 600 of the group and walk back during stops
- a stuck character fights back
- stairs are not another floor
- recorded routes are used by the dispatch and for floor changes in dungeons (then the room route finds the room)
- no blind straight lines when stuck (wall-checked path finder instead)
- a run continues from the nearest route point after a fight or reload. Hand-played leader: members always follow (forced follow, after death too) and catch up along the recorded route. Fixes: !sell in Giran (characters never walked to the shop), item jobs buy with L2Swarm BuyItem first, the party waits in Giran until an item job hands over the gear, the map shows the real gatekeeper landings the bots learned (Aden to ToI), healers no longer repeat their healer-role message after every restart. New: Tower of Insolence Dimensional Vortex route rule (off by default), !gatechant order.

## v1.8.9 (2026-10-17)

- Start fix for public installs (the Start task / dashboard Start no longer aborts with AutoStart list in settings.xml looks wrong when your AutoStart list does not hold the main leader
- swarm.config.json accounts are logged in too)
- L2Swarm 3.9.3 support (3.9 refuses account files whose combat skill fields are in the old order
- the combat profile editor writes the new order)
- user task first (an item job / dispatch / crystallize you start is never interrupted by stash, hand-overs, letters, crafting or other automations)
- Special Ability exchange picks the right list at the blacksmith
- item job walks in Giran retry
- loot hand-over waits while the receiver runs your task
- 3D view ground flattened under trees and towns
- release build runs at below-normal priority.

## v1.8.8 (2026-10-17)

- L2Swarm 3.9.3 support (3.9 refuses account files whose combat skill fields are in the old order
- the combat profile editor writes the new order)
- user task first (an item job / dispatch / crystallize you start is never interrupted by stash, hand-overs, letters, crafting or other automations)
- Special Ability exchange picks the right list at the blacksmith
- item job walks in Giran retry
- loot hand-over waits while the receiver runs your task
- 3D view ground flattened under trees/towns
- release build runs at below-normal priority so the bots are not starved.

## v1.8.7 (2026-10-17)

- 3D view: buildings load instantly (every area is baked once into one model + one texture atlas, one draw call, cached by the browser)
- weapons and shields in the characters' hands
- epic boss scenes with their scripted guards (Antharas' Behemoth / Tarask dragons and bombers, Baium's archangels, Frintezza's Scarlet and portraits) and the right facing
- models drawn solid (no more holes in Orfen / Antharas)
- boss guards stand on their real floor
- helper walls hidden where real buildings are
- much lighter page in busy towns (shared textures, animations built only when played, server caches texture look-ups).

## v1.8.6 (2026-10-17)

- 3D view: a live 3D view of every character (character page -> 3D view): real ground from the geodata, the game map art, dungeon walls, live party and monsters about once a second, cast / hit / death / fall effects, an event feed, a 10-minute replay, tap the ground to walk a character or the whole party there
- game models from YOUR OWN installed Lineage 2 (monsters, NPCs, your characters in their real armour with weapons, town buildings and trees) converted on your PC with UE Viewer (one-time Set up game models button) and kept in Dashboard/l2cache (never shared)
- raid boss 3D scenes (Raids -> boss -> 3D view): the boss in its room with its minions (Core's guards, Queen Ant's nest, Antharas' dragons, Baium's archangels, Frintezza's portraits), aggro and attack range rings, skills
- Giran: NPCs are reached along the recorded town routes (no more running out of town).

## v1.8.5 (2026-10-17)

- Multi-server: servers without .townname use gatekeepers (the party fights off and gathers first
- Scroll of Escape out of dungeons), servers without Community Board buffs are detected and the party buffs itself, buff timers follow the real buff length (not only 12 h)
- Treasure Chests are never attacked (L2Swarm mob rules on every account)
- a room in the dungeon you stand in is reached without a Giran trip (ToI)
- fight toggles only with enough MP and shown correctly
- Items page sorted by type and grade with grade filters, north Giran A/B shops priced, buy warnings, Buy in Giran link on the Gear page.

## v1.8.4 (2026-10-17)

- Combat profile page: set up each character's L2Swarm combat profile in the Hive (attack skills with conditions, heals and buffs, items, follow, range, pick-up, monsters), saved safely into L2Swarm
- Items page: any character's bag, warehouse, clan warehouse and Giran shops in one place with big game icons: buy, enchant to +N (chance per level and gain shown), add a Special Ability, give an item to a character who puts it on
- you pick where every material comes from, nothing is taken or bought on its own, anything above the safe +4 needs an explicit warning, and every step is logged
- Crafting page: every recipe a crafter can make with the materials from bag, warehouse and clan warehouse (phone friendly)
- Dispatch page: send a party or one character to any raid boss, epic entrance, NPC, hunting area, room or map point, one stop or a tour, the route is fixed on the way and a working new way is saved as the learned route
- Giran census: map every Giran NPC's shop and exchange lists (soul crystals at Alexandria, gemstones at Helvetia and Kiki) and buy from any of them
- Warehouse safety: taking an item out by type takes the lowest enchanted piece first and never a piece above +4 unless you chose exactly that piece
- Storage: Sell now + always sell these (never stored again, sold by itself)
- in-game icons instead of emoji on the new pages

## v1.8.3 (2026-10-17)

- Party plan: choose rooms on the dungeon map for a level step (catacombs too), the step names its room, a changed plan step moves a running party
- picking a room on the party card asks to change the plan step too
- Raid healing per boss: Normal / Heavy / Extreme or own numbers on each boss page (heal earlier, tank first, faster healer loop)
- A hunting spot chosen on the dashboard is no longer marked 'not reachable' because an interrupted walk to the previous place failed
- Plan editor no longer lists the same place twice

## v1.8.2 (2026-10-16)

- Fight with L2Swarm only hands the TARGETS to L2Swarm: with Hive picks my skills / Hive heals on, Hive still casts and heals on L2Swarm's target (switch those off and your profiles cast). Raid clear: only AGGRESSIVE monsters inside the fight circle (+ anything hitting us)
- passive ones only with also kill passive
- an automatic area clears only its circle
- the clear stops after 1.5x what was there at the start (min 8) or 4 min when monsters keep respawning. Tower of Insolence: routes climb floor by floor along the stairs (followers no longer stand under the 2nd floor), all 41 hunting rooms on floors 1-12 have full routes, floor 13 + the roof (Baium's door, Angelic Vortex) added
- the Aden teleport's real landing is learned. Tested live: one character walked from Giran to Baium's door. A boss-zone NPC that refuses you (Angelic Vortex) now says why in party chat. Inside dungeons a character walking a route alone steps point by point (no more circling on a floor). New test order: !routetest <boss> atlas (one character walks the computed route alone, Silent Move near aggressive monsters, no fights).

## v1.8.1 (2026-10-16)

- Fight with L2Swarm: only the leader starts L2Swarm combat (the combat zone)
- followers never start combat, they follow the leader with Follow Attack, and a running follower combat is stopped within 2 s (reported by Vykaax).

## v1.8.0 (2026-10-16)

- Crystallize from every Dwarf: every Dwarf with the Crystallize skill (Scavenger, Bounty Hunter, Fortune Seeker too) now gets a card on the Storage page with Turn items into crystals, not only Artisans, Warsmiths and Maestros
- Clan warehouse defaults: tick items in the clan warehouse list and press Always sell or Always crystallize, every row shows its default
- with the new switch on, the collector (your clan leader) takes them out by itself while idle in Giran, sells the sell ones and hands the crystallize ones to your crafter, who crystallizes them
- one order at a time, every 30 minutes by default, enchanted pieces are never touched
- Guide: Our crafter page, sections Which characters have a card and Clan warehouse defaults

## v1.7.9 (2026-10-16)

- New party switch Fight with L2Swarm (Hive only travels), party Settings - Combat, off by default. On: Hive still travels to the spot, picks it, restocks, gears up and shows the dashboard
- at the hunting spot the leader only sets the combat zone and starts L2Swarm combat, the others follow him with L2Swarm Follow and Follow Attack, and your L2Swarm profiles cast and heal
- Hive then picks no targets, makes no pairs, walks nobody back to the middle, starts no help or self-defence fights of its own, leads nobody along room routes and runs nobody out of the fight
- raids, Kamaloka and instances stay with Hive
- Guide: Hive switches page, section Fight with L2Swarm

## v1.7.8 (2026-10-16)

- Gear plan for every class and grade (NG to S84): weapons with the special ability to put on, the armor set per class (tanks and dwarves heavy + shield, dancers and singers heavy, Gladiator / Duelist / fists / daggers / archers / Kamael light, every caster healer and buffer a robe), jewelry and epic boss jewels. It lives in Scripts/data/gear_doctrine.json and the Gear page recommendations follow it
- your own Gear page choices still win
- Fixes from it: base fighters get a no-grade 1h sword (was a crossbow), buffers a robe (was heavy), dwarves 1h + shield (was 2h), casters Arcana Mace + Arcana Sigil from S
- Bots now accept the plan's light armor for Gladiator / Duelist / fists, the plan's weapon for duals / fists / polearms, and a sigil for casters
- a tank that the hive once gave a 2h weapon now switches to the plan's 1h weapon + shield

## v1.7.7 (2026-10-16)

- Kamael soldiers no longer auto-equip a bow: a Kamael never gets a plain bow, a crossbow only on the Warder line, and a melee role puts a melee weapon back on before any bow (all races)
- the weapon you wore last always comes first
- Raid bosses behind a wall (e.g. Archon Suscepter): the team no longer stops on the wrong side when the boss is close in a straight line but far on foot - it walks the real route to the fight area before the countdown
- Dashboard keep-alive: SETUP registers the task L2Swarm Dashboard (not elevated), which starts the dashboard and the brain host again after a reboot or crash

## v1.7.6 (2026-10-16)

- Hive picks my skills OFF now really hands following to your own L2Swarm profile: the dungeon / stacked-floor guard and the 1.7.4 assist no longer untick Follow After, the hive no longer fights alongside your profile, and a follower up to 8000 away gets follow back by itself (was 3000). Routes, teleports, trades and raids still borrow follow briefly and give it back
- Supply run: the leader no longer trades his spare loot to a follower by himself. Unloading when his bag is full is now a party switch (party Settings - Supplies), OFF unless you tick it, and it never gives away potions, shots, scrolls, arrows, adena, letters or anything marked for selling
- Skills: the hive never casts Stealth, Soul Stealth, Hide, Silent Move or Fake Death
- buffers (Prophet, Warcryer, Doomcryer...) no longer attack with Wind Strike, Mana Burn or Steal Essence unless you tick Attacks with its own skills in their buff plan
- self buffs on a never keep list or with Buffing OFF are not cast
- Servers without free .town: set townCommands false in swarm.config.json and the hive uses gatekeepers only
- it also falls back to gatekeepers by itself when the server answers .town as an unknown command

## v1.7.5 (2026-10-16)

- Hunting: moving between areas of a hunting ground no longer uses the slow trip walk that stopped the whole team at every monster - the leader walks, the team follows and fights what comes (1.7.4 parties barely hunted, the leader walked alone)
- Combat with your own L2Swarm profile: with Hive picks my skills OFF, the dungeon / stacked-floor guard no longer switches off your Follow Attack (assist) or L2Swarm combat
- following stays with the hive (routes, floors)
- Tower of Insolence: the Aden gatekeeper lands somewhere else than the datapack says - the team no longer loops Aden -> ToI -> Aden
- it remembers the real landing (Scripts/data/gk_landing_live.json) and walks on from there
- Storage page, clan warehouse list: tick items and press Take out and crystallize - the clan leader takes them out and trades them to the crafter you pick, who crystallizes exactly those pieces (any Dwarf crafter with Crystallize, nothing hard coded)
- Storage page, clan warehouse list: Take out and give to a crafter - the clan leader takes the ticked items out and trades them to the crafter you pick (crafting materials, gear), nothing is destroyed
- Hunting timers: two new options - start the clock only when the party really arrives at the spot, and repeat (after the end action, for example a supply run, the next arrival starts a new run). Good for long catacomb runs

## v1.7.4 (2026-10-15)

- Team routes: the leader no longer waits at the end (up to 15 min) for members already standing next to him - a member that walked the route again after a reload never sent its done
- the leader now crosses off everyone he sees next to him and every new route starts with a clean list
- Raids: Bounty Hunters / spoilers, Treasure Hunters / daggers and Warsmiths / crafters now fight the raid boss as damage dealers (they had no raid routine and stood still the whole fight)
- they also stand behind the boss with the other melee and follow the team focus. Every role now has a raid job (checked all 19 role names)
- Destroyer HP drain (destroyers hitting each other below 30 % for Frenzy / Zealot) is now a switch per party, OFF by default: party Settings -> Fighting -> Team fighting. Off = they never hit teammates
- Frenzy / Zealot still fire when the fight brings HP low. The same card has Members attack the leader monster at once (on by default)
- Raid circuit: the town stop now hands the party loot to the clan leader (party loot rule) when he is in that town, before the warehouse step - members outside the full clan used to put it into their OWN private warehouse, out of his reach

## v1.7.4 (2026-10-15)

- Team routes: the leader no longer waits at the end (up to 15 min) for members already standing next to him - a member that walked the route again after a reload never sent its done
- the leader now crosses off everyone he sees next to him and every new route starts with a clean list
- Raids: Bounty Hunters / spoilers, Treasure Hunters / daggers and Warsmiths / crafters now fight the raid boss as damage dealers (they had no raid routine and stood still the whole fight)

## v1.7.3 (2026-10-15)

- Gear: a one-piece armor (Full Plate Armor ...) covers the legs - the supply run no longer buys gaiters next to it (characters were left shirtless and bought a new pair every run)
- Gear: the job decides - a tank gets a one-handed weapon + shield + heavy armor, destroyers and other heavy roles heavy armor
- the per-class damage kit (two-handed Berserker Blade, light Theca / Plated Leather) is no longer forced on them
- Gear: only pieces the hive bought itself are corrected
- anything you gave, crafted or chose stays (your choice is never overruled)
- Memory: the walk recorder no longer keeps every walked cell in memory (about 10 MB per well-travelled character, about 200 MB for a full roster) and no longer rewrites it every 30 s
- Memory: scout trips no longer leave timers running forever (one of them also kept self-defence switched off)
- Hand-over trades: a stale confirm from the receiver no longer makes the server refuse the rest of the items
- the giver checks the trade window before confirming and re-adds missing items
- Spirit Ore only for skills the hive really casts (healer heals, cubics, summoners) - wizards no longer get 300 for Summon Cat / Unicorn / Shadow
- Team walks: members now help the leader's fight on the way instead of standing still
- Followers react at once: the leader announces the monster he picks
- members walk to it and attack within half a second (was 8-11 s, they only reacted after a monster hit the leader) and drop it the moment it dies instead of walking to the dead monster's spot (switch: party_tactics.json <leader>: { assist: false })

## v1.7.3 (2026-10-15)

- Gear: a one-piece armor (Full Plate Armor ...) covers the legs - the supply run no longer buys gaiters next to it (characters were left shirtless and bought a new pair every run)
- Gear: the job decides - a tank gets a one-handed weapon + shield + heavy armor, destroyers and other heavy roles heavy armor
- the per-class damage kit (two-handed Berserker Blade, light Theca / Plated Leather) is no longer forced on them
- Gear: only pieces the hive bought itself are corrected
- anything you gave, crafted or chose stays (your choice is never overruled)
- Memory: the walk recorder no longer keeps every walked cell in memory (about 10 MB per well-travelled character, about 200 MB for a full roster) and no longer rewrites it every 30 s
- Memory: scout trips no longer leave timers running forever (one of them also kept self-defence switched off)
- Hand-over trades: a stale confirm from the receiver no longer makes the server refuse the rest of the items
- the giver checks the trade window before confirming and re-adds missing items
- Spirit Ore only for skills the hive really casts (healer heals, cubics, summoners) - wizards no longer get 300 for Summon Cat / Unicorn / Shadow
- Team walks: members now help the leader's fight on the way instead of standing still

## v1.7.2 (2026-10-15)

- Loot hand-over: an item now only counts as untradeable after the server refused it in 3 separate trades (v1.7.1 learned it after one refusal, so normal materials such as Suede, Thread or Animal Bone could stop being handed over) - if you updated to v1.7.1, delete Logs\notrade_live.json once
- Brain engine: the memory guard now compares parties per character, so a big party is no longer restarted just for being big
- a HEAP line every 5 min in Logs\brain_host.log shows each party's memory

## v1.7.1 (2026-10-15)

- Hunting time: choosing a room, area or spot asks how long to hunt (until stopped, 1-8 h) and what happens when the time is up (go to town and wait / town, supplies, come back / keep hunting) - the party is not pulled away by supply trips, Kamaloka, stash runs, Seven Signs or spot hopping meanwhile - the party card shows the time left with Extend / End now
- The hunting-time window shows the expected soulshots, spiritshots, Spirit Ore, potions (and Holy Water / Soul Ore for characters whose skills use them) and warns who runs out first, with a Supply run first button - each character now measures its own use per hour
- Market scan fixed: it found the player shops but read no items (wrong packet byte, lost handler) - now every shop's list is read
- NEW buy B/A/S soulshots and spiritshots from player shops in a supply run, cheapest first, never above your max price per grade (party Settings - Supplies, OFF by default), with a budget and an adena floor - Market tab - Shots view shows the cheapest offers against your max prices
- NEW Our crafter (Storage page): a Dwarf crafter keeps shots in stock by crafting them (recipes per grade, what is missing, daily limits) - supply runs take shots from him first, then the grocer, then player shops - OFF by default
- Crafter: turn chosen items into crystals (red confirm, worn items never, enchanted / special items only when ticked), give him items, recipes and materials from any character or the clan warehouse, Learn button per recipe
- NEW Automations tab: every automation per party - on / off / waits for Start / always on, why, what it does now, and a button to where it is switched
- Seven Signs: every catacomb and necropolis says in one sentence why it is open or closed (validation week, not signed up, sign-up switched off ...) and when it opens again - on the dashboard and in the bots' notes
- Frenzy kit: a Buy what is missing button on the destroyer page (never bought by itself) - kit pieces are never stored or sold by the automatic stash / junk sale
- C-grade jewels: Sandra's real menu text is used (supply runs bought 0 of 5 jewels before)
- Raid boss page map: the path the bots really walk is drawn bright (the other faded), plus the fight area, clear area, stage point and the cliff and water edges around the boss
- Warning bar: a red Cannot move line when a character has not moved for 10+ minutes while every walk and town port failed
- Much lower CPU and RAM: the game-side agents no longer read fields the game client does not have (each such read cost 50-100x a normal one), idle characters report less often, no more broadcast messages into L2Swarm and no repeated setting writes - about 30-50 % less agent CPU in L2Swarm - and the brain engine shares the big data files between characters (a 9-character party: 444 MB -> 261 MB)
- Loot to the collector: a loot rule of everything now really hands over everything (raid items, coins, tattoos, enchant scrolls were left in the bags), givers take turns with the receiver (two trades at once were both closed), the receiver no longer switches on its soulshots during the hand-over (that cancelled the next trade), and items the server refuses are remembered and never offered again
- A party leader no longer freezes the brain engine while a teammate travels back from far away (an endless loop got the character quarantined)
- Crafter: the hand-in and crystallize buttons, Learn per recipe, items from the clan warehouse

## v1.7.0 (2026-10-15)

- LOOT TO THE COLLECTOR: every member of a party now hands over its own loot (before only the leader's loot arrived - the members never answered in time)
- Collector mode (new, Storage page): one character stays in town, receives the teams' loot, stores it in the clan warehouse, takes out what is marked for sale and sells it - all by itself
- Clan warehouse on the Storage page: tick items and press Take out and sell (or Take out) - the clan leader takes what he can carry, sells, comes back for more until the list is done, resumes after a restart and never stores those items again
- Clan warehouse sorted into groups with counts: weapons, armor, accessories, materials, crafting parts, recipes, scrolls, event letters, potions, life and seal stones - grade filter, grade tag on every item, sorted by name (recipes by grade, life stones by level)
- Sell all Crafting parts / Sell all Recipes buttons on the clan warehouse list
- Never store list (Storage page): Common items and your own names never go into a warehouse - optionally sold instead
- Market tab (new): a bot walks to every player shop in town and reads what they sell, buy and craft - search and sort by price
- Player shops are recognised again by the new engine (the shop flag was missing from the player list)
- Full warnings: a bar on every page when the clan warehouse, a private warehouse or a bag is full or nearly full
- Find character button in the header (or press /): search by name, class or party
- PC header in one tidy row
- Phone: the party banner (Running / Hunting at ...) is no longer cut off
- Character rows show the target: name, level (red = 3+ above, green = below) and an HP bar instead of only 'fighting ...'
- Supply amounts per level band on the dashboard (party Settings -> Supplies -> How much each character carries) - saved between updates
- Spirit Ore is bought for every character with a skill that uses it (heals, cubics) - running out never starts a supply run: a warning and the next best heal instead
- A quest NPC that refuses because the bag is too full: marked items are sold, the rest stored, then it talks again
- Marked items are sold reliably: a partial sale no longer bans the rest of the list for 24 hours
- Two commands never fight over a team: one teleport hold at a time, members port only after the leader's own .town worked, a raid hunt is never interrupted by the split watchdog
- Leaders only listen to their own team's messages (leaders waited for another party's members)
- Raids: the focus picks only minions that are in the fight - loose ones far away are the tank's job
- Raids: the party's Surrender caster puts Surrender on the boss from the pull and recasts a resisted one at once
- Raid fight area editor: Fit to safe ground (stops at cliffs, water and walls) and Stay inside (nobody leaves the area, nobody chases minions out of it)
- 183 raid bosses got a safe fight area made from the geodata - Stay inside is on for the 29 next to a cliff or water
- Raid walks that find no way through skip that boss, a boss that was not found is not looked at again within 2 hours
- The raid status file can no longer be damaged by two writers (repaired automatically, locked writes)
- Destroyer opening order: Zealot, Frenzy, Guts, Rage, Battle Roar
- Frenzy kit overview on every destroyer's character page (with item icons): which HP-swap pieces it has, in the bag, in the clan warehouse or missing - the swap now finds the pieces by item id
- Weapons: Kamael characters buy the two-handed sword their class turns into its weapon, Warlords / Gladiators / Tyrants buy the weapon type of their class recommendation (a Warlord bought a hammer)
- A character alone that gets a .town order first fights off or runs from monsters, waits out of combat, then ports
- Routes into the water at the Heine bridge fixed - 7 hand-drawn raid routes got the right heights
- Devil's Isle caves are a dungeon on the maps - the bosses inside (Tillion, Krantz, Kenishee, Atraiban, Demon Kuri) use the outdoor route until a way in is known
- Hunting spots are kept longer: judged over 10 minutes with the whole party's kills, an empty room or area only after 150 s
- Many fixes from a full bug sweep: no wandering on stacked floors, the spot picker skips landings the danger check refuses, a refused gatekeeper link is blocked at once, more town name aliases, a target whose HP does not drop for 40 s is set aside, occupied spots and refused board rebuffs back off step by step, a leader alone in a fight runs back to a teammate
- A loot hand-over never walks into the receiver's hunting ground
- A member wedged near the team: after 5 minutes the whole team meets in the hub town
- Clan tab: a short warehouse summary that opens the full list (the page was very long on PC)
- Raid routes on bridges and stacked ground: every point is put on the floor you can really walk to (the Ketra Commander Atis route walked off the Ivory Tower bridge) - 47 raid routes corrected
- C-grade jewelry is bought again: the Giran jeweler Sandra (C jewels and their Common versions) is now in the shop list, so fighters buy Common C jewels
- Raid bosses that live somewhere else than the game data says: a character that sees one records the real spot and every party uses it, and you can set a boss's spot yourself
- Raid routes with one long underwater swim cut by a door are now marked as longer than one breath
- NEW per party and per character (party Settings -> Combat, character page): Hive picks my skills / Hive heals / Hive uses potions - switch one off and your own L2Swarm profile (Combat Skills, Auto Skills) does it instead, while Hive keeps doing pathing, supplies and the dashboard. On by default
- Toggles: in a fight Hive now only switches on toggles that are worth it (Soul Cry, Vicious Stance, Accuracy, Focus Attack, Polearm Accuracy, Fury Fists, tank stances) plus the ones you tick on the character page - no more Strike Back draining all the MP

## v1.6.8 (2026-10-14)

- raids: damage dealers no longer wait for the tank's full aggro - they attack 2.5 s after the tank's first pull (or at once when the boss is already hurt)
- the tank keeps spamming Aggression / Aura of Hate (casters held for minutes while loose monsters hit a teammate)
- new Gear page setting 'Never buy these grades' (e.g. tick B: nobody buys B-grade weapons, armor or jewels, every class)
- Kamael characters get their Kamael weapon by class (ancient sword / rapier / crossbow via Change Weapon) and never a mace or other weapon they cannot use - a wrong weapon already worn is replaced
- route walks: HP lost under water (drowning) no longer counts as a fight, so the team does not stand still in the sea

## v1.6.7 (2026-10-14)

- casters: in raids the strongest single-target spell (e.g. Hydro Blast, or the boss's weak element) goes first - area spells only while it reloads
- new party settings (Settings -> Fighting -> Area spells): use area spells from 2-8 monsters or never, and in raids 'strongest single spell first' (default) or 'area spells when more monsters'
- raid loot list no longer shows a character's whole bag (an empty bag snapshot right after a reload is retaken)
- route walks: a character that does not move one step on a leg sends the Appearing packet itself and walks again (the leader froze on a bridge)
- a leader stuck where no way leads on uses .town and the route starts again from the town

## v1.6.6 (2026-10-13)

- HOTFIX: casters cast again - in v1.6.5 every spell was refused with 'agent not reached' (a new cast acknowledgement never arrived), so no caster used magic
- casts are sent the proven way again
- raid fixes: damage dealers attack when no monster is on a teammate (the 'full aggro' wait never ended because the new engine has no monster target data), the leader's focus uses every minion again (a too strict HP filter emptied the list) and focuses a minion the tank cannot hold, damage dealers never heal teammates in a raid while the party has a living healer

## v1.6.5 (2026-10-13)

- Engine much faster in fights: the agent no longer reads 5 creature fields L2Swarm 3.8.18 does not have (each failed read cost ~230 us on up to 100 creatures every report) - about 9x less CPU per fighting character, ticks of 2-3 ms instead of 25-100 ms, orders run between report jobs, the whole party switches to fast ticks while one member fights, and a cast is only called 'no answer' once the agent really sent it (optional instant 'push' orders: brain_host.json agentPush)
- Party plan (new): a Plan button on every party card - a timeline of steps (level up to N at a place, quests with rewards, class change with an approved plan, town / supplies / gear up, raid boss, wait for my order), drag to reorder, 'Suggest a plan', templates for other parties
- the party follows it when started
- Loot rule per party (new, off by default): hand loot to a collector, keep it, only non-gear, or keep valuable grades / enchanted / special-ability items, never-give and always-give lists
- Party purse (new): Settings -> Money has 'Inside the party - the leader pays his members gear and supplies' (switch per party, leader keeps at least / at most per member) next to 'Between parties'
- a 'needs X adena - Give it now' card on the party when the switch is off
- members keep only 5k pocket money below level 20 (50k below 40, 150k below 60), so low-level gear is affordable
- Healing (new): Recharge works again for every healer (it never fired since 1.6.2), every heal is picked by its real power (Self Heal only when nothing else is known), and your own heal / MP schemes per character or class (character page -> Healing, or party Settings -> Healing)
- Resurrection (new): a dead member is raised by a res skill or by anyone with a Scroll of Resurrection who walks to the body (healers first, a dead healer may be scrolled even in a raid), then it rebuffs before anything else
- Resurrect / Res all dead buttons
- Move together (new, on by default): every member walks the same waypoints and the leader waits for everyone at every waypoint, also in water
- stuck members get help, nobody is left in the water
- No raid pull while the healer or more than one member is missing
- Raid focus skips minions that take no damage (a party hit an invulnerable 'Slave' for minutes)
- Casters use their strongest nuke by real power (Spellhowler: Hurricane / Shadow Flare first, Death Link only at low HP, element resistances in raids)
- No fighting bare-handed: a character always wears its best weapon, a failed purchase puts the old weapon back on
- 'not enough adena' notes say how much is missing
- Forge of the Gods: hunted room by room on the Top level (walks in from the Goddard landing), unreachable levels are not picked, no more Giran loop
- S80 / S84 weapons use S-grade soulshots / spiritshots (they used none)
- a drawn hunting area is hunted as your exact polygon (the map and the members used a big square around it), and with 0 monsters inside the party stays inside, rests and waits for respawns instead of walking out
- Move together: per-party numbers (longest wait at a waypoint, go on without a stuck member after, pace gap, stuck seconds) and dungeon team walks also wait at every centreline point
- Dashboard much faster (pages and data in milliseconds instead of seconds, map tiles cached, page cached in the browser)
- Simple view hides the expert pages

## v1.6.4 (2026-10-13)

- Shops (URGENT fix): buying works again on the new engine - the brain read the merchant's SELL part (your own items) instead of his buy list, so supplies said ''not sold here'' and gear said ''not in X's list any more''
- the agent now sends the real buy list and each shop visit waits for that merchant's list
- Gear: the weapon and armor TYPE you gave a character is kept and upgraded within that type (bow -> best D bow, light armor stays light), bow users get arrows of their grade, a planned weapon not sold as a Common item is bought as the normal item (e.g. Zweihander), gear notes say why nothing was bought
- Party settings (new): a Settings button on every party card opens one popup with everything the party may do by itself (money hand-outs incl. who gives, gear, storage, clan, daily Kamaloka / Seven Signs, tactics, route rules, automatic supply runs / junk selling / symbols per party and per character, who gives adena to this party) - plain words, one Save, off until you switch it on
- Start / Stop for every party (new): a big Start / Stop button on every party card and on the character page, Start all / Stop all in the header
- STOPPED is the default after an update, a restart or a new install - a stopped party does nothing on its own (no leveling, supply runs, regroups, daily Kamaloka, raid hunting, Seven Signs / warehouse / hand-over trips, no picking up what it did before a restart) but still heals, defends itself, answers trades and does every order you send
- Start asks first and shows what it will do
- Simple view (new, default
- the switch is under the title): the expert pages are hidden (Zones, Spots, Rooms, Crystals, Fortresses, Castles, Enchant, Accounts, Plan) and so is the technical task list on the party cards
- plain sentences instead of log codes on the character page, Live view, Orders and Commands (Advanced view keeps the details)
- grouped order results with calm words
- larger text on phones
- NPC dialogs (shops, warehouse, quests, gatekeepers, Seven Signs, Cabinet, class change, clan, Kamaloka) run on one event-driven dialog engine: it waits for the real answer, ends at once with the reason when the server refuses (bag full, no adena, no clan warehouse right, too far ...) and never gives up while the bot is just slow
- a stop that was interrupted by a restart counts as done
- a trade the server confirmed (#123) counts as done
- Quests: a quest whose state the server does not report is followed by its quest items and the engine's own record (no more false COMPLETED after step 2)
- Raid boss routes: a waypoint counts as reached only at the right height too (x, y AND z - deep caves, swims dive down), keys are bought only for the doors a route needs, a 'Try fortress gates' party rule (off by default), drops marked as not tested live
- Raid boss routes: walking out of Heine is allowed, swims only when there is no dry way, fortress gates only the owner can open count as walls, doors / swims / drops show as steps, route rules per party (doors, swims, drops, buying Thief Keys - off by default)
- New engine much lighter on the PC: the agent reads L2Swarm about 100x less (one snapshot per list instead of every item and field, nearby creatures only), never gets cut off by L2Swarm's 30 s watchdog any more (a character in a crowded town with a full bag could stay 'not ready' for minutes), and ticks slowly when the character is idle or its party is stopped
- Storage tab (new): per character choose the clan or your own warehouse, what to store (smart rules / everything except your consumables / nothing), automatic on or off (OFF by default - nothing happens until you switch it on), Plan (dry run) and Store now buttons
- event letters can be handed to one collector (off by default)
- storing works with slow warehouse pages (waits for the list instead of giving up after 6 s)
- Quests: a full bag (over 90 % of the slots) makes the server refuse every quest window without a page (#1118) - the engine now says so at once (free bag slots) instead of retrying 4 times, and checks the bag before travelling
- Parties: a party never counts characters of ANOTHER party as its own (tester: party Yellow waited in the supply run for all 9 Jade characters - characters added after the leader started were taken for the main leader's team
- every character now reports which leader it follows)
- Trades between our own characters: the giver walks to where the receiver last reported and only sends the request once the receiver is in sight (no more #144 incorrect target / #22 out of range, e.g. the clan Blood Mark hand-over to the clan leader)
- circuit progress shows fighting during the boss fight

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

