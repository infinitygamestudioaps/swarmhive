// GEAR APPROVAL (APPROVE-2026-10-30, owner: "From A above a grade you need to manuelle approve! And it still needs to be able to get a full set."
// + "Yes build that" = an Approve button where the plan shows "waits for your OK"; requirement docs/requirements/gear.md R7).
//   GET  /api/gearapproval?name=<Name> -> { name, planAt, approved: [item], waiting: [item], sets: [set], log: [last 10 for the name] }
//        item = { id, name, g, slot, price, set }   set = { name, g, slots: [{ slot, ids, worn, approved, waiting, pick }], fullWithApproved, wholeIds }
//   POST /api/gearapproval { name, approve: [ids] } | { name, revoke: [ids] } (key checked)
// Scripts/data/gear_approved.json { _note, chars: { <Name>: [itemIds] }, log: [{ at, who, ids, act, by }] } (swarm.js FULLSET reads chars.<Name>
// live: A / S / S80 / S84 pieces are only bought / put on when approved, and armor still only as ONE full set). Waiting = the character's plan
// (Logs/gear_plan_<Name>.json skipped lines "<item>: <grade> grade - waits for your OK" + "armor kept: a, b would not give one full set").
// History copy (Scripts/data/history/, last 50) + atomic write + a line in Logs/dashboard_commands.log.
'use strict';
const fs = require('fs'), path = require('path');
const NAME_RE = /^[A-Za-z0-9]{2,16}$/, A_UP = ['A', 'S', 'S80', 'S84'], ARM = ['chest', 'legs', 'head', 'gloves', 'feet'];
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
const rj = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };
const C = { items: null, itemsAt: 0, sets: null, setsAt: 0 };
function items(ctx) { if (!C.items || Date.now() - C.itemsAt > 600000) { C.items = obj((rj(path.join(ctx.DATA, 'gear_items.json'), {}) || {}).items); C.itemsAt = Date.now(); } return C.items; }
function sets(ctx) { if (!C.sets || Date.now() - C.setsAt > 600000) { C.sets = (rj(path.join(ctx.DIR, 'data', 'gear_catalog.json'), {}) || {}).sets || []; C.setsAt = Date.now(); } return C.sets; }
const fileOf = (ctx) => path.join(ctx.DATA, 'gear_approved.json');
function readFile(ctx) { const d = rj(fileOf(ctx), null); return d && typeof d === 'object' ? Object.assign({ chars: {}, log: [] }, d, { chars: obj(d.chars), log: Array.isArray(d.log) ? d.log : [] }) : { _note: 'Owner approvals for A grade and up (gear.md R7): chars.<Name> = item ids the gear-up may buy / put on.', chars: {}, log: [] }; }
function setOf(ctx, id) { return sets(ctx).find(s => Object.keys(obj(s.pieces)).some(sl => sl !== 'shield' && (s.pieces[sl] || []).map(Number).includes(Number(id)))) || null; }
/** item name (from a plan line) -> the item id: exact name, real piece before a Common one */
function idByName(ctx, n) {
  const I = items(ctx), want = String(n || '').trim().replace(/^Sealed /, ''); let best = 0;
  for (const k of Object.keys(I)) { if (I[k].n !== want) continue; if (!best || /^Common Item/.test(I[best].n)) best = Number(k); }
  return best;
}
function itemRow(ctx, id) { const it = items(ctx)[id] || {}, s = setOf(ctx, id); return { id: Number(id), name: it.n || '#' + id, g: it.g || '', slot: it.s || '', price: Number(it.p) || 0, set: s ? s.name : '' }; }
/** the plan's "waits for your OK" / "armor kept" lines -> item ids */
function waitingFromPlan(ctx, plan) {
  const out = new Set();
  (Array.isArray(plan.skipped) ? plan.skipped : []).forEach(line => {
    const t = String(line || '');
    let m = t.match(/^(.+?): (A|S|S80|S84) grade - waits for your OK/); if (m) { const id = idByName(ctx, m[1]); if (id) out.add(id); return; }
    m = t.match(/^armor kept: (.+?) would not give one full set/); if (m) m[1].split(/,\s*/).forEach(n => { const id = idByName(ctx, n); if (id && A_UP.includes(String((items(ctx)[id] || {}).g))) out.add(id); });
  });
  return [...out];
}
function wornIds(ctx, name) { const b = rj(path.join(ctx.LOGS, 'bag_' + name + '.json'), null); const L = b ? (Array.isArray(b) ? b : b.items || []) : []; return L.filter(i => i && i.eq).map(i => Number(i.id)); }
function info(ctx, name) {
  if (!NAME_RE.test(String(name || ''))) return { code: 400, error: 'name?' };
  const F = readFile(ctx), appr = (F.chars[name] || []).map(Number), plan = rj(path.join(ctx.LOGS, 'gear_plan_' + name + '.json'), {}) || {};
  const waiting = waitingFromPlan(ctx, plan).filter(id => !appr.includes(id)), worn = wornIds(ctx, name);
  // every set a waiting / approved armor piece belongs to: per slot what is worn / approved / waiting, and whether it would be FULL
  // a set is decided by its CHEST (a helmet can belong to several sets): the chests that are worn / approved / waiting
  const chestOf = (id) => sets(ctx).find(s => (s.pieces && s.pieces.chest || []).map(Number).includes(Number(id)));
  const setNames = [...new Set(waiting.concat(appr, worn).map(id => (chestOf(id) || {}).name).filter(Boolean))].filter(sn => waiting.concat(appr).some(id => { const s = sets(ctx).find(x => x.name === sn); return Object.keys(obj(s.pieces)).some(sl => sl !== 'shield' && (s.pieces[sl] || []).map(Number).includes(id)); }));
  const S = setNames.map(sn => {
    const s = sets(ctx).find(x => x.name === sn), slots = Object.keys(obj(s.pieces)).filter(k => k !== 'shield');
    const chestFull = (s.pieces.chest || []).some(id => /FULL|full/.test(String((items(ctx)[id] || {}).full)) || (items(ctx)[id] || {}).full === 1);
    const rows = slots.filter(sl => !(sl === 'legs' && chestFull)).map(sl => {
      const ids = (s.pieces[sl] || []).map(Number), w = ids.find(id => worn.includes(id)), a = ids.find(id => appr.includes(id)), wa = ids.find(id => waiting.includes(id));
      return { slot: sl, ids, worn: w || 0, approved: a || 0, waiting: wa || 0, pick: w || a || wa || ids[0] };
    });
    const fullWithApproved = rows.every(r => r.worn || r.approved);
    const wholeIds = rows.filter(r => !r.worn && !r.approved).map(r => r.pick);
    return { name: s.name, g: s.g, t: s.t || '', bonus: s.bonus || '', slots: rows, fullWithApproved, wholeIds };
  });
  const log = F.log.filter(l => l.who === name).slice(-10);
  const label = (r) => { const s = S.find(x => x.slots.some(z => z.ids.includes(r.id))); if (s) r.set = s.name; return r; };
  return { name, planAt: plan.at || null, approved: appr.map(id => label(itemRow(ctx, id))), waiting: waiting.map(id => label(itemRow(ctx, id))), sets: S, log };
}
function post(ctx, b) {
  const name = String(b.name || ''); if (!NAME_RE.test(name)) return { code: 400, error: 'name?' };
  const act = Array.isArray(b.approve) ? 'approve' : Array.isArray(b.revoke) ? 'revoke' : '';
  if (!act) return { code: 400, error: 'approve: [ids] or revoke: [ids]' };
  const ids = [...new Set((b[act] || []).map(Number).filter(n => Number.isInteger(n) && n > 0 && items(ctx)[n]))].slice(0, 40);
  if (!ids.length) return { code: 400, error: 'no known item ids' };
  const F = readFile(ctx), cur = new Set((F.chars[name] || []).map(Number));
  ids.forEach(id => act === 'approve' ? cur.add(id) : cur.delete(id));
  F.chars[name] = [...cur]; if (!F.chars[name].length) delete F.chars[name];
  const by = String(b.by || 'dashboard').slice(0, 60);
  F.log = F.log.concat([{ at: new Date().toISOString(), who: name, ids, act, by }]).slice(-500);
  const f = fileOf(ctx);
  try { if (fs.existsSync(f)) { const H = path.join(ctx.DATA, 'history'); fs.mkdirSync(H, { recursive: true }); fs.copyFileSync(f, path.join(H, 'gear_approved_' + Date.now() + '.json'));
    const old = fs.readdirSync(H).filter(x => /^gear_approved_\d+\.json$/.test(x)).sort(); old.slice(0, Math.max(0, old.length - 50)).forEach(x => { try { fs.unlinkSync(path.join(H, x)); } catch (e) { } }); } } catch (e) { }
  const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(F, null, 1) + '\n'); fs.renameSync(tmp, f);
  try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()} gear approval: ${act} ${name}: ${ids.map(id => (items(ctx)[id] || {}).n || id).join(', ')} (${by})\r\n`); } catch (e) { }
  return Object.assign({ ok: true, act }, info(ctx, name));
}
async function handle(req, res, url, ctx) {
  if (url.pathname !== '/api/gearapproval') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { const r = info(ctx, url.searchParams.get('name')); const code = r.code || 200; delete r.code; ctx.json(res, code, r); return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = post(ctx, b); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, info, post, waitingFromPlan, idByName, setOf };
