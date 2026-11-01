// test_epicprep_get.js - guard for EPICGET-2026-10-31 (docs/requirements/pages.md #/epicprep "Get it"; gear.md R7).
// Pure parts of Dashboard/epicprep_actions.js + the command queue's 'make' kind + the upgrade planner's wear pass-through. No game, no server.
'use strict';
const path = require('path'), fs = require('fs');
const DASH = path.join(__dirname, '..', '..', '..', 'Dashboard');
const A = require(path.join(DASH, 'epicprep_actions.js'));
let ok = 0, bad = 0; const check = (c, m, extra) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (extra ? ' - ' + extra : '')); } };

// 1. slot names
check(A.plannerSlot('ear1') === 'earring' && A.plannerSlot('ring2') === 'ring' && A.plannerSlot('chest') === 'chest', 'epic slots map to the planner slots');

// 2. options: labels, craft without materials not usable, +10 never usable from a warehouse / another bag
const oClan = A.optionOf({ src: 'clan', enchant: 0 }), oCraft = A.optionOf({ src: 'craft', crafter: 'Crafter1', can: 0 }), oCraftOk = A.optionOf({ src: 'craft', crafter: 'Crafter1', can: 2 });
const o10 = A.optionOf({ src: 'clan', enchant: 10 }), o10bag = A.optionOf({ src: 'bag', enchant: 12, objId: 5 });
check(oClan.ok && /clan warehouse/.test(oClan.label), 'clan warehouse option usable');
check(!oCraft.ok && oCraftOk.ok, 'craft without materials is not usable, with materials it is');
check(!o10.ok && /\+10/.test(o10.detail), '+10 piece in the clan warehouse is never usable here (Enchanting page +10 tick only)');
check(o10bag.ok, "a +10 piece already in the member's own bag may be put on");

// 3. best option: own bag > another character > clan > own warehouse > shop > craft; highest enchant within a kind; skips unusable
const best = A.bestOption([A.optionOf({ src: 'shop', npc: 'Graham', price: 100 }), A.optionOf({ src: 'clan', enchant: 2 }), A.optionOf({ src: 'clan', enchant: 4 }), oCraftOk]);
check(best && best.kind === 'clan' && best.src.enchant === 4, 'best = clan +4 over clan +2 / shop / craft', best && best.key);
check(A.bestOption([oCraft, o10]) === null, 'no usable option -> null');

// 4. gear.md R7: armor only as a whole set
const set = (st) => ['chest', 'legs', 'head', 'gloves', 'feet'].map((s, i) => ({ slot: s, status: st[i], want: { id: 100 + i } })).concat([{ slot: 'weapon', status: 'missing', want: { id: 1 } }]);
let W = A.wearPlan(set(['missing', 'ok', 'ok', 'missing', 'ok']), [{ slot: 'chest', id: 100 }, { slot: 'weapon', id: 1 }]);
check(W.wear.chest === false && !W.complete && W.missing.join() === 'gloves', 'incomplete set: the chest stays in the bag (gloves still missing)', JSON.stringify(W));
check(W.wear.weapon === true, 'a weapon goes on regardless of the armor set');
W = A.wearPlan(set(['missing', 'ok', 'bag', 'missing', 'low']), [{ slot: 'chest', id: 100 }, { slot: 'gloves', id: 103 }]);
check(W.complete && W.wear.chest && W.wear.gloves, 'set complete with this job -> the pieces go on (low = right piece, enchant short)');
check(W.putOnFromBag.join() === 'head', 'set complete -> the bag piece (head) goes on in the same job');
W = A.wearPlan(set(['other', 'ok', 'ok', 'ok', 'ok']), [{ slot: 'legs', id: 101 }]);
check(W.wear.legs === false && W.missing.join() === 'chest', 'something else worn on the chest = set not complete');

