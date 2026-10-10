// CLASS PLANS test (user 2026-10-10: "It should never upgrade without asking ... It needs to work for every single class in the game").
//   node docs/plan/tools/test_class_plans.js
// 1) Scripts/data/class_tree.json: every class, ids unique, parents valid, every 1st/2nd/3rd profession reachable from a base class, all six
//    races, Kamael male/female trees, change levels 20/40/76, roles / names, labels of sibling classes distinct, in sync with class_tree.js
// 2) the CLASSPLAN-PURE block: Dashboard/classlogic.js carries the same text as Scripts_dev/swarm.js; no new Map()
// 3) the gate (cpDecide) for EVERY class: no plan -> never; unapproved -> never; approved + valid -> exactly the next class of the plan;
//    invalid jumps / other races / off-plan -> never; waiting below the level; ambiguous parties -> never; the Career page button pick
// 4) swarm.js classChange() itself (host part run in node with mocked host calls): no / unapproved plan = the board is never opened;
//    approved = the right button is clicked; two matching buttons / none = no click; a wrong class after the click is reported
// 5) templates: match + from party
// 6) migration (docs/plan/tools/class_plans_migrate.js) vs the live roster (swarm.config.json + Logs/swarm_state_*.json) and the file on disk
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const TREE = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'class_tree.json'), 'utf8'));
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const LSRC = fs.readFileSync(path.join(ROOT, 'Dashboard', 'classlogic.js'), 'utf8');
const CL = require(path.join(ROOT, 'Dashboard', 'classlogic.js'));
let fails = 0, n = 0;
const ok = (name, cond, info) => { n++; if (!cond) fails++; if (!cond || process.argv.includes('-v')) console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && info !== undefined ? ' - ' + JSON.stringify(info).slice(0, 400) : ''}`); };
const section = (t) => console.log(t);
const C = TREE.classes, ids = Object.keys(C).map(Number).sort((a, b) => a - b);

// ------------------------------------------------------------------------------------------------ 1) tree
section('1) class tree');
ok('103 classes (11 base, 20 1st, 36 2nd, 36 3rd)', ids.length === 103 && [0, 1, 2, 3].map(t => ids.filter(i => C[i].tier === t).length).join() === '11,20,36,36', [0, 1, 2, 3].map(t => ids.filter(i => C[i].tier === t).length));
ok('ids unique and equal to their key', ids.every(i => C[i].id === i) && new Set(ids).size === ids.length);
ok('every class has a parent of tier-1 (base classes none)', ids.every(i => C[i].tier === 0 ? C[i].parent === null : C[C[i].parent] && C[C[i].parent].tier === C[i].tier - 1));
ok('children lists match the parents', ids.every(i => C[i].children.every(k => C[k].parent === i)) && ids.every(i => C[i].parent === null || C[C[i].parent].children.includes(i)));
{ const seen = new Set(); const down = (i) => { seen.add(i); C[i].children.forEach(down); }; TREE.roots.forEach(down);
  ok('every 1st/2nd/3rd profession is reachable from a base class', ids.every(i => seen.has(i)), ids.filter(i => !seen.has(i))); }
ok('every class has its base class as root, same race as the root', ids.every(i => C[C[i].root] && C[C[i].root].tier === 0 && C[i].race === C[C[i].root].race));
ok('all six races', ['HUMAN', 'ELF', 'DARK_ELF', 'ORC', 'DWARF', 'KAMAEL'].every(r => ids.some(i => C[i].race === r)));
ok('fighter + mystic base classes for Human/Elf/Dark Elf/Orc, Dwarf fighter only', ['HUMAN', 'ELF', 'DARK_ELF', 'ORC'].every(r => ['fighter', 'mystic'].every(t => TREE.roots.some(i => C[i].race === r && C[i].type === t))) && TREE.roots.filter(i => C[i].race === 'DWARF').length === 1);
ok('change levels 20 / 40 / 76 by tier', ids.every(i => C[i].changeLevel === [null, 20, 40, 76][C[i].tier]));
ok('Kamael: male soldier -> Trooper only, female -> Warder only', C[123].gender === 'M' && C[124].gender === 'F' && C[123].children.join() === '125' && C[124].children.join() === '126');
ok('Kamael: Trooper -> Berserker / Soul Breaker (male); Warder -> Soul Breaker (female) / Arbalester / Inspector', C[125].children.slice().sort().join() === '127,128' && C[126].children.slice().sort((a, b) => a - b).join() === '129,130,135');
ok('Inspector / Judicator marked subclass-only', C[135].subclassOnly && C[136].subclassOnly && ids.filter(i => C[i].subclassOnly).length === 2);
ok('Dwarf: Scavenger -> Bounty Hunter -> Fortune Seeker; Artisan -> Warsmith -> Maestro', C[54].children.join() === '55' && C[55].children.join() === '117' && C[56].children.join() === '57' && C[57].children.join() === '118');
ok('Orc Shaman -> Overlord / Warcryer -> Dominator / Doomcryer', C[50].children.slice().sort().join() === '51,52' && C[51].children.join() === '115' && C[52].children.join() === '116');
ok('every class has a name, aliases, role (+ label) and a description', ids.every(i => C[i].name && C[i].aliases.length && C[i].role && C[i].roleLabel && C[i].desc), ids.filter(i => !(C[i].name && C[i].role && C[i].desc)));
ok('base classes have role "base", professions never', ids.every(i => (C[i].tier === 0) === (C[i].role === 'base')));
ok('Career page labels seen on L2Toggle resolve to the class (Human Wizard, Sorcerer, Soul Breaker, Dark Wizard, Scavenger)',
  CL.cpNameIs(TREE, 11, 'Human Wizard') && CL.cpNameIs(TREE, 12, 'Sorcerer') && CL.cpNameIs(TREE, 128, 'Soul Breaker') && CL.cpNameIs(TREE, 39, 'Dark Wizard') && CL.cpNameIs(TREE, 54, 'Scavenger'));
{ const clash = []; ids.forEach(p => { const seen = {}; C[p].children.forEach(k => C[k].aliases.forEach(a => { const x = CL.cpNorm(a); if (seen[x] !== undefined && seen[x] !== k) clash.push([p, a]); seen[x] = k; })); });
  ok('the professions of one class can always be told apart by their labels', !clash.length, clash); }
if (!fs.existsSync(path.join(ROOT, 'Dashboard', 'icons', 'class'))) console.log('skip: no Dashboard/icons/class yet (generated by SETUP -Images from your own L2Swarm)'); else ok('every class has its icon (Dashboard/icons/class/class_<id>.png)', ids.every(i => fs.existsSync(path.join(ROOT, 'Dashboard', 'icons', 'class', `class_${i}.png`))), ids.filter(i => !fs.existsSync(path.join(ROOT, 'Dashboard', 'icons', 'class', `class_${i}.png`))));
ok('every role suggestion is a valid plan', Object.values(TREE.roleSuggestions).every(ps => ps.every(p => CL.cpValidate(TREE, p).ok)));
if (!fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'classSkillTree.xml'))) console.log('skip: class_tree.js sync check needs the L2J datapack (Scripts/data/dp, dev install only)'); else { const { out, problems } = require('./class_tree.js').build(); const strip = (o) => { const x = JSON.parse(JSON.stringify(o)); delete x.meta.generated; return JSON.stringify(x); };
  ok('class_tree.json is in sync with class_tree.js (no hand edits) and the tool reports no problems', !problems.length && strip(out) === strip(TREE), problems); }

// ------------------------------------------------------------------------------------------------ 2) shared block
section('2) shared block');
const block = (s) => { const a = s.indexOf('// CLASSPLAN-PURE-BEGIN'), b = s.indexOf('// CLASSPLAN-PURE-END'); return a >= 0 && b > a ? s.slice(a, b) : null; };
const SB = block(SRC), LB = block(LSRC);
ok('CLASSPLAN-PURE block in Scripts_dev/swarm.js and Dashboard/classlogic.js', !!SB && !!LB);
ok('the two blocks are the same text (run docs/plan/tools/class_logic_sync.js after a change)', SB === LB, SB && LB ? [SB.length, LB.length] : null);
ok('no new Map() in swarm.js (L2Swarm world-map host type)', !/new Map\(/.test(SRC));
ok('no host calls in the block (Me / File / Send / sleep / note)', SB && !/\b(Me\.|File\.|Send\.|sleep\(|note\(|SayToParty|Options\.)/.test(SB));
ok('swarm.js no longer carries a class path table (ROLE_CLASS_PLAN / names in CONFIG.classPlan)', !/const ROLE_CLASS_PLAN\s*=/.test(SRC) && /\n  classPlan: \{\},/.test(SRC));
const SW = new Function(SB + '\nreturn { CP_STATUS, cpDecide, cpValidate, cpPickButton, cpChain, cpTemplateMatch };')();

// ------------------------------------------------------------------------------------------------ 3) the gate
section('3) the gate');
const plans = (members, extra) => Object.assign({ parties: { P: { members } } }, extra || {});
const me = (classId, level, name = 'X', party = 'P') => ({ name, party, classId, level });
{ const d = SW.cpDecide(TREE, { parties: {} }, me(10, 85));
  ok('no plan file entry -> missing, no next class', d.status === 'missing' && d.next === null && d.text === 'missing'); }
ok('no plans at all (null) -> missing', SW.cpDecide(TREE, null, me(10, 85)).status === 'missing');
ok('no tree -> unknown, never ready', SW.cpDecide(null, plans({ X: { plan: [15, 16, 97], approved: true } }), me(10, 85)).status === 'unknown');
ok('needLevel reported for the "reached the level without a plan" note (Human Mystic -> 20)', SW.cpDecide(TREE, null, me(10, 21)).needLevel === 20);
ok('unapproved plan -> needs-approval', SW.cpDecide(TREE, plans({ X: { plan: [15, 16, 97], approved: false } }), me(10, 85)).status === 'needs-approval');
ok('approved: "yes" / 1 are NOT approval (only true)', ['yes', 1, 'true'].every(v => SW.cpDecide(TREE, plans({ X: { plan: [15, 16, 97], approved: v } }), me(10, 85)).status === 'needs-approval'));
{ const d = SW.cpDecide(TREE, plans({ X: { plan: [15, 16, 97], approved: true } }), me(10, 25));
  ok('approved, Human Mystic lvl 25 -> ready Cleric', d.status === 'ready' && d.next === 15 && d.text === 'ready Cleric', d); }
{ const d = SW.cpDecide(TREE, plans({ X: { plan: [15, 16, 97], approved: true } }), me(15, 39));
  ok('approved, Cleric lvl 39 -> waiting Bishop @40', d.status === 'waiting' && d.next === 16 && d.needLevel === 40, d); }
ok('approved, Cleric lvl 40 -> ready Bishop', SW.cpDecide(TREE, plans({ X: { plan: [15, 16, 97], approved: true } }), me(15, 40)).next === 16);
ok('approved, Cardinal -> done', SW.cpDecide(TREE, plans({ X: { plan: [15, 16, 97], approved: true } }), me(97, 85)).status === 'done');
ok('plan that stops at the 2nd profession: Bishop -> done (no 3rd change)', SW.cpDecide(TREE, plans({ X: { plan: [15, 16], approved: true } }), me(16, 85)).status === 'done');
ok('invalid jump [Cleric, Sorcerer] -> invalid', SW.cpDecide(TREE, plans({ X: { plan: [15, 12], approved: true } }), me(10, 85)).status === 'invalid');
ok('skipping a step [Bishop] -> invalid', SW.cpDecide(TREE, plans({ X: { plan: [16], approved: true } }), me(10, 85)).status === 'invalid');
ok('unknown id -> invalid', SW.cpDecide(TREE, plans({ X: { plan: [999], approved: true } }), me(10, 85)).status === 'invalid');
ok('another race\'s plan (Elven Wizard line on a Human Mystic) -> off-plan', SW.cpDecide(TREE, plans({ X: { plan: [26, 27, 103], approved: true } }), me(10, 85)).status === 'off-plan');
ok('current class not on the plan (Prophet with a Bishop plan) -> off-plan', SW.cpDecide(TREE, plans({ X: { plan: [15, 16, 97], approved: true } }), me(17, 85)).status === 'off-plan');
ok('male Kamael with the female Soul Breaker path -> off-plan', SW.cpDecide(TREE, plans({ X: { plan: [126, 129, 133], approved: true } }), me(125, 85)).status === 'off-plan');
ok('4 steps -> invalid', SW.cpDecide(TREE, plans({ X: { plan: [15, 16, 97, 98], approved: true } }), me(10, 85)).status === 'invalid');
{ const P2 = { parties: { A: { members: { X: { plan: [15, 16, 97], approved: true } } }, B: { members: { X: { plan: [15, 17, 98], approved: true } } } } };
  ok('two other parties with different plans -> ambiguous', SW.cpDecide(TREE, P2, me(15, 85, 'X', 'C')).status === 'ambiguous'); }
{ const P2 = { parties: { A: { members: { X: { plan: [15, 16, 97], approved: true } } } } };
  const d = SW.cpDecide(TREE, P2, me(15, 85, 'X', 'C'));
  ok('a character that moved party: its one plan elsewhere is used (party reported)', d.status === 'ready' && d.party === 'A' && d.next === 16, d); }
{ const P2 = { parties: { C: { members: { X: { plan: [15, 17, 98], approved: true } } }, A: { members: { X: { plan: [15, 16, 97], approved: true } } } } };
  ok('own party wins over another party', SW.cpDecide(TREE, P2, me(15, 85, 'X', 'C')).next === 17); }
// subclass-only (Inspector / Judicator): never a main-class plan step, never offered as a path
{ const sub = ids.filter(id => C[id].subclassOnly);
  ok('Inspector / Judicator are marked subclass-only in the tree', sub.length >= 2, sub);
  ok('a plan with a subclass-only step is refused', sub.every(id => !SW.cpValidate(TREE, SW.cpChain(TREE, [id]) ? [C[C[id].parent].id, id].filter(x => C[x].tier > 0) : [id]).ok));
  ok('no path from a main class offers a subclass-only step', ids.filter(id => !C[id].subclassOnly).every(cid => CL.cpPathsFrom(TREE, cid).every(p => !p.some(x => C[x].subclassOnly)))); }
// EVERY class, EVERY valid path
{ let checked = 0, bad = [];
  ids.forEach(cid => {
    CL.cpPathsFrom(TREE, cid).forEach(path => {
      const ch = SW.cpChain(TREE, path), at = ch.indexOf(cid), nx = ch[at + 1];
      [false, true].forEach(appr => [1, 19, 20, 39, 40, 75, 76, 85].forEach(lv => {
        checked++;
        const d = SW.cpDecide(TREE, plans({ X: { plan: path, approved: appr } }), me(cid, lv));
        const subOnly = path.some(id => C[id] && C[id].subclassOnly);   // user 2026-10-10: subclass-only classes are never a valid main plan
        const want = subOnly ? 'invalid' : !appr ? 'needs-approval' : nx === undefined ? 'done' : lv >= C[nx].changeLevel ? 'ready' : 'waiting';
        if (d.status !== want || (want === 'ready' && d.next !== nx)) bad.push([cid, path, appr, lv, d.status, d.next]);
        if (d.status === 'ready' && (C[d.next].parent !== cid || !path.includes(d.next))) bad.push(['ready to a non-child', cid, path, d.next]);
      }));
    });
  });
  ok(`every class x every valid path x approval x level: ready only when approved, exactly the plan's next child (${checked} cases)`, !bad.length, bad.slice(0, 5)); }
