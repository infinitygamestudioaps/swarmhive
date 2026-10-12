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
    r.g.GetQuestState = hostFn((id) => (Number(id) === 258 && W.qs.started ? { State: W.qs.cond, StateText: 'In progress' } : null));
    r.g.HasQuest = hostFn((id) => Number(id) === 258 && W.qs.started);
    return r;
  }
  later(ms, f) { this.timers.setTimeout(f, ms); }
  page(c, h) { this.pages.push(h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 80)); c.html = h; this.later(150, () => this.emit(c, 'OnNpcHtmlMessage', h)); }
  pelts(c) { const it = c.inv.find(i => i.Id === 702); return it ? it.Count : 0; }
  send(c, k, a) {
    const npc = this.npcs.find(n => n.Id === 30001);
    if (k === 'Action' && npc && Number(a[0]) === npc.objId) {
      if (c.target === npc.objId && Math.hypot(npc.X - c.me.X, npc.Y - c.me.Y) < 200) this.page(c, `<html><body>Lector:<br>Welcome.<br><a action="bypass -h npc_${npc.objId}_Quest">Quest</a><br><a action="bypass -h npc_${npc.objId}_Chat 1">Ask about armor</a></body></html>`);
      return undefined;
    }
    if (k === 'ReqBypassToServer' && npc) {
      const cmd = String(a[0]);
      if (cmd === `npc_${npc.objId}_Quest`) {
        if (!this.qs.started) this.page(c, `<html><body>Trader Lector:<br>I need wolf pelts...<br><a action="bypass -h Quest Q00258_BringWolfPelts 30001-03.html">Say that you'll help.</a><br><a action="bypass -h npc_${npc.objId}_Chat 0">Decline</a></body></html>`);
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
  ok(runner.report().st.errors < 5, `${runner.report().st.errors} context errors after all runs`);
  await runner.stop();
  for (const s of world.sockets) { try { s.destroy(); } catch (e) { } }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e && e.stack || e); process.exit(1); });
