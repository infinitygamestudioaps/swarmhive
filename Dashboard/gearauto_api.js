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
// OLDGEAR-2026-10-26 (tester Vykaax's old-gear filter; owner: 'Add the last 3 as optional i dont want them to affect the system'): what happens to a
// replaced NON-starter piece, per grade + enchanted + special (S.A.): 'keep' (default, = KEEPOLD today) | 'collector' (the Storage page's collector).
// NEVER 'sell' (owner: no automatic selling). = swarm.js OLDGEAR / ogNorm.
// GEARPASS-2026-10-27 (tester Vykaax, owner "Yes"): + 'distributor' = to the collector like 'collector', then the collector passes it to the
// distributor that holds its grade (only while distributors.pass is on). Still never 'sell'.
const OLDGEAR_KEYS = ['NONE', 'D', 'C', 'B', 'A', 'S', 'enchanted', 'special'], OLDGEAR_MODES = ['keep', 'collector', 'distributor'];
const oldGearOf = (F) => { const o = F && F.oldGear && typeof F.oldGear === 'object' && !Array.isArray(F.oldGear) ? F.oldGear : {}, out = {}; OLDGEAR_KEYS.forEach(k => { out[k] = o[k] === 'collector' || o[k] === 'distributor' ? o[k] : 'keep'; }); return out; };
function collectorOf(ctx) { try { const j = JSON.parse(fs.readFileSync(path.join(path.dirname(fileOf(ctx)), 'stash_rules.json'), 'utf8').replace(/^﻿/, '')) || {}, c = j.collector; return c && c.on === true ? String(c.name || '(the clan leader)') : ''; } catch (e) { return ''; } }
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
// GEARDIST-2026-10-25 (owner: the gear-up may use own bag / warehouse, clan warehouse and distributors before buying): Scripts/data/gear_sources.json
const srcFile = (ctx) => path.join(path.dirname(fileOf(ctx)), 'gear_sources.json');
function sources(ctx) { let j = {}; try { j = JSON.parse(fs.readFileSync(srcFile(ctx), 'utf8').replace(/^\uFEFF/, '')) || {}; } catch (e) { }
  const d = j.distributors || {}, has = Object.keys(j).length > 0;   // no file = OFF (a new install: the gear-up only buys)
  const P = passOf(j);
  return { ownWh: has && j.ownWh !== false, clan: has && j.clan !== false, bags: has && j.bags !== false, dist: has && d.on !== false, names: Array.isArray(d.names) ? d.names : [], unseal: has && j.unseal !== false,
    pass: P.pass, grades: P.grades, kinds: P.kinds, marked: P.marked, passStatus: passStatus(ctx) }; }
// GEARPASS-2026-10-27: distributors.pass (switch, default OFF) / grades { name: [grade] } / kinds { name: [kind] } / marked [item ids] (= swarm.js gpassCfg)
const PASS_GRADES = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'], PASS_KINDS = ['weapon', 'armor', 'jewel'];
const cleanList = (v, all, up) => (Array.isArray(v) ? v : []).map(x => up ? String(x).toUpperCase() : String(x).toLowerCase()).filter((x, i, a) => all.includes(x) && a.indexOf(x) === i);
function passOf(j) {
  const d = (j && j.distributors) || {}, names = Array.isArray(d.names) ? d.names.map(String) : [], grades = {}, kinds = {};
  names.forEach(n => { grades[n] = cleanList((d.grades || {})[n], PASS_GRADES, true); kinds[n] = cleanList((d.kinds || {})[n], PASS_KINDS, false); });
  return { pass: d.pass === true, grades, kinds, marked: (Array.isArray(d.marked) ? d.marked : []).map(Number).filter(n => n > 0 && n !== 57) };
}
const logsOf = (ctx) => ctx.LOGS || (ctx.ROOT ? path.join(ctx.ROOT, 'Logs') : '');
/** the collector's report Logs/gear_pass.json (swarm.js gpassStatus): waiting per distributor, pieces that stay + why, the last hand-overs */
function passStatus(ctx) { try { const L = logsOf(ctx); if (!L) return null; const j = JSON.parse(fs.readFileSync(path.join(L, 'gear_pass.json'), 'utf8')) || {};
  return { at: j.at || null, collector: j.collector || '', on: !!j.on, waiting: j.waiting || {}, stay: (j.stay || []).slice(0, 40), last: (j.last || []).slice(-20), why: j.why || '' }; } catch (e) { return null; } }
