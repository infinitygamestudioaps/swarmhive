#!/usr/bin/env node
// IMPORT L2SWARM ACCOUNTS (2026-10-10): reads an existing L2Swarm folder (Settings\*.xml account configs + Settings\settings.xml)
// and writes / merges swarm.config.json, so a user with many accounts already set up in L2Swarm does not have to type them in.
//
//   node docs\plan\tools\import_l2swarm.js                         dry run: prints the table, writes nothing
//   node docs\plan\tools\import_l2swarm.js --write                 writes swarm.config.json (merge; backup in Settings\backup\<time>_import\)
//   options:
//     --root <folder>        the L2Swarm folder (default: the install folder, 3 levels above this file)
//     --config <file>        the swarm.config.json to merge into / write (default: <root>\swarm.config.json)
//     --set login=Character  play this character on that login (repeatable; also "--set login=" = no character yet)
//     --role login=role      set the swarm role (repeatable), e.g. --role mylogin3=nuker
//     --party login=Leader   put the account into that party (leader's CHARACTER name; repeatable)
//     --use login=File.xml   when a login has several configs in Settings\: use this one (the others are left alone)
//     --replace              ignore the accounts already in swarm.config.json (default: MERGE - your edited entries are kept)
//     --no-logs              do not use Logs\chars_*.json / Logs\swarm_state_*.json (character lists + classes seen by the swarm script)
//     --json                 print the result as JSON instead of the table
//     --quiet                only warnings + the summary
//
// What it reads from each account config (Settings\<name>.xml, UTF-8 or UTF-16, with or without BOM):
//   <Name> = login, <SelectedCharacter> = the character that account plays, <Group> = L2Swarm group, <ActiveFollow>/<FollowName> = who it
//   follows, <SendParty>/<NamesSendPartyList> = whom a leader invites, the skill names in <AutoSkillsList>/<CombatSkillsList>, login server.
// It NEVER reads, copies or prints a password: every <...Password> element is cut out of the text before anything else looks at it, and only
// "has a password: yes/no" is kept. The accounts stay in YOUR XML files; SETUP.cmd keeps using them (it only creates configs that are missing).
//
// Parties: members that follow the same character (ActiveFollow + FollowName, chains are followed to the end) = one party, the character at the
// end of the chain = the leader. An account that follows nobody and that nobody follows joins the party a leader invites it to
// (SendParty + a ticked name in NamesSendPartyList), else the party most of its L2Swarm group is in, else it is a party of its own.
// Roles: --role > the entry already in swarm.config.json > the role the swarm script reported (Logs\swarm_state_<char>.json) > the class
// the swarm script saw (classId -> role) > a guess from the skills in the XML > "" (TODO: set it by hand; the script ignores an account
// without a role until then). Characters per login: Logs\chars_<login>.json (written by swarm.js at every login) lists every character of a
// login; without it only the selected one is known - see docs\QUICKSTART.md "Choosing the character".
'use strict';
const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------------------------------------------ arguments
const argv = process.argv.slice(2);
const opt = { root: '', config: '', write: false, replace: false, logs: true, json: false, quiet: false, set: {}, role: {}, party: {}, use: {} };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const val = () => { const v = argv[++i]; if (v === undefined) die(`${a} needs a value`); return v; };
  const kv = (bag, flag) => {
    const v = val(); const k = v.indexOf('=');
    if (k < 1) die(`${flag} wants login=value, got "${v}"`);
    bag[v.slice(0, k).trim().toLowerCase()] = v.slice(k + 1).trim();
  };
  if (a === '--root') opt.root = val();
  else if (a === '--config') opt.config = val();
  else if (a === '--write') opt.write = true;
  else if (a === '--replace') opt.replace = true;
  else if (a === '--no-logs') opt.logs = false;
  else if (a === '--json') opt.json = true;
  else if (a === '--quiet') opt.quiet = true;
  else if (a === '--set') kv(opt.set, a);
  else if (a === '--role') kv(opt.role, a);
  else if (a === '--party') kv(opt.party, a);
  else if (a === '--use') kv(opt.use, a);
  else if (a === '-h' || a === '--help') { help(); process.exit(0); }
  else die(`unknown option ${a} (--help lists them)`);
}
function die(m) { console.error('import_l2swarm: ' + m); process.exit(1); }
function help() {
  const t = fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 20).map(l => l.replace(/^\/\/ ?/, '')).join('\n');
  console.log(t);
}

const ROOT = path.resolve(opt.root || path.join(__dirname, '..', '..', '..'));
const SETTINGS = path.join(ROOT, 'Settings');
const LOGS = path.join(ROOT, 'Logs');
const CFG_FILE = path.resolve(opt.config || path.join(ROOT, 'swarm.config.json'));
const EXAMPLE = [path.join(ROOT, 'swarm.config.example.json'), path.join(__dirname, '..', '..', '..', 'swarm.config.example.json')].find(f => fs.existsSync(f));
const ROLES = ['sk', 'bishop', 'destroyer', 'doombringer', 'necromancer', 'inspector', 'doomcryer', 'shilliensaint', 'crafter', 'spoiler', 'healer', 'nuker', 'dagger'];
for (const [l, r] of Object.entries(opt.role)) if (r && !ROLES.includes(r)) die(`--role ${l}=${r}: unknown role (roles: ${ROLES.join(', ')})`);
if (!fs.existsSync(SETTINGS)) die(`no Settings folder in ${ROOT} - is this an L2Swarm folder? (use --root <folder>)`);

const warnings = [];
const warn = (m) => warnings.push(m);

// ------------------------------------------------------------------------------------------------ reading files (any encoding)
function decode(buf) {
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return buf.slice(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) { const b = Buffer.from(buf.slice(2)); b.swap16(); return b.toString('utf16le'); }
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.slice(3).toString('utf8');
  // UTF-16 without a BOM: '<' followed by a 0 byte
  if (buf.length >= 4 && buf[0] === 0x3C && buf[1] === 0x00) return buf.toString('utf16le');
  if (buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x3C) { const b = Buffer.from(buf.slice(0, buf.length - (buf.length % 2))); b.swap16(); return b.toString('utf16le'); }
  return buf.toString('utf8');
}
// every element whose name ends in "Password" is removed before parsing: its value is never held, compared or printed
function stripPasswords(text, info) {
  return text.replace(/<([A-Za-z]*Password)(\s[^>]*)?>([\s\S]*?)<\/\1\s*>/g, (m, name, attrs, inner) => {
    if (name === 'Password') info.hasPassword = inner.trim().length > 0;
    return `<${name}/>`;
  });
}
function readJson(file, dflt) { try { return JSON.parse(decode(fs.readFileSync(file)).replace(/^﻿/, '')); } catch (e) { return dflt; } }

