// OFFLINE TEST of TRADEWIN-2026-10-15 (live 13:30: "[Tank1] trade -> Dagger1: Animal Skin x18, Thread x21, ... Suede x7 — OK" but only
// Animal Skin moved). Never talks to the game, the MCP server or the dashboard:   node docs/plan/tools/test_trade_window.js
// 1) the bridge never drops / merges / reorders distinct queued orders (brain_host link.js -> agent2.js agLines)
// 2) TRADEWIN-PURE: TradeOwnAdd (0x1A) / TradeOtherDone (0x82) packet parsing (L2Swarm Data/base.db layout), the confirm / re-add decision,
//    NOTRADELIVE only counts items confirmed in the window
// 3) source checks: giveItems verifies the window, receiver sessions are bound to the giver's trade token and end on 'swarm.trade.end'
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const agSrc = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'agent2.js'), 'utf8');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (s, b, e) => { const i = s.indexOf(b), j = s.indexOf(e, i); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return s.slice(i, j); };

// ---- 1) bridge ---------------------------------------------------------------------------------------------------------------------
{
  const { AgentLink } = require(path.join(ROOT, 'Dashboard', 'brain_host', 'link.js'));
  const out = []; const sock = { destroyed: false, write: (l) => out.push(l), destroy() { } };
  const L = new AgentLink(sock, {});
  const objs = [268501, 268502, 268503, 268504, 268505, 268506, 268507, 268508];
  objs.forEach((o, i) => L.call('Send.AddTradeItem', [o, i + 1], false));
  L.call('Send.AddTradeItem', [268501, 1], false);   // an identical repeat is still its own order
  const msgs = out.join('').split('\n').filter(Boolean).map(JSON.parse);
  check(msgs.length === 9 && msgs.every(m => m.a === 'call' && m.fn === 'Send.AddTradeItem'), 'link.js writes every AddTradeItem as its own line (9 of 9, a repeat included)');
  check(msgs.slice(0, 8).every((m, i) => m.args[0] === objs[i] && m.args[1] === i + 1), 'link.js keeps the order and the arguments');
  check(new Set(msgs.map(m => m.id)).size === 9, 'every order has its own call id');
  // agent2.js agLines: feed the lines in odd chunks, every line must reach agDo once, in order
  const fnSrc = blk(agSrc, 'function agLines() {', '\n}\n') + '\n}\n';
  const ran = [];
  const AG = { buf: '', got: 0, lastRx: 0, pinged: false };
  const run = new Function('AG', 'agDo', 'orderWake', 'wake', 'wakeNote', 'orderName', 'now', 'agSend', fnSrc + 'return agLines;')(AG, (m) => ran.push(m), () => 'order', () => { }, () => { }, () => '', () => 0, () => { });
  const all = out.join('');
  for (let i = 0; i < all.length; i += 37) { AG.buf += all.slice(i, i + 37); run(); }
  check(ran.length === 9 && ran.every((m, i) => m.id === msgs[i].id), 'agent2.js agLines runs all 9 orders once each, in order (chunked reads)');
  check(!/coalesc|dedup/i.test(fnSrc) && /agDo\(m\)/.test(fnSrc), 'agLines has no coalescing: every parsed line goes to agDo');
  const doSrc = blk(agSrc, 'function agDo(m) {', "case 'set':");
  check(/callArgs\(Send, fn\.slice\(5\), args\)/.test(doSrc), "agDo runs Send.* orders one by one (callArgs per message)");
}

