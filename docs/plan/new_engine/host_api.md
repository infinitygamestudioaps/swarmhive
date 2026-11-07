# Host API used by swarm.js (static inventory)

Generated 2026-11-07T07:20:46.797Z by `docs/plan/tools/host_api_inventory.js` from `Scripts_dev/swarm.js` (51434 lines, 970670 tokens).
Re-run after swarm.js changes: `node docs/plan/tools/host_api_inventory.js`. The runtime counterpart is the shim's missing-member log
(`Dashboard/brain_host`, `host.missing`), which also catches dynamic accesses (`obj[name]`) that a static scan cannot see.

Columns: **uses** = occurrences, **line** = first occurrence, **shim** = how Dashboard/brain_host answers it (mirror = from the state the
agent streams, order = forwarded to the agent, local = answered in the brain, stub = harmless fake; from host.js `H.coverage()`).

## 1. Host globals

| global | kind | uses | line | shim |
|---|---|---:|---:|---|
| `Me` | object | 5170 | 313 | mirror |
| `sleep` | function | 927 | 1982 | local |
| `File` | object | 661 | 398 | local |
| `App` | object | 518 | 135 | local |
| `Send` | object | 518 | 1984 | order |
| `Options` | object | 323 | 3349 | mirror |
| `SayToParty` | function | 258 | 159 | order |
| `setInterval` | function | 226 | 58 | local |
| `Target` | object | 173 | 1983 | mirror |
| `IsCharacterReady` | function | 165 | 1809 | mirror |
| `Inventory` | object | 154 | 365 | mirror |
| `IsEnabled` | value | 109 | 3043 | mirror |
| `__SCRIPTS__` | value | 99 | 396 | local |
| `IsInCombat` | value | 97 | 1750 | mirror |
| `setTimeout` | function | 96 | 2195 | local |
| `__DIR__` | value | 81 | 395 | local |
| `SkillsList` | object | 81 | 368 | mirror |
| `EnableBot` | function | 65 | 3048 | order |
| `Distance` | function | 63 | 4789 | mirror |
| `PartyList` | object | 52 | 367 | mirror |
| `DisableBot` | function | 34 | 3045 | order |
| `UseItem` | function | 24 | 2043 | order |
| `BuffsList` | object | 22 | 366 | mirror |
| `console` | object | 20 | 2535 | local |
| `RunCommand` | function | 20 | 9701 | order |
| `Context` | object | 15 | 18956 |  |
| `CreaturesList` | object | 14 | 231 | mirror |
| `IsMe` | function | 14 | 3447 | mirror |
| `HasQuest` | function | 12 | 15450 | mirror |
| `BuffLow` | function | 9 | 4810 | mirror |
| `StopCombat` | function | 9 | 23347 | order |
| `ItemCount` | function | 7 | 11126 | mirror |
| `clearTimeout` | function | 6 | 2966 | local |
| `GetQuestState` | function | 6 | 18958 | mirror |
| `LastHTML` | value | 6 | 15484 | mirror |
| `GoToPoint` | function | 5 | 6986 | order + promise |
| `IsAttacking` | value | 5 | 4769 | mirror |
| `IsPartyLeader` | value | 5 | 3019 | mirror |
| `BuyList` | object | 4 | 12262 | mirror |
| `CurrentZone` | value | 4 | 1748 | mirror |
| `DropList` | object | 4 | 22034 | mirror |
| `NpcList` | object | 4 | 2944 | mirror |
| `PetList` | object | 4 | 2156 | mirror |
| `Point` | object | 4 | 9880 | local |
| `Select` | function | 4 | 35883 | order |
| `BuyItem` | function | 3 | 12203 | order |
| `CharList` | object | 3 | 2842 | mirror |
| `CombatZoneTypes` | enum | 3 | 34624 | local |
| `Encoding` | object | 3 | 36715 | local |
| `L2CreatureTypes` | enum | 3 | 196 | local |
| `LoadCombatMap` | function | 3 | 34624 | order |
| `StartCombat` | function | 3 | 38092 | order |
| `Tell` | function | 3 | 48783 | order |
| `FindSkillId` | function | 2 | 2864 |  |
| `L2ZoneTypes` | enum | 2 | 1748 |  |
| `Point3D` | object | 2 | 12044 | local |
| `UseCombatSquareZone` | function | 2 | 30118 | order |
| `AppEvents` | object | 1 | 16899 | agent subscription |
| `assert_min_version` | function | 1 | 46 | local |
| `Attack` | function | 1 | 48075 | order |
| `clearInterval` | function | 1 | 58 | local |
| `L2BodyPartTypes` | enum | 1 | 48583 |  |
| `MoveToNpc` | function | 1 | 6982 | order |
| `MoveToPoint` | function | 1 | 11671 | order |
| `Process` | object | 1 | 3153 | stub |
| `SetCombatSquareZone` | function | 1 | 38182 | order |
| `SetWindowTitle` | function | 1 | 51406 | local |
| `TcpClient` | object | 1 | 36711 | stub |

