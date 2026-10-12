// test_engine_final.js — final combined check of the pending swarm.js patch scripts (engine audit 2026-10-12).
// Applies every scratchpad patch to a COPY of Scripts_dev/swarm.js in two orders (engine patches first / last; clanauto before / after
// cmdfix2_clanlevel), checks every patch either applies or refuses as "already applied", both orders give the same file, node --check passes,
// and the two former anchor conflicts are merged (resilience #17 + CMDFIX2 dungeon record; clanauto precheck + CMDFIX2 focus message).
// Usage: node docs/plan/tools/test_engine_final.js [--dir <dir with patch_*.js>] [--swarm <swarm.js>]   (exit 1 on a failure)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? path.resolve(process.argv[i + 1]) : d; };
const DIR = arg('--dir', '%TEMP%/scratch');
const SWARM = arg('--swarm', path.join(ROOT, 'Scripts_dev', 'swarm.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };

const ENGINE = ['patch_engine_data.js', 'patch_engine_ops.js', 'patch_engine_resilience.js', 'patch_engine_timing.js'];
const OTHER = ['patch_cmdfix.js', 'patch_cmdfix2_botparty.js', 'patch_cmdfix2_clanlevel.js', 'patch_cmdfix2_override.js', 'patch_cmdfix2_raid.js',
  'patch_cmdfix2_supply.js', 'patch_clanauto.js', 'patch_servercfg.js', 'patch_soulcrystal.js', 'patch_sellguard.js'];
const exists = (f) => fs.existsSync(path.join(DIR, f));
const ORDERS = {
  'engine first, listed order': ENGINE.concat(OTHER),
  'others first (clanauto before clanlevel), engine last reversed': ['patch_clanauto.js', 'patch_servercfg.js', 'patch_soulcrystal.js', 'patch_cmdfix.js',
    'patch_cmdfix2_botparty.js', 'patch_cmdfix2_clanlevel.js', 'patch_cmdfix2_override.js', 'patch_cmdfix2_raid.js', 'patch_cmdfix2_supply.js',
    'patch_sellguard.js'].concat(ENGINE.slice().reverse()),
};

// patch_soulcrystal.js reads <dir of swarm.js>/../Dashboard/soullogic.js: build that layout in a temp folder
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'engine_final_'));
fs.mkdirSync(path.join(TMP, 'Scripts_dev')); fs.mkdirSync(path.join(TMP, 'Dashboard'));
try { fs.copyFileSync(path.join(ROOT, 'Dashboard', 'soullogic.js'), path.join(TMP, 'Dashboard', 'soullogic.js')); } catch (e) { }
const results = {};
for (const [name, list] of Object.entries(ORDERS)) {
  console.log(name + ':');
  const T = path.join(TMP, 'Scripts_dev', 'swarm_' + Object.keys(results).length + '.js');
  fs.copyFileSync(SWARM, T);
  let allOk = true;
  for (const f of list.filter(exists)) {
    const r = cp.spawnSync(process.execPath, [path.join(DIR, f), T], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const refused = r.status !== 0 && /already (patched|applied)|refusing a second run/i.test(out);
    const good = r.status === 0 || refused;
    if (!good) allOk = false;
    ok(good, `${f}: ${r.status === 0 ? 'applied' : refused ? 'already in Scripts_dev (refused a 2nd run)' : 'FAILED: ' + out.split(/\r?\n/).filter(l => /Error|anchor|MISS/.test(l)).slice(0, 2).join(' / ')}`);
  }
  const chk = cp.spawnSync(process.execPath, ['--check', T], { encoding: 'utf8' });
  ok(chk.status === 0, `node --check on the result (${fs.statSync(T).size} bytes)${chk.status ? ': ' + chk.stderr.slice(0, 200) : ''}`);
  results[name] = { file: T, allOk };
}
const files = Object.values(results).map(r => fs.readFileSync(r.file, 'utf8'));
ok(files.length === 2 && files[0] === files[1], 'both orders give the same swarm.js');
const s = files[0];
const cnt = (a) => s.split(a).length - 1;
ok(cnt('SPOTRESUME-PURE-BEGIN') === 1 && cnt("setActivity({ type: 'autolevel', solo, dungeon: (autoLvl.forceSpot && autoLvl.forceSpot.dungeon) || undefined });") === 1,
  'resilience #17 + CMDFIX2 dungeon: the start record keeps dungeon, the saved spot is merged after it');
ok(cnt("setActivity(Object.assign({}, getActivity() || {}, { type: 'autolevel', solo, spot: resumeSaved.spot") === 1 && cnt("setActivity(Object.assign({}, a, { type: 'autolevel', solo: !!solo, spot:") === 1,
  'resilience #17: start record merge + spotResumeSave keep every other field');
ok(cnt('CLANAUTO-PURE-BEGIN') === 1 && cnt("return 'no focus skill") === 0 && cnt('const pre = clanSkillPrecheck(); clanAutoNote(\'skill\', pre.msg); if (!pre.ok) return pre.msg;') === 1,
  'clanauto + CMDFIX2 clanlevel: the focus line is the clanauto precheck in both orders');
for (const m of ['ENGINE DATA (2026-10-12', 'ENGINE-OPS-2026-10-12', 'RAIDRESUME-PURE-BEGIN', 'CMDFIX2-BOTPARTY-2026-10-12', 'CMDFIX2-RAID-2026-10-12', 'CMDFIX2-SUPPLY-2026-10-12', 'CFG-PURE begin'])
  ok(cnt(m) >= 1, 'marker present: ' + m);
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
