// Tests for the CLAN AUTOMATION (user 2026-10-12: "the /clan section has too many manual tasks"):
//   1) swarm.js CLANAUTO-PURE block (clanPickFocus, clanInviteAllowed, clanSkillCheck)   node test_clanauto.js [swarm.js]
//   2) Dashboard/clanauto_api.js: switches, active quests, the level quest dispatcher decision, status lines + "needs you", POST writes
// Sandbox only (temp folders, no game, no dashboard server).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const SW = process.argv.slice(2).filter(a => !/^--/.test(a))[0] || path.join(ROOT, 'Scripts_dev', 'swarm.js');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };

// ---- 1) the pure block ----
const src = fs.readFileSync(SW, 'utf8');
const a = src.indexOf('// CLANAUTO-PURE-BEGIN'), b = src.indexOf('// CLANAUTO-PURE-END');
if (a < 0 || b < 0) { console.log(`no CLANAUTO-PURE block in ${SW} — run patch_clanauto.js first (or pass the patched copy)`); process.exit(2); }
const P = new Function(src.slice(a, b) + '\nreturn { clanPickFocus, clanInviteAllowed, clanSkillCheck };')();
const skills = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'clan_data.json'), 'utf8').replace(/^﻿/, '')).skills;
ok(P.clanPickFocus(skills, {}, 2) === null, 'no clan skill below clan level 5');
const f5 = P.clanPickFocus(skills, {}, 5);
ok(f5 && f5.level === 1 && f5.clanLevel <= 5 && f5.kind !== 'residential', 'level 5: a level-1 skill of clan level <= 5');
ok(skills.filter(s => s.kind !== 'residential' && s.clanLevel <= 5 && s.level === 1).every(s => s.reputation >= f5.reputation), 'cheapest reputation first');
const f5b = P.clanPickFocus(skills, { [f5.id]: 1 }, 5); ok(f5b && !(f5b.id === f5.id && f5b.level === 1), 'a learned skill is not picked again');
ok(P.clanInviteAllowed('A', 'L', new Set(['A']), new Set()), 'ticked name');
ok(P.clanInviteAllowed('B', 'L', new Set(), new Set(['L'])), 'member of a ticked party');
ok(!P.clanInviteAllowed('C', 'M', new Set(['A']), new Set(['L'])), 'neither');
let r = P.clanSkillCheck({ skills, learned: {}, clvl: 2, focus: null, autoFocus: true, rep: 0, have: {} });
ok(!r.ok && /clan level 5/.test(r.msg), 'skill check: clan level 2 -> no trip: ' + r.msg);
r = P.clanSkillCheck({ skills, learned: {}, clvl: 5, focus: null, autoFocus: true, rep: 0, have: {} });
ok(!r.ok && /saving reputation 0|the clan leader needs/.test(r.msg) && r.f && r.f.auto, 'skill check: reputation / items short -> no trip: ' + r.msg);
const need = skills.find(s => s.id === r.f.id && s.level === r.f.level);
const have = {}; (need.items || []).forEach(i => { have[i.id] = 0; });
r = P.clanSkillCheck({ skills, learned: {}, clvl: 5, focus: null, autoFocus: true, rep: need.reputation, have });
ok(!r.ok === !!(need.items || []).length, 'skill check: items missing -> no trip: ' + r.msg);
(need.items || []).forEach(i => { have[i.id] = i.count; });
r = P.clanSkillCheck({ skills, learned: {}, clvl: 5, focus: null, autoFocus: true, rep: need.reputation, have });
ok(r.ok, 'skill check: everything there -> ready: ' + r.msg);
r = P.clanSkillCheck({ skills, learned: { [need.id]: need.level }, clvl: 5, focus: { id: need.id, level: need.level, name: need.name }, autoFocus: false, rep: 1e9, have });
ok(!r.ok && !r.f, 'a learned focus without auto-pick -> nothing to learn');

