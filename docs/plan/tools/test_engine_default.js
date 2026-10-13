// NEW ENGINE = DEFAULT (2026-10-13, user: "Make the new engine default!"). Offline tests: no L2Swarm, no game, no MCP (a mock), no dashboard,
// nothing written outside the temp folder.
//   A  rules (Dashboard/brain_host/supervise.js): allowAll / except / roster, an unreadable roster keeps the last list, isBrainChar,
//      engineScripts, migrateDefault (only the untouched old default is migrated), newDefault, connectedNames
//   B  pool.js: allowAll follows swarm.config.json LIVE (account added -> accepted at its hello, party map refreshed; except -> dropped;
//      unreadable roster -> nothing changes)
//   C  dashboard supervisor: a brain character whose account still runs swarm.js (no agent) gets swarm.js restarted like before
//   D  attach_agent.js --all / --back against a mock MCP (one by one, swarm.js checked stopped before the agent starts, non-brain refused)
//   E  engine_default.js --migrate (update.ps1) on temp installs: old default migrated, changed files kept
//   F  engine_mode.ps1 (SETUP / new_account.ps1): the PowerShell rule = the JS rule
//   H  SETUP.ps1 dry run in a temp sandbox: not moved -> swarm.js off + agent2.js; moved -> untouched; "except" -> back to swarm.js
//   G  wiring: server.js (roster, --roster, /api/engine, perf), SETUP.ps1, update.ps1, add account, release_build.js, docs
// Usage: node docs/plan/tools/test_engine_default.js [--quick]
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), cp = require('child_process'), http = require('http');
function argv0(k, d) { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; }
const ROOT = path.resolve(argv0('--root', path.resolve(__dirname, '..', '..', '..')));
const argv = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const BH = path.resolve(argv('--bh', path.join(ROOT, 'Dashboard', 'brain_host')));
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (c) pass++; else fail++; };
const mkTmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p || 'engine_def_'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, step) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { } await sleep(step || 100); } return false; }
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };
const S = require(path.join(BH, 'supervise.js'));
const ACC = [{ login: 'l1', character: 'Lead', party: 'Lead' }, { login: 'l2', character: 'Heal', party: 'Lead' }, { login: 'l3', character: 'Off', party: 'Lead', enabled: false },
  { login: 'l4', character: 'Solo', party: 'Solo' }, { login: '', character: 'NoLogin' }, { login: 'l6' }];

