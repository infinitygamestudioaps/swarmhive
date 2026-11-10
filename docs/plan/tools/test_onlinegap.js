// test_onlinegap.js - requirements engine.md (ONLINEGAP-2026-11-10, tester LuckyStrikz: "hive got all the accounts online but only recognized
// 16 of the 27 are online" / "27 of 27 there but parties are full in swarm but the dashboard still has them as offline") and memwatch.md R3/R4
// (MEMPAGEFILE-2026-11-10: Logs/memwatch_alert.json shown in the warning bar; the PC tab no longer says "restart below 3 GB free commit").
//   A  Dashboard/onlinegap.js gapRows: every logged-in account that does not report gets the right reason + fix
//   B  onlinegap.create: MCP list -> rows (cached), MCP down -> an error, never a crash
//   C  memAlertOf: pagefile shown while fresh (< 30 min), restart for 3 h, junk / old = nothing; memAlert reads a BOM file (PowerShell UTF8)
//   D  the wiring: server.js (/api/state memAlert + hiveGap, /api/engine gap, ctlLimits reads the new MemWatch rule), index.html (bar lines,
//      PC tab "New engine" list with the existing buttons, the new MemWatch text), pages.md
//   node docs/plan/tools/test_onlinegap.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const OG = require(path.join(ROOT, 'Dashboard', 'onlinegap.js'));
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x !== undefined ? ' -- ' + x : '')); } };

// ------------------------------------------------------------------------------------------------ A gapRows
const accounts = [
  { login: 'acc1', character: 'Tank', party: 'Tank', role: 'tank' }, { login: 'acc2', character: 'Heal', party: 'Tank', role: 'healer' },
  { login: 'acc3', character: 'Nuke', party: 'Tank', role: 'nuker' }, { login: 'acc4', character: 'Off', party: 'Off', role: 'dd', enabled: false },
  { login: 'acc5', character: 'NoRole', party: 'Tank' }, { login: 'acc6', character: 'Main6', party: 'Tank', role: 'dd' },
  { login: 'acc7', character: 'Excl', party: 'Tank', role: 'dd' }, { login: 'acc8', character: 'Quiet', party: 'Tank', role: 'dd' }];
const online = [{ login: 'acc1', name: 'Tank' }, { login: 'acc2', name: 'Heal' }, { login: 'acc3', name: 'Nuke' }, { login: 'acc4', name: 'Off' },
  { login: 'acc5', name: 'NoRole' }, { login: 'acc6', name: 'Alt6' }, { login: 'acc9', name: 'Stranger' }, { login: 'acc7', name: 'Excl' }, { login: 'acc8', name: 'Quiet' }];
