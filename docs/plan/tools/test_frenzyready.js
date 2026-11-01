// FRENZYREADY-2026-10-29 (owner: "I want a way to ask destroyer or titan to get the gears from clan warehouse or collector to become 'Frenzy ready'"):
// Dashboard/frenzykit_api.js kitSources / partySources / kitGet(picks) on a sandbox (temp Logs + the real kit data), the swarm.js unsealRun hand-over
// source, the page dialog + the party card button.   node docs/plan/tools/test_frenzyready.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else fail++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && info ? ' — ' + JSON.stringify(info).slice(0, 300) : ''}`); };
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const KIT = rj(path.join(ROOT, 'Scripts', 'data', 'frenzy_kit.json'), null), slot = (k) => KIT.slots.find(s => s.key === k);
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'frenzyready_')), LOGS = path.join(T, 'Logs'), DATA = path.join(T, 'data');
fs.mkdirSync(path.join(LOGS, 'itemjobs'), { recursive: true }); fs.mkdirSync(DATA, { recursive: true });
['frenzy_kit.json', 'unseal_h5.json'].forEach(f => fs.copyFileSync(path.join(ROOT, 'Scripts', 'data', f), path.join(DATA, f)));
fs.writeFileSync(path.join(DATA, 'stash_rules.json'), JSON.stringify({ collector: { on: true, name: 'Colly' } }));
const at = new Date().toISOString(), DOOM = slot('high.armor').ids[0].id, DHELM = slot('high.helmet').ids[0].id, DGL = slot('high.gloves').ids[0].id, CONV = slot('low.weapon').ids[0].id;
const bag = (name, items) => fs.writeFileSync(path.join(LOGS, `bag_${name}.json`), JSON.stringify({ at, name, items }));
bag('Dess', [{ id: 57, objId: 1, name: 'Adena', count: 1e6, eq: false }]);
bag('Colly', [{ id: DOOM, objId: 501, name: 'Doom Plate Armor', count: 1, eq: false }, { id: DGL, objId: 502, name: 'Doom Gloves', count: 1, eq: false, enchant: 12 }]);
bag('Mate', [{ id: DHELM, objId: 601, name: 'Doom Helmet', count: 1, eq: true }, { id: DGL, objId: 602, name: 'Doom Gloves - Heavy Armor', count: 1, eq: false }]);
bag('Other', [{ id: DOOM, objId: 701, name: 'Doom Plate Armor', count: 1, eq: false }]);   // another destroyer: its own kit, never offered
fs.writeFileSync(path.join(LOGS, 'clan_state.json'), JSON.stringify({ clanInfo: { leader: 'Colly' }, warehouse: { items: [{ id: CONV, name: "Homunkulus's Sword", count: 1 }, { id: DHELM, name: 'Doom Helmet', count: 1, enchant: 10 }] } }));
const states = [{ name: 'Dess', role: 'destroyer', cls: 'Destroyer', leader: true }, { name: 'Tita', role: 'dd', cls: 'Titan', leader: false }, { name: 'Mate', role: 'healer', cls: 'Elder', leader: false }, { name: 'Other', role: 'destroyer', cls: 'Destroyer', leader: true }, { name: 'Colly', role: 'dd', leader: true }];
const sent = [];
const ctx = { DATA, LOGS, readJson: rj, readStates: () => states, teamMap: () => ({ Dess: 'Dess', Tita: 'Dess', Mate: 'Dess', Other: 'Other', Colly: 'Colly' }), commandRun: async (c) => { sent.push(c); return { ok: true }; } };
const K = require(path.join(ROOT, 'Dashboard', 'frenzykit_api.js'));
(async () => {
  console.log('1) every place a missing kit piece lies');
  const S = K.kitSources(ctx, 'Dess'), sl = (k) => (S.slots || []).find(s => s.key === k) || { from: [] };
  ok('the collector is named', S.ok && S.collector === 'Colly', S);
  ok('clan warehouse piece listed with the kit name (S.A. kept)', sl('low.weapon').from.some(f => f.src === 'clan' && f.id === CONV && / - Conversion$/.test(f.name)), sl('low.weapon'));
  ok('the collector\'s bag piece listed, collector first among bags', sl('high.armor').from[0] && sl('high.armor').from[0].char === 'Colly' && sl('high.armor').from[0].collector, sl('high.armor'));
  ok('never another destroyer\'s bag (its own kit)', !sl('high.armor').from.some(f => f.char === 'Other'));
  ok('never a worn piece, never +10 (bag or clan warehouse)', !sl('high.helmet').from.some(f => f.objId === 601 || f.src === 'clan') && !sl('high.gloves').from.some(f => f.objId === 502), [sl('high.helmet'), sl('high.gloves')]);
  ok('a teammate\'s spare piece is listed', sl('high.gloves').from.some(f => f.char === 'Mate' && f.objId === 602));
  console.log('2) the party: its destroyers and titans');
  const PS = K.partySources(ctx, 'Dess');
  ok('Dess (role destroyer) + Tita (Titan class), not the healer', PS.ok && PS.chars.map(c => c.name).sort().join() === 'Dess,Tita', PS.chars && PS.chars.map(c => c.name));
  console.log('3) the order takes exactly the ticked pieces');
  const r = await K.kitGet(ctx, { name: 'Dess', now: false, picks: [{ key: 'high.armor', src: 'char', char: 'Colly', id: DOOM, objId: 501 }, { key: 'low.weapon', src: 'clan', char: '', id: CONV }, { key: 'high.boots', src: 'char', char: 'Mate', id: 999, objId: 1 }, { key: 'high.armor', src: 'clan', id: DOOM }] });
  const J = r.ok && rj(path.join(LOGS, 'itemjobs', r.id + '.json'), null);
  ok('queued job with 2 pieces (a pick that is not there + a 2nd pick of one slot are dropped)', J && J.unseal.pieces.length === 2 && J.unseal.keep === true && r.queued, J && J.unseal);
  const pc = J && J.unseal.pieces.find(p => p.src === 'char');
  ok('the collector piece: src char + its objId, kept in the bag', pc && pc.char === 'Colly' && pc.objId === 501 && pc.sealed === false, pc);
  ok('steps say who hands what', r.steps.some(s => /Colly hands Dess/.test(s)), r.steps);
  const r2 = await K.kitGet(ctx, { name: 'Dess', picks: [{ key: 'high.armor', src: 'char', char: 'Other', id: DOOM, objId: 701 }] });
  ok('a piece from another destroyer is refused', r2.code === 409, r2);
  console.log('4) swarm.js + the page');
  const SW = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8'), CP = fs.readFileSync(path.join(ROOT, 'Dashboard', 'charpage.js'), 'utf8'), IX = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
  ok('unsealRun fetches a src char piece by hand-over (ijFetch char rows)', /x0\.src === 'char' \? \{ char: \{ name: String\(x0\.char/.test(SW) && /const k = x\.src \+ ':' \+ \(x\.char \|\| ''\)/.test(SW));
  ok('page: one dialog, a pick per piece + "Don\'t take", the confirm buttons', /window\.FrenzyReady = /.test(CP) && /Don\\'t take this one/.test(CP) && /'\/api\/frenzykit\/get'/.test(CP) && /Next time in Giran/.test(CP));
  ok('party card: "Frenzy ready" button for parties with a destroyer / titan', /FrenzyReady\.partyButton\(leader, list\)/.test(IX) && /data-frenzyready/.test(CP));
  try { fs.rmSync(T, { recursive: true, force: true }); } catch (e) { }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR', e.stack); process.exit(1); });
