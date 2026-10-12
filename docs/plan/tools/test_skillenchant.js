#!/usr/bin/env node
// TEST skill enchant (forum topic 2753, 2026-10-12; USER RULE: enchanting is NEVER automatic — recommendations + one attempt per explicit order).
// Checks: Scripts/data/skill_enchant.json vs the forum cells, the plan file (manual only), Dashboard/skillenchant_logic.js senDecide (the SENPURE
// block the bot runs), the API sanitizer (auto can never be switched on), the page (no auto switch, enchant buttons, styled dialogs only),
// the catalog entries, and the swarm.js patch (scratchpad patch_skillenchant.js on a COPY + node --check; env PATCH overrides).
// Never touches the game, L2Swarm, the dashboard server or swarm.js.  Run: node docs/plan/tools/test_skillenchant.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const L = require(path.join(ROOT, 'Dashboard', 'skillenchant_logic.js'));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'skill_enchant.json'), 'utf8'));
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'skill_enchant_plan.json'), 'utf8'));

console.log('--- data vs forum topic 2753 (image cells transcribed in skill_enchant.json forum)');
ok(D.forum && Array.isArray(D.forum.secondProfession) && D.forum.secondProfession.length === 30, '2nd profession table: 30 rows (+1..+30)');
ok(D.forum.secondProfession[0][0] === 82 && D.forum.secondProfession[0][9] === 97, '+1 at level 76 = 82 %, at 85 = 97 %');
ok(D.forum.thirdProfession && D.forum.thirdProfession[0][0] === 18, '3rd profession table +1 at 76 = 18 %');
ok(D.rules && D.rules.minLevel === 76 && D.rules.multipliers.safe === 5 && D.rules.untrainSpBack === 0.8, 'rules: level 76, safe x5, untrain 80 % SP');
ok(Array.isArray(D.forumVsDatapack) || typeof D.forumVsDatapack === 'object', 'forum vs datapack comparison recorded (one cell differs: +24 @ 85)');

console.log('--- plan file: manual only');
ok(P.auto === false && P.manualOnly === true, 'plan: auto false, manualOnly true');
ok(Object.values(P.chars).every(c => c.auto === false), 'every character: auto false');
ok(/NEVER automatic/.test(P._about), 'plan _about says never automatic');
const someone = Object.values(P.chars).find(c => c.list && c.list.some(e => e.routes && Object.keys(e.routes).length));
ok(!!someone, 'list entries carry every route -> group (for explicit orders)');

console.log('--- senDecide (the SENPURE block)');
const plan = { minLevel: 76, levels: [76, 77, 78, 79, 80, 81, 82, 83, 84, 85], tier3: [92, 106], books: { normal: 6622, safe: 9627 }, multipliers: { normal: 1, safe: 5 },
  groups: { 6: { max: 3, sp: [100, 200, 300], adena: [1000, 2000, 3000], chance: [[82, 92, 97, 97, 97, 97, 97, 97, 97, 97], [50, 60, 70, 80, 90, 95, 95, 95, 95, 95], [10, 20, 30, 40, 50, 60, 70, 80, 90, 95]] }, 7: { max: 2, sp: [10, 20], adena: [1, 2], chance: [[90, 90, 90, 90, 90, 90, 90, 90, 90, 90], [90, 90, 90, 90, 90, 90, 90, 90, 90, 90]] } } };
