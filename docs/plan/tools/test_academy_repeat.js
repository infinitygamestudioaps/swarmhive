// ACADREPEAT-2026-11-03 (owner: "the academy toons have to do the exact same thing again when they all are done in academy. So make sure no
// mistakes and it can be run over and over again"): a full-cycle REPLAY in a sandbox - generation 1 runs, graduates, the accounts are
// re-created one by one (out of order, one late, one leader account stuck), the manager's group sync re-forms the groups by itself, the new
// leaders get the group plan / run switch, the members never own an ON key, the late member catches up / waits, an old member left behind
// graduates itself. Pure decisions (academy_logic + swarm.js ACADREPEAT) + academy_api groupSync on a temp folder with stubbed plan / run APIs.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const R = path.join(__dirname, '../../..');
const AL = require(path.join(R, 'Dashboard/academy_logic.js'));
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x).slice(0, 300))); } };

// ---------------------------------------------------------------- swarm.js pure parts
const SRC = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8');
const a0 = SRC.indexOf('// ACADREPEAT-2026-11-03 (owner: "it can be run over and over again") - a member'), a1 = SRC.indexOf('// ACADGROUP-PURE-END');
const SW = new Function(SRC.slice(a0, a1) + '\nreturn { acadStepFresh, acadCatchUpPick, acadSelfGradDue, acadParkDue };')();
const C = AL.academyCfg({ groups: { on: true, size: 5 }, spots: { to35: { mode: 'manual', kind: 'rooms', roomIds: ['r1'], override: true }, to40: { mode: 'manual', kind: 'rooms', roomIds: ['r1'], override: true }, to40Rooms: ['cruma-1-left-a', 'cruma-1-left-e'] } });
const steps = AL.academyGroupPlanSteps(C, 0), ix = (id) => steps.findIndex(s => s.id === id);

t('acadStepFresh: a step I finished ok 10 min ago is not run again, an old / failed one is', SW.acadStepFresh({ id: 'acjoin', end: true, ok: true, ended: new Date(Date.now() - 600000).toISOString() }, 'acjoin', Date.now())
  && !SW.acadStepFresh({ id: 'acjoin', end: true, ok: true, ended: new Date(Date.now() - 50 * 60000).toISOString() }, 'acjoin', Date.now())
  && !SW.acadStepFresh({ id: 'acjoin', end: true, ok: false, ended: new Date().toISOString() }, 'acjoin', Date.now()));
{ // a late member (level 1) whose leader is at the level-10 step already: join, funds, start kit, then the weapon coupon at level 6
  const at = ix('aclv10'), none = new Set();
  const p1 = SW.acadCatchUpPick(steps, at, none, 1), p2 = SW.acadCatchUpPick(steps, at, new Set(['acjoin']), 1), p3 = SW.acadCatchUpPick(steps, at, new Set(['acjoin', 'acfunds', 'acbuy1']), 1);
  const p4 = SW.acadCatchUpPick(steps, at, new Set(['acjoin', 'acfunds', 'acbuy1']), 6);
  t('catch-up: a late member does join -> funds -> start kit in order, the weapon coupon only from level 6', p1 && p1.id === 'acjoin' && p2 && p2.id === 'acfunds' && p3 === null && p4 && p4.id === 'accpw', [p1 && p1.id, p2 && p2.id, p3, p4 && p4.id]);
  const all = new Set(steps.filter(s => s.kind === 'academy').map(s => s.id));
  t('catch-up: nothing when every missed step is done, never a step at / after the leader', SW.acadCatchUpPick(steps, ix('aclv40'), all, 40) === null && SW.acadCatchUpPick(steps, 0, none, 1) === null);
  t('catch-up: the jewels only once the level-30 part of the route is reached', (() => { const d = new Set([...all].filter(i => i !== 'acbuyjw')); return SW.acadCatchUpPick(steps, ix('aclv35'), d, 25) === null && (SW.acadCatchUpPick(steps, ix('aclv35'), d, 30) || {}).id === 'acbuyjw'; })());
}
t('self graduation: an old member at 40 whose group is a NEW generation (plan before the 40 step) graduates itself',
  SW.acadSelfGradDue({ level: 40, gradLevel: 40, leaderIdx: 2, gradIdx: ix('aclv40'), leaderSeen: 1000 }) && !SW.acadSelfGradDue({ level: 40, gradLevel: 40, leaderIdx: ix('aclv40'), gradIdx: ix('aclv40'), leaderSeen: 1000 }));
