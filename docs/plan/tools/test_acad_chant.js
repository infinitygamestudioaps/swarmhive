// ACADCHANT-2026-11-02: every academy character in Giran without its store chant buys it (each for itself); the leader waits for mates buying
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const a = SRC.indexOf('// ACADCHANT-PURE-BEGIN'), b = SRC.indexOf('// ACADCHANT-PURE-END');
const cfg = SRC.slice(SRC.indexOf('const ACADCHANT = '), SRC.indexOf('\n', SRC.indexOf('const ACADCHANT = ')));
const P = new Function('num', cfg + '\n' + SRC.slice(a, b) + '\nreturn { acadChantDue, acadChantBuyingMates };')(v => Number(v) || 0);
const T = 1e12, base = { academy: true, on: true, inGiran: true, chantLeft: 0, lastTry: 0, nowMs: T };
check(P.acadChantDue(base), 'in Giran without the chant = buy (the 19:30 regroup case)');
check(!P.acadChantDue(Object.assign({}, base, { chantLeft: 3600 })), 'chant still on = no buy');
check(!P.acadChantDue(Object.assign({}, base, { inGiran: false })) && !P.acadChantDue(Object.assign({}, base, { academy: false })), 'outside Giran / not an academy character = no buy');
check(!P.acadChantDue(Object.assign({}, base, { fight: true })) && !P.acadChantDue(Object.assign({}, base, { raid: true })) && !P.acadChantDue(Object.assign({}, base, { trade: true })) && !P.acadChantDue(Object.assign({}, base, { dead: true })), 'never in a fight / raid / trade / dead');
check(!P.acadChantDue(Object.assign({}, base, { lastTry: T - 60000 })) && P.acadChantDue(Object.assign({}, base, { lastTry: T - 200000 })), 'a failed try waits 3 min, then again');
const iso = (ms) => new Date(ms).toISOString(), now = Date.now();
check(JSON.stringify(P.acadChantBuyingMates({ A: { buying: true, at: iso(now - 5000) }, B: { buying: false, at: iso(now) }, C: { buying: true, at: iso(now - 300000) } }, now)) === '["A"]', 'the leader waits only for mates buying right now (stale markers ignored)');
check(/setInterval\(\(\) => \{ try \{ if \(isAcademy\(\)\) acadChantTick\('Giran visit'\)/.test(SRC), 'every academy character checks itself every 15 s (leader and members)');
check(/await waitWholeTeam\(what\)\)\) return 'interrupted';[^\n]*\n\s*try \{ if \(typeof acadChantBeforeLeave === 'function'\) await acadChantBeforeLeave\(what\)/.test(SRC), 'the leader\'s teleport hold waits for the chant buyers before leaving');
console.log(`acad chant: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
