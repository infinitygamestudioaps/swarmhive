// OFFLINE TEST of SPINFIX-2026-10-15 (brain host watchdog quarantined party Char1 3x in 10 min, 2026-10-15 08:02 / 08:35 / 09:02 /
// 09:34 / 09:57 UTC): autolevel's "a teammate is far -> await gatherTeam('during hunt'); continue" spun forever WITHOUT a macrotask wait
// while Bishop6 travelled back 405k away (gatherTeam answered "hunting on" at once = only promise continuations, no timer), so the
// worker's heartbeat (a timer) never ran: "no heartbeat for 8017 ms — context Char1 after an await (a promise continuation)".
//   node docs/plan/tools/test_hunt_spin.js        (exit code 1 when a check fails)
// 1) the pure decision huntGatherDecide (TEAMJOIN-PURE block of Scripts_dev/swarm.js)
// 2) the mechanism, timed: the OLD loop shape starves a timer heartbeat in a worker thread (like the pool's watchdog sees it); the NEW loop
//    shape (hunt on / wait >= 1 s) lets the heartbeat run within 200 ms
// 3) wiring: the autolevel line uses the guard, the old one-liner is gone
const fs = require('fs'), path = require('path');
const { Worker } = require('worker_threads');
const SRC = path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const a = src.indexOf('// TEAMJOIN-PURE-BEGIN'), b = src.indexOf('// TEAMJOIN-PURE-END');
if (a < 0 || b < a) { console.error('TEAMJOIN-PURE block not found'); process.exit(1); }
const M = new Function(src.slice(a, b) + '\nreturn { huntGatherDecide, huntWithoutReturning };')();
let fails = 0, n = 0;
const check = (ok, what) => { n++; console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };

// ---- 1) decision (the live case: 8 teammates next to Char1 in the catacomb, Bishop6 405633 away in Giran, travelling back)
const near = ['Bishop5', 'Nuker13', 'Nuker14', 'Nuker15', 'Nuker16', 'Nuker17', 'Nuker18'].map(name => ({ name, d: 300, dead: false }));
const ilu = { name: 'Bishop6', d: 405633, dead: false };
const retIlu = (nm) => nm === 'Bishop6';
check(M.huntGatherDecide({ spread: near.concat([ilu]), lim: 9000, returning: retIlu }) === 'hunt', 'Bishop6 405k away on her way back: hunt on (no gather loop)');
check(M.huntGatherDecide({ spread: near.concat([ilu]), lim: 9000, returning: () => false }) === 'gather', 'Bishop6 405k away, NOT travelling back: gather');
check(M.huntGatherDecide({ spread: near.concat([Object.assign({}, ilu, { dead: true })]), lim: 9000, returning: retIlu }) === 'gather', 'a dead teammate: gather');
check(M.huntGatherDecide({ spread: near, lim: 9000 }) === 'hunt', 'everyone near: hunt');
check(M.huntGatherDecide({ spread: near.concat([{ name: 'X', d: 9500, dead: false }]), lim: 9000 }) === 'gather', 'one at 9500 (> 9000), not returning: gather');
check(M.huntWithoutReturning({ here: [{ role: 'bishop' }, { role: 'tank' }, { role: 'sorcerer' }, { role: 'sorcerer' }, { role: 'sorcerer' }], total: 9 }), 'the live team (a 2nd bishop here, 8 of 9): huntWithoutReturning true (the gatherTeam "hunting on" branch)');

