// SPOT ROTATION page #/rotation[/<leader>] (SPOTROT-2026-11-05; owner: "Byg spot rotation ... først"). Per party: the spots it rotates
// between (our zones incl. the imported Exper zones), alternately or randomly, and when it moves on: after N minutes, after N minutes without
// a kill, after N deaths, when the team outgrows the spot. API /api/rotation (Dashboard/rotation_api.js); swarm.js SPOTROT does the moving.
(function () {
  'use strict';
  const SEC = 'tab-rotation';
  const S = { open: false, d: null, leader: '', q: '', msg: '' };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const keyQ = () => { const k = new URLSearchParams(location.search).get('key'); return k ? 'key=' + encodeURIComponent(k) : ''; };
  const get = async (u) => { if (typeof api === 'function') return api(u); const k = keyQ(); const r = await fetch(u + (k ? (u.includes('?') ? '&' : '?') + k : '')); return r.json(); };
  const post = async (u, b) => { if (typeof api === 'function') return api(u, { method: 'POST', body: JSON.stringify(b) }); const k = keyQ(); const r = await fetch(u + (k ? '?' + k : ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return r.json(); };
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win rotp'; s.hidden = true;
    s.innerHTML = `<style>
      .rotp .rt-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}.rotp input[type=number]{width:72px;font-size:16px}
      .rotp .rt-list{max-height:320px;overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:4px}
      .rotp .rt-z{display:flex;gap:6px;align-items:center;padding:3px 2px;font-size:14px}.rotp .rt-z small{opacity:.65}
      .rotp .rt-sel{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}.rotp .rt-chip{border:1px solid var(--gold,#c9a54a);border-radius:10px;padding:2px 8px;font-size:13px}
      .rotp .rt-save{width:100%;padding:12px;font-size:17px;margin:8px 0}
    </style><div class="whead"><h2>Spot rotation</h2><span class="muted" id="rtSub"></span></div><div id="rtBody"><div class="muted">loading…</div></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('input', onInput);
    return s;
  }
  function route(kind, arg) { if (kind === 'rotation') { open(arg ? decodeURIComponent(arg) : ''); return true; } close(); return false; }
  function open(leader) {
    const s = section(); try { stopChar(); } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'rotation')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; window.scrollTo(0, 0); if (leader) S.leader = leader; load();
  }
  function close() { if (!S.open) return; S.open = false; const s = $id(SEC); if (s) s.hidden = true; }
  async function load() { try { S.d = await get('/api/rotation'); } catch (e) { S.d = { error: e.message }; } if (!S.leader && S.d && S.d.parties && S.d.parties[0]) S.leader = S.d.parties[0].leader; S.edit = null; render(); }
  const P = () => ((S.d && S.d.parties) || []).find(p => p.leader === S.leader);
  const cfg = () => { if (!S.edit) { const c = (P() || {}).cfg || {}; S.edit = { on: !!c.on, spots: (c.spots || []).slice(), order: c.order || 'next', everyMin: c.everyMin || 0, noMobsMin: c.noMobsMin || 0, afterDeaths: c.afterDeaths || 0, levelOut: !!c.levelOut }; } return S.edit; };
  function render() {
    section(); const B = $id('rtBody'); if (!B) return;
    if (!S.d || S.d.error) { B.innerHTML = `<div class="muted">${h((S.d && S.d.error) || 'loading…')}</div>`; return; }
    const p = P(), c = cfg(), q = S.q.toLowerCase();
    $id('rtSub').textContent = p ? `${p.members.length} member(s) · lvl ${p.level}` : '';
    const zs = (S.d.zones || []).filter(z => !q || z.name.toLowerCase().includes(q));
    B.innerHTML = `<div class="rt-row"><label>Party <select id="rtParty">${S.d.parties.map(x => `<option ${x.leader === S.leader ? 'selected' : ''}>${h(x.leader)}</option>`).join('')}</select></label>${p ? `<span class="muted">${h(p.task)}</span>` : ''}</div>
      <div class="rt-row"><label><input type="checkbox" id="rtOn" ${c.on ? 'checked' : ''}> Rotation ON</label>
        <label><input type="radio" name="rtOrder" value="next" ${c.order !== 'random' ? 'checked' : ''}> Alternately</label><label><input type="radio" name="rtOrder" value="random" ${c.order === 'random' ? 'checked' : ''}> Randomly</label></div>
      <div class="rt-row"><label>Move on after <input type="number" id="rtEvery" min="0" value="${c.everyMin}"> min</label><label>after <input type="number" id="rtNoMobs" min="0" value="${c.noMobsMin}"> min without a kill</label>
        <label>after <input type="number" id="rtDeaths" min="0" value="${c.afterDeaths}"> death(s)</label><label><input type="checkbox" id="rtLvl" ${c.levelOut ? 'checked' : ''}> when the team outgrows the spot</label></div>
      <div class="muted" style="font-size:12px">0 = that condition is off. It never moves in the middle of a fight; the next spot fits the team's level when one does.</div>
      <div><b>Spots (${c.spots.length})</b> <span class="muted">in this order</span></div>
      <div class="rt-sel">${c.spots.map((n, i) => `<span class="rt-chip">${i + 1}. ${h(n)} <a href="#" data-rtdel="${i}">✕</a></span>`).join('') || '<span class="muted">none yet - tick at least 2 below</span>'}</div>
      <div class="rt-row"><input id="rtQ" placeholder="search zones (e.g. Exper, Ant Nest)" value="${h(S.q)}" style="flex:1 1 200px;min-width:0;font-size:16px"></div>
      <div class="rt-list">${zs.map(z => `<label class="rt-z"><input type="checkbox" data-rtz="${h(z.name)}" ${c.spots.includes(z.name) ? 'checked' : ''}><span>${h(z.name)} <small>lvl ${z.levelMin}-${z.levelMax}${z.exper ? ' · Exper' : ''}${z.enabled ? '' : ' · not automatic'}</small></span></label>`).join('') || '<div class="muted">no zone matches</div>'}</div>
      <button class="rt-save" data-rt="save">Save</button><div class="muted">${h(S.msg)}</div>`;
  }
  function readTop() {
    const c = cfg(); c.on = !!($id('rtOn') || {}).checked; const o = document.querySelector('input[name=rtOrder]:checked'); c.order = o ? o.value : 'next';
    c.everyMin = Number(($id('rtEvery') || {}).value) || 0; c.noMobsMin = Number(($id('rtNoMobs') || {}).value) || 0; c.afterDeaths = Number(($id('rtDeaths') || {}).value) || 0; c.levelOut = !!($id('rtLvl') || {}).checked;
  }
  async function onClick(e) {
    const z = e.target.dataset && e.target.dataset.rtz;
    if (z !== undefined) { readTop(); const c = cfg(); if (e.target.checked) { if (!c.spots.includes(z)) c.spots.push(z); } else c.spots = c.spots.filter(n => n !== z); render(); return; }
    const d = e.target.closest('[data-rtdel]'); if (d) { e.preventDefault(); readTop(); cfg().spots.splice(Number(d.dataset.rtdel), 1); render(); return; }
    const t = e.target.closest('[data-rt]'); if (!t) return;
    if (t.dataset.rt === 'save') {
      readTop(); const c = cfg(); if (c.on && c.spots.length < 2) { S.msg = 'pick at least 2 spots'; render(); return; }
      if (c.on && !confirm(`Spot rotation ON for ${S.leader}: ${c.spots.length} spots. The party moves to the next spot by itself when a condition is met. Save?`)) return;
      try { const r = await post('/api/rotation', { leader: S.leader, cfg: c }); S.msg = r && r.ok ? 'saved' : ((r && r.error) || 'not saved'); } catch (er) { S.msg = er.message; }
      await load(); S.msg = S.msg; render();
    }
  }
  function onInput(e) {
    if (e.target.id === 'rtQ') { readTop(); S.q = e.target.value; render(); const q = $id('rtQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } return; }
    if (e.target.id === 'rtParty') { S.leader = e.target.value; S.edit = null; render(); }
  }
  window.RotationPage = { route, open, close, _state: S };
})();
