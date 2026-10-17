// COMBATPROFILE-2026-10-17 tests: Dashboard/combatxml.js (read / write L2Swarm profiles) + Dashboard/combatprofile_api.js (apply job with a fake
// L2Swarm MCP: close -> write -> open) + the page wiring. Never touches the game or the live Settings files (scratch copies only).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
let ok = 0, bad = 0; const t = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const X = require(path.join(ROOT, 'Dashboard', 'combatxml.js'));
const SET = path.join(ROOT, 'Settings');
const files = fs.readdirSync(SET).filter(f => /\.xml$/i.test(f) && f !== 'settings.xml').map(f => [f, fs.readFileSync(path.join(SET, f), 'utf8')]).filter(([, r]) => /<Option[\s>]/.test(r));

// 1) every live profile: a no-op save changes nothing, and it validates
let same = 0, valid = 0, n = 0;
files.forEach(([f, raw]) => { const p = X.readProfile(raw); n++; if (X.writeProfile(raw, JSON.parse(JSON.stringify(p))) === raw) same++; if (!X.validate(p).length) valid++; });
t(n > 0 && same === n, `no-op save is byte-identical on all ${n} profiles (${same})`);
t(valid === n, `every live profile validates (${valid}/${n})`);

// 2) an edit on a copy: only the profile parts change, Password + everything else identical, stable on a 2nd save
const pick = files.find(([, r]) => /<CombatSkill /.test(r) && /<AutoSkill /.test(r)) || files[0], raw = pick[1];
const P = X.readProfile(raw), Q = JSON.parse(JSON.stringify(P));
if (Q.combatSkills[0]) Q.combatSkills[0].groups = [[{ trigger: 'MpPercentMore', value: 30, distance: 0 }, { trigger: 'HpPercentTargetMore', value: 20, distance: 0 }], [{ trigger: 'Surrounded', value: 3, distance: 300 }]];
Q.combatSkills.push({ id: 1177, name: 'Wind Strike', needTarget: true, mp: 15, enabled: true, repeat: true, repeatDelay: 2, groups: [[{ trigger: 'TargetAlive', value: 0, distance: 0 }]] });
Q.autoSkills.push({ type: 'MassHeal', id: 1219, name: 'Greater Group Heal', enabled: true, healType: 'HP', percents: 70, countMembers: 3 });
Q.autoItems.push({ type: 'SelfItemHeal', id: 1061, name: 'Greater Healing Potion', enabled: true, percents: 40, healType: 'HP', delay: 0, useTimer: false });
Q.scalars.CombatRange = 1500; Q.scalars.FollowAtk = !P.scalars.FollowAtk; Q.mobs.push({ id: 99999, name: 'Test Chest', attack: false, spoil: false });
t(!X.validate(Q).length, 'the edited profile validates');
const out = X.writeProfile(raw, Q), R = X.readProfile(out);
const pw = (s) => (s.match(/<Password>[^<]*<\/Password>/) || [''])[0];
t(X.untouchedSame(raw, out) && pw(raw) === pw(out), 'outside the profile nothing changed (Password line identical)');
t(R.combatSkills.length === P.combatSkills.length + 1 && R.combatSkills[R.combatSkills.length - 1].id === 1177 && R.combatSkills[R.combatSkills.length - 1].repeatDelay === 2, 'a new attack skill is written');
t(!P.combatSkills[0] || JSON.stringify(R.combatSkills[0].groups) === JSON.stringify(Q.combatSkills[0].groups), 'conditions (2 sets, and / or) are written and read back');
t(R.autoSkills.some(a => a.type === 'MassHeal' && a.percents === 70 && a.countMembers === 3) && R.autoItems.some(a => a.id === 1061 && a.percents === 40 && a.delay === 0 && a.useTimer === false), 'new heal + item entries carry every field');
t(R.scalars.CombatRange === 1500 && R.scalars.FollowAtk === !P.scalars.FollowAtk && R.mobs.some(m => m.id === 99999), 'settings + monsters written');
t(X.writeProfile(out, JSON.parse(JSON.stringify(R))) === out, 'a 2nd save of the result is stable');
t((out.match(/<[A-Za-z][^>]*[^/]>/g) || []).length === (out.match(/<\/[A-Za-z]/g) || []).length, 'open / close tags balance');
t(X.validate({ combatSkills: [{ id: 0 }] }).length === 1 && X.validate({ scalars: { AutoResType: '9' } }).length === 1 && X.validate({ scalars: { Nope: 1 } }).length === 1, 'validation: new entry without a skill / bad choice / unknown setting');

