#!/usr/bin/env node
// TEST soul crystals (forum topic 503 + L2J H5 levelUpCrystalData.xml, 2026-10-12): Dashboard/soullogic.js rules, Scripts/data/soul_crystals.json,
// Dashboard/soulplan_api.js (/api/soulstageplan on a fake request), Dashboard/soulplan.js (static checks), the catalog entry and
// the swarm.js patch (scratchpad patch_soulcrystal.js on a COPY of Scripts_dev/swarm.js + node --check; env PATCH overrides; skipped when absent).
// Never touches the game, L2Swarm, the dashboard server or swarm.js.  Run: node docs/plan/tools/test_soulcrystal.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const SL = require(path.join(ROOT, 'Dashboard', 'soullogic.js'));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'soul_crystals.json'), 'utf8'));

console.log('--- data (soul_crystals.json vs the logic)');
['red', 'green', 'blue'].forEach(c => {
  ok(SL.SOUL_IDS[c].length === 19, `${c}: 19 crystal ids (stages 0-18)`);
  const all = (D.itemsAll || {})[c] || {};
  const diff = Object.keys(all).filter(st => Number(all[st]) !== SL.SOUL_IDS[c][Number(st)]);
  ok(Object.keys(all).length >= 14 && !diff.length, `${c}: itemsAll matches SOUL_IDS (${Object.keys(all).length} stages${diff.length ? ', differ at ' + diff.join(',') : ''})`);
});
ok(SL.soulCrystalOf(4629).color === 'red' && SL.soulCrystalOf(4629).stage === 0 && SL.soulCrystalOf(4639).stage === 10, 'red 4629 = stage 0, 4639 = stage 10');
ok(D.monsters.length > 50 && D.raidBosses.length > 50, `monsters ${D.monsters.length}, raid bosses ${D.raidBosses.length}`);
const qa = D.raidBosses.find(b => b.name === 'Queen Ant');
ok(qa && qa.absorb === 'FULL_PARTY' && qa.stages.includes(10), 'Queen Ant: FULL_PARTY at stage 10 (forum: red/yellow, the party rolls)');
ok(D.forum503 && /topic 503/.test(D.forum503.mark) && Array.isArray(D.forum503.conflicts), 'forum 503 summary + conflicts recorded');
ok(D.buy && D.buy.npc && D.buy.npc.name === 'Alexandria' && D.buy.offers.some(o => o.stage === 10), 'Alexandria (Giran) sells stage 10 (forum step 2)');
ok((D.questNpcs || []).some(n => n.town === 'Giran') && (D.questNpcs || []).some(n => n.town === 'Aden'), 'quest 350 NPCs in Giran + Aden (forum step 1)');
ok(SL.soulPct(9) === 10 && SL.soulPct(100) === 100, 'chance N = (N+1) %');

console.log('--- soulUseDecide');
const timak = D.monsters.find(m => m.name === 'Timak Orc');
const base = { on: true, pref: 'red', crystals: [{ color: 'red', stage: 0, count: 1 }], target: { color: 'red', stage: 7 }, levelOn: true, quest: true, healer: false,
  mob: { id: 5, hp: 40, dead: false }, entry: timak, lastMob: 0, lastAt: 0, now: 1e9, reuseMs: 4000, useBelowHp: 50 };
