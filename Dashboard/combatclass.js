// COMBAT: the class guide page #/combat (CLASSROT-2026-10-26; owner: "Make sure we have aspect, skill, rule/trigger, weapon etc setup under
// /Combat ... so we can see everything that is going on for each class, level. Which skills every class should use, and when, for all 36
// class lines"). #/combat = every class line + our characters; #/combat/line/<Line> = that line: per class (base, 1st, 2nd, 3rd) every guide
// row (aspect, skill, learned, weapon, rule, auto on/off with the owner's tick) + each of our characters of that class live (the plan Hive
// uses right now, the last casts and why). #/combat/<Name> stays the character's L2Swarm combat profile (combatprofile.js).
// API: Dashboard/classrot_api.js. Uses index.html globals: api, TAB, stopChar; uidialog uiConfirm (optional).
(function () {
  'use strict';
  const SEC = 'tab-combatclass';
  const S = { open: false, view: 'index', line: '', idx: null, d: null, q: '', band: '', poll: 0, msgT: 0, openTiers: {} };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad4 = (n) => String(n).padStart(4, '0');
  const SRC_TEXT = { G: 'source: the guide', DP: 'source: game data', '?': 'source: uncertain' };
  const sicon = (id) => id ? `<img class="ccl-ic" src="/icons/icon/skill${pad4(id)}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span class="ccl-ic"></span>';
  const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - Number(t)) / 1000)); return s < 60 ? s + ' s ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; };
  const BANDS = ['1-19', '20-39', '40-75', '76-85'];
  const ASPECT_CLASS = { never: 'bad', obsolete: 'bad', emergency: 'warn', heal: 'ok', groupheal: 'ok', recharge: 'ok', cure: 'ok', res: 'ok' };
  const GROUP_NAME = { human_fighters: 'Human fighters', human_mystics: 'Human mystics', elves: 'Elves', dark_elves: 'Dark Elves', orcs_dwarves: 'Orcs and Dwarves', kamael: 'Kamael' };

  function css() {
    if ($id('ccl-css')) return;
    const st = document.createElement('style'); st.id = 'ccl-css';
    st.textContent = `
      #${SEC} { display: grid; gap: 14px; }
      .ccl-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .ccl-top h2 { margin: 0; display: flex; gap: 8px; align-items: center; }
      .ccl-top input { flex: 1 1 200px; min-width: 0; }
      .ccl-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .ccl-chip { border: 1px solid #5a4a2e; background: transparent; color: inherit; border-radius: 3px; padding: 4px 9px; cursor: pointer; font-size: 12px; }
      .ccl-chip.on { background: #6b5632; color: #fff; }
      .ccl-help { opacity: .85; font-size: 13px; margin: 0; }
      .ccl-groups { display: grid; gap: 14px; }
      .ccl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; }
      .ccl-card { display: grid; gap: 4px; padding: 9px 11px; border: 1px solid #4a3f2c; border-radius: 4px; background: rgba(0,0,0,.18); text-decoration: none; color: inherit; min-width: 0; }
      .ccl-card:hover, .ccl-card:focus-visible { border-color: #b08a4a; outline: none; }
      .ccl-card b { font-size: 14px; }
      .ccl-tiers { font-size: 12px; opacity: .85; line-height: 1.5; }
      .ccl-tiers span { white-space: nowrap; }
      .ccl-cnt { display: inline-block; min-width: 16px; padding: 0 4px; border-radius: 8px; background: #3d6b4a; color: #fff; font-size: 11px; text-align: center; margin-left: 2px; }
      .ccl-chars { display: flex; flex-wrap: wrap; gap: 6px; }
      .ccl-char { font-size: 12px; padding: 3px 7px; border-radius: 3px; border: 1px solid #4a3f2c; text-decoration: none; color: inherit; }
      .ccl-char.off { opacity: .55; }
      .ccl-tier { border: 1px solid #4a3f2c; border-radius: 4px; background: rgba(0,0,0,.15); }
      .ccl-tier > summary { cursor: pointer; padding: 9px 12px; display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; list-style: none; }
      .ccl-tier > summary b { font-size: 15px; }
      .ccl-band { font-family: monospace; font-size: 12px; padding: 1px 6px; border: 1px solid #6b5632; border-radius: 3px; }
      .ccl-body { padding: 0 12px 12px; display: grid; gap: 10px; min-width: 0; }
      .ccl-tw { overflow-x: auto; border: 1px solid #3a3226; border-radius: 3px; }
      .ccl-t { border-collapse: collapse; width: 100%; min-width: 760px; font-size: 12.5px; }
      .ccl-t th, .ccl-t td { text-align: left; vertical-align: top; padding: 5px 7px; border-bottom: 1px solid #3a3226; }
      .ccl-t th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; opacity: .8; background: rgba(0,0,0,.25); position: sticky; top: 0; }
      .ccl-t tr.off td { opacity: .55; }
      .ccl-ic { width: 22px; height: 22px; vertical-align: middle; margin-right: 5px; display: inline-block; }
      .ccl-asp { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: rgba(255,255,255,.08); white-space: nowrap; }
      .ccl-asp.bad { background: rgba(170,60,50,.35); } .ccl-asp.warn { background: rgba(190,140,40,.35); } .ccl-asp.ok { background: rgba(60,140,80,.35); }
      .ccl-when { display: block; margin-top: 3px; font-size: 11px; opacity: .8; font-family: monospace; }
      .ccl-tog { border: 1px solid #6b5632; background: transparent; color: inherit; border-radius: 3px; padding: 3px 8px; cursor: pointer; font-size: 12px; min-width: 44px; }
      .ccl-tog.on { background: #3d6b4a; border-color: #3d6b4a; color: #fff; }
      .ccl-tog.user { box-shadow: 0 0 0 1px #d4a74a; }
      .ccl-src { font-family: monospace; font-size: 11px; opacity: .7; }
      .ccl-live { display: grid; gap: 8px; }
      .ccl-lc { border: 1px dashed #4a3f2c; border-radius: 4px; padding: 8px 10px; display: grid; gap: 5px; font-size: 12.5px; min-width: 0; }
      .ccl-lc .row { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; }
      .ccl-lc .lab { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; opacity: .7; min-width: 70px; }
      .ccl-pill { font-size: 11.5px; padding: 1px 6px; border-radius: 3px; background: rgba(255,255,255,.07); white-space: nowrap; }
      .ccl-rules { margin: 0; padding-left: 18px; font-size: 13px; display: grid; gap: 4px; }
      .ccl-msg { padding: 6px 10px; border-radius: 3px; background: rgba(60,140,80,.3); font-size: 13px; }
      .ccl-msg.bad { background: rgba(170,60,50,.35); }
      .ccl-notes { margin: 0; padding-left: 18px; font-size: 12.5px; opacity: .9; }
      .ccl-guide { font-size: 13px; line-height: 1.5; }
      .ccl-guide .tw { overflow-x: auto; border: 1px solid #3a3226; border-radius: 3px; margin: 6px 0; }
      .ccl-guide table { border-collapse: collapse; width: 100%; min-width: 560px; font-size: 12.5px; }
      .ccl-guide th, .ccl-guide td { text-align: left; vertical-align: top; padding: 5px 7px; border-bottom: 1px solid #3a3226; }
      .ccl-guide th { background: rgba(0,0,0,.25); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
      .ccl-guide code { font-size: 12px; background: rgba(255,255,255,.07); padding: 0 3px; border-radius: 2px; }
      @media (max-width: 560px) { .ccl-grid { grid-template-columns: 1fr; } }
      /* phones: every row is a card (type + on/off on top, the skill, learned + weapon, the rule as its own line, why) - nothing to swipe sideways */
      @media (max-width: 760px) {
        .ccl-body { padding: 0 8px 10px; }
        .ccl-tw { overflow: visible; border: 0; }
        .ccl-t { min-width: 0; display: block; font-size: 13px; }
        .ccl-t thead { display: none; }
        .ccl-t tbody { display: grid; gap: 8px; }
        .ccl-t tr { display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: "asp asp auto" "skill skill auto" "lrn wpn wpn" "rule rule rule" "why why why";
          gap: 5px 10px; padding: 9px 10px; border: 1px solid #3a3226; border-radius: 4px; background: rgba(0,0,0,.18); }
        .ccl-t tr.off { opacity: .6; } .ccl-t tr.off td { opacity: 1; }
        .ccl-t td { display: block; padding: 0; border: 0; min-width: 0; overflow-wrap: anywhere; }
        .ccl-t td:empty { display: none; }
        .ccl-t td[data-l]::before { content: attr(data-l); display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; opacity: .6; }
        .ccl-t .c-asp { grid-area: asp; } .ccl-t .c-skill { grid-area: skill; font-size: 14px; font-weight: 600; }
        .ccl-t .c-skill .ccl-src { font-weight: 400; }
        .ccl-t .c-lrn { grid-area: lrn; } .ccl-t .c-wpn { grid-area: wpn; }
        .ccl-t .c-rule { grid-area: rule; padding-top: 5px; border-top: 1px solid #3a3226; }
        .ccl-t .c-auto { grid-area: auto; text-align: right; align-self: start; }
        .ccl-t .c-why { grid-area: why; font-size: 12px; opacity: .75; }
        .ccl-tog { min-height: 36px; min-width: 58px; font-size: 13px; }
        .ccl-pill { white-space: normal; }
        .ccl-lc .lab { min-width: 0; flex-basis: 100%; }
        .ccl-guide .tw::before { content: 'swipe sideways for the whole table →'; display: block; font-size: 11px; opacity: .6; padding: 3px 6px; }
      }`;
    document.head.appendChild(st);
  }
  function section() {
    let s = $id(SEC); if (s) return s;
    css();
    s = document.createElement('section'); s.id = SEC; s.className = 'win'; s.hidden = true;
    s.innerHTML = `<div class="ccl-msg" id="cclMsg" role="status" hidden></div><div id="cclBody"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('input', (e) => { if (e.target && e.target.id === 'cclQ') { S.q = e.target.value; renderIndexList(); } });
    return s;
  }
  function flash(t, bad) { const m = $id('cclMsg'); if (!m) return; m.hidden = !t; m.className = 'ccl-msg' + (bad ? ' bad' : ''); m.textContent = t || ''; clearTimeout(S.msgT); S.msgT = setTimeout(() => { const x = $id('cclMsg'); if (x) x.hidden = true; }, bad ? 12000 : 6000); }
  /** arg: '' (index) | 'line/<Line>' */
  function open(arg) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'combat'; } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    const m = /^line\/(.+)$/.exec(String(arg || ''));
    S.view = m ? 'line' : 'index'; S.line = m ? decodeURIComponent(m[1]) : '';
    s.hidden = false; S.open = true;
    render(); load();
    clearInterval(S.poll); S.poll = setInterval(() => { if (!S.open || document.hidden) return; load(true); }, 8000);
    [0, 200].forEach(ms => setTimeout(() => { try { const x = $id(SEC); if (S.open && x && x.getBoundingClientRect().top > 40) x.scrollIntoView({ block: 'start' }); } catch (e) { } }, ms));
  }
  function close() { if (!S.open) return; S.open = false; clearInterval(S.poll); const s = $id(SEC); if (s) s.hidden = true; }
  async function load(quiet) {
    try {
      if (S.view === 'index') { const d = await api('/api/classrot'); if (d && !d.error) { S.idx = d; if (!quiet) render(); else renderIndexList(); } else if (!quiet) flash((d && d.error) || 'No class guide API yet (the dashboard server needs a restart).', true); }
      else { const d = await api('/api/classrot/line?name=' + encodeURIComponent(S.line)); if (d && !d.error) { S.d = d; if (quiet) renderLive(); else render(); } else if (!quiet) flash((d && d.error) || 'Could not load this class line.', true); }
    } catch (e) { if (!quiet) flash('Could not reach the dashboard: ' + e.message, true); }
  }
  // ---------------------------------------------------------------- index
  function render() {
    const b = $id('cclBody'); if (!b) return;
    if (S.view === 'index') {
      b.innerHTML = `<div class="ccl-top"><h2><img class="gi" src="/icons/icon/skill0036.png" alt=""> Combat · class guide</h2>
          <input id="cclQ" type="search" placeholder="Find a class or a character" value="${h(S.q)}" aria-label="Find a class or a character"></div>
        <p class="ccl-help">Every class line, base → 1st → 2nd → 3rd class: which skills Hive uses, when, with which weapon. Tap a line for every row of the guide, the on/off ticks and what your characters of that class are casting right now. The written guide: <a href="https://claude.ai/artifact/NCs3ydVAgaUJjmUTejW46A" target="_blank" rel="noopener">Class Skill Guide</a>. A character's own L2Swarm profile: its character page → Combat profile.</p>
        <div id="cclStatus">${statusHtml()}</div>
        <div id="cclList">${S.idx ? '' : '<div class="muted">Loading…</div>'}</div>`;
      renderIndexList();
      return;
    }
    renderLine();
  }
  /** the guide's findings, what was built for each and the in-game checks (Scripts/data/class_rotations_status.json) */
  function statusHtml() {
    const st = S.idx && S.idx.status; if (!st) return '';
    const T = S.idx.totals || {};
    const badge = (s) => `<span class="ccl-asp ${s === 'fixed' || s === 'live' || s === 'answered' ? 'ok' : 'warn'}">${h({ fixed: 'fixed', live: 'live', answered: 'answered', data: 'from the game data' }[s] || s)}</span>`;
    const block = (title, items, open, row) => `<details class="ccl-tier"${open ? ' open' : ''}><summary><b>${h(title)}</b><span class="muted">${items.length}</span></summary><div class="ccl-body"><ol class="ccl-rules">${items.map(row).join('')}</ol></div></details>`;
    return `<div class="ccl-lc" style="border-style:solid"><div class="row"><b>What is going on</b><span class="muted">${h(T.classes || '?')} classes · ${h(T.rows || '?')} guide rows · ${S.idx.chars.filter(c => c.guide).length} of ${S.idx.chars.length} characters already use the class guide · updated ${h(st.updated || '')}</span></div>
      <div class="muted" style="font-size:12px">Every character whose class has guide rows casts exactly those rows: the guide's order, only with the weapon each skill needs, each rule checked before the cast; never / obsolete rows and rows you switch off are never cast by Hive. A character that is not ✓ below has not reported the new plan yet (it needs the swarm.js deploy) or has Hive skills switched off (then its own L2Swarm profile casts).</div></div>
      ${block('Why the bots used wrong skills, and what is fixed', st.why || [], false, (w) => `<li>${badge(w.state)} <b>${h(w.t)}</b><br><span class="muted">Was:</span> ${h(w.was)}<br><span class="muted">Now:</span> ${h(w.now)}</li>`)}
      ${(st.afterLive || []).length ? block('Found and fixed after going live', st.afterLive, true, (w) => `<li>${badge(w.state)} <b>${h(w.t)}</b><br><span class="muted">Was:</span> ${h(w.was)}<br><span class="muted">Now:</span> ${h(w.now)}</li>`) : ''}
      ${block('The 8 proposals of the guide', st.proposals || [], false, (p) => `<li>${badge(p.state)} <b>${h(p.t)}</b><br>${h(p.now)}</li>`)}
      ${block('Tested in game (the guide\'s "To test in game first")', st.checks || [], true, (c) => `<li>${badge(c.state)} <b>${h(c.q)}</b><br>${h(c.a)}</li>`)}`;
  }
  function renderIndexList() {
    const stEl = $id('cclStatus'); if (stEl && S.idx && !stEl.innerHTML) stEl.innerHTML = statusHtml();
    const L = $id('cclList'); if (!L || !S.idx) return;
    const q = S.q.trim().toLowerCase(), D = S.idx;
    const charsOf = (cid) => D.chars.filter(c => c.cid === cid);
    const lineHit = (l) => !q || l.name.toLowerCase().includes(q) || l.tiers.some(t => t.name.toLowerCase().includes(q) || charsOf(t.cid).some(c => c.name.toLowerCase().includes(q)));
    const groups = {}; D.lines.forEach(l => { if (!lineHit(l)) return; (groups[l.group || 'other'] = groups[l.group || 'other'] || []).push(l); });
    const mineFirst = Object.keys(groups).sort((a, b) => (GROUP_NAME[a] || a).localeCompare(GROUP_NAME[b] || b));
    const ours = D.chars.filter(c => !q || c.name.toLowerCase().includes(q) || String(c.cls || '').toLowerCase().includes(q)).sort((a, b) => String(a.cls).localeCompare(String(b.cls)) || a.name.localeCompare(b.name));
    const lineOfCid = (cid) => { const l = D.lines.find(x => x.tiers.some(t => t.cid === cid)); return l ? l.name : ''; };
    L.innerHTML = `<div class="ccl-groups">
      <div><h3 style="margin:0 0 6px">Our characters (${ours.length})</h3><div class="ccl-chars">${ours.map(c => `<a class="ccl-char${c.online ? '' : ' off'}" href="#/combat/line/${encodeURIComponent(lineOfCid(c.cid))}" title="${c.guide ? 'Hive uses the class guide' : 'no guide plan reported yet'}">${h(c.name)} <span class="muted">${h(c.level)} ${h(c.cls || '')}</span>${c.guide ? ' ✓' : ''}</a>`).join('') || '<span class="muted">none</span>'}</div></div>
      ${mineFirst.map(g => `<div><h3 style="margin:0 0 6px">${h(GROUP_NAME[g] || g)}</h3><div class="ccl-grid">${groups[g].map(l => {
        const n = l.tiers.reduce((s, t) => s + t.chars, 0), rows = l.tiers.reduce((s, t) => s + t.rows, 0);
        return `<a class="ccl-card" href="#/combat/line/${encodeURIComponent(l.name)}"><b>${h(l.name)}${n ? ` <span class="ccl-cnt" title="our characters">${n}</span>` : ''}</b>
          <div class="ccl-tiers">${l.tiers.map(t => `<span>${h(t.name)} <span class="muted">${h(t.band)}</span>${t.chars ? ` <span class="ccl-cnt">${t.chars}</span>` : ''}</span>`).join(' → ')}</div>
          <div class="muted" style="font-size:11px">${rows} guide rows</div></a>`; }).join('')}</div></div>`).join('')}
      ${!mineFirst.length && !ours.length ? '<div class="muted">Nothing matches.</div>' : ''}</div>`;
  }
  // ---------------------------------------------------------------- one line
  function renderLine() {
    const b = $id('cclBody'), d = S.d; if (!b) return;
    if (!d || d.name !== S.line) { b.innerHTML = `<div class="ccl-top"><a href="#/combat">← all classes</a></div><div class="muted">Loading ${h(S.line)}…</div>`; return; }
    const A = d.aspects || {}, W = d.weapons || {};
    const tiers = d.tiers.filter(t => !S.band || t.band === S.band);
    b.innerHTML = `<div class="ccl-top"><a href="#/combat">← all classes</a><h2>${h(d.name)} line</h2></div>
      <p class="ccl-help">${d.tiers.map(t => `${h(t.name)} (${h(t.band)})`).join(' → ')}. Rows in the guide's order. <b>Auto</b> = Hive casts it by itself; tap to switch it (your choice wins over the guide, a gold ring marks it; the bots pick it up within 30 s). A 2nd / 3rd class also uses the rows of the classes before it, unless a newer row replaces them.</p>
      <div class="ccl-chips" role="group" aria-label="Level band">${['', ...BANDS].map(x => `<button type="button" class="ccl-chip${S.band === x ? ' on' : ''}" data-cclband="${x}">${x || 'All levels'}</button>`).join('')}</div>
      ${d.rules && d.rules.length ? `<details class="ccl-tier"><summary><b>Rules for this race (${d.rules.length})</b></summary><div class="ccl-body"><ul class="ccl-rules">${d.rules.map(r => `<li>${h(r.text)}${r.skills && r.skills.length ? ` <span class="ccl-src">[${r.skills.join(', ')}]</span>` : ''}</li>`).join('')}</ul></div></details>` : ''}
      ${tiers.map(t => tierHtml(t, A, W)).join('')}
      ${d.guide && (d.guide.line.length || d.guide.general.length) ? `<details class="ccl-tier"><summary><b>The written guide for this line</b><span class="muted">${d.guide.line.length + d.guide.general.length} sections · every table the rows above came from</span></summary><div class="ccl-body ccl-guide">
        ${d.guide.line.map(s => `<h3>${h(s.title)}</h3>${s.html}`).join('')}
        ${d.guide.general.length ? `<h3 style="opacity:.8">For every ${h(GROUP_NAME[d.group] || '')} line</h3>` + d.guide.general.map(s => `<h4>${h(s.title)}</h4>${s.html}`).join('') : ''}
      </div></details>` : ''}`;
  }
  function tierHtml(t, A, W) {
    const open = S.openTiers[t.cid] !== undefined ? S.openTiers[t.cid] : (t.chars.length > 0 || S.d.tiers.length === 1);
    const order = ['emergency', 'debuff', 'opener', 'burst', 'aoe', 'aoe-self', 'single', 'cc', 'heal', 'groupheal', 'recharge', 'cure', 'res', 'spoil', 'sweep', 'toggle', 'selfbuff', 'partybuff', 'mp', 'summon', 'pet', 'never', 'obsolete'];
    const rows = t.rows.map((r, i) => Object.assign({ i }, r)).sort((a, b) => (order.indexOf(a.aspect) - order.indexOf(b.aspect)) || a.i - b.i);
    const on = rows.filter(r => r.auto).length;
    return `<details class="ccl-tier" data-ccltier="${t.cid}"${open ? ' open' : ''}><summary><b>${h(t.name)}</b><span class="ccl-band">${h(t.band)}</span><span class="muted">${rows.length} rows · ${on} auto${t.chars.length ? ` · ${t.chars.length} of ours` : ''}</span></summary>
      <div class="ccl-body">
        ${t.notes && t.notes.length ? `<ul class="ccl-notes">${t.notes.map(n => `<li>${h(n)}</li>`).join('')}</ul>` : ''}
        ${rows.length ? `<div class="ccl-tw"><table class="ccl-t"><thead><tr><th>Aspect</th><th>Skill</th><th>Learned</th><th>Weapon</th><th>Rule / trigger</th><th>Auto</th><th>Why · src</th></tr></thead><tbody>
          ${rows.map(r => `<tr class="${r.auto ? '' : 'off'}"><td class="c-asp"><span class="ccl-asp ${ASPECT_CLASS[r.aspect] || ''}">${h(A[r.aspect] || r.aspect)}</span></td>
            <td class="c-skill">${sicon(r.skill)}${h(r.name)} <span class="ccl-src">${h(r.skill == null ? '' : r.skill)}</span></td>
            <td class="c-lrn" data-l="Learned">${h(r.learn || '')}</td><td class="c-wpn" data-l="Weapon">${(r.weapon || []).map(w => h(W[w] || w)).join(', ') || '<span class="muted">any</span>'}</td>
            <td class="c-rule" data-l="When">${h(r.trigger || '')}${r.whenText ? `<span class="ccl-when">${h(r.whenText)}</span>` : ''}${r.when && r.when.text ? `<span class="ccl-when">not checkable: ${h(r.when.text)}</span>` : ''}</td>
            <td class="c-auto">${r.skill == null ? '' : `<button type="button" class="ccl-tog${r.auto ? ' on' : ''}${r.user ? ' user' : ''}" aria-pressed="${!!r.auto}" data-ccltog="${t.cid}|${h(r.key)}|${r.auto ? 0 : 1}" title="${r.user ? 'your choice (guide: ' + (r.def ? 'on' : 'off') + ') — long text: tap again to change' : 'the guide says ' + (r.def ? 'on' : 'off')}">${r.auto ? 'On' : 'Off'}</button>${r.auto && r.manual ? '<br><span class="ccl-when" title="Hive cannot check this rule, so the row is not cast by itself">not by itself</span>' : ''}${r.user ? `<br><button type="button" class="ccl-chip" style="margin-top:3px;font-size:10px" data-ccldef="${t.cid}|${h(r.key)}">guide</button>` : ''}`}</td>
            <td class="c-why">${h(r.why || '')} <span class="ccl-src" title="where the row comes from">${h(SRC_TEXT[r.src] || r.src || '')}</span></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="muted">No rows for this class yet.</div>'}
        ${t.inherited && t.inherited.length ? `<details><summary class="muted" style="cursor:pointer">Also used from the classes before (${t.inherited.filter(r => r.auto).length} auto of ${t.inherited.length}) — Hive drops an old one when this class has a newer skill of the same kind for the same weapon</summary>
          <div class="ccl-tw" style="margin-top:6px"><table class="ccl-t"><thead><tr><th>Aspect</th><th>Skill</th><th>From</th><th>Weapon</th><th>Rule / trigger</th><th>Auto</th></tr></thead><tbody>
          ${t.inherited.map(r => `<tr class="${r.auto ? '' : 'off'}"><td class="c-asp"><span class="ccl-asp ${ASPECT_CLASS[r.a] || ''}">${h(A[r.a] || r.a)}</span></td><td class="c-skill">${sicon(r.id)}${h(r.n)} <span class="ccl-src">${h(r.id)}</span></td><td class="c-lrn" data-l="From">${h(r.from)}</td><td class="c-wpn" data-l="Weapon">${(r.w || []).map(w => h(W[w] || w)).join(', ') || '<span class="muted">any</span>'}</td><td class="c-rule" data-l="When">${h(r.trig || '')}${r.whenText ? `<span class="ccl-when">${h(r.whenText)}</span>` : ''}</td><td class="c-auto">${r.auto ? 'On' : 'Off'}</td></tr>`).join('')}
          </tbody></table></div></details>` : ''}
        <div class="ccl-live" id="cclLive${t.cid}">${liveHtml(t)}</div>
      </div></details>`;
  }
  function liveHtml(t) {
    if (!t.chars.length) return '<div class="muted">None of our characters has this class right now.</div>';
    return `<h4 style="margin:4px 0 0">Our ${h(t.name)}s now</h4>` + t.chars.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => {
      const p = c.plan;
      if (!p) return `<div class="ccl-lc"><div class="row"><a href="#/char/${encodeURIComponent(c.name)}"><b>${h(c.name)}</b></a><span class="muted">lvl ${h(c.level)}${c.online ? '' : ' · offline'} · no plan reported yet (needs the new swarm.js)</span></div></div>`;
      const pills = (arr) => arr && arr.length ? arr.filter((x, i) => arr.findIndex(y => y.n === x.n && y.a === x.a) === i).map(x => `<span class="ccl-pill">${sicon(x.id)}${h(x.n)}${x.a && x.a !== 'single' ? ` <span class="muted">${h((S.d.aspects || {})[x.a] || x.a)}</span>` : ''}</span>`).join(' ') : '<span class="muted">none</span>';
      return `<div class="ccl-lc"><div class="row"><a href="#/char/${encodeURIComponent(c.name)}"><b>${h(c.name)}</b></a><span class="muted">lvl ${h(c.level)} · ${p.guide ? 'uses the class guide' : 'old plan (no guide file for this class)'}${p.hive === false ? ' · Hive skills OFF (its L2Swarm profile casts)' : ''} · weapon ${h(p.weapon || '?')}${c.online ? '' : ' · offline'}</span> <a class="muted" href="#/combat/${encodeURIComponent(c.name)}">L2Swarm profile →</a></div>
        <div class="row"><span class="lab">Attacks</span>${pills(p.attacks)}</div>
        <div class="row"><span class="lab">Buffs</span>${pills(p.buffs)}</div>
        <div class="row"><span class="lab">Toggles</span>${pills(p.toggles)}</div>
        ${p.emergency && p.emergency.length ? `<div class="row"><span class="lab">Emergency</span>${pills(p.emergency)}</div>` : ''}
        <div class="row"><span class="lab">Never</span><span class="muted">${(p.never || []).length} skills blocked</span></div>
        <div class="row"><span class="lab">Last casts</span>${(p.last || []).length ? p.last.map(x => `<span class="ccl-pill" title="${h(x.why)}">${sicon(x.id)}${h(x.n)} <span class="muted">${h(x.why)}${x.t ? ` · monster #${String(x.t).slice(-4)}` : ""} · ${ago(x.at)}</span></span>`).join(' ') : '<span class="muted">none yet</span>'}</div></div>`;
    }).join('');
  }
  function renderLive() { if (!S.d) return; S.d.tiers.forEach(t => { const el = $id('cclLive' + t.cid); if (el) el.innerHTML = liveHtml(t); }); }
  async function setRow(cid, key, auto) {
    let r = null; try { r = await api('/api/classrot/set', { method: 'POST', body: JSON.stringify({ cid: Number(cid), key, auto }) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { flash((r && r.error) || 'Not saved.', true); return; }
    flash(auto === null ? 'Back to the guide default. The bots of this class use it within 30 s.' : `Saved: ${auto ? 'ON' : 'OFF'}. The bots of this class use it within 30 s.`);
    load();
  }
  function onClick(e) {
    const t = e.target.closest('[data-ccltog],[data-ccldef],[data-cclband]'); if (!t) {
      const sm = e.target.closest('.ccl-tier > summary'); if (sm) { const d = sm.parentElement; const cid = d.getAttribute('data-ccltier'); if (cid) setTimeout(() => { S.openTiers[cid] = d.open; }, 0); }
      return;
    }
    if (t.dataset.cclband !== undefined) { S.band = t.dataset.cclband; renderLine(); return; }
    if (t.dataset.ccltog) { const [cid, key, v] = t.dataset.ccltog.split('|'); setRow(cid, key, v === '1'); return; }
    if (t.dataset.ccldef) { const [cid, key] = t.dataset.ccldef.split('|'); setRow(cid, key, null); }
  }
  function route(kind, arg) {
    const rest = String(location.hash || '').replace(/^#\/?combat\/?/, '');   // the index route splits on '/', so #/combat/line/<Line> is read here
    if (kind === 'combat' && (!rest || /^line\//.test(rest))) { open(rest); return true; }
    close(); return false;
  }
  window.CombatClassPage = { route, open, close };
})();
