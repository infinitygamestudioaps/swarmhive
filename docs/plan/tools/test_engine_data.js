// ENGINE AUDIT — FIX GROUP "data" (2026-10-12): simulator checks for audit findings 1/7, 2/8 (+ the CombatZoneType/.zmap fall-through), 3/9, 4, 5/6/14,
// 12, 15 (engine: fresh bag), 16 (kill counter / script attacks). Nothing live: no L2Swarm, no game, no Logs.
// Chain under test: a fake L2Swarm host (ClearScript-like: host methods are NOT JS functions, an enum Option refuses plain numbers/strings)
//   -> Scripts_dev/agent2.js (the REAL file, in a vm context; its TCP stream is an in-memory pipe)  ->  Dashboard/brain_host mirror.js + host.js
//   (the REAL createHost) -> a tiny global standing in for swarm.js. The swarm.js parts (#15 sellAt / collect, #16 huntTarget / engage / kill test)
//   run the REAL functions cut out of the patched swarm.js file (--swarm <file>) with stub globals.
// Usage: node docs/plan/tools/test_engine_data.js [--agent <agent2.js>] [--bh <brain_host dir>] [--swarm <swarm.js>]   (exit 1 on failure)
//   defaults: Scripts_dev/agent2.js, Dashboard/brain_host, Scripts_dev/swarm.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = (k, d) => (process.argv.includes(k) ? path.resolve(process.argv[process.argv.indexOf(k) + 1]) : d);
const AGENT = arg('--agent', path.join(ROOT, 'Scripts_dev', 'agent2.js'));
const BH = arg('--bh', path.join(ROOT, 'Dashboard', 'brain_host'));
const SWARM = arg('--swarm', path.join(ROOT, 'Scripts_dev', 'swarm.js'));
const { createHost } = require(path.join(BH, 'host.js'));
const { Mirror } = require(path.join(BH, 'mirror.js'));
const { Clock } = require(path.join(BH, 'clock.js'));

let pass = 0, fail = 0; const failed = [];
const ok = (c, m) => { if (c) pass++; else { fail++; failed.push(m); } console.log((c ? '  ok   ' : '  FAIL ') + m); };
const section = (t) => console.log('\n== ' + t);
// ClearScript host method: callable, but no apply / call / bind (DESIGN.md §15)
const hostFn = (f) => { const g = function () { return f.apply(this, arguments); }; Object.setPrototypeOf(g, null); return g; };

// ================================================================== fake L2Swarm .NET enums (CombatZoneTypes: real values from L2Swarm.Core.dll)
class NetEnum { constructor(type, name, v) { this.type = type; this.name = name; this.v = v; } ToString() { return this.name; } toString() { return this.name; } }
const mkEnum = (type, o) => { const r = {}; for (const k of Object.keys(o)) r[k] = new NetEnum(type, k, o[k]); return r; };
const CZT = mkEnum('CombatZoneTypes', { CombatRadius: 0, Map: 1, Polygon: 2, Path: 3 });