ok(SL.soulUseDecide(base).use === true, 'damage dealer, 1 crystal, Timak Orc at 40 %: use');
ok(!SL.soulUseDecide(Object.assign({}, base, { healer: true })).use, 'healer: never on LAST_HIT monsters');
ok(!SL.soulUseDecide(Object.assign({}, base, { quest: false })).use, 'quest 350 not started: no use');
ok(SL.soulUseDecide(Object.assign({}, base, { quest: null })).use, 'quest unknown: use goes on');
ok(!SL.soulUseDecide(Object.assign({}, base, { crystals: [{ color: 'red', stage: 0, count: 2 }] })).use, 'two crystals: resonation, no use');
ok(!SL.soulUseDecide(Object.assign({}, base, { mob: { id: 5, hp: 80 } })).use, 'above 50 % HP: wait');
ok(!SL.soulUseDecide(Object.assign({}, base, { crystals: [{ color: 'red', stage: 5, count: 1 }] })).use, 'Timak Orc does not take stage 5 (978)');
ok(!SL.soulUseDecide(Object.assign({}, base, { crystals: [{ color: 'red', stage: 7, count: 1 }] })).use, 'finished at the target stage: store it');
ok(!SL.soulUseDecide(Object.assign({}, base, { entry: qa, crystals: [{ color: 'red', stage: 10, count: 1 }], target: { color: 'red', stage: 13 } })).use, 'Queen Ant (FULL_PARTY): no crystal use needed');

console.log('--- soulKeepOne / soulNeeds');
const k = SL.soulKeepOne([{ color: 'red', stage: 3 }, { color: 'blue', stage: 5 }, { color: 'red', stage: 7 }], { color: 'red', stage: 7 });
ok(k.keep && k.keep.color === 'red' && k.keep.stage === 3 && k.store.length === 2, 'keeps the unfinished target-colour one, stores the finished + the extra');
const nd = SL.soulNeeds([{ name: 'A', crystals: [{ color: 'red', stage: 2 }] }, { name: 'H', healer: true, crystals: [{ color: 'red', stage: 2 }] }, { name: 'B', crystals: [] }]);
ok(nd.who.length === 1 && nd.who[0].name === 'A' && nd.stages.join() === '2', 'only the damage dealer with one crystal levels on monsters');

console.log('--- soulStagePlan');
const p = SL.soulStagePlan(D, { color: 'red', from: 0, to: 10, level: 45 });
ok(p.steps.length === 10 && p.steps[0].stage === 0 && p.steps[9].to === 10, 'stages 0 -> 10: 10 steps');
ok(p.steps.every(s => s.mobs.length || s.bosses.length || s.buy), 'every step has a source');
ok(p.steps[0].mobs.every(m => m.pct > 0 && m.level), 'monster rows carry chance + level');
ok(p.buy && p.buy.stage === 10 && p.buy.skips === 10, 'shortcut: Alexandria stage 10 skips 10 stages');
const ph = SL.soulStagePlan(D, { color: 'red', from: 10, to: 13, level: 60, healer: true });
ok(ph.steps.every(s => s.method !== 'monsters'), 'healer plan never says "monsters"');

