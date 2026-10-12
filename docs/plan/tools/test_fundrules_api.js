// ADENA PAGE: sandbox test of Dashboard/fundpage_api.js (GET/POST /api/fundrules) WITHOUT touching the game or the live data:
// the module is loaded on its own with a fake ctx; the rules file and the hand-out log are SCRATCH copies in os.tmpdir()
// (env SWARM_FUNDRULES_FILE / SWARM_FUNDLOG_FILE), DATA and LOGS point at the scratch dir, states are fake. Checks that the live
// Scripts/data/fund_rules.json is byte-for-byte unchanged afterwards.
//   node docs/plan/tools/test_fundrules_api.js
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert'), { Readable } = require('stream');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const LIVE = path.join(ROOT, 'Scripts', 'data', 'fund_rules.json');
const liveBytes = () => { try { return fs.readFileSync(LIVE); } catch (e) { return null; } };
const LIVE0 = liveBytes();

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fundrules-'));
const DATA = path.join(TMP, 'data'), LOGS = path.join(TMP, 'Logs');
fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(LOGS, { recursive: true });
const RFILE = path.join(DATA, 'fund_rules.json'), LFILE = path.join(LOGS, 'fund_log.json');
process.env.SWARM_FUNDRULES_FILE = RFILE; process.env.SWARM_FUNDLOG_FILE = LFILE;
// the scratch copy of the live data (or a minimal file when there is none)
fs.writeFileSync(RFILE, LIVE0 ? LIVE0 : JSON.stringify({ _readme: 'test readme', on: true, town: 'Giran', parties: {} }, null, 1));
const T = Date.now();
fs.writeFileSync(LFILE, JSON.stringify({ Bishop1: T - 60000, Crafter1: T - 3600000, Healer1: T - 1000 }));
fs.writeFileSync(path.join(DATA, 'clan_quests.json'), JSON.stringify({ clan: { leader: 'Dagger1' } }));

const API = require(path.join(ROOT, 'Dashboard', 'fundpage_api.js'));
const TEAM = { Tank1: 'Tank1', Bishop1: 'Tank1', Destroyer1: 'Tank1', Crafter1: 'Crafter1', Healer1: 'Crafter1', Dagger1: 'Dagger1' };
const STATES = [
  { name: 'Tank1', adena: 26837711, ageSec: 5, level: 56, cls: 'Shillien Knight', x: 83473, y: 148554 },
  { name: 'Bishop1', adena: 1200000, ageSec: 400, level: 55, cls: 'Bishop', x: 0, y: 0 },
  { name: 'Healer1', adena: 50000, ageSec: 10, level: 50, cls: 'Elder', x: 83500, y: 148600 },
];
let allow = true;
const ctx = {
  DIR: path.join(ROOT, 'Dashboard'), DATA, LOGS, ROOT,
  readJson: (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return fb; } },
  readStates: () => STATES.map(s => Object.assign({}, s)), teamMap: () => Object.assign({}, TEAM), reloadCfg: () => ({ accounts: [] }), mainLeader: 'Tank1',
  allowed: () => allow,
  json: (res, code, obj) => { res.code = code; res.body = obj; },
  send: (res, code, type, body) => { res.code = code; res.body = body; res.type = type; },
};
// a fake http request / response pair through handle()
function res0() { return { code: 0, body: null, headers: null, writeHead(c, h) { this.code = c; this.headers = h; }, end(b) { this.raw = b; } }; }
async function call(method, p, body) {
  const req = body !== undefined ? Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]) : Readable.from([]);
  req.method = method;
  const res = res0();
  const handled = await API.handle(req, res, new URL('http://x' + p), ctx);
  return Object.assign(res, { handled });
}
const sha = () => require('crypto').createHash('sha1').update(fs.readFileSync(RFILE)).digest('hex');
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' — ' + (e && e.message)); } }