// ================================================================== A. rules
function partA() {
  console.log('A. rules (Dashboard/brain_host/supervise.js)');
  ok(JSON.stringify(S.rosterOf(ACC)) === JSON.stringify(['Lead', 'Heal', 'Solo']), `roster = enabled accounts with a login + a character (${S.rosterOf(ACC).join(', ')})`);
  const c1 = S.readCfg({ on: true, allowAll: true, allow: [], except: [] }, null, ACC);
  ok(c1.on && c1.allowAll && c1.allow.join(',') === 'Lead,Heal,Solo', `allowAll: every roster character is a brain character (${c1.allow.join(', ')})`);
  const c2 = S.readCfg({ on: true, allowAll: true, allow: ['Guest'], except: ['Heal'] }, null, ACC);
  ok(c2.allow.join(',') === 'Lead,Solo,Guest', `allowAll + "allow" (outside the roster) - "except" (${c2.allow.join(', ')})`);
  const grown = S.readCfg({ on: true, allowAll: true }, c1, ACC.concat([{ login: 'l7', character: 'Newbie', party: 'Solo' }]));
  ok(grown.allow.includes('Newbie') && S.restartSig(grown) === S.restartSig(c1), 'an account added to swarm.config.json joins at once, WITHOUT a pool restart (same restart signature)');
  const unread = S.readCfg({ on: true, allowAll: true }, c1, null);
  ok(unread.on && unread.allow.join(',') === c1.allow.join(',') && unread.rosterUnread, 'unreadable swarm.config.json: allowAll keeps the last good list (the pool is not stopped)');
  ok(S.readCfg(null, c1, ACC) === c1, 'unreadable brain_host.json keeps the last good config (unchanged rule)');
  ok(!S.readCfg({ on: false, allowAll: true }, null, ACC).on, '"on": false switches everything off');
  ok(!S.readCfg({ on: true, allowAll: true }, null, []).on, 'allowAll with an empty roster = off (nothing to drive)');
  const old = S.readCfg({ on: true, allow: ['Lead'] }, null, ACC);
  ok(old.on && old.allow.join(',') === 'Lead' && !old.allowAll, 'without allowAll only the "allow" list counts (the owner\'s explicit list keeps working)');
  ok(S.readCfg({ on: true, allow: ['A'] }, null).allow.join(',') === 'A', 'readCfg(raw, last) without a roster still works (old callers)');
  ok(S.isBrainChar('Heal', { on: true, allowAll: true }, ACC) && !S.isBrainChar('Off', { on: true, allowAll: true }, ACC) && !S.isBrainChar('Stranger', { on: true, allowAll: true }, ACC),
    'isBrainChar: roster member yes, disabled account / unknown name no');
  ok(S.isBrainChar('Stranger', { on: true, allowAll: true }, ACC, { adding: true }), 'isBrainChar: a character being ADDED to the roster counts (dashboard add account)');
  ok(!S.isBrainChar('Heal', { on: true, allowAll: true, except: ['Heal'] }, ACC) && !S.isBrainChar('Heal', { on: false, allowAll: true }, ACC) && !S.isBrainChar('Heal', { on: true, allow: ['Lead'] }, ACC),
    'isBrainChar: except / off / not in the explicit list -> no');
  ok(JSON.stringify(S.engineScripts(['mkchar_l9.js', 'swarm.js'], true)) === '["mkchar_l9.js","agent2.js"]' && JSON.stringify(S.engineScripts(['agent2_Heal.js', 'swarm.js'], false)) === '["swarm.js"]',
    'engineScripts: swarm.js <-> agent2.js, other scripts stay, no duplicates');
  const OLD = { _readme: 'old', on: false, allow: [], bridge: true, pool: true };
  const m1 = S.migrateDefault(OLD);
  ok(m1.migrate && m1.cfg.on === true && m1.cfg.allowAll === true && Array.isArray(m1.cfg.allow) && m1.cfg.bridge && m1.cfg.pool, 'migrateDefault: the untouched old default (v1.6.x package) -> on + allowAll');
  ok(S.migrateDefault({ on: false, allow: [], maxRssMb: 5000 }).cfg.maxRssMb === 5000, 'migrateDefault keeps the memory limit');
  const kept = [{ on: true, allow: ['Lead'] }, { on: false, allow: ['Lead'] }, { on: false, allow: [], allowAll: false }, { on: false, allowAll: true }, { on: true, allow: [] }];
  ok(kept.every(k => !S.migrateDefault(k).migrate), 'migrateDefault keeps every file the user changed (own list on/off, an "allowAll" key, "on": true)');
  ok(!S.migrateDefault(null).migrate && !S.migrateDefault([]).migrate, 'migrateDefault: unreadable -> nothing');
  const d = S.newDefault({ bridge: false });
  ok(d.on && d.allowAll && d.bridge === false && /"on": false/.test(d._readme), 'newDefault: on + allowAll, keeps bridge, the readme says how to switch back');
  const st = { fresh: true, workers: [{ contexts: [{ name: 'Lead', connected: true }, { name: 'Heal', connected: false }] }, { contexts: [{ name: 'Solo', connected: true }] }] };
  ok(JSON.stringify(S.connectedNames(st)) === '["Lead","Solo"]' && S.connectedNames({ fresh: false }) === null, 'connectedNames: the characters whose agent is connected (fresh stats only)');
}

