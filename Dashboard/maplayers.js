// MAP LAYERS (owner 2026-10-25: "Why can't I see the /map like the combat zones so I can see all available zones / dungeons etc?" + "I want to be
// able to click a room or hunting zone under /map and see monsters and drops from the specific zone, would also be nice if I could create my own
// zones by combining different zones to 1 and saving them so I can use them with the team and assign it to a group or character to hunt there").
// Switchable layers on the world map (#/map): our zones, outdoor field areas (geodata outlines), dungeons, raid bosses, datapack spots; a level
// filter (a level band or "fits party X"). Tap a place = the info panel under the map: its monsters (level, count, aggressive), kill drops and
// spoils with chances, the best drops of the whole place (Dashboard/worldlayers_api.js /api/zoneinfo, data Scripts/data/drops_h5.json).
// MY ZONES: "Add to my zone" collects field areas of ONE region or rooms of ONE dungeon (the bots rotate inside one region / one dungeon),
// "Save" names it (Scripts/data/hunt_sets.json, /api/huntsets), "Hunt here" gives it to a party = the party card's own spot save (saveSpot:
// Seven Signs check, level override question, hunt timer, plan step), so the party's leader takes the team there like any chosen spot.
(function () {
  'use strict';
  const LS = 'mapLayers.v1';
  const S = { on: { zones: true, fields: false, dungeons: true, raids: false, spots: false }, lvMin: '', lvMax: '', fit: '', base: null, fields: null, groups: {}, map: null,
    info: null, build: null, sets: [], hl: null };
  try { Object.assign(S, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { }
  const save = () => { try { localStorage.setItem(LS, JSON.stringify({ on: S.on, lvMin: S.lvMin, lvMax: S.lvMax, fit: S.fit, build: S.build })); } catch (e) { } };
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const call = (u, b) => api(u, b ? { method: 'POST', body: JSON.stringify(b) } : undefined);
  const $id = (i) => document.getElementById(i);
  const KINDS = [['zones', 'Our zones'], ['fields', 'Field areas'], ['dungeons', 'Dungeons'], ['raids', 'Raid bosses'], ['spots', 'Datapack spots']];
  const lvCol = (l) => { const v = Math.max(1, Math.min(85, Number(l) || 1)); return `hsl(${Math.round(130 - v * 1.55)},75%,52%)`; };   // green (low) -> red (high)
  const pct = (v) => v >= 10 ? Math.round(v) + '%' : v >= 1 ? v.toFixed(1) + '%' : v >= 0.01 ? v.toFixed(2) + '%' : '<0.01%';
  const kmb = (n) => { n = Number(n || 0); return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n); };

  function parties() { try { const P = {}; (STATE.chars || []).forEach(c => { const p = P[c.party] = P[c.party] || { name: c.party, min: 99, max: 0 }; p.min = Math.min(p.min, c.level || 99); p.max = Math.max(p.max, c.level || 0); }); return Object.values(P).sort((a, b) => a.name.localeCompare(b.name)); } catch (e) { return []; } }
  // the level filter: a band, or the chosen party's level (lowest level - 2 .. highest + 3 fits the place's band)
  function band() {
    if (S.fit) { const p = parties().find(x => x.name === S.fit); if (p) return [p.min - 3, p.max + 3]; }
    const a = Number(S.lvMin) || 0, b = Number(S.lvMax) || 0; return a || b ? [a || 1, b || 99] : null;
  }
  const fits = (lv) => { const B = band(); if (!B) return true; if (!lv) return false; const lo = Array.isArray(lv) ? lv[0] : lv, hi = Array.isArray(lv) ? lv[lv.length - 1] : lv; return (hi || lo) >= B[0] && (lo || hi) <= B[1]; };
  const lvTxt = (lv) => Array.isArray(lv) ? (lv[0] && lv[1] && lv[0] !== lv[1] ? `${lv[0]}–${lv[1]}` : `${lv[0] || lv[1] || '?'}`) : lv ? String(lv) : '?';

  // ---------------------------------------------------------------- drawing
  function draw() {
    const M = S.map; if (!M || !S.base) return;
    Object.values(S.groups).forEach(g => g.remove()); S.groups = {};
    const B = S.base, picked = new Set((S.build && S.build.ids) || []);
    const g = (k) => S.groups[k] = L.layerGroup().addTo(M);
    if (S.on.fields && S.fields) { const G = g('fields');
      S.fields.forEach(f => { if (!fits(f.lv)) return; const P = []; for (let i = 0; i < f.poly.length; i += 2) P.push([f.poly[i + 1], f.poly[i]]);
        const sel = picked.has(f.id), c = lvCol(f.lv && f.lv[1]);
        L.polygon(P, { color: sel ? '#fff' : c, weight: sel ? 3 : 1, fillColor: c, fillOpacity: sel ? 0.45 : 0.18 }).bindTooltip(`${h(f.name)} · lvl ${lvTxt(f.lv)}`, { sticky: true }).on('click', () => open('field', f.id, f.name)).addTo(G); }); }
    if (S.on.spots) { const G = g('spots'); B.spots.forEach(s => { if (!fits(s.lv)) return;
      L.circleMarker([s.y, s.x], { radius: 5, color: '#111', weight: 1, fillColor: lvCol(s.lv[1]), fillOpacity: 0.9 }).bindTooltip(`${h(s.name)} · lvl ${lvTxt(s.lv)}`).on('click', () => open('spot', s.name, s.name)).addTo(G); }); }
    if (S.on.zones) { const G = g('zones'); B.zones.forEach(z => { if (!fits(z.lv)) return; const c = lvCol(z.lv[1]), st = { color: c, weight: 2, dashArray: z.on ? null : '5 5', fillColor: c, fillOpacity: 0.12 };
      const sh = z.poly && z.poly.length > 2 ? L.polygon(z.poly.map(p => [p[1], p[0]]), st) : L.circle([z.y, z.x], Object.assign({ radius: z.r || 3000 }, st));
      sh.bindTooltip(`${h(z.name)} · lvl ${lvTxt(z.lv)}${z.on ? '' : ' (off)'}`).on('click', () => open('zone', z.name, z.name)).addTo(G); }); }
    if (S.on.dungeons) { const G = g('dungeons'); B.dungeons.forEach(d => { if (!fits(d.lv)) return;
      L.marker([d.y, d.x], { icon: L.divIcon({ className: 'ml-dg', html: `<span style="background:${lvCol(d.lv && d.lv[1])}">⛫</span><b>${h(d.name)} ${lvTxt(d.lv)}</b>`, iconSize: [16, 16], iconAnchor: [8, 8] }) })
        .on('click', () => open('dungeon', d.key, d.name)).addTo(G); }); }
    if (S.on.raids) { const G = g('raids'); B.raids.forEach(r => { if (!fits(r.lv)) return;
      L.circleMarker([r.y, r.x], { radius: 6, color: '#000', weight: 1, fillColor: r.type === 'grand' || r.type === 'epic' ? '#c026d3' : '#dc2626', fillOpacity: 0.95 }).bindTooltip(`☠ ${h(r.name)} ${r.lv}`).on('click', () => { location.hash = '#/raid/' + r.id; }).addTo(G); }); }
    legend();
  }
  async function loadFields() { if (S.fields) return; try { const r = await call('/api/worldlayers?part=fields'); S.fields = (r && r.fields) || []; } catch (e) { S.fields = []; } }

  // ---------------------------------------------------------------- the bar above the map + the legend
  function bar() {
    let b = $id('mlBar'); if (!b) { b = document.createElement('div'); b.id = 'mlBar'; b.className = 'ml-bar'; $id('map').before(b); b.addEventListener('click', onClick); b.addEventListener('change', onChange); }
    const ps = parties();
    b.innerHTML = `${KINDS.map(([k, t]) => `<button class="ml-chip${S.on[k] ? ' on' : ''}" data-mlk="${k}">${t}${k === 'fields' && S.base ? ` <small>${S.base.fieldCount}</small>` : ''}</button>`).join('')}
      <span class="ml-lv">lvl <input id="mlMin" inputmode="numeric" value="${h(S.lvMin)}" placeholder="from" size="3"> – <input id="mlMax" inputmode="numeric" value="${h(S.lvMax)}" placeholder="to" size="3"></span>
      <select id="mlFit"><option value="">fits any party</option>${ps.map(p => `<option value="${h(p.name)}" ${S.fit === p.name ? 'selected' : ''}>fits ${h(p.name)} (${p.min}–${p.max})</option>`).join('')}</select>
      <button class="ml-chip" data-mlsets="1">My zones${S.sets.length ? ' ' + S.sets.length : ''}</button>`;
    buildStrip();
  }
  function legend() { const el = $id('mlLegend'); if (el) el.textContent = 'colour = level: green low → red high · tap a place for its monsters and drops'; }
  function buildStrip() {
    let el = $id('mlBuild'); if (!el) { el = document.createElement('div'); el.id = 'mlBuild'; el.className = 'ml-build'; $id('map').after(el); el.addEventListener('click', onClick); }
    const B = S.build;
    el.innerHTML = B && B.ids.length ? `<b>My zone:</b> ${B.ids.length} ${B.kind === 'rooms' ? 'room' : 'area'}${B.ids.length > 1 ? 's' : ''} in ${h(B.whereName || B.where)}
      <span class="muted">${B.ids.map(id => h((B.names || {})[id] || id)).join(' · ')}</span>
      <span class="ml-acts"><button data-mlsave="1">Save…</button><button data-mlhunt="build">Hunt here…</button><button data-mlclear="1">Clear</button></span>` : '<span class="muted" id="mlLegend"></span>';
    if (!(B && B.ids.length)) legend();
  }

  // ---------------------------------------------------------------- the info panel
  function panel() { let el = $id('mlInfo'); if (!el) { el = document.createElement('div'); el.id = 'mlInfo'; el.className = 'ml-info'; ($id('mlBuild') || $id('map')).after(el); el.addEventListener('click', onClick); } return el; }
  async function open(kind, id, name) {
    const el = panel(); el.hidden = false; el.innerHTML = `<div class="muted">Loading ${h(name)}…</div>`; el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    let r; try { r = await call(`/api/zoneinfo?kind=${kind}&id=${encodeURIComponent(id)}`); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { el.innerHTML = `<div class="u-bad">${h((r && r.error) || 'no answer')}</div>`; return; }
    S.info = r; renderInfo();
  }
  function renderInfo() {
    const r = S.info, el = panel(); if (!r) { el.hidden = true; return; }
    const can = r.kind === 'field' || r.kind === 'room', B = S.build, inB = B && B.ids.includes(r.id);
    const where = r.kind === 'field' ? r.regionName : r.kind === 'room' ? `${r.dungeon} · ${r.floor}` : r.way || '';
    const row = (L) => L.map(x => `<span class="ml-it">${h(x[1])}${x[2] !== x[3] ? ` ${x[2]}–${x[3]}` : x[2] > 1 ? ' ×' + x[2] : ''} <i>${pct(x[4])}</i></span>`).join('');
    el.innerHTML = `<div class="ml-head"><div><b style="font-size:17px">${h(r.name)}</b> <span class="muted">lvl ${lvTxt(r.lv)}${where ? ' · ' + h(where) : ''}</span></div><button data-mlx="1" title="close">✕</button></div>
      <div class="ml-acts">${can ? `<button data-mladd="1">${inB ? '✓ in my zone (remove)' : '+ Add to my zone'}</button><button data-mlhunt="one">Hunt here…</button>` : ''}
        ${r.kind === 'field' ? `<a class="btn" href="#/edit/area/${encodeURIComponent(r.id)}">Edit outline</a>` : ''}${r.kind === 'room' ? `<a class="btn" href="#/edit/room/${encodeURIComponent(r.id)}">Edit outline</a>` : ''}</div>
      ${r.rooms ? `<details class="ml-rooms"><summary>${r.rooms.length} rooms — tap one for its monsters, add rooms to my zone</summary>${r.rooms.map(x => `<button data-mlroom="${h(x.id)}">${h(x.name)} <small>${lvTxt(x.lv)} · ${x.n} · ${h(x.floor)}</small></button>`).join('')}</details>` : ''}
      ${r.bestKill.length || r.bestSpoil.length ? `<div class="ml-best"><div><b>Best kill drops here</b> ${r.bestKill.slice(0, 8).map(x => `<span class="ml-it">${h(x[1])}</span>`).join('')}</div>
        <div><b>Best spoils here</b> ${r.bestSpoil.slice(0, 8).map(x => `<span class="ml-it">${h(x[1])}</span>`).join('') || '<span class="muted">none</span>'}</div></div>` : ''}
      ${r.monsters.map(m => `<details class="ml-mon"><summary><b>${h(m.name)}</b> <span class="muted">lvl ${m.level || '?'} · ×${m.count}${m.aggressive ? ' · <span class="u-bad">aggressive</span>' : ''}${m.hp ? ' · ' + kmb(m.hp) + ' HP' : ''}${m.adena ? ` · adena ${m.adena[0]}–${m.adena[1]}` : ''}</span></summary>
        <div class="ml-dl"><span class="muted">Kill:</span> ${row(m.kill) || '<span class="muted">nothing but adena</span>'}</div>
        <div class="ml-dl"><span class="muted">Spoil:</span> ${row(m.spoil) || '<span class="muted">nothing</span>'}</div></details>`).join('') || '<div class="muted">No monsters spawn here.</div>'}
      <div class="muted" style="font-size:12px;margin-top:4px">Chances from the L2J High Five datapack (kill = group chance × item chance, one item per group roll); L2Toggle may use other rates.</div>`;
  }
  // ---------------------------------------------------------------- my zones
  function addToBuild(r) {
    const kind = r.kind === 'room' ? 'rooms' : 'field', where = r.kind === 'room' ? r.dungeon : r.region, whereName = r.kind === 'room' ? r.dungeon : r.regionName;
    let B = S.build;
    if (B && B.ids.includes(r.id)) { B.ids = B.ids.filter(x => x !== r.id); if (!B.ids.length) S.build = null; }
    else {
      if (B && B.ids.length && (B.kind !== kind || B.where !== where)) { uiAlert({ title: 'Another region', body: `My zone holds ${B.kind === 'rooms' ? 'rooms of ' + B.whereName : 'areas of ' + B.whereName}. The team rotates inside ONE outdoor region or ONE dungeon, so a zone cannot mix places. Save or clear it first.` }); return; }
      if (!B || !B.ids.length) B = S.build = { kind, where, whereName, ids: [], names: {} };
      B.ids.push(r.id); B.names[r.id] = r.name;
    }
    save(); draw(); buildStrip(); renderInfo();
  }
  async function saveBuild() {
    const B = S.build; if (!B || !B.ids.length) return;
    const name = await uiPrompt({ title: 'Name this zone', label: 'Name', value: B.name || '', placeholder: `e.g. ${B.whereName} spoil loop` }); if (!name) return;
    const order = await uiChoice({ title: `${name}: how should the team use the ${B.ids.length} places?`, buttons: [{ label: 'Rotate through them in this order', value: 'rotate' }, { label: 'Nearest free one first', value: 'nearest', primary: true }] }); if (!order) return;
    const r = await call('/api/huntsets', { action: 'save', set: { id: B.setId || '', name, kind: B.kind, ids: B.ids, order } });
    if (r.error) { uiError(r.error); return; }
    S.sets = r.sets || []; B.name = name; B.order = order; B.setId = (S.sets.find(x => x.name === name) || {}).id; save(); bar();
    if (window.UIKit) UIKit.toast(`Saved "${name}" (${B.ids.length} places)`, { kind: 'ok' });
  }
  // a set / the build / one place -> a party's hunting spot through the party card's own save (all its checks)
  async function hunt(src) {
    const ps = parties(); if (!ps.length) return;
    const party = await uiChoice({ title: `Who hunts in ${h(src.name)}?`, body: 'Pick the party (a character hunts with its party; a solo character is its own party).', buttons: ps.map(p => ({ label: `${p.name} (${p.min}–${p.max})`, value: p.name })) });
    if (!party) return;
    const body = src.kind === 'rooms' ? { mode: 'manual', kind: 'rooms', dungeon: src.where, spot: src.where, roomId: src.ids[0], roomIds: src.ids, order: src.order || 'nearest', stay: true }
      : { mode: 'manual', kind: 'field', region: src.where, spot: src.name, areaIds: src.ids, order: src.order || 'nearest', stay: true };
    if (typeof saveSpot === 'function') await saveSpot(Object.assign({ party }, body), src.name);
    else { const r = await call('/api/partyspot', Object.assign({ party }, body)); if (r.error) uiError(r.error); }
  }
  function setsHtml() {
    const el = panel(); el.hidden = false; S.info = null;
    el.innerHTML = `<div class="ml-head"><b style="font-size:17px">My zones</b><button data-mlx="1">✕</button></div>
      ${S.sets.length ? S.sets.map(x => `<div class="ml-set"><div><b>${h(x.name)}</b> <span class="muted">${x.ids.length} ${x.kind === 'rooms' ? 'rooms in ' + h(x.dungeon) : 'areas in ' + h(x.region)} · ${x.order === 'rotate' ? 'rotate' : 'nearest first'}</span></div>
        <span class="ml-acts"><button data-mlshow="${h(x.id)}">Show / edit</button><button data-mlhunt="set:${h(x.id)}">Hunt here…</button><button data-mldel="${h(x.id)}">Delete</button></span></div>`).join('')
        : '<div class="muted">None yet. Tap field areas (switch "Field areas" on) or a dungeon\'s rooms, "+ Add to my zone", then Save.</div>'}`;
  }

  // ---------------------------------------------------------------- events
  async function onClick(e) {
    const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
    if (d.mlk) { S.on[d.mlk] = !S.on[d.mlk]; save(); if (d.mlk === 'fields' && S.on.fields) { t.textContent = 'loading…'; await loadFields(); } bar(); draw(); return; }
    if (d.mlx) { S.info = null; panel().hidden = true; return; }
    if (d.mladd) { addToBuild(S.info); return; }
    if (d.mlroom) { open('room', d.mlroom, d.mlroom); return; }
    if (d.mlclear) { S.build = null; save(); draw(); buildStrip(); if (S.info) renderInfo(); return; }
    if (d.mlsave) { saveBuild(); return; }
    if (d.mlsets) { setsHtml(); return; }
    if (d.mldel) { const x = S.sets.find(s => s.id === d.mldel); if (!x || !(await uiConfirm({ title: `Delete "${x.name}"?`, body: 'Parties already hunting there keep their spot.', confirmText: 'Delete', danger: true }))) return;
      const r = await call('/api/huntsets', { action: 'delete', id: x.id }); S.sets = r.sets || []; setsHtml(); bar(); return; }
    if (d.mlshow) { const x = S.sets.find(s => s.id === d.mlshow); if (!x) return; S.build = { kind: x.kind, where: x.kind === 'rooms' ? x.dungeon : x.region, whereName: x.kind === 'rooms' ? x.dungeon : x.region, ids: x.ids.slice(), names: {}, name: x.name, order: x.order, setId: x.id };
      if (x.kind === 'field' && !S.on.fields) { S.on.fields = true; await loadFields(); }
      save(); bar(); draw();
      if (x.kind === 'field' && S.fields) { const F = S.fields.filter(f => x.ids.includes(f.id)); F.forEach(f => { S.build.names[f.id] = f.name; }); const pts = []; F.forEach(f => { for (let i = 0; i < f.poly.length; i += 2) pts.push([f.poly[i + 1], f.poly[i]]); }); if (pts.length) { try { $id('mapFollow').checked = false; } catch (er) { } S.map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] }); } }
      buildStrip(); return; }
    if (d.mlhunt) {
      if (d.mlhunt === 'build') { const B = S.build; if (B) hunt({ kind: B.kind, where: B.where, ids: B.ids, order: B.order, name: B.name || B.whereName }); return; }
      if (d.mlhunt === 'one') { const r = S.info; hunt(r.kind === 'room' ? { kind: 'rooms', where: r.dungeon, ids: [r.id], name: r.name } : { kind: 'field', where: r.region, ids: [r.id], name: r.name }); return; }
      const x = S.sets.find(s => 'set:' + s.id === d.mlhunt); if (x) hunt({ kind: x.kind, where: x.kind === 'rooms' ? x.dungeon : x.region, ids: x.ids, order: x.order, name: x.name }); return;
    }
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'mlMin' || t.id === 'mlMax') { S.lvMin = $id('mlMin').value.replace(/\D/g, ''); S.lvMax = $id('mlMax').value.replace(/\D/g, ''); S.fit = ''; save(); bar(); draw(); }
    if (t.id === 'mlFit') { S.fit = t.value; save(); draw(); }
  }

  async function attach(map) {
    S.map = map;
    if (!$id('mlCss')) { const st = document.createElement('style'); st.id = 'mlCss'; st.textContent = `
      .ml-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}.ml-chip{min-height:36px;padding:3px 10px}.ml-chip.on{outline:2px solid var(--gold,#c9a54a)}
      .ml-bar input{width:52px;min-height:36px;font-size:16px}.ml-bar select{min-height:36px;font-size:15px;max-width:220px}.ml-lv{display:inline-flex;gap:4px;align-items:center}
      .ml-build{padding:6px 2px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.ml-acts{display:inline-flex;flex-wrap:wrap;gap:6px}.ml-acts button,.ml-acts .btn{min-height:40px}
      .ml-info{border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:8px;margin-top:6px;background:rgba(0,0,0,.25)}.ml-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
      .ml-mon{border-top:1px solid rgba(255,255,255,.07);padding:6px 0}.ml-mon summary{cursor:pointer;min-height:32px}.ml-dl{margin:3px 0 0 8px;line-height:1.7}
      .ml-it{display:inline-block;margin:1px 6px 1px 0;padding:0 5px;border-radius:4px;background:rgba(255,255,255,.07);font-size:13px}.ml-it i{opacity:.75;font-style:normal}
      .ml-best{margin:6px 0;line-height:1.8}.ml-rooms button{display:block;width:100%;text-align:left;min-height:38px;margin:3px 0}.ml-set{padding:6px 0;border-top:1px solid rgba(255,255,255,.07)}
      .ml-dg{white-space:nowrap}.ml-dg span{display:inline-block;width:16px;height:16px;border-radius:4px;color:#000;font-size:12px;text-align:center;line-height:16px}
      .ml-dg b{margin-left:4px;font-size:12px;color:#fff;text-shadow:0 0 3px #000,0 0 3px #000}#map.lowzoom .ml-dg b{display:none}`; document.head.appendChild(st); }
    try { const r = await call('/api/worldlayers'); S.base = r && !r.error ? r : null; } catch (e) { S.base = null; }
    try { const r = await call('/api/huntsets'); S.sets = (r && r.sets) || []; } catch (e) { }
    if (S.on.fields) await loadFields();
    bar(); draw();
  }
  let attached = null;
  async function attachOnce(map) { if (!map || attached === map) return; attached = map; return attach(map); }
  window.MapLayers = { attach: attachOnce, redraw: () => { bar(); draw(); }, open };
  // the page may have built the map before this file loaded (initMap on the first #/map): attach to it now
  try { if (typeof MAP !== 'undefined' && MAP) attachOnce(MAP); } catch (e) { }
})();
