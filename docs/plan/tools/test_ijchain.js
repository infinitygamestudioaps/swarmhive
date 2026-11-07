// IJCHAIN-2026-11-04 guard: an owner's upgrade runs start to end without the leader pulling the member back
// owner (Destroyer3 team gear-up, angry): "upgrade in progress then turn off autofollow, make the things and upgrade and exchange/purchase what you
// need, unseal and add SA to the weapon if that was asked then when you are done return to location where we all meet in giran and report you are done."
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8'), API = fs.readFileSync(path.join(R, 'Dashboard/upgrade_api.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const fn = (name) => { const i = SRC.indexOf('function ' + name + '('); return i < 0 ? null : new Function(SRC.slice(i, SRC.indexOf('\n', SRC.indexOf('{', i)) + 1).replace(/\n$/, '') + '\nreturn ' + name + ';')(); };

// 1) IJFOLLOWOFF: L2Swarm follow OFF for the whole job, whoever switched it on
const off = fn('ijFollowOffNow');
t('a member on an item job with follow on -> follow goes OFF', off({ leader: false, ijBusy: true, follow: true }) === true);
t('a member on an errand / upgrade run -> OFF too', off({ leader: false, errand: true, follow: true }) && off({ leader: false, gupBusy: true, follow: true }));
t('no job -> follow left alone; the leader never', !off({ leader: false, follow: true }) && !off({ leader: true, ijBusy: true, follow: true }));
t('the watchdog runs every 500 ms and sets Options.ActiveFollow = false', /if \(ijFollowOffNow\(o\)\) \{ Options\.ActiveFollow = false;/.test(SRC) && /ijFollowOffNow\(o\)[\s\S]{0,400}\}, 500\);/.test(SRC));

// 2) CWHASKKEEP: the bank ask is re-sent until served, never twice at once, a busy bank waits 15 min
t('the member re-asks the bank every 150 s while it waits (max 40 min)', /now\(\) - t0 < 40 \* 60000( && !ijStopped\(\))?\) \{ await sleep\(3000\);[\s\S]{0,400}if \(have\(\) < n && now\(\) - ra > 150000\)/.test(SRC) &&/App\.emit\('swarm\.whtake\.ask', \{ from: Me\.Name, items: W\(n - have\(\)\), jid, again: true \}\)/.test(SRC));
t('the same ask never runs twice at once (askFlight)', /if \(WH\.askFlight\[key\]\) return;/.test(SRC) && /finally \{ delete WH\.askFlight\[key\]; \}/.test(SRC));
t('a busy bank waits up to 15 min for its turn (was 3)', /now\(\) - tq > 15 \* 60000\) \{ r\.bag0 = bag0w; break; \}/.test(SRC) && !/now\(\) - tq > 180000\)/.test(SRC));

// 3) LUXURYROUTE: Galladucci / Alexandria have a recorded Giran route, walked first
const G = JSON.parse(fs.readFileSync(path.join(R, 'Scripts/data/giran_routes.json'), 'utf8')), L = (G.routes || G).luxury;
t('giran_routes.json has the luxury route for Galladucci + Alexandria (routeFirst, from start)', !!(L && L.npc === 'Galladucci' && L.npc2 === 'Alexandria' && L.routeFirst === true && L.from === 'start' && L.points.length >= 8));
t('the luxury route ends in front of the two (< 250 from Galladucci 79599,145522)', !!(L && Math.hypot(L.points[L.points.length - 1][0] - 79599, L.points[L.points.length - 1][1] - 145522) < 250));
t('the route enters from the east door (80152,145816), not through the wall behind the weapon shop', !!(L && L.points.some(p => Math.hypot(p[0] - 80152, p[1] - 145816) < 60)));
t('townWalkToNpc walks a routeFirst recorded route before the street graph', /if \(\(!o\.atlasFirst \|\| routeFirst\) && \(await giranRoute\(\)\)\) return true;/.test(SRC));

