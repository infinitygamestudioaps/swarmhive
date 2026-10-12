// Unit test of Dashboard/levelEta.js (the shared "next level in ~1h 25m" helper, user 2026-10-09 13:20).
//   node docs/plan/tools/test_level_eta.js
// Pure: no server, no files, no game. Synthetic characters only.
'use strict';
const path = require('path');
const LE = require(path.join(__dirname, '..', '..', '..', 'Dashboard', 'levelEta.js'));
// EXP TABLE 2026-10-12: this test uses synthetic level sizes and checks the LEARNED-size path (the fallback); the real table path is
// tested by docs/plan/tools/test_exptable.js.
LE.CFG.useTable = false;
let fails = 0;
const ok = (name, cond, info) => { if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info != null && info !== '' ? ' - ' + info : ''}`); };
const near = (a, b, tol) => a != null && Math.abs(a - b) <= (tol != null ? tol : Math.abs(b) * 0.01 + 1e-9);
const NOW = Date.parse('2026-10-09T11:20:00Z');
const MIN = 60000, SIZE36 = 1216000, SIZE37 = 1350000;
// a log of 10 kills at level 36, 5 s apart, ending `endAgo` ms before NOW
const kills = (n, endAgo, lvl, size, amt) => Array.from({ length: n }, (_, i) => ({ amt, pct: Math.round(amt / size * 100 * 10000) / 10000, at: NOW - endAgo - (n - 1 - i) * 5000, why: 'kill Wind', lvl, up: 0 }));
const ch = (o) => Object.assign({ name: 'T' + Math.random().toString(36).slice(2, 7), level: 36, exp: 40, ageSec: 3 }, o);
const opt = (o) => Object.assign({ now: NOW, smooth: false }, o || {});

console.log('--- hour window');
LE._reset();
{
  const c = ch({ expHour: { pct: 60000 / SIZE36 * 100, amt: 60000, n: 100, mins: 30 }, expLog: kills(10, 3000, 36, SIZE36, 600) });
  const e = LE.calc(c, opt());
  ok('level size learned from the same-level gains', near(LE.levelSize(36), SIZE36, 2000), LE.levelSize(36));
  ok('rate from expHour: 60k exp in 30 min = 9.9 %/h', e.status === 'ok' && e.src === 'hour' && near(e.pctH, 9.868, 0.02), e.pctH);
  ok('ETA: 60 % left / 9.9 %/h = ~6h05', near(e.etaMs / 3600000, 6.08, 0.03), LE.dur(e.etaMs));
  ok('text', /^lvl 37 in ~6h [45]m \(9\.9 %\/h\)$/.test(LE.text(e)), LE.text(e));
  ok('compact', /^lvl in 6h0[45]$/.test(LE.short(e)), LE.short(e));
  ok('clock text', /^at ~(\w{3} )?\d\d:\d\d$/.test(LE.clock(e)), LE.clock(e));
  ok('exp points per hour', near(e.ptsH, 120000, 10), e.ptsH);
  ok('tooltip explains the calculation', /Rate: 9\.9 %\/h .*from the last 30 min/.test(LE.title(e)) && /How:/.test(LE.title(e)), LE.title(e).split('\n')[2]);
}
LE._reset();
{
  const c = ch({ expHour: { pct: 5, amt: 60000, n: 100, mins: 30 }, expLog: [] });
  const e = LE.calc(c, opt());
  ok('no level size known: falls back to the % sum (5 % / 30 min = 10 %/h)', e.status === 'ok' && near(e.pctH, 10), e.pctH);
}
console.log('--- deaths, resurrections');
LE._reset();
{
  const base = kills(8, 60000, 36, SIZE36, 600);
  const death = { amt: -24320, pct: -2, at: NOW - 10 * MIN, why: 'death', lvl: 36, up: 0 };
  const res = { amt: 4864, pct: 0.4, at: NOW - 9 * MIN, why: 'res', lvl: 36, up: 0 };
  const c0 = ch({ expHour: { pct: 60000 / SIZE36 * 100, amt: 60000, n: 100, mins: 30 }, expLog: base });
  const c1 = ch({ expHour: { pct: (60000 - 24320 + 4864) / SIZE36 * 100, amt: 60000 - 24320 + 4864, n: 101, mins: 30 }, expLog: [...base, death, res].sort((a, b) => a.at - b.at) });
  const e0 = LE.calc(c0, opt()), e1 = LE.calc(c1, opt());
  ok('a death + res inside the window do not change the hunting rate', near(e1.pctH, e0.pctH, 0.01), `${e0.pctH.toFixed(3)} vs ${e1.pctH.toFixed(3)}`);
  ok('the death is reported (n, %)', e1.losses.n === 1 && e1.losses.pct === -2, JSON.stringify(e1.losses));
  ok('tooltip mentions the left-out loss', /exp loss .* not counted/.test(LE.title(e1)));
  ok('character page line says deaths are left out', /1 death left out/.test(LE.lineHtml(c1, opt())));
}
LE._reset();
{
  const c = ch({ expHour: { pct: -2, amt: -24320, n: 0, mins: 40 }, expLog: [{ amt: -24320, pct: -2, at: NOW - 5 * MIN, why: 'death', lvl: 36, up: 0 }] });
  const e = LE.calc(c, opt());
  ok('only an exp loss, no gains: none + "only exp losses"', e.status === 'none' && /losses/.test(e.why), `${e.status} / ${e.why}`);
  ok('compact for none', LE.short(e) === 'no exp', LE.short(e));
}
console.log('--- level-ups');
LE._reset();
{
  // learn level 37 size from another character first (shared table)
  LE.calc(ch({ name: 'Other', level: 37, expLog: kills(10, 3000, 37, SIZE37, 700) }), opt());
  ok('level 37 size learned from another character', near(LE.levelSize(37), SIZE37, 3000), LE.levelSize(37));
  const up = { amt: 9000, pct: 0.1, at: NOW - 8 * MIN, why: 'kill Wind', lvl: 37, up: 1 };
  const log = [...kills(4, 9 * MIN, 36, SIZE36, 600), up, ...kills(5, 30000, 37, SIZE37, 700)];
  const c = ch({ level: 37, exp: 4, expHour: { pct: 30, amt: 80000, n: 120, mins: 40 }, expLog: log });
  const e = LE.calc(c, opt());
  ok('level-up inside the window: exp points/h kept, converted with the NEW level size', e.status === 'ok' && e.src === 'hour' && near(e.pctH, 80000 * 1.5 / SIZE37 * 100, 0.02), e.pctH && e.pctH.toFixed(3));
  ok('ETA counts from the new level (96 % left)', near(e.etaMs / 3600000, 96 / e.pctH, 0.01));
}
LE._reset();
{
  const up = { amt: 9000, pct: 0.1, at: NOW - 6 * MIN, why: 'kill Wind', lvl: 37, up: 1 };
  const after = Array.from({ length: 6 }, (_, i) => ({ amt: 40, pct: 0.003, at: NOW - (5 - i) * MIN, why: 'kill Wind', lvl: 37, up: 0 }));   // tiny gains: too few % to learn the level size
  const c = ch({ level: 37, exp: 0.4, expHour: { pct: 30, amt: 80000, n: 120, mins: 40 }, expLog: [...kills(3, 7 * MIN, 36, SIZE36, 600), up, ...after] });
  const e = LE.calc(c, opt());
  ok('level-up, new level size unknown: the window restarts at the level-up (log, 6 x 0.003 % in 6 min = 0.18 %/h)', e.status === 'ok' && e.src === 'recent' && near(e.pctH, 0.18, 0.001) && LE.levelSize(37) == null, `${e.src} ${e.pctH}`);
}
LE._reset();
{
  const up = { amt: 9000, pct: 0.1, at: NOW - 40000, why: 'kill Wind', lvl: 37, up: 1 };
  const c = ch({ level: 37, exp: 0.1, expHour: { pct: 30, amt: 80000, n: 120, mins: 40 }, expLog: [...kills(5, MIN, 36, SIZE36, 600), up] });
  const e = LE.calc(c, opt());
  ok('just levelled, nothing known yet: no estimate (warmup / none), never the old level rate', e.status !== 'ok' && e.pctH == null, `${e.status} / ${e.why}`);
}
console.log('--- no exp, idle, stale, warmup, max');
LE._reset();
{
  const e = LE.calc(ch({ expHour: { pct: 0, amt: 0, n: 0, mins: 60 }, expLog: [] }), opt());
  ok('zero rate: none "no exp lately"', e.status === 'none' && e.why === 'no exp lately' && /no exp lately/.test(LE.text(e)), LE.text(e));
}
LE._reset();
{
  const c = ch({ expHour: { pct: 2, amt: 24320, n: 40, mins: 60 }, expLog: kills(10, 15 * MIN, 36, SIZE36, 600) });
  const e = LE.calc(c, opt());
  ok('no gain for 15 min: idle', e.status === 'idle' && LE.short(e) === 'no exp 15m', `${e.status} ${LE.short(e)}`);
  ok('idle text keeps the old rate', /no exp for 15 min \(was /.test(LE.text(e)), LE.text(e));
  ok('no 30-min marker while idle', LE.markHtml(c, opt()) === '');
}
LE._reset();
{
  const e = LE.calc(ch({ ageSec: 600, expHour: { pct: 5, amt: 60000, n: 100, mins: 30 } }), opt());
  ok('stale report (10 min): stale, nothing shown', e.status === 'stale' && LE.short(e) === '' && LE.text(e) === '', e.why);
  const e2 = LE.calc(ch({ ageSec: undefined, updated: new Date(NOW - 5 * MIN).toISOString(), expHour: { pct: 5, amt: 60000, n: 100, mins: 30 } }), opt());
  ok('stale from the "updated" time when ageSec is missing', e2.status === 'stale');
}
LE._reset();
{
  const e = LE.calc(ch({ expHour: { pct: 0.3, amt: 3600, n: 3, mins: 2 }, expLog: kills(3, 3000, 36, SIZE36, 1200) }), opt());
  ok('2 min after a script reload, 3 gains: warmup "measuring"', e.status === 'warmup' && /measuring/.test(LE.text(e)), LE.text(e));
  const e2 = LE.calc(ch({ expHour: { pct: 1.9, amt: 23000, n: 47, mins: 4.8 }, expLog: kills(10, 3000, 36, SIZE36, 500) }), opt());
  ok('busy short window (47 gains in 4.8 min) is trusted', e2.status === 'ok' && e2.src === 'hour', e2.status);
}
LE._reset();
{
  const e = LE.calc(ch({ level: 85, exp: 10, expHour: { pct: 5, amt: 1e6, n: 100, mins: 60 } }), opt());
  ok('level cap: max', e.status === 'max' && LE.short(e) === 'max lvl');
  ok('bad input: null / no exp', LE.calc(null, opt()).status === 'unknown' && LE.calc({ name: 'x', level: 20 }, opt()).status === 'unknown');
  ok('bad input never throws on junk logs', LE.calc(ch({ expLog: [null, { amt: 'x' }, 5], expHour: 'junk' }), opt()).status !== undefined);
}
console.log('--- long ETAs, the recent-log fallback');
LE._reset();
{
  const c = ch({ level: 51, exp: 5, expHour: { pct: 0.6, amt: 34000, n: 12, mins: 60 }, expLog: [] });
  const e = LE.calc(c, opt());
  ok('0.6 %/h with 95 % left = 158 h -> days', e.status === 'ok' && e.days && LE.dur(e.etaMs) === '6.6 days' && LE.short(e) === 'lvl in 7d', `${LE.dur(e.etaMs)} / ${LE.short(e)}`);
  ok('days are shown with a weekday/date clock', /^at ~\w{3} /.test(LE.clock(e)), LE.clock(e));
}
LE._reset();
{
  const L = Array.from({ length: 10 }, (_, i) => ({ amt: 600, pct: 0.05, at: NOW - (9 - i) * 30000 - 1000, why: 'kill Wind', lvl: 36, up: 0 }));
  const e = LE.calc(ch({ expLog: L }), opt());
  ok('no expHour (old swarm.js): rate from the exp log (9 gains x 0.05 % in 4.5 min = 6 %/h)', e.status === 'ok' && e.src === 'recent' && near(e.pctH, 0.45 / (4.5 * MIN + 1000) * 3600000, 0.01), e.pctH && e.pctH.toFixed(3));
  const e2 = LE.calc(ch({ expLog: L.slice(-3).map((x, i) => Object.assign({}, x, { at: NOW - 30000 + i * 5000 })) }), opt());
  ok('exp log covering < 2 min: warmup', e2.status === 'warmup', e2.status);
}
console.log('--- smoothing');
LE._reset();
{
  const c1 = ch({ name: 'Smo', expHour: { pct: 5, amt: 60800, n: 100, mins: 30 }, expLog: [] });
  const a = LE.calc(c1, { now: NOW });
  const c2 = Object.assign({}, c1, { expHour: { pct: 10, amt: 121600, n: 200, mins: 30 } });
  const b = LE.calc(c2, { now: NOW + 30000 });
  ok('smoothing: a jump from 10 to 20 %/h moves part of the way in 30 s', b.pctH > a.pctH && b.pctH < 20 && near(b.pctH, 10 + 10 * (1 - Math.exp(-0.5)), 0.05), `${a.pctH.toFixed(2)} -> ${b.pctH.toFixed(2)}`);
  const c3 = Object.assign({}, c2, { level: 37, exp: 1 });
  const d = LE.calc(c3, { now: NOW + 60000 });
  ok('smoothing resets at a level change', near(d.pctH, 20, 0.01), d.pctH.toFixed(2));
  const f = LE.calc(c2, { now: NOW + 60000 + 11 * MIN });
  ok('smoothing resets after 10 min without a refresh', near(f.pctH, 20, 0.01), f.pctH.toFixed(2));
}
console.log('--- formatting');
ok('dur < 1 min', LE.dur(20000) === 'under a minute' && LE.dur(20000, true) === '<1m');
ok('dur 25 min', LE.dur(25 * MIN) === '25m' && LE.dur(25 * MIN, true) === '25m');
ok('dur 1h 25m', LE.dur(85 * MIN) === '1h 25m' && LE.dur(85 * MIN, true) === '1h25', LE.dur(85 * MIN, true));
ok('dur 2h exactly', LE.dur(120 * MIN) === '2h' && LE.dur(120 * MIN, true) === '2h00');
ok('dur 48h stays in hours, 49h becomes days', LE.dur(48 * 60 * MIN) === '48h' && LE.dur(49 * 60 * MIN) === '2.0 days');
ok('dur > 60 days', LE.dur(70 * 86400000, true) === '60d+');
ok('dur nonsense', LE.dur(null) === '?' && LE.dur(Infinity) === '?');
{
  const n = new Date(2026, 9, 9, 13, 20).getTime();
  ok('clockOf same day = HH:MM', LE.clockOf(n + 87 * MIN, n) === '14:47', LE.clockOf(n + 87 * MIN, n));
  ok('clockOf tomorrow = weekday HH:MM', LE.clockOf(n + 20 * 60 * MIN, n) === 'Sat 09:20', LE.clockOf(n + 20 * 60 * MIN, n));
  ok('clockOf in 10 days = weekday + date', /^\w{3} 19 Oct$/.test(LE.clockOf(n + 10 * 86400000, n)), LE.clockOf(n + 10 * 86400000, n));
}
ok('rate text', LE.rateTxt(7.43) === '7.4 %/h' && LE.rateTxt(0.456) === '0.46 %/h' && LE.rateTxt(0.0123) === '0.012 %/h');
console.log('--- 30-min marker');
LE._reset();
{
  const c = ch({ exp: 40, expHour: { pct: 10, amt: 121600, n: 100, mins: 60 }, expLog: [] });   // 10 %/h -> +5 % in 30 min
  const m = LE.markHtml(c, opt());
  ok('marker at exp + 30 min of rate (45 %)', /class="le-mk" style="left:45\.00%"/.test(m) && /le-fut" style="left:40\.00%;width:5\.00%"/.test(m), m);
  const g = LE.withMark('<div class="gauge xp"><i style="width:40%"></i><span>40%</span></div>', c, opt());
  ok('withMark puts it inside the gauge', /<span>40%<\/span><b class="le-fut".*<\/div>$/.test(g));
  const m2 = LE.markHtml(ch({ exp: 97, expHour: { pct: 10, amt: 121600, n: 100, mins: 60 } }), opt());
  ok('levels within 30 min: end marker', /le-mk lvl/.test(m2), m2);
}
console.log('--- party: when the LOWEST level goes up');
LE._reset();
{
  const fast = ch({ name: 'Fast', level: 36, exp: 90, expHour: { pct: 10, amt: 121600, n: 100, mins: 60 } });   // 1h
  const slow = ch({ name: 'Slow', level: 36, exp: 50, expHour: { pct: 10, amt: 121600, n: 100, mins: 60 } });   // 5h
  const high = ch({ name: 'High', level: 38, exp: 10, expHour: { pct: 1, amt: 15000, n: 10, mins: 60 } });
  const off = ch({ name: 'Off', level: 30, exp: 10, ageSec: 3600 });
  const p = LE.party([fast, slow, high, off], opt());
  ok('lowest online level (offline members ignored)', p.level === 36 && p.n === 2, JSON.stringify({ l: p.level, n: p.n }));
  ok('the slowest member at the lowest level decides', p.status === 'ok' && p.who === 'Slow' && near(p.etaMs / 3600000, 5, 0.02), `${p.who} ${LE.dur(p.etaMs)}`);
  ok('party text', /^lowest lvl 36 → 37 in ~5h/.test(LE.partyText(p)), LE.partyText(p));
  ok('party html names the last one', /lowest 36→37 in 5h00 \(Slow last\)/.test(LE.partyHtml([fast, slow, high, off], opt())), LE.partyHtml([fast, slow, high, off], opt()).replace(/title="[^"]*"/, ''));
  const idle = ch({ name: 'Idle', level: 36, exp: 50, expHour: { pct: 0, amt: 0, n: 0, mins: 60 } });
  const q = LE.party([fast, idle, high], opt());
  ok('a lowest-level member without an estimate: unknown + who', q.status === 'unknown' && q.missing[0].name === 'Idle' && /no estimate for Idle/.test(LE.partyText(q)), LE.partyText(q));
  ok('empty / all offline party: null', LE.party([], opt()) === null && LE.party([off], opt()) === null);
}
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
