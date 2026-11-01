// test_bag_crystallize.js - requirement crafter.md R-CRYMARK (owner 2026-11-01: "if I'm on a Bounty Hunter that has the crystallize ability I can't
// select items from its inventory to auto crystallize. There is no reason for them to keep it, it should be crystallized")
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SW = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const CPG = fs.readFileSync(path.join(ROOT, 'Dashboard', 'charpage.js'), 'utf8');
const SRV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (a, b) => { const i = SW.indexOf(a), j = SW.indexOf(b, i); return i < 0 || j < 0 ? '' : SW.slice(i, j); };
const P = new Function(cut('// CRYST-PURE-BEGIN', '// CRYST-PURE-END') + cut('// CRYMARK-PURE-BEGIN', '// CRYMARK-PURE-END') + '\nreturn { cryJudge, crymarkIds, crymarkPick };')();
const ENT = { 100: [10, 'D', 'w', ''], 200: [5, 'B', 'a', ''], 300: [8, 'A', 'w', 's'] };
const J = (row, lvl) => P.cryJudge(Object.assign({ count: 1 }, row), ENT[row.id], { skillLvl: lvl, notrade: [] });
// Bounty Hunter Crystallize level 3 = up to B-grade
const bag = [J({ objId: 1, id: 100, name: 'D sword' }, 3), J({ objId: 2, id: 200, name: 'B gloves' }, 3), J({ objId: 3, id: 300, name: 'A SA weapon' }, 3),
  J({ objId: 4, id: 100, name: 'D sword', enchant: 4 }, 3), J({ objId: 5, id: 100, name: 'D sword', equipped: true }, 3), J({ objId: 6, id: 100, name: 'D sword', enchant: 10 }, 3),
  J({ objId: 7, id: 200, name: 'B gloves', quest: true }, 3)];
t('pick: plain marked pieces within the skill level go (D, B with Crystallize 3)', JSON.stringify(P.crymarkPick(bag, 9)) === JSON.stringify([1, 2]));
t('pick: an A-grade piece needs Crystallize 4 (skill level limits the grade); S.A. pieces never', !P.crymarkPick([J({ objId: 8, id: 300, name: 'A' }, 3)], 9).length && !P.crymarkPick([J({ objId: 3, id: 300, name: 'A SA' }, 5)], 9).length);
t('pick: worn, enchanted (+4, +10) and quest pieces never', !P.crymarkPick(bag.slice(3), 9).length);
t('pick: at most N per round', P.crymarkPick(bag, 1).length === 1);
t('marks: my own + the "all" list; another character\'s marks not mine', (() => { const s = P.crymarkIds({ chars: { Spoiler1: [100], Other: [999] }, all: [200] }, 'Spoiler1'); return s.has(100) && s.has(200) && !s.has(999); })());
const A = require(path.join(ROOT, 'Dashboard', 'crymark_api.js'));
const m1 = A.change({}, { name: 'Spoiler1', add: [100, 100, 200] }), m2 = A.change(m1.marks, { name: 'Spoiler1', remove: [100] }), m3 = A.change(m2.marks, { name: 'Spoiler1', remove: [200] });
t('API: add (no doubles), remove; an empty list disappears', m1.ok && JSON.stringify(m1.marks.chars.Spoiler1) === '[100,200]' && JSON.stringify(m2.marks.chars.Spoiler1) === '[200]' && !m3.marks.chars.Spoiler1);
t('API: "*" = the all list; bad names / nothing to change refused', A.change({}, { name: '*', add: [5] }).marks.all[0] === 5 && !A.change({}, { name: 'bad name!', add: [1] }).ok && !A.change({}, { name: 'X' }).ok);
t('API: hooked in server.js (/api/crymarks)', SRV.includes("require('./crymark_api').handle(req, res, url"));
t('swarm.js: the loop needs Crystallize, my marks, idle + combatInfo clear, no raid / NPC / trade / escape, then cryRun without enchanted / special',
  /const skill = stashSkillLvl\(248\); if \(skill <= 0\) return;/.test(SW) && /if \(cryBusyWhy\(\) \|\| combatInfo\(\)\.in \|\| inRaid\(\) \|\| state\.npcBusy \|\| state\.gkBusy \|\| state\.bbsBusy \|\| ESC\.on\) return;/.test(SW) && SW.includes('cryRun({ ids: pick, enchanted: false, special: false })'));
t('dashboard: the item menu offers "Auto-crystallize this kind" (only a piece it can crystallize) + the marked list with ✕', CPG.includes('Auto-crystallize this kind') && CPG.includes('if (j && !j.hard) { const mk = cryMarked(it.id);') && CPG.includes('id="cp_crymk"') && CPG.includes("data-cpcrymk=\"${id}\" data-on=\"0\""));
console.log(`bag crystallize: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
