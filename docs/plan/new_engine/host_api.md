# Host API used by swarm.js (static inventory)

Generated 2026-10-12T12:27:36.756Z by `docs/plan/tools/host_api_inventory.js` from `Scripts_dev/swarm.js` (27451 lines, 469388 tokens).
Re-run after swarm.js changes: `node docs/plan/tools/host_api_inventory.js`. The runtime counterpart is the shim's missing-member log
(`Dashboard/brain_host`, `host.missing`), which also catches dynamic accesses (`obj[name]`) that a static scan cannot see.

Columns: **uses** = occurrences, **line** = first occurrence, **shim** = how Dashboard/brain_host answers it (mirror = from the state the
agent streams, order = forwarded to the agent, local = answered in the brain, stub = harmless fake; from host.js `H.coverage()`).

## 1. Host globals

| global | kind | uses | line | shim |
|---|---|---:|---:|---|
| `Me` | object | 2993 | 287 | mirror |
| `sleep` | function | 578 | 1840 | local |
| `Send` | object | 345 | 1840 | order |
| `File` | object | 322 | 372 | local |
| `App` | object | 307 | 1810 | local |
| `Options` | object | 196 | 2899 | mirror |
| `SayToParty` | function | 175 | 133 | order |
| `setInterval` | function | 146 | 57 | local |
| `IsCharacterReady` | function | 105 | 1676 | mirror |
| `Target` | object | 102 | 1839 | mirror |
| `IsEnabled` | value | 92 | 2603 | mirror |
| `__SCRIPTS__` | value | 64 | 370 | local |
| `__DIR__` | value | 62 | 369 | local |
| `SkillsList` | object | 60 | 342 | mirror |
| `Inventory` | object | 59 | 339 | mirror |
| `setTimeout` | function | 58 | 2050 | local |
| `EnableBot` | function | 54 | 2619 | order |
| `IsInCombat` | value | 47 | 1646 | mirror |
| `Distance` | function | 46 | 3372 | mirror |
| `PartyList` | object | 39 | 341 | mirror |
| `DisableBot` | function | 28 | 2608 | order |
| `console` | object | 19 | 2351 | local |
| `UseItem` | function | 18 | 1899 | order |
| `BuffsList` | object | 16 | 340 | mirror |
| `CreaturesList` | object | 14 | 205 | mirror |
| `IsMe` | function | 14 | 2679 | mirror |
| `RunCommand` | function | 14 | 6934 | order |
| `clearTimeout` | function | 9 | 2439 | local |
| `BuffLow` | function | 7 | 4052 | mirror |
| `Context` | object | 6 | 10845 |  |
| `StopCombat` | function | 6 | 21843 | order |
| `CurrentZone` | value | 4 | 1644 | mirror |
| `DropList` | object | 4 | 13107 | mirror |
| `GoToPoint` | function | 4 | 4651 | order + promise |
| `HasQuest` | function | 4 | 10871 | mirror |
| `Point` | object | 4 | 7100 | local |
| `Select` | function | 4 | 20485 | order |
| `BuyList` | object | 3 | 8358 | mirror |
| `clearInterval` | function | 3 | 57 | local |
| `Encoding` | object | 3 | 21027 | local |
| `L2CreatureTypes` | enum | 3 | 170 | local |
| `NpcList` | object | 3 | 21059 | mirror |
| `PetList` | object | 3 | 2012 | mirror |
| `BuyItem` | function | 2 | 8322 | order |
| `CombatZoneTypes` | enum | 2 | 19377 | local |
| `GetQuestState` | function | 2 | 10847 | mirror |
| `IsPartyLeader` | value | 2 | 25040 | mirror |
| `L2ZoneTypes` | enum | 2 | 1644 |  |
| `LoadCombatMap` | function | 2 | 19377 | order |
| `Point3D` | object | 2 | 8192 | local |
| `StartCombat` | function | 2 | 21847 | order |
| `UseCombatSquareZone` | function | 2 | 16713 | order |
| `AppEvents` | object | 1 | 9763 | agent subscription |
| `assert_min_version` | function | 1 | 45 | local |
| `Attack` | function | 1 | 25202 | order |
| `IsAttacking` | value | 1 | 4335 | mirror |
| `ItemCount` | function | 1 | 8260 | mirror |
| `MoveToNpc` | function | 1 | 4647 | order |
| `MoveToPoint` | function | 1 | 8077 | order |
| `Process` | object | 1 | 2543 | stub |
| `SetCombatSquareZone` | function | 1 | 21893 | order |
| `SetWindowTitle` | function | 1 | 27423 | local |
| `TcpClient` | object | 1 | 21023 | stub |

