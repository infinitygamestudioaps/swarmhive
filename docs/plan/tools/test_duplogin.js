// DUPLOGIN-2026-11-12 guard (engine.md R10, owner: "Nuker29 and Nuker25 relogin over and over ... FIX"): one config opened twice in L2Swarm
// (C:\l2\... and C:\RainbowControl\... = the same file through the C:\L2 junction) -> the start task's login check logged the second entry in and the
// two kicked each other every ~12 s for 13 h. Reads the scripts only.
const fs = require('fs'), path = require('path');
const T = path.join(__dirname);
const ctl = fs.readFileSync(path.join(T, 'l2swarm_ctl.ps1'), 'utf8'), dup = fs.readFileSync(path.join(T, 'close_dup_accounts.ps1'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const i0 = ctl.indexOf('$missing = @($accs | Where-Object'), i1 = ctl.indexOf("Mcp 'manage_account_config' @{ account_id = $a.account_id; action = 'load'");
const blk = ctl.slice(i0, i1);
ok(i0 > 0 && i1 > i0, 'the start login check exists');
ok(/\$inByFile\[\[IO\.Path\]::GetFileName\(\[string\]\$a\.config_path\)\.ToLower\(\)\] = \$true/.test(blk) && /\$a\.is_logged_in/.test(blk), 'it knows which config FILES are in game (by file name, any path spelling)');
ok(/\$missing = @\(\$missing \| Where-Object \{ -not \$inByFile\[/.test(blk), 'an entry whose config file is in game in another entry is never logged in (no ping-pong)');
ok(/is a DUPLICATE entry/.test(blk), 'such a duplicate is named in l2swarm_ctl.log');
// the keep / close choice of the tool, replayed in node
const pick = (g) => { const k = g.filter(a => a.is_logged_in)[0] || g[0]; return g.filter(a => a !== k).map(a => a.account_id); };
const g6 = [{ account_id: 'acc-082a', config_path: 'C:\L2Swarm\Settings\Mylogin87.xml', is_logged_in: true }, { account_id: 'acc-19c7', config_path: 'C:\RainbowControl\l2\L2Swarm\Settings\Mylogin87.xml', is_logged_in: false }];
ok(JSON.stringify(pick(g6)) === '["acc-19c7"]', 'replay mylogin87: the logged-in entry stays, the other is closed');
ok(/Group-Object \{ \[IO\.Path\]::GetFileName\(\[string\]\$_\.config_path\)\.ToLower\(\) \}/.test(dup) && /Where-Object \{ \$_\.is_logged_in \} \| Select-Object -First 1/.test(dup) && /\[switch\]\$DryRun/.test(dup), 'close_dup_accounts.ps1 groups by file name, keeps the logged-in entry, has a dry run');
console.log(`\ntest_duplogin: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
