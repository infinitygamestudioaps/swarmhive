// CHARACTER FINDER (owner 2026-10-14: "I need an easy way to select a character from the dashboard, it's chaotic to scroll down the page on
// mobile looking for a character"): a "Find character" button in the sticky header (always on screen) opens a sheet with a search box and every
// character grouped by party (online dot, class icon, level, class, HP, dead / full bag), the last ones you opened on top. Tap = #/char/<Name>.
// Keys: "/" opens it (not while typing), Esc closes. Data: index.html's STATE.chars (no extra request). Globals used: STATE, esc, classIcon.
(function () {
  'use strict';
  const CF = { open: false, q: '' };
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const RKEY = 'charfind.recent';
  const recent = () => { try { const v = JSON.parse(localStorage.getItem(RKEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const remember = (n) => { try { localStorage.setItem(RKEY, JSON.stringify([n].concat(recent().filter(x => x !== n)).slice(0, 5))); } catch (e) { } };
  const chars = () => { try { return (STATE && STATE.chars) || []; } catch (e) { return []; } };

  function button() {
    if (document.getElementById('cfBtn')) return;
    const host = document.querySelector('header .hrow > div'); if (!host) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'cfBtn'; b.className = 'cf-btn'; b.setAttribute('aria-label', 'Find a character');
    b.innerHTML = '<span aria-hidden="true">🔍</span> Find character';
    b.addEventListener('click', open);
    host.insertBefore(b, host.querySelector('#sum'));
  }
  function row(c) {
    const on = c.ageSec != null && c.ageSec <= 30, hp = Number(c.hp), dead = !!c.dead;
    const ico = typeof classIcon === 'function' ? (() => { try { return classIcon(c); } catch (e) { return ''; } })() : '';
    const tags = [dead ? '<span class="cf-tag bad">dead</span>' : '', c.full && c.full.level ? `<span class="cf-tag ${c.full.level === 'full' ? 'bad' : 'warn'}">bag ${c.full.level === 'full' ? 'full' : 'nearly full'}</span>` : '', !on ? '<span class="cf-tag">offline</span>' : ''].join('');
    return `<button type="button" class="cf-row" data-cfname="${h(c.name)}"><span class="cf-dot ${on ? 'on' : ''}" aria-hidden="true"></span>${ico}<span class="cf-nm"><b>${h(c.name)}</b><small>${c.level ? 'lvl ' + h(c.level) + ' · ' : ''}${h(c.cls || '')}</small></span>${tags}${Number.isFinite(hp) && on && !dead ? `<span class="cf-hp" title="HP ${Math.round(hp)} %"><i style="width:${Math.max(0, Math.min(100, Math.round(hp)))}%"></i></span>` : ''}</button>`;
  }
  function list() {
    const q = CF.q.trim().toLowerCase(), all = chars().slice().sort((a, b) => a.name.localeCompare(b.name));
    const hit = (c) => !q || [c.name, c.cls, c.party].some(x => String(x || '').toLowerCase().includes(q));
    const shown = all.filter(hit);
    if (!shown.length) return `<div class="cf-none">No character matches “${h(CF.q)}”.</div>`;
    let out = '';
    if (!q) { const R = recent().map(n => all.find(c => c.name === n)).filter(Boolean); if (R.length) out += `<div class="cf-grp">Opened lately</div>` + R.map(row).join(''); }
    const parties = {}; shown.forEach(c => { const p = c.party || '(no party)'; (parties[p] = parties[p] || []).push(c); });
    Object.keys(parties).sort((a, b) => a.localeCompare(b)).forEach(p => {
      const L = parties[p].sort((a, b) => (b.name === p) - (a.name === p) || a.name.localeCompare(b.name));
      out += `<div class="cf-grp">Party ${h(p)} <small>${L.length}</small></div>` + L.map(row).join('');
    });
    return out;
  }
  function open() {
    if (CF.open) return; CF.open = true; CF.q = '';
    const ov = document.createElement('div'); ov.id = 'cfOv'; ov.className = 'cf-ov';
    ov.innerHTML = `<div class="cf-sheet" role="dialog" aria-modal="true" aria-label="Find a character">
      <div class="cf-head"><input type="search" id="cfQ" placeholder="Name, class or party…" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="search a character"><button type="button" class="cf-x" data-cfclose="1" aria-label="Close">✕</button></div>
      <div class="cf-list" id="cfList">${list()}</div></div>`;
    document.body.appendChild(ov);
    document.documentElement.classList.add('cf-lock');
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-cfclose]')) { close(); return; }
      const r = e.target.closest('[data-cfname]'); if (!r) return;
      const n = r.dataset.cfname; remember(n); close(); location.hash = '#/char/' + encodeURIComponent(n);
    });
    const q = document.getElementById('cfQ');
    q.addEventListener('input', () => { CF.q = q.value; document.getElementById('cfList').innerHTML = list(); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = document.querySelector('#cfList [data-cfname]'); if (f) f.click(); } });
    setTimeout(() => { try { q.focus(); } catch (e) { } }, 50);
  }
  function close() { CF.open = false; const ov = document.getElementById('cfOv'); if (ov) ov.remove(); document.documentElement.classList.remove('cf-lock'); }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && CF.open) { close(); return; }
    if (e.key === '/' && !CF.open && !/^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '') && !(document.activeElement && document.activeElement.isContentEditable)) { e.preventDefault(); open(); }
  });
  window.addEventListener('hashchange', () => { if (CF.open) close(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', button); else button();
  window.CharFind = { open, close, _state: CF };
})();
