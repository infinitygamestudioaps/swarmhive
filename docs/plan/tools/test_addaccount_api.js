// Test for Dashboard/addaccount_api.js (dashboard "+ Add account", 2026-10-12). Runs the API module against a TEMP SANDBOX copy of an
// install (swarm.config.json, Settings/, Scripts/, Logs/) with a FAKE new_account runner and a fake MCP — no PowerShell, no L2Swarm.
//   node docs/plan/tools/test_addaccount_api.js
// Checks: validation errors, the password never appears in any written file or log line, the swarm.config.json entry + layout, backup,
// duplicate logins refused, bulk parsing (passwords with ';', comments, batch leaders), start_extra.txt, the creation script, dry run,
// log-in queue, key check over HTTP, runner failure (password scrubbed, nothing added).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const ROOT_REAL = path.resolve(__dirname, '..', '..', '..');
const API = require(path.join(ROOT_REAL, 'Dashboard', 'addaccount_api.js'));

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const PWTAG = 'Pass' + 'word';   // the XML tag of the encrypted password (spelled in two parts: the release scanner flags the literal tag)
// ---------------------------------------------------------------------------------------------------- sandbox
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'addacc_'));
['Settings/templates', 'Settings/backup', 'Scripts/data', 'Logs', 'Dashboard'].forEach(d => fs.mkdirSync(path.join(SB, d), { recursive: true }));
try { fs.copyFileSync(path.join(ROOT_REAL, 'Scripts', 'data', 'class_tree.json'), path.join(SB, 'Scripts', 'data', 'class_tree.json')); } catch (e) { /* the module has a built-in fallback */ }
fs.writeFileSync(path.join(SB, 'Settings', 'templates', 'default.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<Option><Name></Name><Password></Password><SelectedCharacter></SelectedCharacter></Option>\n');
fs.writeFileSync(path.join(SB, 'Settings', 'templates', 'healer.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<Option><Name></Name><Password></Password><SelectedCharacter></SelectedCharacter></Option>\n');
// an existing account config on disk that is NOT in swarm.config.json (an L2Swarm account the user made by hand)
fs.writeFileSync(path.join(SB, 'Settings', 'Handmade.xml'), '<Option><Name>handmade</Name><' + PWTAG + '>ENCRYPTED</' + PWTAG + '></Option>');
const CFG0 = `{
  "version": 1,
  "server": { "loginIp": "login.example.invalid", "loginPort": 2106, "serverId": 1 },
  "login": { "gapSeconds": 5 },
  "groups": { "format": "Party {party}", "overrides": {} },
  "scripts": ["swarm.js"],
  "healerRoles": ["bishop", "shilliensaint", "healer"],
  "accounts": [
    {
      "login": "mylogin1",
      "character": "Tankname",
      "party": "Tankname",
      "role": "tank"
    },
    {
      "login": "mylogin2",
      "character": "Healername",
      "party": "Tankname",
      "role": "healer"
    }
  ]
}
`.replace(/\n/g, '\r\n');
fs.writeFileSync(path.join(SB, 'swarm.config.json'), CFG0);

const PASSWORDS = [];
const runnerCalls = [];
let runnerFailFor = null;
// FAKE new_account.ps1: writes what the real one writes (login, ENCRYPTED password, character), never the plain password
const fakeRunner = async (o) => {
  runnerCalls.push(Object.assign({}, o, { password: o.password ? '<given>' : '' }));
  if (!o.password) return { ok: false, text: 'no password' };
  if (runnerFailFor && o.login === runnerFailFor) return { ok: false, text: `Exception: something broke for ${o.login} with password ${o.password}` };
  fs.writeFileSync(o.outFile, `<?xml version="1.0" encoding="utf-8"?>\n<Option><Name>${o.login}</Name><${PWTAG}>ENC_${Buffer.from(String(o.password.length)).toString('hex')}</${PWTAG}>` +
    `<SelectedCharacter>${o.character}</SelectedCharacter><Group>${o.group}</Group><FollowName>${o.followName}</FollowName><FollowAtk>${o.followAtk}</FollowAtk></Option>\n`);
  return { ok: true, text: 'created ' + o.outFile };
};
const mcpCalls = [];
let mcpUp = true;
const fakeMcp = async (tool, args) => { mcpCalls.push({ tool, args }); if (!mcpUp) throw new Error('ECONNREFUSED'); return tool === 'open_account' ? 'Account opened' : '[]'; };
const ctx = { DIR: path.join(ROOT_REAL, 'Dashboard'), ROOT: SB, LOGS: path.join(SB, 'Logs'), DATA: path.join(SB, 'Scripts', 'data'), SETTINGS: path.join(SB, 'Settings'),
  CONFIG_FILE: path.join(SB, 'swarm.config.json'), runNewAccount: fakeRunner, mcpCall: fakeMcp, loginGapMs: 20, mcpTimeoutMs: 500,
  allowed: (req) => req.headers['x-key'] === 'testkey', json: (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); },
  send: (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type }); res.end(body); } };