Total: 63 globals, 6072 uses.

## 2. Members of host objects

Grouped by object (Me, Send, Options, File, App, ...).

### Me (38 members, 2989 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Me.Name` | 794 | 1663 | mirror |
| `Me.X` | 591 | 1764 | mirror |
| `Me.Y` | 591 | 1764 | mirror |
| `Me.Z` | 289 | 3849 | mirror |
| `Me.IsDead` | 265 | 1759 | mirror |
| `Me.Level` | 94 | 3340 | mirror |
| `Me.HpPercent` | 83 | 1759 | mirror |
| `Me.objId` | 40 | 1759 | mirror |
| `Me.MpPercent` | 33 | 1879 | mirror |
| `Me.ClassId` | 32 | 1665 | mirror |
| `Me.MP` | 31 | 1706 | mirror |
| `Me.IsCasting` | 29 | 1923 | mirror |
| `Me.IsInCombat` | 24 | 1646 | mirror |
| `Me.IsAttacking` | 19 | 4024 | mirror |
| `Me.IsSitting` | 15 | 1923 | mirror |
| `Me.ClassName` | 14 | 3061 | mirror |
| `Me.IsMoving` | 7 | 8212 | mirror |
| `Me.Clan` | 7 | 15571 | mirror |
| `Me.Exp` | 4 | 20973 | mirror |
| `Me.SnapshotJson` | 2 | 295 | mirror |
| `Me.ClassType` | 2 | 1667 | mirror |
| `Me.HP` | 2 | 6524 | mirror |
| `Me.ExpPercent` | 2 | 13682 | mirror |
| `Me.SP` | 2 | 15574 | mirror |
| `Me.CalculateExpPercents` | 2 | 21015 | mirror |
| `Me.MaxCP` | 2 | 22872 | mirror |
| `Me.CP` | 2 | 22872 | mirror |
| `Me.PAtkSpd` | 1 | 3710 | mirror |
| `Me.MAtkSpd` | 1 | 3710 | mirror |
| `Me.RunSpeed` | 1 | 3882 | mirror |
| `Me.Speed` | 1 | 3882 | mirror |
| `Me.MaxHP` | 1 | 6524 | mirror |
| `Me.HennaSTR` | 1 | 8979 | mirror |
| `Me.HennaDEX` | 1 | 8979 | mirror |
| `Me.HennaCON` | 1 | 8979 | mirror |
| `Me.HennaINT` | 1 | 8979 | mirror |
| `Me.HennaWIT` | 1 | 8979 | mirror |
| `Me.HennaMEN` | 1 | 8979 | mirror |

### Send (38 members, 345 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Send.Action` | 73 | 1840 | order |
| `Send.RequestMagicSkillUse` | 51 | 1842 | order |
| `Send.StopMove` | 37 | 5154 | order |
| `Send.MoveBackwardToLocation` | 36 | 2123 | order |
| `Send.ReqBypassToServer` | 30 | 2445 | order |
| `Send.Attack` | 19 | 2126 | order |
| `Send.UseItem` | 16 | 2418 | order |
| `Send.SendHex` | 14 | 1991 | order |
| `Send.RequestBuySellUIClose` | 13 | 8332 | order |
| `Send.RequestTargetCancel` | 9 | 4379 | order |
| `Send.RequestRestartPoint` | 6 | 21098 | order |
| `Send.TradeDone` | 5 | 9786 | order |
| `Send.RequestActionUse` | 4 | 2058 | order |
| `Send.ValidatePosition` | 3 | 6990 | order |
| `Send.RequestExAcceptJoinMPCC` | 3 | 16027 | order |
| `Send.RequestUserCommand` | 2 | 6934 | order |
| `Send.WareHouseDepositList` | 2 | 14579 | order |
| `Send.RequestJoinParty` | 2 | 25052 | order |
| `Send.Say2` | 1 | 6887 | order |
| `Send.RequestItemList` | 1 | 6970 | order |
| `Send.ReqExTryToPutEnchantTargetItem` | 1 | 9123 | order |
| `Send.RequestEnchantItem` | 1 | 9125 | order |
| `Send.ReqExCancelEnchantItem` | 1 | 9141 | order |
| `Send.RequestAutoSoulShot` | 1 | 9750 | order |
| `Send.AnswerTradeRequest` | 1 | 9768 | order |
| `Send.TradeRequest` | 1 | 9835 | order |
| `Send.AddTradeItem` | 1 | 9847 | order |
| `Send.RequestDestroyItem` | 1 | 10169 | order |
| `Send.RequestOustPartyMember` | 1 | 13333 | order |
| `Send.WareHouseWithDrawList` | 1 | 15461 | order |
| `Send.RequestExAskJoinMPCC` | 1 | 16039 | order |
| `Send.RequestJoinPledge` | 1 | 16075 | order |
| `Send.RequestAnswerJoinPledge` | 1 | 16080 | order |
| `Send.RequestDispel` | 1 | 21083 | order |
| `Send.RequestWithDrawalParty` | 1 | 22252 | order |
| `Send.RequestChangePartyLeader` | 1 | 25056 | order |
| `Send.RequestAnswerJoinParty` | 1 | 25084 | order |
| `Send.RequestDropItem` | 1 | 25305 | order |

