#!/usr/bin/env node
// Test: CLAN NOBILITY RANKS (forum topic 429) — data builder, shared logic, API, dashboard module. Read-only against the real files
// (Scripts/data/clan_ranks.json, Logs/*); fixtures + sandbox server in a temp folder. No game commands, no L2Swarm, no dashboard restart.
//   node docs/plan/tools/test_clannobility.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const L = require(path.join(ROOT, 'Dashboard', 'clanranks_logic.js'));
const B = require(path.join(ROOT, 'docs', 'plan', 'tools', 'clan_ranks.js'));
const API = require(path.join(ROOT, 'Dashboard', 'clanranks_api.js'));
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// ---------------------------------------------------------------- 1. L2J table = calculatePledgeClass (DATAPACK, read 2026-10-12)
const L2J = {
  1: { leader: 1, member: 1 }, 2: { leader: 1, member: 1 }, 3: { leader: 1, member: 1 }, 4: { leader: 3, member: 0 },
  5: { leader: 4, member: 2, academy: 2 },
  6: { academy: 1, royalMember: 2, member: 3, royalCaptain: 4, leader: 5 },
  7: { academy: 1, knightMember: 2, royalMember: 3, member: 4, knightCommander: 5, royalCaptain: 6, leader: 7 },
  8: { academy: 1, knightMember: 3, royalMember: 4, member: 5, knightCommander: 6, royalCaptain: 7, leader: 8 },
  9: { academy: 1, knightMember: 4, royalMember: 5, member: 6, knightCommander: 7, royalCaptain: 8, leader: 9 },
  10: { academy: 1, knightMember: 5, royalMember: 6, member: 7, knightCommander: 8, royalCaptain: 9, leader: 10 },
  11: { academy: 1, knightMember: 6, royalMember: 7, member: 8, knightCommander: 9, royalCaptain: 10, leader: 11 },
};
for (let lv = 1; lv <= 11; lv++) L.ROLES.forEach(r => eq(L.l2jBase(lv, r), L2J[lv][r] != null ? L2J[lv][r] : null, `l2j lv${lv} ${r}`));
eq(L.l2jBase(0, 'leader'), 1, 'clan level 0 = Vassal (default branch)');
eq(L.pledgeClass(2, 'member', { noble: true }), 5, 'Noblesse -> Baron');
eq(L.pledgeClass(2, 'member', { hero: true }), 8, 'Hero -> Marquis');
eq(L.pledgeClass(9, 'leader', { noble: true, hero: true }), 9, 'override never lowers');
eq(L.pledgeClass(4, 'member', { noble: true }), 5, 'Noblesse fixes the level-4 Vagabond quirk');

// ---------------------------------------------------------------- 2. chart (GUIDE) = the transcribed image rows
const NAME2PC = { 'Vassal (a)': 1, 'Vassal (b)': 1, Heir: 2, Knight: 3, Elder: 4, Baron: 5, Viscount: 6, Count: 7, Marquis: 8, Duke: 9, 'Grand Duke': 10, King: 11 };
const CELL2ROLE = { 'Clan member': 'member', 'Clan Leader': 'leader', 'Clan Leader ?': 'leader', 'Guard Member': 'royalMember', 'Guard Captain': 'royalCaptain', 'Knight Member': 'knightMember', 'Knight Commander': 'knightCommander', Academy: 'academy' };
const fromChart = {};
Object.entries(B.CHART_ROWS).forEach(([row, cols]) => Object.entries(cols).forEach(([col, txt]) => {
  const role = CELL2ROLE[txt]; if (!role || col === '1-4') return;
  const k = col + '|' + role; (fromChart[k] = fromChart[k] || []).push(NAME2PC[row]);
}));
for (let lv = 5; lv <= 11; lv++) L.ROLES.forEach(r => {
  const want = fromChart[lv + '|' + r]; const got = L.chartBase(lv, r);
  eq(got, want ? (want.length === 1 ? want[0] : want) : null, `chart lv${lv} ${r}`);
});
eq(L.chartBase(3, 'leader'), [1, 2], 'chart: level-3 leader in both Vassal and Heir rows');
eq(L.chartBase(4, 'leader'), 3, 'chart: level-4 leader Knight');
eq(L.chartBase(4, 'member'), 1, 'chart: level 1-4 member Vassal');
eq(L.chartRank(2, 'leader', { castleLeader: true }), 11, 'chart: castle-owning leader = King');
eq(L.pledgeClass(2, 'leader', { castleLeader: true }), 1, 'L2J: no castle rule');
// chart and L2J agree on every cell from clan level 6 up; at 5 only the academy differs
const lad = L.ladder();
for (let lv = 6; lv <= 11; lv++) ok(Object.values(lad[lv - 1].cells).every(c => !c.differs), `ladder lv${lv} no differences`);
eq(Object.entries(lad[4].cells).filter(([, c]) => c.differs).map(([r]) => r), ['academy'], 'ladder lv5 differs only on academy');
eq(Object.entries(lad[3].cells).filter(([, c]) => c.differs).map(([r]) => r), ['member'], 'ladder lv4 differs only on member');
eq(Object.entries(lad[2].cells).filter(([, c]) => c.differs).map(([r]) => r), ['leader'], 'ladder lv3 differs only on leader');

