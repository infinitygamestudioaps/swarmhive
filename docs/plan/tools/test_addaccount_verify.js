// ADDACCT-2026-10-27 test (tester Vykaax: new FindStuff / FindHelper accounts "refuse to enter Hive"): Dashboard/addaccount_verify.js + the
// "+ Add account" changes in Dashboard/addaccount_api.js. Sandbox only (temp folder, fake MCP, fake new_account runner); part D starts a REAL
// brain pool (Dashboard/brain_host/pool.js) on a random local port with a tiny script — no L2Swarm, no game, no live files.
//   node docs/plan/tools/test_addaccount_verify.js
// A  diagnose(): every reason (name case, allow list, XML engine / order, open in L2Swarm, pool down, quarantine, not logged in, other file,
//    wrong character, agent never said hello) + joined / engine off
// B  applyFixes(): rename (swarm.config.json character + party keys, layout kept, backup), allow add (backup), XML agent2 (backup in
//    Settings/backup/addaccount), never an XML edit while L2Swarm has the account open or does not answer
// C  add(): "allowAll": false -> the new account still gets agent2.js + its name in "allow"; the fresh XML gets the 3.10.7 element order;
//    the account is watched; tick() reports joined once the pool stats say connected
// D  reproduction on the real pool: allow "Findstuff", the agent says hello as "FindStuff" -> refused (the bug); the check reads brain_host.log,
//    renames to the game's spelling, the pool re-reads brain_host.json and the next hello is accepted
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const AV = require(path.join(ROOT, 'Dashboard', 'addaccount_verify.js'));
const API = require(path.join(ROOT, 'Dashboard', 'addaccount_api.js'));

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL: ' + m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const codes = (d) => d.items.map(i => i.code);

function sandbox() {
  const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'addacctv_'));
  ['Settings/templates', 'Settings/backup', 'Scripts/data', 'Logs'].forEach(d => fs.mkdirSync(path.join(SB, d), { recursive: true }));
  return SB;
}
const XML = (login, sel, scripts, extra) => `<?xml version="1.0" encoding="utf-8"?>\r\n<Option>\r\n  <Name>${login}</Name>\r\n  <SelectedCharacter>${sel}</SelectedCharacter>\r\n  <ScriptsList>` +
  scripts.map(s => { const n = Array.isArray(s) ? s[0] : s, on = !(Array.isArray(s) && s[1] === false); return `<Script><IsEnabled>${on}</IsEnabled><guid>g</guid><Name>${n}</Name><Path>C:\\X\\Scripts\\${n}</Path></Script>`; }).join('') + `</ScriptsList>\r\n${extra || ''}</Option>\r\n`;
const STATS = (now, names, extra) => Object.assign({ at: new Date(now).toISOString(), fresh: true, allow: names.slice(), quarantined: [], workers: [{ party: 'P', contexts: names.map(n => ({ name: n, booted: true, connected: true })) }] }, extra || {});

