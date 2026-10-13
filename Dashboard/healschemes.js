// HEAL SCHEMES editor (public tester 2026-10-13: "ability to set own heal / MP schemes"; also "SE uses Self Heal at lvl 80" and "no MP
// recharge from SE/EE"). Rules: manual-config-first (everything is "Automatic (best skill you know)" until the player changes it),
// ui-for-non-technical (plain words, ids / file names only under "Details"), no-browser-alerts (uidialog.js only), phone-first sheet.
//
// One sheet per character: which skill at which HP % (heal a teammate / someone is dying / party heal / heal myself), MP for teammates
// (Recharge: on / below % / casters only or everyone), who first, the healer's own mana potion line, a "never use" list, and L2Swarm's own
// Self Heal auto-skill. "Only <Name>" or "Every <class>" (the class default; a character's own settings win). Save writes
// Scripts/data/heal_schemes.json through /api/healschemes (rev check: changed meanwhile -> "Load theirs / Overwrite").
// Opened from: the character page ("✚ Healing" button) and the party settings popup (section "Healing", Edit per member).
// Exposes window.HealSchemes = { button(name, small), open(name), close(), canHeal(name, state), partySummary(leader, members), partyBody(leader, members), load(force), _state }.
(function () {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const call = (u, o) => (typeof api === 'function' ? api(u, o) : fetch(u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o || {})).then(r => r.json()));
  const HL = () => window.HealLogic;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const SIT = {
    single: { title: 'Heal a teammate', help: 'Normal heals: anyone in the party below this HP %.', ic: '✚' },
    emergency: { title: 'Someone is dying', help: 'A fast, strong heal on anyone below this HP %.', ic: '⚠' },
    group: { title: 'Party heal', help: 'When this many party members are below the HP %.', ic: '❖' },
    self: { title: 'Heal myself', help: 'When this character is not the party healer (it fights or buffs) and its own HP drops. Self Heal is only used when it knows no other heal.', ic: '♥' },
    recharge: { title: 'MP for teammates (Recharge)', help: 'Gives MP to a teammate below this MP %, when nobody needs HP.', ic: '💧' } };
  const PRI = [['auto', 'Automatic'], ['tank', 'Tank'], ['healers', 'Healers'], ['lowest', 'Lowest HP']];   // short: four fit a 390 px phone
  const PRI_HELP = { auto: 'The lowest HP first. In raids the tank always comes first below 60 % (raid rule).', tank: 'The tank (and the party leader in raids) first, then the lowest HP.', healers: 'Healers first (so the healers stay alive), then the lowest HP.', lowest: 'Always the lowest HP first. In raids the tank still comes first below 60 % (raid rule).' };
  const HS = { open: false, name: '', data: null, at: 0, loading: null, scope: 'char', F: null, F0: null, busy: false, msg: '', opener: null, err: '' };

  // ============================================================================================ data
  async function load(force) {
    if (!force && HS.data && Date.now() - HS.at < 5000) return HS.data;
    if (HS.loading) return HS.loading;
    HS.loading = (async () => {
      try { const d = await call('/api/healschemes'); if (d && !d.error) { HS.data = d; HS.at = Date.now(); HS.err = ''; } else HS.err = (d && d.error) || 'no answer'; }
      catch (e) { HS.err = 'The heal settings are not available on this dashboard server yet (it needs a restart).'; }
      finally { HS.loading = null; }
      try { document.dispatchEvent(new CustomEvent('healschemes')); } catch (e) { }
      return HS.data;
    })();
    return HS.loading;
  }
  const rowOf = (n) => (HS.data && (HS.data.chars || []).find(c => c.name === n)) || null;
  const skillName = (id) => { const s = HS.data && HS.data.skills ? HS.data.skills[id] : null; return s ? s.name : 'skill ' + id; };
  function skillLine(k) {
    const s = (HS.data && HS.data.skills && HS.data.skills[k.id]) || {};
    const pw = k.power != null ? k.power : s.power, kind = k.kind || s.kind;
    const cast = s.hit ? ` · ${(s.hit / 1000).toFixed(s.hit % 1000 ? 1 : 0)} s cast` : '';
    if (/Pct$/.test(kind)) return `${k.name || s.name} — ${pw} % of max HP${cast}`;
    if (kind === 'balance') return `${k.name || s.name} — evens out the party HP${cast}`;
    if (/recharge/i.test(kind)) return `${k.name || s.name} — ${pw} MP${cast}`;
    return `${k.name || s.name} — power ${pw}${cast}`;
  }
  /** the skills offered for a situation: the character's (scope char) or its class line's at their top level (scope class) */
  function optionsFor(sit, R) {
    const L = HL(); if (!L) return [];
    let known = R ? R.known || [] : [];
    if (HS.scope === 'class' && R && HS.data.classSkills && HS.data.classSkills[R.classId]) known = HS.data.classSkills[R.classId].map(id => ({ id, name: skillName(id), kind: (HS.data.skills[id] || {}).kind, power: (HS.data.skills[id] || {}).power }));
    return known.filter(k => (L.HS_CHOOSE[sit] || []).includes(k.kind));
  }

  // ============================================================================================ form <-> scheme
  /** the stored scheme (partial) -> form values ('' / 'auto' / null = automatic) */
  function toForm(s) {
    s = s || {};
    const f = { never: (s.never || []).slice(), priority: s.priority || 'auto', potion: s.potion && s.potion.below !== 'auto' && s.potion.below != null ? String(s.potion.below) : '', xml: s.xmlSelfHeal || 'auto' };
    ['single', 'emergency', 'group', 'self', 'recharge'].forEach(k => {
      const x = s[k] || {};
      f[k] = { skill: x.skill != null && x.skill !== 'auto' ? String(x.skill) : 'auto', below: x.below != null ? String(x.below) : '' };
      if (k === 'group') f[k].count = x.count != null ? String(x.count) : '';
      if (k === 'recharge') { f[k].on = typeof x.on === 'boolean' ? x.on : null; f[k].who = x.who || ''; }
    });
    return f;
  }
  function toScheme(f) {
    const s = {};
    ['single', 'emergency', 'group', 'self', 'recharge'].forEach(k => {
      const x = f[k], o = {};
      if (x.skill && x.skill !== 'auto') o.skill = Number(x.skill);
      if (String(x.below).trim() !== '') o.below = Number(String(x.below).trim());
      if (k === 'group' && String(x.count).trim() !== '') o.count = Number(String(x.count).trim());
      if (k === 'recharge') { if (x.on === false) o.on = false; if (x.who) o.who = x.who; }
      if (Object.keys(o).length) s[k] = o;
    });
    if (f.priority && f.priority !== 'auto') s.priority = f.priority;
    if (String(f.potion).trim() !== '') s.potion = { below: Number(String(f.potion).trim()) };
    if (f.never.length) s.never = f.never.map(Number);
    if (f.xml === 'keep') s.xmlSelfHeal = 'keep';
    return s;
  }
  const dirty = () => !!HS.F && JSON.stringify(toScheme(HS.F)) !== JSON.stringify(toScheme(HS.F0));
  /** what runs without this scope's own entry (placeholders): class scope = automatic; char scope = automatic + the class scheme */
  function baseScheme(R) {
    const L = HL(); if (!L) return null;
    if (HS.scope === 'class') return clone(L.HS_DEFAULT);
    return L.hsEffective({ classes: HS.data.classes || {}, chars: {} }, R.name, R.classId).scheme;
  }
  function liveScheme(R) { const L = HL(), b = baseScheme(R); return L && b ? L.hsMergeScheme(b, L.hsClean(toScheme(HS.F))) : null; }
  function autoPick(R, sit) {
    const L = HL(); if (!L || !R) return null;
    const sc = liveScheme(R); if (!sc) return null;
    const auto = clone(sc); auto[sit] = Object.assign({}, auto[sit], { skill: 'auto' });
    const sk = (HS.data && HS.data.skills) || {};
    const known = (R.known || []).map(k => Object.assign({}, k, { ready: true, mp: 0, hit: k.hit != null ? k.hit : (sk[k.id] || {}).hit || 0, reuse: k.reuse != null ? k.reuse : (sk[k.id] || {}).reuse || 0 }));
    return L.hsPick(known, sit, auto, { forMe: sit === 'self' });
  }

  // ============================================================================================ render
  function frame() {
    let ov = document.getElementById('hsOv'); if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'hsOv'; ov.className = 'hs-ov'; ov.hidden = true;
    ov.innerHTML = `<div class="hs-dlg" role="dialog" aria-modal="true" aria-labelledby="hsTitle">
      <div class="hs-head"><h2 id="hsTitle">Healing</h2><button type="button" class="hs-x" data-hsact="close" aria-label="Close">✕</button></div>
      <div class="hs-scroll" id="hsScroll"><div id="hsBody"></div></div>
      <div class="hs-bar" id="hsBar"></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', onClick);
    ov.addEventListener('change', onChange);
    ov.addEventListener('input', onInput);
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !(window.UIDialog && UIDialog.isOpen())) { e.preventDefault(); close(); } });
    return ov;
  }
  const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - Number(t)) / 1000)); return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
  function statusLine(R) {
    if (!R.live) return `<div class="hs-status">${R.online ? 'Online, but its bot has not reported its skills yet (the new heal rules start after the next script update).' : 'Offline — the skills below are what its class knows at level ' + E(R.level || '?') + '.'}</div>`;
    const how = R.mode === 'healer' ? '<b>Party healer</b>: it heals, never attacks.' : '<b>Heals when needed</b>: it heals when someone is low, otherwise it fights or buffs.';
    const last = R.last && R.last.at ? ` Last heal: ${E(R.last.skill)} on ${E(R.last.target)} (${E(R.last.hp)} % HP), ${ago(R.last.at)}.` : '';
    const rc = R.lastRc && R.lastRc.at ? ` Last MP gift: ${E(R.lastRc.skill)} on ${E(R.lastRc.target)} (${E(R.lastRc.mp)} % MP), ${ago(R.lastRc.at)}.` : '';
    return `<div class="hs-status">${how}${last}${rc}</div>`;
  }
  function seg(path, cur, opts, label) {
    return `<div class="ps-field"><span class="ps-lab">${E(label)}</span><div class="ps-seg" role="radiogroup" aria-label="${E(label)}">${opts.map(([v, t]) => `<button type="button" role="radio" aria-checked="${String(cur) === String(v)}" data-hsseg="${E(path)}" data-v="${E(v)}">${E(t)}</button>`).join('')}</div></div>`;
  }
  function num(path, val, label, ph, unit) {
    return `<label class="ps-field sm hs-num"><span class="ps-lab">${E(label)}</span><span class="hs-inrow"><input type="text" inputmode="numeric" autocomplete="off" data-hsin="${E(path)}" value="${E(val)}" placeholder="${E(ph)}"><span class="hs-unit">${E(unit || '')}</span></span></label>`;
  }
  function skillSel(sit, R) {
    const opts = optionsFor(sit, R), cur = HS.F[sit].skill, ap = autoPick(R, sit);
    const autoTxt = ap ? `Automatic — ${ap.name}` : 'Automatic (best skill it knows)';
    const has = cur === 'auto' || opts.some(k => String(k.id) === cur);
    return `<label class="ps-field hs-skill"><span class="ps-lab">Skill</span><select data-hssel="${sit}.skill"><option value="auto"${cur === 'auto' ? ' selected' : ''}>${E(autoTxt)}</option>${opts.map(k => `<option value="${k.id}"${String(k.id) === cur ? ' selected' : ''}>${E(skillLine(k))}</option>`).join('')}${has ? '' : `<option value="${E(cur)}" selected>${E(skillName(cur))} (not learned)</option>`}</select></label>`;
  }
  function sitCard(sit, R, B) {
    const S = SIT[sit], f = HS.F[sit], b = B[sit] || {};
    const opts = optionsFor(sit, R);
    let body = '';
    if (sit === 'recharge') {
      const on = f.on === null ? b.on !== false : f.on;
      if (!opts.length) body = `<div class="ps-note">${HS.scope === 'class' ? 'This class line has no Recharge skill.' : 'This character has no Recharge skill (Shillien / Elven Oracles learn it from level 30, Mass Recharge comes at 80).'}</div>`;
      body = `<button type="button" class="uk-switch" role="switch" aria-checked="${on}" data-hssw="recharge.on"><span class="uk-track"><span class="uk-knob"></span></span><span class="uk-sl"><b>Give MP to teammates</b><span>${on ? 'On — it gives MP when nobody needs HP' : 'Off — it never gives MP'}</span></span></button>` + body;
      if (on) body += `<div class="hs-fields">${num('recharge.below', f.below, 'When MP is below', String(b.below), '%')}${seg('recharge.who', f.who || b.who || 'casters', [['casters', 'Casters only'], ['everyone', 'Everyone']], 'Who gets MP')}</div>${opts.length ? skillSel(sit, R) : ''}`;
    } else {
      if (!opts.length && sit !== 'self') body = `<div class="ps-note">${HS.scope === 'class' ? 'This class line has no such skill.' : 'This character knows no such skill yet.'}</div>`;
      body += `<div class="hs-fields">${sit === 'group' ? num('group.count', f.count, 'When this many', String(b.count), 'members') : ''}${num(sit + '.below', f.below, sit === 'group' ? 'are below' : 'When HP is below', String(b.below), '%')}</div>`;
      if (opts.length || sit === 'self') body += skillSel(sit, R);
    }
    const own = JSON.stringify(toScheme(HS.F)[sit] || {}) !== '{}';
    return `<section class="hs-card"><div class="hs-ct"><span class="hs-ic" aria-hidden="true">${S.ic}</span><b>${E(S.title)}</b>${own ? '<span class="hs-chg">changed</span>' : '<span class="hs-auto">automatic</span>'}</div><div class="ps-what">${E(S.help)}</div>${body}</section>`;
  }
  function render() {
    const ov = frame(), sc = document.getElementById('hsScroll'), top = sc ? sc.scrollTop : 0;
    const R = rowOf(HS.name);
    document.getElementById('hsTitle').textContent = `Healing — ${HS.name}`;
    const body = document.getElementById('hsBody');
    if (!HS.data || !HL()) { body.innerHTML = `<div class="ps-note">${E(HS.err || 'Loading the heal settings…')}</div>`; renderBar(); return; }
    if (!HS.F) setScopeForm();                                           // opened while the data was already cached
    if (!R) { body.innerHTML = `<div class="ps-note">${E(HS.name)} has not been seen by the dashboard yet. Log it in once, then open this again.</div>`; renderBar(); return; }
    if (!R.canHeal) { body.innerHTML = `<div class="hs-who">${E(R.cls || '')} · level ${E(R.level || '?')}</div><div class="ps-note">${E(R.name)} knows no heal or MP skill${R.level ? ' at level ' + E(R.level) : ''}. Mystics learn Heal at level 7; healers (Cleric, Shillien / Elven Oracle) learn much more after the class change at 20.</div>`; renderBar(); return; }
    const B = baseScheme(R), cname = (HS.data.classNames || {})[R.classId] || R.cls || 'class';
    const pri = HS.F.priority;
    const never = (R.known || []).map(k => `<button type="button" class="hs-chip" aria-pressed="${HS.F.never.includes(k.id)}" data-hsnever="${k.id}">${E(k.name)}</button>`).join('');
    body.innerHTML = `
      <div class="hs-who">${E(R.cls || '')} · level ${E(R.level || '?')}${R.party ? ` · party ${E(R.party)}` : ''}</div>
      ${statusLine(R)}
      <div class="ps-what">Everything says <b>Automatic</b> until you change it: then it uses the best skill it knows for the job. Change only what you want; leave a box empty for automatic.</div>
      ${seg('scope', HS.scope, [['char', 'Only ' + R.name], ['class', 'Every ' + cname]], 'These settings are for')}
      ${HS.scope === 'class' ? `<div class="ps-note info">Every ${E(cname)} uses these, unless that character has its own settings${R.own ? ` (<b>${E(R.name)} has its own</b>, they win)` : ''}.</div>` : (R.classScheme ? `<div class="ps-note info">Grey values come from the settings for every ${E(cname)}.</div>` : '')}
      ${['emergency', 'single', 'group', 'self', 'recharge'].map(s => sitCard(s, R, B)).join('')}
      <section class="hs-card"><div class="hs-ct"><span class="hs-ic" aria-hidden="true">☰</span><b>Who first</b>${pri !== 'auto' ? '<span class="hs-chg">changed</span>' : '<span class="hs-auto">automatic</span>'}</div>
        ${seg('priority', pri, PRI, 'Who gets healed first')}<div class="ps-what">${E(PRI_HELP[pri] || '')}</div></section>
      <section class="hs-card"><div class="hs-ct"><span class="hs-ic" aria-hidden="true">🧪</span><b>Mana potion for itself</b>${HS.F.potion !== '' ? '<span class="hs-chg">changed</span>' : '<span class="hs-auto">automatic</span>'}</div>
        <div class="ps-what">The healer drinks a Mana Potion below this MP %. Empty = automatic (${E(B && B.potion && B.potion.below !== 'auto' ? B.potion.below : 70)} %). In raids and dungeons it always drinks below 90 % (raid rule).</div>
        <div class="hs-fields">${num('potion', HS.F.potion, 'Drink below', String(B && B.potion && B.potion.below !== 'auto' ? B.potion.below : 70), '% MP')}</div></section>
      <section class="hs-card"><div class="hs-ct"><span class="hs-ic" aria-hidden="true">⛔</span><b>Never use</b>${HS.F.never.length ? '<span class="hs-chg">changed</span>' : '<span class="hs-auto">none</span>'}</div>
        <div class="ps-what">Tap a skill to never use it for healing or MP (also not automatically).</div><div class="hs-chips">${never}</div></section>
      <details class="hs-adv"><summary>Details</summary>
        <div class="ps-what">L2Swarm's own auto-skill "Self Heal" (in the character's L2Swarm config) heals with the weakest heal. For healer classes that know a real heal, the bot switches it off while running (the config file is not changed).</div>
        ${seg('xml', HS.F.xml, [['auto', 'Switch it off (recommended)'], ['keep', 'Keep it']], "L2Swarm's own Self Heal")}
        ${R.xml ? `<div class="ps-what">Now: ${E(R.xml === 'off' ? 'switched off' : R.xml === 'kept' ? 'kept on (your choice)' : R.xml)}.</div>` : ''}
        <div class="ps-what">Saved in Scripts/data/heal_schemes.json (${HS.scope === 'class' ? 'classes.' + E(R.classId) : 'chars.' + E(R.name)}). The bots read it within a few seconds. Skill data: Scripts/data/heal_skills.json.</div>
        <div class="ps-what">Raid rules stay: no heals on a Destroyer that lowers its HP for Frenzy, healers only heal, the tank first below 60 % in raids.</div>
      </details>`;
    renderBar();
    if (sc) sc.scrollTop = top;
  }
  function errors() { const L = HL(); return L ? L.hsValidate(toScheme(HS.F)) : { errors: [], warnings: [] }; }
  function renderBar() {
    const el = document.getElementById('hsBar'); if (!el) return;
    const R = rowOf(HS.name), v = HS.F ? errors() : { errors: [] }, d = dirty();
    const own = R && (HS.scope === 'class' ? R.classScheme : R.own);
    const sum = HS.msg ? HS.msg : v.errors.length ? `<span class="bad">${E(v.errors[0])}</span>` : d ? '<b>Unsaved changes</b>' : own ? 'Saved' : 'All automatic';
    el.innerHTML = `<div class="hs-bsum" role="status">${sum}</div><div class="hs-bbtn">
      <button type="button" class="uk-btn ghost" data-hsact="reset"${own && !HS.busy ? '' : ' disabled'} title="Remove these settings: back to automatic">Reset</button>
      <button type="button" class="uk-btn secondary" data-hsact="undo"${d && !HS.busy ? '' : ' disabled'}>Undo</button>
      <button type="button" class="uk-btn primary" data-hsact="save"${d && !v.errors.length && !HS.busy ? '' : ' disabled'}>${HS.busy ? 'Saving…' : 'Save'}</button></div>`;
  }
  function setScopeForm() {
    const R = rowOf(HS.name);
    HS.F = toForm(R ? (HS.scope === 'class' ? R.classScheme : R.own) : null); HS.F0 = clone(HS.F);
  }

  // ============================================================================================ events
  function setP(p, v) { const ks = p.split('.'); let o = HS.F; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }
  function onInput(e) { const t = e.target; if (!t.dataset || !t.dataset.hsin) return; setP(t.dataset.hsin, t.value.replace(/[^\d]/g, '')); HS.msg = ''; renderBar(); }
  function onChange(e) {
    const t = e.target; if (!t.dataset) return;
    if (t.dataset.hsin) { t.value = t.value.replace(/[^\d]/g, ''); setP(t.dataset.hsin, t.value); HS.msg = ''; renderBar(); return; }   // no re-render: the next field keeps the focus
    if (t.dataset.hssel) { setP(t.dataset.hssel, t.value); HS.msg = ''; render(); }
  }
  async function onClick(e) {
    const t = e.target;
    if (t === document.getElementById('hsOv')) { close(); return; }
    const g = t.closest('[data-hsseg]');
    if (g) {
      e.preventDefault(); const p = g.dataset.hsseg, v = g.dataset.v;
      if (p === 'scope') { if (v === HS.scope) return; if (dirty() && !(await uiConfirm({ title: 'Throw away your changes?', body: 'Switching between "only this character" and "every character of the class" drops the changes you did not save.', confirmText: 'Throw away', cancelText: 'Keep editing' }))) return; HS.scope = v; setScopeForm(); HS.msg = ''; render(); return; }
      setP(p, p === 'recharge.who' && v === 'casters' ? '' : v); HS.msg = ''; render(); return;
    }
    const s = t.closest('[data-hssw]');
    if (s) { e.preventDefault(); const R = rowOf(HS.name), B = baseScheme(R) || {}; const cur = HS.F.recharge.on === null ? (B.recharge || {}).on !== false : HS.F.recharge.on; HS.F.recharge.on = !cur === ((B.recharge || {}).on !== false) ? null : !cur; HS.msg = ''; render(); return; }
    const nv = t.closest('[data-hsnever]');
    if (nv) { e.preventDefault(); const id = Number(nv.dataset.hsnever), L = HS.F.never, i = L.indexOf(id); if (i >= 0) L.splice(i, 1); else L.push(id); HS.msg = ''; render(); return; }
    const a = t.closest('[data-hsact]'); if (!a) return;
    e.preventDefault();
    const act = a.dataset.hsact;
    if (act === 'close') { close(); return; }
    if (act === 'undo') { HS.F = clone(HS.F0); HS.msg = ''; render(); return; }
    if (act === 'save') { save(false); return; }
    if (act === 'reset') {
      const R = rowOf(HS.name), cname = (HS.data.classNames || {})[R.classId] || R.cls;
      if (!(await uiConfirm({ title: 'Back to automatic?', body: HS.scope === 'class' ? `Remove the settings for every ${cname}. Characters with their own settings keep them.` : `Remove ${HS.name}'s own settings. It heals automatically again${R.classScheme ? ' (or with the settings for every ' + cname + ')' : ''}.`, confirmText: 'Back to automatic', cancelText: 'Keep my settings' }))) return;
      save(false, 'clear');
    }
  }
  async function save(force, action) {
    const R = rowOf(HS.name); if (!R || HS.busy) return;
    HS.busy = true; HS.msg = ''; renderBar();
    const body = { action: action || 'set', scope: HS.scope, name: R.name, classId: R.classId, scheme: toScheme(HS.F), rev: force ? null : HS.data.rev };
    let r = null;
    try { r = await call('/api/healschemes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (e) { r = { error: 'The dashboard server did not answer (it may need a restart).' }; }
    HS.busy = false;
    if (r && r.ok) {
      if (r.state) { HS.data = r.state; HS.at = Date.now(); }
      setScopeForm();
      HS.msg = action === 'clear' ? 'Back to automatic' : 'Saved — the bot uses it within a few seconds';
      render();
      try { document.dispatchEvent(new CustomEvent('healschemes')); } catch (e) { }
      if (r.warnings && r.warnings.length) await uiAlert({ title: 'Saved — please check', body: r.warnings.map(w => '• ' + w).join('\n'), kind: 'info' });
      return;
    }
    if (r && r.rev && /changed meanwhile/i.test(r.error || '')) {
      const c = await uiChoice({ title: 'Changed meanwhile', body: 'Someone (another page or another person) changed the heal settings since you opened them.', buttons: [{ label: 'Overwrite with mine', value: 'mine', primary: true }, { label: 'Load theirs (drop mine)', value: 'theirs' }] });
      if (c === 'mine') { await load(true); return save(true, action); }
      if (c === 'theirs') { await load(true); setScopeForm(); render(); }
      return;
    }
    renderBar();
    await uiAlert({ title: 'Not saved', body: (r && r.errors && r.errors.length ? r.errors.map(x => '• ' + x).join('\n') : (r && r.error) || 'Unknown error'), kind: 'error' });
  }

  // ============================================================================================ open / close
  async function open(name) {
    if (!name) return;
    HS.opener = document.activeElement;
    const ov = frame(); HS.open = true; HS.name = name; HS.scope = 'char'; HS.F = null; HS.msg = '';
    ov.hidden = false; document.documentElement.classList.add('hs-lock');
    render();
    try { ov.querySelector('.hs-x').focus(); } catch (e) { }
    await load(true);
    if (!HS.open || HS.name !== name) return;
    setScopeForm(); render();
  }
  async function close() {
    if (!HS.open) return true;
    if (dirty() && !(await uiConfirm({ title: 'Close without saving?', body: `${HS.name}'s heal settings have unsaved changes.`, confirmText: 'Close without saving', cancelText: 'Keep editing' }))) return false;
    HS.open = false;
    const ov = document.getElementById('hsOv'); if (ov) ov.hidden = true;
    document.documentElement.classList.remove('hs-lock');
    try { if (HS.opener && HS.opener.focus) HS.opener.focus(); } catch (e) { }
    return true;
  }
  // buttons anywhere on the page (character page, party settings popup)
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-hsopen]'); if (!b) return; e.preventDefault(); e.stopPropagation(); open(b.dataset.hsopen); }, true);

  // ============================================================================================ embeds
  function button(name, small) { return `<button type="button" class="hsbtn${small ? ' sm' : ''}" data-hsopen="${E(name)}" title="Which heal / MP skill ${E(name)} uses, at which HP % (automatic until you change it)">✚ Healing</button>`; }
  function rowSummary(R) {
    if (!R) return 'not seen yet';
    if (!R.canHeal) return 'no heal skills';
    const own = R.own ? 'own settings' : R.classScheme ? 'class settings' : 'automatic';
    const a = R.auto || {}, parts = [a.single && a.single.name, a.group && a.group.name, R.scheme && R.scheme.recharge && R.scheme.recharge.on !== false && a.recharge && a.recharge.name].filter(Boolean);
    return `${own}${parts.length ? ' · ' + parts.join(', ') : ''}`;
  }
  function partySummary(leader, members) {
    if (!HS.data) { load(); return HS.err ? 'not available' : 'loading…'; }
    const rs = (members || []).map(rowOf).filter(r => r && r.canHeal);
    if (!rs.length) return 'nobody in this party can heal';
    const own = rs.filter(r => r.own || r.classScheme).length;
    return `${rs.length} can heal · ${own ? own + ' with own settings' : 'all automatic'}`;
  }
  function partyBody(leader, members) {
    if (!HS.data) { load(); return `<div class="ps-note">${E(HS.err || 'Loading the heal settings…')}</div>`; }
    const rows = (members || []).map(n => [n, rowOf(n)]), can = rows.filter(([, r]) => r && r.canHeal), cannot = rows.filter(([, r]) => !r || !r.canHeal).map(([n]) => n);
    const list = can.map(([n, R]) => `<div class="hs-prow"><div class="hs-pt"><b>${E(n)}</b><span>${E(R.cls || '')}${R.level ? ' · ' + E(R.level) : ''} — ${E(rowSummary(R))}</span></div><button type="button" class="uk-btn secondary hs-pedit" data-hsopen="${E(n)}">Edit</button></div>`).join('');
    return `<div class="ps-what">Which heal or MP skill each character uses, at which HP %. Everything is automatic (the best skill it knows) until you change it.</div>${list || '<div class="ps-note">Nobody in this party knows a heal skill.</div>'}${cannot.length && can.length ? `<div class="ps-what">No heal skills: ${E(cannot.join(', '))}.</div>` : ''}`;
  }
  /** show the "Healing" button? the bot reported heal skills (swarm_state healPlan), or the dashboard knows it can heal (loaded lazily) */
  function canHeal(name, st) {
    if (st && st.healPlan) return true;
    const R = rowOf(name); if (R) return !!R.canHeal;
    if (!HS.data && !HS.loading && !HS.err) load();
    return false;
  }
  window.HealSchemes = { button, open, close, canHeal, partySummary, partyBody, load, _state: HS, _toScheme: toScheme, _toForm: toForm };
})();
