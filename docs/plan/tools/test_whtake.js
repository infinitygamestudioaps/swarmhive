// OFFLINE TEST of the WAREHOUSE TAKE (D8, user 2026-10-12: "take needed items from the private / clan warehouse, from the gear tab").
//   node docs/plan/tools/test_whtake.js [path to swarm.js]     (default Scripts_dev/swarm.js; exit code 1 when a check fails; never talks to the game)
// Runs the WHTAKE-PURE block (+ the STASH-PURE packet encoder) in node: !whtake arguments, the withdraw link on the LIVE L2Toggle keeper
// pages (Logs/stash_npc*_*.html when present), the withdraw plan, the bag check, the list after taking, the clan leader's hand-over rows,
// the 0x3C packet bytes; plus source checks (command, objId in the withdraw rows, private list record, !clanwh uses the withdraw list).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const F = process.argv.slice(2).filter(a => !/^--/.test(a))[0] || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(F, 'utf8');
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i); if (i < 0 || j < i) { console.error(b + ' block not found in ' + F); process.exit(1); } return src.slice(i, j); };
const M = new Function(blk('// STASH-PURE-BEGIN', '// STASH-PURE-END') + blk('// WHTAKE-PURE-BEGIN', '// WHTAKE-PURE-END') +
  '\nreturn { whParse, whPickWithdrawLink, whPlan, whCounts, whVerify, whListAfter, whHandRows, whLine, stashWithdrawHex };')();
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const J = JSON.stringify;

// ---- 1) arguments ----------------------------------------------------------------------------------------------------------------
{
  let p = M.whParse(['1234:2,57:100000', 'clan', 'Bishop1']);
  check(p.kind === 'clan' && p.name === 'Bishop1' && J(p.items) === J([{ id: 1234, count: 2 }, { id: 57, count: 100000 }]) && !p.err, 'ids with counts + clan + name');
  p = M.whParse(['356']);
  check(p.kind === 'private' && !p.name && J(p.items) === J([{ id: 356, count: 1 }]), 'one id: private, count 1, no name');
  p = M.whParse(['1463:all,1463:5', 'private']);
  check(J(p.items) === J([{ id: 1463, count: 'all' }]), "':all' wins when an id is listed twice");
  p = M.whParse(['10:1', '10:2']);
  check(J(p.items) === J([{ id: 10, count: 3 }]), 'the same id twice adds up');
  check(M.whParse(['clan']).err === 'no item ids', 'no ids -> error');
  check(/do not understand/.test(M.whParse(['12', 'Bishop1', 'Necro1']).err), 'two names -> error');
  check(/do not understand/.test(M.whParse(['12;drop']).err), 'junk -> error');
}

// ---- 2) the withdraw link -----------------------------------------------------------------------------------------------------------
{
  const L = (arr) => arr.map((t, i) => ({ cmd: '-h 0' + i, text: t }));
  const top = L(['Private Warehouse.', 'Clan Warehouse.', '', 'Quest', 'Manufacture an S-grade sword']);
  check((M.whPickWithdrawLink(top, 'private') || {}).text === 'Private Warehouse.', 'top page, private -> "Private Warehouse."');
  check((M.whPickWithdrawLink(top, 'clan') || {}).text === 'Clan Warehouse.', 'top page, clan -> "Clan Warehouse."');
  const pv = L(['Deposit an item. (Private Warehouse)', 'Withdraw an item. (Private Warehouse) (List all)', 'Withdraw an item. (Private Warehouse) (Select)', 'Return']);
  check((M.whPickWithdrawLink(pv, 'private') || {}).text === 'Withdraw an item. (Private Warehouse) (List all)', 'private sub page -> withdraw (List all), never deposit');
  const cl = L(['Deposit an item. (Clan Warehouse)', 'Withdraw an item. (Clan Warehouse) (List all)', 'Withdraw an item. (Clan Warehouse) (Select)', 'Return']);
  check((M.whPickWithdrawLink(cl, 'clan') || {}).text === 'Withdraw an item. (Clan Warehouse) (List all)', 'clan sub page -> withdraw (List all) (the old openWarehouse took the deposit link here)');
  check(M.whPickWithdrawLink(L(['Deposit an item. (Clan Warehouse)', 'Return']), 'clan') === null, 'only a deposit link -> null');
  // the live pages the stash saved (2026-10-10), when present
  const logs = path.join(ROOT, 'Logs');
  let seen = 0;
  try {
    fs.readdirSync(logs).filter(n => /^stash_npc1?_.*\.html$/.test(n)).slice(0, 12).forEach(n => {
      const html = fs.readFileSync(path.join(logs, n), 'utf8'), links = [];
      const re = /<a\b[^>]*action="bypass\s+([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi; let m;
      while ((m = re.exec(html))) links.push({ cmd: m[1], text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() });
      const isSub = links.some(l => /^Withdraw an item/i.test(l.text)), kind = links.some(l => /\(Clan Warehouse\)/.test(l.text)) ? 'clan' : 'private';
      const pk = M.whPickWithdrawLink(links, kind);
      if (isSub) { seen++; check(!!pk && /^Withdraw an item\..*\(List all\)$/.test(pk.text) && (kind === 'clan') === /Clan/.test(pk.text), `live page ${n} (${kind}) -> "${pk && pk.text}"`); }
    });
  } catch (e) { }
  if (!seen) console.log('note no live keeper sub pages in Logs (stash_npc1_*.html) — skipped');
}

