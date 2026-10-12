// ROUTE VIEW (user 2026-10-12: "This must apply to ALL routes, do it properly, same with all quests" + "All NPCs"). ONE shared component for
// every place the dashboard shows a target: the raid boss page (under the route editor), the circuit list, the quest page (every step: the
// NPC to talk to / the hunting area of its monsters), the nav atlas page (every NPC, area, room, dungeon). Data: GET /api/routeview
// (Dashboard/routeview_api.js). Shows: the computed path (nav atlas) AND the saved route (when there is one) on one map, which of the two the
// bots use (switch: POST /api/route action 'use', raid routes; styled uiConfirm), every obstacle on the way (doors: key / Unlock / timed /
// owner-only / never opens, floor teleporters, entries, by-hand steps, level / skill / Seven Signs needs) numbered on the map + in a list, and
// for every needed item: who in the party has it and WHERE to get it (monster drops with chance + hunting area, quest rewards, shops).
// Use: RouteView.mount(el, 'raid:29014' | 'npc:30177' | 'area:<id>' | 'room:<id>' | 'dungeon:<key>' | 'quest:<id>[:<step>]',
//        { map: true|false, party: '<leader>', from: { x, y, z } | 'x,y,z', onUse(v), title })
// Phone first (390 px): one column, the map square, the lists below. No browser dialogs (uidialog.js only).
(function () {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TILE = 8192;
  const COL = { atlas: '#3ee0ff', straight: '#ff9a4d', custom: '#ffd34d', door: '#ffaa44', blocked: '#ff4d4d', timed: '#f2c14e', floor: '#cc66ff', enter: '#ffcc44', need: '#ff66cc', gk: '#44ee66', target: '#f0c040', from: '#ffffff' };
  const KM = (d) => !(d > 0) ? '?' : d >= 1000 ? (d / 1000).toFixed(1) + 'k' : String(Math.round(d));
  const SEC = (s) => !s ? '' : s >= 90 ? '~' + Math.round(s / 60) + ' min' : '~' + Math.round(s) + ' s';
  const apiGet = (u) => (typeof api === 'function' ? api(u) : fetch(u).then(r => r.json()));
  const ST = new WeakMap();
  const QSEL = {};   // the quest step picked last per quest (a page rebuild re-mounts on the same step)

  function walkLegs(r) {
    const out = []; if (!r) return out;
    (r.steps || []).forEach(s => { if (s.do !== 'walk' || !Array.isArray(s.points)) return; const p = []; for (let i = 0; i + 2 < s.points.length; i += 3) p.push({ x: +s.points[i], y: +s.points[i + 1], z: +s.points[i + 2] }); if (p.length) out.push({ how: s.how || '', pts: p }); });
    return out;
  }
  const obColor = (o) => o.blocked ? COL.blocked : o.kind === 'door' ? (o.timed ? COL.timed : COL.door) : COL[o.kind] || COL.need;
  function markers(v) { return (v.obstacles || []).filter(o => o.at && isFinite(o.at.x)).map((o, i) => Object.assign({ n: i + 1 }, o)); }
  function fit(v) {
    const P = []; walkLegs(v.atlas).forEach(g => g.pts.forEach(p => P.push(p)));
    if (v.custom) v.custom.points.forEach(p => P.push(p));
    markers(v).forEach(o => P.push(o.at));
    if (v.target && isFinite(v.target.x)) P.push(v.target);
    if (v.from && isFinite(v.from.x) && v.from.toStart != null && v.from.toStart < 30000) P.push(v.from);
    if (!P.length) return null;
    const xs = P.map(p => p.x), ys = P.map(p => p.y), x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
    return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, R: Math.max(1500, (x2 - x1) / 2 * 1.12 + 500, (y2 - y1) / 2 * 1.12 + 500) };
  }
  function mapSvg(v, st) {
    if (!st.view) st.view = fit(v);
    const w = st.view; if (!w) return '<div class="muted rv-nomap">no coordinates to draw</div>';
    const W = 2 * w.R, x0 = w.cx - w.R, y0 = w.cy - w.R, u = W / 400;
    let t = '';
    if (W < 140000) for (let gx = Math.floor(x0 / TILE); gx * TILE < x0 + W; gx++) for (let gy = Math.floor(y0 / TILE); gy * TILE < y0 + W; gy++) {
      const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, c = gx - Math.floor(gx / 4) * 4, r = gy - Math.floor(gy / 4) * 4;
      t += `<image href="/minitile/${RX}_${RY}_${c}_${r}.jpg" x="${gx * TILE}" y="${gy * TILE}" width="${TILE}" height="${TILE}" preserveAspectRatio="none"/>`;
    }
    const lab = (x, y, s, col, size) => `<text x="${x}" y="${y}" font-size="${(size || 9) * u}" fill="${col || '#fff'}" paint-order="stroke" stroke="#000" stroke-width="${3 * u}" stroke-linejoin="round">${E(s)}</text>`;
    const useA = v.use !== 'custom' || !v.custom;
    let g = '';
    walkLegs(v.atlas).forEach(L => {
      if (L.pts.length < 2) return; const pl = L.pts.map(p => p.x + ',' + p.y).join(' '), col = L.how === 'straight' ? COL.straight : COL.atlas;
      g += `<polyline points="${pl}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="${(useA ? 4.6 : 3.2) * u}" stroke-linejoin="round"/><polyline points="${pl}" fill="none" stroke="${col}" stroke-opacity="${useA ? 1 : .55}" stroke-width="${(useA ? 2.6 : 1.6) * u}" stroke-dasharray="${7 * u} ${4.5 * u}" stroke-linejoin="round" stroke-linecap="round"/>`;
      L.pts.forEach(p => { g += `<circle cx="${p.x}" cy="${p.y}" r="${1.6 * u}" fill="${col}" fill-opacity="${useA ? 1 : .5}"/>`; });
    });
    if (v.custom && v.custom.points.length > 1) {
      const pl = v.custom.points.map(p => p.x + ',' + p.y).join(' ');
      g += `<polyline points="${pl}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="${(useA ? 3.2 : 4.6) * u}" stroke-linejoin="round"/><polyline points="${pl}" fill="none" stroke="${COL.custom}" stroke-opacity="${useA ? .55 : 1}" stroke-width="${(useA ? 1.6 : 2.6) * u}" stroke-linejoin="round"/>`;
    }
    markers(v).forEach(o => {
      const c = obColor(o), x = o.at.x, y = o.at.y;
      g += o.kind === 'gk' ? `<rect x="${x - 6 * u}" y="${y - 6 * u}" width="${12 * u}" height="${12 * u}" fill="${c}" stroke="#000" stroke-width="${u}"/>`
        : `<path d="M${x} ${y - 8 * u} L${x + 8 * u} ${y} L${x} ${y + 8 * u} L${x - 8 * u} ${y}Z" fill="${c}" stroke="#000" stroke-width="${u}"/>`;
      g += lab(x + 9 * u, y + 3.5 * u, String(o.n), c, 10);
    });
    if (v.target && isFinite(v.target.x)) g += `<circle cx="${v.target.x}" cy="${v.target.y}" r="${8 * u}" fill="${COL.target}" stroke="#000" stroke-width="${1.2 * u}"/>` + lab(v.target.x + 11 * u, v.target.y + 4 * u, v.target.name || '', COL.target, 10);
    if (v.from && isFinite(v.from.x)) g += `<circle cx="${v.from.x}" cy="${v.from.y}" r="${5 * u}" fill="${COL.from}" stroke="#000" stroke-width="${u}"/>` + lab(v.from.x + 7 * u, v.from.y - 6 * u, 'you', '#fff', 9);
    return `<div class="rv-map"><svg viewBox="${x0} ${y0} ${W} ${W}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="route map"><rect x="${x0}" y="${y0}" width="${W}" height="${W}" fill="#0d2a33"/>${t}${g}</svg>
      <div class="rv-zoom"><button type="button" data-rv="zin" aria-label="zoom in">+</button><button type="button" data-rv="zout" aria-label="zoom out">−</button><button type="button" data-rv="fit" aria-label="show all">⤢</button></div></div>
      <div class="rv-legend"><span><i style="background:${COL.atlas}"></i>computed path (nav atlas)</span>${v.custom ? `<span><i style="background:${COL.custom}"></i>saved route</span>` : ''}${walkLegs(v.atlas).some(L => L.how === 'straight') ? `<span><i style="background:${COL.straight}"></i>not on the geodata (straight)</span>` : ''}<span><i class="d" style="background:${COL.door}"></i>door</span><span><i class="d" style="background:${COL.blocked}"></i>blocked</span><span><i class="d" style="background:${COL.floor}"></i>teleporter</span><span><i style="background:${COL.target}"></i>target</span></div>`;
  }
  function itemHtml(it) {
    const have = it.have || [], inP = have.filter(h => h.inParty), src = it.sources || {};
    const own = inP.length ? `<span class="rv-ok">the party has it: ${inP.map(h => E(h.name) + ' ×' + h.count).join(', ')}</span>`
      : have.length ? `<span class="rv-warn">not in the party — ${have.map(h => E(h.name) + ' ×' + h.count).join(', ')} ha${have.length > 1 ? 've' : 's'} it</span>`
      : `<span class="rv-bad">nobody has it</span>`;
    const ways = [];
    (src.drops || []).forEach(d => ways.push(`<li>hunt <b>${E(d.name)}</b>${d.level ? ' (lvl ' + d.level + ')' : ''} — drops it ${d.chance != null ? d.chance + '%' : ''}${d.quest ? ` <span class="muted">during quest <a href="#/quests/${d.quest.id}">${E(d.quest.name)}</a></span>` : ''}${(d.areas || []).length ? ' · at ' + d.areas.slice(0, 2).map(a => `<a href="#/navatlas/${encodeURIComponent(a.key)}">${E(a.name)}</a>${a.landing ? ' <span class="muted">(' + E(a.landing) + ')</span>' : ''}`).join(', ') : d.at ? ` · spawns near ${Math.round(d.at.x)}, ${Math.round(d.at.y)}` : ''}${d.spawns ? ' <span class="muted">· ' + d.spawns + ' spawns</span>' : ''}</li>`));
    (src.quests || []).forEach(q => ways.push(`<li>quest <a href="#/quests/${q.quest.id}">${E(q.quest.name)}</a>${q.level && q.level.min ? ' (lvl ' + q.level.min + '+)' : ''}${(q.start || []).length ? ' — start: ' + q.start.map(n => E(n.name) + (n.town ? ' in ' + E(n.town) : '')).join(', ') : ''}</li>`));
    (src.shops || []).forEach(s => ways.push(`<li>sold by <b>${E(s.name || 'NPC ' + s.npc)}</b>${s.price ? ' · ' + s.price + ' adena' : ''}</li>`));
    return `<div class="rv-item"><div><b>${E(it.name)}</b> <span class="muted">${it.id}${it.consumed ? ' · used up' : ''}${it.any ? ' · any one of these' : ''}${it.why ? ' · for ' + E(it.why) : ''}</span></div><div>${own}</div>
      ${inP.length ? '' : ways.length ? `<div class="rv-get">Where to get it:<ul>${ways.join('')}</ul></div>` : '<div class="muted">no source in the data (drop lists of normal monsters are not extracted)</div>'}</div>`;
  }
  function html(v, st) {
    const r = v.atlas, o = st.opts;
    let s = '';
    if (v.quest) {
      const q = v.quest;
      s += `<div class="rv-steps" role="tablist" aria-label="quest steps">${q.steps.map(x => `<button type="button" role="tab" data-rv="step" data-i="${x.i}" class="${x.i === q.sel ? 'on' : ''}"${x.target ? '' : ' disabled'} title="${E(x.what || x.title)}">${x.i + 1}. ${E(String(x.title).slice(0, 48))}</button>`).join('')}</div>`;
      const cur = q.steps[q.sel];
      if (cur) s += `<div class="muted rv-sub">${E(cur.what || cur.title)}${cur.hunt && cur.hunt.length ? ' · ' + cur.hunt.map(h => E(h.name) + (h.itemName ? ' → ' + E(h.itemName) + (h.chance != null ? ' ' + h.chance + '%' : '') : '')).join(', ') : ''}</div>`;
    }
    if (!r) return s + `<div class="rv-box none">No computed path for ${E((v.target && v.target.key) || '?')} in the nav atlas.</div>`;
    const bad = /^(unreachable|blocked)$/.test(r.status);
    s += `<div class="rv-head"><span class="rv-st ${E(r.status)}">${E(r.status)}</span><b>${E(o.title || r.name)}</b> <span class="muted">${KM(r.length)} · ${SEC(r.sec)}${r.maxDanger ? ' · monsters up to lvl ' + r.maxDanger : ''}</span> <a href="#/navatlas/${encodeURIComponent(r.key)}">atlas ›</a></div>`;
    s += `<div class="muted rv-chain">${(r.steps || []).map(x => x.do === 'town' ? E(x.cmd) : x.do === 'gk' ? E(x.desc || x.link) : x.do === 'walk' ? 'walk ' + KM(x.len) : x.do === 'arrive' ? 'arrive' : E(x.do)).join(' › ')}</div>`;
    if (bad || (r.why || []).length) s += `<ul class="rv-why ${bad ? 'bad' : ''}">${(r.why || ['no reason given']).slice(0, 5).map(w => `<li>${E(w)}</li>`).join('')}</ul>`;
    if (v.from && v.from.toStart != null) s += `<div class="muted">from you: ${KM(v.from.toStart)} to the start of the walk, ${KM(v.from.toTarget)} to the target</div>`;
    if (v.custom) {
      const c = v.custom;
      s += `<div class="rv-use"><span>The bots use:</span><div class="rv-seg" role="radiogroup" aria-label="which route the bots use">
          <button type="button" role="radio" aria-checked="${v.use === 'atlas'}" data-rv="use" data-use="atlas" class="${v.use === 'atlas' ? 'on' : ''}">computed path</button>
          <button type="button" role="radio" aria-checked="${v.use === 'custom'}" data-rv="use" data-use="custom" class="${v.use === 'custom' ? 'on' : ''}">saved route</button></div>
          <span class="muted">${v.useSet ? 'locked by you' : 'default (' + (c.manual ? 'the route is locked' : 'the route is only recorded') + ')'} · saved route: ${c.points.length} points, ${KM(c.length)}${c.start ? ', from ' + E(c.start.kind === 'town' ? '.' + String(c.start.town).toLowerCase() : c.start.desc) : ''}${c.fails ? ' · failed ' + c.fails + '×' : ''}</span></div>`;
    }
    if (o.map !== false) s += mapSvg(v, st);
    const ob = v.obstacles || [], mk = markers(v), numOf = new Map(mk.map(m => [m.title + '|' + m.text, m.n]));
    const onWay = ob.filter(x => x.onPath !== 'need'), needs = ob.filter(x => x.onPath === 'need');
    if (onWay.length) s += `<div class="rv-sec">On the way (${onWay.length})</div><ol class="rv-obs">${onWay.map(x => { const n = numOf.get(x.title + '|' + x.text); return `<li class="${x.blocked ? 'bad' : ''}"><i class="rv-dot" style="background:${obColor(x)}">${n || ''}</i><div><b>${E(x.title)}</b>${x.blocked ? ' <span class="rv-st bad">blocked</span>' : ''}${x.onPath === 'near' ? ' <span class="muted">(right on the walk)</span>' : ''}${x.place ? ' <span class="muted">· ' + E(x.place) + '</span>' : ''}<div class="muted">${E(x.text)}</div></div></li>`; }).join('')}</ol>`;
    if (needs.length) s += `<div class="rv-sec">Needs</div><ul class="rv-needs">${needs.map(x => `<li><b>${E(x.title)}</b> <span class="muted">${E(x.text)}</span></li>`).join('')}</ul>`;
    if ((v.items || []).length) s += `<div class="rv-sec">Items needed (${v.items.length})</div>${v.items.map(itemHtml).join('')}`;
    if (!onWay.length && !needs.length && !(v.items || []).length) s += '<div class="muted rv-sec">No doors, teleporters or items on the way.</div>';
    return s;
  }
  function query(st) {
    const o = st.opts, f = typeof o.from === 'string' ? o.from : o.from && isFinite(o.from.x) ? [o.from.x, o.from.y, o.from.z || 0].map(Math.round).join(',') : '';
    return '/api/routeview?target=' + encodeURIComponent(st.target) + (o.party ? '&party=' + encodeURIComponent(o.party) : '') + (f ? '&from=' + encodeURIComponent(f) : '');
  }
  function render(el) { const st = ST.get(el); if (!st || !st.v) return; el.innerHTML = st.v.error ? `<div class="rv-box none">${E(st.v.error)}</div>` : html(st.v, st); }
  async function load(el) {
    const st = ST.get(el); if (!st) return;
    const my = ++st.gen;
    let v; try { v = await apiGet(query(st)); } catch (e) { v = { error: e.message }; }
    if (st.gen !== my || ST.get(el) !== st) return;
    if (v && v.error && /not found|404|Cannot GET/i.test(v.error)) v.error += ' — the dashboard server needs a restart for /api/routeview';
    st.v = v || { error: 'no answer' }; st.view = null; render(el);
  }
  async function onClick(e) {
    const el = e.currentTarget, st = ST.get(el), b = e.target.closest('[data-rv]'); if (!st || !b || b.disabled) return;
    const a = b.dataset.rv, v = st.v;
    if (a === 'zin' || a === 'zout') { if (st.view) { st.view.R = Math.min(90000, Math.max(500, st.view.R * (a === 'zin' ? 0.6 : 1.7))); render(el); } return; }
    if (a === 'fit') { st.view = null; render(el); return; }
    if (a === 'step' && v && v.quest) { QSEL[v.quest.id] = +b.dataset.i; st.target = 'quest:' + v.quest.id + ':' + b.dataset.i; el.classList.add('rv-busy'); await load(el); el.classList.remove('rv-busy'); return; }
    if (a === 'use' && v && v.custom) {
      const use = b.dataset.use; if (use === v.use && v.useSet) return;
      const ok = typeof uiConfirm === 'function' ? await uiConfirm({ title: use === 'atlas' ? 'Bots use the computed path?' : 'Bots use the saved route?',
        body: [typeof uiP === 'function' ? uiP(use === 'atlas' ? `Every party travelling to ${v.target.name} follows the nav atlas path (${KM(v.atlas && v.atlas.length)}). The saved route stays on file.` : `Every party travelling to ${v.target.name} walks the saved route (${v.custom.points.length} points) from its start.`) : '',
          typeof uiNote === 'function' ? uiNote('Locked until you change it here. The bots read it on their next trip (no deploy).') : ''].filter(Boolean), confirmText: use === 'atlas' ? 'Use computed path' : 'Use saved route' }) : false;
      if (!ok) return;
      let d; try { d = await api('/api/route', { method: 'POST', body: JSON.stringify({ id: v.custom.id, action: 'use', use }) }); } catch (er) { d = { error: er.message }; }
      if (d && d.error) { if (typeof uiError === 'function') uiError(d.error); return; }
      await load(el); try { st.opts.onUse && st.opts.onUse(st.v, d); } catch (er) { }
    }
  }
  /** show the route to a target in el (re-mount = new target / options) */
  function mount(el, target, opts) {
    if (!el) return;
    let st = ST.get(el);
    if (!st) { st = { gen: 0 }; ST.set(el, st); el.addEventListener('click', onClick); el.classList.add('rv'); }
    st.target = String(target || ''); st.opts = opts || {}; st.view = null;
    { const m = st.target.match(/^quest:(\d+)$/); if (m && QSEL[m[1]] != null) st.target += ':' + QSEL[m[1]]; }
    if (!st.v) el.innerHTML = '<div class="muted">loading the route…</div>';
    return load(el);
  }
  const refresh = (el) => { if (ST.get(el)) return load(el); };
  /** a sheet over the page (phone: full screen; desktop: centred) with the route to a target; opts.links = [{ href, text }] */
  function sheet(target, opts) {
    opts = opts || {};
    let bg = document.getElementById('rvSheet');
    if (bg) bg.remove();
    bg = document.createElement('div'); bg.id = 'rvSheet'; bg.className = 'rv-sheetbg';
    bg.innerHTML = `<div class="rv-sheet" role="dialog" aria-modal="true" aria-label="${E(opts.title || 'Route')}"><div class="rv-sheethead"><b>${E(opts.title || 'Route')}</b>${(opts.links || []).map(l => `<a href="${E(l.href)}" data-rvclose="1">${E(l.text)}</a>`).join('')}<button type="button" data-rvclose="1" aria-label="close">✕</button></div><div class="rv-sheetbody"></div></div>`;
    const close = () => { bg.remove(); document.removeEventListener('keydown', esc); window.removeEventListener('hashchange', close); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-rvclose]')) close(); });
    document.addEventListener('keydown', esc); window.addEventListener('hashchange', close);
    document.body.appendChild(bg);
    mount(bg.querySelector('.rv-sheetbody'), target, Object.assign({ map: true }, opts));
    return close;
  }
  window.RouteView = { mount, refresh, sheet, version: '2026-10-12', _html: html };
})();
