// OFFLINE TEST of the ACADEMY PIPELINE (owner 2026-10-21, ACADEMY-2026-10-21: "as soon as I add an account under clan and then academy it
// should create a random character with name+numbers then go to giran with the .giran command, get invited by clan Leader to academy, get
// enough funds to buy the devotion set and a common weapon and spiritshots then it should go level from 1-40"). Never touches the game, MCP,
// L2Swarm or the live Logs / data / Settings files (everything runs on a scratch folder).
//   node docs/plan/tools/test_academy.js        (exit code 1 when a check fails; SWARM_JS=<file> tests another copy of swarm.js)
//   A  Dashboard/academy_logic.js: random names (name + digits, max 16, never taken), the plan (survives planlogic normalising, Ant Nest
//      steps keep the override), the manager's decision matrix, the XML helpers
//   B  swarm.js ACADEMY-PURE: config defaults, the buy need (have / buy / shots top-up / alternatives), the graduation check
//   C  Dashboard/addaccount_api.js: the academy row (random name, Dark Elven Mystic, solo party, academy: true), "login;password" bulk lines,
//      the create script on a stubbed character select: a taken name -> the next name, the result file; no free slot -> slotsFull
//   D  Dashboard/academy_api.js on a scratch install: setup (approved class plan, party plan, invite list, run switch), graduation -> the next
//      character (close -> XML + swarm.config.json -> create script -> open), a renamed creation, slots full = stopped, one action per tick
//   E  the wiring: plan kind 'academy' in swarm.js + planlogic, the academy funds target, the live roster, the first start, server.js, the page
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRCF = process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRCF, 'utf8');
const DASH = path.join(ROOT, 'Dashboard');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const AL = require(path.join(DASH, 'academy_logic.js'));
const PL = require(path.join(DASH, 'planlogic.js'));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'academy.json'), 'utf8'));
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

