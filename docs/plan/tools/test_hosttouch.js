// HOSTTOUCH (2026-10-12, docs/plan/host_touch_audit.md): offline test of the "JSON rows instead of host walks" change in swarm.js.
// Extracts rowsWith / partyRows / invRows / partyMember / escapeItemCounts / nearestMonster / findMobByName and resGather (RES-HOST: who is dead) from
// Scripts_dev/swarm.js (or $SWARM_SRC) and runs them against mocks: same results as the old live walks, fewer host touches, and the old walk
// whenever the rows are missing or lack a field. Skips (0 failed) while the HOSTTOUCH patch is not in the file yet.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
if (!src.includes('HOSTTOUCH-ROWS-BEGIN')) { console.log('test_hosttouch: SKIP (HOSTTOUCH patch not applied) — 0 failed'); process.exit(0); }
const { analyse } = require('./host_touch_audit.js');
const A = analyse(src);
const fnSrc = (name) => { const d = (A.fns[name] || []).find(x => !x.scope); if (!d) throw new Error('no function ' + name); return src.slice(A.T[d.at].s, A.T[d.body[1]].s + 1); };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };

// ---- mocks: a host collection that counts what it hands out, SEnt-like snapshot entries that count .ref
function hostColl(items, cnt) {
  return { forEach(fn) { cnt.walks++; items.forEach((o, i) => { cnt.items++; fn(o, i); }); }, GetItemByObjectID(id) { cnt.lookups++; return items.find(o => o.objId === id) || null; }, get Count() { return items.length; } };
}
function sent(d, live, cnt) { const e = Object.assign({}, d); Object.defineProperty(e, 'ref', { get() { cnt.refs++; return live; } }); return e; }
function ctx(extra) {
  const c = Object.assign({ console, Math, JSON, Number, String, Array, Object, Date, Set, isNaN }, extra);
  c.num = (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0);
  c.now = () => 1000000;
  return vm.createContext(c);
}
const load = (c, names, more) => { vm.runInContext(names.map(fnSrc).join('\n') + '\n' + (more || ''), c); return c; };

// ---- 1. rowsWith
{
  const c = load(ctx({ hostSnap: {} }), ['rowsWith']);
  ok(c.rowsWith(null, ['a']) === null, 'rowsWith(null)');
  ok(c.rowsWith({}, ['a']) === null, 'rowsWith(non-array)');
  const a = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
  ok(c.rowsWith(a, ['a', 'b']) === a, 'rowsWith keeps the array');
  ok(c.rowsWith([{ a: 1 }, { a: 2, b: 0 }], ['a', 'b']) === null, 'rowsWith: one row without a field -> null');
  ok(c.rowsWith([{ a: undefined }], ['a']) !== null, 'rowsWith: a present-but-undefined field counts as present');
  ok(Array.isArray(c.rowsWith([], ['a'])) && c.rowsWith([], ['a']).length === 0, 'rowsWith([]) -> [] (empty party)');
  ok(c.rowsWith([null], ['a']) === null, 'rowsWith: null row -> null');
}

// ---- 2. partyMember: rows vs live walk
const P = (n, x, extra) => Object.assign({ Name: n, X: x, Y: 2, Z: 3, IsDead: false, objId: x, Level: 40, HpPercent: 90, MpPercent: 80, MaxHP: 3000 }, extra || {});
{
  const live = [P('Aa', 10), P('Bb', 20), P('Bb', 21)], cnt = { walks: 0, items: 0, lookups: 0, refs: 0 };
  const rows = live.map(o => Object.assign({}, o));
  let snapCalls = 0;
  const c = load(ctx({ livePos: {}, PartyList: hostColl(live, cnt), hostSnap: { party: () => { snapCalls++; return rows; }, inv: () => null } }), ['rowsWith', 'partyRows', 'invRows', 'partyMember']);
  const m = c.partyMember('Bb');
  ok(m && m.X === 21, 'partyMember: last match, like the old walk (got ' + (m && m.X) + ')');
  ok(cnt.walks === 0 && snapCalls === 1, 'partyMember: rows used, no host walk');
  ok(c.partyMember('Zz') === null, 'partyMember: unknown name -> null');
  c.livePos.Aa = { Name: 'Aa', X: 99, at: 1000000 - 1000 };
  ok(c.partyMember('Aa').X === 99, 'partyMember: a fresh livePos entry still wins');
  c.livePos.Aa.at = 1000000 - 7000;
  ok(c.partyMember('Aa').X === 10, 'partyMember: stale livePos -> the rows');
}
{
  const live = [P('Aa', 10)], cnt = { walks: 0, items: 0, lookups: 0, refs: 0 };
  const rows = [{ Name: 'Aa', X: 10, Y: 2, Z: 3, IsDead: false, objId: 10, HpPercent: 90, MpPercent: 80, MaxHP: 3000 }];   // no Level
  const c = load(ctx({ livePos: {}, PartyList: hostColl(live, cnt), hostSnap: { party: () => rows, inv: () => null } }), ['rowsWith', 'partyRows', 'invRows', 'partyMember']);
  const m = c.partyMember('Aa');
  ok(m === live[0] && cnt.walks === 1, 'partyMember: rows without Level -> the live walk (live object)');
}
{
  const live = [P('Aa', 10)], cnt = { walks: 0, items: 0, lookups: 0, refs: 0 };
  const c = load(ctx({ livePos: {}, PartyList: hostColl(live, cnt), hostSnap: { party: () => null, inv: () => null } }), ['rowsWith', 'partyRows', 'invRows', 'partyMember']);
  ok(c.partyMember('Aa') === live[0] && cnt.walks === 1, 'partyMember: no snapshot (unpatched / login) -> the live walk');
  const c2 = load(ctx({ livePos: {}, PartyList: hostColl(live, cnt), hostSnap: { party: () => { throw new Error('x'); }, inv: () => null } }), ['rowsWith', 'partyRows', 'invRows', 'partyMember']);
  ok(c2.partyMember('Aa') === live[0], 'partyMember: snapshot throws -> the live walk');
}

