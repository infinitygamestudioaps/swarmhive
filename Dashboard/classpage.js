// CLASSES page #/classes (user 2026-10-10: "Every single class should have a plan, and it should be configurable from the user per party! It
// should never upgrade without asking. Or at least show that there is no plan for them. Then the user can select the plan ... make sure they
// see it's missing with a warning, animated; then they should have a nice overview of what they can do and select per class. They should be
// able to create group templates like we have.")
//
// Hook: index.html route() -> ClassPage.route(kind, arg) (#/classes, #/classes/<leader>). Data: GET /api/classplans + /api/classtree,
// writes POST /api/classplans (Dashboard/classpage_api.js -> Scripts/data/class_plans.json, read live by swarm.js; the gate is
// Dashboard/classlogic.js = the CLASSPLAN-PURE block of swarm.js). Also exports the badges for the other pages: window.ClassPlans
//   memberBadge(c)        on a Parties member row      partyBadge(leader)  in a party header
//   topBanner()           on top of the Parties tab    charBadge(name)     on the character page
// The badges are animated (pulse) with their text always visible; prefers-reduced-motion switches the animation off (classpage.css).
// Uses index.html globals: esc, api, go, GI, UI, classIcon, patch, stopChar, TAB.
(function () {
  'use strict';
  const SEC = 'tab-classpage';
  const CP = { open: false, data: null, tree: null, at: 0, sel: null, pick: null, tpl: null, busy: false, timer: 0, msgT: 0, loading: null };
  const $id = (i) => document.getElementById(i);
  const L = () => window.ClassLogic;
  const TIER = ['base class', '1st profession', '2nd profession', '3rd profession'];
  const WARN = { missing: 1, 'needs-approval': 1, invalid: 1, 'off-plan': 1, ambiguous: 1 };
  const clsName = (id) => { const c = CP.tree && CP.tree.classes[String(id)]; return c ? c.name : (id == null ? '?' : 'class ' + id); };
  const cls = (id) => CP.tree && CP.tree.classes[String(id)];
  const icon = (id, extra) => { try { return classIcon({ classId: id }, extra || ''); } catch (e) { return ''; } };
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s));
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('swarm.cp.' + k)); localStorage.setItem('swarm.cp.' + k, JSON.stringify(v)); } catch (e) { return null; } return null; };

  // =========================================================================================== data (also for the badges on other pages)
  async function load(force) {
    if (CP.loading) return CP.loading;
    if (!force && CP.data && Date.now() - CP.at < 20000) return CP.data;
    CP.loading = (async () => {
      try {
        if (!CP.tree) { const t = await api('/api/classtree'); if (t && t.classes) CP.tree = t; }
        const d = await api('/api/classplans');
        if (d && !d.error) { CP.data = d; CP.at = Date.now(); }
        else if (d && d.error) flash(d.error, true);
      } catch (e) { /* the server may be an older one without the API: the badges stay hidden */ }
      finally { CP.loading = null; }
      if (CP.open) render();
      return CP.data;
    })();
    return CP.loading;
  }
  function member(name) { if (!CP.data) return null; for (const p of CP.data.parties) { const m = p.members.find(x => x.name === name); if (m) return Object.assign({ party: p.leader }, m); } return null; }
  function party(leader) { return CP.data ? CP.data.parties.find(p => p.leader === leader) || null : null; }

  // =========================================================================================== badges (other pages)
  const BADGE = {
    missing: ['cpb-miss', 'No class plan', 'This character has no class plan: it will NOT change class until you make and approve one (Classes page).', 'No plan'],
    'needs-approval': ['cpb-appr', 'Plan not approved', 'The class plan is not approved yet: no class change until you approve it (Classes page).', 'Not approved'],
    invalid: ['cpb-miss', 'Class plan broken', 'The class plan does not fit the class tree: no class change (Classes page).'],
    'off-plan': ['cpb-miss', 'Class off plan', 'The current class is not on the plan: no class change (Classes page).'],
    ambiguous: ['cpb-miss', 'Two class plans', 'Two parties hold different plans for this character: no class change (Classes page).'],
  };
  function badgeHtml(m, small) {
    if (!m) return '';
    const b = BADGE[m.status];
    if (b) return `<a class="cpbadge ${b[0]}${small ? ' sm' : ''}" href="#/classes/${encodeURIComponent(m.party || '')}" title="${h(b[2] + (m.why ? ' — ' + m.why : ''))}" data-cpbadge="${h(m.name)}" aria-label="${h(b[1] + ': ' + b[2])}"><i aria-hidden="true"></i><span class="lg">${h(b[1])}</span><span class="sh">${h(b[3] || b[1])}</span></a>`;
    if (m.status === 'ready') return `<a class="cpbadge cpb-ready${small ? ' sm' : ''}" href="#/classes/${encodeURIComponent(m.party || '')}" title="Approved plan: the class change to ${h(m.nextName)} is due now">▲ ${h(m.nextName)}</a>`;
    return '';
  }
  function memberBadge(c) { if (!CP.data) { load(false); return ''; } return badgeHtml(member(c && c.name), true); }
  function charBadge(name) { if (!CP.data) { load(false); return ''; } const m = member(name); if (!m) return ''; if (BADGE[m.status] || m.status === 'ready') return badgeHtml(m, false);
    return m.plan ? `<a class="cpbadge cpb-ok" href="#/classes/${encodeURIComponent(m.party)}" title="${h(m.why || '')}">Class plan ✓ ${h(m.plan.map(clsName).join(' › '))}</a>` : ''; }
  function partyBadge(leader) {
    if (!CP.data) { load(false); return ''; }
    const p = party(leader); if (!p || !p.counts.warn) return '';
    return `<a class="cpbadge cpb-miss sm" href="#/classes/${encodeURIComponent(leader)}" title="${p.counts.missing} without a plan, ${p.counts.approval} not approved, ${p.counts.problem} with a problem: they will not change class"><i aria-hidden="true"></i>${p.counts.warn} no class plan</a>`;
  }
  function topBanner() {
    if (!CP.data) { load(false); return ''; }
    const c = CP.data.counts; if (!c.warn) return '';
    const ps = CP.data.parties.filter(p => p.counts.warn).map(p => `party ${h(p.leader)} (${p.counts.warn})`).join(', ');
    return `<a class="cpbanner" href="#/classes"><span class="pulse" aria-hidden="true"></span><b>${c.warn} character${c.warn === 1 ? '' : 's'} without an approved class plan</b><span>${ps}</span><span class="muted">they will NOT change class</span><span class="go">Make plans ›</span></a>`;
  }

  // =========================================================================================== page
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win cpl'; s.hidden = true;
    s.innerHTML = `<div class="cpl-headrow"><h2>${typeof GI === 'function' && typeof UI !== 'undefined' ? GI(UI.char || 'L2UI_CT1/crop/Icon_DF_MenuWnd_Character', 'sm') : ''} Class plans</h2>
        <span class="muted cpl-intro">Which class each character becomes at level 20 / 40 / 76. A character changes class <b>only</b> with a plan you approved here.</span></div>
      <div id="cpBanner"></div><div class="cpl-msg" id="cpMsg" role="status" hidden></div>
      <div class="cpl-parties" id="cpParties" role="tablist" aria-label="parties"></div>
      <div id="cpParty"></div>
      <div class="box cpl-tpls"><h3>Group templates</h3><div id="cpTpls"></div></div>
      <details class="box cpl-help"><summary><h3>How it works</h3></summary><div class="cpl-helpbody">
        <p>Every character needs a <b>class plan</b>: its 1st, 2nd and 3rd profession (level 20, 40, 76). Tap <b>Plan…</b> on a member, pick the classes step by step (only the classes the game allows after its current class are offered), then <b>Save &amp; approve</b>.</p>
        <p>When a character with an <b>approved</b> plan reaches the level, its party leader orders the change on the Community Board (Alt+B → Career → Professions; the server takes a fee, 200,000 adena on L2Toggle). No plan, a plan you did not approve, or a plan that does not fit its class = it never changes class and says so in party chat once.</p>
        <p><b>Templates</b> are plans for a whole group (e.g. "tank + healer + 7 nukers"). <b>Save party as template</b> stores this party's plans; <b>Apply</b> matches a template to a party by each member's current class and role and shows you the result before anything is saved.</p>
      </div></details>
      <div class="cpl-sheet" id="cpSheet" hidden><div class="cpl-panel" id="cpPanel" role="dialog" aria-modal="true" aria-label="class plan"></div></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('change', onChange);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && CP.pick) closeSheet(); });
    return s;
  }
  function route(kind, arg) {
    if (kind === 'classes') { open(arg ? decodeURIComponent(arg) : null); return true; }
    close(); return false;
  }
  function open(leader) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'classes'; } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'classes')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    const was = CP.open; s.hidden = false; CP.open = true;
    if (leader) CP.sel = leader; else if (!CP.sel) CP.sel = store('sel') || null;
    if (!was) window.scrollTo(0, 0);
    if (!CP.timer) CP.timer = setInterval(() => { if (CP.open && !document.hidden && !CP.pick && !CP.tpl) load(true); }, 20000);
    render(); load(true);
  }
  function close() {
    if (!CP.open) return;
    CP.open = false; closeSheet(); clearInterval(CP.timer); CP.timer = 0;
    const s = $id(SEC); if (s) s.hidden = true;
  }
  function flash(t, bad) {
    const m = $id('cpMsg'); if (!m) return;
    m.hidden = !t; m.className = 'cpl-msg' + (bad ? ' bad' : ''); m.textContent = t || '';
    clearTimeout(CP.msgT); CP.msgT = setTimeout(() => { const x = $id('cpMsg'); if (x) x.hidden = true; }, bad ? 14000 : 8000);
  }
  const put = (el, html) => { if (!el) return; if (typeof patch === 'function') patch(el, html); else el.innerHTML = html; };

  function render() {
    if (!CP.open) return;
    const d = CP.data;
    if (!d || !CP.tree) { put($id('cpParty'), '<div class="muted">Loading the class plans…</div>'); return; }
    if (!CP.sel || !party(CP.sel)) CP.sel = (d.parties.find(p => p.counts.warn) || d.parties[0] || {}).leader || null;
    store('sel', CP.sel);
    const want = '#/classes/' + encodeURIComponent(CP.sel || '');
    if (CP.sel && location.hash !== want && /^#\/classes/.test(location.hash)) history.replaceState(null, '', want);
    put($id('cpBanner'), d.broken ? `<div class="cpl-msg bad">${h(d.file)} does not parse (${h(d.broken)}): nobody changes class until it is fixed or restored from history/.</div>` : topBanner());
    put($id('cpParties'), d.parties.map(p => `<button role="tab" aria-selected="${p.leader === CP.sel}" class="cpl-ptab ${p.leader === CP.sel ? 'on' : ''}" data-cpparty="${h(p.leader)}">Party ${h(p.leader)}
      ${p.counts.warn ? `<span class="cpcount" title="${p.counts.warn} without an approved plan">${p.counts.warn}</span>` : '<span class="cpok" title="every member has an approved plan">✓</span>'}</button>`).join(''));
    put($id('cpParty'), partyHtml(party(CP.sel)));
    put($id('cpTpls'), tplsHtml());
  }
  const STATUS_TXT = {
    missing: ['bad', 'No plan'], 'needs-approval': ['warn', 'Not approved'], invalid: ['bad', 'Broken plan'], 'off-plan': ['bad', 'Off plan'], ambiguous: ['bad', 'Two plans'],
    waiting: ['ok', 'Approved'], ready: ['ready', 'Change due'], done: ['ok', 'Plan complete'], unknown: ['unk', 'Class unknown'],
  };
  function pathHtml(m) {
    const plan = m.plan || [];
    if (!plan.length) return m.suggestion ? `<span class="cpl-sugg" title="A suggestion (${h(m.suggestion.source)}) — not a plan until you save and approve it">suggested: ${h(m.suggestion.plan.map(clsName).join(' › '))}</span>` : '<span class="muted">—</span>';
    const ch = L().cpChain(CP.tree, plan) || [];
    const at = ch.indexOf(Number(m.classId));
    return ch.slice(1).map((id, i) => { const c = cls(id) || {}; const st = at >= 0 && i + 1 <= at ? 'done' : at >= 0 && i + 1 === at + 1 ? 'next' : 'later';
      return `<span class="cpl-step ${st}" title="${h(TIER[c.tier] + ' at level ' + c.changeLevel + (st === 'done' ? ' (taken)' : ''))}">${icon(id, 'sm')}${h(c.name || id)}<em>${c.changeLevel || ''}</em></span>`; }).join('<span class="cpl-arr" aria-hidden="true">›</span>');
  }
  function partyHtml(p) {
    if (!p) return '<div class="muted">No parties in swarm.config.json.</div>';
    const ms = p.members;
    const appr = ms.filter(m => m.status === 'needs-approval').map(m => m.name);
    const tpls = (CP.data.templates || []);
    return `<div class="box cpl-pbox">
      <h3><span>Party ${h(p.leader)}</span><span class="muted">· ${ms.length} member${ms.length === 1 ? '' : 's'} · ${p.counts.warn ? `<b class="cpwarn">${p.counts.warn} without approved plan</b>` : 'every member has an approved plan'}</span></h3>
      <div class="cpl-bulk">
        ${appr.length ? `<button data-cpact="approveAll" title="Approve the ${appr.length} saved plan(s) that are not approved yet">Approve ${appr.length} plan${appr.length === 1 ? '' : 's'}…</button>` : ''}
        <label class="cpl-inl">Template <select id="cpTplSel" aria-label="template to apply">${tpls.map(t => `<option value="${h(t.id)}">${h(t.name)}${t.example ? ' (example)' : ''}</option>`).join('')}</select></label>
        <button data-cpact="applyTpl" ${tpls.length ? '' : 'disabled'} title="Match the template to this party (you see the result before anything is saved)">Apply template…</button>
        <button data-cpact="saveTpl" title="Store this party's plans as a group template">Save party as template…</button>
      </div>
      <div class="cpl-mems" role="table" aria-label="members">
        <div class="cpl-mrow cpl-mhead" role="row"><span role="columnheader">Character</span><span role="columnheader">Now</span><span role="columnheader">Plan</span><span role="columnheader">Status</span><span role="columnheader"></span></div>
        ${ms.map(m => memberRowHtml(p, m)).join('')}
      </div></div>`;
  }
  function memberRowHtml(p, m) {
    const [k, txt] = STATUS_TXT[m.status] || ['unk', m.status];
    const warn = WARN[m.status];
    const next = m.status === 'waiting' ? `next: ${h(m.nextName)} at ${m.needLevel}` : m.status === 'ready' ? `due now: ${h(m.nextName)}` : m.needLevel ? `next profession at ${m.needLevel}` : '';
    const same = CP.data.parties.reduce((n, q) => n + q.members.filter(x => x.name !== m.name && x.classId != null && x.classId === m.classId).length, 0);
    const rep = m.reported && m.reported !== m.text ? `<div class="cpl-rep" title="what the bot itself reports (swarm_state, ${m.ageSec != null ? m.ageSec + ' s old' : 'no state'})">bot says: ${h(m.reported)}</div>` : '';
    return `<div class="cpl-mrow ${warn ? 'warn' : ''}" role="row" data-cpname="${h(m.name)}">
      <span class="cpl-who" role="cell">${icon(m.classId)}<b>${h(m.name)}</b><span class="lvl">${m.level != null ? m.level : '?'}</span>${m.role ? `<span class="muted">${h(m.role)}</span>` : ''}${m.online ? '' : '<span class="muted">offline</span>'}</span>
      <span class="cpl-now" role="cell">${h(m.cls || clsName(m.classId))}${next ? `<div class="muted">${next}</div>` : ''}</span>
      <span class="cpl-path" role="cell">${pathHtml(m)}${m.planParty ? `<div class="muted">plan stored under party ${h(m.planParty)}</div>` : ''}</span>
      <span class="cpl-st" role="cell">${warn ? badgeHtml(Object.assign({ party: p.leader }, m), true) : `<span class="cpl-stc ${k}">${h(txt)}</span>`}${m.why && m.status !== 'missing' ? `<div class="muted cpl-why">${h(m.why)}</div>` : ''}${m.approved && m.approvedBy ? `<div class="muted">approved by ${h(m.approvedBy)}${m.approvedAt ? ' ' + h(m.approvedAt.slice(0, 10)) : ''}</div>` : ''}${rep}</span>
      <span class="cpl-btns" role="cell">
        <button data-cpact="pick" data-cpn="${h(m.name)}" ${m.classId == null ? 'disabled title="class unknown (no state from this character yet)"' : 'title="Choose the classes"'}>Plan…</button>
        ${m.plan && !m.approved && m.status !== 'invalid' ? `<button data-cpact="approve" data-cpn="${h(m.name)}">Approve…</button>` : ''}
        ${m.plan && m.approved ? `<button data-cpact="unapprove" data-cpn="${h(m.name)}" title="Keep the plan, but no class change until you approve it again">Unapprove</button>` : ''}
        ${m.plan && same ? `<button data-cpact="copy" data-cpn="${h(m.name)}" title="Give this plan to every member who is ${h(m.cls)} now">Copy to same class (${same})…</button>` : ''}
        ${m.plan ? `<button data-cpact="clear" data-cpn="${h(m.name)}" title="Remove the plan (= no class change)">Remove</button>` : ''}
      </span></div>`;
  }
  function tplsHtml() {
    const t = CP.data.templates || [];
    if (!t.length) return '<div class="muted">No templates yet. "Save party as template" stores a party\'s plans.</div>';
    return `<div class="cpl-tlist">${t.map(x => `<div class="cpl-tpl">
      <div class="cpl-tname"><b>${h(x.name)}</b>${x.example ? '<span class="chip">example</span>' : ''}${x.from ? `<span class="muted">from ${h(x.from)}</span>` : ''}</div>
      ${x.desc ? `<div class="muted">${h(x.desc)}</div>` : ''}
      <div class="cpl-tslots">${(x.slots || []).map(s => `<span class="cpl-tslot" title="${h((s.plan || []).map(clsName).join(' › '))}">${icon((s.plan || [])[(s.plan || []).length - 1], 'sm')}${h(s.label || s.role || '')}</span>`).join('')}</div>
      <div class="cpl-tact"><button data-cpact="applyTplId" data-cpt="${h(x.id)}">Apply to party ${h(CP.sel || '')}…</button>${x.own ? `<button data-cpact="delTpl" data-cpt="${h(x.id)}">Delete</button>` : ''}</div></div>`).join('')}</div>`;
  }

  // =========================================================================================== class picker (bottom sheet on phones)
  function openPicker(name) {
    const p = party(CP.sel), m = p && p.members.find(x => x.name === name); if (!m) return;
    const tree = CP.tree, cur = cls(m.classId); if (!cur) { flash(`${name}: current class unknown`, true); return; }
    // taken steps (fixed) = my line up to my current class; planned steps = the saved plan beyond it, else the suggestion
    const taken = []; let c = cur; for (let i = 0; i < 4 && c && c.tier > 0; i++) { taken.unshift(c.id); c = cls(c.parent); }
    const base = m.plan && L().cpFits(tree, m.plan, m.classId) ? m.plan : m.suggestion ? m.suggestion.plan : taken;
    CP.pick = { name, leader: p.leader, classId: m.classId, level: m.level, taken, steps: base.slice(0, 3).map(Number), orig: m.plan ? m.plan.slice() : null, approved: m.approved, sugg: m.suggestion };
    renderPicker();
    const sh = $id('cpSheet'); sh.hidden = false; document.documentElement.classList.add('cpl-modal');
    setTimeout(() => { const f = $id('cpPanel').querySelector('button.cpl-opt.on, button.cpl-opt'); if (f) f.focus(); }, 30);
  }
  function closeSheet() { CP.pick = null; CP.tpl = null; const sh = $id('cpSheet'); if (sh) sh.hidden = true; const pn = $id('cpPanel'); if (pn) { pn.innerHTML = ''; pn._last = null; } document.documentElement.classList.remove('cpl-modal'); }
  function renderPicker() {
    const P = CP.pick, tree = CP.tree, cur = cls(P.classId);
    const root = cls(cur.root);
    const cols = [1, 2, 3].map(t => {
      const prevId = t === 1 ? root.id : P.steps[t - 2];
      const takenId = P.taken[t - 1];
      const prev = prevId != null ? cls(prevId) : null;
      const opts = takenId != null ? [takenId] : prev ? prev.children.filter(c2 => { const k2 = cls(c2); return !(k2 && k2.subclassOnly); }) : [];   // subclass-only classes are never a main plan (user 2026-10-10)
      const lvl = (tree.meta.levels || {})[t];
      return `<div class="cpl-col"><div class="cpl-colh">Step ${t}: ${TIER[t]} <span class="muted">at level ${lvl}</span></div>
        ${prevId == null && takenId == null ? '<div class="muted">pick step ' + (t - 1) + ' first</div>' : ''}
        ${opts.map(id => { const k = cls(id) || {}; const on = Number(P.steps[t - 1]) === Number(id); const fixed = takenId != null;
          const off = !on && !fixed && P.steps[t - 1] != null;   // 2026-10-10 (user: "very hard to see what is selected"): the not-chosen options of a decided step are dimmed
          return `<button class="cpl-opt ${on ? 'on' : ''} ${off ? 'off' : ''} ${fixed ? 'fixed' : ''}" data-cpstep="${t}" data-cpid="${id}" ${fixed ? 'aria-disabled="true"' : ''} aria-pressed="${on}">
            ${icon(id)}<span class="cpl-on"><b>${h(k.name)}</b><span class="cpl-role">${h(k.roleLabel || '')}</span>${fixed ? '<span class="cpl-pick done">✓ current class</span>' : on ? '<span class="cpl-pick">✓ Chosen</span>' : ''}${k.subclassOnly ? '<span class="cpl-tag warn" title="On retail High Five this class is only available as a subclass; check the Career page first">subclass only?</span>' : ''}
            <span class="cpl-desc">${h(k.desc || '')}</span></span></button>`; }).join('')}
        ${takenId == null && P.steps[t - 1] != null ? `<button class="cpl-stop" data-cpstop="${t}" title="End the plan before this step: no class change after step ${t - 1}">stop before this step</button>` : ''}
      </div>`;
    }).join('');
    const plan = P.steps.filter(x => x != null);
    const v = plan.length ? L().cpValidate(tree, plan) : { ok: false, why: 'pick at least the 1st profession' };
    const fits = plan.length && L().cpFits(tree, plan, P.classId);
    const ok = v.ok && fits;
    put($id('cpPanel'), `<div class="cpl-ph"><div>${icon(P.classId)}<b>${h(P.name)}</b> <span class="muted">party ${h(P.leader)} · lvl ${P.level != null ? P.level : '?'} · now ${h(cur.name)} (${h(cur.raceLabel)}${cur.gender ? ' ' + (cur.gender === 'M' ? 'male' : 'female') : ''} ${h(cur.type)})</span></div>
        <button class="cpl-x" data-cpact="close" aria-label="close">✕</button></div>
      <div class="cpl-sum" aria-live="polite">${h(root.name)} › ${plan.length ? plan.map(id => `<b>${h(clsName(id))}</b> <em>${(cls(id) || {}).changeLevel}</em>`).join(' › ') : '<span class="muted">no steps</span>'}
        ${!ok ? `<div class="cpl-err">${h(v.ok ? 'the current class ' + cur.name + ' is not on this path' : v.why)}</div>` : plan.length < 3 ? `<div class="muted">The plan ends at ${h(clsName(plan[plan.length - 1]))}: no class change after it.</div>` : ''}</div>
      ${P.sugg && !P.orig ? `<div class="muted cpl-suggline">Pre-filled from a suggestion (${h(P.sugg.source)}). Nothing is saved until you tap Save.</div>` : ''}
      <div class="cpl-cols">${cols}</div>
      <div class="cpl-pfoot">
        <button data-cpact="savePlan" ${ok ? '' : 'disabled'} title="Save without approval: the character will NOT change class yet">Save (not approved)</button>
        <button class="cpl-primary" data-cpact="saveApprove" ${ok ? '' : 'disabled'}>Save &amp; approve…</button>
        <button data-cpact="close">Cancel</button>
      </div>`);
  }
  /** the confirm text: exactly what will happen and when */
  /** The approval dialog (UIDIALOG 2026-10-10: a structured uiConfirm, was one long confirm() text) -> Promise<boolean> */
  function approveDialog(name, leader, plan, classId, level) {
    const tree = CP.tree, ch = L().cpChain(tree, plan), at = ch.indexOf(Number(classId));
    const rest = ch.slice(at + 1);
    const lines = rest.map(id => { const c = cls(id); return [uiEm(`at level ${c.changeLevel}`), ': ', c.name, c.subclassOnly ? '  (retail: subclass only — check the Career page)' : '']; });
    const fee = CP.data && CP.data.fee ? Number(CP.data.fee).toLocaleString('en-US') + ' adena' : '';
    const now = level != null && rest.length && level >= cls(rest[0]).changeLevel;
    const body = [uiP('Approve the class plan of ', uiEm(name), ` (party ${leader})?`), uiPath(ch.map(clsName))];
    if (rest.length) body.push(
      uiH('What happens'), uiList(lines),
      uiKV([['Who orders it', `party leader ${leader}, when ${name} reaches the level (now ${level != null ? level : '?'})`],
        ['Where', `${name} changes class on the Community Board (Alt+B › Career › Professions)`]].concat(fee ? [['Fee', `the server's fee (${fee} on L2Toggle)`]] : [])),
      now ? uiP(uiEm(`${name} is already level ${level}`), `: the change to ${clsName(rest[0])} can happen within a minute.`) : '',
      uiWarn('A class change cannot be undone.'),
      uiNote('You can change or unapprove the plan any time before that.'));
    else body.push('The plan is already complete: nothing will change.');
    return uiConfirm({ title: 'Approve class plan', body, confirmText: 'Approve plan', cancelText: 'Cancel' });
  }
  async function post(body, okText) {
    if (CP.busy) return null;
    CP.busy = true;
    try {
      const r = await api('/api/classplans', { method: 'POST', body: JSON.stringify(Object.assign({ rev: CP.data && CP.data.rev, by: 'dashboard' }, body)) });
      if (!r || r.error) { flash((r && r.error) || 'not saved', true); if (r && /changed meanwhile/.test(r.error || '')) await load(true); return null; }
      if (okText) flash(okText + ' The bots read it within 10 s (no restart).');
      await load(true);
      return r;
    } catch (e) { flash('Not saved: ' + e.message, true); return null; }
    finally { CP.busy = false; }
  }

  // =========================================================================================== templates (apply = preview first)
  async function previewTemplate(id) {
    const r = await api('/api/classplans', { method: 'POST', body: JSON.stringify({ action: 'applyTemplate', leader: CP.sel, id, dryRun: true }) });
    if (!r || r.error) { flash((r && r.error) || 'template check failed', true); return; }
    CP.tpl = { id, leader: CP.sel, r, approve: false };
    renderTpl();
    $id('cpSheet').hidden = false; document.documentElement.classList.add('cpl-modal');
  }
  function renderTpl() {
    const T = CP.tpl, m = T.r.match;
    put($id('cpPanel'), `<div class="cpl-ph"><div><b>Apply "${h(T.r.template.name)}"</b> <span class="muted">to party ${h(T.leader)}</span></div><button class="cpl-x" data-cpact="close" aria-label="close">✕</button></div>
      <p class="muted">Members are matched by their current class (it must be on the slot's path) and role. Untick anyone you want to keep as is.</p>
      ${m.assign.length ? `<div class="cpl-tmatch">${m.assign.map(x => `<label class="cpl-tm"><input type="checkbox" data-cptm="${h(x.name)}" checked>
        <b>${h(x.name)}</b> <span class="muted">(${h(x.slot)})</span> <span>${h(x.plan.map(clsName).join(' › '))}</span>${x.replaces ? `<span class="cpl-tag warn">replaces ${h(x.replaces.map(clsName).join(' › '))}${x.wasApproved ? ' (approved)' : ''}</span>` : ''}</label>`).join('')}</div>` : '<div class="cpl-err">No member fits any slot of this template.</div>'}
      ${m.unmatched.length ? `<div class="muted">Slots nobody fits: ${h(m.unmatched.map(i => { const tp = (CP.data.templates || []).find(x => x.id === T.id); return (tp && tp.slots[i] && tp.slots[i].label) || 'slot ' + (i + 1); }).join(', '))}</div>` : ''}
      ${m.left.length ? `<div class="muted">Not changed (no slot fits): ${h(m.left.join(', '))}</div>` : ''}
      ${T.r.unknown && T.r.unknown.length ? `<div class="muted">Class unknown (no state yet, skipped): ${h(T.r.unknown.join(', '))}</div>` : ''}
      <label class="cpl-inl cpl-apprchk"><input type="checkbox" id="cpTplAppr"> approve these plans now (otherwise they are saved as "not approved")</label>
      <div class="cpl-pfoot"><button class="cpl-primary" data-cpact="tplGo" ${m.assign.length ? '' : 'disabled'}>Apply…</button><button data-cpact="close">Cancel</button></div>`);
  }

  // =========================================================================================== events
  async function onClick(e) {
    const t = e.target.closest('[data-cpparty],[data-cpact],[data-cpstep],[data-cpstop]'); if (!t) return;
    if (t.dataset.cpparty) { CP.sel = t.dataset.cpparty; render(); return; }
    if (t.dataset.cpstep) {
      if (t.getAttribute('aria-disabled') === 'true') return;
      const step = +t.dataset.cpstep, id = +t.dataset.cpid, P = CP.pick;
      const old = P.steps[step - 1];
      P.steps[step - 1] = id;
      // later steps stay only while they still follow the step before them
      for (let s2 = step; s2 < P.steps.length; s2++) { const k = cls(P.steps[s2]); if (!k || Number(k.parent) !== Number(P.steps[s2 - 1])) { P.steps = P.steps.slice(0, s2); break; } }
      // a single child: fill it in (e.g. Orc Raider -> Destroyer -> Titan); the user can still stop before it
      if (old !== id) for (let s2 = step; s2 < 3; s2++) { const k = cls(P.steps[s2 - 1]); if (P.steps[s2] == null && k && k.children.filter(c2 => !(cls(c2) || {}).subclassOnly).length === 1) P.steps[s2] = k.children.filter(c2 => !(cls(c2) || {}).subclassOnly)[0]; else break; }
      P.steps = P.steps.filter(x => x != null);
      renderPicker(); return;
    }
    if (t.dataset.cpstop) { const s = +t.dataset.cpstop; CP.pick.steps = CP.pick.steps.slice(0, s - 1); renderPicker(); return; }
    const act = t.dataset.cpact, n = t.dataset.cpn, p = party(CP.sel), m = p && n ? p.members.find(x => x.name === n) : null;
    if (act === 'close') { closeSheet(); return; }
    if (act === 'pick') { openPicker(n); return; }
    if (act === 'savePlan' || act === 'saveApprove') {
      const P = CP.pick, plan = P.steps.filter(x => x != null);
      const approve = act === 'saveApprove';
      if (approve && !await approveDialog(P.name, P.leader, plan, P.classId, P.level)) return;
      const r = await post({ action: 'set', leader: P.leader, name: P.name, plan, approve, confirm: approve }, approve ? `${P.name}: plan saved and APPROVED.` : `${P.name}: plan saved (not approved — no class change until you approve it).`);
      if (r) closeSheet();
      return;
    }
    if (act === 'approve' && m) { if (!await approveDialog(m.name, p.leader, m.plan, m.classId, m.level)) return; await post({ action: 'approve', leader: p.leader, names: [m.name], confirm: true }, `${m.name}: plan APPROVED.`); return; }
    if (act === 'approveAll' && p) {
      const list = p.members.filter(x => x.status === 'needs-approval');
      const items = list.map(x => { const ch = L().cpChain(CP.tree, x.plan); const at = ch.indexOf(Number(x.classId)); const nx = ch[at + 1];
        return [uiEm(x.name), ` (lvl ${x.level != null ? x.level : '?'}, ${x.cls}): `, uiPath(ch.map(clsName)), nx != null ? `  — next: ${clsName(nx)} at ${cls(nx).changeLevel}` : '  — complete']; });
      if (!await uiConfirm({ title: `Approve ${list.length} class plan${list.length === 1 ? '' : 's'}`, body: [uiP(`Approve ${list.length} class plan(s) in party ${p.leader}?`), uiList(items),
        `Each one changes class on the Community Board when it reaches the level (party leader ${p.leader} orders it; the server takes its fee).`, uiWarn('A class change cannot be undone.')],
        confirmText: `Approve ${list.length} plan${list.length === 1 ? '' : 's'}` })) return;
      await post({ action: 'approve', leader: p.leader, names: list.map(x => x.name), confirm: true }, `${list.length} plan(s) APPROVED in party ${p.leader}.`); return;
    }
    if (act === 'unapprove' && m) { if (!await uiConfirm({ title: `Unapprove ${m.name}'s class plan?`, body: `The plan is kept, but ${m.name} will NOT change class until you approve it again.`, confirmText: 'Unapprove' })) return; await post({ action: 'unapprove', leader: p.leader, names: [m.name] }, `${m.name}: plan unapproved (no class change).`); return; }
    if (act === 'clear' && m) { if (!await uiConfirm({ title: `Remove ${m.name}'s class plan?`, body: `Without a plan ${m.name} never changes class.`, confirmText: 'Remove plan', danger: true })) return; await post({ action: 'clear', leader: p.leader, names: [m.name] }, `${m.name}: plan removed.`); return; }
    if (act === 'copy' && m) {
      const pre = await api('/api/classplans', { method: 'POST', body: JSON.stringify({ action: 'copyClass', leader: p.leader, from: m.name, scope: 'all', dryRun: true }) });
      if (!pre || pre.error) { flash((pre && pre.error) || 'failed', true); return; }
      if (!pre.targets.length) { flash(`nobody else is ${m.cls} now`); return; }
      const scopeAll = pre.targets.some(x => x.leader !== p.leader);
      const appr = m.approved && await uiConfirm({ title: `Copy ${m.name}'s plan`, body: [uiP(`Copy ${m.name}'s plan `, uiPath(m.plan.map(clsName)), ` to every character who is ${m.cls} now:`), uiList(pre.targets.map(x => [uiEm(x.name), ` (party ${x.leader})`])),
        uiP(uiEm('Copy and approve'), ' = each changes class on the Community Board when it reaches the level.'), uiWarn('A class change cannot be undone.'), uiNote('Not now = choose "copy without approval" next.')],
        confirmText: 'Copy and approve', cancelText: 'Not now' });
      if (!appr && !await uiConfirm({ title: 'Copy WITHOUT approval?', body: `Copy the plan WITHOUT approval to ${pre.targets.length} character(s)${scopeAll ? ' (all parties)' : ''}? Nobody changes class until you approve each plan.`, confirmText: 'Copy without approval' })) return;
      await post({ action: 'copyClass', leader: p.leader, from: m.name, scope: 'all', approve: !!appr, confirm: !!appr }, `plan copied to ${pre.targets.map(x => x.name).join(', ')}${appr ? ' and APPROVED' : ' (not approved)'}.`); return;
    }
    if (act === 'saveTpl' && p) {
      const nm = await uiPrompt({ title: 'Save as group template', body: `From party ${p.leader}'s plans.`, label: 'Name of the new group template', value: `Party ${p.leader} plan`, confirmText: 'Save template',
        validate: (v) => (v.trim() ? (v.trim().length > 60 ? 'At most 60 characters' : '') : 'Give it a name') }); if (!nm) return;
      await post({ action: 'saveTemplate', leader: p.leader, templateName: nm, desc: `${p.members.length} members` }, `template "${nm}" saved.`); return;
    }
    if (act === 'applyTpl') { const sel = $id('cpTplSel'); if (sel && sel.value) previewTemplate(sel.value); return; }
    if (act === 'applyTplId') { previewTemplate(t.dataset.cpt); return; }
    if (act === 'delTpl') { if (!await uiConfirm({ title: 'Delete this template?', body: 'Plans already applied to parties stay.', confirmText: 'Delete template', danger: true })) return; await post({ action: 'deleteTemplate', id: t.dataset.cpt }, 'template deleted.'); return; }
    if (act === 'tplGo' && CP.tpl) {
      const T = CP.tpl, only = [...$id('cpPanel').querySelectorAll('input[data-cptm]')].filter(x => x.checked).map(x => x.dataset.cptm);
      if (!only.length) { flash('nobody ticked', true); return; }
      const approve = !!($id('cpTplAppr') && $id('cpTplAppr').checked);
      const rows = T.r.match.assign.filter(x => only.includes(x.name));
      if (!await uiConfirm({ title: 'Apply template', body: [uiP('Apply ', uiEm(`"${T.r.template.name}"`), ` to party ${T.leader}?`),
        uiList(rows.map(x => [uiEm(x.name), ': ', uiPath(x.plan.map(clsName)), x.replaces ? '  (replaces ' + x.replaces.map(clsName).join(' › ') + ')' : ''])),
        approve ? uiP('These plans will be ', uiEm('APPROVED'), ': each character changes class on the Community Board when it reaches the level.') : 'Saved as NOT approved: nobody changes class until you approve the plans.',
        approve ? uiWarn('A class change cannot be undone.') : ''],
        confirmText: approve ? 'Apply and approve' : 'Apply template' })) return;
      const r = await post({ action: 'applyTemplate', leader: T.leader, id: T.id, only, approve, confirm: approve }, `template applied to ${only.length} member(s)${approve ? ' and APPROVED' : ' (not approved)'}.`);
      if (r) closeSheet();
    }
  }
  function onChange(e) { if (e.target && e.target.id === 'cpTplAppr' && CP.tpl) CP.tpl.approve = e.target.checked; }
  $sheetClick();
  function $sheetClick() { document.addEventListener('click', (e) => { const sh = $id('cpSheet'); if (sh && !sh.hidden && e.target === sh) closeSheet(); }); }

  // badges on the other pages: keep the data fresh while the dashboard is visible
  setInterval(() => { if (!document.hidden && !CP.open) load(true); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
  load(true);
  window.ClassPlans = { memberBadge, partyBadge, topBanner, charBadge, load, _cp: CP };
  window.ClassPage = { route, open, close, _cp: CP };
})();
