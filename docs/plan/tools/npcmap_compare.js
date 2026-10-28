// compare today's !npcmap pages (Logs/npcmap_<Npc>.json, runs since argv[2]) with Scripts/data/npc_dialogs/<id>.json
const fs = require('fs'), path = require('path');
const ROOT = 'C:/RainbowControl/l2/L2Swarm', L = require(ROOT + '/docs/plan/tools/npc_dialogs_lib.js');
const since = process.argv[2] || '2026-10-27T14:30';
const sn = s => String(s || '').replace(/^[^:]{0,60}:/, '').replace(/&\$\d+;/g, '').replace(/&#57;/g, '').replace(/\bAdena\b/gi, '').toLowerCase().replace(/[^a-z]/g, '');
const out = [];
for (const f of fs.readdirSync(ROOT + '/Logs').filter(f => /^npcmap_.*\.json$/.test(f))) {
  const I = L.rd(ROOT + '/Logs/' + f, null); if (!I || !I.npcId || !I.lastRun || I.lastRun.at < since) continue;
  const D = L.loadNpc(I.npcId); if (!D) continue;
  const pages = Object.entries(D.pages || {}).map(([pid, P]) => ({ pid, t: sn(P.text), t2: sn(P.dpText || ''), links: (P.links || []).map(l => L.norm(l.text)).concat((P.links || []).filter(l => l.dpText).map(l => L.norm(l.dpText))) }));
  const allData = new Set(pages.flatMap(p => p.links)); for (const q of Object.values(D.quests || {})) for (const t of q.listText || []) allData.add(L.norm(t));
  const res = { npc: I.npc, id: I.npcId, by: I.lastRun.by, pages: [] };
  for (const p of I.pages.filter(p => p.at >= since && !p.error)) {
    const body = sn(String(p.text || '')).slice(0, 40);
    const hit = body.length < 8 ? null : pages.find(x => x.t.startsWith(body) || (x.t2 && x.t2.startsWith(body))) || pages.find(x => body.length >= 20 && (x.t.includes(body.slice(0, 20))));
    const liveL = (p.elems || []).map(e => L.norm(e.text)).filter(Boolean);
    const extra = (p.elems || []).filter(e => e.text && !allData.has(L.norm(e.text))).map(e => e.text);
    let missing = [];
    if (hit) { const ls = new Set(liveL); missing = hit.links.filter(l => l && !ls.has(l)); }
    res.pages.push({ path: p.path.join(' > ') || '(first page)', file: p.file, match: hit ? hit.pid : null, text: String(p.text || '').slice(0, 70), extra, missing: [...new Set(missing)] });
  }
  out.push(res);
}
console.log(JSON.stringify(out, null, 1));
