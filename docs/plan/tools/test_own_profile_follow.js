// OWNPROFILE-2026-10-16 (Vykaax, 1.7.4 Fields of Massacre): with "Hive picks my skills" OFF a member's own L2Swarm profile owns follow + assist +
// combat while hunting - the hive no longer unticks Follow After (native-nav guard, ASSIST follow hold) and switches it back on up to 8000.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const fnSrc = (name) => { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } return ''; };

// 1) ownFollowNow: only members, only with Hive skills OFF, never in raids / instances / raid clear / missions
const own = fnSrc('ownFollowNow');
ok(own, 'ownFollowNow exists');
const mk = (o) => new Function('isLeader', 'hiveSkillsOn', 'inst', 'inKamaInstance', 'inRaid', 'state', own + '; return ownFollowNow();')(
  () => !!o.leader, () => !!o.skills, { on: !!o.inst }, () => !!o.kama, () => !!o.raid, { mode: o.mode || 'autolevel' });
ok(mk({ skills: false }) === true, 'member + skills OFF + hunting = own profile');
ok(mk({ skills: true }) === false, 'skills ON = hive as before');
ok(mk({ skills: false, leader: true }) === false, 'the leader is never affected');
ok(mk({ skills: false, raid: true }) === false, 'raids keep their routines');
ok(mk({ skills: false, inst: true }) === false, 'instances keep their routines');
ok(mk({ skills: false, kama: true }) === false, 'Kamaloka keeps its routine');
ok(mk({ skills: false, mode: 'raidclear' }) === false && mk({ skills: false, mode: 'mission' }) === false, 'raid clear / missions keep their routines');

// 2) followResumeOk: own profile resumes up to 8000 (a spread team stood forever at 3000-8000), hive keeps 3000
const fr = new Function(fnSrc('followResumeOk') + '; return followResumeOk;')();
const base = { noNativeNav: false, inRaid: false, paused: true, active: false, followName: true, busy: false };
ok(fr(Object.assign({}, base, { dist: 5000, own: true })) === true, 'own profile: follow back on at 5000');
ok(fr(Object.assign({}, base, { dist: 5000, own: false })) === false, 'hive: still 3000 as before');
ok(fr(Object.assign({}, base, { dist: 9000, own: true })) === false, 'never beyond the 8000 follow cap');
ok(fr(Object.assign({}, base, { dist: 1000, own: true, busy: true })) === false, 'never during a route / NPC walk');

// 3) the wiring: followOk, the 3 s check, the native-nav guard, the assist tick
ok(/if \(NNAV && !isLeader\(\) && noNativeNav\(\) && !ownFollowNow\(\)\) \{ NNAV\.wantFollow = true; return false; \}/.test(fnSrc('followOk')), 'followOk: the guard no longer refuses follow for an own profile');
ok(src.includes('followResumeOk({ noNativeNav: !!(NNAV && noNativeNav() && !ownFollowNow()), own: ownFollowNow(),'), '3 s check passes own + ignores the guard for an own profile');
const gi = src.indexOf('const ownFol = ownFollowNow();'), guard = src.slice(gi, src.indexOf("logError('native-nav guard', e)", gi));
ok(gi > 0, 'guard computes ownFol');
ok(guard.includes('if (!isLeader() && !ownFol && (Options.ActiveFollow || (leadMode() && !benched()))) { NNAV.wantFollow = true; Options.ActiveFollow = false; }'), 'guard start: Follow After not unticked for an own profile');
ok(guard.includes('if (!isLeader() && !ownFol && Options.ActiveFollow) { NNAV.wantFollow = true; Options.ActiveFollow = false; }'), 'guard hold: Follow After not unticked every 250 ms for an own profile');
ok(guard.indexOf('if (ownFol) return;') > 0 && guard.indexOf('if (ownFol) return;') < guard.indexOf('nnFight(false);\n    nnFollow();'), 'guard: no script fight / script follow beside the player profile');
ok(!/ActiveFollow = false/.test(guard.replace(/!ownFol[^\n]*ActiveFollow = false/g, '')), 'guard: every follow-off is gated by ownFol');
const am = fnSrc('assistMemberTick');
ok(am.indexOf('if (ownFollowNow())') > 0 && am.indexOf('if (ownFollowNow())') < am.indexOf('assistDecide('), 'assist: hive script assist steps aside for an own profile');
ok(/if \(ownFollowNow\(\)\) \{[^}]*state\.followHoldUntil = 0;[\s\S]*?return;/.test(am), 'assist: its own follow hold is released');
// the player's assist (FollowAtk) and L2Swarm combat stay untouched under the guard (NNAVOWN)
ok(guard.includes('if (Options.FollowAtk && !ownFight)') && guard.includes('if (IsInCombat && !ownFight)'), 'guard: FollowAtk / combat stay the player\'s (NNAVOWN)');

console.log(`own profile follow: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