// random garbage plans never make a character change
{ let cases = 0, bad = []; let seed = 7; const rnd = (k) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };
  for (let i = 0; i < 20000; i++) {
    const cid = ids[rnd(ids.length)], len = 1 + rnd(4), plan = []; for (let j = 0; j < len; j++) plan.push(rnd(5) ? ids[rnd(ids.length)] : rnd(200));
    const d = SW.cpDecide(TREE, plans({ X: { plan, approved: true } }), me(cid, 85)); cases++;
    if (d.status === 'ready') { const v = SW.cpValidate(TREE, plan).ok, ch = SW.cpChain(TREE, plan); if (!v || !ch.includes(cid) || C[d.next].parent !== cid || ch[ch.indexOf(cid) + 1] !== d.next) bad.push([cid, plan, d.next]); }
  }
  ok(`20000 random plans: 'ready' only for valid plans containing the class, to its child on the plan (${cases})`, !bad.length, bad.slice(0, 5)); }
// the Career page button
const btn = (id, labels) => SW.cpPickButton(TREE, id, labels);
const MENU = ['Statistic', 'Buffs', 'Services', 'Database', 'Cabinet'];
ok('button: Soul Breaker for a male Trooper (labels "Berserker", "Soul Breaker")', btn(128, MENU.concat(['Berserker', 'Soul Breaker', 'To menu'])).label === 'Soul Breaker');
ok('button: Human Wizard / Wizard', btn(11, MENU.concat(['Human Wizard', 'Cleric'])).label === 'Human Wizard' && btn(11, ['Wizard', 'Cleric']).label === 'Wizard');
ok('button: Dark Wizard for the Dark Elven Wizard class', btn(39, ['Dark Wizard', 'Shillien Oracle']).label === 'Dark Wizard');
ok('button: Sorcerer (client spells it Sorceror)', btn(12, ['Sorcerer', 'Necromancer', 'Warlock']).label === 'Sorcerer');
ok('button: "Shillien Knight" never picks "Shillien Templar" or "Bladedancer"', btn(33, ['Bladedancer', 'Shillien Knight']).label === 'Shillien Knight' && btn(33, ['Bladedancer', 'Shillien Templar']).idx === -1);
ok('button: not on the page -> no click', btn(16, MENU.concat(['Prophet'])).idx === -1);
ok('button: two buttons with the same name -> no click', btn(16, ['Bishop', 'Bishop']).idx === -1);
ok('button: label with a fee suffix still found ("Bishop (200 000)")', btn(16, ['Bishop (200 000)', 'Prophet (200 000)']).label === 'Bishop (200 000)');
ok('button: Elven Wizard never matched by "Wizard" alone', btn(26, ['Wizard', 'Oracle']).idx === -1);
ok('plan from the old names (Elven Wizard > Spellsinger > Mystic Muse)', JSON.stringify(CL.cpPlanFromNames(TREE, ['Elven Wizard', 'Spellsinger', 'Mystic Muse']).plan) === '[26,27,103]');
ok("plan from the old names (Eva's Saint, Scavenger, Artisan, Soul Breaker)", JSON.stringify([CL.cpPlanFromNames(TREE, ['Elven Oracle', 'Elven Elder', "Eva's Saint"]).plan, CL.cpPlanFromNames(TREE, ['Scavenger', 'Bounty Hunter', 'Fortune Seeker']).plan, CL.cpPlanFromNames(TREE, ['Artisan', 'Warsmith', 'Maestro']).plan, CL.cpPlanFromNames(TREE, ['Trooper', 'Soul Breaker', 'Soul Hound']).plan]) === '[[29,30,105],[54,55,117],[56,57,118],[125,128,132]]');

