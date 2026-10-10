// L2Swarm team dashboard. Run: node <install>\Dashboard\server.js  (or Dashboard\start.cmd). Port/paths: swarm.config.json
// Open http://127.0.0.1:8090 on this PC, or http://<LAN-IP>:8090/?key=<Dashboard\key.txt> from the phone.
// Reads Logs/swarm_state_<name>.json (written by swarm.js every 5 s), the swarm logs, the raid boss
// database and the account configs, and sends commands through the L2Swarm MCP server (127.0.0.1:8083):
//   - party command  = party chat from the party leader  (everyone in that party obeys)
//   - character command = party chat from that character (only its own window obeys)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// Portable install (2026-10-07): root, ports, leaders and parties come from swarm.config.json (docs/plan/tools/swarm_config.js);
// without that file everything falls back to the old values (root = the folder above Dashboard).
const SC = require(path.join(__dirname, '..', 'docs', 'plan', 'tools', 'swarm_config.js'));
const ROOT = SC.ROOT;
const ROOT_FWD = SC.ROOT_FWD;   // forward slashes, for paths inside generated L2Swarm scripts
const LOGS = path.join(ROOT, 'Logs');
const PLAN = path.join(ROOT, 'docs', 'plan');
const DATA = path.join(ROOT, 'Scripts', 'data');
const SETTINGS = path.join(ROOT, 'Settings');
const PORT = SC.dashboardPort;
const MCP = SC.mcpUrl;
const SELF = 'http://127.0.0.1:' + PORT;   // this server, for its own API calls
const MAIN_LEADER = SC.mainLeader;

// Swarm commands that may be sent (first word). Since the command center (2026-10-08) the full list also comes from Dashboard/commands.js
// (the one command catalog, every !command handled in swarm.js handleSay); see the ALLOWED union right below.
const CMDS = require('./commands');
const ALLOWED_OLD = ['!status', '!dungeon', '!jointraid', '!clanskill', '!gearup', '!dawn', '!soul', '!clanwh', '!assist', '!clancreate', '!clanlevel', '!clanquest', '!routetest', '!draintest', '!shopscan', '!gearplan', '!upgrade', '!enchant', '!dyes', '!dyeplan', '!park', '!level', '!supply', '!collect', '!classchange', '!cabinet', '!restock', '!buff', '!stop', '!soe',
  '!goto', '!mark', '!places', '!gk', '!town', '!kill', '!kamaloka', '!mission', '!autolevel', '!assist', '!raidhunt', '!farm', '!camp', '!zone', '!raidbuff', '!buffauto', '!dumpskills', '!sell', '!navtest',
  '!siege', '!siegereg'];   // fortress / castle sieges (user 2026-10-08, Dashboard/sieges.js)
const ALLOWED = [...new Set(ALLOWED_OLD.concat(CMDS.SWARM_WORDS))];   // command center 2026-10-08: + every swarm command in the catalog
// Quick buttons / dropdown entries shown in the UI.
const TASKS = [
  // Leader-controlled design (2026-10-04): the leader decides; members only follow + assist
  { label: 'Level (regroup in Giran → leader teleports the team to a spot)', cmd: '!level' },
  { label: 'Supplies: leader buys SoE/SoR/shots/spirit ore in Giran + hands out', cmd: '!supply' },
  { label: 'Collect adena to the leader (keep 2M <40 · 2.5M 40-75 · 3M 76+)', cmd: '!collect' },
  // gear (user 2026-10-07: "a command to a character OR team to go and get better gear")
  { label: 'Better gear now (party to Giran, everyone buys + puts on upgrades)', cmd: '!gearup' },
  { label: 'Better gear for one character… (party to Giran, only that one buys)', cmd: '!gearup ', needsArg: 'text' },
  { label: 'Gear plan (dry run: what each would buy → Logs/gear_plan_<name>.json)', cmd: '!gearplan' },
  { label: 'Dungeon: level inside… (e.g. Branded, Sacrifice, Worship)', cmd: '!dungeon ', needsArg: 'text' },
  { label: 'Dungeon off (normal hunting spots)', cmd: '!dungeon off' },
  { label: 'Soul crystals: fetch from Gideon (Oren, lvl 40+)', cmd: '!soul get' },
  { label: 'Soul crystals: store finished ones (Giran warehouse)', cmd: '!soul store' },
  { label: 'Soul crystals: status in party chat', cmd: '!soul' },
  { label: 'Seven Signs: sign up with the Lords of Dawn (Giran)', cmd: '!dawn' },
  { label: 'Class change now (Community Board → Career → Professions)', cmd: '!classchange' },
  { label: 'Cabinet setting… (e.g. "Forward Drop on")', cmd: '!cabinet ', needsArg: 'text' },
  { label: 'Status', cmd: '!status' },
  { label: 'Rebuff', cmd: '!buff' },
  { label: 'Sell marked items + junk now', cmd: '!sell' },
  { label: 'Raid hunter (bosses in level range)', cmd: '!raidhunt' },
  { label: 'Stop raid hunter', cmd: '!raidhunt stop' },
  { label: 'Raid mission… (pick boss)', cmd: '!mission raid ', needsArg: 'boss' },
  { label: 'Joint raid… (several parties on one boss: "<boss> with <leader>,<leader>" — order the MAIN party)', cmd: '!jointraid ', needsArg: 'text' },
  { label: 'Learn the clan focus skill now (clan leader, at Gesto)', cmd: '!clanskill' },
  { label: 'Kamaloka mission', cmd: '!mission kamaloka' },
  { label: 'Siege… (e.g. "fort Shanty" or "castle Gludio" — order the MAIN party; plans: Fortresses / Castles tab)', cmd: '!siege ', needsArg: 'text' },
  { label: 'Stop the siege', cmd: '!siege stop' },
  { label: 'Stop mission', cmd: '!mission stop' },
  { label: 'Help character… (whole party assists)', cmd: '!assist ', needsArg: 'text' },
  { label: 'Stop helping (follow leader)', cmd: '!assist off' },
  { label: 'Town teleport .<town> (gludin gludio dion giran oren aden hunters heine goddard rune schuttgart)', cmd: '!town ', needsArg: 'text' },
  { label: 'Gatekeeper teleport to… (any destination)', cmd: '!gk ', needsArg: 'text' },
  { label: 'Walk to… (NPC / place / x y)', cmd: '!goto ', needsArg: 'text' },
  { label: 'Stop leveling', cmd: '!autolevel stop' },
  { label: 'Escape (SoE)', cmd: '!soe' },
  { label: 'Stop everything (stays stopped until the next order)', cmd: '!stop' },
];

/** Free text ("restock", "kill raid boss Bifrons", "do kamaloka now", "go to Gludio") -> swarm command. */
function translate(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (t.startsWith('!')) return ALLOWED.includes(t.split(/\s+/)[0].toLowerCase()) ? t : null;
  if (t.startsWith('/') || t.startsWith('@')) return t;   // L2Swarm chat-box command / dashboard action: checked by commandPlan (command center 2026-10-08)
  const l = t.toLowerCase().replace(/\b(please|now|nu|the|team|alle|all)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const rules = [
    [/^(restock|supply|supplies|køb|buy supplies|shop scrolls|forsyninger)/, () => '!supply'],
    [/^(collect|collect adena|saml penge|penge)/, () => '!collect'],
    [/^(park|parker|wait at( the)? (grocer|grocery|shop)|vent ved grocer) ?(grocer|warehouse|weapons|start)?/, (m) => '!park ' + (m[4] || 'grocer')],
    [/^(class ?change|klasseskift|change class|profession)/, () => '!classchange'],
    [/^(forward drop)\s+(on|off)$/, (m) => `!cabinet Forward Drop ${m[2]}`],
    [/^(level|auto ?level|grind|farm xp|lvl)/, () => '!level'],
    [/^(kill|dræb|do|fight)\s+(the\s+)?raid ?boss\s+(.+)$/, (m) => `!mission raid ${m[3]}`],
    [/^(raid|mission raid)\s+(.+)$/, (m) => `!mission raid ${m[2]}`],
    [/^(kill|dræb|attack|angrib)\s+(.+)$/, (m) => `!kill ${m[2]}`],
    [/(?:kamaloka|kama|hall|labyrinth)\D*(\d{2})/, (m) => '!mission kamaloka ' + m[1]],   // "kamaloka 39", "force kama 36", "hall 33"
    [/kamaloka|dungeon|instance/, () => '!mission kamaloka'],
    [/^(stop mission|abort mission)/, () => '!mission stop'],
    [/^(stop|halt|pause)/, () => '!stop'],
    [/^(status|report)/, () => '!status'],
    [/^(regroup|go home|home|samles)/, () => '!level'],
    [/^(buff|rebuff)/, () => '!buff'],
    [/^(escape|soe)/, () => '!soe'],
    [/^\.?(gludin|gludio|dion|giran|oren|aden|hunters|heine|goddard|rune|schuttgart)$/, (m) => `!town ${m[1]}`],
    [/^(town|\.town)\s+(\w+)$/, (m) => `!town ${m[2]}`],
    [/^(teleport|gk)\s+(to\s+)?(.+)$/, (m) => `!gk ${m[3]}`],
    [/^(go to|goto|walk to)\s+(.+)$/, (m) => `!goto ${m[2]}`],
    [/^(mark|save place)\s+(.+)$/, (m) => `!mark ${m[2]}`],
  ];
  for (const [re, fn] of rules) { const m = l.match(re); if (m) return fn(m); }
  return null;
}

function tail(file, n) {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).slice(-n); } catch (e) { return []; }
}
/** Scripts/data/field_areas.json (docs/plan/tools/field_areas.js), cached by its modification time (FIELD AREAS 2026-10-08 22:45) */
let FA_CACHE = { mt: 0, j: null };
function fieldAreasData() {
  try { const f = path.join(DATA, 'field_areas.json'), mt = fs.statSync(f).mtimeMs; if (FA_CACHE.mt !== mt) FA_CACHE = { mt, j: readJson(f, null) }; return FA_CACHE.j; } catch (e) { return null; }
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return fallback; }
}

/** Teams (character -> party leader): swarm.config.json accounts[].party (the source of truth, as in swarm.js SWARM_CFG), plus the
 *  hardcoded swarm.js CONFIG.teams for names the config does not have; everyone else follows the main leader. */
function teamMap() {
  const map = {};
  try {
    const src = fs.readFileSync(path.join(ROOT, 'Scripts', 'swarm.js'), 'utf8');
    const m = src.match(/teams:\s*\{([^}]*)\}/);
    if (m) for (const p of m[1].matchAll(/(\w+)\s*:\s*'(\w+)'/g)) map[p[1]] = p[2];
  } catch (e) { }
  try { const cur = SC.reload(); if (cur && Array.isArray(cur.accounts)) cur.accounts.forEach(a => { if (a && a.character && a.enabled !== false) map[a.character] = String(a.party || a.character); }); } catch (e) { }
  return map;
}

// ---------------------------------------------------------------------------------------------------------------------------
// SOUL CRYSTALS (user 2026-10-07): which crystal each character needs FIRST (its next weapon grade), a team plan (who levels, extra
// crystals for the stock) and the live view. Wanted special abilities (user): destroyers Focus (+ a Health weapon for the HP swap before
// Frenzy, so they do not have to hit each other to drain), casters/healers Acumen, tank Health. Data: Scripts/data/soul_sa.txt (user's table).
// Output Scripts/data/soul_targets.json (read live by swarm.js); plan Scripts/data/soul_plan.json (edited on the dashboard Crystals tab).
const SOUL_PLAN_F = path.join(DATA, 'soul_plan.json'), SOUL_TARGETS_F = path.join(DATA, 'soul_targets.json');
function soulTable() {
  const out = [];
  try { fs.readFileSync(path.join(DATA, 'soul_sa.txt'), 'utf8').split(/\r?\n/).forEach(l => { if (!l || l[0] === '#') return; const [grade, type, name, stage, red, green, blue] = l.split('|'); out.push({ grade, type, name, stage: +stage, sa: { red, green, blue } }); }); } catch (e) { }
  return out;
}
const CASTER_RE = /^(bishop|shilliensaint|necromancer|doomcryer|nuker|mage|healer|elder|cleric|oracle|summoner|caster)$/;
function soulWants(role) {
  // destroyers (user decision 2026-10-07, docs/plan/destroyer_build.md; same as gear_prefs.json destroyer _weapon): C = 2h SWORD Berserker
  // Blade - Focus (base crit 8 instead of a blunt's 4); from B the crit RATE is capped, so 2h BLUNT (Zealot crit DAMAGE x2.0) with Rsk. Focus
  if (role === 'destroyer') return [
    { sa: 'Focus', types: ['2h-sword'], weapon: 'Berserker Blade', grade: 'C', why: 'main weapon C: 2h sword + Focus (more critical hits)' },
    { sa: 'Health', types: ['blunt', 'sword', '2h-sword', '2h-blunt', 'pole', 'fist', 'dagger', 'bow'], why: 'HP swap before Frenzy (max HP up = HP % down, no duel drain)' },
    { sa: 'Rsk. Focus', types: ['2h-blunt'], weapon: 'Star Buster', grade: 'B', why: 'main weapon B: 2h blunt + Rsk. Focus' },
    { sa: 'Focus', types: ['2h-blunt'], weapon: "Behemoth's Tuning Fork", grade: 'A', why: 'main weapon A: 2h blunt + Focus' },
    { sa: 'Rsk. Focus', types: ['2h-blunt'], weapon: 'Dynasty Crusher', grade: 'S', why: 'main weapon S: 2h blunt + Rsk. Focus' }];
  if (role === 'doombringer') return [{ sa: 'Focus', types: ['2h-sword'], why: 'ancient sword (Change Weapon from a 2h sword)' }];
  if (role === 'inspector') return [{ sa: 'Focus', types: ['sword'], why: 'rapier (Change Weapon from a 1h sword)' }];
  if (role === 'sk' || role === 'tank') return [{ sa: 'Health', types: ['sword', 'blunt'], why: 'tank: more HP' }];
  if (role === 'crafter' || role === 'spoiler') return [{ sa: 'Health', types: ['blunt', 'sword'], why: 'more HP' }];
  if (role === 'dagger') return [{ sa: 'Focus', types: ['dagger'], why: 'more critical hits' }];
  if (CASTER_RE.test(role || '')) return [{ sa: 'Acumen', types: ['2h-blunt', 'sword', 'blunt'], why: 'faster casting' }];
  return [];
}
const GRADES = ['C', 'B', 'A', 'S'];
function gradeFor(lvl) { return lvl >= 76 ? 'S' : lvl >= 61 ? 'A' : lvl >= 52 ? 'B' : 'C'; }
/** The weapon (and so the crystal colour + stage) for a wanted ability, from the character's next grade up. */
function soulPick(want, lvl) {
  const T = soulTable();
  if (want.weapon) {                                   // a named weapon (destroyers 2026-10-07): exactly that one, its colour for the ability
    const w = T.find(x => x.name === want.weapon && want.types.includes(x.type));
    const col = w && ['red', 'green', 'blue'].find(k => String(w.sa[k]).toLowerCase() === want.sa.toLowerCase());
    if (col) return { weapon: w.name, grade: w.grade, type: w.type, stage: w.stage, color: col };
  }
  for (let g = GRADES.indexOf(gradeFor(lvl)); g < GRADES.length; g++) {
    for (const type of want.types) {
      const c = T.filter(w => w.grade === GRADES[g] && w.type === type).map(w => { const col = ['red', 'green', 'blue'].find(k => String(w.sa[k]).toLowerCase() === want.sa.toLowerCase()); return col ? { weapon: w.name, grade: w.grade, type, stage: w.stage, color: col } : null; }).filter(Boolean).sort((a, b) => a.stage - b.stage);
      if (c.length) return c[0];
    }
  }
  return null;
}
function soulPlan() {
  const p = readJson(SOUL_PLAN_F, null) || {};
  p.teams = p.teams || {}; p.overrides = p.overrides || {}; p.stock = p.stock || [];
  return p;
}
function soulLive(name) { return readJson(path.join(LOGS, `soul_${name}.json`), null); }
/** Every character: wants -> targets; the FIRST target not yet in hand is what it levels now. */
function soulTargets(chars) {
  const plan = soulPlan(), out = {};
  chars.forEach(c => {
    if (!c.name || !c.role) return;
    const lvl = +c.level || 1, team = (typeof c.party === 'string' && c.party) || (typeof c.leader === 'string' && c.leader) || c.name;
    const wants = (plan.overrides[c.name] && plan.overrides[c.name].length) ? plan.overrides[c.name]
      : soulWants(c.role).filter(w => !w.grade || GRADES.indexOf(w.grade) >= GRADES.indexOf(gradeFor(lvl)));   // a grade I already outgrew: no crystal for it
    const targets = wants.map(w => { const pk = w.color && w.stage ? { weapon: w.weapon || '', grade: w.grade || '', stage: +w.stage, color: w.color } : soulPick(w, lvl); return pk ? Object.assign({ sa: w.sa, why: w.why || '' }, pk) : { sa: w.sa, why: w.why || '', missing: 'no weapon with this ability in the table' }; });
    const live = soulLive(c.name) || {};
    const done = (live.done || []).map(d => `${d.color}-${d.stage}`);
    const now = targets.find(t => t.color && !done.includes(`${t.color}-${t.stage}`)) || null;
    // the team's extra stock (user: "farm as many as possible for later"): after its own targets, a member levels the team's stock list
    const tp = plan.teams[team] || {};
    const stockNext = !now ? (tp.stock || plan.stock || []).find(x => x.color && x.stage) || null : null;
    out[c.name] = { level: lvl, role: c.role, team, levelOn: tp.level !== false, eligible: lvl >= 40, minLevel: 40, targets, now: now || (stockNext ? Object.assign({ sa: 'stock', why: 'team stock' }, stockNext) : null) };
  });
  return out;
}
function soulWriteTargets() {
  try { const t = soulTargets(readStates()); fs.writeFileSync(SOUL_TARGETS_F, JSON.stringify({ generated: new Date().toISOString(), chars: t }, null, 1)); return t; } catch (e) { return {}; }
}
setInterval(soulWriteTargets, 60000); setTimeout(soulWriteTargets, 5000);

// CLAN QUEST CALL-IN (user 2026-10-07: "activate a clan quest and the leader calls in the teams he needs to complete it"): every 10 min,
// for every ACTIVE clan quest (clan_quests.json clan.activeQuests, set on the Clan tab) a quest boss that is not known dead gets a party
// that fits it (the /api/clan fit rule) and is not in a raid/mission: that party's leader gets "!mission raid <boss>", the clan leader
// "!assist <party leader>" (the kill only counts within 1500 of the clan leader). At most one call per boss per 6 h. Log: Logs/clan.log.
const CLAN_DISPATCH_F = path.join(LOGS, 'clan_dispatch.json');
async function clanDispatch() {
  try {
    const cq = readJson(path.join(DATA, 'clan_quests.json'), null); if (!cq || !cq.clan || !(cq.clan.activeQuests || []).length) return;
    const r = await fetch(SELF + '/api/clan'); const c = await r.json();
    const sent = readJson(CLAN_DISPATCH_F, {}); const chars = readStates();
    const busy = (leader) => { const st = chars.find(x => x.name === leader); return st && /raid|mission/i.test(String(st.mode || '')); };
    for (const b of c.bosses || []) {
      if (!(cq.clan.activeQuests || []).map(String).includes(String(b.quest)) || b.alive === false) continue;
      if (sent[b.id] && Date.now() - Date.parse(sent[b.id].at) < 6 * 3600e3) continue;
      const fit = (b.fit || []).find(f => f.ok && !busy(f.team)); if (!fit) continue;
      const post = (cmd, target) => fetch(SELF + '/api/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd, target }) }).then(x => x.json()).catch(e => ({ error: String(e) }));
      await post(`!mission raid ${b.name}`, `party:${fit.team}`);
      if (c.leader && c.leader !== fit.team) await post(`!assist ${fit.team}`, `char:${c.leader}`);
      sent[b.id] = { at: new Date().toISOString(), boss: b.name, party: fit.team, quest: b.quest };
      fs.writeFileSync(CLAN_DISPATCH_F, JSON.stringify(sent, null, 1));
      try { fs.appendFileSync(path.join(LOGS, 'clan.log'), `${new Date().toISOString()} [dashboard] clan quest ${b.quest}: party ${fit.team} sent to ${b.name}, clan leader ${c.leader} assists\r\n`); } catch (e) { }
      break;                                                   // one call per round
    }
  } catch (e) { }
}
setInterval(clanDispatch, 10 * 60000);

function readStates() {
  const teams = teamMap();
  const out = [];
  for (const f of fs.readdirSync(LOGS)) {
    if (!/^swarm_state_.+\.json$/.test(f)) continue;
    const s = readJson(path.join(LOGS, f), null);
    if (!s || !s.name) continue;
    if (f !== `swarm_state_${s.name}.json`) continue;   // e.g. swarm_state_null.json written during a disconnect (a ghost character)
    s.ageSec = Math.round((Date.now() - Date.parse(s.updated)) / 1000);
    s.party = teams[s.name] || MAIN_LEADER;
    const dup = out.findIndex(o => o.name === s.name);  // one entry per character: the newest
    if (dup >= 0) { if (out[dup].ageSec > s.ageSec) out[dup] = s; continue; }
    out.push(s);
  }
  return out;
}

/**
 * Intent log (Logs/intent_<name>.log, written by swarm.js) -> events, newest first.
 *   start:  <iso> <action>: <detail> | from x,y,z [-> x,y,z (N away)] | task: <task>
 *   result: <iso>   -> <action> OK|FAIL[: detail] | now at x,y,z
 * Each result is attached to the latest open start of the same action. Repeats in a row
 * (same fight, same "waiting for the team") are merged into one event with a count.
 */
const INTENT_ALIAS = { angreb: 'attack', 'led hold': 'lead team', 'saml hold': 'gather team', 'quest-jagt': 'quest-hunt' };
function parseIntents(lines) {
  const ev = [];
  for (const line of lines) {
    let m = line.match(/^(\S+Z)\s+-> (.+?) (OK|FAIL|FEJL)(?:: (.*?))? \| now at (\S+)\s*$/);
    if (m) {
      const action = INTENT_ALIAS[m[2]] || m[2];
      for (let i = ev.length - 1; i >= Math.max(0, ev.length - 40); i--) {
        const e = ev[i];
        if (e.action === action && !e.result) { Object.assign(e, { result: m[3] === 'OK' ? 'OK' : 'FAIL', resultDetail: m[4] || '', doneAt: m[1], end: m[5] }); break; }
      }
      continue;
    }
    m = line.match(/^(\S+Z) ([^:|]+?): (.*)$/);
    if (!m) continue;
    const action = INTENT_ALIAS[m[2]] || m[2];
    let rest = m[3], task = '', from = '', to = null, dist = null;
    const ti = rest.lastIndexOf(' | task: ');
    if (ti >= 0) { task = rest.slice(ti + 9).trim(); rest = rest.slice(0, ti); }
    const fi = rest.lastIndexOf(' | from ');
    if (fi >= 0) {
      const f = rest.slice(fi + 8); rest = rest.slice(0, fi);
      const fm = f.match(/^(\S+)(?: -> (\S+) \((\d+) away\))?/);
      if (fm) { from = fm[1]; to = fm[2] || null; dist = fm[3] ? +fm[3] : null; }
    }
    ev.push({ at: m[1], action, detail: rest.trim(), from, to, dist, task: task === '-' ? '' : task.replace(/\s*->\s*$/, ''), count: 1 });
  }
  // Merge repeats: same action + same detail (fights: same monster) right after each other
  const key = (e) => e.action === 'attack' ? 'attack ' + e.detail.replace(/\s*\(\d+% HP\)/, '')
    : e.action === 'gather team' || e.action === 'quest-hunt' ? e.action : e.action + ' ' + e.detail;
  const out = [];
  for (const e of ev) {
    const p = out[out.length - 1];
    if (p && key(p) === key(e) && (p.result || 'x') === (e.result || 'x') && Date.parse(e.at) - Date.parse(p.lastAt || p.at) < 600000) {
      p.count++; p.lastAt = e.at; Object.assign(p, { detail: e.detail, to: e.to, dist: e.dist, doneAt: e.doneAt || p.doneAt, resultDetail: e.resultDetail || p.resultDetail });
      continue;
    }
    out.push(e);
  }
  return out.reverse();
}

function planFiles() {
  const list = [];
  const walk = (dir, prefix) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) { if (!/^(tools|zones)$/.test(f)) walk(p, prefix + f + '/'); }
      else if (f.endsWith('.md')) list.push(prefix + f);
    }
  };
  walk(PLAN, '');
  return list.sort((a, b) => (a === 'PLAN.md' ? -1 : b === 'PLAN.md' ? 1 : a.localeCompare(b)));
}

/** Raid bosses + what our bots have seen (Logs/raid_seen.log: iso \t id \t name \t outcome) + board status (Logs/raid_status.json). */
/** Death time + respawn window + state (dead / maybe up / should be up / alive) from raid_status.json (preferred) or raid_seen.log. */
function deathInfo(b, bs, s) {
  const out = { deathAt: null, deathHow: null, aliveAt: null, earliest: null, latest: null, rstate: 'unknown' };
  if (bs) {
    if (bs.alive && (bs.aliveSince || bs.at)) { out.aliveAt = bs.aliveSince || bs.at; out.rstate = 'alive'; }
    const d = bs.killedAt || bs.foundDeadAt || bs.deadSince || (!bs.alive ? bs.at : null);
    if (!bs.alive && d) { out.deathAt = d; out.deathHow = bs.killedAt ? 'killed' : 'found dead'; }
  }
  if (!out.deathAt && !out.aliveAt && s && s.outcome === 'dead') { out.deathAt = s.at; out.deathHow = 'killed'; }
  if (out.deathAt) {
    const t = Date.parse(out.deathAt);
    out.earliest = new Date(t + (b.respawnMinH || 0) * 3600e3).toISOString();
    out.latest = new Date(t + (b.respawnMaxH || 0) * 3600e3).toISOString();
    const n = Date.now();
    out.rstate = n < Date.parse(out.earliest) ? 'dead' : n < Date.parse(out.latest) ? 'maybe up' : 'should be up';
    // a "found dead" time is only an upper bound for the death, so the window may already have started
    if (out.deathHow === 'found dead' && out.rstate === 'dead') out.rstate = 'dead (found)';
  }
  if (bs && bs.lastRespawnH) { out.measuredH = bs.lastRespawnH; out.measuredExact = !!bs.lastRespawnExact; }
  return out;
}
function raids() {
  const db = readJson(path.join(DATA, 'raidbosses_h5.json'), { bosses: [] });
  const seen = {};
  for (const line of tail(path.join(LOGS, 'raid_seen.log'), 2000)) {
    const [at, id, name, outcome] = line.split('\t');
    seen[id] = { at, outcome };
  }
  const board = readJson(path.join(LOGS, 'raid_status.json'), {});
  // Logs/raid_respawn.log: iso, id, name, "dead since <iso>", "alive again after X h", "killed by us" | "found dead"
  const resp = {};
  for (const line of tail(path.join(LOGS, 'raid_respawn.log'), 2000)) {
    const [at, id, name, dead, again, how] = line.split('	');
    if (!id) continue;
    const h = /([\d.]+)\s*h/.exec(again || ''), ds = /dead since (\S+)/.exec(dead || '');
    (resp[id] = resp[id] || []).push({ at, deadSince: ds ? ds[1] : null, hours: h ? +h[1] : null, exact: /killed by us/.test(how || ''), how: how || '' });
  }
  const seenAll = {};
  for (const line of tail(path.join(LOGS, 'raid_seen.log'), 2000)) { const [at, id, name, outcome] = line.split('	'); if (id) (seenAll[id] = seenAll[id] || []).push({ at, outcome }); }
  return (db.bosses || []).map(b => {
    const s = seen[String(b.id)];
    const bs = board[String(b.id)] || board[b.name];
    let status = 'unknown', nextFrom = null, nextTo = null;
    if (bs) status = bs.alive ? 'alive' : 'dead';
    if (s && s.outcome === 'dead') {
      status = 'dead';
      const t = Date.parse(s.at);
      nextFrom = new Date(t + (b.respawnMinH || 0) * 3600e3).toISOString();
      nextTo = new Date(t + (b.respawnMaxH || 0) * 3600e3).toISOString();
      if (Date.now() > Date.parse(nextFrom)) status = 'maybe up';
    }
    return {
      id: b.id, name: b.name, level: b.level, type: b.type, zone: b.zoneName, x: b.x, y: b.y,
      respawn: `${b.respawnMinH}-${b.respawnMaxH}h`, tp: b.nearestTeleport ? b.nearestTeleport.desc : '',
      walk: b.nearestTeleport ? b.nearestTeleport.walkDist : null, party9: b.recommendedFor9Man,
      drops: (b.notableDrops || []).slice(0, 4).join(', '), danger: b.dangerNotes || '',
      hp: b.hp, minions: b.minions || [], raidPoints: b.raidPoints || 0, respawnMinH: b.respawnMinH, respawnMaxH: b.respawnMaxH, lastOutcome: s ? s.outcome : null,
      status, lastSeen: s ? s.at : (bs ? bs.at : null), nextFrom, nextTo,
      board: bs || null, respawnLog: resp[String(b.id)] || [], seenLog: seenAll[String(b.id)] || [],
      // RAIDS PAGE 2026-10-09 (Dashboard/raidspage.js): curse level (lowest of boss + minions), height, danger on the way, reachability
      z: b.z, curseLevel: b.curseLevel || b.level, minionLevelMin: b.minionLevelMin || null, routeMaxMobLevel: b.routeMaxMobLevel || null,
      reachable: b.reachable !== false, recLevel: b.recommendedPartyLevel || null,
      ...deathInfo(b, bs, s),
    };
  });
}

