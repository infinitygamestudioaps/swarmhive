// TOWN PATHS LAYER (user 2026-10-12: "On the map there is a blue line showing all the paths they can run to reach their target - why not in
// Giran? It works in Heine." + "I want to be able to see ALL computed paths in ALL towns on the maps.").
// WHY GIRAN SHOWED NOTHING: the Parties map only drew a town's street graph while the leader walked it (swarm_state.route.dungeon = the town,
// /api/dungeongraph). Every town except Giran is walked along its street graph (swarm.js walkToInner -> rgWalk); in Giran the bots walk ONLY
// the recorded routes (giran_routes.json, giranGo), which publish no route, so no graph was ever drawn there.
// THIS LAYER draws, whenever a town is in view: that town's full street graph (thin blue, every edge of Scripts/data/town_graph/<key>.json),
// house doors (yellow), the spot in front of every NPC (blue = gatekeeper, green = shop, grey = other), arrival points (magenta) and, for
// Giran, the recorded routes (orange, labelled per place; the one being walked now is thicker). The character's own planned route stays on top.
// Used by: the character page mini-map (Dashboard/charpage.js), the Parties maps (index.html partyMap) and the Map tab (Leaflet, + a town
// picker that shows any town without a character there). On/off is remembered per browser (localStorage, try/catch).
// Data: GET /api/townpaths?list=1 (once) + ?town=<key> (lazily, only when that town is in view) — Dashboard/townpaths_api.js.
(function () {
  'use strict';
  const LS = 'townPaths.on', MAXW = 70000;
  const COL = { street: '#4da3ff', route: '#ff9f1c', routeOn: '#ffd166', door: '#ffd34d', gk: '#5aa9ff', shop: '#6fd36f', guard: '#9aa3ad', npc: '#d8d8d8', arrive: '#ff5cf0', start: '#ffffff' };
  let ON = true;
  try { const v = localStorage.getItem(LS); if (v === '0' || v === '1') ON = v === '1'; } catch (e) { }
  const S = { idx: null, idxAt: 0, idxBusy: false, g: {}, force: '', map: null, ll: {} };
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const get = (u) => (typeof window.api === 'function' ? window.api(u) : typeof api === 'function' ? api(u) : fetch(u).then(r => r.json()));   // eslint-disable-line no-undef
  const changed = () => { try { window.dispatchEvent(new Event('townpaths:change')); } catch (e) { } };

  // ------------------------------------------------------------------------------------------------ state + data
  function isOn() { return ON; }
  function setOn(v) {
    ON = !!v; try { localStorage.setItem(LS, ON ? '1' : '0'); } catch (e) { }
    document.querySelectorAll('[data-tptoggle]').forEach(b => { b.classList.toggle('on', ON); b.setAttribute('aria-pressed', ON ? 'true' : 'false'); });
    changed();
  }
  function ensureIndex() {
    if (S.idx || S.idxBusy || Date.now() - S.idxAt < 60000) return S.idx;
    S.idxBusy = true; S.idxAt = Date.now();
    get('/api/townpaths?list=1').then(r => { if (r && Array.isArray(r.towns) && r.towns.length) { S.idx = r.towns; changed(); fillPickers(); } }).catch(() => { }).then(() => { S.idxBusy = false; });
    return null;
  }
  /** one town's data (null while loading; a 'townpaths:change' event fires when it arrives) */
  function town(key) {
    if (!key) return null;
    const c = S.g[key];
    if (c && c.d) return c.d;
    if (c && (c.busy || Date.now() - c.at < 60000)) return null;
    S.g[key] = { at: Date.now(), busy: true, d: null };
    get('/api/townpaths?town=' + encodeURIComponent(key)).then(d => { if (d && Array.isArray(d.lines)) { S.g[key] = { at: Date.now(), d: prep(d) }; changed(); } else S.g[key] = { at: Date.now(), d: null }; })
      .catch(() => { S.g[key] = { at: Date.now(), d: null }; });
    return null;
  }
  /** the towns whose box touches the rectangle (nearest first, max 3) */
  function townsIn(x0, y0, x1, y1) {
    const I = ensureIndex() || [], m = 600, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return I.filter(t => t.box && t.box[0] < x1 + m && t.box[1] > x0 - m && t.box[2] < y1 + m && t.box[3] > y0 - m)
      .sort((a, b) => Math.hypot(a.center[0] - cx, a.center[1] - cy) - Math.hypot(b.center[0] - cx, b.center[1] - cy)).slice(0, 3).map(t => t.key);
  }
  const dots = (P) => P.map(p => `M${p[0]} ${p[1]}l.01 0`).join('');
  function prep(d) {
    // one <path> for the whole network (relative commands: small), dots as zero-length round-capped strokes (same size at every zoom)
    d._d = d.lines.map(l => { let s = 'M' + l[0] + ' ' + l[1]; for (let i = 2; i + 1 < l.length; i += 2) s += 'l' + (l[i] - l[i - 2]) + ' ' + (l[i + 1] - l[i - 1]); return s; }).join('');
    d._roles = {}; (d.npcs || []).forEach(n => { (d._roles[n.role] = d._roles[n.role] || []).push([n.fx, n.fy]); });
    d._base = {};
    return d;
  }
  function baseOf(d, active) {
    const k = active || '-'; if (d._base[k]) return d._base[k];
    const ns = 'fill="none" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"';
    let s = `<g class="tp-g" data-town="${esc(d.key)}" pointer-events="none"><path d="${d._d}" ${ns} stroke="${COL.street}" stroke-opacity=".6" stroke-width="1"/>`;
    if (d.doors && d.doors.length) s += `<path d="${dots(d.doors)}" ${ns} stroke="${COL.door}" stroke-width="4"/>`;
    ['npc', 'guard', 'shop', 'gk'].forEach(r => { const P = d._roles[r]; if (P && P.length) s += `<path d="${dots(P)}" ${ns} stroke="${COL[r]}" stroke-width="${r === 'gk' || r === 'shop' ? 5 : 3.5}"/>`; });
    if (d.arrive && d.arrive.length) s += `<path d="${dots(d.arrive)}" ${ns} stroke="${COL.arrive}" stroke-width="6"/>`;
    if (d.giran) {
      d.giran.routes.forEach(r => { const on = r.name === active; s += `<polyline points="${r.pts.map(p => p[0] + ',' + p[1]).join(' ')}" ${ns} stroke="${on ? COL.routeOn : COL.route}" stroke-width="${on ? 4 : 2.2}" stroke-opacity="${on ? 1 : 0.9}"/>`; });
      if (d.giran.start) s += `<path d="${dots([d.giran.start])}" ${ns} stroke="${COL.start}" stroke-width="7"/>`;
    }
    return (d._base[k] = s + '</g>');
  }
  function labelsOf(d, v, o) {
    const u = v.u, fs = (o.fs || 10) * u, L = (x, y, t, fill, bold) => `<text x="${Math.round(x)}" y="${Math.round(y)}" font-size="${fs}"${bold ? ' font-weight="700"' : ''} fill="${fill}" paint-order="stroke" stroke="#000" stroke-width="${3 * u}" stroke-linejoin="round" pointer-events="none">${esc(t)}</text>`;
    const inV = (x, y) => x > v.x0 && x < v.x0 + v.W && y > v.y0 && y < v.y0 + v.H, placed = [];
    const free = (x, y) => { if (placed.some(p => Math.abs(p[0] - x) < 70 * u && Math.abs(p[1] - y) < 13 * u)) return false; placed.push([x, y]); return true; };
    let s = '';
    if (d.giran && v.W < 30000) d.giran.routes.forEach(r => {
      const p = r.pts[r.pts.length - 1]; if (!inV(p[0], p[1]) || !free(p[0], p[1])) return;
      s += L(p[0] + 6 * u, p[1] - 6 * u, r.name + (r.npc && v.W < 12000 ? ' · ' + r.npc : ''), r.name === o.active ? COL.routeOn : COL.route, true);
    });
    const forced = o.force === d.key, all = v.W < 3500 || (forced && v.W < 7000), some = v.W < 9000 || (forced && v.W < 16000);
    if (some) {
      let n = 0;
      (d.npcs || []).filter(x => all || x.role === 'gk' || x.role === 'shop').forEach(x => {
        if (n >= 90 || !inV(x.fx, x.fy) || !free(x.fx, x.fy)) return; n++;
        s += L(x.fx + 5 * u, x.fy + 3.5 * u, x.n + (x.t && v.W < 5000 ? ' · ' + x.t : ''), x.role === 'gk' ? '#9fd0ff' : x.role === 'shop' ? '#b5f0b5' : '#e3e3e3');
      });
    }
    if (forced && v.W >= 4000) { const b = d.box; s += L(b[0] + 8 * u, b[2] + 16 * u, d.town + ' — street graph', '#cfe6ff', true); }
    return s;
  }
  /**
   * The layer for an SVG map in game coordinates. v = { x0, y0, W, H, u } (u = game units per screen pixel); o = { active, fs, force }.
   * Returns { key, base, labels, towns }: base does not depend on the zoom (non-scaling strokes) and changes only when key changes.
   */
  function layer(v, o) {
    o = o || {};
    const none = (k) => ({ key: k, base: '', labels: '', towns: [] });
    if (!(ON || o.force)) return none('off');
    if (!v || !(v.W > 0) || v.W > MAXW) return none('far');
    const keys = townsIn(v.x0, v.y0, v.x0 + v.W, v.y0 + (v.H || v.W));
    if (o.force && !keys.includes(o.force)) keys.push(o.force);
    let base = '', labels = ''; const k = [], got = [];
    keys.forEach(key => { const d = town(key); if (!d) { k.push(key + '…'); return; } base += baseOf(d, o.active); labels += labelsOf(d, Object.assign({ H: v.W }, v), o); k.push(key + ':' + (o.active || '')); got.push(d); });
    return { key: k.join('|') || 'none', base, labels, towns: got };
  }
  /** layer() as one string (maps that rebuild their whole SVG anyway) */
  function svg(v, o) { const r = layer(v, o); return r.base + r.labels; }
  /** the Giran place a character is walking to right now ("Giran recorded route to grocer"), else '' */
  function activeOf(c) {
    if (!c) return '';
    const e = (c.intents || [])[0] || c.intent; if (!e || e.result) return '';
    let t = ''; try { t = JSON.stringify(e); } catch (x) { return ''; }
    const m = t.match(/Giran recorded route to ([a-z0-9_]+)/i); return m ? m[1].toLowerCase() : '';
  }
  function toggleHtml(extra) {
    return `<button type="button" class="tp-tg${ON ? ' on' : ''}${extra ? ' ' + extra : ''}" data-tptoggle aria-pressed="${ON}" title="Town paths: every street the bots can walk in a town (blue), house doors, NPC spots; in Giran also the recorded routes (orange). Remembered in this browser.">${'<svg viewBox="0 0 16 12" aria-hidden="true"><path d="M1 10 L5 4 L10 7 L15 2 M5 4 L6 11" fill="none" stroke="' + COL.street + '" stroke-width="1.6" stroke-linecap="round"/></svg>'}<span class="tp-l">Town paths</span></button>`;
  }
  /** legend spans (the .pmlegend / .mmlegend style); towns = layer().towns (Giran entry only when Giran is in view) */
  function legendHtml(towns, opts) {
    if (!ON && !(opts && opts.always)) return '';
    const giran = !towns || towns.some(d => d && d.giran);
    return `<span style="color:${COL.street}">━ town paths (all streets)</span>` + (giran ? `<span style="color:${COL.route}">━ Giran recorded routes</span>` : '') +
      `<span style="color:${COL.door}">• door</span><span style="color:${COL.gk}">• gatekeeper</span><span style="color:${COL.shop}">• shop</span><span style="color:${COL.arrive}">• arrival</span>`;
  }

  // ------------------------------------------------------------------------------------------------ Map tab (Leaflet)
  function fillPickers() {
    if (!S.idx) return;
    document.querySelectorAll('select[data-tppick]').forEach(sel => {
      if (sel.options.length > 1) return;
      sel.insertAdjacentHTML('beforeend', S.idx.slice().sort((a, b) => a.town.localeCompare(b.town)).map(t => `<option value="${esc(t.key)}">${esc(t.town)}${t.giran ? ' (+ recorded routes)' : ''}</option>`).join(''));
      if (S.force) sel.value = S.force;
    });
  }
  function pickerHtml() { return `<select data-tppick title="Show any town's street graph and NPC spots (no character needs to be there)" aria-label="Show a town's paths"><option value="">Town paths: pick a town…</option></select>`; }
  /** Leaflet map (lat = game y, lng = game x): adds the layer in its own pane under the character dots, the toggle, a town picker and a legend */
  function attach(map, h) {
    if (!map || !window.L || S.map === map) return;
    S.map = map; h = h || {};
    const Lf = window.L;
    map.createPane('townpaths'); const pane = map.getPane('townpaths'); pane.style.zIndex = 350; pane.style.pointerEvents = 'none';
    map.createPane('townpathsNpc'); map.getPane('townpathsNpc').style.zIndex = 380;
    const rend = Lf.canvas({ pane: 'townpaths', padding: 0.3 });
    const bar = document.querySelector('#tab-map .mapbar'), mapEl = document.getElementById('map');
    if (bar && !bar.querySelector('.tp-mapbar')) bar.insertAdjacentHTML('beforeend', `<span class="tp-mapbar">${toggleHtml()}${pickerHtml()}<span class="muted tp-info"></span></span>`);
    if (mapEl && !document.getElementById('tpMapLegend')) mapEl.insertAdjacentHTML('afterend', '<div class="pmlegend tp-legend" id="tpMapLegend"></div>');
    const sel = bar && bar.querySelector('select[data-tppick]');
    if (sel) sel.addEventListener('change', () => {
      const key = sel.value; S.force = key; if (!key) { sync(); return; }
      if (h.onPick) try { h.onPick(key); } catch (e) { }
      if (!ON) setOn(true);
      const t = (S.idx || []).find(x => x.key === key);
      if (t && t.box) map.fitBounds([[t.box[2], t.box[0]], [t.box[3], t.box[1]]], { padding: [10, 10], maxZoom: 2 });
      town(key); sync();
    });
    ensureIndex(); fillPickers();
    function build(d, lvl) {
      const g = Lf.layerGroup(), ll = (p) => [p[1], p[0]];
      Lf.polyline(d.lines.map(l => { const a = []; for (let i = 0; i + 1 < l.length; i += 2) a.push([l[i + 1], l[i]]); return a; }), { renderer: rend, color: COL.street, weight: lvl >= 2 ? 1.4 : 1, opacity: 0.65, interactive: false }).addTo(g);
      if (d.giran) {
        d.giran.routes.forEach(r => {
          Lf.polyline(r.pts.map(ll), { renderer: rend, color: COL.route, weight: lvl >= 1 ? 3 : 2, opacity: 0.95, interactive: false }).addTo(g);
          const end = r.pts[r.pts.length - 1];
          const m = Lf.circleMarker(ll(end), { pane: 'townpathsNpc', radius: 4, color: '#000', weight: 1, fillColor: COL.route, fillOpacity: 1 }).addTo(g);
          m.bindTooltip(esc(r.name + (r.npc ? ' · ' + r.npc : '')), { permanent: lvl >= 1, direction: 'right', offset: [6, 0], className: 'mlabel tp-tip' });
        });
        if (d.giran.start) Lf.circleMarker(ll(d.giran.start), { pane: 'townpathsNpc', radius: 5, color: '#000', weight: 1, fillColor: COL.start, fillOpacity: 1 }).bindTooltip('Giran start (every recorded route begins here)', { direction: 'right' }).addTo(g);
      }
      if (lvl >= 1) (d.npcs || []).forEach(n => {
        if (lvl < 2 && n.role !== 'gk' && n.role !== 'shop') return;
        const m = Lf.circleMarker([n.fy, n.fx], { pane: 'townpathsNpc', radius: n.role === 'gk' || n.role === 'shop' ? 4 : 3, color: '#000', weight: 1, fillColor: COL[n.role] || COL.npc, fillOpacity: 0.95 }).addTo(g);
        m.bindTooltip(esc(n.n + (n.t ? ' · ' + n.t : '')), { permanent: lvl >= 2 && (n.role === 'gk' || n.role === 'shop'), direction: 'right', offset: [5, 0], className: 'mlabel tp-tip' });
      });
      if (lvl >= 2) {
        (d.doors || []).forEach(p => Lf.circleMarker(ll(p), { renderer: rend, radius: 2, color: COL.door, weight: 0, fillColor: COL.door, fillOpacity: 1, interactive: false }).addTo(g));
        (d.arrive || []).forEach(p => Lf.circleMarker(ll(p), { pane: 'townpathsNpc', radius: 3.5, color: '#000', weight: 1, fillColor: COL.arrive, fillOpacity: 1 }).bindTooltip(esc(p[2] || 'arrival')).addTo(g));
      }
      return g;
    }
    function sync() {
      const b = map.getBounds(), z = map.getZoom();
      const x0 = Math.min(b.getWest(), b.getEast()), x1 = Math.max(b.getWest(), b.getEast()), y0 = Math.min(b.getSouth(), b.getNorth()), y1 = Math.max(b.getSouth(), b.getNorth());
      const upp = (x1 - x0) / Math.max(1, map.getSize().x);   // game units per screen pixel
      const want = (ON || S.force) && upp <= 200 ? townsIn(x0, y0, x1, y1).filter(k => ON || k === S.force) : [];
      if (S.force && upp <= 400 && !want.includes(S.force)) want.push(S.force);
      const lvl = z >= 2 ? 2 : z >= 0.5 ? 1 : 0, shown = [];
      Object.keys(S.ll).forEach(k => { if (!want.includes(k) || S.ll[k].lvl !== lvl) { S.ll[k].g.remove(); delete S.ll[k]; } });
      want.forEach(k => { const d = town(k); if (!d) return; shown.push(d); if (!S.ll[k]) S.ll[k] = { lvl, g: build(d, lvl).addTo(map) }; });
      const info = bar && bar.querySelector('.tp-info'), lg = document.getElementById('tpMapLegend');
      if (info) info.textContent = !ON && !S.force ? '' : shown.length ? shown.map(d => `${d.town}: ${d.lines.length} street paths, ${(d.npcs || []).length} NPC spots${d.giran ? ', ' + d.giran.routes.length + ' recorded routes' : ''}`).join(' · ') : upp > 200 ? 'zoom in on a town to see its paths' : '';
      if (lg) lg.innerHTML = ON || S.force ? legendHtml(shown.length ? shown : null, { always: true }) : '';
    }
    map.on('moveend zoomend', sync);
    window.addEventListener('townpaths:change', sync);
    S.sync = sync; sync();
  }

  // ------------------------------------------------------------------------------------------------ toggle (event delegation) + styles
  document.addEventListener('click', (e) => { const b = e.target && e.target.closest && e.target.closest('[data-tptoggle]'); if (!b) return; e.preventDefault(); e.stopPropagation(); setOn(!ON); }, true);
  if (!document.getElementById('tpStyle')) {
    const st = document.createElement('style'); st.id = 'tpStyle';
    st.textContent = `.tp-tg{display:inline-flex;align-items:center;gap:4px;font-size:var(--fs-mini,11px);padding:2px 7px;min-height:24px;border:1px solid var(--line2,#4a5560);border-radius:3px;background:rgba(0,0,0,.35);color:var(--muted,#aab);cursor:pointer;opacity:.75}
.tp-tg svg{width:16px;height:12px;flex:none}.tp-tg.on{opacity:1;color:#cfe6ff;border-color:#4da3ff;background:rgba(77,163,255,.16)}
.tp-mapbar{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;max-width:100%}.tp-mapbar select{max-width:min(230px,100%)}
.tp-mapbar .tp-info{font-size:var(--fs-mini,11px)}.tp-legend{min-height:0}.tp-tg.tp-icon .tp-l{display:none}.tp-tg.tp-icon{justify-content:center;padding:0;min-width:30px;min-height:30px}.tp-tg.tp-icon svg{width:18px;height:14px}
.leaflet-tooltip.tp-tip{font-size:11px;padding:1px 4px}`;
    (document.head || document.documentElement).appendChild(st);
  }
  window.TownPaths = { isOn, setOn, layer, svg, activeOf, toggleHtml, legendHtml, pickerHtml, attach, townsIn, town, ensureIndex, COL, _s: S, version: '2026-10-12' };
})();
