// QUEST RACE FIX (TESTERFIX-2026-10-19, public tester l3tal: the party plan kept offering "Spirit of Craftsman" to non-Dark Elves; Blacksmith
// Karrod answered "I will have no business with you. I just do not trust others" and the run failed after 4 tries).
// quest_extract.js reads race / class conditions from ternaries like  htmltext = (player.getRace() != Race.DARK_ELF) ? "30307-00.htm" : ...
// whose TRUE branch is the REFUSAL page, and stores them unflipped: "notRaces: [DARK_ELF]" where the quest is Dark-Elf ONLY. Until the
// extractor flips those (needs a datapack clone to re-run and check), this table corrects the quests known from High Five:
//   races = only these races may take it; classes = only these classes. Quests 162 / 163 / 164 ("not for Dark Elves") are right and untouched;
//   60 Good Work's Reward is unclear and untouched.
// Writes Scripts/data/quests/<id>.json, Scripts/data/quests_h5.json and Scripts/data/quest_farm.json (same "requirements" objects).
// Run after every quest_extract.js / quest_engine_data.js run:   node docs/plan/tools/quest_race_fix.js [--check]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), D = path.join(ROOT, 'Scripts', 'data');
const FIX = {
  2: { races: ['ELF', 'HUMAN'] },          // What Women Want
  3: { races: ['DARK_ELF'] },              // Will the Seal be Broken?
  4: { races: ['ORC'] },                   // Long Live the Pa'agrio Lord
  103: { races: ['DARK_ELF'] },            // Spirit of Craftsman
  107: { races: ['ORC'] },                 // Merciless Punishment
  108: { races: ['DWARF'] },               // Jumble, Tumble, Diamond Fuss
  160: { races: ['ELF'] },                 // Nerupa's Request
  175: { races: ['KAMAEL'] },              // The Way of the Warrior
  178: { races: ['KAMAEL'] },              // Iconic Trinity
  179: { races: ['KAMAEL'] },              // Into The Large Cavern
  232: { races: ['ORC'], classes: ['orcShaman'] },   // Test Of The Lord (Orc Shaman -> Overlord)
  266: { races: ['ELF'] },                 // Pleas of Pixies
  316: { races: ['ELF'] },                 // Destroy Plague Carriers
};
const CHECK = process.argv.includes('--check');
/** one requirements object -> corrected (returns true when it changed) */
function fixReq(req, f) {
  if (!req || typeof req !== 'object') return false;
  const before = JSON.stringify(req);
  if (f.races) { req.races = f.races.slice(); req.notRaces = (req.notRaces || []).filter(r => !f.races.includes(r)); if (!req.notRaces.length) delete req.notRaces; }
  if (f.classes) { req.classes = f.classes.slice(); req.notClasses = (req.notClasses || []).filter(c => !f.classes.includes(c)); if (!req.notClasses.length) delete req.notClasses; }
  return JSON.stringify(req) !== before;
}
/** walk any JSON: every object with an id (or quest id) in FIX and a requirements object gets fixed */
function walk(o, seen) {
  let n = 0;
  if (Array.isArray(o)) { o.forEach(x => { n += walk(x, seen); }); return n; }
  if (!o || typeof o !== 'object') return 0;
  const id = Number(o.id !== undefined ? o.id : o.quest);
  if (FIX[id] && o.requirements && typeof o.requirements === 'object' && fixReq(o.requirements, FIX[id])) { n++; seen.add(id); }
  Object.keys(o).forEach(k => { if (k !== 'requirements') n += walk(o[k], seen); });
  return n;
}
let changed = 0; const seen = new Set();
function doFile(file, wrap) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, 'utf8'), bom = raw.charCodeAt(0) === 0xFEFF, j = JSON.parse(raw.replace(/^﻿/, ''));
  if (wrap && j && j.manual === true) { console.log(`kept ${path.relative(ROOT, file)} (manual: true, a fixer's record)`); return; }   // 2026-10-27: never overwrite manual records
  const n = wrap ? (() => { const id = Number(path.basename(file, '.json')); const f = FIX[id]; if (!f) return 0; const R = j.requirements || (j.quest && j.quest.requirements); const c = fixReq(R, f); if (c) seen.add(id); return (c ? 1 : 0) + walk(j, seen); })() : walk(j, seen);
  if (!n) return;
  changed += n;
  console.log(`${CHECK ? 'would fix' : 'fixed'} ${n} in ${path.relative(ROOT, file)}`);
  if (!CHECK) { const indent = /^\{\s*\n(\s+)/.exec(raw); fs.writeFileSync(file, (bom ? '﻿' : '') + JSON.stringify(j, null, indent ? indent[1].length : undefined)); }
}
Object.keys(FIX).forEach(id => doFile(path.join(D, 'quests', id + '.json'), true));
doFile(path.join(D, 'quests_h5.json'), false);
doFile(path.join(D, 'quest_farm.json'), false);
console.log(changed ? `${CHECK ? 'needs fixing' : 'done'}: ${changed} requirement(s), quests ${[...seen].sort((a, b) => a - b).join(', ')}` : 'all quest race rules already correct');
process.exit(CHECK && changed ? 1 : 0);
