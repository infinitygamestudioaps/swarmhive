// TEST npc dialogs (2026-10-27, requirement R8 in docs/requirements/quests.md: "every quest talk step has its full dialogue chain from the datapack,
// live text preferred"). Live test of 10 quests failed on dialogues (Darin's choice page, Gauen's "What can we do?"): the data only had the LAST link.
//   A every quest plan talk step (start / deliver / talk) has an entry in Scripts/data/quest_dialogs.json; >= 98 % of them have a full chain
//   B quest 1: Darin's choice page -> one of the two answers, the other one as alt, then "Say yes." (start); matches the LIVE pages L2Toggle sent
//   C quest 356: Gauen "What can we do?" -> "Very interesting." -> "I'll do it." x2 (start); matches the live page
//   D quests 174 / 281 at Marcela: "Quest" -> the quest list ([fstring 17401/17402/28101]) -> "Say yes."; the live quest list page matches
//   E a gatekeeper menu (Roxxy 30006): Teleport -> the town list page with teleport links; live proof
//   F NpcString resolution: <fstring>, &$N;, msg="811;F;N", bracketed quest list entries
//   G manual quest records / plans keep their fields: the builder never writes Scripts/data/quests or quest_plans; manual quests still get chains
//   H the format doc + the tools exist; the NPC files follow the format
//   I the karma "-pk" page is never the first page (Fishermen: the normal <id>.htm first, -pk = variant karma); no chain step on a -pk page
//   J headerless gatekeeper teleport lists are matched to their gatekeeper (file name / dialog.log context / gk_live menus)
// Reads the generated data (run node docs/plan/tools/npc_dialogs_build.js first). Writes nothing.  Run: node docs/plan/tools/test_npc_dialogs.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { }
const L = require('./npc_dialogs_lib.js');
const ROOT = L.ROOT, DATA = L.DATA;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const QD = L.loadQuestDialogs();
ok(!!QD && QD.quests, 'quest_dialogs.json exists (node docs/plan/tools/npc_dialogs_build.js)');
if (!QD) { console.log(`test_npc_dialogs: ${pass} passed, ${fail} failed`); process.exit(1); }
const step = (q, key) => QD.quests[q] && QD.quests[q].steps[key];
const clicks = (s) => (s && s.dialog || []).map(d => d.click);
// the engine's way (docs/plan/npc_dialogs.md): walk the chain over the pages the server sends; optional entries are skipped when not on the page
function walk(chain, pages) {
  let i = 0; const out = [];
  for (const html of pages) {
    const links = L.pageLinks(html);
    while (i < chain.length) { const e = chain[i]; const l = L.matchLink(links, e); if (l) { out.push(l.text); i++; break; } if (e.optional) { i++; continue; } return { ok: false, out, at: e.click }; }
  }
  return { ok: true, out };
}

// ---------------------------------------------------------------- A: coverage of every plan talk step
{
  let steps = 0, have = 0, full = 0; const miss = [];
  for (const f of fs.readdirSync(path.join(DATA, 'quest_plans'))) {
    if (!/^\d+\.json$/.test(f)) continue;
    const p = L.rd(path.join(DATA, 'quest_plans', f), null); if (!p) continue;
    for (const s of (p.steps || []).filter(s => s.npc && s.npc.id && /^(start|deliver|talk)$/.test(s.kind))) {
      steps++; const c = step(p.id, s.key);
      if (c) { have++; if (c.status === 'full') full++; } else miss.push(p.id + ':' + s.key);
    }
  }
  ok(steps > 2000, 'plan talk steps found (' + steps + ')');
  ok(have === steps, 'every plan talk step has a dialog entry (' + have + '/' + steps + ')' + (miss.length ? ' missing ' + miss.slice(0, 5).join(', ') : ''));
  ok(full / steps >= 0.98, 'full chains >= 98 % (' + full + '/' + steps + ')');
  ok(Object.values(QD.quests).every(q => Object.values(q.steps).every(s => Array.isArray(s.dialog) && s.status && (s.status === 'full' || s.why))), 'every step: dialog[] + status, and a why when not full');
}

