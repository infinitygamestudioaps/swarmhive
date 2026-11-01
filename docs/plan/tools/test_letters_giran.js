// OFFLINE TEST LETTERSGIRAN-2026-10-30 (owner: "Why did shaded not deliver hes letters to the collector" -> "Yes hand letters during trip to giran"):
// the 12 h hunting session holds the automatic letters hand-over (no town trip for it); in a supply run the party is in Giran with the collector:
// the letters ride along with the loot hand-over when the letters receiver is the loot receiver.
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let oks = 0, fails = 0; const check = (ok, w) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + w); };
const lg = SRC.slice(SRC.indexOf('async function leadLootGive('), SRC.indexOf('async function leadLootGive(') + 3000);
check(/stashLetterReceiver\(lc, clanLeaderName\(\)\) === to\) lettersTo = to;/.test(lg) && /teamStep\(runId, 'lootrows', 20000, \{ rule, lettersTo \}\)/.test(lg), 'leader: the loot step tells the members "letters too" when the letters receiver = the loot receiver (Dagger1)');
check(/lootRowsMine\(data && data\.rule, \{ lettersTo: data && data\.lettersTo \}\)/.test(SRC), 'member: the loot-rows answer gets the letters flag');
const lr = SRC.slice(SRC.indexOf('function lootRowsMine(rule, opts) {'), SRC.indexOf('function lootRowsMine(rule, opts) {') + 6000);
check(/lt && lt !== Me\.Name/.test(lr) && /cfg\.on && !cfg\.except\.includes\(Me\.Name\)/.test(lr) && /cfg\.ids\.includes\(id\)/.test(lr), "member: adds its event letters (the setting's ids, not when excepted, never the receiver itself)");
const gate = SRC.slice(SRC.indexOf('function hovLootGate('), SRC.indexOf('function hovLootGate(') + 1500);
check(/letterIds\.has\(num\(g\.id\)\)/.test(gate), 'trade time: the loot rule never keeps the letters back');
check(/htHolds\('letters'\)/.test(SRC), 'the hunting session still holds the automatic letters TRIP (only the supply run in Giran carries them)');
console.log(`\nletters in Giran: ${oks} ok, ${fails} failed`); process.exit(fails ? 1 : 0);
