// OFFLINE TEST of PKGDEPLOY-2026-11-11 (testers, Discord #swarmhive 2026-11-11: "It doesn't look like it did any of the things it's telling you
// that it did"; "this warehouse crystallize / sell clean up also never runs anymore ... Run now button says it gave the order but nothing happens").
// Cause: the public package never ships docs\requirements, so deploy_swarm.ps1's requirement gate failed (exit 7) on EVERY tester install since
// v1.8.12 (2026-10-21): update.ps1 deployed Scripts_dev\swarm.js only when L2Swarm was NOT running; otherwise the bots kept the old script
// while the dashboard was new.
//   node docs/plan/tools/test_pkg_deploy.js        (exit code 1 when a check fails)
// 1) deploy_swarm.ps1 run for real in a temp folder shaped like a package install (no docs\requirements): it deploys
// 2) the same with docs\requirements present and a broken index: it still refuses (the owner's gate is unchanged)
// 3) update.ps1 (release\src) retries a deploy refused for the moment and says loudly when the bots still run the old script
// 4) release_build: docs\requirements is not shipped (so 1 is the tester's case) and deploy_swarm.ps1 is
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const DEPLOY = fs.readFileSync(path.join(__dirname, 'deploy_swarm.ps1'), 'utf8');

function fakeInstall(withReq) {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'pkgdeploy-'));
  ['Scripts_dev', 'Scripts', 'Logs', 'docs/plan/tools'].forEach(d => fs.mkdirSync(path.join(r, d), { recursive: true }));
  fs.writeFileSync(path.join(r, 'Scripts_dev', 'swarm.js'), '// new\nconst v = 2;\n');
  fs.writeFileSync(path.join(r, 'Scripts', 'swarm.js'), '// old\nconst v = 1;\n');
  fs.copyFileSync(path.join(__dirname, 'deploy_swarm.ps1'), path.join(r, 'docs/plan/tools/deploy_swarm.ps1'));
  fs.copyFileSync(path.join(__dirname, 'requirements_check.js'), path.join(r, 'docs/plan/tools/requirements_check.js'));
  fs.copyFileSync(path.join(__dirname, 'clean_update.ps1'), path.join(r, 'docs/plan/tools/clean_update.ps1'));
  if (withReq) { fs.mkdirSync(path.join(r, 'docs/requirements'), { recursive: true }); fs.writeFileSync(path.join(r, 'docs/requirements/index.json'), '{ broken'); }
  return r;
}
// SAFETY: L2Swarm really runs on the owner's PC -> every run says "not running" (PKGDEPLOY_L2_RUNNING=0) or is a dry run (PKGDEPLOY_DRY=1);
// clean_update.ps1 also refuses to act for real in a folder without L2Swarm.exe
function runDeploy(r, env) {
  const p = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(r, 'docs/plan/tools/deploy_swarm.ps1')], { encoding: 'utf8', timeout: 120000, env: Object.assign({}, process.env, env || { PKGDEPLOY_L2_RUNNING: '0' }) });
  return { code: p.status, out: (p.stdout || '') + (p.stderr || ''), live: fs.readFileSync(path.join(r, 'Scripts', 'swarm.js'), 'utf8') };
}
const rm = (r) => { try { fs.rmSync(r, { recursive: true, force: true }); } catch (e) { } };

// ---- 1) package install: deploys ------------------------------------------------------------------------------------------------------
console.log('-- 1) a package install (no docs\\requirements)');
{ const r = fakeInstall(false), d = runDeploy(r);
  check(d.code === 0 && /const v = 2/.test(d.live), `deploy_swarm.ps1 deploys Scripts_dev -> Scripts (exit ${d.code}${d.code ? ': ' + d.out.split('\n').filter(l => /ABORT|requirement/i.test(l)).join(' | ') : ''})`);
  check(/requirements: none on this install/.test(d.out), 'it says the install has no requirement files');
  rm(r); }
