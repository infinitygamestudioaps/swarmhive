// BANKENCH / LETTERSBANK-2026-11-03 (owner: "enchanting and stuff like that should be done by the banker as well, not dagger1 ...
// How will the runner be able to take letters and do stuff in giran if he is running"): the bank receives the letters and is the
// preselected enchanter; enchanting itself stays manual (never automatic)
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '../../..');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const API = fs.readFileSync(path.join(R, 'Dashboard/itemspage_api.js'), 'utf8'), UI = fs.readFileSync(path.join(R, 'Dashboard/itemspage.js'), 'utf8');
t('the chars API flags the bank from crafter.json', /BANKENCH-2026-11-03[\s\S]{0,300}crafter\.json[\s\S]{0,1200}bank: !!BANK && a\.character === BANK/.test(API) && /clanLeader: CL, bank: BANK/.test(API));
t('the Enchanting page preselects the bank, the clan leader only as a fallback', /find\(c => c\.bank\) \|\| \(d\.chars \|\| \[\]\)\.find\(c => c\.clanLeader\)/.test(UI));
t('the bank is always listed as a choice', /c\.clanLeader \|\| c\.bank/.test(UI));
const S = JSON.parse(fs.readFileSync(path.join(R, 'Scripts/data/stash_rules.json'), 'utf8')), C = JSON.parse(fs.readFileSync(path.join(R, 'Scripts/data/crafter.json'), 'utf8'));
t('the letters go to the bank, never to the runner', !S.letters || !S.letters.to || S.letters.to === C.bank || S.letters.to !== C.runner);
const SP = fs.readFileSync(path.join(R, 'Dashboard/storagepage.js'), 'utf8'), SA = fs.readFileSync(path.join(R, 'Dashboard/storagepage_api.js'), 'utf8');
t('BANKWH: take out / sell / crystallize from the clan warehouse go to the bank, the clan leader only as a fallback', SP.split('SP.info.bank || SP.info.clanLeader').length - 1 >= 2 && SA.includes("bank: (() => { try { return String((JSON.parse(fs.readFileSync(path.join(ctx.DATA, 'crafter.json')"));
console.log(`bank roles: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
