// OUR CRAFTER API (CRAFTER-2026-10-15, Discord player Vykaax: "crafter supplier"). Loaded by server.js (one hook, like resrules_api.js).
// Also serves /crafterpanel.js + /crafterpanel.css (public, no secrets: the Storage page box "Our crafter" + the party settings line).
//   GET  /api/crafter   { file, exists, rev, broken, data, recipes, towns, grades, crafters: [{ name, cfg, status }], candidates: [{ name, cls, level,
//                         createLvl, party }], parties: [{ leader, members, crafter }] }
//   POST /api/crafter   { name, values: { on, town, parties: [names | '*'], stock: { 'soulshot:D': n | null }, daily: { D..S, soulOre, spiritOre: n | null },
//                         learn, maxBatches: 1..200 | null } | remove: true, rev?, by? } — only that crafter's entry; rev = the sha the caller read
//                         (409 when it changed); lock + history copy (Scripts/data/history/crafter_rules_<time>.json) + atomic write + one line in
//                         Logs/dashboard_commands.log.
// File: Scripts/data/crafter_rules.json (env SWARM_CRAFTER_FILE overrides it: the tests use a scratch copy). Missing = nobody crafts (OFF).
// swarm.js CRAFT-PURE (craftCfgOf / craftCrafterFor) reads it live every 10 s — the same rules as below (docs/plan/tools/test_crafter.js checks both).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const ABOUT = 'Our crafter (dashboard Storage page -> Our crafter). crafters.<Name> = { on (default false = nothing happens), town (Giran: it crafts only while it stands there and never travels for it), parties: [party leader names] or ["*"] = every party (they take shots from it first in their supply runs: crafter > shop NPC > player shops), stock: { "soulshot:D": target count, ... } (missing / 0 = not made), daily: { D, C, B, A, S crystals, soulOre, spiritOre } per day (0 / missing = no limit), learn (use a recipe scroll from the bag for a missing shot recipe; default false), maxBatches (crafts per round, default 20) }. It never crystallizes anything by itself: it uses the crystals and ore it has and says what is missing (crystallizing = only the items the owner ticks on the Storage page, swarm.js "!crystallize"). Read live by swarm.js every 10 s.';
// ---- the same tables + rules as swarm.js CRAFT-PURE
const CRAFT_GRADES = ['D', 'C', 'B', 'A', 'S'];
const CRAFT_KINDS = { soulshot: 'Soulshot', spiritshot: 'Spiritshot', blessed: 'Blessed Spiritshot' };
const CRAFT_MATS = { 1785: 'Soul Ore', 3031: 'Spirit Ore', 1458: 'D crystals', 1459: 'C crystals', 1460: 'B crystals', 1461: 'A crystals', 1462: 'S crystals' };
const CRAFT_RECIPES = [
  { key: 'soulshot:D', list: 20, scroll: 1804, lvl: 2, product: 1463, count: 468, mp: 72, ing: [[1785, 9], [1458, 3]] },
  { key: 'soulshot:C', list: 21, scroll: 1805, lvl: 4, product: 1464, count: 952, mp: 84, ing: [[1785, 30], [1459, 2]] },
  { key: 'soulshot:B', list: 22, scroll: 1806, lvl: 6, product: 1465, count: 450, mp: 100, ing: [[1785, 54], [1460, 1]] },
  { key: 'soulshot:A', list: 23, scroll: 1807, lvl: 7, product: 1466, count: 300, mp: 120, ing: [[1785, 36], [1461, 1]] },
  { key: 'soulshot:S', list: 24, scroll: 1808, lvl: 8, product: 1467, count: 350, mp: 150, ing: [[1785, 40], [1462, 1]] },
  { key: 'spiritshot:D', list: 317, scroll: 3032, lvl: 2, product: 2510, count: 100, mp: 60, ing: [[3031, 3], [1458, 1]] },
  { key: 'spiritshot:C', list: 318, scroll: 3033, lvl: 4, product: 2511, count: 200, mp: 120, ing: [[3031, 10], [1459, 1]] },
  { key: 'spiritshot:B', list: 319, scroll: 3034, lvl: 6, product: 2512, count: 150, mp: 180, ing: [[3031, 15], [1460, 1]] },
  { key: 'spiritshot:A', list: 320, scroll: 3035, lvl: 7, product: 2513, count: 200, mp: 240, ing: [[3031, 22], [1461, 1]] },
  { key: 'spiritshot:S', list: 321, scroll: 3036, lvl: 8, product: 2514, count: 200, mp: 300, ing: [[3031, 15], [1462, 1]] },
  { key: 'blessed:D', list: 323, scroll: 3953, lvl: 2, product: 3948, count: 100, mp: 60, ing: [[3031, 8], [1458, 2]] },
  { key: 'blessed:C', list: 324, scroll: 3954, lvl: 4, product: 3949, count: 200, mp: 120, ing: [[3031, 30], [1459, 2]] },
  { key: 'blessed:B', list: 325, scroll: 3955, lvl: 6, product: 3950, count: 100, mp: 180, ing: [[3031, 16], [1460, 2]] },
  { key: 'blessed:A', list: 326, scroll: 3956, lvl: 7, product: 3951, count: 200, mp: 240, ing: [[3031, 70], [1461, 2]] },
  { key: 'blessed:S', list: 327, scroll: 3957, lvl: 8, product: 3952, count: 200, mp: 300, ing: [[3031, 50], [1462, 2]] },
];
const CRAFT_DEF = { town: 'Giran', maxBatches: 20 };
const CRAFT_TOWNS = ['Gludin', 'Gludio', 'Dion', 'Giran', 'Oren', 'Aden', 'Hunters', 'Heine', 'Goddard', 'Rune', 'Schuttgart'];
function craftName(key) { const [k, g] = String(key).split(':'); return CRAFT_KINDS[k] ? `${CRAFT_KINDS[k]} (${g})` : String(key); }
function craftCfgOf(j, name) {
  const o = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const c = o(o(o(j).crafters)[name]);
  const n = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 ? 0 : Math.round(Number(v)));
  const stock = {}; CRAFT_RECIPES.forEach(r => { const v = n(o(c.stock)[r.key]); if (v > 0) stock[r.key] = Math.min(v, 10000000); });
  const daily = {}; CRAFT_GRADES.forEach(g => { daily[g] = n(o(c.daily)[g]); }); daily.soulOre = n(o(c.daily).soulOre); daily.spiritOre = n(o(c.daily).spiritOre);
  const parties = Array.isArray(c.parties) ? [...new Set(c.parties.map(x => String(x || '').trim()).filter(x => x === '*' || /^[A-Za-z0-9_\-]{1,40}$/.test(x)))] : [];
  const mb = n(c.maxBatches);
  return { name: String(name || ''), on: c.on === true, town: CRAFT_TOWNS.includes(c.town) ? c.town : CRAFT_DEF.town, parties, stock, daily,
    learn: c.learn === true, maxBatches: mb >= 1 && mb <= 200 ? mb : CRAFT_DEF.maxBatches, exists: Object.keys(c).length > 0 };
}
function craftCrafterFor(j, leader) {
  const C = (j && j.crafters && typeof j.crafters === 'object') ? j.crafters : {};
  const names = Object.keys(C).sort();
  for (const n of names) { const c = craftCfgOf(j, n); if (c.on && n !== leader && (c.parties.includes(leader) || c.parties.includes('*'))) return n; }
  return '';
}

