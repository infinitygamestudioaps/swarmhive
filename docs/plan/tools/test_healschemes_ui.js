// HEAL SCHEMES sheet (2026-10-13, Dashboard/healschemes.js): headless browser check (Edge via CDP) against the SANDBOX server
// (cmdcenter_testserver.js: mocked MCP, nothing reaches the game). The heal-schemes file is a SCRATCH file (SWARM_HEALSCHEMES_FILE); the live
// Scripts/data/heal_schemes.json and the party-settings files are compared before / after. Every uidialog question answers itself.
//   1. character page of a healer: "✚ Healing" button -> the sheet (iPhone 390x844, full screen, no sideways scroll): every situation says
//      "Automatic — <skill>" (never Self Heal for a healer class), Save off until a change
//   2. edits (dying %, a picked skill, MP for everyone, never-list) -> Save -> exactly those keys in chars.<name>; a bad % blocks Save
//   3. conflict: the file changed meanwhile -> "Changed meanwhile" choice -> Overwrite keeps the other entry and adds mine
//   4. "Every <class>" scope -> classes.<id>; "All automatic" -> the character entry removed
//   5. party settings popup: section "Healing" lists the healer with Edit -> the sheet opens above the popup
//   6. desktop screenshot; no browser dialogs, no page errors
//   node docs/plan/tools/test_healschemes_ui.js [screenshot dir]     (default: %TEMP%\healschemes_shots)
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'healschemes_shots');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info !== undefined && !cond ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const DATA = path.join(ROOT, 'Scripts', 'data'), LOGS = path.join(ROOT, 'Logs');
const rd = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const LIVE = [path.join(DATA, 'heal_schemes.json'), path.join(DATA, 'fund_rules.json'), path.join(DATA, 'gear_auto.json'), path.join(DATA, 'stash_rules.json'), path.join(DATA, 'party_tactics.json'),
  path.join(DATA, 'route_rules.json'), path.join(DATA, 'run_state.json'), path.join(DATA, 'party_auto.json'), path.join(DATA, 'seven_signs.json')];
const LIVE0 = Object.fromEntries(LIVE.map(f => [f, rd(f)]));