Total: 68 globals, 10140 uses.

## 2. Members of host objects

Grouped by object (Me, Send, Options, File, App, ...).

### Me (46 members, 5166 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Me.Name` | 1609 | 1775 | mirror |
| `Me.X` | 957 | 1902 | mirror |
| `Me.Y` | 957 | 1902 | mirror |
| `Me.Z` | 511 | 2569 | mirror |
| `Me.IsDead` | 432 | 1897 | mirror |
| `Me.Level` | 134 | 2848 | mirror |
| `Me.HpPercent` | 112 | 1897 | mirror |
| `Me.ClassId` | 74 | 1776 | mirror |
| `Me.objId` | 48 | 1897 | mirror |
| `Me.MpPercent` | 46 | 2023 | mirror |
| `Me.MP` | 45 | 1844 | mirror |
| `Me.IsCasting` | 44 | 2067 | mirror |
| `Me.IsAttacking` | 43 | 3249 | mirror |
| `Me.IsInCombat` | 27 | 1750 | mirror |
| `Me.IsSitting` | 24 | 2067 | mirror |
| `Me.ClassName` | 15 | 4417 | mirror |
| `Me.SP` | 11 | 15914 | mirror |
| `Me.IsMoving` | 9 | 9776 | mirror |
| `Me.MaxLoad` | 8 | 16974 | mirror |
| `Me.Load` | 7 | 16974 | mirror |
| `Me.Clan` | 7 | 28340 | mirror |
| `Me.InventoryLimit` | 5 | 16973 | mirror |
| `Me.Exp` | 5 | 36656 | mirror |
| `Me.MaxCP` | 4 | 4733 | mirror |
| `Me.CP` | 3 | 4733 | mirror |
| `Me.MaxMP` | 3 | 14931 | mirror |
| `Me.ExpPercent` | 3 | 22662 | mirror |
| `Me.SnapshotJson` | 2 | 321 | mirror |
| `Me.ClassType` | 2 | 1799 | mirror |
| `Me.HP` | 2 | 9038 | mirror |
| `Me.CalculateExpPercents` | 2 | 36703 | mirror |
| `Me.PAtkSpd` | 1 | 5525 | mirror |
| `Me.MAtkSpd` | 1 | 5525 | mirror |
| `Me.RunSpeed` | 1 | 5746 | mirror |
| `Me.Speed` | 1 | 5746 | mirror |
| `Me.MaxHP` | 1 | 9038 | mirror |
| `Me.HennaSTR` | 1 | 15612 | mirror |
| `Me.HennaDEX` | 1 | 15612 | mirror |
| `Me.HennaCON` | 1 | 15612 | mirror |
| `Me.HennaINT` | 1 | 15612 | mirror |
| `Me.HennaWIT` | 1 | 15612 | mirror |
| `Me.HennaMEN` | 1 | 15612 | mirror |
| `Me.Race` | 1 | 41233 | mirror |
| `Me.Vitality` | 1 | 46032 | mirror |
| `Me.RecommHave` | 1 | 46081 | mirror |
| `Me.RecommLeft` | 1 | 46081 | mirror |

