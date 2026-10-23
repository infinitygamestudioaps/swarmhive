// OFFLINE TEST (public tester reports v1.8.17, 2026-10-23). Never talks to the game:
//   node docs/plan/tools/test_trade_room.js        (exit code 1 when a check fails)
// TRADEROOM: "if inventory is full chars try to trade anyway; trading blocked both entirely, had to kill the process"
//   -> the receiver's room is checked before a trade, a full receiver refuses with the reason, a stalled trade is cancelled,
//      a hand-over stops after a full receiver / 3 failed trades instead of retrying every item.
// ERRAND: "when sending a char to sell ... they go to the shop and go back to the party leader - infinite loop" + "nobody sells junk"
//   -> !sell no longer pauses its own walks (pauseWalk), and every follow / back-to-the-middle / come-here / left-behind pull waits for the errand.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const fnSrc = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return null; let j = src.indexOf('{', i), n = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') n++; else if (src[k] === '}' && --n === 0) return src.slice(i, k + 1); } return null; };
const block = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b); return i >= 0 && j > i ? src.slice(i, j) : null; };

// ---- TRADEROOM pure block ----
const pure = block('// TRADEROOM-PURE-BEGIN', '// TRADEROOM-PURE-END');
check(!!pure, 'TRADEROOM-PURE block exists');
const P = new Function(pure + '\nreturn { TRADEROOM, tradeRoomDecide, tradeStalled, tradeStopAll };')();
const R = P.tradeRoomDecide;
check(R({ count: 80, limit: 80, load: 10, maxLoad: 100 }, null, 1, 0).ok === false, 'receiver with 80/80 slots: refuses');
check(/bag full/.test(R({ count: 80, limit: 80, load: 10, maxLoad: 100 }, null, 1, 0).why), '... and says "bag full" with the counts');
check(R({ count: 78, limit: 80, load: 10, maxLoad: 100 }, null, 5, 0).ok === false, '2 slots free, 5 new kinds: refuses');
check(R({ count: 50, limit: 80, load: 10, maxLoad: 100 }, null, 5, 0).ok === true, '30 slots free: accepts');
check(R({ count: 50, limit: 80, load: 98, maxLoad: 100 }, null, 1, 0).ok === false, 'weight 98 %: refuses (too heavy)');
check(R({ count: 50, limit: 0, load: 10, maxLoad: 100 }, null, 1, 0).ok === true, 'limit unknown (0): never a false refusal');
check(R(null, { bf: 'full', at: 1000 }, 3, 2000).ok === false, 'giver side: fresh "full" report = no trade');
check(R(null, { bf: 'full', at: 0 }, 3, P.TRADEROOM.freshMs + 10).ok === true, 'giver side: an OLD "full" report does not block');
check(R(null, { bf: 'near', at: 1000 }, 3, 2000).ok === true, 'giver side: "near" still trades');
check(R(null, null, 3, 0).ok === true, 'giver side: no report = trade (the receiver checks itself)');
const S = P.tradeStalled;
check(S({ started: true, startedAt: 0, since: 0 }, P.TRADEROOM.hardMs + 1) === true, 'an open trade window past 2 min: stalled -> cancel');
check(S({ started: true, startedAt: 0, since: 0 }, 60000) === false, 'an open trade window at 1 min: not stalled');
check(S({ started: false, since: 0 }, 5 * 60000) === false, 'still walking / asking at 5 min: not stalled');
check(S({ started: false, since: 0 }, 13 * 60000) === true, 'still walking / asking at 13 min: stalled');
check(S(null, 1e12) === false, 'no trade: nothing to cancel');
check(P.tradeStopAll('Dagger1: bag full: 80 of 80 slots used — no trade', 0) === true, 'hand-over: a full receiver stops the whole hand-over');
check(P.tradeStopAll('trade timeout', 2) === false && P.tradeStopAll('trade timeout', 3) === true, 'hand-over: 3 failed trades in a row stop it');

