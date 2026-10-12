// HOST API INVENTORY (2026-10-12, new engine phase 1): statically lists every L2Swarm host global / member that swarm.js uses, with counts.
// Usage: node docs/plan/tools/host_api_inventory.js [path/to/swarm.js] [--out docs/plan/new_engine/host_api.md] [--json out.json]
// Method: a small JS tokenizer (comments, strings, template literals with ${...}, regex literals) -> identifier tokens; then
//   1. GLOBALS: identifiers that are a known host name (docs/js-api: globals, host objects, host types, enums, Frame.js helpers, events)
//      and are not preceded by '.' (and not an object-literal key) -> counted;
//   2. UNKNOWN FREE NAMES: identifiers never declared in the file (function/class/const/let/var/params, roughly) that are not JS builtins
//      -> listed (these are host names the docs do not know, or typos);
//   3. MEMBERS of host objects: `<HostGlobal>.<member>` (Me.HP, Send.Attack, Options.FollowName, File.ReadAllText, ...) -> counted;
//   4. ENTITY MEMBERS: `.<Member>` on any other object where Member is a documented entity member or PascalCase (mob.HpPercent, item.Count,
//      s.IsReady, ...) -> counted (heuristic: a PascalCase member of a plain JS object of swarm.js would show up too; it is marked "doc" when
//      the entity docs know it);
//   5. EVENT HOOKS: globalThis.OnX = ... / function OnX -> listed.
// The runtime counterpart is Dashboard/brain_host (every member the shim does not know is logged as "missing" while swarm.js runs).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SRC = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : path.join(ROOT, 'Scripts_dev', 'swarm.js');
const OUT = path.resolve(opt('--out', path.join(ROOT, 'docs', 'plan', 'new_engine', 'host_api.md')));
const JOUT = opt('--json', '');

// ------------------------------------------------------------------ tokenizer
function tokenize(src) {
  const toks = []; let i = 0, line = 1; const n = src.length;
  const braceStack = [];                 // 'b' = normal brace, 't' = template ${ ... }
  const REGEX_PREV_KW = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'else', 'do', 'instanceof', 'yield', 'await']);
  const prevSig = () => toks.length ? toks[toks.length - 1] : null;
  const regexAllowed = () => {
    const p = prevSig(); if (!p) return true;
    if (p.t === 'id') return REGEX_PREV_KW.has(p.v);
    if (p.t === 'num' || p.t === 'str' || p.t === 'tpl' || p.t === 're') return false;
    if (p.t === 'p') return !(p.v === ')' || p.v === ']' || p.v === '}' || p.v === '++' || p.v === '--');
    return true;
  };
  const scanTemplate = () => {           // i points after '`' or after '}' closing a ${ }
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') line++;
      if (c === '`') { i++; toks.push({ t: 'tpl', v: '', line }); return; }
      if (c === '$' && src[i + 1] === '{') { i += 2; braceStack.push('t'); toks.push({ t: 'p', v: '(', line }); return; }
      i++;
    }
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '﻿' || c === ' ') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const seg = src.slice(i, e < 0 ? n : e + 2); line += (seg.match(/\n/g) || []).length; i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; else if (src[j] === '\n') line++; j++; } toks.push({ t: 'str', v: src.slice(i + 1, j), line }); i = j + 1; continue; }
    if (c === '`') { i++; scanTemplate(); continue; }
    if (c === '/' && regexAllowed()) {
      let j = i + 1, cls = false;
      while (j < n) { const d = src[j]; if (d === '\\') { j += 2; continue; } if (d === '\n') break; if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; j++; }
      j++; while (j < n && /[a-z]/i.test(src[j])) j++;
      toks.push({ t: 're', v: src.slice(i, j), line }); i = j; continue;
    }
    if (/[A-Za-z_$]/.test(c)) { let j = i + 1; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++; toks.push({ t: 'id', v: src.slice(i, j), line }); i = j; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) { let j = i + 1; while (j < n && /[0-9A-Za-z_.]/.test(src[j])) j++; toks.push({ t: 'num', v: src.slice(i, j), line }); i = j; continue; }
    if (c === '{') { braceStack.push('b'); toks.push({ t: 'p', v: '{', line }); i++; continue; }
    if (c === '}') { const k = braceStack.pop(); i++; if (k === 't') { toks.push({ t: 'p', v: ')', line }); scanTemplate(); } else toks.push({ t: 'p', v: '}', line }); continue; }
    const three = src.substr(i, 3), two = src.substr(i, 2);
    if (['===', '!==', '...', '**=', '>>>', '<<=', '>>=', '&&=', '||=', '??='].includes(three)) { toks.push({ t: 'p', v: three, line }); i += 3; continue; }
    if (['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'].includes(two)) { toks.push({ t: 'p', v: two, line }); i += 2; continue; }
    toks.push({ t: 'p', v: c, line }); i++;
  }
  return toks;
}

