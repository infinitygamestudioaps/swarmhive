// L2 MODELS for the 3D view (owner 2026-10-17: "I also want character models and enemies"; files from the player's OWN installed official client,
// converted on this PC, kept in Dashboard/l2cache/ which no release ever contains). On the first request for a monster / NPC its model is exported
// with UE Viewer (umodel.exe, the player's own download) as ActorX .psk (mesh + skeleton) + .psa (animations) + .png textures, then served from
// the cache. The mesh of every NPC id comes from the client's npcgrp.dat (docs/plan/tools/l2dat.js).
//   GET /api/l2model/npc?name=<NPC name>[&lvl=<level>]  ->  { ok, mesh, anim, tex[] } | { pending: true } | { ok: false, why }
//   GET /l2cache/<path>                                  ->  the exported files
// Settings (swarm.config.json): "l2Client" (…\system\l2.exe, already there), "umodel" (path to umodel.exe; default ..\tools\umodel\umodel.exe).
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ST = { models: null, byName: null, jobs: {}, queue: [], running: false, failed: {}, cfgAt: 0, cfg: null };
function cfg(ctx) {
  if (ST.cfg && Date.now() - ST.cfgAt < 60000) return ST.cfg;
  let c = {}; try { c = JSON.parse(fs.readFileSync(path.join(ctx.ROOT, 'swarm.config.json'), 'utf8').replace(/^\uFEFF/, '')); } catch (e) { }
  const client = c.l2Client ? path.dirname(path.dirname(c.l2Client)) : 'C:\\Lineage2';
  // UE Viewer: swarm.config.json "umodel", else <swarm folder>/tools/umodel (where "Set up game models" puts it), else ../tools/umodel
  const umodel = c.umodel || [path.join(ctx.ROOT, 'tools', 'umodel', 'umodel.exe'), path.join(ctx.ROOT, '..', 'tools', 'umodel', 'umodel.exe')].find(f => fs.existsSync(f)) || path.join(ctx.ROOT, 'tools', 'umodel', 'umodel.exe');
  ST.cfg = { client, umodel, cache: path.join(ctx.DIR, 'l2cache') }; ST.cfgAt = Date.now();
  return ST.cfg;
}
function models(ctx) {
  if (ST.models) return ST.models;
  const C = cfg(ctx), f = path.join(C.cache, 'npc_models.json');
  try { ST.models = JSON.parse(fs.readFileSync(f, 'utf8')); return ST.models; } catch (e) { }
  const L = require(path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'l2dat.js'));
  const sys = path.join(C.client, 'system'), dat = ['npcgrp.dat', 'Npcgrp.dat'].map(x => path.join(sys, x)).find(x => fs.existsSync(x));
  if (!dat) throw new Error('no npcgrp.dat in ' + sys);
  ST.models = L.npcgrp(L.decode(fs.readFileSync(dat)));
  fs.mkdirSync(C.cache, { recursive: true }); fs.writeFileSync(f, JSON.stringify(ST.models));
  return ST.models;
}
/** NPC name -> the template ids with that name (the level picks among them) */
function idsByName(ctx, name, lvl) {
  if (!ST.byName) {
    ST.byName = {};
    let all = {}; try { all = JSON.parse(fs.readFileSync(path.join(ctx.ROOT, 'Scripts', 'data', 'npcs_h5.json'), 'utf8')); } catch (e) { }
    Object.entries(all).forEach(([k, v]) => { const n = String((v && (v.n || v.name)) || '').toLowerCase(); if (!n) return; (ST.byName[n] = ST.byName[n] || []).push({ id: +(v.id || k), l: +v.l || 0 }); });
  }
  const L = ST.byName[String(name || '').toLowerCase()] || [];
  return L.slice().sort((a, b) => Math.abs(a.l - (lvl || a.l)) - Math.abs(b.l - (lvl || b.l))).map(x => x.id);
}
const split = (s) => { const i = String(s).indexOf('.'); return i < 0 ? null : [s.slice(0, i), s.slice(i + 1)]; };
function files(C, m) {
  const [mp, mo] = split(m.mesh), anim = mo.replace(/_m\d+$/i, '_anim');
  return {
    mesh: path.join(C.cache, mp, 'SkeletalMesh', mo + '.psk'),
    anim: path.join(C.cache, mp, 'MeshAnimation', anim + '.psa'), animObj: anim, meshPkg: mp, meshObj: mo,
    tex: (m.tex || []).map(t => { const s = split(t); return s ? { pkg: s[0], obj: s[1], file: path.join(C.cache, s[0], 'Texture', s[1] + '.png') } : null; }).filter(Boolean),
  };
}
function umodel(C, args) {
  return new Promise((res) => {
    const p = cp.spawn(C.umodel, [...args, '-path=' + C.client, '-out=' + C.cache], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
    const t = setTimeout(() => { try { p.kill(); } catch (e) { } res(false); }, 90000);
    p.on('exit', (code) => { clearTimeout(t); res(code === 0); }); p.on('error', () => { clearTimeout(t); res(false); });
  });
}
// SIZE + ORIENTATION (owner 2026-10-17: "you did not add the right size ... Queen Ant / Core / Orfen / Antharas / Valakas are HUGE"):
// the mesh's MeshScale / MeshOrigin / RotOrigin (umodel -dump, saved next to the .psk as .meta.json) and the class DrawScale of every NPC class
// (docs/plan/tools/l2pkg.js over System/LineageMonster*.u + LineageNpc*.u, cached in l2cache/npc_scales.json)
function umodelOut(C, args) {
  return new Promise((res) => {
    let out = ''; const p = cp.spawn(C.umodel, [...args, '-path=' + C.client], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.on('data', d => { out += d; if (out.length > 2e6) out = out.slice(-1e6); });
    const t = setTimeout(() => { try { p.kill(); } catch (e) { } res(out); }, 60000);
    p.on('exit', () => { clearTimeout(t); res(out); }); p.on('error', () => { clearTimeout(t); res(''); });
  });
}
async function writeMeta(C, pkg, obj, pskFile) {
  const mf = pskFile.replace(/.psk$/i, '.meta.json'); if (fs.existsSync(mf) || !fs.existsSync(pskFile)) return;
  const t = await umodelOut(C, ['-dump', pkg, obj]);
  const v = (k) => { const m = t.match(new RegExp(k + '\\s*=\\s*\\{([^}]*)\\}')); if (!m) return null; const o = {}; m[1].split(',').forEach(p => { const [a, b] = p.split('='); if (a && b) o[a.trim()] = Number(b); }); return o; };
  fs.writeFileSync(mf, JSON.stringify({ scale: v('MeshScale') || { X: 1, Y: 1, Z: 1 }, origin: v('MeshOrigin') || { X: 0, Y: 0, Z: 0 }, rot: v('RotOrigin') || { Yaw: 0, Pitch: 0, Roll: 0 } }));
}
const readMeta = (pskFile) => { try { return JSON.parse(fs.readFileSync(pskFile.replace(/.psk$/i, '.meta.json'), 'utf8')); } catch (e) { return null; } };
function npcScales(ctx) {
  if (ST.scales) return ST.scales;
  const C = cfg(ctx), f = path.join(C.cache, 'npc_scales.json');
  try { ST.scales = JSON.parse(fs.readFileSync(f, 'utf8')); return ST.scales; } catch (e) { }
  const P = require(path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'l2pkg.js')), sys = path.join(C.client, 'system');
  const files = fs.readdirSync(sys).filter(n => /^Lineage(Monster|Npc)\d*\.u$/i.test(n));
  const all = P.allScales(files.map(n => fs.readFileSync(path.join(sys, n)))), out = {};
  Object.entries(all).forEach(([k, v]) => { out[k.toLowerCase()] = v; });
  fs.mkdirSync(C.cache, { recursive: true }); fs.writeFileSync(f, JSON.stringify(out)); ST.scales = out;
  return out;
}
/** one model at a time: mesh (+ textures) -> animations -> any texture still missing */
async function pump() {
  if (ST.running) return; ST.running = true;
  try {
    while (ST.queue.length) {
      const job = ST.queue.shift();
      if (job.parts) { await charJob(job); continue; }
      if (job.staticMesh) { const m = job.staticMesh; await umodel(job.C, ['-export', '-png', m.pkg, m.obj]); if (!fs.existsSync(m.file)) ST.failed[job.key] = Date.now(); ST.texIdx = null; delete ST.jobs[job.key]; continue; }
      const { key, C, F } = job;
      if (!fs.existsSync(F.mesh)) await umodel(C, ['-export', '-psk', '-png', F.meshPkg, F.meshObj]);
      if (!fs.existsSync(F.anim)) await umodel(C, ['-export', '-psk', F.meshPkg, F.animObj]);
      for (const t of F.tex) if (!texFile(t)) await umodel(C, ['-export', '-png', t.pkg, t.obj]);
      await writeMeta(C, F.meshPkg, F.meshObj, F.mesh);
      if (!fs.existsSync(F.mesh)) ST.failed[key] = Date.now();
      delete ST.jobs[key];
    }
  } finally { ST.running = false; }
}
/** a texture name can be a material (FinalBlend / Shader) that points at the real picture: <name>_ori (base colour), else <name>_d / _diff / any <name>_* */
function texFile(t) {
  if (fs.existsSync(t.file)) return t.file;
  const dir = path.dirname(t.file);
  // the material file UE Viewer writes next to it (Shader / FinalBlend / Combiner / ...: <name>.mat with "Diffuse=<texture>") names the picture
  try {
    const pkgDir = path.dirname(dir);
    for (const sub of fs.readdirSync(pkgDir)) {
      const mat = path.join(pkgDir, sub, t.obj + '.mat'); if (!fs.existsSync(mat)) continue;
      const m = fs.readFileSync(mat, 'utf8').match(/^\s*Diffuse\s*=\s*([^\s\r\n]+)/m);
      if (m) { const f = path.join(dir, m[1].split('.').pop() + '.png'); if (fs.existsSync(f)) return f; }
    }
  } catch (e) { }
  let names = []; try { names = fs.readdirSync(dir); } catch (e) { return null; }
  const base = t.obj.toLowerCase(), pick = (re) => names.find(n => re.test(n.toLowerCase()));
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const f = pick(new RegExp('^' + esc + '_ori\\.png$')) || pick(new RegExp('^' + esc + '_(d|diff|diffuse|t)\\.png$')) || pick(new RegExp('^' + esc + '_(?!sp|spec|s|n|norm|alpha|a)\\w*\\.png$'));
  return f ? path.join(dir, f) : null;
}
const url = (C, f) =>'/l2cache/' + path.relative(C.cache, f).split(path.sep).map(encodeURIComponent).join('/');
function forNpc(ctx, name, lvl) {
  const C = cfg(ctx);
  if (!fs.existsSync(C.umodel)) return { ok: false, setup: true, why: 'Game models need UE Viewer (free, by its author Gildor): tap "Set up game models" once' };
  if (!fs.existsSync(C.client)) return { ok: false, why: 'the game client was not found (swarm.config.json "l2Client")' };
  const M = models(ctx);
  const id = idsByName(ctx, name, lvl).find(i => M[i]);
  if (!id) return { ok: false, why: 'no model for ' + name };
  const m = M[id], F = files(C, m), key = m.mesh;
  if (fs.existsSync(F.mesh) && !fs.existsSync(F.mesh.replace(/.psk$/i, '.meta.json')) && !ST.jobs[key]) { ST.jobs[key] = 1; ST.queue.push({ key, C, F }); pump(); return { pending: true }; }
  const drawScale = (() => { try { return npcScales(ctx)[String(m.cls).split('.').pop().toLowerCase()] || 1; } catch (e) { return 1; } })();
  if (fs.existsSync(F.mesh) && !ST.jobs[key]) return { ok: true, id, drawScale, meta: readMeta(F.mesh), mesh: url(C, F.mesh), anim: fs.existsSync(F.anim) ? url(C, F.anim) : null, tex: F.tex.map(t => { const x = texFile(t); return x ? url(C, x) : null; }) };
  if (ST.failed[key] && Date.now() - ST.failed[key] < 3600000) return { ok: false, why: 'the model could not be exported' };
  if (!ST.jobs[key]) { ST.jobs[key] = 1; ST.queue.push({ key, C, F }); pump(); }
  return { pending: true };
}
async function handle(req, res, u, ctx) {
  if (u.pathname.startsWith('/l2cache/')) {
    const C = cfg(ctx), rel = decodeURIComponent(u.pathname.slice('/l2cache/'.length)), f = path.resolve(C.cache, rel);
    if (!f.startsWith(path.resolve(C.cache) + path.sep) || !fs.existsSync(f)) { ctx.send(res, 404, 'text/plain', 'not found'); return true; }
    const type = /\.png$/i.test(f) ? 'image/png' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800' }); res.end(fs.readFileSync(f)); return true;
  }
  if (!u.pathname.startsWith('/api/l2model/')) return false;
  if (!ctx.allowed(req, u)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (u.pathname === '/api/l2model/buildings') {
    const x = +u.searchParams.get('x'), y = +u.searchParams.get('y'), r = Math.min(9000, +u.searchParams.get('r') || 4000);
    try {
      const rows = isFinite(x) && isFinite(y) ? buildingsNear(ctx, x, y, r) : [];
      // SPEED (owner 2026-10-17: "buildings load extremely slow"): every model of the area goes into the export queue at once (nearest first)
      [...new Set(rows.slice().sort((p, q) => Math.hypot(p[1] - x, p[2] - y) - Math.hypot(q[1] - x, q[2] - y)).map(r2 => r2[0]))].forEach(m => { try { forStatic(ctx, m); } catch (e) { } });
      ctx.json(res, 200, { rows });
    } catch (e) { ctx.json(res, 200, { rows: [], why: e.message }); }
    return true;
  }
  if (u.pathname === '/api/l2model/statics') {   // batch: ?meshes=a,b,c (max 80) -> { mesh: answer }
    const out = {}; String(u.searchParams.get('meshes') || '').split(',').filter(Boolean).slice(0, 80).forEach(m => { try { out[m] = forStatic(ctx, m); } catch (e) { out[m] = { ok: false, why: e.message }; } });
    ctx.json(res, 200, out); return true;
  }
  if (u.pathname === '/api/l2model/static') {
    try { ctx.json(res, 200, forStatic(ctx, u.searchParams.get('mesh') || '')); } catch (e) { ctx.json(res, 200, { ok: false, why: e.message }); }
    return true;
  }
  if (u.pathname === '/api/l2model/char') {
    try { ctx.json(res, 200, await forChar(ctx, u.searchParams.get('name') || '')); } catch (e) { ctx.json(res, 200, { ok: false, why: e.message }); }
    return true;
  }
  if (u.pathname === '/api/l2model/npc') {
    try { ctx.json(res, 200, forNpc(ctx, u.searchParams.get('name') || '', Number(u.searchParams.get('lvl')) || 0)); } catch (e) { ctx.json(res, 200, { ok: false, why: e.message }); }
    return true;
  }
  // SET UP (everyone has Lineage 2 installed; owner 2026-10-17: "make it possible for people to use these models themselves"): download UE
  // Viewer from its author's site (gildor.org) into <swarm folder>/tools/umodel once; the page asks first. GET = what is there.
  if (u.pathname === '/api/l2model/setup') {
    const C = cfg(ctx);
    if (req.method === 'GET') { ctx.json(res, 200, { umodel: fs.existsSync(C.umodel), client: fs.existsSync(C.client), busy: !!ST.setup }); return true; }
    if (fs.existsSync(C.umodel)) { ctx.json(res, 200, { ok: true, already: true }); return true; }
    if (ST.setup) { ctx.json(res, 200, { ok: true, busy: true }); return true; }
    ST.setup = true;
    try {
      const dir = path.join(ctx.ROOT, 'tools', 'umodel'); fs.mkdirSync(dir, { recursive: true });
      const zip = path.join(dir, 'umodel_win32.zip');
      const r = await fetch('https://www.gildor.org/down/47/umodel/umodel_win32.zip', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SwarmHive', Referer: 'https://www.gildor.org/downloads' } });
      const buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || buf.slice(0, 2).toString() !== 'PK') throw new Error('the download did not give the program (status ' + r.status + ')');
      fs.writeFileSync(zip, buf);
      cp.execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Force '${zip}' '${dir}'`], { windowsHide: true, timeout: 120000 });
      ST.cfg = null;
      ctx.json(res, 200, { ok: fs.existsSync(path.join(dir, 'umodel.exe')), where: dir });
    } catch (e) { ctx.json(res, 200, { ok: false, why: e.message }); }
    finally { ST.setup = false; }
    return true;
  }
  ctx.json(res, 404, { error: 'unknown l2model call' }); return true;
}
// ---- characters (owner 2026-10-17: "character models"): race + gender + worn armour -> body parts (docs/plan/tools/l2dat.js armorgrp / chargrp) ----
function charModels(ctx) {
  if (ST.chars) return ST.chars;
  const C = cfg(ctx), f = path.join(C.cache, 'char_models.json');
  try { ST.chars = JSON.parse(fs.readFileSync(f, 'utf8')); if (ST.chars.weapons) return ST.chars; } catch (e) { }
  const L = require(path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'l2dat.js')), sys = path.join(C.client, 'system');
  const find = (n) => fs.readdirSync(sys).find(x => x.toLowerCase() === n);
  const arm = L.decode(fs.readFileSync(path.join(sys, find('armorgrp.dat'))));
  ST.chars = { armor: L.armorgrp(arm), body: L.chargrp(L.decode(fs.readFileSync(path.join(sys, find('chargrp.dat'))))), weapons: L.weapongrp(L.decode(fs.readFileSync(path.join(sys, find('weapongrp.dat'))))), shields: L.shieldgrp(arm) };
  fs.mkdirSync(C.cache, { recursive: true }); fs.writeFileSync(f, JSON.stringify(ST.chars));
  return ST.chars;
}
const partFiles = (C, p) => { const [mp, mo] = split(p.mesh); return { mesh: path.join(C.cache, mp, 'SkeletalMesh', mo + '.psk'), meshPkg: mp, meshObj: mo, tex: p.tex.map(t => { const x = split(t); return x ? { pkg: x[0], obj: x[1], file: path.join(C.cache, x[0], 'Texture', x[1] + '.png') } : null; }).filter(Boolean) }; };
async function charJob(job) {
  const { key, C, parts, anim } = job;
  ST.texTried = ST.texTried || {}; ST.texTried[key] = 1;   // a texture still missing after one try = drawn without it (no export loop)
  for (const p of parts) {
    const F = partFiles(C, p);
    if (!fs.existsSync(F.mesh)) await umodel(C, ['-export', '-psk', '-png', F.meshPkg, F.meshObj]);
    for (const t of F.tex) if (!texFile(t)) await umodel(C, ['-export', '-png', t.pkg, t.obj]);
    await writeMeta(C, F.meshPkg, F.meshObj, F.mesh);
  }
  if (anim && !fs.existsSync(anim.file)) await umodel(C, ['-export', '-psk', anim.pkg, anim.obj]);
  if (!fs.existsSync(partFiles(C, parts[0]).mesh)) ST.failed[key] = Date.now();
  delete ST.jobs[key];
}
const CHAR = {};
/** who: { sex, classId, items: [{ id, slot }] } from L2Swarm (60 s cache) */
async function charLook(ctx, name) {
  const c = CHAR[name]; if (c && Date.now() - c.at < 60000) return c.d;
  const st = JSON.parse(await ctx.mcpCallChar('get_account_status', name, {}));
  const inv = JSON.parse(await ctx.mcpCallChar('get_account_data', name, { type: 'inventory' }));
  const L = Array.isArray(inv) ? inv : (inv.items || []);
  const d = { sex: st.character ? st.character.sex : null, classId: st.character ? st.character.class_id : null, items: L.filter(x => x.is_equipped).map(x => ({ id: x.item_id, slot: x.body_part_name, name: x.name })) };
  CHAR[name] = { at: Date.now(), d };
  return d;
}
async function forChar(ctx, name) {
  const C = cfg(ctx);
  if (!fs.existsSync(C.umodel)) return { ok: false, setup: true, why: 'Game models need UE Viewer (free, by its author Gildor): tap "Set up game models" once' };
  if (!ctx.mcpCallChar) return { ok: false, why: 'no L2Swarm connection' };
  const L = require(path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'l2dat.js'));
  const look = await charLook(ctx, name);
  if (look.classId == null) return { ok: false, why: name + ' is not in game' };
  const race = L.raceOfClass(look.classId), rg = (look.sex === 1 ? 'F' : 'M') + race;
  const M = charModels(ctx), body = M.body[rg] || {};
  // worn pieces first (chest / legs / gloves / feet; a full armour gives the legs too), then the plain clothes, face and hair
  const slotOf = (mesh) => ((mesh.split('.')[1] || '').match(/_([ulgb])$/i) || [])[1];
  const have = {}, parts = [];
  look.items.forEach(it => { const p = (M.armor[it.id] || {})[rg]; if (!p) return; p.forEach(x => { const sl = (slotOf(x.mesh) || '').toLowerCase(); if (sl && !have[sl]) { have[sl] = 1; parts.push(x); } }); });
  ['u', 'l', 'g', 'b'].forEach(sl => { if (!have[sl] && body[sl]) parts.push(body[sl]); });
  if (body.face && body.face[0]) parts.push(body.face[0]);
  if (body.hair && body.hair[0]) parts.push(body.hair[0]);
  if (!parts.length) return { ok: false, why: 'no body parts for ' + rg };
  // WEAPONS (owner 2026-10-17: "weapons in the characters' hands"): weapongrp / armorgrp models hung on the skeleton's attachment bones
  const held = [];
  look.items.forEach(it => {
    const w = (M.weapons || {})[it.id], s = (M.shields || {})[it.id];
    if (w && /HAND/.test(String(it.slot))) { const bow = /bow/i.test(String(it.name || '')); w.mesh.slice(0, /dual|\*/i.test(String(it.name || '')) ? 2 : 1).forEach((m, k) => held.push({ mesh: m, tex: w.tex[k] ? [w.tex[k]] : w.tex.slice(0, 1), bone: bow || k === 1 ? 'Weapon_L_Bone' : 'Weapon_R_Bone' })); }
    else if (s && it.slot === 'L_HAND') held.push({ mesh: s.mesh[0], tex: s.tex.slice(0, 1), bone: 'Shield_L_Bone' });
  });
  const anim = { pkg: race, obj: rg + '_anim', file: path.join(C.cache, race, 'MeshAnimation', rg + '_anim.psa') };
  const key = 'char:' + rg + ':' + parts.concat(held).map(p => p.mesh).join('|');
  const ready = parts.concat(held).every(p => { const F = partFiles(C, p); return fs.existsSync(F.mesh) && (ST.texTried && ST.texTried[key] || F.tex.every(t => texFile(t))); });
  // the weapon stance picks the animation set (Wait_2HS, Run_Bow, Atk01_1HS ...)
  const w = look.items.find(it => /HAND/.test(String(it.slot))), wn = w ? String(w.name || '') : '';
  const stance = !w ? 'Hand' : /bow/i.test(wn) ? 'Bow' : /dual|\*/i.test(wn) ? 'Dual' : /spear|halberd|glaive|lance|pike|scythe|poleaxe/i.test(wn) ? 'Pole' : w.slot === 'LR_HAND' ? '2HS' : '1HS';
  if (ready && !ST.jobs[key]) return { ok: true, rg, stance, anim: fs.existsSync(anim.file) ? url(C, anim.file) : null,
    held: held.map(p => { const F = partFiles(C, p); return { bone: p.bone, meta: readMeta(F.mesh), mesh: url(C, F.mesh), tex: F.tex.map(t => { const x = texFile(t); return x ? url(C, x) : null; }) }; }),
    parts: parts.map(p => { const F = partFiles(C, p); return { meta: readMeta(F.mesh), mesh: url(C, F.mesh), tex: F.tex.map(t => { const x = texFile(t); return x ? url(C, x) : null; }) }; }) };
  if (ST.failed[key] && Date.now() - ST.failed[key] < 3600000) return { ok: false, why: 'the model could not be exported' };
  if (!ST.jobs[key]) { ST.jobs[key] = 1; ST.queue.push({ key, C, parts: parts.concat(held), anim }); pump(); }
  return { pending: true };
}
// ---- BUILDINGS (owner 2026-10-17: "I miss all the buildings in all towns", "add textures and buildings to town") ----
// /api/l2model/buildings?x=&y=&r= : the StaticMeshActors of the map regions around (MAPS/<rx>_<ry>.unr, docs/plan/tools/l2pkg.js placements,
// cached per region in l2cache/maps/<rx>_<ry>.json): rows [mesh, x, y, z, pitch, yaw, roll, sx, sy, sz] in Unreal units.
// /api/l2model/static?mesh=<Package.Object> : exports that building model once (.pskx + textures) -> { ok, mesh, mats: [url | null] }
function regionPlacements(ctx, rx, ry) {
  const C = cfg(ctx), dir = path.join(C.cache, 'maps'), f = path.join(dir, rx + '_' + ry + '.json');
  ST.regions = ST.regions || {};
  if (ST.regions[f]) return ST.regions[f];
  let rows = null;
  try { rows = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { }
  if (!rows) {
    const unr = path.join(C.client, 'MAPS', rx + '_' + ry + '.unr');
    rows = [];
    if (fs.existsSync(unr)) {
      const P = require(path.join(ctx.ROOT, 'docs', 'plan', 'tools', 'l2pkg.js'));
      try { rows = P.placements(fs.readFileSync(unr)).map(a => [a.mesh, Math.round(a.loc[0]), Math.round(a.loc[1]), Math.round(a.loc[2]), a.rot[0], a.rot[1], a.rot[2], +(a.ds * a.ds3[0]).toFixed(3), +(a.ds * a.ds3[1]).toFixed(3), +(a.ds * a.ds3[2]).toFixed(3)]); } catch (e) { rows = []; }
    }
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f, JSON.stringify(rows));
  }
  ST.regions[f] = rows; return rows;
}
function buildingsNear(ctx, x, y, r) {
  const out = [];
  for (let gx = Math.floor((x - r) / 32768); gx <= Math.floor((x + r) / 32768); gx++) for (let gy = Math.floor((y - r) / 32768); gy <= Math.floor((y + r) / 32768); gy++) {
    regionPlacements(ctx, gx + 20, gy + 18).forEach(a => { if (Math.hypot(a[1] - x, a[2] - y) <= r) out.push(a); });
  }
  return out;
}
/** texture name -> exported picture (any package folder of the cache; a material's .mat names its Diffuse picture) */
function texIndex(ctx, refresh) {
  if (ST.texIdx && !refresh) return ST.texIdx;
  const C = cfg(ctx), idx = {}, mats = {};
  try {
    fs.readdirSync(C.cache).forEach(pkg => { const pd = path.join(C.cache, pkg); let subs = []; try { if (!fs.statSync(pd).isDirectory()) return; subs = fs.readdirSync(pd); } catch (e) { return; }
      subs.forEach(sub => { const sd = path.join(pd, sub); let fl = []; try { fl = fs.readdirSync(sd); } catch (e) { return; }
        fl.forEach(n => { const k = n.replace(/\.[^.]+$/, '').toLowerCase(); if (/\.png$/i.test(n)) idx[k] = idx[k] || path.join(sd, n); else if (/\.mat$/i.test(n)) mats[k] = path.join(sd, n); }); }); });
  } catch (e) { }
  Object.entries(mats).forEach(([k, mf]) => { if (idx[k]) return; try { const m = fs.readFileSync(mf, 'utf8').match(/^\s*Diffuse\s*=\s*([^\s\r\n]+)/m); if (m && idx[m[1].split('.').pop().toLowerCase()]) idx[k] = idx[m[1].split('.').pop().toLowerCase()]; } catch (e) { } });
  ST.texIdx = idx; return idx;
}
function matNames(file) {
  const b = fs.readFileSync(file); let o = 0; const out = [];
  while (o + 32 <= b.length) { const id = b.slice(o, o + 20).toString('latin1').replace(/\0.*$/, ''), sz = b.readInt32LE(o + 24), n = b.readInt32LE(o + 28); if (id === 'MATT0000') for (let i = 0; i < n; i++) out.push(b.slice(o + 32 + i * sz, o + 32 + i * sz + 64).toString('latin1').replace(/\0.*$/, '')); o += 32 + sz * n; }
  return out;
}
function forStatic(ctx, mesh) {
  const C = cfg(ctx); if (!fs.existsSync(C.umodel)) return { ok: false, setup: true, why: 'Game models need UE Viewer: tap "Set up game models" once' };
  const sp = split(mesh); if (!sp) return { ok: false, why: 'bad mesh name' };
  const file = path.join(C.cache, sp[0], 'StaticMesh', sp[1] + '.pskx'), key = 'static:' + mesh;
  if (fs.existsSync(file) && !ST.jobs[key]) {
    let idx = texIndex(ctx); const names = matNames(file);
    if (names.some(n => !idx[n.toLowerCase()]) && !ST.texFresh) { ST.texFresh = 1; idx = texIndex(ctx, true); setTimeout(() => { ST.texFresh = 0; }, 5000); }
    return { ok: true, mesh: url(C, file), mats: names.map(n => idx[n.toLowerCase()] ? url(C, idx[n.toLowerCase()]) : null) };
  }
  if (ST.failed[key] && Date.now() - ST.failed[key] < 3600000) return { ok: false, why: 'could not be exported' };
  if (!ST.jobs[key]) { ST.jobs[key] = 1; ST.queue.push({ key, C, staticMesh: { pkg: sp[0], obj: sp[1], file } }); pump(); }
  return { pending: true };
}
module.exports = { handle, forNpc, forChar, forStatic, buildingsNear, files, idsByName };
