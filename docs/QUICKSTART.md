# Quick start

The fastest way to a running swarm, and how to bring in the accounts you already have in L2Swarm.

---

## Quick start (automatic installer)

**You need:** Windows 10/11, your own L2Swarm folder (3.8.14 or newer recommended, installed with the developer's installer / `updater.exe`,
with its `Data\`, `Maps\` and `Geodata\` folders) and admin rights. Node.js and Git are offered by the installer when they are missing.

1. **Get the kit.** Easiest: download **`SwarmKit-v<version>.zip`** from the [latest release](../../../releases/latest) (it also holds the
   PDF manual) and unpack it anywhere, for example your Downloads folder - the installer copies it into the L2Swarm folder for you.
   Or clone the repository / unpack it **into your L2Swarm folder** directly.
2. **Double-click `INSTALL.cmd`.** It walks through 8 steps and asks before every change (`[y/N]`: just pressing Enter means *No*):

   | Step | What happens |
   |---|---|
   | 1. L2Swarm folder | Uses the folder the kit is in; otherwise it looks in the usual places and on your drives and asks which one. Checks that `L2Swarm.exe` is there. |
   | 2. Node.js, Git | Checks them. When one is missing it offers `winget install` (Node.js LTS is required, Git is optional). Nothing is installed without your *yes*. |
   | 3. Copy the kit | Only when the kit is not already in the L2Swarm folder. Copies the kit's files; **never** touches L2Swarm's own files (`L2Swarm.exe`, its DLLs, `Data\`, `Maps\`, `Geodata\`), your `Settings\*.xml`, `Logs\` or `swarm.config.json`. Files that already exist with other content are only replaced when you say so (old copies go to `Logs\install_backup\`). |
   | 4. Import accounts | Reads the accounts you already have in L2Swarm and shows them as a table (see the next section). You can change characters / roles / parties right there, then it writes `swarm.config.json`. |
   | 5. Review | Opens `swarm.config.json` in Notepad and waits until you close it. |
   | 6. SETUP | Runs `SETUP` as a dry run (shows every change), then - when you say yes - `SETUP -Apply` as administrator (UAC prompt). It stops L2Swarm first if it runs. |
   | 7. Images | Generates the dashboard maps and icons from **your** L2Swarm `Data\` and `Maps\` (when SETUP did not already). |
   | 8. Dashboard | Starts the dashboard and opens **http://127.0.0.1:8090**. |

3. **Start the bots:** `schtasks /run /tn "L2Swarm Start"` (or the dashboard's PC tab). It starts L2Swarm and logs every account in,
   one by one.

`INSTALL.cmd` can be run again at any time: every step checks what is already done and skips it. Useful options:

```
INSTALL.cmd -DryRun                 show what every step would do, change nothing
INSTALL.cmd -Root D:\Games\L2Swarm  use this L2Swarm folder
INSTALL.cmd -SkipTasks              SETUP without the four scheduled tasks
INSTALL.cmd -SkipCopy -SkipImport -SkipSetup -SkipImages -SkipDashboard -SkipPrereqs    skip a step
```

**Passwords:** the installer never asks for, reads or prints a password. Accounts that already have an L2Swarm config keep their own
(encrypted) password in their own `Settings\<name>.xml`. Only when SETUP has to *create* a config for a new account does it ask
for that account's password (hidden prompt, in the admin window) and store it encrypted by L2Swarm's own function.

---

## Import your existing L2Swarm accounts

If you already have your accounts in L2Swarm (one config per account in `Settings\<name>.xml`), you do not have to type them into
`swarm.config.json`. The importer reads them and writes the file for you. The installer runs it in step 4; you can also run it by
hand in the L2Swarm folder:

```
node docs\plan\tools\import_l2swarm.js            dry run: prints the table, writes nothing
node docs\plan\tools\import_l2swarm.js --write    writes swarm.config.json
```

Example table:

```
  #   login          character        party            role           from           auto config
  1   mylogin1       Tankname         Tankname         sk             skills (guess) yes  Mylogin1.xml
  2   mylogin2       Healername       Tankname         bishop         class Bishop   yes  Mylogin2.xml
  3   mylogin3       Nukername        Tankname         TODO           -              yes  Mylogin3.xml
  4   mylogin4       (choose!)        -                TODO           -              no   Mylogin4.xml
```

**What it takes from L2Swarm** (from each account config, never the password):

| `swarm.config.json` | comes from |
|---|---|
| `login` | `<Name>` |
| `character` | `<SelectedCharacter>` - the character that account logs in with |
| `config` | the file name in `Settings\` |
| `party` | who follows whom: accounts that follow (`ActiveFollow` + `FollowName`) the same character are one party, that character is the leader. Someone who follows nobody joins the party whose leader invites it (`SendParty`), else the party most of its L2Swarm group is in, else it is a party of its own. |
| L2Swarm group | kept: when a whole party already has its own group name, it goes into `groups.overrides` so SETUP does not rename it |
| `autoStart` | whether the config is in L2Swarm's AutoStart list (`Settings\settings.xml`) |
| `role` | the class the swarm script last saw for that character (after the first login with the kit), else a guess from the skills in the config's skill lists, else empty (**TODO**) |
| class plan | **never imported or guessed.** Every character starts with *no class plan* (the dashboard shows a warning) and never changes class until you choose and approve its plan on the dashboard's **Classes** page |
| `server`, `mcp.port`, `paths.l2Client` | the login server / MCP port / game client most of your configs use (only for a new `swarm.config.json`) |

**Merging:** when `swarm.config.json` already exists, everything you wrote in it stays as it is. The importer only adds accounts that
are new and fills fields that are empty. It saves the old file to `Settings\backup\<time>_import\` first. `--replace` builds the
account list again from L2Swarm (top-level settings are still kept).

**Odd files are skipped with a warning:** `settings.xml`, copies such as `Name - Copy.xml` / `Name (2).xml` / `Name_backup.xml`,
broken or cut-off XML, files that are not an L2Swarm account config, configs without a login. UTF-8 and UTF-16 files (with or without
BOM) are both read. When **two configs use the same login** (an old team on the same account), the one in AutoStart is used and the
other one goes to `legacyConfigs` (SETUP leaves it alone). When **two logins select the same character**, the second one is set to
`"enabled": false`.

### Choosing the character an account plays

One L2Swarm account = one login. A login can hold several characters; `<SelectedCharacter>` picks the one that logs in.

- **See them:** L2Swarm keeps no offline list of the characters on a login. The kit's script writes one at every login
  (`Logs\chars_<login>.json`); the importer shows those names in the column *other characters on this login*. Before the first
  login only the selected character is known - log the account in once with the kit's script running. Afterwards the importer
  shows them, and the dashboard's **Accounts** page lists every known character in its *Transfer* box (the account table there
  shows the character each login plays now). There is no dashboard button that changes `<SelectedCharacter>` for good: use
  `--set` / `swarm.config.json` + SETUP as below.
- **Choose:** `--set login=Character` (repeatable), or type `mylogin3=Nukername` when the installer asks in step 4, or write the
  name into `"character"` in `swarm.config.json`. Then run `SETUP.cmd -Apply`: it writes the name into that account's
  `<SelectedCharacter>`, so L2Swarm logs in with it from then on.
- **No character yet** (`"character": ""`, shown as *(choose!)*): create it in game or with the dashboard's *add account*, then set
  it as above. SETUP warns about such accounts and the script ignores them until then.
- A login with **several config files**: `--use login=File.xml` picks which file is used.
- For a short switch while the bots run (to hand adena / items from another character), the dashboard's **Accounts -> Transfer**
  switches the running session to that character and back, without changing the config.

### Roles and parties

```
node docs\plan\tools\import_l2swarm.js --role mylogin3=nuker --party mylogin5=Tankname --write
```

Roles: `sk, bishop, destroyer, doombringer, necromancer, inspector, doomcryer, shilliensaint, crafter, spoiler, healer, nuker, dagger`.
An account without a role is not controlled by the script (SETUP warns). Class changes are never automatic until you
approve a plan per character on the dashboard (**Classes** page). `--party` takes the leader's **character** name.

Then: `SETUP.cmd` (dry run) and `SETUP.cmd -Apply` with L2Swarm stopped. For accounts that already have a config, SETUP never asks
for a password; it adds `swarm.js` to their script list, sets the group, the login server and the follow settings (members follow their
party leader; an account without a role keeps its own assist setting).
