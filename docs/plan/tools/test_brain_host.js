// BRAIN HOST SIMULATOR (2026-10-12, new engine phase 1; docs/plan/new_engine/DESIGN.md §7). Nothing live: no L2Swarm, no game, no real Logs.
// Chain under test:   fake game world  ->  Scripts/agent2.js (the REAL file, in a vm context with a fake L2Swarm host API)  ->  TCP  ->
//                     Dashboard/brain_host/runner.js  ->  Scripts_dev/swarm.js (UNCHANGED, one vm context per character)
// One virtual clock drives everything (swarm.js timers, agent2's interval, the world's movement), so ~60 s of game time take a few seconds.
// Scenario (party Crafter1: Crafter1 leader / Spoiler1 / Healer1, standing in Giran, a few NPCs + 3 monsters outside town):
//   boot (no top-level error, IsCharacterReady, swarm_alive file, window title) -> 30 s of timers -> '!status' in party chat (each answers)
//   -> sensible orders (follow the leader, ...) -> BRAIN RESTART (runner stopped, a new one on the same port; agents reconnect; swarm.js boots
//   again, answers '!status' again) -> report: every missing host member, errors, traffic, timers.
// Files: everything swarm.js writes goes to a temp overlay (Logs is isolated: the sim never reads live state files).
// Usage: node docs/plan/tools/test_brain_host.js            (scenario, exit 1 on failure)
//        node docs/plan/tools/test_brain_host.js --mem      (memory per context: 0 / 3 / 12 / 30 contexts, shared data off / on; child processes)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), net = require('net'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const BH = path.join(ROOT, 'Dashboard', 'brain_host');
const { Runner } = require(path.join(BH, 'runner.js'));
const { Clock, makeDate } = require(path.join(BH, 'clock.js'));
const AGENT2 = process.argv.includes('--agent') ? path.resolve(process.argv[process.argv.indexOf('--agent') + 1]) : path.join(ROOT, 'Scripts', 'agent2.js');