### File (8 members, 322 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `File.ReadAllText` | 160 | 372 | local |
| `File.WriteAllText` | 116 | 2284 | local |
| `File.Exists` | 30 | 3814 | local |
| `File.Delete` | 10 | 6432 | local |
| `File.AppendAllText` | 2 | 2502 | local |
| `File.GetLastWriteTimeUtc` | 2 | 13663 | local |
| `File.Move` | 1 | 13789 | local |
| `File.Copy` | 1 | 15713 | local |

### App (4 members, 307 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `App.emit` | 176 | 1811 | local |
| `App.on` | 113 | 1814 | local |
| `App.emitTo` | 10 | 1810 | local |
| `App.self` | 8 | 2642 | local |

### Options (13 members, 196 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Options.ActiveFollow` | 91 | 3905 | mirror |
| `Options.FollowName` | 38 | 3914 | mirror |
| `Options.FollowAtk` | 30 | 2899 | mirror |
| `Options.EnableJSOnIncomingPacket` | 8 | 8951 | mirror |
| `Options.CombatZoneType` | 7 | 11169 | mirror |
| `Options.PickUp` | 6 | 21971 | mirror |
| `Options.SendParty` | 5 | 13242 | mirror |
| `Options.PickUpPattern` | 4 | 13105 | mirror |
| `Options.AutoResurrect` | 3 | 21071 | mirror |
| `Options.CombatSkillsList` | 1 | 3818 | mirror |
| `Options.UseCombatZLimit` | 1 | 21709 | mirror |
| `Options.CombatZLimit` | 1 | 21709 | mirror |
| `Options.CombatRange` | 1 | 22950 | mirror |

### Inventory (4 members, 53 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Inventory.forEach` | 27 | 8607 | mirror |
| `Inventory.Count` | 17 | 6969 | mirror |
| `Inventory.GetItemByID` | 8 | 2367 | mirror |
| `Inventory.GetItemByObjectID` | 1 | 24317 | mirror |

### SkillsList (3 members, 52 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `SkillsList.GetItemByID` | 37 | 1699 | mirror |
| `SkillsList.forEach` | 11 | 2948 | mirror |
| `SkillsList.Count` | 4 | 1693 | mirror |

### Target (3 members, 51 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Target.objId` | 45 | 1839 | mirror |
| `Target.IsDead` | 5 | 16724 | mirror |
| `Target.Name` | 1 | 26583 | mirror |

### PartyList (3 members, 29 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `PartyList.forEach` | 15 | 2401 | mirror |
| `PartyList.GetItemByObjectID` | 9 | 2722 | mirror |
| `PartyList.Count` | 5 | 16032 | mirror |

### console (2 members, 19 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `console.error` | 18 | 2673 | local |
| `console.log` | 1 | 2351 | local |

### CreaturesList (6 members, 10 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `CreaturesList.SnapshotJson` | 3 | 205 | mirror |
| `CreaturesList.GetItemByObjectID` | 3 | 215 | mirror |
| `CreaturesList.snapshotJson` | 1 | 206 | mirror |
| `CreaturesList.forEach` | 1 | 252 | mirror |
| `CreaturesList.Count` | 1 | 267 | mirror |
| `CreaturesList.snapshotJsonNear` | 1 | 21777 | mirror |