// ---- 2) the dashboard API ----
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'clanauto-'));
const LOGS = path.join(T, 'Logs'), DATA = path.join(T, 'data'); [LOGS, DATA, path.join(T, 'Settings', 'backup')].forEach(d => fs.mkdirSync(d, { recursive: true }));
const realCq = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'clan_quests.json'), 'utf8'));
const cq = JSON.parse(JSON.stringify(realCq)); cq.clan = { name: 'TestClan', leader: 'Lead', level: 2, activeQuests: [], inviteAllow: ['M2'], created: '2026-10-07T00:00:00Z' };
fs.writeFileSync(path.join(DATA, 'clan_quests.json'), JSON.stringify(cq));
fs.copyFileSync(path.join(ROOT, 'Scripts', 'data', 'clan_data.json'), path.join(DATA, 'clan_data.json'));
process.env.SWARM_CLANQUESTS_FILE = path.join(DATA, 'clan_quests.json'); process.env.SWARM_CLANAUTO_FILE = path.join(LOGS, 'clan_auto.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const now = new Date().toISOString();
const chars = [
  { name: 'Lead', level: 52, party: 'Lead', ageSec: 5, mode: 'autolevel', clanInfo: { name: 'TestClan', level: 2 } },
  { name: 'L1', level: 51, party: 'Lead', ageSec: 5 }, { name: 'L2', level: 53, party: 'Lead', ageSec: 5 },
  { name: 'Big', level: 58, party: 'Big', ageSec: 5, mode: 'autolevel' }, { name: 'B1', level: 56, party: 'Big', ageSec: 5 }, { name: 'B2', level: 57, party: 'Big', ageSec: 5 },
  { name: 'M2', level: 40, party: 'Mid', ageSec: 5 }, { name: 'Mid', level: 41, party: 'Mid', ageSec: 5 }, { name: 'M3', level: 42, party: 'Mid', ageSec: 5 },
];
fs.writeFileSync(path.join(LOGS, 'clan_state.json'), JSON.stringify({ leader: 'Lead', clan: { name: '', level: 0, id: 1 }, clanInfo: { name: 'TestClan', level: 2, rep: 0, members: [{ name: 'Lead' }, { name: 'L1' }, { name: 'L2' }] },
  nextLevel: { level: 2, next: 3, ok: false, missing: ['Blood Mark (1419) 0/1'], items: [{ id: 1419, name: 'Blood Mark', need: 1, have: 0 }] }, at: now }));
fs.writeFileSync(path.join(LOGS, 'bag_B1.json'), JSON.stringify({ at: now, name: 'B1', items: [{ id: 1419, objId: 777, name: 'Blood Mark', count: 3 }] }));
const A = require(path.join(ROOT, 'Dashboard', 'clanauto_api.js'));
const ctx = { ROOT: T, LOGS, DATA, readJson, readStates: () => chars };
let F0 = A.flags(cq, ctx);
ok(F0.invite && F0.warehouseLook && F0.skillLearn && F0.skillFocus && F0.questDispatch && !F0.questActivate && !F0.levelQuests && !F0.levelUp, 'defaults');
ok(A.activeQuests(cq, 5).length === 0, 'no ticked quest, questActivate off -> none active');
ok(A.activeQuests({ clan: { auto: { questActivate: true } }, quests: cq.quests }, 5).join() === '508', 'questActivate at clan level 5 -> 508 only');
ok(A.clanLevelOf({ clan: { level: 0 }, clanInfo: { level: 2 } }, { clan: { level: 1 } }) === 2, 'real clan level from the clan intel');
let S = A.status(ctx);
const row = (k) => S.rows.find(x => x.key === k);
ok(S.level === 2 && row('levelUp').state === 'off', 'level-up off + item missing');
ok(S.needs.some(n => n.kind === 'handover' && n.giver === 'B1' && n.objId === 777 && n.receiver === 'Lead' && n.count === 1), 'needs you: hand the Blood Mark to the clan leader');
ok(/B1 already has 3/.test(row('levelQuests').text), 'level quest row knows the item is in a bag: ' + row('levelQuests').text);
ok(/M2/.test(row('invite').text) && !/M3/.test(row('invite').text), 'invite row: ticked M2 waits');
ok(/clan level 5/.test(row('questDispatch').text) && /clan level 5/.test(row('skillLearn').text), 'raid quests + skills wait for clan level 5');
// POST
ok(A.post(ctx, { action: 'set', key: 'nope', on: true }).code === 400, 'unknown switch refused');
ok(A.post(ctx, { action: 'set', key: 'levelQuests', on: true }).ok && readJson(process.env.SWARM_CLANQUESTS_FILE).clan.auto.levelQuests === true, 'levelQuests switched on in clan_quests.json');
ok(A.post(ctx, { action: 'set', key: 'levelUp', on: true }).ok && readJson(process.env.SWARM_CLANAUTO_FILE).levelUp === true, 'levelUp writes Logs/clan_auto.json');
ok(A.post(ctx, { action: 'inviteParty', leader: 'Mid', on: true }).ok && readJson(process.env.SWARM_CLANQUESTS_FILE).clan.inviteParties.join() === 'Mid', 'invite party Mid');
ok(fs.readdirSync(path.join(T, 'Settings', 'backup')).length >= 2, 'every write keeps a backup');
S = A.status(ctx);
ok(/M3/.test(row('invite').text) && /Mid/.test(row('invite').text), 'a ticked party invites its members: ' + row('invite').text);
// the level quest dispatcher
const cq2 = readJson(process.env.SWARM_CLANQUESTS_FILE), st = readJson(path.join(LOGS, 'clan_state.json')), teams = A.teamsOf(chars);
let d = A.lqDecide({ cq: cq2, st, teams, prog: { steps: {} }, last: null, now: Date.now(), leaderOnline: true, held: () => true });
ok(!d.send && /already has/.test(d.msg), 'no hunt when someone holds the item');
d = A.lqDecide({ cq: cq2, st, teams, prog: { steps: {} }, last: null, now: Date.now(), leaderOnline: true, held: () => false });
ok(d.send && d.send.target === 'party:Big' && d.send.cmd === '!clanquest bloodmark 1', 'hunt step -> the party whose lowest level fits (Big, 56): ' + JSON.stringify(d));
d = A.lqDecide({ cq: cq2, st, teams, prog: { steps: {} }, last: { n: 1, at: new Date().toISOString() }, now: Date.now(), leaderOnline: true, held: () => false });
ok(!d.send, 'not twice within 2 h');
d = A.lqDecide({ cq: cq2, st, teams, prog: { steps: { 0: { status: 'done' } } }, last: null, now: Date.now(), leaderOnline: true, held: () => false });
ok(!d.send && /manual/.test(d.msg), 'step 2 (trade) is manual -> waits for you');
d = A.lqDecide({ cq: cq2, st: Object.assign({}, st, { nextLevel: Object.assign({}, st.nextLevel, { ok: true }) }), teams, prog: { steps: { 0: { status: 'done' }, 1: { status: 'done' } } }, last: null, now: Date.now(), leaderOnline: true, held: () => false });
ok(d.send && d.send.target === 'char:Lead' && d.send.cmd === '!clanquest bloodmark 3', 'level-up step -> the clan leader');
d = A.lqDecide({ cq: cq2, st, teams, prog: { steps: { 0: { status: 'failed', at: new Date().toISOString() } } }, last: null, now: Date.now(), leaderOnline: true, held: () => false });
ok(!d.send && /retry after 1 h/.test(d.msg), 'a failed step waits 1 h');
const off = JSON.parse(JSON.stringify(cq2)); off.clan.auto.levelQuests = false;
ok(!A.lqDecide({ cq: off, st, teams, prog: { steps: {} }, now: Date.now(), held: () => false }).send, 'switched off -> nothing sent');
fs.rmSync(T, { recursive: true, force: true });
console.log(`test_clanauto: ${pass} checks passed`);