// ================================================================== fake game world
const GIRAN = { x: 83400, y: 148600, z: -3400 };
// REAL L2Swarm 3.8.14 / ClearScript semantics (2026-10-12, live bug: agent2 'f.apply is not a function' for every Send.*): host methods are
// callable but are NOT JS functions (no apply / call / bind), and GoToPoint's promise never settles on 3.8.14 (arrival is read from the position).
// --jsfn = the old, too friendly fake (plain JS functions, GoToPoint resolves on arrival).
const HOSTLIKE = !process.argv.includes('--jsfn');
const hostFn = (f) => { if (!HOSTLIKE) return f; const g = function () { return f.apply(this, arguments); }; Object.setPrototypeOf(g, null); return g; };
let OBJ = 0x10000000;
const CLASS = { 57: ['Warsmith', 'FIGHTER'], 55: ['BountyHunter', 'FIGHTER'], 30: ['Elder', 'MAGE'], 53: ['DwarvenFighter', 'FIGHTER'], 33: ['ShillienKnight', 'TANK'], 16: ['Bishop', 'MAGE'] };
class World {
  constructor(clock) { this.clock = clock; this.chars = new Map(); this.npcs = []; this.mobs = []; this.chat = []; this.calls = []; this.timers = clock.forOwner('world', (e) => console.log('world timer', e)); }
  addNpc(name, id, x, y, z, title) { this.npcs.push({ objId: ++OBJ, Id: id, Name: name, Title: title || '', crtType: 1, X: x, Y: y, Z: z, HP: 1000, MaxHP: 1000, HpPercent: 100, MP: 100, MaxMP: 100, MpPercent: 100, Level: 70, IsDead: false, IsInCombat: false }); }
  addMob(name, id, lvl, x, y, z) { this.mobs.push({ objId: ++OBJ, Id: id, Name: name, Title: `LvL: ${lvl}`, crtType: 2, X: x, Y: y, Z: z, HP: 3000, MaxHP: 3000, HpPercent: 100, MP: 500, MaxMP: 500, MpPercent: 100, Level: lvl, IsDead: false, IsInCombat: false, IsSpoiled: false, IsStunned: false, IsSleeping: false, IsParalyzed: false, IsOutOfControl: false, TargetObjId: 0 }); }
  addChar(name, classId, level, x, y, opts) {
    const c = { name, me: { Name: name, objId: ++OBJ, Id: 0, X: x, Y: y, Z: GIRAN.z, HP: 2000, MaxHP: 2000, HpPercent: 100, MP: 800, MaxMP: 800, MpPercent: 100, CP: 1000, MaxCP: 1000,
      Level: level, ClassId: classId, ClassName: CLASS[classId][0], ClassType: CLASS[classId][1], IsDead: false, IsCasting: false, IsInCombat: false, IsAttacking: false, IsSitting: false,
      IsMoving: false, IsRunning: true, Exp: 1234567, ExpPercent: 42.5, SP: 100000, PAtkSpd: 400, MAtkSpd: 400, PAtk: 500, MAtk: 400, PDef: 600, MDef: 400, RunSpeed: 160, WalkSpeed: 90, Speed: 160,
      Karma: 0, HennaSTR: 0, HennaDEX: 0, HennaCON: 0, HennaINT: 0, HennaWIT: 0, HennaMEN: 0, Title: '', Heading: 0, Race: 4, Sex: 0, ExpertiseLevel: 'C', IsStunned: false, IsSleeping: false,
      IsParalyzed: false, IsOutOfControl: false, Load: 1000, MaxLoad: 100000, PvPKills: 0, PKKills: 0, Fame: 0, Vitality: 20000, IsNoble: false, IsHero: false, IsWeaponEquiped: true },
      flags: { IsConnected: true, IsInCombat: false, IsEnabled: false, IsAttacking: false, IsSitting: false, IsPartyLeader: false, IsInParty: true, IsFollowModeOn: false, IsFollowMaster: false, CurrentZone: 'PEACEZONE' },
      opts: { ActiveFollow: false, FollowName: '', FollowAtk: false, FollowDistance: 100, PickUp: true, PickUpPattern: '', CombatRange: 6000, CombatZLimit: 200, UseCombatZLimit: true, CombatZoneType: 'CombatRadius', EnableJSOnIncomingPacket: false, SendParty: false, AutoResurrect: false },
      inv: [[57, 'Adena', 5000000], [736, 'Scroll of Escape', 5], [737, 'Scroll of Resurrection', 3], [728, 'Mana Potion', 1500], [1061, 'Healing Potion', 30], [1464, 'Soulshot: C-grade', 6000], [3949, 'Blessed Spiritshot: C-Grade', 3000]]
        .map(([id, n, c]) => ({ objId: ++OBJ, Id: id, Name: n, Count: c, IsEquiped: false, IsQuest: false, IsStackable: true, EnchantLvl: 0, Type: 'Etc', Grade: 'None' }))
        .concat([{ objId: ++OBJ, Id: 2502, Name: 'Dwarven War Hammer', Count: 1, IsEquiped: true, IsQuest: false, IsStackable: false, EnchantLvl: 0, Type: 'Weapon', Grade: 'C', BodyPartTypes: 'R_HAND' }]),
      skills: (opts && opts.skills || [[1216, 'Self Heal', 1, 'SELF']]).map(([id, n, lv, tt]) => ({ Id: id, Level: lv, Name: n, IsActive: true, IsReady: true, IsToggle: false, IsEnabled: true, CastRange: tt === 'SELF' ? -1 : 600, TargetType: tt, AffectScope: 'SINGLE', MP: 30, IsDebuff: false, AbnormalType: '', AbnormalTime: 0, HitTime: 1000, OperateType: 'A1', IsMagic: 1, AttributeType: 'NONE', Description: '' })),
      buffs: [[1068, 'Might', 3], [1040, 'Shield', 3], [1204, 'Wind Walk', 2], [1045, 'Blessed Body', 6], [1048, 'Blessed Soul', 6], [1062, 'Berserker Spirit', 2], [1086, 'Haste', 2], [1077, 'Focus', 3],
        [1240, 'Guidance', 3], [1242, 'Death Whisper', 3], [1268, 'Vampiric Rage', 4], [1035, 'Mental Shield', 4]].map(([id, n, lv]) => ({ Id: id, Level: lv, Name: n, IsDebuff: false, AbnormalType: '', RemainTime: 40000 })),
      target: 0, html: '', ctx: null, move: null, said: [] };
    c.flags.IsPartyLeader = !!(opts && opts.leader);
    this.chars.set(name, c); return c;
  }
  party(c) { return Array.from(this.chars.values()).filter(o => o !== c).map(o => ({ objId: o.me.objId, Name: o.name, ClassId: o.me.ClassId, Level: o.me.Level, HP: o.me.HP, MaxHP: o.me.MaxHP, HpPercent: o.me.HpPercent, MP: o.me.MP, MaxMP: o.me.MaxMP, MpPercent: o.me.MpPercent, CP: o.me.CP, MaxCP: o.me.MaxCP, IsDead: o.me.IsDead, X: o.me.X, Y: o.me.Y, Z: o.me.Z, IsLeader: o.flags.IsPartyLeader })); }
  seen(c) {
    const near = (o) => Math.hypot(o.X - c.me.X, o.Y - c.me.Y) < 6000;
    const others = Array.from(this.chars.values()).filter(o => o !== c).map(o => ({ objId: o.me.objId, Id: 0, Name: o.name, Title: '', crtType: 0, X: o.me.X, Y: o.me.Y, Z: o.me.Z, HP: o.me.HP, MaxHP: o.me.MaxHP, HpPercent: o.me.HpPercent, MP: o.me.MP, MaxMP: o.me.MaxMP, MpPercent: o.me.MpPercent, Level: o.me.Level, IsDead: o.me.IsDead, ClassId: o.me.ClassId, IsInCombat: false, IsPartyMember: true, IsSitting: o.flags.IsSitting }));
    return others.concat(this.npcs, this.mobs).filter(near);
  }
  // every agent hook goes through the agent context's own function (agent2.js defines them)
  appEvent(c, name, data) { ((c.ae || {})[name] || []).forEach(cb => { try { cb(data); } catch (e) { console.log(`agent ${c.name} AppEvent ${name}:`, e.message); } }); }
  emit(c, hook, ...args) { const f = c.ctx && c.ctx[hook]; if (typeof f === 'function') { try { f.apply(null, args); } catch (e) { console.log(`agent ${c.name} ${hook}:`, e.message); } } }
  partyChat(from, text) { this.chat.push({ at: this.clock.now(), from, text }); for (const c of this.chars.values()) this.emit(c, 'OnSay', from, text, 3); }
  moveTo(c, x, y, z, cb) {
    c.move = { x: Number(x), y: Number(y), z: Number(z === undefined ? c.me.Z : z), cb }; c.me.IsMoving = true;
  }
  step(ms) {
    for (const c of this.chars.values()) {
      // follow (L2Swarm's own follow): stay within FollowDistance of the followed character
      if (!c.move && c.flags.IsEnabled && c.opts.ActiveFollow && c.opts.FollowName) { const t = this.chars.get(c.opts.FollowName); if (t && Math.hypot(t.me.X - c.me.X, t.me.Y - c.me.Y) > (c.opts.FollowDistance || 100) + 80) { c.move = { x: t.me.X, y: t.me.Y, z: t.me.Z, follow: true }; c.me.IsMoving = true; } }
      if (!c.move) continue;
      const d = Math.hypot(c.move.x - c.me.X, c.move.y - c.me.Y), s = (c.me.RunSpeed || 150) * ms / 1000;
      if (d <= s) { c.me.X = c.move.x; c.me.Y = c.move.y; c.me.Z = c.move.z; const cb = c.move.cb; c.move = null; c.me.IsMoving = false; if (cb) cb(true); }
      else { c.me.X += (c.move.x - c.me.X) * s / d; c.me.Y += (c.move.y - c.me.Y) * s / d; c.me.Heading = Math.round(Math.atan2(c.move.y - c.me.Y, c.move.x - c.me.X) * 32768 / Math.PI) & 65535; }
    }
  }
  // very small combat model: L2Swarm combat (IsEnabled + IsInCombat) picks the nearest live monster inside CombatRange, FollowAtk assists the
  // followed character's target, Send.Attack / Attack keep hitting; 150 HP per second per attacker; a dead monster respawns after 20 s.
  combatStep(ms) {
    for (const c of this.chars.values()) {
      if (c.me.IsDead) continue;
      let t = c.target ? this.mobs.find(m => m.objId === c.target && !m.IsDead) : null;
      if (!t && c.flags.IsEnabled && c.opts.ActiveFollow && c.opts.FollowAtk && c.opts.FollowName) { const L = this.chars.get(c.opts.FollowName); const lt = L && L.target ? this.mobs.find(m => m.objId === L.target && !m.IsDead) : null; if (lt && L.flags.IsAttacking) { t = lt; c.target = lt.objId; c.flags.IsAttacking = true; } }
      if (!t && c.flags.IsEnabled && c.flags.IsInCombat) { let bd = Infinity; for (const m of this.mobs) { if (m.IsDead) continue; const d = Math.hypot(m.X - c.me.X, m.Y - c.me.Y); if (d < (c.opts.CombatRange || 2000) && d < bd) { bd = d; t = m; } } if (t) { c.target = t.objId; c.flags.IsAttacking = true; } }
      if (!t) { if (c.flags.IsAttacking && c.target && !this.mobs.find(m => m.objId === c.target && !m.IsDead)) c.flags.IsAttacking = false; continue; }
      if (!c.flags.IsAttacking) continue;
      const d = Math.hypot(t.X - c.me.X, t.Y - c.me.Y);
      if (d > 80) { if (!c.move || c.move.follow) this.moveTo(c, t.X, t.Y, t.Z); continue; }
      t.IsInCombat = true; t.TargetObjId = c.me.objId; t.HP = Math.max(0, t.HP - 150 * ms / 1000); t.HpPercent = Math.round(t.HP / t.MaxHP * 100);
      if (t.HP <= 0 && !t.IsDead) {
        t.IsDead = true; this.kills = (this.kills || 0) + 1; c.flags.IsAttacking = false;
        for (const o of this.chars.values()) { this.emit(o, 'OnDie', t.objId); if (o.target === t.objId) o.flags.IsAttacking = false; }
        if (!t.noRespawn) this.timers.setTimeout(() => { t.IsDead = false; t.HP = t.MaxHP; t.HpPercent = 100; t.IsInCombat = false; }, 20000);
      }
    }
  }
  teleportAll(x, y, z, zone) { let i = 0; for (const c of this.chars.values()) { c.move = null; c.me.X = x + (i % 3) * 60; c.me.Y = y + Math.floor(i / 3) * 60; c.me.Z = z; c.flags.CurrentZone = zone || 'GENERALZONE'; i++; this.emit(c, 'OnTeleportToLocation', c.me.objId, c.me.X, c.me.Y, c.me.Z); } }
  // the fake L2Swarm host API agent2.js runs on
  hostFor(c, port) {
    const world = this, clock = this.clock, T = clock.forOwner('agent:' + c.name, (e) => console.log(`agent ${c.name} timer error:`, e && e.stack));
    const rec = (fn, args) => { world.calls.push({ at: clock.now(), who: c.name, fn, args: JSON.parse(JSON.stringify(args, (k, v) => typeof v === 'bigint' ? Number(v) : (typeof v === 'function' ? '[fn]' : v))) }); };
    const P3 = function (x, y, z) { this.X = x; this.Y = y; this.Z = z; }, P2 = function (x, y) { this.X = x; this.Y = y; };
    const coll = (getArr, kindNum) => ({
      forEach(cb) { getArr().forEach((d, i) => cb(Object.assign({}, d, { crtType: kindNum !== undefined ? kindNum(d) : d.crtType }), i)); },
      get Count() { return getArr().length; }, get length() { return getArr().length; },
      snapshotJson() { return JSON.stringify(getArr()); },
      GetItemByObjectID(id) { return getArr().find(d => d.objId === Number(id)) || null; }, GetItemByID(id) { return getArr().find(d => d.Id === Number(id)) || null; },
    });
    const bytes = (buf) => { const b = Buffer.from(buf); b.Length = b.length; return b; };
    class TcpClient {
      constructor() { this.q = []; this.eof = false; this.s = null; }
      Connect(h, p) {
        this.s = net.connect(port, h); c.lastSock = this.s;
        this.s.on('data', (d) => { this.q.push(d); }); this.s.on('error', () => { this.eof = true; }); this.s.on('close', () => { this.eof = true; });
        world.sockets.add(this.s);
      }
      GetStream() { const t = this; return {
        get DataAvailable() { return t.q.length > 0 || t.eof; },
        Read(rx, off, len) { if (!t.q.length) return 0; let b = t.q[0]; const n = Math.min(len, b.length); b.copy(rx, off, 0, n); if (n < b.length) t.q[0] = b.subarray(n); else t.q.shift(); return n; },
        Write(b, off, n) { if (t.eof || !t.s || t.s.destroyed) throw new Error('socket closed'); t.s.write(Buffer.from(b.subarray(off, off + n))); },
      }; }
      Close() { try { this.s.destroy(); } catch (e) { } this.eof = true; }
    }
    const say = (ch, text) => { c.said.push({ ch, text }); if (ch === 3) world.partyChat(c.name, String(text)); else if (ch === 0 && /^\.[a-z]+$/.test(String(text))) { const z = { giran: GIRAN }[String(text).slice(1)]; if (z) { world.towns = (world.towns || 0) + 1; const who = [c].concat(c.flags.IsPartyLeader ? Array.from(world.chars.values()).filter(o => o !== c && Math.hypot(o.me.X - c.me.X, o.me.Y - c.me.Y) < 1500) : []); world.timers.setTimeout(() => { who.forEach((o, i) => { o.move = null; o.me.X = z.x + i * 40; o.me.Y = z.y; o.me.Z = z.z; o.flags.CurrentZone = 'PEACEZONE'; world.emit(o, 'OnTeleportToLocation', o.me.objId, o.me.X, o.me.Y, o.me.Z); }); }, 3000); } } };
    const Send = new Proxy({}, { get(t, k) { return hostFn(function () { const a = Array.from(arguments); rec('Send.' + String(k), a);
      if (world.onSend) { const r = world.onSend(c, String(k), a); if (r !== undefined) return r; }   // phase 2 scenarios (test_brain_host2.js): NPCs, board, shop, trade, warehouse
      if (k === 'Action' || k === 'Attack') { c.target = Number(a[0]) || 0; if (k === 'Attack') c.flags.IsAttacking = true; }
      if (k === 'MoveBackwardToLocation') world.moveTo(c, a[0], a[1], a[2]);
      if (k === 'StopMove') { c.move = null; c.me.IsMoving = false; }
      if (k === 'Say2') say(Number(a[0]), a[1]);
      if (k === 'RequestTargetCancel') c.target = 0;
      if (k === 'RequestMagicSkillUse') for (const o of world.chars.values()) world.emit(o, 'OnMagicSkillUse', c.me.objId, c.target || c.me.objId, Number(a[0]));
      return null; }); } });
    const g = {
      Me: c.me, get Target() { if (!c.target) return null; return world.seen(c).find(o => o.objId === c.target) || (c.target === c.me.objId ? c.me : { objId: c.target }); },
      Options: c.opts, CreaturesList: Object.assign(coll(() => world.seen(c)), {
        snapshotJson() { return JSON.stringify(world.seen(c).map(d => { const r = Object.assign({}, d); delete r.IsStunned; delete r.IsSleeping; delete r.IsParalyzed; delete r.IsOutOfControl; delete r.TargetObjId; return r; })); },   // like L2Swarm 3.8.10+ (DESIGN §2.2)
        GetItemByObjectID(id) { const d = world.seen(c).find(x => x.objId === Number(id)); return d ? Object.assign({}, d, { targetCrt: d.TargetObjId ? { objId: d.TargetObjId } : null }) : null; } }), PartyList: coll(() => world.party(c)), BuffsList: coll(() => c.buffs), Inventory: coll(() => c.inv), SkillsList: coll(() => c.skills),
      DropList: coll(() => []), PetList: coll(() => []),
      get IsConnected() { return c.flags.IsConnected; }, get IsInCombat() { return c.flags.IsInCombat; }, get IsEnabled() { return c.flags.IsEnabled; }, get IsAttacking() { return c.flags.IsAttacking; },
      get IsSitting() { return c.flags.IsSitting; }, get IsPartyLeader() { return c.flags.IsPartyLeader; }, get IsInParty() { return c.flags.IsInParty; }, get IsFollowModeOn() { return c.opts.ActiveFollow; },
      get IsFollowMaster() { return false; }, get CurrentZone() { return { ToString: () => c.flags.CurrentZone, toString: () => c.flags.CurrentZone }; }, get LastHTML() { return c.html; },
      IsCharacterReady: () => c.flags.IsConnected, ItemCount: (id) => BigInt(c.inv.filter(i => i.Id === Number(id)).reduce((s, i) => s + i.Count, 0)),
      UseItem: (id) => { rec('UseItem', [id]); const it = c.inv.find(i => i.Id === Number(id)); if (it && it.IsStackable) it.Count = Math.max(0, it.Count - 1); world.emit(c, 'OnInventoryUpdate'); },
      StartCombat: () => { rec('StartCombat', []); c.flags.IsInCombat = true; }, StopCombat: () => { rec('StopCombat', []); c.flags.IsInCombat = false; },
      EnableBot: () => { rec('EnableBot', []); c.flags.IsEnabled = true; }, DisableBot: () => { rec('DisableBot', []); c.flags.IsEnabled = false; },
      Attack: (id) => { rec('Attack', [id]); c.target = Number(id); c.flags.IsAttacking = true; }, RunCommand: (cmd) => rec('RunCommand', [cmd]), ClickLink: (l) => { rec('ClickLink', [l]); if (world.onCall) world.onCall(c, 'ClickLink', [l]); },
      LoadCombatMap: (p) => rec('LoadCombatMap', [p]), SetCombatRange: (r, p) => rec('SetCombatRange', [r, p]),
      MoveToPoint: (a, b, cc, d, e) => { rec('MoveToPoint', [a, b, cc]); const isP = a && typeof a === 'object'; const x = isP ? a.X : a, y = isP ? a.Y : b, z = isP ? a.Z : (typeof cc === 'number' ? cc : undefined); const ok = isP ? b : (typeof cc === 'function' ? cc : d); world.moveTo(c, x, y, z, (r) => { if (typeof ok === 'function') ok(); }); },
      MoveToNpc: (n, ok) => { rec('MoveToNpc', [n]); const npc = world.npcs.find(x => x.Name === n); if (npc) world.moveTo(c, npc.X + 50, npc.Y, npc.Z, () => { if (ok) ok(); }); },
      GoToPoint: (x, y, z, ms) => { rec('GoToPoint', [x, y, z, ms]); if (HOSTLIKE) return new Promise(() => { world.moveTo(c, x, y, z); }); return new Promise((res, rej) => { const to = T.setTimeout(() => rej(new Error('timeout')), Number(ms) || 60000); world.moveTo(c, x, y, z, () => { T.clearTimeout(to); res(true); }); }); },
      GoToNpc: (n) => Promise.resolve(true), FindPath: () => Promise.resolve([]), Select: (a) => { rec('Select', [a]); return null; }, Login: () => { }, Logout: () => { },
      Say: (t) => say(0, t), Shout: (t) => say(1, t), Tell: (t, to) => say(2, t), SayToParty: (t) => { rec('SayToParty', [t]); say(3, t); }, SayToClan: (t) => say(4, t), SayToTrade: (t) => say(8, t), SayToAlly: (t) => say(9, t),
      BuyItem: (id, n) => { rec('BuyItem', [id, n]); if (world.onCall) world.onCall(c, 'BuyItem', [id, n]); return 'ok'; }, GetQuestState: () => null,
      SetCombatSquareZone: (r, p) => rec('SetCombatSquareZone', [r, p]), UseCombatSquareZone: () => rec('UseCombatSquareZone', []),
      Send, App: world.appFor ? world.appFor(c) : { self: () => ({ accountId: 'acc-' + c.name, characterName: c.name }) },
      AppEvents: { on: (n, cb) => { rec('AppEvents.on', [n]); (c.ae || (c.ae = {}))[n] = (c.ae[n] || []).concat([cb]); return 'ae' + n; } },
      BuyList: coll(() => c.buyList || []), get CharList() { return coll(() => world.seen(c).filter(o => o.crtType === 0)); }, get NpcList() { return coll(() => world.seen(c).filter(o => o.crtType === 1)); },
      TcpClient, Encoding: { UTF8: { GetBytes: (s) => bytes(Buffer.from(String(s), 'utf8')), GetString: (b, i, n) => Buffer.from(b).toString('utf8', i, i + n) } },
      Point3D: P3, Point: P2, __VERSION__: 'fake-3.8.14',
      setInterval: T.setInterval, clearInterval: T.clearInterval, setTimeout: T.setTimeout, clearTimeout: T.clearTimeout, Date: makeDate(clock), console,
    };
    if (HOSTLIKE) for (const k of Object.keys(g)) { const d = Object.getOwnPropertyDescriptor(g, k); if (d && typeof d.value === 'function' && /^[A-Z]/.test(k) && !/^(TcpClient|Point3D|Point|Date)$/.test(k)) g[k] = hostFn(d.value); }
    return { g, T };
  }
  startAgent(c, port, src) {
    const { g, T } = this.hostFor(c, port);
    c.ctx = vm.createContext(g, { name: 'agent2:' + c.name }); c.T = T;
    vm.runInContext(src, c.ctx, { filename: 'agent2.js' });
  }
}