(async () => {
  if (!EDGE) { console.log('no Edge / Chrome — UI test skipped'); process.exit(0); }
  fs.mkdirSync(OUT, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hsui-'));
  const HF = path.join(TMP, 'heal_schemes.json');
  const fileJ = () => { const t = rd(HF); return t ? JSON.parse(t) : null; };
  // the healer to test: from the live bot states (read only), the same way the API sees them
  process.env.SWARM_HEALSCHEMES_FILE = HF;
  const API = require(path.join(ROOT, 'Dashboard', 'healschemes_api.js'));
  const states = []; for (const f of fs.readdirSync(LOGS)) { if (!/^swarm_state_.+\.json$/.test(f)) continue; try { const s = JSON.parse(fs.readFileSync(path.join(LOGS, f), 'utf8')); if (s && s.name && f === `swarm_state_${s.name}.json`) { s.ageSec = 999; states.push(s); } } catch (e) { } }
  const rows = API.summary({ DATA, LOGS: TMP, ROOT, readStates: () => states }).chars;
  const H = rows.find(r => r.healerClass && r.auto && r.auto.recharge) || rows.find(r => r.healerClass && r.canHeal);
  if (!H) { console.log('no healer character in Logs/swarm_state_*.json — UI test skipped'); process.exit(0); }
  console.log(`healer under test: ${H.name} (${H.cls} ${H.level})`);

  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { SWARM_HEALSCHEMES_FILE: HF }) });
  let port = 0; srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) port = +m[1]; }));
  srv.stderr.on('data', d => process.stderr.write('[server] ' + d));
  for (let i = 0; i < 150 && !port; i++) await sleep(100);
  if (!port) throw new Error('sandbox server did not start');
  const BASE = `http://127.0.0.1:${port}/`;

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-edge-'));
  const DBG = 9800 + Math.floor(Math.random() * 150);
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
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `hs_${name}.png`), Buffer.from(r.data, 'base64')); };
  const browserDialogs = [], dialogs = [], errors = [];
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await require('./uidialog_testhook')(cdp, handlers, { answer: true, uiMode: 'simple', onDialog: (d) => dialogs.push(d) });
  const phone = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); };
  const desktop = async () => { await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); };
  const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const setVal = (sel, v, evn = 'change') => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event(${JSON.stringify(evn)}, { bubbles: true })); return true; })()`);
  const bar = () => ev(`document.getElementById('hsBar').textContent`);
  const noScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1 && (() => { const s = document.getElementById('hsScroll'); return !s || s.scrollWidth <= s.clientWidth + 1; })()`);
  const saveOff = () => ev(`document.querySelector('#hsBar [data-hsact="save"]').disabled`);

  try {
    // ---- 1. character page -> the sheet
    await phone();
    // load the page on the Parties tab first (the sandbox server never answers some live requests of the character page; with all browser
    // connections busy, the scripts at the end of index.html would wait), then switch to the character page without a reload
    await cdp('Page.navigate', { url: BASE + '#/parties' });
    ok('0: the page and its modules load', await waitFor(`!!window.HealSchemes && !!window.HealLogic && !!window.PartySettings`, 30000));
    await ev(`(location.hash = '#/char/' + encodeURIComponent(${JSON.stringify(H.name)}), true)`);
    ok(`1: ${H.name}'s character page has "✚ Healing"`, await waitFor(`!!document.querySelector('#cpHead [data-hsopen="${H.name}"]')`, 30000),
      (await ev(`JSON.stringify({ hs: !!window.HealSchemes, data: !!(window.HealSchemes && HealSchemes._state.data), err: window.HealSchemes && HealSchemes._state.err, ps: typeof window.PartySettings, hl: typeof window.HealLogic, scripts: [...document.scripts].map(x => x.src).filter(x => /heal|party/.test(x)), acts: document.querySelector('#cpHead .cp-acts') ? document.querySelector('#cpHead .cp-acts').textContent : 'no acts' })`)) + ' ' + JSON.stringify(errors.slice(0, 2)));
    await click(`#cpHead [data-hsopen="${H.name}"]`);
    ok('1: the sheet opens and loads', await waitFor(`!document.getElementById('hsOv').hidden && document.querySelectorAll('#hsBody .hs-card').length >= 8`, 15000),
      await ev(`HealSchemes.open(${JSON.stringify(H.name)}).then(() => 'opened: ' + document.getElementById('hsBody').textContent.slice(0, 200) + ' hidden=' + document.getElementById('hsOv').hidden, e => 'ERR ' + e.stack)`));
    ok('1: title "Healing — <name>"', (await ev(`document.getElementById('hsTitle').textContent`)) === `Healing — ${H.name}`);
    ok('1: full screen on the iPhone, no sideways scroll', await ev(`(() => { const r = document.querySelector('.hs-dlg').getBoundingClientRect(); return r.width >= 389 && r.height >= 800; })()`) && await noScroll());
    const autos = await ev(`[...document.querySelectorAll('#hsBody .hs-sk.auto[data-hspick]')].map(b => { const s = (b.querySelector('small') || {}).textContent || ''; return /^now: /.test(s) ? 'Automatic — ' + s.slice(5) : 'Automatic (' + s + ')'; })`);   // HEALICONS: icon picker
    ok('1: every skill box starts at "Automatic — <skill>"', autos.length >= 4 && autos.every(t => /^Automatic/.test(t)), autos);
    ok('1: a healer class is never on Self Heal automatically', autos.every(t => !/Self Heal/.test(t)), autos);
    const em = await ev(`(() => { const b = document.querySelector('#hsBody .hs-sk.auto[data-hspick="emergency.skill"]'); const s = b ? (b.querySelector('small') || {}).textContent || '' : ''; return 'Automatic — ' + s.replace(/^now: /, ''); })()`);
    ok(`1: the page's automatic choice = the bots' choice (dying: ${H.auto.emergency ? H.auto.emergency.name : '-'})`, !H.auto.emergency || em === 'Automatic — ' + H.auto.emergency.name, em);
    ok('1: nothing changed yet: Save off, "All automatic"', await saveOff() && /All automatic/.test(await bar()), await bar());
    ok('1: plain words — no file names / ids in the main view', await ev(`(() => { const b = document.getElementById('hsBody').cloneNode(true); b.querySelectorAll('details').forEach(d => d.remove()); return !/heal_schemes\\.json|\\b1216\\b|classId/.test(b.textContent); })()`));
    await shot('01_iphone_open');
    await ev(`(() => { const c = document.querySelector('#hsBody [data-hssw="recharge.on"]'); if (c) c.scrollIntoView({ block: 'center' }); return true; })()`); await sleep(200); await shot('01b_iphone_mp');
    await ev(`(document.getElementById('hsScroll').scrollTop = 0, true)`);

    // ---- 2. edits + save
    await setVal('#hsBody input[data-hsin="emergency.below"]', '150', 'input');
    ok('2: a bad % (150) blocks Save with a plain sentence', await waitFor(`/5 to 99/.test(document.getElementById('hsBar').textContent)`, 3000) && await saveOff(), await bar());
    await setVal('#hsBody input[data-hsin="emergency.below"]', '40');
    const opt2 = await ev(`(() => { const o = [...document.querySelectorAll('#hsBody [data-hspick="single.skill"]')].filter(x => x.dataset.v !== 'auto'); return o.length ? o[o.length - 1].dataset.v : null; })()`);
    if (opt2) await click(`#hsBody [data-hspick="single.skill"][data-v="${opt2}"]`);
    const hasWho = await ev(`!!document.querySelector('#hsBody [data-hsseg="recharge.who"][data-v="everyone"]')`);
    if (hasWho) await click('#hsBody [data-hsseg="recharge.who"][data-v="everyone"]');
    const chipId = await ev(`(() => { const c = [...document.querySelectorAll('#hsBody [data-hsnever]')].find(x => /Self Heal/.test(x.textContent)) || document.querySelector('#hsBody [data-hsnever]'); return c ? Number(c.dataset.hsnever) : null; })()`);
    if (chipId) await click(`#hsBody [data-hsnever="${chipId}"]`);
    ok('2: "Unsaved changes" and Save on', await waitFor(`/Unsaved changes/.test(document.getElementById('hsBar').textContent) && !document.querySelector('#hsBar [data-hsact="save"]').disabled`, 3000), await bar());
    ok('2: the changed cards say "changed"', (await ev(`document.querySelectorAll('#hsBody .hs-chg').length`)) >= 2);
    await shot('02_iphone_edited');
    await click('#hsBar [data-hsact="save"]');
    ok('2: saved', await waitFor(`/Saved/.test(document.getElementById('hsBar').textContent)`, 10000), await bar());
    const J1 = fileJ() || {}, mine = (J1.chars || {})[H.name] || {};
    ok('2: the file holds exactly the changed fields', mine.emergency && mine.emergency.below === 40 && (!opt2 || (mine.single && mine.single.skill === Number(opt2))) && (!hasWho || (mine.recharge && mine.recharge.who === 'everyone'))
      && (!chipId || (mine.never || []).includes(chipId)) && !mine.group && !mine.self && !mine.priority && !mine.potion && Object.keys(J1.classes || {}).length === 0, mine);

    // ---- 3. conflict: the file changed meanwhile
    const J2 = fileJ(); J2.classes = { 999: { priority: 'healers' } }; fs.writeFileSync(HF, JSON.stringify(J2, null, 1));
    await setVal('#hsBody input[data-hsin="potion"]', '30');
    dialogs.length = 0;
    await click('#hsBar [data-hsact="save"]');
    ok('3: "Changed meanwhile" asked (styled dialog, not the browser)', await waitFor(`/Saved/.test(document.getElementById('hsBar').textContent)`, 10000) && dialogs.some(d => d.type === 'choice' && /Changed meanwhile/.test(d.title)), dialogs);
    const J3 = fileJ() || {};
    ok('3: Overwrite kept the other change and added mine', J3.classes && J3.classes['999'] && J3.chars[H.name].potion && J3.chars[H.name].potion.below === 30 && J3.chars[H.name].emergency.below === 40, J3);

    // ---- 4. class scope + back to automatic
    await click('#hsBody [data-hsseg="scope"][data-v="class"]');
    ok('4: "Every <class>" shows the class settings (empty = automatic)', await waitFor(`/All automatic/.test(document.getElementById('hsBar').textContent) && /unless that character has its own settings/.test(document.getElementById('hsBody').textContent)`, 5000), await bar());
    await click('#hsBody [data-hsseg="priority"][data-v="healers"]');
    await click('#hsBar [data-hsact="save"]');
    await waitFor(`/Saved/.test(document.getElementById('hsBar').textContent)`, 10000);
    const J4 = fileJ() || {};
    ok('4: class scope writes classes.<classId>', J4.classes && J4.classes[String(H.classId)] && J4.classes[String(H.classId)].priority === 'healers', J4.classes);
    await click('#hsBody [data-hsseg="scope"][data-v="char"]');
    await waitFor(`!document.querySelector('#hsBar [data-hsact="reset"]').disabled`, 5000);
    dialogs.length = 0;
    await click('#hsBar [data-hsact="reset"]');
    await waitFor(`/Back to automatic/.test(document.getElementById('hsBar').textContent)`, 10000);
    const J5 = fileJ() || {};
    ok('4: "All automatic" (confirmed in the styled dialog) removes the character entry, the class entry stays', !(J5.chars || {})[H.name] && J5.classes[String(H.classId)] && dialogs.some(d => d.type === 'confirm'), J5);
    await click('#hsOv [data-hsact="close"]');
    ok('4: closes', await waitFor(`document.getElementById('hsOv').hidden`, 3000));

    // ---- 5. party settings popup
    const L = await ev(`(() => { const r = (HealSchemes._state.data.chars || []).find(c => c.name === ${JSON.stringify(H.name)}); return r ? r.party : null; })()`);
    ok(`5: the server knows ${H.name}'s party`, !!L, L);
    if (L) {
      await ev(`(location.hash = '#/parties', true)`);
      await waitFor(`document.querySelectorAll('#tab-parties [data-psopen]').length > 0 && !!window.PartySettings`, 25000);
      const has = await ev(`!!document.querySelector('#tab-parties [data-psopen="${L}"]')`);
      if (has) {
        await click(`#tab-parties [data-psopen="${L}"]`);
        ok('5: the party settings popup has a "Healing" section', await waitFor(`!!document.querySelector('#psBody details[data-pssec="heal"]')`, 20000));
        await ev(`(() => { const d = document.querySelector('#psBody details[data-pssec="heal"]'); d.open = true; d.scrollIntoView(); return true; })()`);
        ok(`5: it lists ${H.name} with Edit`, await waitFor(`!!document.querySelector('#psBody [data-pssec="heal"] [data-hsopen="${H.name}"]')`, 10000), await ev(`document.querySelector('#psBody [data-pssec="heal"]').textContent.slice(0, 300)`));
        await shot('03_iphone_party_section');
        await click(`#psBody [data-pssec="heal"] [data-hsopen="${H.name}"]`);
        ok('5: Edit opens the heal sheet ABOVE the popup', await waitFor(`!document.getElementById('hsOv').hidden && Number(getComputedStyle(document.getElementById('hsOv')).zIndex) > Number(getComputedStyle(document.getElementById('psOv')).zIndex)`, 10000));
        await click('#hsOv [data-hsact="close"]');
        await click('#psOv [data-psact="close"]');
      } else ok(`5: party ${L} card found`, false);
    }
    // ---- 6. desktop
    await desktop();
    await ev(`(location.hash = '#/char/' + encodeURIComponent(${JSON.stringify(H.name)}), true)`);
    await waitFor(`!!document.querySelector('#cpHead [data-hsopen="${H.name}"]')`, 30000);
    await click(`#cpHead [data-hsopen="${H.name}"]`);
    ok('6: desktop: a centred card (HEALPOLISH: wider, two card columns, never full screen)', await waitFor(`!document.getElementById('hsOv').hidden && (() => { const r = document.querySelector('.hs-dlg').getBoundingClientRect(); return r.width < innerWidth - 20 && Math.abs(r.left - (innerWidth - r.right)) < 4 && r.height < innerHeight; })()`, 15000));
    await sleep(400); await shot('04_desktop');
    ok('6: no browser alert / confirm / prompt', !browserDialogs.length, browserDialogs);
    ok('6: no page errors', !errors.length, errors.slice(0, 3));
  } finally {
    ok('the live settings files were not touched', LIVE.every(f => rd(f) === LIVE0[f]));
    const fails = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - fails}/${results.length} UI checks passed — screenshots: ${OUT}`);
    try { sock.close(); } catch (e) { } br.kill(); srv.kill();
    process.exitCode = fails ? 1 : 0;
  }
})().catch(e => { console.error(e); process.exit(2); });
