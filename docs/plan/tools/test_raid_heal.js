// RAIDHEAL-2026-10-17 tests: raid healing per boss (Dashboard/raidheallogic.js, Dashboard/raidheal_api.js, swarm.js RAIDHEAL-PURE copy + host wiring).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
let ok = 0, bad = 0; const t = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const L = require(path.join(ROOT, 'Dashboard', 'raidheallogic.js'));
// 1) presets: normal = the raid healing from before this setting
const N = L.rhResolve(null);
t(N.level === 'normal' && N.spamBelow === 80 && N.tankBelow === 60 && N.groupCount === 3 && N.stagger === 350 && N.idleMs === 250 && !N.keepTarget, 'normal = the old numbers (80 / 60 / 3, 350 ms stagger, 250 ms idle)');
const X = L.rhResolve({ level: 'extreme' });
t(X.spamBelow > 90 && X.tankBelow > 90 && X.stagger === 0 && X.keepTarget && X.potionBelow >= 90, 'extreme heals early, no stagger, keeps the target, potions early');
t(L.rhResolve({ level: 'heavy', custom: { spamBelow: 150, groupCount: 0 } }).spamBelow === 99 && L.rhResolve({ level: 'heavy', custom: { groupCount: 0 } }).groupCount === 1, 'own numbers are clamped');
t(L.rhClean({ level: 'normal' }) === null && L.rhClean({ level: 'bogus' }) === null, 'normal without own numbers = no entry');
// 2) pick by id, then by name
const J = { bosses: { 25260: { name: 'Iron Giant Totem', level: 'extreme' }, 99999: { name: 'Other Boss', level: 'heavy' } } };
t(L.rhPick(J, 25260, '').level === 'extreme' && L.rhPick(J, 0, 'other boss').level === 'heavy' && L.rhPick(J, 1, 'nobody') === null, 'pick by npc id, else by name');
// 3) tank first
t(L.rhTankFirst(X, 90, [96]) === true && L.rhTankFirst(X, 90, [40]) === false && L.rhTankFirst(X, 30, [20]) === true && L.rhTankFirst(N, 70, [90]) === false && L.rhTankFirst(N, 55, [90]) === true, 'tank first below its line unless someone else is dying (and always below 60)');
// 4) swarm.js text copy + wiring
const SW = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8'), LG = fs.readFileSync(path.join(ROOT, 'Dashboard', 'raidheallogic.js'), 'utf8');
const blk = (s) => { const a = s.indexOf('// RAIDHEAL-PURE-BEGIN'), b = s.indexOf('// RAIDHEAL-PURE-END'); return a < 0 || b < 0 ? '' : s.slice(a, b).split('\n').map(l => l.trim()).join('\n'); };
t(blk(SW) && blk(SW) === blk(LG), 'swarm.js RAIDHEAL-PURE = Dashboard/raidheallogic.js');
t(/const SC = hsMine\(\), RH = raidHealNow\(\)/.test(SW) && /rhTankFirst\(RH, tank\.hp/.test(SW) && /spamLine = RH \? RH\.spamBelow : HEAL\.spamBelow/.test(SW) && /await sleep\(RH \? RH\.idleMs : 250\)/.test(SW), 'healTick uses the boss profile (potion, tank, spam, group, idle)');
t(/RH\.keepTarget && Target && num\(Target\.objId\) === num\(t\.objId\)/.test(SW) && /\}, 100\);\nlet healTickEnd = 0;/.test(SW), 'castOnMate keeps the target; the healer loop checks every 100 ms');
{ const B = String.fromCharCode(92); t(SW.includes("${SWARM_ROOT}" + B + B + "Scripts" + B + B + "data" + B + B + "raid_heal.json"), "swarm.js reads Scripts/data/raid_heal.json (escaped path)"); }
// 5) API on a scratch file
const tmp = path.join(os.tmpdir(), 'raidheal_test_' + Date.now()); fs.mkdirSync(path.join(tmp, 'Logs'), { recursive: true });
process.env.SWARM_RAIDHEAL_FILE = path.join(tmp, 'raid_heal.json');
const A = require(path.join(ROOT, 'Dashboard', 'raidheal_api.js')), ctx = { DATA: tmp, LOGS: path.join(tmp, 'Logs'), ROOT };
let r = A.post(ctx, { action: 'set', id: 25260, name: 'Iron Giant Totem', level: 'extreme' });
t(r.ok && JSON.parse(fs.readFileSync(process.env.SWARM_RAIDHEAL_FILE, 'utf8')).bosses['25260'].level === 'extreme', 'API set writes the file');
t(A.post(ctx, { action: 'set', id: 25260, level: 'heavy', rev: 'old' }).code === 409, 'API refuses a stale rev');
r = A.post(ctx, { action: 'set', id: 25260, name: 'Iron Giant Totem', level: 'heavy', custom: { spamBelow: 93 }, rev: A.summary(ctx).rev });
t(r.ok && A.summary(ctx).bosses['25260'].resolved.spamBelow === 93, 'own numbers saved and resolved');
t(A.post(ctx, { action: 'set', id: 'x', level: 'heavy' }).code === 400 && A.post(ctx, { action: 'set', id: 25260, level: 'mega' }).code === 400, 'API rejects a bad id / level');
r = A.post(ctx, { action: 'clear', id: 25260 }); t(r.ok && !A.summary(ctx).bosses['25260'], 'API clear = normal again');
t(fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8').includes("require('./raidheal_api').handle("), 'server.js hooks the API');
t(/renderBossHeal\(b\)/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'raidspage.js'), 'utf8')) && /src="\/raidheallogic\.js"/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8')), 'boss page has the Healing box');
console.log(`
${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
