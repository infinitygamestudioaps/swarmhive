// ADENA page #/adena (user 2026-10-12: "the adena from another party should be 100% customizable, not something we can assume").
// Edits Scripts/data/fund_rules.json (the bots' CROSS-TEAM FUNDING, swarm.js fundRules(), re-read every 30 s): on/off, town, timing, who gives,
// default targets, per party (receives, leader / member target) and per character (own target; 0 = never receives). Live adena per character
// and the last hand-outs (Logs/fund_log.json). Data: Dashboard/fundpage_api.js (GET/POST /api/fundrules).
// Uses index.html globals: esc, api, iconUrl, stopChar, TAB, and uidialog's uiConfirm / uiAlert / uiList / uiP / uiWarn. No browser alert / confirm / prompt.
(function () {
  'use strict';
  const SEC = 'tab-fundpage';
  const FP = { open: false, info: null, orig: null, cur: null, rev: '', err: {}, raw: {}, pending: false, busy: false, timer: 0, msgT: 0, openParties: new Set() };
  const $id = (i) => document.getElementById(i);
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const ico = (p) => (typeof iconUrl === 'function' ? iconUrl(p) : '/icons/' + p + '.png');
  const clone = (o) => JSON.parse(JSON.stringify(o == null ? {} : o));
  const fmt = (n) => n == null || n === '' || !isFinite(Number(n)) ? '' : Number(n).toLocaleString('en-US');
  const short = (n) => { n = Number(n); if (!isFinite(n)) return ''; const a = Math.abs(n); return a >= 1e9 ? +(n / 1e9).toFixed(2) + 'b' : a >= 1e6 ? +(n / 1e6).toFixed(2) + 'm' : a >= 1e3 ? +(n / 1e3).toFixed(1) + 'k' : String(n); };
  const DEF = { on: true, town: 'Giran', everyMin: 30, minGive: 200000, slack: 500000, brokeBelow: 500000, givers: { mode: 'auto', list: [], keepAtLeast: 30000000 },
    defaults: { leaderTarget: 8000000, memberTarget: 3000000, clanLeaderTarget: 12000000 }, parties: {}, chars: {} };

  /** "8m" | "300k" | "8,000,000" -> number; '' -> null; bad -> NaN (same rules as fundpage_api.js parseAmount) */
  function parseAmount(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    const s = String(v).trim().toLowerCase().replace(/[\s,_']/g, '');
    if (!s) return null;
    const m = s.match(/^(-?\d+(?:\.\d+)?)([kmb]?)$/); if (!m) return NaN;
    return Math.round(Number(m[1]) * ({ '': 1, k: 1e3, m: 1e6, b: 1e9 })[m[2]]);
  }
  /** the rules with every missing field filled (what the bots assume) */
  function normalize(r) {
    const o = Object.assign(clone(DEF), clone(r || {}));
    o.givers = Object.assign(clone(DEF.givers), (r && r.givers) || {}); if (!Array.isArray(o.givers.list)) o.givers.list = [];
    o.defaults = Object.assign(clone(DEF.defaults), (r && r.defaults) || {});
    if (!o.parties || typeof o.parties !== 'object') o.parties = {};
    if (!o.chars || typeof o.chars !== 'object') o.chars = {};
    return o;
  }
  const comparable = (r) => { const o = clone(r); delete o._updated; return JSON.stringify(o); };
  const dirty = () => FP.cur && FP.orig && comparable(FP.cur) !== comparable(FP.orig);
  const errCount = () => Object.keys(FP.err).length;

  // ============================================================================================ data
  async function load(keepEdits) {
    let d = null;
    try { d = await api('/api/fundrules'); } catch (e) { flash('The dashboard server has no Adena API yet (it needs a restart).', true); render(); return; }
    if (!d || d.error) { flash((d && d.error) || 'no answer', true); render(); return; }
    if (d.broken) flash(`fund_rules.json does not parse (${d.broken}) — saving is blocked until it is fixed or restored from Scripts/data/history/.`, true);
    FP.info = d;
    if (!keepEdits || !dirty()) { FP.orig = normalize(d.rules); FP.cur = clone(FP.orig); FP.rev = d.rev; FP.err = {}; }
    else if (d.rev !== FP.rev) flash('Someone else saved the adena rules meanwhile. Undo your changes to see theirs, or save to overwrite (you will be asked).', true);
    render();
  }

  // ============================================================================================ page frame
  function section() {
    let s = $id(SEC); if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win cpl fnd'; s.hidden = true;
    // PURSE 2026-10-13 (tester: "the Adena tab sounds like it is for giving to a DIFFERENT party"): two separate blocks in plain words —
    // (1) inside the party: the leader pays his members' gear (parties.<leader>.purse + memberKeep), (2) between parties: the old hand-outs
    s.innerHTML = `<div class="cpl-headrow fnd-head"><h2><img class="gi" src="${ico('icon/etc_adena_i00')}" alt=""> Adena</h2>
        <span class="muted cpl-intro" id="fndIntro"></span></div>
      <div class="cpl-msg" id="fndMsg" role="status" hidden></div>
      <div class="box fnd-blk" id="fndBlk1"><h3>1 · Inside the party — the leader pays his members' gear and supplies</h3>
        <div class="fnd-hint" id="fndPurseEx"></div>
        <div class="fnd-parties" id="fndPurse"></div>
        <details class="fnd-more fnd-keep"><summary>Pocket money each character keeps when it buys gear <span class="muted">(all parties)</span></summary>
          <div class="fnd-hint">A character never spends this on gear (it is for scrolls and repairs). Low levels keep little, so their first gear is affordable.</div><div class="fnd-grid" id="fndKeep"></div></details>
      </div>
      <div class="box fnd-blk" id="fndBlk2"><h3>2 · Between parties — a rich character of one party helps another party</h3>
        <div class="fnd-hint" id="fndBetweenEx"></div>
        <label class="fnd-sw" title="Switch the hand-outs between parties on or off for every bot"><input type="checkbox" id="fndOn" data-fnd="on"><span class="tr" aria-hidden="true"></span><span class="lb" id="fndOnTxt"></span></label>
        <h4>General</h4><div class="fnd-grid" id="fndGen"></div>
        <h4>Who gives</h4><div id="fndGive"></div>
        <h4>Targets</h4><div class="fnd-hint">A character is topped up to its target when it has more than the slack less. A character's own target beats its party's, the party's beats these defaults.</div><div class="fnd-grid" id="fndDef"></div>
        <h4>Per party</h4><div class="fnd-hint">Blank = the default above. Open a party for its characters: blank = party / default, <b>0 = never receives</b>.</div><div class="fnd-parties" id="fndParties"></div>
        <h4>Recent hand-outs</h4><div id="fndLog"></div>
      </div>
      <details class="box cpl-help"><summary><h3>How it works</h3></summary><div class="cpl-helpbody">
        <p><b>1 · Inside the party.</b> With "Leader pays" on, the party leader trades each member the difference between its planned gear upgrades (+ its pocket money) and the adena it has — in Giran, before anybody shops: in supply runs, with "Better gear now" and with "Give it now". Then the members buy, then the leader buys his own. He never goes below "keeps at least" and gives at most "at most per member" (and "at most per run" for the whole party). Supplies (shots, scrolls, potions) the leader buys himself in the supply run and hands out. Off = nothing is paid; a member that cannot afford its gear shows a "Needs you" card on the Parties tab.</p>
        <p><b>2 · Between parties.</b> A giver (a party leader that has more than "always keeps at least", or only the characters you tick) who stands in the chosen town outside a raid hands adena to characters of <b>other</b> parties that are in the same town at that moment and more than the slack below their target. Nobody is called away from hunting for it. Each character gets at most one hand-out per "every" minutes, never less than the minimum hand-out. "Broke below": characters under this amount go first.</p>
        <p>Amounts accept <code>8m</code>, <code>300k</code>, <code>8,000,000</code>. Saving writes Scripts/data/fund_rules.json (a copy of the old one goes to Scripts/data/history/); the bots read it within 30 seconds, no restart.</p>
      </div></details>
      <div class="fnd-bar" id="fndBar"></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('change', onChange);
    s.addEventListener('input', onInput);
    s.addEventListener('focusout', () => { if (FP.pending) softRender(); });
    s.addEventListener('toggle', (e) => { const d = e.target; if (d && d.dataset && d.dataset.fndparty) { if (d.open) FP.openParties.add(d.dataset.fndparty); else FP.openParties.delete(d.dataset.fndparty); } }, true);
    return s;
  }
  function route(kind) {
    if (kind === 'adena') { open(); return true; }
    close(); return false;
  }
  function open() {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'adena'; } catch (e) { }
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'adena')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    const was = FP.open; s.hidden = false; FP.open = true;
    if (!was) window.scrollTo(0, 0);
    if (!FP.timer) FP.timer = setInterval(() => { if (FP.open && !document.hidden) refreshLive(); }, 30000);
    render(); load(true);
  }
  function close() {
    if (!FP.open) return;
    FP.open = false; clearInterval(FP.timer); FP.timer = 0;
    const s = $id(SEC); if (s) s.hidden = true;
  }
  function flash(t, bad) {
    const m = $id('fndMsg'); if (!m) return;
    m.hidden = !t; m.className = 'cpl-msg' + (bad ? ' bad' : ''); m.textContent = t || '';
    clearTimeout(FP.msgT); FP.msgT = setTimeout(() => { const x = $id('fndMsg'); if (x) x.hidden = true; }, bad ? 15000 : 7000);
  }
  /** the 30 s refresh: live adena + log; the parts with inputs are only redrawn when nothing is being typed there */
  async function refreshLive() {
    let d = null; try { d = await api('/api/fundrules'); } catch (e) { return; }
    if (!d || d.error || !FP.open) return;
    FP.info = d;
    if (!dirty() && d.rev !== FP.rev) { FP.orig = normalize(d.rules); FP.cur = clone(FP.orig); FP.rev = d.rev; FP.err = {}; }
    const typing = document.activeElement && $id(SEC) && $id(SEC).contains(document.activeElement) && /^(INPUT|SELECT)$/.test(document.activeElement.tagName);
    if (typing) { renderLog(); return; }
    render();
  }

  // ============================================================================================ helpers
  const allMembers = () => { const out = []; ((FP.info && FP.info.parties) || []).forEach(p => p.members.forEach(m => out.push(Object.assign({ party: p.leader }, m)))); return out; };
  const clanLeader = () => (FP.info && FP.info.clanLeader) || '';
  const has = (v) => v !== undefined && v !== null && v !== '' && isFinite(Number(v));
  /** the target the bots use for this character (swarm.js fundTarget) + where it comes from */
  function targetOf(name, party) {
    const r = FP.cur, c = r.chars[name], p = r.parties[party] || {}, d = r.defaults;
    if (c && has(c.target)) return { v: Number(c.target), from: 'own' };
    if (name === clanLeader()) return { v: Number(d.clanLeaderTarget), from: 'clan leader default' };
    if (name === party) return has(p.leaderTarget) ? { v: Number(p.leaderTarget), from: 'party' } : { v: Number(d.leaderTarget), from: 'leader default' };
    return has(p.memberTarget) ? { v: Number(p.memberTarget), from: 'party' } : { v: Number(d.memberTarget), from: 'member default' };
  }
  const receives = (party) => !FP.cur.parties[party] || FP.cur.parties[party].receive !== false;
  /** an amount input; path = 'a|b|c' into FP.cur */
  function amountInput(pathStr, value, opt = {}) {
    const bad = FP.err[pathStr];
    return `<input type="text" class="fnd-amt ${bad ? 'bad' : ''}" data-fndpath="${h(pathStr)}" value="${h(bad ? (FP.raw[pathStr] || '') : has(value) ? fmt(value) : '')}" placeholder="${h(opt.ph || '')}"
      autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text" ${opt.blank ? 'data-blank="1"' : ''} aria-label="${h(opt.label || pathStr)}"${bad ? ` aria-invalid="true" title="${h(bad)}"` : ''}>`;
  }
  function field(label, inner, hint) { return `<label class="fnd-f"><span class="fl">${h(label)}</span>${inner}${hint ? `<span class="fh">${hint}</span>` : ''}</label>`; }

  // ============================================================================================ render
  function render() {
    if (!FP.open) return;
    if (!FP.cur) { ['fndPurse', 'fndKeep', 'fndGen', 'fndGive', 'fndDef', 'fndParties', 'fndLog'].forEach(i => { const e = $id(i); if (e) e.innerHTML = '<div class="muted">Loading…</div>'; }); renderBar(); return; }
    renderHead(); renderPurse(); renderKeep(); renderGen(); renderGive(); renderDef(); renderParties(); renderLog(); renderBar();
  }
  function renderHead() {
    const r = FP.cur, on = $id('fndOn');
    if (on) on.checked = !!r.on;
    const t = $id('fndOnTxt'); if (t) { t.textContent = r.on ? 'Between parties: on' : 'Between parties: off — nothing happens until you switch it on'; t.className = 'lb ' + (r.on ? 'on' : 'off'); }
    const i = $id('fndIntro'); if (i) i.innerHTML = 'Two separate kinds of help, each with its own switches: <b>1 · inside a party</b> (the leader pays his own members\' gear) and <b>2 · between parties</b> (a rich character helps another party).';
    const ex = examplePeople();
    const e1 = $id('fndPurseEx'); if (e1) e1.innerHTML = `Example: <b>${h(ex.leader)}</b> (${h(ex.leaderAdena)}) pays <b>${h(ex.member)}</b> the 52k its D-grade armour costs, before anybody shops in Giran. One switch per party — off until you switch it on.`;
    const e2 = $id('fndBetweenEx'); if (e2) e2.innerHTML = `Example: <b>${h(ex.rich)}</b> (${h(ex.richAdena)}, another party) tops <b>${h(ex.poor)}</b> up to 8m when both stand idle in <b>${h(r.town)}</b>.`;
  }
  // PURSE 2026-10-13: names for the examples (real ones when known)
  function examplePeople() {
    const P = (FP.info && FP.info.parties) || [], adOf = (p, n) => { const m = (p.members || []).find(x => x.name === n); return m && m.adena != null ? Number(m.adena) : null; };
    const p1 = P.find(p => (p.members || []).some(m => m.name !== p.leader && m.purse && m.purse.need > 0)) || P.find(p => (p.members || []).length > 1) || P[0];
    const leader = p1 ? p1.leader : 'JadeLeader', member = p1 ? ((p1.members || []).find(m => m.name !== p1.leader) || { name: 'JadeTwo' }).name : 'JadeTwo';
    const la = p1 ? adOf(p1, leader) : null;
    const rich = P.slice().sort((a, b) => (adOf(b, b.leader) || 0) - (adOf(a, a.leader) || 0))[0], poor = P.find(p => !rich || p.leader !== rich.leader);
    return { leader, member, leaderAdena: la != null ? short(la) : '37m', rich: rich ? rich.leader : 'a rich leader', richAdena: rich && adOf(rich, rich.leader) != null ? short(adOf(rich, rich.leader)) : '120m', poor: poor ? poor.leader : 'JadeLeader' };
  }
  const PURSE_DEF = { leaderKeep: 2000000, memberCap: 5000000 };
  const KEEP_DEF = [[20, 5000], [40, 50000], [60, 150000], [999, 300000]];
  const purseOf = (leader) => { const p = FP.cur.parties[leader]; return p && p.purse && typeof p.purse === 'object' ? p.purse : {}; };
  function renderPurse() {
    const el = $id('fndPurse'); if (!el) return;
    const P = (FP.info && FP.info.parties) || [];
    el.innerHTML = P.map(p => {
      const L = p.leader, pu = purseOf(L), on = pu.on === true, lead = (p.members || []).find(m => m.name === L) || {};
      const keep = has(pu.leaderKeep) ? Number(pu.leaderKeep) : PURSE_DEF.leaderKeep, spare = Math.max(0, (Number(lead.adena) || 0) - keep);
      const needs = (p.members || []).filter(m => m.name !== L && m.purse && !m.purse.lock && m.purse.need > 0);
      const rows = needs.map(m => `<div class="fnd-need-row"><span><b>${h(m.name)}</b> needs <b>${fmt(m.purse.need)}</b> for its ${m.purse.grade && m.purse.grade !== 'NONE' ? h(m.purse.grade) + '-grade ' : ''}gear <span class="muted">(has ${fmt(m.adena || 0)}, keeps ${fmt(m.purse.keep)})</span></span>${!on && m.purse.need <= spare ? `<button type="button" class="fnd-give" data-quick="party:${h(L)}|!purse give ${h(m.name)}|${h(L)} gives ${h(m.name)} ${fmt(m.purse.need)} adena now (in Giran), then ${h(m.name)} buys its upgrades">Give it now</button>` : on ? '<span class="muted">paid at the next supply run / "Better gear now"</span>' : `<span class="muted">${h(L)} cannot spare it</span>`}</div>`).join('');
      return `<div class="fnd-party ${on ? '' : 'off'}">
        <div class="ph"><b>Party ${h(L)}</b><span class="muted">${lead.adena != null ? 'leader has ' + short(lead.adena) : 'leader not reporting'}${needs.length ? ` · <span class="fnd-need">${needs.length} need gear money</span>` : ''}</span>
          <label class="fnd-sw sm"><input type="checkbox" data-fndpurse="${h(L)}" ${on ? 'checked' : ''}><span class="tr" aria-hidden="true"></span><span class="lb ${on ? 'on' : 'off'}">${on ? 'Leader pays' : 'Leader pays: off'}</span></label></div>
        <div class="fnd-grid sm">${field('Leader keeps at least', amountInput('parties|' + L + '|purse|leaderKeep', pu.leaderKeep, { blank: true, ph: 'default ' + short(PURSE_DEF.leaderKeep), label: L + ' leader keeps at least' }))}
          ${field('At most per member', amountInput('parties|' + L + '|purse|memberCap', pu.memberCap, { blank: true, ph: 'default ' + short(PURSE_DEF.memberCap), label: L + ' at most per member' }), '0 = no limit')}
          ${field('At most per run', amountInput('parties|' + L + '|purse|budget', pu.budget, { blank: true, ph: 'no limit', label: L + ' at most per run' }), 'whole party; 0 = no limit')}</div>
        ${rows || '<div class="muted fnd-cnt">Nobody of this party misses adena for its planned gear right now.</div>'}
      </div>`;
    }).join('') || '<div class="muted">No parties in swarm.config.json.</div>';
  }
  function renderKeep() {
    const el = $id('fndKeep'); if (!el) return;
    const t = Array.isArray(FP.cur.memberKeep) && FP.cur.memberKeep.length ? FP.cur.memberKeep : KEEP_DEF;
    el.innerHTML = t.map((x, i) => { const from = i ? t[i - 1][0] : 1, lab = i === t.length - 1 ? `Level ${from}+` : `Level ${from}–${x[0] - 1}`; return field(lab, amountInput('memberKeep|' + i + '|1', x[1], { label: 'pocket money ' + lab })); }).join('');
  }
  function renderGen() {
    const el = $id('fndGen'); if (!el) return;
    const r = FP.cur, towns = (FP.info && FP.info.towns) || ['Giran'];
    el.innerHTML = field('Town', `<select data-fnd="town" aria-label="town">${towns.map(t => `<option value="${h(t)}" ${t === r.town ? 'selected' : ''}>${h(t)}</option>`).join('')}</select>`, 'where the hand-outs happen')
      + field('Every (min)', amountInput('everyMin', r.everyMin, { label: 'every minutes' }), 'per character, between two hand-outs')
      + field('Minimum hand-out', amountInput('minGive', r.minGive, { label: 'minimum hand-out' }), 'smaller gaps are not topped up')
      + field('Top-up slack', amountInput('slack', r.slack, { label: 'top-up slack' }), 'only when more than this below target')
      + field('Broke below', amountInput('brokeBelow', r.brokeBelow, { label: 'broke below' }), 'these characters go first');
  }
  function renderGive() {
    const el = $id('fndGive'); if (!el) return;
    const g = FP.cur.givers, P = (FP.info && FP.info.parties) || [], L = new Set(g.list);
    const radio = (v, label, hint) => `<label class="fnd-radio ${g.mode === v ? 'on' : ''}"><input type="radio" name="fndMode" value="${v}" data-fnd="mode" ${g.mode === v ? 'checked' : ''}><span><b>${h(label)}</b><span class="fh">${h(hint)}</span></span></label>`;
    const chip = (m, isLeader) => `<button type="button" class="trd-chip fnd-chip ${L.has(m.name) ? 'on' : ''}" data-fndgiver="${h(m.name)}" aria-pressed="${L.has(m.name)}" ${g.mode === 'list' ? '' : 'disabled'}>
        <span class="dot ${m.online ? 'on' : ''}" title="${m.online ? 'online' : 'offline'}"></span>${h(m.name)}${m.adena != null ? `<span class="lv">${short(m.adena)}</span>` : ''}${isLeader ? '' : `<span class="lv">· ${h(m.party)}</span>`}</button>`;
    const leaders = P.map(p => Object.assign({ party: p.leader }, p.members.find(m => m.name === p.leader) || { name: p.leader }));
    const others = allMembers().filter(m => m.name !== m.party);
    const known = new Set(allMembers().map(m => m.name)), stray = g.list.filter(n => !known.has(n));
    el.innerHTML = `<div class="fnd-modes" role="radiogroup" aria-label="who gives">${radio('auto', 'Any rich party leader', 'every party leader that has more than the amount below')}${radio('list', 'Only these characters', 'tick them below')}${radio('none', 'Nobody', 'no hand-outs at all')}</div>
      <div class="fnd-givers ${g.mode === 'list' ? '' : 'dim'}">
        <div class="fnd-sub">Party leaders</div><div class="trd-row">${leaders.map(m => chip(m, true)).join('')}</div>
        <details class="fnd-more" ${others.some(m => L.has(m.name)) ? 'open' : ''}><summary>Other characters (${others.length})</summary><div class="trd-row">${others.map(m => chip(m, false)).join('')}</div></details>
        ${stray.length ? `<div class="fnd-sub">Not in any party now</div><div class="trd-row">${stray.map(n => chip({ name: n, party: '?' }, false)).join('')}</div>` : ''}
        <div class="muted fnd-cnt">${g.list.length} ticked</div>
      </div>
      <div class="fnd-grid">${field('Always keeps at least', amountInput('givers|keepAtLeast', g.keepAtLeast, { label: 'giver always keeps at least' }), 'a giver never goes below this')}</div>`;
  }
  function renderDef() {
    const el = $id('fndDef'); if (!el) return;
    const d = FP.cur.defaults, CL = clanLeader();
    el.innerHTML = field('Party leader', amountInput('defaults|leaderTarget', d.leaderTarget, { label: 'default leader target' }), 'buys the party\'s supplies')
      + field('Member', amountInput('defaults|memberTarget', d.memberTarget, { label: 'default member target' }), 'its own gear')
      + field('Clan leader', amountInput('defaults|clanLeaderTarget', d.clanLeaderTarget, { label: 'default clan leader target' }), CL ? h(CL) : 'clan leader');
  }
  function memberRow(m, party) {
    const r = FP.cur, t = targetOf(m.name, party), own = r.chars[m.name], on = receives(party);
    const never = t.v === 0, below = m.adena != null && t.v > 0 && m.adena < t.v - Number(r.slack || 0);
    const st = !on ? '<span class="cpl-stc unk">party off</span>' : never ? '<span class="cpl-stc unk">never</span>' : m.adena == null ? '<span class="cpl-stc unk">no report</span>'
      : below ? `<span class="cpl-stc warn" title="${fmt(t.v - m.adena)} below target">needs ${short(t.v - m.adena)}</span>` : '<span class="cpl-stc ok">ok</span>';
    const tags = [m.name === party ? 'leader' : '', m.name === clanLeader() ? 'clan leader' : ''].filter(Boolean).join(', ');
    return `<div class="fnd-mem">
      <div class="who"><span class="dot ${m.online ? 'on' : ''}" title="${m.online ? 'online' : 'offline'}"></span><b>${h(m.name)}</b>${m.level ? `<span class="lv">${m.level}</span>` : ''}${tags ? `<span class="lv">${h(tags)}</span>` : ''}${m.town ? `<span class="lv">· ${h(m.town)}</span>` : ''}</div>
      <div class="ad"><img class="gi" src="${ico('icon/etc_adena_i00')}" alt=""> ${m.adena != null ? fmt(m.adena) : '—'} <span class="tg">target ${fmt(t.v)} <em>(${h(t.from)})</em></span> ${st}</div>
      <div class="in">${amountInput('chars|' + m.name + '|target', own ? own.target : null, { blank: true, ph: t.from === 'own' ? '' : short(targetOf(m.name, party).v), label: m.name + ' own target' })}</div>
    </div>`;
  }
  function renderParties() {
    const el = $id('fndParties'); if (!el) return;
    const r = FP.cur, P = (FP.info && FP.info.parties) || [], d = r.defaults;
    const known = new Set(P.map(p => p.leader)), extra = Object.keys(r.parties).filter(k => !known.has(k));
    const card = (leader, members) => {
      const p = r.parties[leader] || {}, on = receives(leader);
      const needs = members.filter(m => { const t = targetOf(m.name, leader); return on && t.v > 0 && m.adena != null && m.adena < t.v - Number(r.slack || 0); }).length;
      const total = members.reduce((a, m) => a + (Number(m.adena) || 0), 0);
      return `<div class="fnd-party ${on ? '' : 'off'}">
        <div class="ph"><b>Party ${h(leader)}</b><span class="muted">${members.length} char${members.length === 1 ? '' : 's'}${members.length ? ' · ' + short(total) + ' adena' : ''}${needs ? ` · <span class="fnd-need">${needs} below target</span>` : ''}</span>
          <label class="fnd-sw sm"><input type="checkbox" data-fndrecv="${h(leader)}" ${on ? 'checked' : ''}><span class="tr" aria-hidden="true"></span><span class="lb ${on ? 'on' : 'off'}">${on ? 'Receives' : 'Receives nothing'}</span></label></div>
        <div class="fnd-grid sm">${field('Leader target', amountInput('parties|' + leader + '|leaderTarget', p.leaderTarget, { blank: true, ph: 'default ' + short(d.leaderTarget), label: leader + ' party leader target' }))}
          ${field('Member target', amountInput('parties|' + leader + '|memberTarget', p.memberTarget, { blank: true, ph: 'default ' + short(d.memberTarget), label: leader + ' party member target' }))}</div>
        ${p.givers && ['auto', 'list', 'none'].includes(p.givers.mode) ? `<div class="muted fnd-cnt">Own givers for this party (party ⚙ Settings → Money): ${p.givers.mode === 'none' ? 'nobody gives' : p.givers.mode === 'auto' ? 'any rich party leader' : (p.givers.list || []).length ? h(p.givers.list.join(', ')) : 'nobody chosen yet — nobody gives'}. The shared "who gives" above does not apply to it.</div>` : ''}
        ${members.length ? `<details class="fnd-mems" data-fndparty="${h(leader)}" ${FP.openParties.has(leader) ? 'open' : ''}><summary>Characters (${members.length})</summary>${members.map(m => memberRow(m, leader)).join('')}</details>` : '<div class="muted fnd-cnt">Not in swarm.config.json now (kept in the file).</div>'}
      </div>`;
    };
    el.innerHTML = P.map(p => card(p.leader, p.members)).join('') + extra.map(k => card(k, [])).join('') || '<div class="muted">No parties in swarm.config.json.</div>';
  }
  function renderLog() {
    const el = $id('fndLog'); if (!el) return;
    const log = ((FP.info && FP.info.log) || []).slice(0, 20);
    if (!log.length) { el.innerHTML = '<div class="muted">No hand-outs recorded yet (Logs/fund_log.json).</div>'; return; }
    const ago = (ms) => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 172800 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
    const when = (ms) => { const d = new Date(ms); return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); };
    el.innerHTML = `<div class="fnd-hint">The last hand-out each character received (one line per character, newest first).</div><div class="fnd-log">${log.map(x => `<div><b>${h(x.name)}</b>${x.party ? `<span class="muted"> · party ${h(x.party)}</span>` : ''}<span class="t" title="${h(when(x.at))}">${h(ago(x.at))} · ${h(when(x.at))}</span></div>`).join('')}</div>`;
  }
  function renderBar() {
    const el = $id('fndBar'); if (!el) return;
    const dt = dirty(), ne = errCount();
    el.innerHTML = `<div class="sum">${!FP.cur ? 'Loading…' : ne ? `<span class="bad">${ne} field${ne === 1 ? '' : 's'} not valid</span>` : dt ? '<b>Unsaved changes</b>' : 'Saved' + (FP.info && FP.info.rules && FP.info.rules._updated ? ` <span class="muted">· ${h(String(FP.info.rules._updated).slice(0, 16).replace('T', ' '))} UTC</span>` : '')}</div>
      <div class="btns"><button data-fnd="undo" ${dt || ne ? '' : 'disabled'}>Undo changes</button><button data-fnd="save" class="go" ${dt && !FP.busy ? '' : 'disabled'}>${FP.busy ? 'Saving…' : 'Save'}</button></div>`;
  }

  // ============================================================================================ events
  function setPath(pathStr, v) {
    const ks = pathStr.split('|'); let o = FP.cur;
    for (let i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    const last = ks[ks.length - 1];
    if (v === null) delete o[last]; else o[last] = v;
    // tidy: an empty character entry / party entry without values is the same as none
    if (ks[0] === 'chars' && ks.length === 3 && FP.cur.chars[ks[1]] && !Object.keys(FP.cur.chars[ks[1]]).length) delete FP.cur.chars[ks[1]];
  }
  /** redraw the parties (derived targets / "needs") — but never while an input of this page has the focus (the phone keyboard would close
   *  and the next field lose its focus): then once the focus leaves the inputs (focusout listener in section()) */
  const typingHere = () => { const a = document.activeElement, s = $id(SEC); return !!(a && s && s.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio'); };
  function softRender() {
    setTimeout(() => {
      if (!FP.open) return;
      if (typingHere()) { FP.pending = true; return; }
      FP.pending = false; const y = window.scrollY; renderPurse(); renderParties(); renderDef(); window.scrollTo(0, y);
    }, 0);
  }
  function onInput(e) {
    const t = e.target; if (!t || !t.dataset || !t.dataset.fndpath) return;
    const p = t.dataset.fndpath, n = parseAmount(t.value), blank = !!t.dataset.blank;
    if (/^memberKeep\|/.test(p) && !Array.isArray(FP.cur.memberKeep)) FP.cur.memberKeep = KEEP_DEF.map(x => x.slice());   // PURSE: the default table, written only once edited
    let bad = '';
    if (n === null && !blank) bad = 'needed';
    else if (n !== null && Number.isNaN(n)) bad = 'not a number (e.g. 8m, 300k, 8000000)';
    else if (n !== null && n < 0) bad = 'must be 0 or more';
    if (bad) { FP.err[p] = bad; FP.raw[p] = t.value; t.classList.add('bad'); t.setAttribute('aria-invalid', 'true'); t.title = bad; }
    else { delete FP.err[p]; t.classList.remove('bad'); t.removeAttribute('aria-invalid'); t.title = ''; setPath(p, n); }
    renderBar();
  }
  function onChange(e) {
    const t = e.target; if (!t) return;
    if (t.dataset.fndpath) {   // blur: show the amount with thousands separators, redraw the derived parts
      if (!FP.err[t.dataset.fndpath]) { const n = parseAmount(t.value); t.value = n === null ? '' : fmt(n); }
      if (/^(chars|parties|defaults|slack|memberKeep)/.test(t.dataset.fndpath)) softRender();
      renderBar(); return;
    }
    const f = t.dataset.fnd;
    if (f === 'on') { FP.cur.on = !!t.checked; renderHead(); renderBar(); return; }
    if (f === 'town') { FP.cur.town = t.value; renderHead(); renderBar(); return; }
    if (f === 'mode') { FP.cur.givers.mode = t.value; renderGive(); renderBar(); return; }
    if (t.dataset.fndpurse) { const k = t.dataset.fndpurse, p0 = FP.cur.parties[k] || {}; FP.cur.parties[k] = Object.assign({}, p0, { purse: Object.assign({}, p0.purse || {}, { on: !!t.checked }) }); renderPurse(); renderBar(); return; }   // PURSE
    if (t.dataset.fndrecv) { const k = t.dataset.fndrecv; FP.cur.parties[k] = Object.assign({}, FP.cur.parties[k] || {}, { receive: !!t.checked }); renderParties(); renderBar(); return; }
  }
  async function onClick(e) {
    const g = e.target.closest('[data-fndgiver]');
    if (g && !g.disabled) { const n = g.dataset.fndgiver, L = FP.cur.givers.list, i = L.indexOf(n); if (i >= 0) L.splice(i, 1); else L.push(n); renderGive(); renderBar(); return; }
    const b = e.target.closest('button[data-fnd]'); if (!b) return;
    if (b.dataset.fnd === 'undo') {
      const ok = await uiConfirm({ title: 'Undo changes?', body: 'Throw away every change on this page since the last save and show the saved rules again.', confirmText: 'Undo changes', cancelText: 'Keep editing' });
      if (!ok) return;
      FP.cur = clone(FP.orig); FP.err = {}; render(); flash('Changes undone.'); return;
    }
    if (b.dataset.fnd === 'save') return save();
  }
  /** the human list of what changes (for the confirm dialog) */
  function changes() {
    const a = FP.orig, b = FP.cur, out = [], amt = (v) => has(v) ? fmt(v) : 'blank';
    if (JSON.stringify(a.memberKeep || null) !== JSON.stringify(b.memberKeep || null)) out.push(`Pocket money by level: ${(b.memberKeep || KEEP_DEF).map(x => fmt(x[1])).join(' / ')}`);   // PURSE
    if (a.on !== b.on) out.push(`Adena hand-outs between parties: ${b.on ? 'ON' : 'OFF'}`);
    if (a.town !== b.town) out.push(`Town: ${a.town} → ${b.town}`);
    [['everyMin', 'Every (min)'], ['minGive', 'Minimum hand-out'], ['slack', 'Top-up slack'], ['brokeBelow', 'Broke below']].forEach(([k, l]) => { if (String(a[k]) !== String(b[k])) out.push(`${l}: ${amt(a[k])} → ${amt(b[k])}`); });
    const MODE = { auto: 'any rich party leader', list: 'only the ticked characters', none: 'nobody' };
    if (a.givers.mode !== b.givers.mode) out.push(`Who gives: ${MODE[b.givers.mode] || b.givers.mode}`);
    if (JSON.stringify(a.givers.list) !== JSON.stringify(b.givers.list)) out.push(`Ticked givers: ${b.givers.list.join(', ') || '(none)'}`);
    if (String(a.givers.keepAtLeast) !== String(b.givers.keepAtLeast)) out.push(`Giver keeps at least: ${amt(a.givers.keepAtLeast)} → ${amt(b.givers.keepAtLeast)}`);
    [['leaderTarget', 'Default leader target'], ['memberTarget', 'Default member target'], ['clanLeaderTarget', 'Default clan leader target']].forEach(([k, l]) => { if (String(a.defaults[k]) !== String(b.defaults[k])) out.push(`${l}: ${amt(a.defaults[k])} → ${amt(b.defaults[k])}`); });
    new Set(Object.keys(a.parties).concat(Object.keys(b.parties))).forEach(k => {
      const x = a.parties[k] || {}, y = b.parties[k] || {};
      const xp = x.purse || {}, yp = y.purse || {};   // PURSE
      if ((xp.on === true) !== (yp.on === true)) out.push(`Party ${k}: leader pays his members' gear ${yp.on === true ? 'ON' : 'OFF'}`);
      [['leaderKeep', 'leader keeps at least'], ['memberCap', 'at most per member'], ['budget', 'at most per run']].forEach(([q, l]) => { if (String(xp[q]) !== String(yp[q])) out.push(`Party ${k} ${l}: ${amt(xp[q])} → ${amt(yp[q])}`); });
      if ((x.receive !== false) !== (y.receive !== false)) out.push(`Party ${k}: ${y.receive === false ? 'receives nothing from other parties' : 'receives from other parties'}`);
      if (String(x.leaderTarget) !== String(y.leaderTarget)) out.push(`Party ${k} leader target: ${amt(x.leaderTarget)} → ${amt(y.leaderTarget)}`);
      if (String(x.memberTarget) !== String(y.memberTarget)) out.push(`Party ${k} member target: ${amt(x.memberTarget)} → ${amt(y.memberTarget)}`);
    });
    new Set(Object.keys(a.chars).concat(Object.keys(b.chars))).forEach(k => {
      const x = (a.chars[k] || {}).target, y = (b.chars[k] || {}).target;
      if (String(x) !== String(y)) out.push(`${k} own target: ${amt(x)} → ${has(y) ? (Number(y) === 0 ? '0 (never receives)' : fmt(y)) : 'blank (party / default)'}`);
    });
    return out;
  }
  async function save() {
    if (FP.busy || !FP.cur) return;
    const errs = Object.keys(FP.err);
    if (errs.length) { await uiAlert({ title: 'Some amounts are not valid', kind: 'error', body: [uiP('Fix the fields marked red first (amounts: 0 or more, e.g. 8m, 300k, 8000000):'), uiList(errs.map(p => `${p.replace(/\|/g, ' › ')}: ${FP.err[p]}`))] }); return; }
    const ch = changes();
    if (!ch.length) { flash('Nothing changed.'); return; }
    const ok = await uiConfirm({ title: 'Save the adena rules?', body: [uiP(`${ch.length} change${ch.length === 1 ? '' : 's'}:`), uiList(ch.slice(0, 30).concat(ch.length > 30 ? [`… and ${ch.length - 30} more`] : [])), uiP('Every bot reads the new rules within 30 seconds.')], confirmText: 'Save', cancelText: 'Cancel' });
    if (!ok) return;
    FP.busy = true; renderBar();
    let d = null;
    try { d = await api('/api/fundrules', { method: 'POST', body: JSON.stringify({ rules: FP.cur, rev: FP.rev }) }); } catch (e) { d = { error: e.message }; }
    FP.busy = false;
    if (d && d.conflict) {
      const over = await uiConfirm({ title: 'Changed meanwhile', body: [uiWarn('Someone else saved the adena rules after this page loaded them.'), uiP('Overwrite them with your version, or cancel and use "Undo changes" to see theirs.')], confirmText: 'Overwrite', cancelText: 'Cancel', danger: true });
      if (over) { FP.rev = d.rev; return save(); }
      renderBar(); return;
    }
    if (!d || d.error || !d.ok) { renderBar(); await uiError((d && d.error) || 'no answer from the dashboard server', 'Not saved'); return; }
    FP.rev = d.rev; FP.orig = normalize(d.rules); FP.cur = clone(FP.orig); FP.err = {};
    if (FP.info) FP.info.rules = d.rules;
    flash(`Saved (${ch.length} change${ch.length === 1 ? '' : 's'}). The bots use it within 30 seconds.`);
    render(); load(true);
  }

  window.FundPage = { route, open, close, parseAmount, _state: FP };
})();