// --- Raid pages (2026-10-04): teams, one boss with its full drop list, the live raid ---------------------
const GRADE_LVL = { NONE: 0, D: 20, C: 40, B: 52, A: 61, S: 76, S80: 80, S84: 84 };
/** Party -> members with level/role (from the swarm state files). */
function raidTeams() {
  const t = {};
  for (const c of readStates()) {
    if (c.ageSec > 6 * 3600) continue;
    const p = (t[c.party] = t[c.party] || { leader: c.party, members: [] });
    p.members.push({ name: c.name, level: c.level, role: c.role || '', cls: c.cls || '', gearRole: c.gearRole || '' });
  }
  for (const p of Object.values(t)) { const lv = p.members.map(m => m.level).filter(Boolean); p.min = Math.min(...lv); p.max = Math.max(...lv); }
  return t;
}
// --- Gear catalog (Gear tab) ----------------------------------------------------------------------------------------------------
// The swarm roles and what they wear (same rules as swarm.js GEAR_ROLE_OF / ROLE_RULES / CONFIG.gear.upgrade).
const GEAR_ROLES = {
  sk:            { label: 'Tank: Shillien Knight / Templar', gear: 'tank', race: 'DARK_ELF' },
  destroyer:     { label: 'Destroyer / Titan', gear: 'fighter2h', race: 'ORC' },
  doombringer:   { label: 'Doombringer (Kamael)', gear: 'kamaelAS', race: 'KAMAEL' },
  inspector:     { label: 'Soul Breaker / Soul Hound (Kamael)', gear: 'kamaelRapier', race: 'KAMAEL' },
  bishop:        { label: 'Healer: Bishop / Cardinal', gear: 'mage', race: 'HUMAN', healer: true },
  shilliensaint: { label: 'Healer: Shillien Elder / Saint', gear: 'mage', race: 'DARK_ELF', healer: true },
  healer:        { label: 'Healer: Elven Elder / Eva Saint', gear: 'mage', race: 'ELF', healer: true },
  necromancer:   { label: 'Necromancer / Soultaker', gear: 'mage', race: 'HUMAN' },
  doomcryer:     { label: 'Doomcryer', gear: 'mage', race: 'ORC' },
  crafter:       { label: 'Warsmith / Maestro (crafter)', gear: 'tank', race: 'DWARF' },
  spoiler:       { label: 'Bounty Hunter / Fortune Seeker (spoiler)', gear: 'tank', race: 'DWARF' },
  // 2026-10-09: the nuker + dagger roles were missing (swarm.js reads gear_prefs.json[role] for them too). race '' = any race but Kamael-only items
  nuker:         { label: 'Nuker: Sorcerer / Spellsinger / Spellhowler / Dark Wizard (casters)', gear: 'mage', race: '' },
  dagger:        { label: 'Dagger: Treasure Hunter / Plains Walker / Abyss Walker', gear: 'dagger', race: '' },
};
const GEAR_GRADES = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
const GEAR_SLOTS = ['weapon', 'shield', 'chest', 'legs', 'head', 'gloves', 'feet', 'neck', 'earring', 'ring'];
const GEAR_RULES = {
  tank:         { armor: ['HEAVY', 'LIGHT'], shield: true,  stat: 'pa', weapon: w => ['SWORD', 'BLUNT'].includes(w.t) && !w.two && !w.mw },
  fighter2h:    { armor: ['HEAVY', 'LIGHT'], shield: false, stat: 'pa', weapon: w => ['SWORD', 'BLUNT'].includes(w.t) && !w.mw && w.two },
  kamaelAS:     { armor: ['LIGHT', 'MAGIC'], shield: false, stat: 'pa', weapon: w => w.t === 'ANCIENTSWORD', change: 'ANCIENTSWORD' },
  kamaelRapier: { armor: ['LIGHT', 'MAGIC'], shield: false, stat: 'pa', weapon: w => w.t === 'RAPIER', change: 'RAPIER' },
  mage:         { armor: ['MAGIC'],          shield: false, stat: 'ma', weapon: w => w.mw && !['RAPIER', 'ANCIENTSWORD'].includes(w.t) },
  dagger:       { armor: ['LIGHT'],          shield: false, stat: 'pa', weapon: w => w.t === 'DAGGER' && !w.mw },   // = swarm.js ROLE_RULES.dagger
};
// the real armor set casters/healers buy (swarm.js CONFIG.gear.upgrade.casterSets): Devotion below 40, then Karmian / Demon's
const CASTER_SET_BY_GRADE = { NONE: ['Devotion', 'Devotion'], D: ['Devotion', 'Devotion'], C: ['Karmian', "Demon's"] };
let GEARFULL = null;
const gearFull = () => GEARFULL || (GEARFULL = readJson(path.join(DATA, 'gear_items.json'), { items: {}, sets: [] }));
/** Giran shop offers per item id from the shop scan: [{ npc, list, price, common }] */
function giranOffers() {
  const sc = readJson(path.join(DATA, 'shopscan_giran.json'), { shops: [] }), idx = {};
  (sc.shops || []).forEach(s => (s.lists || []).forEach(l => (l.items || []).forEach(i => {
    (idx[i.id] = idx[i.id] || []).push({ npc: s.npc, list: (l.path || []).slice(-1)[0] || '', price: Number(i.price) || 0, common: /^Common Item/.test(i.name) });
  })));
  return idx;
}
function gearCatalog(role, grade, all) {
  const R0 = GEAR_ROLES[role]; if (!R0) return { error: 'unknown role' };
  const R = GEAR_RULES[R0.gear], G = gearFull(), items = G.items, offers = giranOffers();
  const prefs = (readJson(path.join(DATA, 'gear_prefs.json'), {})[role] || {})[grade] || {};
  // real item id <- its "Common Item - X" twin (same stats, no set bonus)
  // real item <-> its "Common Item - X" twin, matched on a normalized name ("Samurai Long Sword" = "Samurai Longsword", "Omen Beast's Eye" = "Omen Beast's Eye Earring")
  const gnorm = (n) => String(n).toLowerCase().replace(/^common item - /, "").replace(/[^a-z0-9]/g, "").replace(/(earring|necklace|ring)$/, "").replace(/s$/, "");
  const byName = {};
  Object.entries(items).forEach(([id, it]) => { const k = (/^Common Item/.test(it.n) ? "C:" : "R:") + it.s + ":" + it.g + ":" + gnorm(it.n); (byName[k] = byName[k] || []).push(Number(id)); });
  const score = (it) => it.s === 'weapon' ? (R.change && it.t !== R.change && it.cw && items[it.cw] ? items[it.cw][R.stat] : it[R.stat]) : it.s === 'shield' ? it.sd : ['neck', 'earring', 'ring'].includes(it.s) ? it.md : it.pd + (R.stat === 'ma' ? it.mp * 0.2 : 0);
  const usable = (it) => {
    if (it.g !== grade) return false;
    if (it.r && !(R0.race ? it.r.split(',').includes(R0.race) : !/^KAMAEL$/.test(it.r))) return false;   // race '' = any race, but not Kamael-only items
    if (it.s === 'weapon') return R.weapon(it) || !!(R.change && it.cw && items[it.cw] && items[it.cw].t === R.change);   // Kamael: a sword they Change Weapon
    if (it.s === 'shield') return R.shield;
    if (it.s === 'chest' || it.s === 'legs') return !it.t || R.armor.includes(it.t);
    return true;
  };
  const setWord = R0.gear === 'mage' && CASTER_SET_BY_GRADE[grade] ? CASTER_SET_BY_GRADE[grade][R0.healer ? 0 : 1] : null;
  const set = setWord ? (G.sets || []).find(t => t.name.indexOf(setWord) >= 0) : null;
  const setIds = new Set(set ? Object.values(set.pieces).flat() : []);
  const slots = {};
  GEAR_SLOTS.forEach(s => { slots[s] = []; });
  Object.entries(items).forEach(([id, it]) => {
    id = Number(id);
    const lone = /^Common Item - /.test(it.n) && !byName["R:" + it.s + ":" + it.g + ":" + gnorm(it.n)];   // a Common item without a real twin in the data
    if (!slots[it.s] || (/^Common Item/.test(it.n) && !lone) || /Fortune|Shadow|\{PvP\}|Limited|Event|Lv\. ?\d/.test(it.n) || !usable(it)) return;
    const twin = lone ? id : (byName["C:" + it.s + ":" + it.g + ":" + gnorm(it.n)] || [])[0];
    const real = (offers[id] || []).filter(o => !o.common).sort((a, b) => a.price - b.price)[0];
    const common = twin ? (offers[twin] || []).filter(o => o.common).sort((a, b) => a.price - b.price)[0] : null;
    if (!all && !real && !common) return;
    const chg = R.change && it.s === 'weapon' && it.t !== R.change && it.cw ? items[it.cw] : null;   // the Kamael weapon it turns into
    slots[it.s].push({ id, name: chg ? it.n + ' → ' + chg.n : it.n, change: chg ? chg.n : null, twin: twin || null, sa: / - /.test(it.n.replace(/^Common Item - /, "")), stats: { pa: it.pa, ma: it.ma, pd: it.pd, md: it.md, sd: it.sd, mp: it.mp },
      type: it.t, two: !!it.two, full: !!it.full, score: Math.round(score(it) * 10) / 10,
      real: real ? { npc: real.npc, price: real.price } : null, common: common ? { npc: common.npc, price: common.price } : null,
      setPiece: setIds.has(id) });
  });
  // the automatic pick (what the bots buy when there is no preference): casters the set piece, else the best sold item (Common price wins a tie)
  Object.keys(slots).forEach(k => { const seen = new Set(); slots[k] = slots[k].filter(x => { if (seen.has(x.name)) return false; seen.add(x.name); return true; }); });   // the datapack has a few same-name copies
  const setSlots = set ? Object.keys(set.pieces) : [];
  Object.keys(slots).forEach(s => {
    const list = slots[s].sort((a, b) => b.score - a.score || ((a.common || a.real || {}).price || 9e12) - ((b.common || b.real || {}).price || 9e12));
    // same as swarm.js planUpgrades: a caster's set slots take the real set piece, every other slot the best piece with a Common offer
    const auto = R0.gear === 'mage' && setSlots.includes(s) ? list.find(x => x.setPiece && x.real) : list.find(x => x.common);
    if (auto) auto.auto = true;
    if (prefs[s]) { const p = list.find(x => x.id === prefs[s] || x.twin === prefs[s]); if (p) p.pref = true; }
  });
  return { role, grade, label: R0.label, gear: R0.gear, race: R0.race, healer: !!R0.healer, set: set ? set.name : null, slots, prefs,
    roles: Object.entries(GEAR_ROLES).map(([k, v]) => ({ key: k, label: v.label })), grades: GEAR_GRADES };
}
let GEAR = null;
const gearDb = () => GEAR || (GEAR = readJson(path.join(DATA, 'gear_items.json'), { items: {} }).items || {});
const MATERIAL_RE = /Recipe|Fragment|Blade|Part|Pattern|Stem|Gemstone|Crystal|Mold|Braided|Leather|Thread|Cord|Oriharukon|Mithril|Animal|Varnish|Steel|Adamantite|Silver Nugget|Enria|Asofe|Synthetic|Compound|Stone of Purity|Durable Metal|Metallic|Coarse Bone|Iron Ore|Coal|Charcoal|Suede|Lining|Hinge|Head|Shaft|Handle|Edge|Piece|Design|Gemstone|Template/i;
/** Who in party `team` can use item `id` now / soon, or what to do with it. */
function usefulFor(id, name, team) {
  const g = gearDb()[id];
  const ench = /Enchant (Weapon|Armor) (([A-Z])-Grade)/.exec(name || '');
  if (ench) {
    const lvl = GRADE_LVL[ench[2]] ?? 99;
    const who = team.members.filter(m => m.level >= lvl - 5).map(m => m.name);
    return who.length ? `upgrade gear (${ench[2]}-grade ${ench[1].toLowerCase()} enchant)` : `sell / keep for later (${ench[2]}-grade)`;
  }
  if (!g) return MATERIAL_RE.test(name || '') ? 'Crafter1 (crafter material/recipe)' : (/Life Stone|Soul Crystal|Dye|Spellbook|Book|Codex|Giant/i.test(name || '') ? 'check (special)' : 'sell');
  const lvl = GRADE_LVL[g.g] ?? 0;
  const fits = (m) => {
    const r = (m.role || '') + ' ' + (m.gearRole || '') + ' ' + (m.cls || '');
    if (g.s === 'weapon') {
      if (g.mw) return /mage|bishop|cleric|saint|oracle|necro|wizard|shaman|doomcryer|healer|mystic/i.test(r);
      if (/destroyer|raider|fighter2h/i.test(r)) return !!g.two && /SWORD|BLUNT/.test(g.t);
      if (/doombringer|kamaelAS/i.test(r) || m.name === 'Doombringer1') return g.t === 'ANCIENTSWORD';
      if (/inspector|kamaelRapier/i.test(r) || m.name === 'Inspector1') return g.t === 'RAPIER';
      if (/sk|tank|knight|crafter|spoiler/i.test(r)) return !g.two && /SWORD|BLUNT/.test(g.t);
      return false;
    }
    if (g.s === 'shield') return /sk|tank|knight|crafter|spoiler/i.test(r);
    if (['chest', 'legs', 'head', 'gloves', 'feet'].includes(g.s)) {
      const mage = /mage|bishop|cleric|saint|oracle|necro|wizard|shaman|doomcryer|healer|mystic/i.test(r);
      if (g.t === 'MAGIC') return mage;
      if (g.t === 'HEAVY') return !mage && !/kamael|doombringer|inspector|Doombringer1|Inspector1/i.test(r + ' ' + m.name);
      if (g.t === 'LIGHT') return !mage;
      return true;
    }
    return true;   // jewelry
  };
  const now = team.members.filter(m => fits(m) && m.level >= lvl).map(m => m.name);
  const soon = team.members.filter(m => fits(m) && m.level < lvl && m.level >= lvl - 8).map(m => m.name);
  if (now.length) return 'use now: ' + now.join(', ');
  if (soon.length) return `soon (lvl ${lvl}): ` + soon.join(', ');
  return `sell (${g.g}-grade ${g.t ? g.t.toLowerCase() : g.s})`;
}
function raidDetail(id, partyName) {
  const db = readJson(path.join(DATA, 'raidbosses_h5.json'), { bosses: [] });
  const b = (db.bosses || []).find(x => String(x.id) === String(id));
  if (!b) return null;
  const drops = readJson(path.join(DATA, 'raid_drops_h5.json'), {})[String(id)] || { categories: [] };
  const teams = raidTeams();
  const team = teams[partyName] || teams[MAIN_LEADER] || Object.values(teams)[0] || { members: [], min: 0, max: 0 };
  const names = readJson(path.join(__dirname, 'data', 'items.json'), {});
  const RATE = 1.5;
  const categories = drops.categories.map(c => ({ ...c, items: c.items.map(it => {
    const nm = it.name || (names[it.id] || [])[0] || ('item ' + it.id);
    const g = gearDb()[it.id];
    return { ...it, name: nm, grade: g ? g.g : ((names[it.id] || [])[3] || ''), slot: g ? g.s : ((names[it.id] || [])[2] || ''),
      effective: Math.min(100, Math.round(it.overall * RATE * 100) / 100), useful: usefulFor(it.id, nm, team) };
  }) }));
  const status = raids().find(r => String(r.id) === String(id)) || {};
  return { boss: b, status, team, rate: RATE, categories };
}
/** Logs/raid_loot.log (iso, boss, character, item id, item name, count) -> kills (same boss within 3 min = one kill), newest first. */
function raidLoot(bossName) {
  const kills = [];
  for (const line of tail(path.join(LOGS, 'raid_loot.log'), 5000)) {
    const [at, boss, ch, id, name, count] = line.split('	');
    if (!at || !boss || (bossName && boss !== bossName)) continue;
    const t = Date.parse(at);
    let k = kills.find(x => x.boss === boss && Math.abs(t - x.t) <= 180000);
    if (!k) { k = { boss, at, t, chars: {} }; kills.push(k); }
    (k.chars[ch] = k.chars[ch] || []).push({ id: +id, name, count: +count || 1 });
  }
  return kills.sort((a, b) => b.t - a.t).map(({ t, ...k }) => k);
}
/** Raid reports (Logs/raid_reports/*.json) + heals/loot/kills/levels for the Raids tab "Reports" section. */
const PARTY_OF = Object.keys(SC.partyOf).length ? SC.partyOf : { Tank1: 'Tank1', Bishop1: 'Tank1', Destroyer1: 'Tank1', Destroyer2: 'Tank1', Doombringer1: 'Tank1', Necro1: 'Tank1',
  Inspector1: 'Tank1', Chanter1: 'Tank1', Saint1: 'Tank1', Crafter1: 'Crafter1', Spoiler1: 'Crafter1', Healer1: 'Crafter1' };   // fallback without swarm.config.json
function tsvLines(file) {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t')); } catch (e) { return []; }
}
// Daily dungeons (kamaloka now; pailaka/rift later). Progress = Logs/daily_<Leader>.json, history = daily.log + kamaloka.log.
// KAMALOKA PAGE 2026-10-09 (user: "/kamaloka still only shows 2 groups"): EVERY party leader of swarm.config.json (+ the configured
// dailyLeaders): swarm.js runs the daily for any leader (dailyEnabled reads Logs/daily_enabled.json by Me.Name), the dashboard only showed 2.
const DAILY_LEADERS_CFG = (Array.isArray(SC.cfg.dailyLeaders) && SC.cfg.dailyLeaders.length) ? SC.cfg.dailyLeaders.map(String) : ['Tank1', 'Crafter1'];
function dailyLeaders() {
  const out = DAILY_LEADERS_CFG.slice();
  try { Object.values(teamMap()).forEach(l => { if (l && !out.includes(l)) out.push(String(l)); }); } catch (e) { }
  return out;
}
const DAILY_KINDS = ['kamaloka', 'pailaka', 'rift'];
function dailyInfo() {
  const progress = {};
  const DAILY_LEADERS = dailyLeaders();
  DAILY_LEADERS.forEach(l => { progress[l] = readJson(path.join(LOGS, 'daily_' + l + '.json'), null); });
  const log = tsvLines(path.join(LOGS, 'daily.log')).slice(-30).map(([at, leader, id, result, ...msg]) => ({ at, leader, id, result, msg: msg.join(' ') }));
  const kamaloka = tsvLines(path.join(LOGS, 'kamaloka.log')).slice(-20).map(([at, id, ...result]) => ({ at, id, result: result.join(' ') }));
  return { enabled: readJson(path.join(LOGS, 'daily_enabled.json'), {}) || {}, leaders: DAILY_LEADERS, kinds: DAILY_KINDS, progress, log, kamaloka };
}
function raidReports() {
  const heals = tsvLines(path.join(LOGS, 'raid_heals.log')).map(([at, healer, skill, target, hp]) => ({ t: Date.parse(at), healer, skill, target, hp: +hp }))
    .filter(h => h.t && h.healer);
  const loot = tsvLines(path.join(LOGS, 'raid_loot.log')).map(([at, boss, ch, id, name, count]) => ({ t: Date.parse(at), boss, ch, id: +id, name, count: +count || 1 }))
    .filter(l => l.t && l.boss && l.name);
  const reports = [];
  const dir = path.join(LOGS, 'raid_reports');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /\.json$/i.test(f)); } catch (e) {}
  for (const f of files) {
    const r = readJson(path.join(dir, f), null);
    if (!r || typeof r !== 'object') continue;
    const start = Date.parse(r.start || 0) || 0;
    const end = Date.parse(r.end || 0) || start;
    const events = Array.isArray(r.events) ? r.events : [];
    const deaths = {};
    let minionsKilled = 0, udCount = 0;
    for (const e of events) {
      const msg = String((e && e.msg) || '');
      let m = msg.match(/DIED:\s*(\S+)/);
      if (m) deaths[m[1]] = (deaths[m[1]] || 0) + 1;
      if (/minion down/i.test(msg)) minionsKilled++;
      if (/Ultimate Defense/i.test(msg)) udCount++;
    }
    const hs = {};
    if (start) for (const h of heals) {
      if (h.t < start || h.t > end + 60000) continue;
      const x = hs[h.healer] = hs[h.healer] || { count: 0, bySkill: {}, targets: {} };
      x.count++;
      x.bySkill[h.skill] = (x.bySkill[h.skill] || 0) + 1;
      x.targets[h.target] = (x.targets[h.target] || 0) + 1;
    }
    const lootMap = {};
    if (start) for (const l of loot) {
      if (l.boss !== r.boss || l.t < start || l.t > end + 300000) continue;
      lootMap[l.name] = (lootMap[l.name] || 0) + l.count;
    }
    const levelUps = {};
    const lb = r.levelsBefore || {}, la = r.levelsAfter || {};
    for (const n of Object.keys(la)) if (lb[n] != null && la[n] != null && lb[n] !== la[n]) levelUps[n] = [lb[n], la[n]];
    reports.push({ file: f, ...r, deaths, minionsKilled, udCount, heals: hs,
      loot: Object.entries(lootMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count), levelUps, _t: start });
  }
  reports.sort((a, b) => b._t - a._t);
  reports.forEach(r => { delete r._t; });

  const kills = {};
  for (const [at, , boss, outcome] of tsvLines(path.join(LOGS, 'raid_seen.log'))) {
    if (!boss || String(outcome).trim() !== 'dead') continue;
    const k = kills[boss] = kills[boss] || { boss, times: 0, last: at };
    k.times++;
    if (Date.parse(at) > Date.parse(k.last)) k.last = at;
  }
  const lootTotal = {};
  let adena = 0;
  for (const l of loot) {
    if (/^adena$/i.test(l.name) || l.id === 57) { adena += l.count; continue; }
    lootTotal[l.name] = (lootTotal[l.name] || 0) + l.count;
  }
  const levels = [];
  for (const n of Object.keys(PARTY_OF)) {
    const s = readJson(path.join(LOGS, 'swarm_state_' + n + '.json'), null) || {};
    levels.push({ name: n, party: PARTY_OF[n], level: s.level ?? null, exp: s.exp ?? null, cls: s.cls || '' });
  }
  return {
    reports,
    totals: {
      kills: Object.values(kills).sort((a, b) => Date.parse(b.last) - Date.parse(a.last)),
      lootTotal: Object.entries(lootTotal).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
      adena,
    },
    levels,
  };
}
// debuff cards (user 2026-10-06): every skill's abnormalType from the datapack (same type = only one on the target) + descriptions by id:level
let ABN = null, SKDESC = null;
function abnormalTypes() {
  if (ABN) return ABN;
  ABN = { 1435: 'DEATH_MARK' };
  try { const dir = path.join(DATA, 'dp', 'skills'); fs.readdirSync(dir).filter(n => /.xml$/.test(n)).forEach(n => {
    const x = fs.readFileSync(path.join(dir, n), 'utf8');
    x.split(/<skill id="/).slice(1).forEach(chunk => { const id = parseInt(chunk, 10); const end = chunk.indexOf('</skill>'); const m = /name="abnormalType"\s+val="([^"]+)"/.exec(end > 0 ? chunk.slice(0, end) : chunk); if (id && m && !ABN[id]) ABN[id] = m[1]; });
  }); } catch (e) { }
  return ABN;
}
// LIVE PER PARTY 2026-10-09: one live file per leader (Logs/raid_live_<leader>.json, Dashboard/live_runs.js); ?leader= picks the party
function raidLive(leader) {
  const d = require('./live_runs').live(LOGS, 'raid_live', 'raid', readJson, leader);
  if (!d.updatedAt) return d;
  if (Array.isArray(d.debuffs)) {
    const T = abnormalTypes(); SKDESC = SKDESC || readJson(path.join(__dirname, 'data', 'skill_desc.json'), {});
    d.debuffs = d.debuffs.filter(x => !/Aggression|Aura of Hate|Hate Aura|Provoke/i.test(x.name)).map(x => ({ ...x, type: T[x.skill] || '', desc: x.desc || SKDESC[x.skill + ':' + x.lvl] || (Object.entries(SKDESC).filter(([k]) => k.startsWith(x.skill + ':')).sort((p, q) => parseInt(q[0].split(':')[1]) - parseInt(p[0].split(':')[1]))[0] || [])[1] || '' }));
  }
  return d;
}
// --- Kamaloka tab: every Kamaloka (dungeons_h5.json) + its layout (Dashboard/data/kamaloka_layout.json, from the datapack by
// docs/plan/tools/kamaloka_layout.js) + what our runs learned (Logs/kamaloka_map.json) + fit / done today per party. Live: Logs/kamaloka_live.json.
const dailyDay = () => { const d = new Date(Date.now() - (6 * 60 + 30) * 60000); return d.toLocaleDateString('sv-SE'); };   // the daily lock resets 06:30
function kamalokaInfo() {
  const list = (readJson(path.join(DATA, 'dungeons_h5.json'), {}).kamaloka || []);
  const layout = (readJson(path.join(__dirname, 'data', 'kamaloka_layout.json'), {}).kamaloka || {});
  const learned = readJson(path.join(LOGS, 'kamaloka_map.json'), {}) || {};
  const day = dailyDay();
  const TM = teamMap();   // KAMALOKA PAGE 2026-10-09: live config (was PARTY_OF from the start of the server)
  const parties = dailyLeaders().map(leader => {
    const members = Object.keys(TM).filter(n => TM[n] === leader).map(n => {
      const s = readJson(path.join(LOGS, 'swarm_state_' + n + '.json'), null) || {};
      return { name: n, level: s.level ?? null };
    });
    const p = readJson(path.join(LOGS, 'daily_' + leader + '.json'), null);
    const today = p && p.day === day ? p : { done: {}, tries: {} };
    return { leader, members, done: today.done || {}, tries: today.tries || {} };
  });
  const history = tsvLines(path.join(LOGS, 'kamaloka.log')).slice(-40).map(([at, id, ...r]) => ({ at, id, result: r.join(' ') })).reverse();
  // really cleared today (kamaloka.log result 'cleared' since 06:30) — the daily file's "done" only means "do not try again today"
  const dayStart = new Date(day + 'T06:30:00').getTime();
  const cleared = {}; history.forEach(h => { if (/clear/i.test(h.result) && Date.parse(h.at) >= dayStart) cleared[h.id] = h.at; });
  return {
    day, parties, history, cleared, hallTeam: hallTeam(),
    enabled: readJson(path.join(LOGS, 'daily_enabled.json'), {}) || {},
    kamaloka: list.map(k => ({ id: k.id, name: k.name, levelMin: k.levelMin, levelMax: k.levelMax, partyMin: k.partyMin, partyMax: k.partyMax,
      durationMin: k.durationMin, entry: k.entry, boss: k.boss, rewards: k.rewards, layout: layout[k.id] || null, learned: learned[k.id] || null })),
  };
}
/** swarm.js CONFIG.daily.hallTeam: the 6 who go into a Hall when the party is bigger (the rest wait in town).
 *  KAMALOKA PAGE 2026-10-09: the same precedence as swarm.js (swarm.config.json "dailyHallTeam" overrides the hardcoded default; the old code
 *  only read the swarm.js default). */
function hallTeam() {
  try { const cur = SC.reload(); if (cur && Array.isArray(cur.dailyHallTeam)) return cur.dailyHallTeam.map(String); } catch (e) { }
  if (Array.isArray(SC.cfg.dailyHallTeam)) return SC.cfg.dailyHallTeam.map(String);
  return hallTeamDefault();
}
function hallTeamSource() { try { const cur = SC.reload(); if (cur && Array.isArray(cur.dailyHallTeam)) return 'swarm.config.json dailyHallTeam'; } catch (e) { } return Array.isArray(SC.cfg.dailyHallTeam) ? 'swarm.config.json dailyHallTeam' : 'swarm.js default (CONFIG.daily.hallTeam)'; }
function hallTeamDefault() {
  try { const m = fs.readFileSync(path.join(ROOT, 'Scripts', 'swarm.js'), 'utf8').match(/hallTeam:\s*\[([^\]]*)\]/); return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : []; } catch (e) { return []; }
}
function kamalokaLive(leader) {
  // running = a run in progress; finished = the last run ended < 15 min ago (the tab keeps showing its result + trail)
  // LIVE PER PARTY 2026-10-09: Logs/kamaloka_live_<leader>.json per party (+ the old shared file), runs[] = every party's run
  return require('./live_runs').live(LOGS, 'kamaloka_live', 'kama', readJson, leader);
}
// Fortress / castle sieges (user 2026-10-08): Dashboard/sieges_api.js (readStates is a hoisted function declaration further down)
const SIEGES = require('./sieges_api')({ DATA, LOGS, ROOT, readJson, readStates: () => readStates() });
// POLYEDIT (user 2026-10-08 22:50): shape editor API for rooms / zones / spots / field areas (Dashboard/polyedit_api.js, UI polyedit.js)
const POLYEDIT = require('./polyedit_api')({ DATA, ROOT, LOGS, SETTINGS: path.join(ROOT, 'Settings'), TOOLS: path.join(ROOT, 'docs', 'plan', 'tools') });

