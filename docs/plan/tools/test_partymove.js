// test_partymove.js - requirement pages.md (Character page: "Move to party…", PARTYMOVE 2026-11-01, owner: "Make so i can transfer characters
// between teams via Dashboard"). Runs Dashboard/partymove_api.js apply() on SANDBOX copies (a temp folder), never the live files.
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
const PM = require(path.join(ROOT, 'Dashboard', 'partymove_api.js'));
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
function sandbox() {
  const S = fs.mkdtempSync(path.join(os.tmpdir(), 'partymove-')), D = path.join(S, 'data'), L = path.join(S, 'logs'); fs.mkdirSync(D); fs.mkdirSync(L);
  const w = (f, j) => fs.writeFileSync(path.join(D, f), JSON.stringify(j));
  fs.writeFileSync(path.join(S, 'swarm.config.json'), JSON.stringify({ mainLeader: 'Lead', accounts: [
    { character: 'Lead', party: 'Lead', role: 'tank' }, { character: 'Mem1', party: 'Lead', role: 'dd' }, { character: 'Mem2', party: 'Lead', role: 'healer' },
    { character: 'Other', party: 'Other', role: 'tank' }, { character: 'Taken', party: 'Taken', role: 'dd' }] }));
  w('fund_rules.json', { parties: { Lead: { receive: true }, Mem1: { receive: false, mine: 1 } } });
  w('loot_rules.json', { parties: { Lead: { on: true } } });
  w('party_auto.json', { parties: { Lead: { supplyWatch: true } } });
  w('run_state.json', { v: 1, parties: { Lead: { on: true, by: 'x' } } });
  w('party_spots.json', { Lead: { mode: 'auto' } });
  w('party_tactics.json', { Lead: { mode: 'off' } });
  w('class_plans.json', { parties: { Lead: { members: { Lead: { plan: [1] }, Mem1: { plan: [2] }, Mem2: { plan: [3] } } } } });
  return { S, D, L, ctx: { DATA: D, LOGS: L, ROOT: S, SETTINGS: path.join(S, 'Settings'), CONFIG_FILE: path.join(S, 'swarm.config.json') } };
}
const rj = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
// 1) a member becomes the leader of its own new party
{ const X = sandbox(), r = PM.apply(X.ctx, { name: 'Mem2', to: '', confirm: true });
  const cfg = rj(X.ctx.CONFIG_FILE), rs = rj(path.join(X.D, 'run_state.json')), sp = rj(path.join(X.D, 'party_spots.json')), cp = rj(path.join(X.D, 'class_plans.json'));
  t('member -> own new party: swarm.config.json party = its name', r.ok && cfg.accounts.find(a => a.character === 'Mem2').party === 'Mem2');
  t('the new party gets copies of the old party settings (run switch with by/why, spot, auto, loot, fund, tactics)', rs.parties.Mem2 && rs.parties.Mem2.on === true && /new party/.test(rs.parties.Mem2.why) && sp.Mem2 && sp.Mem2.mode === 'auto' && rj(path.join(X.D, 'party_auto.json')).parties.Mem2 && rj(path.join(X.D, 'party_tactics.json')).Mem2);
  t('the class plan entry moved to the new party key', cp.parties.Mem2 && cp.parties.Mem2.members.Mem2 && !cp.parties.Lead.members.Mem2);
  const bk = fs.readdirSync(path.join(X.S, 'Settings', 'backup')); t('a backup folder with swarm.config.json was written first', bk.length === 1 && fs.existsSync(path.join(X.S, 'Settings', 'backup', bk[0], 'swarm.config.json')));
  t('logged to dashboard_commands.log', /partymove\tMem2: Lead -> Mem2/.test(fs.readFileSync(path.join(X.L, 'dashboard_commands.log'), 'utf8'))); }
// 2) never over an existing key of the target
{ const X = sandbox(), r = PM.apply(X.ctx, { name: 'Mem1', to: '', confirm: true });
  t('no overwrite: Mem1 already had its own fund_rules entry - kept, said so', r.ok && rj(path.join(X.D, 'fund_rules.json')).parties.Mem1.mine === 1 && r.changes.some(c => /Mem1 already has its own settings - kept/.test(c))); }
// 3) into an existing party: config + class plan only
{ const X = sandbox(), r = PM.apply(X.ctx, { name: 'Mem1', to: 'Other', confirm: true });
  t('member -> existing party: config + class plan, no party settings copied', r.ok && rj(X.ctx.CONFIG_FILE).accounts.find(a => a.character === 'Mem1').party === 'Other' && !rj(path.join(X.D, 'run_state.json')).parties.Other && rj(path.join(X.D, 'class_plans.json')).parties.Other.members.Mem1); }
// 4) a leader with members: refused without a new leader, then the rest move under the chosen member
{ const X = sandbox(), r = PM.apply(X.ctx, { name: 'Lead', to: 'Other', confirm: true });
  t('leader with members and no new leader = refused (needLeader lists them), nothing written', !r.ok && r.needLeader && r.needLeader.join() === 'Mem1,Mem2' && rj(X.ctx.CONFIG_FILE).accounts.find(a => a.character === 'Lead').party === 'Lead');
  const r2 = PM.apply(X.ctx, { name: 'Lead', to: 'Other', newLeader: 'Mem1', confirm: true }), cfg = rj(X.ctx.CONFIG_FILE);
  t('leader moves + the rest follow the new leader (Mem1 leads Mem2), Mem1 gets the party settings', r2.ok && cfg.accounts.find(a => a.character === 'Lead').party === 'Other' && cfg.accounts.find(a => a.character === 'Mem2').party === 'Mem1' && cfg.accounts.find(a => a.character === 'Mem1').party === 'Mem1' && rj(path.join(X.D, 'party_spots.json')).Mem1); }
// 5) refusals
{ const X = sandbox();
  t('needs confirm: true', PM.apply(X.ctx, { name: 'Mem1', to: 'Other' }).error && rj(X.ctx.CONFIG_FILE).accounts.find(a => a.character === 'Mem1').party === 'Lead');
  t('unknown party / same party / unknown name refused', !!PM.apply(X.ctx, { name: 'Mem1', to: 'Nope', confirm: true }).error && !!PM.apply(X.ctx, { name: 'Mem1', to: 'Lead', confirm: true }).error && !!PM.apply(X.ctx, { name: 'Ghost', to: 'Other', confirm: true }).error);
  const d = PM.info(X.ctx, 'Mem2', 'Other', ''); t('GET dry run lists the changes and writes nothing', d.plan && d.plan.ok && d.plan.changes.some(c => /Mem2 -> party Other/.test(c)) && rj(X.ctx.CONFIG_FILE).accounts.find(a => a.character === 'Mem2').party === 'Lead'); }
const SRV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), IDX = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
t('server.js hooks partymove_api, index.html loads partymove.js', SRV.includes("require('./partymove_api').handle(") && IDX.includes('<script src="/partymove.js"></script>'));
console.log(`partymove: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
