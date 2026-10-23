// BUFFS page #/buffs (user 2026-10-10: a friend "runs every single class" and uses no community buffer — per party and per buffer character
// the user chooses WHICH of its own buffs it casts and ON WHOM; Bladedancer dances and Swordsinger songs interleave in the order chosen here;
// group templates like the class plans). Same look and patterns as the Classes page (Dashboard/classpage.js; its .cpl-* styles are reused).
// Hook: index.html route() -> BuffPage.route(kind, arg) (#/buffs, #/buffs/<leader>). Data: GET /api/buffplans, writes POST /api/buffplans
// (Dashboard/buffpage_api.js -> Scripts/data/buff_plans.json, read live by swarm.js). Logic = Dashboard/bufflogic.js (window.BuffLogic, the
// swarm.js ROLEKIND + BUFFPLAN blocks). Exports window.BuffPlans { partyBadge(leader), load } and an animated count on the Buffs tab button.
// No browser alert / confirm / prompt: every question goes through Dashboard/uidialog.js (uiConfirm / uiPrompt).
// Uses index.html globals: esc, api, classIcon, patch, stopChar, TAB.
(function () {
  'use strict';
  const SEC = 'tab-buffpage';
  const BP = { open: false, data: null, at: 0, sel: null, ed: null, busy: false, timer: 0, msgT: 0, loading: null };
  const $id = (i) => document.getElementById(i);
  const L = () => window.BuffLogic;
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const icon = (id, extra) => { try { return id == null ? '' : classIcon({ classId: id }, extra || ''); } catch (e) { return ''; } };
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('swarm.bp.' + k)); localStorage.setItem('swarm.bp.' + k, JSON.stringify(v)); } catch (e) { return null; } return null; };
  const SETNUM = [['cycleExpiredPct', 'New song / dance cycle when this % expired', 1, 100], ['rotMinMpPct', 'Min MP % to cast a song / dance', 0, 100],
    ['cycleMpStepPct', 'MP estimate + % per song / dance', 0, 50], ['cycleMpMarginPct', 'MP margin %', 0, 50], ['cycleMpWaitMs', 'Wait for MP before a cycle (ms)', 0, 600000],
    ['rotGapMs', 'Pause between two (ms)', 0, 10000], ['rotTakeoverMs', 'Turn take-over after (ms)', 1000, 60000],
    ['cycleMinGapMs', 'Min time between two cycles (ms)', 0, 600000], ['cycleMpReservePct', 'Keep this MP % after a song / dance', 0, 90], ['buffMax', 'Normal buff slots (0 = no check; + Divine Inspiration)', 0, 60]];
  const TARGET_TXT = { party: 'whole party', fighters: 'fighters', mages: 'mages / healers', self: 'only me', tank: 'the tank' };
  const STATUS = { ok: ['ok', 'Plan ✓'], suggested: ['warn', 'Buff plan not reviewed'], invalid: ['bad', 'Plan broken'], none: ['unk', 'No buffs'], off: ['unk', 'Buffing OFF'] };
  const hasPlan = (e) => !!e && (Array.isArray(e.buffs) || Array.isArray(e.rotation));   // an entry may only hold the never-keep list / switches
  // USER DECISION 2026-10-10 (bpRuns): no reviewed plan + board OFF = the suggestion runs now (full); board ON = it only fills what the board lacks
  const unreviewedTxt = (board) => board ? 'No saved plan — board buffs ON: it only fills what the board lacks. Save and approve a plan to decide yourself.'
    : 'No saved plan — board buffs OFF: the suggestion below runs now. Save and approve a plan to decide yourself.';

  // =========================================================================================== data
  async function load(force) {
    if (BP.loading) return BP.loading;
    if (!force && BP.data && Date.now() - BP.at < 20000) return BP.data;
    BP.loading = (async () => {
      try { const d = await api('/api/buffplans'); if (d && !d.error) { BP.data = d; BP.at = Date.now(); } else if (d && d.error) flash(d.error, true); }
      catch (e) { /* an older server without the API: the badges stay hidden */ }
      finally { BP.loading = null; }
      navBadge();
      if (BP.open && !BP.ed) render();
      return BP.data;
    })();
    return BP.loading;
  }
  const party = (leader) => BP.data ? BP.data.parties.find(p => p.leader === leader) || null : null;
  function navBadge() {
    const b = document.querySelector('#tabs [data-tab="buffs"]'); if (!b || !BP.data) return;
    let c = b.querySelector('.bpcount'); const n = BP.data.counts.warn;
    if (!n) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('span'); c.className = 'bpcount'; b.appendChild(c); }
    c.textContent = String(n); c.title = `${n} buffer character(s) without a reviewed buff plan`;
  }
  function partyBadge(leader) {
    if (!BP.data) { load(false); return ''; }
    const p = party(leader); if (!p || !p.counts.warn) return '';
    return `<a class="bpbadge" href="#/buffs/${encodeURIComponent(leader)}" title="${p.counts.warn} buffer(s) run a suggestion nobody reviewed (Buffs page)"><i aria-hidden="true"></i>${p.counts.warn} buff plan${p.counts.warn === 1 ? '' : 's'} not reviewed</a>`;
  }

  // =========================================================================================== page
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win cpl bpl'; s.hidden = true;
    s.innerHTML = `<div class="cpl-headrow"><h2>${icon(115, 'sm')} Buff plans</h2>
        <span class="muted cpl-intro">Which of its own buffs each buffer casts, on whom, and the song / dance order. Without a reviewed plan a buffer runs a <b>suggestion</b> from its skills.</span></div>
      <div id="bpBanner"></div><div class="cpl-msg" id="bpMsg" role="status" hidden></div>
      <div class="cpl-parties" id="bpParties" role="tablist" aria-label="parties"></div>
      <div id="bpParty"></div>
      <div class="box cpl-tpls"><h3>Group templates</h3><div id="bpTpls"></div></div>
      <div class="box bpl-set"><h3>Settings (every party)</h3><div id="bpSet"></div></div>
      <details class="box cpl-help"><summary><h3>How it works</h3></summary><div class="cpl-helpbody">
        <p><b>Board buffs on</b> (L2Toggle Community Board, swarm.config.json <code>boardBuffs</code>): buffers only add what the board does not give and never overwrite a stronger buff. <b>Board buffs off</b> (old-school parties): the party's own buffers are the buff source — they keep every buff of their plan up, rebuff after deaths and before pulls, and buffing comes before their own damage.</p>
        <p><b>Targets</b>: whole party, fighters, mages / healers, only me, the tank, or a named member. Party songs, dances and chants reach everyone near the caster; single-target buffs (Might, Haste, Acumen ...) are cast on each chosen member.</p>
        <p><b>Songs and dances</b> (Swordsinger, Bladedancer): they run out after about 2 minutes. They are cast as one full <b>cycle</b> in the order of the rotation list; with a singer and a dancer in one party they take turns (one dance, one song, ...). A new cycle starts when most of the set has expired; <b>keep always</b> keeps one up on its own between cycles. The server's song / dance slot limit is respected (settings).</p>
        <p><b>Buff groups</b>: buffs that cannot stack (from the game data: Improved Magic blocks Empower, Magic Barrier and Chant of Fire; Improved Combat blocks Might, Shield, Chant of Battle / Shielding ...) — a buffer never casts a buff whose group the member already has, and casts the improved / combined one first. A buff that does not land on a member is skipped on that member for 10 minutes (shown in the row), never cast until out of MP. <b>Buff slots</b>: a member whose normal buff slots are full only gets its buffs refreshed, never a new one that would push another out.</p>
        <p><b>Never keep</b>: per character, buffs it cancels itself (e.g. a healer drops Chant of Blood Awakening); buffers never cast them on it. <b>Buffing OFF</b> / <b>No songs / dances</b>: switches per character (and no songs / dances per party).</p>
        <p><b>Overlap</b>: two buffers with the same buff type on the same member — only one casts it (the stronger level wins); the page lists it under the party.</p>
        <p>Saving stores the plan as <b>not reviewed</b>; <b>Approve</b> makes it the reviewed plan, which always runs. Without a reviewed plan: board buffs OFF = the suggestion runs at once; board buffs ON = it only fills what the board lacks. Bots re-read the file within a minute, no restart.</p>
      </div></details>
      <div class="cpl-sheet" id="bpSheet" hidden><div class="cpl-panel" id="bpPanel" role="dialog" aria-modal="true" aria-label="buff plan"></div></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('change', onChange);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && BP.ed) closeSheet(); });
    s.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.id === 'bpRmAdd') { e.preventDefault(); const b = s.querySelector('[data-bpact="rmAdd"]'); if (b) b.click(); } });
    document.addEventListener('click', (e) => { const sh = $id('bpSheet'); if (sh && !sh.hidden && e.target === sh) closeSheet(); });
    return s;
  }
  function route(kind, arg) {
    if (kind === 'buffs') { open(arg ? decodeURIComponent(arg) : null); return true; }
    close(); return false;
  }
  function open(leader) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'buffs'; } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'buffs')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    const was = BP.open; s.hidden = false; BP.open = true;
    if (leader) BP.sel = leader; else if (!BP.sel) BP.sel = store('sel') || null;
    if (!was) window.scrollTo(0, 0);
    if (!BP.timer) BP.timer = setInterval(() => { if (BP.open && !document.hidden && !BP.ed) load(true); }, 20000);
    render(); load(true);
  }
  function close() {
    if (!BP.open) return;
    BP.open = false; closeSheet(); clearInterval(BP.timer); BP.timer = 0;
    const s = $id(SEC); if (s) s.hidden = true;
  }
  function flash(t, bad) {
    const m = $id('bpMsg'); if (!m) return;
    m.hidden = !t; m.className = 'cpl-msg' + (bad ? ' bad' : ''); m.textContent = t || '';
    clearTimeout(BP.msgT); BP.msgT = setTimeout(() => { const x = $id('bpMsg'); if (x) x.hidden = true; }, bad ? 14000 : 8000);
  }
  const put = (el, html) => { if (!el) return; if (typeof patch === 'function') patch(el, html); else el.innerHTML = html; };

  function render() {
    if (!BP.open) return;
    const d = BP.data;
    if (!d) { put($id('bpParty'), '<div class="muted">Loading the buff plans…</div>'); return; }
    if (!BP.sel || !party(BP.sel)) BP.sel = (d.parties.find(p => p.counts.warn) || d.parties[0] || {}).leader || null;
    store('sel', BP.sel);
    const want = '#/buffs/' + encodeURIComponent(BP.sel || '');
    if (BP.sel && location.hash !== want && /^#\/buffs/.test(location.hash)) history.replaceState(null, '', want);
    put($id('bpBanner'), d.broken ? `<div class="cpl-msg bad">${h(d.file)} does not parse (${h(d.broken)}): the buffers run their suggestions until it is fixed or restored from history/.</div>`
      : d.counts.warn ? `<div class="cpbanner bpbanner"><span class="pulse" aria-hidden="true"></span><b>${d.counts.warn} buffer${d.counts.warn === 1 ? '' : 's'} without a reviewed buff plan</b><span>${d.parties.filter(p => p.counts.warn).map(p => `party ${h(p.leader)} (${p.counts.warn})`).join(', ')}</span><span class="muted">they run a suggestion from their skills</span></div>` : '');
    put($id('bpParties'), d.parties.map(p => `<button role="tab" aria-selected="${p.leader === BP.sel}" class="cpl-ptab ${p.leader === BP.sel ? 'on' : ''}" data-bpparty="${h(p.leader)}">Party ${h(p.leader)}
      ${p.counts.warn ? `<span class="cpcount" title="${p.counts.warn} buffer(s) without a reviewed plan">${p.counts.warn}</span>` : p.counts.buffers ? '<span class="cpok" title="every buffer has a reviewed plan">✓</span>' : '<span class="muted" title="no buffer characters">–</span>'}</button>`).join(''));
    put($id('bpParty'), partyHtml(party(BP.sel)));
    put($id('bpTpls'), tplsHtml());
    put($id('bpSet'), setHtml());
  }
  function planSummary(m) {
    const pl = m.plan || { buffs: [], rotation: [] };
    const bs = (pl.buffs || []).filter(b => b.keep !== false);
    const parts = bs.slice(0, 8).map(b => `<span class="bpl-b" title="${h((b.targets || ['party']).map(t => TARGET_TXT[t] || t).join(', '))}">${h(b.skill || b.id)}<em>${h((b.targets || ['party']).map(t => TARGET_TXT[t] ? t : t).join(','))}</em></span>`);
    if (bs.length > 8) parts.push(`<span class="muted">+${bs.length - 8}</span>`);
    const re = L().bpRotEntries(pl.rotation);
    const rot = re.length ? `<div class="bpl-rot">♪ ${re.map(r => h(r.name) + (r.keepAlways ? ' <em title="kept up on its own between cycles">(always)</em>' : '')).join(' › ')}</div>` : '';
    return (parts.join('') || '<span class="muted">—</span>') + rot;
  }
  function partyHtml(p) {
    if (!p) return '<div class="muted">No parties in swarm.config.json.</div>';
    const bufs = p.members.filter(m => m.buffer), rest = p.members.filter(m => !m.buffer);
    const tpls = BP.data.templates || [];
    const ov = p.overlaps || [];
    return `<div class="box cpl-pbox">
      <h3><span>Party ${h(p.leader)}</span><button class="bpl-board ${p.board ? 'on' : 'off'}" data-bpact="board" aria-pressed="${p.board ? 'true' : 'false'}" title="Tap to switch. ${p.boardFrom === 'switch' ? 'Set here on the page' : p.boardFrom === 'leader' ? 'From the leader in swarm.config.json' : p.boardFrom === 'config' ? 'From swarm.config.json' : 'Default'}">${p.board ? 'Board buffs ON' : 'Board buffs OFF — own buffers'} <span aria-hidden="true">⇄</span></button>
        <button class="bpl-board ${p.noSongs ? 'off' : 'on'}" data-bpact="partySongs" aria-pressed="${p.noSongs ? 'true' : 'false'}" title="Songs / dances for the whole party (tap to switch)">${p.noSongs ? 'Songs / dances OFF' : 'Songs / dances ON'} <span aria-hidden="true">⇄</span></button>
        <span class="muted">· ${bufs.length} buffer${bufs.length === 1 ? '' : 's'} · ${p.counts.warn ? `<b class="cpwarn">${p.counts.warn} not reviewed</b>` : bufs.length ? 'every buffer has a reviewed plan' : 'no buffer characters'}</span></h3>
      <div class="cpl-bulk">
        <label class="cpl-inl">Template <select id="bpTplSel" aria-label="template to apply">${tpls.map(t => `<option value="${h(t.id)}">${h(t.name)}${t.example ? ' (example)' : ''}</option>`).join('')}</select></label>
        <button data-bpact="applyTpl" ${tpls.length ? '' : 'disabled'}>Apply template…</button>
        <button data-bpact="saveTpl">Save party as template…</button>
      </div>
      <div class="cpl-mems" role="table" aria-label="buffers">
        <div class="cpl-mrow bpl-mrow cpl-mhead" role="row"><span role="columnheader">Character</span><span role="columnheader">Kind</span><span role="columnheader">Buffs it casts</span><span role="columnheader">Status</span><span role="columnheader"></span></div>
        ${bufs.map(m => rowHtml(p, m)).join('') || '<div class="muted">No buffer or healer in this party (Prophet, Swordsinger, Bladedancer, Warcryer, Overlord, Elder ...).</div>'}
      </div>
      ${ov.length ? `<div class="bpl-ov"><h4>Overlaps (only one casts)</h4>${ov.map(o => `<div class="bpl-ovr"><b>${h(o.ab)}</b> on <b>${h(o.member)}</b>: ${o.by.map((b, i) => `${h(b)} (${h(o.skills[i] || '')})`).join(' and ')} — <span class="ok">${h(o.winner)} casts it</span></div>`).join('')}</div>` : ''}
      ${(p.cycle || []).length ? `<div class="bpl-cyc"><h4>Song / dance cycle (one full set, interleaved)</h4><div class="bpl-sum">${p.cycle.map((x, i) => `<span class="bpl-b">${i + 1}. ${h(x.skill)}<em>${h(x.by)}</em></span>`).join('')}</div></div>` : ''}
      ${rest.length ? `<div class="bpl-rest"><span class="muted">Not buffers:</span> ${rest.map(m => `<span class="bpl-restm"><b>${h(m.name)}</b>${(m.remove || []).length ? ` <em class="muted" title="cancels these buffs itself">never keep: ${h(m.remove.join(', '))}</em>` : ''} <button data-bpact="remove" data-bpn="${h(m.name)}" title="Buffs ${h(m.name)} cancels itself (and buffers never cast on it)">Never keep…</button>${selfBtn(m)}</span>`).join(' ')}</div>` : ''}
    </div>`;
  }
  function rowHtml(p, m) {
    const [k, txt] = STATUS[m.status] || ['unk', m.status || '?'];
    const rep = m.report || null;
    const miss = rep && rep.missing ? Object.keys(rep.missing).filter(n => (rep.missing[n] || []).length) : [];
    return `<div class="cpl-mrow bpl-mrow ${m.status !== 'ok' ? 'warn' : ''}" role="row" data-bpname="${h(m.name)}">
      <span class="cpl-who" role="cell">${icon(m.classId)}<b>${h(m.name)}</b><span class="lvl">${m.level != null ? m.level : '?'}</span>${m.online ? '' : '<span class="muted">offline</span>'}</span>
      <span class="cpl-now" role="cell">${h(m.cls || '?')}<div class="muted">${h(m.kind || '')}${m.style ? ' · ' + h(m.style) : ''}</div></span>
      <span class="cpl-path bpl-sum" role="cell">${planSummary(m)}${!m.known ? '<div class="muted">no skill report yet (log in once with the kit)</div>' : ''}</span>
      <span class="cpl-st" role="cell">${m.status === 'suggested' ? `<a class="cpbadge cpb-appr sm bpb" href="#/buffs/${encodeURIComponent(p.leader)}" title="${h(m.why || '')}"><i aria-hidden="true"></i>buff plan not reviewed</a>` : `<span class="cpl-stc ${k}">${h(txt)}</span>`}
        <div class="muted cpl-why bpl-runs">${m.status === 'ok' ? 'the approved plan runs' : m.status === 'none' ? h(m.why || '') : unreviewedTxt(p.board)}</div>${m.why && m.status !== 'ok' && m.status !== 'none' ? `<div class="muted">${h(m.why)}</div>` : ''}
        ${rep && rep.cycle ? `<div class="muted" title="song / dance cycle as the bot reports it">cycle: ${h(rep.cycle.phase || '')} ${rep.cycle.step != null ? h(rep.cycle.step) + '/' + h(rep.cycle.total) : ''}${rep.cycle.expired != null ? ' · ' + h(rep.cycle.expired) + '% expired' : ''}</div>` : ''}
        ${(m.warnings || []).length ? `<div class="muted">${h(m.warnings.slice(0, 3).join('; '))}</div>` : ''}
        ${miss.length ? `<div class="muted" title="${h(miss.map(n => n + ': ' + rep.missing[n].join(', ')).join(' | '))}">missing now on ${h(miss.join(', '))}</div>` : ''}
        ${m.slots ? `<div class="muted" title="normal buff slots used / max (songs and dances apart)">buff slots ${h(m.slots.used)}/${h(m.slots.max)}</div>` : ''}
        ${(m.skipped || []).length ? `<div class="muted" title="did not land: skipped for 10 min, never cast in a loop">skipped: ${h(m.skipped.slice(0, 4).map(x => x.skill + ' on ' + x.member).join(', '))}</div>` : ''}
        ${(m.remove || []).length ? `<div class="muted">never keep: ${h(m.remove.join(', '))}</div>` : ''}${m.noSongs ? '<div class="muted">no songs / dances</div>' : ''}</span>
      <span class="cpl-btns" role="cell">
        <button data-bpact="edit" data-bpn="${h(m.name)}">Plan…</button>
        ${hasPlan(m.entry) && !m.approved ? `<button data-bpact="approve" data-bpn="${h(m.name)}">Approve…</button>` : ''}
        ${hasPlan(m.entry) && m.approved ? `<button data-bpact="unapprove" data-bpn="${h(m.name)}">Unapprove</button>` : ''}
        ${hasPlan(m.entry) ? `<button data-bpact="clear" data-bpn="${h(m.name)}">Remove</button>` : ''}
        <button data-bpact="noBuffs" data-bpn="${h(m.name)}" aria-pressed="${m.noBuffs ? 'true' : 'false'}" title="Switch all buffing of ${h(m.name)} on / off">${m.noBuffs ? 'Buffing ON…' : 'Buffing OFF…'}</button>
        <button data-bpact="remove" data-bpn="${h(m.name)}" title="Buffs ${h(m.name)} cancels itself">Never keep…</button>
        ${selfBtn(m)}
      </span></div>`;
  }
  // SELFOFF-2026-10-23 (public tester: "Forgotten Scrolls skills are cast on reuse; make them selectable/deselectable in the buff window. Exception:
  // Counter Critical."): the character's own self buffs (its report: swarm_state.buffPlan.self), each one on / off; Counter Critical always stays on
  function selfBtn(m) {
    const n = (m.self || []).length; if (!n && !(m.selfOff || []).length) return '';
    const off = (m.selfOff || []).length;
    return `<button data-bpact="self" data-bpn="${h(m.name)}" title="Which of its own self buffs ${h(m.name)} keeps up">Self buffs${off ? ' (' + off + ' off)' : ''}…</button>`;
  }
  function openSelf(name) {
    const p = party(BP.sel), m = p && p.members.find(x => x.name === name); if (!m) return;
    const offKey = {}; (m.selfOff || []).forEach(v => { offKey[String(v).trim().toLowerCase()] = String(v).trim(); });
    const opts = (m.self || []).map(s => ({ name: s.name, always: !!s.always, on: s.always || !offKey[s.name.toLowerCase()] }));
    Object.keys(offKey).forEach(k => { if (!opts.some(o => o.name.toLowerCase() === k)) opts.push({ name: offKey[k], always: false, on: false, gone: true }); });
    BP.ed = { kind: 'self', name, leader: p.leader, m, opts };
    renderSelf();
    $id('bpSheet').hidden = false; document.documentElement.classList.add('cpl-modal');
  }
  function renderSelf() {
    const E = BP.ed, m = E.m, off = E.opts.filter(o => !o.on && !o.always).length;
    put($id('bpPanel'), `<div class="cpl-ph"><div>${icon(m.classId)}<b>${h(E.name)}</b> <span class="muted">party ${h(E.leader)} · its own self buffs</span></div>
        <button class="cpl-x" data-bpact="close" aria-label="close">✕</button></div>
      <div class="muted cpl-suggline">Ticked = ${h(E.name)} casts it again whenever it runs out (Forgotten Scroll skills too). Unticked = it is never cast by itself. Counter Critical always stays on. Nothing is saved until you tap Save.</div>
      <div class="bpl-list">${E.opts.map((o, i) => `<div class="bpl-row ${o.on ? 'on' : 'off'}"><label class="bpl-k"><input type="checkbox" data-bpself="${i}" ${o.on ? 'checked' : ''} ${o.always ? 'disabled' : ''}> <b>${h(o.name)}</b></label>
        <span class="muted bpl-meta">${o.always ? 'always on' : o.gone ? 'not learned / not reported now' : ''}</span></div>`).join('') || '<div class="muted">No self buffs reported by this character yet (it logs in once with the kit).</div>'}</div>
      <div class="cpl-pfoot">
        <span class="muted">${off ? off + ' switched off' : 'every self buff is kept up'}</span>
        <button class="cpl-primary" data-bpact="selfSave">Save</button>
        <button data-bpact="close">Cancel</button>
      </div>`);
  }
  function tplsHtml() {
    const t = BP.data.templates || [];
    if (!t.length) return '<div class="muted">No templates yet. "Save party as template" stores a party\'s buff plans by class.</div>';
    return `<div class="cpl-tlist">${t.map(x => `<div class="cpl-tpl">
      <div class="cpl-tname"><b>${h(x.name || x.id)}</b>${x.example ? '<span class="chip">example</span>' : ''}${x.from ? `<span class="muted">from ${h(x.from)}</span>` : ''}</div>
      ${x.desc ? `<div class="muted">${h(x.desc)}</div>` : ''}
      <div class="cpl-tslots">${Object.keys(x.classes || {}).map(c => `<span class="cpl-tslot" title="${h(((x.classes[c].buffs || []).map(b => b.skill).concat(x.classes[c].rotation || [])).join(', '))}">${h(c)}</span>`).join('')}</div>
      <div class="cpl-tact"><button data-bpact="applyTplId" data-bpt="${h(x.id)}">Apply to party ${h(BP.sel || '')}…</button>${x.own ? `<button data-bpact="delTpl" data-bpt="${h(x.id)}">Delete</button>` : ''}</div></div>`).join('')}</div>`;
  }
  function setHtml() {
    const s = BP.data.settings || {};
    return `<div class="bpl-setf">
      <label>Song / dance slots <input type="number" id="bpSetSd" min="1" max="40" value="${h(s.songDanceMax)}"></label>
      <label>Party gathered for songs / dances (%) <input type="number" id="bpSetGp" min="0" max="100" value="${h(s.gatherPct)}"></label>
      <label>Gather range <input type="number" id="bpSetGr" min="200" max="3000" step="50" value="${h(s.gatherRange)}"></label>
      <label>First in the song / dance cycle <select id="bpSetFc"><option value="sws" ${s.firstCycleCaster !== 'bd' ? 'selected' : ''}>Swordsinger (song, dance, song …)</option><option value="bd" ${s.firstCycleCaster === 'bd' ? 'selected' : ''}>Bladedancer (dance, song, dance …)</option></select></label>
      <label>Buff groups <select id="bpSetGrp"><option value="server" ${s.buffGroupRule !== 'stat' ? 'selected' : ''}>as the game stacks them (Improved Magic blocks Magic Barrier …)</option><option value="stat" ${s.buffGroupRule === 'stat' ? 'selected' : ''}>strict: one buff per stat (P.Def, M.Def, P.Atk …)</option></select></label>
      ${SETNUM.map(([k, t, mn, mx]) => `<label>${h(t)} <input type="number" data-bpset="${k}" min="${mn}" max="${mx}" value="${h(s[k])}"></label>`).join('')}
      <button data-bpact="saveSet">Save settings</button></div>`;
  }

  // =========================================================================================== plan editor (bottom sheet on phones)
  function openEditor(name, useSugg) {
    const p = party(BP.sel), m = p && p.members.find(x => x.name === name); if (!m) return;
    const sk = m.skills || { party: [], target: [] };
    const known = [].concat(sk.party.map(s => Object.assign({ kind: 'party' }, s)), sk.target.map(s => Object.assign({ kind: 'target' }, s)));
    const src = (useSugg ? m.suggestion : (m.entry || m.suggestion)) || { buffs: [], rotation: [] };
    const songs = known.filter(s => L().rkIsSongDance(s));
    const plain = known.filter(s => !L().rkIsSongDance(s));
    // rows: the plan's buffs in order (known or typed), then the learned ones not in the plan (off)
    const rows = [];
    (src.buffs || []).forEach(b => { const k = plain.find(s => (b.id && Number(b.id) === s.id) || L().bpNorm(b.skill) === L().bpNorm(s.name)); if (k && L().rkIsSongDance(k)) return;
      rows.push({ skill: k ? k.name : (b.skill || String(b.id)), id: k ? k.id : (b.id || 0), ab: k ? k.ab : '', kind: k ? k.kind : '?', targets: (b.targets && b.targets.length ? b.targets : ['party']).slice(), keep: b.keep !== false, known: !!k }); });
    plain.forEach(s => { if (!rows.some(r => L().bpNorm(r.skill) === L().bpNorm(s.name))) rows.push({ skill: s.name, id: s.id, ab: s.ab, kind: s.kind, targets: [s.kind === 'party' ? 'party' : L().bpBenefit(s.ab)], keep: false, known: true }); });
    const rot = [];
    L().bpRotEntries(src.rotation).forEach(r => rot.push({ name: r.name, on: true, keepAlways: r.keepAlways, known: songs.some(s => L().bpNorm(s.name) === L().bpNorm(r.name)) }));
    songs.forEach(s => { if (!rot.some(r => L().bpNorm(r.name) === L().bpNorm(s.name))) rot.push({ name: s.name, on: false, keepAlways: false, known: true }); });
    BP.ed = { name, leader: p.leader, rows, rot, members: p.members.map(x => x.name), fromSugg: !!useSugg || !hasPlan(m.entry), approved: m.approved, m, noSongs: !!m.noSongs, noBuffs: !!m.noBuffs, attackSkills: typeof m.attackSkills === 'boolean' ? m.attackSkills : m.attackDefault !== false };
    renderEditor();
    $id('bpSheet').hidden = false; document.documentElement.classList.add('cpl-modal');
  }
  function closeSheet() { BP.ed = null; const sh = $id('bpSheet'); if (sh) sh.hidden = true; const pn = $id('bpPanel'); if (pn) { pn.innerHTML = ''; pn._last = null; } document.documentElement.classList.remove('cpl-modal'); if (BP.open) render(); }
  // MR.P 2026-10-10: a single-target buff can go to SEVERAL members (and groups): a tick list, saved as the targets list
  function tgtSelect(i, v) {
    const opts = Object.keys(TARGET_TXT).map(k => [k, TARGET_TXT[k]]).concat(BP.ed.members.map(n => [n, n]));
    const cur = Array.isArray(v) ? v : [v];
    return `<details class="bpl-tg"${BP.ed.openTg === i ? ' open' : ''}><summary data-bptgs="${i}" title="who gets it (tick several)">${h(cur.map(t => TARGET_TXT[t] || t).join(', ') || 'whole party')}</summary><div class="bpl-tgl">${opts.map(([k, t]) => `<label><input type="checkbox" data-bptgt="${i}" value="${h(k)}" ${cur.includes(k) ? 'checked' : ''}> ${h(t)}</label>`).join('')}</div></details>`;
  }
  function renderEditor() {
    const E = BP.ed, m = E.m;
    put($id('bpPanel'), `<div class="cpl-ph"><div>${icon(m.classId)}<b>${h(E.name)}</b> <span class="muted">party ${h(E.leader)} · ${h(m.cls || '?')} · ${h(m.kind || '')}</span></div>
        <button class="cpl-x" data-bpact="close" aria-label="close">✕</button></div>
      ${E.fromSugg ? '<div class="muted cpl-suggline">Pre-filled from the suggestion (the buffer\'s own skills). Nothing is saved until you tap Save.</div>' : ''}
      ${!m.known ? '<div class="cpl-msg bad">No skill report from this character yet (log in once with the kit): type the skill names below.</div>' : ''}
      <div class="bpl-sw"><label><input type="checkbox" data-bpsw="noBuffs" ${E.noBuffs ? 'checked' : ''}> <b>Buffing OFF</b> <span class="muted">— ${h(E.name)} casts nothing (no plan, no suggestion)</span></label>
        <label><input type="checkbox" data-bpsw="noSongs" ${E.noSongs ? 'checked' : ''}> <b>No songs / dances</b> <span class="muted">— the rest of the plan runs</span></label>
        <label><input type="checkbox" data-bpsw="attackSkills" ${E.attackSkills ? 'checked' : ''}> <b>Attacks with its own skills</b> <span class="muted">— ${m.attackDefault === false ? 'off by default for buffers (no Wind Strike / Mana Burn / Steal Essence)' : 'its attack skills (off = it only buffs / hits with its weapon)'}</span></label></div>
      <h4>Buffs (top = first)</h4>
      <div class="bpl-list">${E.rows.map((r, i) => `<div class="bpl-row ${r.keep ? 'on' : 'off'}">
          <label class="bpl-k"><input type="checkbox" data-bpkeep="${i}" ${r.keep ? 'checked' : ''}> <b>${h(r.skill)}</b></label>
          <span class="muted bpl-meta">${r.kind === 'party' ? 'party buff' : r.kind === 'target' ? 'single target' : 'not learned'}${r.ab ? ' · ' + h(r.ab) : ''}</span>
          ${r.kind === 'party' ? '<span class="muted bpl-t">reaches the whole party</span>' : tgtSelect(i, r.targets)}
          <span class="bpl-mv"><button data-bpup="${i}" aria-label="up" ${i ? '' : 'disabled'}>▲</button><button data-bpdn="${i}" aria-label="down" ${i < E.rows.length - 1 ? '' : 'disabled'}>▼</button></span></div>`).join('') || '<div class="muted">No buffs learned (yet).</div>'}</div>
      <div class="bpl-add"><input id="bpAddName" placeholder="add a buff by skill name" aria-label="skill name"><button data-bpact="addBuff">Add</button></div>
      ${E.rot.length ? `<h4>Songs / dances rotation (cast in this order; with a singer and a dancer they take turns)</h4>
      <div class="bpl-list">${E.rot.map((r, i) => `<div class="bpl-row ${r.on ? 'on' : 'off'}"><label class="bpl-k"><input type="checkbox" data-bprot="${i}" ${r.on ? 'checked' : ''}> <b>${h(r.name)}</b></label><label class="bpl-ka" title="keep this one up on its own between full cycles"><input type="checkbox" data-bpka="${i}" ${r.keepAlways ? 'checked' : ''}> keep always</label>${r.known ? '' : '<span class="muted">not learned</span>'}
          <span class="bpl-mv"><button data-bprup="${i}" aria-label="up" ${i ? '' : 'disabled'}>▲</button><button data-bprdn="${i}" aria-label="down" ${i < E.rot.length - 1 ? '' : 'disabled'}>▼</button></span></div>`).join('')}</div>` : ''}
      <div class="cpl-pfoot">
        <button data-bpact="useSugg" title="Replace the list with the suggestion from the skills">Use suggestion</button>
        <button data-bpact="savePlan" title="Save without review (it stays 'not reviewed')">Save (not reviewed)</button>
        <button class="cpl-primary" data-bpact="saveApprove">Save &amp; approve…</button>
        <button data-bpact="close">Cancel</button>
      </div>`);
  }
  // =========================================================================================== never-keep picker (D12 2026-10-12)
  // The bot (swarm.js rkNoBuff) matches a list entry against the buff's skill NAME or its abnormal TYPE, any case: the options here are the exact
  // names the party's buffers reported (their learned buff skills), a few often-cancelled chants / board buffs, the saved entries, and typed ones.
  const RM_COMMON = ['Chant of Blood Awakening', 'War Chant', 'Chant of Fury', 'Chant of Rage', 'Chant of Battle', 'Chant of Evasion', 'Chant of Predator',
    'Chant of Eagle', 'Chant of Vampire', 'Berserker Spirit', 'Wild Magic', 'Haste', 'Guidance', 'Death Whisper', 'Vampiric Rage', 'Dance of Fury', 'Dance of Vampire'];
  function openRemove(name) {
    const p = party(BP.sel), m = p && p.members.find(x => x.name === name); if (!m) return;
    const opts = [], seen = {};
    const add = (nm, from, ab) => { const v = String(nm || '').trim(); if (!v) return; const k = v.toLowerCase(); if (seen[k]) { if (from && !seen[k].from.includes(from)) seen[k].from += ', ' + from; return; } seen[k] = { key: k, name: v, from: from || '', ab: ab || '' }; opts.push(seen[k]); };
    p.members.forEach(b => { const sk = b.skills || { party: [], target: [] }; [].concat(sk.party || [], sk.target || []).forEach(s => add(s.name, b.name, s.ab)); });
    RM_COMMON.forEach(n => add(n, 'often cancelled'));
    const sel = {};
    (m.remove || []).forEach(v => { add(v, seen[String(v).trim().toLowerCase()] ? '' : 'on the list'); sel[String(v).trim().toLowerCase()] = String(v).trim(); });
    BP.ed = { kind: 'remove', name, leader: p.leader, m, opts, sel };
    renderRemove();
    $id('bpSheet').hidden = false; document.documentElement.classList.add('cpl-modal');
  }
  function renderRemove() {
    const E = BP.ed, m = E.m, n = Object.keys(E.sel).length;
    const row = (o, i) => `<div class="bpl-row ${E.sel[o.key] ? 'on' : 'off'}"><label class="bpl-k"><input type="checkbox" data-bprm="${i}" ${E.sel[o.key] ? 'checked' : ''}> <b>${h(o.name)}</b></label>
        <span class="muted bpl-meta">${o.from ? h(o.from === 'often cancelled' || o.from === 'typed' || o.from === 'on the list' ? o.from : 'cast by ' + o.from) : ''}${o.ab ? ' · ' + h(o.ab) : ''}</span></div>`;
    const fromParty = E.opts.map((o, i) => [o, i]).filter(([o]) => o.from && o.from !== 'often cancelled' && o.from !== 'typed' && o.from !== 'on the list');
    const other = E.opts.map((o, i) => [o, i]).filter(([o]) => !fromParty.some(([x]) => x === o));
    put($id('bpPanel'), `<div class="cpl-ph"><div>${icon(m.classId)}<b>${h(E.name)}</b> <span class="muted">party ${h(E.leader)} · never keep these buffs</span></div>
        <button class="cpl-x" data-bpact="close" aria-label="close">✕</button></div>
      <div class="muted cpl-suggline">Tick the buffs ${h(E.name)} cancels itself as soon as they appear; the party's buffers never cast them on ${h(E.name)}. Other buffs (board buffs too) stay. Nothing is saved until you tap Save.</div>
      <h4>Buffs the party's buffers cast</h4>
      <div class="bpl-list">${fromParty.map(([o, i]) => row(o, i)).join('') || '<div class="muted">No buff skills reported by this party yet (the buffers log in once with the kit).</div>'}</div>
      <h4>Often cancelled / typed</h4>
      <div class="bpl-list">${other.map(([o, i]) => row(o, i)).join('')}</div>
      <div class="bpl-add"><input id="bpRmAdd" placeholder="another buff: exact skill name or buff type" aria-label="buff name" maxlength="60"><button data-bpact="rmAdd">Add</button></div>
      <div class="cpl-pfoot">
        <span class="muted">${n ? `${n} ticked` : 'nothing ticked = keeps every buff'}</span>
        <button data-bpact="rmNone" ${n ? '' : 'disabled'}>Untick all</button>
        <button class="cpl-primary" data-bpact="rmSave">Save</button>
        <button data-bpact="close">Cancel</button>
      </div>`);
  }
  function editorEntry() {
    const E = BP.ed;
    return { buffs: E.rows.filter(r => r.keep).map((r, i) => Object.assign({ skill: r.skill, targets: r.kind === 'party' ? ['party'] : (r.targets && r.targets.length ? r.targets.slice() : ['party']), priority: i + 1, keep: true }, r.id ? { id: r.id } : {})),
      rotation: E.rot.filter(r => r.on).map(r => r.keepAlways ? { skill: r.name, keepAlways: true } : r.name), noSongs: !!E.noSongs, noBuffs: !!E.noBuffs, attackSkills: !!E.attackSkills };
  }
  function approveDialog(name, leader, entry, board) {
    const items = (entry.buffs || []).map(b => [uiEm(b.skill), ' → ', (b.targets || ['party']).map(t => TARGET_TXT[t] || t).join(', ')]);
    const body = [uiP('Approve the buff plan of ', uiEm(name), ` (party ${leader})?`)];
    if (items.length) body.push(uiH('Buffs (in this order)'), uiList(items));
    if ((entry.rotation || []).length) body.push(uiH('Songs / dances (one full cycle, in this order)'), uiPath(L().bpRotEntries(entry.rotation).map(r => r.name + (r.keepAlways ? ' (always)' : ''))));
    body.push(uiKV([['Board buffs', board ? 'ON: it only adds what the board does not give, never overwrites a stronger buff' : 'OFF: this plan is the party\'s buff source']]),
      uiNote('The bots read it within a minute. You can change or unapprove it any time.'));
    return uiConfirm({ title: 'Approve buff plan', body, confirmText: 'Approve plan', cancelText: 'Cancel' });
  }
  async function post(body, okText) {
    if (BP.busy) return null;
    BP.busy = true;
    try {
      const r = await api('/api/buffplans', { method: 'POST', body: JSON.stringify(Object.assign({ rev: BP.data && BP.data.rev, by: 'dashboard' }, body)) });
      if (!r || r.error) { flash((r && r.error) || 'not saved', true); if (r && /changed meanwhile/.test(r.error || '')) await load(true); return null; }
      if (okText) flash(okText + (r.warnings && r.warnings.length ? ' Note: ' + r.warnings.join('; ') : ''));
      await load(true);
      return r;
    } catch (e) { flash('Not saved: ' + e.message, true); return null; }
    finally { BP.busy = false; }
  }

  // =========================================================================================== events
  function move(list, i, d) { const j = i + d; if (j < 0 || j >= list.length) return; const x = list[i]; list[i] = list[j]; list[j] = x; }
  async function onClick(e) {
    const t = e.target.closest('[data-bpparty],[data-bpact],[data-bpup],[data-bpdn],[data-bprup],[data-bprdn]'); if (!t) return;
    if (t.dataset.bpparty) { BP.sel = t.dataset.bpparty; render(); return; }
    const E = BP.ed;
    if (E && t.dataset.bpup) { move(E.rows, +t.dataset.bpup, -1); renderEditor(); return; }
    if (E && t.dataset.bpdn) { move(E.rows, +t.dataset.bpdn, 1); renderEditor(); return; }
    if (E && t.dataset.bprup) { move(E.rot, +t.dataset.bprup, -1); renderEditor(); return; }
    if (E && t.dataset.bprdn) { move(E.rot, +t.dataset.bprdn, 1); renderEditor(); return; }
    const act = t.dataset.bpact, n = t.dataset.bpn, p = party(BP.sel), m = p && n ? p.members.find(x => x.name === n) : null;
    if (act === 'close') { closeSheet(); return; }
    if (act === 'edit') { openEditor(n); return; }
    if (act === 'addBuff' && E) { const v = ($id('bpAddName').value || '').trim(); if (!v) return; E.rows.push({ skill: v, id: 0, ab: '', kind: '?', target: 'party', keep: true, known: false }); renderEditor(); return; }
    if (act === 'useSugg' && E) { const nm = E.name; closeSheet(); openEditor(nm, true); return; }
    if ((act === 'savePlan' || act === 'saveApprove') && E) {
      const entry = editorEntry();
      if (!entry.buffs.length && !entry.rotation.length && !entry.noBuffs) {   // MR.P 2026-10-10: an empty plan = this character casts nothing
        if (!await uiConfirm({ title: `No buffs for ${E.name}?`, body: [uiP('Nothing is ticked. Save an ', uiEm('empty'), ` plan for ${E.name}?`), uiList([`${E.name} casts no buffs and no songs / dances`, 'Not even the suggestion from its skills']), uiNote('Tick buffs again any time, or use "Buffing OFF".')], confirmText: 'Save: no buffs', cancelText: 'Cancel' })) return;
        const r0 = await post(Object.assign({ action: 'set', leader: E.leader, name: E.name, approve: true, confirm: true }, entry), `${E.name}: empty plan saved — it casts nothing.`);
        if (r0) closeSheet();
        return;
      }
      const approve = act === 'saveApprove';
      if (approve && !await approveDialog(E.name, E.leader, entry, party(E.leader).board)) return;
      const r = await post(Object.assign({ action: 'set', leader: E.leader, name: E.name, approve, confirm: approve }, entry), approve ? `${E.name}: buff plan saved and APPROVED.` : `${E.name}: buff plan saved (not reviewed).`);
      if (r) closeSheet();
      return;
    }
    if (act === 'approve' && m) { if (!await approveDialog(m.name, p.leader, m.entry, p.board)) return; await post({ action: 'approve', leader: p.leader, names: [m.name], confirm: true }, `${m.name}: buff plan APPROVED.`); return; }
    if (act === 'board') {   // 2026-10-10: Board buffs ON / OFF per party (Scripts/data/buff_plans.json, the bots read it live)
      const to = !p.board;
      const body = to
        ? [uiP(`Party ${p.leader} gets its buffs from the server's Community Board again.`), uiList(['Buffers only add what the board does not give', 'They never overwrite a stronger buff', 'The rebuff turns at the board come back'])]
        : [uiP(`Party ${p.leader} plays old school: no Community Board buffs at all.`), uiList(['The party\'s own buffers keep every buff of their plan up', 'Rebuff after deaths and before pulls', 'Buffing comes before their own damage', 'Self-buffs, toggles and cubics are allowed']), uiNote('Buffers without a reviewed plan run the suggestion from their own skills.')];
      body.push(uiNote('The bots pick it up within about 20 seconds, no restart needed.'));
      if (p.boardFrom === 'switch') body.push(uiNote('Set on this page before (it overrides swarm.config.json).'));
      if (!await uiConfirm({ title: `Board buffs ${to ? 'ON' : 'OFF'} for party ${p.leader}?`, body, confirmText: to ? 'Switch ON' : 'Switch OFF', cancelText: 'Cancel' })) return;
      await post({ action: 'board', leader: p.leader, value: to, confirm: true }, `Board buffs ${to ? 'ON' : 'OFF'} for party ${p.leader}`);
      return;
    }
    if (act === 'partySongs' && p) {   // MR.P 2026-10-10: no songs / dances for the whole party
      const to = !p.noSongs;
      if (!await uiConfirm({ title: `Songs / dances ${to ? 'OFF' : 'ON'} for party ${p.leader}?`, body: to ? [uiP(`Nobody in party ${p.leader} sings or dances any more.`), uiNote('The other buffs keep running.')] : [uiP(`Swordsingers and Bladedancers of party ${p.leader} run their song / dance cycle again.`)], confirmText: to ? 'Songs / dances OFF' : 'Songs / dances ON', cancelText: 'Cancel' })) return;
      await post({ action: 'switches', leader: p.leader, noSongs: to }, `party ${p.leader}: songs / dances ${to ? 'OFF' : 'ON'}`); return;
    }
    if (act === 'noBuffs' && n) {
      const mm = p.members.find(x => x.name === n), to = !(mm && mm.noBuffs);
      if (!await uiConfirm({ title: `Buffing ${to ? 'OFF' : 'ON'} for ${n}?`, body: to ? [uiP(`${n} casts no buffs at all: no plan, no suggestion, no songs / dances.`), uiNote('Its saved plan is kept; switch it on again any time.')] : [uiP(`${n} buffs again (its approved plan, or the suggestion as the settings allow).`)], confirmText: to ? 'Buffing OFF' : 'Buffing ON', cancelText: 'Cancel' })) return;
      await post({ action: 'switches', leader: p.leader, name: n, noBuffs: to }, `${n}: buffing ${to ? 'OFF' : 'ON'}`); return;
    }
    if (act === 'remove' && n) { openRemove(n); return; }
    if (act === 'self' && n) { openSelf(n); return; }   // SELFOFF-2026-10-23
    if (act === 'selfSave' && E && E.kind === 'self') {
      const list = E.opts.filter(o => !o.on && !o.always).map(o => o.name);
      const nm = E.name, r = await post({ action: 'selfoff', leader: E.leader, name: nm, selfOff: list }, list.length ? `${nm} no longer casts: ${list.join(', ')}` : `${nm}: keeps every self buff up`);
      if (r) closeSheet();
      return;
    }   // MR.P 2026-10-10: the buffs this character cancels itself (and buffers never cast on it)
    // D12 2026-10-12 ("cannot choose a buff to 'Never keep'"): a tick list in the bottom sheet instead of a free-text prompt (the prompt had
    // nothing to choose from, a typo silently matched nothing, and an empty field kept Save disabled, so a list could never be cleared)
    if (act === 'rmAdd' && E && E.kind === 'remove') {
      const inp = $id('bpRmAdd'), v = ((inp && inp.value) || '').trim().slice(0, 60); if (!v) return;
      if (!E.opts.some(o => o.key === v.toLowerCase())) E.opts.push({ key: v.toLowerCase(), name: v, from: 'typed', ab: '' });
      E.sel[v.toLowerCase()] = v; renderRemove(); return;
    }
    if (act === 'rmNone' && E && E.kind === 'remove') { E.sel = {}; renderRemove(); return; }
    if (act === 'rmSave' && E && E.kind === 'remove') {
      const list = Object.keys(E.sel).map(k => E.sel[k]).filter(Boolean);
      if (list.length > 40) { flash('At most 40 buffs on the list', true); return; }
      const nm = E.name, r = await post({ action: 'remove', leader: E.leader, name: nm, remove: list }, list.length ? `${nm} cancels: ${list.join(', ')}` : `${nm}: keeps every buff`);
      if (r) closeSheet();
      return;
    }
    if (act === 'unapprove' && m) { if (!await uiConfirm({ title: `Unapprove ${m.name}'s buff plan?`, body: `The plan is kept as "not reviewed"; ${m.name} then runs it only as the settings allow for a suggestion.`, confirmText: 'Unapprove' })) return; await post({ action: 'unapprove', leader: p.leader, names: [m.name] }, `${m.name}: buff plan unapproved.`); return; }
    if (act === 'clear' && m) { if (!await uiConfirm({ title: `Remove ${m.name}'s buff plan?`, body: `Without a plan ${m.name} runs the suggestion from its skills (if the settings allow it).`, confirmText: 'Remove plan', danger: true })) return; await post({ action: 'clear', leader: p.leader, names: [m.name] }, `${m.name}: buff plan removed.`); return; }
    if (act === 'saveTpl' && p) {
      const nm = await uiPrompt({ title: 'Save as group template', body: `From party ${p.leader}'s buff plans (by class).`, label: 'Name of the new template', value: `Party ${p.leader} buffs`, confirmText: 'Save template',
        validate: (v) => (v.trim() ? (v.trim().length > 60 ? 'At most 60 characters' : '') : 'Give it a name') }); if (!nm) return;
      await post({ action: 'saveTemplate', leader: p.leader, templateName: nm }, `template "${nm}" saved.`); return;
    }
    if (act === 'applyTpl' || act === 'applyTplId') {
      const id = act === 'applyTpl' ? ($id('bpTplSel') || {}).value : t.dataset.bpt; if (!id || !p) return;
      const pre = await api('/api/buffplans', { method: 'POST', body: JSON.stringify({ action: 'applyTemplate', leader: p.leader, id, dryRun: true }) });
      if (!pre || pre.error) { flash((pre && pre.error) || 'template check failed', true); return; }
      if (!pre.assign.length) { flash(`nobody in party ${p.leader} has a class of template "${pre.template.name}"`, true); return; }
      if (!await uiConfirm({ title: 'Apply template', body: [uiP('Apply ', uiEm(`"${pre.template.name}"`), ` to party ${p.leader}?`),
        uiList(pre.assign.map(x => [uiEm(x.name), ` (${x.cls}): ${x.buffs} buffs, ${x.rotation} songs / dances`, x.replaces ? `  — replaces its plan${x.wasApproved ? ' (approved)' : ''}` : ''])),
        pre.left.length ? uiNote('Not changed: ' + pre.left.join(', ')) : '', 'Saved as NOT reviewed: approve each plan afterwards.'], confirmText: 'Apply template' })) return;
      await post({ action: 'applyTemplate', leader: p.leader, id }, `template applied to ${pre.assign.length} member(s) (not reviewed).`); return;
    }
    if (act === 'delTpl') { if (!await uiConfirm({ title: 'Delete this template?', body: 'Plans already applied to parties stay.', confirmText: 'Delete template', danger: true })) return; await post({ action: 'deleteTemplate', id: t.dataset.bpt }, 'template deleted.'); return; }
    if (act === 'saveSet') {
      const settings = { songDanceMax: +$id('bpSetSd').value, gatherPct: +$id('bpSetGp').value, gatherRange: +$id('bpSetGr').value, firstCycleCaster: $id('bpSetFc').value, buffGroupRule: $id('bpSetGrp').value };
      $id('bpSet').querySelectorAll('input[data-bpset]').forEach(i => { settings[i.dataset.bpset] = +i.value; });
      await post({ action: 'settings', settings }, 'settings saved.'); return;
    }
  }
  function onChange(e) {
    const E = BP.ed, x = e.target; if (!E || !x || !x.dataset) return;
    if (x.dataset.bpkeep !== undefined) { E.rows[+x.dataset.bpkeep].keep = x.checked; renderEditor(); }
    else if (x.dataset.bptgt !== undefined) { const r = E.rows[+x.dataset.bptgt]; const set = new Set(r.targets || []); if (x.checked) set.add(x.value); else set.delete(x.value); r.targets = [...set]; if (!r.targets.length) r.targets = ['party']; E.openTg = +x.dataset.bptgt; renderEditor(); }
    else if (x.dataset.bpsw) { E[x.dataset.bpsw] = x.checked; }
    else if (x.dataset.bprot !== undefined) { E.rot[+x.dataset.bprot].on = x.checked; renderEditor(); }
    else if (x.dataset.bpka !== undefined) { E.rot[+x.dataset.bpka].keepAlways = x.checked; }
    else if (x.dataset.bpself !== undefined && E.kind === 'self') { const o = E.opts[+x.dataset.bpself]; if (o && !o.always) o.on = x.checked; renderSelf(); }   // SELFOFF-2026-10-23
    else if (x.dataset.bprm !== undefined && E.kind === 'remove') { const o = E.opts[+x.dataset.bprm]; if (o) { if (x.checked) E.sel[o.key] = o.name; else delete E.sel[o.key]; } renderRemove(); }
  }

  setInterval(() => { if (!document.hidden && !BP.open) load(true); }, 60000);
  load(true);
  window.BuffPlans = { partyBadge, load, _bp: BP };
  window.BuffPage = { route, open, close, _bp: BP };
})();