### DropList (1 members, 4 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `DropList.forEach` | 4 | 13107 | mirror |

### L2CreatureTypes (3 members, 3 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `L2CreatureTypes.Char` | 1 | 170 | local |
| `L2CreatureTypes.Npc` | 1 | 170 | local |
| `L2CreatureTypes.Mob` | 1 | 170 | local |

### PetList (2 members, 3 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `PetList.Count` | 2 | 2012 | mirror |
| `PetList.forEach` | 1 | 2012 | mirror |

### BuyList (1 members, 3 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `BuyList.forEach` | 3 | 8358 | mirror |

### Encoding (1 members, 3 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Encoding.UTF8` | 3 | 21027 | local |

### NpcList (1 members, 3 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `NpcList.forEach` | 3 | 21059 | mirror |

### BuffsList (1 members, 3 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `BuffsList.forEach` | 3 | 21083 | mirror |

### CombatZoneTypes (1 members, 2 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `CombatZoneTypes.Map` | 2 | 19377 | local |

### L2ZoneTypes (1 members, 1 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `L2ZoneTypes.PEACEZONE` | 1 | 1644 |  |

### Process (1 members, 1 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `Process.Start` | 1 | 2543 | stub |

### AppEvents (1 members, 1 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `AppEvents.on` | 1 | 9763 | agent subscription |

### CurrentZone (1 members, 1 uses)

| member | uses | line | shim |
|---|---:|---:|---|
| `CurrentZone.Name` | 1 | 17549 | mirror |

## 3. Entity members (on creatures, items, skills, buffs, party members, collections)

Heuristic: any `.Member` on a non-host object where Member is documented on an L2 entity or is PascalCase. "doc" = in docs/js-api/entities.txt
or the snapshot field list. Undocumented PascalCase names can be swarm.js's own objects (e.g. CONFIG keys) — check before shimming.

