// BUFF PLANS: headless browser check of the Buffs page (Edge via CDP) against the SANDBOX server (cmdcenter_testserver.js: mocked MCP, nothing
// reaches the game). The plans file is a SCRATCH file (env SWARM_BUFFPLANS_FILE); every uidialog question answers itself (uidialog_testhook).
// iPhone 390x844 + desktop 1366x900. Reads the real Logs/swarm_state_*.json and swarm.config.json (read-only).
//   node docs/plan/tools/test_buffpage_ui.js [screenshot dir]     (default: %TEMP%\buffpage_shots — never the repo)
'use strict';
// STAGING (2026-10-10): needs the page wired into Dashboard/ (docs/plan/staging/buffpage/WIRING.txt); until then it exits with a note.
if (!require('fs').existsSync(require('path').join(__dirname, '..', '..', '..', 'Dashboard', 'buffpage.js'))) { console.log('Buffs page not wired in yet (staged in docs/plan/staging/buffpage) — UI test skipped'); process.exit(0); }
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'buffpage_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bpui-'));
  const PFILE = path.join(TMP, 'buff_plans.json');
  const LIVE = path.join(ROOT, 'Scripts', 'data', 'buff_plans.json'); const liveSt = () => { try { const s = fs.statSync(LIVE); return s.size + ':' + s.mtimeMs; } catch (e) { return 'absent'; } }; const LIVE0 = liveSt();
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_BUFFPLANS_FILE: PFILE }) });
  let PORT = 0; const mcpLog = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  if (!PORT) throw new Error('sandbox server did not start');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-edge-'));
  const DBG = 9300 + Math.floor(Math.random() * 500);
  const br = cp.spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [];
  sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `buffpage_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: true, prompt: 'UI buff template', onDialog: (d) => dialogs.push(d) });
  const BASE = `http://127.0.0.1:${PORT}/`;
  const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); };
  const desktop = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const file = () => JSON.parse(fs.readFileSync(PFILE, 'utf8'));

  // ===================== iPhone =====================
  await phone();
  await cdp('Page.navigate', { url: BASE + '#/parties' });
  await waitFor(`!!document.querySelector('#tabs [data-tab="buffs"]')`, 20000);
  ok('nav: a Buffs tab with an animated count of buffers without a reviewed plan', await waitFor(`(() => { const c = document.querySelector('#tabs [data-tab="buffs"] .bpcount'); return !!c && +c.textContent > 0 && getComputedStyle(c).animationName !== 'none'; })()`, 15000));
  await click('#tabs [data-tab="buffs"]');
  ok('#/buffs opens with party tabs', await waitFor(`/^#\\/buffs/.test(location.hash) && document.querySelectorAll('#tab-buffpage .cpl-ptab').length >= 3`, 10000), await ev('location.hash'));
  await click('[data-bpparty="Tank1"]');
  ok('party Tank1: buffer rows for the Warcryer + the healers (Chanter1, Bishop1, Saint1)', await waitFor(`['Chanter1','Bishop1','Saint1'].every(n => !!document.querySelector('.bpl-mrow[data-bpname="' + n + '"]'))`, 8000));
  ok('board buffs ON chip for party Tank1 (live config)', await ev(`/Board buffs ON/.test(document.querySelector('#bpParty .bpl-board').textContent)`));
  ok('no skill report yet is said per buffer (states have no buffPlan yet)', await ev(`/no skill report yet/.test(document.querySelector('.bpl-mrow[data-bpname="Chanter1"]').textContent)`));
  ok('no horizontal page scroll (iPhone, Buffs)', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`), await ev(`document.documentElement.scrollWidth + ' / ' + innerWidth`));
  await ev('window.scrollTo(0,0)'); await shot('01_iphone_party');
  // editor: type a buff, save + approve
  await click('.bpl-mrow[data-bpname="Chanter1"] [data-bpact="edit"]');
  ok('the plan editor opens as a sheet', await waitFor(`!document.getElementById('bpSheet').hidden && !!document.getElementById('bpAddName')`));
  await ev(`(() => { const i = document.getElementById('bpAddName'); i.value = 'Chant of Victory'; return true; })()`); await click('[data-bpact="addBuff"]');
  await ev(`(() => { const i = document.getElementById('bpAddName'); i.value = 'War Chant'; return true; })()`); await click('[data-bpact="addBuff"]');
  ok('typed buffs are listed and ticked', await waitFor(`document.querySelectorAll('#bpPanel .bpl-row.on').length === 2`));
  await ev(`(() => { const s = document.querySelector('#bpPanel select[data-bptgt="1"]'); s.value = 'fighters'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  await click('#bpPanel [data-bpdn="0"]'); await sleep(150);
  ok('▼ moves Chant of Victory below War Chant', await ev(`[...document.querySelectorAll('#bpPanel .bpl-row b')].map(b => b.textContent).join() === 'War Chant,Chant of Victory'`));
  await shot('02_iphone_editor');
  dialogs.length = 0;
  await click('[data-bpact="saveApprove"]');
  ok('Save & approve asks with the shared dialog (buffs + targets listed), no browser dialog', await waitFor(`document.getElementById('bpSheet').hidden`, 8000) && dialogs.length === 1 && /Approve the buff plan of Chanter1/.test(dialogs[0].msg) && /War Chant/.test(dialogs[0].msg) && !browserDialogs.length, (dialogs[0] || {}).msg ? dialogs[0].msg.split('\n').slice(0, 4).join(' / ') : 'no dialog');
  let f = file().parties.Tank1.chars.Chanter1;
  ok('scratch file: approved, order + targets kept', f && f.approved === true && f.buffs[0].skill === 'War Chant' && f.buffs[0].targets[0] === 'fighters' && f.buffs[1].skill === 'Chant of Victory', JSON.stringify(f));
  ok('the row now says "the approved plan runs" (no warning)', await waitFor(`/the approved plan runs/.test(document.querySelector('.bpl-mrow[data-bpname="Chanter1"]').textContent) && !document.querySelector('.bpl-mrow[data-bpname="Chanter1"]').classList.contains('warn')`, 8000));
  ok('Bishop1 (no reviewed plan, board ON): animated "buff plan not reviewed" + "it only fills what the board lacks"', await ev(`(() => { const r = document.querySelector('.bpl-mrow[data-bpname="Bishop1"]'); const b = r.querySelector('.cpbadge'); return !!b && /buff plan not reviewed/.test(b.textContent) && getComputedStyle(b).animationName !== 'none' && /board buffs ON: it only fills what the board lacks/.test(r.textContent); })()`));
  await shot('03_iphone_after_approve');
  // unapprove
  dialogs.length = 0;
  await click('.bpl-mrow[data-bpname="Chanter1"] [data-bpact="unapprove"]');
  await waitFor(`!!document.querySelector('.bpl-mrow[data-bpname="Chanter1"] [data-bpact="approve"]')`, 8000);
  ok('Unapprove asks first, file says approved:false', dialogs.length === 1 && file().parties.Tank1.chars.Chanter1.approved === false);
  // template: apply the example Warcryer template
  await ev(`(() => { const s = document.getElementById('bpTplSel'); s.value = 'example-warcryer'; return true; })()`);
  dialogs.length = 0;
  await click('[data-bpact="applyTpl"]');
  await waitFor(`(() => { try { return (JSON.parse(${JSON.stringify('""')}) , true); } catch (e) { return false; } })()`, 500);
  await sleep(1500);
  f = file().parties.Tank1.chars.Chanter1;
  ok('apply template (shared dialog first): Chanter1 (Warcryer) gets the chants, NOT approved', dialogs.length === 1 && /Apply/.test(dialogs[0].msg) && f.approved === false && f.buffs.some(b => b.skill === 'Chant of Battle'), JSON.stringify((f.buffs || []).slice(0, 2)));
  dialogs.length = 0;
  await click('[data-bpact="saveTpl"]'); await sleep(1500);
  ok('save party as template (uiPrompt) -> own template in the file', Object.values(file().templates || {}).some(t => t.name === 'UI buff template'));
  // settings
  await ev(`(() => { document.getElementById('bpSetSd').value = 12; const i = document.querySelector('[data-bpset="cycleExpiredPct"]'); i.value = 70; return true; })()`);
  await click('[data-bpact="saveSet"]'); await sleep(1200);
  ok('settings saved (slots 12, new cycle at 70 % expired); no suggestRuns field any more', file().settings.songDanceMax === 12 && file().settings.cycleExpiredPct === 70 && await ev(`!document.getElementById('bpSetSr')`));
  ok('no horizontal page scroll after edits (iPhone)', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`));
  await ev(`document.querySelector('.bpl-set').scrollIntoView()`); await sleep(300); await shot('04_iphone_settings');

  // ===================== desktop =====================
  await desktop();
  await cdp('Page.navigate', { url: BASE + '#/buffs/Tank1' });
  ok('desktop: deep link #/buffs/Tank1 selects that party', await waitFor(`document.querySelector('.cpl-ptab.on') && /Tank1/.test(document.querySelector('.cpl-ptab.on').textContent)`, 20000));
  await click('.bpl-mrow[data-bpname="Saint1"] [data-bpact="edit"]'); await sleep(300);
  ok('desktop editor opens for Saint1; Escape closes it', await ev(`!document.getElementById('bpSheet').hidden`) && (await ev(`(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true)`)) && await waitFor(`document.getElementById('bpSheet').hidden`, 3000));
  await sleep(400); await shot('05_desktop_party');
  ok('no browser alert / confirm / prompt was used', !browserDialogs.length, browserDialogs.join(','));
  ok('no script errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
  const writes = mcpLog.filter(l => /^MCP (run_account_command|send_game_action|close_account|open_account|manage_)/.test(l));
  ok('no game command reached even the mock MCP', !writes.length, writes.slice(0, 3).join(' | '));
  ok('the live Scripts/data/buff_plans.json was never created or changed', liveSt() === LIVE0);
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed — screenshots in ${OUT}`);
  try { sock.close(); } catch (e) { } br.kill(); srv.kill();
  try { fs.rmSync(prof, { recursive: true, force: true }); fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
