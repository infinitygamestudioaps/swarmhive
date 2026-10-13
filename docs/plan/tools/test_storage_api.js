// STORAGE PAGE (STORAGE-2026-10-13): sandbox test of Dashboard/storagepage_api.js (GET/POST /api/storage, GET /api/storage/plan) and the page
// module WITHOUT touching the game or the live data: the rules file is a SCRATCH copy in os.tmpdir() (env SWARM_STASHRULES_FILE), DATA and LOGS
// point at the scratch dir, states are fake. Checks that the live Scripts/data/stash_rules.json is byte-for-byte unchanged afterwards, and that
// the page's / the API's effective settings agree with swarm.js (Scripts_dev) stashSettings.
//   node docs/plan/tools/test_storage_api.js
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), assert = require('assert'), vm = require('vm'), { Readable } = require('stream');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const LIVE = path.join(ROOT, 'Scripts', 'data', 'stash_rules.json');
const liveBytes = () => { try { return fs.readFileSync(LIVE); } catch (e) { return null; } };
const LIVE0 = liveBytes();

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-'));
const DATA = path.join(TMP, 'data'), LOGS = path.join(TMP, 'Logs');
fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(LOGS, { recursive: true });
const RFILE = path.join(DATA, 'stash_rules.json');
process.env.SWARM_STASHRULES_FILE = RFILE;
fs.writeFileSync(RFILE, LIVE0 ? LIVE0 : JSON.stringify({ dest: 'clan', chars: {} }, null, 1));
fs.writeFileSync(path.join(DATA, 'clan_quests.json'), JSON.stringify({ clan: { leader: 'Dagger1' } }));
fs.writeFileSync(path.join(LOGS, 'bag_Doombringer1.json'), JSON.stringify({ at: new Date().toISOString(), items: [{ id: 3875, count: 3 }, { id: 3888, count: 1 }, { id: 736, count: 5 }] }));
fs.writeFileSync(path.join(LOGS, 'stash_plan_Dagger1.json'), JSON.stringify({ at: new Date().toISOString(), why: '!stashplan', name: 'Dagger1', bag: 200, dest: 'clan', inClan: true, settings: { mode: 'all' }, summary: '180 kinds to deposit',
  deposit: [{ objId: 1, id: 1865, name: 'Varnish', count: 50, why: 'store everything', cat: 'all' }], keep: [{ objId: 2, id: 736, name: 'Scroll of Escape', count: 73, why: 'rule: keep (this character)', cat: 'rule' }], sell: [] }));

const API = require(path.join(ROOT, 'Dashboard', 'storagepage_api.js'));
const TEAM = { Tank1: 'Tank1', Doombringer1: 'Tank1', Bishop1: 'Tank1', Dagger1: 'Dagger1', Healer6: 'Spoiler6', Spoiler6: 'Spoiler6' };
const STATES = [
  { name: 'Dagger1', ageSec: 5, level: 53, cls: 'Treasure Hunter', x: 84840, y: 148776, clan: 'MyClan', stash: { slots: 3, last: { at: '2026-10-13T15:00:00Z', n: 3, ok: true } } },
  { name: 'Doombringer1', ageSec: 5, level: 60, cls: 'Berserker', x: 83500, y: 148600, clan: 'MyClan' },
  { name: 'Healer6', ageSec: 400, level: 40, cls: 'Elder', x: 0, y: 0, clan: '' },
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
function res0() { return { code: 0, body: null, writeHead(c, h) { this.code = c; this.headers = h; }, end(b) { this.raw = b; } }; }
async function call(method, p, body) {
  const req = body !== undefined ? Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]) : Readable.from([]);
  req.method = method;
  const res = res0();
  const handled = await API.handle(req, res, new URL('http://x' + p), ctx);
  return Object.assign(res, { handled });
}
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + ' — ' + (e && e.message)); } }
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const PURE = src.slice(src.indexOf('// STASH-PURE-BEGIN'), src.indexOf('// STASH-PURE-END'));
const M = new Function(PURE + '\nreturn { stashSettings, stashKindFor, STASH_LETTER_IDS };')();

