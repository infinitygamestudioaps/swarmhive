// RUNNERRAID-2026-11-03 (owner: "Why is Tank3 not selling items and handing items to crafter1"): raid / circuit parties are part of the
// runner -> bank chain BETWEEN bosses (rotation + near-full call), never while pulling / in an instance; the party waits for a runner hand-over
// (max 3 min) before it leaves for the next boss; the Runner page shows why ('raid circuit: between bosses' / 'pulling - later')
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const grab = (name) => { const i = SRC.indexOf('function ' + name + '('); let d = 0, j = SRC.indexOf('{', i); for (; j < SRC.length; j++) { if (SRC[j] === '{') d++; else if (SRC[j] === '}' && --d === 0) break; } return SRC.slice(i, j + 1); };
const W = new Function(grab('crunRaidWindow') + '\nreturn crunRaidWindow;')();
const H = new Function(grab('crunRaidHoldDecide') + '\nreturn crunRaidHoldDecide;')();
// the window
t('a leveling party is no raid party', W({ hunt: false }).raid === false);
t('Tank3 replay: circuit waiting for a respawn = between bosses, the runner may come', W({ hunt: true, phase: 'waiting' }).ok === true && /between bosses/.test(W({ hunt: true, phase: 'waiting' }).why));
t('choosing / stash / recovering / supply / plain raidhunt waiting = ok', ['choosing', 'stash', 'recovering', 'supply'].every(p => W({ hunt: true, phase: p }).ok) && W({ hunt: true, phase: '', waiting: true }).ok);
t('pulling (raid mode / countdown / fighting) = later', !W({ hunt: true, phase: 'waiting', inRaid: true }).ok && !W({ hunt: true, phase: 'countdown' }).ok && !W({ hunt: true, phase: 'fighting' }).ok && /pulling - later/.test(W({ hunt: true, phase: 'fighting' }).why));
t('instance / Kamaloka and travel = later', !W({ hunt: true, phase: 'waiting', inst: true }).ok && !W({ hunt: true, phase: 'travel' }).ok && !W({ hunt: true, phase: 'waiting', travel: true }).ok);
// the hold before the next boss
const T = 1e9;
t('no runner trip to us = no hold', H({ now: T }).hold === false && H({ comingAt: T - 5000, doneAt: T - 1000, now: T }).hold === false);
t('runner on its way / handing over = hold', H({ comingAt: T - 30000, now: T }).hold === true && H({ comingAt: T - 60000, hereAt: T - 10000, now: T }).hold === true);
t('after 3 min the party goes on and says so', H({ comingAt: T - 181000, now: T }).hold === false && H({ comingAt: T - 181000, now: T }).gaveUp === true);
// the wiring
t('the offer counts a raid party between bosses as hunting + carries the reason', SRC.includes("hunting: crunHuntingNow() || (rw.raid && rw.ok)") && SRC.includes("raid: rw.raid ? rw.why : (iw.idle ? iw.why : '')"));
t('a raid leader between bosses with a bag >= 80 % calls the runner', /const rw0 = crunRaidWindowMe\(\)[\s\S]{0,300}if \(!w\.raid \|\| !w\.ok\) return;[\s\S]{0,400}if \(bag >= 80\) crunCallRunner\(/.test(SRC));
t('the runner announces coming / leaving; both raid loops wait for it before the next boss', /App\.emit\('swarm\.runner\.coming'/.test(SRC) && /App\.emit\('swarm\.runner\.leftparty'/.test(SRC) && (SRC.match(/await crunRaidHold\(\); \} catch \(e\) \{ \}   \/\/ RUNNERRAID/g) || []).length === 2);
t('the runner state + page carry the reason', /raid: String\(o\.raid \|\| ''\)/.test(SRC) && fs.readFileSync(path.join(R, 'Dashboard/runner_api.js'), 'utf8').includes("why: p.raid || 'not hunting") && fs.readFileSync(path.join(R, 'Dashboard/runnerpage.js'), 'utf8').includes('rnp-raid'));
// RUNNERIDLE-2026-11-03 (owner: "Same with Spoiler8" - idle in town, waiting for orders, bag 205/250)
const I = new Function(grab('crunIdleWindow') + '\nreturn crunIdleWindow;')();
t('Spoiler8 replay: idle in Giran = hands his loot to the bank himself', I({ idle: true, town: 'Giran', bankTown: 'Giran' }).mode === 'self');
t('idle in another town = the runner comes', I({ idle: true, town: 'Aden', bankTown: 'Giran' }).mode === 'runner' && I({ idle: true, town: '', bankTown: 'Giran' }).mode === 'runner');
t('not idle / busy (leveling, raid, trade, fight) = nothing', !I({ idle: false, town: 'Giran', bankTown: 'Giran' }).ok && !I({ idle: true, town: 'Giran', bankTown: 'Giran', busy: true }).ok);
t('every idle character in Giran with a bag >= 80 % hands over (max every 20 min, bank online) and the bank sells at once',
  /const w = crunIdleWindowMe\(\); if \(!w\.ok \|\| w\.mode !== 'self'\) return;[\s\S]{0,300}if \(bag < 80\) return;[\s\S]{0,600}crunOrder\(S\.bank, rows, 0,[\s\S]{0,500}App\.emit\('swarm\.runner\.delivered'/.test(SRC) && /now\(\) - CIDLE\.at < 20 \* 60000/.test(SRC));
t('an idle party outside Giran is a rotation candidate + calls when nearly full', /hunting: crunHuntingNow\(\) \|\| \(rw\.raid && rw\.ok\) \|\| \(iw\.ok && iw\.mode === 'runner'\)/.test(SRC) && /iw0\.ok && iw0\.mode === 'runner'/.test(SRC));
console.log(`runner raid: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