// ---------------------------------------------------------------- B: quest 1, Darin's choice page
const LIVE_DARIN = [
  '<html><body>Darin:<br>Do you ever look out at the world and find it to be a beautiful and magical place? Like you\'re seeing it for the first time? I feel like that these days.<br><a action="bypass -h 00">Quest</a></body></html>',
  '<html><body>Darin:<br>What\'s more dangerous than a Knight\'s sword or a Wizard\'s staff? That thing we call love.<br><a action="bypass -h 00">Ask whom he loves.</a></body></html>',
  '<html><body>Darin:<br>I am in love with <font color="LEVEL">Roxxy</font>. Do you know her? She\'s our village Gatekeeper.<br><a action="bypass -h 00">Tell him you don\'t know her.</a><br><a action="bypass -h 01">Tell him you do know her.</a></body></html>',
  '<html><body>Darin:<br>You don\'t know Roxxy?! ... Would you deliver my letter to Roxxy?<br><a action="bypass -h 00">Say yes.</a></body></html>',
];
{
  const s = step(1, 'c0:start:30048');
  ok(s && s.status === 'full' && s.effect === 'start' && s.trigger === 'event', 'Q1 start: full chain, event trigger, effect start');
  const c = clicks(s);
  ok(c.includes('Ask whom he loves.') && c[c.length - 1] === 'Say yes.', 'Q1 start: "Ask whom he loves." ... "Say yes." (' + c.join(' > ') + ')');
  const ch = (s.dialog || []).find(d => /30048-03/.test(d.page || ''));
  ok(ch && /know her/.test(ch.click) && ch.alts.some(a => /know her/.test(a) && a !== ch.click) && ch.choice, 'Q1: the choice page 30048-03 has a pick + the other answer as alt + choice why');
  ok((s.dialog || []).findIndex(d => d.click === 'Ask whom he loves.') < (s.dialog || []).findIndex(d => d === ch), 'Q1: the choice comes after "Ask whom he loves."');
  ok(s.refusals && s.refusals.some(r => /30048-01/.test(r)), 'Q1: the level refusal page 30048-01 is listed');
  const w = walk(s.dialog, LIVE_DARIN);
  ok(w.ok && w.out.length === 4 && w.out[3] === 'Say yes.', 'Q1: the chain walks the LIVE L2Toggle pages (bypass codes 00/01) to "Say yes." (' + w.out.join(' > ') + (w.ok ? '' : ' stuck at ' + w.at) + ')');
  ok(['c1:deliver:30006', 'c2:deliver:30048', 'c3:deliver:30033', 'c4:talk:30048'].every(k => step(1, k) && step(1, k).status === 'full' && step(1, k).trigger === 'talk'), 'Q1: the delivery steps are talk-triggered (open the quest page)');
  const R = L.loadNpc(30048);
  ok(R && R.live && R.pages['Q00001_LettersOfLove/30048-03.html'] && R.pages['Q00001_LettersOfLove/30048-03.html'].links.length === 2, 'Darin npc file: the choice page with both answers, live proof');
}

