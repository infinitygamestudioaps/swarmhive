// ADDACCT-2026-10-27 (tester Vykaax, L2Swarm 3.10.7/3.10.8, v1.12.2: "a few times now, adding accounts has failed for me ... some of the
// 'FindStuff' and 'FindHelper' accounts, this one just refuses to enter Hive"): "+ Add account" only wrote the files and said "created"; nobody
// checked that the new character really reached the brain host. This module checks it END TO END after every add (and on "Check" on the Accounts
// tab for any roster character that is not in the brain), says the exact reason, and fixes on disk what can be fixed safely.
// Reasons found (docs/plan/AUTOMATION_LOG.md 2026-10-27 ADDACCT):
//   name    the pool accepts a hello only with the EXACT name of its allow list (Dashboard/brain_host/pool.js "allow.includes(name)") and the roster
//           holds what was typed in the form. "Findstuff" typed, the game says "FindStuff" -> "hello from FindStuff refused (not in allow list)";
//           the agent guard then restarts its agent every 20 min, refused again, for ever. Fix: swarm.config.json (character + party keys),
//           brain_host.json allow / except and the XML SelectedCharacter follow the game's spelling (backups first).
//   allow   brain_host.json "allowAll": false (an own list, kept by every update): isBrainChar(adding) was false -> the XML got swarm.js (inside
//           L2Swarm), the pool refused it and the agent guard never looked at it (it only checks allow names). Fix: the name goes into "allow".
//   xml     the XML lists swarm.js (or no agent2) -> agent2.js, enabled, swarm.js out (only while L2Swarm does NOT have the account open: rule 6, it
//           would overwrite the file; open = the agent guard attaches it live + saves the XML). RepeatDelaySeconds order (3.10.7 schema) fixed too.
//   other   not logged in (L2Swarm down / not opened), open from another XML, logged in as another character, quarantined, pool not running,
//           agent never said hello (L2Swarm loaded the account before the change: reload it).
// Pure: diagnose(entry, snap). Side effects: applyFixes(ctx, entry, diag), snapshot(ctx), the watcher (tick). Test: docs/plan/tools/test_addaccount_verify.js.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const BHS = require('./brain_host/supervise');
let XO = null; try { XO = require('../docs/plan/tools/xml_order_fix.js'); } catch (e) { XO = null; }   // package installs ship docs/plan/tools too

const WATCH_MS = 20 * 60000, WATCH_NEW_MS = 35 * 60000, CHECK_MS = 10 * 60000, NOHELLO_MS = 4 * 60000, KEEP_MS = 24 * 3600000;
const AGENT_RX = /^agent2(_[A-Za-z0-9]+)?\.js$/i;
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const lc = (s) => String(s || '').toLowerCase();
const settingsDir = (ctx) => ctx.SETTINGS || path.join(ctx.ROOT, 'Settings');
const cfgFile = (ctx) => ctx.CONFIG_FILE || path.join(ctx.ROOT, 'swarm.config.json');
const bhFile = (ctx) => path.join(ctx.DATA || path.join(ctx.ROOT, 'Scripts', 'data'), 'brain_host.json');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

