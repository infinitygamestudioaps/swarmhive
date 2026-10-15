// HIVE SWITCHES on the character page (HIVESW-2026-10-15, owner-approved request of player Vykaax: "load my parties into Hive only for the
// dashboard, pathing and resupply, and set skills and heals in my own L2Swarm profile"). Box "Combat" on #/char/<Name>:
//   * Hive picks my skills / Hive heals / Hive uses potions: Like the party / Hive / My L2Swarm profile (party_auto.json chars.<Name>.skills|heals|potions)
//   * Toggles to keep on in fights: the character's own toggle skills as checkboxes (chars.<Name>.toggles); the built-in fight toggles are shown
//     as "always on in fights"; with no skill list (offline) a text box takes the names.
// Data: GET /api/partyauto (which party, effective values, fightToggles), POST /api/partyauto { party, chars: { <Name>: {...} }, rev }.
// Rules: plain words (ui-for-non-technical), no browser alert / confirm (UIDialog only), phone-friendly (44 px targets, one column).
// Exposes window.HiveSwitch = { render(el, name, skills) } — charpage.js calls it with every skill refresh; the box keeps unsaved edits.
(function () {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const call = (u, o) => (typeof api === 'function' ? api(u, o) : fetch(u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o || {})).then(r => r.json()));
  const KINDS = [['skills', 'Who picks the skills', "My L2Swarm profile (its Combat Skills tab)"], ['heals', 'Who heals', 'My L2Swarm profile (its Auto Skills tab)'], ['potions', 'Who drinks potions', 'Nobody (or L2Swarm / .autohp)']];
  const HS = { name: '', el: null, info: null, at: 0, loading: false, W: null, W0: null, busy: false, skills: [], err: '' };

  function css() {
    if (document.getElementById('hsCss')) return;
    const st = document.createElement('style'); st.id = 'hsCss';
    st.textContent = `.hs-box{display:flex;flex-direction:column;gap:10px}.hs-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px 12px}
.hs-tg{display:flex;flex-wrap:wrap;gap:6px}.hs-tg label{display:flex;align-items:center;gap:6px;min-height:40px;padding:4px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.12);cursor:pointer}
.hs-tg label.fixed{opacity:.75;cursor:default}.hs-tg input{width:20px;height:20px}.hs-what{font-size:13px;opacity:.8;line-height:1.4}
.hs-acts{display:flex;gap:8px;flex-wrap:wrap}.hs-acts .uk-btn{min-height:44px;min-width:96px}.hs-h{font-weight:600;font-size:14px;margin-top:4px}
.hs-txt{width:100%;min-height:40px;box-sizing:border-box;font:inherit;padding:6px 8px;border-radius:6px}`;
    document.head.appendChild(st);
  }
  const partyOf = (n) => { const I = HS.info; if (!I || !Array.isArray(I.parties)) return null; return I.parties.find(p => (p.members || []).includes(n)) || I.parties.find(p => p.leader === n) || null; };
  function model() {
    const I = HS.info, c = ((I && I.data && I.data.chars) || {})[HS.name] || {}, W = {};
    KINDS.forEach(([k]) => { W[k] = typeof c[k] === 'boolean' ? (c[k] ? 'on' : 'off') : ''; });
    W.toggles = Array.isArray(c.toggles) ? c.toggles.slice() : [];
    return W;
  }
  /** the party's value (what "Like the party" means) */
  function partyVal(k) { const p = partyOf(HS.name); if (p && p.eff && p.eff[k]) return !!p.eff[k].on; const K = (HS.info && HS.info.kinds || []).find(x => x.key === k); return K ? !!K.def : true; }
  async function load(force) {
    if (HS.loading || (!force && HS.info && Date.now() - HS.at < 30000)) return;
    HS.loading = true;
    try { const d = await call('/api/partyauto'); if (d && !d.error) { HS.info = d; HS.at = Date.now(); HS.err = ''; } else HS.err = (d && d.error) || 'no answer'; }
    catch (e) { HS.err = 'not available on this dashboard server yet (it needs a restart)'; }
    finally { HS.loading = false; }
    if (!HS.W || !dirty()) { HS.W = model(); HS.W0 = JSON.parse(JSON.stringify(HS.W)); }
    draw();
  }
  const dirty = () => !!(HS.W && HS.W0 && JSON.stringify(HS.W) !== JSON.stringify(HS.W0));
  function draw() {
    const el = HS.el; if (!el || !el.isConnected) return;
    css();
    if (!HS.info) { el.innerHTML = `<div class="muted">${E(HS.err || 'loading…')}</div>`; return; }
    const p = partyOf(HS.name), W = HS.W, fixed = (HS.info.fightToggles || []).map(String);
    const sels = KINDS.map(([k, lab, off]) => { const pv = partyVal(k);
      return `<label class="ps-field"><span class="ps-lab">${E(lab)}</span><select data-hssel="${k}">${[['', `Like the party (${pv ? 'Hive' : off.split(' (')[0]})`], ['on', 'Hive'], ['off', off]].map(([v, t]) => `<option value="${v}"${W[k] === v ? ' selected' : ''}>${E(t)}</option>`).join('')}</select></label>`; }).join('');
    const known = (HS.skills || []).filter(s => s && s.is_toggle).map(s => String(s.name));
    const fixedKnown = known.filter(n => fixed.some(f => f.toLowerCase() === n.toLowerCase()));
    const free = known.filter(n => !fixedKnown.includes(n));
    const extra = W.toggles.filter(n => !known.some(k => k.toLowerCase() === n.toLowerCase()));
    const tg = known.length ? `<div class="hs-tg">${fixedKnown.map(n => `<label class="fixed" title="Hive switches this on in every fight"><input type="checkbox" checked disabled> ${E(n)} <small>(always in fights)</small></label>`).join('')}
        ${free.concat(extra).map(n => `<label><input type="checkbox" data-hstg="${E(n)}"${W.toggles.some(t => t.toLowerCase() === n.toLowerCase()) ? ' checked' : ''}> ${E(n)}</label>`).join('')}</div>`
      : `<label class="ps-field"><span class="ps-lab">Toggle names, separated by commas (the skill list shows once the character is online)</span><input class="hs-txt" type="text" data-hstxt="1" value="${E(W.toggles.join(', '))}" placeholder="e.g. Arcane Power, War Frenzy"></label>`;
    const skillsOff = (W.skills === '' ? !partyVal('skills') : W.skills === 'off');
    el.innerHTML = `<div class="hs-box">
      <div class="hs-what">${p ? `Party <b>${E(p.leader)}</b>. ` : ''}Choose what Hive does in fights for <b>${E(HS.name)}</b>. Hive keeps walking, following, resupplying and resurrecting either way.</div>
      <div class="hs-row">${sels}</div>
      ${skillsOff ? '<div class="hs-what">Set up the Combat Skills (and Auto Skills for heals) in this character\'s L2Swarm profile first — with Hive off, only your profile casts.</div>' : ''}
      <div class="hs-h">Toggles to keep on in fights</div>
      <div class="hs-what">Hive switches toggles ON only in fights and OFF afterwards and in towns. It always uses ${E(fixed.join(', '))} when known (and the tank stances for a tank). Tick other toggles you want on in fights too — e.g. not Strike Back or Arcane Power unless you really want them, they cost a lot of MP.${skillsOff ? ' (With "Who picks the skills" on your profile, Hive does not touch toggles at all.)' : ''}</div>
      ${tg}
      <div class="hs-acts"><button type="button" class="uk-btn primary" data-hsact="save"${dirty() && !HS.busy ? '' : ' disabled'}>${HS.busy ? 'Saving…' : 'Save'}</button><button type="button" class="uk-btn ghost" data-hsact="undo"${dirty() && !HS.busy ? '' : ' disabled'}>Undo</button></div>
    </div>`;
  }
  async function save() {
    if (HS.busy || !dirty()) return;
    const p = partyOf(HS.name);
    if (!p) { if (window.UIDialog) await UIDialog.alert({ title: 'No party found', kind: 'error', body: `${HS.name} is not in a party the dashboard knows yet.` }); return; }
    const a = HS.W0, b = HS.W, cv = {};
    KINDS.forEach(([k]) => { if (a[k] !== b[k]) cv[k] = b[k] === '' ? null : b[k] === 'on'; });
    if (JSON.stringify(a.toggles) !== JSON.stringify(b.toggles)) cv.toggles = b.toggles.length ? b.toggles : null;
    HS.busy = true; draw();
    let d = null;
    try { d = await call('/api/partyauto', { method: 'POST', body: JSON.stringify({ party: p.leader, chars: { [HS.name]: cv }, rev: HS.info.rev, by: 'character page' }) }); }
    catch (e) { d = { error: e.message }; }
    HS.busy = false;
    if (d && d.ok) {
      HS.W = null; await load(true);
      if (window.UIKit && UIKit.toast) UIKit.toast(`${HS.name}: combat settings saved`, { kind: 'ok' });
    } else {
      draw();
      if (window.UIDialog) await UIDialog.alert({ title: 'Not saved', kind: 'error', body: (d && d.conflict) ? 'The settings were changed meanwhile (another page). Press Undo to see them, then try again.' : String((d && d.error) || 'no answer') });
      if (d && d.conflict) { HS.W = null; await load(true); }
    }
  }
  function bind(el) {
    if (el._hsBound) return; el._hsBound = true;
    el.addEventListener('change', (e) => {
      const t = e.target; if (!HS.W) return;
      if (t.dataset.hssel) { HS.W[t.dataset.hssel] = t.value; draw(); return; }
      if (t.dataset.hstg) { const n = t.dataset.hstg, L = HS.W.toggles, i = L.findIndex(x => x.toLowerCase() === n.toLowerCase()); if (t.checked && i < 0) L.push(n); if (!t.checked && i >= 0) L.splice(i, 1); draw(); return; }
      if (t.dataset.hstxt) { HS.W.toggles = [...new Set(String(t.value).split(',').map(x => x.trim()).filter(Boolean))].slice(0, 30); draw(); }
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-hsact]'); if (!b || b.disabled) return;
      e.preventDefault();
      if (b.dataset.hsact === 'save') save();
      else if (b.dataset.hsact === 'undo') { HS.W = JSON.parse(JSON.stringify(HS.W0)); draw(); }
    });
  }
  function render(el, name, skills) {
    if (!el || !name) return;
    const changed = name !== HS.name || el !== HS.el;
    if (changed) { HS.name = name; HS.W = null; HS.W0 = null; HS.el = el; bind(el); }
    const sk = Array.isArray(skills) ? skills.filter(s => s && s.is_toggle).map(s => s.name).join('|') : '';
    const skChanged = sk !== (HS.skills || []).filter(s => s && s.is_toggle).map(s => s.name).join('|');
    HS.skills = Array.isArray(skills) ? skills : HS.skills;
    if (changed || !HS.info) { HS.W = HS.info ? model() : null; if (HS.W) HS.W0 = JSON.parse(JSON.stringify(HS.W)); load(changed); draw(); return; }
    if (Date.now() - HS.at > 30000 && !dirty()) load(true);
    if (skChanged || !el.firstChild) draw();
  }
  window.HiveSwitch = { render, _state: HS };
})();