### File (8 members, 661 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `File.ReadAllText` | 316 | 398 | local |
| `File.WriteAllText` | 243 | 2468 | local |
| `File.Exists` | 69 | 4206 | local |
| `File.Delete` | 23 | 8941 | local |
| `File.Copy` | 4 | 27509 | local |
| `File.AppendAllText` | 2 | 3112 | local |
| `File.GetLastWriteTimeUtc` | 2 | 22643 | local |
| `File.Move` | 2 | 22811 | local |

### App (5 members, 518 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `App.emit` | 310 | 1952 | local |
| `App.on` | 182 | 135 | local |
| `App.emitTo` | 14 | 1951 | local |
| `App.self` | 10 | 3405 | local |
| `App.off` | 2 | 145 | local |

### Send (45 members, 518 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Send.Action` | 92 | 1984 | order |
| `Send.StopMove` | 82 | 3045 | order |
| `Send.RequestMagicSkillUse` | 60 | 1986 | order |
| `Send.MoveBackwardToLocation` | 47 | 2295 | order |
| `Send.RequestBuySellUIClose` | 47 | 12222 | order |
| `Send.UseItem` | 31 | 2672 | order |
| `Send.SendHex` | 26 | 2135 | order |
| `Send.Attack` | 23 | 2266 | order |
| `Send.RequestTargetCancel` | 22 | 2270 | order |
| `Send.ReqBypassToServer` | 8 | 6662 | order |
| `Send.TradeDone` | 8 | 17077 | order |
| `Send.RequestRestartPoint` | 6 | 36786 | order |
| `Send.ReqExCancelEnchantItem` | 5 | 14279 | order |
| `Send.RequestActionUse` | 4 | 2203 | order |
| `Send.RequestWithDrawalParty` | 4 | 2989 | order |
| `Send.RequestJoinParty` | 4 | 3024 | order |
| `Send.MultiSellChoose` | 4 | 14260 | order |
| `Send.RequestEnchantItem` | 4 | 15781 | order |
| `Send.RequestOustPartyMember` | 3 | 3033 | order |
| `Send.ValidatePosition` | 3 | 9757 | order |
| `Send.RequestDestroyItem` | 3 | 12795 | order |
| `Send.RequestExAcceptJoinMPCC` | 3 | 29127 | order |
| `Send.RequestAnswerJoinParty` | 2 | 2992 | order |
| `Send.Say2` | 2 | 9563 | order |
| `Send.RequestUserCommand` | 2 | 9701 | order |
| `Send.ReqExTryToPutEnchantTargetItem` | 2 | 15788 | order |
| `Send.AddTradeItem` | 2 | 17236 | order |
| `Send.DlgAnswer` | 2 | 42885 | order |
| `Send.RequestItemList` | 1 | 9737 | order |
| `Send.RequestRefine` | 1 | 14316 | order |
| `Send.RequestRefineCancel` | 1 | 14326 | order |
| `Send.ReqExEnchantItemAttribute` | 1 | 15956 | order |
| `Send.RequestAutoSoulShot` | 1 | 16886 | order |
| `Send.AnswerTradeRequest` | 1 | 17056 | order |
| `Send.TradeRequest` | 1 | 17217 | order |
| `Send.WareHouseDepositList` | 1 | 24950 | order |
| `Send.WareHouseWithDrawList` | 1 | 26338 | order |
| `Send.ReqCrystallizeItem` | 1 | 28135 | order |
| `Send.RequestExAskJoinMPCC` | 1 | 29139 | order |
| `Send.RequestJoinPledge` | 1 | 29207 | order |
| `Send.RequestAnswerJoinPledge` | 1 | 29219 | order |
| `Send.RequestDispel` | 1 | 36771 | order |
| `Send.RequestVoteNew` | 1 | 46095 | order |
| `Send.RequestChangePartyLeader` | 1 | 47916 | order |
| `Send.RequestDropItem` | 1 | 48635 | order |

