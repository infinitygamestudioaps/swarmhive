// test_academy_loop.js - requirement academy.md R1-R3 (owner 2026-10-31: "I have created 20 New accounts for academy toons [mylogin82-20] ... after each
// academy toon graduate to deliver items to collector and all adena and items. Then log out after it graduated. Then set that character for
// deletion and create a new academy toon and do it over again ... It should run 24/7 ... make sure you have spiritshots and full buffs. Also take
// 'Magnus Chant' from giran for 10 adena" + "But it has to run automatically").
// 1) graduation hand-over (swarm.js ACADDELIVER), 2) delete + recreate 24/7 (academy_logic academyDecide / academyDeleteList, the create script):
// ONLY characters the pipeline made are ever deleted, 3) store buffs capped for academy characters + party switches at setup.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const MGR = fs.readFileSync(path.join(ROOT, 'Dashboard', 'academy_api.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (src, start, end) => { const i = src.indexOf(start); return i < 0 ? '' : src.slice(i, src.indexOf(end, i) + end.length); };
const AL = require(path.join(ROOT, 'Dashboard', 'academy_logic.js')), AA = require(path.join(ROOT, 'Dashboard', 'addaccount_api.js'));

// ---- 1) graduation hand-over
const pure = cut(SRC, '// ACADDELIVER-PURE-BEGIN', '// ACADDELIVER-PURE-END');
const D = new Function(pure + '\nreturn { acadDeliverRows, acadDeliverNext };')();
const bag = [{ objId: 1, id: 57, name: 'Adena', count: 900000 }, { objId: 2, id: 1101, name: 'Tunic of Devotion', count: 1 }, { objId: 3, id: 3948, name: 'Blessed Spiritshot (D-Grade)', count: 800, stackable: true },
  { objId: 4, id: 5588, name: 'Tutorial Guide', count: 1 }, { objId: 5, id: 7832, name: 'Coupon', count: 4, quest: true }];
const r = D.acadDeliverRows(bag, new Set([5588]));
check(r.rows.map(x => x.id).join() === '1101,3948' && r.rows[1].stack === true, 'everything tradeable goes (gear + shots, stacks as stacks), adena separately');
check(r.kept.length === 2 && !r.rows.some(x => x.id === 5588 || x.id === 7832 || x.id === 57), 'untradeable / quest items stay');
check(D.acadDeliverNext(0, 2, 100, 3).retry && D.acadDeliverNext(1, 0, 0, 3).done && !D.acadDeliverNext(3, 1, 0, 3).retry && /logging out anyway/.test(D.acadDeliverNext(3, 1, 0, 3).why), 'retry until everything is handed over, then log out anyway after 3 tries and say why');
const grad = cut(SRC, 'async function acadGraduate() {', '\n}\n');
check(grad.indexOf('acadDeliver()') > 0 && grad.indexOf('acadDeliver()') < grad.indexOf("acadState('graduated'"), 'the delivery runs BEFORE the graduated state (= before the manager logs it out)');
check(/if \(C\.end\.deliver\)/.test(grad), 'switch academy.json end.deliver');
const dl = cut(SRC, 'async function acadDeliver() {', '\n}\n');
check(/fundCollectorName\(\) \|\| clanLeaderName\(\)/.test(dl) && /acadToGiran\(\)/.test(dl), 'to the collector (else the clan leader) in Giran');
check(/hovCommand\(\['!handover', hid\]\)/.test(dl) && /receiver: col/.test(dl), 'through the hand-over machinery (trade.md: reach, walls, both idle)');
check(/b\.equipped && !b\.quest && !nt\.has\(b\.id\)/.test(dl), 'worn tradeable pieces are taken off first so they can go too');
check(!/sellAt|townSellMarked|DestroyItem|RequestDestroy|DropItem|RequestDrop|whDeposit/.test(dl), 'nothing sold, destroyed, dropped or stored instead');