console.log('--- /api/soulstageplan (fake request, temp Logs)');
(async () => {
  const api = require(path.join(ROOT, 'Dashboard', 'soulplan_api.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soulplan_'));
  fs.writeFileSync(path.join(tmp, 'soul_Alpha.json'), JSON.stringify({ name: 'Alpha', level: 52, crystals: [{ color: 'red', stage: 4, count: 1 }], target: { sa: 'Focus', weapon: 'X', grade: 'C', stage: 7, color: 'red' }, levelOn: true }));
  fs.writeFileSync(path.join(tmp, 'soul_Beta.json'), JSON.stringify({ name: 'Beta', level: 20, crystals: [], target: null }));
  fs.writeFileSync(path.join(tmp, 'soul_q350_Alpha.txt'), 'x');
  const call = async (u, method) => { let out = null; const res = {}; const ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA: path.join(ROOT, 'Scripts', 'data'), LOGS: tmp, allowed: () => true,
    json: (r, code, body) => { out = { code, body }; }, send: (r, code, type, body) => { out = { code, type, body: String(body).slice(0, 80) }; } };
    const handled = await api.handle({ method: method || 'GET' }, res, new URL('http://x' + u), ctx); return { handled, out }; };
  let r = await call('/api/soulstageplan');
  ok(r.handled && r.out.code === 200 && r.out.body.chars.length === 1 && r.out.body.chars[0].name === 'Alpha', 'list: only characters with a crystal or target');
  const a = r.out.body.chars[0];
  ok(a.from === 4 && a.to === 7 && a.plan.steps.length === 3, 'Alpha: red 4 -> 7 = 3 steps');
  r = await call('/api/soulstageplan?color=green&from=0&to=3&level=41');
  ok(r.out.code === 200 && r.out.body.plan.color === 'green' && r.out.body.plan.steps.length === 3, 'custom plan green 0 -> 3');
  r = await call('/api/soulstageplan?color=pink');
  ok(r.out.code === 400, 'bad colour refused');
  r = await call('/api/soulstageplan', 'POST');
  ok(r.out.code === 405, 'read-only: POST refused');
  r = await call('/soulplan.js');
  ok(r.handled && r.out.code === 200, '/soulplan.js served');
  r = await call('/api/other');
  ok(r.handled === false, 'other paths fall through');
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }

  console.log('--- dashboard wiring (static)');
  const srv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), idx = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
  ok(/require\('\.\/soulplan_api'\)\.handle/.test(srv), 'server.js mounts soulplan_api');
  ok(idx.includes('<script src="/soulplan.js"></script>') && idx.includes('<script src="/soullogic.js"></script>'), 'index.html loads soullogic.js + soulplan.js');
  const pj = fs.readFileSync(path.join(ROOT, 'Dashboard', 'soulplan.js'), 'utf8');
  ok(!/\b(alert|confirm|prompt)\s*\(/.test(pj.replace(/uiConfirm|uiAlert|uiPrompt/g, '')), 'soulplan.js: no browser alert/confirm/prompt');
  const C = require(path.join(ROOT, 'Dashboard', 'commands.js'));
  ok(C.classify('!soul hunt').id === 'soulhunt' && C.classify('!soul hunt off').id === 'soulhunt' && C.classify('!soul').id === 'soulstat', 'catalog: !soul hunt has its own entry');

  console.log('--- swarm.js patch (on a copy)');
  const cand = [process.env.PATCH, path.join(os.tmpdir(), 'claude', 'C--L2-L2Swarm', '9d69d83a-07bd-4424-92b7-5679277c4b38', 'scratchpad', 'patch_soulcrystal.js')].filter(Boolean);
  const P = cand.find(f => fs.existsSync(f));
  const ALREADY = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8').includes('// SOUL-PURE-BEGIN');   // applied to the source already: check the source itself
  if (!P && !ALREADY) console.log('  skip patch_soulcrystal.js not found');
  else {
    const copy = path.join(os.tmpdir(), 'swarm_soul_test_' + process.pid + '.js');
    fs.copyFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), copy);
    let res = ALREADY ? { status: 0 } : cp.spawnSync(process.execPath, [P, copy], { encoding: 'utf8' });
    ok(res.status === 0, (ALREADY ? 'source already patched' : 'patch applies to a fresh copy') + (res.status ? ': ' + (res.stderr || res.stdout).slice(0, 300) : ''));
    res = cp.spawnSync(process.execPath, ['--check', copy], { encoding: 'utf8' });
    ok(res.status === 0, 'node --check passes');
    const s = fs.readFileSync(copy, 'utf8');
    ok(s.includes('// SOUL-PURE-BEGIN') && s.includes('function soulUseDecide(') && s.includes('async function leadSoulHunt('), 'SOUL-PURE block + !soul hunt present');
    const a1 = s.indexOf('// SOUL-PURE-BEGIN'), b1 = s.indexOf('// SOUL-PURE-END');
    ok(s.slice(a1, b1).indexOf(String.fromCharCode(92)) < 0, 'no backslash in the copied SOUL-PURE block');
    ok(/never sell a soul crystal/.test(s) && /Soul Crystal\(\[\^A-Za-z\]\|\$\)/.test(s), 'soul crystals are never sold / never stashed by a rule');
    if (P) { res = cp.spawnSync(process.execPath, [P, copy], { encoding: 'utf8' });
    ok(res.status === 2, 'a second run refuses'); }
    try { fs.unlinkSync(copy); } catch (e) { }
  }
  console.log(`test_soulcrystal: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