// 4) IJREPORT: the end = Giran meeting place + a report
const ur = SRC.slice(SRC.indexOf('async function upgradeRun('), SRC.indexOf('async function itemJobOrder('));
t('the upgrade reports in party chat when it ends', /SayToParty\(`\$\{me\}: upgrade \$\{okN === L\.length \? 'done'/.test(ur));
const ij = SRC.slice(SRC.indexOf('async function itemJobOrder('), SRC.indexOf('async function itemJobOrder(') + 30000);
t('the job ends at the Giran meeting place (giranGo start in the finally)', /finally \{[\s\S]{0,400}await giranGo\('start'\)/.test(ij));

// 5) UNSEALWORN: a worn sealed piece comes off, is unsealed, the unsealed variant goes back on; the plan takes the variant
const us = SRC.slice(SRC.indexOf('async function unsealRun('), SRC.indexOf('async function makeRun('));
// EXCHOFF (owner 14:20): the worn piece off / back on is the shared helper inside ijBuyAt now (behaviour tested in test_exchoff.js)
t('a worn sealed piece is taken off before Pushkin (ijBuyAt offIds -> exchOff)', /kind: 'exchange', offIds: \[num\(x\.id\)\] \}/.test(us));
t('after the unseal the piece goes back on (the sealed one when it failed) - exchBackOn in ijBuyAt', /finally \{[^\n]*await exchBackOn\(exw\.worn, \[id\], before\)/.test(SRC));
t('the unseal plan takes the variant heavy / light / robe (no Robe default for a Titan)', /variant: \/\^\(heavy\|light\|robe\)\$\//.test(API) && /unsealRow\(ctx, row\.id, p\.variant\)/.test(API) && /toName: u\.name \|\| row\.to\.name/.test(API));
t('worn sealed pieces are listed for unsealing (src worn -> a bag piece of the job)', /filter\(r => r\.eq\)\.forEach\(r => add\('worn', r\)\)/.test(API) && /src: row\.src === 'worn' \? 'bag' : row\.src, worn: row\.src === 'worn'/.test(API));
t('a worn PLUSED piece is never unsealed automatically (PLUSLOCK)', /row\.src === 'worn' && row\.enchant > 0 && !b\.plusOk\) \{ warn\.push/.test(API));
// 6) CWHNOTTHERE: a clan warehouse piece that is not there fails at once and is bought instead (when the owner allowed buying)
const nt = fn('cwhNotThere');
t('the bank reads "not in the warehouse" ids from its take answer', JSON.stringify(nt('warehouse (clan): took nothing at Taurin; missing: item 5293 x1 (not in the warehouse), item 864 (not in the warehouse), item 52 x3 (full)')) === JSON.stringify([5293, 864]));
t('nothing missing -> no ids', nt('took 1 kind(s)').length === 0);
t('the bank tells the asker at once (swarm.whtake.result notThere)', /const miss = cwhNotThere\(r\.msg\); if \(miss\.length && name !== Me\.Name\) App\.emit\('swarm\.whtake\.result', \{ to: name, ok: false, notThere: miss/.test(SRC));
t('the asker stops waiting at once (no 40 min re-ask for a piece that is not there)', /if \(have\(\) < n && cwhNotThereNow\(id\)\) \{[\s\S]{0,250}return \{ ok: false, notThere: true/.test(SRC));
t('the upgrade buys it instead when buying was allowed (+0 only), via the luxury shop when that sells it', /if \(!f\.ok && f\.notThere && U\.buyOk === true && !num\(it\.enchant\)\)/.test(SRC) && /off\.market \? await ijBuyAt\(off\.market, num\(it\.id\), 1, id\) : await ijBuy\(num\(it\.id\), id\)/.test(SRC));
t('the Upgrade job carries the owner\'s buy choice (buyOk from use.buy)', /buyOk: !!\(b\.use && b\.use\.buy\)/.test(API));
// 7) IJHAVE: a resumed warehouse line uses the exact piece already in the bag (no "bagCount + 1" wait for a piece that does not exist)
t('a warehouse line first looks for the exact piece already in my bag (ijFind, not worn, not kept)', /const already = ijFind\(num\(it\.id\), num\(it\.enchant\), keep\);\s*const f = already \? \{ ok: true, have: true \} : await ijFetch\(/.test(SRC) && /if \(already\) \{ objId = already;/.test(SRC));
console.log(`ijchain: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
