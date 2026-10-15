// PSHOP (2026-10-15, owner "Shots step 2"): B / A / S shots from PLAYER shops in Giran at or below a max price, in supply runs.
// Pure picking logic (swarm.js PSHOP-PURE): settings, scan freshness, max price, cheapest first, partial fills, keep (reserve) + budget,
// the live re-check; the RequestPrivateStoreBuy (0x83) bytes against L2Swarm's own packet catalog (Data/base.db PacketsGSClient);
// the same settings reading in Dashboard/partyauto_api.js; the wiring in leadSupply.   node docs/plan/tools/test_pshop_shots.js
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b); if (i < 0 || j < i) throw new Error('block missing: ' + a); return src.slice(i, j); };
const P = new Function(cut('// MARKET-PURE-BEGIN', '// MARKET-PURE-END') + cut('// PSHOP-PURE-BEGIN', '// PSHOP-PURE-END') +
  '\nreturn { marketParse, marketBuyHex, mktBytes, pshopItem, pshopCfg, pshopMaxFor, pshopFresh, pshopOffers, pshopPlan, pshopLiveRows, pshopFmt, PSHOP_ALT, PSHOP_DEF };')();
const API = require(path.join(ROOT, 'Dashboard', 'partyauto_api.js'));
let fails = 0; const check = (c, n, info) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${!c && info ? ' — ' + info : ''}`); if (!c) fails++; };

// ---- items
check(P.pshopItem(1465).name === 'Soulshot (B)' && P.pshopItem(1467).g === 'S' && P.pshopItem(3951).kind === 'blessed' && P.pshopItem(2514).kind === 'spiritshot', 'shot ids: soulshot 1465-1467, blessed 3950-3952, spiritshot 2512-2514');
check(P.pshopItem(1463) === null && P.pshopItem(3949) === null && P.pshopItem(57) === null, 'D / C shots and adena are not player-shop items (Helvetia sells them)');
check(P.PSHOP_ALT[3950] === 2512 && P.PSHOP_ALT[3952] === 2514, 'blessed -> plain spiritshot of the same grade');
check(P.pshopFmt(1500) === '1,500' && P.pshopFmt(12) === '12' && P.pshopFmt(5000000) === '5,000,000', 'thousands separators');

// ---- settings: default OFF; party > default; numbers cleaned; same as the dashboard API
const J = { default: { pshop: { on: true, max: { soulshot: { B: 9 } } } }, parties: { Q: { pshop: { on: true, max: { soulshot: { B: 12, A: '30', S: -1 }, blessed: { S: 1500 } }, budget: 2000000, keep: 0, maxAgeMin: 60, scan: false } }, Off: { sell: true } } };
const cQ = P.pshopCfg(J, 'Q'), cOff = P.pshopCfg(J, 'Off'), cNone = P.pshopCfg({}, 'Q');
check(cNone.on === false && cNone.src === 'none' && cNone.budget === 5000000 && cNone.keep === 1000000 && cNone.maxAgeMin === 120 && cNone.scan === true, 'no file / no entry = OFF with the defaults (5,000,000 per run, keep 1,000,000, scan max 120 min old)');
check(cQ.on && cQ.max.soulshot.B === 12 && cQ.max.soulshot.A === 30 && cQ.max.soulshot.S === 0 && cQ.max.blessed.S === 1500 && cQ.budget === 2000000 && cQ.keep === 0 && cQ.maxAgeMin === 60 && cQ.scan === false && cQ.src === 'party', 'the party table wins; a negative price = not bought', JSON.stringify(cQ));
check(cOff.on === true && cOff.max.soulshot.B === 9 && cOff.src === 'default', 'a party without its own table uses default.pshop');
check(P.pshopCfg({ parties: { Q: { pshop: { on: 'yes' } } } }, 'Q').on === false, '"on" must be exactly true');
['Q', 'Off', 'x'].forEach(L => { const a = P.pshopCfg(J, L), b = API.pshopCfg(J, L); check(JSON.stringify(a) === JSON.stringify(b), `swarm.js pshopCfg = Dashboard/partyauto_api.js pshopCfg (party ${L})`, JSON.stringify(a) + ' vs ' + JSON.stringify(b)); });
check(P.pshopMaxFor(cQ, 1465) === 12 && P.pshopMaxFor(cQ, 1467) === 0 && P.pshopMaxFor(cQ, 1463) === 0, 'max price per item (0 = never)');

// ---- freshness
const T = Date.parse('2026-10-15T10:00:00Z');
check(P.pshopFresh({ at: '2026-10-15T09:00:00Z' }, T, 120).fresh === true && P.pshopFresh({ at: '2026-10-15T07:00:00Z' }, T, 120).fresh === false && P.pshopFresh({ at: '2026-10-15T07:00:00Z' }, T, 120).ageMin === 180, 'a scan older than maxAgeMin is stale (age in minutes)');
check(P.pshopFresh(null, T, 120).fresh === false && P.pshopFresh(null, T, 120).ageMin === null && P.pshopFresh({ at: 'bad' }, T, 120).fresh === false, 'no scan / a bad date = stale');

// ---- offers: read sell shops only, cheapest first, then the bigger stack
const shop = (owner, objId, type, items, read = true) => ({ owner, objId, x: 82500 + objId % 100, y: 148500, z: -3472, type, read, items });
const M = { at: '2026-10-15T09:30:00Z', shops: [
  shop('Cheap', 1, 'sell', [{ id: 1465, count: 300, price: 10 }, { id: 3950, count: 1000, price: 40 }]),
  shop('Mid', 2, 'sell', [{ id: 1465, count: 5000, price: 11 }]),
  shop('MidBig', 3, 'sell', [{ id: 1465, count: 9000, price: 11 }]),
  shop('Dear', 4, 'sell', [{ id: 1465, count: 99999, price: 15 }, { id: 2512, count: 3000, price: 25 }]),
  shop('Pack', 5, 'package', [{ id: 1465, count: 99999, price: 1 }]),
  shop('Buyer', 6, 'buy', [{ id: 1465, count: 99999, price: 2 }]),
  shop('Unread', 7, 'sell', [{ id: 1465, count: 99999, price: 1 }], false),
  shop('Zero', 8, 'sell', [{ id: 1465, count: 0, price: 1 }, { id: 1465, count: 10, price: 0 }]),
] };
const off = P.pshopOffers(M, 1465);
check(off.map(o => o.owner).join() === 'Cheap,MidBig,Mid,Dear', 'offers: sell shops that were read, cheapest first, the bigger stack first at the same price; package / buy / unread / empty left out', off.map(o => o.owner + ':' + o.price).join());

// ---- the plan
const cfg = (o) => Object.assign(P.pshopCfg({}, 'x'), { on: true, max: { soulshot: { B: 12, A: 0, S: 0 }, blessed: { B: 40, A: 0, S: 0 }, spiritshot: { B: 0, A: 0, S: 0 } }, keep: 0, budget: 1e12 }, o || {});
{ const p = P.pshopPlan([{ id: 1465, short: 6000 }], M, cfg(), 1e9);
  check(p.picks.map(x => `${x.owner}:${x.count}@${x.price}`).join() === 'Cheap:300@10,MidBig:5700@11' && p.spend === 300 * 10 + 5700 * 11 && p.left[1465] === 0 && !p.warn.length, 'cheapest first, partial fills until the need is covered', JSON.stringify(p)); }
{ const p = P.pshopPlan([{ id: 1465, short: 50000 }], M, cfg(), 1e9);
  check(p.picks.every(x => x.price <= 12) && p.picks.reduce((a, x) => a + x.count, 0) === 300 + 9000 + 5000 && p.left[1465] === 50000 - 14300 && /only 14,300 of 50,000 on offer at or below 12 adena/.test(p.warn[0]), 'never an offer above the max price (Dear at 15 is skipped); a short supply is said', JSON.stringify(p.warn)); }
{ const p = P.pshopPlan([{ id: 1465, short: 1000 }], M, cfg({ max: { soulshot: { B: 9, A: 0, S: 0 }, blessed: { B: 0, A: 0, S: 0 }, spiritshot: { B: 0, A: 0, S: 0 } } }), 1e9);
  check(!p.picks.length && p.warn[0] === 'no Soulshot (B) at or below 9 adena — cheapest seen 10 at Cheap' && p.left[1465] === 1000, 'nothing cheap enough: warn with the cheapest price seen and the shop (warn, never refuse)', p.warn[0]); }
{ const p = P.pshopPlan([{ id: 1466, short: 100 }], M, cfg({ max: { soulshot: { B: 12, A: 50, S: 0 }, blessed: { B: 0, A: 0, S: 0 }, spiritshot: { B: 0, A: 0, S: 0 } } }), 1e9);
  check(!p.picks.length && p.warn[0] === 'no Soulshot (A) in any player shop of the last scan', 'not on offer at all: said so', p.warn[0]); }
{ const p = P.pshopPlan([{ id: 1467, short: 100 }], M, cfg(), 1e9);
  check(!p.picks.length && /Soulshot \(S\): no max price set/.test(p.warn[0]), 'no max price = never bought from players (said)', p.warn[0]); }
{ const p = P.pshopPlan([{ id: 1465, short: 6000 }], M, cfg({ keep: 1000000 }), 1000000 + 3000 + 110);
  check(p.picks.map(x => `${x.owner}:${x.count}`).join() === 'Cheap:300,MidBig:10' && p.spend === 3110 && /adena for this run is used up \(keep 1,000,000/.test(p.warn[0]), 'the leader never goes below "always keep"', JSON.stringify(p)); }
{ const p = P.pshopPlan([{ id: 1465, short: 6000 }, { id: 3950, short: 500 }], M, cfg({ budget: 3000 + 1100 }), 1e9);
  check(p.spend <= 4100 && p.picks.map(x => `${x.owner}:${x.id}:${x.count}`).join() === 'Cheap:1465:300,MidBig:1465:100' && p.left[3950] === 500 && p.warn.length === 2, 'the per-run budget is shared by every item, in the need order', JSON.stringify(p)); }
{ const p = P.pshopPlan([{ id: 1465, short: 0 }, { id: 57, short: 9 }], M, cfg(), 1e9);
  check(!p.picks.length && !p.warn.length, 'no need / not a shot = nothing'); }
{ const p = P.pshopPlan([{ id: 1465, short: 100 }], M, cfg(), -5);
  check(!p.picks.length && p.spend === 0, 'no adena = nothing (never a negative spend)'); }

// ---- the live re-check in the shop
{ const live = [{ id: 1465, count: 200, price: 10, oid: 501 }, { id: 1465, count: 900, price: 12, oid: 502 }, { id: 1465, count: 900, price: 13, oid: 503 }, { id: 3950, count: 9, price: 1, oid: 504 }];
  const r = P.pshopLiveRows(live, 1465, 12, 500, 1e9);
  check(JSON.stringify(r.rows) === JSON.stringify([{ objId: 501, count: 200, price: 10 }, { objId: 502, count: 300, price: 12 }]) && r.spend === 2000 + 3600, 'live: cheapest rows at or below the max, the seller\'s objectIds, up to the need', JSON.stringify(r));
  const r2 = P.pshopLiveRows([{ id: 1465, count: 900, price: 14, oid: 9 }], 1465, 12, 500, 1e9);
  check(!r2.rows.length && r2.why === 'price now 14 (above your 12)', 'live: the price went up -> nothing bought, said why', r2.why);
  check(P.pshopLiveRows([], 1465, 12, 5, 1e9).why === 'sold out' && P.pshopLiveRows([{ id: 1465, count: 9, price: 10 }], 1465, 12, 5, 1e9).why === 'sold out', 'live: gone (or no objectId) = sold out');
  const r3 = P.pshopLiveRows(live, 1465, 12, 500, 2500);
  check(r3.rows.length === 2 && r3.rows[0].count === 200 && r3.rows[1].count === 41 && r3.spend <= 2500, 'live: never more than the adena left', JSON.stringify(r3));
  check(P.pshopLiveRows(live, 1465, 12, 500, 5).why === 'not enough adena left for one', 'live: not even one affordable = said'); }

// ---- the buy packet: RequestPrivateStoreBuy 0x83, little-endian, checked against L2Swarm's own catalog
{ const hex = P.marketBuyHex(268840580, [{ objId: 501, count: 200, price: 10 }, { objId: 0x12345678, count: 5000000000, price: 1500 }]);
  const B = Buffer.from(hex, 'hex');
  check(/^[0-9A-F]+$/.test(hex) && B[0] === 0x83 && B.length === 1 + 4 + 4 + 2 * 20, '0x83 + d owner + d count + count x 20 bytes (d objId, q count, q price); upper-case hex without spaces (Send.SendHex)', hex.length);
  check(B.readUInt32LE(1) === 268840580 && B.readUInt32LE(5) === 2 && B.readUInt32LE(9) === 501 && B.readBigUInt64LE(13) === 200n && B.readBigUInt64LE(21) === 10n
    && B.readUInt32LE(29) === 0x12345678 && B.readBigUInt64LE(33) === 5000000000n && B.readBigUInt64LE(41) === 1500n, 'every field little-endian, 64-bit counts above 4 billion survive'); }
// the catalog: Data/base.db is a ZIP; entry PacketsGSClient, line "83=RequestPrivateStoreBuy=..."
{ let line = null, why = '';
  try {
    const z = fs.readFileSync(path.join(ROOT, 'Data', 'base.db'));
    const eocd = z.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    let cd = z.readUInt32LE(eocd + 16); const n = z.readUInt16LE(eocd + 10);
    for (let i = 0; i < n; i++) {
      const meth = z.readUInt16LE(cd + 10), csz = z.readUInt32LE(cd + 20), nl = z.readUInt16LE(cd + 28), el = z.readUInt16LE(cd + 30), cl = z.readUInt16LE(cd + 32), off = z.readUInt32LE(cd + 42);
      const name = z.toString('utf8', cd + 46, cd + 46 + nl);
      if (name === 'PacketsGSClient' || name === 'PacketsGSServer') {
        const lnl = z.readUInt16LE(off + 26), lel = z.readUInt16LE(off + 28), data = z.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csz);
        const txt = (meth === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
        if (name === 'PacketsGSClient') line = (txt.split(/\r?\n/).find(l => /^83=RequestPrivateStoreBuy=/.test(l)) || '').trim();
        else { const a1 = txt.split(/\r?\n/).find(l => /^A1=PrivateStoreListSell=/.test(l)) || ''; check(/^A1=PrivateStoreListSell=d\(PlayerObjID\)d\(isPackageSale\)q\(Money\)d\(ItemsCount[^)]*\)d\(ObjectID\)d\(ItemID[^)]*\)d\(Slot\)q\(Count\)/.test(a1) && /q\(price\)q\(refPrice\)\s*$/.test(a1), 'catalog A1 PrivateStoreListSell: owner, package flag, money, then per item ObjectID, ItemID, Slot, Count ... price, refPrice (what marketParse reads)', a1.slice(0, 120)); }
      }
      cd += 46 + nl + el + cl;
    }
  } catch (e) { why = e.message; }
  if (line === null) console.log(`skip Data/base.db not readable here (${why || 'no PacketsGSClient'}) — the 0x83 layout is then unchecked against the catalog`);
  else check(line === '83=RequestPrivateStoreBuy=d(StorePlayerID)d(count:Loop.01.0003)d(ObjectID)q(Count)q(Price)', 'catalog: 83=RequestPrivateStoreBuy = d(StorePlayerID) d(count) loop[d(ObjectID) q(Count) q(Price)] — exactly what marketBuyHex writes', line); }

// ---- the dashboard API: validation of a POST
{ const e = []; const t = API.pshopIn({ on: true, max: { soulshot: { B: 12, A: 0 }, blessed: { S: '1500' } }, budget: 2000000, scan: false }, e);
  check(!e.length && JSON.stringify(t) === JSON.stringify({ on: true, scan: false, budget: 2000000, max: { soulshot: { B: 12 }, blessed: { S: 1500 } } }), 'API: a table is cleaned (0 prices dropped)', JSON.stringify(t) + ' ' + e.join());
  const e2 = []; API.pshopIn({ on: 1, max: { soulshot: { X: 5, B: 1.5 }, foo: {} }, keep: -1, maxAgeMin: 2, junk: 1 }, e2);
  check(e2.length >= 6, 'API: bad values are refused in plain words', e2.join(' | '));
  const a = API.applyChange({ parties: { Q: { sell: true } } }, { party: 'Q', pshop: { on: true, max: { soulshot: { B: 12 } } } });
  const b = API.applyChange(a.data, { party: 'Q', pshop: null });
  check(a.ok && a.data.parties.Q.pshop.on === true && a.data.parties.Q.sell === true && b.ok && !b.data.parties.Q.pshop && b.data.parties.Q.sell === true, 'API: a party table is saved next to the other switches; null removes it');
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'party_auto.json'), 'utf8').replace(/^﻿/, ''));
  const anyOn = Object.keys(live.parties || {}).filter(L => P.pshopCfg(live, L).on).concat(P.pshopCfg(live, '__nobody__').on ? ['default'] : []);
  console.log(`info the live party_auto.json: player-shop shots ON for ${anyOn.length ? anyOn.join(', ') : 'nobody'} (default OFF)`); }

// ---- wiring (host code, read as text)
{ const ls = src.slice(src.indexOf('async function leadSupply('), src.indexOf('async function leadSupply(') + 40000);
  const iShop = ls.indexOf("T.mark('shop'"), iP = ls.indexOf('pshopRes = await pshopBuyRun(buys, why)'), iHand = ls.indexOf("pstStep('supply', 'hand out'");
  check(iShop > 0 && iP > iShop && iHand > iP, 'leadSupply: the player-shop step runs after Helvetia and before the hand-out');
  check(/pshopCfg\(pautoData\(\), CONFIG\.leader\)\.on && buys\.some/.test(ls), 'leadSupply: only when the party switched it on and something B/A/S is still short');
  check(/target: myWant \+ t\.members/.test(ls), 'buys carry the target (what the leader must hold after buying)');
  check(/PSHOP_ALT\[n\.id\]/.test(ls) && /pshopRes\.plain\[alt\] -= g2/.test(ls), 'hand-out: plain spiritshots bought this run stand in for missing blessed ones');
  const run = src.slice(src.indexOf('async function pshopBuyRun('), src.indexOf('async function pshopBuyRun(') + 9000);
  check(/if \(!cfg\.on\) return null;/.test(run), 'pshopBuyRun: OFF = nothing (no walk, no buy)');
  check(/pshopFresh\(market, Date\.now\(\), cfg\.maxAgeMin\)/.test(run) && /marketScanRun\('Giran'/.test(run) && /if \(!cfg\.scan\)/.test(run), 'stale scan: scanned first when allowed, else skipped with a note');
  check(/pshopLiveRows\(g\.items, id, max/.test(run) && /Send\.SendHex\(marketBuyHex\(s\.objId, rows\)\)/.test(run), 'buys only after the live list was re-read, with the seller\'s objectIds and the live price');
  check(/itemCount\(w\.id\) > before\[w\.id\]/.test(run) && /pshop_buys\.log/.test(src) && /pshop_last_/.test(run) && /intent\('pshop'/.test(run), 'verifies the bag count rose; logs Logs/pshop_buys.log + Logs/pshop_last_<leader>.json + intent');
  check(/Math\.min\(itemCount\(57\) - cfg\.keep, cfg\.budget - res\.spent\)/.test(run), 'live: keep + budget checked again before every packet');
  check(/marketWalk\(s, TD\)/.test(run) && /walkTo\(s\.x, s\.y, s\.z, 80/.test(run), 'walks the market scan\'s way (town street graph), then within 150 of the seller (L2J interaction range)');
  check(/case '!pshop'/.test(src) && /!pshop plan\|buy/.test(src), '!pshop plan|buy order (dry run + a small live test)');
  check(/alt: PSHOP_ALT\[sid\] \|\| 0/.test(src) && /itemCount\(w\.id\) \+ \(w\.alt \? itemCount\(w\.alt\) : 0\)/.test(src) && /id = PSHOP_ALT\[id\];/.test(src), 'plain spiritshots of my grade count as shots (supply need) and are used when the blessed ones are gone'); }

console.log(fails ? `\n${fails} FAILED` : '\nall player-shop shot checks passed'); process.exit(fails ? 1 : 0);
