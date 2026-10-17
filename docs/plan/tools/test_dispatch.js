// DISPATCH-2026-10-17 tests: Dashboard/dispatch_api.js (atlas search, epic quick list, map points, the tour file + order, refusals) on a SCRATCH
// Logs folder with a fake command runner, and the swarm.js DISPATCH block wiring (route ids for learned routes, never over a locked route,
// boss doors, the fallback recorder). Nothing reaches the game.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
let ok = 0, bad = 0; const t = (c, m, info) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 300) : '')); } };
(async () => {
  const A = require(path.join(ROOT, 'Dashboard', 'dispatch_api.js'));
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp_')), sent = [];
  const ctx = { DATA: path.join(ROOT, 'Scripts', 'data'), LOGS: TMP, ROOT, readStates: () => [], commandRun: async (b) => { sent.push(b); return { body: { ok: true } }; } };
  const Q = A.targets(ctx, '', '', '', true);
  const names = Q.targets.map(x => x.label);
  t(['Baium (to the Angelic Vortex door)', 'Klein (Valakas teleporter)', 'Antharas', 'Core', 'Queen Ant', 'Primeval Isle (Sailren)'].every(n => names.includes(n)), 'quick list: Baium, Klein, Antharas, Core, Queen Ant, Primeval Isle', names);
  const S1 = A.targets(ctx, 'iron giant', 'all', 10);
  t(S1.total >= 1 && S1.targets[0].key === 'raid:25260' && S1.targets[0].status, 'search finds Iron Giant Totem with its route status');
  t(A.targets(ctx, '', 'npc', 5).targets.every(x => x.type === 'npc') && A.targets(ctx, '', 'area', 500).targets.length > 100, 'type filter + result cap');
  const W = A.who({ ROOT, readStates: () => [] });
  t(W.parties.length > 5 && W.chars.length > 20, 'parties + characters listed');
  const leader = W.parties.find(p => p.members.length > 1).leader;
  t((await A.post(ctx, { who: { party: leader }, stops: [] })).code === 400 && (await A.post(ctx, { who: {}, stops: ['raid:25260'] })).code === 400 && !sent.length, 'no stops / nobody = refused, nothing sent');
  const r = await A.post(ctx, { who: { party: leader }, stops: ['raid:25260', 'xy:83000,148000,-3400', 'nonsense'], goOn: true, sneak: true });
  const J = r.ok && JSON.parse(fs.readFileSync(path.join(TMP, 'dispatch', r.id + '.json'), 'utf8'));
  t(r.ok && J.stops.length === 2 && J.stops[1].type === 'point' && J.stops[1].x === 83000 && J.who.party === leader && J.goOn && !J.sneak, 'tour file: atlas stop + map point (unknown key dropped; sneak only for one character)', J);
  t(sent.length === 1 && sent[0].cmd === `!dispatch ${r.id}` && sent[0].targets[0] === 'chars:' + leader, 'the order goes to the party leader');
  t(A.job(ctx, r.id).ok && A.job(ctx, 'bad id').code === 400 && A.recent(ctx).jobs.length === 1, 'job / recent');
  const solo = W.chars.find(c => c.party === c.name) || W.chars[0];
  const r2 = await A.post(ctx, { who: { char: solo.name }, stops: ['raid:29020'], sneak: true });
  t(r2.ok && r2.job.sneak === true && !r2.benched, `one character (${solo.name}, a leader / solo) is not benched; sneak kept`);
  const CMD = require(path.join(ROOT, 'Dashboard', 'commands.js'));
  t(CMD.classify(`!dispatch ${r.id}`) && CMD.classify(`!dispatch ${r.id}`).id === 'dispatch', 'the command catalog knows !dispatch');
  // swarm.js DISPATCH block
  const SW = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
  const blk = SW.slice(SW.indexOf('// ===== DISPATCH'), SW.indexOf('async function dispatchOrder'));
  const dspRouteId = new Function(blk.slice(blk.indexOf('function dspRouteId'), blk.indexOf('/** save the recorded walk')) + '; return dspRouteId;')();
  t(JSON.stringify(dspRouteId('raid:25260')) === '{"type":"raid","id":"25260"}' && dspRouteId('npc:31540@183664,-114944').id === '31540' && dspRouteId('room:forge-1-left-a').id === 'forge-1-left-a' && dspRouteId('xy:1,2') === null, 'learned route ids per target type (map points: none)');
  t(/old\.manual === true\) return 'not saved: you locked your own route/.test(blk), 'a locked route is never overwritten');
  t(/use: 'custom', learned: \{ by: 'dispatch'/.test(blk) && /history/.test(blk), 'learned route: used from now on, the old one kept in history');
  t(/x\.how === 'bosszone'/.test(blk) && /J\.enter && fabric > 0/.test(blk), 'epic boss door: stops before it unless "enter" + the entry item');
  t(/navAtlasNear\(tgt\.x, tgt\.y/.test(blk) && /dspRecorder\(\)/.test(blk) && /leadTeamWalk\(tgt\.x/.test(blk), 'fallback: teleport closer + walk, recorded');
  t(/case '!dispatch':/.test(SW) && /dispatchOrder\(did\)/.test(SW), 'swarm.js handles !dispatch');
  const IDX = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8'), SRV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
  t(/DispatchPage\.route\(kind, arg\)/.test(IDX) && /data-tab="dispatch"/.test(IDX) && /require\('\.\/dispatch_api'\)\.handle\(/.test(SRV), 'page, tab and API hooked in');
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
