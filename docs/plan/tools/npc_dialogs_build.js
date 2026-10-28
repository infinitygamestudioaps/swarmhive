// NPC DIALOGS BUILDER (2026-10-27, owner "of extreme importance": "make sure that you gather ALL data from the npcs, you SHOULD be able to see what
// their answers and questions will be"). Live test of 10 quests failed on dialogues: Darin (Q1) first asks "Tell him you don't know her." /
// "...do know her." but the quest records only kept the LAST link ("Say yes."); Gauen (Q356) opens with "What can we do?".
//
// Writes (format: docs/plan/npc_dialogs.md):
//   Scripts/data/npc_dialogs/<npcId>.json   every NPC's pages: first talk, every reachable page, every link (text, bypass, target, effect)
//   Scripts/data/npc_dialogs/_index.json    id -> name / pages / live; _report.json = coverage + live-vs-datapack differences
//   Scripts/data/quest_dialogs.json         per quest + quest plan step key: the chain of link texts from the first page to the effect
// Reads only: the L2J H5 datapack (C:\RainbowControl\l2\datapack_h5\dp; missing html / ai folders come from its git HEAD through
// `git archive` into %TEMP%, the clone is never changed), Scripts/data/{npc_strings,npcs_h5,npc_atlas}.json, Scripts/data/quests/*.json,
// Scripts/data/quest_plans/*.json, Scripts/data/gk_live/*.json and the live pages in Logs/ (+ Logs/dialog.log).
// Never writes the quest records or plans (their manual: true hand fixes stay untouched) -> no Logs/quest_build.lock needed.
//
// Run: node docs/plan/tools/npc_dialogs_build.js [--dp <datapack root>] [--quiet]
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const L = require('./npc_dialogs_lib.js');
const QX = require('./quest_extract.js');
const { ROOT, DATA, rd, htmlText, pageBody, pageLinks, pageHeader, norm, words, jaccard, short, classifyBypass, questListTexts } = L;
const LOGS = path.join(ROOT, 'Logs');
const QUIET = process.argv.includes('--quiet');
const log = (...a) => { if (!QUIET) console.log(...a); };
const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

// ------------------------------------------------------------------------------------------------------------------------------
// datapack files
function findDp() {
  const c = [argOf('--dp'), process.env.L2J_DP, path.join(ROOT, '..', 'datapack_h5', 'dp')].filter(Boolean);
  for (const d of c) if (fs.existsSync(path.join(d, 'src/main/java/com/l2jserver/datapack/quests'))) return d;
  throw new Error('datapack not found (pass --dp <root>)');
}
const DP = findDp();
const REL = { html: 'src/main/resources/data/html', ai: 'src/main/java/com/l2jserver/datapack/ai', quests: 'src/main/java/com/l2jserver/datapack/quests' };
function dpDir(key) {
  const p = path.join(DP, REL[key]);
  if (fs.existsSync(p) && fs.readdirSync(p).length) return p;
  // sparse working tree: read the folder from git HEAD (read-only: git archive -> %TEMP%)
  let head = 'HEAD'; try { head = cp.execFileSync('git', ['-C', DP, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (e) { }
  const cache = path.join(os.tmpdir(), 'l2_npc_dialogs_dp', head);
  const out = path.join(cache, REL[key]);
  if (!fs.existsSync(out)) {
    fs.mkdirSync(cache, { recursive: true });
    const tar = path.join(cache, key + '.tar');
    cp.execFileSync('git', ['-C', DP, 'archive', '-o', tar, 'HEAD', REL[key]], { stdio: 'ignore', windowsHide: true });
    cp.execFileSync('tar', ['-xf', tar, '-C', cache], { stdio: 'ignore', windowsHide: true });
    try { fs.unlinkSync(tar); } catch (e) { }
  }
  return out;
}
const HTML_DIR = dpDir('html'), AI_DIR = dpDir('ai'), Q_DIR = dpDir('quests');
const listFiles = (dir, re, acc = []) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) listFiles(p, re, acc); else if (re.test(f.name)) acc.push(p); } return acc; };
const readHtml = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');

// ------------------------------------------------------------------------------------------------------------------------------
// reference data
const NPCS = rd(path.join(DATA, 'npcs_h5.json'), {});
const ATLAS = rd(path.join(DATA, 'npc_atlas.json'), { npcs: {} });
const atlasList = Array.isArray(ATLAS.npcs) ? ATLAS.npcs : Object.values(ATLAS.npcs || {});
const QREC = {}; for (const f of fs.readdirSync(path.join(DATA, 'quests'))) if (/^\d+\.json$/.test(f)) { const q = rd(path.join(DATA, 'quests', f), null); if (q && q.id) QREC[q.id] = q; }
const QPLAN = {}; for (const f of fs.readdirSync(path.join(DATA, 'quest_plans'))) if (/^\d+\.json$/.test(f)) { const q = rd(path.join(DATA, 'quest_plans', f), null); if (q && q.id) QPLAN[q.id] = q; }
const npcName = (id) => (NPCS[id] && NPCS[id].n) || (atlasList.find(a => a.id === id) || {}).name || ('NPC ' + id);
const npcType = (id) => (NPCS[id] && NPCS[id].ty) || '';
const isMob = (id) => /Monster|RaidBoss|GrandBoss|Pet|Servitor|Chest|Minion|Decoy|Beast|Invader|Defender|Commander|FestivalMonster|SepulcherMonster|FriendlyMob|EffectPoint|Artefact|Door|Tamed|Trap|Ward|FlameTower|TerrainObject/.test(npcType(id));
const TYPE_DIR = { L2Merchant: 'merchant', L2Teleporter: 'teleporter', L2DungeonGatekeeper: 'teleporter', L2Warehouse: 'warehouse', L2Trainer: 'trainer', L2Guard: 'guard',
  L2Adventurer: 'adventurer_guildsman', L2PetManager: 'petmanager', L2OlympiadManager: 'olympiad', L2DawnPriest: 'seven_signs', L2DuskPriest: 'seven_signs', L2SignsPriest: 'seven_signs',
  L2FestivalGuide: 'seven_signs/festival', L2Observation: 'observation', L2ClanHallManager: 'clanHallManager', L2ClanHallDoormen: 'clanHallDoormen', L2CastleDoormen: 'doormen',
  L2FortDoormen: 'doormen', L2Auctioneer: 'auction', L2SepulcherNpc: 'SepulcherNpc', L2FortManager: 'fortress', L2FortLogistics: 'fortress', L2QuestGuard: 'guard' };
const typeDir = (id) => { const t = npcType(id); if (/^L2VillageMaster/.test(t)) return 'villagemaster'; return TYPE_DIR[t] || 'default'; };

