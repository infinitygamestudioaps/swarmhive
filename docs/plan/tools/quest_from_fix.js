// QUEST FROM FIX (2026-10-27, quest engine agent; coordinator PHASE D: 356 ping-ponged cond 2 <-> 3 — its two kill transitions had no `from`, so each looked
// complete at the other's stage; the brain worker was killed 3x). A KILL / ATTACK transition the extractor left without `from` gets its stage from the Java:
//   1. the cond guards in front of its setCond(N) in onKill / onAttack (isCond(c), getCond() == c, cond == c, a "case c:" of a getCond() switch) -> from = those;
//   2. no guard in the script (356: "if (hasItemsAtLimit(both)) setCond(3) else setCond(2)") -> FORWARD ONLY: every stage of the quest below N (a kill never
//      moves a quest back; 356: kill -> 2 from [1], kill -> 3 from [1, 2]).
// Adds `from` + `fromWhy` only where `from` (and fromMemo) is missing; every other byte of a record stays (manual: true records too: a missing `from` is never a
// hand fix). quest_engine_data.js re-applies it after every regeneration. Dry run: `stage-cycle` (docs/plan/tools/quest_dryrun.js).
// Run: node docs/plan/tools/quest_from_fix.js [--src <datapack root>] [--dry] [--only 356,34]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), QDIR = path.join(ROOT, 'Scripts', 'data', 'quests');
const ARG = process.argv.slice(2), argv = (f, d) => { const i = ARG.indexOf(f); return i >= 0 && ARG[i + 1] ? ARG[i + 1] : d; };
const SRC = argv('--src', (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'Logs', 'quest_java_src.json'), 'utf8')).src; } catch (e) { return ''; } })());
const ONLY = argv('--only', '') ? new Set(argv('--only', '').split(',').map(Number)) : null;
const QJ = path.join(SRC, 'src', 'main', 'java', 'com', 'l2jserver', 'datapack', 'quests');
const strip = (c) => String(c).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
/** a method body by name (onKill / onAttack) */
function body(code, name) { const i = code.search(new RegExp('\\b' + name + '\\s*\\([^)]*\\)\\s*\\{')); if (i < 0) return ''; let j = code.indexOf('{', i), d = 0, k = j; for (; k < code.length; k++) { if (code[k] === '{') d++; else if (code[k] === '}') { d--; if (!d) break; } } return code.slice(j, k + 1); }
/** the cond guards of every setCond(to) in a method body -> Set of conds | null (setCond(to) not literal there) */
function guards(B, to) {
  const re = new RegExp('setCond\\(\\s*' + to + '\\b', 'g'); let m, found = false; const cs = new Set();
  while ((m = re.exec(B))) {
    found = true;
    // the enclosing if-chain: walk back over the open blocks before this point and collect the cond tests of their headers
    let depth = 0;
    for (let i = m.index; i >= 0; i--) {
      const ch = B[i];
      if (ch === '}') depth++;
      else if (ch === '{') { if (depth > 0) { depth--; continue; }
        const head = B.slice(Math.max(0, i - 240), i), h = head.slice(Math.max(head.lastIndexOf(';'), head.lastIndexOf('}'), head.lastIndexOf('{')) + 1);
        let g; const gr = /isCond\(\s*(\d+)\s*\)|getCond\(\)\s*==\s*(\d+)|\bcond\s*==\s*(\d+)/g; while ((g = gr.exec(h))) cs.add(Number(g[1] || g[2] || g[3]));
        const cm = /case\s+(\d+)\s*(?:->|:)\s*$/.exec(h.trim()) ; if (cm && /switch\s*\(\s*\w*\.?getCond\(\)/.test(B.slice(Math.max(0, i - 2000), i))) cs.add(Number(cm[1]));
      }
    }
  }
  return found ? cs : null;
}
function fixOne(q, code) {
  const C = strip(code), K = body(C, 'onKill') + '\n' + body(C, 'onAttack');
  const stages = new Set([1]); (q.transitions || []).forEach(t => { if (typeof t.to === 'number' && t.to >= 1) stages.add(t.to); (t.from || []).forEach(c => stages.add(Number(c))); });
  const out = [];
  (q.transitions || []).forEach(t => {
    if (t.start || !t.trigger || !/^(kill|attack)$/.test(t.trigger.type) || typeof t.to !== 'number' || (Array.isArray(t.from) && t.from.length) || (Array.isArray(t.fromMemo) && t.fromMemo.length)) return;
    const g = guards(K, t.to), gs = g ? [...g].filter(c => c !== t.to && stages.has(c)).sort((a, b) => a - b) : [];
    if (gs.length) { t.from = gs; t.fromWhy = 'quest_from_fix: cond guard before setCond(' + t.to + ') in onKill/onAttack'; }
    else { const fw = [...stages].filter(c => c < t.to).sort((a, b) => a - b); if (!fw.length) return; t.from = fw; t.fromWhy = 'quest_from_fix: no cond guard before setCond(' + t.to + ') in the script: forward only (a kill never moves the quest back)'; }
    out.push(t.to);
  });
  return out;
}
module.exports = { guards, fixOne };
if (require.main === module) {
  if (!SRC || !fs.existsSync(QJ)) { console.log('quest_from_fix: no datapack (--src)'); process.exit(2); }
  const dirs = {}; fs.readdirSync(QJ).forEach(d => { const k = /^Q(\d{5})_/.exec(d); if (k) dirs[Number(k[1])] = path.join(QJ, d); });
  let tr = 0; const list = [];
  for (const f of fs.readdirSync(QDIR).filter(x => /^\d+\.json$/.test(x))) {
    const id = Number(f.slice(0, -5)), dir = dirs[id]; if (!dir || (ONLY && !ONLY.has(id))) continue;
    const file = path.join(QDIR, f), raw = fs.readFileSync(file, 'utf8'), q = JSON.parse(raw.replace(/^﻿/, ''));
    const code = fs.readdirSync(dir).filter(x => x.endsWith('.java')).map(x => fs.readFileSync(path.join(dir, x), 'utf8')).join('\n');
    const ch = fixOne(q, code); if (!ch.length) continue;
    tr += ch.length; list.push(id);
    if (!ARG.includes('--dry')) { const pretty = /^\{\s*\n/.test(raw) ? (/^\{\n\s{2}"/.test(raw) ? 2 : 1) : 0; fs.writeFileSync(file, pretty ? JSON.stringify(q, null, pretty) + (raw.endsWith('\n') ? '\n' : '') : JSON.stringify(q)); }
  }
  console.log(`quest_from_fix: ${tr} kill / attack transitions got their stage in ${list.length} records${ARG.includes('--dry') ? ' (dry)' : ''}: ${list.join(', ')}`);
}