// ================================================================================================================ A diagnose
function partA() {
  console.log('A) diagnose');
  const now = Date.parse('2026-10-27T18:00:00Z');
  const accounts = [{ login: 'vyk1', character: 'Findstuff', party: 'Findstuff', config: 'Vyk1.xml' }, { login: 'vyk2', character: 'Findhelper', party: 'Findstuff', config: 'Vyk2.xml' }, { login: 'old1', character: 'Oldie', party: 'Oldie', config: 'Old1.xml' }];
  const base = (o) => Object.assign({ now, accounts, bhRaw: { on: true, allowAll: true, allow: [], except: [] }, stats: STATS(now, ['Oldie']), online: [], refused: [], settings: 'C:\\S' }, o || {});
  const e1 = { login: 'vyk1', character: 'Findstuff', file: 'C:\\S\\Vyk1.xml', addedAt: now - 60000, xml: XML('vyk1', 'Findstuff', ['agent2.js']) };
  // name case seen in L2Swarm's account list
  let d = AV.diagnose(e1, base({ online: [{ login: 'vyk1', is_logged_in: true, character: { name: 'FindStuff' }, config_path: 'C:\\S\\Vyk1.xml' }] }));
  const nc = d.items.find(i => i.code === 'name_case');
  ok(d.state === 'problem' && nc && nc.fix.kind === 'rename' && nc.fix.from === 'Findstuff' && nc.fix.to === 'FindStuff', `name case from L2Swarm: game FindStuff, config Findstuff -> rename fix (${codes(d)})`);
  ok(d.items.some(i => i.code === 'xml_selected_case' && i.fix.open === true), 'the XML SelectedCharacter follows too, but not while L2Swarm has the account open');
  // name case only seen in the brain log (L2Swarm not answering)
  d = AV.diagnose({ login: 'vyk2', character: 'Findhelper', file: 'C:\\S\\Vyk2.xml', addedAt: now, xml: XML('vyk2', 'Findhelper', ['agent2.js']) }, base({ online: null, refused: AV.refusedHellos('2026-10-27T17:59:00.000Z [pool] hello from FindHelper refused (not in allow list)\n2026-10-27T17:59:01.000Z [pool] hello from ? refused (not in allow list)\n') }));
  ok(d.items.some(i => i.code === 'name_case' && i.fix.to === 'FindHelper') && d.items.some(i => i.code === 'l2_down'), `name case from brain_host.log refused hello (${codes(d)})`);
  ok(AV.refusedHellos('2026-10-27T17:59:01.000Z [pool] hello from ? refused (not in allow list)').length === 1, 'refusedHellos parses the log line (also the nameless hello)');
  // allow list
  d = AV.diagnose(e1, base({ bhRaw: { on: true, allow: ['Oldie'] } }));
  ok(d.items.some(i => i.code === 'not_allowed' && i.fix.kind === 'allow' && i.fix.name === 'Findstuff'), `"allowAll": false and not in "allow" -> allow fix (${codes(d)})`);
  d = AV.diagnose(e1, base({ bhRaw: { on: true, allowAll: true, except: ['Findstuff'] } }));
  ok(d.items.some(i => i.code === 'except' && i.manual && !i.fix), 'in "except" -> said, never undone automatically');
  // XML engine / order
  d = AV.diagnose(Object.assign({}, e1, { xml: XML('vyk1', 'Findstuff', ['swarm.js']) }), base());
  ok(d.items.some(i => i.code === 'xml_engine' && i.fix.open === false && i.fix.l2Known === true), 'XML lists swarm.js -> xml_engine fix (account not open)');
  d = AV.diagnose(Object.assign({}, e1, { xml: XML('vyk1', 'Findstuff', ['mkchar_vyk1.js']) }), base());
  ok(d.items.some(i => i.code === 'xml_engine' && /no agent2/.test(i.text)), 'XML without agent2 -> xml_engine fix');
  d = AV.diagnose(Object.assign({}, e1, { xml: XML('vyk1', 'Findstuff', [['agent2.js', false]]) }), base());
  ok(d.items.some(i => i.code === 'xml_engine'), 'agent2 switched off in the XML -> xml_engine fix');
  const bad = XML('vyk1', 'Findstuff', ['agent2.js'], '  <CombatSkillsList><CombatSkill><Skill><Id>1</Id></Skill><IsEnabled>true</IsEnabled><IsRepeat>false</IsRepeat><RepeatDelaySeconds>0</RepeatDelaySeconds></CombatSkill></CombatSkillsList>\r\n');
  d = AV.diagnose(Object.assign({}, e1, { xml: bad }), base());
  ok(d.items.some(i => i.code === 'xml_order'), 'RepeatDelaySeconds after IsRepeat (3.10.7 refuses it) -> xml_order fix');
  // the rest
  ok(AV.diagnose(e1, base({ stats: STATS(now, ['Oldie', 'Findstuff']) })).state === 'joined', 'connected in brain_host_stats -> joined');
  ok(AV.diagnose(e1, base({ bhRaw: { on: false } })).state === 'off', 'engine off -> off (it runs swarm.js in L2Swarm, said)');
  d = AV.diagnose(e1, base({ stats: null })); ok(d.items.some(i => i.code === 'pool_down' && /restart the dashboard/.test(i.manual)), 'no fresh stats -> pool_down (restart the dashboard)');
  d = AV.diagnose(e1, base({ stats: STATS(now, ['Oldie'], { quarantined: [{ name: 'Findstuff' }] }) })); ok(d.items.some(i => i.code === 'quarantined'), 'quarantined -> said');
  d = AV.diagnose(e1, base()); ok(d.items.some(i => i.code === 'not_open') && d.state === 'problem', `L2Swarm runs, account not open -> not_open with "Log in" (${codes(d)})`);
  d = AV.diagnose(e1, base({ online: [{ login: 'vyk1', is_logged_in: true, character: { name: 'Findstuff' }, config_path: 'C:\\S\\Other.xml' }] }));
  ok(d.items.some(i => i.code === 'other_file'), 'open from another XML -> other_file');
  d = AV.diagnose(e1, base({ online: [{ login: 'vyk1', is_logged_in: true, character: { name: 'Someone' }, config_path: 'C:\\S\\Vyk1.xml' }] }));
  ok(d.items.some(i => i.code === 'wrong_char'), 'logged in as another character -> wrong_char');
  const inGame = base({ stats: STATS(now, ['Oldie'], { allow: ['Oldie', 'Findstuff'] }), online: [{ login: 'vyk1', is_logged_in: true, character: { name: 'Findstuff' }, config_path: 'C:\\S\\Vyk1.xml' }] });
  d = AV.diagnose(Object.assign({}, e1, { onlineAt: now - 30000 }), inGame); ok(d.state === 'waiting' && !d.items.length, 'in game for 30 s, everything right -> still waiting (no false alarm)');
  d = AV.diagnose(Object.assign({}, e1, { addedAt: now - 10 * 60000, onlineAt: now - 6 * 60000 }), inGame); ok(d.items.some(i => i.code === 'no_hello' && /reload/.test(i.manual)), 'in game 6 min, no hello -> no_hello (reload the account config)');
  d = AV.diagnose({ login: 'nobody', character: 'X' }, base()); ok(d.items[0].code === 'cfg_missing', 'not in swarm.config.json -> cfg_missing');
}