// ================================================================== B. pool.js follows the roster live
function fakeAgent(port, name) {
  const s = net.connect(port, '127.0.0.1'); const A = { name, s, bye: false };
  s.setEncoding('utf8'); let buf = '';
  s.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(l); if (m.a === 'bye') A.bye = m.why || true; if (m.a === 'ping') s.write(JSON.stringify({ t: 'pong', id: m.id }) + '\n'); } catch (e) { } } });
  s.on('error', () => { });
  s.on('connect', () => s.write(JSON.stringify({ t: 'hello', v: 3, name, accountId: 'acc-' + name }) + '\n'));
  return A;
}
async function partB() {
  console.log('B. pool.js: allowAll follows swarm.config.json live');
  const { Pool } = require(path.join(BH, 'pool.js'));
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(path.join(overlay, 'Logs'), { recursive: true });
  const script = path.join(tmp, 'tiny.js'); fs.writeFileSync(script, 'globalThis.__boot = (globalThis.__boot || 0) + 1;\n');
  const cfgF = path.join(tmp, 'brain_host.json'), rosterF = path.join(tmp, 'swarm.config.json'), logF = path.join(tmp, 'pool.log');
  fs.writeFileSync(cfgF, JSON.stringify({ on: true, allowAll: true, allow: [], except: [] }));
  fs.writeFileSync(rosterF, JSON.stringify({ accounts: [{ login: 'a', character: 'R1', party: 'R1' }, { login: 'b', character: 'R2', party: 'R1' }] }));
  const port = 24400 + Math.floor(Math.random() * 300);
  const P = new Pool({ port, allow: ['R1', 'R2'], script, overlay, isolate: ['Logs'], logFile: logF, stallMs: 4000, hbMs: 100, allowEval: true, root: ROOT.replace(/\//g, '\\'),
    configFile: cfgF, rosterFile: rosterF, configPollMs: 200 });
  ok(P.partyOf('R2') === 'R1', `the party map comes from the roster file (R2 -> ${P.partyOf('R2')})`);
  await P.start();
  ok((P.o.allow || []).join(',') === 'R1,R2', `allowAll at start: the allow list = the roster (${(P.o.allow || []).join(', ')})`);
  await sleep(150);
  fs.writeFileSync(rosterF, JSON.stringify({ accounts: [{ login: 'a', character: 'R1', party: 'R1' }, { login: 'b', character: 'R2', party: 'R1' }, { login: 'c', character: 'R3', party: 'R1' }] }));
  ok(await waitFor(() => (P.o.allow || []).includes('R3'), 3000), 'an account added to swarm.config.json is in the allow list within a poll (no restart)');
  ok(P.partyOf('R3') === 'R1', `... and in its party (party map refreshed: R3 -> ${P.partyOf('R3')})`);
  const A3 = fakeAgent(port, 'R3');
  ok(await waitFor(async () => { const r = await P.eval('R3', 'globalThis.__boot'); return r && r.ok && r.v >= 1; }, 6000, 150) && !A3.bye, 'its agent\'s hello is accepted (context booted in party R1\'s worker)');
  fs.writeFileSync(rosterF, '{ "accounts": [ { "login": "a", ');
  await sleep(700);
  ok((P.o.allow || []).join(',') === 'R1,R2,R3' && !A3.bye, 'a half-written swarm.config.json changes nothing (list kept, nobody dropped)');
  fs.writeFileSync(rosterF, JSON.stringify({ accounts: [{ login: 'a', character: 'R1', party: 'R1' }, { login: 'b', character: 'R2', party: 'R1' }, { login: 'c', character: 'R3', party: 'R1' }] }));
  fs.writeFileSync(cfgF, JSON.stringify({ on: true, allowAll: true, allow: [], except: ['R3'] }));
  ok(await waitFor(() => A3.bye, 4000), `"except": ["R3"] -> R3 leaves the brain live (agent told: ${A3.bye})`);
  try { A3.s.destroy(); } catch (e) { }
  await P.stop();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
}

// ================================================================== C. supervisor
function blk(src, a, b) { const i = src.indexOf(a), j = src.indexOf(b, i + 1); return i >= 0 && j > i ? src.slice(src.indexOf('\n', i) + 1, j) : ''; }   // from the line after the start marker
function partC() {
  console.log('C. dashboard supervisor (server.js SUPBRAIN-PURE)');
  const src = read(path.join(ROOT, 'Dashboard', 'server.js'));
  const b = blk(src, '// SUPBRAIN-PURE start', '// SUPBRAIN-PURE end');
  let supDecide = null; try { supDecide = new Function(b + '\nreturn supDecide;')(); } catch (e) { }
  ok(!!supDecide, 'SUPBRAIN-PURE block loads');
  if (!supDecide) return;
  const now = 1e12, x = (o) => Object.assign({ now, manual: false, last: 0, recent: [], l2mb: 1500, brain: { on: true, allow: ['Lead'] }, bh: { running: true, ipc: true }, lastPoolKill: 0 }, o || {});
  const stale = { name: 'Lead', ageSec: 300, asyncAge: 0 };
  ok(supDecide(stale, x()).act === 'revive', 'brain character with its agent: the pool is asked (unchanged)');
  ok(supDecide(stale, x({ agent: false })).act === 'restartScript', 'brain character per config whose account still runs swarm.js (agent: false, not moved yet): swarm.js is restarted like before');
  ok(supDecide(stale, x({ agent: false, bh: { running: false } })).act === 'restartScript', '... also while the pool is down');
  const loop = src.slice(src.indexOf('// SUPBRAIN-PURE end'), src.indexOf('// GEOPATH SERVICE') > 0 ? src.indexOf('// GEOPATH SERVICE') : src.length);
  ok(/agent: false/.test(loop) && /AGENT_RX|agent2\(_\[A-Za-z0-9\]\+\)\?\\\.js/.test(loop), 'the supervisor loop checks the account\'s scripts before treating a brain character as moved');
}

// ================================================================== D. attach_agent.js --all / --back (mock MCP)
async function partD() {
  console.log('D. attach_agent.js --all / --back (mock MCP)');
  const root = mkTmp('attach_all_');
  for (const d of ['Scripts', 'Logs', path.join('Scripts', 'data'), path.join('Dashboard', 'brain_host')]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.copyFileSync(path.join(BH, 'supervise.js'), path.join(root, 'Dashboard', 'brain_host', 'supervise.js'));
  fs.writeFileSync(path.join(root, 'Scripts', 'agent2.js'), '// agent\n');
  fs.writeFileSync(path.join(root, 'Scripts', 'data', 'brain_host.json'), JSON.stringify({ on: true, allowAll: true, allow: [], except: ['Kept'] }));
  fs.writeFileSync(path.join(root, 'swarm.config.json'), JSON.stringify({ accounts: [{ login: 'a', character: 'Alpha', party: 'Alpha' }, { login: 'b', character: 'Beta', party: 'Alpha' }, { login: 'c', character: 'Moved', party: 'Alpha' }, { login: 'k', character: 'Kept', party: 'Alpha' }] }));
  const stats = path.join(root, 'Logs', 'brain_host_stats.json'); fs.writeFileSync(stats, '{}');
  const accts = { Alpha: [{ name: 'swarm.js', enabled: true }], Beta: [{ name: 'swarm.js', enabled: true }, { name: 'agent2.js', enabled: false }], Moved: [{ name: 'swarm.js', enabled: false }, { name: 'agent2_Moved.js', enabled: true }], Kept: [{ name: 'swarm.js', enabled: true }] };
  const calls = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => {
    const m = JSON.parse(b); let out = {};
    if (m.method === 'tools/call') {
      const ar = m.params.arguments, list = accts[ar.account_name] || null; calls.push(ar.account_name + ' ' + ar.action + ' ' + (ar.script_name || ar.file_name || ''));
      if (!list) out = { text: 'No account matches' };
      else if (ar.action === 'list') out = { scripts: list.map(x => Object.assign({}, x)) };
      else if (ar.action === 'stop' || ar.action === 'start') {
        const sc = list.find(x => x.name === ar.script_name);
        if (sc) sc.enabled = ar.action === 'start';
        if (ar.action === 'start' && list.filter(x => x.enabled && /^(swarm\.js|agent2.*)$/.test(x.name)).length > 1) calls.push('TWO DRIVERS ' + ar.account_name);
        out = { ok: !!sc };
      } else if (ar.action === 'create') { const p = path.join(root, 'Scripts', ar.file_name); fs.writeFileSync(p, ar.source); list.push({ name: ar.file_name, enabled: false }); out = { script_name: ar.file_name }; }
    }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(out) }] } }));
  }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const tool = path.join(__dirname, 'attach_agent.js'), base = ['--root', root, '--mcp', 'http://127.0.0.1:' + srv.address().port, '--gap', '10'];
  const run = (args) => new Promise(r => cp.execFile(process.execPath, [tool].concat(args, base), (e, so, se) => r({ code: e ? e.code : 0, out: String(so) + String(se) })));
  let r = await run(['--all']);
  ok(r.code === 0 && /DRY RUN/.test(r.out) && accts.Alpha[0].enabled && /summary: .*would be\) 2/.test(r.out), `--all dry run changes nothing and counts 2 to move (${(r.out.match(/summary:.*/) || [''])[0]})`);
  fs.utimesSync(stats, new Date(Date.now() - 120000), new Date(Date.now() - 120000));
  r = await run(['--all', '--apply']);
  ok(r.code === 2 && /pool is not running/.test(r.out) && accts.Alpha[0].enabled, '--apply refuses while the brain pool is not running (moved characters would have no driver)');
  fs.writeFileSync(stats, '{}');
  r = await run(['--all', '--apply']);
  ok(r.code === 0, '--all --apply: exit 0' + (r.code ? ' — ' + r.out.slice(0, 600) : ''));
  ok(!accts.Alpha[0].enabled && accts.Alpha.some(x => x.name === 'agent2_Alpha.js' && x.enabled), 'Alpha: swarm.js stopped, its own agent2_Alpha.js created + started');
  ok(!accts.Beta[0].enabled && accts.Beta[1].enabled && !calls.some(c => /^Beta create/.test(c)), 'Beta (agent attached, off): swarm.js stopped, the agent started, nothing created');
  ok(!calls.some(c => /^Moved (stop|start|create)/.test(c)), 'Moved (already on the agent): left alone');
  ok(accts.Kept[0].enabled && !calls.some(c => /^Kept/.test(c)), '"except": Kept is not touched (stays on swarm.js)');
  ok(!calls.some(c => /TWO DRIVERS/.test(c)), 'never two drivers on one account');
  const iStop = calls.indexOf('Alpha stop swarm.js'), iList = calls.indexOf('Alpha list ', iStop + 1), iCreate = calls.findIndex(c => /^Alpha create/.test(c));
  ok(iStop >= 0 && iList > iStop && iCreate > iList, 'Alpha: stop swarm.js -> list again (checked stopped) -> only then the agent');
  r = await run(['--names', 'Kept', '--apply']);
  ok(r.code === 1 && /NOT a brain character/.test(r.out) && accts.Kept[0].enabled, '--names with a character the config keeps out of the brain: refused (its agent would be turned away)');
  r = await run(['--back', '--names', 'Alpha', '--apply']);
  ok(r.code === 0 && accts.Alpha[0].enabled && !accts.Alpha.some(x => /agent2/.test(x.name) && x.enabled) && /still puts it in the brain/.test(r.out), '--back: agent stopped (checked), swarm.js started, and it says to take Alpha out of brain_host.json');
  srv.close(); try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { }
}