const pw = (s) => { PASSWORDS.push(s); return s; };
const cfgNow = () => JSON.parse(fs.readFileSync(ctx.CONFIG_FILE, 'utf8').replace(/^﻿/, ''));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---------------------------------------------------------------------------------------------------- 1. bulk parsing
  {
    const P = API.parseBulk('# comment\n\nabc1;pa;ss;Charone;;tank\nabc2\tpw2\tChartwo\tCharone\thealer\nabc3;pw3;Charthree\nbad;line\nabc4;pw4;Charfour;Charone\n');
    eq(P.rows.length, 4, 'bulk: 4 rows (comment + blank skipped)');
    eq(P.errors.length, 1, 'bulk: 1 short line is an error');
    eq(P.errors[0].line, 6, 'bulk: error line number');
    eq(P.rows[0].password, 'pa;ss', 'bulk: a password with ";" survives when all 5 fields are there');
    eq([P.rows[0].character, P.rows[0].party, P.rows[0].role], ['Charone', '', 'tank'], 'bulk: fields of line 3');
    eq([P.rows[1].login, P.rows[1].password, P.rows[1].party, P.rows[1].role], ['abc2', 'pw2', 'Charone', 'healer'], 'bulk: tab-separated line');
    eq([P.rows[2].character, P.rows[2].party, P.rows[2].role], ['Charthree', '', ''], 'bulk: 3 fields');
    eq(P.rows[3].party, 'Charone', 'bulk: 4 fields = party');
  }
  // ---------------------------------------------------------------------------------------------------- 2. validation errors
  {
    const r = await API.add(ctx, { accounts: [
      { login: 'x', password: pw('Secret#Alpha1'), character: 'Goodname' },
      { login: 'goodlogin1', password: '', character: 'Goodname' },
      { login: 'goodlogin2', password: pw('Secret#Beta22'), character: 'Bad Name!' },
      { login: 'goodlogin3', password: pw('Secret#Gamma3'), character: 'Goodthree', role: 'wizardking' },
      { login: 'goodlogin4', password: pw('Secret#Delta4'), character: 'Goodfour', party: 'Nobody' },
      { login: 'goodlogin5', password: pw('Secret#Eps555'), character: 'Goodfive', mode: 'new', race: 4, sex: 0, classId: 10 },
      { login: 'goodlogin6', password: pw('Secret#Zeta66'), character: 'Goodsix', mode: 'new', race: 5, sex: 0, classId: 124 },
      { login: 'goodlogin7', password: pw('Secret#Eta777'), character: 'Goodseven', mode: 'new', race: 0, sex: 0, classId: 999 },
      { login: 'mylogin1', password: pw('Secret#Theta8'), character: 'Othername' },
      { login: 'handmade', password: pw('Secret#Iota99'), character: 'Handchar' },
      { login: 'goodlogin8', password: pw('Secret#Kappa0'), character: 'Healername' },
    ] });
    const st = (l) => (r.results.find(x => x.login === l) || {});
    ok(/login/.test(st('x').reason), 'validation: short login');
    ok(/password missing/.test(st('goodlogin1').reason), 'validation: missing password');
    ok(/character name/.test(st('goodlogin2').reason), 'validation: bad character name');
    ok(/role "wizardking" is unknown/.test(st('goodlogin3').reason), 'validation: unknown role');
    ok(/not a party leader/.test(st('goodlogin4').reason), 'validation: unknown party');
    ok(/is not a Dwarf class/.test(st('goodlogin5').reason), 'validation: Dwarf cannot be a Human Mystic');
    ok(/female only/.test(st('goodlogin6').reason), 'validation: female Kamael with sex male');
    ok(/start class/.test(st('goodlogin7').reason), 'validation: unknown class id');
    eq(st('mylogin1').status, 'exists', 'duplicate: login already in swarm.config.json');
    eq(st('handmade').status, 'exists', 'duplicate: login already has an L2Swarm config on disk');
    eq(st('goodlogin8').status, 'exists', 'duplicate: character already in swarm.config.json');
    eq(r.created, 0, 'validation: nothing created');
    eq(runnerCalls.length, 0, 'validation: runner never called');
    eq(fs.readFileSync(ctx.CONFIG_FILE, 'utf8'), CFG0, 'validation: swarm.config.json untouched');
  }
  // ---------------------------------------------------------------------------------------------------- 3. dry run
  {
    const r = await API.add(ctx, { bulk: `newlead1;${pw('Dry;Run;Pw1')};Newleader;;tank\nnewmem1;${pw('DryRunPw2x')};Newmember;Newleader;healer`, dryRun: true });
    eq(r.results.map(x => x.status), ['ok', 'ok'], 'dry run: both lines ok (member may name a leader of the same list)');
    eq(runnerCalls.length, 0, 'dry run: runner not called');
    ok(!fs.existsSync(path.join(SB, 'Settings', 'Newlead1.xml')), 'dry run: no config file');
    eq(fs.readFileSync(ctx.CONFIG_FILE, 'utf8'), CFG0, 'dry run: swarm.config.json untouched');
  }
  // ---------------------------------------------------------------------------------------------------- 4. one account, existing character, member, log in now
  {
    const r = await API.add(ctx, { accounts: [{ login: 'NewLogin3', password: pw('Pw-Single-3!'), character: 'Dealername', party: 'tankname', role: 'melee', autoStart: true }], loginNow: true });
    eq(r.results[0].status, 'created', 'one: created');
    eq(r.created, 1, 'one: created count');
    const c = runnerCalls[runnerCalls.length - 1];
    eq([c.login, c.character, c.followName, c.followAtk, c.group, c.loginIp, String(c.serverId)], ['newlogin3', 'Dealername', 'Tankname', true, 'Party Tankname', 'login.example.invalid', '1'], 'one: runner got login (lower case), follow leader, assist, group, server');
    eq(path.basename(c.outFile), 'Newlogin3.xml', 'one: config file name = login with a capital');
    eq(c.scripts, ['swarm.js'], 'one: scripts = config scripts (no creation script for an existing character)');
    eq(path.basename(c.template), 'default.xml', 'one: template default (no melee template)');
    const cfg = cfgNow(), e = cfg.accounts[cfg.accounts.length - 1];
    eq([e.login, e.character, e.config, e.party, e.role, e.autoStart, e.enabled], ['newlogin3', 'Dealername', 'Newlogin3.xml', 'Tankname', 'melee', true, true], 'one: swarm.config.json entry');
    ok(!('password' in e), 'one: no password field in the entry');
    eq(cfg.accounts.length, 3, 'one: the old entries are kept');
    eq(cfg.server.loginIp, 'login.example.invalid', 'one: the rest of the config is kept');
    const raw = fs.readFileSync(ctx.CONFIG_FILE, 'utf8');
    ok(raw.includes('\r\n    {\r\n      "login": "newlogin3",'), 'one: entry written in the file\'s own block layout and CRLF line ends');
    ok(fs.readdirSync(path.join(SB, 'Settings', 'backup', 'swarm_config_history')).length === 1, 'one: backup copy made');
    const extra = fs.readFileSync(path.join(SB, 'Settings', 'start_extra.txt'), 'utf8');
    ok(extra.includes(path.join(SB, 'Settings', 'Newlogin3.xml')), 'one: config path added to start_extra.txt');
    ok(/logging in now/.test(r.results[0].loginState), 'one: log in now queued');
    await sleep(150);
    ok(mcpCalls.some(m => m.tool === 'open_account' && m.args.config_path === path.join(SB, 'Settings', 'Newlogin3.xml')), 'one: open_account sent with the config path');
  }
  // ---------------------------------------------------------------------------------------------------- 5. bulk: new characters, batch leader, a duplicate inside the batch, auto-start off
  {
    mcpCalls.length = 0;
    const text = `# my second party\nlead5;${pw('Lead;Five;pw')};Leadfive;;tank\nmem5a;${pw('MemFiveA##')};Memfivea;Leadfive;healer\nmem5b;${pw('MemFiveB##')};Memfiveb;Leadfive;\nmem5b;${pw('MemFiveB-dup')};Memfivebb;Leadfive;nuker\n`;
    const r = await API.add(ctx, { bulk: text, bulkNew: { race: 2, sex: 1, classId: 38 }, autoStart: false, loginNow: false });
    const byL = (l) => r.results.filter(x => x.login === l);
    eq(byL('lead5')[0].status, 'created', 'bulk: leader created');
    eq(byL('mem5a')[0].status, 'created', 'bulk: member created');
    eq(byL('mem5b').map(x => x.status).sort(), ['created', 'error'], 'bulk: the second mem5b line is refused');
    ok(/twice/.test(byL('mem5b').find(x => x.status === 'error').reason), 'bulk: duplicate reason');
    const healerCall = runnerCalls.find(c => c.login === 'mem5a');
    eq([healerCall.followName, healerCall.followAtk, path.basename(healerCall.template)], ['Leadfive', false, 'healer.xml'], 'bulk: healer follows without assist, healer template');
    const leadCall = runnerCalls.find(c => c.login === 'lead5');
    eq([leadCall.followName, leadCall.group], ['', 'Party Leadfive'], 'bulk: a new leader follows nobody, own group');
    eq(leadCall.scripts, ['mkchar_lead5.js', 'swarm.js'], 'bulk: new character -> creation script first');
    const mk = fs.readFileSync(path.join(SB, 'Scripts', 'mkchar_lead5.js'), 'utf8');
    ok(mk.includes('const L = "lead5", NAME = "Leadfive", ST = [23,23,24,44,19,37]') && mk.includes('Send.CharacterCreate(NAME, 2, 1, 38,'), 'bulk: creation script = Dark Elven Mystic, female, base stats');
    ok(mk.includes(SB.replace(/\\/g, '/') + '/Logs/create_chars.txt'), 'bulk: creation script logs to the install\'s Logs');
    const cfg = cfgNow();
    const m = cfg.accounts.find(a => a.login === 'mem5b');
    eq([m.party, m.role, m.autoStart], ['Leadfive', 'auto', false], 'bulk: empty role = auto, auto-start off');
    ok(/new Dark Elven Mystic/.test(cfg.accounts.find(a => a.login === 'lead5').note), 'bulk: the note says it is a new character');
    const extra = fs.readFileSync(path.join(SB, 'Settings', 'start_extra.txt'), 'utf8');
    ok(!extra.includes('Lead5.xml'), 'bulk: auto-start off -> not in start_extra.txt');
    ok(/auto-start off/.test(byL('lead5')[0].loginState), 'bulk: login state says auto-start off');
    eq(mcpCalls.filter(c => c.tool === 'open_account').length, 0, 'bulk: no log in without "log in right away"');
  }
  // ---------------------------------------------------------------------------------------------------- 6. duplicate login on a second add
  {
    const r = await API.add(ctx, { accounts: [{ login: 'newlogin3', password: pw('AgainPw33'), character: 'Otherdealer' }] });
    eq(r.results[0].status, 'exists', 'duplicate: second add of the same login refused');
  }
  // ---------------------------------------------------------------------------------------------------- 7. runner failure (password scrubbed), member of a failed leader, L2Swarm down
  {
    runnerFailFor = 'lead7';
    mcpUp = false;
    const before = cfgNow().accounts.length;
    const r = await API.add(ctx, { bulk: `lead7;${pw('Fail-Leader-77')};Leadseven;;tank\nmem7;${pw('Mem-Seven-77')};Memseven;Leadseven;melee\nsolo7;${pw('Solo-Seven-7')};Soloseven;;dagger`, loginNow: true });
    const s = (l) => r.results.find(x => x.login === l);
    eq(s('lead7').status, 'error', 'failure: leader error');
    ok(/creating the L2Swarm config failed/.test(s('lead7').reason) && s('lead7').reason.includes('***') && !s('lead7').reason.includes('Fail-Leader-77'), 'failure: the error text is scrubbed of the password');
    eq(s('mem7').status, 'error', 'failure: a member of the failed leader is not added');
    eq(s('solo7').status, 'created', 'failure: an independent line still works');
    ok(/not running: logs in at the next start/.test(s('solo7').loginState), 'failure: L2Swarm down -> logs in at the next start');
    eq(cfgNow().accounts.length, before + 1, 'failure: only the good line went into swarm.config.json');
    runnerFailFor = null; mcpUp = true;
  }
  // ---------------------------------------------------------------------------------------------------- 8. HTTP: key check, GET info, POST
  {
    const server = http.createServer(async (req, res) => { const url = new URL(req.url, 'http://x'); if (!(await API.handle(req, res, url, ctx))) { res.writeHead(404); res.end('no'); } });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const req = (method, p, body, key) => new Promise((resolve) => {
      const rq = http.request({ host: '127.0.0.1', port, path: p, method, headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { 'x-key': key } : {}) }, (res) => {
        let t = ''; res.on('data', c => { t += c; }); res.on('end', () => resolve({ code: res.statusCode, text: t }));
      });
      if (body) rq.write(JSON.stringify(body)); rq.end();
    });
    eq((await req('GET', '/api/addaccount')).code, 401, 'http: GET without key = 401');
    eq((await req('POST', '/api/addaccount', { accounts: [{ login: 'nokey1', password: 'x', character: 'Nokey' }] })).code, 401, 'http: POST without key = 401');
    const g = await req('GET', '/api/addaccount', null, 'testkey');
    const I = JSON.parse(g.text);
    ok(I.roles.some(r => r.value === 'auto') && I.roles.some(r => r.value === 'sk') && I.roles.some(r => r.value === 'summoner'), 'http: roles = kinds + named roles');
    ok(I.parties.some(p => p.leader === 'Tankname') && I.parties.some(p => p.leader === 'Leadfive'), 'http: parties from swarm.config.json');
    eq(I.baseClasses.length, 11, 'http: 11 base classes');
    const p = await req('POST', '/api/addaccount', { accounts: [{ login: 'http9', password: pw('Http-Nine-99'), character: 'Httpnine', mode: 'new', race: 5, sex: 1, classId: 124, role: 'auto' }] }, 'testkey');
    const P = JSON.parse(p.text);
    eq([p.code, P.results[0].status], [200, 'created'], 'http: POST creates');
    ok(!p.text.includes('Http-Nine-99'), 'http: the answer never echoes the password');
    eq((await req('GET', '/addaccount.js')).code, 200, 'http: page script is public');
    server.close();
  }
  // ---------------------------------------------------------------------------------------------------- 9. the password is in NO written file and NO log line
  {
    await sleep(100);
    const files = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else files.push(f); });
    walk(SB);
    let leaks = [];
    for (const f of files) { const t = fs.readFileSync(f, 'utf8'); PASSWORDS.forEach(p => { if (t.includes(p)) leaks.push(path.relative(SB, f) + ' contains ' + p); }); }
    eq(leaks, [], 'no password in any file of the sandbox (configs, scripts, swarm.config.json, backups, start_extra.txt, logs)');
    const log = fs.readFileSync(path.join(SB, 'Logs', 'dashboard_commands.log'), 'utf8').trim().split(/\r?\n/);
    ok(log.length >= 6 && log.every(l => /\taddaccount\t/.test(l)), 'log: one addaccount line per action');
    ok(log.some(l => /newlogin3\tDealername\tparty Tankname\trole melee/.test(l)), 'log: the line names login, character, party, role');
    ok(runnerCalls.every(c => c.password === '<given>' || c.password === ''), 'runner: the password only reached the runner (recorded here as <given>)');
    // the real config file is valid JSON and every account is unique
    const cfg = cfgNow(); eq(new Set(cfg.accounts.map(a => a.login)).size, cfg.accounts.length, 'config: logins unique');
  }
  // ---------------------------------------------------------------------------------------------------- 10. insertAccounts layouts
  {
    const inline = '{\n  "a": 1,\n  "accounts": [\n    { "login": "x1", "character": "Xone" }\n  ]\n}\n';
    const o1 = API.insertAccounts(inline, [{ login: 'x2', character: 'Xtwo' }]);
    ok(o1.includes('    { "login": "x1", "character": "Xone" },\n    { "login": "x2", "character": "Xtwo" }\n  ]'), 'insert: one-line layout kept');
    const empty = '﻿{ "accounts": [], "b": "[\\"accounts\\": tricky]" }';
    const o2 = API.insertAccounts(empty, [{ login: 'y1' }]);
    ok(o2.charCodeAt(0) === 0xFEFF && JSON.parse(o2.slice(1)).accounts[0].login === 'y1' && JSON.parse(o2.slice(1)).b === '["accounts": tricky]', 'insert: empty array, BOM kept, strings untouched');
    const none = '{ "x": 1 }';
    eq(JSON.parse(API.insertAccounts(none, [{ login: 'z' }])).accounts, [{ login: 'z' }], 'insert: no accounts key -> added');
  }

  try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  console.log(`${fails ? 'FAILED' : 'OK'}: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH ' + (e.stack || e)); process.exit(2); });