t('self graduation: also when the leader has been gone 20 min; never below 40', SW.acadSelfGradDue({ level: 40, leaderIdx: ix('aclv40'), gradIdx: ix('aclv40'), leaderSeen: 21 * 60000 }) && !SW.acadSelfGradDue({ level: 39, leaderIdx: 0, gradIdx: ix('aclv40'), leaderSeen: 21 * 60000 }));
t('park: a late level-3 member waits in Giran while its group (lvl 33) hunts the fixed Cruma room; with a free (auto) spot it levels with them',
  SW.acadParkDue({ level: 3, othersMin: 33, overrideSpot: true }) && !SW.acadParkDue({ level: 3, othersMin: 33, overrideSpot: false }) && !SW.acadParkDue({ level: 25, othersMin: 33, overrideSpot: true }));
t('source: the parked member is out of the group level (lvlToMin) and the ball (tightMates), its pos carries acPark',
  SRC.includes('if (lp && lp.acPark) return;   // ACADREPEAT') && SRC.includes("!(livePos[n] && livePos[n].acPark)") && SRC.includes('acPark: !!d.acPark') && SRC.includes('acPark: (() => { try { return !!(typeof ACREP'));
t('source: the join step waits for the roster mates and re-sends every 60 s; a member never re-runs a fresh step',
  SRC.includes("const gather = step.act === 'join';") && SRC.includes("if (now() - resentAt > 60000) { resentAt = now(); planSend(`!acadstep ${step.id}`); }") && SRC.includes('if (acadStepFresh(r, id, now())) return;'));
t('source: a catch-up step gets at most 3 tries, 10 min apart (never a loop)', SRC.includes('const T = D.tries || {}, given = Object.keys(T).filter(k => (T[k] && T[k].n) >= 3);') && SRC.includes('now() - (Date.parse(T[pick.id].at || \'\') || 0) < 10 * 60000'));
t('source: an established member (above level 5) without a done record is seeded, never re-runs the old kit / trips', SRC.includes("if (num(Me.Level) > 5) steps.slice(0, idx).forEach(s => { if (s && s.kind === 'academy') D.done[String(s.id)] = 'seeded '"));

// ---------------------------------------------------------------- the manager: group sync over two generations (sandbox folder)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acadrepeat-'));
['Scripts/data', 'Logs', 'Settings/backup', 'Scripts'].forEach(d => fs.mkdirSync(path.join(tmp, d), { recursive: true }));
const W = (f, j) => fs.writeFileSync(path.join(tmp, f), JSON.stringify(j, null, 2));
const acc = (i, ch, party) => ({ login: 'igs' + i, character: ch, party, config: 'Igs' + i + '.xml', role: 'nuker', academyMage: true });
let cfg = { mainLeader: 'Tank1', accounts: [{ login: 'mylogin1', character: 'Tank1', party: 'Tank1', role: 'sk' }] };
for (let i = 1; i <= 10; i++) cfg.accounts.push(acc(i, (i <= 5 ? 'A' : 'B') + i, i <= 5 ? 'A1' : 'B6'));
W('swarm.config.json', cfg);
W('Scripts/data/academy.json', { groups: { on: true, size: 5 }, spots: { to40Rooms: ['cruma-1-left-a', 'cruma-1-left-e'] } });
W('Scripts/data/run_state.json', { parties: { A1: { on: true }, B6: { on: true }, A3: { on: true } } });
W('Scripts/data/party_auto.json', { parties: { A1: { sell: true, storeMagnus: true } } });
['fund_rules.json', 'loot_rules.json'].forEach(f => W('Scripts/data/' + f, { parties: {} })); W('Scripts/data/party_spots.json', {}); W('Scripts/data/party_tactics.json', {});
W('Scripts/data/party_plans.json', { v: 1, parties: {} });
const calls = [];
const RS = require(path.join(R, 'Dashboard/runstate_api.js')), PP = require(path.join(R, 'Dashboard/partyplan_api.js'));
RS.post = async (ctx, b) => { calls.push(['run', b.party, b.on, b.send]); const F = path.join(tmp, 'Scripts/data/run_state.json'), j = JSON.parse(fs.readFileSync(F, 'utf8')); j.parties[b.party] = { on: b.on }; fs.writeFileSync(F, JSON.stringify(j)); return { ok: true }; };
PP.post = async (ctx, b) => { calls.push(['plan', b.party, b.plan && b.plan.name]); const F = path.join(tmp, 'Scripts/data/party_plans.json'), j = JSON.parse(fs.readFileSync(F, 'utf8')); j.parties[b.party] = b.plan; fs.writeFileSync(F, JSON.stringify(j)); return { ok: true }; };
const API = require(path.join(R, 'Dashboard/academy_api.js'));
const ctx = { ROOT: tmp, DATA: path.join(tmp, 'Scripts/data'), LOGS: path.join(tmp, 'Logs'), SETTINGS: path.join(tmp, 'Settings'), CONFIG_FILE: path.join(tmp, 'swarm.config.json') };
const M = { accounts: {} }; for (let i = 1; i <= 10; i++) M.accounts['igs' + i] = { setupFor: (i <= 5 ? 'A' : 'B') + i, made: 1 };
const cfgNow = () => JSON.parse(fs.readFileSync(ctx.CONFIG_FILE, 'utf8'));
const partyOf = (n) => (cfgNow().accounts.find(a => a.character === n) || {}).party;
const st = (n, s) => fs.writeFileSync(path.join(ctx.LOGS, `academy_${n}.json`), JSON.stringify({ name: n, status: s }));
const rename = (login, newName) => { API.rosterRename(ctx, login, cfgNow().accounts.find(a => a.login === login).character, newName); M.accounts[login].setupFor = newName; };