// ---- 3. escapeItemCounts: rows give the same counts as the live walk
{
  const items = [{ Id: 736, Name: 'Scroll of Escape', Count: 12n, objId: 1 }, { Id: 1538, Name: 'Blessed Scroll of Escape', Count: 2n, objId: 2 }, { Id: 57, Name: 'Adena', Count: 5000n, objId: 3 },
    { Id: 7117, Name: 'Scroll of Escape: Talking Island Village', Count: 1n, objId: 4 }];
  const rows = items.map(o => ({ Id: o.Id, Name: o.Name, Count: Number(o.Count), objId: o.objId }));
  const CONFIG = { soe: { itemMatch: /Scroll of Escape/i, itemExclude: /Talking Island/i } };
  const cntA = { walks: 0, items: 0, lookups: 0, refs: 0 }, cntB = { walks: 0, items: 0, lookups: 0, refs: 0 };
  const a = load(ctx({ CONFIG, Inventory: hostColl(items, cntA), hostSnap: { party: () => null, inv: () => rows } }), ['rowsWith', 'partyRows', 'invRows', 'isEscapeItem', 'escapeItemCounts']);
  const b = load(ctx({ CONFIG, Inventory: hostColl(items, cntB), hostSnap: { party: () => null, inv: () => null } }), ['rowsWith', 'partyRows', 'invRows', 'isEscapeItem', 'escapeItemCounts']);
  const ra = JSON.stringify(a.escapeItemCounts()), rb = JSON.stringify(b.escapeItemCounts());
  ok(ra === rb, 'escapeItemCounts: rows == live walk (' + ra + ' vs ' + rb + ')');
  ok(cntA.walks === 0 && cntB.walks === 1, 'escapeItemCounts: rows -> no host walk; no rows -> the walk');
  ok(/"736":\{"name":"Scroll of Escape","count":12\}/.test(ra) && !/7117/.test(ra), 'escapeItemCounts: content');
}

// ---- 4. nearestMonster / findMobByName: identical pick, .ref read once (old: once per new best)
{
  const cnt = { walks: 0, items: 0, lookups: 0, refs: 0 };
  const mk = () => [sent({ objId: 1, X: 500, Y: 0, IsDead: false, Name: 'Wolf' }, { id: 'L1' }, cnt), sent({ objId: 2, X: 300, Y: 0, IsDead: false, Name: 'Wolf' }, { id: 'L2' }, cnt),
    sent({ objId: 3, X: 100, Y: 0, IsDead: true, Name: 'Wolf' }, { id: 'L3' }, cnt), sent({ objId: 4, X: 200, Y: 0, IsDead: false, Name: 'Wolf' }, { id: 'L4' }, cnt)];
  let list = mk();
  const c = load(ctx({ snapMobs: () => list, meSnap: () => ({ X: 0, Y: 0 }), raidBossEntries: () => null, EPIC_BOSS_RE: /^$/, isRaidBossMob: () => false }), ['nearestMonster', 'findMobByName']);
  const r = c.nearestMonster(0, 0, 1000);
  ok(r && r.id === 'L4', 'nearestMonster: nearest live one (got ' + (r && r.id) + ')');
  ok(cnt.refs === 1, 'nearestMonster: .ref read once (was once per new best), got ' + cnt.refs);
  ok(c.nearestMonster(0, 0, 50) === null && cnt.refs === 1, 'nearestMonster: nothing in range -> null, no .ref');
  cnt.refs = 0;
  const f = c.findMobByName('Wolf', 3000);
  ok(f && f.id === 'L4' && cnt.refs === 1, 'findMobByName: nearest by name, .ref once');
  ok(c.findMobByName('Bear', 3000) === null, 'findMobByName: no match -> null');
  // a winner that left view (ref null) -> null, as before
  list = [sent({ objId: 9, X: 10, Y: 0, IsDead: false, Name: 'Wolf' }, null, cnt)];
  ok(c.nearestMonster(0, 0, 1000) === null, 'nearestMonster: winner gone from view -> null (as before)');
}

