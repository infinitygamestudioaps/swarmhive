// AUTOFUND 2026-10-22: Dashboard/autofund.js decide() (the adena share for poor characters of the scope)
const path = require('path'), R = path.join(__dirname, '..', '..', '..');
const A = require(path.join(R, 'Dashboard', 'autofund.js'));
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
const cfg = Object.assign({}, A.DEF, { on: true });
const scope = new Set(['Spoiler8', 'Spoiler14', 'Spoiler16', 'Spoiler7', 'Healer7']);
const st = (name, adena, o) => Object.assign({ name, adena, ageSec: 5, dead: false, party: name }, o || {});
const S = [st('Spoiler8', 55000), st('Spoiler14', 124000), st('Spoiler16', 8900000), st('Spoiler7', 7500000), st('Healer7', 345000), st('Dagger1', 90000000)];
const NOW = 1e13;
let d = A.decide(cfg, scope, S, new Set(), new Set(), {}, NOW);
t('the poorest gets it first (Spoiler8)', d.give && d.give.receiver === 'Spoiler8', d);
t('from the richest of the scope (Spoiler16), never outside the scope (Dagger1)', d.give && d.give.giver === 'Spoiler16', d);
t('the amount = give', d.give && d.give.amount === 1500000);
d = A.decide(cfg, scope, S, new Set(['Spoiler8', 'Spoiler16']), new Set(), {}, NOW);
t('busy (open order) receiver / giver are skipped', d.give && d.give.receiver === 'Spoiler14' && d.give.giver === 'Spoiler7', d);
d = A.decide(cfg, scope, S, new Set(), new Set(), { recv: { Spoiler8: NOW - 60000 } }, NOW);
t('helped lately (againMin) = skipped', d.give && d.give.receiver === 'Spoiler14', d);
d = A.decide(cfg, scope, S, new Set(), new Set(['Spoiler16']), {}, NOW);
t('a giver in a live raid party never gives', d.give && d.give.giver === 'Spoiler7', d);
d = A.decide(cfg, scope, [st('Spoiler8', 55000), st('Spoiler16', 4000000)], new Set(), new Set(), {}, NOW);
t('a giver keeps at least keep (4M - 1.5M < 3M = nobody)', !d.give && /keeps/.test(d.why), d);
d = A.decide(cfg, scope, [st('Spoiler8', 55000, { ageSec: 999 }), st('Spoiler16', 8900000)], new Set(), new Set(), {}, NOW);
t('offline receivers are skipped', !d.give, d);
d = A.decide(cfg, scope, [st('Spoiler8', 55000, { dead: true }), st('Spoiler16', 8900000)], new Set(), new Set(), {}, NOW);
t('dead receivers wait (they respawn first)', !d.give, d);
d = A.decide(cfg, scope, [st('Healer7', 600000), st('Spoiler16', 8900000)], new Set(), new Set(), {}, NOW);
t('nobody below the line = nothing', !d.give, d);
t('scope academy = clanAcademy / academy accounts', [...A.scopeNames(cfg, { accounts: [{ character: 'A', clanAcademy: true }, { character: 'B' }, { character: 'C', academyMage: true }] })].join() === 'A,C');
t('default is OFF (public package)', A.DEF.on === false);
d = A.decide(cfg, scope, [st('Spoiler8', 55000, { task: 'regroup: supply run' }), st('Spoiler14', 124000), st('Spoiler16', 8900000)], new Set(), new Set(), {}, NOW);
t('a character on a supply run / regroup is never interrupted', d.give && d.give.receiver === 'Spoiler14', d);
d = A.decide(cfg, scope, [st('Spoiler8', 55000), st('Spoiler16', 8900000, { task: 'trade -> ' }), st('Spoiler7', 7500000)], new Set(), new Set(), {}, NOW);
t('a giver in a trade is skipped', d.give && d.give.giver === 'Spoiler7', d);
// RESERVE-2026-11-01: a party with deposit.above 0 never deposits (Inspector1's 100M subclass money went to Dagger1 at 08:11)
{ const dd = A.depositDecide({ on: true, above: 20000000, keep: 10000000, againMin: 120 }, [{ name: 'Inspector1', party: 'Inspector1', adena: 100000000, ageSec: 5 }], 'Dagger1', new Set(), { Inspector1: { above: 0 } }, {}, Date.now());
  t('RESERVE: deposit.above 0 for a party = never a deposit (subclass money stays)', !dd, dd); }