// ------------------------------------------------------------------ known host names (docs/js-api, L2Swarm 3.8.5 reference + 3.8.6-3.8.14 additions seen in swarm.js)
const HOST_OBJECTS = ['Me', 'Target', 'Options', 'Inventory', 'ItemsList', 'BuyList', 'BuffsList', 'DropList', 'PartyList', 'PetList', 'PetInventory', 'SkillsList',
  'CreaturesList', 'MobsList', 'NpcList', 'CharList', 'MacroList', 'FollowChar', 'Vars', 'Send', 'App', 'AppEvents', 'Context', 'net', 'L2Timer', 'DebugConsole', 'console',
  'File', 'TcpClient', 'TcpListener', 'IPAddress', 'Encoding', 'Task', 'JSCore', 'JavaScriptExtensions', 'Process', 'MessageBox', 'WinPrompt', 'Point3D', 'Point', 'Map',
  'PacketReader', 'PacketBuilder', 'Directory', 'Path', 'Environment', 'DateTime', 'TimeSpan'];
const HOST_SCALARS = ['IsConnected', 'IsInCombat', 'IsEnabled', 'IsAttacking', 'IsSitting', 'CurrentZone', 'IsFollowModeOn', 'IsFollowMaster', 'IsInParty', 'IsPartyLeader', 'LastHTML',
  '__FILE__', '__VERSION__', '__DIR__', '__SCRIPTS__', '__PROCID__'];
const HOST_FUNCS = ['IsCharacterReady', 'Distance', 'Select', 'StartCombat', 'StopCombat', 'EnableBot', 'DisableBot', 'Attack', 'RunCommand', 'SetWindowTitle', 'ShowBaloonTip',
  'ClickLink', 'LoadCombatMap', 'SetCombatRange', 'FindPath', 'FindPathSync', 'GetBlockCoordinates', 'UseItem', 'MoveToPoint', 'MoveToNpc', 'TriggerJsEvent', 'Login', 'Logout',
  'Say', 'Shout', 'Tell', 'SayToParty', 'SayToClan', 'SayToTrade', 'SayToAlly', 'GoToPoint', 'GoToNpc', 'Alert', 'Confirm', 'Prompt', 'assert_min_version', 'Dispatch',
  'OpenNpcDialog', 'CloseNpcDialog', 'sleep', 'Sleep', 'Skill', 'Buff', 'Item', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Repeat',
  'BuffLow', 'BuyItem', 'FindItemId', 'FindNpcName', 'FindSkillId', 'IsClassGroup', 'IsMe', 'ItemCount', 'NpcNearby', 'GetQuestState', 'HasQuest',
  'AddCombatPathPoint', 'ClearCombatPath', 'ClearCombatPolygon', 'GetCombatPath', 'GetCombatPolygonJson', 'GetCombatSquareZone', 'LoadCombatPath', 'MoveCombatPathPoint',
  'RemoveCombatPathPoint', 'RunExternalProgram', 'SaveCombatPath', 'SetCombatPathCsv', 'SetCombatPolygonInnerPolygonsJson', 'SetCombatPolygonJson',
  'SetCombatPolygonOuterPointsJson', 'SetCombatSquareZone', 'SetCombatSquareZoneOrigin', 'SetCombatSquareZoneRange', 'UpdateCombatPathPoint', 'UseCombatPath',
  'UseCombatPolygon', 'UseCombatSquareZone', 'Snapshot', 'StartHook', 'StopHook', 'GetHookStatus', 'GetHookError', 'NewItem', 'NewBuff', 'NewSkill', 'UISyncContextDispatch'];
const HOST_ENUMS = ['L2ZoneTypes', 'L2BodyPartTypes', 'L2ShotsTypes', 'L2BeastShotsTypes', 'L2ElementTypes', 'L2ItemTypes', 'L2ClassTypes', 'L2GradeTypes', 'L2WaitTypes',
  'L2MoveTypes', 'L2CreatureTypes', 'CombatZoneTypes', 'ZonePointTypes', 'L2PrivateStoreTypes', 'MessageBoxButton', 'MessageBoxImage', 'MessageBoxResult'];
