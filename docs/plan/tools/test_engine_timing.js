// TEST ENGINE TIMING (2026-10-12, engine audit #10/#11/#13/#27/#28/#29). Nothing live: no L2Swarm, no game, no real Logs.
// Chain: fake game world (test_brain_host.js World, ClearScript-like host methods) -> agent2.js (vm context) -> TCP -> brain_host runner ->
// a small PROBE brain script (instead of swarm.js) that samples Me.IsCasting / a skill's IsReady / Target every 5 ms of the virtual clock.
// The world models the server: a cast request starts after a 40 ms round trip (IsCasting true, skill on cooldown, OnMagicSkillUse), ends after
// HitTime, the skill is ready after ReuseDelay; Send.Action selects the target after 40 ms (+ OnTargetSelected).
// What is measured (each must hold in EVERY trial, at random tick phases):
//   #29 order pickup     brain Send.* -> the world receives it                       <= 75 ms   (before: 0-125 ms + timer drift)
//   #10 cast end         world IsCasting false -> the brain's Me.IsCasting false     <= 80 ms   (before: 0-250 ms)
//   #27 stale ready      the skill's IsReady read inside the brain's OnMagicSkillUse  false      (before: true for up to 0.5 s)
//   #27 ready edge       world skill ready -> the brain's IsReady true                <= 80 ms   (before: 0-500 ms)
//   #10 learned time     my OnMagicSkillUse -> the brain's cast end ~= HitTime        +-90 ms    (before: HitTime + 0-250 ms)
//   #11 target           world target set -> the brain's Target                       <= 80 ms   (before: 0-250 ms)
//   #13 full report      a resync while a skill cools down keeps the remaining reuse  +-150 ms   (before: Elapsed = ReuseDelay -> remaining 0)
//   #28 level-up         a skill view taken BEFORE a level-up stays live (Level, IsReady flips) (before: frozen old object)
//   guard                an instant skill (IsCasting never true in L2Swarm): the brain's IsCasting is false again within 80 ms (assumption corrected)
//   guard                an OLD agent (Scripts/agent2.js without caps 'assume') against the new brain: nothing is assumed, nothing sticks
//   #28 swarm.js         skillNamed (patch_engine_timing.js) re-reads the skill list within 5 s when a host replaces a skill object
// Usage: node docs/plan/tools/test_engine_timing.js                       (new brain_host + Scripts_dev/agent2.js + patched swarm.js copy)
//        node docs/plan/tools/test_engine_timing.js --before              (the 17:06 originals from Settings/backup/engine_fixes_2026-10-12/timing
//                                                                           + unpatched Scripts_dev/swarm.js: must FAIL)
//        --bh <dir> --agent <file> --swarm <file>  override the pieces; --old-agent <file> the agent for the compatibility part
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const T = require('./test_brain_host.js');
const { World, Clock, ROOT, mkTmp, GIRAN } = T;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? path.resolve(process.argv[i + 1]) : d; };
const BEFORE = process.argv.includes('--before');
const BAK = path.join(ROOT, 'Settings', 'backup', 'engine_fixes_2026-10-12', 'timing');
const BH = arg('--bh', BEFORE ? BAK : path.join(ROOT, 'Dashboard', 'brain_host'));
const AGENT = arg('--agent', BEFORE ? path.join(BAK, 'agent2.js') : path.join(ROOT, 'Scripts_dev', 'agent2.js'));
const OLD_AGENT = arg('--old-agent', path.join(ROOT, 'Scripts', 'agent2.js'));
const SWARM = arg('--swarm', path.join(ROOT, 'Scripts_dev', 'swarm.js'));
const PATCH = path.join(process.env.TEMP || process.env.TMP || '', 'claude', 'C--L2-L2Swarm', '9d69d83a-07bd-4424-92b7-5679277c4b38', 'scratchpad', 'patch_engine_timing.js');
const { Runner } = require(path.join(BH, 'runner.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (c) pass++; else fail++; };
const turn = () => new Promise(r => setImmediate(r));
const PROBE_SRC = `
var PROBE = { ev: [], edges: [], cast: null, rdy: null, tgt: null, rdy0: null, lvl0: null, K0: null, watch: 1177 };
function pr(f, v) { PROBE.edges.push({ t: Date.now(), f: f, v: v }); }
setInterval(function () {
  var c = false; try { c = !!Me.IsCasting; } catch (e) { }
  if (c !== PROBE.cast) { PROBE.cast = c; pr('cast', c); }
  var k = null; try { k = SkillsList.GetItemByID(PROBE.watch); } catch (e) { }
  var r = k ? !!k.IsReady : null; if (r !== PROBE.rdy) { PROBE.rdy = r; pr('rdy', r); }
  var tg = 0; try { tg = Target ? Number(Target.objId) : 0; } catch (e) { }
  if (tg !== PROBE.tgt) { PROBE.tgt = tg; pr('tgt', tg); }
  if (PROBE.K0) { var r0 = !!PROBE.K0.IsReady; if (r0 !== PROBE.rdy0) { PROBE.rdy0 = r0; pr('rdy0', r0); } var l0 = Number(PROBE.K0.Level); if (l0 !== PROBE.lvl0) { PROBE.lvl0 = l0; pr('lvl0', l0); } }
}, 5);
function OnMagicSkillUse(objId, targetId, skillId) {
  if (Number(objId) !== Number(Me.objId)) return;
  var k = null; try { k = SkillsList.GetItemByID(Number(skillId)); } catch (e) { }
  PROBE.ev.push({ t: Date.now(), id: Number(skillId), readyAtEvent: k ? !!k.IsReady : null, castingAtEvent: !!Me.IsCasting });
}
`;

// ------------------------------------------------------------------ the server model on top of World
function serverModel(world, clock, c) {
  const RTT = 40, log = { recv: [], start: [], end: [], ready: [], tgt: [] };
  c.skills.forEach(s => {
    // L2Swarm 3.8.14 L2Skill (IL, reviewed 2026-10-12): ReuseDelay = the length of the CURRENT / LAST cooldown (0 until the first one: set by
    // set_ReuseDelay at the cast, never reset), Elapsed = 0 during a cooldown started by a cast (set_ReuseDelay folds it into C and zeroes it;
    // the tick A(Int64) zeroes it at the end), Progress = the live elapsed. s.Reuse = the server's reuse of the skill (test config).
    s._cd = 0; if (s.Reuse === undefined) s.Reuse = Number(s.ReuseDelay) || 0; s.ReuseDelay = 0;
    Object.defineProperty(s, 'Elapsed', { enumerable: true, configurable: true, get() { return 0; } });
    Object.defineProperty(s, 'Progress', { enumerable: true, configurable: true, get() { return s.IsReady || !s._cd ? Number(s.ReuseDelay) || 0 : Math.min(Number(s.ReuseDelay) || 0, clock.now() - s._cd); } });
  });
  world.onSend = (ch, k, a) => {
    if (ch !== c) return undefined;
    if (k === 'RequestMagicSkillUse') {
      const id = Number(a[0]), s = c.skills.find(x => x.Id === id); log.recv.push({ t: clock.now(), id });
      if (!s || !s.IsReady || c.me.IsCasting) return null;           // refused (on reuse / busy)
      world.timers.setTimeout(() => {
        const inst = !(s.HitTime > 0);
        if (!inst) c.me.IsCasting = true;
        s.ReuseDelay = s.Reuse; s.IsReady = false; s._cd = clock.now(); log.start.push({ t: clock.now(), id });
        world.emit(c, 'OnMagicSkillUse', c.me.objId, c.target || c.me.objId, id);
        if (!inst) world.timers.setTimeout(() => { c.me.IsCasting = false; log.end.push({ t: clock.now(), id }); }, s.HitTime);
        world.timers.setTimeout(() => { s.IsReady = true; s._cd = 0; log.ready.push({ t: clock.now(), id }); }, s.Reuse);
      }, RTT);
      return null;
    }
    if (k === 'Action') {
      const id = Number(a[0]);
      world.timers.setTimeout(() => { c.target = id; log.tgt.push({ t: clock.now(), id }); world.emit(c, 'OnTargetSelected', c.me.objId, id); }, RTT);
      return null;
    }
    return undefined;
  };
  return log;
}

async function chain(agentFile, label) {
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(overlay);
  const probeFile = path.join(tmp, 'probe.js'); fs.writeFileSync(probeFile, PROBE_SRC);
  const port = 21094 + Math.floor(Math.random() * 400);
  const clock = new Clock({ virtual: true, start: Date.now() });
  const runner = new Runner({ port, clock, overlay, isolate: ['Logs'], allow: ['Castor'], logFile: path.join(tmp, 'brain_host.log'), root: ROOT.replace(/\//g, '\\'),
    script: probeFile, source: PROBE_SRC });
  await runner.start();
  const world = new World(clock); world.sockets = new Set();
  const c = world.addChar('Castor', 30, 44, GIRAN.x, GIRAN.y, { leader: true, skills: [[1177, 'Wind Strike', 1, 'ENEMY'], [1050, 'Quick Step', 1, 'SELF'], [1068, 'Might', 1, 'SELF']] });
  const ws = c.skills.find(s => s.Id === 1177); ws.HitTime = 1000; ws.Reuse = 3000;
  const qs = c.skills.find(s => s.Id === 1050); qs.HitTime = 0; qs.Reuse = 2000;
  const mg = c.skills.find(s => s.Id === 1068); mg.HitTime = 0; mg.Reuse = 0;   // no reuse at all: the brain's 'not ready, length unknown' guess must not stick
  world.addMob('Hatar Ratman', 20134, 42, GIRAN.x + 300, GIRAN.y, GIRAN.z); world.addMob('Giant Spider', 20158, 44, GIRAN.x - 300, GIRAN.y, GIRAN.z);
  const log = serverModel(world, clock, c);   // after Reuse is set (serverModel moves ReuseDelay into Reuse; ReuseDelay = 0 until the first cast)
  world.startAgent(c, port, fs.readFileSync(agentFile, 'utf8'));
  const step = async (ms) => { for (let t = 0; t < ms; t += 5) { await clock.advance(5); world.step(5); for (let i = 0; i < 3; i++) await turn(); } };
  await step(3000);
  const C = runner.ctxs.get('Castor');
  const ev = (code) => vm.runInContext(code, C.ctx);
  console.log(`  [${label}] agent ${path.relative(ROOT, agentFile)}: connected=${!!(C && C.link && C.link.connected())}, caps=${JSON.stringify(C && C.hello && C.hello.caps)}`);
  return { runner, world, clock, c, log, C, ev, step, close: async () => { try { for (const s of world.sockets) s.destroy(); } catch (e) { } try { await runner.stop('test'); } catch (e) { } } };
}
const P = (X) => X.ev('PROBE');
const edgeAfter = (X, f, v, t0) => { const e = P(X).edges.find(x => x.f === f && x.v === v && x.t >= t0); return e ? e.t : null; };
const fmt = (a) => a.map(x => (x === null ? 'never' : Math.round(x))).join(', ');

async function partChain() {
  console.log(`\nPART A: timing over the whole chain (brain_host ${path.relative(ROOT, BH) || BH})`);
  const X = await chain(AGENT, 'new');
  const { c, log, clock, step, ev } = X;
  const ws = c.skills.find(s => s.Id === 1177);
  // ---- casts at different tick phases
  const order = [], endLag = [], readyLag = [], learned = [], stale = [];
  for (let i = 0; i < 10; i++) {
    await step(7 + i * 13);                                              // move the request across the agent's tick phase
    const tSend = clock.now(), nEv = P(X).ev.length;
    ev('Send.RequestMagicSkillUse(1177)');
    await step(3500);
    const recv = log.recv.find(r => r.t >= tSend && r.id === 1177), st = log.start.find(r => r.t >= tSend), en = log.end.find(r => r.t >= tSend), rd = log.ready.find(r => r.t >= tSend);
    const pe = P(X).ev.slice(nEv).find(e => e.id === 1177);
    order.push(recv ? recv.t - tSend : null);
    const bEnd = en ? edgeAfter(X, 'cast', false, en.t) : null; endLag.push(bEnd !== null ? bEnd - en.t : null);
    const bRdy = rd ? edgeAfter(X, 'rdy', true, rd.t - 400) : null; readyLag.push(bRdy !== null && rd ? bRdy - rd.t : null);
    learned.push(pe && bEnd !== null ? bEnd - pe.t : null);
    stale.push(pe ? pe.readyAtEvent : 'no event');
  }
  console.log(`   order pickup ms: ${fmt(order)}\n   cast-end lag ms: ${fmt(endLag)}\n   ready-edge lag ms: ${fmt(readyLag)}\n   learned cast ms (HitTime 1000): ${fmt(learned)}\n   IsReady inside my OnMagicSkillUse: ${stale.join(', ')}`);
  ok(order.every(x => x !== null && x <= 75), `#29 order pickup <= 75 ms in every trial (max ${Math.max(...order.map(x => x === null ? 1e9 : x))})`);
  ok(endLag.every(x => x !== null && x <= 80), `#10 cast end seen <= 80 ms after L2Swarm in every trial (max ${Math.max(...endLag.map(x => x === null ? 1e9 : x))})`);
  ok(stale.every(x => x === false), '#27 the cast skill reads NOT ready inside my own OnMagicSkillUse (no stale-ready re-pick)');
  ok(readyLag.every(x => x !== null && x >= -60 && x <= 80), `#27 ready edge seen within -60..80 ms of the real one (${fmt(readyLag)})`);
  ok(learned.every(x => x !== null && Math.abs(x - 1000) <= 90), `#10 learned cast time = HitTime +-90 ms (${fmt(learned)})`);
  // ---- target selection
  const tlag = []; const mobs = X.world.mobs.map(m => m.objId);
  for (let i = 0; i < 8; i++) {
    await step(11 + i * 17);
    const want = mobs[i % 2], t0 = clock.now();
    ev(`Send.Action(${want})`);
    await step(600);
    const ws2 = log.tgt.find(r => r.t >= t0 && r.id === want), b = ws2 ? P(X).edges.find(e => e.f === 'tgt' && e.v === want && e.t >= ws2.t - 1) : null;
    tlag.push(ws2 && b ? b.t - ws2.t : null);
  }
  console.log(`   target lag ms: ${fmt(tlag)}`);
  ok(tlag.every(x => x !== null && x <= 80), `#11 Target follows the server's selection within 80 ms in every trial (max ${Math.max(...tlag.map(x => x === null ? 1e9 : x))})`);
  // ---- #13: a full report (resync) while the skill cools down
  ws.Reuse = 6000; await step(200);
  const t0 = clock.now(); ev('Send.RequestMagicSkillUse(1177)'); await step(2000);
  const st13 = log.start.find(r => r.t >= t0);
  X.C.link.write({ a: 'resync' }); await step(600);
  const r13 = ev(`(function () { var k = SkillsList.GetItemByID(1177); var row = JSON.parse(SkillsList.SnapshotJson()).filter(function (x) { return x.Id === 1177; })[0];
    return { ready: !!k.IsReady, left: Number(k.ReuseDelay) - Number(k.Elapsed), snapReady: row ? row.IsReady : null }; })()`);
  const trueLeft = st13 ? 6000 - (clock.now() - st13.t) : null;
  console.log(`   after resync: ready=${r13.ready}, remaining reuse brain ${Math.round(r13.left)} ms vs real ${trueLeft}, snapshot IsReady=${r13.snapReady}`);
  ok(st13 && !r13.ready && Math.abs(r13.left - trueLeft) <= 150, '#13 a full report keeps the cooldown clock (remaining reuse known, not 0)');
  await step(4500); ws.Reuse = 3000;
  // ---- #28: a view taken before a level-up stays live
  ev('PROBE.K0 = SkillsList.GetItemByID(1177); PROBE.rdy0 = null; PROBE.lvl0 = null; 0');
  ws.Level = 2; await step(1500);
  const t28 = clock.now(); ev('Send.RequestMagicSkillUse(1177)'); await step(3500);
  const st28 = log.start.find(r => r.t >= t28), rd28 = log.ready.find(r => r.t >= t28);
  const lv = P(X).lvl0, f0 = st28 ? edgeAfter(X, 'rdy0', false, st28.t) : null, r0 = rd28 ? edgeAfter(X, 'rdy0', true, rd28.t - 400) : null;
  console.log(`   kept view: Level ${lv}, not-ready ${f0 !== null ? Math.round(f0 - st28.t) + ' ms after the start' : 'never'}, ready ${r0 !== null ? Math.round(r0 - rd28.t) + ' ms after the real one' : 'never'}`);
  ok(lv === 2 && f0 !== null && r0 !== null && f0 - st28.t <= 300 && Math.abs(r0 - rd28.t) <= 300, '#28 a skill view kept from before a level-up shows the new Level and its readiness flips');
  // ---- guard: an instant skill (L2Swarm never shows IsCasting) must not leave the brain casting
  ev('PROBE.watch = 1050; 0'); await step(100);
  const ti = clock.now(); ev('Send.RequestMagicSkillUse(1050)'); await step(2600);
  const sti = log.start.find(r => r.t >= ti && r.id === 1050);
  const castOn = P(X).edges.filter(e => e.f === 'cast' && e.t >= ti), lastOn = castOn.filter(e => e.v === true).pop(), offAfter = lastOn ? P(X).edges.find(e => e.f === 'cast' && e.v === false && e.t >= lastOn.t) : null;
  const stuckMs = lastOn ? (offAfter ? offAfter.t - lastOn.t : Infinity) : 0;
  const ri = sti ? edgeAfter(X, 'rdy', true, sti.t + 1500) : null;
  console.log(`   instant skill: brain IsCasting true for ${stuckMs === Infinity ? 'EVER' : Math.round(stuckMs) + ' ms'}; ready again ${ri !== null ? Math.round(ri - sti.t) + ' ms after the start (reuse 2000)' : 'never'}`);
  ok(sti && stuckMs <= 80 && !ev('Me.IsCasting'), 'guard: an instant skill never leaves the brain\'s Me.IsCasting stuck (corrected within one agent tick)');
  ok(ri !== null && Math.abs(ri - sti.t - 2000) <= 100, 'guard: the instant skill is ready again after its reuse');
  // ---- guard (review): a skill WITHOUT reuse (ReuseDelay stays 0 in L2Swarm): the brain marks it not ready at my cast (length unknown); the
  // agent's next report must make it ready again (never stuck)
  ev('PROBE.watch = 1068; 0'); await step(100);
  const tz = clock.now(); ev('Send.RequestMagicSkillUse(1068)'); await step(1500);
  const stz = log.start.find(r => r.t >= tz && r.id === 1068), offz = stz ? edgeAfter(X, 'rdy', false, stz.t) : null, onz = offz !== null ? edgeAfter(X, 'rdy', true, offz) : null;
  console.log(`   no-reuse skill: brain not ready ${offz === null ? 'never' : Math.round(offz - stz.t) + ' ms after the start'}, ready again ${onz === null ? 'NEVER' : Math.round(onz - stz.t) + ' ms after the start'}`);
  ok(stz && ev('SkillsList.GetItemByID(1068).IsReady') === true && (offz === null || (onz !== null && onz - stz.t <= 400)), 'guard: a skill without reuse is ready again within one report (the unknown-length guess does not stick)');
  const st = X.runner.report ? X.runner.report().st : {};
  console.log(`   traffic: ${st.stateMsgs} state messages, ${Math.round((st.stateBytes || 0) / 1024)} KB, ${st.errors} errors`);
  await X.close();
}

async function partOldAgent() {
  console.log('\nPART B: an OLD agent (no caps \'assume\') against this brain');
  if (!fs.existsSync(OLD_AGENT)) { console.log('   (no old agent file, skipped)'); return; }
  const src = fs.readFileSync(OLD_AGENT, 'utf8');
  if (/caps: \[[^\]]*'assume'/.test(src)) { console.log('   (the given old agent already says \'assume\': skipped)'); return; }
  const X = await chain(OLD_AGENT, 'old');
  const ti = X.clock.now(); X.ev('PROBE.watch = 1050; 0'); X.ev('Send.RequestMagicSkillUse(1050)'); await X.step(2600);
  const atEv = P(X).ev.filter(e => e.t >= ti && e.id === 1050)[0];
  ok(atEv && atEv.castingAtEvent === false && !X.ev('Me.IsCasting'), 'old agent: the brain assumes nothing at my OnMagicSkillUse (IsCasting not pre-set, nothing to stick)');
  X.ev('PROBE.watch = 1177; 0'); await X.step(100);
  const t1 = X.clock.now(); X.ev('Send.RequestMagicSkillUse(1177)'); await X.step(3600);
  const en = X.log.end.find(r => r.t >= t1), bEnd = en ? edgeAfter(X, 'cast', false, en.t) : null, rd = X.log.ready.find(r => r.t >= t1), bRdy = rd ? edgeAfter(X, 'rdy', true, rd.t - 400) : null;
  ok(bEnd !== null && bRdy !== null && !X.ev('Me.IsCasting'), `old agent: casting and readiness still end in the brain (cast end +${bEnd !== null ? Math.round(bEnd - en.t) : '?'} ms, ready ${bRdy !== null ? Math.round(bRdy - rd.t) : '?'} ms)`);
  await X.close();
}

// PART D (review 2026-10-12): every host function the 17:06 agent forwarded (FN table) is still callable in the agent under test.
// (A later edit had pushed 'GoToNpc: (n) => GoToNpc(n),' behind a // comment on the InvSync line: the brain's GoToNpc came back 'unknown'.)
function partFnTable() {
  console.log('\nPART D: agent FN table (forwarded host functions)');
  const keys = (file) => { const src = fs.readFileSync(file, 'utf8'), i = src.indexOf('const FN = {'), j = src.indexOf('\n};', i);
    if (i < 0 || j < 0) return null; const body = src.slice(i, j).split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    const out = new Set(); let m; const re = /(?:^|[{,\s])([A-Za-z_]\w*):\s*\(/g; while ((m = re.exec(body))) out.add(m[1]); return out; };
  // the 17:06 backup only exists on the dev install; elsewhere its FN table (pinned here, 2026-10-13) is the reference
  const PINNED = ['StartCombat', 'StopCombat', 'EnableBot', 'DisableBot', 'Attack', 'RunCommand', 'ClickLink', 'LoadCombatMap', 'SetCombatRange', 'UseItem', 'MoveToPoint', 'MoveToNpc', 'GoToPoint', 'GoToNpc', 'FindPath', 'Select', 'Login', 'Logout', 'Say', 'Shout', 'Tell', 'SayToParty', 'SayToClan', 'SayToTrade', 'SayToAlly', 'BuyItem', 'SetCombatSquareZone', 'SetCombatSquareZoneOrigin', 'SetCombatSquareZoneRange', 'UseCombatSquareZone', 'SetCombatPolygonJson', 'SetCombatPolygonOuterPointsJson', 'SetCombatPolygonInnerPolygonsJson', 'UseCombatPolygon', 'ClearCombatPolygon', 'SetCombatPathCsv', 'UseCombatPath', 'ClearCombatPath', 'LoadCombatPath', 'AddCombatPathPoint', 'RemoveCombatPathPoint', 'MoveCombatPathPoint', 'UpdateCombatPathPoint', 'SaveCombatPath'];
  const bakF = path.join(BAK, 'agent2.js');
  const was = fs.existsSync(bakF) ? keys(bakF) : new Set(PINNED), now = keys(AGENT);
  const lost = was && now ? Array.from(was).filter(k => !now.has(k)) : ['(FN table not found)'];
  ok(lost.length === 0, `every FN entry of the 17:06 agent still exists in ${path.relative(ROOT, AGENT)}${lost.length ? ' (lost: ' + lost.join(', ') + ')' : ''}`);
}

function partSwarm() {
  console.log('\nPART C: swarm.js skillNamed (patch_engine_timing.js)');
  let src = fs.readFileSync(SWARM, 'utf8'), what = path.relative(ROOT, SWARM);
  if (!BEFORE && src.indexOf('TIMING (2026-10-12, engine audit #28)') < 0) {
    const tmp = path.join(mkTmp(), 'swarm.js'); fs.writeFileSync(tmp, src);
    const r = cp.spawnSync(process.execPath, [PATCH, tmp], { encoding: 'utf8' }); if (r.status !== 0) { ok(false, 'patch_engine_timing.js applies: ' + (r.stdout || r.stderr)); return; }
    src = fs.readFileSync(tmp, 'utf8'); what = 'a patched copy (the patch is not applied to Scripts_dev yet)';
  }
  const i = src.indexOf('const skillNamed = (() =>'), j = src.indexOf('})();', i);
  if (i < 0 || j < 0) { ok(false, 'skillNamed found in ' + what); return; }
  let t = 1000000;
  const objs = [{ Id: 176, Name: 'Frenzy', Level: 1, IsReady: true }];
  const g = { now: () => t, num: (v) => Number(v) || 0, SkillsList: { get Count() { return objs.length; }, forEach(cb) { objs.slice().forEach(cb); } } };
  vm.createContext(g); vm.runInContext(src.slice(i, j + 5) + '\nthis.skillNamed = skillNamed;', g);
  const a = g.skillNamed('Frenzy');
  objs[0] = { Id: 176, Name: 'Frenzy', Level: 2, IsReady: false };       // a level-up: same count, a NEW host object
  t += 6000;
  const b = g.skillNamed('Frenzy');
  console.log(`   ${what}: before the level-up Level ${a && a.Level}, 6 s after it Level ${b && b.Level} IsReady ${b && b.IsReady}`);
  ok(b && b.Level === 2 && b.IsReady === false, '#28 skillNamed re-reads the skill list within 5 s when a host hands out a new skill object');
}

(async () => {
  console.log(`TEST ENGINE TIMING${BEFORE ? ' (--before: the originals, must FAIL)' : ''}\n  brain_host ${BH}\n  agent ${AGENT}`);
  await partChain();
  if (!BEFORE) await partOldAgent();
  partSwarm();
  partFnTable();
  console.log(`\n${pass} ok, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e && e.stack || e); process.exit(1); });
