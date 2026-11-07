// EXCHOFF-2026-11-04 guard: every exchange takes the involved worn piece OFF first and puts the result (or the original) back on
// owner 14:20: "THIS IS THE SAME FOR ARMOR AND ACCESSORIES as well. HAVE TO BE OFF" (after Bishop2's SA list came back with 0 entries
// because she wore the sword: Pushkin's lists only show what is in the bag)
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const cut = (a, b) => { const i = SRC.indexOf(a); return i < 0 ? '' : SRC.slice(i, SRC.indexOf(b, i)); };

// 1) the helper pair, run on a stubbed inventory
const helpers = cut('async function exchOff(', 'async function ijBuyAt(');
const mk = () => {
  const inv = [{ objId: 1, Id: 84, IsEquiped: true }, { objId: 2, Id: 5295, IsEquiped: true }, { objId: 3, Id: 5296, IsEquiped: true }, { objId: 4, Id: 1061, IsEquiped: false }];
  const used = [], equipped = [];
  const env = { Inventory: { forEach: (f) => inv.forEach(f) }, Send: { UseItem: (o) => { used.push(o); const it = inv.find(i => i.objId === o); if (it) it.IsEquiped = !it.IsEquiped; } },
    sleep: async () => { }, now: (() => { let t = 0; return () => (t += 300); })(), num: Number, ijStatus: () => { }, logError: () => { },
    gearDb: () => ({ items: { 84: { s: 'rhand' }, 6313: { s: 'rhand' }, 5295: { s: 'gloves' }, 5768: { s: 'gloves' }, 5296: { s: 'feet' }, 5780: { s: 'feet' } } }),
    equipPiece: async (o) => { equipped.push(o); const it = inv.find(i => i.objId === o); if (it) it.IsEquiped = true; return true; },
    unsealData: () => ({ byUnsealed: { 5768: { sealed: 5295 }, 5780: { sealed: 5296 } } }) };
  const f = new Function(...Object.keys(env), helpers + '\nreturn { exchOff, exchBackOn, exchOffIds, exchUnsealSource };')(...Object.values(env));
  return { f, inv, used, equipped };
};
(async () => {
  { const E = mk(); const r = await E.f.exchOff([84], null);
    t('a worn weapon comes off and is verified unequipped before the exchange', r.ok && r.worn.length === 1 && E.inv.find(i => i.objId === 1).IsEquiped === false, r);
    E.inv.push({ objId: 9, Id: 6313, IsEquiped: false });            // the exchange made "Homunkulus's Sword - Acumen"
    await E.f.exchBackOn(r.worn, [6313], new Set());
    t('the SA weapon (the result) goes on in its place', E.equipped.includes(9) && !E.equipped.includes(1)); }
  { const E = mk(); const r = await E.f.exchOff([84], null); await E.f.exchBackOn(r.worn, [6313], new Set());
    t('a failed exchange puts the ORIGINAL back on (never left without the piece)', E.equipped.includes(1)); }
  { const E = mk(); const r = await E.f.exchOff([5295, 5296], null);
    t('armor + accessories too: both worn sealed pieces come off', r.worn.length === 2 && !E.inv.find(i => i.objId === 2).IsEquiped && !E.inv.find(i => i.objId === 3).IsEquiped);
    E.inv.push({ objId: 20, Id: 5768, IsEquiped: false }, { objId: 21, Id: 5780, IsEquiped: false });
    await E.f.exchBackOn(r.worn, [5768, 5780], new Set());
    t('the unsealed pieces go back on together', E.equipped.includes(20) && E.equipped.includes(21)); }
  { const E = mk(); const r = await E.f.exchOff([1061], null);
    t('a piece that is not worn: nothing taken off, nothing put on', r.ok && r.worn.length === 0 && E.used.length === 0); }
  { const E = mk();
    t('Pushkin unseal: the sealed source is found from the product id', JSON.stringify(E.f.exchOffIds({ npc: 'Pushkin' }, 5768)) === JSON.stringify([5295]));
    t('any exchange: the offer\'s ingredients (never adena) + offIds', JSON.stringify(E.f.exchOffIds({ npc: 'Alexandria', ings: [57, 84], offIds: [5296] }, 999).sort()) === JSON.stringify([5296, 84].sort())); }
  // 2) every exchange path uses the ONE helper
  const ba = cut('async function ijBuyAt(', '\nasync function ');
  t('ijBuyAt: pieces off BEFORE the list opens, back on in the finally', ba.indexOf('exchOff(exchOffIds(o, id), jid)') > 0 && ba.indexOf('exchOff(exchOffIds(o, id), jid)') < ba.indexOf('gscanClick(npc') && /finally \{[^\n]*await exchBackOn\(exw\.worn, \[id\], before\)/.test(ba));
  const sa = cut('async function ijSA(', 'async function ijEnchant(');
  t('ijSA (Special Ability) uses the shared helper (no own copy)', /const saOff = await exchOff\(\[wid\], jid\);/.test(sa) && /await exchBackOn\(saOff\.worn, \[num\(sa\.saId\)\], saBefore\)/.test(sa) && sa.indexOf('exchOff(') < sa.indexOf('openNpc(npc)') && !/saWasWorn/.test(SRC));
  const us = cut('async function unsealRun(', 'async function makeRun(');
  t('unsealRun (the path that worked for Destroyer8 12:03) now goes through the shared helper too', /kind: 'exchange', offIds: \[num\(x\.id\)\] \}/.test(us) && !/Send\.UseItem\(wornObj\)/.test(us));
  t('luxury / market exchange offers carry their ingredient ids (ings)', /ings: cost\.map\(c => num\(c\.id\)\)\.filter\(x => x > 0 && x !== 57\)/.test(SRC));
  console.log(`exchoff: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crashed ' + (e && e.stack || e)); process.exit(1); });
