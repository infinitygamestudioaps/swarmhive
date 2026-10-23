// OFFLINE TEST of LOOTLOG-2026-10-23 (public tester Vykaax: "a loot tracking tab with filters ... grade, type, time and date and who looted it").
//   node docs/plan/tools/test_loot.js       (exit code 1 when a check fails)
// 1) swarm.js LOOTLOG-PURE lootParse on real server message shapes  2) Dashboard/lootpage_api.js on a scratch Logs folder  3) wiring
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const R = path.join(__dirname, '..', '..', '..');
const SW = fs.readFileSync(path.join(R, fs.existsSync(path.join(R, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev/swarm.js' : 'Scripts/swarm.js'), 'utf8');
let ok = 0, bad = 0;
const t = (name, c, info) => { if (c) ok++; else { bad++; console.log('FAIL', name, info !== undefined ? JSON.stringify(info).slice(0, 300) : ''); } };
const i = SW.indexOf('// LOOTLOG-PURE-BEGIN'), j = SW.indexOf('// LOOTLOG-PURE-END');
if (i < 0 || j < 0) { console.log('FAIL LOOTLOG-PURE block missing'); process.exit(1); }
const P = new Function(SW.slice(i, j) + '\nreturn { lootParse };')();
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
t('one item', eq(P.lootParse('You have earned Thread.'), { count: 1, name: 'Thread', how: 'loot' }));
t('a stack', eq(P.lootParse('You have earned 3 Thread(s).'), { count: 3, name: 'Thread', how: 'loot' }));
t('a big stack with a comma', eq(P.lootParse('You have earned 1,250 Soulshot (C-Grade)(s).'), { count: 1250, name: 'Soulshot (C-Grade)', how: 'loot' }));
t('a sweep = spoiled', eq(P.lootParse('You have obtained Salamander Skin Mail Texture by using Sweeper.'), { count: 1, name: 'Salamander Skin Mail Texture', how: 'spoil' }));
t('adena is not loot', P.lootParse('You have earned 1,250 adena.') === null);
t('experience is not loot', P.lootParse('You have earned 4438 experience and 339 SP.') === null);
t('other messages are ignored', P.lootParse('You use Accuracy.') === null && P.lootParse('') === null);
t('every window notes its loot from OnSystemMessage', /globalThis\.OnSystemMessage = \(id, text\) => \{\n  try \{ lootNote\(text\); \} catch \(e\) \{ \}/.test(SW));
t('buffered, written every 20 s to Logs/loot_<day>.log', /appendShared\(`\$\{SWARM_ROOT\}\\\\Logs\\\\loot_\$\{day\}\.log`, rows\.join\(''\)\)/.test(SW) && /\}, 20000\);\nfunction lootNote/.test(SW));
// API on a scratch folder
const L = require(path.join(R, 'Dashboard', 'lootpage_api.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loot-')), day = new Date().toISOString().slice(0, 10), now = Date.now();
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
fs.writeFileSync(path.join(tmp, `loot_${day}.log`), [
  `${iso(5)}\tAldo\tAldo\t1\tSealed Vorpal Earring\tloot\tGiran\r\n`,
  `${iso(4)}\tBruno\tBruno\t3\tThread\tloot\tAnt Nest\r\n`,
  `${iso(3)}\tBruno\tBruno\t1\tSalamander Skin Mail Texture\tspoil\tAnt Nest\r\n`,
  `${iso(200)}\tCora\tCora\t1\tCoal\tloot\tToI 5\r\n`, 'broken line\r\n'].join(''));
const ctx = { DIR: path.join(R, 'Dashboard'), LOGS: tmp };
const named = fs.existsSync(path.join(R, 'Dashboard', 'data', 'items.json'));
let q = L.query(ctx, { hours: 1 });
t('last hour: 3 pick-ups, newest first, the broken line skipped', q.rows.length === 3 && q.rows[0].name === 'Salamander Skin Mail Texture' && q.summary.total === 5, q.rows);
t('who = a party name filters', L.query(ctx, { hours: 24, who: 'bruno' }).rows.length === 2);
t('how = spoil', L.query(ctx, { hours: 24, how: 'spoil' }).rows.length === 1);
t('search', L.query(ctx, { hours: 24, q: 'vorpal' }).rows.length === 1);
t('older than the window is left out; 24 h keeps it', L.query(ctx, { hours: 1 }).rows.every(r => r.who !== 'Cora') && L.query(ctx, { hours: 24 }).rows.some(r => r.who === 'Cora'));
if (named) {
  const v = L.query(ctx, { hours: 24, grade: 'S' }).rows;
  t('grade S includes S84 (the Vorpal Earring) and it is a jewel', v.length === 1 && v[0].grade === 'S84' && v[0].type === 'jewel' && v[0].icon, v);
  t('type filter: jewels only', L.query(ctx, { hours: 24, type: 'jewel' }).rows.length === 1);
} else console.log('  (no Dashboard/data/items.json on this install: grade / type checks skipped)');
t('people + parties for the filter', q.people.includes('Bruno') && q.parties.includes('Aldo'));
fs.rmSync(tmp, { recursive: true, force: true });
// wiring
const SV = fs.readFileSync(path.join(R, 'Dashboard', 'server.js'), 'utf8'), IX = fs.readFileSync(path.join(R, 'Dashboard', 'index.html'), 'utf8');
t('server routes /api/loot + /lootpage.js', /require\('\.\/lootpage_api'\)\.handle\(req, res, url,/.test(SV));
t('index: the Loot tab, the route, the script', /data-tab="loot"/.test(IX) && /window\.LootPage && LootPage\.route\(kind, arg\)/.test(IX) && /<script src="\/lootpage\.js"><\/script>/.test(IX));
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