### Options (16 members, 323 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Options.ActiveFollow` | 150 | 5769 | mirror |
| `Options.FollowName` | 61 | 5778 | mirror |
| `Options.FollowAtk` | 46 | 3349 | mirror |
| `Options.EnableJSOnIncomingPacket` | 25 | 14233 | mirror |
| `Options.CombatZoneType` | 8 | 19276 | mirror |
| `Options.PickUpPattern` | 6 | 22011 | mirror |
| `Options.PickUp` | 6 | 38265 | mirror |
| `Options.SendParty` | 5 | 22170 | mirror |
| `Options.AutoResurrect` | 5 | 36759 | mirror |
| `Options.AutoSkillsList` | 3 | 4213 | mirror |
| `Options.CombatSkillsList` | 2 | 4265 | mirror |
| `Options.FollowPartyLeaderSit` | 2 | 37813 | mirror |
| `Options.UseCombatZLimit` | 1 | 37947 | mirror |
| `Options.CombatZLimit` | 1 | 37947 | mirror |
| `Options.CombatRange` | 1 | 43428 | mirror |
| `Options.AtkBySelect` | 1 | 49291 | mirror |

### Inventory (4 members, 141 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Inventory.forEach` | 107 | 12844 | mirror |
| `Inventory.Count` | 19 | 9736 | mirror |
| `Inventory.GetItemByID` | 14 | 2554 | mirror |
| `Inventory.GetItemByObjectID` | 1 | 45991 | mirror |

### Target (3 members, 89 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Target.objId` | 78 | 1983 | mirror |
| `Target.IsDead` | 9 | 4788 | mirror |
| `Target.Name` | 2 | 23640 | mirror |

### SkillsList (3 members, 69 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `SkillsList.GetItemByID` | 48 | 1836 | mirror |
| `SkillsList.forEach` | 17 | 3041 | mirror |
| `SkillsList.Count` | 4 | 1830 | mirror |

### PartyList (3 members, 40 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `PartyList.forEach` | 21 | 2655 | mirror |
| `PartyList.Count` | 12 | 21856 | mirror |
| `PartyList.GetItemByObjectID` | 7 | 3496 | mirror |

### console (2 members, 20 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `console.error` | 19 | 3438 | local |
| `console.log` | 1 | 2535 | local |

### CreaturesList (6 members, 10 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `CreaturesList.SnapshotJson` | 3 | 231 | mirror |
| `CreaturesList.GetItemByObjectID` | 3 | 241 | mirror |
| `CreaturesList.snapshotJson` | 1 | 232 | mirror |
| `CreaturesList.forEach` | 1 | 278 | mirror |
| `CreaturesList.Count` | 1 | 293 | mirror |
| `CreaturesList.snapshotJsonNear` | 1 | 38015 | mirror |

### PetList (2 members, 4 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `PetList.Count` | 3 | 2156 | mirror |
| `PetList.forEach` | 1 | 2156 | mirror |

### NpcList (1 members, 4 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `NpcList.forEach` | 4 | 2944 | mirror |

### BuyList (1 members, 4 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `BuyList.forEach` | 4 | 12262 | mirror |

### DropList (1 members, 4 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `DropList.forEach` | 4 | 22034 | mirror |

### BuffsList (1 members, 4 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `BuffsList.forEach` | 4 | 36771 | mirror |

### L2CreatureTypes (3 members, 3 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `L2CreatureTypes.Char` | 1 | 196 | local |
| `L2CreatureTypes.Npc` | 1 | 196 | local |
| `L2CreatureTypes.Mob` | 1 | 196 | local |

### CharList (1 members, 3 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `CharList.forEach` | 3 | 2842 | mirror |

### CombatZoneTypes (1 members, 3 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `CombatZoneTypes.Map` | 3 | 34624 | local |

### Encoding (1 members, 3 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Encoding.UTF8` | 3 | 36715 | local |

### L2ZoneTypes (1 members, 1 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `L2ZoneTypes.PEACEZONE` | 1 | 1748 |  |

### Process (1 members, 1 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Process.Start` | 1 | 3153 | stub |

### AppEvents (1 members, 1 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `AppEvents.on` | 1 | 16899 | agent subscription |

### CurrentZone (1 members, 1 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `CurrentZone.Name` | 1 | 31146 | mirror |

## 3. Entity members (on creatures, items, skills, buffs, party members, collections)

Heuristic: any `.Member` on a non-host object where Member is documented on an L2 entity or is PascalCase. "doc" = in docs/js-api/entities.txt
or the snapshot field list. Undocumented PascalCase names can be swarm.js's own objects (e.g. CONFIG keys) — check before shimming.

