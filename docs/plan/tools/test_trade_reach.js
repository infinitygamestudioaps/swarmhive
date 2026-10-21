// OFFLINE TEST of the two hand-over requirements of 2026-10-20 (docs/requirements/trade.md). Never talks to the game:
//   node docs/plan/tools/test_trade_reach.js        (exit code 1 when a check fails)
// R1 HOVOWNJOB: a hand-over that belongs to the receiver's own running item job is never answered with "busy (your item job ...)".
// R2 TRADEWALL: a trade request is only sent within reach (2D <= 140, same floor), reached over the wall-checked path, never through a wall.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const fnSrc = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return null; let j = src.indexOf('{', i), n = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') n++; else if (src[k] === '}' && --n === 0) return src.slice(i, k + 1); } return null; };

// ---- R1 ----
const own = fnSrc('hovForMyJob'), busy = fnSrc('hovBusyWhy');
check(!!own && !!busy, 'hovForMyJob + hovBusyWhy exist');
const mk = (ijBusy, files) => new Function('IJ', 'hovLoad', 'Me', 'userTaskWhy', 'inRaid', 'inKamaInstance', 'state', 'STASH', 'WH', 'now', 'lastAttackerOnMe',
  own + '\n' + busy + '\nreturn hovBusyWhy;')({ busy: ijBusy }, (id) => files[id] || null, { IsDead: false },
  () => ijBusy ? 'your item job ' + ijBusy : '', () => false, () => false, { mode: '' }, { busy: false }, { busy: false }, () => 1e12, { at: 0 });
const files = { ijh_bishop5_x: { why: 'item job ij_dagger1_mvgjeliq' }, ijh_other_y: { why: 'item job ij_dagger1_other' }, loot_a_b: { why: 'loot' } };
check(mk('ij_dagger1_mvgjeliq', files)('ijh_bishop5_x') === '', 'receiver waiting in ITS item job: the job\'s own hand-over is not busy (the 2026-10-20 deadlock)');
check(/your item job/.test(mk('ij_dagger1_mvgjeliq', files)('ijh_other_y')), 'a hand-over of ANOTHER item job still sees "busy"');
check(/your item job/.test(mk('ij_dagger1_mvgjeliq', files)('loot_a_b')), 'a loot hand-over during my item job still sees "busy"');
check(/your item job/.test(mk('ij_dagger1_mvgjeliq', files)()), 'no hand-over id: busy as before');
check(mk('', files)('ijh_bishop5_x') === '', 'no item job running: not busy');
check(/busy:\s*hovBusyWhy\(id\)/.test(src) && /if \(hovBusyWhy\(d\.id\)\) return;/.test(src), 'hovHere(id) and the hold handler pass the hand-over id');

// ---- R2 ----
const reach = fnSrc('tradeReachDecide');
const R = new Function('TRADE_REACH', 'TRADE_REACH_Z', reach + '\nreturn tradeReachDecide;')(140, 150);
check(R({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }).ok === true, '100 away, same floor: within reach');
check(R({ x: 0, y: 0, z: 0 }, { x: 300, y: 0, z: 0 }).ok === false, '300 away (Helvetia: the other side of her wall): NOT within reach');
check(R({ x: 0, y: 0, z: -3472 }, { x: 50, y: 0, z: -3700 }).ok === false, 'close in x/y but another floor: NOT within reach');
check(R({ x: 0, y: 0, z: 0 }, null).ok === false, 'receiver unknown: NOT within reach');
const give = fnSrc('giveItems'), appr = fnSrc('tradeApproach');
check(!!appr && /geoWalk\(/.test(appr), 'tradeApproach walks the wall-checked path (geoWalk)');
check(/swarm\.trade\.come/.test(appr) && /App\.on\('swarm\.trade\.come'/.test(src), 'no walkable way: the receiver is asked to come (and listens)');
const iReq = give.indexOf('Send.TradeRequest('), iAppr = give.indexOf('await tradeApproach(');
check(iAppr > 0 && iAppr < iReq, 'giveItems: tradeApproach runs before every Send.TradeRequest');
check(/if \(!reach\.ok\)[^\n]*continue;/.test(give), 'giveItems: out of reach = no request sent that round');
check(!/Math\.hypot\(q\.X - Me\.X, q\.Y - Me\.Y\) > 150\) await walkDirect/.test(give), 'the old straight approach before the request is gone');
check(/could not get within trade reach/.test(give), 'out of reach after 5 rounds: an honest reason (not "did not open the trade")');
check((src.match(/Send\.TradeRequest\(/g) || []).length === 1, 'swarm.js has exactly ONE Send.TradeRequest (the guarded one in giveItems)');
const srv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
const iSrvReq = srv.indexOf("action: 'trade_request'"), iSrvGuard = srv.indexOf('dzMeet >= 150');
check(iSrvGuard > 0 && iSrvGuard < iSrvReq && /dist > 140/.test(srv), 'Dashboard/server.js character transfer: within 140 + same floor before its trade_request');
check((srv.match(/action: 'trade_request'/g) || []).length === 1, 'Dashboard/server.js has exactly ONE trade_request (the guarded one)');

console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