// ---- 2) TRADEWIN-PURE ------------------------------------------------------------------------------------------------------------------
const P = new Function('num', blk(src, '// TRADEWIN-PURE-BEGIN', '// TRADEWIN-PURE-END') + '\nreturn { TRADEWIN, tradeWinParse, tradeWinDecide, tradeRefusedRows };')((v) => Number(v) || 0);
// the layout from L2Swarm's own catalog (when readable here)
let catLine = '';
try {
  const z = fs.readFileSync(path.join(ROOT, 'Data', 'base.db')); const eocd = z.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let cd = z.readUInt32LE(eocd + 16); const cnt = z.readUInt16LE(eocd + 10);
  for (let i = 0; i < cnt; i++) {
    const meth = z.readUInt16LE(cd + 10), csz = z.readUInt32LE(cd + 20), nl = z.readUInt16LE(cd + 28), el = z.readUInt16LE(cd + 30), cl = z.readUInt16LE(cd + 32), off = z.readUInt32LE(cd + 42);
    if (z.toString('utf8', cd + 46, cd + 46 + nl) === 'PacketsGSServer') { const lnl = z.readUInt16LE(off + 26), lel = z.readUInt16LE(off + 28), d = z.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csz); const t = (meth === 8 ? zlib.inflateRawSync(d) : d).toString('utf8'); catLine = t.split(/\r?\n/).filter(l => /^(1A|82)=/.test(l)).join('\n'); }
    cd += 46 + nl + el + cl;
  }
} catch (e) { }
if (catLine) {
  check(/^1A=TradeOwnAdd=h\(count[^)]*\)h\(ItemType1\)d\(ObjectID\)d\(ItemID[^)]*\)q\(Count\)/m.test(catLine), 'Data/base.db: 1A = TradeOwnAdd h(count) h(type1) d(ObjectID) d(ItemID) q(Count) ...');
  check(/^82=TradeOtherDone=/m.test(catLine), 'Data/base.db: 82 = TradeOtherDone');
} else console.log('skip Data/base.db not readable here');
const le = (v, k) => { const b = []; let x = BigInt(v); for (let i = 0; i < k; i++) { b.push(Number(x & 255n)); x >>= 8n; } return b; };
const ownAddBody = (items) => { let b = [0x1A, ...le(items.length, 2)]; items.forEach(([o, id, c]) => { b = b.concat(le(4, 2), le(o, 4), le(id, 4), le(c, 8), le(0, 2), le(0, 2), le(0, 4), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(-2 & 0xffff, 2), new Array(12).fill(0), new Array(6).fill(0)); }); return b; };
const withHdr = (b) => le(b.length + 2, 2).concat(b);
const one = ownAddBody([[268501123, 1867, 18]]);
check(one.length === 3 + 54, 'one TradeOwnAdd item = 54 bytes after count (catalog layout)');
let r = P.tradeWinParse(withHdr(one), one.length + 2);
check(r && r.op === 0x1A && r.objIds.length === 1 && r.objIds[0] === 268501123, 'TradeOwnAdd WITH the 2-byte length header -> objId 268501123');
r = P.tradeWinParse(one, one.length);
check(r && r.op === 0x1A && r.objIds[0] === 268501123, 'TradeOwnAdd header-less -> same objId');
const two = ownAddBody([[11, 1, 1], [22, 2, 2]]);
r = P.tradeWinParse(withHdr(two), two.length + 2);
check(r && r.objIds.join() === '11,22', 'TradeOwnAdd with 2 items -> both objIds');
check((P.tradeWinParse([3, 0, 0x82], 3) || {}).op === 0x82, 'TradeOtherDone [len 3, 0x82] recognised');
check((P.tradeWinParse(withHdr([0x1C, ...le(1, 4)]), 7) || {}).op === 0x1C, 'TradeDone 0x1C recognised');
const other26 = withHdr([0x4B].concat(new Array(23).fill(7)));   // a 26-byte packet: its length byte is 0x1A
check(P.tradeWinParse(other26, other26.length) === null, 'another packet whose LENGTH byte is 0x1A is not taken for TradeOwnAdd');
check(P.tradeWinParse(withHdr([0x2F, 1, 2, 3]), 6) === null, 'any other opcode -> null');