const engine = { on: true, allow: ['Tank', 'Heal', 'Nuke', 'NoRole', 'Main6', 'Quiet'], except: ['Excl'] };
const ages = { Tank: 2, Heal: 400, Quiet: 95 };
const r = OG.gapRows({ online, accounts, engine, connected: ['Tank', 'Quiet'], ages, handsOff: { Nuke: { on: true } } });
const by = {}; r.rows.forEach(x => { by[x.name] = x; });
t('A1 a reporting character is no gap; counts: 9 logged in, 1 reports', !by.Tank && r.online === 9 && r.reporting === 1, JSON.stringify({ online: r.online, reporting: r.reporting }));
t('A2 brain character without a connected agent (stale state) -> noAgent + the attach fix', by.Heal && by.Heal.reason === 'noAgent' && by.Heal.fix === 'attach' && /agent2\.js/.test(by.Heal.text));
t('A3 no state at all + hands off -> noAgent, says the automatic re-attach leaves it alone', by.Nuke && by.Nuke.reason === 'noAgent' && by.Nuke.handsOff === true && /hands off/.test(by.Nuke.text));
t('A4 the character is not in swarm.config.json -> notInConfig + the Add account fix', by.Stranger && by.Stranger.reason === 'notInConfig' && by.Stranger.fix === 'add' && /not in swarm\.config\.json/.test(by.Stranger.text));
t('A5 its login is listed for another character -> otherChar (alt), names both', by.Alt6 && by.Alt6.reason === 'otherChar' && /Main6/.test(by.Alt6.text) && /acc6/.test(by.Alt6.text));
t('A6 enabled:false -> disabled, no button', by.Off && by.Off.reason === 'disabled' && !by.Off.fix);
t('A7 no role -> noRole', by.NoRole && by.NoRole.reason === 'noRole');
t('A8 excluded from the new engine and silent -> noScript naming the exception', by.Excl && by.Excl.reason === 'noScript' && /except/.test(by.Excl.text));
t('A9 agent connected but no fresh state -> silent + Restart brain host', by.Quiet && by.Quiet.reason === 'silent' && by.Quiet.fix === 'bhrestart' && /95 s/.test(by.Quiet.text));
const r2 = OG.gapRows({ online: [{ login: 'acc2', name: 'Heal' }], accounts, engine, connected: null, ages: {} });
t('A10 brain pool not reporting -> poolDown + Restart dashboard', r2.rows[0] && r2.rows[0].reason === 'poolDown' && r2.rows[0].fix === 'dashrestart');
const r3 = OG.gapRows({ online: [{ login: 'acc2', name: 'Heal' }], accounts, engine: { on: false, allow: [], except: [] }, connected: null, ages: {} });
t('A11 new engine off and no swarm.js state -> noScript "the new engine is off"', r3.rows[0] && r3.rows[0].reason === 'noScript' && /new engine is off/.test(r3.rows[0].text));
t('A12 names are matched without case; nothing logged in = no rows', OG.gapRows({ online: [{ login: 'ACC1', name: 'tank' }], accounts, engine, connected: [], ages: {} }).rows[0].reason === 'noAgent' && OG.gapRows({}).rows.length === 0);
t('A13 onlineOf keeps only logged-in accounts with a character (a hooked / not-in-game one is skipped)', JSON.stringify(OG.onlineOf([{ account_name: 'a', is_logged_in: true, character: { name: 'X' } }, { account_name: 'b', is_logged_in: false, character: { name: 'Y' } }, { account_name: 'c', is_logged_in: true }]).map(x => x.name)) === '["X"]');