const KNOWN = new Set([].concat(HOST_OBJECTS, HOST_SCALARS, HOST_FUNCS, HOST_ENUMS));
const KIND = {}; HOST_OBJECTS.forEach(k => KIND[k] = 'object'); HOST_SCALARS.forEach(k => KIND[k] = 'value'); HOST_FUNCS.forEach(k => KIND[k] = 'function'); HOST_ENUMS.forEach(k => KIND[k] = 'enum');
const JS_BUILTINS = new Set(('globalThis Object Function Array Number parseFloat parseInt Infinity NaN undefined Boolean String Symbol Date Promise RegExp Error AggregateError EvalError ' +
  'RangeError ReferenceError SyntaxError TypeError URIError JSON Math Intl ArrayBuffer Atomics Uint8Array Int8Array Uint16Array Int16Array Uint32Array Int32Array Float32Array ' +
  'Float64Array Uint8ClampedArray BigUint64Array BigInt64Array DataView WeakMap Set WeakSet Proxy Reflect FinalizationRegistry WeakRef decodeURI decodeURIComponent ' +
  'encodeURI encodeURIComponent escape unescape eval isFinite isNaN BigInt SharedArrayBuffer arguments this super null true false Iterator queueMicrotask structuredClone').split(' '));
const KEYWORDS = new Set(('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return ' +
  'switch throw try typeof var void while with yield async await of get set static null true false this super undefined').split(' '));
// documented entity members (docs/js-api/entities.txt) + snapshot fields swarm.js's SNAP knows
const ENTITY_MEMBERS = new Set(('Id objId ItemId Name ObjectType X Y Z Point Point3D Distance DistanceString Count length Size GetItemByObjectID GetItemByID GetItemByName ' +
  'ContainsObjectID ContainsID ContainsName forEach filter crtType Title HP MaxHP HpPercent HPString MP MaxMP MpPercent MPString CP MaxCP CPString Level Sex IsDead IsRunning ' +
  'IsInCombat IsNoble IsHero IsWeaponEquiped IsWeaponEquipped RunSpeed WalkSpeed Speed SpeedMultipl dX dY dPoint3D PAtk PAtkSpd PDef MAtk MAtkSpd MDef Accuracy EvasionRate Crit Load ' +
  'MaxLoad LoadString Buffs DeadSinceMs ClassId ClassName ClassType STR DEX CON INT WIT MEN SP IsOutOfControl IsParalyzed IsStunned IsSleeping IsPartyMember IsSitting ' +
  'targetCrt StoreType Clan TitleColor NameColor HasAbnormalEffect IsReady IsMoving IsWaitingAnswer Exp ExpPercent ExpString PvPKills PKKills Karma Fame Vitality ' +
  'AtkElement AtkElementPower RecommLeft RecommHave ReviveToFortress ReviveToClanHall ReviveToCastle ReviveToFixed LastSkillUsed Pet DyeList ExpertiseLevel Gauge MaxGauge ' +
  'CalculateExpPercents DisplayEffect HasQuestAvailable IsSpoiled IsLeader PetName MasterObjId SummonType MaxFed CurFed SoulShotsPerHit SpiritShotsPerHit ExpThisLevel ' +
  'ExpNextLevel FoodString DisplayName OwnerName Skills Price StoreId Type Grade BodyPartTypes IsEquiped IsQuest IsStackable IsCrystalizable EnchantLvl Weight TotalWeight ' +
  'AtkRange AttackElementType AttackElementVal IconName Tooltip Ingredients Products IsWeapon IsJewel Template BaseLevel IsActive IsRunning IsEnabled IsToggle IsNeedTarget ' +
  'Range CastRange TargetType AffectScope MpConsume1 MpConsume2 HpConsume IsNeedItem ItemCount ItemConsumeId ItemConsumeCount ReuseDelay ReuseDelayRaw Elapsed Progress ' +
  'Max ProgressString IsDebuff AbnormalType AbnormalLevel AbnormalTime Trait OperateType IsMagic MagicLvl HitTime EffectPoint AttributeType Description IsEnchantable ' +
  'RemainTime RemainString State Category StepNames StateText CategoryText GetSteps CrestId AllyId AllyCrestId AllyName Leader MemberCount Heading Race ' +
  'SnapshotJson snapshotJson SnapshotJsonNear TargetObjId LastUpdateTimestamp CollisionHeight CollisionRadius IsPvp IsFishing VehicleId CanEquipCloak IsSpoil IsSweep IsResurrect').split(' '));