// ================================================================== helpers
let pass = 0, fail = 0; const results = [];
const ok = (cond, msg) => { results.push((cond ? '  ok   ' : '  FAIL ') + msg); if (cond) pass++; else fail++; console.log((cond ? '  ok   ' : '  FAIL ') + msg); };
const realTurn = (ms) => new Promise(r => setTimeout(r, ms || 1));
let CUR = null;                      // the running Runner (run() waits for its out-of-context work, e.g. geopath answers)
async function run(clock, world, ms, stepMs) {
  const step = stepMs || 100;
  for (let t = 0; t < ms; t += step) { if (CUR) await CUR.idle(20000); await clock.advance(step); world.step(step); world.combatStep(step); await realTurn(1); }
}
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'brain_host_')); }

// ================================================================== scenario
async function scenario() {
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(overlay);
  const port = 19094 + Math.floor(Math.random() * 400);
  const clock = new Clock({ virtual: true, start: Date.now() });
  const names = ['Crafter1', 'Spoiler1', 'Healer1'];
  const mkRunner = () => new Runner({ port, clock, overlay, isolate: ['Logs'], allow: names, logFile: path.join(tmp, 'brain_host.log'), root: ROOT.replace(/\//g, '\\'), geopath: true, ...(process.env.SWARM_SRC ? { script: path.resolve(process.env.SWARM_SRC) } : {}) });   // SWARM_SRC=<copy>: test a patched copy (2026-10-12)
  let runner = CUR = mkRunner();
  await runner.start();
  console.log(`brain host on 127.0.0.1:${port}, overlay ${overlay}`);
  const world = new World(clock); world.sockets = new Set();
  world.addNpc('Clarissa', 30080, 83396, 147904, -3404, 'Gatekeeper'); world.addNpc('Helvetia', 30081, 81000, 149000, -3400, 'Grocer');
  world.addNpc('Kusto', 30512, 83000, 148100, -3400, 'Warehouse Keeper'); world.addNpc('Valkon', 30103, 82500, 148600, -3470, 'Blacksmith');
  world.addMob('Hatar Ratman', 20134, 42, 86200, 150500, -3400); world.addMob('Hatar Ratman', 20134, 42, 86400, 150700, -3400); world.addMob('Giant Spider', 20158, 44, 86000, 151000, -3400);
  const L = world.addChar('Crafter1', 57, 45, GIRAN.x, GIRAN.y, { leader: true, skills: [[1216, 'Self Heal', 1, 'SELF'], [255, 'Power Smash', 10, 'ENEMY']] });
  world.addChar('Spoiler1', 55, 44, GIRAN.x + 150, GIRAN.y + 60, { skills: [[254, 'Spoil', 5, 'ENEMY'], [42, 'Sweeper', 1, 'SELF']] });
  world.addChar('Healer1', 30, 44, GIRAN.x - 120, GIRAN.y + 80, { skills: [[1011, 'Heal', 18, 'ONE'], [1015, 'Battle Heal', 15, 'ONE'], [1016, 'Resurrection', 3, 'ONE']] });
  const src = fs.readFileSync(AGENT2, 'utf8');
  for (const c of world.chars.values()) world.startAgent(c, port, src);

  // ---- 1. boot
  await run(clock, world, 8000);
  let rep = runner.report();
  ok(rep.contexts.length === 3 && rep.contexts.every(c => c.booted), `3 contexts created and swarm.js top level ran in each (${rep.contexts.map(c => `${c.name} ${c.bootMs} ms`).join(', ')}, compile ${rep.st.compileMs} ms)`);
  ok(rep.contexts.every(c => c.connected), 'every context has its agent connected');
  ok(rep.contexts.every(c => c.mirror.creatures >= 4 && c.mirror.skills >= 1 && c.mirror.inv >= 5), `mirrors filled (creatures/skills/inv: ${rep.contexts.map(c => `${c.mirror.creatures}/${c.mirror.skills}/${c.mirror.inv}`).join(', ')})`);
  await run(clock, world, 4000);
  const alive = names.filter(n => fs.existsSync(path.join(overlay, 'Logs', `swarm_alive_${n}.txt`)));
  ok(alive.length === 3, `swarm.js startup finished in all 3 (Logs/swarm_alive_<name>.txt in the overlay: ${alive.join(', ')})`);
  rep = runner.report();
  ok(rep.contexts.every(c => /^SWARM /.test(c.title || '')), `window titles set: ${rep.contexts.map(c => c.title).join(' | ')}`);

  // ---- 2. 30 s of timers
  await run(clock, world, 30000);
  rep = runner.report();
  ok(rep.st.errors < 50, `${rep.st.errors} errors from contexts in ~42 s (unhandled rejections ${rep.st.unhandled})`);
  const callNames = Array.from(rep.calls.keys());
  ok(callNames.length > 5, `swarm.js called ${callNames.length} different host actions`);
  const follow = world.calls.filter(k => k.fn === 'Send.Action' || k.fn === 'StartCombat' || k.fn === 'EnableBot');
  const optSet = Array.from(rep.calls.keys()).filter(k => /^Options\./.test(k));
  console.log(`   members' follow target in L2Swarm (idle in town: none expected): ${['Spoiler1', 'Healer1'].map(n => `${n} -> ${world.chars.get(n).opts.FollowName || '(none)'} active=${world.chars.get(n).opts.ActiveFollow}`).join(', ')}`);
  console.log('   options written:', optSet.join(', '));

  // ---- 3. !status in party chat
  for (let i = 0; i < 40 && world.chat.length && clock.now() - world.chat[world.chat.length - 1].at < 16000; i++) await run(clock, world, 1000);
  const before = world.chat.length;
  world.partyChat('Crafter1', '!status');
  await run(clock, world, 3000);
  const replies = world.chat.slice(before + 1).filter(m => /\| HP \d+% MP \d+%/.test(m.text));
  ok(replies.length === 3, `'!status' answered in party chat by ${replies.length}/3: ${replies.map(r => `${r.from}: "${r.text}"`).join(' / ')}`);

  // ---- 3b. a field: the party is teleported to Timak Outpost (no town), monsters around; the leader orders '!hunthere 1500'
  const TIMAK = { x: 70969, y: 69956, z: -3691 };
  world.addMob('Timak Orc Soldier', 20585, 42, TIMAK.x + 500, TIMAK.y + 300, TIMAK.z); world.addMob('Timak Orc Warrior', 20586, 43, TIMAK.x - 400, TIMAK.y + 450, TIMAK.z);
  world.addMob('Timak Orc Soldier', 20585, 42, TIMAK.x + 200, TIMAK.y - 600, TIMAK.z); world.addMob('Timak Orc Warrior', 20586, 43, TIMAK.x + 900, TIMAK.y - 200, TIMAK.z);
  world.teleportAll(TIMAK.x, TIMAK.y, TIMAK.z);
  await run(clock, world, 6000);
  const callsBefore = world.calls.length, b3 = world.chat.length;
  world.partyChat('Crafter1', '!hunthere 1500');
  await run(clock, world, 45000);
  const hunt = world.chat.slice(b3).filter(m => /^\[hunt here\]/.test(m.text));
  ok(hunt.length >= 1, `'!hunthere' acknowledged by the leader: "${hunt.length ? hunt[0].text.slice(0, 90) : '-'}"`);
  const newCalls = world.calls.slice(callsBefore);
  const byWho = (n) => newCalls.filter(k => k.who === n).map(k => k.fn);
  const lc = byWho('Crafter1');
  ok(lc.some(f => /StartCombat|SetCombat|UseCombat|Send.Attack|Attack/.test(f)), `leader fights: ${Array.from(new Set(lc)).join(', ')}`);
  const mem = ['Spoiler1', 'Healer1'].map(n => world.chars.get(n));
  const memMoves = mem.map(c => byWho(c.name).filter(f => /MoveBackwardToLocation|GoToPoint|MoveToPoint|Send.Attack|^Attack$|Send.Action/.test(f)).length);
  ok(memMoves.every(n => n > 0), `members act on their own script orders (move / target / attack calls: ${mem.map((c, i) => `${c.name} ${memMoves[i]}`).join(', ')}; L2Swarm follow: ${mem.map(c => `${c.name}->${c.opts.FollowName || '-'}`).join(', ')})`);
  ok((world.kills || 0) >= 1, `monsters killed in the field: ${world.kills || 0}`);
  const dist = mem.map(c => Math.round(Math.hypot(c.me.X - L.me.X, c.me.Y - L.me.Y)));
  console.log(`   member calls: Spoiler1 [${Array.from(new Set(byWho('Spoiler1'))).join(', ')}] Healer1 [${Array.from(new Set(byWho('Healer1'))).join(', ')}]; distance to the leader ${dist.join(' / ')}`);

  // ---- 3b2. one agent loses its link (L2Swarm script hiccup / socket drop): the brain keeps that context, the agent reconnects to it
  const created0 = runner.st.created, disc0 = runner.st.disconnects, sp = world.chars.get('Spoiler1');
  for (const so of world.sockets) { if (!so.destroyed && so.localPort && so === sp.lastSock) so.destroy(); }
  await run(clock, world, 1000);
  const ctxSp = runner.ctxs.get('Spoiler1'), lostSeen = runner.st.disconnects > disc0;
  await run(clock, world, 6000);
  ok(lostSeen && runner.st.created === created0 && runner.ctxs.get('Spoiler1') === ctxSp && ctxSp.link.connected(), `agent link drop: context kept (not re-created), agent reconnected within 7 s (lost seen: ${lostSeen})`);

  // ---- 3c. back to town: '!town giran' (the leader clears / regroups, then .giran; L2Toggle takes the party along)
  const b4 = world.chat.length, t4 = clock.now();
  world.partyChat('Crafter1', '!town giran');
  for (let i = 0; i < 24 && !Array.from(world.chars.values()).every(c => Math.hypot(c.me.X - GIRAN.x, c.me.Y - GIRAN.y) < 3000); i++) await run(clock, world, 5000);
  const inGiran = Array.from(world.chars.values()).filter(c => Math.hypot(c.me.X - GIRAN.x, c.me.Y - GIRAN.y) < 3000).map(c => c.name);
  ok(inGiran.length === 3, `'!town giran': ${inGiran.length}/3 in Giran after ${Math.round((clock.now() - t4) / 1000)} s simulated (${world.towns || 0} .town commands; chat: ${world.chat.slice(b4 + 1).map(m => m.from + ': ' + m.text.slice(0, 60)).join(' / ') || '-'})`);

  // ---- 4. traffic
  rep = runner.report();
  const secs = (clock.now() - (rep.contexts.length ? clock.now() - 45000 : 0)) / 1000;
  console.log(`   state traffic: ${rep.st.stateMsgs} messages, ${Math.round(rep.st.stateBytes / 1024)} KB for 3 agents (~${Math.round(rep.st.stateBytes / 3 / 45 / 1024 * 10) / 10} KB/s per agent), events ${rep.st.events}`);
  const firstMissing = new Map(rep.missing);

  // ---- 5. brain restart: the old runner dies, a new one listens on the same port, the agents reconnect, swarm.js boots again
  const t0 = clock.now();
  await runner.stop('brain restart test');
  runner = CUR = mkRunner();
  await runner.start();
  await run(clock, world, 12000);
  rep = runner.report();
  ok(rep.contexts.length === 3 && rep.contexts.every(c => c.connected && c.booted), `after a brain restart all 3 agents reconnected and swarm.js booted again (${Math.round((clock.now() - t0) / 1000)} s simulated)`);
  await run(clock, world, 20000);
  for (let i = 0; i < 40 && world.chat.length && clock.now() - world.chat[world.chat.length - 1].at < 16000; i++) await run(clock, world, 1000);   // swarm.js's own chat throttle: one line / 15 s
  const before2 = world.chat.length;
  world.partyChat('Crafter1', '!status');
  await run(clock, world, 3000);
  const replies2 = world.chat.slice(before2 + 1).filter(m => /\| HP \d+% MP \d+%/.test(m.text));
  ok(replies2.length === 3, `'!status' answered again after the restart by ${replies2.length}/3`);

  // ---- report
  rep = runner.report();
  const missing = new Map(firstMissing); rep.missing.forEach((n, k) => missing.set(k, (missing.get(k) || 0) + n));
  console.log('\nHOST MEMBERS MISSING (name: count over both runs):');
  Array.from(missing.entries()).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`   ${k}: ${n}`));
  console.log('\nERRORS (where: count):');
  Array.from(rep.errors.entries()).slice(0, 40).forEach(([k, n]) => console.log(`   ${n} x ${k}`));
  console.log('\nHOST ACTIONS (top 40):');
  Array.from(rep.calls.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, n]) => console.log(`   ${k}: ${n}`));
  const out = { at: new Date().toISOString(), pass, fail, results, missing: Object.fromEntries(missing), errors: Object.fromEntries(rep.errors), calls: Object.fromEntries(rep.calls),
    st: rep.st, vfs: rep.vfs, bus: rep.bus, worldCalls: world.calls.length, chat: world.chat.slice(-40) };
  const outF = path.join(ROOT, 'docs', 'plan', 'new_engine', 'sim_last_run.json');
  fs.writeFileSync(outF, JSON.stringify(out, null, 1));
  console.log(`\n${pass} passed, ${fail} failed  (details: ${path.relative(ROOT, outF)}; overlay ${overlay})`);
  await runner.stop('end');
  for (const s of world.sockets) try { s.destroy(); } catch (e) { }
  for (const c of world.chars.values()) c.T.dispose();
  world.timers.dispose();
  return fail === 0;
}

