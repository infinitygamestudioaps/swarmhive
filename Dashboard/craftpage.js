// CRAFTING page #/crafting[/<Name>] (ITEMS-2026-10-17; owner: "it should also be possible to craft items ... if you are the clan leader you
// should see all the materials in the clan warehouse, so that should be calculated as well. Make another page for the crafting section, only a
// crafter can craft"). Only characters that can craft (Create Item: Dwarves) are offered. Every recipe its level allows, with the materials
// counted from its bag + its warehouse + the clan warehouse (how many it can make now), "Make N" -> "!craftmake <recipe> <N> <name>":
// the crafter takes what is missing from the warehouse(s), then crafts (swarm.js CRAFTMAKE). Data: /api/items/craft (itemspage_api.js).
(function () {
  'use strict';
  const SEC = 'tab-crafting';
  const S = { open: false, name: '', chars: null, d: null, q: '', only: 'can', grade: 'all', msgT: 0 };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (p) => typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png';
  const gim = (p, c) => `<img class="gim${c ? ' ' + c : ''}" src="${ico(p)}" alt="">`;   // in-game icons only (owner 2026-10-17)
  const kmb = (n) => window.ItemsLogic ? ItemsLogic.kmb(n) : String(n);
  async function load() {
    if (!S.chars) { try { const c = await api('/api/items/chars'); if (c && !c.error) S.chars = c; } catch (e) { } }
    if (!S.name) { const first = ((S.chars && S.chars.chars) || []).find(c => c.crafter); if (first) S.name = first.name; }
    if (S.name) { let d = null; try { d = await api('/api/items/craft?name=' + encodeURIComponent(S.name)); } catch (e) { d = { error: e.message }; } S.d = d; }
    render();
  }
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win itp'; s.hidden = true;
    s.innerHTML = `<div class="itp-head"><h2><img class="gi" src="${ico('icon/skill0172')}" alt=""> Crafting</h2><a href="#/items" class="itp-link"><img class="gim" src="${ico('icon/etc_equip_item_box_i00')}" alt=""> Items →</a></div>
      <div class="itp-msg" id="crpMsg" role="status" hidden></div><div id="crpBody"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('input', onInput);
    return s;
  }
  function route(kind, arg) { if (kind === 'crafting') { open(arg ? decodeURIComponent(arg) : ''); return true; } close(); return false; }
  function open(name) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'crafting'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'crafting')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; if (name && name !== S.name) { S.name = name; S.d = null; }
    render(); load();
    setTimeout(() => { try { if (s.getBoundingClientRect().top > 40) s.scrollIntoView({ block: 'start' }); } catch (e) { } }, 300);
  }
  function close() { if (!S.open) return; S.open = false; const s = $id(SEC); if (s) s.hidden = true; }
  function flash(t, bad) { const m = $id('crpMsg'); if (!m) return; m.hidden = !t; m.className = 'itp-msg' + (bad ? ' bad' : ''); m.textContent = t || ''; clearTimeout(S.msgT); S.msgT = setTimeout(() => { const x = $id('crpMsg'); if (x) x.hidden = true; }, bad ? 15000 : 7000); }
  function render() {
    if (!S.open) return; section();
    const C = ((S.chars && S.chars.chars) || []).filter(c => c.crafter);
    const d = S.d;
    let body = `<div class="itp-step"><span class="itp-num">1</span> Which crafter?</div><div class="itp-chars">${C.map(c => `<button type="button" class="itp-char${c.name === S.name ? ' on' : ''}" data-crchar="${h(c.name)}">${typeof classIcon === 'function' ? classIcon({ name: c.name, classId: c.classId, cls: c.cls }) : ''}<b>${h(c.name)}</b><span>${c.level ? 'lvl ' + h(c.level) : ''}${c.online ? '' : ' · offline'}</span></button>`).join('') || '<div class="muted">No character that can craft (Create Item is a Dwarf skill).</div>'}</div>`;
    if (!S.name) { $id('crpBody').innerHTML = body; return; }
    if (!d) { $id('crpBody').innerHTML = body + '<div class="muted">Loading…</div>'; return; }
    if (d.error) { $id('crpBody').innerHTML = body + `<div class="itp-bad">${h(d.error)}</div>`; return; }
    if (!d.crafter) { $id('crpBody').innerHTML = body + `<div class="itp-note">${h(d.why)}</div>`; return; }
    const q = S.q.toLowerCase();
    const list = d.recipes.filter(r => (S.only === 'all' || (S.only === 'can' ? r.can > 0 : r.can === 0)) && (S.grade === 'all' || r.grade === S.grade) && (!q || r.name.toLowerCase().includes(q)))
      .sort((a, b) => (b.can > 0) - (a.can > 0) || a.level - b.level || a.name.localeCompare(b.name));
    body += `<div class="itp-step"><span class="itp-num">2</span> What to make <span class="muted" style="font-weight:400">Create Item level ${h(d.createLvl)} · materials from ${h(S.name)}'s bag, warehouse${d.whSeen ? '' : ' (not looked yet)'} and the clan warehouse${d.clanSeen ? '' : ' (not looked yet)'}${d.bookKnown ? '' : ' · its recipe book has not been read yet: a recipe it has not learned fails'}</span></div>
      <div class="itp-filters">${[['can', 'Can make now'], ['no', 'Missing materials'], ['all', 'All']].map(([k, t]) => `<button type="button" class="itp-chip${S.only === k ? ' on' : ''}" data-cronly="${k}">${t}</button>`).join('')}
        ${['all', 'NONE', 'D', 'C', 'B', 'A', 'S'].map(g => `<button type="button" class="itp-chip${S.grade === g ? ' on' : ''}" data-crgrade="${g}">${g === 'all' ? 'every grade' : g === 'NONE' ? 'no grade' : g}</button>`).join('')}
        <input type="search" class="itp-search" id="crpQ" placeholder="Search a product…" value="${h(S.q)}"></div>
      ${list.slice(0, 120).map(r => `<div class="crp-row${r.can ? '' : ' no'}"><span class="itp-ic"><img src="${ico(r.icon)}" alt="">${r.count > 1 ? `<b class="itp-n">${kmb(r.count)}</b>` : ''}</span>
        <div class="crp-main"><b>${h(r.name)}</b> <span class="muted">${h(r.grade !== 'NONE' ? r.grade + '-grade · ' : '')}recipe level ${h(r.level)} · ${h(r.rate)} % success · ${h(r.mp)} MP${r.learned === false ? ' · <span class="itp-bad" style="padding:0 4px">not learned</span>' : ''}</span>
          <div class="crp-mats">${r.ing.map(g => `<span class="crp-mat${g.short ? ' short' : ''}" title="${h(g.name)}: bag ${g.have.bag}, warehouse ${g.have.wh}, clan ${g.have.clan}"><img src="${ico(g.icon)}" alt="">${h(g.count)}× ${h(g.name)} <b>(${kmb(g.have.total)})</b></span>`).join('')}</div></div>
        <div class="crp-make">${r.can ? `<input type="number" min="1" max="${r.can}" value="1" data-crn="${r.list}" aria-label="How many"><button type="button" data-crmake="${r.list}">${gim('icon/skill0172')} Make</button><span class="muted">up to ${r.can}</span>` : '<span class="muted">missing materials</span>'}</div></div>`).join('') || '<div class="muted">Nothing.</div>'}
      ${list.length > 120 ? `<div class="muted">${list.length - 120} more — search to narrow.</div>` : ''}`;
    $id('crpBody').innerHTML = body;
  }
  async function make(list) {
    const r = S.d.recipes.find(x => x.list === list); if (!r) return;
    const inp = document.querySelector(`[data-crn="${list}"]`), n = Math.max(1, Math.min(r.can, Number(inp && inp.value) || 1));
    const take = r.ing.filter(g => g.count * n > g.have.bag).map(g => `${g.count * n - g.have.bag}× ${g.name} (warehouse ${g.have.wh}, clan ${g.have.clan})`);
    let use = { wh: false, clan: false };
    if (take.length) {   // ASK FIRST (owner 2026-10-17: "Dont take ANYTHING automatically! Always ask. And let the user select!")
      const v = await uiChoice({ title: `${S.name}: make ${n}× ${r.name}?`, body: [uiP(`Not in the bag: ${take.join(', ')}.`), uiNote('Where may it take the rest from? Nothing leaves a warehouse unless you pick it here.')],
        buttons: [{ label: 'Only what is in the bag', value: 'bag' }, { label: 'Bag + my warehouse', value: 'wh' }, { label: 'Bag + my warehouse + clan warehouse', value: 'clan' }] });
      if (!v) return; use = { wh: v !== 'bag', clan: v === 'clan' };
    } else { const ok = await uiConfirm({ title: `${S.name}: make ${n}× ${r.name}?`, body: [uiP(`${r.rate} % success per try, ${r.mp * n} MP in all.`), uiNote('Everything is in the bag.')], confirmText: 'Make it' }); if (!ok) return; }
    let d = null; try { d = await api('/api/items/craft', { method: 'POST', body: JSON.stringify({ name: S.name, recipe: list, count: n, use }) }); } catch (e) { d = { error: e.message }; }
    if (!d || d.error) { uiError((d && d.error) || 'not sent', 'Not sent'); return; }
    flash(`${S.name} is making ${n}× ${r.name} — see its notes / What they do.`);
  }
  function onClick(e) {
    const t = e.target, g = (s) => t.closest(s); let b;
    if ((b = g('[data-crchar]'))) { location.hash = '#/crafting/' + encodeURIComponent(b.dataset.crchar); return; }
    if ((b = g('[data-cronly]'))) { S.only = b.dataset.cronly; render(); return; }
    if ((b = g('[data-crgrade]'))) { S.grade = b.dataset.crgrade; render(); return; }
    if ((b = g('[data-crmake]'))) { make(Number(b.dataset.crmake)); return; }
  }
  function onInput(e) { const t = e.target; if (t.id === 'crpQ') { S.q = t.value; const pos = t.selectionStart; render(); const x = $id('crpQ'); if (x) { x.focus(); try { x.setSelectionRange(pos, pos); } catch (er) { } } } }
  window.CraftPage = { route, open, close, _state: S };
})();