// ================================================================== one character: fake host + agent2 + brain mirror/host, wired by an in-memory pipe
function makeChar(name, opts) {
  const o = opts || {};
  const clock = new Clock({ virtual: true, start: 1790000000000 });
  const calls = [];
  const rec = (fn, a) => calls.push({ fn, a: a.map(x => (x instanceof NetEnum ? 'enum:' + x.name : x)) });
  const W = {
    me: Object.assign({ Name: name, objId: 1001, Id: 0, X: 1000, Y: 1000, Z: -3000, HP: 900, MaxHP: 1000, HpPercent: 90, MP: 500, MaxMP: 500, MpPercent: 100, Level: 40, ClassId: 57, IsDead: false }, o.me || {}),
    cr: o.creatures || [], inv: o.inv || [{ objId: 5001, Id: 57, Name: 'Adena', Count: 1000 }], pets: o.pets || [], skills: [], buffs: [], party: [],
    clan: o.clan === undefined ? null : o.clan,
    rx: [], tx: '', interval: null, html: '',
    zone: CZT.CombatRadius, zoneSets: [], optErr: 0,
  };
  const coll = (getArr) => ({
    forEach(cb) { getArr().forEach((d, i) => cb(d, i)); }, get Count() { return getArr().length; }, get length() { return getArr().length; },
    snapshotJson() { return JSON.stringify(getArr()); }, GetItemByObjectID(id) { return getArr().find(d => d.objId === Number(id)) || null; }, GetItemByID(id) { return getArr().find(d => d.Id === Number(id)) || null; },
  });
  // Options: CombatZoneType is a .NET enum property -> ClearScript refuses a JS number / string (no implicit enum conversion)
  const optStore = { ActiveFollow: false, FollowName: '', EnableJSOnIncomingPacket: false };
  const Options = new Proxy(optStore, {
    get(t, k) { return k === 'CombatZoneType' ? W.zone : t[k]; },
    set(t, k, v) {
      if (k === 'CombatZoneType') { if (!(v instanceof NetEnum) || v.type !== 'CombatZoneTypes') { W.optErr++; throw new Error('Invalid property assignment: CombatZoneType'); } W.zone = v; W.zoneSets.push(v.name); return true; }
      t[k] = v; return true;
    },
  });
  const bytes = (b) => { const x = Buffer.from(b); x.Length = x.length; return x; };
  class TcpClient {
    Connect() { } Close() { W.closed = true; }
    GetStream() { return {
      get DataAvailable() { return W.rx.length > 0; },
      Read(rx, off, len) { if (!W.rx.length) return 0; const b = W.rx[0]; const n = Math.min(len, b.length); b.copy(rx, off, 0, n); if (n < b.length) W.rx[0] = b.subarray(n); else W.rx.shift(); return n; },
      Write(b, off, n) { W.tx += Buffer.from(b.subarray(off, off + n)).toString('utf8'); },
    }; }
  }
  const Send = new Proxy({}, { get(t, k) { return hostFn(function () { rec('Send.' + String(k), Array.from(arguments)); return null; }); } });
  const g = {
    get Me() { return Object.assign({}, W.me, { get Clan() { return W.clan; } }); }, get Target() { return null; }, Options,
    CreaturesList: Object.assign(coll(() => W.cr.map(c => { const r = Object.assign({}, c); delete r.TargetObjId; delete r.IsStunned; delete r.IsSleeping; delete r.IsParalyzed; delete r.IsOutOfControl; return r; })),
      { GetItemByObjectID(id) { const d = W.cr.find(x => x.objId === Number(id)); return d ? Object.assign({}, d, { targetCrt: d.TargetObjId ? { objId: d.TargetObjId } : null }) : null; } }),
    PartyList: coll(() => W.party), BuffsList: coll(() => W.buffs), Inventory: coll(() => W.inv), SkillsList: coll(() => W.skills), DropList: coll(() => []),
    PetList: coll(() => W.pets.map(p => Object.assign({}, p, { Buffs: coll(() => p.Buffs || []), Skills: coll(() => p.Skills || []) }))),
    IsConnected: true, IsInCombat: false, IsEnabled: true, IsAttacking: false, IsSitting: false, IsPartyLeader: true, IsInParty: false, IsFollowModeOn: false, IsFollowMaster: false,
    get CurrentZone() { return { ToString: () => 'GENERALZONE', toString: () => 'GENERALZONE' }; }, get LastHTML() { return W.html; },
    IsCharacterReady: () => true, ItemCount: (id) => BigInt(W.inv.filter(i => i.Id === Number(id)).reduce((s, i) => s + i.Count, 0)), UseItem: (id) => rec('UseItem', [id]),
    GoToPoint: function (x, y, z, ms) { rec('GoToPoint', Array.from(arguments)); return new Promise(() => { }); },
    SetCombatPolygonJson: (a, b) => { rec('SetCombatPolygonJson', [a, b]); W.zone = CZT.Polygon; }, LoadCombatMap: (p) => rec('LoadCombatMap', [p]), StartCombat: () => rec('StartCombat', []),
    SetCombatSquareZone: (r, p) => rec('SetCombatSquareZone', [r, p]), UseCombatSquareZone: () => rec('UseCombatSquareZone', []),
    GetQuestState: () => null, Send, CombatZoneTypes: CZT,
    App: { self: () => ({ accountId: 'acc-' + name }), on: () => 1, emit: () => { }, emitTo: () => { } }, AppEvents: { on: () => 'x' },
    TcpClient, Encoding: { UTF8: { GetBytes: (s) => bytes(Buffer.from(String(s), 'utf8')), GetString: (b, i, n) => Buffer.from(b).toString('utf8', i, i + n) } },
    Point3D: function (x, y, z) { this.X = x; this.Y = y; this.Z = z; }, Point: function (x, y) { this.X = x; this.Y = y; }, __VERSION__: 'fake-3.8.14',
    setInterval: (f) => { W.interval = f; return 1; }, clearInterval: () => { }, setTimeout: (f) => 0, clearTimeout: () => { }, Date, console,
  };
  for (const k of Object.keys(g)) { const d = Object.getOwnPropertyDescriptor(g, k); if (d && typeof d.value === 'function' && /^[A-Z]/.test(k) && !/^(TcpClient|Point3D|Point|Date)$/.test(k)) g[k] = hostFn(d.value); }
  const actx = vm.createContext(g, { name: 'agent2:' + name });
  vm.runInContext(fs.readFileSync(AGENT, 'utf8'), actx, { filename: 'agent2.js' });

  // ---- brain side
  const mirror = new Mirror(name); mirror.now = () => clock.now();
  const pending = new Map(); let seq = 0;
  const sent = []; const toAgent = (o) => { sent.push(o); W.rx.push(Buffer.from(JSON.stringify(o) + '\n', 'utf8')); };
  const link = {
    connected: () => true,
    call: (fn, args, want) => { const id = ++seq; const m = { a: 'call', id, fn, args }; if (want) m.want = 1; toAgent(m); if (!want) return undefined; return new Promise((res, rej) => pending.set(id, { res, rej })); },
    set: (p, v) => toAgent({ a: 'set', path: p, v }), watch: (kind, key) => toAgent({ a: 'watch', kind, key }),
  };
  const timers = clock.forOwner('brain:' + name, (e) => console.log('timer error', e));
  const bctx = {};
  const H = createHost({ name, accountId: 'acc-' + name, mirror, link, timers, clock, vfs: { File: {} }, bus: { api: () => ({ on() { }, off() { }, emit() { }, emitTo() { }, self: () => ({}) }) }, root: 'C:\\L2Swarm', bigint: false, log: () => { } });
  const hello = {};
  // pump: agent ticks, its output goes into the mirror / dispatch / pending results
  const drain = () => {
    let k; const msgs = [];
    while ((k = W.tx.indexOf('\n')) >= 0) { const line = W.tx.slice(0, k); W.tx = W.tx.slice(k + 1); if (!line.trim()) continue; const m = JSON.parse(line); msgs.push(m);
      if (m.t === 'hello') { Object.assign(hello, m); mirror.agentCaps = Array.isArray(m.caps) ? m.caps : []; }
      else if (m.t === 'st') mirror.apply(m, line.length);
      else if (m.t === 'ev') H.dispatch(m.h, m.a, bctx);
      else if (m.t === 'res') { const p = pending.get(m.id); if (p) { pending.delete(m.id); if (m.ok) p.res(m.v); else p.rej(new Error(m.err)); } } }
    return msgs;
  };
  const tick = async (n) => { const out = []; for (let i = 0; i < (n || 1); i++) { W.interval(); out.push(...drain()); await clock.advance(125); await new Promise(r => setImmediate(r)); out.push(...drain()); } return out; };
  return { W, g, actx, mirror, H, bctx, calls, tick, toAgent, clock, hello, sent, global: H.global };
}