// ------------------------------------------------------------------------------------------------ 4) swarm.js classChange() with mocks
section('4) swarm.js classChange() (host part, mocked host calls)');
{
  const a = SRC.indexOf('// --- CLASS PLANS, host side'), b = SRC.indexOf('/** Cabinet -> Settings: set the option whose row contains');
  ok('host part found', a > 0 && b > a);
  const HOST = SRC.slice(a, b);
  const run = async (sc) => {
    const calls = { board: 0, clicks: [], notes: [] };
    const env = {
      Me: { Name: 'X', ClassId: sc.classId, ClassName: C[sc.classId].clientName, Level: sc.level },
      File: { Exists: (f) => /class_plans/.test(f) ? sc.plans !== undefined : true, ReadAllText: (f) => /class_tree/.test(f) ? JSON.stringify(TREE) : typeof sc.plans === 'string' ? sc.plans : JSON.stringify(sc.plans), GetLastWriteTimeUtc: () => ({ Ticks: 1 }) },
      fileStamp: () => '1', __SCRIPTS__: 'S', now: () => Date.now(), sleep: async () => { }, num: (x) => Number(x) || 0,
      note: (m) => calls.notes.push(m), intent: () => { }, intentDone: () => { }, logError: () => { }, closeClientBoard: () => { }, savePage: () => { },
      state: {}, tradeState: null, lastSysMsg: null, teamOf: () => 'P', lastState: () => null,
      boardPath: async () => { calls.board++; return 'PAGE'; },
      pageActions: (p) => p === 'PAGE' ? sc.buttons.map((l, i) => ({ label: l, cmd: 'c' + i })) : [],
      pageRequest: async (cmd) => { calls.clicks.push(cmd); const i = +cmd.slice(1); if (sc.result !== undefined) env.Me.ClassId = sc.result; else if (sc.changes) env.Me.ClassId = sc.changes[sc.buttons[i]]; return 'AFTER'; },
    };
    const names = Object.keys(env);
    const f = new Function(...names, SB + HOST + '\nreturn { classChange, classPlanOf, classPlanPublic, classGateAllows };');
    const api = f(...names.map(k => env[k]));
    const r = await api.classChange('test');
    return { r, calls, me: env.Me, api };
  };
  (async () => {
    const BTN = ['Statistic', 'Buffs', 'Berserker', 'Soul Breaker', 'To menu'], CH = { Berserker: 127, 'Soul Breaker': 128 };
    let t = await run({ classId: 125, level: 45, plans: undefined, buttons: BTN, changes: CH });
    ok('no class_plans.json: refused, the board is never opened', t.r.ok === false && t.r.refused && t.calls.board === 0 && t.me.ClassId === 125 && /no class plan/.test(t.r.msg), t.r);
    t = await run({ classId: 125, level: 45, plans: { parties: { P: { members: { X: { plan: [125, 128, 132], approved: false } } } } }, buttons: BTN, changes: CH });
    ok('unapproved plan: refused, the board is never opened', t.r.refused && t.calls.board === 0 && /not approved/.test(t.r.msg));
    t = await run({ classId: 125, level: 45, plans: { parties: { P: { members: { X: { plan: [125, 128, 132], approved: true } } } } }, buttons: BTN, changes: CH });
    ok('approved Trooper -> Soul Breaker: exactly the "Soul Breaker" button is clicked, class 128', t.r.ok && t.calls.clicks.join() === 'c3' && t.me.ClassId === 128, [t.r, t.calls.clicks]);
    t = await run({ classId: 125, level: 39, plans: { parties: { P: { members: { X: { plan: [125, 128, 132], approved: true } } } } }, buttons: BTN, changes: CH });
    ok('approved but level 39: no board, "needs level 40"', t.r.ok && t.calls.board === 0 && /needs level 40/.test(t.r.msg));
    t = await run({ classId: 125, level: 45, plans: { parties: { P: { members: { X: { plan: [125, 128, 132], approved: true } } } } }, buttons: ['Berserker', 'Soul Breaker', 'Soul Breaker'], changes: CH });
    ok('two "Soul Breaker" buttons: board opened, NO click', !t.r.ok && t.calls.board === 1 && !t.calls.clicks.length);
    t = await run({ classId: 125, level: 45, plans: { parties: { P: { members: { X: { plan: [125, 128, 132], approved: true } } } } }, buttons: ['Berserker', 'To menu'], changes: CH });
    ok('no "Soul Breaker" button: NO click', !t.r.ok && !t.calls.clicks.length);
    t = await run({ classId: 125, level: 45, plans: { parties: { P: { members: { X: { plan: [125, 128, 132], approved: true } } } } }, buttons: BTN, result: 127 });
    ok('server gave another class: reported as WRONG CLASS, ok false', !t.r.ok && /WRONG CLASS/.test(t.r.msg));
    t = await run({ classId: 125, level: 45, plans: { parties: { P: { members: { X: { plan: [125, 127, 131], approved: true } } } } }, buttons: BTN, changes: CH });
    ok('approved Trooper -> Berserker clicks "Berserker"', t.r.ok && t.calls.clicks.join() === 'c2' && t.me.ClassId === 127);
    t = await run({ classId: 10, level: 85, plans: { parties: { P: { members: { X: { plan: [15, 12], approved: true } } } } }, buttons: ['Human Wizard', 'Cleric'], changes: { Cleric: 15 } });
    ok('broken plan: refused, no board', t.r.refused && t.calls.board === 0 && /broken/.test(t.r.msg));
    t = await run({ classId: 10, level: 85, plans: '{ half written', buttons: ['Cleric'], changes: { Cleric: 15 } });
    ok('a half-written plans file: nobody changes (no board)', t.calls.board === 0);
    const g = (await run({ classId: 10, level: 25, plans: { parties: { P: { members: { X: { plan: [15, 16, 97], approved: true } } } } }, buttons: [], changes: {} })).api;
    ok('class-master / quest turn-in gate: allowed only for the approved next class', g.classGateAllows('').ok && g.classGateAllows('Cleric').ok && !g.classGateAllows('Human Wizard').ok);
    const pub = g.classPlanPublic();
    ok('swarm_state.classPlan text + info', pub.text === 'ready Cleric' && pub.info.next === 15 && pub.info.approved === true, pub);
    finish();
  })().catch(e => { ok('host run threw: ' + e.message, false); finish(); });
}

