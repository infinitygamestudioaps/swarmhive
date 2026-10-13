// ROUTE EDITOR FOR EVERY TARGET (ROUTESWITCH-2026-10-13; user 2026-10-12/13: "Always show the computed path; if a custom path has been created it should
// be possible to lock in on either ... it must apply to all routes ... same with all quests ... all NPCs" + "the route choice exists only for raid bosses,
// not for NPCs and other targets — fix it"). #/routeedit/<type>/<id> — type raid | epic | npc | quest (<quest id>_<cond>) | area | room | dungeon.
// The computed path (nav atlas, cyan dashed) and your own route (yellow, editable) on one map; points by tap on the map, a character's position,
// recording a character's walk (it does not fight meanwhile: /api/rechold), pasted /loc lines, or "start from the computed path"; the start
// (.townname or a gatekeeper teleport, or none = walked from where the normal way in ends); a point can be marked "swim" (water leg: the bots allow the
// slower swim speed); Save & lock / Save unlocked / Lock / Unlock / Delete (history kept); the switch computed | own route | auto (the shared route
// view block, Dashboard/routeview.js). API: GET/POST /api/route?type=&id= (server.js -> Dashboard/routestore.js; known raid bosses -> routeApi).
// The bots read the file on their next trip (Scripts_dev/swarm.js ROUTESWITCH; no deploy for the data). Phone first (390 px). No browser dialogs.
// DUNGEON STEPS (2026-10-13, user: "Archon Suscepter is on floor 1 of Cruma Tower. But our road is showing a path outside"): a route can hold a
// dungeon step between its points (pick the dungeon floor = its teleporter NPC from dungeon_rooms.json: Mozella into Cruma floor 1, Penelope to floor 2 ...;
// drawn as a portal); points after it lie on that floor and the map shows that floor's art (level tabs: surface | <dungeon> <floor>). A route whose points
// jump > 1500 in height with no step between them is NOT walkable: red warning + one-tap fix (inserts walk-to-NPC point, the step, its landing); a point
// can be marked "drop" (a real ledge). "Start from the computed path" brings the atlas floor steps along.
(function () {
  'use strict';
  const SEC = 'routeEditSec', TILE = 8192;
  const $id = (i) => document.getElementById(i);
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const call = (u, o) => (typeof api === 'function' ? api(u, o) : fetch(u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o || {})).then(r => r.json()));
  const KM = (d) => !(d > 0) ? '0' : d >= 1000 ? (d / 1000).toFixed(1) + 'k' : String(Math.round(d));
  // DUNGEON STEPS (2026-10-13): ED.pts holds plain points AND dungeon steps { do: 'floor', dungeon, dungeonKey, floor, floorName, npc, link, landing }
  const isStep = (e) => !!(e && (e.do === 'floor' || e.do === 'dungeon'));
  const plainOf = (P) => P.filter(p => !isStep(p));
  const lenOf = (P) => { let l = 0; for (let i = 1; i < P.length; i++) { if (isStep(P[i]) || isStep(P[i - 1])) continue; l += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); } return Math.round(l); };
  /** same rule as swarm.js rsFloorCheck / routestore.floorCheck: two points in a row > 1500 apart in height with no dungeon step = not walkable */
  function floorCheck(P, floorOk) {
    if (floorOk) return { ok: true };
    let prev = null, prevI = -1, n = 0;
    for (let i = 0; i < P.length; i++) { const e = P[i]; if (isStep(e)) { prev = null; continue; } n++;
      if (prev && Math.abs(e.z - prev.z) > 1500 && !e.drop) return { ok: false, at: n, i, prevI, why: `point ${n - 1} -> ${n} jumps ${Math.round(Math.abs(e.z - prev.z))} in height (z ${Math.round(prev.z)} -> ${Math.round(e.z)}) with no dungeon / floor step between them` };
      prev = e; prevI = i; }
    return { ok: true };
  }
  /** the map level of a point: '<dungeonKey>:<floor>' (bbox + height band, like MapFloors) or 'surface' */
  function lvlKey(p) {
    if (!p || !isFinite(p.z)) return 'surface';
    for (const d of (ED && ED.d && ED.d.dungeons) || []) { const b = d.bbox; if (!Array.isArray(b) || p.x < b[0] - 800 || p.x > b[1] + 800 || p.y < b[2] - 800 || p.y > b[3] + 800) continue;
      const F = d.floors.find(f => Array.isArray(f.z) && p.z >= f.z[0] - 300 && p.z <= f.z[1] + 300); if (F) return d.key + ':' + F.i; }
    return 'surface';
  }
  function levelList() {
    const keys = new Set(); (ED.pts || []).forEach(p => { if (isStep(p)) keys.add(p.dungeonKey + ':' + p.floor); else keys.add(lvlKey(p)); });
    const T = targetPt(); if (T) keys.add(lvlKey(T)); atlasPts().forEach(p => { if (isStep(p)) keys.add(p.dungeonKey + ':' + p.floor); });
    keys.delete('surface'); if (!keys.size) return [];
    const D = (ED.d && ED.d.dungeons) || [];
    return [{ key: 'surface', name: 'surface' }].concat([...keys].map(k => { const [dk, fi] = k.split(':'), d = D.find(x => x.key === dk), F = d && d.floors[+fi]; return F ? { key: k, name: d.name + ' · ' + F.name, z: F.z } : null; }).filter(Boolean));
  }
  const onLvl = (p) => !ED.level || !p || isStep(p) || lvlKey(p) === ED.level;
  const chars = () => { try { return (typeof STATE !== 'undefined' && STATE && STATE.chars) || []; } catch (e) { return []; } };
  const confirmBox = (o) => (typeof uiConfirm === 'function' ? uiConfirm(o) : Promise.resolve(false));
  const errorBox = (m) => { if (typeof uiError === 'function') uiError(m); };
  const alertBox = (t, b) => { if (typeof uiAlert === 'function') uiAlert({ title: t, body: b }); };
  const hold = (name, on) => { try { if (typeof recHold === 'function') recHold(name, on); else call('/api/rechold', { method: 'POST', body: JSON.stringify({ name, on }) }).catch(() => { }); } catch (e) { } };
  const TYPES = { raid: 'raid boss', epic: 'epic boss', npc: 'NPC', quest: 'quest step', area: 'field area', room: 'dungeon room', dungeon: 'dungeon entrance' };
  let ED = null, OPEN = false;

  /** the route view target of a store key */
  function rvTarget(type, id, d) {
    if (type === 'raid' || type === 'epic') return 'raid:' + id;
    if (type === 'quest') { const [q] = String(id).split('_'), st = d && d.target && d.target.quest ? d.target.quest.step : 0; return 'quest:' + q + ':' + Math.max(0, st); }
    return type + ':' + id;
  }
  function css() { if ($id('routeEditCss') || [...document.querySelectorAll('link[rel=stylesheet]')].some(l => /routeedit\.css/.test(l.href))) return; const l = document.createElement('link'); l.id = 'routeEditCss'; l.rel = 'stylesheet'; l.href = '/routeedit.css'; document.head.appendChild(l); }
  function section() {
    let s = $id(SEC); if (s) return s;
    css();
    s = document.createElement('section'); s.id = SEC; s.className = 'win re'; s.hidden = true;
    s.innerHTML = '<div id="reHead"></div><div id="reRv" class="re-rv"></div><div id="reBox" class="muted">…</div>';
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('change', onChange);
    return s;
  }
  // ------------------------------------------------------------------------------------------------ data
  async function load(type, id) {
    if (ED && ED.rec) stopRec();
    ED = { type, id, d: null, pts: [], sel: -1, start: null, dirty: false, view: null, rec: null, layer: 0, msg: '' };
    $id('reHead').innerHTML = `<div class="re-head"><button type="button" data-re="back" aria-label="back">← Back</button><h2>Own route</h2><span class="muted">${E(TYPES[type] || type)} ${E(id)}</span></div>`;
    $id('reBox').innerHTML = '<div class="muted">loading…</div>';
    let d; try { d = await call(`/api/route?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`); } catch (e) { d = { error: e.message }; }
    if (!ED || ED.type !== type || ED.id !== id) return;
    if (!d || d.error) { $id('reBox').innerHTML = `<div class="rv-box none">${E((d && d.error) || 'no answer')}${/not found|Cannot/i.test(String(d && d.error)) ? ' — the dashboard server needs a restart for the route editor' : ''}</div>`; return; }
    fill(d);
    const name = (d.target && d.target.name) || (d.boss && d.boss.name) || `${TYPES[type] || type} ${id}`;
    $id('reHead').innerHTML = `<div class="re-head"><button type="button" data-re="back" aria-label="back">← Back</button><h2>Own route</h2><b>${E(name)}</b><span class="muted">${E(TYPES[type] || type)}${d.target && d.target.key ? ' · <a href="#/navatlas/' + encodeURIComponent(d.target.key) + '">atlas ›</a>' : ''}</span></div>`;
    if (window.RouteView) RouteView.mount($id('reRv'), rvTarget(type, id, d), { map: false, title: name, onUse: () => reload(true) });
    render();
  }
  function fill(d) {
    ED.d = d;
    const r = d.route, A = (d.target && d.target.atlas) || null;
    ED.pts = r && Array.isArray(r.points) ? r.points.map(p => { if (isStep(p)) return Object.assign({}, p); const o = { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z || 0) }; if (p.swim || p.water) o.swim = true; if (p.drop) o.drop = true; if (p.layer) o.layer = p.layer; return o; }) : [];
    ED.start = r ? (r.start || null) : (A && A.start) || null;
    ED.floorOk = !!(r && r.floorOk);
    ED.sel = ED.pts.length - 1; ED.dirty = false; ED.view = null;
    { const L = levelList(), T = targetPt(); ED.level = L.length && T ? lvlKey(T) : ''; }   // DUNGEON STEPS: the target's floor first
    if (!r) ED.msg = 'No own route yet. Tap the map to add points, record a character\'s walk, or "Start from the computed path" — then Save.';
  }
  async function reload(keepMsg) { if (!ED) return; const m = ED.msg; let d; try { d = await call(`/api/route?type=${encodeURIComponent(ED.type)}&id=${encodeURIComponent(ED.id)}`); } catch (e) { return; } if (d && !d.error) { fill(d); if (keepMsg) ED.msg = m; render(); } }
  // ------------------------------------------------------------------------------------------------ map
  function targetPt() { const d = ED.d || {}, t = d.target || {}, b = d.boss || {}; const x = isFinite(t.x) ? t : isFinite(b.x) ? b : null; return x ? { x: +x.x, y: +x.y, z: +x.z || 0, name: t.name || b.name || '' } : null; }
  function atlasPts() { const A = ED.d && ED.d.target && ED.d.target.atlas; return A && Array.isArray(A.prefill) ? A.prefill : []; }
  function landing() { const A = ED.d && ED.d.target && ED.d.target.atlas; const st = ED.start; if (st && st.kind === 'town' && ED.d.towns && ED.d.towns[st.town]) { const T = ED.d.towns[st.town]; return { x: T[0], y: T[1], z: T[2], t: '.' + String(st.town).toLowerCase() }; }
    if (st && st.kind === 'gk' && ED.d.gkLand && ED.d.gkLand[st.desc]) { const L = ED.d.gkLand[st.desc]; return { x: L[0], y: L[1], z: L[2], t: st.desc }; }
    if (ED.d && ED.d.landingDefault && isFinite(ED.d.landingDefault.x)) { const L = ED.d.landingDefault; return { x: L.x, y: L.y, z: L.z, t: L.desc }; }
    return A && A.landing && isFinite(A.landing.x) ? { x: A.landing.x, y: A.landing.y, z: A.landing.z, t: A.landing.desc } : null; }
  function fitView() {
    let P = plainOf(ED.pts.concat(atlasPts())); const t = targetPt(), L = landing(); if (t) P.push(t); if (L) P.push(L);
    ED.pts.concat(atlasPts()).forEach(s => { if (isStep(s) && s.npc && isFinite(s.npc.x)) P.push(s.npc); });
    if (ED.level) { const Q = P.filter(p => onLvl(p)); if (Q.length) P = Q; }   // DUNGEON STEPS: fit the shown level
    if (!P.length) { const c = chars().find(c => isFinite(c.x)); if (c) P.push({ x: c.x, y: c.y }); }
    if (!P.length) return { cx: 83473, cy: 148554, R: 6000 };
    const xs = P.map(p => p.x), ys = P.map(p => p.y), x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
    return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, R: Math.max(1500, (x2 - x1) / 2 * 1.1 + 700, (y2 - y1) / 2 * 1.1 + 700) };
  }
  function mapSvg() {
    if (!ED.view) ED.view = fitView();
    const { cx, cy, R } = ED.view, W = 2 * R, x0 = cx - R, y0 = cy - R, u = W / 400;
    let t = '';
    // DUNGEON STEPS: a dungeon floor level shows that floor's map art (index.html ugLayer / MAP_ZMAP), else the old manual layer pick
    const lvF = ED.level && ED.level !== 'surface' ? levelList().find(l => l.key === ED.level) : null, lvZ = lvF && lvF.z ? (lvF.z[0] + lvF.z[1]) / 2 : null;
    if (W < 160000) for (let gx = Math.floor(x0 / TILE); gx * TILE < x0 + W; gx++) for (let gy = Math.floor(y0 / TILE); gy * TILE < y0 + W; gy++) {
      const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, c = gx - Math.floor(gx / 4) * 4, r = gy - Math.floor(gy / 4) * 4;
      let suf = '', dim = false;
      if (lvZ != null && typeof window.ugLayer === 'function') { try { suf = window.ugLayer(RX, RY, lvZ, (gx + 0.5) * TILE, (gy + 0.5) * TILE) || ''; } catch (e) { suf = ''; } dim = !suf; }
      else { const lay = ED.layer || 0, has = lay && ((ED.d.layers || {})[`${RX}_${RY}`] || []).includes(lay); suf = has ? '_L' + lay : ''; dim = !!(lay && !has); }
      t += `<image href="/minitile/${RX}_${RY}${suf}_${c}_${r}.jpg" x="${gx * TILE}" y="${gy * TILE}" width="${TILE}" height="${TILE}" preserveAspectRatio="none"${dim ? ' opacity="0.22"' : ''}/>`;
    }
    const lab = (x, y, s, col, size) => `<text x="${x}" y="${y}" font-size="${(size || 9) * u}" fill="${col || '#fff'}" paint-order="stroke" stroke="#000" stroke-width="${3 * u}" stroke-linejoin="round">${E(s)}</text>`;
    const portal = (s, own) => { const N = s.npc; if (!N || !isFinite(N.x) || (ED.level && lvlKey(N) !== ED.level && (s.dungeonKey + ':' + s.floor) !== ED.level)) return '';
      return `<circle cx="${N.x}" cy="${N.y}" r="${9 * u}" fill="none" stroke="#cc66ff" stroke-width="${2.4 * u}"${own ? '' : ` stroke-dasharray="${3 * u} ${2 * u}"`}/><circle cx="${N.x}" cy="${N.y}" r="${4 * u}" fill="${own ? '#ffd34d' : '#3ee0ff'}" stroke="#000" stroke-width="${u}"/>` + lab(N.x + 11 * u, N.y - 7 * u, '⇩ ' + (s.floorName || 'floor') + ' (' + (N.name || '') + ')', '#e3b3ff', 9); };
    let g = '';
    const A = atlasPts();
    { let run = []; const flush = () => { if (run.length > 1) { const pl = run.map(p => p.x + ',' + p.y).join(' '); g += `<polyline points="${pl}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="${3.6 * u}"/><polyline points="${pl}" fill="none" stroke="#3ee0ff" stroke-width="${2 * u}" stroke-dasharray="${7 * u} ${4.5 * u}" stroke-linecap="round"/>`; } run = []; };
      A.forEach(p => { if (isStep(p)) { flush(); g += portal(p, false); return; } if (onLvl(p)) run.push(p); else flush(); }); flush(); }
    const P = ED.pts, fc = floorCheck(P, ED.floorOk);
    for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i]; if (isStep(a) || isStep(b) || !onLvl(a) || !onLvl(b)) continue; const bad = !fc.ok && fc.i === i;
      g += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${bad ? '#ff4d4d' : b.swim ? '#5aa9ff' : '#ffd34d'}" stroke-width="${(bad ? 3.4 : 2.4) * u}" stroke-linecap="round"${b.swim || bad ? ` stroke-dasharray="${3 * u} ${2 * u}"` : ''}/>`; }
    P.forEach(p => { if (isStep(p)) g += portal(p, true); });
    const L = landing(); if (L && onLvl(L)) g += `<rect x="${L.x - 7 * u}" y="${L.y - 7 * u}" width="${14 * u}" height="${14 * u}" fill="#44ee66" stroke="#000" stroke-width="${u}"/>` + lab(L.x + 10 * u, L.y - 8 * u, L.t || 'landing', 9, '#7be0a0');
    const T = targetPt(); if (T && onLvl(T)) g += `<circle cx="${T.x}" cy="${T.y}" r="${9 * u}" fill="#f0c040" stroke="#000" stroke-width="${1.2 * u}"/>` + lab(T.x + 12 * u, T.y + 4 * u, T.name || 'target', 10, '#f0c040');
    P.forEach((p, i) => {
      if (isStep(p) || !onLvl(p)) return;
      const s = i === ED.sel, dim = !ED.level && (p.layer || 0) !== (ED.layer || 0) && !s, bad = !fc.ok && (fc.i === i || fc.prevI === i);
      g += `<circle data-i="${i}" cx="${p.x}" cy="${p.y}" r="${(s ? 6 : 3.4) * u}" fill="${s ? '#ff5a45' : bad ? '#ff4d4d' : p.swim ? '#5aa9ff' : '#fff'}" fill-opacity="${dim ? .35 : 1}" stroke="#000" stroke-width="${.9 * u}" style="cursor:pointer"/>`;
      if (s || bad || i === 0 || i === P.length - 1 || (i + 1) % 5 === 0) g += lab(p.x + 6 * u, p.y - 5 * u, String(i + 1), 8, s ? '#ff5a45' : bad ? '#ff8a80' : '#fff');
    });
    chars().filter(c => isFinite(c.x) && c.ageSec <= 60 && c.x > x0 && c.x < x0 + W && c.y > y0 && c.y < y0 + W && (!ED.level || lvlKey(c) === ED.level)).forEach(c => { const col = typeof partyColor === 'function' ? partyColor(c.party) : '#9cf'; g += `<circle cx="${c.x}" cy="${c.y}" r="${4 * u}" fill="${col}" stroke="#fff" stroke-width="${u}"/>` + lab(c.x + 6 * u, c.y + 4 * u, c.name, 8); });
    return `<div class="re-map"><svg id="reSvg" viewBox="${x0} ${y0} ${W} ${W}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="route map: tap to add a point"><rect x="${x0}" y="${y0}" width="${W}" height="${W}" fill="#0d2a33"/>${t}${g}</svg>
      <div class="rv-zoom"><button type="button" data-re="zin" aria-label="zoom in">+</button><button type="button" data-re="zout" aria-label="zoom out">−</button><button type="button" data-re="fit" aria-label="show all">⤢</button></div></div>
      <div class="rv-legend"><span><i style="background:#3ee0ff"></i>computed path (nav atlas)</span><span><i style="background:#ffd34d"></i>your own route</span><span><i style="background:#5aa9ff"></i>swim leg (slow)</span><span><i style="background:#44ee66"></i>start landing</span><span><i style="background:#f0c040"></i>target</span><span><i style="background:#ff5a45"></i>selected point</span><span><i style="background:#cc66ff"></i>dungeon step (teleporter)</span><span><i style="background:#ff4d4d"></i>jumps floors (not walkable)</span></div>`;
  }
  // ------------------------------------------------------------------------------------------------ page
  function startHtml() {
    const d = ED.d, st = ED.start, kind = st ? st.kind : 'none';
    const gk = (d.gkStarts || []).slice(); if (st && st.kind === 'gk' && st.desc && !gk.includes(st.desc)) gk.unshift(st.desc);
    const groups = {}; gk.forEach(s => { const t = s.includes('->') ? s.split('->')[0].trim() : 'other'; (groups[t] = groups[t] || []).push(s); });
    const gsel = `<select data-re="gk" aria-label="gatekeeper teleport"><option value="">pick a teleport …</option>${Object.keys(groups).sort().map(t => `<optgroup label="${E(t)}">${groups[t].sort().map(s => `<option value="${E(s)}"${st && st.desc === s ? ' selected' : ''}>${E(s.split('->').slice(1).join('->').trim() || s)}</option>`).join('')}</optgroup>`).join('')}</select>`;
    const tsel = `<select data-re="town" aria-label="town">${Object.keys(d.towns || {}).map(t => `<option${st && st.town === t ? ' selected' : ''}>${E(t)}</option>`).join('')}</select>`;
    return `<div class="re-row"><b>Start:</b><select data-re="startkind" aria-label="how the trip starts"><option value="gk"${kind === 'gk' ? ' selected' : ''}>gatekeeper teleport</option><option value="town"${kind === 'town' ? ' selected' : ''}>.townname</option><option value="none"${kind === 'none' ? ' selected' : ''}>none (from where the normal way in ends)</option></select>
      ${kind === 'gk' ? gsel : kind === 'town' ? tsel : ''}<span class="muted">${kind === 'none' ? (ED.type === 'room' ? 'room: the bots take the normal way into the dungeon, then walk these points' : 'the bots get near point 1 the normal way, then walk the points') : 'the whole team goes to the start, then every member walks each point'}</span></div>`;
  }
  // DUNGEON STEPS (2026-10-13): the dungeon steps UI — teleporter floors of dungeon_rooms.json, the jump warning + one-tap fix, level tabs, step rows
  function stepOptions() { const out = []; ((ED.d && ED.d.dungeons) || []).forEach(d => d.floors.forEach(F => { if (F.how === 'teleporter' && F.npc) out.push({ v: d.key + ':' + F.i, t: d.name + ' — ' + F.name + ' (via ' + F.npc.name + ')', d, F }); })); return out; }
  function stepFor(v) { const o = stepOptions().find(x => x.v === v); if (!o) return null; return { do: 'floor', dungeon: o.d.name, dungeonKey: o.d.key, floor: o.F.i, floorName: o.F.name, npc: o.F.npc, link: o.F.link || null, landing: o.F.landing || null }; }
  /** the dungeon step that would fix a jump: the floor the lower point lies on (a teleporter floor), else the first teleporter floor of that dungeon */
  function guessStep(P, fc) {
    if (!fc || fc.ok) { const T = targetPt(), k = T ? lvlKey(T) : ''; return k && k !== 'surface' && stepFor(k) ? k : ''; }
    const a = P[fc.prevI], b = P[fc.i], low = a.z < b.z ? a : b, k = lvlKey(low);
    if (k !== 'surface' && stepFor(k)) return k;
    const dk = k !== 'surface' ? k.split(':')[0] : ''; const o = stepOptions().find(x => x.d.key === dk); return o ? o.v : '';
  }
  function dungeonHtml() {
    const P = ED.pts, fc = floorCheck(P, ED.floorOk), opts = stepOptions(), g = guessStep(P, fc), sel = ED.stepSel || g, gs = g ? stepFor(g) : null;
    const fix = gs ? ' <button type="button" data-re="fixjump">Fix: ' + E(gs.npc.name + ' → ' + gs.dungeon + ' ' + gs.floorName) + ' between points ' + (fc.at - 1) + ' and ' + fc.at + '</button>' : '';
    const warn = fc.ok ? '' : '<div class="rv-invalid" role="alert">⚠ Not walkable: ' + E(fc.why) + '. The bots take the computed path until this is fixed: insert the dungeon step (the teleporter into the dungeon / to that floor) between those points' + (gs ? '' : ' — no teleporter floor is known there; if it is a real drop or ledge, tick “drop” on point ' + fc.at) + '.' + fix + '</div>';
    const os = opts.map(o => '<option value="' + E(o.v) + '"' + (o.v === sel ? ' selected' : '') + '>' + E(o.t) + '</option>').join('');
    return warn + '<div class="re-row re-step"><b>Dungeon step:</b><select data-re="stepsel" aria-label="dungeon floor teleporter"><option value="">pick a dungeon floor …</option>' + os + '</select>' +
      '<button type="button" data-re="addstep"' + (sel ? '' : ' disabled') + '>Insert after point ' + (ED.sel + 1) + '</button><span class="muted">the team walks to the NPC, talks to it (its floor link) and lands on that floor; the points after the step lie on that floor</span></div>';
  }
  function levelTabs() {
    const L = levelList(); if (!L.length) return '';
    return '<div class="rv-levels" role="tablist" aria-label="map level"><button type="button" role="tab" data-re="lvl" data-k="" class="' + (!ED.level ? 'on' : '') + '">all</button>' +
      L.map(l => '<button type="button" role="tab" data-re="lvl" data-k="' + E(l.key) + '" class="' + (ED.level === l.key ? 'on' : '') + '" aria-selected="' + (ED.level === l.key) + '">' + E(l.name) + '</button>').join('') + '</div>';
  }
  function stepRow(p, i) {
    return '<tr data-row="' + i + '" class="re-steprow ' + (i === ED.sel ? 'nextpick' : '') + '"><td>⇩</td><td colspan="6"><b>' + E(p.npc ? p.npc.name : 'teleporter') + '</b>' + (p.link ? ' "' + E(p.link) + '"' : '') + ' → <b>' + E(p.dungeon || '') + ' ' + E(p.floorName || '') + '</b>' +
      (p.landing ? ' <span class="muted">(lands ' + p.landing.map(Math.round).join(', ') + ')</span>' : '') + '</td><td class="re-acts"><button type="button" data-mv="up" data-i="' + i + '" aria-label="move up">↑</button><button type="button" data-mv="dn" data-i="' + i + '" aria-label="move down">↓</button><button type="button" data-mv="del" data-i="' + i + '" aria-label="remove">✕</button></td></tr>';
  }
  function render() {
    const box = $id('reBox'); if (!box || !ED || !ED.d) return;
    const d = ED.d, r = d.route, P = ED.pts, ch = d.choice || {};
    const online = chars().filter(c => c.ageSec <= 60 && isFinite(c.x)).map(c => c.name);
    const A = d.target && d.target.atlas;
    const layers = new Set(); P.forEach(p => { if (p.layer) layers.add(p.layer); });
    if (Object.keys(d.layers || {}).length) {                         // dungeon / floor maps of the regions in view (Maps/<X>_<Y>_<n>.jpg)
      const v = ED.view || (ED.view = fitView());
      for (let rx = Math.floor((v.cx - v.R) / 32768) + 20; rx <= Math.floor((v.cx + v.R) / 32768) + 20; rx++) for (let ry = Math.floor((v.cy - v.R) / 32768) + 18; ry <= Math.floor((v.cy + v.R) / 32768) + 18; ry++) ((d.layers || {})[rx + '_' + ry] || []).forEach(n => layers.add(n));
    }
    box.className = '';
    box.innerHTML = `<div class="re-status">${r ? `${r.manual ? '<span class="fit good">locked</span>' : '<span class="muted">saved, not locked</span>'} · ${(r.points || []).length} points · ${KM(r.length || lenOf(r.points || []))}${r.uses ? ' · used ' + r.uses + '×' : ''}${r.fails ? ' · <span class="st-dead">failed ' + r.fails + '×' + (r.lastFailWhy ? ' (' + E(r.lastFailWhy) + ')' : '') + '</span>' : ''}${r.editedAt ? ' · edited ' + new Date(r.editedAt).toLocaleString() : ''}` : '<span class="st-dead">no own route saved yet</span>'} · the bots use now: <b>${ch.use === 'custom' ? 'your own route' : 'the computed path'}</b> <span class="muted">(${E(ch.why || '')})</span></div>
      ${ED.msg ? `<div class="re-msg">${E(ED.msg)}</div>` : ''}
      ${A && A.note ? `<div class="muted">${E(A.note)}</div>` : ''}
      ${startHtml()}
      ${dungeonHtml()}
      <div class="re-row"><span class="muted">${plainOf(P).length} points${P.length - plainOf(P).length ? ' + ' + (P.length - plainOf(P).length) + ' dungeon step(s)' : ''} · ${KM(lenOf(P))} on foot${ED.dirty ? ' · <b class="re-dirty">unsaved changes</b>' : ''}</span>
        ${layers.size ? `<label>Map <select data-re="layer"><option value="0">world (outside)</option>${[...layers].sort().map(n => `<option value="${n}"${ED.layer === n ? ' selected' : ''}>dungeon / floor ${n}</option>`).join('')}</select></label>` : ''}
        ${A && (A.prefill || []).length > 1 ? `<button type="button" data-re="useatlas">Start from the computed path</button>` : ''}${targetPt() ? '<button type="button" data-re="addtarget">Target = last point</button>' : ''}${landing() ? '<button type="button" data-re="addland">Landing = point 1</button>' : ''}</div>
      ${levelTabs()}${mapSvg()}
      <div class="re-row"><select data-re="char" aria-label="character">${online.map(n => `<option${ED.rec && ED.rec.name === n ? ' selected' : ''}>${E(n)}</option>`).join('') || '<option value="">no character online</option>'}</select>
        <button type="button" data-re="here">+ its position</button>
        <button type="button" data-re="rec" class="${ED.rec ? 'on' : ''}">${ED.rec ? '■ Stop recording ' + E(ED.rec.name) : '● Record its walk'}</button></div>
      <div class="re-row re-save"><button type="button" data-re="save" class="go">Save &amp; lock</button><button type="button" data-re="saveopen">Save unlocked</button>
        ${r ? `<button type="button" data-re="lock">${r.manual ? 'Unlock' : 'Lock'}</button><button type="button" data-re="del" class="danger">Delete route</button>` : ''}<button type="button" data-re="undo">Undo changes</button></div>
      <div class="re-tbl"><table class="l2"><thead><tr><th>#</th><th>x</th><th>y</th><th>z</th><th title="this leg is water: the bots allow the slower swim speed">swim</th><th title="a real drop / ledge: the height jump to this point is wanted (not a missing dungeon step)">drop</th><th>leg</th><th></th></tr></thead><tbody>${P.map((p, i) => isStep(p) ? stepRow(p, i) : `<tr data-row="${i}" class="${i === ED.sel ? 'nextpick' : ''}"><td>${i + 1}</td>${['x', 'y', 'z'].map(k => `<td><input class="re-in" data-i="${i}" data-k="${k}" type="number" inputmode="numeric" value="${p[k]}" aria-label="point ${i + 1} ${k}"></td>`).join('')}<td><input type="checkbox" data-swim="${i}"${p.swim ? ' checked' : ''} aria-label="point ${i + 1} swim leg"></td><td><input type="checkbox" data-drop="${i}"${p.drop ? ' checked' : ''} aria-label="point ${i + 1} real drop"></td><td class="muted">${i && !isStep(P[i - 1]) ? KM(Math.hypot(p.x - P[i - 1].x, p.y - P[i - 1].y)) + (Math.abs(p.z - P[i - 1].z) > 1500 ? ' <b class="re-bad">Δz ' + Math.round(p.z - P[i - 1].z) + '</b>' : '') : i ? 'after the step' : 'start'}${p.layer ? ' · floor ' + p.layer : ''}</td><td class="re-acts"><button type="button" data-mv="up" data-i="${i}" aria-label="move up">↑</button><button type="button" data-mv="dn" data-i="${i}" aria-label="move down">↓</button><button type="button" data-mv="ins" data-i="${i}" aria-label="insert after">+</button><button type="button" data-mv="del" data-i="${i}" aria-label="remove">✕</button></td></tr>`).join('')}</tbody></table></div>
      <details class="re-paste"><summary>Paste coordinates</summary><div class="muted">One point per line: <code>x y z</code>, <code>x, y, z</code> or a <code>/loc</code> line ("Current location : -12345, 67890, -3456").</div>
        <textarea id="rePaste" rows="5"></textarea><div class="re-row"><button type="button" data-re="pasterep">Replace the route with these</button><button type="button" data-re="pasteadd">Add after the selected point</button></div></details>`;
    bindMap();
  }
  function set(fn, msg) { ED.msg = msg || ''; fn(); ED.dirty = true; render(); }
  function bindMap() {
    const svg = $id('reSvg'); if (!svg) return;
    const toW = (cx, cy) => { const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
    let drag = null;
    svg.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, cx: ED.view.cx, cy: ED.view.cy, moved: false }; try { svg.setPointerCapture(e.pointerId); } catch (er) { } };
    svg.onpointermove = (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved) { const k = (2 * ED.view.R) / svg.getBoundingClientRect().width; ED.view.cx = drag.cx - dx * k; ED.view.cy = drag.cy - dy * k; svg.setAttribute('viewBox', `${ED.view.cx - ED.view.R} ${ED.view.cy - ED.view.R} ${2 * ED.view.R} ${2 * ED.view.R}`); } };
    svg.onpointerup = (e) => {
      const d = drag; drag = null; if (!d) return;
      if (d.moved) { render(); return; }
      const el = document.elementFromPoint(e.clientX, e.clientY), hit = el && el.closest && el.closest('circle[data-i]');
      if (hit) { ED.sel = +hit.dataset.i; ED.layer = ED.pts[ED.sel].layer || 0; render(); return; }
      const m = toW(e.clientX, e.clientY), lvF = ED.level && ED.level !== 'surface' ? levelList().find(l => l.key === ED.level) : null;   // DUNGEON STEPS: a tap on a floor map = a point on that floor
      let base = plainOf(ED.pts.slice(0, ED.sel + 1)).pop() || plainOf(ED.pts).pop() || targetPt() || { z: 0 }; if (lvF && lvF.z && lvlKey(base) !== ED.level) base = { z: Math.round((lvF.z[0] + lvF.z[1]) / 2) };
      set(() => { const p = { x: Math.round(m.x), y: Math.round(m.y), z: Math.round(base.z || 0) }; if (ED.layer) p.layer = ED.layer; ED.pts.splice(ED.sel + 1, 0, p); ED.sel++; }, `added point ${ED.sel + 2} — check its z in the list`);
    };
    svg.onwheel = (e) => { e.preventDefault(); const f = e.deltaY > 0 ? 1.25 : 0.8, m = toW(e.clientX, e.clientY), v = ED.view, R2 = Math.min(90000, Math.max(400, v.R * f)), k = R2 / v.R; ED.view = { cx: m.x + (v.cx - m.x) * k, cy: m.y + (v.cy - m.y) * k, R: R2 }; render(); };
  }
  // ------------------------------------------------------------------------------------------------ actions
  function stopRec() { if (!ED || !ED.rec) return; clearInterval(ED.rec.timer); hold(ED.rec.name, false); ED.rec = null; }
  function startRec(name) {
    const rec = { name, n: 0 }; hold(name, true);
    rec.timer = setInterval(() => {
      if (!ED || ED.rec !== rec || !OPEN) { clearInterval(rec.timer); hold(name, false); return; }
      hold(name, true);
      const c = chars().find(x => x.name === name); if (!c || c.ageSec > 20 || !isFinite(c.x)) return;
      const last = ED.pts[ED.sel] || ED.pts[ED.pts.length - 1];
      if (last && Math.hypot(c.x - last.x, c.y - last.y) < 250 && Math.abs((c.z || 0) - (last.z || 0)) < 150) return;
      const p = { x: Math.round(c.x), y: Math.round(c.y), z: Math.round(isFinite(c.z) ? c.z : (last || {}).z || 0) }; if (ED.layer) p.layer = ED.layer;
      ED.pts.splice(ED.sel + 1, 0, p); ED.sel++; rec.n++; ED.dirty = true; ED.msg = `recording ${name}: ${rec.n} points`; render();
    }, 2000);
    ED.rec = rec; ED.msg = `recording ${name} — walk it in the game; a point every ~250 units. ${name} does not attack anything while recording`; render();
  }
  const parse = () => String(($id('rePaste') || {}).value || '').split(/\r?\n/).map(l => (l.match(/-?\d+/g) || []).map(Number)).filter(n => n.length >= 3).map(n => ({ x: n[0], y: n[1], z: n[2] }));
  async function post(body) {
    let d; try { d = await call('/api/route', { method: 'POST', body: JSON.stringify(Object.assign({ type: ED.type, id: ED.id }, body)) }); } catch (e) { d = { error: e.message }; }
    if (!d || d.error) { errorBox((d && d.error) || 'no answer'); return null; }
    return d;
  }
  async function save(manual) {
    if (plainOf(ED.pts).length < 2) { alertBox('Route too short', 'A route needs at least 2 points.'); return; }
    if (ED.start && ED.start.kind === 'gk' && !/->/.test(ED.start.desc || '')) { alertBox('No teleport picked', 'Pick the gatekeeper teleport, or set the start to ".townname" or "none".'); return; }
    stopRec();
    const st = ED.start && ED.start.kind ? ED.start : null;
    const d = await post({ points: ED.pts, start: st, landing: st ? (st.kind === 'town' ? '.' + String(st.town).toLowerCase() : st.desc) : ((ED.d.landingDefault && ED.d.landingDefault.desc) || 'none'), manual });
    if (!d) return;
    fill(d); ED.msg = d.msg || 'saved'; render();
    if (window.RouteView) RouteView.refresh($id('reRv'));
  }
  async function onClick(e) {
    if (!ED) return;
    const b = e.target.closest('[data-re],[data-mv]'); if (!b || b.disabled) return;
    const a = b.dataset.re, mv = b.dataset.mv, P = ED.pts;
    if (mv) { const i = +b.dataset.i;
      if (mv === 'up' && i > 0) set(() => { [P[i - 1], P[i]] = [P[i], P[i - 1]]; ED.sel = i - 1; });
      else if (mv === 'dn' && i < P.length - 1) set(() => { [P[i + 1], P[i]] = [P[i], P[i + 1]]; ED.sel = i + 1; });
      else if (mv === 'ins' && !isStep(P[i])) { const p = P[i], q = (P[i + 1] && !isStep(P[i + 1])) ? P[i + 1] : p; set(() => { P.splice(i + 1, 0, { x: Math.round((p.x + q.x) / 2) + (q === p ? 200 : 0), y: Math.round((p.y + q.y) / 2), z: Math.round((p.z + q.z) / 2) }); ED.sel = i + 1; }); }
      else if (mv === 'del') set(() => { P.splice(i, 1); ED.sel = Math.min(i, P.length - 1); });
      return; }
    if (a === 'back') { if (history.length > 1) history.back(); else location.hash = '#/navatlas'; return; }
    if (a === 'zin' || a === 'zout') { ED.view.R = Math.min(90000, Math.max(400, ED.view.R * (a === 'zin' ? 0.6 : 1.7))); render(); return; }
    if (a === 'fit') { ED.view = fitView(); render(); return; }
    if (a === 'lvl') { ED.level = b.dataset.k || ''; ED.view = null; render(); return; }   // DUNGEON STEPS: surface / floor map
    if (a === 'addstep' || a === 'fixjump') {   // DUNGEON STEPS: walk to the NPC (a point at it), the step, its landing (a point on the floor)
      const fc = floorCheck(P, ED.floorOk), v = a === 'fixjump' ? guessStep(P, fc) : (ED.stepSel || guessStep(P, fc)), st = stepFor(v); if (!st) return;
      const at = a === 'fixjump' && !fc.ok ? fc.i : ED.sel + 1, prev = plainOf(P.slice(0, at)).pop(), next = P[at] && !isStep(P[at]) ? P[at] : null, add = [];
      if (st.npc && (!prev || Math.hypot(prev.x - st.npc.x, prev.y - st.npc.y) > 200)) add.push({ x: Math.round(st.npc.x), y: Math.round(st.npc.y), z: Math.round(st.npc.z) });
      add.push(st);
      if (Array.isArray(st.landing) && (!next || Math.hypot(next.x - st.landing[0], next.y - st.landing[1]) > 200)) add.push({ x: Math.round(st.landing[0]), y: Math.round(st.landing[1]), z: Math.round(st.landing[2]) });
      set(() => { P.splice(at, 0, ...add); ED.sel = at + add.length - 1; ED.level = st.dungeonKey + ':' + st.floor; ED.view = null; }, 'dungeon step inserted: walk to ' + (st.npc ? st.npc.name : 'the NPC') + ', talk (' + (st.link || 'its floor link') + '), land on ' + st.dungeon + ' ' + st.floorName + ' — the map shows that floor now; check the points after it, then Save');
      return;
    }
    if (a === 'useatlas') { const A = ED.d.target.atlas; if (P.length && !(await confirmBox({ title: 'Replace your points?', body: `Replace the ${P.length} points with the ${A.prefill.length} points of the computed path (its walk after the last teleport)?`, confirmText: 'Use computed path' }))) return;
      set(() => { ED.pts = A.prefill.map(p => isStep(p) ? Object.assign({}, p) : ({ x: p.x, y: p.y, z: p.z })); ED.sel = ED.pts.length - 1; if (!ED.start && A.start) ED.start = A.start; ED.view = null; }, 'the computed walk is in the list — correct it (move / add / remove points), then Save'); return; }
    if (a === 'addtarget') { const T = targetPt(); set(() => { P.push({ x: Math.round(T.x), y: Math.round(T.y), z: Math.round(T.z) }); ED.sel = P.length - 1; }, 'the target is the last point'); return; }
    if (a === 'addland') { const L = landing(); set(() => { P.unshift({ x: Math.round(L.x), y: Math.round(L.y), z: Math.round(L.z || 0) }); ED.sel = 0; }, 'the landing is point 1'); return; }
    if (a === 'here') { const c = chars().find(x => x.name === ($id(SEC).querySelector('[data-re="char"]') || {}).value); if (!c) return; set(() => { const p = { x: Math.round(c.x), y: Math.round(c.y), z: Math.round(isFinite(c.z) ? c.z : 0) }; if (ED.layer) p.layer = ED.layer; P.splice(ED.sel + 1, 0, p); ED.sel++; }, `added ${c.name}'s position`); return; }
    if (a === 'rec') { if (ED.rec) { const n = ED.rec.n, nm = ED.rec.name; stopRec(); ED.msg = `recording stopped (${n} points added) — check them and Save; ${nm} may fight again`; render(); return; } const nm = ($id(SEC).querySelector('[data-re="char"]') || {}).value; if (nm) startRec(nm); return; }
    if (a === 'save') return void save(true);
    if (a === 'saveopen') return void save(false);
    if (a === 'lock') { const r = ED.d.route; const d = await post({ action: r.manual ? 'unlock' : 'lock' }); if (d) { fill(d); ED.msg = d.msg || ''; render(); if (window.RouteView) RouteView.refresh($id('reRv')); } return; }
    if (a === 'del') { if (!(await confirmBox({ title: 'Delete your own route?', body: ['The bots then use the computed path for this target.', typeof uiNote === 'function' ? uiNote('The old version is kept in the history folder.') : ''].filter(Boolean), confirmText: 'Delete route', danger: true }))) return;
      const d = await post({ action: 'delete' }); if (d) { fill(d); ED.msg = d.msg || 'deleted'; render(); if (window.RouteView) RouteView.refresh($id('reRv')); } return; }
    if (a === 'undo') { if (!ED.dirty || await confirmBox({ title: 'Throw away the unsaved changes?', body: 'The route is reloaded from the file.', confirmText: 'Throw away', danger: true })) { stopRec(); reload(false); } return; }
    if (a === 'pasterep') { const p = parse(); if (p.length < 2) { alertBox('Nothing to paste', 'Need at least 2 lines with x y z.'); return; } if (await confirmBox({ title: 'Replace the route?', body: `Replace all ${P.length} points with the ${p.length} pasted ones?`, confirmText: 'Replace points' })) set(() => { ED.pts = p; ED.sel = p.length - 1; ED.view = null; }); return; }
    if (a === 'pasteadd') { const p = parse(); if (!p.length) { alertBox('Nothing to paste', 'No x y z found.'); return; } set(() => { P.splice(ED.sel + 1, 0, ...p); ED.sel += p.length; }); return; }
  }
  function onChange(e) {
    if (!ED) return;
    const t = e.target, a = t.dataset && t.dataset.re;
    if (t.classList.contains('re-in')) { const v = Math.round(+t.value); if (Number.isFinite(v)) set(() => { ED.pts[+t.dataset.i][t.dataset.k] = v; ED.sel = +t.dataset.i; }); return; }
    if (t.dataset && t.dataset.swim != null) { const i = +t.dataset.swim; set(() => { if (t.checked) ED.pts[i].swim = true; else delete ED.pts[i].swim; ED.sel = i; }, t.checked ? `point ${i + 1}: the leg to it is water (the bots allow the swim speed)` : ''); return; }
    if (a === 'startkind') { const k = t.value; set(() => { ED.start = k === 'town' ? { kind: 'town', town: (ED.start && ED.start.town) || Object.keys(ED.d.towns || {})[0] || 'Giran' } : k === 'gk' ? { kind: 'gk', desc: (ED.start && ED.start.desc) || ((ED.d.target && ED.d.target.atlas && ED.d.target.atlas.start && ED.d.target.atlas.start.desc) || '') } : null; }); return; }
    if (a === 'gk') { const v = t.value; set(() => { ED.start = v ? { kind: 'gk', desc: v, from: v.split('->')[0].trim() } : { kind: 'gk', desc: '' }; ED.view = null; }, v && ED.d.gkLand && ED.d.gkLand[v] ? 'the landing of ' + v + ' is on the map (green) — "Landing = point 1" puts it into the route' : ''); return; }
    if (a === 'town') { set(() => { ED.start = { kind: 'town', town: t.value }; ED.view = null; }); return; }
    if (a === 'layer') { ED.layer = +t.value; render(); return; }
    if (a === 'stepsel') { ED.stepSel = t.value; render(); return; }   // DUNGEON STEPS
    if (t.dataset && t.dataset.drop != null) { const i = +t.dataset.drop; set(() => { if (t.checked) ED.pts[i].drop = true; else delete ED.pts[i].drop; ED.sel = i; }, t.checked ? 'point ' + (i + 1) + ': the height jump to it is a real drop / ledge (not a missing dungeon step)' : ''); return; }
  }
  // ------------------------------------------------------------------------------------------------ routing
  function route(kind, arg) {
    if (kind !== 'routeedit') { if (OPEN) { OPEN = false; stopRec(); const s = $id(SEC); if (s) s.hidden = true; } return false; }
    const parts = location.hash.replace(/^#\/?/, '').split('/'), type = decodeURIComponent(parts[1] || ''), id = decodeURIComponent(parts[2] || '');
    const s = section();
    try { if (document.getElementById('spotov') && typeof closeSpotPicker === 'function') closeSpotPicker(); } catch (e) { }   // opened from the area / room picker
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; OPEN = true; window.scrollTo(0, 0);
    if (!type || !id || !TYPES[type]) { $id('reHead').innerHTML = '<div class="re-head"><h2>Own route</h2></div>'; $id('reBox').innerHTML = '<div class="rv-box none">Open a target first: the route view of a raid boss, NPC, quest step, field area, room or epic boss has "Record / draw my own route".</div>'; $id('reRv').innerHTML = ''; return true; }
    if (!ED || ED.type !== type || ED.id !== id || !ED.d) load(type, id); else render();
    return true;
  }
  window.RouteEditPage = { route, version: '2026-10-13', _rvTarget: rvTarget };
})();