(async () => {
  // ---------------------------------------------------------------------------------------------------------------- A academy_logic
  console.log('A) academy_logic');
  {
    const taken = new Set(['nyxara12']);
    const names = AL.academyNames(CFG, Math.random, taken, 50);
    check(names.length === 50 && names.every(x => AL.NAME_RE.test(x) && x.length <= 16 && /\d{2,4}$/.test(x)), `random names: name + 2-4 digits, max 16 letters/digits (e.g. ${names.slice(0, 3).join(', ')})`);
    check(new Set(names.map(x => x.toLowerCase())).size === 50 && !names.some(x => taken.has(x.toLowerCase())), 'random names: all different, never a taken one');
    const forced = AL.academyName({ names: { first: ['Nyx'], second: ['ara'], digitsMin: 2, digitsMax: 2 } }, seq([0, 0, 0.15, 0.25]), new Set(['nyxara12']));
    check(forced !== 'Nyxara12' && /^Nyxara\d\d$/.test(forced), `a taken name is skipped (${forced})`);
    const plan = PL.normPlan(AL.academyPlan(CFG, 'Nyxara12'));
    check(plan.steps.length === 10 && plan.on === true, 'the academy plan: 10 steps, used on Start');
    check(plan.steps.map(s => s.kind + (s.act ? ':' + s.act : '')).join(' ') === 'academy:join academy:funds academy:buy level class academy:buy level level class academy:graduate', 'order: join, funds, buy, level 20, class, buy, level 25, level 40, class, graduate');
    const lv = plan.steps.filter(s => s.kind === 'level');
    check(lv.map(s => s.to).join(',') === '20,25,40' && lv[1].spot.kind === 'rooms' && lv[1].spot.roomId === 'antnest-1-straight-a' && lv[2].spot.roomId === 'antnest-1-straight-b', 'levels 20 / 25 / 40; Ant Nest entrance room, then the first big room');
    check(lv[1].spot.override === true && lv[2].spot.override === true && lv[1].spot.stay === true, 'the Ant Nest steps keep the owner\'s level override + stay through planlogic');
    check(plan.steps[2].set === 'start' && plan.steps[5].set === 'level20', 'buy sets: start / level20');
    check(PL.normStep({ id: 'x1', kind: 'academy', act: 'bogus' }) === null && PL.normStep({ id: 'x2', kind: 'academy', act: 'graduate' }).act === 'graduate', 'planlogic: academy acts checked');
    check(/Academy: buy the level-20 kit/.test(PL.stepText(plan.steps[5], {})), 'planlogic: plain sentence for the academy steps');
    // decisions
    const acc = { login: 'acad1', character: 'Nyxara12', academy: true, config: 'Acad1.xml' };
    check(AL.academyDecide({ login: 'x', character: 'A' }, null, null, {}, CFG).act === 'none', 'decide: not an academy account -> nothing');
    check(AL.academyDecide(acc, null, null, {}, CFG).act === 'setup', 'decide: a new academy character -> setup');
    check(AL.academyDecide(acc, null, null, { setupFor: 'Nyxara12' }, CFG).act === 'wait', 'decide: set up, running -> wait');
    check(AL.academyDecide(acc, null, { result: 'ok', name: 'Velith345', forChar: 'Nyxara12' }, { setupFor: 'Nyxara12' }, CFG).act === 'rename', 'decide: created under another name -> rename');
    check(AL.academyDecide(acc, null, { result: 'fail', slotsFull: true }, {}, CFG).act === 'slotsfull', 'decide: no free character slot -> slots full');
    check(AL.academyDecide(acc, { status: 'graduated', name: 'Nyxara12' }, null, { setupFor: 'Nyxara12', made: 1 }, CFG).act === 'next', 'decide: graduated -> the next character');
    check(AL.academyDecide(acc, { status: 'graduated', name: 'Nyxara12' }, null, { setupFor: 'Nyxara12', made: 7 }, CFG).act === 'slotsfull', 'decide: 7 characters made -> stop');
    check(AL.academyDecide(acc, { status: 'graduated', name: 'Nyxara12' }, null, { setupFor: 'Nyxara12' }, Object.assign({}, CFG, { end: { newCharacter: false } })).act === 'logout', 'decide: newCharacter false -> only log out');
    check(AL.academyDecide(acc, { status: 'graduated', name: 'Nyxara12' }, null, { setupFor: 'Nyxara12', stopped: 'x' }, CFG).act === 'none', 'decide: stopped on the dashboard -> nothing');
    check(AL.academyDecide(acc, { status: 'graduated', name: 'OldName' }, null, { setupFor: 'Nyxara12' }, CFG).act === 'wait', 'decide: an old graduate file of another name does not count');
    // xml
    const xml = '<?xml version="1.0"?>\r\n<Option>\r\n  <ScriptsList><Script><IsEnabled>true</IsEnabled><guid>g1</guid><Name>agent2.js</Name><Path>C:\\x\\agent2.js</Path></Script></ScriptsList>\r\n  <SelectedCharacter>Old</SelectedCharacter>\r\n</Option>\r\n';
    const x2 = AL.xmlEnsureScript(AL.xmlSetSelected(xml, 'Nyxara12'), 'mkchar_acad1.js', 'C:\\L2Swarm\\Scripts\\mkchar_acad1.js', 'g2');
    check(AL.xmlSelected(x2) === 'Nyxara12' && /<Name>mkchar_acad1\.js<\/Name>/.test(x2) && /<Name>agent2\.js<\/Name>/.test(x2), 'xml: SelectedCharacter set, the create script added, the agent kept');
    const x3 = AL.xmlEnsureScript(x2.replace('<IsEnabled>true</IsEnabled><guid>g2</guid>', '<IsEnabled>false</IsEnabled><guid>g2</guid>'), 'mkchar_acad1.js', 'p', 'g3');
    check((x3.match(/<Name>mkchar_acad1\.js<\/Name>/g) || []).length === 1 && /<IsEnabled>true<\/IsEnabled><guid>g2<\/guid>/.test(x3), 'xml: a disabled create script is switched on again (not added twice)');
    check(AL.xmlSelected(AL.xmlSetSelected('<Option>\r\n</Option>\r\n', 'Abc12')) === 'Abc12', 'xml: SelectedCharacter added when missing');
  }

  // ---------------------------------------------------------------------------------------------------------------- B ACADEMY-PURE
  console.log('B) swarm.js ACADEMY-PURE');
  {
    const B = new Function(blk('// ACADEMY-PURE-BEGIN', '// ACADEMY-PURE-END') + '\nreturn { ACADEMY_ACTS, acadCfgPure, acadBuyNeed, acadGradDecide };')();
    const c0 = B.acadCfgPure({}), c1 = B.acadCfgPure(CFG);
    check(c0.classPlan.join() === '39,40' && c0.funds.need === 900000 && c0.end.newCharacter === true, 'config defaults (Dark Wizard > Spellhowler, 900k needed, next character on)');
    check(c1.buy.level20.length === 5 && c1.buy.start[0].id === 2509, 'academy.json: start = No-Grade spiritshots, level20 = Devotion set + helmet + Common weapon + D spiritshots');
    const sps = { id: 2509, count: 5000, shots: true }, staff = { id: 11729, alt: [11732], count: 1, equip: true };
    check(B.acadBuyNeed(sps, {}).act === 'buy' && B.acadBuyNeed(sps, {}).count === 5000, 'shots: none -> buy 5000');
    check(B.acadBuyNeed(sps, { 2509: 4200 }).act === 'have' && B.acadBuyNeed(sps, { 2509: 3000 }).count === 2000, 'shots: >= 80 % = enough, else top up');
    check(B.acadBuyNeed(staff, { 11732: 1 }).act === 'have' && B.acadBuyNeed(staff, {}).act === 'buy', 'weapon: an Atuba Hammer counts for the Staff of Life (alternative)');
    check(!B.acadGradDecide(39, [39, 40], 'MyClan').ok && B.acadGradDecide(40, [39, 40], '').ok, 'graduate: only after the 2nd class (Spellhowler)');
    check(B.ACADEMY_ACTS.join() === 'join,funds,buy,graduate', 'the four academy acts');
  }

  // ---------------------------------------------------------------------------------------------------------------- C add account
  console.log('C) addaccount_api academy rows + create script');
  const AA = require(path.join(DASH, 'addaccount_api.js'));
  {
    const classes = AA.baseClasses({ ROOT, DATA: path.join(ROOT, 'Scripts', 'data') });
    const D = { roles: new Set(['auto', 'nuker']), classes, leaders: new Set(), academy: AL.academyCfg(CFG), taken: new Set(), rnd: seq([0.1, 0.3, 0.5, 0.7, 0.2, 0.9, 0.4]) };
    const v = AA.validateOne({ line: 1, login: 'Acad1', password: 'pw-test', academy: true }, D);
    check(v.ok && v.row.academy === true && v.row.mode === 'new' && v.row.create.classId === 38 && v.row.create.race === 2, `academy row: a new Dark Elven Mystic (${v.ok ? v.row.create.className : v.reason})`);
    check(v.ok && AL.NAME_RE.test(v.row.character) && v.row.party === v.row.character && v.row.role === 'nuker' && v.row.create.names.length === 6 && v.row.create.names[0] === v.row.character, `academy row: random name ${v.ok ? v.row.character : ''}, its own party, role nuker, 6 names to try`);
    const v2 = AA.validateOne({ line: 2, login: 'acad2', password: 'pw2', academy: true }, D);
    check(v2.ok && v2.row.character !== v.row.character, 'two academy rows of one batch never get the same name');
    check(!AA.validateOne({ line: 3, login: 'acad3', password: '', academy: true }, D).ok, 'academy row: the password is still needed');
    const pb = AA.parseBulk('acad4;secret;with;semicolons\n# skip\nacad5;pw5', { academy: true });
    check(pb.rows.length === 2 && pb.rows[0].password === 'secret;with;semicolons' && pb.rows[1].login === 'acad5' && !pb.errors.length, 'bulk academy lines: login;password (a ; inside the password works)');
    check(AA.parseBulk('acad6;pw').errors.length === 1, 'bulk without the academy tick still needs a character');
    // the create script on a stubbed character select
    const runCreate = async (answers, slots) => {
      const files = {}, sent = [];
      const tmp = 'C:/T';
      const s = AA.buildCreateScript(tmp, 'acad1', { race: 2, sex: 1, classId: 38, stats: [1, 2, 3, 4, 5, 6], names: ['First12', 'Second34', 'Third56'], resultFile: 'Logs/academy_create_acad1.json' }, 'First12');
      const G = { File: { AppendAllText: (f, t) => { files[f] = (files[f] || '') + t; }, WriteAllText: (f, t) => { files[f] = t; } }, Options: {}, Me: null, globalThis: null };
      let k = 0;
      G.Send = { NewCharacter: () => { }, CharacterCreate: (name) => { sent.push(name); const a = answers[k++]; setImmediate(() => { if (a === 'ok') { G.globalThis.OnIncomingPacket([0, 0, 0x0f]); setImmediate(() => { G.Me = { Name: name }; }); } else G.globalThis.OnIncomingPacket([0, 0, 0x10, a]); }); } };
      G.sleep = () => new Promise(r => setImmediate(r));
      G.globalThis = G;
      const ctx = vm.createContext(G);
      vm.runInContext(s, ctx);
      for (let i = 0; i < 400 && !files['C:/T/Logs/academy_create_acad1.json']; i++) await new Promise(r => setImmediate(r));
      for (let i = 0; i < 50; i++) await new Promise(r => setImmediate(r));
      let res = null; try { res = JSON.parse(files['C:/T/Logs/academy_create_acad1.json']); } catch (e) { }
      return { sent, res, log: files['C:/T/Logs/create_chars.txt'] || '' };
    };
    const r1 = await runCreate([2, 'ok']);
    check(r1.sent.join() === 'First12,Second34' && r1.res && r1.res.result === 'ok' && r1.res.name === 'Second34' && r1.res.forChar === 'First12', `create script: the first name taken -> the next one, result file (${r1.sent.join(' -> ')}, ${r1.res && r1.res.name})`);
    const r2 = await runCreate([1]);
    check(r2.sent.length === 1 && r2.res && r2.res.result === 'fail' && r2.res.slotsFull === true, 'create script: no free character slot -> stops at once, slotsFull in the result file');
    const r3 = await runCreate(['ok']);
    check(r3.sent.join() === 'First12' && r3.res && r3.res.name === 'First12', 'create script: the first name works -> no rename needed');
  }

  // ---------------------------------------------------------------------------------------------------------------- D manager
  console.log('D) academy_api on a scratch install');
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'academy_'));
    const DATA = path.join(tmp, 'Scripts', 'data'), LOGS = path.join(tmp, 'Logs'), SET = path.join(tmp, 'Settings');
    [DATA, LOGS, SET, path.join(SET, 'backup'), path.join(tmp, 'Scripts')].forEach(d => fs.mkdirSync(d, { recursive: true }));
    fs.writeFileSync(path.join(DATA, 'academy.json'), JSON.stringify(CFG));
    fs.copyFileSync(path.join(ROOT, 'Scripts', 'data', 'class_tree.json'), path.join(DATA, 'class_tree.json'));
    fs.writeFileSync(path.join(DATA, 'clan_quests.json'), JSON.stringify({ clan: { name: 'MyClan', inviteAllow: ['Someone'] } }));
    const CF = path.join(tmp, 'swarm.config.json');
    fs.writeFileSync(CF, JSON.stringify({ accounts: [{ login: 'quick', character: 'Dagger1', party: 'Dagger1', role: 'tank' }, { login: 'acad1', character: 'Nyxara12', party: 'Nyxara12', role: 'nuker', config: 'Acad1.xml', academy: true }] }, null, 2));
    fs.writeFileSync(path.join(SET, 'Acad1.xml'), '<?xml version="1.0"?>\r\n<Option>\r\n  <ScriptsList><Script><IsEnabled>true</IsEnabled><guid>g1</guid><Name>agent2.js</Name><Path>C:\\x\\agent2.js</Path></Script></ScriptsList>\r\n  <SelectedCharacter>Nyxara12</SelectedCharacter>\r\n</Option>\r\n');
    const calls = [], sends = [];
    const teamMap = () => { const j = JSON.parse(fs.readFileSync(CF, 'utf8')); const m = {}; j.accounts.forEach(a => { m[a.character] = a.party || a.character; }); return m; };
    // the three dashboard writers are stubbed (their own tests cover them); the manager must call them with the right content
    const stubs = { classpage: [], partyplan: [], runstate: [] };
    const stubMod = (name, key) => { const f = require.resolve(path.join(DASH, name)); require.cache[f] = { id: f, filename: f, loaded: true, exports: { post: async (ctx, b) => { stubs[key].push(b); return { ok: true }; } } }; };
    stubMod('classpage_api.js', 'classpage'); stubMod('partyplan_api.js', 'partyplan'); stubMod('runstate_api.js', 'runstate');
    delete require.cache[require.resolve(path.join(DASH, 'academy_api.js'))];
    const AM = require(path.join(DASH, 'academy_api.js'));
    const ctx = { ROOT: tmp, DATA, LOGS, SETTINGS: SET, CONFIG_FILE: CF, teamMap, readStates: () => [], reloadCfg: () => { }, closeWaitMs: 0, rnd: seq([0.11, 0.42, 0.77, 0.31, 0.58, 0.93, 0.05]),
      mcpCall: async (tool, args) => { calls.push(tool + ' ' + path.basename(args.config_path || '')); return 'ok'; }, commandRun: async (b) => { sends.push(b); return { body: {} }; } };
    // 1) setup
    let r = await AM.tick(ctx);
    check(r.acted && r.acted[0] === 'acad1', 'tick 1: the new academy account is set up');
    check(stubs.classpage.length === 1 && stubs.classpage[0].approve === true && stubs.classpage[0].confirm === true && stubs.classpage[0].plan.join() === '39,40' && stubs.classpage[0].name === 'Nyxara12', 'setup: class plan Dark Wizard > Spellhowler, APPROVED (the owner\'s pipeline order)');
    check(stubs.partyplan.length === 1 && stubs.partyplan[0].action === 'set' && stubs.partyplan[0].party === 'Nyxara12' && stubs.partyplan[0].plan.on === true && stubs.partyplan[0].plan.steps.length === 10, 'setup: the academy party plan (10 steps, used on Start)');
    check(stubs.runstate.length === 1 && stubs.runstate[0].party === 'Nyxara12' && stubs.runstate[0].on === true, 'setup: its run switch ON');
    const cq = JSON.parse(fs.readFileSync(path.join(DATA, 'clan_quests.json'), 'utf8'));
    check(cq.clan.inviteAllow.includes('Nyxara12') && cq.clan.inviteAllow.includes('Someone'), 'setup: on the clan invite list (the others kept)');
    r = await AM.tick(ctx);
    check(!r.acted.length && stubs.classpage.length === 1, 'tick 2: nothing more while it runs');
    // 2) graduation -> next character
    fs.writeFileSync(path.join(LOGS, 'academy_Nyxara12.json'), JSON.stringify({ name: 'Nyxara12', status: 'graduated', level: 40, classId: 40 }));
    r = await AM.tick(ctx);
    const cfg2 = JSON.parse(fs.readFileSync(CF, 'utf8')), a2 = cfg2.accounts.find(a => a.login === 'acad1'), xml2 = fs.readFileSync(path.join(SET, 'Acad1.xml'), 'utf8');
    check(r.acted[0] === 'acad1' && calls.join('|') === 'close_account Acad1.xml|open_account Acad1.xml', `graduated: close -> open the account (${calls.join(', ')})`);
    check(a2.character !== 'Nyxara12' && a2.party === a2.character && a2.academy === true && cfg2.accounts[0].character === 'Dagger1', `graduated: swarm.config.json now ${a2.character} (its own party, still academy; other accounts untouched)`);
    check(AL.xmlSelected(xml2) === a2.character && /<Name>mkchar_acad1\.js<\/Name>/.test(xml2) && /<Name>agent2\.js<\/Name>/.test(xml2), 'graduated: the XML selects the new name + runs the create script once');
    const mk = fs.readFileSync(path.join(tmp, 'Scripts', 'mkchar_acad1.js'), 'utf8');
    check(mk.includes(JSON.stringify(a2.character)) && /academy_create_acad1\.json/.test(mk) && /CharacterCreate\(NAME, 2, [01], 38,/.test(mk), 'graduated: a create script for a new Dark Elven Mystic with the new name list');
    const M = JSON.parse(fs.readFileSync(path.join(LOGS, 'academy_manager.json'), 'utf8'));
    check(M.accounts.acad1.made === 2 && M.accounts.acad1.history[0].graduated === 'Nyxara12', 'graduated: counted (character 2 on this account) and remembered');
    check(fs.readdirSync(path.join(SET, 'backup')).some(f => /^Acad1\.academy_/.test(f)) && fs.readdirSync(path.join(SET, 'backup', 'swarm_config_history')).length >= 1, 'graduated: backups of the XML and swarm.config.json');
    r = await AM.tick(ctx);
    check(r.acted[0] === 'acad1' && stubs.classpage.length === 2 && stubs.classpage[1].name === a2.character, 'next tick: the new character is set up (its own approved class plan)');
    // 3) the create script had to take another name -> rename
    calls.length = 0;
    fs.writeFileSync(path.join(LOGS, 'academy_create_acad1.json'), JSON.stringify({ result: 'ok', name: 'Takenot99', forChar: a2.character, login: 'acad1' }));
    r = await AM.tick(ctx);
    const a3 = JSON.parse(fs.readFileSync(CF, 'utf8')).accounts.find(a => a.login === 'acad1');
    check(a3.character === 'Takenot99' && AL.xmlSelected(fs.readFileSync(path.join(SET, 'Acad1.xml'), 'utf8')) === 'Takenot99' && calls.length === 2, 'renamed creation: swarm.config.json + XML follow the real name (close -> open)');
    r = await AM.tick(ctx);
    check(stubs.partyplan[stubs.partyplan.length - 1].party === 'Takenot99', 'renamed creation: the real name gets its setup');
    // 4) slots full
    calls.length = 0;
    fs.writeFileSync(path.join(LOGS, 'academy_create_acad1.json'), JSON.stringify({ result: 'fail', slotsFull: true, reason: 1 }));
    r = await AM.tick(ctx);
    const M2 = JSON.parse(fs.readFileSync(path.join(LOGS, 'academy_manager.json'), 'utf8'));
    check(/no free character slot/.test(M2.accounts.acad1.stopped || '') && calls[0] === 'close_account Acad1.xml', 'no free slot: the loop stops (said in the manager state) and the account is closed');
    r = await AM.tick(ctx);
    check(!r.acted.length, 'stopped: nothing more happens');
    const st = AM.status(ctx);
    check(st.ok && st.accounts.length === 1 && st.accounts[0].stopped, 'GET status: the account with its stop reason');
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  }

  // ---------------------------------------------------------------------------------------------------------------- E wiring
  console.log('E) wiring');
  {
    check(/var PLAN_KINDS = \[[^\]]*'academy'/.test(src) && /if \(step\.kind === 'academy'\) return planStepAcademy\(step\);/.test(src), 'swarm.js: plan kind academy runs planStepAcademy');
    check(/isAcademy\(n\)\) \{ try \{ return acadCfg\(\)\.funds\.target;/.test(src), 'swarm.js: an academy character asks the givers for academy.json funds.target');
    check(/function academyRosterSync\(\)/.test(src) && /CONFIG\.academy = CONFIG\.academy \|\| \{\}\)\[n\] = true/.test(src), 'swarm.js: new academy accounts join the roster live (clan leader + givers know them)');
    check(/planRun\('academy: first start'\)/.test(src), 'swarm.js: the first start of an academy plan at the first login');
    check(/await giranGo\('start'\)/.test(blk('async function acadToGiran', 'async function acadJoin')) && /planStepOrder\(\{ kind: 'town', town: 'Giran' \}\)/.test(src), 'swarm.js: .giran (town step) + the recorded Giran route to the start (the clan leader invites there)');
    check(PL.KINDS.includes('academy') && PL.INFO.academy, 'planlogic: academy kind + label');
    const srv = fs.readFileSync(path.join(DASH, 'server.js'), 'utf8');
    check(/require\('\.\/academy_api'\)\.tick\(ACADEMY_CTX\(\)\)/.test(srv) && /require\('\.\/academy_api'\)\.handle\(req, res, url, ACADEMY_CTX\(\)\)/.test(srv), 'server.js: the manager tick (30 s) + /api/academy');
    const page = fs.readFileSync(path.join(DASH, 'addaccount.js'), 'utf8');
    check(/value="academy"/.test(page) && /id="aaBAcad"/.test(page) && /bulkAcademy: !!acad/.test(page), 'add-account page: "Academy mage (automatic)" + the bulk academy tick');
    check(fs.existsSync(path.join(ROOT, 'docs', 'guide', 'pages', 'academy.md')), 'guide page docs/guide/pages/academy.md');
  }

  console.log(`\n${n - fails} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
