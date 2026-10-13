// BRAIN HOST SIMULATOR, PHASE 2 (2026-10-12; docs/plan/new_engine/DESIGN.md §7b, §10, §11). Nothing live: no L2Swarm, no game, no real Logs.
// Same chain as test_brain_host.js (fake world -> agent (Scripts_dev/agent2.js = v3) -> TCP -> runner -> UNCHANGED Scripts_dev/swarm.js),
// with a fake game SERVER for the paths phase 1 did not exercise. Each path is driven by calling swarm.js's own function in the character's
// context (vm.runInContext) and the fake server answers the host calls the way L2Toggle does:
//   A gatekeeper      gkTeleport({text:"Breka's Stronghold"}) at Clarissa: Send.Action x2 -> OnNpcHtmlMessage (L2Toggle 'bypass -h 0x' +
//                     <fstring> links) -> Send.ReqBypassToServer('00') -> OnTeleportToLocation
//   B board buffs     buffSelf(): _bbshome -> Buffs -> Mystic -> Buff Me through OnCommunityBoardHtmlMessage (codes renumbered on every page)
//   C shop            buyAt(Helvetia, Soulshots) via BuyItem, then the hex buy fallback (0x40) when BuyItem is ignored, then a hex sell (0x37)
//   D warehouse       stashDepositAt (0x3B) + whTakeAt (0x3C) at Taurin's private warehouse (+ the live page layout's deposit-link bug)
//   E trade           giveItems Crafter1 -> Spoiler1 (fund pattern: swarm.fund.take -> receiveItems), TradeRequested / TradeStarted /
//                     TradeCompleted AppEvents, AddTradeItem / TradeDone, both contexts in the brain
//   F raid            the leaderMission body without travel: raidClearArea -> raidCountdown -> teamStep engage -> waitBossDead on
//                     Dread Avenger Kraven + 2 Dread Panthers; swarm.focus between contexts, Logs/raid_live_<leader>.json, raid report
//   G Kamaloka        enterKamaloka(kamaloka-46) at Captain Gosta (Heine): 3 dialog pages, instance teleport of the party, kamaloka_live file
//   H MIXED party     the leader's swarm.js runs "inside L2Swarm" (its own runner whose App bus is the fake L2Swarm bus), the members in the
//                     brain with --bridge; agents v3 relay App events both ways: swarm.pos both ways, teamStep acks, no duplicates, emitTo
// Usage: node docs/plan/tools/test_brain_host2.js            (A-H, exit 1 on failure)
//        node docs/plan/tools/test_brain_host2.js --pool     (worker pool: watchdog kill + restart, then CPU/memory 3 parties x 9, real time)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process'), net = require('net');
const T1 = require('./test_brain_host.js');
const { World, Clock, Runner, run, realTurn, mkTmp, GIRAN, ROOT } = T1;
const { AppBus } = require(path.join(ROOT, 'Dashboard', 'brain_host', 'appbus.js'));
const AGENT3 = path.join(ROOT, 'Scripts_dev', 'agent2.js');
// --script <file>: run another swarm.js (e.g. a copy with a patch applied); default the unchanged Scripts_dev/swarm.js
const SCRIPT = process.argv.includes('--script') ? path.resolve(process.argv[process.argv.indexOf('--script') + 1]) : path.join(ROOT, 'Scripts_dev', 'swarm.js');

let pass = 0, fail = 0; const results = [];
const ok = (cond, msg) => { const l = (cond ? '  ok   ' : '  FAIL ') + msg; results.push(l); if (cond) pass++; else fail++; console.log(l); };
const info = (msg) => { const l = '  info ' + msg; results.push(l); console.log(l); };
const le4 = (n) => { const b = Buffer.alloc(4); b.writeInt32LE(Number(n)); return b; };
const rd4 = (b, o) => b.readInt32LE(o), rd8 = (b, o) => Number(b.readBigInt64LE(o));

