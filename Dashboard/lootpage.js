// LOOT page #/loot (LOOTLOG-2026-10-23; public tester Vykaax: "A loot tracking tab with filters would be nice, to see all recently looted items
// (filter by grade, type (weapon / armor) etc with time and date and who looted it").
// LOOTPAGE2-2026-10-24 (owner: "it should be much more nice and user friendly. It should also show total loot"):
//   time chips -> four big totals (items, worth at a shop, kinds, spoiled) -> grade chips (tap = filter) -> parties with their share (tap = filter)
//   -> [Totals] every item kind once with its count / worth / who got most, best grade first  |  [Every pick-up] the list, newest first.
// Data: /api/loot (Dashboard/lootpage_api.js, read only; worth = datapack shop price / 2 from Dashboard/data/item_prices.json).
// Uses index.html globals: api, stopChar, TAB, iconUrl. In-game icons only (owner 2026-10-17), phone-first.
(function () {
  'use strict';
  const SEC = 'tab-loot';
  const S = { open: false, hours: 24, who: '', grade: '', type: '', how: '', q: '', src: '', view: 'totals', d: null, poll: 0, seq: 0 };
  // LOOTSRC-2026-10-24 (owner: "separate raidboss loot and normal hunting loot and circuit loot"): one button per source, with its totals
  const SOURCES = [['', 'All loot', 'icon/etc_treasure_box_i00'], ['raid', 'Raid bosses', 'icon/skill1363'], ['circuit', 'Raid circuit', 'icon/etc_scroll_of_return_i00'], ['hunt', 'Hunting', 'icon/weapon_long_sword_i00'], ['other', 'Other', 'icon/etc_pouch_gray_i00']];
  try { const v = localStorage.getItem('lootView'); if (v === 'totals' || v === 'list') S.view = v; } catch (e) { }
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (p) => typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png';
  const gim = (p, c) => `<img class="gim${c ? ' ' + c : ''}" src="${ico(p)}" alt="">`;
  const GRADE_COLOR = { NONE: '#6b6b6b', D: '#4f8fd6', C: '#3fa35a', B: '#c9a23a', A: '#c96a2a', S: '#c43c3c', S80: '#c43c3c', S84: '#c43c3c' };
  const GRADE_ORDER = ['S84', 'S80', 'S', 'A', 'B', 'C', 'D', 'NONE'];
  const TIMES = [[1, 'Last hour'], [24, 'Today'], [72, '3 days'], [168, '7 days']];
  const TYPES = [['', 'Everything'], ['weapon', 'Weapons'], ['armor', 'Armor'], ['jewel', 'Jewels'], ['other', 'Materials & other']];
  const HOWS = [['', 'Picked up + spoiled'], ['loot', 'Picked up'], ['spoil', 'Spoiled']];
  const n0 = (n) => Number(n || 0).toLocaleString('en-US');
  const adena = (n) => { n = Number(n || 0); return n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + ' bn' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' M' : n >= 1e4 ? Math.round(n / 1e3) + ' k' : n0(n); };

  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win itp lootp'; s.hidden = true;
    s.innerHTML = `<style>
      .lootp .lp-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}
      .lootp select,.lootp input[type=search]{min-height:40px}
      .lootp input[type=search]{flex:1 1 180px;min-width:0}
      .lootp .lp-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0}
      @media (max-width:560px){.lootp .lp-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .lootp .lp-tile{background:rgba(0,0,0,.28);border:1px solid rgba(201,162,58,.35);border-radius:8px;padding:10px 10px 8px;display:flex;gap:8px;align-items:center;min-width:0}
      .lootp .lp-tile img{width:32px;height:32px;flex:none}
      .lootp .lp-tile b{display:block;font-size:20px;line-height:1.1;color:#f2d98a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .lootp .lp-tile span{font-size:12px;opacity:.75}
      .lootp .lp-g{display:inline-block;min-width:22px;padding:1px 6px;border-radius:4px;color:#fff;font-size:11px;font-weight:700;text-align:center;vertical-align:middle}
      .lootp .lp-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
      .lootp .lp-chip{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:2px 10px;border-radius:18px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.25);color:inherit;cursor:pointer;font-size:13px}
      .lootp .lp-chip.on{border-color:#e7c35a;box-shadow:0 0 0 1px #e7c35a inset}
      .lootp .lp-parties{display:flex;flex-direction:column;gap:4px;margin:8px 0}
      .lootp .lp-pt{display:grid;grid-template-columns:minmax(0,9em) minmax(0,1fr) auto;gap:8px;align-items:center;min-height:36px;cursor:pointer;background:none;border:0;color:inherit;text-align:left;padding:0 2px}
      .lootp .lp-pt.on .lp-ptn{color:#e7c35a}
      .lootp .lp-ptn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
      .lootp .lp-bar{height:10px;border-radius:5px;background:rgba(255,255,255,.08);overflow:hidden}
      .lootp .lp-bar i{display:block;height:100%;background:linear-gradient(90deg,#8c6a1f,#e7c35a)}
      .lootp .lp-ptv{font-size:12px;opacity:.85;white-space:nowrap}
      .lootp .lp-views{display:flex;gap:0;margin:10px 0 6px;border:1px solid rgba(201,162,58,.45);border-radius:8px;overflow:hidden;width:max-content;max-width:100%}
      .lootp .lp-views button{min-height:40px;padding:0 16px;background:rgba(0,0,0,.25);color:inherit;border:0;cursor:pointer;font-size:14px}
      .lootp .lp-views button.on{background:rgba(201,162,58,.28);color:#f2d98a;font-weight:700}
      .lootp .lp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
      .lootp .lp-card{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);min-height:56px}
      .lootp .lp-card img{width:40px;height:40px}
      .lootp .lp-card.gr-top{border-color:rgba(231,195,90,.55)}
      .lootp .lp-nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
      .lootp .lp-sub{font-size:12px;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lootp .lp-cnt{text-align:right;white-space:nowrap}
      .lootp .lp-cnt b{display:block;font-size:17px;color:#f2d98a}
      .lootp .lp-cnt span{font-size:12px;opacity:.75}
      .lootp .lp-list{display:flex;flex-direction:column}
      .lootp .lp-it{display:grid;grid-template-columns:48px 32px minmax(0,1fr) auto;gap:8px;align-items:center;padding:5px 2px;border-bottom:1px solid rgba(255,255,255,.07);min-height:44px}
      .lootp .lp-it img{width:32px;height:32px}
      .lootp .lp-t{font-size:12px;opacity:.75;line-height:1.2}
      .lootp .lp-r{text-align:right;font-size:12px;white-space:nowrap}
      .lootp .lp-spoil{font-size:11px;padding:0 5px;border:1px solid #c9a23a;border-radius:4px;color:#c9a23a;margin-left:4px}
      .lootp details.lp-more summary{cursor:pointer;min-height:40px;display:flex;align-items:center;gap:6px}
      .lootp .lp-h3{margin:12px 0 4px;font-size:14px;color:#e7c35a}
      .lootp .lp-empty{padding:18px 6px;opacity:.85}
    </style>
    <div class="itp-head"><h2>${gim('icon/etc_treasure_box_i00')} Loot</h2></div>
    <div id="lpTimes"></div><div id="lpSum"></div><div id="lpFilters"></div><div id="lpList"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('change', onInput); s.addEventListener('input', onInput);
    return s;
  }
  function route(kind) { if (kind === 'loot') { open(); return true; } close(); return false; }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'loot'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'loot')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true;
    renderTimes(); renderFilters(); load();
    clearInterval(S.poll); S.poll = setInterval(() => { if (S.open && !document.hidden) load(); }, 20000);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.poll); const s = $id(SEC); if (s) s.hidden = true; }
  async function load() {
    const my = ++S.seq;
    const qs = `hours=${S.hours}&who=${encodeURIComponent(S.who)}&grade=${S.grade}&type=${S.type}&how=${S.how}&q=${encodeURIComponent(S.q)}&src=${S.src}`;
    try { const d = await api('/api/loot?' + qs); if (my !== S.seq) return; if (d && !d.error) { S.d = d; renderFilters(); render(); } } catch (e) { }
  }
  const sel = (key, list, cur, label) => `<select data-lp="${key}" aria-label="${label}">${list.map(([v, t]) => `<option value="${h(v)}"${String(cur) === String(v) ? ' selected' : ''}>${h(t)}</option>`).join('')}</select>`;
  function renderTimes() {
    const el = $id('lpTimes'); if (!el) return;
    el.innerHTML = `<div class="lp-row">${TIMES.map(([v, t]) => `<button type="button" class="itp-chip${S.hours === v ? ' on' : ''}" data-lphours="${v}">${t}</button>`).join('')}</div>`;
  }
  function renderFilters() {
    const el = $id('lpFilters'); if (!el) return;
    const d = S.d || {}, whoList = [['', 'Everyone']].concat((d.parties || []).map(p => [p, 'Party ' + p])).concat((d.people || []).map(p => [p, p]));
    const focus = document.activeElement && document.activeElement.id === 'lpQ', pos = focus ? document.activeElement.selectionStart : 0;
    const active = [S.who, S.type, S.how].filter(Boolean).length;
    el.innerHTML = `<div class="lp-views" role="tablist">
        <button type="button" data-lpview="totals" class="${S.view === 'totals' ? 'on' : ''}">Totals</button>
        <button type="button" data-lpview="list" class="${S.view === 'list' ? 'on' : ''}">Every pick-up</button></div>
      <div class="lp-row"><input type="search" id="lpQ" placeholder="Find an item…" value="${h(S.q)}" aria-label="Find an item"></div>
      <details class="lp-more"${active ? ' open' : ''}><summary>More filters${active ? ` (${active} on)` : ''}</summary>
        <div class="lp-row">${sel('who', whoList, S.who, 'Who')}${sel('type', TYPES, S.type, 'Kind')}${sel('how', HOWS, S.how, 'Picked up or spoiled')}
        ${active || S.grade || S.q ? '<button type="button" class="itp-chip" data-lpclear="1">Clear filters</button>' : ''}</div></details>`;
    if (focus) { const x = $id('lpQ'); if (x) { x.focus(); try { x.setSelectionRange(pos, pos); } catch (e) { } } }
  }
  const gradeTag = (g) => g && g !== 'NONE' ? `<span class="lp-g" style="background:${GRADE_COLOR[g] || '#777'}">${h(g)}</span>` : '';
  const when = (iso) => { const t = new Date(iso), today = new Date().toDateString() === t.toDateString(); return `${t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${today ? '' : '<br>' + t.toLocaleDateString([], { day: 'numeric', month: 'short' })}`; };
  const tLabel = () => (TIMES.find(t => t[0] === S.hours) || [0, ''])[1].toLowerCase();
  /** LOOTSRC-2026-10-24: All / Raid bosses / Raid circuit / Hunting / Other, each with what it is worth at a shop (the other filters applied) */
  function srcBar(sm) {
    const BS = (sm && sm.bySrc) || {}, allN = Object.values(BS).reduce((a, x) => a + x.count, 0), allV = Object.values(BS).reduce((a, x) => a + x.value, 0);
    return `<div class="lp-views lp-src" role="tablist" aria-label="Where the loot came from">${SOURCES.map(([v, t]) => { const x = v ? BS[v] : { count: allN, value: allV };
      return `<button type="button" role="tab" data-lpsrc="${v}" class="${S.src === v ? 'on' : ''}" title="${h(t)}: ${x ? n0(x.count) + ' items, ' + adena(x.value) + ' adena at a shop' : 'nothing yet'}">${h(t)}<br><small>${x ? adena(x.value) : '—'}</small></button>`; }).join('')}</div>`;
  }
  function render() {
    const d = S.d; if (!d) { $id('lpList').innerHTML = '<div class="muted">Loading…</div>'; return; }
    const sm = d.summary || {}, items = sm.items || [];
    if (!d.rows.length) {
      $id('lpSum').innerHTML = srcBar(sm);   // LOOTSRC: the source buttons stay (a source without loot must not trap the page)
      $id('lpList').innerHTML = `<div class="itp-note lp-empty">${d.recording ? `Nothing found ${h(tLabel())}${S.who || S.grade || S.type || S.how || S.q ? ' with these filters' : ''}.` : 'No loot recorded yet. Every character writes down what it picks up or spoils as soon as it runs the new version.'}</div>`;
      return;
    }
    const kinds = items.length, spoiled = sm.spoiled || 0;
    const tiles = [
      ['icon/etc_treasure_box_i00', n0(sm.total), `items picked up ${h(tLabel())}`],
      ['icon/etc_adena_i00', adena(sm.value), 'worth at a shop (adena)'],
      ['icon/etc_pouch_gray_i00', n0(kinds), 'different items'],
      ['icon/skill0254', n0(spoiled), 'spoiled (Sweeper)'],
    ];
    const gradeChips = GRADE_ORDER.filter(g => sm.byGrade && sm.byGrade[g]).map(g => `<button type="button" class="lp-chip${S.grade === (g.startsWith('S') ? 'S' : g) ? ' on' : ''}" data-lpgrade="${g.startsWith('S') ? 'S' : g}">${gradeTag(g) || '<span class="lp-g" style="background:#6b6b6b">no grade</span>'} ${n0(sm.byGrade[g])}</button>`).join('');
    const parties = (sm.byParty || []).slice(0, 12), maxV = Math.max(1, ...parties.map(p => p.value || p.count));
    const partyHtml = parties.length > 1 || S.who ? `<div class="lp-h3">Who got it</div><div class="lp-parties">${parties.map(p => `<button type="button" class="lp-pt${S.who && S.who.toLowerCase() === String(p.party).toLowerCase() ? ' on' : ''}" data-lpwho="${h(p.party)}" title="Show only party ${h(p.party)}">
        <span class="lp-ptn">Party ${h(p.party)}</span><span class="lp-bar"><i style="width:${Math.max(3, Math.round(100 * (p.value || p.count) / maxV))}%"></i></span><span class="lp-ptv">${adena(p.value)} · ${n0(p.count)}</span></button>`).join('')}</div>` : '';
    $id('lpSum').innerHTML = srcBar(sm) + `<div class="lp-tiles">${tiles.map(([ic, v, t]) => `<div class="lp-tile">${gim(ic)}<div style="min-width:0"><b>${v}</b><span>${t}</span></div></div>`).join('')}</div>
      ${gradeChips ? `<div class="lp-chips">${gradeChips}${S.grade ? '<button type="button" class="lp-chip" data-lpgrade="">every grade</button>' : ''}</div>` : ''}${partyHtml}`;
    if (S.view === 'totals') {
      $id('lpList').innerHTML = `<div class="lp-grid">${items.map(it => {
        const top = /^(S|A|B)/.test(it.grade) && it.type !== 'other';
        const by = it.topWho ? `${h(it.topWho)}${it.people > 1 ? ` +${it.people - 1} more` : ''}` : '';
        return `<div class="lp-card${top ? ' gr-top' : ''}">${it.icon ? `<img src="${ico(it.icon)}" alt="" loading="lazy">` : '<span></span>'}
          <div style="min-width:0"><div class="lp-nm">${h(it.name)} ${gradeTag(it.grade)}${it.spoiled ? '<span class="lp-spoil">spoiled</span>' : ''}</div>
          <div class="lp-sub">${by}${it.value ? ' · ' + adena(it.value) + ' adena' : ''}</div></div>
          <div class="lp-cnt"><b>×${n0(it.count)}</b><span>${n0(it.pickups)} time${it.pickups === 1 ? '' : 's'}</span></div></div>`;
      }).join('')}</div>${kinds >= 600 ? '<div class="muted">The 600 best items are shown — use the filters to narrow it down.</div>' : ''}`;
      return;
    }
    $id('lpList').innerHTML = `<div class="lp-list">${d.rows.map(r => `<div class="lp-it"><span class="lp-t">${when(r.at)}</span>${r.icon ? `<img src="${ico(r.icon)}" alt="" loading="lazy">` : '<span></span>'}
      <div style="min-width:0"><div class="lp-nm">${h(r.name)}${r.count > 1 ? ` <b>×${n0(r.count)}</b>` : ''} ${gradeTag(r.grade)}${r.how === 'spoil' ? '<span class="lp-spoil">spoiled</span>' : ''}</div>
      <div class="lp-sub"><a href="#/char/${encodeURIComponent(r.who)}">${h(r.who)}</a>${r.party && r.party !== r.who ? ' · party ' + h(r.party) : ''}${r.place ? ' · ' + h(r.place) : ''}${r.value ? ' · ' + adena(r.value) : ''}</div></div>
      <a class="lp-r" href="#/items/${encodeURIComponent(r.who)}" title="Open ${h(r.who)}'s items">${gim('icon/etc_equip_item_box_i00')}</a></div>`).join('')}</div>${d.more ? `<div class="muted">${n0(d.more)} more — narrow it down with the filters.</div>` : ''}`;
  }
  function onClick(e) {
    const b = e.target.closest('[data-lphours],[data-lpview],[data-lpgrade],[data-lpwho],[data-lpclear],[data-lpsrc]'); if (!b) return;
    if (b.dataset.lpsrc !== undefined) { S.src = b.dataset.lpsrc; load(); return; }   // LOOTSRC-2026-10-24
    if (b.dataset.lphours) { S.hours = Number(b.dataset.lphours) || 24; renderTimes(); load(); return; }
    if (b.dataset.lpview) { S.view = b.dataset.lpview; try { localStorage.setItem('lootView', S.view); } catch (er) { } renderFilters(); render(); return; }
    if (b.dataset.lpgrade !== undefined) { S.grade = S.grade === b.dataset.lpgrade ? '' : b.dataset.lpgrade; load(); return; }
    if (b.dataset.lpwho !== undefined) { S.who = S.who.toLowerCase() === b.dataset.lpwho.toLowerCase() ? '' : b.dataset.lpwho; load(); return; }
    if (b.dataset.lpclear) { Object.assign(S, { who: '', grade: '', type: '', how: '', q: '' }); load(); }
  }
  let qT = 0;
  function onInput(e) {
    const t = e.target;
    if (t.id === 'lpQ') { S.q = t.value; clearTimeout(qT); qT = setTimeout(load, 300); return; }
    if (t.dataset && t.dataset.lp && e.type === 'change') { S[t.dataset.lp] = t.value; load(); }
  }
  window.LootPage = { route, open, close, _state: S };
})();
