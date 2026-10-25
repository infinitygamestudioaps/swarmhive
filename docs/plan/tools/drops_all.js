// DROPS ALL (owner 2026-10-25: "I want to be able to click a room or hunting zone under /map and see monsters and drops from the specific zone"):
// every monster of the L2J High Five datapack NPC files (the local copy Scripts/data/npcstats/*.xml, the same datapack as spawns_h5.json) with
// its KILL drops (<death> groups: one item per group roll; real chance = group chance x item chance / 100) and SPOIL list (<corpse>).
//   node docs/plan/tools/drops_all.js   -> Scripts/data/drops_h5.json { monsters: { <id>: { n, l, k: [[item, min, max, chance %]], s: [...] } } }
// Item names come from Dashboard/data/items.json (client data) when the dashboard shows them.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DIR = path.join(ROOT, 'Scripts', 'data', 'npcstats'), OUT = path.join(ROOT, 'Scripts', 'data', 'drops_h5.json');
const attrs = (tag) => { const o = {}; tag.replace(/(\w+)="([^"]*)"/g, (_, k, v) => { o[k] = v; return ''; }); return o; };
const r4 = (v) => Math.round(v * 10000) / 10000;
const items = (xml) => { const out = [], re = /<item\s[^>]*\/?>/g; let m; while ((m = re.exec(xml))) { const a = attrs(m[0]); out.push({ id: +a.id, min: +a.min || 1, max: +a.max || +a.min || 1, chance: +a.chance || 0 }); } return out; };
const mons = {}; let n = 0, nk = 0, ns = 0;
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.xml')).sort()) {
  const x = fs.readFileSync(path.join(DIR, f), 'utf8'), re = /<npc\s[^>]*>([\s\S]*?)<\/npc>/g; let m;
  while ((m = re.exec(x))) {
    const a = attrs(m[0].slice(0, m[0].indexOf('>') + 1));
    if (!/Monster|RaidBoss|GrandBoss|Festival|Chest/.test(a.type || '')) continue;
    const body = m[1], r = { n: a.name || '', l: +a.level || 0, k: [], s: [] };
    const dd = /<death>([\s\S]*?)<\/death>/.exec(body);
    if (dd) { const gr = /<group\s+chance="([\d.]+)"\s*>([\s\S]*?)<\/group>/g; let g;
      while ((g = gr.exec(dd[1]))) items(g[2]).forEach(it => r.k.push([it.id, it.min, it.max, r4(+g[1] * it.chance / 100)]));
      // drops outside a group (older format): the item chance is the real chance
      const loose = dd[1].replace(/<group[\s\S]*?<\/group>/g, ''); items(loose).forEach(it => r.k.push([it.id, it.min, it.max, r4(it.chance)])); }
    const cc = /<corpse>([\s\S]*?)<\/corpse>/.exec(body);
    if (cc) items(cc[1]).forEach(it => r.s.push([it.id, it.min, it.max, r4(it.chance)]));
    r.k.sort((p, q) => q[3] - p[3]); r.s.sort((p, q) => q[3] - p[3]);
    mons[a.id] = r; n++; if (r.k.length) nk++; if (r.s.length) ns++;
  }
}
fs.writeFileSync(OUT, JSON.stringify({ _readme: 'L2J H5 datapack kill drops (k: [item, min, max, real chance %] = group chance x item chance) and spoils (s) per monster id; docs/plan/tools/drops_all.js', generated: new Date().toISOString(), monsters: mons }));
console.log(`${n} monsters, ${nk} with kill drops, ${ns} with spoils -> ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