// ---------------------------------------------------------------------------------------------------------------------------- xml helpers
function readXml(f) {
  const b = fs.readFileSync(f);
  if (b[0] === 0xFF && b[1] === 0xFE) return { text: b.slice(2).toString('utf16le'), enc: 'utf16le', bom: true };
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return { text: b.slice(3).toString('utf8'), enc: 'utf8', bom: true };
  const u16 = b.length > 1 && b[1] === 0x00;
  return { text: b.toString(u16 ? 'utf16le' : 'utf8'), enc: u16 ? 'utf16le' : 'utf8', bom: false };
}
function writeXml(ctx, f, r, text, why) {
  const B = path.join(settingsDir(ctx), 'backup', 'addaccount'); fs.mkdirSync(B, { recursive: true });   // CLAUDE.md rule 5: backup first
  fs.copyFileSync(f, path.join(B, path.basename(f).replace(/\.xml$/i, '') + '.' + why + '_' + stamp() + '.xml'));
  const body = Buffer.from(text, r.enc), bom = !r.bom ? Buffer.alloc(0) : r.enc === 'utf16le' ? Buffer.from([0xFF, 0xFE]) : Buffer.from([0xEF, 0xBB, 0xBF]);
  const tmp = f + '.addacct.tmp'; fs.writeFileSync(tmp, Buffer.concat([bom, body])); fs.renameSync(tmp, f);
}
/** -> { login, selected, scripts: [{ name, enabled }] } */
function xmlInfo(text) {
  const t = String(text || '');
  const login = (t.match(/<Name>([^<]*)<\/Name>/) || [])[1] || '';      // the first <Name> is the account's login (Option/Name)
  const selected = (t.match(/<SelectedCharacter>([^<]*)<\/SelectedCharacter>/) || [])[1] || '';
  const sl = (t.match(/<ScriptsList>([\s\S]*?)<\/ScriptsList>/) || [])[1] || '';
  const scripts = [];
  sl.replace(/<Script>([\s\S]*?)<\/Script>/g, (m, b) => { const n = (b.match(/<Name>([^<]*)<\/Name>/) || [])[1]; if (n) scripts.push({ name: n.trim(), enabled: !/<IsEnabled>\s*false\s*<\/IsEnabled>/i.test(b) }); return m; });
  return { login: login.trim(), selected: selected.trim(), scripts };
}
/** the account runs the brain agent: swarm.js out, agent2.js in and enabled (other scripts, e.g. mkchar_<login>.js, stay) */
function xmlUseAgent(text, scriptsDir) {
  const all = String(text || ''), agentPath = scriptsDir.replace(/[\\/]+$/, '') + '\\agent2.js';
  let changed = false;
  const m0 = all.match(/<ScriptsList>([\s\S]*?)<\/ScriptsList>/);        // only inside <ScriptsList>
  if (!m0) {
    const el = `<Script><IsEnabled>true</IsEnabled><guid>${crypto.randomUUID()}</guid><Name>agent2.js</Name><Path>${agentPath}</Path></Script>`;
    if (/<ScriptsList\s*\/>/.test(all)) return { text: all.replace(/<ScriptsList\s*\/>/, `<ScriptsList>${el}</ScriptsList>`), changed: true };
    return { text: all.replace(/<\/Option>\s*$/, `  <ScriptsList>${el}</ScriptsList>\r\n</Option>\r\n`), changed: true };
  }
  let t = m0[1];
  // one <Script> of swarm.js -> agent2.js (name + path), enabled
  t = t.replace(/<Script>([\s\S]*?)<\/Script>/g, (m, b) => {
    const n = ((b.match(/<Name>([^<]*)<\/Name>/) || [])[1] || '').trim();
    if (/^swarm\.js$/i.test(n)) { changed = true; return '<Script>' + b.replace(/<Name>[^<]*<\/Name>/, '<Name>agent2.js</Name>').replace(/<Path>[^<]*<\/Path>/, `<Path>${agentPath}</Path>`).replace(/<IsEnabled>[^<]*<\/IsEnabled>/, '<IsEnabled>true</IsEnabled>') + '</Script>'; }
    if (AGENT_RX.test(n) && /<IsEnabled>\s*false\s*<\/IsEnabled>/i.test(b)) { changed = true; return '<Script>' + b.replace(/<IsEnabled>[^<]*<\/IsEnabled>/, '<IsEnabled>true</IsEnabled>') + '</Script>'; }
    return m;
  });
  // two agents now (an agent2.js + a converted swarm.js): keep the first
  let seen = false;
  t = t.replace(/[ \t]*<Script>([\s\S]*?)<\/Script>(\r?\n)?/g, (m, b) => { const n = ((b.match(/<Name>([^<]*)<\/Name>/) || [])[1] || '').trim(); if (!AGENT_RX.test(n)) return m; if (seen) { changed = true; return ''; } seen = true; return m; });
  if (!seen) { t += `<Script><IsEnabled>true</IsEnabled><guid>${crypto.randomUUID()}</guid><Name>agent2.js</Name><Path>${agentPath}</Path></Script>`; changed = true; }
  return { text: all.slice(0, m0.index) + '<ScriptsList>' + t + '</ScriptsList>' + all.slice(m0.index + m0[0].length), changed };
}
function xmlSetSelected(text, name) {
  const t = String(text || '');
  if (/<SelectedCharacter>[^<]*<\/SelectedCharacter>/.test(t)) return t.replace(/<SelectedCharacter>[^<]*<\/SelectedCharacter>/, `<SelectedCharacter>${name}</SelectedCharacter>`);
  if (/<SelectedCharacter\s*\/>/.test(t)) return t.replace(/<SelectedCharacter\s*\/>/, `<SelectedCharacter>${name}</SelectedCharacter>`);
  return t;
}

