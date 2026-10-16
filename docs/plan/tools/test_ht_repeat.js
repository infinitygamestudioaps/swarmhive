// HTREPEAT-2026-10-15: hunt timer arrivalOnly (no 45-min fallback) + repeat
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
const blk = src.slice(src.indexOf('// HUNTTIMER-PURE-BEGIN'), src.indexOf('/** the end of the timer.'));
const H = new Function(blk + '; return { htEntry, htClock };')();
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const at = Date.parse('2026-10-15T20:00:00Z');
const J = (x) => ({ parties: { P: Object.assign({ id: 'a1', hours: 9, endAction: 'resupply', from: 'arrival', at: new Date(at).toISOString(), spot: 'Catacomb of the Branded' }, x) } });
let e = H.htEntry(J({ arrivalOnly: true, repeat: true }), 'P');
ok(e.arrivalOnly === true && e.repeat === true, 'entry keeps arrivalOnly + repeat');
ok(H.htClock(e, null, at + 3 * 86400000).started === false, 'arrivalOnly: three days later still waiting for the arrival (no 45-min fallback)');
e = H.htEntry(J({}), 'P');
ok(H.htClock(e, null, at + 46 * 60000).started === true, 'without arrivalOnly the 45-min fallback still counts');
ok(src.includes("if (e.repeat && st.endedFor === e.id && st.result && st.result !== 'running' && atSpot())"), 'repeat: a new run on the next arrival after the end action');
ok(src.includes("(!e.arrivalOnly || !e.spot || String(manualSw.spotName || manualSw.label || '').toLowerCase().includes(String(e.spot).toLowerCase()))"), 'arrivalOnly: only the timer spot counts as arrival');
console.log(`ht repeat: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
