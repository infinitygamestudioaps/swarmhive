// ROUTE VIEW (user 2026-10-12: "This must apply to ALL routes, do it properly, same with all quests" + "All NPCs"). ONE shared component for
// every place the dashboard shows a target: the raid boss page (under the route editor), the circuit list, the quest page (every step: the
// NPC to talk to / the hunting area of its monsters), the nav atlas page (every NPC, area, room, dungeon). Data: GET /api/routeview
// (Dashboard/routeview_api.js). Shows: the computed path (nav atlas) AND the saved route (when there is one) on one map, which of the two the
// bots use (switch computed | own route | auto: POST /api/route { type, id, action 'use' } for EVERY target type since ROUTESWITCH 2026-10-13, + the
// "Record / draw my own route" link to #/routeedit/<type>/<id> (Dashboard/routeedit.js); styled uiConfirm), every obstacle on the way (doors: key / Unlock / timed /
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
  // DUNGEON STEPS (2026-10-13, user: "Archon Suscepter is on floor 1 of Cruma Tower. But our road is showing a path outside"): a route that goes into
  // a dungeon (floor / entry steps) gets level tabs over the map — surface | <dungeon> <floor> — and each tab draws only that level's walk, own route
  // points, markers and the floor map art (window.ugLayer / MAP_ZMAP of index.html, the stacked floor tiles). v.levels from /api/routeview.
  function lvlOf(v, p) {
    const L = v.levels || []; if (!p || !isFinite(p.z)) return null;
    for (const l of L) { if (!l.z) continue; const b = l.bbox; if (b && (p.x < b[0] - 800 || p.x > b[1] + 800 || p.y < b[2] - 800 || p.y > b[3] + 800)) continue; if (p.z >= l.z[0] - 300 && p.z <= l.z[1] + 300) return l.key; }
    return 'surface';
  }
  const onLvl = (v, st, p) => !st.level || !(v.levels || []).length || !p || !isFinite(p.z) || lvlOf(v, p) === st.level;
  /** consecutive points on the shown level -> polylines */
  function runs(v, st, pts) { const out = []; let cur = []; pts.forEach(p => { if (onLvl(v, st, p)) cur.push(p); else { if (cur.length) out.push(cur); cur = []; } }); if (cur.length) out.push(cur); return out; }
  function defaultLevel(v) {
    const L = v.levels || []; if (!L.length) return null;
    const t = v.target && isFinite(v.target.z) ? lvlOf(v, v.target) : null; if (t) return t;
    return v.atlas && v.atlas.dungeonKey && isFinite(v.atlas.floor) ? v.atlas.dungeonKey + ':' + v.atlas.floor : L[L.length - 1].key;
  }
  function levelTabs(v, st) {
    const L = v.levels || []; if (!L.length) return '';
    return `<div class="rv-levels" role="tablist" aria-label="map level">${L.map(l => `<button type="button" role="tab" data-rv="lvl" data-k="${E(l.key)}" class="${st.level === l.key ? 'on' : ''}" aria-selected="${st.level === l.key}">${E(l.name)}</button>`).join('')}</div>`;
  }
  const tileSuffix = (st, v, rx, ry, x, y) => {
    if (!st.level || st.level === 'surface') return '';
    const l = (v.levels || []).find(q => q.key === st.level); if (!l || !l.z) return '';
    const zm = (l.z[0] + l.z[1]) / 2;
    try { if (typeof window.ugLayer === 'function') return window.ugLayer(rx, ry, zm, x, y) || ''; } catch (e) { }
    return '';
  };
  function fit(v, st) {
    let P = []; walkLegs(v.atlas).forEach(g => g.pts.forEach(p => P.push(p)));
    if (v.custom) v.custom.points.forEach(p => P.push(p));
    markers(v).forEach(o => P.push(o.at));
    if (v.target && isFinite(v.target.x)) P.push(v.target);
    if (v.from && isFinite(v.from.x) && v.from.toStart != null && v.from.toStart < 30000) P.push(v.from);
    if (st && st.level) { const Q = P.filter(p => onLvl(v, st, p)); if (Q.length) P = Q; }   // DUNGEON STEPS: fit the shown level
    if (!P.length) return null;
    const xs = P.map(p => p.x), ys = P.map(p => p.y), x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
    return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, R: Math.max(1500, (x2 - x1) / 2 * 1.12 + 500, (y2 - y1) / 2 * 1.12 + 500) };
  }
  function mapSvg(v, st) {
    if (st.level === undefined) st.level = defaultLevel(v);   // DUNGEON STEPS: the target's level first
    if (!st.view) st.view = fit(v, st);
    const w = st.view; if (!w) return '<div class="muted rv-nomap">no coordinates to draw</div>';
    const W = 2 * w.R, x0 = w.cx - w.R, y0 = w.cy - w.R, u = W / 400;
    let t = '';
    if (W < 140000) for (let gx = Math.floor(x0 / TILE); gx * TILE < x0 + W; gx++) for (let gy = Math.floor(y0 / TILE); gy * TILE < y0 + W; gy++) {
      const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, c = gx - Math.floor(gx / 4) * 4, r = gy - Math.floor(gy / 4) * 4;
      t += `<image href="/minitile/${RX}_${RY}${tileSuffix(st, v, RX, RY, (gx + 0.5) * TILE, (gy + 0.5) * TILE)}_${c}_${r}.jpg" x="${gx * TILE}" y="${gy * TILE}" width="${TILE}" height="${TILE}" preserveAspectRatio="none"/>`;
    }
    const lab = (x, y, s, col, size) => `<text x="${x}" y="${y}" font-size="${(size || 9) * u}" fill="${col || '#fff'}" paint-order="stroke" stroke="#000" stroke-width="${3 * u}" stroke-linejoin="round">${E(s)}</text>`;
    const useA = v.use !== 'custom' || !v.custom;
    let g = '';
    walkLegs(v.atlas).forEach(L0 => runs(v, st, L0.pts).forEach(pts => { const L = { how: L0.how, pts };   // DUNGEON STEPS: only the shown level
      if (L.pts.length < 2) return; const pl = L.pts.map(p => p.x + ',' + p.y).join(' '), col = L.how === 'straight' ? COL.straight : COL.atlas;
      g += `<polyline points="${pl}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="${(useA ? 4.6 : 3.2) * u}" stroke-linejoin="round"/><polyline points="${pl}" fill="none" stroke="${col}" stroke-opacity="${useA ? 1 : .55}" stroke-width="${(useA ? 2.6 : 1.6) * u}" stroke-dasharray="${7 * u} ${4.5 * u}" stroke-linejoin="round" stroke-linecap="round"/>`;
      L.pts.forEach(p => { g += `<circle cx="${p.x}" cy="${p.y}" r="${1.6 * u}" fill="${col}" fill-opacity="${useA ? 1 : .5}"/>`; });
    }));
    // own route: per segment (a dungeon step breaks the line), only the shown level; its dungeon steps as portals
    if (v.custom) ((v.custom.segments || [{ pts: v.custom.points }]).filter(sg => sg.pts).flatMap(sg => runs(v, st, sg.pts))).forEach(run => { if (run.length < 2) return;
      const pl = run.map(p => p.x + ',' + p.y).join(' ');
      g += `<polyline points="${pl}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="${(useA ? 3.2 : 4.6) * u}" stroke-linejoin="round"/><polyline points="${pl}" fill="none" stroke="${COL.custom}" stroke-opacity="${useA ? .55 : 1}" stroke-width="${(useA ? 1.6 : 2.6) * u}" stroke-linejoin="round"/>`;
    });
    ((v.custom && v.custom.steps) || []).forEach(s => { const N = s.npc; if (!N || !isFinite(N.x) || !onLvl(v, st, N)) return;   // own route dungeon steps: portals
      g += `<circle cx="${N.x}" cy="${N.y}" r="${9 * u}" fill="none" stroke="${COL.floor}" stroke-width="${2.4 * u}"/><circle cx="${N.x}" cy="${N.y}" r="${4.5 * u}" fill="${COL.custom}" stroke="#000" stroke-width="${u}"/>` + lab(N.x + 11 * u, N.y - 7 * u, '⇩ ' + (s.floorName || 'floor') + ' (' + (N.name || '') + ')', COL.floor, 9); });
    markers(v).filter(o => onLvl(v, st, o.at)).forEach(o => {
      const c = obColor(o), x = o.at.x, y = o.at.y;
      g += o.kind === 'gk' ? `<rect x="${x - 6 * u}" y="${y - 6 * u}" width="${12 * u}" height="${12 * u}" fill="${c}" stroke="#000" stroke-width="${u}"/>`
        : `<path d="M${x} ${y - 8 * u} L${x + 8 * u} ${y} L${x} ${y + 8 * u} L${x - 8 * u} ${y}Z" fill="${c}" stroke="#000" stroke-width="${u}"/>`;
      g += lab(x + 9 * u, y + 3.5 * u, String(o.n), c, 10);
    });
    if (v.target && isFinite(v.target.x) && onLvl(v, st, v.target)) g += `<circle cx="${v.target.x}" cy="${v.target.y}" r="${8 * u}" fill="${COL.target}" stroke="#000" stroke-width="${1.2 * u}"/>` + lab(v.target.x + 11 * u, v.target.y + 4 * u, v.target.name || '', COL.target, 10);
    if (v.from && isFinite(v.from.x) && onLvl(v, st, v.from)) g += `<circle cx="${v.from.x}" cy="${v.from.y}" r="${5 * u}" fill="${COL.from}" stroke="#000" stroke-width="${u}"/>` + lab(v.from.x + 7 * u, v.from.y - 6 * u, 'you', '#fff', 9);
    return levelTabs(v, st) + `<div class="rv-map"><svg viewBox="${x0} ${y0} ${W} ${W}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="route map"><rect x="${x0}" y="${y0}" width="${W}" height="${W}" fill="#0d2a33"/>${t}${g}</svg>
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
  // ROUTESWITCH-2026-10-13 (user: "the route choice exists only for raid bosses ... must be fixed"): every target (raid / epic / NPC / quest step /
  // field area / room / dungeon) gets: computed path | own route | auto (= own route when it is locked, else computed), and the editor link.
  /** the steps in words; a walk before an NPC step says where it goes, a walk after a floor step says on which floor */
  function chainTxt(steps) {
    let floor = '';
    return steps.map((x, i) => { const nx = steps[i + 1];
      if (x.do === 'town') return E(x.cmd); if (x.do === 'gk') { floor = ''; return E(x.desc || x.link); }
      if (x.do === 'walk') return 'walk ' + KM(x.len) + (nx && (nx.do === 'floor' || nx.do === 'enter') && nx.npc ? ' to ' + E(nx.npc.name) : floor ? ' on ' + E(floor) : '');
      if (x.do === 'floor') { floor = x.floorName || ('floor ' + (x.floor + 1)); return '<b>' + (x.link ? '"' + E(x.link) + '"' : E((x.npc && x.npc.name) || 'teleporter')) + ' → ' + E((x.dungeon ? x.dungeon + ' ' : '') + floor) + '</b>'; }
      if (x.do === 'enter') { floor = x.dungeon || ''; return '<b>enter ' + E(x.dungeon || x.how || '') + (x.npc ? ' (' + E(x.npc.name) + ')' : '') + '</b>'; }
      if (x.do === 'door') return 'door ' + E(x.name || x.doorId);
      return x.do === 'arrive' ? 'arrive' : E(x.do); }).join(' › ');
  }
  function useHtml(v) {
    const sto = v.store; if (!sto) return '';
    const c = v.custom, ch = v.choice || { stored: v.useSet ? v.use : 'auto', use: v.use, why: '' }, stored = ch.stored || 'auto';
    const btn = (k, t, dis) => `<button type="button" role="radio" aria-checked="${stored === k}" data-rv="use" data-use="${k}" class="${stored === k ? 'on' : ''}"${dis ? ' disabled title="record or draw your own route first"' : ''}>${t}</button>`;
    const from = c && c.start ? ', from ' + E(c.start.kind === 'town' ? '.' + String(c.start.town).toLowerCase() : c.start.desc) : c ? ' (no start: walked from where the normal way in ends)' : '';
    const own = c ? ` · own route: ${c.points.length} points, ${KM(c.length)}${from}${c.manual ? ' · locked' : ' · not locked'}${c.uses ? ' · used ' + c.uses + '×' : ''}${c.fails ? ' · failed ' + c.fails + '×' + (c.lastFailWhy ? ' (' + E(c.lastFailWhy) + ')' : '') : ''}` : ` · no own route yet for this ${E(sto.typeName || sto.type)}`;
    // DUNGEON STEPS 2026-10-13: dungeon steps live in the route editor (#/routeedit); a route that has them / needs them opens there
    const gen = sto.editHrefGeneric && sto.editHrefGeneric !== sto.editHref ? sto.editHrefGeneric : '', main = c && gen && (c.invalid || (c.steps || []).length) ? gen : sto.editHref;
    const edit = `<a class="rv-edit" href="${E(main)}">${c ? 'Edit my own route ›' : 'Record / draw my own route ›'}</a>${gen && gen !== main ? ` <a class="rv-edit muted" href="${E(gen)}">(editor with dungeon steps)</a>` : ''}`;
    const bad = c && c.invalid ? `<div class="rv-invalid" role="alert">⚠ Your own route is not walkable: ${E(c.invalid)}. The bots take the computed path until you fix it — open the editor and add the dungeon step (the teleporter into the dungeon / to the floor), or tick “real drop” on that point.</div>` : '';
    return `<div class="rv-use"><span>The bots use:</span><div class="rv-seg" role="radiogroup" aria-label="which route the bots use">${btn('atlas', 'computed path')}${btn('custom', 'own route', !c)}${btn('auto', 'auto')}</div>
      <span class="muted"><b class="rv-now">now: ${ch.use === 'custom' ? 'own route' : 'computed path'}</b> · ${E(ch.why || '')}${own}${c && (c.steps || []).length ? ' · dungeon steps: ' + c.steps.map(x => E((x.npc ? x.npc.name + ' → ' : '') + (x.dungeon || '') + ' ' + (x.floorName || ''))).join(', ') : ''}</span> ${edit}${bad}</div>`;
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
    if (!r) return s + `<div class="rv-box none">No computed path for ${E((v.target && v.target.key) || '?')} in the nav atlas.</div>` + useHtml(v) + (v.custom && o.map !== false ? mapSvg(v, st) : '');   // ROUTESWITCH: the own route still works
    const bad = /^(unreachable|blocked)$/.test(r.status);
    s += `<div class="rv-head"><span class="rv-st ${E(r.status)}">${E(r.status)}</span><b>${E(o.title || r.name)}</b> <span class="muted">${KM(r.length)} · ${SEC(r.sec)}${r.maxDanger ? ' · monsters up to lvl ' + r.maxDanger : ''}</span> <a href="#/navatlas/${encodeURIComponent(r.key)}">atlas ›</a></div>`;
    s += `<div class="muted rv-chain">${chainTxt(r.steps || [])}</div>`;   // DUNGEON STEPS: '.dion › Dion -> Cruma Tower › walk 0.4k to Mozella › "Teleport into the Tower." → Cruma Tower 1st floor › walk 3.1k on 1st floor › arrive'
    if (bad || (r.why || []).length) s += `<ul class="rv-why ${bad ? 'bad' : ''}">${(r.why || ['no reason given']).slice(0, 5).map(w => `<li>${E(w)}</li>`).join('')}</ul>`;
    if (v.from && v.from.toStart != null) s += `<div class="muted">from you: ${KM(v.from.toStart)} to the start of the walk, ${KM(v.from.toTarget)} to the target</div>`;
    s += useHtml(v);   // ROUTESWITCH-2026-10-13: the switch + "record / edit my own route" for EVERY target type
    if (o.map === 'dungeon' ? (v.levels || []).length > 0 : o.map !== false) s += mapSvg(v, st);   // DUNGEON STEPS: map 'dungeon' = only for a route into a dungeon (level tabs + floor art)
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
    st.v = v || { error: 'no answer' }; st.view = null; st.level = undefined; render(el);   // DUNGEON STEPS: a new route = its own default level
  }
  async function onClick(e) {
    const el = e.currentTarget, st = ST.get(el), b = e.target.closest('[data-rv]'); if (!st || !b || b.disabled) return;
    const a = b.dataset.rv, v = st.v;
    if (a === 'zin' || a === 'zout') { if (st.view) { st.view.R = Math.min(90000, Math.max(500, st.view.R * (a === 'zin' ? 0.6 : 1.7))); render(el); } return; }
    if (a === 'fit') { st.view = null; render(el); return; }
    if (a === 'lvl') { st.level = b.dataset.k; st.view = null; render(el); return; }   // DUNGEON STEPS: surface / dungeon floor tab
    if (a === 'step' && v && v.quest) { QSEL[v.quest.id] = +b.dataset.i; st.target = 'quest:' + v.quest.id + ':' + b.dataset.i; el.classList.add('rv-busy'); await load(el); el.classList.remove('rv-busy'); return; }
    if (a === 'use' && v && v.store) {                 // ROUTESWITCH-2026-10-13: every target type, 3 ways (computed / own / auto)
      const use = b.dataset.use, stored = (v.choice && v.choice.stored) || (v.useSet ? v.use : 'auto');
      if (use === stored || (use === 'custom' && !v.custom)) return;
      const what = use === 'atlas' ? `Every party travelling to ${v.target.name} follows the computed path (nav atlas${v.atlas ? ', ' + KM(v.atlas.length) : ''}). Your own route stays on file.`
        : use === 'custom' ? `Every party travelling to ${v.target.name} walks your own route (${v.custom.points.length} points) from its start, every member each point.`
        : `Auto: the bots walk your own route while it is LOCKED${v.custom ? ' (it is ' + (v.custom.manual ? 'locked' : 'not locked') + ')' : ''}, otherwise the computed path.`;
      const ok = typeof uiConfirm === 'function' ? await uiConfirm({ title: use === 'atlas' ? 'Bots use the computed path?' : use === 'custom' ? 'Bots use your own route?' : 'Back to auto?',
        body: [typeof uiP === 'function' ? uiP(what) : what, typeof uiNote === 'function' ? uiNote('Kept until you change it here. The bots read it on their next trip (no deploy).') : ''].filter(Boolean), confirmText: use === 'atlas' ? 'Use computed path' : use === 'custom' ? 'Use own route' : 'Use auto' }) : false;
      if (!ok) return;
      let d; try { d = await api('/api/route', { method: 'POST', body: JSON.stringify({ type: v.store.type, id: v.store.id, action: 'use', use }) }); } catch (er) { d = { error: er.message }; }
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
  // ROUTESWITCH-2026-10-13: any button / link with data-rvopen="<target>" (field area / room pickers, epic page, ...) opens the route sheet
  document.addEventListener('click', (e) => { const b = e.target && e.target.closest && e.target.closest('[data-rvopen]'); if (!b) return; e.preventDefault(); e.stopPropagation(); sheet(b.dataset.rvopen, { title: b.dataset.rvtitle || 'Route', party: b.dataset.rvparty || '' }); }, true);
  window.RouteView = { mount, refresh, sheet, version: '2026-10-13', _html: html, _useHtml: useHtml };
})();
