// TEAMS-2026-11-03 guard: Dashboard/teams_api.js (the teams page data + the undo of the last party move) + the page wiring.
// Sandbox only: scratch folders, no live files, no server, no game.  node docs/plan/tools/test_teams.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const T = require(path.join(ROOT, 'Dashboard', 'teams_api.js')), PM = require(path.join(ROOT, 'Dashboard', 'partymove_api.js'));
let ok = 0, bad = 0; const t = (c, m, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' — ' + JSON.stringify(x).slice(0, 300))); } };
const cfg = { clanLeader: 'Runner1', healerRoles: ['bishop', 'healer'], accounts: [
  { character: 'Lead', party: 'Lead', role: 'tank' }, { character: 'Mage', party: 'Lead', role: 'nuker' }, { character: 'Heal', party: 'Lead', role: 'bishop' },
  { character: 'Spoil', party: 'Spoil', role: 'spoiler' }, { character: 'Elder', party: 'Spoil', role: 'healer' },
  { character: 'Bank', party: 'Bank', role: 'crafter' }, { character: 'Runner1', party: 'Runner1', role: 'dagger' }, { character: 'Solo', party: 'Solo', role: 'inspector' },
  { character: 'Off', party: 'Off', enabled: false }] };
const files = { crafter: { bank: 'Bank', crafter: 'Bank', runner: 'Runner1', runnerOn: true, cwhWithdraw: true }, crafterRules: { crafters: { Bank: { on: true } } },
  stash: { collector: { on: true, name: 'Bank' }, letters: { to: 'Bank' } }, powerlevel: { pairs: [{ leveler: 'Solo', healer: 'Elder', on: false }] },
  runState: { parties: { Lead: { on: true } }, chars: { Mage: { on: false } } } };
