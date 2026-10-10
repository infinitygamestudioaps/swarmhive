// BUFF PLANS: sandbox test of the dashboard endpoints (Dashboard/buffpage_api.js) WITHOUT touching the game or the live data.
//  Part 1: the real Dashboard/server.js on a random local port (MCP mocked, timers / child processes off, the real dashboard 8090 never called),
//          plans file = a SCRATCH copy (env SWARM_BUFFPLANS_FILE in os.tmpdir()): static files, GET shape, the live file never created.
//  Part 2: buffpage_api.info/post with a MOCK context (a synthetic party: Prophet, Swordsinger, Bladedancer, Shillien Elder, Destroyer, ... with
//          reported buff skills from the datapack names) for the logic: suggestion, targets, approve/confirm, rev 409, history, overlaps,
//          templates, settings, validation.
//   node docs/plan/tools/test_buffplans_server.js
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), cp = require('child_process'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'buffplans-'));
const PFILE = path.join(TMP, 'buff_plans.json');
process.env.SWARM_BUFFPLANS_FILE = PFILE;
const LIVE = path.join(ROOT, 'Scripts', 'data', 'buff_plans.json');
const liveStat = () => { try { const s = fs.statSync(LIVE); return s.size + ':' + s.mtimeMs; } catch (e) { return 'absent'; } };
const LIVE0 = liveStat();

// ---- stubs (before server.js is loaded) ----
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (/:8083\b/.test(u)) { const b = JSON.parse(opt.body || '{}'); const result = b.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: {} } : { content: [{ type: 'text', text: b.params && b.params.name === 'get_accounts_status' ? '[]' : '{"success":true,"mock":true}' }] };
    const txt = JSON.stringify({ jsonrpc: '2.0', id: b.id, result }); return { headers: { get: (h) => (h.toLowerCase() === 'mcp-session-id' ? 'mock' : null) }, text: async () => txt, json: async () => JSON.parse(txt) }; }
  if (/:8090\b/.test(u)) throw new Error('test: the real dashboard (8090) must never be called');
  return realFetch(url, opt);
};
const T0 = { si: global.setInterval, st: global.setTimeout };
global.setInterval = () => 0; global.setTimeout = () => 0;
cp.fork = () => ({ on() { }, kill() { } });
cp.execFile = (cmd, args, opt, cb) => { const f = typeof opt === 'function' ? opt : cb; if (f) process.nextTick(() => f(null, '', '')); return { on() { } }; };
cp.exec = () => ({ on() { } });
const LOGW = [];
const realAppend = fs.appendFileSync;
fs.appendFileSync = (f, d, o) => { if (/dashboard_commands\.log$/.test(String(f))) { LOGW.push(String(d)); return; } return realAppend(f, d, o); };
let PORT = 0;
const realCreate = http.createServer;
http.createServer = (h) => { const s = realCreate(h); const L = s.listen.bind(s); s.listen = (p, host, cb) => L(0, '127.0.0.1', () => { PORT = s.address().port; if (cb) cb(); }); return s; };
const realLog = console.log; console.log = () => { };
require(path.join(ROOT, 'Dashboard', 'server.js'));
console.log = realLog;
global.setInterval = T0.si; global.setTimeout = T0.st;

const call = (p, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' } }, (res) => {
    let t = ''; res.on('data', c => t += c); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { } resolve({ code: res.statusCode, j, t, type: res.headers['content-type'] }); });
  });
  r.on('error', reject); if (data) r.write(data); r.end();
});
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' — ' + e.message); } }

