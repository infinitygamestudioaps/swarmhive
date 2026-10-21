// PARTY PLAN builder (owner 2026-10-13: "It would be cool if you could make a plan for a character and choose e.g. quests along the way you
// make. It must be a lovely way to do it."). Rules: manual-config-first (a plan runs only when the party is STARTED and the plan is switched
// on), ui-for-non-technical (plain sentences, details only in the Advanced view), no-browser-alerts (uidialog.js only), class plans need the
// user's approval (the class step only changes characters with an approved plan — it links to the Classes page).
//
// "📋 Plan" on every party card (and "Plan" in ⚙ Settings) opens ONE sheet per party: a vertical timeline of steps (level up / quest /
// class change / town / supplies / gear / raid boss / wait for my order). Each step is one plain sentence with its warnings; steps move by
// drag and drop on a desktop and with ▲ ▼ on a phone. "✨ Suggest a plan" builds levels → 40 from the party's own hunting places and the
// best quests for its races / classes (Dashboard/planlogic.js suggestPlan); templates save a plan by name and put it on several parties.
// The party card shows a fixed-height line "📋 Plan step 3/9: …" (STATE.plans from /api/state). Data: /api/partyplans (Dashboard/
// partyplan_api.js -> Scripts/data/party_plans.json, rev check), /api/partyplans/options, /api/quests (rows with rewards / requirements).
// Exposes window.PartyPlan = { button(leader), partyLine(leader), open(leader), close(), _state }.
(function () {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const call = (u, o) => (typeof api === 'function' ? api(u, o) : fetch(u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o || {})).then(r => r.json()));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const J = (o) => JSON.stringify(o);
  const PL = () => window.PlanLogic;
  const fine = () => { try { return matchMedia('(pointer: fine)').matches; } catch (e) { return false; } };
  const PP = { open: false, leader: '', D: null, party: null, W: null, W0: null, rev: null, view: 'list', edit: null, busy: false, gen: 0, opener: null, dragFrom: -1, q: '', qFit: true, qType: 'all', spotQ: '', raidQ: '', applyTo: [], applyOn: false };
  const CACHE = { quests: null, qmap: null, opts: null, raids: null, qAt: 0 };

  // ---------------------------------------------------------------------------------------------- data
  function loadPlainLogic() {
    if (window.PlanLogic) return Promise.resolve();
    return new Promise((res) => { const s = document.createElement('script'); s.src = '/planlogic.js'; s.onload = res; s.onerror = res; document.head.appendChild(s); });
  }
  async function loadQuests() {
    if (CACHE.quests && Date.now() - CACHE.qAt < 600000) return;
    try { const r = await call('/api/quests'); if (r && Array.isArray(r.rows)) { CACHE.quests = r.rows; CACHE.qmap = {}; r.rows.forEach(x => { CACHE.qmap[x.id] = x; }); CACHE.qAt = Date.now(); } } catch (e) { }
  }
  async function loadOpts() {
    if (CACHE.opts) return;
    try { const r = await call('/api/partyplans/options'); if (r && r.ok) { CACHE.opts = r; CACHE.raids = {}; (r.raids || []).forEach(b => { CACHE.raids[b.id] = b; }); } } catch (e) { }
  }
  async function loadInfo() {
    const r = await call('/api/partyplans');
    if (!r || r.error) throw new Error((r && r.error) || 'no answer from the dashboard server');
    PP.D = r; PP.rev = r.rev;
    PP.party = (r.parties || []).find(p => p.leader === PP.leader) || { leader: PP.leader, members: [{ name: PP.leader, level: 0 }], plan: null, progress: null };
    return r;
  }
  const members = () => (PP.party && PP.party.members) || [];
  const startLevel = () => { const L = members().map(m => Number(m.level) || 0).filter(Boolean); return L.length ? Math.min(...L) : 1; };
  const ctxS = () => ({ quests: CACHE.qmap || {}, members: members().map(m => m.name) });
  const ctxC = () => ({ quests: CACHE.qmap || {}, raids: CACHE.raids || {}, members: members(), startLevel: startLevel() });
  const dirty = () => !!PP.W && J(PP.W) !== J(PP.W0);

  // ---------------------------------------------------------------------------------------------- party card
  function data() { try { if (typeof STATE !== 'undefined' && STATE && STATE.plans) return STATE.plans; } catch (e) { } return null; }
  function button(leader) {
    const p = (data() || {})[leader];
    return `<button type="button" class="ppbtn${p ? ' has' : ''}" data-ppopen="${E(leader)}" title="${p ? 'The plan of party ' + E(leader) + ': ' + E(p.n) + ' steps' : 'Make a plan for party ' + E(leader) + ': leveling places, quests, class changes … in your order'}">📋 Plan</button>`;
  }
  function partyLine(leader) {
    const p = (data() || {})[leader];
    if (!p || !p.line) return '';
    return `<div class="ppline k-${E(p.line.kind)}" role="button" tabindex="0" data-ppopen="${E(leader)}" title="${E(p.line.text)} — tap to open the plan">${E(p.line.text)}</div>`;
  }

  // ---------------------------------------------------------------------------------------------- frame
  function frame() {
    let ov = document.getElementById('ppOv'); if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'ppOv'; ov.className = 'pp-ov'; ov.hidden = true;
    ov.innerHTML = `<div class="pp-dlg" role="dialog" aria-modal="true" aria-labelledby="ppTitle">
      <div class="pp-head"><button type="button" class="pp-back" data-ppact="back" aria-label="Back" hidden>←</button><h2 id="ppTitle">Plan</h2><button type="button" class="pp-x" data-ppact="close" aria-label="Close">✕</button></div>
      <div class="pp-scroll" id="ppScroll"><div id="ppBody"></div></div>
      <div class="pp-bar" id="ppBar"></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', onClick);
    ov.addEventListener('input', onInput);
    ov.addEventListener('change', onChange);
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); if (PP.view !== 'list') { PP.view = 'list'; PP.edit = null; render(); } else close(); } });
    ov.addEventListener('dragstart', (e) => { const li = e.target.closest && e.target.closest('li[data-ppidx]'); if (!li) return; PP.dragFrom = +li.dataset.ppidx; li.classList.add('drag'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(PP.dragFrom)); } catch (x) { } });
    ov.addEventListener('dragend', (e) => { const li = e.target.closest && e.target.closest('li[data-ppidx]'); if (li) li.classList.remove('drag'); document.querySelectorAll('#ppBody .dropb,#ppBody .dropa').forEach(x => x.classList.remove('dropb', 'dropa')); });
    ov.addEventListener('dragover', (e) => { const li = e.target.closest && e.target.closest('li[data-ppidx]'); if (!li || PP.dragFrom < 0) return; e.preventDefault(); const r = li.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2; document.querySelectorAll('#ppBody .dropb,#ppBody .dropa').forEach(x => x.classList.remove('dropb', 'dropa')); li.classList.add(after ? 'dropa' : 'dropb'); });
    ov.addEventListener('drop', (e) => { const li = e.target.closest && e.target.closest('li[data-ppidx]'); if (!li || PP.dragFrom < 0) return; e.preventDefault(); const r = li.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2; let to = +li.dataset.ppidx + (after ? 1 : 0); const from = PP.dragFrom; PP.dragFrom = -1; if (to > from) to--; moveStep(from, to); });
    return ov;
  }

  // ---------------------------------------------------------------------------------------------- render: list (the timeline)
  function memberChips() {
    return members().map(m => `<span class="pp-mem${m.online ? ' on' : ''}" title="${E(m.name)} — ${E(m.cls || '')}${m.cp && m.cp.text ? ' · class plan: ' + E(m.cp.text) : ''}"><b>${E(m.name)}</b> <small>${m.level ? 'lvl ' + E(m.level) : ''}${m.cls ? ' · ' + E(m.cls) : ''}</small></span>`).join('');
  }
  function progressBox() {
    const p = PP.party, plan = p && p.plan;
    if (!plan || !plan.steps || !plan.steps.length) return `<div class="pp-prog k-none">Not saved yet — nothing runs until you save the plan, switch it on and press <b>Start</b> on the party card.</div>`;
    const line = PL().progressLine(plan, p.progress, ctxS(), p.runOn) || { kind: 'ready', text: '' };
    const st = (p.progress && p.progress.status) || 'idle', idx = PL().planCursor(plan, p.progress), n = plan.steps.length;
    const B = (lab, cmd, kind, n2) => `<button type="button" class="uk-btn ${kind || 'secondary'}" data-ppctl="${cmd}"${n2 ? ` data-n="${n2}"` : ''}>${E(lab)}</button>`;
    let btns = '';
    if (idx >= n || st === 'done') btns = B('↺ Start again from step 1', 'restart');
    else if (st === 'running' && p.runOn) btns = B('⏸ Pause the plan', 'stop') + B('⏭ Skip this step', 'next');
    else if (st === 'waiting') btns = B('▶ Continue', 'next', 'primary');
    else if (st === 'blocked') btns = B('↻ Try again', 'start', 'primary') + B('⏭ Skip this step', 'next');
    else if (st === 'paused') btns = B('▶ Go on', 'start', 'primary') + B('⏭ Skip this step', 'next');
    const note = !p.runOn && plan.on && st !== 'done' && st !== 'waiting' ? `<div class="pp-pn">The party is stopped: press <b>▶ Start</b> on the party card and it begins with step ${Math.min(idx + 1, n)}.</div>` : '';
    return `<div class="pp-prog k-${E(line.kind)}" role="status"><div class="pp-pt">${E(line.text)}</div>${note}${btns ? `<div class="pp-pb">${btns}</div>` : ''}</div>`;
  }
  function stepCard(s, i, chk, cur, doneMap) {
    const info = PL().INFO[s.kind] || {}, c = chk.steps[i] || { warns: [], errors: [] };
    // TESTERFIX-2026-10-19 (l3tal: "it is checked on the plan but on the quests tab it says failed"): a skipped / failed step shows ✗ + why, never ✓
    const dd = doneMap[s.id], bad = !!(dd && (dd.failed || dd.skipped || /^skipped/i.test(String(dd.result || ''))));
    const done = !!dd, isCur = i === cur && !!(PP.party && PP.party.plan && J(PP.party.plan.steps.map(x => x.id)) === J(PP.W.steps.map(x => x.id)));
    const lv = s.kind === 'level' ? '' : `<span class="pp-lv">party ≈ level ${E(c.levelAt)} here</span>`;
    const warn = c.errors.map(w => `<span class="pp-w bad">⛔ ${E(w)}</span>`).join('') + c.warns.map(w => `<span class="pp-w">⚠ ${E(w)}</span>`).join('');
    const adv = window.UIKit && UIKit.isAdv() ? `<span class="pp-adv">${E(s.id)}${s.kind === 'quest' ? ' · quest ' + E(s.quest) : s.kind === 'raid' ? ' · npc ' + E(s.boss) : ''}</span>` : '';
    const n = PP.W.steps.length;
    return `<li class="pp-step k-${E(s.kind)}${isCur ? ' cur' : ''}${done ? (bad ? ' skipped' : ' done') : ''}" data-ppidx="${i}"${fine() ? ' draggable="true"' : ''}>
      <div class="pp-num" aria-hidden="true">${bad ? '✗' : done ? '✓' : isCur ? '▶' : i + 1}</div>
      <div class="pp-card"><button type="button" class="pp-main" data-ppedit="${i}" aria-label="Step ${i + 1}: ${E(PL().stepText(s, ctxS()))} — edit">
        <span class="pp-ic" aria-hidden="true">${info.icon || '•'}</span><span class="pp-txt"><b>${E(PL().stepText(s, ctxS()))}</b>${lv}${warn}${bad ? `<span class="pp-w bad">✗ ${E(String(dd.result || 'skipped'))}</span>` : ''}${s.note && s.kind !== 'wait' ? `<span class="pp-lv">📝 ${E(s.note)}</span>` : ''}${adv}</span></button>
        <div class="pp-ctl">${fine() ? '<span class="pp-grip" title="Drag to move" aria-hidden="true">⠿</span>' : ''}<button type="button" data-ppmove="${i}" data-d="-1" aria-label="Move up"${i ? '' : ' disabled'}>▲</button><button type="button" data-ppmove="${i}" data-d="1" aria-label="Move down"${i < n - 1 ? '' : ' disabled'}>▼</button><button type="button" data-ppdel="${i}" aria-label="Delete step ${i + 1}">🗑</button></div></div>
      </li>`;
  }
  function renderList() {
    const W = PP.W, chk = PL().checkPlan(W, ctxC()), prog = PP.party && PP.party.progress, cur = PL().planCursor(W, prog || {}), doneMap = (prog && prog.done) || {};
    const sw = window.UIKit ? UIKit.switchHtml({ on: W.on, label: 'Use this plan when I press Start', onText: 'On — Start on the party card runs this plan', offText: 'Off — Start does the party’s normal activity', attrs: { 'data-ppact': 'toggleOn' } }) : '';
    const steps = W.steps.length ? `<ol class="pp-tl">${W.steps.map((s, i) => stepCard(s, i, chk, cur, doneMap)).join('')}</ol>` :
      (window.UIKit ? UIKit.empty({ icon: '🗺️', text: 'No steps yet. Add your first step, or let “✨ Suggest a plan” build one from the party’s levels, races and classes.', action: { label: '+ Add a step', attrs: { 'data-ppact': 'add' } } }) : '');
    const end = W.steps.length ? `<div class="pp-end">${W.steps[W.steps.length - 1].kind === 'wait' ? 'Then the party waits for you.' : `After the last step the party stops and waits (about level ${E(chk.endLevel)}).`}</div>` : '';
    document.getElementById('ppBody').innerHTML = `
      <div class="pp-intro"><div class="pp-mems">${memberChips()}</div>
        <label class="pp-field"><span class="pp-lab">Plan name</span><input data-ppin="name" maxlength="60" value="${E(W.name)}" placeholder="e.g. Level 1 → 40 with quests"></label>
        <div class="pp-sw">${sw}</div>${progressBox()}</div>
      <div class="pp-tools"><button type="button" class="uk-btn secondary" data-ppact="suggest">✨ Suggest a plan</button><button type="button" class="uk-btn secondary" data-ppact="templates">📂 Templates</button><button type="button" class="uk-btn secondary" data-ppact="apply"${W.steps.length ? '' : ' disabled'}>⇉ Other parties</button></div>
      ${steps}${W.steps.length ? `<button type="button" class="pp-add" data-ppact="add">＋ Add a step</button>` : ''}${end}
      ${window.UIKit ? UIKit.details(`File: Scripts/data/party_plans.json (rev ${PP.rev || '—'}) · progress: Logs/plan_progress_${PP.leader}.json\n` + J(W), { summary: 'Details (file, raw plan)' }) : ''}`;
  }

  // ---------------------------------------------------------------------------------------------- render: step editor
  function seg(path, val, opts) { return `<div class="pp-seg" role="group">${opts.map(([v, l]) => `<button type="button" data-ppseg="${E(path)}" data-v="${E(v)}" aria-pressed="${String(v) === String(val)}">${E(l)}</button>`).join('')}</div>`; }
  function whoBoxes(s, filter) {
    const sel = new Set(s.who || []);
    return `<div class="pp-who">${members().map(m => { const f = filter ? filter(m) : null; return `<label class="pp-chk${f && f.no ? ' no' : ''}"><input type="checkbox" data-ppwho="${E(m.name)}"${sel.has(m.name) ? ' checked' : ''}><span><b>${E(m.name)}</b> <small>${m.level ? 'lvl ' + E(m.level) : ''}${f && f.text ? ' · ' + E(f.text) : ''}</small></span></label>`; }).join('')}</div>`;
  }
  function spotList(s) {
    const o = CACHE.opts; if (!o) return '<div class="pp-hint">Loading the hunting places…</div>';
    const at = Number(s.to) || startLevel(), q = PP.spotQ.trim().toLowerCase();
    const rows = [];
    (o.zones || []).filter(z => z.enabled && ((z.teams || ['all']).includes('all') || (z.teams || []).includes(PP.leader))).forEach(z => rows.push({ kind: 'zone', label: 'Route place', name: z.name, lmin: z.levelMin, lmax: z.levelMax, via: z.via, own: (z.teams || []).includes(PP.leader), spot: { mode: 'manual', kind: 'zone', spot: z.name, levelMin: z.levelMin, levelMax: z.levelMax } }));
    (o.regions || []).forEach(R => rows.push({ kind: 'field', label: 'Hunting ground', name: R.name, lmin: R.levelRange && R.levelRange[0], lmax: R.levelRange && R.levelRange[1], via: R.landing, spot: { mode: 'manual', kind: 'field', spot: R.name, region: R.id, areaIds: R.areaIds, order: 'nearest', levelMin: R.levelRange && R.levelRange[0], levelMax: R.levelRange && R.levelRange[1] } }));
    (o.dungeons || []).forEach(d => rows.push({ kind: 'rooms', label: window.openSpotPickerFor ? 'Dungeon · tap to choose rooms on the map' : 'Dungeon (any free room)', dungeon: d.name, name: d.name, lmin: d.levelRange && d.levelRange[0], lmax: d.levelRange && d.levelRange[1], spot: { mode: 'manual', kind: 'rooms', spot: d.name, dungeon: d.name, roomId: 'any', levelMin: d.levelRange && d.levelRange[0], levelMax: d.levelRange && d.levelRange[1] } }));
    (o.datapack || []).filter(d => !/^Area @/.test(d.name)).forEach(d => rows.push({ kind: 'datapack', label: 'Place', name: d.name, lmin: d.levelMin, lmax: d.levelMax, via: d.via, spot: { mode: 'manual', kind: 'datapack', spot: d.name, levelMin: d.levelMin, levelMax: d.levelMax } }));
    const fits = (r) => r.lmin == null || (r.lmin <= at && (r.lmax == null || r.lmax >= at - 6));
    const list = rows.filter(r => q ? (r.name + ' ' + (r.via || '')).toLowerCase().includes(q) : fits(r))
      .sort((a, b) => (b.own ? 1 : 0) - (a.own ? 1 : 0) || Math.abs(((a.lmin || 0) + (a.lmax || 0)) / 2 - at) - Math.abs(((b.lmin || 0) + (b.lmax || 0)) / 2 - at)).slice(0, 40);
    { const seen = {}; for (let i = list.length - 1; i >= 0; i--) { const k = list[i].kind + '|' + list[i].name + '|' + list[i].lmin + '|' + list[i].lmax; if (seen[k]) list.splice(i, 1); else seen[k] = 1; } }   // PLANPICK: no duplicate rows
    PP.spotRows = list;
    const cur = s.spot || {};
    return `<div class="pp-list" role="listbox" aria-label="Hunting places">${list.map((r, i) => {
      const on = cur.mode === 'manual' && cur.kind === r.spot.kind && cur.spot === r.spot.spot;
      return `<button type="button" role="option" aria-selected="${on}" class="pp-opt${on ? ' sel' : ''}" data-ppspot="${i}"><b>${E(r.name)}</b><span>${E(r.label)}${r.lmin != null ? ` · levels ${E(r.lmin)}–${E(r.lmax)}` : ''}${r.own ? ' · your route' : ''}${r.via ? ` · ${E(r.via)}` : ''}</span></button>`;
    }).join('') || '<div class="pp-hint">No place fits — type a name to search all.</div>'}</div>`;
  }
  function questList(s) {
    if (!CACHE.quests) return '<div class="pp-hint">Loading the quests…</div>';
    const ck = PL().checkPlan({ steps: PP.W.steps.slice(0, PP.edit.idx < 0 ? PP.W.steps.length : PP.edit.idx) }, ctxC());
    const at = ck.endLevel, q = PP.q.trim().toLowerCase(), M = members();
    let list = CACHE.quests.filter(r => r.type !== 'unknown');
    if (PP.qType !== 'all') list = list.filter(r => PP.qType === 'repeat' ? (r.type === 'repeatable' || r.type === 'daily') : r.type === 'one-time');
    if (q) list = list.filter(r => (r.name + ' ' + r.town + ' ' + r.npc + ' ' + r.id).toLowerCase().includes(q));
    if (PP.qFit) list = list.filter(r => (r.lmin == null || (r.lmin <= at + 5 && r.lmin >= at - 12)) && (r.lmax == null || r.lmax >= at) && M.some(m => PL().questEligible(r, m, Math.max(at, m.level || 0)).ok !== 'no'));
    list = list.slice().sort((a, b) => (s.quest === b.id) - (s.quest === a.id) || ((b.adenaV || 0) + (b.exp || 0) / 15) - ((a.adenaV || 0) + (a.exp || 0) / 15)).slice(0, 60);
    const T = { 'one-time': 'one-time', repeatable: 'repeatable', daily: 'daily' };
    return `<div class="pp-hint">The party is about level ${E(at)} at this step.</div><div class="pp-list" role="listbox" aria-label="Quests">${list.map(r => {
      const el = M.map(m => ({ m, e: PL().questEligible(r, m, Math.max(at, m.level || 0)) }));
      const rew = PL().rewardText(r), on = s.quest === r.id;
      return `<button type="button" role="option" aria-selected="${on}" class="pp-opt q${on ? ' sel' : ''}" data-ppquest="${E(r.id)}">
        <b>${E(r.name)}</b><span>${r.lmin != null ? `level ${E(r.lmin)}${r.lmax ? '–' + E(r.lmax) : '+'}` : ''}${r.town ? ` · ${E(r.town)}` : ''}${r.npc ? ` · ${E(r.npc)}` : ''} <i class="pp-ty t-${E(r.type)}">${E(T[r.type] || r.type)}</i>${r.parse && r.parse !== 'full' ? ' <i class="pp-ty t-warn">' + (r.parse === 'manual' ? 'needs you' : 'partly known') + '</i>' : ''}</span>
        ${rew ? `<span class="pp-rew">🎁 ${E(rew)}</span>` : ''}
        <span class="pp-el">${el.map(x => `<i class="${x.e.ok === 'no' ? 'no' : x.e.ok === 'maybe' ? 'mb' : 'ok'}" title="${E(x.m.name + ': ' + (x.e.why || 'can take it'))}">${x.e.ok === 'no' ? '✗' : x.e.ok === 'maybe' ? '?' : '✓'} ${E(x.m.name)}</i>`).join('')}</span></button>`;
    }).join('') || '<div class="pp-hint">No quest fits — switch off “Only quests that fit”, or search a name.</div>'}</div>`;
  }
  function raidList(s) {
    const o = CACHE.opts; if (!o) return '<div class="pp-hint">Loading the raid bosses…</div>';
    const ck = PL().checkPlan({ steps: PP.W.steps.slice(0, PP.edit.idx < 0 ? PP.W.steps.length : PP.edit.idx) }, ctxC()), at = ck.endLevel, q = PP.raidQ.trim().toLowerCase();
    const list = (o.raids || []).filter(b => q ? b.name.toLowerCase().includes(q) : (b.level || 0) >= at - 8 && (b.level || 0) <= at + 4).slice(0, 40);
    return `<div class="pp-hint">The party is about level ${E(at)} here (a boss more than 8 levels below the party curses it).</div><div class="pp-list" role="listbox" aria-label="Raid bosses">${list.map(b => `<button type="button" role="option" aria-selected="${s.boss === b.id}" class="pp-opt${s.boss === b.id ? ' sel' : ''}" data-ppraid="${E(b.id)}"><b>${E(b.name)}</b><span>level ${E(b.level)}${b.where ? ' · ' + E(b.where) : ''}</span></button>`).join('') || '<div class="pp-hint">No boss near this level — search a name.</div>'}</div>`;
  }
  function editorBody() {
    const ed = PP.edit, s = ed.step;
    if (!s.kind) {
      return `<div class="pp-hint">What should the party do ${ed.idx < 0 ? 'next' : 'here'}?</div><div class="pp-kinds">${PL().KINDS.map(k => { const I = PL().INFO[k]; return `<button type="button" class="pp-kind" data-ppkind="${k}"><span class="pp-ki" aria-hidden="true">${I.icon}</span><b>${E(I.label)}</b><span>${E(I.hint)}</span></button>`; }).join('')}</div>`;
    }
    const head = `<div class="pp-sent" role="status"><span aria-hidden="true">${PL().INFO[s.kind].icon}</span> ${E(PL().stepText(s, ctxS()))}</div>`;
    let body = '';
    if (s.kind === 'level') {
      const sp = s.spot || { mode: 'party' };
      body = `<label class="pp-field"><span class="pp-lab">Until level</span><input type="number" inputmode="numeric" min="2" max="85" data-ppf="to" value="${E(s.to || '')}"></label>
        <div class="pp-chips">${[10, 20, 30, 40, 52, 61, 76].map(l => `<button type="button" class="pp-chip" data-ppto="${l}">${l}</button>`).join('')}</div>
        <div class="pp-lab">Where to hunt</div>${seg('spot.mode', sp.mode, [['party', "Party's own place"], ['auto', 'Leader picks'], ['manual', 'Choose a place']])}
        <div class="pp-hint">${sp.mode === 'party' ? 'The hunting place you set on the party card (Parties tab) — or the leader’s pick when none is set.' : sp.mode === 'auto' ? 'The leader picks a place that fits the party’s level, and moves on as it levels.' : 'Tap a place below. Type to search every place.'}</div>
        ${sp.mode === 'manual' && window.openSpotPickerFor ? `<button type="button" class="pp-chip" data-ppmap="1" style="width:100%;margin:6px 0">🗺 Pick rooms or areas on the map${sp.kind ? ' — now: ' + E(PL().stepText({ kind: 'level', to: s.to, spot: sp }, ctxS())) : ''}</button>` : ''}
        ${sp.mode === 'manual' ? `<input class="pp-search" type="search" data-ppq="spot" placeholder="Search a place…" value="${E(PP.spotQ)}">${spotList(s)}` : ''}`;
    } else if (s.kind === 'quest') {
      const row = (CACHE.qmap || {})[s.quest];
      const rep = row && (row.type === 'repeatable' || row.type === 'daily');
      body = `<input class="pp-search" type="search" data-ppq="quest" placeholder="Search a quest, town or NPC…" value="${E(PP.q)}">
        <div class="pp-row"><label class="pp-chk"><input type="checkbox" data-ppqfit${PP.qFit ? ' checked' : ''}><span>Only quests that fit (level, race, class)</span></label>${seg('_qtype', PP.qType, [['all', 'All'], ['one', 'One-time'], ['repeat', 'Repeatable']])}</div>
        ${s.quest ? `<div class="pp-lab">Who does it</div>${seg('mode', s.mode || 'party', [['party', 'Whole party together'], ['solo', 'Each alone']])}
          ${s.mode === 'solo' ? `<div class="pp-hint">Tick who does it alone (nobody ticked = every member). The others wait.</div>${whoBoxes(s, (m) => { if (!row) return null; const e = PL().questEligible(row, m, m.level); return { no: e.ok === 'no', text: e.ok === 'no' ? e.why : '' }; })}` : '<div class="pp-hint">The leader talks to the NPCs and hunts; the members follow, help and talk to the same NPCs.</div>'}
          ${rep ? `<label class="pp-field"><span class="pp-lab">How many times</span><input type="number" inputmode="numeric" min="1" max="99" data-ppf="repeat" value="${E(s.repeat || 1)}"></label>` : ''}
          <div class="pp-lab">If it does not work</div>${seg('onFail', s.onFail || 'stop', [['stop', 'Stop and wait for me'], ['skip', 'Skip it and go on']])}` : ''}
        <div class="pp-lab">${s.quest ? 'Another quest?' : 'Pick a quest'}</div>${questList(s)}`;
    } else if (s.kind === 'class') {
      body = `<div class="pp-hint">Changes class on the Community Board — <b>only</b> the next step of an <b>approved</b> class plan. A character without one is never changed.</div>
        <div class="pp-cps">${members().map(m => { const c = m.cp || {}; const ok = ['ready', 'waiting', 'done'].includes(c.status); return `<div class="pp-cp ${ok ? 'ok' : 'warn'}"><b>${E(m.name)}</b> <span>${ok ? (c.nextName ? `→ ${E(c.nextName)} at level ${E(c.needLevel)}` : 'its plan is finished') : c.status === 'needs-approval' ? 'class plan not approved yet' : c.status ? 'no approved class plan — never changed' : 'class plan unknown'}</span></div>`; }).join('')}</div>
        <button type="button" class="uk-btn secondary" data-ppgo="#/classes">⭐ Open the Classes page (make / approve class plans)</button>
        <div class="pp-lab">Only these characters (nobody ticked = everyone)</div>${whoBoxes(s)}`;
    } else if (s.kind === 'town') {
      body = `<div class="pp-towns">${PL().TOWNS.map(t => `<button type="button" class="pp-town${s.town === t ? ' sel' : ''}" data-pptown="${E(t)}" aria-pressed="${s.town === t}">${E(t)}</button>`).join('')}</div><div class="pp-hint">The whole party travels there together (.${E(String(s.town || 'Giran').toLowerCase())}) and the plan goes on when everyone stands in the town.</div>`;
    } else if (s.kind === 'supply') {
      body = `<div class="pp-hint">The party goes to Giran, every member says what it lacks (Scrolls of Escape and Resurrection, shots for its weapon, potions), the leader buys it all and hands it out. The same as <b>Supply</b> on the party card.</div>`;
    } else if (s.kind === 'gear') {
      body = `<div class="pp-hint">The party goes to Giran and everyone buys the better gear its level and class can use (your Gear page settings decide what). Afterwards the plan goes on.</div>`;
    } else if (s.kind === 'raid') {
      body = `<input class="pp-search" type="search" data-ppq="raid" placeholder="Search a raid boss…" value="${E(PP.raidQ)}">${raidList(s)}
        <div class="pp-lab">If the party falls or the boss cannot be reached</div>${seg('onFail', s.onFail || 'stop', [['stop', 'Stop and wait for me'], ['skip', 'Skip it and go on']])}`;
    } else if (s.kind === 'wait') {
      body = `<div class="pp-hint">The party stops here and waits. On the plan you then press <b>▶ Continue</b> to go on.</div><label class="pp-field"><span class="pp-lab">Note for yourself (optional)</span><input data-ppf="note" maxlength="200" value="${E(s.note || '')}" placeholder="e.g. check the gear before the next zone"></label>`;
    }
    const noteF = s.kind !== 'wait' ? `<details class="pp-more"><summary>Add a note</summary><label class="pp-field"><span class="pp-lab">Note (shown on the step)</span><input data-ppf="note" maxlength="200" value="${E(s.note || '')}"></label></details>` : '';
    return head + body + noteF;
  }

  // ---------------------------------------------------------------------------------------------- render: templates / other parties
  function renderTemplates() {
    const T = (PP.D && PP.D.templates) || [];
    document.getElementById('ppBody').innerHTML = `<div class="pp-hint">A template is a plan with a name. Use it for any party: steps for characters that are not in that party are left out.</div>
      <button type="button" class="uk-btn primary full" data-ppact="saveTpl"${PP.W.steps.length ? '' : ' disabled'}>💾 Save this plan as a template…</button>
      <div class="pp-tpls">${T.map(t => `<div class="pp-tpl"><b>${E(t.name)}</b><span>${E(t.steps.length)} steps${t.note ? ' · ' + E(t.note) : ''}</span><span class="pp-tps">${E(t.sentence || '')}</span>
        <div class="pp-tpb"><button type="button" class="uk-btn primary" data-pptpl="${E(t.id)}">Use for party ${E(PP.leader)}</button><button type="button" class="uk-btn ghost" data-pptpldel="${E(t.id)}">Delete</button></div></div>`).join('') || (window.UIKit ? UIKit.empty({ icon: '📂', text: 'No templates yet.' }) : '')}</div>`;
  }
  function renderApply() {
    const others = ((PP.D && PP.D.parties) || []).filter(p => p.leader !== PP.leader);
    document.getElementById('ppBody').innerHTML = `<div class="pp-hint">Give this plan (${E(PP.W.steps.length)} steps, as you see it now) to other parties. Steps for characters that are not in a party are left out there. A party that already has a plan gets this one instead.</div>
      <div class="pp-who">${others.map(p => `<label class="pp-chk"><input type="checkbox" data-ppapply="${E(p.leader)}"${PP.applyTo.includes(p.leader) ? ' checked' : ''}><span><b>Party ${E(p.leader)}</b> <small>${E(p.members.length)} · lvl ${E(Math.min(...p.members.map(m => m.level || 0)) || '?')}${p.plan ? ' · has a plan (' + E(p.plan.steps.length) + ' steps)' : ''}</small></span></label>`).join('') || '<div class="pp-hint">There is no other party.</div>'}</div>
      <div class="pp-sw">${window.UIKit ? UIKit.switchHtml({ on: PP.applyOn, label: 'Use it when they are started', onText: 'On — their Start runs this plan', offText: 'Off — saved for them, not used yet', attrs: { 'data-ppact': 'applyOn' } }) : ''}</div>`;
  }

  // ---------------------------------------------------------------------------------------------- render: bar + all
  function renderBar() {
    const el = document.getElementById('ppBar'); if (!el) return;
    if (PP.view === 'edit') {
      const s = PP.edit && PP.edit.step, ok = s && s.kind && PL().normStep(Object.assign({ id: 'tmp1' }, s));
      el.innerHTML = s && s.kind ? `<div class="pp-bsum">${ok ? 'Step ready' : `<span class="bad">${s.kind === 'quest' ? 'Pick a quest' : s.kind === 'raid' ? 'Pick a raid boss' : s.kind === 'level' ? 'Enter a level from 2 to 85' : 'Not complete'}</span>`}</div><div class="pp-bbtn"><button type="button" class="uk-btn secondary" data-ppact="back">Cancel</button><button type="button" class="uk-btn primary" data-ppact="useStep"${ok ? '' : ' disabled'}>${PP.edit.idx < 0 ? 'Add this step' : 'Save this step'}</button></div>` :
        `<div class="pp-bsum">Choose what the party should do</div><div class="pp-bbtn"><button type="button" class="uk-btn secondary" data-ppact="back">Cancel</button></div>`;
      return;
    }
    if (PP.view === 'apply') { el.innerHTML = `<div class="pp-bsum">${PP.applyTo.length ? `${PP.applyTo.length} part${PP.applyTo.length === 1 ? 'y' : 'ies'} chosen` : 'Tick the parties'}</div><div class="pp-bbtn"><button type="button" class="uk-btn secondary" data-ppact="back">Back</button><button type="button" class="uk-btn primary" data-ppact="doApply"${PP.applyTo.length && !PP.busy ? '' : ' disabled'}>Give them this plan</button></div>`; return; }
    if (PP.view === 'templates') { el.innerHTML = `<div class="pp-bsum">Templates</div><div class="pp-bbtn"><button type="button" class="uk-btn secondary" data-ppact="back">Back</button></div>`; return; }
    const d = dirty(), n = PP.W ? PP.W.steps.length : 0;
    const sum = !PP.W ? 'Loading…' : d ? `<b>Unsaved changes</b> <span class="pp-muted">(${n} step${n === 1 ? '' : 's'})</span>` : `All saved <span class="pp-muted">· ${n} step${n === 1 ? '' : 's'}</span>`;
    el.innerHTML = `<div class="pp-bsum" role="status">${sum}</div><div class="pp-bbtn"><button type="button" class="uk-btn secondary" data-ppact="undo"${d && !PP.busy ? '' : ' disabled'}>Undo</button><button type="button" class="uk-btn primary" data-ppact="save"${d && !PP.busy ? '' : ' disabled'}>${PP.busy ? 'Saving…' : 'Save'}</button></div>`;
  }
  function render(keepScroll) {
    frame();
    const sc = document.getElementById('ppScroll'), top = sc ? sc.scrollTop : 0;
    const t = document.getElementById('ppTitle'), back = document.querySelector('#ppOv .pp-back');
    back.hidden = PP.view === 'list';
    if (!PP.W) { t.textContent = `Plan — party ${PP.leader}`; document.getElementById('ppBody').innerHTML = '<div class="pp-skel">Loading the plan…</div>'; renderBar(); return; }
    if (PP.view === 'list') { t.textContent = `Plan — party ${PP.leader}`; renderList(); }
    else if (PP.view === 'edit') { t.textContent = PP.edit.step.kind ? `${PP.edit.idx < 0 ? 'New step' : 'Step ' + (PP.edit.idx + 1)}: ${PL().INFO[PP.edit.step.kind].label}` : 'Add a step'; document.getElementById('ppBody').innerHTML = editorBody(); }
    else if (PP.view === 'templates') { t.textContent = 'Plan templates'; renderTemplates(); }
    else if (PP.view === 'apply') { t.textContent = 'Give this plan to other parties'; renderApply(); }
    renderBar();
    if (keepScroll && sc) sc.scrollTop = top; else if (sc) sc.scrollTop = 0;
  }

  // ---------------------------------------------------------------------------------------------- edits
  function moveStep(from, to) {
    const S = PP.W.steps; if (from < 0 || from >= S.length || to < 0 || to >= S.length || from === to) return;
    const [x] = S.splice(from, 1); S.splice(to, 0, x); render(true);
    try { const li = document.querySelector(`#ppBody li[data-ppidx="${to}"]`); if (li) { li.classList.add('moved'); setTimeout(() => li.classList.remove('moved'), 700); } } catch (e) { }
  }
  function setPath(o, p, v) { const ks = p.split('.'); let c = o; ks.slice(0, -1).forEach(k => { c[k] = c[k] && typeof c[k] === 'object' ? c[k] : {}; c = c[k]; }); c[ks[ks.length - 1]] = v; }
  function openEditor(idx, kind) {
    const base = idx >= 0 ? clone(PP.W.steps[idx]) : { kind: kind || '' };
    if (!base.kind) { PP.edit = { idx, step: base }; PP.view = 'edit'; render(); return; }
    PP.edit = { idx, step: base }; PP.view = 'edit'; PP.q = ''; PP.spotQ = ''; PP.raidQ = ''; render();
  }
  function defaultsFor(kind) {
    const ck = PL().checkPlan({ steps: PP.W.steps.slice(0, PP.edit.idx < 0 ? PP.W.steps.length : PP.edit.idx) }, ctxC()), at = ck.endLevel;
    if (kind === 'level') return { kind, to: Math.min(85, [20, 40, 52, 61, 76, 85].find(l => l > at) || at + 5), spot: { mode: 'party' } };
    if (kind === 'quest') return { kind, quest: null, mode: 'party', repeat: 1, onFail: 'stop' };
    if (kind === 'town') return { kind, town: 'Giran' };
    if (kind === 'raid') return { kind, boss: null, onFail: 'stop' };
    return { kind };
  }

  // ---------------------------------------------------------------------------------------------- events
  function onInput(e) {
    const t = e.target; if (!t.dataset) return;
    if (t.dataset.ppin === 'name') { PP.W.name = t.value.slice(0, 60); renderBar(); return; }
    if (t.dataset.ppq) {
      if (t.dataset.ppq === 'quest') PP.q = t.value; else if (t.dataset.ppq === 'spot') PP.spotQ = t.value; else PP.raidQ = t.value;
      const pos = t.selectionStart; render(true); const n = document.querySelector(`#ppBody [data-ppq="${t.dataset.ppq}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { } }
      return;
    }
    if (t.dataset.ppf && PP.edit) {
      const f = t.dataset.ppf; let v = t.value;
      if (f === 'to' || f === 'repeat') v = v === '' ? '' : Number(v);
      PP.edit.step[f] = v;
      const s = document.querySelector('#ppBody .pp-sent'); if (s) s.innerHTML = `<span aria-hidden="true">${PL().INFO[PP.edit.step.kind].icon}</span> ${E(PL().stepText(PP.edit.step, ctxS()))}`;
      renderBar();
    }
  }
  function onChange(e) {
    const t = e.target; if (!t.dataset) return;
    if (t.dataset.ppqfit !== undefined) { PP.qFit = t.checked; render(true); return; }
    if (t.dataset.ppwho && PP.edit) { const s = PP.edit.step, L = new Set(s.who || []); if (t.checked) L.add(t.dataset.ppwho); else L.delete(t.dataset.ppwho); s.who = members().map(m => m.name).filter(n => L.has(n)); if (!s.who.length) delete s.who; render(true); return; }
    if (t.dataset.ppapply) { const L = new Set(PP.applyTo); if (t.checked) L.add(t.dataset.ppapply); else L.delete(t.dataset.ppapply); PP.applyTo = [...L]; renderBar(); return; }
  }
  async function onClick(e) {
    const t = e.target;
    if (t === document.getElementById('ppOv')) { close(); return; }
    const g = (sel) => t.closest(sel);
    let b;
    if ((b = g('[data-ppmove]'))) { e.preventDefault(); const i = +b.dataset.ppmove, d = +b.dataset.d; moveStep(i, i + d); try { const nb = document.querySelector(`#ppBody li[data-ppidx="${i + d}"] [data-ppmove][data-d="${d}"]`) || document.querySelector(`#ppBody li[data-ppidx="${i + d}"] [data-ppmove]`); if (nb && !nb.disabled) nb.focus(); } catch (x) { } return; }
    if ((b = g('[data-ppdel]'))) { e.preventDefault(); const i = +b.dataset.ppdel; const s = PP.W.steps[i]; if (await uiConfirm({ title: `Delete step ${i + 1}?`, body: [uiP(uiEm(PL().stepText(s, ctxS())))], confirmText: 'Delete', cancelText: 'Keep it' })) { PP.W.steps.splice(i, 1); render(true); } return; }
    if ((b = g('[data-ppedit]'))) { e.preventDefault(); openEditor(+b.dataset.ppedit); return; }
    if ((b = g('[data-ppkind]'))) { e.preventDefault(); PP.edit.step = defaultsFor(b.dataset.ppkind); render(); return; }
    if ((b = g('[data-ppseg]'))) {
      e.preventDefault(); const p = b.dataset.ppseg, v = b.dataset.v;
      if (p === '_qtype') { PP.qType = v; render(true); return; }
      setPath(PP.edit.step, p, v);
      if (p === 'spot.mode') PP.edit.step.spot = v === 'manual' ? Object.assign({ mode: 'manual' }, (PP.edit.step.spot && PP.edit.step.spot.kind) ? PP.edit.step.spot : {}) : { mode: v };
      if (p === 'mode' && v === 'party') delete PP.edit.step.who;
      render(true); return;
    }
    if ((b = g('[data-ppto]'))) { e.preventDefault(); PP.edit.step.to = +b.dataset.ppto; render(true); return; }
    if ((b = g('[data-ppspot]')) && window.openSpotPickerFor) { const r0 = (PP.spotRows || [])[+b.dataset.ppspot]; if (r0 && r0.kind === 'rooms') b = { dataset: { ppmap: '1', dun: r0.dungeon } }; else b = null; if (b) { e.preventDefault(); } }
    if (b && b.dataset && b.dataset.ppmap || (b = g('[data-ppmap]'))) { e.preventDefault(); const ed = PP.edit, dun = (b.dataset && b.dataset.dun) || '';   // PLANPICK-2026-10-17: the Parties tab room / area map, the choice comes back to this step
      window.openSpotPickerFor(PP.leader, ed.step.spot || {}, (body) => { if (PP.edit !== ed) return; const o = Object.assign({}, body); delete o.party; delete o.stay; delete o.moveOn; delete o._hunt;
        ed.step.spot = o.mode === 'auto' ? { mode: 'auto' } : PL().normSpot(Object.assign({ mode: 'manual' }, o, { spot: o.spot || o.dungeon })); render(true); }, dun);
      return; }
    if ((b = g('[data-ppspot]'))) { e.preventDefault(); const r = (PP.spotRows || [])[+b.dataset.ppspot]; if (r) PP.edit.step.spot = clone(r.spot); render(true); return; }
    if ((b = g('[data-ppquest]'))) { e.preventDefault(); const r = (CACHE.qmap || {})[+b.dataset.ppquest]; if (r) { Object.assign(PP.edit.step, { quest: r.id, name: r.name }); if (!PP.edit.step.mode) PP.edit.step.mode = 'party'; } render(true); return; }
    if ((b = g('[data-ppraid]'))) { e.preventDefault(); const r = (CACHE.raids || {})[+b.dataset.ppraid]; if (r) Object.assign(PP.edit.step, { boss: r.id, name: r.name, level: r.level }); render(true); return; }
    if ((b = g('[data-pptown]'))) { e.preventDefault(); PP.edit.step.town = b.dataset.pptown; render(true); return; }
    if ((b = g('[data-ppgo]'))) { e.preventDefault(); const to = b.dataset.ppgo; if (await close()) { try { if (typeof window.go === 'function') window.go(to); else location.hash = to; } catch (x) { location.hash = to; } } return; }
    if ((b = g('[data-ppctl]'))) { e.preventDefault(); control(b.dataset.ppctl, b.dataset.n); return; }
    if ((b = g('[data-pptpl]'))) { e.preventDefault(); useTemplate(b.dataset.pptpl); return; }
    if ((b = g('[data-pptpldel]'))) { e.preventDefault(); deleteTemplate(b.dataset.pptpldel); return; }
    if (!(b = g('[data-ppact]'))) return;
    e.preventDefault();
    const act = b.dataset.ppact;
    if (act === 'close') { close(); return; }
    if (act === 'back') { PP.view = 'list'; PP.edit = null; render(); return; }
    if (act === 'add') { openEditor(-1); return; }
    if (act === 'toggleOn') { PP.W.on = !PP.W.on; render(true); return; }
    if (act === 'applyOn') { PP.applyOn = !PP.applyOn; render(true); return; }
    if (act === 'useStep') {
      const s = PL().normStep(Object.assign({}, PP.edit.step, { id: PP.edit.step.id || PL().newId() })); if (!s) return;
      if (PP.edit.idx < 0) PP.W.steps.push(s); else PP.W.steps[PP.edit.idx] = s;
      const at = PP.edit.idx < 0 ? PP.W.steps.length - 1 : PP.edit.idx;
      PP.view = 'list'; PP.edit = null; render();
      try { const li = document.querySelector(`#ppBody li[data-ppidx="${at}"]`); if (li) { li.scrollIntoView({ block: 'center' }); li.classList.add('moved'); setTimeout(() => li.classList.remove('moved'), 900); } } catch (x) { }
      return;
    }
    if (act === 'undo') { if (await uiConfirm({ title: 'Undo your changes?', body: 'Throw away every change since the plan was opened or last saved.', confirmText: 'Undo changes', cancelText: 'Keep editing' })) { PP.W = clone(PP.W0); render(true); } return; }
    if (act === 'save') { save(); return; }
    if (act === 'suggest') { suggest(); return; }
    if (act === 'templates') { PP.view = 'templates'; render(); return; }
    if (act === 'apply') { PP.view = 'apply'; PP.applyTo = []; render(); return; }
    if (act === 'saveTpl') { saveTemplate(); return; }
    if (act === 'doApply') { doApply(); return; }
  }

  // ---------------------------------------------------------------------------------------------- actions
  async function post(body) {
    const r = await call('/api/partyplans', { method: 'POST', body: JSON.stringify(Object.assign({ by: 'dashboard' }, body)) });
    return r || { error: 'no answer from the dashboard server' };
  }
  async function save(force) {
    if (PP.busy || !dirty()) return;
    const W = PP.W, n = W.steps.length;
    if (!force && n && !W.on) {
      const c = await uiChoice({ title: `Save the plan of party ${PP.leader}`, body: [uiP(`${n} step${n === 1 ? '' : 's'}: `, uiEm(PL().planSentence(W, ctxS(), 2) + (n > 2 ? ', …' : ''))),
        uiP('Should ', uiEm('Start'), ' on the party card run this plan? If not, the plan is saved and waits until you switch it on.')],
        buttons: [{ label: 'Save only', value: 'only' }, { label: 'Save and use it on Start', value: 'use', primary: true }] });
      if (!c) return;
      if (c === 'use') W.on = true;
    } else if (!force && !(await uiConfirm({ title: `Save the plan of party ${PP.leader}?`, body: [uiP(n ? `${n} step${n === 1 ? '' : 's'}: ` : 'An empty plan (it does nothing).', n ? uiEm(PL().planSentence(W, ctxS(), 2) + (n > 2 ? ', …' : '')) : ''), uiNote(W.on ? 'Start on the party card runs this plan.' : 'Not used yet: Start does the party’s normal activity.')], confirmText: 'Save', cancelText: 'Keep editing' }))) return;
    PP.busy = true; renderBar();
    try {
      let r = await post({ action: 'set', party: PP.leader, plan: W, rev: PP.rev });
      if (r && /changed meanwhile/.test(r.error || '')) {
        const c = await uiChoice({ title: 'Changed meanwhile', body: [uiP('Someone else saved plans since you opened this one (another page or phone).'), uiNote('Overwrite: your plan for this party replaces theirs (other parties are not touched). Reload: see theirs, your changes are lost.')],
          buttons: [{ label: 'Reload', value: 'reload' }, { label: 'Overwrite', value: 'over', primary: true }] });
        if (c === 'over') r = await post({ action: 'set', party: PP.leader, plan: W, rev: r.rev });
        else if (c === 'reload') { await reload(); return; }
        else return;
      }
      if (!r || r.error) { uiError((r && r.error) || 'not saved', 'Not saved'); return; }
      PP.rev = r.rev; await reload(true);
      if (window.UIKit) UIKit.toast(`Party ${PP.leader}: plan saved${PP.W.on ? ' — Start runs it' : ''}`, { kind: 'ok' });
      try { if (typeof refresh === 'function') refresh(); } catch (x) { }
    } finally { PP.busy = false; renderBar(); }
  }
  async function reload(keep) {
    const g = ++PP.gen;
    await loadInfo();
    if (g !== PP.gen) return;
    PP.W = PL().normPlan(PP.party.plan || { name: `Party ${PP.leader}`, on: false, steps: [] });
    if (!PP.party.plan) PP.W.name = `Party ${PP.leader} plan`;
    PP.W0 = clone(PP.W);
    render(keep);
  }
  async function suggest() {
    await Promise.all([loadQuests(), loadOpts()]);
    const lo = startLevel();
    const goals = [20, 40, 52, 61, 76, 85].filter(l => l > lo).slice(0, 4);
    if (!goals.length) { uiAlert({ title: 'Nothing to suggest', body: 'The party is already at the top level.' }); return; }
    const to = await uiChoice({ title: 'Suggest a plan', body: [uiP(`From level ${lo} (the party’s lowest) to which level?`), uiNote('It uses the party’s own hunting places (else the known places for each level), the best quests every member can take, a class change at 20 / 40 / 76, better gear and then supplies in Giran — and ends with “Wait for my order”. You can change everything afterwards.')],
      buttons: goals.map((l) => ({ label: `Level ${l}`, value: l, primary: l === (goals.includes(40) ? 40 : goals[goals.length - 1]) })) });
    if (!to) return;
    const o = CACHE.opts || {};
    const r = PL().suggestPlan({ leader: PP.leader, members: members(), zones: o.zones || [], datapack: o.datapack || [], quests: CACHE.quests || [], from: lo, to: Number(to) });
    let how = 'replace';
    if (PP.W.steps.length) {
      how = await uiChoice({ title: `The suggestion has ${r.steps.length} steps`, body: [uiP(uiEm(PL().planSentence({ steps: r.steps }, ctxS(), 2) + ', …')), uiP(`Your plan has ${PP.W.steps.length} steps now.`)],
        buttons: [{ label: 'Add at the end', value: 'add' }, { label: 'Replace my steps', value: 'replace', primary: true }] });
      if (!how) return;
    }
    PP.W.steps = how === 'add' ? PP.W.steps.concat(r.steps) : r.steps;
    if (how === 'replace' || !PP.W.name || /plan$/.test(PP.W.name)) PP.W.name = `Level ${r.from} → ${r.to}`;
    render();
    if (window.UIKit) UIKit.toast(`Suggested ${r.steps.length} steps — check them, change what you like, then Save`, { kind: 'ok', ms: 5000 });
  }
  async function saveTemplate() {
    const name = await uiPrompt({ title: 'Save as a template', body: 'A name for this plan, e.g. “Mages 1 → 40”. The same name replaces the old template.', label: 'Template name', value: PP.W.name, validate: (v) => (String(v || '').trim() ? '' : 'a name, please') });
    if (!name) return;
    const r = await post({ action: 'saveTemplate', name, steps: PP.W.steps, rev: PP.rev });
    if (!r || r.error) { uiError((r && r.error) || 'not saved', 'Template not saved'); if (r && r.rev) await reload(true); return; }
    PP.rev = r.rev; await loadInfo(); render(true);
    if (window.UIKit) UIKit.toast(`Template “${name}” saved`, { kind: 'ok' });
  }
  async function useTemplate(id) {
    const t = ((PP.D && PP.D.templates) || []).find(x => x.id === id); if (!t) return;
    const r = PL().applySteps(t.steps, members().map(m => m.name));
    const ok = await uiConfirm({ title: `Use “${t.name}” for party ${PP.leader}?`, body: [uiP(`${r.steps.length} steps`, PP.W.steps.length ? ` replace your ${PP.W.steps.length} steps (not saved until you press Save).` : ' (not saved until you press Save).'), r.dropped.length ? uiWarn('Left out: ' + r.dropped.join('; ')) : ''], confirmText: 'Use it', cancelText: 'Cancel' });
    if (!ok) return;
    PP.W.steps = r.steps; PP.W.name = t.name; PP.W.template = id; PP.view = 'list'; render();
  }
  async function deleteTemplate(id) {
    const t = ((PP.D && PP.D.templates) || []).find(x => x.id === id); if (!t) return;
    if (!(await uiConfirm({ title: `Delete the template “${t.name}”?`, body: 'Plans that were made from it stay as they are.', confirmText: 'Delete', cancelText: 'Keep it', danger: true }))) return;
    const r = await post({ action: 'deleteTemplate', id, rev: PP.rev });
    if (!r || r.error) { uiError((r && r.error) || 'not deleted', 'Not deleted'); return; }
    PP.rev = r.rev; await loadInfo(); render(true);
  }
  async function doApply() {
    if (!PP.applyTo.length || PP.busy) return;
    const ps = ((PP.D && PP.D.parties) || []).filter(p => PP.applyTo.includes(p.leader));
    const rows = ps.map(p => { const r = PL().applySteps(PP.W.steps, p.members.map(m => m.name)); return `Party ${p.leader}: ${r.steps.length} steps${p.plan ? ` (replaces its ${p.plan.steps.length}-step plan)` : ''}${r.dropped.length ? ` — left out: ${r.dropped.length}` : ''}`; });
    if (!(await uiConfirm({ title: `Give this plan to ${ps.length} part${ps.length === 1 ? 'y' : 'ies'}?`, body: [uiList(rows), uiNote(PP.applyOn ? 'Their Start runs this plan from step 1.' : 'Saved for them, not used yet (switch it on in their 📋 Plan).')], confirmText: 'Give them this plan', cancelText: 'Cancel' }))) return;
    PP.busy = true; renderBar();
    try {
      const r = await post({ action: 'apply', parties: PP.applyTo, steps: PP.W.steps, name: PP.W.name, on: PP.applyOn, rev: PP.rev });
      if (!r || r.error) { uiError((r && r.error) || 'not saved', 'Not given'); if (r && r.rev) await loadInfo(); return; }
      PP.rev = r.rev; await loadInfo(); PP.view = 'list'; render();
      if (window.UIKit) UIKit.toast(`Plan given to ${PP.applyTo.join(', ')}`, { kind: 'ok' });
      try { if (typeof refresh === 'function') refresh(); } catch (x) { }
    } finally { PP.busy = false; renderBar(); }
  }
  async function control(cmd, n) {
    const plan = PP.party && PP.party.plan; if (!plan) return;
    if (dirty() && !(await uiConfirm({ title: 'Save first?', body: 'You have unsaved changes. The bots follow the SAVED plan. Save now, then try again.', confirmText: 'Save now', cancelText: 'Cancel' }))) return;
    if (dirty()) { await save(true); if (dirty()) return; }
    const idx = PL().planCursor(plan, PP.party.progress), cur = plan.steps[idx];
    const text = { start: ['Go on with the plan?', `The party goes on with step ${idx + 1}: ${cur ? PL().stepText(cur, ctxS()) : ''}`, '▶ Go on'],
      next: [cur && cur.kind === 'wait' ? 'Continue the plan?' : `Skip step ${idx + 1}?`, cur && cur.kind === 'wait' ? `The party goes on with the step after “wait”.` : `“${cur ? PL().stepText(cur, ctxS()) : ''}” is marked as done and the party goes on with the next step.`, cur && cur.kind === 'wait' ? '▶ Continue' : '⏭ Skip it'],
      stop: ['Pause the plan?', 'The party stops what the plan does now and waits. “Go on” continues with the same step.', '⏸ Pause'],
      restart: ['Start the plan again?', 'Every step counts as not done again; the party begins at step 1 (when it is started).', '↺ Start again'] }[cmd];
    if (!text || !(await uiConfirm({ title: text[0], body: text[1], confirmText: text[2], cancelText: 'Cancel' }))) return;
    const r = await post({ action: 'control', party: PP.leader, cmd, n });
    if (!r || r.error) { uiError((r && r.error) || 'not sent', 'Not sent'); return; }
    if (window.UIKit) UIKit.toast('Sent to the party leader — the line updates in a few seconds', { kind: 'ok' });
    setTimeout(() => { if (PP.open) reload(true).catch(() => { }); }, 4000);
  }

  // ---------------------------------------------------------------------------------------------- open / close
  async function open(leader) {
    if (!leader) return;
    if (PP.open && PP.leader !== leader && dirty() && !(await uiConfirm({ title: 'Throw away your changes?', body: `The plan of party ${PP.leader} has unsaved changes.`, confirmText: 'Throw away', cancelText: 'Keep editing' }))) return;
    PP.opener = document.activeElement;
    const ov = frame(); Object.assign(PP, { open: true, leader, W: null, W0: null, D: null, party: null, view: 'list', edit: null });
    ov.hidden = false; document.documentElement.classList.add('pp-lock');
    render();
    try { ov.querySelector('.pp-x').focus(); } catch (e) { }
    try {
      await loadPlainLogic();
      await Promise.all([reload(), loadQuests().then(() => { if (PP.open && PP.W) render(true); }), loadOpts().then(() => { if (PP.open && PP.W) render(true); })]);
    } catch (e) { document.getElementById('ppBody').innerHTML = `<div class="pp-prog k-bad">Could not load the plan: ${E(e.message)}. Is the dashboard server up to date (it needs a restart for the plan builder)?</div>`; }
  }
  async function close() {
    if (!PP.open) return true;
    if (dirty() && !(await uiConfirm({ title: 'Close without saving?', body: `The plan of party ${PP.leader} has unsaved changes.`, confirmText: 'Close without saving', cancelText: 'Keep editing' }))) return false;
    PP.open = false; PP.gen++;
    const ov = document.getElementById('ppOv'); if (ov) ov.hidden = true;
    document.documentElement.classList.remove('pp-lock');
    try { if (PP.opener && PP.opener.focus) PP.opener.focus(); } catch (e) { }
    return true;
  }
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-ppopen]'); if (!b) return; e.preventDefault(); e.stopPropagation(); open(b.dataset.ppopen); }, true);
  document.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const b = e.target.closest && e.target.closest('div[data-ppopen]'); if (!b) return; e.preventDefault(); open(b.dataset.ppopen); });
  window.addEventListener('uikit:mode', () => { if (PP.open && PP.view === 'list' && PP.W) render(true); });
  loadPlainLogic();
  window.PartyPlan = { button, partyLine, open, close, _state: PP, _cache: CACHE };
})();
