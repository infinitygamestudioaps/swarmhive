// test_lh_session.js - requirement hunting.md R3 (owner 2026-10-30, option 2): one 12 h session per party (not per room), and its end is always the
// Giran trip (supply run: shots, loot + letters to the collector) and back to the same spot - also with the party's supply switch off.
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (start, end) => { const i = SRC.indexOf(start); return i < 0 ? '' : SRC.slice(i, SRC.indexOf(end, i) + end.length); };
const em = cut('function htEntryMine(key) {', '\n}\n');
check(/LHSESSION-2026-10-30/.test(em), 'htEntryMine has the one-session rule');
check(/lh_session_\$\{CONFIG\.leader\}\.json/.test(em) && /LH\.sess = \{ id: 'session:' \+ now\(\)/.test(em), 'the session id is per party (Logs/lh_session_<leader>.json), not per spot');
check(/if \(currentTownKey\(\)\) \{ if \(LH\.sess\) \{ LH\.sess = null;/.test(em), 'a town visit ends the session (the next arrival starts a new one)');
check(/lhEntry\(lhHours\(pautoData\(\), CONFIG\.leader\), LH\.sess\.id, [^,]+, LH\.sess\.first, true\)/.test(em), "the session's end action is always 'resupply' (Giran + back)");
// lhEntry itself: supplyOn true -> resupply
const le = cut('function lhEntry(', '\n}\n'); const lhEntry = new Function(le + ' return lhEntry;')();
check(lhEntry(12, 'session:1', 'Cruma', 1, true).endAction === 'resupply', "lhEntry(..., true).endAction === 'resupply'");
const er = cut('async function htEndRun(action, e, key) {', '\n}\n');
check(/\(pautoOn\('supplyWatch'\) \|\| \(action === 'resupply' && e\.long\)\)/.test(er), 'the end-of-session trip runs the supply run also with the supply switch off');
check(/leadLevel\('hunting time is up: back to the spot'\)/.test(er), 'after the trip the party goes back to its spot');
console.log(`lh session: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
