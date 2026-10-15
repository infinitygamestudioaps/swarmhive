// HIVE SWITCHES character page (HIVESW-2026-10-15): headless Edge against the SANDBOX server (cmdcenter_testserver.js: mocked MCP, nothing reaches
// the game); every settings file is a scratch copy (env overrides), the live party_auto.json is compared before / after.
// Checks the box 'Combat — Hive or my L2Swarm profile' on #/char/Bishop1: three choices (default Like the party = Hive), the toggle list (checkboxes
// from the skill list, a text box offline), the profile hint, Save writes exactly chars.Bishop1.skills + toggles, no page errors / browser dialogs.
//   node docs/plan/tools/test_hiveswitch_ui.js   (screenshot %TEMP%/cp_hive.png)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..'), TOOLS = __dirname;
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (n, c, i) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${i ? ' — ' + i : ''}`); if (!c) fails++; };
(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cphive-')), F = path.join(TMP, 'party_auto.json');
  const env = Object.assign({}, process.env, { SWARM_PARTYAUTO_FILE: F });
  ['SWARM_FUNDRULES_FILE', 'SWARM_GEARAUTO_FILE', 'SWARM_STASHRULES_FILE', 'SWARM_TACTICS_FILE', 'SWARM_ROUTERULES_FILE', 'SWARM_SEVENSIGNS_FILE', 'SWARM_CLANQUESTS_FILE', 'SWARM_RUNSTATE_FILE', 'SWARM_DAILY_FILE', 'SWARM_CLANAUTO_FILE', 'SWARM_FUNDLOG_FILE', 'SWARM_RESRULES_FILE', 'SWARM_LOOTRULES_FILE'].forEach(k => { env[k] = path.join(TMP, k + '.json'); });
  const live0 = fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'party_auto.json'), 'utf8');
  const srv = cp.spawn(process.execPath, [path.join(TOOLS, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env });
  let port = 0; srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) port = +m[1]; }));
  for (let i = 0; i < 150 && !port; i++) await sleep(100);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cph-edge-')), DBG = 9800 + Math.floor(Math.random() * 100);
  const br = cp.spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null; for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [];
  sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (x) => { const r = await cdp('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (x, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(x)) return true; } catch (e) { } await sleep(200); } return false; };
  const errors = [], browserDialogs = []; handlers.push(m => { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text); if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); } });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require(path.join(TOOLS, 'uidialog_testhook'))(cdp, handlers, { answer: true, uiMode: 'simple', onDialog: () => { } });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/#/char/Bishop1` });
  ok('Combat box appears with its three choices', await waitFor(`!!document.querySelector('#cp_hive select[data-hssel="skills"]') && !!document.querySelector('#cp_hive select[data-hssel="potions"]')`, 30000), await ev(`(document.getElementById('cp_hive') || {}).textContent || 'no box'`).catch(e => e.message));
  ok('defaults: Like the party (Hive)', await ev(`[...document.querySelectorAll('#cp_hive select')].every(s => s.value === '' && /Hive/.test(s.options[0].text))`));
  const hasBoxes = await ev(`document.querySelectorAll('#cp_hive [data-hstg]').length`), hasTxt = await ev(`!!document.querySelector('#cp_hive [data-hstxt]')`);
  ok('toggle choice shown (checkboxes from the skill list or the text box offline)', hasBoxes > 0 || hasTxt, `boxes ${hasBoxes} text ${hasTxt}`);
  await ev(`(() => { const s = document.querySelector('#cp_hive select[data-hssel="skills"]'); s.value = 'off'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  if (hasTxt) await ev(`(() => { const s = document.querySelector('#cp_hive [data-hstxt]'); s.value = 'War Frenzy, Arcane Power'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  ok('profile hint shown once skills are the profile\'s', await ev(`/Set up the Combat Skills/.test(document.getElementById('cp_hive').textContent)`));
  await ev(`document.getElementById('cp_hive').scrollIntoView()`); await sleep(200);
  fs.writeFileSync(path.join(os.tmpdir(), 'cp_hive.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`document.querySelector('#cp_hive [data-hsact="save"]').click()`);
  let j = null; for (let i = 0; i < 40 && !j; i++) { await sleep(250); try { const t = JSON.parse(fs.readFileSync(F, 'utf8')); if (t.chars && t.chars.Bishop1) j = t; } catch (e) { } }
  ok('saved: chars.Bishop1.skills false' + (hasTxt ? ' + toggles' : ''), !!j && j.chars.Bishop1.skills === false && (!hasTxt || JSON.stringify(j.chars.Bishop1.toggles) === '["War Frenzy","Arcane Power"]'), JSON.stringify(j && j.chars));
  ok('Save button disabled again after saving', await waitFor(`!!document.querySelector('#cp_hive [data-hsact="save"][disabled]')`, 5000));
  ok('no page errors', !errors.length, errors.join(' | ').slice(0, 300));
  ok('no browser alert/confirm', !browserDialogs.length);
  ok('live party_auto.json untouched', fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'party_auto.json'), 'utf8') === live0);
  sock.close(); br.kill(); srv.kill();
  console.log(fails ? `${fails} FAILED` : 'all ok'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