/** All account configs in Settings (not settings.xml / mylogin1 duplicate). */
function accounts(states) {
  const auto = new Set();
  try {
    const st = fs.readFileSync(path.join(SETTINGS, 'settings.xml'), 'utf8');
    for (const m of st.matchAll(/configPath="([^"]+)"[^>]*enabled="true"/g)) auto.add(path.basename(m[1]).toLowerCase());
  } catch (e) { }
  const byName = {};
  states.forEach(s => { byName[s.name] = s; });
  return fs.readdirSync(SETTINGS).filter(f => f.endsWith('.xml') && !/^(settings|mylogin1)\.xml$/i.test(f)).map(f => {
    let xml = '';
    try { xml = fs.readFileSync(path.join(SETTINGS, f), 'utf8'); } catch (e) { }
    const tag = (t) => { const m = xml.match(new RegExp(`<${t}>([^<]*)</${t}>`)); return m ? m[1] : ''; };
    const ch = tag('SelectedCharacter');
    const st = byName[ch];
    return { file: f, login: tag('Name'), character: ch, autostart: auto.has(f.toLowerCase()),
      online: !!(st && st.ageSec < 30), level: st ? st.level : null, cls: st ? st.cls : null };
  });
}

async function mcpCall(tool, args) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const post = async (body) => {
    const r = await fetch(MCP, { method: 'POST', headers, body: JSON.stringify(body) });
    const sid = r.headers.get('mcp-session-id');
    if (sid) headers['Mcp-Session-Id'] = sid;
    let txt = await r.text();
    if (/^\s*(event|data):/.test(txt)) txt = txt.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join('');
    return JSON.parse(txt);
  };
  await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dashboard', version: '2' } } });
  const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } });
  if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));
  return (res.result.content || []).map(c => c.text).join('\n');
}
// --- MCP call for ONE character by name, also when it is hooked (in-game mode) ------------------------------------------------------
// Hook-mode audit 2026-10-07: L2Swarm's McpAccountResolver matches account_name against LoginName / User.Name / alias / ConfigPath;
// a hooked account reports no character name (is_logged_in=false) and answers "No account matches". Then the call is repeated with the
// config file of that character: the one an OPEN account uses (get_accounts_status) first, else the first Settings\*.xml with
// <SelectedCharacter>name<. Cached 60 s. Use for every per-character MCP call.
const cfgByChar = { at: 0, map: {} };
function selectedCharOf(file) { try { const m = fs.readFileSync(file, 'utf8').match(/<SelectedCharacter>([^<]+)</); return m ? m[1] : ''; } catch (e) { return ''; } }
async function configForChar(name) {
  const key = String(name || '').toLowerCase(); if (!key) return null;
  if (Date.now() - cfgByChar.at > 60000) {
    const map = {};
    try {   // configs of the open accounts win (two XML files can name the same character, e.g. mylogin1.xml / OldTank.xml)
      const all = JSON.parse(await mcpCall('get_accounts_status', {})); const list = Array.isArray(all) ? all : (all.accounts || []);
      list.forEach(a => { if (a.config_path) { const c = selectedCharOf(a.config_path).toLowerCase(); if (c && !map[c]) map[c] = a.config_path; } });
    } catch (e) { }
    try { fs.readdirSync(SETTINGS).filter(n => /\.xml$/i.test(n) && n !== 'settings.xml').forEach(n => { const f = path.join(SETTINGS, n), c = selectedCharOf(f).toLowerCase(); if (c && !map[c]) map[c] = f; }); } catch (e) { }
    cfgByChar.map = map; cfgByChar.at = Date.now();
  }
  return cfgByChar.map[key] || null;
}
async function mcpCallChar(tool, name, args) {
  const out = await mcpCall(tool, { account_name: name, ...(args || {}) });
  if (!/No account matches/i.test(String(out))) return out;
  const cfg = await configForChar(name);
  return cfg ? mcpCall(tool, { config_path: cfg, ...(args || {}) }) : out;
}

// --- New character on an account ------------------------------------------------
const RACES = { human: 0, elf: 1, darkelf: 2, orc: 3, dwarf: 4, kamael: 5 };
const START_CLASSES = {      // classId, base stats STR DEX CON INT WIT MEN
  'Human Fighter': [0, 0, [40, 30, 43, 21, 11, 25]], 'Human Mystic': [0, 10, [22, 21, 27, 41, 20, 39]],
  'Elf Fighter': [1, 18, [36, 35, 36, 23, 14, 26]], 'Elf Mystic': [1, 25, [21, 24, 25, 37, 23, 40]],
  'Dark Elf Fighter': [2, 31, [41, 34, 32, 25, 12, 26]], 'Dark Elf Mystic': [2, 38, [23, 23, 24, 44, 19, 37]],
  'Orc Fighter': [3, 44, [40, 26, 47, 18, 12, 27]], 'Orc Mystic': [3, 49, [27, 24, 31, 31, 15, 42]],
  'Dwarf Fighter': [4, 53, [39, 29, 45, 20, 10, 27]],
  'Kamael Soldier (male)': [5, 123, [41, 33, 31, 29, 11, 25]], 'Kamael Soldier (female)': [5, 124, [39, 35, 30, 28, 11, 27]],
};
function randomName() {
  const a = ['Kor', 'Vel', 'Mor', 'Thal', 'Dra', 'Ner', 'Sil', 'Bal', 'Fen', 'Gar', 'Lyr', 'Ruk', 'Zan', 'Ori', 'Kel'];
  const b = ['ion', 'ara', 'eth', 'gar', 'wyn', 'dor', 'ius', 'mir', 'rak', 'una', 'vex', 'ost', 'ira'];
  return a[Math.floor(Math.random() * a.length)] + b[Math.floor(Math.random() * b.length)] + (Math.random() < 0.5 ? '' : String(Math.floor(Math.random() * 90) + 10));
}
function newAccountConfig(login, password) {
  return new Promise((resolve, reject) => {
    // 2026-10-09: password via the child's environment (-PasswordEnv), never on the command line (visible in the process list)
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(PLAN, 'tools', 'new_account.ps1'), '-Login', login, '-PasswordEnv', 'L2S_NEWACCOUNT_PW'],
      { windowsHide: true, env: Object.assign({}, process.env, { L2S_NEWACCOUNT_PW: password }) }, (err, stdout, stderr) => err ? reject(new Error(String(stderr || err.message).split(password).join('***'))) : resolve(stdout));
  });
}
async function createCharacter({ login, password, startClass, sex, name }) {
  const cls = START_CLASSES[startClass];
  if (!cls) throw new Error(`unknown class ${startClass}`);
  const file = path.join(SETTINGS, login.charAt(0).toUpperCase() + login.slice(1).toLowerCase() + '.xml');
  const log = [];
  if (!fs.existsSync(file)) {
    if (!password) throw new Error('new account: password needed once (it is stored encrypted)');
    log.push(await newAccountConfig(login.toLowerCase(), password));
  }
  const charName = name || randomName();
  try { log.push(await mcpCall('open_account', { config_path: file })); } catch (e) { log.push('open: ' + e.message); }
  const [race, classId, st] = cls;
  const src = `(async () => {
  const log = (t) => File.AppendAllText('${ROOT_FWD}/Logs/create_chars.txt', new Date().toISOString() + ' [${login}] ' + t + '\\r\\n');
  log('waiting for character select to create ${charName}');
  for (let i = 0; i < 360; i++) {
    await sleep(5000);
    try { if (Me && Me.Name) { log('in game as ' + Me.Name); return; } } catch (e) { }
    try { Send.NewCharacter(); await sleep(1500); Send.CharacterCreate('${charName}', ${race}, ${sex ? 1 : 0}, ${classId}, ${st.join(', ')}, 0, 0, 0); if (i % 6 === 0) log('CharacterCreate sent'); } catch (e) { }
  }
})();`;
  log.push(await mcpCall('manage_account_scripts', { account_name: login.toLowerCase(), action: 'create', script_name: 'create_char.js', source: src }));
  const scriptName = (log[log.length - 1].match(/mcp_script_[0-9a-f]+\.js/) || [])[0];
  if (scriptName) log.push(await mcpCall('manage_account_scripts', { account_name: login.toLowerCase(), action: 'start', script_name: scriptName }));
  return { charName, log };
}

// --- Transfer: character X gives adena / items to character Y (user 2026-10-07) -----------------
// "if I have another character on the account with adena or items, the system should log in that character and transfer everything to
// another character — easy to command character X to transfer to character Y". Steps: find X's account (character index Logs/chars_<login>.json,
// written by swarm.js from the character list at every login) -> if X is not the account's active character: switch the RUNNING session to X
// with packets (RequestRestart + CharacterSelect, see switchCharacter; never close/open accounts, the XML is never changed; back at the end) -> both characters' scripts paused -> both .giran and walk to the
// .giran start -> trades of <= 10 items (adena last) -> scripts back on. One transfer at a time; every step is logged (Logs/transfer.log).
const TRANSFER = { job: null };
const GIRAN_START = [83473, 148554, -3408];
function knownLogins() {
  const set = new Set();
  try { fs.readdirSync(SETTINGS).filter(f => /\.xml$/i.test(f) && f !== 'settings.xml').forEach(f => { const m = fs.readFileSync(path.join(SETTINGS, f), 'utf8').match(/<Name>([^<]+)<\/Name>/); if (m) set.add(m[1].toLowerCase()); }); } catch (e) { }
  return set;
}
function charIndex() {
  const out = {}, logins = knownLogins();
  let files = []; try { files = fs.readdirSync(LOGS).filter(f => /^chars_[a-z0-9]+\.json$/.test(f)); } catch (e) { }
  for (const f of files) {
    const j = readJson(path.join(LOGS, f), null); if (!j || !j.names) continue;
    // 2026-10-07: swarm.js took "the string that repeats" as the login — with one character nothing repeats and login/name came out
    // swapped (chars_bishop1.json: login "bishop1", names ["mylogin2"]). The real logins are known from the configs: swap them back.
    let login = String(j.login || '').toLowerCase(), names = j.names.slice();
    if (!logins.has(login)) { const real = names.find(n => logins.has(n.toLowerCase())); if (real) { names = names.filter(n => n !== real).concat([j.login]); login = real.toLowerCase(); } }
    names.forEach(n => { if (!logins.has(n.toLowerCase())) out[n.toLowerCase()] = { name: n, login, at: j.at }; });
  }
  return out;
}
function configForLogin(login) {
  const st = (() => { try { return fs.readFileSync(path.join(SETTINGS, 'settings.xml'), 'utf8'); } catch (e) { return ''; } })();
  const files = fs.readdirSync(SETTINGS).filter(f => /\.xml$/i.test(f) && f !== 'settings.xml');
  const mine = files.filter(f => { try { return new RegExp(`<Name>${login}</Name>`, 'i').test(fs.readFileSync(path.join(SETTINGS, f), 'utf8')); } catch (e) { return false; } });
  return mine.find(f => st.includes('\\' + f + '"')) || mine[0] || null;               // the AutoStart one first
}
const mcpText = (r) => { const c = r && r.result && r.result.content; return c && c[0] ? c[0].text : JSON.stringify(r); };
async function mcpJ(tool, args) { const t = mcpText(await mcpCallRaw(tool, args)); try { return JSON.parse(t); } catch (e) { return { text: t }; } }
async function mcpCallRaw(tool, args) { const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const post = async (b) => { const r = await fetch(MCP, { method: 'POST', headers, body: JSON.stringify(b) }); const sid = r.headers.get('mcp-session-id'); if (sid) headers['Mcp-Session-Id'] = sid;
    let txt = await r.text(); if (/^\s*(event|data):/.test(txt)) txt = txt.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join(''); return JSON.parse(txt); };
  await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dashboard-transfer', version: '1' } } });
  return post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } }); }
const tsleep = (ms) => new Promise(r => setTimeout(r, ms));
async function onlineByChar(name) {
  const all = await mcpJ('get_accounts_status', {}); const list = all.accounts || all || [];
  return (Array.isArray(list) ? list : []).find(a => a.is_logged_in && a.character && String(a.character.name).toLowerCase() === String(name).toLowerCase()) || null;
}
// --- account selectors (2026-10-07): a login is not always accepted as account_name ("No account matches ... conflicting identity"),
// the account_id from get_accounts_status always is, and it stays the same while the account switches characters.
async function accountList() { const all = await mcpJ('get_accounts_status', {}); const l = all.accounts || all || []; return Array.isArray(l) ? l : []; }
async function accountByLogin(login) {
  const lg = String(login || '').toLowerCase();
  return (await accountList()).find(a => String(a.account_name || '').toLowerCase() === lg || String(a.configured_name || '').toLowerCase() === lg) || null;
}
const selOf = (acc) => (acc && acc.account_id ? { account_id: acc.account_id } : { account_name: acc.account_name });
async function waitInGame(sel, name, ms) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await tsleep(3000)) {
    const s = await mcpJ('get_account_status', sel);
    if (s && s.is_logged_in && s.character && String(s.character.name).toLowerCase() === name.toLowerCase()) return s;
  }
  return null;
}
async function scripts(sel, action) {   // 'stop' every enabled script / 'start' swarm.js again
  const l = await mcpJ('manage_account_scripts', { ...sel, action: 'list' });
  for (const sc of (l.scripts || [])) {
    if (action === 'stop' && sc.enabled) await mcpJ('manage_account_scripts', { ...sel, action: 'stop', script_name: sc.name });
    if (action === 'start' && sc.name === 'swarm.js' && !sc.enabled) await mcpJ('manage_account_scripts', { ...sel, action: 'start', script_name: 'swarm.js' });
  }
}

