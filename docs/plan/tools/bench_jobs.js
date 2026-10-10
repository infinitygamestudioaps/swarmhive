// OFFLINE JOB BENCHMARK for swarm.js (CPU audit 2026-10-09). Loads the WHOLE script in node with mocked L2Swarm host objects, runs it
// on a fake clock for N simulated seconds and measures, per scheduler job: runs, JS ms (real node time) and HOST operations (property
// reads, method calls, collection elements enumerated, snapshot entities, file ops, App emits). Nothing touches the game or the disk
// (file writes go to an in-memory overlay; reads come from the real files, read-only).
//   node docs/plan/tools/bench_jobs.js [swarm.js path] [--secs 120] [--char Tank1] [--json out.json] [--viewers chars|none]
// Host cost model (docs/plan/v4_js_usage.md, offline ClearScript numbers on this PC class): property read 3 us, host method call 6 us,
// forEach element 2 us (v4+ fast path) + its reads, snapshot entity 3 us (host side; JSON.parse is real node time), file op 150 us,
// App.emit/emitTo 40 us. modeled ms = JS ms + host ops x cost. The counts are the robust part; the us figures are an estimate.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SRC = args[0] && !args[0].startsWith('--') ? path.resolve(args[0]) : path.join(ROOT, 'Scripts_dev', 'swarm.js');
const SECS = Number(opt('secs', 120)), CHAR = opt('char', 'Tank1'), VIEW = opt('viewers', 'none');
const COST = { read: 3, call: 6, elem: 2, snapEnt: 3, file: 150, emit: 40 };

// ---------------- fake clock + timers ----------------
const CLOCK = { t: Date.parse('2026-10-09T08:30:00Z') };
class FDate extends Date { constructor(...a) { if (!a.length) super(CLOCK.t); else super(...a); } static now() { return CLOCK.t; } }
let timerSeq = 0; const timers = new Map();
const fSetTimeout = (fn, ms, ...a) => { const id = ++timerSeq; timers.set(id, { fn, a, due: CLOCK.t + Math.max(0, Number(ms) || 0), every: 0 }); return id; };
const fSetInterval = (fn, ms, ...a) => { const id = ++timerSeq; const p = Math.max(1, Number(ms) || 0); timers.set(id, { fn, a, due: CLOCK.t + p, every: p }); return id; };
const fClear = (id) => { timers.delete(id); };

// ---------------- op counting ----------------
const OPS = {}; let CUR = '(load)', INTERNAL = 0;
const raw = (f) => { INTERNAL++; try { return f(); } finally { INTERNAL--; } };   // mock internals are not host ops
const bump = (k, n) => { if (INTERNAL) return; const o = OPS[CUR] || (OPS[CUR] = { read: 0, call: 0, elem: 0, snapEnt: 0, file: 0, emit: 0, js: 0, runs: 0 }); o[k] += (n || 1); };
const hostObj = (data, kind) => new Proxy(data, {
  get(t, k) {
    if (typeof k === 'symbol') return t[k];
    const v = t[k];
    if (typeof v === 'function') return function () { bump('call'); return v.apply(t, arguments); };
    bump('read'); return v;
  },
  set(t, k, v) { bump('read'); t[k] = v; return true; },
});
function coll(items, plainOf) {
  const o = {
    _items: items,
    get Count() { return items.length; },
    forEach(cb) { for (const it of items.slice()) { bump('elem'); cb(it); } },
    GetItemByID(id) { return raw(() => items.find(i => i.Id === Number(id)) || null); },
    GetItemByObjectID(id) { return raw(() => items.find(i => i.objId === Number(id)) || null); },
    GetItemByName(n) { return raw(() => items.find(i => i.Name === n) || null); },
    SnapshotJson() { bump('snapEnt', items.length); return raw(() => JSON.stringify(items.map(plainOf))); },
  };
  return hostObj(o);
}