// ================================================================== E. engine_default.js --migrate (update.ps1)
function partE() {
  console.log('E. engine_default.js --migrate (update.ps1)');
  const tool = path.join(__dirname, 'engine_default.js');
  const mk = (bh) => {
    const root = mkTmp('engine_mig_'); fs.mkdirSync(path.join(root, 'Scripts', 'data'), { recursive: true }); fs.mkdirSync(path.join(root, 'Dashboard', 'brain_host'), { recursive: true });
    fs.copyFileSync(path.join(BH, 'supervise.js'), path.join(root, 'Dashboard', 'brain_host', 'supervise.js'));
    fs.writeFileSync(path.join(root, 'swarm.config.json'), JSON.stringify({ accounts: ACC }));
    if (bh !== undefined) fs.writeFileSync(path.join(root, 'Scripts', 'data', 'brain_host.json'), typeof bh === 'string' ? bh : JSON.stringify(bh, null, 1));
    return root;
  };
  const runM = (root) => cp.execFileSync(process.execPath, [tool, '--migrate', '--root', root], { encoding: 'utf8' });
  const bhOf = (root) => { try { return JSON.parse(read(path.join(root, 'Scripts', 'data', 'brain_host.json'))); } catch (e) { return null; } };
  let root = mk({ _readme: 'New engine (Dashboard/brain_host ...', on: false, allow: [], bridge: true, pool: true });
  let out = runM(root), j = bhOf(root);
  ok(/^MIGRATED/m.test(out) && j.on === true && j.allowAll === true && /STATUS: new engine ON .* 3 of 3/.test(out), `old default -> migrated: ${out.trim().split(/\r?\n/).join(' | ')}`);
  out = runM(root);
  ok(/^KEPT/m.test(out), 'a second update keeps it (it has "allowAll" now)');
  const own = { on: true, allow: ['Lead'], bridge: true, pool: true };
  root = mk(own); out = runM(root);
  ok(/^KEPT/m.test(out) && JSON.stringify(bhOf(root)) === JSON.stringify(own), 'a user\'s own list is kept byte for byte');
  root = mk({ on: false, allowAll: true }); out = runM(root);
  ok(/^KEPT/m.test(out) && bhOf(root).on === false && /OFF/.test(out), 'switched off by the user (on:false + allowAll key) stays off');
  root = mk('{ "on": false, '); out = runM(root);
  ok(/^KEPT/m.test(out) && read(path.join(root, 'Scripts', 'data', 'brain_host.json')) === '{ "on": false, ', 'unreadable file: not touched');
}