// ---------------------------------------------------------------- 3. helpers
eq(L.rankName(5), 'Baron', 'rankName'); eq(L.rankName(-1), 'Clan leader only', 'rankName -1'); eq(L.rankName([1, 2]), 'Vassal or Heir', 'rankName pair');
eq(L.roleOf({ name: 'Q', unit: 0 }, 'Q'), 'leader', 'roleOf leader');
eq(L.roleOf({ name: 'A', unit: -1 }, 'Q'), 'academy', 'roleOf academy');
eq(L.roleOf({ name: 'A', unit: 200 }, 'Q'), 'royalMember', 'roleOf royal');
eq(L.roleOf({ name: 'A', unit: 2002 }, 'Q'), 'knightMember', 'roleOf knight');
eq(L.roleOf({ name: 'A', unit: 0 }, 'Q', { A: 100 }), 'royalCaptain', 'roleOf royal captain');
eq(L.roleOf({ name: 'A', unit: 0 }, 'Q', { A: 1001 }), 'knightCommander', 'roleOf knight commander');
eq(L.roleOf({ name: 'A', unit: 0 }, 'Q'), 'member', 'roleOf member');
eq([L.firstLevelFor('leader', 4), L.firstLevelFor('member', 4)], [5, 7], 'Elder (Apella): leader 5, members 7');
eq([L.firstLevelFor('leader', 5), L.firstLevelFor('member', 5)], [6, 8], 'Baron (Improved Apella): leader 6, members 8');
eq([L.firstLevelFor('leader', 2), L.firstLevelFor('member', 2)], [4, 5], 'Heir (circlets): leader 4, members 5');
eq(L.firstLevelFor('academy', 2), 5, 'academy Heir only at 5 (L2J quirk)');
eq(L.firstLevelFor('member', 12), null, 'never');
eq(L.rankChanges(2, 3), [], 'no rank change 2 -> 3');
eq(L.rankChanges(3, 4).map(r => [r.role, r.from, r.to]), [['leader', 1, 3], ['member', 1, 0]], 'rank changes 3 -> 4');
ok(L.rankChanges(5, 6).some(r => r.role === 'royalMember' && r.isNew), 'royal guard appears at 6');

