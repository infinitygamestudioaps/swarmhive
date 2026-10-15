// MISSIONSTICK-2026-10-14: a !mission raid order holds until the raid has a RESULT; a trip that ends without one is tried again.
// Lifts missionOrderLoop + MISSION_RETRY from Scripts_dev/swarm.js and runs it against stubs. node docs/plan/tools/test_mission_stick.js
'use strict';
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
const a = src.indexOf('let missionResult = null;'), b = src.indexOf('async function leaderMission(kind, arg) {');
if (a < 0 || b < 0) { console.log('FAIL: block not found'); process.exit(1); }
const block = src.slice(a, b);
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

async function run(opts) {
  const S = { t: 1000, said: [], ok: null, fail: null, live: 0, tries: 0 };
  const env = {
    orderState: { seq: 7 }, state: { running: true }, daily: { orderAt: 0 },
    now: () => S.t, sleep: async (ms) => { S.t += ms; if (opts.onSleep) opts.onSleep(env, S); },
    oqLive: (seq, d) => { S.live += d; }, oqSeqOk: (seq, w) => { S.ok = w; }, oqSeqFail: (seq, w) => { S.fail = w; },
    SayToParty: (t) => S.said.push(t), note: () => { },
    freeTeamForOrder: async () => true,
  };
  env.leaderMission = async (kind, arg) => { S.tries++; S.t += 5000; if (opts.result && S.tries >= opts.result) env.setResult({ boss: arg, outcome: 'dead', at: S.t }); };
  const f = new Function(...Object.keys(env), block + '\nreturn { loop: missionOrderLoop, setResult: (r) => { missionResult = r; }, R: MISSION_RETRY };');
  const api = f(...Object.values(env)); env.setResult = api.setResult; api.R.waitMs = 1000;
  await api.loop(opts.kind || 'raid', 'Nakondas');
  return { S, env };
}
(async () => {
  let r = await run({ result: 3 });
  ok(r.S.tries === 3 && /Nakondas: dead/.test(r.S.ok || ''), 'retries until the raid has a result (3 trips, then ok)');
  ok(r.S.said.filter(t => /trying again/.test(t)).length === 2, 'says each retry in party chat');
  ok(r.S.live === 0, 'the order is marked active while it runs and released after');
  ok(r.env.daily.orderAt > 0, 'a daily Kamaloka is held back (daily.orderAt refreshed)');
  r = await run({});
  ok(r.S.tries === 5 && /given up/.test(r.S.fail || ''), 'gives up after 5 trips without a result and says so');
  r = await run({ onSleep: (env, S) => { if (S.tries === 2) env.orderState.seq = 8; } });
  ok(r.S.tries === 2 && !r.S.fail && !r.S.ok, 'a newer order ends the loop quietly');
  r = await run({ kind: 'kamaloka' });
  ok(r.S.tries === 1, 'other mission kinds run once');
  // the daily Kamaloka guard is in the source
  ok(/oqActive\(orderState\.seq\) \|\| now\(\) - \(daily\.orderAt \|\| 0\) < DAILY_ORDER_GAP_MS/.test(src), 'daily Kamaloka never starts during / within 30 min of an order');
  ok(/w\.seq !== orderState\.seq\) \{ w\.reported = true; return; \}/.test(src), 'a death warning is only reported on the same trip');
  console.log(fails ? `${fails} FAILED` : 'all ok'); process.exit(fails ? 1 : 0);
})();