// ---- 2) delete + recreate 24/7
const C = { end: { deleteGraduate: true, slotWaitMin: 360 } };
const done = { madeNames: ['Nyxara12', 'Velora55', 'Morith8'], history: [{ graduated: 'Nyxara12' }, { graduated: 'Velora55' }, { graduated: 'Tank1' }, { graduated: 'Owner1' }], deleted: ['Velora55'] };
check(JSON.stringify(AL.academyDeleteList(done, C, [])) === '["Nyxara12"]', 'delete list = pipeline-made graduates not yet deleted');
check(!AL.academyDeleteList(done, C, []).includes('Tank1') && !AL.academyDeleteList(done, C, []).includes('Owner1'), 'a character the pipeline did not make is NEVER on the list (even if it shows in history)');
check(AL.academyDeleteList(done, C, ['Nyxara12']).length === 0, 'never the character about to be made');
check(AL.academyDeleteList(done, { end: { deleteGraduate: false } }, []).length === 0, 'switch off = nothing deleted');
check(AL.academyDeleteList({ madeNames: ['Morith8'], history: [] }, C, []).length === 0, 'not graduated = never deleted');
const acc = { login: 'mylogin82', character: 'Nyxara12', academyMage: true };
check(AL.academyDecide(acc, { status: 'graduated', name: 'Nyxara12' }, null, { setupFor: 'Nyxara12', made: 9 }, C).act === 'next', '24/7: no character cap with deleteGraduate (made 9 -> next)');
check(AL.academyDecide(acc, { status: 'graduated', name: 'Nyxara12' }, null, { setupFor: 'Nyxara12', made: 7 }, { end: { deleteGraduate: false } }).act === 'slotsfull', 'deleteGraduate off: the old 7-character stop stays');
const cr = { result: 'fail', slotsFull: true, forChar: 'Nyxara12', at: '2026-10-31T10:00:00Z' };
check(AL.academyDecide(acc, null, cr, { setupFor: 'x' }, C, '2026-10-31T12:00:00Z').act === 'wait', 'all slots full (deletion timers) -> wait');
check(AL.academyDecide(acc, null, cr, { setupFor: 'x' }, C, '2026-10-31T16:30:00Z').act === 'retry', '... and try again after slotWaitMin');
check(AL.academyDecide(acc, null, cr, {}, { end: { deleteGraduate: false } }).act === 'slotsfull', 'deleteGraduate off: full slots stop the loop as before');
check(AL.academyCfg({}).end.deleteGraduate === true && AL.academyCfg({}).end.deliver === true && AL.academyCfg({}).buffs.storeMaxPrice === 10, 'defaults: deliver ON, deleteGraduate ON, store max 10 adena (owner)');