// --- Character switch INSIDE the running session (2026-10-07) ---------------------------------------------------------------------
// close_account/open_account while an account reconnects made L2Swarm grow 4 -> 9 GB within a minute (twice on 2026-10-07), so the
// transfer never closes or opens accounts and never touches the config XML. Instead a one-shot script (Scripts/xfer_<login>_<time>_<to|back>.js)
// is attached to the running account: it sends RequestRestart (client 0x57) -> the server answers RestartResponse (0x71, int32 1 = ok)
// and the character list (0x09) -> INSIDE OnIncomingPacket (before L2Swarm's own auto-select ~0.4 s later, which the server then ignores
// because a character is already selected) it sends CharacterSelect for the wanted slot -> waits until Me.Name is that character.
// Packet layouts (L2J High Five):
//   client 0x12 CharacterSelect: int32 slot, int16 0, int32 0, int32 0, int32 0   (CharacterSelect.readImpl: readD, readH, readD x3)
//   server 0x09 CharSelectionInfo: int32 count, int32 max, byte 0, then per character: name (UTF-16LE, 0-terminated), int32 objId,
//          login (UTF-16LE, 0-terminated), ... fixed fields. The script finds every "login" string; the name sits right before its objId;
//          the slot = the order. Fallback: positions of all known names of the account in the packet (when they add up to the count).
// The script writes its state to Logs/xfer_<tag>.json and its lines to Logs/xfer_<tag>.log; the dashboard copies them into transfer.log.
function buildSwitchScript({ login, target, tag, known }) {
  return `// one-shot character switch for the dashboard transfer (${tag}) — generated by Dashboard/server.js; safe to delete
(async () => {
  const LOGIN = ${JSON.stringify(String(login))}, TARGET = ${JSON.stringify(String(target))}, KNOWN = ${JSON.stringify(known || [])};
  const SF = '${ROOT_FWD}/Logs/xfer_${tag}.json', LF = '${ROOT_FWD}/Logs/xfer_${tag}.log';
  const log = (t) => { try { File.AppendAllText(LF, new Date().toISOString() + ' [' + LOGIN + ' -> ' + TARGET + '] ' + t + '\\r\\n'); } catch (e) { } };
  const st = { started: new Date().toISOString(), target: TARGET, stage: 'start', ok: false };
  const put = () => { try { File.WriteAllText(SF, JSON.stringify(st)); } catch (e) { } };
  try { const old = JSON.parse(File.ReadAllText(SF)); if (old && old.started) { log('state file exists: this script already ran once - not again'); return; } } catch (e) { }
  put();
  const myName = () => { try { return Me && Me.Name ? String(Me.Name) : ''; } catch (e) { return ''; } };
  const ready = () => { try { return IsCharacterReady(); } catch (e) { return false; } };
  const b2 = (n) => ('0' + (n & 255).toString(16)).slice(-2);
  const le = (n) => b2(n) + b2(n >> 8) + b2(n >> 16) + b2(n >> 24);
  const selectHex = (slot) => '12' + le(slot) + '0000' + le(0) + le(0) + le(0);
  const isAlnum = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
  function parseList(p) {
    const n = Number(p.length !== undefined ? p.length : p.Length);
    const B = (i) => Number(p[i]) & 255, u16 = (i) => B(i) | (B(i + 1) << 8), d = (i) => (B(i) | (B(i + 1) << 8) | (B(i + 2) << 16) | (B(i + 3) << 24)) >>> 0;
    const out = { count: d(3), max: d(7), len: n, names: [], slot: -1, how: '' };
    const lg = LOGIN.toLowerCase(), T = TARGET.toLowerCase();
    // 1) every login string (UTF-16LE, 0-terminated) with [name\\0][objId] right before it
    for (let i = 12; i + lg.length * 2 + 1 < n; i++) {
      let ok = true;
      for (let k = 0; k < lg.length && ok; k++) { const c = u16(i + 2 * k); ok = c < 128 && String.fromCharCode(c).toLowerCase() === lg[k]; }
      if (!ok || u16(i + 2 * lg.length) !== 0 || i - 6 < 12 || u16(i - 6) !== 0) continue;
      let nm = '';
      for (let j = i - 8; j >= 12 && nm.length < 18; j -= 2) { const c = u16(j); if (!isAlnum(c)) break; nm = String.fromCharCode(c) + nm; }
      if (!nm) continue;
      out.names.push({ name: nm, objId: d(i - 4) });
      i += lg.length * 2 + 1;
    }
    let idx = out.names.findIndex(x => x.name.toLowerCase() === T);
    if (idx < 0) idx = out.names.findIndex(x => x.name.toLowerCase().endsWith(T) && x.name.length - T.length <= 2);   // a stray byte pair of the record before
    if (idx >= 0) { out.slot = idx; out.how = 'login scan'; return out; }
    // 2) fallback: where the known names of this account sit in the packet (only when they add up to the character count)
    const find = (s) => { const w = s.toLowerCase(); for (let i = 12; i + w.length * 2 + 1 < n; i++) { let ok = true;
      for (let k = 0; k < w.length && ok; k++) { const c = u16(i + 2 * k); ok = c < 128 && String.fromCharCode(c).toLowerCase() === w[k]; }
      if (ok && u16(i + 2 * w.length) === 0 && (i < 14 || !isAlnum(u16(i - 2)))) return i; } return -1; };
    const all = [...new Set(KNOWN.concat([TARGET]).map(x => x.toLowerCase()))].map(x => ({ x, at: find(x) })).filter(o => o.at >= 0).sort((a, b) => a.at - b.at);
    if (all.length === out.count) { const k = all.findIndex(o => o.x === T); if (k >= 0) { out.slot = k; out.how = 'known-name positions'; } }
    return out;
  }
  let armed = false, restartAns = null, list = null, charSelected = false, hookErr = null;
  try { Options.EnableJSOnIncomingPacket = true; } catch (e) { log('cannot switch on EnableJSOnIncomingPacket: ' + e); }
  globalThis.OnIncomingPacket = (p) => {
    try {
      const op = Number(p[2]) & 255;
      if (op === 0x71) restartAns = (Number(p[3]) & 255);
      else if (op === 0x09 && armed) {
        armed = false;
        const r = parseList(p); list = r;
        if (r.slot >= 0) Send.SendHex(selectHex(r.slot));     // FIRST, before L2Swarm's own CharacterSelect
      } else if (op === 0x0b) charSelected = true;
    } catch (e) { hookErr = String(e); }
  };
  try {
    if (myName().toLowerCase() === TARGET.toLowerCase() && ready()) { st.stage = 'done'; st.ok = true; st.note = 'already in game as ' + TARGET; log(st.note); return; }
    for (let t = 1; t <= 6 && !st.ok; t++) {
      restartAns = null; list = null; charSelected = false; hookErr = null; armed = true;
      st.stage = 'restart ' + t; put();
      // L2Swarm selects its OWN configured character ~0.4 s after the list (it won the race on 2026-10-07 16:15): point that live setting
      // (memory only — the XML is not saved) at the target, so L2Swarm itself picks it; our CharacterSelect stays as a second try
      try { Options.SelectedCharacter = TARGET; } catch (e) { log('Options.SelectedCharacter not settable: ' + e.message); }
      Send.SendHex('57');
      log('try ' + t + ': RequestRestart (0x57) sent as ' + (myName() || '?'));
      for (let w = 0; w < 48 && !list && restartAns !== 0; w++) await sleep(250);
      if (hookErr) log('packet hook error: ' + hookErr);
      if (!list) {
        armed = false;
        log(restartAns === 0 ? 'the server refused the restart (in combat / casting?) - waiting 10 s' : 'no character list within 12 s (restart answer ' + restartAns + ')');
        st.error = restartAns === 0 ? 'restart refused by the server' : 'no character list';
        await sleep(10000); continue;
      }
      log('character list: count ' + list.count + ', ' + list.names.map((x, i) => i + '=' + x.name).join(' ') + (list.how ? ' (slot by ' + list.how + ')' : ''));
      if (list.slot < 0) { st.error = TARGET + ' is not on the character list of ' + LOGIN; log(st.error + ' - L2Swarm selects its own character'); break; }
      log('CharacterSelect slot ' + list.slot + ' sent (' + selectHex(list.slot) + ')');
      st.stage = 'selected slot ' + list.slot; st.slot = list.slot; put();
      for (let w = 0; w < 240; w++) {                       // 60 s
        await sleep(250);
        if (ready() && myName()) {
          if (myName().toLowerCase() === TARGET.toLowerCase()) { st.ok = true; break; }
          if (w > 120) break;                                 // in game as someone else (L2Swarm's own pick won)
        }
      }
      if (st.ok) break;
      st.error = 'not in game as ' + TARGET + ' after select (now ' + (myName() || 'nobody') + (charSelected ? ', CharSelected seen' : '') + ')';
      log(st.error);
      await sleep(4000);
    }
    if (st.ok) { await sleep(1500); try { Send.SendHex('3A'); } catch (e) { } log('in game as ' + myName() + ' (Appearing sent)'); st.error = null; }
  } catch (e) { st.error = 'script error: ' + e; log(st.error); }
  finally {
    armed = false;
    try { Options.EnableJSOnIncomingPacket = false; } catch (e) { }
    st.stage = 'done'; st.now = myName(); st.ended = new Date().toISOString(); put();
  }
})();`;
}
// Attach the switch script, wait until the account is in game as <target>, then stop + remove it. Returns { ok, error }.
async function switchCharacter(sel, login, target, dir, known, log) {
  const tag = `${String(login).toLowerCase()}_${Date.now()}_${dir}`, file = `xfer_${tag}.js`;
  const stFile = path.join(LOGS, `xfer_${tag}.json`), lgFile = path.join(LOGS, `xfer_${tag}.log`);
  log(`switching ${login} to ${target} in the running session (script ${file})`);
  let scriptName = file, guid = null;
  const cr = await mcpJ('manage_account_scripts', { ...sel, action: 'create', file_name: file, source: buildSwitchScript({ login, target, tag, known }) });
  guid = cr.script_guid || cr.guid || (cr.script && (cr.script.guid || cr.script.script_guid)) || null;
  scriptName = cr.script_name || cr.name || (cr.script && cr.script.name) || ((cr.text || '').match(/xfer_[a-z0-9_]+\.js/i) || [])[0] || file;
  if (cr.text && /error|fail|refus|exists/i.test(cr.text) && !/created/i.test(cr.text)) log(`create answered: ${cr.text.slice(0, 200)}`);
  const ref = guid ? { script_guid: guid } : { script_name: scriptName };
  await mcpJ('manage_account_scripts', { ...sel, action: 'start', ...ref });
  let res = { ok: false, error: `not in game as ${target} within 3 min` }, st = null;
  for (const t0 = Date.now(); Date.now() - t0 < 180000; await tsleep(2000)) {
    st = readJson(stFile, null);
    const s = await mcpJ('get_account_status', sel).catch(() => null);
    const inGame = s && s.is_logged_in && s.character && String(s.character.name).toLowerCase() === String(target).toLowerCase();
    if (inGame && (!st || st.ok || st.stage === 'done')) { res = { ok: true }; break; }
    if (st && st.stage === 'done' && !st.ok) {
      res = { ok: false, error: st.error || 'switch script gave up' };
      await tsleep(4000);                                     // L2Swarm may still be logging its own character in
      break;
    }
  }
  try { fs.readFileSync(lgFile, 'utf8').split(/\r?\n/).filter(Boolean).forEach(l => log('  script: ' + l.replace(/^\S+\s+/, ''))); } catch (e) { }
  try { await mcpJ('manage_account_scripts', { ...sel, action: 'stop', ...ref }); } catch (e) { }
  try { await mcpJ('manage_account_scripts', { ...sel, action: 'remove', ...ref }); } catch (e) { log('remove script: ' + e.message); }
  try { fs.unlinkSync(path.join(ROOT, 'Scripts', file)); } catch (e) { }
  log(res.ok ? `${login} is in game as ${target}` : `switch to ${target} FAILED: ${res.error}`);
  return res;
}
async function transferRun({ from, to, what }) {
  const job = TRANSFER.job, log = (t) => { const l = `${new Date().toISOString()} ${from} -> ${to}: ${t}`; job.log.push(l); try { fs.appendFileSync(path.join(LOGS, 'transfer.log'), l + '\r\n'); } catch (e) { } };
  let switched = null, fromSel = null, toSel = null, fromLogin = null, toLogin = null;
  try {
    const idx = charIndex(), fe = idx[from.toLowerCase()];
    const toAcc = await onlineByChar(to);
    if (!toAcc) throw new Error(`${to} is not online`);
    toSel = selOf(toAcc); toLogin = toAcc.account_name;
    // X: already in game somewhere, or an old character on a running account (character index Logs/chars_<login>.json)
    let fromAcc = await onlineByChar(from);
    if (!fromAcc) {
      if (!fe) throw new Error(`${from} is not in the character index (its account has to log in once with the new swarm.js) and is not online`);
      const acc = await accountByLogin(fe.login);
      if (!acc || !acc.is_logged_in || !acc.character) throw new Error(`account ${fe.login} (${from}'s account) is not logged in in L2Swarm — the transfer no longer opens or closes accounts; log it in first`);
      if (acc.account_id === toAcc.account_id) throw new Error(`${from} and ${to} are on the same account ${fe.login} — only one of them can be in game`);
      const normal = acc.character.name;
      fromSel = selOf(acc); fromLogin = acc.account_name;
      const known = [...new Set((idx ? Object.values(idx).filter(c => c.login === String(fe.login).toLowerCase()).map(c => c.name) : []).concat([normal]))];
      log(`${from} is on account ${fromLogin} (now in game: ${normal}) — pausing its scripts and bot, then switching characters in the session`);
      await scripts(fromSel, 'stop');
      await mcpJ('run_account_command', { ...fromSel, command: '/disablebot' });
      await mcpJ('run_account_command', { ...fromSel, command: '/stopcombat' });
      await tsleep(2000);
      switched = { sel: fromSel, login: fromLogin, normal, known };
      const r = await switchCharacter(fromSel, fromLogin, fe.name, 'to', known, log);
      if (!r.ok) throw new Error(`could not switch ${fromLogin} to ${from}: ${r.error}`);
      await tsleep(1500); await mcpJ('send_game_action', { ...fromSel, action: 'raw_packet', params: { hex: '3A' } });   // never stand frozen after the switch
      fromAcc = await mcpJ('get_account_status', fromSel);
      // 2026-10-07 18:21: Constructed stood 5 min inside the Tower of Insolence and never moved on ".giran" (old characters were left in
      // hunting grounds, often dead) -> a dead old character respawns in the nearest village first (RequestRestartPoint 0x7D, type 0)
      if (fromAcc && fromAcc.character && fromAcc.character.is_dead) {
        log(`${from} is dead at ${Math.round(fromAcc.character.x)},${Math.round(fromAcc.character.y)} — respawning in the nearest village`);
        await mcpJ('send_game_action', { ...fromSel, action: 'raw_packet', params: { hex: '7D00000000' } });
        await tsleep(8000); await mcpJ('send_game_action', { ...fromSel, action: 'raw_packet', params: { hex: '3A' } }); await tsleep(2000);
        fromAcc = await mcpJ('get_account_status', fromSel);
        log(`${from} after respawn: ${fromAcc && fromAcc.character ? (fromAcc.character.is_dead ? 'still dead' : 'alive') + ' at ' + Math.round(fromAcc.character.x) + ',' + Math.round(fromAcc.character.y) : 'unknown'}`);
      } else if (fromAcc && fromAcc.character) log(`${from} is alive at ${Math.round(fromAcc.character.x)},${Math.round(fromAcc.character.y)},${Math.round(fromAcc.character.z)} (HP ${fromAcc.character.hp_percent}%)`);
    } else { fromSel = selOf(fromAcc); fromLogin = fromAcc.account_name; }
    if (fromAcc.account_id && fromAcc.account_id === toAcc.account_id) throw new Error(`${from} and ${to} are on the same account`);
    // 2026-10-07 16:19: after the switch the old character stood FROZEN (no Appearing) and the receiver was in a fight (".giran" refused in
    // combat; its script — which fights off / steps away first — had been stopped). Now: Appearing for both; the receiver's OWN script takes
    // it to Giran ("!town giran" = the safe trip); the plain ".giran" is repeated every 20 s for the old character; up to 5 min; only then the
    // scripts of both are paused for the trade.
    log(`both online (${fromLogin} / ${toLogin}) — both to Giran (the receiver by its own safe trip)`);
    for (const s of [fromSel, toSel]) await mcpJ('send_game_action', { ...s, action: 'raw_packet', params: { hex: '3A' } });
    try { await fetch(SELF + '/api/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd: '!town giran', target: 'char:' + to }) }); } catch (e) { }
    await mcpJ('run_account_command', { ...fromSel, command: '/disablebot' });
    let a, b;
    const near = (s) => s && s.character && Math.hypot(s.character.x - GIRAN_START[0], s.character.y - GIRAN_START[1]) < 4000;
    for (let t0 = Date.now(), lastPort = 0; Date.now() - t0 < 300000; await tsleep(3000)) {
      a = await mcpJ('get_account_status', fromSel); b = await mcpJ('get_account_status', toSel);
      if (near(a) && near(b)) break;
      if (!near(a) && Date.now() - lastPort > 20000) { lastPort = Date.now(); await mcpJ('send_game_action', { ...fromSel, action: 'raw_packet', params: { hex: '3A' } }); await mcpJ('run_account_command', { ...fromSel, command: '.giran' }); }
    }
    const where = (s) => s && s.character ? `${Math.round(s.character.x)},${Math.round(s.character.y)},${Math.round(s.character.z)}${s.character.in_combat ? ' in combat' : ''}` : 'unknown';
    if (!near(a) || !near(b)) throw new Error(`both did not get to Giran within 5 min (${from} ${near(a) ? 'there' : 'not there: ' + where(a)}, ${to} ${near(b) ? 'there' : 'not there: ' + where(b)})`);
    log('both in Giran — pausing their scripts for the trade');
    await scripts(fromSel, 'stop'); await scripts(toSel, 'stop');
    for (const s of [fromSel, toSel]) await mcpJ('run_account_command', { ...s, command: '/disablebot' });
    // 2026-10-07 18:23: all 13 trade rounds moved 0 — the old character's script is off, so nobody sent Appearing after its .giran and it
    // stood frozen far from the receiver. Now: Appearing for both, walk side by side, check the distance (trade range ~150) before trading.
    let dist = Infinity;
    for (let tries = 0; tries < 4 && dist > 120; tries++) {
      for (const s of [fromSel, toSel]) await mcpJ('send_game_action', { ...s, action: 'raw_packet', params: { hex: '3A' } });
      await tsleep(1500);
      // 18:28: pathfind_move did nothing (it runs the bot's points-following thread and the bot is off) -> plain click move (move_to):
      // the old character walks straight next to the receiver, who stands still
      const bb = b && b.character ? b.character : { x: GIRAN_START[0], y: GIRAN_START[1], z: GIRAN_START[2] };
      await mcpJ('send_game_action', { ...toSel, action: 'stop_move' }).catch(() => { });
      await mcpJ('send_game_action', { ...fromSel, action: 'move_to', params: { x: Math.round(bb.x) + 40, y: Math.round(bb.y), z: Math.round(bb.z) } });
      await tsleep(6000);
      a = await mcpJ('get_account_status', fromSel); b = await mcpJ('get_account_status', toSel);
      dist = a && b && a.character && b.character ? Math.hypot(a.character.x - b.character.x, a.character.y - b.character.y) : Infinity;
      log(`meeting: ${from} ${where(a)}, ${to} ${where(b)}, ${Math.round(dist)} apart`);
    }
    if (dist > 150) throw new Error(`${from} and ${to} could not meet (${Math.round(dist)} apart)`);
    const toObj = b.character.obj_id;
    // what to give
    const inv = await mcpJ('get_account_data', { ...fromSel, type: 'inventory' });
    const items = (inv.items || inv || []).filter(i => i && !i.is_equipped && !i.is_quest && Number(i.count) > 0);
    const adena = items.find(i => i.item_id === 57);
    const pick = what === 'adena' ? [] : items.filter(i => i.item_id !== 57);
    log(`giving ${what === 'adena' ? 'adena only' : pick.length + ' item stacks + adena'} (${adena ? adena.count : 0} adena) to obj ${toObj}`);
    const rounds = []; for (let i = 0; i < pick.length; i += 10) rounds.push(pick.slice(i, i + 10));
    if (adena) rounds.push([adena]);
    let ok = 0;
    for (const [n, r] of rounds.entries()) {
      const brief = (o) => { try { return JSON.stringify(o).slice(0, 160); } catch (e) { return String(o); } };
      const rq = await mcpJ('send_game_action', { ...fromSel, action: 'trade_request', params: { obj_id: toObj } }).catch(e => ({ error: e.message }));
      await tsleep(1500);
      const an = await mcpJ('send_game_action', { ...toSel, action: 'trade_answer', params: { answer: 1 } }).catch(e => ({ error: e.message }));
      await tsleep(1200);
      if (n === 0) log(`trade_request -> ${brief(rq)} | trade_answer -> ${brief(an)}`);
      for (const it of r) { const ad = await mcpJ('send_game_action', { ...fromSel, action: 'trade_add_item', params: { obj_id: it.obj_id, count: Number(it.count) } }).catch(e => ({ error: e.message })); if (n === 0 && it === r[0]) log(`trade_add_item -> ${brief(ad)}`); await tsleep(350); }
      await tsleep(800);
      await mcpJ('send_game_action', { ...fromSel, action: 'trade_done', params: { answer: 1 } }); await tsleep(700);
      await mcpJ('send_game_action', { ...toSel, action: 'trade_done', params: { answer: 1 } }); await tsleep(2500);
      const after = await mcpJ('get_account_data', { ...fromSel, type: 'inventory' });
      const left = new Set((after.items || after || []).map(i => i.obj_id));
      const moved = r.filter(it => it.item_id === 57 ? !((after.items || after || []).find(i => i.item_id === 57 && Number(i.count) >= Number(it.count))) : !left.has(it.obj_id)).length;
      ok += moved;
      log(`trade ${n + 1}/${rounds.length}: ${moved}/${r.length} moved (${r.map(i => i.name + (Number(i.count) > 1 ? ' x' + i.count : '')).join(', ').slice(0, 300)})`);
    }
    log(`DONE: ${ok} stacks moved`);
    job.result = 'done';
  } catch (e) { log('FAILED: ' + e.message); job.result = 'failed: ' + e.message; }
  finally {
    try { if (toSel) { await mcpJ('run_account_command', { ...toSel, command: '/enablebot' }); await scripts(toSel, 'start'); } } catch (e) { log('restore ' + to + ': ' + e.message); }
    try {
      if (switched) {
        const s = await mcpJ('get_account_status', switched.sel).catch(() => null);
        const now = s && s.is_logged_in && s.character ? s.character.name : null;
        let back = now && now.toLowerCase() === switched.normal.toLowerCase();
        if (!back) {
          log(`switching ${switched.login} back to ${switched.normal} (now: ${now || 'not in game'})`);
          back = (await switchCharacter(switched.sel, switched.login, switched.normal, 'back', switched.known, log)).ok;
        }
        if (back) { await mcpJ('run_account_command', { ...switched.sel, command: '/enablebot' }); await scripts(switched.sel, 'start'); log(`account ${switched.login} is back on ${switched.normal}, bot + swarm.js on`); }
        else log(`WARNING: account ${switched.login} is NOT back on ${switched.normal} — bot and swarm.js left off; do not close/open the account, retry the transfer or switch by hand`);
      } else if (fromSel) { await mcpJ('run_account_command', { ...fromSel, command: '/enablebot' }); await scripts(fromSel, 'start'); }
    } catch (e) { log('switch back: ' + e.message); }
    job.running = false;
  }
}

// --- Raid routes -------------------------------------------------------------------------------
// swarm.js saves every successful landing -> boss walk to Scripts/data/routes/raid/<bossId>.json and reuses it for EVERY party
// (the file belongs to the boss, not to a character). The user can correct it here (x,y,z list, current position of a
// character, pasted /loc lines) and LOCK it (manual: true): swarm.js then never overwrites or drops it.
const ROUTES = path.join(DATA, 'routes', 'raid');
function bossById(id) { return (readJson(path.join(DATA, 'raidbosses_h5.json'), { bosses: [] }).bosses || []).find(b => String(b.id) === String(id)) || null; }
function routeLen(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return Math.round(l); }
function routeList() {
  let files = []; try { files = fs.readdirSync(ROUTES).filter(f => /^\d+\.json$/.test(f)); } catch (e) { }
  return files.map(f => { const r = readJson(path.join(ROUTES, f), null); if (!r) return null; const b = bossById(f.slice(0, -5)) || {};
    // RAIDS PAGE 2026-10-09: who recorded / last used it (by, lastBy: the party leader, swarm.js since 2026-10-09), its start, a small shape
    const P = r.points || [], step = Math.max(1, Math.ceil(P.length / 24)), shape = P.filter((p, i) => i % step === 0 || i === P.length - 1).map(p => [Math.round(p.x), Math.round(p.y)]);
    return { id: f.slice(0, -5), boss: r.boss || b.name, level: b.level, landing: r.landing, points: (r.points || []).length, length: r.length, uses: r.uses || 0, fails: r.fails || 0, manual: !!r.manual, savedAt: r.savedAt, editedAt: r.editedAt || null,
      by: r.by || null, lastBy: r.lastBy || null, lastOk: r.lastOk || null, lastFail: r.lastFail || null, lastFailBy: r.lastFailBy || null, start: r.start || null,
      autoFixed: Array.isArray(r.autoFixed) ? r.autoFixed.length : 0, zone: b.zoneName || '', boss_xy: b.x != null ? [b.x, b.y] : null, shape };
  }).filter(Boolean).sort((a, b) => (a.level || 0) - (b.level || 0));
}
// .townname landings (docs/plan/town_commands.md, = swarm.js TOWN_LAND): a user route may START in one of these towns
const TOWN_LANDINGS = { Gludin: [-80786, 150251, -3040], Gludio: [-12712, 122776, -3120], Dion: [15619, 143132, -2720], Giran: [83473, 148554, -3408],
  Oren: [82760, 53578, -1488], Aden: [147448, 25816, -2016], Hunters: [116589, 76268, -2736], Heine: [111381, 218981, -3536], Goddard: [147732, -56554, -2784],
  Rune: [43759, -48122, -800], Schuttgart: [87355, -142095, -1344] };
// dungeon / floor maps from the client (Maps/<X>_<Y>_<n>.jpg): { "X_Y": [1, 2, 3] }
let MAPLAYERS = null;
function mapLayers() {
  if (MAPLAYERS) return MAPLAYERS;
  MAPLAYERS = {};
  try { fs.readdirSync(path.join(ROOT, 'Maps', 'high')).forEach(n => { const m = n.match(/^(\d+_\d+)_(\d)\.jpg$/); if (m) (MAPLAYERS[m[1]] = MAPLAYERS[m[1]] || []).push(+m[2]); }); } catch (e) { }
  Object.values(MAPLAYERS).forEach(a => a.sort());
  return MAPLAYERS;
}
// every "Town -> destination" the bots have seen on a LIVE gatekeeper menu (Scripts/data/gk_live), prices removed: the editor's picklist
function gkStartList() {
  const out = new Set(), dir = path.join(DATA, 'gk_live');
  try { fs.readdirSync(dir).filter(n => /.json$/.test(n) && n !== '_index.json').forEach(n => { const g = readJson(path.join(dir, n), null); if (!g || !g.town) return;
    Object.values(g.pages || {}).forEach(list => (list || []).forEach(t => { const c = String(t).replace(/&#\d+;/g, '').replace(/\s+-\s+[\d.,]+\s*$/, '').replace(/\s+free$/i, '').trim();
      if (c && !/teleport|exchange|nobless|arena|fantasy|alegria|quest|^move to|^return|^back/i.test(c)) out.add(`${g.town} -> ${c}`); })); }); } catch (e) { }
  return [...out].sort();
}
// --- Zone editor data (user 2026-10-07: "define hunting zones with points, exclusion zones, how to get there, and see where every teleport
// lands") -----------------------------------------------------------------------------------------------------------------------
const gkKey = (s) => String(s || '').toLowerCase().replace(/&#\d+;/g, '').replace(/\bthe\b|\btown of\b|\bvillage\b|\btownship\b|\(|\)/g, '').replace(/[^a-z0-9>]/g, '');
let LANDINGS = null;
function landings() {
  if (LANDINGS && Date.now() - LANDINGS.at < 600000) return LANDINGS.v;
  const tp = readJson(path.join(DATA, 'teleports_h5.json'), []), list = Array.isArray(tp) ? tp : (tp.teleports || []);
  const byKey = {}; list.forEach(t => { byKey[gkKey(t.desc)] = t; });
  const out = [];
  for (const desc of gkStartList()) {                               // only destinations seen on a LIVE gatekeeper menu, with the datapack's coordinates
    const [from, to] = desc.split('->').map(x => x.trim());
    let t = byKey[gkKey(desc)];
    if (!t) { const tk = gkKey(to); t = list.find(x => gkKey(String(x.desc).split('->')[1]) === tk); }   // same destination from another town
    if (t) out.push({ desc, from, to, x: t.x, y: t.y, z: t.z });
  }
  const v = { gk: out, towns: TOWN_LANDINGS };
  LANDINGS = { at: Date.now(), v };
  return v;
}
let SPAWNIDX = null;
function spawnsIn(x0, y0, x1, y1, z0, z1) {
  if (!SPAWNIDX) {
    const sp = readJson(path.join(DATA, 'spawns_h5.json'), []), np = readJson(path.join(DATA, 'npcs_h5.json'), {}), ag = readJson(path.join(DATA, 'aggro_h5.json'), {});
    const rb = readJson(path.join(DATA, 'raidbosses_h5.json'), { bosses: [] }), rbn = new Set((rb.bosses || rb || []).map(b => b.name));
    SPAWNIDX = (Array.isArray(sp) ? sp : []).map(s => { const n = np[String(s.id)]; if (!n || n.ty !== 'L2Monster' && !rbn.has(n.n)) return null;
      return { x: s.x, y: s.y, z: s.z, l: n.l, n: n.n, a: ag[n.n] ? 1 : 0, b: rbn.has(n.n) ? 1 : 0 }; }).filter(Boolean);
  }
  const out = SPAWNIDX.filter(s => s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1 && (z0 === undefined || s.z >= z0) && (z1 === undefined || s.z <= z1));
  return out.length > 2500 ? out.filter((s, i) => s.b || i % Math.ceil(out.length / 2500) === 0) : out;
}
/** L2Swarm's own combat-map format (Settings/*.zmap). Only the outer polygon: L2Swarm's exact format for exclusion polygons could not be
 *  verified (2026-10-07: InternalPolies is always empty in its own files and the loaded zone is not readable from a script), so swarm.js
 *  enforces the exclusion zones itself (monsters inside one are ignored mobs). */
function zmapXml(poly) {
  const pts = poly.map(q => `      <point x="${Math.round(q.x)}" y="${Math.round(q.y)}" />`).join('\r\n');
  return ['<?xml version="1.0" encoding="utf-8"?>', '<zone>', '  <ExternalPoly>', '    <points>', pts, '    </points>', '  </ExternalPoly>',
    '  <InternalPolies />', '</zone>', ''].join('\r\n');
}
function routeApi(b, qid) {
  const id = String((b && b.id) || qid || '').replace(/[^0-9]/g, '');
  const boss = bossById(id); if (!boss) return { error: 'unknown boss id' };
  const file = path.join(ROUTES, id + '.json'), cur = readJson(file, null);
  const tp = boss.nearestTeleport || {};
  const info = { id, boss: { id, name: boss.name, level: boss.level, x: boss.x, y: boss.y, z: boss.z }, landingDefault: tp.desc ? { desc: tp.desc, x: tp.x, y: tp.y, z: tp.z } : null,
    towns: TOWN_LANDINGS, layers: mapLayers(), gkStarts: gkStartList() };
  if (!b) return { ...info, route: cur };
  fs.mkdirSync(path.join(ROUTES, 'history'), { recursive: true });
  const keep = () => { if (cur) fs.copyFileSync(file, path.join(ROUTES, 'history', `${id}_${Date.now()}.json`)); };   // every change keeps the old version
  const write = (o) => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(o), 'utf8'); fs.renameSync(tmp, file); };
  if (b.action === 'delete') { if (cur) { keep(); fs.unlinkSync(file); } return { ...info, route: null, msg: 'deleted — the bots record a new walk next time' }; }
  if (b.action === 'unlock' || b.action === 'lock') { if (!cur) return { error: 'no route saved for this boss' }; keep(); cur.manual = b.action === 'lock'; cur.editedAt = new Date().toISOString(); write(cur); return { ...info, route: cur }; }
  // save: points [{x,y,z}] (2..500, numbers), landing text = the teleport the bots use to get there (must match, or the route is not used)
  const pts = Array.isArray(b.points) ? b.points.map(p => { const o = { x: Math.round(+p.x), y: Math.round(+p.y), z: Math.round(+p.z) }; if (+p.layer > 0 && +p.layer < 10) o.layer = Math.round(+p.layer); return o; }) : [];
  if (pts.length < 2 || pts.length > 500 || pts.some(p => ![p.x, p.y, p.z].every(Number.isFinite) || Math.abs(p.x) > 400000 || Math.abs(p.y) > 400000 || Math.abs(p.z) > 30000)) return { error: 'need 2-500 points with numeric x, y, z' };
  // START (user 2026-10-06): { kind: 'town', town: 'Heine' } = .heine, or { kind: 'gk', desc: 'Dion -> Plains of Dion' }; the bots then walk this route
  // from there with every member. Without a start the old landing text is kept (recorded routes).
  let start = b.start === undefined ? (cur && cur.start) || null : b.start;
  if (start) {
    if (start.kind === 'town') { if (!TOWN_LANDINGS[start.town]) return { error: 'unknown town ' + start.town }; start = { kind: 'town', town: start.town }; }
    else if (start.kind === 'gk') { const d = String(start.desc || '').trim(); if (!/->/.test(d)) return { error: 'gatekeeper start like "Dion -> Plains of Dion"' }; start = { kind: 'gk', desc: d.slice(0, 120), from: d.split('->')[0].trim() }; }
    else start = null;
  }
  const landing = start ? (start.kind === 'town' ? '.' + start.town.toLowerCase() : start.desc) : String(b.landing || (cur && cur.landing) || tp.desc || '').slice(0, 120);
  if (!landing) return { error: 'landing (the teleport, e.g. "Dion -> Plains of Dion") is required' };
  keep();
  const now = new Date().toISOString();
  const o = { boss: boss.name, id: boss.id, landing, start, length: routeLen(pts), points: pts, savedAt: (cur && cur.savedAt) || now, editedAt: now, uses: (cur && cur.uses) || 0, lastOk: (cur && cur.lastOk) || null, fails: 0, manual: b.manual !== false };
  write(o);
  return { ...info, route: o, msg: o.manual ? 'saved and locked — the bots use exactly this route' : 'saved' };
}

// --- Access (phone): everyone except this PC must send the key from key.txt -----------------
const KEY = (() => { try { return fs.readFileSync(path.join(__dirname, 'key.txt'), 'utf8').trim(); } catch (e) { return ''; } })();
function allowed(req, url) {
  const ip = req.socket.remoteAddress || '';
  if (/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ip)) return true;
  const k = url.searchParams.get('key') || req.headers['x-key'] || '';
  return KEY && k === KEY;
}

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, 'application/json', JSON.stringify(obj));
async function body(req) { let b = ''; for await (const c of req) b += c; return JSON.parse(b || '{}'); }

// --- PC / L2Swarm process ------------------------------------------------------------------------
// L2Swarm.exe requires admin, so start/stop/restart go through the elevated scheduled tasks that
// docs/plan/tools/pc_alwayson.ps1 registers ("L2Swarm Start|Stop|Restart"); no UAC prompt needed.
// Memory matters: every swarm.js (re)load leaks V8 memory, and 24.5 GB crashed the PC on 2026-10-03.
const SYS = { at: 0, l2: null, freeMB: null, totalMB: null, cpus: require('os').cpus().length };
function ps(cmd) {
  return new Promise((resolve) => execFile('powershell', ['-NoProfile', '-Command', cmd], { windowsHide: true, timeout: 20000 },
    (err, out) => resolve(err ? '' : String(out).trim())));
}
async function pollSystem() {
  const os = require('os');
  SYS.freeMB = Math.round(os.freemem() / 1048576); SYS.totalMB = Math.round(os.totalmem() / 1048576);
  const out = await ps("Get-Process L2Swarm -ErrorAction SilentlyContinue | Select-Object -First 1 Id, StartTime, " +
    "@{n='mb';e={[int]($_.PrivateMemorySize64/1MB)}}, @{n='threads';e={$_.Threads.Count}}, HandleCount | ConvertTo-Json -Compress");
  let p = null; try { p = out ? JSON.parse(out) : null; } catch (e) { }
  SYS.l2 = p ? { pid: p.Id, mb: p.mb, threads: p.threads, handles: p.HandleCount, started: p.StartTime } : null;
  SYS.at = Date.now();
}
pollSystem(); setInterval(pollSystem, 60000);
function systemInfo() {
  const deploy = tail(path.join(LOGS, 'deploy_swarm.log'), 5);
  let devDiffers = null;
  try { devDiffers = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8') !== fs.readFileSync(path.join(ROOT, 'Scripts', 'swarm.js'), 'utf8'); } catch (e) { }
  return { ...SYS, deploy, devDiffers, mem: tail(path.join(LOGS, 'memwatch.log'), 5), ctl: tail(path.join(LOGS, 'l2swarm_ctl.log'), 5),
    limits: ctlLimits() };
}
/** The REAL limits, read from the scripts that apply them (2026-10-09: the PC tab showed stale hard-coded 3 GB / 4.5 GB / 20 min):
 *  deploy_swarm.ps1 $minGap / $reloadMB (>= 1,000,000 = a deploy never restarts L2Swarm), l2swarm_ctl.ps1 $warnMB / $minCommitMB /
 *  $emergencyCommitMB (MemWatch restarts only when the free commit memory is below that). Cached by file time. */
let CTL_LIM = { k: '', v: null };
function ctlLimits() {
  const T = path.join(PLAN, 'tools'), num = (s, re, d) => { const m = s.match(re); return m ? +m[1] : d; };
  try {
    const fd = path.join(T, 'deploy_swarm.ps1'), fc = path.join(T, 'l2swarm_ctl.ps1'), k = fs.statSync(fd).mtimeMs + '|' + fs.statSync(fc).mtimeMs;
    if (CTL_LIM.k === k && CTL_LIM.v) return CTL_LIM.v;
    const d = fs.readFileSync(fd, 'utf8'), c = fs.readFileSync(fc, 'utf8');
    const reloadMB = num(d, /^\s*\$reloadMB\s*=\s*(\d+)/m, 1000000);
    CTL_LIM = { k, v: { deployGapMin: num(d, /^\s*\$minGap\s*=\s*(\d+)/m, 15), deployRestarts: reloadMB < 1000000, deployRestartAboveMB: reloadMB < 1000000 ? reloadMB : null, deployMaxMB: null,
      warnMB: num(c, /^\s*\$warnMB\s*=\s*(\d+)/m, 4500), minCommitMB: num(c, /\$minCommitMB\s*=\s*(\d+)/, 3000), emergencyCommitMB: num(c, /\$emergencyCommitMB\s*=\s*(\d+)/, 1500), restartMB: null, source: 'scripts' } };
    return CTL_LIM.v;
  } catch (e) { return { deployGapMin: 15, deployRestarts: false, deployMaxMB: null, warnMB: 4500, minCommitMB: 3000, emergencyCommitMB: 1500, restartMB: null, source: 'defaults' }; }
}
function runTask(name) {
  return new Promise((resolve) => execFile('schtasks', ['/run', '/tn', name], { windowsHide: true },
    (err, out, se) => resolve(err ? { ok: false, error: (String(se || err.message).trim() || 'failed') +
      ' — run SETUP_PC_ALWAYS_ON.cmd once (as admin) to create the L2Swarm tasks' } : { ok: true })));
}
function runDeploy(force) {
  return new Promise((resolve) => execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(PLAN, 'tools', 'deploy_swarm.ps1')].concat(force ? ['-Force'] : []),
    { windowsHide: true, timeout: 60000 }, (err, out) => resolve({ ok: !err, out: String(out || '').trim() || String(err && err.message) })));
}

// --- SUPERVISOR: a bot whose script stopped reporting (hung/killed engine) gets swarm.js restarted ---
// Every restart builds a new V8 engine (= leaked memory), so: max 6 restarts per hour in total, none while L2Swarm is big.
// swarm.js writes Logs/swarm_state_<name>.json every 2 s. Stale > 90 s while the account is logged in = the script is dead.
const MINI = {};                                   // region -> promise while its mini-map pieces are being cut
const QUEST_ITEMS = new Set((() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'questitems.json'), 'utf8')); } catch (e) { return []; } })());
const supervisor = { last: {} };
function supLog(m) { try { fs.appendFileSync(path.join(LOGS, 'supervisor.log'), new Date().toISOString() + ' ' + m + '\r\n'); } catch (e) { } }
setInterval(async () => {
  if (fs.existsSync(path.join(LOGS, 'pause_supervisor'))) return;   // user stopped the bots on purpose: never restart their scripts
  for (const c of readStates()) {
    const asyncAge = c.asyncBeat ? Math.round((Date.now() - Date.parse(c.asyncBeat)) / 1000) : 0;
    const dead = c.ageSec >= 90 || (c.ageSec < 30 && asyncAge >= 90);   // file stale, or timers alive but async chains dead
    if (!dead || c.ageSec > 6 * 3600) continue;                          // healthy, or long offline
    if (Date.now() - (supervisor.last[c.name] || 0) < 300000) continue;   // max one restart per 5 min per bot
    supervisor.recent = (supervisor.recent || []).filter(t => Date.now() - t < 3600e3);
    if (supervisor.recent.length >= 6) { supLog(c.name + ': dead, but 6 restarts in the last hour already — skipping (memory)'); supervisor.last[c.name] = Date.now(); continue; }
    if (SYS.l2 && SYS.l2.mb > 3000) { supLog(c.name + ': dead, but L2Swarm uses ' + SYS.l2.mb + ' MB — not restarting scripts'); supervisor.last[c.name] = Date.now(); continue; }
    supervisor.last[c.name] = Date.now();
    supervisor.recent.push(Date.now());
    try {
      const st = JSON.parse(await mcpCall('get_account_status', { account_name: c.name }));
      if (!st.is_logged_in) { supLog(c.name + ': state ' + c.ageSec + ' s old, but not logged in — leaving it'); continue; }
      supLog(c.name + ': script dead (state ' + c.ageSec + ' s, async ' + asyncAge + ' s) while logged in — restarting swarm.js');
      await mcpCall('manage_account_scripts', { account_name: c.name, action: 'stop', script_name: 'swarm.js' }).catch(e => supLog('  stop: ' + e.message));
      await new Promise(r => setTimeout(r, 3000));
      const r = await mcpCall('manage_account_scripts', { account_name: c.name, action: 'start', script_name: 'swarm.js' });
      supLog('  start: ' + String(r).slice(0, 200));
    } catch (e) { supLog(c.name + ': restart failed: ' + e.message); }
  }
}, 30000);

