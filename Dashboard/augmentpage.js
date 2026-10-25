// LIFE STONES page #/augments (AUGTABLE-2026-10-25; owner: "Show me all life stones and all augmentation you can get from each level life stone
// and quality grade. I wanna see everything I can get and all the life stones that we have"). Phone first.
//   1. the stones: a grid level x grade (Normal / Mid / High / Top) for weapons, and the jewelry stones; each cell = how many we have (tap = open)
//   2. one stone: fighter weapon / mage weapon (or jewelry); line 1 and line 2 with every possible bonus, its kind (skill: active / passive /
//      chance, base stat, stat) and its chance; search + kind filter; who holds that stone (bag / warehouse / clan warehouse)
// Data: GET /api/augments, GET /api/augments/stone?id=&type= (Dashboard/augment_api.js <- Scripts/data/augment_table.json). Read-only.
// Uses index.html globals when present (api, stopChar, TAB).
(function () {
  'use strict';
  const SEC = 'tab-augments';
  const S = { open: false, d: null, stone: null, type: '', q: '', kind: 'all', sel: null, seq: 0 };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GR = ['normal', 'mid', 'high', 'top'], GRN = { normal: 'Normal', mid: 'Mid', high: 'High', top: 'Top' };
  const KN = { active: 'Active skill', passive: 'Passive skill', chance: 'Chance skill', base: 'Base stat', stat: 'Stats' };
  const KC = { active: '#4aa3ff', passive: '#c07bff', chance: '#ff6b6b', base: '#f2c94c', stat: '#9aa5b1' };
  const get = async (u) => { if (typeof api === 'function') return api(u); const k = new URLSearchParams(location.search).get('key'); const r = await fetch(u + (k ? (u.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(k) : '')); return r.json(); };
  const pct = (p) => p >= 1 ? p.toFixed(1) + '%' : p >= 0.1 ? p.toFixed(2) + '%' : p >= 0.01 ? p.toFixed(3) + '%' : p.toFixed(4) + '%';
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win augp'; s.hidden = true;
    s.innerHTML = `<style>
      .augp .ag-grid{display:grid;grid-template-columns:auto repeat(4,minmax(0,1fr));gap:4px;align-items:stretch}
      .augp .ag-c{border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:6px 4px;text-align:center;cursor:pointer;background:rgba(255,255,255,.03);min-height:44px}
      .augp .ag-c b{display:block;font-size:15px}.augp .ag-c small{opacity:.7;font-size:11px}.augp .ag-c.zero{opacity:.45}.augp .ag-c.on{outline:2px solid var(--gold,#c9a54a)}
      .augp .ag-h{font-weight:bold;padding:6px 4px;text-align:center;opacity:.85}.augp .ag-l{font-weight:bold;padding:12px 6px 0 0;white-space:nowrap}
      .augp .ag-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0}.augp .ag-bar input{flex:1 1 160px;min-width:0;font-size:16px}
      .augp .ag-o{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;padding:6px 0;border-top:1px solid rgba(255,255,255,.06)}
      .augp .ag-k{display:inline-block;font-size:11px;padding:1px 6px;border-radius:8px;margin-right:6px;color:#111}
      .augp .ag-p{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}.augp .ag-cat{opacity:.75;margin:10px 0 2px;font-size:13px}
      .augp .ag-hold{display:flex;flex-wrap:wrap;gap:4px}.augp button.on{outline:1px solid var(--gold,#c9a54a)}
      @media (max-width:520px){.augp .ag-l{padding-top:10px;font-size:13px}.augp .ag-c b{font-size:14px}}
    </style><div class="whead"><h2>Life Stones &amp; augmentations</h2><span class="muted" id="agSub"></span></div><div id="agBody"><div class="muted">loading…</div></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('input', onInput);
    return s;
  }
  function route(kind, arg) { if (kind === 'augments') { open(arg); return true; } close(); return false; }
  function open(arg) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'augments'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'augments')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; window.scrollTo(0, 0);
    const id = Number(arg) || 0;
    load().then(() => { if (id) pick(id); });
  }
  function close() { if (!S.open) return; S.open = false; const s = $id(SEC); if (s) s.hidden = true; }
  async function load() { try { S.d = await get('/api/augments'); } catch (e) { S.d = { error: e.message }; } render(); }
  async function pick(id, type) {
    const q = ++S.seq; S.stone = id;
    try { const r = await get(`/api/augments/stone?id=${id}${type ? '&type=' + type : ''}`); if (q !== S.seq) return; S.sel = r; S.type = r.type; } catch (e) { S.sel = { error: e.message }; }
    render(); const el = $id('agStone'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function cell(s) {
    if (!s) return '<div class="ag-c zero" style="cursor:default"><small>—</small></div>';
    const n = s.have.total;
    return `<div class="ag-c${n ? '' : ' zero'}${S.stone === s.id ? ' on' : ''}" data-ag="${s.id}" title="${h(s.name)}"><b>${n.toLocaleString()}</b><small>${n ? 'in stock' : 'none'}</small></div>`;
  }
  function grid(list, title) {
    const lv = [...new Set(list.map(s => s.level))].sort((a, b) => a - b);
    return `<div class="box"><h3>${h(title)}</h3><div class="muted" style="margin-bottom:6px">How many we have (bag + warehouse + clan warehouse of every character). Tap a stone to see everything it can give. Every grade gives a skill about 1 time in 10; higher grades and levels give stronger stats and higher skill levels.</div>
      <div class="ag-grid"><div></div>${GR.map(g => `<div class="ag-h">${GRN[g]}</div>`).join('')}
      ${lv.map(l => `<div class="ag-l">Lv ${l}</div>${GR.map(g => cell(list.find(s => s.level === l && s.grade === g))).join('')}`).join('')}</div></div>`;
  }
  function stoneView() {
    const r = S.sel; if (!r) return '';
    if (r.error) return `<div class="box" id="agStone">${h(r.error)}</div>`;
    const st = (S.d.stones || []).find(s => s.id === r.stone.id) || { have: { total: 0, holders: [] } };
    const q = S.q.trim().toLowerCase();
    const show = (o) => (S.kind === 'all' || o.kind === S.kind || (S.kind === 'skill' && /active|passive|chance/.test(o.kind))) && (!q || o.text.toLowerCase().includes(q));
    const tn = { warrior: 'Fighter weapon', mage: 'Mage weapon', accessory: 'Jewelry' };
    const lines = r.lines.map(L => {
      const tot = {}; L.cats.forEach(c => c.opts.forEach(o => { tot[o.kind] = (tot[o.kind] || 0) + o.pct; }));
      const sum = Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="ag-k" style="background:${KC[k]}">${KN[k]}</span>${pct(v)}`).join(' &nbsp;');
      const rows = L.cats.map(c => { const os = c.opts.filter(show); if (!os.length) return '';
        return `<div class="ag-cat">${c.p}% of the time this group (${c.opts.length} options):</div>` + os.map(o => `<div class="ag-o"><div><span class="ag-k" style="background:${KC[o.kind]}">${KN[o.kind]}</span>${h(o.text)}</div><div class="ag-p">${pct(o.pct)}</div></div>`).join(''); }).join('');
      return `<div class="box" style="margin-top:8px"><h3>Line ${L.line}</h3><div class="muted" style="margin-bottom:4px">${sum}</div>${rows || '<div class="muted">nothing matches</div>'}</div>`;
    }).join('');
    const hold = st.have.holders.length ? `<div class="ag-hold">${st.have.holders.map(x => `<span class="chip">${h(x.name)}: ${x.total.toLocaleString()}${x.where && x.where.length && x.kind !== 'clan' ? ' (' + x.where.join(', ') + ')' : ''}</span>`).join('')}</div>` : '<span class="muted">we have none</span>';
    return `<div id="agStone" style="margin-top:10px"><div class="box"><h3>${h(r.stone.name)}</h3><div style="margin-bottom:6px">We have <b>${st.have.total.toLocaleString()}</b> ${hold}</div>
      <div class="ag-bar">${r.types.map(t => `<button class="${t === r.type ? 'on' : ''}" data-agt="${t}">${tn[t] || t}</button>`).join('')}</div>
      <div class="muted">${h(r.note || '')} Mage weapons (staffs, magic swords, …) use the mage table; everything else the fighter table.</div>
      <div class="ag-bar"><input id="agQ" placeholder="Search a bonus: Acumen, Empower, MEN, P. Atk…" value="${h(S.q)}">
        ${['all', 'skill', 'active', 'passive', 'chance', 'base', 'stat'].map(k => `<button class="${S.kind === k ? 'on' : ''}" data-agk="${k}">${k === 'all' ? 'All' : k === 'skill' ? 'All skills' : KN[k]}</button>`).join('')}</div></div>${lines}</div>`;
  }
  function render() {
    const b = $id('agBody'); if (!b) return;
    const d = S.d; if (!d) return;
    if (d.error) { b.innerHTML = `<div class="box">${h(d.error)}</div>`; return; }
    const W = d.stones.filter(s => s.kind === 'weapon'), A = d.stones.filter(s => s.kind === 'accessory');
    const total = d.stones.reduce((t, s) => t + s.have.total, 0);
    $id('agSub').textContent = `${total.toLocaleString()} life stones in stock · ${d.stones.length} kinds`;
    const scroll = window.scrollY;
    b.innerHTML = (d.stockError ? `<div class="box muted">stock not available: ${h(d.stockError)}</div>` : '') + grid(W, 'Weapon life stones') + (A.length ? grid(A, 'Jewelry life stones (accessory)') : '') + stoneView();
    if (S.focusQ) { const i = $id('agQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } S.focusQ = false; window.scrollTo(0, scroll); }
  }
  function onClick(e) {
    const c = e.target.closest('[data-ag]'); if (c) { const id = Number(c.dataset.ag); try { history.replaceState(null, '', '#/augments/' + id); } catch (er) { } pick(id); return; }
    const t = e.target.closest('[data-agt]'); if (t) { pick(S.stone, t.dataset.agt); return; }
    const k = e.target.closest('[data-agk]'); if (k) { S.kind = k.dataset.agk; render(); }
  }
  function onInput(e) { if (e.target.id === 'agQ') { S.q = e.target.value; S.focusQ = true; render(); } }
  window.AugmentPage = { route, open, close };
})();
