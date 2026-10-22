// Headless check of the 16 dashboard bugs the user-guide writers found (2026-10-09): Spots filter keeps stale ticks, Zones Edit wiping the
// drawn area, Academy Create (P before declared + password on the command line), clan roster empty with a blank clan name, editor
// "added …" messages, teleport price chips "&#57;", daily boxes "party 1/2", phone party button row, spotWatch, command-center free text
// dry run, PC tab limits, gear roles nuker/dagger, character page before /api/state, override attack, item names, hard-coded names.
// SANDBOX: a temp folder with SYNTHETIC demo characters is the install root; server.js runs from the real Dashboard folder with MCP MOCKED
// (nothing reaches L2Swarm / the game), no timers / child processes; in the browser every POST is intercepted (only command-center DRY
// RUNS reach the sandbox server). iPhone 390x844 + desktop 1440x900. Screenshots: docs/plan/mobile_check/guidebugs_*.png
//   node docs/plan/tools/test_guidebugs_ui.js
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process'), os = require('os'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..', '..');

// ===================================================================== sandbox server (child process) ==============================
if (process.argv[2] === '--server') {
  const SB = process.argv[3];
  const SC = require(path.join(ROOT, 'docs', 'plan', 'tools', 'swarm_config.js'));
  const ACC = JSON.parse(fs.readFileSync(path.join(SB, 'accounts.json'), 'utf8'));
  SC.ROOT = SB; SC.ROOT_FWD = SB.replace(/\\/g, '/'); SC.mainLeader = 'Tankard'; SC.clanLeader = 'Fundor'; SC.reload = () => ({ accounts: ACC }); SC.accounts = ACC;
  SC.partyOf = {}; ACC.forEach(a => { SC.partyOf[a.character] = a.party; }); SC.parties = [...new Set(ACC.map(a => a.party))];
  SC.cfg = { accounts: ACC, mainLeader: 'Tankard', clanLeader: 'Fundor', dailyLeaders: ['Tankard', 'Fundor'] };
  SC.dashboardPort = 0; SC.mcpUrl = 'http://127.0.0.1:8083';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opt = {}) => {
    const u = String(url);
    if (/:8083\b/.test(u)) {
      const b = JSON.parse(opt.body || '{}');
      let result;
      if (b.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: {} };
      else { process.stdout.write('MCP ' + b.params.name + ' ' + JSON.stringify(b.params.arguments || {}) + '\n'); result = { content: [{ type: 'text', text: b.params.name === 'get_accounts_status' ? '[]' : JSON.stringify({ success: true, mock: true }) }] }; }
      const txt = JSON.stringify({ jsonrpc: '2.0', id: b.id, result });
      return { headers: { get: (h) => (h.toLowerCase() === 'mcp-session-id' ? 'mock' : null) }, text: async () => txt, json: async () => JSON.parse(txt) };
    }
    if (/:8090\b/.test(u)) throw new Error('sandbox: real dashboard blocked');
    return realFetch(url, opt);
  };
  const T = { si: global.setInterval, st: global.setTimeout };
  global.setInterval = () => 0; global.setTimeout = () => 0;
  cp.fork = () => ({ on() { }, kill() { } });
  // execFile: record the call (the password must NOT be on the command line), answer like new_account.ps1 would (creates the config)
  cp.execFile = (cmd, args, opt, cb) => {
    const f = typeof opt === 'function' ? opt : cb, o = typeof opt === 'object' ? opt : {};
    const a = Array.isArray(args) ? args : [];
    if (a.some(x => /new_account\.ps1$/.test(String(x)))) {
      const login = a[a.indexOf('-Login') + 1] || 'x';
      process.stdout.write('EXEC ' + JSON.stringify({ args: a, envPw: o.env && o.env.L2S_NEWACCOUNT_PW ? 'set' : '' }) + '\n');
      try { fs.writeFileSync(path.join(SB, 'Settings', login[0].toUpperCase() + login.slice(1) + '.xml'), '<Option/>'); } catch (e) { }
    }
    if (f) process.nextTick(() => f(null, '', ''));
    return { on() { } };
  };
  cp.exec = () => ({ on() { } });
  const realWrite = fs.writeFileSync, realAppend = fs.appendFileSync;
  const inSb = (f) => path.resolve(String(f)).toLowerCase().startsWith(path.resolve(SB).toLowerCase());
  fs.writeFileSync = (f, d, o) => (inSb(f) ? realWrite(f, d, o) : undefined);
  fs.appendFileSync = (f, d, o) => (inSb(f) ? realAppend(f, d, o) : undefined);
  const realCreate = http.createServer;
  http.createServer = (h) => { const s = realCreate(h); const L = s.listen.bind(s); s.listen = (p, host, cb) => L(0, '127.0.0.1', () => { process.stdout.write('PORT ' + s.address().port + '\n'); }); return s; };
  console.log = () => { };
  require(path.join(ROOT, 'Dashboard', 'server.js'));
  global.setInterval = T.si; global.setTimeout = T.st;
  return;
}