// 3) the API with a fake L2Swarm (scratch ROOT; MCP close / open simulated)
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpf_')); ['Settings', 'Logs'].forEach(d => fs.mkdirSync(path.join(tmp, d)));
  fs.writeFileSync(path.join(tmp, 'Settings', 'Test1.xml'), raw.replace(/<SelectedCharacter>[^<]*</, '<SelectedCharacter>Tester<'));
  fs.writeFileSync(path.join(tmp, 'swarm.config.json'), JSON.stringify({ accounts: [{ character: 'Tester', config: 'Test1.xml', party: 'Tester' }, { character: 'Mate', config: 'x.xml', party: 'Tester' }] }));
  fs.writeFileSync(path.join(tmp, 'Logs', 'swarm_state_Tester.json'), JSON.stringify({ updated: new Date().toISOString(), level: 40, cls: 'Bishop', ov: { skills: [{ id: 1217, lvl: 20, mp: 62 }], items: [{ id: 728, n: 100, name: 'Mana Potion' }] } }));
  let open = true; const calls = [];
  const cfgPath = path.join(tmp, 'Settings', 'Test1.xml');
  const ctx = { ROOT: tmp, SETTINGS: path.join(tmp, 'Settings'), LOGS: path.join(tmp, 'Logs'), DIR: path.join(ROOT, 'Dashboard'),
    mcpCall: async (tool, args) => { calls.push(tool); if (tool === 'get_accounts_status') return JSON.stringify(open ? [{ config_path: cfgPath }] : []); if (tool === 'close_account') open = false;
      if (tool === 'open_account') { open = true; setTimeout(() => fs.writeFileSync(path.join(tmp, 'Logs', 'swarm_state_Tester.json'), JSON.stringify({ updated: new Date().toISOString() })), 200); } return 'ok'; } };
  delete require.cache[require.resolve(path.join(ROOT, 'Dashboard', 'combatprofile_api.js'))];
  const A = require(path.join(ROOT, 'Dashboard', 'combatprofile_api.js'));
  const S = A.summary(ctx, 'Tester');
  t(S.ok && S.file === 'Test1.xml' && S.profile.combatSkills.length === P.combatSkills.length && S.partyNames.includes('Mate') && S.known.length >= 1, 'GET: profile, file, party names, known skills');
  t(A.summary(ctx, 'Nobody').code === 404, 'GET: unknown character = 404');
  const Q2 = JSON.parse(JSON.stringify(S.profile)); Q2.scalars.CombatRange = 1234;
  t((await A.post(ctx, { action: 'apply', char: 'Tester', profile: { combatSkills: [{ id: 0 }] } })).code === 400, 'POST: an invalid profile is refused');
  fs.writeFileSync(path.join(tmp, 'Logs', 'raid_live_Tester.json'), '{}');
  const rf = await A.post(ctx, { action: 'apply', char: 'Tester', profile: Q2, rev: S.rev });
  t(rf.code === 409 && rf.canForce, 'POST: refused while the party raids (can force)');
  fs.unlinkSync(path.join(tmp, 'Logs', 'raid_live_Tester.json'));
  const r = await A.post(ctx, { action: 'apply', char: 'Tester', profile: Q2, rev: S.rev });
  t(r.ok && r.job, 'POST: apply job started');
  for (let i = 0; i < 80 && !(A._jobs.Tester && A._jobs.Tester.done); i++) await new Promise(res => setTimeout(res, 250));
  const J = A._jobs.Tester;
  t(J && J.done && J.ok, 'job finished OK: ' + (J ? J.steps.map(s => s.replace(/^\S+ /, '')).join(' / ') : 'no job'));
  t(calls.indexOf('close_account') >= 0 && calls.indexOf('open_account') > calls.indexOf('close_account'), 'L2Swarm: close, then write, then open');
  t(X.readProfile(fs.readFileSync(cfgPath, 'utf8')).scalars.CombatRange === 1234, 'the file has the new value');
  const bk = path.join(tmp, 'Settings', 'backup', 'combatprofile'); t(fs.existsSync(bk) && fs.readdirSync(bk).length === 1, 'a backup of the old file was kept');
  t(/combatprofile\tapply Tester/.test(fs.readFileSync(path.join(tmp, 'Logs', 'dashboard_commands.log'), 'utf8')), 'logged in dashboard_commands.log');
  // a failure after the close must log the character in again
  open = true; calls.length = 0;
  const ctx2 = Object.assign({}, ctx, { mcpCall: async (tool, args) => { if (tool === 'close_account') { open = false; fs.chmodSync(cfgPath, 0o444); } return ctx.mcpCall(tool, args); } });
  const Q3 = JSON.parse(JSON.stringify(Q2)); Q3.scalars.CombatRange = 999;
  const r3 = await A.post(ctx2, { action: 'apply', char: 'Tester', profile: Q3 });
  for (let i = 0; i < 80 && !(A._jobs.Tester && A._jobs.Tester.done); i++) await new Promise(res => setTimeout(res, 250));
  try { fs.chmodSync(cfgPath, 0o666); } catch (e) { }
  const J3 = A._jobs.Tester;
  t(r3.ok && J3.done && (J3.ok || calls.includes('open_account')), 'a failed write still logs the character in again' + (J3.ok ? ' (write was allowed on this file system)' : ''));
  // the page wiring
  const IDX = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8'), SRV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
  t(/CombatProfilePage\.route\(kind, arg\)/.test(IDX) && /src="\/combatprofile\.js"/.test(IDX) && /href="\/combatprofile\.css"/.test(IDX) && /src="\/combatxml\.js"/.test(IDX), 'index.html loads the page + routes #/combat');
  t(/require\('\.\/combatprofile_api'\)\.handle\(/.test(SRV) && /mcpCall/.test(SRV.slice(SRV.indexOf("require('./combatprofile_api')"), SRV.indexOf("require('./combatprofile_api')") + 300)), 'server.js hooks the API (with mcpCall)');
  console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