// ---------------------------------------------------------------- C: quest 356, Gauen
const LIVE_GAUEN = [
  '<html><body>Sorcerer Gauen:<br>I am depressed by the things that are going on in this tower.<br><a action="bypass -h 00">Learn skills</a><br><a action="bypass -h 01">Quest</a></body></html>',
  '<html><body>Magister Gauen:<br>Since the era of Shunaiman, the first emperor of the ancient Elmoreden Empire...<br><a action="bypass -h 00">What can we do?</a></body></html>',
  '<html><body>Magister Gauen:<br>Frankly, I\'m not sure.<br><a action="bypass -h 00">"Very interesting."</a></body></html>',
  '<html><body>Magister Gauen:<br>I must have a tissue sample...<br><a action="bypass -h 00">"I\'ll do it."</a></body></html>',
  '<html><body>Magister Gauen:<br>There are many different types of spores...<br><a action="bypass -h 00">"I\'ll do it."</a></body></html>',
];
{
  const s = step(356, 'c0:start:30717');
  const c = clicks(s).map(L.norm);
  ok(s && s.status === 'full' && s.effect === 'start', 'Q356 start: full chain, effect start');
  ok(c.indexOf('what can we do') >= 0 && c.indexOf('very interesting') > c.indexOf('what can we do') && c.filter(x => x === 'ill do it').length === 2, 'Q356: "What can we do?" > "Very interesting." > "I\'ll do it." x2 (' + clicks(s).join(' > ') + ')');
  const w = walk(s.dialog, LIVE_GAUEN);
  ok(w.ok && w.out.length === 5, 'Q356: the chain walks the live Gauen pages (' + w.out.join(' > ') + (w.ok ? '' : ' stuck at ' + w.at) + ')');
  const R = L.loadNpc(30717);
  ok(R && R.liveDiff && R.liveDiff.some(d => /differs/.test(d)), 'Gauen: the L2Toggle text differences are listed (live "Sorcerer Gauen" page)');
}

// Scripts/data/npc_strings.json is generated on each install from its own L2Swarm Data\base.db (update.ps1, never shipped): the checks that
// resolve <fstring> / &$N; texts on live pages need it, so they run only where it exists (the data itself already carries the resolved texts)
const HAVE_NS = fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'npc_strings.json'));
const nsOk = (c, m) => { if (HAVE_NS) ok(c, m); else console.log('skip (no npc_strings.json in this install): ' + m.slice(0, 80)); };
// ---------------------------------------------------------------- D: quests 174 / 281 at Marcela (two quests -> the quest list)
const LIVE_MARCELA_FRONT = '<html><body>Zerstorer Marcela:<br>May the spear that splits the heavens bestow blessings upon you.<br><a action="bypass -h 00">Ask about the Marksmen.</a><br><a action="bypass -h 01">View information on the local lord and tax rate.</a><br><a action="bypass -h 02">Quest</a></body></html>';
const LIVE_MARCELA_LIST_START = '<html><br><a action="bypass -h 00">[<fstring>17401</fstring>]</a><br><a action="bypass -h 01">[<fstring>28101</fstring>]</a><br></body></html>';
const LIVE_MARCELA_LIST_PROG = '<html><br><a action="bypass -h 00">[<fstring>17402</fstring>]</a><br><a action="bypass -h 01">[<fstring>28101</fstring>]</a><br></body></html>';
const LIVE_MARCELA_OFFER = '<html><body>Zerstorer Marcela:<br>It is time to conduct our annual supply inventory.<br><a action="bypass -h 00">Say yes.</a></body></html>';
{
  const s174 = step(174, 'c0:start:32173'), s281 = step(281, 'c0:start:32173');
  ok(s174 && s174.status === 'full' && clicks(s174).slice(-1)[0] === 'Say yes.', 'Q174 start at Marcela: ... "Say yes." (' + clicks(s174).join(' > ') + ')');
  ok(s281 && s281.status === 'full' && clicks(s281).slice(-1)[0] === 'Say yes.', 'Q281 start at Marcela: ... "Say yes."');
  const w174 = walk(s174.dialog, [LIVE_MARCELA_FRONT, LIVE_MARCELA_LIST_START, LIVE_MARCELA_OFFER]);
  nsOk(w174.ok && w174.out[1] === '[Supply Check]' && w174.out[2] === 'Say yes.', 'Q174: Quest > [Supply Check] (fstring 17401) > Say yes. on the live pages (' + w174.out.join(' > ') + ')');
  const w281 = walk(s281.dialog, [LIVE_MARCELA_FRONT, LIVE_MARCELA_LIST_START]);
  nsOk(w281.out[1] === '[Head for the Hills!]', 'Q281: the live quest list entry [Head for the Hills!] (fstring 28101) is picked, not Supply Check');
  const prog = step(174, 'c2:talk:32173');
  const wp = walk(prog.dialog, [LIVE_MARCELA_FRONT, LIVE_MARCELA_LIST_PROG]);
  nsOk(prog.status === 'full' && wp.out[1] === '[Supply Check (In Progress)]', 'Q174 report step: [Supply Check (In Progress)] (fstring 17402)');
  ok(s174.dialog.some(d => d.kind === 'quest-list' && d.optional), 'the quest list step is optional (only when the NPC has 2+ quests for you)');
  const end281 = step(281, 'c1:talk:32173');
  ok(end281 && end281.status === 'full', 'Q281 hand-in step at Marcela: full chain (' + clicks(end281).join(' > ') + ')');
}