// ------------------------------------------------------------------------------------------------------------------------------
// PAGES: pageId -> { id, file, html, text, header, links[], quest, script, npc }
const PAGES = new Map();
function addPage(id, abs, extra) {
  if (PAGES.has(id)) return PAGES.get(id);
  const html = readHtml(abs);
  const p = Object.assign({ id, file: id, html, header: pageHeader(html), text: pageBody(html), links: pageLinks(html) }, extra || {});
  PAGES.set(id, p); return p;
}
// default NPC pages
const htmlByNpc = new Map();   // npcId -> [pageId]
for (const abs of listFiles(HTML_DIR, /\.html?$/i)) {
  const id = path.relative(HTML_DIR, abs).replace(/\\/g, '/');
  addPage(id, abs, { kind: 'default' });
  const m = /(?:^|\/)(\d{4,6})(?:-[\w]+)?\.html?$/.exec(id);
  if (m && !/^(admin|help|CommunityBoard|mods)\//.test(id)) { const n = +m[1]; if (!htmlByNpc.has(n)) htmlByNpc.set(n, []); htmlByNpc.get(n).push(id); }
}
log('default pages', PAGES.size);

// ------------------------------------------------------------------------------------------------------------------------------
// scripts (quests + AI): html facts -> who shows which page when
const SCRIPTS = new Map();   // script name -> { name, qid, dir, prefix, files{}, events: Map(event -> [{page, when}]), talk: [], first: [], eventLike: bool }
const refusalWord = /only characters|cannot|can't|not (yet )?(qualified|eligible|ready|strong)|too (weak|young|low)|come back (when|later)|you are not|you're not|must be (at least|level)|level \d+ (and|or) (above|higher)|not suitable|have no business|no quests|don't have/i;
function describeR(R) {
  const w = [];
  if (R.states.size) w.push('state ' + [...R.states].map(s => String(s).replace(/^State\./, '')).join('|'));
  if (R.conds.size) w.push('cond ' + [...R.conds].join('|'));
  if (R.condRanges.length) w.push('cond ' + R.condRanges.join(' '));
  if (R.memos.size) w.push('memo ' + [...R.memos].join('|'));
  for (const l of R.level) w.push((l.neg ? 'NOT ' : '') + 'level ' + l.op + ' ' + (typeof l.v === 'number' ? l.v : l.name));
  if (R.items.length) w.push('has items ' + [...new Set(R.items)].join(','));
  if (R.notItems.length) w.push('lacks items ' + [...new Set(R.notItems)].join(','));
  for (const c of R.itemCounts) w.push('item ' + c.id + ' >= ' + c.n);
  for (const r of R.raw.slice(0, 4)) w.push(String(r).replace(/\s+/g, ' ').slice(0, 120));
  if (R.chance !== null) w.push('chance ' + R.chance + '%');
  return w;
}
const levelLowOf = (R, tern) => R.level.some(l => (!l.neg && /^</.test(l.op)) || (l.neg && /^>/.test(l.op))) ||
  (tern || []).some(t => { const m = /getLevel\(\)\s*(>=|>|<=|<)/.exec(t.c); return m && ((t.pos && /^</.test(m[1])) || (!t.pos && /^>/.test(m[1]))); });
const raceClassOf = (R, tern) => R.raw.concat((tern || []).map(t => (t.pos ? '' : '!') + t.c)).some(r => /getRace\(\)|getClassId\(\)|isInCategory|getClassLevel|isSubClassActive|isNoble|getSex/.test(r));
const raceClassBad = (R, tern) => R.raw.some(r => /^!/.test(r) && /getRace|getClassId|isInCategory|isNoble/.test(r)) || /(!=)/.test(R.raw.filter(r => /getRace|getClassId/.test(r)).join(' ')) ||
  (tern || []).some(t => /getRace|getClassId|isInCategory|getClassLevel/.test(t.c) && ((!t.pos && !/!=/.test(t.c)) || (t.pos && /!=/.test(t.c))));

let SAGA_SRC = null;
function splitTopLevel(s) {   // a,b,"x, y",new Location(1, 2) -> top-level items (string / bracket aware)
  const out = []; let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") { let j = i + 1; while (j < s.length && s[j] !== c) { if (s[j] === '\\') j++; j++; } cur += s.slice(i, j + 1); i = j; continue; }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    if (!d && c === ',') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function sagaSource(sub) {   // same substitution as quest_extract.js sagaSource()
  if (!SAGA_SRC) SAGA_SRC = QX.stripComments(fs.readFileSync(path.join(Q_DIR, 'AbstractSagaQuest.java'), 'utf8'));
  const s = QX.stripComments(sub); const arr = {};
  const re = /(_\w+)\s*=\s*new\s+[\w.]+\s*\[\s*\]\s*\{/g; let m;
  while ((m = re.exec(s))) {
    const o = s.indexOf('{', m.index + m[0].length - 1); let d = 0, e = o;
    for (let j = o; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (!d) { e = j; break; } } }
    arr[m[1]] = splitTopLevel(s.slice(o + 1, e));
  }
  let a = SAGA_SRC;
  for (const [k, L] of Object.entries(arr)) {
    a = a.replace(new RegExp(k.replace(/[$]/g, '\\$') + '\\s*\\[\\s*(\\d+)\\s*\\]', 'g'), (m0, i) => L[+i] !== undefined ? L[+i] : m0);
    a = a.replace(new RegExp('\\b' + k + '\\b(?!\\s*\\[)', 'g'), 'new int[] {' + L.join(', ') + '}');
  }
  return { src: a, arr };
}
function parseScript(name, javaAbs, htmlFiles, prefix, qid) {
  const S = { name, qid, prefix, files: {}, events: new Map(), talk: [], first: [], warnings: [] };
  for (const [f, abs] of Object.entries(htmlFiles)) { const id = prefix + f; addPage(id, abs, { kind: qid ? 'quest' : 'ai', quest: qid || null, script: name }); S.files[f] = id; }
  let src = ''; try { src = fs.readFileSync(javaAbs, 'utf8'); } catch (e) { }
  // saga quests (AbstractSagaQuest): the template source with this saga's _npc / _items / _mob arrays substituted; page "<i>-NN.htm" = _npc[i]
  if (/extends\s+AbstractSagaQuest/.test(src)) { const sg = sagaSource(src); src = sg.src; S.saga = sg.arr._npc ? sg.arr._npc.map(x => +x) : null;
    if (S.saga) S.sagaFiles = Object.keys(S.files).map(f => [f, S.saga[+((/^(\d+)-/.exec(f) || [])[1])]]).filter(x => x[1]); }
  let parsed = null; try { parsed = QX.parseQuest(src, {}); } catch (e) { S.warnings.push('parse: ' + e.message); }
  const known = (f) => S.files[f];
  const evAlias = new Set(); { const re = /(\w+)\s*=\s*(?:Integer\.parseInt|Integer\.valueOf|Long\.parseLong)\(\s*event\s*\)/g; let m; while ((m = re.exec(src))) evAlias.add(m[1]); }
  if (parsed) for (const fact of parsed.facts) {
    if (fact.t !== 'html') continue;
    let R; try { R = QX.interp(parsed.env, fact); } catch (e) { continue; }
    // switch (Integer.parseInt(event)) { case 1: ... } -> numeric events (Q334, Q336 ...)
    for (const raw of R.raw) { const m = /^switch\((?:(?:Integer\.parseInt|Integer\.valueOf|Long\.parseLong)\(\s*event\s*\)|(\w+))\) case (.+)$/.exec(String(raw)); if (m && (!m[1] || evAlias.has(m[1]))) m[2].split(',').map(x => x.trim()).filter(x => x && x !== 'default').forEach(x => R.events.add(x)); }
    let files = [fact.file];
    if (/^-/.test(fact.file)) { const ids = R.npcs.size ? [...R.npcs] : Object.keys(S.files).map(f => +((/^(\d+)-/.exec(f) || [])[1])).filter(Boolean); files = [...new Set(ids.map(n => n + fact.file))]; }
    // ternaries: htmltext = cond ? "a" : "b"
    let tern = null; const full = fact.full || fact.stmt || '';
    if (/\?/.test(full)) { const rhs = (/(?:htmltext|html|text|htm)\s*=\s*([\s\S]+)$/.exec(full) || /^return\s+([\s\S]+)$/.exec(full) || [])[1]; if (rhs) { try { tern = QX.ternaryPaths(rhs, (leaf) => leaf.indexOf('"' + fact.file + '"') >= 0)[0] || null; } catch (e) { } } }
    const when = describeR(R).concat((tern || []).map(t => (t.pos ? '' : 'NOT ') + t.c.replace(/\s+/g, ' ').slice(0, 100)));
    const rec = { npcs: [...R.npcs].filter(n => typeof n === 'number'), events: [...R.events].map(String), states: [...R.states].map(s => String(s).replace(/^State\./, '')), conds: [...R.conds], memos: [...R.memos],
      condRanges: R.condRanges, when, levelLow: levelLowOf(R, tern), raceCond: raceClassOf(R, tern), method: fact.method };
    for (const f of files) {
      if (!known(f)) continue;
      const r = Object.assign({ page: known(f) }, rec);
      // a race / class branch is a refusal only when its page is a dead end (which side of != is the right race is not known)
      r.raceBad = !!r.raceCond && !PAGES.get(r.page).links.some(l => !/^(back|close|quit|return|cancel)/i.test(l.text));
      if (!r.npcs.length) { const m = /^(\d{4,6})[-.]/.exec(f); if (m) r.npcs = [+m[1]]; else if (S.saga) { const k = /^(\d+)-/.exec(f); if (k && S.saga[+k[1]]) r.npcs = [S.saga[+k[1]]]; } }
      if (/^onAdvEvent$|^onEvent$|^onBypass/.test(fact.method)) for (const e of (r.events.length ? r.events : [])) { if (!S.events.has(e)) S.events.set(e, []); S.events.get(e).push(r); }
      else if (/^onTalk$/.test(fact.method)) S.talk.push(r);
      else if (/^onFirstTalk$/.test(fact.method)) S.first.push(r);
    }
  }
  // "htmltext = event": a link event that is a page file of this script shows that page
  const echoes = /htmltext\s*=\s*event\s*;|return\s+event\s*;|html\s*=\s*event\s*;/.test(src);
  S.echo = echoes;
  // an event named like a page of this script shows that page (L2J "htmltext = event"); the explicit pages of that event stay as alternatives
  for (const f of Object.keys(S.files)) {
    const own = { page: S.files[f], assumed: true, when: [], npcs: [], states: [], conds: [], memos: [], condRanges: [] };
    if (!S.events.has(f)) S.events.set(f, [own]);
    else if (echoes && !S.events.get(f).some(r => r.page === own.page)) S.events.get(f).unshift(own);
  }
  SCRIPTS.set(name, S);
  return S;
}
// quests
for (const dir of fs.readdirSync(Q_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue; const m = /^Q(\d{5})_/.exec(dir.name); if (!m) continue;
  const d = path.join(Q_DIR, dir.name); const files = fs.readdirSync(d);
  const java = files.find(f => f === dir.name + '.java') || files.find(f => f.endsWith('.java')); if (!java) continue;
  const htmls = {}; for (const f of files) if (/\.html?$/i.test(f)) htmls[f] = path.join(d, f);
  parseScript(dir.name, path.join(d, java), htmls, dir.name + '/', +m[1]);
}
log('quest scripts', SCRIPTS.size);
// AI scripts (each java file is a script; its htmls are the files of its folder)
for (const java of listFiles(AI_DIR, /\.java$/)) {
  const d = path.dirname(java); const rel = 'ai/' + path.relative(AI_DIR, d).replace(/\\/g, '/') + '/';
  const htmls = {}; for (const f of fs.readdirSync(d)) if (/\.html?$/i.test(f)) htmls[f] = path.join(d, f);
  const name = path.basename(java, '.java');
  if (!Object.keys(htmls).length && !/addFirstTalkId|addTalkId/.test(fs.readFileSync(java, 'utf8'))) continue;
  parseScript(name, java, htmls, rel, 0);
}
log('scripts incl. AI', SCRIPTS.size, 'pages', PAGES.size);

// quest effects: event -> 'start' | 'cond:N' | 'reward' | 'end' (from the quest records' transitions)
const EFFECT = new Map();   // qid -> Map(event -> [effect])
for (const q of Object.values(QREC)) {
  const M = new Map(); EFFECT.set(q.id, M);
  for (const t of q.transitions || []) {
    if (!t.trigger || !/event|firstTalk/.test(t.trigger.type)) continue;
    const eff = t.start ? 'start' : t.end ? ((t.adena || t.exp || (t.gives || []).length) ? 'reward' : 'end') : (t.to != null ? 'cond:' + t.to : null);
    if (!eff) continue;
    for (const e of t.trigger.events || []) { if (!M.has(e)) M.set(e, []); if (!M.get(e).includes(eff)) M.get(e).push(eff); }
  }
}
// indices
const TALK_BY_NPC = new Map(), FIRST_BY_NPC = new Map(), FILES_BY_NPC = new Map(), FACTS_BY_PAGE = new Map();
const madd = (M, k, v) => { if (!M.has(k)) M.set(k, []); M.get(k).push(v); };
for (const S of SCRIPTS.values()) {
  for (const r of S.talk) { r.npcs.forEach(n => madd(TALK_BY_NPC, n, { S, r })); madd(FACTS_BY_PAGE, r.page, { S, r }); }
  for (const r of S.first) { r.npcs.forEach(n => madd(FIRST_BY_NPC, n, { S, r })); madd(FACTS_BY_PAGE, r.page, { S, r }); }
  for (const [f, id] of Object.entries(S.files)) { const m = /^(\d{4,6})[-.]/.exec(f); if (m) madd(FILES_BY_NPC, +m[1], id); }
  for (const [f, n] of S.sagaFiles || []) madd(FILES_BY_NPC, n, S.files[f]);
}
const scriptOfQuest = new Map(); for (const S of SCRIPTS.values()) if (S.qid) scriptOfQuest.set(S.qid, S);
// quests registered at an npc (start / talk)
const questsAt = new Map();
for (const q of Object.values(QREC)) { const ids = new Set([...(q.registered && q.registered.start || []), ...(q.registered && q.registered.talk || [])]); for (const n of ids) { if (!questsAt.has(n)) questsAt.set(n, []); questsAt.get(n).push(q.id); } }

// ------------------------------------------------------------------------------------------------------------------------------
// link resolution
function resolveLink(l, page, npcId) {
  const c = classifyBypass(l.bypass, l.mode);
  const o = { text: l.text, bypass: l.bypass, kind: c.kind };
  if (l.msg) o.confirm = l.msg;
  if (c.kind === 'page') {
    let to = c.to || null;
    if (c.chat !== undefined) {
      const dirs = [typeDir(npcId), (page.id.match(/^(.*)\//) || [])[1], 'default'].filter(Boolean);
      for (const d of dirs) { const cand = c.chat === 0 ? [d + '/' + npcId + '.htm', d + '/' + npcId + '.html'] : [d + '/' + npcId + '-' + c.chat + '.htm', d + '/' + npcId + '-' + c.chat + '.html']; const hit = cand.find(x => PAGES.has(x)); if (hit) { to = hit; break; } }
    }
    if (to && !PAGES.has(to)) { const alt = to.replace(/\.htm$/, '.html'); to = PAGES.has(alt) ? alt : (PAGES.has(to.replace(/\.html$/, '.htm')) ? to.replace(/\.html$/, '.htm') : to); }
    o.to = to && PAGES.has(to) ? to : null; if (!o.to && to) o.missing = to;
  } else if (c.kind === 'quest-menu') o.to = '@questlist';
  else if (c.kind === 'quest-event' || c.kind === 'quest') {
    const S = SCRIPTS.get(c.script);
    o.script = c.script; if (c.event) o.event = c.event;
    if (S) {
      if (S.qid) o.quest = S.qid;
      if (c.kind === 'quest-event') {
        const hits = (S.events.get(c.event) || []).filter(r => !r.npcs.length || r.npcs.includes(npcId) || !npcId);
        const pages = [...new Set(hits.filter(r => !r.levelLow && !r.raceBad).map(r => r.page))];
        const all = [...new Set(hits.map(r => r.page))];
        o.to = pages[0] || all[0] || null; if (all.length > 1) o.toAll = all;
        if (S.qid) { const eff = (EFFECT.get(S.qid) || new Map()).get(c.event); if (eff) o.effect = eff.join('|'); }
      } else {
        const t = S.talk.filter(r => r.npcs.includes(npcId)); const cr = t.filter(r => r.states.includes('CREATED') && !r.levelLow && !r.raceBad);
        o.to = (cr[0] || t[0] || {}).page || null;
      }
    }
  }
  return o;
}

// ------------------------------------------------------------------------------------------------------------------------------
// LIVE: pages captured on L2Toggle
const live = { pages: [], board: [], dlg: new Map(), gk: [], byChar: {} };   // byChar: char -> [{ t, npc }] (dialog.log, for page context)
const BOARD_RE = /^(career|cabinet|bbs)/i;
for (const f of fs.readdirSync(LOGS)) {
  if (!/\.html?$/i.test(f)) continue;
  const abs = path.join(LOGS, f); let html; try { html = readHtml(abs); } catch (e) { continue; }
  if (!/<html/i.test(html)) continue;
  const at = fs.statSync(abs).mtime.toISOString();
  if (BOARD_RE.test(f)) { live.board.push({ file: f, at, title: (/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || '', links: pageLinks(html).map(l => l.text).filter(Boolean) }); continue; }
  live.pages.push({ file: 'Logs/' + f, at, html, header: pageHeader(html), text: pageBody(html), links: pageLinks(html) });
}
// dialog.log: opened / clicked lines -> per npc name: page snippets + the links clicked from them
function snipNorm(s) { return String(s || '').replace(/^[^:]{0,60}:/, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
try {
  const txt = fs.readFileSync(path.join(LOGS, 'dialog.log'), 'utf8');
  const last = {};
  const reO = /^(\S+) (\S+): opened (.+?) \([^)]*\) -> (?:quest )?page '([\s\S]*?)' after/;
  const reC = /^(\S+) (\S+): clicked '([\s\S]*?)' at (.+?) -> (?:(?:quest )?page '([\s\S]*?)'|teleport to ([-\d,]+)|([^']*?)) after/;
  for (const line of txt.split(/\r?\n/)) {
    let m;
    if ((m = reO.exec(line)) || (m = reC.exec(line))) { const nm = m[0].indexOf(': opened ') > 0 ? m[3] : m[4]; if (!/Community Board/.test(nm)) (live.byChar[m[2]] = live.byChar[m[2]] || []).push({ t: Date.parse(m[1]), npc: nm }); }
    if ((m = reO.exec(line))) { if (/Community Board/.test(m[3])) continue; last[m[2]] = { npc: m[3], snip: m[4] }; const D = dlgOf(m[3]); D.pages.add(m[4]); D.n++; continue; }
    if ((m = reC.exec(line))) {
      if (/Community Board/.test(m[4])) continue;
      const D = dlgOf(m[4]); const from = last[m[2]] && last[m[2]].npc === m[4] ? last[m[2]].snip : '';
      const k = m[3]; if (!D.clicks.has(k)) D.clicks.set(k, { n: 0, from: new Set(), to: new Set() });
      const c = D.clicks.get(k); c.n++; if (from) c.from.add(from); if (m[5]) { c.to.add(m[5]); D.pages.add(m[5]); last[m[2]] = { npc: m[4], snip: m[5] }; } else if (m[6]) c.to.add('teleport'); D.n++;
    }
  }
} catch (e) { log('dialog.log not read:', e.message); }
function dlgOf(name) { if (!live.dlg.has(name)) live.dlg.set(name, { name, pages: new Set(), clicks: new Map(), n: 0 }); return live.dlg.get(name); }
// gatekeeper live menus
const gkDir = path.join(DATA, 'gk_live');
if (fs.existsSync(gkDir)) for (const f of fs.readdirSync(gkDir)) { if (!/\.json$/.test(f) || /^_/.test(f)) continue; const g = rd(path.join(gkDir, f), null); if (g && g.pages) live.gk.push(Object.assign({ file: 'Scripts/data/gk_live/' + f }, g)); }
const floorLive = rd(path.join(LOGS, 'floor_links_live.json'), {});

// npc name -> ids (talkable NPCs)
const idsByName = new Map();
for (const [id, n] of Object.entries(NPCS)) { if (!n || !n.n) continue; const k = n.n.toLowerCase(); if (!idsByName.has(k)) idsByName.set(k, []); idsByName.get(k).push(+id); }
const talkIdsByName = (name) => (idsByName.get(String(name || '').toLowerCase()) || []).filter(id => !isMob(id));

// ------------------------------------------------------------------------------------------------------------------------------
// NPC trees
const NPC_TREE = new Map();   // npcId -> { firstTalk[], pages: Set }
const allNpcIds = new Set();
for (const n of htmlByNpc.keys()) allNpcIds.add(n);
for (const S of SCRIPTS.values()) { for (const r of S.talk.concat(S.first)) r.npcs.forEach(n => allNpcIds.add(n)); for (const f of Object.keys(S.files)) { const m = /^(\d{4,6})[-.]/.exec(f); if (m) allNpcIds.add(+m[1]); } }
for (const n of questsAt.keys()) allNpcIds.add(n);
for (const a of atlasList) if (a && a.id && !(a.roles || []).every(r => r === 'guard')) allNpcIds.add(a.id);
for (const id of [...allNpcIds]) if (!NPCS[id] || isMob(id) && !questsAt.has(id)) { if (!NPCS[id] && !htmlByNpc.has(id)) allNpcIds.delete(id); }

// KARMA PAGE (2026-10-27): "<id>-pk.htm" is the karma variant of the first page (Fisherman.java: karma > 0 -> npc.getId() + "-pk.htm", else
// npc.getId() + ".htm"; the extractor sees only the literal "-pk.htm"). The normal page = the same file without "-pk", put FIRST; the karma
// page stays as an alternative (variant: 'karma'). 23 NPCs (all Fishermen) had only the -pk page -> 22 quest chains clicked "Quest" there.
const isKarmaFirst = (f) => /-pk\.html?$/i.test(f.page || '') || /getKarma\(\)\s*>\s*0/.test(f.when || '');
function normalFirst(first, npcId) {
  for (const f of first.slice()) {
    if (!isKarmaFirst(f) || !f.page) continue;
    f.variant = 'karma';
    const base = f.page.replace(/-pk(\.html?)$/i, '$1');
    const normal = [base, base.replace(/\.htm$/i, '.html'), base.replace(/\.html$/i, '.htm')].find(x => x !== f.page && PAGES.has(x));
    if (normal && !first.some(x => x.page === normal)) first.push({ page: normal, when: 'normal (no karma)' + (f.when ? '; NOT ' + f.when : ''), src: f.src });
  }
  const norm0 = first.filter(f => f.variant !== 'karma'), karma = first.filter(f => f.variant === 'karma');
  first.length = 0; first.push(...norm0, ...karma);
  return first;
}
function npcTree(npcId) {
  const first = [];
  for (const { S, r } of FIRST_BY_NPC.get(npcId) || []) first.push({ page: r.page, when: r.when.join('; '), src: S.qid ? 'quest ' + S.qid : 'ai ' + S.name });
  const dir = typeDir(npcId);
  const own = (htmlByNpc.get(npcId) || []);
  const def = [dir + '/' + npcId + '.htm', dir + '/' + npcId + '.html', 'default/' + npcId + '.htm', 'default/' + npcId + '.html'].find(x => PAGES.has(x)) || own.find(x => new RegExp('/' + npcId + '\\.html?$').test(x));
  if (def) first.push({ page: def, when: first.length ? 'when no script answers the first talk' : '', src: 'html/' + def.split('/')[0] });
  if (!first.length) first.push({ page: PAGES.has('npcdefault.htm') ? 'npcdefault.htm' : null, when: 'no page of its own', src: 'html' });
  normalFirst(first, npcId);
  const pages = new Map(); const queue = [];
  const push = (id) => { if (id && !pages.has(id) && (PAGES.has(id) || id === '@questlist')) { pages.set(id, null); queue.push(id); } };
  first.forEach(f => push(f.page)); own.forEach(push);
  // quest + ai pages of this npc
  for (const { r } of (TALK_BY_NPC.get(npcId) || []).concat(FIRST_BY_NPC.get(npcId) || [])) push(r.page);
  for (const id of FILES_BY_NPC.get(npcId) || []) push(id);
  if ((questsAt.get(npcId) || []).length) push('@questlist');
  while (queue.length) {
    const id = queue.shift();
    if (id === '@questlist') { pages.set(id, questListPage(npcId)); for (const l of pages.get(id).links) push(l.to); continue; }
    const P = PAGES.get(id);
    const links = P.links.map(l => resolveLink(l, P, npcId));
    pages.set(id, { P, links });
    for (const l of links) { push(l.to); (l.toAll || []).forEach(push); }
    if (pages.size > 600) break;
  }
  return { first, pages };
}
function questListPage(npcId) {
  const links = [];
  for (const qid of questsAt.get(npcId) || []) {
    const S = scriptOfQuest.get(qid); const q = QREC[qid]; const t = questListTexts(qid, q && q.name);
    const talk = S ? S.talk.filter(r => r.npcs.includes(npcId)) : [];
    const cr = talk.filter(r => r.states.includes('CREATED') && !r.levelLow && !r.raceBad); const st = talk.filter(r => !r.states.includes('CREATED') && !r.states.includes('COMPLETED'));
    const starts = q && (q.registered && q.registered.start || []).includes(npcId);
    if (starts) links.push({ text: '[' + t.start + ']', bypass: 'npc_%objectId%_Quest ' + (S ? S.name : 'Q' + qid), kind: 'quest', quest: qid, to: (cr[0] || talk[0] || {}).page || null, when: 'quest not started' });
    links.push({ text: '[' + t.progress + ']', bypass: 'npc_%objectId%_Quest ' + (S ? S.name : 'Q' + qid), kind: 'quest', quest: qid, to: (st[0] || talk[0] || {}).page || null, when: 'quest in progress' });
  }
  return { P: { id: '@questlist', file: '@questlist', header: '', text: 'Quest list window (the server lists the quests this NPC has for you; shown only when there is more than one).', links: [] }, links, synthetic: true };
}

// ------------------------------------------------------------------------------------------------------------------------------
// LIVE MATCH: live page -> datapack page of the same NPC
const liveByPage = new Map();
const liveOnlyByNpc = new Map();   // npcId -> live pages with no datapack match (server custom)
const headerIds = (h) => { const w = String(h || '').trim().split(/\s+/); for (let i = 0; i < w.length; i++) { const ids = talkIdsByName(w.slice(i).join(' ')); if (ids.length) return ids; } return []; };   // pageId -> [{ file, at, text, links[] }]
const unmatchedLive = [];
const dpWords = new Map(); for (const [id, P] of PAGES) dpWords.set(id, words(P.text));
const lastWord = (h) => String(h || '').trim().split(/\s+/).pop().toLowerCase();
const byHeaderWord = new Map(); for (const [id, P] of PAGES) { const k = lastWord(P.header); if (!k) continue; if (!byHeaderWord.has(k)) byHeaderWord.set(k, []); byHeaderWord.get(k).push(id); }
// TELEPORT LISTS (2026-10-27): a gatekeeper's destination list ("&$556;" + "Town of Oren - 9400" links) has no NPC name, so the text match
// above never found its gatekeeper (22 live lists unmatched). Who showed it: 1) the file name (npclive_<Npc>_<hash>.html / npcmap_<Npc>_<n>.html),
// 2) dialog.log: the NPC that character opened / clicked just before the file was written (Logs/npc_<Char>.html, within 2 min),
// 3) the live gatekeeper menus (Scripts/data/gk_live): the gatekeeper whose saved list shares the most destinations. Then the page of that
// gatekeeper with the most destinations in common (teleporter/<id>-1.htm, free/, half/ ...) gets the live page.
const tpDest = (t) => norm(String(t || '').replace(/\s*&#57;\s*/g, ' ').replace(/\s+-\s+\d[\d,]*(?:\s+\D[^-]*)?\s*$/, '').trim());
function isTpList(lp) {
  const ls = lp.links.filter(l => l.text); if (ls.length < 2) return false;
  const priced = ls.filter(l => /\s-\s+\d[\d,]*\s*(adena)?\s*$/i.test(l.text.replace(/&#57;/g, '').trim())).length;
  return /&\$556;/.test(lp.html || '') || priced / ls.length >= 0.6;
}
const destSet = (texts) => new Set(texts.map(tpDest).filter(Boolean));
const setOverlap = (A, B) => { if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.min(A.size, B.size); };
function contextNames(lp) {
  const base = lp.file.replace(/^Logs\//, ''); let m;
  if ((m = /^npclive_(.+)_[0-9a-f]{8}\.html?$/i.exec(base)) || (m = /^npcmap_(.+?)_\d+\.html?$/i.exec(base))) return { names: [m[1].replace(/_/g, ' '), m[1]], how: 'file name' };
  if ((m = /^npc_([A-Za-z0-9]+)\.html?$/i.exec(base))) {
    const t = Date.parse(lp.at); const arr = (live.byChar[m[1]] || []).filter(x => x.t <= t + 2000);
    const e = arr[arr.length - 1]; if (e && t - e.t <= 120000) return { names: [e.npc], how: 'dialog.log (' + m[1] + ' at ' + e.npc + ')' };
  }
  return { names: [], how: '' };
}
const tpPagesOf = (id) => [...new Set((htmlByNpc.get(id) || []).concat(FILES_BY_NPC.get(id) || []))].filter(p => PAGES.has(p) && PAGES.get(p).links.filter(l => classifyBypass(l.bypass, l.mode).kind === 'teleport').length >= 2);
const TP_MATCH = [];   // report: how each live list was matched
function tpListMatch(lp) {
  if (!isTpList(lp)) return false;
  const LD = destSet(lp.links.filter(l => l.text).map(l => l.text));
  const ctx = contextNames(lp); let ids = []; let how = ctx.how;
  for (const n of ctx.names) { ids = talkIdsByName(n).filter(id => tpPagesOf(id).length); if (ids.length) break; }
  if (!ids.length) {   // 3) the live gatekeeper menus
    let best = null, bs = 0;
    for (const g of live.gk) for (const L_ of Object.values(g.pages || {})) { const s = setOverlap(LD, destSet(L_)); if (s > bs) { bs = s; best = g; } }
    if (best && bs >= 0.6) { ids = talkIdsByName(best.name).filter(id => tpPagesOf(id).length); how = 'gk_live menu ' + best.file + ' (' + Math.round(bs * 100) + '%)';
      if (ids.length > 1 && best.x) ids.sort((a, b) => { const A = atlasList.find(x => x.id === a) || {}, B = atlasList.find(x => x.id === b) || {}; return Math.hypot((A.x || 1e9) - best.x, (A.y || 1e9) - best.y) - Math.hypot((B.x || 1e9) - best.x, (B.y || 1e9) - best.y); }); ids = ids.slice(0, 1); }
  }
  if (!ids.length) return false;
  let pick = null, ps = 0;
  for (const id of ids) for (const p of tpPagesOf(id)) { const s = setOverlap(LD, destSet(PAGES.get(p).links.map(l => l.text))); if (s > ps) { ps = s; pick = { id, p }; } }
  if (pick && ps >= 0.5) { if (!liveByPage.has(pick.p)) liveByPage.set(pick.p, []); liveByPage.get(pick.p).push(Object.assign({ score: Math.round(ps * 100) / 100, matchedBy: how, teleportList: true }, lp)); TP_MATCH.push({ file: lp.file, npcId: pick.id, page: pick.p, by: how, score: Math.round(ps * 100) / 100 }); return true; }
  // the gatekeeper is known but no datapack list fits (server-custom list): a live-only page of that gatekeeper
  const id = ids[0]; if (!liveOnlyByNpc.has(id)) liveOnlyByNpc.set(id, []); liveOnlyByNpc.get(id).push(Object.assign({ teleportList: true, matchedBy: how }, lp));
  TP_MATCH.push({ file: lp.file, npcId: id, page: null, by: how, score: Math.round(ps * 100) / 100, note: 'no datapack list of this gatekeeper fits: live-only page' });
  return true;
}
for (const lp of live.pages) {
  if (tpListMatch(lp)) continue;
  const W = words(lp.text);
  let cands = lp.header ? (byHeaderWord.get(lastWord(lp.header)) || []) : [];
  if (!cands.length && W.size >= 6) cands = [...PAGES.keys()];
  let best = null, bs = 0;
  for (const id of cands) { const s = jaccard(W, dpWords.get(id)); if (s > bs) { bs = s; best = id; } }
  if (best && (bs >= 0.45 || (lp.header && bs >= 0.25))) { if (!liveByPage.has(best)) liveByPage.set(best, []); liveByPage.get(best).push(Object.assign({ score: Math.round(bs * 100) / 100 }, lp)); }
  else if (lp.header && headerIds(lp.header).length) { for (const id of headerIds(lp.header)) { if (!liveOnlyByNpc.has(id)) liveOnlyByNpc.set(id, []); liveOnlyByNpc.get(id).push(lp); } }
  else unmatchedLive.push({ file: lp.file, header: lp.header, text: short(lp.text, 120), links: lp.links.map(l => l.text), best, score: Math.round(bs * 100) / 100 });
}
// PHASEB-2026-10-27 (quest engine agent, coordinator: live 384 Cliff): live pages L2Toggle REWROTE (other header, other words: no text match) but proven to
// be a datapack page by a live run; the live link texts then win by position (same link count). Each entry names its proof.
const LIVE_PAGE_MATCH = [
  { live: 'npclive_Cliff_bcec0229.html', npcId: 30182, page: 'Q00384_WarehouseKeepersPastime/30182-01.htm', why: 'live 2026-10-27 phase B: the start page of 384 shows one link "How do you make the game more interesting?" where the datapack has "So?" (same place in the dialog: the first quest page, one link)' },
];
for (const M of LIVE_PAGE_MATCH) {
  const lp = live.pages.find(p => String(p.file || '').replace(/\\/g, '/').endsWith(M.live)); if (!lp || !PAGES.has(M.page)) continue;
  if (!liveByPage.has(M.page)) liveByPage.set(M.page, []); liveByPage.get(M.page).push(Object.assign({ score: 'manual', matchedBy: M.why }, lp));
  const lo = liveOnlyByNpc.get(M.npcId); if (lo) liveOnlyByNpc.set(M.npcId, lo.filter(p => p !== lp));
  const ui = unmatchedLive.findIndex(u => String(u.file || '').replace(/\\/g, '/').endsWith(M.live)); if (ui >= 0) unmatchedLive.splice(ui, 1);
}
log('live pages', live.pages.length, 'matched to datapack', live.pages.length - unmatchedLive.length, 'board pages', live.board.length, 'teleport lists matched', TP_MATCH.length);

// ------------------------------------------------------------------------------------------------------------------------------
// build every NPC file
const OUT_DIR = L.DIALOG_DIR; fs.mkdirSync(OUT_DIR, { recursive: true });
const index = {}; const DIFFS = []; const coverage = { npcs: 0, live: 0, pages: 0, livePages: 0, links: 0, liveLinks: 0 };
const NPC_DATA = new Map();
function dlgFor(npcId) { const n = npcName(npcId); return live.dlg.get(n) || null; }
function liveSnipMatches(D, P) { if (!D) return false; const t = P.text.toLowerCase().replace(/[^a-z0-9]/g, ''); for (const s of D.pages) { const k = snipNorm(s).slice(0, 36); if (k.length >= 12 && t.startsWith(k)) return true; } return false; }
function gkFor(npcId) {
  const n = npcName(npcId).toLowerCase(); const a = atlasList.find(x => x.id === npcId);
  const c = live.gk.filter(g => String(g.name || '').toLowerCase() === n && (!g.npcId || g.npcId === npcId));
  if (c.length <= 1 || !a) return c[0] || null;
  return c.sort((x, y) => Math.hypot(x.x - a.x, x.y - a.y) - Math.hypot(y.x - a.x, y.y - a.y))[0];
}
const tmpWrite = (file, obj) => { const t = file + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(obj, null, 1)); fs.renameSync(t, file); };

for (const npcId of [...allNpcIds].sort((a, b) => a - b)) {
  const T = npcTree(npcId);
  const D = dlgFor(npcId); const G = gkFor(npcId); let liveClicks = null;
  const liveClickNorm = new Map(); if (D) for (const [k, v] of D.clicks) liveClickNorm.set(norm(k), k);
  const gkTexts = new Map(); if (G) for (const L_ of Object.values(G.pages || {})) for (const t of L_) gkTexts.set(norm(t), t);
  const pages = {}; const diff = []; let isLive = false;
  for (const [id, v] of T.pages) {
    if (!v) continue;
    const P = v.P;
    const o = { file: P.file, quest: P.quest || null, text: short(P.text) };
    if (P.header) o.header = P.header;
    // conditions + outcome from the scripts
    const whens = []; let outcome = null;
    for (const { r } of FACTS_BY_PAGE.get(id) || []) if (r.npcs.includes(npcId) || !r.npcs.length) {
      whens.push(r.when.join('; ') || (r.states.join('|') || 'always'));
      if (r.levelLow) outcome = 'refusal'; else if (r.raceBad && !outcome) outcome = 'refusal';
    }
    if (whens.length) o.when = [...new Set(whens)].slice(0, 6);
    const links = v.links.map(l => Object.assign({}, l));
    // live proof
    const lv = liveByPage.get(id) || [];
    if (lv.length) {
      const L0 = lv[lv.length - 1]; o.live = { file: L0.file, at: L0.at, score: L0.score }; isLive = true;
      if (L0.text && norm(L0.text) !== norm(P.text)) { o.dpText = short(P.text); o.text = short(L0.text); diff.push(`text of ${id} differs: live "${short(L0.text, 90)}" vs datapack "${short(P.text, 90)}"`); }
      // link alignment: same count -> by position; else by text
      const LL = L0.links.filter(l => l.text);
      if (LL.length === links.length) LL.forEach((ll, i) => { links[i].live = true; if (norm(ll.text) !== norm(links[i].text)) { links[i].dpText = links[i].text; links[i].text = ll.text; diff.push(`${id}: link "${links[i].dpText}" is "${ll.text}" live`); } else if (ll.text !== links[i].text) { links[i].dpText = links[i].text; links[i].text = ll.text; } });
      else {
        const used = new Set();
        for (const l of links) { const j = LL.findIndex((ll, k) => !used.has(k) && norm(ll.text) === norm(l.text)); if (j >= 0) { used.add(j); l.live = true; if (LL[j].text !== l.text) { l.dpText = l.text; l.text = LL[j].text; } } else diff.push(`${id}: datapack link "${l.text}" not in the live page (${L0.file})`); }
        LL.forEach((ll, k) => { if (!used.has(k)) { links.push({ text: ll.text, bypass: 'live ' + ll.bypass, kind: 'live-only', live: true, to: null }); diff.push(`${id}: live-only link "${ll.text}" (server custom)`); } });
      }
    }
    if (liveSnipMatches(D, P)) { if (!o.live) o.live = { file: 'Logs/dialog.log' }; isLive = true; }
    for (const l of links) {
      const k = norm(l.text);
      if (!l.live && (liveClickNorm.has(k) || gkTexts.has(k))) { l.live = true; const raw = liveClickNorm.get(k) || gkTexts.get(k); if (raw && raw.replace(/\s+-\s+\d+\s*&#57;\s*$/, '') !== l.text && !/&#57;/.test(raw)) { l.dpText = l.text; l.text = raw; } }
      if (l.live) isLive = true;
    }
    // outcome
    const effs = new Set(); if (P.quest) { const M = EFFECT.get(P.quest); const base = id.split('/').pop(); if (M && M.has(base)) M.get(base).forEach(e => effs.add(e)); }
    if (effs.size) { o.sets = {}; for (const e of effs) { if (e === 'start') o.sets.start = true; else if (/^cond:/.test(e)) o.sets.cond = e.slice(5); else if (e === 'reward') o.sets.reward = true; else if (e === 'end') o.sets.exit = true; } }
    if (!outcome) outcome = effs.has('start') ? 'start' : effs.has('reward') ? 'reward' : effs.has('end') ? 'end' : [...effs].some(e => /^cond:/.test(e)) ? 'cond' : null;
    const real = links.filter(l => !/^(back|close|quit|return|cancel)\b/i.test(l.text));
    // a page with nothing to click: a refusal by its words only when the script shows it before the quest starts (a STARTED page with
    // "you don't have ..." is the normal result of a delivery / report talk)
    const pf = (FACTS_BY_PAGE.get(id) || []).map(x => x.r);
    const startedPage = pf.some(r => r.states.includes('STARTED') || r.conds.length || r.memos.length || r.condRanges.length);
    if (!outcome && !real.length && v.synthetic !== true) outcome = refusalWord.test(P.text) && !startedPage ? 'refusal' : 'dead-end';
    if (outcome) o.outcome = outcome;
    o.links = links;
    pages[id] = o;
    coverage.pages++; coverage.links += links.length; if (o.live) coverage.livePages++; coverage.liveLinks += links.filter(l => l.live).length;
  }
  // live pages with no datapack page (L2Toggle custom pages)
  (liveOnlyByNpc.get(npcId) || []).forEach((lp, i) => {
    const id = 'live:' + lp.file.replace(/^Logs\//, '');
    if (pages[id]) return;
    pages[id] = { file: lp.file, quest: null, header: lp.header, text: short(lp.text), live: { file: lp.file, at: lp.at }, outcome: 'info', serverCustom: true,
      links: lp.links.filter(l => l.text).map(l => ({ text: l.text, bypass: 'live ' + l.bypass, kind: 'live-only', live: true, to: null })) };
    diff.push(`server-custom page ${lp.file}: "${short(lp.text, 80)}" links: ${lp.links.map(l => l.text).filter(Boolean).slice(0, 8).join(' | ')}`);
    isLive = true; coverage.pages++; coverage.livePages++;
  });
  // live gatekeeper menus vs datapack teleporter pages
  if (G) {
    const dpAll = new Set(); for (const p of Object.values(pages)) for (const l of p.links) dpAll.add(norm(l.text));
    const liveAll = new Set(gkTexts.keys());
    const extra = [...liveAll].filter(k => k && !dpAll.has(k)).map(k => gkTexts.get(k));
    if (extra.length) diff.push(`gatekeeper live menu (${G.file}) has links the datapack does not: ${extra.slice(0, 12).join(' | ')}${extra.length > 12 ? ' …' : ''}`);
    isLive = true;
  }
  // live clicks that no datapack page of this npc has
  if (D) { const dpAll = new Set(); for (const p of Object.values(pages)) for (const l of p.links) dpAll.add(norm(l.text));
    const extra = [...D.clicks.keys()].filter(k => !dpAll.has(norm(k)) && !/^\[/.test(k));
    if (extra.length) diff.push(`clicked live (Logs/dialog.log) but not in the datapack pages: ${extra.slice(0, 12).join(' | ')}`); isLive = true;
    // every link text clicked live at this npc (the server's own words), with the page it was on and what came back
    liveClicks = [...D.clicks.entries()].map(([text, c]) => ({ text, n: c.n, inDatapack: dpAll.has(norm(text)), from: [...c.from].slice(0, 3), to: [...c.to].slice(0, 3) })).sort((a, b) => b.n - a.n).slice(0, 80); }
  const quests = {};
  for (const qid of questsAt.get(npcId) || []) {
    const S = scriptOfQuest.get(qid); const q = QREC[qid]; const t = questListTexts(qid, q && q.name);
    quests[qid] = { name: q ? q.name : t.start, listText: ['[' + t.start + ']', '[' + t.progress + ']'], onTalk: S ? S.talk.filter(r => r.npcs.includes(npcId)).map(r => ({ page: r.page, when: r.when.join('; '), state: r.states.join('|') || null, cond: r.conds.length ? r.conds : null, outcome: r.levelLow || r.raceBad ? 'refusal' : (pages[r.page] && pages[r.page].outcome) || null })) : [] };
  }
  const rec = { npcId, name: npcName(npcId), title: (NPCS[npcId] && NPCS[npcId].t) || '', type: npcType(npcId), generated: new Date().toISOString(), tool: 'docs/plan/tools/npc_dialogs_build.js',
    live: isLive, firstTalk: T.first, quests, pages };
  if (diff.length) rec.liveDiff = [...new Set(diff)];
  if (D && liveClicks && liveClicks.length) rec.liveClicks = liveClicks;
  if (!Object.keys(pages).length && !Object.keys(quests).length) continue;
  NPC_DATA.set(npcId, rec);
  coverage.npcs++; if (isLive) coverage.live++;
  if (diff.length) DIFFS.push({ npcId, name: rec.name, diffs: rec.liveDiff });
  index[npcId] = { n: rec.name, t: rec.title, pages: Object.keys(pages).length, quests: Object.keys(quests).map(Number), live: isLive };
}
for (const [id, rec] of NPC_DATA) tmpWrite(path.join(OUT_DIR, id + '.json'), rec);
// remove files of npcs that are gone
for (const f of fs.readdirSync(OUT_DIR)) { const m = /^(\d+)\.json$/.exec(f); if (m && !NPC_DATA.has(+m[1])) try { fs.unlinkSync(path.join(OUT_DIR, f)); } catch (e) { } }
tmpWrite(path.join(OUT_DIR, '_index.json'), { generated: new Date().toISOString(), tool: 'docs/plan/tools/npc_dialogs_build.js', format: 'docs/plan/npc_dialogs.md', npcs: index });
log('npc files', NPC_DATA.size, JSON.stringify(coverage));

// ------------------------------------------------------------------------------------------------------------------------------
// (b) quest talk step chains
function pageLinksOf(npcId, pid) { const R = NPC_DATA.get(npcId); return R && R.pages[pid] ? R.pages[pid].links : null; }
// the transitions a plan step can mean, best first (a transition with an explicit `from` = this cond beats a "from anywhere" one such as a quit link)
function stepTransitions(q, step) {
  const npcId = step.npc && step.npc.id; const stepLinks = (step.links || []).map(norm);
  let cands = (q.transitions || []).filter(t => t.trigger && /event|talk|firstTalk/.test(t.trigger.type) && (!(t.trigger.npcs || []).length || t.trigger.npcs.includes(npcId)));
  cands = step.kind === 'start' ? cands.filter(t => t.start) : cands.filter(t => !t.start && (!t.from || t.from.includes(step.cond)));
  const score = (t) => ((t.trigger.links || []).some(x => stepLinks.includes(norm(x))) ? 2 : 0) + (String(t.to) === String(step.to) ? 2 : 0) + (t.from && t.from.includes(step.cond) ? 3 : 0) + (t.trigger.type === 'talk' ? 0.5 : 0) - (t.end && !(t.adena || t.exp || (t.gives || []).length) ? 3 : 0);
  return cands.map(t => ({ t, s: score(t) })).sort((a, b) => b.s - a.s);
}
function buildChainBest(q, step) {
  const C = stepTransitions(q, step); let best = null;
  const groups = [...new Set(C.map(c => c.s))];
  for (const s of groups.length ? groups : [null]) {
    const r = buildChain(q, step, s === null ? [] : C.filter(c => c.s === s).map(c => c.t));
    if (!best || (best.status !== 'full' && r.status === 'full')) best = r;
    if (r.status === 'full') break;
  }
  return best;
}
function buildChain(q, step, group) {
  const npcId = step.npc && step.npc.id; const S = scriptOfQuest.get(q.id); const R = NPC_DATA.get(npcId);
  const out = { npcId, npcName: step.npc ? step.npc.name : npcName(npcId), cond: step.cond, kind: step.kind, to: step.to, status: 'none', dialog: [] };
  if (!S || !R) { out.why = !S ? 'no quest script in the datapack' : 'no dialog pages for this NPC'; return out; }
  // the transition this step makes
  const stepLinks = (step.links || []).map(norm);
  const T0 = group[0];
  out.trigger = T0 ? T0.trigger.type : (stepLinks.length ? 'event' : 'talk');
  const targets = new Set(); if (T0 && T0.trigger.type !== 'talk') for (const t of group) (t.trigger.events || []).forEach(e => targets.add(e));
  if (T0 && T0.trigger.type !== 'talk') { out.event = [...targets][0] || null; }
  out.effect = T0 ? (T0.start ? 'start' : T0.end ? 'end' : 'cond:' + T0.to) : (step.kind === 'start' ? 'start' : 'cond:' + step.to);
  // starting pages: onTalk of this npc in this state / cond
  const wantState = step.kind === 'start' ? 'CREATED' : 'STARTED';
  const talkAll = (out.trigger === 'firstTalk' ? S.first : S.talk).filter(r => r.npcs.includes(npcId));
  let starts = talkAll.filter(r => (r.states.length ? r.states.includes(wantState) : wantState === 'STARTED' ? (r.conds.length || r.memos.length || r.condRanges.length) : true));
  if (wantState === 'STARTED') { const c = starts.filter(r => r.conds.length ? r.conds.includes(step.cond) : true); if (c.length) starts = c; }
  const refusals = starts.filter(r => r.levelLow || r.raceBad);
  let good = starts.filter(r => !r.levelLow && !r.raceBad); if (!good.length) good = starts.length ? starts : talkAll;
  if (refusals.length) out.refusals = [...new Set(refusals.map(r => r.page + (r.when.length ? ' (' + r.when.join('; ') + ')' : '')))].slice(0, 6);
  const isTarget = (l) => l.event && targets.has(l.event) && (!l.script || l.script === S.name);
  // distance to the target over the quest pages of this npc (links of this quest's script only)
  // reverse BFS from every page that holds a target link: distMap(page) = clicks from that page to the effect
  const tosOf = (l) => (l.toAll || [l.to]).filter(Boolean);
  const distMap = new Map(), rev = new Map(), bq = [];
  for (const [pid, pg] of Object.entries(R.pages)) for (const l of pg.links) {
    if (isTarget(l)) { if (!distMap.has(pid)) { distMap.set(pid, 1); bq.push(pid); } }
    else if (l.script === S.name && l.kind === 'quest-event') for (const to of tosOf(l)) { if (!rev.has(to)) rev.set(to, []); rev.get(to).push(pid); }
  }
  while (bq.length) { const p = bq.shift(); const d = distMap.get(p); for (const pr of rev.get(p) || []) if (!distMap.has(pr)) { distMap.set(pr, d + 1); bq.push(pr); } }
  const dist = (pid) => distMap.has(pid) ? distMap.get(pid) : Infinity;
  const bestTo = (l) => tosOf(l).map(to => ({ to, d: dist(to) })).sort((a, b) => a.d - b.d)[0] || { to: null, d: Infinity };
  const linkDist = (l) => isTarget(l) ? 1 : (l.script === S.name && l.kind === 'quest-event' ? 1 + bestTo(l).d : Infinity);
  // prefix: first page -> Quest -> quest list
  // the normal first page (never the karma variant); among several, the one that has this quest's / a Quest link
  const ftN = R.firstTalk.filter(f => f.page && f.variant !== 'karma'); const ftAll = ftN.length ? ftN : R.firstTalk;
  const hasQ = (f) => (pageLinksOf(npcId, f.page) || []).some(l => (l.kind === 'quest' && l.script === S.name) || l.kind === 'quest-menu');
  const fp0 = ftAll.find(hasQ) || ftAll[0];
  const fp = fp0 && fp0.page; const fpl = fp ? pageLinksOf(npcId, fp) || [] : [];
  // the onTalk page to start from: one that reaches the effect (non-refusal first), else the first non-refusal page
  const reach = (L_) => L_.filter(r => dist(r.page) < Infinity).sort((a, b) => dist(a.page) - dist(b.page));
  const startPage = ((targets.size ? (reach(good)[0] || reach(starts)[0] || reach(talkAll)[0]) : null) || good[0] || {}).page || null;
  const firstIsQuest = R.firstTalk.some(f => /^quest /.test(f.src) && (f.page === startPage || (S.first || []).some(r => r.page === f.page)));
  if (out.trigger !== 'firstTalk' && !firstIsQuest) {
    const qlink = fpl.find(l => l.kind === 'quest' && l.script === S.name) || fpl.find(l => l.kind === 'quest-menu');
    if (qlink) out.dialog.push({ page: fp, click: qlink.text, alts: qlink.dpText ? [qlink.dpText] : [], kind: qlink.kind, live: !!qlink.live });
    else out.dialog.push({ page: fp || null, click: 'Quest', alts: ['Quest.', 'Quests'], kind: 'quest-menu', optional: true, note: 'the first page has no Quest link in the datapack' });
    const t = questListTexts(q.id, q.name); const nm = step.kind === 'start' ? t.start : t.progress;
    const D = live.dlg.get(npcName(npcId)); const seen = D ? [...D.clicks.keys()].some(k => norm(k) === norm(nm)) : false;
    out.dialog.push({ page: '@questlist', click: '[' + nm + ']', alts: [nm, '[' + (step.kind === 'start' ? t.progress : t.start) + ']'], kind: 'quest-list', optional: true, live: seen });
  }
  if (!startPage) { out.status = 'partial'; out.why = 'no onTalk page of ' + out.npcName + ' found for ' + wantState + (wantState === 'STARTED' ? ' cond ' + step.cond : ''); return out; }
  out.startPage = startPage;
  if (out.trigger === 'talk' || !targets.size) {
    out.result = startPage; out.status = 'full';
    const sp = R.pages[startPage]; if (sp && sp.outcome === 'refusal') { out.status = 'partial'; out.why = 'the only page found is a refusal'; }
    out.live = out.dialog.some(d => d.live && d.kind !== 'quest-menu') || !!(sp && sp.live);
    return out;
  }
  // walk the shortest path to the target link
  let pid = startPage; const seenP = new Set();
  for (let i = 0; i < 12 && pid; i++) {
    seenP.add(pid);
    const links = pageLinksOf(npcId, pid) || [];
    const ranked = links.map(l => ({ l, d: linkDist(l) })).filter(x => x.d < Infinity).sort((a, b) => a.d - b.d);
    if (!ranked.length) break;
    const pick = ranked[0];
    const alts = ranked.filter(x => x !== pick && x.d < Infinity).map(x => x.l.text);
    if (pick.l.dpText) alts.push(pick.l.dpText);
    const others = links.filter(l => !ranked.some(x => x.l === l)).map(l => l.text);
    const e = { page: pid, click: pick.l.text, alts: [...new Set(alts)] };
    if (pick.l.live) e.live = true;
    if (ranked.length > 1 || others.length) e.choice = { why: ranked.length > 1 ? `${ranked.length} answers lead on to the goal; "${pick.l.text}" is the shortest (${pick.d} click${pick.d > 1 ? 's' : ''})` : `only "${pick.l.text}" leads on; the others do not`, others };
    if (isTarget(pick.l)) { e.effect = out.effect; out.dialog.push(e); out.result = pick.l.to || null; out.status = 'full'; break; }
    out.dialog.push(e);
    const nx = bestTo(pick.l).to;
    if (!nx || seenP.has(nx)) break;
    if (nx !== pick.l.to) e.next = nx;   // the event can show several pages: this one leads on
    pid = nx;
  }
  // PHASEB-2026-10-27 (quest engine agent; live 271 Destroyer9: the chain held only the repeat page's "I will try again!", the first-time page offers
  // "Fine, I will prove my valor!"): every OTHER onTalk page of this step that reaches the goal adds its clicks as optional entries before the main
  // path (the engine clicks what the page offers; an entry with the effect ends the chain)
  if (out.status === 'full' && targets.size) {
    const walkFrom = (p0) => { const ent = []; let p = p0, full = false; const seen = new Set();
      for (let i = 0; i < 12 && p; i++) { seen.add(p); const links = pageLinksOf(npcId, p) || []; const ranked = links.map(l => ({ l, d: linkDist(l) })).filter(x => x.d < Infinity).sort((a, b) => a.d - b.d); if (!ranked.length) break;
        const pk = ranked[0], e = { page: p, click: pk.l.text, alts: [...new Set(ranked.filter(x => x !== pk).map(x => x.l.text).concat(pk.l.dpText ? [pk.l.dpText] : []))] }; if (pk.l.live) e.live = true;
        if (isTarget(pk.l)) { e.effect = out.effect; ent.push(e); full = true; break; }
        ent.push(e); const nx = bestTo(pk.l).to; if (!nx || seen.has(nx)) break; if (nx !== pk.l.to) e.next = nx; p = nx; }
      return { ent, full }; };
    const altStarts = [...new Set(reach(good).map(r => r.page))].filter(p => p && p !== startPage);
    const have = new Set(out.dialog.map(d => norm(d.click))), ins = [];
    for (const p0 of altStarts) { const w = walkFrom(p0); if (!w.full) continue; w.ent.forEach(e => { if (have.has(norm(e.click))) return; have.add(norm(e.click)); ins.push(Object.assign(e, { optional: true, variant: p0, note: 'another first page of this step (' + p0 + ')' })); }); }
    if (ins.length) { const at = out.dialog.findIndex(d => d.kind !== 'quest-menu' && d.kind !== 'quest-list'); out.dialog.splice(at < 0 ? out.dialog.length : at, 0, ...ins); out.variants = altStarts.length; }
  }
  if (out.status !== 'full') {
    // target link exists somewhere among this npc's pages but not on the way from the onTalk page
    for (const [p2, pg] of Object.entries(R.pages)) { const l = pg.links.find(isTarget); if (l) { out.dialog.push({ page: p2, click: l.text, alts: l.dpText ? [l.dpText] : [], effect: out.effect, note: 'reached from another page (not from the onTalk page found)' }); out.status = 'partial'; out.why = 'target link "' + l.text + '" not reachable from ' + startPage; break; } }
    if (out.status === 'none') { out.status = 'partial'; out.why = 'no link with event ' + [...targets].join('|') + ' on the pages of ' + out.npcName + ((T0 && T0.trigger.links || []).length ? ' (record link: ' + T0.trigger.links.join(' / ') + ')' : ''); if (T0 && (T0.trigger.links || []).length) out.dialog.push({ page: null, click: T0.trigger.links[0], alts: T0.trigger.links.slice(1), effect: out.effect, note: 'from the quest record only' }); }
  }
  out.live = out.dialog.some(d => d.live && d.kind !== 'quest-menu');
  return out;
}
const QD = { meta: { generated: new Date().toISOString(), tool: 'docs/plan/tools/npc_dialogs_build.js', format: 'docs/plan/npc_dialogs.md', counts: {} }, quests: {} };
const qc = { quests: 0, steps: 0, full: 0, partial: 0, none: 0, live: 0, questsFull: 0 }; const missing = [];
for (const q of Object.values(QREC).sort((a, b) => a.id - b.id)) {
  const plan = QPLAN[q.id]; const steps = (plan && plan.steps || []).filter(s => s.npc && s.npc.id && /^(start|deliver|talk)$/.test(s.kind));
  if (!steps.length) continue;
  const qo = { name: q.name, steps: {} }; let allFull = true;
  for (const s of steps) {
    let c; try { c = buildChainBest(q, s); } catch (e) { c = { npcId: s.npc.id, status: 'none', why: 'error ' + e.message, dialog: [] }; }
    qo.steps[s.key] = c; qc.steps++; qc[c.status]++; if (c.live) qc.live++;
    if (c.status !== 'full') { allFull = false; missing.push({ quest: q.id, name: q.name, key: s.key, status: c.status, why: c.why || '' }); }
  }
  QD.quests[q.id] = qo; qc.quests++; if (allFull) qc.questsFull++;
}
QD.meta.counts = qc;
tmpWrite(L.QUEST_DIALOGS, QD);
log('quest chains', JSON.stringify(qc));

// report
const report = { generated: new Date().toISOString(), coverage, questChains: qc, missing, liveDiffs: DIFFS, unmatchedLive: unmatchedLive.slice(0, 200), teleportLists: TP_MATCH,
  karmaFirst: [...NPC_DATA.values()].filter(r => r.firstTalk.some(f => f.variant === 'karma')).map(r => ({ npcId: r.npcId, name: r.name, first: r.firstTalk[0] && r.firstTalk[0].page })),
  board: { pages: live.board.length, titles: [...new Set(live.board.map(b => b.title).filter(Boolean))].slice(0, 40), note: 'Community Board (career / cabinet / bbs) = L2Toggle custom server menus, not NPC dialogs' },
  floorLive: Object.keys(floorLive), liveSources: { pages: live.pages.length, dialogLogNpcs: live.dlg.size, gkMenus: live.gk.length } };
tmpWrite(path.join(OUT_DIR, '_report.json'), report);
log('report written; live diffs for', DIFFS.length, 'npcs; unmatched live pages', unmatchedLive.length);