| member | uses | doc | line |
|---|---:|:---:|---:|
| `.length` | 2656 | doc | 68 |
| `.forEach` | 1103 | doc | 83 |
| `.filter` | 1047 | doc | 83 |
| `.objId` | 839 | doc | 211 |
| `.Name` | 608 | doc | 211 |
| `.X` | 581 | doc | 1902 |
| `.Y` | 572 | doc | 1902 |
| `.IsDead` | 312 | doc | 1902 |
| `.Z` | 291 | doc | 2283 |
| `.Id` | 241 | doc | 211 |
| `.HpPercent` | 68 | doc | 1902 |
| `.IsEquiped` | 61 | doc | 12475 |
| `.Count` | 50 | doc | 4137 |
| `.IsReady` | 47 | doc | 1028 |
| `.Level` | 46 | doc | 1024 |
| `.MP` | 37 | doc | 1028 |
| `.Title` | 37 | doc | 2436 |
| `.HitTime` | 34 | doc | 1028 |
| `.NpcId` | 23 |  | 4081 |
| `.EnchantLvl` | 19 | doc | 12475 |
| `.IsDebuff` | 19 | doc | 1025 |
| `.MaxHP` | 16 | doc | 1902 |
| `.IsToggle` | 15 | doc | 1025 |
| `.TargetObjId` | 14 | doc | 2170 |
| `.IsQuestItem` | 13 |  | 12475 |
| `.Length` | 12 |  | 14191 |
| `.CastRange` | 11 | doc | 1028 |
| `.IsActive` | 11 | doc | 1025 |
| `.AbnormalType` | 10 | doc | 1026 |
| `.HasQuest` | 10 |  | 15450 |
| `.Instrument` | 10 |  | 4215 |
| `.IsEnabled` | 10 | doc | 3043 |
| `.RemainTime` | 10 | doc | 1184 |
| `.Template` | 10 | doc | 22006 |
| `.IsQuest` | 9 | doc | 14483 |
| `.Skill` | 9 |  | 4215 |
| `.AbnormalTime` | 8 | doc | 1027 |
| `.targetCrt` | 8 | doc | 2632 |
| `.Price` | 7 | doc | 12107 |
| `.TargetType` | 7 | doc | 1026 |
| `.GetQuestState` | 6 |  | 18958 |
| `.HP` | 6 | doc | 1902 |
| `.ClanName` | 5 |  | 22917 |
| `.crtType` | 5 | doc | 260 |
| `.Giran` | 5 |  | 17565 |
| `.MpPercent` | 5 | doc | 2162 |
| `.ToString` | 5 |  | 201 |
| `.AbnormalLevel` | 4 | doc | 1027 |
| `.AffectScope` | 4 | doc | 1026 |
| `.IsStackable` | 4 | doc | 21150 |
| `.ItemConsumeId` | 4 | doc | 1029 |
| `.Skills` | 4 | doc | 2224 |
| `.Type` | 4 | doc | 21116 |
| `.AttributeType` | 3 | doc | 4673 |
| `.Clan` | 3 | doc | 22917 |
| `.ClanId` | 3 |  | 22917 |
| `.CollectionCount` | 3 |  | 38574 |
| `.Description` | 3 | doc | 4546 |
| `.Heading` | 3 | doc | 6110 |
| `.IsInCombat` | 3 | doc | 1750 |
| `.IsSpoiled` | 3 | doc | 37466 |
| `.MoveToPoint` | 3 |  | 11671 |
| `.AllyName` | 2 | doc | 28340 |
| `.Buffs` | 2 | doc | 2160 |
| `.Desc` | 2 |  | 4546 |
| `.Elapsed` | 2 | doc | 5534 |
| `.GetBytes` | 2 |  | 36715 |
| `.GetItemByID` | 2 | doc | 2228 |
| `.GetRuntimeHeapInfo` | 2 |  | 38641 |
| `.IsPartyMember` | 2 | doc | 22916 |
| `.IsPassive` | 2 |  | 8107 |
| `.ItemConsumeCount` | 2 | doc | 1029 |
| `.ItemId` | 2 | doc | 22006 |
| `.MaxHp` | 2 |  | 18780 |
| `.ReuseDelay` | 2 | doc | 5534 |
| `.Stop` | 2 |  | 11676 |
| `.Ticks` | 2 |  | 22643 |
| `.TotalHeapSize` | 2 |  | 38644 |
| `.UsedHeapSize` | 2 |  | 38644 |
| `.AttackElementVal` | 1 | doc | 15943 |
| `.AugmentBonus` | 1 |  | 28067 |
| `.BaseLevel` | 1 | doc | 4161 |
| `.BodyPart` | 1 |  | 48583 |
| `.ClassId` | 1 | doc | 32350 |
| `.Close` | 1 |  | 36718 |
| `.CollectGarbage` | 1 |  | 38642 |
| `.CollisionRadius` | 1 | doc | 6110 |
| `.Cond` | 1 |  | 18967 |
| `.Connect` | 1 |  | 36714 |
| `.Current` | 1 |  | 38633 |
| `.DisplayName` | 1 | doc | 2161 |
| `.Distance` | 1 | doc | 4789 |
| `.dX` | 1 | doc | 6110 |
| `.dY` | 1 | doc | 6110 |
| `.Enchant` | 1 |  | 24403 |
| `.EnchantLevel` | 1 |  | 24403 |
| `.GetAvailableThreads` | 1 |  | 38539 |
| `.GetMaxThreads` | 1 |  | 38538 |
| `.GetMinThreads` | 1 |  | 38538 |
| `.GetStream` | 1 |  | 36715 |
| `.GetString` | 1 |  | 36717 |
| `.GetTotalMemory` | 1 |  | 38576 |
| `.IsLeader` | 1 | doc | 35050 |
| `.IsParalyzed` | 1 | doc | 8857 |
| `.IsRunning` | 1 | doc | 5914 |
| `.IsSleeping` | 1 | doc | 8857 |
| `.IsStunned` | 1 | doc | 8857 |
| `.Item` | 1 |  | 4199 |
| `.LegacyId` | 1 |  | 28489 |
| `.MagicLvl` | 1 | doc | 1028 |
| `.Read` | 1 |  | 36717 |
| `.ReceiveTimeout` | 1 |  | 36713 |
| `.SendTimeout` | 1 |  | 36713 |
| `.SetMinThreads` | 1 |  | 38539 |
| `.SnapshotJson` | 1 | doc | 349 |
| `.snapshotJson` | 1 | doc | 349 |
| `.State` | 1 | doc | 18967 |
| `.Step` | 1 |  | 18967 |
| `.StoreType` | 1 | doc | 30270 |
| `.TargetId` | 1 |  | 23515 |
| `.Text` | 1 |  | 36202 |
| `.Write` | 1 |  | 36715 |
| `.ZoneName` | 1 |  | 43504 |