// 5. queue bodies: craft -> make job given to the member; rest -> one upgrade job, giveTo = member, wear flag, no enchanting
const B = A.jobBodies('Doombringer1', [{ slot: 'chest', id: 100, src: { src: 'clan', enchant: 3 } }, { slot: 'weapon', id: 1, src: { src: 'craft', crafter: 'Crafter1', recipe: 7 } }, { slot: 'legs', id: 101, src: { src: 'char', char: 'Bishop1', objId: 9 } }],
  { chest: false, legs: false, weapon: true }, { 100: 'A', 1: 'B', 101: 'C' });
check(B.make.length === 1 && B.make[0].name === 'Crafter1' && B.make[0].give.join() === 'Doombringer1' && B.make[0].enchantTo === 0, 'craft pick -> make job by the crafter, handed to the member, no enchant');
const L = B.upgrade && B.upgrade.orders[0];
check(L && L.name === 'Doombringer1' && L.lines.length === 2, 'one upgrade job for the member with both fetch lines');
check(L && L.lines[0].wear === false && L.lines[0].enchantTo === 3 && L.lines[0].item.src === 'clan', 'clan line keeps its own enchant (nothing enchanted) and stays in the bag');
check(L && L.lines[1].item.char === 'Bishop1' && L.lines[1].item.objId === 9, "another character's exact piece");
check(B.approve.join() === '100', 'only the A/S piece is written as the owner\'s approval', B.approve.join());
check(A.jobBodies('X', [], {}, {}).upgrade === null, 'no picks -> no job');

// 6. the queue knows 'make' + the planner passes wear through
const AQ = fs.readFileSync(path.join(DASH, 'autoqueue.js'), 'utf8'), UP = fs.readFileSync(path.join(DASH, 'upgrade_api.js'), 'utf8'), SV = fs.readFileSync(path.join(DASH, 'server.js'), 'utf8');
check(/b\.kind === 'make'/.test(AQ) && /\/api\/upgrade\/make\/start/.test(AQ), "autoqueue accepts kind 'make' and starts it through /api/upgrade/make/start");
check(/wear: L\.wear !== false/.test(UP) && /wear: r\.wear !== false/.test(UP), 'upgrade planner passes a line\'s wear: false to the item job');
check(/require\('\.\/epicprep_actions'\)\.handle/.test(SV) && /AUTOQ\.enqueue\(b\)/.test(SV), 'server.js routes /api/epicprep/* actions and queues through AUTOQ');
const make = (() => { const AQM = require(path.join(DASH, 'autoqueue.js')); const tmp = path.join(require('os').tmpdir(), 'aq_epicget_' + process.pid + '.json');
  const q = AQM.create({ file: tmp, log: () => { }, laneOf: (n) => n === 'Crafter1' ? 'Tank1' : n, post: async () => ({}), commandRun: async () => ({}), orderStatus: () => [], itemJobState: () => '', handoverState: () => '' });
  const r = q.enqueue({ kind: 'make', body: { name: 'Crafter1', item: { id: 1, src: 'craft' }, give: ['Doombringer1'] }, by: 'test' }); try { fs.unlinkSync(tmp); } catch (e) { } return r; })();
check(make && make.ok && make.item.cmd === 'craft job' && make.item.lanes.join() === 'Tank1', "a 'make' item is queued in the crafter's party lane", JSON.stringify(make && (make.error || make.item.lanes)));