// ------------------------------------------------------------------------------------------------ B create
(async () => {
  let calls = 0;
  const G = OG.create({ mcpList: async () => { calls++; return [{ account_name: 'acc2', is_logged_in: true, character: { name: 'Heal' } }]; }, accounts: () => accounts, engine: () => engine, connected: () => [], ages: () => ({}), handsOff: () => ({}) });
  const g1 = await G.get(), g2 = await G.get();
  t('B1 create().get: rows from the MCP list, cached (one MCP call for two gets)', g1.rows.length === 1 && g1.rows[0].reason === 'noAgent' && calls === 1 && g2 === g1);
  const D = OG.create({ mcpList: async () => { throw new Error('ECONNREFUSED'); }, accounts: () => [], engine: () => ({}), connected: () => null, ages: () => ({}), handsOff: () => ({}) });
  const gd = await D.get();
  t('B2 MCP down -> an error text, no rows, no crash', gd.error && /does not answer/.test(gd.error) && gd.rows.length === 0);
  t('B3 peek is synchronous (null before the first answer, then the cached result)', OG.create({ mcpList: async () => [], accounts: () => [], engine: () => ({}), connected: () => [], ages: () => ({}), handsOff: () => ({}) }).peek() === null && G.peek() === g1);

  // ---------------------------------------------------------------------------------------------- C memAlert
  const now = Date.parse('2026-11-10T12:00:00Z');
  const pf = OG.memAlertOf({ kind: 'pagefile', at: '2026-11-10T11:50:00Z', reason: 'free commit 2831 MB < 3000 MB but free RAM 11572 MB', advice: 'Increase the pagefile', pcFreeMB: 11572, commitFreeMB: 2831 }, now);
  t('C1 a fresh pagefile alert is shown (reason, advice, MB values)', pf && pf.kind === 'pagefile' && /11572/.test(pf.reason) && pf.advice === 'Increase the pagefile' && pf.pcFreeMB === 11572);
  t('C2 a pagefile alert older than 30 min (MemWatch stopped rewriting it) is not shown', OG.memAlertOf({ kind: 'pagefile', at: '2026-11-10T11:00:00Z' }, now) === null);
  t('C3 a restart alert shows for 3 h, then not', !!OG.memAlertOf({ kind: 'restart', at: '2026-11-10T09:30:00Z' }, now) && OG.memAlertOf({ kind: 'restart', at: '2026-11-10T08:30:00Z' }, now) === null);
  t('C4 junk / unknown kind = nothing', OG.memAlertOf(null, now) === null && OG.memAlertOf({ kind: 'other' }, now) === null);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ogap-')), 'memwatch_alert.json');
  const d0 = new Date(), p2 = (x) => String(x).padStart(2, '0'), localS = `${d0.getFullYear()}-${p2(d0.getMonth() + 1)}-${p2(d0.getDate())}T${p2(d0.getHours())}:${p2(d0.getMinutes())}:${p2(d0.getSeconds())}`;
  fs.writeFileSync(tmp, '﻿' + JSON.stringify({ kind: 'pagefile', at: localS, reason: 'r', advice: 'a' }));   // (Get-Date).ToString('s') = LOCAL time, no zone
  t('C5 memAlert reads the PowerShell UTF-8 file (with BOM); a missing file = null', (OG.memAlert(tmp) || {}).kind === 'pagefile' && OG.memAlert(tmp + '.none') === null);

  // ---------------------------------------------------------------------------------------------- D wiring
  const SRV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), IDX = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
  t('D1 server.js: OGAP from onlinegap.create with MCP get_accounts_status, brain stats, swarm_state ages, hands off', /const OGAP = require\('\.\/onlinegap'\)\.create\(\{[\s\S]{0,300}get_accounts_status[\s\S]{0,400}connectedNames[\s\S]{0,300}readStates\(\)[\s\S]{0,300}handsOff/.test(SRV));
  t('D2 /api/state has memAlert (Logs/memwatch_alert.json) + hiveGap; /api/engine has gap', /memAlert: require\('\.\/onlinegap'\)\.memAlert\(path\.join\(LOGS, 'memwatch_alert\.json'\)/.test(SRV) && /hiveGap: \(\(\) => \{ try \{ return OGAP\.peek\(\)/.test(SRV) && /gap = await OGAP\.get\(15000\)[\s\S]{0,120}json\(res, 200, \{ gap,/.test(SRV));
  t('D3 ctlLimits reads minCommitPct / hardCommitMB / ramPlentyMB from l2swarm_ctl.ps1 and swarm.config.json "memwatch" wins', /hardCommitMB: num\(c, \/\\\$hardCommitMB/.test(SRV) && /ramPlentyMB: num\(c, \/\\\$ramPlentyMB/.test(SRV) && /SC\.cfg && SC\.cfg\.memwatch/.test(SRV));
  const CTL = fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'tools', 'l2swarm_ctl.ps1'), 'utf8');
  t('D4 the values ctlLimits parses exist in l2swarm_ctl.ps1', /\$minCommitPct = \d+; \$hardCommitMB = \d+; \$ramPlentyMB = \d+/.test(CTL) && /memwatch_alert\.json/.test(CTL));
  t('D5 the bar (renderFull) gets memAlert + hiveGap and shows the pagefile / restart / not-in-Hive lines', /renderFull\(Object\.assign\(\{\}, STATE\.full, \{ mem: STATE\.memAlert, gap: STATE\.hiveGap \}\)\)/.test(IDX) && /Windows pagefile too small/.test(IDX) && /L2Swarm was restarted: the PC ran out of memory/.test(IDX) && /Logged in but not in Hive/.test(IDX));
  t('D6 PC tab New engine lists every gap row; attach / restarts reuse the existing data-eng buttons (asks first)', /id="pcEngineGap"/.test(IDX) && /renderEngineGap\(g\.gap\)/.test(IDX) && /fix === 'attach'\) return `<button data-eng="move"/.test(IDX) && /data-eng="dashrestart"/.test(IDX) && /data-eng="bhrestart"/.test(IDX));
  t('D7 PC tab MemWatch text = the new rule (hard limit, RAM plenty, pagefile = warning, never a restart); the old "below 3 GB" sentence is gone', /while less than \$\{gbTxt\(/.test(IDX) && /pagefile is too small: a warning, never a restart/.test(IDX) && !/nearly out of memory \(free commit memory below \$\{Math\.round\(L\.minCommitMB/.test(IDX));
  const PG = fs.readFileSync(path.join(ROOT, 'docs', 'requirements', 'pages.md'), 'utf8');
  t('D8 pages.md (#/pc) names the gap list and the MemWatch bar', /ONLINEGAP-2026-11-10/.test(PG) && /memwatch_alert\.json/.test(PG));
  console.log(`onlinegap: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
