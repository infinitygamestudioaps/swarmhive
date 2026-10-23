// TEST QUEST ENGINE (2026-10-12): runs the QENGINE-PURE block of a PATCHED swarm.js (patch_questengine.js) in node against REAL quests of
// Scripts/data/quests/<id>.json, with a small L2J-like quest server simulator (transitions / drops / turn-ins of the quest record itself).
//   node docs/plan/tools/test_questengine.js [path to patched swarm.js]   (default Scripts_dev/swarm.js)
// Checks:
//   1. 258 Bring Wolf Pelts (repeatable, drops 40 pelts -> cond 2 -> hand-in), repeat 2: with the quest API (cond readable) AND without it
//      (the engine's own record: 'advance' after the kill step)
//   2. 265 Bonds of Slavery (endless turn-in, drop chance per monster): 3 turn-ins of a batch of 10, adena per item + bonus, never "quit"
//   3. 2 What Women Want (one-time, 5 dialog steps over 4 NPCs, letters given / taken)
//   4. command parsing, quest lookup, eligibility, hunt spots, farm pick (Scripts/data/quest_farm.json), link choice never clicks "quit"
//   5. sweep: qeDecide on every quest record (not started + every cond) never throws; how many start automatically
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const F = process.argv.slice(2).filter(a => !/^--/.test(a))[0] ? path.resolve(process.argv.slice(2).filter(a => !/^--/.test(a))[0]) : path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(F, 'utf8');
const a = src.indexOf('// QENGINE-PURE-BEGIN'), b = src.indexOf('// QENGINE-PURE-END');
if (a < 0 || b < 0) { console.error('QENGINE-PURE block not found in ' + F + ' — apply patch_questengine.js first (or pass the patched copy)'); process.exit(2); }
const E = new Function(src.slice(a, b) + '\nreturn { qeDecide, qeNeeds, qePickLink, qeProgress, qeParseCmd, qeFindQuest, qeEligible, qeHuntSpot, qeRepeatable, qeDefaultBatch, qfPickId, qeIsQuit, qeRaceOfClass, qeTurnIn, QE_REFUSE, qeSysVerdict: typeof qeSysVerdict === "function" ? qeSysVerdict : null, qeBagBlock: typeof qeBagBlock === "function" ? qeBagBlock : null, qePagesExpected: typeof qePagesExpected === "function" ? qePagesExpected : null, qeCondFromItems: typeof qeCondFromItems === "function" ? qeCondFromItems : null, qeStateMerge: typeof qeStateMerge === "function" ? qeStateMerge : null };')();
const QDIR = path.join(ROOT, 'Scripts', 'data', 'quests');
const getQ = (id) => { try { return JSON.parse(fs.readFileSync(path.join(QDIR, String(Number(id)) + '.json'), 'utf8')); } catch (e) { return null; } };
let fails = 0, oks = 0;
const ok = (c, m) => { if (c) { oks++; console.log('  ok   ' + m); } else { fails++; console.log('  FAIL ' + m); } };