// ================================================================================================================ B fixes
function partB() {
  console.log('B) applyFixes');
  const SB = sandbox();
  const ctx = { ROOT: SB, LOGS: path.join(SB, 'Logs'), SETTINGS: path.join(SB, 'Settings'), DATA: path.join(SB, 'Scripts', 'data'), CONFIG_FILE: path.join(SB, 'swarm.config.json') };
  const CFG = '{\r\n  "accounts": [\r\n    { "login": "vyk1", "character": "Findstuff", "party": "Findstuff", "config": "Vyk1.xml" },\r\n    { "login": "vyk2", "character": "Findhelper", "party": "Findstuff", "config": "Vyk2.xml" }\r\n  ]\r\n}\r\n';
  fs.writeFileSync(ctx.CONFIG_FILE, CFG);
  fs.writeFileSync(path.join(ctx.DATA, 'brain_host.json'), JSON.stringify({ on: true, allow: ['Oldie', 'Findstuff'], bridge: true }, null, 1));
  const f1 = path.join(ctx.SETTINGS, 'Vyk1.xml'); fs.writeFileSync(f1, XML('vyk1', 'Findstuff', ['mkchar_vyk1.js', 'swarm.js']));
  const e = { login: 'vyk1', character: 'Findstuff', file: f1 };
  const done = AV.applyFixes(ctx, e, { items: [{ code: 'name_case', fix: { kind: 'rename', from: 'Findstuff', to: 'FindStuff' } }, { code: 'xml_engine', fix: { kind: 'xml_engine', file: f1, open: false, l2Known: true } }, { code: 'xml_selected_case', fix: { kind: 'xml_selected', to: 'FindStuff', file: f1, open: false, l2Known: true } }] });
  const cfgNow = fs.readFileSync(ctx.CONFIG_FILE, 'utf8'), j = JSON.parse(cfgNow);
  ok(j.accounts[0].character === 'FindStuff' && j.accounts[0].party === 'FindStuff' && j.accounts[1].party === 'FindStuff' && j.accounts[1].character === 'Findhelper', 'rename: character + every party key follow the game spelling');
  ok(cfgNow === CFG.replace(/"Findstuff"/g, '"FindStuff"'), 'rename: the file layout (one-line entries, CRLF) is kept');
  ok(fs.readdirSync(path.join(ctx.SETTINGS, 'backup', 'swarm_config_history')).length === 1, 'rename: swarm.config.json backup first');
  const bh = JSON.parse(fs.readFileSync(path.join(ctx.DATA, 'brain_host.json'), 'utf8'));
  ok(bh.allow.includes('FindStuff') && !bh.allow.includes('Findstuff') && bh.bridge === true, 'rename: brain_host.json allow follows (own list)');
  const X = AV.xmlInfo(fs.readFileSync(f1, 'utf8'));
  ok(X.scripts.map(s => s.name).join() === 'mkchar_vyk1.js,agent2.js' && X.selected === 'FindStuff', `XML: swarm.js -> agent2.js (mkchar kept), SelectedCharacter FindStuff (${X.scripts.map(s => s.name)})`);
  ok(/<Path>[^<]*\\Scripts\\agent2\.js<\/Path>/.test(fs.readFileSync(f1, 'utf8')), 'XML: agent2.js path in this install');
  ok(fs.readdirSync(path.join(ctx.SETTINGS, 'backup', 'addaccount')).length === 2, 'XML: a backup before each change (Settings/backup/addaccount, rule 5)');
  ok(done.length === 3 && e.character === 'FindStuff', `3 fixes reported (${done.map(x => x.code)})`);
  // allow add
  AV.applyFixes(ctx, {}, { items: [{ code: 'not_allowed', fix: { kind: 'allow', name: 'Findhelper' } }] });
  ok(JSON.parse(fs.readFileSync(path.join(ctx.DATA, 'brain_host.json'), 'utf8')).allow.includes('Findhelper'), 'allow: the name is added to "allow"');
  ok(fs.readdirSync(path.join(ctx.SETTINGS, 'backup', 'brain_host_history')).length >= 2, 'allow: brain_host.json backup first');
  // never while open / L2Swarm silent
  const f2 = path.join(ctx.SETTINGS, 'Vyk2.xml'), x2 = XML('vyk2', 'Findhelper', ['swarm.js']); fs.writeFileSync(f2, x2);
  const r1 = AV.applyFixes(ctx, {}, { items: [{ code: 'xml_engine', fix: { kind: 'xml_engine', file: f2, open: true, l2Known: true } }] });
  const r2 = AV.applyFixes(ctx, {}, { items: [{ code: 'xml_engine', fix: { kind: 'xml_engine', file: f2, open: false, l2Known: false } }] });
  ok(fs.readFileSync(f2, 'utf8') === x2 && /agent guard/.test(r1[0].text) && /does not answer/.test(r2[0].text), 'XML never edited while L2Swarm has the account open or does not answer (rule 6), the reason is said');
  // xmlUseAgent edge cases
  ok(AV.xmlInfo(AV.xmlUseAgent('<Option><ScriptsList /></Option>', 'C:\\X\\Scripts').text).scripts[0].name === 'agent2.js', 'xmlUseAgent: <ScriptsList /> gets agent2.js');
  ok(AV.xmlInfo(AV.xmlUseAgent(XML('a', 'b', ['agent2.js', 'swarm.js']), 'C:\\X\\Scripts').text).scripts.map(s => s.name).join() === 'agent2.js', 'xmlUseAgent: agent2.js + swarm.js -> one agent only');
  ok(!AV.xmlUseAgent(XML('a', 'b', ['agent2_Bob.js']), 'C:\\X\\Scripts').changed, 'xmlUseAgent: an own agent2_<Name>.js is fine');
  fs.rmSync(SB, { recursive: true, force: true });
}