// ---------------------------------------------------------------------------------------------------------------------------- brain log
/** brain_host.log text -> [{ at (ms), name, why }] of the refused hellos ("hello from X refused (not in allow list)") */
function refusedHellos(text) {
  const out = [];
  String(text || '').replace(/^(\S+) \[pool\] hello from (\S+) refused \(([^)]*)\)/gm, (m, at, name, why) => { out.push({ at: Date.parse(at) || 0, name: name === '?' ? '' : name, why }); return m; });
  return out;
}
function logTail(f, bytes) {
  try { const st = fs.statSync(f), n = Math.min(st.size, bytes), fd = fs.openSync(f, 'r'); try { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, st.size - n); return b.toString('utf8'); } finally { fs.closeSync(fd); } } catch (e) { return ''; }
}

// ---------------------------------------------------------------------------------------------------------------------------- snapshot
async function withTimeout(p, ms) { let t; try { return await Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })]); } finally { clearTimeout(t); } }
/** everything the checks need, read once per round. online = L2Swarm's account list ([]) or null (L2Swarm not answering) */
async function snapshot(ctx) {
  const now = ctx.now ? ctx.now() : Date.now();
  let cfgRaw = null, cfg = null; try { cfgRaw = fs.readFileSync(cfgFile(ctx), 'utf8'); cfg = JSON.parse(cfgRaw.replace(/^﻿/, '')); } catch (e) { }
  const bhRaw = readJ(bhFile(ctx), null);
  let stats = readJ(path.join(ctx.LOGS, 'brain_host_stats.json'), null);
  if (stats) stats.fresh = now - Date.parse(stats.at || 0) < 60000;
  let online = null;
  if (typeof ctx.mcpCall === 'function') {
    try { const t = await withTimeout(Promise.resolve(ctx.mcpCall('get_accounts_status', {})), ctx.mcpTimeoutMs || 8000); const j = typeof t === 'string' ? JSON.parse(t) : t; const l = Array.isArray(j) ? j : (j && j.accounts) || []; online = Array.isArray(l) ? l : []; } catch (e) { online = null; }
  }
  const refused = refusedHellos(logTail(path.join(ctx.LOGS, 'brain_host.log'), 1500000)).filter(r => now - r.at < 45 * 60000);
  return { now, cfg, accounts: cfg && Array.isArray(cfg.accounts) ? cfg.accounts : null, bhRaw, stats, online, refused, settings: settingsDir(ctx) };
}
const accLogin = (a) => lc(a && (a.login || a.account_name || a.configured_name));
const accChar = (a) => String((a && (a.character_name || (a.character && a.character.name))) || '');
/** L2Swarm's row for this account: by login, else by its config file */
function onlineRow(online, login, file) {
  if (!Array.isArray(online)) return undefined;
  const L = lc(login), F = lc(path.basename(file || ''));
  return online.find(a => a && (accLogin(a) === L || lc(a.configured_name) === L)) || online.find(a => a && a.config_path && F && lc(path.basename(String(a.config_path))) === F) || null;
}

