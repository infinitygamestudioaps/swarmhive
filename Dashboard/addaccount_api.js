// ADD ACCOUNT (2026-10-12, public feature): one form on the Accounts tab (#/accounts, "+ Add account") adds a game account to the swarm.
// Loaded by server.js (one hook, like fundpage_api.js). Public (no secrets): /addaccount.js, /addaccount.css.
//   GET  /api/addaccount        what the form needs: roles (swarm.js role kinds + named roles), parties (swarm.config.json), base classes
//                               (Scripts/data/class_tree.json roots), login gap, whether swarm.config.json exists
//   POST /api/addaccount        { accounts: [{ login, password, character, mode: 'existing'|'new', race, sex, classId, party, role, autoStart }]
//                                 | bulk: "login;password;character;party;role" lines (+ bulkNew: { race, sex, classId } = create them all),
//                                 autoStart, loginNow, dryRun } -> { ok, results: [{ line, login, character, status, reason, config, loginState }] }
// Per account: Settings/<Login>.xml through docs/plan/tools/new_account.ps1 (template Settings/templates/<role>.xml, else default.xml; the
// password goes ONLY into the child's environment variable L2S_NEWACCOUNT_PW and is stored encrypted inside that XML by L2Swarm's own
// Option.EncryptPassword, exactly like L2Swarm does) -> new character: Scripts/mkchar_<login>.js (creates it at the first login, progress in
// Logs/create_chars.txt) -> swarm.config.json accounts[] (backup in Settings/backup/swarm_config_history first, the file's own layout kept,
// atomic tmp + rename) -> Settings/start_extra.txt (the "L2Swarm Start" task logs these in after the AutoStart list; settings.xml is never
// touched here, L2Swarm overwrites it from memory while it runs) -> optionally open_account through L2Swarm's MCP, one by one, login.gapSeconds apart.
// The password is never logged, never written to a file by this code, never echoed back; error texts are scrubbed of it.
// Every action: one line in Logs/dashboard_commands.log WITHOUT the password. Test: docs/plan/tools/test_addaccount_api.js (sandbox + fake runner).
'use strict';
const fs = require('fs'), path = require('path');
const { execFile } = require('child_process');

const STATIC = { '/addaccount.js': 'application/javascript; charset=utf-8', '/addaccount.css': 'text/css; charset=utf-8' };
// swarm.js ROLEKIND.kinds + 'auto' + the named roles with special routines (swarm.config.example.json "accounts" help)
const ROLE_KINDS = ['auto', 'tank', 'healer', 'buffer', 'melee', 'archer', 'dagger', 'nuker', 'summoner', 'spoiler', 'crafter'];
const ROLE_NAMED = ['sk', 'bishop', 'shilliensaint', 'destroyer', 'doombringer', 'necromancer', 'inspector', 'doomcryer'];
const ROLE_HELP = {
  auto: 'the kind of its current class (re-checked after every class change)', tank: 'holds aggro', healer: 'only heals', buffer: 'buffs the party',
  melee: 'melee damage', archer: 'bow, keeps distance', dagger: 'dagger damage', nuker: 'magic damage', summoner: 'servitor + support',
  spoiler: 'spoils + sweeps', crafter: 'crafter (golem)', sk: 'Shillien Knight tank routine', bishop: 'Bishop healer routine',
  shilliensaint: 'Shillien Saint healer routine', destroyer: 'drain + Frenzy routine', doombringer: 'Kamael melee', necromancer: 'Necromancer nuker',
  inspector: 'Kamael debuffs / Soul Hound', doomcryer: 'Doomcryer chants' };
const DEFAULT_HEALERS = ['bishop', 'shilliensaint', 'healer'];
const RACE_NO = { HUMAN: 0, ELF: 1, DARK_ELF: 2, DARKELF: 2, ORC: 3, DWARF: 4, KAMAEL: 5 };
// High Five base stats of the start classes (STR DEX CON INT WIT MEN) — game data, the same for every server
const BASE_STATS = { 0: [40, 30, 43, 21, 11, 25], 10: [22, 21, 27, 41, 20, 39], 18: [36, 35, 36, 23, 14, 26], 25: [21, 24, 25, 37, 23, 40],
  31: [41, 34, 32, 25, 12, 26], 38: [23, 23, 24, 44, 19, 37], 44: [40, 26, 47, 18, 12, 27], 49: [27, 24, 31, 31, 15, 42], 53: [39, 29, 45, 20, 10, 27],
  123: [41, 33, 31, 29, 11, 25], 124: [39, 35, 30, 28, 11, 27] };
const LOGIN_RE = /^[A-Za-z0-9_]{3,32}$/, NAME_RE = /^[A-Za-z0-9]{2,16}$/;
const MAX_BATCH = 60;