// ---------------- fixtures ----------------
const readState = (n) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'Logs', `swarm_state_${n}.json`), 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };
const st0 = readState(CHAR) || { x: 23208, y: 110456, z: -9056, level: 50, classId: 33, cls: 'Shillien Knight' };
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'swarm.config.json'), 'utf8').replace(/^﻿/, ''));
const acc = (cfg.accounts || []).find(a => a.character === CHAR) || {};
const party = (cfg.accounts || []).filter(a => a.party === (acc.party || CHAR) && a.enabled !== false).map(a => a.character).slice(0, 9);
let oid = 268400000;
const ME = { Name: CHAR, objId: ++oid, X: st0.x, Y: st0.y, Z: st0.z, HP: 3000, MaxHP: 3200, MP: 900, MaxMP: 1000, CP: 1500, MaxCP: 1600, HpPercent: 93, MpPercent: 90,
  Level: st0.level || 50, ClassId: st0.classId || 33, ClassName: st0.cls || 'Shillien Knight', IsDead: false, IsInCombat: true, IsAttacking: true, IsCasting: false, IsSitting: false,
  Exp: 50000000, ExpPercent: 42.5, Clan: null, IsMoving: false, Title: '', Race: 'DARK_ELF', Karma: 0 };
ME.SnapshotJson = function () { bump('snapEnt'); if (INTERNAL) return '{}'; const o = {}; Object.keys(ME).forEach(k => { if (typeof ME[k] !== 'function') o[k] = ME[k]; }); return JSON.stringify(o); };
const Me = hostObj(ME);
const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
const creature = (kind, name, x, y, z, extra) => hostObj(Object.assign({ objId: ++oid, Id: kind === 2 ? 20400 + Math.floor(rnd() * 50) : 30000 + Math.floor(rnd() * 100), Name: name, crtType: kind, X: x, Y: y, Z: z,
  HP: 2000, MaxHP: 2500, HpPercent: 80, MP: 100, MaxMP: 100, MpPercent: 100, Level: 48, IsDead: false, IsInCombat: false, Title: 'LvL: 48 A', TargetObjId: 0, IsSleeping: false, IsParalyzed: false, IsStunned: false,
  LastCombatAggroTargetObjId: 0, LastCombatHitReceivedMs: 0, Heading: 0, IsRunning: false, Speed: 120 }, extra || {}));
const mobs = []; for (let i = 0; i < 30; i++) { const a = rnd() * 6.28, d = 150 + rnd() * 1400; mobs.push(creature(2, i % 3 ? 'Ossiud' : 'Catherok', Math.round(ME.X + Math.cos(a) * d), Math.round(ME.Y + Math.sin(a) * d), ME.Z, { TargetObjId: i < 3 ? ME.objId : 0 })); }
const npcs = []; for (let i = 0; i < 4; i++) npcs.push(creature(1, 'Npc' + i, ME.X + 3000 + i * 50, ME.Y, ME.Z));
const chars = party.filter(n => n !== CHAR).map((n, i) => creature(0, n, ME.X + 100 + i * 60, ME.Y - 200 + i * 40, ME.Z, { ClassId: 10, IsPartyMember: true }));
for (let i = 0; i < 6; i++) chars.push(creature(0, 'Stranger' + i, ME.X + 2500, ME.Y + 2500 + i * 30, ME.Z));
const CREATURES = mobs.concat(npcs, chars);
const plainCreature = (c) => { const o = {}; ['objId', 'Id', 'Name', 'crtType', 'X', 'Y', 'Z', 'HP', 'MaxHP', 'HpPercent', 'MP', 'MaxMP', 'MpPercent', 'Level', 'IsDead', 'IsInCombat', 'Title', 'TargetObjId', 'LastCombatAggroTargetObjId', 'LastCombatHitReceivedMs', 'Heading', 'IsRunning', 'Speed', 'IsSleeping', 'IsParalyzed', 'IsStunned'].forEach(k => o[k] = c[k]); return o; };
const CreaturesList = coll(CREATURES, plainCreature);
const partyItems = party.map((n, i) => hostObj({ objId: n === CHAR ? ME.objId : chars[i - 1] ? chars[i - 1].objId : ++oid, Name: n, X: ME.X + i * 60, Y: ME.Y - 200 + i * 40, Z: ME.Z, HP: 2000, MaxHP: 2400, HpPercent: 83, MP: 600, MaxMP: 900, MpPercent: 66,
  CP: 900, MaxCP: 1000, IsDead: false, Level: 50, ClassId: 10, IsLeader: i === 0 }));
