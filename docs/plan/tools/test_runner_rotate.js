// RUNNERROTATE + RUNNERPAGE-2026-11-03 guard tests (sandbox only, no game, no live dashboard)
// Owner: "the runner should be running back and fourth taking the farming characters drops back to the banker in town or even just adding them to
// clan warehouse" + "I want a page dedicated to the runner ... and make sure the state is kept EVEN after restart or redeployment".
const fs = require('fs'), path = require('path'), os = require('os');
const R = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x !== undefined ? ' ' + JSON.stringify(x).slice(0, 300) : '')); } };
// the pure block of swarm.js
const a = SRC.indexOf('// CRAFTRUN-PURE-BEGIN'), b = SRC.indexOf('// CRAFTRUN-PURE-END');
const P = new Function(SRC.slice(a, b) + '\nreturn { crunWorth, crunRotatePick, crunRotateNow, crunTripStep, crunTripResume, crunNext };')();
const NOW = Date.parse('2026-11-03T07:45:00Z'), MIN = 60000;
const off = (party, o) => Object.assign({ party, on: true, hunting: true, kinds: 30, bagPct: 40, at: NOW - 5000 }, o || {});

// worth
t('worth: > 20 kinds or > 50 % bag', P.crunWorth({ kinds: 21, bagPct: 0 }) && P.crunWorth({ kinds: 0, bagPct: 51 }) && !P.crunWorth({ kinds: 20, bagPct: 50 }));
// pick: never visited / longest ago first
{ const r = P.crunRotatePick([off('A'), off('B'), off('C')], { A: NOW - 90 * MIN, B: NOW - 200 * MIN }, NOW, 60, []);
  t('pick: never visited first (C), then the longest ago', r.pick && r.pick.party === 'C', r); }
{ const r = P.crunRotatePick([off('A'), off('B')], { A: NOW - 90 * MIN, B: NOW - 200 * MIN }, NOW, 60, []);
  t('pick: B (200 min ago) before A (90 min ago)', r.pick && r.pick.party === 'B', r); }
// rotateMin
{ const r = P.crunRotatePick([off('A')], { A: NOW - 30 * MIN }, NOW, 60, []);
  t('rotateMin: a party visited 30 min ago waits (next: A in 30 min)', !r.pick && r.next && r.next.party === 'A' && r.next.inMin === 30, r); }
// skip rules
{ const r = P.crunRotatePick([off('A', { on: false }), off('B', { hunting: false }), off('C', { kinds: 3, bagPct: 10 }), off('Crafter1'), off('Dagger1')], {}, NOW, 60, ['Dagger1', 'Crafter1']);
  t('skip: switched off / not hunting / nothing worth taking / the bank / the runner itself', !r.pick && /nothing worth taking/.test(r.why), r); }
{ const r = P.crunRotatePick([off('A', { at: NOW - 10 * MIN })], {}, NOW, 60, []);
  t('skip: an old answer (> 2 min) does not count', !r.pick, r); }
// a call always beats the rotation
t('call beats rotation: no rotation while a call waits', !P.crunRotateNow(1, true) && P.crunRotateNow(0, true) && !P.crunRotateNow(0, false));
// state kept over a restart: an unfinished trip goes back to the top of the queue
{ const trip = { party: 'Dravis723', step: 'handing over', startedAt: new Date(NOW - 10 * MIN).toISOString(), c: { party: 'Dravis723', needs: {}, at: NOW - 12 * MIN } };
  const q = P.crunTripResume([{ party: 'Kaelra702', at: NOW - 40 * MIN }, { party: 'Dravis723', at: NOW - 1 * MIN }], trip, NOW);
  t('restart: the cut-off trip is first again, not twice', q.length === 2 && q[0].party === 'Dravis723' && q[0].resumed && P.crunNext(q, NOW).party === 'Dravis723', q);
  t('restart: a finished trip / a trip older than 2 h is not resumed', P.crunTripResume([], Object.assign({}, trip, { step: 'done' }), NOW).length === 0 && P.crunTripResume([], Object.assign({}, trip, { startedAt: new Date(NOW - 3 * 3600000).toISOString() }), NOW).length === 0); }
