// OFFLINE TEST of VITALITY-2026-10-21 (Gift of Vitality in supply runs; docs: AUTOMATION_LOG 2026-10-21 "Gift of Vitality").
//   node docs/plan/tools/test_vitality.js        (exit code 1 when a check fails)
// 1) VITALITY-PURE of Scripts_dev/swarm.js: vitWanted (threshold, reuse, your order), vitAnswer (success / refusal / wait parsing), vitPickNpc
// 2) vitalityMine on stubs: walks to the priest, clicks the gift link by text, saves the reuse time, refuses outside Giran, event over
// 3) wiring: party switch 'vitality' in swarm.js + the dashboard API (same order), the supply-run step, the team step, !vitality, the catalog
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0, passes = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (c) passes++; else fails++; };
const block = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i); if (i < 0 || j < 0) throw new Error('block not found: ' + a); return SRC.slice(i, j); };
const PURE = block('// ==== VITALITY-PURE start', '// ==== VITALITY-PURE end');
const P = new Function(PURE + '\nreturn { VIT, vitWanted, vitAnswer, vitPickNpc };')();
const H = 3600000, T = Date.parse('2026-10-21T18:00:00Z');

console.log('1) decisions');
ok(P.vitWanted(5000, {}, T).go === true, 'below level 4 (5000 points), never taken -> go');
ok(P.vitWanted(18000, {}, T).go === false && /level 4/.test(P.vitWanted(18000, {}, T).why), 'level 4 already (18000) -> stay, says why');
ok(P.vitWanted(NaN, {}, T).go === true, 'vitality unknown -> go (the gift is free)');
ok(P.vitWanted(5000, { nextAt: T + H }, T).go === false, 'reuse time not over -> stay');
ok(P.vitWanted(5000, { nextAt: T - 1 }, T).go === true, 'reuse time over -> go');
ok(P.vitWanted(20000, { nextAt: T + H }, T, true).go === true, 'your order (!vitality) always goes');
const a1 = P.vitAnswer('You have received the Gift of Vitality. May Eva bless you.', 5000, 5000);
ok(a1.ok === true && a1.waitMs === P.VIT.reuseMs, 'a thank-you page -> OK, next in 5 hours');
const a2 = P.vitAnswer('Some text', 5000, 18000);
ok(a2.ok === true, 'vitality jumped to level 4 -> OK whatever the page says');
const a3 = P.vitAnswer('You cannot receive the gift yet. Please come back in 3 hours 20 minutes.', 5000, 5000);
ok(a3.ok === false && a3.waitMs === 3 * H + 20 * 60000, `refused with a time -> waits that long (${a3.waitMs / 60000} min)`);
const a4 = P.vitAnswer('You have already received the Gift of Vitality.', 5000, 5000);
ok(a4.ok === false && a4.waitMs === P.VIT.retryMs, 'refused without a time -> tries again in 1 hour');
const a5 = P.vitAnswer('Only characters of level 5 or higher can receive this.', 5000, 5000);
ok(a5.ok === false && a5.waitMs === P.VIT.goneMs && /level too low/.test(a5.why), 'level too low -> says so, 6 hours');
const a6 = P.vitAnswer('', 5000, 5000);
ok(a6.ok === null && a6.waitMs === P.VIT.retryMs, 'no answer at all -> unclear, 1 hour');
const npcs = [{ name: 'Priest of Blessing', title: '', d: 50 }, { name: 'Steve Shyagel', title: "Eva's High Priest", d: 300 }, { name: 'Someone', title: "Eva's High Priest", d: 900 }];
ok(P.vitPickNpc(npcs).name === 'Steve Shyagel', 'the priest is found by name among the temple NPCs');
ok(P.vitPickNpc([{ name: 'Renamed', title: "Eva's High Priest", d: 10 }]).name === 'Renamed', 'or by title (event NPC renamed)');
ok(P.vitPickNpc([{ name: 'Priest of Blessing', title: '', d: 1 }]) === null, 'no priest -> null');

