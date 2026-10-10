# Notice

## What is ours (MIT License, see [LICENSE](LICENSE))

The swarm script (`Scripts_dev/swarm.js`), the dashboard (`Dashboard/`), the tools (`docs/plan/tools/`), `SETUP`, `update.ps1`, the
documentation and the guide screenshots, and the generated data files in `Scripts/data/` (except where noted below) were written for this project.

## What is not ours

- **L2Swarm** (`L2Swarm.exe`, `L2Swarm.Core.dll` and everything else in an L2Swarm folder) belongs to its developer. This repository
  contains **no** L2Swarm file, no modified copy of one and no part of its code, and nothing in it changes L2Swarm's program files.
  You need your own L2Swarm install.
- **Game art and client data** (icons, map tiles, item/skill/class tables, NPC strings) are **not** in this repository.
  `SETUP.cmd -Images` generates them on your machine from your own L2Swarm install (`Data/icons.db`, `Data/base.db`, `Maps/`).
  The guide screenshots show the dashboard with such locally generated images.
- **Game data**: spawns, NPCs, teleports, quests and drops in `Scripts/data/` are derived from the **L2J High Five datapack** (L2J Server
  project, GNU GPL v3) and from what our characters saw in game. The datapack-derived data keeps its GPL v3 terms.
  Lineage II is a trademark of NCSOFT Corporation; this project is not affiliated with or endorsed by NCSOFT.
- **morphdom** (`Dashboard/vendor/morphdom.min.js`) is MIT-licensed (Patrick Steele-Idem).

## Hobby project

Made for fun and shared for free. We own only our own code; everything else (Lineage II and its content: NCSOFT; L2Swarm: its
developer; server names: their owners) belongs to its owners. If you own something used here and want it changed or removed, open an
issue.

## No warranty

Provided as is, without any warranty. Running bots may be against the rules of a game server: use this only where the server owner
allows it.