const PartyList = coll(partyItems, (p) => ({ objId: p.objId, Name: p.Name, X: p.X, Y: p.Y, Z: p.Z, HP: p.HP, MaxHP: p.MaxHP, HpPercent: p.HpPercent, MP: p.MP, MaxMP: p.MaxMP, MpPercent: p.MpPercent, IsDead: p.IsDead, Level: p.Level, ClassId: p.ClassId, IsLeader: p.IsLeader }));
// skills: real tank/class names + fillers (41 active + 30 passive, like the live ov lists)
const SKN = ['Aggression', 'Aura of Hate', 'Ultimate Defense', 'Hex', 'Power Break', 'Shield Stun', 'Arrest', 'Drain Health', 'Life Leech', 'Summon Phantom Cubic', 'Summon Vampiric Cubic', 'Shield Strike', 'Guard Stance', 'Holy Blessing', 'Touch of Death', 'Lightning Strike', 'Shackle', 'Deflect Arrow', 'Reflect Damage', 'Shield Fortress'];
const skills = []; for (let i = 0; i < 71; i++) skills.push(hostObj({ objId: 0, Id: i < SKN.length ? 28 + i * 7 : 2000 + i, Name: i < SKN.length ? SKN[i] : 'Skill ' + i, Level: 10, IsActive: i < 41, IsReady: i % 4 !== 0, IsToggle: i === 12, IsEnabled: true, IsDebuff: i === 3 || i === 4,
  IsMagic: i % 2 === 0, IsNeedTarget: true, MP: 30, HpConsume: 0, CastRange: 600, Range: 600, TargetType: i < 10 ? 'ENEMY' : 'SELF', AffectScope: i === 1 ? 'POINT_BLANK' : 'SINGLE', AbnormalType: i === 3 ? 'PD_DOWN' : '', AbnormalTime: 30, HitTime: 1080,
  ReuseDelay: 10000, Elapsed: 4000, OperateType: 'A1', ItemConsumeId: 0, ItemConsumeCount: 0, AttributeType: '' }));