(async () => {
  // generation 1 running: nothing moves, the stuck old solo key (A3) of a member goes OFF
  let d = await API.groupSync(ctx, M, AL.academyCfg(JSON.parse(fs.readFileSync(path.join(ctx.DATA, 'academy.json'), 'utf8'))));
  const RM = { mode: 'manual', kind: 'rooms', dungeon: 'Cruma Tower', roomIds: ['cruma-1-left-a', 'cruma-1-left-e'], override: true, stay: true };
  const Cx = AL.academyCfg({ groups: { on: true, size: 5 }, spots: { to35: RM, to40: RM, to40Rooms: ['cruma-1-left-a', 'cruma-1-left-e'] } });
  t('gen 1 running: no party moves, no new leader, the leaders become the sticky ones', !d.some(x => / -> /.test(x)) && !calls.some(c => c[0] === 'plan') && M.groups[0].leader === 'A1' && M.groups[1].leader === 'B6', d);
  t('gen 1: a member\'s own ON party key (old solo plan) is switched OFF by itself, without a stop order', calls.some(c => c[0] === 'run' && c[1] === 'A3' && c[2] === false && c[3] === false), calls);
  // the whole group A graduates
  for (let i = 1; i <= 5; i++) st('A' + i, 'graduated');
  calls.length = 0; d = await API.groupSync(ctx, M, Cx);
  t('group A graduated: nobody ready -> no moves while the graduates hand over and log out', !calls.length && !d.some(x => / -> /.test(x)), d);
  // re-created out of order: mylogin84 first (a member), then mylogin82 (the leader account)
  rename('mylogin84', 'N3'); calls.length = 0; d = await API.groupSync(ctx, M, Cx);
  t('first re-created character of group A (N3, a member account) leads the new generation', M.groups[0].leader === 'N3' && partyOf('N3') === 'N3' && calls.some(c => c[0] === 'plan' && c[1] === 'N3'), { d, calls, g: M.groups[0] });
  t('the new leader gets the group plan of ITS group (own Cruma room), its run switch ON, the old leader key OFF',
    (() => { const pp = JSON.parse(fs.readFileSync(path.join(ctx.DATA, 'party_plans.json'), 'utf8')).parties.N3; const s = pp && pp.steps.find(x => x.id === 'aclv40'); return pp && pp.template === 'academy' && s && s.spot.roomIds && s.spot.roomIds[0] === 'cruma-1-left-a'; })()
    && calls.some(c => c[0] === 'run' && c[1] === 'N3' && c[2] === true) && calls.some(c => c[0] === 'run' && c[1] === 'A1' && c[2] === false && c[3] === false));
  t('the old leader\'s party settings are copied to the new leader key', (JSON.parse(fs.readFileSync(path.join(ctx.DATA, 'party_auto.json'), 'utf8')).parties.N3 || {}).storeMagnus === true);
  rename('mylogin82', 'N1'); calls.length = 0; d = await API.groupSync(ctx, M, Cx);
  t('the old leader account re-created later (N1) joins N3\'s party as a member - no second leader, the sticky leader stays', partyOf('N1') === 'N3' && M.groups[0].leader === 'N3' && !calls.some(c => c[0] === 'plan'), { d, p: partyOf('N1') });
  t('acadSetupRole after the sync: N1 = member (no own plan / run switch), N3 = leader of group 1', API.acadSetupRole(cfgNow().accounts.find(a => a.character === 'N1'), cfgNow().accounts.filter(a => a.academyMage), Cx).member === true
    && API.acadSetupRole(cfgNow().accounts.find(a => a.character === 'N3'), cfgNow().accounts.filter(a => a.academyMage), Cx).index === 0);
  rename('mylogin83', 'N2'); rename('mylogin85', 'N4'); d = await API.groupSync(ctx, M, Cx);
  t('the rest of the new generation lands in N3\'s party by itself; mylogin86 (slots full) is still the graduate A5 - left alone', ['N1', 'N2', 'N4'].every(n => partyOf(n) === 'N3') && partyOf('A5') !== undefined, ['N1', 'N2', 'N4', 'A5'].map(partyOf));
  rename('mylogin86', 'N5'); d = await API.groupSync(ctx, M, Cx);
  t('the late one (N5, hours later) joins the same group as a member', partyOf('N5') === 'N3' && M.groups[0].leader === 'N3');
  t('group B (still generation 1) was never touched', [6, 7, 8, 9, 10].every(i => partyOf('B' + i) === 'B6') && M.groups[1].leader === 'B6');
  // generation 2 of group A graduates too: the next first re-created character leads again (over and over)
  for (const n of ['N1', 'N2', 'N3', 'N4', 'N5']) st(n, 'graduated');
  rename('mylogin82', 'O1'); calls.length = 0; d = await API.groupSync(ctx, M, Cx);
  t('generation 3: O1 leads, gets the group plan + run switch, N3\'s key OFF', M.groups[0].leader === 'O1' && partyOf('O1') === 'O1' && calls.some(c => c[0] === 'plan' && c[1] === 'O1') && calls.some(c => c[0] === 'run' && c[1] === 'N3' && c[2] === false), { d, calls });
  // the manager decision for a graduate stays 'next', a new name stays 'setup'
  t('academyDecide: graduated -> next, a new character -> setup', AL.academyDecide({ login: 'mylogin83', character: 'N2', academyMage: true }, { status: 'graduated', name: 'N2' }, null, { setupFor: 'N2' }, Cx).act === 'next'
    && AL.academyDecide({ login: 'mylogin82', character: 'O1', academyMage: true }, null, null, { setupFor: 'N1' }, Cx).act === 'setup');
  t('source: the manager runs the group sync every tick before the setups', /try \{ const g = await groupSync\(ctx, M, C\);[\s\S]{0,200}const accs = academyAccounts\(ctx\);/.test(fs.readFileSync(path.join(R, 'Dashboard/academy_api.js'), 'utf8')));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  t("ACADCLASSPARTY: a group member gets its approved class plan under its leader party", fs.readFileSync(path.join(R, "Dashboard", "academy_api.js"), "utf8").includes("leader: cpParty, name, plan: C.classPlan, approve: true"));
  // GROUPGRAD-2026-11-04 (owner: "all toons reach lvl 40 before going back to town ... the level 1 toon must wait for the 4 toons"): a graduate
  // gets its next character only when its whole group graduated (or already started the new generation)
  { const G5 = ['mylogin87', 'mylogin88', 'mylogin89', 'mylogin90', 'mylogin91'], g = new Set(['mylogin87']), m = { mylogin87: 1, mylogin88: 1, mylogin89: 1, mylogin90: 1, mylogin91: 1 };
    const AGR = AL.academyGroupReady;
    t('GROUPGRAD: one graduate alone waits for the other 4', AGR && AGR(G5, 'mylogin87', l => g.has(l), l => m[l]).ready === false);
    G5.forEach(l => g.add(l)); t('GROUPGRAD: the whole group graduated = new characters', AGR(G5, 'mylogin87', l => g.has(l), l => m[l]).ready === true);
    t('GROUPGRAD: the manager checks it before "next"', /dec\.act === 'next' && C\.groups && C\.groups\.on/.test(fs.readFileSync(path.join(R, 'Dashboard/academy_api.js'), 'utf8')) && /AL\.academyGroupReady\(/.test(fs.readFileSync(path.join(R, 'Dashboard/academy_api.js'), 'utf8'))); }
console.log(`academy repeat: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
