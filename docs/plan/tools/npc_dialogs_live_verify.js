// Live verification: L2Toggle live traffic (Logs/dialog.log + live html dumps) vs Scripts/data/npc_dialogs + quest_dialogs.
// Read-only. Usage: node live_verify.js <since ISO|all> > out.json
const fs = require('fs'), path = require('path');
const ROOT = 'C:/RainbowControl/l2/L2Swarm';
const L = require(ROOT + '/docs/plan/tools/npc_dialogs_lib.js');
const since = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : '';
const idx = L.rd(path.join(L.DIALOG_DIR, '_index.json'), {}).npcs || {};
const byName = {}; for (const [id, e] of Object.entries(idx)) (byName[e.n] = byName[e.n] || []).push(+id);
const sn = s => String(s || '').replace(/^[^:]{0,60}:/, '').replace(/&\$\d+;/g, '').replace(/^556/, '').replace(/&#57;/g, '').replace(/\bAdena\b/gi, '').replace(/&nbsp;/g,' ').toLowerCase().replace(/[^a-z]/g, '');
const cache = {}; const npc = id => cache[id] || (cache[id] = L.loadNpc(id));
function dataOf(name) {
  const ids = byName[name] || []; const links = new Map(), pages = [];
  for (const id of ids) { const N = npc(id); if (!N) continue;
    for (const q of Object.values(N.quests || {})) for (const t of q.listText || []) links.set(L.norm(t), { id, page: '@questlist' });
    for (const [pid, P] of Object.entries(N.pages || {})) {
      const lt = (P.links || []).map(l => l.text).join(' ');
      pages.push({ id, pid, full: sn((P.text || '') + ' ' + lt), full2: sn((P.dpText || P.text || '') + ' ' + lt), live: !!P.live });
      for (const l of P.links || []) { links.set(L.norm(l.text), { id, page: pid }); if (l.dpText) links.set(L.norm(l.dpText), { id, page: pid }); }
    } }
  return { ids, links, pages };
}
function pageMatch(D, snip) {
  const s = sn(snip); if (s.length < 6) return { ok: true, why: 'short' };
  const k = s.slice(0, Math.min(s.length, 40));
  const hit = D.pages.find(p => p.full.startsWith(k) || p.full2.startsWith(k)) || D.pages.find(p => p.full.includes(k.slice(0, 25)) || p.full2.includes(k.slice(0, 25)));
  return hit ? { ok: true, page: hit.pid, id: hit.id } : { ok: false };
}
const txt = fs.readFileSync(path.join(ROOT, 'Logs/dialog.log'), 'utf8');
const reO = /^(\S+) (\S+): opened (.+?) \([^)]*\) -> (?:quest )?page '([\s\S]*?)' after/;
const reC = /^(\S+) (\S+): clicked '([\s\S]*?)' at (.+?) -> (?:(?:quest )?page '([\s\S]*?)'|teleport to ([-\d,]+)|([^']*?)) after/;
const out = {}; const get = n => out[n] || (out[n] = { name: n, ids: (byName[n] || []), events: 0, pagesOk: new Set(), pagesBad: new Map(), linksOk: new Set(), linksBad: new Map(), chars: new Set(), last: '' });
let lines = 0;
for (const line of txt.split(/\r?\n/)) {
  if (since && line.slice(0, 24) < since) continue;
  let m;
  if ((m = reO.exec(line))) { if (/Community Board/.test(m[3])) continue; lines++; const R = get(m[3]); R.events++; R.chars.add(m[2]); R.last = m[1];
    const D = dataOf(m[3]); const pm = pageMatch(D, m[4]); if (pm.ok) R.pagesOk.add(m[4].slice(0, 50)); else R.pagesBad.set(m[4].slice(0, 70), (R.pagesBad.get(m[4].slice(0, 70)) || 0) + 1); continue; }
  if ((m = reC.exec(line))) { if (/Community Board/.test(m[4])) continue; lines++; const R = get(m[4]); R.events++; R.chars.add(m[2]); R.last = m[1];
    const D = dataOf(m[4]); const k = L.norm(m[3]);
    if (D.links.has(k)) R.linksOk.add(m[3]); else R.linksBad.set(m[3], (R.linksBad.get(m[3]) || 0) + 1);
    if (m[5]) { const pm = pageMatch(D, m[5]); if (pm.ok) R.pagesOk.add(m[5].slice(0, 50)); else R.pagesBad.set(m[5].slice(0, 70), (R.pagesBad.get(m[5].slice(0, 70)) || 0) + 1); }
  }
}
// quest chains: every click of a chain at an NPC that had live traffic -> was the click text seen live / is it on the data page?
const QD = L.loadQuestDialogs(); const chainIssues = [];
const liveClicksByNpc = {}; for (const R of Object.values(out)) liveClicksByNpc[R.name] = new Set([...R.linksOk, ...R.linksBad.keys()].map(L.norm));
for (const [qid, Q] of Object.entries(QD.quests || {})) for (const [key, S] of Object.entries(Q.steps || {})) {
  const N = npc(S.npcId); if (!N) continue;
  for (const d of S.dialog || []) {
    if (d.page === '@questlist') continue;
    const P = (N.pages || {})[d.page]; const want = [d.click].concat(d.alts || []).map(L.norm);
    if (!P) { chainIssues.push({ qid, key, npc: N.name, page: d.page, click: d.click, issue: 'page not in the NPC file' }); continue; }
    const onPage = (P.links || []).some(l => want.includes(L.norm(l.text)) || (l.dpText && want.includes(L.norm(l.dpText))));
    if (!onPage) chainIssues.push({ qid, key, npc: N.name, page: d.page, click: d.click, issue: 'click text not among the page links', pageLive: !!P.live });
    else if (P.live && P.live.file && !/dialog\.log/.test(P.live.file)) {
      const liveL = (P.links || []).filter(l => l.live).map(l => L.norm(l.text));
      if (liveL.length && !want.some(w => liveL.includes(w)) && !d.optional) chainIssues.push({ qid, key, npc: N.name, page: d.page, click: d.click, issue: 'live page captured but this link was not seen live on it', live: liveL.slice(0, 8) });
    }
  }
}
const res = { since: since || 'all', lines, npcs: Object.values(out).map(R => ({ name: R.name, ids: R.ids, events: R.events, chars: [...R.chars], last: R.last,
  pagesOk: R.pagesOk.size, pagesBad: [...R.pagesBad].map(([k, n]) => ({ snip: k, n })), linksOk: [...R.linksOk], linksBad: [...R.linksBad].map(([k, n]) => ({ text: k, n })) })).sort((a, b) => b.events - a.events),
  chainIssues };
process.stdout.write(JSON.stringify(res, null, 1));
