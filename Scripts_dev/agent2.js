// AGENT v3 (2026-10-12, new engine phase 2; docs/plan/new_engine/DESIGN.md §2 + §11). STAGED COPY: Scripts/agent2.js is the live v2 file of the
// pilot (L2Swarm restarts an attached script on every file change); this file replaces it only when the pilot owner copies it over.
// v3 = v2 + the App bridge for mixed operation (hello.v 3, caps ['bridge']). A v2 brain never sends 'bridge' / 'appemit', so this agent behaves
// exactly like v2 against a phase-1 runner; a v3 brain only sends them to agents that said v >= 3.
//   brain -> agent  { a: 'bridge', on, names: [...], brain: [accountIds] }  subscribe App.on(name) in L2Swarm for each name and relay what swarm.js
//                   engines there emit as { t: 'ap', name, id, sentAtUtc, source, j } (events whose source is a brain account are not relayed back)
//                   { a: 'appemit', name, j, to? }  re-emit an event of my brain context inside L2Swarm (App.emit / App.emitTo; source = my account)
// AGENT v2 (2026-10-12, new engine phase 1; docs/plan/new_engine/DESIGN.md). The per-character script for the BRAIN HOST
// (Dashboard/brain_host/runner.js, TCP 127.0.0.1:8094), which runs the UNCHANGED swarm.js for this character in Node.
// Do NOT confuse with Scripts/agent.js (v1, brain.js on 8093, used by the live pilot): this file is separate and not attached anywhere yet.
// What it does (no game logic at all):
//   1. STATE MIRROR -> brain: Me (ME_FIELDS), creatures (L2Swarm 3.8.10+ snapshotJson, diffed per objId), party, inventory, buffs, skills (+ the
//      fields the developer snapshot lacks), drops, pets, flags (IsInCombat, IsEnabled, ...), target, watched Options / quests. Every 250 ms a
//      DIFF (only what changed), a FULL report on connect / 'resync' / every 60 s.
//   2. EVENTS -> brain: every On* hook swarm.js uses, AppEvents the brain subscribed to, OnIncomingPacket (hex) only while watched.
//   3. ORDERS <- brain: { a: 'call', fn, args } runs a whitelisted host function (Send.* or a FN table entry) with marshalled args
//      ({$p3}, {$p2}, {$ent}, {$fn} callbacks); want=1 -> the result (a promise is awaited: GoToPoint resolves on arrival). 'set' Options.X,
//      'watch' (opt / quest / appevent / packets), 'resync', 'ping'.
//   4. SAFETY NET: when the brain is gone > 5 s the agent drinks HP / MP potions itself (reflex), nothing else. ALSO while the socket is open
//      but the brain is SILENT (engine audit #25, 2026-10-12): a brain that pings ({ a: 'ping' } every 1 s from the thread that runs the
//      contexts) and then sends nothing for AG.silentMs (3 s) is stuck (a blocked worker; its socket lives in the pool's main thread) -> reflex.
//      Gated on a ping seen on this connection, so an old brain that never pings never triggers it.
// ENGINE DATA (2026-10-12, engine audit 'data' group): hello caps + 'invsync' (FN.InvSync: the bag NOW, then the answer; host.js __bagSync);
//   a bag change (OnInventoryUpdate / OnInventoryItemUpdate) goes out on the very next agent tick with a bag version 'iv' (audit #15);
//   orders are decoded with the UTF-8 tail of a read carried over (#4); { $enum, n } and enum Options get the real .NET enum (CombatZoneType,
//   D8); a refused 'set' is logged and the real value re-reported; GoToPoint keeps the timeout in the 4th slot (#3/#9); creatures that leave
//   the 3000 box get TargetObjId 0 / flags false instead of the frozen last value (#5/#14); pets carry Buffs (#6); Me.Clan carries Id (#12).
// ONE setInterval does everything (SCHED lesson: few timers per engine). Heap target: < 2 MB.
// TIMING (2026-10-12, engine audit #10/#11/#13/#27/#29): the tick is 62 ms (was 125): orders are picked up twice as fast, and every tick that
//   is no report sends the FAST EDGES at once (Me.IsCasting, my Target, IsAttacking, my HP/MP/CP) when they changed, so castNow sees a cast end
//   0-62 ms after L2Swarm instead of 0-250 ms. A full report still goes out every 4th tick (250 ms). Skill readiness (skr) goes out with every
//   report (was every 2nd = 500 ms); party + creatures with every report while I fight (was 500 ms). A full skills row of a skill on cooldown
//   carries _el (its Elapsed), so the brain keeps its cooldown clock across full reports. hello caps 'assume': on my own OnMagicSkillUse /
//   OnTargetSelected the brain pre-updates its mirror (casting, that skill on cooldown, my target) at the event, and this agent then re-sends
//   the real IsCasting / readiness / Target on the next tick / report (markers below), so a wrong assumption lives at most one tick.
const AG = { rep: 0, tickMs: 62, repEvery: 4,   /* TICK125 tried 2026-10-13 and reverted: test_engine_timing needs order pickup <= 75 ms and the cast end within 80 ms */ fastSent: 0, host: '127.0.0.1', port: 8094, v: 3, bridge: null, bridgeSubs: {}, bridged: 0, emitted: 0, sock: null, st: null, buf: '', rx: null, connAt: 0, lostAt: Date.now(), tick: 0, sent: 0, got: 0, errors: 0,
  last: { me: {}, cr: {}, sec: {}, skr: {}, fl: {}, opt: {}, q: {}, tgt: -1, html: '' }, full: true, lastFull: 0, watch: { opt: {}, quest: {}, ae: {}, packets: false },
  reflex: { hpPot: 45, mpPot: 25, gapMs: 6000, lastHp: 0, lastMp: 0 }, out: [], utail: [], invVer: 0, cdAt: {}, lastRx: 0, pinged: false, silentMs: 3000, silentSince: 0, silentEpisodes: 0 };
const num = (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0);
const now = () => Date.now();
const ME_FIELDS = ('Name objId Id X Y Z HP MaxHP HpPercent MP MaxMP MpPercent CP MaxCP Level ClassId ClassName ClassType IsDead IsCasting IsInCombat IsAttacking IsSitting ' +
  'IsMoving IsRunning Exp ExpPercent SP PAtkSpd MAtkSpd PAtk MAtk PDef MDef RunSpeed WalkSpeed Speed Karma HennaSTR HennaDEX HennaCON HennaINT HennaWIT HennaMEN Title Heading ' +
  'Race Sex ExpertiseLevel IsStunned IsSleeping IsParalyzed IsOutOfControl Load MaxLoad PvPKills PKKills Fame Vitality IsNoble IsHero IsWeaponEquiped InventoryLimit').split(' ');   // QSYS-2026-10-13: InventoryLimit (bag slots, L2Swarm.Core get_InventoryLimit) for the quest engine's bag check; absent = skipped by pick()
const CR_DROP = { Buffs: 1, Point: 1, Point3D: 1, dPoint3D: 1, Clan: 1, targetCrt: 1, DistanceString: 1, HPString: 1, MPString: 1, CPString: 1, LoadString: 1 };
const ITEM_FIELDS = 'objId Id Name Count IsEquiped IsQuest IsQuestItem IsStackable EnchantLvl Type Grade BodyPartTypes Price Weight PAtk MAtk PDef MDef'.split(' ');
const SKILL_FIELDS = ('Id Level Name IsActive IsPassive IsReady IsToggle IsEnabled IsNeedTarget CastRange Range TargetType AffectScope MP HpConsume ItemConsumeId ItemConsumeCount ReuseDelay ' +
  'IsDebuff AbnormalType AbnormalLevel AbnormalTime OperateType IsMagic MagicLvl HitTime AttributeType Description').split(' ');
const PARTY_FIELDS = 'objId Name ClassId Level HP MaxHP HpPercent MP MaxMP MpPercent CP MaxCP IsDead X Y Z IsLeader'.split(' ');
const DROP_FIELDS = 'objId Id Name Count X Y Z'.split(' ');
const BUFF_FIELDS = 'Id Level Name IsDebuff AbnormalType AbnormalLevel RemainTime'.split(' ');
const PET_FIELDS = 'objId Id Name DisplayName Level HP MaxHP HpPercent MP MaxMP MpPercent IsDead X Y Z MasterObjId SummonType CurFed MaxFed'.split(' ');

