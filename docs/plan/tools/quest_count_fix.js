// QUEST COUNT FIX (2026-10-27, quest engine agent; coordinator PHASE C: "356: the plan says 20 each, the script and Gauen want 50 ... check ALL quests").
// Root cause: the engine collected a repeatable / turn-in quest's drop to its turn-in batch (20) when the drop has a limit, but a script whose hand-in /
// stage check is hasItemsAtLimit(...) accepts only the FULL set (356 Carnivore + Herbivorous Spore 50 each, 380 ...). This marks every drop whose item is a
// holder in a hasItemsAtLimit(...) call of the quest's Java with `atLimit: true` + `atLimitSrc` (swarm.js qeNeeds then always asks for the limit).
// The other half (a kill stage stored as the count BEFORE the last kill, 9 of 10) is read right by the engine (swarm.js qeKillNeedList), not here.
// Only adds / refreshes those two fields; every other byte of a record (also manual: true ones) stays. Read-only on the datapack.
// Run: node docs/plan/tools/quest_count_fix.js [--src <datapack root>] [--dry]      Test: docs/plan/tools/test_questengine_features.js (K)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), QDIR = path.join(ROOT, 'Scripts', 'data', 'quests');
const ARG = process.argv.slice(2), argv = (f, d) => { const i = ARG.indexOf(f); return i >= 0 && ARG[i + 1] ? ARG[i + 1] : d; };
const SRC = argv('--src', (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'Logs', 'quest_java_src.json'), 'utf8')).src; } catch (e) { return ''; } })());
const QJ = path.join(SRC, 'src', 'main', 'java', 'com', 'l2jserver', 'datapack', 'quests');
/** Java source -> { itemId: 'hasItemsAtLimit(... NAME ...)' } for every holder used in a hasItemsAtLimit call */
function atLimitItems(code) {
  const c = String(code).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const holders = {}; let m; const re = /static\s+final\s+\w*ItemChanceHolder\s+(\w+)\s*=\s*new\s+\w*ItemChanceHolder\(\s*(\d+)/g;
  while ((m = re.exec(c))) holders[m[1]] = Number(m[2]);
  const re2 = /static\s+final\s+ItemHolder\s+(\w+)\s*=\s*new\s+ItemHolder\(\s*(\d+)/g; while ((m = re2.exec(c))) holders[m[1]] = Number(m[2]);
  const out = {}; const call = /hasItemsAtLimit\(\s*[\w.()]+\s*,\s*([^)]*)\)/g;
  while ((m = call.exec(c))) m[1].split(',').map(s => s.trim()).forEach(nm => { if (holders[nm]) out[holders[nm]] = 'hasItemsAtLimit(' + nm + ')'; });
  return out;
}
module.exports = { atLimitItems };
if (require.main === module) {
  if (!SRC || !fs.existsSync(QJ)) { console.log('quest_count_fix: no datapack (--src)'); process.exit(2); }
  const dirs = {}; fs.readdirSync(QJ).forEach(d => { const k = /^Q(\d{5})_/.exec(d); if (k) dirs[Number(k[1])] = path.join(QJ, d); });
  let changed = 0, marked = 0; const list = [];
  for (const f of fs.readdirSync(QDIR).filter(x => /^\d+\.json$/.test(x))) {
    const id = Number(f.slice(0, -5)), dir = dirs[id]; if (!dir) continue;
    const code = fs.readdirSync(dir).filter(x => x.endsWith('.java')).map(x => fs.readFileSync(path.join(dir, x), 'utf8')).join('\n');
    const A = atLimitItems(code); if (!Object.keys(A).length) continue;
    const file = path.join(QDIR, f), raw = fs.readFileSync(file, 'utf8'), q = JSON.parse(raw.replace(/^﻿/, ''));
    let ch = false;
    (q.drops || []).forEach(d => { const src = A[Number(d.item)]; if (src && Number(d.limit) > 0) { if (d.atLimit !== true || d.atLimitSrc !== src) { d.atLimit = true; d.atLimitSrc = src; ch = true; } marked++; } });
    if (ch) { changed++; list.push(id); if (!ARG.includes('--dry')) { const pretty = /^\{\s*\n/.test(raw) ? (/^\{\n\s{2}"/.test(raw) ? 2 : 1) : 0; fs.writeFileSync(file, pretty ? JSON.stringify(q, null, pretty) + (raw.endsWith('\n') ? '\n' : '') : JSON.stringify(q)); } }
  }
  console.log(`quest_count_fix: ${marked} limited drops of hasItemsAtLimit scripts are atLimit; ${changed} records ${ARG.includes('--dry') ? 'would change' : 'changed'}: ${list.join(', ')}`);
}
