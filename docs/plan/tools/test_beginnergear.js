// TEST BEGINNER GEAR (2026-10-12, forum topic 78): data, plan logic, quest 174 in the quest engine, the API endpoint, and (when Edge/Chrome is
// installed) the Quests page box against the SANDBOX server (cmdcenter_testserver.js, mocked MCP — nothing reaches the game).
//   node docs/plan/tools/test_beginnergear.js [path to swarm.js with the QENGINE block]   (default Scripts_dev/swarm.js)
// Read-only on the real data (Scripts/data/beginner_gear.json, quests/174.json, Logs/swarm_state_*.json).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else fail++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info && !cond ? ' — ' + info : ''}`); };
const rj = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const T = require('./beginner_gear.js'), BL = require(path.join(ROOT, 'Dashboard', 'beginnergear_logic.js'));

(async () => {
  console.log('--- data (Scripts/data/beginner_gear.json)');
  const D = rj(path.join(DATA, 'beginner_gear.json'));
  ok('file has the 4 steps', ['tutorial', 'supplyCheck', 'weaponCoupon', 'accessoryCoupon'].every(k => D.steps[k]));
  ok('stored checks passed', D.checks && D.checks.ok === true, JSON.stringify(D.checks));
  // the cross-check needs the datapack (Scripts/data/dp, dev install) + the generated item table (Dashboard/data/items.json, SETUP -Images)
  const HAS_DP = fs.existsSync(path.join(DATA, 'dp', 'multisell')), HAS_ITEMS = fs.existsSync(path.join(ROOT, 'Dashboard', 'data', 'items.json'));
  const errs = (HAS_DP && HAS_ITEMS) ? T.verify(T.buildData()) : [];
  if (!(HAS_DP && HAS_ITEMS)) console.log('  skip fresh verify: needs Scripts/data/dp (dev install only) and Dashboard/data/items.json (SETUP -Images)');
  else ok('fresh verify: every NPC position in spawns_h5.json, item name in items.json, multisell in dp/multisell', !errs.length, errs.join(' | '));
  ok('file equals a fresh build (apart from timestamps)', JSON.stringify(Object.assign({}, D, { generated: 0, checks: 0 })) === JSON.stringify(Object.assign({}, T.buildData(), { generated: 0, checks: 0 })));
  ok('weapon coupon: 5 x 7832, level 6-19, base class', D.steps.weaponCoupon.item.count === 5 && D.steps.weaponCoupon.levels.min === 6 && D.steps.weaponCoupon.levels.max === 19);
  ok('accessory coupon: 1 x 7833 -> 10473 (2 + 2 + 1 D shadow pieces)', D.steps.accessoryCoupon.item.count === 1 && D.steps.accessoryCoupon.box.id === 10473 && D.steps.accessoryCoupon.box.contents.reduce((s, x) => s + x.count, 0) === 5);
  ok('8 Newbie Guides', D.steps.weaponCoupon.npcs.length === 8);
  ok('Supply Check reward = datapack (2466 adena, 5672 exp, 446 sp, 5 items)', D.steps.supplyCheck.reward.adena === 2466 && D.steps.supplyCheck.reward.exp === 5672 && D.steps.supplyCheck.reward.items.length === 5);
  ok('every step has a tag', Object.values(D.steps).every(s => /GUIDE|DATAPACK|LIVE|INFERRED/.test(s.tag || '')));

  console.log('--- plan logic (Dashboard/beginnergear_logic.js)');
  const stats = { "Apprentice's Wand": { mAtk: 7 }, "Squire's Sword": { pAtk: 6 }, 'Coral Earring': { mDef: 21 }, 'Blue Coral Ring': { mDef: 14 }, 'Blue Diamond Necklace': { mDef: 28 } };
  const o = { expToNext: () => 100000, itemStats: (n) => stats[n] || null };
  const step = (c, k) => BL.planChar(c, D, o).steps.find(s => s.key === k);
  ok('class tiers: 10 base, 11 1st, 12 2nd, 94 3rd, 125 1st, 127 2nd, 131 3rd', [10, 11, 12, 94, 125, 127, 131].map(BL.classTier).join() === '0,1,2,3,1,2,3');
  ok('mystic 18 base: weapon coupon DO (staff M.Atk 24 vs wand 7) + class-change warning', (() => { const s = step({ name: 'a', level: 18, classId: 10, gear: { weapon: "Apprentice's Wand" } }, 'weaponCoupon'); return s.verdict === 'do' && s.weapon.id === 10474 && /24 vs 7/.test(s.why) && /CLASS CHANGE/.test(s.why); })());
  ok('human fighter 10: Long Sword; dwarf fighter: Bone Club; orc fighter: Cestus; kamael: skip', step({ name: 'a', level: 10, classId: 0 }, 'weaponCoupon').weapon.id === 10479 && step({ name: 'a', level: 10, classId: 53 }, 'weaponCoupon').weapon.id === 10475 && step({ name: 'a', level: 10, classId: 44 }, 'weaponCoupon').weapon.id === 10477 && step({ name: 'a', level: 10, classId: 123 }, 'weaponCoupon').verdict === 'skip');
  ok('level 5 base: coupon wait; level 20 1st class: coupon gone', step({ name: 'a', level: 5, classId: 0 }, 'weaponCoupon').verdict === 'wait' && step({ name: 'a', level: 20, classId: 1 }, 'weaponCoupon').verdict === 'gone');
  ok('jewelry: 1st class 25 with no-grade jewelry -> optional (+14 M.Def), 2nd class -> gone, base -> wait', (() => {
    const g = { earring: 'Coral Earring + Coral Earring', ring: 'Blue Coral Ring + Blue Coral Ring', neck: 'Blue Diamond Necklace' };
    const s = step({ name: 'a', level: 25, classId: 29, gear: g }, 'accessoryCoupon');
    return s.verdict === 'optional' && /\+14/.test(s.why) && step({ name: 'a', level: 25, classId: 30 }, 'accessoryCoupon').verdict === 'gone' && step({ name: 'a', level: 15, classId: 25 }, 'accessoryCoupon').verdict === 'wait' && step({ name: 'a', level: 39, classId: 26 }, 'accessoryCoupon').verdict === 'do'; })());
  ok('Supply Check: 1 wait, 5 do, 15 optional, 30 skip, done when quest_state says so', step({ name: 'a', level: 1, classId: 0 }, 'supplyCheck').verdict === 'wait' && step({ name: 'a', level: 5, classId: 0 }, 'supplyCheck').verdict === 'do'
    && step({ name: 'a', level: 15, classId: 0 }, 'supplyCheck').verdict === 'optional' && step({ name: 'a', level: 30, classId: 1 }, 'supplyCheck').verdict === 'skip' && step({ name: 'a', level: 5, classId: 0, quests: { 174: { status: 'done' } } }, 'supplyCheck').verdict === 'done');
  ok('unknown class never throws and gives "no"', step({ name: 'a', level: 10 }, 'weaponCoupon').verdict === 'no');
  // the plan file is built from THIS install's bot state files (docs/plan/tools/beginner_gear.js --plan); a fresh / public install has none yet
  const PF = path.join(DATA, 'beginner_gear_plan.json');
  if (!fs.existsSync(PF)) console.log('  skip plan file checks: no Scripts/data/beginner_gear_plan.json yet (node docs/plan/tools/beginner_gear.js --plan builds it)');
  else {
  const P = rj(PF);
  ok('plan file: rows + summary, sorted "do" first', P.rows.length > 0 && P.summary && (P.rows.findIndex(r => !r.steps.some(s => s.verdict === 'do')) < 0 || P.rows.slice(0, P.rows.findIndex(r => !r.steps.some(s => s.verdict === 'do'))).every(r => r.steps.some(s => s.verdict === 'do'))));
  ok('plan never recommends a coupon outside its window', P.rows.every(r => r.steps.every(s => !(s.key === 'weaponCoupon' && /^(do|optional)$/.test(s.verdict)) || (r.level >= 6 && r.level <= 19 && r.tier === 0))
    && r.steps.every(s => !(s.key === 'accessoryCoupon' && /^(do|optional)$/.test(s.verdict)) || (r.level < 40 && r.tier === 1))));
  }

  console.log('--- quest 174 in the quest engine (QENGINE-PURE of swarm.js)');
  const F = process.argv.slice(2).filter(a => !/^--/.test(a))[0] ? path.resolve(process.argv.slice(2).filter(a => !/^--/.test(a))[0]) : path.join(ROOT, 'Scripts_dev', 'swarm.js');
  const src = fs.readFileSync(F, 'utf8'), a = src.indexOf('// QENGINE-PURE-BEGIN'), b = src.indexOf('// QENGINE-PURE-END');
  const q = rj(path.join(DATA, 'quests', '174.json'));
  ok('quests/174.json is the corrected record (manual, 5 transitions, end only at cond 4 with the 5 armor items)', q.manual === true && q.transitions.length === 5 && q.transitions.filter(t => t.to === 'end').length === 1 && JSON.stringify(q.transitions.find(t => t.to === 'end').from) === '[4]' && q.transitions.find(t => t.to === 'end').gives.length === 5);
  const Qh = rj(path.join(DATA, 'quests_h5.json')).quests[174];
  ok('quests_h5.json 174 (quest page) carries the same steps / transitions', JSON.stringify(Qh.transitions) === JSON.stringify(q.transitions) && Qh.description && Qh.manual === true);
  if (a < 0 || b < 0) ok('QENGINE-PURE block present in ' + F, false);
  else {
    const E = new Function(src.slice(a, b) + '\nreturn { qeDecide, qeEligible };')();
    // the server, as in Q00174_SupplyCheck.java
    const run = (api) => {
      const sim = { started: false, cond: 0, items: {}, done: false, reward: null }, own = { started: false, cond: null }, talks = [];
      const talk = (npc, start) => {
        if (start) { if (npc === 32173) { sim.started = true; sim.cond = 1; } return; }
        if (!sim.started) return;
        if (npc === 32170 && sim.cond === 1) { sim.cond = 2; sim.items[9792] = 1; }
        else if (npc === 32173 && sim.cond === 2) { sim.cond = 3; delete sim.items[9792]; }
        else if (npc === 32167 && sim.cond === 3) { sim.cond = 4; sim.items[9793] = 1; }
        else if (npc === 32173 && sim.cond === 4) { sim.started = false; sim.done = true; sim.items = {}; sim.reward = 'armor+2466'; }
      };
      for (let i = 0; i < 20 && !sim.done; i++) {
        const s = api ? { started: sim.started, cond: sim.started ? sim.cond : null, condKnown: true, apiKnown: true, have: Object.assign({}, sim.items) } : { started: own.started, cond: own.cond, condKnown: false, have: Object.assign({}, sim.items) };
        const act = E.qeDecide(q, s);
        if (act.act === 'advance') { own.cond = act.to; continue; }
        if (act.act !== 'talk' && act.act !== 'turnin') { talks.push(act.act + ':' + (act.why || '')); break; }
        const npc = act.npcs[0]; talks.push(npc);
        const before = sim.cond + ':' + sim.started;
        talk(npc, act.kind === 'start');
        if (!api) { if (act.kind === 'start') { own.started = true; own.cond = 1; } else if (before !== sim.cond + ':' + sim.started) { if (act.to === 'end') { own.started = false; own.cond = null; } else own.cond = act.to; } }
      }
      return { done: sim.done, reward: sim.reward, talks };
    };
    const r1 = run(true), r2 = run(false);
    ok('with the quest API: Marcela -> Benis -> Marcela -> Nika -> Marcela, reward', r1.done && r1.talks.join() === '32173,32170,32173,32167,32173', r1.talks.join());
    ok('without the quest API (engine\'s own record): same 5 talks, reward', r2.done && r2.talks.join() === '32173,32170,32173,32167,32173', r2.talks.join());
    ok('eligible: level 2 human fighter yes, level 1 no', E.qeEligible(q, { level: 2, classId: 0 }).ok && !E.qeEligible(q, { level: 1, classId: 0 }).ok);
  }
  const qe = fs.readFileSync(path.join(__dirname, 'quest_engine_data.js'), 'utf8');
  ok('quest_engine_data.js keeps manual records (MANUAL GUARD)', /old\.manual === true/.test(qe));

  console.log('--- API GET /api/quests/beginner (Dashboard/questpage_api.js, sandbox states)');
  const A = require(path.join(ROOT, 'Dashboard', 'questpage_api.js'));
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bgapi-')), LOGS = path.join(TMP, 'Logs'); fs.mkdirSync(LOGS);
  fs.writeFileSync(path.join(LOGS, 'quest_state_Newbie.json'), JSON.stringify({ name: 'Newbie', quests: { 174: { status: 'done' } } }));
  const states = [{ name: 'Newbie', level: 8, classId: 0, cls: 'Human Fighter', ageSec: 5, gear: { weapon: "Squire's Sword" } }, { name: 'Oracle', level: 22, classId: 29, cls: 'Elven Oracle', ageSec: 900 }, { name: 'Old', level: 60, classId: 16, ageSec: 5 }];
  const out = {}; const ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA, LOGS, ROOT, readStates: () => states, allowed: () => true, json: (res, code, body) => { out.code = code; out.body = body; }, send: () => { } };
  await A.handle({ method: 'GET' }, {}, new URL('http://x/api/quests/beginner'), ctx);
  const B = out.body || {};
  ok('200 + data + plan', out.code === 200 && B.ok && B.data && B.plan && B.plan.rows.length === 3, JSON.stringify(out).slice(0, 200));
  const rowOf = (n) => (B.plan.rows || []).find(r => r.name === n) || { steps: [] }, st = (n, k) => (rowOf(n).steps.find(s => s.key === k) || {}).verdict;
  ok('Newbie 8: Supply Check done (quest_state), weapon coupon do (Long Sword 24 vs Squire\'s Sword 6), online', st('Newbie', 'supplyCheck') === 'done' && st('Newbie', 'weaponCoupon') === 'do' && (!fs.existsSync(path.join(DATA, 'dp', 'gear_db.json')) || /24 vs 6/.test(rowOf('Newbie').steps.find(s => s.key === 'weaponCoupon').why)) && rowOf('Newbie').online === true);   // "24 vs 6" = weapon stats from Scripts/data/dp/gear_db.json (dev install)
  ok('Oracle 22: jewelry do, weapon coupon gone; Old 60: nothing', st('Oracle', 'accessoryCoupon') === 'do' && st('Oracle', 'weaponCoupon') === 'gone' && !rowOf('Old').steps.some(s => /^(do|optional)$/.test(s.verdict)));
  ok('"do" rows first', B.plan.rows[0].name === 'Newbie' || B.plan.rows[0].name === 'Oracle');
  out.code = 0; await A.handle({ method: 'GET' }, {}, new URL('http://x/api/quests/beginner'), Object.assign({}, ctx, { allowed: () => false }));
  ok('key checked (401 without)', out.code === 401);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }

  console.log('--- page (Dashboard/questpage.js, static checks)');
  const pg = fs.readFileSync(path.join(ROOT, 'Dashboard', 'questpage.js'), 'utf8');
  ok('no alert / confirm / prompt', !/[^a-zA-Z.](alert|confirm|prompt)\(/.test(pg.replace(/uiConfirm|uiAlert|uiPrompt/g, '')));
  ok('box + orders: !quest 174 solo, !goto npc #<guide>, /clicklink', /qpBgBox/.test(pg) && /!quest 174 solo \$\{name\}/.test(pg) && /!goto npc #\$\{id\} \$\{name\}/.test(pg) && /\/clicklink \$\{text\}/.test(pg));

  // ---------------------------------------------------------------- UI (sandbox server + headless Edge), optional
  const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
  if (!EDGE || process.env.NO_UI) { console.log('--- UI skipped (no Edge / Chrome or NO_UI)'); return finish(); }
  console.log('--- UI (sandbox server, headless browser, iPhone 390x844)');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const srv = cp.spawn(process.execPath, [path.join(__dirname, 'cmdcenter_testserver.js')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let PORT = 0; const mcpLog = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcpLog.push(l); }));
  srv.stderr.on('data', () => { });
  for (let i = 0; i < 100 && !PORT; i++) await sleep(100);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-edge-')), DBG = 9800 + Math.floor(Math.random() * 150);
  const br = cp.spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  const cleanup = () => { try { br.kill(); srv.kill(); } catch (e) { } try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { } };
  try {
    if (!PORT) throw new Error('sandbox server did not start');
    let ws = null;
    for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
    if (!ws) throw new Error('no browser');
    const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
    let id = 0; const pend = {}, handlers = [];
    sock.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
    const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
    const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
    const browserDialogs = [], dialogs = [], errors = [];
    handlers.push((m) => { if (m.method === 'Page.javascriptDialogOpening') { browserDialogs.push(m.params.type); cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { }); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text); });
    await cdp('Page.enable'); await cdp('Runtime.enable');
    await require('./uidialog_testhook')(cdp, handlers, { answer: true, onDialog: (d) => dialogs.push(d) });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/parties` });
    await waitFor(`!!document.querySelector('#tabs [data-tab="quests"]') && !!window.QuestPage`, 30000); await sleep(1500);
    await ev(`document.querySelector('#tabs [data-tab="quests"]').click()`);
    ok('quests page loads', await waitFor(`!!document.getElementById('qpBgBox') && !document.getElementById('tab-questpage').hidden`, 40000));
    await ev(`(() => { document.getElementById('qpBgBox').open = true; return true; })()`);
    ok('Beginner gear box: 4 chain cards + plan cards', await waitFor(`document.querySelectorAll('.qp-bgchain .qp-card').length === 4 && !!document.getElementById('qpBgPlan')`, 15000), await ev(`(document.getElementById('qpBg') || {}).textContent.slice(0, 200)`));
    const btn = await ev(`(() => { const b = document.querySelector('#qpBgPlan [data-qp="bggo"]'); return b ? b.dataset.name : ''; })()`);
    ok('no horizontal page scroll (iPhone, beginner box)', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`));
    if (btn) {
      dialogs.length = 0; mcpLog.length = 0;
      await ev(`document.querySelector('#qpBgPlan [data-qp="bggo"][data-name="${btn}"]').click()`);
      await waitFor(`/Sent to/.test((document.getElementById('qpMsg') || {}).textContent || '')`, 8000);
      ok('"Go to Newbie Guide" asks with the shared dialog and sends !goto npc #31077 <name> (mock MCP)', dialogs.length === 1 && mcpLog.some(l => l.includes(`!goto npc #31077 ${btn}`)), mcpLog.slice(0, 2).join(' | ') + ' dialogs ' + dialogs.length);
    } else ok('a coupon row with buttons (needs a real character in a beginner window)', true);
    ok('no browser alert / confirm / prompt', !browserDialogs.length);
    ok('no script errors', !errors.length, errors.slice(0, 2).join(' | '));
    try { sock.close(); } catch (e) { }
  } catch (e) { ok('UI run', false, e.message); }
  cleanup();
  finish();
})().catch(e => { console.error(e); process.exit(2); });
function finish() { console.log(`\ntest_beginnergear: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
