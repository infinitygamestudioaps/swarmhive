// L2EXE2-2026-11-11 guard (engine.md R9, owner: "make sure that ALL accounts work in game"):
// 103 of 112 account configs had an empty <L2ExePath />, so the dashboard's "Client: In game" switch / L2Swarm's Hook refused them.
// Cause: new_account.ps1 read swarm.config.json "l2Client" at the TOP level, but the field lives at paths.l2Client; SETUP.ps1 only
// filled the path for accounts already marked 'ingame'. This test runs the real new_account.ps1 read line against a temp config and
// checks SETUP.ps1 + the repair tool. Never touches Settings\ or L2Swarm.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };

// 1) new_account.ps1: the client path comes from paths.l2Client
const na = fs.readFileSync(path.join(ROOT, 'docs/plan/tools/new_account.ps1'), 'utf8');
const line = (na.split(/\r?\n/).find(l => /\$cli = ''; try \{/.test(l)) || '').trim();
ok(/paths\.l2Client/.test(line), 'new_account.ps1 reads paths.l2Client');
if (line) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'l2exe-'));
  const fake = path.join(tmp, 'l2.exe'); fs.writeFileSync(fake, '');
  const run = (cfg) => {
    fs.writeFileSync(path.join(tmp, 'swarm.config.json'), JSON.stringify(cfg));
    const ps = `$root = '${tmp.replace(/'/g, "''")}'\n${line}\nWrite-Output "CLI=$cli"`;
    const f = path.join(tmp, 't.ps1'); fs.writeFileSync(f, ps);
    return String(cp.execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f])).trim();
  };
  ok(run({ paths: { l2Client: fake } }) === 'CLI=' + fake, 'paths.l2Client (the real layout) is used for a new account');
  ok(run({ l2Client: fake }) === 'CLI=' + fake, 'an old top-level l2Client still works');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 2) SETUP.ps1 fills an existing empty node for EVERY account, not only 'ingame' ones
const setup = fs.readFileSync(path.join(ROOT, 'SETUP.ps1'), 'utf8');
const sl = (setup.split(/\r?\n/).find(l => /& \$set 'L2ExePath'/.test(l)) || '');
ok(/\$exeNode\)\)/.test(sl) && !/\$exeNode\.InnerText\)/.test(sl), 'SETUP.ps1 sets L2ExePath where the node exists, also when it is empty');
ok(/Test-Path \$l2Client/.test(sl), 'SETUP.ps1 only writes a client path that exists');

// 3) the repair tool exists and never edits Password nodes; open accounts go through L2Swarm (no logout)
const fix = fs.readFileSync(path.join(ROOT, 'docs/plan/tools/set_l2exe_all.ps1'), 'utf8');
ok(/manage_account_config/.test(fix) && /action = 'modify'/.test(fix) && /action = 'save'/.test(fix), 'set_l2exe_all.ps1: open accounts via MCP modify + save');
ok(!/Password\s*=/.test(fix) && !/SelectSingleNode\('Password'\)/.test(fix), 'set_l2exe_all.ps1 never writes a Password');
ok(/_l2exe/.test(fix) && /Copy-Item/.test(fix), 'set_l2exe_all.ps1 backs every config up first');
ok(/UTF8Encoding\(\$false\)/.test(fix), 'set_l2exe_all.ps1 keeps a UTF-8 file that declares utf-16 readable (no XmlDocument.Load)');

// 4) a locked PC never gets a Hook (l2.exe: "No Direct3D adapters found" after the OOG session was already logged out)
const cm = fs.readFileSync(path.join(ROOT, 'docs/plan/tools/client_mode.ps1'), 'utf8');
const hk = cm.slice(cm.indexOf('function HookCharacter'), cm.indexOf("Mcp 'manage_hook'", cm.indexOf('function HookCharacter')));
ok(/NoScreenReason/.test(hk) && /return \$false/.test(hk.slice(hk.indexOf('NoScreenReason'))), 'client_mode.ps1 refuses the Hook without a usable screen (before manage_hook)');
const ns = cm.slice(cm.indexOf('function NoScreenReason'), cm.indexOf('function FindAll'));
ok(/SessionId -eq \$sid/.test(ns), 'only a lock screen in L2Swarm\'s OWN session counts (owner on RDP: the console session shows one all the time)');
ok(/Disc/.test(ns), 'a disconnected RDP session counts as no screen');

console.log(`\ntest_l2exe_path: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
