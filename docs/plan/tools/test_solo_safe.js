// OFFLINE TEST of the SOLO SAFETY code (2026-10-09, Dagger1 died solo in Sea of Spores area 7). Runs the SOLOSAFE-PURE, ESCPURE and
// MULTISPOT-PURE blocks of Scripts_dev/swarm.js in node with mocks:
//   node docs/plan/tools/test_solo_safe.js        (exit code 1 when a check fails)
// Covers: the flee decision (soloFleeDecide), stuck under attack in the escape machine (escapeRun: CC + another direction + Scroll of Escape
// at once, never "giving up here"), the rogue CC (Switch / Trick, Stun Shot only with a bow), the solo area filter (soloAreaWhy on the REAL
// field_areas.json + solo_areas.json: Sea of Spores 7 refused, safe areas left for lvl 45), faAutoPick with soloWhy, pull discipline
// (soloPullOk), rest check (soloRestOk), and the 24 h death skip (soloDeathMark / soloDeathSkips).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const blk = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b); if (i < 0 || j < i) throw new Error('block not found: ' + a); return src.slice(i, j); };
const S = new Function(blk('// SOLOSAFE-PURE-BEGIN', '// SOLOSAFE-PURE-END') + '\nreturn { SOLOSAFE, soloFleeDecide, soloAreaWhy, soloPullOk, soloRestOk, soloDeathMark, soloDeathSkips };')();
const E = new Function(blk('// ESCPURE-BEGIN', '// ESCPURE-END') + '\nreturn { classifyCC, pickCC, escapeRun };')();
const M = new Function(blk('// MULTISPOT-PURE-BEGIN', '// MULTISPOT-PURE-END') + '\nreturn { faAutoPick, faOff, areaSpotOf };')();
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const C = S.SOLOSAFE;

