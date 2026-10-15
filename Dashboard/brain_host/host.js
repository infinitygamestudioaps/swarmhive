// BRAIN HOST — the L2Swarm script host emulated for ONE character (2026-10-12, new engine phase 1; docs/plan/new_engine/DESIGN.md §3).
// createHost() builds the global object of a vm context in which the UNCHANGED swarm.js runs:
//   READS   (Me, Target, *List, Options, Is*, CurrentZone, LastHTML, ItemCount, BuffLow, Distance, Select's result, ...) come from the
//           character's Mirror (Scripts/agent2.js streams it), never from a round trip: swarm.js reads are synchronous.
//   ACTIONS (Send.*, UseItem, StartCombat, EnableBot, GoToPoint, MoveToPoint, Select, ClickLink, RunCommand, SayToParty, Options.X = v, ...)
//           become orders on the agent link; a promise / callback API resolves when the agent answers.
//   EVENTS  (OnSay, OnDie, ..., AppEvents.on) are dispatched by the runner when the agent forwards them.
//   App.*   = the in-brain AppBus;  File.* = vfs (shared read cache, optional overlay);  timers = Clock (real or virtual).
// Everything the shim does not know is recorded in host.missing (name -> count) instead of throwing, so one run lists the gaps.
'use strict';
const { makeViews, makeColl, skillReady, skillPublic } = require('./entities');

// ------------------------------------------------------------------ documented Send methods (docs/js-api/host-methods.txt, 3.8.5) + 3.8.6+ extras
const SEND_DOC = new Set(('Action AddTradeItem AnswerTradeRequest Appearing Attack AuthGameGuard BroadcastBotMessage BroadcastHex BroadcastPacket BroadcastRaw CharSelected ' +
  'CharacterCreate DlgAnswer EndScenePlayer EnterWorld Logout MoveBackwardToLocation MultiSellChoose NetPing NewCharacter ProtocolVersion ReqBypassBuildCmd ReqBypassToServer ' +
  'ReqCrystallizeItem ReqExCancelEnchantItem ReqExEnchantItemAttribute ReqExEnchantSkillInfoDetail ReqExEnchantSkillSafe ReqExRemoveItemAttribute ReqExTryToPutEnchantSupportItem ' +
  'ReqExTryToPutEnchantTargetItem RequestActionUse RequestAnswerJoinParty RequestAnswerJoinPledge RequestAutoSoulShot RequestBuyItem RequestBuySeed RequestBuySellUIClose ' +
  'RequestChangePartyLeader RequestChangePetName RequestDeleteMacro RequestDeleteReceivedPost RequestDestroyItem RequestDispel RequestDropItem RequestEnchantItem ' +
  'RequestExAcceptJoinMPCC RequestExAskJoinMPCC RequestExEnchantSkill RequestExEnchantSkillRouteChange RequestExEnchantSkillUntrain RequestExRqItemLink RequestGetItemFromPet ' +
  'RequestGiveItemToPet RequestGiveNickName RequestGotoLobby RequestItemList RequestJoinParty RequestJoinPledge RequestKeyMapping RequestLink RequestLinkHtml ' +
  'RequestMagicSkillUse RequestMagicSkillUseGround RequestMagicSkillUseGroud RequestMakeMacro RequestManorList RequestOustPartyMember RequestPetGetItem RequestPetUseItem ' +
  'RequestPostAttachment RequestPostItemList RequestPrivateStoreBuy RequestPrivateStoreQuitBuy RequestPrivateStoreQuitSell RequestPrivateStoreSell RequestQuestAbort ' +
  'RequestQuestList RequestQuickSendPost RequestReceivedPost RequestReceivedPostList RequestRecipeBookDestroy RequestRecipeBookOpen RequestRecipeItemMakeInfo ' +
  'RequestRecipeItemMakeSelf RequestRefine RequestRefineCancel RequestRestartPoint RequestSellItem RequestSendPost RequestSetPrivateStoreListBuy RequestSetPrivateStoreListSell ' +
  'RequestSetPrivateStoreMsgBuy RequestSetPrivateStoreMsgSell RequestSkillList RequestTargetCancel RequestTutorialClientEvent RequestTutorialLinkHtml ' +
  'RequestTutorialPassCmdToServer RequestTutorialQuestionMark RequestUserCommand RequestVoteNew RequestWithDrawalParty RequestWithDrawalPledge Say2 SendBypassBuildCmd SendHex ' +
  'SendPacket SendRaw StopMove TradeDone TradeRequest UseItem ValidatePosition WareHouseDepositList WareHouseWithDrawList RequestAnswerJoinPledge').split(' '));

// enum look-alikes (numbers; == works against what agent2 reports)
const ENUMS = {
  L2CreatureTypes: { Char: 0, Npc: 1, Mob: 2, Summon: 3, Pet: 4, Unknown: 5 },
  CombatZoneTypes: { CombatRadius: 0, Map: 1, Polygon: 2, Path: 3 },   // L2Swarm.Enums.CombatZoneTypes (3.8.14 Core dll, reflected 2026-10-12): no Off / Square
  ZonePointTypes: { Char: 0, Point: 1 },
  L2ZoneTypes: { UNKNOWN: 0, ALTEREDZONE: 8, SIEGEWARZONE1: 10, SIEGEWARZONE2: 11, PEACEZONE: 12, SEVENSIGNSZONE: 13, PVPZONE: 14, GENERALZONE: 15 },
  L2ClassTypes: { UNKNOWN: 0, MAGE: 1, FIGHTER: 2, SUPPORT: 3, TANK: 4, DAGGER: 5, ARCHER: 6 },
  L2GradeTypes: { None: 0, D: 1, C: 2, B: 3, A: 4, S: 5, S80: 6, S84: 7, R: 8, R95: 9, R99: 10 },
  L2ItemTypes: { Weapon: 0, Armor: 1, AttStone: 2, AttCrystal: 3, EnchantScrollWeapon: 4, EnchantScrollArmor: 5, LifeStone: 6, GemStone: 7, Etc: 8, Mats: 9, Shot: 10 },
  L2ElementTypes: { None: -2, Fire: 0, Water: 1, Wind: 2, Earth: 3, Holy: 4, Unholy: 5 },
  L2WaitTypes: { None: -1, SITTING: 0, STANDING: 1, START_FAKE_DEATH: 2, STOP_FAKE_DEATH: 3, WALKING: 4, RUNNING: 5, RIDING: 6 },
  L2MoveTypes: { None: -1, Walk: 0, Run: 1 },
  L2BodyPartTypes: { NONE: 0, UNDERWEAR: 1, R_EAR: 2, L_EAR: 3, NECK: 4, R_FINGER: 5, L_FINGER: 6, HEAD: 7, R_HAND: 8, L_HAND: 9, GLOVES: 10, CHEST: 11, LEGS: 12, FEET: 13, BACK: 14, LR_HAND: 15, FULL_ARMOR: 16, HAIR: 17, HAIR2: 18, R_BRACELET: 19, L_BRACELET: 20 },
  L2ShotsTypes: { SSNG: 0, SSD: 1, SSC: 2, SSB: 3, SSA: 4, SSS: 5, BSSNG: 6, BSSD: 7, BSSC: 8, BSSB: 9, BSSA: 10, BSSS: 11 },
  L2BeastShotsTypes: { SS: 0, SPS: 1, BSPS: 2 },
  L2PrivateStoreTypes: { NONE: 0, SELL: 1, SELL_MANAGE: 2, BUY: 3, BUY_MANAGE: 4, MANUFACTURE: 5, PACKAGE_SELL: 8 },
  MessageBoxButton: { OK: 0, OKCancel: 1, YesNoCancel: 3, YesNo: 4 }, MessageBoxImage: { None: 0, Error: 16, Question: 32, Warning: 48, Information: 64 },
  MessageBoxResult: { None: 0, OK: 1, Cancel: 2, Yes: 6, No: 7 },
};
const ZONE_NAMES = Object.fromEntries(Object.entries(ENUMS.L2ZoneTypes).map(([k, v]) => [v, k]));

