// AUTO GEAR UPGRADES switches (Mr.P feedback 2026-10-10: "spoiler had Saint Spear equipped, the script started buying C grade equipment
// (Full Plate, shield) ..."). Dashboard Gear page box "Auto gear upgrades". File: Scripts/data/gear_auto.json (env SWARM_GEARAUTO_FILE for
// the tests), read live by swarm.js GEARGUARD (ggPolicy). No file = auto upgrades OFF for everyone (new installs / imported accounts).
//   GET  /api/gearauto     { exists, default, sameGradeSwap, keepArmorType, parties: [{ leader, auto, members: [{ name, auto, lock, eff, from }] }] }
//   POST /api/gearauto     { action: 'set', scope: 'default' | 'party' | 'char' | 'policy', name, auto: true|false|null, lock, sameGradeSwap, keepArmorType, starterGear, confirm }
//                          starterGear (TESTERS-2026-10-12): sell (default) | destroy | keep = what happens to a replaced starter piece (swarm.js STARTERGEAR)
//                          turning auto upgrades ON needs confirm: true (the page asks first). Atomic write (tmp + rename), history copy (last 30),
//                          one line in Logs/dashboard_commands.log.
'use strict';
const fs = require('fs'), path = require('path');
const fileOf = (ctx) => process.env.SWARM_GEARAUTO_FILE || path.join(ctx.DATA, 'gear_auto.json');
const DEF = { auto: false, sameGradeSwap: false, keepArmorType: true };   // = swarm.js GEARGUARD.defaults (test_gear_guard.js compares)
const STARTER_MODES = ['sell', 'destroy', 'keep'];                         // = swarm.js STARTERGEAR.modes (sgMode: anything else = 'sell')
const starterOf = (F) => STARTER_MODES.includes(String((F && F.starterGear) || '').toLowerCase()) ? String(F.starterGear).toLowerCase() : 'sell';
const GRADES = ['D', 'C', 'B', 'A', 'S', 'S80', 'S84'];   // SKIPGRADE-2026-10-14: grades nobody buys (swarm.js ggSkipGrades)
const skipOf = (F) => (Array.isArray(F && F.skipGrades) ? F.skipGrades : []).map(g => String(g).toUpperCase()).filter(g => GRADES.includes(g));
function read(ctx) { try { const t = fs.readFileSync(fileOf(ctx), 'utf8'); return { exists: true, data: JSON.parse(t.replace(/^﻿/, '')) || {} }; } catch (e) { return { exists: false, data: {} }; } }
/** the same resolution as swarm.js ggPolicy (character > party > file default > off) */
function policy(F, name, party) {
  const ch = ((F && F.chars) || {})[name] || {}, pa = ((F && F.parties) || {})[party] || {};
  let auto = DEF.auto, from = 'default (off: no gear_auto.json)';
  if (F && typeof F.default === 'boolean') { auto = F.default; from = 'gear_auto.json default'; }
  if (typeof pa.auto === 'boolean') { auto = pa.auto; from = 'party ' + party; }
  if (typeof ch.auto === 'boolean') { auto = ch.auto; from = 'character'; }
  return { auto, lock: ch.lock === true, from };
}
function cfgParties(ctx) {
  let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(ctx.ROOT, 'swarm.config.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { }
  const out = {}, order = [];
  (cfg.accounts || []).forEach(a => { if (!a || !a.character || a.enabled === false) return; const p = String(a.party || a.character); if (!out[p]) { out[p] = []; order.push(p); } out[p].push(String(a.character)); });
  Object.keys(out).forEach(p => { if (out[p].includes(p)) out[p] = [p].concat(out[p].filter(n => n !== p)); });
  return order.map(l => ({ leader: l, names: out[l] }));
}
function info(ctx) {
  const R = read(ctx), F = R.data;
  return { exists: R.exists, default: typeof F.default === 'boolean' ? F.default : DEF.auto, sameGradeSwap: typeof F.sameGradeSwap === 'boolean' ? F.sameGradeSwap : DEF.sameGradeSwap,
    keepArmorType: typeof F.keepArmorType === 'boolean' ? F.keepArmorType : DEF.keepArmorType, starterGear: starterOf(F), skipGrades: skipOf(F),
    parties: cfgParties(ctx).map(p => ({ leader: p.leader, auto: typeof ((F.parties || {})[p.leader] || {}).auto === 'boolean' ? F.parties[p.leader].auto : null,
      members: p.names.map(n => { const c = (F.chars || {})[n] || {}, e = policy(F, n, p.leader); return { name: n, auto: typeof c.auto === 'boolean' ? c.auto : null, lock: c.lock === true, eff: e.auto, from: e.from }; }) })) };
}
function write(ctx, F, log) {
  const f = fileOf(ctx), H = path.join(path.dirname(f), 'gear_auto_history');
  try { if (fs.existsSync(f)) { fs.mkdirSync(H, { recursive: true }); fs.copyFileSync(f, path.join(H, 'gear_auto_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
    const L = fs.readdirSync(H).filter(n => /^gear_auto_.*\.json$/.test(n)).sort(); L.slice(0, Math.max(0, L.length - 30)).forEach(n => { try { fs.unlinkSync(path.join(H, n)); } catch (e) { } }); } } catch (e) { }
  if (!F._about) F._about = 'AUTO GEAR UPGRADES + equipment lock (dashboard Gear page; swarm.js GEARGUARD reads it live). No file = auto upgrades OFF.';
  F.version = 1; F._updated = new Date().toISOString();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(F, null, 1) + '\n'); fs.renameSync(f + '.tmp', f);
  try { if (ctx.LOGS) fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()}\tgearauto\t${log}\r\n`); } catch (e) { }
}
function post(ctx, b) {
  const R = read(ctx), F = R.data; F.parties = F.parties || {}; F.chars = F.chars || {};
  const v = b.auto === true || b.auto === false ? b.auto : b.auto === null ? null : undefined;
  const scope = String(b.scope || ''), name = String(b.name || '');
  if (v === true && b.confirm !== true) return { code: 400, error: 'turning auto gear upgrades ON needs confirm: true (the page asks first)' };
  const parties = cfgParties(ctx);
  if (scope === 'default') { if (typeof v !== 'boolean') return { code: 400, error: 'auto must be true or false' }; F.default = v; }
  else if (scope === 'party') {
    if (!parties.some(p => p.leader === name)) return { code: 400, error: `no party "${name}" in swarm.config.json` };
    if (v === undefined) return { code: 400, error: 'auto must be true, false or null' };
    if (v === null) delete F.parties[name]; else F.parties[name] = { auto: v };
  } else if (scope === 'char') {
    if (!parties.some(p => p.names.includes(name))) return { code: 400, error: `${name} is not in swarm.config.json` };
    const c = F.chars[name] = F.chars[name] || {};
    if (v !== undefined) { if (v === null) delete c.auto; else c.auto = v; }
    if (typeof b.lock === 'boolean') { if (b.lock) c.lock = true; else delete c.lock; }
    if (!Object.keys(c).length) delete F.chars[name];
  } else if (scope === 'policy') {
    let n = 0; ['sameGradeSwap', 'keepArmorType'].forEach(k => { if (typeof b[k] === 'boolean') { F[k] = b[k]; n++; } });
    if (b.skipGrades !== undefined) { if (!Array.isArray(b.skipGrades)) return { code: 400, error: 'skipGrades must be a list like ["B"]' }; F.skipGrades = skipOf({ skipGrades: b.skipGrades }); n++; }
    if (b.starterGear !== undefined) { if (!STARTER_MODES.includes(String(b.starterGear))) return { code: 400, error: 'starterGear: sell | destroy | keep' }; F.starterGear = String(b.starterGear); n++; }
    if (!n) return { code: 400, error: 'sameGradeSwap / keepArmorType must be true or false, starterGear sell | destroy | keep' };
  } else return { code: 400, error: 'scope: default | party | char | policy' };
  write(ctx, F, `${scope} ${name} ${JSON.stringify({ auto: v, lock: b.lock, sameGradeSwap: b.sameGradeSwap, keepArmorType: b.keepArmorType, starterGear: b.starterGear, skipGrades: b.skipGrades })}`);
  return Object.assign({ code: 200, ok: true }, info(ctx));
}
async function handle(req, res, url, ctx) {
  if (url.pathname !== '/api/gearauto') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  let b = {}; try { b = await ctx.body(req); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b || {}); const c = r.code || 200; delete r.code; ctx.json(res, c, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { GRADES, skipOf, handle, info, post, policy, DEF, fileOf, STARTER_MODES, starterOf };
