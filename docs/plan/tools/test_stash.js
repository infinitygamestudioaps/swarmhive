// OFFLINE TEST of the WAREHOUSE STASH (user 2026-10-09 16:05: "warehouse deposit for Dagger1's materials (185 stacks that fill his bag)"):
//   node docs/plan/tools/test_stash.js          (exit code 1 when a check fails; never talks to the game)
// 1) Packet bytes: stashHex = SendWareHouseDepositList 0x3B d(count) n x [d(objectId) q(count)] little-endian, same encoding as the shop
//    packets' leHex; checked against L2Swarm's own packet table (Data/base.db -> PacketsGSClient / PacketsGSServer) and system messages.
// 2) Classification with the REAL data (Scripts/data/stash_items.json, stash_rules.json, sell_list.json, gear_items.json) on Dagger1's
//    real bag list (Logs/shop_Dagger1.txt = the sell list the grocer showed him) + the crafter Crafter1.
// 3) Link choice, order, slots, verdicts, record.
// 4) FLOW with a mock server (the impure stashOpenList / stashDepositAt of Scripts_dev/swarm.js): batches, the server's deposit list,
//    a silently refused item (single retries), a full warehouse (1036), not enough adena (279), the fee, Logs/stash_<name>.json.
// 5) Source checks: CONFIG.stash, supply-run step + team step, commands, swarm_state field, data files, the Giran route to Taurin.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, ''));
const blk = (s, b, e) => { const i = s.indexOf(b), j = s.indexOf(e, i); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return s.slice(i, j); };
const PURE = blk(src, '// STASH-PURE-BEGIN', '// STASH-PURE-END');
const M = new Function(PURE + '\nreturn { stashClassify, stashPlan, stashOrder, stashSlotsNeeded, stashBatches, stashLe, stashHex, stashWithdrawHex, stashSysVerdict, stashPickLink, stashDue, stashLeft, stashRecordAdd, stashLine, stashPlanLine, STASH_MSG };')();
let fails = 0; const warns = [];
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