let G = null;
function guard(ctx) { if (G) return G; try { G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); } catch (e) {
  G = { withLock: (f, fn) => fn(), atomicWrite: (f, t) => { JSON.parse(t); fs.writeFileSync(f + '.tmp', t); fs.renameSync(f + '.tmp', f); } }; } return G; }
/** one locked + atomic read-modify-write of gear_sources.json: fn(j) -> error text | '' */
function srcWrite(ctx, fn, log) {
  const F = srcFile(ctx), Gd = guard(ctx); let err = '';
  fs.mkdirSync(path.dirname(F), { recursive: true });
  Gd.withLock(F, () => {
    let j = {}; try { j = JSON.parse(fs.readFileSync(F, 'utf8').replace(/^\uFEFF/, '')) || {}; } catch (e) { if (fs.existsSync(F)) { err = 'gear_sources.json does not parse — fix it first'; return; } }
    err = fn(j) || ''; if (err) return;
    j.at = new Date().toISOString(); j.by = 'dashboard';
    Gd.atomicWrite(F, JSON.stringify(j, null, 1) + '\n');
  }, { who: 'gearsources' });
  if (!err) { try { const L = logsOf(ctx); if (L) fs.appendFileSync(path.join(L, 'dashboard_commands.log'), `${new Date().toISOString()}\tgearsources\t${log}\r\n`); } catch (e) { } }
  return err;
}
/** the item pop-up's "give to the distributor for its grade": mark / unmark an item id (server.js /api/itemrule) */
function markDistribute(ctx, id, on) {
  id = Number(id); if (!(id > 0) || id === 57) return 'bad item id';
  return srcWrite(ctx, (j) => { const d = j.distributors = j.distributors || { on: true, names: [] }; const L = (Array.isArray(d.marked) ? d.marked : []).map(Number).filter(n => n > 0 && n !== id); if (on) L.push(id); d.marked = L.slice(-500); }, `marked ${id} ${on ? 'on' : 'off'}`);
}
function info(ctx) {
  const R = read(ctx), F = R.data;
  return { sources: sources(ctx), exists: R.exists, default: typeof F.default === 'boolean' ? F.default : DEF.auto, sameGradeSwap: typeof F.sameGradeSwap === 'boolean' ? F.sameGradeSwap : DEF.sameGradeSwap,
    keepArmorType: typeof F.keepArmorType === 'boolean' ? F.keepArmorType : DEF.keepArmorType, starterGear: starterOf(F), skipGrades: skipOf(F), oldGear: oldGearOf(F), oldGearKeys: OLDGEAR_KEYS, collector: collectorOf(ctx),
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
    if (b.oldGear !== undefined) {   // OLDGEAR-2026-10-26: { <grade | enchanted | special>: keep | collector } (missing key = keep); never sell
      if (!b.oldGear || typeof b.oldGear !== 'object' || Array.isArray(b.oldGear)) return { code: 400, error: 'oldGear must be a table like { "C": "collector" }' };
      const bad = Object.keys(b.oldGear).filter(k => !OLDGEAR_KEYS.includes(k)); if (bad.length) return { code: 400, error: 'oldGear: unknown key ' + bad[0] + ' (' + OLDGEAR_KEYS.join(', ') + ')' };
      const badV = Object.keys(b.oldGear).filter(k => !OLDGEAR_MODES.includes(String(b.oldGear[k]))); if (badV.length) return { code: 400, error: 'oldGear ' + badV[0] + ': keep | collector | distributor (never sell: the owner forbids automatic selling)' };
      const cur = oldGearOf(F); Object.keys(b.oldGear).forEach(k => { cur[k] = String(b.oldGear[k]); });
      if (OLDGEAR_KEYS.every(k => cur[k] === 'keep')) delete F.oldGear; else { F.oldGear = {}; OLDGEAR_KEYS.forEach(k => { if (cur[k] !== 'keep') F.oldGear[k] = cur[k]; }); }
      n++;
    }
    if (b.starterGear !== undefined) { if (!STARTER_MODES.includes(String(b.starterGear))) return { code: 400, error: 'starterGear: sell | destroy | keep' }; F.starterGear = String(b.starterGear); n++; }
    if (!n) return { code: 400, error: 'sameGradeSwap / keepArmorType must be true or false, starterGear sell | destroy | keep' };
  } else if (scope === 'sources') {
    // GEARPASS-2026-10-27: locked + atomic (srcWrite); + pass (switch), grades / kinds per distributor ({ name: [..] } merged per name, [] = none / all kinds)
    const all = new Set([].concat(...parties.map(p => p.names)));
    if (Array.isArray(b.names)) { const bad = b.names.filter(n => !all.has(String(n))); if (bad.length) return { code: 400, error: 'not our characters: ' + bad.join(', ') }; }
    for (const [key, list, up] of [['grades', PASS_GRADES, true], ['kinds', PASS_KINDS, false]]) {
      if (b[key] === undefined) continue;
      if (!b[key] || typeof b[key] !== 'object' || Array.isArray(b[key])) return { code: 400, error: key + ' must be a table like { "DistD": ["D"] }' };
      for (const n of Object.keys(b[key])) { if (!Array.isArray(b[key][n])) return { code: 400, error: `${key} ${n}: a list` };
        const bad = b[key][n].filter(x => !list.includes(up ? String(x).toUpperCase() : String(x).toLowerCase())); if (bad.length) return { code: 400, error: `${key} ${n}: unknown "${String(bad[0]).slice(0, 10)}" (${list.join(', ')})` }; }
    }
    if (b.pass !== undefined && typeof b.pass !== 'boolean') return { code: 400, error: 'pass must be true or false' };
    const err = srcWrite(ctx, (j) => {
      ['ownWh', 'clan', 'unseal', 'bags'].forEach(k => { if (typeof b[k] === 'boolean') j[k] = b[k]; });
      const d = j.distributors = j.distributors || { on: true, names: [] };
      if (typeof b.dist === 'boolean') d.on = b.dist;
      if (typeof b.pass === 'boolean') d.pass = b.pass;
      if (Array.isArray(b.names)) d.names = [...new Set(b.names.map(String))];
      const names = Array.isArray(d.names) ? d.names.map(String) : [];
      const notD = Object.keys(b.grades || {}).concat(Object.keys(b.kinds || {})).filter(n => !names.includes(n));
      if (notD.length) return notD[0] + ' is no distributor (add it first)';
      for (const [key, list, up] of [['grades', PASS_GRADES, true], ['kinds', PASS_KINDS, false]]) {
        const T = d[key] && typeof d[key] === 'object' && !Array.isArray(d[key]) ? d[key] : {};
        if (b[key]) Object.keys(b[key]).forEach(n => { T[n] = cleanList(b[key][n], list, up); if (!T[n].length) delete T[n]; });
        Object.keys(T).forEach(n => { if (!names.includes(n)) delete T[n]; });   // a removed distributor takes its grades along
        if (Object.keys(T).length) d[key] = T; else delete d[key];
      }
      return '';
    }, JSON.stringify({ dist: b.dist, pass: b.pass, names: b.names, grades: b.grades, kinds: b.kinds, ownWh: b.ownWh, clan: b.clan, unseal: b.unseal, bags: b.bags }).slice(0, 600));
    if (err) return { code: 400, error: err };
    return Object.assign({ code: 200, ok: true }, info(ctx));
  } else return { code: 400, error: 'scope: default | party | char | policy | sources' };
  write(ctx, F, `${scope} ${name} ${JSON.stringify({ auto: v, lock: b.lock, sameGradeSwap: b.sameGradeSwap, keepArmorType: b.keepArmorType, starterGear: b.starterGear, skipGrades: b.skipGrades, oldGear: b.oldGear })}`);
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
module.exports = { PASS_GRADES, PASS_KINDS, passOf, markDistribute, srcWrite, OLDGEAR_KEYS, OLDGEAR_MODES, oldGearOf, sources, GRADES, skipOf, handle, info, post, policy, DEF, fileOf, STARTER_MODES, starterOf };