t('trip steps: out / handing over / back / done', P.crunTripStep('to Nyxara05 (monsters up to 34)') === 'out' && P.crunTripStep('done with X: 1 shot hand-overs') === 'done' && P.crunTripStep('asking Crafter1 for 100x3949') === 'stocking up');

// source checks: the host side
t('source: the tick tries the rotation only with an empty queue', /if \(!c\) \{\s*CRUNS\.state = 'waiting for calls';\s*if \(g\.go && !autoLvl\.active && crunRotateTick\(S\)\) return;/.test(SRC));
t('source: the rotation serves through crunServe (same take rules, one trade per member, bank sells / stores)', /crunServe\(\{ party: o\.party, needs: o\.needs \|\| \{\}, out: false, rotate: true/.test(SRC));
t('source: leaders answer the ask with kinds / bag % / hunting / needs', /App\.on\('swarm\.runner\.rotask'[\s\S]{0,900}App\.emit\('swarm\.runner\.offer', \{ runner: S\.runner, party: Me\.Name, on(: on \|\| iw\.ok)?, hunting: crunHuntingNow\(\)[^}]{0,200}, kinds, bagPct, needs: crunPartyNeeds\(\)/.test(SRC));   // RUNNERRAID-2026-11-03: + raid parties between bosses
t('source: members publish what the runner could take (swarm.pos + swarm_state rl)', (SRC.match(/rl: \(\(\) => \{ try \{ return crunLoadMe\(\); \}/g) || []).length >= 2);
t('source: files under Logs are written tmp + copy (queue, trip, trips, rotation, bank)', /function crunAtomicWrite\(f, obj\)[\s\S]{0,200}File\.Copy\(tmp, f, true\)/.test(SRC) && /function crunQueueSave\(\) \{ crunAtomicWrite/.test(SRC) && /crunAtomicWrite\(crotFile\(\), CROT\.visited\)/.test(SRC) && /crunAtomicWrite\(crunTripsFile\(\)/.test(SRC));
t('source: a reload puts an unfinished trip back at the top', /File\.ReadAllText\(crunTripFile\(\)\)[\s\S]{0,200}crunTripResume\(CRUNS\.q, t, now\(\)\)/.test(SRC));
t('source: rotateOn / rotateMin read from crafter.json (default ON, 60 min)', /rotateOn: j\.rotateOn !== false, rotateMin: Math\.max\(10, Math\.min\(1440, Number\(j\.rotateMin\) \|\| 60\)\)/.test(SRC));
t('source: the bank books sold / crystallized / stored per delivery', /crunBankLog\(\{ party, kind: "sold"/.test(SRC) && /crunBankLog\(\{ party, kind: 'stored'/.test(SRC));

// the API on a sandbox folder (never the live Logs)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rnp-')); const L = path.join(tmp, 'Logs'), D = path.join(tmp, 'data'); fs.mkdirSync(L); fs.mkdirSync(D);
fs.writeFileSync(path.join(D, 'crafter.json'), JSON.stringify({ runner: 'Dagger1', runnerOn: true, bank: 'Crafter1', crafter: 'Crafter1', rotateMin: 45 }));
fs.writeFileSync(path.join(D, 'run_state.json'), JSON.stringify({ parties: { Dravis723: { on: true }, Kaelra702: { on: true } } }));
fs.writeFileSync(path.join(tmp, 'swarm.config.json'), JSON.stringify({ accounts: [{ character: 'Dravis723', party: 'Dravis723' }, { character: 'Shadwen055', party: 'Dravis723' }, { character: 'Kaelra702', party: 'Kaelra702' }, { character: 'Dagger1', party: 'Dagger1' }, { character: 'Crafter1', party: 'Crafter1' }] }));
fs.writeFileSync(path.join(L, 'runner_state.json'), JSON.stringify({ name: 'Dagger1', state: 'rotation: to Dravis723', at: new Date().toISOString(), queue: [{ party: 'Kaelra702', at: new Date().toISOString(), why: 'button' }], trip: { party: 'Dravis723', step: 'out', rotate: true, startedAt: new Date().toISOString() }, offers: [{ party: 'Dravis723', on: true, hunting: true, kinds: 40, bagPct: 60 }] }));
fs.writeFileSync(path.join(L, 'runner_trips.json'), JSON.stringify([{ at: new Date().toISOString(), party: 'Nyxara05', kinds: 68, adena: 0, items: [{ name: 'Coal', n: 272 }] }]));
fs.writeFileSync(path.join(L, 'runner_bank.json'), JSON.stringify([{ at: new Date().toISOString(), party: 'Nyxara05', kind: 'sold', kinds: 12, adena: 47688 }]));
const API = require(path.join(R, 'Dashboard/runner_api.js'));
const ctx = { DIR: path.join(R, 'Dashboard'), ROOT: tmp, LOGS: L, DATA: D, readStates: () => [{ name: 'Dravis723', ageSec: 5, task: 'autolevel: Cruma', rl: { k: 40, b: 60 } }, { name: 'Shadwen055', ageSec: 5, rl: { k: 12, b: 30 } }, { name: 'Kaelra702', ageSec: 5, task: 'autolevel: Cruma Tower (Lv30-35)', rl: { k: 2, b: 5 } }] };
const I = API.info(ctx);
t('API: runner settings, trip, queue, trips and bank rows', I.ok && I.runner.name === 'Dagger1' && I.runner.rotateMin === 45 && I.trip && I.trip.party === 'Dravis723' && I.queue.length === 1 && I.trips.length === 1 && I.bank.length === 1, I);
t('API: per party the members with kinds + bag %, never the runner / bank', I.parties.some(p => p.party === 'Dravis723' && p.members.length === 2 && p.kinds === 40 && p.bagPct === 60) && !I.parties.some(p => p.party === 'Dagger1' || p.party === 'Crafter1'), I.parties);
t('API: rotation line - Dravis723 next, Kaelra702 skipped (nothing worth taking)', I.rotation.next[0] && I.rotation.next[0].party === 'Dravis723' && I.rotation.skipped.some(s => s.party === 'Kaelra702' && /nothing worth/.test(s.why)), I.rotation);
t('API: edits - skip / up checked, written to runner_queue_edit.json', API.editRow({ op: 'nuke', party: 'X' }).error && API.editRow({ op: 'up', party: '<x>' }).error && API.post(ctx, { op: 'skip', party: 'Kaelra702' }).ok && JSON.parse(fs.readFileSync(path.join(L, 'runner_queue_edit.json'), 'utf8')).some(r => r.op === 'skip' && r.party === 'Kaelra702'));
const RS = fs.readFileSync(path.join(R, 'Dashboard/runner_api.js'), 'utf8');
t('API: the same files a restart reads (runner_queue / trip / trips / rotation / bank)', ['runner_state.json', 'runner_queue.json', 'runner_trip.json', 'runner_trips.json', 'runner_rotation.json', 'runner_bank.json'].every(f => RS.includes(f)));
// the page + wiring
const IDX = fs.readFileSync(path.join(R, 'Dashboard/index.html'), 'utf8'), SV = fs.readFileSync(path.join(R, 'Dashboard/server.js'), 'utf8'), PG = fs.readFileSync(path.join(R, 'Dashboard/runnerpage.js'), 'utf8');
t('page: menu entry, route and script tag', /data-tab="runner"/.test(IDX) && /RunnerPage\.route\(kind, arg\)/.test(IDX) && /<script src="\/runnerpage\.js"><\/script>/.test(IDX));
t('page: server hooks /api/runner + /runnerpage.js', /require\('\.\/runner_api'\)\.handle\(req, res, url/.test(SV));
t('page: queue, rotation, parties, trips, Call / Skip / Move up / on-off', ['Calls waiting', 'Rotation', 'What the parties have for the runner', 'Last trips', 'data-rnpcall', 'data-rnpskip', 'data-rnpup', 'data-rnpon', 'data-rnprot'].every(x => PG.includes(x)));
t('crafter page: rotation switch + minutes', /data-cfroton/.test(fs.readFileSync(path.join(R, 'Dashboard/crafterpage.js'), 'utf8')) && /rotateMin: 10 - 1440 minutes/.test(fs.readFileSync(path.join(R, 'Dashboard/crafterpage_api.js'), 'utf8')));
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
console.log(`runner rotate + page: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