// ===================================================================== fixtures ====================================================
const OUT = path.join(ROOT, 'docs', 'plan', 'mobile_check');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(f => fs.existsSync(f));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`); };
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'guidebugs-sb-'));
['Logs', 'Settings', path.join('Settings', 'backup'), path.join('Scripts', 'data', 'gk_live'), path.join('docs', 'plan', 'tools')].forEach(d => fs.mkdirSync(path.join(SB, d), { recursive: true }));
fs.writeFileSync(path.join(SB, 'docs', 'plan', 'README.md'), '# sandbox\n');
fs.readdirSync(__dirname).filter(f => /\.(js|ps1)$/.test(f)).forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(SB, 'docs', 'plan', 'tools', f)));
['gear_items.json', 'shopscan_giran.json', 'dungeon_rooms.json'].forEach(f => { try { fs.copyFileSync(path.join(ROOT, 'Scripts', 'data', f), path.join(SB, 'Scripts', 'data', f)); } catch (e) { } });
fs.writeFileSync(path.join(SB, 'Logs', 'pause_supervisor'), 'sandbox');
const PARTIES = {
  Tankard: [['Tankard', 'sk', 'Shillien Knight', 33, 31], ['Healix', 'bishop', 'Bishop', 16, 30], ['Novara', 'nuker', 'Sorcerer', 12, 29], ['Slyx', 'dagger', 'Treasure Hunter', 8, 30]],
  Fundor: [['Fundor', 'sk', 'Shillien Knight', 33, 52], ['Mira', 'bishop', 'Bishop', 16, 51], ['Pell', 'nuker', 'Sorcerer', 12, 51]],
};
const ACC = []; Object.keys(PARTIES).forEach(p => PARTIES[p].forEach(([c, role]) => ACC.push({ login: 'sb' + ACC.length, character: c, party: p, role, config: c + '.xml' })));
fs.writeFileSync(path.join(SB, 'accounts.json'), JSON.stringify(ACC));
const iso = (ms) => new Date(ms).toISOString();
const CLAN = { id: 777, name: 'DemoClan', level: 1, ally: '', leader: 'Fundor', rep: 0, members: Object.values(PARTIES).flat().map(r => ({ name: r[0], level: r[4], classId: r[3], online: true })) };
function states(now) {
  const out = [];
  Object.keys(PARTIES).forEach((p, pi) => PARTIES[p].forEach(([name, role, cls, classId, level], i) => out.push({
    name, role, cls, classId, level, exp: 40, hp: 100, mp: 90, cp: 100, dead: false, x: 83400 + i * 40 + pi * 3000, y: 148000 + i * 30, z: -3400, bot: true, combat: false,
    mode: 'idle', task: 'farming (bot)', leader: name === p, adena: 2000000, soe: 5, res: 3, buffs: 20, buffLeft: 30000, notes: [], updated: iso(now), clan: '',
    clanInfo: Object.assign({}, CLAN, { isLeader: name === 'Fundor', seenAt: iso(now) }),
    spotWatch: name === 'Tankard' ? { spot: 'Alpha Field', key: 'zone:Alpha Field', arrived: true, n: 2, names: ['Xeno', 'Yuri'], detail: ['Xeno 12s fighting', 'Yuri 9s'], area: 'circle 3000',
      fighting: ['Xeno'], skipped: '1 private store(s)', decision: '', rule: '2+ players 20 s | 1 with a summon 20 s | 1 alone in a small area 120 s', at: iso(now - 3000) }
      : name === 'Fundor' ? { spot: 'Delta', arrived: true, n: 3, names: ['A', 'B', 'C'], detail: [], decision: 'occupied: A, B, C', at: iso(now - 2000) } : null,
    doing: { activity: null, target: null, follow: name === p ? null : p },
  })));
  return out;
}
function writeFixtures() { const now = Date.now(); states(now).forEach(s => fs.writeFileSync(path.join(SB, 'Logs', `swarm_state_${s.name}.json`), JSON.stringify(s))); }
const ZONES = [
  { name: 'Alpha Field', levelMin: 20, levelMax: 30, teams: ['Tankard'], prio: { Tankard: 5 }, enabled: true, x: 1000, y: 1000, z: 0, radius: 2500 },
  { name: 'Beta Cave', levelMin: 25, levelMax: 35, teams: ['all'], prio: {}, enabled: true, x: 2000, y: 2000, z: 0, radius: 2500 },
  { name: 'Delta Woods', levelMin: 45, levelMax: 55, teams: ['Fundor'], prio: { Fundor: 3 }, enabled: true, x: 3000, y: 3000, z: 0, radius: 2500 },
  { name: 'Gamma Drawn', levelMin: 28, levelMax: 32, team: 'Tankard', enabled: true, x: -87000, y: 87000, z: -3400, radius: 2000, gkDesc: 'Gludin -> Windy Hill',
    poly: [{ x: -88000, y: 86000 }, { x: -86000, y: 86000 }, { x: -86000, y: 88000 }, { x: -88000, y: 88000 }], holes: [[{ x: -87200, y: 86800 }, { x: -86900, y: 86800 }, { x: -86900, y: 87100 }]],
    pulls: [{ name: 'pull 1', points: [{ x: -87500, y: 87500 }, { x: -87000, y: 87900 }] }] },
];
fs.writeFileSync(path.join(SB, 'Scripts', 'data', 'custom_zones.json'), JSON.stringify(ZONES));
fs.writeFileSync(path.join(SB, 'Scripts', 'data', 'gk_live', 'Clarissa.json'), JSON.stringify({ name: 'Clarissa', title: 'Gatekeeper', x: 83396, y: 147904, z: -3408, town: 'Giran', updated: iso(Date.now()), by: 'Tankard',
  pages: { 'Town of Oren|Heine': ['Town of Oren - 9400 &#57;', 'Heine - 7600 &#57;', 'Dragon Valley - 6500 &#57;', 'Quest'] } }));
fs.writeFileSync(path.join(SB, 'Scripts', 'data', 'gk_live', '_index.json'), JSON.stringify(['Clarissa']));
fs.writeFileSync(path.join(SB, 'Logs', 'clan_state.json'), JSON.stringify({ leader: 'Fundor', at: iso(Date.now()), clan: { name: '', level: 0, id: 777, ally: '' }, level: 52, sp: 100, adena: 1000, clanInfo: CLAN }));
fs.writeFileSync(path.join(SB, 'Logs', 'daily_Tankard.json'), JSON.stringify({ day: new Date().toLocaleDateString('sv-SE'), done: {}, tries: {} }));
fs.writeFileSync(path.join(SB, 'Logs', 'memwatch.log'), '2026-10-09 12:00:00 ok   L2Swarm private=3000MB\n');

// ===================================================================== tests ======================================================
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  writeFixtures(); const fx = setInterval(writeFixtures, 1500);
  const srv = cp.spawn(process.execPath, [__filename, '--server', SB], { stdio: ['ignore', 'pipe', 'pipe'] });
  let PORT = 0; const mcp = [], execs = [], serr = [];
  srv.stdout.on('data', d => String(d).split('\n').forEach(l => { const m = l.match(/^PORT (\d+)/); if (m) PORT = +m[1]; else if (l.startsWith('MCP ')) mcp.push(l); else if (l.startsWith('EXEC ')) execs.push(JSON.parse(l.slice(5))); }));
  srv.stderr.on('data', d => serr.push(String(d)));
  for (let i = 0; i < 150 && !PORT; i++) await sleep(100);
  if (!PORT) { console.log(serr.join('')); throw new Error('sandbox server did not start'); }
  const U = (p) => `http://127.0.0.1:${PORT}${p}`;
  console.log('sandbox', SB, 'port', PORT);

  // ---- server-side checks (sandbox server only) ----
  console.log('--- server');
  const st = await (await fetch(U('/api/state'))).json();
  ok('#7/#16 /api/state carries mainLeader + clanLeader from the config', st.mainLeader === 'Tankard' && st.clanLeader === 'Fundor', `${st.mainLeader} / ${st.clanLeader}`);
  const pw = 'S3cret-pw-xyz';
  const na = await (await fetch(U('/api/newaccount'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'demo77', password: pw, name: 'Demochar', preset: 'best' }) })).json();
  ok('#3 Academy Create no longer throws (P declared before use)', na.ok === true && !na.error, JSON.stringify(na).slice(0, 160));
  const ex = execs.find(e => e.args.some(a => /new_account\.ps1$/.test(a)));
  ok('#3 new_account.ps1 gets the password via the environment, never on the command line', !!ex && !ex.args.includes(pw) && !ex.args.includes('-Password') && ex.args.includes('-PasswordEnv') && ex.envPw === 'set', ex ? ex.args.join(' ') : 'no exec');
  const mk = fs.readFileSync(path.join(SB, 'Scripts', 'mkchar_demo77.js'), 'utf8');
  ok('#3 the creation script has the preset values and no password', /CharacterCreate\('Demochar', 2, 1, 38, 23, 23, 24, 44, 19, 37/.test(mk) && !mk.includes(pw));
  const leak = fs.readdirSync(path.join(SB, 'Logs')).concat(fs.readdirSync(path.join(SB, 'Scripts', 'data'))).filter(f => /\.(log|json|txt)$/.test(f))
    .some(f => { try { return fs.readFileSync(path.join(SB, fs.existsSync(path.join(SB, 'Logs', f)) ? 'Logs' : path.join('Scripts', 'data'), f), 'utf8').includes(pw); } catch (e) { return false; } });
  ok('#3 the password is in no log / data file', !leak);
  const clan = await (await fetch(U('/api/clan'))).json();
  ok('#4 clan roster filled although clan_state.clan.name is blank', (clan.roster || []).length === 7, `${(clan.roster || []).length} members`);
  const sys = await (await fetch(U('/api/system'))).json();
  ok('#11 PC limits are read from the scripts (15 min gap, no deploy restart, commit rule)', sys.limits && sys.limits.source === 'scripts' && sys.limits.deployGapMin === 15 && sys.limits.deployRestarts === false && sys.limits.minCommitMB === 3000 && sys.limits.warnMB === 4500, JSON.stringify(sys.limits));
  const gc = await (await fetch(U('/api/gearcatalog?role=dagger&grade=C&all=1'))).json();
  ok('#12 gear roles include nuker + dagger', (gc.roles || []).some(r => r.key === 'nuker') && (gc.roles || []).some(r => r.key === 'dagger'), (gc.roles || []).map(r => r.key).join(','));
  ok('#12 dagger catalog lists daggers only as weapons', !gc.error && (gc.slots.weapon || []).length > 0 && gc.slots.weapon.every(w => w.type === 'DAGGER'), gc.error || `${(gc.slots.weapon || []).length} weapons`);
  const gn = await (await fetch(U('/api/gearcatalog?role=nuker&grade=C&all=1'))).json();
  ok('#12 nuker catalog: magic weapons, real caster set', !gn.error && (gn.slots.weapon || []).length > 0 && /Demon/.test(gn.set || ''), gn.error || gn.set);
  const cmds = await (await fetch(U('/api/commands'))).json();
  ok('#16 /api/commands carries mainLeader / clanLeader / mainConfig', cmds.mainLeader === 'Tankard' && cmds.clanLeader === 'Fundor' && cmds.mainConfig === 'Tankard.xml', `${cmds.mainLeader} ${cmds.clanLeader} ${cmds.mainConfig}`);
  const dry = await (await fetch(U('/api/command'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'restock', targets: ['party:Tankard'], dryRun: true }) })).json();
  ok('#10 server dry run of free text "restock" -> !supply', !dry.error && dry.command === '!supply', JSON.stringify(dry).slice(0, 140));

  // ---- static code checks ----
  const src = (f) => fs.readFileSync(path.join(ROOT, 'Dashboard', f), 'utf8');
  const html = src('index.html');
  ok('#16 no real names in the shipped page code', !/Enchantress|'Tank1'|'Dagger1'|Tank1\.xml/.test(html) && !/'Tank1'|'Dagger1'/.test(src('cmdcenter.js')) && !/Tank1\.xml/.test(src('commands.js')));
  ok('#15 override panel names = client data (GD.items) first', /iName\(x\.id, x\.name\)/.test(src('override.js')) && !/\[1061, 'Healing Potion'\]/.test(src('override.js')));
  const sw = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
  ok('#14 swarm.js override attack falls back to the current target outside raids', /case 'attack': \{[\s\S]{0,700}Target \? num\(Target\.objId\)[\s\S]{0,300}mobById\(cid\)/.test(sw));

  // ---- browser ----
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-edge-'));
  const DBG = 9300 + Math.floor(Math.random() * 500);
  const br = cp.spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { const l = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch (e) { } }
  if (!ws) throw new Error('no browser');
  const sock = new WebSocket(ws); await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
  let id = 0; const pend = {}, handlers = [], jsErr = [], posts = [], dryBodies = [];
  sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else handlers.forEach(h => h(m)); };
  const cdp = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); sock.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) { } await sleep(150); } return false; };
  const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); console.log('  shot', name); };
  handlers.push((m) => {
    if (m.method === 'Page.javascriptDialogOpening') cdp('Page.handleJavaScriptDialog', { accept: true }).catch(() => { });
    if (m.method === 'Runtime.exceptionThrown') jsErr.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
    if (m.method !== 'Fetch.requestPaused') return;
    const rq = m.params.request, rid = m.params.requestId;
    if (rq.method === 'POST') {
      let b = {}; try { b = JSON.parse(rq.postData || '{}'); } catch (e) { }
      if (/\/api\/command$/.test(rq.url) && b.dryRun === true) { dryBodies.push(b); return cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { }); }   // dry run: sandbox only, sends nothing
      posts.push({ url: rq.url, body: b });
      return cdp('Fetch.fulfillRequest', { requestId: rid, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"ok":true,"intercepted":true}').toString('base64') }).catch(() => { });
    }
    cdp('Fetch.continueRequest', { requestId: rid }).catch(() => { });
  });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: true });   // UIDIALOG 2026-10-10: the shared dialog answers itself
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });

  // #13 character page opened by direct link, before /api/state answered: taskOptions must not throw
  await cdp('Page.navigate', { url: U('/#/parties') });
  await waitFor(`typeof taskOptions === 'function'`, 20000);
  ok('#13 taskOptions() with STATE = null does not throw', await ev(`(() => { const s = STATE; STATE = null; try { return taskOptions() === ''; } catch (e) { return 'threw ' + e.message; } finally { STATE = s; } })()`) === true);

  for (const dev of [{ tag: 'phone', w: 390, h: 844, s: 2, mobile: true }, { tag: 'desktop', w: 1440, h: 900, s: 1, mobile: false }]) {
    console.log(`--- ${dev.tag} ${dev.w}x${dev.h}`);
    await cdp('Emulation.setDeviceMetricsOverride', { width: dev.w, height: dev.h, deviceScaleFactor: dev.s, mobile: dev.mobile });
    await cdp('Emulation.setTouchEmulationEnabled', dev.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await cdp('Page.navigate', { url: U('/#/parties') });
    await waitFor(`STATE && STATE.chars && STATE.chars.length >= 7 && document.querySelectorAll('[data-quick*="!collect"]').length >= 2`, 30000);
    await sleep(800);
    // #8 party button row reachable on a phone
    const row = await ev(`(() => { const W = document.documentElement.clientWidth; const out = []; document.querySelectorAll('#tab-parties .whead .act').forEach(a => a.querySelectorAll('button, select, input').forEach(b => { const r = b.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) out.push((b.textContent || b.id || b.tagName).trim().slice(0, 12) + '@' + Math.round(r.right)); }));
      const pick = document.querySelector('#tab-parties .spotline'); let spotOver = []; if (pick) pick.querySelectorAll('*').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > W + 1) spotOver.push(e.className || e.tagName); });
      return { W, out, hs: document.documentElement.scrollWidth > window.innerWidth + 1, spotOver: spotOver.slice(0, 5) }; })()`);
    ok(`#8 every party button / the task menu / Do inside the screen (${dev.tag})`, row.out.length === 0, row.out.join(', '));
    ok(`#8 hunting-spot line inside the screen (${dev.tag})`, row.spotOver.length === 0, row.spotOver.join(', '));
    ok(`#8 no horizontal page scroll (${dev.tag})`, !row.hs);
    // #9 spotWatch chip
    const swc = await ev(`[...document.querySelectorAll('.spotwatch')].map(x => x.textContent.trim() + ' | ' + (x.className))`);
    ok('#9 spot watch shown in plain words (watching + taken)', swc.some(t => /2 other players here: Xeno, Yuri \(1 fighting\) — watching/.test(t) && /warn/.test(t)) && swc.some(t => /taken by other players: A, B, C — moving on/.test(t) && /bad/.test(t)), swc.join(' || '));
    ok('#9 the spot watch tooltip explains the rule', await ev(`/every 4 s the leader looks for players who are not ours[\\s\\S]*2\\+ players 20 s[\\s\\S]*Ignored: 1 private store/.test(([...document.querySelectorAll('.spotwatch')].find(x => /Xeno/.test(x.textContent)) || {}).title || '')`));
    if (dev.mobile) { await ev(`document.querySelector('#tab-parties .whead .act').scrollIntoView({ block: 'start' })`); await sleep(300); await shot('guidebugs_phone_party_buttons.png'); }
    // #8 spot picker rows wrap on the phone
    if (dev.mobile) {
      await ev(`document.querySelector('[data-spotpick]').click()`);
      if (await waitFor(`document.getElementById('spotov') && document.getElementById('spotov').innerText.length > 50`, 8000)) {
        await sleep(600);
        const sp = await ev(`(() => { const W = document.documentElement.clientWidth, o = []; document.querySelectorAll('#spotov *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > W + 1 && !e.closest('.dmap, .leaflet-container')) o.push((e.className || e.tagName) + '@' + Math.round(r.right)); }); return o.slice(0, 6); })()`);
        ok('#8 spot picker: nothing wider than the screen (outside the dungeon map scroll box)', sp.length === 0, sp.join(', '));
        await shot('guidebugs_phone_spot_picker.png');
        await ev(`closeSpotPicker()`);
      } else ok('#8 spot picker opened', false);
    }
  }
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // #1 Spots: filter, then the ticks/priorities must belong to the shown spot
  await cdp('Page.navigate', { url: U('/#/spots') });
  await waitFor(`SPOTS && document.querySelectorAll('#spBody [data-spmay]').length >= 8`, 20000);
  const cellState = `[...document.querySelectorAll('#spBody tbody tr')].map(tr => { const n = (tr.querySelector('td b') || {}).textContent; return n + ':' + [...tr.querySelectorAll('[data-spmay]')].map(i => i.dataset.spmay.split('|')[1] + '=' + (i.checked ? 1 : 0)).join(',') + ':' + [...tr.querySelectorAll('[data-spprio]')].map(i => i.dataset.spprio.split('|')[1] + '=' + i.value).join(','); })`;
  const before = await ev(cellState);
  await ev(`(() => { const f = document.getElementById('spFilter'); f.value = 'delta'; f.dispatchEvent(new Event('input')); })()`); await sleep(300);
  const after = await ev(cellState);
  ok('#1 after the filter the shown row has ITS ticks + priority (Delta: Fundor only, prio 3)', after.length === 1 && /^Delta Woods:/.test(after[0]) && /Tankard=0/.test(after[0]) && /Fundor=1/.test(after[0]) && /:Fundor=3$/.test(after[0]), `before ${before[0]} | after ${after.join(' ; ')}`);
  await ev(`(() => { const f = document.getElementById('spFilter'); f.value = 'beta'; f.dispatchEvent(new Event('input')); })()`); await sleep(300);
  const after2 = await ev(cellState);
  ok('#1 second filter: Beta (all parties ticked, no priorities)', after2.length === 1 && /^Beta Cave:(Fundor=1,Tankard=1|Tankard=1,Fundor=1):(Fundor=,Tankard=|Tankard=,Fundor=)$/.test(after2[0]), after2.join(' ; '));
  await ev(`(() => { const f = document.getElementById('spFilter'); f.value = ''; f.dispatchEvent(new Event('input')); })()`); await sleep(300);
  ok('#1 filter cleared: back to the true state of every row', JSON.stringify(await ev(cellState)) === JSON.stringify(before));

  // #2 Zones: Edit on a drawn zone opens the shape editor; the circle form keeps the shapes
  await cdp('Page.navigate', { url: U('/#/zones') });
  await waitFor(`document.querySelectorAll('#zBody [data-zedit]').length >= 4`, 20000);
  await ev(`document.querySelector('#zBody [data-zedit="Gamma Drawn"]').click()`); await sleep(400);
  const z2 = await ev(`({ open: ZE.z && ZE.z.name, poly: ZE.z && ZE.z.poly.length, holes: ZE.z && ZE.z.holes.length, pulls: ZE.z && ZE.z.pulls.length, sel: document.getElementById('zeZone').value, formName: document.getElementById('zName').value, msg: document.getElementById('msg').textContent })`);
  ok('#2 Edit on a drawn zone opens it in the zone editor (area, exclusion, pull route), not the circle form', z2.open === 'Gamma Drawn' && z2.poly === 4 && z2.holes === 1 && z2.pulls === 1 && z2.sel === 'Gamma Drawn' && z2.formName === '', JSON.stringify(z2));
  await ev(`document.querySelector('#zBody [data-zedit="Alpha Field"]').click()`); await sleep(200);
  ok('#2 Edit on a plain circle zone still fills the circle form', await ev(`document.getElementById('zName').value === 'Alpha Field'`));
  posts.length = 0;
  await ev(`(() => { const set = (i, v) => { document.getElementById(i).value = v; }; set('zName', 'Gamma Drawn'); set('zX', -87000); set('zY', 87000); set('zMin', 29); document.getElementById('zoneForm').requestSubmit(); })()`); await sleep(600);
  const zp = posts.find(p => /\/api\/zones$/.test(p.url));
  ok('#2 saving a drawn zone through the circle form sends its area, exclusions, pull routes and travel along', !!zp && zp.body.poly && zp.body.poly.length === 4 && zp.body.holes.length === 1 && zp.body.pulls.length === 1 && zp.body.travel && zp.body.travel.desc === 'Gludin -> Windy Hill', zp ? JSON.stringify(Object.keys(zp.body)) : 'no POST');

  // #6 Teleports: price chips
  await cdp('Page.navigate', { url: U('/#/tp') });
  await waitFor(`document.querySelectorAll('#tpList .chip').length >= 3`, 20000);
  const chips = await ev(`[...document.querySelectorAll('#tpList .chip')].map(c => c.textContent)`);
  ok('#6 teleport prices read "9400 adena", no literal &#57;', chips.includes('Town of Oren - 9400 adena') && !chips.some(t => /&#|&amp;/.test(t)), chips.join(' | '));

  // #4 Clan roster in the page
  await cdp('Page.navigate', { url: U('/#/clan') });
  const hasRoster = await waitFor(`[...document.querySelectorAll('#tab-clan h2')].some(h => /Clan roster/.test(h.textContent)) && /7 \\/|7 members/.test(document.getElementById('tab-clan').innerText)`, 20000);
  ok('#4 clan roster shows the 7 members', hasRoster, await ev(`(([...document.querySelectorAll('#tab-clan .whead')].find(h => /Clan roster/.test(h.textContent)) || {}).innerText || '').replace(/\\s+/g, ' ')`).catch(e => e.message));

  // #7 daily boxes: "Party <leader>" for every party
  const dh = await ev(`(async () => { const d = await api('/api/daily'); const box = document.createElement('div'); box.innerHTML = dailyHtml(d); return [...box.querySelectorAll('h3')].map(h => h.textContent.trim()); })()`);
  ok('#7 daily boxes are labelled with the leader names', dh.includes('Party Tankard') && dh.includes('Party Fundor') && !dh.some(t => /party [12]\b/.test(t)), dh.join(' | '));

  // #11 PC tab text
  await cdp('Page.navigate', { url: U('/#/pc') });
  await waitFor(`/at most once per 15 min/.test((document.getElementById('pcRules') || {}).textContent || '') && /PC RAM free/.test(document.getElementById('pcStatus').textContent)`, 20000);
  const pcT = await ev(`document.getElementById('tab-pc').innerText`);
  ok('#11 PC tab: 15 min gap, a deploy never restarts, MemWatch only on low memory; no 3 GB / 4.5 GB auto-restart / 20 min', /at most once per 15 min/.test(pcT) && /a deploy never restarts L2Swarm/.test(pcT) && /free commit memory below 3 GB/.test(pcT) && !/20 min|refused above 3 GB|auto-restart at/.test(pcT), pcT.replace(/\s+/g, ' ').slice(0, 300));

  // #5 Room editor: "added …" stays visible
  await cdp('Page.navigate', { url: U('/#/rooms') });
  if (await waitFor(`ROOMED.list && ROOMED.list.length && document.getElementById('rmHere')`, 20000)) {
    await waitFor(`ROOMED.d && document.getElementById('rmHere')`, 8000);
    await ev(`(() => { const s = document.getElementById('rmChar'); if (s && !s.value && s.options.length) s.value = s.options[0].value; document.getElementById('rmHere').click(); })()`); await sleep(400);
    const rmT = await ev(`ROOMED.msg + ' || ' + document.getElementById('tab-rooms').innerText.slice(0, 4000)`);
    ok('#5 room editor keeps its "added …" message', /^added \S+'s position/.test(rmT), rmT.slice(0, 120));
  } else ok('#5 room editor loaded', false, 'no dungeon_rooms.json in the sandbox?');

  // #10 command center: free text dry run goes as text and shows no false error
  await cdp('Page.navigate', { url: U('/#/parties') });
  await waitFor(`window.CmdCenter && STATE && STATE.chars.length >= 7`, 20000); await sleep(500);
  await ev(`CmdCenter.open('restock please')`); await sleep(500);
  await ev(`(() => { const b = [...document.querySelectorAll('.ccrow')].find(x => /Tell them/.test(x.textContent)); if (b) b.click(); return !!b; })()`); await sleep(400);
  await ev(`(() => { const b = document.querySelector('[data-tg="party:Tankard"]'); if (b && !b.classList.contains('on')) b.click(); })()`);
  await waitFor(`CmdCenter.state.plan`, 8000);
  const ccp = await ev(`({ plan: CmdCenter.state.plan, prev: (document.querySelector('.ccprev.bad') || {}).textContent || '' })`);
  ok('#10 the free-text dry run is sent as text', dryBodies.some(b => b.text === 'restock please' && !b.cmd), JSON.stringify(dryBodies.slice(-2)));
  ok('#10 no false "a command starts with !" error; the preview shows !supply', !/starts with/.test(ccp.prev) && ccp.plan && !ccp.plan.error && ccp.plan.command === '!supply', JSON.stringify(ccp).slice(0, 200));
  await ev(`CmdCenter.close()`);

  // #15 one name for 1061 everywhere (client data)
  ok('#15 item 1061 is "Greater Healing Potion" in the client data the lists use', await ev(`(GD.items[1061] || [])[0]`) === 'Greater Healing Potion');

  ok('no JavaScript errors', jsErr.length === 0, jsErr.slice(0, 3).join(' | '));
  ok('MCP calls: only reads + the academy open_account in the server check', mcp.every(l => /^MCP (get_account_data|get_accounts_status|get_account_status|open_account) /.test(l)), mcp.filter(l => !/get_account|open_account/.test(l)).slice(0, 3).join(' | '));
  clearInterval(fx);
  try { sock.close(); } catch (e) { }
  br.kill(); srv.kill();
  await sleep(600);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { }
  try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  console.log(fails ? `${fails} FAILED` : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