let G = null;
function guard(ctx) { if (!G) G = require(path.join(ctx.ROOT || path.join(__dirname, '..'), 'docs', 'plan', 'tools', 'manual_guard.js')); return G; }
const fileOf = (ctx) => process.env.SWARM_CRAFTER_FILE || (ctx && ctx.crafterFile) || path.join(ctx.DATA, 'crafter_rules.json');
const sha = (t) => t ? crypto.createHash('sha1').update(t).digest('hex').slice(0, 16) : '';
const isoNow = () => new Date().toISOString();
const obj = (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
function norm(j) { const o = obj(j); return { v: 1, crafters: obj(o.crafters) }; }
function readFile(ctx) {
  const F = fileOf(ctx); let raw = '';
  try { raw = fs.readFileSync(F, 'utf8'); } catch (e) { return { exists: false, raw: '', rev: '', data: norm({}) }; }
  try { return { exists: true, raw, rev: sha(raw), data: norm(raw.trim() ? JSON.parse(raw.replace(/^﻿/, '')) : {}) }; }
  catch (e) { return { exists: true, raw, rev: sha(raw), data: null, broken: e.message }; }
}
function parties(ctx) {
  try { let K; try { K = require('./kamapage_api'); } catch (e) { K = require(path.join(ctx.ROOT, 'Dashboard', 'kamapage_api')); } return K.partyList(ctx).map(p => ({ leader: p.leader, names: p.names })); }
  catch (e) { return []; }
}
const CRAFT_CLASS = /Artisan|Warsmith|Maestro|Dwarven Fighter/i;
function statusOf(ctx, name) {
  try { const j = JSON.parse(fs.readFileSync(path.join(ctx.LOGS, `crafter_${name}.json`), 'utf8').replace(/^﻿/, '')); const at = Number(j.atMs) || Date.parse(j.at) || 0; return Object.assign(j, { ageSec: at ? Math.round((Date.now() - at) / 1000) : null }); }
  catch (e) { return null; }
}
function info(ctx) {
  const R = readFile(ctx), D = R.data || norm({});
  let states = []; try { states = (ctx.readStates && ctx.readStates()) || []; } catch (e) { }
  const cand = states.filter(s => s && s.name && (s.roleKind === 'crafter' || s.role === 'crafter' || CRAFT_CLASS.test(String(s.cls || ''))))
    .map(s => ({ name: s.name, cls: s.cls || '', level: s.level || 0, party: s.party || '', online: (s.ageSec || 0) < 300 }));
  const names = [...new Set(Object.keys(D.crafters).concat(cand.map(c => c.name)))].filter(n => NAME_RE.test(n)).sort();
  const crafters = names.map(n => ({ name: n, cfg: craftCfgOf(D, n), status: statusOf(ctx, n), cand: cand.find(c => c.name === n) || null, bag: bagReportOf(ctx, n), handins: handins(ctx, n, 6) }));   // CRAFTITEMS-2026-10-15: bag + hand-ins
  const P = parties(ctx).map(({ leader, names }) => ({ leader, members: names, crafter: craftCrafterFor(D, leader) }));
  const PP = people(ctx);
  return { file: path.basename(fileOf(ctx)), exists: R.exists, rev: R.rev, broken: R.broken || null, data: D, about: ABOUT,
    recipes: CRAFT_RECIPES.map(r => Object.assign({ name: craftName(r.key) }, r)), mats: CRAFT_MATS, towns: CRAFT_TOWNS, grades: CRAFT_GRADES, kinds: CRAFT_KINDS,
    defaults: CRAFT_DEF, crafters, candidates: cand, parties: P,
    people: PP.list.map(m => ({ name: m.name, party: m.party, town: m.town || '', online: !!m.online, level: m.level, cls: m.cls || '' })), clanLeader: PP.clanLeader, cwh: cwhFor(ctx) };
}
function applyChange(data, b) {
  const errors = [], J = JSON.parse(JSON.stringify(norm(data)));
  const name = String((b && b.name) || '').trim();
  if (!NAME_RE.test(name)) return { ok: false, errors: ['name: not a character name'] };
  if (b.remove === true) { delete J.crafters[name]; return { ok: true, data: J }; }
  const vals = obj(b.values), C = JSON.parse(JSON.stringify(obj(J.crafters[name])));
  const num = (v, lo, hi, what) => { const x = Number(v); if (v === '' || !Number.isFinite(x) || x < lo || x > hi) { errors.push(`${what}: ${lo} to ${hi} or empty`); return null; } return Math.round(x); };
  Object.keys(vals).forEach(k => {
    const v = vals[k];
    if (k === 'on' || k === 'learn') { if (v === null) delete C[k]; else if (typeof v !== 'boolean') errors.push(`${k}: true or false`); else C[k] = v; return; }
    if (k === 'town') { if (v === null) delete C.town; else if (!CRAFT_TOWNS.includes(v)) errors.push(`town: one of ${CRAFT_TOWNS.join(', ')}`); else C.town = v; return; }
    if (k === 'parties') {
      if (v === null) { delete C.parties; return; }
      if (!Array.isArray(v)) { errors.push('parties: a list of party leader names (or "*" = every party)'); return; }
      const bad = v.filter(x => x !== '*' && !NAME_RE.test(String(x || '')));
      if (bad.length) { errors.push(`parties: not names: ${bad.slice(0, 3).join(', ')}`); return; }
      if (v.length > 60) { errors.push('parties: at most 60'); return; }
      C.parties = [...new Set(v.map(String))]; return;
    }
    if (k === 'stock' || k === 'daily') {
      const allowed = k === 'stock' ? CRAFT_RECIPES.map(r => r.key) : CRAFT_GRADES.concat(['soulOre', 'spiritOre']);
      const cur = obj(C[k]);
      Object.keys(obj(v)).forEach(x => {
        if (!allowed.includes(x)) { errors.push(`${k}: unknown "${String(x).slice(0, 20)}"`); return; }
        const y = v[x];
        if (y === null || y === 0 || y === '0') { delete cur[x]; return; }
        const z = num(y, 0, 10000000, `${k}.${x}`); if (z !== null) { if (z > 0) cur[x] = z; else delete cur[x]; }
      });
      if (Object.keys(cur).length) C[k] = cur; else delete C[k];
      return;
    }
    if (k === 'maxBatches') { if (v === null) delete C.maxBatches; else { const z = num(v, 1, 200, 'maxBatches'); if (z !== null) C.maxBatches = z; } return; }
    errors.push(`unknown setting "${String(k).slice(0, 30)}"`);
  });
  if (errors.length) return { ok: false, errors };
  J.crafters[name] = C;
  if (Object.keys(J.crafters).length > 60) return { ok: false, errors: ['crafters: at most 60'] };
  return { ok: true, data: J };
}
// ======================================================================= CRAFTER ITEMS (CRAFTITEMS-2026-10-15, owner: "he should also have the
// option to disenchant items into crystals ... hand him items he can then disenchant ... send recipes and materials to him"). Nothing automatic.
//   GET  /api/crafter            also: crafters[].bag (Logs/crafter_bag_<name>.json: crystallizable pieces + recipes in its bag), crafters[].handins
//                                (its last crafter hand-in orders + every giver's state), clanLeader, people (name, party, town, online), cwh
//                                (clan warehouse recipes / materials / gear)
//   GET  /api/crafter/bag?name=  a giver's bag (Trade page bags: MCP live, else Logs/bag_<name>.json) with kind recipe | material | gear | other
//   POST /api/crafter/crystallize { name, objIds, enchanted, special, confirm: true, dryRun? } -> checked against the crafter's bag report
//                                (cryBlock = swarm.js CRYST-PURE), then "!crystallize <name> <ids> [enchanted] [special]" (destructive: confirmDanger)
//   POST /api/crafter/handin     { crafter, from: <giver> | '@town', pick: { <giver>: [objId] } | kind: 'recipes' | 'materials', goNow, dryRun?,
//                                confirm: true } -> one hand-over order Logs/handover/crin<id>.json (kind crafter-in, sameTown = !goNow) +
//                                "!handover <id>" to the givers + the crafter
//   POST /api/crafter/handin/go  { id } -> goNow on that order + "!handover <id>" again (a parked giver goes now)
//   POST /api/crafter/cwh        { crafter, items: [{ id, count }], confirm: true } -> "!whtake id:n,... clan <crafter>" to the clan leader (he takes
//                                them out of the clan warehouse; when the crafter is the clan leader he keeps them, else he trades them over)
const CRY_GRADE = { D: { rank: 1, id: 1458 }, C: { rank: 2, id: 1459 }, B: { rank: 3, id: 1460 }, A: { rank: 4, id: 1461 }, S: { rank: 5, id: 1462 } };
const CRYSTAL_IDS = new Set([1458, 1459, 1460, 1461, 1462]);
/** = swarm.js CRYST-PURE cryBlock (test_crafter_items.js checks both): '' = may go with the ticks t = { enchanted, special }, else why not */
function cryBlock(j, t) {
  t = t || {};
  if (!j) return 'unknown piece';
  if (j.hard) return j.hard;
  if (j.enchant > 0 && t.enchanted !== true) return `enchanted +${j.enchant} — tick "include enchanted items"`;
  if (j.special.length && t.special !== true) return `${j.special.join(', ')} — tick "include special items"`;
  return '';
}
const SHOT_IDS = new Set([1835, 1463, 1464, 1465, 1466, 1467, 2509, 2510, 2511, 2512, 2513, 2514, 3947, 3948, 3949, 3950, 3951, 3952, 5789, 5790]);
const ORE_IDS = new Set([1785, 3031]);
let CIX = null, CIXst = '';
function craftItems(ctx) {
  const f1 = path.join(ctx.DATA, 'crafter_items.json'), f2 = path.join(ctx.DATA, 'stash_items.json');
  let st = ''; try { st = fs.statSync(f1).mtimeMs + ':' + fs.statSync(f2).mtimeMs; } catch (e) { }
  if (!CIX || st !== CIXst) {
    const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return {}; } };
    const a = rd(f1), b = rd(f2);
    CIX = { crystal: a.crystal || {}, recipes: a.recipes || {}, srecipes: b.recipes || {}, materials: b.materials || {} }; CIXst = st;
  }
  return CIX;
}
/** what a bag row is for the crafter: 'recipe' | 'material' | 'gear' (crystallizable) | 'other'. row = { id, name, cat } (cat = Trade page category).
 *  Materials = crystals, Soul / Spirit Ore and every H5 recipe ingredient (stash_items.json materials) or Trade-page material / raid material —
 *  never shots or other consumables. */
