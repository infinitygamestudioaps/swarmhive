// BOOST guard (owner 2026-11-05: "build exactly this script [Adrenaline 'Boost'] for Hive so i can use while im in game"; "the most important
// part is the boost for speed while enchanting ... Delay (ms) and 'Fast'")
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const B = new Function(SRC.slice(SRC.indexOf('// BOOST-PURE-BEGIN'), SRC.indexOf('// BOOST-PURE-END')) + '\nreturn { boostParseRules, boostNext };')();
const R = B.boostParseRules('15856:100:959:0:3;15856:100:6577:3:16;bad;1:2:0:0:3;1:2:3:5:4');
t('rules parse (item:obj:scroll:from:to), bad parts skipped', R.length === 2 && R[1].scroll === 6577 && R[1].from === 3 && R[1].to === 16, R);
const bag = (lvl) => [{ objId: 100, id: 15856, lvl }];
t('+0 -> the 0-3 rule (normal scroll)', B.boostNext(R, bag(0), { 959: 5, 6577: 5 }, true).rule.scroll === 959);
t('+5 -> the 3-16 rule (blessed scroll)', B.boostNext(R, bag(5), { 959: 5, 6577: 5 }, true).rule.scroll === 6577);
t('a blessed fail back to +0 -> the normal rule takes over again', B.boostNext(R, bag(0), { 959: 1, 6577: 9 }, true).rule.scroll === 959);
t('+16 = at the top: done', !!B.boostNext(R, bag(16), { 959: 5, 6577: 5 }, true).done);
t('no scroll for the range = done with the reason', /no scroll 6577/.test(B.boostNext(R, bag(4), { 959: 5 }, true).done));
t('Enchant all: the next item with the same id when the first one broke', B.boostNext(R, [{ objId: 200, id: 15856, lvl: 2 }], { 959: 5, 6577: 5 }, true).objId === 200);
t('without Enchant all only the chosen item', !!B.boostNext(R, [{ objId: 200, id: 15856, lvl: 2 }], { 959: 5, 6577: 5 }, false).done);
t('FAST: one RequestEnchantItem per try while the scroll is active, answer watched every 15 ms', /if \(BOOST\.active === scroll\) \{ try \{ Send\.RequestEnchantItem\(objId, 0\); \}/.test(SRC) && /setTimeout\(tick, 15\)/.test(SRC));
t('FAST: a new scroll / no answer = the full way once', /Send\.UseItem\(num\(sc\.objId\)\); await sleep\(150\);/.test(SRC));
t('the owner\'s delay is the only pause between tries', /const d = dMin \+ Math\.floor\(Math\.random\(\) \* \(dMax - dMin \+ 1\)\); if \(d\) await sleep\(d\);/.test(SRC));
t('only by order: the named character, Stop ends it', /case '!boost': \{/.test(SRC) && /if \(who\.toLowerCase\(\) !== String\(Me\.Name\)\.toLowerCase\(\)\) break;/.test(SRC) && /BOOST\.stop = true;/.test(SRC));
const CMD = fs.readFileSync(path.join(ROOT, 'Dashboard/commands.js'), 'utf8');
t('catalog: boostitem + booststop', /id: 'boostitem'/.test(CMD) && /id: 'booststop'/.test(CMD));
const PG = fs.readFileSync(path.join(ROOT, 'Dashboard/boostpage.js'), 'utf8');
t('page: Standard / Fast, Delay, Enchant all, rules, Add / Delete, Start / Stop', ['bsMode', 'bsDMin', 'bsDMax', 'bsAll', "data-bs=\"add\"", "data-bs=\"del\"", 'bsGo'].every(k => PG.includes(k)));
t('page has its own tab button (owner: "er der ikke en fane til boost?")', /data-tab="boost"/.test(fs.readFileSync(path.join(ROOT, 'Dashboard/index.html'), 'utf8')));
t('page served + routed', /\/boostpage\.js/.test(fs.readFileSync(path.join(ROOT, 'Dashboard/server.js'), 'utf8')) && /BoostPage\.route\(kind, arg\)/.test(fs.readFileSync(path.join(ROOT, 'Dashboard/index.html'), 'utf8')));
// BOOSTTABS: Enchant skills / Augment / Attribute
const K = new Function(SRC.slice(SRC.indexOf('// BOOSTTABS-PURE-BEGIN'), SRC.indexOf('// BOOSTTABS-PURE-END')) + '\nreturn { boostSkillRules, boostSkillPlus, boostSkillNext };')();
const SR = K.boostSkillRules('1074:1:0:15:0;1074:1:15:30:1;bad');
t('skill rules parse (id:route:from:to:safe)', SR.length === 2 && SR[1].safe === true && SR[0].safe === false, SR);
t('skill level 1074 lv 14 (base) -> route 1 +1 normal (level 101)', (() => { const n = K.boostSkillNext(SR, { 1074: 14 }); return n.level === 101 && !n.safe; })());
t('+16 (level 116) -> the 15-30 rule = Bless (safe), next level 117', (() => { const n = K.boostSkillNext(SR, { 1074: 116 }); return n.level === 117 && n.safe; })());
t('+30 = done; on another route = not this rule', !!K.boostSkillNext(SR, { 1074: 130 }).done && !!K.boostSkillNext(SR, { 1074: 205 }).done);
t('skill / aug / attr orders + their runners', /if \(sub === 'skill'\)/.test(SRC) && /if \(sub === 'aug'\)/.test(SRC) && /if \(sub === 'attr'\)/.test(SRC) && /async function boostSkillRun\(/.test(SRC) && /async function boostAugRun\(/.test(SRC) && /async function boostAttrRun\(/.test(SRC));
t('augment honours Stop (stopFn in the AUGMENT loop)', /if \(aug\.stopFn && aug\.stopFn\(\)\) return/.test(SRC));
t('catalog: boostskill / boostaug / boostattr', ['boostskill', 'boostaug', 'boostattr'].every(k => CMD.includes(`id: '${k}'`)));
t('page: the skill / augment / attribute tabs are built', ['function skillsHtml', 'function augHtml', 'function attrHtml', "data-bs=\"addsk\"", 'data-bsaugw'].every(k => PG.includes(k)));
// BOOSTTALIS-2026-11-06: Buy talismans (Giran Accessory Merchant Sandra, multisell 300900001)
const TL = new Function(SRC.slice(SRC.indexOf('// BOOSTTALIS-PURE-BEGIN'), SRC.indexOf('// BOOSTTALIS-PURE-END')) + '\nreturn { boostTalisParse, boostTalisCost, BOOST_TALIS };')();
const tl = TL.boostTalisParse('10543:3;10533:2;10543:1;9589:1;10536:0;bad;10535:999');
t('talismans: only the merchant list (no bracelet 9589), 0 skipped, duplicates added, max 200', tl.length === 3 && tl.find(x => x.id === 10543).count === 4 && tl.find(x => x.id === 10535).count === 200 && !tl.some(x => x.id === 9589 || x.id === 10536), tl);
t('talismans: cost 12,000 adena each', TL.boostTalisCost([{ id: 10543, count: 3 }]) === 36000);
{ // the 11 ids = the datapack multisell 300900001 (minus the Iron Bracelet)
  const ms = fs.readFileSync(path.join(ROOT, 'Scripts/data/dp/multisell/300900001.xml'), 'utf8'), prod = [...ms.matchAll(/<production count="1" id="(\d+)"/g)].map(m => +m[1]).filter(id => id !== 9589);
  t('talismans: the list matches multisell 300900001 at 12,000 adena', prod.length === 11 && prod.every(id => TL.BOOST_TALIS[id]) && /<ingredient count="12000" id="57"/.test(ms), prod);
}
t('talismans: Giran only, adena checked first, bought at Sandra via ijBuyAt (walks in front of the NPC)', /if \(!ijInGiran\(\)\)/.test(SRC) && /itemCount\(57\) < boostTalisCost\(list\)/.test(SRC) && /npc: 'Sandra', x: 80511, y: 149183, path: \['Buy a bracelet or talisman\.'\], kind: 'exchange'/.test(SRC) && /await ijBuyAt\(offer, t\.id, t\.count/.test(SRC));
t('talismans: order + catalog + page tab', /if \(sub === 'talis'\)/.test(SRC) && CMD.includes("id: 'boosttalis'") && PG.includes('function talisHtml') && PG.includes('data-bstalis') && !/k === 'talis' \? 'soon'/.test(PG));
console.log(`boost: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