// GEOPATH SERVICE (user 2026-10-05 23:15: "use the wall detection when you navigate"): the bots' route requests are answered by
// docs/plan/tools/geopath_service.js, a child process (keeps the dashboard responsive during a long route); restarted if it dies
let geoSvc = null;
function startGeoService() {
  try {
    geoSvc = require('child_process').fork(path.join(PLAN, 'tools', 'geopath_service.js'), [], { stdio: 'ignore' });
    geoSvc.on('exit', () => { geoSvc = null; setTimeout(startGeoService, 5000); });
  } catch (e) { setTimeout(startGeoService, 30000); }
}
startGeoService();
// RAID LOG (user 2026-10-06 "record and document everything"): docs/plan/raid_log.md — kills, respawn timers, attempts, routes with waypoints
const raidLogTool = path.join(ROOT, 'docs', 'plan', 'tools', 'raid_log.js');
function rebuildRaidLog() { try { delete require.cache[require.resolve(raidLogTool)]; require(raidLogTool).build(); } catch (e) { console.error('raid log:', e.message); } }
rebuildRaidLog(); setInterval(rebuildRaidLog, 5 * 60 * 1000);

// ===========================================================================================================================
// COMMAND CENTER (user 2026-10-08 18:45: "control everything from the dashboard; any command we have to a character or a party")
// POST /api/command { cmd | text, target | targets[], confirmDanger?, dryRun? }
//   cmd/text  '!x …' swarm command (party chat, Scripts_dev/swarm.js handleSay) | '/x …' L2Swarm chat-box command (per character)
//             '@logout' / '@login' (MCP close_account / open_account) | free text ("restock", "teleport gludio" -> translate())
//   targets   'party:<leader>' | 'char:<name>' | 'chars:<a>,<b>' | 'all' | 'clan'   (old single "target" still works; default = main party)
//   A swarm command goes ONCE per party (party chat from its leader: everyone in that party hears it) or from each chosen character
//   (party chat from that character: only its own window obeys — a party LEADER's own line is heard by his whole party).
//   A '/' or '@' command goes to every chosen character one by one. Destructive ones (catalog safety 'destructive': /unstuck, /trade,
//   /config set|load, !enchant, @logout, …) are refused unless confirmDanger === true (the page asks a second, typed confirm).
//   Passwords can never be read or set: any '/' command naming a password is refused. dryRun = return the plan, send nothing.
// ===========================================================================================================================
const partyOf = (c) => (typeof c.party === 'string' && c.party) || (typeof c.leader === 'string' && c.leader) || c.name;
function clanOf(chars) {
  let name = '', leader = ''; const members = new Set();
  chars.forEach(c => { const ci = c.clanInfo; if (ci && ci.name) { name = name || ci.name; leader = leader || ci.leader || ''; (ci.members || []).forEach(m => m && m.name && members.add(m.name)); members.add(c.name); } });
  const cs = readJson(path.join(LOGS, 'clan_state.json'), null); if (!leader && cs && cs.leader) leader = cs.leader;
  if (leader) members.add(leader);
  return { name, leader, members: [...members] };
}
function cmdTargets(b, chars) {
  const list = Array.isArray(b.targets) && b.targets.length ? b.targets.map(String) : [String(b.target || `party:${MAIN_LEADER}`)];
  const parties = new Set(), names = new Set(), labels = []; let err = '';
  const byName = (n) => chars.find(c => String(c.name).toLowerCase() === String(n).trim().toLowerCase());
  const allParties = [...new Set(chars.map(partyOf))];
  for (const t of list) {
    const i = t.indexOf(':'), kind = i < 0 ? t : t.slice(0, i), arg = i < 0 ? '' : t.slice(i + 1);
    if (kind === 'party') { if (!allParties.includes(arg)) { err = `unknown party "${arg}" (parties: ${allParties.join(', ')})`; break; } parties.add(arg); labels.push('party ' + arg); }
    else if (kind === 'char' || kind === 'chars') { for (const n of arg.split(',').filter(Boolean)) { const c = byName(n); if (!c) { err = `unknown character "${n}"`; break; } names.add(c.name); labels.push(c.name); } }
    else if (kind === 'all') { allParties.forEach(p => parties.add(p)); labels.push('all parties'); }
    else if (kind === 'clan') { const cl = clanOf(chars); if (!cl.members.length) { err = 'no clan known yet'; break; } cl.members.forEach(n => { const c = byName(n); if (c) names.add(c.name); }); labels.push('clan ' + (cl.name || '')); }
    else { err = `bad target "${t}" (party:<leader> | char:<name> | chars:<a>,<b> | all | clan)`; break; }
    if (err) break;
  }
  return { err, parties: [...parties], names: [...names], label: labels.join(' + ') || list.join(',') };
}
/** What would be sent, to whom — no MCP call. Returns { error, code } or { command, kind, safety, spec, sends: [{ to, via, text, online, note }] }. */
function commandPlan(b, chars) {
  const raw = b.cmd != null && b.cmd !== '' ? String(b.cmd).trim() : translate(b.text);
  if (!raw) return { code: 400, error: `don't understand "${b.text || b.cmd || ''}" — try level, supply, collect, class change, kill raid boss <name>, kamaloka, stop, status, teleport <town>, go to <place>, or a !command / /command` };
  if (/[\r\n]/.test(raw) || raw.length > 300) return { code: 400, error: 'one line, max 300 characters' };
  const w = CMDS.firstWord(raw);
  const kind = raw[0] === '!' ? 'swarm' : raw[0] === '/' ? 'bot' : raw[0] === '@' ? 'action' : '';
  if (kind === 'swarm' && !ALLOWED.includes(w)) return { code: 400, error: `${w} is not a swarm command (see docs/plan/dashboard_commands.md)` };
  if (kind === 'bot' && !CMDS.BOT_WORDS.includes(w)) return { code: 400, error: `${w} is not an L2Swarm chat command the dashboard sends` };
  if (kind === 'action' && !/^@(logout|login)$/.test(raw)) return { code: 400, error: 'dashboard actions: @logout | @login' };
  if (!kind) return { code: 400, error: 'a command starts with ! (swarm), / (L2Swarm) or @ (account)' };
  if (kind !== 'swarm' && /pass(word)?|<\s*password/i.test(raw)) return { code: 400, error: 'passwords are never read or set from the dashboard' };
  if (w === '/config') {
    const m = raw.match(/^\/config\s+(set|save|load)\b\s*(.*)$/i);
    if (!m) return { code: 400, error: '/config set <key> <value> | /config save | /config load <file.xml>' };
    if (m[1].toLowerCase() === 'save' && m[2]) return { code: 400, error: '/config save takes no file: saving to another file re-points the account (CLAUDE.md §6)' };
    if (m[1].toLowerCase() === 'set' && !/^\S+\s+\S/.test(m[2])) return { code: 400, error: '/config set <key> <value>' };
    if (m[1].toLowerCase() === 'load' && !/^[A-Za-z0-9_.-]+\.xml$/i.test(m[2])) return { code: 400, error: '/config load <file.xml> (a file in Settings)' };
  }
  const spec = (kind === 'action' ? CMDS.COMMANDS.find(c => c.tpl === raw) : CMDS.classify(raw)) || null;
  const safety = spec ? spec.safety : 'confirm';
  const tg = cmdTargets(b, chars); if (tg.err) return { code: 400, error: tg.err };
  const live = (n) => { const c = chars.find(x => x.name === n); return !!(c && c.ageSec <= 30); };
  const sends = [];
  if (kind === 'swarm') {
    const seen = new Set();
    const add = (from, note) => {
      if (seen.has(from)) return; seen.add(from);
      const mates = chars.filter(c => partyOf(c) === partyOf(chars.find(x => x.name === from) || { name: from }));
      const solo = mates.length <= 1;   // no party: party chat never arrives -> normal chat, which its own window reads too (2026-10-07)
      sends.push({ to: from, via: solo ? 'say' : 'party', text: solo ? raw : '#' + raw, online: live(from), note });
    };
    tg.parties.forEach(p => add(p, `party ${p}: ${chars.filter(c => partyOf(c) === p).length} characters hear it`));
    tg.names.forEach(n => { const c = chars.find(x => x.name === n); const isLead = c && partyOf(c) === n && chars.filter(x => partyOf(x) === n).length > 1; add(n, isLead ? `${n} leads party ${n}: the whole party hears it` : `only ${n}'s own window obeys`); });
  } else {
    const names = new Set(tg.names); tg.parties.forEach(p => chars.filter(c => partyOf(c) === p).forEach(c => names.add(c.name)));
    [...names].forEach(n => sends.push({ to: n, via: kind === 'bot' ? 'command' : raw.slice(1), text: raw, online: live(n) }));
    if (w === '/config' && /^\/config\s+load/i.test(raw)) {
      const file = raw.split(/\s+/)[2]; const fp = path.join(SETTINGS, file);
      if (!fs.existsSync(fp)) return { code: 400, error: `Settings\\${file} does not exist` };
      const owner = selectedCharOf(fp); const bad = sends.filter(s => s.to.toLowerCase() !== owner.toLowerCase());
      if (bad.length) return { code: 400, error: `${file} belongs to ${owner || 'nobody'} — only that character may load it` };
    }
  }
  if (!sends.length) return { code: 400, error: 'nobody to send it to' };
  return { command: raw, kind, safety, spec: spec ? { id: spec.id, title: spec.title, handler: spec.handler || '' } : null, target: tg.label, sends };
}
async function pmap(list, n, fn) { const out = new Array(list.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k], k); } })); return out; }

// --- FILE COMMAND CHANNEL (2026-10-08: the MCP accept loop died at 19:49 and every MCP request hung; the dashboard could not order anything)
// commandRun first talks to MCP with time limits (initialize 3 s, the tool call 30 s). When MCP does not answer the INITIALIZE (= nothing
// was sent, so nothing can run twice) the order goes to Logs\cmd\inbox.json instead; every swarm.js window polls that file once a second
// (CMDINBOX block in Scripts_dev/swarm.js) and runs what is addressed to it exactly like the MCP path: '!x' to a party = party chat from its
// leader, '/x' = the matching JS host call. '/' commands the scripts cannot do ('/config', '/sellitem', '/partyinfo', ...) and '@login' /
// '@logout' answer "needs MCP". A tool call that timed out AFTER MCP answered is NOT re-sent through the file (it may still run).
// The windows write Logs\cmd\ack_<id>_<Name>.json; the answer waits up to 5 s for them. SWARM_CMD_DIR overrides the folder (tests).
const CMD_DIR = process.env.SWARM_CMD_DIR || path.join(LOGS, 'cmd');
const CMD_INBOX = path.join(CMD_DIR, 'inbox.json');
// keep in sync with CMD_INBOX_HOST + CMD_INBOX_RUN in Scripts_dev/swarm.js (docs/plan/tools/test_cmd_inbox.js checks it)
const FILE_BOT = new Set(['/stopcombat', '/startcombat', '/enablebot', '/disablebot', '/moveto', '/target', '/attack', '/loc',
  '/sit', '/stand', '/unstuck', '/leave', '/run', '/walk', '/attackforce', '/attackround', '/invite', '/socialyes', '/socialdance', '/socialhello',
  '/startpoints', '/stoppoints', '/runmacro', '/clicklink', '/buyitem', '/ignore']);
