// ROUTEFIX-2026-10-23 (owner: a red sign wherever a route must be fixed by hand; NO ROUTE for bosses without one)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = path.join(__dirname, '..', '..', '..');
const rd = (p) => fs.readFileSync(path.join(R, p), 'utf8');
const RP = rd('Dashboard/raidspage.js'), CP = fs.existsSync(path.join(R, 'Dashboard/circuitpage.js')) ? rd('Dashboard/circuitpage.js') : '', PS = rd('Dashboard/partystatus.js'), SRV = rd('Dashboard/server.js');
const SW = rd(fs.existsSync(path.join(R, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev/swarm.js' : 'Scripts/swarm.js');
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
// run the RouteFix module with a stub DOM + fetch
const i = RP.indexOf('// ROUTEFIX-2026-10-23 (owner'), src = RP.slice(i);
const routes = [{ id: '25260', boss: 'Iron Giant Totem', fails: 27, manual: true, lastFail: new Date().toISOString(), points: 17, stuck: { x: 105032, y: 29960, point: 4, n: 17, by: 'Tank2', at: new Date().toISOString() } },
  { id: '1', boss: 'Fine', fails: 0 }, { id: '2', boss: 'Old fail, ok since', fails: 3, lastFail: '2026-10-01T00:00:00Z', lastOk: '2026-10-02T00:00:00Z' }];
const ctx = { window: {}, document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() { } } }, fetch: async () => ({ json: async () => ({ routes }) }), Date, console };
vm.createContext(ctx); vm.runInContext(src, ctx);
const RF = ctx.window.RouteFix;
(async () => {
  await RF.load(true);
  const s = RF.sign('25260', { name: 'Iron Giant Totem' });
  t('fix sign: red, failed count, stuck point, link to the editor', /rf-sign/.test(s) && /FIX THIS ROUTE/.test(s) && /27×/.test(s) && /point <b>4\/17<\/b> at 105032,29960/.test(s) && /#\/raid\/25260\/route/.test(s));
  t('fine route: no sign', RF.sign('1') === '');
  t('old fails with a success since: no sign', RF.sign('2') === '');
  t('missing route: NO ROUTE only when asked', RF.sign('999') === '' && /NO ROUTE/.test(RF.sign('999', { missing: true })));
  const b = RF.banner([{ id: '25260', name: 'Iron Giant Totem' }, { id: '1', name: 'Fine' }, { id: '777', name: 'No Route Boss' }], { missing: true });
  t('banner lists fix + missing', /1 route must be fixed by hand/.test(b) && /Iron Giant Totem/.test(b) && /1 without a route/.test(b) && /No Route Boss/.test(b));
  t('banner empty when all fine', RF.banner([{ id: '1' }]) === '');
  t('names escaped', !/<x>/.test(RF.sign('999', { missing: true, name: '<x>' })));
  // wiring
  t('raids board: banner + card sign + boss page sign', RP.includes("RouteFix.banner(RP.raids)") && RP.includes("RouteFix.sign(r.id, { small: true })") && RP.includes("RouteFix.sign(b.id, { missing: true })"));
  t('circuit page: banner + row sign incl. missing (owner-only page: skipped in the public package)', !CP || CP.includes('${rfBan}<div class="rcp-blist">') && CP.includes('RouteFix.sign(x.id, { small: true, missing: true })'));
  t('party card: FIX THIS ROUTE + NO SHOTS', PS.includes('<b>FIX THIS ROUTE</b>') && PS.includes('<b>NO SHOTS</b>') && PS.includes('return warnLine(leader, list) + routeLine(leader)'));
  t('server: needsFix + stuck in /api/routes', SRV.includes("needsFix: (r.fails || 0) >= 2 && !(Date.parse(r.lastOk || '') > Date.parse(r.lastFail || ''))") && SRV.includes('stuck: r.stuck &&'));
  t('swarm.js: stuck point kept in the route file + cleared on success', /state\.routeStuck = routeStuckRec\(j \+ 1, n, label\)/.test(SW) && /old\.stuck = rs; state\.routeStuck = null;/.test(SW) && /old\.fails = 0; delete old\.stuck;/.test(SW));
  t('swarm_state carries routeFixWarn + shotWarn', SW.includes('routeFixWarn: state.routeFixWarn &&') && SW.includes('shotWarn: state.shotWarn &&'));
  console.log(`${ok} ok, ${bad} FAIL`);
  process.exit(bad ? 1 : 0);
})();
