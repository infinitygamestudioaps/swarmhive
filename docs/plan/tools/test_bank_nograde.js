// BANKNOGRADE-2026-11-03 (owner: "Crafter1 should sell 'No grade' equipment automatically and store items in clan warehouse"):
// the bank's sell pick after a delivery always sells no-grade equipment; every other party keeps CONFIG.sell.junk (off)
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
t('sellCandidatesEx takes an opts.junk override, default = CONFIG.sell.junk',
  SRC.includes('function sellCandidatesEx(grades, opts) {') && SRC.includes("const junkOn = opts && opts.junk !== undefined ? !!opts.junk : !!CONFIG.sell.junk;") && SRC.includes('junk: junkOn, junkGrades: grades || CONFIG.sell.junkGrades,'));
t('the bank sells no-grade equipment after a delivery', SRC.includes("const pick = sellCandidatesEx(['none'], { junk: true }), only = crunBankSellOnly(pick.list, ids);"));
t('other sell paths keep the global rule (junk off by default)', /sell: \{ enabled: true, junk: false, junkGrades: \['none', 'd'\] \}/.test(SRC));
t('the protections stay: soul crystals, destroyer kits, quest items, starter keep, never-junk', SRC.includes("SOUL_IDS[c].forEach(i => keepIds.push(i))") && SRC.includes('protect: (id) => { try { return qeProtected(id); }') && SRC.includes('neverJunk: NEVER_JUNK'));
console.log(`bank no-grade: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
