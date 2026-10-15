// MARKET (2026-10-14): the store packet readers (A1 sell / BE buy / DF craft, layouts from Data/base.db PacketsGSServer), the visiting order,
// the buy packet (0x83) and the host wiring.   node docs/plan/tools/test_market.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const a = src.indexOf('// MARKET-PURE-BEGIN'), b = src.indexOf('// MARKET-PURE-END');
const M = new Function(src.slice(a, b) + '\nreturn { marketParse, marketOrder, marketBuyHex };')();
let fails = 0; const check = (c, n, info) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${!c && info ? ' — ' + info : ''}`); if (!c) fails++; };
// a tiny writer
const W = () => { const o = []; const w = { c: (v) => { o.push(v & 255); return w; }, h: (v) => { o.push(v & 255, (v >> 8) & 255); return w; }, d: (v) => { for (let i = 0; i < 4; i++) o.push((v >>> (8 * i)) & 255); return w; },
  q: (v) => { let x = BigInt(v); for (let i = 0; i < 8; i++) { o.push(Number(x & 255n)); x >>= 8n; } return w; }, out: () => o }; return w; };
const tail = (w, en) => { w.h(0).h(0).h(0).d(0).h(en).h(0).d(0).d(-1).d(-9999).h(-2).h(0); for (let i = 0; i < 6; i++) w.h(0); for (let i = 0; i < 3; i++) w.h(0); };
// A1 sell: 2 items
{ const w = W().c(0xA1).d(268000001).d(0).q(5000000).d(2);
  w.d(1).d(1466).d(0).q(25000); tail(w, 0); w.q(120).q(80);
  w.d(2).d(2382).d(0).q(1); tail(w, 4); w.q(9000000).q(5788000);
  const r = M.marketParse(w.out());
  check(r && r.kind === 'sell' && r.owner === 268000001 && r.items.length === 2 && r.items[0].id === 1466 && r.items[0].count === 25000 && r.items[0].price === 120 && r.items[1].id === 2382 && r.items[1].enchant === 4 && r.items[1].price === 9000000, 'A1 PrivateStoreListSell: owner, items (id, count, price, enchant)', JSON.stringify(r)); }
// package sale flag
{ const w = W().c(0xA1).d(7).d(1).q(0).d(0); check(M.marketParse(w.out()).kind === 'package', 'A1 with isPackageSale = package'); }
// BE buy: 1 item
{ const w = W().c(0xBE).d(268000002).q(0).d(1); w.d(0).d(1467).d(0).q(0); tail(w, 0); w.d(55).q(300).q(200).q(10000);
  const r = M.marketParse(w.out());
  check(r && r.kind === 'buy' && r.owner === 268000002 && r.items[0].id === 1467 && r.items[0].price === 300 && r.items[0].count === 10000, 'BE PrivateStoreListBuy: wanted count + price', JSON.stringify(r)); }
// DF craft
{ const w = W().c(0xDF).d(268000003).d(500).d(900).q(0).d(2).d(1804).d(0).q(150).d(1805).d(0).q(250);
  const r = M.marketParse(w.out());
  check(r && r.kind === 'craft' && r.recipes.length === 2 && r.recipes[1].recipeId === 1805 && r.recipes[1].cost === 250, 'DF RecipeShopSellList: recipes + cost', JSON.stringify(r)); }
check(M.marketParse([0x32, 1, 2, 3, 4, 5, 6, 7, 8]) === null && M.marketParse([0xA1, 1]) === null, 'other packets / too short = null');
const ord = M.marketOrder({ x: 0, y: 0 }, [{ x: 1000, y: 0, n: 'b' }, { x: 100, y: 0, n: 'a' }, { x: 5000, y: 0, n: 'c' }]);
check(ord.map(o => o.n).join() === 'a,b,c', 'visiting order: nearest next');
check(M.marketBuyHex(268000001, [{ objId: 5, count: 1000, price: 120 }]) === '83' + '01FBF90F'.toUpperCase().replace(/./g, (c) => c) .slice(0, 0) + (() => { const le = (v, n) => { let s = '', x = BigInt(v); for (let i = 0; i < n; i++) { s += Number(x & 255n).toString(16).padStart(2, '0').toUpperCase(); x >>= 8n; } return s; }; return le(268000001, 4) + le(1, 4) + le(5, 4) + le(1000, 8) + le(120, 8); })(), 'RequestPrivateStoreBuy 0x83: owner, count, objId, count, price (little-endian)');
check(/function OnIncomingPacket\(p\) \{\n  if \(!MKT\.cap\) return;/.test(src) && /Options\.EnableJSOnIncomingPacket = true/.test(src) && /Options\.EnableJSOnIncomingPacket = opt/.test(src), 'packets are read only while a scan runs (EnableJSOnIncomingPacket on, then back)');
check(/case '!market'/.test(src) && /rgWalk\(TD, \{ x: s\.x, y: s\.y, z: s\.z \}/.test(src), '!market order; walks the town street graph (atlas) to each shop');
console.log(fails ? `\n${fails} FAILED` : '\nall market checks passed'); process.exit(fails ? 1 : 0);
