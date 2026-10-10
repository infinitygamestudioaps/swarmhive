# How the Swarm Kit was built (2026-10-02 .. 2026-10-09)

A plain-language summary of one week of building, testing and fixing, from the first script to the first public package.
The per-version changes of the package itself are in [../CHANGELOG.md](../CHANGELOG.md). The DLL patches described below were
per-version files in the early private package; L2Swarm 3.8.14 contains all of those fixes, so since v1.2.0 no patch and no
L2Swarm file is part of the repository.

Character and account names are left out on purpose. "The main party" is the first party of nine; later there were six
parties and 39–40 accounts on two master accounts.

---

## 2026-10-02 — First steps

- Learned L2Swarm with a test party of mages, then created the real team: one character per account (tank, healers,
  destroyers, kamaels, necromancer, doomcryer, shillien saint), all starting at level 1.
- Set up the account configs (follow the leader, assist, healers self-heal) and the AutoStart list.
- Collected L2Swarm's JavaScript API reference for our own use (it is L2Swarm's documentation, so it is not part of this
  repository; L2Swarm shows it in its JS Console).
- First version of `swarm.js`: one script for every window, the role comes from a roster.
  - **Buffs from the Community Board** (free 12-hour schemes): open the board, click by button label (the bypass codes
    change on every page), one character at a time while the others guard it.
  - **Auto-skills** classified from the client's skill data (attacks, AoE, self-buffs, toggles), so no skill IDs to maintain.
  - **Gatekeeper teleports** by link text (client NpcString IDs resolved from L2Swarm's own data).
- Generated game data from the L2J High Five datapack: every NPC/monster spawn (38,148) and every gatekeeper destination (918).

## 2026-10-03 — Navigation, the dashboard and the first big crash

- Server features found: Community Board class changes, `.townname` commands that teleport the whole party, "follow the
  leader's dialog", quick trade, auto potions.
- **Navigation:** `GoToPoint` in short hops with stuck detection; the native path search only reaches short distances.
- **Selling and buying:** L2Swarm's own sell command is ignored by this server, so the script builds the High Five
  buy/sell packets itself. Recorded walking routes inside Giran.
- **Dashboard v1 → v3:** live character list with real game icons, world map with character dots, a character page with a
  mini-map, an intent timeline ("what they are doing"), teleports tab, phone-friendly layout.
- **Crash:** about 165 live reloads of the 1 MB script in one day leaked V8 memory until L2Swarm used 24.5 GB and the PC
  hard-reset. From then on: edit in `Scripts_dev/`, deploy with `deploy_swarm.ps1` (syntax check, minimum gap, memory
  limit), scheduled tasks Start/Stop/Restart/**MemWatch** (restarts L2Swarm before memory runs out).
- Quest runner with retries, escort for class quests (later switched off in favour of the board's class change),
  restock trips, adena top-ups, unstuck logic.

## 2026-10-04 — The leader decides

- **Root cause of "cannot move at all":** after a teleport the server waits for the client's *Appearing* packet, which an
  out-of-game session does not always send. The script now sends it automatically.
- **Leader-controlled design:** members have no behaviour of their own; they follow, assist, defend, heal, rest and rebuff.
  The leader picks hunting spots, takes everyone to Giran first, buys supplies for the team and trades them out,
  collects surplus adena and orders class changes.
- **Priority list:** survive > unfreeze > team safety > safe teleport > orders > leveling > upkeep; long tasks step aside.
- **Never teleport while someone fights:** fight off, move to a safe spot out of aggro range, wait until everyone is out
  of combat for 10 s, then port. Never use Scrolls of Escape (only `.townname`).
- **Staggered login** (accounts log in one by one) after a mass login got everyone refused for five minutes.
- **In-game mode:** a character can be played in the real game client through L2Swarm's Hook, switched from the dashboard.
- Healers only heal (healer brain), supply watch, raid routines per class, destroyer HP swap before Frenzy, a split
  watchdog that regroups anyone left behind, per-party maps on the dashboard.

## 2026-10-05 — Raids and Kamaloka

- **L2Swarm 3.8.6** installed (fixed the reload leak in part, the Appearing handshake, NPC sells, `/config load`).
- **Daily Kamaloka:** each party leader finds a Kamaloka the whole party fits and runs it once a day (lead-mode travel,
  one monster pulled at a time, healers at range).
- **Raid rules** after the first wipes: walk to ~1500 from the boss, clear every other monster, countdown, then pull;
  never escape from a raid; no resurrection scrolls in a raid; the raid curse (boss and minions) is checked first.
- Destroyer opening (drain, wait for the tank's aggro, then every skill), unreachable bosses are remembered and skipped.
- **Own wall-aware path finder** (`geopath.js`: A* on L2J geodata) served to the bots through a small file-based service;
  raid routes are recorded and reused per boss.

## 2026-10-06 — Routes, records and gear

- **Route editor** on the dashboard (a locked route is never overwritten by a recording), raid log generated from the
  bots' logs, dashboard Kamaloka tab with instance maps and a live view.
- **Gear upgrades:** shop scans, "Common" items for fighters, real sets for casters, Kamael weapon conversion,
  **enchanting** to a safe limit.
- A long server outage taught: a server restart does not respawn raid bosses; test the server before logging in.

## 2026-10-07 — Portable install, more parties, the first DLL patch

- **Portable install:** one `swarm.config.json` (paths, server, ports, accounts, parties, roles; no passwords) and
  `SETUP.cmd` (dry run / `-Apply`), so the whole setup can move to another PC. The script reads its roster from the config.
- A second master account: up to 40 accounts in six parties, new characters created next to old ones by script.
- Funding and transfers between parties by trade, a zone editor (hunting areas, exclusion zones, pull routes), clan
  founding and clan level quests, soul crystal leveling, catacomb guide data, optional hunting pairs.
- **Evening: "all scripts freeze together."** Analysis showed .NET thread-pool starvation inside L2Swarm: every skill
  cooldown parked a pool thread in `Thread.Sleep`. **DLL patch v1** (IL rewrite with Mono.Cecil) moved cooldowns to one
  shared timer and fixed a crash; freezes went from 41 in 11 minutes to zero.
- **Patch v2** and **v3** the same night: one native path search per character (memory explosions), crash guards,
  bounded path search, a handler leak worth ~2 GB/h, and the wrong floor on fallback moves.

## 2026-10-08 — Performance, deadlock, three L2Swarm releases

- **Patch v4:** a JSON snapshot API and a fast `forEach` for scripts, buff lists updated in place, debug events only
  with a listener, shared V8 code cache, a thread-pool floor. `swarm.js` was rewired to use the snapshots.
- **Patch v5:** in-game (Hook) mode fixes (queue limit, failed hooks, safe unmap, auto-login typing only into the game).
- **Patch v6:** the **UI deadlock** that froze member scripts and the MCP server until a restart.
- A **master list** of every change plus an **upstream checker** that tests a new L2Swarm release against all of them.
  L2Swarm 3.8.9 and 3.8.10 took over most of v1–v4; **patch v7** carried only the rest onto 3.8.10, and **v7.1** made the
  MCP server survive client resets (plus a file-based command channel for the dashboard as a fallback).
- Game side: Seven Signs sign-up (Dawn) for every character, catacombs and necropolises, fortress and castle siege
  planning, **dungeon room polygons** and safe spots, cross-floor rescue, a live escape test.
- Dashboard: **command center** (every order for a character, a party or everyone, always confirmed), class icons,
  mobile check of every page, **shape editor** for rooms, spots, zones and **field areas** (outdoor hunting grounds),
  several rooms/areas per choice with rotation.
- Result overnight: CPU −70 %, threads −77 %, no freezes, no restarts.

## 2026-10-09 — L2Swarm 3.8.11 and the first package

- **L2Swarm 3.8.11** checked without touching the live install: it contains the deadlock fix, the hook fixes, the code
  cache and the pool floor, mostly with the code that was sent to the developer.
- **Patch v7.2** for 3.8.11 keeps only what is still missing (14 methods): fallback move floor, MCP accept loop / read /
  call deadlines, snapshot API and fast `forEach`, pool floor 128/64, and a fix for a new 3.8.11 regression (a warning
  logged for every incoming packet of a hooked account).
- Performance report written up; the whole system packaged for other users as **v1.0.0** (this repository).

## 2026-10-10 — Public repository (v1.2.0)

- The repository became **public** under the MIT License, with a fresh history.
- **No L2Swarm files any more:** the pre-patched L2Swarm binaries, the hash lists of L2Swarm releases, the IL-based patch
  sources, the upstream checker and its reports, and L2Swarm's own API reference were removed. NPC strings from L2Swarm's
  `Data\base.db` are now generated locally by `SETUP.cmd -Images`, like the icons and map tiles.
- **L2Swarm 3.8.14** shipped the last open fixes (WPF collection sync, combat-zone map redraw, hook packet events, thread-pool
  floor, a stop/logout freeze), so no patch is needed any more. Our main install runs vanilla 3.8.14.