// ---- 3) plan ------------------------------------------------------------------------------------------------------------------------
{
  const rows = [
    { objId: 9001, id: 356, name: 'Full Plate Armor', count: 1, enchant: 0 },
    { objId: 9002, id: 356, name: 'Full Plate Armor', count: 1, enchant: 3 },
    { objId: 9003, id: 1463, name: 'Soulshot (D)', count: 2500, enchant: 0 },
    { objId: 9004, id: 57, name: 'Adena', count: 120000, enchant: 0 },
  ];
  let p = M.whPlan(rows, [{ id: 356, count: 1 }]);
  check(J(p.take.map(t => t.objId)) === J([9001]) && !p.missing.length, 'gear: the LOWEST enchant first (owner 2026-10-17: "take a sword" took the +16)');
  { // owner 2026-10-17: "Anything over the safe limit is no go unless an explicit warning was given" + "Dont take +16 NEVER!"
    const R2 = rows.concat([{ objId: 9005, id: 356, name: 'Full Plate Armor', count: 1, enchant: 7 }, { objId: 9006, id: 356, name: 'Full Plate Armor', count: 1, enchant: 16 }]);
    const all = M.whPlan(R2, [{ id: 356, count: 'all' }]).take.map(t => t.objId);
    check(J(all) === J([9001, 9002]), 'by item id: never a piece above the safe +4 (+7 / +16 stay)');
    check(J(M.whPlan(R2, [{ id: 356, count: 1, ench: 7 }]).take.map(t => t.objId)) === J([9005]), 'the exact +7 only when that piece is asked for (after the warning)');
    check(J(M.whPlan(R2, [{ id: 356, count: 1, ench: 16 }]).take.map(t => t.objId)) === J([9006]), '+16: only when the owner picks exactly that piece (never by chance)');
  }
  p = M.whPlan(rows, [{ id: 356, count: 3 }]);
  check(p.take.length === 2 && p.missing.length === 1 && p.missing[0].count === 1 && /only 2/.test(p.missing[0].why), 'asked 3, only 2 pieces -> 2 taken, 1 missing');
  p = M.whPlan(rows, [{ id: 1463, count: 1000 }, { id: 57, count: 'all' }, { id: 4242, count: 1 }]);
  check(J(p.take.map(t => [t.objId, t.count])) === J([[9003, 1000], [9004, 120000]]), 'a stack is split (1000 of 2500), all adena');
  check(p.missing.length === 1 && p.missing[0].id === 4242 && p.missing[0].why === 'not in the warehouse', 'unknown id -> missing "not in the warehouse"');
  check(M.whPlan([{ id: 356, count: 1, objId: 0 }], [{ id: 356, count: 1 }]).take.length === 0, 'a row without an objId is never sent');
}