// ================================================================== F. engine_mode.ps1 (PowerShell twin)
function partF() {
  console.log('F. engine_mode.ps1 (SETUP / new_account.ps1)');
  const ps1 = path.join(__dirname, 'engine_mode.ps1');
  if (process.platform !== 'win32') { ok(fs.existsSync(ps1), 'engine_mode.ps1 exists (PowerShell checks only on Windows)'); return; }
  const root = mkTmp('engine_ps_'); fs.mkdirSync(path.join(root, 'Scripts', 'data'), { recursive: true });
  const bhF = path.join(root, 'Scripts', 'data', 'brain_host.json');
  const ps = (bh, expr) => {
    if (bh === null) { try { fs.unlinkSync(bhF); } catch (e) { } } else fs.writeFileSync(bhF, typeof bh === 'string' ? bh : JSON.stringify(bh));
    const cmd = `. '${ps1.replace(/'/g, "''")}'; $bh = Read-BrainHost '${root.replace(/'/g, "''")}'; $r = @('Lead','Heal','Solo'); ${expr}`;
    try { return cp.execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { encoding: 'utf8', timeout: 60000 }).trim(); } catch (e) { return 'ERROR ' + String(e.stderr || e.message).slice(0, 200); }
  };
  const all = { on: true, allowAll: true, allow: ['Guest'], except: ['Solo'] };
  const out = ps(all, "@((Test-BrainChar $bh 'Heal' $r), (Test-BrainChar $bh 'Solo' $r), (Test-BrainChar $bh 'Guest' $r), (Test-BrainChar $bh 'Newbie' $r), (Test-BrainChar $bh 'Newbie' $r -Adding), (Test-BrainChar $bh 'heal' $r)) -join ','");
  const js = ['Heal', 'Solo', 'Guest', 'Newbie'].map(n => S.isBrainChar(n, all, ACC)).concat([S.isBrainChar('Newbie', all, ACC, { adding: true }), S.isBrainChar('heal', all, ACC)]).map(v => v ? 'True' : 'False').join(',');
  ok(out === js, `the PowerShell rule = the JS rule (ps ${out} / js ${js})`);
  ok(ps({ on: false, allowAll: true }, "Test-BrainChar $bh 'Heal' $r") === 'False' && ps({ on: true, allow: ['Heal'] }, "Test-BrainChar $bh 'Heal' $r") === 'True', 'off -> no; explicit list -> yes');
  ok(ps('{ broken', "if ($null -eq (Test-BrainChar $bh 'Heal' $r)) { 'null' } else { 'x' }") === 'null', 'unreadable brain_host.json -> $null (SETUP then leaves every driver as it is)');
  ok(ps(all, "(Convert-EngineScripts @('mkchar_a.js','swarm.js') $true) -join ','") === 'mkchar_a.js,agent2.js' && ps(all, "(Convert-EngineScripts @('agent2_Heal.js') $false) -join ','") === 'swarm.js', 'Convert-EngineScripts = engineScripts');
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { }
}