// ------------------------------------------------------------------------------------------------ a small XML parser (no dependencies)
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unesc = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]);
function parseXml(text) {
  const root = { name: '#doc', children: [], text: '' }; const stack = [root];
  const rx = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([A-Za-z_][\w.:-]*)\s*>|<([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;
  let m;
  while ((m = rx.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[7]) throw new Error(`stray "<" at offset ${m.index}`);
    if (m[1] !== undefined) { top.text += m[1]; continue; }
    if (m[2]) {
      if (top.name !== m[2]) throw new Error(`</${m[2]}> closes <${top.name}> (offset ${m.index})`);
      stack.pop(); continue;
    }
    if (m[3]) {
      const attrs = {};
      for (const a of m[4].matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unesc(a[2] !== undefined ? a[2] : a[3]);
      const el = { name: m[3], attrs, children: [], text: '' };
      top.children.push(el);
      if (!m[5]) stack.push(el);
      continue;
    }
    if (m[6] !== undefined) top.text += unesc(m[6]);
  }
  if (stack.length !== 1) throw new Error(`<${stack[stack.length - 1].name}> is never closed (file cut off?)`);
  const els = root.children;
  if (els.length !== 1) throw new Error(els.length ? 'more than one root element' : 'no XML element');
  return els[0];
}
const child = (el, n) => el && el.children.find(c => c.name === n);
const kids = (el, n) => el ? el.children.filter(c => c.name === n) : [];
const txt = (el, n) => { const c = child(el, n); return c ? c.text.trim() : ''; };
const isTrue = (v) => String(v).trim().toLowerCase() === 'true';

// ------------------------------------------------------------------------------------------------ settings.xml (AutoStart, MCP port)
const autoStart = [];        // config file names in AutoStart order (lower case)
let mcpPort = 0;
const SX = path.join(SETTINGS, 'settings.xml');
if (fs.existsSync(SX)) {
  try {
    const g = parseXml(stripPasswords(decode(fs.readFileSync(SX)), {}));
    for (const e of kids(child(g, 'AutoStartEntries'), 'AutoStartEntry')) if (e.attrs.configPath) autoStart.push(path.win32.basename(e.attrs.configPath).toLowerCase());
    mcpPort = +txt(child(g, 'Mcp'), 'Port') || 0;
  } catch (e) { warn(`Settings\\settings.xml could not be read (${e.message}) - AutoStart is unknown, every account gets autoStart: true`); }
} else warn('no Settings\\settings.xml (L2Swarm never ran here?) - AutoStart is unknown, every account gets autoStart: true');
const haveAutoStart = autoStart.length > 0;

// ------------------------------------------------------------------------------------------------ the existing swarm.config.json
let existing = null;
if (fs.existsSync(CFG_FILE)) {
  existing = readJson(CFG_FILE, undefined);
  if (existing === undefined) die(`${CFG_FILE} is not valid JSON - fix it (or move it away) first; nothing was changed`);
}
const legacy = new Set(((existing && existing.legacyConfigs) || []).map(s => String(s).toLowerCase()));
const oldAccounts = (!opt.replace && existing && Array.isArray(existing.accounts)) ? existing.accounts.filter(a => a && a.login) : [];
const oldByLogin = {}; oldAccounts.forEach(a => { oldByLogin[String(a.login).toLowerCase()] = a; });

// ------------------------------------------------------------------------------------------------ the account configs
// copies people leave next to the real file: "Name - Copy.xml", "Name (2).xml", "Name_backup.xml", "Name.old.xml", "~Name.xml"
const NOT_ACCOUNT = /^(settings|client_mode)\.xml$|[ _.-](backup|bak|template|copy|old|orig)(?=[ _.()-]|\.xml$)|^(backup|template|copy of)[ _.-]|~|\(\d+\)\.xml$/i;
const files = fs.readdirSync(SETTINGS, { withFileTypes: true }).filter(d => d.isFile() && /\.xml$/i.test(d.name)).map(d => d.name).sort((a, b) => a.localeCompare(b));
const parsed = [];
for (const f of files) {
  if (/^settings\.xml$/i.test(f)) continue;
  if (NOT_ACCOUNT.test(f)) { warn(`Settings\\${f}: looks like a backup/template copy (file name) - skipped`); continue; }
  const info = { file: f, hasPassword: false };
  let el;
  try {
    const raw = fs.readFileSync(path.join(SETTINGS, f));
    if (!raw.length) throw new Error('empty file');
    el = parseXml(stripPasswords(decode(raw), info));
  } catch (e) { warn(`Settings\\${f}: not a readable XML file (${e.message}) - skipped`); continue; }
  if (el.name !== 'Option') { warn(`Settings\\${f}: root element <${el.name}>, not an L2Swarm account config (<Option>) - skipped`); continue; }
  const login = txt(el, 'Name');
  if (!login) { warn(`Settings\\${f}: no <Name> (login) - an empty template? skipped`); continue; }
  const sendList = kids(child(el, 'NamesSendPartyList'), 'NameCheck').filter(n => isTrue(txt(n, 'IsSelected'))).map(n => txt(n, 'Name')).filter(Boolean);
  const skills = [];
  for (const listName of ['AutoSkillsList', 'CombatSkillsList']) {
    for (const s of child(el, listName) ? child(el, listName).children : []) {
      const sk = child(s, 'Skill'); const nm = txt(sk, 'Name');
      if (nm) skills.push({ id: +txt(sk, 'Id') || 0, name: nm, enabled: !child(s, 'IsEnabled') || isTrue(txt(s, 'IsEnabled')) });
    }
  }
  parsed.push(Object.assign(info, {
    login, loginKey: login.toLowerCase(),
    character: txt(el, 'SelectedCharacter'),
    group: txt(el, 'Group'),
    activeFollow: isTrue(txt(el, 'ActiveFollow')),
    followName: txt(el, 'FollowName'),
    followAtk: isTrue(txt(el, 'FollowAtk')),
    sendParty: isTrue(txt(el, 'SendParty')),
    sendList,
    skills,
    loginIp: txt(el, 'LoginServerIP'), loginPort: +txt(el, 'LoginServerPort') || 0,
    serverId: +txt(child(el, 'SelectedServer'), 'id') || 0,
    l2exe: txt(el, 'L2ExePath'),
    lastLoaded: Date.parse(txt(el, 'LastLoadedUtc')) || 0,
    auto: autoStart.indexOf(f.toLowerCase()),
    legacy: legacy.has(f.toLowerCase()),
  }));
}

// ------------------------------------------------------------------------------------------------ what the swarm script saw (optional)
const charsOfLogin = {};      // login -> [character names] (Logs\chars_<login>.json)
const stateOf = {};           // character (lower case) -> { cls, classId, role, level }
if (opt.logs && fs.existsSync(LOGS)) {
  const logins = new Set(parsed.map(p => p.loginKey));
  for (const f of fs.readdirSync(LOGS)) {
    let m = /^chars_([A-Za-z0-9]+)\.json$/.exec(f);
    if (m) {
      const j = readJson(path.join(LOGS, f), null); if (!j || !Array.isArray(j.names)) continue;
      let login = String(j.login || m[1]).toLowerCase(), names = j.names.map(String);
      // old swarm.js builds swapped login and name when a login had one character: the configs know the real logins
      if (!logins.has(login)) { const real = names.find(n => logins.has(n.toLowerCase())); if (real) { names = names.filter(n => n !== real).concat([String(j.login)]); login = real.toLowerCase(); } }
      names = names.filter(n => !logins.has(n.toLowerCase()));
      const set = charsOfLogin[login] || (charsOfLogin[login] = []);
      names.forEach(n => { if (!set.some(x => x.toLowerCase() === n.toLowerCase())) set.push(n); });
      continue;
    }
    m = /^swarm_state_(.+)\.json$/.exec(f);
    if (m) {
      const s = readJson(path.join(LOGS, f), null);
      if (!s || !s.name || f !== `swarm_state_${s.name}.json`) continue;
      const k = String(s.name).toLowerCase(), at = Date.parse(s.updated) || 0;
      if (!stateOf[k] || stateOf[k].at < at) stateOf[k] = { cls: s.cls || '', classId: s.classId === undefined || s.classId === null ? null : +s.classId, role: s.role || '', level: s.level || 0, at };
    }
  }
}

// ------------------------------------------------------------------------------------------------ one config per login
// several XMLs can use the same login (an old team on the same account): the AutoStart one wins, then the one swarm.config.json already
// names, then the most recently loaded one. The others are reported and added to "legacyConfigs" (SETUP leaves them alone).
const byLogin = {};
parsed.forEach(p => { (byLogin[p.loginKey] = byLogin[p.loginKey] || []).push(p); });
const chosen = [], extraConfigs = [];
for (const [login, list] of Object.entries(byLogin)) {
  const old = oldByLogin[login];
  const oldCfg = opt.use[login] ? String(opt.use[login]).toLowerCase() : (old && old.config ? String(old.config).toLowerCase() : '');
  if (opt.use[login] && !list.some(p => p.file.toLowerCase() === oldCfg)) warn(`--use ${login}=${opt.use[login]}: that login has no such config (it has ${list.map(p => p.file).join(', ')})`);
  const useCfg = opt.use[login] ? oldCfg : '';
  list.sort((a, b) => ((useCfg && (b.file.toLowerCase() === useCfg) - (a.file.toLowerCase() === useCfg)))
    || (+b.legacy === +a.legacy ? 0 : a.legacy ? 1 : -1)
    || ((oldCfg && (b.file.toLowerCase() === oldCfg) - (a.file.toLowerCase() === oldCfg)))
    || ((b.auto >= 0) - (a.auto >= 0)) || ((a.auto >= 0 && b.auto >= 0) ? a.auto - b.auto : 0)
    || (b.lastLoaded - a.lastLoaded));
  if (list[0].legacy && !oldCfg) { list.forEach(p => extraConfigs.push(p)); continue; }   // only legacy configs for this login
  chosen.push(list[0]);
  list.slice(1).forEach(p => { extraConfigs.push(p); if (!p.legacy) warn(`login ${p.login}: Settings\\${p.file} (character "${p.character || '-'}") is a second config of the same login - Settings\\${list[0].file} is used, the other one goes to legacyConfigs (left alone). To use that one instead: --use ${p.login}=${p.file}`); });
}
// keep L2Swarm's own order: AutoStart order first, then the file name
chosen.sort((a, b) => ((a.auto < 0) - (b.auto < 0)) || (a.auto - b.auto) || a.file.localeCompare(b.file));

// ------------------------------------------------------------------------------------------------ class -> role (H5 class ids)
// [name, parent class id, role or ''] - role '' = the swarm has no role for that line (yet); a base / 1st class is ambiguous
const CLASSES = {
  0: ['Human Fighter', -1, ''], 1: ['Warrior', 0, ''], 2: ['Gladiator', 1, ''], 3: ['Warlord', 1, ''], 4: ['Knight', 0, 'sk'], 5: ['Paladin', 4, 'sk'],
  6: ['Dark Avenger', 4, 'sk'], 7: ['Rogue', 0, ''], 8: ['Treasure Hunter', 7, 'dagger'], 9: ['Hawkeye', 7, ''],
  10: ['Human Mystic', -1, ''], 11: ['Wizard', 10, ''], 12: ['Sorceror', 11, 'nuker'], 13: ['Necromancer', 11, 'necromancer'], 14: ['Warlock', 11, 'nuker'],
  15: ['Cleric', 10, 'bishop'], 16: ['Bishop', 15, 'bishop'], 17: ['Prophet', 15, ''],
  18: ['Elven Fighter', -1, ''], 19: ['Elven Knight', 18, ''], 20: ['Temple Knight', 19, 'sk'], 21: ['Swordsinger', 19, ''], 22: ['Elven Scout', 18, ''],
  23: ['Plainswalker', 22, 'dagger'], 24: ['Silver Ranger', 22, ''],
  25: ['Elven Mystic', -1, ''], 26: ['Wizard', 25, 'nuker'], 27: ['Spellsinger', 26, 'nuker'], 28: ['Elemental Summoner', 26, 'nuker'],
  29: ['Elven Oracle', 25, 'healer'], 30: ['Elven Elder', 29, 'healer'],
  31: ['Dark Fighter', -1, ''], 32: ['Palus Knight', 31, ''], 33: ['Shillien Knight', 32, 'sk'], 34: ['Bladedancer', 32, ''], 35: ['Assassin', 31, ''],
  36: ['Abyss Walker', 35, 'dagger'], 37: ['Phantom Ranger', 35, ''],
  38: ['Dark Mystic', -1, ''], 39: ['Wizard', 38, 'nuker'], 40: ['Spellhowler', 39, 'nuker'], 41: ['Phantom Summoner', 39, 'nuker'],
  42: ['Shillien Oracle', 38, 'shilliensaint'], 43: ['Shillien Elder', 42, 'shilliensaint'],
  44: ['Orc Fighter', -1, ''], 45: ['Orc Raider', 44, 'destroyer'], 46: ['Destroyer', 45, 'destroyer'], 47: ['Monk', 44, ''], 48: ['Tyrant', 47, ''],
  49: ['Orc Mystic', -1, ''], 50: ['Orc Shaman', 49, ''], 51: ['Overlord', 50, ''], 52: ['Warcryer', 50, 'doomcryer'],
  53: ['Dwarven Fighter', -1, ''], 54: ['Scavenger', 53, 'spoiler'], 55: ['Bounty Hunter', 54, 'spoiler'], 56: ['Artisan', 53, 'crafter'], 57: ['Warsmith', 56, 'crafter'],
  88: ['Duelist', 2, ''], 89: ['Dreadnought', 3, ''], 90: ['Phoenix Knight', 5, 'sk'], 91: ['Hell Knight', 6, 'sk'], 92: ['Sagittarius', 9, ''],
  93: ['Adventurer', 8, 'dagger'], 94: ['Archmage', 12, 'nuker'], 95: ['Soultaker', 13, 'necromancer'], 96: ['Arcana Lord', 14, 'nuker'],
  97: ['Cardinal', 16, 'bishop'], 98: ['Hierophant', 17, ''], 99: ["Eva's Templar", 20, 'sk'], 100: ['Sword Muse', 21, ''], 101: ['Wind Rider', 23, 'dagger'],
  102: ['Moonlight Sentinel', 24, ''], 103: ['Mystic Muse', 27, 'nuker'], 104: ['Elemental Master', 28, 'nuker'], 105: ["Eva's Saint", 30, 'healer'],
  106: ['Shillien Templar', 33, 'sk'], 107: ['Spectral Dancer', 34, ''], 108: ['Ghost Hunter', 36, 'dagger'], 109: ['Ghost Sentinel', 37, ''],
  110: ['Storm Screamer', 40, 'nuker'], 111: ['Spectral Master', 41, 'nuker'], 112: ['Shillien Saint', 43, 'shilliensaint'], 113: ['Titan', 46, 'destroyer'],
  114: ['Grand Khavatari', 48, ''], 115: ['Dominator', 51, ''], 116: ['Doomcryer', 52, 'doomcryer'], 117: ['Fortune Seeker', 55, 'spoiler'], 118: ['Maestro', 57, 'crafter'],
  123: ['Kamael Soldier', -1, ''], 124: ['Kamael Soldier', -1, ''], 125: ['Trooper', 123, ''], 126: ['Warder', 124, ''], 127: ['Berserker', 125, 'doombringer'],
  128: ['Soul Breaker', 125, 'inspector'], 129: ['Soul Breaker', 126, 'inspector'], 130: ['Arbalester', 126, ''], 131: ['Doombringer', 127, 'doombringer'],
  132: ['Soul Hound', 128, 'inspector'], 133: ['Soul Hound', 129, 'inspector'], 134: ['Trickster', 130, ''], 135: ['Inspector', 126, 'inspector'], 136: ['Judicator', 135, 'inspector'],
};
const BASE_HINT = { 0: 'sk / dagger', 10: 'bishop / nuker / necromancer', 18: 'sk / dagger', 25: 'healer / nuker', 31: 'sk / dagger', 38: 'shilliensaint / nuker',
  44: 'destroyer', 49: 'doomcryer', 53: 'spoiler / crafter', 123: 'doombringer / inspector', 124: 'inspector', 7: 'dagger', 11: 'nuker / necromancer', 125: 'doombringer / inspector', 32: 'sk', 19: 'sk', 4: 'sk' };
// same table as ROLE_CLASS_PLAN in swarm.js (the default 20 / 40 / 76 path per role)
const ROLE_CLASS_PLAN = {
  sk: ['Palus Knight', 'Shillien Knight', 'Shillien Templar'], bishop: ['Cleric', 'Bishop', 'Cardinal'],
  destroyer: ['Orc Raider', 'Destroyer', 'Titan'], doombringer: ['Trooper', 'Berserker', 'Doombringer'],
  necromancer: ['Wizard', 'Necromancer', 'Soultaker'], inspector: ['Trooper', 'Soul Breaker', 'Soul Hound'],
  doomcryer: ['Orc Shaman', 'Warcryer', 'Doomcryer'], shilliensaint: ['Shillien Oracle', 'Shillien Elder', 'Shillien Saint'],
  crafter: ['Artisan', 'Warsmith', 'Maestro'], spoiler: ['Scavenger', 'Bounty Hunter', 'Fortune Seeker'],
  healer: ['Elven Oracle', 'Elven Elder', "Eva's Saint"], dagger: ['Rogue', 'Treasure Hunter', 'Adventurer'],
};
const tierOf = (id) => { let t = 0, c = CLASSES[id]; while (c && c[1] >= 0 && t < 5) { t++; c = CLASSES[c[1]]; } return c ? t : -1; };
// the 1st / 2nd / 3rd class of a character that already has its 2nd or 3rd class (the line below a 2nd class is fixed)
const SUMMONERS = new Set([14, 28, 41, 96, 104, 111]);
const childrenOf = (id) => Object.keys(CLASSES).map(Number).filter(k => CLASSES[k][1] === id && k !== 135);
function classPlanFor(id, role) {
  if (!CLASSES[id]) return null;
  let start = id;
  // a 1st class: the 2nd class is open - take the one child that fits the role (a nuker never becomes a summoner by itself)
  if (tierOf(id) === 1 && role) {
    const fit = childrenOf(id).filter(k => CLASSES[k][2] === role && !SUMMONERS.has(k));
    if (fit.length !== 1) return null;
    start = fit[0];
  } else if (tierOf(id) < 2) return null;
  const chain = []; let c = start; while (c >= 0 && CLASSES[c]) { chain.unshift(c); c = CLASSES[c][1]; }
  if (chain.length === 3) { const third = Object.keys(CLASSES).find(k => CLASSES[k][1] === chain[2] && +k !== 135); if (third === undefined) return null; chain.push(+third); }
  if (chain.length !== 4) return null;
  return chain.slice(1).map(k => CLASSES[k][0]);
}
const classRole = (id) => (CLASSES[id] ? CLASSES[id][2] : '');
const className = (id) => (CLASSES[id] ? CLASSES[id][0] : '');

// skills in the L2Swarm XML lists -> a role guess (weak: configs are often copies of another account)
const SKILL_ROLE = [
  [/^(Frenzy|Zealot|Guts|Battle Roar|Rage)$/i, 'destroyer'],
  [/^(Spoil|Sweeper|Spoil Festival)$/i, 'spoiler'],
  [/^(Summon (Mechanic|Siege|Wild Hog|Swoop|Big Boom) (Golem|Cannon)|Create Item)$/i, 'crafter'],
  [/^Stigma of Shilen$/i, 'shilliensaint'],
  [/^(Greater Battle Heal|Greater Group Heal|Restore Life|Mass Resurrection)$/i, 'bishop'],
  [/^(Death Spike|Corpse Burst|Curse Gloom|Day of Doom|Summon Zombie|Curse Death Link)$/i, 'necromancer'],
  [/^(Chant of (Victory|Fury|Evasion|Rage|Flame|Battle)|Magnus' Chant|War Chant|Earth Chant|Pa'agrian Gift)$/i, 'doomcryer'],
  [/^(Backstab|Deadly Blow|Lethal Blow|Blinding Blow)$/i, 'dagger'],
  [/^(Death Mark|Surrender to Dark|Dark Weapon|Soul of Pain|Soul Strike|Aura Cannon)$/i, 'inspector'],
  [/^(Smash|Rush Impact|Earthquake|Howl)$/i, 'doombringer'],
  [/^(Aggression|Aura of Hate|Hate Aura|Shield Strike|Touch of Death|Ultimate Defense|Shackle|Hex)$/i, 'sk'],
  [/^(Hurricane|Aqua Swirl|Twister|Blaze|Prominence|Hydro Blast|Solar Spark|Shadow Spark|Shadow Flare|Death Breath|Ice Bolt|Solar Flare)$/i, 'nuker'],
];
function skillRole(skills) {
  const score = {};
  for (const s of skills) for (const [rx, role] of SKILL_ROLE) if (rx.test(s.name)) score[role] = (score[role] || 0) + (s.enabled ? 2 : 1);
  const best = Object.entries(score).sort((a, b) => b[1] - a[1]);
  if (!best.length) return { role: '', why: '' };
  if (best.length > 1 && best[0][1] === best[1][1]) return { role: '', why: `skills point to ${best[0][0]} or ${best[1][0]}` };
  return { role: best[0][0], why: 'skills in the XML' };
}
// heals/mystic-only skill lists: no role, but a hint
function skillHint(skills) {
  if (skills.some(s => /^(Heal|Battle Heal|Group Heal|Greater Heal|Resurrection)$/i.test(s.name))) return 'healer type (bishop / healer / shilliensaint)';
  if (skills.some(s => /^(Wind Strike|Ice Bolt|Self Heal)$/i.test(s.name))) return 'mystic (nuker / bishop / healer / ...)';
  return '';
}

// ------------------------------------------------------------------------------------------------ build the accounts
// in-game / out-of-game per character: L2Swarm stores no such flag; the kit's own Settings\client_mode.json does (when it exists)
const clientModes = readJson(path.join(SETTINGS, 'client_mode.json'), {}) || {};
const accounts = chosen.map(p => {
  const old = oldByLogin[p.loginKey];
  const a = {
    login: p.login, character: p.character, config: p.file, party: '', role: '', autoStart: haveAutoStart ? p.auto >= 0 : true,
    _src: { character: 'xml', role: '', party: '' }, _p: p, _old: old, _notes: [],
  };
  if (old) {
    if (old.character !== undefined && String(old.character) !== '' && String(old.character) !== p.character) {
      a._notes.push(`swarm.config.json plays "${old.character}", the XML selects "${p.character || '-'}" (config kept; SETUP writes it into the XML)`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(opt.set, p.loginKey)) { a.character = opt.set[p.loginKey]; a._src.character = '--set'; }
  else if (old && old.character) { a.character = String(old.character); a._src.character = 'config'; }
  if (!a.character) a._notes.push('no character selected yet: choose one with --set ' + p.login + '=<name>' + (charsOfLogin[p.loginKey] && charsOfLogin[p.loginKey].length ? ` (known on this login: ${charsOfLogin[p.loginKey].join(', ')})` : ' (log in once to see the list)'));
  else if (charsOfLogin[p.loginKey] && charsOfLogin[p.loginKey].length && !charsOfLogin[p.loginKey].some(n => n.toLowerCase() === a.character.toLowerCase())) {
    a._notes.push(`"${a.character}" was not in this login's character list the last time it logged in (${charsOfLogin[p.loginKey].join(', ')})`);
  }
  if (a.character && clientModes[a.character]) a.clientMode = String(clientModes[a.character]);
  if (!p.hasPassword) a._notes.push('no password saved in the XML - L2Swarm cannot log it in (enter it once in L2Swarm and save)');
  return a;
});
for (const login of Object.keys(opt.set).concat(Object.keys(opt.role), Object.keys(opt.party))) {
  if (!accounts.some(a => a.login.toLowerCase() === login)) warn(`--set/--role/--party ${login}: no account config with that login in Settings\\`);
}
// the same character on two logins (one of them is stale): the AutoStart one stays enabled
const charOwner = {};
for (const a of accounts) {
  if (!a.character) continue;
  const k = a.character.toLowerCase();
  if (!charOwner[k]) { charOwner[k] = a; continue; }
  const keep = charOwner[k], other = a;
  other.enabled = false; other.autoStart = false;
  other._notes.push(`character "${a.character}" is also played by ${keep.login} (${keep.config}) - this entry is disabled`);
  if (!(other._old && other._old.enabled === false)) warn(`character ${a.character}: selected on ${keep.login} (${keep.config}) and on ${other.login} (${other.config}) - ${other.login} is disabled (enabled: false). Fix with --set ${other.login}=<other character>.`);
}
const active = accounts.filter(a => a.enabled !== false && a.character);
const byChar = {}; active.forEach(a => { byChar[a.character.toLowerCase()] = a; });

// ---------------- parties
function followTarget(a) {
  const p = a._p;
  if (!p.activeFollow || !p.followName) return null;
  const t = byChar[p.followName.toLowerCase()];
  return t && t !== a && !circleLeaders.has(a) ? t : null;
}
// follow circles (A follows B, B follows A): one of the circle leads - the one that sends party invites, else the first in AutoStart,
// else by name. It is treated as following nobody (SETUP turns its follow off).
const circleLeaders = new Set();
for (const start of active) {
  const pathList = []; let cur = start;
  while (cur && !pathList.includes(cur)) { pathList.push(cur); cur = followTarget(cur); }
  if (!cur) continue;
  const circle = pathList.slice(pathList.indexOf(cur));
  if (circle.some(x => circleLeaders.has(x))) continue;
  const lead = circle.slice().sort((x, y) => (+y._p.sendParty - +x._p.sendParty) || ((x._p.auto < 0) - (y._p.auto < 0)) || (x._p.auto - y._p.auto) || x.character.localeCompare(y.character))[0];
  circleLeaders.add(lead);
  lead._notes.push('leads its follow circle - SETUP turns its follow off');
  warn(`follow circle: ${circle.map(x => x.character).join(' -> ')} -> ${circle[0].character} - ${lead.character} is taken as the leader`);
}
function rootOf(a) {
  const seen = new Set(); let cur = a;
  while (cur && !seen.has(cur)) { seen.add(cur); const n = followTarget(cur); if (!n) return cur; cur = n; }
  return a;
}
const followers = new Set(); active.forEach(a => { const t = followTarget(a); if (t) followers.add(t); });
for (const a of active) {
  const forced = opt.party[a.login.toLowerCase()];
  if (forced) { a.party = forced; a._src.party = '--party'; continue; }
  if (a._old && a._old.party) { a.party = String(a._old.party); a._src.party = 'config'; continue; }
  const t = followTarget(a);
  if (t) { a.party = rootOf(a).character; a._src.party = 'follow'; continue; }
  if (a._p.activeFollow && a._p.followName) a._notes.push(`follows "${a._p.followName}", which is no character of an imported account`);
  if (followers.has(a)) { a.party = a.character; a._src.party = 'leader'; continue; }
  a.party = ''; // decided below (invite list / group)
}
// accounts that follow nobody and that nobody follows: a leader's invite list, else their L2Swarm group's majority party
for (const a of active) {
  if (a.party) continue;
  const inv = active.find(l => l !== a && l._p.sendParty && l._p.sendList.some(n => n.toLowerCase() === a.character.toLowerCase()));
  if (inv) { a.party = inv.party || inv.character; a._src.party = 'invite list'; continue; }
  const mates = active.filter(o => o !== a && o.party && o._p.group && o._p.group === a._p.group);
  const count = {}; mates.forEach(o => { count[o.party] = (count[o.party] || 0) + 1; });
  const best = Object.entries(count).sort((x, y) => y[1] - x[1])[0];
  if (best && best[1] >= 2 && a._p.group && !/^(ungrouped|)$/i.test(a._p.group)) { a.party = best[0]; a._src.party = 'group'; a._notes.push(`follows nobody; put into party ${best[0]} because its L2Swarm group "${a._p.group}" is that party - SETUP will make it follow ${best[0]}`); continue; }
  a.party = a.character; a._src.party = 'solo';
}
// the party leader must be a character of an enabled account
for (const a of active) {
  if (a.party && !byChar[a.party.toLowerCase()]) { a._notes.push(`party leader "${a.party}" is not a character of an enabled account`); }
  else if (a.party) a.party = byChar[a.party.toLowerCase()].character;   // exact spelling
}
// disabled accounts / accounts without a character: the old entry's party, else whom the XML follows, else their own
for (const a of accounts) {
  if (a.character && a.enabled !== false) continue;
  const forced = opt.party[a.login.toLowerCase()];
  const t = a._p.activeFollow && a._p.followName ? byChar[a._p.followName.toLowerCase()] : null;
  if (forced) { a.party = forced; a._src.party = '--party'; }
  else if (a._old && a._old.party) { a.party = String(a._old.party); a._src.party = 'config'; }
  else if (t) { a.party = t.party || t.character; a._src.party = 'follow'; }
  else { a.party = a.character || ''; a._src.party = ''; }
}

// ---------------- roles
for (const a of accounts) {
  const st = a.character ? stateOf[a.character.toLowerCase()] : null;
  const forced = opt.role[a.login.toLowerCase()];
  let role = '', src = '', hint = '';
  if (forced !== undefined) { role = forced; src = '--role'; }
  else if (a._old && a._old.role) { role = String(a._old.role); src = 'config'; }
  else if (st && st.role && ROLES.includes(st.role)) { role = st.role; src = 'swarm state'; }
  else if (st && st.classId !== null && classRole(st.classId)) { role = classRole(st.classId); src = 'class ' + (st.cls || className(st.classId)); }
  else {
    const g = skillRole(a._p.skills);
    if (g.role) { role = g.role; src = 'skills (guess)'; }
    else {
      if (st && st.classId !== null && CLASSES[st.classId]) hint = `class ${st.cls || className(st.classId)}: ${BASE_HINT[st.classId] || 'no swarm role for this class line yet'}`;
      else hint = g.why || skillHint(a._p.skills) || 'class unknown until the first login';
    }
  }
  a.role = role; a._src.role = src;
  if (!role && a.character) a._notes.push(`TODO role: ${hint} - set it with --role ${a.login}=<role> or in swarm.config.json`);
  // class path (user rule 2026-10-10): the importer NEVER writes a class plan. A class change only happens with a plan the user
  // approved on the dashboard (Classes page -> Scripts/data/class_plans.json); imported characters start with "no plan" (warning shown).
  if (a.character && !(a._old && Array.isArray(a._old.classPlan))) a._notes.push('no class plan yet - choose and approve one on the dashboard (Classes page); until then this character never changes class');
}

// ---------------- groups: keep the L2Swarm group names the user already has (SETUP would rename them to "Party <leader>")
const groupFmt = (existing && existing.groups && existing.groups.format) || 'Party {party}';
const overrides = Object.assign({}, (existing && existing.groups && existing.groups.overrides) || {});
const newOverrides = {};
const parties = {};
active.forEach(a => { if (a.party) (parties[a.party] = parties[a.party] || []).push(a); });
for (const [leader, mem] of Object.entries(parties)) {
  if (overrides[leader]) continue;
  const gs = [...new Set(mem.map(m => m._p.group))];
  const want = groupFmt.replace('{party}', leader);
  if (gs.length === 1 && gs[0] && gs[0] !== want && !/^ungrouped$/i.test(gs[0])) {
    // another party already uses that group name -> no override (SETUP's "Party <leader>" keeps parties apart)
    const shared = Object.entries(parties).some(([l2, m2]) => l2 !== leader && m2.some(m => m._p.group === gs[0]));
    if (!shared) newOverrides[leader] = gs[0];
  } else if (gs.length > 1) {
    mem.filter(m => m._p.group !== want).forEach(m => m._notes.push(`L2Swarm group "${m._p.group || '-'}" -> "${want}" (SETUP; its party has mixed groups)`));
  }
}

// ------------------------------------------------------------------------------------------------ the result config
// main leader (new config only): the leader whose own config comes first in L2Swarm's AutoStart list (people put the main team first),
// else the biggest party
const leaderAuto = (l) => { const a = byChar[l.toLowerCase()]; return a && a._p.auto >= 0 ? a._p.auto : 1e9; };
const leaders = Object.entries(parties).filter(([, m]) => m.length > 1).concat(Object.entries(parties).filter(([, m]) => m.length <= 1))
  .sort((x, y) => (x[1].length > 1 ? 0 : 1) - (y[1].length > 1 ? 0 : 1) || leaderAuto(x[0]) - leaderAuto(y[0]) || y[1].length - x[1].length);
const mainLeader = (existing && existing.mainLeader && byChar[String(existing.mainLeader).toLowerCase()]) ? existing.mainLeader : (leaders[0] ? leaders[0][0] : '');
const mostCommon = (vals) => { const c = {}; vals.filter(v => v !== '' && v !== 0 && v !== undefined).forEach(v => { c[v] = (c[v] || 0) + 1; }); const b = Object.entries(c).sort((x, y) => y[1] - x[1])[0]; return b ? b[0] : ''; };
const srv = { loginIp: mostCommon(chosen.map(p => p.loginIp)), loginPort: +mostCommon(chosen.map(p => p.loginPort)) || 0, serverId: +mostCommon(chosen.map(p => p.serverId)) || 0 };
const exe = mostCommon(chosen.map(p => p.l2exe));
const serverDiff = chosen.filter(p => p.loginIp && srv.loginIp && p.loginIp !== srv.loginIp);
if (serverDiff.length) warn(`${serverDiff.length} account(s) use another login server than ${srv.loginIp} (${serverDiff.slice(0, 5).map(p => p.file).join(', ')}${serverDiff.length > 5 ? ', ...' : ''}) - SETUP writes server.loginIp into EVERY account config`);

function cleanAccount(a) {
  const o = {};
  const old = a._old || {};
  // known fields in a fixed order; everything else the user had in the entry is kept as it was
  o.login = old.login || a.login;
  o.character = a.character;
  o.config = a.config;
  o.party = a.party;
  o.role = a.role;
  if (a.classPlan) o.classPlan = a.classPlan;
  o.autoStart = a.autoStart;
  if (a.enabled === false) o.enabled = false;
  if (a.clientMode) o.clientMode = a.clientMode;
  if (!a.character) o.note = 'TODO: choose the character (import_l2swarm.js --set ' + a.login + '=<name>)';
  else if (!a.role) o.note = 'TODO: set the role';
  for (const [k, v] of Object.entries(old)) {
    if (k === 'login') continue;
    if (['character', 'party', 'role'].includes(k) && o[k] !== undefined) continue;                  // decided above (old value wins there already)
    if (k === 'config' && opt.use[a.login.toLowerCase()]) continue;                                    // --use wins over the old entry
    if (k === 'autoStart' || k === 'enabled' || k === 'config' || k === 'classPlan' || k === 'note') { o[k] = v; continue; }  // the user's edit wins
    o[k] = v;
  }
  if (old.note && o.note !== old.note) o.note = old.note;
  return o;
}
// entries of the old config whose login has no XML any more are kept untouched (SETUP creates a config for them and asks the password)
const xmlLogins = new Set(accounts.map(a => a.login.toLowerCase()));
const orphan = oldAccounts.filter(a => !xmlLogins.has(String(a.login).toLowerCase()));
orphan.forEach(a => warn(`swarm.config.json account ${a.login} has no config with that login in Settings\\ - kept as it is (SETUP -Apply would create one and ask for its password)`));

// keep the old config's order for known logins, then the new ones in L2Swarm's order
const outAccounts = [];
const placed = new Set();
for (const oa of oldAccounts) {
  const k = String(oa.login).toLowerCase();
  const a = accounts.find(x => x.login.toLowerCase() === k);
  outAccounts.push(a ? cleanAccount(a) : oa); placed.add(k);
}
for (const a of accounts) if (!placed.has(a.login.toLowerCase())) outAccounts.push(cleanAccount(a));

let base;
if (existing && !opt.replace) base = JSON.parse(JSON.stringify(existing));
else if (existing && opt.replace) base = JSON.parse(JSON.stringify(existing));
else {
  base = EXAMPLE ? readJson(EXAMPLE, {}) : {};
  if (!base || typeof base !== 'object') base = {};
  base['//'] = 'Made by docs\\plan\\tools\\import_l2swarm.js from the L2Swarm account configs in Settings\\ (every field is explained in swarm.config.example.json). No passwords in this file.';
  base.version = base.version || 1;
  base.paths = Object.assign({ root: '' }, base.paths || {});
  base.paths.root = '';
  if (exe) base.paths.l2Client = exe;
  base.server = Object.assign({}, base.server || {});
  if (srv.loginIp) { base.server.loginIp = srv.loginIp; if (!base.server.gameIp || base.server.gameIp === (readJson(EXAMPLE, {}).server || {}).gameIp) base.server.gameIp = srv.loginIp; }
  if (srv.loginPort) base.server.loginPort = srv.loginPort;
  if (srv.serverId) base.server.serverId = srv.serverId;
  base.mcp = Object.assign({}, base.mcp || {}, mcpPort ? { port: mcpPort } : {});
  base.mainLeader = mainLeader;
  base.clanLeader = mainLeader;
  base.dailyLeaders = mainLeader ? [mainLeader] : [];
  base.dailyHallTeam = [];
  base.kamaloka = { hallTeams: {} };
  base.teamRoutes = {};
  base.groups = Object.assign({ format: 'Party {party}' }, base.groups || {}, { overrides: {} });
  // account templates for NEW accounts: one of your own configs per role (SETUP copies it once WITHOUT login/password/character)
  const rt = {};
  active.forEach(a => { if (a.role && !rt[a.role]) rt[a.role] = a.config; });
  const member = active.find(a => a.party && a.party !== a.character) || active[0];
  if (member) rt.default = member.config;
  base.roleTemplates = rt;
  base.legacyConfigs = [];
}
base.groups = base.groups || { format: 'Party {party}' };
base.groups.overrides = Object.assign({}, base.groups.overrides || {}, newOverrides);
if (!base.mainLeader && mainLeader) base.mainLeader = mainLeader;
const leg = new Set((base.legacyConfigs || []).map(String));
extraConfigs.forEach(p => { if (![...leg].some(l => l.toLowerCase() === p.file.toLowerCase())) leg.add(p.file); });
base.legacyConfigs = [...leg];
base.accounts = outAccounts;

// ------------------------------------------------------------------------------------------------ output
function oneLine(o) { return '{ ' + Object.entries(o).map(([k, v]) => JSON.stringify(k) + ': ' + JSON.stringify(v)).join(', ') + ' }'; }
function serialize(cfg) {
  const tmp = Object.assign({}, cfg, { accounts: '__ACCOUNTS__' });
  const s = JSON.stringify(tmp, null, 2);
  const body = cfg.accounts.length ? '[\n' + cfg.accounts.map(a => '    ' + oneLine(a)).join(',\n') + '\n  ]' : '[]';
  return s.replace('"__ACCOUNTS__"', () => body) + '\n';
}
const pad = (s, n) => { s = String(s === undefined || s === null ? '' : s); return s.length >= n ? s.slice(0, n - 1) + '~' : s + ' '.repeat(n - s.length); };
const rows = accounts.map(a => ({ a, out: outAccounts.find(o => String(o.login).toLowerCase() === a.login.toLowerCase()) }));

if (opt.json) {
  console.log(JSON.stringify({ root: ROOT, config: CFG_FILE, accounts: rows.map(r => Object.assign({}, r.out, { _sources: r.a._src, _notes: r.a._notes, _otherCharacters: (charsOfLogin[r.a.login.toLowerCase()] || []).filter(n => n.toLowerCase() !== String(r.a.character).toLowerCase()) })), legacyConfigs: base.legacyConfigs, groupOverrides: base.groups.overrides, mainLeader: base.mainLeader, warnings }, null, 2));
} else {
  const L = [];
  L.push('');
  L.push(`L2Swarm import   folder ${ROOT}`);
  L.push(`                 config ${CFG_FILE} (${existing ? (opt.replace ? 'exists - REPLACE accounts' : 'exists - MERGE: your entries are kept') : 'new'})`);
  L.push(`                 ${parsed.length} account config(s) read, ${accounts.length} login(s), ${extraConfigs.length} extra config(s) of the same logins, AutoStart: ${haveAutoStart ? autoStart.length + ' entries' : 'unknown'}`);
  if (!opt.quiet) {
    L.push('');
    L.push(`  ${pad('#', 4)}${pad('login', 15)}${pad('character', 17)}${pad('party', 17)}${pad('role', 15)}${pad('from', 15)}${pad('auto', 5)}${pad('config', 20)}other characters on this login`);
    L.push('  ' + '-'.repeat(130));
    rows.forEach((r, i) => {
      const a = r.a, o = r.out;
      const others = (charsOfLogin[a.login.toLowerCase()] || []).filter(n => n.toLowerCase() !== String(o.character).toLowerCase());
      const flag = o.enabled === false ? ' (disabled)' : '';
      L.push(`  ${pad(i + 1, 4)}${pad(a.login, 15)}${pad(o.character || '(choose!)', 17)}${pad(o.party || '-', 17)}${pad(o.role || 'TODO', 15)}${pad(a._src.role || '-', 15)}${pad(o.autoStart === false ? 'no' : 'yes', 5)}${pad(a.config, 20)}${others.join(', ')}${flag}`);
    });
    const notes = rows.filter(r => r.a._notes.length);
    if (notes.length) {
      L.push(''); L.push('Notes:');
      notes.forEach(r => r.a._notes.forEach(n => L.push(`  ${r.a.login}${r.a.character ? ' (' + r.a.character + ')' : ''}: ${n}`)));
    }
  }
  L.push('');
  L.push('Parties (leader: members):');
  for (const [leader, mem] of Object.entries(parties).sort((x, y) => y[1].length - x[1].length)) {
    L.push(`  ${pad(leader, 17)}${pad(mem.length, 3)} ${mem.filter(m => m.character !== leader).map(m => m.character).join(', ')}  -> L2Swarm group "${base.groups.overrides[leader] || groupFmt.replace('{party}', leader)}"`);
  }
  L.push(`  main leader: ${base.mainLeader || '(none - set "mainLeader")'}`);
  if (extraConfigs.length) L.push(`  not managed (legacyConfigs): ${extraConfigs.map(p => p.file).join(', ')}`);
  const todoChar = rows.filter(r => !r.out.character).length, todoRole = rows.filter(r => r.out.character && !r.out.role && r.out.enabled !== false).length;
  if (warnings.length) { L.push(''); L.push(`Warnings (${warnings.length}):`); warnings.forEach(w => L.push('  ! ' + w)); }
  L.push('');
  L.push(`TODO: ${todoChar} account(s) without a character, ${todoRole} without a role.` + (todoChar + todoRole ? ' Use --set login=Character / --role login=role, or edit swarm.config.json.' : ''));
  console.log(L.join('\n'));
}

if (!opt.write) {
  if (!opt.json) console.log(`DRY RUN - nothing written. Run again with --write to ${existing ? 'update' : 'create'} ${CFG_FILE}.`);
  process.exit(0);
}
const text = serialize(base);
JSON.parse(text);   // never write something that does not parse
if (existing) {
  const cur = fs.readFileSync(CFG_FILE, 'utf8');
  if (cur === text) { console.log('swarm.config.json is already up to date - nothing written.'); process.exit(0); }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const bdir = path.join(SETTINGS, 'backup', `${stamp}_import`);
  fs.mkdirSync(bdir, { recursive: true });
  fs.copyFileSync(CFG_FILE, path.join(bdir, path.basename(CFG_FILE)));
  console.log(`backup: ${path.join(bdir, path.basename(CFG_FILE))}`);
}
const tmpFile = CFG_FILE + '.tmp';
fs.writeFileSync(tmpFile, text, 'utf8');
fs.renameSync(tmpFile, CFG_FILE);
console.log(`written: ${CFG_FILE} (${outAccounts.length} accounts). Next: review it, then SETUP.cmd (dry run) and SETUP.cmd -Apply.`);