// ---------------------------------------------------------------------------------------------------------------------------- diagnose (pure)
/** entry = { login, character, file (full path), addedAt, mode } ; snap = snapshot() + xml: { file -> text } (or entry.xml)
 *  -> { state: 'joined' | 'waiting' | 'problem' | 'off', items: [{ code, text, fix?: { kind, ... }, manual? }] } */
function diagnose(entry, snap) {
  const items = [], add = (code, text, fix, manual) => items.push(Object.assign({ code, text }, fix ? { fix } : {}, manual ? { manual } : {}));
  const now = snap.now || Date.now(), name = String(entry.character || ''), login = lc(entry.login);
  const accs = snap.accounts;
  const acc = Array.isArray(accs) ? accs.find(a => a && lc(a.login) === login) : null;
  if (!Array.isArray(accs)) { add('cfg_unread', 'swarm.config.json is missing or does not parse: nothing can be checked', null, 'fix swarm.config.json'); return { state: 'problem', items }; }
  if (!acc) { add('cfg_missing', `login ${login} is not in swarm.config.json`, null, 'add it again with + Add account'); return { state: 'problem', items }; }
  const cname = String(acc.character || name);
  if (acc.enabled === false) add('cfg_disabled', `${cname} is switched off in swarm.config.json ("enabled": false): the brain ignores it`, null, 'set "enabled": true');
  const st = snap.stats, conn = new Set(st && st.fresh ? (BHS.connectedNames(st) || []) : []);
  if (conn.has(cname)) return { state: 'joined', items: [{ code: 'joined', text: `${cname} is connected to the brain host` }] };
  const bh = snap.bhRaw;
  const engineOff = !bh || bh.on === false;
  if (engineOff) { add('engine_off', 'the new engine is off (Scripts/data/brain_host.json "on": false or missing): this account runs swarm.js inside L2Swarm, not in the Hive', null, 'switch the new engine on (dashboard PC tab -> New engine)'); return { state: 'off', items }; }
  // the game's spelling of the name: L2Swarm's account list, else a refused hello of the brain log
  const row = onlineRow(snap.online, login, entry.file || (acc.config ? path.join(snap.settings || '', acc.config) : ''));
  const gameName = row && row.is_logged_in !== false ? accChar(row) : '';
  let spelled = '';
  if (gameName && gameName !== cname && lc(gameName) === lc(cname)) spelled = gameName;
  const refusedMine = (snap.refused || []).filter(r => r.name && lc(r.name) === lc(cname));
  if (!spelled) { const r = refusedMine.find(x => x.name !== cname); if (r) spelled = r.name; }
  if (spelled) add('name_case', `name mismatch: the game says ${spelled}, swarm.config.json says ${cname} — the brain only takes the exact name`, { kind: 'rename', from: cname, to: spelled });
  const want = spelled || cname;
  const ex = (Array.isArray(bh.except) ? bh.except : []).map(String);
  if (ex.includes(cname) || ex.includes(want)) add('except', `${want} is in brain_host.json "except": the brain turns it away on purpose`, null, 'remove it from "except" if it should join the Hive');
  else if (!BHS.isBrainChar(cname, bh, accs) && !spelled) add('not_allowed', `${cname} is not in the brain allow list (brain_host.json "allowAll": false)`, { kind: 'allow', name: cname });
  // the account file
  const file = entry.file || (acc.config ? path.join(snap.settings || '', acc.config) : '');
  const xmlText = entry.xml != null ? entry.xml : snap.xml && snap.xml[file];
  const isOpen = row !== undefined && row !== null;            // L2Swarm has it loaded (online or not): never edit its XML on disk
  const l2Known = Array.isArray(snap.online);
  if (xmlText == null) add('xml_missing', `its L2Swarm config ${path.basename(file) || '(none in swarm.config.json)'} is missing`, null, 'add the account again');
  else {
    const X = xmlInfo(xmlText);
    if (X.login && lc(X.login) !== login) add('xml_login', `XML ${path.basename(file)} is for login ${X.login}, swarm.config.json says ${login}`, null, 'point "config" at the right file');
    if (X.selected && X.selected !== want && lc(X.selected) === lc(want)) add('xml_selected_case', `XML says ${X.selected}, the game says ${want}`, { kind: 'xml_selected', to: want, file, open: isOpen, l2Known });
    else if (X.selected && lc(X.selected) !== lc(want)) add('xml_selected', `name mismatch: XML says ${X.selected}, config says ${cname}`, null, 'use the same name in both (the XML SelectedCharacter is the character L2Swarm logs in)');
    const sw = X.scripts.find(s => /^swarm\.js$/i.test(s.name) && s.enabled), ag = X.scripts.find(s => AGENT_RX.test(s.name) && s.enabled);
    if (sw || !ag) add('xml_engine', sw ? `XML ${path.basename(file)} starts swarm.js inside L2Swarm instead of the brain agent (agent2.js)` : `XML ${path.basename(file)} has no agent2 in its ScriptsList`, { kind: 'xml_engine', file, open: isOpen, l2Known });
    if (XO && /<RepeatDelaySeconds>/.test(xmlText) && XO.fixOrder(xmlText).moved) add('xml_order', `XML ${path.basename(file)} has the old element order L2Swarm 3.10.7 refuses at login`, { kind: 'xml_order', file, open: isOpen, l2Known });
  }
  // L2Swarm / the brain pool
  if (!st || !st.fresh) add('pool_down', 'the brain host is not running (Logs/brain_host_stats.json not fresh)', null, 'restart the dashboard');
  else {
    if ((st.quarantined || []).some(q => q && (q.name === want || q.name === cname))) add('quarantined', `${want} is quarantined by the brain watchdog for a while; it rejoins by itself`, null, 'wait (up to 30 min)');
    const poolAllow = Array.isArray(st.allow) ? st.allow.map(String) : null;
    if (poolAllow && !poolAllow.includes(want) && !items.some(i => i.fix && (i.fix.kind === 'allow' || i.fix.kind === 'rename'))) add('pool_stale', `the running brain pool has not taken ${want} into its allow list yet`, null, 'wait a minute; still there = restart the dashboard');
  }
  if (!l2Known) add('l2_down', 'L2Swarm does not answer: the account logs in at the next L2Swarm start', null, 'start L2Swarm');
  else if (!row) add('not_open', `L2Swarm does not have ${login} open`, null, 'log it in: its character page -> Log in (or L2Swarm -> open Settings\\' + path.basename(file) + ')');
  else if (row.is_logged_in === false || !gameName) add('not_in_game', `${login} is open in L2Swarm but not in the game yet`, null, entry.mode === 'new' ? 'wait: the character is created at the first login (Logs/create_chars.txt)' : 'wait, or log it in from its character page');
  else {
    if (row.config_path && file && lc(path.resolve(String(row.config_path))) !== lc(path.resolve(file))) add('other_file', `L2Swarm has ${login} open from ${path.basename(String(row.config_path))}, not ${path.basename(file)}`, null, 'close it in L2Swarm and open Settings\\' + path.basename(file));
    if (lc(gameName) !== lc(want)) add('wrong_char', `${login} is in the game as ${gameName}, not ${want}`, null, 'fix the character name in swarm.config.json and the XML SelectedCharacter');
    else if (!items.some(i => i.fix || i.manual)) {
      const since = Math.max(entry.addedAt || 0, entry.onlineAt || 0);
      if (now - since > NOHELLO_MS) add('no_hello', `${want} is in the game but its agent never reached the brain`, null, 'L2Swarm loaded the account before the change: reload its config (close + open the account), the agent guard also restarts the agent every 2-20 min');
    }
  }
  const problem = items.some(i => i.fix || (i.manual && !/^wait/.test(i.manual)));
  return { state: problem ? 'problem' : 'waiting', items };
}

