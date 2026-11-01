// test_kept_for_me.js - requirement gear.md R8 (owner 2026-10-31, Epic raid prep "Get it" for Nuker18): Demon's Tunic +8 / Stockings +8 / Boots
// arrived "kept in the bag until the set is complete" and 4 minutes later the party's loot hand-over (mode all -> clan leader) gave them straight
// back to Dagger1. A piece an item job gave a character for itself is never loot (Logs/kept_<name>.json by object id, 7 days).
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (start, end) => { const i = SRC.indexOf(start); return i < 0 ? '' : SRC.slice(i, SRC.indexOf(end, i) + end.length); };

// 1. the kept list exists and is per character, by object id, 7 days
const rd = cut('function keptForMeRead() {', '\n');
check(/kept_\$\{Me\.Name\}\.json/.test(rd), 'kept list = Logs/kept_<name>.json');
check(/7 \* 86400000/.test(rd) && /num\(x\.objId\)/.test(rd), 'entries are by object id and expire after 7 days');
check(/function keptForMeAdd\(objId, id, name, why\)/.test(SRC) && /function keptForMeSet\(\)/.test(SRC), 'keptForMeAdd / keptForMeSet exist');

// 2. an item job writes every piece it gives the character onto the list (worn or held in the bag)
const ij = SRC.slice(SRC.indexOf("keep.add(objId); l.objId = objId; l.result = 'done'"), SRC.indexOf("keep.add(objId); l.objId = objId; l.result = 'done'") + 400);
check(/keptForMeAdd\(objId,/.test(ij), 'item job: the delivered piece is written to the kept list');

// 3. the loot hand-over never takes a kept piece
const lr = cut('function lootRowsMine(rule, opts) {', '\n}\n');
check(/const KM = keptForMeSet\(\)/.test(lr), 'lootRowsMine reads the kept list');
check(/!KM\.has\(num\(r\.objId\)\)/.test(lr), 'lootRowsMine filters kept pieces out of the hand-over candidates');

// 4. behaviour: the filter really drops a kept piece (run the filter expression on sample rows)
{ const KM = new Set([111, 222]); const NT = new Set(); const num = Number;
  const rows = [{ objId: 111, id: 441, name: "Demon's Tunic" }, { objId: 222, id: 472, name: "Demon's Stockings" }, { objId: 333, id: 1458, name: 'Crystal: D-Grade' }];
  const cand = rows.filter(r => !NT.has(num(r.id)) && num(r.id) !== 57 && !KM.has(num(r.objId)));
  check(cand.length === 1 && cand[0].id === 1458, 'Nuker18 replay: the two Demon pieces stay, only the crystal is handed over'); }

console.log(`kept for me: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