// ---- 5. resurrection: who is dead (RES-HOST resGather, 2026-10-13; replaced the old 4 s hive "res pick" block of 2026-10-12)
//      the party rows find the dead + their body position / object id (one snapshot, no host walk); the live PartyList walk only when the rows
//      are missing or lack a field; a fresh teammate report (livePos) wins for the position; a dead row's objId is the one the res targets.
{
  let have = true; try { fnSrc('resGather'); } catch (e) { have = false; }
  ok(have, 'resGather found (RES-HOST)');
  if (have) {
    const run = (live, rows, lp) => {
      const cnt = { walks: 0, items: 0, lookups: 0, refs: 0 }, coll = hostColl(live, cnt);
      let snapCalls = 0;
      const c = load(ctx({ Me: { Name: 'Me', X: 0, Y: 0, Z: 0, IsDead: false }, livePos: lp || {}, PartyList: coll, CONFIG: { roster: {} }, state: { role: 'nuker' },
        HEALER_ROLES: /bishop|healer|saint/, ROLE_RE: { tank: /^sk$|tank/ }, RES: { claims: {} }, isHealerRole: () => false, resMeBusy: () => false,
        resKit: () => ({ skill: null, mass: null, sor: 0, sorId: 0, bsor: 0, bsorId: 0 }), teamNames: () => ['Me'].concat(live.map(o => o.Name)),
        partyRows: () => { snapCalls++; return rows; } }), ['resGather']);
      return { g: c.resGather(), cnt, snapCalls };
    };
    const live = [P('Aa', 100, { IsDead: true }), P('Bb', 200, { IsDead: true })];
    let r = run(live, live.map(o => Object.assign({}, o)));
    ok(r.g.dead.map(d => d.name).join() === 'Aa,Bb' && r.g.dead[0].objId === 100 && r.g.dead[0].x === 100, 'res gather: the dead from the rows, with body position + object id');
    ok(r.cnt.walks === 0 && r.cnt.items === 0 && r.snapCalls === 1, 'res gather: one party snapshot, no host walk');
    const revived = [P('Aa', 100, { IsDead: false }), P('Bb', 200, { IsDead: true })];
    r = run(revived, revived.map(o => Object.assign({}, o)));
    ok(r.g.dead.map(d => d.name).join() === 'Bb', 'res gather: a revived teammate is not on the dead list');
    r = run(live, null);
    ok(r.g.dead.length === 2 && r.cnt.walks === 1, 'res gather: no rows -> the live walk (once)');
    r = run(live, live.map(o => Object.assign({}, o)), { Aa: { X: 555, Y: 2, Z: 3, at: 1000000 - 1000, IsDead: true } });
    ok(r.g.dead[0].x === 555 && r.g.dead[0].objId === 100, 'res gather: a fresh teammate report gives the position, the row the object id');
    r = run([P('Aa', 0, { IsDead: true, Y: 0 })], [P('Aa', 0, { IsDead: true, Y: 0 })]);
    ok(r.g.dead.length === 0, 'res gather: a body at 0,0 (no position known) -> nobody');
  }
}

// ---- 6. every HOSTTOUCH edit is in the file
['(invRows([\'Id\', \'Name\', \'Count\']) || Inventory).forEach', 'const tg = Target, tid = tg ? tg.objId : 0', '(partyRows([\'objId\']) || PartyList)', '(partyRows([\'objId\', \'Name\']) || PartyList)', '(partyRows([\'Name\']) || PartyList)']
  .forEach(t => ok(src.includes(t), 'present: ' + t));
ok(!/t = m\.ref; \} \}\); \} catch \(e\) \{ \}/.test(src.slice(src.indexOf('function nnFight('), src.indexOf('function nnFollow('))), 'nnFight: no .ref per new best left');

console.log(`test_hosttouch: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