// ---------------------------------------------------------------------------------------------------------------------------- fixes (disk)
function writeJsonKeep(ctx, F, raw, obj, histName) {
  const H = path.join(settingsDir(ctx), 'backup', histName); fs.mkdirSync(H, { recursive: true });
  fs.writeFileSync(path.join(H, path.basename(F).replace(/\.json$/, '') + '.' + stamp() + '.addacct.json'), raw);
  const tmp = F + '.addacct.tmp'; fs.writeFileSync(tmp, obj); fs.renameSync(tmp, F);
}
/** swarm.config.json: character + every party key from -> to, the file's layout kept (only those JSON strings change) */
function renameInConfig(raw, from, to) {
  const bom = raw.charCodeAt(0) === 0xFEFF, text = bom ? raw.slice(1) : raw, j = JSON.parse(text);
  (j.accounts || []).forEach(a => { if (!a) return; if (a.character === from) a.character = to; if (a.party === from) a.party = to; });
  const q = JSON.stringify(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out = text.replace(new RegExp(`("(?:character|party)"\\s*:\\s*)${q}`, 'g'), (m, k) => k + JSON.stringify(to));
  try { if (JSON.stringify(JSON.parse(out)) === JSON.stringify(j)) return (bom ? '﻿' : '') + out; } catch (e) { }
  return (bom ? '﻿' : '') + JSON.stringify(j, null, 2).replace(/\n/g, /\r\n/.test(text) ? '\r\n' : '\n') + (/\r\n/.test(text) ? '\r\n' : '\n');
}
function bhWrite(ctx, mut) {
  const F = bhFile(ctx); const raw = fs.readFileSync(F, 'utf8'); const j = JSON.parse(raw.replace(/^﻿/, ''));
  if (!mut(j)) return false;
  j._updated = { at: new Date().toISOString(), by: 'dashboard: + Add account check (ADDACCT)' };
  writeJsonKeep(ctx, F, raw, JSON.stringify(j, null, 1) + '\n', 'brain_host_history'); return true;
}
/** the safe disk fixes of a diagnosis -> [{ code, text }] (what was done). XML edits only while L2Swarm answers and does NOT have the account open. */
function applyFixes(ctx, entry, diag) {
  const done = [], said = (code, text) => done.push({ code, text });
  for (const it of diag.items) {
    const f = it.fix; if (!f) continue;
    try {
      if (f.kind === 'allow') {
        if (bhWrite(ctx, (j) => { j.allow = Array.isArray(j.allow) ? j.allow : []; if (j.allow.includes(f.name)) return false; j.allow.push(f.name); return true; })) said('allow', `not in brain allow list -> added ${f.name} (Scripts/data/brain_host.json; the pool takes it within 5 s)`);
      } else if (f.kind === 'rename') {
        const F = cfgFile(ctx), raw = fs.readFileSync(F, 'utf8');
        const out = renameInConfig(raw, f.from, f.to);
        if (out !== raw) { JSON.parse(out.replace(/^﻿/, '')); writeJsonKeep(ctx, F, raw, out, 'swarm_config_history'); }
        try { bhWrite(ctx, (j) => { let ch = false; for (const k of ['allow', 'except']) if (Array.isArray(j[k])) j[k] = j[k].map(n => { if (n === f.from) { ch = true; return f.to; } return n; }); if (Array.isArray(j.allow) && j.allowAll !== true && !j.allow.includes(f.to)) { j.allow.push(f.to); ch = true; } return ch; }); } catch (e) { }
        entry.character = f.to;
        said('rename', `name mismatch: config said ${f.from}, the game says ${f.to} -> swarm.config.json (character + party) and brain_host.json now say ${f.to}`);
      } else if (f.kind === 'xml_engine' || f.kind === 'xml_order' || f.kind === 'xml_selected') {
        if (f.open || !f.l2Known) { said(f.kind + '_open', f.kind === 'xml_engine' ? `XML not changed: ${f.open ? 'L2Swarm has the account open (it would overwrite the file) — the agent guard attaches agent2.js live and saves the XML within a few minutes; or close the account in L2Swarm and press Check again' : 'L2Swarm does not answer — press Check again once it runs'}` : `XML ${path.basename(f.file)} needs a fix: close the account in L2Swarm, then press Check again`); continue; }
        const r = readXml(f.file);
        let t = r.text, why = '';
        if (f.kind === 'xml_engine') { const u = xmlUseAgent(t, path.join(ctx.ROOT, 'Scripts')); if (!u.changed) continue; t = u.text; why = 'engine'; }
        else if (f.kind === 'xml_order') { const o = XO.fixOrder(t); if (!o.moved) continue; t = o.text; why = 'order'; }
        else { t = xmlSetSelected(t, f.to); if (t === r.text) continue; why = 'name'; }
        writeXml(ctx, f.file, r, t, why);
        said(f.kind, f.kind === 'xml_engine' ? `XML had no brain agent -> fixed (agent2.js in ScriptsList, swarm.js out; backup in Settings\\backup\\addaccount)` : f.kind === 'xml_order' ? 'XML element order (L2Swarm 3.10.7 schema) -> fixed' : `XML SelectedCharacter -> ${f.to}`);
      }
    } catch (e) { said('fix_failed', `could not fix (${it.code}): ${String(e.message || e).slice(0, 160)}`); }
  }
  return done;
}

// ---------------------------------------------------------------------------------------------------------------------------- watcher
const W = { list: [], timer: null, busy: false, ctx: null, loaded: false };
const stateFile = (ctx) => path.join(ctx.LOGS, 'addaccount_verify.json');
function save(ctx) { try { const tmp = stateFile(ctx) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ at: new Date().toISOString(), entries: W.list }, null, 1)); fs.renameSync(tmp, stateFile(ctx)); } catch (e) { } }
function load(ctx) {
  if (W.loaded) return; W.loaded = true;
  const j = readJ(stateFile(ctx), null); if (j && Array.isArray(j.entries)) W.list = j.entries.filter(e => e && e.login && Date.now() - (e.addedAt || 0) < KEEP_MS);
}
function logLine(ctx, t) { try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()}\taddaccount-check\t${t}\r\n`); } catch (e) { } }
/** watch one account (after an add, or a Check): kind 'added' | 'check' */
function watch(ctx, o) {
  load(ctx);
  const now = ctx.now ? ctx.now() : Date.now(), login = lc(o.login);
  W.list = W.list.filter(e => e.login !== login);
  const e = { login, character: String(o.character || ''), file: o.file || '', mode: o.mode || 'existing', kind: o.kind || 'added', addedAt: now,
    until: now + (o.kind === 'check' ? CHECK_MS : o.mode === 'new' ? WATCH_NEW_MS : WATCH_MS), state: 'waiting', items: [], fixed: [], checks: 0 };
  W.list.push(e); save(ctx); start(ctx); return e;
}
function start(ctx) {
  W.ctx = ctx;
  if (W.timer || ctx.noTimer) return;
  W.timer = setInterval(() => { tick(W.ctx).catch(() => { }); }, ctx.verifyEveryMs || 30000);
  if (W.timer.unref) W.timer.unref();
}
/** one round over the watched accounts (also called by Check) */
async function tick(ctx, only) {
  if (W.busy) return W.list; W.busy = true;
  try {
    load(ctx);
    const act = W.list.filter(e => (e.state === 'waiting' || e.state === 'problem') && (!only || only.includes(e.login)));
    if (!act.length) { if (W.timer && !W.list.some(e => e.state === 'waiting' || e.state === 'problem')) { clearInterval(W.timer); W.timer = null; } return W.list; }
    const snap = await snapshot(ctx);
    snap.xml = {};
    for (const e of act) {
      const acc = (snap.accounts || []).find(a => a && lc(a.login) === e.login);
      if (acc && acc.character && acc.character !== e.character) e.character = String(acc.character);
      if (!e.file && acc && acc.config) e.file = path.join(snap.settings, acc.config);
      if (e.file && snap.xml[e.file] === undefined) { try { snap.xml[e.file] = readXml(e.file).text; } catch (er) { snap.xml[e.file] = null; } }
      const row = onlineRow(snap.online, e.login, e.file);
      if (row && accChar(row) && !e.onlineAt) e.onlineAt = snap.now;
      let d = diagnose(e, snap);
      const fixedNow = d.state === 'joined' ? [] : applyFixes(ctx, e, d).filter(x => !e.fixed.some(y => y.text === x.text));
      if (fixedNow.length) {
        fixedNow.forEach(x => logLine(ctx, `${e.login}\t${e.character}\t${x.text}`));
        e.fixed = e.fixed.concat(fixedNow.map(x => Object.assign({ at: new Date(snap.now).toISOString() }, x))).slice(-12);
        if (fixedNow.some(x => !/_open$/.test(x.code))) e.until = Math.max(e.until, snap.now + 10 * 60000);   // give the fix its time
      }
      e.checks++; e.checkedAt = new Date(snap.now).toISOString(); e.items = d.items;
      if (d.state === 'joined') { e.state = 'joined'; e.joinedAt = e.checkedAt; logLine(ctx, `${e.login}\t${e.character}\tjoined the brain host`); }
      else if (d.state === 'off') e.state = 'off';
      else if (snap.now > e.until) { e.state = 'failed'; logLine(ctx, `${e.login}\t${e.character}\tNOT in the brain after ${Math.round((snap.now - e.addedAt) / 60000)} min: ${d.items.map(i => i.code).join(', ')}`); }
      else e.state = d.state;
    }
    W.list = W.list.filter(e => snap.now - (e.addedAt || 0) < KEEP_MS);
    save(ctx);
    return W.list;
  } finally { W.busy = false; }
}
/** Check: these logins (or every enabled roster character the brain does not have) are checked now and watched for 10 min */
async function checkNow(ctx, logins) {
  load(ctx);
  let list = Array.isArray(logins) && logins.length ? logins.map(lc) : null;
  if (!list) {
    const cfg = readJ(cfgFile(ctx), null), st = BHS.readStats(path.join(ctx.LOGS, 'brain_host_stats.json'), 60000), conn = new Set(BHS.connectedNames(st) || []);
    list = ((cfg && cfg.accounts) || []).filter(a => a && a.login && a.character && a.enabled !== false && !conn.has(String(a.character))).map(a => lc(a.login));
  }
  const cfg = readJ(cfgFile(ctx), null), accs = (cfg && cfg.accounts) || [];
  list.forEach(l => {
    const a = accs.find(x => x && lc(x.login) === l); if (!a) return;
    const old = W.list.find(e => e.login === l);
    if (old && (old.state === 'waiting' || old.state === 'problem')) return;
    watch(ctx, { login: l, character: a.character, file: a.config ? path.join(settingsDir(ctx), a.config) : '', kind: old && old.kind === 'added' ? 'added' : 'check', mode: old ? old.mode : 'existing' });
  });
  await tick(ctx, list);
  return W.list;
}
/** first request after a (re)start: resume the watch of accounts that were still pending */
function resume(ctx) {
  if (W.ctx) return; W.ctx = ctx;
  try { load(ctx); if (W.list.some(e => e.state === 'waiting' || e.state === 'problem')) start(ctx); } catch (e) { }
}
function entries(ctx) { load(ctx); return W.list.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)); }

module.exports = { diagnose, applyFixes, snapshot, xmlInfo, xmlUseAgent, xmlSetSelected, refusedHellos, renameInConfig, onlineRow, watch, tick, checkNow, entries, resume, _w: W,
  WATCH_MS, WATCH_NEW_MS, NOHELLO_MS };