(async () => {
  // ---- 1) flee decision ------------------------------------------------------------------------------------------------------
  let d = S.soloFleeDecide({ hp: 49, hitAgo: 300, attackers: 3, near: 8, atkHp: 80 }, C);
  check(d.act === 'escape', `incident (HP 49 %, 3 attackers, 8 near) -> escape (${d.why})`);
  d = S.soloFleeDecide({ hp: 45, hitAgo: 300, attackers: 1, near: 4, atkHp: 80 }, C);
  check(d.act === 'escape', 'HP 45 %, 1 attacker but 4 monsters near -> escape');
  d = S.soloFleeDecide({ hp: 45, hitAgo: 300, attackers: 1, near: 1, atkHp: 80 }, C);
  check(d.act === '', `HP 45 %, one monster -> fight on with potions (${d.why})`);
  d = S.soloFleeDecide({ hp: 25, hitAgo: 300, attackers: 1, near: 1, atkHp: 60 }, C);
  check(d.act === 'escape', 'HP 25 %, one healthy monster -> escape');
  d = S.soloFleeDecide({ hp: 25, hitAgo: 300, attackers: 1, near: 1, atkHp: 12 }, C);
  check(d.act === '', 'HP 25 %, the one monster is nearly dead -> finish it');
  d = S.soloFleeDecide({ hp: 20, hitAgo: 9000, attackers: 0, near: 0 }, C);
  check(d.act === '', 'not hit for 9 s -> no escape (the rest loop takes over)');
  d = S.soloFleeDecide({ hp: 30, hitAgo: 100, attackers: 3, near: 5, sinceEsc: 5000 }, C);
  check(d.act === '', 'just escaped 5 s ago -> no second escape at once');

  // ---- 2) stuck under attack in the escape machine ---------------------------------------------------------------------------
  const sk = (Id, Name, o) => Object.assign({ Id, Name, IsActive: true, IsToggle: false, TargetType: 'ENEMY', AbnormalType: '', AbnormalTime: 0, CastRange: 600, HitTime: 1000, MP: 20, AffectScope: 'SINGLE' }, o || {});
  const th = [sk(30, 'Backstab'), sk(263, 'Deadly Blow'), sk(101, 'Stun Shot', { AbnormalType: 'STUN', AbnormalTime: 9 }), sk(12, 'Switch'), sk(106, 'Veil'), sk(111, 'Ultimate Evasion', { TargetType: 'SELF' }), sk(4, 'Dash', { TargetType: 'SELF' })];
  let cc = E.classifyCC(th, null, { weapon: 'DAGGER' });
  check(cc.map(k => k.name).join(',') === 'Switch,Veil' && cc.every(k => k.kind === 'detarget'), `Treasure Hunter with a dagger: Switch, Veil (no Stun Shot) — ${cc.map(k => k.name + ':' + k.kind).join(', ')}`);
  cc = E.classifyCC(th, null, { weapon: 'BOW' });
  check(cc[0].name === 'Stun Shot', 'with a bow: Stun Shot first');

  function world(o) {
    const W = Object.assign({ t: 0, hitAt: 0, soe: 5, soeResults: ['ok'], townResults: [false], moves: [0, 0], log: [], attacking: true, plans: 0 }, o);
    const Est = { cc: {}, steps: [] };
    const io = {
      now: () => W.t, sleep: async (ms) => { W.t += ms; if (W.attacking && W.t - W.hitAt > 1000) W.hitAt = W.t; },
      dead: () => false, mp: () => 300, hp: () => 45,
      attackers: () => W.attacking ? [{ id: 1, n: 'Fighter of Sea of Spores', dist: 80, targetsMe: true, hitMe: true, cc: null }, { id: 2, n: 'Spirit of Sea of Spores', dist: 150, targetsMe: true, hitMe: true, cc: null }] : [],
      lastHitAgo: () => W.t - W.hitAt, ccList: () => E.classifyCC(th, null, { weapon: 'DAGGER' }), ready: () => true,
      castCC: async (k) => { W.t += 1200; W.log.push('cc:' + k.name); return 'resisted'; },
      fleePlan: async (opt) => { W.plans++; W.log.push('plan' + (opt && opt.avoid ? ':avoid' + opt.avoid.length : '')); return { label: 'spot ' + W.plans, x: 100 * W.plans, y: 0, dist: 1200, points: [{ x: 100 * W.plans, y: 0 }] }; },
      walkPlan: async () => { W.t += 3000; const m = W.moves.length ? W.moves.shift() : 0; W.log.push('run:' + m); if (m >= 80) W.attacking = W.escapesOnMove ? false : W.attacking; return m; },
      escBuff: async () => { W.log.push('buff'); return 1; },
      inTown: () => false, town: async () => { W.log.push('town'); return W.townResults.shift() || false; },
      soeCount: () => W.soe, castSoe: async () => { W.t += 20000; const r = W.soeResults.shift() || 'failed'; W.log.push('soe:' + r); return r; },
      selfHeal: async () => { }, leaderNear: () => false, report: (p, t) => Est.steps.push(p + ': ' + t), rescue: () => { },
    };
    return { W, E: Est, io };
  }
  let w = world({ moves: [0, 0] });
  let r = await E.escapeRun(w.io, w.E);
  const L = w.W.log.join(' ');
  check(r === 'soe', `stuck under attack -> Scroll of Escape (${r})`);
  check(/buff .*plan run:0 .*cc:.*plan:avoid1 run:0 .*soe:ok/.test(L), `order: escape buff, run, CC again, another direction (avoid the failed spot), then SoE at once — ${L}`);
  check(!w.W.log.includes('town') && w.W.t < 60000, `no waiting for quiet / no .townname while stuck and hit (${Math.round(w.W.t / 1000)} s)`);
  check(w.E.steps.some(s => /stuck and still being hit/.test(s)) && !w.E.steps.some(s => /giving up/i.test(s)), 'says it is stuck under attack, never "giving up"');
  w = world({ moves: [0, 900], escapesOnMove: true, townResults: [true] });
  r = await E.escapeRun(w.io, w.E);
  check(r === 'town' && w.W.log.includes('plan:avoid1') && !w.W.log.some(x => x.startsWith('soe')), `second direction works -> out, quiet, .townname (${w.W.log.join(' ')} -> ${r})`);

  // ---- 3) solo area filter on the real data ----------------------------------------------------------------------------------
  const FA = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'field_areas.json'), 'utf8'));
  let ST = {}; try { ST = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'solo_areas.json'), 'utf8')).areas || {}; } catch (e) { console.log('(solo_areas.json missing: run node docs/plan/tools/solo_areas.js)'); }
  const byId = {}; FA.regions.forEach(R => R.areas.forEach(a => { byId[a.id] = a; }));
  const sos7 = byId['sea-of-spores-7'];
  let why = S.soloAreaWhy(sos7, ST['sea-of-spores-7'], 45, C);
  check(/raid boss Rotting Tree Repiro/.test(why), `Sea of Spores 7 refused for solo lvl 45: ${why}`);
  why = S.soloAreaWhy(Object.assign({}, sos7, { raidBosses: [] }), Object.assign({}, ST['sea-of-spores-7'], { raidNear: [] }), 45, C);
  check(/too crowded/.test(why), `... and without the raid boss still too crowded: ${why}`);
  why = S.soloAreaWhy(sos7, null, 45, C);
  check(/raid boss/.test(why), `without solo_areas.json the field_areas numbers still refuse it: ${why}`);
  check(/too strong/.test(S.soloAreaWhy({ monsters: [{ level: 48, count: 5, aggressive: false }], area: 1e8 }, null, 45, C)), 'passive lvl 48 monsters at lvl 45 -> too strong');
  check(S.soloAreaWhy({ monsters: [{ level: 46, count: 5, aggressive: false }], area: 1e8 }, null, 45, C) === '', 'max = level + 1 -> fine');
  check(S.soloAreaWhy({ monsters: [{ level: 44, count: 1, aggressive: false }, { level: 40, count: 9, aggressive: false }, { level: 47, count: 1, aggressive: false }], area: 1e8 }, null, 45, C) === '', 'avg 40.7 + 2 <= 45 and max 47 <= 45 + 3 -> fine');
  check(/packs/.test(S.soloAreaWhy({ monsters: [{ level: 40, count: 3, aggressive: true }], area: 1e8 }, { aggr: 3, dens: 0.03, maxPack: 3, raidNear: [], maxLvl: 40, avgLvl: 40 }, 45, C)), 'a pack of 3 aggressive -> refused');
  check(/landing/.test(S.soloAreaWhy({ monsters: [{ level: 40, count: 3, aggressive: true }], area: 1e8 }, { aggr: 3, dens: 0.03, maxPack: 1, landingAggr: 2, raidNear: [], maxLvl: 40, avgLvl: 40 }, 45, C)), 'landing inside 2 aggro ranges -> refused');
  // what is left for Dagger1 (lvl 45, solo picks for lvl 42) with faAutoPick
  const o = { level: 42, teamMax: 45, margin: 6, solo: true, lead: true, pos: { x: 83000, y: 53000 }, wide: false, minPool: 0, maxWalk: 25000, soloWhy: (a) => S.soloAreaWhy(a, ST[a.id], 45, C) };
  const b = M.faAutoPick(FA, o), b0 = M.faAutoPick(FA, Object.assign({}, o, { soloWhy: null }));
  check(!!b && !b.pool.some(a => a.id === 'sea-of-spores-7'), `faAutoPick with the solo filter: ${b ? b.a.id + ' (pool ' + b.pool.map(a => a.id).join(', ') + ')' : 'none'} — never Sea of Spores 7`);
  check(!!b && b.pool.every(a => S.soloAreaWhy(a, ST[a.id], 45, C) === ''), 'every area of the solo pool passes the solo check');
  console.log(`      (without the filter: ${b0 ? b0.a.id + ' pool ' + b0.pool.map(a => a.id).join(', ') : 'none'})`);
  let okN = 0; FA.regions.forEach(R => R.areas.forEach(a => { if (a.reachable && M.faOff(a, 42) <= 3 && !S.soloAreaWhy(a, ST[a.id], 45, C)) okN++; }));
  check(okN >= 5, `${okN} reachable areas (lvl window 42 +3) are safe solo for lvl 45 — enough to level`);
  const sp = M.areaSpotOf({ id: 'sea-of-spores', name: 'Sea of Spores', safeSpots: [] }, sos7, {});
  check(sp.area.raids.length >= 1 && sp.area.raids[0].name === 'Rotting Tree Repiro', 'areaSpotOf carries the raid boss spots (pull discipline)');

  // ---- 4) pull discipline + rest ---------------------------------------------------------------------------------------------
  const t = { id: 1, x: 0, y: 0, z: 0 };
  const mob = (id, x, y, ag, n) => ({ id, x, y, z: 0, ag, dead: false, n: n || 'm' + id });
  check(S.soloPullOk(t, [mob(1, 0, 0, 1000), mob(2, 800, 0, 1000)], {}, C).ok, '1 other aggressive within its aggro range -> attack');
  let pk = S.soloPullOk(t, [mob(1, 0, 0, 1000), mob(2, 800, 0, 1000), mob(3, -900, 0, 1000)], {}, C);
  check(!pk.ok && pk.others.length === 2, `2 others would join -> leave it (${pk.why})`);
  check(S.soloPullOk(t, [mob(2, 800, 0, 0), mob(3, -900, 0, 0), mob(4, 0, 500, 0)], {}, C).ok, 'passive monsters around do not count');
  check(S.soloPullOk(t, [mob(2, 1500, 0, 1000), mob(3, -1600, 0, 1000)], {}, C).ok, 'aggressive ones out of their range (1500/1600 > 1100) -> attack');
  check(!S.soloPullOk(t, [], { raids: [{ x: 300, y: 300, name: 'Rotting Tree Repiro' }] }, C).ok, 'next to a raid boss spot -> never');
  check(S.soloPullOk(t, [mob(2, 800, 0, 1000), Object.assign(mob(3, 500, 0, 1000), { z: 900 })], {}, C).ok, 'one on another floor (dz 900) does not count');
  check(!S.soloRestOk({ x: 0, y: 0, z: 0 }, [mob(2, 1100, 0, 1000)], C.restClear).ok, 'aggressive monster at 1100 -> do not sit');
  check(S.soloRestOk({ x: 0, y: 0, z: 0 }, [mob(2, 1300, 0, 1000), mob(3, 200, 0, 0)], C.restClear).ok, 'aggressive at 1300 + passive at 200 -> sit');

  // ---- 5) death skip -----------------------------------------------------------------------------------------------------
  const now0 = Date.parse('2026-10-09T15:04:51Z');
  let doc = { spots: { 'area:x': { day: '2026-10-09', fails: [], skipUntil: 1 } } };
  const res = S.soloDeathMark(doc, ['area:sea-of-spores-7', 'area:sea-of-spores-7', 'area:sea-of-spores-16'], { by: 'Dagger1', lvl: 45, x: 64360, y: 15960, z: -3600, why: 'died solo', name: 'Sea of Spores: area 7' }, now0, C.deathSkipMs);
  doc = res.doc;
  check(Object.keys(doc.solo).length === 2 && doc.solo['area:sea-of-spores-7'].deaths.length === 1, 'death marks each key once');
  check(doc.spots['area:x'] !== undefined, 'the day skips (spots) are left alone');
  let sk2 = S.soloDeathSkips(doc, now0 + 23 * 3600e3);
  check(sk2['area:sea-of-spores-7'] === now0 + 24 * 3600e3, 'skipped for 24 h');
  sk2 = S.soloDeathSkips(doc, now0 + 25 * 3600e3);
  check(!Object.keys(sk2).length, 'after 24 h free again');
  doc = S.soloDeathMark(doc, ['area:other'], { by: 'Dagger1' }, now0 + 25 * 3600e3, C.deathSkipMs).doc;
  check(!doc.solo['area:sea-of-spores-7'] && !!doc.solo['area:other'], 'old solo entries are dropped on the next write');

  console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