// ---- 2) mechanism, timed in a worker thread (heartbeat = a 50 ms timer, like pool.js hbMs 250)
function runShape(shape, ms) {
  const code = `
    const { parentPort } = require('worker_threads');
    setInterval(() => parentPort.postMessage('hb'), 50);
    const sleep = (t) => new Promise(r => setTimeout(r, t));
    const now = () => Date.now();
    // gatherTeam in the live case: no await of a timer (stuckTick with nothing near, returningMate -> "hunting on" -> return true)
    async function stuckTick() { return []; }
    async function gatherTeamInner() { await stuckTick(); return true; }
    async function gatherTeam() { try { return await gatherTeamInner(); } finally { } }
    const huntGatherDecide = ${M.huntGatherDecide.toString()};
    const spread = () => [{ name: 'Bishop5', d: 300, dead: false }, { name: 'Bishop6', d: 405633, dead: false }];
    (async () => {
      await sleep(120);                                      // let the first heartbeats out
      for (let i = 0; ; i++) {
        if (${JSON.stringify(shape)} === 'old') {
          if (spread().some(m => m.d > 9000 || m.dead)) { await gatherTeam('during hunt'); continue; }
        } else {
          if (spread().some(m => m.d > 9000 || m.dead)) {
            const tg = now(); const gok = await gatherTeam('during hunt');
            if (!(gok && huntGatherDecide({ spread: spread(), lim: 9000, returning: n => n === 'Bishop6' }) === 'hunt')) { if (now() - tg < 1000) await sleep(1000); continue; }
          }
        }
        await sleep(1500);                                   // the hunt part of the loop ends with sleep(1500)
      }
    })();`;
  return new Promise((res) => {
    const w = new Worker(code, { eval: true });
    const hbs = []; const t0 = Date.now();
    // 2026-10-24: the window starts at the worker's FIRST heartbeat (the release test run boots workers slowly on a busy PC: 3 / 7 heartbeats
    // in 900 ms from spawn, although the loop never starved); a worker that never beats ends after 5 s with what it has
    let done = false; const end = () => { if (done) return; done = true; w.terminate(); res(hbs); };
    w.on('message', () => { if (!hbs.length) setTimeout(end, ms); hbs.push(Date.now() - t0); });
    setTimeout(end, ms + 5000);
  });
}
(async () => {
  const oldHb = await runShape('old', 900);
  // 2026-10-23: measured from the worker's FIRST heartbeat (worker boot under load took ~190 ms, so "t > 200 from spawn" failed with a
  // heartbeat that came before the loop even started); the loop starts 120 ms after boot, so nothing may come later than first + 250
  const lateOld = oldHb.filter(t => t > (oldHb[0] || 0) + 250);
  check(lateOld.length === 0, `OLD loop shape: the heartbeat starves after the loop starts (${oldHb.length} heartbeats in 900 ms, last at ${oldHb[oldHb.length - 1] || '-'} ms) = the watchdog kill`);
  const newHb = await runShape('new', 900);
  let maxGap = 0; for (let i = 1; i < newHb.length; i++) maxGap = Math.max(maxGap, newHb[i] - newHb[i - 1]);
  check(newHb.length >= 10 && maxGap < 200, `NEW loop shape: heartbeat keeps running (${newHb.length} heartbeats, largest gap ${maxGap} ms < 200)`);

  // ---- 3) wiring
  check(!/teamSpread\(\)\.some\(m => m\.d > \(leadMode\(\) \? 9000 : CONFIG\.together\.huntDist\) \|\| m\.dead\)\) \{ await gatherTeam\('during hunt'\); continue; \}/.test(src), 'the old autolevel one-liner is gone');
  const al = src.indexOf('async function autoLevelLoop('), seg = src.slice(al, al + 12000);
  check(/const gok = await gatherTeam\('during hunt'\);/.test(seg) && /huntGatherDecide\(\{ spread: teamSpread\(\), lim: huntLim, returning: \(n\) => returningMate\(n\) \}\) === 'hunt'/.test(seg) && /if \(now\(\) - tg < 1000\) await sleep\(1000\);/.test(seg), 'autoLevelLoop: gatherTeam result + huntGatherDecide + the >= 1 s wait');
  console.log(`\n${n - fails}/${n} checks passed`);
  process.exit(fails ? 1 : 0);
})();