function finish() {
  // ---------------------------------------------------------------------------------------------- 5) templates
  section('5) templates');
  const EX = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'class_plans.example.json'), 'utf8'));
  ok('example file: no parties, every template marked example, every slot a valid plan, no character names', !Object.keys(EX.parties).length &&
    Object.values(EX.templates).every(t => t.example === true && t.slots.every(s => CL.cpValidate(TREE, s.plan).ok && C[s.from] && C[s.from].tier === 0 && CL.cpChain(TREE, s.plan)[0] === s.from)));
  { const raid = EX.templates['example-raid-9'];
    const mem = [{ name: 'Tank', classId: 32, role: 'sk' }, { name: 'Heal', classId: 15, role: 'bishop' }, { name: 'Sai', classId: 42, role: 'shilliensaint' }, { name: 'D1', classId: 45, role: 'destroyer' },
      { name: 'D2', classId: 44, role: 'destroyer' }, { name: 'K1', classId: 125, role: 'doombringer' }, { name: 'K2', classId: 125, role: 'inspector' }, { name: 'N', classId: 11, role: 'necromancer' }, { name: 'W', classId: 50, role: 'doomcryer' }];
    const m = SW.cpTemplateMatch(TREE, raid, mem);
    const by = {}; m.assign.forEach(x => { by[x.name] = x.plan.join('>'); });
    ok('raid template: all 9 matched, the two male Kamael split by role (Berserker / Soul Breaker)', m.assign.length === 9 && !m.unmatched.length && by.K1 === '125>127>131' && by.K2 === '125>128>132', m);
    ok('raid template: destroyers get Titan, base Orc Fighter too', by.D1 === '45>46>113' && by.D2 === '45>46>113');
    const m2 = SW.cpTemplateMatch(TREE, raid, [{ name: 'Elf', classId: 26, role: 'nuker' }, { name: 'Tank', classId: 32, role: 'sk' }]);
    ok('a member no slot fits stays unchanged (Elven Wizard in the raid template)', m2.left.join() === 'Elf' && m2.assign.length === 1 && m2.unmatched.length === 8);
    const m3 = SW.cpTemplateMatch(TREE, raid, [{ name: 'Bladedancer', classId: 34, role: 'sk' }]);
    ok('a member whose class left the path (Bladedancer for the SK slot) is never matched', !m3.assign.length);
    const back = CL.cpTemplateFromParty(TREE, { members: { Tank: { plan: [32, 33, 106] }, Bad: { plan: [15, 12] }, Heal: { plan: [15, 16, 97] } } }, [{ name: 'Tank', role: 'sk' }, { name: 'Bad', role: 'x' }, { name: 'Heal', role: 'bishop' }, { name: 'None', role: 'nuker' }]);
    ok('save party as template: valid plans only, base class as "from"', back.length === 2 && back[0].from === 31 && back[1].from === 10 && back[0].role === 'sk');
    const round = SW.cpTemplateMatch(TREE, { slots: back }, [{ name: 'T2', classId: 33, role: 'sk' }, { name: 'H2', classId: 16, role: 'bishop' }]);
    ok('a saved template applies to another party with the same classes', round.assign.length === 2); }

  // ---------------------------------------------------------------------------------------------- 6) migration
  section('6) migration vs the live roster');
  const M = require('./class_plans_migrate.js');
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'swarm.config.json'), 'utf8').replace(/^﻿/, ''));
  let mig = null;
  // the one-time migration reads the old class table from this install's own backups (Settings/backup): not in a fresh package (2026-10-10)
  if (!fs.existsSync(path.join(ROOT, 'Settings', 'backup'))) console.log('skip: migration check needs this install\'s Settings/backup (dev install only)');
  else try { mig = M.migrate({ at: '2026-10-10T00:00:00.000Z' }); } catch (e) { ok('migration runs: ' + e.message, false); }
  if (mig) {
    const rows = mig._migration.rows;
    const enabled = (cfg.accounts || []).filter(a => a && a.character && a.enabled !== false);
    ok('one row per enabled character of swarm.config.json', rows.length === enabled.length && enabled.every(a => rows.some(r => r.name === a.character)), [rows.length, enabled.length]);
    const appr = rows.filter(r => r.status === 'approved');
    ok('every approved plan is valid and contains the character\'s CURRENT class', appr.every(r => CL.cpValidate(TREE, r.plan).ok && (r.classId === null || CL.cpFits(TREE, r.plan, r.classId))), appr.filter(r => !(r.classId === null || CL.cpFits(TREE, r.plan, r.classId))).map(r => r.name));
    ok('approved plans are stored under the character\'s own party, approvedBy migration', appr.every(r => mig.parties[r.party] && mig.parties[r.party].members[r.name] && mig.parties[r.party].members[r.name].approved === true && mig.parties[r.party].members[r.name].approvedBy === 'migration' && /agreed before 2026-10-10/.test(mig.parties[r.party].members[r.name].note)));
    const nukers = enabled.filter(a => a.role === 'nuker' && !(Array.isArray(a.classPlan) && a.classPlan.length));
    ok('nukers without classPlan in swarm.config.json stay MISSING (suggestion only)', nukers.every(a => rows.find(r => r.name === a.character).status === 'missing' && !Object.values(mig.parties).some(p => p.members[a.character])), nukers.map(a => a.character));
    const want = { Tank1: '32>33>106', Inspector1: '125>128>132', Destroyer1: '45>46>113', Destroyer2: '45>46>113', Doombringer1: '125>127>131', Necro1: '11>13>95', Bishop1: '15>16>97', Chanter1: '50>52>116', Saint1: '42>43>112', Crafter1: '56>57>118', Spoiler1: '54>55>117', Healer1: '29>30>105', Dagger1: '7>8>93' };
    const got = {}; rows.forEach(r => { if (r.status === 'approved') got[r.name] = r.plan.join('>'); });
    ok('the agreed plans of CLAUDE.md (Inspector1 Soul Hound, Destroyers Titan, Tank1 Shillien Templar, ...)', Object.keys(want).every(k => !enabled.some(a => a.character === k) || got[k] === want[k]), Object.keys(want).filter(k => got[k] !== want[k]).map(k => [k, got[k]]));
    const F = path.join(ROOT, 'Scripts', 'data', 'class_plans.migrated.json');
    if (fs.existsSync(F)) {
      const disk = JSON.parse(fs.readFileSync(F, 'utf8'));
      const strip = (o) => JSON.stringify(Object.fromEntries(Object.entries(o.parties).map(([k, p]) => [k, Object.fromEntries(Object.entries(p.members).map(([n, e]) => [n, e.plan]))])));
      ok('class_plans.migrated.json on disk = a fresh migration (plans)', strip(disk) === strip(mig));
    }
  }
  console.log(`\n${n - fails}/${n} passed${fails ? ` — ${fails} FAILED` : ''}`);
  process.exit(fails ? 1 : 0);
}
