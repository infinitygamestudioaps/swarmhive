// test_craftrun.js - requirement crafter.md (owner 2026-11-01: Crafter1 takes over all selling + crystallizing; the collector role runs to the
// parties, collects items / letters / materials and refills them with shots; "Parties should be supplied so they can run 24/7 in their areas").
// Pure blocks + source checks only (sandbox, never the live data or the game).
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i); return i < 0 || j < 0 ? '' : SRC.slice(i, j); };
const pure = cut('// CRAFTRUN-PURE-BEGIN', '// CRAFTRUN-PURE-END');
t('the CRAFTRUN pure block exists and has no host calls', pure.length > 0 && !/\b(Me|Inventory|Send|File|App|note|sleep|SayToParty)\./.test(pure.replace(/\/\/.*$/gm, '')));
const P = new Function(pure + '\nreturn { crunPrice, crunPay, crunWorker, crunCrafterMode, crunCallDecide, crunNext, crunMeetDecide, crunHandRows };')();
// A. the clan warehouse worker
t('A: the crafter is the clan warehouse worker; cwhWithdraw false = the clan leader', P.crunWorker('Crafter1', true, 'Dagger1') === 'Crafter1' && P.crunWorker('Crafter1', undefined, 'Dagger1') === 'Crafter1' && P.crunWorker('Crafter1', false, 'Dagger1') === 'Dagger1' && P.crunWorker('', true, 'Dagger1') === 'Dagger1');
const WA = require(path.join(ROOT, 'Dashboard', 'whauto_api.js'));
t('A: the dashboard (WHAUTO) picks the same worker', WA.workerPick('Crafter1', true, 'Dagger1') === 'Crafter1' && WA.workerPick('Crafter1', false, 'Dagger1') === 'Dagger1');
t('A: WHAUTO no longer refuses a collector that is not the clan leader; sells + crystallizes through the worker', !/only the clan leader can take items out` *;/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'whauto_api.js'), 'utf8')) && /const C = collector\(ctx\), CL = worker\(ctx\);/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'whauto_api.js'), 'utf8')));
t('A: the crystallize order (crafter_api cwhOrder) goes to the crafter itself when it is the worker', /cj\.crafter === crafter && cj\.cwhWithdraw !== false\) CL = crafter;/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'crafter_api.js'), 'utf8')));
// BANKCWH-2026-11-03 (owner: "Stop routed through Dagger1"): the clan warehouse actor (the bank / worker) takes out, sells (!whsell) and takes for itself
t('A: swarm.js lets the worker take out of the clan warehouse, sell it (!whsell) and take for itself (!whtake clan)', SRC.includes("Me.Name !== cwhWorkerName() && Me.Name !== cwhActorName() && !opts.memberTry") && SRC.includes('if (Me.Name !== cwhActorName()) return;   // CRAFTRUN A + BANKCWH') && SRC.includes("iAmCL = Me.Name === cwhActorName();"));
t('A: NPC sales and crystallizing write bank ledger rows', /ledgerIn\('npcsale'/.test(SRC) && /ledgerIn\('cry'/.test(SRC));
// ledger inbox (dashboard)
const CP = require(path.join(ROOT, 'Dashboard', 'crafterpage_api.js'));
const rows = CP.ingestLines('{"at":"2026-11-01T15:00:00Z","kind":"npcsale","who":"Crafter1","count":3,"adena":1200,"note":"x"}\r\nnot json\r\n{"kind":"bogus","who":"A","adena":1}\r\n{"kind":"sale","who":"Tank1","count":5000,"adena":400000}\r\n');
t('ledger inbox: good rows booked, broken / unknown kinds skipped', rows.length === 2 && rows[0].kind === 'npcsale' && rows[0].adena === 1200 && rows[1].who === 'Tank1');
t('ledger: npcsale + collect count as income', CP.ledgerSummary([{ kind: 'npcsale', adena: 100 }, { kind: 'collect', adena: 50 }, { kind: 'payout', adena: 30 }]).net === 120);
{ // ingest into a sandbox ledger once (byte offset)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crun-')), L = path.join(tmp, 'Logs'), D = path.join(tmp, 'data'); fs.mkdirSync(L); fs.mkdirSync(D);
  process.env.SWARM_CRAFTERPAGE_DIR = D;
  fs.writeFileSync(path.join(L, 'crafter_ledger_in.log'), '{"kind":"cry","who":"Crafter1","count":2,"adena":0}\r\n{"kind":"sale","who":"P1","count":1000,"adena":80000}\r\n');
  const n1 = CP.ingest({ LOGS: L, DATA: D }), n2 = CP.ingest({ LOGS: L, DATA: D });
  const led = JSON.parse(fs.readFileSync(path.join(D, 'crafter_ledger.json'), 'utf8')).rows;
  t('ledger inbox: booked once (offset), rows in crafter_ledger.json', n1 === 2 && n2 === 0 && led.length === 2);
  delete process.env.SWARM_CRAFTERPAGE_DIR; try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
}
// B. crafter mode
t('B: crafter mode = I am the crafter AND my crafter switch is on', P.crunCrafterMode('Crafter1', 'Crafter1', true) && !P.crunCrafterMode('Crafter1', 'Crafter1', false) && !P.crunCrafterMode('Spoiler1', 'Crafter1', true));
t('B: the crafter never levels / autolevels / supply-runs (gates in leadLevel, autoLevelLoop, the supply watch)', /async function leadLevel\([^)]*\) \{(?:\s*\n[^\n]*){0,3}\s*\n\s*if \(crafterModeMe\(\)\)/.test(SRC) && /async function autoLevelLoop\([^)]*\) \{\s*\n\s*if \(crafterModeMe\(\)\)/.test(SRC) && /if \(typeof crafterModeMe === 'function' && crafterModeMe\(\)\) return;\s+\/\/ CRAFTRUN B: the clan crafter never goes on a supply run/.test(SRC));
t('B: it goes back to Giran when idle elsewhere (once in 10 min)', SRC.includes("townCommand('crafter mode: back to Giran', 'Giran', { only: true })"));
// C. paid shots
t('C: NPC price x count (owner price overrides)', P.crunPay([{ id: 1466, n: 1000 }, { id: 3949, n: 500 }], {}) === 80000 + 21000 && P.crunPay([{ id: 1466, n: 10 }], { 1466: 100 }) === 1000 && P.crunPrice(99999, {}) === 0);
t('C: the supply run pays the bank for the crafter\'s shots (unless pays.<party> = false) + a ledger row', SRC.includes("const pay = S.pays[Me.Name] === false ? 0 : crunPay(paid, S.prices);") && /crunOrder\(S\.bank, \[\], pay, /.test(SRC) && /ledgerIn\('sale', Me\.Name/.test(SRC));
// D. the runner
const T = 1e12, base = { runner: 'Dagger1', runnerOn: true, runnerFresh: true, me: 'Tank1', isCrafter: false, lastCallAt: 0, now: T, low: ['Tank1: Soulshot (A) 120'] };
t('D: a low party calls the runner (on, online, not me / not the crafter)', P.crunCallDecide(base).call && !P.crunCallDecide(Object.assign({}, base, { runnerOn: false })).call && !P.crunCallDecide(Object.assign({}, base, { runnerFresh: false })).call && !P.crunCallDecide(Object.assign({}, base, { me: 'Dagger1' })).call && !P.crunCallDecide(Object.assign({}, base, { isCrafter: true })).call);
t('D: one call per 20 min (a pending call holds the supply run: no town trip)', !P.crunCallDecide(Object.assign({}, base, { lastCallAt: T - 60000 })).call && SRC.includes('if (!d.call) return /called less than/.test(d.why);'));
t('D: the supply watch calls the runner instead of a supply run', /if \(crunCallRunner\(low\)\) return;/.test(SRC) && SRC.indexOf('if (crunCallRunner(low)) return;') < SRC.indexOf('— starting a supply run`, true);'));
t('D: queue = out of shots first, then the oldest; stale calls dropped', P.crunNext([{ party: 'A', at: T - 1000 }, { party: 'B', at: T - 500, out: true }, { party: 'C', at: T - 3 * 3600000, out: true }], T).party === 'B' && P.crunNext([{ party: 'A', at: T - 1000 }, { party: 'D', at: T - 5000 }], T).party === 'D');
// RUNNERSTEALTH-2026-11-03 (owner: no level limit for the runner): the level + 5 limit is now the stealth-OFF behaviour; stealth ON walks in everywhere
t('D: stealth OFF: the runner walks in only where monsters <= its level + 5, else ONE member meets it; stealth ON: everywhere', P.crunMeetDecide(60, 56, false).walkIn && !P.crunMeetDecide(62, 56, false).walkIn && /ONE member/.test(P.crunMeetDecide(80, 56, false).why) && P.crunMeetDecide(80, 56).walkIn);
const hand = P.crunHandRows([{ id: 1872, name: 'Animal Bone', count: 50 }, { id: 1466, name: 'Soulshot (A-grade)', count: 9 }, { id: 3949, name: 'Blessed Spiritshot (C-Grade)' }, { id: 57, name: 'Adena' }, { id: 3876, name: 'L2Day - C' }, { id: 7832, name: "Apprentice Adventurer's Weapon Exchange Coupon" }, { id: 1, name: 'Sword', equipped: true }, { id: 2, name: 'Quest Thing', quest: true }, { id: 728, name: 'Mana Potion' }, { id: 736, name: 'Scroll of Escape' }]);
t('D: members hand loot / materials / letters - never shots, potions, scrolls, coupons, adena, worn or quest items', hand.map(r => r.name).join('|') === 'Animal Bone|L2Day - C');
t('D: the runner fights off / never ports in combat (townCommand + FIGHTOFF) and hands everything + the payment to the bank', /async function crunServe\(c\)[\s\S]*townCommand\('runner: back to the crafter'[\s\S]*crunOrder\(S\.bank, rows, give/.test(SRC));
t('D: members report their shot needs (sn) in swarm.pos', /sn: \(\(\) => \{ try \{ return crunMyNeeds\(\)/.test(SRC));
t('D: the runner state for the Crafter page (Logs/runner_state.json) + the page shows it', SRC.includes("'\\\\Logs\\\\runner_state.json'") && fs.readFileSync(path.join(ROOT, 'Dashboard', 'crafterpage.js'), 'utf8').includes('function runnerBox(d)'));
t('settings: runner / runnerOn / pays / cwhWithdraw saved by the Crafter page', /if \(b\.runner !== undefined\)/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'crafterpage_api.js'), 'utf8')));
// RUNNERCALL-2026-11-01 (owner: "Can I make a party call for collector?")
t('RUNNERCALL: !callrunner (party leader) calls the runner now (no 20-min limit, only with a runner switched on) + the catalog entry for the party Commands sheet',
  /case '!callrunner': \{[\s\S]{0,400}if \(!S\.runner \|\| !S\.runnerOn\)[\s\S]{0,300}App\.emit\('swarm\.runner\.call', \{ party: Me\.Name, needs: crunPartyNeeds\(\), out: false, manual: true/.test(SRC)
  && fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Dashboard', 'commands.js'), 'utf8').includes("tpl: '!callrunner {leader}'"));
console.log(`craftrun: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
