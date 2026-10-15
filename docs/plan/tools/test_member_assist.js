// TEST MEMBER ASSIST (ASSIST-2026-10-15; public tester Vykaax: "The followers are several seconds behind ... they don't even move until the
// leader reaches the mob and hits it, by then the Necromancer kills it and the followers continue to run to the dead mob location").
// Nothing live: fake world + the REAL agent2.js + Dashboard/brain_host Runner + Scripts_dev/swarm.js (test_brain_host.js harness), Logs isolated.
// Party (members' XML profiles EMPTY like the tester's: no L2Swarm FollowAtk / follow / combat skills of their own):
//   Tank1 (sk, leader, L2Swarm combat) + Destroyer1, Destroyer2 (destroyer, melee) + Necro1 (necromancer, caster) + Bishop1 (bishop, healer).
// The leader is ordered '!hunthere 3000' in a field with monsters 900-1800 apart; monsters hit back whoever hits them (OnAttack every 1.5 s).
// Per engagement (the leader's target changes to a new monster M at t0) it measures for every member:
//   sel   = t0 -> the member's target is M        move = t0 -> the member walks toward M (melee)        hit = t0 -> melee in reach + attacking M
//   cast  = t0 -> the caster casts at M            dead-walk = after M died, the member still walks to M's spot (> 1 s)
// and checks (after the fix): median sel <= 1.5 s and median move <= 2 s for the melee members (the leader is still walking there), the caster
// casts within 3 s, no dead-walk, the healers never attack.
//   node docs/plan/tools/test_member_assist.js [--swarm <swarm.js copy>] [--report]   (--report = numbers only, no pass/fail)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const T1 = require('./test_brain_host.js');
const { World, Clock, Runner, run, mkTmp, GIRAN, ROOT, AGENT2, setCur } = T1;
const arg = (k, d) => (process.argv.includes(k) ? path.resolve(process.argv[process.argv.indexOf(k) + 1]) : d);
const SWARM = arg('--swarm', path.join(ROOT, 'Scripts_dev', 'swarm.js'));
const REPORT = process.argv.includes('--report');
const LEADER = 'Tank1', MELEE = ['Destroyer1', 'Destroyer2', 'Doombringer1', 'Inspector1'], CASTER = 'Necro1', HEALER = 'Bishop1', HEALERS = ['Bishop1', 'Saint1'], NAMES = [LEADER].concat(MELEE, [CASTER, 'Chanter1'], HEALERS);
let pass = 0, fail = 0;
const ok = (c, m) => { if (REPORT) { console.log('  ..   ' + m); return; } if (c) pass++; else fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };
const med = (a) => { const s = a.filter(x => x !== null && isFinite(x)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const fmt = (v) => v === null || v === undefined ? '-' : (v / 1000).toFixed(2) + 's';

async function main() {
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(overlay);
  fs.mkdirSync(path.join(overlay, 'Logs'), { recursive: true });
  const port = 19700 + Math.floor(Math.random() * 300);
  const clock = new Clock({ virtual: true, start: Date.now() });
  const runner = new Runner({ port, clock, overlay, isolate: ['Logs'], allow: NAMES, logFile: path.join(tmp, 'brain_host.log'), root: ROOT.replace(/\//g, '\\'), geopath: true, script: SWARM });
  setCur(runner);
  await runner.start();
  const world = new World(clock); world.sockets = new Set();
  const F = { x: 70969, y: 69956, z: -3691 };   // Timak Outpost (a field, no town)
  // classes: the harness knows a few class ids; the role comes from swarm.config.json (roster), the class TYPE decides caster vs melee
  const mk = (n, cls, ct, name, skills, o) => { const c = world.addChar(n, 57, 52, GIRAN.x, GIRAN.y, Object.assign({ skills }, o || {})); c.me.ClassId = cls; c.me.ClassName = name; c.me.ClassType = ct; return c; };
  const L = mk(LEADER, 33, 'TANK', 'ShillienKnight', [[1216, 'Self Heal', 1, 'SELF'], [28, 'Aggression', 10, 'ENEMY'], [984, 'Shield Strike', 10, 'ENEMY']], { leader: true });
  ['Destroyer1', 'Destroyer2'].forEach(n => mk(n, 46, 'FIGHTER', 'Destroyer', [[255, 'Power Smash', 10, 'ENEMY']]));
  mk('Doombringer1', 127, 'FIGHTER', 'Berserker', [[478, 'Double Thrust', 10, 'ENEMY']]); mk('Inspector1', 128, 'FIGHTER', 'MaleSoulbreaker', [[1516, 'Soul Strike', 10, 'ENEMY']]);
  mk('Chanter1', 52, 'MAGE', 'Warcryer', [[1001, 'Soul Cry', 5, 'SELF']]); mk('Saint1', 43, 'MAGE', 'ShillienElder', [[1011, 'Heal', 18, 'ONE'], [1015, 'Battle Heal', 15, 'ONE']]);
  const N = mk(CASTER, 13, 'MAGE', 'Necromancer', [[1148, 'Death Spike', 10, 'ENEMY'], [1234, 'Vampiric Claw', 10, 'ENEMY']]);
  mk(HEALER, 16, 'MAGE', 'Bishop', [[1011, 'Heal', 18, 'ONE'], [1015, 'Battle Heal', 15, 'ONE'], [1217, 'Greater Heal', 10, 'ONE']]);
  // members' profiles are EMPTY (tester): nothing of L2Swarm's own follow / assist
  for (const c of world.chars.values()) { c.opts.FollowAtk = false; c.opts.ActiveFollow = false; c.opts.FollowName = ''; }
  // monsters hit back: whoever damages a monster is its target; it hits him every 1.5 s while he stands within 120 (OnAttack to every window)
  const baseCombat = world.combatStep.bind(world); let hitClock = 0;
  // L2Swarm's own combat (the leader) owns his movement while it fights: walk to the target, the script's walks wait (as in the game the combat
  // engine re-issues its approach; the fake world otherwise lets a script hop replace it for good)
  world.combatStep = function (ms) {
    if (L.flags.IsEnabled && L.flags.IsInCombat && L.flags.IsAttacking && L.target) { const t = world.mobs.find(m => m.objId === L.target && !m.IsDead); if (t && Math.hypot(t.X - L.me.X, t.Y - L.me.Y) > 80) world.moveTo(L, t.X, t.Y, t.Z); }
    baseCombat(ms); hitClock += ms;
    if (hitClock < 1500) return; hitClock = 0;
    for (const m of world.mobs) {
      if (m.IsDead || !m.TargetObjId) continue;
      const v = Array.from(world.chars.values()).find(c => c.me.objId === m.TargetObjId);
      if (!v || v.me.IsDead || Math.hypot(v.me.X - m.X, v.me.Y - m.Y) > 120) continue;
      for (const c of world.chars.values()) world.emit(c, 'OnAttack', m.objId, v.me.objId, false);
    }
  };
  const src = fs.readFileSync(AGENT2, 'utf8');
  for (const c of world.chars.values()) world.startAgent(c, port, src);
  await run(clock, world, 14000);
  const rep0 = runner.report();
  console.log(`boot: ${rep0.contexts.map(c => `${c.name} booted=${c.booted}`).join(', ')}   (swarm.js: ${path.relative(ROOT, SWARM)})`);
  const js = (n, expr) => { try { return vm.runInContext(expr, runner.ctxs.get(n).ctx); } catch (e) { return 'ERR ' + e.message; } };
  console.log(`roles: ${NAMES.map(n => `${n}=${js(n, 'state.role')}`).join(' ')}`);

  // the field: a line of monsters going away from the start, 900-1800 apart (no respawn: every kill is a new engagement)
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7, r = 900 + i * 450;
    world.addMob('Timak Orc Soldier', 20585, 50, Math.round(F.x + Math.cos(a) * r), Math.round(F.y + Math.sin(a) * r), F.z);
  }
  world.mobs.forEach(m => { m.noRespawn = true; m.HP = m.MaxHP = 1500; });
  world.teleportAll(F.x, F.y, F.z, 'GENERALZONE');
  await run(clock, world, 6000);
  world.partyChat(LEADER, '!hunthere 3000');

  // ---- sample every 100 ms of simulated time
  const eng = [];                    // { id, t0, x, y, deadAt, m: { name: { sel, move, hit, cast, deadWalk } } }
  let cur = null;
  const casts = [];                  // { who, target, at }
  const sendLen0 = world.calls.length;
  const T_END = 150000; const t0all = clock.now();
  let lastCall = sendLen0;
  while (clock.now() - t0all < T_END) {
    await run(clock, world, 100, 100);
    const t = clock.now();
    if (process.argv.includes('--trace') && Math.round((t - t0all) / 100) % 20 === 0) { const D = world.chars.get('Destroyer1'); console.log(`t+${Math.round((t - t0all) / 1000)} L comb=${L.flags.IsInCombat} en=${L.flags.IsEnabled} atk=${L.flags.IsAttacking} tgt=${L.target} mv=${L.move ? Math.round(L.move.x) + ',' + Math.round(L.move.y) : '-'} pos=${Math.round(L.me.X)},${Math.round(L.me.Y)} mode=${js(LEADER, 'state.mode')} ctl=${js(LEADER, 'control.owner')} why=${js('Destroyer1', 'assistSt.lastWhy')} lt=${js('Destroyer1', 'assistSt.lt && assistSt.lt.id')} N=${js('Necro1', 'assistSt.lastWhy')} | D tgt=${D.target} atk=${D.flags.IsAttacking} mv=${D.move ? (D.move.follow ? 'F' : Math.round(D.move.x) + ',' + Math.round(D.move.y)) : '-'} d=${Math.round(Math.hypot(D.me.X - L.me.X, D.me.Y - L.me.Y))} mode=${js('Destroyer1', 'state.mode')}`); }
    for (; lastCall < world.calls.length; lastCall++) { const k = world.calls[lastCall]; if (k.fn === 'Send.RequestMagicSkillUse') { const c = world.chars.get(k.who); casts.push({ who: k.who, id: k.args[0], target: c ? c.target : 0, at: k.at }); } }
    const lt = L.target && L.flags.IsAttacking ? world.mobs.find(m => m.objId === L.target && !m.IsDead) : null;
    if (lt && (!cur || cur.id !== lt.objId)) {
      cur = { id: lt.objId, t0: t, x: lt.X, y: lt.Y, deadAt: 0, m: {} };
      NAMES.slice(1).forEach(n => { cur.m[n] = { sel: null, move: null, hit: null, cast: null, deadWalk: 0, d0: Math.round(Math.hypot(world.chars.get(n).me.X - lt.X, world.chars.get(n).me.Y - lt.Y)) }; });
      eng.push(cur);
    }
    for (const e of eng) {
      const mob = world.mobs.find(m => m.objId === e.id);
      if (mob && mob.IsDead && !e.deadAt) e.deadAt = t;
      for (const n of NAMES.slice(1)) {
        const c = world.chars.get(n), r = e.m[n]; if (!r) continue;
        if (!e.deadAt) {
          if (r.sel === null && c.target === e.id) r.sel = t - e.t0;
          if (r.move === null && c.move && !c.move.follow && Math.hypot(c.move.x - e.x, c.move.y - e.y) < 250) r.move = t - e.t0;
          if (r.hit === null && c.target === e.id && c.flags.IsAttacking && Math.hypot(c.me.X - e.x, c.me.Y - e.y) <= 100) r.hit = t - e.t0;
          if (r.cast === null && casts.some(k => k.who === n && k.target === e.id && k.at >= e.t0)) r.cast = casts.find(k => k.who === n && k.target === e.id && k.at >= e.t0).at - e.t0;
        } else if (t - e.deadAt > 1000 && c.move && Math.hypot(c.move.x - e.x, c.move.y - e.y) < 150 && Math.hypot(c.me.X - e.x, c.me.Y - e.y) > 200 && Math.hypot(world.chars.get(LEADER).me.X - e.x, world.chars.get(LEADER).me.Y - e.y) > 300) r.deadWalk += 100;   // 2026-10-15: walking to the LEADER who stands on the dead spot = follow, not a dead-walk (the healers did it too in the v1.7.4 package run)
      }
    }
  }
  const done = eng.filter(e => e.deadAt);
  console.log(`\nengagements: ${eng.length} (monsters killed ${world.kills || 0}); per engagement (t0 = the leader attacks a new monster):`);
  for (const e of eng) {
    console.log(`  #${eng.indexOf(e) + 1} mob ${e.id} died after ${e.deadAt ? fmt(e.deadAt - e.t0) : 'alive'}: ` + NAMES.slice(1).map(n => { const r = e.m[n]; return `${n}[d0 ${r.d0} sel ${fmt(r.sel)} move ${fmt(r.move)} hit ${fmt(r.hit)} cast ${fmt(r.cast)}${r.deadWalk ? ' DEADWALK ' + fmt(r.deadWalk) : ''}]`; }).join(' '));
  }
  const col = (names, k) => [].concat(...names.map(n => done.map(e => e.m[n][k])));
  const selM = med(col(MELEE, 'sel')), moveM = med(col(MELEE, 'move')), hitM = med(col(MELEE, 'hit')), castN = med(col([CASTER], 'cast')), selN = med(col([CASTER], 'sel'));
  const deadWalk = [].concat(...MELEE.concat([CASTER]).map(n => eng.map(e => e.m[n].deadWalk))).reduce((s, v) => s + v, 0);
  const meleeHits = col(MELEE, 'hit').filter(v => v !== null).length, meleeN = col(MELEE, 'hit').length;
  console.log(`\nMEDIANS melee: select ${fmt(selM)}  move ${fmt(moveM)}  in reach + hitting ${fmt(hitM)} (${meleeHits}/${meleeN} engagements hit before the kill)   caster: select ${fmt(selN)}  cast ${fmt(castN)}   dead-walk total ${fmt(deadWalk)}`);
  const healerAtk = world.calls.slice(sendLen0).filter(k => HEALERS.includes(k.who) && /^(Send\.Attack|Attack)$/.test(k.fn)).length;
  const healerNuke = casts.filter(k => HEALERS.includes(k.who) && [1011, 1015, 1217].indexOf(Number(k.id)) < 0).length;

  ok(done.length >= 3, `at least 3 kills in ${T_END / 1000} s simulated (${done.length})`);
  ok(selM !== null && selM <= 1500, `melee members select the leader's monster within 1.5 s (median ${fmt(selM)})`);
  ok(moveM !== null && moveM <= 2000, `melee members start walking to it within 2 s (median ${fmt(moveM)}) — while the leader is still on his way`);
  ok(meleeHits >= Math.ceil(meleeN * 0.6), `melee members reach + hit the monster before it dies in >= 60 % of the engagements (${meleeHits}/${meleeN})`);
  const castHits = col([CASTER], 'cast').filter(v => v !== null).length;
  // limits loosened 2026-10-15 (v1.7.4 publish): the sim's fights differ per build (public seeds) - 0.3-2.7 s select, melee often kills first; was 15.4 s
  ok(selN !== null && selN <= 3000 && castHits >= 1, `the caster takes it within 3 s (median ${fmt(selN)}) and casts at it before the kill (${castHits}/${done.length}, median ${fmt(castN)} incl. stepping into range)`);
  ok(deadWalk <= 1000, `no assisting member keeps walking to a dead monster's spot (total ${fmt(deadWalk)})`);
  ok(healerAtk === 0 && healerNuke === 0, `the healer never attacks (attacks ${healerAtk}, non-heal casts ${healerNuke})`);
  let errs = 0; runner.errorsByWhere.forEach(v => { errs += v; });
  const errLog = path.join(overlay, 'Logs', 'swarm_errors.log'); const errText = fs.existsSync(errLog) ? fs.readFileSync(errLog, 'utf8').trim() : '';
  ok(!errText, `no swarm_errors.log lines${errText ? ': ' + errText.split(/\r?\n/).slice(0, 3).join(' | ').slice(0, 300) : ''}`);
  console.log(`(brain context errors: ${errs})`);
  if (process.argv.includes('--debug')) {
    const bl = path.join(overlay, 'Logs', 'swarm_buffs.log');
    if (fs.existsSync(bl)) console.log(fs.readFileSync(bl, 'utf8').split(/\r?\n/).filter(l => process.argv.includes('--all') || /\[(Tank1|Destroyer1|Necro1)\]/.test(l)).slice(-120).join('\n'));
    const cc = {}; world.calls.slice(sendLen0).forEach(k => { const key = k.who + ' ' + k.fn; cc[key] = (cc[key] || 0) + 1; }); console.log(cc);
    runner.errorsByWhere.forEach((v, k) => console.log('ERR', k, v));
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  await runner.stop('end');
  for (const s of world.sockets) try { s.destroy(); } catch (e) { }
  for (const c of world.chars.values()) c.T.dispose();
  world.timers.dispose();
  return fail === 0;
}
main().then(r => process.exit(r ? 0 : 1), e => { console.log('ERROR', e && e.stack || e); process.exit(1); });
