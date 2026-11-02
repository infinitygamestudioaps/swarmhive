// GEARBATCH-2026-11-02 (tester Vykaax: "each bot makes 11!!! individual trades for 5x jewels, 5x armor, and 1x weapon"): the gear-up asks for
// every piece at once and each giver hands over ALL its pieces for one receiver in ONE hand-over. Pure checks + source checks (sandbox only).
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const num = v => Number(v) || 0;
const fn = (name) => { const i = SRC.indexOf('function ' + name + '('); if (i < 0) throw new Error('missing ' + name); let d = 0, j = SRC.indexOf('{', i); for (; j < SRC.length; j++) { if (SRC[j] === '{') d++; else if (SRC[j] === '}' && --d === 0) break; } return SRC.slice(i, j + 1); };
const F = new Function('num', [fn('gdBestOffer'), fn('gdGroupAccepts'), fn('gdBatchItems'), fn('gdBagRows')].join('\n') + '\nreturn { gdBestOffer, gdGroupAccepts, gdBatchItems, gdBagRows };')(num);

// Vykaax's case: one distributor holds 5 jewels + 5 armor + 1 weapon for one bot -> ONE accept (one hand-over)
const choices = Array.from({ length: 11 }, (_, i) => ({ rid: 'r' + i, by: 'Distri' }));
const g = F.gdGroupAccepts(choices);
check(Object.keys(g).length === 1 && g.Distri.length === 11, '11 pieces from one distributor = one accept with 11 reservations (was 11 trades)');
const g2 = F.gdGroupAccepts([{ rid: 'a', by: 'D1' }, { rid: 'b', by: 'Clan' }, { rid: 'c', by: 'D1' }]);
check(g2.D1.join() === 'a,c' && g2.Clan.join() === 'b', 'two givers = two hand-overs, each with its own pieces');

check(F.gdBestOffer([{ by: 'C', src: 'clan' }, { by: 'D', src: 'dist' }, { by: 'S', src: 'dist', sealed: true }]).by === 'D', 'best offer: unsealed distributor before the clan warehouse and before a sealed piece');
check(F.gdBestOffer([]) === null, 'no offer = buy it');

// giver side: items of several reservations in one delivery; two of the same ring = two different bag pieces
const list = [{ rid: 'r1', r: { id: 881, src: 'dist', for: 'X' } }, { rid: 'r2', r: { id: 881, src: 'dist', for: 'X' } }, { rid: 'r3', r: { id: 2384, src: 'dist', sealed: true, pay: 57, payN: 50000, for: 'X' } }, { rid: 'r4', r: { id: 6580, src: 'clan', for: 'X' } }];
const B = F.gdBatchItems(list);
check(B.bag.length === 3 && B.clan.length === 1 && B.adena === 50000, 'one batch: bag pieces, clan warehouse pieces and the unseal adena together');
const bag = [{ objId: 1, id: 881, name: 'Ring', equipped: false }, { objId: 2, id: 881, name: 'Ring', equipped: false }, { objId: 3, id: 881, name: 'Ring', equipped: true }];
const R = F.gdBagRows(bag, [{ id: 881, count: 1 }, { id: 881, count: 1 }, { id: 2384, count: 1 }]);
check(R.rows.length === 2 && R.rows[0].objId !== R.rows[1].objId && R.rows.every(r => r.objId !== 3), 'two rings = two different unequipped bag pieces (never the worn one)');
check(R.missing.join() === '2384', 'a piece that is gone is reported, the others still go (partial failure keeps the rest)');

// wiring
check(/App\.emit\('swarm\.gearaccept', \{ rids: groups\[by\], by, to: Me\.Name \}\)/.test(SRC), 'asker: one gearaccept per giver with all its reservations');
check(/if \(Array\.isArray\(d\.rids\)\)[\s\S]{0,400}gdDeliverMany\(mine\)/.test(SRC), 'giver: a batch accept is delivered by gdDeliverMany');
check(/async function gdDeliverMany[\s\S]{0,1600}batch: HOV_CFG\.batch, givers: \{ \[Me\.Name\]: \{ items: g\.rows, adena: B\.adena \} \}/.test(SRC), 'giver: ONE hand-over file with every piece (the machinery splits at its batch size)');
check(/did not hand it over in \$\{Math\.round\(S\.waitMs \/ 60000\)\} min - buying it/.test(SRC), 'a piece that never arrives is still bought');
console.log(`gear batch: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
