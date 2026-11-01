// test_itemjob_set.js - requirement gear.md R7 + R8 (owner 2026-10-31, Epic raid prep "Get it" for Nuker18):
// 1) SETTOGETHER: an item job put each armor piece on as it arrived; the Stockings failed -> half a Demon set worn. Armor pieces of one job now
//    wait in the bag and go on together only when every armor piece of the job arrived.
// 2) WHASKQUEUE: the clan leader refused the Stockings request ("!handover comes first - send it again afterwards") 0.3 s after the Tunic's
//    hand-over started, and nobody asked again. A request that finds him busy now waits for its turn (max 3 min).
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (start, end) => { const i = SRC.indexOf(start); return i < 0 ? '' : SRC.slice(i, SRC.indexOf(end, i) + end.length); };

const up = cut('async function upgradeRun(J, id, seq) {', '\n}\n');
check(/const IJ_SET_SLOTS = new Set\(\['chest', 'legs', 'head', 'gloves', 'feet'\]\)/.test(SRC), 'armor slots of a set are chest / legs / head / gloves / feet');
const iSet = up.indexOf('IJ_SET_SLOTS.has(String(info.s))'), iEq = up.indexOf('const on = l.wear === false ? false : await equipPiece(objId');
check(iSet > 0 && iEq > iSet, 'an arriving armor piece is checked BEFORE the put-on line');
check(/l\.setWait = true;[\s\S]{0,300}continue;/.test(up.slice(iSet, iEq)), 'an arriving armor piece waits in the bag (setWait) and is not put on');
check(/keptForMeAdd\(objId/.test(up.slice(iSet, iEq)), 'a waiting armor piece is on the kept list (never loot)');
const after = up.slice(up.indexOf('SETTOGETHER-2026-10-31: the armor pieces wait for each other'), up.indexOf('const nowWorn = ijWornNow(), replaced = [];'));
check(/if \(setL\.length === armorL\.length\)/.test(after) && /await equipPiece\(o, s, keep\)/.test(after), 'all armor pieces arrived -> all are put on together');
check(/nothing of the set is put on/.test(after) && !/equipPiece/.test(after.slice(after.indexOf('} else {'))), 'one armor piece missing -> none of them is put on');

// behaviour replay: Nuker18's job (Tunic arrives, Stockings fail, Boots arrive)
{ const lines = [{ n: 'Tunic', slot: 'chest', res: 'done', setWait: true }, { n: 'Stockings', slot: 'legs', res: 'failed' }, { n: 'Boots', slot: 'feet', res: 'done', setWait: true }];
  const SL = new Set(['chest', 'legs', 'head', 'gloves', 'feet']);
  const setL = lines.filter(l => l.setWait), armorL = lines.filter(l => l.setWait || (l.res !== 'done' && SL.has(l.slot)));
  check(setL.length === 2 && armorL.length === 3 && setL.length !== armorL.length, 'Nuker18 replay: Stockings failed -> Tunic + Boots stay in the bag');
  lines[1] = { n: 'Stockings', slot: 'legs', res: 'done', setWait: true };
  const s2 = lines.filter(l => l.setWait), a2 = lines.filter(l => l.setWait || (l.res !== 'done' && SL.has(l.slot)));
  check(s2.length === 3 && s2.length === a2.length, 'Nuker18 replay: all three arrived -> put on together'); }

// WHASKQUEUE
const wf = cut('async function whClanFor(name, items, src) {', '\n}\n');
check(/WHASKQUEUE-2026-10-31/.test(wf), 'whClanFor has the wait-for-my-turn rule');
check(/\/comes first\|already at the warehouse\/\.test/.test(wf) && /180000/.test(wf) && /await sleep\(2000\)/.test(wf), 'a busy clan leader retries every 2 s for up to 3 min instead of dropping the request');
check(/r\.bag0 = bag0w/.test(wf) && /const bag0 = r\.bag0;/.test(wf), 'the bag snapshot is taken right before the take that worked (hand-over rows stay right)');

console.log(`item job set: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