const isPascal = (s) => /^[A-Z][A-Za-z0-9_]*$/.test(s) && !/^[A-Z0-9_]+$/.test(s);  // PascalCase, not an ALLCAPS constant

// ------------------------------------------------------------------ analysis
function analyse(src) {
  const T = tokenize(src);
  const declared = new Set();
  // declarations (rough, scope-insensitive): function/class names, const/let/var bindings incl. destructuring, params, catch params, arrow params
  for (let k = 0; k < T.length; k++) {
    const t = T[k];
    if (t.t !== 'id') continue;
    if ((t.v === 'function' || t.v === 'class') && T[k + 1] && T[k + 1].t === 'id') declared.add(T[k + 1].v);
    if (t.v === 'const' || t.v === 'let' || t.v === 'var') {
      // collect binding ids until '=' / ';' / 'of' / 'in' at depth 0 (destructuring: ids not followed by ':' inside {} / [])
      let depth = 0;
      for (let j = k + 1; j < T.length; j++) {
        const u = T[j];
        if (u.t === 'p' && (u.v === '{' || u.v === '[')) depth++;
        else if (u.t === 'p' && (u.v === '}' || u.v === ']')) depth--;
        else if (depth === 0 && u.t === 'p' && (u.v === '=' || u.v === ';')) {
          if (u.v === '=') { // skip the initializer up to ',' at depth 0 then continue (const a = 1, b = 2)
            let d = 0, q = j + 1;
            for (; q < T.length; q++) { const w = T[q]; if (w.t === 'p' && ('([{'.includes(w.v))) d++; else if (w.t === 'p' && (')]}'.includes(w.v))) { if (d === 0) break; d--; } else if (d === 0 && w.t === 'p' && (w.v === ',' || w.v === ';')) break; }
            if (T[q] && T[q].v === ',') { j = q; continue; }
          }
          break;
        } else if (depth === 0 && u.t === 'id' && (u.v === 'of' || u.v === 'in')) break;
        else if (u.t === 'id' && !KEYWORDS.has(u.v) && !(T[j + 1] && T[j + 1].v === ':') && !(T[j - 1] && T[j - 1].v === '.')) declared.add(u.v);
      }
    }
  }
  // params: '(' ... ')' followed by '=>' or preceded by 'function [name]' / method head; and single 'x =>'
  for (let k = 0; k < T.length; k++) {
    const t = T[k];
    if (t.t === 'id' && T[k + 1] && T[k + 1].v === '=>') declared.add(t.v);
    if (t.t === 'p' && t.v === '(') {
      // find matching ')'
      let d = 0, j = k;
      for (; j < T.length; j++) { if (T[j].v === '(') d++; else if (T[j].v === ')') { d--; if (d === 0) break; } }
      const after = T[j + 1], before = T[k - 1], before2 = T[k - 2];
      const isParams = (after && after.v === '=>') || (before && before.t === 'id' && before.v === 'function') || (before2 && before2.t === 'id' && before2.v === 'function') ||
        (before && before.t === 'id' && before.v === 'catch') || (after && after.v === '{' && before && before.t === 'id' && !KEYWORDS.has(before.v) && T[k - 2] && (T[k - 2].v === '{' || T[k - 2].v === ',' || T[k - 2].v === '}' || T[k - 2].v === 'async' || T[k - 2].v === 'static' || T[k - 2].v === ';'));
      if (isParams) for (let q = k + 1; q < j; q++) { const u = T[q]; if (u.t === 'id' && !KEYWORDS.has(u.v) && !(T[q + 1] && T[q + 1].v === ':') && !(T[q - 1] && T[q - 1].v === '.')) { declared.add(u.v); /* skip default values */ if (T[q + 1] && T[q + 1].v === '=') { let d2 = 0; q += 2; for (; q < j; q++) { if ('([{'.includes(T[q].v)) d2++; else if (')]}'.includes(T[q].v)) d2--; else if (d2 === 0 && T[q].v === ',') break; } } } }
    }
  }
  const globals = {}, unknownFree = {}, members = {}, entity = {}, hooks = {}, firstLine = {};
  const bump = (o, k, line) => { o[k] = (o[k] || 0) + 1; if (!firstLine[k]) firstLine[k] = line; };
  for (let k = 0; k < T.length; k++) {
    const t = T[k]; if (t.t !== 'id') continue;
    const prev = T[k - 1], next = T[k + 1];
    const afterDot = prev && prev.t === 'p' && (prev.v === '.' || prev.v === '?.');
    const objKey = next && next.v === ':' && prev && (prev.v === '{' || prev.v === ',') ;
    if (afterDot) {
      const obj = T[k - 2];
      if (obj && obj.t === 'id' && T[k - 3] && T[k - 3].v === '.' ) { /* a.b.c: member of a member */ }
      if (obj && obj.t === 'id' && KIND[obj.v] && !(T[k - 3] && (T[k - 3].v === '.' || T[k - 3].v === '?.'))) {
        if (obj.v === 'globalThis') continue;
        bump(members, obj.v + '.' + t.v, t.line);
      } else if (obj && obj.t === 'id' && obj.v === 'globalThis') {
        if (/^On[A-Z]/.test(t.v) && next && next.v === '=') bump(hooks, t.v, t.line);
        else if (KNOWN.has(t.v)) bump(globals, t.v, t.line);
      } else if (ENTITY_MEMBERS.has(t.v) || isPascal(t.v)) bump(entity, t.v, t.line);
      continue;
    }
    if (objKey) continue;
    if (t.v === 'function' && T[k + 1] && /^On[A-Z]/.test(T[k + 1].v || '')) { bump(hooks, T[k + 1].v, t.line); continue; }
    if (KNOWN.has(t.v)) { if (!declared.has(t.v) || KIND[t.v] === 'function' || KIND[t.v] === 'object') bump(globals, t.v, t.line); continue; }
    if (!declared.has(t.v) && !JS_BUILTINS.has(t.v) && !KEYWORDS.has(t.v) && !(prev && prev.v === 'function') && !(next && next.v === '=>' )) bump(unknownFree, t.v, t.line);
  }
  return { tokens: T.length, declared: declared.size, globals, unknownFree, members, entity, hooks, firstLine };
}