// 7. the page: Get it / inventory / plans, no browser dialogs
const PG = fs.readFileSync(path.join(DASH, 'epicprep.js'), 'utf8');
check(/data-eppget=/.test(PG) && /\/api\/epicprep\/sources/.test(PG) && /\/api\/epicprep\/get/.test(PG), 'page: Get it per slot -> sources -> queue');
check(/data-eppact="inv"/.test(PG) && /\/api\/epicprep\/member/.test(PG), 'page: the complete inventory per member');
check(/data-eppact="all"/.test(PG) && /data-eppact="party"/.test(PG) && /data-eppact="planok"/.test(PG), 'page: Do all missing / Plan the whole party, queued only after the owner\'s click');
check(!/\b(alert|confirm|prompt)\(/.test(PG), 'no browser alert / confirm / prompt');
// ---------------------------------------------------------------- EPICGET2 (owner's live test 2026-10-31)
// stubs for the Upgrade / item planners (require cache), a temp Logs dir with item job status files
const os = require('os');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'epicget_test_')); fs.mkdirSync(path.join(TMP, 'itemjobs'));
const NAMES = { 855: "Nassen's Earring", 858: 'Earring of Black Ore', 6324: 'Sealed Majestic Earring', 856: 'Earring of Wisdom', 100: 'Dark Crystal Breastplate', 101: 'Tallum Plate Armor' };
const GRADES = { 855: 'C', 858: 'B', 6324: 'A', 856: 'D', 100: 'A', 101: 'A' };
const CANDS = [
  { id: 855, name: NAMES[855], grade: 'C', sources: [{ src: 'clan', enchant: 8, count: 1 }, { src: 'shop', npc: 'Denkus', price: 325800 }] },
  { id: 858, name: NAMES[858], grade: 'B', sources: [{ src: 'char', char: 'Nuker13', objId: 501, enchant: 6, count: 1 }, { src: 'shop', npc: 'X', price: 1 }, { src: 'craft', crafter: 'Crafter1', can: 1 }] },
  { id: 6324, name: NAMES[6324], grade: 'A', sources: [{ src: 'clan', enchant: 4, count: 2 }] },
  { id: 856, name: NAMES[856], grade: 'D', sources: [{ src: 'wh', enchant: 9, count: 1 }, { src: 'bag', objId: 77, enchant: 3, count: 1 }] }];
const UPF = require.resolve(path.join(DASH, 'upgrade_api.js')), IPF = require.resolve(path.join(DASH, 'itemspage_api.js'));
require.cache[UPF] = { id: UPF, filename: UPF, loaded: true, exports: { slotCands: async (ctx, name, slot) => slot === 'earring' ? { ok: true, items: CANDS } : { ok: true, items: [] } } };
require.cache[IPF] = { id: IPF, filename: IPF, loaded: true, exports: { facts: (ctx, id) => ({ id, name: NAMES[id] || '#' + id, grade: GRADES[id] || '' }),
  charInfo: async () => ({ bag: [{ id: 856, objId: 77, enchant: 3, count: 1 }, { id: 855, objId: 90, enchant: 0, count: 1, eq: true }], wh: [{ id: 856, enchant: 9, count: 1 }], clan: [{ id: 855, enchant: 8, count: 1 }, { id: 6324, enchant: 4, count: 2 }] }) } };