console.log('2) vitalityMine on stubs');
(async () => {
  const MINE = block('function vitStateFile()', '// BUFFSTORE-2026-10-19:');
  const mk = (opt) => {
    const files = {}, notes = [], clicks = [], logs = [];
    const env = {
      SWARM_ROOT: 'X', Me: { Name: 'Tester', X: 82700, Y: 149300, Z: -3472, Vitality: opt.vit }, File: { Exists: (f) => f in files, ReadAllText: (f) => files[f], WriteAllText: (f, t) => { files[f] = t; } },
      now: () => T, sleep: async () => { if (opt.after !== undefined) env.Me.Vitality = opt.after; }, num: Number, note: (m) => notes.push(m), appendShared: (f, t) => logs.push(t), state: {}, Options: {}, Send: { StopMove() { } }, standUp() { },
      currentTownKey: () => opt.town === undefined ? 'Giran' : opt.town, snapNpcs: () => opt.npcs || [{ Name: 'Steve Shyagel', Title: "Eva's High Priest", X: 82792, Y: 149448, Z: -3472, ref: { Name: 'Steve Shyagel' } }],
      intent() { }, intentDone() { }, openNpc: async () => opt.page === undefined ? '<a action="bypass -h 00">Receive the Gift of Vitality</a>' : opt.page,
      npcLinks: (h) => /Gift of Vitality/.test(h) ? [{ cmd: '00', text: 'Receive the Gift of Vitality' }] : [], dlgPage: async (l) => { clicks.push(l.text); return opt.answer === undefined ? '<html>You have received the Gift of Vitality.</html>' : opt.answer; },
      htmlText: (h) => String(h || '').replace(/<[^>]+>/g, ''), lastSysMsg: null, giranGo: async () => true
    };
    const names = Object.keys(env);
    const f = new Function(...names, PURE + '\n' + MINE + '\nreturn { vitalityMine, vitState };');
    return { env, files, notes, clicks, logs, M: f(...names.map(k => env[k])) };
  };
  let s = mk({ vit: 5000, after: 18000 });
  let r = await s.M.vitalityMine('test', false);
  ok(r.ok && /got the Gift/.test(r.msg) && s.clicks[0] === 'Receive the Gift of Vitality', 'clicks "Receive the Gift of Vitality" by its text and reports success');
  const st = JSON.parse(s.files['X\\Logs\\vitality_Tester.json']);
  ok(st.nextAt === T + P.VIT.reuseMs && st.lastOk, 'saves the next time (5 h) in Logs/vitality_<name>.json');
  ok(s.files['X\\Logs\\vitality_answer.html'] !== undefined, 'keeps the first answer page for the record');
  s = mk({ vit: 19000 }); r = await s.M.vitalityMine('test', false);
  ok(r.ok && /level 4/.test(r.msg) && !s.clicks.length, 'level 4 already: no walk, no click');
  s = mk({ vit: 5000, town: 'Dion' }); r = await s.M.vitalityMine('test', false);
  ok(/not in Giran/.test(r.msg) && !s.clicks.length, 'outside Giran: does nothing, says why');
  s = mk({ vit: 5000, npcs: [] }); r = await s.M.vitalityMine('test', false);
  ok(r.ok === false && /event over/.test(r.msg) && s.notes.length === 1 && JSON.parse(s.files['X\\Logs\\vitality_Tester.json']).nextAt === T + P.VIT.goneMs, 'priest gone: one note, tries again in 6 hours');
  s = mk({ vit: 5000, answer: '<html>You cannot receive it yet. Come back in 2 hours.</html>' }); r = await s.M.vitalityMine('test', false);
  ok(r.ok === false && JSON.parse(s.files['X\\Logs\\vitality_Tester.json']).nextAt === T + 2 * H, 'refused: keeps the server\'s waiting time');
  s = mk({ vit: 5000, page: '<html>no link here</html>' }); r = await s.M.vitalityMine('test', false);
  ok(r.ok === false && /no "Receive the Gift of Vitality" link/.test(r.msg), 'page without the gift link: says so, clicks nothing');
  s = mk({ vit: 20000 }); s.files['X\\Logs\\vitality_Tester.json'] = JSON.stringify({ nextAt: T + H }); r = await s.M.vitalityMine('!vitality', true);
  ok(s.clicks.length === 1, 'your order goes even at level 4 / inside the reuse time');

  console.log('3) wiring');
  const kinds = /const PAUTO_KINDS = \{[^\n]*\bvitality: \{ char: false/.test(SRC);
  ok(kinds, "party switch 'vitality' in swarm.js PAUTO_KINDS (party only)");
  const API = require(path.join(ROOT, 'Dashboard', 'partyauto_api.js'));
  ok(API.KEYS.includes('vitality') && !API.CHAR_KEYS.includes('vitality'), 'the dashboard API knows it (party switch)');
  ok(/if \(pautoOn\('vitality'\) && currentTownKey\(\) === 'Giran' && !hurry\(\)\)/.test(SRC) && /teamStep\(runId, 'vitalityrun'/.test(SRC), 'supply run: Giran + switch on + not in a hurry -> team step vitalityrun');
  ok(/if \(action === 'vitalityrun'\)/.test(SRC) && /return await vitalityMine\('supply run', false\)/.test(SRC), 'members answer the team step themselves (each takes its own gift)');
  ok(/case '!vitality':/.test(SRC) && /vitalityMine\(cmd, true\)/.test(SRC), '!vitality [name] order');
  const CAT = fs.readFileSync(path.join(ROOT, 'Dashboard', 'commands.js'), 'utf8');
  ok(/id: 'vitality'[^\n]*tpl: '!vitality\[ \{name\}\]'[^\n]*safety: 'safe'/.test(CAT), 'command catalog entry (safe)');
  ok(/vitality: 'Gift of Vitality'/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8')), 'party settings popup has a short label for it');
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
