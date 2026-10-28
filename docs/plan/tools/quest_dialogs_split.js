// QUEST DIALOGS SPLIT (2026-10-27, quest engine agent). Scripts/data/quest_dialogs.json (docs/plan/tools/npc_dialogs_build.js, format docs/plan/npc_dialogs.md,
// 2.6 MB) -> Scripts/data/quest_dialogs/<id>.json = that quest's talk-step chains only, so the swarm.js engine (V8, small files only) reads ~5 KB per quest.
// No extraction here: a plain copy of quests[id]. Run after every npc_dialogs_build.js:  node docs/plan/tools/quest_dialogs_split.js
'use strict';
const fs = require('fs'), path = require('path');
const DATA = path.resolve(__dirname, '..', '..', '..', 'Scripts', 'data'), SRC = path.join(DATA, 'quest_dialogs.json'), OUT = path.join(DATA, 'quest_dialogs');
const j = JSON.parse(fs.readFileSync(SRC, 'utf8').replace(/^﻿/, ''));
fs.mkdirSync(OUT, { recursive: true });
let n = 0, w = 0;
for (const [id, q] of Object.entries(j.quests || {})) {
  n++; const f = path.join(OUT, id + '.json'), s = JSON.stringify({ id: Number(id), name: q.name, generated: (j.meta || {}).generated || '', src: 'Scripts/data/quest_dialogs.json', steps: q.steps || {} });
  let old = ''; try { old = fs.readFileSync(f, 'utf8'); } catch (e) { }
  if (old !== s) { fs.writeFileSync(f, s); w++; }
}
// a quest gone from the source = its file goes too (never a stale chain)
for (const f of fs.readdirSync(OUT)) { const m = /^(\d+)\.json$/.exec(f); if (m && !(j.quests || {})[m[1]]) { fs.unlinkSync(path.join(OUT, f)); w++; } }
console.log(`quest_dialogs_split: ${n} quests, ${w} files written / removed in ${OUT}`);
