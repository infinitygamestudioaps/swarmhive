// SKILLHOLD guard (owner 2026-11-04: "I clicked 'Learn now' under clan skill but nothing happens?" - the supply-run storing put the 10 Angelic
// Essence for Clan M. Def. back into the clan warehouse 40 s before the village master): the clan skill's items are never stored before it is learned
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const blk = SRC.slice(SRC.indexOf('// STASH-PURE-BEGIN'), SRC.indexOf('// STASH-PURE-END'));
const F = new Function(blk + '\nreturn { stashClassify };')();
const it = { id: 9818, name: 'Angelic Essence', objId: 5, count: 10 };
const ctxAll = { mode: 'all', rules: {}, data: {}, settings: {} };
let r; try { r = F.stashClassify(it, Object.assign({}, ctxAll, { skillHold: [9818] })); } catch (e) { r = { err: e.message }; }
t('held for the clan skill = kept, even in mode "store everything"', r && r.act === 'keep' && r.cat === 'clanskill', r);
let r2; try { r2 = F.stashClassify(it, Object.assign({}, ctxAll, { skillHold: [] })); } catch (e) { r2 = { err: e.message }; }
t('without the hold the normal rule decides (store everything = deposit)', r2 && r2.act !== 'keep' || (r2 && r2.cat !== 'clanskill'), r2);
t('the hold is set before the warehouse take and lasts 30 min', /CLSKHOLD\.ids = \(\(sk2 && sk2\.items\) \|\| \[\]\)\.map\(i => num\(i\.id\)\); CLSKHOLD\.until = now\(\) \+ 30 \* 60000;/.test(SRC));
t('the supply-run storing gets the hold', /skillHold: \(typeof CLSKHOLD !== 'undefined' && now\(\) < CLSKHOLD\.until\) \? CLSKHOLD\.ids : \[\]/.test(SRC));
t('a #276 refusal keeps the hold (items still needed)', /if \(!\/#276\|not have the necessary\/i\.test\(msg\)\) CLSKHOLD\.until = 0;/.test(SRC));
// MASTERWAIT (owner 2026-11-05: "Hvorfor lærer dagger1 ikke de nye clan skills når jeg beder ham om det?" - his !clanskill met a hand-over and was dropped)
const avm = SRC.slice(SRC.indexOf('async function atVillageMaster('), SRC.indexOf('const followWas', SRC.indexOf('async function atVillageMaster(')));
t('MASTERWAIT: the village-master trip waits up to 10 min for a busy slot instead of dropping your order', /while \(gen === false && now\(\) - t0 < 10 \* 60000 && !Me\.IsDead\)/.test(avm) && /await sleep\(3000\); gen = takeControl\(why, PRIO\.ORDER\);/.test(avm));
// OWNERWINS (Dagger1 18:31: the runner's automatic hand-overs took the slot from the clan skill trip as "your order")
t('OWNERWINS: an internal hand-over never grabs the slot from a running order', /userOrderGrab === 'function' && !orderInternalText\(name\) && userOrderGrab\(name\)/.test(SRC));
t('OWNERWINS: the village-master trip holds the slot as an order (set + ended)', /try \{ userOrderSet\(why\); \} catch \(e\) \{ \}   \/\/ OWNERWINS/.test(avm + SRC.slice(SRC.indexOf('async function atVillageMaster('), SRC.indexOf('async function atVillageMaster(') + 2000)) && /try \{ userOrderEnd\(why\); \} catch \(e\) \{ \}\s*\n\s*releaseControl\(why\);/.test(SRC));
// MASTERPICK (Clan Regeneration 18:38: asked Basics, Maestro of Mammon -> no answer; M. Def. worked at Grand Master Eddy)
t('MASTERPICK: no Clan link on the page = not a master for clan skills, the next one is tried (no skill packet)', /if \(!link\) \{ clanLog\(`\$\{npc\.Name\}: no Clan link on the first page[^\n]*return null; \}/.test(SRC));
t('MASTERPICK: Mammon NPCs are never village masters', /if \(\/mammon\/i\.test\(String\(n\.Title \|\| ''\) \+ ' ' \+ String\(n\.Name \|\| ''\)\)\) return false;/.test(SRC));
// CLANSKILLORDER (18:42: a runner call took over between the warehouse and the master, the Earth Eggs were stored again)
t('CLANSKILLORDER: !clanskill waits for the slot and holds it from the warehouse to the master', /if \(!\(await orderWaitControl\('!clanskill', seq, 600000\)\)\)/.test(SRC) && /clanLearnFocus\(\{ under: '!clanskill' \}\)/.test(SRC) && /\}, opts\);/.test(SRC));
t('CLANSKILLORDER: the master trip runs in the order\'s own slot', /const under = !!\(opts && opts\.under && control\.owner === opts\.under\);/.test(SRC) && /let gen = under \? control\.gen : takeControl\(why, PRIO\.ORDER\);/.test(SRC));
console.log(`skillhold: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