## 4. Event hooks swarm.js defines

| hook | definitions | line |
|---|---:|---:|
| `OnIncomingPacket` | 9 | 14188 |
| `OnAnnouncement` | 1 | 36291 |
| `OnAskJoinPledge` | 1 | 29216 |
| `OnAttack` | 1 | 3491 |
| `OnBeforeScriptStop` | 1 | 51413 |
| `OnCommunityBoardHtmlMessage` | 1 | 2685 |
| `OnDie` | 1 | 3442 |
| `OnMagicSkillUse` | 1 | 50642 |
| `OnMapClick` | 1 | 51419 |
| `OnNpcDialogLink` | 1 | 6318 |
| `OnNpcHtmlMessage` | 1 | 6305 |
| `OnNpcQuestHtmlMessage` | 1 | 6312 |
| `OnRevive` | 1 | 3461 |
| `OnSay` | 1 | 48794 |
| `OnShopList` | 1 | 12102 |
| `OnSystemMessage` | 1 | 36252 |
| `OnTargetSelected` | 1 | 50609 |
| `OnTeleportToLocation` | 1 | 9807 |
| `OnTrade` | 1 | 17064 |
| `OnWareHouseDepositList` | 1 | 24399 |
| `OnWareHouseWithdrawalList` | 1 | 24400 |
| `OnWindowOpenTrade` | 1 | 17065 |