// ------------------------------------------------------------------ coverage by the new engine (Dashboard/brain_host + Scripts/agent2.js)
function coverage(r) {
  const BH = path.join(ROOT, 'Dashboard', 'brain_host');
  let host; try { host = require(path.join(BH, 'host.js')); } catch (e) { return null; }
  const { Mirror } = require(path.join(BH, 'mirror.js')), { AppBus } = require(path.join(BH, 'appbus.js')), { Clock } = require(path.join(BH, 'clock.js'));
  const clock = new Clock({ virtual: true });
  const H = host.createHost({ name: 'X', accountId: 'x', mirror: new Mirror('X'), link: { connected: () => false, call: () => undefined, set: () => { }, watch: () => { } },
    timers: clock.forOwner('x'), vfs: { File: {} }, bus: new AppBus(), root: ROOT });
  const g = H.global;
  const globalsMissing = Object.keys(r.globals).filter(k => !(k in g));
  const a2 = fs.readFileSync(path.join(ROOT, 'Scripts', 'agent2.js'), 'utf8');
  const words = (s) => s.replace(/'\s*\+\s*'/g, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean);
  const lists = {};
  for (const m of a2.matchAll(/const (ME|ITEM|SKILL|PARTY|DROP|PET|BUFF)_FIELDS = \(?'([\s\S]+?)'\)?\.split/g)) lists[m[1]] = new Set(words(m[2]));
  const sw = fs.readFileSync(SRC, 'utf8'), fm = /const FIELDS = \('([\s\S]*?)'\)\.split/.exec(sw);
  const cre = new Set((fm ? words(fm[1]) : []).concat(['objId', 'Name', 'Id', 'TargetObjId', 'IsLeader', 'MasterObjId', 'CurFed', 'MaxFed', 'IsStunned', 'IsSleeping', 'IsParalyzed']));
  const COMPUTED = new Set(['Point', 'Point3D', 'Distance', 'DistanceString', 'ToString', 'ObjectType', 'IsWeapon', 'IsJewel', 'IsSpoil', 'IsSweep', 'IsResurrect', 'HasAbnormalEffect',
    'CalculateExpPercents', 'SnapshotJson', 'GetSteps', 'targetCrt', 'ItemId', 'Buffs', 'Pet', 'Clan', 'LastSkillUsed', 'TargetObjId', 'Elapsed', 'Template', 'AllyName', 'Skills']);
  const COLL = new Set(['Count', 'length', 'Size', 'forEach', 'filter', 'GetItemByObjectID', 'GetItemByID', 'GetItemByName', 'ContainsObjectID', 'ContainsID', 'ContainsName',
    'SnapshotJson', 'snapshotJson', 'SnapshotJsonNear', 'snapshotJsonNear']);
  const PROBES = new Set(['NpcId', 'Desc', 'ClanName', 'ZoneName', 'ClanId', 'TargetId', 'Enchant', 'EnchantLevel', 'IsQuestItem']);
  const EVENTDATA = new Set(['Cond', 'State', 'Step', 'Text', 'HasQuest', 'GetQuestState']);
  const OTHER = new Set(['Length', 'GetBytes', 'Connect', 'GetStream', 'Write', 'Read', 'GetString', 'Close', 'SendTimeout', 'ReceiveTimeout', 'GetMinThreads', 'GetMaxThreads',
    'GetAvailableThreads', 'SetMinThreads', 'GetTotalMemory', 'CollectionCount', 'GetRuntimeHeapInfo', 'UsedHeapSize', 'TotalHeapSize', 'CollectGarbage', 'Ticks', 'Current',
    'Instrument', 'IsEnabled']);
  const entity = Object.keys(r.entity).sort((a, b) => r.entity[b] - r.entity[a]).map(k => {
    const by = [];
    for (const [n, set] of Object.entries(lists)) if (set.has(k)) by.push(n.toLowerCase());
    if (cre.has(k)) by.push('creature');
    if (COMPUTED.has(k)) by.push('shim computed');
    if (COLL.has(k)) by.push('collection');
    if (PROBES.has(k)) by.push('probe (undefined is right)');
    if (!by.length && OTHER.has(k)) by.push('.NET helper / Options row (stubbed or forwarded)');
    if (!by.length && EVENTDATA.has(k)) by.push('event / quest data (serialised whole) or Context probe');
    if (!by.length && (k === 'MoveToPoint' || k === 'Stop')) by.push('3.8.17 movement handle (globalThis.MoveToPoint wrap / op.Stop): the shim returns no handle = 3.8.14 behaviour');
    if (!by.length && k === 'Giran') by.push('swarm.js own object (route table key), not a host member');
    return { k, n: r.entity[k], by: by.join(', ') };
  });
  return { globalsMissing, entity, cov: H.coverage() };
}

