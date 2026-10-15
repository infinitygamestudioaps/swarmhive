# New engine: swarm.js inside the brain (brain host), phase 1 + 2 design

Written 2026-10-12. Status: **phase 1 = live pilot (Spoiler6 + Healer6, single runner on 8094, agent v2); phase 2 = built and simulated, not
live.** Code: `Dashboard/brain_host/`, `Scripts/agent2.js` (v2, live), `Scripts_dev/agent2.js` (v3, staged).
Tests: `node docs/plan/tools/test_brain_host.js` (phase-1 scenario, `--mem` memory), `node docs/plan/tools/test_brain_host2.js` (phase-2
paths A-H) and `--pool` (worker pool: watchdog + CPU/memory, real time). API inventory: `docs/plan/new_engine/host_api.md`
(`node docs/plan/tools/host_api_inventory.js`). Phase 2 is summarised in §10-§14.

## 0. Idea in one paragraph

Today every character runs the 26.8k-line `swarm.js` in its own V8 engine inside L2Swarm (about 34 MB heap each, reload leak, one
ThreadPool timer set per window). The v0 brain (`Dashboard/brain.js` + `Scripts/agent.js`) replaces that with a tiny agent and a central
brain, but would need swarm.js to be **rewritten** feature by feature. The brain host avoids the rewrite: it runs the **unchanged**
swarm.js in Node, one `vm` context per character, and a **host shim** emulates L2Swarm's script host on top of the agent connection.
swarm.js does not know it moved. The agent (`Scripts/agent2.js`, about 300 lines) only streams state and events and carries out host calls.

```
 L2Swarm.exe (per character: agent2.js, heap < 2 MB)              Node: Dashboard/brain_host/runner.js
 ┌───────────────────────────────┐   TCP 127.0.0.1:8094          ┌──────────────────────────────────────────────────┐
 │ agent2.js                      │  st / ev / ae / res / cb  ──▶ │ AgentLink ─▶ Mirror (per character)                │
 │  state diffs every 250 ms      │                                │              │                                     │
 │  On* hooks -> ev               │  ◀── call / set / watch ──    │ vm context "swarm:<Name>"  ◀─ host shim (host.js)  │
 │  call: Send.* / FN table       │                                │   swarm.js (compiled once, run N times)            │
 │  reflex: potions if brain gone │                                │ shared: AppBus · vfs read cache · geopath worker   │
 └───────────────────────────────┘                                └──────────────────────────────────────────────────┘
```

## 1. Files

| File | Role |
|---|---|
| `Dashboard/brain_host/runner.js` | TCP server (port 8094), one context per character (created on the agent's first `hello`, kept through reconnects, disposed 10 min after its agent left), compiles swarm.js once, error log `Logs/brain_host.log`. CLI: `node Dashboard/brain_host/runner.js --port 8094 --allow A,B [--shared-parse]`. |
| `Dashboard/brain_host/host.js` | `createHost()`: the global object of one context: every host global swarm.js uses (63, see host_api.md §1), Send proxy, Options proxy, App, AppEvents, File, timers, enums, Point/Point3D, stubs. Records every unknown member in `host.missing`. |
| `Dashboard/brain_host/mirror.js` | The state mirror of one character, filled by agent2's `st` messages (full or diff). |
| `Dashboard/brain_host/entities.js` | L2 entity views (Proxy over mirror data: live like a host object) and `L2EntityCollection` look-alikes (Count, [i], forEach, filter, GetItemBy*, SnapshotJson / snapshotJson). |
| `Dashboard/brain_host/link.js` | The agent connection seen from the brain: calls, results, callbacks, watches; a `NullLink` keeps the watches while the agent is away. |
| `Dashboard/brain_host/appbus.js` | `App.on/emit/emitTo/self` between contexts with L2Swarm's rules (async FIFO, JSON copy, 64 KiB, sender excluded). |
| `Dashboard/brain_host/vfs.js` | `File.*` on Node fs: shared read cache (one string per file for all contexts), optional overlay (simulator: writes go to a temp dir; `isolate: ['Logs']` hides live state files). |
| `Dashboard/brain_host/clock.js` | Timers per context (disposable) on a real or **virtual** clock (simulator), plus a `Date` that follows the clock. |
| `Dashboard/brain_host/geobridge.js` | Optional: answers swarm.js's `Logs/geopath/req_*.json` route requests in a worker thread (same code as `geopath_service.js`). Off by default (live: the dashboard's service keeps doing it). |
| `Scripts/agent2.js` | The per-character script for this engine. **Separate from `Scripts/agent.js`** (v1, brain.js on 8093, used by the live Spoiler6 pilot), not attached anywhere. |
| `docs/plan/tools/test_brain_host.js` | Simulator: fake game world + fake L2Swarm host API running the real agent2.js + the real runner + unchanged swarm.js. |
| `docs/plan/tools/host_api_inventory.js` | Static inventory of the host API swarm.js uses + new-engine coverage check -> `host_api.md`. |
| `Dashboard/brain_host/pool.js` | **Phase 2.** Worker pool front end: one TCP port, one worker thread per party, heartbeat watchdog, cross-worker App relay, main-thread geopath. CLI: `node Dashboard/brain_host/pool.js --port 8094 --allow A,B,... [--bridge] [--stall-ms 8000]`. §10. |
| `Dashboard/brain_host/worker.js` | **Phase 2.** One party in a worker: a headless `Runner` (port null) fed by pseudo sockets; heartbeat + watchdog marker. |
| `Scripts_dev/agent2.js` | **Phase 2, staged.** Agent v3 = v2 + the App bridge (§11) + creature `IsOutOfControl`. Not attached anywhere: `Scripts/agent2.js` (v2) is attached to the pilot and L2Swarm restarts an attached script on every file change, so v3 is copied over only by the pilot owner (§12 step 2). |
| `docs/plan/tools/test_brain_host2.js` | **Phase 2.** Fake game SERVER on the phase-1 world (NPC dialogs, board, shop, trade, warehouse, raid boss, Kamaloka captain) + the mixed-party test + `--pool`. Results: `sim2_last_run.json`, `sim_pool_last_run.json`. |

## 2. Agent protocol v2 (TCP 127.0.0.1:8094, one JSON object per line)

### 2.1 agent -> brain
| `t` | Content |
|---|---|
| `hello` | `{ v: 2, name, objId, accountId (App.self()), version (__VERSION__), cls, level }` |
| `st` | State report, **full** (`full: true`: on connect, `resync`, after an own teleport, every 60 s) or **diff** (only changed values). Sections below. |
| `ev` | `{ h: 'OnSay', a: [args] }` every hook swarm.js uses (22, host_api.md §4) + OnLogin/OnLogout. Host objects in args are serialised (items: ITEM_FIELDS, system message params: generic, packets: hex). |
| `ae` | `{ name, d }` an L2Swarm C# event (`AppEvents.on`) the brain subscribed to. |
| `res` | `{ id, ok, v \| err }` result of a `call` with `want`; a promise result is awaited first (GoToPoint resolves on arrival). |
| `cb` | `{ id, n, args }` L2Swarm called a callback the brain passed (`MoveToPoint` success/fail, `UseItem`, `MoveToNpc`). |
| `log`, `pong` | Diagnostics. |

