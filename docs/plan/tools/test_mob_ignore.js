// MOB IGNORE (2026-10-17): Dashboard/mobignore_api.js with a fake MCP — no game, no L2Swarm.
const path = require('path'), fs = require('fs'), os = require('os');
const M = require(path.join(__dirname, '..', '..', '..', 'Dashboard', 'mobignore_api.js'));
let pass = 0, fail = 0; const t = (ok, m) => { if (ok) pass++; else { fail++; console.log('  FAIL ' + m); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mobig-'));
const calls = [];
const rules = { A: [], B: [{ Id: 18257, Name: 'Treasure Chest', ToAttack: false, ToSpoil: false }] };
const mcpCall = async (tool, args) => {
  calls.push([tool, args]);
  if (tool === 'get_accounts_status') return JSON.stringify([{ account_id: 'A', character_name: 'Alpha', config_path: 'a.xml', is_logged_in: true }, { account_id: 'B', character_name: 'Beta', config_path: 'b.xml', is_logged_in: true }]);
  if (tool === 'manage_mob_settings' && args.action === 'list') return JSON.stringify(rules[args.account_id]);
  return 'ok';
};
(async () => {
  t(M.names({ DATA: tmp }).join() === 'Treasure Chest', 'no file = Treasure Chest');
  await M.tick({ DATA: tmp, LOGS: tmp, mcpCall });
  const sets = calls.filter(c => c[0] === 'manage_mob_settings' && c[1].action === 'set');
  t(sets.length === 1 && sets[0][1].account_id === 'A' && sets[0][1].mob_name === 'Treasure Chest' && sets[0][1].to_attack === false && sets[0][1].to_spoil === false, 'only the account without the rule gets it');
  const saves = calls.filter(c => c[0] === 'manage_account_config');
  t(saves.length === 1 && saves[0][1].account_id === 'A' && saves[0][1].action === 'save' && !saves[0][1].config_path, 'saved to its own config (never a config_path)');
  calls.length = 0; await M.tick({ DATA: tmp, LOGS: tmp, mcpCall });
  t(!calls.some(c => c[0] === 'manage_mob_settings'), 'checked accounts are not asked again');
  fs.writeFileSync(path.join(tmp, 'mob_ignore.json'), JSON.stringify({ names: ['Treasure Chest', 'Wisp'] }));
  calls.length = 0; await M.tick({ DATA: tmp, LOGS: tmp, mcpCall });
  t(calls.filter(c => c[1] && c[1].action === 'set').every(c => c[1].mob_name === 'Wisp' || c[1].account_id === 'A'), 'a new name in the file is applied');
  t(/never attack/.test(fs.readFileSync(path.join(tmp, 'mob_ignore.log'), 'utf8')), 'logged');
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
