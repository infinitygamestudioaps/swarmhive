// DASHRESTART-2026-10-23 (public tester: "restarted dashboard — it didn't actually restart, it just stopped"): the Restart button's successor.
//  1) the old successor (cmd /c "ping & "<node>" server.js") is gone; /api/dashboard restart calls dashSpawnSuccessor
//  2) the REAL launcher (dashSuccessorSrc, run by node -e exactly as the dashboard spawns it) waits while the port is busy and loads the script
//     once the old process let go of the port — with a scratch "server" in a folder whose path has spaces (like C:\Program Files)
//   node docs/plan/tools/test_dash_restart.js     (never touches the real dashboard: a random free port, a temp folder)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x !== undefined ? ' — ' + x : '')); } };
const a = src.indexOf('// DASHRESTART-BEGIN'), b = src.indexOf('// DASHRESTART-END');
ok(a > 0 && b > a, 'DASHRESTART block present in Dashboard/server.js');
ok(!/ping -n 4 127\.0\.0\.1 >nul & /.test(src), 'the cmd /c "ping & node" successor is gone');
const api = src.slice(src.indexOf("url.pathname === '/api/dashboard'"), src.indexOf("url.pathname === '/api/dashboard'") + 2500);
ok(/dashSpawnSuccessor\(PORT, path\.join\(__dirname, 'server\.js'\)/.test(api) && /process\.exit\(0\)/.test(api), '/api/dashboard restart spawns the successor, then exits');
const K = new Function('fs', 'path', 'require', 'process', src.slice(a, b) + '\nreturn { dashSuccessorSrc, dashSpawnSuccessor };')(fs, path, require, process);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash restart '));          // a space in the path on purpose
  const flag = path.join(dir, 'started.txt'), script = path.join(dir, 'fake server.js'), log = path.join(dir, 'restart.log');
  fs.writeFileSync(script, `require('fs').writeFileSync(${JSON.stringify(flag)}, 'up ' + process.cwd()); setTimeout(() => process.exit(0), 200);`);
  const old = net.createServer(() => { }); await new Promise(r => old.listen(0, '127.0.0.1', r));
  const port = old.address().port;
  const child = K.dashSpawnSuccessor(port, script, log);
  ok(child && child.pid > 0, 'successor spawned (node -e, detached)');
  await new Promise(r => setTimeout(r, 2500));
  ok(!fs.existsSync(flag), 'while the old process holds the port the successor waits');
  old.close();
  let up = false; for (let i = 0; i < 40 && !up; i++) { await new Promise(r => setTimeout(r, 250)); up = fs.existsSync(flag); }
  ok(up, 'the port is free -> the successor loads the server script');
  ok(up && fs.readFileSync(flag, 'utf8').indexOf(dir) >= 0, 'it runs in the script\'s folder (paths with spaces work)', up ? fs.readFileSync(flag, 'utf8') : '');
  ok(fs.existsSync(log) && /successor: port \d+ free/.test(fs.readFileSync(log, 'utf8')), 'its output goes to the restart log');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