// ---------------------------------------------------------------- 4. builder + data file
const d = B.build();
eq(B.validate(d), [], 'builder validates');
eq(d.levels.map(l => l.level), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], '11 clan levels');
eq(d.levels[2].requirements.sp, 350000, 'level 3 SP'); eq(d.levels[2].requirements.items.map(i => i.id), [1419], 'level 3 Blood Mark');
eq(d.levels[5].requirements.reputation, 5000, 'level 6 reputation'); eq(d.levels[5].requirements.members, 30, 'level 6 members');
ok(/Territory/.test(d.levels[10].requirements.extra || ''), 'level 11 territory');
eq(d.levels.map(l => l.unlocks.memberLimit.main), [15, 20, 30, 40, 40, 40, 40, 40, 40, 40, 40], 'main member limits');
ok(d.levels[4].unlocks.features.some(f => /alliance/i.test(f.what)) && d.levels[4].unlocks.features.some(f => /Command Channel/.test(f.what)), 'level 5 alliance + command channel');
ok(d.levels[2].unlocks.features.some(f => /crest/i.test(f.what)) && d.levels[2].unlocks.features.some(f => /war/i.test(f.what)), 'level 3 crest + war');
ok(d.levels[5].unlocks.clanSkills.includes('Clan Might 1'), 'level 6 opens Clan Might 1');
eq(d.rankGatedItems.map(g => [g.pledgeClass, g.leaderFromClanLevel, g.memberFromClanLevel]), [[1, 1, 1], [2, 4, 5], [4, 5, 7], [5, 6, 8], [-1, 0, null]], 'rank item gates');
if (!fs.existsSync(path.join(ROOT, 'Dashboard', 'data', 'items.json'))) console.log('skip: rank item names / grades (needs Dashboard/data/items.json from SETUP -Images)');
else {
  ok(d.rankGatedItems.every(g => g.items.every(i => !/^#/.test(i.name))), 'every rank item has a name');
  eq(d.rankGatedItems[2].items.find(i => i.id === 7861).grade, 'A', 'Apella Plate Armor = A grade');
}
eq(d.clanSkillRanks.skills['376 Clan Might'].retailMinRank, 'Heir', 'Clan Might retail rank Heir');
if (d.live) ok(d.levels.every(l => !l.live || l.live.matchesDatapack === true), 'LIVE village master page = datapack numbers');
else console.log('note: no LIVE level-up page saved — LIVE check skipped');
const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'clan_ranks.json'), 'utf8'));
eq(Object.keys(real).sort(), Object.keys(d).sort(), 'Scripts/data/clan_ranks.json has the builder keys');
eq(real.byClanLevel, d.byClanLevel, 'Scripts/data/clan_ranks.json ladder is current');
// characterFlags survive a rebuild (--out to a temp file)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'clanrank_'));
const OUTF = path.join(TMP, 'clan_ranks.json');
fs.writeFileSync(OUTF, JSON.stringify({ characterFlags: { Testchar: { noble: true } } }));
require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'docs', 'plan', 'tools', 'clan_ranks.js'), '--out', OUTF], { stdio: 'pipe' });
eq(JSON.parse(fs.readFileSync(OUTF, 'utf8')).characterFlags, { Testchar: { noble: true } }, 'characterFlags kept on rebuild');

// ---------------------------------------------------------------- 5. intel + best clan info + summary
const LOG = '2026-10-12T14:38:44.051Z [Tank3] clan intel (every 10 min): MyClan lvl 2, leader Dagger1, 13 members, 0 reputation\n' +
  '2026-10-12T14:38:48.419Z [Dagger1] clan intel (every 10 min): MyClan lvl 2, leader Dagger1 (ME), 13 members, 120 reputation\nnoise\n';
