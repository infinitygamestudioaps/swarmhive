// test_exp_keep.js - requirement measurements.md R1 (owner 2026-10-30 "Many of the /overview says no xp but they are farming?"): the last hour of
// exp (LIVEP.hour, the overview's measurement) survives a deploy / script reload: saved every minute to Logs/exp_hour_<name>.json and read back at
// the first tick (same level, entries < 1 h, the old window start).
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const i = SRC.indexOf('// EXPKEEP-2026-10-30'), j = SRC.indexOf("    if (LIVEP.exp === null || !e || !lvl) {", i);
check(i > 0 && j > i, 'EXPKEEP block found in the LIVEP watcher');
const blk = SRC.slice(i, j);
check(/exp_hour_\$\{Me\.Name\}\.json/.test(blk) && /File\.WriteAllText/.test(blk) && /> 60000/.test(blk), 'saved to Logs/exp_hour_<name>.json at most once a minute');
// run the restore for real
const T = 1793400000000, files = {};
files['R/Logs/exp_hour_Spoiler3.json'] = JSON.stringify({ lvl: 47, startAt: T - 50 * 60000, hour: [{ amt: 500, pct: 0.1, at: T - 30 * 60000 }, { amt: 600, pct: 0.1, at: T - 70 * 60000 }] });
const run = (lvl) => { const LIVEP = { exp: null, hour: [], startAt: 0 };
  new Function('LIVEP', 'lvl', 'now', 'num', 'File', 'SWARM_ROOT', 'Me', blk)(LIVEP, lvl, () => T, Number, { ReadAllText: (p) => { const k = p.replace(/\\/g, '/'); if (!(k in files)) throw new Error('no file'); return files[k]; }, WriteAllText: (p, s) => { files[p.replace(/\\/g, '/') + '#w'] = s; } }, 'R', { Name: 'Spoiler3' });
  return LIVEP; };
const L1 = run(47);
check(L1.hour.length === 1 && L1.hour[0].amt === 500, 'after a reload the hour comes back (entries older than 1 h dropped)');
check(L1.startAt === T - 50 * 60000, 'the measuring window keeps its old start (not 0 min again)');
const L2 = run(48);
check(L2.hour.length === 0, 'a different level = not restored (a level-up starts a new measurement)');
console.log(`exp keep: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