(async () => {
  console.log('scratch dir ' + TMP);
  await t('other paths are not handled', async () => { const r = await call('GET', '/api/other'); assert.strictEqual(r.handled, false); });
  await t('static /fundpage.js + /fundpage.css served', async () => {
    for (const f of ['/fundpage.js', '/fundpage.css']) { const r = await call('GET', f); assert.strictEqual(r.code, 200, f); assert.ok(String(r.raw).length > 1000, f); }
  });
  await t('no key -> 401', async () => { allow = false; const r = await call('GET', '/api/fundrules'); allow = true; assert.strictEqual(r.code, 401); });

  let g0;
  await t('GET shape: rules, rev, towns, clanLeader, parties[{leader, members[{name, adena, online}]}], log newest first', async () => {
    const r = await call('GET', '/api/fundrules'); g0 = r.body;
    assert.strictEqual(r.code, 200); assert.ok(g0.rules && typeof g0.rules === 'object'); assert.ok(/^[0-9a-f]{16}$/.test(g0.rev));
    assert.deepStrictEqual(g0.towns.length, 11); assert.ok(g0.towns.includes('Giran')); assert.strictEqual(g0.clanLeader, 'Dagger1');
    assert.ok(Array.isArray(g0.parties) && g0.parties.length >= 3);
    assert.strictEqual(g0.parties[0].leader, 'Tank1', 'main leader first');
    g0.parties.forEach(p => { assert.ok(typeof p.leader === 'string'); assert.strictEqual(p.members[0].name, p.leader, 'leader first'); p.members.forEach(m => { assert.ok('name' in m && 'adena' in m && 'online' in m); }); });
    const sh = g0.parties.find(p => p.leader === 'Tank1');
    const m = (n) => sh.members.find(x => x.name === n);
    assert.strictEqual(m('Tank1').adena, 26837711); assert.strictEqual(m('Tank1').online, true); assert.strictEqual(m('Tank1').town, 'Giran');
    assert.strictEqual(m('Bishop1').online, false, 'state 400 s old = offline'); assert.strictEqual(m('Destroyer1').adena, null, 'no state = null');
    assert.deepStrictEqual(g0.log.map(x => x.name), ['Healer1', 'Bishop1', 'Crafter1']); assert.strictEqual(g0.log[0].party, 'Crafter1');
  });

  const base = () => JSON.parse(JSON.stringify(g0.rules));
  await t('POST negative numbers refused (400, file unchanged)', async () => {
    const before = sha();
    for (const mut of [(r) => { r.minGive = -1; }, (r) => { r.defaults = Object.assign({}, r.defaults, { memberTarget: -5 }); }, (r) => { r.chars = { Bishop1: { target: '-2m' } }; },
      (r) => { r.parties = Object.assign({}, r.parties, { Tank1: { receive: true, leaderTarget: -100 } }); }, (r) => { r.givers = Object.assign({}, r.givers, { keepAtLeast: -1 }); }]) {
      const r = base(); mut(r);
      const x = await call('POST', '/api/fundrules', { rules: r, rev: g0.rev });
      assert.strictEqual(x.code, 400, JSON.stringify(x.body)); assert.ok(/0 or more/.test(x.body.error), x.body.error);
    }
    assert.strictEqual(sha(), before);
  });
  await t('POST garbage refused: text amount, bad town, bad mode, bad name, bad JSON', async () => {
    const cases = [(r) => { r.slack = 'lots'; }, (r) => { r.town = 'Atlantis'; }, (r) => { r.givers = { mode: 'everyone', list: [], keepAtLeast: 1 }; }, (r) => { r.chars = { 'bad name!': { target: 1 } }; }];
    for (const mut of cases) { const r = base(); mut(r); const x = await call('POST', '/api/fundrules', { rules: r, rev: g0.rev }); assert.strictEqual(x.code, 400, JSON.stringify(x.body)); }
    const x = await call('POST', '/api/fundrules', '{nope'); assert.strictEqual(x.code, 400);
  });
  await t('POST stale rev -> 409 conflict', async () => { const x = await call('POST', '/api/fundrules', { rules: base(), rev: '0000000000000000' }); assert.strictEqual(x.code, 409); assert.strictEqual(x.body.conflict, true); });

  let saved;
  await t('POST sanitizes + saves: unknown party kept, 0 target kept, blank target dropped, "8m"/"300k"/"1,500,000" parsed, town case fixed, _readme kept, _updated set', async () => {
    const r = base();
    r.town = 'giran'; r.minGive = '300k'; r.everyMin = '45';
    r.defaults = { leaderTarget: '8m', memberTarget: '1,500,000', clanLeaderTarget: 12000000 };
    r.givers = { mode: 'list', list: ['Tank1', 'Tank1', ' Dagger1 '], keepAtLeast: '30m' };
    r.parties = Object.assign({}, r.parties, { Zzzparty: { receive: false, leaderTarget: '2m' }, Tank1: { receive: true, leaderTarget: '', memberTarget: null } });
    r.chars = { Bishop1: { target: 0 }, Healer1: { target: '' }, Ghostchar: { target: '4m' } };
    r._readme = 'page must not replace this';
    const x = await call('POST', '/api/fundrules', { rules: r, rev: g0.rev, by: 'test' });
    assert.strictEqual(x.code, 200, JSON.stringify(x.body)); saved = x.body.rules;
    const disk = JSON.parse(fs.readFileSync(RFILE, 'utf8'));
    assert.deepStrictEqual(disk, saved, 'returned = on disk');
    assert.strictEqual(disk.town, 'Giran'); assert.strictEqual(disk.minGive, 300000); assert.strictEqual(disk.everyMin, 45);
    assert.deepStrictEqual(disk.defaults, { leaderTarget: 8000000, memberTarget: 1500000, clanLeaderTarget: 12000000 });
    assert.deepStrictEqual(disk.givers, { mode: 'list', list: ['Tank1', 'Dagger1'], keepAtLeast: 30000000 });
    assert.deepStrictEqual(disk.parties.Zzzparty, { receive: false, leaderTarget: 2000000 }, 'unknown party kept');
    assert.deepStrictEqual(disk.parties.Tank1, { receive: true }, 'blank party targets dropped');
    assert.deepStrictEqual(disk.chars.Bishop1, { target: 0 }, '0 kept = never receives');
    assert.ok(!('Healer1' in disk.chars), 'blank character target removed');
    assert.deepStrictEqual(disk.chars.Ghostchar, { target: 4000000 }, 'unknown character kept');
    const old = LIVE0 ? JSON.parse(String(LIVE0).replace(/^﻿/, '')) : { _readme: 'test readme' };
    assert.strictEqual(disk._readme, old._readme, '_readme kept from the file');
    assert.ok(Date.now() - Date.parse(disk._updated) < 10000, '_updated set');
    assert.strictEqual(x.body.rev, (await call('GET', '/api/fundrules')).body.rev, 'new rev = file rev');
  });
  await t('history copy written + one dashboard_commands.log line', async () => {
    const H = path.join(DATA, 'history'); const hs = fs.existsSync(H) ? fs.readdirSync(H).filter(n => /^fund_rules_/.test(n)) : [];
    assert.strictEqual(hs.length, 1, 'one history copy');
    const lines = fs.readFileSync(path.join(LOGS, 'dashboard_commands.log'), 'utf8').trim().split(/\r?\n/);
    assert.strictEqual(lines.length, 1); assert.ok(/\tfundrules\tsave\ttest: /.test(lines[0]), lines[0]); assert.ok(/Zzzparty/.test(lines[0]));
  });
  await t('save again without rev: on false kept, no lock file left behind', async () => {
    const r = JSON.parse(JSON.stringify(saved)); r.on = false;
    const x = await call('POST', '/api/fundrules', { rules: r }); assert.strictEqual(x.code, 200);
    assert.strictEqual(JSON.parse(fs.readFileSync(RFILE, 'utf8')).on, false);
    assert.ok(!fs.existsSync(RFILE + '.lock'));
    assert.ok(!fs.readdirSync(DATA).some(n => /\.tmp$/.test(n)), 'no tmp files');
  });
  await t('parseAmount', () => {
    const P = API.parseAmount;
    assert.strictEqual(P('8m'), 8000000); assert.strictEqual(P('300k'), 300000); assert.strictEqual(P('8,000,000'), 8000000); assert.strictEqual(P('1.5M'), 1500000);
    assert.strictEqual(P(''), null); assert.strictEqual(P(null), null); assert.ok(Number.isNaN(P('abc'))); assert.strictEqual(P(42), 42);
  });
  await t('the live Scripts/data/fund_rules.json is byte-for-byte unchanged', () => {
    const now = liveBytes(); assert.ok((now === null && LIVE0 === null) || (now && LIVE0 && Buffer.compare(now, LIVE0) === 0));
  });

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
