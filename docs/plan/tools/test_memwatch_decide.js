// MEMWATCH: restart L2Swarm ONLY when the PC is really out of memory (MEMPAGEFILE-2026-11-10; requirement docs/requirements/memwatch.md).
// Tester Vykaax 2026-11-09 14:20: "RESTART L2Swarm private=4849MB ... pcfree=11572MB commitfree=2831MB" - a small pagefile made the old
// absolute rule (free commit < 3000 MB) restart a PC with 11.5 GB RAM free. Owner: "never restart if we are not utterly out of memory".
//   A  MemWatchDecide (docs/plan/tools/memwatch_decide.ps1, the REAL PowerShell code) on fixed cases, run through test_memwatch_decide.ps1
//   B  wiring in l2swarm_ctl.ps1: the decision is used in both samples, the old absolute rule is gone, warning line + alert file before
//      the restart, the cooldown counts only real RESTART lines, thresholds from swarm.config.json "memwatch"
// Offline: starts no L2Swarm, no task, writes only a temp case file.   Usage: node docs/plan/tools/test_memwatch_decide.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const T = __dirname;
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (c) pass++; else fail++; };

// ---------------------------------------------------------------- A. decision
const OWNER_LIMIT = 66150;   // owner PC: 32 GB RAM + 49 GB pagefile, commit limit ~64.6 GB
const SMALL_LIMIT = 18000;   // tester PC: 16 GB RAM + 2 GB pagefile
const cases = [
  { name: 'vykaax', commitFree: 2831, pcFree: 11572, limit: SMALL_LIMIT, want: { restart: false } },
  { name: 'vykaax-nolimit', commitFree: 2831, pcFree: 11572, limit: 0, want: { restart: false, warn: 'pagefile' } },
  { name: 'vykaax-biglimit', commitFree: 2831, pcFree: 11572, limit: OWNER_LIMIT, want: { restart: false, warn: 'pagefile' } },
  { name: 'vykaax-earlier', commitFree: 3201, pcFree: 11000, limit: OWNER_LIMIT, want: { restart: false } },
  { name: 'owner-normal', commitFree: 30000, pcFree: 10000, limit: OWNER_LIMIT, want: { restart: false, warn: '' } },
  { name: 'owner-really-low', commitFree: 2500, pcFree: 800, limit: OWNER_LIMIT, want: { restart: true, emergency: false } },
  { name: 'owner-emergency', commitFree: 1200, pcFree: 400, limit: OWNER_LIMIT, want: { restart: true, emergency: true } },
  { name: 'hard-exhausted', commitFree: 400, pcFree: 9000, limit: SMALL_LIMIT, want: { restart: true, emergency: true, warn: 'pagefile' } },
  { name: 'small-pf-ram-low', commitFree: 800, pcFree: 1500, limit: SMALL_LIMIT, want: { restart: true, emergency: false } },
  { name: 'small-pf-ram-gone', commitFree: 850, pcFree: 250, limit: SMALL_LIMIT, want: { restart: true, emergency: true } },
  { name: 'ram-boundary', commitFree: 2000, pcFree: 2000, limit: OWNER_LIMIT, want: { restart: false, warn: 'pagefile' } },
  { name: 'cfg-ramPlenty', commitFree: 2831, pcFree: 11572, limit: 0, cfg: { RamPlentyMB: 12000 }, want: { restart: true } },
  { name: 'cfg-hard', commitFree: 900, pcFree: 9000, limit: SMALL_LIMIT, cfg: { HardCommitMB: 1000 }, want: { restart: true, emergency: true } },
];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memwatch_'));
const cf = path.join(tmp, 'cases.json');
fs.writeFileSync(cf, JSON.stringify(cases.map(c => ({ name: c.name, commitFree: c.commitFree, pcFree: c.pcFree, limit: c.limit, cfg: c.cfg || null }))));
const p = cp.spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(T, 'test_memwatch_decide.ps1'), '-Cases', cf], { encoding: 'utf8', timeout: 60000, windowsHide: true });
let res = [];
try { res = JSON.parse(String(p.stdout || '').trim()); } catch (e) { ok(false, 'harness output is JSON: ' + (p.stdout || '') + (p.stderr || '')); }
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
console.log('A. MemWatchDecide');
for (const c of cases) {
  const r = res.find(x => x.name === c.name);
  if (!r) { ok(false, `${c.name}: no result`); continue; }
  const bad = Object.keys(c.want).filter(k => r[k] !== c.want[k]);
  ok(!bad.length, `${c.name} (commitFree ${c.commitFree}, pcFree ${c.pcFree}, limit ${c.limit || '?'}${c.cfg ? ', ' + JSON.stringify(c.cfg) : ''}) -> restart=${r.restart} emergency=${r.emergency} warn='${r.warn}'${bad.length ? ' WANTED ' + JSON.stringify(c.want) : ''} | ${r.reason}`);
}

// ---------------------------------------------------------------- B. wiring
console.log('B. l2swarm_ctl.ps1 wiring');
const ctl = fs.readFileSync(path.join(T, 'l2swarm_ctl.ps1'), 'utf8');
ok(/\.\s+"\$PSScriptRoot\\memwatch_decide\.ps1"/.test(ctl), 'l2swarm_ctl.ps1 dot-sources memwatch_decide.ps1');
ok((ctl.match(/\$ms = MemSample \$p;[^\n]*\$need = \[bool\]\$ms\.d\.restart/g) || []).length === 2, 'both memory samples (first + the 10 s re-checks) decide with MemWatchDecide');
ok(!/\$need\s*=\s*\(\$commitMB\s+-lt\s+\$minCommitMB\)/.test(ctl), 'the old absolute rule ($commitMB -lt $minCommitMB) is gone');
ok(/\$emergency = \$need -and \[bool\]\$ms\.d\.emergency/.test(ctl), 'emergency comes from the decision');
ok(/Log \$memLog "PAGEFILE \$line/.test(ctl) && /Write-MemAlert 'pagefile'/.test(ctl), 'pagefile too small: PAGEFILE line in memwatch.log + Logs/memwatch_alert.json, no restart');
const iLow = ctl.indexOf('Log $memLog "LOWMEM'), iAlert = ctl.indexOf("Write-MemAlert 'restart'"), iRs = ctl.indexOf('Log $memLog "RESTART');
ok(iLow > 0 && iAlert > iLow && iRs > iAlert, 'a restart first logs a LOWMEM warning line + the restart alert, then RESTART');
ok(/-cmatch ' RESTART '/.test(ctl), 'the 30 min cooldown counts only real RESTART lines (case-sensitive)');
const pfAdv = (ctl.match(/\$pagefileAdvice = '([^']*)'/) || [])[1] || '';
ok(/pagefile/i.test(pfAdv) && !/ RESTART /.test(pfAdv), 'pagefile advice names the pagefile fix and never looks like a RESTART line');
ok(['minCommitMB', 'minCommitPct', 'emergencyCommitMB', 'hardCommitMB', 'ramPlentyMB'].every(k => ctl.includes(`'memwatch.${k}'`)), 'thresholds configurable in swarm.config.json "memwatch"');
ok(/memwatch_alert\.json/.test(ctl), 'alert file Logs/memwatch_alert.json');

console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