| member | uses | doc | line |
|---|---:|:---:|---:|
| `.length` | 1190 | doc | 67 |
| `.forEach` | 525 | doc | 82 |
| `.filter` | 488 | doc | 82 |
| `.objId` | 458 | doc | 185 |
| `.X` | 418 | doc | 1764 |
| `.Y` | 412 | doc | 1764 |
| `.Name` | 361 | doc | 185 |
| `.IsDead` | 212 | doc | 1764 |
| `.Z` | 196 | doc | 2114 |
| `.Id` | 122 | doc | 185 |
| `.HpPercent` | 51 | doc | 1764 |
| `.Level` | 38 | doc | 969 |
| `.IsReady` | 35 | doc | 973 |
| `.Count` | 31 | doc | 3818 |
| `.HitTime` | 31 | doc | 973 |
| `.Title` | 29 | doc | 2252 |
| `.MP` | 28 | doc | 973 |
| `.IsEquiped` | 20 | doc | 8837 |
| `.IsDebuff` | 16 | doc | 970 |
| `.NpcId` | 15 |  | 4560 |
| `.IsToggle` | 13 | doc | 970 |
| `.CastRange` | 9 | doc | 973 |
| `.AbnormalTime` | 8 | doc | 972 |
| `.AbnormalType` | 8 | doc | 971 |
| `.IsActive` | 8 | doc | 970 |
| `.IsQuestItem` | 8 |  | 10111 |
| `.TargetObjId` | 8 | doc | 2026 |
| `.MaxHP` | 7 | doc | 1764 |
| `.Price` | 6 | doc | 8245 |
| `.RemainTime` | 6 | doc | 1129 |
| `.targetCrt` | 6 | doc | 3844 |
| `.TargetType` | 6 | doc | 971 |
| `.Template` | 6 | doc | 13108 |
| `.ClanName` | 5 |  | 13892 |
| `.Giran` | 5 |  | 10046 |
| `.IsQuest` | 5 | doc | 14779 |
| `.Length` | 5 |  | 8956 |
| `.ToString` | 5 |  | 175 |
| `.AbnormalLevel` | 4 | doc | 972 |
| `.AffectScope` | 4 | doc | 971 |
| `.crtType` | 4 | doc | 234 |
| `.HasQuest` | 4 |  | 10871 |
| `.MpPercent` | 4 | doc | 2018 |
| `.Skills` | 4 | doc | 2079 |
| `.Clan` | 3 | doc | 13892 |
| `.ClanId` | 3 |  | 13892 |
| `.CollectionCount` | 3 |  | 22107 |
| `.Description` | 3 | doc | 3132 |
| `.EnchantLvl` | 3 | doc | 8607 |
| `.HP` | 3 | doc | 1764 |
| `.IsInCombat` | 3 | doc | 1646 |
| `.MoveToPoint` | 3 |  | 8077 |
| `.Type` | 3 | doc | 14775 |
| `.AllyName` | 2 | doc | 15571 |
| `.AttributeType` | 2 | doc | 3182 |
| `.Buffs` | 2 | doc | 2016 |
| `.Desc` | 2 |  | 3132 |
| `.Elapsed` | 2 | doc | 3719 |
| `.GetBytes` | 2 |  | 21027 |
| `.GetItemByID` | 2 | doc | 2083 |
| `.GetQuestState` | 2 |  | 10847 |
| `.GetRuntimeHeapInfo` | 2 |  | 22174 |
| `.Heading` | 2 | doc | 4235 |
| `.IsEnabled` | 2 | doc | 2603 |
| `.IsPartyMember` | 2 | doc | 13891 |
| `.IsStackable` | 2 | doc | 14778 |
| `.ReuseDelay` | 2 | doc | 3719 |
| `.Stop` | 2 |  | 8082 |
| `.Ticks` | 2 |  | 13663 |
| `.TotalHeapSize` | 2 |  | 22177 |
| `.UsedHeapSize` | 2 |  | 22177 |
| `.Close` | 1 |  | 21030 |
| `.CollectGarbage` | 1 |  | 22175 |
| `.CollisionRadius` | 1 | doc | 4235 |
| `.Cond` | 1 |  | 10856 |
| `.Connect` | 1 |  | 21026 |
| `.Current` | 1 |  | 22166 |
| `.DisplayName` | 1 | doc | 2017 |
| `.Distance` | 1 | doc | 3372 |
| `.dX` | 1 | doc | 4235 |
| `.dY` | 1 | doc | 4235 |
| `.Enchant` | 1 |  | 14536 |
| `.EnchantLevel` | 1 |  | 14536 |
| `.GetAvailableThreads` | 1 |  | 22072 |
| `.GetMaxThreads` | 1 |  | 22071 |
| `.GetMinThreads` | 1 |  | 22071 |
| `.GetStream` | 1 |  | 21027 |
| `.GetString` | 1 |  | 21029 |
| `.GetTotalMemory` | 1 |  | 22109 |
| `.Instrument` | 1 |  | 3818 |
| `.IsParalyzed` | 1 | doc | 6349 |
| `.IsPassive` | 1 |  | 5633 |
| `.IsRunning` | 1 | doc | 4046 |
| `.IsSleeping` | 1 | doc | 6349 |
| `.IsSpoiled` | 1 | doc | 21296 |
| `.IsStunned` | 1 | doc | 6349 |
| `.ItemConsumeCount` | 1 | doc | 974 |
| `.ItemConsumeId` | 1 | doc | 974 |
| `.ItemId` | 1 | doc | 18634 |
| `.LegacyId` | 1 |  | 15626 |
| `.MagicLvl` | 1 | doc | 973 |
| `.Read` | 1 |  | 21029 |
| `.ReceiveTimeout` | 1 |  | 21025 |
| `.SendTimeout` | 1 |  | 21025 |
| `.SetMinThreads` | 1 |  | 22072 |
| `.SnapshotJson` | 1 | doc | 323 |
| `.snapshotJson` | 1 | doc | 323 |
| `.State` | 1 | doc | 10856 |
| `.Step` | 1 |  | 10856 |
| `.StoreType` | 1 | doc | 16797 |
| `.TargetId` | 1 |  | 14119 |
| `.Text` | 1 |  | 20693 |
| `.Write` | 1 |  | 21027 |
| `.ZoneName` | 1 |  | 23015 |

## 4. Event hooks swarm.js defines

