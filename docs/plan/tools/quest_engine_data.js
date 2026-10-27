// QUEST ENGINE DATA (2026-10-12): the swarm.js quest engine (QENGINE block, patch_questengine.js) must NOT parse the 6 MB
// Scripts/data/quests_h5.json in every script engine (12+ engines, reload memory). This splits it into small files:
//   Scripts/data/quests/<id>.json      one quest record (description / acceptText / file / className dropped)
//   Scripts/data/quests/_index.json    { generated, ids: { "<id>": { n: name, t: type, e: endless, l: [min, max] } } }  (name lookup for !quest <name>)
//   Scripts/data/quest_protect.json    { generated, questItems: [ids] }  every registered / client quest item (never sold / stashed / handed over / destroyed)
// Run after docs/plan/tools/quest_extract.js:   node docs/plan/tools/quest_engine_data.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'Scripts', 'data', 'quests_h5.json');
const ITEMS = path.join(ROOT, 'Scripts', 'data', 'quest_items_h5.json');
const OUT = path.join(ROOT, 'Scripts', 'data', 'quests');
const PROT = path.join(ROOT, 'Scripts', 'data', 'quest_protect.json');
function writeAtomic(f, s) { const t = f + '.tmp' + process.pid; fs.writeFileSync(t, s); fs.renameSync(t, f); }
const Q = JSON.parse(fs.readFileSync(SRC, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const ids = {}, gen = new Date().toISOString();
let n = 0, bytes = 0, synced = 0;
for (const id of Object.keys(Q.quests)) {
  const q = Object.assign({}, Q.quests[id]);
  delete q.description; delete q.acceptText; delete q.file; delete q.className;
  // MANUAL GUARD 2026-10-12: a record corrected by hand (manual: true, e.g. 174 Supply Check by docs/plan/tools/beginner_gear.js --fix174) is kept
  let s = JSON.stringify(q);
  try { const old = JSON.parse(fs.readFileSync(path.join(OUT, id + '.json'), 'utf8')); if (old && old.manual === true && !q.manual) { s = JSON.stringify(old); Object.assign(q, old); Q.quests[id] = Object.assign({}, Q.quests[id], old); synced++; } } catch (e) { }
  // MANUALSYNC-2026-10-27: the quest page reads quests_h5.json; a hand-fixed record (fixer agents, --fix174) is copied back into it (description /
  // acceptText / file kept), so the page and the engine show the same steps
  writeAtomic(path.join(OUT, id + '.json'), s);
  ids[id] = { n: q.name, t: q.type, e: !!q.endless, l: [q.level ? q.level.min : null, q.level ? q.level.max : null] };
  n++; bytes += s.length;
}
writeAtomic(path.join(OUT, '_index.json'), JSON.stringify({ generated: gen, source: 'Scripts/data/quests_h5.json', ids }));
if (synced) { writeAtomic(SRC, JSON.stringify(Q)); console.log('quests_h5.json: ' + synced + ' hand-fixed records copied back (quest page = engine)'); }
const I = JSON.parse(fs.readFileSync(ITEMS, 'utf8'));
const prot = Object.keys(I.items || {}).filter(k => I.items[k] && I.items[k].questItem).map(Number).filter(x => x && x !== 57).sort((a, b) => a - b);
writeAtomic(PROT, JSON.stringify({ generated: gen, source: 'Scripts/data/quest_items_h5.json (questItem: true)', questItems: prot }));
console.log(`quests: ${n} files in ${path.relative(ROOT, OUT)} (avg ${Math.round(bytes / n)} bytes), index ok; protected quest items: ${prot.length}`);