eq(L.parseIntel(LOG), { at: '2026-10-12T14:38:48.419Z', by: 'Dagger1', name: 'MyClan', level: 2, leader: 'Dagger1', memberCount: 13, rep: 120 }, 'parseIntel newest line');
eq(L.parseIntel('nothing'), null, 'parseIntel none');
const members = [{ name: 'Dagger1', level: 52, unit: 0, online: true }, { name: 'Bishop1', level: 58, unit: 0 }, { name: 'Kid', level: 20, unit: -1 }];
const good = { id: 1, name: 'MyClan', level: 2, leader: 'Dagger1', rep: 0, members, seenAt: '2026-10-12T14:00:00Z' };
const emptySt = { clanInfo: { id: 1, name: '(clan 1)', level: 0, leader: '', members: [], seenAt: null }, clan: { level: 0, id: 1 }, sp: 3618118, adena: 29856426, leader: 'Dagger1' };
eq(L.bestClanInfo({ clanInfo: good }, null, null).source, 'clan_state', 'fresh clan_state wins');
eq(L.bestClanInfo(emptySt, null, good).source, 'cache', 'empty clan_state -> cache');
eq(L.bestClanInfo(emptySt, L.parseIntel(LOG), null).source, 'clan.log intel', 'nothing else -> intel');
eq(L.bestClanInfo(emptySt, L.parseIntel(LOG), good).members.length, 3, 'newer intel keeps the cached member list of the same clan');
const NOW = Date.parse('2026-10-12T14:40:00Z');
let s = L.summary(real, emptySt, { cache: good, now: NOW, bag: [{ id: 57, count: 1 }] });
eq([s.clan.name, s.clan.level, s.clan.members, s.ranksNow.leader.rank, s.ranksNow.member.rank], ['MyClan', 2, 3, 'Vassal', 'Vassal'], 'summary: our clan now');
eq(s.next.level, 3, 'next level 3');
eq(s.next.reqs.map(r => [r.what, r.need, r.have, r.ok]), [['Clan leader SP', 350000, 3618118, true], ['Blood Mark', 1, 0, false]], 'level 3 needs: SP ok, Blood Mark missing');
eq(s.next.missing, ['Blood Mark'], 'missing list');
s = L.summary(real, emptySt, { cache: good, now: NOW, bag: [{ id: 1419, count: 1 }] });
eq(s.next.ok, true, 'Blood Mark in the bag -> ready');
s = L.summary(real, emptySt, { cache: good, now: NOW });
eq(s.next.reqs[1].ok, null, 'no bag report -> unknown');
eq(s.members.map(m => [m.name, m.role, m.rank]), [['Dagger1', 'leader', 'Vassal'], ['Bishop1', 'member', 'Vassal'], ['Kid', 'academy', '–']], 'member ranks (no academy before clan level 5 -> no rank)');
const s6 = L.summary(real, { clanInfo: Object.assign({}, good, { level: 5, rep: 4000, members: members.concat(Array.from({ length: 30 }, (_, i) => ({ name: 'M' + i, unit: 0 }))) }) }, { now: NOW });
eq(s6.next.reqs.map(r => [r.what, r.ok]), [['Clan reputation', false], ['Clan members', true]], 'level 6: reputation missing, 33 members ok');
eq(s6.ranksNow.leader.rank, 'Elder', 'level 5 leader Elder');
ok(s6.goals.find(g => g.pc === 4).leaderHas === true && s6.goals.find(g => g.pc === 4).membersHave === false, 'level 5: leader may wear Apella, members not');
const s11 = L.summary(real, { clanInfo: Object.assign({}, good, { level: 11 }) }, { now: NOW });
eq(s11.next, null, 'level 11 = no next');

