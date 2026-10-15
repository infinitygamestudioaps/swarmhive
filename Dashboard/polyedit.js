// SHAPE EDITOR "POLYEDIT" (user 2026-10-08 22:50: "Under /rooms, /spots and /zones it should be possible for me to edit each thing, so I can
// drag or change the zone to my fitting"). Full-screen map editor for one shape at a time, iPhone (touch) and desktop (mouse):
//   #/edit/room/<room id>     a dungeon room outline (Scripts/data/dungeon_rooms.json), on the dungeon floor map art
//   #/edit/zone/<zone name>   a hunting zone / spot of the Spots + Zones tabs (custom_zones.json)
//   #/edit/spot/<index>       a datapack hunting spot (hunting_spots_h5.json, the bots' fallback list)
//   #/edit/area/<id>          a field area (field_areas.json, when that file exists)
// Drag a point = move it · drag the small + on an edge = new point there (tap = insert) · double-tap / long-press a point = delete it
// (min 3) · "Move shape" mode: drag anywhere = move the whole shape · rooms: drag the red centre · circles: centre + radius handle,
// "Make polygon" converts · two fingers = pinch-zoom / pan, wheel = zoom, drag the empty map = pan · Ctrl+Z / Ctrl+Y.
// Context: the other rooms / zones / spots faintly, monsters (datapack spawns, coloured by level), safe spots, walk-in route.
// Live numbers: area, monsters inside by level, % of its own monsters inside, monsters of other rooms inside, geodata warnings.
// Server: Dashboard/polyedit_api.js (GET/POST /api/polyedit). Loaded by index.html after its main script (uses MT, ugLayer, go, navDepth,
// esc, KEY, STATE when present); index.html's route() calls PolyEdit.open(hash) for #/edit/... and PolyEdit.close() otherwise.
(function () {
  'use strict';
  const TILE = 8192;
  const coarse = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const $p = (id) => document.getElementById(id);
  const H = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const r0 = Math.round, clone = (o) => JSON.parse(JSON.stringify(o));
  const key = () => { try { return KEY || ''; } catch (e) { return ''; } };
  const NEEDS_RESTART = 'The dashboard server does not know the shape editor yet — it needs a restart (Dashboard/server.js).';
  async function call(u, o = {}) {
    let r; try { r = await fetch(u, { ...o, headers: { ...(o.headers || {}), 'x-key': key(), 'Content-Type': 'application/json' } }); }
    catch (e) { return { status: 0, body: { error: 'dashboard not reachable: ' + e.message } }; }
    const t = await r.text(); let b;
    try { b = JSON.parse(t); } catch (e) { b = { error: r.status === 404 || r.status === 401 ? NEEDS_RESTART : t.slice(0, 200) }; }
    return { status: r.status, body: b || {} };
  }
  const KIND_LABEL = { room: 'Dungeon room', zone: 'Hunting zone', spot: 'Datapack spot', area: 'Field area', raidarea: 'Raid fight area' };
  const RETURN = { room: '#/rooms', zone: '#/zones', spot: '#/spots', area: '#/zones', raidarea: '#/raids' };

  // ------------------------------------------------------------------------------------------------ geometry
  const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
  function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  const orient = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const onSeg = (a, b, c) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
  function segX(a, b, c, d) { const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b); if (o1 !== o2 && o3 !== o4) return true; return (o1 === 0 && onSeg(a, b, c)) || (o2 === 0 && onSeg(a, b, d)) || (o3 === 0 && onSeg(c, d, a)) || (o4 === 0 && onSeg(c, d, b)); }
  function selfX(P) { const n = P.length, bad = new Set(); for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (j === i + 1 || (i === 0 && j === n - 1)) continue; if (segX(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) { bad.add(i); bad.add(j); } } return bad; }
  function hull(pts) {
    const p = pts.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    p.forEach(q => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function padPoly(P, d) {   // push every corner d away from the middle (like spots.js)
    const cx = P.reduce((t, p) => t + p[0], 0) / P.length, cy = P.reduce((t, p) => t + p[1], 0) / P.length;
    return P.map(([x, y]) => { const L = Math.hypot(x - cx, y - cy) || 1; return [r0(x + (x - cx) / L * d), r0(y + (y - cy) / L * d)]; });
  }
  const circlePoly = (x, y, R, n = 12) => Array.from({ length: n }, (_, k) => [r0(x + R * Math.cos(-Math.PI / 2 + k * 2 * Math.PI / n)), r0(y + R * Math.sin(-Math.PI / 2 + k * 2 * Math.PI / n))]);
  const effSide = (R) => Math.max((+R || 3000) * 3, 9000);
  function distToPoly(x, y, P) { let best = Infinity; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], dx = q[0] - p[0], dy = q[1] - p[1], L = dx * dx + dy * dy; let t = L ? ((x - p[0]) * dx + (y - p[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); best = Math.min(best, Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy)); } return best; }
  function distToSeg(x, y, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); }

  // ------------------------------------------------------------------------------------------------ RAID FIGHT AREA (kind 'raidarea', 2026-10-09)
  // User 2026-10-09 10:40: "it is clearing a HUGE area before the raid actually starts. I want to be able to select the raid 'area' where
  // they should fight." One item = the boss's fight area (polygon, the main shape) + an optional own clear area + the staging point.
  // While the CLEAR layer is edited, item.poly is the clear polygon and item.fightPoly the fight polygon (swapped back on "Fight area").
  // The clear rule mirrors swarm.js RAIDAREA-PURE raidClearWanted: aggressive monsters inside the clear area, passive ones only inside the
  // fight area or on the stage -> boss path (within 400), all of them with "also passive"; no area = aggressive within 1200 of the boss.
  const RA_COL = { fight: '#ff7043', clear: '#ffd34d', stage: '#5ad1ff', route: '#e8e8e8' };
  const isRa = () => S.kind === 'raidarea';
  const raFight = (it) => it.layer === 'clear' ? it.fightPoly : it.poly;
  const raClear = (it) => it.layer === 'clear' ? it.poly : it.clearPoly;
  const raBoss = () => (S.ctx && S.ctx.raid && S.ctx.raid.boss) || { x: S.item.center[0], y: S.item.center[1], z: S.item.center[2] };
  const raStage = (it) => it.stage || (S.ctx && S.ctx.raid && S.ctx.raid.defaultStage) || null;
  function raInClear(it, x, y) { const C = raClear(it); if (C && C.length >= 3) return inPoly(x, y, C); const F = raFight(it); return inPoly(x, y, F) || distToPoly(x, y, F) <= (+it.clearMargin || 0); }
  /** 'aggr' | 'passive' (cleared) | '' (left alone) — the bots' rule */
  function raWanted(it, m) {
    if (!raInClear(it, m.x, m.y)) return '';
    if (m.a) return 'aggr';
    if (it.clearPassive) return 'passive';
    const F = raFight(it), st = raStage(it), b = raBoss();
    if (inPoly(m.x, m.y, F) || (st && distToSeg(m.x, m.y, [st[0], st[1]], [b.x, b.y]) <= 400)) return 'passive';
    return '';
  }

  // ------------------------------------------------------------------------------------------------ state
  const S = {
    open: false, root: null, svg: null, kind: '', id: '', data: null, item: null, loaded: null, rev: '', ctx: null,
    view: { cx: 0, cy: 0, s: 10 }, sel: -1, mode: 'edit', undo: [], redo: [], dirty: false, snap: false, geo: null, geoKey: '',
    pointers: new Map(), gesture: null, drag: null, lastTap: { i: -1, t: 0 }, longT: 0, show: { mobs: true, nb: true, safe: true }, applyMonsters: false,
    ret: '', tileKey: '', busy: false, jobsT: 0, rafShape: 0,
  };

  // ------------------------------------------------------------------------------------------------ DOM
  function build() {
    if (S.root) return;
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/polyedit.css'; document.head.appendChild(css);
    const d = document.createElement('div'); d.id = 'pe'; d.className = 'pe'; d.hidden = true;
    d.innerHTML = `
<svg class="pemap" id="peSvg" xmlns="http://www.w3.org/2000/svg"><g id="peTiles"></g><g id="peCtx"></g><g id="peMobs"></g><g id="peShape"></g><g id="peHandles"></g></svg>
<div class="bar top">
  <button id="peBack" title="back (Esc)">◀</button>
  <div class="title"><span class="kind" id="peKind"></span><b id="peName"></b><span id="peSub"></span></div>
  <button id="peUndo" title="undo (Ctrl+Z)">↶</button><button id="peRedo" title="redo (Ctrl+Y)">↷</button>
  <button id="peFit" title="show the whole shape">⤢</button>
  <button id="peSet" title="name, levels, centre, notes, reset">☰</button>
  <button id="peSave" class="go">Save</button>
</div>
<div class="legend" id="peLegend"></div>
<div class="toast" id="peToast" hidden></div>
<div class="bar bottom">
  <div class="stats" id="peStats"></div>
  <div class="hint" id="peHint"></div>
  <div class="tools" id="peTools">
    <button data-mode="edit" title="drag points, tap + to add">✎ Points</button>
    <button data-mode="move" title="drag anywhere to move the whole shape">✥ Move shape</button>
    <button id="peDel" title="delete the selected point (Del)">✕ Point</button>
    <button id="peConv" title="turn this circle into a polygon you can shape">▱ Make polygon</button>
    <button id="peFitMobs" title="outline around its monsters">☠ Fit to monsters</button>
    <span class="sep"></span>
    <button id="peSnap" title="snap moved points onto walkable ground (geodata) and warn about walls">⌖ Snap</button>
    <button id="peGeo" title="check every point and edge against the geodata">Check walls</button>
    <span class="sep"></span>
    <button data-show="mobs" title="monsters">☠</button><button data-show="nb" title="other rooms / zones / spots">▱ others</button><button data-show="safe" title="safe spots">⛨</button>
  </div>
  <div class="tools ra" id="peRaTools" hidden>
    <button data-layer="fight" title="edit the area where the team fights the boss">⚔ Fight area</button>
    <button data-layer="clear" title="edit what is cleared before the pull (default: fight area + margin)">▢ Clear area</button>
    <button id="peRaAuto" title="no own clear area: the fight area + the margin is cleared">auto clear</button>
    <span class="sep"></span>
    <button id="peRaCircle" title="replace the shape being edited with a circle around the boss">◯ Circle</button><input id="peRaN" type="number" value="900" min="200" max="5000" step="100" inputmode="numeric" title="radius of the circle" aria-label="circle radius">
    <span class="sep"></span>
    <button id="peRaStage" title="staging point: where the team waits while it clears and counts down (drag the blue flag)">⚑ Stage</button>
    <span class="sep"></span>
    <button id="peRaFitG" title="a circle of the radius above around the boss, cut back where the ground drops off (cliff), turns to water or a wall stands">⛰ Fit to safe ground</button>
    <button id="peRaStay" title="in the fight nobody leaves the fight area: no chasing minions out of it, anyone outside walks straight back in">🛡 Stay inside: off</button>
  </div>
</div>
<div class="panel" id="pePanel" hidden></div>`;
    document.body.appendChild(d);
    S.root = d; S.svg = $p('peSvg');
    $p('peBack').onclick = back;
    $p('peSave').onclick = save;
    $p('peUndo').onclick = undo; $p('peRedo').onclick = redo;
    $p('peFit').onclick = () => { fit(); render(); };
    $p('peSet').onclick = () => { const p = $p('pePanel'); p.hidden = !p.hidden; if (!p.hidden) { $p('peToast').hidden = true; panel(); } };
    $p('peDel').onclick = () => delVertex(S.sel);
    $p('peConv').onclick = convert;
    $p('peFitMobs').onclick = fitMobs;
    $p('peSnap').onclick = () => { S.snap = !S.snap; tools(); if (S.snap) geocheck(true); };
    $p('peGeo').onclick = () => geocheck(true);
    $p('peRaTools').addEventListener('click', (e) => { const l = e.target.closest('[data-layer]'); if (l) raLayer(l.dataset.layer); });
    $p('peRaAuto').onclick = raAutoClear;
    $p('peRaCircle').onclick = () => raCircle(+$p('peRaN').value || 900);
    $p('peRaStage').onclick = raStageBtn;
    $p('peRaFitG').onclick = raFitGround;
    $p('peRaStay').onclick = raStayBtn;
    $p('peTools').addEventListener('click', (e) => {
      const m = e.target.closest('[data-mode]'); if (m) { S.mode = m.dataset.mode; tools(); hint(); return; }
      const sh = e.target.closest('[data-show]'); if (sh) { S.show[sh.dataset.show] = !S.show[sh.dataset.show]; tools(); renderCtx(); renderMobs(); }
    });
    const svg = S.svg;
    svg.addEventListener('pointerdown', down);
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', wheel, { passive: false });
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => { if (S.open) render(); });
    document.addEventListener('keydown', keys);
  }

  // ------------------------------------------------------------------------------------------------ open / close
  async function open(hash) {
    build();
    const parts = String(hash || location.hash).replace(/^#\/?/, '').split('/');
    const kind = parts[1], id = decodeURIComponent(parts.slice(2).join('/'));
    if (!KIND_LABEL[kind] || !id) { toast('Nothing to edit: the link needs #/edit/<room|zone|spot|area|raidarea>/<id>', true); return; }
    if (S.open && S.kind === kind && S.id === id && S.item) return;
    S.ret = S.ret || (kind === 'raidarea' ? '#/raid/' + encodeURIComponent(id) : RETURN[kind]);
    if ($p('peRaTools')) $p('peRaTools').hidden = kind !== 'raidarea';
    S.root.hidden = false; S.open = true; document.body.style.overflow = 'hidden';
    S.kind = kind; S.id = id; S.item = null; S.ctx = null; S.sel = -1; S.undo = []; S.redo = []; S.dirty = false; S.geo = null; S.mode = 'edit'; S.tileKey = '';
    $p('peKind').textContent = KIND_LABEL[kind]; $p('peName').textContent = id; $p('peSub').textContent = 'loading…';
    ['peTiles', 'peCtx', 'peMobs', 'peShape', 'peHandles'].forEach(g => { $p(g).innerHTML = ''; });
    $p('pePanel').hidden = true;
    await load();
  }
  async function load(keepView) {
    const r = await call(`/api/polyedit?kind=${S.kind}&id=${encodeURIComponent(S.id)}`);
    if (r.status !== 200 || !r.body.item) { $p('peSub').textContent = ''; toast(r.body.error || ('error ' + r.status), true); stats(); return false; }
    S.data = r.body; S.rev = r.body.rev; S.ctx = r.body.context; S.item = clone(r.body.item); S.loaded = clone(r.body.item);
    $p('peName').textContent = S.item.name; $p('peSub').textContent = (S.ctx.title || '') + (S.item.manual ? ' · edited on the dashboard' : '');
    if (!keepView) fit(); render(); tools(); hint(); legend();
    if (!$p('pePanel').hidden) panel();
    if (S.ctx.safeStale && S.kind === 'room') toast('Safe spots of this floor are being recomputed after the last outline change.');
    if (isRa() && S.item.isNew) toast(`No fight area for ${S.item.name} yet — this is a ${(S.ctx.raid || {}).defaultFightR || 900} circle around its spawn. Shape it (or ◯ Circle), set the ⚑ stage, then Save. Until then the bots clear aggressive monsters within ${(S.ctx.raid || {}).defaultClearR || 1200} of the boss.`);
    if (isRa()) raTools();
    return true;
  }
  function close() {
    if (!S.root || !S.open) return;
    S.root.hidden = true; S.open = false; document.body.style.overflow = ''; S.ret = '';
    S.pointers.clear(); S.drag = null; S.gesture = null;
  }
  async function back() {   // async since UIDIALOG 2026-10-10
    if (S.dirty) { if (S.asking) return; S.asking = true; const ok = await uiConfirm({ title: 'Leave without saving?', body: 'Your changes to this shape are lost.', confirmText: 'Leave', cancelText: 'Stay', danger: true }); S.asking = false; if (!ok) return; }
    S.dirty = false;
    const ret = S.ret || RETURN[S.kind] || '#/zones';
    let depth = 0; try { depth = navDepth; } catch (e) { }
    if (depth > 0) history.back(); else if (typeof go === 'function') go(ret); else location.hash = ret;
  }

  // ------------------------------------------------------------------------------------------------ view
  function size() { const r = S.svg.getBoundingClientRect(); return { W: Math.max(50, r.width), H: Math.max(50, r.height) }; }
  function fit() {
    const it = S.item; if (!it) return;
    const P = shapePts(it).concat(S.kind === 'room' || isRa() ? [[it.center[0], it.center[1]]] : [], isRa() ? (raClear(it) || []).concat(raStage(it) ? [raStage(it)] : []) : []);
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
    // keep the shape clear of the top bar and the (taller on phones) bottom bar
    const { W, H: Hh } = size(), tb = S.root.querySelector('.bar.top'), bb = S.root.querySelector('.bar.bottom');
    const padTop = Math.max(64, tb ? tb.getBoundingClientRect().height + 12 : 0), padBot = Math.max(120, bb ? bb.getBoundingClientRect().height + 16 : 0);
    const w = Math.max(...xs) - Math.min(...xs) + 600, h = Math.max(...ys) - Math.min(...ys) + 600;
    S.view.s = Math.max(1, Math.max(w / Math.max(100, W - 24), h / Math.max(100, Hh - padTop - padBot)));
    S.view.cx = (Math.max(...xs) + Math.min(...xs)) / 2; S.view.cy = (Math.max(...ys) + Math.min(...ys)) / 2 + (padBot - padTop) / 2 * S.view.s;
  }
  function setVB() { const { W, H: Hh } = size(), v = S.view; S.svg.setAttribute('viewBox', `${v.cx - W * v.s / 2} ${v.cy - Hh * v.s / 2} ${W * v.s} ${Hh * v.s}`); }
  function world(e) { const pt = S.svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const w = pt.matrixTransform(S.svg.getScreenCTM().inverse()); return [r0(w.x), r0(w.y)]; }
  const px = (n) => n * S.view.s;                      // screen pixels -> world units at the current zoom
  const mapZ = () => S.ctx && isFinite(S.ctx.mapZ) ? S.ctx.mapZ : (S.item ? S.item.center[2] : 0);

  function render() { if (!S.item) return; setVB(); renderTiles(); renderCtx(); renderMobs(); renderShape(); stats(); }
  function renderTiles() {
    const { W, H: Hh } = size(), v = S.view, x0 = v.cx - W * v.s / 2, y0 = v.cy - Hh * v.s / 2, x1 = x0 + W * v.s, y1 = y0 + Hh * v.s;
    const gx0 = Math.floor(x0 / TILE), gx1 = Math.floor(x1 / TILE), gy0 = Math.floor(y0 / TILE), gy1 = Math.floor(y1 / TILE);
    if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 120) { $p('peTiles').innerHTML = ''; S.tileKey = ''; return; }
    const k = [gx0, gx1, gy0, gy1, mapZ()].join(','); if (k === S.tileKey) return; S.tileKey = k;
    let s = ''; const z = mapZ();
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, c = gx - Math.floor(gx / 4) * 4, r = gy - Math.floor(gy / 4) * 4;
      let lay = ''; try { lay = typeof ugLayer === 'function' ? ugLayer(RX, RY, z, (gx + 0.5) * TILE, (gy + 0.5) * TILE) : ''; } catch (e) { lay = ''; }
      s += `<image href="/minitile/${RX}_${RY}${lay}_${c}_${r}.jpg" x="${gx * TILE}" y="${gy * TILE}" width="${TILE}" height="${TILE}" preserveAspectRatio="none"/>`;
    }
    $p('peTiles').innerHTML = s;
  }
  const label = (x, y, t, size, fill, anchor) => `<text x="${x}" y="${y}" font-size="${px(size || 11)}" fill="${fill || '#fff'}" paint-order="stroke" stroke="#000" stroke-width="${px(3)}" stroke-linejoin="round" text-anchor="${anchor || 'start'}" pointer-events="none">${H(t)}</text>`;
  const pts = (P) => P.map(p => p[0] + ',' + p[1]).join(' ');
  const NB_COL = { room: '#9fb8ff', zone: '#3ddc84', spot: '#c9a8ff', area: '#5ad1ff' };
  function renderCtx() {
    const c = S.ctx; if (!c) return;
    let s = '';
    if (isRa()) s += raCtxSvg();
    if (c.effSquare && S.item.shape === 'circle') s += `<polygon points="${pts(c.effSquare)}" fill="none" stroke="#ffd34d" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-dasharray="8 6" pointer-events="none"/>` + label(c.effSquare[0][0] + px(6), c.effSquare[0][1] + px(14), 'hunting square today', 11, '#ffd34d');
    if (c.hull) s += `<polygon points="${pts(c.hull)}" fill="none" stroke="#c9a8ff" stroke-width="1.2" vector-effect="non-scaling-stroke" stroke-dasharray="3 4" pointer-events="none"/>`;
    if (S.show.nb) (c.neighbours || []).forEach(n => {
      const col = NB_COL[n.kind] || '#9fb8ff';
      s += `<polygon points="${pts(n.poly)}" fill="${col}" fill-opacity=".07" stroke="${col}" stroke-opacity=".75" stroke-width="1" vector-effect="non-scaling-stroke"${n.circle || n.hull ? ' stroke-dasharray="5 4"' : ''} pointer-events="none"/>`;
      if (S.view.s < 25) { const cx = n.poly.reduce((t, p) => t + p[0], 0) / n.poly.length, cy = n.poly.reduce((t, p) => t + p[1], 0) / n.poly.length; s += label(cx, cy, (n.short || n.name) + (n.levels && n.levels[0] ? ` ${n.levels[0]}-${n.levels[1]}` : ''), 10, '#d6e0ff', 'middle'); }
    });
    (c.holes || []).forEach(h => { s += `<polygon points="${pts(h)}" fill="#ff4d4d" fill-opacity=".18" stroke="#ff4d4d" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>`; });
    (c.circles || []).forEach(o => { s += `<circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="#ff4d4d" fill-opacity=".15" stroke="#ff4d4d" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>`; });
    (c.subareas || []).forEach((a, i) => { s += `<circle cx="${a.x}" cy="${a.y}" r="${a.r}" fill="none" stroke="#7fd6ff" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="4 4" pointer-events="none"/>` + label(a.x, a.y, `sub-area ${i + 1}`, 10, '#7fd6ff', 'middle'); });
    (c.lines || []).forEach(L => { if (L.pts.length > 1) s += `<polyline points="${pts(L.pts)}" fill="none" stroke="${L.color}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-dasharray="7 5" pointer-events="none"/>` + label(L.pts[L.pts.length - 1][0] + px(6), L.pts[L.pts.length - 1][1] - px(6), L.name, 10, L.color); });
    (c.points || []).forEach(p => { s += `<rect x="${p.x - px(6)}" y="${p.y - px(6)}" width="${px(12)}" height="${px(12)}" fill="${p.color}" stroke="#000" stroke-width="${px(1)}" pointer-events="none"/>` + label(p.x + px(9), p.y + px(4), p.name, 10, p.color); });
    if (S.show.safe) (c.safeSpots || []).forEach(sp => { const u = S.view.s; s += `<path d="M ${sp.x - 7 * u} ${sp.y - 8 * u} h ${14 * u} v ${9 * u} l ${-7 * u} ${8 * u} l ${-7 * u} ${-8 * u} z" fill="${sp.tier === 'tight' ? '#c8c828' : '#28c850'}" stroke="#fff" stroke-width="${u}" pointer-events="none"/>` + (u < 12 ? label(sp.x + 10 * u, sp.y + 4 * u, 'safe ' + String(sp.id).split('-').pop(), 9, '#7dffa0') : ''); });
    $p('peCtx').innerHTML = s;
  }
  function lvCol(l) { const it = S.item, lo = +it.levelMin || 1, hi = +it.levelMax || 99; return l < lo - 3 ? '#9aa39e' : l <= hi ? '#3ddc84' : l <= hi + 4 ? '#ffae42' : '#ff4d4d'; }
  function renderMobs() {
    const c = S.ctx; if (!c) return;
    if (!S.show.mobs) { $p('peMobs').innerHTML = ''; return; }
    const P = shapePts(S.item), u = S.view.s, R = (coarse() ? 4.2 : 3.4) * u;
    let s = '';
    if (isRa()) {                                              // raid: cleared (bright) or left alone (faded); aggressive = red ring + its aggro range
      (c.spawns || []).forEach(m => {
        if (m.b && m.n === raBoss().name) return;
        const w = raWanted(S.item, m);
        if (m.a && m.ar && w) s += `<circle cx="${m.x}" cy="${m.y}" r="${m.ar}" fill="none" stroke="#ff2a2a" stroke-opacity=".4" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="3 5" pointer-events="none"/>`;
        if (m.b) { s += `<circle cx="${m.x}" cy="${m.y}" r="${6 * u}" fill="#b16cff" stroke="#000" stroke-width="${u}" pointer-events="none"/>` + label(m.x + 8 * u, m.y + 4 * u, `♛ ${m.n} ${m.l}`, 9, '#d6b3ff'); return; }
        s += `<circle cx="${m.x}" cy="${m.y}" r="${R}" fill="${lvCol(m.l)}" fill-opacity="${w ? 0.95 : 0.3}" stroke="${m.a ? '#ff2a2a' : w ? '#fff' : '#000'}" stroke-width="${(m.a ? 1.8 : w ? 1 : 0.5) * u}" pointer-events="none"><title>${H(m.n)} lvl ${m.l}${m.a ? ' · aggressive (' + m.ar + ')' : ' · passive'}${w ? ' · will be cleared' : ' · left alone'}</title></circle>`;
      });
      $p('peMobs').innerHTML = s; return;
    }
    (c.spawns || []).forEach(m => {
      const inside = inPoly(m.x, m.y, P);
      if (m.b) s += `<circle cx="${m.x}" cy="${m.y}" r="${7 * u}" fill="#b16cff" stroke="#000" stroke-width="${u}" pointer-events="none"/>` + label(m.x + 9 * u, m.y + 4 * u, `♛ ${m.n} ${m.l}`, 10, '#d6b3ff');
      else s += `<circle cx="${m.x}" cy="${m.y}" r="${R}" fill="${lvCol(m.l)}" fill-opacity="${inside ? 0.95 : 0.4}" stroke="${m.own ? '#fff' : '#000'}" stroke-width="${(m.own ? 1 : 0.5) * u}" pointer-events="none"/>`;
    });
    $p('peMobs').innerHTML = s;
  }
  /** the polygon the item hunts in (poly, or today's circle / square) */
  function shapePts(it) {
    if (it.shape === 'poly' && it.poly && it.poly.length) return it.poly;
    if (S.kind === 'room') return circlePoly(it.center[0], it.center[1], it.radius || 800, 24);
    return circlePoly(it.center[0], it.center[1], it.radius || 3000, 32);
  }
  function renderShape() {
    const it = S.item; if (!it) return;
    const u = S.view.s, big = coarse(), hv = (big ? 15 : 8) * u, hm = (big ? 11 : 6) * u, hit = (big ? 24 : 12) * u;
    const col = isRa() ? (it.layer === 'clear' ? RA_COL.clear : RA_COL.fight) : S.kind === 'room' ? '#ff8a70' : '#5dff9c', fillc = isRa() ? col : S.kind === 'room' ? '#ec6a55' : '#3ddc84';
    let s = '', h = '';
    if (it.shape === 'poly' && it.poly) {
      const P = it.poly, X = selfX(P), geo = S.geo && S.geo.key === geoKey() ? S.geo : null;
      s += `<polygon id="peFill" data-h="shape" points="${pts(P)}" fill="${fillc}" fill-opacity=".2" stroke="none"/>`;
      P.forEach((p, i) => { const q = P[(i + 1) % P.length], bad = X.has(i), wall = geo && geo.edges[i] === false;
        s += `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${bad ? '#ff3030' : wall ? '#ffae42' : col}" stroke-width="${bad || wall ? 3 : 2.2}" vector-effect="non-scaling-stroke"${wall && !bad ? ' stroke-dasharray="6 4"' : ''} pointer-events="none"/>`; });
      P.forEach((p, i) => { const q = P[(i + 1) % P.length], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) / u < (big ? 46 : 26)) return;              // edge too short on screen for a + handle
        h += `<g data-h="m" data-i="${i}" style="cursor:copy"><circle cx="${mx}" cy="${my}" r="${hit * 0.8}" fill="transparent"/><circle cx="${mx}" cy="${my}" r="${hm}" fill="#0008" stroke="#fff" stroke-width="${u}" stroke-opacity=".8"/>` +
          `<path d="M ${mx - hm * 0.55} ${my} H ${mx + hm * 0.55} M ${mx} ${my - hm * 0.55} V ${my + hm * 0.55}" stroke="#fff" stroke-width="${1.6 * u}"/></g>`; });
      P.forEach((p, i) => { const sel = i === S.sel, gp = geo && geo.points[i];
        h += `<g data-h="v" data-i="${i}" style="cursor:grab"><circle cx="${p[0]}" cy="${p[1]}" r="${hit}" fill="transparent"/>` +
          `<circle cx="${p[0]}" cy="${p[1]}" r="${sel ? hv * 1.15 : hv}" fill="${sel ? '#ffffff' : col}" stroke="${gp && gp.ok === false ? '#ffae42' : '#000'}" stroke-width="${(gp && gp.ok === false ? 3.5 : 1.4) * u}"/></g>`;
        if (sel || P.length <= 40 && u < 6) h += label(p[0] + hv + 3 * u, p[1] - hv * 0.6, String(i + 1), sel ? 12 : 9, sel ? '#fff' : '#ffe9c9'); });
    } else {
      const [x, y] = it.center, R = it.radius;
      s += `<circle id="peFill" data-h="shape" cx="${x}" cy="${y}" r="${R}" fill="${fillc}" fill-opacity=".18" stroke="${col}" stroke-width="2.2" vector-effect="non-scaling-stroke"/>`;
      h += `<g data-h="r" style="cursor:ew-resize"><circle cx="${x + R}" cy="${y}" r="${hit}" fill="transparent"/><circle cx="${x + R}" cy="${y}" r="${hv}" fill="#ffd34d" stroke="#000" stroke-width="${1.4 * u}"/></g>` + label(x + R + hv + 3 * u, y + 4 * u, 'radius ' + R, 11, '#ffd34d');
    }
    // the centre: a room's own centre point (where the leader walks to) / a circle's centre
    if (S.kind === 'room' || it.shape !== 'poly') {
      const [x, y] = it.center, r = (big ? 13 : 8) * u;
      h += `<g data-h="c" style="cursor:move"><circle cx="${x}" cy="${y}" r="${hit}" fill="transparent"/><circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#ff3b3b" stroke-width="${2.5 * u}"/>` +
        `<path d="M ${x - r * 1.5} ${y} H ${x + r * 1.5} M ${x} ${y - r * 1.5} V ${y + r * 1.5}" stroke="#ff3b3b" stroke-width="${2 * u}"/></g>` + label(x + r * 1.6, y + r * 1.6 + 6 * u, 'centre', 10, '#ff8080');
    }
    if (isRa()) { h += raStageSvg(u, big, hit); renderCtx(); }   // the other layer + the stage line follow every edit
    $p('peShape').innerHTML = s; $p('peHandles').innerHTML = h;
    S.svg.classList.toggle('move', S.mode === 'move');
  }
  function shapeSoon() { if (S.rafShape) return; S.rafShape = requestAnimationFrame(() => { S.rafShape = 0; renderShape(); stats(); }); }

  // ------------------------------------------------------------------------------------------------ live numbers
  function stats() {
    const it = S.item, c = S.ctx, el = $p('peStats'); if (!el) return;
    if (!it || !c) { el.innerHTML = ''; return; }
    if (isRa()) { raStats(el); return; }
    const P = shapePts(it), A = area(P), sp = (c.spawns || []).filter(m => !m.b);
    const inside = sp.filter(m => inPoly(m.x, m.y, P)), by = {};
    inside.forEach(m => { by[m.l] = (by[m.l] || 0) + (m.c || 1); });
    const sum = (L) => L.reduce((t, m) => t + (m.c || 1), 0);
    const own = sp.filter(m => m.own), ownIn = own.filter(m => inPoly(m.x, m.y, P));
    const nbRooms = S.kind === 'room' ? (c.neighbours || []).filter(n => n.kind === 'room') : [];
    const foreign = S.kind === 'room' ? inside.filter(m => !m.own && nbRooms.some(n => inPoly(m.x, m.y, n.poly))) : [];
    const lvl = Object.keys(by).map(Number).sort((a, b) => a - b);
    const lvTxt = lvl.length ? (lvl.length > 6 ? `lvl ${lvl[0]}-${lvl[lvl.length - 1]}` : lvl.map(l => `<span style="color:${lvCol(l)}">${l}</span>×${by[l]}`).join(' ')) : 'none';
    const warn = [], err = [];
    if (it.shape === 'poly') {
      if (it.poly.length < 3) err.push('needs at least 3 points');
      if (selfX(it.poly).size) err.push('the outline crosses itself (red edges)');
      const g = S.geo && S.geo.key === geoKey() ? S.geo : null;
      if (g) { const bp = g.points.filter(p => p && p.ok === false).length, be = g.edges.filter(x => x === false).length; if (bp) warn.push(`${bp} point${bp > 1 ? 's' : ''} not on walkable ground`); if (be) warn.push(`${be} edge${be > 1 ? 's' : ''} cross a wall`); }
    }
    if (S.kind === 'room' && it.shape === 'poly' && it.poly.length >= 3 && !inPoly(it.center[0], it.center[1], it.poly)) warn.push('centre is outside the outline');
    if (own.length && ownIn.length < own.length) warn.push(`${sum(own) - sum(ownIn)} of its own monsters are outside`);
    if (foreign.length) warn.push(`${sum(foreign)} monsters of other rooms inside`);
    const side = Math.sqrt(A);
    el.innerHTML = `${it.shape === 'poly' ? `<b>${it.poly.length}</b> points` : `circle r <b>${it.radius}</b>`} · area ≈ <b>${r0(side)} × ${r0(side)}</b>` +
      ` · inside: <b>${sum(inside)}</b> monsters (${lvTxt})${own.length ? ` · own <b>${r0(sum(ownIn) / Math.max(1, sum(own)) * 100)} %</b>` : ''}` +
      (S.dirty ? ' · <span class="dirty">unsaved</span>' : '') +
      (err.length ? `<br><span class="e">✕ ${H(err.join(' · '))}</span>` : '') + (warn.length ? `<br><span class="w">⚠ ${H(warn.join(' · '))}</span>` : '');
    $p('peSave').disabled = !!err.length || !S.dirty;
    $p('peUndo').disabled = !S.undo.length; $p('peRedo').disabled = !S.redo.length;
  }
  function tools() {
    const it = S.item; if (!it) return;
    document.querySelectorAll('#peTools [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
    document.querySelectorAll('#peTools [data-show]').forEach(b => b.classList.toggle('on', !!S.show[b.dataset.show]));
    $p('peSnap').classList.toggle('on', S.snap);
    const poly = it.shape === 'poly';
    $p('peDel').hidden = !poly; $p('peDel').disabled = !(poly && S.sel >= 0 && it.poly.length > 3);
    $p('peConv').hidden = poly || (S.kind === 'zone' && !!it.roomsZone);
    $p('peGeo').hidden = $p('peSnap').hidden = !poly;
    document.querySelector('#peTools [data-mode="move"]').hidden = !poly && S.kind !== 'room';
    $p('peFitMobs').hidden = isRa();
    document.querySelector('#peTools [data-show="nb"]').hidden = document.querySelector('#peTools [data-show="safe"]').hidden = isRa();
    if (isRa()) raTools();
  }
  function hint() {
    const it = S.item; if (!it) return;
    const t = coarse() ? 'tap' : 'click';
    if (isRa()) { $p('peHint').textContent = S.mode === 'move' ? 'Move shape: drag anywhere to move the whole area (the boss spawn stays).' : `${it.layer === 'clear' ? 'CLEAR area (cleared before the pull)' : 'FIGHT area (the tank pulls the boss in and keeps it there)'}: drag points · ${t} + for a new point · double-${t} / hold = delete · drag the blue ⚑ = staging point.`; return; }
    $p('peHint').textContent = it.shape !== 'poly' ? (S.kind === 'zone' && it.roomsZone ? `This spot hunts inside the rooms of ${it.roomsZone} — edit the rooms on the Rooms tab. Here: levels, on/off, notes (☰).` : `Circle: drag the red centre or the yellow radius handle, or "Make polygon" to draw the exact area.`)
      : S.mode === 'move' ? 'Move shape: drag anywhere to move the whole shape. Two fingers / wheel = zoom.'
      : `Drag a point to move it · ${t} the + on an edge for a new point · double-${t} or hold a point to delete it · drag the map to pan, two fingers / wheel to zoom.`;
  }
  function legend() {
    const l = $p('peLegend'); if (!l) return;
    if (isRa()) { l.innerHTML = `<i style="background:${RA_COL.fight}"></i>fight<i style="background:${RA_COL.clear}"></i>clear<i style="background:${RA_COL.stage}"></i>stage<i style="background:#b16cff"></i>boss<i style="background:${RA_COL.route}"></i>route` +
      `<br>monsters: bright = cleared · faded = left alone · <i style="background:#ff2a2a"></i>red ring = aggressive (dashed = its aggro range)`; return; }
    l.innerHTML = `<i style="background:${S.kind === 'room' ? '#ff8a70' : '#5dff9c'}"></i>this ${S.kind}<i style="background:${NB_COL[S.kind === 'room' ? 'room' : 'zone']}"></i>others${S.kind === 'room' ? '<i style="background:#28c850"></i>safe spot' : '<i style="background:#ffd34d"></i>square today'}` +
      `<br>monsters: <i style="background:#9aa39e"></i>low<i style="background:#3ddc84"></i>fits<i style="background:#ffae42"></i>above<i style="background:#ff4d4d"></i>too high · white ring = its own`;
  }

  // ------------------------------------------------------------------------------------------------ edits + undo
  const snapState = () => JSON.stringify(S.item);
  function pushUndo(prev) { S.undo.push(prev || snapState()); if (S.undo.length > 200) S.undo.shift(); S.redo = []; }
  function changed() { S.dirty = true; S.geo = S.geo && S.geo.key === geoKey() ? S.geo : null; tools(); renderShape(); renderMobs(); stats(); if (S.snap) geocheck(false); if (!$p('pePanel').hidden) panelValues(); }
  function undo() { if (!S.undo.length) return; S.redo.push(snapState()); S.item = JSON.parse(S.undo.pop()); S.sel = -1; S.dirty = true; tools(); renderShape(); renderMobs(); stats(); if (!$p('pePanel').hidden) panel(); }
  function redo() { if (!S.redo.length) return; S.undo.push(snapState()); S.item = JSON.parse(S.redo.pop()); S.sel = -1; S.dirty = true; tools(); renderShape(); renderMobs(); stats(); if (!$p('pePanel').hidden) panel(); }
  function delVertex(i) {
    const it = S.item; if (!it || it.shape !== 'poly' || i < 0 || i >= it.poly.length) return;
    if (it.poly.length <= 3) { toast('A shape needs at least 3 points.'); return; }
    pushUndo(); it.poly.splice(i, 1); S.sel = -1; changed();
  }
  async function convert() {
    const it = S.item; if (!it || it.shape === 'poly') return;
    let P;
    if (S.kind === 'room') P = circlePoly(it.center[0], it.center[1], it.radius || 800, 12);
    else if (S.ctx && S.ctx.hull && S.ctx.hull.length >= 3 && await uiConfirm({ title: 'Start the polygon from…', body: ['Start from the monster area of this spot (dotted purple outline)?', uiNote('Square = start from the square the bots hunt in today.')], confirmText: 'Monster area', cancelText: 'Square' })) P = S.ctx.hull.map(p => [p[0], p[1]]);
    else P = circlePoly(it.center[0], it.center[1], effSide(it.radius) / 2, 12);
    pushUndo(); it.shape = 'poly'; it.poly = P; S.sel = -1; S.mode = 'edit'; changed(); hint(); fit(); render();
    toast('Now a polygon: drag the points to fit. Saving makes the bots hunt only inside it.');
  }
  async function fitMobs() {
    const it = S.item, c = S.ctx; if (!it || !c) return;
    const P = shapePts(it), lo = (+it.levelMin || 1) - 3, hi = (+it.levelMax || 99) + 3;
    let pool = (c.spawns || []).filter(m => !m.b && m.own);
    if (pool.length < 3) pool = (c.spawns || []).filter(m => !m.b && m.l >= lo && m.l <= hi && inPoly(m.x, m.y, P));
    if (pool.length < 3) { toast('Not enough monsters to outline (fewer than 3).', true); return; }
    const hp = padPoly(hull(pool.map(m => [m.x, m.y])), S.kind === 'room' ? 200 : 400);
    if (!await uiConfirm({ title: 'Replace the outline?', body: [`Replace the outline with one around ${pool.length} monster spawns (${pool.filter(m => m.own).length ? 'its own monsters' : 'the fitting monsters inside'}), ${hp.length} points?`, uiWarn('It ignores walls — check the edges afterwards.')], confirmText: 'Replace outline' })) return;
    pushUndo(); it.shape = 'poly'; it.poly = hp; S.sel = -1; changed(); hint();
  }

  // ------------------------------------------------------------------------------------------------ raid fight area: drawing, layers, stage, panel
  function raCtxSvg() {
    const it = S.item, c = S.ctx || {}, u = S.view.s, b = raBoss(), F = raFight(it); let s = '';
    const lbl = (P, t, col) => { const top = P.reduce((a, p) => p[1] < a[1] ? p : a, P[0]); return label(top[0] + px(6), top[1] - px(6), t, 10, col); };
    if (it.layer === 'clear') {
      s += `<polygon points="${pts(F)}" fill="${RA_COL.fight}" fill-opacity=".12" stroke="${RA_COL.fight}" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-dasharray="7 5" pointer-events="none"/>` + lbl(F, 'fight area', RA_COL.fight);
    } else if (it.clearPoly && it.clearPoly.length >= 3) {
      s += `<polygon points="${pts(it.clearPoly)}" fill="${RA_COL.clear}" fill-opacity=".07" stroke="${RA_COL.clear}" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-dasharray="7 5" pointer-events="none"/>` + lbl(it.clearPoly, 'clear area (own)', RA_COL.clear);
    } else {
      const m = Math.max(0, +it.clearMargin || 0);   // fight area + margin = the polygon with a round stroke of 2 x margin (exactly the bots' "within margin" rule)
      if (m > 0) s += `<g opacity=".16" pointer-events="none"><polygon points="${pts(F)}" fill="${RA_COL.clear}" stroke="${RA_COL.clear}" stroke-width="${2 * m}" stroke-linejoin="round"/></g>`;
      s += label(F.reduce((a, p) => p[1] < a[1] ? p : a, F[0])[0], F.reduce((a, p) => p[1] < a[1] ? p : a, F[0])[1] - m - px(6), `auto clear area: fight + ${m}`, 10, RA_COL.clear);
    }
    const st = raStage(it);
    if (st) s += `<line x1="${st[0]}" y1="${st[1]}" x2="${b.x}" y2="${b.y}" stroke="${RA_COL.stage}" stroke-opacity=".7" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-dasharray="4 5" pointer-events="none"/>`;
    // boss spawn + where its minions stand (they spawn around it)
    const mins = (c.raid && c.raid.minions) || [];
    s += `<circle cx="${b.x}" cy="${b.y}" r="300" fill="#b16cff" fill-opacity=".08" stroke="#b16cff" stroke-opacity=".7" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="3 3" pointer-events="none"/>`;
    s += `<circle cx="${b.x}" cy="${b.y}" r="${9 * u}" fill="#b16cff" stroke="#fff" stroke-width="${1.5 * u}" pointer-events="none"/>` + label(b.x + 12 * u, b.y + 4 * u, `♛ ${b.name} ${b.level || ''}`, 11, '#e2c8ff');
    if (mins.length) s += label(b.x + 12 * u, b.y + 18 * u, 'minions: ' + mins.map(m => `${m.name.replace(/ of .*$/, '')} x${m.count}${m.level ? ' (' + m.level + ')' : ''}${m.aggro ? ' A' : ''}`).join(', '), 9, '#d6b3ff');
    return s;
  }
  function raStageSvg(u, big, hit) {
    const st = raStage(S.item); if (!st) return '';
    const b = raBoss(), [x, y] = st, r = (big ? 12 : 8) * u, auto = !S.item.stage, d = r0(Math.hypot(x - b.x, y - b.y));
    return `<g data-h="st" style="cursor:move" opacity="${auto ? 0.6 : 1}"><circle cx="${x}" cy="${y}" r="${hit * 1.2}" fill="transparent"/>` +
      `<path d="M ${x} ${y} V ${y - 3.2 * r} M ${x} ${y - 3.2 * r} h ${2.4 * r} l ${-0.7 * r} ${0.8 * r} l ${0.7 * r} ${0.8 * r} h ${-2.4 * r} z" stroke="${RA_COL.stage}" fill="${RA_COL.stage}" stroke-width="${2 * u}"/>` +
      `<circle cx="${x}" cy="${y}" r="${0.5 * r}" fill="${RA_COL.stage}" stroke="#000" stroke-width="${u}"/></g>` +
      label(x + 2.8 * r, y - 2.2 * r, auto ? `stage (auto, ${d} from the boss) — drag to set` : `⚑ stage · ${d} from the boss`, 10, RA_COL.stage);
  }
  function raCounts(it) {
    const out = { aggr: 0, pas: 0, left: 0 };
    ((S.ctx || {}).spawns || []).forEach(m => { if (m.b && m.n === raBoss().name) return; const w = raWanted(it, m), n = m.c || 1; if (w === 'aggr') out.aggr += n; else if (w === 'passive') out.pas += n; else if (raInClear(it, m.x, m.y)) out.left += n; });
    return out;
  }
  function raStats(el) {
    const it = S.item, F = raFight(it), C = raClear(it), side = r0(Math.sqrt(area(F))), b = raBoss(), st = raStage(it), k = raCounts(it);
    const err = [], warn = [];
    if (it.poly.length < 3) err.push('needs at least 3 points');
    if (selfX(it.poly).size) err.push('the outline crosses itself (red edges)');
    const sd = st ? r0(Math.hypot(st[0] - b.x, st[1] - b.y)) : null;
    if (sd !== null && sd > 3800) err.push(`the stage is ${sd} from the boss — the leader must see it (max ~3400)`);
    else if (sd !== null && sd > 3000) warn.push(`stage ${sd} from the boss (near the view limit)`);
    if (st && F.length >= 3 && inPoly(st[0], st[1], F)) warn.push('the stage is inside the fight area');
    if (F.length >= 3 && !inPoly(b.x, b.y, F) && distToPoly(b.x, b.y, F) > 300) warn.push(`the boss spawn is ${r0(distToPoly(b.x, b.y, F))} outside the fight area (the tank pulls it in; bosses walk home when pulled too far)`);
    if (C && C.length >= 3 && F.some(p => !inPoly(p[0], p[1], C) && distToPoly(p[0], p[1], C) > 50)) warn.push('parts of the fight area are outside the clear area');
    const g = S.geo && S.geo.key === geoKey() ? S.geo : null;
    if (g) { const bp = g.points.filter(p => p && p.ok === false).length, be = g.edges.filter(x => x === false).length; if (bp) warn.push(`${bp} point${bp > 1 ? 's' : ''} not on walkable ground`); if (be) warn.push(`${be} edge${be > 1 ? 's' : ''} cross a wall`); }
    el.innerHTML = `<b style="color:${it.layer === 'clear' ? RA_COL.clear : RA_COL.fight}">${it.layer === 'clear' ? 'Clear' : 'Fight'} area</b> <b>${it.poly.length}</b> points · fight ≈ <b>${side} × ${side}</b> · clear: ${C && C.length >= 3 ? 'own area' : 'fight + ' + (+it.clearMargin || 0)}` +
      ` · cleared before the pull: <b>${k.aggr + k.pas}</b> (${k.aggr} aggressive${k.pas ? ', ' + k.pas + ' passive' : ''}) · left alone: ${k.left} passive · stage: <b>${sd !== null ? sd : '—'}</b>${it.stage ? '' : ' (auto)'} from the boss` +
      (it.enabled === false ? ' · <span class="w">OFF</span>' : '') + (S.dirty ? ' · <span class="dirty">unsaved</span>' : it.isNew ? ' · <span class="dirty">not saved yet</span>' : '') +
      (err.length ? `<br><span class="e">✕ ${H(err.join(' · '))}</span>` : '') + (warn.length ? `<br><span class="w">⚠ ${H(warn.join(' · '))}</span>` : '');
    $p('peSave').disabled = !!err.length || !(S.dirty || it.isNew);
    $p('peUndo').disabled = !S.undo.length; $p('peRedo').disabled = !S.redo.length;
  }
  function raTools() {
    const it = S.item; if (!it || !$p('peRaTools')) return;
    $p('peRaTools').hidden = false;
    document.querySelectorAll('#peRaTools [data-layer]').forEach(b => b.classList.toggle('on', b.dataset.layer === (it.layer || 'fight')));
    $p('peRaAuto').hidden = !(it.layer === 'clear' || (it.clearPoly && it.clearPoly.length >= 3));
    $p('peRaStage').textContent = it.stage ? '⚑ Stage: set' : '⚑ Stage: auto';
    $p('peRaStage').classList.toggle('on', !!it.stage);
    $p('peRaStay').textContent = it.stay ? '🛡 Stay inside: ON' : '🛡 Stay inside: off';
    $p('peRaStay').classList.toggle('on', !!it.stay);
    $p('peRaFitG').hidden = (it.layer || 'fight') !== 'fight';
    hint();
  }
  function raLayer(l, quiet) {
    const it = S.item; if (!it || !isRa() || (it.layer || 'fight') === l) return;
    if (!quiet) pushUndo();
    if (l === 'clear') {
      let C = it.clearPoly, made = false;
      if (!C || C.length < 3) { C = padPoly(it.poly, Math.max(100, +it.clearMargin || 600)); made = true; it._autoClear = JSON.stringify(C); }
      it.fightPoly = it.poly; it.poly = C; it.clearPoly = null; it.layer = 'clear';
      if (made && !quiet) toast('Own clear area, started from the fight area + margin: drag its points. "auto clear" goes back to fight area + margin.');
    } else {
      const C = it.poly; it.poly = it.fightPoly; delete it.fightPoly; it.layer = 'fight';
      it.clearPoly = it._autoClear && JSON.stringify(C) === it._autoClear ? null : C;   // looked at, not changed: stays automatic
    }
    S.sel = -1; S.geo = null;
    if (quiet) { tools(); hint(); render(); } else { changed(); hint(); }
  }
  function raAutoClear() {
    const it = S.item; if (!it) return;
    pushUndo();
    if (it.layer === 'clear') { it.poly = it.fightPoly; delete it.fightPoly; it.layer = 'fight'; }
    it.clearPoly = null; delete it._autoClear; S.sel = -1;
    changed(); hint(); toast(`Clear area = fight area + ${+it.clearMargin || 0} (the margin is in ☰).`);
  }
  function raCircle(N) {
    const it = S.item; if (!it) return;
    N = Math.max(200, Math.min(5000, r0(N))); const b = raBoss();
    pushUndo(); it.poly = circlePoly(b.x, b.y, N, 12); if (it.layer === 'clear') delete it._autoClear; S.sel = -1; S.mode = 'edit';
    changed(); hint(); fit(); render();
    toast(`${it.layer === 'clear' ? 'Clear' : 'Fight'} area = a circle of ${N} around ${b.name}: drag the points to fit the ground.`);
  }
  // STAY INSIDE + FIT TO SAFE GROUND (owner 2026-10-14: "the raid team should not run around ... a small circle where the raid team will not move
  // out ... or even better barriers where the cliffs are or water is")
  async function raStayBtn() {
    const it = S.item; if (!it) return;
    if (!it.stay && !await uiConfirm({ title: 'Stay inside the fight area?', body: [uiP('In the fight ', uiEm('nobody leaves this area'), ':'), uiList(['anyone outside walks straight back in', 'minions outside it are not chased — melee only hit what is inside (or right at the edge), casters what they reach from inside', 'the leader focuses only minions they can reach from inside, the ones inside first', 'the tank takes a loose minion only from the edge (Aggression reach)']), uiNote('Draw the area where the ground is safe: use ⛰ Fit to safe ground, then check it on the map. Save afterwards.')], confirmText: 'Switch on' })) return;
    pushUndo(); it.stay = !it.stay; changed(); raTools();
    toast(it.stay ? 'Stay inside: ON — press Save.' : 'Stay inside: off — press Save.');
  }
  async function raFitGround() {
    const it = S.item; if (!it || S.busy) return;
    const N = Math.max(200, Math.min(5000, r0(+$p('peRaN').value || 900))), b = raBoss();
    S.busy = true; toast('Reading the ground (geodata)…');
    const r = await call(`/api/polyedit?action=fit&kind=raidarea&id=${encodeURIComponent(S.id)}`, { method: 'POST', body: JSON.stringify({ r: N, x: b.x, y: b.y, z: b.z }) });
    S.busy = false;
    if (r.status !== 200 || !r.body.ok) { toast('Could not fit: ' + ((r.body && r.body.error) || ('error ' + r.status)), true); return; }
    pushUndo(); if ((it.layer || 'fight') !== 'fight') raLayer('fight', true);
    it.poly = r.body.poly; S.sel = -1; S.mode = 'edit';
    changed(); hint(); fit(); render();
    const c = r.body.cuts || {}, parts = [c.cliff ? c.cliff + ' at a cliff edge' : '', c.water ? c.water + ' at water' : '', c.wall ? c.wall + ' at a wall / steep ground' : ''].filter(Boolean);
    toast(`Fight area = safe ground within ${N} of ${b.name}${parts.length ? ' — cut back: ' + parts.join(', ') + ' (of 72 directions)' : ' — nothing to cut back'}. Check it on the map, drag points if needed, then Save.`);
  }
  async function raStageBtn() {
    const it = S.item; if (!it) return;
    if (it.stage) { if (!await uiConfirm({ title: 'Back to the automatic stage?', body: '~1500 from the boss where the walk comes in.', confirmText: 'Automatic stage' })) return; pushUndo(); it.stage = null; }
    else { const d = (S.ctx.raid || {}).defaultStage; if (!d) { toast('No default stage known — drag the flag.', true); return; } pushUndo(); it.stage = d.slice(); toast('Stage set: drag the blue flag to where the team should wait (it must see the boss: within ~3400).'); }
    changed(); render();
  }
  function raPanel() {
    const it = S.item, p = $p('pePanel'), c = S.ctx || {}, R = c.raid || {}, b = raBoss(), st = it.stage || [];
    const num = (id, v, ph) => `<input type="number" id="${id}" value="${isFinite(v) ? v : ''}" placeholder="${ph || ''}" inputmode="numeric">`;
    const mins = (R.minions || []).map(m => `${H(m.name)} x${m.count}${m.level ? ' (lvl ' + m.level + ')' : ''}${m.aggro ? ' <b style="color:#ff6b6b">aggressive</b>' : ''}`).join(', ') || 'none';
    const ds = R.defaultStage || [];
    p.innerHTML = `<h3>Raid fight area <button id="pePanX" title="close">✕</button></h3>
      <div class="muted">♛ <b>${H(b.name)}</b> lvl ${H(b.level)} · spawn ${b.x}, ${b.y}, ${b.z}${b.curseLevel ? ' · curse lvl ' + b.curseLevel : ''}<br>minions: ${mins}${R.route ? `<br>route: ${H(R.route.landing || '?')} (${R.route.points} points, ${R.route.manual ? 'locked' : 'recorded'})` : '<br>no saved route yet'}</div>
      <label><span>Enabled</span><input type="checkbox" id="peRaOn" ${it.enabled !== false ? 'checked' : ''}> <span class="muted">off = the bots ignore this area and use the defaults</span></label>
      <label><span>Clear margin</span>${num('peRaMargin', it.clearMargin)}<span class="muted">without an own clear area: monsters within this of the fight area are cleared</span></label>
      <label><input type="checkbox" id="peRaPas" ${it.clearPassive ? 'checked' : ''}> also kill <b>passive</b> monsters inside the clear area <span class="muted">(default: passive ones only inside the fight area or on the way in from the stage)</span></label>
      <h3>Staging point</h3><div class="row">x ${num('peRaSX', st[0], ds[0])} y ${num('peRaSY', st[1], ds[1])} z ${num('peRaSZ', st[2], ds[2])}</div>
      <div class="row"><button id="peRaSAuto">auto</button><span class="muted">${it.stage ? 'set by hand' : `auto: ~${R.stageDist || 1500} from the boss where the walk comes in`} — where the team waits while it clears and counts down</span></div>
      <label style="display:block"><span>Notes</span><textarea id="peFNotes" maxlength="2000">${H(it.notes || '')}</textarea></label>
      <div class="row"><button id="peFApply" class="go">Apply</button><button id="pePRevert" title="drop the changes since you opened it">Undo all changes</button></div>
      <div class="row">${S.data && S.data.orig ? `<button id="peRaDel" class="bad">Remove this fight area</button><span class="muted">saved ${it.edited && it.edited.at ? H(new Date(it.edited.at).toLocaleString()) : ''} — removing = the bots use the defaults again</span>` : '<span class="muted">not saved yet — Save creates it</span>'}</div>
      <div class="muted">Without an area the bots clear only aggressive monsters within ${R.defaultClearR || 1200} of the boss (+ passive ones right on the way in).</div>
      <div class="live">${H((S.data && S.data.live) || '')}</div>
      <div class="muted">File: ${H((S.data && S.data.file) || '')} · boss id ${H(S.id)} · every save keeps a copy in Scripts/data/history/.</div>`;
    $p('pePanX').onclick = () => { p.hidden = true; };
    $p('peFApply').onclick = applyFields;
    p.querySelectorAll('input,textarea').forEach(el => el.addEventListener('change', applyFields));
    $p('peRaSAuto').onclick = () => { if (!it.stage) return; pushUndo(); S.item.stage = null; changed(); render(); raPanel(); };
    $p('pePRevert').onclick = async () => { if (!S.dirty || await uiConfirm({ title: 'Drop every change?', body: 'Drop every change since you opened this area?', confirmText: 'Drop changes', danger: true })) { pushUndo(); S.item = clone(S.loaded); S.sel = -1; S.dirty = false; tools(); render(); raPanel(); } };
    if ($p('peRaDel')) $p('peRaDel').onclick = resetGenerated;
  }
  function raApplyFields() {
    const it = S.item, v = (id) => { const el = $p(id); return el ? el.value : ''; };
    const before = snapState();
    it.enabled = $p('peRaOn') ? $p('peRaOn').checked : it.enabled;
    if (v('peRaMargin') !== '') it.clearMargin = Math.max(0, Math.min(3000, r0(+v('peRaMargin'))));
    it.clearPassive = $p('peRaPas') ? $p('peRaPas').checked : it.clearPassive;
    const sx = v('peRaSX'), sy = v('peRaSY'), sz = v('peRaSZ');
    if (sx !== '' && sy !== '' && isFinite(+sx) && isFinite(+sy)) it.stage = [r0(+sx), r0(+sy), sz !== '' && isFinite(+sz) ? r0(+sz) : raBoss().z];
    else if (sx === '' && sy === '') it.stage = null;
    it.notes = v('peFNotes');
    if (snapState() !== before) { pushUndo(before); changed(); render(); }
  }
  /** what goes to the server: fight in poly, clear in clearPoly (an untouched auto-made clear outline stays automatic) */
  function raPayload(it) {
    const F = raFight(it); let C = raClear(it);
    if (C && it._autoClear && JSON.stringify(C) === it._autoClear) C = null;
    const o = clone(it); o.layer = 'fight'; o.poly = F; o.clearPoly = C && C.length >= 3 ? C : null; delete o.fightPoly; delete o._autoClear;
    return o;
  }
  function raConfirmText() {
    const it = S.item, F = raFight(it), C = raClear(it), k = raCounts(it), b = raBoss(), st = raStage(it);
    // UIDIALOG 2026-10-10: the options of the save dialog (was one confirm() text)
    return { title: `Save the fight area of ${it.name}?`, confirmText: 'Save fight area', body: [
      uiKV([['fight area', `${F.length} points, ≈ ${r0(Math.sqrt(area(F)))} × ${r0(Math.sqrt(area(F)))}`],
        ['clear area', `${C && C.length >= 3 ? 'own outline' : 'fight area + ' + (+it.clearMargin || 0)}${it.clearPassive ? ', passive monsters too' : ''}`],
        ['cleared before the pull', `${k.aggr + k.pas} monsters (${k.aggr} aggressive, ${k.pas} passive) · left alone: ${k.left}`],
        ['stage', st ? r0(Math.hypot(st[0] - b.x, st[1] - b.y)) + ' from the boss' + (it.stage ? '' : ' (auto)') : '—']]),
      it.enabled === false ? uiWarn('OFF (the bots ignore it)') : '',
      'Used by every party that raids this boss.', uiNote('A copy of the file goes to Scripts/data/history/.'), (S.data && S.data.live) || ''] };
  }

  // ------------------------------------------------------------------------------------------------ pointer handling (touch + mouse)
  function hitOf(e) { const g = e.target.closest && e.target.closest('[data-h]'); return g ? { h: g.dataset.h, i: +g.dataset.i } : { h: '' }; }
  function down(e) {
    if (!S.item) return;
    e.preventDefault();
    try { S.svg.setPointerCapture(e.pointerId); } catch (er) { }
    S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (S.pointers.size === 2) {                       // two fingers: pinch-zoom / pan; whatever one finger started is undone
      if (S.drag && S.drag.moved && S.drag.before) { S.item = JSON.parse(S.drag.before); shapeSoon(); }
      clearTimeout(S.longT); S.drag = null;
      const [a, b] = [...S.pointers.values()];
      S.gesture = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view: { ...S.view } };
      return;
    }
    if (S.pointers.size > 2) return;
    const hh = hitOf(e), w = world(e), it = S.item;
    let kind = 'pan';
    if (hh.h === 'v' || hh.h === 'm' || hh.h === 'c' || hh.h === 'r' || hh.h === 'st') kind = hh.h;
    else if (S.mode === 'move' && (it.shape === 'poly' || S.kind === 'room')) kind = 'move';
    S.drag = { kind, i: hh.i, sx: e.clientX, sy: e.clientY, w0: w, moved: false, t0: Date.now(), before: snapState(), view: { ...S.view } };
    if (kind === 'v') {
      S.sel = hh.i; shapeSoon(); tools();
      clearTimeout(S.longT);
      if (e.pointerType === 'touch' || e.pointerType === 'pen') S.longT = setTimeout(() => { if (S.drag && S.drag.kind === 'v' && !S.drag.moved) { const i = S.drag.i; S.drag = null; delVertex(i); if (navigator.vibrate) try { navigator.vibrate(30); } catch (er) { } } }, 650);
    }
  }
  function move(e) {
    if (!S.pointers.has(e.pointerId)) return;
    S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (S.gesture && S.pointers.size >= 2) {
      const [a, b] = [...S.pointers.values()], g = S.gesture, d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const rect = S.svg.getBoundingClientRect(), s2 = Math.max(0.3, Math.min(400, g.view.s * g.d / d));
      // the world point under the first midpoint stays under the fingers' midpoint
      const wx = g.view.cx + (g.mx - rect.left - rect.width / 2) * g.view.s, wy = g.view.cy + (g.my - rect.top - rect.height / 2) * g.view.s;
      S.view.s = s2; S.view.cx = wx - (mx - rect.left - rect.width / 2) * s2; S.view.cy = wy - (my - rect.top - rect.height / 2) * s2;
      setVB(); return;
    }
    const D = S.drag; if (!D) return;
    const dx = e.clientX - D.sx, dy = e.clientY - D.sy;
    if (!D.moved && Math.hypot(dx, dy) > (coarse() ? 8 : 4)) {
      D.moved = true; clearTimeout(S.longT);
      if (D.kind === 'm') { const P = S.item.poly; P.splice(D.i + 1, 0, D.w0); D.kind = 'v'; D.i = D.i + 1; S.sel = D.i; }
    }
    if (!D.moved) return;
    const it = S.item, w = world(e);
    if (D.kind === 'v') { it.poly[D.i] = w; shapeSoon(); }
    else if (D.kind === 'c') { it.center = [w[0], w[1], it.center[2]]; shapeSoon(); }
    else if (D.kind === 'r') { it.radius = Math.max(100, r0(Math.hypot(w[0] - it.center[0], w[1] - it.center[1]))); shapeSoon(); }
    else if (D.kind === 'st') { const z = (raStage(it) || [])[2]; it.stage = [w[0], w[1], isFinite(z) ? z : raBoss().z]; shapeSoon(); }
    else if (D.kind === 'move') {
      const b = JSON.parse(D.before), ox = w[0] - D.w0[0], oy = w[1] - D.w0[1];
      if (it.shape === 'poly') it.poly = b.poly.map(p => [p[0] + ox, p[1] + oy]);
      if (S.kind !== 'raidarea') it.center = [b.center[0] + ox, b.center[1] + oy, b.center[2]];   // a raid area's centre is the boss spawn
      shapeSoon();
    } else if (D.kind === 'pan') { S.view.cx = D.view.cx - dx * D.view.s; S.view.cy = D.view.cy - dy * D.view.s; setVB(); }
  }
  function up(e) {
    S.pointers.delete(e.pointerId);
    if (S.gesture) { if (S.pointers.size < 2) { S.gesture = null; S.drag = null; render(); } return; }
    const D = S.drag; S.drag = null; clearTimeout(S.longT);
    if (!D) return;
    if (!D.moved) {
      const now = Date.now();
      if (D.kind === 'v') {
        if (S.lastTap.i === D.i && now - S.lastTap.t < 380) { S.lastTap = { i: -1, t: 0 }; delVertex(D.i); return; }
        S.lastTap = { i: D.i, t: now }; S.sel = D.i; tools(); renderShape(); return;
      }
      if (D.kind === 'm') { pushUndo(D.before); S.item.poly.splice(D.i + 1, 0, D.w0); S.sel = D.i + 1; changed(); return; }
      if (D.kind === 'pan' || D.kind === 'move') { if (S.sel >= 0) { S.sel = -1; tools(); renderShape(); } }
      return;
    }
    if (D.kind === 'pan') { render(); return; }
    pushUndo(D.before); changed();
    if (D.kind === 'v' && S.snap) snapPoint(D.i);
  }
  function wheel(e) {
    if (!S.item) return; e.preventDefault();
    const f = e.deltaY > 0 ? 1.2 : 1 / 1.2, rect = S.svg.getBoundingClientRect(), v = S.view;
    const wx = v.cx + (e.clientX - rect.left - rect.width / 2) * v.s, wy = v.cy + (e.clientY - rect.top - rect.height / 2) * v.s;
    v.s = Math.max(0.3, Math.min(400, v.s * f)); v.cx = wx - (e.clientX - rect.left - rect.width / 2) * v.s; v.cy = wy - (e.clientY - rect.top - rect.height / 2) * v.s;
    setVB(); clearTimeout(S.wheelT); S.wheelT = setTimeout(render, 120);
  }
  function keys(e) {
    if (!S.open) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (typing) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel >= 0) { e.preventDefault(); delVertex(S.sel); return; }
    if (e.key === 'Escape') { if (!$p('pePanel').hidden) $p('pePanel').hidden = true; else if (S.sel >= 0) { S.sel = -1; tools(); renderShape(); } else back(); }
  }

  // ------------------------------------------------------------------------------------------------ geodata: walkable points, wall-free edges, snap
  const geoKey = () => S.item && S.item.shape === 'poly' ? JSON.stringify(S.item.poly) : '';
  function geoBand() {
    const it = S.item, c = S.ctx || {};
    if (S.kind === 'room' && isFinite(it.zMin) && isFinite(it.zMax)) return [it.zMin - 300, it.zMax + 300];
    return c.band || null;
  }
  let geoT = 0;
  function geocheck(now) {
    clearTimeout(geoT);
    geoT = setTimeout(async () => {
      const it = S.item; if (!it || it.shape !== 'poly') return;
      const k = geoKey(); if (S.geo && S.geo.key === k) { if (now) geoToast(); return; }
      const r = await call('/api/polyedit?action=geocheck', { method: 'POST', body: JSON.stringify({ points: it.poly, band: geoBand(), z: (S.ctx || {}).mapZ }) });
      if (r.status !== 200) { if (now) toast(r.body.error || 'geodata check failed', true); return; }
      if (geoKey() !== k) return;
      S.geo = { key: k, points: r.body.points || [], edges: r.body.edges || [] };
      renderShape(); stats(); if (now) geoToast();
    }, now ? 0 : 700);
  }
  function geoToast() {
    const g = S.geo; if (!g) return;
    const bp = g.points.map((p, i) => p && p.ok === false ? i + 1 : 0).filter(Boolean), be = g.edges.map((x, i) => x === false ? i + 1 : 0).filter(Boolean), none = g.points.filter(p => p && p.ok === null).length;
    toast(!bp.length && !be.length ? `Geodata: every point is on walkable ground, no edge crosses a wall${none ? ` (${none} points without geodata)` : ''}.`
      : `Geodata: ${bp.length ? `points ${bp.slice(0, 12).join(', ')} are not on walkable ground (orange ring)` : 'all points walkable'}; ${be.length ? `edges after points ${be.slice(0, 12).join(', ')} cross a wall (orange dashes) — fine where the outline follows a wall` : 'no edge crosses a wall'}.${S.snap ? '' : ' Turn on ⌖ Snap to move dragged points onto walkable ground.'}`);
  }
  async function snapPoint(i) {
    const it = S.item; if (!it || it.shape !== 'poly' || !it.poly[i]) return;
    const p = it.poly[i];
    const r = await call('/api/polyedit?action=geocheck', { method: 'POST', body: JSON.stringify({ points: [p], band: geoBand(), open: true }) });
    const g = r.status === 200 && r.body.points && r.body.points[0];
    if (!g || g.ok !== false || !g.snap) return;
    if (!it.poly[i] || it.poly[i][0] !== p[0] || it.poly[i][1] !== p[1]) return;     // moved again meanwhile
    it.poly[i] = g.snap; S.dirty = true; renderShape(); stats(); geocheck(false);
    toast(`Point ${i + 1} snapped onto walkable ground (${r0(Math.hypot(g.snap[0] - p[0], g.snap[1] - p[1]))} away).`);
  }

  // ------------------------------------------------------------------------------------------------ fields panel
  function panel() {
    const it = S.item, p = $p('pePanel'); if (!it || !p) return;
    if (isRa()) { raPanel(); return; }
    const num = (id, v, ph) => `<input type="number" id="${id}" value="${isFinite(v) ? v : ''}" placeholder="${ph || ''}" inputmode="numeric">`;
    const room = S.kind === 'room', circle = it.shape !== 'poly';
    p.innerHTML = `<h3>${H(KIND_LABEL[S.kind])} <button id="pePanX" title="close">✕</button></h3>
      <label><span>Name</span><input id="peFName" class="wide" value="${H(it.name)}" maxlength="100"></label>
      <label><span>${room ? 'Monster levels' : 'Levels'}</span>${num('peFLo', it.levelMin)} – ${num('peFHi', it.levelMax)}</label>
      ${room || it.suitsMin != null ? `<label><span>Suits party lvl</span>${num('peFSLo', it.suitsMin)} – ${num('peFSHi', it.suitsMax)}</label>` : ''}
      <label><span>Enabled</span><input type="checkbox" id="peFOn" ${it.enabled !== false ? 'checked' : ''}> <span class="muted">${S.kind === 'zone' ? 'off = the bots never pick it' : 'off = never picked (once swarm.js checks it, see docs/plan/polyedit.md)'}</span></label>
      ${room || circle ? `<h3>Centre${circle ? ' + radius' : ''}</h3><div class="row">x ${num('peFX', it.center[0])} y ${num('peFY', it.center[1])} z ${num('peFZ', it.center[2])}</div>
        <label><span>Radius</span>${num('peFR', it.radius)}<span class="muted">${room ? 'used for "is someone in this room"' : 'the bots hunt in a square of max(3 x radius, 9000)'}</span></label>` : ''}
      ${room || it.zMin != null ? `<label><span>Height band</span>${num('peFZ0', it.zMin)} – ${num('peFZ1', it.zMax)}<span class="muted">monsters / members outside it do not count</span></label>` : ''}
      <label style="display:block"><span>Notes</span><textarea id="peFNotes" maxlength="2000">${H(it.notes || '')}</textarea></label>
      ${room ? `<label><input type="checkbox" id="peFMon" ${S.applyMonsters ? 'checked' : ''}> update the room's monster list from the spawns inside the new outline on save</label>` : ''}
      <div class="row"><button id="peFApply" class="go">Apply</button><button id="pePanLvl" title="set the levels from the monsters inside">Levels from monsters inside</button></div>
      <h3>Shape</h3>
      <div class="row">${circle ? '<button id="pePConv">▱ Make polygon</button>' : ''}<button id="pePFit">☠ Fit to monsters</button><button id="pePRevert" title="drop the changes since you opened it">Undo all changes</button></div>
      <div class="row">${it.edited && it.edited.hasOrig ? '<button id="pePReset" class="bad">Reset to generated</button><span class="muted">edited on the dashboard ' + H(new Date(it.edited.at).toLocaleString()) + '</span>' : '<span class="muted">' + (it.manual ? 'edited on the dashboard' : 'generated / original shape — your first save marks it manual, so the generator tools keep it') + '</span>'}</div>
      ${room && S.ctx && S.ctx.safeStale ? '<div class="live">Safe spots of this floor: being recomputed after the last outline change.</div>' : ''}
      <div class="live">${H((S.data && S.data.live) || '')}</div>
      <div class="muted">File: ${H((S.data && S.data.file) || '')} · id ${H(S.id)} · every save keeps a copy in Scripts/data/history/.</div>`;
    $p('pePanX').onclick = () => { p.hidden = true; };
    $p('peFApply').onclick = applyFields;
    p.querySelectorAll('input,textarea').forEach(el => el.addEventListener('change', applyFields));
    $p('pePanLvl').onclick = () => {
      const P = shapePts(S.item), L = (S.ctx.spawns || []).filter(m => !m.b && inPoly(m.x, m.y, P)).map(m => m.l);
      if (!L.length) { toast('No monsters inside.', true); return; }
      $p('peFLo').value = Math.min(...L); $p('peFHi').value = Math.max(...L); applyFields();
    };
    if ($p('pePConv')) $p('pePConv').onclick = convert;
    $p('pePFit').onclick = fitMobs;
    $p('pePRevert').onclick = async () => { if (!S.dirty || await uiConfirm({ title: 'Drop every change?', body: 'Drop every change since you opened this shape?', confirmText: 'Drop changes', danger: true })) { pushUndo(); S.item = clone(S.loaded); S.sel = -1; S.dirty = false; tools(); render(); panel(); } };
    if ($p('pePReset')) $p('pePReset').onclick = resetGenerated;
  }
  function panelValues() { /* the panel is rebuilt on open; live fields only matter for the centre / radius after a drag */
    const it = S.item; if (isRa()) { const st = it.stage || []; [['peRaSX', st[0]], ['peRaSY', st[1]]].forEach(([id, v]) => { const el = $p(id); if (el && document.activeElement !== el) el.value = v == null ? '' : v; }); return; }
    [['peFX', it.center[0]], ['peFY', it.center[1]], ['peFR', it.radius]].forEach(([id, v]) => { const el = $p(id); if (el && document.activeElement !== el) el.value = v; });
  }
  function applyFields() {
    const it = S.item; if (!it) return;
    if (isRa()) { raApplyFields(); return; }
    const v = (id) => { const el = $p(id); return el ? el.value : undefined; }, n = (id, d) => { const x = v(id); return x === undefined || x === '' ? d : Number(x); };
    const before = snapState();
    it.name = String(v('peFName') ?? it.name).trim() || it.name;
    it.levelMin = n('peFLo', it.levelMin); it.levelMax = n('peFHi', it.levelMax);
    if ($p('peFSLo')) { it.suitsMin = n('peFSLo', it.suitsMin); it.suitsMax = n('peFSHi', it.suitsMax); }
    it.enabled = $p('peFOn') ? $p('peFOn').checked : it.enabled;
    if ($p('peFX')) { it.center = [n('peFX', it.center[0]), n('peFY', it.center[1]), n('peFZ', it.center[2])]; it.radius = n('peFR', it.radius); }
    if ($p('peFZ0')) { it.zMin = n('peFZ0', it.zMin); it.zMax = n('peFZ1', it.zMax); }
    it.notes = v('peFNotes') ?? it.notes;
    if ($p('peFMon')) S.applyMonsters = $p('peFMon').checked;
    if (snapState() !== before) { pushUndo(before); $p('peName').textContent = it.name; changed(); }
  }

  // ------------------------------------------------------------------------------------------------ save / reset
  function summary() {
    const it = S.item, P = shapePts(it), sp = ((S.ctx || {}).spawns || []).filter(m => !m.b), inside = sp.filter(m => inPoly(m.x, m.y, P));
    const L = inside.map(m => m.l), n = inside.reduce((t, m) => t + (m.c || 1), 0);
    return `${it.shape === 'poly' ? it.poly.length + ' points' : 'circle r ' + it.radius}, area ≈ ${r0(Math.sqrt(area(P)))} × ${r0(Math.sqrt(area(P)))}, ${n} monsters inside${L.length ? ` (lvl ${Math.min(...L)}-${Math.max(...L)})` : ''}, levels ${it.levelMin}-${it.levelMax}${it.enabled === false ? ', OFF' : ''}`;
  }
  async function save() {
    const it = S.item; if (!it || S.busy) return;
    if (!$p('pePanel').hidden) applyFields();
    if (it.shape === 'poly' && (it.poly.length < 3 || selfX(it.poly).size)) { toast('Fix the outline first (at least 3 points, no crossing edges).', true); return; }
    const what = S.kind === 'room' ? 'the leader hunts only inside this room outline' : 'the party hunts only inside this shape';
    if (S.asking) return;
    S.asking = true;
    const okSave = await uiConfirm(isRa() ? raConfirmText() : { title: `Save ${KIND_LABEL[S.kind].toLowerCase()} "${it.name}"?`, confirmText: 'Save', body: [uiP(uiEm(summary())),
      `Used by every party (${what}). Marked as edited by hand, so the generator tools keep it.`, uiNote('A copy of the file goes to Scripts/data/history/.'), (S.data && S.data.live) || ''] });
    S.asking = false;
    if (!okSave || S.busy) return;
    S.busy = true; $p('peSave').disabled = true; $p('peSave').textContent = 'Saving…';
    const layWas = it.layer;
    const r = await call(`/api/polyedit?kind=${S.kind}&id=${encodeURIComponent(S.id)}`, { method: 'POST', body: JSON.stringify({ rev: S.rev, item: isRa() ? raPayload(it) : it, applyMonsters: S.applyMonsters }) });
    S.busy = false; $p('peSave').textContent = 'Save';
    if (r.status === 409) { if (await uiConfirm({ title: 'Changed meanwhile', body: [r.body.error, 'Reload the shape from the file now?', uiNote('Your changes are lost; Keep them keeps them on screen.')], confirmText: 'Reload from file', cancelText: 'Keep them', danger: true })) { S.dirty = false; await load(); } else stats(); return; }
    if (r.status !== 200 || !r.body.ok) { toast('Not saved: ' + (r.body.error || ('error ' + r.status)), true); stats(); return; }
    S.dirty = false;
    const newId = r.body.id;
    if (newId && newId !== S.id) { S.id = newId; try { history.replaceState(null, '', `#/edit/${S.kind}/${encodeURIComponent(newId)}`); } catch (e) { } }
    await load(true);
    if (isRa() && layWas === 'clear' && S.item.clearPoly) raLayer('clear', true);
    toast(`✓ Saved (${(r.body.changed || []).join(', ') || 'no change'}).${(r.body.warnings || []).length ? ' ⚠ ' + r.body.warnings.join(' · ') : ''}${(r.body.jobs || []).filter(j => j.id).length ? ' Recomputing: ' + r.body.jobs.filter(j => j.id).map(j => j.type === 'safespots' ? 'safe spots of this floor' : 'zone sub-areas').join(', ') + '…' : ''}`);
    if ((r.body.jobs || []).some(j => j.id)) watchJobs(r.body.jobs.filter(j => j.id).map(j => j.id));
    picks.loaded = 0;
  }
  async function resetGenerated() {
    if (!await uiConfirm(isRa() ? { title: `Remove the fight area of "${S.item.name}"?`, body: ['The bots go back to the defaults (clear only aggressive monsters within 1200 of the boss, stage ~1500 away on the way in).', uiNote('A history copy is kept.')], confirmText: 'Remove fight area', danger: true }
      : { title: `Reset "${S.item.name}"?`, body: ['Reset to the generated shape and values? The manual mark is removed, so the generator tools may change it again.', uiNote('A history copy is kept.')], confirmText: 'Reset', danger: true })) return;
    const r = await call(`/api/polyedit?action=reset&kind=${S.kind}&id=${encodeURIComponent(S.id)}`, { method: 'POST', body: JSON.stringify({ rev: S.rev }) });
    if (r.status !== 200) { toast('Not reset: ' + (r.body.error || r.status), true); return; }
    S.dirty = false; S.undo = []; S.redo = [];
    if (r.body.id && r.body.id !== S.id) { S.id = r.body.id; try { history.replaceState(null, '', `#/edit/${S.kind}/${encodeURIComponent(S.id)}`); } catch (e) { } }
    await load(true); toast(isRa() ? '✓ Fight area removed — the bots use the defaults for this boss.' : '✓ Reset to the generated shape.');
    if ((r.body.jobs || []).some(j => j.id)) watchJobs(r.body.jobs.filter(j => j.id).map(j => j.id));
  }
  function watchJobs(ids) {
    clearTimeout(S.jobsT);
    const poll = async () => {
      const r = await call('/api/polyedit?action=jobs'); if (r.status !== 200) return;
      const mine = (r.body.jobs || []).filter(j => ids.includes(j.id));
      if (mine.length && mine.every(j => j.done)) {
        toast(mine.map(j => `${j.type === 'safespots' ? 'Safe spots' : 'Zone sub-areas'}: ${j.code === 0 ? '✓ ' : '✕ '}${j.last || ''}`).join(' · '), mine.some(j => j.code !== 0));
        if (S.open && S.kind === 'room' && !S.dirty) await load(true);
        return;
      }
      S.jobsT = setTimeout(poll, 3000);
    };
    S.jobsT = setTimeout(poll, 2500);
  }

  let toastT = 0;
  function toast(msg, bad) {
    const t = $p('peToast'); if (!t) return;
    t.innerHTML = `<button class="x" title="close">✕</button>${H(msg)}`; t.classList.toggle('bad', !!bad); t.hidden = false;
    t.querySelector('.x').onclick = () => { t.hidden = true; };
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, bad ? 15000 : Math.min(15000, 4000 + msg.length * 40));
  }

  // ------------------------------------------------------------------------------------------------ "edit" entry points on the Rooms / Spots / Zones tabs
  const picks = { loaded: 0, data: null };
  async function pickData() {
    if (picks.data && Date.now() - picks.loaded < 30000) return picks.data;
    const r = await call('/api/polyedit?list=zone,spot,area');
    picks.data = r.status === 200 ? r.body : { error: r.body.error || NEEDS_RESTART }; picks.loaded = Date.now();
    return picks.data;
  }
  function openEditor(kind, id, from) { if (!id) { uiAlert({ title: 'Nothing picked', body: 'Pick something to edit first.' }); return; } S.ret = from || RETURN[kind]; const h = `#/edit/${kind}/${encodeURIComponent(id)}`; if (typeof go === 'function') go(h); else location.hash = h; }
  function pickBox(tabId, kinds, title) {
    const sec = $p(tabId); if (!sec || sec.querySelector('.pe-pick')) return;
    const box = document.createElement('div'); box.className = 'box pe-pick';
    box.innerHTML = `<h3 style="margin-top:0">✎ ${H(title)}</h3><div class="act"><input type="search" placeholder="filter…" class="pe-f"><select class="pe-s"><option>loading…</option></select><button type="button" class="pe-go">Edit shape</button></div>
      <div class="muted">Opens the full-screen shape editor: drag points, move the whole shape, add / delete points, pinch to zoom (phone) — then Save.</div>`;
    const head = sec.querySelector('.whead'); const after = head && head.nextElementSibling && head.nextElementSibling.classList.contains('muted') ? head.nextElementSibling : head;
    if (after) after.after(box); else sec.prepend(box);
    const fill = async () => {
      const d = await pickData(), sel = box.querySelector('.pe-s'), f = box.querySelector('.pe-f').value.toLowerCase().trim();
      if (d.error) { sel.innerHTML = `<option value="">${H(d.error)}</option>`; return; }
      const grp = { zone: 'Hunting zones / spots (custom_zones.json)', spot: 'Datapack spots (fallback list)', area: 'Field areas (field_areas.json)' };
      const cur = sel.value;
      sel.innerHTML = kinds.filter(k => (d[k] || []).length).map(k => `<optgroup label="${H(grp[k])}">${(d[k] || []).slice().sort((a, b) => ((a.levels || [])[0] || 0) - ((b.levels || [])[0] || 0) || String(a.name).localeCompare(b.name))
        .filter(x => !f || (x.name + ' ' + (x.group || '')).toLowerCase().includes(f))
        .map(x => `<option value="${H(k + '|' + x.id)}">${H(x.name)}${x.levels && x.levels[0] ? ` (${x.levels[0]}-${x.levels[1]})` : ''}${x.shape === 'poly' ? ' ▱' : x.shape === 'rooms' ? ' · rooms' : ' ○'}${x.manual ? ' ✎' : ''}${x.enabled === false ? ' OFF' : ''}</option>`).join('')}</optgroup>`).join('') || '<option value="">nothing found</option>';
      if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
    };
    box.querySelector('.pe-f').addEventListener('input', fill);
    box.querySelector('.pe-go').onclick = () => { const v = box.querySelector('.pe-s').value; if (!v) return; const i = v.indexOf('|'); openEditor(v.slice(0, i), v.slice(i + 1), '#/' + tabId.replace('tab-', '')); };
    box._fill = fill;
    if (!sec.hidden) fill();
  }
  function injectRooms() {
    const info = $p('rmInfo'); if (!info || $p('peRoomBtn')) return;
    const d = document.createElement('div'); d.className = 'act'; d.style.margin = '0 0 8px';
    d.innerHTML = `<button type="button" id="peRoomBtn">✎ Edit this room's outline</button><span class="muted">drag the room's corners on the floor map, move it, set its levels / centre</span>`;
    info.before(d);
    $p('peRoomBtn').onclick = () => openEditor('room', ($p('rmRoom') || {}).value, '#/rooms');
  }
  function injectZones() {
    const h = document.querySelector('#zeBox h3'); if (!h || $p('peZoneBtn')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'peZoneBtn'; b.className = 'pe-btn'; b.textContent = '✎ Drag-edit shape';
    b.title = 'full-screen shape editor for the zone picked below (drag points, move, levels)';
    b.onclick = () => { let n = ($p('zeZone') || {}).value; try { if (!n && typeof ZE !== 'undefined' && ZE.z) n = ZE.z.oldName; } catch (e) { } openEditor('zone', n, '#/zones'); };
    h.appendChild(b);
  }
  function inject() {
    try { injectRooms(); injectZones(); pickBox('tab-spots', ['zone', 'spot', 'area'], 'Edit a spot\'s shape'); pickBox('tab-zones', ['zone', 'area'], 'Edit a zone\'s shape'); } catch (e) { console.warn('polyedit inject', e); }
  }
  function refreshPicks() { document.querySelectorAll('.pe-pick').forEach(b => { if (b._fill && b.offsetParent) b._fill(); }); }
  window.addEventListener('hashchange', () => { inject(); setTimeout(refreshPicks, 50); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();

  window.PolyEdit = { open, close, isOpen: () => S.open, _S: S };
  // a page opened straight on #/edit/... before index.html's route() knew about it
  if (/^#\/?edit\//.test(location.hash)) setTimeout(() => { if (!S.open) open(location.hash); }, 0);
})();