| hook | definitions | line |
|---|---:|---:|
| `OnIncomingPacket` | 4 | 8939 |
| `OnAnnouncement` | 1 | 20727 |
| `OnAskJoinPledge` | 1 | 16080 |
| `OnAttack` | 1 | 2717 |
| `OnBeforeScriptStop` | 1 | 27430 |
| `OnCommunityBoardHtmlMessage` | 1 | 2431 |
| `OnDie` | 1 | 2677 |
| `OnMagicSkillUse` | 1 | 26700 |
| `OnMapClick` | 1 | 27436 |
| `OnNpcDialogLink` | 1 | 4434 |
| `OnNpcHtmlMessage` | 1 | 4421 |
| `OnNpcQuestHtmlMessage` | 1 | 4428 |
| `OnRevive` | 1 | 2688 |
| `OnSay` | 1 | 25374 |
| `OnShopList` | 1 | 8240 |
| `OnSystemMessage` | 1 | 20702 |
| `OnTargetSelected` | 1 | 26667 |
| `OnTeleportToLocation` | 1 | 7027 |
| `OnTrade` | 1 | 9775 |
| `OnWareHouseDepositList` | 1 | 14532 |
| `OnWareHouseWithdrawalList` | 1 | 14533 |
| `OnWindowOpenTrade` | 1 | 9776 |

## 5. New-engine coverage (Dashboard/brain_host + Scripts/agent2.js)