const SkillsList = coll(skills, (s) => { const o = {}; ['objId', 'Id', 'Level', 'Name', 'IsActive', 'IsReady', 'IsToggle', 'IsEnabled', 'IsDebuff', 'IsMagic', 'IsNeedTarget', 'MP', 'HpConsume', 'CastRange', 'Range', 'TargetType', 'AffectScope', 'AbnormalType', 'AbnormalTime', 'HitTime', 'ReuseDelay', 'OperateType', 'ItemConsumeId', 'ItemConsumeCount'].forEach(k => o[k] = s[k]); return o; });
// inventory: 120 entries (gear from the gear db + consumables + loot)
let gearIds = []; try { gearIds = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_items.json'), 'utf8').replace(/^﻿/, '')).items || {}).map(Number); } catch (e) { }
const inv = [];
const addItem = (Id, Name, Count, eq) => inv.push(hostObj({ objId: ++oid, Id, Name, Count, IsEquiped: !!eq, IsQuest: false, Type: 'ETC', Grade: 'C', BodyPartTypes: '', EnchantLvl: 0, IsStackable: Count > 1, Weight: 1, Price: 1 }));
[[57, 'Adena', 12000000], [736, 'Scroll of Escape', 5], [737, 'Scroll of Resurrection', 3], [728, 'Mana Potion', 1800], [1061, 'Healing Potion', 30], [1464, 'Soulshot: C-grade', 8000], [3949, 'Blessed Spiritshot: C Grade', 0], [3031, 'Spirit Ore', 90]].forEach(a => addItem(...a));
for (let i = 0; i < 8 && i < gearIds.length; i++) addItem(gearIds[i * 37 % gearIds.length], 'Gear ' + i, 1, true);
for (let i = 0; inv.length < 120; i++) addItem(gearIds.length ? gearIds[(i * 53 + 11) % gearIds.length] : 5000 + i, 'Loot ' + i, 1 + (i % 5), false);
const Inventory = coll(inv, (it) => ({ objId: it.objId, Id: it.Id, Name: it.Name, Count: it.Count, IsEquiped: it.IsEquiped, IsQuest: it.IsQuest, Type: it.Type, Grade: it.Grade, BodyPartTypes: it.BodyPartTypes, EnchantLvl: it.EnchantLvl, IsQuest2: false }));
const buffs = []; for (let i = 0; i < 27; i++) buffs.push(hostObj({ objId: 0, Id: 1000 + i, Level: 3, Name: i === 0 ? 'Frenzy' : 'Buff ' + i, IsDebuff: i >= 25, AbnormalType: i >= 25 ? 'POISON' : 'BUFF' + i, AbnormalLevel: 1, RemainTime: 30000 + i * 100, IsInferred: false }));
const BuffsList = coll(buffs, (b) => ({ objId: b.objId, Id: b.Id, Level: b.Level, Name: b.Name, IsDebuff: b.IsDebuff, AbnormalType: b.AbnormalType, AbnormalLevel: b.AbnormalLevel, RemainTime: b.RemainTime, IsInferred: false }));
const DropList = coll([hostObj({ objId: ++oid, Id: 57, Name: 'Adena', Count: 100, X: ME.X + 50, Y: ME.Y, Z: ME.Z })], d => ({ objId: d.objId, Id: d.Id, Name: d.Name, Count: d.Count, X: d.X, Y: d.Y, Z: d.Z }));
const PetList = coll([], x => x);
const Options = hostObj({ CombatRange: 6000, FollowName: party[0], ActiveFollow: false, FollowAtk: false, PickUp: false, PickUpPattern: '', CombatZoneType: 'Square', FollowDistance: 100 });

// ---------------- files: real reads, in-memory writes ----------------
const overlay = new Map();
const keyOf = (p) => String(p).replace(/\//g, '\\').toLowerCase();
const File = hostObj({
  ReadAllText(p) { bump('file'); const k = keyOf(p); if (overlay.has(k)) { const v = overlay.get(k); if (v === null) throw new Error('not found'); return v; } return fs.readFileSync(p, 'utf8'); },
  WriteAllText(p, t) { bump('file'); overlay.set(keyOf(p), String(t)); },
  AppendAllText(p, t) { bump('file'); const k = keyOf(p); overlay.set(k, (overlay.get(k) || '') + String(t)); },
  Exists(p) { bump('file'); const k = keyOf(p); if (overlay.has(k)) return overlay.get(k) !== null; return fs.existsSync(p); },
  Delete(p) { bump('file'); overlay.set(keyOf(p), null); },
  Move(a, b) { bump('file'); const k = keyOf(a); overlay.set(keyOf(b), overlay.has(k) ? overlay.get(k) : (fs.existsSync(a) ? fs.readFileSync(a, 'utf8') : '')); overlay.set(k, null); },
  Copy(a, b) { bump('file'); overlay.set(keyOf(b), overlay.has(keyOf(a)) ? overlay.get(keyOf(a)) : fs.readFileSync(a, 'utf8')); },
  GetLastWriteTimeUtc(p) { bump('file'); const k = keyOf(p); if (overlay.has(k)) return { Ticks: CLOCK.t * 10000 }; try { return { Ticks: Math.round(fs.statSync(p).mtimeMs * 10000) }; } catch (e) { return { Ticks: 0 }; } },
});
// a viewer heartbeat for the "watched" scenario (Dashboard/server.js writes it)
if (VIEW !== 'none') overlay.set(keyOf(path.join(ROOT, 'Logs', 'dash_viewers.json')), JSON.stringify({ at: new Date(CLOCK.t).toISOString(), chars: [CHAR], parties: [acc.party || CHAR], raid: false }));

// ---------------- App events ----------------
const handlers = {};
const App = hostObj({ on(n, cb) { (handlers[n] = handlers[n] || []).push(cb); }, emit(n) { bump('emit'); }, emitTo(id, n) { bump('emit'); } });
const Send = new Proxy({}, { get(t, k) { if (typeof k === 'symbol') return undefined; return function () { bump('call'); return true; }; } });
const tgt = mobs[0];
const fns = {
  IsCharacterReady: () => true, IsMe: (id) => Number(id) === ME.objId, ItemCount: (id) => raw(() => inv.filter(i => i.Id === Number(id)).reduce((a, i) => a + i.Count, 0)),
  Distance: (o) => raw(() => o ? Math.hypot(o.X - ME.X, o.Y - ME.Y) : 0), GoToPoint: () => new Promise(() => { }), MoveToPoint: () => true, FindPath: () => Promise.resolve([]), FindPathSync: () => [],
  Select: () => true, Attack: () => true, UseItem: () => true, StartCombat: () => true, StopCombat: () => true, EnableBot: () => true, DisableBot: () => true, RunCommand: () => true,
  SayToParty: () => true, Tell: () => true, ClickLink: () => true, BuffLow: () => false, FindSkillId: () => 0, FindItemId: () => 0, NpcNearby: () => false, BuyItem: () => true,
  GetQuestState: () => -1, HasQuest: () => false, MoveToNpc: () => true, SetCombatRange: () => true, SetCombatSquareZone: () => true, UseCombatSquareZone: () => true, LoadCombatMap: () => true,
  SetCombatPolygonJson: () => true, UseCombatPolygon: () => true, SetWindowTitle: () => true, GoToNpc: () => true, SendParty: () => true,
};
const host = {};
Object.keys(fns).forEach(k => { host[k] = function () { bump('call'); return fns[k].apply(null, arguments); }; });
class Point3D { constructor(x, y, z) { this.X = x; this.Y = y; this.Z = z; } }
const M = Object.assign(host, {
  Me, Target: tgt, PartyList, CreaturesList, Inventory, SkillsList, BuffsList, DropList, PetList, Options, File, App, Send, Point3D,
  IsEnabled: true, IsInCombat: true, IsConnected: true, IsPartyLeader: party[0] === CHAR, CurrentZone: hostObj({ Name: 'Cruma Tower' }), LastHTML: '', Vars: {}, Context: null,
  L2CreatureTypes: { Char: 0, Npc: 1, Mob: 2, Summon: 3 }, CombatZoneTypes: { Square: 'Square', Map: 'Map' },
  __DIR__: ROOT, __SCRIPTS__: path.join(ROOT, 'Scripts'), assert_min_version: () => true,
  Date: FDate, setTimeout: fSetTimeout, clearTimeout: fClear, setInterval: fSetInterval, clearInterval: fClear,
  sleep: (ms) => new Promise(r => fSetTimeout(r, ms)), __H: {},
  console: { log() { }, error() { }, warn() { } },
});
const unknown = {};
const scope = new Proxy(M, {
  has(t, k) { if (typeof k === 'symbol') return false; if (k in t) return true; if (k in globalThis) return false; unknown[k] = (unknown[k] || 0) + 1; return true; },
  get(t, k) { if (k === Symbol.unscopables) return undefined; return t[k]; },
  set(t, k, v) { t[k] = v; return true; },
});

// ---------------- load the script ----------------
let src = fs.readFileSync(SRC, 'utf8');
// per-job measurement inside SCHED.runTick (JS time with hrtime + host ops attributed to the job's label)
const RUN_ANCHOR = 'const r = j.fn.apply(null, j.args);';
if (!src.includes(RUN_ANCHOR)) { console.error('SCHED anchor not found'); process.exit(1); }
src = src.replace(RUN_ANCHOR, 'const r = __H.run(j, () => j.fn.apply(null, j.args));');
src += '\n;__H.x = { SCHED, state, livePos };';
const lineOf = (fn) => { const s = String(fn).slice(0, 400); const i = src.indexOf(s); return i < 0 ? '?' : src.slice(0, i).split('\n').length; };
M.__H.run = (j, f) => {
  if (!j.hlabel) j.hlabel = 'L' + lineOf(j.fn) + ' ' + String(j.fn).replace(/\s+/g, ' ').slice(0, 50);
  const prev = CUR; CUR = j.hlabel; const t0 = process.hrtime.bigint();
  try { return f(); } finally { const o = OPS[CUR] || (OPS[CUR] = { read: 0, call: 0, elem: 0, snapEnt: 0, file: 0, emit: 0, js: 0, runs: 0 }); o.js += Number(process.hrtime.bigint() - t0) / 1e6; o.runs++; o.ms = j.ms; CUR = prev; }
};
const errs = [];
process.on('unhandledRejection', (e) => { errs.push(String(e && e.message || e)); });
const fn = new Function('__S', 'with (__S) {\n' + src + '\n}');
fn(scope);

// teammates' swarm.pos every 3 s (livePos for partyMember / healTargets)
function feedPos() {
  (handlers['swarm.pos'] || []).forEach(cb => party.filter(n => n !== CHAR).forEach((n, i) => {
    try { CUR = '(events)'; cb({ data: { name: n, oid: partyItems[i + 1] ? partyItems[i + 1].objId : 0, x: ME.X + 80 * i, y: ME.Y - 100, z: ME.Z, dead: false, hp: 80, mp: 70, role: 'x', lvl: 50, cls: 10, withLeader: true, fight: true }, source: { accountId: 'acc-' + n, characterName: n } }); } catch (e) { }
  }));
}

(async () => {
  const end = CLOCK.t + SECS * 1000; let nextPos = CLOCK.t;
  const t0 = process.hrtime.bigint();
  // warm-up 20 s (login waits, caches) is not counted
  const warm = CLOCK.t + 20000;
  let counting = false;
  while (CLOCK.t < end + 20000) {
    if (!counting && CLOCK.t >= warm) { counting = true; Object.keys(OPS).forEach(k => delete OPS[k]); }
    if (CLOCK.t >= nextPos) { feedPos(); nextPos += 3000; }
    // move a bit: monsters + me (fights move)
    if (CLOCK.t % 1000 === 0) { mobs.forEach((m, i) => { const r = m; r.X += (i % 2 ? 3 : -3); }); ME.X += 2; ME.Exp += 1200; }
    const due = [...timers.entries()].filter(([, t]) => t.due <= CLOCK.t).sort((a, b) => a[1].due - b[1].due);
    for (const [id, t] of due) {
      if (!timers.has(id)) continue;
      if (t.every) t.due += t.every; else timers.delete(id);
      CUR = '(timeouts)';
      try { t.fn.apply(null, t.a); } catch (e) { errs.push(String(e && e.message || e)); }
    }
    await new Promise(r => setImmediate(r));
    CLOCK.t += 50;
  }
  const wall = Number(process.hrtime.bigint() - t0) / 1e6;
  const rows = Object.keys(OPS).map(k => { const o = OPS[k]; const host = (o.read * COST.read + o.call * COST.call + o.elem * COST.elem + o.snapEnt * COST.snapEnt + o.file * COST.file + o.emit * COST.emit) / 1000;
    return { job: k.slice(0, 70), every: o.ms || '', runs: o.runs, jsMs: +o.js.toFixed(1), reads: o.read, calls: o.call, elems: o.elem, snapEnt: o.snapEnt, files: o.file, emits: o.emit, hostMs: +host.toFixed(1), totMs: +(o.js + host).toFixed(1),
      perRun: o.runs ? +((o.js + host) / o.runs).toFixed(2) : 0 }; }).sort((a, b) => b.totMs - a.totMs);
  const tot = rows.filter(r => r.runs).reduce((a, r) => a + r.totMs, 0);
  console.log(`${path.basename(SRC)} as ${CHAR} (party ${party.join(',')}), ${SECS} s simulated (+20 s warm-up), viewers=${VIEW}, node wall ${Math.round(wall)} ms`);
  console.log(`scheduled jobs total: ${tot.toFixed(0)} ms modeled = ${(tot / SECS / 10).toFixed(2)} % of one core`);
  console.log('   total  per run   runs   JS ms  reads  calls  elems snapEnt files emits  job');
  rows.slice(0, 22).forEach(r => console.log(`${String(r.totMs).padStart(8)} ${String(r.perRun).padStart(8)} ${String(r.runs).padStart(6)} ${String(r.jsMs).padStart(7)} ${String(r.reads).padStart(6)} ${String(r.calls).padStart(6)} ${String(r.elems).padStart(6)} ${String(r.snapEnt).padStart(7)} ${String(r.files).padStart(5)} ${String(r.emits).padStart(5)}  ${r.job}`));
  const uk = Object.keys(unknown).filter(k => !/^[a-z]/.test(k) || true).slice(0, 40);
  if (uk.length) console.log('unknown globals (undefined in the mock): ' + uk.join(' '));
  if (errs.length) console.log(`errors: ${errs.length} (first: ${[...new Set(errs)].slice(0, 5).join(' | ')})`);
  if (opt('dump')) { const k = [...overlay.keys()].find(x => x.endsWith(`swarm_state_${CHAR.toLowerCase()}.json`)); fs.writeFileSync(opt('dump'), k ? overlay.get(k) : '{}'); }
  if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify({ src: SRC, char: CHAR, secs: SECS, view: VIEW, total: tot, rows }, null, 1));
  process.exit(0);
})();
