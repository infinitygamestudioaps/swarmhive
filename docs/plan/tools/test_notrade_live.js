// NOTRADELIVE (2026-10-15): items the server refuses in a hand-over trade are learned in Logs/notrade_live.json — but ONE refusal is not proof
// (13:28: Suede, Thread, Animal Bone, Mithril Ore ... were 'not taken' once and got learned as untradeable for good). Rule: an entry counts only
// with n >= 3 separate refusals or sure: true (set by hand). Checks the live-reading part of hovNotrade() and the learning step in hovTradeBatch.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
// 1) reading: only n >= 3 or sure
ok(src.includes('if (e.sure || num(e.n) >= 3) hovNT.add(Number(k));'), 'hovNotrade reads only entries refused 3 times or set by hand');
// 2) learning: counts up, adds only from the 3rd refusal
ok(/const n = num\(o\.n\) \+ 1;/.test(src) && src.includes('if (n >= 3 && !o.sure) { try { hovNotrade().add(num(r.id)); }'), 'a refusal counts up; only the 3rd refusal makes an item untradeable');
ok(!src.includes("refused.forEach(r => { try { hovNotrade().add(num(r.id)); } catch (e) { } });"), 'the old one-refusal rule is gone');
// 3) the rule on data (same logic as the code)
const num = (v) => Number(v) || 0;
const counts = (j) => { const s = new Set(); Object.keys(j).forEach(k => { const e = j[k] || {}; if (e.sure || num(e.n) >= 3) s.add(Number(k)); }); return s; };
const learn = (j, id, name) => { const o = j[String(id)] || {}; const n = num(o.n) + 1; j[String(id)] = Object.assign(o, { name, n }); return n; };
const j = { 5588: { name: 'Tutorial Guide', sure: true } };
learn(j, 1866, 'Suede');
ok(!counts(j).has(1866) && counts(j).has(5588), 'one refusal (Suede): still tradeable; a hand-set entry counts');
learn(j, 1866, 'Suede'); ok(!counts(j).has(1866), 'two refusals: still tradeable');
learn(j, 1866, 'Suede'); ok(counts(j).has(1866), 'three separate refusals: untradeable');
// 4) the live file: no ordinary material marked untradeable
const LIVE = path.join(ROOT, 'Logs', 'notrade_live.json');
if (fs.existsSync(LIVE)) {
  const lj = JSON.parse(fs.readFileSync(LIVE, 'utf8')), bad = [1866, 1868, 1872, 1873, 1876, 1895].filter(id => counts(lj).has(id));
  ok(!bad.length, `Logs/notrade_live.json does not block normal materials (${bad.join(', ') || 'none'})`);
}
console.log(`notrade live: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