// ================================================================== H. SETUP.ps1 dry run in a sandbox (account configs: one driver each)
function partH() {
  console.log('H. SETUP.ps1 dry run in a sandbox');
  const setup = path.join(ROOT, 'SETUP.ps1');
  if (process.platform !== 'win32' || !fs.existsSync(setup)) { ok(true, 'SETUP.ps1 sandbox: skipped (not Windows / no SETUP.ps1)'); return; }
  const sb = mkTmp('engine_setup_');
  for (const d of ['docs/plan/tools', 'Settings', 'Scripts/data', 'Scripts_dev']) fs.mkdirSync(path.join(sb, d), { recursive: true });
  fs.copyFileSync(setup, path.join(sb, 'SETUP.ps1'));
  for (const f of ['engine_mode.ps1', 'new_account.ps1']) fs.copyFileSync(path.join(__dirname, f), path.join(sb, 'docs', 'plan', 'tools', f));
  const sc = (en, name) => `<Script><IsEnabled>${en}</IsEnabled><guid>${name}-g</guid><Name>${name}</Name><Path>C:\\elsewhere\\Scripts\\${name}</Path></Script>`;
  const xml = (login, ch, scripts) => `<?xml version="1.0" encoding="utf-8"?>\r\n<Option>\r\n  <Name>${login}</Name>\r\n  <SelectedCharacter>${ch}</SelectedCharacter>\r\n  <Group>Party Lead</Group>\r\n  <ScriptsList>${scripts}</ScriptsList>\r\n</Option>\r\n`;
  fs.writeFileSync(path.join(sb, 'Settings', 'L1.xml'), xml('l1', 'Lead', sc('true', 'swarm.js')));                                  // not moved yet
  fs.writeFileSync(path.join(sb, 'Settings', 'L2.xml'), xml('l2', 'Heal', sc('false', 'swarm.js') + sc('true', 'agent2_Heal.js')));   // moved
  fs.writeFileSync(path.join(sb, 'Settings', 'L3.xml'), xml('l3', 'Solo', sc('false', 'swarm.js') + sc('true', 'agent2_Solo.js')));   // moved, now "except"
  fs.writeFileSync(path.join(sb, 'swarm.config.json'), JSON.stringify({ server: {}, scripts: ['swarm.js'], accounts: [
    { login: 'l1', character: 'Lead', party: 'Lead', role: 'sk', config: 'L1.xml' }, { login: 'l2', character: 'Heal', party: 'Lead', role: 'bishop', config: 'L2.xml' },
    { login: 'l3', character: 'Solo', party: 'Lead', role: 'destroyer', config: 'L3.xml' }] }));
  fs.writeFileSync(path.join(sb, 'Scripts', 'data', 'brain_host.json'), JSON.stringify({ on: true, allowAll: true, allow: [], except: ['Solo'] }));
  let out = '';
  try { out = cp.execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(sb, 'SETUP.ps1'), '-SkipTasks'], { cwd: sb, encoding: 'utf8', timeout: 120000 }); }
  catch (e) { out = String(e.stdout || '') + String(e.stderr || e.message); }
  const line = (f) => (out.split(/\r?\n/).find(l => l.includes('Settings\\' + f)) || '');
  ok(/new engine: ON for 2 of 3 characters/.test(out), 'SETUP says which characters the new engine drives');
  ok(/swarm\.js OFF/.test(line('L1.xml')) && /Script agent2\.js added/.test(line('L1.xml')), `Lead (not moved): swarm.js off + agent2.js added (${line('L1.xml').replace(/^.*?\): /, '').slice(0, 160)})`);
  ok(!/OFF|ON|added/.test(line('L2.xml')), 'Heal (already on its agent): drivers untouched');
  ok(/agent2_Solo\.js OFF/.test(line('L3.xml')) && /swarm\.js ON again/.test(line('L3.xml')), 'Solo ("except"): agent off, swarm.js on again');
  ok(/DRY RUN/.test(out) && read(path.join(sb, 'Settings', 'L1.xml')).includes('<IsEnabled>true</IsEnabled><guid>swarm.js-g'), 'dry run: nothing written');
  try { fs.rmSync(sb, { recursive: true, force: true }); } catch (e) { }
}

