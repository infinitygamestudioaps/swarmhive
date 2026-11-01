// CRYMARK-2026-11-01 (owner: "if I'm on a Bounty Hunter that has the crystallize ability I can't select items from its inventory to auto crystallize.
// There is no reason for them to keep it, it should be crystallized"): per-character AUTO-crystallize marks (item kinds). The character's swarm.js
// (CRYMARK block) crystallizes its marked kinds from its own bag when idle and out of combat - never worn, enchanted, special, quest pieces.
//   GET  /api/crymarks                    { chars: { <Name>: [itemId...] }, all: [itemId...] }
//   POST /api/crymarks { name, add: [ids], remove: [ids] }    name = a character, or '*' = every character with Crystallize (the "all" list)
// File: Scripts/data/crystallize_marks.json (atomic write, backup in Settings/backup/crymarks_<ts>.json).
'use strict';
const fs = require('fs'), path = require('path');
const NAME_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const FILE = (ctx) => path.join(ctx.DATA, 'crystallize_marks.json');
function read(ctx) { try { const j = JSON.parse(fs.readFileSync(FILE(ctx), 'utf8').replace(/^﻿/, '')); return norm(j); } catch (e) { return norm({}); } }
/** pure: any input -> { v, chars: { name: [unique positive ids] }, all: [ids] } */
function norm(j) {
  const ids = (a) => [...new Set((Array.isArray(a) ? a : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
  const out = { v: 1, chars: {}, all: ids(j && j.all) };
  Object.entries((j && j.chars && typeof j.chars === 'object') ? j.chars : {}).forEach(([k, v]) => { if (NAME_RE.test(k)) { const L = ids(v); if (L.length) out.chars[k] = L; } });
  return out;
}
/** pure: marks + { name, add, remove } -> { ok, marks, error } */
function change(m0, b) {
  const m = norm(m0), name = String((b && b.name) || '');
  if (name !== '*' && !NAME_RE.test(name)) return { ok: false, error: 'name: a character or *' };
  const add = (Array.isArray(b.add) ? b.add : []).map(Number).filter(n => Number.isInteger(n) && n > 0), rem = new Set((Array.isArray(b.remove) ? b.remove : []).map(Number));
  if (!add.length && !rem.size) return { ok: false, error: 'add or remove item ids' };
  const cur = name === '*' ? m.all : (m.chars[name] || []);
  const next = [...new Set(cur.concat(add))].filter(id => !rem.has(id));
  if (name === '*') m.all = next; else if (next.length) m.chars[name] = next; else delete m.chars[name];
  return { ok: true, marks: m };
}
function write(ctx, m) {
  const F = FILE(ctx);
  try { if (fs.existsSync(F)) { const B = path.join(ctx.SETTINGS || path.join(ctx.ROOT, 'Settings'), 'backup'); fs.mkdirSync(B, { recursive: true }); fs.copyFileSync(F, path.join(B, `crymarks_${Date.now()}.json`)); } } catch (e) { }
  const tmp = F + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(m, null, 1)); fs.renameSync(tmp, F);
}
async function handle(req, res, url, ctx) {
  if (url.pathname !== '/api/crymarks') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  try {
    if (req.method === 'GET') { ctx.json(res, 200, read(ctx)); return true; }
    if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
    let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
    const r = change(read(ctx), b);
    if (!r.ok) { ctx.json(res, 400, { error: r.error }); return true; }
    write(ctx, r.marks);
    try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()}\tcrymarks\t${b.name}\tadd ${JSON.stringify(b.add || [])} remove ${JSON.stringify(b.remove || [])}\r\n`); } catch (e) { }
    ctx.json(res, 200, Object.assign({ ok: true }, r.marks));
  } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, norm, change, read };