const states = [{ name: 'Lead', cls: 'Shillien Knight', classId: 33, level: 50, ageSec: 5 }, { name: 'Spoil', cls: 'Bounty Hunter', classId: 55, level: 47, ageSec: 500 }];
// ---- view
const v = T.view(cfg, files, states), P = (k) => v.parties.find(p => p.key === k), M = (n) => v.parties.flatMap(p => p.members).find(m => m.name === n);
t(v.parties.length === 5 && !M('Off'), 'one card per party, disabled accounts left out', v.parties.map(p => p.key));
t(P('Lead').leader === 'Lead' && P('Lead').members[0].name === 'Lead' && P('Lead').on === true && P('Spoil').on === false, 'the leader comes first, the party switch is shown');
t(M('Lead').online === true && M('Spoil').online === false && M('Lead').classId === 33 && M('Lead').level === 50, 'online, class id and level come from the bot states');
const r = (n) => M(n).roles;
t(r('Bank').bank && r('Bank').crafter && r('Bank').collector && r('Bank').letters && r('Bank').cwh && !r('Lead').bank, 'bank, crafter, collector, letters receiver, clan warehouse from the existing files');
t(r('Runner1').runner && r('Runner1').runnerOn && r('Runner1').clanLeader, 'runner (ON) and clan leader');
t(r('Solo').plLeveler && r('Solo').plWith === 'Elder' && r('Elder').plHealer && r('Elder').plWith === 'Solo' && !r('Solo').plOn, 'power-level leveler / healer with each other (off)');
t(r('Mage').benched && !r('Lead').benched, 'benched from run_state chars on:false');
t(r('Heal').healerOnly && r('Elder').healerOnly && !r('Mage').healerOnly && r('Spoil').spoiler, 'heals only by the healer roles, spoiler by role / class');
t(v.settings.bank === 'Bank' && v.settings.runner === 'Runner1' && v.settings.lettersTo === 'Bank' && v.settings.collector.name === 'Bank', 'the settings summary');
// ---- undo (pure)
const mv = PM.planMove(cfg, {}, 'Spoil', 'Lead', 'Elder');
t(mv.ok, 'a real partymove plan to undo (Spoil into Lead, Elder leads the rest)', mv.error);
const u = T.planUndo(mv.cfg, cfg, null, null);
t(u.ok && u.moves.length === 2 && u.moves.some(m => m.name === 'Spoil' && m.from === 'Lead' && m.to === 'Spoil') && u.moves.some(m => m.name === 'Elder' && m.from === 'Elder' && m.to === 'Spoil'), 'undo puts every moved character back', u.moves);
t(u.cfg.accounts.find(a => a.character === 'Spoil').party === 'Spoil' && u.cfg.accounts.find(a => a.character === 'Elder').party === 'Spoil', 'the undone config has the old parties');
const extra = JSON.parse(JSON.stringify(mv.cfg)); extra.accounts.find(a => a.character === 'Lead').note = 'changed later'; extra.version = 9;
const u2 = T.planUndo(extra, cfg, null, null);
t(u2.ok && u2.cfg.version === 9 && u2.cfg.accounts.find(a => a.character === 'Lead').note === 'changed later', 'undo changes ONLY accounts[].party - every other later change stays');
t(!T.planUndo(cfg, cfg, null, null).ok, 'nothing moved = nothing to undo');
const cpBak = { parties: { Spoil: { members: { Spoil: { cls: 'bh' } } } } }, cpCur = { parties: { Spoil: { members: {} }, Lead: { members: { Spoil: { cls: 'bh' } } } } };
const u3 = T.planUndo(mv.cfg, cfg, cpCur, cpBak);
t(u3.classPlans && u3.classPlans.parties.Spoil.members.Spoil && !u3.classPlans.parties.Lead.members.Spoil, 'the moved character\'s class plan goes back too');
// ---- undo apply in a sandbox (backup dir like partymove_api, marker, config written, a second undo has nothing left)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'teams-')), DATA = path.join(TMP, 'data'), LOGS = path.join(TMP, 'logs'), SET = path.join(TMP, 'Settings');
[DATA, LOGS, SET].forEach(d => fs.mkdirSync(d, { recursive: true }));
const CF = path.join(TMP, 'swarm.config.json'); fs.writeFileSync(CF, JSON.stringify(cfg, null, 2));
const ctx = { DATA, LOGS, ROOT: TMP, SETTINGS: SET, CONFIG_FILE: CF, readStates: () => states };
const a = PM.apply(ctx, { name: 'Spoil', to: 'Lead', newLeader: 'Elder', confirm: true, by: 'test' });
t(a.ok && JSON.parse(fs.readFileSync(CF, 'utf8')).accounts.find(x => x.character === 'Spoil').party === 'Lead', 'sandbox: the existing partymove applies the move (backup written)', a);
const inf = T.info(ctx);
t(inf.undo && inf.undo.moves.length === 2, 'GET view offers the undo of that move', inf.undo);
t(T.doUndo(ctx, {}).code === 400, 'undo needs confirm: true');
const d1 = T.doUndo(ctx, { confirm: true, by: 'test' });
t(d1.ok && JSON.parse(fs.readFileSync(CF, 'utf8')).accounts.find(x => x.character === 'Spoil').party === 'Spoil', 'undo puts Spoil back into its party in swarm.config.json', d1);
t(fs.readdirSync(path.join(SET, 'backup')).some(d => /^partymove_undo_/.test(d)) && fs.readdirSync(path.join(SET, 'backup')).some(d => /^partymove_\d/.test(d) && fs.existsSync(path.join(SET, 'backup', d, 'undone.txt'))), 'a backup before the undo + the undone marker');
t(!T.info(ctx).undo, 'after the undo there is nothing left to undo');
t(/teams\tundo/.test(fs.readFileSync(path.join(LOGS, 'dashboard_commands.log'), 'utf8')), 'one log line for the undo');
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
// ---- wiring + page rules (source checks)
const SRV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), HTML = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8'), UI = fs.readFileSync(path.join(ROOT, 'Dashboard', 'teamspage.js'), 'utf8');
t(SRV.includes("require('./teams_api').handle(req, res, url,") && HTML.includes('<script src="/teamspage.js"></script>') && HTML.includes('data-tab="teams"') && HTML.includes("TeamsPage.route(kind, arg)"), 'server hook, menu entry, route and script tag');
t(UI.includes("call(`/api/partymove?name=") && UI.includes("post('/api/partymove', {") && !/fs\.|writeFile/.test(UI), 'moves go through the existing /api/partymove (dry run first, then POST)');
t(/uiConfirm\(\{ title: names\.length === 1/.test(UI) && UI.includes('uiList(lines)'), 'every move shows what changes and asks first');
t(UI.includes("post('/api/crafterpage', Object.assign({ action: 'settings' }") && UI.includes("post('/api/storage', { rules, rev: g.rev })") && UI.includes("post('/api/runstate', { char: name") && UI.includes("post('/api/powerlevel', { op: 'set'"), 'roles write only through the existing settings APIs');
t(UI.includes("on: false, aoe: false") && /Pair saved \(OFF\)/.test(UI), 'a new power-level pair is saved OFF');
t(UI.includes('dragstart') && UI.includes("data-tmpsel") && UI.includes('data-tmpmovesel'), 'drag & drop on PC + select several / move selected on the phone');
t(UI.includes('if (S.open && !document.hidden && !S.busy) load();'), 'no refresh while a dialog / drag is open');
console.log(`teams: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