// host types
class Point3D {
  constructor(x, y, z) { this.X = Math.round(Number(x) || 0); this.Y = Math.round(Number(y) || 0); this.Z = Math.round(Number(z) || 0); }
  get x() { return this.X; } get y() { return this.Y; } get z() { return this.Z; }
  Clone() { return new Point3D(this.X, this.Y, this.Z); } IsZero() { return !this.X && !this.Y && !this.Z; }
  ToPoint2D() { return new Point(this.X, this.Y); } Equals(o) { return !!o && o.X === this.X && o.Y === this.Y && o.Z === this.Z; }
  FromPoint3D(o) { this.X = o.X; this.Y = o.Y; this.Z = o.Z; } ToString() { return `${this.X}, ${this.Y}, ${this.Z}`; } toString() { return this.ToString(); }
  RemoveDistance(end, range) { const dx = end.X - this.X, dy = end.Y - this.Y, d = Math.hypot(dx, dy) || 1, k = Math.max(0, d - Number(range)) / d; return new Point3D(this.X + dx * k, this.Y + dy * k, end.Z); }
}
class Point {
  constructor(x, y) { this.X = Number(x) || 0; this.Y = Number(y) || 0; }
  get x() { return this.X; } get y() { return this.Y; }
  ToString() { return `${this.X},${this.Y}`; } toString() { return this.ToString(); } Offset(dx, dy) { this.X += dx; this.Y += dy; }
  Equals(o) { return !!o && o.X === this.X && o.Y === this.Y; }
}

/**
 * @param {object} o
 *   name, accountId, link ({ connected, call(fn, args, want) -> Promise|undefined, set(path, v), watch(kind, key) }),
 *   clock (Clock), timers (clock.forOwner), Date (class), vfs ({ File }), bus (AppBus), root ('C:\\L2Swarm'), version,
 *   log(line), onError(where, err), bigint (default true), allowProcess (false: Process.Start is refused)
 */
