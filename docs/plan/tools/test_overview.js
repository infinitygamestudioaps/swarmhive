// OVERVIEW-2026-10-24: Dashboard/overview_api.js on synthetic data (a temp Logs folder; no real files touched).
//   A total exp from level + %, B rates over the window (exp/h, wallet/h, level-ups, kills/h), C deaths = alive -> dead edges,
//   D costs (supply_use x prices, gear_upgrades "bought", pshop "= N adena"), E party sums + next level-ups, F the recorder line + read back.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'ovtest-')), LOGS = path.join(SB, 'Logs'), DIR = path.join(SB, 'Dashboard');
fs.mkdirSync(LOGS); fs.mkdirSync(path.join(DIR, 'data'), { recursive: true });
fs.writeFileSync(path.join(DIR, 'data', 'item_prices.json'), JSON.stringify({ 1463: 10, 1061: 300 }));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const O = require(path.join(ROOT, 'Dashboard', 'overview_api.js')), LE = require(path.join(ROOT, 'Dashboard', 'levelEta.js'));
const now = Date.now(), H = 3600000;

// A
ok(O.totalExp(10, 0) === LE.expTotal(10), 'A1 level start');
ok(O.totalExp(10, 50) === Math.round(LE.expTotal(10) + (LE.expTotal(11) - LE.expTotal(10)) / 2), 'A2 half level');
ok(O.totalExp(0, 5) === null && O.totalExp(10, null) === null, 'A3 missing = null');

// B + C: Alpha hunts an hour (exp +1000 per minute, adena +100k over the hour, one level-up, one death)
const R = O._R; R.ring.clear(); R.deaths.clear();
const base = O.totalExp(40, 10);
const push = (name, s) => { const a = R.ring.get(name) || []; const prev = a[a.length - 1]; if (prev && !prev.dead && s.dead) { const d = R.deaths.get(name) || []; d.push(s.at); R.deaths.set(name, d); } a.push(s); R.ring.set(name, a); };
for (let i = 0; i <= 60; i++) push('Alpha', { at: now - H + i * 60000, party: 'Alpha', level: i < 30 ? 40 : 41, exp: base + i * 1000, adena: 1e6 + i * 100000 / 60, dead: i === 40 ? 1 : 0, on: 1, kh: 90 });
for (let i = 0; i <= 60; i++) push('Beta', { at: now - H + i * 60000, party: 'Alpha', level: 38, exp: O.totalExp(38, 20) + i * 500, adena: 5e5, dead: 0, on: 1, kh: 60 });
// D: costs in the window
fs.writeFileSync(path.join(LOGS, 'supply_use_Alpha.json'), JSON.stringify({ v: 1, b: [{ h: Math.floor((now - 30 * 60000) / H) * H, ms: 1800000, u: { 1463: 1000, 1061: 2 } }, { h: now - 30 * H, ms: 1, u: { 1463: 99999 } }] }));
const iso = (t) => new Date(t).toISOString();
fs.writeFileSync(path.join(LOGS, 'gear_upgrades.log'), `${iso(now - 20 * 60000)} [Beta] lvl 38 mage (supply run): Karmian Tunic 336105: bought; Karmian Stockings 210325: bought | x\n${iso(now - 5 * H)} [Beta] old: Thing 999999: bought\n`);
fs.writeFileSync(path.join(LOGS, 'pshop_buys.log'), `${iso(now - 10 * 60000)} [Alpha] bought 100 x Soulshot (B) at 400 from M40 = 40,000 adena (max 400)\n${iso(now - 10 * 60000)} [Alpha] run: bought 100 Soulshot (B) at 400 (M40) for 40,000 adena\n`);
const st = (n, lvl, exp, extra) => Object.assign({ name: n, party: 'Alpha', level: lvl, exp, adena: 1e6, ageSec: 2, leader: n === 'Alpha', role: 'tank', classId: 6, expHour: { amt: 60000, pct: 3, n: 90, mins: 60 }, expLog: [] }, extra || {});
const ctx = { DIR, LOGS, readStates: () => [st('Alpha', 41, 12, { expLog: [{ up: true, at: now - 30 * 60000 }] }), st('Beta', 38, 40)] };
const v = O.build(ctx, 1);
const A = v.chars.find(c => c.name === 'Alpha'), B = v.chars.find(c => c.name === 'Beta');
ok(Math.abs(A.expH - 60000) < 200, 'B1 exp/h ~60000, got ' + A.expH);
ok(Math.abs(A.adenaH - 100000) < 2000, 'B2 wallet/h ~100k, got ' + A.adenaH);
ok(A.levels === 1 && B.levels === 0, 'B3 level-ups counted');
ok(A.killsH === 90, 'B4 kills/h from the samples');
ok(A.deaths === 1 && B.deaths === 0, 'C1 one death (alive -> dead edge)');
const bh = Math.floor((now - 30 * 60000) / H) * H;   // the bucket's hour; only its part inside [now - 1 h, now] counts
const useCost = (1000 * 10 + 2 * 300) * (Math.min(now, bh + H) - Math.max(now - H, bh)) / H;
ok(Math.abs(A.useH - useCost) < 50, 'D1 consumables only inside the window, ' + A.useH + ' vs ' + Math.round(useCost));
ok(A.gearH === 40000, 'D2 player shop buy counted once (not the "run:" echo), got ' + A.gearH);
ok(B.gearH === 336105 + 210325, 'D3 gear bought in the window only, got ' + B.gearH);
ok(A.costH === A.useH + A.gearH, 'D4 costs = use + gear');
const P = v.parties.find(p => p.leader === 'Alpha');
ok(P && P.n === 2 && P.expH === A.expH + B.expH && P.costH === A.costH + B.costH, 'E1 party sums its members');
ok(P.minLevel === 38, 'E2 party lowest level');
ok(v.ups.length === 1 && v.ups[0].name === 'Alpha', 'E3 just levelled');
ok(v.total.n === 2 && v.total.deaths === 1, 'E4 totals');
ok(A.spark.length === 24 && A.spark[23] > A.spark[0], 'E5 exp line rises');