// ---------------------------------------------------------------- 6. API in a sandbox (temp LOGS, real data file)
(async () => {
  const LOGS = path.join(TMP, 'Logs'); fs.mkdirSync(LOGS);
  fs.writeFileSync(path.join(LOGS, 'clan_state.json'), JSON.stringify(emptySt));
  fs.writeFileSync(path.join(LOGS, 'swarm_state_Bishop1.json'), JSON.stringify({ name: 'Bishop1', clanInfo: good }));
  fs.writeFileSync(path.join(LOGS, 'clan.log'), LOG);
  fs.writeFileSync(path.join(LOGS, 'bag_Dagger1.json'), JSON.stringify({ at: 'x', items: [{ id: 1419, count: 1 }] }));
  const DIR = path.join(ROOT, 'Dashboard');
  let allow = true;
  const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
  const ctx = { DIR, DATA: path.join(ROOT, 'Scripts', 'data'), LOGS, ROOT, allowed: () => allow, send, json: (res, c, o) => send(res, c, 'application/json', JSON.stringify(o)),
    readJson: (f, dft) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dft; } } };
  API._reset();
  const srv = http.createServer(async (req, res) => { const url = new URL(req.url, 'http://x'); if (!(await API.handle(req, res, url, ctx))) send(res, 404, 'text/plain', 'next'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const get = (p, method) => new Promise((resolve, reject) => { const rq = http.request({ host: '127.0.0.1', port, path: p, method: method || 'GET' }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ code: res.statusCode, type: res.headers['content-type'], body: b })); }); rq.on('error', reject); rq.end(); });
  try {
    let r = await get('/api/clanranks'); const j = JSON.parse(r.body);
    eq(r.code, 200, 'API 200'); eq(j.ok, true, 'API ok');
    eq([j.summary.clan.name, j.summary.clan.level, j.summary.clan.source], ['MyClan', 2, 'clan.log intel'], 'API clan from member state + newer intel');
    eq(j.summary.clan.members, 3, 'API keeps the cached member list');
    eq(j.summary.next.ok, true, 'API reads the leader bag (Blood Mark 1)');
    eq(j.ladder.length, 11, 'API ladder'); ok(j.levels.length === 11 && j.goals.length === 5, 'API levels + goals');
    r = await get('/clanranks.js'); ok(r.code === 200 && /javascript/.test(r.type) && /window\.ClanRanks/.test(r.body), 'static clanranks.js');
    r = await get('/clanranks.css'); ok(r.code === 200 && /text\/css/.test(r.type), 'static clanranks.css');
    r = await get('/clanranks_logic.js'); ok(r.code === 200 && /ClanRanksLogic/.test(r.body), 'static clanranks_logic.js');
    r = await get('/api/clanranks', 'POST'); eq(r.code, 405, 'API is read-only');
    r = await get('/api/other'); eq(r.body, 'next', 'other paths fall through');
    allow = false; r = await get('/api/clanranks'); eq(r.code, 401, 'API needs the key'); allow = true;
    process.env.SWARM_CLANRANKS_FILE = path.join(TMP, 'missing.json'); r = await get('/api/clanranks'); ok(JSON.parse(r.body).ok === false, 'missing data file -> ok false'); delete process.env.SWARM_CLANRANKS_FILE;

    // ---------------------------------------------------------------- 7. dashboard module renders (vm, fake DOM)
    const src = fs.readFileSync(path.join(DIR, 'clanranks.js'), 'utf8');
    ok(!/\b(alert|confirm|prompt)\s*\(/.test(src.replace(/\/\/.*$/gm, '')), 'no browser alert/confirm/prompt');
    const win = {}; const sandbox = { window: win, document: { hidden: true, getElementById: () => null }, setInterval: () => 0, setTimeout: () => 0, location: { search: '' }, URLSearchParams, fetch: () => Promise.resolve({ json: () => ({}) }), console, Date };
    vm.createContext(sandbox); vm.runInContext(src, sandbox);
    const CRm = win.ClanRanks; ok(CRm && typeof CRm.html === 'function', 'module exports ClanRanks');
    ok(/Loading/.test(CRm.html()), 'renders a loading line before data');
    CRm._state.data = j; CRm._state.at = Date.now();
    const out = CRm.html();
    ok(/Clan level 3 needs/.test(out) && /Blood Mark/.test(out) && /Rank ladder/.test(out) && /What a rank opens/.test(out), 'renders next level, goals, ladder');
    ok(!/undefined|NaN|\[object Object\]/.test(out), 'no undefined/NaN in the HTML');
    ok(/crk-cur/.test(out), 'current clan level row highlighted');
    ok(/leader Vassal · members Vassal · level 3: ready/.test(CRm.badge()), 'badge: ' + CRm.badge());

    // ---------------------------------------------------------------- 8. real files (read-only smoke)
    API._reset();
    const live = API.build({ DIR, DATA: path.join(ROOT, 'Scripts', 'data'), LOGS: path.join(ROOT, 'Logs'), ROOT });
    ok(live.ok, 'API build on the real Logs');
    console.log(`real clan now: ${live.summary.clan.name || '?'} level ${live.summary.clan.level}, leader ${live.summary.ranksNow.leader.rank}, members ${live.summary.ranksNow.member.rank}` +
      (live.summary.next ? `; level ${live.summary.next.level} needs ${live.summary.next.reqs.map(r => `${r.what} ${r.have == null ? '?' : r.have}/${r.need}`).join(', ')}` : '') + ` (source ${live.summary.clan.source})`);
  } catch (e) { fail++; console.log('FAIL exception ' + e.stack); }
  srv.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  console.log(`test_clannobility: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
