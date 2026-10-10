# Installing the swarm on a new PC

Everything machine-specific lives in **one file**: `swarm.config.json` in the install folder. The rest (swarm.js, the dashboard,
the PowerShell/node tools, the scheduled tasks) finds its paths and ports from that file or from its own location, so the folder
can sit anywhere (for example `D:\Games\L2Swarm`).

## What you need

| Thing | Where |
|---|---|
| Windows 10/11 | the bot (`L2Swarm.exe`) is a Windows WPF program and needs admin rights |
| L2Swarm 3.8.6 or newer | the L2Swarm installer / `updater.exe` |
| Node.js (LTS) | https://nodejs.org (dashboard, path finder, tools). Python is not needed. |
| The game client (optional) | only for characters that play in game (`clientMode: "ingame"`); out-of-game bots need no client |
| Claude Code (optional) | to drive the bots through L2Swarm's MCP server |

## 1. Copy the folder

1. Install L2Swarm into a folder of your choice (or copy an existing L2Swarm folder).
2. Copy this swarm folder **on top of it**: `Scripts\` (swarm.js + `Scripts\data\`), `Scripts_dev\`, `Dashboard\`, `docs\`, `Geodata\`,
   `Maps\`, `Data\`, `Settings\templates\`, `Settings\*.zmap`, `SETUP.ps1`, `SETUP.cmd`, `swarm.config.example.json`, `CLAUDE.md`.
3. **Giving the folder to someone else? Do NOT copy `Settings\*.xml`, `Settings\settings.xml` or `swarm.config.json`.** The account
   configs hold your encrypted passwords (L2Swarm's encryption key is the same in every copy of L2Swarm, so anyone with L2Swarm can
   use them). `Settings\templates\*.xml` are safe: they have no login, password or character.
   Also leave out `Logs\`, `Dashboard\key.txt` and `Scripts\mcp_script_*.js` (one-off probes).

> **Installing from the release package** (a git clone / zip of the package on top of a vanilla L2Swarm 3.8.11 folder): follow the
> package `README.md` (Install). Steps 1-2 below are then already done; continue with step 3. Updates: `update.cmd`.
>
> **Automatic installer:** the package's `INSTALL.cmd` (`install.ps1`) does steps 1-5 for you: finds the L2Swarm folder, offers
> Node.js/Git via winget, copies the kit in (never over L2Swarm's own files or `Settings\*.xml`), imports your existing L2Swarm
> accounts into `swarm.config.json`, runs SETUP (dry run, then `-Apply` as admin) and starts the dashboard. It asks before every
> change; `INSTALL.cmd -DryRun` only shows what it would do. Details: `docs\QUICKSTART.md` in the package.

## 2. Start L2Swarm once (optional)

Not needed any more: when `Settings\settings.xml` is missing, SETUP writes one (MCP server on, the AutoStart list). Starting
`L2Swarm.exe` once (as admin) and closing it again also works; then make sure the **MCP server** is enabled (SETUP sets the port).

## 3. Write `swarm.config.json`

**Accounts already set up in L2Swarm?** Let the importer write it: `node docs\plan\tools\import_l2swarm.js` (dry run: a table of
login, character, party, role, AutoStart), then the same with `--write`. It reads `Settings\*.xml` + `Settings\settings.xml` (never the
passwords: the accounts keep their own configs, SETUP edits them in place and asks no password), derives the parties from who follows
whom, keeps your L2Swarm group names, and merges into an existing `swarm.config.json` without changing your entries. Choose a character
with `--set login=Character`, a role with `--role login=role`, a party with `--party login=Leader`. Accounts it cannot place get a
TODO (`"role": ""` / `"character": ""`). Then check the result and continue with step 4.

Otherwise copy `swarm.config.example.json` to `swarm.config.json` and edit it. Every field is explained inside the example. The important ones:

- `paths.root`: leave empty (= the folder the file is in).
- `paths.l2Client`: your `l2.exe`, only needed for in-game characters.
- `server`: login IP/port and server id of your Lineage 2 server (the example is L2Toggle).
- `mcp.port` (8083), `dashboard.port` (8090): change them only if those ports are taken.
- `mainLeader`, `clanLeader`, `dailyLeaders`: character names.
- `accounts`: one line per game account:
  ```json
  { "login": "mylogin1", "character": "Tankname", "party": "Tankname", "role": "sk" },
  { "login": "mylogin2", "character": "Healername", "party": "Tankname", "role": "bishop" }
  ```
  `party` is the character name of the party leader (the leader has his own name). Every party becomes an L2Swarm group
  (`"Party <leader>"`, see `groups`). Roles: `sk, bishop, destroyer, doombringer, necromancer, inspector, doomcryer, shilliensaint,
  crafter, spoiler, healer, nuker, dagger`.
- **No passwords in this file.** SETUP asks for them.

## 4. Run SETUP

1. Double-click **`SETUP.cmd`**. This is a **dry run**: it prints every change it would make and changes nothing.
   Check the list (groups, account configs, AutoStart list, scheduled tasks, warnings).
2. Make sure L2Swarm is **not running**, open a **command prompt as Administrator** in the folder and run **`SETUP.cmd -Apply`**
   (from a normal prompt it re-starts itself as admin, which is needed for the scheduled tasks). For every account without a
   config it asks for the password with a hidden prompt. To avoid typing them, set environment variables first in that admin
   prompt, e.g. `set SWARM_PW_MYLOGIN1=...` (or `SWARM_PASSWORD` when all accounts share one); a re-started admin window does not
   see variables set in a normal prompt. Only the encrypted password is written into `Settings\<config>.xml`.
3. Run `SETUP.cmd` again: it should say "nothing to do".

SETUP is idempotent: run it again whenever you change `swarm.config.json` (new account, other party, new role). Every file it
changes is backed up first in `Settings\backup\<date>_setup\`.

What SETUP does:
- creates `Logs\`, `Scripts_dev\` (copy of `Scripts\swarm.js`), `Settings\backup\`, `Settings\templates\`
- creates `Settings\<config>.xml` for new accounts from `Settings\templates\<role>.xml`
- sets in every account config: login, character, group (= party), login server, server id, script paths and zone file path
  of THIS folder, follow settings (members follow their party leader; healers do not assist)
- writes the AutoStart list in `Settings\settings.xml` (all `enabled="false"`: `l2swarm_ctl.ps1` logs the accounts in one by one,
  `login.gapSeconds` apart) and the MCP port
- writes `Settings\client_mode.json`, `Settings\login_gap.txt` and a dashboard key (`Dashboard\key.txt`) when missing
- creates your data files `Scripts\data\<name>.json` from the shipped `<name>.example.json` (once; they are yours from then on),
  deploys `Scripts_dev\swarm.js` -> `Scripts\swarm.js` when `Scripts\swarm.js` is missing, and generates the dashboard images +
  item/skill/class tables from this L2Swarm's `Data\icons.db`, `Data\base.db` and `Maps\` when `Dashboard\icons` is missing
  (`SETUP.cmd -Images` regenerates them; the package ships no game art)
- no L2Swarm patch is needed (use L2Swarm 3.8.14 or newer)
- registers the scheduled tasks **L2Swarm Start / Stop / Restart / MemWatch** for this folder (they let the dashboard and any
  shell start/stop the admin-only L2Swarm without a UAC prompt; MemWatch restarts L2Swarm when it uses too much memory)

## 5. Start

- Bots: `schtasks /run /tn "L2Swarm Start"` (or the dashboard's PC tab). It starts L2Swarm and logs every account in, one by one.
  A manual start of `L2Swarm.exe` logs nobody in (AutoStart entries are disabled on purpose).
- Dashboard: double-click `Dashboard\start.cmd`, or detached:
  `Start-Process node -ArgumentList server.js -WorkingDirectory <folder>\Dashboard -WindowStyle Hidden`.
  Open `http://127.0.0.1:8090` (phone: `http://<PC-IP>:8090/?key=<Dashboard\key.txt>`).
