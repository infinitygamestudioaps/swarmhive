// FULL-SCREEN HUNTING-SPOT EDITOR (user 2026-10-07: "I want to sit on my laptop and use my mouse to create waypoints to the hunting
// location, mark up the area where they hunt, exclude objects/areas, work on different floors (Tower of Insolence, Giant's Cave, Antharas'
// Lair, Cruma Tower, Elven Fortress ...), full-screen map, works on iPhone, iPad and desktop").
//
// Page: #/spot/<spot name>  (#/spot/new = new spot, #/spot = pick one). Loaded by index.html after its main script, so it uses that script's
// globals: api(), esc(), STATE, go(), navDepth, ugLayer(), partyColor().
// Data: the same Scripts/data/custom_zones.json entry the Zones/Spots tabs edit (POST /api/zones, read live by swarm.js):
//   poly (hunting area), holes (exclusion polygons), circles [{x,y,z,r}] (round exclusions), waypoints [{x,y,z}] (landing -> area, every
//   member walks each point), travel {kind:'town',town} | {kind:'gk',desc} (the start), floor {name,zMin,zMax} (hunt only on that height
//   band), avoidMobs [names], teams [...], levelMin/levelMax, kind, enabled. Pull routes drawn in the Zones tab are kept untouched.
// Map: /minitile pieces (layer pieces for stacked floors via ugLayer), datapack spawns (/api/spawnsin), teleport landings (/api/spotplaces),
// live characters (STATE) and the monsters a nearby party leader sees (/api/partymobs). Geodata: /api/geoz (floor heights at a point) and
// /api/geocheck (is each waypoint leg free of walls).
(function () {
  'use strict';
  const MT = 8192, REG = 32768;
  const COL = { area: '#3ddc84', hole: '#ff4d4d', way: '#5ad1ff', start: '#ffffff', circle: '#ff4d4d' };
  const TOOLS = [
    ['pan', '✋ Move map', 'Drag to move the map, pinch / wheel to zoom. Tap a point to select it.'],
    ['start', '⚑ Start', 'Tap a <b>blue square</b> (gatekeeper landing) or a <b>gold square</b> (.town) — that is where the team starts.'],
    ['way', '➜ Waypoints', 'Tap to add the next waypoint (tap on a line to insert one). Drag a point to move it. The whole team walks every point.'],
    ['area', '▱ Hunt area', 'Tap around the hunting area (tap on an edge to insert). Drag the corners. The team only fights inside it.'],
    ['hole', '⛔ Exclude area', 'Tap around an area the team must never fight in. <b>+ New</b> starts another one.'],
    ['circle', '⭘ Exclude circle', 'Tap to drop a no-fight circle; drag its centre to move it, the small handle to resize.'],
    ['mob', '☠ Avoid monster', 'Tap a monster dot: that monster kind is never fought in this spot (tap again to allow it).'],
  ];
  const S = {
    open: false, root: null, svg: null, W: 0, H: 0,
    view: { cx: 83473, cy: 148554, s: 12 },          // s = world units per screen pixel
    tool: 'pan', M: null, sel: null, holeI: -1, dirty: false, undo: [], redo: [],
    mobs: [], mobsKey: '', live: [], liveAt: 0, places: null, landings: { gk: [], towns: {} }, zones: [],
    floor: null,                                      // VIEW floor (what the map shows): {name,zMin,zMax} or null
    autoBands: [], legs: [], showMobs: true, showLand: true, showChars: true, tileKey: '', pointers: new Map(), gesture: null,
  };
  const $s = (id) => document.getElementById(id);
  const coarse = () => window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const r0 = (v) => Math.round(+v);

  // ---------------------------------------------------------------------------------------------------------------- DOM
  function build() {
    if (S.root) return;
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/spoteditor.css'; document.head.appendChild(css);
    const d = document.createElement('div'); d.id = 'spEd'; d.className = 'sped'; d.hidden = true;
    d.innerHTML = `
<svg class="spedmap" id="spedSvg" xmlns="http://www.w3.org/2000/svg"><g id="spedTiles"></g><g id="spedMobs"></g><g id="spedLand"></g><g id="spedChars"></g><g id="spedShapes"></g><g id="spedHandles"></g></svg>
<div class="bar top">
  <button id="spedBack" title="back">◀</button>
  <input id="spedName" class="name" placeholder="spot name">
  <select id="spedFloor" title="which floor / height the map shows"></select>
  <button id="spedUndo" title="undo (Ctrl+Z)">↶</button><button id="spedRedo" title="redo (Ctrl+Y)">↷</button>
  <button id="spedFit" title="show the whole spot">⤢</button>
  <button id="spedSet" title="settings: levels, parties, start, floor, avoid list, find a place">☰</button>
  <button id="spedSave" class="go">Save</button>
</div>
<div class="legend" id="spedLegend"><i style="background:#5ad1ff"></i>waypoints<i style="background:#3ddc84"></i>hunt area<i style="background:#ff4d4d"></i>excluded<br><i style="background:#5aa9ff"></i>teleport landing<i style="background:#f0c040"></i>.town<br>monsters: <i style="background:#9aa39e"></i>low<i style="background:#3ddc84"></i>fits<i style="background:#ffae42"></i>above<i style="background:#ff4d4d"></i>too high<i style="background:#b16cff"></i>raid boss</div>
<div class="toast" id="spedToast" hidden></div>
<div class="bar bottom">
  <div class="selbox" id="spedSel" hidden></div>
  <div class="hint" id="spedHint"></div>
  <div class="tools" id="spedTools"></div>
</div>
<div class="panel" id="spedPanel" hidden></div>`;
    document.body.appendChild(d);
    S.root = d; S.svg = $s('spedSvg');
    $s('spedTools').innerHTML = TOOLS.map(([k, t]) => `<button data-tool="${k}">${t}</button>`).join('') + `<button id="spedNewHole" title="start another exclusion area">+ New</button>`;
    $s('spedTools').onclick = (e) => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); };
    $s('spedNewHole').onclick = () => { snap(); S.M.holes.push([]); S.holeI = S.M.holes.length - 1; setTool('hole'); touch(); };
    $s('spedBack').onclick = back;
    $s('spedSave').onclick = save;
    $s('spedUndo').onclick = undo; $s('spedRedo').onclick = redo;
    $s('spedFit').onclick = () => { fit(); render(); };
    $s('spedSet').onclick = () => { const p = $s('spedPanel'); p.hidden = !p.hidden; if (!p.hidden) panel(); };
    $s('spedName').oninput = () => { if (S.M) { S.M.name = $s('spedName').value; S.dirty = true; } };
    $s('spedFloor').onchange = () => { const v = $s('spedFloor').value; S.floor = v ? JSON.parse(v) : null; S.mobsKey = ''; S.tileKey = ''; render(); };
    const svg = S.svg;
    svg.addEventListener('pointerdown', onDown); svg.addEventListener('pointermove', onMove);
    ['pointerup', 'pointercancel'].forEach(ev => svg.addEventListener(ev, onUp));
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS Safari: stop the page itself from pinch-zooming while the map is open
    ['gesturestart', 'gesturechange'].forEach(ev => d.addEventListener(ev, (e) => e.preventDefault()));
    window.addEventListener('resize', () => { if (S.open) render(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', (e) => { if (S.open && S.dirty) { e.preventDefault(); e.returnValue = ''; } });
    setInterval(() => { if (S.open && !document.hidden) { drawChars(); pollLive(); } }, 3000);
  }

  // ---------------------------------------------------------------------------------------------------------------- open / close
  async function open(name) {
    build();
    S.open = true; S.root.hidden = false; document.body.style.overflow = 'hidden'; document.documentElement.style.overflow = 'hidden';
    if (!S.places) {
      try { const d = await api('/api/spotplaces'); S.places = d.places || []; S.landings = d.landings || { gk: [], towns: {} }; } catch (e) { S.places = []; }
    }
    try { S.zones = (await api('/api/zones')).zones || []; } catch (e) { S.zones = []; }
    S.undo = []; S.redo = []; S.sel = null; S.dirty = false; S.legs = [];
    $s('spedPanel').hidden = true;
    if (name && name !== 'new') {
      const z = S.zones.find(o => o.name === name);
      if (!z) { toast(`No spot called "${name}" — pick one or start a new one`); S.M = null; pickPanel(); render(); return; }
      S.M = fromZone(z);
      S.floor = S.M.floor ? { ...S.M.floor } : null;
      fit();
      setTool(S.M.poly.length ? 'pan' : 'area');
    } else if (name === 'new') {
      const c = ((typeof STATE !== 'undefined' && STATE && STATE.chars) || []).find(x => x.ageSec <= 60 && isFinite(x.x));
      const v = S.view;
      S.M = fromZone({ name: 'New spot ' + new Date().toISOString().slice(5, 16).replace('T', ' '), levelMin: c ? Math.max(1, (c.level || 1) - 3) : 1, levelMax: c ? (c.level || 1) + 5 : 85,
        teams: c && c.party ? [c.party] : ['all'], enabled: true, x: v.cx, y: v.cy, z: c ? c.z : 0 });
      S.M.isNew = true; S.M.oldName = null; S.dirty = true; S.floor = null;
      setTool('start');
      toast('New spot: 1) Start — tap where the team teleports in · 2) Waypoints · 3) Hunt area. Use ☰ to find a place.', 7000);
      $s('spedPanel').hidden = false; panel();
    } else { S.M = null; pickPanel(); }
    fillFloors(); render();
  }
  function close() {
    if (!S.root || !S.open) return;
    S.open = false; S.root.hidden = true; document.body.style.overflow = ''; document.documentElement.style.overflow = '';
  }
  async function back() {   // async since UIDIALOG 2026-10-10
    if (S.dirty && S.M) { if (S.asking) return; S.asking = true; const ok = await uiConfirm({ title: 'Leave without saving?', body: 'Leave without saving the changes to this spot?', confirmText: 'Leave', cancelText: 'Stay', danger: true }); S.asking = false; if (!ok) return; }
    S.dirty = false;
    if (typeof navDepth !== 'undefined' && navDepth > 0) history.back(); else go('#/spots');
  }
  function fromZone(z) {
    const P = (a) => (Array.isArray(a) ? a : []).filter(p => p && isFinite(p.x) && isFinite(p.y)).map(p => ({ x: r0(p.x), y: r0(p.y), ...(isFinite(p.z) ? { z: r0(p.z) } : {}) }));
    return {
      name: z.name, oldName: z.isNew ? null : z.name, levelMin: z.levelMin || 1, levelMax: z.levelMax || 85,
      teams: Array.isArray(z.teams) ? z.teams.slice() : [z.team || 'all'], enabled: z.enabled !== false, kind: z.kind || 'any',
      travel: z.travel || (z.gkDesc ? { kind: 'gk', desc: z.gkDesc } : null), x: z.x, y: z.y, z: z.z || 0, radius: z.radius || 2500,
      poly: P(z.poly), holes: (z.holes || []).map(P), circles: (z.circles || []).map(c => ({ x: r0(c.x), y: r0(c.y), r: r0(c.r), ...(isFinite(c.z) ? { z: r0(c.z) } : {}) })),
      waypoints: P(z.waypoints), floor: z.floor || null, avoidMobs: (z.avoidMobs || []).slice(), pulls: z.pulls || [], note: z.note || '',
      rooms: z.rooms || null, dungeon: z.dungeon || null,
    };
  }

  // ---------------------------------------------------------------------------------------------------------------- view math
  function size() { const r = S.svg.getBoundingClientRect(); S.W = r.width || window.innerWidth; S.H = r.height || window.innerHeight; return r; }
  function vb() { const s = S.view.s; return { x0: S.view.cx - S.W * s / 2, y0: S.view.cy - S.H * s / 2, w: S.W * s, h: S.H * s }; }
  function toWorld(cx, cy) { const r = S.svg.getBoundingClientRect(), b = vb(); return { x: Math.round(b.x0 + (cx - r.left) * S.view.s), y: Math.round(b.y0 + (cy - r.top) * S.view.s) }; }
  function clampS(s) { return Math.max(0.6, Math.min(160, s)); }
  function allPts() { const M = S.M; if (!M) return []; return M.poly.concat(M.waypoints, ...M.holes, M.circles.map(c => ({ x: c.x - c.r, y: c.y - c.r })), M.circles.map(c => ({ x: c.x + c.r, y: c.y + c.r }))).concat(startPt() ? [startPt()] : []); }
  function fit() {
    size();
    const pts = allPts();
    if (S.M && !S.M.poly.length && isFinite(S.M.x)) { const R = Math.min(S.M.radius || 3000, 9000); pts.push({ x: S.M.x - R, y: S.M.y - R }, { x: S.M.x + R, y: S.M.y + R }); }
    if (!pts.length) { if (S.M && isFinite(S.M.x)) S.view = { cx: S.M.x, cy: S.M.y, s: Math.max(4, (S.M.radius || 3000) * 2.4 / Math.min(S.W, S.H)) }; return; }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const w = Math.max(...xs) - Math.min(...xs) + 1600, h = Math.max(...ys) - Math.min(...ys) + 1600;
    S.view = { cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, s: clampS(Math.max(w / S.W, h / (S.H * 0.8))) };
  }
  function startPt() {
    const t = S.M && S.M.travel; if (!t) return null;
    if (t.kind === 'town') { const T = (S.landings.towns || {})[t.town]; return T ? { x: T[0], y: T[1], z: T[2] } : null; }
    const l = (S.landings.gk || []).find(o => o.desc === t.desc); return l ? { x: l.x, y: l.y, z: l.z } : null;
  }

  // ---------------------------------------------------------------------------------------------------------------- rendering
  let raf = 0;
  function render() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
  function draw() {
    if (!S.open) return;
    size();
    const b = vb();
    S.svg.setAttribute('viewBox', `${b.x0} ${b.y0} ${b.w} ${b.h}`);
    S.svg.setAttribute('preserveAspectRatio', 'none');
    S.svg.classList.toggle('pan', S.tool === 'pan');
    drawTiles(b); drawMobs(); drawLand(b); drawChars(); drawShapes();
    $s('spedName').value = S.M ? S.M.name : '';
    $s('spedName').disabled = !S.M;
    document.querySelectorAll('#spedTools [data-tool]').forEach(x => x.classList.toggle('on', x.dataset.tool === S.tool));
    $s('spedNewHole').hidden = S.tool !== 'hole';
    $s('spedUndo').disabled = !S.undo.length; $s('spedRedo').disabled = !S.redo.length;
    $s('spedSave').textContent = S.dirty ? 'Save •' : 'Save';
    hint(); selBox();
    clearTimeout(S.mobT); S.mobT = setTimeout(loadMobs, 350);
  }
  function drawTiles(b) {
    const s = S.view.s, out = [];
    const mid = S.floor ? (S.floor.zMin + S.floor.zMax) / 2 : null;
    if (s > 30) {                                   // far out: one picture per region (/maptiles)
      for (let rx = Math.floor(b.x0 / REG); rx * REG < b.x0 + b.w; rx++) for (let ry = Math.floor(b.y0 / REG); ry * REG < b.y0 + b.h; ry++)
        out.push(`<image href="/maptiles/${rx + 20}_${ry + 18}.jpg" x="${rx * REG}" y="${ry * REG}" width="${REG}" height="${REG}" preserveAspectRatio="none"/>`);
    } else {
      for (let gx = Math.floor(b.x0 / MT); gx * MT < b.x0 + b.w; gx++) for (let gy = Math.floor(b.y0 / MT); gy * MT < b.y0 + b.h; gy++) {
        const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, c = gx - Math.floor(gx / 4) * 4, r = gy - Math.floor(gy / 4) * 4;
        const L = typeof ugLayer === 'function' && mid != null ? ugLayer(RX, RY, mid, gx * MT + MT / 2, gy * MT + MT / 2) : '';
        out.push(`<image href="/minitile/${RX}_${RY}${L}_${c}_${r}.jpg" x="${gx * MT}" y="${gy * MT}" width="${MT}" height="${MT}" preserveAspectRatio="none"/>`);
      }
    }
    const key = out.join('');
    if (key !== S.tileKey) { S.tileKey = key; $s('spedTiles').innerHTML = key; }
  }
  const inBand = (z) => !S.floor || z == null || (z >= S.floor.zMin - 150 && z <= S.floor.zMax + 150);
  function lvCol(l) { const lo = S.M ? S.M.levelMin : 1, hi = S.M ? S.M.levelMax : 99; return l < lo - 3 ? '#9aa39e' : l <= hi ? '#3ddc84' : l <= hi + 4 ? '#ffae42' : '#ff4d4d'; }
  function drawMobs(force) {
    const g = $s('spedMobs');
    if (!S.showMobs) { g.innerHTML = ''; S.mobDraw = ''; return; }
    const dk = [S.view.s, S.mobVer, S.liveVer, S.floor ? S.floor.zMin + '_' + S.floor.zMax : '', S.M ? S.M.levelMin + '_' + S.M.levelMax + '_' + S.M.avoidMobs.join('|') : ''].join(';');
    if (!force && dk === S.mobDraw) return;
    S.mobDraw = dk;
    const s = S.view.s, rr = (coarse() ? 3.4 : 2.8) * s, avoid = new Set(((S.M && S.M.avoidMobs) || []).map(n => n.toLowerCase()));
    const lab = s < 4;
    let h = '';
    S.mobs.forEach(m => {
      if (!inBand(m.z)) return;
      const av = avoid.has(String(m.n).toLowerCase());
      if (m.b) h += `<circle cx="${m.x}" cy="${m.y}" r="${7 * s}" fill="#b16cff" stroke="#000" stroke-width="${s}"/>` + text(m.x + 9 * s, m.y + 4 * s, `♛ ${m.n} ${m.l}`, 10, '#d6b3ff');
      else h += `<circle cx="${m.x}" cy="${m.y}" r="${rr}" fill="${av ? '#000' : lvCol(m.l)}" stroke="${av ? '#ff4d4d' : '#000'}" stroke-width="${(av ? 1.6 : 0.5) * s}"/>` + (lab ? text(m.x + 4 * s, m.y - 3 * s, `${m.n} ${m.l}`, 9, av ? '#ff8080' : lvCol(m.l)) : '');
    });
    S.live.forEach(m => { if (!inBand(m.z)) return; h += `<rect x="${m.x - 3 * s}" y="${m.y - 3 * s}" width="${6 * s}" height="${6 * s}" fill="${m.raid ? '#b16cff' : '#ff2d2d'}" stroke="#fff" stroke-width="${0.7 * s}"/>`; });
    g.innerHTML = h;
  }
  function text(x, y, t, size, fill) { const s = S.view.s; return `<text x="${x}" y="${y}" font-size="${size * s}" fill="${fill || '#fff'}" paint-order="stroke" stroke="#000" stroke-width="${3 * s}" stroke-linejoin="round" pointer-events="none">${esc(t)}</text>`; }
  function drawLand(b) {
    const g = $s('spedLand');
    if (!S.showLand) { g.innerHTML = ''; return; }
    const s = S.view.s, m = 3000, sz = (coarse() ? 11 : 8) * s;
    const inV = (x, y) => x > b.x0 - m && x < b.x0 + b.w + m && y > b.y0 - m && y < b.y0 + b.h + m;
    const t = S.M && S.M.travel;
    let h = '';
    // several destinations land on the same spot: one square, the labels stacked
    const groups = {};
    (S.landings.gk || []).filter(l => isFinite(l.x) && inV(l.x, l.y)).forEach(l => { const k = Math.round(l.x / 200) + '_' + Math.round(l.y / 200); (groups[k] = groups[k] || []).push(l); });
    Object.values(groups).forEach(L => {
      const l = L[0], on = t && t.kind === 'gk' && L.some(o => o.desc === t.desc);
      h += `<rect x="${l.x - sz}" y="${l.y - sz}" width="${2 * sz}" height="${2 * sz}" fill="${on ? '#fff' : '#5aa9ff'}" stroke="#000" stroke-width="${s}"/>`;
      if (s < 25) L.slice(0, 4).forEach((o, i) => { h += text(l.x + sz + 3 * s, l.y + 4 * s + i * 11 * s, o.desc + (i === 3 && L.length > 4 ? ` (+${L.length - 4})` : ''), 9, on && o.desc === t.desc ? '#fff' : '#9cc8ff'); });
    });
    Object.entries(S.landings.towns || {}).filter(([, T]) => inV(T[0], T[1])).forEach(([n, T]) => {
      const on = t && t.kind === 'town' && t.town === n;
      h += `<rect x="${T[0] - sz * 1.2}" y="${T[1] - sz * 1.2}" width="${2.4 * sz}" height="${2.4 * sz}" fill="${on ? '#fff' : '#f0c040'}" stroke="#000" stroke-width="${s}"/>` + text(T[0] + sz * 1.4, T[1] + 4 * s, '.' + n.toLowerCase(), 11, '#f0c040');
    });
    // named dungeons in view: their name at the entrance
    (S.places || []).filter(p => isFinite(p.x) && inV(p.x, p.y)).forEach(p => { if (s < 40) h += text(p.x + 6 * s, p.y - 8 * s, '⌂ ' + p.name, 10, '#ffd9a0'); });
    g.innerHTML = h;
  }
  function drawChars() {
    const g = $s('spedChars'); if (!g) return;
    if (!S.showChars || typeof STATE === 'undefined' || !STATE) { g.innerHTML = ''; return; }
    const s = S.view.s, b = vb();
    g.innerHTML = (STATE.chars || []).filter(c => isFinite(c.x) && c.ageSec <= 60 && c.x > b.x0 && c.x < b.x0 + b.w && c.y > b.y0 && c.y < b.y0 + b.h && inBand(c.z)).map(c =>
      `<circle cx="${c.x}" cy="${c.y}" r="${5 * s}" fill="${typeof partyColor === 'function' ? partyColor(c.party) : '#fff'}" stroke="#fff" stroke-width="${1.2 * s}"/>` + text(c.x + 7 * s, c.y + 4 * s, c.name, 10)).join('');
  }
  function drawShapes() {
    const g = $s('spedShapes'), hg = $s('spedHandles'), M = S.M;
    if (!M) { g.innerHTML = ''; hg.innerHTML = ''; return; }
    const s = S.view.s, sw = 2.2 * s;
    const pts = (P) => P.map(p => p.x + ',' + p.y).join(' ');
    let h = '';
    // a spot without a drawn area yet: its old centre + radius (the bots hunt a square around it), as a guide
    if (!M.poly.length && isFinite(M.x) && !M.isNew) h += `<circle cx="${M.x}" cy="${M.y}" r="${M.radius || 3000}" fill="none" stroke="${COL.area}" stroke-width="${1.5 * s}" stroke-dasharray="${10 * s} ${6 * s}" opacity="0.8"/>` + text(M.x, M.y - (M.radius || 3000) - 6 * s, 'old centre + radius — draw the hunt area', 10, COL.area);
    if (M.poly.length >= 2) h += `<polygon points="${pts(M.poly)}" fill="${COL.area}" fill-opacity="0.15" stroke="${COL.area}" stroke-width="${(S.tool === 'area' ? 3 : 2) * s}"/>`;
    M.holes.forEach((H, i) => { if (H.length >= 2) h += `<polygon points="${pts(H)}" fill="${COL.hole}" fill-opacity="0.28" stroke="${COL.hole}" stroke-width="${sw}"${S.tool === 'hole' && i === S.holeI ? '' : ` stroke-dasharray="${6 * s} ${4 * s}"`}/>`; });
    M.circles.forEach(c => { h += `<circle cx="${c.x}" cy="${c.y}" r="${c.r}" fill="${COL.circle}" fill-opacity="0.22" stroke="${COL.circle}" stroke-width="${sw}" stroke-dasharray="${6 * s} ${4 * s}"/>`; });
    (M.pulls || []).forEach(r => { if ((r.points || []).length > 1) h += `<polyline points="${pts(r.points)}" fill="none" stroke="#ffd34d" stroke-width="${1.6 * s}" stroke-dasharray="${4 * s} ${4 * s}" opacity="0.7"/>`; });
    // the walk: start landing -> waypoints (a leg the geodata says runs into a wall is red)
    const st = startPt(), W = (st ? [st] : []).concat(M.waypoints);
    for (let i = 0; i + 1 < W.length; i++) {
      const bad = S.legs[i] === false, a = W[i], c = W[i + 1];
      h += `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="${bad ? '#ff3b3b' : COL.way}" stroke-width="${(bad ? 3.5 : 2.6) * s}"${st && i === 0 ? ` stroke-dasharray="${8 * s} ${5 * s}"` : ''} opacity="${inBand(a.z) || inBand(c.z) ? 1 : 0.35}"/>`;
      if (bad) h += text((a.x + c.x) / 2, (a.y + c.y) / 2, '⚠ wall?', 10, '#ff8080');
    }
    if (st) h += `<circle cx="${st.x}" cy="${st.y}" r="${9 * s}" fill="none" stroke="#fff" stroke-width="${2.5 * s}"/>` + text(st.x + 11 * s, st.y - 9 * s, 'START ' + (M.travel.kind === 'town' ? '.' + String(M.travel.town).toLowerCase() : M.travel.desc), 11, '#fff');
    if (M.floor) { const c = center(); if (c) h += text(c.x, c.y, `hunting floor: ${M.floor.name} (z ${M.floor.zMin}..${M.floor.zMax})`, 11, '#c8ffd8'); }
    g.innerHTML = h;
    // handles
    const R = (coarse() ? 10 : 6.5) * s;
    let hh = '';
    const handle = (key, p, col, active, label) => {
      const sel = S.sel === key, dim = !inBand(p.z);
      hh += `<circle data-h="${key}" cx="${p.x}" cy="${p.y}" r="${(sel ? 1.35 : active ? 1 : 0.7) * R}" fill="${sel ? '#fff' : col}" fill-opacity="${dim ? 0.35 : active ? 1 : 0.6}" stroke="#000" stroke-width="${1.2 * s}" style="cursor:grab"/>`;
      if (label) hh += text(p.x + R + 2 * s, p.y - R * 0.6, label, 10, sel ? '#fff' : col);
    };
    M.waypoints.forEach((p, i) => handle('w:' + i, p, COL.way, S.tool === 'way', String(i + 1)));
    M.poly.forEach((p, i) => handle('a:' + i, p, COL.area, S.tool === 'area', S.sel === 'a:' + i ? String(i + 1) : ''));
    M.holes.forEach((H, hi) => H.forEach((p, i) => handle(`h:${hi}:${i}`, p, COL.hole, S.tool === 'hole' && hi === S.holeI, '')));
    M.circles.forEach((c, i) => { handle('c:' + i, c, COL.circle, S.tool === 'circle', ''); handle('r:' + i, { x: c.x + c.r, y: c.y, z: c.z }, '#ffb0b0', S.tool === 'circle', S.sel === 'c:' + i || S.sel === 'r:' + i ? 'r ' + c.r : ''); });
    hg.innerHTML = hh;
  }
  function center() { const M = S.M; const P = M.poly.length ? M.poly : M.waypoints.slice(-1); if (!P.length) return null; return { x: P.reduce((t, p) => t + p.x, 0) / P.length, y: P.reduce((t, p) => t + p.y, 0) / P.length }; }
  function hint() {
    const T = TOOLS.find(t => t[0] === S.tool), M = S.M;
    let h = T ? T[2] : '';
    if (M) {
      const area = M.poly.length >= 3 ? Math.abs(M.poly.reduce((t, p, i, a) => { const q = a[(i + 1) % a.length]; return t + p.x * q.y - q.x * p.y; }, 0) / 2) : 0;
      const bad = S.legs.filter(l => l === false).length;
      h += `<br><span class="muted">${M.travel ? 'start ✓' : '<b>no start yet</b>'} · ${M.waypoints.length} waypoints · area ${M.poly.length} corners (${(area / 1e6).toFixed(2)} km²) · ${M.holes.filter(x => x.length >= 3).length + M.circles.length} exclusions · ${M.avoidMobs.length} avoided monsters${M.floor ? ' · floor ' + esc(M.floor.name) : ''}${bad ? ` · <b style="color:#ff8080">${bad} leg(s) may hit a wall</b>` : ''}</span>`;
    } else h = 'Pick a spot in the panel, or start a new one.';
    $s('spedHint').innerHTML = h;
  }
  // the selected point: z, the geodata floor heights there, delete
  function selBox() {
    const box = $s('spedSel'), p = selPoint();
    if (!p) { box.hidden = true; box.innerHTML = ''; return; }
    const sig = S.sel + ':' + p.x + ':' + p.y + ':' + p.z + ':' + (p.r || '');
    if (box._key === S.sel && !box.hidden && (box._sig === sig || box.contains(document.activeElement))) return;
    box._key = S.sel; box._sig = sig;
    const isC = /^[cr]:/.test(S.sel), c = isC ? S.M.circles[+S.sel.split(':')[1]] : null;
    box.hidden = false;
    box.innerHTML = `<b>${selName()}</b> <span class="muted">x ${p.x} y ${p.y}</span>
      <label>z <input type="number" id="spedZ" value="${p.z != null ? p.z : ''}" placeholder="?"></label>
      ${isC ? `<label>radius <input type="number" id="spedR" value="${c.r}" min="50" step="50"></label>` : ''}
      <span id="spedHeights" class="muted"></span>
      <button id="spedDelPt" class="bad">Delete</button>${/^h:/.test(S.sel) ? '<button id="spedDelHole" class="bad">Delete this exclusion</button>' : ''}`;
    $s('spedZ').onchange = () => { snap(); const v = $s('spedZ').value; if (v === '') delete p.z; else p.z = r0(v); touch(); };
    if (isC) $s('spedR').onchange = () => { snap(); c.r = Math.max(50, r0($s('spedR').value)); touch(); };
    $s('spedDelPt').onclick = delSel;
    if ($s('spedDelHole')) $s('spedDelHole').onclick = () => { snap(); S.M.holes.splice(+S.sel.split(':')[1], 1); S.holeI = S.M.holes.length - 1; S.sel = null; touch(); };
    heightsFor(p).then(hs => {
      const el = $s('spedHeights'); if (!el || box._key !== S.sel) return;
      if (!hs || hs.length < 2) { el.textContent = hs && hs.length ? 'ground ' + hs[0] : ''; return; }
      el.innerHTML = 'floors here: ' + hs.map(h => `<button data-zz="${h}" style="min-height:28px;padding:2px 6px">${h}</button>`).join(' ');
      el.querySelectorAll('[data-zz]').forEach(b => b.onclick = () => { snap(); p.z = +b.dataset.zz; touch(); });
    });
  }
  function selName() {
    const [k, a, b] = String(S.sel).split(':');
    return k === 'w' ? `Waypoint ${+a + 1}` : k === 'a' ? `Area corner ${+a + 1}` : k === 'h' ? `Exclusion ${+a + 1}, corner ${+b + 1}` : `Exclusion circle ${+a + 1}`;
  }
  function selPoint() {
    if (!S.sel || !S.M) return null;
    const [k, a, b] = S.sel.split(':'), M = S.M;
    if (k === 'w') return M.waypoints[+a] || null;
    if (k === 'a') return M.poly[+a] || null;
    if (k === 'h') return (M.holes[+a] || [])[+b] || null;
    if (k === 'c' || k === 'r') return M.circles[+a] || null;
    return null;
  }
  function delSel() {
    if (!S.sel) return;
    snap();
    const [k, a, b] = S.sel.split(':'), M = S.M;
    if (k === 'w') M.waypoints.splice(+a, 1);
    else if (k === 'a') M.poly.splice(+a, 1);
    else if (k === 'h') { M.holes[+a].splice(+b, 1); if (!M.holes[+a].length) { M.holes.splice(+a, 1); S.holeI = M.holes.length - 1; } }
    else M.circles.splice(+a, 1);
    S.sel = null; touch();
  }

  // ---------------------------------------------------------------------------------------------------------------- data loading
  async function loadMobs() {
    if (!S.open) return;
    const b = vb();
    if (b.w > 60000 || b.h > 60000) { if (S.mobs.length) { S.mobs = []; S.mobsKey = ''; S.mobVer = (S.mobVer || 0) + 1; drawMobs(true); } return; }
    const pad = 1500, key = [b.x0, b.y0, b.w, b.h].map(v => Math.round(v / 1500)).join(',') + (S.floor ? S.floor.zMin + '_' + S.floor.zMax : '');
    if (key === S.mobsKey) return;
    S.mobsKey = key;
    const zq = S.floor ? `&z0=${S.floor.zMin - 150}&z1=${S.floor.zMax + 150}` : '';
    try {
      const d = await api(`/api/spawnsin?x0=${Math.round(b.x0 - pad)}&y0=${Math.round(b.y0 - pad)}&x1=${Math.round(b.x0 + b.w + pad)}&y1=${Math.round(b.y0 + b.h + pad)}${zq}`);
      S.mobs = d.mobs || [];
    } catch (e) { S.mobs = []; }
    S.mobVer = (S.mobVer || 0) + 1;
    if (!S.floor) autoBands();
    drawMobs(true);
  }
  // heights in view where monsters live, in bands (a tower's floors, a cave under a field) — offered in the floor menu
  function autoBands() {
    const zs = S.mobs.map(m => m.z).filter(isFinite).sort((a, b) => a - b);
    const bands = [];
    zs.forEach(z => { const L = bands[bands.length - 1]; if (L && z - L.zMax < 350) { L.zMax = z; L.n++; } else bands.push({ zMin: z, zMax: z, n: 1 }); });
    const keep = bands.filter(x => x.n >= 3);
    S.autoBands = keep.length > 1 ? keep.map(x => ({ name: `height ${x.zMin}..${x.zMax} (${x.n} spawns)`, zMin: x.zMin - 200, zMax: x.zMax + 200 })) : [];
    fillFloors();
  }
  function placesInView() {
    const b = vb();
    return (S.places || []).filter(p => {
      if (p.bbox) return p.bbox[0] < b.x0 + b.w && p.bbox[2] > b.x0 && p.bbox[1] < b.y0 + b.h && p.bbox[3] > b.y0;
      return isFinite(p.x) && Math.abs(p.x - S.view.cx) < b.w && Math.abs(p.y - S.view.cy) < b.h;
    });
  }
  function fillFloors() {
    const sel = $s('spedFloor'); if (!sel) return;
    const cur = S.floor ? JSON.stringify({ name: S.floor.name, zMin: S.floor.zMin, zMax: S.floor.zMax }) : '';
    const opts = [['', 'All heights']];
    const seen = new Set([cur]);
    const add = (f, label) => { const v = JSON.stringify({ name: f.name, zMin: f.zMin, zMax: f.zMax }); if (!seen.has(v)) { seen.add(v); opts.push([v, label]); } };
    if (S.floor) opts.push([cur, `${S.floor.name} (z ${S.floor.zMin}..${S.floor.zMax})`]);
    if (S.M && S.M.floor && JSON.stringify(S.M.floor) !== cur) add(S.M.floor, `★ spot floor: ${S.M.floor.name}`);
    placesInView().forEach(p => (p.floors || []).forEach(f => add({ name: `${p.name}: ${f.name}`, zMin: f.zMin, zMax: f.zMax }, `${p.name}: ${f.name}`)));
    S.autoBands.forEach(f => add(f, f.name));
    const html = opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
    if (sel._html !== html) { sel._html = html; sel.innerHTML = html; }
    sel.value = cur;
  }
  const geoCache = new Map();
  async function heightsFor(p) {
    const k = p.x + '_' + p.y;
    if (geoCache.has(k)) return geoCache.get(k);
    try { const d = await api(`/api/geoz?x=${p.x}&y=${p.y}`); geoCache.set(k, d.heights || []); return d.heights || []; } catch (e) { return null; }
  }
  // z for a new point: the geodata floor at that spot nearest the shown floor (or the previous point / the spot's height)
  async function fillZ(p, hintZ) {
    const want = S.floor ? (S.floor.zMin + S.floor.zMax) / 2 : hintZ;
    if (want != null && isFinite(want)) p.z = Math.round(want);
    const hs = await heightsFor(p);
    if (!hs || !hs.length) return;
    let best = hs[0];
    if (want != null && isFinite(want)) {
      const inside = S.floor ? hs.filter(h => h >= S.floor.zMin - 200 && h <= S.floor.zMax + 200) : [];
      const pool = inside.length ? inside : hs;
      best = pool.reduce((b, h) => Math.abs(h - want) < Math.abs(b - want) ? h : b, pool[0]);
    }
    p.z = best; render(); checkLegs();
  }
  let legT = 0;
  function checkLegs() {
    clearTimeout(legT);
    legT = setTimeout(async () => {
      if (!S.M) return;
      const st = startPt(), W = (st ? [st] : []).concat(S.M.waypoints);
      if (W.length < 2) { S.legs = []; render(); return; }
      try { const d = await api('/api/geocheck', { method: 'POST', body: JSON.stringify({ points: W }) }); S.legs = d.legs || []; } catch (e) { S.legs = []; }
      render();
    }, 700);
  }
  // live monsters: what the leader of a party standing in view sees (MCP) — only every 6 s and only when someone is in view
  async function pollLive() {
    if (!S.showMobs || Date.now() - S.liveAt < 6000 || typeof STATE === 'undefined' || !STATE) return;
    S.liveAt = Date.now();
    const b = vb();
    const inV = (STATE.chars || []).filter(c => c.ageSec <= 60 && isFinite(c.x) && c.x > b.x0 && c.x < b.x0 + b.w && c.y > b.y0 && c.y < b.y0 + b.h);
    if (!inV.length || b.w > 40000) { if (S.live.length) { S.live = []; S.liveVer = (S.liveVer || 0) + 1; drawMobs(true); } return; }
    const leader = inV.find(c => c.party === c.name) || inV[0];
    try { const d = await api('/api/partymobs?name=' + encodeURIComponent(leader.name)); S.live = d.mobs || []; } catch (e) { S.live = []; }
    S.liveVer = (S.liveVer || 0) + 1; drawMobs(true);
  }

  // ---------------------------------------------------------------------------------------------------------------- editing
  function snap() { if (!S.M) return; S.undo.push(JSON.stringify(S.M)); if (S.undo.length > 150) S.undo.shift(); S.redo = []; }
  function undo() { if (!S.undo.length) return; S.redo.push(JSON.stringify(S.M)); S.M = JSON.parse(S.undo.pop()); S.sel = null; S.dirty = true; checkLegs(); render(); }
  function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.M)); S.M = JSON.parse(S.redo.pop()); S.sel = null; S.dirty = true; checkLegs(); render(); }
  function touch() { S.dirty = true; render(); checkLegs(); }
  function setTool(t) {
    S.tool = t; S.sel = null;
    if (t === 'hole' && S.M && S.holeI < 0) S.holeI = S.M.holes.length ? S.M.holes.length - 1 : -1;
    render();
  }
  function segDist(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0; return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); }
  function insertPoly(P, w) {
    let at = P.length;
    if (P.length >= 3) { let best = 1e12; P.forEach((p, i) => { const q = P[(i + 1) % P.length]; const d = segDist(w, p, q); if (d < best) { best = d; at = i + 1; } }); }
    P.splice(at, 0, w); return at;
  }
  async function tap(e) {
    const M = S.M; if (!M) return;
    const w = toWorld(e.clientX, e.clientY), px = S.view.s;
    if (S.tool === 'pan') { S.sel = null; render(); return; }
    if (S.tool === 'start') {
      let best = null, bd = 30 * px;
      (S.landings.gk || []).forEach(l => { const d = Math.hypot(l.x - w.x, l.y - w.y); if (d < bd) { bd = d; best = { kind: 'gk', desc: l.desc }; } });
      Object.entries(S.landings.towns || {}).forEach(([n, T]) => { const d = Math.hypot(T[0] - w.x, T[1] - w.y); if (d < bd) { bd = d; best = { kind: 'town', town: n }; } });
      if (!best) { toast('Tap right on a blue (gatekeeper landing) or gold (.town) square — or pick the start in ☰'); return; }
      // several destinations on one square: ask which one
      if (best.kind === 'gk') {
        const L = (S.landings.gk || []).filter(l => Math.hypot(l.x - w.x, l.y - w.y) < 30 * px + 400);
        if (L.length > 1) { const i = await uiChoice({ title: 'Which teleport?', body: 'Several gatekeeper destinations land on this square:', buttons: L.map((l, k) => ({ label: `${k + 1}) ${l.desc}`, value: k })) }); if (!(i >= 0 && i < L.length)) return; best = { kind: 'gk', desc: L[i].desc }; }
      }
      snap(); M.travel = best; touch();
      toast('Start: ' + (best.kind === 'town' ? '.' + best.town.toLowerCase() : best.desc) + ' — now draw the waypoints');
      if (!M.waypoints.length) setTool('way');
      return;
    }
    if (S.tool === 'mob') {
      let best = null, bd = 25 * px;
      S.mobs.concat(S.live.map(m => ({ x: m.x, y: m.y, z: m.z, n: m.n }))).forEach(m => { if (!inBand(m.z)) return; const d = Math.hypot(m.x - w.x, m.y - w.y); if (d < bd) { bd = d; best = m; } });
      if (!best) { toast('Tap right on a monster dot'); return; }
      snap();
      const i = M.avoidMobs.findIndex(n => n.toLowerCase() === String(best.n).toLowerCase());
      if (i >= 0) { M.avoidMobs.splice(i, 1); toast(`${best.n}: allowed again`); } else { M.avoidMobs.push(best.n); toast(`${best.n}: never fought in this spot`); }
      touch(); return;
    }
    snap();
    const hintZ = (P) => { const q = P[P.length - 1]; return q && q.z != null ? q.z : (M.z || null); };
    if (S.tool === 'way') {
      const st = startPt(), W = (st ? [st] : []).concat(M.waypoints);
      let at = M.waypoints.length, bd = 14 * px;
      for (let i = 0; i + 1 < W.length; i++) { const d = segDist(w, W[i], W[i + 1]); if (d < bd) { bd = d; at = st ? i : i + 1; } }
      M.waypoints.splice(at, 0, w); S.sel = 'w:' + at;
      fillZ(w, hintZ(at > 0 ? M.waypoints.slice(0, at) : (st ? [st] : [])));
    } else if (S.tool === 'area') {
      if (!M.poly.length && !M.floor && S.floor) { M.floor = { ...S.floor }; toast(`Hunting floor set to "${S.floor.name}" (the floor the map shows) — change it in ☰`); }
      const at = insertPoly(M.poly, w); S.sel = 'a:' + at; fillZ(w, hintZ(M.poly));
    } else if (S.tool === 'hole') {
      if (S.holeI < 0 || !M.holes[S.holeI]) { M.holes.push([]); S.holeI = M.holes.length - 1; }
      const at = insertPoly(M.holes[S.holeI], w); S.sel = `h:${S.holeI}:${at}`; fillZ(w, hintZ(M.holes[S.holeI]));
    } else if (S.tool === 'circle') {
      const c = { x: w.x, y: w.y, r: Math.max(150, Math.round(60 * px / 50) * 50) };
      M.circles.push(c); S.sel = 'c:' + (M.circles.length - 1); fillZ(c, M.z || null);
    }
    touch();
  }
  function movePoint(key, w) {
    const [k, a, b] = key.split(':'), M = S.M;
    if (k === 'w') Object.assign(M.waypoints[+a], w);
    else if (k === 'a') Object.assign(M.poly[+a], w);
    else if (k === 'h') Object.assign(M.holes[+a][+b], w);
    else if (k === 'c') Object.assign(M.circles[+a], w);
    else if (k === 'r') { const c = M.circles[+a]; c.r = Math.max(50, Math.round(Math.hypot(w.x - c.x, w.y - c.y) / 10) * 10); }
  }

  // ---------------------------------------------------------------------------------------------------------------- pointer / touch
  function onDown(e) {
    if (!S.open) return;
    S.svg.setPointerCapture(e.pointerId);
    S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (S.pointers.size === 2) {                       // pinch: forget any tap / drag of the first finger
      const [a, b] = [...S.pointers.values()];
      if (S.gesture && S.gesture.kind === 'drag' && S.gesture.moved) { /* keep the moved point where it is */ }
      S.gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: S.view.s, w0: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2) };
      return;
    }
    if (S.pointers.size > 2) return;
    const h = e.target && e.target.dataset && e.target.dataset.h;
    if (h) { S.gesture = { kind: 'drag', key: h, sx: e.clientX, sy: e.clientY, moved: false }; return; }
    S.gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: S.view.cx, cy: S.view.cy, moved: false };
  }
  function onMove(e) {
    if (!S.pointers.has(e.pointerId)) return;
    S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = S.gesture; if (!g) return;
    if (g.kind === 'pinch' && S.pointers.size >= 2) {
      const [a, b] = [...S.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      S.view.s = clampS(g.s0 * g.d0 / d);
      // keep the world point that was under the fingers under them
      const r = S.svg.getBoundingClientRect();
      S.view.cx = g.w0.x - (mx - r.left - S.W / 2) * S.view.s; S.view.cy = g.w0.y - (my - r.top - S.H / 2) * S.view.s;
      render(); return;
    }
    const dist = Math.hypot(e.clientX - g.sx, e.clientY - g.sy);
    if (g.kind === 'drag') {
      if (!g.moved && dist < 4) return;
      if (!g.moved) { snap(); g.moved = true; S.sel = g.key; }
      movePoint(g.key, toWorld(e.clientX, e.clientY)); S.dirty = true; render(); return;
    }
    if (g.kind === 'pan') {
      if (!g.moved && dist < 7) return;
      g.moved = true;
      S.view.cx = g.cx - (e.clientX - g.sx) * S.view.s; S.view.cy = g.cy - (e.clientY - g.sy) * S.view.s; render();
    }
  }
  function onUp(e) {
    const had = S.pointers.has(e.pointerId);
    S.pointers.delete(e.pointerId);
    const g = S.gesture;
    if (!had || !g) return;
    if (g.kind === 'pinch') { if (S.pointers.size === 0) S.gesture = null; else { const [p] = [...S.pointers.values()]; S.gesture = { kind: 'pan', sx: p.x, sy: p.y, cx: S.view.cx, cy: S.view.cy, moved: true }; } return; }
    S.gesture = null;
    if (e.type === 'pointercancel') return;
    if (g.kind === 'drag') {
      if (g.moved) {                                    // a moved point: its height again from the geodata
        const p = selPoint(); if (p && !/^r:/.test(g.key)) fillZ(p, p.z);
        checkLegs();
      } else { S.sel = S.sel === g.key ? null : g.key; render(); }
      return;
    }
    if (g.kind === 'pan' && !g.moved) tap(e);
  }
  function onWheel(e) {
    if (!S.open) return;
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY), f = Math.exp((e.ctrlKey ? 3 : 1) * e.deltaY * 0.0015);
    const r = S.svg.getBoundingClientRect();
    S.view.s = clampS(S.view.s * f);
    S.view.cx = w.x - (e.clientX - r.left - S.W / 2) * S.view.s; S.view.cy = w.y - (e.clientY - r.top - S.H / 2) * S.view.s;
    render();
  }
  function onKey(e) {
    if (!S.open) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (S.sel) { e.preventDefault(); delSel(); } return; }
    if (e.key === 'Escape') { S.sel = null; render(); return; }
    const k = { '1': 'pan', '2': 'start', '3': 'way', '4': 'area', '5': 'hole', '6': 'circle', '7': 'mob' }[e.key];
    if (k) setTool(k);
  }

  // ---------------------------------------------------------------------------------------------------------------- panels
  function toast(t, ms) { const el = $s('spedToast'); el.textContent = t; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, ms || 3500); }
  function parties() {
    const P = new Set(['all']);
    ((typeof STATE !== 'undefined' && STATE && STATE.chars) || []).forEach(c => { if (c.party) P.add(c.party); });
    S.zones.forEach(z => (Array.isArray(z.teams) ? z.teams : [z.team || 'all']).forEach(t => P.add(t)));
    return [...P];
  }
  function findBox() {
    return `<h3>Find a place</h3><input id="spedFind" placeholder="dungeon, town, teleport, character…" style="width:100%"><div class="list" id="spedFound"></div>`;
  }
  function wireFind() {
    const inp = $s('spedFind'); if (!inp) return;
    const run = () => {
      const q = inp.value.toLowerCase().trim(); const out = [];
      if (q.length >= 2) {
        (S.places || []).forEach(p => { if (p.name.toLowerCase().includes(q)) out.push({ t: `⌂ ${p.name}${p.floors && p.floors.length ? ` · ${p.floors.length} floors` : ''}`, x: p.x, y: p.y, p }); });
        Object.entries(S.landings.towns || {}).forEach(([n, T]) => { if (n.toLowerCase().includes(q)) out.push({ t: `.${n.toLowerCase()} (town landing)`, x: T[0], y: T[1] }); });
        (S.landings.gk || []).forEach(l => { if (l.desc.toLowerCase().includes(q)) out.push({ t: `⚑ ${l.desc}`, x: l.x, y: l.y }); });
        ((typeof STATE !== 'undefined' && STATE && STATE.chars) || []).forEach(c => { if (String(c.name).toLowerCase().includes(q) && isFinite(c.x)) out.push({ t: `● ${c.name} (lvl ${c.level})`, x: c.x, y: c.y, z: c.z }); });
        S.zones.forEach(z => { if (z.name.toLowerCase().includes(q) && isFinite(z.x)) out.push({ t: `▱ spot: ${z.name}`, x: z.x, y: z.y }); });
      }
      $s('spedFound').innerHTML = out.slice(0, 40).map((o, i) => `<div data-i="${i}">${esc(o.t)}</div>`).join('') || (q.length >= 2 ? '<div class="muted">nothing found</div>' : '');
      $s('spedFound').onclick = (e) => {
        const d = e.target.closest('[data-i]'); if (!d) return; const o = out[+d.dataset.i];
        S.view.cx = o.x; S.view.cy = o.y; S.view.s = Math.min(S.view.s, 6);
        if (o.p && o.p.floors && o.p.floors.length) { S.floor = { name: `${o.p.name}: ${o.p.floors[0].name}`, zMin: o.p.floors[0].zMin, zMax: o.p.floors[0].zMax }; S.mobsKey = ''; S.tileKey = ''; toast(`${o.p.name}: showing ${o.p.floors[0].name} — change the floor at the top`); }
        if (S.M && S.M.isNew && !S.M.poly.length) { S.M.x = Math.round(o.x); S.M.y = Math.round(o.y); }
        if (window.innerWidth < 700) $s('spedPanel').hidden = true;
        fillFloors(); render();
      };
    };
    inp.oninput = run; run();
  }
  function pickPanel() {
    const p = $s('spedPanel'); p.hidden = false;
    const zs = S.zones.slice().sort((a, b) => (a.levelMin || 0) - (b.levelMin || 0));
    p.innerHTML = `<div class="row"><b style="flex:1">Hunting spots</b><button id="spedClose">✕</button></div>
      <p class="muted">Open a spot to edit it on the full-screen map, or start a new one.</p>
      <button id="spedNew" class="go" style="width:100%">+ New spot</button>
      <h3>Edit a spot</h3><input id="spedPick" placeholder="filter…" style="width:100%"><div class="list" id="spedPickList"></div>${findBox()}`;
    const list = () => { const q = $s('spedPick').value.toLowerCase(); $s('spedPickList').innerHTML = zs.filter(z => !q || z.name.toLowerCase().includes(q)).map(z => `<div data-n="${esc(z.name)}">${esc(z.name)} <span class="muted">${z.levelMin}-${z.levelMax} · ${esc((Array.isArray(z.teams) ? z.teams : [z.team || 'all']).join(', '))}${z.enabled === false ? ' · OFF' : ''}${z.waypoints ? ' · route' : ''}${z.poly ? ' · area' : ''}</span></div>`).join(''); };
    $s('spedPick').oninput = list; list();
    $s('spedPickList').onclick = (e) => { const d = e.target.closest('[data-n]'); if (d) go('#/spot/' + encodeURIComponent(d.dataset.n)); };
    $s('spedNew').onclick = () => go('#/spot/new');
    $s('spedClose').onclick = () => { p.hidden = true; };
    wireFind();
  }
  function panel() {
    const p = $s('spedPanel'), M = S.M;
    if (!M) { pickPanel(); return; }
    const towns = Object.keys(S.landings.towns || {});
    const tr = M.travel || {};
    const floors = [['', '— any height (outdoor) —']];
    if (M.floor) floors.push([JSON.stringify(M.floor), `${M.floor.name} (z ${M.floor.zMin}..${M.floor.zMax})`]);
    if (S.floor && JSON.stringify(S.floor) !== JSON.stringify(M.floor)) floors.push([JSON.stringify(S.floor), `the floor the map shows: ${S.floor.name}`]);
    placesInView().forEach(pl => (pl.floors || []).forEach(f => { const o = { name: `${pl.name}: ${f.name}`, zMin: f.zMin, zMax: f.zMax }; const v = JSON.stringify(o); if (!floors.some(x => x[0] === v)) floors.push([v, o.name + ` (z ${f.zMin}..${f.zMax})`]); }));
    p.innerHTML = `<div class="row"><b style="flex:1">Spot settings</b><button id="spedClose">✕</button></div>
      <label>Levels <input id="spedMin" type="number" min="1" max="99" value="${M.levelMin}" style="width:64px"> – <input id="spedMax" type="number" min="1" max="99" value="${M.levelMax}" style="width:64px"></label>
      <label><input type="checkbox" id="spedOn" ${M.enabled ? 'checked' : ''}> enabled (the parties may pick it)</label>
      <label>Team kind <select id="spedKind">${['any', 'mage', 'melee', 'small'].map(k => `<option ${M.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <h3>Parties that may use it</h3><div class="row">${parties().map(t => `<label class="chk"><input type="checkbox" data-team="${esc(t)}" ${M.teams.includes(t) ? 'checked' : ''}> ${t === 'all' ? 'all parties' : esc(t)}</label>`).join('')}</div>
      <h3>Start (where the team gets in)</h3>
      <label><select id="spedTrK"><option value="">— none (walk / automatic) —</option><option value="gk" ${tr.kind === 'gk' ? 'selected' : ''}>gatekeeper teleport</option><option value="town" ${tr.kind === 'town' ? 'selected' : ''}>.town and walk</option></select></label>
      <label id="spedTrGkL"><input id="spedTrGk" list="spedGkList" value="${esc(tr.desc || '')}" placeholder="Town -> destination" style="width:100%"><datalist id="spedGkList">${(S.landings.gk || []).map(l => `<option value="${esc(l.desc)}">`).join('')}</datalist></label>
      <label id="spedTrTownL"><select id="spedTrTown"><option value="">— town —</option>${towns.map(t => `<option ${tr.town === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <div class="muted">Or use the ⚑ Start tool and tap a square on the map. After the start the team walks your waypoints, every member point by point.</div>
      <h3>Hunting floor (towers, caves)</h3>
      <label><select id="spedHuntFloor" style="max-width:100%">${floors.map(([v, t]) => `<option value="${esc(v)}" ${v === (M.floor ? JSON.stringify(M.floor) : '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <div class="muted">With a floor the team only fights monsters on that height band, and in towers / caves it never uses L2Swarm's path search (attack only, the server walks to the monster).</div>
      <h3>Monsters never fought here</h3>
      <div id="spedAvoid">${M.avoidMobs.map((n, i) => `<span class="chip">${esc(n)} <button data-unav="${i}">✕</button></span>`).join('') || '<span class="muted">none — use ☠ Avoid monster and tap a dot</span>'}</div>
      <div class="row"><input id="spedAvoidAdd" placeholder="monster name" style="flex:1"><button id="spedAvoidBtn">Add</button></div>
      <h3>Map</h3>
      <div class="row"><label class="chk"><input type="checkbox" id="spedShM" ${S.showMobs ? 'checked' : ''}> monsters</label><label class="chk"><input type="checkbox" id="spedShL" ${S.showLand ? 'checked' : ''}> teleport landings</label><label class="chk"><input type="checkbox" id="spedShC" ${S.showChars ? 'checked' : ''}> characters</label></div>
      ${findBox()}
      <h3>Note</h3><textarea id="spedNote" style="width:100%;min-height:60px;font:inherit;color:#f2ead2;background:#1d2a24;border:1px solid #5d6b55;border-radius:6px">${esc(M.note || '')}</textarea>
      ${(M.pulls || []).length ? `<p class="muted">${M.pulls.length} pull route(s) from the Zones tab are kept (shown dashed yellow).</p>` : ''}
      ${M.rooms || M.dungeon ? `<p class="muted">This spot also uses ${M.rooms ? 'the rooms of ' + esc(M.rooms) : 'the dungeon ' + esc(M.dungeon)} — that way in comes first.</p>` : ''}
      <h3>Danger zone</h3><div class="row"><button id="spedClear" class="bad">Clear all drawing</button>${M.oldName ? '<button id="spedDel" class="bad">Delete spot</button>' : ''}</div>
      <p class="muted">Keys: 1-7 tools, Ctrl+Z / Ctrl+Y undo/redo, Del deletes the selected point, Ctrl+S saves. Every save keeps the old file in Scripts/data/routes/spots_history.</p>`;
    const set = (fn) => { snap(); fn(); touch(); };
    $s('spedClose').onclick = () => { p.hidden = true; };
    $s('spedMin').onchange = () => set(() => { M.levelMin = +$s('spedMin').value || 1; });
    $s('spedMax').onchange = () => set(() => { M.levelMax = +$s('spedMax').value || 85; });
    $s('spedOn').onchange = () => set(() => { M.enabled = $s('spedOn').checked; });
    $s('spedKind').onchange = () => set(() => { M.kind = $s('spedKind').value; });
    p.querySelectorAll('[data-team]').forEach(c => c.onchange = () => set(() => {
      const t = c.dataset.team;
      if (c.checked) { if (t === 'all') M.teams = ['all']; else M.teams = M.teams.filter(x => x !== 'all').concat(t); } else M.teams = M.teams.filter(x => x !== t);
      if (!M.teams.length) M.teams = ['all'];
      panel();
    }));
    const showTr = () => { const k = $s('spedTrK').value; $s('spedTrGkL').hidden = k !== 'gk'; $s('spedTrTownL').hidden = k !== 'town'; };
    showTr();
    const trSet = () => set(() => { const k = $s('spedTrK').value; M.travel = k === 'gk' && $s('spedTrGk').value.trim() ? { kind: 'gk', desc: $s('spedTrGk').value.trim() } : k === 'town' && $s('spedTrTown').value ? { kind: 'town', town: $s('spedTrTown').value } : null; showTr(); });
    $s('spedTrK').onchange = trSet; $s('spedTrGk').onchange = trSet; $s('spedTrTown').onchange = trSet;
    $s('spedHuntFloor').onchange = () => set(() => { const v = $s('spedHuntFloor').value; M.floor = v ? JSON.parse(v) : null; fillFloors(); });
    p.querySelectorAll('[data-unav]').forEach(b => b.onclick = () => set(() => { M.avoidMobs.splice(+b.dataset.unav, 1); panel(); }));
    $s('spedAvoidBtn').onclick = () => { const n = $s('spedAvoidAdd').value.trim(); if (n) set(() => { if (!M.avoidMobs.includes(n)) M.avoidMobs.push(n); panel(); }); };
    $s('spedShM').onchange = () => { S.showMobs = $s('spedShM').checked; render(); };
    $s('spedShL').onchange = () => { S.showLand = $s('spedShL').checked; render(); };
    $s('spedShC').onchange = () => { S.showChars = $s('spedShC').checked; render(); };
    $s('spedNote').onchange = () => set(() => { M.note = $s('spedNote').value; });
    $s('spedClear').onclick = async () => { if (await uiConfirm({ title: 'Clear this spot?', body: ['Remove all waypoints, the hunt area and every exclusion of this spot?', uiNote('Undo brings them back.')], confirmText: 'Clear all' })) set(() => { M.waypoints = []; M.poly = []; M.holes = []; M.circles = []; S.sel = null; }); };
    if ($s('spedDel')) $s('spedDel').onclick = async () => {
      if (!await uiConfirm({ title: `Delete the spot "${M.oldName}" for good?`, body: uiNote('The old file is kept in Scripts/data/routes/spots_history.'), confirmText: 'Delete spot', danger: true })) return;
      const d = await api('/api/zones?name=' + encodeURIComponent(M.oldName), { method: 'DELETE' });
      if (d.ok) { S.dirty = false; toast('deleted'); go('#/spot'); }
    };
    wireFind();
  }

  // ---------------------------------------------------------------------------------------------------------------- save
  async function ask(o) { S.asking = true; try { return await uiConfirm(o); } finally { S.asking = false; } }   // one save dialog at a time
  async function save() {
    const M = S.M; if (!M) return;
    const name = String(M.name || '').trim();
    if (!name) { toast('Give the spot a name first'); return; }
    if (M.poly.length < 3) { toast('Draw the hunt area first (▱ Hunt area, at least 3 corners)'); setTool('area'); return; }
    if (S.asking) return;
    if (!M.travel && !M.rooms && !M.dungeon && !await ask({ title: 'No start set', body: 'No start (teleport / .town) is set: the team walks from wherever it is. Save anyway?', confirmText: 'Save anyway' })) return;
    if (M.levelMin > M.levelMax) { toast('Level min is above level max'); return; }
    const zs = M.poly.map(p => p.z).filter(isFinite);
    const body = {
      name, oldName: M.oldName || undefined, levelMin: M.levelMin, levelMax: M.levelMax, teams: M.teams, team: M.teams.length === 1 ? M.teams[0] : 'all',
      kind: M.kind, enabled: M.enabled, travel: M.travel, note: M.note,
      z: M.floor ? Math.round((M.floor.zMin + M.floor.zMax) / 2) : (zs.length ? Math.round(zs.reduce((a, b) => a + b, 0) / zs.length) : M.z),
      poly: M.poly, holes: M.holes.filter(h => h.length >= 3), pulls: M.pulls || [], circles: M.circles, waypoints: M.waypoints, floor: M.floor || null, avoidMobs: M.avoidMobs,
    };
    if (body.oldName && body.oldName !== name && S.zones.some(z => z.name === name) && !await ask({ title: 'Replace the spot?', body: `A spot called "${name}" exists already — replace it?`, confirmText: 'Replace', danger: true })) return;
    if (!body.oldName && S.zones.some(z => z.name === name) && !await ask({ title: 'Replace the spot?', body: `A spot called "${name}" exists already — replace it?`, confirmText: 'Replace', danger: true })) return;
    $s('spedSave').disabled = true;
    try {
      const d = await api('/api/zones', { method: 'POST', body: JSON.stringify(body) });
      if (!d.ok) { toast('Not saved: ' + (d.error || 'error'), 6000); return; }
      S.zones = d.zones || S.zones; S.dirty = false; M.oldName = name; M.isNew = false;
      toast('Saved — the leaders use it on their next spot pick (within 5 min, no deploy needed)', 5000);
      if (location.hash !== '#/spot/' + encodeURIComponent(name)) history.replaceState(null, '', '#/spot/' + encodeURIComponent(name));
      if (typeof loadSpots === 'function') try { loadSpots(); } catch (e) { }
    } catch (e) { toast('Not saved: ' + e.message, 6000); } finally { $s('spedSave').disabled = false; render(); }
  }

  window.SpotEditor = { open, close, isOpen: () => S.open };
  // the page was opened on #/spot/... (index.html's first route() ran before this file was loaded)
  if (/^#\/?spot/.test(location.hash) && typeof route === 'function') route();
})();
