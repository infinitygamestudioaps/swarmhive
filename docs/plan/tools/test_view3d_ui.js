// 3D VIEW (VIEW3D-2026-10-17, Dashboard/view3d.js): headless Edge (software WebGL) against the SANDBOX server (cmdcenter_testserver.js, mocked
// MCP, real geodata). iPhone 390x844: open #/view3d/<a character>, the ground + figures load, a tap on the ground offers "walk here", the walk
// asks first (answered No: no order), leaving the page frees the 3D view.   node docs/plan/tools/test_view3d_ui.js [screenshot dir]
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'view3d_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !cond ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const LOGS = path.join(ROOT, 'Logs');
const dirList = (d) => { try { return fs.readdirSync(d).sort().join('|'); } catch (e) { return ''; } };

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  // L2MODELS_AVAILABLE: game models need the player's own client + UE Viewer (never in a release copy) -> those checks are skipped without them
  const L2MODELS_AVAILABLE = [path.join(ROOT, 'tools', 'umodel', 'umodel.exe'), path.join(ROOT, '..', 'tools', 'umodel', 'umodel.exe')].some(x => fs.existsSync(x)) && fs.existsSync('C:/Lineage2/system') && fs.existsSync(path.join(ROOT, 'Dashboard', 'l2cache'));
  fs.mkdirSync(OUT, { recursive: true });
  const JOBS0 = dirList(path.join(LOGS, 'itemjobs')), OQ0 = dirList(path.join(LOGS, 'orders'));
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let port = 0; const mcp = []; srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) port = +m[1]; if (/^MCP /.test(l)) mcp.push(l); }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 150 && !port; i++) await sleep(100);
  if (!port) throw new Error('sandbox server did not start');
  const BASE = process.env.V3D_BASE || `http://127.0.0.1:${port}/`;   // V3D_BASE=http://127.0.0.1:8090/ = the live dashboard, read-only (the walk is answered No)
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'v3d-edge-'));
  const DBG = 9450 + Math.floor(Math.random() * 140);
  const br = cp.spawn(EDGE, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [];
  sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const shot = async (name, sel) => { if (sel) await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b) b.scrollIntoView({ block: 'start' }); return true; })()`).catch(() => { }); await sleep(250); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `v3d_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: false, uiMode: 'simple' });
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);
  try {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Page.navigate', { url: BASE + '#/parties' });
    ok('0: page + 3D module load', await waitFor(`!!window.View3D && !!window.api`, 30000));
    const who = await ev(`(async () => { const s = await api('/api/state'); const want = ${JSON.stringify(process.env.V3D_NAME || "")}; const c = (s.chars || []).find(c => want ? c.name === want : (c.x != null && c.z != null && !c.dead)); return c ? c.name : ''; })()`);
    ok('1: a character to look at', !!who, who);
    await ev(`(location.hash = '#/char/' + encodeURIComponent(` + JSON.stringify(who) + `), true)`);
    ok('1: the character page has a 3D view button', await waitFor(`(() => { const b = document.querySelector('[data-cp3d]'); return !!b && b.getBoundingClientRect().width > 40; })()`, 20000));
    await shot('0_charpage', '[data-cp3d]');
    await click('[data-cp3d]');
    ok('1: the button opens the 3D view', await waitFor(`location.hash.startsWith('#/view3d/')`, 5000));
    ok('1: the ground loads', await waitFor(`!!(View3D._state.T && View3D._state.T.n > 50)`, 30000), await ev(`document.getElementById('v3dMsg').textContent`));
    ok('1: the canvas fills the view', await ev(`(() => { const c = document.getElementById('v3dCanvas'); return c.width > 300 && c.height > 300; })()`));
    if (process.env.V3D_CHARDBG) { await sleep(15000); console.log(await ev(`(async () => { const THREE = await import('/vendor/three.module.min.js'); const e = View3D._state.ents.get('c:' + View3D._state.name); if (!e) return 'no ent'; if (!e.model) return 'no model; busy=' + e.modelBusy + ' none=' + e.modelNone; const o = e.model.pivot || e.model.object; o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o); const meshes = []; o.traverse(x => { if (x.isSkinnedMesh) meshes.push(x.geometry.getAttribute('position').count + 'v vis=' + x.visible); }); return JSON.stringify({ min: b.min.toArray().map(Math.round), max: b.max.toArray().map(Math.round), g: e.g.position.toArray().map(Math.round), scale: e.model.object.scale.x, meshes, clips: Object.keys(e.model.clips).length, state: e.modelState }); })()`)); }
    ok('2: live figures on it', await waitFor(`View3D._state.ents.size > 0`, 15000));
    await sleep(2500); await shot('1_view', '#v3dCanvas');
    ok('2: no sideways scroll', await noScroll());
    // tap the middle of the ground (pointerdown + pointerup at the same spot = a tap, not a drag)
    await ev(`(document.getElementById('v3dCanvas').scrollIntoView({ block: 'center' }), true)`); await sleep(300);
    for (const fy of [0.5, 0.45, 0.58, 0.66, 0.35, 0.75]) {
      const pt = await ev(`(() => { const r = document.getElementById('v3dCanvas').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * ${fy}) }; })()`);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }); await sleep(60);
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 }); await sleep(300);
      if (await ev(`!!document.querySelector('[data-v3d="walkme"]') || !!View3D._state.sel`)) break;
    }
    ok('3: a tap on the ground offers "walk here"', await waitFor(`!!document.querySelector('[data-v3d="walkme"]') || !!View3D._state.sel`, 5000));
    await shot('2_tap');
    if (await ev(`!!document.querySelector('[data-v3d="walkme"]')`)) {
      await click('[data-v3d="walkme"]'); await sleep(800);
      ok('3: walking asks first (answered No here)', await ev(`!!View3D._state.tap`));
    }
    // a monster next to the character (the sandbox has no live monsters): its real model from the player's own client loads (Dashboard/l2cache)
    await ev(`(() => { const me = View3D._state.me; [['Queen Ant', 40, 300, 0], ['Gremlin', 1, -160, 120], ['Orfen', 50, 0, 480], ['Core', 50, -420, -80]].forEach(([n, l, dx, dy], i) => View3D._test.upsert('t:test' + i, { kind: 'mob', x: me.x + dx, y: me.y + dy, z: me.z, label: n, sub: 'lvl ' + l, hp: 100, color: 0xe24c4c, m: { lvl: l } })); return true; })()`);
    if (L2MODELS_AVAILABLE) ok('5: monster models load next to the character', await waitFor(`[...View3D._state.ents.values()].filter(e => e.model).length >= 4`, 60000), await ev(`[...View3D._state.ents.values()].filter(e => e.data && e.data.kind === 'mob').map(e => e.data.label + (e.model ? ' ok' : e.modelNone ? ' none' : e.modelBusy ? ' busy' : ' waiting')).join(', ')`));
    await ev(`(View3D._state.follow = true, true)`); await sleep(1500); await shot('4_models', '#v3dCanvas');
    if (process.env.V3D_WAITBLD) await waitFor(`!/Buildings/.test(document.getElementById('v3dMsg').textContent)`, 240000);
    if (process.env.V3D_WAITBLD) console.log('  buildings: ' + JSON.stringify(await ev(`View3D._bld()`)));
    await click('[data-v3d="top"]'); await sleep(1500); await shot('4b_models_top', '#v3dCanvas');
    if (process.env.V3D_WAITBLD) { await ev(`(() => { const R = View3D._state; return true; })()`); await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 200, y: 400, deltaX: 0, deltaY: 900 }).catch(() => { }); await sleep(1200); await shot('4c_town_wide', '#v3dCanvas'); }
    if (process.env.V3D_DEBUG) console.log(await ev(`JSON.stringify([...View3D._state.ents.entries()].filter(([k]) => k.startsWith('t:')).map(([k, e]) => ({ k, pos: e.g.position.toArray().map(Math.round), to: e.to.toArray().map(Math.round), lab: e.lab && e.lab.position.y, model: !!e.model, mpos: e.model && e.model.object.position.toArray().map(v => Math.round(v)), sc: e.model && e.model.object.scale.x, vis: e.g.visible })))`));
    await sleep(4000); await click('[data-v3d="replay"]');
    ok('5: Replay opens (or says nothing is recorded yet)', await waitFor(`!!View3D._state.replay || /recorded/.test(document.getElementById('v3dMsg').textContent)`, 8000));
    await shot('3_replay', '#v3dCanvas');
    if (await ev(`!!View3D._state.replay`)) { await click('[data-v3d="rplive"]'); ok('5: Back to live', await waitFor(`!View3D._state.replay`, 3000)); }
    // BOSS SCENE: Core in her room with her guards, rings and skills
    await ev(`(location.hash = '#/view3d/boss:' + ${JSON.stringify(process.env.V3D_BOSS || '29006')}, true)`);
    ok('7: Core scene opens with her guards', await waitFor(`!!View3D._state.boss && View3D._state.ents.size >= (${process.env.V3D_BOSS ? 1 : 20})`, 30000), await ev(`document.getElementById('v3dMsg').textContent`));
    ok('7: the boss card names her minions and ranges', process.env.V3D_BOSS ? true : await waitFor(`/Death Knight/.test(document.getElementById('v3dInfo').textContent) && /aggro range 2000/.test(document.getElementById('v3dInfo').textContent)`, 10000));
    if (L2MODELS_AVAILABLE) await waitFor(`[...View3D._state.ents.values()].filter(e => e.model).length >= ${process.env.V3D_BOSS ? 1 : 5}`, 120000); if (process.env.V3D_BOSS) await waitFor(`!/buildings/i.test(document.getElementById('v3dMsg').textContent)`, 300000); await sleep(1500); await shot('5_core', '#v3dCanvas'); await shot('5b_core_card', '#v3dInfo');
    await ev(`(location.hash = '#/parties', true)`); await sleep(600);
    ok('4: leaving the page closes the 3D view', await ev(`View3D._state.open === false && View3D._state.ents.size === 0`));
    ok('6: no browser alert / confirm / prompt', browserDialogs.length === 0, browserDialogs);
    ok('6: no page errors', errors.length === 0, errors.slice(0, 3));
    ok('6: no order written', dirList(path.join(LOGS, 'orders')) === OQ0);
    ok('6: no MCP call that changes anything', !mcp.some(l => /run_account_command|close_account|open_account|send_game_action/.test(l)), mcp.slice(-3));
  } finally {
    try { sock.close(); } catch (e) { } try { br.kill(); } catch (e) { } try { srv.kill(); } catch (e) { }
    try { cp.execSync(`taskkill /F /T /PID ${br.pid}`, { stdio: 'ignore' }); } catch (e) { }
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed — screenshots in ${OUT}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { if (e && e.skip) { console.log('1 passed, 0 failed (skipped)'); process.exit(0); } console.error(e); process.exit(1); });
