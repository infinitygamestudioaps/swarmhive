# Getting started

This chapter explains what the Swarm system is made of, what you need, how to install it on your own PC with your own accounts, how
to start and stop it, how to update it, how to fix the common problems, and which safety rules to keep. Words you may not know are
explained in the [glossary](06-glossary.md).

Contents:
[1. What the system is](#1-what-the-system-is) ·
[2. Requirements](#2-requirements) ·
[3. Install on a new PC](#3-install-on-a-new-pc) ·
[4. swarm.config.json, field by field](#4-swarmconfigjson-field-by-field) ·
[5. Accounts, characters, parties and roles](#5-accounts-characters-parties-and-roles) ·
[6. Scheduled tasks, start and stop](#6-scheduled-tasks-start-and-stop) ·
[7. The dashboard](#7-the-dashboard) ·
[8. Changing swarm.js: Scripts_dev and deploy](#8-changing-swarmjs-scripts_dev-and-deploy) ·
[9. First run checklist](#9-first-run-checklist) ·
[10. Updating](#10-updating) ·
[11. Troubleshooting](#11-troubleshooting) ·
[12. Safety rules](#12-safety-rules)

---

## 1. What the system is

The Swarm system has five parts. Only the first one is a product you buy; the rest is in this install folder.

| Part | What it is | Where |
|---|---|---|
| **L2Swarm** | The commercial multi-account bot (`L2Swarm.exe`, a Windows WPF program). It logs every account in, moves, fights and talks to the game server. It has a JavaScript engine (each account runs its own copy of a script) and an **MCP server** on port **8083** that other programs use to read the bots and send them orders. | `L2Swarm.exe`, `Settings\`, `Data\`, `Geodata\`, `Maps\` |
| **swarm.js** | Our script. One copy runs in every account's window. Each copy looks up its own **role** (tank, healer, destroyer ...) and its **party leader**, and then behaves as that role. In **lead mode** the party leader decides everything; the members follow, assist, defend, rest, rebuff and resurrect. See [Concepts](02-concepts.md). | `Scripts\swarm.js` (live copy) and `Scripts_dev\swarm.js` (the copy you edit) |
| **The dashboard** | A small web server (`Dashboard\server.js`, Node.js) on port **8090**. It shows every party live (map, HP, what each character is doing) and lets you give any order from a PC or a phone. | `Dashboard\` |
| **Data files** | Game data and your own choices that the bots read: hunting zones, dungeon rooms, field areas, raid boss data, gatekeeper menus, routes, gear preferences, sell list, party tactics. Most of them are read **live**, so a change works without restarting anything. | `Scripts\data\` |
| **Tools** | PowerShell and Node.js tools: setup, start/stop/memory watch, deploy, account creation, data generators. | `SETUP.cmd`, `SETUP.ps1`, `docs\plan\tools\` |

Two more things are optional:

- **Claude Code.** An AI assistant can drive the bots through the same MCP server. `CLAUDE.md` in the install folder is its operating
  guide. You do not need it to run the system.

### 1.1 How the parts talk to each other

```
 phone / PC browser ──HTTP──> Dashboard\server.js (port 8090) ──MCP──> L2Swarm.exe (port 8083) ──> game server
                                   │   reads Logs\swarm_state_<Name>.json            │
                                   │   writes Scripts\data\*.json (your choices)      │ runs swarm.js once per account
                                   └── Logs\cmd\inbox.json (backup channel) <─────────┘
```

- Every swarm.js window writes its state to `Logs\swarm_state_<Name>.json` every few seconds. The dashboard reads these files to draw
  the pages.
- An order from the dashboard goes to L2Swarm through MCP. A **party order** is sent as party chat from the party leader (the leader
  and, depending on the command, every member act on it). A **character order** is sent as party chat from that one character.
- When MCP does not answer, the dashboard puts the order into `Logs\cmd\inbox.json` instead. Every swarm.js window checks that file
  once a second and runs what is addressed to it. Logging accounts in or out, and some L2Swarm chat-box commands, still need MCP.
- Windows of the same L2Swarm talk to each other with L2Swarm's App events (for example "I am low on supplies", "I am being hit").

### 1.2 Which L2Swarm version

L2Swarm is a closed program by its own developer, and **this kit contains none of its files**. You need your own L2Swarm install, set
up and updated with its own installer / `updater.exe`. Nothing in the kit changes L2Swarm's program files.

Use **L2Swarm 3.8.14 or newer**. While running 40 accounts we found a number of bugs inside L2Swarm (a UI deadlock, MCP server
hangs, memory growth, hook overhead, a map redraw error) and reported them with their causes; the developer fixed all of them, the
last ones in 3.8.14. Older versions (3.8.10 - 3.8.13) still work, but with those known problems. swarm.js finds out by itself which
L2Swarm it runs on and adapts; there is nothing to configure.

Never switch .NET "Server GC" on for L2Swarm. In our tests one script reload then grew the process to over 20 GB.

### 1.3 Where things are written

| Folder | What is in it |
|---|---|
| `Settings\<Login>.xml` | One L2Swarm config per account (login, encrypted password, character, follow settings, scripts). |
| `Settings\settings.xml` | L2Swarm's global settings: MCP port and the AutoStart list. |
| `Settings\client_mode.json` | Which characters play with the real game client ("ingame"). |
| `Settings\backup\` | Every file our tools change is copied here first. |
| `Scripts\data\` | Data and your dashboard choices (see [1](#1-what-the-system-is)). |
| `Logs\` | `LOG.log` (L2Swarm's main log), `swarm_state_<Name>.json` (live state per character), `intent_<Name>.log` (what each character tried to do, with coordinates), `swarm_errors.log`, `memwatch.log`, `l2swarm_ctl.log` (start/stop), `supervisor.log`, `deploy_swarm.log`, `dashboard_commands.log` (every order sent), and logs per feature (`dungeon.log`, `escape.log`, `supply_runs.log`, `raid_reports\`, `kamaloka.log`, `clan.log`, `dawn.log` ...). L2Swarm's per-character logs (`Logs\<Name>.log`) mix lines from several accounts; search `LOG.log` by login name instead. |

---

## 2. Requirements

| Thing | Notes |
|---|---|
| **Windows 10 or 11** | L2Swarm is a Windows program. |
| **L2Swarm 3.8.6 or newer** | This install runs the version in `version.txt` (3.8.10 at the time of writing). The scripts check the version and adapt. Install or update with L2Swarm's `updater.exe`. |
| **Administrator rights** | `L2Swarm.exe` always asks for admin (its manifest says `requireAdministrator`). Setup therefore registers elevated scheduled tasks once, so that the dashboard and normal shells can start and stop it later without a UAC prompt. |
| **Node.js (LTS)** | From nodejs.org. Needed for the dashboard, the wall-aware path finder (`docs\plan\tools\geopath_service.js`, started by the dashboard) and the tools. Python is not needed. |
| **Microsoft Edge or Google Chrome** | Only for rebuilding this guide (headless screenshots). Any browser works for the dashboard itself. |
| **The game client** | Only for characters that should play in the real game client (`clientMode: "ingame"`). Out-of-game bots need no client. |
| **RAM** | See below. |
| **A Lineage 2 High Five server** | The scripts were built for a High Five server with a free Community Board buffer (Alt+B), free `.townname` teleports and Cabinet settings such as "Follow Party Leader's Dialog" (the L2Toggle server). Many features depend on these server features. |

**Memory.** L2Swarm's memory grows while it runs (about 1 GB per hour with ~40 accounts), and every reload of swarm.js adds more, because each
account's JavaScript engine keeps its memory high-water mark. A PC with 8 GB of RAM crashed after about 165 script reloads in one day.
Plan for:

- **16 GB RAM or more** for 20-40 accounts, and a large Windows page file (tens of GB). L2Swarm can then grow to several GB without trouble.
- **Few script reloads.** Batch your swarm.js changes and deploy them together (see [section 8](#8-changing-swarmjs-scripts_dev-and-deploy)).
- **MemWatch** (a scheduled task) watches the memory and restarts L2Swarm only when the PC is about to run out of memory (see
  [6.4](#64-memwatch-the-watchdog)).

---

## 3. Install on a new PC

Everything machine-specific lives in **one file**, `swarm.config.json` in the install folder. Every other part (swarm.js, the dashboard,
the tools, the scheduled tasks) finds its paths and ports from that file or from its own location, so the folder can be anywhere (for
example `D:\Games\L2Swarm`). The developer version of these steps is `docs\plan\INSTALL.md`.

### Step 1 - Copy the folder

1. Install L2Swarm into a folder of your choice.
2. Copy the swarm files **on top of it**: `Scripts\` (swarm.js and `Scripts\data\`), `Scripts_dev\`, `Dashboard\`, `docs\`, `Geodata\`,
   `Maps\`, `Data\`, `Settings\templates\`, `Settings\*.zmap`, `SETUP.ps1`, `SETUP.cmd`, `SETUP_PC_ALWAYS_ON.cmd`,
   `swarm.config.example.json` and `CLAUDE.md`.
3. **Never copy someone else's** `Settings\*.xml`, `Settings\settings.xml`, `swarm.config.json`, `Logs\`, `Dashboard\key.txt` or
   `Scripts\mcp_script_*.js`. The account configs contain encrypted passwords, and L2Swarm's encryption key is the same in every copy of
   L2Swarm, so anyone with L2Swarm can use them. The files in `Settings\templates\` are safe: they have no login, password or character.

### Step 2 - Start L2Swarm once

Run `L2Swarm.exe` once (it asks for admin) and close it again. It creates `Settings\settings.xml`. In L2Swarm's settings make sure the
**MCP server** is switched on (SETUP sets its port).

### Step 3 - Write swarm.config.json

Copy `swarm.config.example.json` to `swarm.config.json` and edit it. Every field is explained in [section 4](#4-swarmconfigjson-field-by-field).
Put **no passwords** in this file.

### Step 4 - Dry run

Double-click **`SETUP.cmd`**. This is a **dry run**: it prints every change it would make and changes nothing. Read the list: L2Swarm
groups, account configs to create or change, the AutoStart list, client modes, scheduled tasks, and warnings.

### Step 5 - Apply

1. Make sure L2Swarm is **not running**. (While it runs, it saves its own copy of `settings.xml` and the account configs from memory and
   can undo the changes.)
2. Open a **command prompt as Administrator** in the install folder and run `SETUP.cmd -Apply`. From a normal prompt it restarts itself as
   admin, which it needs for the scheduled tasks.
3. For every account that has no config yet, SETUP asks for the password with a hidden prompt. To avoid typing, set environment variables
   first **in that admin prompt**: `set SWARM_PW_DEMO01=...` (one per login, login in capitals) or `set SWARM_PASSWORD=...` when all accounts
   share one password. Only the encrypted password is written into `Settings\<config>.xml`.
4. Run `SETUP.cmd` again. It should report "nothing to do".

SETUP options: `-Apply` (make the changes), `-SkipTasks` (do not create or update the scheduled tasks), `-Config <file>` (another config
file), `-Force` (apply even while L2Swarm runs: not recommended).

**What SETUP does** (it is safe to run again at any time; every changed file is first copied to `Settings\backup\<date>_setup\`):

- creates the folders `Logs\`, `Scripts_dev\` (with a copy of `Scripts\swarm.js` when missing), `Settings\backup\`, `Settings\templates\`;
- creates `Settings\templates\<role>.xml` from your `roleTemplates` (login, password and character removed);
- creates `Settings\<config>.xml` for new accounts from the role's template (with `docs\plan\tools\new_account.ps1`);
- sets in every account config: login, character, L2Swarm group (= party), login server, server id, game client path, script paths and
  zone file path of **this** folder, and the follow settings: members follow their party leader, healers do not assist-attack;
- writes the AutoStart list in `Settings\settings.xml` with every entry `enabled="false"` (the start task logs accounts in one by one,
  see [6.3](#63-staggered-login)) and the MCP port;
- writes `Settings\client_mode.json`, `Settings\login_gap.txt` and a dashboard key file (`Dashboard\key.txt`) when missing;
- registers the scheduled tasks **L2Swarm Start**, **L2Swarm Stop**, **L2Swarm Restart** and **L2Swarm MemWatch** for this folder.

### Step 6 - Optional: a 24/7 PC

If the PC (for example a laptop) should run day and night, double-click **`SETUP_PC_ALWAYS_ON.cmd`** and accept the admin prompt. It runs
`docs\plan\tools\pc_alwayson.ps1`, which:

- sets lid close, sleep, hibernate, hybrid sleep and wake timers to "do nothing" / "never" on all power plans;
- switches off power saving for Wi-Fi, USB and network adapters;
- switches off Windows Update, Store auto-update, Delivery Optimization and automatic maintenance (a forced update reboot logs every bot out);
- registers the four scheduled tasks;
- keeps a backup and a report in `Settings\backup\`. Undo with `docs\plan\tools\pc_restore.ps1` (as admin).

Think about this step: it changes Windows settings for the whole PC.

### Step 7 - Start

1. Start the bots: `schtasks /run /tn "L2Swarm Start"`, or the **Start** button on the dashboard's [PC page](pages/pc.md) once the
   dashboard runs. A plain double-click on `L2Swarm.exe` logs nobody in (on purpose, see [6.3](#63-staggered-login)).
2. Start the dashboard: double-click `Dashboard\start.cmd` (see [section 7](#7-the-dashboard)).
3. Optional, Claude Code (once per PC): `claude mcp add --transport http --scope user l2swarm-mcp http://127.0.0.1:8083` (use your
   `mcp.port`). Then start Claude Code in the install folder.

Then work through the [first run checklist](#9-first-run-checklist).

---

## 4. swarm.config.json, field by field

JSON has no comments, so the example file keeps its help text in keys that start with `//`. These keys are ignored. Here is a complete
example for a small setup with demo values:

```json
{
  "version": 1,
  "paths": { "root": "", "l2Client": "C:\\Games\\L2Client\\system\\l2.exe" },
  "server": { "name": "MyServer", "loginIp": "203.0.113.10", "loginPort": 2106, "serverId": 1,
              "gameIp": "203.0.113.10", "gamePort": 7777 },
  "mcp": { "port": 8083 },
  "dashboard": { "port": 8090, "keyFile": "Dashboard\\key.txt" },
  "login": { "gapSeconds": 8 },
  "mainLeader": "Aldric",
  "clanLeader": "Quill",
  "dailyLeaders": ["Aldric", "Borin"],
  "groups": { "format": "Party {party}", "overrides": { "Quill": "Solo Quill" } },
  "scripts": ["swarm.js"],
  "roleTemplates": { "sk": "Demo01.xml", "bishop": "Demo02.xml", "destroyer": "Demo03.xml", "default": "Demo03.xml" },
  "healerRoles": ["bishop", "shilliensaint", "healer"],
  "legacyConfigs": [],
  "accounts": [
    { "login": "demo01", "character": "Aldric",  "party": "Aldric", "role": "sk", "note": "main leader" },
    { "login": "demo02", "character": "Bryndis", "party": "Aldric", "role": "bishop" },
    { "login": "demo03", "character": "Cassius", "party": "Aldric", "role": "destroyer" },
    { "login": "demo10", "character": "Borin",   "party": "Borin",  "role": "crafter" },
    { "login": "demo11", "character": "Kestrel", "party": "Borin",  "role": "spoiler" },
    { "login": "demo12", "character": "Liora",   "party": "Borin",  "role": "healer", "clientMode": "ingame" },
    { "login": "demo40", "character": "Quill",   "party": "Quill",  "role": "dagger", "note": "levels alone" },
    { "login": "demo41", "character": "", "party": "Aldric", "role": "nuker", "autoStart": false,
      "classPlan": ["Elven Wizard", "Spellsinger", "Mystic Muse"], "note": "character not created yet" }
  ]
}
```

### Top-level fields

| Field | Meaning | Used by |
|---|---|---|
| `version` | Format version of the file (1). | - |
| `paths.root` | The install folder. **Leave it empty**: then it is the folder the file is in. Set it only if the config file lives somewhere else. | everything |
| `paths.l2Client` | Full path of the game client's `l2.exe`. Only needed for characters with `clientMode: "ingame"`. SETUP writes it into their account config. | SETUP, client mode |
| `server.name` | A label for your server. | - |
| `server.loginIp`, `server.loginPort`, `server.serverId` | The login server and the game server id. SETUP writes them into every account config. | SETUP |
| `server.gameIp`, `server.gamePort` | The game server. Only used to test whether the server is up (the reconnect brake, [11](#login-refused-or-mass-disconnects)). | start/stop tool |
| `mcp.port` | L2Swarm's MCP server port (default 8083). SETUP writes it into `settings.xml`. Change it only if 8083 is taken. | SETUP, dashboard, tools |
| `dashboard.port` | The dashboard's web port (default 8090). | dashboard, `start.cmd` |
| `dashboard.keyFile` | The file that holds the dashboard password for phone/LAN access. SETUP creates it when missing. | SETUP, dashboard |
| `login.gapSeconds` | Seconds between two account logins when the bots start. **Never below 5**: the login server refuses mass logins. Default 8 when not set. SETUP also writes it to `Settings\login_gap.txt` (that file wins if you edit it later). | start task |
| `mainLeader` | The character that leads the main party. It is the default leader for every character without its own party, and it may give commands to everyone. | swarm.js, dashboard |
| `clanLeader` | The character that owns (or will found) the clan: clan jobs, clan level, clan quests, sieges. | swarm.js, dashboard |
| `dailyLeaders` | Party leaders whose party can run the daily Kamaloka. The dashboard's [Kamaloka page](pages/kamaloka.md) shows an on/off switch for each. | dashboard |
| `groups.format` | Name of the L2Swarm account-list group per account. `{party}` is replaced by the party leader's name, so `"Party {party}"` gives "Party Aldric". | SETUP |
| `groups.overrides` | Party leader -> another group name, for example a solo character: `{ "Quill": "Solo Quill" }`. | SETUP |
| `scripts` | Script files (in `Scripts\`) every account starts with. SETUP adds missing ones to each account config. Normally `["swarm.js"]`. | SETUP |
| `roleTemplates` | Role -> an existing account config used as the template for **new** accounts of that role. SETUP copies it once to `Settings\templates\<role>.xml` without login, password and character. `default` is used for roles without a template. On a new PC the existing files in `Settings\templates\` are used. | SETUP |
| `healerRoles` | Roles that never assist-attack (FollowAtk off in their config). Default `bishop`, `shilliensaint`, `healer`. | SETUP |
| `legacyConfigs` | Old config files in `Settings\` that SETUP must leave alone. They are never put in the AutoStart list, and SETUP warns if they are there. | SETUP |
| `dailyHallTeam` | Optional. Up to 6 character names that form the team for a Kamaloka **Hall** (Halls allow at most 6 players). | swarm.js |
| `teamRoutes` | Optional. Party leader -> a level-route file in `Scripts\data\`, for a party that should level along its own route, for example `{ "Borin": "support_route_h5.json" }`. | swarm.js |
| `accounts` | One entry per game account (next table). | everything |

### Fields of each account

| Field | Meaning | Default |
|---|---|---|
| `login` | The account login name. **Required.** | - |
| `character` | The character to play on that account. L2Swarm selects it by name. Empty = not created yet (the account is set up, but swarm.js ignores it). | empty |
| `config` | File name of its L2Swarm config in `Settings\`. | login with a capital first letter + `.xml` (`demo01` -> `Demo01.xml`) |
| `party` | The **character name of its party leader**. The leader has its own name here. Parties are always named after their leader. | its own character (= a party of one) |
| `role` | Its swarm.js role (see [5.4](#54-roles)). Without a role swarm.js ignores the character. | - |
| `classPlan` | Optional. The three class names for the class changes at levels 20, 40 and 76, as they appear on the Community Board's Career page, for example `["Elven Wizard", "Spellsinger", "Mystic Muse"]`. Needed for roles whose class depends on the race (`nuker`, and `dagger` if not a human Rogue). | the role's default path |
| `master` | Optional note: which master account it belongs to. | - |
| `autoStart` | `true` = logged in by the **L2Swarm Start** task. `false` = SETUP creates the config, but the start task does not log it in. | `true` |
| `enabled` | `false` = ignored everywhere (SETUP, swarm.js, dashboard). | `true` |
| `clientMode` | `"oog"` = out of game (network only, no game window) or `"ingame"` = the real game client through L2Swarm's Hook button. See [Concepts: client mode](02-concepts.md#client-mode-in-game-or-out-of-game). | `"oog"` |
| `note` | Free text. | - |

swarm.js reads the roster (character -> role, party, class plan) from `swarm.config.json` **every time the script starts**. A new account
therefore needs no change in swarm.js: add it here, run SETUP, start it.

---

## 5. Accounts, characters, parties and roles

### 5.1 Adding an account

**With SETUP (recommended):**

1. Stop L2Swarm (dashboard [PC page](pages/pc.md) -> Stop, or `schtasks /run /tn "L2Swarm Stop"`).
2. Add a line to `accounts` in `swarm.config.json`.
3. Run `SETUP.cmd` (dry run, check the list), then `SETUP.cmd -Apply` as admin. It asks for the new account's password once.
4. Start L2Swarm again.

**By hand with `new_account.ps1`:** `docs\plan\tools\new_account.ps1 -Login demo42 [-Character Name]` creates a ready-to-login config.
Without `-Password` it asks for the password with a hidden prompt (or reads it from the environment variable named by `-PasswordEnv`). It
encrypts the password with L2Swarm's **own** `EncryptPassword` function, the same format L2Swarm writes when you save a config in its
window. Options: `-Template` (another template; default `Settings\templates\default.xml`), `-Scripts` (scripts to start with), `-OutFile`.

**Password rules:**

- Never write a password in plain text in any file (not in `swarm.config.json`, not in notes, not in scripts).
- Never set a password through MCP's `manage_account_config modify Password`: it saves an **empty** password, and the account can no longer
  log in.
- Remember that `Settings\*.xml` files are only as safe as L2Swarm's encryption: do not share them.

### 5.2 Creating characters

A new account usually has no character yet. You have two ways:

- **Dashboard, [Accounts page](pages/accounts.md), "New character":** enter the login (and the password once, only if the account has no
  config yet), the start class, the sex and an optional name. The dashboard creates the config if needed (with `new_account.ps1`), logs the
  account in and loads a small one-off script that creates the character at the character-select screen (it retries every 5 seconds).
  Progress goes to `Logs\create_chars.txt`.
- **Dashboard, [Clan page](pages/clan.md), "New accounts (Academy)":** creates the config, logs in and creates the character from a preset
  class path, adds the account to `Settings\start_extra.txt` (logged in after the normal list) and to `Scripts\data\roster_extra.json`
  (its role), so it levels on its own without editing `swarm.config.json`. Progress goes to `Logs\academy.log`.

After the character exists, put its name into `character` in `swarm.config.json` and run SETUP, so it gets its party, group and follow
settings.

The dashboard sends the password you type to its own server on your PC. Only use these forms on your own PC or your own home network.

### 5.3 Parties and leaders

- A **party** is all accounts with the same `party` value. That value is the party leader's character name, and the party is always called
  by that name ("party Aldric"), in the dashboard and in every message.
- SETUP makes every member follow its leader in L2Swarm (follow distance from the template, FollowAtk on, except healers).
- The **main leader** (`mainLeader`) leads the main party. Every other party leader leads his own party in exactly the same way.
- A character whose `party` is its own name and that is alone is a **solo** character (it levels alone).
- swarm.js forms and repairs the in-game party by itself: the leader invites missing teammates, and members accept invites only from their
  own team. If someone else became party leader, the right leader gets the leadership back.

### 5.4 Roles

The role decides what swarm.js does with a character. The Community Board buff scheme and the default class path come from the role.

| Role | What it does | Board buffs | Default class path (20 / 40 / 76) |
|---|---|---|---|
| `sk` | Tank and usual party leader. Uses Aggression whenever it is ready, area aggro when 2 or more monsters are on him, Ultimate Defense in raids when his HP drops fast. | Defender | Palus Knight / Shillien Knight / Shillien Templar |
| `bishop` | Healer. **Only heals**, never attacks (not even in self-defence): fastest heal on anyone dying, group heal when several are hurt, cures debuffs, Recharge for casters, resurrection. | Mystic | Cleric / Bishop / Cardinal |
| `destroyer` | Melee damage dealer. In raids: lowers its own HP below 30 % first, then opens with Frenzy, Zealot, Guts, Battle Roar and Rage when the tank has the boss. | Warrior | Orc Raider / Destroyer / Titan |
| `doombringer` | Kamael melee damage dealer. | Warrior | Trooper / Berserker / Doombringer |
| `necromancer` | Caster damage dealer; puts debuffs on raid bosses. | Mystic | Wizard / Necromancer / Soultaker |
| `inspector` | Kamael support damage dealer (played as Soul Breaker / Soul Hound): party buffs Dark Weapon and Pride of Kamael, dark debuffs on raid bosses, soul attacks. | Warrior | Trooper / Soul Breaker / Soul Hound |
| `doomcryer` | Orc buffer: Chant of Victory and Magnus' Chant (the board cannot give them), Chant of Life when the party is hurt, the party buff wave in boss fights. | Mystic | Orc Shaman / Warcryer / Doomcryer |
| `shilliensaint` | Healer like the bishop; in raids it also debuffs the boss, but only while everyone is above 80 % HP. | Mystic | Shillien Oracle / Shillien Elder / Shillien Saint |
| `crafter` | Dwarf crafter: keeps its best golem summoned and sends it at the target. | Warrior | Artisan / Warsmith / Maestro |
| `spoiler` | Dwarf spoiler: Spoil and Sweeper on the monsters. | Warrior | Scavenger / Bounty Hunter / Fortune Seeker |
| `healer` | Elven healer, same rules as the bishop. | Mystic | Elven Oracle / Elven Elder / Eva's Saint |
| `nuker` | Mage damage dealer. Set `classPlan` (it depends on the race). | Mystic | (set per account) |
| `dagger` | Fighter, typically a solo character. | Warrior | Rogue / Treasure Hunter / Adventurer |

Healer roles (`healerRoles`) never assist-attack. Party members of every role follow the leader, defend themselves and their teammates, rest
when low, rebuff from the board and resurrect the dead. See [Concepts](02-concepts.md).

---

## 6. Scheduled tasks, start and stop

### 6.1 The four tasks

L2Swarm needs admin rights, so it is started and stopped through four **elevated scheduled tasks**. Anyone (the dashboard, a normal
command prompt, Claude Code) can run them without a UAC prompt. Each task runs `docs\plan\tools\run_hidden.vbs`, which runs
`docs\plan\tools\l2swarm_ctl.ps1 -Action <action>` without a console window. Everything they do is logged in `Logs\l2swarm_ctl.log`.

| Task | Action | What it does |
|---|---|---|
| **L2Swarm Start** | `start` | Refuses if a start already runs or the AutoStart list looks wrong. Starts L2Swarm, waits for MCP, then logs the accounts in **one by one** ([6.3](#63-staggered-login)). Checks three times afterwards that everyone is really in game and logs in the missing ones again. |
| **L2Swarm Stop** | `stop` | A hard stop of every L2Swarm process (a polite close would pop a "really quit?" dialog and re-save `settings.xml`). Also closes game clients that L2Swarm started; a client you started yourself is left alone. Leaves the file `Logs\l2swarm_stopped.flag`, so MemWatch does not start it again. |
| **L2Swarm Restart** | `restart` | Stop, wait 5 s, start. |
| **L2Swarm MemWatch** | `watch` | Runs every 2 minutes ([6.4](#64-memwatch-the-watchdog)). |

Run them from a command prompt: `schtasks /run /tn "L2Swarm Start"` (or `Stop`, `Restart`). The dashboard's [PC page](pages/pc.md) has the
same buttons.

### 6.2 Starting and stopping

- **Start:** dashboard PC page -> Start, or `schtasks /run /tn "L2Swarm Start"`. With many accounts the logins take a while (number of
  accounts x the login gap).
- **Stop:** dashboard PC page -> Stop (a destructive order: it asks you to type YES), or the Stop task.
- **Before a planned stop** (an update, a patch, a long break), send every party to a town first, for example with `!town giran` from the
  dashboard. Characters that are standing in a hunting ground when the connection drops stay in the world for a while and can die there.
- **Never stop or deploy while the Start task is still logging accounts in.** Check with `schtasks /query /tn "L2Swarm Start"`: it must no
  longer say "Running".
- **Never restart during a raid or a Kamaloka run.** The dashboard shows a banner while one is live.

Two optional files control which accounts the Start task logs in:

| File | Meaning |
|---|---|
| `Settings\start_extra.txt` | Extra config paths, one per line, logged in after the AutoStart list (accounts created on the dashboard are added here). |
| `Settings\start_hold.txt` | Config file names, one per line (for example `Demo07.xml`), that are **not** logged in. |

### 6.3 Staggered login

The login server has flood protection. When L2Swarm's own AutoStart logs every account in within a few seconds, the server refuses all of
them for about 5 minutes. Therefore:

- SETUP writes the AutoStart list into `settings.xml` with every entry **disabled** (`enabled="false"`); the start task disables them
  again if needed and keeps a copy in `Settings\backup\settings_before_stagger.xml`.
- The start task opens the accounts itself, one after another, `login.gapSeconds` apart (default 8 s, never below 5; `Settings\login_gap.txt`
  overrides it), in the AutoStart order, main leader first.
- A **manual start** of `L2Swarm.exe` therefore logs nobody in. Always start through the task or the dashboard.
- With no enabled AutoStart account, L2Swarm creates an empty default account called "Bot #1" (no login, no config), and makes a new one
  whenever the list becomes empty. The start task closes it right after the first real account is open, and once more at the end.
- The start task refuses to run when the AutoStart list does not contain the main leader's config, or contains configs of retired
  accounts. This protects you from logging in an old team by accident.
- After a mass disconnect the **reconnect brake** takes over (see [11](#login-refused-or-mass-disconnects)).

### 6.4 MemWatch, the watchdog

The **L2Swarm MemWatch** task runs every 2 minutes and keeps watching every 10 seconds within each run. It logs one line per check to
`Logs\memwatch.log` (`ok` / `WARN` / `HIGH` / `RESTART`). It:

- **starts L2Swarm when it is not running** (a crash), unless the Stop task left `Logs\l2swarm_stopped.flag` or a start is already running;
- **warns** when L2Swarm uses more than 4.5 GB, but does **not** restart just because L2Swarm is big;
- **restarts** L2Swarm only when the PC is about to run out of memory (less than about 3 GB of free commit memory, i.e. RAM plus page file),
  at most once per 30 minutes, and never while a raid or Kamaloka fight is live, unless it is an emergency (below about 1.5 GB);
- **restarts on the UI deadlock** of unpatched L2Swarm versions: when MCP fails 3 times and scripts hang or 5+ characters stopped writing
  their state, it logs `DEADLOCK RESTART` and restarts (at most once per 15 minutes);
- runs the **reconnect brake** after mass disconnects;
- applies the **client modes** (`Settings\client_mode.json`, see [Concepts](02-concepts.md#client-mode-in-game-or-out-of-game));
- raises L2Swarm's process priority to Normal and switches off Windows power throttling for it, so it is not parked on slow cores.

The thresholds are at the top of `docs\plan\tools\l2swarm_ctl.ps1`. Every restart logs all accounts in again, which takes minutes and breaks
what the parties were doing, so keep the restart rules strict.

### 6.5 The script supervisor

The dashboard has its own watchdog for **scripts**: when a character's `Logs\swarm_state_<Name>.json` is older than 90 seconds while the
account is logged in, the dashboard stops and starts swarm.js on that account (`Logs\supervisor.log`). Limits: one restart per character per
5 minutes, 6 per hour in total, and none while L2Swarm uses more than 3 GB (every restart costs memory). To switch it off (for example while
you stopped the bots on purpose), create an empty file `Logs\pause_supervisor`.

---

## 7. The dashboard

### 7.1 Starting it

- Double-click **`Dashboard\start.cmd`**. It reads the port from `swarm.config.json`, opens `http://127.0.0.1:8090` in your browser and runs
  `node server.js` in that window. Closing the window stops the dashboard.
- To run it **detached** (no window), from PowerShell:
  `Start-Process node -ArgumentList server.js -WorkingDirectory <install folder>\Dashboard -WindowStyle Hidden`
- The dashboard also starts the path-finder service (`docs\plan\tools\geopath_service.js`) as a child process; the bots ask it for
  wall-aware routes. It is restarted automatically if it dies.

**Restarting it** (needed after a change to `Dashboard\server.js`): stop the node process that runs `server.js`, then start it again.
Changes to `index.html` and the other page files need only a page reload in the browser.

On an **unpatched** L2Swarm, killing the dashboard while it has an MCP request open can stop L2Swarm's MCP server until L2Swarm restarts
(see [1.2](#12-which-l2swarm-version)). Restart the dashboard when nothing is being sent, or accept that MCP may need an L2Swarm
restart afterwards. Orders still reach the bots through the file channel meanwhile.

### 7.2 Opening it on a phone

- On the PC itself the dashboard needs no password.
- Every other device must send the **key** from `Dashboard\key.txt`: open `http://<PC-IP>:8090/?key=<the key>`. Without the right key the
  server answers "Access denied". Save the full link as a bookmark on the phone.
- The dashboard listens on your local network only as far as your router allows. **Never forward port 8090 to the internet.** Anyone with
  the link and key can give orders to every bot.
- If the phone cannot connect, allow Node.js through the Windows Firewall for **private** networks.

How to use the pages: [Dashboard basics](03-dashboard-basics.md) and the page chapters listed in the [README](README.md).

---

## 8. Changing swarm.js: Scripts_dev and deploy

L2Swarm watches `Scripts\swarm.js`. **Every write to that file reloads the script on every account at once**, which interrupts what they are
doing (walks and purchases start over) and leaks memory. Therefore:

1. **Never edit `Scripts\swarm.js`.** Edit `Scripts_dev\swarm.js`.
2. Batch your changes.
3. Deploy with `docs\plan\tools\deploy_swarm.ps1`, or the **Deploy swarm.js** button on the [PC page](pages/pc.md) (destructive: it asks you
   to type YES).

What the deploy tool checks (every result is written to `Logs\deploy_swarm.log`):

| Check | Result |
|---|---|
| No difference between the two files | "SKIP: no changes" |
| `node --check` finds a syntax error | refused |
| The last deploy was less than 15 minutes ago | refused (the PC page then offers "Deploy anyway?", which forces it) |
| A raid or Kamaloka fight is live (`Logs\raid_live.json` / `kamaloka_live.json` updated in the last minute) | refused |
| Accounts are still logging in (the start lock `Logs\l2swarm_starting.lock` is held) | refused |
| Otherwise | copies the file: a **live reload** on every account |

`-Force` skips the time gap, the live-fight check and the login check (it is still logged). Use it rarely: several forced deploys in a row have
pushed L2Swarm's memory up by gigabytes within minutes. The tool can also do a **restart deploy** (stop L2Swarm, copy, start with the staggered
login) above a memory threshold set at the top of the script; at most one per hour, because it logs every account in again.

After a reload, activities that were running resume from `Logs\activity_<Name>.json`.

**Files that need no deploy.** Almost everything in `Scripts\data\` is read live by the bots: hunting zones, chosen hunting spots, party tactics,
gear preferences, the sell list, Giran routes, raid routes, field areas, dungeon rooms (re-read when the file changes). Change them on the
dashboard; no deploy, no restart.

---

## 9. First run checklist

1. `version.txt` shows L2Swarm 3.8.6 or newer.
2. `swarm.config.json` exists and has your server, your `mainLeader` and every account (no passwords in it).
3. `SETUP.cmd` (dry run) shows only expected changes; `SETUP.cmd -Apply` ran as admin with L2Swarm stopped; a second `SETUP.cmd` says
   "nothing to do".
4. `schtasks /query /tn "L2Swarm Start"` (and Stop, Restart, MemWatch) shows the four tasks.
5. In `Settings\settings.xml`, `<AutoStartEntries>` lists **only** the accounts you want, all with `enabled="false"`.
6. The game server answers (the start task tests the game port only for the reconnect brake; if in doubt, try a login by hand first).
7. Start: `schtasks /run /tn "L2Swarm Start"`. Watch `Logs\l2swarm_ctl.log`: "opened <config>" lines, then "everyone is in game".
8. Start the dashboard (`Dashboard\start.cmd`). The [Parties page](pages/parties.md) shows every party with live HP and positions. A character
   whose row is faded and says "offline" ("not reporting for ... (offline or script stopped)") has no running swarm.js.
9. Look at `Logs\LOG.log` and `Logs\swarm_errors.log` for errors.
10. In game, check once per character: Community Board (Alt+B) -> Cabinet -> Settings. The swarm expects "Follow Party Leader's Dialog",
    "Follow Party Leader's .town" and "Quick Trade" (Party) on. You can switch them for a whole party with `!cabinet <setting> on`.
11. Give a first harmless order from the dashboard, for example `!status` to one party, and see the answer in party chat / the timeline.
12. Give `!level` to one party and watch it regroup in Giran and travel to a hunting spot (the [Parties](pages/parties.md) map and the
    [What they do](pages/what-they-do.md) timeline).
13. Open the dashboard on your phone with the `?key=` link.
14. Check `Logs\memwatch.log` after an hour: memory grows slowly and nothing restarts.

---

## 10. Updating

### L2Swarm

1. Read what changed (the developer's changelog).
2. Send every party to a town (`!town giran`) and wait until no raid or Kamaloka is running.
3. Stop L2Swarm (PC page -> Stop).
4. Back up the install folder (at least `Settings\` and the L2Swarm program files).
5. Run L2Swarm's `updater.exe`.
7. Check `Settings\settings.xml`: AutoStart list and MCP port (run `SETUP.cmd` to see any difference).
8. Start L2Swarm with the Start task. swarm.js reads `version.txt` and adapts by itself.

### swarm.js

Edit `Scripts_dev\swarm.js`, then deploy ([section 8](#8-changing-swarmjs-scripts_dev-and-deploy)).

### The dashboard

Replace the files in `Dashboard\`. A change to `server.js` (or `commands.js`, `sieges_api.js`, `polyedit_api.js`) needs a dashboard restart
([7.1](#71-starting-it)); a change to `index.html` or the other page files needs only a browser reload (the server sends the page with
"no-cache").

### Data files

Files in `Scripts\data\` are read live. Edit them on the dashboard where possible (zones, spots, rooms, routes, gear, tactics, sell list).
The [shape editor](pages/shape-editor.md) keeps the last 50 versions of every file it changes in `Scripts\data\history\`.

### Your accounts

Change `swarm.config.json`, then stop L2Swarm, run `SETUP.cmd` / `SETUP.cmd -Apply`, start again ([5.1](#51-adding-an-account)).

---

## 11. Troubleshooting

Find your symptom, then follow the fix. The dashboard pages that help most: [Parties](pages/parties.md) (live state per member),
[Character page](pages/character.md) (one character in detail), [What they do](pages/what-they-do.md) (timeline of intents), and
[PC](pages/pc.md) (L2Swarm memory, start/stop, deploy).

### The dashboard shows nothing, or "MCP not answering"

| Cause | Fix |
|---|---|
| The dashboard is not running. | Start `Dashboard\start.cmd`. |
| "Access denied" on the phone. | The link needs `?key=` with the exact key from `Dashboard\key.txt`. |
| L2Swarm is not running or still starting. | PC page -> Start, or the Start task. MCP comes up a few seconds after L2Swarm. |
| MCP is switched off in L2Swarm, or the port is wrong. | Run `SETUP.cmd` (it sets the MCP port) with L2Swarm stopped; check L2Swarm's settings. |
| A game client left over from a previous run still holds port 8083. | The Stop task closes clients L2Swarm started; close any remaining `l2.exe` by hand, then start L2Swarm. |
| On unpatched L2Swarm: the MCP server stopped accepting connections after an MCP client was killed. | Restart L2Swarm (planned, parties in town). Fixed in L2Swarm 3.8.12. Meanwhile most orders still work through the file channel. |
| The parties show, but every member row is faded and "not reporting". | swarm.js is not running. Check `Logs\swarm_errors.log`, the script list of an account, and `Logs\supervisor.log`. |

### A character's script is frozen

Signs: its row on the Parties page is faded and says "not reporting for ... (offline or script stopped)"; `Logs\swarm_state_<Name>.json` is older than 90 seconds.

| Cause | Fix |
|---|---|
| The script died or hangs. | The supervisor restarts it after 90 s (see [6.5](#65-the-script-supervisor)). Look in `Logs\LOG.log` for "ExecutionWatchdog" (a script blocked for too long) and in `Logs\swarm_errors.log`. |
| **All** characters froze together, MCP does not answer (unpatched L2Swarm up to 3.8.10). | The UI deadlock. MemWatch detects it and restarts L2Swarm (`DEADLOCK RESTART` in `Logs\memwatch.log`). Until a fixed L2Swarm or the patch is installed, swarm.js makes party members fight with script attacks to make it rare. |
| The supervisor is off. | Delete `Logs\pause_supervisor` if you do not need it any more. |

### L2Swarm's memory keeps growing

| Cause | Fix |
|---|---|
| Normal growth (about 1 GB per hour with ~40 accounts). | Nothing to do. MemWatch restarts only when the PC is nearly out of memory. Make sure the page file is large. |
| Many swarm.js reloads (deploys, saving `Scripts\swarm.js` directly). | Deploy at most every 15-20 minutes, batch your edits, never edit `Scripts\swarm.js`. |
| Sudden jumps of several GB within minutes. | Check `Logs\memwatch.log` and what the parties were doing (long walks with path finding were a cause before). The restart rules in [6.4](#64-memwatch-the-watchdog) handle the emergency. |

### Login refused, or mass disconnects

| Cause | Fix |
|---|---|
| Too many logins at once: the login server's flood protection refuses everyone for about 5 minutes. | Always start through the Start task (staggered login). Keep `login.gapSeconds` at 5 or more. |
| "Login rejected: 3". | The account does not exist on the server, or the login is wrong. |
| The server itself is down or restarting. | The **reconnect brake** (in MemWatch): when 3 or more accounts are offline for 3 minutes, or the game port is closed, it closes them (this stops L2Swarm's own retry storm), waits 3, 6, 12, 24, then 30 minutes between tries, tests the game port, logs **one** account in, and only when that one is in game logs the others in one by one. State: `Logs\reconnect_brake.json`; "brake:" lines in `Logs\l2swarm_ctl.log`. |
| Some accounts were never opened by the start. | The start task checks three times and opens them again. Otherwise use the dashboard's "Log in" order for that character. |

### A character cannot move, or sees no NPCs

| Cause | Fix |
|---|---|
| After a teleport (or a login) the server waits for the client's **Appearing** packet, which L2Swarm does not always send. The character then sees no NPCs or monsters and every move is ignored. | swarm.js sends it automatically after every teleport, after the script starts, and every 20 s while the character sees nothing. Test: the character's NPC list is empty while it stands in a town. |
| The character **sits** (resting). A sitting character cannot walk. | swarm.js stands up before every walk, gatekeeper or `.town`. If you sat a character down by hand, send `/stand`. |
| Wedged in terrain. | swarm.js clicks its way free in 16 directions at several distances and heights for up to 6 minutes, then uses the free `.townname`, and the leader regroups the team in Giran. `/unstuck` is the last resort (a destructive order: it waits up to about 5 minutes in place, then goes to the nearest town). |
| Running into a wall in a dungeon room. | The escape and pull-back code uses the wall-aware path finder; make sure the dashboard (which runs the path finder service) is running. |

### A party will not go to a catacomb or necropolis

The only way in is the **Gatekeeper Ziggurat**, and only characters registered in the **Seven Signs** may use it (on the winning side during the
seal validation period). The swarm signs everyone up with the Lords of **Dawn** during the competition period. Until then such a dungeon is
"closed"; a dashboard choice shows "closed (Seven Signs) -> auto · until <date>". See [Concepts: Seven Signs](02-concepts.md#seven-signs)
and the Seven Signs box on the [Clan page](pages/clan.md).

### A character in in-game mode is not found by name

A character that runs in the real game client (hooked) is reported by MCP as "not logged in" and without its character name, so a call with
its name fails ("No account matches"). Address it by its config path or account id. The dashboard already retries with the config path.

### Trades fail

| Cause | Fix |
|---|---|
| System message 142 "... is on another task": the receiver has a shop window open. | The receiver closes its shop window first and the giver retries 3 times (automatic). |
| The receiver was walking. | Receivers stop, stand up and pause following during a trade (automatic). |
| A hanging trade blocks every NPC click. | swarm.js cancels stuck trades. |
| The server asks for a confirmation. | Switch on Quick Trade (Party) in Alt+B -> Cabinet -> Settings for every character (`!cabinet Party on`). |

### Buying or selling at an NPC does nothing

On some servers L2Swarm's own buy/sell call is silently ignored. swarm.js then sends the shop packets itself. A merchant that does not answer is
skipped for one hour (`Logs\shop_fail.json`). In Giran the characters walk only along the recorded town routes
([Teleports page](pages/teleports.md) -> Giran town routes); a broken route makes them miss the shop.

### A dashboard order "did nothing"

- Every order is logged in `Logs\dashboard_commands.log`, with the answer.
- A party order is acted on by the leader; members only follow. If the leader is busy with something more important (an escape, a raid, a
  supply run), the order waits or is refused. The character's note line and the timeline say why.
- After `!stop`, a party waits for orders until the next order (an automatic pause after a wipe ends by itself after 15 minutes).

---

## 12. Safety rules

1. **Passwords** are never written in plain text, never shown, and never set through MCP. Only `SETUP` / `new_account.ps1` (and the
   dashboard's new-account forms, which call it) write them, encrypted.
2. **Every order on the dashboard asks for confirmation**: it shows who gets it, how many characters, who is busy and will change what it is
   doing, and who is offline. **Destructive orders** (for example `/unstuck`, `/trade`, `/leave`, force attack, `/sellitem`, `/config set` and
   `/config load`, `!enchant`, log out, L2Swarm stop/restart, deploy, the full escape test) need a second confirmation where you **type YES**,
   and the server refuses them without it.
3. **Trades with players outside your own teams** need your explicit decision every time. Trades inside your teams (supplies, adena, gear)
   are automatic.
4. **Do not edit account configs or `settings.xml` while L2Swarm runs.** L2Swarm saves its own copy from memory and overwrites your change.
   Stop it first, then edit (or run SETUP), then start. Copy a file to `Settings\backup\` before you edit it by hand.
5. **Never point an account at another config file** (for example "save config as" a scratch file): the account then uses that file from
   then on. The dashboard refuses `/config save <file>` for this reason.
6. **The AutoStart list must not log in retired accounts.** Keep old configs in `legacyConfigs` and check `<AutoStartEntries>` before a start.
7. **Keep the dashboard key private**, use the dashboard only on your local network, and never expose port 8090 (or the MCP port 8083) to
   the internet.
8. **Do not share** `Settings\*.xml`, `settings.xml`, `swarm.config.json`, `Dashboard\key.txt` or `Logs\` when you give the folder to
   someone.
9. **No restarts or deploys during a raid or Kamaloka**, and none while the Start task is still logging accounts in.
10. Delete configs or accounts only on purpose, after a backup.
