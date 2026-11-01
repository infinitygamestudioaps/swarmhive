// test_hive_state.js - requirement engine.md R4 (owner 2026-11-01: "Make sure these bugs never happens again we keep State after restart of hive"):
// a hive pause / restart / deploy brings back exactly the state from before: running plans run again, their quests are not replaced.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SW = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const HP = fs.readFileSync(path.join(__dirname, 'hive_pause.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const { plansToRestart } = require('./hive_pause.js');
const st = { A: 'running', B: 'paused', C: 'done', D: '' };
t('PLANKEEP: plans that ran before the pause and do not run now get "!plan start" (paused / none); running and done ones not', JSON.stringify(plansToRestart(['A', 'B', 'C', 'D'], p => st[p])) === JSON.stringify(['B', 'D']));
t('PLANKEEP: the pause snapshot remembers the running plans, the resume checks them twice and restarts', HP.includes("const plans = on.filter(p => planStatus(p) === 'running');") && HP.includes("cmd: '!plan start', targets: ['party:' + p]") && HP.includes('for (const waitMs of [90000, 90000])'));
t('the CLI only runs when started directly (the test can load it)', HP.includes('if (require.main === module) main()'));
t('QUESTADOPT: a plan step adopts the quest the engine already resumed (deploy reload)', SW.includes("PLAN.seq = adopt ? orderState.seq : orderBegin(`plan: quest ${id}`);"));
t('STARTKEEPSQUEST: the resume\'s plain !start never replaces the plan\'s running quest', SW.includes('!startKeepsQuest(String(parts[0] || \'\').toLowerCase(), parts.length, qeS().running'));
t('a plan that ran during a script restart goes on with the same step (planResumeIv)', SW.includes("planRun('resume after a restart')"));
{ const i = SW.indexOf('function planBackOnDecide('); const D = new Function(SW.slice(i, SW.indexOf('\n', i)) + '\nreturn planBackOnDecide;')();
  const base = { on: true, running: false, planOn: true, left: 5, status: 'paused', why: 'the party was switched OFF — Start goes on with this step' };
  t('PLANBACKON: paused only because the party was OFF + ON again = the plan goes on by itself (any way it was switched on)', D(base));
  t('PLANBACKON: still OFF / already running / plan not used / finished = nothing', !D(Object.assign({}, base, { on: false })) && !D(Object.assign({}, base, { running: true })) && !D(Object.assign({}, base, { planOn: false })) && !D(Object.assign({}, base, { left: 0 })));
  t('PLANBACKON: paused by you / waiting for you / another reason = stays put', !D(Object.assign({}, base, { why: 'you paused the plan' })) && !D(Object.assign({}, base, { status: 'waiting' })) && !D(Object.assign({}, base, { why: 'your order "!town giran" took over' })));
  t('PLANBACKON: the 5 s watch runs planRun on it', SW.includes("planRun('the party is ON again')")); }
console.log(`hive state: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