// ================================================================================================================ C add + watch
async function partC() {
  console.log('C) + Add account with "allowAll": false, then the watch');
  const SB = sandbox();
  fs.writeFileSync(path.join(SB, 'Settings', 'templates', 'default.xml'), '<Option><Name></Name><SelectedCharacter></SelectedCharacter><ScriptsList /></Option>');
  fs.writeFileSync(path.join(SB, 'swarm.config.json'), JSON.stringify({ scripts: ['swarm.js'], accounts: [{ login: 'old1', character: 'Oldie', party: 'Oldie', config: 'Old1.xml' }] }, null, 2));
  fs.writeFileSync(path.join(SB, 'Scripts', 'data', 'brain_host.json'), JSON.stringify({ on: true, allow: ['Oldie'] }, null, 1));
  const calls = [];
  // fake new_account.ps1 that writes what the real one writes, with an OLD-ORDER combat entry (a template from before 3.10.7)
  const run = async (o) => { calls.push(o.scripts.slice()); fs.writeFileSync(o.outFile, `<Option><Name>${o.login}</Name><SelectedCharacter>${o.character}</SelectedCharacter><ScriptsList>${o.scripts.map(s => `<Script><IsEnabled>true</IsEnabled><guid>g</guid><Name>${s}</Name><Path>C:\\X\\Scripts\\${s}</Path></Script>`).join('')}</ScriptsList><CombatSkillsList><CombatSkill><Skill><Id>1</Id></Skill><IsEnabled>true</IsEnabled><IsRepeat>false</IsRepeat><RepeatDelaySeconds>0</RepeatDelaySeconds></CombatSkill></CombatSkillsList></Option>`); return { ok: true, text: 'created' }; };
  let online = [], stats = STATS(Date.now(), ['Oldie']);
  const writeStats = () => fs.writeFileSync(path.join(SB, 'Logs', 'brain_host_stats.json'), JSON.stringify(Object.assign({}, stats, { at: new Date().toISOString() })));
  writeStats();
  const ctx = { ROOT: SB, LOGS: path.join(SB, 'Logs'), SETTINGS: path.join(SB, 'Settings'), DATA: path.join(SB, 'Scripts', 'data'), CONFIG_FILE: path.join(SB, 'swarm.config.json'),
    runNewAccount: run, mcpCall: async (t) => t === 'get_accounts_status' ? JSON.stringify(online) : '{}', loginGapMs: 0, noTimer: true };
  AV._w.list = []; AV._w.loaded = true; AV._w.ctx = ctx;
  const r = await API.add(ctx, { accounts: [{ login: 'vyk1', password: 'pw-secret-1', character: 'Findstuff', mode: 'existing', party: '', role: 'auto', autoStart: true }] });
  ok(r.created === 1 && calls[0].join() === 'agent2.js', `"allowAll": false: the new account gets agent2.js, not swarm.js (got ${calls[0]})`);
  const bh = JSON.parse(fs.readFileSync(path.join(SB, 'Scripts', 'data', 'brain_host.json'), 'utf8'));
  ok(bh.allow.includes('Findstuff') && bh.allow.includes('Oldie'), 'its name went into brain_host.json "allow"');
  const xml = fs.readFileSync(path.join(SB, 'Settings', 'Vyk1.xml'), 'utf8');
  ok(xml.indexOf('<RepeatDelaySeconds>') < xml.indexOf('<IsRepeat>'), 'the fresh XML got the L2Swarm 3.10.7 element order');
  ok(/brain host/.test(r.results[0].verify || '') && /allow list/.test(r.results[0].reason), `the result says it is checked + added to the allow list (${r.results[0].reason} / ${r.results[0].verify})`);
  ok(AV.entries(ctx).length === 1 && AV.entries(ctx)[0].state === 'waiting', 'the account is watched');
  ok(!fs.readFileSync(path.join(SB, 'Logs', 'dashboard_commands.log'), 'utf8').includes('pw-secret-1') && !fs.readFileSync(path.join(SB, 'Logs', 'addaccount_verify.json'), 'utf8').includes('pw-secret-1'), 'the password is in no log / state file');
  // round 1: L2Swarm logged it in as FindStuff (the tester's case) -> renamed
  online = [{ login: 'vyk1', is_logged_in: true, character: { name: 'FindStuff' }, config_path: path.join(SB, 'Settings', 'Vyk1.xml') }];
  writeStats();
  let L = await AV.tick(ctx);
  const cfgNow = JSON.parse(fs.readFileSync(ctx.CONFIG_FILE, 'utf8'));
  ok(cfgNow.accounts.find(a => a.login === 'vyk1').character === 'FindStuff' && L[0].fixed.some(f => f.code === 'rename'), `tick: name mismatch fixed in swarm.config.json (${JSON.stringify(L[0].fixed.map(f => f.code))})`);
  ok(JSON.parse(fs.readFileSync(path.join(SB, 'Scripts', 'data', 'brain_host.json'), 'utf8')).allow.includes('FindStuff'), 'tick: brain allow list follows the rename');
  ok(fs.readFileSync(path.join(SB, 'Settings', 'Vyk1.xml'), 'utf8').includes('<SelectedCharacter>Findstuff</SelectedCharacter>'), 'tick: XML untouched while L2Swarm has the account open');
  // round 2: the pool connected it
  stats = STATS(Date.now(), ['Oldie', 'FindStuff']); writeStats();
  L = await AV.tick(ctx);
  ok(L[0].state === 'joined' && L[0].joinedAt, 'tick: connected in brain_host_stats -> joined');
  // Check (every roster character not in the brain): Oldie connected? no -> it is checked
  stats = STATS(Date.now(), ['FindStuff']); writeStats();
  L = await AV.checkNow(ctx, null);
  const old = L.find(e => e.login === 'old1');
  ok(old && old.kind === 'check' && old.items.some(i => i.code === 'not_open'), `Check: a roster character not in the brain is checked too (${old && old.items.map(i => i.code)})`);
  ok(!L.find(e => e.login === 'vyk1' && e.kind === 'check'), 'Check: a connected one is left alone');
  // timeout -> failed with its reasons
  old.until = Date.now() - 1; L = await AV.tick(ctx);
  ok(L.find(e => e.login === 'old1').state === 'failed', 'past its window -> failed (reasons kept for the page)');
  const page = fs.readFileSync(path.join(ROOT, 'Dashboard', 'addaccount.js'), 'utf8');
  ok(/\/api\/addaccount\/verify/.test(page) && /Brain connection/.test(page) && /Check every account that is not in the Hive/.test(page), 'Accounts page: Brain connection box + Check button');
  fs.rmSync(SB, { recursive: true, force: true });
}