### 2.2 State sections and cadence (agent2 `report()`, one 62 ms interval, a report every 4th tick = 250 ms, fast edges on the other ticks)
| Section | Content | When |
|---|---|---|
| `me` | `ME_FIELDS` (61 fields: position, HP/MP/CP, level, class, flags, Exp, speeds, hennas, ...) + `Clan {Id, Name, Level, ClanId, AllyName}` (Id since 2026-10-12, audit #12: swarm.js reads Me.Clan.Id) | diff every 250 ms (clan every 6 s) |
| `fl` | IsConnected, IsInCombat, IsEnabled, IsAttacking, IsSitting, IsPartyLeader, IsInParty, IsFollowModeOn, IsFollowMaster, CurrentZone | diff every 250 ms |
| `tgt` | my target's objId | on change, checked every 62 ms tick (fast edge) |
| fast edges | `me` IsCasting / HP / HpPercent / MP / MpPercent / CP, `fl` IsAttacking, `tgt`: a small `st` without `seq` (TIMING 2026-10-12, engine audit #10/#11/#29) | every tick that is no report, only when changed |
| `cr` | creatures: L2Swarm 3.8.10+ `CreaturesList.snapshotJson()` (crtType as number), diffed per objId: `{ set: [new], upd: [[objId, {changed}]], del: [ids] }`. Fields the developer snapshot lacks and swarm.js reads (IsStunned, IsSleeping, IsParalyzed, TargetObjId) are read from the live object for monsters/players within 3000 | every 500 ms; every 250 ms while I fight (IsAttacking / combat stance / casting) |
| `party`, `buffs` | PartyList (snapshotJson or PARTY_FIELDS), BuffsList (BUFF_FIELDS, RemainTime rounded to 5 s) | when changed, checked every 500 ms (every 250 ms while I fight) |
| `inv`, `drops`, `pets`, `skills` | ITEM_FIELDS / DROP_FIELDS / PET_FIELDS (+ pet Skills) / SKILL_FIELDS (full skill objects only when the id:level list changed; a row of a skill on cooldown carries `_el` = its elapsed cooldown, so the brain keeps its cooldown clock, audit #13) | when changed, checked every 1 s |
| `skr` | skill readiness: `{ id: [1] }` ready again, `{ id: [0, ReuseDelay, elapsed] }` on cooldown (the brain counts the elapsed on; the mirror turns IsReady true by itself when that cooldown has run out, audit #27). **elapsed is NOT L2Skill.Elapsed** (review 2026-10-12, L2Swarm 3.8.14 IL): `set_ReuseDelay` folds Elapsed into its start offset and sets it to 0, the cooldown tick zeroes it at the end (only `Progress` counts up, and Progress still holds the LAST cooldown's end value until the first tick), so during a cooldown of my own cast Elapsed reads 0. agent2 `skEl()` measures the elapsed from its own OnMagicSkillUse of that skill (`AG.cdAt`), else uses Elapsed (0 or a SkillCoolTime value): never more than the real elapsed, so the brain never reads a skill ready too early. `ReuseDelay` = the LAST cooldown's length (0 before the skill's first cooldown since login): host.js HOOK_PRE then marks the skill not ready with an unknown length and waits for the agent's next report | every 250 ms |
| `opt` | values of watched Options keys (collections such as CombatSkillsList as rows) | when changed, every 1 s |
| `q` | watched quest states (GetQuestState) | when changed, every 1 s |
| `html` | LastHTML | when changed |

Measured in the simulator: about 0.2 KB/s per agent standing in town, about 1.1 KB/s while fighting/moving (152 KB for 3 agents over the run).

### 2.3 brain -> agent
| `a` | Content |
|---|---|
| `call` | `{ id, fn, args, want? }`. `fn` = `Send.<anything>` or an entry of agent2's `FN` table (StartCombat, GoToPoint, MoveToPoint, UseItem, SayToParty, ClickLink, RunCommand, Select, BuyItem, the combat-zone family, ...). Args are marshalled: `{$p3:[x,y,z]}` Point3D, `{$p2:[x,y]}` Point, `{$ent:'item'\|'mob'\|'npc'\|'char'\|'party'\|'skill'\|'buff'\|'drop'\|'pet'\|'me', objId, id}` the live host object (looked up by objId), `{$fn:n}` a callback. Arrays stay JS arrays (as swarm.js passes them today). |
| `set` | `{ path: 'Options.Key', v }` or `{ path: 'Options.Key[i].Field', v }` (a row of an Options collection, e.g. CombatSkillsList[i].IsEnabled). |
| `watch` | `{ kind: 'opt'\|'quest'\|'appevent'\|'packets', key }`: report this Options key / quest / subscribe this AppEvent / forward OnIncomingPacket (and set Options.EnableJSOnIncomingPacket) while true. |
| `resync` | next report is full. `ping` -> `pong`. `bye` -> the agent disconnects for 60 s (not in the allow list). |

**Sync vs async.** swarm.js reads are synchronous, so every read is answered from the mirror (never a round trip). Actions are
fire-and-forget like L2Swarm's `Send.*`. Where L2Swarm's API itself is asynchronous (GoToPoint / GoToNpc / FindPath promises, MoveToPoint /
UseItem / MoveToNpc callbacks) the shim returns a promise in the context's realm / keeps the callback and the agent answers with `res` / `cb`.
There is no blocking request/response: a sync host call that needs fresh game data is answered from the mirror and, where needed, *subscribes*
the value (`watch`) so the next read is live (GetQuestState, Options keys).

### 2.4 Protocol v3 (phase 2): the App bridge, backward compatible
The version is `hello.v`. v3 agents also send `caps: ['bridge']`. A runner only sends the new messages to an agent whose hello said `v >= 3`
**and** only when it runs with `--bridge`. The agent ignores message types it does not know, so a v3 agent works against the phase-1 runner
and a v2 agent works against a phase-2 runner. Nothing else in the protocol changed.

| direction | message | meaning |
|---|---|---|
| brain -> agent | `{ a: 'bridge', on, names: [...], brain: [accountIds] }` | subscribe `App.on(name)` inside L2Swarm for each name (109 today, generated from the swarm.js source by `appEventNames()`), relay what arrives, but never events whose source account is in `brain`. Re-sent on every attach, so `brain` stays current. |
| brain -> agent | `{ a: 'appemit', name, j, to? }` | my brain context emitted this: `App.emit(name, JSON.parse(j))` or `App.emitTo(to, ...)` inside L2Swarm. L2Swarm sets the source = this agent's account = the context's character, so receivers see the right `e.source.characterName`. |
| agent -> brain | `{ t: 'ap', name, id, sentAtUtc, source, j }` | an App event a swarm.js engine inside L2Swarm sent to this account. The brain delivers it to **this agent's context only** (`AppBus.inject(env, accountId)`), with the original envelope (id, source). |

## 3. The host shim: what answers what

The full per-name table is `host_api.md` (§1 "shim" column, §5 coverage). Summary:

- **Mirror (reads):** Me, Target, all lists, Is* flags, CurrentZone, LastHTML, Options, ItemCount, BuffLow, IsMe, NpcNearby, Distance,
  GetQuestState/HasQuest, IsCharacterReady (= agent connected + L2Swarm connected + Me has objId/Name/ClassId). Entities are views over
  mirror data that diffs update in place, so a reference swarm.js keeps stays live, like a host object.
- **Orders:** Send.* (every method, documented or not), StartCombat/StopCombat, EnableBot/DisableBot (also set the mirror flag at once, as
  L2Swarm does), Attack, UseItem, Select (mirror answer + the real select on the agent), ClickLink, RunCommand, chat functions, BuyItem,
  combat-zone functions, `Options.X = v` (local at once + forwarded; replayed to a new agent after a reconnect).
- **Local:** App bus, File (vfs), timers (`setTimeout/setInterval` return numbers like L2Timer; swarm.js's SCHED keeps working on top),
  `sleep`, console (kept in memory, warnings/errors to the log), enums (numbers), Point/Point3D, Encoding, `__DIR__/__SCRIPTS__/__FILE__`.
- **Events:** the runner calls the context's hook (`globalThis.OnX`) with the forwarded args, after updating the mirror where the event
  implies it (OnTeleportToLocation moves Me, OnDie/OnRevive, OnNpcHtmlMessage sets LastHTML, item lists become item views).
- **Compatibility kept on purpose:** .NET long fields (Count, Price, Exp, DeadSinceMs, ReuseDelay, Elapsed, ItemCount()) come back as
  **BigInt** (swarm.js's `num()` copes; code that forgets it fails the same way as in L2Swarm). crtType is a number (3.8.10 snapshot style;
  SNAP maps it). `Map` is the JS Map (swarm.js already uses `PMap`). `clearInterval` ignores unknown ids (SCHED handles its 'sj' ids).
- **Missing-member log:** any read of a field the mirror does not have, any undocumented Send method, any unknown Options key is counted
  in `host.missing` (and the simulator writes the merged list to `sim_last_run.json`). Probe names swarm.js reads only as an alternative
  spelling (`NpcId`, `Desc`, `TargetId`, `Enchant`, ...) read as undefined without a log entry.

## 4. Shared data and memory

- swarm.js is compiled once (`vm.Script`) and run in every context: the bytecode is shared.
- `File.ReadAllText` hands every context the **same string** for an unchanged file (vfs cache by path + mtime + size, 64 MB cap).
- **2026-10-15 (PERF, AUTOMATION_LOG "CPU + RAM"):** the pool turns `sharedParse` ON by default (`--no-shared-parse` / brain_host.json
  `"sharedParse": false` = off); v2 shares only files under `Scripts\data\` (keyed by path + mtime + size, the vfs hands the runner each text
  >= 100 KB it reads), the entries are WeakRefs (an object nobody holds any more is freed; the old map kept every text + object forever). The vfs
  read cache is 16 MB LRU per worker, files > 2 MB not cached. Broadcast App events go into L2Swarm (bridge) only while a swarm.js engine runs
  there (seen by its own 'ap' events within 2 min). Options writes equal to the mirrored value are not sent again.
- `sharedParse` (runner option, off by default): a context's `JSON.parse` of a text >= 100 KB returns ONE parsed object shared by all
  contexts. It only pays off when swarm.js never mutates parsed data; the memory test hashes every shared object after the run and reports
  mutations. Without it each context parses its own copy, exactly like today.
- Measured 2026-10-12 (`test_brain_host.js --mem`, Node 24, one process, 90 s simulated, fake world + agents in the same process;
  `docs/plan/new_engine/sim_memory.json`). "Big data loaded" = each context also called gearDb, npcString, dangerAt, raidTemplate,
  huntingSpots, grocerSpawns, dungeonRooms, fieldAreas (what a leveling/raiding swarm.js holds):

| contexts | data | shared parse | heap | per context | rss | CPU per simulated second |
|---:|---|---|---:|---:|---:|---:|
| 0 | - | - | 9.6 MB | - | 63 MB | 1 ms |
| 3 | idle in town | off / on | 27.0 / 23.0 MB | 5.8 / 4.4 MB | 109 / 92 MB | 22 ms |
| 12 | idle in town | off / on | 65.5 / 43.3 MB | 4.7 / 2.8 MB | 235 / 160 MB | 92 ms |
| 30 | idle in town | off / on | 145 / 86 MB | 4.5 / 2.5 MB | 374 / 303 MB | 302 ms |
| 12 | big data loaded | off / on | 284 / 75 MB | 22.9 / 5.5 MB | 473 / 246 MB | 115 / 87 ms |
| 30 | big data loaded | off / on | 672 / 121 MB | 22.1 / 3.7 MB | 902 / 332 MB | 349 / 280 ms |

  For comparison: one swarm.js engine inside L2Swarm = 33.6 MB heap (measured 2026-10-12), plus L2Swarm's own per-engine overhead.
  Shared parse brings 30 loaded characters from 672 MB to 121 MB. **One mutation was found:** `fieldAreas()` adds a derived index
  (`FAREAS.byId`) to the parsed field_areas.json. Every context computes the same index, so sharing is harmless here, but it is the rule to
  keep: shared data may only get idempotent derived fields (or the loader copies before it adds). CPU: about 10 ms per character per second
  idle (about 1 % of a core), so one Node thread carries ~60-100 characters; 200 characters need worker threads (see §5, watchdog).

## 5. What cannot be emulated (and how swarm.js copes)

| Thing | In the brain host | Effect / handling |
|---|---|---|
| Fresh values right after an action (bag count after UseItem, Target right after Send.Action) | mirror is up to 62 ms (IsCasting, HP/MP, IsAttacking, Target: fast edges) / 250 ms (other Me fields, flags, skill readiness, creatures + party while fighting) / 500 ms (creatures) / 1 s (bag) old; my own OnMagicSkillUse / OnTargetSelected pre-update IsCasting, that skill's cooldown and Target at the event (agent caps 'assume', corrected by the agent's next tick) | Same class of delay as L2Swarm (it also waits for the server's packets), slightly longer. agent2 marks the bag dirty on OnInventoryUpdate so the next report carries it. Code that polls in loops (all of swarm.js) is fine. |
| A sync call that needs the game (`FindPathSync`, `GetCombatPolygonJson`, `GetCombatSquareZone`) | null / '[]' (logged) | swarm.js does not use L2Swarm's path search any more (`findPathNow` returns null; routes come from geopath). |
| First read of a never-watched Options key / quest | default / null, then live | All Options keys swarm.js reads are pre-watched on attach; quests become live one report later. |
| `OnIncomingPacket` | hex, only while swarm.js enables `Options.EnableJSOnIncomingPacket`; host.js HOOK_PRE decodes it back into a byte array (number[]: `p.length`, `p[i]`) before swarm.js sees it (engine audit #1/#7, 2026-10-12: until then the hex STRING reached swarm.js and every opcode test failed silently) | Character-list capture at character select never happens in the brain (the agent starts in game). Clan/henna/siege captures work since the decode. |
| Synchronous TCP (`TcpClient`) | refused | Only the data-service probe uses it (in try/catch). |
| `Process.Start` (close_board.ps1) | refused unless `allowProcess` | The brain runs on the same PC; allow it for the pilot if the board closing is needed. |
| .NET internals (`__extended_host_functions.type`: ThreadPool, GC, V8 engine) | stubs / null | Diagnostics only (threadpool.log, v8gc.log). Node's GC needs no help. |
| L2Swarm's ExecutionWatchdog (interrupts a runaway engine) | single runner: none (opt-in `--cb-timeout`, ~0.7 ms per callback). **Pool (phase 2): heartbeat watchdog per party worker** | A stuck context stops only its own party; that worker is terminated after `stallMs` and the party reboots in a fresh worker (= a script reload), §10. The runner logs any event handler > 200 ms. |
| App events between the brain and swarm.js still running inside L2Swarm (mixed mode) | **phase 2: bridged** with `--bridge` + agent v3 (§11) | No swarm.js change was needed after all: each brain context's events are re-emitted by **its own** agent, so L2Swarm itself stamps the right source. Without `--bridge` (the phase-1 pilot) still not bridged: then migrate whole teams. |
| UI things (MessageBox, Prompt, Dispatch, SetWindowTitle, ShowBaloonTip) | logged / no-op | Kept as the brain's `title` per character (shown in the report). |

## 6. swarm.js changes

Note: swarm.js keeps changing (it was edited twice by others during this work, e.g. the 3.8.17 movement-handle wrapper around
`globalThis.MoveToPoint`; the shim returns no handle, which is swarm.js's 3.8.14 path). Re-run the inventory + simulator after big edits.

**None were needed.** swarm.js booted, ran its timers, answered commands, fought, walked (geopath), ported and survived a brain restart in
the simulator without a single source change. The runner has a `patch(src)` hook for the day one is needed; such a patch would be written as
`patch_newengine.js` with exact unique anchors (none exists).

Phase 2: still **none needed** for the brain host. The phase-2 simulator found one **live swarm.js bug** that has nothing to do with the brain
host: `stashOpenList` / `whOpenWithdraw` remember clicked dialog links by bypass code only, but L2Toggle renumbers codes on every page, so
Taurin's page-2 "Deposit an item. (Private Warehouse)" (`00`, like page 1's "Private Warehouse.") is filtered out -> "no private deposit
link at Taurin" (Logs/stash.log 2026-10-12 07:02-07:41, 7 characters). Fix (code + text as the key, 2 places, NOT applied):
`patch_newengine2.js` in the session scratchpad; with it the simulator's live-layout deposit succeeds (`test_brain_host2.js --script <patched copy>`).

## 7. Simulator (`docs/plan/tools/test_brain_host.js`)

Fake world: Giran with 4 NPCs, a party of 3 (Crafter1 leader/crafter, Spoiler1 spoiler, Healer1 healer: real roster names, so swarm.js
finds its roles in swarm.config.json), monsters; a small combat model (L2Swarm combat picks the nearest monster in CombatRange, FollowAtk
assists, 150 HP/s); movement at RunSpeed; `.giran` takes the party along (L2Toggle "follow the leader's .town"). Each character runs the
**real** `Scripts/agent2.js` in a vm context with a fake L2Swarm API (the creature snapshot leaves out IsStunned/IsSleeping/IsParalyzed/
TargetObjId like L2Swarm 3.8.10+, so agent2's supplement path is tested). One virtual clock drives everything; the geopath worker is
waited for before virtual time moves on. All swarm.js writes go to a temp overlay; `Logs` is isolated.

Checks (16): contexts boot; agents connected; mirrors filled; swarm.js startup finished (swarm_alive file); window titles; no errors in 42 s;
host actions used; `!status` answered by all 3; field: `!hunthere 1500` acknowledged, the leader fights (combat square + StartCombat + attacks
+ skills), members act (walk back to the middle via a wall-aware geopath route), a monster dies; one agent's socket drops (context kept,
agent back within 7 s); `!town giran` brings all 3 to Giran; brain restart: agents reconnect, swarm.js boots again, `!status` answered again.
Last run: 16/16, 0 errors, 0 missing host members on the exercised paths (`docs/plan/new_engine/sim_last_run.json`). Members the run
found and that were fixed on the way: creature IsStunned/IsSleeping/IsParalyzed/TargetObjId/targetCrt (agent2 supplement + shim resolver),
skill Elapsed (cooldown counted in the brain), drop Template, pet Skills/DisplayName, Options.CombatSkillsList rows (+ row writes),
Context.HasQuest/GetQuestState, item IsQuestItem / skill IsPassive, Options written before the agent connected (replayed on attach).
Phase 1 did not exercise NPC dialogs/teleport menus, shops, trades, warehouse, community board, quests, raids, Kamaloka: phase 2 (§7b) does,
except quests.

### 7b. Phase-2 simulator (`docs/plan/tools/test_brain_host2.js`, 24 checks, ~50 s)

A fake game **server** on top of the phase-1 world (`World2`): NPCs with dialogs in the live L2Toggle formats (taken from saved
`Logs/npc_*.html` / `stash_npc` pages), L2 targeting (first `Send.Action` targets, the second opens the dialog), per-page renumbered board
codes, a shop with BuyList/`OnShopList`, hex packets parsed byte by byte (0x40 buy, 0x37 sell, 0x3B deposit, 0x3C withdraw), a trade state
machine with the L2Swarm AppEvents (TradeRequested / TradeStarted / TradeCompleted), a raid boss + minions whose HP drops gradually, and a
Kamaloka captain that ports the party into the instance. Each path is driven by calling swarm.js's own function inside the character's
context; the agent is the staged v3 (`Scripts_dev/agent2.js`).

| | Path | Result (2026-10-12) |
|---|---|---|
| A | `gkTeleport({text:"Breka's Stronghold"})` at Clarissa: `<fstring>` links resolved via npc_strings.json, `ReqBypassToServer('00')`, teleport | ok; live menu recorded to gk_live/Clarissa.json |
| B | `buffSelf()`: `_bbshome > 11 > 15 > 15` (Buffs, Mystic, Buff Me; codes reused across pages) | ok; 20 buffs, bbs_<name>.html |
| C | `buyAt` via BuyItem; the 0x40 hex fallback when BuyItem is ignored; `openShop` + `sellPacket` 0x37 | ok (3 checks) + shop_<name>.txt |
| D | `stashDepositAt` 0x3B + `whTakeAt` 0x3C (private) | ok; with the LIVE page codes: the swarm.js bug of §6 reproduced |
| E | `giveItems` Crafter1 -> Spoiler1, receiver via `swarm.fund.take` -> `receiveItems`, both contexts in the brain | ok; 100 000 adena moved, both sides `done` |
| F | leaderMission body without travel on Dread Avenger Kraven + 2 Dread Panthers: clear, countdown, `teamStep engage`, `waitBossDead`, finish | ok: outcome `dead`, raid_live_<leader>.json, `swarm.focus` in both members' `raidCtl`, raid report |
| G | `enterKamaloka(kamaloka-46)` at Captain Gosta: 3 pages, party ported in | ok: all 3 inside, kamaloka_live phase `inside` |
| H | mixed party (§11) | ok (6 checks) |

Host members found and fixed: creature `IsOutOfControl` (read by raid_live's bossState; agent v3 supplements it like IsStunned).
Nothing else was missing on these paths: 0 missing members, 0 context errors.

## 8. Migration plan per party

1. **Pilot party** (2-3 characters, low value, e.g. a spoil/heal pair that is not in the clan's App-event web): run the runner by hand
   (`node Dashboard/brain_host/runner.js --port 8094 --allow A,B`), attach `agent2.js` to both characters (MCP `manage_account_scripts`
   create + start; the "existing file" workaround of the v1 pilot), then stop `swarm.js` on them. Never during a raid, never during logins.
2. Watch `Logs/brain_host.log` (errors, slow handlers), the usual swarm.js logs (intent, swarm_buffs, swarm_state: they are written by
   the same code, now from Node), and `brain_host` memory. Success = one day of leveling + a supply run + a town trip with no new error
   kinds and no manual help.
3. Next parties one by one, each with everything it exchanges App events with. A swarm.js change is then a **runner restart** (seconds,
   no L2Swarm reload, no reload leak): `deploy_swarm.ps1` gets a "brain" mode later.
4. When most parties run in the brain: the runner moves into a dashboard child process (like brain.js / geopath), worker threads per party
   (watchdog), and L2Swarm keeps only agent2 (< 2 MB per character).

## 9. Rollback

Per character, exactly like the v1 pilot: stop `agent2.js`, start `swarm.js` again (MCP scripts start/stop). With the brain host down,
agent2 does nothing except potions (after 5 s without the brain), so stopping the runner is always safe; L2Swarm's own follow / combat /
auto-skills keep whatever state they had. No data files change format: swarm.js in the brain reads and writes the same `Logs/` and
`Scripts/data/` files, so a character can move back and forth.

## 10. Phase 2: worker pool + watchdog (`Dashboard/brain_host/pool.js`, `worker.js`)

- **Main thread = network + routing.** One TCP port (the agents' 8094). Main reads only each connection's first line (hello) to learn the
  character, maps it to its party (`swarm.config.json` `accounts[].party`, else the character alone) and from then on copies raw bytes
  between the socket and that party's worker. No JSON parsing on the hot path.
- **One worker thread per party.** `worker.js` runs a headless `Runner` (`port: null`) whose contexts read the bytes through pseudo sockets,
  so all phase-1 code (mirror, host, link, App bus, vfs, timers) runs unchanged inside the worker. All characters of a party share one
  isolate: in-party App events stay local. Events to other parties: the worker's `AppBus.onOut` -> main -> `inject` in the target worker
  (emitTo: only the worker owning that account; broadcast: every other worker). Geopath requests go to ONE geopath worker in main (`--geopath`).
- **Watchdog.** Each worker posts a heartbeat every 250 ms from its event loop. Every timer, event and App callback goes through the runner's
  `invoke` hook, which writes "context N is inside a callback since t" into a SharedArrayBuffer (two Atomics stores, no measurable cost).
  When a heartbeat is older than `stallMs` (default 8 s), main logs `WATCHDOG party P: ... context X inside a callback for N ms`,
  **terminates** the worker (this interrupts even `for(;;){}`) and starts a fresh one 200 ms later. The agents notice nothing: their sockets
  live in main; the new worker gets each hello replayed, attaches, sends `resync`, and swarm.js boots again (= a script reload; it resumes from
  its Logs files; walks/purchases in progress start over). A character that blocks its worker 3 times in 10 min is **quarantined**: its
  agent gets `bye` (reflex-only, like a brain outage) and the party restarts without it until the pool restarts.
  A loop inside a promise continuation (after an `await`) is caught the same way, but the log cannot name the context (marker 0).
- **Per-callback timeout** (`--cb-timeout ms`, single runner and pool): interrupts one callback and keeps the context, like L2Swarm. Off
  by default: Node starts a watchdog thread for every guarded call, measured **~0.75 ms per callback** (vs 0.15 µs plain), too expensive for
  swarm.js's timer rate. Use it to find a culprit, not in production.
- **Measured** (`test_brain_host2.js --pool`, 2026-10-12, real time, the brain in its own child process, fake world + 27 agents in the test
  process; 3 real 9-character parties Tank1 / Tank2 / Char1, idle in Giran with a `!status` round every 15 s, no big data loaded):

| mode | CPU (one core) | per character | RSS | JS heap | per worker |
|---|---:|---:|---:|---:|---|
| pool, 3 workers | 13.7-15.7 % | 5.1-5.8 ms/s | 260-265 MB | 151-158 MB | ~49 MB heap, event-loop use 5-6 % |
| single runner | 12.5-14.0 % | 4.6-5.2 ms/s | 173-194 MB | 109-115 MB | - |

  (three runs). The pool costs ~+10 % CPU and ~+70 MB RSS for 3 workers (each isolate has its own base heap, its own read cache and, with
  `--shared-parse`, its own shared copy). For comparison: 27 swarm.js engines inside L2Swarm = 27 x 33.6 MB = ~900 MB heap.
  Watchdog test (P1, parties Spoiler6 2 + Spoiler2 2 + Crafter1 3, `--stall-ms 4000`): an endless loop in Crafter1's context; while it was
  stuck the other two workers kept running timers and receiving their party's `swarm.pos`; after 4.1 s the worker was terminated with the
  culprit named; party Crafter1 was back (3 contexts, agents never reconnected) and answered `!status` again.

## 11. Phase 2: App bridge for mixed operation (`--bridge`, protocol v3, §2.4)

Characters still running swarm.js inside L2Swarm and contexts in the brain see each other's `swarm.*` events:
- **brain -> L2Swarm.** Every emit of a context reaches `Runner.busOut` after local delivery. Broadcast: the context's **own** agent gets
  `appemit` and calls `App.emit` inside L2Swarm, so L2Swarm stamps the context's own account/character as the source (no source rewrite and
  no swarm.js change needed). `emitTo(target)`: if the target is a brain account (this runner or any pool worker) it is delivered in the
  brain only; otherwise the agent calls `App.emitTo(target)`.
- **L2Swarm -> brain.** Each v3 agent subscribes the names (`bridge` message) and relays what its account receives as `ap`; the brain hands it
  to that agent's context only. A broadcast from an L2Swarm engine therefore reaches every brain context exactly once (through its own agent),
  an `emitTo` exactly its target.
- **No loops / duplicates.** A brain context's broadcast re-emitted in L2Swarm also reaches the other brain characters' agents. Two filters
  drop it: the agent skips sources listed in `bridge.brain`, the runner skips sources that are brain accounts (`bridgeLoopDrops`).
- **Simulated** (H, `test_brain_host2.js`): the leader Crafter1's swarm.js runs in a second runner whose App bus IS the fake L2Swarm bus
  (= "inside L2Swarm"); Spoiler1 + Healer1 run in the brain with `--bridge`. Checks: `swarm.pos` both ways (`livePos` filled on both
  sides); exactly-once delivery with the right `source.characterName` for L2Swarm broadcast, brain broadcast, brain `emitTo` L2Swarm and
  L2Swarm `emitTo` brain; a `teamStep` from the L2Swarm leader answered by both brain members (`swarm.team` in, `swarm.team.ack` out); 0 errors.
- Names: 109 today, generated at start from the swarm.js source (`App.on/emit/emitTo('...')` + every `'swarm.x'` string, so names held in
  variables are included). A name built at run time from parts would not be bridged (none exists today).
- Latency: L2Swarm -> brain is immediate (the agent writes from its App.on callback); brain -> L2Swarm waits for the agent's next 62 ms tick (125 ms before the TIMING fixes of 2026-10-12).

## 12. Moving ONE WHOLE PARTY live (step by step)

Rules first: never during a raid / Kamaloka / a supply run of that party, never while accounts are logging in, no L2Swarm restart (none is
needed; memory `no-restarts`), the dashboard's geopath service must be running (the brain does not answer geopath unless `--geopath`).
Pick the party on the dashboard; note its characters (`swarm.config.json` `accounts[].party`). Below, PARTY = their names, comma separated.

1. **Simulate first** (2 min): `node docs/plan/tools/test_brain_host.js` (16/16) and `node docs/plan/tools/test_brain_host2.js` (24/24) on
   the current `Scripts_dev/swarm.js`.
2. **Agent v3** (only once, coordinate with the pilot owner): keep the v2 file (`Settings/backup/agent2_v2.js`), then copy
   `Scripts_dev/agent2.js` over `Scripts/agent2.js`. L2Swarm restarts the attached agents (the pilot's); they reconnect within ~3 s and
   their contexts are kept (against the phase-1 runner v3 behaves exactly like v2).
3. **Brain process with the bridge.** The agents always connect to 8094, so the new process REPLACES the pilot runner (short outage of the
   pilot = agent reflex mode for a few seconds, swarm.js reboots in its contexts):
   - stop the running runner (`Stop-Process` on the `runner.js --port 8094` node process);
   - start it detached (PowerShell): `Start-Process node -ArgumentList 'Dashboard\brain_host\pool.js','--port','8094','--allow','Spoiler6,Healer6,PARTY','--bridge' -WorkingDirectory C:\L2Swarm -WindowStyle Hidden`
     (pool = one worker per party + watchdog; `runner.js` with the same flags also works for 1-3 parties, without the watchdog);
   - check `Logs/brain_host.log`: `brain host pool listening on 127.0.0.1:8094`, `worker for party Spoiler6 started`, `agent Spoiler6 connected (v3, ...)`.
4. **Per character of the party, one at a time** (MCP; read the result after each call):
   a. `manage_account_scripts stop swarm.js` on the character FIRST (so the character is never driven twice);
   b. attach + start the agent with `node docs/plan/tools/attach_agent.js --names <Name> --apply` (engine audit #20, 2026-10-12). NEVER the
      "existing file" workaround of CLAUDE.md §6 for agent2.js: it rewrites the SHARED `Scripts/agent2.js`, and L2Swarm then restarts the agent
      of EVERY character already moved (13:26 on 2026-10-12: 44 disconnects in 40 s, O(N^2) engine restarts over a migration). The tool only
      starts an agent that is already attached, otherwise it creates the character's own copy `Scripts/agent2_<Name>.js` (a new file restarts
      nobody else); it stops swarm.js first and refuses while a raid / Kamaloka is live. A new agent version is then deployed as before to
      `Scripts/agent2.js` and copied into the per-character copies with `attach_agent.js --sync --apply` (each reloads only its own character);
   c. `Logs/brain_host.log`: `context <Name> created`, `agent <Name> connected (v3, ...)`; `Logs/swarm_alive_<Name>.txt` gets a new line.
   Characters already moved and those still in L2Swarm talk through the bridge meanwhile, so the order does not matter; doing the leader
   last keeps the party's orders in one place longest.
5. **Verify** (10 min): party chat `#!status` (every member answers once; the same reply is throttled for 5 min); the dashboard party row is
   live (swarm_state / intent files are written by the same code); `Logs/brain_host.log` has no `ERROR` / `WATCHDOG` lines; clan leader /
   fund / loot events still arrive (bridge counters: pool `stats`, runner `st.bridgeIn/Out`); L2Swarm memory drops ~35 MB per character.
6. **Watch for a day** (leveling + a supply run + a town trip, §8 step 2). ~~A swarm.js change for the brain parties = deploy to
   `Scripts_dev/swarm.js` + restart the brain process~~ **Changed 2026-10-12 (engine audit #23/#33/#32):** the pool runs the DEPLOYED
   `Scripts/swarm.js` (dashboard: `--script Scripts/swarm.js --watch-script 5000`), read + syntax-checked ONCE in the pool's main thread and
   handed to every worker, so every party runs the same version as L2Swarm. A normal `deploy_swarm.ps1` copy reaches the brain by itself: the
   changed file is reloaded party by party (3 s apart; IPC `{k:'reload'}` does it at once). A file that does not compile is refused
   (`SCRIPT ... does NOT compile` in `Logs/brain_host.log`), the last good version keeps running; worker restarts back off (200 ms twice, then
   5 s doubling, max 5 min). The dashboard supervisor never starts swarm.js inside L2Swarm for a brain character: it asks the pool (IPC
   `revive` = restart that party's worker; quarantined = alert in `Logs/supervisor.log`), or restarts a pool without IPC at most every 15 min.
   The new arguments + IPC apply from the next dashboard restart. Test: `node docs/plan/tools/test_engine_ops.js`.

**Since 2026-10-13 (engine default, v1.6.2) the steps above are automated** for whole installs: `Scripts/data/brain_host.json`
`"allowAll": true` (the package default) = every character of `swarm.config.json` (+ `"allow"`, minus `"except"`; rules in
`Dashboard/brain_host/supervise.js`, the dashboard and `pool.js --roster` re-read the roster live). Running accounts are moved one by one
with `node docs/plan/tools/attach_agent.js --all --apply` (dashboard PC tab -> New engine; swarm.js stopped and checked stopped before each
agent starts; refused in a live raid / Kamaloka and without a running pool); with L2Swarm stopped `SETUP.cmd -Apply` switches the account
configs (`docs/plan/tools/engine_mode.ps1`). Until an account is moved, the dashboard supervisor treats it as an L2Swarm character (it
restarts its swarm.js) even though the config names it. `update.ps1` migrates only an untouched old default (`engine_default.js --migrate`).
Test: `node docs/plan/tools/test_engine_default.js`. Owner's install: an explicit `"allow"` list (no `allowAll`) keeps working unchanged.

## 13. Rollback

- **Everything (2026-10-13):** `brain_host.json` `"on": false`, then `attach_agent.js --back --names A,B,... --apply` (stop the agent -
  checked - then start swarm.js), or `SETUP.cmd -Apply` with L2Swarm stopped. One character with `allowAll`: put it in `"except"`.

- **One character:** `manage_account_scripts stop agent2.js` (or its `agent2_<Name>.js`), then `start swarm.js` on it (seconds; swarm.js resumes
  from its Logs files). The brain stops counting that account as a brain account ~10-15 s after its agent went (runner `linkGraceMs` +
  sweep; pool 'gone' -> every worker's brain list + every agent's `bridge.brain`), so its swarm.js events reach the brain characters again
  and their emitTo to it is bridged (engine audit #22/#31; before, it stayed invisible until the pool restarted). The dashboard transfer job
  restarts exactly the scripts it stopped (agent2 on a brain character, not swarm.js).
- **The whole party:** the same for each character. The brain process may keep running for the other parties.
- **The brain process misbehaves:** stop it (`Stop-Process` on the pool/runner node process). Every agent falls back to reflex mode (potions
  only) within 5 s; L2Swarm's own follow/combat keep going; then restart swarm.js on the moved characters (above), or start the phase-1
  runner again for the pilot: `node Dashboard/brain_host/runner.js --port 8094 --allow Spoiler6,Healer6`.
- **Agent v3 -> v2:** copy `Settings/backup/agent2_v2.js` back to `Scripts/agent2.js`. v2 agents work with every runner/pool (no bridge).
- No data file changes format in either direction.

## 14. Limits and what is still not emulable / not tested

- **Not emulable** (unchanged from §5): `FindPathSync` / `GetCombatPolygonJson` / `GetCombatSquareZone` (null), character-select packet
  capture, synchronous `TcpClient`, `Process.Start` unless `--allow-process`, .NET internals. UI calls are no-ops.
- **Watchdog granularity:** a stuck context costs its whole party a reboot (all its contexts restart), not just itself; L2Swarm interrupts
  only the one engine. Stalls shorter than `stallMs` are not caught (the runner only logs handlers > 200 ms).
- **Memory across workers:** the vfs read cache and `--shared-parse` are per worker (per isolate), so N workers hold N copies of big data.
- **Fake server fidelity:** dialogs, board pages and packet layouts follow the saved live pages and swarm.js's own packet builders;
  L2Toggle edge cases (system messages 142/149 mid-trade, full warehouse, Quick Trade timing, follow-the-leader dialog teleports) are only
  partly modelled. Quests, the Kamaloka fight inside the instance (`instanceFight`, inside rebuff), raid travel/routes and wipes, the clan
  warehouse and MPCC/joint raids are not simulated.
- **Not simulated together:** the pool with `--bridge` (test H uses the single runner; the pool relays App events between its workers with
  the same `onOut` / `inject` code, and each worker runs the same `busOut` / `bridgeIn`).
- **The live pilot runs agent v2:** no bridge and no `IsOutOfControl` for Spoiler6/Healer6 until §12 step 2.
- Agent v3 has NOT run inside the real L2Swarm yet (only in the fake host): `App.on` from an agent account, the envelope fields
  (`e.id`, `e.sentAtUtc`, `e.source.scriptId`) and `App.emitTo` to another master account's id must be confirmed on the first live start
  (bridge counters and `Logs/brain_host.log` show it; no game command is involved).

## 15. Live fix 2026-10-12 15:44: every `Send.*` order failed ("f.apply is not a function")
- **Symptom:** brain-hosted characters hunted fine (L2Swarm combat via the FN table: StartCombat/EnableBot/follow), but `.townname`
  (townCommand -> `Send.Say2`) never moved them, straight walking (walkDirect -> `Send.MoveBackwardToLocation`), NPC clicks (`Send.Action`),
  skills (`Send.RequestMagicSkillUse`), shop/trade packets (`Send.SendHex`, `TradeDone`) did nothing. Only GoToPoint (FN table) moved them,
  which is why Spoiler5 crept ~1100 units in Giran.
- **Root cause:** agent2 v3 ran `f.apply(Send, args)`. ClearScript host methods are callable but are not JS functions: no `apply/call/bind`.
  Every `Send.*` threw; the fire-and-forget path swallowed it until the 15:35 log fix (`Logs/brain_host.log`: 'call Send.X failed: f.apply is
  not a function' for every Send method of all 10 characters). The simulator missed it because its fake `Send` methods were plain JS functions.
- **Fix:** agent2 `callArgs(o, k, args)` = a plain member call with the exact argument count (trailing undefined dropped); FN `MoveToPoint`
  passes only the given args (4 overloads); FN GoToPoint/Select/SetCombatRange treat null as missing; host.js `fwd()` drops trailing undefined
  args (JSON made them null). Simulator: `HOSTLIKE` (default; `--jsfn` = old behaviour): fake host methods have no Function prototype and
  GoToPoint never settles (3.8.14). `test_brain_host.js --agent <file>` tests a staged agent. Old agent in the new sim: 14/16 (town 0/3,
  members never move); fixed agent: 16/16, test_brain_host2 24/24.
- **Live check (Spoiler6 + Healer6, 15:45-15:59):** 0 'call failed' lines; `!park grocer`: .giran (after fighting off Spider Nest mobs, 2nd try)
  landed in 1.5 s, recorded route to Helvetia 3123 units in 63 s, Helvetia answered; `!supply`: route walk, Helvetia shop (1 buy), team
  steps answered by Healer6, hand-out done; `!level`: .gludio -> Bella -> Dark Elf Village -> Jasmine -> Spider Nest, team walk, hunting.

## Identity fixes (engine audit #20/#21/#22/#24/#30/#31/#36/#39, 2026-10-12)

- **Account id changes (#21/#30/#36):** an agent that says hello with a NEW runtime account id (L2Swarm restart, account close/open) re-keys
  its context: AppBus member + `App.self()` move to the new id, the old id stays an alias (an `emitTo(oldId)` still arrives), the pool's
  `accounts` and every agent's `bridge.brain` list get the new id at once. Before, the context kept the old id and each of its broadcasts
  reached every other brain context twice (bus + bridge). Log line: `agent account id changed <old> -> <new> ... re-keyed`.
- **Brain accounts follow the agent (#22/#31):** an account counts as a brain account only while its agent is connected or lost less than
  `linkGraceMs` (10 s). Then the worker posts `{k:'gone', ids}`, the pool drops the ids and pushes the new list; `bridgeHello` sends only
  live ones. Dispose posts 'gone' too. A rolled-back character's swarm.js events reach the brain again; emitTo to it is bridged.
- **Worker restart replay (#24):** main keeps the start of each connection's current partial line and the chunks that arrive while its party
  has no live worker (max `bufMaxAgeMs` 15 s / `bufMaxBytes` 4 MB) and replays them line-aligned after the hello; cross-party App events
  for such a party are queued (`appQueueMax` 2000, same age limit); the party's live accounts stay brain accounts through the restart; App
  events / appemit lines a dying generation already produced are still relayed. Events for a context right after its (re)attach wait for
  its first state report (`heldMs` 3 s), so they are not dropped as "not connected".
- **Call ids (#39):** one counter per module load starting at `Date.now()*1000` (link.js), so an answer of an old link / worker never matches
  a newer call (`st.stale`).
- **Attaching agents (#20):** `docs/plan/tools/attach_agent.js` (§12 step 4b). The transfer job restarts exactly what it stopped.
- Test: `node docs/plan/tools/test_engine_identity.js` (34 checks; `--bh <dir> --server <file>` runs it against another copy, e.g. the
  backups in `Settings/backup/engine_fixes_2026-10-12/identity/`, where 21 of them fail).

## Resilience fixes (engine audit #17/#25/#26/#35/#37/#38/#40, 2026-10-12)

- **Brain ping + silent-brain reflex (#25):** the runner sends `{a:'ping'}` to every connected agent each second from the thread that runs
  the contexts. agent2 (v3, `Scripts_dev/agent2.js`) treats a brain that pinged on this connection and then sent NOTHING for 3 s as stuck
  (a blocked worker: its socket lives in the pool's main thread and stays open) and drinks HP / MP potions itself, like a lost socket. An old
  brain that never pings never triggers it. Live only after the agent file is deployed.
- **Who stalled (#37):** the worker marker is 32 bytes: besides "inside a callback" it keeps the context whose callback ran LAST (cleared in
  the next `setImmediate`), and agent bytes are marked with their connection's context. A stall in code after an `await` is now logged as
  `context X after an await ...` and counts for the quarantine (before: "no context ...", never counted, restarts forever). Unnamed stalls
  and repeated restarts back off (§12 step 6) and raise an ALERT.
- **Quarantine in a fight (#25):** if the stalling context's party has a live raid / Kamaloka / epic (`Logs/{raid,kamaloka,epic}_live_<party>.json`
  < 30 s old), ONE stall quarantines it (bye = potion reflex) so it cannot take the party down a second time mid-fight. A quarantine now ends
  after 30 min (`quarantineMs`); a script reload lifts it too. A blocked thread cannot be cut out of a worker, so the rest of the party still
  restarts once; the raid resume below brings everyone straight back.
- **Raid resume (#25, swarm.js patch `patch_engine_resilience.js`):** every window in a raid fight keeps `Logs/raidfight_<Name>.json` fresh
  (3 s); after a restart (< 45 s old) it re-runs the engage step (`engaged:true`: raid mode, tank aggro, focus, healer raid rules) BEFORE
  the 20 s resume sleep; the leader waits for the boss again and finishes the raid (loot, report; a raidhunt / circuit goes on).
- **Spot resume (#17, same patch):** `Logs/activity_<Name>.json` also holds the spot being hunted + the rotation state; the first pick after a
  restart keeps it while the leader stands in it, the level fits, it is not on the skip list and no dashboard choice points elsewhere (zone
  setup only, no trip / Giran regroup).
- **Live allow list (#26/#35):** the pool gets `--config Scripts/data/brain_host.json` and re-reads it every 5 s: a character added is
  accepted at its next hello, a character removed gets its context disposed in its worker (OnBeforeScriptStop while its agent is still
  connected) and then `bye`; nobody else restarts. An unreadable file changes nothing. The dashboard (rules in
  `Dashboard/brain_host/supervise.js`) restarts the pool only when on / bridge / pool mode / maxRssMb change, keeps the last good config on a
  failed read, and DEFERS that restart while a brain party has a live raid / Kamaloka / epic (max 45 min). NOT fixed: a dashboard restart
  still ends the pool (it is a non-detached child with the IPC channel the supervisor needs, audit #32).
- **Observability + memory guard (#38):** `--stats-file Logs/brain_host_stats.json` (every 10 s: pid, RSS, counters, per-worker heap / ELU /
  contexts, quarantined + until, restarts, last 20 alerts) -> `GET /api/brainhost` (+ IPC health); `perf_samples.jsonl` gets
  `brainHostMB`, `brainChars`, `brainMbPerChar`, `brainAlerts`, and `mbPerChar` now divides L2Swarm's memory by the non-brain characters only.
  `--max-rss-mb N --mem-restart` (dashboard: `maxRssMb` in brain_host.json, default 3000): ALERT above N, then the biggest worker WITHOUT a
  live fight restarts (max once per 10 min). `--shared-parse` stays off (its mutation audit is still open, §4).
- **Orphan dispose (#40):** a context disposed while its agent is gone (> 10 min) skips OnBeforeScriptStop (its L2Swarm writes would be
  dropped while swarm.js cleared `Logs/castloop_l2s_off_<name>.json`); the record stays for the next context to undo.
- **Review (2026-10-12):** the memory guard restarts only a worker that STANDS OUT (heap >= 2x the median of the other workers, or >= half
  the limit = a leak); a pool that is big because of its real load (~90 MB per character live) only gets the alert, since a restart would free
  nothing and reboot a party every 10 min. A live-fight file counts under the party key AND under every character of the party / brain list
  (swarm.js names it after the writer, `liveFileName()` = the leader's Me.Name). The spot save only updates an autolevel record that is still on
  (a `!stop` that cleared it is never undone).
- Test: `node docs/plan/tools/test_engine_resilience.js` (51 checks, ~28 s; `--bh <dir> --agent <file> --swarm <file>` runs it against the
  backups in `Settings/backup/engine_fixes_2026-10-12/timing/`, where the checks of every finding fail).

## 16. Engine latency review (ENGINELAT-2026-10-13; AUTOMATION_LOG.md 2026-10-13 22:15)
- **Root cause of the casts' "no answer":** agent2's creature job read IsStunned / IsSleeping / IsParalyzed / IsOutOfControl / targetCrt on CreaturesList
  items. L2Swarm 3.8.18 does not expose them there (L2Mob : L2Creature has none; L2Character's are hidden by ClearScript's type restriction to
  L2Creature) -> always undefined, ~230 us per failed read -> ~390 ms CPU per second per fighting agent -> L2Swarm saturated the PC -> 3-6 s agent
  ticks -> orders and events waited. Removed (same values, no reads). `patches/tools/perf/AgentBench.exe` runs the real agent2.js in the real
  ClearScript with real L2Swarm.Core entities (cost per tick / per job, micro costs, order latency tick vs push).
- **Protocol additions (all backward compatible; an old agent ignores them, an old brain never sends them):**

| direction | message / field | meaning |
|---|---|---|
| brain -> agent | `call.ts` | brain send time (same PC clock): the agent's `lat ord` |
| brain -> agent | `{ a: 'cfg', push: bool }` | async socket read on / off (brain_host.json `agentPush`) |
| brain -> agent | `{ a: 'hot' }` | my party fights: fast ticks (runner.partyHot, every 4 s, held 15 s; `partyHot: false` = off) |
| agent -> brain | `hello.caps` + `ack`, `push`, `hot` | the agent understands the above |
| agent -> brain | `res.xt` | when the call ran in the agent (host `__sendAck` / link `callAck` -> `{ sent, xt, got }`) |
| agent -> brain | `ev.at` | when L2Swarm handed the event to the agent (runner `LAT ... ev=`) |

- **Live switches:** `Scripts/data/brain_host.json` `"agentPush": true | ["Name", ...]`, `"partyHot": false` (pool polls every 5 s; no restart).
- **Probes:** agent_perf.log `lat[p50/p95/max ms]=ord / cast / gap` + `push=`; brain_host.log `LAT <name>` (5 min) and `LAG (worst 10 s window, ms)`
  (main + every party worker event-loop delay); brain_host_stats.json `mainLag`, `workers[].lag`, `workers[].hot`.
- Test: `node docs/plan/tools/test_engine_latency.js` (52 checks).