function crinKind(row, X) {
  const id = Number(row && row.id) || 0, nm = String((row && row.name) || ''), cat = String((row && row.cat) || '');
  if (X.recipes[id] || X.srecipes[id] || /^Recipe\b/i.test(nm)) return 'recipe';
  if (SHOT_IDS.has(id)) return 'other';
  if (ORE_IDS.has(id) || CRYSTAL_IDS.has(id)) return 'material';
  if ((X.materials[id] || cat === 'material' || cat === 'raid') && cat !== 'consumable') return 'material';
  if (X.crystal[id]) return 'gear';
  return 'other';
}
const CRIN_KIND_OF = { recipes: 'recipe', materials: 'material' };
let TPA = null; const tpa = () => TPA || (TPA = require('./tradepage_api'));
let TLX = null; const tl = () => TLX || (TLX = require('./tradelogic'));
const HDIR = (ctx) => process.env.SWARM_HANDOVER_DIR || path.join(ctx.LOGS, 'handover');
function bagReportOf(ctx, name) {
  try { const j = JSON.parse(fs.readFileSync(path.join(process.env.SWARM_CRAFTER_BAG_DIR || ctx.LOGS, `crafter_bag_${name}.json`), 'utf8').replace(/^﻿/, '')); const at = Number(j.atMs) || Date.parse(j.at) || 0; return Object.assign(j, { ageSec: at ? Math.round((Date.now() - at) / 1000) : null }); }
  catch (e) { return null; }
}
/** the characters we know + their town (the Trade page's party list) */
function people(ctx) { try { const I = tpa().info(ctx); const out = []; I.parties.forEach(p => p.members.forEach(m => out.push(Object.assign({ party: p.leader }, m)))); return { list: out, clanLeader: I.clanLeader || '' }; } catch (e) { return { list: [], clanLeader: '' }; } }
function townOf(ctx, name, P) {
  const b = bagReportOf(ctx, name); if (b && b.town && (b.ageSec || 0) < 900) return b.town;
  const s = statusOf(ctx, name); if (s && s.town && (s.ageSec || 0) < 900) return s.town;
  const m = (P || people(ctx)).list.find(x => x.name === name); return (m && m.town) || '';
}
/** the crafter's last hand-in orders (newest first) with every giver's state */
function handins(ctx, name, n) {
  let files = []; try { files = fs.readdirSync(HDIR(ctx)).filter(f => /^crin[a-z0-9]+\.json$/i.test(f)); } catch (e) { return []; }
  const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(HDIR(ctx), f), 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };
  return files.map(rd).filter(o => o && o.id && o.receiver === name).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, n || 6).map(o => {
    const givers = Object.keys(o.givers || {}).map(g => { const r = rd(`${o.id}_${g}.json`) || {}; return { name: g, kinds: (o.givers[g].items || []).length, state: r.state || 'waiting', msg: String(r.msg || r.step || '').slice(0, 240), given: (r.given || []).length, failed: (r.failed || []).length }; });
    return { id: o.id, at: o.at, what: o.what || '', sameTown: !!o.sameTown, goNow: !!o.goNow, givers, over: givers.every(g => /^(done|failed|stopped)$/.test(g.state)) };
  });
}
function cwhFor(ctx) {
  try {
    const S = require('./storagepage_api'); const w = S.clanWh(ctx, {}); if (!w) return null; const X = craftItems(ctx);
    return { seenAt: w.seenAt, seenBy: w.seenBy, items: w.items.map(r => Object.assign({ kind: crinKind(r, X) }, r)).filter(r => r.kind !== 'other') };
  } catch (e) { return null; }
}
async function giverBag(ctx, name) {
  const B = await tpa().bags(ctx, [name], false), b = B[name] || { ok: false, rows: [] }, X = craftItems(ctx);
  return Object.assign({}, b, { rows: (b.rows || []).map(r => Object.assign({ kind: crinKind(r, X) }, r)) });
}
async function sendCmd(ctx, cmd, names, extra) {
  if (!ctx.commandRun) return { ok: false, error: 'the dashboard server needs a restart (crafter API without the command center)' };
  const r = await ctx.commandRun(Object.assign({ cmd, targets: ['chars:' + names.join(',')] }, extra || {}));
  return r && r.body ? r.body : r;
}
const logCmd = (ctx, t) => { try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tcrafter\t${t}\r\n`); } catch (e) { } };
/** crystallize: checked against the crafter's own bag report */
function cryCheck(ctx, b) {
  const name = String(b.name || ''); if (!NAME_RE.test(name)) return { code: 400, error: 'name?' };
  const rep = bagReportOf(ctx, name);
  if (!rep) return { code: 404, error: `${name} has not reported its bag yet (Logs/crafter_bag_${name}.json) — it needs the new swarm.js and the Crystallize skill` };
  if ((rep.ageSec || 0) > 900) return { code: 409, error: `${name}'s bag report is ${Math.round(rep.ageSec / 60)} min old — is it online?` };
  const ids = [...new Set((Array.isArray(b.objIds) ? b.objIds : []).map(Number).filter(x => Number.isInteger(x) && x > 0))];
  if (!ids.length) return { code: 400, error: 'tick at least one item' };
  if (ids.length > 100) return { code: 400, error: 'at most 100 pieces per order' };
  const t = { enchanted: b.enchanted === true, special: b.special === true }, rows = [], bad = [];
  ids.forEach(id => { const j = (rep.cryst || []).find(x => Number(x.objId) === id); if (!j) { bad.push(`object ${id}: not in its bag report`); return; } const w = cryBlock(j, t); if (w) bad.push(`${j.name}: ${w}`); else rows.push(j); });
  if (bad.length) return { code: 400, error: bad.slice(0, 5).join('; ') + (bad.length > 5 ? ` (+${bad.length - 5} more)` : ''), bad };
  const tot = {}; rows.forEach(j => { tot[j.grade] = (tot[j.grade] || 0) + j.crystals; });
  return { code: 200, ok: true, name, rows, totals: tot, cmd: `!crystallize ${name} ${ids.join(',')}${t.enchanted ? ' enchanted' : ''}${t.special ? ' special' : ''}` };
}
/** hand-in plan: { crafter, from, pick | kind, goNow } -> { crafter, crafterTown, kind, goNow, preview (Trade page trPreview), bagSrc } | { error } */
async function handinPlan(ctx, b) {
  const crafter = String(b.crafter || ''); if (!NAME_RE.test(crafter)) return { error: 'crafter?' };
  const P = people(ctx), known = new Set(P.list.map(m => m.name)); if (P.clanLeader) known.add(P.clanLeader);
  if (!known.has(crafter)) return { error: `unknown crafter "${crafter}"` };
  const ctown = townOf(ctx, crafter, P);
  let givers = [];
  if (b.from === '@town') {
    if (!ctown) return { error: `${crafter} is not in a town right now (or has not reported) — pick one character instead` };
    givers = P.list.filter(m => m.name !== crafter && m.online && m.town === ctown).map(m => m.name);
    if (!givers.length) return { error: `nobody else is online in ${ctown} right now` };
  }
  else if (b.pick && typeof b.pick === 'object') givers = Object.keys(b.pick);
  else if (NAME_RE.test(String(b.from || ''))) givers = [String(b.from)];
  givers = [...new Set(givers)].filter(n => n !== crafter);
  const unknown = givers.filter(n => !known.has(n)); if (unknown.length) return { error: `unknown character(s): ${unknown.join(', ')}` };
  if (!givers.length) return { error: 'nobody to give (the crafter never gives to itself)' };
  if (givers.length > 40) return { error: 'at most 40 givers' };
  const want = CRIN_KIND_OF[b.kind] || '';
  if (!want && !(b.pick && typeof b.pick === 'object')) return { error: 'kind: recipes | materials, or pick items' };
  const B = await tpa().bags(ctx, givers, !!b.fresh), X = craftItems(ctx), sel = {};
  givers.forEach(n => {
    const m = sel[n] = {}, rows = (B[n] && B[n].rows) || [];
    if (want) rows.forEach(r => { if (r.ok && crinKind(r, X) === want) m[r.objId] = r.count; });
    else (Array.isArray(b.pick[n]) ? b.pick[n] : []).forEach(o => { const id = Number(o && typeof o === 'object' ? o.objId : o), r = rows.find(x => x.objId === id); m[id] = r ? Math.min(r.count, Math.max(1, Number(o && o.count) || r.count)) : 1; });
  });
  const pv = tl().trPreview(sel, {}, B, crafter);
  return { crafter, crafterTown: ctown, kind: want || 'pick', goNow: b.goNow === true, preview: pv,
    bagSrc: Object.keys(B).reduce((o, n) => { o[n] = { src: B[n].src, ageSec: B[n].ageSec || 0, err: B[n].err || '' }; return o; }, {}) };
}
async function handinOrder(ctx, b) {
  if (b.confirm !== true) return { code: 409, error: 'confirm the hand-in first (the page asks)', needConfirm: true };
  const p = await handinPlan(ctx, Object.assign({}, b, { fresh: true }));
  if (p.error) return { code: 400, error: p.error };
  if (!p.preview.givers.length) return { code: 400, error: 'nothing to hand in' + (p.preview.problems.length ? ': ' + p.preview.problems.slice(0, 4).join('; ') : ''), plan: p };
  const id = 'crin' + tl().trNewId().slice(1);
  const what = p.kind === 'recipe' ? 'recipes' : p.kind === 'material' ? 'materials' : 'picked items';
  const where = p.crafterTown || "the crafter's town";
  const order = tl().trOrder(id, p.crafter, p.preview, { by: 'dashboard', kind: 'crafter-in', what, sameTown: !p.goNow, goNow: p.goNow,
    why: `${what} for our crafter ${p.crafter}${p.goNow ? '' : ` (handed in when the giver is in ${where})`}` });
  fs.mkdirSync(HDIR(ctx), { recursive: true });
  const F = path.join(HDIR(ctx), id + '.json'), tmp = F + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(order, null, 1)); fs.renameSync(tmp, F);
  const names = Object.keys(order.givers).concat([order.receiver]);
  const sent = await sendCmd(ctx, `!handover ${id}`, names);
  logCmd(ctx, `handin\t${id} -> ${order.receiver}: ${what} from ${Object.keys(order.givers).map(n => `${n} (${order.givers[n].items.length} kinds)`).join(', ')}${p.goNow ? ' — go now' : ' — same town'}`);
  return { code: 200, ok: true, id, order, plan: p, sent };
}
async function handinGo(ctx, b) {
  const id = String(b.id || ''); if (!/^crin[a-z0-9]{3,40}$/i.test(id)) return { code: 400, error: 'bad order id' };
  const F = path.join(HDIR(ctx), id + '.json'); let o;
  try { o = JSON.parse(fs.readFileSync(F, 'utf8').replace(/^﻿/, '')); } catch (e) { return { code: 404, error: 'no such order' }; }
  const waiting = Object.keys(o.givers || {}).filter(g => { try { const r = JSON.parse(fs.readFileSync(path.join(HDIR(ctx), `${id}_${g}.json`), 'utf8')); return !/^(done|failed|stopped)$/.test(String(r.state || '')); } catch (e) { return true; } });
  if (!waiting.length) return { code: 400, error: 'every giver of this order is already done' };
  o.goNow = true; o.sameTown = false; o.goNowAt = isoNow();
  const tmp = F + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(o, null, 1)); fs.renameSync(tmp, F);
  const sent = await sendCmd(ctx, `!handover ${id}`, waiting.concat([o.receiver]));
  logCmd(ctx, `handin-go\t${id}: ${waiting.join(', ')} go to ${o.receiver} now`);
  return { code: 200, ok: true, id, givers: waiting, sent };
}
async function cwhOrder(ctx, b) {
  if (b.confirm !== true) return { code: 409, error: 'confirm first (the page asks)', needConfirm: true };
  const crafter = String(b.crafter || ''); if (!NAME_RE.test(crafter)) return { code: 400, error: 'crafter?' };
  const P = people(ctx), CL = P.clanLeader; if (!CL) return { code: 400, error: 'no clan leader known' };
  const items = (Array.isArray(b.items) ? b.items : []).map(i => ({ id: Number(i && i.id), count: i && i.count === 'all' ? 'all' : Math.max(1, Math.round(Number(i && i.count) || 1)) })).filter(i => Number.isInteger(i.id) && i.id > 0);
  if (!items.length) return { code: 400, error: 'tick at least one item' };
  if (items.length > 40) return { code: 400, error: 'at most 40 kinds per order' };
  const cmd = `!whtake ${items.map(i => i.id + ':' + i.count).join(',')} clan ${crafter}`;
  const sent = await sendCmd(ctx, cmd, [CL]);
  logCmd(ctx, `cwh\t${CL} takes ${items.length} kinds out of the clan warehouse for ${crafter}`);
  return { code: 200, ok: true, clanLeader: CL, self: CL === crafter, cmd, sent };
}
async function handleItems(req, res, url, ctx) {
  const p = url.pathname;
  if (p === '/api/crafter/bag') {
    const n = String(url.searchParams.get('name') || ''); if (!NAME_RE.test(n)) { ctx.json(res, 400, { error: 'name?' }); return true; }
    ctx.json(res, 200, { name: n, bag: await giverBag(ctx, n) }); return true;
  }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  let r;
  if (p === '/api/crafter/crystallize') {
    r = cryCheck(ctx, b);
    if (r.ok && b.dryRun === true) { /* the check only */ }
    else if (r.ok && b.confirm !== true) r = { code: 409, error: 'confirm first (the page asks)', needConfirm: true };
    else if (r.ok) { const sent = await sendCmd(ctx, r.cmd, [r.name], { confirmDanger: true }); logCmd(ctx, `crystallize\t${r.name}: ${r.rows.length} pieces (${Object.keys(r.totals).map(g => r.totals[g] + ' ' + g).join(', ')})`); r = Object.assign(r, { sent }); }
  }
  else if (p === '/api/crafter/handin') r = b.dryRun === true ? await handinPlan(ctx, b).then(x => x.error ? { code: 400, error: x.error } : Object.assign({ code: 200, ok: true }, x)) : await handinOrder(ctx, b);
  else if (p === '/api/crafter/handin/go') r = await handinGo(ctx, b);
  else if (p === '/api/crafter/cwh') r = await cwhOrder(ctx, b);
  else r = { code: 404, error: 'unknown crafter endpoint' };
  const code = r.code || 200; delete r.code; ctx.json(res, code, r); return true;
}
function bad(code, error, extra) { return Object.assign({ code, error }, extra || {}); }
function post(ctx, b) {
  if (!b || typeof b !== 'object') return bad(400, 'bad body');
  const F = fileOf(ctx), Gd = guard(ctx), by = String(b.by || 'dashboard').slice(0, 40);
  fs.mkdirSync(path.dirname(F), { recursive: true });
  let result = null;
  try {
    Gd.withLock(F, () => {
      const R = readFile(ctx);
      if (R.broken) { result = bad(500, `${path.basename(F)} does not parse (${R.broken}) — fix or restore it from history/ first`); return; }
      if (b.rev !== undefined && b.rev !== null && String(b.rev) !== R.rev) { result = bad(409, 'the crafter settings were changed meanwhile (another page or a tool) — reload and try again', { rev: R.rev, conflict: true }); return; }
      const a = applyChange(R.data, b);
      if (!a.ok) { result = bad(400, a.errors.join('; '), { errors: a.errors }); return; }
      const out = Object.assign({ _about: ABOUT }, a.data, { v: 1 });
      out._updated = isoNow();
      const hist = R.exists ? Gd.saveHistory(F, path.dirname(F), 50) : null;
      const txt = JSON.stringify(out, null, 1) + '\n';
      Gd.atomicWrite(F, txt);
      try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${isoNow()}\tcrafter\tsave\t${by}: ${JSON.stringify({ name: b.name, remove: !!b.remove, values: b.values || {} }).slice(0, 600)}\r\n`); } catch (e) { }
      result = { code: 200, ok: true, rev: sha(txt), data: norm(out), history: hist ? path.basename(hist) : null };
    }, { who: 'crafter save' });
  } catch (e) { return bad(500, e.message); }
  return result;
}
async function handle(req, res, url, ctx) {
  if (url.pathname === '/crafterpanel.js' || url.pathname === '/crafterpanel.css') {   // public, read from disk on every request
    let body; try { body = fs.readFileSync(path.join(ctx.DIR || __dirname, url.pathname.slice(1))); } catch (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return true; }
    res.writeHead(200, { 'Content-Type': (url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript') + '; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(body); return true;
  }
  if (url.pathname !== '/api/crafter' && !url.pathname.startsWith('/api/crafter/')) return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (url.pathname !== '/api/crafter') { try { return await handleItems(req, res, url, ctx); } catch (e) { ctx.json(res, 500, { error: e.message }); return true; } }   // CRAFTITEMS-2026-10-15
  if (req.method === 'GET') { try { ctx.json(res, 200, info(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b) || bad(500, 'no result'); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { cryBlock, crinKind, craftItems, cryCheck, handinPlan, handinOrder, handinGo, cwhOrder, bagReportOf, handins, handle, info, post, readFile, fileOf, applyChange, norm, craftCfgOf, craftCrafterFor, craftName, CRAFT_RECIPES, CRAFT_TOWNS, CRAFT_GRADES, CRAFT_MATS, CRAFT_DEF, ABOUT };