const Q = [];
const ctx = { LOGS: TMP, queueItems: () => Q, readJson: (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } } };
(async () => {
  // 8. full candidate list for an earring: the setup's piece (all sources) + every OTHER earring we own (owned sources only), with enchant
  const S = await A.sourcesOf(ctx, 'Nuker18', 'ear1', 855);
  const setup = S.options.filter(o => o.group === 'setup'), other = S.options.filter(o => o.group === 'other');
  check(setup.length === 2 && setup.some(o => o.kind === 'shop'), "the setup's earring with all its sources (clan +8, shop)", setup.map(o => o.key).join(' | '));
  check(other.length === 4 && other.every(o => ['bag', 'char', 'clan', 'wh'].includes(o.kind)), 'every OTHER earring we own is listed (no shop / craft rows for them)', other.map(o => o.key).join(' | '));
  const bo = other.find(o => o.item.id === 858);
  check(bo && bo.src.enchant === 6 && bo.src.char === 'Nuker13' && bo.item.grade === 'B', "another character's enchanted earring: +6, B, who holds it");
  check(other.some(o => o.item.id === 6324 && o.item.sealed && o.src.count === 2), 'sealed pieces are marked, clan counts kept');
  check(S.best && S.best.item.id === 855 && S.best.kind === 'clan', "the pre-selected / 'Do all missing' choice is the setup's piece only");

  // 9. reservations: a piece in a waiting / running job is "queued for X" and cannot be picked again (UI + server)
  Q.push({ id: 'aq1', kind: 'upgrade', state: 'running', body: { orders: [{ name: 'Nuker18', lines: [{ item: { src: 'clan', id: 855, enchant: 8, objId: 0 }, wear: true }] }] }, jobIds: ['ij_nuker18_a'] });
  Q.push({ id: 'aq2', kind: 'upgrade', state: 'waiting', body: { orders: [{ name: 'Nuker15', lines: [{ item: { src: 'char', char: 'Nuker13', id: 858, objId: 501, enchant: 6 }, wear: true }] }] } });
  Q.push({ id: 'aq3', kind: 'upgrade', state: 'done', body: { orders: [{ name: 'Nuker16', lines: [{ item: { src: 'clan', id: 6324, enchant: 4 }, wear: true }] }] }, jobIds: ['ij_nuker16_b'], endedAt: Date.now() - 60000 });
  const S2 = await A.sourcesOf(ctx, 'Nuker17', 'ear2', 855);
  const c855 = S2.options.find(o => o.item.id === 855 && o.kind === 'clan'), c858 = S2.options.find(o => o.item.id === 858), c6324 = S2.options.find(o => o.item.id === 6324);
  check(c855 && !c855.ok && c855.reservedFor.join() === 'Nuker18', 'the clan Nassen +8 queued for Nuker18 is marked and not pickable', c855 && JSON.stringify(c855.reservedFor));
  check(c858 && !c858.ok && c858.reservedFor.join() === 'Nuker15', "Nuker13's exact earring (objId) waiting for Nuker15 is not pickable");
  check(c6324 && c6324.ok, 'a finished job reserves nothing');
  check(!S2.best || S2.best.kind !== 'clan', 'the reserved clan piece is never the pre-selected choice');
  const err = await A.checkPicks(ctx, 'Nuker17', [{ slot: 'ear2', id: 855, src: { src: 'clan', enchant: 8 } }]);
  check(/already queued for Nuker18/.test(err || ''), 'server refuses a second pick of a reserved piece', err);
  const err2 = await A.checkPicks(ctx, 'Nuker17', [{ slot: 'ear1', id: 6324, src: { src: 'clan', enchant: 4 } }, { slot: 'ear2', id: 6324, src: { src: 'clan', enchant: 4 } }]);
  check(err2 === null, 'two of a kind in the clan warehouse (count 2) can both be picked');
  Q.push({ id: 'aq4', kind: 'upgrade', state: 'waiting', body: { orders: [{ name: 'Nuker18', lines: [{ item: { src: 'clan', id: 6324, enchant: 4 }, wear: false }] }] } });
  const err3 = await A.checkPicks(ctx, 'Nuker17', [{ slot: 'ear1', id: 6324, src: { src: 'clan', enchant: 4 } }, { slot: 'ear2', id: 6324, src: { src: 'clan', enchant: 4 } }]);
  check(/already queued for Nuker18/.test(err3 || ''), 'one of the two already queued -> the second pick is refused', err3);
  const R = A.reservations(Q, [{ key: 'clan:855:8', for: 'Char1' }]);
  check(R['clan:855:8'].length === 2, "picks earlier in the same plan count too (a party plan never plans one piece twice)");
  const M = await A.memberOf(Object.assign({}, ctx, { queueItems: () => [{ id: 'aq5', kind: 'upgrade', state: 'waiting', body: { orders: [{ name: 'Char1', lines: [{ item: { src: 'char', char: 'Nuker18', id: 856, objId: 77, enchant: 3 } }] }] } }] }), 'Nuker18');
  check(M.bag.find(r => r.objId === 77).reservedFor.join() === 'Char1', "the inventory view marks a bag piece queued for another member");

  // 10. live job rows from the queue + Logs/itemjobs/<id>_status.json
  fs.writeFileSync(path.join(TMP, 'itemjobs', 'ij_nuker18_a_status.json'), JSON.stringify({ id: 'ij_nuker18_a', state: 'running', step: 'asking the clan leader Dagger1 for 1× Nassen\'s Earring from the clan warehouse' }));
  fs.writeFileSync(path.join(TMP, 'itemjobs', 'ij_nuker16_b_status.json'), JSON.stringify({ id: 'ij_nuker16_b', state: 'done', step: '✓ done', result: 'Sealed Majestic Earring +4 worn' }));
  const J = A.jobsOf(ctx, 'Nuker18');
  const run = J.rows.find(r => r.aq === 'aq1'), wait = J.rows.find(r => r.aq === 'aq4');
  check(J.active && run && run.state === 'running' && /asking the clan leader Dagger1/.test(run.text), "running: the item job's current step text", run && run.text);
  check(wait && wait.state === 'waiting' && /waiting in the queue/.test(wait.text) && wait.pieces[0].wear === false, 'waiting: in the queue, the piece that stays in the bag is flagged');
  check(J.rows[0].state === 'running' || J.rows[0].state === 'waiting', 'open jobs first');
  const JE = A.jobsOf(ctx, 'Nuker16');
  check(JE.rows[0].state === 'done' && /worn/.test(JE.rows[0].text) && !JE.active, 'done: the job result (worn)');
  const rows = A.jobRows('X', [{ id: 'q', kind: 'upgrade', state: 'done', at: Date.now(), endedAt: Date.now(), body: { orders: [{ name: 'X', lines: [{ item: { src: 'clan', id: 100 }, wear: false }] }] }, jobIds: ['j'] },
    { id: 'f', kind: 'upgrade', state: 'failed', why: 'upgrade not started: no answer', at: Date.now(), endedAt: Date.now(), body: { orders: [{ name: 'X', lines: [{ item: { src: 'clan', id: 101 } }] }] } }],
    (id) => id === 'j' ? { state: 'done', result: 'Dark Crystal Breastplate +0 kept in the bag' } : null, (id) => NAMES[id]);
  check(/in the bag until the set is complete/.test(rows.rows.find(r => r.aq === 'q').text), 'done + wear false: "in the bag until the set is complete"');
  check(rows.rows.find(r => r.aq === 'f').state === 'failed' && /no answer/.test(rows.rows.find(r => r.aq === 'f').text), 'failed: why');
  check(A.jobRows('X', [{ id: 'old', kind: 'upgrade', state: 'done', at: 1, endedAt: 1, body: { orders: [{ name: 'X', lines: [] }] } }], () => null, String).rows.length === 0, 'jobs older than 6 h are not listed');

  // 11. R7 with a non-setup piece: another armor piece stays in the bag and does not complete the set
  const W2 = A.wearPlan(set(['missing', 'ok', 'ok', 'ok', 'ok']), [{ slot: 'chest', id: 999 }]);
  check(W2.wear.chest === false && !W2.complete, 'R7: a chest that is not the setup piece stays in the bag (set not complete)');
  const W3 = A.wearPlan([{ slot: 'ear1', status: 'missing', want: { id: 855 } }], [{ slot: 'ear1', id: 858 }]);
  check(W3.wear.ear1 === true, 'jewelry the owner picked (other than the setup) goes on');

  // 12. the page: spinner + timeout, sort, reservations, job rows, toast link
  check(/class="epp-spin/.test(PG) && /apiT\(/.test(PG) && /no answer after/.test(PG), 'page: spinner on every wait + a time limit with a message');
  check(/data-eppsort="enchant"/.test(PG) && /data-eppsort="grade"/.test(PG) && /The setup's piece/.test(PG) && /we own/.test(PG), 'page: grouped candidates (setup first), sortable by enchant / grade');
  check(/queued for \$\{h\(o\.reservedFor/.test(PG) && /queued for \$\{h\(r\.reservedFor/.test(PG), 'page: "queued for X" in the chooser and in the inventory');
  check(/\/api\/epicprep\/jobs/.test(PG) && /data-eppjobs=/.test(PG) && /setTimeout\(loop, r && r\.active \? 4000/.test(PG), 'page: live job rows refreshed every 4 s while active + a toast link to them');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  console.log(`epic prep get: ${ok} ok, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL exception: ' + e.stack); process.exit(1); });