// ---------------------------------------------------------------- serialising host values
function plain(v) {
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === 'bigint') return Number(v);
  if (t === 'number' || t === 'boolean') return v;
  if (t === 'string') return v;
  if (t === 'function') return undefined;
  // .NET enums (Mob, PEACEZONE, FIGHTER, C, ...) -> their text. NOT collections (they have Count) and NOT other host objects, whose ToString()
  // is their type name ('L2Swarm.Core.L2Clan', 'System.Collections.ObjectModel.ObservableCollection`1[...]'): those get serialised field by field.
  try { if (v.Count === undefined && typeof v.ToString === 'function') { const s = String(v); if (s !== '[object Object]' && !/[.`[]/.test(s)) return s; } } catch (e) { }
  return undefined;
}
function pick(o, fields) { const r = {}; for (let i = 0; i < fields.length; i++) { const f = fields[i]; let v; try { v = o[f]; } catch (e) { continue; } if (v === undefined) continue; const p = plain(v); if (p !== undefined) r[f] = p; } return r; }
function ser(v, d) {
  const p = plain(v); if (p !== undefined || v === null || v === undefined) return p === undefined ? null : p;
  if ((d || 0) > 2) return null;
  try { if (typeof v.forEach === 'function' && v.Count !== undefined) { const a = []; v.forEach(x => a.push(ser(x, (d || 0) + 1))); return a; } } catch (e) { }
  if (Array.isArray(v)) return v.map(x => ser(x, (d || 0) + 1));
  const r = {}; let n = 0;
  try { for (const k in v) { if (n++ > 60) break; let x; try { x = v[k]; } catch (e) { continue; } if (typeof x === 'function') continue; const s = ser(x, (d || 0) + 1); if (s !== null && s !== undefined) r[k] = s; } } catch (e) { }
  return r;
}
const items = (list) => { const a = []; try { if (list && typeof list.forEach === 'function') list.forEach(it => a.push(pick(it, ITEM_FIELDS))); } catch (e) { } return a; };

// an Options value that is a collection (CombatSkillsList, AutoSkillsList, ...): plain rows; the brain writes single fields back ('Options.K[i].F')
function optValue(raw) {
  const p = plain(raw); if (p !== undefined) return p;
  if (raw && raw.Count !== undefined) { const a = []; const n = num(raw.Count); for (let i = 0; i < n && i < 200; i++) { const el = raw[i]; const r = pick(el, 'IsEnabled Id Name Level Delay Percent Condition Target'.split(' ')); try { if (el.Instrument) r.Instrument = pick(el.Instrument, 'Id Name Level'.split(' ')); } catch (e) { } a.push(r); } return a; }
  return null;
}

// ---------------------------------------------------------------- connection
function agConnect() {
  if (AG.sock || now() - AG.connAt < 3000) return;
  AG.connAt = now();
  try {
    const c = new TcpClient(); c.NoDelay = true; c.SendTimeout = 1000; c.ReceiveTimeout = 500;
    c.Connect(AG.host, AG.port);
    AG.sock = c; AG.st = c.GetStream(); AG.buf = ''; AG.utail = []; AG.pinged = false; AG.lastRx = now(); AG.silentSince = 0; if (!AG.rx) AG.rx = Encoding.UTF8.GetBytes(' '.repeat(65536));
    let acc = ''; try { acc = String(App.self().accountId || ''); } catch (e) { }
    agSend({ t: 'hello', v: AG.v, caps: ['bridge', 'assume', 'invsync', 'enumopt'], name: String(Me.Name || ''), objId: num(Me.objId), accountId: acc, version: String(typeof __VERSION__ !== 'undefined' ? __VERSION__ : ''), cls: num(Me.ClassId), level: num(Me.Level) });
    AG.full = true; AG.last = { me: {}, cr: {}, sec: {}, skr: {}, fl: {}, opt: {}, q: {}, tgt: -1, html: '' }; AG.pend = [];   // AGENTPERF: jobs of the old connection are moot (the full report re-queues all)
  } catch (e) { agDrop(); }
}
// SLOWTRACE-2026-10-13 (user: "why do we keep seeing agent2.js ran JS for 30 s without returning" - 200-700 L2Swarm watchdog interrupts per hour):
// what the agent was doing when a call / tick took long or was interrupted -> Logs/agent_slow.log (+ a log line to the brain when it can)
var AGCUR = { w: '', at: 0 };
function agSlow(what, t0, err) {
  const ms = Date.now() - t0; if (ms < 3000 && !/interrupt/i.test(String(err || ''))) return;
  let nm = ''; try { nm = String(Me.Name || ''); } catch (e) { }
  let tp = ''; try { const k = Object.keys(AG.tp || {}).sort((a, b) => AG.tp[b] - AG.tp[a]).slice(0, 5); tp = ' [' + k.map(x => x + '=' + AG.tp[x]).join(' ') + (k.length ? ' ' : '') + 'hostReads=' + (AG.hr - (AG.hrTick || 0)) + ' pend=' + (AG.pend ? AG.pend.length : 0) + ' at=' + AGCUR.w + ']'; } catch (e) { }   // AGENTPERF: where the time went
  const line = new Date().toISOString() + ' [' + nm + '] ' + ms + ' ms ' + what + tp + (err ? ' ERR ' + String(err).slice(0, 160) : '');
  try { File.AppendAllText(__DIR__ + String.fromCharCode(92) + 'Logs' + String.fromCharCode(92) + 'agent_slow.log', line + String.fromCharCode(13, 10)); } catch (e) { }
  try { if (AG.st) agSend({ t: 'log', text: 'SLOW ' + ms + ' ms ' + what + (err ? ' ERR ' + String(err).slice(0, 120) : '') }); } catch (e) { }
}
function agDrop() { try { if (AG.sock) AG.sock.Close(); } catch (e) { } if (AG.sock) AG.lostAt = now(); AG.sock = null; AG.st = null; }
function agSend(o) {
  if (!AG.st) return false;
  try { const b = Encoding.UTF8.GetBytes(JSON.stringify(o) + '\n'); AG.st.Write(b, 0, b.Length); AG.sent++; return true; } catch (e) { AG.errors++; agDrop(); return false; }
}
function agRead() {
  if (!AG.st) return;
  try { for (let i = 0; i < 20 && AG.st.DataAvailable; i++) { const n = AG.st.Read(AG.rx, 0, AG.rx.Length); if (n <= 0) { agDrop(); return; } AG.buf += utf8Chunk(AG.rx, n); } }
  catch (e) { AG.errors++; agDrop(); return; }
  let k;
  while ((k = AG.buf.indexOf('\n')) >= 0) {
    const line = AG.buf.slice(0, k); AG.buf = AG.buf.slice(k + 1);
    if (!line.trim()) continue;
    let m = null; try { m = JSON.parse(line); } catch (e) { continue; }
    AG.got++; AG.lastRx = now(); if (m && m.a === 'ping') AG.pinged = true; else { const w = orderWake(m); if (w) wake(w); else wakeNote('noWake:' + orderName(m)); }   // TICKMODE: only a real action wakes (WAKE2)
    try { agDo(m); } catch (e) { if (m && m.id) agSend({ t: 'res', id: m.id, ok: false, err: String(e && e.message || e).slice(0, 300) }); }
  }
}

// UTF-8 ACROSS READS (engine audit #4): a Read can end inside a multi-byte character (dash, ae/oe/aa, emoji). The incomplete tail bytes are kept
// (AG.utail, plain numbers) and finished with the first bytes of the next read; only whole characters go through Encoding.UTF8.GetString.
const u8need = (b) => (b >= 0xF0 ? 4 : b >= 0xE0 ? 3 : b >= 0xC0 ? 2 : 1);
function u8str(a) {
  const need = u8need(a[0]); if (need === 1) return a[0] < 0x80 ? String.fromCharCode(a[0]) : '\uFFFD';
  if (a.length !== need) return '\uFFFD';
  let cp = a[0] & (need === 2 ? 0x1F : need === 3 ? 0x0F : 0x07); for (let i = 1; i < need; i++) cp = (cp << 6) | (a[i] & 0x3F);
  try { return String.fromCodePoint(cp); } catch (e) { return '\uFFFD'; }
}
function utf8Chunk(rx, n) {
  let s = '', start = 0;
  if (AG.utail.length) {
    const need = u8need(AG.utail[0]);
    while (AG.utail.length < need && start < n && (num(rx[start]) & 0xC0) === 0x80) AG.utail.push(num(rx[start++]) & 255);
    if (AG.utail.length < need && start >= n) return s;                 // still incomplete (a 1-2 byte read): wait for more
    s += u8str(AG.utail); AG.utail = [];
  }
  let end = n, k = n - 1, back = 0;
  while (k >= start && back < 3 && (num(rx[k]) & 0xC0) === 0x80) { k--; back++; }
  if (k >= start) { const b = num(rx[k]) & 255; if (b >= 0xC0 && n - k < u8need(b)) end = k; }
  if (end > start) s += Encoding.UTF8.GetString(rx, start, end - start);
  for (let i = end; i < n; i++) AG.utail.push(num(rx[i]) & 255);
  return s;
}

// ---------------------------------------------------------------- orders
// HOST CALLS (2026-10-12, live bug): ClearScript host methods (Send.Say2, Send.MoveBackwardToLocation, ...) are callable but are NOT JS functions:
// they have no apply / call / bind. v3 used f.apply(Send, args) -> "f.apply is not a function" for EVERY Send.* order (no .town, no straight
// walking, no NPC clicks, no skills) while the FN-table orders (StartCombat, GoToPoint, ...) worked. Call them as plain member calls with the
// exact argument count (trailing undefined dropped, so ClearScript binds the overload with optional parameters as swarm.js's own call does).
function callArgs(o, k, a) {
  let n = a.length; while (n > 0 && a[n - 1] === undefined) n--;
  switch (n) {
    case 0: return o[k](); case 1: return o[k](a[0]); case 2: return o[k](a[0], a[1]); case 3: return o[k](a[0], a[1], a[2]);
    case 4: return o[k](a[0], a[1], a[2], a[3]); case 5: return o[k](a[0], a[1], a[2], a[3], a[4]); case 6: return o[k](a[0], a[1], a[2], a[3], a[4], a[5]);
    case 7: return o[k](a[0], a[1], a[2], a[3], a[4], a[5], a[6]); case 8: return o[k](a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]);
    default: return o[k](...a.slice(0, n));
  }
}
const G0 = { f: null };
const callFn = (f, a) => { G0.f = f; return callArgs(G0, 'f', a); };   // a global host function (MoveToPoint has 4 overloads: never pass padding undefineds)
// every callable host function: lexical references (several of them are consts of L2Swarm's prelude, not globalThis properties)
const FN = {
  StartCombat: () => StartCombat(), StopCombat: () => StopCombat(), EnableBot: () => EnableBot(), DisableBot: () => DisableBot(),
  Attack: (id) => Attack(id), RunCommand: (c) => RunCommand(c), ClickLink: (l) => ClickLink(l), LoadCombatMap: (p) => LoadCombatMap(p),
  SetCombatRange: (r, p) => (p == null ? SetCombatRange(r) : SetCombatRange(r, p)), UseItem: (id, ok, fail) => (ok || fail ? UseItem(id, ok, fail) : UseItem(id)),
  MoveToPoint: (...a) => callFn(MoveToPoint, a), MoveToNpc: (n, ok, fail) => MoveToNpc(n, ok, fail),
  GoToPoint: (x, y, z, ms) => (ms != null ? (z == null ? GoToPoint(x, y, undefined, ms) : GoToPoint(x, y, z, ms)) : z != null ? GoToPoint(x, y, z) : GoToPoint(x, y)),   // #3/#9: a JSON null z = no z
  InvSync: () => { invPush(true); return true; },   // #15: the bag as L2Swarm has it NOW goes out before this call's answer
  GoToNpc: (n) => GoToNpc(n),
  FindPath: (p) => FindPath(p), Select: (a, r) => (r == null ? Select(a) : Select(a, r)), Login: () => Login(), Logout: () => Logout(),
  Say: (t) => Say(t), Shout: (t) => Shout(t), Tell: (t, to) => Tell(t, to), SayToParty: (t) => SayToParty(t), SayToClan: (t) => SayToClan(t), SayToTrade: (t) => SayToTrade(t), SayToAlly: (t) => SayToAlly(t),
  BuyItem: (id, n) => BuyItem(id, n),
  SetCombatSquareZone: (r, p) => SetCombatSquareZone(r, p), SetCombatSquareZoneOrigin: (p) => SetCombatSquareZoneOrigin(p), SetCombatSquareZoneRange: (r) => SetCombatSquareZoneRange(r),
  UseCombatSquareZone: () => UseCombatSquareZone(), SetCombatPolygonJson: (a, b) => (typeof SetCombatPolygonJson === 'function' ? SetCombatPolygonJson(a, b) : SetCombatPolygon(JSON.parse(a || '[]'), JSON.parse(b || '[]'))),   // 3.8.18: the Json global is not in script scope; the prelude's SetCombatPolygon is used instead
  SetCombatPolygonOuterPointsJson: (a) => SetCombatPolygonOuterPointsJson(a),   // RELEASE-PATCH-AGENT2-2026-10-13: was hidden inside the comment above
  SetCombatPolygonInnerPolygonsJson: (a) => SetCombatPolygonInnerPolygonsJson(a), UseCombatPolygon: () => UseCombatPolygon(), ClearCombatPolygon: () => ClearCombatPolygon(),
  SetCombatPathCsv: (c) => SetCombatPathCsv(c), UseCombatPath: () => UseCombatPath(), ClearCombatPath: () => ClearCombatPath(), LoadCombatPath: (p) => LoadCombatPath(p),
  AddCombatPathPoint: (x, y, z, r) => AddCombatPathPoint(x, y, z, r), RemoveCombatPathPoint: (i) => RemoveCombatPathPoint(i), MoveCombatPathPoint: (a, b) => MoveCombatPathPoint(a, b),
  UpdateCombatPathPoint: (i, x, y, z, r) => UpdateCombatPathPoint(i, x, y, z, r), SaveCombatPath: (p) => SaveCombatPath(p),
};
function ent(a) {
  const id = num(a.objId), k = a.$ent;
  try {
    if (k === 'me') return Me;
    if (k === 'item') return Inventory.GetItemByObjectID(id) || (num(a.id) ? Inventory.GetItemByID(num(a.id)) : null);
    if (k === 'party') return PartyList.GetItemByObjectID(id);
    if (k === 'skill') return SkillsList.GetItemByID(num(a.id));
    if (k === 'buff') return BuffsList.GetItemByID(num(a.id));
    if (k === 'drop') return DropList.GetItemByObjectID(id);
    if (k === 'pet') return PetList.GetItemByObjectID ? PetList.GetItemByObjectID(id) : null;
    return CreaturesList.GetItemByObjectID(id);
  } catch (e) { return null; }
}
// .NET enums (D8, 2026-10-12): ClearScript does not turn a JS number / string into an enum, so Options.CombatZoneType = 1 / 'Map' was refused
// (silently: 'set' has no answer). The brain sends { $enum: 'CombatZoneTypes', n: 'Map' }; an enum Option written with a plain name works too.
const ENUM_T = { CombatZoneTypes: () => (typeof CombatZoneTypes !== 'undefined' ? CombatZoneTypes : null), ZonePointTypes: () => (typeof ZonePointTypes !== 'undefined' ? ZonePointTypes : null) };
const OPT_ENUM = { CombatZoneType: 'CombatZoneTypes' };
function enumVal(type, n) { const T = ENUM_T[type] ? ENUM_T[type]() : null; if (T && typeof n === 'string') { let e; try { e = T[n]; } catch (er) { e = undefined; } if (e !== undefined && e !== null) return e; } return n; }
function unmarshal(v, callId) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => unmarshal(x, callId));
  if (v.$p3) return new Point3D(num(v.$p3[0]), num(v.$p3[1]), num(v.$p3[2]));
  if (v.$p2) return new Point(num(v.$p2[0]), num(v.$p2[1]));
  if (v.$ent) return ent(v);
  if (v.$enum) return enumVal(String(v.$enum), v.n);
  if (v.$fn) { const n = v.$fn; return function () { const a = []; for (let i = 0; i < arguments.length; i++) a.push(ser(arguments[i], 1)); agSend({ t: 'cb', id: callId, n, args: a }); }; }
  const r = {}; Object.keys(v).forEach(k => { r[k] = unmarshal(v[k], callId); }); return r;
}
function agDo(m) {
  switch (m.a) {
    case 'call': {
      const fn = String(m.fn || '');
      let f = null, isSend = false;
      if (fn.indexOf('Send.') === 0) { isSend = true; try { f = Send[fn.slice(5)]; } catch (e) { f = null; } } else f = FN[fn];
      if (!f || (typeof f !== 'function' && typeof f !== 'object')) { if (m.want) agSend({ t: 'res', id: m.id, ok: false, err: 'not callable here: ' + fn }); else agSend({ t: 'log', text: 'call ' + fn + ': not callable here' }); return; }
      const args = (m.args || []).map(x => unmarshal(x, m.id));
      let r; const tc0 = Date.now(); AGCUR.w = 'call ' + fn; AGCUR.at = tc0;   // SLOWTRACE
      try { r = isSend ? callArgs(Send, fn.slice(5), args) : callFn(f, args); agSlow('call ' + fn, tc0, ''); } catch (e) { agSlow('call ' + fn, tc0, e && e.message || e); const er = String(e && e.message || e).slice(0, 300); if (m.want) agSend({ t: 'res', id: m.id, ok: false, err: er }); else agSend({ t: 'log', text: 'call ' + fn + ' failed: ' + er }); return; }   // 2026-10-12: fire-and-forget errors were swallowed
      if (!m.want) return;
      if (r && typeof r.then === 'function') { r.then(v => agSend({ t: 'res', id: m.id, ok: true, v: ser(v, 1) }), e => agSend({ t: 'res', id: m.id, ok: false, err: String(e && e.message || e).slice(0, 300) })); return; }
      agSend({ t: 'res', id: m.id, ok: true, v: ser(r, 1) }); return;
    }
    case 'set': {
      const p = String(m.path || ''); if (p.indexOf('Options.') !== 0) return;
      const el = /^Options\.(\w+)\[(\d+)\]\.(\w+)$/.exec(p);
      if (el) { const L = Options[el[1]]; if (L && num(el[2]) < num(L.Count)) L[num(el[2])][el[3]] = unmarshal(m.v, 0); AG.watch.opt[el[1]] = 1; return; }
      const k = p.slice(8); let v = unmarshal(m.v, 0); if (OPT_ENUM[k] && (typeof v === 'string' || typeof v === 'number')) v = enumVal(OPT_ENUM[k], String(v));
      AG.watch.opt[k] = 1; delete AG.last.opt[k];                     // the next report sends what L2Swarm really has now (also after a refused set)
      try { Options[k] = v; } catch (e) { agSend({ t: 'log', text: 'set Options.' + k + ' refused: ' + String(e && e.message || e).slice(0, 200) }); }
      return;
    }
    case 'watch': {
      if (m.kind === 'opt') AG.watch.opt[String(m.key)] = 1;
      else if (m.kind === 'quest') AG.watch.quest[num(m.key)] = 1;
      else if (m.kind === 'appevent' && !AG.watch.ae[m.key]) { const name = String(m.key); AG.watch.ae[name] = 1; try { AppEvents.on(name, (d) => agSend({ t: 'ae', name, d: ser(d, 1) })); } catch (e) { agSend({ t: 'log', text: 'AppEvents ' + name + ': ' + e.message }); } }
      else if (m.kind === 'packets') { AG.watch.packets = !!m.key; try { Options.EnableJSOnIncomingPacket = !!m.key; } catch (e) { } }
      return;
    }
    case 'bridge': {                                   // v3: relay these App events between L2Swarm and my brain context
      if (!m.on) { AG.bridge = null; return; }
      const brain = {}; (m.brain || []).forEach(a => { brain[String(a)] = 1; }); AG.bridge = { brain };
      (m.names || []).forEach(n => {
        const name = String(n); if (AG.bridgeSubs[name]) return;
        try {
          AG.bridgeSubs[name] = App.on(name, (e) => {
            try {
              if (!AG.bridge || !e) return;
              const src = e.source || {}; if (AG.bridge.brain[String(src.accountId || '')]) return;   // a brain context's own event (re-emitted by its agent)
              AG.bridged++; agSend({ t: 'ap', name, id: String(e.id || ''), sentAtUtc: String(e.sentAtUtc || ''), source: { accountId: String(src.accountId || ''), characterName: String(src.characterName || ''), scriptId: String(src.scriptId || ''), scriptName: String(src.scriptName || '') }, j: JSON.stringify(e.data === undefined ? null : e.data) });
            } catch (er) { AG.errors++; }
          }) || 1;
        } catch (e) { agSend({ t: 'log', text: 'bridge App.on ' + name + ': ' + (e && e.message) }); }
      });
      return;
    }
    case 'appemit': {                                  // v3: my brain context emitted this; L2Swarm gives it my account as the source
      const d = JSON.parse(String(m.j || 'null')); AG.emitted++;
      if (m.to) App.emitTo(String(m.to), String(m.name), d); else App.emit(String(m.name), d);
      return;
    }
    case 'resync': AG.full = true; return;
    case 'ping': agSend({ t: 'pong', id: m.id, at: now() }); return;
    case 'bye': agDrop(); AG.connAt = now() + 60000; return;
  }
}

// ---------------------------------------------------------------- AGENTPERF-2026-10-13: cheap collection reads
// Live problem 2026-10-13 16:45-17:02: Dagger1 (Giran, 200 bag kinds) stayed dead in the brain: his FULL report (every section in one tick,
// ~200 items x 18 host property reads + per-creature live reads of every player in the 3000 box + every skill twice) took > 30 s on the
// saturated PC (100 % CPU, L2Swarm 4-6 cores, all 59 agents 3-40 s per tick), L2Swarm's ExecutionWatchdog interrupted it, AG.full stayed
// true, the next tick tried the same full report again ... and `me` (sent only at the END of report()) never reached the brain, so
// swarm.js waited in `while (!IsCharacterReady())` until one tick happened to finish in 30.4 s (17:02:51).
// Fix: (1) `me` + flags + target go out FIRST, in their own message, at the start of every full report; (2) the other sections are JOBS run
// under a per-tick time budget (AG.budgetMs) and spread over the next ticks (AG.pend), at least one job per tick; (3) one SnapshotJson() host
// call per collection (bag, skills, buffs, shop list) instead of one host read per item and field; (4) creature live reads capped (nearest
// monsters / party members; players only near me, and in a town only the nearest few); (5) the slow Me fields once a second.
// The developer snapshot lacks some fields and may format some differently, so each list CALIBRATES: a field whose snapshot value equals the
// live pick() value on up to 6 rows is TRUSTED (taken from the JSON); the others are read live, static ones once per item (cache), volatile
// ones on every rebuild. No snapshot / no live object to compare with = the old per-item path.
AG.hr = 0;                                            // host reads (approximate), for the perf lines
AG.pend = []; AG.budgetMs = 40; AG.deferred = 0; AG.tp = {}; AG.tk0 = 0; AG.partyIds = {};
function collSnap(coll) {
  AG.hr++;
  try { if (coll && typeof coll.SnapshotJson === 'function') return String(coll.SnapshotJson()); } catch (e) { }
  try { if (coll && typeof coll.snapshotJson === 'function') return String(coll.snapshotJson()); } catch (e) { }
  return null;
}
const SNAPC = {};
const sameV = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
function calibrate(spec, S, rows) {
  const tr = {}; spec.fields.forEach(f => { tr[f] = true; });
  let n = 0;
  for (let i = 0; i < rows.length && n < 6; i++) {
    const row = rows[i]; let o = null; try { o = row ? spec.live(row) : null; } catch (e) { o = null; } AG.hr++; if (!o) continue;
    const lv = pick(o, spec.fields); AG.hr += spec.fields.length; n++;
    spec.fields.forEach(f => { if (!tr[f]) return; const inS = row[f] !== undefined, inL = lv[f] !== undefined; if (inS !== inL || (inS && !sameV(row[f], lv[f]))) tr[f] = false; });
  }
  if (!n) return false;
  S.trust = tr; const un = spec.fields.filter(f => !tr[f]); S.volUn = un.filter(f => spec.vol[f]); S.statUn = un.filter(f => !spec.vol[f]); S.calAt = now();
  return true;
}
/** the rows of a host collection with spec.fields (like items() / pick()), from ONE snapshot host call; null = use the old per-item path */
function fastList(spec, coll) {
  const S = SNAPC[spec.name] || (SNAPC[spec.name] = { raw: null, out: null, trust: null, cache: {}, off: false, volUn: [], statUn: [] });
  if (S.off) return null;
  const raw = collSnap(coll); if (raw === null) { S.off = true; return null; }
  if (raw === S.raw && S.out && !S.volUn.length) return S.out;
  let rows = null; try { rows = JSON.parse(raw); } catch (e) { rows = null; }
  if (!Array.isArray(rows)) { S.bad = (S.bad || 0) + 1; if (S.bad > 5) S.off = true; return null; }
  if (!rows.length) { S.raw = raw; S.out = []; return S.out; }
  if (!S.trust && !calibrate(spec, S, rows)) return null;
  const out = [], cache = {}, prev = S.cache;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; if (!row || typeof row !== 'object') continue;
    const key = spec.key(row); let st = S.statUn.length ? prev[key] : null, o;
    if (S.statUn.length && !st) { try { o = spec.live(row); } catch (e) { o = null; } AG.hr += 1 + S.statUn.length; st = o ? pick(o, S.statUn) : null; }
    if (st) cache[key] = st;
    let vv = null;
    if (S.volUn.length) { if (o === undefined) { try { o = spec.live(row); } catch (e) { o = null; } AG.hr++; } vv = o ? pick(o, S.volUn) : null; AG.hr += S.volUn.length; }
    const r = {};
    for (let j = 0; j < spec.fields.length; j++) { const f = spec.fields[j]; const v = S.trust[f] ? row[f] : spec.vol[f] ? (vv ? vv[f] : undefined) : (st ? st[f] : undefined); if (v !== undefined) r[f] = v; }
    out.push(r);
  }
  S.cache = cache; S.raw = raw; S.out = out;
  return out;
}
/** a full report re-checks lists with untrusted volatile fields (a calibration race marks a changing Count / RemainTime untrusted) */
function recalibrate() { for (const k in SNAPC) { const S = SNAPC[k]; if (S.trust && S.volUn.length && now() - (S.calAt || 0) > 50000) { S.trust = null; S.raw = null; } } }
const LS = {
  inv: { name: 'inv', fields: ITEM_FIELDS, vol: { Count: 1, IsEquiped: 1, EnchantLvl: 1 }, key: (r) => r.objId + ':' + r.Id, live: (r) => Inventory.GetItemByObjectID(num(r.objId)) },
  skills: { name: 'skills', fields: SKILL_FIELDS, vol: { IsReady: 1, IsEnabled: 1, ReuseDelay: 1, Level: 1 }, key: (r) => r.Id + ':' + r.Level, live: (r) => SkillsList.GetItemByID(num(r.Id)) },
  buffs: { name: 'buffs', fields: BUFF_FIELDS, vol: { RemainTime: 1, Level: 1 }, key: (r) => r.Id + ':' + r.Level, live: (r) => BuffsList.GetItemByID(num(r.Id)) },
  buy: { name: 'buy', fields: ITEM_FIELDS, vol: { Count: 1 }, key: (r) => r.objId + ':' + r.Id,
    live: (r) => { let o = null; try { if (num(r.objId) && typeof BuyList.GetItemByObjectID === 'function') o = BuyList.GetItemByObjectID(num(r.objId)); } catch (e) { } if (!o) { try { if (typeof BuyList.GetItemByID === 'function') o = BuyList.GetItemByID(num(r.Id)); } catch (e) { } } return o; } },
};
const invRows = () => fastList(LS.inv, Inventory) || items(Inventory);
function buyRows() { let r = null; try { r = fastList(LS.buy, BuyList); } catch (e) { r = null; } return r || items(BuyList); }

// ---------------------------------------------------------------- the bag at once (#15)
/** send the bag now (force: even when unchanged, as the answer barrier of InvSync); iv = bag version (bumped when the content changed) */
function invPush(force) {
  AG.invDirty = false;
  let a; try { a = invRows(); } catch (e) { return false; }
  const s = JSON.stringify(a);
  if (!force && AG.last.sec.inv === s) return false;
  if (AG.last.sec.inv !== s) AG.invVer++;
  AG.last.sec.inv = s;
  return agSend({ t: 'st', seq: AG.rep, inv: a, iv: AG.invVer });
}

// ---------------------------------------------------------------- state report (diffs)
function diffObj(prev, cur) { let d = null; for (const k in cur) { if (prev[k] !== cur[k]) { (d || (d = {}))[k] = cur[k]; prev[k] = cur[k]; } } return d; }
// COOLDOWN CLOCK (review 2026-10-12): L2Swarm 3.8.14's L2Skill.Elapsed is NOT the live elapsed: set_ReuseDelay folds it into its start offset
// and sets it to 0, the cooldown tick zeroes it again at the end (only Progress counts up). So during a cooldown of my own cast Elapsed reads 0.
// The elapsed sent to the brain (skr / full row _el) is therefore measured from my own OnMagicSkillUse of that skill (AG.cdAt, this clock),
// else L2Swarm's Elapsed (0, or a value a SkillCoolTime packet froze earlier): never MORE than the real elapsed, so the brain never reads a
// skill ready too early (at worst it waits for the agent's ready edge).
function skEl(s, id) {
  let e = 0; try { e = num(s.Elapsed); } catch (er) { }
  const c = AG.cdAt[id], re = num(s.ReuseDelay), t = now();
  if (c && re > 0 && t - c < re) e = Math.max(e, t - c);
  return e;
}
// FAST EDGES (TIMING): what a cast / target / hit changes, sent the moment it changed (every tick that is no report); report() then finds
// AG.last already up to date and does not send it twice. A marker (null / -1 / 2) set by OnMagicSkillUse / OnTargetSelected forces a re-send.
const FAST_ME = ['IsCasting', 'HP', 'HpPercent', 'MP', 'MpPercent', 'CP'];
function fastEdges() {
  const msg = { t: 'st' }; let n = 0;
  const me = pick(Me, FAST_ME), d = diffObj(AG.last.me, me); if (d) { msg.me = d; n++; }
  let at = false; try { at = !!IsAttacking; } catch (e) { at = !!AG.last.fl.IsAttacking; }
  if (AG.last.fl.IsAttacking !== at) { AG.last.fl.IsAttacking = at; msg.fl = { IsAttacking: at }; n++; }
  let tg = AG.last.tgt; try { tg = Target ? num(Target.objId) : 0; } catch (e) { }
  if (tg !== AG.last.tgt) { msg.tgt = tg; AG.last.tgt = tg; n++; }
  if (n) { AG.fastSent++; agSend(msg); }
}
/** I am fighting (party HP + monsters every report instead of every 2nd) */
function fighting() { try { return !!IsAttacking || !!Me.IsInCombat || !!Me.IsCasting; } catch (e) { return false; } }
function snapArr(coll) {
  try { if (coll && typeof coll.snapshotJson === 'function') return JSON.parse(coll.snapshotJson()); } catch (e) { }
  try { if (coll && typeof coll.SnapshotJson === 'function') return JSON.parse(coll.SnapshotJson()); } catch (e) { }
  return null;
}
const KIND = { Char: 0, Npc: 1, Mob: 2, Summon: 3 };
// AGENTPERF: live reads per creature (IsStunned / IsSleeping / IsParalyzed / IsOutOfControl / TargetObjId, which the developer snapshot lacks)
// were done for EVERY monster AND player in the 3000 box (Giran: hundreds of players, 2-4 times a second). Now: the nearest CR_CAP.mobs
// monsters / summons, my party members, and players only near me (hunting: nearest 40 within 3000, for "someone else fights this monster";
// no monster near = a town: nearest 10 within 1000). The rest get 'none' (false / 0) like creatures outside the box always did (#5/#14).
const CR_CAP = { box: 3000, mobs: 60, plHunt: 40, plTown: 10, plTownR: 1000 };
function creatures() {
  let arr = snapArr(CreaturesList); AG.hr++;
  if (!arr) { arr = []; try { CreaturesList.forEach(o => { const r = pick(o, 'objId Id Name X Y Z HP MaxHP HpPercent MP MaxMP MpPercent Level IsDead Title IsInCombat ClassId IsSpoiled IsSitting'.split(' ')); AG.hr += 20; let t = 3; try { const s = String(o.crtType); t = KIND[s] !== undefined ? KIND[s] : num(o.crtType); } catch (e) { } r.crtType = t; arr.push(r); }); } catch (e) { } }
  // L2Swarm 3.8.10+ snapshotJson lacks a few fields swarm.js reads on monsters / players near me (DESIGN.md §2.2): read them from the live object
  const sup = arr.length && !('IsStunned' in arr[0]), supT = arr.length && !('TargetObjId' in arr[0]);
  const mx = num(Me.X), my = num(Me.Y);
  const out = {}, mobC = [], plC = [];
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i]; if (!c || c.objId === undefined) continue;
    const r = {}; for (const k in c) { if (CR_DROP[k]) continue; const v = c[k]; if (v === null || typeof v !== 'object') r[k] = v; }
    if (typeof r.crtType === 'string') r.crtType = KIND[r.crtType] !== undefined ? KIND[r.crtType] : 3;
    const id = num(c.objId);
    if ((sup || supT) && r.crtType !== 1) {
      if (sup) { r.IsStunned = false; r.IsSleeping = false; r.IsParalyzed = false; r.IsOutOfControl = false; } if (supT) r.TargetObjId = 0;   // 'none' unless read below
      const dx = Math.abs(num(r.X) - mx), dy = Math.abs(num(r.Y) - my);
      if (dx < CR_CAP.box && dy < CR_CAP.box) (r.crtType === 0 ? plC : mobC).push({ id, r, d: dx * dx + dy * dy });
    }
    out[id] = r;
  }
  if (sup || supT) {
    const live = (e, pl) => { try { const o = CreaturesList.GetItemByObjectID(e.id); AG.hr += 1 + (sup && !pl ? 4 : 0) + (supT ? 2 : 0); if (!o) return; const r = e.r; if (sup && !pl) {   /* players: TargetObjId only (swarm.js reads the CC flags on monsters / the boss only) */ r.IsStunned = !!o.IsStunned; r.IsSleeping = !!o.IsSleeping; r.IsParalyzed = !!o.IsParalyzed; r.IsOutOfControl = !!o.IsOutOfControl; /* v3 */ } if (supT) { const t = o.targetCrt; r.TargetObjId = t ? num(t.objId) : 0; } } catch (e) { } };
    const byD = (a, b) => a.d - b.d;
    if (mobC.length > CR_CAP.mobs) mobC.sort(byD);
    for (let i = 0; i < mobC.length && i < CR_CAP.mobs; i++) live(mobC[i]);
    const hunting = mobC.length > 0, lim = hunting ? CR_CAP.plHunt : CR_CAP.plTown, r2 = hunting ? CR_CAP.box * CR_CAP.box : CR_CAP.plTownR * CR_CAP.plTownR;
    const mates = [], others = [];
    plC.forEach(e => { if (AG.partyIds[e.id]) mates.push(e); else if (e.d <= r2) others.push(e); });
    mates.forEach(e => live(e, true));
    if (others.length > lim) others.sort(byD);
    for (let i = 0; i < others.length && i < lim; i++) live(others[i], true);
  }
  return out;
}
function section(name, build, msg, force) {
  let v; try { v = build(); } catch (e) { return; }
  if (!v) return;
  const s = JSON.stringify(v);
  if (!force && AG.last.sec[name] === s) return;
  AG.last.sec[name] = s; msg[name] = v;
}
/** the elapsed of a skill on cooldown (COOLDOWN CLOCK above), the live object read only for this one skill */
function skElId(id, row) {
  let e = 0; try { const o = SkillsList.GetItemByID(id); AG.hr += 2; if (o) e = num(o.Elapsed); } catch (er) { }
  const c = AG.cdAt[id], re = num(row.ReuseDelay), t = now();
  if (c && re > 0 && t - c < re) e = Math.max(e, t - c);
  return e;
}
const ME_FAST = 'X Y Z HP MaxHP HpPercent MP MaxMP MpPercent CP MaxCP IsDead IsCasting IsInCombat IsAttacking IsSitting IsMoving IsRunning Heading IsStunned IsSleeping IsParalyzed IsOutOfControl'.split(' ');
const ME_SLOW = ME_FIELDS.filter(f => ME_FAST.indexOf(f) < 0);   // Name, level, class, exp, stats, hennas, load, ...: once a second (every 4th report)
function partyRows() {
  let a = null; try { if (typeof PartyList.SnapshotJson === 'function') a = JSON.parse(PartyList.SnapshotJson()); } catch (e) { a = null; } AG.hr++;
  if (!a || !a.length || !a.every(p => p && p.objId !== undefined)) a = snapArr(PartyList);   /* 2026-10-12: SnapshotJson (what swarm.js reads in L2Swarm) carries objId; the healers' Recharge/heal targets had no id */
  let out;
  if (a && a.length && a.every(p => p && p.objId !== undefined && p.Name !== undefined)) out = a.map(p => { const r = {}; PARTY_FIELDS.forEach(f => { if (p[f] !== undefined) r[f] = p[f]; }); return r; });
  else { out = []; PartyList.forEach(p => { out.push(pick(p, PARTY_FIELDS)); AG.hr += PARTY_FIELDS.length; }); }
  const ids = {}; out.forEach(p => { const id = num(p.objId); if (id) ids[id] = 1; }); AG.partyIds = ids;
  return out;
}
// the report sections as jobs (AGENTPERF): run in this order, under the tick budget; what does not fit waits for the next tick (AG.pend)
const JOBS = {
  skr: (msg) => {                                     // every report (TIMING; was every 2nd): readiness changes only
    const skr = {}; let n = 0; const rows = fastList(LS.skills, SkillsList);
    if (rows) rows.forEach(s => { const id = num(s.Id), r = s.IsReady ? 1 : 0; if (r) delete AG.cdAt[id]; if (AG.last.skr[id] !== r) { AG.last.skr[id] = r; skr[id] = r ? [1] : [0, num(s.ReuseDelay), skElId(id, s)]; n++; } });
    else { try { SkillsList.forEach(s => { const id = num(s.Id), r = s.IsReady ? 1 : 0; AG.hr += 2; if (r) delete AG.cdAt[id]; if (AG.last.skr[id] !== r) { AG.last.skr[id] = r; skr[id] = r ? [1] : [0, num(s.ReuseDelay), skEl(s, id)]; n++; } }); } catch (e) { } }   // a cooldown: [0, ReuseDelay, Elapsed] once; the brain counts Elapsed on
    if (n) msg.skr = skr;
  },
  party: (msg, force) => section('party', partyRows, msg, force),
  buffs: (msg, force) => section('buffs', () => {
    const rows = fastList(LS.buffs, BuffsList);
    if (rows) return rows.map(x => { const r = Object.assign({}, x); r.RemainTime = Math.round(num(r.RemainTime) / 5) * 5; return r; });
    const b = []; BuffsList.forEach(x => { const r = pick(x, BUFF_FIELDS); AG.hr += BUFF_FIELDS.length; r.RemainTime = Math.round(num(r.RemainTime) / 5) * 5; b.push(r); }); return b;
  }, msg, force),
  cr: (msg, force) => {                               // creatures every 2nd report (500 ms); every report (250 ms) while I fight (TIMING: monster HP / TargetObjId)
    const cur = creatures(), prev = AG.last.cr, set = [], upd = [], del = [];
    for (const id in cur) { const p = prev[id]; if (!p) { set.push(cur[id]); continue; } const d = diffObj(p, cur[id]); if (d) upd.push([num(id), d]); }
    for (const id in prev) if (!cur[id]) del.push(num(id));
    if (force) msg.cr = { all: true, set: Object.keys(cur).map(k => cur[k]) };
    else if (set.length || upd.length || del.length) msg.cr = { set, upd, del };
    const keep = {}; for (const id in cur) keep[id] = prev[id] && !force ? prev[id] : Object.assign({}, cur[id]); AG.last.cr = keep;
  },
  meSlow: (msg) => { const me = pick(Me, ME_SLOW); AG.hr += ME_SLOW.length; const d = diffObj(AG.last.me, me); if (d) msg.me = Object.assign(msg.me || {}, d); },
  clan: (msg, force) => { try { const c = Me.Clan; AG.hr += 6; const cid = num(c && (c.Id || c.ClanId)); const cl = c ? { Id: cid, Name: plain(c.Name), Level: num(c.Level), ClanId: cid, AllyName: plain(c.AllyName) } : null; /* #12: swarm.js reads Me.Clan.Id */ const s = JSON.stringify(cl); if (force || s !== AG.last.clan) { AG.last.clan = s; (msg.me = msg.me || {}).Clan = cl; } } catch (e) { } },
  inv: (msg, force) => { AG.invDirty = false; const pi = AG.last.sec.inv; section('inv', invRows, msg, force); if (msg.inv) { if (AG.last.sec.inv !== pi) AG.invVer++; msg.iv = AG.invVer; } },   // a bag change goes out with the next report (250 ms)
  skills: (msg, force) => {                           // full objects only when the list (id/level) changed; readiness as the small skr diff
    let rows = fastList(LS.skills, SkillsList), live = false;
    if (!rows) { rows = []; live = true; try { SkillsList.forEach(s => { rows.push(s); AG.hr += 2; }); } catch (e) { } }
    let sig = ''; rows.forEach(s => { sig += num(s.Id) + ':' + num(s.Level) + ','; });
    if (!force && sig === AG.last.skillSig) return;
    AG.last.skillSig = sig;
    const a = rows.map(s => { const r = live ? pick(s, SKILL_FIELDS) : Object.assign({}, s); if (live) AG.hr += SKILL_FIELDS.length; if (!r.IsReady) { try { r._el = live ? skEl(s, num(s.Id)) : skElId(num(s.Id), r); } catch (e) { } } return r; });
    msg.skills = a; AG.last.skr = {}; a.forEach(s => { AG.last.skr[s.Id] = s.IsReady ? 1 : 0; });
  },
  drops: (msg, force) => section('drops', () => { const a = []; DropList.forEach(x => { a.push(pick(x, DROP_FIELDS)); AG.hr += DROP_FIELDS.length; }); return a; }, msg, force),
  buy: (msg, force) => section('buy', () => { try { return buyRows(); } catch (e) { return null; } }, msg, force),   // SHOPLIST: the merchant's real buy list (mirror.buy)
  pets: (msg, force) => section('pets', () => { const a = []; PetList.forEach(x => { const r = pick(x, PET_FIELDS); AG.hr += PET_FIELDS.length; try { if (x.Skills) { r.Skills = []; x.Skills.forEach(s => r.Skills.push(pick(s, 'Id Level Name IsReady'.split(' ')))); } } catch (e) { } try { if (x.Buffs) { r.Buffs = []; x.Buffs.forEach(b => { const q = pick(b, BUFF_FIELDS); q.RemainTime = Math.round(num(q.RemainTime) / 5) * 5; r.Buffs.push(q); }); } } catch (e) { } a.push(r); }); return a; }, msg, force),
  opt: (msg, force) => { const od = {}; let on = 0; for (const k in AG.watch.opt) { let v; try { v = optValue(Options[k]); } catch (e) { v = null; } AG.hr++; const sv = JSON.stringify(v); if (force || AG.last.opt[k] !== sv) { od[k] = v; AG.last.opt[k] = sv; on++; } } if (on) msg.opt = od; },
  q: (msg, force) => { const qd = {}; let qn = 0; for (const k in AG.watch.quest) { let v = null; try { v = ser(GetQuestState(num(k)), 1); } catch (e) { } AG.hr++; const s = JSON.stringify(v); if (force || AG.last.q[k] !== s) { AG.last.q[k] = s; qd[k] = v; qn++; } } if (qn) msg.q = qd; },
  html: (msg, force) => { let html = ''; try { html = String(LastHTML || ''); } catch (e) { } AG.hr++; if (force || html !== AG.last.html) { AG.last.html = html; msg.html = html; } },
};
const JOB_ORDER = ['skr', 'party', 'buffs', 'cr', 'meSlow', 'clan', 'inv', 'skills', 'drops', 'buy', 'pets', 'opt', 'q', 'html'];
function queueJob(k, force) { for (let i = 0; i < AG.pend.length; i++) if (AG.pend[i].k === k) { if (force) AG.pend[i].force = true; return; } AG.pend.push({ k, force: !!force }); }
/** run the waiting jobs into msg until this tick's budget is spent (at least one job per tick, so a slow host still makes progress), send */
function runPend(msg) {
  let ran = 0;
  while (AG.pend.length) {
    if (ran && Date.now() - AG.tk0 > AG.budgetMs) { AG.deferred++; break; }
    const j = AG.pend.shift(), t0 = Date.now(); AGCUR.w = 'job ' + j.k;
    try { JOBS[j.k](msg, j.force); } catch (e) { AG.errors++; }
    const ms = Date.now() - t0; if (ms >= 3) AG.tp[j.k] = (AG.tp[j.k] || 0) + ms; ran++;
  }
  if (Object.keys(msg).length > 2 || msg.full) agSend(msg);
}
function report() {
  AG.rep++; const full = AG.full; let msg = { t: 'st', seq: AG.rep };
  const t0 = Date.now(); AGCUR.w = 'report me';
  // Me + flags + target FIRST (AGENTPERF): on a full report they leave at once in their own message, so the brain is ready
  // (IsCharacterReady: me.objId / Name / ClassId + fl.IsConnected) whatever the heavy sections cost
  if (full) { const me = pick(Me, ME_FIELDS); AG.hr += ME_FIELDS.length; AG.last.me = Object.assign({}, me); msg.me = me; msg.full = true; }
  else { const me = pick(Me, ME_FAST); AG.hr += ME_FAST.length; const d = diffObj(AG.last.me, me); if (d) msg.me = d; }
  const fl = { IsConnected: !!IsConnected, IsInCombat: !!IsInCombat, IsEnabled: !!IsEnabled, IsAttacking: !!IsAttacking, IsSitting: !!IsSitting, IsPartyLeader: !!IsPartyLeader,
    IsInParty: !!IsInParty, IsFollowModeOn: !!IsFollowModeOn, IsFollowMaster: !!IsFollowMaster, CurrentZone: plain(CurrentZone) }; AG.hr += 10;
  if (full) { AG.last.fl = Object.assign({}, fl); msg.fl = fl; } else { const d = diffObj(AG.last.fl, fl); if (d) msg.fl = d; }
  let tg = 0; try { tg = Target ? num(Target.objId) : 0; } catch (e) { } AG.hr += 2;
  if (full || tg !== AG.last.tgt) { msg.tgt = tg; AG.last.tgt = tg; }
  if (full) { AG.myId = num(msg.me && msg.me.objId); { const nx = num(msg.me && msg.me.X), ny = num(msg.me && msg.me.Y), p = AG.movePt; if (p && Math.abs(nx - p.x) + Math.abs(ny - p.y) > 40) wake('moving'); AG.movePt = { x: nx, y: ny }; }   /* a move seen by a full report counts too */ JOBS.clan(msg, true); AG.full = false; AG.lastFull = now(); agSend(msg); msg = { t: 'st', seq: AG.rep }; recalibrate(); }
  { const ms = Date.now() - t0; if (ms >= 3) AG.tp.me = ms; }
  const fight = fighting(); AG.hr += 3; const r = AG.rep;
  if (msg.me && msg.me.objId !== undefined) AG.myId = num(msg.me.objId);
  if (fight) wake('fight'); else if (!full && msg.me && (msg.me.X !== undefined || msg.me.Y !== undefined)) { const mx = num(AG.last.me.X), my = num(AG.last.me.Y), p = AG.movePt || (AG.movePt = { x: mx, y: my }); if (Math.abs(mx - p.x) + Math.abs(my - p.y) > 40) { AG.movePt = { x: mx, y: my }; wake('moving'); } }   // TICKMODE: fighting / moving (> 40 units: no wake on position jitter) = fast ticks
  const due = {
    skr: !full, party: full || r % 2 === 1 || fight, buffs: full || r % 2 === 1 || fight, cr: full || r % 2 === 0 || fight,
    meSlow: !full && r % 4 === 0, clan: !full && r % 24 === 0, inv: full || r % 4 === 0 || AG.invDirty,
  };
  JOB_ORDER.forEach(k => { if (due[k] !== undefined ? due[k] : (full || r % 4 === 0)) queueJob(k, full); });
  runPend(msg);
}

// ---------------------------------------------------------------- events -> brain
function ev(h, a) { if (AG.st) agSend({ t: 'ev', h, a }); }
function OnLogin() { ev('OnLogin', []); AG.full = true; }
function OnLogout() { ev('OnLogout', []); }
function OnSay(charName, text, messageType) { /* WAKE2: chat never wakes (bots post party status lines; an order typed in chat reaches the brain at once as this event, and the brain's order then wakes) */ ev('OnSay', [String(charName), String(text), num(messageType)]); }
function OnSystemMessage(msgId, params) { ev('OnSystemMessage', [num(msgId), ser(params, 0)]); }
function OnAnnouncement(text) { ev('OnAnnouncement', [String(text)]); }
function OnDie(objId) { if (num(objId) === AG.myId) wake('ev:die'); ev('OnDie', [num(objId)]); }
function OnRevive(objId) { if (num(objId) === AG.myId) wake('ev:revive'); ev('OnRevive', [num(objId)]); }
function OnAttack(atkId, targetId, isAOE) { if (num(atkId) === AG.myId) wake('ev:attackMine'); else if (num(targetId) === AG.myId) wake('ev:attackedMe'); ev('OnAttack', [num(atkId), num(targetId), !!isAOE]); }
// my own cast / target: the brain assumed something at this event (caps 'assume') -> re-send the real value next tick / report (markers)
function OnMagicSkillUse(objId, targetId, skillId) {
  if (num(objId) === AG.myId) wake('ev:myCast'); else if (num(targetId) === AG.myId && !AG.partyIds[num(objId)]) wake('ev:castOnMe');   // a teammate's buff / heal on me does not wake (WAKE2)
  ev('OnMagicSkillUse', [num(objId), num(targetId), num(skillId)]);
  try { if (num(objId) === num(Me.objId)) { AG.last.me.IsCasting = null; const id = num(skillId); AG.cdAt[id] = now(); AG.last.skr[id] = 2; } } catch (e) { }   // cdAt: skEl (cooldown start of my own cast)
}
function OnTargetSelected(objId, targetObjId) { if (num(objId) === AG.myId && num(targetObjId) && num(targetObjId) !== AG.last.tgt && !AG.partyIds[num(targetObjId)]) wake('ev:myTarget');   /* WAKE2: a re-select / cancel / teammate target does not */ ev('OnTargetSelected', [num(objId), num(targetObjId)]); try { if (num(objId) === num(Me.objId)) AG.last.tgt = -1; } catch (e) { } }
function OnTeleportToLocation(objId, X, Y, Z) { if (num(objId) === num(Me.objId)) { AG.full = true; wake('ev:teleport'); } ev('OnTeleportToLocation', [num(objId), num(X), num(Y), num(Z)]); }
function OnNpcHtmlMessage(html) { wake('ev:html'); ev('OnNpcHtmlMessage', [String(html)]); }
function OnNpcQuestHtmlMessage(html) { wake('ev:questHtml'); ev('OnNpcQuestHtmlMessage', [String(html)]); }
function OnCommunityBoardHtmlMessage(html) { wake('ev:board'); ev('OnCommunityBoardHtmlMessage', [String(html)]); }
function OnNpcDialogLink(link) { ev('OnNpcDialogLink', [String(link)]); }
// SHOPLIST (2026-10-13): L2Swarm's OnShopList list is the SELL part of "Buy/Sell/Refund" (my own items, sell prices); the merchant's BUY list
// is the BuyList global. The brain mirrored BuyList from OnShopList -> every gear buy said "not in Radia's list any more" (since 2026-10-12).
// The real BuyList goes along as the 3rd argument (host.js prefers it) and in the 1 s report (section 'buy').
function OnShopList(shopId, list) { wake('ev:shop'); let b = []; try { b = buyRows(); } catch (e) { b = []; } ev('OnShopList', [num(shopId), items(list), b]); }
function OnTrade(traderObjId, list) { wake('ev:trade'); ev('OnTrade', [num(traderObjId), items(list)]); }
function OnWindowOpenTrade(w) { wake('ev:tradeWindow'); ev('OnWindowOpenTrade', [null]); }
function OnWareHouseDepositList(list) { ev('OnWareHouseDepositList', [items(list)]); }
function OnWareHouseWithdrawalList(list) { ev('OnWareHouseWithdrawalList', [items(list)]); }
function OnAskJoinPledge(requestorObjId, pledgeName) { ev('OnAskJoinPledge', [num(requestorObjId), String(pledgeName || '')]); }
function OnMapClick(x, y) { ev('OnMapClick', [num(x), num(y)]); }
function OnInventoryUpdate() { AG.invDirty = true; }
function OnInventoryItemUpdate() { AG.invDirty = true; }
function OnIncomingPacket(p) {
  if (!AG.watch.packets || !AG.st) return;
  try { let h = ''; const n = num(p.length || p.Length); for (let i = 0; i < n; i++) { const b = num(p[i]) & 255; h += (b < 16 ? '0' : '') + b.toString(16); } ev('OnIncomingPacket', [h]); } catch (e) { }
}

// ---------------------------------------------------------------- safety net (brain gone)
/** the brain pinged on this connection and then went quiet for silentMs: it is stuck (engine audit #25) */
function brainSilent() {
  const s = !!(AG.sock && AG.pinged && now() - AG.lastRx > AG.silentMs);
  if (s && !AG.silentSince) { AG.silentSince = now(); AG.silentEpisodes++; }
  else if (!s && AG.silentSince) { const ms = now() - AG.silentSince; AG.silentSince = 0; if (AG.sock) agSend({ t: 'log', text: 'brain was silent for ' + ms + ' ms: potion reflex was on' }); }
  return s;
}
function reflex() {
  if (AG.sock ? !brainSilent() : now() - AG.lostAt < 5000) return;
  try {
    if (!IsCharacterReady() || Me.IsDead) return;
    const t = now();
    if (num(Me.HpPercent) < AG.reflex.hpPot && t - AG.reflex.lastHp > AG.reflex.gapMs) { const id = [1539, 1061, 1060].find(i => num(ItemCount(i)) > 0); if (id) { UseItem(id); AG.reflex.lastHp = t; } }
    if (num(Me.MpPercent) < AG.reflex.mpPot && t - AG.reflex.lastMp > AG.reflex.gapMs && num(ItemCount(728)) > 0) { UseItem(728); AG.reflex.lastMp = t; }
  } catch (e) { }
}

// ADAPT-2026-10-13 (user: 'everything must run asynchronously, several things talking at once'; the PC ran at 93 % CPU, L2Swarm 7.3 cores, and
// the agent ticks took 3-30 s: 58 agents x 16 ticks/s all reading host objects): (1) a tick that took X ms waits up to 2X (max 2 s) before the
// next one, so the agents never queue on a saturated L2Swarm; (2) the report cadence follows what the character does: fighting every 250 ms
// (as before), moving every 500 ms, standing still every 750 ms. Fast combat edges (HP/MP/cast/target) still go out on every tick that runs.
AG.nextTick = 0; AG.lastRepAt = 0; AG.lastPos = '';
// in TICKS (tickMs 62): fighting 4 (250 ms), moving 8 (500 ms), standing still 12 (750 ms) — ticks, not wall time (the engine tests run the ticks back to back)
function repGapTicks() {
  if (AG.full) return 0;
  try { if (fighting()) return AG.repEvery; const p = Math.round(num(Me.X) / 50) + ',' + Math.round(num(Me.Y) / 50); const moving = p !== AG.lastPos; AG.lastPos = p; return moving ? AG.repEvery * 2 : AG.repEvery * 3; } catch (e) { return AG.repEvery * 2; }
}
// AGENTPERF: one line per agent every 5 min (Logs/agent_perf.log + the brain log): ticks, average / max tick ms, host reads per second,
// jobs deferred to a later tick, jobs still waiting. Evidence for the next "the agents are slow" question.
AG.ps = { at: Date.now(), ticks: 0, ms: 0, max: 0, hr: 0, def: 0 };
function modeSecs() { const m = Object.assign({}, AG.modeMs); m[AG.mode] = (m[AG.mode] || 0) + (now() - AG.modeAt); AG.modeMs = { fast: 0, calm: 0, sleep: 0 }; AG.modeAt = now(); return 'f' + Math.round(m.fast / 1000) + '/c' + Math.round(m.calm / 1000) + '/s' + Math.round(m.sleep / 1000); }
function wakeSum() { const w = AG.wk; AG.wk = {}; return Object.keys(w).sort((a, b) => w[b] - w[a]).slice(0, 12).map(k => k.replace(/[ ,]/g, '_') + 'x' + w[k]).join(',') || '-'; }
function perfLine() {
  const P = AG.ps, t = Date.now(), sec = Math.max(1, (t - P.at) / 1000);
  if (sec < 300) return;
  let nm = ''; try { nm = String(Me.Name || ''); } catch (e) { }
  const line = new Date(t).toISOString() + ' [' + nm + '] perf ticks=' + P.ticks + ' avgMs=' + (P.ticks ? Math.round(P.ms / P.ticks) : 0) + ' maxMs=' + P.max +
    ' hostReads/s=' + Math.round((AG.hr - P.hr) / sec) + ' deferred=' + (AG.deferred - P.def) + ' pend=' + AG.pend.length + ' sent=' + AG.sent + ' mode=' + AG.mode + ' modeSec=' + modeSecs() + ' rearms=' + AG.rearms + ' wakes=' + wakeSum();
  AG.ps = { at: t, ticks: 0, ms: 0, max: 0, hr: AG.hr, def: AG.deferred };
  try { File.AppendAllText(__DIR__ + String.fromCharCode(92) + 'Logs' + String.fromCharCode(92) + 'agent_perf.log', line + String.fromCharCode(13, 10)); } catch (e) { }
  try { if (AG.st) agSend({ t: 'log', text: line.slice(line.indexOf('perf')) }); } catch (e) { }
}
// TICKMODE-2026-10-13 (coordinator, after AGENTPERF went live at 17:46: interrupts 0, host reads ~100/s, but L2Swarm still 6.5-7.4 cores:
// 59 agents x ~6 ticks/s x ~40 ms; the TICK RATE was the cost). The interval adapts to what the character does:
//   fast   62 ms, a report every 4th tick (250 ms)  while fighting / casting / moving, within 10 s of a brain order, of an event that concerns me
//          (attacked, targeted, my cast, teleport, death), of a dialog / shop / trade / board page / chat line, and while report jobs wait
//   calm  250 ms, a report every 2nd tick (500 ms)  10-60 s after the last of those (standing in town / at a spot, the brain quiet)
//   sleep 1000 ms, a report every tick (1 s)         after 60 s (logged in, the party stopped)
// Any brain order (read on the next tick: <= 250 ms calm, <= 1 s asleep) or such an event switches to fast AT ONCE (events re-arm the
// interval from their handler). Creatures go every 2nd report, party / buffs every 2nd, the rest every 4th, as before (so asleep: creatures 2 s,
// the bag 4 s unless it changed: OnInventoryUpdate queues it for the next tick). Fast edges (HP/MP/cast/target) still go out on every tick.
const TMODE = { fast: { ms: 62, rep: 4 }, calm: { ms: 250, rep: 2 }, sleep: { ms: 1000, rep: 1 } };
AG.wk = {}; AG.mode = 'fast'; AG.sinceRep = 0; AG.actAt = Date.now(); AG.myId = 0; AG.timerId = null; AG.rearms = 0; AG.modeMs = { fast: 0, calm: 0, sleep: 0 }; AG.modeAt = Date.now();
function rearm(mode) {
  const t = now(); AG.modeMs[AG.mode] = (AG.modeMs[AG.mode] || 0) + (t - AG.modeAt); AG.modeAt = t;
  AG.mode = mode; AG.rearms++;
  try { if (AG.timerId !== null) clearInterval(AG.timerId); } catch (e) { }
  AG.timerId = setInterval(agTick, TMODE[mode].ms);
}
/** activity: back to fast ticks now (no-op when already fast) */
function wakeNote(r) { const k = String(r || '?').slice(0, 40); AG.wk[k] = (AG.wk[k] || 0) + 1; }
function wake(r) { wakeNote(r); AG.actAt = now(); if (AG.mode !== 'fast') { AG.sinceRep = TMODE.fast.rep - 1; rearm('fast'); } }   // the next tick reports
// WAKE2-2026-10-13 (live 18:01-18:06: all 59 agents stayed fast with every party stopped): only orders that DO something in the game wake the
// agent. Setters, reads, keepers that re-assert a state (Options writes, StopCombat / DisableBot, Select, target cancel, stand, combat-zone
// setters, FindPath, InvSync, App events, watches) are executed as before but keep the current mode. Logs/agent_perf.log 'wakes=' counts both
// (noWake:<name> = an order that did not wake).
const WAKE_FN = { GoToPoint: 1, MoveToPoint: 1, MoveToNpc: 1, GoToNpc: 1, Attack: 1, StartCombat: 1, UseItem: 1, ClickLink: 1, BuyItem: 1, Login: 1 };
const WAKE_SEND = /^Send\.(MoveBackwardToLocation|MoveToLocation|Attack|AttackRequest|Action|RequestAction|RequestMagicSkillUse|UseItem|RequestUseItem|ReqBypassToServer|RequestBypassToServer|RequestLinkHtml|RequestTutorialLinkHtml|RequestBuyItem|RequestSellItem|RequestPreviewItem|TradeRequest|AddTradeItem|TradeDone|AnswerTradeRequest|RequestJoinParty|RequestAnswerJoinParty|RequestActionUse|RequestPetUseItem|RequestRestartPoint|RequestPrivateStore.*|SendItemList|RequestEnchantItem|RequestDestroyItem|RequestDropItem|RequestCrystallizeItem|RequestPackageSend|RequestWithdrawalPackage|SendWareHouseDepositList|SendWareHouseWithDrawList|RequestGetItem|RequestItemList|NewCharacter|CharacterCreate|CharacterSelect)$/;
function orderName(m) { return m ? (m.a === 'call' ? String(m.fn || '') : m.a === 'set' ? 'set ' + String(m.path || '').replace(/^Options\./, '') : String(m.a || '')) : '?'; }
function orderWake(m) {
  if (!m || m.a !== 'call') return null;               // set / watch / bridge / appemit / resync / bye: never
  const fn = String(m.fn || '');
  if (WAKE_FN[fn]) return 'order:' + fn;
  if (fn === 'RunCommand') { const c = String((m.args || [])[0] || '').trim().toLowerCase(); return /^\/(stand|sit|stopcombat|disablebot|enablebot|config|time|loc|partyinfo|instancezone)\b/.test(c) ? null : 'order:RunCommand ' + c.split(' ')[0]; }
  if (fn === 'Send.SendHex') { const h = String((m.args || [])[0] || '').replace(/\s/g, '').toUpperCase(); return h === '3A' || h === '' ? null : 'order:SendHex ' + h.slice(0, 2); }   // 3A = Appearing (keeper)
  if (WAKE_SEND.test(fn)) return 'order:' + fn;
  return null;
}
function tickMode() {
  const idle = now() - AG.actAt;
  const want = (AG.full || AG.pend.length || AG.invDirty || idle < 10000) ? 'fast' : idle < 60000 ? 'calm' : 'sleep';
  if (want !== AG.mode) rearm(want);
}
function agTick() {
  if (now() < AG.nextTick) { if (AG.sock) { try { agRead(); } catch (e) { AG.errors++; } } return; }   // ADAPT: back off after a slow tick; AGENTPERF: orders are still picked up (socket only, no state reads)
  const tk0 = Date.now(); AGCUR.w = 'tick'; AGCUR.at = tk0; AG.tk0 = tk0; AG.tp = {}; AG.hrTick = AG.hr;   // SLOWTRACE
  try {
    AG.tick++;
    if (!IsCharacterReady()) return;
    if (!AG.sock) { agConnect(); reflex(); return; }
    agRead();
    if (AG.sock && AG.pinged) reflex();               // a silent (stuck) brain: potions meanwhile (brainSilent decides)
    if (++AG.sinceRep >= TMODE[AG.mode].rep || AG.full) {   // a report every 4th tick fast (250 ms), every 2nd calm (500 ms), every tick asleep (1 s)
      AG.sinceRep = 0; if (now() - AG.lastFull > 60000) AG.full = true; report(); }
    else if (AG.sock) { fastEdges(); if (AG.invDirty) queueJob('inv', false); if (AG.pend.length) runPend({ t: 'st', seq: AG.rep }); }   // TIMING: the other ticks send what a cast / target / hit changed at once; #15: a bag change too; AGENTPERF: jobs a slow tick left over
    const el = Date.now() - tk0; AG.ps.ticks++; AG.ps.ms += el; if (el > AG.ps.max) AG.ps.max = el;
    agSlow('tick (read/report/edges)', tk0, '');
    if (el > AG.tickMs) AG.nextTick = now() + Math.min(2000, el * 2);   // el = real JS time spent, the wait on the agent clock   // ADAPT
    perfLine();
    tickMode();
  } catch (e) { AG.errors++; agSlow('tick (read/report/edges)', tk0, e && e.message || e); if (now() - (AG.errLogAt || 0) > 60000) { AG.errLogAt = now(); try { agSend({ t: 'log', text: 'tick error: ' + String(e && e.message || e).slice(0, 200) }); } catch (e2) { } } }   // TICKMODE: a quick error was silent before (only slow ones were logged)
}
rearm('fast');
