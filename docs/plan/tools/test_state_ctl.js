// STATECTL 2026-10-22 (owner: "Make sure we can control STATE for each account, we keep ending up in weird scenarios")
//   node docs/plan/tools/test_state_ctl.js [--live]     --live = also open the LIVE dashboard read-only (#/char/Tank1, #/parties) in headless Edge
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const R = path.join(__dirname, '..', '..', '..');
const S = fs.readFileSync(path.join(R, 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); } };
const a = S.indexOf('// STATECTL-PURE-BEGIN'), b = S.indexOf('// STATECTL-PURE-END');
t('pure block present', a > 0 && b > a);
const P = new Function(S.slice(a, b) + '\n; return { stateItems, stateParse, stateForMe };')();
// ---- builder
let it = P.stateItems({}, 0);
t('nothing holds = empty list', it.length === 0);
it = P.stateItems({ dead: true, escape: 'run', control: { owner: '!supply', level: 4, name: 'order', since: 5 }, order: { text: '!supply', at: 7 }, queued: [{ id: 'o1', cmd: '!level', state: 'delivered', at: 9 }],
  handover: 'h1', supply: 'gear upgrades', regroup: 'supplies', rescue: 'Bishop1', teamwalk: 'ToI point 3/9', routewalk: 'ToI', routesm: 'ToI — WALK_LEG', raid: 'Shaka', autolevel: 'Ant Nest',
  trade: 'Bishop1', buffturn: true, crystallize: true, hunttimer: '3 h left', plan: 'step 1/9', pause: true, run: { on: true } }, 0);
