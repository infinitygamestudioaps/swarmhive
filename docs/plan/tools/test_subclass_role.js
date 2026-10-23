// OFFLINE TEST of SUBROLE-2026-10-23 (public tester: "Ability to adjust all settings after subclass change: now in swarm.config.json only one class
// is available"). Runs ROLEKIND-PURE + SUBROLE-PURE of Scripts_dev/swarm.js in node with the real Scripts/data/class_tree.json, plus source checks
// of the host part (rkApplyRole + the 30 s class watch). Never touches the game.
//   node docs/plan/tools/test_subclass_role.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const blk = (n) => { const i = src.indexOf('// ' + n + '-BEGIN'), j = src.indexOf('// ' + n + '-END', i + 1); if (i < 0 || j < i) { console.error(n + ' block not found'); process.exit(1); } return src.slice(i, j); };
const M = new Function(blk('ROLEKIND-PURE') + blk('SUBROLE-PURE') + '\nreturn { srSubDecide, rkResolve };')();
const tree = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'class_tree.json'), 'utf8').replace(/^﻿/, ''));
let n = 0, fails = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const id = (name) => Number(Object.keys(tree.classes).find(k => tree.classes[k].name === name));
const SK = [id('Palus Knight'), id('Shillien Knight'), id('Shillien Templar')];
const cur = (c) => M.srSubDecide({ role: 'sk', classId: c, tree, plan: SK, subRoles: null });

check(!cur(SK[1]).sub && cur(SK[1]).role === 'sk', 'main class on its plan: the configured role (sk) stays');
check(!cur(id('Dark Fighter')).sub, 'the base class of the main plan is the main line too');
const s1 = cur(id('Bishop'));
check(s1.sub && s1.role === 'auto' && /not on the main class plan/.test(s1.why), 'a Bishop subclass on a Shillien Knight: subclass -> role follows the class (auto)');
const r1 = M.rkResolve(s1.role, id('Bishop'), tree);
check(r1.kind === 'healer' && !r1.legacy, 'auto on Bishop resolves to a healer (heals, no melee; gear = mage)');
const s2 = M.srSubDecide({ role: 'sk', classId: id('Bishop'), tree, plan: SK, subRoles: { bishop: 'bishop' } });
check(s2.sub && s2.role === 'bishop' && /subRoles says bishop/.test(s2.why), 'accounts[].subRoles by class NAME (any case) wins: Bishop -> bishop (the named healer routine)');
const s3 = M.srSubDecide({ role: 'destroyer', classId: id('Spellhowler'), tree, plan: null, subRoles: { [String(id('Spellhowler'))]: 'nuker' } });
check(s3.sub && s3.role === 'nuker', 'accounts[].subRoles by class ID works without a class plan');
check(!M.srSubDecide({ role: 'destroyer', classId: id('Spellhowler'), tree, plan: null, subRoles: null }).sub, 'no class plan + no subRoles: nothing changes (the configured role stays — the owner can set role "auto")');
check(!M.srSubDecide({ role: 'sk', classId: 99999, tree, plan: SK }).sub, 'an unknown class id: nothing changes');

check(/try \{ sub = srSubNow\(cfgRole\); RKH\.subChk = !!sub; \}/.test(src) && /RKH\.sub = !!\(sub && sub\.sub\); if \(RKH\.sub\) raw = sub\.role;/.test(src), 'source: rkApplyRole takes the subclass role when one is active');
check(/SUBROLE-2026-10-23: a legacy role \(sk, bishop, destroyer \.\.\.\) is re-checked too/.test(src), 'source: the 30 s class watch re-checks legacy roles after a class switch (subclass on / off)');
check(/\(CONFIG\.subRoles = CONFIG\.subRoles \|\| \{\}\)\[a\.character\] = a\.subRoles;/.test(src), 'source: swarm.config.json accounts[].subRoles is read');
console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