Static check: is every name above answered by the brain host? Globals: defined on the shim's global object. Entity members: a field agent2.js
reports (its ME / ITEM / SKILL / PARTY / DROP / PET field lists), a creature field (swarm.js SNAP list = what L2Swarm's snapshotJson plus
agent2's supplement carry; the exact live field set is NOT verified yet), a computed member of the shim, or a collection method. What the
simulator really touched is in docs/plan/new_engine/sim_last_run.json ("missing").

Globals not defined by the shim: none.

| entity member | uses | covered by |
|---|---:|---|
| `.length` | 1190 | collection |
| `.forEach` | 525 | collection |
| `.filter` | 488 | collection |
| `.objId` | 458 | me, item, party, drop, pet, creature |
| `.X` | 418 | me, party, drop, pet, creature |
| `.Y` | 412 | me, party, drop, pet, creature |
| `.Name` | 361 | me, item, skill, party, drop, buff, pet, creature |
| `.IsDead` | 212 | me, party, pet, creature |
| `.Z` | 196 | me, party, drop, pet, creature |
| `.Id` | 122 | me, item, skill, drop, buff, pet, creature |
| `.HpPercent` | 51 | me, party, pet, creature |
| `.Level` | 38 | me, skill, party, buff, pet, creature |
| `.IsReady` | 35 | skill |
| `.HitTime` | 31 | skill |
| `.Count` | 31 | item, drop, collection |
| `.Title` | 29 | me, creature |
| `.MP` | 28 | me, skill, party, pet, creature |
| `.IsEquiped` | 20 | item |
| `.IsDebuff` | 16 | skill, buff |
| `.NpcId` | 15 | probe (undefined is right) |
| `.IsToggle` | 13 | skill |
| `.CastRange` | 9 | skill |
| `.IsActive` | 8 | skill |
| `.AbnormalType` | 8 | skill, buff |
| `.AbnormalTime` | 8 | skill |
| `.TargetObjId` | 8 | creature, shim computed |
| `.IsQuestItem` | 8 | item, probe (undefined is right) |
| `.MaxHP` | 7 | me, party, pet, creature |
| `.TargetType` | 6 | skill |
| `.RemainTime` | 6 | buff |
| `.targetCrt` | 6 | creature, shim computed |
| `.Price` | 6 | item |
| `.Template` | 6 | shim computed |
| `.ToString` | 5 | shim computed |
| `.Length` | 5 | .NET helper / Options row (stubbed or forwarded) |
| `.Giran` | 5 | swarm.js own object (route table key), not a host member |
| `.ClanName` | 5 | probe (undefined is right) |
| `.IsQuest` | 5 | item |
| `.crtType` | 4 | creature |
| `.AffectScope` | 4 | skill |
| `.AbnormalLevel` | 4 | skill, buff |
| `.MpPercent` | 4 | me, party, pet, creature |
| `.Skills` | 4 | shim computed |
| `.HasQuest` | 4 | event / quest data (serialised whole) or Context probe |
| `.HP` | 3 | me, party, pet, creature |
| `.Description` | 3 | skill |
| `.IsInCombat` | 3 | me, creature |
| `.MoveToPoint` | 3 | 3.8.17 movement handle (globalThis.MoveToPoint wrap / op.Stop): the shim returns no handle = 3.8.14 behaviour |
| `.EnchantLvl` | 3 | item |
| `.Clan` | 3 | creature, shim computed |
| `.ClanId` | 3 | probe (undefined is right) |
| `.Type` | 3 | item |
| `.CollectionCount` | 3 | .NET helper / Options row (stubbed or forwarded) |
| `.Buffs` | 2 | creature, shim computed |
| `.GetItemByID` | 2 | collection |
| `.Desc` | 2 | probe (undefined is right) |
| `.AttributeType` | 2 | skill |
| `.ReuseDelay` | 2 | skill |
| `.Elapsed` | 2 | shim computed |
| `.IsEnabled` | 2 | skill |
| `.Heading` | 2 | me, creature |
| `.Stop` | 2 | 3.8.17 movement handle (globalThis.MoveToPoint wrap / op.Stop): the shim returns no handle = 3.8.14 behaviour |
| `.GetQuestState` | 2 | event / quest data (serialised whole) or Context probe |
| `.Ticks` | 2 | .NET helper / Options row (stubbed or forwarded) |
| `.IsPartyMember` | 2 | creature |
| `.IsStackable` | 2 | item |
| `.AllyName` | 2 | shim computed |
| `.GetBytes` | 2 | .NET helper / Options row (stubbed or forwarded) |
| `.GetRuntimeHeapInfo` | 2 | .NET helper / Options row (stubbed or forwarded) |
| `.UsedHeapSize` | 2 | .NET helper / Options row (stubbed or forwarded) |
| `.TotalHeapSize` | 2 | .NET helper / Options row (stubbed or forwarded) |
| `.SnapshotJson` | 1 | shim computed, collection |
| `.snapshotJson` | 1 | collection |
| `.MagicLvl` | 1 | skill |
| `.ItemConsumeId` | 1 | skill |
| `.ItemConsumeCount` | 1 | skill |
| `.DisplayName` | 1 | pet |
| `.Instrument` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.IsRunning` | 1 | me, creature |
| `.dX` | 1 | creature |
| `.dY` | 1 | creature |
| `.CollisionRadius` | 1 | creature |
| `.IsPassive` | 1 | skill |
| `.IsSleeping` | 1 | me, creature |
| `.IsParalyzed` | 1 | me, creature |
| `.IsStunned` | 1 | me, creature |
| `.Cond` | 1 | event / quest data (serialised whole) or Context probe |
| `.State` | 1 | event / quest data (serialised whole) or Context probe |
| `.Step` | 1 | event / quest data (serialised whole) or Context probe |
| `.TargetId` | 1 | probe (undefined is right) |
| `.Enchant` | 1 | probe (undefined is right) |
| `.EnchantLevel` | 1 | probe (undefined is right) |
| `.LegacyId` | 1 | creature |
| `.StoreType` | 1 | creature |
| `.ItemId` | 1 | creature, shim computed |
| `.Text` | 1 | event / quest data (serialised whole) or Context probe |
| `.SendTimeout` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.ReceiveTimeout` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.Connect` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.GetStream` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.Write` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.Read` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.GetString` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.Close` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.IsSpoiled` | 1 | creature |
| `.GetMinThreads` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.GetMaxThreads` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.GetAvailableThreads` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.SetMinThreads` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.GetTotalMemory` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.Current` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.CollectGarbage` | 1 | .NET helper / Options row (stubbed or forwarded) |
| `.ZoneName` | 1 | probe (undefined is right) |
| `.Distance` | 1 | creature, shim computed |


## 6. Free names not declared in swarm.js and not JS builtins

Candidates for host names the docs do not list (or names declared in a way the rough scanner misses, e.g. object-method shorthand or
class fields). Each was checked at runtime by the shim: a name that is really missing throws a ReferenceError there.

| name | uses | line |
|---|---:|---:|
| `SetCombatPolygon` | 6 | 16716 |
| `__extended_host_functions` | 3 | 22068 |
| `missionAbort` | 2 | 26858 |
| `zoneSetup` | 2 | 19335 |
| `acquire` | 1 | 10230 |
| `finish` | 1 | 12045 |
| `release` | 1 | 10239 |
