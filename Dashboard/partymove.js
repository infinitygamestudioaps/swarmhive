// PARTY MOVE UI (owner 2026-11-01: "Make so i can transfer characters between teams via Dashboard"): a "Move to party…" button on every character
// page (#/char/<Name>), in its own row above the page (the page itself redraws every few seconds). Pick a party (or "its own new party"), pick who
// leads the rest when a leader moves, see EXACTLY what changes (the server's dry run), confirm. Data: GET/POST /api/partymove (partymove_api.js).
(function () {
  'use strict';
  const call = async (u, o) => { const r = await fetch(u, Object.assign({}, o || {}, { headers: { 'x-key': (typeof KEY !== 'undefined' ? KEY : ''), 'Content-Type': 'application/json' } })); return r.json(); };
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const charName = () => { const m = String(location.hash || '').match(/^#\/char\/([^/?#]+)/); return m ? decodeURIComponent(m[1]) : ''; };
  let shown = '', cur = null;
  async function refresh(name) {
    const slot = document.getElementById('pmSlot'); if (!slot) return;
    slot.innerHTML = `<span class="muted">Party: …</span>`;
    try { cur = await call('/api/partymove?name=' + encodeURIComponent(name)); } catch (e) { cur = { error: String(e.message || e) }; }
    if (shown !== name) return;
    if (!cur || cur.error) { slot.innerHTML = `<span class="muted">Party: ${E(cur && cur.error || '?')}</span>`; return; }
    slot.innerHTML = `<span class="muted">Party: <b>${E(cur.from)}</b>${cur.from === name ? ' (leads it)' : ''}</span> <button type="button" id="pmBtn" style="min-height:36px">Move to party…</button>`;
    document.getElementById('pmBtn').onclick = () => move(name).catch(e => { if (typeof uiAlert === 'function') uiAlert({ title: 'Move to party', body: String(e.message || e), kind: 'error' }); });
  }
  async function move(name) {
    const info = cur; if (!info || info.error) return;
    const opts = info.parties.filter(p => p.key !== info.from).map(p => ({ label: `${p.key} (${p.members.length}: ${p.members.slice(0, 5).join(', ')}${p.members.length > 5 ? ' …' : ''})`, value: p.key }));
    if (!info.parties.some(p => p.key === name)) opts.unshift({ label: `Its own new party (${name} leads it; it gets ${info.from}'s party settings)`, value: '' });
    const fields = [{ id: 'to', label: 'Move ' + name + ' to', options: opts, value: opts[0] ? opts[0].value : '' }];
    if (info.needLeader) fields.push({ id: 'nl', label: `${name} leads ${info.members.join(', ')} - who leads them now?`, options: info.members.map(m => ({ label: m, value: m })), value: info.members[0] });
    const f = await uiForm({ title: 'Move to party', body: `${name} is in party ${info.from}.`, fields, buttons: [{ label: 'Next: see what changes', value: 'next', primary: true }, { label: 'Cancel', value: null }] });
    if (!f || f.value !== 'next') return;
    const to = f.values.to || '', nl = info.needLeader ? (f.values.nl || '') : '';
    const dry = await call(`/api/partymove?name=${encodeURIComponent(name)}&to=${encodeURIComponent(to)}${nl ? '&newLeader=' + encodeURIComponent(nl) : ''}`);
    if (!dry || dry.error || !dry.plan) { await uiAlert({ title: 'Move to party', body: (dry && dry.error) || 'no answer', kind: 'error' }); return; }
    if (!dry.plan.ok) { await uiAlert({ title: 'Move to party', body: dry.plan.error, kind: 'error' }); return; }
    const ok = await uiConfirm({ title: `Move ${name} to ${to || 'its own new party'}?`,
      body: [uiP('These files change (backups first, in Settings\\backup\\partymove_…):'), uiList(dry.plan.changes), uiNote('The bots read it within about a minute: the in-game party changes by itself (leave / invite). Nothing else is restarted.')],
      confirmText: 'Move' });
    if (!ok) return;
    const r = await call('/api/partymove', { method: 'POST', body: JSON.stringify({ name, to, newLeader: nl, confirm: true }) });
    await uiAlert({ title: 'Move to party', body: r && r.ok ? `${name} is now in party ${r.to}.${r.newLeader ? ` ${r.rest.join(', ')} now follow ${r.newLeader}.` : ''} ${r.note || ''}` : ((r && r.error) || 'failed'), kind: r && r.ok ? 'ok' : 'error' });
    shown = ''; tick();
  }
  function tick() {
    const tab = document.getElementById('tab-char'), box = document.getElementById('charBox'), name = charName();
    if (!tab || tab.hidden || !box || !name) { shown = ''; return; }
    let slot = document.getElementById('pmSlot');
    if (!slot) { slot = document.createElement('div'); slot.id = 'pmSlot'; slot.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 8px'; box.parentNode.insertBefore(slot, box); }
    if (shown !== name) { shown = name; refresh(name); }
  }
  setInterval(tick, 1000); window.addEventListener('hashchange', () => { shown = ''; tick(); });
})();
