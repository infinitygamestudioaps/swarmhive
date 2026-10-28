// NPC DIALOGS VIEWER (2026-10-27): read-only look at Scripts/data/npc_dialogs/*.json + Scripts/data/quest_dialogs.json (format docs/plan/npc_dialogs.md).
//   node docs/plan/tools/npc_dialogs.js --npc <id|name>     the NPC's whole dialogue tree (first talk, every page, every link -> target / effect)
//   node docs/plan/tools/npc_dialogs.js --quest <id>        every talk step of the quest: the link texts to click, in order
//   node docs/plan/tools/npc_dialogs.js --diff [<id|name>]  L2Toggle (live) vs datapack differences
//   node docs/plan/tools/npc_dialogs.js --coverage          NPCs with live proof vs datapack only, quest chain counts
//   add --json for raw JSON.
'use strict';
const path = require('path');
const L = require('./npc_dialogs_lib.js');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] && !/^--/.test(args[i + 1]) ? args[i + 1] : true) : null; };
const JSONOUT = args.includes('--json');
const index = () => (L.rd(path.join(L.DIALOG_DIR, '_index.json'), { npcs: {} }).npcs);

function findNpcs(q) {
  if (/^\d+$/.test(String(q))) return [Number(q)];
  const I = index(); const n = String(q).toLowerCase();
  const ex = Object.keys(I).filter(id => String(I[id].n).toLowerCase() === n);
  return (ex.length ? ex : Object.keys(I).filter(id => String(I[id].n).toLowerCase().includes(n))).map(Number).slice(0, 10);
}
function showNpc(id) {
  const R = L.loadNpc(id); if (!R) { console.log('no dialog data for npc', id); return; }
  if (JSONOUT) { console.log(JSON.stringify(R, null, 1)); return; }
  console.log(`=== ${R.name}${R.title ? ' (' + R.title + ')' : ''} #${R.npcId}  ${R.type}  ${R.live ? 'LIVE-PROOF' : 'datapack only'}  pages ${Object.keys(R.pages).length}`);
  console.log('First talk:'); R.firstTalk.forEach(f => console.log(`  ${f.page}${f.when ? '   when ' + f.when : ''}   [${f.src}]`));
  const qs = Object.entries(R.quests || {}); if (qs.length) { console.log('Quests here:'); qs.forEach(([q, v]) => console.log(`  ${q} ${v.name}   list text ${v.listText.join(' / ')}`)); }
  // tree walk from the first pages, then the rest
  const seen = new Set();
  const show = (pid, depth) => {
    const P = R.pages[pid]; if (!P || seen.has(pid) || depth > 8) return; seen.add(pid);
    const pad = '  '.repeat(depth);
    console.log(`${pad}[${pid}]${P.outcome ? ' <' + P.outcome + '>' : ''}${P.live ? ' (live ' + (P.live.file || '') + ')' : ''}${P.when ? '  when: ' + P.when.join(' / ').slice(0, 160) : ''}`);
    console.log(`${pad}  "${L.short(P.text, 160)}"`);
    for (const l of P.links) {
      console.log(`${pad}  -> "${l.text}"${l.dpText ? ' (datapack: "' + l.dpText + '")' : ''}  {${l.kind}${l.event ? ' ' + l.event : ''}}${l.to ? ' => ' + l.to : ''}${l.effect ? '  EFFECT ' + l.effect : ''}${l.live ? '  LIVE' : ''}`);
    }
    for (const l of P.links) if (l.to) show(l.to, depth + 1);
  };
  R.firstTalk.forEach(f => f.page && show(f.page, 1));
  const rest = Object.keys(R.pages).filter(p => !seen.has(p));
  if (rest.length) { console.log('Other pages (quest pages shown by onTalk / not linked from the first page):'); rest.forEach(p => show(p, 1)); }
  if (R.liveDiff) { console.log('L2Toggle vs datapack:'); R.liveDiff.forEach(d => console.log('  - ' + d)); }
  if (R.liveClicks) { console.log('Clicked live (Logs/dialog.log):'); R.liveClicks.slice(0, 30).forEach(c => console.log(`  "${c.text}" x${c.n}${c.inDatapack ? '' : '  (not in datapack)'}`)); }
}
function showQuest(qid) {
  const D = L.loadQuestDialogs(); const Q = D && D.quests[String(qid)];
  if (!Q) { console.log('no dialog chain for quest', qid); return; }
  if (JSONOUT) { console.log(JSON.stringify(Q, null, 1)); return; }
  console.log(`=== Quest ${qid} ${Q.name}`);
  for (const [k, s] of Object.entries(Q.steps)) {
    console.log(`\n[${k}] ${s.npcName} #${s.npcId}  cond ${s.cond} -> ${s.to}  trigger ${s.trigger}${s.event ? ' (' + s.event + ')' : ''}  effect ${s.effect}  ${s.status.toUpperCase()}${s.live ? '  LIVE' : ''}${s.why ? '  why: ' + s.why : ''}`);
    s.dialog.forEach((d, i) => console.log(`   ${i + 1}. click "${d.click}"${d.alts && d.alts.length ? '  or ' + d.alts.map(a => '"' + a + '"').join(' / ') : ''}${d.optional ? '  (only if shown)' : ''}${d.effect ? '  => ' + d.effect : ''}   on ${d.page || '?'}${d.live ? '  LIVE' : ''}`)
      || (d.choice ? console.log(`        choice: ${d.choice.why}${d.choice.others.length ? '; never: ' + d.choice.others.map(o => '"' + o + '"').join(' / ') : ''}`) : null));
    console.log(`   result page: ${s.result || s.startPage || '-'}`);
    if (s.refusals) console.log(`   refusal pages: ${s.refusals.join(' | ')}`);
  }
}
function showDiff(q) {
  const rep = L.rd(path.join(L.DIALOG_DIR, '_report.json'), {});
  let list = rep.liveDiffs || [];
  if (q && q !== true) { const ids = findNpcs(q); list = list.filter(d => ids.includes(d.npcId)); }
  if (JSONOUT) { console.log(JSON.stringify(list, null, 1)); return; }
  list.forEach(d => { console.log(`${d.name} #${d.npcId}`); d.diffs.forEach(x => console.log('   - ' + x)); });
  if (!q || q === true) console.log(`\nCommunity Board (server custom, not NPC dialogs): ${rep.board ? rep.board.pages + ' pages; ' + rep.board.titles.join(' | ') : '-'}`);
}
function showCoverage() {
  const rep = L.rd(path.join(L.DIALOG_DIR, '_report.json'), {}); const I = index();
  const ids = Object.keys(I); const live = ids.filter(i => I[i].live);
  if (JSONOUT) { console.log(JSON.stringify({ coverage: rep.coverage, questChains: rep.questChains }, null, 1)); return; }
  console.log(`NPCs ${ids.length}: live proof ${live.length}, datapack only ${ids.length - live.length}`);
  console.log('Pages/links:', JSON.stringify(rep.coverage));
  console.log('Quest chains:', JSON.stringify(rep.questChains));
  console.log('Live-proof NPCs:', live.map(i => I[i].n + '#' + i).join(', '));
  if (rep.missing && rep.missing.length) { console.log('\nSteps without a full chain:'); rep.missing.forEach(m => console.log(`  ${m.quest} ${m.name} ${m.key}: ${m.why}`)); }
}

if (opt('--npc')) findNpcs(opt('--npc')).forEach(showNpc);
else if (opt('--quest')) showQuest(Number(opt('--quest')));
else if (args.includes('--diff')) showDiff(opt('--diff'));
else if (args.includes('--coverage')) showCoverage();
else console.log('usage: node docs/plan/tools/npc_dialogs.js --npc <id|name> | --quest <id> | --diff [<id|name>] | --coverage  [--json]');
