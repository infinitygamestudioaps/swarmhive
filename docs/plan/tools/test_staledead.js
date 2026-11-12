// STALEDEAD-2026-11-12 guard (resurrect.md R9): Destroyer3's team on the FoG Lower level - Destroyer8's party rows kept Destroyer6 / Destroyer5 / Chanter2 "dead"
// (their revive happened out of her sight), she read a Scroll of Resurrection on living teammates every 10 s for an hour, the team walk stalled.
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const i = SRC.indexOf('// STALEDEAD-PURE-BEGIN'), j = SRC.indexOf('// STALEDEAD-PURE-END');
const resIsDead = new Function(SRC.slice(i, j) + '\nreturn resIsDead;')();
const T = 1e9;
ok(resIsDead(true, { IsDead: false, hp: 100, at: T }, T - 60000) === false, "replay Destroyer6 08:26: row dead for a minute, his own reports since then say alive HP 100 -> alive (no scroll, no stalled team walk)");
ok(resIsDead(true, { IsDead: false, hp: 40, at: T - 1800 }, T) === true, "RESFIGHT2 Chanter2 replay: row just turned dead, his report is OLDER (sent before he died) -> dead");
ok(resIsDead(true, { IsDead: false, hp: 40, at: T + 3000 }, T) === true, "a report only 3 s after the row turned dead does not overrule it (a corpse reports dead within ~2 s)");
ok(resIsDead(false, { IsDead: true, hp: 0, at: T }, 0) === true, "his own report says dead -> dead (a body out of sight, LEASH)");
ok(resIsDead(true, null, T) === true && resIsDead(false, null, 0) === false, "no fresh report: the party row decides");
ok(SRC.includes('const isDead = resIsDead(r ? !!r.IsDead : false, fresh ? lp : null, resRowDeadSince(n, r ? !!r.IsDead : false))'), 'resGather (who is dead) uses the rule with the time the row turned dead');
const sd = SRC.slice(SRC.indexOf('function resStillDead(name, since)'), SRC.indexOf('// STALEDEAD-PURE-BEGIN'));
ok(sd.includes('return resIsDead(row, fresh ? lp : null, RES.rowDead && RES.rowDead[name] ? RES.rowDead[name] : 0)'), 'resStillDead (did the res work) uses the rule');
console.log(`\ntest_staledead: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
