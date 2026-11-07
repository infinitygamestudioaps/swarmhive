// RUNNERMODE + BANKSTORE (2026-11-03, owner: "Why is dagger1 not acting like a runner? And crystallizing when parties inventories are full?
// That was the entire idea"): the runner never levels / plans / supply runs for itself, serves its queue (kept over restarts), parks in Giran;
// what it brings the bank goes into the clan warehouse where the Storage marks are sold / crystallized; a party below 100 % bag waits for it.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (n, c) => { if (c) { ok++; console.log('ok   ' + n); } else { bad++; console.log('FAIL ' + n); } };
const cut = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i); return i < 0 || j < 0 ? '' : SRC.slice(i, j); };
const P = new Function(cut('// CRAFTRUN-PURE-BEGIN', '// CRAFTRUN-PURE-END') + '\nreturn { crunRunnerMode, crunPrune, crunServeNow, crunFull100, crunBankRows, crunCallDecide, crunNext };')();
const T0 = Date.parse('2026-11-03T05:48:00Z');
// the live state of 2026-11-03 05:48 (runner_state.json): 3 calls, Dagger1 autolevelling at Forest of Mirrors
const q = [{ party: 'Dravis723', at: Date.parse('2026-11-03T02:02:49Z') }, { party: 'Dravwen5047', at: Date.parse('2026-11-03T02:06:40Z') }, { party: 'Spoiler13', at: Date.parse('2026-11-03T05:41:39Z') }];
t('runner mode: Dagger1 with runnerOn is the runner, off / another name is not', P.crunRunnerMode('Dagger1', 'Dagger1', true) && !P.crunRunnerMode('Dagger1', 'Dagger1', false) && !P.crunRunnerMode('Tank1', 'Dagger1', true));
t('replay: the 3.7 h old calls are pruned, Spoiler13 (7 min) is served next', P.crunPrune(q, T0).map(c => c.party).join() === 'Spoiler13' && P.crunNext(q, T0).party === 'Spoiler13');
t('replay: an idle runner (its own leveling no longer counts) serves at once', P.crunServeNow({ dead: false, trade: false, hov: false, combat: false, order: false }).go === true);
t('it waits only while dead / trading / fighting / an owner order', !P.crunServeNow({ dead: true }).go && !P.crunServeNow({ trade: true }).go && !P.crunServeNow({ combat: true }).go && !P.crunServeNow({ order: true }).go);
// party side: below 100 % the call holds the town trip, at 100 % the party goes itself
const base = { runner: 'Dagger1', runnerOn: true, runnerFresh: true, me: 'Dravis723', isCrafter: false, lastCallAt: 0, now: T0, low: ['Dravis723: bag nearly full'] };
t('a nearly full bag calls the runner (keep hunting)', P.crunCallDecide(base).call === true);
t('a 100 % full bag takes its own town trip', P.crunCallDecide(Object.assign({}, base, { full100: true })).call === false && /100 %/.test(P.crunCallDecide(Object.assign({}, base, { full100: true })).why));
t('crunFull100: slots / server refusal / weight', P.crunFull100({ count: 200, limit: 200 }) && P.crunFull100({ count: 150, limit: 200, refusedN: 150 }) && P.crunFull100({ count: 10, limit: 200, load: 100, maxLoad: 100 }) && !P.crunFull100({ count: 180, limit: 200 }));
// bank side: the delivery goes into the clan warehouse, crafting inputs and supplies stay
const bag = [{ id: 1864, name: 'Stem', count: 300 }, { id: 1458, name: 'Crystal: D-Grade', count: 900 }, { id: 3031, name: 'Spirit Ore', count: 50 }, { id: 57, name: 'Adena', count: 9 }, { id: 2059, name: 'Flamberge Blade', count: 2 }, { id: 1880, name: 'Steel', count: 4 }];
const rows = P.crunBankRows(bag, [1864, 1458, 3031, 57, 2059]).map(b => b.name).join();
t('bank store: Stem + Flamberge Blade go in; crystals, ore, adena and items not delivered stay', rows === 'Stem,Flamberge Blade');
// source checks
t('autoLevelLoop + leadLevel + planRun + the supply watch refuse in runner mode', (SRC.match(/runnerModeMe\(\)\) \{ note\(/g) || []).length >= 3 && /typeof runnerModeMe === 'function' && runnerModeMe\(\)\) return;\s+\/\/ RUNNERMODE/.test(SRC));
t('the runner tick stops an old leveling, parks in Giran, keeps the queue on disk', /autoLvl\.stop = true; note\('runner: stopping my own leveling/.test(SRC) && /runner: waiting for calls next to the crafter/.test(SRC) && /runner_queue\.json/.test(SRC) && /crunQueueSave\(\)/.test(SRC));
t('after the hand-over to the bank: swarm.runner.delivered -> crunBankStore -> stashDepositAt(npc, put, \'clan\')', /App\.emit\('swarm\.runner\.delivered'/.test(SRC) && /async function crunBankStore\([\s\S]{0,3000}stashDepositAt\(npc, put, 'clan'\)/.test(SRC));
// BANKSELL (owner: "Also crafter1 should sell junk from teams" + "When they deliver it")
{ const P2 = new Function(cut('// CRAFTRUN-PURE-BEGIN', '// CRAFTRUN-PURE-END') + '\nreturn { crunBankSellOnly };')();
  const list = [{ id: 1864, count: 300, objIds: [11] }, { id: 2059, count: 2, objIds: [21, 22] }, { id: 999, count: 5, objIds: [31] }];
  const only = P2.crunBankSellOnly(list, [1864, 2059]);
  t('bank sell: only the delivered kinds the sell pick would sell (stack = its count, single pieces = 1 each), nothing else of the bank', JSON.stringify(only) === JSON.stringify({ 11: 300, 21: 1, 22: 1 })); }
t('bank sell happens right after the hand-over: sellCandidatesEx -> whsSell(only) -> ledger npcsale per party, then crystallize (CRYM now), then the clan warehouse', /const pick = sellCandidatesEx\((\['none'\], \{ junk: true \})?\), only = crunBankSellOnly\(pick\.list, ids\)/.test(SRC) && /ledgerIn\('npcsale', Me\.Name, null, s\.n, s\.adena, `junk from \$\{party\}/.test(SRC) && /CRYM\.at = 0/.test(SRC) && SRC.indexOf('crunBankSellOnly(pick.list') < SRC.indexOf("stashDepositAt(npc, put, 'clan')"));
t('the runner collects junk on every visit (swarm.runner.here hands over crunHandRows), not only on a full-bag call', /App\.on\('swarm\.runner\.here'[\s\S]{0,800}crunHandRows\(hovBag\(\)\)/.test(SRC));
console.log(`runner mode: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