const fs0 = require('fs');
const B = A.busyFromOrders([{ receiver: 'Dagger1', givers: ['Destroyer3'], sameTown: true, over: false }, { receiver: 'Bishop1', givers: ['Tank1'], over: false }, { receiver: 'X', givers: ['Y'], over: true }]);
t('ACADFUND + SAMETOWNGIVER: a pending same-town order makes nobody busy (it only waits for a town visit)', !B.has('Dagger1') && !B.has('Destroyer3'), [...B]);
t('ACADFUND: a normal open order makes receiver + giver busy, a finished one nobody', B.has('Bishop1') && B.has('Tank1') && !B.has('X') && !B.has('Y'), [...B]);
t('ACADFUND: tick uses busyFromOrders, recentOrders reports sameTown', fs0.readFileSync(path.join(R, 'Dashboard', 'autofund.js'), 'utf8').includes('busy = busyFromOrders(') && fs0.readFileSync(path.join(R, 'Dashboard', 'tradepage_api.js'), 'utf8').includes("sameTown: o.sameTown === true"));
const fs = require('fs'); const SRV =fs.readFileSync(path.join(R, 'Dashboard', 'server.js'), 'utf8');
t('server.js runs it every 3 min through /api/trade/order', SRV.includes("require('./autofund').tick(") && SRV.includes('}, 180000);'));
// IDLEGIVER-2026-11-02: a bank parked with "waiting for orders" gives; a real order / trade still counts as busy
t('IDLEGIVER: "waiting for orders" is idle', !A.busyTask('waiting for orders since 11:58 (order:town-Giran)') && A.busyTask('trade: handing over to X') && A.busyTask('order: supply run'));
{ const cfg = Object.assign({}, A.DEF, { on: true }), scope = new Set(['Velyn8584']);
  const st = [{ name: 'Velyn8584', adena: 1531, ageSec: 5, task: 'plan blocked' }, { name: 'Crafter1', adena: 342882785, ageSec: 1, task: 'waiting for orders since 11:58 (order:town-Giran)' }];
  const d = A.decide(cfg, scope, st, new Set(), new Set(), { recv: {} }, Date.now(), n => n === 'Crafter1');
  t('IDLEGIVER: the parked bank pays the broke academy character', d.give && d.give.giver === 'Crafter1' && d.give.receiver === 'Velyn8584', d); }
// DEPOSITKEEP-2026-11-02 (tester: leader top-up 100M, "never give away under 300M"; a party gave 700M and kept 16M)
{ const r = { defaults: { leaderTarget: 100000000, memberTarget: 3000000 }, parties: {}, chars: {} }, g = { keepAtLeast: 300000000, targetOf: A.fundTargetOf(r, '') };
  const dep = { on: true, above: 20000000, keep: 10000000, againMin: 120 };
  const d = A.depositDecide(dep, [{ name: 'Lead', party: 'Lead', adena: 716000000, ageSec: 5, gearNeed: 6000000 }], 'Bank', new Set(), {}, { dep: {} }, Date.now(), g);
  t('DEPOSITKEEP: the 700M leader keeps 300M ("Always keeps at least"), not 16M', d && d.amount === 416000000, d);
  t('DEPOSITKEEP: 125M under the 300M floor gives nothing', !A.depositDecide(dep, [{ name: 'Lead', party: 'Lead', adena: 125000000, ageSec: 5 }], 'Bank', new Set(), {}, { dep: {} }, Date.now(), g));
  const g2 = { keepAtLeast: 0, targetOf: A.fundTargetOf(r, '') };
  t('DEPOSITKEEP: the leader top-up target (100M) is kept too', A.depositKeep(10000000, { name: 'Lead', party: 'Lead' }, g2) === 100000000 && A.depositKeep(10000000, { name: 'Mem', party: 'Lead' }, g2) === 10000000);
  const r3 = { defaults: { leaderTarget: 8000000 }, parties: { Lead: { leaderTarget: 50000000 } }, chars: { Lead: { target: 70000000 } } };
  t('DEPOSITKEEP: target = own > party > default (as the Adena page shows)', A.fundTargetOf(r3, '')('Lead', 'Lead') === 70000000 && A.fundTargetOf({ defaults: { leaderTarget: 8000000 }, parties: { Lead: { leaderTarget: 50000000 } }, chars: {} }, '')('Lead', 'Lead') === 50000000);
  t('DEPOSITKEEP: without the new argument the old keep still works', A.depositDecide(dep, [{ name: 'Lead', party: 'Lead', adena: 100000000, ageSec: 5 }], 'Bank', new Set(), {}, { dep: {} }, Date.now()).amount === 90000000);
  t('DEPOSITKEEP: depositTick passes keepAtLeast + the targets', fs0.readFileSync(path.join(R, 'Dashboard', 'autofund.js'), 'utf8').includes('depositDecide(dep, states, col, busy, partyDep, mem, Date.now(), keepG)')); }
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
