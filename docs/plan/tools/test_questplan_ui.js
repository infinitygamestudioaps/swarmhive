// QUEST PLAN UI (QUESTPLAN-2026-10-27, requirement docs/requirements/quests.md R3 + R5): headless Chrome WITH the GPU (never Edge; cdp.mjs, the
// browser tree + profile killed at the end) against the SANDBOX server (cmdcenter_testserver.js: mocked MCP, nothing reaches the game). The plan
// folder is a SCRATCH copy (env SWARM_QUESTPLAN_DIR) and the live logs are a fixture (SWARM_QUESTLIVE_LOGS): the real files are never written.
//   node docs/plan/tools/test_questplan_ui.js [screenshot dir]
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os'), { pathToFileURL } = require('url');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { }
const ROOT = path.resolve(__dirname, '..', '..', '..'), OUT = process.argv[2] || path.join(os.tmpdir(), 'questplan_shots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, c, info) => { if (!c) fails++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
(async () => {
  const CDP = await import(pathToFileURL(path.join(__dirname, 'mobile_check', 'cdp.mjs')).href);
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'qplui-')), PD = path.join(TMP, 'plans'), LG = path.join(TMP, 'Logs'); fs.mkdirSync(PD); fs.mkdirSync(LG);
  fs.copyFileSync(path.join(ROOT, 'Scripts', 'data', 'quest_plans', '258.json'), path.join(PD, '258.json'));
  const plan = JSON.parse(fs.readFileSync(path.join(PD, '258.json'), 'utf8')), hunt = plan.steps.find(s => s.kind === 'hunt');
  const iso = (ms) => new Date(Date.now() - ms).toISOString();
  fs.writeFileSync(path.join(LG, 'quest_state_Questor.json'), JSON.stringify({ name: 'Questor', at: iso(1000), level: 12, classId: 0, log: [], active: { id: 258, name: 'Bring Wolf Pelts', mode: 'solo', phase: 'travel', cond: 1, started: true, step: 'to the wolves', startedAt: iso(60e3), phaseAt: iso(1000), repeat: 1, runs: 0,
    plan: { status: plan.status, i: hunt.i, n: plan.steps.length, key: hunt.key, text: hunt.text, src: 'plan' } } }));
  fs.writeFileSync(path.join(LG, 'swarm_state_Questor.json'), JSON.stringify({ name: 'Questor', classId: 0, level: 12, x: hunt.area.at[0] + 600, y: hunt.area.at[1] + 400, z: hunt.area.at[2], updated: new Date().toISOString(), doing: { quest: { id: 258, plan: { i: hunt.i, n: plan.steps.length, routeI: 4, routeN: 12, src: 'plan' } } } }));
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_QUESTPLAN_DIR: PD, SWARM_QUESTLIVE_LOGS: LG }) });
  let PORT = 0; srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; }));
  for (let i = 0; i < 150 && !PORT; i++) await sleep(100);
  const DBG = 9600 + Math.floor(Math.random() * 300), prof = path.join(TMP, 'chrome');
  let br = null;
  try {
    if (!PORT) throw new Error('sandbox server did not start');
    br = await CDP.launch(DBG, prof);
    const pg = await CDP.openPage(DBG), send = pg.send, errors = [];
    pg.on((m, p) => { if (m === 'Runtime.exceptionThrown') errors.push(p.exceptionDetails.exception ? p.exceptionDetails.exception.description : p.exceptionDetails.text); if (m === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); });
    await send('Page.enable'); await send('Runtime.enable');
    const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
    const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(200); } return false; };
    const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `questplan_${n}.png`), Buffer.from(r.data, 'base64')); };
    try { await require('./uidialog_testhook')((m, p) => send(m, p), [], { answer: true }); } catch (e) { }
    for (const [label, W, H, mob] of [['desktop', 1366, 900, false], ['iphone', 390, 844, true]]) {
      await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/quests/258` });
      await waitFor(`!!document.querySelector('[data-qpsec="plan"]')`, 45000);
      await ev(`(() => { const d = document.querySelector('[data-qpsec="plan"]'); if (d && !d.open) { d.open = true; d.dispatchEvent(new Event('toggle')); } return true; })()`);
      ok(`${label}: the plan view mounts (status + ${plan.steps.length} steps)`, await waitFor(`document.querySelectorAll('#qpPlan .qpl-step').length === ${plan.steps.length} && /${plan.status}/.test(document.querySelector('#qpPlan .qpl-st').textContent)`, 20000), await ev(`(document.getElementById('qpPlan') || {}).textContent.slice(0, 120)`));
      ok(`${label}: the map shows step places + routes`, await ev(`!!document.querySelector('#qplMap svg') && document.querySelectorAll('#qplMap svg circle').length >= 2 && document.querySelectorAll('#qplMap svg polyline').length >= 1`));
      ok(`${label}: Questor live on step ${hunt.i + 1} (highlighted), route point 4/12`, await waitFor(`(() => { const c = document.querySelectorAll('#qpPlan .qpl-step')[${hunt.i}]; return c && c.classList.contains('cur') && /Questor/.test(c.textContent) && /route point 4\\/12/.test(document.querySelector('#qpPlan .qpl-live').textContent); })()`));
      ok(`${label}: no horizontal page scroll`, await ev(`document.documentElement.scrollWidth <= innerWidth + 1`), await ev(`document.documentElement.scrollWidth + '/' + innerWidth`));
      await shot(label + '_plan');
    }
    // the override editor (desktop)
    await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev(`document.querySelectorAll('#qpPlan [data-qpl="edit"]')[${hunt.i}].click()`);
    ok('editor opens for the hunt step', await waitFor(`!!document.querySelector('#qpPlan .qpl-ed textarea')`));
    for (const f of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.6]]) { await ev(`(() => { const s = document.querySelector('#qplMap svg'), r = s.getBoundingClientRect(); s.dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width * ${f[0]}, clientY: r.top + r.height * ${f[1]}, bubbles: true })); return true; })()`); await sleep(150); }
    ok('three map taps = three route points', await waitFor(`document.querySelector('#qpPlan .qpl-ed textarea').value.trim().split('\\n').length === 3`), await ev(`document.querySelector('#qpPlan .qpl-ed textarea').value`));
    ok('the tapped points lie on the map around the step (world coordinates, the view stays put while editing)', await ev(`document.querySelector('#qpPlan .qpl-ed textarea').value.trim().split('\\n').every(l => { const p = l.split(',').map(Number); return Math.hypot(p[0] - (${hunt.area.at[0]}), p[1] - (${hunt.area.at[1]})) < 80000; })`));
    await ev(`(() => { const n = document.querySelector('[data-qpl="ed-note"]'); n.value = 'ui test'; n.dispatchEvent(new Event('input', { bubbles: true })); const s = document.querySelector('[data-qpl="ed-start"]'); s.value = 'town:Gludin'; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-qpl="ed-save"]').click(); return true; })()`);
    ok('save writes the override into the scratch plan', await waitFor(`/Saved/.test((document.querySelector('#qpPlan .qpl-msg') || {}).textContent || '')`) && (() => { const p = JSON.parse(fs.readFileSync(path.join(PD, '258.json'), 'utf8')), o = p.override.steps[hunt.key]; return o && o.route.length === 3 && o.note === 'ui test' && o.start && o.start.town === 'Gludin'; })());
    ok('history copy made', fs.existsSync(path.join(PD, 'history')) && fs.readdirSync(path.join(PD, 'history')).length >= 1);
    ok('the step now says "your own route"', await waitFor(`/your own route/.test(document.querySelectorAll('#qpPlan .qpl-step')[${hunt.i}].textContent)`));
    await shot('desktop_override');
    ok('no page errors', !errors.length, errors.slice(0, 2).join(' | '));
  } catch (e) { ok('run', false, e.message); }
  finally {
    try { if (br) CDP.killTree(br.proc.pid); } catch (e) { }
    try { srv.kill(); } catch (e) { }
    await sleep(500); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  }
  console.log(fails ? `${fails} failed` : 'all ok');
  process.exit(fails ? 1 : 0);
})();