// ================================================================================================================ D real pool
function fakeAgent(port, name) {
  const s = net.connect(port, '127.0.0.1'); const A = { s, bye: false, closed: false };
  s.setEncoding('utf8'); let buf = '';
  s.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(l); if (m.a === 'bye') A.bye = m.why || true; if (m.a === 'ping') s.write(JSON.stringify({ t: 'pong', id: m.id }) + '\n'); } catch (e) { } } });
  s.on('close', () => { A.closed = true; }); s.on('error', () => { });
  s.on('connect', () => s.write(JSON.stringify({ t: 'hello', v: 3, name, accountId: 'acc-' + name }) + '\n'));
  return A;
}
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { } await sleep(150); } return false; }
async function partD() {
  console.log('D) reproduction on the real brain pool');
  const SB = sandbox(), overlay = path.join(SB, 'overlay'); fs.mkdirSync(path.join(overlay, 'Logs'), { recursive: true });
  const script = path.join(SB, 'tiny.js'); fs.writeFileSync(script, 'globalThis.__boot = (globalThis.__boot || 0) + 1;\n');
  const cfgF = path.join(SB, 'Scripts', 'data', 'brain_host.json'), statsF = path.join(SB, 'Logs', 'brain_host_stats.json'), logF = path.join(SB, 'Logs', 'brain_host.log');
  fs.writeFileSync(path.join(SB, 'swarm.config.json'), JSON.stringify({ accounts: [{ login: 'vyk1', character: 'Findstuff', party: 'Findstuff', config: 'Vyk1.xml' }] }, null, 2));
  fs.writeFileSync(cfgF, JSON.stringify({ on: true, allow: ['Findstuff'] }, null, 1));
  fs.writeFileSync(path.join(SB, 'Settings', 'Vyk1.xml'), XML('vyk1', 'Findstuff', ['agent2.js']));
  const { Pool } = require(path.join(ROOT, 'Dashboard', 'brain_host', 'pool.js'));
  const port = 24100 + Math.floor(Math.random() * 400);
  const P = new Pool({ port, allow: ['Findstuff'], partyOf: (n) => n, script, overlay, isolate: ['Logs'], logFile: logF, stallMs: 4000, hbMs: 100, allowEval: true,
    root: SB.replace(/\//g, '\\'), configFile: cfgF, configPollMs: 300, statsFile: statsF, statsMs: 400 });
  await P.start();
  try {
    const a1 = fakeAgent(port, 'FindStuff');
    ok(await waitFor(() => a1.bye === 'not allowed', 5000), 'BUG reproduced: allow "Findstuff", hello "FindStuff" -> bye "not allowed"');
    await waitFor(() => /hello from FindStuff refused \(not in allow list\)/.test(fs.readFileSync(logF, 'utf8')), 3000);
    ok(/hello from FindStuff refused \(not in allow list\)/.test(fs.readFileSync(logF, 'utf8')), 'brain_host.log: "hello from FindStuff refused (not in allow list)" (what the tester\'s log will show)');
    const ctx = { ROOT: SB, LOGS: path.join(SB, 'Logs'), SETTINGS: path.join(SB, 'Settings'), DATA: path.join(SB, 'Scripts', 'data'), CONFIG_FILE: path.join(SB, 'swarm.config.json'), mcpCall: async () => { throw new Error('L2Swarm down'); }, noTimer: true };
    AV._w.list = []; AV._w.loaded = true; AV._w.ctx = ctx;
    AV.watch(ctx, { login: 'vyk1', character: 'Findstuff', file: path.join(SB, 'Settings', 'Vyk1.xml'), kind: 'added' });
    await waitFor(() => { try { return Date.now() - Date.parse(JSON.parse(fs.readFileSync(statsF, 'utf8')).at) < 2000; } catch (e) { return false; } }, 4000);
    let L = await AV.tick(ctx);
    ok(L[0].items.some(i => i.code === 'name_case') && L[0].fixed.some(f => f.code === 'rename'), `check: name mismatch found in brain_host.log and fixed (${L[0].items.map(i => i.code)})`);
    ok(await waitFor(() => (P.o.allow || []).includes('FindStuff'), 3000), 'the pool re-read brain_host.json: FindStuff is in its allow list (no restart)');
    const a2 = fakeAgent(port, 'FindStuff');
    ok(await waitFor(async () => { const r = await P.eval('FindStuff', 'globalThis.__boot'); return r && r.ok && r.v >= 1; }, 8000) && !a2.bye, 'the agent\'s next hello is accepted: FindStuff has a brain context');
    await waitFor(() => { try { return (JSON.parse(fs.readFileSync(statsF, 'utf8')).workers || []).some(w => (w.contexts || []).some(c => c.name === 'FindStuff' && c.connected)); } catch (e) { return false; } }, 4000);
    L = await AV.tick(ctx);
    ok(L[0].state === 'joined', `check: joined (${L[0].state})`);
    try { a1.s.destroy(); a2.s.destroy(); } catch (e) { }
  } finally { await P.stop(); }
  try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
}

(async () => {
  const t0 = Date.now();
  try { partA(); } catch (e) { ok(false, 'A threw: ' + (e && e.stack || e)); }
  try { partB(); } catch (e) { ok(false, 'B threw: ' + (e && e.stack || e)); }
  try { await partC(); } catch (e) { ok(false, 'C threw: ' + (e && e.stack || e)); }
  try { await partD(); } catch (e) { ok(false, 'D threw: ' + (e && e.stack || e)); }
  console.log(`\n${passes} passed, ${fails} failed (${Math.round((Date.now() - t0) / 1000)} s)`);
  process.exit(fails ? 1 : 0);
})();