// ---------------------------------------------------------------- simulator
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function evalAdena(A, inv, taken) {
  if (A == null) return 0;
  if (typeof A === 'number') return A;
  let sum = 0, cnt = 0;
  (A.perItem || []).forEach(p => (p.items || []).forEach(id => { const n = taken[id] || 0; sum += n * p.each; cnt += n; }));
  if (A.base) sum += A.base;
  if (A.bonus && cnt >= A.bonus.min) sum += A.bonus.adena;
  if (A.amount) sum += A.amount;
  return sum;
}
class Sim {
  constructor(q, seed) { this.q = q; this.started = false; this.cond = 0; this.inv = {}; this.adena = 1000; this.r = rng(seed || 7); this.log = []; this.ended = 0; this.turnins = 0; }
  have(id) { return this.inv[id] || 0; }
  give(id, n) { if (Number(id) === 57) { this.adena += n; return; } this.inv[id] = (this.inv[id] || 0) + n; }
  take(id, n) { const h = this.have(id); const t = n < 0 ? h : Math.min(h, n); this.inv[id] = h - t; return t; }
  met(t) { const T = t.trigger || {}; return (T.needCounts || []).every(x => this.have(x.id) >= x.n) && (T.needItems || []).every(id => this.have(id) > 0); }
  apply(t) {
    const taken = {};
    (t.takes || []).forEach(x => { taken[x.id] = this.take(x.id, x.count); });
    (t.gives || []).forEach(x => this.give(x.id, x.count || 1));
    if (t.adena) this.adena += evalAdena(t.adena, this.inv, taken);
    if (t.to === 'end') { this.started = false; this.cond = 0; this.ended++; this.q.items.filter(i => i.questItem).forEach(i => { this.inv[i.id] = 0; }); }
    else if (typeof t.to === 'number') { this.started = true; this.cond = t.to; }
    this.log.push('t' + t.i + '->' + t.to);
  }
  trs() { return (this.q.transitions || []).map((t, i) => Object.assign({ i }, t)); }
  /** the links the NPC page offers at this moment (event links of applicable transitions + "Quest" + a quit link) */
  page(npc) {
    const L = [{ text: 'Quest', cmd: 'npc_1_Quest' }, { text: 'Say you will quit', cmd: 'Quest QX quit.html' }, { text: 'Back', cmd: 'back' }];
    this.trs().forEach(t => { const T = t.trigger || {}; if (T.type !== 'event' || (T.npcs || []).indexOf(npc) < 0) return;
      (T.links || []).forEach((l, k) => L.push({ text: l, cmd: 'Quest Q' + ('00000' + this.q.id).slice(-5) + '_X ' + ((T.events || [])[k] || (T.events || [])[0] || 'ev') })); });
    return L;
  }
  click(npc, link) {
    if (/quit/i.test(link.text)) { this.log.push('QUIT clicked'); this.quit = true; return; }
    const ev = this.trs().find(t => { const T = t.trigger || {}; return T.type === 'event' && (T.npcs || []).indexOf(npc) >= 0 && ((T.links || []).indexOf(link.text) >= 0 || (T.events || []).some(e => String(link.cmd).endsWith(' ' + e)))
      && (t.start ? !this.started : (this.started && (!(t.from && t.from.length) || t.from.indexOf(this.cond) >= 0))) && this.met(t); });
    if (ev) this.apply(ev);
  }
  talk(npc) {   // the plain onTalk part (after the "Quest" menu link)
    if (!this.started) return;
    const ti = (this.q.rewards && this.q.rewards.turnIns || [])[0];
    const t = this.trs().find(x => (x.trigger || {}).type === 'talk' && (x.trigger.npcs || []).indexOf(npc) >= 0 && !x.start && (!(x.from && x.from.length) || x.from.indexOf(this.cond) >= 0) && this.met(x));
    if (t) { this.apply(t); return; }
    if (ti && (ti.trigger.npcs || []).indexOf(npc) >= 0) {
      const taken = {}; (ti.takes || []).forEach(x => { taken[x.id] = this.take(x.id, x.count); });
      const got = evalAdena(ti.adena, this.inv, taken); if (got > 0) { this.adena += got; this.turnins++; this.log.push('turnin +' + got); }
    }
  }
  kill(mob) {
    (this.q.drops || []).forEach(d => {
      if (!this.started || (d.conds && d.conds.length && d.conds.indexOf(this.cond) < 0)) return;
      const ms = (d.monsters || []).concat(Object.keys(d.chanceByNpc || {}).map(Number));
      if (ms.indexOf(mob) < 0) return;
      const ch = d.chanceByNpc && d.chanceByNpc[mob] != null ? d.chanceByNpc[mob] : (d.chance != null ? d.chance : 100);
      if (this.r() * 100 >= ch) return;
      const amt = Array.isArray(d.amount) ? d.amount[0] : (d.amount || 1);
      const lim = d.limit || 1e9; this.inv[d.item] = Math.min(lim, (this.inv[d.item] || 0) + amt);
    });
    const k = this.trs().find(t => (t.trigger || {}).type === 'kill' && (t.trigger.npcs || []).indexOf(mob) >= 0 && this.started && (!(t.from && t.from.length) || t.from.indexOf(this.cond) >= 0) && this.met(t));
    if (k) this.apply(k);
  }
}
/** the engine loop (same order as qeRun: sense -> decide -> act), driven against the simulator */
function runEngine(q, sim, o) {
  const opt = Object.assign({ api: true, repeat: 1, batch: null, maxSteps: 400 }, o || {});
  const own = { started: false, cond: null };
  let runs = 0, steps = 0, kills = 0, lastKey = '', same = 0, result = '';
  const ids = {}; (q.items || []).forEach(i => { ids[i.id] = 1; }); (q.drops || []).forEach(d => { ids[d.item] = 1; });
  const sense = () => { const have = {}; Object.keys(ids).forEach(k => { have[k] = sim.have(Number(k)); });
    if (opt.api) { own.started = sim.started; own.cond = sim.started ? sim.cond : null; }
    return { started: opt.api ? sim.started : own.started, cond: opt.api ? (sim.started ? sim.cond : null) : own.cond, condKnown: !!opt.api, apiKnown: !!opt.api, have, adena: sim.adena, batch: opt.batch }; };
  const acts = [];
  while (steps++ < opt.maxSteps) {
    const s = sense(), act = E.qeDecide(q, s);
    acts.push(act.act + (act.kind ? ':' + act.kind : '') + (act.npcs ? '@' + act.npcs[0] : ''));
    if (act.act === 'manual') { result = 'manual: ' + act.why; break; }
    if (act.act === 'advance') { own.cond = act.to; continue; }
    if (act.key === lastKey) same++; else { lastKey = act.key; same = 0; }
    if (same >= 4) { result = 'no progress: ' + act.key; break; }
    const before = s;
    if (act.act === 'talk' || act.act === 'turnin') {
      const npc = act.npcs[0];
      const w = { links: act.links, events: act.events, questName: q.name, qkey: 'Q' + ('00000' + q.id).slice(-5), clicked: [], usedMenu: false, allowContinue: act.kind === 'start' };
      let hit = false;
      for (let i = 0; i < 9; i++) {
        const p = E.qePickLink(sim.page(npc), w); if (!p) break;
        if (p.why === 'menu') { w.usedMenu = true; sim.talk(npc); }
        if (p.why === 'event' || p.why === 'text') hit = true;
        w.clicked.push(p.link.cmd + '|' + p.link.text);
        if (p.why !== 'menu') sim.click(npc, p.link);
      }
      const after = sense();
      let prog = E.qeProgress(before, after);
      if (!opt.api) {                                    // the engine's own record (qeDoTalk without the quest API)
        if (act.kind === 'start' && hit) { own.started = true; own.cond = 1; prog = prog || 'start clicked'; }
        else if (prog && act.to !== undefined && act.to !== null && act.to !== 'end') own.cond = act.to;
        if (prog && act.to === 'end') { own.started = false; own.cond = null; }
      }
      const ended = before.started && (opt.api ? !sim.started : act.to === 'end' && !!prog);
      const turnedIn = act.act === 'turnin' && (after.adena > before.adena);
      if (ended || turnedIn) { runs++; if (!E.qeRepeatable(q) || (opt.repeat > 0 && runs >= opt.repeat)) { result = 'done'; break; } }
    } else if (act.act === 'hunt') {
      let n = 0;
      while (n++ < 3000) {
        sim.kill(act.monsters[n % act.monsters.length]); kills++;
        const s1 = sense();
        if (act.cond != null && s1.condKnown && s1.cond !== act.cond) break;
        if ((act.items || []).every(it => (s1.have[it.id] || 0) >= it.n) && (!act.kills || n >= act.kills)) break;
      }
    } else { result = 'unhandled ' + act.act; break; }
  }
  return { runs, kills, result, acts, sim };
}

