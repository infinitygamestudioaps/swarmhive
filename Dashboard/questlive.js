// QUEST LIVE (user 2026-10-12: "Under /quests/40 I want to see live progress for EACH character doing the quest, what step they are on, where
// they are going etc."). Loaded on first use by Dashboard/questpage.js (liveHook). Two views:
//   #/quests/<id>  -> #qpLive (top of the detail page): one card per character running the quest (+ the ones that ended it in the last 6 h,
//                     greyed): class icon, level, online, mode, repeat N of M, step N/M + step text, item / kill progress bars, what it is doing
//                     now (task + intent), destination + distance, last 5 quest events + recent moves, and a map (minitile pieces) with every
//                     character, its destination line, the quest NPCs and the hunting spots.
//   #/quests       -> #qpLiveAll (top of the list): every character running any quest, linked to its quest.
// One call per refresh: GET /api/quests/live[?id=] (Dashboard/questlive_api.js), every 3 s while the page is visible (paused when hidden).
// Uses index.html globals when present: api, esc, classIcon, patch, MT. No browser dialogs anywhere (read-only view).
(function () {
  'use strict';
  const L = { id: undefined, data: null, timer: 0, busy: false, focus: 'all', err: '', loadedAt: 0 };
  const $id = (i) => document.getElementById(i);
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const put = (el, html) => { if (!el) return; if (typeof patch === 'function') patch(el, html); else if (el.innerHTML !== html) el.innerHTML = html; };
  const num = (n) => (Number(n) || 0).toLocaleString('en-US');
  const iconUrl = (p) => p ? '/icons/' + p + '.png' : '/icons/icon/etc_question_mark_i00.png';
  const img = (p, t) => `<img class="qp-ic" src="${iconUrl(p)}" alt="" title="${h(t || '')}" loading="lazy" onerror="this.src='/icons/icon/etc_question_mark_i00.png'">`;
  const cls = (c) => c.classId != null && typeof classIcon === 'function' ? classIcon({ classId: c.classId, name: c.name }, 'sm') : '';
  const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(t || '')) / 1000)); if (!isFinite(s)) return ''; return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : (Math.round(s / 360) / 10) + ' h'; };
  const secTxt = (s) => s == null ? '' : s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : (Math.round(s / 360) / 10) + ' h';
  const hm = (t) => { const d = new Date(t || ''); return isFinite(d) ? d.toTimeString().slice(0, 8) : ''; };
  const dist = (n) => n == null ? '' : n >= 10000 ? (Math.round(n / 100) / 10) + 'k' : num(n);
  const ACT = { walk: 'walking', move: 'walking', travel: 'travelling', town: 'town teleport', gk: 'gatekeeper', gatekeeper: 'gatekeeper', attack: 'fighting', hunt: 'hunting',
    'quest-hunt': 'hunting', talk: 'talking', npc: 'talking', escape: 'escaping', rest: 'resting', follow: 'following', 'gather team': 'gathering the team' };

  async function load() {
    if (L.busy || L.id === undefined || typeof api !== 'function') return;
    L.busy = true;
    const want = L.id;
    try { const d = await api('/api/quests/live' + (want ? '?id=' + encodeURIComponent(want) : '')); if (want === L.id) { L.data = d; L.err = d && d.ok ? '' : ((d && d.error) || 'live view failed'); L.loadedAt = Date.now(); } }
    catch (e) { L.err = e.message; }
    finally { L.busy = false; }
    paint();
  }
  /** id = quest id (detail page) | null (list page) | false (the quest page closed) */
  function show(id) {
    if (id === false) { clearInterval(L.timer); L.timer = 0; L.id = undefined; return; }
    const nid = id ? String(id) : null;
    if (nid !== L.id) { L.data = null; L.err = ''; L.focus = 'all'; }
    L.id = nid;
    paint(); load();
    if (!L.timer) L.timer = setInterval(() => { if (!document.hidden && L.id !== undefined) load(); }, 3000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && L.id !== undefined) load(); });
  function paint() { if (L.id === undefined) return; if (L.id) paintDetail(); else paintAll(); }

  // =========================================================================================== #/quests: every character on a quest
  function paintAll() {
    const el = $id('qpLiveAll'); if (!el) return;
    const C = (L.data && L.data.ok && L.data.chars) || [];
    if (!C.length) { el.hidden = true; put(el, ''); return; }
    el.hidden = false;
    const run = C.filter(c => c.running).length;
    put(el, `<h3 class="ql-h3"><span class="ql-pulse"></span>Live quests <small class="muted">${run} running${C.length > run ? ` · ${C.length - run} ended in the last 6 h` : ''}</small></h3>
      <div class="ql-rows">${C.map(c => {
        const prog = progTxt(c);
        return `<a class="ql-row${c.running ? '' : ' ended'}${c.online ? '' : ' off'}" href="#/quests/${c.quest.id}">
          <span class="ql-who">${cls(c)}<b>${h(c.name)}</b> <small>${c.level || ''}</small></span>
          <span class="ql-q"><b>#${c.quest.id} ${h(c.quest.name)}</b> <span class="qp-b ${c.running ? 'qp-b-run' : statusCls(c.status)}">${h(c.running ? c.phaseText : c.status)}</span>${stepBadge(c)}${prog ? ` <small>${h(prog)}</small>` : ''}</span>
          <span class="ql-dn muted">${c.running ? h(c.doing && c.doing.detail ? (ACT[c.doing.action] || c.doing.action) + ': ' + c.doing.detail : c.step || c.stepText) : h(c.msg || ('ended ' + ago(c.endedAt) + ' ago'))}${c.online ? '' : ' · offline'}</span></a>`;
      }).join('')}</div>`);
  }
  function statusCls(s) { return s === 'done' ? 'qp-b-ok' : s === 'failed' || s === 'cannot' ? 'qp-b-warn' : 'qp-b-end'; }
  function stepBadge(c) { return c.stepNo != null ? ` <span class="qp-b ql-sb">${c.stepNo === 0 ? 'accept' : 'step ' + c.stepNo + (c.stepTotal ? '/' + c.stepTotal : '')}</span>` : ''; }
  function progTxt(c) {
    const p = [];
    (c.need || []).forEach(n => p.push(`${n.have}/${n.n}`));
    if (c.kills) p.push(`${c.kills.have}${c.kills.n ? '/' + c.kills.n : ''} kills`);
    return p.join(' · ');
  }
  function repTxt(c) {
    if (!c.repeatable && !(c.repeat > 1) && !c.farm) return c.runs ? 'done once' : '';
    return c.repeat === 0 ? `run ${c.runs + (c.running ? 1 : 0)} (forever)` : `run ${Math.min(c.repeat, c.runs + (c.running ? 1 : 0))} of ${c.repeat}`;
  }
  function modeTxt(c) {
    if (c.mode === 'member') return `party member${c.leader ? ' of ' + c.leader : ''}`;
    if (c.mode === 'party') return 'party leader';
    return 'solo';
  }

  // =========================================================================================== #/quests/<id>: one card per character + map
  function bar(have, n, label, icon) {
    const pct = n > 0 ? Math.max(0, Math.min(100, Math.round(have / n * 100))) : 0;
    return `<div class="ql-bar${n > 0 && have >= n ? ' full' : ''}" title="${h(label)} ${have}${n ? '/' + n : ''}"><span class="ql-bl">${icon || ''}${h(label)}</span><span class="ql-bv">${num(have)}${n ? ' / ' + num(n) : ''}</span>${n > 0 ? `<i style="width:${pct}%"></i>` : ''}</div>`;
  }
  function card(c) {
    const D = c.doing || {}, dest = c.dest, rep = repTxt(c);
    const hdr = `<div class="ql-hd">${cls(c)}<b>${h(c.name)}</b> <small>${c.level || '?'} ${h(c.cls || '')}</small>
      ${c.online ? '<span class="qp-b qp-b-ok">online</span>' : `<span class="qp-b qp-b-no" title="status file ${secTxt(c.ageSec)} old">offline${c.ageSec != null ? ' ' + secTxt(c.ageSec) : ''}</span>`}
      <span class="qp-b">${h(modeTxt(c))}</span>${c.farm ? '<span class="qp-b qp-b-repeatable">farm</span>' : ''}${rep ? `<span class="qp-b ql-rep">${h(rep)}</span>` : ''}</div>`;
    if (!c.running) {
      return `<div class="ql-card ended">${hdr}<div class="ql-st"><span class="qp-b ${statusCls(c.status)}">${h(c.status)}</span> <small class="muted">${c.endedAt ? ago(c.endedAt) + ' ago' : ''}${c.otherActive ? ` · now on <a href="#/quests/${c.otherActive.id}">#${c.otherActive.id} ${h(c.otherActive.name)}</a>` : ''}</small></div>
        ${c.msg ? `<div class="ql-msg">${h(c.msg)}</div>` : ''}${evHtml(c)}</div>`;
    }
    const bars = (c.need || []).map(n => bar(n.have, n.n, n.name, img(n.icon, n.name))).join('') + (c.kills ? bar(c.kills.have, c.kills.n, 'kills') : '');
    const nowTxt = D.detail || D.action ? `<b>${h(ACT[D.action] || D.action || '')}</b>${D.detail ? ': ' + h(D.detail) : ''}${D.dist != null ? ` · ${dist(D.dist)} away` : ''}` : '';
    const task = D.task && !/^quest /.test(D.task) ? `<div class="ql-task muted">task: ${h(D.task)}</div>` : '';
    return `<div class="ql-card${c.online ? '' : ' off'}${c.dead || D.dead ? ' dead' : ''}">${hdr}
      <div class="ql-step"><span class="ql-no">${c.stepNo === 0 ? 'Accept' : 'Step ' + c.stepNo + (c.stepTotal ? '<small>/' + c.stepTotal + '</small>' : '')}</span><span>${h(c.stepText || '')}</span></div>
      <div class="ql-st"><span class="qp-b qp-b-run">${h(c.phaseText)}</span> ${h(c.step || '')}${c.phaseSince ? ` <small class="muted">· for ${ago(c.phaseSince)}</small>` : ''}${c.fails ? ` <span class="qp-b qp-b-warn">${c.fails} fail${c.fails === 1 ? '' : 's'}</span>` : ''}</div>
      ${bars ? `<div class="ql-bars">${bars}</div>` : ''}
      ${nowTxt ? `<div class="ql-now"><span class="ql-k">Now</span><span>${nowTxt}${D.combat ? ' <span class="qp-b qp-b-warn">in combat</span>' : ''}${D.route ? ` <small class="muted">· waypoint ${D.route.i + 1}/${D.route.n}${D.route.stuck ? ' (stuck)' : ''}</small>` : ''}</span></div>` : ''}${task}
      ${dest ? `<div class="ql-now"><span class="ql-k">Going to</span><span><b>${h(dest.name || dest.kind)}</b>${dest.dist != null ? ` · ${dist(dest.dist)} away` : ''}</span></div>` : ''}
      ${c.hp != null ? `<div class="ql-hpmp"><i class="hp" style="width:${Math.max(0, Math.min(100, c.hp))}%"></i><i class="mp" style="width:${Math.max(0, Math.min(100, c.mp || 0))}%"></i></div>` : ''}
      ${c.msg || c.lastMsg ? `<div class="ql-msg">${h(c.msg || ('last: ' + c.lastMsg))}</div>` : ''}
      ${evHtml(c)}</div>`;
  }
  function evHtml(c) {
    const E = c.events || [], M = c.moves || [];
    if (!E.length && !M.length) return '';
    return `<div class="ql-ev">${E.length ? `<div class="ql-k">Last quest events</div><ul>${E.map(e => `<li><time>${hm(e.at)}</time> ${h(e.msg)}</li>`).join('')}</ul>` : ''}
      ${M.length ? `<details class="ql-mv"><summary class="ql-k">Recent moves (${M.length})</summary><ul>${M.map(e => `<li><time>${hm(e.at)}</time> <b>${h(ACT[e.action] || e.action)}</b> ${h(e.detail)}${e.count > 1 ? ` <small>×${e.count}</small>` : ''}${e.result ? ` <span class="qp-b ${e.result === 'OK' ? 'qp-b-ok' : 'qp-b-no'}">${h(e.result)}</span>${e.resultDetail ? ` <small class="muted">${h(e.resultDetail)}</small>` : ''}` : ''}</li>`).join('')}</ul></details>` : ''}</div>`;
  }
  function paintDetail() {
    const el = $id('qpLive'); if (!el) return;
    const d = L.data;
    if (!d) { put(el, '<h3 class="ql-h3">Live</h3><div class="muted">loading…</div>'); return; }
    if (!d.ok) { put(el, `<h3 class="ql-h3">Live</h3><div class="qp-msg bad">${h(L.err || d.error || 'failed')}</div>`); return; }
    const C = d.chars || [], run = C.filter(c => c.running);
    const head = `<h3 class="ql-h3">${run.length ? '<span class="ql-pulse"></span>' : ''}Live <small class="muted">${run.length} running${C.length > run.length ? ` · ${C.length - run.length} ended in the last 6 h` : ''} · updated ${hm(d.at)}</small></h3>`;
    if (!C.length) { put(el, head + '<div class="muted">Nobody is doing this quest right now. Start it for a character under “Your characters” below.</div>'); return; }
    put(el, head + `<div class="ql-cards">${C.map(card).join('')}</div>
      <div class="ql-mapbar" id="qlMapBtns">${mapButtons(C)}</div><div class="qp-map ql-map" id="qlMap">${mapSvg(d)}</div>
      <div class="muted qp-legend"><span><i class="qp-dot" style="background:#fff"></i>character</span><span><i class="qp-dot" style="background:#ffd24a"></i>its destination</span><span><i class="qp-dot" style="background:#f0c040"></i>start NPC</span><span><i class="qp-dot" style="background:#5aa9ff"></i>quest NPC</span><span><i class="qp-dot" style="background:#ff4d4d"></i>monsters</span></div>`);
  }
  function mapButtons(C) {
    const withPos = C.filter(c => c.x != null);
    if (withPos.length < 2) return '';
    return ['all'].concat(withPos.map(c => c.name)).map(k => `<button type="button" class="${L.focus === k ? 'on' : ''}" data-ql="focus" data-f="${h(k)}">${k === 'all' ? 'everyone' : h(k)}</button>`).join('');
  }
  function mapSvg(d) {
    const C = (d.chars || []).filter(c => c.x != null && c.y != null), Q = d.quest || {}, npcs = Q.npcs || [], hunts = Q.hunts || [];
    const run = C.filter(c => c.running);
    let pts = [];
    const pick = L.focus !== 'all' ? C.filter(c => c.name === L.focus) : (run.length ? run : C);
    pick.forEach(c => { pts.push({ x: c.x, y: c.y }); if (c.dest && c.dest.x != null && c.dest.dist < 60000) pts.push({ x: c.dest.x, y: c.dest.y }); });
    if (!pts.length) pts = npcs.map(n => ({ x: n.x, y: n.y })).concat(hunts.slice(0, 6));
    if (!pts.length) return '<div class="muted ql-nomap">No positions yet.</div>';
    const span = (P) => { const xs = P.map(p => p.x), ys = P.map(p => p.y); return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); };
    if (span(pts) > 80000) { const c0 = pts[0]; pts = pts.filter(p => Math.hypot(p.x - c0.x, p.y - c0.y) < 40000); }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const R = Math.min(40000, Math.max(2500, span(pts) / 2 * 1.3 + 1500)), W = 2 * R, x0 = cx - R, y0 = cy - R, u = W / 520, T = typeof MT === 'number' ? MT : 8192;
    const inV = (x, y) => x >= x0 && x <= x0 + W && y >= y0 && y <= y0 + W;
    let s = '';
    for (let gx = Math.floor(x0 / T); gx * T < x0 + W; gx++) for (let gy = Math.floor(y0 / T); gy * T < y0 + W; gy++) {
      const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, c = gx - Math.floor(gx / 4) * 4, r = gy - Math.floor(gy / 4) * 4;
      s += `<image href="/minitile/${RX}_${RY}_${c}_${r}.jpg" x="${gx * T}" y="${gy * T}" width="${T}" height="${T}" preserveAspectRatio="none"/>`;
    }
    const label = (x, y, t, size, fill) => `<text x="${Math.round(x)}" y="${Math.round(y)}" font-size="${Math.round((size || 10) * u)}" fill="${fill || '#fff'}" paint-order="stroke" stroke="#000" stroke-width="${Math.round(3 * u)}" stroke-linejoin="round" pointer-events="none">${h(t)}</text>`;
    hunts.forEach(p => { if (inV(p.x, p.y)) s += `<circle cx="${p.x}" cy="${p.y}" r="${Math.round(Math.min(12, 3 + Math.sqrt(p.n || 1) * 1.4) * u)}" fill="#ff4d4d" fill-opacity="0.5" stroke="#000" stroke-width="${Math.round(u)}"><title>${h(p.name)} ×${p.n}</title></circle>`; });
    npcs.forEach(n => { if (!inV(n.x, n.y)) return; s += `<circle cx="${n.x}" cy="${n.y}" r="${Math.round((n.start ? 6 : 5) * u)}" fill="${n.start ? '#f0c040' : '#5aa9ff'}" stroke="#000" stroke-width="${Math.round(u)}"><title>${h(n.name)}${n.title ? ' (' + h(n.title) + ')' : ''}</title></circle>` + label(n.x + 7 * u, n.y + 4 * u, n.name, 9, n.start ? '#f0c040' : '#9cc8ff'); });
    C.forEach(c => {
      const dim = !c.running || (L.focus !== 'all' && L.focus !== c.name);
      if (c.running && c.dest && c.dest.x != null) {
        s += `<line x1="${c.x}" y1="${c.y}" x2="${c.dest.x}" y2="${c.dest.y}" stroke="#ffd24a" stroke-width="${Math.round(2 * u)}" stroke-dasharray="${Math.round(8 * u)} ${Math.round(5 * u)}" opacity="${dim ? 0.35 : 0.9}"/>`;
        if (inV(c.dest.x, c.dest.y)) s += `<rect x="${c.dest.x - 5 * u}" y="${c.dest.y - 5 * u}" width="${10 * u}" height="${10 * u}" transform="rotate(45 ${c.dest.x} ${c.dest.y})" fill="#ffd24a" stroke="#000" stroke-width="${Math.round(u)}" opacity="${dim ? 0.4 : 1}"><title>${h(c.name)} → ${h(c.dest.name || '')}</title></rect>`;
      }
      if (!inV(c.x, c.y)) return;
      s += `<circle cx="${c.x}" cy="${c.y}" r="${Math.round(5 * u)}" fill="${c.running ? '#fff' : '#888'}" stroke="${c.online ? '#3ddc84' : '#000'}" stroke-width="${Math.round(2 * u)}" opacity="${dim ? 0.5 : 1}"><title>${h(c.name)}</title></circle>` + label(c.x + 7 * u, c.y - 5 * u, c.name, 10, c.running ? '#fff' : '#aaa');
    });
    return `<svg viewBox="${Math.round(x0)} ${Math.round(y0)} ${Math.round(W)} ${Math.round(W)}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="live quest map">${s}</svg>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-ql="focus"]'); if (!b) return;
    L.focus = b.dataset.f || 'all'; paint();
  });
  window.QuestLive = { show, paint, load, _L: L };
})();