// ---------------------------------------------------------------- E: a gatekeeper menu (Roxxy)
{
  const R = L.loadNpc(30006);
  ok(R && R.type === 'L2Teleporter' && R.firstTalk[0].page === 'teleporter/30006.htm', 'Roxxy: first talk = teleporter/30006.htm');
  const fp = R.pages['teleporter/30006.htm'];
  const tp = fp && fp.links.find(l => l.text === 'Teleport');
  ok(tp && tp.kind === 'page' && tp.to === 'teleporter/30006-1.htm', 'Roxxy: "Teleport" -> teleporter/30006-1.htm');
  const tl = R.pages['teleporter/30006-1.htm'];
  ok(tl && tl.links.filter(l => l.kind === 'teleport').length >= 5, 'Roxxy: the town list page has teleport links');
  ok(fp.links.some(l => l.kind === 'quest-menu' && l.to === '@questlist'), 'Roxxy: "Quest" -> @questlist');
  ok(R.live && fp.links.some(l => l.live), 'Roxxy: live proof (gk_live menu / dialog.log)');
  ok(R.liveDiff && R.liveDiff.some(d => /gatekeeper live menu/.test(d)), 'Roxxy: the live menu differences are listed');
}

// ---------------------------------------------------------------- F: NpcString resolution
{
  nsOk(L.resolveNs('<fstring>1010005</fstring>') === 'The Town of Gludio', '<fstring>1010005</fstring> -> The Town of Gludio');
  nsOk(L.resolveNs('&$101;') === 'Letters of Love', '&$101; -> Letters of Love');
  const ln = L.pageLinks('<a action="bypass -h 00" msg="811;F;1010005"><fstring>1010005</fstring></a><a action="bypass -h 01">[<fstring>16002</fstring>]</a>');
  nsOk(ln[0].text === 'The Town of Gludio' && ln[0].confirm === undefined && ln[0].msg === 'The Town of Gludio' && ln[0].bypass === '00', 'L2Toggle gatekeeper link: fstring text + msg 811;F;N resolved, code 00');
  nsOk(ln[1].text === "[Nerupa's Request (In Progress)]", 'quest list entry [fstring 16002] -> [Nerupa\'s Request (In Progress)]');
  ok(L.norm('[Supply Check (In Progress)]') === L.norm('Supply Check (In Progress)') && L.norm('"I\'ll do it."') === L.norm("I'll do it."), 'norm(): brackets and quotes do not matter');
  ok(L.norm('The Ant Nest - 2100 &#57;') === L.norm('The Ant Nest'), 'norm(): the L2Toggle price suffix is dropped');
  const t = L.questListTexts(1); nsOk(t.start === 'Letters of Love' && t.progress === 'Letters of Love (In Progress)', 'quest list texts = NpcString q*100+1 / +2');
}