const STATE = { busy: false, queue: [], qRunning: false, lastLogin: [] };

// ---------------------------------------------------------------------------------------------------------------------------- paths / data
const settingsDir = (ctx) => ctx.SETTINGS || path.join(ctx.ROOT, 'Settings');
const cfgFile = (ctx) => ctx.CONFIG_FILE || path.join(ctx.ROOT, 'swarm.config.json');
const readJ = (ctx, f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
function readCfg(ctx) {
  const F = cfgFile(ctx);
  let raw = null; try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { return { exists: false, raw: null, cfg: null }; }
  try { return { exists: true, raw, cfg: JSON.parse(raw.replace(/^﻿/, '')) }; } catch (e) { return { exists: true, raw, cfg: null, broken: e.message }; }
}
const capFile = (login) => login.charAt(0).toUpperCase() + login.slice(1) + '.xml';
function baseClasses(ctx) {
  const T = readJ(ctx, path.join(ctx.DATA || path.join(ctx.ROOT, 'Scripts', 'data'), 'class_tree.json'), null);
  const out = [];
  if (T && T.classes) {
    const roots = Array.isArray(T.roots) && T.roots.length ? T.roots : Object.values(T.classes).filter(c => c && c.tier === 0).map(c => c.id);
    roots.forEach(id => { const c = T.classes[String(id)]; if (!c || RACE_NO[c.race] == null) return;
      out.push({ id: +c.id, name: c.name, race: RACE_NO[c.race], raceLabel: c.raceLabel || c.race, type: c.type || '', gender: c.gender || null }); });
  }
  if (!out.length) {   // class_tree.json missing: the 11 start classes of every chronicle since Kamael
    [[0, 'Human Fighter', 0, 'Human', 'fighter'], [10, 'Human Mystic', 0, 'Human', 'mystic'], [18, 'Elven Fighter', 1, 'Elf', 'fighter'], [25, 'Elven Mystic', 1, 'Elf', 'mystic'],
      [31, 'Dark Fighter', 2, 'Dark Elf', 'fighter'], [38, 'Dark Elven Mystic', 2, 'Dark Elf', 'mystic'], [44, 'Orc Fighter', 3, 'Orc', 'fighter'], [49, 'Orc Mystic', 3, 'Orc', 'mystic'],
      [53, 'Dwarven Fighter', 4, 'Dwarf', 'fighter'], [123, 'Kamael Soldier (male)', 5, 'Kamael', 'fighter', 'M'], [124, 'Kamael Soldier (female)', 5, 'Kamael', 'fighter', 'F']]
      .forEach(([id, name, race, raceLabel, type, gender]) => out.push({ id, name, race, raceLabel, type, gender: gender || null }));
  }
  return out;
}
function roles(cfg) {
  const extra = cfg && cfg.roleTemplates && typeof cfg.roleTemplates === 'object' ? Object.keys(cfg.roleTemplates).filter(k => k !== 'default' && !k.startsWith('//')) : [];
  const all = [...new Set(ROLE_KINDS.concat(ROLE_NAMED, extra))];
  return all.map(r => ({ value: r, label: r, help: ROLE_HELP[r] || '', kind: ROLE_KINDS.includes(r) }));
}
function accountsOf(cfg) { return (cfg && Array.isArray(cfg.accounts) ? cfg.accounts : []).filter(a => a && a.login); }
function partiesOf(cfg) {
  const acc = accountsOf(cfg).filter(a => a.enabled !== false);
  const leaders = [];
  acc.forEach(a => { const p = String(a.party || a.character || ''); if (p && !leaders.includes(p)) leaders.push(p); });
  return leaders.map(L => ({ leader: L, members: acc.filter(a => a.character && String(a.party || a.character) === L).map(a => a.character) }));
}
function loginGapSec(ctx, cfg) {
  let g = cfg && cfg.login && +cfg.login.gapSeconds;
  if (!g) { try { g = +fs.readFileSync(path.join(settingsDir(ctx), 'login_gap.txt'), 'utf8').trim(); } catch (e) { } }
  return Math.max(5, g || 5);
}
/** every login that already has a config in Settings (its <Name>), lower case */
function knownLogins(ctx) {
  const set = new Set();
  try { fs.readdirSync(settingsDir(ctx)).filter(f => /\.xml$/i.test(f) && !/^settings\.xml$/i.test(f)).forEach(f => {
    try { const m = fs.readFileSync(path.join(settingsDir(ctx), f), 'utf8').replace(/\0/g, '').match(/<Name>([^<]+)<\/Name>/); if (m) set.add(m[1].trim().toLowerCase()); } catch (e) { }
  }); } catch (e) { }
  return set;
}
function info(ctx) {
  const C = readCfg(ctx), cfg = C.cfg || {};
  return { configExists: C.exists, configBroken: C.broken || null, roles: roles(cfg), parties: partiesOf(cfg), baseClasses: baseClasses(ctx),
    characters: accountsOf(cfg).map(a => a.character).filter(Boolean), logins: accountsOf(cfg).map(a => String(a.login).toLowerCase()),
    loginGap: loginGapSec(ctx, cfg), scripts: Array.isArray(cfg.scripts) && cfg.scripts.length ? cfg.scripts : ['swarm.js'],
    healerRoles: Array.isArray(cfg.healerRoles) && cfg.healerRoles.length ? cfg.healerRoles : DEFAULT_HEALERS,
    loginQueue: STATE.queue.map(q => q.login), lastLogins: STATE.lastLogin.slice(-20) };
}

// ---------------------------------------------------------------------------------------------------------------------------- parsing
/** bulk text -> rows. "login;password;character;party;role" — party / role may be empty (empty party = the character leads its own party,
 *  empty role = auto). A password that contains ';' works when the line has all 5 fields (everything between the login and the last 3
 *  fields is the password). 3 or 4 fields = login;password;character[;party]. '#' lines and blank lines are skipped. Tabs work like ';'. */
function parseBulk(text) {
  const rows = [], errors = [];
  String(text || '').replace(/\r/g, '').split('\n').forEach((line, i) => {
    const t = line.trim(); if (!t || t.startsWith('#')) return;
    const f = t.split(/;|\t/);
    if (f.length < 3) { errors.push({ line: i + 1, login: (f[0] || '').trim(), status: 'error', reason: 'needs at least login;password;character' }); return; }
    let login, password, character, party = '', role = '';
    if (f.length >= 5) { login = f[0]; password = f.slice(1, f.length - 3).join(';'); character = f[f.length - 3]; party = f[f.length - 2]; role = f[f.length - 1]; }
    else { login = f[0]; password = f[1]; character = f[2]; party = f[3] || ''; }
    rows.push({ line: i + 1, login: login.trim(), password, character: character.trim(), party: party.trim(), role: role.trim().toLowerCase() });
  });
  return { rows, errors };
}

// ---------------------------------------------------------------------------------------------------------------------------- validation
/** one row -> { ok, row (normalised), reason }. ctxData: { roles:Set, classes:[...], logins:Set (config + Settings xml), chars:Set, leaders:Set } */
function validateOne(r, D) {
  const bad = (reason) => ({ ok: false, reason });
  const login = String(r.login || '').trim().toLowerCase();
  if (!LOGIN_RE.test(login)) return bad('login: 3-32 letters, digits or _');
  const pw = typeof r.password === 'string' ? r.password : '';
  if (!pw) return bad('password missing');
  if (pw.length > 64) return bad('password longer than 64 characters');
  if (/[\r\n\0]/.test(pw)) return bad('password contains a line break');
  const character = String(r.character || '').trim();
  if (!NAME_RE.test(character)) return bad('character name: 2-16 letters or digits (L2Swarm selects the character by this name)');
  const mode = r.mode === 'new' ? 'new' : 'existing';
  let create = null;
  if (mode === 'new') {
    const cls = D.classes.find(c => c.id === +r.classId);
    if (!cls) return bad('start class: pick one of the base classes');
    const race = r.race === '' || r.race == null ? cls.race : +r.race;
    if (race !== cls.race) return bad(`${cls.name} is not a ${['Human', 'Elf', 'Dark Elf', 'Orc', 'Dwarf', 'Kamael'][race] || 'race ' + race} class`);
    const sex = +r.sex === 1 ? 1 : +r.sex === 0 ? 0 : NaN;
    if (Number.isNaN(sex)) return bad('sex: male or female');
    if (cls.gender === 'M' && sex !== 0) return bad(`${cls.name} is male only`);
    if (cls.gender === 'F' && sex !== 1) return bad(`${cls.name} is female only`);
    create = { race: cls.race, sex, classId: cls.id, className: cls.name, stats: BASE_STATS[cls.id] || BASE_STATS[cls.type === 'mystic' ? 10 : 0] };
  }
  const role = String(r.role || '').trim().toLowerCase() || 'auto';
  if (!D.roles.has(role)) return bad(`role "${role}" is unknown (one of: ${[...D.roles].join(', ')})`);
  let party = String(r.party || '').trim();
  if (!party || party.toLowerCase() === character.toLowerCase()) party = character;   // new party, this character leads
  else {
    const hit = [...D.leaders].find(l => l.toLowerCase() === party.toLowerCase());
    if (!hit) return bad(`party "${party}" is not a party leader (pick an existing leader or leave it empty = new party)`);
    party = hit;
  }
  return { ok: true, row: { line: r.line, login, password: pw, character, mode, create, party, role, autoStart: r.autoStart !== false } };
}

// ---------------------------------------------------------------------------------------------------------------------------- files
/** the one-off first-login script that creates the character (same proven pattern as the owner's mkchar tool, one name) */
function buildCreateScript(rootFwd, login, c, name) {
  return `// created by the dashboard (Add account): creates ${name} on the empty account ${login} at the first login, then does nothing.
(async () => {
  const L = ${JSON.stringify(login)}, NAME = ${JSON.stringify(name)}, ST = ${JSON.stringify(c.stats)};
  const log = (t) => { try { File.AppendAllText(${JSON.stringify(rootFwd + '/Logs/create_chars.txt')}, new Date().toISOString() + ' [' + L + '] ' + t + '\\r\\n'); } catch (e) { } };
  let result = null, tries = 0;
  try { Options.EnableJSOnIncomingPacket = true; } catch (e) { }
  globalThis.OnIncomingPacket = (p) => {
    try { const op = Number(p[2]) & 255;
      if (op === 0x0f) result = 'OK';
      else if (op === 0x10) { result = 'FAIL'; log('CharCreateFail for ' + NAME + ' reason ' + (Number(p[3]) & 255)); } } catch (e) { }
  };
  for (let n = 0; n < 240; n++) {
    await sleep(5000);
    try { if (Me && Me.Name) { if (n === 0 || result) log('RESULT OK ' + Me.Name + ' (in game)'); return; } } catch (e) { }
    if (result === 'OK') { log('RESULT OK ' + NAME + ' (created, waiting for the login)'); result = 'DONE'; }
    if (result === 'DONE') continue;
    if (result === 'FAIL' || tries >= 6) { log('RESULT FAIL ' + NAME + ' was refused (name taken or not allowed): pick another name on the dashboard'); return; }
    if (n === 0) log('waiting for the character list to create ' + NAME);
    try { Send.NewCharacter(); await sleep(1500); Send.CharacterCreate(NAME, ${c.race}, ${c.sex}, ${c.classId}, ST[0], ST[1], ST[2], ST[3], ST[4], ST[5], 0, 0, 0); tries++; log('CharacterCreate sent: ' + NAME + ' (try ' + tries + ')'); } catch (e) { log('error ' + e); }
  }
  log('RESULT FAIL timeout');
})();
`;
}
function templateFor(ctx, cfg, role) {
  const T = path.join(settingsDir(ctx), 'templates');
  const rt = cfg && cfg.roleTemplates && typeof cfg.roleTemplates === 'object' ? cfg.roleTemplates : {};
  for (const k of [role, 'default']) {
    if (!k) continue;
    const f = path.join(T, k + '.xml'); if (fs.existsSync(f)) return f;
    if (rt[k]) { const s = path.join(settingsDir(ctx), String(rt[k])); if (fs.existsSync(s)) return s; }
  }
  return '';   // new_account.ps1 picks its own default
}
function groupOf(cfg, party) {
  const g = cfg && cfg.groups && typeof cfg.groups === 'object' ? cfg.groups : {};
  if (g.overrides && g.overrides[party]) return String(g.overrides[party]);
  return String(g.format || 'Party {party}').replace('{party}', party);
}
/** the default runner: docs/plan/tools/new_account.ps1 with the password ONLY in the child's environment (never the command line) */
function defaultRunner(ctx) {
  return (o) => new Promise((resolve) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'new_account.ps1'),
      '-Login', o.login, '-PasswordEnv', 'L2S_NEWACCOUNT_PW', '-OutFile', o.outFile];
    if (o.character) args.push('-Character', o.character);
    if (o.template) args.push('-Template', o.template);
    if (o.scripts && o.scripts.length) args.push('-Scripts', o.scripts.join(','));
    if (o.group) args.push('-Group', o.group);
    if (o.followName) args.push('-FollowName', o.followName, '-FollowAtk', o.followAtk ? 'true' : 'false');
    if (o.loginIp) args.push('-LoginIp', String(o.loginIp));
    if (o.loginPort) args.push('-LoginPort', String(o.loginPort));
    if (o.serverId != null && o.serverId !== '') args.push('-ServerId', String(o.serverId));
    const env = Object.assign({}, process.env, { L2S_NEWACCOUNT_PW: o.password });
    execFile('powershell', args, { windowsHide: true, timeout: 120000, env }, (err, so, se) => resolve({ ok: !err, text: String(so || '') + String(se || '') + (err && !se ? String(err.message || '') : '') }));
  });
}
const scrub = (t, pw) => { let s = String(t || ''); if (pw) s = s.split(pw).join('***'); return s.replace(/\s+/g, ' ').trim().slice(0, 300); };
function logLine(ctx, t) { try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()}\taddaccount\t${t}\r\n`); } catch (e) { } }

/** insert account entries into swarm.config.json text, keeping its layout (one-line or block entries, its indentation and line ends).
 *  Returns the new text; verified to parse to the old object + the entries, else a plain 2-space JSON rewrite. */
function insertAccounts(raw, entries) {
  const bom = raw.charCodeAt(0) === 0xFEFF, text = bom ? raw.slice(1) : raw, NL = /\r\n/.test(text) ? '\r\n' : '\n';
  const obj = JSON.parse(text);
  const want = Object.assign({}, obj, { accounts: (Array.isArray(obj.accounts) ? obj.accounts : []).concat(entries) });
  const plain = () => (bom ? '﻿' : '') + JSON.stringify(want, null, 2).replace(/\n/g, NL) + NL;
  if (!Array.isArray(obj.accounts)) return plain();
  // find the top-level "accounts": [ ... ] with a small JSON scanner (strings and depth aware)
  let i = 0, depth = 0, arrStart = -1, lastKey = null, keyEndDepth = -1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1; while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const s = text.slice(i + 1, j); i = j + 1;
      if (depth === 1) { let k = i; while (/\s/.test(text[k])) k++; if (text[k] === ':') { lastKey = s; keyEndDepth = depth; } }
      continue;
    }
    if (ch === '{' || ch === '[') { if (ch === '[' && depth === 1 && lastKey === 'accounts' && keyEndDepth === 1) { arrStart = i; break; } depth++; }
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === ',') { if (depth === 1) lastKey = null; }
    i++;
  }
  if (arrStart < 0) return plain();
  let d = 0, arrEnd = -1; i = arrStart;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') { let j = i + 1; while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1; i = j + 1; continue; }
    if (ch === '[' || ch === '{') d++;
    else if (ch === ']' || ch === '}') { d--; if (d === 0) { arrEnd = i; break; } }
    i++;
  }
  if (arrEnd < 0) return plain();
  const inner = text.slice(arrStart + 1, arrEnd);
  const lineStart = text.lastIndexOf('\n', arrStart) + 1, baseIndent = (text.slice(lineStart).match(/^[ \t]*/) || [''])[0];
  let out;
  if (!inner.trim()) {
    const ind = baseIndent + '  ';
    out = text.slice(0, arrStart + 1) + NL + entries.map(e => ind + oneLine(e)).join(',' + NL) + NL + baseIndent + text.slice(arrEnd);
  } else {
    const m = inner.match(/\n([ \t]*)\{/), ind = m ? m[1] : baseIndent + '  ';
    const firstBrace = inner.indexOf('{'), block = firstBrace >= 0 && /^\{[ \t]*\r?\n/.test(inner.slice(firstBrace));
    let last = arrEnd - 1; while (last > arrStart && /\s/.test(text[last])) last--;
    const fmt = (e) => block ? JSON.stringify(e, null, 2).split('\n').map(l => ind + l).join(NL) : ind + oneLine(e);
    out = text.slice(0, last + 1) + ',' + NL + entries.map(fmt).join(',' + NL) + text.slice(last + 1);
  }
  try { if (JSON.stringify(JSON.parse(out)) === JSON.stringify(want)) return (bom ? '﻿' : '') + out; } catch (e) { }
  return plain();
}
function oneLine(e) { return '{ ' + Object.keys(e).map(k => JSON.stringify(k) + ': ' + JSON.stringify(e[k])).join(', ') + ' }'; }
function writeConfig(ctx, raw, entries) {
  const F = cfgFile(ctx);
  const H = path.join(settingsDir(ctx), 'backup', 'swarm_config_history');
  fs.mkdirSync(H, { recursive: true });
  fs.writeFileSync(path.join(H, 'swarm.config.' + new Date().toISOString().replace(/[:.]/g, '-') + '.addaccount.json'), raw);
  try { const old = fs.readdirSync(H).filter(f => /^swarm\.config\..*\.json$/.test(f)).sort(); old.slice(0, Math.max(0, old.length - 50)).forEach(f => { try { fs.unlinkSync(path.join(H, f)); } catch (e) { } }); } catch (e) { }
  const txt = insertAccounts(raw, entries);
  JSON.parse(txt.replace(/^﻿/, ''));                    // never write a file that does not parse
  const tmp = F + '.addaccount.tmp';
  fs.writeFileSync(tmp, txt, 'utf8'); fs.renameSync(tmp, F);
}
function addStartExtra(ctx, files) {
  const F = path.join(settingsDir(ctx), 'start_extra.txt');
  let cur = ''; try { cur = fs.readFileSync(F, 'utf8'); } catch (e) { }
  const have = new Set(cur.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean));
  const add = files.filter(f => !have.has(f.toLowerCase()));
  if (!add.length) return;
  fs.appendFileSync(F, (cur && !/\n$/.test(cur) ? '\r\n' : '') + add.map(f => f + '\r\n').join(''));
}

// ---------------------------------------------------------------------------------------------------------------------------- login queue
async function withTimeout(p, ms) { let t; try { return await Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })]); } finally { clearTimeout(t); } }
async function l2swarmUp(ctx) {
  if (typeof ctx.mcpCall !== 'function') return false;
  try { await withTimeout(Promise.resolve(ctx.mcpCall('get_accounts_status', {})), ctx.mcpTimeoutMs || 8000); return true; } catch (e) { return false; }
}
function runQueue(ctx, gapMs) {
  if (STATE.qRunning) return;
  STATE.qRunning = true;
  (async () => {
    try {
      while (STATE.queue.length) {
        const q = STATE.queue.shift();
        let out = '';
        try { out = String(await withTimeout(Promise.resolve(ctx.mcpCall('open_account', { config_path: q.file })), 30000) || ''); } catch (e) { out = 'error: ' + (e.message || e); }
        const ok = !/^error|fail|not found|exception/i.test(out);
        STATE.lastLogin.push({ login: q.login, at: new Date().toISOString(), ok, text: out.replace(/\s+/g, ' ').slice(0, 160) });
        if (STATE.lastLogin.length > 50) STATE.lastLogin.shift();
        logLine(ctx, `${q.login}\topen_account\t${ok ? 'sent' : 'failed: ' + out.replace(/\s+/g, ' ').slice(0, 120)}`);
        if (STATE.queue.length) await new Promise(r => setTimeout(r, gapMs));
      }
    } finally { STATE.qRunning = false; }
  })();
}

// ---------------------------------------------------------------------------------------------------------------------------- add
async function add(ctx, b) {
  const C = readCfg(ctx);
  if (!C.exists) return { code: 400, error: 'swarm.config.json not found — set up the install first (docs/plan/INSTALL.md: copy swarm.config.example.json, run SETUP)' };
  if (!C.cfg) return { code: 500, error: 'swarm.config.json does not parse: ' + (C.broken || '') + ' — fix it first, nothing was changed' };
  const cfg = C.cfg;
  // 1) rows: the single form or the pasted lines
  let rows = [], results = [];
  if (typeof b.bulk === 'string' && b.bulk.trim()) {
    const P = parseBulk(b.bulk); results = P.errors;
    const nw = b.bulkNew && typeof b.bulkNew === 'object' && b.bulkNew.classId != null && b.bulkNew.classId !== '' ? b.bulkNew : null;
    rows = P.rows.map(r => Object.assign(r, { autoStart: b.autoStart !== false }, nw ? { mode: 'new', race: nw.race, sex: nw.sex, classId: nw.classId } : { mode: 'existing' }));
  } else if (Array.isArray(b.accounts)) rows = b.accounts.map((a, i) => Object.assign({ line: i + 1 }, a || {}));
  if (!rows.length && !results.length) return { code: 400, error: 'nothing to add' };
  if (rows.length > MAX_BATCH) return { code: 400, error: `at most ${MAX_BATCH} accounts at once` };
  // 2) validate (syntax, then duplicates and parties across config + this batch)
  const accs = accountsOf(cfg);
  const D = { roles: new Set(roles(cfg).map(r => r.value)), classes: baseClasses(ctx), leaders: new Set(partiesOf(cfg).map(p => p.leader)) };
  const cfgLogins = new Set(accs.map(a => String(a.login).toLowerCase())), xmlLogins = knownLogins(ctx);
  const cfgChars = new Set(accs.map(a => String(a.character || '').toLowerCase()).filter(Boolean));
  // characters of this batch that lead their own party may be named as the party of other lines of the batch
  rows.forEach(r => { const c = String(r.character || '').trim(), p = String(r.party || '').trim(); if (NAME_RE.test(c) && (!p || p.toLowerCase() === c.toLowerCase())) D.leaders.add(c); });
  const seenL = new Set(), seenC = new Set(), ok = [];
  for (const r of rows) {
    const v = validateOne(r, D);
    const who = { line: r.line, login: String(r.login || '').trim().toLowerCase(), character: String(r.character || '').trim() };
    if (!v.ok) { results.push(Object.assign(who, { status: 'error', reason: v.reason })); continue; }
    const row = v.row, file = path.join(settingsDir(ctx), capFile(row.login));
    if (cfgLogins.has(row.login)) { results.push(Object.assign(who, { status: 'exists', reason: `login ${row.login} is already in swarm.config.json` })); continue; }
    if (xmlLogins.has(row.login) || fs.existsSync(file)) { results.push(Object.assign(who, { status: 'exists', reason: `an L2Swarm config for ${row.login} exists already (Settings\\${path.basename(file)} or another file with that login)` })); continue; }
    if (seenL.has(row.login)) { results.push(Object.assign(who, { status: 'error', reason: `login ${row.login} is twice in this list` })); continue; }
    if (cfgChars.has(row.character.toLowerCase())) { results.push(Object.assign(who, { status: 'exists', reason: `character ${row.character} is already in swarm.config.json` })); continue; }
    if (seenC.has(row.character.toLowerCase())) { results.push(Object.assign(who, { status: 'error', reason: `character ${row.character} is twice in this list` })); continue; }
    seenL.add(row.login); seenC.add(row.character.toLowerCase());
    row.file = file; ok.push(row);
  }
  // a member whose leader line failed must not join a party that will not exist
  const leaderOk = new Set(partiesOf(cfg).map(p => p.leader).concat(ok.filter(r => r.party === r.character).map(r => r.character)));
  for (let k = ok.length - 1; k >= 0; k--) {
    const r = ok[k];
    if (!leaderOk.has(r.party)) { results.push({ line: r.line, login: r.login, character: r.character, status: 'error', reason: `its party leader ${r.party} could not be added (see that line)` }); ok.splice(k, 1); }
  }
  const scrubAll = () => { rows.forEach(r => { r.password = null; }); ok.forEach(r => { r.password = null; }); if (b.accounts) b.accounts.forEach(a => { if (a) a.password = null; }); b.bulk = null; };
  if (b.dryRun) {
    ok.forEach(r => results.push({ line: r.line, login: r.login, character: r.character, status: 'ok', reason: `would be added: ${r.mode === 'new' ? 'new ' + r.create.className + ' ' + (r.create.sex ? 'female' : 'male') : 'existing character'}, party ${r.party}${r.party === r.character ? ' (new, leads it)' : ''}, role ${r.role}, auto-start ${r.autoStart ? 'yes' : 'no'}`, config: path.basename(r.file) }));
    scrubAll();
    results.sort((x, y) => (x.line || 0) - (y.line || 0));
    return { code: 200, ok: true, dryRun: true, results };
  }
  // 3) create the configs one by one (new_account.ps1 through the runner; the password only in its environment)
  const run = ctx.runNewAccount || defaultRunner(ctx);
  const healers = Array.isArray(cfg.healerRoles) && cfg.healerRoles.length ? cfg.healerRoles.map(String) : DEFAULT_HEALERS;
  const server = cfg.server && typeof cfg.server === 'object' ? cfg.server : {};
  const scripts = Array.isArray(cfg.scripts) && cfg.scripts.length ? cfg.scripts.map(String) : ['swarm.js'];
  const rootFwd = String(ctx.ROOT).replace(/\\/g, '/');
  const created = [], failedLeaders = new Set();
  ok.sort((x, y) => (x.party === x.character ? 0 : 1) - (y.party === y.character ? 0 : 1) || (x.line || 0) - (y.line || 0));   // new leaders first
  for (const r of ok) {
    let mk = '';
    if (r.party !== r.character && failedLeaders.has(r.party)) {
      results.push({ line: r.line, login: r.login, character: r.character, status: 'error', reason: `its party leader ${r.party} could not be added (see that line)` });
      r.password = null; continue;
    }
    try {
      if (r.mode === 'new') {
        mk = 'mkchar_' + r.login + '.js';
        fs.writeFileSync(path.join(ctx.ROOT, 'Scripts', mk), buildCreateScript(rootFwd, r.login, r.create, r.character));
      }
      const isLeader = r.party === r.character;
      const kindHealer = healers.includes(r.role) || r.role === 'healer';
      const o = { login: r.login, password: r.password, character: r.character, outFile: r.file, template: templateFor(ctx, cfg, r.role),
        scripts: (mk ? [mk] : []).concat(scripts), group: groupOf(cfg, r.party), followName: isLeader ? '' : r.party, followAtk: !isLeader && !kindHealer,
        loginIp: server.loginIp || '', loginPort: server.loginPort || '', serverId: server.serverId != null ? server.serverId : '' };
      const out = await run(o);
      o.password = null;
      if (!out || !out.ok || !fs.existsSync(r.file)) throw new Error('creating the L2Swarm config failed: ' + scrub(out && out.text, r.password));
      // safety net: the plain password must never be in the file (L2Swarm stores it encrypted)
      const xml = fs.readFileSync(r.file, 'utf8');
      if (r.password.length >= 3 && xml.includes(r.password)) { try { fs.unlinkSync(r.file); } catch (e) { } throw new Error('the config held the password in plain text — removed it, nothing added (check docs/plan/tools/new_account.ps1)'); }
      const entry = { login: r.login, character: r.character, config: path.basename(r.file), party: r.party, role: r.role, autoStart: r.autoStart, enabled: true,
        note: `added on the dashboard ${new Date().toISOString().slice(0, 10)}${r.mode === 'new' ? ` (new ${r.create.className}, created at the first login)` : ''}` };
      created.push({ r, entry });
      results.push({ line: r.line, login: r.login, character: r.character, status: 'created', config: path.basename(r.file),
        reason: r.mode === 'new' ? `config created; ${r.character} (${r.create.className}) is created at the first login (Logs/create_chars.txt)` : 'config created' });
      logLine(ctx, `${r.login}\t${r.character}\tparty ${r.party}\trole ${r.role}\tautoStart ${r.autoStart}\t${r.mode === 'new' ? 'new ' + r.create.className : 'existing character'}\tcreated ${path.basename(r.file)}`);
    } catch (e) {
      if (mk) { try { fs.unlinkSync(path.join(ctx.ROOT, 'Scripts', mk)); } catch (e2) { } }
      if (r.party === r.character) failedLeaders.add(r.character);
      const reason = scrub(e.message || e, r.password);
      results.push({ line: r.line, login: r.login, character: r.character, status: 'error', reason });
      logLine(ctx, `${r.login}\t${r.character}\terror\t${reason}`);
    } finally { r.password = null; }
  }
  scrubAll();
  // 4) swarm.config.json + start list
  if (created.length) {
    try { writeConfig(ctx, C.raw, created.map(c => c.entry)); }
    catch (e) {
      const why = 'the configs were created but swarm.config.json could not be written (' + scrub(e.message) + ') — add these accounts there by hand';
      created.forEach(c => { const x = results.find(y => y.login === c.r.login && y.status === 'created'); if (x) x.reason += '; ' + why; });
      logLine(ctx, 'swarm.config.json write failed: ' + scrub(e.message));
    }
    try { addStartExtra(ctx, created.filter(c => c.r.autoStart).map(c => c.r.file)); } catch (e) { logLine(ctx, 'start_extra.txt write failed: ' + scrub(e.message)); }
  }
  // 5) log in now (optional) or at the next start
  const up = created.length ? await l2swarmUp(ctx) : false;
  const gap = ctx.loginGapMs != null ? ctx.loginGapMs : loginGapSec(ctx, cfg) * 1000;
  created.forEach(c => {
    const x = results.find(y => y.login === c.r.login && y.status === 'created'); if (!x) return;
    if (b.loginNow && up) { STATE.queue.push({ login: c.r.login, file: c.r.file }); x.loginState = `logging in now (${STATE.queue.length > 1 ? 'in ' + Math.round((STATE.queue.length - 1) * gap / 1000) + ' s, ' : ''}one by one, ${Math.round(gap / 1000)} s apart)`; }
    else if (c.r.autoStart) x.loginState = b.loginNow ? 'L2Swarm is not running: logs in at the next start' : 'logs in at the next start';
    else x.loginState = 'auto-start off: log it in from its character page (Log in) or set autoStart in swarm.config.json';
  });
  if (b.loginNow && up && STATE.queue.length) runQueue(ctx, gap);
  results.sort((x, y) => (x.line || 0) - (y.line || 0));
  return { code: 200, ok: true, created: created.length, results,
    note: created.length ? 'The other characters of a party learn about a new member at their next script start (next deploy or L2Swarm start). Run SETUP.cmd once later to put the new accounts into L2Swarm\'s own AutoStart list too (optional).' : '' };
}

// ---------------------------------------------------------------------------------------------------------------------------- http
async function readBody(req, max) {
  let t = '';
  for await (const c of req) { t += c; if (t.length > max) throw new Error('request too large'); }
  return JSON.parse(t || '{}');
}
async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) {
    res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p))));
    return true;
  }
  if (p !== '/api/addaccount') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b; try { b = await readBody(req, 200000); } catch (e) { ctx.json(res, 400, { error: 'bad request: ' + e.message }); return true; }
  if (STATE.busy) { ctx.json(res, 409, { error: 'another add is still running — wait a moment' }); return true; }
  STATE.busy = true;
  try { const r = await add(ctx, b); const code = r.code || 200; delete r.code; ctx.json(res, code, r); }
  catch (e) { ctx.json(res, 500, { error: String(e.message || e).slice(0, 300) }); }
  finally { STATE.busy = false; b = null; }
  return true;
}
module.exports = { handle, info, add, parseBulk, validateOne, insertAccounts, buildCreateScript, baseClasses, roles, BASE_STATS, ROLE_KINDS, ROLE_NAMED, _state: STATE };
