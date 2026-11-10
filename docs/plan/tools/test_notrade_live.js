// NOTRADELIVE (2026-10-15) + NOTRADE2 (2026-11-10, testers #17 Vykaax + LuckyStrikz: "trying to pass the Tutorial Guide over and over"):
// items the server will not trade are learned in Logs/notrade_live.json. The 2026-10-15 rule (3 trades where the item sat IN my window but did
// not move = untradeable) was wrong: the server only puts tradeable items into the window (TradeOwnAdd), and that rule had learned Suede, Animal
// Bone, Silver Nugget, Iron Ore, Steel, Helmet ... as untradeable. NOTRADE2 rule: an entry blocks only when set by hand (sure) or when the server
// refused to ADD the item to the window (after the re-add, the receiver did not lock early) in 2 trades (na >= 2); 'n' alone never blocks.
// The newbie items L2Toggle refuses (Tutorial Guide 5588) are always blocked. Checks hovNotrade(), the learning step in hovTradeBatch and the live file.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i); if (i < 0 || j < i) throw new Error(b + ' not found'); return src.slice(i, j); };
const PURE = blk('// HANDOVER-PURE-BEGIN', '// HANDOVER-PURE-END');
const H = new Function(PURE + '\nreturn { NEWBIE_NOTRADE, hovNtCounts };')();
// 1) reading
const hn = src.slice(src.indexOf('function hovNotrade()'), src.indexOf('function hovNotrade()') + 2200);
ok(/NEWBIE_NOTRADE\.forEach\(id => hovNT\.add\(id\)\)/.test(hn), 'hovNotrade always blocks the newbie items (Tutorial Guide)');
ok(/if \(hovNtCounts\(j\[k\]\)\) hovNT\.add\(Number\(k\)\)/.test(hn) && !/num\(e\.n\) >= 3/.test(hn), 'hovNotrade reads live entries only through hovNtCounts (the old n >= 3 rule is gone)');
ok(H.NEWBIE_NOTRADE.includes(5588), 'Tutorial Guide 5588 is a newbie item that is never traded');
// 2) the rule
ok(!H.hovNtCounts({ n: 3 }) && !H.hovNtCounts({ n: 50 }), "'in my window but did not move' (n) never blocks, however often");
ok(!H.hovNtCounts({ na: 1 }) && H.hovNtCounts({ na: 2 }) && H.hovNtCounts({ sure: true }) && !H.hovNtCounts(null), 'refused to ADD twice (na >= 2) or set by hand (sure) blocks; once does not');
// 3) learning in hovTradeBatch
const tb = src.slice(src.indexOf('async function hovTradeBatch('), src.indexOf('async function hovGive('));
ok(/na: num\(o\.na\) \+ 1/.test(tb) && /if \(hovNtCounts\(j\[String\(r\.id\)\]\)\) \{ try \{ hovNotrade\(\)\.add/.test(tb), 'a refusal to add counts na up; hovNtCounts decides when it blocks');
ok(!/if \(n >= 3 && !o\.sure\)/.test(tb), "the old 'third in-window refusal blocks' learning is gone");
ok(/g\.naRefused/.test(tb) && /return \{ moved: mv, why: [^\n]*na: \[\.\.\.naObj\] \}/.test(tb), 'giveItems reports the refused-to-add rows; the batch hands them back (never retried one by one)');
const gi = src.slice(src.indexOf('async function giveItems(d)'), src.indexOf('async function receiveItems(d)'));
ok(/if \(readded && !earlyLock\) naRefused = /.test(gi) && /earlyLock = true;/.test(gi), 'refused-to-add = still missing after the re-add and the receiver did not confirm early (#122 is never a refusal)');
// 4) the live file: no ordinary material blocked any more
const LIVE = path.join(ROOT, 'Logs', 'notrade_live.json');
if (fs.existsSync(LIVE)) {
  const lj = JSON.parse(fs.readFileSync(LIVE, 'utf8')), blocked = new Set(Object.keys(lj).filter(k => H.hovNtCounts(lj[k])).map(Number));
  const bad = [1864, 1866, 1868, 1869, 1872, 1873, 1876, 1880, 1895, 47, 471].filter(id => blocked.has(id));
  ok(!bad.length, `Logs/notrade_live.json does not block normal materials / gear (${bad.join(', ') || 'none'})`);
}
console.log(`notrade live: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
