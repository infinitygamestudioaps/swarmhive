// CRAFTING page #/crafting[/<Name>] (ITEMS-2026-10-17; owner: "it should also be possible to craft items ... if you are the clan leader you
// should see all the materials in the clan warehouse, so that should be calculated as well. Make another page for the crafting section, only a
// crafter can craft"). Only characters that can craft (Create Item: Dwarves) are offered. Every recipe its level allows, with the materials
// counted from its bag + its warehouse + the clan warehouse (how many it can make now), "Make N" -> "!craftmake <recipe> <N> <name>":
// the crafter takes what is missing from the warehouse(s), then crafts (swarm.js CRAFTMAKE). Data: /api/items/craft (itemspage_api.js).
// COMPACT-2026-10-23 (owner: "make /crafting ... more compact and user friendly"): one crafter strip on top, one filter row (show / grade /
// search), compact recipe rows (icon, name, materials, how many + Make on the same row; two columns on a PC). Styles: crafterpanel.css
// (#tab-crafting, loaded on every page). Ask-first stays: nothing leaves a warehouse unless the player picks it in the Make question.
(function () {
  'use strict';
  const SEC = 'tab-crafting';
  const S = { open: false, name: '', chars: null, d: null, q: '', only: 'can', grade: 'all', msgT: 0, shown: 60 };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (p) => typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png';
  const gim = (p, c) => `<img class="gim${c ? ' ' + c : ''}" src="${ico(p)}" alt="">`;   // in-game icons only (owner 2026-10-17)
  const kmb = (n) => window.ItemsLogic ? ItemsLogic.kmb(n) : String(n);
  const GRADES = [['all', 'Every grade'], ['NONE', 'No grade'], ['D', 'D-grade'], ['C', 'C-grade'], ['B', 'B-grade'], ['A', 'A-grade'], ['S', 'S-grade']];
  async function load() {
    if (!S.chars) { try { const c = await api('/api/items/chars'); if (c && !c.error) S.chars = c; } catch (e) { } }
    if (!S.name) { const first = ((S.chars && S.chars.chars) || []).find(c => c.crafter); if (first) S.name = first.name; }
    if (S.name) { let d = null; try { d = await api('/api/items/craft?name=' + encodeURIComponent(S.name)); } catch (e) { d = { error: e.message }; } S.d = d; }
    render();
  }
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win crp'; s.hidden = true;
    s.innerHTML = `<div class="whead crp-head"><h2>${gim('icon/skill0172', 'gi')} Crafting</h2>
        <span class="crp-links"><a href="#/storage" title="Shots made automatically for your parties">${gim('icon/etc_crystal_blue_i00')} Shot crafter settings</a><a href="#/items">${gim('icon/etc_equip_item_box_i00')} Items</a></span></div>
      <div class="crp-msg" id="crpMsg" role="status" hidden></div><div id="crpBody"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick); s.addEventListener('input', onInput); s.addEventListener('change', onInput);
    return s;
  }
  function route(kind, arg) { if (kind === 'crafting') { open(arg ? decodeURIComponent(arg) : ''); return true; } close(); return false; }
  function open(name) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'crafting'; [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'crafting')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false; S.open = true; if (name && name !== S.name) { S.name = name; S.d = null; S.shown = 60; }
    render(); load();
    setTimeout(() => { try { if (s.getBoundingClientRect().top > 40) s.scrollIntoView({ block: 'start' }); } catch (e) { } }, 300);
  }
  function close() { if (!S.open) return; S.open = false; const s = $id(SEC); if (s) s.hidden = true; }
  function flash(t, bad) { const m = $id('crpMsg'); if (!m) return; m.hidden = !t; m.className = 'crp-msg' + (bad ? ' bad' : ''); m.textContent = t || ''; clearTimeout(S.msgT); S.msgT = setTimeout(() => { const x = $id('crpMsg'); if (x) x.hidden = true; }, bad ? 15000 : 7000); }
  function crafterStrip(C) {
    if (!C.length) return '<div class="crp-note">No character that can craft. Create Item is a Dwarf skill: a Dwarf Artisan, Warsmith or Maestro shows up here.</div>';
    return `<div class="crp-who" role="group" aria-label="Which crafter">${C.map(c => `<button type="button" class="crp-char${c.name === S.name ? ' on' : ''}" data-crchar="${h(c.name)}" aria-pressed="${c.name === S.name}">${typeof classIcon === 'function' ? classIcon({ name: c.name, classId: c.classId, cls: c.cls }) : ''}<span><b>${h(c.name)}</b><small>${c.level ? 'lvl ' + h(c.level) : ''}${c.online ? '' : ' · offline'}</small></span></button>`).join('')}</div>`;
  }
  function recipeRow(r) {
    const meta = [r.grade !== 'NONE' ? r.grade + '-grade' : '', `${r.rate} % success`, `${r.mp} MP`].filter(Boolean).join(' · ');
    return `<div class="crp-row${r.can ? '' : ' no'}"><span class="crp-ic"><img src="${ico(r.icon)}" alt="">${r.count > 1 ? `<b class="crp-n">${kmb(r.count)}</b>` : ''}</span>
      <div class="crp-main"><div class="crp-nm"><b>${h(r.name)}</b>${r.learned === false ? '<span class="crp-tag bad">not learned</span>' : ''}</div>
        <div class="crp-meta">${h(meta)}</div>
        <div class="crp-mats">${r.ing.map(g => `<span class="crp-mat${g.short ? ' short' : ''}" title="${h(g.name)}: bag ${g.have.bag}, warehouse ${g.have.wh}, clan ${g.have.clan}"><img src="${ico(g.icon)}" alt="">${h(g.count)}× ${h(g.name)} <b>${kmb(g.have.total)}</b></span>`).join('')}</div></div>
      <div class="crp-make">${r.can ? `<input type="number" min="1" max="${r.can}" value="1" inputmode="numeric" data-crn="${r.list}" aria-label="How many ${h(r.name)}"><button type="button" class="go" data-crmake="${r.list}">Make</button><small class="muted">max ${kmb(r.can)}</small>` : '<small class="muted">missing materials</small>'}</div></div>`;
  }
  function render() {
    if (!S.open) return; section();
    const C = ((S.chars && S.chars.chars) || []).filter(c => c.crafter);
    const d = S.d;
    let body = crafterStrip(C);
    const out = (x) => { $id('crpBody').innerHTML = body + x; };
    if (!S.name) { out(''); return; }
    if (!d) { out('<div class="muted">Loading…</div>'); return; }
    if (d.error) { out(`<div class="crp-msg bad">${h(d.error)}</div>`); return; }
    if (!d.crafter) { out(`<div class="crp-note">${h(d.why)}</div>`); return; }
    const q = S.q.toLowerCase();
    const list = d.recipes.filter(r => (S.only === 'all' || (S.only === 'can' ? r.can > 0 : r.can === 0)) && (S.grade === 'all' || r.grade === S.grade) && (!q || r.name.toLowerCase().includes(q)))
      .sort((a, b) => (b.can > 0) - (a.can > 0) || a.level - b.level || a.name.localeCompare(b.name));
    const nCan = d.recipes.filter(r => r.can > 0).length;
    const src = `Create Item level ${h(d.createLvl)} · materials counted from the bag, its warehouse${d.whSeen ? '' : ' (not looked in yet)'} and the clan warehouse${d.clanSeen ? '' : ' (not looked in yet)'}`;
    body += `<div class="crp-src muted">${src}</div>${d.bookKnown ? '' : `<div class="crp-note">${h(S.name)}'s recipe book has not been read yet: a recipe it has not learned fails.</div>`}
      <div class="crp-filters"><div class="crp-seg" role="group" aria-label="Show">${[['can', `Can make (${nCan})`], ['no', 'Missing'], ['all', 'All']].map(([k, t]) => `<button type="button" class="${S.only === k ? 'on' : ''}" data-cronly="${k}" aria-pressed="${S.only === k}">${t}</button>`).join('')}</div>
        <select id="crpG" aria-label="Grade">${GRADES.map(([g, t]) => `<option value="${g}"${S.grade === g ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <input type="search" id="crpQ" placeholder="Search a product…" value="${h(S.q)}" autocomplete="off"></div>
      <div class="crp-count muted">${list.length} recipe${list.length === 1 ? '' : 's'}</div>
      <div class="crp-list">${list.slice(0, S.shown).map(recipeRow).join('') || '<div class="muted">Nothing here — try "All" or another grade.</div>'}</div>
      ${list.length > S.shown ? `<div class="crp-more"><button type="button" data-crmore="1">Show ${Math.min(60, list.length - S.shown)} more (${list.length - S.shown} left)</button></div>` : ''}`;
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
    if ((b = g('[data-cronly]'))) { S.only = b.dataset.cronly; S.shown = 60; render(); return; }
    if ((b = g('[data-crgrade]'))) { S.grade = b.dataset.crgrade; S.shown = 60; render(); return; }
    if (g('[data-crmore]')) { S.shown += 60; render(); return; }
    if ((b = g('[data-crmake]'))) { make(Number(b.dataset.crmake)); return; }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'crpG' && e.type === 'change') { S.grade = t.value; S.shown = 60; render(); return; }
    if (t.id === 'crpQ' && e.type === 'input') { S.q = t.value; S.shown = 60; const pos = t.selectionStart; render(); const x = $id('crpQ'); if (x) { x.focus(); try { x.setSelectionRange(pos, pos); } catch (er) { } } }
  }
  window.CraftPage = { route, open, close, _state: S };
})();
