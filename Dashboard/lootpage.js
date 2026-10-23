// LOOT page #/loot (LOOTLOG-2026-10-23; public tester Vykaax: "Was it selling loot that I hadn't even seen yet ... A loot tracking tab with
// filters would be nice, to see all recently looted items (filter by grade, type (weapon / armor) etc with time and date and who looted it").
// Compact: one filter row (time · who · grade · type · picked up / spoiled · search), a short summary, then the list (newest first).
// Data: /api/loot (Dashboard/lootpage_api.js, read only). Uses index.html globals: api, stopChar, TAB, iconUrl.
(function () {
  'use strict';
  const SEC = 'tab-loot';
  const S = { open: false, hours: 24, who: '', grade: '', type: '', how: '', q: '', d: null, poll: 0, seq: 0 };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (p) => typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png';
  const gim = (p, c) => `<img class="gim${c ? ' ' + c : ''}" src="${ico(p)}" alt="">`;   // in-game icons only (owner 2026-10-17)
  const GRADE_COLOR = { NONE: '#777', D: '#4f8fd6', C: '#3fa35a', B: '#c9a23a', A: '#c96a2a', S: '#b33', S80: '#b33', S84: '#b33' };
  const TIMES = [[1, '1 hour'], [24, 'Today'], [72, '3 days'], [168, '7 days']];
  const GRADES = [['', 'Every grade'], ['NONE', 'No grade'], ['D', 'D'], ['C', 'C'], ['B', 'B'], ['A', 'A'], ['S', 'S / S80 / S84']];
  const TYPES = [['', 'Everything'], ['weapon', 'Weapons'], ['armor', 'Armor'], ['jewel', 'Jewels'], ['other', 'Materials & other']];
  const HOWS = [['', 'Picked up + spoiled'], ['loot', 'Picked up'], ['spoil', 'Spoiled']];
  const n0 = (n) => Number(n || 0).toLocaleString('en-US');

  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win itp lootp'; s.hidden = true;
    s.innerHTML = `<style>
      .lootp .lp-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}
      .lootp select,.lootp input[type=search]{min-height:36px}
      .lootp input[type=search]{flex:1 1 160px;min-width:0}
      .lootp .lp-sum{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0;font-size:13px}
      .lootp .lp-g{display:inline-block;min-width:22px;padding:1px 6px;border-radius:4px;color:#fff;font-size:11px;font-weight:700;text-align:center}
      .lootp .lp-list{display:flex;flex-direction:column}
      .lootp .lp-it{display:grid;grid-template-columns:48px 32px minmax(0,1fr) auto;gap:8px;align-items:center;padding:5px 2px;border-bottom:1px solid rgba(255,255,255,.07);min-height:44px}
      .lootp .lp-it img{width:32px;height:32px}
      .lootp .lp-t{font-size:12px;opacity:.75;line-height:1.2}
      .lootp .lp-nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lootp .lp-sub{font-size:12px;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lootp .lp-r{text-align:right;font-size:12px;white-space:nowrap}
      .lootp .lp-spoil{font-size:11px;padding:0 5px;border:1px solid #c9a23a;border-radius:4px;color:#c9a23a;margin-left:4px}
      .lootp details summary{cursor:pointer;min-height:36px;display:flex;align-items:center}
      .lootp .lp-top{display:flex;flex-wrap:wrap;gap:6px}.lootp .lp-top span{display:inline-flex;align-items:center;gap:4px;font-size:12px}
      .lootp .lp-top img{width:24px;height:24px}
    </style>
    <div class="itp-head"><h2>${gim('icon/etc_treasure_box_i00')} Loot</h2></div>
    <div id="lpFilters"></div><div id="lpSum"></div><div id="lpList"></div>`;
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
    renderFilters(); load();
    clearInterval(S.poll); S.poll = setInterval(() => { if (S.open && !document.hidden) load(); }, 20000);
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.poll); const s = $id(SEC); if (s) s.hidden = true; }
  async function load() {
    const my = ++S.seq;
    const qs = `hours=${S.hours}&who=${encodeURIComponent(S.who)}&grade=${S.grade}&type=${S.type}&how=${S.how}&q=${encodeURIComponent(S.q)}`;
    try { const d = await api('/api/loot?' + qs); if (my !== S.seq) return; if (d && !d.error) { S.d = d; renderFilters(); render(); } } catch (e) { }
  }
  const sel = (key, list, cur) => `<select data-lp="${key}" aria-label="${key}">${list.map(([v, t]) => `<option value="${h(v)}"${String(cur) === String(v) ? ' selected' : ''}>${h(t)}</option>`).join('')}</select>`;
  function renderFilters() {
    const el = $id('lpFilters'); if (!el) return;
    const d = S.d || {}, whoList = [['', 'Everyone']].concat((d.parties || []).map(p => [p, 'Party ' + p])).concat((d.people || []).map(p => [p, p]));
    const focus = document.activeElement && document.activeElement.id === 'lpQ', pos = focus ? document.activeElement.selectionStart : 0;
    el.innerHTML = `<div class="lp-row">${TIMES.map(([v, t]) => `<button type="button" class="itp-chip${S.hours === v ? ' on' : ''}" data-lphours="${v}">${t}</button>`).join('')}</div>
      <div class="lp-row">${sel('who', whoList, S.who)}${sel('grade', GRADES, S.grade)}${sel('type', TYPES, S.type)}${sel('how', HOWS, S.how)}
      <input type="search" id="lpQ" placeholder="Search an item…" value="${h(S.q)}" aria-label="Search an item"></div>`;
    if (focus) { const x = $id('lpQ'); if (x) { x.focus(); try { x.setSelectionRange(pos, pos); } catch (e) { } } }
  }
  const when = (iso) => { const t = new Date(iso), today = new Date().toDateString() === t.toDateString(); return `${t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${today ? '' : '<br>' + t.toLocaleDateString([], { day: 'numeric', month: 'short' })}`; };
  const gradeTag = (g) => g && g !== 'NONE' ? `<span class="lp-g" style="background:${GRADE_COLOR[g] || '#777'}">${h(g)}</span>` : '';
  function render() {
    const d = S.d; if (!d) { $id('lpList').innerHTML = '<div class="muted">Loading…</div>'; return; }
    const sm = d.summary || {};
    const gl = ['S84', 'S80', 'S', 'A', 'B', 'C', 'D', 'NONE'].filter(g => sm.byGrade && sm.byGrade[g]).map(g => `${gradeTag(g) || '<span class="lp-g" style="background:#777">–</span>'} ${n0(sm.byGrade[g])}`).join(' &nbsp;');
    $id('lpSum').innerHTML = d.rows.length ? `<div class="lp-sum"><b>${n0(sm.total)}</b> items in ${d.rows.length + (d.more || 0)} pick-ups &nbsp;·&nbsp; ${gl}</div>
      ${(sm.top || []).length ? `<details><summary>Most looted</summary><div class="lp-top">${sm.top.map(t => `<span>${t.icon ? `<img src="${ico(t.icon)}" alt="">` : ''}${h(t.name)} ×${n0(t.count)}</span>`).join('')}</div></details>` : ''}` : '';
    if (!d.rows.length) {
      $id('lpList').innerHTML = `<div class="itp-note">${d.recording ? 'Nothing matches these filters.' : 'No loot recorded yet. Every character writes down what it picks up or spoils from now on (after the bots run the new version).'}</div>`;
      return;
    }
    $id('lpList').innerHTML = `<div class="lp-list">${d.rows.map(r => `<div class="lp-it"><span class="lp-t">${when(r.at)}</span>${r.icon ? `<img src="${ico(r.icon)}" alt="" loading="lazy">` : '<span></span>'}
      <div style="min-width:0"><div class="lp-nm">${h(r.name)}${r.count > 1 ? ` <b>×${n0(r.count)}</b>` : ''} ${gradeTag(r.grade)}${r.how === 'spoil' ? '<span class="lp-spoil">spoiled</span>' : ''}</div>
      <div class="lp-sub"><a href="#/char/${encodeURIComponent(r.who)}">${h(r.who)}</a>${r.party && r.party !== r.who ? ' · party ' + h(r.party) : ''}${r.place ? ' · ' + h(r.place) : ''}</div></div>
      <a class="lp-r" href="#/items/${encodeURIComponent(r.who)}" title="Open ${h(r.who)}'s items">${gim('icon/etc_equip_item_box_i00')}</a></div>`).join('')}</div>${d.more ? `<div class="muted">${n0(d.more)} more — narrow it with the filters.</div>` : ''}`;
  }
  function onClick(e) { const b = e.target.closest('[data-lphours]'); if (b) { S.hours = Number(b.dataset.lphours) || 24; renderFilters(); load(); } }
  let qT = 0;
  function onInput(e) {
    const t = e.target;
    if (t.id === 'lpQ') { S.q = t.value; clearTimeout(qT); qT = setTimeout(load, 300); return; }
    if (t.dataset && t.dataset.lp && e.type === 'change') { S[t.dataset.lp] = t.value; load(); }
  }
  window.LootPage = { route, open, close, _state: S };
})();
