// FORTRESS + CASTLE SIEGES (user 2026-10-08: "fortress siege with multiple teams in the same clan joining up; a tab in the Dashboard with a map
// of all fortresses — choose which one, which parties, when; they regroup before the siege; see what every fortress gives (skills ...);
// a live view JUST like the raid view with the objectives, NPCs to kill, who has the flag; the same for castle sieges").
//
// Pages (hash routing in index.html): #/forts[/<id>], #/castles[/<id>], #/siege/live. Loaded by index.html after its main script, so it
// uses that script's globals: $, esc, api, patch, GI, UI, gauge, gaugeN, skillIcon, itemIcon, STATE, go, confirmOrder, send, MT, mss, clock.
// API: GET/POST /api/sieges (Dashboard/sieges_api.js), GET /api/siegelive (Logs/siege_live.json, written by the siege's main leader).
// Data: Scripts/data/fortresses.json + castles.json (docs/plan/sieges_research.md). Plans: Scripts/data/siege_plans.json (swarm.js starts a
// plan by itself at "siege time - regroup minutes"). Bot commands: !siege plan <id> | !siege fort|castle <name> | !siege stop | !siegereg ...
(function () {
  'use strict';
  const REG = 32768;
  const S = { data: null, loadedAt: 0, loading: false, cur: 'forts', sel: { forts: '', castles: '' }, live: { running: false }, tick: 0,
    draft: null, rev: 0, renderedRev: -1, stagingPick: false, built: {} };
  const $s = (id) => document.getElementById(id);
  const fmtN = (v) => v == null || v === '' ? '?' : Number(v).toLocaleString();
  const K = (k) => k === 'castles' || k === 'castle' ? 'castle' : 'fort';
  const TAB_OF = (kind) => kind === 'castle' ? 'castles' : 'forts';
  const short = (n) => String(n || '').replace(/\s+(Fortress|Castle)$/i, '').replace(/^Castle of\s+/i, '');
  const PCOL = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
  const pcol = (leader) => { const L = ((S.data && S.data.parties) || []).map(p => p.leader).sort(); const i = L.indexOf(leader); return PCOL[Math.max(0, i) % PCOL.length]; };
  const fortMin = () => { const r = S.data && S.data.fortMeta && S.data.fortMeta.rules; return r && r.minClanLevel != null ? +r.minClanLevel : 4; };
  const castleMin = () => { const r = S.data && S.data.castleMeta && S.data.castleMeta.rules; return r && r.minClanLevel != null ? +r.minClanLevel : 5; };
  const minFor = (kind) => kind === 'castle' ? castleMin() : fortMin();
  const list = (kind) => S.data ? (kind === 'castle' ? S.data.castles : S.data.forts) || [] : [];
  const byId = (kind, id) => list(kind).find(t => String(t.id) === String(id)) || null;
  const posOf = (t) => t && t.pos && isFinite(t.pos.x) ? t.pos : null;
  const localDT = (iso) => { const d = new Date(iso); if (isNaN(d)) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const whenTxt = (iso) => { const d = new Date(iso); return isNaN(d) ? '?' : d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); };
  const untilTxt = (ms) => { const s = Math.round(ms / 1000); if (s <= 0) return 'now'; const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `in ${d}d ${h}h` : h ? `in ${h}h ${String(m).padStart(2, '0')}m` : `in ${m}m`; };
  const tzTxt = () => { const o = -new Date().getTimezoneOffset(); return `${(S.data && S.data.tz) || 'local'} (UTC${o >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(o) / 60)).padStart(2, '0')}:${String(Math.abs(o) % 60).padStart(2, '0')})`; };
  const chip = (cls, txt, title) => `<span class="fit ${cls}"${title ? ` title="${esc(title)}"` : ''}>${esc(txt)}</span>`;

  // ------------------------------------------------------------------------------------------------------------------- loading
  async function load(force) {
    if (S.loading || (!force && Date.now() - S.loadedAt < 12000)) return;
    S.loading = true;
    try { const d = await api('/api/sieges'); if (d && !d.error) { S.data = d; S.loadedAt = Date.now(); if (d.live) S.live = d.live; } } catch (e) { }
    S.loading = false;
    renderCur();
  }
  function renderCur() { if (TAB === 'forts' || TAB === 'castles') render(TAB); if (TAB === 'siege') renderLivePage(); }

  // ------------------------------------------------------------------------------------------------------------------- page skeleton
  function build(tab) {
    if (S.built[tab]) return;
    const kind = K(tab), root = $s('tab-' + tab); if (!root) return;
    root.innerHTML = `
      <div class="whead"><h2>${kind === 'castle' ? 'Castles — sieges' : 'Fortresses — sieges'}</h2><div class="act sg-act">
        <a class="btn" href="#/siege/live">Live view</a><button data-sg="reload" title="read the data again">↻</button></div></div>
      <div id="sgLive_${tab}"></div>
      <div id="sgHead_${tab}" class="sg-head"></div>
      <div class="sg-grid">
        <div class="sg-mapcol"><div id="sgMap_${tab}" class="sg-map"></div><div class="sg-leg muted">${kind === 'castle'
          ? '<i class="sgk castle"></i>castle <i class="sgk fort t"></i>fortress (its territory) <i class="sgk plan"></i>siege planned <i class="sgk party"></i>party leader · tap a castle'
          : '<i class="sgk fort t"></i>territory fortress <i class="sgk fort b"></i>border fortress <i class="sgk castle dim"></i>castle <i class="sgk plan"></i>siege planned <i class="sgk party"></i>party leader · big marker = large fortress · tap one'}</div></div>
        <div class="sg-detcol"><div id="sgDetail_${tab}"></div></div>
      </div>
      <div class="whead sg-sub"><h2>Plan a siege</h2><span class="muted" id="sgPlanFor_${tab}"></span></div>
      <div id="sgPlanner_${tab}" class="box"></div>
      <div id="sgWarn_${tab}"></div>
      <div class="whead sg-sub"><h2>Planned sieges</h2></div>
      <div id="sgPlans_${tab}"></div>
      <div class="whead sg-sub"><h2>${kind === 'castle' ? 'All castles' : 'All fortresses'}</h2></div>
      <div class="scroll" id="sgTable_${tab}"></div>
      <div class="whead sg-sub"><h2>Rules + sources</h2></div>
      <div id="sgRules_${tab}" class="box"></div>`;
    S.built[tab] = true;
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
  }
  function show(tab) {
    if (!document.querySelector('link[href="/sieges.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/sieges.css'; document.head.appendChild(l); }
    ensureBanner();
    if (tab === 'siege') {
      [...$('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === (S.live && S.live.kind === 'castle' ? 'castles' : 'forts')));
      buildLive(); renderLivePage(); pollLive(true); load(false); return;
    }
    S.cur = tab; build(tab); render(tab); load(!S.data); pollLive(true);
  }
  function arg(kind, a) { if ((kind === 'forts' || kind === 'castles') && a) S.sel[kind] = a; }

  // ------------------------------------------------------------------------------------------------------------------- main render
  function render(tab) {
    if (!S.built[tab]) return;
    const kind = K(tab);
    if (!S.data) { patch($s('sgHead_' + tab), '<div class="muted">Loading…</div>'); return; }
    const L = list(kind);
    if (!L.length) { patch($s('sgHead_' + tab), `<div class="box warn">No ${kind === 'castle' ? 'castle' : 'fortress'} data yet: Scripts/data/${kind === 'castle' ? 'castles' : 'fortresses'}.json is missing (docs/plan/tools/sieges_data.js).</div>`); return; }
    if (!S.sel[tab] || !byId(kind, S.sel[tab])) S.sel[tab] = String((nextPlanFor(kind) || {}).targetId || L[0].id);
    const t = byId(kind, S.sel[tab]);
    patch($s('sgLive_' + tab), S.live && S.live.running ? liveHtml(true) : '');
    patch($s('sgHead_' + tab), headHtml(kind));
    patch($s('sgMap_' + tab), overviewSvg(kind, t));
    patch($s('sgDetail_' + tab), detailHtml(kind, t));
    patch($s('sgPlanFor_' + tab), t ? `for <b>${esc(t.name)}</b>` : '');
    if (!S.draft || S.draft.kind !== kind || String(S.draft.targetId) !== String(t.id)) newDraft(kind, t);
    if (S.renderedRev !== S.rev || S.draftTab !== tab) { $s('sgPlanner_' + tab).innerHTML = plannerHtml(kind, t); S.renderedRev = S.rev; S.draftTab = tab; }
    patch($s('sgWarn_' + tab), warnHtml(kind, t));
    patch($s('sgPlans_' + tab), plansHtml(kind));
    patch($s('sgTable_' + tab), tableHtml(kind));
    patch($s('sgRules_' + tab), rulesHtml(kind));
  }
  const nextPlanFor = (kind) => (S.data.plans || []).filter(p => p.kind === kind && p.status === 'planned' && Date.parse(p.siegeAt) > Date.now() - 3 * 3600e3).sort((a, b) => Date.parse(a.siegeAt) - Date.parse(b.siegeAt))[0] || null;

  function headHtml(kind) {
    const c = S.data.clan || {}, need = minFor(kind), ok = c.name && c.level >= need;
    const clanTxt = c.name ? `Clan <b>${esc(c.name)}</b> level <b>${c.level}</b>` : '<b>No clan</b> detected yet';
    const plans = (S.data.plans || []).filter(p => p.kind === kind && p.status === 'planned');
    return `<div class="sg-eligible ${ok ? 'ok' : 'no'}">${GI(ok ? UI.yes : UI.warn, 'sm')} ${clanTxt} (leader ${esc(c.leader || '?')}${c.leaderOnline ? '' : ', offline'}) ·
      a ${kind === 'castle' ? 'castle' : 'fortress'} siege needs clan level <b>${need}</b> — ${ok ? '<span class="ok">we qualify</span>' : `<span class="bad">we cannot register yet (level ${c.level || 0}/${need})</span>`}
      · ${(c.members || []).length} of our characters are in the clan · ${plans.length} siege${plans.length === 1 ? '' : 's'} planned</div>`;
  }

  // ------------------------------------------------------------------------------------------------------------------- overview map
  function overviewSvg(kind, sel) {
    const forts = list('fort').filter(posOf), castles = list('castle').filter(posOf);
    const pts = forts.concat(castles).map(posOf);
    if (!pts.length) return '<div class="muted">No coordinates in the data.</div>';
    let x0 = Math.min(...pts.map(p => p.x)) - 12000, x1 = Math.max(...pts.map(p => p.x)) + 12000, y0 = Math.min(...pts.map(p => p.y)) - 12000, y1 = Math.max(...pts.map(p => p.y)) + 12000;
    const W = x1 - x0, H = y1 - y0, u = Math.max(W, H) / 420;
    let tiles = '';
    for (let rx = Math.floor(x0 / REG) + 20; (rx - 20) * REG < x1; rx++) for (let ry = Math.floor(y0 / REG) + 18; (ry - 18) * REG < y1; ry++) {
      tiles += `<image href="/maptiles/${rx}_${ry}.jpg" x="${(rx - 20) * REG}" y="${(ry - 18) * REG}" width="${REG}" height="${REG}" preserveAspectRatio="none"/>`;
    }
    const plans = (S.data.plans || []).filter(p => p.status === 'planned');
    const planned = (k, id) => plans.some(p => p.kind === k && String(p.targetId) === String(id));
    const liveT = S.live && S.live.running ? S.live : null;
    const lbl = (x, y, t, size, fill, anchor) => `<text x="${x}" y="${y}" font-size="${(size || 9) * u}" fill="${fill || '#fff'}" text-anchor="${anchor || 'middle'}" paint-order="stroke" stroke="#000" stroke-width="${2.6 * u}" stroke-linejoin="round">${esc(t)}</text>`;
    let g = '';
    // castle -> its fortresses (thin lines), so it is clear which fortress belongs to which castle
    castles.forEach(c => (c.forts || []).forEach(fid => { const f = forts.find(x => String(x.id) === String(fid)); if (f) g += `<line x1="${c.pos.x}" y1="${c.pos.y}" x2="${f.pos.x}" y2="${f.pos.y}" stroke="rgba(227,194,122,${kind === 'castle' ? .45 : .18})" stroke-width="${1 * u}" stroke-dasharray="${3 * u} ${3 * u}"/>`; }));
    const fortMark = (f) => {
      const big = /large/i.test(f.size || ''), r = (big ? 7 : 5.2) * u * (kind === 'castle' ? .75 : 1), isSel = kind === 'fort' && sel && String(sel.id) === String(f.id);
      const col = /border/i.test(f.type || '') ? '#7fb6e8' : '#e3c27a';
      const p = f.pos, d = `M${p.x} ${p.y - r}L${p.x + r} ${p.y}L${p.x} ${p.y + r}L${p.x - r} ${p.y}Z`;
      return `<g class="sgm" data-sg-pick="fort|${esc(f.id)}">${isSel ? `<circle cx="${p.x}" cy="${p.y}" r="${r * 2.1}" fill="none" stroke="#fff" stroke-width="${1.6 * u}"/>` : ''}
        ${liveT && liveT.kind === 'fort' && String(liveT.id) === String(f.id) ? `<circle cx="${p.x}" cy="${p.y}" r="${r * 2.6}" class="sg-pulse" stroke-width="${2 * u}"/>` : ''}
        <path d="${d}" fill="${col}" stroke="#000" stroke-width="${1.2 * u}" opacity="${kind === 'castle' ? .7 : 1}"/>
        ${planned('fort', f.id) ? lbl(p.x + r * 1.1, p.y - r * .9, '⚑', 10, '#ff5a3c', 'start') : ''}
        ${kind === 'fort' || isSel ? lbl(p.x, p.y + r + 9 * u, short(f.name), kind === 'fort' ? 8 : 7, isSel ? '#fff' : '#f3e6c4') : ''}</g>`;
    };
    const castleMark = (c) => {
      const r = (kind === 'castle' ? 9 : 6) * u, isSel = kind === 'castle' && sel && String(sel.id) === String(c.id), p = c.pos;
      return `<g class="sgm" data-sg-pick="castle|${esc(c.id)}">${isSel ? `<circle cx="${p.x}" cy="${p.y}" r="${r * 1.9}" fill="none" stroke="#fff" stroke-width="${1.6 * u}"/>` : ''}
        ${liveT && liveT.kind === 'castle' && String(liveT.id) === String(c.id) ? `<circle cx="${p.x}" cy="${p.y}" r="${r * 2.4}" class="sg-pulse" stroke-width="${2 * u}"/>` : ''}
        <rect x="${p.x - r}" y="${p.y - r * .8}" width="${2 * r}" height="${1.6 * r}" rx="${r * .2}" fill="${kind === 'castle' ? '#ec6a55' : 'rgba(236,106,85,.55)'}" stroke="#000" stroke-width="${1.2 * u}"/>
        <path d="M${p.x - r} ${p.y - r * .8}l${r * .4} ${-r * .6}l${r * .3} ${r * .6}l${r * .3} ${-r * .6}l${r * .3} ${r * .6}l${r * .3} ${-r * .6}l${r * .4} ${r * .6}" fill="${kind === 'castle' ? '#ffd34d' : 'rgba(255,211,77,.5)'}" stroke="#000" stroke-width="${.8 * u}"/>
        ${planned('castle', c.id) ? lbl(p.x + r * 1.2, p.y - r, '⚑', 11, '#ff5a3c', 'start') : ''}
        ${lbl(p.x, p.y + r + 10 * u, short(c.name), kind === 'castle' ? 10 : 7.5, kind === 'castle' ? '#ffd2c8' : 'rgba(255,210,200,.8)')}</g>`;
    };
    if (kind === 'castle') { forts.forEach(f => { g += fortMark(f); }); castles.forEach(c => { g += castleMark(c); }); }
    else { castles.forEach(c => { g += castleMark(c); }); forts.forEach(f => { g += fortMark(f); }); }
    // party leaders where they are now
    (S.data.parties || []).forEach(p => { const m = p.members.find(x => x.name === p.leader); if (!m || !isFinite(m.x) || m.x < x0 || m.x > x1 || m.y < y0 || m.y > y1) return;
      g += `<circle cx="${m.x}" cy="${m.y}" r="${3.4 * u}" fill="${pcol(p.leader)}" stroke="#000" stroke-width="${1 * u}"/>` + lbl(m.x + 5 * u, m.y + 3 * u, p.leader, 6.5, pcol(p.leader), 'start'); });
    return `<svg class="sg-world" viewBox="${x0} ${y0} ${W} ${H}" preserveAspectRatio="xMidYMid meet"><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#0b0f10"/><g>${tiles}</g><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="rgba(0,0,0,.28)"/>${g}</svg>`;
  }

  // ------------------------------------------------------------------------------------------------------------------- close-up map
  /** The area around a fortress / castle on the game's map pieces: objectives, NPCs, landing, staging point (and live units when given). */
  function closeupSvg(kind, t, L, opt) {
    const c = posOf(t) || (L && L.center); if (!c) return '<div class="muted">no position</div>';
    const pts = [];
    const add = (p, w) => { if (p && isFinite(p.x) && isFinite(p.y)) pts.push(Object.assign({}, p, w || {})); };
    (t.commanders || []).forEach(m => add(m)); (t.combatFlags || []).forEach(m => add(m)); add(t.flagPole); (t.doors || t.gates || []).forEach(m => add(m));
    (t.artifact || []).forEach(m => add(m)); (t.controlTowers || []).forEach(m => add(m)); (t.flameTowers || []).forEach(m => add(m));
    (t.npcs || []).forEach(m => add(m));
    const stg = (opt && opt.staging) || t.staging; add(stg);
    if (L) { (L.party || []).forEach(m => add(m)); (L.enemies || []).forEach(m => add(m)); (L.objectives || []).forEach(m => add(m)); }
    let R = 1500; pts.forEach(p => { const d = Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)); if (d < 9000) R = Math.max(R, d + 400); });
    R = Math.min(R, 9000);
    const x0 = c.x - R, y0 = c.y - R, W = 2 * R, u = W / 360;
    let imgs = '';
    for (let gx = Math.floor(x0 / MT); gx * MT < x0 + W; gx++) for (let gy = Math.floor(y0 / MT); gy * MT < y0 + W; gy++) {
      const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, cc = gx - Math.floor(gx / 4) * 4, rr = gy - Math.floor(gy / 4) * 4;
      imgs += `<image href="/minitile/${RX}_${RY}_${cc}_${rr}.jpg" x="${gx * MT}" y="${gy * MT}" width="${MT}" height="${MT}" preserveAspectRatio="none"/>`;
    }
    const lbl = (x, y, s, size, fill, anchor) => `<text x="${x}" y="${y}" font-size="${(size || 9) * u}" fill="${fill || '#fff'}" text-anchor="${anchor || 'start'}" paint-order="stroke" stroke="#000" stroke-width="${2.6 * u}" stroke-linejoin="round">${esc(s)}</text>`;
    const objSt = {}; if (L) (L.objectives || []).forEach(o => { objSt[o.key] = o; });
    let g = '';
    (t.npcs || []).forEach(n => { if (!isFinite(n.x)) return; g += `<circle cx="${n.x}" cy="${n.y}" r="${2.4 * u}" fill="#9aa39e" stroke="#000" stroke-width="${.6 * u}"><title>${esc(n.name)} ${esc(n.title || '')} (${esc(n.role || '')}, npc ${esc(n.npcId)})</title></circle>`;
      if (/merchant|envoy|messenger|manager|chamberlain/i.test(n.role || '')) g += lbl(n.x + 4 * u, n.y + 3 * u, n.name, 7, '#cfd8d3'); });
    let ccLbl = false;
    (t.doors || t.gates || []).forEach(d => { if (!isFinite(d.x)) return; const st = objSt['door' + d.id]; const col = st ? (st.status === 'destroyed' || st.status === 'open' ? '#86cf6e' : '#7fb6e8') : '#7fb6e8';
      g += `<rect x="${d.x - 5 * u}" y="${d.y - 2.5 * u}" width="${10 * u}" height="${5 * u}" fill="${col}" stroke="#000" stroke-width="${.7 * u}"><title>${esc(d.name || 'door ' + d.id)}${d.hp ? ' · ' + fmtN(d.hp) + ' HP' : ''}</title></rect>`;
      if (!ccLbl && /command|control|center|centre|main building/i.test(d.role || d.name || '') && (ccLbl = true)) g += lbl(d.x + 6 * u, d.y - 4 * u, 'command center', 7, '#9fd0ff'); });
    (t.controlTowers || []).forEach(d => { if (isFinite(d.x)) g += `<path d="M${d.x} ${d.y - 6 * u}L${d.x + 5 * u} ${d.y + 4 * u}L${d.x - 5 * u} ${d.y + 4 * u}Z" fill="#b16cff" stroke="#000" stroke-width="${.7 * u}"><title>Control Tower (${esc(d.npcId)})</title></path>`; });
    (t.flameTowers || []).forEach(d => { if (isFinite(d.x)) g += `<path d="M${d.x} ${d.y - 6 * u}L${d.x + 5 * u} ${d.y + 4 * u}L${d.x - 5 * u} ${d.y + 4 * u}Z" fill="#ff8a3d" stroke="#000" stroke-width="${.7 * u}"><title>Flame Tower (${esc(d.npcId)})</title></path>`; });
    (t.commanders || []).forEach((m, i) => { if (!isFinite(m.x)) return; const st = objSt['c' + (m.n || i + 1)]; const dead = st && st.status === 'dead';
      g += `<circle cx="${m.x}" cy="${m.y}" r="${6 * u}" fill="${dead ? '#555' : '#e0483c'}" stroke="#000" stroke-width="${1 * u}"><title>${esc(m.name || 'commander')} (${esc(m.role || '')}, npc ${esc(m.npcId)})</title></circle>` +
        (dead ? lbl(m.x, m.y + 3 * u, '✕', 9, '#fff', 'middle') : '') + lbl(m.x + 8 * u, m.y + 3 * u, `C${m.n || i + 1} ${String(m.role || m.name || '').replace(/Captain|Commander|Fortress/gi, '').trim()}`, 8, dead ? '#aaa' : '#ffb4a8');
      if (st && st.party) g += lbl(m.x + 8 * u, m.y + 12 * u, '→ party ' + st.party, 6.5, pcol(st.party)); });
    (t.combatFlags || []).forEach(f => { if (isFinite(f.x)) g += lbl(f.x, f.y + 3 * u, '⚑', 11, '#ffd34d', 'middle'); });
    if (t.flagPole && isFinite(t.flagPole.x)) g += `<circle cx="${t.flagPole.x}" cy="${t.flagPole.y}" r="${5 * u}" fill="none" stroke="#ffd34d" stroke-width="${1.6 * u}"/>` + lbl(t.flagPole.x + 7 * u, t.flagPole.y + 3 * u, 'flag pole', 8, '#ffd34d');
    (t.artifact || []).forEach(a => { if (isFinite(a.x)) g += `<circle cx="${a.x}" cy="${a.y}" r="${6 * u}" fill="#ffd34d" stroke="#000" stroke-width="${1 * u}"/>` + lbl(a.x + 8 * u, a.y + 3 * u, 'Holy Artifact', 8, '#ffd34d'); });
    if (t.nearestLanding && isFinite(t.nearestLanding.x) && Math.abs(t.nearestLanding.x - c.x) < R && Math.abs(t.nearestLanding.y - c.y) < R) {
      const l = t.nearestLanding; g += `<rect x="${l.x - 4 * u}" y="${l.y - 4 * u}" width="${8 * u}" height="${8 * u}" fill="#5aa9ff" stroke="#000" stroke-width="${.8 * u}"/>` + lbl(l.x + 6 * u, l.y + 3 * u, 'landing: ' + (l.name || ''), 7, '#9fd0ff');
    }
    if (stg && isFinite(stg.x)) g += `<path d="M${stg.x - 6 * u} ${stg.y}h${12 * u}M${stg.x} ${stg.y - 6 * u}v${12 * u}" stroke="#3ddc84" stroke-width="${2.4 * u}"/>` + lbl(stg.x + 7 * u, stg.y - 4 * u, 'regroup / staging', 8, '#7dffb2');
    if (L) {
      (L.enemies || []).forEach(e => { if (isFinite(e.x)) g += `<circle cx="${e.x}" cy="${e.y}" r="${3.4 * u}" fill="${e.dead ? '#444' : '#b16cff'}" stroke="#000" stroke-width="${.7 * u}"><title>${esc(e.name)} ${esc(e.clan || '')}</title></circle>`; });
      (L.objectives || []).filter(o => o.kind === 'npc' && isFinite(o.x)).forEach(o => { g += `<circle cx="${o.x}" cy="${o.y}" r="${3 * u}" fill="${o.dead ? '#555' : '#ff9a2e'}" stroke="#000" stroke-width="${.6 * u}"><title>${esc(o.name)}</title></circle>`; });
      if (L.flag && L.flag.x != null) g += `<circle cx="${L.flag.x}" cy="${L.flag.y}" r="${9 * u}" fill="none" stroke="#ffd34d" stroke-width="${2 * u}" class="sg-pulse"/>` + lbl(L.flag.x + 10 * u, L.flag.y - 6 * u, '⚑ ' + (L.flag.holder || 'flag'), 9, '#ffd34d');
      (L.party || []).forEach(m => { if (!isFinite(m.x)) return; g += `<circle cx="${m.x}" cy="${m.y}" r="${3.6 * u}" fill="${m.dead ? '#666' : pcol(m.party)}" stroke="#000" stroke-width="${.8 * u}"><title>${esc(m.name)} (party ${esc(m.party)}) ${m.hp != null ? m.hp + '% HP' : ''}</title></circle>`; });
    }
    return `<svg class="sg-close${opt && opt.pick ? ' picking' : ''}" data-sg-close="1" data-x0="${x0}" data-y0="${y0}" data-w="${W}" viewBox="${x0} ${y0} ${W} ${W}" preserveAspectRatio="xMidYMid meet"><rect x="${x0}" y="${y0}" width="${W}" height="${W}" fill="#111"/><g>${imgs}</g><rect x="${x0}" y="${y0}" width="${W}" height="${W}" fill="rgba(0,0,0,.22)"/>${g}
      ${lbl(x0 + 6 * u, y0 + W - 6 * u, `${Math.round(W / 1000)} km across`, 7, '#ccc')}</svg>`;
  }

  // ------------------------------------------------------------------------------------------------------------------- detail panel
  function skillsHtml(sk) {
    if (!sk || !sk.length) return '<div class="muted">none in the data</div>';
    return `<div class="sg-skills">${sk.map(s => `<div class="sg-skill"><img class="ic" src="${skillIcon(s.id)}" alt="" loading="lazy">
      <div><b>${esc(s.name || 'skill ' + s.id)}</b> <span class="muted">id ${esc(s.id)}${s.level ? ' · Lv ' + esc(s.level) : ''}</span><div class="sg-eff">${esc(s.effect || s.desc || '')}</div></div></div>`).join('')}</div>`;
  }
  function dungeonHtml(D) {
    if (!D) return '';
    const q = D.quest || {};
    const raids = (D.raids || []).map(r => `<div>stage ${esc(r.stage)}: ${(r.oneOf || []).map(b => esc(b.name) + ' <span class="muted">' + esc(b.level) + '</span>').join(' / ')}</div>`).join('');
    return `<h4>Dungeon</h4><div class="sg-dun"><div><b>${esc(q.name || D.name || 'dungeon')}</b> <span class="muted">quest ${esc(q.id || '')} · level ${esc(D.minLevel || q.minLevel || '?')}+ · ${esc(D.activityTimeMin || '?')} min · re-enter after ${esc(D.reenterHours || '?')} h · ${esc(D.wardenName || '')}</span></div>
      ${D.conditions ? `<div class="muted">${esc(D.conditions)}</div>` : ''}${raids}${D.reward ? `<div>${esc(D.reward)}</div>` : ''}</div>`;
  }
  const coords = (p) => p && isFinite(p.x) ? `${Math.round(p.x)}, ${Math.round(p.y)}${isFinite(p.z) ? ', ' + Math.round(p.z) : ''}` : '?';
  const listHtml = (arr) => (arr && arr.length) ? `<ul class="sg-ul">${arr.map(x => `<li>${esc(typeof x === 'string' ? x : (x.name || x.text || JSON.stringify(x)))}${typeof x === 'object' && x && (x.effect || x.desc) ? ` <span class="muted">— ${esc(x.effect || x.desc)}</span>` : ''}</li>`).join('')}</ul>` : '<div class="muted">none in the data</div>';
  function eligHtml(kind, t) {
    const c = S.data.clan || {}, need = minFor(kind), lv = c.level || 0;
    const reg = (t.npcs || []).filter(n => kind === 'castle' ? /messenger|chamberlain/i.test(n.role || n.name || '') : /suspicious/i.test(n.role || n.name || ''));
    const fee = kind === 'castle' ? (S.data.castleMeta && S.data.castleMeta.rules || {}).registrationFee : (S.data.fortMeta && S.data.fortMeta.rules || {}).registrationFee;
    const regd = (S.data.registrations || {})[`${kind}:${t.id}`];
    const steps = [
      [!!c.name, c.name ? `Clan ${c.name} exists` : 'A clan is needed (Dagger1 founded MyClan on 2026-10-07)'],
      [lv >= need, `Clan level ${need}+ to register (now ${lv})${lv < need ? ` — clan level ${need} needed` : ''}`],
      [!!c.leaderOnline, `The clan leader ${c.leader || '?'} registers in person${c.leaderOnline ? ' (online)' : ' (offline now)'}`],
      [!!regd, `Register at ${reg.length ? reg.map(n => `${n.name}${isFinite(n.x) ? ` (${Math.round(n.x)}, ${Math.round(n.y)})` : ''}`).join(' / ') : (kind === 'castle' ? "the castle's Messenger / Chamberlain" : "the fortress's Suspicious Merchant")}${fee != null ? ` — fee ${fmtN(fee)} adena` : ''}${regd ? ` — done ${new Date(regd.at).toLocaleString()} (${regd.result || ''})` : ''}`],
      [null, kind === 'castle' ? 'Every character that fights must be in a registered clan (attacker side); the clan leader engraves the Holy Artifact' : 'Only members of a registered clan can hurt the fortress NPCs: every character in the siege should be in the clan'],
    ];
    return `<div class="sg-steps">${steps.map(([ok, txt]) => `<div class="${ok === true ? 'ok' : ok === false ? 'bad' : 'muted'}">${ok === true ? '✓' : ok === false ? '✗' : '•'} ${esc(txt)}</div>`).join('')}</div>
      <div class="sg-btns"><button data-sg="register" ${lv >= need && c.name ? '' : 'disabled'} title="${lv >= need ? '' : 'clan level ' + need + ' needed'}">Register (clan leader ${esc(c.leader || '')})</button>
      ${lv >= need ? '' : `<span class="bad">clan level ${need} needed — now ${lv}</span>`}</div>`;
  }
  function detailHtml(kind, t) {
    if (!t) return '<div class="muted">Tap a marker on the map.</div>';
    const ownerKey = `${kind}:${t.id}`, own = (S.data.owners || {})[ownerKey];
    const pl = (S.data.plans || []).filter(p => p.kind === kind && String(p.targetId) === String(t.id) && p.status === 'planned');
    const head = `<div class="sg-dh"><h3>${GI(kind === 'castle' ? UI.sword : UI.shield)} ${esc(t.name)}</h3>
      <div class="sg-chips">${kind === 'fort' ? `${t.type ? chip(/border/i.test(t.type) ? 'ok' : 'next', /border/i.test(t.type) ? 'Border fortress' : 'Territory fortress') : ''} ${t.size ? chip('low', /large/i.test(t.size) ? 'Large' : 'Small') : ''}
        ${t.castle ? `<a class="rlink" data-sg-pick="castle|${esc(t.castle.id)}">castle ${esc(t.castle.name)}</a>` : ''}` : `${t.territory ? chip('next', 'Territory ' + t.territory) : ''} ${t.town ? chip('low', 'Town ' + t.town) : ''}`}
        ${own ? chip('hard', 'owner: ' + (own.clan || '?')) : chip('low', 'owner unknown', 'the bots record the owner when they see it (Logs/siege_owners.json)')}
        ${pl.length ? chip('hard', 'siege planned ' + whenTxt(pl[0].siegeAt)) : ''}</div></div>`;
    const loc = `<div class="sg-kv"><span>Position</span><span>${coords(t.pos)}${t.nearestTown ? ' · near ' + esc(t.nearestTown) : ''}</span>
      ${t.nearestLanding ? `<span>Nearest landing</span><span>${esc(t.nearestLanding.name || '?')}${t.nearestLanding.fromTown ? ' (gatekeeper in ' + esc(t.nearestLanding.fromTown) + ')' : ''} · ${t.nearestLanding.dist != null ? Math.round(t.nearestLanding.dist) + ' away' : ''}</span>` : ''}
      ${t.staging ? `<span>Regroup point</span><span>${coords(t.staging)} <span class="muted">${esc(t.staging.why || '')}</span></span>` : ''}
      ${kind === 'castle' && t.forts && t.forts.length ? `<span>Fortresses</span><span>${t.forts.map(fid => { const f = byId('fort', fid); return f ? `<a class="rlink" data-sg-pick="fort|${esc(f.id)}">${esc(short(f.name))}</a>` : esc(fid); }).join(', ')}</span>` : ''}
      ${kind === 'castle' && t.taxDefault != null ? `<span>Tax</span><span>${esc(t.taxDefault)}%</span>` : ''}
      ${kind === 'castle' && (t.crown || t.circlet) ? `<span>Lord items</span><span>${[t.crown, t.circlet].filter(Boolean).map(i => `<img class="ic sm" src="${itemIcon(i.itemId)}" alt=""> ${esc(i.name)} <span class="muted">(${esc(i.itemId)})</span>`).join(' · ')}</span>` : ''}</div>`;
    const objectives = kind === 'castle' ? castleObjHtml(t) : fortObjHtml(t);
    const npcs = (t.npcs || []).length ? `<details class="sg-det"><summary>NPCs (${t.npcs.length})</summary><div class="scroll"><table class="l2"><thead><tr><th>Role</th><th>Name</th><th>NPC</th><th>Where</th></tr></thead><tbody>${t.npcs.map(n => `<tr><td>${esc(n.role || '')}</td><td><b>${esc(n.name || '')}</b> <span class="muted">${esc(n.title || '')}</span></td><td>${esc(n.npcId)}</td><td class="muted">${coords(n)}</td></tr>`).join('')}</tbody></table></div></details>` : '';
    const guards = t.guards && t.guards.count ? `<details class="sg-det"><summary>Defenders (${t.guards.count})</summary>${Object.entries(t.guards.byName || {}).map(([n, c]) => `<div>${esc(n)} ×${c}</div>`).join('')}</details>` : '';
    const rew = `<h4>Skills for the owning clan</h4>${skillsHtml(t.skills)}
      ${t.functions && t.functions.length ? `<h4>Functions</h4>${listHtml(t.functions)}` : ''}
      <h4>Rewards</h4>${listHtml(t.rewards || (kind === 'castle' ? [
        `Castle lord: ${t.crown ? t.crown.name + ' (' + t.crown.itemId + ')' : 'crown'} + ${t.circlet ? t.circlet.name + ' (' + t.circlet.itemId + ')' : 'circlet'} for the clan members (from the Chamberlain)`,
        `Tax on the territory's shops/teleports (datapack start value ${t.taxDefault ?? '?'}%; the lord sets it)`,
        'Castle functions (HP/MP/EXP restore, teleport, support magic), castle warehouse, manor, mercenaries, gate/wall upgrades',
        `Its fortresses (${(t.forts || []).length}) can sign a contract with the castle`,
        'Castle dungeon (quest 512) for the owning clan — see below'] : []))}
      ${kind === 'castle' && (t.territorySkills || []).length ? `<h4>Territory skills</h4>${skillsHtml(t.territorySkills)}` : ''}${dungeonHtml(t.dungeon)}`;
    return `<div class="box sg-detail">${head}${loc}
      <div class="sg-close-wrap">${closeupSvg(kind, t, null, { staging: S.draft && String(S.draft.targetId) === String(t.id) ? S.draft.staging : null, pick: S.stagingPick })}
        <div class="sg-leg muted"><i class="sgk cmd"></i>commander / barracks <i class="sgk flag"></i>combat flag <i class="sgk pole"></i>flag pole <i class="sgk door"></i>gate / door <i class="sgk npc"></i>NPC <i class="sgk land"></i>teleport landing <i class="sgk stg"></i>regroup point${kind === 'castle' ? ' <i class="sgk art"></i>artifact <i class="sgk tow"></i>towers' : ''}</div></div>
      <h4>Can we siege it?</h4>${eligHtml(kind, t)}
      <h4>Objectives</h4>${objectives}
      ${rew}${npcs}${guards}</div>`;
  }
  function fortObjHtml(t) {
    const cm = t.commanders || [], fl = t.combatFlags || [], doors = t.doors || [];
    const cc = doors.filter(d => /command|control|center|centre|main building/i.test(d.role || d.name || ''));
    return `<ol class="sg-ol">
      <li>Kill ${cm.length ? `the <b>${cm.length}</b> commanders` : 'every commander'} (each holds a barracks)${cm.length ? `:<div class="sg-cm">${cm.map((m, i) => `<div><b>C${m.n || i + 1}</b> ${esc(m.name || '?')} <span class="muted">${esc(m.role || '')} · npc ${esc(m.npcId)}${m.level ? ' · lvl ' + m.level : ''} · ${coords(m)}</span></div>`).join('')}</div>` : ''}</li>
      <li>Then the <b>command center</b> door opens${cc.length ? ` <span class="muted">(${cc.map(d => esc(d.name || 'door ' + d.id)).join(', ')})</span>` : ''}.</li>
      <li>Pick up a <b>Combat Flag</b> inside${fl.length ? ` <span class="muted">(${fl.length} spawn points)</span>` : ''} — the flag carrier.</li>
      <li>Carry it to the <b>flag pole</b>${t.flagPole && isFinite(t.flagPole.x) ? ` <span class="muted">(${coords(t.flagPole)})</span>` : ''} and raise it — the fortress is ours.</li></ol>`;
  }
  function castleObjHtml(t) {
    const g = t.gates || [], a = t.artifact || [];
    return `<ol class="sg-ol">
      <li>Break the outer and inner <b>gates</b>${g.length ? ` <span class="muted">(${g.length}: ${g.slice(0, 6).map(x => esc(x.name || x.id) + (x.hp ? ' ' + fmtN(x.hp) + ' HP' : '')).join(', ')}${g.length > 6 ? '…' : ''})</span>` : ''}.</li>
      <li>${(t.controlTowers || []).length ? `Destroy the <b>${t.controlTowers.length} Control Towers</b> (they let the defenders respawn)` : 'Destroy the Control Towers'}${(t.flameTowers || []).length ? `; ${t.flameTowers.length} Flame Towers are traps` : ''}.</li>
      <li>Protect the clan leader while he <b>engraves the Holy Artifact</b>${a.length ? ` <span class="muted">(${a.map(x => coords(x)).join(' / ')})</span>` : ''} — the castle is ours.</li></ol>`;
  }

  // ------------------------------------------------------------------------------------------------------------------- planner
  function newDraft(kind, t, from) {
    const P = S.data.parties || [];
    const p = from || {};
    const def = new Date(Date.now() + 2 * 3600e3); def.setMinutes(0, 0, 0);
    S.draft = { id: p.id || '', kind, targetId: t.id, siegeAt: p.siegeAt ? localDT(p.siegeAt) : localDT(def.toISOString()), regroupMin: p.regroupMin || 30,
      parties: new Set(p.parties || P.filter(x => x.size >= 3).slice(0, 2).map(x => x.leader)), cc: p.cc || '',
      flagCarrier: (p.roles && p.roles.flagCarrier) || '', flagBackup: (p.roles && p.roles.flagBackup) || '', engraver: (p.roles && p.roles.engraver) || '',
      assign: Object.assign({}, p.assign || {}), staging: p.staging ? Object.assign({}, p.staging) : (t.staging ? Object.assign({}, t.staging) : null), notes: p.notes || '' };
    if (!S.draft.cc) S.draft.cc = [...S.draft.parties][0] || '';
    autoRoles();
    S.rev++;
  }
  const CARRIER_PRI = ['sk', 'tank', 'destroyer', 'doombringer', 'inspector', 'dagger', 'spoiler', 'crafter'];
  /** Flag carrier: a sturdy member (tank first, then destroyers ...), never a healer; commanders spread over the parties. */
  function autoRoles() {
    const d = S.draft; if (!d) return;
    const mem = chosenMembers();
    const rank = (m) => { const i = CARRIER_PRI.indexOf(m.role); return (i < 0 ? 50 : i) * 1000 - m.level; };
    const cands = mem.filter(m => !/bishop|saint|healer|elder|oracle|cleric/i.test(m.role) && m.online).sort((a, b) => rank(a) - rank(b));
    // L2J H5 (FortSiege / skill 3318 Flag Display): only the CLAN LEADER may raise the flag -> he is the default carrier when his party comes
    const cl = (S.data.clan && S.data.clan.leader) || '';
    if (!d.flagCarrier || !mem.some(m => m.name === d.flagCarrier)) d.flagCarrier = mem.some(m => m.name === cl) ? cl : (cands[0] ? cands[0].name : '');
    if (!d.flagBackup || d.flagBackup === d.flagCarrier || !mem.some(m => m.name === d.flagBackup)) d.flagBackup = (cands.find(m => m.name !== d.flagCarrier) || {}).name || '';
    if (d.kind === 'castle' && !d.engraver) d.engraver = (S.data.clan && S.data.clan.leader) || '';
    const t = byId(d.kind, d.targetId), ps = [...d.parties];
    if (t && ps.length) (d.kind === 'castle' ? (t.gates || []).slice(0, 0) : (t.commanders || [])).forEach((m, i) => { const k = 'C' + (m.n || i + 1); if (!ps.includes(d.assign[k])) d.assign[k] = ps[i % ps.length]; });
    if (!ps.includes(d.cc)) d.cc = ps[0] || '';
  }
  function chosenMembers() {
    const d = S.draft; if (!d) return [];
    return (S.data.parties || []).filter(p => d.parties.has(p.leader)).flatMap(p => p.members.map(m => Object.assign({ party: p.leader }, m)));
  }
  function plannerHtml(kind, t) {
    const d = S.draft, P = S.data.parties || [], r = S.rev;
    const prow = (p) => `<tr class="${d.parties.has(p.leader) ? 'sel' : ''}"><td><input type="checkbox" id="sgP_${r}_${esc(p.leader)}" data-sgp="${esc(p.leader)}" ${d.parties.has(p.leader) ? 'checked' : ''}></td>
      <td><b style="color:${pcol(p.leader)}">${esc(p.leader)}</b>${p.leader === (S.data.clan || {}).leader ? ' <span class="fit next">clan leader</span>' : ''}</td><td>${p.online}/${p.size}</td><td>${p.min}-${p.max} <span class="muted">avg ${p.avg}</span></td>
      <td class="muted">${p.tanks} tank · ${p.healers} heal · ${p.size - p.tanks - p.healers} dps</td><td>${p.inClan}/${p.size}</td><td class="muted">${esc(p.ccRight || '—')}</td></tr>`;
    const mem = chosenMembers();
    const opt = (sel, filter) => `<option value="">—</option>` + mem.filter(filter || (() => true)).map(m => `<option value="${esc(m.name)}" ${m.name === sel ? 'selected' : ''}>${esc(m.name)} (${esc(m.role || '?')} ${m.level}, party ${esc(m.party)})</option>`).join('');
    const ps = [...d.parties];
    const cmRows = kind === 'fort' ? (t.commanders || []).map((m, i) => { const k = 'C' + (m.n || i + 1); return `<div class="sg-assign"><span><b>${k}</b> ${esc(m.name || m.role || '')}</span>
      <select id="sgA_${r}_${k}" data-sga="${k}"><option value="">any party</option>${ps.map(x => `<option value="${esc(x)}" ${d.assign[k] === x ? 'selected' : ''}>party ${esc(x)}</option>`).join('')}</select></div>`; }).join('') : '';
    const regAt = new Date(new Date(d.siegeAt).getTime() - (+d.regroupMin || 30) * 60000);
    return `<div class="sg-pl">
      <div class="sg-row"><label>Siege time <input type="datetime-local" id="sgAt_${r}" data-sgf="siegeAt" value="${esc(d.siegeAt)}"></label>
        <label>Regroup in Giran (minutes before) <input type="number" min="5" max="240" id="sgRg_${r}" data-sgf="regroupMin" value="${esc(d.regroupMin)}"></label>
        <div class="muted sg-tz">Times are ${esc(tzTxt())} (this device). Regroup starts <b id="sgRegAt_${r}">${isNaN(regAt) ? '?' : whenTxt(regAt.toISOString())}</b>: everyone to Giran, then teleport near the ${kind === 'castle' ? 'castle' : 'fortress'}, regroup at the safe point outside, wait for the start.</div></div>
      <h4>Parties</h4>
      <div class="scroll"><table class="l2 sg-ptab"><thead><tr><th></th><th>Party</th><th>Online</th><th>Levels</th><th>Roles</th><th>In clan</th><th>CC right</th></tr></thead><tbody>${P.map(prow).join('')}</tbody></table></div>
      <div class="sg-row">
        <label>Command Channel leader (main leader) <select id="sgCc_${r}" data-sgf="cc">${ps.map(x => { const p = P.find(y => y.leader === x) || {}; return `<option value="${esc(x)}" ${x === d.cc ? 'selected' : ''}>${esc(x)}${p.ccRight ? ' ✓ ' + esc(p.ccRight) : ' (no CC right yet)'}</option>`; }).join('')}</select></label>
        ${kind === 'fort' ? `<label>Flag carrier (L2J: must be the clan leader) <select id="sgFc_${r}" data-sgf="flagCarrier">${opt(d.flagCarrier, m => !/bishop|saint|healer|elder|oracle|cleric/i.test(m.role))}</select></label>
        <label>Backup carrier <select id="sgFb_${r}" data-sgf="flagBackup">${opt(d.flagBackup, m => !/bishop|saint|healer|elder|oracle|cleric/i.test(m.role))}</select></label>`
        : `<label>Engraves the artifact (must be the clan leader) <select id="sgEn_${r}" data-sgf="engraver">${opt(d.engraver)}</select></label>`}</div>
      ${cmRows ? `<h4>Who kills which commander</h4><div class="sg-assigns">${cmRows}</div>` : ''}
      <h4>Regroup point outside</h4>
      <div class="sg-row"><span>${d.staging ? `${coords(d.staging)}${d.staging.custom ? ' <span class="fit next">set by you</span>' : ' <span class="muted">(default: safe spot between the landing and the walls)</span>'}` : '<span class="muted">none — the leader uses a safe spot near the landing</span>'}</span>
        <button data-sg="pickstaging" class="${S.stagingPick ? 'on' : ''}">${S.stagingPick ? 'Tap the close-up map…' : 'Set on the map'}</button>${d.staging && d.staging.custom ? '<button data-sg="resetstaging">Default</button>' : ''}</div>
      <label>Notes <textarea id="sgNo_${r}" data-sgf="notes" rows="2">${esc(d.notes)}</textarea></label>
      <div class="sg-btns"><button data-sg="save" class="go">${d.id ? 'Save changes' : 'Save plan'}</button>${d.id ? '<button data-sg="newplan">New plan</button>' : ''}
        <span class="muted">Saved to Scripts/data/siege_plans.json. The main leader (${esc(d.cc || '?')}) starts it by himself at the regroup time — or press "Start now" below.</span></div></div>`;
  }
  /** Warnings for the current draft (re-drawn on every change, without touching the form). */
  function warnHtml(kind, t) {
    const d = S.draft; if (!d || !t) return '';
    const c = S.data.clan || {}, need = minFor(kind), w = [], mem = chosenMembers(), P = S.data.parties || [];
    if (!d.parties.size) w.push(['bad', 'choose at least one party']);
    if ((c.level || 0) < need) w.push(['bad', `clan level ${need} needed to register for a ${kind === 'castle' ? 'castle' : 'fortress'} siege — ${c.name || 'the clan'} is level ${c.level || 0}`]);
    const notClan = mem.filter(m => !c.name || m.clan !== c.name);
    if (notClan.length) w.push(['warn', `${notClan.length} of ${mem.length} chosen characters are not in clan ${c.name || '?'} — only members of a registered clan can hurt the ${kind === 'castle' ? 'castle' : 'fortress'} NPCs (${notClan.slice(0, 8).map(m => m.name).join(', ')}${notClan.length > 8 ? ' …' : ''})`]);
    const off = mem.filter(m => !m.online); if (off.length) w.push(['warn', `offline now: ${off.map(m => m.name).join(', ')}`]);
    const ccp = P.find(p => p.leader === d.cc); if (d.parties.size > 1 && ccp && !ccp.ccRight) w.push(['warn', `${d.cc} may not open a Command Channel (clan leader of a level-5 clan, Strategy Guide 8871 or Clan Imperium) — the parties still fight together, without one channel chat/loot`]);
    if (kind === 'fort' && !d.flagCarrier) w.push(['warn', 'no flag carrier chosen']);
    if (kind === 'fort' && d.flagCarrier && d.flagCarrier !== c.leader) w.push(['warn', `in L2J High Five only the clan leader (${c.leader}) can raise the flag (Flag Display, a 3-minute cast) — ${d.flagCarrier} may not be allowed on L2Toggle (untested); add party ${c.leader} and make him the carrier`]);
    if (kind === 'fort' && d.flagCarrier === c.leader) w.push(['ok', `flag: the clan leader ${c.leader} carries it; the flag slows him to 20 % — every party escorts him to the flag pole, the 3-minute cast must not be interrupted`]);
    if (kind === 'castle' && d.engraver && d.engraver !== c.leader) w.push(['bad', `only the clan leader (${c.leader}) can engrave the Holy Artifact`]);
    const at = new Date(d.siegeAt).getTime();
    if (isFinite(at) && at < Date.now()) w.push(['warn', 'the siege time is in the past — the leader would start at once']);
    const lows = P.filter(p => d.parties.has(p.leader) && p.max && t.commanders && t.commanders[0] && t.commanders[0].level && p.max < t.commanders[0].level - 10);
    if (lows.length) w.push(['warn', `party ${lows.map(p => p.leader).join(', ')}: far below the commanders' level (${t.commanders[0].level})`]);
    const heal = P.filter(p => d.parties.has(p.leader) && !p.healers); if (heal.length) w.push(['warn', `no healer in party ${heal.map(p => p.leader).join(', ')}`]);
    const people = mem.length;
    return `<div class="sg-warn"><b>${d.parties.size}</b> parties · <b>${people}</b> characters${w.length ? '' : ' · <span class="ok">no problems found</span>'}${w.map(([k, x]) => `<div class="${k}">${GI(UI.warn, 'sm')} ${esc(x)}</div>`).join('')}</div>`;
  }
  function plansHtml(kind) {
    const L = (S.data.plans || []).filter(p => p.kind === kind).sort((a, b) => Date.parse(a.siegeAt) - Date.parse(b.siegeAt));
    if (!L.length) return '<div class="muted">No siege planned yet. Choose a target on the map, fill in the plan above and save it.</div>';
    return `<div class="sg-plans">${L.map(p => {
      const at = Date.parse(p.siegeAt), reg = at - (p.regroupMin || 30) * 60000, st = p.status || 'planned';
      const live = S.live && S.live.running && S.live.planId === p.id;
      return `<div class="sg-plan ${st}"><div class="sg-ph"><b>${esc(p.targetName)}</b> ${chip(st === 'planned' ? (at > Date.now() ? 'next' : 'hard') : st === 'done' ? 'good' : 'low', live ? 'LIVE' : st)}
        <span>${whenTxt(p.siegeAt)}</span> <span class="muted">${st === 'planned' ? untilTxt(at - Date.now()) : ''}</span>
        ${p.run ? `<span class="muted">bots: ${esc(p.run.status || '')}${p.run.result ? ' — ' + esc(p.run.result) : ''}${p.run.at ? ' (' + whenTxt(p.run.at) + ')' : ''}</span>` : ''}</div>
        <div class="muted">regroup ${whenTxt(new Date(reg).toISOString())} (${p.regroupMin} min before) · parties ${p.parties.map(x => `<b style="color:${pcol(x)}">${esc(x)}</b>`).join(', ')} · CC ${esc(p.cc)}${p.roles && p.roles.flagCarrier ? ' · flag ' + esc(p.roles.flagCarrier) : ''}${p.roles && p.roles.engraver ? ' · engraver ' + esc(p.roles.engraver) : ''}${p.notes ? ' · ' + esc(p.notes) : ''}</div>
        <div class="sg-btns"><button data-sg="edit" data-id="${esc(p.id)}">Edit</button><button data-sg="start" data-id="${esc(p.id)}">Start now</button>
          ${st === 'planned' ? `<button data-sg="cancel" data-id="${esc(p.id)}">Cancel</button>` : `<button data-sg="replan" data-id="${esc(p.id)}">Plan again</button>`}
          <button data-sg="delete" data-id="${esc(p.id)}">Delete</button>${live ? '<a class="btn" href="#/siege/live">Watch live ›</a>' : ''}</div></div>`;
    }).join('')}</div>`;
  }
  function tableHtml(kind) {
    const L = list(kind), c = S.data.clan || {}, need = minFor(kind);
    if (kind === 'castle') return `<table class="l2"><thead><tr><th>Castle</th><th>Territory</th><th>Fortresses</th><th>Skills</th><th>Lord items</th><th>Owner</th></tr></thead><tbody>${L.map(t => `<tr class="${String(t.id) === String(S.sel.castles) ? 'sel' : ''}" data-sg-pick="castle|${esc(t.id)}"><td><b>${esc(t.name)}</b></td><td>${esc(t.territory || '')}</td>
      <td class="muted">${(t.forts || []).map(f => esc(short((byId('fort', f) || {}).name || f))).join(', ')}</td><td>${(t.skills || []).map(s => `<img class="ic sm" src="${skillIcon(s.id)}" title="${esc(s.name + ': ' + (s.effect || ''))}" alt="">`).join('')}</td>
      <td>${[t.crown, t.circlet].filter(Boolean).map(i => `<img class="ic sm" src="${itemIcon(i.itemId)}" title="${esc(i.name)}" alt="">`).join('')}</td><td class="muted">${esc(((S.data.owners || {})['castle:' + t.id] || {}).clan || '?')}</td></tr>`).join('')}</tbody></table>`;
    return `<table class="l2"><thead><tr><th>Fortress</th><th>Type</th><th>Castle</th><th>Commanders</th><th>Skills</th><th>Owner</th><th>Can register</th></tr></thead><tbody>${L.map(t => `<tr class="${String(t.id) === String(S.sel.forts) ? 'sel' : ''}" data-sg-pick="fort|${esc(t.id)}"><td><b>${esc(t.name)}</b></td>
      <td>${esc(t.type || '?')} <span class="muted">${esc(t.size || '')}</span></td><td>${esc((t.castle && t.castle.name) || '')}</td><td>${(t.commanders || []).length || '?'}</td>
      <td>${(t.skills || []).map(s => `<img class="ic sm" src="${skillIcon(s.id)}" title="${esc(s.name + ': ' + (s.effect || ''))}" alt="">`).join('')}</td><td class="muted">${esc(((S.data.owners || {})['fort:' + t.id] || {}).clan || '?')}</td>
      <td>${(c.level || 0) >= need ? '<span class="ok">yes</span>' : `<span class="bad">clan lvl ${need}</span>`}</td></tr>`).join('')}</tbody></table>`;
  }
  function rulesHtml(kind) {
    const M = kind === 'castle' ? S.data.castleMeta : S.data.fortMeta; if (!M) return '<div class="muted">no data file</div>';
    const r = M.rules || {};
    const kv = Object.entries(r).filter(([k, v]) => k !== 'otherConfig' && v !== null && typeof v !== 'object').map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('');
    const oc = r.otherConfig && typeof r.otherConfig === 'object' ? Object.entries(r.otherConfig).slice(0, 60).map(([k, v]) => `<span>${esc(k)}</span><span>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</span>`).join('') : '';
    return `<div class="sg-kv">${kv}${M.combatFlagItemId ? `<span>Combat Flag item</span><span><img class="ic sm" src="${itemIcon(M.combatFlagItemId)}" alt=""> ${esc(M.combatFlagItemId)}</span>` : ''}</div>
      ${oc ? `<details class="sg-det"><summary>All config values (L2J defaults)</summary><div class="sg-kv">${oc}</div></details>` : ''}
      ${(M.notes || []).length ? `<h4>Notes</h4>${listHtml(M.notes)}` : ''}
      <div class="muted">Full research with sources: docs/plan/sieges_research.md · user guide: docs/plan/sieges_guide.md · data ${esc(M.generated || '')}. <b>L2Toggle may differ from the L2J High Five defaults — nothing here was tested on the server yet.</b></div>`;
  }

  // ------------------------------------------------------------------------------------------------------------------- events
  async function onClick(e) {   // async: confirmOrder / uiConfirm return Promises (UIDIALOG 2026-10-10)
    const pick = e.target.closest('[data-sg-pick]');
    const close = e.target.closest('[data-sg-close]');
    if (close && S.stagingPick && S.draft) {
      const svg = close, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const m = svg.getScreenCTM(); if (m) { const p = pt.matrixTransform(m.inverse()); const t = byId(S.draft.kind, S.draft.targetId);
        S.draft.staging = { x: Math.round(p.x), y: Math.round(p.y), z: t && t.staging ? t.staging.z : (t && t.pos ? t.pos.z : 0), custom: true }; S.stagingPick = false; S.rev++; render(TAB); }
      return;
    }
    if (pick) { e.stopPropagation(); const [k, id] = pick.dataset.sgPick.split('|'); const tab = TAB_OF(k); S.sel[tab] = id; const h = '#/' + tab + '/' + encodeURIComponent(id);
      if (TAB === tab) { history.replaceState(null, '', h); render(tab); const det = $s('sgDetail_' + tab); if (det && window.innerWidth < 860 && det.scrollIntoView) det.scrollIntoView({ block: 'start', behavior: 'smooth' }); } else go(h); return; }
    const b = e.target.closest('[data-sg]'); if (!b) return;
    e.stopPropagation();
    const a = b.dataset.sg, tab = TAB, kind = K(tab), t = byId(kind, S.sel[tab]);
    const plan = (S.data.plans || []).find(p => p.id === b.dataset.id);
    if (a === 'reload') { load(true); return; }
    if (a === 'pickstaging') { S.stagingPick = !S.stagingPick; S.rev++; render(tab); return; }
    if (a === 'resetstaging') { S.draft.staging = t && t.staging ? Object.assign({}, t.staging) : null; S.rev++; render(tab); return; }
    if (a === 'newplan') { newDraft(kind, t); render(tab); return; }
    if (a === 'save') { savePlan(); return; }
    if (a === 'edit' && plan) { S.sel[TAB_OF(plan.kind)] = String(plan.targetId); const tg = byId(plan.kind, plan.targetId); if (tg) { newDraft(plan.kind, tg, plan); } if (TAB_OF(plan.kind) !== TAB) go('#/' + TAB_OF(plan.kind) + '/' + plan.targetId); else render(TAB); const pl = $s('sgPlanner_' + TAB); if (pl && pl.scrollIntoView) pl.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (a === 'start' && plan) { const cmd = '!siege plan ' + plan.id;
      if (await confirmOrder('party:' + plan.cc, cmd, `Siege NOW: ${plan.targetName} with parties ${plan.parties.join(', ')} — regroup in Giran, travel, regroup outside, then attack (ignores the planned time)`)) send('party:' + plan.cc, null, cmd); return; }
    if (a === 'cancel' && plan) { if (await uiConfirm({ title: `Cancel the siege plan for ${plan.targetName}?`, body: 'The plan is kept as cancelled (Re-plan brings it back).', confirmText: 'Cancel the plan', cancelText: 'Keep it' })) postPlan({ action: 'status', id: plan.id, status: 'cancelled' }); return; }
    if (a === 'replan' && plan) { postPlan({ action: 'status', id: plan.id, status: 'planned' }); return; }
    if (a === 'delete' && plan) { if (await uiConfirm({ title: `Delete the siege plan for ${plan.targetName}?`, body: 'The plan is removed.', confirmText: 'Delete plan', danger: true })) postPlan({ action: 'delete', id: plan.id }); return; }
    if (a === 'register' && t) { const L = (S.data.clan && S.data.clan.leader) || 'Dagger1'; const cmd = `!siegereg ${kind} ${short(t.name)}`;
      if (await confirmOrder('char:' + L, cmd, `${L} travels to ${t.name} and registers the clan for its siege (only he can; needs clan level ${minFor(kind)}${kind === 'fort' ? ' and the registration NPC must be there' : ''})`)) send('char:' + L, null, cmd); return; }
  }
  function onInput(e) {
    const el = e.target, d = S.draft; if (!d) return;
    if (el.dataset.sgp) { if (el.checked) d.parties.add(el.dataset.sgp); else d.parties.delete(el.dataset.sgp); autoRoles(); if (e.type === 'change') { S.rev++; render(TAB); } return; }
    if (el.dataset.sga) { d.assign[el.dataset.sga] = el.value; return; }
    if (el.dataset.sgf) { d[el.dataset.sgf] = el.value;
      if (el.dataset.sgf === 'siegeAt' || el.dataset.sgf === 'regroupMin') { const r = $s('sgRegAt_' + S.rev); const at = new Date(new Date(d.siegeAt).getTime() - (+d.regroupMin || 30) * 60000); if (r) r.textContent = isNaN(at) ? '?' : whenTxt(at.toISOString()); }
      patch($s('sgWarn_' + TAB), warnHtml(d.kind, byId(d.kind, d.targetId))); }
  }
  async function postPlan(b) {
    try { const r = await api('/api/sieges', { method: 'POST', body: JSON.stringify(b) }); if (r.error) { $('msg').textContent = 'siege plan: ' + r.error; return null; }
      if (S.data) S.data.plans = r.plans; renderCur(); $('msg').textContent = 'siege plans saved'; return r; } catch (e) { $('msg').textContent = e.message; return null; }
  }
  async function savePlan() {
    const d = S.draft; if (!d) return;
    const at = new Date(d.siegeAt); if (isNaN(at)) { $('msg').textContent = 'set the siege time first'; return; }
    const r = await postPlan({ action: 'save', plan: { id: d.id || undefined, kind: d.kind, targetId: d.targetId, siegeAt: at.toISOString(), regroupMin: +d.regroupMin || 30, staging: d.staging,
      parties: [...d.parties], cc: d.cc, roles: { flagCarrier: d.flagCarrier, flagBackup: d.flagBackup, engraver: d.engraver }, assign: d.assign, notes: d.notes } });
    if (r && r.plan) { d.id = r.plan.id; S.rev++; render(TAB); }
  }

  // ------------------------------------------------------------------------------------------------------------------- live view
  const PHASES = [['regroup', 'Regroup in Giran'], ['travel', 'Travel'], ['staging', 'Regroup outside'], ['waiting', 'Waiting for the start'], ['siege', 'Siege: objectives'], ['flag', 'Flag / artifact'], ['done', 'Done']];
  const phaseIdx = (p) => Math.max(0, PHASES.findIndex(x => x[0] === p || (p === 'engrave' && x[0] === 'flag')));
  function buildLive() { const r = $s('tab-siege'); if (!r || r.dataset.built) return; r.dataset.built = '1'; r.innerHTML = '<div id="sgLiveFull"></div>'; }
  function renderLivePage() { buildLive(); patch($s('sgLiveFull'), liveHtml(false) || `<div class="whead"><h2>Siege — live</h2></div><div class="muted">No siege is running right now. This page shows it as soon as a siege mission starts (the regroup in Giran included).${S.live && S.live.finished ? '' : ''}</div>${S.live && S.live.finished ? liveHtml(false, true) : ''}`); }
  function liveHtml(compact, ended) {
    const L = S.live; if (!L || (!L.running && !ended)) return '';
    const secs = L.startedMs ? Math.max(1, Math.round((Date.parse(L.updatedAt) - L.startedMs) / 1000)) : 0;
    const pi = phaseIdx(L.phase);
    const tl = `<div class="sg-tl">${PHASES.map((p, i) => `<span class="${i < pi ? 'did' : i === pi ? 'now' : ''}">${esc(p[1])}</span>`).join('')}</div>`;
    const startIn = L.siegeAtMs ? L.siegeAtMs - Date.parse(L.updatedAt) : null;
    const timer = startIn != null && startIn > 0 ? `siege starts ${untilTxt(startIn)}` : (L.siegeEndsMs ? `ends in ${mss((L.siegeEndsMs - Date.parse(L.updatedAt)) / 1000)}` : '');
    const objs = (L.objectives || []).filter(o => o.kind !== 'npc');
    const done = objs.filter(o => /dead|open|destroyed|raised|done/.test(o.status)).length;
    const ostat = (o) => o.status === 'dead' || o.status === 'destroyed' ? '<span class="ok">✓ ' + esc(o.status) + '</span>' : o.status === 'alive' ? '<span class="bad">alive</span>' : o.status === 'open' ? '<span class="ok">open</span>' : o.status === 'closed' ? '<span class="warn">closed</span>' : `<span class="muted">${esc(o.status || 'unknown')}</span>`;
    const objRows = objs.map(o => `<div class="rl2-row ${o.focus ? 'focus' : ''}"><span class="nm">${o.focus ? '▶ ' : ''}${esc(o.name)}${o.party ? ` <span class="muted" style="color:${pcol(o.party)}">party ${esc(o.party)}</span>` : ''}</span><span class="g">${o.hp != null ? gaugeN('hp', o.hp) : o.maxHp ? gauge('hp', 100 * (o.curHp || 0) / o.maxHp, fmtN(o.curHp) + ' HP') : ''}</span><span class="tx">${ostat(o)}${o.by ? ` <span class="muted">by ${esc(o.by)}</span>` : ''}</span></div>`).join('');
    const F = L.flag || {};
    const flagBox = L.kind === 'castle'
      ? `<div class="sg-flag ${L.artifact && L.artifact.engraving ? 'on' : ''}"><b>Holy Artifact:</b> ${L.artifact && L.artifact.done ? '<span class="ok">ENGRAVED</span>' : L.artifact && L.artifact.engraving ? `<span class="warn">${esc(L.artifact.engraving)} is engraving…</span>` : '<span class="muted">not yet</span>'} · engraver ${esc(L.engraver || '?')}</div>`
      : `<div class="sg-flag ${F.holder ? 'on' : ''}"><b>Combat Flag:</b> ${F.raised ? '<span class="ok">RAISED — fortress taken</span>' : F.holder ? `held by <b>${esc(F.holder)}</b>${F.holderParty ? ` <span class="muted">(party ${esc(F.holderParty)})</span>` : ''}${F.enemy ? ' <span class="bad">ENEMY</span>' : ''}` : '<span class="muted">nobody has it</span>'}
        · carrier ${esc(L.carrier || '?')}${L.backup ? ' / ' + esc(L.backup) : ''} · command center ${L.commandCenter && L.commandCenter.open ? '<span class="ok">OPEN</span>' : L.commandCenter && L.commandCenter.open === false ? '<span class="warn">closed</span>' : '<span class="muted">?</span>'}</div>`;
    const byParty = {}; (L.party || []).forEach(m => { (byParty[m.party] = byParty[m.party] || []).push(m); });
    const partyHtml = Object.entries(byParty).map(([lead, ms]) => `<div class="sg-pbox" style="border-color:${pcol(lead)}"><div class="sg-pbh"><b style="color:${pcol(lead)}">Party ${esc(lead)}</b> <span class="muted">${ms.filter(m => !m.dead).length}/${ms.length} alive${(L.focus || {})[lead] ? ' · on ' + esc(L.focus[lead].name) : ''}${(L.partyTask || {})[lead] ? ' · ' + esc(L.partyTask[lead]) : ''}</span></div>
      ${ms.map(m => `<div class="sg-mem ${m.dead ? 'dead' : ''}"><span class="nm">${m.dead ? '✝ ' : ''}${esc(m.name)} <span class="muted">${esc(m.role || '')}</span>${F.holder === m.name ? ' ⚑' : ''}</span>${m.dead ? gauge('hp', 0, 'dead') : gaugeN('hp', m.hp)}${gaugeN('mp', m.mp)}</div>`).join('')}</div>`).join('');
    const en = (L.enemies || []);
    const enClans = {}; en.forEach(e => { const k = e.clan || '(no clan)'; enClans[k] = (enClans[k] || 0) + 1; });
    const enemyHtml = en.length ? `<div>${Object.entries(enClans).map(([k, n]) => `<span class="chip bad">${esc(k)} ×${n}</span>`).join(' ')}</div><div class="muted">${en.slice(0, 30).map(e => esc(e.name) + (e.dead ? ' ✝' : '')).join(', ')}</div>` : '<div class="muted">no other players seen</div>';
    const ev = (L.events || []).slice(-14).reverse().map(e => `<div><span class="t">${esc(String(e.t || ''))}</span>${esc(e.msg)}</div>`).join('');
    const t = byId(L.kind, L.id) || { name: L.name, pos: L.center, commanders: [], npcs: [] };
    const title = `${ended ? 'Last siege' : 'LIVE'} ${L.kind === 'castle' ? 'castle' : 'fortress'} siege: ${esc(L.name || '?')}`;
    if (compact) return `<div class="rlive"><div class="whead"><h2>${title}</h2><a class="btn" href="#/siege/live">Watch ›</a></div>${tl}<div>${flagBox}</div><div class="muted">${done}/${objs.length} objectives · ${(L.party || []).filter(m => !m.dead).length}/${(L.party || []).length} alive${timer ? ' · ' + esc(timer) : ''}</div></div>`;
    return `<div class="rlive rl2 sg-live"><div class="whead"><h2>${title}</h2><span class="muted">${secs ? '⏱ ' + mss(secs) + ' · ' : ''}${esc(L.step || '')}${timer ? ' · ' + esc(timer) : ''} · ${L.ageSec}s ago${L.result ? ' · RESULT: ' + esc(L.result) : ''}</span></div>
      ${tl}${flagBox}
      <div class="rl2-grid"><div class="rl2-map">${closeupSvg(L.kind, t, L, { staging: L.staging })}<div class="sg-leg muted"><i class="sgk cmd"></i>objective <i class="sgk npc2"></i>other fortress NPC <i class="sgk en"></i>enemy player <i class="sgk flag"></i>flag · our characters in their party colour</div></div>
        <div class="rl2-side"><h3>Objectives <span class="muted">${done}/${objs.length} done</span></h3>${objRows || '<div class="muted">none known yet</div>'}
          <h3>Enemies seen</h3>${enemyHtml}</div></div>
      <h3>Parties</h3><div class="sg-parties">${partyHtml || '<div class="muted">—</div>'}</div>
      <div class="rl2-logs"><div><h3>Events</h3><div class="rlev">${ev}</div></div></div></div>`;
  }
  function ensureBanner() {
    if ($s('siegeBanner')) return;
    const lb = $('liveBanner'); if (!lb || !lb.parentNode) return;
    const d = document.createElement('div'); d.id = 'siegeBanner'; lb.parentNode.insertBefore(d, lb.nextSibling);
  }
  function bannerHtml() {
    const L = S.live; if (!L || !L.running || TAB === 'siege') return '';
    const objs = (L.objectives || []).filter(o => o.kind !== 'npc'), done = objs.filter(o => /dead|open|destroyed|raised|done/.test(o.status)).length;
    const up = (L.party || []).filter(m => !m.dead).length, secs = L.startedMs ? Math.max(1, Math.round((Date.parse(L.updatedAt) - L.startedMs) / 1000)) : 0;
    const ph = (PHASES[phaseIdx(L.phase)] || [])[1] || L.phase || '';
    return `<a class="livebanner" href="#/siege/live"><span class="pulse"></span><b>LIVE siege: ${esc(L.name || '?')}</b><span>${esc(ph)}</span><span>${done}/${objs.length} objectives</span>${L.flag && L.flag.holder ? `<span>⚑ ${esc(L.flag.holder)}</span>` : ''}<span>${up}/${(L.party || []).length} alive</span>${secs ? `<span>⏱ ${mss(secs)}</span>` : ''}<span class="go">Watch ›</span></a>`;
  }
  async function pollLive(force) {
    if (document.hidden && !force) return;
    S.tick++;
    const on = TAB === 'siege' || TAB === 'forts' || TAB === 'castles';
    if (!force && !on && !(S.live && S.live.running) && S.tick % 4) return;       // otherwise every 8 s: enough to raise the banner
    try { S.live = await api('/api/siegelive'); } catch (e) { return; }
    ensureBanner();
    patch($s('siegeBanner'), bannerHtml());
    if (TAB === 'siege') renderLivePage();
    else if ((TAB === 'forts' || TAB === 'castles') && S.built[TAB]) patch($s('sgLive_' + TAB), S.live && S.live.running ? liveHtml(true) : '');
  }
  setInterval(pollLive, 2000);
  setInterval(() => { if ((TAB === 'forts' || TAB === 'castles') && !document.hidden) load(false); }, 15000);
  // countdowns in the plan list
  setInterval(() => { if ((TAB === 'forts' || TAB === 'castles') && S.built[TAB] && S.data && !document.hidden) patch($s('sgPlans_' + TAB), plansHtml(K(TAB))); }, 30000);

  window.Sieges = { show, arg, state: S, reload: () => load(true) };
  // a deep link opened before this file loaded (index.html's route() ran first)
  try { const k = location.hash.replace(/^#\/?/, '').split('/'); if (/^(forts|castles|siege)$/.test(k[0])) { arg(k[0], k[1] ? decodeURIComponent(k[1]) : ''); show(k[0]); } } catch (e) { }
})();