// ================================================================== swarm.js functions cut out of the (patched) file
const SWARM_SRC = fs.existsSync(SWARM) ? fs.readFileSync(SWARM, 'utf8') : '';
/** the source of one top-level `function name(` / `async function name(` (brace matched, strings/comments/templates skipped roughly) */
function cutFn(name) {
  const re = new RegExp('\\n(async )?function ' + name + '\\(');
  const m = re.exec(SWARM_SRC); if (!m) return null;
  let i = SWARM_SRC.indexOf('{', m.index), depth = 0, s = m.index + 1;
  for (; i < SWARM_SRC.length; i++) {
    const c = SWARM_SRC[i];
    if (c === '/' && SWARM_SRC[i + 1] === '/') { i = SWARM_SRC.indexOf('\n', i); continue; }
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < SWARM_SRC.length && SWARM_SRC[i] !== q) { if (SWARM_SRC[i] === '\\') i++; i++; } continue; }
    if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) return SWARM_SRC.slice(s, i + 1); }
  }
  return null;
}

async function main() {
  console.log(`agent: ${path.relative(ROOT, AGENT)}  brain_host: ${path.relative(ROOT, BH)}  swarm.js: ${path.relative(ROOT, SWARM)}`);

  // ---------------------------------------------------------------- #1 / #7 OnIncomingPacket
  section('#1/#7 OnIncomingPacket: the agent sends hex, swarm.js reads bytes');
  {
    const C = makeChar('Pkt'); await C.tick(2);
    let got = null; C.bctx.OnIncomingPacket = (p) => { got = p; };
    C.global.Options.EnableJSOnIncomingPacket = true; await C.tick(2);
    const pkt = [0x00, 0x00, 0x5A, 0x01, 0xFF, 0x10];             // clanPacketParse looks at p[2] (0x5A)
    vm.runInContext('OnIncomingPacket(__p)', Object.assign(C.actx, { __p: pkt }));
    await C.tick(1);
    ok(got !== null, 'the brain handler got the packet');
    ok(got && typeof got !== 'string' && got.length === 6, `p.length is the byte count (${got && got.length}, type ${typeof got})`);
    ok(got && (Number(got[2]) & 255) === 0x5A && (Number(got[4]) & 255) === 0xFF, `p[i] are the bytes (p[2]=${got && got[2]}, p[4]=${got && got[4]})`);
  }

  // ---------------------------------------------------------------- #2 / #8 SetCombatPolygon + CombatZoneType
  section('#2/#8 SetCombatPolygon (L2Swarm prelude) in the brain');
  {
    const C = makeChar('Poly'); await C.tick(2);
    const G = C.global;
    ok(typeof G.SetCombatPolygon === 'function', 'typeof SetCombatPolygon === "function" (swarm.js guards every polygon branch with it)');
    if (typeof G.SetCombatPolygon === 'function') {
      G.SetCombatPolygon([[100, 200], { X: 300, Y: 200 }, [300.0, 400]], [[[150, 250], [160, 250], [160, 260]]]);
      await C.tick(2);
      const c = C.calls.filter(k => k.fn === 'SetCombatPolygonJson').pop();
      ok(!!c && c.a[0] === '[[100,200],[300,200],[300,400]]' && c.a[1] === '[[[150,250],[160,250],[160,260]]]', `forwarded as SetCombatPolygonJson(outer, inner) like the prelude (${c ? c.a.join(' | ') : 'no call'})`);
      ok(String(G.Options.CombatZoneType) === 'Polygon', `Options.CombatZoneType reads Polygon right after it (${String(G.Options.CombatZoneType)})`);
      let threw = false; try { G.SetCombatPolygon([[1, 2], [3]]); } catch (e) { threw = true; }
      ok(threw, 'a bad point throws like the prelude (swarm.js wraps the call in try)');
      G.SetCombatPolygon([[1, 2], [3, 4], [5, 6]]); await C.tick(1);
      const c2 = C.calls.filter(k => k.fn === 'SetCombatPolygonJson').pop();
      ok(!!c2 && c2.a[1] === '[]', 'inner omitted -> "[]"');
    }
  }
  section('#8 (D8) Options.CombatZoneType = CombatZoneTypes.Map after LoadCombatMap (.zmap branch)');
  {
    const C = makeChar('Zmap'); await C.tick(2);
    const G = C.global;
    G.Options.CombatZoneType;                                      // swarm.js reads it (watch)
    await C.tick(40);
    ok(String(G.Options.CombatZoneType) === 'CombatRadius', `the mirror reads the live zone type as L2Swarm names it (${String(G.Options.CombatZoneType)})`);
    G.LoadCombatMap('C:\\x.zmap'); G.Options.CombatZoneType = G.CombatZoneTypes.Map;
    ok(String(G.Options.CombatZoneType) === 'Map', `read back at once in the brain: Map (${String(G.Options.CombatZoneType)})`);
    await C.tick(40);
    ok(C.W.zone === CZT.Map, `L2Swarm's real CombatZoneType became the enum Map (now ${C.W.zone.name}, refused sets ${C.W.optErr})`);
    ok(String(G.Options.CombatZoneType) === 'Map', `still Map after the agent's reports (${String(G.Options.CombatZoneType)})`);
    // quest restore: wasZone = Options.CombatZoneType ... Options.CombatZoneType = wasZone
    const was = G.Options.CombatZoneType; G.Options.CombatZoneType = G.CombatZoneTypes.Polygon; await C.tick(8); G.Options.CombatZoneType = was; await C.tick(40);
    ok(C.W.zone === CZT.Map && String(G.Options.CombatZoneType) === 'Map', `a saved value written back restores the enum (${C.W.zone.name} / ${String(G.Options.CombatZoneType)})`);
    ok(G.CombatZoneTypes.Map !== G.CombatZoneTypes.Polygon && G.CombatZoneTypes.Off === undefined, 'CombatZoneTypes has L2Swarm\'s members only (CombatRadius, Map, Polygon, Path)');
    // a set the host refuses: the brain must not keep believing it
    C.W.optErr = 0; G.Options.CombatZoneType = 'Bogus'; await C.tick(40);
    ok(String(G.Options.CombatZoneType) === 'Map', `after a refused set the mirror shows the real value again (${String(G.Options.CombatZoneType)})`);
  }

  section('#8 review: an agent reconnect does not replay a CombatZoneType that a later zone call replaced');
  {
    const C = makeChar('Replay'); await C.tick(2);
    const G = C.global; G.Options.CombatZoneType; await C.tick(8);
    G.LoadCombatMap('C:/x.zmap'); G.Options.CombatZoneType = G.CombatZoneTypes.Map; await C.tick(8);
    ok(C.W.zone === CZT.Map, `Map set (${C.W.zone.name})`);
    if (typeof G.SetCombatPolygon === 'function') G.SetCombatPolygon([[1, 2], [30, 4], [5, 60]], []); else G.SetCombatPolygonJson('[[1,2],[30,4],[5,60]]', '[]');
    await C.tick(8);
    ok(C.W.zone === CZT.Polygon, `the room polygon selected Polygon in L2Swarm (${C.W.zone.name})`);
    C.H.onAttach(); await C.tick(8);                                // the agent reconnected: the brain replays the options it wrote
    ok(C.W.zone === CZT.Polygon, `after the reconnect replay L2Swarm still hunts the polygon (${C.W.zone.name}; the stale Map write must not come back)`);
  }

  // ---------------------------------------------------------------- #3 / #9 GoToPoint z slot
  section('#3/#9 GoToPoint(x, y, undefined, ms): the timeout stays the 4th argument');
  {
    const C = makeChar('Go'); await C.tick(2);
    C.global.GoToPoint(5000, 6000, undefined, 60000).catch(() => { }); await C.tick(2);
    const c = C.calls.filter(k => k.fn === 'GoToPoint').pop();
    ok(!!c && c.a[0] === 5000 && c.a[1] === 6000 && (c.a[2] === undefined || c.a[2] === 0) && c.a[3] === 60000, `L2Swarm GoToPoint got (x, y, z=${c && c.a[2]}, ms=${c && c.a[3]}) — native: z undefined (= 0), ms 60000`);
    C.global.GoToPoint(5000, 6000, -3100).catch(() => { }); await C.tick(2);
    const c2 = C.calls.filter(k => k.fn === 'GoToPoint').pop();
    ok(!!c2 && c2.a[2] === -3100 && c2.a[3] === undefined, `GoToPoint(x, y, z) unchanged (z=${c2 && c2.a[2]}, ms=${c2 && c2.a[3]})`);
    C.global.GoToPoint(7000, 8000, null, 15000).catch(() => { }); await C.tick(1);
    const w = C.sent.filter(m => m.a === 'call' && m.fn === 'GoToPoint').pop();
    ok(!!w && w.args[2] === 0 && w.args[3] === 15000, `brain -> agent: GoToPoint(x, y, null, ms) goes out with z 0 (an older agent passes a null z on: the prelude's parseInt(null) = NaN) (args ${w && JSON.stringify(w.args)})`);
    C.toAgent({ a: 'call', id: 77, fn: 'GoToPoint', args: [1, 2, null, 15000] }); await C.tick(2);
    const c3 = C.calls.filter(k => k.fn === 'GoToPoint').pop();
    ok(!!c3 && c3.a[2] === undefined && c3.a[3] === 15000, `agent: a null z (JSON has no undefined) is passed as a missing z, ms kept (z=${c3 && c3.a[2]}, ms=${c3 && c3.a[3]})`);
  }

  // ---------------------------------------------------------------- #4 UTF-8 split across reads
  section('#4 a multi-byte character split across two TCP reads');
  {
    const C = makeChar('Utf'); await C.tick(2);
    const text = 'regroup — æøå ✓ 😀 done';
    const line = Buffer.from(JSON.stringify({ a: 'call', fn: 'SayToParty', args: [text] }) + '\n', 'utf8');
    const cut1 = line.indexOf(Buffer.from('—', 'utf8')) + 1, cut2 = line.indexOf(Buffer.from('😀', 'utf8')) + 2;   // inside the 3-byte dash, inside the 4-byte emoji
    // read the text the agent decoded: replay the order through a probe FN
    const C2 = makeChar('Utf2'); await C2.tick(2);
    C2.actx.SayToParty = hostFn((t) => { C2.said = t; });
    C2.W.rx.push(line.subarray(0, cut1)); await C2.tick(1);
    C2.W.rx.push(line.subarray(cut1, cut2)); await C2.tick(1);
    C2.W.rx.push(line.subarray(cut2)); await C2.tick(1);
    ok(C2.said === text, `the order's text arrives intact: "${C2.said}"`);
    ok(vm.runInContext('AG.buf', C2.actx) === '', 'the agent consumed the whole line');
  }

  // ---------------------------------------------------------------- #5 / #14 stale creature fields beyond 3000
  section('#5/#14 TargetObjId / stun flags of a creature that leaves the 3000 box');
  {
    const mob = { objId: 7001, Id: 20134, Name: 'Hatar Ratman', crtType: 2, X: 1500, Y: 1500, Z: -3000, HP: 100, MaxHP: 100, HpPercent: 100, Level: 40, IsDead: false, TargetObjId: 1002, IsStunned: true, IsSleeping: false, IsParalyzed: false, IsOutOfControl: false };
    const C = makeChar('Far', { creatures: [mob] }); await C.tick(20);
    const v = () => C.global.CreaturesList.GetItemByObjectID(7001);
    // ENGINELAT-2026-10-13: L2Swarm 3.8.18 has no TargetObjId / IsStunned on CreaturesList items (L2Mob: not at all; L2Character: hidden by
    // ClearScript's type restriction): the agent no longer reads them (~230 us per failed read) and sends the 'none' values everywhere
    ok(v() && Number(v().TargetObjId || 0) === 0 && v().IsStunned === false, `inside the box: TargetObjId ${v() && v().TargetObjId}, stunned ${v() && v().IsStunned} (none: not readable in L2Swarm)`);
    mob.X = 9000; mob.TargetObjId = 1003; mob.IsStunned = false; await C.tick(20);
    ok(v() && Number(v().TargetObjId || 0) !== 1002, `outside the box the old target is gone (TargetObjId ${v() && v().TargetObjId})`);
    ok(v() && !v().IsStunned, `outside the box the old stun is gone (IsStunned ${v() && v().IsStunned})`);
    ok(v() && v().targetCrt === null, 'targetCrt no longer resolves the old target');
    mob.X = 1600; await C.tick(20);
    ok(v() && Number(v().TargetObjId || 0) === 0, `back inside: still none (${v() && v().TargetObjId})`);
  }

  // ---------------------------------------------------------------- #6 pet buffs
  section('#6 a servitor\'s Buffs / Skills in the brain');
  {
    const pet = { objId: 8001, Id: 14839, Name: 'Mechanic Golem', DisplayName: 'Golem', Level: 40, HP: 500, MaxHP: 1000, HpPercent: 50, IsDead: false, X: 1000, Y: 1100, Z: -3000,
      Buffs: [{ Id: 1068, Level: 3, Name: 'Might', IsDebuff: false, RemainTime: 1200 }, { Id: 4073, Level: 1, Name: 'Shock', IsDebuff: true, AbnormalType: 'STUN', RemainTime: 5 }],
      Skills: [{ Id: 4068, Level: 1, Name: 'Cannon', IsReady: true }] };
    const C = makeChar('Pet', { pets: [pet] }); await C.tick(20);
    const p = C.global.PetList.Count ? C.global.PetList[0] : null;
    ok(!!p, 'PetList has the servitor');
    let n = 0, deb = false; try { if (p && p.Buffs) p.Buffs.forEach(b => { n++; if (b.IsDebuff) deb = true; }); } catch (e) { }
    ok(n === 2 && deb, `p.Buffs.forEach sees its 2 buffs incl. the debuff (${n}, debuff ${deb})`);
    ok(!!(p && p.Skills && typeof p.Skills.GetItemByID === 'function' && p.Skills.GetItemByID(4068)), 'p.Skills.GetItemByID works');
    ok(!!(C.global.Me.Pet && C.global.Me.Pet.Buffs && C.global.Me.Pet.Buffs.Count === 2), 'Me.Pet.Buffs.Count === 2');
  }

  // ---------------------------------------------------------------- #12 Me.Clan.Id
  section('#12 Me.Clan.Id');
  {
    const C = makeChar('Clan', { clan: { Id: 270098570, Name: 'MyClan', Level: 2, AllyName: '' } }); await C.tick(8);
    const c = C.global.Me.Clan;
    ok(!!c && Number(c.Id) === 270098570, `Me.Clan.Id = ${c && c.Id} (myClanId() reads C.Id)`);
    ok(!!c && c.Name === 'MyClan', 'Me.Clan.Name');
    // an older agent that only reports ClanId
    const M = makeChar('Clan2'); await M.tick(2);
    M.mirror.apply({ t: 'st', me: { Clan: { Name: 'X', Level: 1, ClanId: 42, AllyName: null } } });
    ok(Number(M.global.Me.Clan.Id) === 42, `old agent payload (ClanId only): Me.Clan.Id = ${M.global.Me.Clan.Id}`);
  }

  // ---------------------------------------------------------------- #15 fresh bag (engine)
  section('#15 the bag after an action: pushed at once + __bagSync barrier');
  {
    const C = makeChar('Bag', { inv: [{ objId: 5001, Id: 57, Name: 'Adena', Count: 1000 }, { objId: 5002, Id: 1800, Name: 'Recipe', Count: 2 }] });
    await C.tick(20);
    const cnt = (id) => Number(C.global.ItemCount(id));
    ok(cnt(1800) === 2, 'mirror has the bag');
    // the server answers a sale between two reports: InventoryUpdate
    C.W.inv = [{ objId: 5001, Id: 57, Name: 'Adena', Count: 1500 }];
    vm.runInContext('OnInventoryUpdate()', C.actx);
    // exactly ONE agent tick (125 ms): a 250 ms report tick may not be next
    await C.tick(1);
    const RE = vm.runInContext('AG.repEvery || 2', C.actx);
    if ((vm.runInContext('AG.tick', C.actx) + 1) % RE === 0) await C.tick(1);         // the next agent tick is a NON-report one
    C.W.inv = [{ objId: 5001, Id: 57, Name: 'Adena', Count: 1700 }]; vm.runInContext('OnInventoryUpdate()', C.actx);
    await C.tick(1);
    ok(cnt(57) === 1700, `bag change visible after ONE agent tick, not the next report (adena ${cnt(57)})`);
    ok(typeof C.mirror.invVer === 'number' && C.mirror.invVer > 0, `bag version reported (${C.mirror.invVer})`);
    // barrier: the bag changed in L2Swarm but no event came (or it was missed): __bagSync makes the agent send it now
    C.W.inv = [{ objId: 5001, Id: 57, Name: 'Adena', Count: 2500 }];
    const G = C.global;
    ok(typeof G.__bagSync === 'function', 'global __bagSync exists in the brain (swarm.js: typeof guard -> no-op in L2Swarm)');
    if (typeof G.__bagSync === 'function') {
      const before = cnt(57); let done = false, ms = -1; const t0 = C.clock.now();
      G.__bagSync(3000).then(() => { done = true; ms = C.clock.now() - t0; });
      for (let i = 0; i < 12 && !done; i++) await C.tick(1);
      ok(done && cnt(57) === 2500, `__bagSync resolved with the live bag (adena ${before} -> ${cnt(57)}, ${ms} ms)`);
    }
  }

  // ---------------------------------------------------------------- swarm.js (patched): #15 sellAt / collect use the barrier, #16 predicates
  section('#15 swarm.js: sellAt / collect wait for the fresh bag');
  {
    const hasHelper = /async function bagSync\(/.test(SWARM_SRC);
    ok(hasHelper, 'swarm.js has bagSync() (typeof __bagSync guard)');
    const sell = cutFn('sellAt') || '';
    ok(/await bagSync\(/.test(sell), 'sellAt syncs the bag before it judges what was sold');
    const coll = cutFn('collectAdenaSteps') || '', lead = cutFn('leadCollect') || '';
    ok(/await bagSync\(|waitCountChange\(/.test(coll) && /await bagSync\(|waitCountChange\(/.test(lead), 'collectAdenaSteps + leadCollect sync the bag before "received N adena"');
    // run the helpers: a brain-like host where the adena shows up 1.2 s late
    if (hasHelper) {
      const src = ['bagSync', 'waitCountChange'].map(cutFn).join('\n');
      let adena = 1000, synced = 0;
      const T = { t: 0 };
      const sb = { num: (v) => Number(v) || 0, now: () => T.t, sleep: (ms) => { T.t += ms; if (T.t >= 1200) adena = 2005075; return Promise.resolve(); },
        itemCount: () => adena, __bagSync: async () => { synced++; } };
      vm.createContext(sb); vm.runInContext(src, sb);
      const c = await sb.waitCountChange(57, 1000, 4000);
      ok(c === 2005075 && synced >= 1, `waitCountChange waits for the late adena (${c}, ${synced} syncs, ${T.t} ms)`);
      const sb2 = { num: (v) => Number(v) || 0, now: () => 0, sleep: () => Promise.resolve(), itemCount: () => 5 };
      vm.createContext(sb2); vm.runInContext(src, sb2);
      let threw = false; try { await sb2.bagSync(); } catch (e) { threw = true; }
      ok(!threw, 'bagSync is a no-op without __bagSync (inside L2Swarm)');
      // review: several trades -> the adena lands in parts; the first part must not end the wait (it is compared with the expected total)
      let ad3 = 1000; const T3 = { t: 0 };
      const sb3 = { num: (v) => Number(v) || 0, now: () => T3.t, sleep: (ms) => { T3.t += ms; if (T3.t >= 600) ad3 = Math.max(ad3, 2000); if (T3.t >= 1800) ad3 = 4000; return Promise.resolve(); }, itemCount: () => ad3, __bagSync: async () => { } };
      vm.createContext(sb3); vm.runInContext(src, sb3);
      const c3 = await sb3.waitCountChange(57, 1000, 4000, 4000);
      ok(c3 === 4000, `waitCountChange(id, before, ms, expected) waits for the whole expected amount, not the first part (${c3} after ${T3.t} ms)`);
      ok(/waitCountChange\(57, before, 4000, before \+ /.test(coll) && /waitCountChange\(57, before, 4000, before \+ /.test(lead), 'both collect functions wait for before + the sum of the OK trades');
    }
  }
  section('#16 swarm.js: kill counter / target choice agree with engage');
  {
    const ht = cutFn('huntTarget'), eg = cutFn('engage'), kc = cutFn('autoLvlKilled');
    ok(!!kc, 'autoLvlKilled() exists (the kill test of the autolevel loop)');
    // a mob that is alive (IsDead false) but shows 0 % HP — engage refuses it; the old loop counted a kill every pass and picked it again
    const zero = { objId: 1, Name: 'Ghost', IsDead: false, HpPercent: 0, X: 100, Y: 0, Z: 0, Id: 20001, Level: 40 };
    const good = { objId: 2, Name: 'Orc', IsDead: false, HpPercent: 100, X: 300, Y: 0, Z: 0, Id: 20002, Level: 40 };
    if (kc) {
      const sb = { num: (v) => Number(v) || 0 }; vm.createContext(sb); vm.runInContext(kc, sb);
      ok(sb.autoLvlKilled(1, null, { 1: 5, 2: 6 }) === true && sb.autoLvlKilled(1, null, { 2: 6 }) === false, 'review: the engaged set (several engage callers) is accepted as the 3rd argument');
      ok(/autoLvlKilled\(lastTarget, cur, engageState\.ids\)/.test(SWARM_SRC), 'review: the autolevel loop asks with every monster engaged recently, not only the last one');
      ok(sb.autoLvlKilled(1, zero, 0) === false, 'alive at 0 % HP and never engaged: no kill');
      ok(sb.autoLvlKilled(1, zero, 1) === true, 'alive at 0 % HP after we engaged it: a kill (the Die packet is late)');
      ok(sb.autoLvlKilled(1, Object.assign({}, zero, { IsDead: true }), 0) === true, 'dead: a kill');
      ok(sb.autoLvlKilled(1, null, 1) === true && sb.autoLvlKilled(1, null, 0) === false, 'gone from view: a kill only if we engaged it');
      ok(sb.autoLvlKilled(0, null, 0) === false, 'no target: no kill');
    }
    if (ht && eg) {
      const T = { t: 0 }; const black = {}; const intents = [];
      const sb = {
        num: (v) => Number(v) || 0, now: () => T.t, Me: { Level: 40, X: 0, Y: 0, Z: 0 }, CONFIG: { rest: { zLimit: 500 } }, autoLvl: { spot: null }, pairs: { on: false, taken: new Set() },
        soloChar: () => false, soloMobList: () => [], soloRaidSpots: () => [], ignoredMob: () => false, huntBlacklisted: (id) => black[id] && black[id] > T.t, huntBlack: black,
        npcLevel: () => 40, meSnap: () => ({ X: 0, Y: 0, Z: 0 }), foreignTagged: () => false, geoBlockedAt: () => false, inPolygon: () => true, nearPolygon: () => true,
        huntSkip: {}, soloSafe: {}, SOLOSAFE: {}, note: () => { }, intents, isHealerRole: () => false, recHold: () => false,
        intent: (a, d) => { intents.push(a + ': ' + d); }, Send: { Action: () => { } }, sleep: () => Promise.resolve(), inst: { on: false }, srvAttack: () => { },
        walkDirect: () => Promise.resolve(), engageState: { id: 0, at: 0, ids: {} },
      };
      sb.snapMobs = () => [zero, good].map(d => Object.assign({}, d, { ref: Object.assign({}, d) }));
      vm.createContext(sb); vm.runInContext(ht + '\n' + eg + '\n' + (kc || ''), sb);
      const t = sb.huntTarget(0, 0, 3000);
      ok(t && t.objId === 2, `huntTarget skips the 0 % HP monster engage would refuse (picked ${t && t.Name})`);
      // engage refuses a 0 % mob: it is put aside for a while so the loop does not pick it again and again
      await sb.engage(Object.assign({}, zero));
      ok(sb.huntBlacklisted(1), 'engage puts a refused (0 % HP, alive) monster aside');
      await sb.engage(Object.assign({}, good));
      ok(sb.intents.some(s => /^attack: Orc/.test(s)) && Number(sb.engageState.id) === 2, `engage attacks a healthy one and remembers it (${sb.intents.join(' / ')})`);
      // review: self-defence / helping a mate call engage() too (other loops): the autolevel target engaged before still counts when it dies out of view
      await sb.engage({ objId: 3, Name: 'Wolf', IsDead: false, HpPercent: 80, X: 50, Y: 0, Z: 0 });
      ok(typeof sb.autoLvlKilled === 'function' && sb.autoLvlKilled(2, null, sb.engageState.ids) === true, `a kill of the autolevel target counts after another engage() (ids ${JSON.stringify(sb.engageState.ids)})`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED:\n  ' + failed.join('\n  ')); process.exit(1); }
  process.exit(0);
}
main().catch(e => { console.log('TEST CRASH', e && e.stack); process.exit(2); });