// the create script: deletes only what it is given, slot from the live character list
const s = AA.buildCreateScript('C:/x', 'mylogin82', { race: 2, sex: 0, classId: 38, stats: [1, 2, 3, 4, 5, 6], names: ['Zarith77'], resultFile: 'Logs/academy_create_mylogin82.json', del: ['Nyxara12', 'bad name!'] }, 'Zarith77');
check(/const DEL = \["Nyxara12"\];/.test(s), 'the create script carries only the given (valid) names');
// RECREATE-2026-11-03: + RequestRestart 0x57 (back to the character list when in game as the old graduate) - still nothing else raw
// RECREATE2-2026-11-03: the character-list packet handler also deletes (0x0D + the slot) and creates at once - still only 0x0D and 0x57 raw packets
// RECREATE4-2026-11-03: + CharacterSelect 0x12 by slot (the 2026-10-07 in-session switch packet: '12' + slot + '0000' + 3 x int32 0) - nothing else
check(/Send\.SendHex\('0D' \+ le32\(slot\)\)/.test(s) && /Send\.SendHex\('0D' \+ le32\(s\)\)/.test(s) && (s.match(/SendHex\(/g) || []).length === 4 && /Send\.SendHex\('57'\)/.test(s) && /Send\.SendHex\(selHex\(sNew\)\)/.test(s) && /const selHex = \(slot\) => '12' \+ le32\(slot\) \+ '0000' \+ le32\(0\) \+ le32\(0\) \+ le32\(0\);/.test(s) && (s.match(/SendHex\('(?!0D' \+ le32|57')/g) || []).length === 0, 'raw packets: only CharacterDelete 0x0D + slot, RequestRestart 0x57 and CharacterSelect 0x12 by slot, nothing else');
{ const f0 = s.indexOf('const fastList'), fD = s.indexOf("DEL.forEach", f0), fC = s.indexOf('Send.NewCharacter()', f0);
  check(f0 > 0 && fD > f0 && fD < fC && s.indexOf('if (!delDone)') < s.lastIndexOf('Send.NewCharacter()'), 'deletion before the creation (at the character list and in the loop)'); }
{ // slotOf on a fake character list: [Owner1][Nyxara12][Zarith5] -> slot 1; a name only inside another entry never matches
  const u16 = (t) => { const a = []; for (let i = 0; i < t.length; i++) { const k = t.charCodeAt(i); a.push(k & 255, (k >> 8) & 255); } a.push(0, 0); return a; };
  const entry = (n) => u16(n).concat([1, 2, 3, 4]).concat(u16('mylogin82')).concat(new Array(40).fill(7));
  const b = [0, 0, 9, 3, 0, 0, 0].concat(entry('Owner1'), entry('Nyxara12'), entry('Zarith5'));
  const helpers = cut(s, 'const u16 = ', 'const le32 = ').replace(/const le32 = $/, '');
  const slotOf = new Function('L', helpers + '\nreturn slotOf;')('mylogin82');
  check(slotOf(b, 'Nyxara12') === 1 && slotOf(b, 'Owner1') === 0 && slotOf(b, 'Nobody') === -1, 'slot read from the live list (account-name anchored); unknown name = no delete');
}
// RECREATE2-2026-11-03: the re-try passes a kept NAME as a 6th argument - the delete list is still ONLY academyDeleteList
check(/const del = AL\.academyDeleteList\(D, C, \[\]\);[\s\S]{0,600}makeCreate\(ctx, acc, C, taken, del(, keepName)?\)/.test(MGR) && (MGR.match(/= makeCreate\(/g) || []).length === 2 && (MGR.match(/= makeCreate\(ctx, acc, C, taken, del(, keepName)?\)/g) || []).length === 2 && (MGR.match(/const del = AL\.academyDeleteList\(/g) || []).length === 2, 'the manager passes ONLY academyDeleteList to the create script');
check(/D\.madeNames = \[\.\.\.new Set\(\(D\.madeNames \|\| \[\]\)\.concat\(\[String\(acc\.character\)\]\)\)\]/.test(MGR), 'a character is recorded as pipeline-made at its setup');
check(/D\.history = \(D\.history \|\| \[\]\)\.concat\(\[\{ graduated: old/.test(MGR) && MGR.indexOf('D.history = (D.history') < MGR.indexOf('const del = AL.academyDeleteList(D, C, []);'), 'the graduate is in the history before the delete list is made');

// ---- 3) fast leveling: store buffs + party switches
check(/function acStoreOpt\(o\) \{ if \(!isAcademy\(\)\) return o \|\| \{\}; return Object\.assign\(\{\}, o \|\| \{\}, \{ maxPrice: acadCfg\(\)\.buffs\.storeMaxPrice \}\); \}/.test(SRC), 'academy characters pay at most buffs.storeMaxPrice per store buff; others unchanged');
check((SRC.match(/storeBuyBuff\(STORE_(COV|MAGNUS)\.id, acStoreMode\('Party'\)/g) || []).length === 4 && !/storeBuyBuff\(STORE_(COV|MAGNUS)\.id, 'Party'/.test(SRC), 'every COV / Magnus purchase uses the academy cap (supply run + Giran services)');
check(/acadStoreBuffs\(`the "\$\{set\}" kit`\)/.test(cut(SRC, 'async function acadBuy(step) {', '\n}\n')), "Magnus' Chant at the Giran start (the start kit)");
check(/supplyWatch: true, (?:sell: true, )?storeMagnus: !!\(C\.buffs\.on && C\.buffs\.magnus\), storeCov: !!\(C\.buffs\.on && C\.buffs\.cov\)/.test(MGR), 'setup: supply watch (shots topped up) + Magnus / COV switches for the academy party');

console.log(`academy loop: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
