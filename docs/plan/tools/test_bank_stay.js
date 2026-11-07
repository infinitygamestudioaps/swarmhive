// BANKSTAY-2026-11-03 (live 13:59Z: a fund hand-out to Nuker7 took the bank Crafter1 .oren, 95k away, and the owner's item job then tried
// the clan warehouse at Croop "Warehouse Chief" in Oren): the bank / crafter never leaves Giran by itself, only a real Warehouse Keeper is a
// keeper, the bank's clan warehouse steps always run at Giran's keeper
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const grab = (name) => { const i = SRC.indexOf('function ' + name + '('); return SRC.slice(i, SRC.indexOf('\n', i)); };
const block = new Function(grab('bankStayBlock') + '\nreturn bankStayBlock;')();
const title = new Function(grab('whKeeperTitleOk') + '\nreturn whKeeperTitleOk;')();
t('replay 13:59Z: the bank does not walk / teleport 95k to a fund receiver', block('Crafter1', 'Crafter1', 'Crafter1', 94837, false) === true);
t("Giran's own streets (warehouse 3459 from the start) stay allowed", block('Crafter1', 'Crafter1', 'Crafter1', 3459, false) === false);
t('an order of yours may still move the bank', block('Crafter1', 'Crafter1', 'Crafter1', 94837, true) === false);
t('other characters are not limited', block('Nuker7', 'Crafter1', 'Crafter1', 94837, false) === false);
t('only a real Warehouse Keeper is a keeper - never Croop "Warehouse Chief", never a clan hall keeper',
  title('Warehouse Keeper') && !title('Warehouse Chief') && !title('Clan Hall Warehouse Keeper'));
t('walkTo refuses far walks for the bank (automatic jobs: !whtake / !itemjob / fund do not count as an owner order)',
  SRC.includes("if (bankStayBlock(String(Me.Name), S.bank, S.crafter, distTo(x, y), control.level === PRIO.ORDER && /^!/.test(String(control.owner || '')) && !/^!(whtake|itemjob|fund)/.test(String(control.owner || ''))))"));
t('the bank never uses a local keeper outside Giran (whTake goes .giran first)', SRC.includes("if (town && town !== 'Giran' && !opts.giran && !bankMe()) npc = whKeeper();"));
t('whKeeper uses whKeeperTitleOk', SRC.includes('if (whKeeperTitleOk(t)) { const d = Distance(n.ref);'));
console.log(`bank stay: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
