// RUNNERBTN-2026-11-02 (owner: "I dont see the Call collector under #/char/Spoiler3?? On mobile og pc"): a visible "🐎 Call the runner" button on
// every party card + the character page, greyed out with the reason, the runner state next to it, GET /api/crafterpage?view=runner. Sandbox only.
const fs = require('fs'), path = require('path'), os = require('os');
const R = path.join(__dirname, '..', '..', '..'), D = path.join(R, 'Dashboard');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const RC = fs.readFileSync(path.join(D, 'runnercall.js'), 'utf8');
const i0 = RC.indexOf('function decide('), i1 = RC.indexOf('const S = {', i0);
const P = new Function(RC.slice(i0, i1) + '\nreturn { decide, stateText };')();
const info = { runner: 'Dagger1', on: true, crafter: 'Crafter1', runnerParty: 'Dagger1', crafterParty: 'Crafter1', state: 'waiting for calls', cur: '', queue: ['Destroyer3'] };
t('a normal party may call the runner', P.decide(info, 'Spoiler10').ok === true);
t('no runner set = greyed out with the reason', !P.decide(Object.assign({}, info, { runner: '' }), 'Spoiler10').ok && /no runner set/.test(P.decide(Object.assign({}, info, { runner: '' }), 'Spoiler10').why));
t('runner switched off = greyed out', !P.decide(Object.assign({}, info, { on: false }), 'Spoiler10').ok && /switched off/.test(P.decide(Object.assign({}, info, { on: false }), 'Spoiler10').why));
t("the runner's own party and the crafter's party cannot call it", !P.decide(info, 'Dagger1').ok && !P.decide(info, 'Crafter1').ok);
t('state: waiting / called with queue position / on the way here', /waiting for calls/.test(P.stateText(info, 'Spoiler10')) && /#1 in the runner's queue/.test(P.stateText(info, 'Destroyer3')) && /on the way here/.test(P.stateText(Object.assign({}, info, { cur: 'Spoiler10' }), 'Spoiler10')));
// the API view (sandbox folders)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcall-')), DATA = path.join(tmp, 'data'), LOGS = path.join(tmp, 'logs'); fs.mkdirSync(DATA); fs.mkdirSync(LOGS);
fs.writeFileSync(path.join(DATA, 'crafter.json'), JSON.stringify({ runner: 'Dagger1', runnerOn: true, crafter: 'Crafter1' }));
fs.writeFileSync(path.join(DATA, 'crafter_rules.json'), JSON.stringify({ crafters: { Crafter1: { on: true } } }));
fs.writeFileSync(path.join(LOGS, 'runner_state.json'), JSON.stringify({ name: 'Dagger1', on: true, state: 'to Nuker19', cur: 'Nuker19', queue: [{ party: 'Char1' }, { party: 'Destroyer3' }] }));
const API = require(path.join(D, 'crafterpage_api.js'));
const v = API.runnerView({ DATA, LOGS, ROOT: tmp, DIR: D, teamMap: () => ({ Dagger1: ['Dagger1'], Crafter1: ['Crafter1', 'Spark'], Destroyer3: ['Destroyer3', 'Spoiler3'] }) });
t('GET ?view=runner: runner, on, crafter, their parties, state, queue', v.ok && v.runner === 'Dagger1' && v.on === true && v.crafter === 'Crafter1' && v.crafterParty === 'Crafter1' && v.cur === 'Nuker19' && v.queue.join(',') === 'Char1,Destroyer3', v);
t('partyOfName: a member maps to its leader', API.partyOfName({ Destroyer3: ['Destroyer3', 'Spoiler3'] }, 'Spoiler3') === 'Destroyer3');
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
// wiring
const IDX = fs.readFileSync(path.join(D, 'index.html'), 'utf8'), CPJ = fs.readFileSync(path.join(D, 'charpage.js'), 'utf8'), CA = fs.readFileSync(path.join(D, 'crafterpage_api.js'), 'utf8');
t('index.html loads runnercall.js and every party card shows the button', IDX.includes('<script src="/runnercall.js"></script>') && IDX.includes("${window.RunnerCall ? RunnerCall.button(leader) : ''}"));
t('the character page shows it for its party', CPJ.includes("${party && window.RunnerCall ? RunnerCall.button(party, true) : ''}"));
t('the server serves /runnercall.js and the light view', CA.includes("'/runnercall.js': 'text/javascript; charset=utf-8'") && CA.includes("url.searchParams.get('view') === 'runner'"));
t('the click sends the existing catalog order after confirmOrder', RC.includes("cmd = '!callrunner ' + leader") && RC.includes('await confirmOrder(target, cmd,') && fs.readFileSync(path.join(D, 'commands.js'), 'utf8').includes("id: 'callrunner'"));
console.log(`runnercall: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
