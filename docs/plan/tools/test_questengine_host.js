// TEST QUEST ENGINE HOST (2026-10-12) — QUEST ENGINE SMOKE (brain host simulation, nothing live): a patched swarm.js copy runs in Dashboard/brain_host (like the live engine for
// 10 characters) for Crafter1 alone. A fake Lector (30001) next to him in Giran with L2J-like pages, 4 Wolves (20120) 600-1200 away, each
// kill gives 10 Wolf Pelts (702) while cond 1; 40 pelts -> cond 2; talking with 40 -> 3000 adena, quest gone (repeatable).
//   node docs/plan/tools/test_questengine_host.js [patched swarm.js]   (default Scripts_dev/swarm.js; needs patch_questengine.js applied)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const T = require(path.join(ROOT, 'docs', 'plan', 'tools', 'test_brain_host.js'));
const { World, Runner, Clock, run, mkTmp, GIRAN, hostFn } = T;
const SCRIPT = process.argv.slice(2).filter(a => !/^--/.test(a))[0] ? path.resolve(process.argv.slice(2).filter(a => !/^--/.test(a))[0]) : path.join(ROOT, 'Scripts_dev', 'swarm.js');
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (c) pass++; else fail++; };

class QWorld extends World {
  constructor(clock) { super(clock); this.qs = { started: false, cond: 0, runs: 0 }; this.pages = []; this.onSend = (c, k, a) => this.send(c, k, a); }
  hostFor(c, port) {
    const r = super.hostFor(c, port), W = this;
    r.g.GetQuestState = hostFn((id) => (Number(id) === 258 && W.qs.started && !W.apiBlind ? { State: W.qs.cond, StateText: 'In progress' } : null));   // apiBlind: QSTATE-2026-10-13
    r.g.HasQuest = hostFn((id) => Number(id) === 258 && W.qs.started && !W.apiBlind);
    return r;
  }
  later(ms, f) { this.timers.setTimeout(f, ms); }
  page(c, h, ms) { this.pages.push(h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 80)); c.html = h; this.later(ms || 150, () => this.emit(c, 'OnNpcHtmlMessage', h)); }
  // QSYS-2026-10-13 scenarios: lag = [odd front page, even front page, quest answer] delays (ms); bagFull = L2J QuestLink: system message #1118, NO page
  lagMs(kind) { const L = this.lag; if (!L) return 150; if (kind === 'front') { this.fronts = (this.fronts || 0) + 1; return this.fronts % 2 ? L[0] : L[1]; } return L[2]; }
  pelts(c) { const it = c.inv.find(i => i.Id === 702); return it ? it.Count : 0; }
  send(c, k, a) {
    const npc = this.npcs.find(n => n.Id === 30001);
    if (k === 'Action' && npc && Number(a[0]) === npc.objId) {
      if (c.target === npc.objId && Math.hypot(npc.X - c.me.X, npc.Y - c.me.Y) < 200) this.page(c, `<html><body>Lector:<br>Welcome.<br><a action="bypass -h npc_${npc.objId}_Quest">Quest</a><br><a action="bypass -h npc_${npc.objId}_Chat 1">Ask about armor</a></body></html>`, this.lagMs('front'));
      return undefined;
    }
    if (k === 'ReqBypassToServer' && npc) {
      const cmd = String(a[0]);
      if (cmd === `npc_${npc.objId}_Quest`) {
        this.questClicks = (this.questClicks || 0) + 1;
        if (this.bagFull) { this.later(400, () => this.emit(c, 'OnSystemMessage', 1118, { text: "Unable to process this request until your inventory's weight and slot count are less than 80 percent of capacity." })); return null; }
        if (!this.qs.started) this.page(c, `<html><body>Trader Lector:<br>I need wolf pelts...<br><a action="bypass -h Quest Q00258_BringWolfPelts 30001-03.html">Say that you'll help.</a><br><a action="bypass -h npc_${npc.objId}_Chat 0">Decline</a></body></html>`, this.lagMs('answer'));
        else if (this.pelts(c) >= 40) {
          const it = c.inv.find(i => i.Id === 702); c.inv.splice(c.inv.indexOf(it), 1);
          const ad = c.inv.find(i => i.Id === 57); ad.Count += 3000; this.qs = { started: false, cond: 0, runs: this.qs.runs + 1 };
          this.emit(c, 'OnInventoryUpdate'); this.page(c, '<html><body>Trader Lector:<br>Thank you! Here is your reward.</body></html>');
        } else this.page(c, '<html><body>Trader Lector:<br>Bring me forty wolf pelts.</body></html>');
        return null;
      }
      if (/Q00258_BringWolfPelts 30001-03\.html$/.test(cmd)) { this.qs.started = true; this.qs.cond = 1; this.page(c, '<html><body>Trader Lector:<br>Hunt wolves and bring me their pelts.</body></html>'); return null; }
      return null;
    }
    return undefined;
  }
  combatStep(ms) {
    const k0 = this.kills || 0; super.combatStep(ms);
    if ((this.kills || 0) > k0 && this.qs.started && this.qs.cond === 1) {
      const c = this.chars.get('Crafter1'); let it = c.inv.find(i => i.Id === 702);
      if (!it) { it = { objId: 0x31000001, Id: 702, Name: 'Wolf Pelt', Count: 0, IsEquiped: false, IsQuest: true, IsStackable: true, EnchantLvl: 0, Type: 'Etc', Grade: 'None' }; c.inv.push(it); }
      it.Count = Math.min(40, it.Count + 10 * ((this.kills || 0) - k0)); if (it.Count >= 40) this.qs.cond = 2;
      this.emit(c, 'OnInventoryUpdate');
    }
  }
}
(async () => {
  const tmp = mkTmp(), overlay = path.join(tmp, 'overlay'); fs.mkdirSync(overlay);
  const port = 20094 + Math.floor(Math.random() * 400), clock = new Clock({ virtual: true, start: Date.now() }), names = ['Crafter1'];
  const runner = new Runner({ port, clock, overlay, isolate: ['Logs'], allow: names, logFile: path.join(tmp, 'brain_host.log'), root: ROOT.replace(/\//g, '\\'), geopath: true, script: SCRIPT });
  T.setCur(runner); await runner.start();
  const world = new QWorld(clock); world.sockets = new Set();
  world.addNpc('Lector', 30001, GIRAN.x + 120, GIRAN.y + 60, GIRAN.z, 'Weapon Merchant');
  [[700, 300], [900, -400], [-800, 600], [1100, 500]].forEach(([dx, dy]) => world.addMob('Wolf', 20120, 4, GIRAN.x + dx, GIRAN.y + dy, GIRAN.z));
  world.addChar('Crafter1', 57, 45, GIRAN.x, GIRAN.y, { leader: true, skills: [[1216, 'Self Heal', 1, 'SELF'], [255, 'Power Smash', 10, 'ENEMY']] });
  const src = fs.readFileSync(T.AGENT2, 'utf8'); for (const c of world.chars.values()) world.startAgent(c, port, src);
  await run(clock, world, 15000);
  ok(runner.report().contexts.every(c => c.booted), 'swarm.js (patched) booted for Crafter1');
  world.partyChat('Crafter1', '!quest 258 solo Crafter1');
  const stF = path.join(overlay, 'Logs', 'quest_state_Crafter1.json');
  let st = null, phases = new Set();
  for (let i = 0; i < 600 && !(st && st.active && /^(done|failed|stopped|cannot)$/.test(st.active.phase)); i++) {
    await run(clock, world, 1000);
    try { st = JSON.parse(fs.readFileSync(stF, 'utf8')); if (st.active) phases.add(st.active.phase); } catch (e) { }
  }
  const rep = runner.report();
  console.log('   phases: ' + [...phases].join(' > ') + ' · pages: ' + world.pages.length + ' · kills ' + (world.kills || 0) + ' · server runs ' + world.qs.runs);
  console.log('   log: ' + ((st && st.log) || []).map(l => l.msg).slice(-12).join(' | '));
  ok(world.qs.runs === 1, 'the fake server saw the quest completed once');
  ok(st && st.active && st.active.phase === 'done' && st.quests['258'] && st.quests['258'].runs === 1, 'quest_state_Crafter1.json: phase done, 1 run (' + (st && st.active && st.active.phase + ' ' + st.active.msg) + ')');
  ok(st && st.quests['258'] && st.quests['258'].adena === 3000, 'adena earned recorded (3000)');
  ok(phases.has('hunt') && phases.has('talk'), 'went through talk + hunt phases');
  ok(rep.st.errors < 5, `${rep.st.errors} context errors`);
  // stop / status commands do not throw
  world.partyChat('Crafter1', '!quest status'); world.partyChat('Crafter1', '!questfarm'); await run(clock, world, 3000);
  ok(world.chat.some(m => /\[quest\] Crafter1: no quest running/.test(m.text)) || world.chat.some(m => /\[quest\]/.test(m.text)), '!quest status answered: ' + (world.chat.filter(m => /\[quest/.test(m.text)).map(m => m.text).slice(-2).join(' / ')));
  // repeat 2 (by name), then a stop in the middle of a third run
  const readSt = () => { try { return JSON.parse(fs.readFileSync(stF, 'utf8')); } catch (e) { return null; } };
  world.partyChat('Crafter1', '!quest Bring Wolf Pelts repeat 2 crafter1');
  for (let i = 0; i < 900; i++) { await run(clock, world, 1000); st = readSt(); if (st && st.active && st.active.runs >= 2 && /^(done|failed|stopped)$/.test(st.active.phase)) break; }
  ok(world.qs.runs === 3 && st.active.phase === 'done' && st.active.runs === 2 && st.quests['258'].runs === 3, `repeat 2 by name: 2 more runs (server ${world.qs.runs}, state ${st.active.phase} ${st.active.runs}, total ${st.quests['258'].runs})`);
  world.partyChat('Crafter1', '!quest 258 forever');
  for (let i = 0; i < 120; i++) { await run(clock, world, 1000); st = readSt(); if (st && st.active && st.active.phase === 'hunt') break; }
  world.partyChat('Crafter1', '!quest stop');
  for (let i = 0; i < 60; i++) { await run(clock, world, 1000); st = readSt(); if (st && st.active && st.active.phase === 'stopped') break; }
  ok(st && st.active.phase === 'stopped' && st.quests['258'].status === 'stopped', '!quest stop during the hunt -> stopped (' + (st && st.active.phase) + ')');
  // ---- QSYS-2026-10-13 (Dagger1 quest 32/40): lag — the NPC is my target already, so BOTH clicks of openNpc bring the front page, the 2nd one 3 s late,
  // and the quest window comes 4 s after the click: the engine must not take the late copy as the answer ("same page", re-click)
  const lector = world.npcs.find(n => n.Id === 30001), F = world.chars.get('Crafter1');
  const logF = path.join(overlay, 'Logs', 'quest_engine.log'), logLen = () => { try { return fs.readFileSync(logF, 'utf8').length; } catch (e) { return 0; } };
  world.qs = { started: false, cond: 0, runs: world.qs.runs }; F.move = null; F.me.X = lector.X - 60; F.me.Y = lector.Y; F.target = lector.objId;
  world.lag = [300, 3000, 4000]; world.fronts = 0; await run(clock, world, 3000); let l0 = logLen();   // 3 s: the quest list mirror catches up with the reset
  world.partyChat('Crafter1', '!quest 258');
  for (let i = 0; i < 120 && !world.qs.started; i++) await run(clock, world, 1000);
  await run(clock, world, 2000);
  let added = fs.readFileSync(logF, 'utf8').slice(l0);
  ok(world.qs.started, 'lag (2nd front page 3 s late, quest window 4 s late): the quest started'); if (!world.qs.started) console.log('   lag log: ' + added.trim().split('\n').join(' | ') + ' · pages ' + world.pages.slice(-6).join(' / ') + ' · state ' + JSON.stringify((readSt() || {}).active || {}).slice(0, 400) + ' · me ' + Math.round(F.me.X - lector.X) + ',' + Math.round(F.me.Y - lector.Y) + ' · intent ' + (() => { try { return fs.readFileSync(path.join(overlay, 'Logs', 'intent_Crafter1.log'), 'utf8').trim().split('\n').slice(-4).join(' | '); } catch (e) { return '-'; } })());
  ok(!/same page after/.test(added), 'lag: the late copy of the front page was not taken as the answer (no "same page" re-click)' + (/same page after/.test(added) ? ' — ' + added.split('\n').filter(l => /same page/.test(l)).join(' | ') : ''));
  world.partyChat('Crafter1', '!quest stop');
  for (let i = 0; i < 60; i++) { await run(clock, world, 1000); st = readSt(); if (st && st.active && /^(stopped|failed|done)$/.test(st.active.phase)) break; }
  world.lag = null;
  // ---- bag full: the server answers "Quest" with system message #1118 and NO page (L2J QuestLink.showQuestWindow) -> one click, a clear reason, no 4 tries
  world.qs = { started: false, cond: 0, runs: world.qs.runs }; world.bagFull = true; world.questClicks = 0; F.move = null; F.me.X = lector.X - 60; F.me.Y = lector.Y; await run(clock, world, 3000);
  l0 = logLen(); const t0 = clock.now();
  world.partyChat('Crafter1', '!quest 258');
  for (let i = 0; i < 300; i++) { await run(clock, world, 1000); st = readSt(); if (st && st.active && /^(done|failed|stopped|cannot)$/.test(st.active.phase) && clock.now() - t0 > 3000) break; }
  added = fs.readFileSync(logF, 'utf8').slice(l0);
  ok(st && st.active.phase === 'failed' && /bag too full/.test(st.active.msg || ''), 'bag full: the run failed with the reason (' + (st && st.active.phase) + ': ' + String(st && st.active.msg).slice(0, 120) + ')');
  ok(world.questClicks === 1, 'bag full: "Quest" clicked once, no retries (' + world.questClicks + ' clicks, ' + Math.round((clock.now() - t0) / 1000) + ' s)');
  ok(!/no progress after/.test(added) && /#1118/.test(added), 'bag full: the server message is in quest_engine.log, no "no progress after 4 tries"');
  ok(st && st.bagBlock && st.bagBlock.count >= 1, 'bag full: the refusal is remembered (' + JSON.stringify(st && st.bagBlock && { count: st.bagBlock.count, wPct: st.bagBlock.wPct }) + ')');
  // the next start with the same bag is refused before any trip; a smaller bag tries again
  world.questClicks = 0; l0 = logLen();
  world.partyChat('Crafter1', '!quest 258');
  await run(clock, world, 5000);
  added = fs.readFileSync(logF, 'utf8').slice(l0);
  ok(/not started — the bag holds/.test(added) && world.questClicks === 0, 'same bag again: refused before travelling (' + added.trim().split('\n').slice(-1)[0].slice(0, 160) + ')');
  world.bagFull = false; F.inv = F.inv.filter(it => it.Id === 57 || it.IsEquiped); world.emit(F, 'OnInventoryUpdate'); await run(clock, world, 2000);
  world.partyChat('Crafter1', '!quest 258');
  for (let i = 0; i < 120 && !world.qs.started; i++) await run(clock, world, 1000);
  ok(world.qs.started && world.questClicks >= 1, 'room made in the bag: the quest starts again (' + world.questClicks + ' click)');
  world.partyChat('Crafter1', '!quest stop'); await run(clock, world, 5000);
  // ---- QSTATE-2026-10-13 (Dagger1 quest 32): the quest API never shows the quest (the brain host on 2026-10-13) -> the engine goes by its own record
  // and the bag; no false "quest ended" after the 20 s start grace; COMPLETED exactly once, when the end talk really ends it
  { const F2 = world.chars.get('Crafter1'), L2 = world.npcs.find(n => n.Id === 30001);
    world.qs = { started: false, cond: 0, runs: world.qs.runs }; world.apiBlind = true; F2.move = null; F2.me.X = L2.X - 60; F2.me.Y = L2.Y;
    await run(clock, world, 3000);
    const runs0 = world.qs.runs, l0b = (() => { try { return fs.readFileSync(path.join(overlay, 'Logs', 'quest_engine.log'), 'utf8').length; } catch (e) { return 0; } })();
    const st0 = readSt(), done0 = st0 && st0.quests['258'] ? st0.quests['258'].runs : 0;
    world.partyChat('Crafter1', '!quest 258');
    for (let i = 0; i < 900; i++) { await run(clock, world, 1000); st = readSt(); if (st && st.active && /^(done|failed|stopped|cannot)$/.test(st.active.phase) && i > 5) break; }
    const addedB = fs.readFileSync(path.join(overlay, 'Logs', 'quest_engine.log'), 'utf8').slice(l0b);
    ok(world.qs.runs === runs0 + 1 && st.active.phase === 'done' && st.quests['258'].runs === done0 + 1, 'blind quest API: the quest ran to its real end once (server ' + (world.qs.runs - runs0) + ' completion, state ' + st.active.phase + ' ' + String(st.active.msg || '').slice(0, 80) + ')');
    ok(!/talk \(step\): quest ended|talk \(start\): refused/.test(addedB), 'blind quest API: no false "quest ended" and no second start talk' + (/quest ended|refused/.test(addedB) ? ' — ' + addedB.trim().split('\n').slice(-8).join(' | ') : ''));
    world.apiBlind = false; }
  ok(runner.report().st.errors < 5, `${runner.report().st.errors} context errors after all runs`);
  await runner.stop();
  for (const s of world.sockets) { try { s.destroy(); } catch (e) { } }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e && e.stack || e); process.exit(1); });