- Claude Code (once per PC): `claude mcp add --transport http --scope user l2swarm-mcp http://127.0.0.1:8083`
  (use your `mcp.port`). Then start Claude Code in the install folder; `CLAUDE.md` is its operating guide.
- Optional 24/7 laptop settings (lid/sleep/Windows Update off): `SETUP_PC_ALWAYS_ON.cmd` (admin). Undo: `docs\plan\tools\pc_restore.ps1`.

## 6. Adding an account later

Add a line to `accounts` in `swarm.config.json`, run `SETUP.cmd` (check) and `SETUP.cmd -Apply` with L2Swarm stopped, then start
again. swarm.js reads the roster (character -> role and party) from `swarm.config.json` when the script starts, so no swarm.js
edit is needed. Characters that do not exist yet: create them in game (or with the dashboard's "add account"), then fill in
`character`.

## Where the paths come from (for developers)

| Code | Root | Ports / server |
|---|---|---|
| `Scripts\swarm.js` | `SWARM_ROOT`: `paths.root` > L2Swarm's own folder (`__DIR__`) > parent of `__SCRIPTS__` | roster/teams/leader from `swarm.config.json` (`SWARM_CFG`) |
| `Dashboard\server.js` | `docs\plan\tools\swarm_config.js` (folder above `Dashboard`) | `dashboard.port`, `mcp.port`, `mainLeader`, parties, `dailyLeaders` |
| PowerShell tools | `$PSScriptRoot\..\..\..`, or `docs\plan\tools\swarm_config.ps1` | `mcp.port`, `server.gameIp/gamePort`, `login.gapSeconds` |
| node tools in `docs\plan\tools` | `__dirname\..\..\..` | - |
| `run_hidden.vbs`, `SETUP_PC_ALWAYS_ON.cmd`, `Dashboard\start.cmd` | their own folder | `dashboard.port` |

Still hardcoded (game data, not machine data): the old per-team constants in swarm.js (`CONFIG.roster`/`teams` defaults,
`daily.hallTeam`, `escortOrder`), the team keys in `Scripts\data\custom_zones.json`, and the one-off team creation scripts
`docs\plan\tools\team3_configs.ps1` / `team45_configs.ps1`. The config overrides the roster/teams/leader at script start.