// ------------------------------------------------------------------ report
function md(r, srcPath, lines) {
  const sortC = (o) => Object.keys(o).sort((a, b) => o[b] - o[a] || a.localeCompare(b));
  const L = [];
  L.push('# Host API used by swarm.js (static inventory)', '');
  L.push(`Generated ${new Date().toISOString()} by \`docs/plan/tools/host_api_inventory.js\` from \`${path.relative(ROOT, srcPath).replace(/\\/g, '/')}\` (${lines} lines, ${r.tokens} tokens).`);
  L.push('Re-run after swarm.js changes: `node docs/plan/tools/host_api_inventory.js`. The runtime counterpart is the shim\'s missing-member log',
    '(`Dashboard/brain_host`, `host.missing`), which also catches dynamic accesses (`obj[name]`) that a static scan cannot see.', '');
  L.push('Columns: **uses** = occurrences, **line** = first occurrence, **shim** = how Dashboard/brain_host answers it (mirror = from the state the',
    'agent streams, order = forwarded to the agent, local = answered in the brain, stub = harmless fake; from host.js `H.coverage()`).', '');
  const cv = coverage(r);
  const cov = cv ? cv.cov : {};
  const shim = (k) => cov[k] || cov[k.split('.')[0]] || '';
  L.push('## 1. Host globals', '', '| global | kind | uses | line | shim |', '|---|---|---:|---:|---|');
  sortC(r.globals).forEach(k => L.push(`| \`${k}\` | ${KIND[k] || ''} | ${r.globals[k]} | ${r.firstLine[k] || ''} | ${shim(k)} |`));
  L.push('', `Total: ${Object.keys(r.globals).length} globals, ${Object.values(r.globals).reduce((a, b) => a + b, 0)} uses.`, '');
  L.push('## 2. Members of host objects', '', 'Grouped by object (Me, Send, Options, File, App, ...).', '');
  const byObj = {}; Object.keys(r.members).forEach(k => { const [o] = k.split('.'); (byObj[o] = byObj[o] || []).push(k); });
  Object.keys(byObj).sort((a, b) => byObj[b].reduce((s, k) => s + r.members[k], 0) - byObj[a].reduce((s, k) => s + r.members[k], 0)).forEach(o => {
    const ks = byObj[o].sort((a, b) => r.members[b] - r.members[a]);
    L.push(`### ${o} (${ks.length} members, ${ks.reduce((s, k) => s + r.members[k], 0)} uses)`, '', '| member | uses | line | shim |', '|---|---:|---:|---|');
    ks.forEach(k => L.push(`| \`${k}\` | ${r.members[k]} | ${r.firstLine[k] || ''} | ${shim(k)} |`));
    L.push('');
  });
  L.push('## 3. Entity members (on creatures, items, skills, buffs, party members, collections)', '',
    'Heuristic: any `.Member` on a non-host object where Member is documented on an L2 entity or is PascalCase. "doc" = in docs/js-api/entities.txt',
    'or the snapshot field list. Undocumented PascalCase names can be swarm.js\'s own objects (e.g. CONFIG keys) — check before shimming.', '',
    '| member | uses | doc | line |', '|---|---:|:---:|---:|');
  sortC(r.entity).forEach(k => L.push(`| \`.${k}\` | ${r.entity[k]} | ${ENTITY_MEMBERS.has(k) ? 'doc' : ''} | ${r.firstLine[k] || ''} |`));
  L.push('', '## 4. Event hooks swarm.js defines', '', '| hook | definitions | line |', '|---|---:|---:|');
  sortC(r.hooks).forEach(k => L.push(`| \`${k}\` | ${r.hooks[k]} | ${r.firstLine[k] || ''} |`));
  if (cv) {
    L.push('', '## 5. New-engine coverage (Dashboard/brain_host + Scripts/agent2.js)', '',
      'Static check: is every name above answered by the brain host? Globals: defined on the shim\'s global object. Entity members: a field agent2.js',
      'reports (its ME / ITEM / SKILL / PARTY / DROP / PET field lists), a creature field (swarm.js SNAP list = what L2Swarm\'s snapshotJson plus',
      'agent2\'s supplement carry; the exact live field set is NOT verified yet), a computed member of the shim, or a collection method. What the',
      'simulator really touched is in docs/plan/new_engine/sim_last_run.json ("missing").', '');
    L.push('Globals not defined by the shim: ' + (cv.globalsMissing.length ? cv.globalsMissing.map(k => '`' + k + '`').join(', ') : 'none') + '.', '');
    L.push('| entity member | uses | covered by |', '|---|---:|---|');
    cv.entity.forEach(e => L.push('| `.' + e.k + '` | ' + e.n + ' | ' + (e.by || '**NOT COVERED**') + ' |'));
    L.push('');
  }
  L.push('', '## 6. Free names not declared in swarm.js and not JS builtins', '',
    'Candidates for host names the docs do not list (or names declared in a way the rough scanner misses, e.g. object-method shorthand or',
    'class fields). Each was checked at runtime by the shim: a name that is really missing throws a ReferenceError there.', '',
    '| name | uses | line |', '|---|---:|---:|');
  sortC(r.unknownFree).filter(k => r.unknownFree[k] >= 1).slice(0, 200).forEach(k => L.push(`| \`${k}\` | ${r.unknownFree[k]} | ${r.firstLine[k] || ''} |`));
  L.push('');
  return L.join('\n');
}

if (require.main === module) {
  const src = fs.readFileSync(SRC, 'utf8');
  const t0 = Date.now(), r = analyse(src);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, md(r, SRC, src.split('\n').length));
  if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(r, null, 1));
  console.log(`${path.relative(ROOT, OUT)}: ${Object.keys(r.globals).length} globals, ${Object.keys(r.members).length} host members, ${Object.keys(r.entity).length} entity members, ` +
    `${Object.keys(r.hooks).length} hooks, ${Object.keys(r.unknownFree).length} undeclared free names (${Date.now() - t0} ms)`);
}
module.exports = { tokenize, analyse, KNOWN, KIND };
