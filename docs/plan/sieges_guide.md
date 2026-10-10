# Fortress and castle sieges: user guide (2026-10-08)

> **Status: built, NOT tested.** Clan MyClan is level 1. A fortress siege needs clan level **4**, a castle siege needs level **5**.
> Fortress commanders are **level 78** (681k HP), and siege guards are 72–85 (L2J High Five values; L2Toggle may differ).
> Use the planner and the map now. A real siege comes later.
> Rules, numbers and sources: `docs/plan/sieges_research.md`.

## Where
Dashboard → **Fortresses** (`#/forts`) and **Castles** (`#/castles`). The live view is at `#/siege/live`. A red banner appears on every page while a siege runs.

## What you see
- **World map:** all 21 fortresses and all 9 castles.
  - Gold diamond = territory fortress, blue diamond = border fortress. A large fortress has a bigger marker.
  - Red box = castle. Dashed lines connect each castle to its fortresses.
  - A red ⚑ marks a planned siege. Coloured dots are the party leaders.
  - Tap a marker to select it. Tapping a castle on the Fortresses tab switches to the Castles tab.
- **Detail panel:**
  - type, size, castle, owner (once a bot has seen a "victorious" message), position, nearest teleport landing and the **regroup point** outside the siege zone;
  - a close-up map showing commanders C1–C4, combat flags, the flag pole, gates and doors, NPCs, the landing and the regroup point;
  - **Can we siege it?** (clan level against the requirement, clan leader online, where to register and the fee);
  - the objectives in order, the **skills** the owning clan gets (with effects), functions, rewards (Blood Oath, Knight's Epaulettes, crown and circlets, tax) and the dungeon (quest 511/512);
  - all NPCs and the defenders.
- **Table:** every fortress or castle, with type, castle, commanders, skills, owner and "can register".
- **Rules + sources:** the L2J config values.

## Planning a siege
1. Select the target on the map.
2. **Plan a siege** form:
   - **Siege time** is in this device's time zone (shown). For a fortress, L2J starts the siege **60 min after the first clan registers**, so register first, then plan.
   - **Regroup in Giran (minutes before)** (default 30): when the parties stop what they are doing and go to Giran.
   - **Parties:** tick them. Each row shows online count, levels, tanks/healers/damage dealers, how many are in the clan, and whether the leader has the Command Channel right.
   - **Command Channel leader** is the main leader. He starts the plan by himself and runs the live view.
   - **Flag carrier:** in L2J only the **clan leader (Dagger1)** can raise the flag, so tick party Dagger1 and keep him as the carrier. A backup carrier can also be set.
   - **Engraver** (castle): must be the clan leader.
   - **Who kills which commander:** each party gets its own commander (default: round-robin).
   - **Regroup point outside:** the default comes from the data. "Set on the map" lets you tap the close-up map to place your own.
3. The warnings show everything that would fail, for example:
   - "clan level 4 needed";
   - characters not in the clan (only members of a registered clan can hurt the NPCs);
   - offline characters;
   - no Command Channel right;
   - far below the commanders' level;
   - no healer in a party.
4. **Save plan** writes it to `Scripts/data/siege_plans.json`. The **Planned sieges** list shows the countdown and the bots' run status, with these buttons:
   - **Start now**: sends `!siege plan <id>` to the main party;
   - **Edit**, **Cancel**, **Plan again**, **Delete**.

## Registration
**Register** (detail panel) sends `!siegereg fort|castle <name>` to the clan leader.

The bot first checks the clan level. If it is too low, it stops with "clan level X needed — MyClan is level Y". If the level is high enough, he travels there (town first, then the gatekeeper, then a walk).

- **Fortress:** the Suspicious Merchant: "Yes, I'm a little curious." → "Register …". The first clan pays 250,000 adena. The merchant is only there while the fortress can be registered.
- **Castle:** the castle Messenger + RequestJoinSiege (0xAD). Registration closes 24 h before the siege.

Results are saved to `Logs/siege_registrations.json` and the dashboard shows them. The pages are saved in `Logs/siegereg_*.html`.

## What the bots do (main leader + every chosen party leader, each for his own party)
1. **Regroup** in Giran (the normal Giran regroup).
2. **Travel:** `.town` + the gatekeeper landing nearest the regroup point, then the team walks there. The point is **outside the siege zone**, because L2J teleports attackers inside the zone to town at the start.
3. **Regroup outside:** the main leader waits for every party (max 15 min), opens the **Command Channel** (if he has the right) and gives GO.
4. **Wait for the start:** the start message or the planned time. `!buff` runs 4 min before.
5. **Siege:**
   - Fortress:
     - break the nearest closed outer gate;
     - each party kills its commander, all attacking together (the same focus fire as the raid clear);
     - all commanders must die **within 10 min of the first**, or they reset;
     - when all are dead the command center opens;
     - the carrier picks up the **Combat Flag (9819)**, walks to the flag pole and casts **Flag Display (3318)**, a 3-minute cast; every party escorts him.
   - Castle: gates → Control Towers → the clan leader casts **Seal of Ruler (246)** on the Holy Artifact, while everyone escorts him.
6. **End:** a win, the siege-end message, the main party wiped for 60 s, the siege time over, or `!siege stop`. Everyone then **stops and waits for orders**, like after a raid.

Rules chosen for the bots:
- Nobody escapes while the siege runs (raid rule).
- The dead are raised by the healers. Scrolls are allowed, because a siege is not a raid.

## Commands
| Command (to the main party) | What |
|---|---|
| `!siege plan <id>` | start a saved plan now (Start now button) |
| `!siege fort <name>` / `!siege castle <name>` | quick siege with my party only, starting now |
| `!siege stop` | stop the siege mission (all parties) |
| `!siegereg fort|castle <name>` | (to the clan leader) register the clan |

## Files
- `Scripts/data/fortresses.json`, `castles.json`: the data, plus `staging` from `docs/plan/tools/sieges_data.js`.
- `Scripts/data/siege_plans.json`: the plans.
- `Logs/siege_live.json`: the live view.
- `Logs/siege_runs.json`: plan → bot status.
- `Logs/siege.log`: all events.
- `Logs/siege_registrations.json`, `Logs/siege_owners.json`.

## Not built / to test first
- **Headquarters:** Build Headquarters 247 needs clan level 5 and 300 Gemstone C.
- **Other retail rules:** the large-fort Control Room, the Mercenary Captain, ballista bombs and the contract/independence choice at the Special Envoy after a win.
- **Gates and the flag pole** are static objects with no L2Swarm API. Their ids and HP come from the server packets 0x9F/0x4D, read by a packet hook on the leaders and the carrier only during the siege. The packet layout comes from the client's packet table and is untested; if a field is wrong, the gate HP and the flag pole target will be wrong.
- **Is attacking a gate with `Send.Attack` enough?** Untested.
- **Can a carrier who is not the clan leader raise the flag on L2Toggle?** Untested.
- **Enemy players** are only shown on the live view. The bots do not attack them (that needs force-attack and would flag them).
- **Is L2Toggle different?** Clan levels, the fee, siege times and NPC levels are all unverified there.
