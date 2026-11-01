// test_gearapproval.js - Dashboard/gearapproval_api.js (APPROVE-2026-10-30, gear.md R7): the owner approves A grade and up per character.
// Sandbox: a temp DATA / LOGS folder (copy of gear_items.json, a fake plan), the real Dashboard/data/gear_catalog.json. No game, no server.
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..'), A = require(path.join(ROOT, 'Dashboard', 'gearapproval_api.js'));
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'gapr_')), DATA = path.join(T, 'data'), LOGS = path.join(T, 'Logs');
fs.mkdirSync(DATA); fs.mkdirSync(LOGS);
fs.copyFileSync(path.join(ROOT, 'Scripts', 'data', 'gear_items.json'), path.join(DATA, 'gear_items.json'));
const ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA, LOGS };
// Saint1 wears the Dark Crystal Helmet (512); the plan waits for the DC robe pieces + a Majestic Necklace
fs.writeFileSync(path.join(LOGS, 'bag_Saint1.json'), JSON.stringify({ items: [{ id: 512, name: 'Dark Crystal Helmet', eq: true }, { id: 2400, name: 'Tallum Tunic', eq: true }] }));
fs.writeFileSync(path.join(LOGS, 'gear_plan_Saint1.json'), JSON.stringify({ at: '2026-10-30T19:00:00Z', skipped: [
  'Dark Crystal Robe: A grade - waits for your OK (gear.md R7)', 'Dark Crystal Gloves - Robe: A grade - waits for your OK (gear.md R7)',
  'Dark Crystal Boots - Robe: A grade - waits for your OK (gear.md R7)', 'Majestic Necklace: A grade - waits for your OK (gear.md R7)', 'saving up for the jewelry: x'] }));
try {
  let r = A.info(ctx, 'Saint1');
  check(r.waiting.map(x => x.id).sort().join() === [2407, 5767, 5779, A.idByName(ctx, 'Majestic Necklace')].sort().join(), 'waiting = the plan\'s "waits for your OK" lines as item ids');
  const S = r.sets.find(s => s.name === 'Dark Crystal Robe');
  check(S && !S.fullWithApproved && S.slots.find(z => z.slot === 'head').worn === 512 && S.wholeIds.sort().join() === '2407,5767,5779', 'the Dark Crystal Robe set: helmet worn, robe + gloves + boots = "approve the whole set"');
  check(!r.sets.some(s => s.name === 'Dark Crystal Breastplate'), 'a set is decided by its chest (the helmet alone does not list the Breastplate set)');
  r = A.post(ctx, { name: 'Saint1', approve: [5767], by: 'test' });
  check(r.ok && r.approved.map(x => x.id).join() === '5767' && !r.sets.find(s => s.name === 'Dark Crystal Robe').fullWithApproved, 'one piece approved: the set is still NOT full');
  r = A.post(ctx, { name: 'Saint1', approve: [2407, 5779], by: 'test' });
  check(r.sets.find(s => s.name === 'Dark Crystal Robe').fullWithApproved && !r.waiting.some(x => x.id === 2407), 'the whole set approved: full with what is approved, no longer waiting');
  const F = JSON.parse(fs.readFileSync(path.join(DATA, 'gear_approved.json'), 'utf8'));
  check(F.chars.Saint1.sort().join() === '2407,5767,5779' && F.log.length === 2 && F.log[1].act === 'approve', 'gear_approved.json chars.<Name> + log[] (what swarm.js FULLSET reads)');
  check(fs.readdirSync(path.join(DATA, 'history')).some(x => /^gear_approved_\d+\.json$/.test(x)), 'a history copy before every change');
  check(/gear approval: approve Saint1: Dark Crystal Robe/.test(fs.readFileSync(path.join(LOGS, 'dashboard_commands.log'), 'utf8')), 'Logs/dashboard_commands.log line');
  r = A.post(ctx, { name: 'Saint1', revoke: [5767] });
  check(r.ok && !r.approved.some(x => x.id === 5767) && r.waiting.some(x => x.id === 5767), 'revoke: the piece waits again');
  check(A.post(ctx, { name: 'x y', approve: [1] }).code === 400 && A.post(ctx, { name: 'Saint1', approve: [99999999] }).code === 400 && A.post(ctx, { name: 'Saint1' }).code === 400, 'bad name / unknown ids / no action refused');
  const SRV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), CP = fs.readFileSync(path.join(ROOT, 'Dashboard', 'charpage.js'), 'utf8');
  check(SRV.includes("require('./gearapproval_api').handle"), 'server.js routes /api/gearapproval');
  check(CP.includes('id="cp_appr"') && CP.includes("'/api/gearapproval?name='") && CP.includes('data-aprset') && /only goes on together with the rest/.test(CP), 'character page: the box, per piece / whole set approve, the full-set note');
} finally { try { fs.rmSync(T, { recursive: true, force: true }); } catch (e) { } }
console.log(`gear approval: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