// ---------------------------------------------------------------- G: manual records keep their fields
{
  const src = fs.readFileSync(path.join(__dirname, 'npc_dialogs_build.js'), 'utf8');
  const writes = (src.match(/\b(writeFileSync|renameSync|tmpWrite|unlinkSync|writeGuarded|appendFileSync)\s*\(([^)]*)/g) || []);
  ok(writes.length > 0 && !writes.some(w => /quest_plans|['"`]quests['"`]|quests_h5/.test(w)), 'the builder writes no quest record / plan file');
  ok(/tmpWrite\(path\.join\(OUT_DIR/.test(src) && /tmpWrite\(L\.QUEST_DIALOGS/.test(src), 'the builder writes only npc_dialogs/* and quest_dialogs.json');
  // a hand-fixed record (manual: true) still gets its dialog chains, and keeps its own fields
  const manualQ = fs.readdirSync(path.join(DATA, 'quests')).filter(f => /^\d+\.json$/.test(f)).map(f => L.rd(path.join(DATA, 'quests', f), null)).filter(q => q && JSON.stringify(q).includes('"manual":true'));
  ok(manualQ.length > 0, 'there are manual quest records (' + manualQ.length + ')');
  const mq = manualQ.find(q => QD.quests[q.id]);
  ok(!!mq && Object.keys(QD.quests[mq.id].steps).length > 0, 'a manual quest record (' + (mq && mq.id) + ') has dialog chains in quest_dialogs.json');
  ok(!!mq && !Object.prototype.hasOwnProperty.call(mq, 'dialog') && JSON.stringify(mq).includes('"manual":true'), 'the manual record itself is untouched (no dialog field written into it, manual flag kept)');
}

// ---------------------------------------------------------------- H: format + tools
{
  const doc = fs.existsSync(path.join(ROOT, 'docs', 'plan', 'npc_dialogs.md')) ? fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'npc_dialogs.md'), 'utf8') : '';
  if (doc) ok(/quest_dialogs\.json/.test(doc) && /npc_dialogs\/<npcId>\.json/.test(doc) && /alts/.test(doc), 'docs/plan/npc_dialogs.md documents both formats');
  else console.log('skip docs/plan/npc_dialogs.md (not in the public package)');
  ok(fs.existsSync(path.join(__dirname, 'npc_dialogs.js')), 'viewer tool npc_dialogs.js (--npc / --quest) exists');
  const I = L.rd(path.join(L.DIALOG_DIR, '_index.json'), { npcs: {} }).npcs;
  ok(Object.keys(I).length > 1500, 'NPC files: ' + Object.keys(I).length);
  const R = L.loadNpc(30048);
  ok(R && Array.isArray(R.firstTalk) && R.pages && Object.values(R.pages).every(p => Array.isArray(p.links) && typeof p.text === 'string') &&
    Object.values(R.pages).every(p => p.links.every(l => typeof l.text === 'string' && l.kind)), 'NPC file format: firstTalk[], pages{ text, links[{ text, kind }] }');
  const rep = L.rd(path.join(L.DIALOG_DIR, '_report.json'), null);
  ok(rep && rep.coverage && rep.coverage.live > 50 && Array.isArray(rep.liveDiffs), '_report.json: coverage (live proof NPCs ' + (rep && rep.coverage.live) + ') + live diffs');
}

// ---------------------------------------------------------------- I: the karma "-pk" page is never THE first page (2026-10-27)
// Fisherman.java: karma > 0 -> "<id>-pk.htm", else "<id>.htm" (a non-literal the extractor misses). Before: 23 NPCs (all Fishermen) had only the
// -pk page, 22 quest chains clicked "Quest" on it (a page without a Quest link).
{
  const R = L.loadNpc(31562);
  ok(R && R.firstTalk[0].page === 'ai/npc/Fisherman/31562.htm', 'Klufe (Fisherman 31562): the first page is the normal 31562.htm (' + (R && R.firstTalk[0].page) + ')');
  ok(R && R.firstTalk.some(f => /31562-pk\.htm$/.test(f.page) && f.variant === 'karma') && /-pk\.htm$/.test(R.firstTalk[R.firstTalk.length - 1].page), 'Klufe: the -pk page stays, marked variant karma, last');
  ok(R && R.pages['ai/npc/Fisherman/31562.htm'] && R.pages['ai/npc/Fisherman/31562.htm'].links.some(l => l.kind === 'quest-menu'), 'Klufe: the normal first page has the Quest link');
  const I = L.rd(path.join(L.DIALOG_DIR, '_index.json'), { npcs: {} }).npcs; let pkFirst = 0; const pkNames = [];
  for (const id of Object.keys(I)) { const r = L.loadNpc(id); if (r && r.firstTalk[0] && /-pk\.html?$/.test(r.firstTalk[0].page || '')) { pkFirst++; pkNames.push(r.name); } }
  ok(pkFirst === 0, 'no NPC opens with its karma page any more (' + pkFirst + (pkNames.length ? ': ' + pkNames.slice(0, 5).join(', ') : '') + ')');
  let pkSteps = 0, onPk = 0;
  for (const q of Object.values(QD.quests)) for (const s of Object.values(q.steps)) { if ((s.dialog || []).some(d => /-pk\.html?$/.test(d.page || ''))) pkSteps++; const d0 = (s.dialog || [])[0]; if (d0 && /no Quest link/.test(d0.note || '') && /-pk\.html?$/.test(d0.page || '')) onPk++; }
  ok(pkSteps === 0 && onPk === 0, 'no quest chain step on a -pk page (' + pkSteps + ' steps, ' + onPk + ' "Quest" on a page without it)');
  const fish = Object.values(QD.quests).flatMap(q => Object.values(q.steps)).filter(s => s.npcId >= 31562 && s.npcId <= 31579);
  ok(fish.length > 0 && fish.every(s => s.dialog[0] && /^ai\/npc\/Fisherman\/\d+\.htm$/.test(s.dialog[0].page || '') && !s.dialog[0].note), 'Fisherman quest steps (' + fish.length + '): "Quest" on the normal page, which has it');
  // the karma page of a teleporter stays a page of the NPC but is never first either
  const C = L.loadNpc(30080); ok(C && C.firstTalk[0].page === 'teleporter/30080.htm' && C.pages['teleporter/30080-pk.htm'], 'Clarissa: first page teleporter/30080.htm, her -pk page kept as a page');
}

// ---------------------------------------------------------------- J: headerless teleport lists are matched to their gatekeeper (2026-10-27)
{
  const rep = L.rd(path.join(L.DIALOG_DIR, '_report.json'), {});
  const TL = rep.teleportLists || [];
  ok(TL.length >= 15, 'teleport lists attributed to a gatekeeper: ' + TL.length);
  const tpUnmatched = (rep.unmatchedLive || []).filter(u => (u.text || '').indexOf('&$556;') >= 0);
  ok(tpUnmatched.length === 0, 'no live teleport list left unmatched (' + tpUnmatched.length + (tpUnmatched.length ? ': ' + tpUnmatched.slice(0, 3).map(u => u.file).join(', ') : '') + ')');
  const cl = TL.find(t => /npclive_Clarissa_/.test(t.file));
  ok(cl && cl.npcId === 30080 && /^teleporter\/(?:half\/|free\/)?30080(?:-\d)?\.htm$/.test(cl.page || '') && /file name/.test(cl.by), 'npclive_Clarissa_*.html -> Clarissa 30080, ' + (cl && cl.page) + ' (by the file name)');
  ok(TL.some(t => /Logs\/npc_[A-Za-z0-9]+\.html$/.test(t.file) && /dialog\.log/.test(t.by) && t.npcId), 'a Logs/npc_<Char>.html list matched by dialog.log context (the NPC clicked just before)');
  ok(TL.every(t => !t.page || t.score >= 0.5), 'every matched list shares >= 50 % of its destinations with that datapack page');
  const C = L.loadNpc(30080); const lp = cl && cl.page && C.pages[cl.page];
  ok(lp && lp.live && lp.live.file && lp.links.filter(l => l.kind === 'teleport').length >= 5 && lp.links.some(l => l.live), 'Clarissa\'s list page now has live proof + live link texts');
  ok(TL.filter(t => t.page).every(t => { const r = L.loadNpc(t.npcId); return r && r.type && /Teleporter|Gatekeeper/.test(r.type); }), 'every list went to a teleporter NPC');
}

console.log(`test_npc_dialogs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
