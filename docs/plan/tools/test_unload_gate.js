// UNLOADGATE-2026-10-16 (player Vykaax: "party leader is trading whole inventory to a follower a few items at a time - I did not change any setting"):
// the supply run's unload to a teammate runs only when the party switched it on (party_auto.json unload, default OFF), and never hands over
// consumables, event letters or items marked for selling.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const blk = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('block ' + a); return src.slice(i, j); };
const U = new Function(blk('// UNLOADGATE-PURE-BEGIN', '// UNLOADGATE-PURE-END') + '; return { unloadKeepWhy };')();
const P = new Function(blk('// PARTYAUTO-PURE-BEGIN', '// PARTYAUTO-PURE-END') + '; return { pautoEffective, PAUTO_KINDS };')();

// 1) the switch: default OFF, party ON works, the supply step is gated
ok(P.PAUTO_KINDS.unload && P.PAUTO_KINDS.unload.def !== true, 'unload is a party switch, default OFF');
ok(P.pautoEffective({}, 'unload', 'CrimsonLeader', 'CrimsonLeader').on === false, 'no file / no setting = OFF');
ok(P.pautoEffective({ default: { supplyWatch: true, sell: false } }, 'unload', 'CrimsonLeader', 'CrimsonLeader').on === false, 'other switches on, unload still OFF');
ok(P.pautoEffective({ parties: { CrimsonLeader: { unload: true } } }, 'unload', 'CrimsonLeader', 'CrimsonLeader').on === true, 'party switched on = ON');
ok(/CONFIG\.lead\.unload\.above && pautoGate\('unload'\)\) \{ pstStep\('supply', 'unload loot'\)/.test(src), 'the supply run unload step asks pautoGate(unload)');
ok((src.match(/leadUnload\(/g) || []).length === 2, 'leadUnload has no other caller (only the gated supply step)');

// 2) what never goes (the items from the screenshot + the rest of the consumables)
const keep = [[1831, 'Antidote'], [734, 'Haste Potion'], [1539, 'Greater Healing Potion'], [1341, 'Steel Arrow'], [1835, 'Soulshot: No Grade'],
  [3947, 'Blessed Spiritshot: No Grade'], [736, 'Scroll of Escape'], [737, 'Scroll of Resurrection'], [955, 'Scroll: Enchant Weapon (D-Grade)'],
  [3031, 'Spirit Ore'], [57, 'Adena'], [3875, 'L2Day - A'], [3879, 'L2Day - G'], [9999, 'Bolt of something'], [8600, 'Herb of Life']];
keep.forEach(([id, n]) => ok(U.unloadKeepWhy(id, n, {}) !== '', 'kept: ' + n));
ok(U.unloadKeepWhy(3875, 'L2Day - A', {}) === 'event letter', 'letters stay for the letters rule');
// 3) what may go (only with the switch on)
[[8723, 'Mid-Grade Life Stone - Level 46'], [1878, 'Braided Hemp'], [5550, 'Homunkulus\'s Sword Blade']].forEach(([id, n]) => ok(U.unloadKeepWhy(id, n, {}) === '', 'may give: ' + n));
// 4) marked for selling stays (the sale comes first)
ok(U.unloadKeepWhy(1878, 'Braided Hemp', { 1878: 'any' }) === 'marked for selling', 'marked for selling: kept for the sale');
ok(/unloadItems\(\) \{\n\s+let sellIds = \{\}; try \{ sellIds = spMarks\(sellMarks\(\), Me\.Name\)\.ids/.test(src), 'unloadItems reads the sell marks');
ok(/\|\| unloadKeepWhy\(id, name, sellIds\)\) return;/.test(src), 'unloadItems uses unloadKeepWhy');

// 5) the dashboard switch + public seed
const api = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Dashboard', 'partyauto_api.js'), 'utf8');
ok(/key: 'unload', char: false/.test(api), 'dashboard Supplies section has the switch');
const rbPath = path.join(__dirname, 'release_build.js');   // not shipped in the public package: checked only here
const rb = fs.existsSync(rbPath) ? fs.readFileSync(rbPath, 'utf8') : null;
if (rb) ok(/case 'party_auto\.json': \{ const out = \{ _about: o\._about, v: 1, default: \{ supplyWatch: false, sell: false, dyes: false \}, parties: \{\}/.test(rb), 'public seed: no party, no unload (= OFF)');
console.log(`unload gate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
