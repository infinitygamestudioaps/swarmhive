// GEARDIST-2026-10-25 test: the gear-up's givers (distributors, clan leader) reserve what they offer; a sealed piece is offered with its unseal
// cost; offers only from givers standing in Giran; the luxury shop joins the shop index. Runs the swarm.js GEARDIST block in a sandbox (no game).
//   node docs/plan/tools/test_geardist.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const SW = fs.readFileSync(path.join(ROOT, fs.existsSync(path.join(ROOT, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev/swarm.js' : 'Scripts/swarm.js'), 'utf8');
let fails = 0; const t = (c, m, x) => { if (c) console.log('ok   ' + m); else { fails++; console.log('FAIL ' + m + (x !== undefined ? ' — ' + JSON.stringify(x).slice(0, 300) : '')); } };
const a = SW.indexOf('// ===== GEARDIST'), b = SW.indexOf('async function buyGearPicks(picks) {');
t(a > 0 && b > a, 'GEARDIST block found before buyGearPicks');
const block = SW.slice(a, b);
// one shared event bus, one sandbox per character
const bus = { h: {} }, chars = {};
function mk(name, o) {
  const emitted = [];
  const sb = {
    Me: { Name: name, IsDead: false }, IsInCombat: false, state: { role: 'x' }, CONFIG: { roster: { A1: 1, A2: 1, A3: 1, A4: 1, Dist: 1, Lead: 1 } },
    console, JSON, Math, Date, String, Number, Array, Object, Set, setTimeout: () => 0, num: (v) => { const n = Number(v); return isFinite(n) ? n : 0; },
    now: () => Date.now(), sleep: () => Promise.resolve(), note: () => { }, logError: (w, e) => { console.log('logError', w, e && e.message); },
    __SCRIPTS__: 'S', SWARM_ROOT: 'R', HOV_DIR: 'H', HOV_CFG: { batch: 1 },
    File: { ReadAllText: (p) => { if (/gear_sources/.test(p)) return JSON.stringify({ ownWh: true, clan: true, distributors: { on: true, names: ['Dist'] }, unseal: true });
      if (/unseal_h5/.test(p)) return fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'unseal_h5.json'), 'utf8');
      if (/clan_state/.test(p)) return JSON.stringify({ warehouse: { items: o.clanItems || [] } }); throw new Error('no ' + p); }, WriteAllText: (p, s) => { (sb._written = sb._written || []).push([p, s]); }, Exists: () => false },
    Inventory: { forEach: (f) => (o.bag || []).forEach(f) },
    currentTownKey: () => o.town || 'Giran', clanLeaderName: () => 'Lead',
    App: { on: (n, f) => { (bus.h[n] = bus.h[n] || []).push({ name, f }); }, emit: (n, d) => { emitted.push([n, d]); (bus.h[n] || []).forEach(x => { try { x.f({ data: d, source: { characterName: name } }); } catch (e) { console.log('handler', e.message); } }); } },
    hovBag: () => (o.bag || []).map(i => ({ id: i.Id, objId: i.objId, count: i.Count, name: 'x', equipped: !!i.IsEquiped })), hovCommand: () => { }, whClanFor: async () => { sb._clanFor = (sb._clanFor || 0) + 1; },
    whTake: async () => ({ got: [] }), bagCount: () => 0, itemCount: () => 99999999, ijBuyAt: async () => ({ ok: true }),
  };
  vm.createContext(sb); vm.runInContext(block + ';globalThis.GD = GD;', sb); sb.emitted = emitted; chars[name] = sb; return sb;
}
// SWORD = an S-grade-free test id that is NOT sealable; Dist holds one
const SWORD = 6365;
const dist = mk('Dist', { bag: [{ Id: SWORD, objId: 1001, Count: 1, IsEquiped: false }] });
const lead = mk('Lead', { clanItems: [] });
['A1', 'A2', 'A3', 'A4'].forEach(n => mk(n, {}));
// four askers, one after another (each waits for its offers; the reservation stays until it lapses)
const offers = {};
['A1', 'A2', 'A3', 'A4'].forEach(n => { const rid = n + '_r'; chars[n].GD.offers[rid] = []; chars[n].App.emit('swarm.gearask', { rid, from: n, ids: [{ id: SWORD }] }); offers[n] = chars[n].GD.offers[rid].length; });
t(offers.A1 === 1 && offers.A2 + offers.A3 + offers.A4 === 0, 'one piece, four askers: exactly ONE gets an offer (the reservation)', offers);
t(dist.gdReserved(SWORD) === 1, 'the distributor holds one reservation for it');
// accepting: the giver writes a hand-over order for the receiver
chars.A1.App.emit('swarm.gearaccept', { rid: 'A1_r', by: 'Dist', to: 'A1' });
setTimeout(() => { }, 0);
Promise.resolve().then(() => {
  t((dist._written || []).some(([p, s]) => /gd_a1_/.test(p) && /"receiver":"A1"/.test(s)), 'accept -> the distributor writes a hand-over order to A1', dist._written);
  // not in Giran -> no offer
  const far = mk('Dist2', { bag: [{ Id: SWORD, objId: 2002, Count: 1 }], town: 'Dion' }); far.CONFIG.roster.Dist2 = 1;
  // clan leader: a clan warehouse piece is offered, reserved once
  const PIECE = 9416;   // Dynasty Breast Plate (S, sealable: Sealed Dynasty Breast Plate 9514)
  const lead2 = chars.Lead; lead2.File.ReadAllText = ((orig) => (p) => /clan_state/.test(p) ? JSON.stringify({ warehouse: { items: [{ id: 9514, count: 1, enchant: 0 }] } }) : orig(p))(lead2.File.ReadAllText);
  const rid = 'A2_s'; chars.A2.GD.offers[rid] = [];
  const u = chars.A2.unsealData(), rr = u.byUnsealed[PIECE];
  t(rr && rr.sealed === 9514 && rr.aa > 0, 'unseal table: Dynasty Breast Plate <- Sealed Dynasty Breast Plate + Ancient Adena', rr);
  const c = chars.A2.gdUnsealCost(9514);
  t(c && c.id === PIECE && c.pay === 5575 && /Release the S-grade armor seal/.test(c.label), 'an S piece unseals with Ancient Adena at Pushkin ("Release the S-grade armor seal")', c);
  chars.A2.App.emit('swarm.gearask', { rid, from: 'A2', ids: [{ id: PIECE }, { id: 9514, sealed: true, pay: 5575, payN: c.count }] });
  const o = chars.A2.GD.offers[rid];
  t(o.length === 1 && o[0].by === 'Lead' && o[0].src === 'clan' && o[0].sealed === true, 'the clan leader offers the SEALED piece from the clan warehouse', o);
  const rid2 = 'A3_s'; chars.A3.GD.offers[rid2] = [];
  chars.A3.App.emit('swarm.gearask', { rid: rid2, from: 'A3', ids: [{ id: PIECE }, { id: 9514, sealed: true, pay: 5575, payN: c.count }] });
  t(chars.A3.GD.offers[rid2].length === 0, 'the same clan piece is not offered twice');
  const ca = chars.A2.gdUnsealCost(Object.keys(u.bySealed).map(Number).find(id => u.bySealed[id].list === 311262506));
  t(ca && ca.pay === 57 && /Release the A-grade armor seal/.test(ca.label), 'an A piece unseals for adena ("Release the A-grade armor seal")', ca);
  // the luxury shop joins the gear shop index (source check)
  t(/LUXURY-2026-10-25/.test(SW) && /giran_market\.json/.test(SW.slice(SW.indexOf('function giranShopIndex'), SW.indexOf('function giranShopIndex') + 6000)), 'giranShopIndex also reads the luxury shop offers (giran_market.json)');
  t(/if \(G\.offer\.market\) \{/.test(SW) && /ijBuyAt\(G\.offer\.market, p\.id, 1/.test(SW), 'a luxury offer is bought with ijBuyAt (exchange)');
  t(/const ownedRes = await gearOwnedFirst\(plan\.buys, why\);/.test(SW) && /buyGearPicks\(plan\.buys\.filter\(p => !p\.bought\)\)/.test(SW), 'the gear-up looks for owned pieces BEFORE buying, buys only the rest');
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
});