// ================================================================== the fake game SERVER on top of the phase-1 world
class World2 extends World {
  constructor(clock) {
    super(clock);
    this.log = []; this.whStore = new Map(); this.trade = null; this.ignoreBuyItem = false; this.liveWhCodes = false;
    this.onSend = (c, k, a) => this.send(c, k, a);
    this.onCall = (c, fn, a) => { if (fn === 'BuyItem') this.buy(c, Number(a[0]), Number(a[1]), 'BuyItem'); };
  }
  later(ms, f) { this.timers.setTimeout(f, ms); }
  item(c, id) { return c.inv.find(i => i.Id === Number(id)); }
  addItem(c, id, name, n, stack) {
    let it = stack !== false ? this.item(c, id) : null;
    if (it) it.Count += n; else { it = { objId: 0x30000000 + (this.oseq = (this.oseq || 0) + 1), Id: Number(id), Name: name, Count: n, IsEquiped: false, IsQuest: false, IsStackable: stack !== false, EnchantLvl: 0, Type: 'Etc', Grade: 'None' }; c.inv.push(it); }
    return it;
  }
  takeItem(c, objId, n) { const it = c.inv.find(i => i.objId === Number(objId)); if (!it) return null; const k = Math.min(n, it.Count); it.Count -= k; if (it.Count <= 0) c.inv.splice(c.inv.indexOf(it), 1); return { it, k }; }
  invUpd(c) { this.emit(c, 'OnInventoryUpdate'); }
  sys(c, id, text) { this.emit(c, 'OnSystemMessage', id, text); }
  html(c, h) { c.ui = 'npc'; c.html = h; this.emit(c, 'OnNpcHtmlMessage', h); }
  board(c, h) { c.ui = 'bbs'; this.emit(c, 'OnCommunityBoardHtmlMessage', h); }
  place(c, x, y, z) { c.move = null; c.me.X = x; c.me.Y = y; c.me.Z = z === undefined ? c.me.Z : z; }
  port(c, x, y, z, zone) { c.move = null; c.me.X = x; c.me.Y = y; c.me.Z = z; c.flags.CurrentZone = zone || 'GENERALZONE'; c.ports = (c.ports || 0) + 1; this.emit(c, 'OnTeleportToLocation', c.me.objId, x, y, z); }
  // ------------------------------------------------------------------ Send.* the server reacts to
  send(c, k, a) {
    switch (k) {
      case 'Action': {                                          // L2: the first click targets, a click on the current target opens the dialog
        const npc = this.npcs.find(n => n.objId === Number(a[0]));
        if (npc && npc.dialog && c.target === npc.objId) {
          if (Math.hypot(npc.X - c.me.X, npc.Y - c.me.Y) > 150) { this.later(100, () => this.sys(c, 162, 'Your target is out of range.')); break; }
          c.dlg = { npc, page: 'root' }; this.later(150, () => this.html(c, npc.dialog(c, null)));
        }
        break;                                                  // undefined: the base world still sets the target
      }
      case 'ReqBypassToServer': {
        const cmd = String(a[0]); this.log.push(`${c.name} bypass ${cmd}`);
        if (cmd === '_bbshome' || (c.ui === 'bbs' && /^\d+$/.test(cmd))) { this.bbs(c, cmd); return null; }
        if (c.dlg && c.dlg.npc.dialog) { const h = c.dlg.npc.dialog(c, cmd); if (typeof h === 'string') this.later(150, () => this.html(c, h)); }
        return null;
      }
      case 'SendHex': this.hex(c, String(a[0])); return null;
      case 'RequestBuySellUIClose': c.shop = null; return null;
      case 'TradeRequest': {
        const b = Array.from(this.chars.values()).find(o => o.me.objId === Number(a[0]));
        if (!b || b === c) return null;
        if (b.trade || c.trade) { this.later(100, () => this.sys(c, 142, `${b.name} is on another task. Please try again later.`)); return null; }
        this.tradeReq = { a: c, b, at: this.clock.now() }; this.later(100, () => this.appEvent(b, 'TradeRequested', { requestorObjId: c.me.objId, requestorName: c.name }));
        return null;
      }
      case 'AnswerTradeRequest': {
        const r = this.tradeReq; if (!r || r.b !== c || Number(a[0]) !== 1) return null;
        this.tradeReq = null; const T = this.trade = { a: r.a, b: c, items: new Map([[r.a, []], [c, []]]), done: new Set() }; r.a.trade = c.trade = T;
        this.later(100, () => { [r.a, c].forEach(x => { this.emit(x, 'OnWindowOpenTrade', null); this.appEvent(x, 'TradeStarted', {}); }); this.sys(r.a, 120, `You begin trading with ${c.name}.`); this.sys(c, 120, `You begin trading with ${r.a.name}.`); });
        return null;
      }
      case 'AddTradeItem': { const T = c.trade; if (T) T.items.get(c).push({ objId: Number(a[0]), count: Number(a[1]) }); return null; }
      case 'TradeDone': {
        const T = c.trade; if (!T) return null;
        if (Number(a[0]) !== 1) { this.endTrade(T, 'TradeCancelled'); return null; }
        T.done.add(c);
        if (T.done.size === 2) this.later(150, () => {
          for (const [from, list] of T.items) { const to = from === T.a ? T.b : T.a; list.forEach(({ objId, count }) => { const g = this.takeItem(from, objId, count); if (g) this.addItem(to, g.it.Id, g.it.Name, g.k, g.it.IsStackable); }); }
          this.trades = (this.trades || 0) + 1; this.invUpd(T.a); this.invUpd(T.b); this.endTrade(T, 'TradeCompleted');
        });
        return null;
      }
    }
    return undefined;
  }
  endTrade(T, ev) { T.a.trade = T.b.trade = null; if (this.trade === T) this.trade = null; [T.a, T.b].forEach(x => this.appEvent(x, ev, {})); }
  // ------------------------------------------------------------------ community board (codes renumbered per page, like L2Toggle)
  bbs(c, cmd) {
    const btn = (v, code) => `<button value="${v}" action="bypass ${code}" width=120 height=24 back="L2UI_CT1.Button_DF_Down" fore="L2UI_CT1.Button_DF">`;
    const page = (body) => `<html><body><center>${body}</center></body></html>`;
    let p = c.bbsPage;
    if (cmd === '_bbshome') p = c.bbsPage = { name: 'home', map: { 11: 'buffs', 12: 'career', 15: 'cabinet' } };
    else if (p && p.map[cmd]) p = c.bbsPage = { name: p.map[cmd] };
    else return;
    let h;
    switch (p.name) {
      case 'home': h = page(btn('Buffs', 11) + btn('Career', 12) + btn('Cabinet', 15)); break;
      case 'buffs': p.map = { 11: 'career', 14: 'warrior', 15: 'mystic', 16: 'defender' }; h = page(btn('Career', 11) + btn('Warrior', 14) + btn('Mystic', 15) + btn('Defender', 16) + btn('All Buffs', 17)); break;
      case 'warrior': case 'mystic': case 'defender': p.map = { 15: 'buffme:' + p.name, 16: 'buffparty:' + p.name }; h = page(`Scheme ${p.name}<br>` + btn('Buff Me', 15) + btn('Buff Party', 16)); break;
      default:
        if (/^buff(me|party):/.test(p.name)) {
          const ids = p.name.endsWith('mystic') ? [1059, 1085, 1303, 1078, 1062, 1040, 1035, 1352, 1353, 1389, 1259, 1204, 1036, 1045, 1048, 1182, 1191, 1189, 1392, 1393] : [1068, 1062, 1240, 1268, 1086, 1077, 1242, 1388, 1035, 1352, 1353, 1259, 1204, 1036, 1045, 1048, 271, 272, 264, 267];
          c.buffs = ids.map(id => ({ Id: id, Level: 3, Name: 'Buff ' + id, IsDebuff: false, AbnormalType: 'b' + id, RemainTime: 43200 }));
          this.bbsBuffs = (this.bbsBuffs || 0) + 1; p.map = {}; h = page('Buffs applied.');
        } else h = page('Not available.');
    }
    this.later(120, () => this.board(c, h));
  }
  // ------------------------------------------------------------------ shops + warehouse packets (hex as swarm.js sends them: no spaces, LE)
  buy(c, id, n, how) {
    const s = c.shop; if (!s) return false;
    if (how === 'BuyItem' && this.ignoreBuyItem) { this.log.push(`${c.name} BuyItem ${id} ignored (live L2Swarm behaviour on some shops)`); return false; }
    const row = s.list.find(r => r.Id === id); if (!row) return false;
    const ad = this.item(c, 57); const cost = row.Price * n;
    if (!ad || ad.Count < cost) { this.later(80, () => this.sys(c, 279, 'You do not have enough adena.')); return false; }
    ad.Count -= cost; this.addItem(c, id, row.Name, n); this.bought = (this.bought || []).concat([{ who: c.name, id, n, how }]); this.later(80, () => this.invUpd(c)); return true;
  }
  hex(c, h) {
    const b = Buffer.from(h, 'hex'); const op = b[0];
    if (op === 0x3A) return;                                         // Appearing
    this.log.push(`${c.name} hex ${h.slice(0, 2)} (${b.length} bytes)`);
    if (op === 0x40) { const n = rd4(b, 5); for (let i = 0; i < n; i++) this.buy(c, rd4(b, 9 + i * 12), rd8(b, 13 + i * 12), 'hex40'); return; }
    if (op === 0x37) {                                               // sell: shopId n [objId itemId count]
      const n = rd4(b, 5); for (let i = 0; i < n; i++) { const o = 9 + i * 16, g = this.takeItem(c, rd4(b, o), rd8(b, o + 8)); if (g) { this.item(c, 57).Count += Math.floor((g.it.Price || 10) / 2) * g.k; this.sold = (this.sold || []).concat([{ who: c.name, id: g.it.Id, n: g.k }]); } }
      this.later(80, () => this.invUpd(c)); return;
    }
    if (op === 0x3B) {                                               // deposit: n [objId count], 30 adena per item
      const n = rd4(b, 1), st = this.whStore.get(c.name) || []; let fee = 0;
      for (let i = 0; i < n; i++) { const o = 5 + i * 12, g = this.takeItem(c, rd4(b, o), rd8(b, o + 4)); if (!g) continue; fee += 30; const ex = g.it.IsStackable && st.find(w => w.Id === g.it.Id); if (ex) ex.Count += g.k; else st.push({ objId: 0x38000000 + st.length + 1 + (this.whSeq = (this.whSeq || 0) + 1), Id: g.it.Id, Name: g.it.Name, Count: g.k, IsStackable: g.it.IsStackable, EnchantLvl: 0 }); }
      this.whStore.set(c.name, st); this.item(c, 57).Count -= fee; this.deposits = (this.deposits || 0) + n; this.later(80, () => this.invUpd(c)); return;
    }
    if (op === 0x3C) {                                               // withdraw: n [whObjId count]
      const n = rd4(b, 1), st = this.whStore.get(c.name) || [];
      for (let i = 0; i < n; i++) { const o = 5 + i * 12, w = st.find(x => x.objId === rd4(b, o)), k = Math.min(rd8(b, o + 4), w ? w.Count : 0); if (!w || !k) continue; w.Count -= k; if (!w.Count) st.splice(st.indexOf(w), 1); this.addItem(c, w.Id, w.Name, k, w.IsStackable); }
      this.withdrawals = (this.withdrawals || 0) + n; this.later(80, () => this.invUpd(c)); return;
    }
  }
}
// NPC dialogs (L2Toggle style: '<a action="bypass -h 0x" msg="811;F;id"><fstring>id</fstring></a>' for gatekeepers, plain links elsewhere)
const link = (code, text) => `<a action="bypass -h ${code}">${text}</a><br>`;
function npcClarissa(world) {
  return (c, cmd) => {
    if (cmd === null) return `<html><body>&$556;<br><br><a action="bypass -h 00" msg="811;F;1010118"><fstring>1010118</fstring></a><br1><a action="bypass -h 01" msg="811;F;1010005"><fstring>1010005</fstring></a><br1><a action="bypass -h 02" msg="811;F;1010021"><fstring>1010021</fstring></a></body></html>`;
    if (cmd === '00') { world.later(1000, () => world.port(c, 85546, 131328, -3672)); return null; }      // Breka's Stronghold
    return null;
  };
}
function npcHelvetia(world) {
  const LIST = [{ Id: 1835, Name: 'Soulshot: No Grade', Price: 7 }, { Id: 1463, Name: 'Soulshot: D-grade', Price: 18 }, { Id: 3947, Name: 'Blessed Spiritshot: No Grade', Price: 35 }, { Id: 736, Name: 'Scroll of Escape', Price: 400 }, { Id: 1061, Name: 'Healing Potion', Price: 180 }];
  return (c, cmd) => {
    if (cmd === null) return '<html><body>Grocer Helvetia:<br>Welcome.<br>' + link('00', 'Buy/Sell/Refund General.') + link('01', 'Buy/Sell/Refund Dyes.') + link('02', 'Quest') + '</body></html>';
    // SHOPLIST (2026-10-13, live L2Swarm behaviour, Logs/shop_<name>.txt): OnShopList carries the SELL part = MY OWN items (sell prices);
    // the merchant's buy list is only in the BuyList global (the brain mirrored OnShopList as BuyList -> "not in Radia's list any more")
    if (cmd === '00') { c.shop = { shopId: 18, list: LIST }; c.buyList = LIST.map(x => Object.assign({}, x)); world.later(150, () => world.emit(c, 'OnShopList', 18, (c.inv || []).filter(i => i.Id !== 57).map(i => ({ Id: i.Id, Name: i.Name, Price: 1 })))); return null; }
    return null;
  };
}
function npcTaurin(world) {
  return (c, cmd) => {
    const P2 = world.liveWhCodes ? ['00', '01', '02', '03'] : ['10', '11', '12', '13'];
    if (cmd === null) return '<html><body>Warehouse Keeper Taurin:<br>' + link('00', 'Private Warehouse.') + link('01', 'Clan Warehouse.') + link('07', 'Quest') + '</body></html>';
    if (c.dlg.page === 'root' && cmd === '00') { c.dlg.page = 'private'; return '<html><body>Private Warehouse:<br>' + link(P2[0], 'Deposit an item. (Private Warehouse)') + link(P2[1], 'Withdraw an item. (Private Warehouse) (List all)') + link(P2[2], 'Withdraw an item. (Private Warehouse) (Select)') + link(P2[3], 'Return') + '</body></html>'; }
    if (c.dlg.page === 'private' && cmd === P2[0]) { world.later(150, () => world.emit(c, 'OnWareHouseDepositList', c.inv.filter(i => !i.IsEquiped && i.Id !== 57 && !i.IsQuest).map(i => Object.assign({}, i)))); return null; }
    if (c.dlg.page === 'private' && cmd === P2[1]) { world.later(150, () => world.emit(c, 'OnWareHouseWithdrawalList', (world.whStore.get(c.name) || []).map(i => Object.assign({}, i)))); return null; }
    if (cmd === P2[3]) { c.dlg.page = 'root'; return npcTaurin(world)(c, null); }
    return null;
  };
}
const KAMA_IN = { x: -81415, y: -206078, z: -8107 };
function npcGosta(world) {
  return (c, cmd) => {
    if (cmd === null) { c.dlg.page = 'root'; return '<html><body>Captain Gosta:<br>' + link('00', 'Ask about Kamaloka.') + link('01', 'Look at the list of Kamaloka.') + link('02', 'Enter Kamaloka.') + '</body></html>'; }
    if (c.dlg.page === 'root' && cmd === '02') { c.dlg.page = 'list'; return '<html><body>' + link('00', 'Enter Kamaloka, Hall of the Abyss (level 43).') + link('01', 'Enter Kamaloka, Hall of the Abyss (level 46).') + link('02', 'Enter Kamaloka, Labyrinth of the Abyss (level 49).') + '</body></html>'; }
    if (c.dlg.page === 'list' && cmd === '01') {                       // the instance takes the whole party (party leader entering)
      world.kamaEntered = (world.kamaEntered || 0) + 1;
      const who = Array.from(world.chars.values()).filter(o => o === c || Math.hypot(o.me.X - c.me.X, o.me.Y - c.me.Y) < 2000);
      world.later(1500, () => who.forEach((o, i) => world.port(o, KAMA_IN.x + i * 50, KAMA_IN.y, KAMA_IN.z)));
      return null;
    }
    return null;
  };
}
function addNpc(world, name, id, x, y, z, title, dialog) { world.addNpc(name, id, x, y, z, title); const n = world.npcs[world.npcs.length - 1]; n.dialog = dialog; n.Heading = 0; return n; }