(async () => {
  console.log('scratch dir ' + TMP);
  await t('other paths are not handled', async () => { const r = await call('GET', '/api/other'); assert.strictEqual(r.handled, false); });
  await t('static /storagepage.js + /storagepage.css served', async () => {
    for (const f of ['/storagepage.js', '/storagepage.css']) { const r = await call('GET', f); assert.strictEqual(r.code, 200, f); assert.ok(String(r.raw).length > 800, f); }
  });
  await t('no key -> 401 (settings and plan)', async () => { allow = false; const a = await call('GET', '/api/storage'), b = await call('GET', '/api/storage/plan?name=Dagger1'); allow = true; assert.strictEqual(a.code, 401); assert.strictEqual(b.code, 401); });
  let info = null;
  await t('GET: rules + parties + effective settings + letter items', async () => {
    const r = await call('GET', '/api/storage'); assert.strictEqual(r.code, 200); info = r.body;
    assert.ok(info.rev && info.rules && Array.isArray(info.parties) && info.clanLeader === 'Dagger1');
    assert.strictEqual(info.letterItems.length, 14); if (fs.existsSync(path.join(ROOT, 'Dashboard', 'data', 'items.json'))) assert.strictEqual(info.letterItems[0].name, 'L2Day - A'); else assert.ok(/3875|L2Day/.test(info.letterItems[0].name));   // PKGSKIP: item names come from the user's client data
    const all = info.parties.flatMap(p => p.members), d = all.find(m => m.name === 'Doombringer1'), q = all.find(m => m.name === 'Dagger1'), a = all.find(m => m.name === 'Healer6');
    assert.strictEqual(d.letters, 4); assert.strictEqual(d.bag, 3); assert.strictEqual(q.plan.n, 1);
    assert.strictEqual(a.clan, ''); assert.strictEqual(a.kind, 'private', 'a non-member stores in its own warehouse');
    if (LIVE0) { assert.strictEqual(q.eff.dest, 'clan'); assert.strictEqual(q.eff.mode, 'all'); assert.strictEqual(q.kind, 'clan'); }
  });
  await t('API effective == swarm.js stashSettings (many combinations)', async () => {
    const R = { dest: 'clan', defaults: { dest: 'auto', auto: false, trigger: { kind: 'weight', weightPct: 80 } }, parties: { Tank1: { dest: 'private', auto: true, trigger: { kind: 'town', gapMin: 45 } }, X: { mode: 'off' } },
      chars: { Bishop1: { dest: 'clan', mode: 'all', trigger: { above: 90 } }, Z: { mode: 'bogus', auto: 'yes', trigger: { weightPct: 500 } } } };
    const base = { dest: 'private', auto: false, above: 120 };
    for (const [n, p] of [['Bishop1', 'Tank1'], ['Doombringer1', 'Tank1'], ['Z', 'X'], ['Q', 'Q'], ['Z', '']]) for (const rules of [R, {}, { dest: 'clan' }, JSON.parse(String(LIVE0 || '{}'))])
      assert.deepStrictEqual(API.effective(rules, n, p, base), M.stashSettings(rules, n, p, base), `${n}/${p}`);
    for (const d of ['auto', 'clan', 'private']) for (const c of [true, false]) assert.strictEqual(API.kindFor(d, c), M.stashKindFor(d, c).kind);
    assert.deepStrictEqual(API.LETTER_IDS, M.STASH_LETTER_IDS);
  });
  await t('the page computes the same effective settings (storagepage.js eff in a fake window)', async () => {
    const win = { document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }, setInterval, clearInterval, setTimeout, clearTimeout };
    const sb = Object.assign({ window: win }, win); vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'Dashboard', 'storagepage.js'), 'utf8'), sb);
    const P = sb.window.StoragePage; assert.ok(P && typeof P.eff === 'function');
    const R = { dest: 'clan', defaults: { mode: 'rules', trigger: { kind: 'bag', above: 99 } }, parties: { Tank1: { auto: true } }, chars: { Bishop1: { mode: 'all', dest: 'private' } } };
    for (const [n, p] of [['Bishop1', 'Tank1'], ['Doombringer1', 'Tank1'], ['Q', 'Other']]) {
      const a = P.eff(R, n, p), b = M.stashSettings(R, n, p, { dest: 'private', auto: false, above: 120 });
      ['dest', 'mode', 'auto', 'town'].forEach(k => assert.strictEqual(a[k], b[k], `${n} ${k}`)); assert.strictEqual(JSON.stringify(a.trigger), JSON.stringify(b.trigger), n);   // other realm: compare as JSON
    }
  });
  await t('page: no browser alert / confirm / prompt; uidialog only', async () => {
    const js = fs.readFileSync(path.join(ROOT, 'Dashboard', 'storagepage.js'), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/(^|[^.\w])(alert|confirm|prompt)\s*\(/.test(js), 'a browser dialog call'); assert.ok(/uiConfirm\(/.test(js) && /uiAlert\(/.test(js));
    assert.ok(/nothing happens until you switch it on/.test(js), 'the OFF default is spelled out');
  });
  await t('POST round trip keeps unknown keys (item rules, notes) and every value', async () => {
    const before = JSON.parse(fs.readFileSync(RFILE, 'utf8'));
    const r = await call('POST', '/api/storage', { rules: before, rev: info.rev }); assert.strictEqual(r.code, 200, JSON.stringify(r.body));
    const after = JSON.parse(fs.readFileSync(RFILE, 'utf8')); delete after._updated; const b2 = Object.assign({}, before); delete b2._updated;
    const sort = (o) => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, x) => (a[x] = v[x], a), {}) : v);
    info.rev = r.body.rev; for (const k of ["defaults", "parties", "chars"]) { for (const o of [after, b2]) if (o[k] && typeof o[k] === "object" && !Object.keys(o[k]).length) delete o[k]; }   /* PKGSKIP: the shipped seed has no defaults/parties; empty sections are equal to missing ones */
    assert.strictEqual(sort(after), sort(b2));
    assert.ok(fs.readdirSync(path.join(DATA, 'history')).some(n => /^stash_rules/.test(n)), 'history copy');
  });
  await t('POST: per-character / party / default settings + letters saved', async () => {
    const rules = JSON.parse(fs.readFileSync(RFILE, 'utf8'));
    rules.defaults = { dest: 'auto', mode: 'rules', auto: false, trigger: { kind: 'bag', above: '110' } };
    rules.parties = { Spoiler6: { dest: 'private', auto: true, trigger: { kind: 'supply' } } };
    rules.chars = Object.assign({}, rules.chars, { Healer6: { dest: 'private', mode: 'off', town: 'Oren' }, Doombringer1: { mode: 'all', keepNames: ['Arrow$'], keep: ['1661'] } });
    rules.letters = { on: true, to: 'Dagger1', ids: [3875, '3888'], keep: false, except: ['Bishop1'] };
    const r = await call('POST', '/api/storage', { rules, rev: info.rev }); assert.strictEqual(r.code, 200, JSON.stringify(r.body)); info.rev = r.body.rev;
    const s = r.body.rules;
    assert.strictEqual(s.defaults.trigger.above, 110); assert.deepStrictEqual(s.chars.Doombringer1.keep, [1661]); assert.deepStrictEqual(s.letters.ids, [3875, 3888]);
    assert.strictEqual(M.stashSettings(s, 'Healer6', 'Spoiler6', {}).mode, 'off'); assert.strictEqual(M.stashSettings(s, 'Spoiler6', 'Spoiler6', {}).trigger.kind, 'supply');
    assert.ok(/storage\tsave/.test(fs.readFileSync(path.join(LOGS, 'dashboard_commands.log'), 'utf8')));
  });
  await t('POST: bad values are refused with a reason (file unchanged)', async () => {
    const sha0 = fs.readFileSync(RFILE, 'utf8');
    for (const [patch, re] of [[{ defaults: { dest: 'mars' } }, /destination/], [{ chars: { Doombringer1: { mode: 'most' } } }, /mode/], [{ chars: { Doombringer1: { town: 'Atlantis' } } }, /town/],
      [{ chars: { Doombringer1: { depositNames: ['(['] } } }, /not a valid pattern/], [{ chars: { Doombringer1: { keep: ['abc'] } } }, /item id/], [{ chars: { 'bad name!': {} } }, /not a character name/],
      [{ parties: { Tank1: { trigger: { kind: 'moon' } } } }, /trigger/], [{ parties: { Tank1: { trigger: { weightPct: 400 } } } }, /weightPct/], [{ chars: { Doombringer1: { auto: 'yes' } } }, /automatic/], [{ letters: { to: 'a b' } }, /receiver/]]) {
      const rules = Object.assign(JSON.parse(sha0), patch);
      const r = await call('POST', '/api/storage', { rules, rev: info.rev }); assert.strictEqual(r.code, 400, JSON.stringify(patch)); assert.ok(re.test(r.body.error), `${JSON.stringify(patch)}: ${r.body.error}`);
    }
    assert.strictEqual(fs.readFileSync(RFILE, 'utf8'), sha0);
  });
  await t('POST: blank = removed (inherit), empty character entry dropped', async () => {
    const rules = JSON.parse(fs.readFileSync(RFILE, 'utf8')); rules.chars.Healer6 = { dest: '', mode: null, town: '' };
    const r = await call('POST', '/api/storage', { rules, rev: info.rev }); assert.strictEqual(r.code, 200); info.rev = r.body.rev; assert.ok(!r.body.rules.chars.Healer6);
  });
  await t('POST: stale rev -> 409 conflict', async () => { const r = await call('POST', '/api/storage', { rules: {}, rev: 'old' }); assert.strictEqual(r.code, 409); assert.ok(r.body.conflict); });
  await t('GET /api/storage/plan: the last dry run; unknown -> 404; bad name -> 400', async () => {
    const a = await call('GET', '/api/storage/plan?name=Dagger1'); assert.strictEqual(a.code, 200); assert.strictEqual(a.body.deposit[0].name, 'Varnish'); assert.strictEqual(a.body.keep.length, 1);
    assert.strictEqual((await call('GET', '/api/storage/plan?name=Nobody')).code, 404); assert.strictEqual((await call('GET', '/api/storage/plan?name=..%2Fx')).code, 400);
  });
  await t('server.js + index.html wire the page', async () => {
    const sv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), ix = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8');
    assert.ok(/require\('\.\/storagepage_api'\)\.handle/.test(sv)); assert.ok(/data-tab="storage"/.test(ix) && /StoragePage\.route/.test(ix) && /src="\/storagepage\.js"/.test(ix) && /href="\/storagepage\.css"/.test(ix));
  });
  await t('the live stash_rules.json is unchanged', async () => { const now = liveBytes(); assert.ok(!LIVE0 || (now && Buffer.compare(now, LIVE0) === 0)); });
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