const sent = ['1', '2', '3', '4', '5', '6', '7', '8'];
let d = P.tradeWinDecide(sent, sent, { elapsed: 100 });
check(d.act === 'confirm' && d.missing.length === 0 && d.verified, 'all 8 in the window -> confirm');
d = P.tradeWinDecide(sent, ['1', '2'], { packets: true, elapsed: 1000 });
check(d.act === 'wait', 'some missing, under 3 s -> wait');
d = P.tradeWinDecide(sent, ['1', '2'], { packets: true, elapsed: 3100 });
check(d.act === 'readd' && d.missing.length === 6, 'still missing after 3 s -> re-add the 6 once');
d = P.tradeWinDecide(sent, ['1', '2'], { packets: true, readded: true, elapsed: 3100 });
check(d.act === 'confirm' && d.inWindow.join() === '1,2' && d.missing.length === 6 && d.verified, 'still missing after the re-add -> confirm the 2 in the window, 6 not added');
d = P.tradeWinDecide(sent, [], { packets: true, readded: true, elapsed: 3100 });
check(d.act === 'cancel', 'nothing in the window after the re-add -> cancel');
d = P.tradeWinDecide(sent, [], { elapsed: 3100, readded: true });
check(d.act === 'confirm' && d.inWindow.length === 8 && !d.verified, 'no trade packets at all (capture unavailable) -> confirm everything, unverified (old behaviour)');
d = P.tradeWinDecide(sent, [], { elapsed: 3100, readded: false });
check(d.act === 'confirm' && !d.verified, 'no trade packets at all -> NO blind re-add (a landed stack / adena would be added twice)');
// the live case: Dagger1's stale confirm -> #122 after the first item
d = P.tradeWinDecide(sent, ['1'], { locked: true, elapsed: 400 });
check(d.act === 'confirm' && d.inWindow.join() === '1' && d.missing.length === 7, 'Tank1 13:30 replay: receiver confirmed early (#122) -> no waiting / no useless re-add, confirm Animal Skin, 7 not added');
const rows = sent.map((o, i) => ({ objId: o, id: 1860 + i, name: 'item ' + o }));
const moves = rows.map((row, i) => ({ row, moved: i === 0 ? 18 : 0 }));
check(P.tradeRefusedRows(moves, d.inWindow).length === 0, 'NOTRADELIVE: the 7 never-added items are NOT learned as refused');
check(P.tradeRefusedRows(moves, null).length === 0, 'NOTRADELIVE: unknown window -> nothing learned');
const moves2 = rows.map((row, i) => ({ row, moved: i === 0 ? 1 : 0 }));
const ref = P.tradeRefusedRows(moves2, ['1', '2']);
check(ref.length === 1 && ref[0].objId === '2', 'NOTRADELIVE: an item confirmed in the window that did not move IS a refusal');
check(P.tradeRefusedRows([{ row: { objId: '9', adena: true }, moved: 0 }], ['9']).length === 0, 'adena is never learned as refused');

// ---- 3) source checks ----------------------------------------------------------------------------------------------------------------
const give = blk(src, 'async function giveItems(d) {', '\n/** Modtager');
check(/tradeWinHook\(\); TWIN\.cap = \[\];/.test(give) && /Options\.EnableJSOnIncomingPacket = true/.test(give), 'giveItems captures trade packets from the open on');
check(/tradeWinDecide\(/.test(give) && /act === 'readd'/.test(give) && /act === 'cancel'/.test(give), 'giveItems waits for the window, re-adds once, cancels when nothing got in');
check(/chk = d\.items\.filter/.test(give) && /return chk\.every/.test(give), 'success is judged only on the items that really were in the window');
check(/NOT added to the trade window/.test(give) && /notAdded \}\)/.test(give), "items that never got in are reported as 'not added' (result notAdded / inWindow)");
check(/'swarm\.trade\.added', \{[^}]*tok \}/.test(give) && /'swarm\.trade\.end', \{ giver: Me\.Name, tok/.test(give), "giver sends its trade token with 'added' and 'swarm.trade.end' at the end");
check(/Options\.EnableJSOnIncomingPacket = twOpt/.test(give), 'giveItems switches the packet capture back as it found it');
check(/App\.on\('swarm\.trade\.end'/.test(src) && /tradeState\.tok === String\(d\.tok\)/.test(src) && /done = 'giver-ended'/.test(src), "receiver: 'swarm.trade.end' ends the session of exactly that trade");
check(/tradeEndedToks\[d\.tok\]\) \{ tradeLog\(`ignored added/.test(src), "receiver: a late 'added' of an ended trade starts nothing");
check(/tok: d\.tok \? String\(d\.tok\) : ''/.test(src) && /added: true, tok: d\.tok/.test(src), 'receiver sessions (late receive too) carry the token');
const hov = blk(src, 'async function hovTradeBatch(', '\nasync function hovGive(');
check(/tradeRefusedRows\(mv, g && Array\.isArray\(g\.inWindow\)/.test(hov), 'hovTradeBatch learns refusals only from items confirmed in the window');
check(/not added to the trade window/.test(hov), "hovTradeBatch reports 'not added' (the single-item retry then hands them over)");

console.log(`\ntrade window: ${n - fails}/${n} ok`);
process.exit(fails ? 1 : 0);
