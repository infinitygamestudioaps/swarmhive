// TEST QUEST DIALOG CHAIN (2026-10-27, quest engine agent; live test: L2Toggle renumbers every link "bypass -h 00/01" per page, Darin's choice page and
// Gauen's "What can we do?" were not in the data). Runs the REAL Scripts_dev/swarm.js qeDialog (stubbed host) against the CAPTURED live pages
// (docs/plan/tools/fixtures/qdialog/*_live.html, copied from Logs/questpage_* of the live test) + the datapack pages after them (renumbered codes),
// with the chain from Scripts/data/quest_dialogs/<id>.json (docs/plan/npc_dialogs.md; split by docs/plan/tools/quest_dialogs_split.js).
// Also: the pure matcher = npc_dialogs_lib.js matchLink, and the dry run's no-dialog mirror.   Run: node docs/plan/tools/test_quest_dialog_chain.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { }
const ROOT = path.resolve(__dirname, '..', '..', '..'), DATA = path.join(ROOT, 'Scripts', 'data'), FX = path.join(__dirname, 'fixtures', 'qdialog');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const a = src.indexOf('// QENGINE-PURE-BEGIN'), b = src.indexOf('// QENGINE-PURE-END');
const E = new Function(src.slice(a, b) + '\nreturn { qeDlgNorm, qeDlgMatch, qeChainFor, qeChainPick, qePickLink, qeSysVerdict, QE_REFUSE, QE_REFUSE_HARD, qeListInProgress };')();
let oks = 0, fails = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (c) oks++; else fails++; };
const LIB = require('./npc_dialogs_lib.js');
const QD = (id) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'quest_dialogs', id + '.json'), 'utf8')); } catch (e) { return null; } };   // the engine's qeReadJson: missing = null
const live = (f) => fs.readFileSync(path.join(FX, f), 'utf8');
const page = (who, body, links) => `<html><body>${who}:<br>${body}<br>` + links.map((t, i) => `<a action="bypass -h ${String(i).padStart(2, '0')}">${t}</a>`).join('<br>') + '</body></html>';

console.log('pure matcher = npc_dialogs_lib.js');
['Tell him you don&apos;t know her.', '"I\'ll do it."', '[Letters of Love (In Progress)]', 'Gludin Village - 7300 &#57;', 'Teleport to Fantasy Isle (free)', 'Quest'].forEach(t =>
  ok(E.qeDlgNorm(t.replace('&apos;', "'")) === LIB.norm(t.replace('&apos;', "'")), 'qeDlgNorm = lib norm: ' + JSON.stringify(t) + ' -> ' + JSON.stringify(E.qeDlgNorm(t))));
{ const L = [{ text: 'Tell him you don\'t know her.' }, { text: 'Tell him you do know her.' }], e = { click: 'Tell him you don\'t know her.', alts: ['Tell him you do know her.'] };
  ok(E.qeDlgMatch(L, e) === LIB.matchLink(L, e) && E.qeDlgMatch(L, e).text === L[0].text, 'qeDlgMatch = lib matchLink (the chain\'s click first, then its alts)'); }

