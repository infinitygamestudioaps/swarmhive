// GEAR PLANNER page #/gear (user 2026-10-09 12:45: "Under /gear we need to be able to select gear for EVERY single class and EVERY single
// grade. Even though there is no shop selling items in town, we should be able to select, per grade for each class, the equipment we want
// them to have. It should be compact and easily understandable — I like this overview (the character page)").
//
// Hook: index.html route() -> GearPage.route(kind, arg) (#/gear, #/gear/<classId>/<grade>); without this file (server.js not restarted yet)
// the old Gear tab keeps working. Data: /api/gearplanner/classes (every class, our characters, which grades have a plan) and
// /api/gearplanner?class=&grade= (the plan incl. inherited slots, every item that fits each slot with stats + where it comes from,
// our characters of this class with what they wear vs the plan). Saving: POST /api/gearplanner (Dashboard/gearpage_api.js) ->
// Scripts/data/gear_prefs.json "_class" (read live by swarm.js planUpgrades, no deploy needed for the data).
// Layout: phone = class bar + grade tabs + paper doll / slot list + our characters; desktop (>= 1100 px) = class list on the left.
// Slot tap = picker (bottom sheet on phones, side panel on wide screens) with search, "fits this class" / all, sold in Giran, S.A. versions,
// sort, and per item: stats, set + bonus, Common twin, S.A. options, every source (Giran price, other shops, craft, exchange, drop, spoil).
// Uses index.html globals: esc, api, go, patch, GI, UI, itemIcon, classIcon, STATE, TAB, stopChar, GD.
(function () {
  'use strict';
  const SEC = 'tab-gearpage';
  const GP = { open: false, cls: null, grade: 'C', meta: null, data: null, pick: null, q: '', all: false, giran: false, sa: false, sort: 'best', exp: null,
    classQ: '', drawer: false, busy: false, msg: '', msgBad: false, timer: 0, loadSeq: 0, buy: 'auto' };
  const $id = (i) => document.getElementById(i);
  const nf = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
  const short = (n) => { n = Number(n) || 0; return n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : nf(n); };
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('swarm.gp.' + k)); localStorage.setItem('swarm.gp.' + k, JSON.stringify(v)); } catch (e) { return null; } return null; };
  const SLOT_LABEL = { weapon: 'Weapon', shield: 'Shield / off-hand', head: 'Helmet', chest: 'Upper / full armor', legs: 'Lower armor', gloves: 'Gloves', feet: 'Boots',
    neck: 'Necklace', earring: 'Earring 1', earring2: 'Earring 2', ring: 'Ring 1', ring2: 'Ring 2', belt: 'Belt', bracelet: 'Bracelet', talisman: 'Talisman', cloak: 'Cloak' };
  const SHORT = { weapon: 'Weapon', shield: 'Shield', head: 'Helmet', chest: 'Chest', legs: 'Legs', gloves: 'Gloves', feet: 'Boots', neck: 'Neck', earring: 'Earring', earring2: 'Earring',
    ring: 'Ring', ring2: 'Ring', belt: 'Belt', bracelet: 'Bracelet', talisman: 'Talisman', cloak: 'Cloak' };
  const DOLL = [['earring', 'head', 'weapon'], ['neck', 'chest', 'shield'], ['earring2', 'legs', 'belt'], ['ring', 'gloves', 'bracelet'], ['ring2', 'feet', 'cloak'], [null, 'talisman', null]];
  const ORDER = ['weapon', 'shield', 'head', 'chest', 'legs', 'gloves', 'feet', 'neck', 'earring', 'earring2', 'ring', 'ring2', 'belt', 'bracelet', 'talisman', 'cloak'];
  const BOT = new Set(['weapon', 'shield', 'head', 'chest', 'legs', 'gloves', 'feet', 'neck', 'earring', 'earring2', 'ring', 'ring2']);
  const GRADE_LABEL = { NONE: 'No-grade', D: 'D', C: 'C', B: 'B', A: 'A', S: 'S', S80: 'S80', S84: 'S84' };
  const RACE_LABEL = { HUMAN: 'Human', ELF: 'Elf', DARK_ELF: 'Dark Elf', ORC: 'Orc', DWARF: 'Dwarf', KAMAEL: 'Kamael' };
  const base = (s) => String(s || '').replace(/2$/, '');
  const grade = (g) => g && g !== 'NONE' ? `<em class="gp-gr g-${esc(String(g).toLowerCase())}">${esc(g)}</em>` : '<em class="gp-gr g-none">NG</em>';
  const icon = (id) => { try { return itemIcon(id); } catch (e) { return '/icons/icon/etc_question_mark_i00.png'; } };
  const clsIcon = (id, extra) => { try { return classIcon({ classId: id }, extra); } catch (e) { return ''; } };

  // =========================================================================================== page skeleton
  function section() {
    let s = $id(SEC);
    if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win gp'; s.hidden = true;
    s.innerHTML = `<div class="gp-head">
        <h2>Gear planner</h2>
        <button class="gp-clsbtn" id="gpClsBtn" aria-expanded="false" title="Choose the class"></button>
        <div class="gp-grades" id="gpGrades" role="tablist"></div>
      </div>
      <div class="gp-msg" id="gpMsg" hidden></div>
      <div class="gp-layout">
        <aside class="gp-side" id="gpSide"><input id="gpClsQ" type="search" placeholder="find a class…" aria-label="find a class"><div id="gpClsList" class="gp-clslist"></div></aside>
        <div class="gp-main">
          <div class="box gp-plan"><h3><span id="gpPlanT">Plan</span><span class="gp-sp"></span><span id="gpPlanAct" class="gp-act"></span></h3><div id="gpPlan"></div></div>
          <div class="box gp-ours"><h3><span>Our characters</span><span class="gp-sp"></span><span class="gp-key"><i class="has"></i>has it <i class="buy"></i>will buy <i class="man"></i>manual <i class="non"></i>no choice</span></h3><div id="gpOurs"></div></div>
          <details class="box gp-help"><summary><h3>How it works</h3></summary><div class="gp-helpbody">
            <p>Pick a class and a grade, then tap a slot to choose the item they should wear. Every item of that grade is listed, also the ones no shop in Giran sells: the bots buy what Giran sells (the cheap <b>Common</b> twin when there is one, a caster's armor as the real set piece) and report <b>manual</b> for the rest (drop, craft, exchange) in <code>!gearplan</code>.</p>
            <p>A class without a choice for a slot uses its <b>parent class</b> (e.g. Shillien Templar uses Shillien Knight), then the old per-role choice, then the <b>recommended</b> item (teal: the best weapon / set / jewellery for the class's role, preferring what Giran sells; the reason is shown under it), then the bots' automatic pick. <b>Reset … to recommended</b> removes your own choices. Alternatives are tried in order when the first item cannot be bought.</p>
            <p>Colours under "Our characters": <span class="ok">green</span> wears the planned item (or its Common twin), <span class="warn">gold</span> the bots will buy it on the next supply run, grey = manual (not sold in Giran, or a belt / bracelet / talisman / cloak the bots do not buy).</p>
          </div></details>
        </div>
      </div>
      <div class="gp-pick" id="gpPick" hidden><div class="gp-panel" id="gpPanel" role="dialog" aria-modal="true" aria-label="choose an item"></div></div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    s.addEventListener('click', onClick);
    s.addEventListener('input', onInput);
    s.addEventListener('change', onChange);
    return s;
  }

  // =========================================================================================== routing
  function route(kind, arg) {
    if (kind === 'gear') {
      const parts = location.hash.replace(/^#\/?/, '').split('/');
      open(parts[1] ? +parts[1] : null, parts[2] ? decodeURIComponent(parts[2]).toUpperCase() : null);
      return true;
    }
    close();
    return false;
  }
  function open(cls, grade) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'gearv2'; } catch (e) { }                       // the old Gear tab code stays quiet
    try { [...$id('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === 'gear')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    const was = GP.open;
    s.hidden = false; GP.open = true;
    if (cls != null && !isNaN(cls)) GP.cls = cls; else if (GP.cls == null) GP.cls = store('cls') || null;
    if (grade && GRADE_LABEL[grade]) GP.grade = grade; else if (!grade) GP.grade = store('grade') || GP.grade;
    if (!was) window.scrollTo(0, 0);
    if (!GP.timer) GP.timer = setInterval(() => { if (GP.open && !document.hidden && !GP.pick) load(false); }, 30000);
    loadMeta().then(() => { if (GP.cls == null) GP.cls = defaultClass(); load(true); });
  }
  function close() {
    if (!GP.open) return;
    GP.open = false; GP.pick = null;
    clearInterval(GP.timer); GP.timer = 0;
    const s = $id(SEC); if (s) s.hidden = true;
    document.documentElement.classList.remove('gp-modal');
  }
  function setHash() { const h = `#/gear/${GP.cls}/${GP.grade}`; if (location.hash !== h) history.replaceState(null, '', h); store('cls', GP.cls); store('grade', GP.grade); }
  function defaultClass() {
    const o = ((GP.meta || {}).ours || []).filter(c => c.classId != null).sort((a, b) => b.level - a.level)[0];
    return o ? o.classId : 33;
  }

  // =========================================================================================== data
  async function loadMeta() {
    if (GP.meta && Date.now() - GP.metaAt < 60000) return;
    try { GP.meta = await api('/api/gearplanner/classes'); GP.metaAt = Date.now(); } catch (e) { flash('Could not load the class list: ' + e.message, true); }
    renderHead(); renderClasses();
  }
  async function load(force) {
    if (!GP.open || GP.cls == null) return;
    setHash();
    const seq = ++GP.loadSeq;
    if (force) { renderHead(); renderClasses(); }
    try {
      const d = await api(`/api/gearplanner?class=${encodeURIComponent(GP.cls)}&grade=${encodeURIComponent(GP.grade)}`);
      if (seq !== GP.loadSeq) return;                               // a newer class / grade was picked meanwhile
      if (d.error) { flash(d.error, true); return; }
      GP.data = d;
    } catch (e) { flash('Could not load the plan: ' + e.message, true); return; }
    render();
  }
  async function save(body, okText) {
    if (GP.busy) return;
    GP.busy = true;
    try {
      const r = await api('/api/gearplanner', { method: 'POST', body: JSON.stringify(Object.assign({ class: GP.cls, grade: GP.grade }, body)) });
      if (!r || r.error) { flash((r && r.error) || 'not saved', true); return; }
      flash(okText + (r.skipped && r.skipped.length ? ` — skipped (cannot wear): ${r.skipped.join(', ')}` : '') + ' · the bots use it from their next gear upgrade (no restart).');
      GP.metaAt = 0; await loadMeta();
    } catch (e) { flash('Not saved: ' + e.message, true); }
    finally { GP.busy = false; }
    await load(false);
  }
  function flash(t, bad) {
    GP.msg = t; GP.msgBad = !!bad;
    const m = $id('gpMsg'); if (!m) return;
    m.hidden = !t; m.className = 'gp-msg' + (bad ? ' bad' : ''); m.textContent = t;
    clearTimeout(GP.msgT); GP.msgT = setTimeout(() => { const x = $id('gpMsg'); if (x) x.hidden = true; }, bad ? 12000 : 7000);
  }

  // =========================================================================================== header: class button + grade tabs
  function curClass() { const M = GP.meta || {}; return (M.classes || []).find(c => c.id === +GP.cls) || (GP.data && GP.data.class) || null; }
  function renderHead() {
    const c = curClass(), M = GP.meta || {};
    const b = $id('gpClsBtn');
    if (b) {
      b.innerHTML = c ? `${clsIcon(c.id)}<span class="t"><b>${esc(c.name)}</b><small>${esc(RACE_LABEL[c.race] || c.race)} · ${esc(((M.arch || {})[c.arch] || {}).label || c.arch)}</small></span><span class="dd">▾</span>` : '<span class="t"><b>Choose a class</b></span>';
      b.setAttribute('aria-expanded', GP.drawer ? 'true' : 'false');
    }
    const plans = c ? ((M.plans || {})[c.id] || {}) : {};
    patch($id('gpGrades'), (M.grades || Object.keys(GRADE_LABEL)).map(g => `<button role="tab" data-gpgrade="${g}" class="${g === GP.grade ? 'on' : ''}" aria-selected="${g === GP.grade}" title="${esc(GRADE_LABEL[g])} grade · from level ${(M.gradeLvl || {})[g] || ''}${plans[g] ? ' · ' + plans[g] + ' slot(s) chosen' : ''}">${esc(GRADE_LABEL[g])}<small>${(M.gradeLvl || {})[g] || 1}+</small>${plans[g] ? '<i class="dot"></i>' : ''}</button>`).join(''));
    const side = $id('gpSide'); if (side) side.classList.toggle('open', GP.drawer);
  }
  function renderClasses() {
    const M = GP.meta; if (!M || !M.classes) return;
    const q = GP.classQ.trim().toLowerCase();
    const kids = {}; M.classes.forEach(c => { (kids[c.parent == null ? 'root' : c.parent] = kids[c.parent == null ? 'root' : c.parent] || []).push(c); });
    const ours = {}; (M.ours || []).forEach(o => { if (o.classId != null) (ours[o.classId] = ours[o.classId] || []).push(o.name); });
    const rows = [];
    const walk = (c, depth) => {
      const pl = M.plans[c.id] || {}, n = Object.keys(pl).length, who = ours[c.id] || [];
      const hit = !q || c.name.toLowerCase().includes(q) || who.some(w => w.toLowerCase().includes(q));
      if (hit) rows.push({ c, depth, html: `<button class="gp-cl${c.id === +GP.cls ? ' on' : ''}" data-gpcls="${c.id}" style="--d:${depth}">${clsIcon(c.id)}<span class="n">${esc(c.name)}${c.sub ? ' <small>(sub)</small>' : ''}</span>` +
        `${who.length ? `<span class="gp-who" title="${esc(who.join(', '))}">${esc(who.length > 2 ? who.slice(0, 2).join(', ') + ' +' + (who.length - 2) : who.join(', '))}</span>` : ''}${n ? `<span class="gp-pn" title="grades with a plan: ${esc(Object.keys(pl).join(', '))}">${n}</span>` : ''}</button>` });
      (kids[c.id] || []).sort((a, b) => a.id - b.id).forEach(k => walk(k, depth + 1));
    };
    const byRace = {};
    (kids.root || []).forEach(c => { (byRace[c.race] = byRace[c.race] || []).push(c); });
    const html = Object.keys(RACE_LABEL).map(r => {
      const before = rows.length;
      (byRace[r] || []).sort((a, b) => a.id - b.id).forEach(c => walk(c, 0));
      const mine = rows.slice(before);
      return mine.length ? `<div class="gp-race"><div class="gp-rh">${esc(RACE_LABEL[r])}</div>${mine.map(x => x.html).join('')}</div>` : '';
    }).join('');
    patch($id('gpClsList'), html || '<div class="muted">no class matches</div>');
  }

  // =========================================================================================== the plan: paper doll + slot list
  const slotOff = (d, s) => {
    const k = d.kit || {}, p = {}; ORDER.forEach(x => { p[x] = eff(d, x); });
    if (s === 'shield' && !k.sh && !k.sig) return d.class.race === 'KAMAEL' ? 'Kamael: no shield' : 'no shield for this class';
    if (s === 'shield') { const w = p.weapon && candOf(d, 'weapon', p.weapon.id); if (w && w.two) return 'two-handed weapon'; }
    if (s === 'legs') { const ch = p.chest && candOf(d, 'chest', p.chest.id); if (ch && ch.full) return 'full armor: no lower part'; }
    if (!(d.cand[base(s)] || []).length && !p[s]) return 'nothing at this grade';
    return '';
  };
  const candOf = (d, s, id) => (d.cand[base(s)] || []).find(x => x.id === +id) || null;
  /** what a slot holds: the user's choice (own class, parent line, old role choice) or else the RECOMMENDED item (from: 'rec') */
  const eff = (d, s) => (d.plan || {})[s] || ((d.rec || {})[s] ? Object.assign({}, d.rec[s], { from: 'rec' }) : null) ||
    (/2$/.test(s) && !(d.plan || {})[s] ? (() => { const b = eff(d, base(s)); return b ? Object.assign({}, b, { same: true }) : null; })() : null);   // earring 2 / ring 2: the same item worn twice
  function statLine(r, slot) {
    const o = [];
    if (r.pa) o.push('P.Atk ' + r.pa); if (r.ma) o.push('M.Atk ' + r.ma); if (r.cr) o.push('Crit ' + r.cr); if (r.spd) o.push('Spd ' + r.spd);
    if (r.pd) o.push('P.Def ' + r.pd); if (r.md) o.push('M.Def ' + r.md); if (r.sd) o.push('Shield ' + r.sd); if (r.rs) o.push('Block ' + r.rs + '%'); if (r.mp) o.push('MP +' + r.mp);
    return o.join(' · ');
  }
  function typeLine(r) {
    const o = [];
    if (r.t) o.push(r.t === 'DUAL' ? 'dual swords' : r.t === 'DUALFIST' ? 'fists' : r.t === 'ANCIENTSWORD' ? 'ancient sword' : r.t === 'MAGIC' ? 'robe' : r.t.toLowerCase());
    if (r.two) o.push('2h'); if (r.full) o.push('full armor'); if (r.mw) o.push('magic');
    return o.join(' ');
  }
  /** The chip that says how the bots get the planned item: Giran (gold) or manual (grey). */
  function getChip(d, s, e) {
    if (!e) {
      const a = (d.auto || {})[base(s)];
      return a ? `<span class="gp-c auto" title="no choice: the bots' automatic pick">auto: ${esc(a.name)}</span>` : `<span class="gp-c auto">automatic</span>`;
    }
    if (!BOT.has(s)) return `<span class="gp-c man" title="${esc(e.src || '')}">manual · bots do not buy ${esc(SHORT[s].toLowerCase())}s</span>`;
    const g = e.get;
    if (g) return `<span class="gp-c buy" title="the bots buy this in Giran">Giran ${short(g.price)} · ${esc(g.npc)}${g.how === 'common' ? ' (Common)' : g.how === 'change' ? ' (sword + Change Weapon)' : ''}</span>`;
    return `<span class="gp-c man" title="${esc(e.src || '')}">manual · ${esc(srcShort(e.src))}</span>`;
  }
  const srcShort = (t) => String(t || '').split(' · ')[0].slice(0, 60);
  function cell(d, s) {
    if (!s) return '<span class="gp-cell gp-blank" aria-hidden="true"></span>';
    const e = eff(d, s), off = slotOff(d, s);
    if (off && !e) return `<span class="gp-cell off" title="${esc(SLOT_LABEL[s])}: ${esc(off)}"><i class="lbl">${esc(SHORT[s])}</i></span>`;
    if (!e) return `<button class="gp-cell" data-gpslot="${s}" title="${esc(SLOT_LABEL[s])}: tap to choose"><i class="lbl">${esc(SHORT[s])}</i><i class="plus">+</i></button>`;
    const r = candOf(d, s, e.id) || { g: '' }, st = e.get ? 'buy' : 'man', isRec = e.from === 'rec', inh = !isRec && e.from !== d.class.id;
    return `<button class="gp-cell has ${BOT.has(s) ? st : 'man'}${inh ? ' inh' : ''}${isRec ? ' rec' : ''}" data-gpslot="${s}" title="${esc(SLOT_LABEL[s] + ': ' + e.name + (inh ? ' (from ' + fromName(d, e.from) + ')' : ''))}"><img src="${icon(e.id)}" alt="">${grade(r.g)}</button>`;
  }
  const fromName = (d, f) => f === 'rec' ? 'recommended' : /^role:/.test(String(f)) ? 'the old "' + String(f).slice(5) + '" role choice' : ((d.chain || []).find(x => x.id === +f) || {}).name || ('class ' + f);
  function slotRow(d, s) {
    const e = eff(d, s), off = slotOff(d, s);
    if (off && !e) return `<div class="gp-row off"><span class="gp-sl">${esc(SLOT_LABEL[s])}</span><span class="muted">${esc(off)}</span></div>`;
    if (!e) return `<button class="gp-row empty" data-gpslot="${s}" title="tap to choose"><span class="gp-ic empty">+</span><span class="gp-sl">${esc(SLOT_LABEL[s])}</span><span class="gp-nm">${getChip(d, s, null)}</span></button>`;
    const r = candOf(d, s, e.id) || {}, isRec = e.from === 'rec', inh = !isRec && e.from !== d.class.id, rc = (d.rec || {})[s];
    const set = r.set != null && d.sets[r.set] ? d.sets[r.set] : null;
    const tag = isRec ? ' <span class="gp-c rec" title="nobody chose this slot: the planner\'s recommendation (the bots use it)">recommended</span>'
      : ` <span class="gp-c mine" title="your choice wins over the recommendation">your choice</span>${rc && rc.id !== e.id ? ` <span class="gp-c rec" title="${esc(rc.why || '')}">rec.: ${esc(rc.name)}</span>` : ''}`;
    const why = isRec && !e.same ? `<small class="gp-why">${esc(e.why || '')}</small>` : '';
    const same = e.same ? ' <span class="gp-c" title="nothing chosen for this slot: the first slot\'s item is worn twice">same as slot 1</span>' : '';
    return `<button class="gp-row" data-gpslot="${s}"><img class="gp-ic" src="${icon(e.id)}" alt=""><span class="gp-sl">${esc(SLOT_LABEL[s])}</span>
      <span class="gp-nm"><b>${esc(e.name)}</b> ${grade(r.g)}${tag}${same}${e.buy && e.buy !== 'auto' ? ` <span class="gp-c">${e.buy === 'real' ? 'real only' : 'Common only'}</span>` : ''}${inh ? ` <span class="gp-c inh">from ${esc(fromName(d, e.from))}</span>` : ''}${(e.alt || []).length ? ` <span class="gp-c">+${e.alt.length} alt.</span>` : ''}
        <small>${esc([statLine(r, s), set ? 'set: ' + set.name : ''].filter(Boolean).join(' · '))}</small>${why}</span>${getChip(d, s, e)}</button>`;
  }
  function render() {
    const d = GP.data; if (!d || !GP.open) return;
    renderHead(); renderClasses();
    const c = d.class, archN = (d.archClasses || []).length;
    $id('gpPlanT').textContent = `${c.name} · ${GRADE_LABEL[d.grade]}${d.grade !== 'NONE' ? '-grade' : ''}`;
    patch($id('gpPlanAct'), `<label class="gp-fb" title="What the bots do while a chosen item cannot be bought">if not for sale
        <select id="gpFallback"><option value="auto"${d.fallback !== 'keep' ? ' selected' : ''}>buy the auto pick</option><option value="keep"${d.fallback === 'keep' ? ' selected' : ''}>keep what they wear</option></select></label>
      ${archN > 1 ? `<button data-gpcopy title="Copy this plan to every class of the same kind">Copy to ${archN - 1} similar</button>` : ''}
      <button data-gpclear title="Remove your choices for this class at this grade: the recommended plan takes over">Reset grade to recommended</button>
      <button data-gpreset="class" title="Remove your choices for every grade of this class">… all grades</button>
      <button data-gpreset="all" title="Remove your choices for EVERY class and grade (the old per-role choices stay)">… all classes</button>`);
    const chainTxt = (d.chain || []).length > 1 ? `<div class="gp-chain muted">Empty slots use: ${(d.chain || []).slice(1).map(x => esc(x.name)).join(' → ')}${c.role ? ' → the old "' + esc(c.role) + '" role choice' : ''} → recommended.</div>` : '';
    patch($id('gpPlan'), `<div class="gp-planwrap"><div class="gp-doll">${DOLL.map(row => row.map(s => cell(d, s)).join('')).join('')}</div>
      <div class="gp-rows">${ORDER.map(s => slotRow(d, s)).join('')}</div></div>${chainTxt}
      <div class="gp-foot muted">${esc(kitText(d))}${d.giranAt ? ' · Giran prices from the shop scan of ' + esc(String(d.giranAt).slice(0, 10)) : ''}</div>`);
    renderOurs();
    if (GP.pick) renderPick();
  }
  function kitText(d) {
    const k = d.kit || {}, w = (k.w || []).map(t => t === 'MAGIC' ? 'magic weapons' : t === 'DUAL' ? 'dual swords' : t === 'ANCIENTSWORD' ? 'ancient swords' : t.toLowerCase() + 's').join(', ');
    return `Fits this class: ${w}${k.one ? ' (one-handed)' : ''}${k.two ? ' (two-handed)' : ''}; armor ${(k.a || []).map(a => a === 'MAGIC' ? 'robe' : a.toLowerCase()).join(' / ')}${k.sh ? '; shield' : ''}${k.sig ? '; sigil' : ''}${k.change ? '; swords are bought and turned with Change Weapon' : ''}.`;
  }
  function renderOurs() {
    const d = GP.data, el = $id('gpOurs'); if (!d || !el) return;
    const L = d.chars || [];
    if (!L.length) { patch(el, `<div class="muted">None of our characters is a ${esc(d.class.name)} (or in its class line) right now.</div>`); return; }
    const slots = ORDER.filter(s => !slotOff(d, s) || eff(d, s));
    patch(el, L.map(ch => {
      const cnt = { has: 0, buy: 0, man: 0, cost: 0 };
      const strip = slots.map(s => {
        const x = ch.slots[s] || {}, st = ch.own ? (x.st === 'manual' ? 'man' : x.st || 'none') : 'none';
        if (ch.own && cnt[st] != null) cnt[st]++; if (ch.own && st === 'buy') cnt.cost += x.price || 0;
        const w = x.worn;
        return `<span class="gp-s ${st}" title="${esc(SLOT_LABEL[s] + ': ' + (w ? w.n : 'nothing') + (x.t ? ' — ' + x.t : ''))}">${w && w.id ? `<img src="${icon(w.id)}" alt="">` : `<i>${esc(SHORT[s].slice(0, 2))}</i>`}</span>`;
      }).join('');
      const sum = ch.own ? [cnt.has ? `<span class="ok">${cnt.has} ok</span>` : '', cnt.buy ? `<span class="warn">${cnt.buy} to buy (${short(cnt.cost)})</span>` : '', cnt.man ? `<span class="muted">${cnt.man} manual</span>` : ''].filter(Boolean).join(' · ') || '<span class="muted">nothing chosen yet</span>'
        : `<span class="muted">${esc(ch.cls)} — same class line, uses its own plan</span>`;
      const gNote = ch.own && ch.grade !== d.grade ? ` <span class="gp-c" title="the bots buy for the grade of their level">wears ${esc(GRADE_LABEL[ch.grade])} now</span>` : '';
      return `<div class="gp-char${ch.own ? '' : ' line'}"><a class="gp-cn" href="#/char/${encodeURIComponent(ch.name)}">${clsIcon(ch.classId, 'sm')}<b>${esc(ch.name)}</b><span class="lvl">${ch.level}</span>${ch.online ? '' : '<span class="gp-c">offline</span>'}${gNote}</a>
        <div class="gp-strip">${strip}</div><div class="gp-sum">${sum}</div></div>`;
    }).join(''));
  }

  // =========================================================================================== picker
  function openPick(slot) {
    GP.pick = { slot }; GP.q = ''; GP.exp = null; GP.buy = ((GP.data.plan || {})[slot] || {}).buy || 'auto';
    GP.all = false; GP.sa = false;
    const p = $id('gpPick'); p.hidden = false; $id('gpPanel').scrollTop = 0;
    document.documentElement.classList.add('gp-modal');
    renderPick();
    setTimeout(() => { const q = $id('gpQ'); if (q && window.matchMedia('(pointer: fine)').matches) q.focus({ preventScroll: true }); }, 30);
  }
  function closePick() { GP.pick = null; const p = $id('gpPick'), q = $id('gpPanel'); if (p) p.hidden = true; if (q) { q.innerHTML = ''; q._last = null; } document.documentElement.classList.remove('gp-modal'); }
  function score(r, d) {
    const mys = (d.kit.w || []).includes('MAGIC'), S = base(GP.pick.slot);
    if (S === 'weapon') return mys ? (r.ma || 0) : (r.pa || 0) * (1 + (r.cr || 0) / 100) + (r.spd || 0) * 0.02;
    if (S === 'shield') return (r.sd || 0) + (r.pd || 0) + (r.mp || 0) * 0.1;
    if (['neck', 'earring', 'ring'].includes(S)) return r.md || 0;
    return (r.pd || 0) + (mys ? (r.mp || 0) * 0.2 : 0) + (r.md || 0);
  }
  const giranPrice = (r) => r.gc ? r.gc[1] : r.gr ? r.gr[1] : r.gx ? r.gx[1] : null;
  function pickList(d) {
    const S = base(GP.pick.slot), q = GP.q.trim().toLowerCase();
    let L = (d.cand[S] || []).slice();
    const saCount = {}; L.forEach(r => { if (r.base) saCount[r.base] = (saCount[r.base] || 0) + 1; });
    const plan = d.plan[GP.pick.slot], chosen = new Set(plan ? [plan.id].concat(plan.alt || []) : []);
    L = L.filter(r => chosen.has(r.id) || ((GP.all || r.fit) && (GP.sa || !r.base || q) && (!GP.giran || giranPrice(r) != null) && (!q || r.n.toLowerCase().includes(q))));
    const by = GP.sort === 'price' ? (a, b) => (giranPrice(a) == null) - (giranPrice(b) == null) || (giranPrice(a) || 0) - (giranPrice(b) || 0) || score(b, d) - score(a, d)
      : GP.sort === 'name' ? (a, b) => a.n.localeCompare(b.n) : (a, b) => score(b, d) - score(a, d) || (giranPrice(a) || 9e12) - (giranPrice(b) || 9e12);
    L.sort((a, b) => (chosen.has(b.id) - chosen.has(a.id)) || by(a, b));
    return { L, saCount, chosen, plan };
  }
  function whereChips(r) {
    const o = [];
    if (r.gc) o.push(`<span class="gp-c buy" title="Common twin at ${esc(r.gc[0])}: same stats, no set bonus / S.A.">Giran Common ${short(r.gc[1])}</span>`);
    if (r.gr) o.push(`<span class="gp-c buy" title="real item at ${esc(r.gr[0])}">Giran ${short(r.gr[1])}</span>`);
    if (r.gx) o.push(`<span class="gp-c buy" title="${esc(r.gx[3] + ' at ' + r.gx[0])}">Giran ${short(r.gx[1])}${r.gx[2] === 'change' ? ' + Change Weapon' : ''}</span>`);
    const s = r.src || {};
    if (s.sh && !r.gr) o.push(`<span class="gp-c" title="${esc(s.sh.map(x => x[0] + ' (' + x[1] + ') ' + nf(x[2])).join(', '))}">shop ${esc(s.sh[0][1] || s.sh[0][0])}</span>`);
    if (s.cr) o.push(`<span class="gp-c" title="${esc(s.cr.rn + ' — ' + s.cr.mats)}">craft</span>`);
    if (s.ms) o.push(`<span class="gp-c" title="${esc(s.ms.map(x => x[0] + ': ' + x[1]).join(' | '))}">exchange</span>`);
    if (s.dr) o.push(`<span class="gp-c" title="${esc(s.dr.map(x => x[0] + ' L' + x[1] + ' ' + x[2] + '%').join(', '))}">${s.dr.some(x => x[3]) ? 'boss drop' : 'drop'}</span>`);
    if (s.sp) o.push(`<span class="gp-c" title="${esc(s.sp.map(x => x[0] + ' L' + x[1] + ' ' + x[2] + '%').join(', '))}">spoil</span>`);
    if (r.saHow) o.push('<span class="gp-c">S.A. by soul crystal</span>');
    if (!o.length) o.push('<span class="gp-c man">no source</span>');
    return o.join('');
  }
  function detail(r, d, saList) {
    const s = r.src || {}, line = (t, v) => v ? `<div class="gp-dl"><b>${t}</b><span>${v}</span></div>` : '';
    const set = r.set != null ? d.sets[r.set] : null;
    const drops = (L) => L.map(x => `${esc(x[0])} L${x[1]} <span class="muted">${x[2]}%</span>${x[3] ? ' <span class="gp-c">raid</span>' : ''}`).join(', ');
    return `<div class="gp-det">
      ${line('Giran', [r.gr ? `real ${nf(r.gr[1])} at ${esc(r.gr[0])}` : '', r.gc ? `Common ${nf(r.gc[1])} at ${esc(r.gc[0])} (same stats, no set bonus, no S.A.)` : '', r.gx ? `${esc(r.gx[3])} ${nf(r.gx[1])} at ${esc(r.gx[0])}${r.gx[2] === 'change' ? ' — then Change Weapon (1473) turns it into this' : ''}` : ''].filter(Boolean).join('<br>') || '<span class="muted">not sold in Giran</span>')}
      ${line('Other shops', s.sh ? s.sh.map(x => `${esc(x[0])} (${esc(x[1])}) ${nf(x[2])}`).join(', ') : '')}
      ${line('Craft', s.cr ? `${esc(s.cr.rn)} · ${esc(s.cr.k)} craft lvl ${s.cr.lv} · ${s.cr.rate}% · ${esc(s.cr.mats)}${s.cr.rdrop ? '<br><span class="muted">recipe drops: ' + drops(s.cr.rdrop) + '</span>' : ''}${s.cr.rshop ? '<br><span class="muted">recipe sold in a shop</span>' : ''}` : '')}
      ${line('Exchange', s.ms ? s.ms.map(x => `${esc(x[0])}: ${esc(x[1])}`).join('<br>') : '')}
      ${line('Drop', s.dr ? drops(s.dr) : '')}
      ${line('Spoil', s.sp ? drops(s.sp) : '')}
      ${line('S.A.', r.saHow ? esc(r.saHow) : '')}
      ${line('Set', set ? `<b>${esc(set.name)}</b>: ${esc(set.bonus || '—')}${set.shield ? '<br>with shield: ' + esc(set.shield) : ''}${set.e6 ? '<br>all +6: ' + esc(set.e6) : ''}<br><span class="muted">pieces: ${Object.keys(set.pieces).join(', ')}</span>` : '')}
      ${line('Kamael', r.change ? 'a Kamael buys this sword and turns it into ' + esc(r.change) + ' with Change Weapon' : '')}
      ${line('Race', r.r ? esc(r.r.replace(/_/g, ' ').toLowerCase()) + ' only' : '')}
      ${saList.length ? line('With S.A.', saList.map(x => `<button class="gp-sab" data-gpchoose="${x.id}" title="${esc(x.saHow || '')}">${esc(x.sa)}</button>`).join(' ')) : ''}
    </div>`;
  }
  function renderPick() {
    const d = GP.data, P = GP.pick, el = $id('gpPanel'); if (!d || !P || !el) return;
    const { L, saCount, chosen, plan } = pickList(d);
    const S = base(P.slot), total = (d.cand[S] || []).length, fits = (d.cand[S] || []).filter(r => r.fit && !r.base).length;
    const cur = plan ? `<div class="gp-cur"><span class="muted">Chosen:</span> ${[plan.id].concat(plan.alt || []).map((id, i) => {
        const r = candOf(d, P.slot, id) || { n: (i ? plan.altNames[i - 1] : plan.name) };
        return `<span class="gp-chosen">${i ? `<small>alt ${i}</small>` : '<small>1st</small>'}<img src="${icon(id)}" alt="">${esc(r.n)}${i ? `<button class="icon" data-gpup="${id}" title="try earlier" aria-label="move up">↑</button>` : ''}<button class="icon" data-gpdrop="${id}" title="${i ? 'remove this alternative' : 'remove the choice (back to automatic)'}" aria-label="remove">✕</button></span>`;
      }).join('')}${plan.from !== d.class.id ? ` <span class="gp-c inh">from ${esc(fromName(d, plan.from))} — choosing here makes it this class's own</span>` : ''}</div>` : '<div class="gp-cur muted">Nothing chosen by you: the bots use the recommended item below (or their automatic pick).</div>';
    const rc = (d.rec || {})[P.slot] || (/2$/.test(P.slot) ? (d.rec || {})[base(P.slot)] : null);
    const recLine = rc ? `<div class="gp-recl"><span class="gp-c rec">recommended</span><img src="${icon(rc.id)}" alt=""><b>${esc(rc.name)}</b>${(rc.altNames || []).length ? ` <span class="muted">(then ${esc(rc.altNames.join(', '))})</span>` : ''}
        ${plan && plan.from === d.class.id ? '<button data-gpuserec title="remove your choice for this slot: the recommendation takes over">Use recommended</button>' : plan ? '' : '<span class="gp-c ok">in use</span>'}
        <small class="gp-why">${esc(rc.why || '')}</small></div>`
      : `<div class="gp-recl muted">No recommendation for this slot at this grade${/2$/.test(P.slot) ? ' (the first slot\'s item is worn twice)' : ''}.</div>`;
    const html = `<div class="gp-ph"><h3>${esc(SLOT_LABEL[P.slot])} <small>${esc(d.class.name)} · ${esc(GRADE_LABEL[d.grade])}</small></h3><button class="closebtn" data-gpclose aria-label="close"></button></div>
      ${recLine}${cur}
      <div class="gp-pbar"><input id="gpQ" type="search" placeholder="find an item…" value="${esc(GP.q)}" aria-label="find an item">
        <select id="gpSort" aria-label="sort"><option value="best"${GP.sort === 'best' ? ' selected' : ''}>best stats</option><option value="price"${GP.sort === 'price' ? ' selected' : ''}>Giran price</option><option value="name"${GP.sort === 'name' ? ' selected' : ''}>name</option></select></div>
      <div class="gp-tg">
        <button data-gptg="all" class="${GP.all ? 'on' : ''}" title="also items this class line does not normally use">${GP.all ? 'all items' : 'fits ' + esc(d.class.name)} (${GP.all ? total : fits})</button>
        <button data-gptg="giran" class="${GP.giran ? 'on' : ''}">sold in Giran</button>
        ${S === 'weapon' ? `<button data-gptg="sa" class="${GP.sa ? 'on' : ''}">S.A. versions</button>` : ''}
        <span class="gp-buy" title="How the bots buy it when both the real item and its Common twin are sold">buy as <select id="gpBuy"><option value="auto"${GP.buy === 'auto' ? ' selected' : ''}>auto</option><option value="real"${GP.buy === 'real' ? ' selected' : ''}>real only</option><option value="common"${GP.buy === 'common' ? ' selected' : ''}>Common only</option></select></span>
      </div>
      <div class="gp-list">${L.slice(0, 250).map(r => {
        const isC = chosen.has(r.id), first = plan && plan.id === r.id, open = GP.exp === r.id, isRec = !!(rc && rc.id === r.id);
        const sas = (d.cand[S] || []).filter(x => x.base === r.id);
        return `<div class="gp-it${isC ? ' sel' : ''}${first ? ' first' : ''}${r.fit ? '' : ' nofit'}${open ? ' open' : ''}" data-gpit="${r.id}">
          <div class="gp-ir" data-gpexp="${r.id}"><img src="${icon(r.id)}" alt=""><div class="gp-in"><div class="t"><b>${esc(r.n)}</b> ${grade(r.g)}${r.sa ? ` <span class="gp-c">S.A. ${esc(r.sa)}</span>` : ''}${saCount[r.id] ? ` <span class="gp-c">${saCount[r.id]} S.A.</span>` : ''}${r.set != null ? ' <span class="gp-c set">set</span>' : ''}${r.change ? ' <span class="gp-c">→ ' + esc(r.change) + '</span>' : ''}${r.odd ? ` <span class="gp-c man">${esc(r.odd)}</span>` : ''}${isRec ? ' <span class="gp-c rec">recommended</span>' : ''}${isC ? ` <span class="gp-c ok">${first ? 'chosen' : 'alternative'}</span>` : ''}</div>
            <div class="s">${esc([typeLine(r), statLine(r)].filter(Boolean).join(' · '))}</div><div class="w">${whereChips(r)}</div></div></div>
          ${open ? `${detail(r, d, sas)}<div class="gp-acts">${first ? '<span class="gp-c ok">chosen</span>' : `<button class="go" data-gpchoose="${r.id}">Choose</button>`}${!isC && plan ? `<button data-gpalt="${r.id}">Add as alternative</button>` : ''}</div>` : ''}
        </div>`;
      }).join('') || '<div class="muted gp-empty">Nothing matches. Try "all items" or clear the search.</div>'}${L.length > 250 ? `<div class="muted gp-empty">${L.length - 250} more: refine the search.</div>` : ''}</div>`;
    patch(el, html);
  }

  // =========================================================================================== events
  async function onClick(e) {   // async: the dialogs (UIDIALOG 2026-10-10) return Promises
    const t = e.target;
    if (t.closest('#gpClsBtn')) { GP.drawer = !GP.drawer; renderHead(); if (GP.drawer) { const q = $id('gpClsQ'); if (q && window.matchMedia('(pointer: fine)').matches) q.focus({ preventScroll: true }); } return; }
    const cl = t.closest('[data-gpcls]'); if (cl) { GP.cls = +cl.dataset.gpcls; GP.drawer = false; GP.data = null; closePick(); load(true); return; }
    const gr = t.closest('[data-gpgrade]'); if (gr) { GP.grade = gr.dataset.gpgrade; closePick(); load(true); return; }
    const sl = t.closest('[data-gpslot]'); if (sl && GP.data) { openPick(sl.dataset.gpslot); return; }
    if (t.closest('[data-gpclose]') || t.id === 'gpPick') { closePick(); return; }
    const tg = t.closest('[data-gptg]'); if (tg) { GP[tg.dataset.gptg] = !GP[tg.dataset.gptg]; renderPick(); return; }
    const ch = t.closest('[data-gpchoose]'); if (ch) {
      const P = GP.pick, plan = GP.data.plan[P.slot], own = plan && plan.from === GP.data.class.id;
      const alt = own ? [plan.id].concat(plan.alt || []).filter(i => i !== +ch.dataset.gpchoose) : [];
      save({ action: 'set', slot: P.slot, id: +ch.dataset.gpchoose, alt, buy: GP.buy }, `${SLOT_LABEL[P.slot]}: ${(candOf(GP.data, P.slot, ch.dataset.gpchoose) || {}).n || 'item'} chosen`).then(() => { GP.exp = null; renderPick(); });
      return;
    }
    const al = t.closest('[data-gpalt]'); if (al) {
      const P = GP.pick, plan = GP.data.plan[P.slot];
      save({ action: 'set', slot: P.slot, id: plan.id, alt: (plan.alt || []).concat(+al.dataset.gpalt), buy: plan.buy || GP.buy }, 'Alternative added');
      return;
    }
    const up = t.closest('[data-gpup]'); if (up) {
      const P = GP.pick, plan = GP.data.plan[P.slot], ids = [plan.id].concat(plan.alt || []), i = ids.indexOf(+up.dataset.gpup);
      if (i > 0) { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; save({ action: 'set', slot: P.slot, id: ids[0], alt: ids.slice(1), buy: plan.buy }, 'Order changed'); }
      return;
    }
    const dr = t.closest('[data-gpdrop]'); if (dr) {
      const P = GP.pick, plan = GP.data.plan[P.slot], ids = [plan.id].concat(plan.alt || []).filter(i => i !== +dr.dataset.gpdrop);
      if (plan.from !== GP.data.class.id && +dr.dataset.gpdrop === plan.id) { flash(`This choice belongs to ${fromName(GP.data, plan.from)}: change it there (or choose another item here).`, true); return; }
      save(ids.length ? { action: 'set', slot: P.slot, id: ids[0], alt: ids.slice(1), buy: plan.buy } : { action: 'set', slot: P.slot, id: null }, ids.length ? 'Removed' : `${SLOT_LABEL[P.slot]}: back to the recommended item`);
      return;
    }
    if (t.closest('[data-gpuserec]')) {
      const P = GP.pick; if (!P) return;
      save({ action: 'set', slot: P.slot, id: null }, `${SLOT_LABEL[P.slot]}: back to the recommended item`);
      return;
    }
    const rs = t.closest('[data-gpreset]'); if (rs) {
      const all = rs.dataset.gpreset === 'all', M = GP.meta || {}, plans = M.plans || {};
      const n = all ? Object.keys(plans).length : Object.keys(plans[GP.cls] || {}).length;
      if (!n) { flash(all ? 'No class has choices of its own: every class already uses the recommended plan.' : `${GP.data.class.name} has no choices of its own: it already uses the recommended plan.`); return; }
      if (!await uiConfirm(all ? { title: 'Reset ALL classes?', body: [`Remove YOUR choices for ALL classes (${n} classes have some)?`, 'Every class then uses the recommended plan. The old per-role choices (e.g. the destroyer weapon plan) stay.', uiNote('A copy of the old file is kept in Scripts/data/gear_prefs_history.')], confirmText: 'Reset all classes', danger: true }
        : { title: `Reset ${GP.data.class.name}?`, body: [`Remove your choices for every grade of ${GP.data.class.name} (${n} grade(s))?`, 'The recommended plan takes over.'], confirmText: 'Reset class', danger: true })) return;
      save({ action: 'reset', scope: all ? 'all' : 'class' }, all ? 'Every class uses the recommended plan again' : `${GP.data.class.name}: every grade back to recommended`);
      return;
    }
    const ex = t.closest('[data-gpexp]'); if (ex) { GP.exp = GP.exp === +ex.dataset.gpexp ? null : +ex.dataset.gpexp; renderPick(); return; }
    if (t.closest('[data-gpcopy]')) {
      const d = GP.data, to = (d.archClasses || []).filter(x => x.id !== d.class.id);
      if (!Object.keys(d.plan).length) { flash('Nothing chosen yet for this class and grade.', true); return; }
      if (!await uiConfirm({ title: 'Copy the gear plan?', body: [uiP(`Copy the ${GRADE_LABEL[d.grade]}-grade plan of `, uiEm(d.class.name), ` (${Object.keys(d.plan).length} slots) to:`), uiList(to.map(x => x.name)), 'Their own choices for these slots at this grade are replaced. Items a class cannot wear are skipped.'], confirmText: `Copy to ${to.length} classes` })) return;
      save({ action: 'copy', to: to.map(x => x.id) }, `Copied to ${to.length} classes`);
      return;
    }
    if (t.closest('[data-gpclear]')) {
      if (!await uiConfirm({ title: 'Clear your choices?', body: [`Remove your choices of ${GP.data.class.name} at ${GRADE_LABEL[GP.grade]} grade? The recommended plan takes over.`, uiNote('Choices inherited from the parent class stay.')], confirmText: 'Clear choices', danger: true })) return;
      save({ action: 'clear' }, 'Back to the recommended plan');
    }
  }
  function onInput(e) {
    if (e.target.id === 'gpClsQ') { GP.classQ = e.target.value; renderClasses(); }
    if (e.target.id === 'gpQ') { GP.q = e.target.value; renderPick(); }
  }
  function onChange(e) {
    if (e.target.id === 'gpSort') { GP.sort = e.target.value; renderPick(); }
    if (e.target.id === 'gpBuy') {
      GP.buy = e.target.value;
      const P = GP.pick, plan = P && GP.data.plan[P.slot];
      if (plan && plan.from === GP.data.class.id) save({ action: 'set', slot: P.slot, id: plan.id, alt: plan.alt || [], buy: GP.buy }, 'Buy rule changed');
    }
    if (e.target.id === 'gpFallback') save({ action: 'fallback', fallback: e.target.value }, e.target.value === 'keep' ? 'They keep what they wear until a chosen item can be bought' : 'They buy the automatic pick meanwhile');
  }
  document.addEventListener('keydown', (e) => { if (GP.open && GP.pick && e.key === 'Escape') { e.stopPropagation(); closePick(); } }, true);
  document.addEventListener('visibilitychange', () => { if (GP.open && !document.hidden && !GP.pick) load(false); });

  window.GearPage = { route, open, close, _gp: GP };
})();