// ---- 4) the bag check, the record after, the hand-over rows ------------------------------------------------------------------------
{
  const batch = [{ objId: 1, id: 356, name: 'Full Plate Armor', count: 1 }, { objId: 2, id: 356, name: 'Full Plate Armor', count: 1 }, { objId: 3, id: 1463, name: 'Soulshot (D)', count: 1000 }];
  const v = M.whVerify(batch, { 1463: 200 }, { 356: 1, 1463: 1200 });
  check(J(v.map(x => [x.id, x.want, x.got])) === J([[356, 2, 1], [1463, 1000, 1000]]), 'verify by item id: 1 of 2 armors, 1000 shots');
  check(M.whVerify(batch, { 1463: 200 }, { 1463: 5000 })[1].got === 1000, 'verify never counts more than asked');
  const rows = [{ id: 356, count: 1, objId: 1 }, { id: 356, count: 1, objId: 2 }, { id: 1463, count: 2500, objId: 3 }];
  check(J(M.whListAfter(rows, { 356: 1, 1463: 1000 }).map(r => [r.objId, r.count])) === J([[2, 1], [3, 1500]]), 'list after: one armor gone, stack 2500 -> 1500');
  const before = [{ objId: 50, id: 356, name: 'Full Plate Armor', count: 1, equipped: true }, { objId: 60, id: 1463, name: 'Soulshot (D)', count: 300, stackable: true }];
  const after = before.concat([{ objId: 51, id: 356, name: 'Full Plate Armor', count: 1 }]).map(b => b.objId === 60 ? Object.assign({}, b, { count: 1300 }) : b);
  const h = M.whHandRows(before, after, [{ id: 356, got: 1 }, { id: 1463, got: 1000 }]);
  check(J(h) === J([{ objId: 51, id: 356, name: 'Full Plate Armor', count: 1, stack: false }, { objId: 60, id: 1463, name: 'Soulshot (D)', count: 1000, stack: true }]),
    'hand-over: only the NEW armor (never the worn one) + 1000 of the shot stack');
  const h2 = M.whHandRows([{ objId: 70, id: 356, name: 'Full Plate Armor', count: 1 }], [{ objId: 70, id: 356, name: 'Full Plate Armor', count: 1 }], [{ id: 356, got: 1 }]);
  check(h2.length === 0, 'hand-over: no new piece in the bag -> nothing (his own armor stays)');
  const line = M.whLine({ got: [{ id: 356, name: 'Full Plate Armor', got: 1, want: 2 }], missing: [{ name: 'item 4242', count: 1, why: 'not in the warehouse' }], why: '' }, 'private', 'Taurin');
  check(/took Full Plate Armor at Taurin; missing: item 4242 x1 \(not in the warehouse\)/.test(line), 'line: ' + line);
}

// ---- 5) packet --------------------------------------------------------------------------------------------------------------------
{
  const hx = M.stashWithdrawHex([{ objId: 0x10203040, count: 5 }, { objId: 7, count: 5000000000 }]);
  check(hx === '3C' + '02000000' + '40302010' + '0500000000000000' + '07000000' + '00F2052A01000000', 'SendWareHouseWithDrawList 0x3C: d count, n x [d objId, q count], no spaces');
}

// ---- 6) source checks -------------------------------------------------------------------------------------------------------------
{
  check(/case '!whtake':[\s\S]{0,200}whCommand\(parts\)/.test(src), "handleSay: case '!whtake' -> whCommand(parts)");
  check(/rows\.push\(\{ id: num\(it\.Id\)[^\n]*objId: oid \}\)/.test(src), 'OnWareHouseWithdrawalList keeps the warehouse objId');
  check(/if \(wh\.want === 'private'\) whWriteList\('private', rows\)/.test(src), 'the private list is recorded (Logs/wh_private_<Name>.json)');
  check(/async function clanWarehouseLook\(\)[\s\S]{0,2500}whOpenWithdraw\(npc, 'clan'\)/.test(src), '!clanwh opens the WITHDRAW list');
  check(/App\.on\('swarm\.whtake\.ask'/.test(src) && /CONFIG\.roster\[d\.from\]/.test(src), 'clan request: only from our own characters');
  check(/hovCommand\(\['!handover', id\]\)/.test(src.slice(src.indexOf('async function whClanFor'))), 'the clan leader hands over through the hand-over machinery');
  check(!/new Map\(/.test(blk('// WHTAKE-PURE-BEGIN', '// WHTAKE-PURE-END')), 'no new Map() (L2Swarm host type)');
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