function createHost(o) {
  const H = { name: o.name, missing: new Map(), calls: new Map(), errors: 0, consoleLines: [], disposed: false, appEvents: new Map(), cbSeq: 0 };
  const mirror = o.mirror;
  const link = o.link;
  const T = o.timers;
  const miss = (k) => { H.missing.set(k, (H.missing.get(k) || 0) + 1); };
  const count = (k) => { H.calls.set(k, (H.calls.get(k) || 0) + 1); };
  const V = makeViews({ bigint: o.bigint !== false, missing: miss, me: () => mirror.me, point3d: (x, y, z) => new Point3D(x, y, z), resolve: (id) => findAny(id), now: () => o.clock ? o.clock.now() : Date.now() });
  const realm = { Promise: Promise, JSON: JSON };      // replaced by the context's own after contextify (runner sets H.realm)

  // ---------------------------------------------------------------- marshalling (brain -> agent)
  function marshal(v, depth) {
    if (depth > 6) return null;
    if (v === null || v === undefined) return v === undefined ? null : v;
    const t = typeof v;
    if (t === 'bigint') return Number(v);
    if (t === 'number' || t === 'string' || t === 'boolean') return v;
    if (t === 'function') { const id = ++H.cbSeq; return { $fn: id, _f: v }; }
    const inf = V.info(v);
    if (inf) return { $ent: inf.kind, objId: Number(inf.d.objId) || 0, id: Number(inf.d.Id) || 0 };
    if (v === meView) return { $ent: 'me' };
    if (v instanceof Point3D) return { $p3: [v.X, v.Y, v.Z] };
    if (v instanceof Point) return { $p2: [v.X, v.Y] };
    if (Array.isArray(v)) return v.map(x => marshal(x, depth + 1));
    if (t === 'object') { const r = {}; for (const k of Object.keys(v)) r[k] = marshal(v[k], depth + 1); return r; }
    return null;
  }
  /** forward a host call; want=true -> Promise of the agent's result */
  function fwd(fn, args, want, ack) {
    count(fn);
    const raw = Array.from(args || []); while (raw.length && raw[raw.length - 1] === undefined) raw.pop();   // f(x, undefined) = f(x) in L2Swarm (optional parameters); JSON would make it null
    // 2026-10-12 diagnostics: Send.Action / Send.Attack without an object id -> who called it (one line per call site per 10 min)
    if (/^Send\.(Action|Attack)$/.test(fn) && !raw.length) { try { const st = String(new Error().stack).split('\n').slice(2, 6).map(l => l.trim()).join(' < '); fwd.seen = fwd.seen || {}; if (!fwd.seen[st] || Date.now() - fwd.seen[st] > 60000) { fwd.seen[st] = Date.now(); require('fs').appendFileSync(require('path').join(__dirname, '..', '..', 'Logs', 'brain_noid.log'), new Date().toISOString() + ' ' + fn + ' without id: ' + st + '\n'); } } catch (e) { } return want ? Promise.resolve(null) : undefined; }
    const a = raw.map(x => marshal(x, 0));
    const fns = {}; const strip = (x) => { if (x && typeof x === 'object') { if (x.$fn) { fns[x.$fn] = x._f; delete x._f; } else if (!Array.isArray(x)) Object.values(x).forEach(strip); else x.forEach(strip); } };
    a.forEach(strip);
    if (!link.connected()) { count('(dropped: agent not connected) ' + fn); return want ? Promise.reject(new Error('agent not connected')) : undefined; }   // like Send.* in a disconnected L2Swarm
    if (ack && typeof link.callAck === 'function') return link.callAck(fn, a);   // ENGINELAT: { sent, xt, got } when the agent ran it
    return link.call(fn, a, want, fns);
  }

  // ---------------------------------------------------------------- views + collections
  const mobView = (d) => V.view(Number(d.crtType) === 2 ? 'mob' : Number(d.crtType) === 1 ? 'npc' : Number(d.crtType) === 0 ? 'char' : 'summon', d);
  // PETS (engine audit #6): a servitor's Buffs / Skills are collections (forEach, Count, GetItemByID) like L2Creature.Buffs in L2Swarm
  const petExtras = new WeakMap();
  const petView = (d) => {
    if (!d) return null;
    let ex = petExtras.get(d);
    if (!ex) {
      const sub = (k, kind) => { let c = null; return Object.assign(() => c || (c = makeColl(() => (Array.isArray(d[k]) ? d[k] : []), (x) => V.view(kind, x), { kind: 'Pet.' + k, missing: miss })), { getter: true }); };
      ex = { Buffs: sub('Buffs', 'buff'), Skills: sub('Skills', 'skill') }; petExtras.set(d, ex);
    }
    return V.view('pet', d, ex);
  };
  const meExtra = {
    Buffs: Object.assign(() => BuffsList, { getter: true }),
    Pet: Object.assign(() => { const p = mirror.pets[0]; return p ? petView(p) : null; }, { getter: true }),
    targetCrt: Object.assign(() => targetView(), { getter: true }),
    TargetObjId: Object.assign(() => mirror.tgt || 0, { getter: true }),
    Clan: Object.assign(() => { const c = mirror.me.Clan; if (!c || typeof c !== 'object') return null; if (c.Id === undefined && c.ClanId !== undefined) c.Id = c.ClanId; return c; }, { getter: true }),   // #12: swarm.js myClanId() reads Id (an older agent sends ClanId only)
    LastSkillUsed: Object.assign(() => (mirror.me.LastSkillUsedId ? V.view('skill', mirror.skills.find(s => Number(s.Id) === Number(mirror.me.LastSkillUsedId)) || { Id: mirror.me.LastSkillUsedId }) : null), { getter: true }),
  };
  const meView = V.view('me', mirror.me, meExtra);
  const crColl = makeColl(() => mirror.creatures, mobView, { kind: 'CreaturesList', creatures: true, missing: miss });
  const mobColl = makeColl(() => mirror.ofKind(2), mobView, { kind: 'MobsList', creatures: true, missing: miss });
  const npcColl = makeColl(() => mirror.ofKind(1), mobView, { kind: 'NpcList', creatures: true, missing: miss });
  const charColl = makeColl(() => mirror.ofKind(0), mobView, { kind: 'CharList', creatures: true, missing: miss });
  const partyColl = makeColl(() => mirror.party, (d) => V.view('party', d), { kind: 'PartyList', missing: miss });
  const invColl = makeColl(() => mirror.inv, (d) => V.view('item', d), { kind: 'Inventory', missing: miss });
  const buffColl = makeColl(() => mirror.buffs, (d) => V.view('buff', d), { kind: 'BuffsList', missing: miss });
  const clockNow = () => (o.clock ? o.clock.now() : Date.now());
  const skillColl = makeColl(() => mirror.skills, (d) => V.view('skill', d), { kind: 'SkillsList', missing: miss, row: (d) => skillPublic(d, clockNow()) });   // snapshot = live IsReady (audit #27)
  const dropColl = makeColl(() => mirror.drops, (d) => V.view('drop', d), { kind: 'DropList', missing: miss });
  const petColl = makeColl(() => mirror.pets, petView, { kind: 'PetList', missing: miss });
  const buyColl = makeColl(() => mirror.buy, (d) => V.view('item', d), { kind: 'BuyList', missing: miss });
  const petInvColl = makeColl(() => mirror.petInv, (d) => V.view('item', d), { kind: 'PetInventory', missing: miss });
  const macroColl = makeColl(() => [], (d) => d, { kind: 'MacroList', missing: miss });
  const BuffsList = buffColl;
  function findAny(objId) {
    const n = Number(objId) || 0; if (!n) return null;
    if (n === Number(mirror.me.objId)) return meView;
    const c = mirror.cr.get(n); if (c) return mobView(c);
    const p = mirror.party.find(x => Number(x.objId) === n); if (p) return V.view('party', p);
    const pt = mirror.pets.find(x => Number(x.objId) === n); if (pt) return petView(pt);
    return null;
  }
  // a target that is not in the mirror (left view, deleted after a teleport) reads as null, like L2Swarm after the server's DeleteObject
  function targetView() { const t = mirror.tgt; if (!t) return null; const v = findAny(t); if (!v) count('Target not in the mirror -> null'); return v; }

  // ---------------------------------------------------------------- Options (live config): reads from the mirror, writes go local + to the agent
  const OPT_DEFAULTS = { ActiveFollow: false, FollowName: '', FollowAtk: false, FollowDistance: 100, PickUp: false, PickUpPattern: '', PickUpRange: 600, CombatRange: 2000,
    CombatZLimit: 200, UseCombatZLimit: false, CombatZoneType: 'CombatRadius', EnableJSOnIncomingPacket: false, SendParty: false, AutoResurrect: false, UseShots: true };
  const optWatched = new Set(), optWritten = new Map();
  // ENUM OPTIONS (engine audit D8 / #8, 2026-10-12): agent2 reports an enum Option by its NAME ('CombatRadius', 'Map', ...; String() of the .NET
  // enum), and ClearScript refuses a JS number / string written to an enum property. Old code: Options.CombatZoneType = CombatZoneTypes.Map
  // (a number, on wrong numbering) was refused SILENTLY in L2Swarm, the brain kept believing 2 -> the .zmap branch hunted in the square. Now the
  // brain keeps the NAME (String(Options.CombatZoneType) reads like in L2Swarm; combatSquare's zoneCache compares it) and sends
  // { $enum: 'CombatZoneTypes', n: 'Map' }, which agent2 turns into the real enum (an older agent: the plain name, refused + re-reported).
  const OPT_ENUM = { CombatZoneType: 'CombatZoneTypes' };
  const enumName = (type, v) => {
    if (v === null || v === undefined) return null;
    const E = ENUMS[type];
    if (typeof v === 'number' || typeof v === 'bigint') { const n = Number(v); const k = Object.keys(E).find(x => E[x] === n); return k || null; }
    const s = String(v); return s;
  };
  const optWire = (k, val) => (OPT_ENUM[k] && typeof val === 'string' && val in ENUMS[OPT_ENUM[k]] ? { $enum: OPT_ENUM[k], n: val } : marshal(val, 0));
  /** the brain's own combat-zone selection (L2Swarm switches CombatZoneType itself on these calls; the agent's report confirms it later) */
  const zoneSel = (name) => { if (name) mirror.opt.CombatZoneType = name; optWritten.delete('CombatZoneType'); };   // review 2026-10-12: a zone call replaces an earlier Options write -> never replayed on an agent reconnect (H.onAttach) over the newer zone
  // an Options value that is a .NET collection (CombatSkillsList, ...) arrives as plain rows; swarm.js reads L.Count / L[i].Instrument and may
  // switch one field (L[i].IsEnabled = false) -> local + { a: 'set', path: 'Options.K[i].F' } (agent2 writes that field on the live row)
  const optColls = new Map();
  const optColl = (k) => {
    const rows = mirror.opt[k]; let c = optColls.get(k);
    if (c && c.rows === rows) return c.coll;
    const el = (d, i) => new Proxy(d, { get: (t, f) => t[f], set: (t, f, v) => { t[f] = v; count(`Options.${k}[i].${String(f)}=`); link.set(`Options.${k}[${i}].${String(f)}`, marshal(v, 0)); return true; } });
    const els = rows.map(el);
    const api = { get Count() { return els.length; }, get length() { return els.length; }, forEach(cb) { els.forEach((e, i) => cb(e, i)); }, [Symbol.iterator]: function* () { yield* els; } };
    const coll = new Proxy(api, { get: (t, p) => (typeof p === 'string' && /^\d+$/.test(p) ? els[Number(p)] : t[p]) });
    optColls.set(k, { rows, coll }); return coll;
  };
  const Options = new Proxy({}, {
    get(t, k) {
      if (typeof k === 'symbol') return undefined;
      if (k in mirror.opt) return Array.isArray(mirror.opt[k]) ? optColl(k) : mirror.opt[k];
      if (!optWatched.has(k)) { optWatched.add(k); if (link.connected()) link.watch('opt', k); }
      if (k in OPT_DEFAULTS) return OPT_DEFAULTS[k];
      if (k === 'then' || k === 'toJSON') return undefined;
      miss('Options.' + k);
      return undefined;
    },
    set(t, k, v) {
      count('Options.' + String(k) + '=');
      let val = typeof v === 'bigint' ? Number(v) : v;
      if (OPT_ENUM[k]) { const n = enumName(OPT_ENUM[k], val); if (n !== null) val = n; }   // an enum Option: kept as its name (see OPT_ENUM)
      // PERF-2026-10-15 ONLY ON CHANGE (live: swarm.js re-asserts UseCombatZLimit / CombatZLimit every 3 s on every character = ~40 'set'
      // orders a second into L2Swarm, each a .NET property write + a forced re-report): a plain value equal to what the mirror holds (the
      // agent's last report, or a write of ours still on its way) is not sent again. A refused write is re-reported by the agent with the
      // real value, so the next write differs and goes out; reconnect replay (optWritten) is unchanged.
      const same = (k in mirror.opt) && mirror.opt[k] === val && (val === null || typeof val !== 'object');
      mirror.opt[k] = val;                                       // L2Swarm applies an option at once (the same tick reads it back)
      optWritten.set(String(k), val);                            // replayed to the agent on (re)connect (H.onAttach)
      if (same && k !== 'EnableJSOnIncomingPacket') return true;
      if (link.connected()) link.set('Options.' + String(k), optWire(String(k), val));
      if (k === 'EnableJSOnIncomingPacket') link.watch('packets', !!val);
      return true;
    },
    has(t, k) { return k in mirror.opt || k in OPT_DEFAULTS; },
  });

  // ---------------------------------------------------------------- promises in the context's realm
  const newPromise = (fn) => new realm.Promise(fn);
  function promiseCall(fn, args, timeoutMs) {
    return newPromise((res, rej) => {
      let done = false;
      const p = fwd(fn, args, true);
      if (!p || !p.then) { rej(new Error(fn + ': no agent')); return; }
      const to = timeoutMs ? T.setTimeout(() => { if (!done) { done = true; rej(new Error(fn + ' timed out')); } }, timeoutMs) : 0;
      p.then(v => { if (done) return; done = true; if (to) T.clearTimeout(to); res(v); }, e => { if (done) return; done = true; if (to) T.clearTimeout(to); rej(e instanceof Error ? e : new Error(String(e))); });
    });
  }

  // ---------------------------------------------------------------- Send: every method forwarded (unknown names logged, still forwarded)
  const Send = new Proxy({}, {
    get(t, k) {
      if (typeof k === 'symbol' || k === 'then' || k === 'toJSON') return undefined;
      if (!SEND_DOC.has(k)) miss('Send.' + k + ' (undocumented)');
      return function () {
        const args = Array.from(arguments);
        if (k === 'StopMove' || k === 'MoveBackwardToLocation') pendingMoveCancel();
        return fwd('Send.' + k, args, false);
      };
    },
  });
  let moveSeq = 0;
  const pendingMoveCancel = () => { moveSeq++; };

  // ---------------------------------------------------------------- distance / select helpers
  const xy = (a) => a && typeof a === 'object' ? { X: Number(a.X !== undefined ? a.X : a.x) || 0, Y: Number(a.Y !== undefined ? a.Y : a.y) || 0 } : { X: 0, Y: 0 };
  function Distance(a, b, c, d) {
    if (arguments.length >= 4) return Math.round(Math.hypot(Number(a) - Number(c), Number(b) - Number(d)));
    if (arguments.length === 2) { const p = xy(a), q = xy(b); return Math.round(Math.hypot(p.X - q.X, p.Y - q.Y)); }
    const p = xy(a), m = mirror.me; return Math.round(Math.hypot(p.X - (Number(m.X) || 0), p.Y - (Number(m.Y) || 0)));
  }
  function Select(a, range) {
    if (a && typeof a === 'object') { const inf = V.info(a); fwd('Select', [a], false); return inf ? Number(inf.d.objId) || 0 : Number(a.objId) || 0; }
    const name = String(a || ''); const R = Number(range) || 0;
    let best = null, bd = Infinity;
    const byId = /^#(\d+)$/.exec(name);
    mirror.creatures.forEach(c => {
      if (byId ? Number(c.Id) !== Number(byId[1]) : c.Name !== name) return;
      const dd = Distance(c); if (R && dd > R) return; if (dd < bd) { bd = dd; best = c; }
    });
    fwd('Select', [name, R], false);
    return best ? mobView(best) : null;
  }
  const itemCount = (id) => { let n = 0; const k = Number(id); mirror.inv.forEach(it => { if (Number(it.Id) === k) n += Number(it.Count) || 0; }); return n; };

  // ---------------------------------------------------------------- console
  const con = {}; ['log', 'warn', 'error', 'info', 'debug', 'trace'].forEach(l => {
    con[l] = (...a) => { const line = `[${o.name}] ${l}: ` + a.map(x => { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return String(x); } }).join(' ');
      H.consoleLines.push(line); if (H.consoleLines.length > 300) H.consoleLines.splice(0, 100); if (o.log && (l === 'error' || l === 'warn' || o.verbose)) o.log(line); };
  });
  con.bin = () => { };

  // ---------------------------------------------------------------- stubs for .NET internals swarm.js probes (all inside try/catch there)
  const extHost = {
    type: (name) => {
      count('__extended_host_functions.type ' + name);
      if (name === 'System.GC') return { GetTotalMemory: () => process.memoryUsage().heapUsed, CollectionCount: (g) => 0, Collect: () => { } };
      if (name === 'System.Threading.ThreadPool') return { GetMinThreads: () => true, GetMaxThreads: () => true, GetAvailableThreads: () => true, SetMinThreads: () => true };
      if (name === 'System.Int32') return { MaxValue: 2147483647 };
      if (/^Microsoft\.ClearScript\./.test(String(name))) return null;   // swarm.js's V8 heap/GC probe (V8GC): Node's GC needs no help -> the probe reports 'not available'
      miss('__extended_host_functions.type(' + name + ')');
      return null;
    },
    newObj: () => null, lib: () => null, arrType: () => null, comType: () => null,
  };
  const Encoding = { UTF8: { GetBytes: (s) => Array.from(Buffer.from(String(s), 'utf8')), GetString: (b, i, n) => Buffer.from(Array.from(b).slice(i || 0, (i || 0) + (n === undefined ? b.length : n))).toString('utf8') } };
  Encoding.ASCII = Encoding.UTF8;
  class TcpClient { constructor() { count('TcpClient (refused: no synchronous sockets in the brain; swarm.js only uses it for the data-service probe)'); } Connect() { throw new Error('TcpClient is not available in the brain host'); } Close() { } }
  const Process = {
    Start: (file, args) => { count('Process.Start'); if (!o.allowProcess) { miss('Process.Start (refused: ' + String(file) + ')'); return null; } return require('child_process').spawn(String(file), String(args || '').split(' '), { detached: true, stdio: 'ignore', windowsHide: true }); },
    GetCurrentProcess: () => ({ Id: process.pid, WorkingSet64: process.memoryUsage().rss, PrivateMemorySize64: process.memoryUsage().rss }),
  };
  const L2Timer = { SetTimer: (ms, cb, rep) => rep ? T.setInterval(cb, ms) : T.setTimeout(cb, ms), ClearTimer: (id) => T.clearTimeout(id) };

  // ---------------------------------------------------------------- the global object
  const g = {};
  const val = (k, get) => Object.defineProperty(g, k, { get, enumerable: true, configurable: true });
  val('Me', () => { if (!mirror.me.objId) count('Me read before the first state report'); return meView; });
  val('Target', () => targetView());
  val('Options', () => Options);
  val('Inventory', () => invColl); val('ItemsList', () => invColl); val('BuyList', () => buyColl); val('BuffsList', () => buffColl); val('DropList', () => dropColl);
  val('PartyList', () => partyColl); val('PetList', () => petColl); val('PetInventory', () => petInvColl); val('SkillsList', () => skillColl);
  val('CreaturesList', () => crColl); val('MobsList', () => mobColl); val('NpcList', () => npcColl); val('CharList', () => charColl); val('MacroList', () => macroColl);
  val('FollowChar', () => { const n = mirror.opt.FollowName; if (!n) return null; const c = mirror.ofKind(0).find(x => x.Name === n); return c ? mobView(c) : null; });
  val('IsConnected', () => !!(link.connected() && mirror.fl.IsConnected));
  val('IsInCombat', () => !!mirror.fl.IsInCombat); val('IsEnabled', () => !!mirror.fl.IsEnabled); val('IsAttacking', () => !!mirror.fl.IsAttacking);
  val('IsSitting', () => !!mirror.fl.IsSitting); val('IsFollowModeOn', () => !!mirror.fl.IsFollowModeOn); val('IsFollowMaster', () => !!mirror.fl.IsFollowMaster);
  val('IsInParty', () => !!mirror.fl.IsInParty); val('IsPartyLeader', () => !!mirror.fl.IsPartyLeader);
  val('CurrentZone', () => { const z = mirror.fl.CurrentZone; const n = typeof z === 'number' ? ZONE_NAMES[z] || 'UNKNOWN' : String(z || 'UNKNOWN'); return { Name: n, ZoneName: n, Type: n, value: ENUMS.L2ZoneTypes[n] || 0, toString: () => n, ToString: () => n, valueOf: () => ENUMS.L2ZoneTypes[n] || 0 }; });
  val('LastHTML', () => mirror.html || '');
  val('Vars', () => mirror.opt.__vars || {});

  const ready = () => !!(link.connected() && mirror.fl.IsConnected && mirror.me.objId && mirror.me.Name && mirror.me.ClassId !== undefined);
  const local = {
    IsCharacterReady: ready,
    Distance, Select,
    StartCombat: () => { mirror.fl.IsInCombat = true; return fwd('StartCombat', [], false); },
    StopCombat: () => { mirror.fl.IsInCombat = false; return fwd('StopCombat', [], false); },
    EnableBot: () => { mirror.fl.IsEnabled = true; return fwd('EnableBot', [], false); },
    DisableBot: () => { mirror.fl.IsEnabled = false; return fwd('DisableBot', [], false); },
    Attack: (id) => fwd('Attack', [id], false),
    RunCommand: (c) => fwd('RunCommand', [c], false),
    SetWindowTitle: (t) => { H.title = String(t); count('SetWindowTitle'); },
    ShowBaloonTip: () => { count('ShowBaloonTip'); },
    ClickLink: (l) => fwd('ClickLink', [l], false),
    LoadCombatMap: (p) => fwd('LoadCombatMap', [p], false),
    SetCombatRange: (r, p) => fwd('SetCombatRange', p === undefined ? [r] : [r, p], false),
    FindPath: (pt) => promiseCall('FindPath', [pt], 20000),
    FindPathSync: (pt) => { miss('FindPathSync (no sync path search in the brain; use the geopath service)'); return null; },
    GetBlockCoordinates: (x, y) => [Math.floor((Number(x) + 327680) / 32768) + 10, Math.floor((Number(y) + 262144) / 32768) + 10],
    UseItem: (id, ok, fail) => { if (typeof ok === 'function' || typeof fail === 'function') return fwd('UseItem', [id, ok || null, fail || null], false); return fwd('UseItem', [id], false); },
    MoveToPoint: function () { return fwd('MoveToPoint', Array.from(arguments), false); },
    // QUESTWALK-2026-10-12: L2Swarm 3.8.18 has no MoveToNpc in script scope ("agent: call MoveToNpc failed: MoveToNpc is not defined"), so its
    // callbacks never fired and openNpc's "walk around via geodata" waited its full 30 s fallback. GoToNpc (order + promise) does the same walk.
    MoveToNpc: (n, ok, fail) => { count('MoveToNpc'); promiseCall('GoToNpc', [n], 30000).then(v => { if (typeof ok === 'function') { try { ok(v); } catch (e) { } } }, e => { if (typeof fail === 'function') { try { fail(e); } catch (e2) { } } }); },
    // #3/#9: GoToPoint(x, y, undefined, ms) must keep ms in the 4th slot (it was shifted into z: a walk to z=60000). L2Swarm's prelude turns a
    // missing z into 0 (dz = z === undefined ? 0 : parseInt(z)), so a missing z goes out as 0 = the same call for every agent version.
    GoToPoint: (x, y, z, ms) => { const args = [x, y]; if (z != null || ms !== undefined) args.push(z == null ? 0 : z);   /* review: null z too (an older agent passes it on: parseInt(null) = NaN) */ if (ms !== undefined) args.push(ms); return promiseCall('GoToPoint', args, (Number(ms) || 60000) + 10000); },
    GoToNpc: (n) => promiseCall('GoToNpc', [n], 120000),
    TriggerJsEvent: (name, ...args) => { count('TriggerJsEvent'); const f = g[name]; if (typeof f === 'function') T.setTimeout(() => f.apply(null, args), 0); },
    Login: () => fwd('Login', [], false), Logout: () => fwd('Logout', [], false),
    Say: (a, b, c) => typeof a === 'number' ? fwd('Send.Say2', [a, b, c || ''], false) : fwd('Say', [a], false),
    Shout: (t) => fwd('Shout', [t], false), Tell: (t, to) => fwd('Tell', [t, to], false), SayToParty: (t) => fwd('SayToParty', [t], false),
    SayToClan: (t) => fwd('SayToClan', [t], false), SayToTrade: (t) => fwd('SayToTrade', [t], false), SayToAlly: (t) => fwd('SayToAlly', [t], false),
    Alert: (m) => { con.warn('Alert: ' + m); return 1; }, Confirm: (m) => { con.warn('Confirm (answered no): ' + m); return false; }, Prompt: () => null,
    assert_min_version: () => true,
    Dispatch: (cb) => { if (typeof cb === 'function') T.setTimeout(cb, 0); }, UISyncContextDispatch: (cb) => { if (typeof cb === 'function') T.setTimeout(cb, 0); },
    OpenNpcDialog: () => count('OpenNpcDialog'), CloseNpcDialog: () => count('CloseNpcDialog'),
    sleep: (ms) => newPromise(r => T.setTimeout(r, Math.max(0, Number(ms) || 0))),
    Skill: (id, lvl) => V.view('skill', { Id: Number(id), Level: Number(lvl) || 1, Name: '' }), Buff: (id, lvl) => V.view('buff', { Id: Number(id), Level: Number(lvl) || 1, Name: '' }), Item: (id) => V.view('item', { Id: Number(id), Name: '' }),
    NewItem: (id) => V.view('item', { Id: Number(id), Name: '' }), NewBuff: (id, l) => V.view('buff', { Id: Number(id), Level: Number(l) || 1 }), NewSkill: (id, l) => V.view('skill', { Id: Number(id), Level: Number(l) || 1 }),
    setTimeout: T.setTimeout, clearTimeout: T.clearTimeout, setInterval: T.setInterval, clearInterval: T.clearInterval, Repeat: T.setInterval,
    BuffLow: (skillId, secs) => { const b = mirror.buffs.find(x => Number(x.Id) === Number(skillId)); return !b || (Number(b.RemainTime) || 0) < Number(secs); },
    BuyItem: (id, n) => { fwd('BuyItem', [id, n], false); return 'sent'; },
    FindItemId: (n) => { miss('FindItemId'); return null; }, FindNpcName: (n) => { miss('FindNpcName'); return ''; }, FindSkillId: (n) => { const s = mirror.skills.find(x => x.Name === n); return s ? Number(s.Id) : null; },
    IsClassGroup: (gname) => { miss('IsClassGroup'); return false; },
    IsMe: (id) => Number(id) === Number(mirror.me.objId) && !!mirror.me.objId,
    ItemCount: (id) => { const n = itemCount(id); return o.bigint !== false ? BigInt(Math.round(n)) : n; },
    NpcNearby: (npcId, range) => mirror.ofKind(1).some(c => Number(c.Id) === Number(npcId) && Distance(c) <= Number(range)),
    GetQuestState: (id) => { const k = String(Number(id)); if (!(k in mirror.q)) { mirror.q[k] = null; if (link.connected()) link.watch('quest', Number(id)); } return mirror.q[k]; },
    HasQuest: (id) => { const s = local.GetQuestState(id); return !!(s && (s.has || s.State !== undefined)); },
    Snapshot: (coll) => { try { return JSON.parse(coll.snapshotJson()); } catch (e) { return []; } },
    StartHook: () => { miss('StartHook'); return false; }, StopHook: () => { miss('StopHook'); return false; }, GetHookStatus: () => 'brain', GetHookError: () => '',
    RunExternalProgram: (p) => { miss('RunExternalProgram (refused)'); },
  };
  // combat-zone family: forwarded as-is
  ['AddCombatPathPoint', 'ClearCombatPath', 'ClearCombatPolygon', 'LoadCombatPath', 'MoveCombatPathPoint', 'RemoveCombatPathPoint', 'SaveCombatPath', 'SetCombatPathCsv',
    'SetCombatPolygonInnerPolygonsJson', 'SetCombatPolygonJson', 'SetCombatPolygonOuterPointsJson', 'SetCombatSquareZone', 'SetCombatSquareZoneOrigin', 'SetCombatSquareZoneRange',
    'UpdateCombatPathPoint', 'UseCombatPath', 'UseCombatPolygon', 'UseCombatSquareZone'].forEach(f => { local[f] = function () { return fwd(f, Array.from(arguments), false); }; });
  // the calls that select a combat mode in L2Swarm (prelude docs: SetCombatPolygon[Json] "selects Polygon mode", UseCombatPolygon / UseCombatPath)
  [['SetCombatPolygonJson', 'Polygon'], ['UseCombatPolygon', 'Polygon'], ['UseCombatPath', 'Path'], ['UseCombatSquareZone', null], ['SetCombatSquareZone', null]].forEach(([f, z]) => { const fn = local[f]; local[f] = function () { const r = fn.apply(null, arguments); zoneSel(z); return r; }; });
  // SetCombatPolygon & co. (engine audit #2/#8): JS functions of L2Swarm's 3.8.8+ prelude (not Context members), so the shim never had them and
  // swarm.js's `typeof SetCombatPolygon === 'function'` guards skipped every room / field-area / drawn-area polygon in the brain (a plain square
  // instead). Same validation + JSON as the prelude (L2Swarm.exe, 3.8.14), forwarded as SetCombatPolygon*Json (agent2 has those) -> no agent change.
  const polyPoints = (points) => {
    if (!Array.isArray(points)) throw new Error('Expected an array of polygon points.');
    return points.map((point) => {
      if (!point) throw new Error('Invalid polygon point.');
      const pair = Array.isArray(point) ? point : [point.X, point.Y];
      if (pair.length !== 2 || typeof pair[0] !== 'number' || typeof pair[1] !== 'number' || !isFinite(pair[0]) || !isFinite(pair[1])) throw new Error('Expected finite X,Y coordinates.');
      return [pair[0], pair[1]];
    });
  };
  const polyInner = (polygons) => { if (!Array.isArray(polygons)) throw new Error('Expected an array of exclusion polygons.'); return polygons.map(polyPoints); };
  local.SetCombatPolygon = (outerPoints, innerPolygons) => { const outer = polyPoints(outerPoints), inner = polyInner(innerPolygons === undefined ? [] : innerPolygons); return local.SetCombatPolygonJson(JSON.stringify(outer), JSON.stringify(inner)); };
  local.SetCombatPolygonOuterPoints = (points) => local.SetCombatPolygonOuterPointsJson(JSON.stringify(polyPoints(points)));
  local.SetCombatPolygonInnerPolygons = (polygons) => local.SetCombatPolygonInnerPolygonsJson(JSON.stringify(polyInner(polygons)));
  local.GetCombatPolygon = () => { miss('GetCombatPolygon'); return { OuterPoints: [], InnerPolygons: [], IsActive: String(mirror.opt.CombatZoneType) === 'Polygon' }; };
  // BAG BARRIER (engine audit #15): swarm.js (bagSync, typeof-guarded: inside L2Swarm the bag is live) awaits this after a sale / trade / buy. An
  // agent with caps 'invsync' sends its bag as L2Swarm has it NOW and then answers (one socket, in order: the mirror is fresh at the answer);
  // an older agent: wait one bag cadence (1 s report + margin). Resolves true when fresh, false otherwise (never rejects).
  // DIALOG-2026-10-13: swarm.js's NPC dialog engine (DIALOG-PURE) bases its safety net on the agent: ms since its last message (state report or
  // pong) and the last ping round trip (runner.js). connected false / a big age = the agent is behind -> the dialog waits on, never re-clicks.
  // ENGINELAT-2026-10-13 CAST ACK: castNow (swarm.js, typeof-guarded) sends its skill request through this and starts its "did the server start
  // it?" window when the AGENT RAN the request, not when the brain queued it: an agent that is behind (slow tick, sleeping) no longer turns into
  // a false 'no answer' + a fallback cast queued behind the late primary. -> promise { sent, xt, got } | rejects when not connected / timed out.
  local.__sendAck = (fn, args, ms) => newPromise((res, rej) => {
    const f = String(fn || ''); if (!/^Send.w+$/.test(f)) { rej(new Error('__sendAck: Send.* only')); return; }
    const p = fwd(f, Array.from(args || []), true, true);
    if (!p || typeof p.then !== 'function') { rej(new Error(f + ': no agent')); return; }
    let done = false; const to = T.setTimeout(() => { if (!done) { done = true; rej(new Error(f + ': no ack')); } }, Math.max(500, Number(ms) || 5000));
    p.then(v => { if (done) return; done = true; T.clearTimeout(to); res(v); }, e => { if (done) return; done = true; T.clearTimeout(to); rej(e instanceof Error ? e : new Error(String(e))); });
  });
  local.__agentLink = () => ({ connected: !!link.connected(), age: mirror.at ? Math.max(0, Date.now() - Math.max(mirror.at, mirror.pongAt || 0)) : 0, rtt: mirror.rtt == null ? 0 : mirror.rtt });
  local.__bagSync = (ms) => newPromise((res) => {
    const lim = Math.max(200, Number(ms) || 3000);
    if (!link.connected()) { res(false); return; }
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    if (Array.isArray(mirror.agentCaps) && mirror.agentCaps.indexOf('invsync') >= 0) {
      const p = fwd('InvSync', [], true);
      T.setTimeout(() => fin(false), lim);
      if (p && p.then) p.then(() => fin(true), () => fin(false)); else fin(false);
    } else T.setTimeout(() => fin(false), Math.min(lim, 1300));
  });
  local.GetCombatPath = () => { miss('GetCombatPath'); return []; };
  local.GetCombatPolygonJson = () => { miss('GetCombatPolygonJson'); return '[]'; };
  local.GetCombatSquareZone = () => { miss('GetCombatSquareZone'); return null; };
  Object.keys(local).forEach(k => Object.defineProperty(g, k, { value: local[k], writable: true, enumerable: true, configurable: true }));

  // Frame.js's bridge object: swarm.js only probes Context.HasQuest / Context.GetQuestState
  Object.defineProperty(g, 'Context', { value: { HasQuest: local.HasQuest, GetQuestState: local.GetQuestState, FindPath: local.FindPath, Select: local.Select }, writable: true, enumerable: true, configurable: true });
  const appApi = o.bus.api(o.accountId);
  const App = { on: appApi.on, off: appApi.off, emit: appApi.emit, emitTo: appApi.emitTo, self: appApi.self };
  const AppEvents = {
    on: (name, cb) => { const tok = `ae:${o.name}:${++H.cbSeq}`; H.appEvents.set(tok, { name: String(name), cb }); link.watch('appevent', String(name)); return tok; },
    off: (tok) => { H.appEvents.delete(String(tok)); },
  };
  const objects = {
    Send, App, AppEvents, console: con, DebugConsole: con, File: o.vfs.File, Encoding, Point3D, Point, TcpClient, Process, L2Timer,
    JSCore: { delay: (ms) => local.sleep(ms) }, __extended_host_functions: extHost,
    Map: undefined,                                  // L2Swarm's world-map host type shadows JS Map there; swarm.js uses PMap. JS Map stays the realm's own.
    net: { createConnection: () => { miss('net.createConnection'); return null; } },
    MessageBox: { Show: (m) => { con.warn('MessageBox: ' + m); return 1; } },
    __FILE__: 'swarm.js', __VERSION__: o.version || '3.8.14-brain', __DIR__: o.root, __SCRIPTS__: o.root + '\\Scripts', __PROCID__: process.pid,
  };
  Object.keys(objects).forEach(k => { if (objects[k] !== undefined) Object.defineProperty(g, k, { value: objects[k], writable: true, enumerable: true, configurable: true }); });
  Object.keys(ENUMS).forEach(k => Object.defineProperty(g, k, { value: Object.freeze(Object.assign({}, ENUMS[k])), writable: false, enumerable: true, configurable: true }));
  if (o.Date) Object.defineProperty(g, 'Date', { value: o.Date, writable: true, enumerable: false, configurable: true });

  // ---------------------------------------------------------------- event dispatch (runner -> context)
  // TIMING (2026-10-12, audit #10/#11/#27/#29): with an agent whose hello caps carry 'assume' (runner.attach -> mirror.agentCaps; agent2 with
  // fast edges) the mirror is pre-updated AT the event: my own OnMagicSkillUse of a learned skill = Me.IsCasting true + that skill on cooldown
  // from now (unless it is already on a running cooldown); my own OnTargetSelected = my Target. That agent marks the same fields on its side and
  // re-sends their real values with its next 62 ms tick / 250 ms report, so a wrong guess lives one tick. An older agent would never correct
  // them -> nothing is assumed.
  const agentAssumes = () => Array.isArray(mirror.agentCaps) && mirror.agentCaps.indexOf('assume') >= 0;
  const HOOK_PRE = {
    OnMagicSkillUse: (a) => {
      if (!agentAssumes() || !mirror.me.objId || Number(a[0]) !== Number(mirror.me.objId)) return;
      const s = mirror.skills.find(x => Number(x.Id) === Number(a[2])); if (!s) return;   // potions / scrolls (item skills) are no cast of mine
      mirror.me.IsCasting = true;
      // ReuseDelay = L2Swarm's LAST cooldown length of this skill (0 before its first cooldown since login: L2Skill.set_ReuseDelay is only
      // called at a cast). Unknown length (0) -> not ready without a derived end (_cdRe 0): the agent's next report (marker) says ready / the length.
      const re = Number(s.ReuseDelay) || 0, t = clockNow();
      if (skillReady(s, t)) { s.IsReady = false; s._cdAt = t; s._cdRe = re > 0 ? re : 0; }
    },
    OnTargetSelected: (a) => { if (agentAssumes() && mirror.me.objId && Number(a[0]) === Number(mirror.me.objId)) mirror.tgt = Number(a[1]) || 0; },
    // #1/#7: agent2 sends the packet as hex; swarm.js reads p.length (bytes) and Number(p[i]) & 255 (henna 0xEE, clan 0x5A, siege, char list)
    OnIncomingPacket: (a) => { if (typeof a[0] === 'string' && a[0].length % 2 === 0 && /^[0-9a-fA-F]*$/.test(a[0])) a[0] = Array.from(Buffer.from(a[0], 'hex')); },
    OnNpcHtmlMessage: (a) => { mirror.html = String(a[0] || ''); },
    OnNpcQuestHtmlMessage: (a) => { mirror.html = String(a[0] || ''); },
    OnTeleportToLocation: (a) => { if (Number(a[0]) === Number(mirror.me.objId)) { mirror.me.X = Number(a[1]); mirror.me.Y = Number(a[2]); mirror.me.Z = Number(a[3]); } },
    OnDie: (a) => { if (Number(a[0]) === Number(mirror.me.objId)) mirror.me.IsDead = true; else { const c = mirror.cr.get(Number(a[0])); if (c) c.IsDead = true; } },
    OnRevive: (a) => { if (Number(a[0]) === Number(mirror.me.objId)) mirror.me.IsDead = false; },
    // SHOPLIST (2026-10-13): a[1] is the SELL part (my own items); an agent with the fix sends L2Swarm's real BuyList as a[2] -> mirror.buy.
    // An older agent: a[1] as before (swarm.js then sees "my own bag" and buys without the list check, see slIsSellPart).
    OnShopList: (a) => { if (Array.isArray(a[2]) && a[2].length) mirror.buy = a[2]; else if (Array.isArray(a[1])) mirror.buy = a[1]; if (Array.isArray(a[1])) a[1] = a[1].map(d => V.view('item', d)); if (Array.isArray(a[2])) a.length = 2; },
    OnTrade: (a) => { if (Array.isArray(a[1])) a[1] = a[1].map(d => V.view('item', d)); },
    OnWareHouseDepositList: (a) => { if (Array.isArray(a[0])) a[0] = a[0].map(d => V.view('item', d)); },
    OnWareHouseWithdrawalList: (a) => { if (Array.isArray(a[0])) a[0] = a[0].map(d => V.view('item', d)); },
  };
  H.dispatch = (hook, args, ctxGlobal) => {
    const a = Array.isArray(args) ? args.slice() : [];
    try { if (HOOK_PRE[hook]) HOOK_PRE[hook](a); } catch (e) { }
    const fn = ctxGlobal[hook];
    if (typeof fn !== 'function') { count('(no handler) ' + hook); return false; }
    count('event ' + hook);
    const t0 = Date.now();
    try { if (o.invoke) o.invoke(fn, a); else fn.apply(null, a); } catch (e) { H.errors++; if (o.onError) o.onError(hook, e); }
    const ms = Date.now() - t0; if (ms > 200 && o.log) o.log(`[${o.name}] slow handler ${hook}: ${ms} ms`);
    return true;
  };
  H.appEvent = (name, data) => { for (const s of H.appEvents.values()) if (s.name === name) { try { if (o.invoke) o.invoke(s.cb, [data]); else s.cb(data); } catch (e) { H.errors++; if (o.onError) o.onError('AppEvents ' + name, e); } } };
  // a (new) agent link: replay every Options value the script set (L2Swarm keeps them; the agent of a fresh L2Swarm session does not)
  // + watch every Options key swarm.js is known to read (docs/plan/new_engine/host_api.md §2), so the first read already has the live value
  const PREWATCH = ['ActiveFollow', 'FollowName', 'FollowAtk', 'FollowDistance', 'EnableJSOnIncomingPacket', 'CombatZoneType', 'PickUp', 'PickUpPattern', 'SendParty', 'AutoResurrect',
    'CombatSkillsList', 'UseCombatZLimit', 'CombatZLimit', 'CombatRange'];
  H.onAttach = () => { optWritten.forEach((v, k) => link.set('Options.' + k, optWire(k, v))); PREWATCH.forEach(k => { optWatched.add(k); link.watch('opt', k); }); };
  H.global = g; H.mirror = mirror; H.views = V; H.setRealm = (r) => { Object.assign(realm, r); };
  H.coverage = () => {
    const c = {};
    ['Me', 'Target', 'Inventory', 'ItemsList', 'BuyList', 'BuffsList', 'DropList', 'PartyList', 'PetList', 'PetInventory', 'SkillsList', 'CreaturesList', 'MobsList', 'NpcList', 'CharList',
      'IsConnected', 'IsInCombat', 'IsEnabled', 'IsAttacking', 'IsSitting', 'CurrentZone', 'IsFollowModeOn', 'IsFollowMaster', 'IsInParty', 'IsPartyLeader', 'LastHTML', 'Options',
      'FollowChar', 'Vars', 'ItemCount', 'BuffLow', 'IsMe', 'NpcNearby', 'GetQuestState', 'HasQuest', 'IsCharacterReady', 'Distance'].forEach(k => c[k] = 'mirror');
    ['Send', 'StartCombat', 'StopCombat', 'EnableBot', 'DisableBot', 'Attack', 'RunCommand', 'ClickLink', 'LoadCombatMap', 'SetCombatRange', 'UseItem', 'MoveToPoint', 'MoveToNpc',
      'Say', 'Shout', 'Tell', 'SayToParty', 'SayToClan', 'SayToTrade', 'SayToAlly', 'BuyItem', 'Select', 'Login', 'Logout', 'SetCombatSquareZone', 'UseCombatSquareZone',
      'SetCombatPolygonJson', 'UseCombatPolygon', 'SetCombatPathCsv', 'UseCombatPath'].forEach(k => c[k] = 'order');
    ['GoToPoint', 'GoToNpc', 'FindPath'].forEach(k => c[k] = 'order + promise');
    ['App', 'File', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'sleep', 'console', 'Point', 'Point3D', 'Encoding', 'L2CreatureTypes', 'CombatZoneTypes',
      '__DIR__', '__SCRIPTS__', '__FILE__', '__VERSION__', 'assert_min_version', 'SetWindowTitle'].forEach(k => c[k] = 'local');
    c.AppEvents = 'agent subscription'; ['Process', 'TcpClient', '__extended_host_functions', 'FindPathSync'].forEach(k => c[k] = 'stub');
    return c;
  };
  return H;
}

module.exports = { createHost, Point3D, Point, ENUMS, SEND_DOC };
