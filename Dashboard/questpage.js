// QUESTS page #/quests[/<id>] (user 2026-10-12: "a complete quest overview with rewards and all steps ... a page with all quests with the correct
// icons, descriptions, locations of all NPCs, enemies, droppers, hunting zones, rewards and requirements" + the adena quest farm).
// Hook: index.html route() -> QuestPage.route(kind, arg). Data: GET /api/quests (list), /api/quests/detail?id=, /api/quests/chars,
// GET/POST /api/quests/farm (Dashboard/questpage_api.js). Orders go through the command center's path: POST /api/command
// { cmd, targets: ['char:<Name>'] } — "!quest <id> [repeat N] [solo|party] <Name>", "!quest stop <Name>", "!quest status <Name>"
// (swarm.js quest engine). Every question uses Dashboard/uidialog.js (uiConfirm / uiAlert) — never alert / confirm / prompt.
// Uses index.html globals: esc, api, classIcon, patch, stopChar, TAB, MT (map piece size).
(function () {
  'use strict';
  const SEC = 'tab-questpage';
  const QP = { open: false, rows: null, meta: null, chars: [], charsAt: 0, farm: null, sel: null, det: {}, shown: 120, timer: 0, msgT: 0, mapFocus: 'auto', busy: false,
    f: { q: '', lvl: '', char: '', type: '', race: '', adena: false, sort: 'level' } };
  const $id = (i) => document.getElementById(i);
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const iconUrl = (p) => p ? '/icons/' + p + '.png' : '/icons/icon/etc_question_mark_i00.png';
  const img = (p, t, cls) => `<img class="${cls || 'qp-ic'}" src="${iconUrl(p)}" alt="" title="${h(t || '')}" loading="lazy" onerror="this.src='/icons/icon/etc_question_mark_i00.png'">`;
  const fmt = (n) => { n = Number(n) || 0; return n >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : n >= 1e4 ? Math.round(n / 1000) + 'k' : String(Math.round(n)); };
  const num = (n) => (Number(n) || 0).toLocaleString('en-US');
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('swarm.qp.' + k)); localStorage.setItem('swarm.qp.' + k, JSON.stringify(v)); } catch (e) { return null; } return null; };
  const put = (el, html) => { if (!el) return; if (typeof patch === 'function') patch(el, html); else el.innerHTML = html; };
  const RACES = ['HUMAN', 'ELF', 'DARK_ELF', 'ORC', 'DWARF', 'KAMAEL'];
  const TYPE_TXT = { 'one-time': ['once', 'One-time quest'], repeatable: ['repeat', 'Repeatable: can be taken again and again'], daily: ['daily', 'Daily: once a day'], unknown: ['?', 'Type not found in the script'] };
  const PHASE_TXT = { start: 'taking the quest', travel: 'travelling', talk: 'talking', hunt: 'hunting', spawn: 'spawning the quest monster', turnin: 'handing in', wait: 'waiting', done: 'done', failed: 'failed', stopped: 'stopped' };
  const TRIG_TXT = { talk: 'Talk to', event: 'Click in the dialog of', kill: 'Kill', attack: 'Attack', skill: 'Use a skill on', spawn: 'When it spawns:', firstTalk: 'Talk to', item: 'Use the item', timer: 'Timer', zone: 'Enter the zone', other: 'Other' };

  // =========================================================================================== data
  async function loadList() {
    if (QP.rows) return;
    try { const d = await api('/api/quests'); if (d && d.ok) { QP.rows = d.rows; QP.meta = d.meta; } else flash((d && d.error) || 'quest list failed', true); }
    catch (e) { flash('quest list failed: ' + e.message, true); }
  }
  async function loadChars(force) {
    if (!force && Date.now() - QP.charsAt < 12000) return;
    try { const d = await api('/api/quests/chars'); if (d && d.ok) { QP.chars = d.chars || []; QP.charsAt = Date.now(); } } catch (e) { }
  }
  async function loadFarm() { try { const d = await api('/api/quests/farm'); if (d && d.ok) QP.farm = d; } catch (e) { } }
  async function loadDetail(id, force) {
    if (!force && QP.det[id] && Date.now() - QP.det[id].at < 15000) return QP.det[id].d;
    try { const d = await api('/api/quests/detail?id=' + encodeURIComponent(id)); QP.det[id] = { at: Date.now(), d }; return d; }
    catch (e) { return { ok: false, error: e.message }; }
  }

  // =========================================================================================== page frame
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win qp'; s.hidden = true;
    s.innerHTML = `<div class="whead"><h2>${img('L2UI_CT1/crop/Icon_DF_MenuWnd_Quest', '', 'gi')} Quests</h2><span class="muted" id="qpMeta"></span></div>
      <div class="qp-msg" id="qpMsg" role="status" hidden></div>
      <div id="qpListView">
        <div class="box ql-all" id="qpLiveAll" hidden></div>
        <div class="qp-filters box" id="qpFilters"></div>
        <details class="box qp-farm qp-bg" id="qpBgBox"><summary><h3>${img('icon/weapon_long_sword_i00', '', 'gi')} Beginner gear (forum guide: shadow weapons, Supply Check, jewelry coupon)</h3></summary><div id="qpBg"><span class="muted">loading…</span></div></details>
        <details class="box qp-farm" id="qpFarmBox"><summary><h3>${img('icon/etc_adena_i00', '', 'gi')} Quest farm (repeatable adena quests)</h3></summary><div id="qpFarm"><span class="muted">loading…</span></div></details>
        <div class="muted qp-count" id="qpCount"></div>
        <div class="qp-list" id="qpList"></div>
        <div class="qp-more" id="qpMore"></div>
      </div>
      <div id="qpDetail" hidden></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('input', onInput);
    s.addEventListener('change', onInput);
    s.querySelector('#qpFarmBox').addEventListener('toggle', (e) => { if (e.target.open) { store('farmOpen', true); loadFarm().then(renderFarm); } else store('farmOpen', false); });
    s.querySelector('#qpBgBox').addEventListener('toggle', (e) => { if (e.target.open) { store('bgOpen', true); loadBg().then(renderBg); } else store('bgOpen', false); });   // BEGINNER GEAR 2026-10-12
    return s;
  }
  function route(kind, arg) {
    if (kind === 'quests') { open(arg ? decodeURIComponent(arg) : null); return true; }
    close(); return false;
  }
  function open(id) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'quests'; } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'quests')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    const was = QP.open; s.hidden = false; QP.open = true;
    const f = store('f'); if (f && !was) Object.assign(QP.f, f);
    QP.sel = id && /^\d+$/.test(id) ? id : null;
    $id('qpListView').hidden = !!QP.sel; $id('qpDetail').hidden = !QP.sel;
    if (!was || QP.sel) window.scrollTo(0, 0);
    if (!QP.timer) QP.timer = setInterval(tick, 15000);
    if (store('farmOpen') && !$id('qpFarmBox').open) $id('qpFarmBox').open = true;
    if (store('bgOpen') && !$id('qpBgBox').open) $id('qpBgBox').open = true;
    render();
    liveHook(QP.sel);   // QUEST LIVE 2026-10-12
    loadList().then(render); loadChars(true).then(() => { if (QP.sel) renderDetailChars(); else { const f = $id('qpFilters'); if (f) f.dataset.done = ''; renderFilters(); renderList(); } });
  }
  function close() {
    if (!QP.open) return;
    QP.open = false; clearInterval(QP.timer); QP.timer = 0;
    liveHook(false);   // QUEST LIVE 2026-10-12
    const s = $id(SEC); if (s) s.hidden = true;
  }
  // QUEST LIVE 2026-10-12: live progress per character (Dashboard/questlive.js + questlive.css, loaded on first use; GET /api/quests/live every 3 s
  // while visible). arg = quest id (detail) | null (list) | false (page closed) | 'paint' (the detail page was rebuilt)
  function liveHook(arg) {
    if (window.QuestLive) { try { if (arg === 'paint') QuestLive.paint(); else QuestLive.show(arg); } catch (e) { } return; }
    if (arg === false || arg === 'paint' || QP.liveLoading) return;
    QP.liveLoading = true;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/questlive.css'; document.head.appendChild(l);
    const sc = document.createElement('script'); sc.src = '/questlive.js';
    sc.onload = () => { if (QP.open) { try { QuestLive.show(QP.sel); } catch (e) { } } };
    sc.onerror = () => { QP.liveLoading = false; };
    document.head.appendChild(sc);
  }
  async function tick() {
    if (!QP.open || document.hidden) return;
    await loadChars(true);
    if (QP.sel) { await loadDetail(QP.sel, true); renderDetailChars(); }
    else { renderList(); if ($id('qpFarmBox') && $id('qpFarmBox').open) { await loadFarm(); renderFarmStats(); } if ($id('qpBgBox') && $id('qpBgBox').open) { await loadBg(); renderBgPlan(); } }
  }
  function flash(t, bad) {
    const m = $id('qpMsg'); if (!m) return;
    m.hidden = !t; m.className = 'qp-msg' + (bad ? ' bad' : ''); m.textContent = t || '';
    clearTimeout(QP.msgT); QP.msgT = setTimeout(() => { const x = $id('qpMsg'); if (x) x.hidden = true; }, bad ? 14000 : 7000);
  }
  function render() {
    if (!QP.open) return;
    const m = QP.meta && QP.meta.coverage;
    put($id('qpMeta'), m ? `${m.quests} quests · ${m.repeatable} repeatable · ${m.daily} daily · ${m.questItems} quest items · datapack L2J High Five` : '');
    if (QP.sel) renderDetail(); else { renderFilters(); renderList(); }
  }

  // =========================================================================================== list
  function renderFilters() {
    const el = $id('qpFilters'); if (!el || el.dataset.done === '1' && el._chars === QP.chars.length) return;
    const f = QP.f;
    el.dataset.done = '1'; el._chars = QP.chars.length;
    el.innerHTML = `<label class="qp-f qp-fq"><span>Search</span><input id="qpQ" type="search" placeholder="name, id, NPC, town" value="${h(f.q)}" autocomplete="off"></label>
      <label class="qp-f"><span>For level</span><input id="qpLvl" type="number" min="1" max="99" inputmode="numeric" value="${h(f.lvl)}" placeholder="any"></label>
      <label class="qp-f"><span>Fits character</span><select id="qpChar"><option value="">anyone</option>${QP.chars.map(c => `<option value="${h(c.name)}"${f.char === c.name ? ' selected' : ''}>${h(c.name)} (${c.level})</option>`).join('')}</select></label>
      <label class="qp-f"><span>Type</span><select id="qpType">${[['', 'all'], ['repeatable', 'repeatable'], ['daily', 'daily'], ['rep+daily', 'repeatable + daily'], ['one-time', 'one-time']].map(([v, t]) => `<option value="${v}"${f.type === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="qp-f"><span>Race</span><select id="qpRace"><option value="">any</option>${RACES.map(r => `<option value="${r}"${f.race === r ? ' selected' : ''}>${r.replace('_', ' ').toLowerCase()}</option>`).join('')}</select></label>
      <label class="qp-f"><span>Sort</span><select id="qpSort">${[['level', 'level'], ['name', 'name'], ['adena', 'adena reward'], ['exp', 'exp reward'], ['id', 'id']].map(([v, t]) => `<option value="${v}"${f.sort === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="chk qp-chk"><input type="checkbox" id="qpAdena"${f.adena ? ' checked' : ''}> gives adena</label>`;
  }
  function filtered() {
    const f = QP.f, q = f.q.trim().toLowerCase(), L = Number(f.lvl) || 0;
    const ch = f.char ? QP.chars.find(c => c.name === f.char) : null, fits = ch ? new Set(ch.fits || []) : null;
    let rows = (QP.rows || []).filter(r => {
      if (q && !(`${r.id} ${r.name} ${r.npc} ${r.town}`.toLowerCase().includes(q))) return false;
      if (L && ((r.lmin != null && L < r.lmin) || (r.lmax != null && L > r.lmax))) return false;
      if (fits && !fits.has(r.id)) return false;
      if (f.type === 'rep+daily' ? !/repeatable|daily/.test(r.type) : f.type && r.type !== f.type) return false;
      if (f.race) { const rq = r.req || {}; if (rq.races && !rq.races.includes(f.race)) return false; if (rq.notRaces && rq.notRaces.includes(f.race)) return false; }
      if (f.adena && !(r.adenaV > 0)) return false;
      return true;
    });
    const by = { level: (a, b) => (a.lmin || 0) - (b.lmin || 0) || a.id - b.id, name: (a, b) => a.name.localeCompare(b.name), adena: (a, b) => b.adenaV - a.adenaV || (a.lmin || 0) - (b.lmin || 0),
      exp: (a, b) => b.exp - a.exp, id: (a, b) => a.id - b.id }[f.sort] || ((a, b) => 0);
    return rows.slice().sort(by);
  }
  function badge(type, endless) {
    const t = TYPE_TXT[type] || TYPE_TXT.unknown;
    return `<span class="qp-b qp-b-${h(type || 'unknown')}" title="${h(t[1])}">${h(t[0])}${endless ? ' ∞' : ''}</span>`;
  }
  function lvlTxt(a, b) { return a == null && b == null ? 'any' : `${a == null ? '1' : a}${b == null ? '+' : '–' + b}`; }
  function myStatus(id) {
    const out = [];
    QP.chars.forEach(c => { if (c.active && Number(c.active.id) === Number(id)) out.push(`<span class="qp-b qp-b-run" title="${h(c.name)}: ${h(PHASE_TXT[c.active.phase] || c.active.phase || '')}">${h(c.name)}</span>`); });
    return out.join('');
  }
  function renderList() {
    const el = $id('qpList'); if (!el) return;
    if (!QP.rows) { put(el, '<div class="muted">loading the quest list…</div>'); return; }
    const rows = filtered(), shown = rows.slice(0, QP.shown);
    put($id('qpCount'), `${rows.length} of ${QP.rows.length} quests`);
    put(el, shown.map(r => `<a class="qp-row" href="#/quests/${r.id}">
        <span class="qp-lv" title="level">${lvlTxt(r.lmin, r.lmax)}</span>
        <span class="qp-nm"><b>${h(r.name)}</b> <small class="muted">#${r.id}</small> ${badge(r.type, r.endless)}${r.parse && r.parse !== 'full' ? `<span class="qp-b qp-b-warn" title="parsed ${h(r.parse)}">${h(r.parse)}</span>` : ''}${reqChips(r.req)}${myStatus(r.id)}</span>
        <span class="qp-npc muted">${h(r.npc || '—')}${r.town ? ' · ' + h(r.town) : ''}</span>
        <span class="qp-rw">${r.adena ? `<span class="qp-ad">${img('icon/etc_adena_i00', 'adena')} ${h(r.adena)}${r.turnIn ? ' <small class="muted">turn-in</small>' : ''}</span>` : ''}${r.exp ? `<span class="muted qp-exp">${fmt(r.exp)} xp</span>` : ''}${(r.rewards || []).map(i => img(i.icon, i.name)).join('')}</span>
      </a>`).join('') || '<div class="muted">No quest matches the filters.</div>');
    put($id('qpMore'), rows.length > QP.shown ? `<button data-qp="more">Show ${Math.min(200, rows.length - QP.shown)} more</button>` : '');
  }
  function reqChips(rq) {
    if (!rq) return '';
    const out = [];
    if (rq.races) out.push(rq.races.map(r => r.replace('_', ' ').toLowerCase()).join('/'));
    if (rq.notRaces) out.push('not ' + rq.notRaces.map(r => r.replace('_', ' ').toLowerCase()).join('/'));
    if (rq.classes) out.push(rq.classes.length > 3 ? rq.classes.length + ' classes' : rq.classes.join('/'));
    if (rq.categories) out.push(rq.categories.map(c => c.replace(/_GROUP$/, '').replace(/_/g, ' ').toLowerCase()).join('/'));
    if (rq.quests) out.push('after #' + rq.quests.map(q => q.id).join(', #'));
    if (rq.noble) out.push('noble');
    return out.map(t => `<span class="qp-b qp-b-req">${h(t)}</span>`).join('');
  }

  // =========================================================================================== detail
  async function renderDetail() {
    const el = $id('qpDetail'); if (!el) return;
    const id = QP.sel;
    if (!QP.det[id]) put(el, `<div class="muted">loading quest ${h(id)}…</div>`);
    const d = await loadDetail(id);
    if (QP.sel !== id) return;
    if (!d || !d.ok) { put(el, `<button data-qp="back">‹ All quests</button><div class="qp-msg bad">${h((d && d.error) || 'not found')}</div>`); return; }
    const q = d.quest, N = d.names || {}, I = d.icons || {};
    const nm = (nid) => h(N[nid] || ('#' + nid));
    const it = (iid, cnt) => { const x = I[String(iid)] || { name: '#' + iid }; return `<span class="qp-it${x.questItem ? ' qi' : ''}" title="${h(x.name)}${x.questItem ? ' (quest item)' : ''}">${img(x.icon, x.name)}${h(x.name)}${cnt != null && cnt !== 1 ? ' ×' + (cnt < 0 ? 'all' : num(cnt)) : ''}${x.questItem ? '<span class="qp-qi" title="quest item: never sold, stashed or traded">Q</span>' : ''}</span>`; };
    const st = (q.startNpcs || [])[0];
    const rq = q.requirements || {};
    const reqRows = [];
    reqRows.push(`Level ${lvlTxt(q.level && q.level.min, q.level && q.level.max)}${q.levelWhy ? ` <small class="muted">(${h(q.levelWhy)})</small>` : ''}`);
    if (rq.races && rq.races.length) reqRows.push('Race: ' + h(rq.races.join(', ').toLowerCase()));
    if (rq.notRaces && rq.notRaces.length) reqRows.push('Not for: ' + h(rq.notRaces.join(', ').toLowerCase()));
    if (rq.classes && rq.classes.length) reqRows.push('Classes: ' + h(rq.classes.join(', ')));
    if (rq.notClasses && rq.notClasses.length) reqRows.push('Not for classes: ' + h(rq.notClasses.join(', ')));
    if (rq.categories && rq.categories.length) reqRows.push('Class group: ' + h(rq.categories.join(', ').toLowerCase().replace(/_/g, ' ')));
    (rq.quests || []).forEach(p => reqRows.push(`Quest <a href="#/quests/${p.id}">#${p.id}</a> ${h(String(p.name || '').replace(/^Q\d+_/, ''))} must be ${h(p.need)}`));
    (rq.items || []).forEach(i => reqRows.push('Needs ' + it(i.id)));
    if (rq.noble) reqRows.push('Noblesse');
    if (rq.clan) reqRows.push('Clan: ' + h(typeof rq.clan === 'string' ? rq.clan : 'needed'));
    if (rq.subclass) reqRows.push('Subclass');
    (rq.other || []).slice(0, 4).forEach(o => reqRows.push(`<small class="muted">script: ${h([].concat(o).join(' && '))}</small>`));
    const ps = q.parse || {};
    el.innerHTML = `<div class="qp-dhead"><button data-qp="back">‹ All quests</button>
        <h2>${h(q.name)} <small class="muted">#${q.id}</small></h2>${badge(q.type, q.endless)}
        <span class="qp-b qp-b-lv">level ${lvlTxt(q.level && q.level.min, q.level && q.level.max)}</span>
        ${ps.status && ps.status !== 'full' ? `<span class="qp-b qp-b-warn" title="${h((ps.reasons || []).join('; '))}">parsed: ${h(ps.status)}</span>` : '<span class="qp-b qp-b-ok">fully parsed</span>'}</div>
      <div class="box ql-box" id="qpLive"></div>
      ${ps.status && ps.status !== 'full' ? `<div class="qp-note">The datapack script was only partly understood (${h((ps.reasons || []).join('; ') || ps.status)}). Steps below may be incomplete; the bot falls back to dialog text and quest-state checks.</div>` : ''}
      <div class="qp-grid">
        <div class="box"><h3>Description</h3>
          ${st ? `<div class="qp-start">${img('L2UI_CT1/crop/Icon_DF_MenuWnd_Character', '', 'gi')} Start: <b>${h(st.name)}</b>${st.title ? ` <small class="muted">${h(st.title)}</small>` : ''} · ${h(st.town || st.region || '')}${(st.spawns || [])[0] ? ` <small class="muted">${st.spawns[0].join(', ')}</small>` : st.spawnedByQuest ? ' <small class="muted">(spawned by a quest)</small>' : ''}</div>` : '<div class="muted">No start NPC registered.</div>'}
          <div class="qp-desc">${h(q.description || '(no offer text found)')}</div>
          ${q.acceptText ? `<details><summary class="muted">After accepting</summary><div class="qp-desc">${h(q.acceptText)}</div></details>` : ''}
          <h4>Requirements</h4><ul class="qp-ul">${reqRows.map(r => `<li>${r}</li>`).join('')}</ul></div>
        <div class="box"><h3>Your characters</h3><div id="qpChars"></div></div>
      </div>
      <div class="box qp-mapbox"><h3>Map <span class="qp-mapbtn" id="qpMapBtns"></span></h3><div id="qpMap" class="qp-map"></div>
        <div class="muted qp-legend"><span><i class="qp-dot" style="background:#f0c040"></i>start NPC</span><span><i class="qp-dot" style="background:#5aa9ff"></i>NPC</span><span><i class="qp-dot" style="background:#ff4d4d"></i>monsters (count)</span><span><i class="qp-dot" style="background:#3ddc84"></i>hunting area</span><span><i class="qp-dot qp-sq" style="background:#d6b3ff"></i>teleport landing</span></div></div>
      <div class="box"><h3>Steps</h3>${stepsHtml(q, nm, it)}</div>
      <div class="box"><h3>Route to each step <small class="muted">computed path, doors, needed items</small></h3><div id="qpRoute" class="muted">${window.RouteView ? '…' : 'needs Dashboard/routeview.js (dashboard server restart)'}</div></div>
      <div class="box"><h3>Rewards</h3>${rewardsHtml(q, nm, it)}</div>
      <div class="qp-grid">
        <div class="box"><h3>Items</h3>${itemsHtml(q, nm, it, I)}</div>
        <div class="box"><h3>Monsters + where to hunt</h3>${monstersHtml(q)}</div>
      </div>
      ${(q.spawns || []).length ? `<div class="box"><h3>Quest-spawned monsters / NPCs</h3>${spawnsHtml(q, nm)}</div>` : ''}
      <div class="box"><h3>NPCs</h3>${npcsHtml(q)}</div>
      <div class="muted qp-src">Source: ${h(q.file || '')}${q.clientType ? ` · client type ${q.clientType}` : ''}</div>`;
    renderDetailChars();
    renderMap(d);
    try { if (window.RouteView) RouteView.mount($id('qpRoute'), 'quest:' + q.id, { map: true }); } catch (e) { }   // ROUTE VIEW 2026-10-12: every step's NPC / hunting area
    liveHook('paint');   // QUEST LIVE 2026-10-12: #qpLive was just (re)built
  }
  function trigHtml(t, nm) {
    if (!t) return '';
    let s = `${h(TRIG_TXT[t.type] || t.type)} ${(t.npcs || []).map(nm).join(', ')}`;
    if (t.links && t.links.length) s += ` → click ${t.links.map(l => `<q>${h(l)}</q>`).join(' → ')}`;
    if (t.needCounts && t.needCounts.length) s += ` <small class="muted">(needs ${t.needCounts.map(n => n.n + '× #' + n.id).join(', ')})</small>`;
    if (t.needItems && t.needItems.length) s += ` <small class="muted">(with item ${t.needItems.map(i => '#' + i).join(', ')})</small>`;
    return s;
  }
  function transHtml(t, nm, it) {
    const out = [`<span class="qp-trig">${trigHtml(t.trigger, nm)}</span>`];
    if (t.to === 'end') out.push(`<span class="qp-b qp-b-end">quest ${t.end === 'repeatable' ? 'ends (take it again)' : t.end === 'daily' ? 'ends (daily)' : 'ends'}</span>`);
    else if (t.to != null && t.to !== 'start') out.push(`<span class="muted">→ step ${h(t.to)}</span>`);
    if ((t.gives || []).length) out.push('gives ' + t.gives.map(g => it(g.id, g.count) + (g.chance ? ` <small>${g.chance}%</small>` : '')).join(' '));
    if ((t.takes || []).length) out.push('takes ' + t.takes.map(g => it(g.id, g.count)).join(' '));
    if (t.adena) out.push(`${img('icon/etc_adena_i00', 'adena')} ${h(adenaTxt(t.adena))}`);
    if (t.exp) out.push(`${num(t.exp)} xp`); if (t.sp) out.push(`${num(t.sp)} sp`);
    if (t.random) out.push('<small class="muted">random</small>');
    return out.join(' · ');
  }
  function adenaTxt(a) {
    if (a == null) return ''; if (typeof a === 'number') return num(a);
    const p = []; (a.perItem || []).forEach(x => p.push(`${num(x.each)} per item`)); if (a.base) p.push(`+ ${num(a.base)}`);
    if (a.bonus && a.bonus.adena) p.push(`+ ${num(a.bonus.adena)} bonus at ${a.bonus.min}+ items`); if (a.range) p.push(`${num(a.range[0])}–${num(a.range[1])}`);
    if (a.amount) p.push(`${num(a.amount)}${a.chance ? ` (${a.chance}% chance)` : ''}`);
    return p.join(' ') || (a.raw ? 'formula: ' + a.raw : '');
  }
  function dropHtml(dr, nm, it) {
    const ch = dr.chance != null ? `${dr.chance}%` : dr.chanceByNpc ? Object.entries(dr.chanceByNpc).map(([k, v]) => `${nm(k)} ${v}%`).join(', ') : '?';
    const amt = Array.isArray(dr.amount) ? `${dr.amount[0]}–${dr.amount[1]}` : dr.amount && dr.amount !== 1 ? dr.amount : '';
    return `<li>${it(dr.item)} from ${(dr.monsters || []).map(nm).join(', ')} · <b>${h(ch)}</b>${amt ? ` · ${h(amt)} each` : ''}${dr.limit ? ` · until ${dr.limit}` : ''}${dr.party ? ' · <small>any party member</small>' : ''}${dr.needItems && dr.needItems.length ? ` · <small>needs ${dr.needItems.map(x => '#' + x).join(', ')}</small>` : ''}</li>`;
  }
  function stepsHtml(q, nm, it) {
    const T = q.transitions || [], D = q.drops || [], K = q.kills || [];
    const used = new Set();
    const steps = (q.steps || []).map(s => {
      const leave = (s.leave || []).map(i => { used.add(i); return T[i]; }).filter(Boolean);
      if (s.cond === 0) T.forEach((t, i) => { if (t.start || t.to === 'start' || (t.from == null && t.to === 1 && t.start)) { used.add(i); if (!leave.includes(t)) leave.push(t); } });
      const drops = (s.drops || []).map(i => D[i]).filter(Boolean);
      const kills = K.filter(k => (k.conds || []).includes(s.cond));
      const spawns = (q.spawns || []).filter(sp => (sp.conds || []).includes(s.cond));
      return `<li class="qp-step"><div class="qp-sh"><span class="qp-cond">${s.cond === 0 ? 'Start' : 'Step ' + s.cond}</span> <b>${h(s.title || (s.cond === 0 ? 'accept the quest' : ''))}</b>${(s.talk || []).length ? ` <small class="muted">talk: ${s.talk.map(nm).join(', ')}</small>` : ''}</div>
        ${leave.length ? `<ul class="qp-ul">${leave.map(t => `<li>${transHtml(t, nm, it)}</li>`).join('')}</ul>` : ''}
        ${drops.length ? `<div class="qp-sub">Drops</div><ul class="qp-ul">${drops.map(dr => dropHtml(dr, nm, it)).join('')}</ul>` : ''}
        ${kills.length ? `<div class="qp-sub">Kills</div><ul class="qp-ul">${kills.map(k => `<li>${(k.monsters || []).map(nm).join(', ')}${k.count ? ` × ${k.count}` : ''}${k.to != null ? ` → step ${h(k.to)}` : ''}</li>`).join('')}</ul>` : ''}
        ${spawns.length ? `<div class="qp-sub">Spawns</div><ul class="qp-ul">${spawns.map(sp => `<li>${trigHtml(sp.by, nm)} → <b>${h(sp.name || nm(sp.npc))}</b> appears</li>`).join('')}</ul>` : ''}</li>`;
    });
    const rest = T.map((t, i) => used.has(i) ? '' : `<li>${t.from ? `<span class="muted">from step ${h([].concat(t.from).join('/'))}:</span> ` : ''}${transHtml(t, nm, it)}</li>`).filter(Boolean);
    const otherDrops = D.filter((dr, i) => !(q.steps || []).some(s => (s.drops || []).includes(i)));
    return `<ol class="qp-steps">${steps.join('')}</ol>${rest.length ? `<div class="qp-sub">Other transitions</div><ul class="qp-ul">${rest.join('')}</ul>` : ''}
      ${otherDrops.length ? `<div class="qp-sub">Drops (any step)</div><ul class="qp-ul">${otherDrops.map(dr => dropHtml(dr, nm, it)).join('')}</ul>` : ''}
      ${(q.timers || []).length ? `<div class="qp-sub">Timers</div><ul class="qp-ul">${q.timers.map(t => `<li>${h(t.name)} ${t.ms ? Math.round(t.ms / 1000) + ' s' : ''}</li>`).join('')}</ul>` : ''}`;
  }
  function rewardHtml(r, nm, it) {
    const p = [];
    if (r.adena != null) p.push(`<span class="qp-ad">${img('icon/etc_adena_i00', 'adena')} ${h(adenaTxt(r.adena))}</span>`);
    if (r.exp) p.push(`${num(r.exp)} xp`); if (r.sp) p.push(`${num(r.sp)} sp`);
    (r.items || []).forEach(i => p.push(it(i.id, i.count) + (i.chance ? ` <small>${i.chance}%</small>` : '')));
    if ((r.takes || []).length) p.push('<small class="muted">takes</small> ' + r.takes.map(x => it(x.id, x.count)).join(' '));
    return `<li>${r.trigger ? `<small class="muted">${trigHtml(r.trigger, nm)}${r.conds ? ' (step ' + r.conds.join('/') + ')' : ''}:</small> ` : ''}${p.join(' · ') || '<span class="muted">nothing fixed (random / chosen in the dialog)</span>'}</li>`;
  }
  function rewardsHtml(q, nm, it) {
    const R = q.rewards || {}, out = [];
    if ((R.final || []).length) out.push(`<div class="qp-sub">At the end${R.choices ? ' <span class="qp-b">pick one</span>' : ''}</div><ul class="qp-ul">${R.final.map(r => rewardHtml(r, nm, it)).join('')}</ul>`);
    if ((R.turnIns || []).length) out.push(`<div class="qp-sub">Hand-ins (the quest stays open, hand in again and again)</div><ul class="qp-ul">${R.turnIns.map(r => rewardHtml(r, nm, it)).join('')}</ul>`);
    if ((R.steps || []).length) out.push(`<div class="qp-sub">On the way</div><ul class="qp-ul">${R.steps.map(r => rewardHtml(r, nm, it)).join('')}</ul>`);
    return out.join('') || '<div class="muted">No fixed reward found in the script (random item lists or dialog choices).</div>';
  }
  function itemsHtml(q, nm, it, I) {
    const L = q.items || [];
    if (!L.length) return '<div class="muted">No items.</div>';
    return `<ul class="qp-ul qp-items">${L.map(i => {
      const x = I[String(i.id)] || {};
      const df = (i.dropsFrom || []).map(d => `${h(d.name || nm(d.npc))} ${d.chance != null ? d.chance + '%' : ''}`).join(', ');
      const nd = (i.normalDrops || []).slice(0, 5).map(d => `${h(d.name || nm(d.npc))} ${d.chance != null ? d.chance + '%' : ''}${d.spoil ? ' (spoil)' : ''}`).join(', ');
      return `<li>${it(i.id)} <small class="muted">${h((i.roles || []).join(', '))}${i.limit ? ' · max ' + i.limit : ''}</small>
        ${df ? `<div class="qp-subl">dropped by ${df}</div>` : ''}${nd ? `<div class="qp-subl">normal drop: ${nd}</div>` : ''}
        ${(i.givenBy || []).length ? `<div class="qp-subl">given by ${i.givenBy.map(nm).join(', ')}</div>` : ''}
        ${(x.otherQuests || []).length ? `<div class="qp-subl">also in ${x.otherQuests.map(o => `<a href="#/quests/${o.id}">#${o.id}</a>`).join(' ')}</div>` : ''}</li>`;
    }).join('')}</ul>`;
  }
  function monstersHtml(q) {
    const M = q.monsters || [];
    if (!M.length) return '<div class="muted">No monsters.</div>';
    return `<ul class="qp-ul qp-mobs">${M.map(m => `<li><b>${h(m.name)}</b> <small>lvl ${h(m.level)}</small>${m.aggressive ? ' <span class="qp-b qp-b-warn">aggressive</span>' : ''}${m.raid ? ' <span class="qp-b qp-b-warn">raid</span>' : ''}
        <small class="muted">${h((m.roles || []).join(', '))} · ${m.spawnCount ? m.spawnCount + ' spawns' : 'only spawned by the quest'}</small>
        ${(m.areas || []).length ? `<div class="qp-subl">${m.areas.map(a => `${h(a.name)} <small class="muted">(lvl ${(a.levels || []).join('–')}${a.landing ? ', ' + h(a.landing.desc) : ''})</small>`).join('<br>')}</div>` : ''}
        ${(m.clusters || []).length ? `<div class="qp-subl muted">${m.clusters.map(c => `${c.count}× at ${c.at.slice(0, 2).join(', ')}${c.landing ? ' — ' + h(c.landing.desc) + ' +' + Math.round((c.landing.dist || 0) / 100) / 10 + 'k' : ''}`).join('<br>')}</div>` : ''}</li>`).join('')}</ul>`;
  }
  function spawnsHtml(q, nm) {
    return `<ul class="qp-ul">${q.spawns.map(sp => `<li>${trigHtml(sp.by, nm)} → <b>${h(sp.name || (sp.npc ? nm(sp.npc) : 'a monster'))}</b>
      ${sp.at && typeof sp.at === 'object' && sp.at.x != null ? `<small class="muted">at ${sp.at.x}, ${sp.at.y}</small>` : sp.at ? `<small class="muted">at the ${h(typeof sp.at === 'string' ? sp.at : 'place in the script')}</small>` : ''}
      ${sp.conds ? `<small class="muted">(step ${sp.conds.join('/')})</small>` : ''}</li>`).join('')}</ul>`;
  }
  function npcsHtml(q) {
    return `<ul class="qp-ul">${(q.npcs || []).map(n => `<li><b>${h(n.name)}</b>${n.title ? ` <small class="muted">${h(n.title)}</small>` : ''} · ${h(n.town || n.region || '')}
      ${(n.spawns || [])[0] ? `<small class="muted">${n.spawns[0].join(', ')}</small>` : n.spawnedByQuest ? '<small class="muted">spawned by the quest</small>' : ''}</li>`).join('')}</ul>`;
  }

  // --------------------------------------------------------------------------- characters on the detail page
  function renderDetailChars() {
    const el = $id('qpChars'); if (!el) return;
    const d = QP.det[QP.sel] && QP.det[QP.sel].d; if (!d || !d.ok) return;
    const q = d.quest, rep = /repeatable|daily/.test(q.type) || q.endless;
    const keep = {}; el.querySelectorAll('[data-qpin]').forEach(i => { keep[i.dataset.qpin] = i.value; });
    const rows = (d.chars || []).slice().sort((a, b) => ({ yes: 0, maybe: 1, no: 2 }[a.elig] - { yes: 0, maybe: 1, no: 2 }[b.elig]) || a.name.localeCompare(b.name));
    if (!rows.length) { el.innerHTML = '<div class="muted">No characters report in (Logs/swarm_state_*.json).</div>'; return; }
    el.innerHTML = rows.map(c => {
      const a = c.activeHere ? c.active : null, s = c.status;
      const status = a ? `<span class="qp-b qp-b-run">${h(PHASE_TXT[a.phase] || a.phase || 'running')}</span>${a.repeat != null && rep ? ` <small>run ${(a.runs || 0) + 1}${a.repeat ? '/' + a.repeat : ' (forever)'}</small>` : ''}${a.msg ? ` <small class="muted">${h(a.msg)}</small>` : ''}
          ${(a.need || []).length ? `<div class="qp-need">${a.need.map(n => `<span class="${n.have >= n.n ? 'ok' : ''}">${h(n.name || '#' + n.id)} ${n.have}/${n.n}</span>`).join('')}</div>` : ''}`
        : c.active ? `<small class="muted">busy with <a href="#/quests/${c.active.id}">#${c.active.id} ${h(c.active.name || '')}</a></small>`
        : s ? `<span class="qp-b qp-b-${s.status === 'done' ? 'ok' : s.status === 'failed' || s.status === 'cannot' ? 'warn' : 'end'}">${h(s.status)}</span>${s.runs ? ` <small>${s.runs} run${s.runs === 1 ? '' : 's'}</small>` : ''}${s.lastMsg ? ` <small class="muted">${h(s.lastMsg)}</small>` : ''}` : '';
      const el2 = c.elig === 'yes' ? '<span class="qp-b qp-b-ok">eligible</span>' : c.elig === 'maybe' ? `<span class="qp-b qp-b-maybe" title="${h(c.why)}">check</span>` : `<span class="qp-b qp-b-no" title="${h(c.why)}">no</span>`;
      const k = c.name;
      return `<div class="qp-ch${c.online ? '' : ' off'}">
        <div class="qp-chh">${c.classId != null && typeof classIcon === 'function' ? classIcon({ classId: c.classId }, 'sm') : ''}<b>${h(c.name)}</b> <small>${c.level || '?'} ${h(c.cls || '')}</small> ${el2} ${c.online ? '' : '<small class="muted">offline</small>'}</div>
        ${c.why ? `<div class="muted qp-why">${h(c.why)}</div>` : ''}
        ${status ? `<div class="qp-chs">${status}</div>` : ''}
        <div class="qp-cha">
          ${rep ? `<label>repeat <input type="number" min="0" max="999" inputmode="numeric" data-qpin="rep:${h(k)}" value="${h(keep['rep:' + k] != null ? keep['rep:' + k] : '1')}" title="0 = forever"></label>` : ''}
          <select data-qpin="mode:${h(k)}"><option value="solo"${keep['mode:' + k] !== 'party' ? ' selected' : ''}>solo</option><option value="party"${keep['mode:' + k] === 'party' ? ' selected' : ''}>party</option></select>
          <button class="go" data-qp="start" data-name="${h(k)}"${c.elig === 'no' ? ' title="not eligible — you can still try"' : ''}>Start</button>
          <button data-qp="stop" data-name="${h(k)}"${c.active ? '' : ' disabled'}>Stop</button>
          <button data-qp="status" data-name="${h(k)}">Status</button></div></div>`;
    }).join('');
  }

  // --------------------------------------------------------------------------- map (the /minitile pieces, same formula as the character page)
  function mapPoints(d) {
    const q = d.quest, P = [];
    (q.startNpcs || []).forEach(n => (n.spawns || []).slice(0, 3).forEach(s => P.push({ k: 'start', x: s[0], y: s[1], t: n.name })));
    (q.npcs || []).forEach(n => { if ((q.startNpcs || []).some(s => s.id === n.id)) return; (n.spawns || []).slice(0, 2).forEach(s => P.push({ k: 'npc', x: s[0], y: s[1], t: n.name })); });
    (q.monsters || []).forEach(m => (m.clusters || []).forEach(c => { P.push({ k: 'mob', x: c.at[0], y: c.at[1], t: `${m.name} ×${c.count}`, n: c.count }); if (c.landing) P.push({ k: 'land', x: c.landing.x, y: c.landing.y, t: c.landing.desc }); }));
    (q.spawns || []).forEach(sp => { if (sp.at && typeof sp.at === 'object' && sp.at.x != null) P.push({ k: 'spawn', x: sp.at.x, y: sp.at.y, t: (sp.name || 'quest spawn') }); });
    const A = Object.values(d.areas || {});
    return { P: P.filter(p => isFinite(p.x) && isFinite(p.y)), A };
  }
  function renderMap(d) {
    const box = $id('qpMap'); if (!box) return;
    const { P, A } = mapPoints(d);
    if (!P.length && !A.length) { box.innerHTML = '<div class="muted">No coordinates for this quest.</div>'; put($id('qpMapBtns'), ''); return; }
    const groups = { all: P.concat(A.map(a => ({ x: a.center[0], y: a.center[1] }))), start: P.filter(p => p.k === 'start' || p.k === 'npc'), hunt: P.filter(p => p.k === 'mob' || p.k === 'spawn').concat(A.map(a => ({ x: a.center[0], y: a.center[1] }))) };
    const span = (L) => { if (!L.length) return 1e9; const xs = L.map(p => p.x), ys = L.map(p => p.y); return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); };
    let focus = QP.mapFocus;
    if (focus === 'auto') focus = span(groups.all) <= 50000 ? 'all' : groups.hunt.length ? 'hunt' : 'start';
    if (!groups[focus] || !groups[focus].length) focus = 'all';
    put($id('qpMapBtns'), ['all', 'start', 'hunt'].filter(k => groups[k].length).map(k => `<button class="${k === focus ? 'on' : ''}" data-qp="map" data-f="${k}">${{ all: 'everything', start: 'NPCs', hunt: 'hunting' }[k]}</button>`).join(''));
    let L = groups[focus];
    if (focus !== 'all' && span(L) > 60000) { const c = L[0]; L = L.filter(p => Math.hypot(p.x - c.x, p.y - c.y) < 30000); }
    const xs = L.map(p => p.x), ys = L.map(p => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const R = Math.min(40000, Math.max(3000, span(L) / 2 * 1.25 + 1500)), W = 2 * R, x0 = cx - R, y0 = cy - R, u = W / 520;
    const T = typeof MT === 'number' ? MT : 8192;
    let s = '';
    for (let gx = Math.floor(x0 / T); gx * T < x0 + W; gx++) for (let gy = Math.floor(y0 / T); gy * T < y0 + W; gy++) {
      const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, c = gx - Math.floor(gx / 4) * 4, r = gy - Math.floor(gy / 4) * 4;
      s += `<image href="/minitile/${RX}_${RY}_${c}_${r}.jpg" x="${gx * T}" y="${gy * T}" width="${T}" height="${T}" preserveAspectRatio="none"/>`;
    }
    const label = (x, y, t, size, fill) => `<text x="${x}" y="${y}" font-size="${(size || 10) * u}" fill="${fill || '#fff'}" paint-order="stroke" stroke="#000" stroke-width="${3 * u}" stroke-linejoin="round" pointer-events="none">${h(t)}</text>`;
    A.forEach(a => { if ((a.poly || []).length > 2) s += `<polygon points="${a.poly.map(p => p[0] + ',' + p[1]).join(' ')}" fill="#3ddc84" fill-opacity="0.18" stroke="#3ddc84" stroke-width="${1.5 * u}"><title>${h(a.name)}</title></polygon>`; });
    const seen = {};
    const lbl = (p, col, sz) => { const key = p.t + Math.round(p.x / (R / 8)) + ',' + Math.round(p.y / (R / 8)); if (seen[key]) return ''; seen[key] = 1; return label(p.x + 8 * u, p.y + 4 * u, p.t, sz, col); };
    P.filter(p => p.k === 'mob').forEach(p => { s += `<circle cx="${p.x}" cy="${p.y}" r="${Math.min(14, 4 + Math.sqrt(p.n || 1) * 1.6) * u}" fill="#ff4d4d" fill-opacity="0.55" stroke="#000" stroke-width="${u}"><title>${h(p.t)}</title></circle>` + lbl(p, '#ffb3b3', 8); });
    P.filter(p => p.k === 'land').forEach(p => { s += `<rect x="${p.x - 5 * u}" y="${p.y - 5 * u}" width="${10 * u}" height="${10 * u}" fill="#d6b3ff" stroke="#000" stroke-width="${u}"><title>${h(p.t)}</title></rect>` + lbl(p, '#d6b3ff', 8); });
    P.filter(p => p.k === 'spawn').forEach(p => { s += `<circle cx="${p.x}" cy="${p.y}" r="${6 * u}" fill="none" stroke="#ff9a3d" stroke-width="${2.5 * u}"><title>${h(p.t)}</title></circle>` + lbl(p, '#ffc38a', 8); });
    P.filter(p => p.k === 'npc').forEach(p => { s += `<circle cx="${p.x}" cy="${p.y}" r="${5 * u}" fill="#5aa9ff" stroke="#000" stroke-width="${u}"><title>${h(p.t)}</title></circle>` + lbl(p, '#9cc8ff', 9); });
    P.filter(p => p.k === 'start').forEach(p => { s += `<circle cx="${p.x}" cy="${p.y}" r="${7 * u}" fill="#f0c040" stroke="#000" stroke-width="${u}"><title>${h(p.t)}</title></circle>` + lbl(p, '#f0c040', 10); });
    // own characters on this map
    QP.chars.forEach(c => { const st = (typeof STATE !== 'undefined' && STATE && STATE.chars || []).find(x => x.name === c.name); if (!st || !isFinite(st.x) || st.x < x0 || st.x > x0 + W || st.y < y0 || st.y > y0 + W) return;
      s += `<circle cx="${st.x}" cy="${st.y}" r="${4 * u}" fill="#fff" stroke="#000" stroke-width="${u}"/>` + label(st.x + 6 * u, st.y - 4 * u, c.name, 8); });
    box.innerHTML = `<svg viewBox="${x0} ${y0} ${W} ${W}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="quest map">${s}</svg>`;
  }

  // =========================================================================================== quest farm
  function renderFarm() {
    const el = $id('qpFarm'); if (!el) return;
    const F = QP.farm; if (!F) { el.innerHTML = '<span class="muted">loading…</span>'; return; }
    const c = F.cfg || {}, names = F.names || [], sel = new Set(c.chars || []);
    el.innerHTML = `<div class="muted qp-fhelp">Farm characters repeat the best repeatable adena quest for their level (Scripts/data/quest_farm.json, the planner <code>node docs/plan/tools/quest_farm_plan.js</code>) and trade the adena above “trade above” (keeping “keep”) to the collector. New characters come from Accounts → “+ Add account”.</div>
      <div class="qp-fform">
        <label class="chk qp-chk qp-on"><input type="checkbox" id="qpfOn"${c.on ? ' checked' : ''}> <b>Farm ON</b></label>${c.on ? '' : '<span class="muted"> Off — nothing happens until you switch it on.</span>'}
        <label class="qp-f"><span>Collector (gets the adena)</span><select id="qpfCol"><option value="">— nobody (keep it) —</option>${names.map(n => `<option${c.collector === n ? ' selected' : ''}>${h(n)}</option>`).join('')}</select></label>
        <label class="qp-f"><span>Trade above</span><input id="qpfAbove" type="number" min="0" step="10000" inputmode="numeric" value="${h(c.tradeAbove)}"></label>
        <label class="qp-f"><span>Keep</span><input id="qpfKeep" type="number" min="0" step="1000" inputmode="numeric" value="${h(c.keep)}"></label>
      </div>
      <div class="qp-sub">Farm characters (${sel.size})</div>
      <div class="qp-fchars">${names.map(n => { const ch = QP.chars.find(x => x.name === n) || {}; return `<label class="chk qp-chk"><input type="checkbox" data-qpf="${h(n)}"${sel.has(n) ? ' checked' : ''}${c.collector === n ? ' disabled' : ''}> ${h(n)} <small class="muted">${ch.level || ''}</small></label>`; }).join('') || '<span class="muted">no characters</span>'}</div>
      <div class="qp-fbtn"><button class="go" data-qp="farmSave">Save</button></div>
      <div class="qp-sub">Live</div><div id="qpFarmStats"></div>
      <div class="qp-sub">Plan: best quests per level ${F.meta && F.meta.generated ? `<small class="muted">(${h(String(F.meta.generated).slice(0, 16).replace('T', ' '))})</small>` : ''}</div><div id="qpFarmPlan"></div>`;
    renderFarmStats(); renderFarmPlan();
  }
  function renderFarmStats() {
    const el = $id('qpFarmStats'); if (!el || !QP.farm) return;
    const S = QP.farm.stats || [];
    put(el, S.length ? `<div class="qp-cards">${S.map(s => `<div class="qp-card"><b>${h(s.name)}</b> <small>${s.level || ''}</small> ${s.online ? '' : '<small class="muted">offline</small>'}
        <div>${s.quest ? `<a href="#/quests/${s.quest}">#${s.quest} ${h(s.questName || '')}</a>` : '<span class="muted">no farm quest yet</span>'}${s.phase ? ` · ${h(PHASE_TXT[s.phase] || s.phase)}` : ''}</div>
        <div class="qp-kv"><span>${img('icon/etc_adena_i00', 'adena')} ${fmt(s.adenaHour)}/h</span><span>${fmt(s.adena)} earned</span><span>${s.runs} runs</span><span>${fmt(s.traded)} traded</span></div>
        ${s.msg ? `<div class="muted qp-why">${h(s.msg)}</div>` : ''}</div>`).join('')}</div>` : '<div class="muted">No farm characters picked.</div>');
  }
  function renderFarmPlan() {
    const el = $id('qpFarmPlan'); if (!el || !QP.farm) return;
    const P = QP.farm.plan;
    if (!P || !(P.quests || []).length) { el.innerHTML = '<div class="muted">No plan yet — run <code>node docs/plan/tools/quest_farm_plan.js</code>.</div>'; return; }
    const L = P.quests.slice().sort((a, b) => (b.score || b.adenaHour || 0) - (a.score || a.adenaHour || 0));
    el.innerHTML = `<div class="qp-plan">${L.slice(0, 40).map(p => `<a class="qp-prow" href="#/quests/${p.id}"><span class="qp-lv">${h((p.levels || []).join('–'))}</span>
        <span class="qp-nm"><b>${h(p.name)}</b> <small class="muted">#${p.id}${p.startNpc ? ' · ' + h(p.startNpc.name) + (p.startNpc.town ? ', ' + h(p.startNpc.town) : '') : ''}</small>${(p.races || []).length ? ` <span class="qp-b qp-b-req">${h(p.races.join('/').toLowerCase())}</span>` : ''}</span>
        <span class="qp-kv"><span>${img('icon/etc_adena_i00', 'adena')} ${fmt(p.adenaHour)}/h</span>${p.valueHour ? `<span>+${fmt(p.valueHour)}/h items</span>` : ''}<span>${p.runMin != null ? Math.round(p.runMin) + ' min/run' : ''}</span></span>
        ${p.why ? `<span class="muted qp-why">${h(p.why)}</span>` : ''}</a>`).join('')}</div>`;
  }
  async function farmSave() {
    const sel = [...document.querySelectorAll('[data-qpf]')].filter(i => i.checked && !i.disabled).map(i => i.dataset.qpf);
    const body = { on: $id('qpfOn').checked, collector: $id('qpfCol').value, chars: sel, tradeAbove: Number($id('qpfAbove').value) || 0, keep: Number($id('qpfKeep').value) || 0 };
    const was = QP.farm && QP.farm.cfg || {};
    if (body.on && (!was.on || sel.join() !== (was.chars || []).join())) {
      const ok = await uiConfirm({ title: 'Quest farm', body: [uiP(`${sel.length} character${sel.length === 1 ? '' : 's'} will repeat adena quests for their level`, body.collector ? ` and trade adena above ${num(body.tradeAbove)} to ${body.collector}.` : ' (no collector: they keep the adena).'),
        uiList(sel.length ? sel : ['(nobody picked)']), uiNote('They stop leveling / following while they farm. Turn it off here to stop.')], confirmText: 'Turn farm on', cancelText: 'Cancel' });
      if (!ok) return;
    }
    try {
      const d = await api('/api/quests/farm', { method: 'POST', body: JSON.stringify(body) });
      if (d && d.ok) { QP.farm = d; renderFarm(); flash('Quest farm saved' + (d.cfg.on ? ' — ON' : ' — off')); }
      else flash((d && d.error) || 'save failed', true);
    } catch (e) { flash('save failed: ' + e.message, true); }
  }

  // =========================================================================================== beginner gear (forum topic 78, 2026-10-12)
  // GET /api/quests/beginner: Scripts/data/beginner_gear.json + the live plan (Dashboard/beginnergear_logic.js). Orders: !quest 174 solo <Name>,
  // !goto npc #<Newbie Guide> <Name>, /clicklink <coupon link> (L2Swarm command, the open NPC dialog). The multisell pick stays manual.
  const BG_V = { do: ['do', 'Worth doing now'], optional: ['maybe', 'Small gain — your call'], wait: ['later', 'Not yet'], done: ['done', 'Already done'], skip: ['skip', 'Not worth it'], gone: ['gone', 'No longer possible'], no: ['?', 'Unknown'] };
  const BG_T = { tutorial: 'Tutorial', supplyCheck: 'Supply Check', weaponCoupon: 'Weapon coupons', accessoryCoupon: 'Jewelry coupon' };
  async function loadBg() { try { const d = await api('/api/quests/beginner'); QP.bg = d; } catch (e) { QP.bg = { ok: false, error: e.message }; } }
  function bgNpc() { const v = store('bgNpc'); return Number(v) || 31077; }
  function renderBg() {
    const el = $id('qpBg'); if (!el) return;
    const B = QP.bg; if (!B) { el.innerHTML = '<span class="muted">loading…</span>'; return; }
    if (!B.ok) { el.innerHTML = `<div class="qp-msg bad">${h(B.error || 'failed')}</div>`; return; }
    const S = (B.data && B.data.steps) || {}, wc = S.weaponCoupon || {}, ac = S.accessoryCoupon || {}, sc = S.supplyCheck || {}, tu = S.tutorial || {};
    const lv = (x) => x && x.levels ? lvlTxt(x.levels.min, x.levels.max) : '';
    const its = (arr) => (arr || []).map(i => `${h(i.name)}${i.count > 1 ? ' x' + i.count : ''}`).join(', ');
    const guides = (wc.npcs || []).map(n => `<option value="${n.id}"${n.id === bgNpc() ? ' selected' : ''}>${h(n.town)} (#${n.id})</option>`).join('');
    el.innerHTML = `<div class="muted qp-fhelp">From the forum guide (topic 78), checked against the High Five datapack. Coupons and exchanges only work inside their level / class window — the weapon coupons end with the 1st class change. ${B.data.checks && B.data.checks.ok === false ? '<b>Data check failed — see beginner_gear.json checks.</b>' : ''}</div>
      <div class="qp-cards qp-bgchain">
        <div class="qp-card"><b>1 · ${h(tu.title || 'Tutorial')}</b> <span class="qp-b">lvl ${h(lv(tu))}</span><div class="qp-why">${h(tu.task || '')}</div><div class="muted qp-why">Manual: ${h(tu.engineWhy || '')}</div></div>
        <div class="qp-card"><b>2 · ${h(sc.title || 'Supply Check')}</b> <span class="qp-b">lvl ${h(lv(sc))}</span> <a href="#/quests/174">#174</a><div class="qp-why">${h(sc.town || '')}: ${(sc.npcs || []).map(n => h(n.name)).join(' → ')}</div>
          <div class="qp-kv"><span>${img('icon/etc_adena_i00', 'adena')} ${num(sc.reward && sc.reward.adena)}</span><span>${num(sc.reward && sc.reward.exp)} exp</span></div><div class="muted qp-why">${its(sc.reward && sc.reward.items)} (mystics on L2Toggle: leather robe)</div></div>
        <div class="qp-card"><b>3 · ${h(wc.title || 'Weapon coupons')}</b> <span class="qp-b">lvl ${h(lv(wc))}, base class</span><div class="qp-why">${(wc.weapons || []).map(w => `${img('icon/' + ({ 10474: 'weapon_apprentices_staff_i00', 10475: 'weapon_club_i00', 10476: 'weapon_shining_knife_i00', 10477: 'weapon_vipers_canine_i00', 10478: 'weapon_short_bow_i00', 10479: 'weapon_long_sword_i00' }[w.id] || ''), w.name)} ${h(String(w.name).replace('Shadow Item - ', ''))} <small class="muted">P${w.pAtk}/M${w.mAtk}</small>`).join(' · ')}</div><div class="muted qp-why">180 min of use each · ${h(wc.exchangeRule || '')}</div></div>
        <div class="qp-card"><b>4 · ${h(ac.title || 'Jewelry coupon')}</b> <span class="qp-b">lvl 20–39, 1st class</span><div class="qp-why">${its(ac.box && ac.box.contents)} (D, 180 min)</div></div>
      </div>
      <label class="qp-f"><span>Newbie Guide for the coupon buttons</span><select id="qpBgNpc">${guides}</select></label>
      <div class="qp-sub">Who should do what <small class="muted">(live from the characters' level / class / gear)</small></div><div id="qpBgPlan"></div>`;
    renderBgPlan();
  }
  function renderBgPlan() {
    const el = $id('qpBgPlan'); if (!el || !QP.bg || !QP.bg.ok) return;
    const P = QP.bg.plan || { rows: [] }, show = P.rows.filter(r => r.steps.some(s => /^(do|optional|wait)$/.test(s.verdict) && s.key !== 'tutorial'));
    const rest = P.rows.length - show.length;
    const btns = (r, s) => {
      const n = h(r.name);
      if (s.key === 'supplyCheck' && /^(do|optional)$/.test(s.verdict)) return `<button class="go" data-qp="bgquest" data-name="${n}">Start #174</button>`;
      if (s.key === 'weaponCoupon' && /^(do|optional)$/.test(s.verdict)) return `<button data-qp="bggo" data-name="${n}">Go to Newbie Guide</button><button data-qp="bglink" data-k="weaponCoupon" data-l="coupon" data-name="${n}">Get coupons</button><button data-qp="bglink" data-k="weaponCoupon" data-l="exchange" data-name="${n}">Open weapons</button>`;
      if (s.key === 'accessoryCoupon' && /^(do|optional)$/.test(s.verdict)) return `<button data-qp="bggo" data-name="${n}">Go to Newbie Guide</button><button data-qp="bglink" data-k="accessoryCoupon" data-l="coupon" data-name="${n}">Get coupon</button><button data-qp="bglink" data-k="accessoryCoupon" data-l="exchange" data-name="${n}">Open jewelry</button>`;
      return '';
    };
    put(el, show.length ? `<div class="qp-cards">${show.map(r => `<div class="qp-card qp-bgrow"><b>${h(r.name)}</b> <small>${r.level} ${h(r.cls)}</small>${r.online ? '' : ' <small class="muted">offline</small>'}
        ${r.steps.filter(s => s.key !== 'tutorial' && s.verdict !== 'gone' && s.verdict !== 'no').map(s => `<div class="qp-bgstep"><span class="qp-b qp-bgv-${h(s.verdict)}" title="${h((BG_V[s.verdict] || [])[1] || '')}">${h((BG_V[s.verdict] || [s.verdict])[0])}</span> <b>${h(BG_T[s.key] || s.key)}</b> <span class="muted qp-why">${h(s.why)}</span>
          <div class="qp-fbtn">${btns(r, s)}</div></div>`).join('')}</div>`).join('')}</div>${rest ? `<div class="muted">${rest} other character${rest === 1 ? '' : 's'}: nothing left to do (past level 19 / 39 or class too high).</div>` : ''}`
      : '<div class="muted">Nobody is in a beginner window right now.</div>');
  }
  async function bgOrder(kind, name, b) {
    const D = QP.bg && QP.bg.data, S = (D && D.steps) || {};
    if (kind === 'quest') {
      const cmd = `!quest 174 solo ${name}`;
      if (!(await uiConfirm({ title: 'Supply Check (quest 174)', body: [uiP(uiEm(name), ' travels to Kamael Village, talks to Marcela → Benis → Marcela → Nika → Marcela and gets the beginner armor, 2,466 adena and 5,672 exp.'), uiNote('Solo: it leaves its party’s follow while it quests.'), uiP('Command: ', uiCode(cmd))], confirmText: 'Start', cancelText: 'Cancel' }))) return;
      send(cmd, name); return;
    }
    if (kind === 'go') {
      const id = bgNpc(), g = ((S.weaponCoupon && S.weaponCoupon.npcs) || []).find(n => n.id === id) || { town: '#' + id };
      const cmd = `!goto npc #${id} ${name}`;
      if (!(await uiConfirm({ title: 'Go to the Newbie Guide', body: [uiP(uiEm(name), ` goes to the Newbie Guide in ${g.town} and opens its dialog.`), uiNote('Then use “Get coupon(s)” and “Open weapons / jewelry”. The pick in the exchange list is done in the game window (not automated).'), uiP('Command: ', uiCode(cmd))], confirmText: 'Go', cancelText: 'Cancel' }))) return;
      send(cmd, name); return;
    }
    if (kind === 'link') {
      const st = S[b.dataset.k] || {}, text = st.links && st.links[b.dataset.l];
      if (!text) { flash('no link text in beginner_gear.json', true); return; }
      const cmd = `/clicklink ${text}`;
      if (!(await uiConfirm({ title: b.dataset.l === 'coupon' ? 'Take the coupon' : 'Open the exchange list', body: [uiP(uiEm(name), ' clicks this link in its open Newbie Guide dialog:'), uiP(uiCode(text)),
        uiNote(b.dataset.l === 'coupon' ? 'Once per character. The weapon coupons only below level 20 with the base class; the jewelry coupon with the 1st class below 40.' : 'Opens the exchange list; pick the item there.'), uiWarn('The link text comes from the datapack; L2Toggle’s first dialog may need one click more (not verified live).')], confirmText: 'Click', cancelText: 'Cancel' }))) return;
      send(cmd, name);
    }
  }

  // =========================================================================================== orders
  async function send(cmd, name) {
    try {
      const d = await api('/api/command', { method: 'POST', body: JSON.stringify({ cmd, targets: ['char:' + name] }) });
      if (d && d.error) { flash(`${cmd}: ${d.error}`, true); return false; }
      flash(`Sent to ${name}: ${cmd}`);
      setTimeout(() => loadChars(true).then(() => { if (QP.sel) loadDetail(QP.sel, true).then(renderDetailChars); }), 4000);
      return true;
    } catch (e) { flash(`${cmd}: ${e.message}`, true); return false; }
  }
  async function startQuest(name) {
    const d = QP.det[QP.sel] && QP.det[QP.sel].d; if (!d || !d.ok) return;
    const q = d.quest, rep = /repeatable|daily/.test(q.type) || q.endless;
    const ri = document.querySelector(`[data-qpin="rep:${CSS.escape(name)}"]`), mi = document.querySelector(`[data-qpin="mode:${CSS.escape(name)}"]`);
    const n = rep && ri ? Math.max(0, Math.min(999, Math.round(Number(ri.value) || 0))) : 1, mode = mi ? mi.value : 'solo';
    const ch = (d.chars || []).find(c => c.name === name) || {};
    const cmd = `!quest ${q.id}${rep ? ` repeat ${n}` : ''} ${mode} ${name}`;
    const body = [uiP(uiEm(name), ` takes `, uiEm(`#${q.id} ${q.name}`), rep ? (n ? ` and repeats it ${n} time${n === 1 ? '' : 's'}.` : ' and repeats it forever (until stopped).') : '.'),
      uiP(mode === 'party' ? 'Party: the leader runs it, every member takes the quest too, hunts with him and hands in at the same NPC.' : 'Solo: only this character, it leaves its party’s follow while it quests.')];
    if (ch.elig === 'no') body.push(uiWarn(`Not eligible: ${ch.why}. The server will probably refuse.`));
    else if (ch.elig === 'maybe') body.push(uiNote(`Check: ${ch.why}`));
    if (ch.active && Number(ch.active.id) !== Number(q.id)) body.push(uiWarn(`${name} is busy with #${ch.active.id} ${ch.active.name || ''} — that one stops.`));
    body.push(uiP('Command: ', uiCode(cmd)));
    if (!(await uiConfirm({ title: `Start quest ${q.id}`, body, confirmText: 'Start', cancelText: 'Cancel' }))) return;
    send(cmd, name);
  }
  async function stopQuest(name) {
    if (!(await uiConfirm({ title: 'Stop the quest', body: [uiP(uiEm(name), ' stops its quest after the current action (the quest stays in its quest log; Start resumes it).')], confirmText: 'Stop', cancelText: 'Cancel' }))) return;
    send(`!quest stop ${name}`, name);
  }

  // =========================================================================================== events
  function onClick(e) {
    const b = e.target.closest('[data-qp]'); if (!b) return;
    const a = b.dataset.qp;
    if (a === 'back') { e.preventDefault(); if (typeof go === 'function') go('#/quests'); else location.hash = '#/quests'; return; }
    if (a === 'more') { QP.shown += 200; renderList(); return; }
    if (a === 'map') { QP.mapFocus = b.dataset.f; const d = QP.det[QP.sel] && QP.det[QP.sel].d; if (d && d.ok) renderMap(d); return; }
    if (a === 'start') { startQuest(b.dataset.name); return; }
    if (a === 'stop') { stopQuest(b.dataset.name); return; }
    if (a === 'status') { send(`!quest status ${b.dataset.name}`, b.dataset.name); return; }
    if (a === 'farmSave') { farmSave(); return; }
    if (a === 'bgquest') { bgOrder('quest', b.dataset.name, b); return; }
    if (a === 'bggo') { bgOrder('go', b.dataset.name, b); return; }
    if (a === 'bglink') { bgOrder('link', b.dataset.name, b); return; }
  }
  let inT = 0;
  function onInput(e) {
    const t = e.target, id = t.id, f = QP.f;
    if (id === 'qpBgNpc') { store('bgNpc', Number(t.value) || 31077); return; }
    if (!/^qp(Q|Lvl|Char|Type|Race|Sort|Adena)$/.test(id)) return;
    if (id === 'qpQ') f.q = t.value; else if (id === 'qpLvl') f.lvl = t.value; else if (id === 'qpChar') f.char = t.value;
    else if (id === 'qpType') f.type = t.value; else if (id === 'qpRace') f.race = t.value; else if (id === 'qpSort') f.sort = t.value; else if (id === 'qpAdena') f.adena = t.checked;
    store('f', f); QP.shown = 120;
    clearTimeout(inT); inT = setTimeout(renderList, id === 'qpQ' ? 160 : 0);
  }

  window.QuestPage = { route, open, close, _qp: QP };
})();