// ---- part 2: mock context ----
// STAGING (2026-10-10): the page is not wired in yet -> the API comes from docs/plan/staging/buffpage (Dashboard/ once wired)
const API_DIR = fs.existsSync(path.join(ROOT, 'Dashboard', 'buffpage_api.js')) ? path.join(ROOT, 'Dashboard') : path.join(ROOT, 'docs', 'plan', 'staging', 'buffpage');
const WIRED = API_DIR === path.join(ROOT, 'Dashboard');
const API = require(path.join(API_DIR, 'buffpage_api.js'));
const BL = require(path.join(API_DIR, 'bufflogic.js'));
const MT = fs.mkdtempSync(path.join(os.tmpdir(), 'buffplans-mock-'));
const MLOGS = path.join(MT, 'Logs'); fs.mkdirSync(MLOGS);
const MFILE = path.join(MT, 'data', 'buff_plans.json');
const CFG = { boardBuffs: true, accounts: [
  { character: 'Lead', party: 'Lead', role: 'tank' }, { character: 'Pro', party: 'Lead', role: 'buffer' }, { character: 'Pro2', party: 'Lead', role: 'buffer' },
  { character: 'Sws', party: 'Lead', role: 'buffer' }, { character: 'Bd', party: 'Lead', role: 'buffer' }, { character: 'Dd', party: 'Lead', role: 'destroyer' },
  { character: 'Mage', party: 'Lead', role: 'nuker' }, { character: 'Old', party: 'Old', role: 'tank', boardBuffs: false }, { character: 'OldPro', party: 'Old', role: 'auto' }] };
fs.writeFileSync(path.join(MT, 'swarm.config.json'), JSON.stringify(CFG));
const sk = (id, name, ab, kind, abLvl, mlvl) => ({ id, name, ab, abLvl: abLvl || 1, mlvl: mlvl || 40, kind, song: /^(SONG|DANCE)_/.test(ab), time: /^(SONG|DANCE)_/.test(ab) ? 120 : 1200 });
const PROPHET = [sk(1068, 'Might', 'PA_UP', 'target', 3, 40), sk(1040, 'Shield', 'PD_UP', 'target', 3), sk(1086, 'Haste', 'ATTACK_TIME_DOWN', 'target', 2), sk(1085, 'Acumen', 'CASTING_TIME_DOWN', 'target', 3),
  sk(1059, 'Empower', 'MA_UP', 'target', 3), sk(1204, 'Wind Walk', 'SPEED_UP', 'target', 2)];
const STATES = {
  Lead: { name: 'Lead', classId: 33, cls: 'Shillien Knight', level: 50, role: 'tank', roleKind: 'tank', ageSec: 5 },
  Pro: { name: 'Pro', classId: 17, cls: 'Prophet', level: 52, role: 'buffer', roleKind: 'buffer', roleStyle: 'caster', ageSec: 5, buffPlan: { status: 'suggested', skills: PROPHET } },
  Pro2: { name: 'Pro2', classId: 17, cls: 'Prophet', level: 45, role: 'buffer', roleKind: 'buffer', roleStyle: 'caster', ageSec: 5, buffPlan: { status: 'suggested', skills: PROPHET.map(s => Object.assign({}, s, { abLvl: 2, mlvl: 30 })) } },
  Sws: { name: 'Sws', classId: 21, cls: 'Swordsinger', level: 50, role: 'meleebuffer', roleKind: 'buffer', roleStyle: 'melee', ageSec: 5, buffPlan: { skills: [sk(264, 'Song of Earth', 'SONG_OF_EARTH', 'party'), sk(268, 'Song of Wind', 'SONG_OF_WIND', 'party')] } },
  Bd: { name: 'Bd', classId: 34, cls: 'Bladedancer', level: 50, role: 'meleebuffer', roleKind: 'buffer', roleStyle: 'melee', ageSec: 5, buffPlan: { skills: [sk(275, 'Dance of Fury', 'DANCE_OF_FURY', 'party'), sk(274, 'Dance of Fire', 'DANCE_OF_FIRE', 'party')] } },
  Dd: { name: 'Dd', classId: 46, cls: 'Destroyer', level: 50, role: 'destroyer', ageSec: 5 },
  Mage: { name: 'Mage', classId: 12, cls: 'Sorcerer', level: 50, role: 'nuker', ageSec: 5 },
  Old: { name: 'Old', classId: 5, cls: 'Paladin', level: 50, role: 'tank', ageSec: 5 },
  OldPro: { name: 'OldPro', classId: 17, cls: 'Prophet', level: 50, role: 'buffer', ageSec: 900 },   // no report (offline, never logged in with the kit)
};
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const CTX = { DIR: API_DIR, DATA: path.join(ROOT, 'Scripts', 'data'), LOGS: MLOGS, ROOT, readJson, readStates: () => Object.values(STATES),
  teamMap: () => { const m = {}; CFG.accounts.forEach(a => { m[a.character] = a.party; }); return m; }, reloadCfg: () => CFG, mainLeader: 'Lead', buffPlansFile: MFILE };

