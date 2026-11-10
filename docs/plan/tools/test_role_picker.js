// test_role_picker.js - requirement crafter.md R20 + pages.md #/crafter / #/runner (PICKALL-2026-11-10, public tester Vykaax: "Crafter1 is locked
// as the bank on the Crafter tab. No way to change this? Additionally, the Runner is changed from the Crafter tab and NOT the Runner tab ... when you
// press the 'Change runner' button, you are given a limited selection. I can't even select my Plainswalker 'vRunner' here.")
// Root causes guarded here: (1) no bank / crafter picker at all (only shown), and the public package shipped crafter.json with the owner's roles
// renamed (bank Crafter1, runner Dagger1 ON) that every update overwrote; (2) the runner list was teamMap keys cut to the first 40 buttons
// (an install with 130 characters never showed vRunner); (3) the Runner page had no runner choice.
// Sandbox only: never the live data files.   node docs/plan/tools/test_role_picker.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
let ok = 0, bad = 0; const t = (m, c, info) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 300) : '')); } };
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'rolepick-'));
const DATA = path.join(SB, 'data'), LOGS = path.join(SB, 'logs'); fs.mkdirSync(DATA); fs.mkdirSync(LOGS);
process.env.SWARM_CRAFTERPAGE_DIR = DATA; process.env.SWARM_CRAFTER_FILE = path.join(DATA, 'crafter_rules.json');
fs.writeFileSync(process.env.SWARM_CRAFTER_FILE, JSON.stringify({ v: 1, crafters: {} }));
// a tester install: 130 characters in 20 parties (config order puts vRunner last), the shipped placeholder roles Crafter1 / Dagger1 do not exist
const tm = {}; const states = [];
for (let i = 1; i <= 129; i++) { const n = 'Nuker' + i, p = 'Nuker' + (1 + Math.floor((i - 1) / 7) * 7); tm[n] = p; states.push({ name: n, cls: 'Spellhowler', level: 40, ageSec: 5 }); }
tm.vRunner = 'vRunner'; states.push({ name: 'vRunner', cls: 'Plainswalker', level: 52, ageSec: 5 });
tm.Smithy = 'Nuker1'; states.push({ name: 'Smithy', cls: 'Warsmith', level: 45, ageSec: 900 });
fs.writeFileSync(path.join(DATA, 'crafter.json'), JSON.stringify({ crafter: 'Crafter1', bank: 'Crafter1', runner: 'Dagger1', runnerOn: true, prices: {}, pays: {}, cwhWithdraw: true }));
const ctx = { DATA, LOGS, ROOT, DIR: path.join(ROOT, 'Dashboard'), readStates: () => states, teamMap: () => tm, post: async () => ({ ok: true }) };
const P = require(path.join(ROOT, 'Dashboard', 'crafterpage_api.js'));
const rd = () => JSON.parse(fs.readFileSync(path.join(DATA, 'crafter.json'), 'utf8'));
(async () => {
  // ---- pure
  const S = { bank: 'Smithy', crafter: 'Smithy', runner: 'vRunner' };
  t('roleBlock: the bank / crafter cannot be the runner (the bank never leaves Giran), anyone else can - any class', P.roleBlock('runner', 'Smithy', S) && !P.roleBlock('runner', 'Nuker7', S) && !P.roleBlock('runner', 'vRunner', S));
  t('roleBlock: the runner cannot be the bank / crafter, anyone else can', /runner/.test(P.roleBlock('bank', 'vRunner', S)) && /runner/.test(P.roleBlock('crafter', 'vRunner', S)) && !P.roleBlock('bank', 'Nuker3', S));
  t('roleClash: runner = bank / crafter refused, different names fine', /bank/.test(P.roleClash({ runner: 'A', bank: 'A', crafter: 'B' })) && /crafter/.test(P.roleClash({ runner: 'A', bank: 'B', crafter: 'A' })) && P.roleClash({ runner: 'A', bank: 'B', crafter: 'B' }) === '' && P.roleClash({ runner: '', bank: 'B', crafter: 'B' }) === '');
  const C = P.charChoices(tm, states, S);
  t('charChoices: EVERY character (131), no 40 cap, no class filter, sorted by name', C.length === 131 && C.some(c => c.name === 'vRunner' && c.cls === 'Plainswalker') && C.map(c => c.name).join() === C.map(c => c.name).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })).join(), C.length);
  t('charChoices: party, level, online + the greyed reason per role', (() => { const v = C.find(c => c.name === 'Smithy'), n = C.find(c => c.name === 'Nuker9'); return v.party === 'Nuker1' && v.online === false && /bank/.test(v.block.runner) && !v.block.bank && n.party === 'Nuker8' && n.level === 40 && n.online && !Object.keys(n.block).length; })());
  // ---- the page data
  const d = P.info(ctx);
  t('GET /api/crafterpage: chars = all 131 characters, vRunner selectable as runner', Array.isArray(d.chars) && d.chars.length === 131 && !d.chars.find(c => c.name === 'vRunner').block.runner, d.chars && d.chars.length);
  t('GET /api/crafterpage: the shipped placeholders are flagged as not a character of this install', d.roleKnown && d.roleKnown.bank === false && d.roleKnown.crafter === false && d.roleKnown.runner === false, d.roleKnown);
  t('GET /api/crafterpage: leaders = one entry per party (the sale goes to a party leader)', Array.isArray(d.leaders) && d.leaders.includes('vRunner') && d.leaders.includes('Nuker1') && !d.leaders.includes('Nuker2'), d.leaders && d.leaders.length);
  // ---- saves go to crafter.json (the file swarm.js crafterSet reads)
  let r = await P.post(ctx, { action: 'settings', runner: 'vRunner' });
  t('Change runner -> vRunner (a Plainswalker) saved in crafter.json, runnerOn kept', r.ok && rd().runner === 'vRunner' && rd().runnerOn === true, r);
  r = await P.post(ctx, { action: 'settings', bank: 'Smithy' });
  t('Change bank -> Smithy saved in crafter.json (was Crafter1)', r.ok && rd().bank === 'Smithy', r);
  r = await P.post(ctx, { action: 'settings', crafter: 'Smithy' });
  t('Change crafter -> Smithy saved in crafter.json', r.ok && rd().crafter === 'Smithy', r);
  r = await P.post(ctx, { action: 'settings', runner: 'Smithy' });
  t('the bank as runner is refused (400, file unchanged)', r.code === 400 && /bank/.test(r.error) && rd().runner === 'vRunner', r);
  r = await P.post(ctx, { action: 'settings', bank: 'vRunner' });
  t('the runner as bank is refused (400, file unchanged)', r.code === 400 && rd().bank === 'Smithy', r);
  const keep = rd(); fs.writeFileSync(path.join(DATA, 'crafter.json'), JSON.stringify(Object.assign({}, keep, { runner: 'Smithy' })));
  r = await P.post(ctx, { action: 'settings', rotateOn: false });
  t('an unrelated switch still saves even if an old file had a clash (only role changes are checked)', r.ok && rd().rotateOn === false, r);
  fs.writeFileSync(path.join(DATA, 'crafter.json'), JSON.stringify(keep));
  r = await P.post(ctx, { action: 'settings', runner: '' });
  t('"nobody" clears the runner', r.ok && rd().runner === '', r);
  // ---- no built-in owner name: nothing set = none, and crafting orders say so
  fs.writeFileSync(path.join(DATA, 'crafter.json'), '{}');
  const d0 = P.info(ctx);
  t('no crafter.json names = "none set" (no built-in Crafter1)', d0.crafter === '' && d0.bank === '', { c: d0.crafter, b: d0.bank });
  r = await P.post(ctx, { action: 'targets', targets: { 'soulshot:A': 1000 } });
  t('targets with no crafter set -> refused with "pick one first"', r.code === 400 && /no crafter set/.test(r.error), r);
  // ---- the pages
  const CP = fs.readFileSync(path.join(ROOT, 'Dashboard', 'crafterpage.js'), 'utf8'), RP = fs.readFileSync(path.join(ROOT, 'Dashboard', 'runnerpage.js'), 'utf8'), UD = fs.readFileSync(path.join(ROOT, 'Dashboard', 'uidialog.js'), 'utf8');
  t('Crafter page: Change bank + Change crafter + Change runner buttons, one shared picker exported', /data-cfrole="crafter"/.test(CP) && /data-cfrole="bank"/.test(CP) && /data-cfrunner="1"/.test(CP) && /window\.CrafterPage = \{[^}]*pickRole/.test(CP));
  t('the picker lists d.chars with a filter box and greyed reasons; no 40-button cap left in the page', /function pickRole\(/.test(CP) && /d\.chars/.test(CP) && /search: /.test(CP) && /disabled: !!why/.test(CP) && !/slice\(0, 40\)/.test(CP));
  t('Runner page: Change runner + Change bank through CrafterPage.pickRole', /data-rnprole="runner"/.test(RP) && /data-rnprole="bank"/.test(RP) && /window\.CrafterPage\.pickRole\(/.test(RP));
  t('uidialog: uiForm fields take search (a filter box over the options)', /data-uidsearch/.test(UD) && /f\.search/.test(UD));
  // ---- the bots read the same file
  const SW = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
  t('swarm.js crafterSet() reads Scripts/data/crafter.json bank / runner (the file the pickers write)', /function crafterSet\(\)[\s\S]{0,400}Scripts\\\\data\\\\crafter\.json[\s\S]{0,300}bank: nm\(j\.bank\)/.test(SW));
  // ---- the public package
  const RB = fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'tools', 'release_build.js'), 'utf8');
  t('release: crafter.json + crafter_rules.json ship as examples with nobody set, runner OFF; the owner ledger is not shipped',
    /DATA_SEEDS\.push\('crafter\.json', 'crafter_rules\.json'\)/.test(RB) && /case 'crafter\.json': \{ const out = \{ crafter: '', bank: '', prices: \{\}, runner: '', runnerOn: false/.test(RB) && /case 'crafter_rules\.json': \{ o\.crafters = \{\}/.test(RB) && /'crafter_ledger\.json'/.test(RB));
  try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { }
  console.log(`role picker: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + e.stack); process.exit(1); });
