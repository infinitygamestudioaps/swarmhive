// SPOIL-2026-10-19: Dashboard/spoilpage_api.js against a SCRATCH rules file (never the live one) + the SPOIL-PURE rules copy == swarm.js.
// Run: node docs/plan/tools/test_spoil_page.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spoilpage_'));
process.env.SWARM_SPOILRULES_FILE = path.join(tmp, 'spoil_rules.json');
const A = require(path.join(ROOT, 'Dashboard', 'spoilpage_api.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

// 1) the rules functions are a copy of the bot's block (spoilRulesNorm / spoilCfg / spoilWanted)
const dev = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8'), api = fs.readFileSync(path.join(ROOT, 'Dashboard', 'spoilpage_api.js'), 'utf8');
const fnText = (s, n) => { const i = s.indexOf(`function ${n}(`); if (i < 0) return null; let d = 0, j = s.indexOf('{', i); for (let k = j; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}' && --d === 0) return s.slice(i, k + 1); } return null; };
['spObj', 'spBool', 'spInt', 'spoilRulesNorm', 'spoilCfg', 'spoilWanted'].forEach(n => ok(fnText(dev, n) && fnText(dev, n) === fnText(api, n), `${n} differs between Scripts_dev/swarm.js and Dashboard/spoilpage_api.js`));
ok(/const SPOIL_DEF = (\{[^\n]+\});/.exec(dev)[1] === /const SPOIL_DEF = (\{[^\n]+\});/.exec(api)[1], 'SPOIL_DEF differs');

// 2) save / read with a scratch file
const ctx = { DATA: path.join(ROOT, 'Scripts', 'data'), LOGS: tmp, ROOT, DIR: path.join(ROOT, 'Dashboard'), viewerPos: () => ({ x: 48056, y: 180280, z: -4976 }) };
let r = A.post(ctx, { party: '', set: { 22090: false, 22091: true }, by: 'test' });
ok(r.code === 200 && r.ok, 'save all-parties ticks: ' + JSON.stringify(r));
let j = JSON.parse(fs.readFileSync(process.env.SWARM_SPOILRULES_FILE, 'utf8'));
ok(j.monsters['22090'] === false && j.monsters['22091'] === true, 'ticks in the file');
r = A.post(ctx, { party: 'Spoiler5', set: { 22090: true } }); ok(r.code === 200, 'party tick saved');
j = JSON.parse(fs.readFileSync(process.env.SWARM_SPOILRULES_FILE, 'utf8'));
ok(A.spoilWanted(j, 'Spoiler5', 22090).on === true && A.spoilWanted(j, 'Spoiler2', 22090).on === false, 'party beats all, other party keeps all');
r = A.post(ctx, { party: 'Spoiler5', set: { 22090: null } }); j = JSON.parse(fs.readFileSync(process.env.SWARM_SPOILRULES_FILE, 'utf8'));
ok(!j.parties, 'reset removes the empty party entry');
r = A.post(ctx, { party: '', settings: { festival: false, mpReserve: 30, maxTries: 99 } }); j = JSON.parse(fs.readFileSync(process.env.SWARM_SPOILRULES_FILE, 'utf8'));
ok(j.festival === false && j.mpReserve === 30 && j.maxTries === undefined, 'settings: valid saved, out of range ignored');
r = A.post(ctx, { party: '', set: { 1: true }, rev: 'stale' }); ok(r.code === 409 && r.conflict, 'stale rev -> 409');
r = A.post(ctx, { party: 'bad name!', set: { 1: true } }); ok(r.code === 400, 'bad party name refused');
ok(fs.existsSync(path.join(tmp, 'history')), 'history copy written');
ok(/spoil\tall parties/.test(fs.readFileSync(path.join(tmp, 'dashboard_commands.log'), 'utf8')), 'logged');

// 3) info / search / area (datapack only, no MCP)
const I = A.info(ctx); ok(I.rules && I.settings && I.settings.festival === false, 'info returns rules + settings');
const S = A.search(ctx, 'Lith Commander'); ok(S.monsters.length >= 1 && S.monsters[0].corpse.length > 0 && S.monsters[0].corpse[0].icon !== undefined, 'search finds Lith Commander with spoil drops + icons');
ok(A.search(ctx, 'x').monsters.length === 0, 'search needs 2 letters');
(async () => {
  const ar = await A.area(ctx, 'Spoiler5');
  ok(ar.code === 200 && ar.monsters.length > 0, `area around Catacomb of the Branded lists monsters (${ar.monsters.length})`);
  ok(ar.monsters.some(m => /Lith/.test(m.name)), 'area has the Lith monsters');
  ok(ar.monsters.every(m => m.wanted && typeof m.wanted.on === 'boolean'), 'every monster has its tick');
  ok((await A.area(ctx, '../x')).code === 400, 'bad leader refused');
  ok(A.matchLive({ byName: { 'doom knight': [{ id: 1, level: 50 }, { id: 2, level: 65 }] } }, 'Doom Knight', 64).id === 2, 'live name + level -> nearest level');
  console.log(`${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  process.exit(fail ? 1 : 0);
})();