t('every holder becomes one item (21 given)', it.length === 21 && it[0].key === 'dead', it.map(x => x.key));
t('survival (escape) and dead can never be stopped', !it.find(x => x.key === 'escape').canStop && !it.find(x => x.key === 'dead').canStop);
t('orders, hand-over, supply, walks, leveling, trade can be stopped', ['order', 'queued:o1', 'handover', 'supply', 'regroup', 'rescue', 'teamwalk', 'routewalk', 'routesm', 'raid', 'autolevel', 'trade'].every(k => (it.find(x => x.key === k) || {}).canStop), it.filter(x => x.canStop).map(x => x.key));
t('control at P4 can be stopped, at P0/P1 (survival / unfreeze) not', P.stateItems({ control: { owner: 'x', level: 4 } }, 0)[0].canStop && !P.stateItems({ control: { owner: 'escape', level: 0 } }, 0)[0].canStop);
t('plain English labels', /order running: "!supply"/.test(it.find(x => x.key === 'order').label) && /run switch ON/.test(it.find(x => x.key === 'run').label));
t('max 22 items', P.stateItems({ queued: Array.from({ length: 30 }, (_, i) => ({ id: 'q' + i, cmd: 'x' })) }, 0).length <= 22);
// ---- parse
t('parse reset (default idle)', JSON.stringify(P.stateParse(['!state', 'reset', 'Spoiler8'])) === '{"act":"reset","who":"Spoiler8","mode":"idle"}');
t('parse reset resume', P.stateParse(['!state', 'reset', 'party:Tank1', 'resume']).mode === 'resume');
t('parse reset bad mode', !!P.stateParse(['!state', 'reset', 'X', 'go']).err);
t('parse stop <key>', JSON.stringify(P.stateParse(['!state', 'stop', 'Spoiler8', 'queued:o1'])) === '{"act":"stop","who":"Spoiler8","key":"queued:o1"}');
t('parse stop without key = error', !!P.stateParse(['!state', 'stop', 'Spoiler8']).err);
t('parse unknown act = error', !!P.stateParse(['!state', 'go', 'x']).err);
t('for me: my name / party:<my leader> only', P.stateForMe('spoiler8', 'Spoiler8', 'Spoiler8') && P.stateForMe('party:Tank1', 'Bishop1', 'Tank1') && !P.stateForMe('party:Destroyer3', 'Bishop1', 'Tank1') && !P.stateForMe('Bishop1', 'Spoiler8', 'Spoiler8'));
// ---- host wiring
t('swarm_state.stateCtl published (cached 5 s)', S.includes('stateCtl: (() => { try { return statePublic(); }') && S.includes('STATECTL.pubAt < 5000'));
t('!state command + the !ov route (no dashboard restart needed)', S.includes("if (cmd === '!state') { stateCommand(parts); return; }") && S.includes("if (act === 'state') { const r = stateCommand(['!state', rest[0] || '', Me.Name]"));
t('reset cancels orders (orderBegin + oqEnd) and clears stale files', /function stateReset\(mode, why\)[\s\S]{0,2600}orderBegin\('\(state reset\)'\)[\s\S]{0,2600}activityFile\(\)[\s\S]{0,400}routeSmFile\(\)[\s\S]{0,200}mtFile\(\)[\s\S]{0,200}crinPendFile\(\)/.test(S));
t('reset idle = run switch OFF; resume = the party Start', /if \(m === 'idle'\) \{\s*if \(isLeader\(\)\) \{ setLeadPaused\(true, 'state reset'\); runSetMine\(false/.test(S) && S.includes("if (isLeader()) runStartOrder(['!start']); else runStartOrder(['!start', Me.Name]);"));
t('only existing functions are used', ['abortRegroup', 'memberRouteStop', 'hovCommand', 'crinPendStop', 'crinPendRead', 'clearStuckTrade', 'runStartOrder', 'runSetMine', 'setLeadPaused', 'planStartNow', 'htClockMine', 'oqEnd', 'oqSave', 'orderBegin', 'activityFile', 'routeSmFile', 'mtFile', 'crinPendFile', 'orderFile', 'partyStatusPublic', 'runMine'].every(f => new RegExp('(function ' + f + '\\b|const ' + f + ' = )').test(S)));
// ---- catalog
const C = require(path.join(R, 'Dashboard', 'commands.js'));
const CAT = C.CATALOG || C.COMMANDS || C.LIST || null;
t('catalog: !state is a swarm word', C.SWARM_WORDS.includes('!state'));
const src = fs.readFileSync(path.join(R, 'Dashboard', 'commands.js'), 'utf8');
t('catalog: statereset + statestop entries', src.includes("id: 'statereset'") && src.includes("id: 'statestop'"));
t('commands doc regenerated', fs.readFileSync(path.join(R, 'docs', 'plan', 'dashboard_commands.md'), 'utf8').includes('!state reset'));
// ---- UI
const CPJ = fs.readFileSync(path.join(R, 'Dashboard', 'charpage.js'), 'utf8'), IDX = fs.readFileSync(path.join(R, 'Dashboard', 'index.html'), 'utf8'), CSS = fs.readFileSync(path.join(R, 'Dashboard', 'charpage.css'), 'utf8');
t('character page: State box in every layout', CPJ.includes("BOX('state', 'State — what holds it now'") && (CPJ.match(/\['live', 'state', 'map'/g) || []).length === 3);
t('party card: State section', IDX.includes('StateCtl.partyHtml(leader, list)'));
t('sends through "!ov <name> state ..." (allowed without a restart)', CPJ.includes("text: `!ov ${n} state ${args}`"));
t('styled dialog only, never alert/confirm', CPJ.includes('uiConfirm({ title: `Reset the state of') && !/[^.\w](alert|confirm)\(/.test(CPJ.slice(CPJ.indexOf('window.StateCtl = ')).replace(/uiConfirm\(/g, '').replace(/\/\/[^\n]*/g, '')));
t('no emoji icons in the State UI', !/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(CPJ.slice(CPJ.indexOf('window.StateCtl = '))));
t('styles', CSS.includes('.stc-row') && CSS.includes('details.stc-party'));
(async () => {
  if (process.argv.includes('--live')) {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(f => fs.existsSync(f));
    const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'stc-edge-')), DBG = 9300 + Math.floor(Math.random() * 500);
    const br = cp.spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
    try {
      let ws = null; for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
      const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
      let id = 0; const pend = {}, errors = [];
      sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); };
      const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; pend[i] = (m) => res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
      const ev = async (fn) => { const r = await cdp('Runtime.evaluate', { expression: '(' + fn.toString() + ')()', awaitPromise: true, returnByValue: true }); return r.result && r.result.value; };
      await cdp('Page.enable'); await cdp('Runtime.enable');
      await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await cdp('Page.navigate', { url: 'http://127.0.0.1:8090/#/char/Tank1' }); await sleep(12000);
      const box = await ev(() => { const b = document.getElementById('cp_state'); return b ? b.innerText.replace(/\s+/g, ' ').slice(0, 200) : null; });
      t('LIVE: the State box renders on #/char/Tank1', !!box, box);
      t('LIVE: Reset buttons present once the bot publishes its list (not clicked); before the deploy it says so', await ev(() => document.querySelectorAll('#cp_state [data-stctl="reset"]').length === 2) || /after the next swarm.js update/.test(box || ''), box);
      t('LIVE: no horizontal scroll on the phone', await ev(() => document.documentElement.scrollWidth <= innerWidth + 1));
      // a made-up character in the page's memory only (no game, no server): the list + buttons render after the deploy
      const fake = await ev(() => { STATE.chars.push({ name: 'ZzStateTest', ageSec: 1, stateCtl: { items: [{ key: 'order', label: 'order running: "!supply"', since: Date.now() - 60000, canStop: true }, { key: 'escape', label: 'escaping', canStop: false }, { key: 'run', label: 'run switch ON', canStop: false }], last: { msg: 'state reset (stand idle)' } } });
        const h = StateCtl.listHtml('ZzStateTest', false), d = document.createElement('div'); d.innerHTML = h; const p = StateCtl.partyHtml('ZzStateTest', [{ name: 'ZzStateTest' }]); STATE.chars.pop();
        return { rows: d.querySelectorAll('.stc-row').length, stops: d.querySelectorAll('[data-stctl="stop"]').length, resets: d.querySelectorAll('[data-stctl="reset"]').length, icons: d.querySelectorAll('.stc-row .gi, .stc-row img').length, party: /Reset whole party/.test(p) && /ZzStateTest 2/.test(p) }; });
      t('LIVE (page memory only): 3 rows, 1 Stop (only the stoppable), 2 resets, icons, party line counts 2 (run switch not counted)', fake && fake.rows === 3 && fake.stops === 1 && fake.resets === 2 && fake.icons >= 3 && fake.party, fake);
      await cdp('Page.navigate', { url: 'http://127.0.0.1:8090/#/parties' }); await sleep(10000);
      t('LIVE: party cards carry the State section', await ev(() => document.querySelectorAll('details.stc-party').length > 0));
      t('LIVE: no page errors', errors.length === 0, errors.slice(0, 3));
      console.log('live box text:', box);
      sock.close();
    } finally { try { br.kill(); } catch (e) { } }
  }
  console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
})();