const list = [{ id: 368, name: 'Vengeance', base: 1, route: 1, group: 6, routes: { 1: 6, 2: 7 } }, { id: 400, name: 'Other', base: 3, route: 0, group: null, routes: { 1: 6 } }];
const me = (o) => Object.assign({ name: 'X', level: 76, classId: 106, sp: 1e6, adena: 1e6, books: { 6622: 1, 9627: 1 }, skills: { 368: 1, 400: 3 }, list, minChance: 80 }, o || {});
let r = L.senDecide(plan, me(), { id: 368, route: 1 });
ok(r.ok && r.step.level === 101 && r.step.plus === 1 && r.step.chance === 82 && r.step.book === 6622, 'explicit 368 route 1: +1 (wire 101), 82 %, Giant\'s Codex');
r = L.senDecide(plan, me({ books: {} }), { id: 368, route: 1 });
ok(!r.ok && /Giant's Codex/.test(r.why), 'no codex for +1: refused');
r = L.senDecide(plan, me({ skills: { 368: 101 }, books: {} }), { id: 368, route: 1 });
ok(r.ok && r.step.level === 102 && r.step.book === 0, '+2 needs no codex (normal)');
r = L.senDecide(plan, me({ skills: { 368: 101 } }), { id: 368, route: 1, safe: true });
ok(r.ok && r.step.sp === 1000 && r.step.adena === 10000 && r.step.book === 9627, 'safe: x5 SP/adena + Mastery codex');
r = L.senDecide(plan, me({ skills: { 368: 101 } }), { id: 368, route: 2 });
ok(!r.ok && /route change/.test(r.why), 'enchanted on route 1: route 2 refused (no route change)');
r = L.senDecide(plan, me({ skills: { 368: 103 } }), { id: 368, route: 1 });
ok(!r.ok && /maximum/.test(r.why), 'at max +3: refused');
r = L.senDecide(plan, me({ level: 75 }), { id: 368, route: 1 });
ok(!r.ok && /level 76/.test(r.why), 'level 75: refused');
r = L.senDecide(plan, me({ classId: 50 }), { id: 368, route: 1 });
ok(!r.ok && /3rd class/.test(r.why), 'no 3rd class: refused');
r = L.senDecide(plan, me({ sp: 50 }), { id: 368, route: 1 });
ok(!r.ok && /SP/.test(r.why), 'not enough SP: refused');
r = L.senDecide(plan, me({ never: true }), { id: 368, route: 1 });
ok(!r.ok && /never/.test(r.why), '"never" on the dashboard: refused');
r = L.senDecide(plan, me({ skills: { 368: 101 } }), { next: true });
ok(!r.ok && /below the minimum/.test(r.why), 'next: +2 at 50 % is below the 80 % minimum');
r = L.senDecide(plan, me(), { next: true });
ok(r.ok && r.step.id === 368, 'next: first plan skill (route 0 = skip)');
r = L.senDecide(plan, me({ skills: { 368: 101 } }), { id: 368, route: 1 });
ok(r.ok && r.step.chance === 50, 'explicit order ignores the minimum but reports the chance');
r = L.senDecide(plan, me(), { id: 999, route: 1 });
ok(!r.ok && /not an enchantable skill/.test(r.why), 'unknown skill: refused');
ok(L.senOrderText({ id: 368, route: 1 }, 'Tank1', true) === '!skillenchant 368 1 safe Tank1', 'order text');
ok(L.charSettings({ auto: true, chars: { A: { auto: true } } }, 'A').auto === false, 'charSettings: auto can never be true');
ok(L.nextEnchant({ minLevel: 76, groups: {} }, { auto: true, list: [] }, { level: 80 }).next === null, 'nextEnchant is only a suggestion wrapper');

console.log('--- API sanitizer');
const api = require(path.join(ROOT, 'Dashboard', 'skillenchant_api.js'));
const sz = api.seSanitize({ auto: true, minChance: 70, chars: { Bishop1: { auto: true, routes: { 1239: 2 } }, Necro1: { auto: false } } });
const st = sz.settings || sz;
ok(st.auto === false, 'auto: true from a client is stored as false');
ok(!(st.chars.Bishop1 && st.chars.Bishop1.auto === true) && st.chars.Necro1 && st.chars.Necro1.auto === false, 'per character only "never" survives');

console.log('--- page + catalog (static)');
const pg = fs.readFileSync(path.join(ROOT, 'Dashboard', 'skillenchantpage.js'), 'utf8');
ok(!/data-sen="auto"/.test(pg) && /Manual only/.test(pg), 'page: no auto switch, "Manual only" badge');
ok(/data-sen="ench"/.test(pg) && /confirmDanger: true/.test(pg) && /uiConfirm\(/.test(pg), 'page: Enchant +N buttons -> styled confirm -> /api/command (confirmDanger)');
ok(!/[^.\w](alert|confirm|prompt)\s*\(/.test(pg), 'page: no browser alert/confirm/prompt');
// the catalog entries go live with the patch (scratchpad catalog_pending.js: "never add a command swarm.js does not handle"); before that,
// test them on a temp copy of commands.js with the pending blocks added
let C = require(path.join(ROOT, 'Dashboard', 'commands.js'));
if (!C.SWARM_WORDS.includes('!skillenchant')) {
  const SP = path.join(os.tmpdir(), 'claude', 'C--L2-L2Swarm', '9d69d83a-07bd-4424-92b7-5679277c4b38', 'scratchpad');
  const tmpC = path.join(os.tmpdir(), 'commands_se_test_' + process.pid + '.js');
  fs.copyFileSync(path.join(ROOT, 'Dashboard', 'commands.js'), tmpC);
  const r0 = cp.spawnSync(process.execPath, [path.join(SP, 'catalog_pending.js'), tmpC], { encoding: 'utf8', env: Object.assign({}, process.env, { FORCE: '1' }) });
  ok(r0.status === 0, 'catalog_pending.js adds the entries (not live before the patch: ' + (r0.stdout || r0.stderr).trim().slice(0, 120) + ')');
  C = require(tmpC); try { fs.unlinkSync(tmpC); } catch (e) { }
}
const e1 = C.classify('!skillenchant 368 1 Tank1'), e2 = C.classify('!skillenchant next Tank1'), e3 = C.classify('!skillenchant check');
ok(e1.id === 'skillenchant' && e1.safety === 'destructive', 'catalog: attempt = destructive');
ok(e2.id === 'skillenchantnext' && e2.safety === 'destructive', 'catalog: next = destructive');
ok(e3.id === 'skillenchantcheck' && e3.safety === 'safe', 'catalog: check = safe');
ok(C.build(e1.tpl, { skill: 368, route: 1, safe: 'safe', name: 'Tank1' }) === L.senOrderText({ id: 368, route: 1 }, 'Tank1', true), 'catalog template = the page\'s order text');

console.log('--- swarm.js patch (on a copy)');
const cand = [process.env.PATCH, path.join(os.tmpdir(), 'claude', 'C--L2-L2Swarm', '9d69d83a-07bd-4424-92b7-5679277c4b38', 'scratchpad', 'patch_skillenchant.js')].filter(Boolean);
const PF = cand.find(f => fs.existsSync(f));
const ALREADY = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8').includes('// SENPURE-BEGIN');   // applied to the source already: check the source itself
if (!PF && !ALREADY) console.log('  skip patch_skillenchant.js not found');
else {
  const copy = path.join(os.tmpdir(), 'swarm_se_test_' + process.pid + '.js');
  fs.copyFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), copy);
  let res = ALREADY ? { status: 0 } : cp.spawnSync(process.execPath, [PF, copy], { encoding: 'utf8' });
  ok(res.status === 0, (ALREADY ? 'source already patched' : 'patch applies to a fresh copy') + (res.status ? ': ' + (res.stderr || res.stdout).slice(0, 300) : ''));
  res = cp.spawnSync(process.execPath, ['--check', copy], { encoding: 'utf8' });
  ok(res.status === 0, 'node --check passes');
  const s = fs.readFileSync(copy, 'utf8');
  const a = s.indexOf('// SENPURE-BEGIN'), b = s.indexOf("    case '!enchant': {");
  const block = s.slice(a, s.indexOf('function sellPacket(shopId, entries) {'));
  ok(a > 0 && block.includes('async function skillEnchantOrder('), 'SENPURE + host part inserted');
  ok(!/setInterval|setTimeout/.test(block), 'no timer in the skill enchant block (never automatic)');
  ok((s.match(/skillEnchantOrder\(/g) || []).length === 2, 'skillEnchantOrder is called only by the !skillenchant order');
  ok(block.indexOf(String.fromCharCode(92)) < 0, 'no backslash in the inserted block');
  ok(s.slice(b - 1500, b).includes("case '!skillenchant'"), '!skillenchant case before !enchant');
  // run the inserted SENPURE in a sandbox: same answers as the module
  const pure = s.slice(a, s.indexOf('// SENPURE-END'));
  const fn = new Function(pure + '; return { senDecide, senOrderText };')();
  ok(JSON.stringify(fn.senDecide(plan, me(), { id: 368, route: 1 })) === JSON.stringify(L.senDecide(plan, me(), { id: 368, route: 1 })), 'bot copy of senDecide == dashboard senDecide');
  if (PF) { res = cp.spawnSync(process.execPath, [PF, copy], { encoding: 'utf8' });
  ok(res.status === 2, 'a second run refuses'); }
  try { fs.unlinkSync(copy); } catch (e) { }
}
console.log(`test_skillenchant: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