// ---- TRADEROOM wiring ----
const give = fnSrc('giveItems'), recv = fnSrc('receiveItems'), wt = fnSrc('waitTrade'), hov = fnSrc('hovGive');
check(/tradeRoomDecide\(null, rep/.test(give) && give.indexOf('tradeRoomDecide(') < give.indexOf('Send.TradeRequest('), 'giveItems: checks the receiver\'s bag report before any request');
check(/if \(tradeState && tradeState\.refused\) break;/.test(give), 'giveItems: a refusal ends the request loop (no retry forever)');
check(/!tradeState\.refused\) \{/.test(give), 'giveItems: a refusal / bag-full message ends the confirm loop');
check(/tradeRoomDecide\(tradeRoomLive\(\)/.test(recv) && /swarm\.trade\.refuse/.test(recv), 'receiveItems: checks its own live bag and refuses with the reason');
check(recv.indexOf('tradeRoomDecide(') < recv.indexOf('acceptTrade'), 'receiveItems: refuses BEFORE it accepts any trade');
check(/adenaOnly/.test(recv), 'receiveItems: adena-only trades (fund) are never refused for a full bag');
check(/!tradeState\.refused/.test(wt), 'waitTrade: ends on a refusal');
check(/App\.on\('swarm\.trade\.refuse'/.test(src), 'giver listens to swarm.trade.refuse');
check(/tradeStalled\(tradeState, now\(\)\)[\s\S]{0,300}clearStuckTrade\('the trade stalled'\)/.test(src), 'watchdog: a stalled trade is cancelled with clearStuckTrade');
check(/fullSysKind\(Number\(id\), flat\(text, 0\)\) === 'bag'/.test(src), 'a bag-full server message during a trade ends it');
check(/tradeStopAll\(r\.why, hovStreak\)/.test(hov) && /not tried: \$\{hovStopWhy\}/.test(hov), 'hovGive: stops after a full receiver, reports the rest as not tried');

// ---- ERRAND ----
const eb = fnSrc('errandBlocks');
check(!!eb && !!fnSrc('errandStart') && !!fnSrc('errandEnd') && !!fnSrc('errandNow'), 'errand helpers exist');
const EB = new Function(eb + '\nreturn errandBlocks;')();
check(EB({ kind: 'sell', until: 1000 }, 500) === true, 'an errand running: blocks the pulls');
check(EB({ kind: 'sell', until: 1000 }, 1500) === false, 'an errand past its hard end: never benches for good');
check(EB(null, 0) === false, 'no errand: nothing blocked');
const sellI = src.indexOf("case '!sell': {"), sellBody = src.slice(sellI, src.indexOf("case '!navtest'", sellI));
check(sellI > 0 && !/state\.pauseWalk = true/.test(sellBody), '!sell no longer sets pauseWalk (it paused the sale\'s own walks: "nobody sells")');
check(/errandStart\('sell'/.test(sellBody) && /errandEnd\('sell'\)/.test(sellBody), '!sell runs as an errand (start + end in finally)');
check(/takeControl\('!sell', PRIO\.ORDER\)/.test(sellBody) && /releaseControl\('!sell'\)/.test(sellBody), '!sell holds the order control slot');
const nnf = fnSrc('nnFollow'), rgf = fnSrc('rgFollowTick'), ch = fnSrc('comeHereRun'), ab = fnSrc('assistBlocked');
check(/errandNow\(\)/.test(nnf), 'script follow waits for the errand');
check(/errandNow\(\)/.test(rgf), 'dungeon centreline follow waits for the errand');
check(/errandNow\(\)/.test(ch), 'come-here waits for the errand');
check(/errandNow\(\)/.test(ab), 'assist waits for the errand');
check(/if \(errandNow\(\)\) \{ stuckFollow\.since = 0; return; \}/.test(src), 'back-to-the-middle / stuck follow waits for the errand');
check(/if \(errandNow\(\)\) return;[^\n]*\n\s*if \(!IsEnabled\) EnableBot\(\);/.test(src), 'Fight-with-L2Swarm keeper never re-enables the bot during an errand');
check(/DLV\.on \|\| errandNow\(\)\) \{ lb\.since = 0; return; \}/.test(src), 'left-behind trip waits for the errand');
check(/errandStart\('buy'/.test(src), 'a member\'s gear-shopping errand (swarm.gearup) is an errand too');

console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