// ---- 1) packet bytes --------------------------------------------------------------------------------------------------------------
{
  const h1 = M.stashHex([{ objId: 0x10203040, count: 5 }]);
  check(h1 === '3B' + '01000000' + '40302010' + '0500000000000000', `one item: ${h1}`);
  const h2 = M.stashHex([{ objId: 268477001, count: 1 }, { objId: 2147483647, count: 5000000000 }]);
  check(h2.length === 2 + 8 + 2 * 24 && h2.startsWith('3B02000000') && !/\s/.test(h2), `two items: ${h2.length / 2} bytes = 1 + 4 + 2 x 12, no spaces`);
  check(h2.slice(10, 18) === '49A20010' && h2.slice(34, 42) === 'FFFFFF7F' && h2.slice(42, 58) === '00F2052A01000000', 'little-endian objId + 8-byte count (5,000,000,000)');
  check(M.stashWithdrawHex([{ objId: 1, count: 2 }]) === '3C' + '01000000' + '01000000' + '0200000000000000', 'withdraw 0x3C has the same layout');
  // the shop packets' encoder in swarm.js must agree (sell 0x37 / buy 0x40 are proven live)
  const leSrc = (src.match(/const leHex = \(v, bytes\) => \{[^\n]*\};/) || [])[0];
  if (leSrc) { const leHex = new Function(leSrc + '\nreturn leHex;')(); check([0, 1, 255, 65536, 268477001, 2147483647].every(v => leHex(v, 4) === M.stashLe(v, 4)) && leHex(5000000000, 8) === M.stashLe(5000000000, 8), 'stashLe = the proven leHex of the shop packets'); }
  else warns.push('leHex not found in swarm.js');
  // the server's size check (L2J SendWareHouseDepositList: count * 12 == remaining bytes)
  const body = h2.length / 2 - 1; check(body === 4 + 2 * 12, 'payload = 4 + count x 12 bytes (server size check)');
  // L2Swarm's own packet table
  try {
    const cl = cp.execSync(`unzip -p "${path.join(ROOT, 'Data', 'base.db')}" PacketsGSClient`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const sv = cp.execSync(`unzip -p "${path.join(ROOT, 'Data', 'base.db')}" PacketsGSServer`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const sm = cp.execSync(`unzip -p "${path.join(ROOT, 'Data', 'base.db')}" SystemMsg`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    check(/^3B=SendWareHouseDepositList=d\(count:Loop\.01\.0002\)d\(ObjectID\)q\(Count\)\s*$/m.test(cl), 'base.db PacketsGSClient: 3B=SendWareHouseDepositList=d(count)d(ObjectID)q(Count)');
    check(/^3C=SendWareHouseWithDrawList=d\(count:Loop\.01\.0002\)d\(ObjectID\)q\(Count\)\s*$/m.test(cl), 'base.db PacketsGSClient: 3C=SendWareHouseWithDrawList (same layout)');
    check(/^41=WareHouseDepositList=h\(WhType\)q\(PlayerAdena\)h\(count/m.test(sv), 'base.db PacketsGSServer: 41=WareHouseDepositList h(WhType) q(PlayerAdena) h(count) ...');
    const msg = (id) => ((sm.match(new RegExp('^' + id + '=(.*)$', 'm')) || [])[1] || '').trim();
    check(/exceeded the quantity that can be inputted/i.test(msg(1036)) && /warehouse is full/i.test(msg(130)) && /capacity of the warehouse/i.test(msg(874)), `system messages full: 1036 "${msg(1036)}", 130, 874`);
    check(/not have enough adena/i.test(msg(279)) && /too far away from the warehouse/i.test(msg(162)), `system messages 279 "${msg(279)}", 162 "${msg(162)}"`);
  } catch (e) { warns.push('Data/base.db not readable with unzip (packet table check skipped): ' + e.message.split('\n')[0]); }
}

// ---- 2) classification on real data -----------------------------------------------------------------------------------------------
const data = rd('Scripts/data/stash_items.json'), rules = rd('Scripts/data/stash_rules.json'), gear = rd('Scripts/data/gear_items.json').items || {};
const sellMarks = rd('Scripts/data/sell_list.json');
const keepBase = [57, 736, 737, 1060, 1061, 728, 1539, 1835, 2509, 3947, 3948, 3949, 3950, 3951, 3952, 1463, 1464, 1465, 1466, 1467, 8594, 8595, 8596, 8597, 8598, 8599, 955, 956, 951, 952];
const marked = (name) => new Set([...(sellMarks.all || []), ...(sellMarks[name] || [])].map(Number));
const item = (id, name, o) => Object.assign({ id, objId: 1000 + id, name, count: 1, stackable: !(gear[id] && gear[id].s), gear: !!(gear[id] && gear[id].s) }, o || {});
const ctxQ = { name: 'Dagger1', crafter: false, createLvl: 0, commonLvl: 0, keepIds: keepBase, stonesToPriest: false, hasTeam: false, rules, data };
{
  const C = (it, ctx) => M.stashClassify(it, ctx || ctxQ);
  const d = (it, cat, ctx) => { const r = C(it, ctx); return r.act === 'deposit' && (!cat || r.cat === cat); };
  check(d(item(1865, 'Varnish'), 'material'), 'Varnish -> deposit (crafting material)');
  check(d(item(1458, 'Crystal (D-Grade)'), 'material'), 'Crystal (D-Grade) -> deposit (material)');
  check(d(item(1804, 'Recipe: Soulshot (D-Grade)'), 'recipe'), 'Recipe: Soulshot (D-Grade) -> deposit (recipe I cannot use), not kept as a "Soulshot"');
  check(d(item(6360, 'Blue Seal Stone'), 'seal') && C(item(6360, 'Blue Seal Stone'), Object.assign({}, ctxQ, { stonesToPriest: true })).act === 'keep', 'Blue Seal Stone -> deposit; kept in the competition period when signed up (Priest of Dawn)');
  check(d(item(5575, 'Ancient Adena'), 'aa'), 'Ancient Adena -> deposit');
  check(d(item(3875, 'L2Day - A'), 'event') && d(item(3888, 'L2Day - II'), 'event'), 'L2Day letters -> deposit');
  check(d(item(8728, 'Life Stone -  Level 61'), 'rule'), 'Life Stone -> deposit (stash_rules.json depositNames)');
  check(C(item(1661, 'Thief Key')).act === 'keep', 'Thief Key -> keep (stash_rules.json keep)');
  check(C(item(736, 'Scroll of Escape', { count: 5 })).act === 'keep' && C(item(1061, 'Greater Healing Potion')).act === 'keep' && C(item(1831, 'Antidote')).act === 'keep', 'SoE / potions / antidote -> keep');
  check(C(item(1829, 'Scroll of Escape: Clan Hall')).act === 'keep' && C(item(952, 'Scroll: Enchant Armor (C-Grade)')).act === 'keep', 'SoE: Clan Hall, enchant scrolls -> keep');
  check(C(item(1342, 'Steel Arrow')).act === 'keep', 'arrows -> keep');
  check(C(item(12144, 'Common Item - Full Plate Armor')).act === 'deposit' && C(item(12144, 'Common Item - Full Plate Armor')).cat === 'gear', 'old gear nobody plans -> deposit');
  check(C(item(12144, 'x', { upgrade: true })).act === 'keep' && C(item(12144, 'x', { spare: true })).act === 'keep', 'gear: upgrade for me / HP-swap spare -> keep');
  check(C(item(12144, 'x', { teamWants: true })).act === 'deposit' && C(item(12144, 'x', { teamWants: true }), Object.assign({}, ctxQ, { hasTeam: true })).act === 'keep', 'gear a teammate plans: solo -> deposit, in a team -> keep (the unload hands it over)');
  check(C(item(1, 'x', { equipped: true, gear: true })).act === 'keep' && C(item(7000, 'Quest Thing', { quest: true })).act === 'keep' && C(item(57, 'Adena')).act === 'keep', 'equipped / quest item / adena -> keep');
  check(C(item(999999, 'Strange Thing')).act === 'keep' && C(item(999999, 'Strange Thing')).cat === 'unknown', 'unknown kind -> KEEP (add a rule)');
  check(C(item(1865, 'Varnish', { sell: true })).act === 'sell', 'marked for sale -> left for the sale step');
  check(C(item(1865, 'Varnish'), Object.assign({}, ctxQ, { rules: { chars: { Dagger1: { keep: [1865] } } } })).act === 'keep', 'per-character keep rule wins');
  check(C(item(736, 'Scroll of Escape'), Object.assign({}, ctxQ, { rules: { deposit: [736] } })).act === 'deposit', 'global deposit rule beats the built-in keep');
  // the crafter
  const ctxF = Object.assign({}, ctxQ, { name: 'Crafter1', crafter: true, createLvl: 3, commonLvl: 1, hasTeam: true });
  const lvlOf = (id) => (data.recipes[id] || [])[0];
  check(C(item(1865, 'Varnish'), ctxF).act === 'keep', 'Crafter1 (Create Item 3): Varnish -> keep (material for his recipes)');
  check(C(item(2134, 'Gemstone S'), ctxF).act === 'deposit' && /above my craft level/.test(C(item(2134, 'Gemstone S'), ctxF).why), `Crafter1: Gemstone S (needs ${JSON.stringify(data.materials[2134])}) -> deposit (above his level)`);
  check(C(item(1804, 'Recipe: Soulshot (D-Grade)'), ctxF).act === (lvlOf(1804) <= 3 ? 'keep' : 'deposit'), `Crafter1: Recipe: Soulshot (D) (craft level ${lvlOf(1804)}) -> ${lvlOf(1804) <= 3 ? 'keep' : 'deposit'}`);
  check(C(item(5000, 'Recipe: Sword of Damascus (60%)'), ctxF).act === 'deposit', `Crafter1: Recipe: Sword of Damascus (craft level ${lvlOf(5000)}) -> deposit (above his level)`);
  check(Object.keys(data.recipes).length >= 990 && Object.keys(data.materials).length > 500, `stash_items.json: ${Object.keys(data.recipes).length} recipe items (recipes.xml lists recipe item 5008 twice), ${Object.keys(data.materials).length} materials`);

  // Dagger1's real bag (the grocer's sell list of 2026-10-09 15:40)
  try {
    const lines = fs.readFileSync(path.join(ROOT, 'Logs', 'shop_Dagger1.txt'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
    const mk = marked('Dagger1');
    const bag = lines.map((l, i) => { const m = l.match(/^(\d+) (.*) (\d+)$/); return m ? item(Number(m[1]), m[2], { objId: 5000 + i, sell: mk.has(Number(m[1])) }) : null; }).filter(Boolean);
    const p = M.stashPlan(bag, ctxQ);
    console.log(`     Dagger1's ${bag.length} bag entries: ${M.stashPlanLine(p)}`);
    console.log(`     kept: ${p.keep.map(r => `${r.name} [${r.cat}]`).join(', ')}`);
    check(p.deposit.length >= 100, `Dagger1: ${p.deposit.length} of ${bag.length} entries go to the warehouse (frees >= 100 slots)`);
    check(!p.deposit.some(r => [736, 737, 1061, 728, 1060].includes(r.id)), 'Dagger1: no SoE / SoR / potions in the deposit');
    check(p.keep.filter(r => r.cat === 'unknown').length <= 10, `Dagger1: unknown kinds kept: ${p.keep.filter(r => r.cat === 'unknown').map(r => r.name).join(', ') || 'none'}`);
  } catch (e) { warns.push('Logs/shop_Dagger1.txt not readable: ' + e.message); }
}

// ---- 3) link choice, order, slots, verdicts, record ---------------------------------------------------------------------------------
{
  const L = (...t) => t.map((x, i) => ({ cmd: '0' + i, text: x }));
  const h5 = L('Deposit an item. (Private Warehouse)', 'Withdraw an item. (Private Warehouse)', 'Deposit an item. (Clan Warehouse)', 'Withdraw an item. (Clan Warehouse)', 'Quest');
  check((M.stashPickLink(h5, 'private') || {}).text === 'Deposit an item. (Private Warehouse)', 'L2J H5 links: private deposit');
  check((M.stashPickLink(h5, 'clan') || {}).text === 'Deposit an item. (Clan Warehouse)', 'L2J H5 links: clan deposit');
  const sub = L('Private Warehouse', 'Clan Warehouse', 'Freight', 'Quest');
  check((M.stashPickLink(sub, 'private') || {}).text === 'Private Warehouse' && (M.stashPickLink(sub, 'clan') || {}).text === 'Clan Warehouse', 'sub menus: Private Warehouse / Clan Warehouse');
  check((M.stashPickLink(L('Deposit', 'Withdraw', 'Sort by type'), 'private') || {}).text === 'Deposit', 'plain "Deposit"');
  check(M.stashPickLink(L('Withdraw an item. (Private Warehouse)', 'Quest', 'Freight'), 'private') === null && M.stashPickLink([], 'private') === null, 'withdraw / quest / freight only: no link');
  const rows = [{ id: 1, name: 'B gear', stackable: false, cat: 'gear' }, { id: 2, name: 'Varnish', stackable: true, cat: 'material' }, { id: 3, name: 'Coal', stackable: true, cat: 'material' }];
  check(M.stashOrder(rows, { 3: {} }).map(r => r.id).join() === '3,2,1', 'order: stackable already in the warehouse, other stackables, single pieces');
  check(M.stashSlotsNeeded(rows, { 3: {} }) === 2 && M.stashSlotsNeeded(rows, {}) === 3, 'slots: a stackable kind already stored takes no slot');
  check(M.stashBatches([1, 2, 3, 4, 5], 2).map(b => b.length).join() === '2,2,1', 'batches of 2');
  check(M.stashSysVerdict(1036) === 'full' && M.stashSysVerdict(130) === 'full' && M.stashSysVerdict(279) === 'adena' && M.stashSysVerdict(162) === 'far' && M.stashSysVerdict(0) === '', 'system message verdicts');
  check(M.stashDue(121, 120, 0, 1e9, 60000) && !M.stashDue(120, 120, 0, 1e9, 0) && !M.stashDue(150, 120, 1e9 - 1000, 1e9, 60000) && M.stashDue(5, 120, 0, 0, 0, true), 'due: above the threshold, gap, force');
  check(M.stashLeft([{ objId: 1 }, { objId: 2 }], { 1: 5, 2: 1 }, { 2: 1 }).map(r => r.objId).join() === '1', 'left the bag');
  const rec = M.stashRecordAdd({}, [{ id: 2, name: 'Varnish', count: 25, stackable: true }, { id: 1, name: 'Sword', count: 1, stackable: false }, { id: 1, name: 'Sword', count: 1, stackable: false }]);
  M.stashRecordAdd(rec, [{ id: 2, name: 'Varnish', count: 5, stackable: true }]);
  check(rec.slotsUsed === 3 && rec.kinds[2].c === 30 && rec.kinds[1].k === 2, `record: Varnish x30 = 1 slot + 2 swords = ${rec.slotsUsed} slots`);
  check(/^stash: deposited 2 kinds \(Varnish x25, Coal\) at Taurin, fee 60$/.test(M.stashLine([{ name: 'Varnish', count: 25 }, { name: 'Coal', count: 1 }], 'Taurin', 60)), 'log line format');
}

// ---- 4) FLOW with a mock server ---------------------------------------------------------------------------------------------------
async function flow(name, setup) {
  const IMP = blk(src, 'const STASH = { busy: false', '/** Walk to the Giran warehouse');
  const files = {}, sent = [];
  const S = Object.assign({ limit: 1000, stored: {}, adena: 1e6, refuse: [], notListed: [], far: false }, setup.server || {});
  let inv = setup.items.map(x => Object.assign({}, x));
  let clock = 1e12, lastSys = null;
  const host = {
    CONFIG: { stash: { on: true, auto: true, above: 120, dest: 'private', crafters: ['Crafter1'], batch: 15, feePerItem: 30, settleMs: 1800, listTimeoutMs: 6000, maxRounds: 60, staggerMs: 25000, rawBypass: false }, hpSwap: { on: false }, sevenSigns: {} },
    SWARM_ROOT: 'R', __SCRIPTS__: 'S', Me: { Name: name },
    File: { ReadAllText: (f) => { if (!(f in files)) throw new Error('no file'); return files[f]; }, WriteAllText: (f, t) => { files[f] = t; } },
    num: (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0), now: () => clock, sleep: async (ms) => { clock += ms; },
    logError: (w, e) => { throw new Error(w + ': ' + (e && e.message)); },
    Inventory: { forEach: (f) => inv.slice().forEach(f), get Count() { return inv.length; } },
    itemCount: (id) => inv.filter(i => i.Id === id).reduce((a, i) => a + i.Count, 0),
    openNpc: async () => '<a action="bypass -h 01">Withdraw an item. (Private Warehouse)</a><a action="bypass -h 02">Deposit an item. (Private Warehouse)</a>',
    npcLinks: (h) => { const o = []; h.replace(/<a action="bypass (?:-h )?([^"]+)">([^<]*)<\/a>/g, (_, c, t) => o.push({ cmd: c, text: t })); return o; },
    savePage: () => { }, wh: { want: null, waiter: null },
    getLastSys: () => lastSys,
  };
  host.waitWarehouse = () => new Promise(res => { host.wh.waiter = res; });
  host.waitNpcHtml = () => new Promise(() => { });
  host.Send = {
    ReqBypassToServer: (cmd) => { if (cmd === '02' && host.wh.waiter) { const w = host.wh.waiter; host.wh.waiter = null; const list = inv.filter(i => i.Id !== 57 && !i.IsEquiped && !S.notListed.includes(i.Id)).map(i => ({ objId: i.objId, Id: i.Id })); w({ kind: 'deposit', items: list }); } },
    SendHex: (hex) => {
      sent.push(hex);
      const b = Buffer.from(hex, 'hex'); if (b[0] !== 0x3B) throw new Error('opcode');
      const n = b.readInt32LE(1); if (n * 12 !== b.length - 5) { lastSys = { at: clock, id: 0 }; return; }   // server drops a malformed packet silently
      const rows = []; for (let i = 0; i < n; i++) rows.push({ objId: b.readInt32LE(5 + i * 12), count: Number(b.readBigInt64LE(9 + i * 12)) });
      if (S.far) { lastSys = { at: clock, id: 162, text: '#162 too far' }; return; }
      // checkItemManipulation: an unknown object / too many / a refused one -> the WHOLE packet is dropped (no message)
      for (const r of rows) { const it = inv.find(i => i.objId === r.objId); if (!it || r.count > it.Count || S.refuse.includes(it.Id)) return; }
      let slots = 0; const seen = {}; rows.forEach(r => { const it = inv.find(i => i.objId === r.objId); if (!it.IsStackable) slots++; else if (!S.stored[it.Id] && !seen[it.Id]) { seen[it.Id] = 1; slots++; } });
      if (Object.keys(S.stored).length + slots > S.limit) { lastSys = { at: clock, id: 1036, text: '#1036 You have exceeded the quantity that can be inputted.' }; return; }
      const fee = n * 30, ad = inv.find(i => i.Id === 57);
      if (!ad || ad.Count < fee) { lastSys = { at: clock, id: 279, text: '#279 You do not have enough adena.' }; return; }
      ad.Count -= fee;
      rows.forEach(r => { const it = inv.find(i => i.objId === r.objId); it.Count -= r.count; S.stored[it.IsStackable ? it.Id : 'o' + it.objId] = 1; if (it.Count <= 0) inv = inv.filter(i => i !== it); });
    },
  };
  const names = Object.keys(host).filter(k => k !== 'getLastSys');
  const fn = new Function(...names, 'getLastSys', PURE + '\n' + IMP.replace(/\blastSysMsg\b/g, 'getLastSys()') + '\nreturn { stashDepositAt, stashRec, stashOpenList };');
  const X = fn(...names.map(k => host[k]), host.getLastSys);
  const res = await X.stashDepositAt({ Name: 'Taurin', objId: 777 }, setup.rows(inv), 'private');
  return { res, inv, sent, rec: X.stashRec(), S };
}
(async () => {
  const mkInv = (n, extra) => [{ Id: 57, objId: 1, Count: 1e6, IsStackable: true }].concat(Array.from({ length: n }, (_, i) => ({ Id: 1864 + i, objId: 100 + i, Count: 10 + i, IsStackable: true, Name: 'Mat ' + i }))).concat(extra || []);
  const rowsOf = (inv) => inv.filter(i => i.Id !== 57).map(i => ({ objId: i.objId, id: i.Id, name: i.Name || String(i.Id), count: i.Count, stackable: i.IsStackable, cat: 'material' }));
  // a) 40 kinds, all accepted: 3 packets (15/15/10), fee 40 x 30, record 40 slots
  { const f = await flow('Dagger1', { items: mkInv(40), rows: rowsOf });
    check(f.res.done.length === 40 && f.sent.length === 3 && f.res.fee === 1200 && f.inv.length === 1, `a) 40 kinds in ${f.sent.length} packets, fee ${f.res.fee}, bag left: ${f.inv.length} (adena)`);
    check(f.rec.slotsUsed === 40 && f.rec.last.n === 40 && f.rec.last.keeper === 'Taurin' && f.rec.last.ok, `a) Logs/stash_Dagger1.json: ${f.rec.slotsUsed} slots, last ${f.rec.last.n} at ${f.rec.last.keeper}`); }
  // b) one kind the server does not list (equipped / not depositable): skipped, the rest goes in
  { const f = await flow('Q', { items: mkInv(20), rows: rowsOf, server: { notListed: [1870] } });
    check(f.res.done.length === 19 && f.res.refused.some(x => /not in the deposit list/.test(x)), `b) not in the server's list: refused (${f.res.refused.join(', ')}), ${f.res.done.length} deposited`); }
  // c) one kind silently refused (checkItemManipulation drops the whole packet): found by single retries
  { const f = await flow('Q', { items: mkInv(20), rows: rowsOf, server: { refuse: [1867] } });
    check(f.res.done.length === 19 && f.res.refused.length === 1 && /Mat 3/.test(f.res.refused[0]), `c) silently refused: ${f.res.refused.join(', ')}, ${f.res.done.length} deposited, ${f.sent.length} packets`); }
  // d) warehouse full after 25 slots (1036): fills the last slots one by one, then stops, record full + limit
  { const f = await flow('Q', { items: mkInv(40), rows: rowsOf, server: { limit: 25 } });
    check(f.res.done.length === 25 && f.res.why === 'warehouse full' && f.rec.full === true && f.rec.limit === 25, `d) full at ${f.res.done.length} (limit learned ${f.rec.limit}, ${f.rec.limitSource})`); }
  // e) not enough adena (279): stops with the reason
  { const f = await flow('Q', { items: [{ Id: 57, objId: 1, Count: 100, IsStackable: true }].concat(mkInv(10).slice(1)), rows: rowsOf });
    check(f.res.done.length === 0 && /not enough adena/.test(f.res.why), `e) adena 100 for 10 items: ${f.res.why}`); }
  // f) too far from the keeper (162)
  { const f = await flow('Q', { items: mkInv(5), rows: rowsOf, server: { far: true } });
    check(f.res.done.length === 0 && /too far/.test(f.res.why), `f) ${f.res.why}`); }
  // g) non-stackable gear: each piece one slot; the plan count is capped to what is in the bag
  { const items = mkInv(2, [{ Id: 12144, objId: 900, Count: 1, IsStackable: false, Name: 'Common Item - Full Plate Armor' }, { Id: 12144, objId: 901, Count: 1, IsStackable: false, Name: 'Common Item - Full Plate Armor' }]);
    const f = await flow('Q', { items, rows: (inv) => rowsOf(inv).map(r => Object.assign(r, { count: r.count + 50 })) });
    check(f.res.done.length === 4 && f.rec.slotsUsed === 4 && f.rec.kinds[12144].k === 2, `g) 2 stacks + 2 armor pieces = ${f.rec.slotsUsed} slots (counts capped to the bag)`); }

  // ---- 5) source checks ---------------------------------------------------------------------------------------------------------
  check(/\n  stash: \{ on: true, auto: (true|false),[^\n]*\n?\s*above: 120, dest: 'private'/.test(src), 'CONFIG.stash (on, auto on/off, above 120, private)');   // auto OFF until the supervised live test (2026-10-09)
  check(/slots: num\(Inventory\.Count\), sell, (?:sellWhy, )?stash: stashWanted\(\) \}/.test(src), "supplyneed reports 'stash'");   // SELLPICK 2026-10-13: + sellWhy
  check(/if \(action === 'stashrun'\) \{/.test(src) && /teamStep\(runId, 'stashrun'/.test(src), "supply run step 'stashrun' + its team action");
  check(src.indexOf("teamStep(runId, 'stashrun'") < src.indexOf('// 4. UNLOAD (user 2026-10-06)'), 'the stash step runs before the unload');
  check(/'enchant', 'stash', 'unload loot'/.test(src), 'party status step list has "stash"');
  check(/case '!stashplan':/.test(src) && /case '!stash': \{/.test(src), 'commands !stash / !stashplan');
  check(/st\.stash = sp/.test(src), 'swarm_state.stash for the dashboard');
  // CMDFIX2-SUPPLY-2026-10-12: soulStore deposits through stashDepositAt (the stash path), which sends the hex packet
  check(/async function soulStore\(\)[\s\S]{0,2500}?await stashDepositAt\(npc, rows, kind\)/.test(src) && /async function stashDepositAt\([\s\S]{0,3000}?Send\.SendHex\(stashHex\(batch\)\)/.test(src), 'soulStore deposits with the hex packet too (via stashDepositAt)');
  check(!/new Map\(/.test(PURE) && !/new Map\(/.test(blk(src, 'const STASH = { busy: false', '// --- CLAN (user 2026-10-07')), 'no new Map() in the stash code');
  check(!/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(blk(src, '// WAREHOUSE STASH (user 2026-10-09 16:05: "warehouse deposit', '// --- CLAN (user 2026-10-07')), 'no control characters in the stash code');
  const G = rd('Scripts/data/giran_routes.json').routes.warehouse;
  const atlas = rd('Scripts/data/npc_atlas.json').npcs.find(n => n.name === G.npc);
  check(G && G.npc === 'Taurin' && atlas && atlas.title === 'Warehouse Keeper' && Math.hypot(atlas.x - G.npcAt[0], atlas.y - G.npcAt[1]) < 50, `Giran route 'warehouse' ends at Taurin (${atlas && atlas.id}, Warehouse Keeper) — atlas and route agree`);
  check(Math.hypot(G.tradeSpot[0] - G.npcAt[0], G.tradeSpot[1] - G.npcAt[1]) < 150, `the route's trade spot is within interaction range (150) of Taurin (${Math.round(Math.hypot(G.tradeSpot[0] - G.npcAt[0], G.tradeSpot[1] - G.npcAt[1]))})`);
  const cmds = fs.readFileSync(path.join(ROOT, 'Dashboard', 'commands.js'), 'utf8');
  check(/id: 'stash',/.test(cmds) && /id: 'stashplan',/.test(cmds), 'Dashboard/commands.js has stash + stashplan');
  check(/stash/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'charpage.js'), 'utf8')), 'character page shows the warehouse line');

  warns.forEach(w => console.log('warn ' + w));
  console.log(fails ? `\n${fails} FAILED` : '\nall stash checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
