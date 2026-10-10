// UIDIALOG (user 2026-10-10: "Can you make the pop ups better than alerts?") — ONE shared dialog for the whole dashboard. Replaces every
// browser confirm() / alert() / prompt(). L2 skin (Windows_DF_Large_Bg panel, Button_DF buttons, gold title, the --fs-* type tokens),
// bottom sheet on phones, centred card on desktop. Loaded by index.html BEFORE every page module; served public by server.js (no secrets).
//
//   uiConfirm({ title, body, details?, confirmText, cancelText, danger?, typeToConfirm? })  -> Promise<boolean>
//   uiAlert({ title, body, details?, kind: 'info'|'error'|'ok', okText? })                -> Promise<void>
//   uiPrompt({ title, body, label, value, placeholder, inputmode, type?, validate?, confirmText, cancelText }) -> Promise<string|null>
//   uiChoice({ title, body, buttons: [{ label, value, primary?, danger? }] })              -> Promise<value|null>   (null = cancelled)
//   Each also takes a plain string (= body). body / details = RICH content, every text is escaped (no HTML from names):
//     string                 paragraphs split on blank lines, "• x" / "- x" lines become a list, single \n = line break
//     [block, block, ...]    blocks: string | uiH(...) heading | uiP(...inline) | uiList([...]) | uiPath([...]) | uiWarn(...) | uiNote(...) | uiKV([[k, v]])
//     inline parts:          string | uiEm(text) | uiCode(text) | uiPath([...]) (inside a list item / paragraph)
//   validate(value) -> '' / null / true = ok, a string = the error shown under the field (the OK button stays off).
//   typeToConfirm: 'YES' -> a field that must match exactly before the (red) confirm button turns on.
// Rules: one dialog at a time (queue) · Esc / backdrop = cancel, Enter = confirm — NOT for danger dialogs (they need a button press;
// Enter works in the type-to-confirm field once it matches) · focus trap + focus goes back to the opener · the opener button is
// disabled while its dialog is open (no double submits) · role=dialog aria-modal labelled + described · prefers-reduced-motion.
// Test hook: window.UIDIALOG_TEST = { answer: true|false|fn(info), prompt: 'text' } answers at once and logs every dialog as
// console.debug('UIDIALOG ' + JSON.stringify({ type, title, msg })) — only the UI tests set it (docs/plan/tools/test_uidialog_ui.js).
(function () {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tag = (t, o) => Object.assign({ _ui: t }, o);
  const uiP = (...parts) => tag('p', { parts });
  const uiEm = (text) => tag('em', { text });
  const uiCode = (text) => tag('code', { text });
  const uiPath = (steps, o) => tag('path', { steps: (steps || []).filter(s => s != null && s !== ''), sep: (o && o.sep) || '›' });
  const uiList = (items, o) => tag('list', { items: items || [], ordered: !!(o && o.ordered) });
  const uiWarn = (...parts) => tag('warn', { parts });
  const uiNote = (...parts) => tag('note', { parts });
  const uiKV = (rows) => tag('kv', { rows: rows || [] });
  const uiH = (...parts) => tag('h', { parts });   // a small gold section heading inside the body

  // ---------- rendering (all text escaped) ----------
  function inl(x) {
    if (x == null || x === false) return '';
    if (Array.isArray(x)) return x.map(inl).join('');
    if (typeof x !== 'object') return E(x).replace(/\n/g, '<br>');
    switch (x._ui) {
      case 'em': return `<b class="uid-em">${E(x.text)}</b>`;
      case 'code': return `<code class="uid-code">${E(x.text)}</code>`;
      case 'path': return `<span class="uid-path">${x.steps.map((s, i) => (i ? `<span class="uid-sep" aria-hidden="true">${E(x.sep)}</span>` : '') + `<span class="uid-step">${inl(s)}</span>`).join('')}</span>`;
      case 'p': return inl(x.parts);
      default: return block(x);
    }
  }
  function textBlocks(s) {   // a plain string -> paragraphs + lists
    const out = [];
    String(s).replace(/\r/g, '').split(/\n{2,}/).forEach(chunk => {
      const lines = chunk.split('\n'); let para = [], list = [];
      const flushP = () => { if (para.length) { const t = para.join('\n').trim(); if (t) out.push(`<p>${E(t).replace(/\n/g, '<br>')}</p>`); para = []; } };
      const flushL = () => { if (list.length) { out.push(`<ul class="uid-list">${list.map(t => `<li>${E(t)}</li>`).join('')}</ul>`); list = []; } };
      lines.forEach(l => { const m = l.match(/^\s*(?:•|-|\*)\s+(.*)$/); if (m) { flushP(); list.push(m[1]); } else { flushL(); para.push(l.replace(/^\s{3,}/, '')); } });
      flushP(); flushL();
    });
    return out.join('');
  }
  function block(x) {
    if (x == null || x === false || x === '') return '';
    if (Array.isArray(x)) return x.map(block).join('');
    if (typeof x !== 'object') return textBlocks(x);
    switch (x._ui) {
      case 'p': return `<p>${inl(x.parts)}</p>`;
      case 'list': { const t = x.ordered ? 'ol' : 'ul'; return `<${t} class="uid-list">${x.items.filter(i => i != null && i !== '').map(i => `<li>${inl(i)}</li>`).join('')}</${t}>`; }
      case 'path': return `<p class="uid-pathp">${inl(x)}</p>`;
      case 'h': return `<h3 class="uid-h">${inl(x.parts)}</h3>`;
      case 'warn': return `<p class="uid-warn" role="note"><span class="uid-wi" aria-hidden="true">!</span><span>${inl(x.parts)}</span></p>`;
      case 'note': return `<p class="uid-note">${inl(x.parts)}</p>`;
      case 'kv': return `<dl class="uid-kv">${x.rows.map(r => `<dt>${inl(r[0])}</dt><dd>${inl(r[1])}</dd>`).join('')}</dl>`;
      default: return `<p>${inl(x)}</p>`;
    }
  }
  // plain text of rich content (test log + screen-reader fallback)
  function plain(x) {
    if (x == null || x === false) return '';
    if (Array.isArray(x)) return x.map(plain).filter(Boolean).join('\n');
    if (typeof x !== 'object') return String(x);
    switch (x._ui) {
      case 'em': case 'code': return String(x.text);
      case 'path': return x.steps.map(s => plainInl(s)).join(` ${x.sep} `);
      case 'list': return x.items.filter(i => i != null && i !== '').map(i => '• ' + plainInl(i)).join('\n');
      case 'kv': return x.rows.map(r => plainInl(r[0]) + ': ' + plainInl(r[1])).join('\n');
      default: return plainInl(x.parts);
    }
  }
  function plainInl(x) { return Array.isArray(x) ? x.map(plainInl).join('') : (x && typeof x === 'object' ? plain(x) : String(x == null ? '' : x)); }

  // ---------- opener tracking (iOS Safari never focuses a tapped button) ----------
  let lastTap = null, lastTapAt = 0;
  document.addEventListener('pointerdown', (e) => { const t = e.target && e.target.closest && e.target.closest('button, a, [role="button"], input, select, [tabindex], [data-cpact], [data-cmd]'); if (t && !t.closest('.uid-ov')) { lastTap = t; lastTapAt = Date.now(); } }, true);
  document.addEventListener('click', (e) => { const t = e.target && e.target.closest && e.target.closest('button, a, [role="button"], input, select, [tabindex]'); if (t && !t.closest('.uid-ov')) { lastTap = t; lastTapAt = Date.now(); } }, true);
  function opener() {   // the element just tapped / clicked (iOS: not focused) > the focused one (keyboard)
    if (lastTap && Date.now() - lastTapAt < 1000 && document.contains(lastTap)) return lastTap;
    const a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement && !a.closest('.uid-ov')) return a;
    return null;
  }

  // ---------- queue ----------
  const Q = []; let cur = null, seq = 0;
  function enqueue(spec) { return new Promise(resolve => { Q.push({ spec, resolve, from: opener() }); pump(); }); }
  function pump() { if (cur || !Q.length) return; cur = Q.shift(); try { show(cur); } catch (e) { const c = cur; cur = null; console.error('uidialog', e); c.resolve(c.spec.type === 'confirm' || c.spec.type === 'choice' ? (c.spec.type === 'confirm' ? false : null) : (c.spec.type === 'prompt' ? null : undefined)); pump(); } }

  const ICON = { info: 'i', error: '!', ok: '✓', warn: '!', danger: '!' };
  function show(job) {
    const s = job.spec, id = 'uid' + (++seq);
    const test = window.UIDIALOG_TEST;
    const disabledOpener = job.from && 'disabled' in job.from && /^(BUTTON|INPUT|SELECT)$/.test(job.from.tagName) && !job.from.disabled && !job.from.closest('.uid-ov') ? job.from : null;
    const ov = document.createElement('div');
    ov.className = 'uid-ov' + (s.danger ? ' uid-danger' : '') + (s.kind ? ' uid-k-' + s.kind : '');
    const kind = s.danger ? 'danger' : s.kind || (s.type === 'alert' ? 'info' : '');
    const btns = s.buttons.map((b, i) => `<button type="button" class="uid-btn${b.primary ? ' uid-primary' : ''}${b.danger ? ' uid-red' : ''}" data-uid="${i}"${b.primary && (s.typeToConfirm || s.type === 'prompt') ? ' disabled' : ''}>${E(b.label)}</button>`).join('');
    ov.innerHTML = `<div class="uid-card" role="${s.type === 'alert' && kind === 'error' ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}b" tabindex="-1">
      <div class="uid-head">${kind ? `<span class="uid-ic uid-ic-${kind}" aria-hidden="true">${ICON[kind] || 'i'}</span>` : ''}<h2 id="${id}t">${E(s.title)}</h2></div>
      <div class="uid-body" id="${id}b">${block(s.body)}${s.details ? `<details class="uid-det"><summary>${E(s.detailsLabel || 'Details')}</summary>${block(s.details)}</details>` : ''}
        ${s.type === 'prompt' ? `<label class="uid-field"><span class="uid-lbl">${E(s.label || '')}</span><input id="${id}i" class="uid-in" type="${E(s.inputType || 'text')}" value="${E(s.value == null ? '' : s.value)}" placeholder="${E(s.placeholder || '')}"${s.inputmode ? ` inputmode="${E(s.inputmode)}"` : ''} autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="${id}e"><span class="uid-err" id="${id}e" role="alert"></span></label>` : ''}
        ${s.typeToConfirm ? `<label class="uid-field uid-ttc"><span class="uid-lbl">Type <b>${E(s.typeToConfirm)}</b> to confirm</span><input id="${id}i" class="uid-in" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="${id}e"><span class="uid-err" id="${id}e"></span></label>` : ''}
      </div>
      <div class="uid-foot${s.buttons.length > 2 ? ' uid-many' : ''}">${btns}</div></div>`;
    document.body.appendChild(ov);
    document.documentElement.classList.add('uid-open');
    const card = ov.querySelector('.uid-card'), input = ov.querySelector('.uid-in'), err = ov.querySelector('.uid-err');
    const prim = ov.querySelector('.uid-primary');
    const openedAt = Date.now();
    if (disabledOpener) { disabledOpener.disabled = true; disabledOpener.setAttribute('data-uid-busy', '1'); }
    let done = false;
    const check = () => {   // -> true when the primary action may run
      if (s.typeToConfirm) { const okv = input.value.trim() === s.typeToConfirm; prim.disabled = !okv; return okv; }
      if (s.type === 'prompt') {
        let m = '';
        if (typeof s.validate === 'function') { try { const r = s.validate(input.value); m = r === true || r == null ? '' : String(r); } catch (e) { m = e.message; } }
        err.textContent = input.value === '' && !s.allowEmpty && !m ? '' : m;
        const okv = !m && (s.allowEmpty || input.value.trim() !== '');
        prim.disabled = !okv; input.setAttribute('aria-invalid', m ? 'true' : 'false'); return okv;
      }
      return true;
    };
    const finish = (i) => {   // i = button index, -1 = cancel
      if (done) return; done = true;
      const b = i >= 0 ? s.buttons[i] : null;
      let val;
      if (s.type === 'confirm') val = !!(b && b.primary);
      else if (s.type === 'prompt') val = b && b.primary ? input.value : null;
      else if (s.type === 'choice') val = b ? b.value : null;
      else val = undefined;
      window.removeEventListener('keydown', onKey, true);
      const close = () => {
        ov.remove();
        if (!document.querySelector('.uid-ov')) document.documentElement.classList.remove('uid-open');
        if (disabledOpener && disabledOpener.getAttribute('data-uid-busy')) { disabledOpener.disabled = false; disabledOpener.removeAttribute('data-uid-busy'); }
        const f = job.from;
        if (f && document.contains(f) && typeof f.focus === 'function') { try { f.focus({ preventScroll: true }); } catch (e) { } }
        cur = null; job.resolve(val); pump();
      };
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || test) close(); else { ov.classList.add('uid-out'); setTimeout(close, 140); }
    };
    const primIdx = s.buttons.findIndex(b => b.primary);
    const cancelIdx = s.buttons.findIndex(b => b.cancel);
    const cancel = () => finish(s.type === 'alert' ? 0 : cancelIdx);
    // clicks / taps inside the dialog never reach the page's own 'click outside = close' handlers (override menu, char pop-ups, sheets)
    ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend'].forEach(t => ov.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
    ov.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-uid]');
      if (b) { if (b.disabled) return; const i = +b.dataset.uid; if (i === primIdx && !check()) return; finish(i); return; }
      if (e.target === ov) {   // backdrop
        if (Date.now() - openedAt < 450) return;   // the second tap of a double tap on the opener
        if (s.danger) { card.classList.remove('uid-nudge'); void card.offsetWidth; card.classList.add('uid-nudge'); return; }
        cancel();
      }
    });
    if (input) input.addEventListener('input', check);
    function focusables() { return [...card.querySelectorAll('button:not([disabled]), input, summary, a[href], [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null || x === document.activeElement); }
    function onKey(e) {
      if (!document.contains(ov)) return;
      if (e.key === 'Tab' || e.key === 'Escape' || e.key === 'Enter') e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!s.danger) cancel(); else { card.classList.remove('uid-nudge'); void card.offsetWidth; card.classList.add('uid-nudge'); } return; }
      if (e.key === 'Enter') {
        if (e.repeat || Date.now() - openedAt < 300) { e.preventDefault(); return; }
        const t = document.activeElement;
        if (t && t.tagName === 'SUMMARY') return;
        if (t && t.tagName === 'BUTTON' && card.contains(t)) return;   // the focused button's own click
        if (s.danger && !(s.typeToConfirm && t === input)) return;
        e.preventDefault(); e.stopPropagation();
        if (s.type === 'alert') return finish(0);
        if (primIdx >= 0 && check()) finish(primIdx);
        return;
      }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) { e.preventDefault(); card.focus(); return; }
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
        return;
      }
      e.stopPropagation();   // no key reaches the page behind (its shortcuts / Esc handlers); typing in the field still works
    }
    window.addEventListener('keydown', onKey, true);   // window capture = before every page handler (charpage / cmdcenter Esc handlers)
    check();
    // first focus: the field > Cancel for danger > the primary button
    const firstFocus = input || (s.danger ? ov.querySelector(`[data-uid="${cancelIdx}"]`) : prim) || ov.querySelector('.uid-btn') || card;
    try { firstFocus.focus({ preventScroll: true }); if (input && s.type === 'prompt') input.select(); } catch (e) { }
    if (test) {   // UI tests: answer at once, log the dialog
      const info = { type: s.type, title: String(s.title || ''), msg: [s.title, plain(s.body), s.details ? plain(s.details) : ''].filter(Boolean).join('\n\n'), danger: !!s.danger, typeToConfirm: s.typeToConfirm || '', buttons: s.buttons.map(b => b.label) };
      try { console.debug('UIDIALOG ' + JSON.stringify(info)); } catch (e) { }
      let a = typeof test.answer === 'function' ? test.answer(info) : (test.answer === undefined ? true : test.answer);
      setTimeout(() => {
        if (s.type === 'alert') return finish(0);
        if (s.type === 'choice') { const pi = s.buttons.findIndex(b => b.primary), ni = s.buttons.findIndex(b => !b.cancel); const i = typeof a === 'number' ? a : (a === false || a == null ? -1 : (pi >= 0 ? pi : ni)); return finish(i >= 0 ? i : cancelIdx); }
        if (s.type === 'prompt') { if (a === false || a == null) return finish(cancelIdx); input.value = typeof a === 'string' ? a : (test.prompt != null ? test.prompt : input.value); return check() ? finish(primIdx) : finish(cancelIdx); }
        if (s.typeToConfirm && a) { input.value = typeof a === 'string' ? a : s.typeToConfirm; if (!check()) return finish(cancelIdx); }
        finish(a ? primIdx : cancelIdx);
      }, 20);
    }
  }

  const norm = (o) => (o == null || typeof o !== 'object' || o._ui || Array.isArray(o) ? { body: o } : o);
  function uiConfirm(o) {
    o = norm(o);
    const danger = !!o.danger;
    return enqueue({ type: 'confirm', title: o.title || 'Are you sure?', body: o.body, details: o.details, detailsLabel: o.detailsLabel, danger, typeToConfirm: o.typeToConfirm || '',
      buttons: [{ label: o.cancelText || 'Cancel', cancel: true }, { label: o.confirmText || 'OK', primary: true, danger }] });
  }
  function uiAlert(o) {
    o = norm(o);
    return enqueue({ type: 'alert', title: o.title || (o.kind === 'error' ? 'Something went wrong' : o.kind === 'ok' ? 'Done' : 'Note'), body: o.body, details: o.details, detailsLabel: o.detailsLabel, kind: o.kind || 'info',
      buttons: [{ label: o.okText || 'OK', primary: true, cancel: true }] });
  }
  function uiPrompt(o) {
    o = norm(o);
    return enqueue({ type: 'prompt', title: o.title || 'Enter a value', body: o.body, details: o.details, label: o.label, value: o.value, placeholder: o.placeholder, inputmode: o.inputmode, inputType: o.type,
      validate: o.validate, allowEmpty: !!o.allowEmpty, buttons: [{ label: o.cancelText || 'Cancel', cancel: true }, { label: o.confirmText || 'OK', primary: true }] });
  }
  function uiChoice(o) {
    o = norm(o);
    const bs = (o.buttons || []).map(b => ({ label: b.label, value: b.value, primary: !!b.primary, danger: !!b.danger, cancel: b.value == null }));
    if (!bs.some(b => b.cancel)) bs.unshift({ label: o.cancelText || 'Cancel', value: null, cancel: true });
    // cancel first (left / top), primary last (right / bottom)
    const ordered = [...bs.filter(b => b.cancel), ...bs.filter(b => !b.cancel && !b.primary), ...bs.filter(b => !b.cancel && b.primary)];
    return enqueue({ type: 'choice', title: o.title || 'Choose', body: o.body, details: o.details, danger: !!o.danger, buttons: ordered });
  }
  // the common "error from an API call" alert
  const uiError = (msg, title) => uiAlert({ title: title || 'Not done', body: msg, kind: 'error' });
  Object.assign(window, { uiConfirm, uiAlert, uiPrompt, uiChoice, uiError, uiH, uiP, uiEm, uiCode, uiPath, uiList, uiWarn, uiNote, uiKV });
  window.UIDialog = { confirm: uiConfirm, alert: uiAlert, prompt: uiPrompt, choice: uiChoice, error: uiError, render: block, plain, isOpen: () => !!cur, queued: () => Q.length };
})();
