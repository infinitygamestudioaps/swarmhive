// THREADFLOOD-2026-11-03 (owner: "Relog not, find issue"): 13 characters froze ("Cannot move ... town ports did nothing") while L2Swarm's shared
// ThreadManager ran a crashing 'Script Path' worker ~15,000x a minute (NullReferenceException) after the academy create script's RequestRestart
// loops on accounts that still walked a path. Guards: the dashboard names the cause, and the create script stops walks before a restart.
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '../../..');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const SRV = fs.readFileSync(path.join(R, 'Dashboard/server.js'), 'utf8'), UI = fs.readFileSync(path.join(R, 'Dashboard/index.html'), 'utf8'), AA = fs.readFileSync(path.join(R, 'Dashboard/addaccount_api.js'), 'utf8');
const i = SRV.indexOf('function threadFloodScan('), j = SRV.indexOf('\n}\n', i) + 2;
const scan = new Function(SRV.slice(i, j) + '\nreturn threadFloodScan;')();
// replay of the live LOG.log lines (2026-11-03 18:32 local)
const at = Date.parse('2026-11-03T18:32:30+01:00'), line = (s) => `2026-11-03 18:32:${s}.778+01:00 [PID:7532] [ERROR] [ThreadManager.Shared.cs:189@BeginSharedWorker] Background thread 'Script Path-965ab48a-6260-4d52-8a77-a4f3074c15f2' failed:\nSystem.NullReferenceException: Objektreferencen er ikke indstillet til en forekomst af et objekt.\n   ved L2Swarm.Core.Threads.ThreadManager.E.A()`;
let txt = ''; for (let k = 0; k < 400; k++) txt += line(String(10 + (k % 20)).padStart(2, '0')) + '\n';
const f = scan(txt, at);
t('replay: the Script Path error loop is found (thread name without the id, count, exception)', f && f.thread === 'Script Path' && f.perMin === 400 && /NullReferenceException/.test(f.error));
t('a few errors (or old ones) are no flood', scan(line('10') + '\n' + line('11'), at) === null && scan(txt, at + 10 * 60000) === null);
t('the warning bar names the cause for every frozen character and says a relog does not help', /s\.why = `L2Swarm's '\$\{flood\.thread\}' worker fails/.test(SRV) && UI.includes("⚠ L2Swarm error loop:") && UI.includes("a relog does not help; restart L2Swarm") && UI.includes("${s.why ? ' - ' + esc(s.why) : ''}"));
t('the create script stops walks + combat and settles before every RequestRestart', /THREADFLOOD-2026-11-03: a RequestRestart[\s\S]{0,400}StopCombat\(\);[\s\S]{0,80}Send\.StopMove\(\);[\s\S]{0,200}await sleep\(3000\);[\s\S]{0,200}Send\.SendHex\('57'\)/.test(AA));
console.log(`thread flood: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
