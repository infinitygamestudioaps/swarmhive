// PARTY PURSE UI (2026-10-13, tester: members with ~100 adena never got anything from a 37M leader): headless browser check (Edge via CDP)
// against the SANDBOX server (cmdcenter_testserver.js: mocked MCP, nothing reaches the game). The fund rules are a SCRATCH file (env override);
// the live files are compared before / after. Every uidialog question answers itself (uidialog_testhook). The page's /api/state answer is
// replaced in the browser by a made-up party (JadeLeader 37.3M + members with ~100 adena), and the page's send() is recorded (no order leaves).
//   1. Parties tab: the "Needs you" card on party JadeLeader (sentence, Give it now, Give all, Switch on 'Leader pays'), phone width, no h-scroll
//   2. Give it now -> the order "!purse give JadeTwo" to party JadeLeader (after the confirm)
//   3. Switch on 'Leader pays' -> fund_rules.json parties.JadeLeader.purse.on = true, nothing else changed; "...and pay now" sends "!purse give all"
//   4. Leader pays ON in the reports -> no card
//   5. ⚙ Settings -> Money: block 1 "Inside the party" before block 2 "Between parties", the switch shows the file, an edit writes only purse
//   6. the character page of JadeTwo shows its own line; the Adena tab shows the two blocks in that order
//   7. the owner's real parties: no card while their reports carry no purse need; nothing written by looking
//   node docs/plan/tools/test_purse_ui.js [screenshot dir]
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'purse_shots');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !cond ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const DATA = path.join(ROOT, 'Scripts', 'data'), LOGS = path.join(ROOT, 'Logs');
const LIVE = [path.join(DATA, 'fund_rules.json'), path.join(DATA, 'run_state.json'), path.join(DATA, 'party_auto.json'), path.join(DATA, 'gear_auto.json'), path.join(LOGS, 'fund_log.json')];
const rd = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const LIVE0 = Object.fromEntries(LIVE.map(f => [f, rd(f)]));

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'purseui-'));
  const FR = path.join(TMP, 'fund_rules.json');
  // a public-package style file: everything OFF
  const seed = { on: false, town: 'Giran', everyMin: 30, minGive: 200000, slack: 500000, brokeBelow: 500000, givers: { mode: 'auto', list: [], keepAtLeast: 30000000 }, defaults: { leaderTarget: 8000000, memberTarget: 3000000, clanLeaderTarget: 12000000 }, parties: {}, chars: {} };
  fs.writeFileSync(FR, JSON.stringify(seed, null, 1));
  const env = { SWARM_FUNDRULES_FILE: FR, SWARM_FUNDLOG_FILE: path.join(TMP, 'fund_log.json'), SWARM_RUNSTATE_FILE: path.join(TMP, 'run_state.json'), SWARM_PARTYAUTO_FILE: path.join(TMP, 'party_auto.json'), SWARM_GEARAUTO_FILE: path.join(TMP, 'gear_auto.json') };
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, env) });
  const S = { port: 0, mcp: [] };
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) S.port = +m[1]; else if (l.startsWith('MCP ')) S.mcp.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 150 && !S.port; i++) await sleep(100);
  if (!S.port) throw new Error('sandbox server did not start');
  const BASE = `http://127.0.0.1:${S.port}/`;

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'purse-edge-'));
  const DBG = 9800 + Math.floor(Math.random() * 150);
  const br = cp.spawn(EDGE, ['--headless=new', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [];
  sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `purse_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: true, uiMode: 'simple', onDialog: (d) => dialogs.push(d) });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.scrollIntoView(); e.click(); return true; })()`);
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);
  const fileNow = () => JSON.parse(rd(FR));

  // ---- the made-up party: replace /api/state's chars in the browser, record send()
  // ruleOn: the leader's report says Leader pays is on
  const install = (ruleOn) => ev(`(() => {
    window.__sent = window.__sent || []; window.__ruleOn = ${ruleOn ? 'true' : 'false'};
    if (!window.__fetch0) {
      window.__fetch0 = window.fetch;
      window.fetch = async (u, o) => {
        (window.__urls = window.__urls || []).push(String(u) + (o && o.method ? ' ' + o.method : ''));
        const r = await window.__fetch0(u, o);
        if (!/\\/api\\/state(\\?|$)/.test(String(u))) return r;
        const j = await r.json(); window.__realChars = j.chars || [];
        const t = (j.chars || [])[0] || {}, mk = (name, lvl, adena, purse) => Object.assign(JSON.parse(JSON.stringify(t)), { name, party: 'JadeLeader', level: lvl, adena, ageSec: 2, leader: name === 'JadeLeader', dead: false, purse,
          updated: new Date().toISOString(), notes: [], intent: null, partyStatus: null, teamStep: null, trade: null, escape: null, cast: null, rescue: null });
        const rule = { on: window.__ruleOn, leaderKeep: 2000000, memberCap: 5000000, budget: 0 };
        j.chars = (j.chars || []).concat([
          mk('JadeLeader', 2, 37300000, { want: 0, have: 37300000, keep: 5000, need: 0, grade: '', auto: false, lock: false, leader: true, rule }),
          mk('JadeTwo', 1, 106, { want: 47506, have: 106, keep: 5000, need: 52400, grade: 'D', auto: false, lock: false, rule }),
          mk('JadeThree', 1, 100, { want: 56300, have: 100, keep: 5000, need: 61200, grade: 'D', auto: false, lock: false, rule }),
          mk('JadeFour', 2, 900000, { want: 0, have: 900000, keep: 5000, need: 0, grade: '', auto: false, lock: false, rule })]);
        return new Response(JSON.stringify(j), { headers: { 'Content-Type': 'application/json' } });
      };
      send = async (target, text, cmd) => { window.__sent.push({ target, cmd }); };
    }
    return true; })()`);

  await cdp('Page.navigate', { url: BASE + '#/parties' });
  await waitFor(`typeof refresh === 'function' && !!window.PurseCard`, 25000);
  await install(false);
  await ev(`refresh()`);
  ok('1: the "Needs you" card is on party JadeLeader\'s card', await waitFor(`!!document.querySelector('#tab-parties [data-pursecard="JadeLeader"]')`, 15000));
  const txt = await ev(`document.querySelector('[data-pursecard="JadeLeader"]').textContent.replace(/\\s+/g, ' ')`);
  ok('1: "JadeTwo needs 52,400 adena for its D-grade upgrades — JadeLeader has 37.3M."', /JadeTwo needs 52,400 adena for its D-grade upgrades — JadeLeader has 37\.3M\./.test(txt), txt);
  ok('1: JadeThree is on it too, JadeFour (can pay itself) is not', /JadeThree needs 61,200/.test(txt) && !/JadeFour/.test(txt), txt);
  ok("1: buttons: Give it now (x2), Give all now, Switch on 'Leader pays' for this party", await ev(`(() => { const c = document.querySelector('[data-pursecard="JadeLeader"]'); return [...c.querySelectorAll('button')].map(b => b.textContent.trim()).join('|'); })()`)
    .then(t => t === "Give it now|Give it now|Give all now|Switch on 'Leader pays' for this party"));
  ok('1: phone width: no horizontal scroll, buttons >= 40 px high', (await noScroll()) && await ev(`[...document.querySelectorAll('[data-pursecard] button')].every(b => b.getBoundingClientRect().height >= 39)`), await ev(`JSON.stringify({ sw: document.documentElement.scrollWidth, iw: innerWidth, h: [...document.querySelectorAll('[data-pursecard] button')].map(b => Math.round(b.getBoundingClientRect().height)) })`));
  await ev(`document.querySelector('[data-pursecard="JadeLeader"]').scrollIntoView()`); await sleep(200);
  await shot('01_card_iphone');

  // 2. Give it now
  dialogs.length = 0;
  await click('[data-pursecard="JadeLeader"] button[data-quick*="!purse give JadeTwo"]');
  ok('2: Give it now asks first (uidialog), then sends "!purse give JadeTwo" to party JadeLeader', await waitFor(`(window.__sent || []).some(s => s.target === 'party:JadeLeader' && s.cmd === '!purse give JadeTwo')`, 5000) && dialogs.some(d => d.type === 'confirm'),
    await ev('JSON.stringify(window.__sent)'));
  ok('2: nothing was written by Give it now', JSON.stringify(fileNow().parties) === '{}');

  // 3. Switch on 'Leader pays'
  dialogs.length = 0;
  await click('[data-pursecard="JadeLeader"] [data-purse-on]');
  ok("3: the switch asks (Switch on / Switch on and pay now) and writes parties.JadeLeader.purse.on = true", await waitFor(`(window.__sent || []).some(s => s.cmd === '!purse give all')`, 30000) && dialogs.some(d => d.type === 'choice' && /Leader pays/.test(d.title)), dialogs.map(d => d.type + ':' + d.title).concat(await ev('JSON.stringify((window.__urls || []).filter(u => !/state/.test(u)).slice(-6))')));
  const f3 = fileNow();
  ok('3: fund_rules.json: only parties.JadeLeader = { receive: true, purse: { on: true } } added', JSON.stringify(f3.parties) === JSON.stringify({ JadeLeader: { receive: true, purse: { on: true } } }) && f3.on === false && JSON.stringify(f3.givers) === JSON.stringify(seed.givers) && JSON.stringify(f3.chars) === '{}' && !('memberKeep' in f3), f3);
  ok('3: "Switch on and pay now" sent "!purse give all" to the party', await ev(`(window.__sent || []).some(s => s.target === 'party:JadeLeader' && s.cmd === '!purse give all')`));

  // 4. the reports say Leader pays is on -> no card
  await install(true); await ev(`window.__ruleOn = true; refresh()`);
  ok('4: Leader pays ON -> the card is gone', await waitFor(`!document.querySelector('[data-pursecard="JadeLeader"]')`, 8000));
  await ev(`window.__ruleOn = false; refresh()`); await waitFor(`!!document.querySelector('[data-pursecard="JadeLeader"]')`, 8000);

  // 5. ⚙ Settings -> Money
  await ev(`window.PartySettings.open('JadeLeader')`);
  ok('5: the popup opens for JadeLeader', await waitFor(`!!window.PartySettings._state.W && window.PartySettings._state.leader === 'JadeLeader'`, 15000));
  await ev(`(() => { const d = document.querySelector('#psBody details[data-pssec="money"]'); d.open = true; d.scrollIntoView(); return true; })()`); await sleep(200);
  const blocks = await ev(`[...document.querySelectorAll('#psBody [data-pssec="money"] .ps-blkh')].map(e => e.textContent)`);
  ok('5: Money = block 1 "Inside the party — the leader pays his members\' gear and supplies", then block 2 "Between parties — a rich character of one party helps another party"',
    blocks.length === 2 && /^1 · Inside the party — the leader pays his members' gear and supplies$/.test(blocks[0]) && /^2 · Between parties — a rich character of one party helps another party$/.test(blocks[1]), blocks);
  ok('5: each block has a one-sentence example', await ev(`[...document.querySelectorAll('#psBody [data-pssec="money"] .ps-blk')].every(b => /Example:/.test(b.textContent))`));
  ok('5: the Leader pays switch shows the file (on) and the members\' needs with Give it now', await ev(`document.querySelector('#psBody [data-psw="money.purse.on"]').getAttribute('aria-checked') === 'true' && /JadeTwo needs 52,400/.test(document.querySelector('#psBody .ps-needs') ? document.querySelector('#psBody .ps-needs').textContent : '')`));
  ok('5: the pocket money by level is shown (5,000 / 50,000 / 150,000 / 300,000)', await ev(`['money.mk.0', 'money.mk.1', 'money.mk.2', 'money.mk.3'].map(p => document.querySelector('#psBody [data-psin="' + p + '"]').value).join('/') === '5,000/50,000/150,000/300,000'`));
  await shot('02_popup_money_iphone');
  await click('#psBody [data-psw="money.purse.on"]');
  await ev(`(() => { const e = document.querySelector('#psBody input[data-psin="money.purse.mc"]'); e.value = '1m'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  dialogs.length = 0;
  await click('#psBar [data-psact="save"]');
  ok('5: saved', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 15000), await ev(`document.getElementById('psBar').textContent`));
  ok('5: the confirmation lists "Leader pays ... off" and "At most per member: 1,000,000"', dialogs.some(d => d.type === 'confirm' && /Leader pays his members' gear & supplies \(party JadeLeader\): off/.test(d.msg) && /At most per member: 1,000,000/.test(d.msg)), dialogs.map(d => d.msg).join(' | ').slice(0, 400));
  const f5 = fileNow();
  ok('5: fund_rules.json: parties.JadeLeader.purse = { on: false, memberCap: 1000000 }, the rest unchanged', JSON.stringify(f5.parties) === JSON.stringify({ JadeLeader: { receive: true, purse: { on: false, memberCap: 1000000 } } }) && f5.on === false && JSON.stringify(f5.givers) === JSON.stringify(seed.givers) && !('memberKeep' in f5), f5);
  // pocket money edit
  await ev(`(() => { const d = document.querySelector('#psBody [data-pssec="money"] details.ps-more'); if (d) d.open = true; const e = document.querySelector('#psBody input[data-psin="money.mk.0"]'); e.value = '2k'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await click('#psBar [data-psact="save"]');
  ok('5: pocket money below level 20 -> 2,000 is saved as memberKeep (all parties)', await waitFor(`/All saved/.test(document.getElementById('psBar').textContent)`, 15000) && JSON.stringify(fileNow().memberKeep) === JSON.stringify([[20, 2000], [40, 50000], [60, 150000], [999, 300000]]), fileNow().memberKeep);
  await click('#psOv [data-psact="close"]');

  // 6. character page + Adena tab
  ok('6: PurseCard.charHtml(JadeTwo) = only its own line', await ev(`(() => { const h = PurseCard.charHtml('JadeTwo'); return /JadeTwo<\\/b> needs/.test(h) && !/JadeThree/.test(h); })()`));
  await cdp('Page.navigate', { url: BASE + '#/adena' });
  await waitFor(`!!document.getElementById('fndBlk1')`, 20000);
  ok('6: Adena tab: block 1 (inside the party) above block 2 (between parties)', await ev(`(() => { const a = document.getElementById('fndBlk1'), b = document.getElementById('fndBlk2'); return !!a && !!b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && /Inside the party/.test(a.querySelector('h3').textContent) && /Between parties/.test(b.querySelector('h3').textContent); })()`));
  ok('6: Adena tab: both examples in plain words, the between-parties switch inside block 2', await waitFor(`/Example:/.test(document.getElementById('fndPurseEx').textContent) && /Example:/.test(document.getElementById('fndBetweenEx').textContent) && document.getElementById('fndBlk2').contains(document.getElementById('fndOn'))`, 8000));
  ok('6: Adena tab: no horizontal scroll on the phone', await noScroll());
  await shot('03_adena_tab_iphone');

  // 7. the owner's real parties: no card unless their reports carry a need; nothing written by looking
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  await waitFor(`typeof refresh === 'function'`, 20000); await sleep(1500);
  const real = await ev(`(window.__realChars || []).filter(c => c.purse && c.purse.need > 0).length`);
  ok(`7: real parties: ${real ? real + ' members report a need' : 'no member reports a gear-money need'} -> ${real ? 'cards may show' : 'no card'}`, real ? true : await ev(`![...document.querySelectorAll('[data-pursecard]')].some(e => e.dataset.pursecard !== 'JadeLeader')`));

  srv.kill();
  const writes = S.mcp.filter(l => /^MCP (run_account_command|send_game_action|close_account|open_account|manage_)/.test(l));
  ok('no game command reached even the mock MCP', !writes.length, writes.slice(0, 3).join(' | '));
  ok('no browser alert / confirm / prompt', !browserDialogs.length, browserDialogs.join(','));
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  ok('the live settings files were not changed', Object.entries(LIVE0).every(([f, t]) => rd(f) === t), Object.entries(LIVE0).filter(([f, t]) => rd(f) !== t).map(([f]) => path.basename(f)).join(', '));
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
