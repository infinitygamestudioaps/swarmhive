// Requirement hunting.md R3 (owner 2026-10-23): hunt long, travel rarely. LONGHUNT + SHOTBUY in swarm.js.
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..', '..');
const SW = fs.readFileSync(path.join(R, fs.existsSync(path.join(R, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev/swarm.js' : 'Scripts/swarm.js'), 'utf8');
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
const blk = (a, b) => { const i = SW.indexOf(a), j = SW.indexOf(b, i); if (i < 0 || j < 0) throw new Error('block ' + a); return SW.slice(i, j); };
const HT = new Function(blk('// HUNTTIMER-PURE-BEGIN', '// HUNTTIMER-PURE-END') + '\nreturn { lhHours, lhEntry, lhWant, htClock, htHold, htEndDecide, LONGHUNT };')();
const PS = new Function(blk('// PSHOP-PURE-BEGIN', '// PSHOP-PURE-END') + '\nreturn { shotBuyable, lowDropShots, pshopCfg };')();

// hours: built-in 12, party > default, 0 = off, capped 48
t('built-in 12 h', HT.lhHours({}, 'Tank1') === 12);
t('all parties', HT.lhHours({ default: { longHunt: { hours: 20 } } }, 'Tank1') === 20);
t('party wins', HT.lhHours({ default: { longHunt: { hours: 20 } }, parties: { Tank1: { longHunt: { hours: 6 } } } }, 'Tank1') === 6);
t('0 = off', HT.lhHours({ parties: { Tank1: { longHunt: { hours: 0 } } } }, 'Tank1') === 0 && HT.lhEntry(0, 'room:1', 'x', 1, true) === null);
t('capped 48', HT.lhHours({ default: { longHunt: { hours: 99 } } }, 'X') === 48);

// the session entry + clock: holds supply runs / trips, ends after the hours, end action from the supply switch
const e = HT.lhEntry(12, 'room:toi5', 'ToI 5F', 1000, true);
t('entry: arrival only + repeat + long', e && e.arrivalOnly && e.repeat && e.long && e.endAction === 'resupply' && e.id === 'long:room:toi5');
t('supply switch off = keep hunting at the end', HT.lhEntry(12, 'k', 'k', 1, false).endAction === 'keep');
const H = 3600e3, start = 10 * H;
const c = HT.htClock(e, { id: e.id, startedAt: new Date(start).toISOString() }, start + 2 * H);
t('clock runs after arrival', c.active && !c.ended && c.leftMs === 10 * H);
t('not started before arrival (no 45-min fallback)', HT.htClock(e, { id: e.id }, 50 * H).active && !HT.htClock(e, { id: e.id }, 50 * H).started);
t('low supplies are held', HT.htHold('supply run', c, { low: ['Necro1: Mana Potion 80'] }).hold === true);
t('stash / fund / kamaloka / hub / move on held', ['warehouse stash', 'fund round', 'daily Kamaloka', 'giran hub', 'move on', 'letters'].every(k => HT.htHold(k, c, {}).hold));
t('shots really out = may go', HT.htHold('supply run', c, { low: ['Tank1: Soulshot (C-Grade) 0'] }).hold === false);
const c2 = HT.htClock(e, { id: e.id, startedAt: new Date(start).toISOString() }, start + 12 * H + 1);
t('ends after 12 h -> resupply', c2.ended && HT.htEndDecide(c2, { on: true }).action === 'resupply');

// supply amounts for the whole session
t('want: measured 700/h x 12 h x 1.25 = 10500', HT.lhWant(2000, 700, 12, 30000) === 10500);
t('want: never below your amount', HT.lhWant(20000, 100, 12, 30000) === 20000);
t('want: weight cap', HT.lhWant(2000, 5000, 24, 30000) === 30000);
t('want: no measurement = your amount', HT.lhWant(2000, 0, 12, 30000) === 2000);

// SHOTBUY: B / A / S shots only with player-shop buying + a max price
const off = PS.pshopCfg({}, 'Tank1'), on = PS.pshopCfg({ parties: { Tank1: { pshop: { on: true, max: { soulshot: { B: 400 } } } } } }, 'Tank1');
t('B soulshot, player shops off = cannot be bought', PS.shotBuyable('Tank1: Soulshot (B) 0', off) === false);
t('B soulshot, player shops on + max = can', PS.shotBuyable('Tank1: Soulshot (B) 0', on) === true);
t('A soulshot without a max price = cannot', PS.shotBuyable('X: Soulshot (A) 0', on) === false);
t('C / D / no-grade = NPC shops', PS.shotBuyable('X: Soulshot (C-Grade) 0', off) && PS.shotBuyable('X: Soulshot (D-Grade) 3', off) && PS.shotBuyable('X: Soulshot: No Grade 0', off));
t('blessed B spiritshot', PS.shotBuyable('X: Blessed Spiritshot (B) 0', off) === false);
t('drop: only the unbuyable part goes', JSON.stringify(PS.lowDropShots(['Tank1: Soulshot (B) 0, Mana Potion 40', 'Necro1: Soulshot (B) 0'], ['Tank1: Soulshot (B) 0', 'Necro1: Soulshot (B) 0'])) === JSON.stringify(['Tank1: Mana Potion 40']));

// wiring
t('the clock uses the long hunt when no dashboard timer', /function htClockMine\(\) \{ const key = htKey\(\), e = htEntryMine\(key\);/.test(SW) && /const key = htKey\(\), e = htEntryMine\(key\); if \(!e\) return;\n    let st = htStRead\(key\);/.test(SW));
t('long hunt arrival = at the spot and hunting', /const atSpot = \(\) => \{ if \(e\.long\) return lhAtSpot\(\);/.test(SW));
t('supply watch drops unbuyable shots BEFORE the hunt hold', /lowDropShots\(low, unb\);[\s\S]{0,200}if \(!low\.length\) return;[\s\S]{0,300}htHolds\('supply run', \{ low \}\)/.test(SW));
t('supply wants are scaled for the session', /lhScaleWants\(out\);\s+\/\/ LONGHUNT/.test(SW));
console.log(`${ok} ok, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