// ================================================================== helpers
function ctxOf(runner, name) { const C = runner.ctxs.get(name); return C && C.ctx; }
/** run code inside a character's context; advance the virtual world until its promise settles */
async function callIn(runner, clock, world, name, code, maxMs, stepMs) {
  let done = false, res, err;
  let p; try { p = vm.runInContext(code, ctxOf(runner, name)); } catch (e) { return { err: e.message }; }
  Promise.resolve(p).then(v => { done = true; res = v; }, e => { done = true; err = e && (e.stack || e.message) || String(e); });
  const t0 = clock.now();
  while (!done && clock.now() - t0 < maxMs) await run(clock, world, stepMs || 500);
  return done ? (err ? { err } : { v: res }) : { timeout: true };
}
const inCtx = (runner, name, code) => { try { return vm.runInContext(code, ctxOf(runner, name)); } catch (e) { return 'ERR ' + e.message; } };
// the gatekeeper menu is client NpcString ids; Scripts/data/npc_strings.json is generated from YOUR L2Swarm's base.db (SETUP) and is not in
// the public package: then the sim reads the few strings it needs from its overlay
const seedStrings = (overlay) => { if (fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'npc_strings.json'))) return; const d = path.join(overlay, 'Scripts', 'data'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'npc_strings.json'), JSON.stringify({ 1010118: "Breka's Stronghold", 1010005: 'The Town of Gludio', 1010021: 'Giran Harbor' })); };
const readOv = (overlay, rel) => { try { return fs.readFileSync(path.join(overlay, rel), 'utf8'); } catch (e) { return null; } };
const sayAll = (world, from, text) => world.partyChat(from, text);

