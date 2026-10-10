// Unit test of Dashboard/kamalogic.js (KAMALOKA PAGE 2026-10-09): fit / today / next pick per party = swarm.js dailyDue + manualKamaloka,
// and the HALL TEAM PER PARTY (user 2026-10-09 16:05: "a Kamaloka hall team per party, so 9-member parties can run Halls").
//   node docs/plan/tools/test_kamalogic.js
// 1) the KAMAHALL-PURE block: Dashboard/kamalogic.js must carry the SAME text as Scripts_dev/swarm.js
// 2) fit / today / next with synthetic parties (real Kamaloka list: Scripts/data/dungeons_h5.json, game data only)
// 3) hall team per party: configured (kamaloka.hallTeams), the old global list (its own party only), automatic (tank, healers, dealers)
// 4) mirror: 600 random parties (random roles, levels, hall settings, done / tries) -> kamalogic evalParty == the swarm.js block run the way
//    swarm.js dailyDue / benchForHall run it
// 5) swarm.js benchForHall() itself, run in node with mocked host calls, for three parties at once (per-party bench, town, null when no team)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const KL = require(path.join(ROOT, 'Dashboard', 'kamalogic.js'));
const KAMAS = require(path.join(ROOT, 'Scripts', 'data', 'dungeons_h5.json')).kamaloka;
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const KSRC = fs.readFileSync(path.join(ROOT, 'Dashboard', 'kamalogic.js'), 'utf8');
let fails = 0, n = 0;
const ok = (name, cond, info) => { n++; if (!cond) fails++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && info !== undefined ? ' - ' + JSON.stringify(info) : ''}`); };
const party = (leader, lv, extra = {}, roles) => ({ leader, members: lv.map((l, i) => ({ name: i ? `${leader}${i}` : leader, level: l, online: true, role: roles ? roles[i] || '' : '' })), done: {}, tries: {}, enabled: true, ...extra });
const nine = (leader, l, roles) => party(leader, Array(9).fill(l), {}, roles);
const HALL = ['Tank', 'Tank1', 'Tank2', 'Tank3', 'Tank4', 'Tank5'];
const K = (lvl) => KAMAS.find(k => k.id === 'kamaloka-' + lvl);
const block = (s) => { const a = s.indexOf('// KAMAHALL-PURE-BEGIN'), b = s.indexOf('// KAMAHALL-PURE-END'); return a >= 0 && b > a ? s.slice(a, b) : null; };

console.log('the shared block');
const SB = block(SRC), KB = block(KSRC);
ok('KAMAHALL-PURE block found in Scripts_dev/swarm.js and Dashboard/kamalogic.js', !!SB && !!KB);
ok('the two blocks are the same text (copy swarm.js -> kamalogic.js after a change)', SB === KB, SB && KB ? [SB.length, KB.length] : null);
ok('no new Map() in the block (L2Swarm world-map host type)', SB && !/new Map\(/.test(SB));
const SW = new Function(SB + '\nreturn { KAMAHALL, kamaHallCfg, kamaHallPick, kamaDailyPick, kamaBenchPlan };')();

console.log('day key (06:30 reset)');
ok('06:29 belongs to the day before', KL.dayKey(new Date(2026, 9, 9, 6, 29).getTime()) === '2026-10-08');
ok('06:31 is the new day', KL.dayKey(new Date(2026, 9, 9, 6, 31).getTime()) === '2026-10-09');
ok('23:59 is the same day', KL.dayKey(new Date(2026, 9, 9, 23, 59).getTime()) === '2026-10-09');
{ const b = KL.dayBounds(new Date(2026, 9, 9, 14, 0).getTime()); ok('bounds: 06:30 today -> 06:30 tomorrow', b.start === new Date(2026, 9, 9, 6, 30).getTime() && b.next === new Date(2026, 9, 10, 6, 30).getTime()); }

console.log('fit');
{ const e = KL.evalParty(KAMAS, nine('Tank', 52), HALL);
  ok('9 at lvl 52: Labyrinth 49 fits the whole party', e.rows['kamaloka-49'].fit === 'fits' && e.rows['kamaloka-49'].ok);
  ok('9 at lvl 52, old global list holds the leader: Hall 56 = that hall team, 3 sit out', e.rows['kamaloka-56'].fit === 'hall' && e.rows['kamaloka-56'].sitOut === 3 && e.rows['kamaloka-56'].ok && e.hallSrc === 'legacy');
  ok('chip text: "fits — hall team: Tank, Tank1, ..."', e.rows['kamaloka-56'].txt === 'fits — hall team: ' + HALL.join(', '), e.rows['kamaloka-56'].txt);
  ok('THE BUG: next = Labyrinth 49 (the whole party first), not the higher Hall 56', e.next && e.next.id === 'kamaloka-49' && !e.next.hall, e.next);
  ok('too low: Labyrinth 59 (54-64)', e.rows['kamaloka-59'].fit === 'low');
  ok('too high: Hall 23 (18-28)', e.rows['kamaloka-23'].fit === 'high'); }
{ const e = KL.evalParty(KAMAS, party('Solo', [43]), HALL);
  ok('a solo character: too few for every Kamaloka, no next', Object.values(e.rows).every(r => r.fit === 'small') && !e.next && /2 or more/.test(e.nextTxt)); }
{ const e = KL.evalParty(KAMAS, party('Mix', [30, 31, 45]), HALL);
  ok('levels 30-45: too spread for Labyrinth 39 (34-44)', e.rows['kamaloka-39'].fit === 'spread', e.rows['kamaloka-39']); }
{ const e = KL.evalParty(KAMAS, party('Unk', [40, null, 41]), HALL);
  ok('unknown level counts as the leader\'s level (swarm.js lvlOf)', e.unknown.length === 1 && e.rows['kamaloka-43'].fit === 'fits'); }
{ const p = nine('Tank', 52); p.members[1].online = false;
  const e = KL.evalParty(KAMAS, p, HALL);
  ok('an offline member: not ready, waits for him', !e.ready && e.waitFor.length === 1 && e.next); }

console.log('today / next');
{ const p = nine('Tank', 52); p.tries['kamaloka-49'] = 2;
  const e = KL.evalParty(KAMAS, p, HALL);
  ok('2 tries used: Labyrinth 49 has no tries left', e.rows['kamaloka-49'].today === 'tries' && !e.rows['kamaloka-49'].free);
  ok('... next falls to the hall team: Hall 56 with its names', e.next && e.next.id === 'kamaloka-56' && e.next.hall && e.next.names.join() === HALL.join() && e.hallNames.length === 6, e.next); }
{ const p = nine('Tank', 52); p.done['kamaloka-49'] = '2026-10-09T08:00:00Z could not enter — server said: #2100 Tank';
  ok('#2100 = locked', KL.evalParty(KAMAS, p, HALL).rows['kamaloka-49'].today === 'locked'); }
{ const p = nine('Tank', 52); p.done['kamaloka-49'] = 'x cleared'; p.tries['kamaloka-49'] = 1;
  ok('cleared', KL.evalParty(KAMAS, p, HALL).rows['kamaloka-49'].today === 'cleared'); }
{ const p = nine('Tank', 52); p.tries['kamaloka-49'] = 1;
  const r = KL.evalParty(KAMAS, p, HALL).rows['kamaloka-49'];
  ok('1 try used: open, 1 left, still the next pick', r.today === 'open' && r.left === 1 && KL.evalParty(KAMAS, p, HALL).next.id === 'kamaloka-49'); }
{ const p = nine('Tank', 52); ['kamaloka-49', 'kamaloka-56', 'kamaloka-53'].forEach(id => { p.done[id] = 'cleared'; });
  const e = KL.evalParty(KAMAS, p, HALL);
  ok('everything that fits used up: no next, says so', !e.next && /used up/.test(e.nextTxt), e.nextTxt); }

console.log('hall team per party');
// party Orc: 9 members, roles: leader destroyer, a tank, three healers, dealers of mixed levels
const ROLES9 = ['destroyer', 'sk', 'bishop', 'shilliensaint', 'healer', 'necromancer', 'doomcryer', 'nuker', 'spoiler'];
{ const p = party('Orc', [37, 36, 35, 37, 34, 38, 36, 37, 36], {}, ROLES9);
  const e = KL.evalParty(KAMAS, p, { hallTeams: {}, legacy: HALL });
  const r = e.rows['kamaloka-36'];
  ok('no hall team set + the global list is another party\'s: AUTOMATIC per party (was "too many")', e.hallSrc === 'auto' && r.fit === 'hall' && r.ok, r);
  ok('auto: leader + 1 tank + 2 healers (the highest) + the strongest dealers = 6', r.hallNames && r.hallNames.join() === 'Orc,Orc1,Orc3,Orc2,Orc5,Orc7', r.hallNames);
  ok('auto: 3 sit out', r.sitOut === 3);
  ok('auto: a member below the Hall window is never picked (Hall 36 = 31-41, all fit; Hall 39? no, Labyrinth) -> Hall 33 (28-38) ok too', e.rows['kamaloka-33'].fit === 'hall');
  ok('9-member party: Labyrinth 39 first (whole party)', e.next && e.next.id === 'kamaloka-39' && !e.next.hall, e.next);
  p.done['kamaloka-39'] = 'x cleared';
  const e2 = KL.evalParty(KAMAS, p, { hallTeams: {}, legacy: HALL });
  ok('Labyrinth 39 done: next = Hall 36 with the automatic hall team', e2.next && e2.next.id === 'kamaloka-36' && e2.next.hall && e2.next.names.length === 6, e2.next); }
{ const p = party('Orc', [37, 36, 35, 37, 34, 38, 36, 37, 36], {}, ROLES9);
  const cfg = { hallTeams: { Orc: ['Orc', 'Orc4', 'Orc6', 'Orc8', 'Orc2'] }, legacy: HALL };
  const e = KL.evalParty(KAMAS, p, cfg);
  ok('configured (kamaloka.hallTeams.Orc): used as set, 5 go, 4 sit out', e.hallSrc === 'party' && e.rows['kamaloka-36'].hallNames.join() === 'Orc,Orc4,Orc6,Orc8,Orc2' && e.rows['kamaloka-36'].sitOut === 4, e.rows['kamaloka-36']);
  ok('configured: Hall 33 too (28-38)', e.rows['kamaloka-33'].fit === 'hall');
  ok('configured: Hall 43 (38-48) -> "hall team too low"', e.rows['kamaloka-43'].fit === 'low' && /^hall team too low/.test(e.rows['kamaloka-43'].txt), e.rows['kamaloka-43']);
  const e2 = KL.evalParty(KAMAS, p, { hallTeams: { Orc: ['Orc', 'Ghost'] } });
  ok('configured with a name not in the party: too many + why', e2.rows['kamaloka-36'].fit === 'big' && /not in the party: Ghost/.test(e2.rows['kamaloka-36'].txt), e2.rows['kamaloka-36'].txt);
  const e3 = KL.evalParty(KAMAS, p, { hallTeams: { Orc: ['Orc1', 'Orc2'] } });
  ok('configured without the leader: refused (the leader runs the mission)', e3.rows['kamaloka-36'].fit === 'big' && /include the leader/.test(e3.rows['kamaloka-36'].txt)); }
{ // two 9-member parties at the same time: each its own team, nothing crosses
  const a = party('Alpha', Array(9).fill(52), {}, ROLES9), b = party('Beta', Array(9).fill(52), {}, ROLES9);
  const cfg = { hallTeams: { Alpha: ['Alpha', 'Alpha1', 'Alpha2', 'Alpha3', 'Alpha4', 'Alpha5'] }, legacy: ['Alpha'] };
  const ea = KL.evalParty(KAMAS, a, cfg), eb = KL.evalParty(KAMAS, b, cfg);
  ok('Alpha: its own configured team', ea.rows['kamaloka-56'].hallNames.every(x => x.startsWith('Alpha')) && ea.hallSrc === 'party');
  ok('Beta: automatic, only Beta names', eb.rows['kamaloka-56'].hallNames.every(x => x.startsWith('Beta')) && eb.hallSrc === 'auto' && eb.rows['kamaloka-56'].ok); }
{ // auto: the leader outside the window -> no team (the Hall says too low / high)
  const p = party('Low', [30, 45, 45, 45, 45, 45, 45, 45, 45]);
  const r = KL.evalParty(KAMAS, p, []).rows['kamaloka-46'];
  ok('auto: leader lvl 30, Hall 46 (41-51) -> not runnable (levels)', !r.ok && /low|spread/.test(r.fit), r); }
{ // auto: only 3 inside the window -> a hall team of 3 (partyMin 2)
  const p = party('Few', [40, 40, 40, 20, 20, 20, 20, 20, 20]);
  const r = KL.evalParty(KAMAS, p, []).rows['kamaloka-36'];
  ok('auto: only the 3 inside lvl 31-41 go', r.ok && r.hallNames.length === 3 && r.sitOut === 6, r); }
{ const p = party('Six', [52, 52, 52, 52, 52, 52]);
  const e = KL.evalParty(KAMAS, p, { hallTeams: { Six: ['Six', 'Six1'] } });
  ok('a party of 6: a Hall is the WHOLE party (the hall team is not used)', e.rows['kamaloka-56'].fit === 'fits' && !e.rows['kamaloka-56'].hallNames); }
{ const c = KL.checkHallTeam('Orc', ['Orc', 'A', 'B', 'C', 'D', 'E', 'F'], ['A', 'Orc', 'B', 'B']);
  ok('editor check: unique, leader first', c.ok && c.names.join() === 'Orc,A,B', c);
  ok('editor check: 7 refused', !KL.checkHallTeam('Orc', ['Orc', 'A', 'B', 'C', 'D', 'E', 'F'], ['Orc', 'A', 'B', 'C', 'D', 'E', 'F']).ok);
  ok('editor check: without the leader refused', !KL.checkHallTeam('Orc', ['Orc', 'A'], ['A', 'B']).ok);
  ok('editor check: a stranger refused', /not in party/.test(KL.checkHallTeam('Orc', ['Orc', 'A'], ['Orc', 'Zed']).why));
  ok('editor check: leader alone refused (2-6)', !KL.checkHallTeam('Orc', ['Orc', 'A'], ['Orc']).ok);
  ok('suggestion for the editor = the automatic pick', JSON.stringify(KL.evalParty(KAMAS, party('Orc', [37, 36, 35, 37, 34, 38, 36, 37, 36], {}, ROLES9), []).hallSuggest) === JSON.stringify(['Orc', 'Orc1', 'Orc3', 'Orc2', 'Orc5', 'Orc7'])); }

console.log('mirror of swarm.js (random parties)');
/** swarm.js dailyDue + benchForHall, the way they run: mates = me + teamNames (unknown level -> mine), the hall settings read live */
function swarmSide(P, cfg) {
  const leadLv = Number(P.members[0].level) || 0;
  const mates = P.members.map(m => ({ name: m.name, lv: Number(m.level) || leadLv, role: m.role || '' }));
  const free = (k) => !P.done[k.id] && (P.tries[k.id] || 0) < 2;
  const roles = { healer: KL.HEALER_ROLES, tank: SW.KAMAHALL.tankRoles };
  const cfgNames = SW.kamaHallCfg({ hallTeams: cfg.hallTeams, legacy: cfg.legacy }, P.leader);
  const p = SW.kamaDailyPick(KAMAS, mates, P.leader, free, cfgNames, roles);
  const benches = {}; KAMAS.filter(k => k.partyMax <= 6).forEach(k => { const b = SW.kamaBenchPlan(k, mates, P.leader, cfgNames, roles); benches[k.id] = b.ok ? b.team : null; });
  return { next: p ? { id: p.k.id, hall: p.hall, names: p.names } : null, benches };
}
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const ROLE_POOL = ['sk', 'bishop', 'shilliensaint', 'healer', 'destroyer', 'doombringer', 'necromancer', 'nuker', 'inspector', 'dagger', 'doomcryer', 'spoiler', 'crafter', ''];
let same = 0, sameB = 0, total = 600, shown = 0, hallPicks = 0;
for (let i = 0; i < total; i++) {
  const size = 1 + Math.floor(rnd() * 9), base = 15 + Math.floor(rnd() * 75);
  const lv = Array.from({ length: size }, () => (rnd() < .05 ? null : base + Math.floor(rnd() * 5) - (rnd() < .15 ? 8 : 0)));
  lv[0] = lv[0] || base;
  const roles = Array.from({ length: size }, () => ROLE_POOL[Math.floor(rnd() * ROLE_POOL.length)]);
  const p = party('Tank', lv, {}, roles);
  KAMAS.forEach(k => { const r = rnd(); if (r < .12) p.done[k.id] = 'x'; else if (r < .25) p.tries[k.id] = 1 + Math.floor(rnd() * 2); });
  const r = rnd(), names = p.members.map(m => m.name);
  const cfg = r < .3 ? { hallTeams: {}, legacy: HALL.slice(0, 1 + Math.floor(rnd() * 6)) }
    : r < .6 ? { hallTeams: { Tank: ['Tank'].concat(names.slice(1).filter(() => rnd() < .6)).slice(0, 2 + Math.floor(rnd() * 6)).concat(rnd() < .1 ? ['Ghost'] : []) }, legacy: [] }
    : r < .7 ? { hallTeams: { Other: ['Other', 'X'] }, legacy: ['Someone', 'Else'] } : { hallTeams: {}, legacy: [] };
  const want = swarmSide(p, cfg), e = KL.evalParty(KAMAS, p, cfg);
  if (want.next && want.next.hall) hallPicks++;
  if (JSON.stringify(want.next) === JSON.stringify(e.next)) same++; else if (shown++ < 5) console.log('    next differs', JSON.stringify({ lv, roles, cfg, want: want.next, got: e.next }));
  // every Hall: the dashboard's hall team (runnable) == swarm.js benchForHall's team, for parties bigger than 6
  const hallsOk = KAMAS.filter(k => k.partyMax <= 6).every(k => {
    const row = e.rows[k.id], b = want.benches[k.id];
    if (size <= 6) return true;
    if (!e.levels) return true;
    return row.ok ? JSON.stringify(row.hallNames) === JSON.stringify(b) : b === null || !lv[0];
  });
  if (hallsOk) sameB++; else if (shown++ < 5) console.log('    hall differs', JSON.stringify({ lv, roles, cfg }));
}
ok(`next pick = swarm.js dailyDue for ${total} random parties (${hallPicks} of them a Hall with a hall team)`, same === total && hallPicks > 20, `${same}/${total}, halls ${hallPicks}`);
ok(`every Hall's team = swarm.js benchForHall's team for ${total} random parties`, sameB === total, `${sameB}/${total}`);

console.log('swarm.js benchForHall (mocked host, three parties)');
(async () => {
  // the host part between KAMAHALL-PURE-BEGIN and the DAILY DUNGEONS comment (block + kamaHallConfig / kamaRoles / kamaMates) + benchForHall
  const a = SRC.indexOf('// KAMAHALL-PURE-BEGIN'), b = SRC.indexOf('// DAILY DUNGEONS', a);
  const f0 = SRC.indexOf('async function benchForHall('), f1 = SRC.indexOf('\nfunction unbenchHall()', f0);
  ok('benchForHall + the host helpers found', a > 0 && b > a && f0 > 0 && f1 > f0);
  const code = SRC.slice(a, b) + '\n' + SRC.slice(f0, f1);
  const mk = (leader, members, roster, cfgFile, partyNow) => {
    let clock = 1e6; const emits = [], says = [], notes = [], ousts = [];
    const party = partyNow.slice();
    const env = {
      Me: { Name: leader, Level: members[leader] }, state: { role: roster[leader] },
      CONFIG: { roster, healer: { roles: ['bishop', 'shilliensaint', 'healer'] }, daily: { hallTeam: ['Tank1', 'Bishop1', 'Saint1', 'Destroyer1', 'Destroyer2', 'Doombringer1'] }, lead: { hub: 'Giran' } },
      SWARM_ROOT: 'X:', SWARM_CFG: null, File: { ReadAllText: () => JSON.stringify(cfgFile) },
      now: () => clock, sleep: async (ms) => { clock += ms; }, num: (v) => Number(v) || 0,
      teamNames: () => party.filter(x => x !== leader), partyMember: (nm) => (party.includes(nm) ? { Name: nm, Level: members[nm] } : null), livePos: {},
      Options: { SendParty: true }, daily: {}, bench: { until: 0, names: [] },
      PartyList: { forEach: (fn) => party.forEach(x => fn({ Name: x })) },
      App: { emit: (ev, d) => { emits.push({ ev, d }); if (ev === 'swarm.bench') (d.names || []).forEach(x => { const i = party.indexOf(x); if (i >= 0 && x !== 'Sticky') party.splice(i, 1); }); } },
      Send: { RequestOustPartyMember: (x) => { ousts.push(x); const i = party.indexOf(x); if (i >= 0) party.splice(i, 1); }, SendHex: () => { } },
      note: (m) => notes.push(m), SayToParty: (m) => says.push(m), logError: () => { },
    };
    const names = Object.keys(env);
    const fn = new Function(...names, code + '\nreturn { benchForHall, kamaHallConfig, kamaMates };');
    return { api: fn(...names.map(x => env[x])), env, emits, says, notes, ousts, party };
  };
  const lv = (names, l) => { const o = {}; names.forEach(x => { o[x] = l; }); return o; };
  // party Tank1 (the old global list = its own), party Destroyer3 (configured), party Vorth (automatic) — all 9, all lvl 52
  const S = ['Tank1', 'Bishop1', 'Destroyer1', 'Destroyer2', 'Doombringer1', 'Necro1', 'Inspector1', 'Chanter1', 'Saint1'];
  const G = ['Destroyer3', 'Bishop2', 'Chanter2', 'Destroyer4', 'Destroyer5', 'Destroyer6', 'Destroyer7', 'Destroyer8', 'Destroyer9'];
  const V = ['Vorth', 'Seraph', 'Grimhowl', 'Nyx', 'Pyre', 'Zeph', 'Kael', 'Morti', 'Zephr'];
  const roster = {}; ['sk', 'bishop', 'destroyer', 'destroyer', 'doombringer', 'necromancer', 'inspector', 'doomcryer', 'shilliensaint'].forEach((r, i) => { roster[S[i]] = r; });
  ['destroyer', 'bishop', 'doomcryer', 'destroyer', 'destroyer', 'destroyer', 'destroyer', 'destroyer', 'destroyer'].forEach((r, i) => { roster[G[i]] = r; });
  ['sk', 'bishop', 'doomcryer', 'nuker', 'nuker', 'nuker', 'nuker', 'nuker', 'nuker'].forEach((r, i) => { roster[V[i]] = r; });
  const cfgFile = { kamaloka: { hallTeams: { Destroyer3: ['Destroyer3', 'Bishop2', 'Chanter2', 'Destroyer4', 'Destroyer5', 'Destroyer6'] } } };
  const H56 = K(56);
  const s = mk('Tank1', lv(S, 52), roster, cfgFile, S), g = mk('Destroyer3', lv(G, 52), roster, cfgFile, G), v = mk('Vorth', lv(V, 52), roster, cfgFile, V);
  const os = await s.api.benchForHall(H56), og = await g.api.benchForHall(H56), ov = await v.api.benchForHall(H56);
  const bev = (x) => (x.emits.find(e => e.ev === 'swarm.bench') || {}).d || {};
  ok('Tank1: the old list (its own party) — Necro1, Inspector1, Chanter1 wait', JSON.stringify(os) === JSON.stringify(['Necro1', 'Inspector1', 'Chanter1']), os);
  ok('Destroyer3: kamaloka.hallTeams.Destroyer3 — Destroyer7, Destroyer8, Destroyer9 wait', JSON.stringify(og) === JSON.stringify(['Destroyer7', 'Destroyer8', 'Destroyer9']), og);
  ok('Vorth: automatic — tank leader, the healer, then the dealers (doomcryer last)', bev(v).team && bev(v).team.join() === 'Vorth,Seraph,Kael,Morti,Nyx,Pyre' && JSON.stringify(ov) === JSON.stringify(['Grimhowl', 'Zeph', 'Zephr']), bev(v));
  ok('the bench event carries the captain\'s town (Oren for Hall 56) and the team', bev(g).town === 'Oren' && bev(g).team.length === 6 && bev(g).until > 0);
  ok('each leader benches only his own party', !os.some(x => G.includes(x) || V.includes(x)) && !og.some(x => S.includes(x)) && !ov.some(x => S.includes(x) || G.includes(x)));
  ok('the party is down to 6 after the bench', s.party.length === 6 && g.party.length === 6 && v.party.length === 6, [s.party.length, g.party.length, v.party.length]);
  ok('party chat says who goes and who waits where', g.says.some(m => /hall team Destroyer3, Bishop2/.test(m) && /wait in Oren/.test(m)), g.says);
  ok('auto-invite off while benched', g.env.Options.SendParty === false);
  // no team fits: configured team with a name outside the party -> null, no bench event
  const bad = mk('Destroyer3', lv(G, 52), roster, { kamaloka: { hallTeams: { Destroyer3: ['Destroyer3', 'Nobody'] } } }, G);
  const ob = await bad.api.benchForHall(H56);
  ok('no hall team fits -> null, nobody benched, says why', ob === null && !bad.emits.length && bad.says.some(m => /no hall team/.test(m) && /Nobody/.test(m)), { ob, says: bad.says });
  // Labyrinth with 9: nobody waits
  const lab = mk('Vorth', lv(V, 52), roster, cfgFile, V);
  const ol = await lab.api.benchForHall(K(49));
  ok('Labyrinth 49 with 9: nobody waits, no bench event', Array.isArray(ol) && !ol.length && !lab.emits.length);
  // the hall settings are read live (30 s cache): a dashboard edit applies without a deploy
  ok('kamaHallConfig reads kamaloka.hallTeams + the old list', JSON.stringify(g.api.kamaHallConfig().hallTeams.Destroyer3) === JSON.stringify(cfgFile.kamaloka.hallTeams.Destroyer3) && g.api.kamaHallConfig().legacy.length === 6);
  // the member side: the bench handler sends them to the town and keeps the task line
  ok('member side: bench handler goes to the town and sets "waiting in <town> — not in the Hall team"', /benchGoToTown\(\)/.test(SRC) && /waiting in \$\{bench\.town \|\| 'town'\} — not in the Hall team/.test(SRC));
  ok('member side: only MY leader\'s bench counts (another party\'s "until 0" no longer ends mine)', /e\.source\.characterName !== CONFIG\.leader && !\(isLeader\(\) && e\.source\.characterName === Me\.Name\)/.test(SRC));
  console.log(`\n${n - fails}/${n} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
