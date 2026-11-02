// PATHDONE-2026-11-02: a class path quest step is skipped once the character already has its 1st class
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const i = SRC.indexOf('function planPathQuestGone('); const G = new Function(SRC.slice(i, SRC.indexOf('\n', i)) + '\nreturn planPathQuestGone;')();
check(G('Path Of The Dark Wizard', 39) && G('Path to a Cleric', 15), 'path quest + 1st class (Dark Wizard 39, Cleric 15) = skipped');
check(!G('Path Of The Dark Wizard', 38) && !G('Path to a Cleric', 10), 'path quest + base class (Dark Mystic 38, Mystic 10) = still done');
check(!G('Dangerous Seduction', 39) && !G('Bones Tell The Future', 39), 'normal quests are never skipped by this');
check(/if \(planPathQuestGone\(String\(\(q0 && q0\.name\) \|\| step\.name \|\| ''\), num\(Me\.ClassId\)\)\) return \{ ok: true, skipped: true/.test(SRC), 'planStepQuest checks it before the quest starts');
check(/PATHDONE-RUNNING[\s\S]{0,300}planPathQuestGone\([\s\S]{0,120}qeStopReq\('class changed/.test(SRC), 'a running path quest step stops when the class changes mid-step');
console.log(`pathdone: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