// ================================================================== A-G: one party, every context in the brain
async function scenarios() {
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(overlay); seedStrings(overlay);
  const port = 20094 + Math.floor(Math.random() * 400);
  const clock = new Clock({ virtual: true, start: Date.now() });
  const names = ['Crafter1', 'Spoiler1', 'Healer1'];
  const runner = new Runner({ port, clock, overlay, isolate: ['Logs'], allow: names, logFile: path.join(tmp, 'brain_host.log'), root: ROOT.replace(/\//g, '\\'), geopath: true, script: SCRIPT });
  T1.setCur(runner);
  await runner.start();
  console.log(`A-G: brain host on 127.0.0.1:${port}, overlay ${overlay}`);
  const world = new World2(clock); world.sockets = new Set();
  const NPC = {
    clarissa: addNpc(world, 'Clarissa', 30080, 83396, 147904, -3404, 'Gatekeeper', npcClarissa(world)),
    helvetia: addNpc(world, 'Helvetia', 30081, 81000, 149000, -3400, 'Grocer', npcHelvetia(world)),
    taurin: addNpc(world, 'Taurin', 30082, 83000, 148100, -3400, 'Warehouse Keeper', npcTaurin(world)),
    gosta: addNpc(world, 'Gosta', 30916, 108384, 221563, -3592, 'Captain', npcGosta(world)),
  };
  const L = world.addChar('Crafter1', 57, 45, GIRAN.x, GIRAN.y, { leader: true, skills: [[1216, 'Self Heal', 1, 'SELF'], [255, 'Power Smash', 10, 'ENEMY']] });
  const S = world.addChar('Spoiler1', 55, 44, GIRAN.x + 150, GIRAN.y + 60, { skills: [[254, 'Spoil', 5, 'ENEMY'], [42, 'Sweeper', 1, 'SELF']] });
  const H = world.addChar('Healer1', 30, 44, GIRAN.x - 120, GIRAN.y + 80, { skills: [[1011, 'Heal', 18, 'ONE'], [1015, 'Battle Heal', 15, 'ONE'], [1016, 'Resurrection', 3, 'ONE']] });
  const src = fs.readFileSync(AGENT3, 'utf8');
  for (const c of world.chars.values()) world.startAgent(c, port, src);
  const party = [L, S, H];
  const group = (x, y, z) => party.forEach((c, i) => world.place(c, x + (i % 3) * 40 - 40, y + 70, z));

  await run(clock, world, 12000);
  let rep = runner.report();
  ok(rep.contexts.length === 3 && rep.contexts.every(c => c.booted && c.connected), `boot: 3 contexts, agents v3 connected (${rep.contexts.map(c => c.name).join(', ')})`);
  sayAll(world, 'Crafter1', '!stop'); await run(clock, world, 4000);

  // ---- A. gatekeeper teleport (Spoiler1 alone, member: no team regroup)
  group(NPC.clarissa.X + 60, NPC.clarissa.Y - 30, -3404); await run(clock, world, 2000);
  const a0 = world.calls.length, xs = S.me.X;
  const A = await callIn(runner, clock, world, 'Spoiler1', `gkTeleport({ text: "Breka's Stronghold", noRegroup: true }, 'sim A')`, 60000);
  const aCalls = world.calls.slice(a0).filter(k => k.who === 'Spoiler1').map(k => k.fn + (k.fn === 'Send.ReqBypassToServer' ? '(' + k.args[0] + ')' : ''));
  ok(A.v === true && Math.hypot(S.me.X - 85546, S.me.Y - 131328) < 200, `A gatekeeper: gkTeleport -> ${JSON.stringify(A.v !== undefined ? A.v : A)} (gkFail '${inCtx(runner, 'Spoiler1', 'gkFail')}'), Spoiler1 at ${Math.round(S.me.X)},${Math.round(S.me.Y)}; calls ${Array.from(new Set(aCalls)).join(' ')}`);
  ok(!!readOv(overlay, 'Scripts\\data\\gk_live\\Clarissa.json') || !!readOv(overlay, path.join('Scripts', 'data', 'gk_live', 'Clarissa.json')), 'A gatekeeper: the live menu was recorded (Scripts/data/gk_live/Clarissa.json, overlay) with fstring texts resolved');
  try { const m = JSON.parse(readOv(overlay, path.join('Scripts', 'data', 'gk_live', 'Clarissa.json'))); info(`A Clarissa menu as recorded: ${JSON.stringify(m.links || m.menu || m).slice(0, 200)}`); } catch (e) { }

  // ---- B. community board buffs (Healer1, healer -> 'Mystic')
  group(GIRAN.x, GIRAN.y, GIRAN.z); await run(clock, world, 3000);
  H.buffs = H.buffs.slice(0, 3);
  await run(clock, world, 2000);
  const b0 = world.log.length;
  const B = await callIn(runner, clock, world, 'Healer1', `buffSelf('sim B')`, 60000);
  const bb = world.log.slice(b0).filter(l => /^Healer1 bypass/.test(l)).map(l => l.split(' ').pop());
  ok(B.v === true && H.buffs.length >= 18, `B board: buffSelf -> ${JSON.stringify(B.v !== undefined ? B.v : B)}, bypass path ${bb.join(' > ')}, buffs now ${H.buffs.length} (longBuffCount ${inCtx(runner, 'Healer1', 'longBuffCount()')})`);
  ok(!!readOv(overlay, path.join('Logs', 'bbs_Healer1.html')), 'B board: page saved to Logs/bbs_Healer1.html (overlay)');

  // ---- C. shop: BuyItem, hex buy fallback, hex sell
  group(NPC.helvetia.X + 60, NPC.helvetia.Y, -3400); await run(clock, world, 2000);
  const ad0 = L.inv.find(i => i.Id === 57).Count;
  const C1 = await callIn(runner, clock, world, 'Crafter1', `(async()=>{ state.gkBusy=true; try { const n=snapNpcs().find(x=>x.Name==='Helvetia').ref; return await buyAt(n,[{id:1835,name:'Soulshot: No Grade',count:500}],'sim C1',true); } finally { state.gkBusy=false; } })()`, 60000);
  const ss1 = (L.inv.find(i => i.Id === 1835) || {}).Count || 0;
  ok(C1.v && C1.v.ok && ss1 >= 500, `C shop (BuyItem): ${JSON.stringify(C1.v || C1).slice(0, 160)}; bag Soulshot: No Grade ${ss1}, adena ${ad0} -> ${L.inv.find(i => i.Id === 57).Count}`);
  world.ignoreBuyItem = true;
  const C2 = await callIn(runner, clock, world, 'Crafter1', `(async()=>{ state.gkBusy=true; try { const n=snapNpcs().find(x=>x.Name==='Helvetia').ref; return await buyAt(n,[{id:736,name:'Scroll of Escape',count:4}],'sim C2',true); } finally { state.gkBusy=false; } })()`, 60000);
  world.ignoreBuyItem = false;
  ok(C2.v && C2.v.ok && (world.bought || []).some(b => b.how === 'hex40' && b.id === 736), `C shop (hex 0x40 fallback when BuyItem is ignored): ${JSON.stringify(C2.v || C2).slice(0, 160)}; SoE ${(L.inv.find(i => i.Id === 736) || {}).Count}`);
  const ssObj = (L.inv.find(i => i.Id === 1835) || {}).objId;
  const C3 = await callIn(runner, clock, world, 'Crafter1', `(async()=>{ state.gkBusy=true; try { const n=snapNpcs().find(x=>x.Name==='Helvetia').ref; const sh=await openShop(n); if(!sh) return 'no shop'; sellPacket(sh.shopId,[{objId:${ssObj},id:1835,count:200}]); await sleep(2000); Send.RequestBuySellUIClose(); return { shopId: sh.shopId, left: num(ItemCount(1835)) }; } finally { state.gkBusy=false; } })()`, 60000);
  ok(C3.v && C3.v.shopId === 18 && (world.sold || []).some(s => s.id === 1835 && s.n === 200), `C shop (hex 0x37 sell): ${JSON.stringify(C3.v || C3)}; server sold ${JSON.stringify(world.sold || [])}`);
  ok(!!readOv(overlay, path.join('Logs', 'shop_Crafter1.txt')), 'C shop: OnShopList wrote Logs/shop_Crafter1.txt (overlay)');
  // SHOPLIST: the brain's BuyList = the merchant's list (agent sends L2Swarm's BuyList with OnShopList), not my own bag
  const C4 = await callIn(runner, clock, world, 'Crafter1', `(async()=>{ state.gkBusy=true; try { const n=snapNpcs().find(x=>x.Name==='Helvetia').ref; const sh=await openShop(n); const ids=[]; BuyList.forEach(i=>ids.push(num(i.Id))); Send.RequestBuySellUIClose(); return { ids, unknown: !!sh.listUnknown, p1463: sh.prices[1463] }; } finally { state.gkBusy=false; } })()`, 60000);
  ok(C4.v && C4.v.ids.includes(1463) && C4.v.ids.includes(3947) && !C4.v.unknown && C4.v.p1463 === 18, `C shop: the brain's BuyList is Helvetia's list, not my bag (${JSON.stringify(C4.v || C4)})`);

  // ---- D. warehouse: deposit 0x3B + withdraw 0x3C (private), then the live page layout
  group(NPC.taurin.X + 60, NPC.taurin.Y, -3400); await run(clock, world, 2000);
  const hp = L.inv.find(i => i.Id === 1061), hp0 = hp.Count;
  const D1 = await callIn(runner, clock, world, 'Crafter1', `(async()=>{ const n=snapNpcs().find(x=>x.Name==='Taurin').ref; return await stashDepositAt(n,[{objId:${hp.objId},id:1061,name:'Healing Potion',count:10,stackable:true,cat:'sim'}],'private'); })()`, 90000);
  const wh1 = world.whStore.get('Crafter1') || [];
  ok(wh1.some(w => w.Id === 1061 && w.Count === 10) && (L.inv.find(i => i.Id === 1061) || {}).Count === hp0 - 10, `D warehouse deposit (0x3B): ${JSON.stringify(D1.v ? { done: (D1.v.done || []).length, refused: (D1.v.refused || []).length, why: D1.v.why, link: D1.v.link } : D1).slice(0, 220)}; server store ${JSON.stringify(wh1.map(w => [w.Id, w.Count]))}`);
  const D2 = await callIn(runner, clock, world, 'Crafter1', `(async()=>{ const n=snapNpcs().find(x=>x.Name==='Taurin').ref; return await whTakeAt(n,'private',[{id:1061,count:4}]); })()`, 90000);
  ok((L.inv.find(i => i.Id === 1061) || {}).Count === hp0 - 6, `D warehouse withdraw (0x3C): ${JSON.stringify(D2.v ? { got: D2.v.got, missing: D2.v.missing, why: D2.v.why } : D2).slice(0, 220)}; bag Healing Potion ${(L.inv.find(i => i.Id === 1061) || {}).Count}`);
  world.liveWhCodes = true;
  const D3 = await callIn(runner, clock, world, 'Crafter1', `(async()=>{ const n=snapNpcs().find(x=>x.Name==='Taurin').ref; return await stashDepositAt(n,[{objId:${hp.objId},id:1061,name:'Healing Potion',count:1,stackable:true,cat:'sim'}],'private'); })()`, 90000);
  world.liveWhCodes = false;
  info(`D warehouse with the LIVE page codes (deposit link reuses code 00 of page 1): ${JSON.stringify(D3.v ? { done: (D3.v.done || []).length, why: D3.v.why } : D3).slice(0, 200)} — see the stashOpenList note in DESIGN.md §7b`);

  // ---- E. trade between two brain contexts: Crafter1 gives Spoiler1 100000 adena (fund pattern)
  world.place(S, L.me.X + 50, L.me.Y, L.me.Z); await run(clock, world, 2000);
  const sa0 = S.inv.find(i => i.Id === 57).Count, la0 = L.inv.find(i => i.Id === 57).Count;
  const E = await callIn(runner, clock, world, 'Crafter1', `(async()=>{ App.emitTo('acc-Spoiler1','swarm.fund.take',{giver:Me.Name,what:'100000 adena'}); await sleep(1500);
     return await giveItems({receiver:'Spoiler1', receiverObjId:${S.me.objId}, receiverAccountId:'acc-Spoiler1', items:[{adena:true,count:100000,name:'100000 adena'}], step:'fund'}); })()`, 90000);
  await run(clock, world, 3000);
  const sa1 = S.inv.find(i => i.Id === 57).Count, la1 = L.inv.find(i => i.Id === 57).Count;
  ok(E.v && E.v.ok && sa1 - sa0 === 100000 && la0 - la1 === 100000, `E trade: giveItems -> ${JSON.stringify(E.v || E)}; Spoiler1 adena +${sa1 - sa0}, Crafter1 -${la0 - la1}; receiver tradeState now ${inCtx(runner, 'Spoiler1', 'JSON.stringify(tradeState)')}`);
  const tr = world.calls.filter(k => /Trade/.test(k.fn)).map(k => `${k.who}:${k.fn.replace('Send.', '')}(${k.args.join(',')})`);
  info(`E trade packets: ${tr.join(' ')}`);

  // ---- F. raid: Dread Avenger Kraven + 2 Dread Panthers in the Sea of Spores (no travel)
  const BOSS = { x: 62416, y: 8096, z: -3376 };
  world.addMob('Dread Avenger Kraven', 25418, 44, BOSS.x, BOSS.y, BOSS.z); const boss = world.mobs[world.mobs.length - 1];
  Object.assign(boss, { HP: 12000, MaxHP: 12000, noRespawn: true });
  world.addMob('Dread Panther', 25419, 43, BOSS.x + 300, BOSS.y + 200, BOSS.z); world.addMob('Dread Panther', 25419, 43, BOSS.x - 250, BOSS.y + 250, BOSS.z);
  world.mobs.slice(-2).forEach(m => Object.assign(m, { HP: 2000, MaxHP: 2000, noRespawn: true }));
  ['Crafter1', 'Spoiler1'].forEach((n, i) => inCtx(runner, n, `CONFIG.roster[${JSON.stringify(n)}] = ${JSON.stringify(i ? 'melee' : 'tank')}; try { rkApplyRole('sim') } catch (e) { }`));
  party.forEach((c, i) => world.port(c, BOSS.x - 1500 + i * 40, BOSS.y - 100, BOSS.z));
  await run(clock, world, 8000);
  const f0 = runner.bus.st.delivered, chat0 = world.chat.length;
  const F = await callIn(runner, clock, world, 'Crafter1', `(async()=>{ const b=findBoss('Dread Avenger Kraven'), id='sim'+now(); regroupRun={id,reason:'mission raid sim'};
     Object.assign(missionBoss,{name:b.name,until:now()+3*3600e3}); App.emit('swarm.missionboss',{name:b.name});
     try { const clr=await raidClearArea(b,id); if(clr==='cursed'||clr==='absent') return 'clear: '+clr;
       if(clr!=='engaged' && !(await raidCountdown(b,id))) return 'countdown failed';
       raidReport.start(b,clr); raidActiveWrite(b.name,false,'fight');
       await teamStep(id,'engage',15000,{boss:{name:b.name,x:b.x,y:b.y,z:b.z},engaged:clr==='engaged'});
       EnableBot(); const out=await waitBossDead(b,id,CONFIG.mission.raidTimeoutMs); await raidMissionFinish(b,out); return out;
     } finally { regroupRun=null; } })()`, 400000, 500);
  const focusSeen = ['Spoiler1', 'Healer1'].map(n => `${n} raidCtl ${inCtx(runner, n, 'JSON.stringify({focus:raidCtl.focus,boss:raidCtl.bossId,tank:raidCtl.tank})')}`);
  const live = readOv(overlay, path.join('Logs', 'raid_live_Crafter1.json')); let lj = null; try { lj = JSON.parse(live); } catch (e) { }
  ok((F.v && /dead|killed/i.test(JSON.stringify(F.v))) || boss.IsDead, `F raid: outcome ${JSON.stringify(F.v !== undefined ? F.v : F).slice(0, 200)}; boss HP ${Math.round(boss.HP)} dead ${boss.IsDead}; panthers dead ${world.mobs.slice(-2).filter(m => m.IsDead).length}/2`);
  ok(!!lj && lj.boss && /Kraven/.test(String(lj.bossName || (lj.boss && lj.boss.name))), `F raid: Logs/raid_live_Crafter1.json written (keys ${lj ? Object.keys(lj).slice(0, 12).join(',') : '-'})`);
  ok(['Spoiler1', 'Healer1'].every(n => Number(inCtx(runner, n, 'raidCtl.bossId')) === boss.objId || Number(inCtx(runner, n, 'raidCtl.focus')) > 0), `F raid: swarm.focus reached the members' contexts (${focusSeen.join(' | ')}; bus delivered ${runner.bus.st.delivered - f0})`);
  const reps = (() => { try { return fs.readdirSync(path.join(overlay, 'Logs', 'raid_reports')); } catch (e) { return []; } })();
  ok(reps.some(f => /Kraven/.test(f)), `F raid: report written (Logs/raid_reports: ${reps.join(', ') || '-'}); chat: ${world.chat.slice(chat0).map(m => m.text.slice(0, 50)).filter(t => /raid|mission|GO|in \d/.test(t)).slice(0, 8).join(' / ')}`);
  ['Crafter1', 'Spoiler1'].forEach(n => inCtx(runner, n, `CONFIG.roster[${JSON.stringify(n)}] = ${JSON.stringify(n === 'Crafter1' ? 'crafter' : 'spoiler')}; try { rkApplyRole('sim') } catch (e) { }`));
  sayAll(world, 'Crafter1', '!stop'); await run(clock, world, 3000);

  // ---- G. Kamaloka entry at Captain Gosta (Heine), Hall of the Abyss level 46
  party.forEach((c, i) => world.port(c, NPC.gosta.X + 60 + i * 30, NPC.gosta.Y + 40, NPC.gosta.Z, 'PEACEZONE'));
  await run(clock, world, 12000);
  const G = await callIn(runner, clock, world, 'Crafter1', `(async()=>{ const k=kamalokas().find(x=>x.id==='kamaloka-46'), id='simK'+now(); regroupRun={id,reason:'mission kamaloka sim'};
     try { kamaLiveStart(k); kamaPhase('entering','talking to Captain Gosta'); const en=await enterKamaloka(k); if(en.ok) kamaPhase('inside','inside the instance'); await sleep(3000); return en; } finally { regroupRun=null; } })()`, 120000);
  const inside = party.filter(c => Math.hypot(c.me.X - KAMA_IN.x, c.me.Y - KAMA_IN.y) < 1000).map(c => c.name);
  let kl = null; try { kl = JSON.parse(readOv(overlay, path.join('Logs', 'kamaloka_live_Crafter1.json'))); } catch (e) { }
  ok(G.v && G.v.ok && inside.length === 3, `G Kamaloka: enterKamaloka -> ${JSON.stringify(G.v || G).slice(0, 160)}; inside ${inside.join(', ')}`);
  ok(!!kl && /inside|entering/.test(String(kl.phase)) && /Bunei|46|Abyss/i.test(JSON.stringify([kl.name, kl.boss, kl.id])), `G Kamaloka: Logs/kamaloka_live_Crafter1.json phase '${kl && kl.phase}', inside ${kl && kl.inside}, name '${kl && kl.name}'`);

  // ---- report
  rep = runner.report();
  const missing = Array.from(rep.missing.entries()).sort((a, b) => b[1] - a[1]);
  console.log('\nHOST MEMBERS MISSING (A-G):'); missing.forEach(([k, n]) => console.log(`   ${k}: ${n}`));
  console.log('\nERRORS (A-G):'); Array.from(rep.errors.entries()).slice(0, 30).forEach(([k, n]) => console.log(`   ${n} x ${k}`));
  const out = { missing: Object.fromEntries(missing), errors: Object.fromEntries(rep.errors), calls: Object.fromEntries(rep.calls), st: rep.st, bus: rep.bus, worldLog: world.log.slice(-80), chat: world.chat.slice(-60).map(m => `${m.from}: ${m.text}`) };
  await runner.stop('end');
  for (const s of world.sockets) try { s.destroy(); } catch (e) { }
  for (const c of world.chars.values()) c.T.dispose();
  world.timers.dispose();
  return out;
}

// ================================================================== H: MIXED party (leader in "L2Swarm", members in the brain + bridge)
async function mixed() {
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(overlay); seedStrings(overlay);
  const portL = 20600 + Math.floor(Math.random() * 300), portB = portL + 400;
  const clock = new Clock({ virtual: true, start: Date.now() });
  // the fake L2Swarm App bus: the leader's swarm.js (a runner whose contexts use this bus = "running inside L2Swarm") + the members' agents
  const l2bus = new AppBus({ log: (m) => console.log('l2bus', m) });
  const common = { clock, overlay, isolate: ['Logs'], root: ROOT.replace(/\//g, '\\') };
  const runL = new Runner(Object.assign({ port: portL, allow: ['Crafter1'], bus: l2bus, logFile: path.join(tmp, 'l2swarm_side.log') }, common));
  const runB = new Runner(Object.assign({ port: portB, allow: ['Spoiler1', 'Healer1'], bridge: true, logFile: path.join(tmp, 'brain_host.log'), geopath: true }, common));
  await runL.start(); await runB.start(); T1.setCur(runB);
  console.log(`H: "L2Swarm" leader runner :${portL}, brain :${portB} (--bridge), overlay ${overlay}`);
  const world = new World2(clock); world.sockets = new Set();
  world.appFor = (c) => {                                    // members' agents run inside L2Swarm: L2Swarm's App (the shared fake bus)
    if (c.name === 'Crafter1') return { self: () => ({ accountId: 'acc-Crafter1', characterName: 'Crafter1' }) };
    const acc = 'acc-' + c.name; l2bus.join({ accountId: acc, name: c.name, scriptId: 'agent2-' + c.name, scriptName: 'agent2.js', connected: () => true, parse: JSON.parse });
    return l2bus.api(acc);
  };
  const L = world.addChar('Crafter1', 57, 45, GIRAN.x, GIRAN.y, { leader: true, skills: [[1216, 'Self Heal', 1, 'SELF']] });
  const S = world.addChar('Spoiler1', 55, 44, GIRAN.x + 150, GIRAN.y + 60, { skills: [[254, 'Spoil', 5, 'ENEMY']] });
  const H = world.addChar('Healer1', 30, 44, GIRAN.x - 120, GIRAN.y + 80, { skills: [[1011, 'Heal', 18, 'ONE']] });
  const src3 = fs.readFileSync(AGENT3, 'utf8');
  world.startAgent(L, portL, src3); world.startAgent(S, portB, src3); world.startAgent(H, portB, src3);
  const tick = async (ms) => { const t0 = clock.now(); while (clock.now() - t0 < ms) { await runL.idle(5000); await run(clock, world, 250, 250); } };
  await tick(14000);
  const cL = runL.report().contexts, cB = runB.report().contexts;
  ok(cL.length === 1 && cL[0].booted && cB.length === 2 && cB.every(c => c.booted && c.connected), `H boot: leader in the L2Swarm-side runner, ${cB.map(c => c.name).join(' + ')} in the brain`);
  await tick(8000);
  const lp = inCtxR(runL, 'Crafter1', 'JSON.stringify(Object.keys(livePos))'), mp = ['Spoiler1', 'Healer1'].map(n => inCtxR(runB, n, 'JSON.stringify(Object.keys(livePos))'));
  ok(/Spoiler1/.test(lp) && /Healer1/.test(lp), `H swarm.pos brain -> L2Swarm: the leader's livePos ${lp} (bridge out ${runB.st.bridgeOut})`);
  ok(mp.every(x => /Crafter1/.test(x)), `H swarm.pos L2Swarm -> brain: members' livePos ${mp.join(' / ')} (bridge in ${runB.st.bridgeIn}, loop drops ${runB.st.bridgeLoopDrops})`);
  // duplicate check with test listeners on an event every side relays (swarm.calm)
  const listen = (r, n) => inCtxR(r, n, `globalThis.__calm = []; App.on('swarm.calm', (e) => __calm.push(e.source.characterName)); 1`);
  listen(runL, 'Crafter1'); listen(runB, 'Spoiler1'); listen(runB, 'Healer1');
  await tick(1000);
  inCtxR(runL, 'Crafter1', `App.emit('swarm.calm', { why: 'sim H1' })`); await tick(2000);
  inCtxR(runB, 'Spoiler1', `App.emit('swarm.calm', { why: 'sim H2' })`); await tick(2000);
  inCtxR(runB, 'Healer1', `App.emitTo('acc-Crafter1', 'swarm.calm', { why: 'sim H3' })`); await tick(2000);
  inCtxR(runL, 'Crafter1', `App.emitTo('acc-Healer1', 'swarm.calm', { why: 'sim H4' })`); await tick(2000);
  const got = { Crafter1: inCtxR(runL, 'Crafter1', 'JSON.stringify(__calm)'), Spoiler1: inCtxR(runB, 'Spoiler1', 'JSON.stringify(__calm)'), Healer1: inCtxR(runB, 'Healer1', 'JSON.stringify(__calm)') };
  ok(got.Crafter1 === '["Spoiler1","Healer1"]' && got.Spoiler1 === '["Crafter1"]' && got.Healer1 === '["Crafter1","Spoiler1","Crafter1"]',
    `H exactly-once with the right source: L2Swarm broadcast, brain broadcast, brain emitTo L2Swarm, L2Swarm emitTo brain -> received ${JSON.stringify(got)}`);
  // functional: the leader (L2Swarm) runs a team step; the brain members must answer it through the bridge
  const st = await callInR(runL, clock, world, 'Crafter1', `(async()=>{ const id='simH'+now(); regroupRun={id,reason:'sim H'}; try { const r = await teamStep(id,'fight',15000); return { got: Object.keys(r.got), missing: r.missing }; } finally { regroupRun=null; } })()`, 30000, async (ms) => tick(ms));
  ok(st.v && st.v.missing && st.v.missing.length === 0 && st.v.got.length === 3, `H team step from the L2Swarm leader answered by the brain members: ${JSON.stringify(st.v || st)}`);
  ok(runB.st.errors === 0 && runL.st.errors === 0, `H no errors (brain ${runB.st.errors}, L2Swarm side ${runL.st.errors}); bridge out ${runB.st.bridgeOut} / in ${runB.st.bridgeIn} / loop drops ${runB.st.bridgeLoopDrops} / no agent ${runB.st.bridgeNoAgent}`);
  const out = { bridge: { out: runB.st.bridgeOut, in: runB.st.bridgeIn, loopDrops: runB.st.bridgeLoopDrops }, missing: Object.fromEntries(runB.report().missing), errors: Object.fromEntries(runB.report().errors) };
  await runL.stop('end'); await runB.stop('end');
  for (const s of world.sockets) try { s.destroy(); } catch (e) { }
  for (const c of world.chars.values()) c.T.dispose();
  world.timers.dispose();
  return out;
}
function inCtxR(runner, name, code) { return inCtx(runner, name, code); }
async function callInR(runner, clock, world, name, code, maxMs, tick) {
  let done = false, res, err; const p = vm.runInContext(code, ctxOf(runner, name));
  Promise.resolve(p).then(v => { done = true; res = v; }, e => { done = true; err = e && e.message; });
  const t0 = clock.now(); while (!done && clock.now() - t0 < maxMs) await tick(500);
  return done ? (err ? { err } : { v: res }) : { timeout: true };
}

// ================================================================== --pool: worker threads, watchdog, CPU / memory (REAL time)
function forkPool(port, args) {
  const ch = cp.fork(path.join(ROOT, 'Dashboard', 'brain_host', 'pool.js'), ['--port', String(port)].concat(args), { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  let seq = 0; const waits = new Map();
  ch.on('message', (m) => { const f = waits.get(m.id); if (f) { waits.delete(m.id); f(m.v); } if (m.k === 'listening' && ch.onListen) ch.onListen(); });
  const ask = (m) => new Promise(r => { const id = ++seq; waits.set(id, r); ch.send(Object.assign({ id }, m)); setTimeout(() => { if (waits.has(id)) { waits.delete(id); r(null); } }, 15000); });
  return { ch, listening: new Promise(r => { ch.onListen = r; }), stats: () => ask({ k: 'stats' }), st: () => ask({ k: 'st' }), eval: (name, code) => ask({ k: 'eval', name, code }), stop: () => { try { ch.send({ k: 'stop' }); } catch (e) { } return new Promise(r => { ch.on('exit', r); setTimeout(r, 5000); }); } };
}
/** the fake world in THIS process (real clock), its agents on `port`; returns { world, clock, tick } */
function realWorld(port, charsByParty) {
  const clock = new Clock({ virtual: false });
  const world = new World2(clock); world.sockets = new Set();
  addNpc(world, 'Clarissa', 30080, 83396, 147904, -3404, 'Gatekeeper', npcClarissa(world));
  const src = fs.readFileSync(AGENT3, 'utf8');
  let i = 0;
  for (const [party, list] of Object.entries(charsByParty)) list.forEach((n, j) => { world.addChar(n, 57, 45, GIRAN.x + (i % 8) * 90, GIRAN.y + Math.floor(i / 8) * 90, { leader: j === 0 }); i++; });
  // the base world's party() lists every character; keep each party to its own members
  const partyOf = new Map(); for (const [p, list] of Object.entries(charsByParty)) list.forEach(n => partyOf.set(n, p));
  world.party = function (c) { return Array.from(this.chars.values()).filter(o => o !== c && partyOf.get(o.name) === partyOf.get(c.name)).map(o => ({ objId: o.me.objId, Name: o.name, ClassId: o.me.ClassId, Level: o.me.Level, HP: o.me.HP, MaxHP: o.me.MaxHP, HpPercent: o.me.HpPercent, MP: o.me.MP, MaxMP: o.me.MaxMP, MpPercent: o.me.MpPercent, CP: o.me.CP, MaxCP: o.me.MaxCP, IsDead: o.me.IsDead, X: o.me.X, Y: o.me.Y, Z: o.me.Z, IsLeader: o.flags.IsPartyLeader })); };
  world.partyChat = function (from, text) { this.chat.push({ at: this.clock.now(), from, text }); for (const c of this.chars.values()) if (partyOf.get(c.name) === partyOf.get(from)) this.emit(c, 'OnSay', from, text, 3); };
  const start = () => { for (const c of world.chars.values()) world.startAgent(c, port, src); };
  const iv = setInterval(() => { world.step(100); world.combatStep(100); }, 100);
  return { world, clock, start, stop: () => { clearInterval(iv); for (const s of world.sockets) try { s.destroy(); } catch (e) { } for (const c of world.chars.values()) c.T.dispose(); world.timers.dispose(); } };
}
const sleepR = (ms) => new Promise(r => setTimeout(r, ms));
function partiesFromConfig(names) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'swarm.config.json'), 'utf8').replace(/^﻿/, ''));
  const out = {}; names.forEach(p => { out[p] = Array.from(new Set((cfg.accounts || []).filter(a => a.party === p && a.character).map(a => a.character))); }); return out;
}
/** swarm.js answers at most one party-chat line per 15 s: wait until none of these characters spoke for 16 s (like test_brain_host.js) */
async function waitQuiet(world, names, maxMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (maxMs || 60000)) { const last = world.chat.filter(m => names.includes(m.from)).map(m => m.at); if (!last.length || Date.now() - Math.max(...last) > 16000) return; await sleepR(500); }
}
async function statusRound(world, leaders, waitMs, quietNames) {
  if (quietNames) await waitQuiet(world, quietNames);
  const before = world.chat.length; leaders.forEach(l => world.partyChat(l, '!status')); await sleepR(waitMs);
  const rep = {}; world.chat.slice(before).filter(m => /\| HP \d+% MP \d+%/.test(m.text)).forEach(m => { rep[m.from] = 1; }); return rep;
}
async function poolMain() {
  // ---- P1. watchdog: 3 parties, one context runs an endless synchronous loop; the other parties keep working; the party is restarted
  {
    const parties = partiesFromConfig(['Spoiler6', 'Spoiler2', 'Crafter1']);   // small real parties (2 + 2 + 3)
    const all = [].concat(...Object.values(parties)), port = 21100 + Math.floor(Math.random() * 300);
    const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(overlay); seedStrings(overlay);
    const P = forkPool(port, ['--allow', all.join(','), '--overlay', overlay, '--log', path.join(tmp, 'pool.log'), '--stall-ms', '4000', '--test-eval']);
    await P.listening;
    const W = realWorld(port, parties); W.start();
    console.log(`P1: pool :${port} parties ${Object.entries(parties).map(([p, l]) => p + '(' + l.length + ')').join(' ')}, log ${path.join(tmp, 'pool.log')}`);
    await sleepR(20000);
    let s = await P.stats();
    ok(s && s.workers.length === 3 && s.workers.every(w => w.contexts.every(c => c.booted && c.connected)), `P1 pool: 3 workers (one per party) with ${s ? s.workers.map(w => w.party + ':' + w.contexts.length).join(' ') : '-'} contexts, all booted + connected`);
    const r0 = await statusRound(W.world, Object.values(parties).map(l => l[0]), 4000, all);
    ok(all.every(n => r0[n]), `P1 '!status' answered by ${Object.keys(r0).length}/${all.length} before the fault`);
    await waitQuiet(W.world, all);
    const t0 = Date.now();
    P.eval('Crafter1', `setTimeout(function runaway() { const t = Date.now(); for (;;) { if (Date.now() - t > 600000) break; } }, 10); 'armed'`);
    await sleepR(1200);
    // while party Crafter1's worker is stuck: the other workers' contexts still run timers (sleep) and get their party's App events
    // (a second '!status' cannot be used: swarm.js's chat throttle drops the same text for 5 min)
    const probe = `(async () => { const t0 = Date.now(); await sleep(300); const lead = CONFIG.leader; return { slept: Date.now() - t0, lead, posAgeMs: livePos[lead] ? now() - livePos[lead].at : -1 }; })()`;
    const r1 = await Promise.all(['Healer6', 'Healer2'].map(n => P.eval(n, probe)));
    const stuckNow = (await P.st()).watchdogKills === 0;
    ok(stuckNow && r1.every(r => r && r.ok && r.v.slept < 1500 && r.v.posAgeMs >= 0 && r.v.posAgeMs < 4500), `P1 while party Crafter1's worker is stuck in an endless loop (not killed yet: ${stuckNow}), the other parties run on: ${JSON.stringify(r1.map(r => r && r.v))}`);
    await sleepR(8000);
    s = await P.stats();
    const log = fs.readFileSync(path.join(tmp, 'pool.log'), 'utf8');
    const wd = log.split(/\r?\n/).find(l => /WATCHDOG party Crafter1/.test(l)) || '';
    ok(s.st.watchdogKills >= 1 && /context Crafter1 inside a callback/.test(wd), `P1 watchdog killed the stuck worker after ${s.st.watchdogKills ? '' : 'NO '}stall: "${wd.replace(/^\S+ \[pool\] /, '').slice(0, 170)}"`);
    await sleepR(16000);
    s = await P.stats();
    const fw = s.workers.find(w => w.party === 'Crafter1');
    ok(fw && fw.contexts.length === 3 && fw.contexts.every(c => c.booted && c.connected), `P1 party Crafter1 restarted in a fresh worker (${Math.round((Date.now() - t0) / 1000)} s after the fault): ${fw ? fw.contexts.map(c => c.name + (c.connected ? '' : ' (not connected)')).join(', ') : 'no worker'}; agents did not reconnect (their sockets stayed in main)`);
    const r2 = await statusRound(W.world, ['Crafter1'], 4000, parties.Crafter1);
    ok(['Crafter1', 'Spoiler1', 'Healer1'].every(n => r2[n]), `P1 party Crafter1 answers '!status' again after the restart: ${Object.keys(r2).join(', ')}`);
    W.stop(); await P.stop();
  }
  // ---- P2. CPU / memory: 3 parties x 9 characters, real time; pool (3 workers) vs the single-process runner
  const parties = partiesFromConfig(['Tank1', 'Tank2', 'Char1']);
  const all = [].concat(...Object.values(parties));
  const measure = async (mode) => {
    const port = 21500 + Math.floor(Math.random() * 300), tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(overlay); seedStrings(overlay);
    let P;
    if (mode === 'pool') P = forkPool(port, ['--allow', all.join(','), '--overlay', overlay, '--log', path.join(tmp, 'pool.log')]);
    else P = forkRunner(port, all, overlay, path.join(tmp, 'runner.log'));
    await P.listening;
    const W = realWorld(port, parties); W.start();
    await sleepR(30000);                                                      // boot + settle
    const a = await P.stats(); const t0 = Date.now();
    const leaders = Object.values(parties).map(l => l[0]);
    for (let k = 0; k < 4; k++) { await statusRound(W.world, leaders, 1000); await sleepR(14000); }   // ~60 s with some chat work (answers are not checked here)
    const b = await P.stats(); const sec = (Date.now() - t0) / 1000;
    const cpuMs = ((b.cpu.user - a.cpu.user) + (b.cpu.system - a.cpu.system)) / 1000;
    const res = { mode, chars: all.length, parties: Object.keys(parties).length, seconds: Math.round(sec), cpuPctOfOneCore: +(cpuMs / sec / 10).toFixed(1), cpuMsPerCharPerSec: +(cpuMs / sec / all.length).toFixed(2),
      rssMB: +(b.mem.rss / 1048576).toFixed(0), heapMB: b.workers ? +(b.workers.reduce((s, w) => s + w.heapUsed, 0) / 1048576 + b.mem.heapUsed / 1048576).toFixed(0) : +(b.mem.heapUsed / 1048576).toFixed(0),
      perWorker: b.workers ? b.workers.map(w => ({ party: w.party, ctx: w.contexts.length, heapMB: +(w.heapUsed / 1048576).toFixed(0), elu: +(w.elu * 100).toFixed(1) })) : null,
      booted: b.workers ? b.workers.reduce((s, w) => s + w.contexts.filter(c => c.booted && c.connected).length, 0) : b.booted, errors: b.workers ? b.workers.reduce((s, w) => s + w.st.errors, 0) : b.errors };
    W.stop(); await P.stop();
    return res;
  };
  const m1 = await measure('pool'); console.log('   ', JSON.stringify(m1));
  const m2 = await measure('single'); console.log('   ', JSON.stringify(m2));
  ok(m1.booted === all.length && m2.booted === all.length, `P2 ${all.length} characters booted + connected in both modes (pool ${m1.booted}, single ${m2.booted})`);
  info(`P2 pool (3 workers): CPU ${m1.cpuPctOfOneCore} % of one core (${m1.cpuMsPerCharPerSec} ms per character per second), RSS ${m1.rssMB} MB, heap ${m1.heapMB} MB (${(m1.perWorker || []).map(w => `${w.party} ${w.ctx} ctx ${w.heapMB} MB ELU ${w.elu} %`).join('; ')})`);
  info(`P2 single process: CPU ${m2.cpuPctOfOneCore} % of one core (${m2.cpuMsPerCharPerSec} ms per character per second), RSS ${m2.rssMB} MB, heap ${m2.heapMB} MB`);
  return { pool: m1, single: m2 };
}
function forkRunner(port, allow, overlay, logFile) {
  // the single-process runner as a child, with a tiny IPC stats shim (same numbers as the pool's)
  const code = `const { Runner } = require(${JSON.stringify(path.join(ROOT, 'Dashboard', 'brain_host', 'runner.js'))});
    const r = new Runner({ port: ${port}, allow: ${JSON.stringify(allow)}, overlay: ${JSON.stringify(overlay)}, isolate: ['Logs'], logFile: ${JSON.stringify(logFile)} });
    r.start().then(() => process.send({ k: 'listening' }));
    process.on('message', async (m) => { if (m.k === 'stats') { const rep = r.report(); process.send({ id: m.id, v: { cpu: process.cpuUsage(), mem: process.memoryUsage(), booted: rep.contexts.filter(c => c.booted && c.connected).length, errors: rep.st.errors } }); } else if (m.k === 'stop') { await r.stop('end'); process.exit(0); } });`;
  const f = path.join(mkTmp(), 'single.js'); fs.writeFileSync(f, code);
  const ch = cp.fork(f, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  let seq = 0; const waits = new Map(); let onL;
  ch.on('message', (m) => { if (m.k === 'listening' && onL) onL(); const w = waits.get(m.id); if (w) { waits.delete(m.id); w(m.v); } });
  return { listening: new Promise(r => { onL = r; }), stats: () => new Promise(r => { const id = ++seq; waits.set(id, r); ch.send({ k: 'stats', id }); }), stop: () => { try { ch.send({ k: 'stop' }); } catch (e) { } return new Promise(r => { ch.on('exit', r); setTimeout(r, 5000); }); } };
}

// ================================================================== main
(async () => {
  const t0 = Date.now(); let out = {};
  if (process.argv.includes('--pool')) out.pool = await poolMain();
  else {
    if (!process.argv.includes('--only-mixed')) out.ag = await scenarios();
    if (!process.argv.includes('--only-ag')) out.h = await mixed();
  }
  const f = path.join(ROOT, 'docs', 'plan', 'new_engine', process.argv.includes('--pool') ? 'sim_pool_last_run.json' : 'sim2_last_run.json');
  fs.writeFileSync(f, JSON.stringify(Object.assign({ at: new Date().toISOString(), pass, fail, results, wallS: Math.round((Date.now() - t0) / 1000) }, out), null, 1));
  console.log(`\n${pass} passed, ${fail} failed (${Math.round((Date.now() - t0) / 1000)} s; details ${path.relative(ROOT, f)})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e && e.stack || e); process.exit(1); });
