// SKILL ENCHANT page #/skillenchant[/<Name>] (user 2026-10-12, forum topic 2753 "Skill Enchant Table") + a small "Skill enchant" box on the
// character page #/char/<Name> (inserted before .cp-orders, like circuitpage_charlock.js).
// Every character: which of ITS skills can be enchanted (3rd class + level 76), the best route for its role (INFERRED rules in
// Dashboard/skillenchant_logic.js, the user can pick another route or "never"), chance at its level, expected SP / adena / Giant's Codex
// (normal and safe), the per-level table. Settings (auto on/off, minimum chance, adena reserve) -> Scripts/data/skill_enchant_settings.json
// and the bots' plan Scripts/data/skill_enchant_plan.json. Data: /api/skillenchant (Dashboard/skillenchant_api.js).
// Uses index.html globals: api, iconUrl, stopChar, TAB, go; uidialog's uiConfirm / uiError / uiP / uiList / uiWarn. No browser alert / confirm / prompt.
(function () {
  'use strict';
  const SEC = 'tab-skillenchant';
  const S = { open: false, name: '', info: null, det: null, level: 0, orig: null, cur: null, rev: '', busy: false, msgT: 0, live: false, openSk: new Set(), filter: '' };
  const $id = (i) => document.getElementById(i);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (p) => (typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png');
  const clone = (o) => JSON.parse(JSON.stringify(o == null ? {} : o));
  const fmt = (n) => n == null || !isFinite(Number(n)) ? '–' : Number(n).toLocaleString('en-US');
  const short = (n) => { n = Number(n); if (!isFinite(n)) return '∞'; const a = Math.abs(n); return a >= 1e9 ? +(n / 1e9).toFixed(2) + 'b' : a >= 1e6 ? +(n / 1e6).toFixed(1) + 'm' : a >= 1e3 ? +(n / 1e3).toFixed(0) + 'k' : String(Math.round(n)); };
  const BOOK_ICON = { 6622: 'icon/etc_codex_of_giant_i00', 9625: 'icon/etc_codex_of_giant_i01', 9626: 'icon/etc_codex_of_giant_i02', 9627: 'icon/etc_codex_of_giant_i03' };
  const BOOK_NAME = { 6622: "Giant's Codex", 9625: "Giant's Codex - Oblivion", 9626: "Giant's Codex - Discipline", 9627: "Giant's Codex - Mastery" };
  const KIND_LABEL = { attack: 'attack', heal: 'heal', resurrect: 'resurrect', debuff: 'debuff', aggro: 'aggro', buff: 'buff', toggle: 'toggle', summon: 'summon', passive: 'passive', other: 'other' };
  const comparable = (o) => { const c = clone(o); delete c._updated; delete c._readme; return JSON.stringify(c); };
  const dirty = () => S.cur && S.orig && comparable(S.cur) !== comparable(S.orig);

  // ============================================================================================ data
  async function loadInfo() {
    let d = null; try { d = await api('/api/skillenchant'); } catch (e) { d = { error: 'The dashboard server has no skill enchant API yet (it needs a restart).' }; }
    if (!d || d.error) { flash((d && d.error) || 'no answer', true); S.info = null; render(); return; }
    S.info = d;
    if (!dirty()) { S.orig = clone(d.settings); S.cur = clone(d.settings); S.rev = d.rev; }
    else if (d.rev !== S.rev) flash('Someone else saved the skill enchant settings meanwhile. Undo to see theirs, or save to overwrite (you will be asked).', true);
    render();
  }
  async function loadDetail(live) {
    if (!S.name) return;
    const q = `/api/skillenchant?name=${encodeURIComponent(S.name)}${S.level ? '&level=' + S.level : ''}${live ? '&live=1' : ''}`;
    let d = null; try { d = await api(q); } catch (e) { d = { error: e.message }; }
    S.det = d && !d.error ? d : null;
    if (d && d.error) flash(d.error, true);
    render();
  }

  // ============================================================================================ frame + routing
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win sen'; s.hidden = true;
    s.innerHTML = `<div class="sen-head"><h2><img class="gi" src="${ico(BOOK_ICON[6622])}" alt=""> Skill enchant</h2>
        <span class="sen-manual" title="User rule 2026-10-12: enchanting is never automatic (items and skills). Each enchant is one order you give here.">Manual only</span></div>
      <div class="sen-msg" id="senMsg" role="status" hidden></div>
      <div id="senBody"></div>
      <div class="sen-bar" id="senBar" hidden></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('change', onChange);
    s.addEventListener('toggle', (e) => { const d = e.target; if (d && d.dataset && d.dataset.sensk) { if (d.open) S.openSk.add(d.dataset.sensk); else S.openSk.delete(d.dataset.sensk); } }, true);
    return s;
  }
  function route(kind, arg) {
    if (kind === 'skillenchant') { open(arg ? decodeURIComponent(arg) : ''); return true; }
    close(); return false;
  }
  function open(name) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'skillenchant'; } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'skillenchant')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    const changed = S.name !== name || !S.open;
    s.hidden = false; S.open = true;
    if (S.name !== name) { S.name = name; S.det = null; S.level = 0; S.openSk.clear(); }
    if (changed) window.scrollTo(0, 0);
    render(); loadInfo(); if (name) loadDetail(false);
  }
  function close() { if (!S.open) return; S.open = false; const s = $id(SEC); if (s) s.hidden = true; }
  function flash(t, bad) {
    const m = $id('senMsg'); if (!m) return;
    m.hidden = !t; m.className = 'sen-msg' + (bad ? ' bad' : ''); m.textContent = t || '';
    clearTimeout(S.msgT); S.msgT = setTimeout(() => { const x = $id('senMsg'); if (x) x.hidden = true; }, bad ? 15000 : 7000);
  }

  // ============================================================================================ render
  function render() {
    const s = $id(SEC); if (!s || !S.open) return;
    const st = S.cur || {};
    void st;   // MANUAL-ONLY 2026-10-12: no auto switch any more (user rule: enchanting is never automatic)
    const body = $id('senBody'); if (!body) return;
    body.innerHTML = S.name ? charView() : listView();
    renderBar();
  }
  const bookChip = (id, n) => `<span class="sen-book" title="${h(BOOK_NAME[id] || id)}"><img src="${ico(BOOK_ICON[id])}" alt="">${n != null ? '×' + h(n) : ''}</span>`;
  function rulesBox() {
    const I = S.info || {}, src = I.bookSources || {};
    const srcLine = (id) => { const l = src[id] || []; if (!l.length) return 'no shop / drop known in the datapack'; const ms = l.filter(x => x.how === 'multisell'), rd = l.filter(x => x.how === 'raid drop');
      return [ms.length ? `${ms.length} exchange list${ms.length > 1 ? 's' : ''} (${h(ms.slice(0, 3).map(x => (x.npcs[0] || {}).name || x.list).join(', '))}${ms.length > 3 ? ', …' : ''})` : '', rd.length ? `${rd.length} raid boss drop${rd.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') || l.length + ' sources'; };
    return `<details class="box sen-help"><summary><h3>How skill enchanting works</h3></summary><div class="sen-helpbody">
      <p><b>Who:</b> a character with its <b>3rd class</b> at <b>level 76+</b>. A skill must be at its <b>highest normal level</b> before +1. Each skill has 1–7 <b>routes</b> (Power, Cost, Time, Chance, …); you enchant one route at a time.</p>
      <p><b>Chance</b> depends on the character's level (76 → 85) and the + level (forum table = L2J datapack; one cell differs: 2nd-class +24 at 85 is 51 % on the forum, 46 % in the datapack — this page uses 46).</p>
      <ul class="sen-ul">
        <li>${bookChip(6622)} <b>Normal</b>: SP + adena; a Giant's Codex only for +1. <b class="bad">A fail drops the skill back to its normal level</b> (all + lost). Sources: ${srcLine(6622)}.</li>
        <li>${bookChip(9627)} <b>Safe</b>: SP and adena ×5 and a Giant's Codex - Mastery <b>every try</b>; a fail keeps the level. Sources: ${srcLine(9627)}.</li>
        <li>${bookChip(9625)} <b>Untrain</b>: −1 level, 80 % of its SP back. ${bookChip(9626)} <b>Route change</b>: keeps +N on another route, then loses 0–3 levels. The bots never untrain or change routes.</li>
      </ul>
      <p><b>Expected cost</b> = what it costs on average including the fails (normal: every fail starts again from +0). "Up to +N" = every step at least the minimum chance at that level.</p>
      <p class="muted">Sources: L2J High Five datapack + server code (DATAPACK/SERVER), client skill texts (CLIENT), forum topic 2753 (GUIDE). Route advice = INFERRED from the character's role and the kind of skill. L2Toggle was not checked live yet (nobody is level 76).</p>
    </div></details>`;
  }
  function settingsBox() {
    const st = S.cur || {};
    const f = (k, label, val, hint) => `<label class="sen-f"><span class="fl">${h(label)}</span><input class="sen-num" inputmode="numeric" data-sen="${k}" value="${h(val)}"><span class="fh">${h(hint)}</span></label>`;
    return `<div class="box"><h3>Recommendation settings</h3><div class="sen-grid">
      ${f('minChance', 'Minimum chance %', st.minChance ?? 80, '"up to +N" and "next" stop below this chance')}
      </div><div class="sen-hint"><b>Nothing is ever enchanted by itself.</b> Open a character, pick the route, and tap <b>Enchant +N…</b> on a skill: that character makes exactly <b>one</b> attempt (normal or safe) after you confirm. Party chat: <code>!skillenchant &lt;skill id&gt; &lt;route&gt; [safe] &lt;name&gt;</code>, or <code>!skillenchant next &lt;name&gt;</code> for the first recommended step; <code>!skillenchant check &lt;name&gt;</code> only reports.</div></div>`;
  }
  function charAutoSel(name) {
    const c = ((S.cur || {}).chars || {})[name] || {};
    const v = c.auto === false ? 'off' : c.auto === true ? 'on' : '';
    return `<select class="sen-csel" data-sen="charAuto" data-name="${h(name)}" aria-label="${h(name)} auto"><option value=""${v === '' ? ' selected' : ''}>default</option><option value="off"${v === 'off' ? ' selected' : ''}>never</option></select>`;
  }
  function listView() {
    const I = S.info;
    if (!I) return `<div class="box muted">Loading…</div>`;
    const q = S.filter.toLowerCase();
    const parties = (I.parties || []).map(p => {
      const rows = p.chars.filter(c => !q || c.name.toLowerCase().includes(q) || String(c.targetName || '').toLowerCase().includes(q)).map(c => {
        const status = c.eligible ? '<span class="sen-ok">can enchant now</span>' : `<span class="sen-wait">${h(c.why.join(' · '))}</span>`;
        const top = (c.top || []).map(t => `<img class="sen-ic" src="${ico(t.icon)}" alt="" title="${h(t.name)} → ${h(t.route)}">`).join('');
        return `<div class="sen-row"><a class="who" href="#/skillenchant/${encodeURIComponent(c.name)}"><span class="dot${c.online ? ' on' : ''}"></span><b>${h(c.name)}</b>
            <span class="lv">L${h(c.level ?? '?')}</span><span class="cls">${h(c.cls || '')} → <b>${h(c.targetName || '?')}</b></span></a>
          <div class="st">${status}</div><div class="tp">${top}<span class="muted">${h(c.count)} skills</span></div><div class="au">${charAutoSel(c.name)}</div></div>`;
      }).join('');
      return rows ? `<div class="sen-party"><div class="ph"><b>Party ${h(p.leader)}</b></div>${rows}</div>` : '';
    }).join('');
    return `${rulesBox()}${settingsBox()}<div class="box"><h3>Characters</h3><input class="sen-filter" type="search" placeholder="Filter by name or class" data-sen="filter" value="${h(S.filter)}">
      <div class="sen-hint">Tap a character for its skills, routes and costs. Enchanting is manual only; "never" = the !skillenchant order refuses for this character.</div>${parties || '<div class="muted">No characters.</div>'}</div>`;
  }
  function costLine(c, label) {
    if (!c) return '';
    if (!c.ok) return `<div class="sen-cost"><span class="k">${h(label)}</span> <span class="bad">not possible at this level (chance 0)</span></div>`;
    if (c.to <= c.from) return `<div class="sen-cost"><span class="k">${h(label)}</span> <span class="muted">nothing (already there)</span></div>`;
    const books = Object.keys(c.books || {}).map(id => bookChip(id, c.books[id])).join(' ');
    return `<div class="sen-cost"><span class="k">${h(label)}</span> +${h(c.from)}→+${h(c.to)}: <b>${short(c.sp)}</b> SP · <b>${short(c.adena)}</b> adena ${books} <span class="muted">(~${h(c.attempts)} tries${c.mode === 'normal' ? ', ' + Math.round(c.pNoFail * 100) + ' % without a fail' : ''})</span></div>`;
  }
  function skillCard(x) {
    const d = S.det, st = (S.cur && S.cur.chars && S.cur.chars[d.name]) || {}, ov = st.routes && st.routes[x.id] !== undefined ? String(st.routes[x.id]) : '';
    const opts = [`<option value=""${ov === '' ? ' selected' : ''}>recommended${x.best ? ' (' + h(x.best.name) + ')' : ''}</option>`]
      .concat((x.routesFull || []).map(r => `<option value="${r.route}"${ov === String(r.route) ? ' selected' : ''}>${h(r.name)}${x.best && x.best.route === r.route ? ' ★' : ''}</option>`))
      .concat([`<option value="0"${ov === '0' ? ' selected' : ''}>never enchant</option>`]).join('');
    const cur = x.haveLevel == null ? '<span class="muted">level unknown</span>' : x.current && x.current.route ? `<b class="sen-have">${h((x.routesFull.find(r => r.route === x.current.route) || {}).name || 'route ' + x.current.route)} +${h(x.current.plus)}</b>` : x.haveMax ? 'max level, not enchanted' : `level ${h(x.haveLevel)} of ${h(x.baseMaxLevel)}`;
    const chips = (x.routes || []).map(r => `<span class="sen-route${x.chosen.route === r.route ? ' on' : ''}${x.best && x.best.route === r.route ? ' best' : ''}" title="${h(r.why)}${r.plus1 ? '\n+1: ' + h(r.plus1) : ''}${r.plusMax ? '\n+' + h(r.maxEnchant) + ': ' + h(r.plusMax) : ''}">${h(r.name)}</span>`).join('');
    const t = x.target, c = x.cost || {};
    const tgt = !x.chosen.route ? '<span class="muted">not enchanted (your choice)</span>' : t ? `up to <b>+${h(t.plus)}</b> of ${h(x.chosen.maxEnchant)} at level ${h(t.atLevel)} (next step ${h(t.nextChance)} %, minimum ${h(t.minChance)} %)` : '';
    const other = x.onOtherRoute ? `<div class="sen-warn">Already enchanted on another route — the bot will not touch it (a route change needs a Giant's Codex - Discipline and loses 0–3 levels).</div>` : '';
    const table = (x.perLevel || []).map(l => `<tr class="${x.target && l.plus <= x.target.plus && l.plus > x.target.from ? 'in' : ''}"><td>+${l.plus}</td><td>${short(l.sp)}</td><td>${short(l.adena)}</td><td>${h(l.chanceNow)} %</td><td class="sen-eff">${h(l.step)}</td></tr>`).join('');
    return `<div class="sen-sk"><div class="hd"><img class="sen-ic lg" src="${ico(x.icon)}" alt=""><div class="nm"><b>${h(x.name)}</b> <span class="sen-kind">${h(KIND_LABEL[x.kind] || x.kind)}</span>
        <div class="muted">max level ${h(x.baseMaxLevel)} (learned at character level ${h(x.getLevel)}) · now: ${cur}</div></div>
        <select class="sen-rsel" data-sen="route" data-id="${x.id}" aria-label="route for ${h(x.name)}">${opts}</select></div>
      <div class="sen-routes">${chips}</div>
      ${x.best ? `<div class="sen-why">★ ${h(x.best.why)}</div>` : ''}${other}
      <div class="sen-tgt">${tgt}</div>${enchBtns(x)}
      ${x.chosen.route ? costLine(c.normalToTarget, 'Normal') + costLine(c.safeToTarget, 'Safe') + `<details class="sen-more" data-sensk="${x.id}"${S.openSk.has(String(x.id)) ? ' open' : ''}><summary>All +levels of ${h(x.chosen.name)} · to +${h(x.chosen.maxEnchant)} at level 85: normal ~${short((c.normalToMax || {}).sp)} SP / ${short((c.normalToMax || {}).adena)} adena, safe ~${short((c.safeToMax || {}).sp)} SP / ${short((c.safeToMax || {}).adena)} adena</summary>
        <div class="sen-tw"><table class="sen-tbl"><thead><tr><th>+</th><th>SP</th><th>adena</th><th>chance</th><th>effect</th></tr></thead><tbody>${table}</tbody></table></div></details>` : ''}
    </div>`;
  }
  // MANUAL-ONLY 2026-10-12: one attempt per order (user rule: enchanting is never automatic). The bot re-checks everything (senDecide).
  function nextStep(x) {
    if (!x.chosen || !x.chosen.route || !x.target || x.onOtherRoute) return null;
    const plus = (x.target.from || 0) + 1; if (plus > (x.chosen.maxEnchant || 0)) return null;
    const l = (x.perLevel || []).find(r => r.plus === plus) || null;
    return { plus, chance: l ? l.chanceNow : x.target.nextChance, sp: l ? l.sp : null, adena: l ? l.adena : null };
  }
  function enchBtns(x) {
    const n = nextStep(x); if (!n || !S.det) return '';
    const off = !S.det.eligible ? ' disabled title="' + h(S.det.why.join(' · ')) + '"' : '';
    return `<div class="sen-act"><button data-sen="ench" data-id="${x.id}" data-mode="normal"${off}>Enchant +${n.plus} (normal, ${h(n.chance)} %)…</button><button data-sen="ench" data-id="${x.id}" data-mode="safe"${off}>Safe +${n.plus}…</button></div>`;
  }
  async function enchOrder(id, safe) {
    const d = S.det; if (!d) return;
    const x = d.skills.find(k => String(k.id) === String(id)); const n = x && nextStep(x); if (!n) return;
    const m = safe ? 5 : 1, cmd = '!skillenchant ' + x.id + ' ' + x.chosen.route + (safe ? ' safe' : '') + ' ' + d.name;
    const cost = n.sp != null ? short(n.sp * m) + ' SP · ' + short(n.adena * m) + ' adena' : 'see the table';
    const book = safe ? "a Giant's Codex - Mastery (used up)" : n.plus === 1 ? "a Giant's Codex (used up)" : 'no codex';
    const ok = await uiConfirm({ title: d.name + ': enchant ' + x.name + ' → ' + x.chosen.name + ' +' + n.plus + '?', danger: true,
      body: [uiP('Mode: ' + (safe ? 'Safe (SP and adena ×5)' : 'Normal') + ' · chance ' + n.chance + ' % at level ' + (d.level ?? '?') + ' · cost ' + cost + ' · ' + book),
        uiWarn(safe ? 'A fail keeps the level; SP, adena and the codex are spent.' : 'A fail drops the skill back to its normal level — every + on it is lost.'),
        uiP('Exactly ONE attempt. ' + d.name + ' checks level, class, SP, adena and the book again before it sends anything.'), uiCode(cmd)],
      confirmText: 'Enchant once', cancelText: 'Cancel' });
    if (!ok) return;
    let r = null; try { r = await api('/api/command', { method: 'POST', body: JSON.stringify({ cmd, target: 'char:' + d.name, confirmDanger: true }) }); } catch (e) { r = { error: e.message }; }
    if (r && r.ok) flash('Sent to ' + d.name + ': ' + cmd + '. The result shows in party chat and Logs/skill_enchant.log; tap "Read live skills" after a few seconds.');
    else await uiError((r && r.error) || 'no answer from the dashboard server', 'Not sent');
  }
  function charView() {
    const d = S.det;
    const back = `<a class="sen-back" href="#/skillenchant">← all characters</a>`;
    if (!d) return `${back}<div class="box muted">Loading ${h(S.name)}…</div>`;
    const lvSel = `<select data-sen="level" aria-label="price at level">${[76, 77, 78, 79, 80, 81, 82, 83, 84, 85].map(l => `<option value="${l}"${d.pricedAt === l ? ' selected' : ''}>level ${l}</option>`).join('')}</select>`;
    const q = S.filter.toLowerCase();
    const list = d.skills.filter(x => !q || x.name.toLowerCase().includes(q) || (x.kind || '').includes(q));
    const tb = d.totals || {}, books = Object.keys(tb.books || {}).map(id => bookChip(id, tb.books[id])).join(' ');
    return `${back}<div class="box sen-ch"><h3><span>${h(d.name)}</span> <span class="muted">L${h(d.level ?? '?')} ${h(d.cls || '')} → ${h(d.targetName || '?')} · ${h(d.role)}</span></h3>
      <div>${d.eligible ? '<span class="sen-ok">Can enchant now.</span>' : `<span class="sen-wait">${h(d.why.join(' · '))}</span>`} <span class="sen-manual">Manual only</span></div>
      <div class="sen-kv">SP: <b>${fmt(d.sp)}</b> · adena: <b>${fmt(d.adena)}</b> · skill levels: ${d.liveSrc ? h(d.liveSrc) : '<span class="muted">unknown</span>'}${d.liveErr ? ' <span class="bad">(' + h(d.liveErr) + ')</span>' : ''}</div>
      <div class="sen-tools"><label>Price at ${lvSel}</label><button data-sen="live">Read live skills</button><input class="sen-filter" type="search" placeholder="Filter skills" data-sen="filter" value="${h(S.filter)}"></div>
      <div class="sen-kv">All ${h(d.skills.filter(x => x.chosen.route).length)} chosen routes up to their target (normal, expected): <b>${short(tb.sp)}</b> SP · <b>${short(tb.adena)}</b> adena ${books}</div>
      <div class="sen-hint">Skills by importance for a ${h(d.role)} (first = recommended first). Nothing is enchanted without your order. Tap a route name for its effect; ★ = recommended.</div></div>
      <div class="sen-list">${list.map(skillCard).join('') || '<div class="box muted">This class path has no enchantable skills.</div>'}</div>`;
  }
  function renderBar() {
    const b = $id('senBar'); if (!b) return;
    const on = dirty(); b.hidden = !on;
    if (on) b.innerHTML = `<div class="sum">Unsaved changes</div><div class="btns"><button data-sen="undo">Undo</button><button class="primary" data-sen="save"${S.busy ? ' disabled' : ''}>Save</button></div>`;
  }

  // ============================================================================================ events
  function setChar(name, fn) { S.cur.chars = S.cur.chars || {}; const c = S.cur.chars[name] = S.cur.chars[name] || {}; fn(c); if (!Object.keys(c).length || (Object.keys(c).length === 1 && c.routes && !Object.keys(c.routes).length)) delete S.cur.chars[name]; }
  function onChange(e) {
    const t = e.target; if (!t || !t.dataset) return;
    const k = t.dataset.sen; if (!k || !S.cur) return;
    if (k === 'auto') { S.cur.auto = !!t.checked; render(); return; }
    if (k === 'minChance' || k === 'reserveAdena' || k === 'maxTriesPerVisit') {
      let v = String(t.value).trim().toLowerCase().replace(/[\s,_]/g, ''); const m = v.match(/^(\d+(?:\.\d+)?)([km]?)$/);
      if (!m) { t.classList.add('bad'); return; } t.classList.remove('bad');
      S.cur[k] = Math.round(Number(m[1]) * ({ '': 1, k: 1e3, m: 1e6 })[m[2]]); renderBar(); return;
    }
    if (k === 'charAuto') { const n = t.dataset.name; setChar(n, c => { if (t.value === 'off') c.auto = false; else delete c.auto; }); renderBar(); return; }
    if (k === 'route') { const id = t.dataset.id; setChar(S.det.name, c => { c.routes = c.routes || {}; if (t.value === '') delete c.routes[id]; else c.routes[id] = Number(t.value); if (!Object.keys(c.routes).length) delete c.routes; }); renderBar(); return; }
    if (k === 'level') { S.level = Number(t.value) || 0; loadDetail(S.live); return; }
    if (k === 'filter') { S.filter = t.value || ''; render(); }
  }
  async function onClick(e) {
    const t = e.target.closest('[data-sen]'); if (!t) return;
    const k = t.dataset.sen;
    if (k === 'live') { S.live = true; t.disabled = true; flash('Reading the skills from the game…'); await loadDetail(true); return; }
    if (k === 'undo') { S.cur = clone(S.orig); render(); return; }
    if (k === 'ench') { if (!t.disabled) await enchOrder(t.dataset.id, t.dataset.mode === 'safe'); return; }
    if (k === 'save') { await save(); }
  }
  async function save() {
    if (!dirty() || S.busy) return;
    const ch = [];
    ['minChance', 'reserveAdena', 'maxTriesPerVisit'].forEach(k => { if (S.cur[k] !== S.orig[k]) ch.push(`${k}: ${S.orig[k]} → ${S.cur[k]}`); });
    const names = new Set(Object.keys(S.cur.chars || {}).concat(Object.keys(S.orig.chars || {})));
    names.forEach(n => { if (JSON.stringify((S.cur.chars || {})[n] || {}) !== JSON.stringify((S.orig.chars || {})[n] || {})) ch.push(`${n}: ${JSON.stringify((S.cur.chars || {})[n] || 'default')}`); });
    const ok = await uiConfirm({ title: 'Save the skill enchant settings?', body: [uiList(ch.slice(0, 20).concat(ch.length > 20 ? [`… and ${ch.length - 20} more`] : [])), uiP('Only the recommendation changes; nothing is enchanted by itself.')], confirmText: 'Save', cancelText: 'Cancel' });
    if (!ok) return;
    S.busy = true; renderBar();
    let d = null; try { d = await api('/api/skillenchant', { method: 'POST', body: JSON.stringify({ settings: S.cur, rev: S.rev }) }); } catch (er) { d = { error: er.message }; }
    S.busy = false;
    if (d && d.conflict) {
      const over = await uiConfirm({ title: 'Changed meanwhile', body: [uiWarn('Someone else saved the skill enchant settings after this page loaded them.'), uiP('Overwrite them with your version?')], confirmText: 'Overwrite', cancelText: 'Cancel', danger: true });
      if (over) { S.rev = d.rev; return save(); }
      renderBar(); return;
    }
    if (!d || !d.ok) { renderBar(); await uiError((d && d.error) || 'no answer from the dashboard server', 'Not saved'); return; }
    S.rev = d.rev; S.orig = clone(d.settings); S.cur = clone(d.settings);
    flash(`Saved. Plan rebuilt for ${d.plan} characters.`);
    await loadInfo(); if (S.name) loadDetail(S.live);
  }

  // ============================================================================================ character page box (#/char/<Name>)
  const CB = { name: '', at: 0, d: null, busy: false };
  const charName = () => { const m = /^#\/char\/([^/]+)/.exec(location.hash); return m ? decodeURIComponent(m[1]) : ''; };
  async function charBox() {
    const name = charName(); if (!name) return;
    const orders = document.querySelector('.cp-orders'); if (!orders || !orders.offsetParent) return;
    let b = document.getElementById('senCharBox');
    if (!b || b.parentElement !== orders.parentElement) { if (b) b.remove(); b = document.createElement('div'); b.id = 'senCharBox'; b.className = 'box cp-box sen-cbox'; orders.parentElement.insertBefore(b, orders); }
    if (CB.busy) return;
    if (CB.name !== name || Date.now() - CB.at > 60000) {
      CB.busy = true;
      try { const d = await api('/api/skillenchant?name=' + encodeURIComponent(name)); CB.d = d && !d.error ? d : null; } catch (e) { CB.d = null; }
      CB.name = name; CB.at = Date.now(); CB.busy = false;
    }
    const d = CB.d;
    const html = !d ? `<h3><span>Skill enchant</span></h3><div class="muted">No skill enchant data (the dashboard server may need a restart).</div>`
      : `<h3><span>Skill enchant</span><a style="margin-left:auto" href="#/skillenchant/${encodeURIComponent(name)}">open →</a></h3>
        <div>${d.eligible ? '<span class="sen-ok">Can enchant now.</span>' : `<span class="sen-wait">${h(d.why.join(' · '))}</span>`} <span class="muted">${h(d.skills.length)} enchantable skills as ${h(d.targetName || '?')}</span></div>
        <div class="sen-tp">${d.skills.filter(x => x.chosen.route).slice(0, 6).map(x => `<span class="sen-mini"><img class="sen-ic" src="${ico(x.icon)}" alt="">${h(x.name)} → <b>${h(x.chosen.name)}</b></span>`).join('')}</div>`;
    if (b.__html !== html) { b.innerHTML = html; b.__html = html; }
  }
  setInterval(() => { if (charName() && !document.hidden) charBox().catch(() => { }); }, 3000);
  window.addEventListener('hashchange', () => setTimeout(() => charBox().catch(() => { }), 800));

  window.SkillEnchantPage = { route, open, close, _state: S };
})();
