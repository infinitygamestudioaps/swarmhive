// CWHCLEAN-2026-11-03 (owner: "Of course crafter1 needs to take crap out of warehouse automatically" - the clan warehouse was full since
// 16:51 because the bank stores everything it does not sell): the bank cleans the full clan warehouse by itself, 24/7.
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..', '..');
const W = require(path.join(R, 'Dashboard', 'whauto_api.js'));
const SRC = fs.readFileSync(path.join(R, 'Dashboard', 'whauto_api.js'), 'utf8'), SW = fs.readFileSync(path.join(R, 'Scripts_dev', 'swarm.js'), 'utf8');
const SP = fs.readFileSync(path.join(R, 'Dashboard', 'storagepage.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const now = Date.parse('2026-11-03T17:30:00Z');

// due: the live case - wh_full clan.full at 15:51Z, 374 kinds seen
const wh = { seenAt: '2026-11-03T15:39:35Z', items: [] };
for (let i = 1; i <= 374; i++) wh.items.push({ id: 10000 + i, name: 'Thing ' + i, count: 1, enchant: 0 });
const full = { full: true, at: '2026-11-03T15:51:40Z', by: 'Crafter1', text: '#130 Your warehouse is full.' };
const d1 = W.cleanupDue(full, wh, {}, 85, now);
t('the live full warehouse (374 kinds, #130 full) is due a clean-up to 85 % (317 kinds)', d1.due && d1.limit === 374 && d1.target === 317);
t('no clean-up while the limit was never learned and the warehouse is not full', !W.cleanupDue(null, wh, {}, 85, now).due);
t('a learned limit: nearly full (>= 95 %) is due even without the full flag', W.cleanupDue(null, wh, { cwhLimit: 380 }, 85, now).due && !W.cleanupDue(null, { items: wh.items.slice(0, 300) }, { cwhLimit: 380 }, 85, now).due);
t('at most one clean-up order per 3 min', !W.cleanupDue(full, wh, { cleanAt: now - 60000 }, 85, now).due);

// pick: junk only, protected kinds never
const info = (id) => ({ 1: { type: 'Weapon', grade: 0, price: 500 }, 2: { type: 'Armor', grade: 1, price: 3000 }, 3: { type: 'Armor', grade: 1, price: 2000 },
  4: { type: 'Etc', grade: -1, price: 10 }, 5: { type: 'Etc', grade: -1, price: 10 }, 6: { type: 'Weapon', grade: 0, price: 100 }, 7: { type: 'Armor', grade: 2, price: 9000 },
  8: { type: 'Etc', grade: -1 }, 9: { type: 'Weapon', grade: 0, price: 50 }, 10: { type: 'Armor', grade: 0, price: 70 } })[id] || {};
const W2 = { items: [{ id: 1, name: 'Short Sword', count: 1 }, { id: 2, name: 'Mithril Gloves', count: 1 }, { id: 3, name: 'Reinforced Leather Boots', count: 2 },
  { id: 4, name: 'Thread', count: 900 }, { id: 5, name: 'Animal Bone', count: 50 }, { id: 6, name: 'Cursed Maingauche', count: 1, enchant: 3 },
  { id: 7, name: 'Composite Helmet', count: 1 }, { id: 8, name: 'Red Soul Crystal - Stage 8', count: 1 }, { id: 9, name: 'Apprentice\'s Wand', count: 1 },
  { id: 10, name: 'Leather Shoes', count: 1 }] };
const pick = W.cleanupPick(W2, { info, sellIds: new Set([5]), keepIds: new Set([10]), cryIds: new Set(), neededIds: new Set([3]), max: 40 }).map(x => x.id);
t('sells the sell list first, then no-grade gear, then D-grade gear no plan needs (lowest value first)', JSON.stringify(pick) === JSON.stringify([5, 1, 2]));
t('never: enchanted, a needed D piece, C-grade, a soul crystal, other Etc items (Thread), keep-marked, newbie / apprentice pieces', ![6, 3, 7, 8, 4, 10, 9].some(i => pick.includes(i)));
t('crystallize-marked kinds are left to the crystallize order', !W.cleanupPick(W2, { info, sellIds: new Set([5]), keepIds: new Set(), cryIds: new Set([1]), neededIds: new Set(), max: 40 }).some(x => x.id === 1));
t('the order is capped (max kinds per order)', W.cleanupPick(W2, { info, sellIds: new Set([5]), keepIds: new Set(), cryIds: new Set(), neededIds: new Set(), max: 1 }).length === 1);

// norm / settings: default ON, the percent is bounded
t('clean-up is ON by default, 85 %; the owner can switch it off / change the %', W.norm({}).cleanup === true && W.norm({}).cleanPct === 85 && W.norm({ cleanup: false }).cleanup === false && W.applyChange({}, { cleanPct: 99 }).error && W.applyChange({}, { cleanPct: 80 }).data.cleanPct === 80);

// sources: the tick cleans first (whatever the marks switch), the bank (worker) does it, the ledger books it, the page shows it
t('the tick runs the clean-up before the default-marks decision, independent of the on switch', SRC.indexOf('if (D.cleanup && wh && who && who.ok)') > 0 && SRC.indexOf('if (D.cleanup && wh && who && who.ok)') < SRC.indexOf('const dec = decide(D, wh, st, who, Date.now());'));
t('the clean-up order goes to the clan warehouse worker (the bank) as a whsell order by whauto-cleanup', /by: 'whauto-cleanup' \}\);\s*\n\s*const r = await ctx\.commandRun\(\{ cmd: '!whsell order', targets: \['chars:' \+ CL\] \}\)/.test(SRC));
t('D-grade pieces a gear plan or the academy kits need are protected (gear_rec D + academy.json buy lists)', SRC.includes("addRec(((j || {}).grades || {}).D)") && SRC.includes("A.buy[k]"));
t('the bank books it in the ledger as "clan warehouse clean-up"', SW.includes("WHS_BY.v === 'whauto-cleanup' ? `clan warehouse clean-up (round ${rounds})`") && SW.includes("WHS_BY.v = String(o.by || '');"));
t('the Storage page shows the automatic clean-up and its state', SP.includes('data-cwhclean') && SP.includes('Automatic clean-up'));
console.log(`cwh clean: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