// CLEANUPDATE: a package install with L2Swarm running (dry run: only logged) = stop everything, copy, finisher started
{ const r = fakeInstall(false), d = runDeploy(r, { PKGDEPLOY_L2_RUNNING: '1', PKGDEPLOY_DRY: '1' });
  const logf = path.join(r, 'Logs', 'clean_update.log'), t0 = Date.now();
  let lg = ''; while (Date.now() - t0 < 30000) { try { lg = fs.readFileSync(logf, 'utf8'); } catch (e) { } if (/finish: bot script check/.test(lg)) break; cp.spawnSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 700']); }
  check(d.code === 0 && /const v = 2/.test(d.live) && /DEPLOYED \(package, clean/.test(d.out), `L2Swarm running on a package install: closed first, then the script copied (exit ${d.code})`);
  check(/dry: would run the L2Swarm Stop task/.test(lg) && /stop: closed \d+ node process/.test(lg), 'clean_update stop: L2Swarm Stop task + every node of the install');
  check(/dry: would start the dashboard and L2Swarm/.test(lg) && /finish: bot script check OK/.test(lg), 'the finisher starts the dashboard and L2Swarm again and checks the script');
  rm(r); }
{ const r = fakeInstall(false);
  const p = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(r, 'docs/plan/tools/clean_update.ps1'), '-Action', 'stop'], { encoding: 'utf8', timeout: 60000, env: Object.assign({}, process.env, { PKGDEPLOY_L2_RUNNING: '1' }) });
  check(p.status === 1 && /REFUSED - .* has no L2Swarm\.exe/.test(p.stdout || ''), 'safety: clean_update refuses to stop anything for real in a folder without L2Swarm.exe');
  rm(r); }
{ const dp = DEPLOY;
  check(/clean_update\.ps1" -Action stop/.test(dp) && /-Action', 'finish', '-WaitPid'/.test(dp) && /update\\\.ps1/.test(dp), 'deploy_swarm: package + L2Swarm running = clean stop, copy, finisher waits for the calling update.ps1 (an OLD updater too)'); }

// ---- 2) the owner's install: the gate still refuses ----------------------------------------------------------------------------------------
console.log('-- 2) docs\\requirements present (the owner\'s install)');
{ const r = fakeInstall(true), d = runDeploy(r);
  check(d.code === 7 && /const v = 1/.test(d.live), `a broken requirement index still refuses the deploy (exit ${d.code}), the live script is untouched`);
  rm(r); }
check(/if \(Test-Path "\$root\\docs\\requirements\\index\.json"\)/.test(DEPLOY) && /-Force does NOT skip this/.test(DEPLOY), 'source: the gate is skipped ONLY when docs\\requirements\\index.json is missing (never by -Force)');

// ---- 3) update.ps1 ---------------------------------------------------------------------------------------------------------------------
console.log('-- 3) update.ps1');
{ const up = fs.readFileSync(path.join(ROOT, 'release', 'src', 'update.ps1'), 'utf8');
  check(/@\(2, 4, 5, 8\) -contains \$LASTEXITCODE/.test(up) && /AddMinutes\(10\)/.test(up), 'a deploy refused for the moment (gap / fight / logins / busy) is retried for up to 10 minutes');
  check(/YOUR BOTS STILL RUN THE OLD SCRIPT/.test(up) && /deploy_swarm\.ps1 -Force/.test(up), 'a deploy that never happened is said in red with the command that finishes it');
  // CLEANUPDATE-2026-11-11 (owner: "force close of all swarm and nodes so it can update correctly"). Source checks only: a real run on
  // this PC would stop the owner's L2Swarm (Get-Process L2Swarm finds any running one)
  const at = (s) => up.indexOf(s);
  check(/StopEverything\s*\n\s*& git reset --hard \$new/.test(up), 'git update: everything is closed right before the files are replaced');
  check(/StopEverything\s*\n\s*foreach \(\$rel in \$files\)/.test(up), 'zip update: everything is closed right before the files are copied');
  check(/schtasks \/run \/tn 'L2Swarm Stop'/.test(up) && /l2swarm_stopped\.flag/.test(up), 'L2Swarm is closed through its Stop task (MemWatch does not restart it meanwhile), else killed with the stopped flag set');
  check(/could not be closed - NOTHING was changed/.test(up) && at('NOTHING was changed') < at('& git reset --hard $new'), 'L2Swarm that cannot be closed = the update stops before anything is changed');
  check(/taskkill \/PID \$id \/T \/F/.test(up) && /ParentProcessId/.test(up) && /brain_host\|geopath_service\|pool\\\.js/.test(up), 'every node process of the install is closed with its whole tree (dashboard port owner, children, left-over brain host / path finder)');
  check(/function StartEverything/.test(up) && /\[void\]\(KillOurNodes\)/.test(up) && /schtasks \/run \/tn 'L2Swarm Start'/.test(up) && /Dashboard\\start\.cmd/.test(up), 'afterwards: old-code nodes closed again, dashboard started, L2Swarm started again when it ran before');
  check(/bot script check: Scripts\\swarm\.js is the new version/.test(up) && /bot script check FAILED/.test(up), 'the live script is checked against the new one at the end (green / red)');
  check(/older script than this version/.test(up) && (up.match(/older script than this version/g) || []).length >= 2, 'an install that is up to date but runs an older script loads it too (git and zip paths)');
  check(!/\$Live/.test(up), 'no update without stopping (owner: "It should stop everything and update"): there is no -Live way');
  const ka = fs.readFileSync(path.join(__dirname, 'dashboard_keepalive.ps1'), 'utf8');
  check(/update_running\.flag/.test(ka) && /TotalMinutes -lt 30/.test(ka) && /update_running\.flag/.test(up), 'the dashboard keep-alive task does not start the old dashboard while an update runs (flag < 30 min)'); }

// ---- 4) the package -------------------------------------------------------------------------------------------------------------------
console.log('-- 4) release_build');
{ const rb = fs.readFileSync(path.join(__dirname, 'release_build.js'), 'utf8');
  check(!/\['docs\/requirements'/.test(rb), 'docs\\requirements is not a shipped folder (the tester case of 1)');
  const pk = path.join(ROOT, 'release', 'package');
  if (fs.existsSync(path.join(pk, 'docs', 'plan', 'tools'))) check(!fs.existsSync(path.join(pk, 'docs', 'requirements', 'index.json')) && fs.existsSync(path.join(pk, 'docs', 'plan', 'tools', 'deploy_swarm.ps1')), 'the built package: deploy_swarm.ps1 shipped, docs\\requirements not'); }

console.log(`\n${n - fails}/${n} checks OK`);
process.exit(fails ? 1 : 0);
