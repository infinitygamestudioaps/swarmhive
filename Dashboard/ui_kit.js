// UI KIT (UX audit 2026-10-13, docs/plan/ux_audit_2026-10-13.md batch B1): the shared controls of every dashboard page + the
// Simple / Advanced view.
//   UIKit.mode() 'simple' | 'advanced'      UIKit.isAdv()      UIKit.setMode(m)   (per viewer, localStorage 'swarm.uimode')
//     Simple (players): no raw data (Details boxes, !command syntax, coordinates, debug groups). Advanced: everything.
//     html.uk-simple / html.uk-adv; [data-adv] shows only in Advanced, [data-simple] only in Simple (ui_kit.css). Changing the mode fires
//     window event 'uikit:mode' ({ detail: mode }) so pages re-render.
//   UIKit.btn(label, { kind: 'primary'|'secondary'|'danger'|'ghost', big, full, attrs, icon, title })   -> html
//   UIKit.switchHtml({ on, label, onText, offText, attrs, disabled })                                 -> html (role=switch)
//   UIKit.offNote(what)   "Off — nothing happens until you switch it on." (the manual-config-first rule, one wording everywhere)
//   UIKit.chip(kind, text)   kind: ok | working | fighting | waiting | problem | off                       -> html
//   UIKit.empty({ icon, text, action: { label, attrs } })                                                -> html
//   UIKit.details(innerHtml|text, { summary, raw })   Advanced-only disclosure with the raw text          -> html
//   UIKit.helpLink(page)   "?" to the user guide page (docs/guide/pages/<page>.md, served at /guide/ once server.js serves it)
//   UIKit.toast(text, { kind, ms })
// Also loads Dashboard/plainwords.js (window.Plain) once, so a page only needs this file. Default view: Simple; the owner's own install
// defaults to Advanced (the PRIVATE block below is cut out of the public package by release_build.js).
(function () {
  'use strict';
  let DEFAULT_MODE = 'simple';
  const KEY = 'swarm.uimode';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const attrs = (o) => Object.entries(o || {}).filter(([, v]) => v != null && v !== false).map(([k, v]) => v === true ? ` ${esc(k)}` : ` ${esc(k)}="${esc(v)}"`).join('');

  function readMode() { try { const v = localStorage.getItem(KEY); if (v === 'simple' || v === 'advanced') return v; } catch (e) { } return DEFAULT_MODE; }
  let MODE = readMode();
  function apply() {
    const h = document.documentElement; if (!h) return;
    h.classList.toggle('uk-simple', MODE === 'simple'); h.classList.toggle('uk-adv', MODE !== 'simple');
    document.querySelectorAll('.uk-mode button[data-ukmode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ukmode === MODE)));
  }
  function setMode(m) {
    m = m === 'advanced' ? 'advanced' : 'simple';
    if (m === MODE) return;
    MODE = m; try { localStorage.setItem(KEY, m); } catch (e) { }
    apply();
    try { window.dispatchEvent(new CustomEvent('uikit:mode', { detail: m })); } catch (e) { }
    // SIMPLEVIEW-2026-10-13: say what changed (the switch looked like it did nothing on pages without technical parts)
    try { const t = document.createElement('div'); t.className = 'uk-toast'; t.setAttribute('role', 'status');
      t.textContent = m === 'simple' ? 'Simple view: expert pages (Zones, Spots, Rooms, Crystals, Fortresses, Castles, Enchant, Accounts, Plan) and technical details are hidden.' : 'Advanced view: every page and all technical details are shown.';
      document.body.appendChild(t); setTimeout(() => { try { t.remove(); } catch (e) { } }, 3500); } catch (e) { }
    try { const cur = document.querySelector('#tabs button.on'); if (m === 'simple' && cur && getComputedStyle(cur).display === 'none') { const p = document.querySelector('#tabs button[data-tab="parties"]'); if (p) p.click(); } } catch (e) { }
  }
  apply();

  // ---------------------------------------------------------------------------------------------- components
  function btn(label, o) {
    o = o || {};
    const cls = ['uk-btn', o.kind || '', o.big ? 'big' : '', o.full ? 'full' : '', o.cls || ''].filter(Boolean).join(' ');
    const ic = o.icon ? `<img class="gi" src="${esc(o.icon)}" alt="" onerror="this.style.display='none'">` : '';
    return `<button type="button" class="${cls}"${o.title ? ` title="${esc(o.title)}"` : ''}${o.disabled ? ' disabled' : ''}${attrs(o.attrs)}>${ic}<span>${esc(label)}</span></button>`;
  }
  const OFF_NOTE = 'Off — nothing happens until you switch it on.';
  function offNote(what) { return `<span class="uk-offnote">${what ? `<b>${esc(what)}:</b> ` : ''}${esc(OFF_NOTE)}</span>`; }
  function switchHtml(o) {
    o = o || {};
    const on = !!o.on;
    const sub = on ? (o.onText || 'On') : (o.offText || OFF_NOTE);
    return `<button type="button" class="uk-switch" role="switch" aria-checked="${on}"${o.disabled ? ' disabled' : ''}${attrs(o.attrs)}>` +
      `<span class="uk-track"><span class="uk-knob"></span></span><span class="uk-sl"><b>${esc(o.label || '')}</b><span>${esc(sub)}</span></span></button>`;
  }
  const KINDS = { ok: 1, working: 1, fighting: 1, waiting: 1, problem: 1, off: 1 };
  function chip(kind, text, title) { const k = KINDS[kind] ? kind : 'off'; return `<span class="uk-chip k-${k}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`; }
  function empty(o) {
    o = o || {};
    return `<div class="uk-empty">${o.icon ? `<div class="uk-ei" aria-hidden="true">${esc(o.icon)}</div>` : ''}<div class="uk-et">${esc(o.text || 'Nothing here yet.')}</div>` +
      (o.action ? btn(o.action.label, { kind: 'primary', attrs: o.action.attrs }) : '') + '</div>';
  }
  function details(content, o) {
    o = o || {};
    if (content == null || content === '') return '';
    const inner = o.html ? content : `<div class="uk-raw">${esc(content)}</div>`;
    return `<details class="uk-details" data-adv><summary>${esc(o.summary || 'Details')}</summary>${inner}</details>`;
  }
  function helpLink(page, title) { return `<a class="uk-help" href="/guide/pages/${encodeURIComponent(page)}.md" target="_blank" rel="noopener" title="${esc(title || 'How this page works')}" aria-label="${esc(title || 'Help')}">?</a>`; }
  function toast(text, o) {
    o = o || {};
    let box = document.getElementById('ukToasts');
    if (!box) { box = document.createElement('div'); box.id = 'ukToasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'uk-toast' + (o.kind ? ' k-' + o.kind : ''); t.textContent = String(text || '');
    box.appendChild(t);
    setTimeout(() => { t.remove(); }, Math.max(1500, o.ms || 4000));
    return t;
  }
  function modeSwitchHtml() {
    return `<div class="uk-mode" role="group" aria-label="View"><button type="button" data-ukmode="simple" aria-pressed="${MODE === 'simple'}" title="Plain words, only what a player needs">Simple</button>` +
      `<button type="button" data-ukmode="advanced" aria-pressed="${MODE !== 'simple'}" title="Everything: raw details, coordinates, command syntax, debug tools">Advanced</button></div>`;
  }
  // the view switch under the dashboard title (runtime insert: index.html is not changed for it)
  function mountModeSwitch() {
    if (document.querySelector('.uk-mode[data-ukmount]')) return true;
    const anchor = document.getElementById('sum');
    if (!anchor || !anchor.parentNode) return false;
    const w = document.createElement('div'); w.innerHTML = modeSwitchHtml(); const el = w.firstChild; el.setAttribute('data-ukmount', '1');
    anchor.parentNode.appendChild(el);
    return true;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.uk-mode button[data-ukmode]'); if (!b) return;
    e.preventDefault(); setMode(b.dataset.ukmode);
  });

  // ---------------------------------------------------------------------------------------------- plain words
  function loadPlain() {
    if (window.Plain || document.getElementById('ukPlainJs')) return;
    const s = document.createElement('script'); s.id = 'ukPlainJs'; s.src = '/plainwords.js';
    s.onload = () => { try { window.dispatchEvent(new CustomEvent('uikit:plain')); } catch (e) { } };
    (document.head || document.documentElement).appendChild(s);
  }
  loadPlain();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { apply(); mountModeSwitch(); }); else { apply(); mountModeSwitch(); }
  let tries = 0; const iv = setInterval(() => { if (mountModeSwitch() || ++tries > 40) clearInterval(iv); }, 250);

  window.UIKit = { mode: () => MODE, isAdv: () => MODE !== 'simple', setMode, btn, switchHtml, offNote, OFF_NOTE, chip, empty, details, helpLink, toast, modeSwitchHtml, esc, defaultMode: DEFAULT_MODE };
})();