(async () => {
  for (let i = 0; i < 50 && !PORT; i++) await new Promise(r => T0.st(r, 50));
  console.log(`sandbox server on ${PORT}, scratch plans file ${PFILE}`);
  // ===== part 1: the real server (only once the page is wired into Dashboard/server.js) =====
  if (!WIRED) console.log('  (part 1 skipped: the Buffs page is staged in docs/plan/staging/buffpage, not wired into Dashboard/server.js yet)');
  if (WIRED) {
  await t('static files: /buffpage.js, /buffpage.css, /bufflogic.js (public, before the key check)', async () => {
    for (const f of ['/buffpage.js', '/buffpage.css', '/bufflogic.js']) { const r = await call(f); assert.strictEqual(r.code, 200, f); assert.ok(r.t.length > 1000, f); }
  });
  await t('GET /api/buffplans (live states, no file): parties = leaders (leader first), rev empty, settings = defaults, templates from the example file', async () => {
    const r = await call('/api/buffplans'); assert.strictEqual(r.code, 200, r.t.slice(0, 200));
    assert.strictEqual(r.j.exists, false); assert.strictEqual(r.j.rev, ''); assert.ok(r.j.parties.length >= 1);
    assert.ok(r.j.parties.every(p => p.members[0].name === p.leader), 'leader first');
    assert.strictEqual(r.j.settings.songDanceMax, 14);
    assert.ok(r.j.templates.some(x => x.id === 'example-oldschool' && x.example && !x.own), 'example templates');
    assert.ok(r.j.parties.every(p => typeof p.board === 'boolean'));
  });
  await t('live swarm.config.json has no boardBuffs: every live party = board buffs ON', async () => { const r = await call('/api/buffplans'); assert.ok(r.j.parties.every(p => p.board === true)); });
  await t('POST through the server: unknown action -> 400, the scratch file is used (live file untouched)', async () => {
    const r = await call('/api/buffplans', { action: 'nope' }); assert.strictEqual(r.code, 400);
    assert.strictEqual(liveStat(), LIVE0);
  });

  }
  // ===== part 2: mock context =====
  process.env.SWARM_BUFFPLANS_FILE = MFILE;
  const G = () => API.info(CTX);
  const P = (b) => { const r = API.post(CTX, Object.assign({ rev: G().rev }, b)); return r; };
  const mem = (d, l, n) => d.parties.find(p => p.leader === l).members.find(m => m.name === n);
  const g0 = G();
  await t('mock: buffers found by kind / report (Pro, Pro2, Sws, Bd buffers; Dd, Mage not)', () => {
    const lp = g0.parties.find(p => p.leader === 'Lead');
    assert.deepStrictEqual(lp.members.filter(m => m.buffer).map(m => m.name).sort(), ['Pro', 'Pro2', 'Sws', 'Bd'].sort());
    assert.strictEqual(lp.counts.warn, 4); assert.strictEqual(g0.counts.warn, 5, 'OldPro counts too');
  });
  await t('mock: no plan + board ON = suggestion runs as "fill" (only what the board lacks); Prophet: Might -> fighters, Acumen -> mages', () => {
    const m = mem(g0, 'Lead', 'Pro'); assert.strictEqual(m.status, 'suggested'); assert.strictEqual(m.runs, 'fill');
    const by = (n) => m.plan.buffs.find(b => b.skill === n);
    assert.deepStrictEqual(by('Might').targets, ['fighters']); assert.deepStrictEqual(by('Acumen').targets, ['mages']); assert.deepStrictEqual(by('Wind Walk').targets, ['party']);
  });
  await t('mock: songs / dances go to the rotation list of the suggestion (Sws, Bd)', () => {
    assert.deepStrictEqual(mem(g0, 'Lead', 'Sws').plan.rotation, ['Song of Earth', 'Song of Wind']); assert.deepStrictEqual(mem(g0, 'Lead', 'Bd').plan.rotation, ['Dance of Fury', 'Dance of Fire']);
  });
  await t('mock: overlap — two Prophets with Might on the same fighter: the higher level (Pro) casts', () => {
    const lp = g0.parties.find(p => p.leader === 'Lead');
    const o = lp.overlaps.find(x => x.ab === 'PA_UP' && x.member === 'Dd'); assert.ok(o, JSON.stringify(lp.overlaps.slice(0, 3)));
    assert.strictEqual(o.winner, 'Pro'); assert.deepStrictEqual(o.by.sort(), ['Pro', 'Pro2']); assert.ok(o.skills.includes('Might'));
    assert.ok(!lp.overlaps.some(x => x.ab === 'PA_UP' && x.member === 'Mage'), 'Might is not given to the mage (fighters only)');
  });
  await t('mock: party Old has boardBuffs false on the leader account; OldPro has no report -> "no skill report yet"', () => {
    const op = g0.parties.find(p => p.leader === 'Old'); assert.strictEqual(op.board, false);
    const m = op.members.find(x => x.name === 'OldPro'); assert.ok(m.buffer); assert.ok(/no skill report/.test(m.why));
    const pp = BL.bpEffective(null, { party: [], target: [{ id: 1068, name: 'Might', ab: 'PA_UP', abLvl: 1, time: 1200 }] }, []);
    assert.strictEqual(BL.bpRuns(pp, false), 'full', 'no plan + board OFF = the suggestion runs at once (full)'); assert.strictEqual(BL.bpRuns(pp, true), 'fill');
  });
  await t('mock: set without buffs -> 400; unknown member -> 400; approve without confirm -> 400; nothing written', () => {
    assert.strictEqual(P({ action: 'set', leader: 'Lead', name: 'Pro', buffs: [], rotation: [] }).code, 400);
    assert.strictEqual(P({ action: 'set', leader: 'Lead', name: 'Nobody', buffs: [{ skill: 'Might' }] }).code, 400);
    assert.strictEqual(P({ action: 'set', leader: 'Lead', name: 'Pro', buffs: [{ skill: 'Might' }], approve: true }).code, 400);
    assert.ok(!fs.existsSync(MFILE));
  });
  await t('mock: save (not reviewed) -> file written atomically, status still suggested, warning for a typed unknown skill', () => {
    const r = P({ action: 'set', leader: 'Lead', name: 'Pro', buffs: [{ skill: 'Might', targets: ['Dd'] }, { skill: 'Acumen', targets: ['mages'] }, { skill: 'Greater Might', targets: ['fighters'] }] });
    assert.strictEqual(r.code, 200, JSON.stringify(r)); assert.ok(fs.existsSync(MFILE)); assert.ok(r.warnings.some(w => /Greater Might: not learned/.test(w)));
    const e = JSON.parse(fs.readFileSync(MFILE, 'utf8')).parties.Lead.chars.Pro; assert.strictEqual(e.approved, false); assert.deepStrictEqual(e.buffs[0].targets, ['Dd']);
    assert.strictEqual(mem(G(), 'Lead', 'Pro').status, 'suggested');
    assert.ok(!fs.readdirSync(path.dirname(MFILE)).some(x => /\.tmp$/.test(x)), 'no tmp left');
  });
  await t('mock: approve (confirm) -> ok; the approved plan runs and drives the overlaps (Might now only on Dd)', () => {
    assert.strictEqual(P({ action: 'approve', leader: 'Lead', names: ['Pro'] }).code, 400);
    assert.strictEqual(P({ action: 'approve', leader: 'Lead', names: ['Pro'], confirm: true }).code, 200);
    const g = G(), m = mem(g, 'Lead', 'Pro'); assert.strictEqual(m.status, 'ok'); assert.strictEqual(m.runs, 'full'); assert.strictEqual(m.approved, true);
    const lp = g.parties.find(p => p.leader === 'Lead'); assert.strictEqual(lp.counts.warn, 3);
    assert.ok(!lp.overlaps.some(x => x.ab === 'PA_UP' && x.member === 'Lead' && x.by.includes('Pro')), 'Pro no longer gives Might to the tank');
  });
  await t('mock: stale rev -> 409; history copy made on the second write', () => {
    assert.strictEqual(API.post(CTX, { rev: 'deadbeef', action: 'unapprove', leader: 'Lead', names: ['Pro'] }).code, 409);
    assert.ok(fs.readdirSync(path.join(path.dirname(MFILE), 'history')).some(x => /^buff_plans_.*\.json$/.test(x)), 'history');
  });
  await t('mock: Board buffs switch (2026-10-10): needs confirm, OFF/ON per party wins over swarm.config.json, null goes back, clear keeps the switch', () => {
    const lead = (g) => g.parties.find(p => p.leader === 'Lead');
    const before = lead(G()).board;
    assert.strictEqual(P({ action: 'board', leader: 'Lead', value: false }).code, 400, 'confirm needed');
    assert.strictEqual(P({ action: 'board', leader: 'Lead', value: 'yes', confirm: true }).code, 400, 'bad value');
    assert.strictEqual(P({ action: 'board', leader: 'Lead', value: false, confirm: true }).code, 200);
    let g = G(); assert.strictEqual(lead(g).board, false); assert.strictEqual(lead(g).boardFrom, 'switch');
    assert.strictEqual(P({ action: 'board', leader: 'Lead', value: true, confirm: true }).code, 200);
    g = G(); assert.strictEqual(lead(g).board, true); assert.strictEqual(lead(g).boardFrom, 'switch');
    assert.strictEqual(P({ action: 'board', leader: 'Lead', value: null, confirm: true }).code, 200);
    g = G(); assert.strictEqual(lead(g).board, before, 'back to the swarm.config.json value'); assert.notStrictEqual(lead(g).boardFrom, 'switch');
    assert.strictEqual(P({ action: 'board', leader: 'Lead', value: false, confirm: true }).code, 200);
    const BL = require(path.join(ROOT, 'Dashboard', 'bufflogic.js'));
    const plans = JSON.parse(fs.readFileSync(MFILE, 'utf8'));
    assert.strictEqual(BL.rkBoardBuffs({ boardBuffs: true, accounts: [{ character: 'Lead', boardBuffs: true }] }, 'Lead', plans), false, 'the bots honour the switch over the config');
    assert.strictEqual(P({ action: 'board', leader: 'Lead', value: null, confirm: true }).code, 200);
  });
  await t('mock: settings: bad values -> 400 (slots 99, expired 0, MP wait -1), good ones saved (slots 12, cycleExpiredPct 70)', () => {
    assert.strictEqual(P({ action: 'settings', settings: { songDanceMax: 99 } }).code, 400);
    assert.strictEqual(P({ action: 'settings', settings: { cycleExpiredPct: 0 } }).code, 400);
    assert.strictEqual(P({ action: 'settings', settings: { cycleMpWaitMs: -1 } }).code, 400);
    assert.strictEqual(P({ action: 'settings', settings: { songDanceMax: 12, cycleExpiredPct: 70, rotMinMpPct: 25 } }).code, 200);
    const g = G(); assert.strictEqual(g.settings.songDanceMax, 12); assert.strictEqual(g.settings.cycleExpiredPct, 70); assert.strictEqual(g.settings.cycleMpWaitMs, 60000, 'defaults kept');
  });
  await t('mock: rotation entries keep { skill, keepAlways } and the party cycle interleaves dance, song, dance, song', () => {
    const r = P({ action: 'set', leader: 'Lead', name: 'Bd', buffs: [], rotation: ['Dance of Fury', { skill: 'Dance of Fire', keepAlways: true }] }); assert.strictEqual(r.code, 200, JSON.stringify(r));
    const e = JSON.parse(fs.readFileSync(MFILE, 'utf8')).parties.Lead.chars.Bd; assert.deepStrictEqual(e.rotation, ['Dance of Fury', { skill: 'Dance of Fire', keepAlways: true }]);
    const lp = G().parties.find(p => p.leader === 'Lead');
    assert.deepStrictEqual(lp.cycle.slice(0, 4).map(x => x.by), ['Bd', 'Sws', 'Bd', 'Sws'], JSON.stringify(lp.cycle));
  });
  let tid = null;
  await t('mock: save party as template (by class) -> template with Prophet; apply to party Old (dry run, then not reviewed)', () => {
    const r = P({ action: 'saveTemplate', leader: 'Lead', templateName: 'My buffers' }); assert.strictEqual(r.code, 200, JSON.stringify(r)); tid = r.id;
    assert.ok(r.template.classes.Prophet, 'Prophet entry'); assert.ok(!r.template.classes.Prophet.buffs.some(b => b.targets.includes('Dd')), 'member names are dropped from templates');
    const dry = P({ action: 'applyTemplate', leader: 'Old', id: tid, dryRun: true }); assert.strictEqual(dry.code, 200);
    assert.deepStrictEqual(dry.assign.map(x => x.name), ['OldPro']); assert.ok(!fs.readFileSync(MFILE, 'utf8').includes('OldPro'));
    const ap = P({ action: 'applyTemplate', leader: 'Old', id: tid }); assert.strictEqual(ap.code, 200, JSON.stringify(ap));
    const e = JSON.parse(fs.readFileSync(MFILE, 'utf8')).parties.Old.chars.OldPro; assert.strictEqual(e.approved, false);
  });
  await t('mock: example template applies (Swordsinger rotation) and cannot be deleted; own template deletes', () => {
    const ap = P({ action: 'applyTemplate', leader: 'Lead', id: 'example-swordsinger' }); assert.strictEqual(ap.code, 200, JSON.stringify(ap)); assert.deepStrictEqual(ap.applied, ['Sws']);
    assert.ok(JSON.parse(fs.readFileSync(MFILE, 'utf8')).parties.Lead.chars.Sws.rotation.includes('Song of Earth'));
    assert.strictEqual(P({ action: 'deleteTemplate', id: 'example-swordsinger' }).code, 400);
    assert.strictEqual(P({ action: 'deleteTemplate', id: tid }).code, 200);
  });
  await t('mock: unapprove + clear', () => {
    assert.strictEqual(P({ action: 'unapprove', leader: 'Lead', names: ['Pro'] }).code, 200); assert.strictEqual(mem(G(), 'Lead', 'Pro').status, 'suggested');
    assert.strictEqual(P({ action: 'clear', leader: 'Lead', names: ['Pro'] }).code, 200); assert.strictEqual(mem(G(), 'Lead', 'Pro').entry, null);
  });
  await t('every write logged one dashboard_commands.log line (buffplans)', () => { assert.ok(LOGW.filter(l => /\tbuffplans\t/.test(l)).length >= 8, LOGW.length + ' lines'); });
  await t('example file: every template class exists in class_tree.json and validates', () => {
    const exF = [path.join(ROOT, 'Scripts', 'data', 'buff_plans.example.json'), path.join(API_DIR, 'buff_plans.example.json'), path.join(ROOT, 'docs', 'plan', 'staging', 'buffpage', 'buff_plans.example.json')].find(x => fs.existsSync(x));
    const ex = JSON.parse(fs.readFileSync(exF, 'utf8'));
    const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'class_tree.json'), 'utf8')); const names = new Set(Object.values(T.classes).map(c => c.name));
    Object.values(ex.templates).forEach(tp => Object.keys(tp.classes).forEach(c => { assert.ok(names.has(c), c); assert.ok(BL.bpValidate(tp.classes[c], null, []).ok, c); }));
  });
  await t('the live Scripts/data/buff_plans.json was never created or changed', () => assert.strictEqual(liveStat(), LIVE0));
  console.log(`\n${pass} passed, ${fail} failed`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); fs.rmSync(MT, { recursive: true, force: true }); } catch (e) { }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