// F: recorder writes a line per character and a fresh module reads it back
O._R.ctx = ctx; O._R.ring.clear(); O._R.deaths.clear();
const f = path.join(LOGS, 'overview_' + new Date().toISOString().slice(0, 10) + '.tsv');
const line = (t, n, dead) => [Math.round(t / 1000), n, 'Alpha', 40, 5000, 100, dead, 1, 50].join('\t');
fs.writeFileSync(f, [line(now - 120000, 'Alpha', 0), line(now - 60000, 'Alpha', 1), line(now - 60000, 'Beta', 0)].join('\n') + '\n');
delete require.cache[require.resolve(path.join(ROOT, 'Dashboard', 'overview_api.js'))];
const O2 = require(path.join(ROOT, 'Dashboard', 'overview_api.js'));
O2._R.started = 1; O2._R.ctx = ctx;   // no timers in a test
(function loadBack() { const R2 = O2._R; const mod = O2; mod.start; })();
// loadBack is internal: start() calls it; run start with a ctx that has no timers effect beyond the test (unref them)
const _si = global.setInterval, _st = global.setTimeout; global.setInterval = () => 0; global.setTimeout = () => 0;
O2._R.started = 0; O2.start(ctx); global.setInterval = _si; global.setTimeout = _st;
ok((O2._R.ring.get('Alpha') || []).length === 2 && (O2._R.ring.get('Beta') || []).length === 1, 'F1 read back after a restart');
ok((O2._R.deaths.get('Alpha') || []).length === 1, 'F2 death edge rebuilt from the file');

fs.rmSync(SB, { recursive: true, force: true });
console.log(fail ? `overview: ${pass} passed, ${fail} failed` : `overview: ALL OK (${pass} checks)`);
process.exit(fail ? 1 : 0);