const MCP_DOWN = { until: 0, why: '', at: 0 };
const fileChannelCan = (kind, text) => kind === 'swarm' || (kind === 'bot' && FILE_BOT.has(CMDS.firstWord(String(text || ''))));
let cmdSeq = 0;
function cmdInboxWrite(newEntries) {
  fs.mkdirSync(CMD_DIR, { recursive: true });
  let cur = []; try { cur = JSON.parse(fs.readFileSync(CMD_INBOX, 'utf8')); if (!Array.isArray(cur)) cur = []; } catch (e) { cur = []; }
  const t = Date.now();
  const next = cur.filter(e => e && Number(e.at) > t - 120000).concat(newEntries).slice(-300);
  const tmp = CMD_INBOX + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 1));
  fs.renameSync(tmp, CMD_INBOX);                              // atomic replace: a window never reads half a file
  try { fs.readdirSync(CMD_DIR).filter(f => /^ack_.*\.json$/.test(f)).forEach(f => { const p = path.join(CMD_DIR, f); if (t - fs.statSync(p).mtimeMs > 600000) fs.unlinkSync(p); }); } catch (e) { }
  return next.length;
}
function cmdAck(id, name) { try { return JSON.parse(fs.readFileSync(path.join(CMD_DIR, `ack_${id}_${name}.json`), 'utf8')); } catch (e) { return null; } }
async function cmdWaitAcks(list, ms) {
  const t0 = Date.now();
  for (;;) {
    list.forEach(s => { if (!s.ack) s.ack = cmdAck(s.fileId, s.to); });
    if (list.every(s => s.ack) || Date.now() - t0 >= ms) return;
    await new Promise(r => setTimeout(r, 250));
  }
}
// one MCP POST with a time limit; err.mcpDown = true when it is certain that nothing reached L2Swarm (initialize phase / refused)
async function mcpPostT(headers, body, ms, phase) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(() => { try { if (ctl) ctl.abort(); } catch (e) { } rej(Object.assign(new Error(`MCP did not answer the ${phase} within ${ms / 1000} s`), { mcpTimeout: true })); }, ms); });
  try {
    const r = await Promise.race([fetch(MCP, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined }), limit]);
    const sid = r.headers.get('mcp-session-id'); if (sid) headers['Mcp-Session-Id'] = sid;
    let txt = await Promise.race([r.text(), limit]);
    if (/^\s*(event|data):/.test(txt)) txt = txt.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join('');
    return JSON.parse(txt);
  } catch (e) {
    const code = (e && e.cause && e.cause.code) || (e && e.code) || '';
    if (phase === 'initialize' || /ECONNREFUSED/.test(code)) e.mcpDown = true;
    throw e;
  } finally { clearTimeout(timer); }
}
const MCP_INIT_MS = Number(process.env.SWARM_MCP_INIT_MS) || 3000, MCP_CALL_MS = Number(process.env.SWARM_MCP_CALL_MS) || 30000;
async function mcpCallT(tool, args, initMs = MCP_INIT_MS, callMs = MCP_CALL_MS) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  await mcpPostT(headers, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dashboard', version: '2' } } }, initMs, 'initialize');
  const res = await mcpPostT(headers, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } }, callMs, 'tools/call');
  if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));
  MCP_DOWN.until = 0;
  return (res.result.content || []).map(c => c.text).join('\n');
}
async function mcpCallCharT(tool, name, args) {
  const out = await mcpCallT(tool, { account_name: name, ...(args || {}) });
  if (!/No account matches/i.test(String(out))) return out;
  const cfg = await configForChar(name);
  return cfg ? mcpCallT(tool, { config_path: cfg, ...(args || {}) }) : out;
}
async function commandRun(b) {
  const chars = readStates();
  const p = commandPlan(b, chars);
  if (p.error) return { code: p.code || 400, body: { error: p.error } };
  if (p.safety === 'destructive' && b.confirmDanger !== true) return { code: 409, body: { error: `${p.command} is destructive — confirm it explicitly in the command center`, needConfirm: true, plan: p } };
  if (b.dryRun) return { code: 200, body: { ok: true, dryRun: true, ...p } };
  const toFile = (s, why) => {
    if (!fileChannelCan(p.kind, s.text)) return { ...s, ok: false, channel: 'none', error: `needs MCP - ${why}; ${p.kind === 'action' ? s.text : CMDS.firstWord(s.text)} cannot go through the file channel` };
    const fileId = 'c' + Date.now().toString(36) + (++cmdSeq).toString(36) + Math.random().toString(36).slice(2, 6);
    return { ...s, ok: true, channel: 'file', fileId, why };
  };
  const sends = await pmap(p.sends, 4, async (s) => {
    if (MCP_DOWN.until > Date.now()) return toFile(s, MCP_DOWN.why);
    try {
      let out;
      if (p.kind === 'swarm') out = s.via === 'say' ? await mcpCallCharT('send_game_action', s.to, { action: 'say', params: { message: s.text, chat_type: 'all' } })
        : await mcpCallCharT('run_account_command', s.to, { command: s.text });
      else if (p.kind === 'bot') out = await mcpCallCharT('run_account_command', s.to, { command: s.text });
      else if (s.via === 'logout') out = await mcpCallCharT('close_account', s.to, {});
      else { const cfg = await configForChar(s.to); if (!cfg) throw new Error('no Settings\\*.xml with <SelectedCharacter>' + s.to); out = await mcpCallT('open_account', { config_path: cfg }); }
      const txt = String(out || ''); let j = null; try { j = JSON.parse(txt); } catch (e) { }
      const bad = j && typeof j === 'object' ? (j.success === false || j.ok === false || !!j.error) : /^\s*(error|no account matches|failed)/i.test(txt) || /No account matches/i.test(txt);
      return { ...s, ok: !bad, channel: 'mcp', out: txt.slice(0, 300) };
    } catch (e) {
      const msg = String(e.message || e).slice(0, 200);
      if (e.mcpDown) { MCP_DOWN.until = Date.now() + 15000; MCP_DOWN.why = 'MCP is not answering (' + msg + ')'; MCP_DOWN.at = Date.now(); return toFile(s, MCP_DOWN.why); }
      return { ...s, ok: false, channel: 'mcp', error: msg + (e.mcpTimeout ? ' - not re-sent through the file channel (it may still run)' : '') };
    }
  });
  const viaFile = sends.filter(s => s.channel === 'file');
  if (viaFile.length) {
    try {
      cmdInboxWrite(viaFile.map(s => ({ id: s.fileId, at: Date.now(), from: 'dashboard', to: [s.to], cmd: p.kind === 'swarm' ? String(s.text).replace(/^#/, '') : s.text, via: p.kind === 'swarm' ? s.via : 'command' })));
      await cmdWaitAcks(viaFile, b.ackWaitMs != null ? Math.max(0, Math.min(10000, Number(b.ackWaitMs) || 0)) : 5000);
      viaFile.forEach(s => {
        if (s.ack) { s.ok = !!s.ack.ok; s.out = `via file channel: ${s.ack.ok ? (s.ack.how || 'done') + (s.ack.result ? ' = ' + s.ack.result : '') : ''}`; if (!s.ack.ok) s.error = `via file channel: ${s.ack.error || s.ack.status || 'failed'}`; }
        else { s.ok = false; s.pending = true; s.error = 'via file channel: queued in Logs\\cmd\\inbox.json, but no window confirmed it in time (its swarm.js may not have the file channel yet, or the character is offline) - it may still run within 60 s, do not resend at once'; }
      });
    } catch (e) { viaFile.forEach(s => { s.ok = false; s.error = 'file channel: could not write Logs\\cmd\\inbox.json: ' + e.message; }); }
  }
  const channel = viaFile.length ? (viaFile.length === sends.length ? 'file' : 'mixed') : 'mcp';
  const channelNote = viaFile.length ? `sent via file channel - ${MCP_DOWN.why || 'MCP is not answering'}` : undefined;
  try { fs.appendFileSync(path.join(LOGS, 'dashboard_commands.log'), `${new Date().toISOString()} ${p.command} -> ${p.target} (${sends.filter(s => s.ok).length}/${sends.length} ok${viaFile.length ? ', ' + viaFile.length + ' via file channel' : ''})${sends.filter(s => !s.ok).map(s => ' [' + s.to + ': ' + (s.error || s.out || '').slice(0, 80) + ']').join('')}\r\n`); } catch (e) { }
  const one = sends.length === 1 ? sends[0] : null;
  return { code: 200, body: { ok: true, command: p.command, kind: p.kind, safety: p.safety, target: p.target, sends, sent: sends.filter(s => s.ok).length, solo: !!(one && one.via === 'say'), channel, channelNote, out: one ? (one.out || one.error) : undefined } };
}
// --- end COMMAND CENTER ---------------------------------------------------------------------------------------------------

// DASHBOARD VIEWERS (CPU audit 2026-10-09): swarm.js builds its dashboard-only swarm_state fields (ov, buffList, exp log, aggro, ...) every 2 s
// only for the characters someone is looking at, otherwise every 20 s. The pages that show them poll anyway, so the poll marks the viewer:
//   /api/live?party=P (live party view + character page) -> party P · /api/char?name=N, /api/override?name=N -> character N
//   /api/raidlive, /api/kamalive (live raid / Kamaloka view and its banner) -> raid (only characters in a raid / instance use it)
// Logs/dash_viewers.json = { at, chars, parties, raid }: an entry lives VIEW_TTL after its last poll; rewritten when the set changes and
// every 5 s while someone watches ('at' = fresh); nobody -> written once, then left alone (swarm.js treats 'at' older than 15 s as nobody).
const VIEWERS = { chars: {}, parties: {}, raid: 0, sig: '', at: 0 }, VIEW_TTL = 12000, VIEW_FILE = path.join(LOGS, 'dash_viewers.json');
function viewersWrite() {
  const t = Date.now();
  const live = (o) => Object.keys(o).filter(k => { if (t - o[k] < VIEW_TTL) return true; delete o[k]; return false; }).sort();
  const body = { chars: live(VIEWERS.chars), parties: live(VIEWERS.parties), raid: t - VIEWERS.raid < VIEW_TTL };
  const sig = JSON.stringify(body), empty = !body.chars.length && !body.parties.length && !body.raid;
  if (sig === VIEWERS.sig && (empty || t - VIEWERS.at < 5000)) return;
  VIEWERS.sig = sig; VIEWERS.at = t;
  const txt = JSON.stringify(Object.assign({ at: new Date(t).toISOString() }, body)), tmp = VIEW_FILE + '.tmp';
  try { fs.writeFileSync(tmp, txt); fs.renameSync(tmp, VIEW_FILE); } catch (e) { try { fs.writeFileSync(VIEW_FILE, txt); } catch (e2) { } }
}
function viewersMark(url) {
  try {
    const p = url.pathname, t = Date.now(), q = (k) => String(url.searchParams.get(k) || '').trim();
    if (p === '/api/live' && q('party')) VIEWERS.parties[q('party')] = t;
    else if ((p === '/api/char' || p === '/api/override') && q('name')) VIEWERS.chars[q('name')] = t;
    else if (p === '/api/raidlive' || p === '/api/kamalive') VIEWERS.raid = t;
    else return;
    viewersWrite();
  } catch (e) { }
}
setInterval(viewersWrite, 5000);

// RAIDHUNT PER PARTY (2026-10-10, user: "I enable raid hunt for multiple parties, I only see one party's progress"): swarm.js writes
// Logs/raidhunt_party_<leader>.json per leader; the old shared Logs/raidhunt.json (older scripts) still counts for the leader it names
const HUNT_SEEN = {};   // leader -> last raidhunt.json copy (older scripts share one file)
const HUNT_SEEN_POLL = setInterval(() => { try { const d = readJson(path.join(LOGS, 'raidhunt.json'), null); if (d && d.leader) HUNT_SEEN[d.leader] = d; } catch (e) { } }, 700);   // catch every leader's 2 s write
function raidHuntAll() {
  const hunts = {};
  const mark = (d) => Object.assign({}, d, { stale: (Date.now() - Date.parse(d.updatedAt || 0)) / 1000 > 20 });
  try { for (const f of fs.readdirSync(LOGS)) { const m = /^raidhunt_party_(.+)\.json$/.exec(f); if (!m) continue; const d = readJson(path.join(LOGS, f), null); if (d && d.leader) hunts[d.leader] = mark(d); } } catch (e) { }
  const old = readJson(path.join(LOGS, 'raidhunt.json'), null);
  // older scripts: every hunting leader overwrites the ONE shared file every 2 s -> remember each leader's last copy here, so every party
  // stays visible (the page jumped between parties) until the bots write their own files (2026-10-10)
  if (old && old.leader) HUNT_SEEN[old.leader] = old;
  for (const [l, d] of Object.entries(HUNT_SEEN)) {
    if ((Date.now() - Date.parse(d.updatedAt || 0)) / 1000 > 600) { delete HUNT_SEEN[l]; continue; }
    if (!hunts[l] || Date.parse(d.updatedAt || 0) > Date.parse(hunts[l].updatedAt || 0)) hunts[l] = mark(d);
  }
  const on = Object.values(hunts).filter(h => h.active && !h.stale).sort((a, b) => String(a.leader).localeCompare(String(b.leader)));   // a STABLE order (newest-first made the page jump)
  const first = on[0] || Object.values(hunts).sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))[0] || { active: false, stale: true, history: [] };
  return Object.assign({}, first, { hunts, activeLeaders: on.map(h => h.leader) });   // top level = the newest active hunt (older pages keep working)
}
function raidHuntOf(leader) { const a = raidHuntAll(); return (a.hunts || {})[leader] || {}; }
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname.startsWith('/api/')) viewersMark(url);       // DASHBOARD VIEWERS (CPU audit 2026-10-09)
    // Game icons + lookup tables (no secrets) are public so <img> works on the phone without the key
    if (url.pathname.startsWith('/icons/')) {
      const rel = decodeURIComponent(url.pathname.slice(7)).replace(/\\/g, '/');
      if (rel.includes('..')) return send(res, 400, 'text/plain', 'bad path');
      const p = path.join(__dirname, 'icons', rel);
      if (!fs.existsSync(p)) return send(res, 404, 'text/plain', 'no icon');
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' });   // icons never change
      return res.end(fs.readFileSync(p));
    }
    // World map tiles (docs/plan/tools/make_maptiles.ps1): /maptiles/<X>_<Y>.jpg, region X = floor(x/32768)+20, Y = floor(y/32768)+18
    const mt = url.pathname.match(/^\/maptiles\/(\d+_\d+)\.jpg$/);
    if (mt) {
      const p = path.join(__dirname, 'maptiles', mt[1] + '.jpg');
      if (!fs.existsSync(p)) return send(res, 404, 'text/plain', 'no tile');
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
      return res.end(fs.readFileSync(p));
    }
    // Sharp map pieces for the character mini-map: /minitile/<X>_<Y>_<col>_<row>.jpg (made on first use from Maps\high, then cached)
    // regions with underground layers (Maps\high\<X>_<Y>_<n>.jpg): { "<X>_<Y>": [1, 2, ...] } — the live raid map uses layer 1 deep underground
    // which underground layer belongs to which height (2026-10-07: Cruma Tower has 3 floors stacked in region 20_21, the map always showed
    // layer 1): from dungeon_rooms.json, per region the floors sorted deepest first = layer 1, 2, 3 (checked on Cruma: layer 1 = floor 1)
    if (url.pathname === '/api/maplayersz') {
      const have = {}; try { fs.readdirSync(path.join(__dirname, '..', 'Maps', 'high')).forEach(n => { const m = n.match(/^(\d+_\d+)_(\d)\.jpg$/); if (m) (have[m[1]] = have[m[1]] || []).push(+m[2]); }); } catch (e) { }
      const out = {};
      (readJson(path.join(DATA, 'dungeon_rooms.json'), []) || []).forEach(d => {
        const byRegion = {};
        (d.floors || []).forEach(F => (F.rooms || []).forEach(r => { if (!r.center || !F.z) return; const k = (Math.floor(r.center[0] / 32768) + 20) + '_' + (Math.floor(r.center[1] / 32768) + 18); (byRegion[k] = byRegion[k] || {})[F.z.join(',')] = F.z; }));
        Object.entries(byRegion).forEach(([k, zs]) => {
          const L = (have[k] || []).sort((a, b) => a - b); if (!L.length) return;
          const bands = Object.values(zs).sort((a, b) => a[0] - b[0]);
          if (bands.length > L.length) return;                 // more floors than layers: keep the old rule for this region
          // the dungeon's own x/y area (room centres +- 2500): a floor band only counts INSIDE it (outside, e.g. next to the Tower of
          // Insolence, the surface has heights inside the same band)
          const cs = (d.floors || []).flatMap(F => (F.rooms || []).filter(r => r.center).map(r => r.center));
          const bx = [Math.min(...cs.map(c => c[0])) - 2500, Math.min(...cs.map(c => c[1])) - 2500, Math.max(...cs.map(c => c[0])) + 2500, Math.max(...cs.map(c => c[1])) + 2500];
          out[k] = (out[k] || []).concat(bands.map((z, i) => [z[0] - 400, z[1] + 400, L[i]].concat(bx)));
        });
      });
      return json(res, 200, out);
    }
    if (url.pathname === '/api/maplayers') {
      const o = {}; try { fs.readdirSync(path.join(__dirname, '..', 'Maps', 'high')).forEach(n => { const m = n.match(/^(\d+_\d+)_(\d)\.jpg$/); if (m) (o[m[1]] = o[m[1]] || []).push(+m[2]); }); } catch (e) { }
      return json(res, 200, o);
    }
    // layer pieces: /minitile/<X>_<Y>_L<n>_<c>_<r>.jpg (region <X>_<Y>_<n>)
    const ml = url.pathname.match(/^\/minitile\/(\d+_\d+)_L(\d)_([0-3])_([0-3])\.jpg$/);
    if (ml) { url.pathname = `/minitile/${ml[1]}_${ml[2]}_${ml[3]}_${ml[4]}.jpg`; }
    const mm = url.pathname.match(/^\/minitile\/(\d+_\d+(?:_\d)?)_([0-3])_([0-3])\.jpg$/);
    if (mm) {
      const p = path.join(__dirname, 'minitiles', `${mm[1]}_${mm[2]}_${mm[3]}.jpg`);
      if (!fs.existsSync(p)) {
        if (!MINI[mm[1]]) MINI[mm[1]] = new Promise((resolve) => execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
          path.join(PLAN, 'tools', 'make_minitiles.ps1'), '-Region', mm[1]], { windowsHide: true, timeout: 120000 }, () => resolve()));
        await MINI[mm[1]];
      }
      if (!fs.existsSync(p)) return send(res, 404, 'text/plain', 'no map for this region');
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' });
      return res.end(fs.readFileSync(p));
    }
    // full-screen hunting-spot editor (user 2026-10-07): its own script + stylesheet, loaded by index.html (no secrets in them)
    if (url.pathname === '/spoteditor.js' || url.pathname === '/spoteditor.css' || url.pathname === '/sieges.js' || url.pathname === '/sieges.css' ||
        url.pathname === '/commands.js' || url.pathname === '/cmdcenter.js' || url.pathname === '/cmdcenter.css' ||   // command center 2026-10-08
        url.pathname === '/polyedit.js' || url.pathname === '/polyedit.css') {   // POLYEDIT shape editor 2026-10-08
      res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(path.join(__dirname, path.basename(url.pathname))));
    }
    if (url.pathname === '/vendor/morphdom.min.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'public, max-age=604800' });
      return res.end(fs.readFileSync(path.join(__dirname, 'vendor', 'morphdom.min.js')));
    }
    if (/^\/gamedata\/(items|skills|classes)\.json$/.test(url.pathname)) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=604800' });
      return res.end(fs.readFileSync(path.join(__dirname, 'data', path.basename(url.pathname))));
    }
    // --- LIVEPARTY (2026-10-09): live party view #/live/<leader> — its script + stylesheet (public, no secrets) and ONE batched endpoint
    //     /api/live?party=<leader> (members' state + intent tails + monsters around the leader), see Dashboard/liveparty_api.js
    // RAIDLIVE HUD 2026-10-09: the live raid / Kamaloka view's script + stylesheet (public, no secrets); data: /api/raidlive via raidlive_api.js
    if (url.pathname === '/raidlive.js' || url.pathname === '/raidlive.css' || url.pathname === '/override.js' || url.pathname === '/override.css') {   // + the shared override menu
      res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(path.join(__dirname, path.basename(url.pathname))));
    }
    // CHARPAGE 2026-10-09: the character page v2 #/char/<name> (Dashboard/charpage.js + .css; public, no secrets; data from /api/live, /api/char, /api/intent)
    if (url.pathname === '/charpage.js' || url.pathname === '/charpage.css' ||
        url.pathname === '/raidspage.js' || url.pathname === '/raidspage.css') {   // RAIDS PAGE 2026-10-09: #/raids board + boss page v2 (Dashboard/raidspage.js + .css)
      res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(path.join(__dirname, path.basename(url.pathname))));
    }
    if (url.pathname === '/liveparty.js' || url.pathname === '/liveparty.css' ||
        url.pathname === '/activity.js' || url.pathname === '/partystatus.js' || url.pathname === '/partystatus.css' ||   // PARTY STATUS 2026-10-09: shared activity line + Parties tab banner
        url.pathname === '/levelEta.js' ||
        url.pathname === '/uidialog.js' || url.pathname === '/uidialog.css' ||   // UIDIALOG 2026-10-10: the one shared dialog (confirm / alert / prompt), public, BEFORE the key check (phones over the LAN)
        false) {   // LEVEL ETA 2026-10-09: shared "next level in ~1h 25m" helper (Dashboard/levelEta.js, public, no secrets)
      res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(path.join(__dirname, path.basename(url.pathname))));
    }
    if (url.pathname === '/api/live') {
      if (!allowed(req, url)) return send(res, 401, 'text/plain; charset=utf-8', 'Access denied');
      return json(res, 200, await require('./liveparty_api').live(url.searchParams.get('party') || '', { readStates, partyOf, parseIntents, readJson, mcpCallChar, LOGS, DATA }));
    }
    // --- end LIVEPARTY ---
    // GEAR PLANNER 2026-10-09 (Dashboard/gearpage_api.js): /gearpage.js|css, /mapguard.js, /readability.css (public, no secrets) +
    // /api/gearplanner (key checked inside): gear per class + grade -> Scripts/data/gear_prefs.json "_class"
    if (await require('./gearpage_api').handle(req, res, url, { DIR: __dirname, DATA, ROOT, readJson, readStates, allowed, json, send, body, gearCatalog })) return;
    // KAMALOKA PAGE 2026-10-09 (Dashboard/kamapage_api.js): /kamapage.js|css, /kamalogic.js (public) + GET /api/kamapage (key checked inside):
    // every party, fit / today / next daily pick per Kamaloka (Dashboard/kamalogic.js = swarm.js dailyDue)
    if (await require('./kamapage_api').handle(req, res, url, { DIR: __dirname, DATA, LOGS, readJson, readStates, teamMap, reloadCfg: () => SC.reload(), mainLeader: MAIN_LEADER, hallTeam, hallSource: hallTeamSource, allowed, json, send })) return;
    // CLASS PLANS 2026-10-10 (Dashboard/classpage_api.js): /classpage.js|css, /classlogic.js (public) + GET /api/classtree, GET/POST /api/classplans   (before the key check, like gearpage/kamapage: the page files are public, the API checks the key itself; 2026-10-10 the tab failed on phones = 401 on classpage.js)
    // (key checked inside): per party + character the class plan (Scripts/data/class_plans.json), its status, approval, templates
    if (await require('./classpage_api').handle(req, res, url, { DIR: __dirname, DATA, LOGS, ROOT, readJson, readStates, teamMap, reloadCfg: () => SC.reload(), mainLeader: MAIN_LEADER, allowed, json, send })) return;
    // BUFF PLANS 2026-10-10 (Dashboard/buffpage_api.js): /buffpage.js|css, /bufflogic.js (public) + GET/POST /api/buffplans (key checked inside):
    // per party + buffer character which own buffs it casts on whom (Scripts/data/buff_plans.json), song/dance order, templates, overlaps
    if (await require('./buffpage_api').handle(req, res, url, { DIR: __dirname, DATA, LOGS, ROOT, readJson, readStates, teamMap, reloadCfg: () => SC.reload(), mainLeader: MAIN_LEADER, allowed, json, send })) return;
    if (!allowed(req, url)) return send(res, 401,'text/plain; charset=utf-8', 'Access denied: open the link with ?key=... (see Dashboard\\key.txt on the PC)');
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');   // phones kept an old page
      return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(__dirname, 'index.html')));
    }
    // Crystals tab: table, plan, targets, live crystals per character (Logs/soul_<name>.json, written by swarm.js every minute)
    if (url.pathname === '/api/soul') {
      if (req.method === 'POST') {
        const b = await body(req);
        if (b.plan && typeof b.plan === 'object') {
          try { if (fs.existsSync(SOUL_PLAN_F)) fs.copyFileSync(SOUL_PLAN_F, path.join(ROOT, 'Settings', 'backup', 'soul_plan_' + Date.now() + '.json')); } catch (e) { }
          fs.writeFileSync(SOUL_PLAN_F, JSON.stringify(b.plan, null, 1));
        }
        soulWriteTargets();
      }
      const chars = readStates();
      const targets = soulTargets(chars);
      const live = {}; chars.forEach(c => { const l = soulLive(c.name); if (l) live[c.name] = l; });
      let log = []; try { log = fs.readFileSync(path.join(LOGS, 'soul.log'), 'utf8').split(/\r?\n/).filter(Boolean).slice(-80); } catch (e) { }
      return json(res, 200, { table: soulTable(), plan: soulPlan(), targets, live, log, teams: [...new Set(Object.values(targets).map(t => t.team).filter(Boolean))] });
    }
    // ROOM ROUTES (user 2026-10-07: "I want to be able to create the path for a specific room"): Scripts/data/routes/rooms/<roomId>.json
    // { id, dungeon, floor, room, points:[{x,y,z}], by, updated }. GET ?id= -> the saved route (or null) + the room (centre, radius,
    // computed route, floor z band, floor entry) ; GET without id -> every dungeon with floors + rooms (+ which have a saved route).
    // POST { id, points:[...] } saves (old version to routes/rooms/history/), { id, delete:true } removes it. swarm.js enterRoom walks the
    // saved points (straight hops) instead of the computed route.
    if (url.pathname === '/api/roomroute') {
      const RD = path.join(DATA, 'routes', 'rooms'); try { fs.mkdirSync(path.join(RD, 'history'), { recursive: true }); } catch (e) { }
      const all = readJson(path.join(DATA, 'dungeon_rooms.json'), []) || [];
      const findRoom = (id) => { for (const d of all) for (let fi = 0; fi < (d.floors || []).length; fi++) { const F = d.floors[fi]; const r = (F.rooms || []).find(x => x.id === id); if (r) return { d, F, fi, r }; } return null; };
      if (req.method === 'POST') {
        const b = await body(req); const id = String(b.id || ''); const hit = findRoom(id);
        if (!hit) return json(res, 404, { error: 'unknown room id' });
        const fp = path.join(RD, id.replace(/[^A-Za-z0-9_-]/g, '') + '.json');
        if (fs.existsSync(fp)) try { fs.copyFileSync(fp, path.join(RD, 'history', path.basename(fp, '.json') + '_' + Date.now() + '.json')); } catch (e) { }
        if (b.delete) { try { fs.unlinkSync(fp); } catch (e) { } return json(res, 200, { ok: true, deleted: id }); }
        const pts = (Array.isArray(b.points) ? b.points : []).map(p => ({ x: Math.round(+p.x), y: Math.round(+p.y), z: Math.round(+p.z || hit.r.center[2]) })).filter(p => isFinite(p.x) && isFinite(p.y));
        if (pts.length < 1) return json(res, 400, { error: 'no points' });
        fs.writeFileSync(fp, JSON.stringify({ id, dungeon: hit.d.name, floor: hit.F.name, room: hit.r.name, points: pts, by: 'dashboard', updated: new Date().toISOString() }, null, 1));
        return json(res, 200, { ok: true, id, points: pts.length });
      }
      const id = url.searchParams.get('id');
      if (id) {
        const hit = findRoom(id); if (!hit) return json(res, 404, { error: 'unknown room id' });
        const saved = readJson(path.join(RD, id.replace(/[^A-Za-z0-9_-]/g, '') + '.json'), null);
        return json(res, 200, { id, dungeon: hit.d.name, floor: hit.F.name, floorZ: hit.F.z, enter: hit.F.enter || null, room: hit.r, saved });
      }
      const have = new Set(); try { fs.readdirSync(RD).forEach(n => { if (n.endsWith('.json')) have.add(n.slice(0, -5)); }); } catch (e) { }
      return json(res, 200, all.map(d => ({ name: d.name, levelRange: d.levelRange, floors: (d.floors || []).map(F => ({ name: F.name, z: F.z, levelRange: F.levelRange,
        safe: F.safeSpots || [], rooms: (F.rooms || []).map(r => ({ id: r.id, name: r.name, side: r.side, center: r.center, radius: r.radius, poly: r.poly || null, levelRange: r.levelRange, suits: r.suitsPartyLevel, hasRoute: have.has(r.id), monsters: (r.monsters || []).slice(0, 6).map(m => `${m.name} ${m.level}`) })) })) })));
    }
    // HUNTING SPOTS PER PARTY (user 2026-10-07: "make it customizable so I can select which team goes where"): Scripts/data/custom_zones.json
    // GET  -> { zones:[{name, levelMin, levelMax, kind, teams, prio, enabled, way}], parties:[leader names], dungeons:{catacombs, rooms} }
    // POST { action:'set', name, teams:[...], prio:{party:n}, enabled } | { action:'add', type:'dungeon'|'rooms', dungeon, levelMin, levelMax, teams }
    if (url.pathname === '/api/spots') {
      const ZF = path.join(DATA, 'custom_zones.json');
      let zones = readJson(ZF, []);
      if (req.method === 'POST') {
        const b = await body(req);
        try { fs.copyFileSync(ZF, path.join(ROOT, 'Settings', 'backup', 'custom_zones_' + Date.now() + '.json')); } catch (e) { }
        if (b.action === 'set') {
          const z = zones.find(x => x.name === b.name); if (!z) return json(res, 404, { error: 'no such spot' });
          if (Array.isArray(b.teams)) { z.teams = b.teams.map(String); delete z.team; }
          if (b.prio && typeof b.prio === 'object') z.prio = b.prio;
          if (typeof b.enabled === 'boolean') z.enabled = b.enabled;
          z.updated = new Date().toISOString();
        } else if (b.action === 'add') {
          const lmin = +b.levelMin || 1, lmax = +b.levelMax || 85, teams = Array.isArray(b.teams) ? b.teams.map(String) : ['all'];
          if (b.type === 'rooms') {
            const d = (readJson(path.join(DATA, 'dungeon_rooms.json'), []) || []).find(x => x.name === b.dungeon); if (!d) return json(res, 404, { error: 'unknown dungeon' });
            const e = d.entrance || {}; zones.push({ name: `${d.name} rooms (${lmin}-${lmax})`, x: e.x, y: e.y, z: e.z, radius: 1500, levelMin: lmin, levelMax: lmax, teams, rooms: d.name, enabled: true, note: 'added on the dashboard (rooms)', updated: new Date().toISOString() });
          } else {
            const d = (readJson(path.join(DATA, 'catacombs.json'), []) || []).find(x => x.name === b.dungeon); if (!d) return json(res, 404, { error: 'unknown dungeon' });
            const L = d.inside.landing; zones.push({ name: `${d.name} (${lmin}-${lmax})`, x: L[0], y: L[1], z: L[2], radius: 1500, levelMin: lmin, levelMax: lmax, teams, dungeon: d.name, enabled: true, note: 'added on the dashboard (catacomb/necropolis)', updated: new Date().toISOString() });
          }
        } else if (b.action === 'delete') {
          const z = zones.find(x => x.name === b.name); if (!z || !/added on the dashboard/.test(z.note || '')) return json(res, 400, { error: 'only spots added on the dashboard can be deleted (switch others off)' });
          zones = zones.filter(x => x !== z);
        } else return json(res, 400, { error: 'unknown action' });
        fs.writeFileSync(ZF, JSON.stringify(zones, null, 1));
      }
      const chars = readStates();
      const parties = [...new Set(chars.map(c => (typeof c.party === 'string' && c.party) || c.name))];
      const partyLvl = {}; parties.forEach(p => { const L = chars.filter(c => ((typeof c.party === 'string' && c.party) || c.name) === p).map(c => +c.level || 0); partyLvl[p] = { min: Math.min(...L), max: Math.max(...L), size: L.length }; });
      const out = zones.map(z => ({ name: z.name, levelMin: z.levelMin, levelMax: z.levelMax, kind: z.rooms ? 'rooms' : z.dungeon ? 'dungeon' : (z.poly ? 'drawn area' : 'outdoor'),
        teams: Array.isArray(z.teams) ? z.teams : (z.team ? [z.team] : ['all']), prio: z.prio || {}, enabled: z.enabled !== false,
        way: z.rooms ? `rooms in ${z.rooms}` : z.dungeon ? `inside ${z.dungeon}` : (z.gkDesc || (z.travel && z.travel.town ? '.' + z.travel.town : '')), deletable: /added on the dashboard/.test(z.note || '') }));
      const cata = (readJson(path.join(DATA, 'catacombs.json'), []) || []).map(d => ({ name: d.name, lvl: d.lvl }));
      const rooms = (readJson(path.join(DATA, 'dungeon_rooms.json'), []) || []).map(d => ({ name: d.name, lvl: d.levelRange }));
      return json(res, 200, { zones: out, parties, partyLvl, dungeons: { catacombs: cata, rooms } });
    }
    // NEW ACADEMY ACCOUNT (user 2026-10-07: "enter account name and password and it should save them; create new accounts and level them
    // 1-40 via the academy"): POST { login, password, name, preset: 'best'|'runnerUp' }. The password goes ONLY to new_account.ps1 (argument,
    // never a file or a log), which stores it encrypted in Settings/<Login>.xml like every other config. The character is registered in
    // Scripts/data/roster_extra.json (solo team, role from the preset) and the config in Settings/start_extra.txt (logged in at every start).
    // Status per account: Scripts/data/academy.json. Character creation on the empty account: next step (Logs/academy.log).
    if (url.pathname === '/api/newaccount') {
      if (req.method !== 'POST') return json(res, 200, readJson(path.join(DATA, 'academy.json'), { accounts: [] }));
      const b = await body(req);
      const login = String(b.login || '').trim().toLowerCase(), pw = String(b.password || ''), name = String(b.name || '').trim();
      if (!/^[a-z0-9]{3,16}$/.test(login)) return json(res, 400, { error: 'login: 3-16 letters/digits' });
      if (!pw || pw.length > 64) return json(res, 400, { error: 'password missing' });
      if (!/^[A-Za-z0-9]{3,16}$/.test(name)) return json(res, 400, { error: 'character name: 3-16 letters/digits (needed to create the character)' });
      const cfgPath = path.join(ROOT, 'Settings', login[0].toUpperCase() + login.slice(1) + '.xml');
      if (fs.existsSync(cfgPath)) return json(res, 400, { error: `an account config for ${login} exists already` });
      const PRESETS = { best: { race: 2, sex: 1, classId: 38, stats: [23, 23, 24, 44, 19, 37], label: 'Dark Elf Mystic -> Dark Wizard -> Phantom Summoner', role: 'nuker' },
                        runnerUp: { race: 5, sex: 1, classId: 124, stats: [39, 31, 35, 26, 13, 22], label: 'Kamael Soldier (F) -> Warder -> Arbalester', role: 'inspector' } };
      // the one-off creation script (proven pattern, 2026-10-07 teams 3-5): at the empty character list it sends NewCharacter + CharacterCreate
      // every 5 s until the character is in game; then L2Swarm selects it by name (SelectedCharacter) and swarm.js takes over
      const mk = 'mkchar_' + login + '.js';
      // 2026-10-09 fix: P was declared AFTER this template used it (temporal dead zone -> every Create threw "Cannot access 'P' before initialization")
      const P = PRESETS[b.preset] || PRESETS.best;
      fs.writeFileSync(path.join(ROOT, 'Scripts', mk), `(async () => {
  const log = (t) => File.AppendAllText('${ROOT_FWD}/Logs/academy.log', new Date().toISOString() + ' [${login}] ' + t + '\\r\\n');
  log('waiting for the character list to create ${name}');
  for (let i = 0; i < 360; i++) {
    await sleep(5000);
    try { if (Me && Me.Name) { log('in game as ' + Me.Name); return; } } catch (e) { }
    try { Send.NewCharacter(); await sleep(1500); Send.CharacterCreate('${name}', ${P.race}, ${P.sex}, ${P.classId}, ${P.stats.join(', ')}, 0, 0, 0); if (i % 6 === 0) log('CharacterCreate sent'); } catch (e) { }
  }
})();
`);
      // the password goes through an environment variable of the child only (never the command line, which any process list shows)
      const out = await new Promise((resolve) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(PLAN, 'tools', 'new_account.ps1'),
        '-Login', login, '-PasswordEnv', 'L2S_NEWACCOUNT_PW', '-Character', name, '-Scripts', mk + ',swarm.js'], { windowsHide: true, timeout: 120000, env: Object.assign({}, process.env, { L2S_NEWACCOUNT_PW: pw }) }, (err, so, se) => resolve({ ok: !err && fs.existsSync(cfgPath), text: String(so || '') + String(se || '') })));
      if (!out.ok) return json(res, 500, { error: 'creating the config failed: ' + out.text.split(pw).join('***').slice(0, 300) });
      try { fs.appendFileSync(path.join(ROOT, 'Settings', 'start_extra.txt'), cfgPath + '\r\n'); } catch (e) { }
      const acad = readJson(path.join(DATA, 'academy.json'), { accounts: [] });
      acad.accounts.push({ login, config: cfgPath, name: name || null, preset: b.preset || 'best', classPath: P.label, race: P.race, sex: P.sex, classId: P.classId, role: P.role,
        status: 'config created', at: new Date().toISOString() });
      fs.writeFileSync(path.join(DATA, 'academy.json'), JSON.stringify(acad, null, 1));
      { const rx = readJson(path.join(DATA, 'roster_extra.json'), {}); rx[name] = { role: P.role, team: name, academy: true, login }; fs.writeFileSync(path.join(DATA, 'roster_extra.json'), JSON.stringify(rx, null, 1)); }
      try { fs.appendFileSync(path.join(LOGS, 'academy.log'), `${new Date().toISOString()} new account ${login} (${name || 'no name'}, ${P.label}) — config ${cfgPath}\r\n`); } catch (e) { }
      let opened = null; try { opened = await mcpCall('open_account', { config_path: cfgPath }); } catch (e) { opened = String(e.message || e); }
      try { const a2 = readJson(path.join(DATA, 'academy.json'), { accounts: [] }); const me = a2.accounts.find(x => x.login === login); if (me) { me.status = 'logging in — creating ' + name; me.openedAt = new Date().toISOString(); } fs.writeFileSync(path.join(DATA, 'academy.json'), JSON.stringify(a2, null, 1)); } catch (e) { }
      return json(res, 200, { ok: true, login, config: cfgPath, opened: String(JSON.stringify(opened || '')).slice(0, 200), next: `${name} is created at the first login (Logs/academy.log), then levels solo 1-40 (${P.label}).` });
    }
    // Clan tab: the clan leader's state + the clan warehouse as he last saw it (Logs/clan_state.json, written by his swarm.js)
    // POST { action: 'name', name } | { action: 'quest', id, on } | { action: 'skillfocus', skill } (user 2026-10-07)
    if (url.pathname === '/api/clan') {
      const CQF = path.join(DATA, 'clan_quests.json');
      if (req.method === 'POST') {
        const b = await body(req); const cq0 = readJson(CQF, {}); cq0.clan = cq0.clan || {};
        try { fs.copyFileSync(CQF, path.join(ROOT, 'Settings', 'backup', 'clan_quests_' + Date.now() + '.json')); } catch (e) { }
        if (b.action === 'name') {
          const n = String(b.name || '').trim();
          if (!/^[A-Za-z0-9]{2,16}$/.test(n)) return json(res, 400, { error: 'clan name: 2-16 letters/digits, no spaces' });
          if (cq0.clan.created) return json(res, 400, { error: `the clan already exists (${cq0.clan.name}) — the name cannot be changed here` });
          cq0.clan.wantName = n;
        } else if (b.action === 'quest') {
          const id = String(b.id); const a = new Set((cq0.clan.activeQuests || []).map(String));
          if (b.on) a.add(id); else a.delete(id); cq0.clan.activeQuests = [...a];
        } else if (b.action === 'skillfocus') {
          cq0.clan.skillFocus = b.skill || null;
        } else return json(res, 400, { error: 'unknown action' });
        fs.writeFileSync(CQF, JSON.stringify(cq0, null, 2));
      }
      const st = readJson(path.join(LOGS, 'clan_state.json'), null);
      const cq = readJson(CQF, null);
      const chars = readStates();
      const leaderName = (st && st.leader) || (cq && cq.clan && cq.clan.leader) || 'Dagger1';
      const lc = chars.find(c => c.name === leaderName) || null;
      // teams (leader -> members + levels) with min/max level
      const teams = {}; chars.forEach(c => { const t = (typeof c.party === 'string' && c.party) || (typeof c.leader === 'string' && c.leader) || c.name; (teams[t] = teams[t] || { leader: t, members: [] }).members.push({ name: c.name, level: +c.level || 0, role: c.role, clan: c.clan || '' }); });
      Object.values(teams).forEach(t => { const L = t.members.map(m => m.level).filter(Boolean); t.min = Math.min(...L); t.max = Math.max(...L); t.size = t.members.length; });
      // the quest bosses BY NPC ID (datapack), with what each party can do (raid hunt's rule: curse level >= team max - 8, boss <= team min + 3)
      const rb = (readJson(path.join(DATA, 'raidbosses_h5.json'), {}).bosses) || []; const status = readJson(path.join(LOGS, 'raid_status.json'), {});
      const cd = readJson(path.join(DATA, 'clan_data.json'), null);
      const bosses = [];
      Object.entries((cq && cq.quests) || {}).forEach(([qid, q]) => (q.bossIds || []).forEach(id => {
        const b = rb.find(x => x.id === id) || null;
        const extra = cd && cd.quests && cd.quests[qid] ? (cd.quests[qid].bosses || []).find(x => x.id === id) : null;
        const lvl = b ? b.level : (extra ? extra.level : null), curse = b ? (b.curseLevel || b.level) : lvl;
        const s2 = status[String(id)] || null;
        const fit = Object.values(teams).filter(t => t.size >= 3).map(t => {
          let why = '';
          if (lvl == null) why = 'boss level unknown';
          else if (t.max > curse + 8) why = `raid curse: party max ${t.max} > ${curse}+8`;
          else if (lvl > t.min + 3) why = `too strong: boss ${lvl} > party min ${t.min}+3`;
          return { team: t.leader, ok: !why, why: why || `party ${t.min}-${t.max} fits`, min: t.min, max: t.max };
        });
        bosses.push({ quest: qid, questName: q.name, id, name: b ? b.name : (extra ? extra.name : `npc ${id}`), level: lvl, curseLevel: curse, zone: b ? (b.zoneName || '') : (extra ? extra.zone || '' : ''),
          x: b ? b.x : (extra ? extra.x : null), y: b ? b.y : (extra ? extra.y : null), inRaidList: !!b, item: (q.items || {})[id] || null,
          alive: s2 ? s2.alive : null, seenAt: s2 ? s2.at : null, fit });
      }));
      // 2026-10-09 fix: L2Swarm reports clan.name EMPTY (only the id) -> the roster was always empty. The name falls back to the server's
      // clan list (clanInfo) of the leader, then the configured name; a character matches by clan name or clan id.
      const rClanId = +((st && st.clan && st.clan.id) || (st && st.clanInfo && st.clanInfo.id) || (lc && lc.clanInfo && lc.clanInfo.id) || 0) || 0;
      const rClanName = String((st && st.clan && st.clan.name) || (st && st.clanInfo && st.clanInfo.name) || (lc && ((lc.clanInfo && lc.clanInfo.name) || lc.clan)) || (cq && cq.clan && cq.clan.name) || '').toLowerCase();
      const roster = (rClanName || rClanId) ? chars.filter(c => { const ci = c.clanInfo || {}, n = String(ci.name || c.clan || '').toLowerCase(); return (rClanName && n === rClanName) || (rClanId && +ci.id === rClanId); })
        .map(c => ({ name: c.name, level: c.level, role: c.role, cls: c.cls, team: (typeof c.party === 'string' && c.party) || c.name })) : [];
      // detected clans (one Clan sub-tab each), the clan event (epic bosses + party level check), CC leaders (user 2026-10-07) — Dashboard/raidteam.js
      let clans = [], events = [], ccLeaders = [];
      try { const RT = require('./raidteam'); const tpls = readJson(path.join(DATA, 'raid_templates.json'), null);
        clans = RT.clansFrom(chars, cq); events = RT.eventBosses(Object.values(teams), rb, tpls);
        ccLeaders = Object.values(teams).map(t => { const c = chars.find(x => x.name === t.leader) || {}; return { name: t.leader, size: t.size, min: t.min, max: t.max, ccRight: c.ccRight || '', clan: (c.clanInfo && c.clanInfo.name) || c.clan || '', isClanLeader: !!(c.clanInfo && c.clanInfo.isLeader) }; });
      } catch (e) { console.error('raidteam', e.message); }
      // clan level quests: progress per step (Logs/clanquest_<id>.json, written by swarm.js) (user 2026-10-07 19:20)
      // before the clan leader runs the new swarm.js (no nextLevel in clan_state yet): the same checklist from his SP/adena; items unknown (null)
      if (st && !st.nextLevel && cd && Array.isArray(cd.levels)) { const ck = (clans || []).find(k => k.leader === leaderName) || null; const cur = Math.max(+(st.clan && st.clan.level) || 0, +(ck && ck.level) || 0); const L = cd.levels.find(l => +l.level === cur + 1);
        if (L) { const missing = []; if ((+st.sp || 0) < +L.sp) missing.push(`SP ${st.sp} / ${L.sp}`); if ((+st.adena || 0) < +L.adena) missing.push(`adena ${st.adena} / ${L.adena}`); (L.items || []).forEach(i => missing.push(`${i.name} (${i.id}): not reported yet`));
          st.nextLevel = { level: cur, next: cur + 1, ok: false, estimated: true, missing: missing.length ? missing : ['the clan leader runs an older swarm.js: deploy first'], sp: { have: +st.sp || 0, need: +L.sp }, adena: { have: +st.adena || 0, need: +L.adena }, items: (L.items || []).map(i => ({ id: i.id, name: i.name, need: i.count || 1, have: null, source: L.itemSource || '' })), reputation: null, members: null }; } }
      const cqProgress = {}; Object.keys((cq && cq.levelQuests) || {}).forEach(id => { cqProgress[id] = readJson(path.join(LOGS, `clanquest_${String(id).replace(/W/g, '')}.json`), { steps: {} }); });
      // SEVEN SIGNS (user 2026-10-08): the period/winner (Logs/sevensigns_state.json) + one Logs/sevensigns_<name>.json per character, both
      // written by swarm.js; "view" = what the Ziggurat rule says for that character now (refreshed by the bot every 10 min)
      const sevenSigns = { state: readJson(path.join(LOGS, 'sevensigns_state.json'), null), chars: chars.map(c => {
        const r = (/^[A-Za-z0-9]+$/.test(String(c.name || '')) && readJson(path.join(LOGS, `sevensigns_${c.name}.json`), null)) || {}; const v = r.view || {};
        return { name: c.name, party: (typeof c.party === 'string' && c.party) || (typeof c.leader === 'string' && c.leader) || c.name, level: +c.level || 0,
          cycle: r.cycle || '', status: r.status || '', registered: v.registered !== undefined ? v.registered : (/^(signed|member)$/.test(r.status || '') ? 'dawn' : ''), signedAt: r.signedAt || 0, at: r.at || 0,
          denied: r.denied || null, allowed: v.ok === undefined ? null : !!v.ok, why: v.why || '', viewAt: v.at || 0, period: v.period || '', winner: v.winner || '', viewCycle: v.cycle || '', nextChange: v.nextChange || '' };
      }) };
      return json(res, 200, { state: st, quests: cq, leader: leaderName, leaderChar: lc, teams: Object.values(teams), bosses, roster, data: cd, clans, events, ccLeaders, cqProgress, sevenSigns });
    }
    // RAID TEAM TEMPLATES (user 2026-10-07): GET /api/raidteam -> list; ?id=<npc id> -> the template + a proposed team from ALL our characters
    if (url.pathname === '/api/raidteam') {
      const tpls = readJson(path.join(DATA, 'raid_templates.json'), null);
      if (!tpls || !tpls.bosses) return json(res, 200, { error: 'no Scripts/data/raid_templates.json yet (node docs/plan/tools/raid_templates.js)', list: [] });
      const id = url.searchParams.get('id');
      if (!id) return json(res, 200, { list: Object.values(tpls.bosses).map(b => ({ id: b.id, name: b.name, level: b.level, epic: !!b.epic, weakTo: require('./raidteam').weakOf(b.weakTo) })).sort((a, b) => (b.epic - a.epic) || a.level - b.level) });
      const t = tpls.bosses[String(id)]; if (!t) return json(res, 404, { error: 'no template for ' + id });
      const RT = require('./raidteam');
      return json(res, 200, { template: t, match: RT.matchTemplate(t, readStates(), { elementNukers: tpls.elementNukers || {}, offline: url.searchParams.get('offline') === '1' }) });
    }
    if (url.pathname === '/api/state') {
      const chars = readStates();
      return json(res, 200, {
        chars, accounts: accounts(chars), tasks: TASKS, classes: Object.keys(START_CLASSES),
        log: tail(path.join(LOGS, 'swarm_buffs.log'), 60), errors: tail(path.join(LOGS, 'swarm_errors.log'), 12),
        plan: planFiles(), now: new Date().toISOString(),
        tactics: readJson(path.join(DATA, 'party_tactics.json'), {}),   // hunting pairs per party (Parties tab)
        mainLeader: MAIN_LEADER, clanLeader: SC.clanLeader || '',        // from swarm.config.json (2026-10-09: no hard-coded names in the page)
      });
    }
    // --- Raid routes: view / correct / lock the saved walk landing -> boss (user 2026-10-06) ---
    if (url.pathname === '/api/route') { const r = routeApi(req.method === 'POST' ? await body(req) : null, url.searchParams.get('id')); return json(res, r.error ? 400 : 200, r); }
    if (url.pathname === '/api/routes') return json(res, 200, { routes: routeList() });
    // GIRAN TOWN ROUTES (user 2026-10-06: editable like the raid routes): start -> grocer / warehouse / weapons / armor / jewelry / …
    // Scripts/data/giran_routes.json, read by swarm.js giranGo() (re-read every minute, no deploy). Every save keeps the old file.
    if (url.pathname === '/api/townroute') {
      const GFILE = path.join(DATA, 'giran_routes.json'), g = readJson(GFILE, { start: null, routes: {} });
      const place = String((req.method === 'POST' ? null : url.searchParams.get('place')) || '');
      const view = (p) => ({ town: 'Giran', start: g.start, place: p, route: p ? (g.routes[p] || null) : null,
        places: Object.keys(g.routes).map(k => ({ key: k, npc: g.routes[k].npc || '', points: (g.routes[k].points || []).length, editedAt: g.routes[k].editedAt || null })) });
      if (req.method !== 'POST') return json(res, 200, view(place));
      const b = await body(req), p = String(b.place || '').toLowerCase();
      if (!/^[a-z][a-z0-9_]{1,30}$/.test(p)) return json(res, 400, { error: 'route name: lowercase letters/digits, e.g. "grocer" or "gatekeeper"' });
      const hist = path.join(DATA, 'routes', 'giran_history');
      fs.mkdirSync(hist, { recursive: true });
      fs.copyFileSync(GFILE, path.join(hist, `giran_routes_${Date.now()}.json`));
      if (b.action === 'delete') { delete g.routes[p]; }
      else {
        let pts = Array.isArray(b.points) ? b.points.map(q => [Math.round(+q.x), Math.round(+q.y), Math.round(+q.z)]) : [];
        if (pts.length < 2 || pts.length > 200 || pts.some(q => !q.every(Number.isFinite))) return json(res, 400, { error: 'need 2-200 points with numeric x, y, z' });
        // the bots walk start -> points[1..]: point 1 must be the start (the .giran landing)
        if (g.start && Math.hypot(pts[0][0] - g.start[0], pts[0][1] - g.start[1]) > 300) pts = [g.start.slice()].concat(pts);
        g.routes[p] = { ...(g.routes[p] || {}), points: pts, editedAt: new Date().toISOString(), manual: true };
      }
      const tmp = GFILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(g, null, 1), 'utf8'); fs.renameSync(tmp, GFILE);
      return json(res, 200, { ok: true, msg: b.action === 'delete' ? `route '${p}' deleted` : `route '${p}' saved — the bots use it within a minute`, ...view(b.action === 'delete' ? '' : p) });
    }
    if (url.pathname === '/api/raids') return json(res, 200, { raids: raids(), teams: raidTeams() });
    if (url.pathname.startsWith('/api/raid/')) { const d = raidDetail(decodeURIComponent(url.pathname.slice(10)), url.searchParams.get('party')); return d ? json(res, 200, d) : json(res, 404, { error: 'unknown boss' }); }
    if (url.pathname === '/api/raidlive') return json(res, 200, require('./raidlive_api').enrich(raidLive(url.searchParams.get('leader') || ''), 'raid', { LOGS, DATA, readJson }));   // RAIDLIVE HUD 2026-10-09
    if (url.pathname === '/api/override') return json(res, 200, require('./raidlive_api').overrideInfo(url.searchParams.get('name') || '', { LOGS, readJson, readStates, partyOf }));   // USER OVERRIDE 2026-10-09: menu data + last result (Dashboard/override.js)
    if (url.pathname === '/api/kamaloka') return json(res, 200, kamalokaInfo());
    if (url.pathname === '/api/kamalive') return json(res, 200, require('./raidlive_api').enrich(kamalokaLive(url.searchParams.get('leader') || ''), 'kama', { LOGS, DATA, readJson }));   // RAIDLIVE HUD 2026-10-09
    // FORTRESS + CASTLE SIEGES (user 2026-10-08): data + plans + parties + clan (Dashboard/sieges_api.js), live view Logs/siege_live.json
    if (url.pathname === '/api/sieges') { const r = req.method === 'POST' ? SIEGES.post(await body(req)) : SIEGES.info(); return json(res, r.error ? 400 : 200, r); }
    // ===== POLYEDIT (2026-10-08): GET/POST /api/polyedit — shape editor for rooms / zones / spots / field areas (Dashboard/polyedit_api.js) =====
    if (url.pathname === '/api/polyedit') { const r = POLYEDIT.handle(req.method, url.searchParams, req.method === 'POST' ? await body(req) : null); return json(res, r.code, r.body); }
    if (url.pathname === '/api/siegelive') return json(res, 200, SIEGES.live());
    if (url.pathname === '/api/raidhunt') return json(res, 200, raidHuntAll());
    if (url.pathname === '/api/raidreports') return json(res, 200, raidReports());
    // --- Daily dungeons on/off per party (swarm.js reads Logs/daily_enabled.json live) ---
    if (url.pathname === '/api/daily') {
      const EF = path.join(LOGS, 'daily_enabled.json');
      if (req.method === 'POST') {
        const b = await body(req);
        const leader = String(b.leader || ''), kind = String(b.kind || '');
        const DAILY_LEADERS = dailyLeaders();
        if (!DAILY_LEADERS.includes(leader) || !DAILY_KINDS.includes(kind) || typeof b.on !== 'boolean')
          return json(res, 400, { error: `leader (${DAILY_LEADERS.join('|')}), kind (${DAILY_KINDS.join('|')}) and on (true|false) required` });
        const cur = readJson(EF, {}) || {};
        cur[leader] = Object.assign({}, cur[leader], { [kind]: b.on });
        const tmp = EF + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(cur), { encoding: 'utf8' });   // utf8 = no BOM
        fs.renameSync(tmp, EF);
        return json(res, 200, { enabled: cur });
      }
      return json(res, 200, dailyInfo());
    }
    if (url.pathname === '/api/raidloot') return json(res, 200, { kills: raidLoot(url.searchParams.get('boss') || '') });
    // --- gatekeeper menus as seen live by the bots (Scripts/data/gk_live/*.json) + which town each character is in ---
    if (url.pathname === '/api/gatekeepers') {
      const dir = path.join(DATA, 'gk_live');
      const gks = [];
      try {
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith('.json') || f.startsWith('_')) continue;
          const j = readJson(path.join(dir, f), null); if (!j) continue;
          const links = [...new Set(Object.values(j.pages || {}).flat())];
          gks.push({ name: j.name, title: j.title, town: j.town, x: j.x, y: j.y, links, updated: j.updated, by: j.by });
        }
      } catch (e) { }
      const chars = readStates().map(c => {
        let best = null, bd = 6000;
        gks.forEach(g => { const d = Math.hypot(g.x - c.x, g.y - c.y); if (d < bd) { bd = d; best = g; } });
        return { name: c.name, party: c.party, town: best ? best.town : null, gk: best ? best.name : null, dist: best ? Math.round(bd) : null, soe: c.soe, online: c.ageSec <= 30 };
      });
      return json(res, 200, { gatekeepers: gks.sort((a, b) => String(a.town).localeCompare(String(b.town))), chars });
    }
    // --- PC / L2Swarm process control ---
    if (url.pathname === '/api/system' && req.method === 'GET') return json(res, 200, systemInfo());
    if (url.pathname === '/api/system' && req.method === 'POST') {
      const b = await body(req);
      const task = { start: 'L2Swarm Start', stop: 'L2Swarm Stop', restart: 'L2Swarm Restart' }[b.action];
      if (task) { const r = await runTask(task); setTimeout(pollSystem, 15000); return json(res, r.ok ? 200 : 500, r); }
      if (b.action === 'deploy') { const r = await runDeploy(!!b.force); return json(res, 200, r); }
      return json(res, 400, { error: 'action must be start | stop | restart | deploy' });
    }
    // --- GEAR CATALOG + PREFERENCES (user 2026-10-06: "see all the items each class wants to buy and select the preferred item per class
    //     and grade") — mirrors swarm.js ROLE_RULES / planUpgrades. Preferences: Scripts/data/gear_prefs.json, read live by the bots.
    const PREFS = path.join(DATA, 'gear_prefs.json');
    if (url.pathname === '/api/gearcatalog' && req.method === 'GET') return json(res, 200, gearCatalog(url.searchParams.get('role') || 'sk', (url.searchParams.get('grade') || 'C').toUpperCase(), url.searchParams.get('all') === '1'));
    if (url.pathname === '/api/gearprefs' && req.method === 'GET') return json(res, 200, { prefs: readJson(PREFS, {}) });
    if (url.pathname === '/api/gearprefs' && req.method === 'POST') {
      // { role, grade, slot, id }  (id null/0 = back to the automatic pick)
      const b = await body(req);
      const role = String(b.role || ''), grade = String(b.grade || '').toUpperCase(), slot = String(b.slot || '');
      if (!GEAR_ROLES[role] || !GEAR_GRADES.includes(grade) || !GEAR_SLOTS.includes(slot)) return json(res, 400, { error: 'role, grade and slot required' });
      const prefs = readJson(PREFS, {});
      prefs[role] = prefs[role] || {}; prefs[role][grade] = prefs[role][grade] || {};
      if (b.id) {
        const it = gearDb()[b.id];
        if (!it || it.s !== slot) return json(res, 400, { error: 'that item does not fit this slot' });
        prefs[role][grade][slot] = Number(b.id);
      } else delete prefs[role][grade][slot];
      prefs._updated = new Date().toISOString();
      fs.writeFileSync(PREFS, JSON.stringify(prefs, null, 1));
      return json(res, 200, { ok: true, prefs });
    }
    // --- HUNTING SPOT PER PARTY (user 2026-10-08 17:55: "per party, choose the hunting spot myself"): Scripts/data/party_spots.json
    // { "<leader>": { mode:'auto'|'manual', kind:'zone'|'datapack'|'rooms', spot, dungeon, roomId ('any' = any free room), stay, at, by } },
    // read live by swarm.js (ROOM POLYS PATCH: manualSpot in pickSpot). GET -> the file + every choice (custom zones, datapack spots, room
    // dungeons) + who holds what now (Logs/spot_claims.json: our parties' claims and the spots they saw occupied by other players).
    const PSFILE = path.join(DATA, 'party_spots.json');
    if (url.pathname === '/api/partyspot' && req.method === 'GET') {
      const zones = (readJson(path.join(DATA, 'custom_zones.json'), []) || []).filter(z => z && z.name).map(z => ({ name: z.name, levelMin: z.levelMin, levelMax: z.levelMax,
        kind: z.rooms ? 'rooms' : z.dungeon ? 'dungeon' : (z.poly ? 'drawn area' : 'outdoor'), rooms: z.rooms || null, dungeon: z.dungeon || null, enabled: z.enabled !== false,
        teams: Array.isArray(z.teams) ? z.teams : (z.team ? [z.team] : ['all']), x: z.x, y: z.y, z: z.z }));
      const datapack = (readJson(path.join(DATA, 'hunting_spots_h5.json'), []) || []).filter(s => s && s.name && s.gk && String(s.gk.desc || '').includes('->'))
        .map(s => ({ name: s.name, levelMin: s.levelMin, levelMax: s.levelMax, via: s.gk.desc, mobs: (s.mobs || []).reduce((t, m) => t + (m.count || 0), 0), x: s.center && s.center.x, y: s.center && s.center.y }));
      const dungeons = (readJson(path.join(DATA, 'dungeon_rooms.json'), []) || []).map(d => ({ name: d.name, levelRange: d.levelRange, catacomb: !!d.catacomb,
        rooms: (d.floors || []).reduce((t, F) => t + (F.rooms || []).length, 0), floors: (d.floors || []).map(F => F.name) }));
      const cl = readJson(path.join(LOGS, 'spot_claims.json'), {}) || {};
      const claims = Object.keys(cl).filter(k => k.charAt(0) !== '_' && cl[k] && Date.now() - (+cl[k].at || 0) < 600000).map(k => ({ key: k, team: cl[k].team, name: cl[k].name, room: cl[k].room || null }));
      const occupied = []; Object.entries((cl._occupied && typeof cl._occupied === 'object') ? cl._occupied : {}).forEach(([team, list]) => (Array.isArray(list) ? list : []).forEach(o => { if (o && +o.until > Date.now()) occupied.push({ key: o.key, name: o.name, by: o.by, seenBy: team, min: Math.round((+o.until - Date.now()) / 60000) }); }));
      // FIELD AREAS (user 2026-10-08 22:45): outdoor hunting grounds split into geodata areas (Scripts/data/field_areas.json, docs/plan/tools/field_areas.js)
      const regions = ((fieldAreasData() || {}).regions || []).map(R => ({ id: R.id, name: R.name, kind: R.kind, levelRange: R.levelRange, areas: (R.areas || []).length,
        reachable: (R.areas || []).filter(a => a.reachable).length, landing: (R.landings && R.landings[0] && R.landings[0].desc) || '', center: R.center }));
      return json(res, 200, { spots: readJson(PSFILE, {}), options: { zones, datapack, dungeons, regions }, claims: claims.map(c => Object.assign(c, { area: (cl[c.key] || {}).area || null })), occupied });
    }
    if (url.pathname === '/api/partyspot' && req.method === 'POST') {
      const b = await body(req), party = String(b.party || '').trim();
      if (!/^[A-Za-z0-9_]{2,32}$/.test(party) || party.startsWith('_')) return json(res, 400, { error: 'party (leader name) required' });
      const all = readJson(PSFILE, {}) || {};
      try { if (fs.existsSync(PSFILE)) fs.copyFileSync(PSFILE, path.join(ROOT, 'Settings', 'backup', 'party_spots_' + Date.now() + '.json')); } catch (e) { }
      if (b.mode !== 'manual') all[party] = { mode: 'auto', at: new Date().toISOString(), by: 'dashboard' };
      else {
        const kind = ['zone', 'datapack', 'rooms', 'field'].includes(String(b.kind)) ? String(b.kind) : null;
        if (!kind) return json(res, 400, { error: 'kind must be zone, datapack, rooms or field' });
        const e = { mode: 'manual', kind, spot: String(b.spot || '').slice(0, 120), stay: !!b.stay, moveOn: !!b.moveOn, at: new Date().toISOString(), by: 'dashboard' };
        if (kind === 'rooms') {
          const d = (readJson(path.join(DATA, 'dungeon_rooms.json'), []) || []).find(x => x.name === String(b.dungeon || b.spot));
          if (!d) return json(res, 404, { error: 'unknown dungeon' });
          const rid = String(b.roomId || (Array.isArray(b.roomIds) && b.roomIds[0]) || 'any');
          const has = (id) => (d.floors || []).some(F => (F.rooms || []).some(r => r.id === id));
          if (rid !== 'any' && !has(rid)) return json(res, 404, { error: 'unknown room id' });
          Object.assign(e, { dungeon: d.name, spot: d.name, roomId: rid });
          // SEVERAL ROOMS (2026-10-08 22:45): roomIds in the chosen order (roomId = the first one: old readers keep working), order rotate | nearest
          if (Array.isArray(b.roomIds) && b.roomIds.length) {
            const ids = [...new Set(b.roomIds.map(String))].slice(0, 40); if (ids.some(id => !has(id))) return json(res, 404, { error: 'unknown room id in roomIds' });
            Object.assign(e, { roomId: ids[0], roomIds: ids, order: b.order === 'rotate' ? 'rotate' : 'nearest' });
          }
        } else if (kind === 'field') {
          // FIELD AREAS (2026-10-08 22:45): { region, areaIds: [...] (chosen order), order rotate | nearest }
          const R = ((fieldAreasData() || {}).regions || []).find(x => x.id === String(b.region || '') || x.name === String(b.region || b.spot || ''));
          if (!R) return json(res, 404, { error: 'unknown region' });
          const ids = [...new Set((Array.isArray(b.areaIds) ? b.areaIds : []).map(String))].slice(0, 40);
          if (!ids.length) return json(res, 400, { error: 'areaIds required' });
          if (ids.some(id => !(R.areas || []).some(a => a.id === id))) return json(res, 404, { error: 'unknown area id' });
          Object.assign(e, { region: R.id, spot: R.name, areaIds: ids, order: b.order === 'rotate' ? 'rotate' : 'nearest' });
        } else if (!e.spot) return json(res, 400, { error: 'spot name required' });
        if (b.roomId && kind === 'zone') e.roomId = String(b.roomId);
        // the user's "Yes, override" for a spot above the party's safe level (user 2026-10-08 21:58): swarm.js skips the level / landing-danger
        // refusals for this choice (never the Seven Signs rule)
        if (b.override === true) Object.assign(e, { override: true, overrideBy: String(b.overrideBy || 'dashboard').slice(0, 40), overrideAt: e.at, overrideNote: String(b.overrideNote || '').slice(0, 200) });
        all[party] = e;
      }
      all._updated = new Date().toISOString();
      fs.writeFileSync(PSFILE, JSON.stringify(all, null, 1));
      return json(res, 200, { ok: true, spots: all });
    }
    // one outdoor region for the field-area picker / party map (FIELD AREAS 2026-10-08 22:45): areas with polygons, levels, monsters, entry, neighbours, safe spots
    if (url.pathname === '/api/fieldmap') {
      const id = url.searchParams.get('id') || '', R = ((fieldAreasData() || {}).regions || []).find(x => x.id === id || x.name === id);
      if (!R) return json(res, 404, { error: 'unknown region' });
      // DAY SKIPS (2026-10-09, swarm.js spotLearnFail): an area that could not be reached twice today is skipped by every party until 06:30
      const learned = (readJson(path.join(DATA, 'spot_learned.json'), {}) || {}).spots || {};
      const skipOf = (a) => { const e = learned['area:' + a.id]; return e && +e.skipUntil > Date.now() ? { until: new Date(+e.skipUntil).toISOString(), fails: (e.fails || []).map(f => `${f.by} ${String(f.at).slice(11, 16)}`) } : null; };
      return json(res, 200, { id: R.id, name: R.name, kind: R.kind, levelRange: R.levelRange, bbox: R.bbox, center: R.center, landings: R.landings, safeSpots: R.safeSpots || [],
        areas: (R.areas || []).map(a => ({ id: a.id, n: a.n, name: a.name, side: a.side, center: a.center, radius: a.radius, poly: a.poly, zRange: a.zRange, area: a.area,
          levelRange: a.levelRange, levelAll: a.levelAll, suits: a.suitsPartyLevel, dangerMax: a.dangerMax, spawns: a.spawnCount, aggressiveShare: a.aggressiveShare, respawnSec: a.respawnSec,
          monsters: (a.monsters || []).slice(0, 6).map(m => `${m.name} ${m.level}${m.aggressive ? ' (A)' : ''}${m.count > 1 ? ' x' + m.count : ''}`), raidBosses: a.raidBosses || [],
          entry: a.entry ? { kind: a.entry.kind, desc: a.entry.desc, town: a.entry.town, walk: a.entry.walk, landing: a.entry.landing, far: !!a.entry.far, route: a.entry.route, live: a.entry.liveState || null } : null,
          // REACHABLE ENTRY 2026-10-09: why an area cannot be reached (field_areas.js --entries: no landing within the 25k walk limit) -> greyed in the picker
          reachable: !!a.reachable, unreachable: a.reachable ? null : (a.unreachable || 'no gatekeeper landing within the walk limit'), skipToday: skipOf(a), neighbours: (a.neighbours || []).map(n => ({ id: n.id, walk: n.walk })), safeSpot: a.safeSpot, quality: (a.polyInfo || {}).quality || null })) });
    }
    // one dungeon for the room picker / room maps: floors with room polygons, levels, monsters, safe spots (no walk routes: they are big)
    if (url.pathname === '/api/dungeonmap') {
      const name = url.searchParams.get('name') || '';
      const d = (readJson(path.join(DATA, 'dungeon_rooms.json'), []) || []).find(x => x.name === name);
      if (!d) return json(res, 404, { error: 'unknown dungeon' });
      return json(res, 200, { name: d.name, levelRange: d.levelRange, catacomb: !!d.catacomb, bbox: d.bbox, mapLayers: d.mapLayers || [],
        floors: (d.floors || []).map(F => ({ name: F.name, z: F.z, levelRange: F.levelRange || null, safeSpots: F.safeSpots || [],
          rooms: (F.rooms || []).map(r => ({ id: r.id, name: r.name, center: r.center, radius: r.radius, poly: r.poly || null, zRange: r.zRange || null, levelRange: r.levelRange, suits: r.suitsPartyLevel,
            quality: (r.polyInfo || {}).quality || null, added: !!r.added, monsters: (r.monsters || []).slice(0, 5).map(m => `${m.name} ${m.level}${m.aggressive ? ' (A)' : ''}${m.count > 1 ? ' x' + m.count : ''}`), reachable: !!r.route })),
          // FLOOR LINKS (2026-10-09): the ways off this floor (teleporter NPC / stairs) for the Rooms tab
          links: (F.links || []).map(l => ({ to: l.to, toName: typeof l.to === 'number' ? (l.to < 0 ? 'outside' : ((d.floors[l.to] || {}).name || String(l.to))) : String(l.to), kind: l.kind, npc: l.npc ? l.npc.name : null,
            text: l.linkText || null, at: l.at || null, land: l.land || null, verified: l.verified, evidence: l.evidence || '', needs: l.needs || null })),
          graphStats: F.graphStats || null })) });
    }
    // NPC ATLAS (2026-10-09, docs/plan/tools/npc_atlas.js -> Scripts/data/npc_atlas.json): /api/npcfind?q= — the dashboard's "Find an NPC"
    if (url.pathname === '/api/npcfind') {
      const A = readJson(path.join(DATA, 'npc_atlas.json'), { npcs: [] }), raw = String(url.searchParams.get('q') || '').trim();
      const nm = (x) => String(x || '').toLowerCase().replace(/\s*-\s*\d[\d,.]*\s*(adena|a)?\b.*$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
      let q = raw.toLowerCase(), town = null, list;
      const tp = raw.match(/^(?:teleport|link|offers?)\s*:\s*(.+)$/i), id = raw.match(/^#?(\d{4,6})$/);
      if (id) list = A.npcs.filter(n => n.id === +id[1]);
      else if (tp) { const v = nm(tp[1]); list = A.npcs.filter(n => (n.teleports || []).some(t => nm(t.text).includes(v) || nm(String(t.desc || '').split('->').pop()).includes(v)) || ((n.live && n.live.links) || []).some(t => nm(t).includes(v))); }
      else {
        const towns = [...new Set(A.npcs.map(n => n.place && n.place.town).filter(Boolean))].sort((a2, b2) => b2.length - a2.length);
        for (const t of towns) { const re = new RegExp('\\s+(?:in\\s+|at\\s+)?' + t.toLowerCase().replace(/[^a-z0-9 ]/g, '.') + '$'); if (re.test(q)) { town = t; q = q.replace(re, '').trim(); break; } }
        list = A.npcs.filter(n => (!town || (n.place && n.place.town === town)) && (nm(n.name) === nm(q) || nm(n.spawnName) === nm(q) || (n.roles || []).some(r => r === q || r.startsWith(q)) || (q.length > 3 && nm(n.name).includes(nm(q)))));
      }
      list.sort((a2, b2) => (b2.live ? 1 : 0) - (a2.live ? 1 : 0));
      return json(res, 200, { q: raw, town, count: list.length, list: list.slice(0, 40) });
    }
    // ROOM GRAPH (2026-10-09, docs/plan/tools/room_graph.js -> Scripts/data/dungeon_graph/<key>.json): the hallway centreline network of a
    // dungeon for the room maps / party map: per floor the vertices [id, x, y, kind] and the edges [a, b, [x,y, x,y, ...] waypoints]
    if (url.pathname === '/api/dungeongraph') {
      const name = url.searchParams.get('name') || '';
      const d = (readJson(path.join(DATA, 'dungeon_rooms.json'), []) || []).find(x => x.name === name || x.key === name);
      if (!d) {
        // a TOWN street graph (docs/plan/tools/town_graph.js -> Scripts/data/town_graph/<key>.json, 2026-10-09): one floor "streets"
        const ti = ((readJson(path.join(DATA, 'town_graph', 'index.json'), { towns: [] }) || {}).towns || []).find(t => t.town === name || t.key === String(name).toLowerCase() || 'town-' + t.key === name);
        const T = ti && readJson(path.join(DATA, 'town_graph', ti.key + '.json'), null);
        if (!T) return json(res, 404, { error: 'unknown dungeon / town' });
        return json(res, 200, { name: T.town, town: true, built: T.built, floors: [{ name: 'streets', z: [T.z[0] - 200, T.z[1] + 200], v: T.v.map(v => [v[0], v[1], v[2], v[5]]),
          e: T.e.map(e => { const p = []; for (let k = 0; k < (e[4] || []).length; k += 3) p.push(e[4][k], e[4][k + 1]); return [e[0], e[1], p]; }) }], unreachable: T.unreachable || [] });
      }
      const G = readJson(path.join(DATA, 'dungeon_graph', d.key + '.json'), null);
      if (!G) return json(res, 200, { name: d.name, floors: [] });
      return json(res, 200, { name: d.name, built: G.built, floors: (G.floors || []).map((F, i) => {
        const g = F.graph; if (!g) return { name: F.name, z: (d.floors[i] || {}).z || null, v: [], e: [] };
        return { name: F.name, z: (d.floors[i] || {}).z || null, v: g.v.map(v => [v[0], v[1], v[2], v[5]]),
          e: g.e.map(e => { const p = []; for (let k = 0; k < (e[4] || []).length; k += 3) p.push(e[4][k], e[4][k + 1]); return [e[0], e[1], p]; }) };
      }) });
    }
    // --- PARTY TACTICS (user 2026-10-07: hunting pairs per party): Scripts/data/party_tactics.json, key = party leader, read live by swarm.js ---
    const TFILE = path.join(DATA, 'party_tactics.json');
    if (url.pathname === '/api/tactics' && req.method === 'GET') return json(res, 200, { tactics: readJson(TFILE, {}) });
    if (url.pathname === '/api/tactics' && req.method === 'POST') {
      const b = await body(req), party = String(b.party || '').trim();
      if (!/^[A-Za-z0-9_]{2,32}$/.test(party) || party.startsWith('_')) return json(res, 400, { error: 'party (leader name) required' });
      const clamp = (v, lo, hi, d) => { const n = Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
      const all = readJson(TFILE, {}), cur = all[party] || {}, def = all._defaults || {};
      const get = (k) => b[k] !== undefined ? b[k] : (cur[k] !== undefined ? cur[k] : def[k]);
      const t = {
        mode: ['off', 'auto', 'on'].includes(String(get('mode'))) ? String(get('mode')) : 'off',
        pairSize: Math.round(clamp(get('pairSize'), 1, 3, 2)), maxPairs: Math.round(clamp(get('maxPairs'), 1, 6, 3)),
        leash: Math.round(clamp(get('leash'), 300, 1400, 900)), zoneScale: Math.round(clamp(get('zoneScale'), 1, 2, 1) * 100) / 100,
        minDealers: Math.round(clamp(get('minDealers'), 1, 9, 4)), levelMargin: Math.round(clamp(get('levelMargin'), -5, 10, 2)),
        fallbackHp: Math.round(clamp(get('fallbackHp'), 5, 90, 40)), includeBuffers: !!get('includeBuffers'),
      };
      ['maxAdds', 'expRange', 'hpAvgMin', 'noDeathMin', 'cooldownMin', 'helpHp'].forEach(k => { if (cur[k] !== undefined) t[k] = cur[k]; });   // expert fields: file only
      all[party] = t; all._updated = new Date().toISOString();
      fs.writeFileSync(TFILE, JSON.stringify(all, null, 1));
      return json(res, 200, { ok: true, tactics: all });
    }
    // --- zones defined by the user (used by !autolevel before the built-in spots) ---
    const ZFILE = path.join(DATA, 'custom_zones.json');
    if (url.pathname === '/api/zones' && req.method === 'GET') return json(res, 200, { zones: readJson(ZFILE, []) });
    if (url.pathname === '/api/landings') return json(res, 200, landings());
    if (url.pathname === '/api/spawnsin') {
      const q = (k) => +url.searchParams.get(k);
      const x0 = q('x0'), y0 = q('y0'), x1 = q('x1'), y1 = q('y1');
      if (![x0, y0, x1, y1].every(isFinite) || x1 - x0 > 60000 || y1 - y0 > 60000) return json(res, 400, { error: 'x0,y0,x1,y1 (max 60000 wide)' });
      // optional height band z0..z1 (spot editor floors: only the monsters of one floor of a tower / cave)
      const z0 = url.searchParams.has('z0') ? q('z0') : NaN, z1 = url.searchParams.has('z1') ? q('z1') : NaN;
      return json(res, 200, { mobs: spawnsIn(x0, y0, x1, y1, isFinite(z0) ? z0 : undefined, isFinite(z1) ? z1 : undefined) });
    }
    // SPOT EDITOR geodata (user 2026-10-07): /api/geoz?x=&y=&z= -> every floor height at that spot (towers, caves: several) + the one
    // nearest z; POST /api/geocheck { points:[{x,y,z}] } -> for each leg whether a straight walk is free of walls (docs/plan/tools/geopath.js)
    if (url.pathname === '/api/geoz') {
      const gp = require(path.join(PLAN, 'tools', 'geopath.js'));
      const x = +url.searchParams.get('x'), y = +url.searchParams.get('y'), z = url.searchParams.has('z') && url.searchParams.get('z') !== '' ? +url.searchParams.get('z') : NaN;
      if (![x, y].every(isFinite)) return json(res, 400, { error: 'x, y required' });
      const ls = gp.layers(gp.toGeoX(x), gp.toGeoY(y));
      if (!ls) return json(res, 200, { heights: [], z: null });
      const hs = ls.map(l => l.h).sort((a, b) => b - a);
      const zz = isFinite(z) ? hs.reduce((b, h) => Math.abs(h - z) < Math.abs(b - z) ? h : b, hs[0]) : hs[0];
      return json(res, 200, { heights: hs, z: zz });
    }
    // places the spot editor can jump to + their named floors (dungeon_rooms.json floors, catacombs.json insides), towns, teleport landings
    if (url.pathname === '/api/spotplaces') {
      const out = [];
      (readJson(path.join(DATA, 'dungeon_rooms.json'), []) || []).forEach(d => {
        if (d.catacomb) return;                              // catacombs/necropolises: listed below from catacombs.json (rooms added 2026-10-08)
        const cs = (d.floors || []).flatMap(F => (F.rooms || []).filter(r => r.center).map(r => r.center));
        const e = d.entrance || {};
        const bbox = cs.length ? [Math.min(...cs.map(c => c[0])) - 2000, Math.min(...cs.map(c => c[1])) - 2000, Math.max(...cs.map(c => c[0])) + 2000, Math.max(...cs.map(c => c[1])) + 2000] : null;
        out.push({ name: d.name, kind: 'dungeon', x: e.x, y: e.y, z: e.z, bbox, levelRange: d.levelRange || null,
          floors: (d.floors || []).filter(F => Array.isArray(F.z)).map(F => ({ name: F.name, zMin: F.z[0], zMax: F.z[1], levelRange: F.levelRange || null })) });
      });
      (readJson(path.join(DATA, 'catacombs.json'), []) || []).forEach(c => {
        const L = (c.inside && c.inside.landing) || [], e = c.entrance || {}, zb = (c.inside && c.inside.z) || null;
        out.push({ name: c.name, kind: 'catacomb', x: L[0] || e.x, y: L[1] || e.y, z: L[2] || e.z, bbox: (c.inside && c.inside.bbox) || null, levelRange: c.lvl || null,
          floors: zb ? [{ name: 'inside', zMin: zb[0] - 300, zMax: zb[1] + 300 }] : [] });
      });
      return json(res, 200, { places: out, landings: landings() });
    }
    if (url.pathname === '/api/geocheck' && req.method === 'POST') {
      const gp = require(path.join(PLAN, 'tools', 'geopath.js'));
      const b = await body(req), P = (Array.isArray(b.points) ? b.points : []).slice(0, 300).filter(p => isFinite(p.x) && isFinite(p.y));
      const legs = [];
      for (let i = 0; i + 1 < P.length; i++) {
        const a = { x: +P[i].x, y: +P[i].y, z: +P[i].z || 0 }, c = { x: +P[i + 1].x, y: +P[i + 1].y, z: +P[i + 1].z || 0 };
        let ok = null; try { ok = Math.hypot(c.x - a.x, c.y - a.y) > 20000 ? null : gp.lineClear(a, c); } catch (e) { ok = null; }
        legs.push(ok);
      }
      return json(res, 200, { legs });
    }
    // Client mode per character (in-game via L2Swarm's Hook button, or out of game). MemWatch applies it within 2 min.
    if (url.pathname === '/api/clientmode') {
      const CM = path.join(__dirname, '..', 'Settings', 'client_mode.json');
      const cur = readJson(CM, {});
      if (req.method === 'POST') {
        const b = await body(req);
        const name = String(b.name || ''), mode = String(b.mode || '');
        if (!/^[A-Za-z0-9]+$/.test(name) || !['ingame', 'oog'].includes(mode)) return json(res, 400, { error: 'name + mode (ingame|oog) required' });
        // hook-mode audit 2026-10-07 (both PROVEN from the 3.8.8 IL): a config without <L2ExePath> makes L2Swarm's Hook open a modal
        // "Select L2.exe" dialog; and the Hook button stays disabled while one hooked client runs, so only ONE character can be in game
        let warning = '';
        if (mode === 'ingame') {
          const cfg = await configForChar(name).catch(() => null);
          const exe = cfg ? ((fs.readFileSync(cfg, 'utf8').match(/<L2ExePath>([^<]+)</) || [])[1] || '') : '';
          if (!cfg) return json(res, 400, { error: `no config with <SelectedCharacter>${name}< in Settings` });
          if (!exe || !fs.existsSync(exe)) return json(res, 400, { error: `${path.basename(cfg)} has no valid <L2ExePath> (L2Swarm would open a "Select L2.exe" dialog). Set it first: close the account, add <L2ExePath>C:\\Lineage2\\system\\l2.exe</L2ExePath>, open it again.` });
          const others = Object.keys(cur).filter(k => k !== name && cur[k] === 'ingame');
          if (others.length) warning = `${others.join(', ')} is already in game: L2Swarm runs only ONE hooked client at a time, ${name} waits until that client is closed`;
        }
        cur[name] = mode;
        fs.writeFileSync(CM, JSON.stringify(cur));
        try { require('child_process').exec('schtasks /run /tn "L2Swarm MemWatch"'); } catch (e) { }
        return json(res, 200, { modes: cur, warning });
      }
      return json(res, 200, { modes: cur });
    }
    if (url.pathname === '/api/zones' && req.method === 'POST') {
      const z = await body(req);
      const hasPoly = Array.isArray(z.poly) && z.poly.length >= 3;
      if (!z.name || (!hasPoly && (!isFinite(z.x) || !isFinite(z.y)))) return json(res, 400, { error: 'a name and either x/y or a drawn area (3+ points) are required' });
      const all = readJson(ZFILE, []), prev = all.find(o => o.name === (z.oldName || z.name)) || {};
      const list = all.filter(o => o.name !== z.name && o.name !== z.oldName);
      const P = (a) => (Array.isArray(a) ? a : []).filter(p => p && isFinite(p.x) && isFinite(p.y)).map(p => ({ x: Math.round(+p.x), y: Math.round(+p.y), ...(isFinite(p.z) ? { z: Math.round(+p.z) } : {}) }));
      const poly = P(z.poly), holes = (Array.isArray(z.holes) ? z.holes : []).map(P).filter(h => h.length >= 3);
      const pulls = (Array.isArray(z.pulls) ? z.pulls : []).map(r => ({ name: String(r.name || 'pull'), points: P(r.points) })).filter(r => r.points.length >= 2);
      let x = +z.x, y = +z.y, radius = Math.round(+z.radius || 2500), zmap = prev.zmap || '';
      if (poly.length >= 3) {                                        // a drawn area: centre = average of the corners, radius = farthest corner
        x = poly.reduce((t, p) => t + p.x, 0) / poly.length; y = poly.reduce((t, p) => t + p.y, 0) / poly.length;
        radius = Math.round(Math.max(...poly.map(p => Math.hypot(p.x - x, p.y - y))));
        const id = String(z.name).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40);
        fs.mkdirSync(path.join(SETTINGS, 'zones'), { recursive: true });
        fs.writeFileSync(path.join(SETTINGS, 'zones', id + '.zmap'), zmapXml(poly));
        zmap = 'zones\\' + id + '.zmap';                           // relative to Settings\ (swarm.js loads ${__DIR__}\Settings\<zmap>)
      }
      const tr = z.travel || {};
      const travel = tr.kind === 'town' && tr.town ? { kind: 'town', town: String(tr.town) } : tr.kind === 'gk' && tr.desc ? { kind: 'gk', desc: String(tr.desc) } : null;
      // SPOT EDITOR fields (user 2026-10-07, full-screen map): waypoints = the walk from the landing to the area (every member walks each
      // point), circles = round exclusion areas {x,y,z?,r}, floor = the height band of a tower/cave floor {name,zMin,zMax}, teams = which
      // parties may use it (as on the Spots tab), avoidMobs = monster names never fought in this spot. Old editors leave them untouched.
      const ext = {};
      if (Array.isArray(z.waypoints)) { const w = P(z.waypoints).slice(0, 300); ext.waypoints = w.length ? w : undefined; }
      if (Array.isArray(z.circles)) { const c = z.circles.filter(o => o && isFinite(o.x) && isFinite(o.y) && +o.r > 0).map(o => ({ x: Math.round(+o.x), y: Math.round(+o.y), ...(isFinite(o.z) && o.z !== null && o.z !== '' ? { z: Math.round(+o.z) } : {}), r: Math.min(20000, Math.round(+o.r)) })); ext.circles = c.length ? c : undefined; }
      if ('floor' in z) ext.floor = z.floor && isFinite(z.floor.zMin) && isFinite(z.floor.zMax) && +z.floor.zMax > +z.floor.zMin ? { name: String(z.floor.name || 'floor').slice(0, 60), zMin: Math.round(+z.floor.zMin), zMax: Math.round(+z.floor.zMax) } : undefined;
      if (Array.isArray(z.teams)) { const t = [...new Set(z.teams.map(String).filter(Boolean))]; ext.teams = t.length ? t : ['all']; ext.team = ext.teams.length === 1 ? ext.teams[0] : undefined; }
      if (Array.isArray(z.avoidMobs)) { const a = [...new Set(z.avoidMobs.map(s => String(s).trim()).filter(Boolean))].slice(0, 50); ext.avoidMobs = a.length ? a : undefined; }
      if (z.prio && typeof z.prio === 'object') ext.prio = z.prio;
      try { const H = path.join(DATA, 'routes', 'spots_history'); fs.mkdirSync(H, { recursive: true }); if (fs.existsSync(ZFILE)) fs.copyFileSync(ZFILE, path.join(H, `custom_zones_${Date.now()}.json`)); } catch (e) { }
      list.push({ ...prev, name: String(z.name), x: Math.round(x), y: Math.round(y), z: Math.round(+z.z || prev.z || 0), radius,
        levelMin: +z.levelMin || 1, levelMax: +z.levelMax || 85, team: z.team || 'all',
        gkFrom: travel && travel.kind === 'gk' ? travel.desc.split('->')[0].trim() : (z.gkFrom || ''), gkDesc: travel && travel.kind === 'gk' ? travel.desc : (travel ? '' : (z.gkDesc || '')),
        travel, kind: ['mage', 'melee', 'small', 'any'].includes(z.kind) ? z.kind : (prev.kind || 'any'),
        poly: poly.length >= 3 ? poly : undefined, holes: holes.length ? holes : undefined, pulls: pulls.length ? pulls : undefined, zmap: zmap || undefined,
        enabled: z.enabled !== false, note: z.note || prev.note || '', updated: new Date().toISOString(), ...ext });
      fs.writeFileSync(ZFILE, JSON.stringify(list, null, 1));
      return json(res, 200, { ok: true, zones: list });
    }
    if (url.pathname === '/api/zones' && req.method === 'DELETE') {
      const name = url.searchParams.get('name');
      try { const H = path.join(DATA, 'routes', 'spots_history'); fs.mkdirSync(H, { recursive: true }); if (fs.existsSync(ZFILE)) fs.copyFileSync(ZFILE, path.join(H, `custom_zones_${Date.now()}.json`)); } catch (e) { }
      const list = readJson(ZFILE, []).filter(o => o.name !== name);
      fs.writeFileSync(ZFILE, JSON.stringify(list, null, 1));
      return json(res, 200, { ok: true, zones: list });
    }
    // --- full quest plan of a character (written by swarm.js: Logs/questplan_<name>.json) ---
    if (url.pathname === '/api/questplan') {
      const name = String(url.searchParams.get('name') || '').replace(/[^A-Za-z0-9_]/g, '');
      return json(res, 200, readJson(path.join(LOGS, 'questplan_' + name + '.json'), { steps: [] }));
    }
    // --- intent log: what the bot tried to do, with coordinates (Logs/intent_<name>.log) ---
    if (url.pathname === '/api/intent') {
      const name = String(url.searchParams.get('name') || '').replace(/[^A-Za-z0-9_]/g, '');
      const n = Math.min(1500, +url.searchParams.get('n') || 400);
      return json(res, 200, { name, events: parseIntents(tail(path.join(LOGS, 'intent_' + name + '.log'), n)) });
    }
    // --- sell list: item ids the bots sell at every town visit (all bots, or one character) ---
    const SFILE = path.join(DATA, 'sell_list.json');
    if (url.pathname === '/api/sell' && req.method === 'GET') return json(res, 200, readJson(SFILE, { all: [], keep: [] }));
    if (url.pathname === '/api/sell' && req.method === 'POST') {
      const b = await body(req);
      const id = Number(b.id), scope = String(b.scope || 'all');
      if (!id || id === 57) return json(res, 400, { error: 'bad item id' });
      const list = readJson(SFILE, { all: [], keep: [] });
      const key = scope === 'keep' ? 'keep' : scope;
      ['all', 'keep', key].forEach(k => { list[k] = (list[k] || []).filter(x => x !== id); });
      if (b.on) list[key].push(id);
      fs.writeFileSync(SFILE, JSON.stringify(list, null, 1));
      return json(res, 200, { ok: true, list });
    }
    // --- full character view: live status, stats, buffs/debuffs, inventory, skills + what the script is doing ---
    // monsters around a party leader (party map on the Parties tab). Hooked characters are not found by name: retry by config file.
    if (url.pathname === '/api/partymobs') {
      const name = url.searchParams.get('name') || '';
      const list = (t) => { try { const j = JSON.parse(t); return Array.isArray(j) ? j : (j.mobs || []); } catch (e) { return []; } };
      const t = await mcpCallChar('get_account_data', name, { type: 'mobs', range: 12000 }).catch(() => '[]');
      // raid bosses are marked (user 2026-10-05: "show and mark the raid boss on the map"); the leader's current raid target is sent as well,
      // so the map can show where it should be even when nobody sees it (the client only sees monsters within ~3400)
      const db = readJson(path.join(DATA, 'raidbosses_h5.json'), { bosses: [] });
      const bosses = {}; (db.bosses || db || []).forEach(b => { bosses[b.name] = b; });
      const rh = raidHuntOf(name);   // 2026-10-10: this leader's own hunt (was the one shared raidhunt.json)
      const live = (() => { const a = raidLive(name); return a.boss ? a : raidLive(''); })();   // LIVE PER PARTY 2026-10-09: this leader's raid (was the one shared raid_live.json)
      const tname = (rh.active && rh.current && rh.current.name) || (live.boss && live.boss.name) || '';
      const tb = tname && bosses[tname];
      const target = tb && (!rh.leader || rh.leader === name) ? { n: tb.name, lvl: tb.level, x: tb.x, y: tb.y } : null;
      // 2026-10-07 23:34 (user screenshot: 3 crowns "Cat's Eye Bandit" at Abandoned Camp): L2Toggle has ordinary monsters with a raid boss's
      // name (8x "Cat's Eye Bandit" "LvL: 15" there; the raid boss is lvl 30 at 53712,102656). A crown needs the name AND the level (MCP level,
      // else the title "LvL: N"), or - level unknown - a spot within 8000 of the boss spawn.
      const lvlOf = (m) => +m.level || +((String(m.title || '').match(/LvL:\s*(\d+)/i) || [])[1]) || 0;
      const isBoss = (m) => { const b = bosses[m.name]; if (!b) return false; const l = lvlOf(m); if (l) return Math.abs(l - (+b.level || 0)) <= 3; return Math.hypot(m.x - b.x, m.y - b.y) < 8000; };
      return json(res, 200, { target, mobs: list(t).filter(m => !m.is_dead).map(m => ({ x: Math.round(m.x), y: Math.round(m.y), z: Math.round(m.z || 0), lvl: lvlOf(m) || m.level, n: m.name, raid: isBoss(m), hp: m.hp_percent || null })) });
    }
    if (url.pathname === '/api/char') {
      const name = url.searchParams.get('name') || '';
      const list = (t) => { const j = JSON.parse(t); return Array.isArray(j) ? j : (j.npcs || j.mobs || j.items || []); };
      // mcpCallChar: also works for a hooked (in-game) character, which MCP does not find by name (hook-mode audit 2026-10-07)
      const [st, inv, sk, npcs, mobs] = await Promise.all([
        mcpCallChar('get_account_status', name).then(t => JSON.parse(t)).catch(e => ({ error: String(e.message || e) })),
        mcpCallChar('get_account_data', name, { type: 'inventory' }).then(t => JSON.parse(t)).catch(() => ({})),
        mcpCallChar('get_account_data', name, { type: 'skills' }).then(t => JSON.parse(t)).catch(() => ({})),
        // what is around the character (mini-map): NPCs with their titles, and monsters
        mcpCallChar('get_account_data', name, { type: 'npcs', range: 5000 }).then(list).catch(() => []),
        mcpCallChar('get_account_data', name, { type: 'mobs', range: 3500 }).then(list).catch(() => []),
      ]);
      const script = readStates().find(c => c.name === name) || null;
      const c = st.character || {};
      return json(res, 200, {
        // a hooked account reports is_logged_in=false although it is in game: swarm.js' heartbeat (swarm_state, written only while the
        // character is ready) counts as online too
        name, account: st.account_name, online: !!st.is_logged_in || !!(script && script.ageSec < 120), enabled: st.is_enabled, combat: st.is_in_combat, sitting: st.is_sitting,
        party: { inParty: st.is_in_party, leader: st.is_party_leader, follow: st.is_follow_mode }, adena: st.adena, zoneType: st.zone_type,
        char: c, buffs: (c.buffs || []), items: (inv.items || []).map(i => ({ id: i.item_id, objId: i.obj_id, name: i.name, count: i.count, equipped: i.is_equipped,
          type: i.type, grade: i.grade, slot: i.body_part_name, enchant: i.enchant_level, quest: !!i.is_quest || QUEST_ITEMS.has(Number(i.item_id)) })),
        skills: sk ? (sk.skills || sk.items || []) : null, script, error: st.error,
        npcs: npcs.map(n => ({ n: n.name, t: n.title || '', x: Math.round(n.x), y: Math.round(n.y) })),
        mobs: mobs.map(m => ({ n: m.name, x: Math.round(m.x), y: Math.round(m.y), hp: Math.round(m.hp_percent || 0), dead: !!m.is_dead, lvl: m.level })),
      });
    }
    // --- live inventory (straight from the game via MCP) ---
    if (url.pathname === '/api/inventory') {
      const name = url.searchParams.get('name') || '';
      const txt = await mcpCallChar('get_account_data', name, { type: 'inventory' });
      const j = JSON.parse(txt);
      const items = (j.items || []).map(i => ({ id: i.item_id, name: i.name, count: i.count, equipped: i.is_equipped, type: i.type, grade: i.grade,
        slot: i.body_part_name, enchant: i.enchant_level, quest: i.is_quest })).sort((a, b) => (b.equipped - a.equipped) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
      return json(res, 200, { name, items });
    }
    if (url.pathname === '/api/plan') {
      const p = path.normalize(path.join(PLAN, url.searchParams.get('f') || ''));
      if (!p.startsWith(PLAN) || !p.endsWith('.md') || !fs.existsSync(p)) return send(res, 404, 'text/plain', 'not found');
      return send(res, 200, 'text/plain; charset=utf-8', fs.readFileSync(p, 'utf8'));
    }
    if (url.pathname === '/api/log') {
      const name = url.searchParams.get('name') || '';
      const lines = tail(path.join(LOGS, 'swarm_buffs.log'), 6000).filter(l => l.includes(`[${name}]`)).slice(-250);
      return json(res, 200, { name, lines });
    }
    if (url.pathname === '/api/command' && req.method === 'POST') {
      // command center 2026-10-08 (see commandPlan / commandRun above): one or many targets, '!' swarm / '/' L2Swarm / '@' account
      // commands, destructive ones need confirmDanger, dryRun returns the plan. Old callers ({ text | cmd, target }) work unchanged:
      // a solo character (no party) gets the order as normal chat, a hooked one is reached through its config file (mcpCallChar).
      const r = await commandRun(await body(req));
      return json(res, r.code || 200, r.body);
    }
    // the command catalog + who is who (command center): the page itself loads /commands.js; this tells it the server is new enough
    if (url.pathname === '/api/commands') {
      const chars = readStates(), cl = clanOf(chars);
      return json(res, 200, { version: 1, allowed: ALLOWED, bot: CMDS.BOT_WORDS, cats: CMDS.CATS,
        commands: CMDS.COMMANDS.map(c => ({ ...c, re: c.re ? String(c.re) : undefined })),
        parties: [...new Set(chars.map(partyOf))].map(p => ({ leader: p, members: chars.filter(c => partyOf(c) === p).map(c => c.name) })),
        clan: cl, mainLeader: MAIN_LEADER, clanLeader: SC.clanLeader || '', mainConfig: (() => { try { const a = (SC.accounts || []).find(x => x && (x.character === MAIN_LEADER || x.name === MAIN_LEADER)); return a ? path.basename(String(a.config || a.configFile || '')) : ''; } catch (e) { return ''; } })() });
    }
    if (url.pathname === '/api/chars') {
      const idx = charIndex();
      return json(res, 200, { chars: Object.values(idx).sort((a, b) => a.login.localeCompare(b.login) || a.name.localeCompare(b.name)) });
    }
    if (url.pathname === '/api/transfer' && req.method === 'POST') {
      const b = await body(req);
      if (!b.from || !b.to || String(b.from).toLowerCase() === String(b.to).toLowerCase()) return json(res, 400, { error: 'from and to (two different characters) are needed' });
      if (TRANSFER.job && TRANSFER.job.running) return json(res, 409, { error: 'a transfer is already running', job: TRANSFER.job });
      TRANSFER.job = { from: b.from, to: b.to, what: b.what === 'adena' ? 'adena' : 'all', running: true, started: new Date().toISOString(), log: [], result: null };
      transferRun(TRANSFER.job).catch(() => { });
      return json(res, 200, { ok: true, job: TRANSFER.job });
    }
    if (url.pathname === '/api/transfer') return json(res, 200, { job: TRANSFER.job });
    if (url.pathname === '/api/newchar' && req.method === 'POST') {
      const b = await body(req);
      if (!/^[a-z][a-z0-9]{2,15}$/i.test(b.login || '')) return json(res, 400, { error: 'login: 3-16 letters/digits, starting with a letter' });   // 2026-10-07: 2nd master account (mylogin21, mylogin29, mylogin39)
      const r = await createCharacter(b);
      return json(res, 200, { ok: true, ...r });
    }
    send(res, 404, 'text/plain', 'not found');
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, '0.0.0.0', () => console.log(`dashboard on http://127.0.0.1:${PORT} (LAN needs ?key=)`));