## 5. New-engine coverage (Dashboard/brain_host + Scripts/agent2.js)

Static check: is every name above answered by the brain host? Globals: defined on the shim's global object. Entity members: a field agent2.js
reports (its ME / ITEM / SKILL / PARTY / DROP / PET field lists), a creature field (swarm.js SNAP list = what L2Swarm's snapshotJson plus
agent2's supplement carry; the exact live field set is NOT verified yet), a computed member of the shim, or a collection method. What the
simulator really touched is in docs/plan/new_engine/sim_last_run.json ("missing").

Globals not defined by the shim: none.

| entity member | uses | covered by |
|---|---:|---|
| `.length` | 2656 | collection |
| `.forEach` | 1103 | collection |
| `.filter` | 1047 | collection |
| `.objId` | 839 | me, item, party, drop, pet, creature |
| `.Name` | 608 | me, item, skill, party, drop, buff, pet, creature |
| `.X` | 581 | me, party, drop, pet, creature |
| `.Y` | 572 | me, party, drop, pet, creature |
| `.IsDead` | 312 | me, party, pet, creature |
| `.Z` | 291 | me, party, drop, pet, creature |
| `.Id` | 241 | me, item, skill, drop, buff, pet, creature |
| `.HpPercent` | 68 | me, party, pet, creature |
| `.IsEquiped` | 61 | item |
| `.Count` | 50 | item, drop, collection |
| `.IsReady` | 47 | skill |
| `.Level` | 46 | me, skill, party, buff, pet, creature |
| `.MP` | 37 | me, skill, party, pet, creature |
| `.Title` | 37 | me, creature |
| `.HitTime` | 34 | skill |
| `.NpcId` | 23 | probe (undefined is right) |
| `.IsDebuff` | 19 | skill, buff |
| `.EnchantLvl` | 19 | item |
| `.MaxHP` | 16 | me, party, pet, creature |
| `.IsToggle` | 15 | skill |
| `.TargetObjId` | 14 | creature, shim computed |
| `.IsQuestItem` | 13 | item, probe (undefined is right) |
| `.Length` | 12 | .NET helper / Options row (stubbed or forwarded) |
| `.IsActive` | 11 | skill |
| `.CastRange` | 11 | skill |
| `.AbnormalType` | 10 | skill, buff |
| `.RemainTime` | 10 | buff |
| `.Instrument` | 10 | .NET helper / Options row (stubbed or forwarded) |
| `.IsEnabled` | 10 | skill |
| `.HasQuest` | 10 | event / quest data (serialised whole) or Context probe |
| `.Template` | 10 | shim computed |
| `.Skill` | 9 | **NOT COVERED** |
| `.IsQuest` | 9 | item |
| `.AbnormalTime` | 8 | skill |
| `.targetCrt` | 8 | creature, shim computed |
| `.TargetType` | 7 | skill |
| `.Price` | 7 | item |
| `.HP` | 6 | me, party, pet, creature |
| `.GetQuestState` | 6 | event / quest data (serialised whole) or Context probe |
| `.ToString` | 5 | shim computed |
| `.crtType` | 5 | creature |
| `.MpPercent` | 5 | me, party, pet, creature |
| `.Giran` | 5 | swarm.js own object (route table key), not a host member |
| `.ClanName` | 5 | probe (undefined is right) |
| `.AffectScope` | 4 | skill |
| `.AbnormalLevel` | 4 | skill, buff |
| `.ItemConsumeId` | 4 | skill |
| `.Skills` | 4 | shim computed |
| `.Type` | 4 | item |
| `.IsStackable` | 4 | item |
| `.Description` | 3 | skill |
| `.AttributeType` | 3 | skill |
| `.IsInCombat` | 3 | me, creature |
| `.Heading` | 3 | me, creature |
| `.MoveToPoint` | 3 | 3.8.17 movement handle (globalThis.MoveToPoint wrap / op.Stop): the shim returns no handle = 3.8.14 behaviour |
| `.Clan` | 3 | creature, shim computed |
| `.ClanId` | 3 | probe (undefined is right) |
| `.IsSpoiled` | 3 | creature |
| `.CollectionCount` | 3 | .NET helper / Options row (stubbed or forwarded) |
| `.ItemConsumeCount` | 2 | skill |
| `.Buffs` | 2 | creature, shim computed |
| `.GetItemByID` | 2 | collection |
| `.Desc` | 2 | probe (undefined is right) |
| `.ReuseDelay` | 2 | skill |
| `.Elapsed` | 2 | shim computed |
| `.IsPassive` | 2 | skill |
| `.Stop` | 2 | 3.8.17 movement handle (globalThis.MoveToPoint wrap / op.Stop): the shim returns no handle = 3.8.14 behaviour |
| `.MaxHp` | 2 | **NOT COVERED** |
| `.ItemId` | 2 | creature, shim computed |
| `.Ticks` | 2 | .NET helper / Options row (stubbed or forwarded) |
| `.IsPartyMember` | 2 | creature |
| `.AllyName` | 2 | shim computed |
| `.GetBytes` | 2 | .NET helper / Options row (stubbed or forwarded) |
| `.GetRuntimeHeapInfo` | 2 | .NET helper / Options row (stubbed or forwarded) |
| `.UsedHeapSize` | 2 | .NET helper / Options row (stubbed or forwarded) |
| `.TotalHeapSize` | 2 | .NET helper / Options row (stubbed or forwarded) |
| `.SnapshotJson` | 1 | shim computed, collection |
| `.snapshotJson` | 1 | collection |
| `.MagicLvl` | 1 | skill |
| `.DisplayName` | 1 | pet |
| `.BaseLevel` | 1 | **NOT COVERED** |
| `.Item` | 1 | **NOT COVERED** |
| `.IsRunning` | 1 | me, creature |
| `.dX` | 1 | creature |
| `.dY` | 1 | creature |
| `.CollisionRadius` | 1 | creature |
| `.IsSleeping` | 1 | me, creature |
| `.IsParalyzed` | 1 | me, creature |
| `.IsStunned` | 1 | me, creature |
| `.AttackElementVal` | 1 | **NOT COVERED** |
| `.Cond` | 1 | event / quest data (serialised whole) or Context probe |
| `.State` | 1 | event / quest data (serialised whole) or Context probe |
| `.Step` | 1 | event / quest data (serialised whole) or Context probe |
| `.TargetId` | 1 | probe (undefined is right) |
| `.Enchant` | 1 | probe (undefined is right) |
| `.EnchantLevel` | 1 | probe (undefined is right) |
| `.AugmentBonus` | 1 | **NOT COVERED** |
| `.LegacyId` | 1 | creature |
| `.StoreType` | 1 | creature |
| `.ClassId` | 1 | me, party, creature |
| `.IsLeader` | 1 | party, creature |
| `.Text` | 1 | event / quest data (serialised whole) or Context probe |
| `.SendTimeout` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.ReceiveTimeout` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.Connect` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.GetStream` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.Write` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.Read` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.GetString` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.Close` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.GetMinThreads` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.GetMaxThreads` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.GetAvailableThreads` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.SetMinThreads` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.GetTotalMemory` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.Current` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.CollectGarbage` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.ZoneName` | 1 | probe (undefined is right) |
| `.BodyPart` | 1 | **NOT COVERED** |
| `.Distance` | 1 | creature, shim computed |


## 6. Free names not declared in swarm.js and not JS builtins

Candidates for host names the docs do not list (or names declared in a way the rough scanner misses, e.g. object-method shorthand or
class fields). Each was checked at runtime by the shim: a name that is really missing throws a ReferenceError there.

| name | uses | line |
|---|---:|---:|
| `SetCombatPolygon` | 10 | 30121 |
| `__extended_host_functions` | 3 | 38535 |
| `__agentLink` | 2 | 6654 |
| `__bagSync` | 2 | 12137 |
| `__sendAck` | 2 | 5568 |
| `canSeePoint` | 2 | 38859 |
| `GeoSight` | 2 | 2574 |
| `missionAbort` | 2 | 50803 |
| `teamFighting` | 2 | 41387 |
| `zoneSetup` | 2 | 34582 |
| `acquire` | 1 | 18180 |
| `release` | 1 | 18189 |