// ================================================================== memory: N contexts, shared data off / on (one child process per run)
// loaded = every context also loads the big data a leveling / raiding swarm.js holds (gear db, npc strings, danger grid, raid templates,
// hunting spots, grocer spawns, dungeon rooms, field areas) through its own loader functions
const LOAD_ALL = "try { gearDb(); } catch (e) { } try { npcString(1); } catch (e) { } try { dangerAt(0, 0, 100, 0); } catch (e) { } try { raidTemplate('x'); } catch (e) { } try { huntingSpots(); } catch (e) { } try { grocerSpawns(); } catch (e) { } try { dungeonRooms(); } catch (e) { } try { fieldAreas(); } catch (e) { }";
async function memChild(n, shared, loaded) {
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(overlay);
  const port = 19500 + Math.floor(Math.random() * 400);
  const clock = new Clock({ virtual: true, start: Date.now() });
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'swarm.config.json'), 'utf8').replace(/^﻿/, ''));
  const names = Array.from(new Set((cfg.accounts || []).filter(a => a.character && a.enabled !== false).map(a => a.character))).slice(0, n);
  const runner = new Runner({ port, clock, overlay, isolate: ['Logs'], allow: names, logFile: path.join(tmp, 'brain_host.log'), root: ROOT.replace(/\//g, '\\'), sharedParse: shared });
  await runner.start();
  const world = new World(clock); world.sockets = new Set();
  world.addNpc('Clarissa', 30080, 83396, 147904, -3404, 'Gatekeeper'); world.addMob('Hatar Ratman', 20134, 42, 86200, 150500, -3400);
  const src = fs.readFileSync(AGENT2, 'utf8');
  names.forEach((nm, i) => world.addChar(nm, 57, 45, GIRAN.x + (i % 6) * 120, GIRAN.y + Math.floor(i / 6) * 120, { leader: i % 9 === 0 }));
  global.gc(); const base = process.memoryUsage();
  for (const c of world.chars.values()) world.startAgent(c, port, src);
  const cpu0 = process.cpuUsage(), w0 = Date.now();
  await run(clock, world, 20000, 250);
  if (loaded) for (const C of runner.ctxs.values()) { try { vm.runInContext(LOAD_ALL, C.ctx); } catch (e) { } }
  await run(clock, world, 70000, 250);
  const cpu = process.cpuUsage(cpu0), wall = Date.now() - w0;
  for (let i = 0; i < 3; i++) { global.gc(); await realTurn(20); }
  const m = process.memoryUsage();
  let mutated = 0; const mutatedFiles = []; for (const [t, e] of runner.shared) { if (require(path.join(BH, 'runner.js')).quickHash(e.obj) !== e.hash) { mutated++; for (const [k, c] of runner.vfs.cache) if (c.text === t || c.text.replace(/^﻿/, '') === t) mutatedFiles.push(path.basename(k)); } }
  const rep = runner.report();
  const res = { n: names.length, shared, loaded: !!loaded, cpuMsPerSimSec: +(((cpu.user + cpu.system) / 1000) / 90).toFixed(1), wallMs: wall, heapMB: +(m.heapUsed / 1048576).toFixed(1), baseHeapMB: +(base.heapUsed / 1048576).toFixed(1), rssMB: +(m.rss / 1048576).toFixed(1),
    perCtxMB: names.length ? +(((m.heapUsed - base.heapUsed) / 1048576) / names.length).toFixed(2) : 0, booted: rep.contexts.filter(c => c.booted).length, errors: rep.st.errors,
    sharedTexts: runner.shared.size, sharedMB: +(Array.from(runner.shared.values()).reduce((s, e) => s + e.len, 0) / 1048576).toFixed(1), sharedHits: Array.from(runner.shared.values()).reduce((s, e) => s + e.hits, 0), sharedMutated: mutated, mutatedFiles,
    vfsCachedMB: +(rep.vfs.bytesCached / 1048576).toFixed(1), vfsHits: rep.vfs.hits, vfsReads: rep.vfs.reads };
  process.stdout.write('MEMRESULT ' + JSON.stringify(res) + '\n');
  process.exit(0);
}
function memMain() {
  const rows = [];
  for (const [n, shared, loaded] of [[0, false], [3, false], [3, true], [12, false], [12, true], [30, false], [30, true], [12, false, 1], [12, true, 1], [30, false, 1], [30, true, 1]]) {
    const r = cp.spawnSync(process.execPath, ['--expose-gc', '--max-old-space-size=8192', __filename, '--mem-child', String(n), shared ? '1' : '0', loaded ? '1' : '0'], { encoding: 'utf8', timeout: 900000 });
    const line = (r.stdout || '').split('\n').find(l => l.startsWith('MEMRESULT '));
    if (!line) { console.log(`n=${n} shared=${shared}: no result`, (r.stderr || '').slice(-800)); continue; }
    const res = JSON.parse(line.slice(10)); rows.push(res);
    console.log(`n=${String(res.n).padStart(2)} shared=${res.shared ? 'on ' : 'off'} ${res.loaded ? 'big data loaded' : 'idle in town    '}  cpu ${res.cpuMsPerSimSec} ms per sim-second  heap ${res.heapMB} MB (base ${res.baseHeapMB})  rss ${res.rssMB} MB  per context ${res.perCtxMB} MB  booted ${res.booted}  errors ${res.errors}  ` +
      `shared texts ${res.sharedTexts} (${res.sharedMB} MB, ${res.sharedHits} hits, mutated ${res.sharedMutated})  vfs cache ${res.vfsCachedMB} MB (${res.vfsHits}/${res.vfsReads} hits)`);
  }
  fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'new_engine', 'sim_memory.json'), JSON.stringify({ at: new Date().toISOString(), node: process.version, rows }, null, 1));
}

module.exports = { HOSTLIKE, hostFn, World, Clock, makeDate, Runner, run, realTurn, mkTmp, GIRAN, ROOT, BH, AGENT2, setCur: (r) => { CUR = r; } };
if (require.main !== module) { /* imported by test_brain_host2.js */ }
else if (process.argv.includes('--mem-child')) { const i = process.argv.indexOf('--mem-child'); memChild(Number(process.argv[i + 1]), process.argv[i + 2] === '1', process.argv[i + 3] === '1').catch(e => { console.log('ERR', e); process.exit(1); }); }
else if (process.argv.includes('--mem')) memMain();
else scenario().then(okAll => process.exit(okAll ? 0 : 1), e => { console.log('ERROR', e && e.stack || e); process.exit(1); });
