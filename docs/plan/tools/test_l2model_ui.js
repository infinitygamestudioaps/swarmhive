// L2 MODELS (2026-10-17, Dashboard/l2model.js + l2models_api.js): loads monster models from the player's own client (exported on demand into
// Dashboard/l2cache) in the sandbox page, plays the idle / run / attack / death clips and takes screenshots.   node docs/plan/tools/test_l2model_ui.js
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'l2model_shots');
const EDGE = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));   // NEVER Microsoft Edge (owner 2026-10-24): Chrome only
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
  const BASE = process.env.L2M_BASE || `http://127.0.0.1:${port}/`;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'l2m-edge-'));
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
    await cdp('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: BASE + '#/parties' });
    if (!L2MODELS_AVAILABLE) { console.log('  no game client / UE Viewer here — model test skipped'); results.push({ name: 'skipped', ok: true }); throw { skip: true }; }
    ok('0: page loads', await waitFor(`!!window.api`, 30000));
    if (process.env.L2M_STATIC) { console.log(await ev(`(async () => { const L = await import('/l2model.js'); const d = await api('/api/l2model/buildings?x=83473&y=148554&r=5200'); const ms = [...new Set(d.rows.map(r => r[0]))].slice(0, 30); const out = []; for (const m of ms) { const t0 = performance.now(); const info = await api('/api/l2model/static?mesh=' + encodeURIComponent(m)); const t1 = performance.now(); let st = ''; try { await Promise.race([L.loadStatic(info), new Promise((_, no) => setTimeout(() => no(new Error('timeout 15s')), 15000))]); st = 'ok'; } catch (e) { st = e.message; } out.push(m.split('.').pop() + ' api ' + Math.round(t1 - t0) + 'ms load ' + Math.round(performance.now() - t1) + 'ms ' + st + ' mats ' + (info.mats || []).length); } return out.join(' || '); })()`)); throw { skip: true }; }
    const NAMES = (process.env.L2M_NAMES || 'Gremlin|Queen Ant|Tomb Archon|Lilim Knight-Errant').split('|');
    for (const state of ['idle', 'run', 'attack', 'death']) {
      const r = await ev(`(async () => {
        window.L2_ROT = ${Number(process.env.L2M_ROT || 0)}; const L = await import('/l2model.js?r=' + window.L2_ROT); const THREE = await import('/vendor/three.module.min.js');
        let cv = document.getElementById('l2mtest'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'l2mtest'; cv.width = 900; cv.height = 700; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#203040'; document.body.appendChild(cv); }
        const rd = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); const sc = new THREE.Scene(); sc.background = new THREE.Color(0x203040);
        sc.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(200, 400, 300); sc.add(dl);
        const names = ${JSON.stringify(NAMES)}, info = [];
        let x = -((names.length - 1) * 200) / 2;
        for (const n of names) {
          const isC = n.startsWith('@'), nn = isC ? n.slice(1) : n;
          let m = null; for (let i = 0; i < 80; i++) { m = await api(isC ? '/api/l2model/char?name=' + encodeURIComponent(nn) : '/api/l2model/npc?name=' + encodeURIComponent(nn)); if (!m.pending) break; await new Promise(r => setTimeout(r, 1000)); }
          if (!m || !m.ok) { info.push(n + ': ' + JSON.stringify(m)); continue; }
          const md = isC ? await L.loadCharacter(m) : await L.loadModel(m); if (isC) md.stance = m.stance;
          const box = new THREE.Box3().setFromObject(md.mesh); const size = box.getSize(new THREE.Vector3()); const s = 160 / Math.max(size.y, size.x, size.z, 1);
          md.object.scale.setScalar(s); md.object.position.x = x; x += 200; sc.add(md.object);
          const clip = md.stance ? Object.values(md.clips).find(c => c.name.toLowerCase().startsWith(({ idle: 'wait_', run: 'run_', attack: 'atk01_', death: 'death_' })[${JSON.stringify(state)}] + (${JSON.stringify(state)} === 'death' ? '' : md.stance.toLowerCase()))) : L.clipFor(md.clips, ${JSON.stringify(state)});
          if (clip) { const a = md.mixer.clipAction(clip); a.play(); md.mixer.update(Math.min(clip.duration * 0.4, 0.6)); }
          info.push(n + ': ' + (clip ? clip.name : 'no clip') + ' of ' + Object.keys(md.clips).length + ' · size ' + size.toArray().map(v => Math.round(v)).join('x'));
        }
        const cam = new THREE.PerspectiveCamera(40, 900 / 700, 1, 5000); cam.position.set(0, 140, 620); cam.lookAt(0, 70, 0);
        sc.updateMatrixWorld(true); rd.render(sc, cam);
        return info;
      })()`);
      console.log('  ' + state + ': ' + r.join(' | '));
      ok(`models load (` + state + `)`, r.length === NAMES.length && !r.some(x => /ok":false|no clip|error/i.test(x)), r);
      await shot(state);
    }
    ok('no page errors', errors.length === 0, errors.slice(0, 3));
  } finally {
    try { sock.close(); } catch (e) { } try { br.kill(); } catch (e) { } try { srv.kill(); } catch (e) { }
    try { cp.execSync(`taskkill /F /T /PID ${br.pid}`, { stdio: 'ignore' }); } catch (e) { }
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed — screenshots in ${OUT}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { if (e && e.skip) { console.log('1 passed, 0 failed (skipped)'); process.exit(0); } console.error(e); process.exit(1); });