// ---- stubbed host: the real qeDialog ----
const DLG_SRC = src.slice(src.indexOf('async function qeDialog('), src.indexOf('/** talk / turn-in / start: travel, dialog, judge progress.'));
const LINKS_SRC = src.slice(src.indexOf('function npcLinks('), src.indexOf('/** Alle gatekeepere'));
const HT_SRC = src.slice(src.indexOf('function htmlText('), src.indexOf('/** Alle <a ... bypass ...>tekst</a>'));
/** server = { pages: { name: html }, first, next: { 'page|link text': page }, onClick? } -> { r, clicked[], log[] } */
async function talk(q, a, server, cond) {
  const W = { cur: server.first, clicked: [], log: [], t: 0 };
  const H = {
    Me: { Name: 'Tester' }, Options: {}, File: { WriteAllText: () => { } }, qeLogsFile: (n) => n, isLeader: () => true, num: (v) => Number(v) || 0, now: () => W.t,
    qeS: () => H.Q, Q: { cond, spec: null, dlg: null }, qeSt: () => ({}), qeSave: () => { }, qeLog: (id, m) => W.log.push(m), qeStopped: () => false, Distance: () => 50, qeBagCount: () => 5,
    qeReadJson: (f) => { const m = /quest_dialogs.(\d+)\.json$/.exec(f); return m ? QD(m[1]) : null; }, qeFile: (d, n) => d + '/' + n, qeDataFile: (n) => n,
    qeStayInFront: async () => { }, openNpc: async () => server.pages[W.cur], npcString: (id) => '#' + id, cleanBypass: (c) => String(c).replace(/^-h\s+/, ''),
    sysMsgRing: [], DLG_PAGES: ['npc'], qeSysRefusal: () => ({ ok: false, fatal: true }),
    DLG: { seq: 0, click: async (l) => { W.t += 500; W.clicked.push(l.text); const nx = server.next[W.cur + '|' + l.text]; if (!nx) return { ok: false }; W.cur = nx; return { ok: true, html: server.pages[nx], ev: { seq: 1 } }; }, wait: async () => ({ ok: false }) },
  };
  Object.assign(H, { qeListInProgress: E.qeListInProgress, qeChainFor: E.qeChainFor, qeChainPick: E.qeChainPick, qePickLink: E.qePickLink, qeSysVerdict: E.qeSysVerdict, QE_REFUSE: E.QE_REFUSE, QE_REFUSE_HARD: E.QE_REFUSE_HARD });
  const keys = Object.keys(H).filter(k => k !== 'Q');
  const F = new Function(...keys, HT_SRC + '\n' + LINKS_SRC + '\n' + DLG_SRC + '\nreturn qeDialog;')(...keys.map(k => H[k]));
  const r = await F({ Name: server.name, Id: server.id }, q, a);
  return { r, clicked: W.clicked, log: W.log, end: W.cur };
}
(async () => {
  console.log('quest 1 Letters of Love: Darin (live pages, choice page)');
  { const q = { id: 1, name: 'Letters of Love' };
    const server = { name: 'Darin', id: 30048, first: 'p0', pages: { p0: live('darin_0_live.html'), p1: live('darin_1_live.html'), p2: live('darin_2_live.html'),
      p4: page('Darin', 'You don\'t know her? ... Will you deliver my letter?', ['Say yes.']), p5: page('Darin', 'You do know her! ...', ['Say yes.']), p6: page('Darin', 'Thank you! Here is my letter.', []) },
      next: { 'p0|Quest': 'p1', 'p1|Ask whom he loves.': 'p2', 'p2|Tell him you don\'t know her.': 'p4', 'p2|Tell him you do know her.': 'p5', 'p4|Say yes.': 'p6', 'p5|Say yes.': 'p6' } };
    const t = await talk(q, { act: 'talk', kind: 'start', links: ['Say yes.'], events: ['30048-06.htm'], to: 1 }, server, null);
    ok(t.clicked.join(' > ') === 'Quest > Ask whom he loves. > Tell him you don\'t know her. > Say yes.' && t.end === 'p6', 'start: every page of the chain clicked by TEXT on renumbered codes, the choice page = the chain\'s answer (' + t.clicked.join(' > ') + ')');
    ok(t.r.hit && !t.r.chainMiss && t.r.chain, 'the effect entry was clicked (hit), no miss');
    // the NPC opens the quest page directly (no "Quest" link): the optional / menu entry is skipped
    const s2 = Object.assign({}, server, { first: 'p1' }), t2 = await talk(q, { act: 'talk', kind: 'start', events: ['30048-06.htm'], to: 1 }, s2, null);
    ok(t2.clicked[0] === 'Ask whom he loves.' && t2.end === 'p6', '"Quest" not offered = skipped, the chain goes on from the page shown');
    // a page that is not on the chain: stop and name the offered links
    const s3 = Object.assign({}, server, { pages: Object.assign({}, server.pages, { p1: page('Darin', 'I have nothing for you.', ['Ask about the village.', 'Quit']) }) });
    const t3 = await talk(q, { act: 'talk', kind: 'start', events: ['30048-06.htm'], to: 1 }, s3, null);
    ok(t3.r.chainMiss && /"Ask about the village\." \| "Quit"/.test(t3.r.chainMiss) && /next: "Ask whom he loves\."/.test(t3.r.chainMiss) && t3.clicked.join() === 'Quest', 'no chain link on the page = stop, the why names the offered links and the expected one: ' + t3.r.chainMiss.slice(0, 140));
    ok(!t3.clicked.includes('Quit') && !t3.clicked.includes('Ask about the village.'), 'never a guess on an unknown page');
  }
  console.log('quest 356 Dig Up the Sea of Spores: Gauen (live pages, "What can we do?", the same text twice)');
  { const q = { id: 356, name: 'Dig Up the Sea of Spores!' };
    const server = { name: 'Gauen', id: 30717, first: 'g0', pages: { g0: live('gauen_0_live.html'), g1: live('gauen_1_live.html'),
      g2: page('Magister Gauen', 'The spores ...', ['"Very interesting."']), g3: page('Magister Gauen', 'Collect them ...', ['"I\'ll do it."']), g4: page('Magister Gauen', 'Are you sure?', ['"I\'ll do it."']), g5: page('Magister Gauen', 'Good. Go.', []) },
      next: { 'g0|Quest': 'g1', 'g1|What can we do?': 'g2', 'g2|"Very interesting."': 'g3', 'g3|"I\'ll do it."': 'g4', 'g4|"I\'ll do it."': 'g5' } };
    const t = await talk(q, { act: 'talk', kind: 'start', events: ['30717-05.htm'], to: 1 }, server, null);
    ok(t.clicked.join(' > ') === 'Quest > What can we do? > "Very interesting." > "I\'ll do it." > "I\'ll do it."' && t.end === 'g5' && !t.clicked.includes('Learn skills'), 'start: Quest (not "Learn skills") > What can we do? > ... > "I\'ll do it." twice (' + t.clicked.join(' > ') + ')');
  }
  console.log('fallback + missing chain');
  { // a quest without a chain file keeps the old link guessing
    const server = { name: 'Lector', id: 30001, first: 'x0', pages: { x0: page('Lector', 'Welcome.', ['Quest']), x1: page('Lector', 'Pelts!', ['Say that you\'ll help.']), x2: page('Lector', 'Go.', []) }, next: { 'x0|Quest': 'x1', 'x1|Say that you\'ll help.': 'x2' } };
    const t = await talk({ id: 99999, name: 'No Chain' }, { act: 'talk', kind: 'start', links: ['Say that you\'ll help.'], events: [], to: 1 }, server, null);
    ok(!t.r.chain && t.end === 'x2', 'no chain for the quest = the old event / text choice');
    // a plan talk of a chained quest with no chain for this NPC / cond = stop and say so
    const t2 = await talk({ id: 1, name: 'Letters of Love' }, { act: 'talk', kind: 'step', events: [], to: 9 }, { name: 'Somebody', id: 12345, first: 'x0', pages: server.pages, next: server.next }, 3);
    ok(t2.r.chainMiss && /no dialogue chain/.test(t2.r.chainMiss) && !t2.clicked.length, 'a chained quest, no chain for this talk = nothing clicked, the why says so');
  }
  { const DOT = src.slice(src.indexOf('async function qeDoTalk('), src.indexOf('// ---- hunting ----'));
    ok(/if \(!prog && d\.chainMiss\) return \{ ok: false, fatal: true, msg: 'dialogue: ' \+ d\.chainMiss \}/.test(DOT), 'qeDoTalk: a missed chain with no progress stops the run with that text'); }
  console.log('live phase B: 271 first-time page, 384 Cliff live page, a delivery without links');
  { const q = { id: 271, name: 'Proof of Valor' };
    const server = { name: 'Rukain', id: 30577, first: 'r0', pages: { r0: page('Rukain', 'Hello.', ['Quest']), r1: page('Rukain', 'Prove yourself, young Orc!', ['Fine, I will prove my valor!']), r2: page('Rukain', 'Go then.', []) },
      next: { 'r0|Quest': 'r1', 'r1|Fine, I will prove my valor!': 'r2' } };
    const t = await talk(q, { act: 'talk', kind: 'start', events: ['30577-04.htm'], to: 1 }, server, null);
    ok(t.clicked.join(' > ') === 'Quest > Fine, I will prove my valor!' && t.r.hit && !t.r.chainMiss, '271: the first-time page ("Fine, I will prove my valor!") ends the chain; no miss for the repeat page\'s "I will try again!"'); }
  { const q = { id: 384, name: 'Warehouse Keeper\'s Pastime' };
    const server = { name: 'Cliff', id: 30182, first: 'c0', pages: { c0: page('Warehouse Freightman Cliff', 'Hello.', ['Private Warehouse.', 'Quest.']), c1: live('cliff_0_live.html'), c2: page('Cliff', 'The new rules...', ['Ask what happened.']), c3: page('Cliff', 'Help?', ['Say that you will help.']), c4: page('Cliff', 'Thanks.', []) },
      next: { 'c0|Quest.': 'c1', 'c1|"How do you make the game more interesting?"': 'c2', 'c2|Ask what happened.': 'c3', 'c3|Say that you will help.': 'c4' } };
    const t = await talk(q, { act: 'talk', kind: 'start', events: ['30182-05.htm'], to: 1 }, server, null);
    ok(t.clicked.join(' > ') === 'Quest. > "How do you make the game more interesting?" > Ask what happened. > Say that you will help.', '384: the LIVE first link of Cliff\'s start page is on the chain (' + t.clicked.join(' > ') + ')'); }
  { const d = QD(1), st = d && Object.keys(d.steps).map(k => d.steps[k]).find(s => s.kind !== 'start' && (s.dialog || []).every(e => e.optional || e.kind === 'quest-menu' || e.kind === 'quest-list'));
    if (st) { const r = E.qeChainPick(st.dialog, 0, []); ok(r.done && !r.miss, 'a delivery whose NPC opens the quest page directly (no links): the chain is done — no "page offers no links" stop / log'); }
    else ok(E.qeChainPick([{ click: 'Quest', kind: 'quest-menu' }, { click: '[X]', optional: true, kind: 'quest-list' }], 0, []).done, 'only optional entries left = done, no stop'); }
  { const D2 = src.slice(src.indexOf('async function qeDialog('), src.indexOf('/** talk / turn-in / start: travel, dialog, judge progress.'));
    ok(!/qeLog\(q\.id, 'dialogue stopped/.test(D2), 'qeDialog logs no "dialogue stopped" line itself (qeDoTalk reports a real stop)'); }
  { const q = { id: 362, name: "Bard's Mandolin" }, server = { name: 'Swan', id: 30957, first: 's0', pages: { s0: page('Swan', 'Hello.', ['Quest']), s1: page('Swan', 'Which one?', ["[Bard's Mandolin (In Progress)]", '[Another Quest]']) }, next: { 's0|Quest': 's1' } };
    const t = await talk(q, { act: 'talk', kind: 'start', events: [], to: 1 }, server, null);
    ok(t.r.inProgress && t.clicked.join() === 'Quest', 'live 362: a START talk that finds "(In Progress)" in the quest list stops there: the quest runs at the server, never started again'); }
  console.log('dry-run mirror');
  { const D = require('./quest_dryrun.js'), JAVA = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'Logs', 'quest_java_src.json'), 'utf8')).src; } catch (e) { return ''; } })();
    if (!JAVA) ok(true, '(skipped: no Java source)');
    else {
      const c = (id) => D.verifyOne(id, { src: JAVA, noGeo: true }).fails.map(f => f.code);
      ok(!c(1).includes('no-dialog'), 'quest 1: every talk has a full chain');
      ok(c(238).includes('no-dialog') || c(255).includes('no-dialog'), 'a known partial chain (238 / 255) = dryrun:no-dialog');
    }
  }
  console.log(`\n${fails ? 'FAILED' : 'ALL OK'}: ${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('  FAIL error ' + (e && e.stack || e)); process.exit(1); });