// ================================================================== G. wiring + docs
function partG() {
  console.log('G. wiring + docs');
  const srv = read(path.join(ROOT, 'Dashboard', 'server.js'));
  ok(/BHS\.readCfg\(raw, bhLastCfg, bhRoster\(\)\)/.test(srv) && /'--roster'/.test(srv), 'server.js: brain_host.json is read with the roster (allowAll) and the pool gets --roster');
  ok(/url\.pathname === '\/api\/engine'/.test(srv) && /attach_agent\.js/.test(srv) && /'--all'/.test(srv), 'server.js: /api/engine runs attach_agent.js --all (check / move)');
  ok(/BHS\.connectedNames\(/.test(srv), 'server.js: L2Swarm MB per character counts only characters whose agent is really connected');
  const pool = read(path.join(BH, 'pool.js'));
  ok(/allowAll/.test(pool) && /--roster/.test(pool), 'pool.js: allowAll + --roster');
  const html = read(path.join(ROOT, 'Dashboard', 'index.html'));
  ok(/data-eng="move"/.test(html) && /\/api\/engine/.test(html) && !/[^.\w]confirm\(/.test(html.slice(html.indexOf('async function loadEngine'), html.indexOf('async function loadEngine') + 4000)), 'dashboard PC tab: New engine box with Check / Move (styled dialog, no confirm())');
  const setup = read(path.join(ROOT, 'SETUP.ps1'));
  ok(/engine_mode\.ps1/.test(setup) && /Test-BrainChar/.test(setup) && /Convert-EngineScripts/.test(setup), 'SETUP.ps1: account configs get agent2.js (brain) or swarm.js (old engine), one driver each');
  const na = read(path.join(__dirname, 'new_account.ps1'));
  ok(/engine_mode\.ps1/.test(na) && /Test-BrainChar/.test(na), 'new_account.ps1: -Scripts swarm.js becomes agent2.js for a brain character');
  const add = read(path.join(ROOT, 'Dashboard', 'addaccount_api.js'));
  ok(/engineScripts\(/.test(add) && /adding: true/.test(add), 'dashboard "+ Add account": the new account gets agent2.js when the engine is on for it');
  const upd = [path.join(ROOT, 'release', 'src', 'update.ps1'), path.join(ROOT, 'update.ps1')].map(read).find(t => t) || '';
  ok(/engine_default\.js/.test(upd) && /--migrate/.test(upd) && /restart the dashboard/i.test(upd) && /attach_agent\.js --all/.test(upd), 'update.ps1: migrates the untouched old default + tells the user to restart the dashboard and move the accounts');
  ok(/Backup 'Scripts\\data\\brain_host\.json'/.test(upd),'update.ps1: backs up brain_host.json before the migration');
  const rb = read(path.join(__dirname, 'release_build.js'));
  if (rb) ok(/case 'brain_host\.json':[^\n]*newDefault/.test(rb), 'release_build.js: the package ships brain_host.example.json = the new default (on + allowAll)');
  else ok(true, 'release_build.js not in this tree (package): skipped');
  const inst = read(path.join(ROOT, 'docs', 'plan', 'INSTALL.md'));
  ok(/allowAll/.test(inst) && /attach_agent\.js --all/.test(inst) && /"on": false/.test(inst), 'INSTALL.md documents the default, the move and the switch back');
}

(async () => {
  const t0 = Date.now();
  partA();
  try { await partB(); } catch (e) { ok(false, 'B threw: ' + (e && e.stack || e)); }
  partC();
  try { await partD(); } catch (e) { ok(false, 'D threw: ' + (e && e.stack || e)); }
  try { partE(); } catch (e) { ok(false, 'E threw: ' + (e && e.stack || e)); }
  try { partF(); } catch (e) { ok(false, 'F threw: ' + (e && e.stack || e)); }
  try { partH(); } catch (e) { ok(false, 'H threw: ' + (e && e.stack || e)); }
  partG();
  console.log(`\n${pass} passed, ${fail} failed (${Math.round((Date.now() - t0) / 1000)} s)`);
  process.exit(fail ? 1 : 0);
})();