// ---------------------------------------------------------------- 1. 258 Bring Wolf Pelts
console.log('1. 258 Bring Wolf Pelts (repeatable, drops)');
{
  const q = getQ(258);
  ok(q && E.qeRepeatable(q), 'record loaded, repeatable');
  for (const api of [true, false]) {
    const sim = new Sim(q, 11), r = runEngine(q, sim, { api, repeat: 2 });
    ok(r.result === 'done' && r.runs === 2 && sim.ended === 2, `${api ? 'with' : 'WITHOUT'} the quest API: 2 runs completed (${r.runs} runs, ${r.kills} kills, ${r.result})`);
    ok(!sim.quit, `${api ? 'api' : 'own record'}: never clicked "quit"`);
    ok(r.acts[0] === 'talk:start@30001' && r.acts.indexOf('hunt@undefined') < 0 && r.acts.some(x => /^hunt/.test(x)), 'start talk at Lector, then hunt wolves: ' + r.acts.slice(0, 4).join(' > '));
    if (!api) ok(r.acts.some(x => x === 'advance'), 'own record: the kill step advances the cond itself');
  }
  const spot = E.qeHuntSpot(q, [20120, 20442], { x: -86385, y: 243267 });
  ok(spot && Math.hypot(spot.x + 86385, spot.y - 243267) < 15000, `hunt spot near Talking Island: ${spot && spot.name} at ${spot && [spot.x, spot.y].join(',')}`);
}
// ---------------------------------------------------------------- 2. 265 Bonds of Slavery
console.log('2. 265 Bonds of Slavery (endless turn-in, chance per monster)');
{
  const q = getQ(265), sim = new Sim(q, 5), r = runEngine(q, sim, { api: true, repeat: 3, batch: 10 });
  ok(r.result === 'done' && sim.turnins === 3, `3 turn-ins of 10 shackles (${sim.turnins} turn-ins, ${r.kills} kills, adena ${sim.adena - 1000}, ${r.result})`);
  ok(sim.adena - 1000 === 3 * (10 * 12 + 500), 'adena = 3 x (10 x 12 + 500 bonus) = 1860');
  ok(!sim.quit && sim.started, 'the quest stays open (never "Say you will quit")');
  ok(E.qeDefaultBatch(q) >= 10, 'default batch >= the bonus threshold (' + E.qeDefaultBatch(q) + ')');
  const r2 = runEngine(q, new Sim(q, 9), { api: false, repeat: 2, batch: 10 });
  ok(r2.result === 'done' && r2.runs === 2, 'without the quest API too (' + r2.runs + ' turn-ins)');
}
// ---------------------------------------------------------------- 3. 2 What Women Want
console.log('3. 1 Letters of Love (one-time dialog chain) + 101 Sword of Solidarity (one-time: dialogs + drops + kill step)');
{
  const q = getQ(1);
  for (const api of [true, false]) {
    const sim = new Sim(q, 3), r = runEngine(q, sim, { api, repeat: 5 });
    ok(r.result === 'done' && sim.ended === 1, `1, ${api ? 'api' : 'own record'}: completed once (one-time: repeat ignored) — ${r.acts.join(' > ')}`);
    ok(r.kills === 0, '1: no hunting in a dialog quest');
  }
  const q101 = getQ(101), sim = new Sim(q101, 4), r = runEngine(q101, sim, { api: true });
  ok(r.result === 'done' && sim.ended === 1 && r.kills > 0, `101 with the quest API: completed (${r.kills} kills) — ${r.acts.join(' > ')}`);
  // quest 2's record merges the start and the end event (datapack parse): the engine still offers "Say yes." on the start page
  const a2 = E.qeDecide(getQ(2), { started: false, have: {} });
  ok(a2.act === 'talk' && a2.kind === 'start' && a2.links.length > 0, '2 What Women Want: start talk offers the offer-page link (' + a2.links.join(' / ') + ') although no start transition was parsed');
}
// ---------------------------------------------------------------- 4. pieces
console.log('4. commands, lookup, eligibility, farm pick, links');
{
  const R = ['Tank1', 'Bishop1', 'Crafter1'];
  const p1 = E.qeParseCmd(['!quest', '265', 'repeat', '5', 'solo', 'bishop1'], R);
  ok(p1.sub === 'start' && p1.query === '265' && p1.repeat === 5 && p1.mode === 'solo' && p1.name === 'Bishop1', '!quest 265 repeat 5 solo bishop1 -> ' + JSON.stringify(p1));
  const p2 = E.qeParseCmd(['!quest', 'Bonds', 'of', 'Slavery', 'forever', 'party'], R);
  ok(p2.query === 'Bonds of Slavery' && p2.repeat === 0 && p2.mode === 'party' && !p2.name, '!quest Bonds of Slavery forever party');
  ok(E.qeParseCmd(['!quest', 'stop', 'Tank1'], R).sub === 'stop' && E.qeParseCmd(['!quest', 'stop', 'Tank1'], R).name === 'Tank1', '!quest stop Tank1');
  ok(E.qeParseCmd(['!quest'], R).sub === 'status' && E.qeParseCmd(['!quest', 'status'], R).sub === 'status', '!quest / !quest status');
  ok(!!E.qeParseCmd(['!quest', 'repeat', '3'], R).err, 'no quest given -> error text');
  const idx = JSON.parse(fs.readFileSync(path.join(QDIR, '_index.json'), 'utf8'));
  ok(E.qeFindQuest('265', idx).id === 265 && E.qeFindQuest('Q00265', idx).id === 265, 'lookup by id / Q00265');
  ok(E.qeFindQuest('bonds of slavery', idx).id === 265, 'lookup by name (any case)');
  ok(E.qeFindQuest('wolf pelts', idx).id === 258, 'lookup by part of the name');
  const q265 = getQ(265), q2 = getQ(2);
  const dwarf = { level: 10, classId: 53, className: 'Dwarven Fighter' };
  ok(E.qeRaceOfClass(53) === 'DWARF' && E.qeRaceOfClass(116) === 'ORC' && E.qeRaceOfClass(127) === 'KAMAEL', 'race from class id');
  ok(E.qeEligible(q265, { level: 3, classId: 0 }).ok === false && /level/.test(E.qeEligible(q265, { level: 3, classId: 0 }).why.join()), 'level too low -> not eligible');
  const e2 = E.qeEligible(q2, dwarf);
  ok(e2.ok === ((q2.requirements.races || []).indexOf('DWARF') >= 0 || !(q2.requirements.races || []).length) || !e2.ok, 'race rule evaluated for quest 2 (' + JSON.stringify(q2.requirements.races || q2.requirements.notRaces || []) + ' -> ' + (e2.ok ? 'ok' : e2.why.join('; ')) + ')');
  const farmF = path.join(ROOT, 'Scripts', 'data', 'quest_farm.json');
  if (fs.existsSync(farmF)) {
    const cfg = JSON.parse(fs.readFileSync(farmF, 'utf8'));
    const pick = E.qfPickId(cfg, { name: 'Test', level: 20, classId: 0, className: 'Warrior' }, getQ);
    ok(pick && getQ(pick) && E.qeEligible(getQ(pick), { level: 20, classId: 0, className: 'Warrior' }).ok, 'farm pick for a level-20 human: ' + pick + ' ' + (getQ(pick) || {}).name);
    const elfPick = E.qfPickId(cfg, { name: 'Elfy', level: 20, classId: 18, className: 'Elven Fighter' }, getQ);
    ok(!elfPick || E.qeEligible(getQ(elfPick), { level: 20, classId: 18, className: 'Elven Fighter' }).ok, 'farm pick respects race rules (elf: ' + elfPick + ')');
    ok(E.qfPickId(Object.assign({}, cfg, { override: { Test: 265 } }), { name: 'Test', level: 20 }, getQ) === 265, 'farm override wins');
  } else console.log('  (skip) Scripts/data/quest_farm.json not there yet');
  const L = [{ text: 'Say you will quit', cmd: 'Quest Q00265_X 30357-07.html' }, { text: 'Quest', cmd: 'npc_5_Quest' }];
  ok(E.qePickLink(L, { links: ['Say you will quit'], events: ['30357-07.html'], usedMenu: true }) === null, 'a "quit" link is never clicked, even when asked for');
  ok(E.qeIsQuit('Say you will quit') && !E.qeIsQuit("Say that you'll help."), 'quit detection');
}
// ---------------------------------------------------------------- 4b. server refusals after the "Quest" click (QSYS-2026-10-13)
console.log('4b. server refusals (bag full / too many quests) + the double-click page count');
{
  ok(typeof E.qeSysVerdict === 'function' && typeof E.qeBagBlock === 'function', 'qeSysVerdict / qeBagBlock are in the QENGINE-PURE block');
  if (E.qeSysVerdict) {
    const v = E.qeSysVerdict([{ at: 1, id: 1097, text: '#1097 auto-shots' }, { at: 2, id: 1118, text: "#1118 Unable to process this request until your inventory's weight and slot count are less than 80 percent of capacity." }]);
    ok(v.kind === 'bag' && v.id === 1118, 'system message #1118 after the click = bag full (L2J QuestLink: no page at all)');
    ok(E.qeSysVerdict([{ id: 9999, text: 'You can proceed only when the inventory weight is below 80 percent and the quantity is below 90 percent.' }]).kind === 'bag', 'the #3262 wording is recognised by text too');
    ok(E.qeSysVerdict([{ id: 401, text: '#401 You have too many ongoing quests.' }]).kind === 'quests', '#401 = too many quests');
    ok(E.qeSysVerdict([{ id: 27, text: 'Your casting has been interrupted' }, null]).kind === '' && E.qeSysVerdict([]).kind === '' && E.qeSysVerdict(null).kind === '', 'other / no messages = no verdict');
  }
  if (E.qeBagBlock) {
    ok(/200 of 200/.test(E.qeBagBlock(200, 200, 453832, 10902000)), 'Dagger1 2026-10-13: 200 items of 200 slots -> blocked');
    ok(E.qeBagBlock(72, 80, 0, 0) === '' && /73 of 80/.test(E.qeBagBlock(73, 80, 0, 0)), 'L2J isInventoryUnder90: 72/80 ok, 73/80 blocked');
    ok(E.qeBagBlock(200, 0, 453832, 10902000) === '', 'unknown slot limit + 4 % weight -> no pre-block (the click decides)');
    ok(/weight is 80 %/.test(E.qeBagBlock(10, 0, 800, 1000)) && E.qeBagBlock(10, 0, 799, 1000) === '', 'weight penalty 3 starts at 80 %');
  }
  if (E.qePagesExpected) ok(E.qePagesExpected(true) === 2 && E.qePagesExpected(false) === 1, 'double click: 2 pages when the NPC was my target already, else 1');
  ok(E.QE_REFUSE.test('You have too many quests in progress.') && !E.QE_REFUSE.test('Bring me forty wolf pelts.'), 'QE_REFUSE: the full-quest page refuses, a normal page does not');
}
// ---------------------------------------------------------------- 4c. quest state: API vs bag vs own record (QSTATE-2026-10-13)
console.log('4c. quest state when the quest API is blind (Dagger1 quest 32: false "COMPLETED" after step 2)');
{
  const q32 = getQ(32);
  ok(typeof E.qeCondFromItems === 'function' && typeof E.qeStateMerge === 'function', 'qeCondFromItems / qeStateMerge are in the QENGINE-PURE block');
  if (E.qeCondFromItems && q32) {
    const m = E.qeCondFromItems(q32, { 7165: 1 });
    ok(m.started === true && m.cond === 2, 'quest 32 with the Map (7165) in the bag = started, cond 2 (' + JSON.stringify(m) + ')');
    ok(E.qeCondFromItems(q32, { 7166: 7 }).cond === 3, 'Medicinal Herbs (7166, drop at cond 3) = cond 3');
    ok(E.qeCondFromItems(q32, { 1866: 500, 3031: 500 }).started === null, 'normal items (Suede, Spirit Ore) say nothing');
  }
  if (E.qeStateMerge) {
    const M = E.qeStateMerge;
    ok(M({ started: false, cond: null, known: false }, { started: true, cond: 2, items: [7165] }, { started: false, cond: null, apiSeen: false }).started === true, 'API "not started" + quest item in the bag -> started (blind API)');
    const b2 = M({ started: false, cond: null, known: false }, { started: null, cond: null }, { started: true, cond: 2, apiSeen: false });
    ok(b2.started === true && b2.cond === 2 && b2.blind, 'API never showed the quest + my record says started cond 2 -> started cond 2, blind');
    ok(M({ started: false, cond: null, known: false }, { started: null, cond: null }, { started: true, cond: 4, apiSeen: true }).started === false, 'API showed it before and now not, no quest item -> really gone');
    ok(M({ started: true, cond: 5, known: true }, { started: true, cond: 2 }, { started: true, cond: 3 }).cond === 5, 'a known API cond wins');
    ok(M({ started: true, cond: null, known: false }, { started: true, cond: 2 }, { started: true, cond: 3 }).cond === 3, 'API started without cond: the higher of bag / own record');
    ok(M({ started: null }, { started: null }, { started: false }).started === false && M({ started: null }, { started: true, cond: 2 }, {}).cond === 2, 'no API: bag / own record');
  }
}
// ---------------------------------------------------------------- 5. sweep
console.log('5. sweep over every quest record');
{
  const idx = JSON.parse(fs.readFileSync(path.join(QDIR, '_index.json'), 'utf8'));
  let n = 0, threw = 0, startOk = 0, manualAt = 0, steps = 0; const why = {};
  Object.keys(idx.ids).forEach(id => {
    const q = getQ(id); if (!q) return; n++;
    try {
      const a0 = E.qeDecide(q, { started: false, cond: null, have: {} });
      if (a0.act === 'talk') startOk++; else why[a0.why] = (why[a0.why] || 0) + 1;
      const conds = (q.steps || []).map(s => s.cond).filter(c => c >= 1);
      conds.forEach(c => { steps++; const x = E.qeDecide(q, { started: true, cond: c, condKnown: true, have: {} }); if (x.act === 'manual') manualAt++; });
      if (!conds.length) { steps++; const x = E.qeDecide(q, { started: true, cond: 1, condKnown: true, have: {} }); if (x.act === 'manual') manualAt++; }
    } catch (e) { threw++; if (threw < 4) console.log('    threw on ' + id + ': ' + e.message); }
  });
  ok(threw === 0, `qeDecide never throws (${n} quests)`);
  ok(startOk > n * 0.85, `${startOk}/${n} quests have an automatic start talk (others: ${JSON.stringify(why)})`);
  console.log(`    ${steps - manualAt}/${steps} started cond states have an automatic action (the rest: manual — see docs/plan/quests.md)`);
}
// ---------------------------------------------------------------- QUESTRESUME / QUESTREACH 2026-10-23 (public tester: Fate's Whisper "Reorin: no change
// (Are you the one that woman was talking about? ...)" 4 tries, + "restarting it should check the quest stage ... first level the stage for all chars")
{
  console.log('6. Fate\'s Whisper start chain + party catch-up + re-click after no page');
  const q234 = getQ(234);
  if (q234) {
    const st = E.qeDecide(q234, { started: false });
    const L = (h) => { const o = [], re = /<a\b[^>]*action="bypass\s+(?:-h\s+)?([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi; let m; while ((m = re.exec(h))) o.push({ cmd: m[1], text: m[2] }); return o; };
    // the L2J High Five pages of Maestro Reorin 31002 (01 -> 02 -> 03 -> 04 -> 05 QUEST_ACCEPTED)
    const pages = ['<a action="bypass -h Quest Q00234_FatesWhisper 1">"I am here to ask you to make a weapon for me."</a><a action="bypass -h Quest Q00234_FatesWhisper 31002-003.html">"Why are you a drunk? "</a>',
      '<a action="bypass -h Quest Q00234_FatesWhisper 2">"Why were you thrown out of the guild?"</a>', '<a action="bypass -h Quest Q00234_FatesWhisper 3">"I will restore your honor!"</a>',
      '<a action="bypass -h Quest Q00234_FatesWhisper 4">"I will rescue the soul of your wife!"</a>', '<a action="bypass -h Quest Q00234_FatesWhisper QUEST_ACCEPTED">"I will save the soul of your wife!"</a>'];
    const w = { links: st.links, events: st.events, questName: q234.name, qkey: 'Q00234', clicked: [], usedMenu: false, allowContinue: true };
    const picks = pages.map(h => { const p = E.qePickLink(L(h), w); if (p) w.clicked.push(p.link.cmd + '|' + p.link.text); return p ? p.link.cmd : null; });
    ok(picks.join('|') === 'Quest Q00234_FatesWhisper 1|Quest Q00234_FatesWhisper 2|Quest Q00234_FatesWhisper 3|Quest Q00234_FatesWhisper 4|Quest Q00234_FatesWhisper QUEST_ACCEPTED', '234 start: the link choice walks all 5 Reorin pages to QUEST_ACCEPTED (' + picks.join(' > ') + ')');
  } else ok(false, 'quest 234 data missing');
  const CU = new Function(src.slice(a, b) + '\nreturn typeof qeCatchUpPick === "function" ? qeCatchUpPick : null;')();
  ok(!!CU, 'qeCatchUpPick exists');
  if (CU) {
    const mates = [{ name: 'Bishop1', started: true, cond: 3, act: 'hunt' }, { name: 'Necro1', started: false, cond: null, act: 'talk', talkNpc: 31002 }, { name: 'Mei', started: true, cond: 2, act: 'talk', talkNpc: 30178 }];
    const p1 = CU({ started: true, cond: 3 }, mates, {});
    ok(p1 && p1.name === 'Necro1' && p1.npcId === 31002 && p1.cond === 0, 'catch-up: the member furthest behind (not started) first, at its NPC');
    ok(CU({ started: true, cond: 3 }, mates, { [p1.key]: 2 }).name === 'Mei', 'catch-up: at most 2 tries per member + NPC + stage, then the next one');
    ok(CU({ started: true, cond: 2 }, [mates[2]], {}) === null && CU({ started: false }, mates, {}) === null && CU({ started: true, cond: 5 }, [{ name: 'X', act: 'talk', talkNpc: 1 }], {}) === null, 'catch-up: nobody behind / I have not started / stage unknown = nothing');
  }
  const dlg = src.slice(src.indexOf('async function qeDialog('), src.indexOf('async function qeDoTalk('));
  ok(/await qeStayInFront\(ref\);\s*\/\/ QUESTREACH/.test(dlg) && /lostRetry = 1; await qeStayInFront\(ref, true\);/.test(dlg) && /a\.act !== 'turnin'/.test(dlg), 'qeDialog: in front of the NPC before every quest link; no page = back in front + the same link once more (never a hand-in)');
  ok(/const cu = qeCatchUpPick\(s, qeMatesFresh\(q\)/.test(src) && /started: !!s\.started, need:/.test(src), 'qeRun (party leader) takes members that are behind to their NPC first; members report started + cond');
}
console.log(`\n${fails ? 'FAILED' : 'ALL OK'}: ${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
