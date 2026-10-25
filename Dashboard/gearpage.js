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
// 2026-10-12 (backlog D2/D3/D9/D10/D11): plan tools above the doll (GP.tool): "Apply a set" (every piece of an armor set in one go),
// "Copy what is equipped" (a character's worn gear -> this class + grade, preview first), "Copy to similar" (tick the classes; grouped by
// weapon kind so daggers, bows and other fighters never mix); "Leave empty" per slot ({ none: true }); a full armor chest shows the legs
// as "covered by the full armor"; epic boss jewels are the recommendation for their grade (chip "epic").
(function () {
  'use strict';
  const SEC = 'tab-gearpage';
  const GP = { open: false, cls: null, grade: 'C', meta: null, data: null, pick: null, q: '', all: false, giran: false, sa: false, sort: 'best', exp: null,
    classQ: '', drawer: false, busy: false, msg: '', msgBad: false, timer: 0, loadSeq: 0, buy: 'auto',
    tool: null, setSel: null, setBuy: 'real', eqSel: '', copySel: null };
  // D9: "copy to similar" stays inside one weapon kind (user 2026-10-12: "separate daggers / archers")
  const WGROUP = (arch) => arch === 'dagger' ? 'dagger' : (arch === 'archer' || arch === 'kamaelBow') ? 'bow' : ['mystic', 'nuker', 'summoner', 'healer', 'buffer'].includes(arch) ? 'mystic' : /^kamael/.test(arch || '') ? 'kamael' : 'fighter';
  const WGROUP_LABEL = { dagger: 'dagger users', bow: 'bow / crossbow users', mystic: 'mystics', kamael: 'Kamael melee', fighter: 'other fighters (no dagger or bow classes)' };
  const $id = (i) => document.getElementById(i);
  const nf = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
  const short = (n) => { n = Number(n) || 0; return n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : nf(n); };
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('swarm.gp.' + k)); localStorage.setItem('swarm.gp.' + k, JSON.stringify(v)); } catch (e) { return null; } return null; };
  const SLOT_LABEL = { weapon: 'Weapon', shield: 'Shield / off-hand', head: 'Helmet', chest: 'Upper / full armor', legs: 'Lower armor', gloves: 'Gloves', feet: 'Boots',
    neck: 'Necklace', earring: 'Earring 1', earring2: 'Earring 2', ring: 'Ring 1', ring2: 'Ring 2', shirt: 'Shirt', belt: 'Belt', bracelet: 'Bracelet', talisman: 'Talisman', cloak: 'Cloak' };
  const SHORT = { weapon: 'Weapon', shield: 'Shield', head: 'Helmet', chest: 'Chest', legs: 'Legs', gloves: 'Gloves', feet: 'Boots', neck: 'Neck', earring: 'Earring', earring2: 'Earring',
    ring: 'Ring', ring2: 'Ring', shirt: 'Shirt', belt: 'Belt', bracelet: 'Bracelet', talisman: 'Talisman', cloak: 'Cloak' };
  const DOLL = [['earring', 'head', 'weapon'], ['neck', 'chest', 'shield'], ['earring2', 'legs', 'belt'], ['ring', 'gloves', 'bracelet'], ['ring2', 'feet', 'cloak'], ['shirt', 'talisman', null]];   // SHIRTSLOT-2026-10-23
  const ORDER = ['weapon', 'shield', 'head', 'chest', 'legs', 'gloves', 'feet', 'neck', 'earring', 'earring2', 'ring', 'ring2', 'shirt', 'belt', 'bracelet', 'talisman', 'cloak'];
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
          <div class="box gp-plan"><h3><span id="gpPlanT">Plan</span><span class="gp-sp"></span><span id="gpPlanAct" class="gp-act"></span></h3><div id="gpTool"></div><div id="gpPlan"></div></div>
          <div class="box gp-ours"><h3><span>Our characters</span><span class="gp-sp"></span><span class="gp-key"><i class="has"></i>has it <i class="buy"></i>will buy <i class="man"></i>manual <i class="non"></i>no choice <b class="gp-whdot k">W</b>in a warehouse</span></h3><div id="gpOurs"></div></div>
          <details class="box gp-auto" id="gpAutoBox"><summary><h3><span>Auto gear upgrades</span><span class="gp-sp"></span><span class="muted" id="gpAutoSum"></span></h3></summary><div id="gpAuto"><div class="muted">Loading…</div></div></details>
          <details class="box gp-help"><summary><h3>How it works</h3></summary><div class="gp-helpbody">
            <p>Pick a class and a grade, then tap a slot to choose the item they should wear. Every item of that grade is listed, also the ones no shop in Giran sells: the bots buy what Giran sells (the cheap <b>Common</b> twin when there is one, a caster's armor as the real set piece) and report <b>manual</b> for the rest (drop, craft, exchange) in <code>!gearplan</code>.</p>
            <p>A class without a choice for a slot uses its <b>parent class</b> (e.g. Shillien Templar uses Shillien Knight), then the old per-role choice, then the <b>recommended</b> item (teal: the best weapon / set / jewellery for the class's role, preferring what Giran sells; the reason is shown under it), then the bots' automatic pick. <b>Reset … to recommended</b> removes your own choices. Alternatives are tried in order when the first item cannot be bought.</p>
            <p><b>Auto gear upgrades</b> (folded box below "Our characters"): whether the bots buy and put on better gear by themselves in the supply runs. A new install starts with it <b>OFF</b> for everyone. Even when it is on they never change the weapon <b>type</b> (a spear stays a spear, a bow a bow), never take a lower grade, never put a shield next to a two-handed weapon, and (unless you allow it) never swap an item for one of the same grade or another armor type — your own plan here always wins. <b>Lock</b> = nothing is bought, put on or swapped for that character.</p>
            <p>Colours under "Our characters": <span class="ok">green</span> wears the planned item (or its Common twin), <span class="warn">gold</span> the bots will buy it on the next supply run, grey = manual (not sold in Giran, or a shirt / belt / bracelet / talisman / cloak the bots do not buy).</p>
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
    loadAuto();
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
  // ---- AUTO GEAR UPGRADES (Mr.P 2026-10-10): /api/gearauto (Dashboard/gearauto_api.js -> Scripts/data/gear_auto.json) ----
  async function loadAuto() {
    try { GP.auto = await api('/api/gearauto'); } catch (e) { GP.auto = null; }
    renderAuto();
  }
  function renderAuto() {
    const el = $id('gpAuto'), A = GP.auto; if (!el) return;
    if (!A || A.error) { el.innerHTML = '<div class="muted">Not available (restart the dashboard server once after the update).</div>'; return; }
    const sw = (on, attrs, txt) => `<button class="gp-sw ${on ? 'on' : 'off'}" ${attrs} aria-pressed="${on ? 'true' : 'false'}">${txt}</button>`;
    const nOn = A.parties.reduce((n, p) => n + p.members.filter(m => m.eff && !m.lock).length, 0), nAll = A.parties.reduce((n, p) => n + p.members.length, 0);
    const sum = $id('gpAutoSum'); if (sum) sum.textContent = nOn ? `${nOn} of ${nAll} buy upgrades by themselves` : 'Off — nothing happens until you switch it on';   // UX audit B7 (2026-10-13): one wording for every automatic feature that is off
    el.innerHTML = `<div class="gp-autotop">${sw(A.default, 'data-gpauto="default"', 'Everyone: ' + (A.default ? 'ON' : 'OFF'))}
        <label class="gp-autoopt"><input type="checkbox" data-gpautopol="sameGradeSwap" ${A.sameGradeSwap ? 'checked' : ''}> swap items of the same grade</label>
        <label class="gp-autoopt"><input type="checkbox" data-gpautopol="keepArmorType" ${A.keepArmorType ? 'checked' : ''}> keep the armor type (heavy / light / robe)</label>
        <label class="gp-autoopt" title="Squire's Sword / Shirt / Pants, Apprentice's Wand / Tunic / Stockings, Training Gloves, Guild Member's Club: what happens to the starter piece an upgrade replaced. Never quest, enchanted or S.A. items.">replaced starter gear <select data-gpautostarter="1" aria-label="replaced starter gear">${[['sell', 'sell it (destroy if the shop refuses)'], ['destroy', 'destroy it'], ['keep', 'keep it in the bag']].map(([v, t]) => `<option value="${v}" ${(A.starterGear || 'sell') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        ${A.exists ? '' : '<span class="muted">no gear_auto.json yet: OFF for everyone</span>'}</div>
      ${(() => { const S = A.sources || {}, all = [].concat(...A.parties.map(p => p.members.map(m => m.name)));   // GEARDIST-2026-10-25
        return `<div class="gp-autotop" title="Before buying, the gear-up takes a planned piece from these, without asking (your choice 2026-10-25). A giver reserves the piece, so two characters never wait for the same one."><b>Before buying, use:</b>
          ${sw(S.ownWh, 'data-gpsrc="ownWh"', 'own bag + warehouse')}${sw(S.clan, 'data-gpsrc="clan"', 'clan warehouse')}${sw(S.bags, 'data-gpsrc="bags"', 'spare pieces of every character (in Giran)')}${sw(S.dist, 'data-gpsrc="dist"', 'distributors')}${sw(S.unseal, 'data-gpsrc="unseal"', 'sealed pieces (unseal at Pushkin)')}</div>
        <div class="gp-autotop" title="Gear mules: they wait in Giran (near a warehouse keeper) and hand out pieces from their bags to whoever's gear-up needs them."><b>Distributors:</b>
          ${(S.names || []).map(n => `<button class="gp-sw on" data-gpdist="${esc(n)}" title="remove">${esc(n)} ✕</button>`).join('') || '<span class="muted">none yet</span>'}
          <select data-gpdistadd aria-label="add a distributor"><option value="">+ add…</option>${all.filter(n => !(S.names || []).includes(n)).sort().map(n => `<option>${esc(n)}</option>`).join('')}</select></div>`; })()}
      <div class="gp-autotop" title="Nobody buys gear of these grades: weapons, armor and jewels, every class, also pieces named in a gear plan. What they already wear stays on."><b>Never buy these grades:</b> ${['D', 'C', 'B', 'A', 'S'].map(gr => `<label class="gp-autoopt"><input type="checkbox" data-gpskipgrade="${gr}" ${(A.skipGrades || []).includes(gr) ? 'checked' : ''}> ${gr}</label>`).join('')}<span class="muted">everyone skips them (weapons, armor, jewels)</span></div>
      ${A.parties.map(p => `<div class="gp-autop"><div class="gp-autoph"><b>Party ${esc(p.leader)}</b>
          <select data-gpautoparty="${esc(p.leader)}" aria-label="party ${esc(p.leader)} auto upgrades"><option value="" ${p.auto === null ? 'selected' : ''}>as everyone</option><option value="on" ${p.auto === true ? 'selected' : ''}>ON</option><option value="off" ${p.auto === false ? 'selected' : ''}>OFF</option></select></div>
        <div class="gp-autom">${p.members.map(m => `<div class="gp-autor ${m.lock ? 'lock' : m.eff ? 'on' : 'off'}"><b>${esc(m.name)}</b>
            <select data-gpautochar="${esc(m.name)}" aria-label="${esc(m.name)} auto upgrades"><option value="" ${m.auto === null ? 'selected' : ''}>as party (${m.eff ? 'on' : 'off'})</option><option value="on" ${m.auto === true ? 'selected' : ''}>ON</option><option value="off" ${m.auto === false ? 'selected' : ''}>OFF</option></select>
            <label title="nothing is bought, put on or swapped"><input type="checkbox" data-gpautolock="${esc(m.name)}" ${m.lock ? 'checked' : ''}> lock what is equipped</label></div>`).join('')}</div></div>`).join('')}`;
  }
  async function saveAuto(body, okText, askOn) {
    if (askOn && !await uiConfirm({ title: 'Turn auto gear upgrades ON?', body: [uiP(askOn), uiList(['They buy better gear in Giran in every supply run, with their own adena', 'Never another weapon type (the starter weapon a character was created with excepted), never a lower grade, never a shield next to a two-handed weapon', 'Your choices on this page always win']), uiNote('Lock a character to keep exactly what it wears.')], confirmText: 'Turn ON', cancelText: 'Cancel' })) { renderAuto(); return; }
    try {
      const r = await api('/api/gearauto', { method: 'POST', body: JSON.stringify(Object.assign({ confirm: !!askOn }, body)) });
      if (!r || r.error) { flash((r && r.error) || 'not saved', true); await loadAuto(); return; }
      GP.auto = r; renderAuto(); flash(okText + ' · the bots read it within 20 s.');
    } catch (e) { flash('Not saved: ' + e.message, true); }
  }
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
      if (r.legsCleared) okText += ' · full armor: the legs choice was removed';
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
    if (s === 'legs' && d.coverBy) return 'covered by the full armor (' + d.coverBy + ')';
    if (!(d.cand[base(s)] || []).length && !p[s]) return 'nothing at this grade';
    return '';
  };
  const candOf = (d, s, id) => (d.cand[base(s)] || []).find(x => x.id === +id) || null;
  /** what a slot holds: the user's choice (own class, parent line, old role choice) or else the RECOMMENDED item (from: 'rec') */
  //  (legs under a full armor chest = nothing; slot 2's botSkip rec = the epic jewel's partner, only while slot 1 is not the user's own choice)
  const eff = (d, s) => {
    if (s === 'legs' && d.coverBy) return null;
    const P = d.plan || {}, R = d.rec || {};
    if (P[s]) return P[s];
    if (R[s] && !(R[s].botSkip && P[base(s)])) return Object.assign({}, R[s], { from: 'rec' });
    if (/2$/.test(s)) { const b = eff(d, base(s)); return b && !b.none ? Object.assign({}, b, { same: true }) : null; }   // earring 2 / ring 2: the same item worn twice
    return null;
  };
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
  /** MASTERWORK 2026-10-12 (forum topic 430): "MW" chip with the bonus (d.masterwork from Scripts/data/masterwork_ids.json); '' for plain items */
  function mwChip(d, id) {
    const m = d && d.masterwork && d.masterwork[+id];
    return m ? ` <span class="gp-c mwk" title="Masterwork weapon: ${esc(m)} (L2J H5 datapack; forum topic 430). The bots never swap it for a plain weapon of the same grade unless that one is clearly better.">MW · ${esc(m)}</span>` : '';
  }
  /** The chip that says how the bots get the planned item: Giran (gold) or manual (grey). */
  function getChip(d, s, e) {
    if (!e) {
      const a = (d.auto || {})[base(s)];
      return a ? `<span class="gp-c auto" title="no choice: the bots' automatic pick">auto: ${esc(a.name)}</span>` : `<span class="gp-c auto">automatic</span>`;
    }
    if (e.none) return '<span class="gp-c man" title="the bots buy nothing for this slot">left empty</span>';
    if (!BOT.has(s)) return `<span class="gp-c man" title="${esc(e.src || '')}">manual · bots do not buy ${esc(SHORT[s].toLowerCase())}s</span>`;
    const g = e.get;
    if (g) return `<span class="gp-c buy" title="the bots buy this in Giran">Giran ${short(g.price)} · ${esc(g.npc)}${g.how === 'common' ? ' (Common)' : g.how === 'change' ? ' (sword + Change Weapon)' : ''}</span>`;
    return `<span class="gp-c man" title="${esc(e.src || '')}">manual · ${esc(srcShort(e.src))}</span>`;
  }
  const srcShort = (t) => String(t || '').split(' · ')[0].slice(0, 60);
  function cell(d, s) {
    if (!s) return '<span class="gp-cell gp-blank" aria-hidden="true"></span>';
    const e = eff(d, s), off = slotOff(d, s);
    if (off && !e) return `<span class="gp-cell off" title="${esc(SLOT_LABEL[s])}: ${esc(off)}"><i class="lbl">${esc(SHORT[s])}</i>${s === 'legs' && d.coverBy ? '<i class="plus">⛨</i>' : ''}</span>`;
    if (e && e.none) return `<button class="gp-cell none" data-gpslot="${s}" title="${esc(SLOT_LABEL[s])}: left empty (your choice) · tap to change"><i class="lbl">${esc(SHORT[s])}</i><i class="plus">∅</i></button>`;
    if (!e) return `<button class="gp-cell" data-gpslot="${s}" title="${esc(SLOT_LABEL[s])}: tap to choose"><i class="lbl">${esc(SHORT[s])}</i><i class="plus">+</i></button>`;
    const r = candOf(d, s, e.id) || { g: '' }, st = e.get ? 'buy' : 'man', isRec = e.from === 'rec', inh = !isRec && e.from !== d.class.id;
    return `<button class="gp-cell has ${BOT.has(s) ? st : 'man'}${inh ? ' inh' : ''}${isRec ? ' rec' : ''}" data-gpslot="${s}" title="${esc(SLOT_LABEL[s] + ': ' + e.name + (inh ? ' (from ' + fromName(d, e.from) + ')' : ''))}"><img src="${icon(e.id)}" alt="">${grade(r.g)}</button>`;
  }
  const fromName = (d, f) => f === 'rec' ? 'recommended' : /^role:/.test(String(f)) ? 'the old "' + String(f).slice(5) + '" role choice' : ((d.chain || []).find(x => x.id === +f) || {}).name || ('class ' + f);
  function slotRow(d, s) {
    const e = eff(d, s), off = slotOff(d, s);
    if (off && !e) return `<div class="gp-row off"><span class="gp-sl">${esc(SLOT_LABEL[s])}</span><span class="muted">${esc(off)}</span></div>`;
    if (e && e.none) { const inhN = e.from !== d.class.id; return `<button class="gp-row empty none" data-gpslot="${s}" title="tap to choose an item"><span class="gp-ic empty">∅</span><span class="gp-sl">${esc(SLOT_LABEL[s])}</span><span class="gp-nm"><b>Empty</b> <span class="gp-c mine">your choice</span>${inhN ? ` <span class="gp-c inh">from ${esc(fromName(d, e.from))}</span>` : ''} ${getChip(d, s, e)}</span></button>`; }
    if (!e) return `<button class="gp-row empty" data-gpslot="${s}" title="tap to choose"><span class="gp-ic empty">+</span><span class="gp-sl">${esc(SLOT_LABEL[s])}</span><span class="gp-nm">${getChip(d, s, null)}</span></button>`;
    const r = candOf(d, s, e.id) || {}, isRec = e.from === 'rec', inh = !isRec && e.from !== d.class.id, rc = (d.rec || {})[s];
    const set = r.set != null && d.sets[r.set] ? d.sets[r.set] : null;
    const tag = (e.epic ? ' <span class="gp-c epic" title="epic boss jewel: recommended for this grade (its normal alternative is bought until someone has it)">epic</span>' : '') + (isRec ? ' <span class="gp-c rec" title="nobody chose this slot: the planner\'s recommendation (the bots use it)">recommended</span>'
      : ` <span class="gp-c mine" title="your choice wins over the recommendation">your choice</span>${rc && rc.id !== e.id ? ` <span class="gp-c rec" title="${esc(rc.why || '')}">rec.: ${esc(rc.name)}${rc.epic ? ' (epic)' : ''}</span>` : ''}`);
    const why = isRec && !e.same ? `<small class="gp-why">${esc(e.why || '')}</small>` : '';
    const same = e.same ? ' <span class="gp-c" title="nothing chosen for this slot: the first slot\'s item is worn twice">same as slot 1</span>' : '';
    return `<button class="gp-row" data-gpslot="${s}"><img class="gp-ic" src="${icon(e.id)}" alt=""><span class="gp-sl">${esc(SLOT_LABEL[s])}</span>
      <span class="gp-nm"><b>${esc(e.name)}</b> ${grade(r.g)}${mwChip(d, e.id)}${tag}${same}${e.buy && e.buy !== 'auto' ? ` <span class="gp-c">${e.buy === 'real' ? 'real only' : 'Common only'}</span>` : ''}${inh ? ` <span class="gp-c inh">from ${esc(fromName(d, e.from))}</span>` : ''}${(e.alt || []).length ? ` <span class="gp-c">+${e.alt.length} alt.</span>` : ''}
        <small>${esc([statLine(r, s), set ? 'set: ' + set.name : ''].filter(Boolean).join(' · '))}</small>${why}</span>${getChip(d, s, e)}</button>`;
  }
  function render() {
    const d = GP.data; if (!d || !GP.open) return;
    renderHead(); renderClasses();
    const c = d.class, archN = (d.archClasses || []).length;
    $id('gpPlanT').textContent = `${c.name} · ${GRADE_LABEL[d.grade]}${d.grade !== 'NONE' ? '-grade' : ''}`;
    patch($id('gpPlanAct'), `<label class="gp-fb" title="What the bots do while a chosen item cannot be bought">if not for sale
        <select id="gpFallback"><option value="auto"${d.fallback !== 'keep' ? ' selected' : ''}>buy the auto pick</option><option value="keep"${d.fallback === 'keep' ? ' selected' : ''}>keep what they wear</option></select></label>
      <button data-gptool="set" class="${GP.tool === 'set' ? 'on' : ''}" aria-expanded="${GP.tool === 'set'}" title="Put every piece of an armor set into this plan">Apply a set…</button>
      <button data-gptool="eq" class="${GP.tool === 'eq' ? 'on' : ''}" aria-expanded="${GP.tool === 'eq'}" title="Take what one of our characters wears now into this plan">Copy equipped…</button>
      <button data-gptool="copy" class="${GP.tool === 'copy' ? 'on' : ''}" aria-expanded="${GP.tool === 'copy'}" title="Copy this plan to other classes of the same weapon kind">Copy to similar…</button>
      <button data-gpclear title="Remove your choices for this class at this grade: the recommended plan takes over">Reset grade to recommended</button>
      <button data-gpreset="class" title="Remove your choices for every grade of this class">… all grades</button>
      <button data-gpreset="all" title="Remove your choices for EVERY class and grade (the old per-role choices stay)">… all classes</button>`);
    const chainTxt = (d.chain || []).length > 1 ? `<div class="gp-chain muted">Empty slots use: ${(d.chain || []).slice(1).map(x => esc(x.name)).join(' → ')}${c.role ? ' → the old "' + esc(c.role) + '" role choice' : ''} → recommended.</div>` : '';
    patch($id('gpPlan'), `<div class="gp-planwrap"><div class="gp-doll">${DOLL.map(row => row.map(s => cell(d, s)).join('')).join('')}</div>
      <div class="gp-rows">${ORDER.map(s => slotRow(d, s)).join('')}</div></div>${chainTxt}
      <div class="gp-foot muted">${esc(kitText(d))}${d.giranAt ? ' · Giran prices from the shop scan of ' + esc(String(d.giranAt).slice(0, 10)) : ''}</div>`);
    renderTool();
    renderOurs();
    if (GP.pick) renderPick();
  }
  // =========================================================================================== plan tools (D2 set, D10 equipped, D9 copy)
  function copyTargets(d) {
    const M = GP.meta || {}, g = WGROUP(d.class.arch);
    return (M.classes || []).filter(x => x.id !== d.class.id && WGROUP(x.arch) === g);
  }
  function renderTool() {
    const d = GP.data, el = $id('gpTool'); if (!d || !el) return;
    if (!GP.tool) { patch(el, ''); return; }
    const head = (t) => `<div class="gp-toolh"><b>${t}</b><span class="gp-sp"></span><button class="closebtn" data-gptool="${GP.tool}" aria-label="close"></button></div>`;
    if (GP.tool === 'set') {
      const L = d.setList || [];
      if (!L.length) { patch(el, `<div class="gp-tool">${head('Apply a set')}<div class="muted">No armor set at ${esc(GRADE_LABEL[d.grade])} grade that ${esc(d.class.name)} can wear.</div></div>`); return; }
      if (GP.setSel == null || !L.some(x => x.id === +GP.setSel)) GP.setSel = (L.find(x => x.fit) || L[0]).id;
      const S = L.find(x => x.id === +GP.setSel);
      patch(el, `<div class="gp-tool">${head('Apply a set')}
        <div class="gp-toolr"><select id="gpSetSel" aria-label="armor set">${L.map(x => `<option value="${x.id}"${x.id === S.id ? ' selected' : ''}>${esc(x.name)} (${esc((x.t || '').toLowerCase().replace('magic', 'robe'))}${x.full ? ', full armor' : ''})${x.fit ? '' : ' — not this class\'s armor type'}</option>`).join('')}</select>
          <select id="gpSetBuy" aria-label="buy as" title="How the bots buy the pieces"><option value="real"${GP.setBuy === 'real' ? ' selected' : ''}>real pieces (set bonus)</option><option value="auto"${GP.setBuy === 'auto' ? ' selected' : ''}>auto (cheap Common twin when sold)</option></select>
          <button class="go" data-gpsetapply>Apply</button></div>
        <div class="gp-setp">${S.pieces.map(p => `<span class="gp-c"><img src="${icon(p.id)}" alt="">${esc(SHORT[p.slot] || p.slot)}: ${esc(p.n)}</span>`).join(' ')}</div>
        <small class="muted">Set bonus: ${esc(S.bonus || '—')}${S.shield ? ' · with shield: ' + esc(S.shield) : ''}${S.full ? ' · full armor: the legs slot is freed' : ''}</small></div>`);
      return;
    }
    if (GP.tool === 'eq') {
      const ours = ((GP.meta || {}).ours || []).filter(o => o.classId != null), line = new Set((d.chars || []).map(c => c.name));
      ours.sort((a, b) => (line.has(b.name) - line.has(a.name)) || (b.level - a.level));
      if (!ours.length) { patch(el, `<div class="gp-tool">${head('Copy what is equipped')}<div class="muted">No character reports its gear right now.</div></div>`); return; }
      if (!GP.eqSel || !ours.some(o => o.name === GP.eqSel)) GP.eqSel = ours[0].name;
      const cn = (id) => (((GP.meta || {}).classes || []).find(c => c.id === id) || {}).name || '';
      patch(el, `<div class="gp-tool">${head('Copy what is equipped')}
        <div class="gp-toolr"><select id="gpEqSel" aria-label="character">${ours.map(o => `<option value="${esc(o.name)}"${o.name === GP.eqSel ? ' selected' : ''}>${esc(o.name)} · ${esc(cn(o.classId))} ${o.level}${line.has(o.name) ? '' : ' (other class)'}</option>`).join('')}</select>
          <button class="go" data-gpeqcopy>Preview &amp; copy</button></div>
        <small class="muted">Every slot the character wears something in becomes ${esc(d.class.name)}'s ${esc(GRADE_LABEL[d.grade])}-grade choice (Common items as their real twin). Empty slots stay as they are.</small></div>`);
      return;
    }
    if (GP.tool === 'copy') {
      const T = copyTargets(d), g = WGROUP(d.class.arch), M = GP.meta || {};
      if (!GP.copySel) GP.copySel = new Set(T.filter(x => x.arch === d.class.arch).map(x => x.id));
      const byArch = {}; T.forEach(x => { (byArch[x.arch] = byArch[x.arch] || []).push(x); });
      const n = T.filter(x => GP.copySel.has(x.id)).length;
      patch(el, `<div class="gp-tool">${head('Copy to similar classes')}
        <small class="muted">Only ${esc(WGROUP_LABEL[g])} are offered${g === 'fighter' ? ' — dagger and bow classes have their own lists' : ''}. Ticked by default: the same kind as ${esc(d.class.name)}.</small>
        <div class="gp-toolr"><button data-gpcopypick="same">same kind</button><button data-gpcopypick="all">all ${esc(WGROUP_LABEL[g].split(' (')[0])}</button><button data-gpcopypick="none">none</button></div>
        <div class="gp-copyl">${Object.entries(byArch).map(([a, L]) => `<div class="gp-copyg"><div class="gp-rh">${esc(((M.arch || {})[a] || {}).label || a)}</div>${L.map(x => `<label class="gp-copyc"><input type="checkbox" data-gpcopyc="${x.id}"${GP.copySel.has(x.id) ? ' checked' : ''}>${clsIcon(x.id)}<span>${esc(x.name)}</span></label>`).join('')}</div>`).join('') || '<div class="muted">No other class of this kind.</div>'}</div>
        <div class="gp-toolr"><button class="go" data-gpcopygo${n ? '' : ' disabled'}>Copy to ${n} class${n === 1 ? '' : 'es'}</button></div></div>`);
    }
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
      const cnt = { has: 0, buy: 0, man: 0, cost: 0, wh: 0 };
      const strip = slots.map(s => {
        const x = ch.slots[s] || {}, st = ch.own ? (x.st === 'manual' ? 'man' : x.st || 'none') : 'none';
        if (ch.own && cnt[st] != null) cnt[st]++; if (ch.own && st === 'buy') cnt.cost += x.price || 0;
        const w = x.worn, wh = ch.own && x.wh, mwk = w && w.id && d.masterwork ? d.masterwork[+w.id] : '';   // MASTERWORK 2026-10-12
        if (wh) cnt.wh++;
        return `<span class="gp-s ${st}${wh ? ' wh' : ''}" title="${esc(SLOT_LABEL[s] + ': ' + (w ? w.n : 'nothing') + (mwk ? ' — Masterwork: ' + mwk : '') + (x.t ? ' — ' + x.t : '') + (wh ? ` — ${wh.n} is in the ${wh.kind} warehouse (x${wh.c})` : ''))}">${w && w.id ? `<img src="${icon(w.id)}" alt="">` : `<i>${esc(SHORT[s].slice(0, 2))}</i>`}${wh ? '<b class="gp-whdot" aria-hidden="true">W</b>' : ''}${mwk ? '<b class="gp-mwdot" aria-hidden="true">MW</b>' : ''}</span>`;
      }).join('');
      const sum = ch.own ? [cnt.has ? `<span class="ok">${cnt.has} ok</span>` : '', cnt.buy ? `<span class="warn">${cnt.buy} to buy (${short(cnt.cost)})</span>` : '', cnt.man ? `<span class="muted">${cnt.man} manual</span>` : ''].filter(Boolean).join(' · ') || '<span class="muted">nothing chosen yet</span>'
        : `<span class="muted">${esc(ch.cls)} — same class line, uses its own plan</span>`;
      const whRow = cnt.wh ? `<div class="gp-whrow">${whChips(ch)}<button class="gp-whbtn" data-gpwhtake="${esc(ch.name)}" title="Send ${esc(ch.name)} (private) / the clan leader (clan) to the warehouse keeper to take these out">Take from warehouse</button></div>` : '';
      const gNote = ch.own && ch.grade !== d.grade ? ` <span class="gp-c" title="the bots buy for the grade of their level">wears ${esc(GRADE_LABEL[ch.grade])} now</span>` : '';
      return `<div class="gp-char${ch.own ? '' : ' line'}"><a class="gp-cn" href="#/char/${encodeURIComponent(ch.name)}">${clsIcon(ch.classId, 'sm')}<b>${esc(ch.name)}</b><span class="lvl">${ch.level}</span>${ch.online ? '' : '<span class="gp-c">offline</span>'}${gNote}</a>
        <div class="gp-strip">${strip}</div><div class="gp-sum">${sum}</div>${(() => { const ww = ((ch.slots || {}).weapon || {}).worn; return ww && ww.id ? mwChip(d, ww.id).replace(' <span', '<span') : ''; })()}${whRow}${ch.own ? `<div class="gp-whrow"><a class="gp-whbtn" href="#/items/${encodeURIComponent(ch.name)}/shop" title="Every Giran shop (A / B grade at Galladucci and Alexandria too), only what ${esc(ch.name)} can wear — you choose, nothing is bought on its own">Buy in Giran …</a></div>` : ''}</div>`;   // BUY LINK 2026-10-17 (owner: not automatically, but give options to purchase with a warning) · MASTERWORK: the worn weapon's bonus (phones show no titles)
    }).join(''));
  }
  // ---- D8 (user 2026-10-12): "take needed items from the private / clan warehouse (the clan leader grants rights), from the gear tab" ----
  // the API marks a missing planned item that a warehouse holds (slots[S].wh); the button sends "!whtake <id>:<n>,... private|clan <name>"
  // (swarm.js WHTAKE): private = the character itself walks to the keeper; clan = only the clan leader may take it out (L2Toggle), so the
  // order goes to him and he trades it to the character (hand-over).
  function whNeeds(ch) {
    const by = { private: {}, clan: {} };
    ORDER.forEach(s => { const w = ch.slots[s] && ch.slots[s].wh; if (!w) return; const e = by[w.kind][w.id] = by[w.kind][w.id] || { id: w.id, n: w.n, c: 0, have: w.c, slots: [], at: w.at, src: w.src }; e.c++; e.slots.push(SLOT_LABEL[s]); });
    return { private: Object.values(by.private), clan: Object.values(by.clan) };
  }
  function whChips(ch) {
    const N = whNeeds(ch);
    return ['private', 'clan'].filter(k => N[k].length).map(k => `<span class="gp-c wh" title="${esc(N[k].map(e => `${e.n} x${e.c} (${e.have} there) for ${e.slots.join(', ')}`).join(' · ') + (N[k][0].src ? ' — ' + N[k][0].src + (N[k][0].at ? ', ' + String(N[k][0].at).slice(0, 16).replace('T', ' ') : '') : ''))}">in ${k} warehouse x${N[k].reduce((a, e) => a + e.c, 0)}</span>`).join(' ');
  }
  async function whTakeClick(name) {
    const d = GP.data, ch = d && (d.chars || []).find(c => c.name === name); if (!ch) return;
    const N = whNeeds(ch), cl = (d.wh && d.wh.clanLeader) || '';
    const line = (e) => `${e.n}${e.c > 1 ? ' x' + e.c : ''} — for ${e.slots.join(', ')}`;
    const body = [uiP('Missing planned gear that our warehouses hold (as the bots last saw them):')];
    if (N.private.length) body.push(uiH(`Private warehouse (${name} walks to the keeper itself)`), uiList(N.private.map(line)));
    if (N.clan.length) body.push(uiH(`Clan warehouse (${cl || 'the clan leader'} takes it out and trades it to ${name})`), uiList(N.clan.map(line)));
    body.push(uiNote('In a town: the nearest warehouse keeper (Giran: Taurin). In the field a party leader takes the team to Giran first; a member is brought to a town by its leader (Park → warehouse) and then sent again. Equipping is up to the gear upgrade / you.'));
    if (N.clan.length && name !== cl) body.push(uiWarn('Only the clan leader can take items out of the clan warehouse on this server — he walks there and then brings them over.'));
    if (!await uiConfirm({ title: `Take from warehouse — ${name}`, body, confirmText: 'Send', cancelText: 'Cancel' })) return;
    const ids = (L) => L.map(e => `${e.id}:${e.c}`).join(',');
    const sends = [];
    if (N.private.length) sends.push({ cmd: `!whtake ${ids(N.private)} private ${name}`, to: name });
    if (N.clan.length) sends.push({ cmd: `!whtake ${ids(N.clan)} clan ${name}`, to: cl || name });
    const out = [];
    for (const s of sends) {
      try {
        const r = await api('/api/command', { method: 'POST', body: JSON.stringify({ cmd: s.cmd, targets: ['char:' + s.to] }) });
        const one = r && (r.sends || [])[0];
        if (!r || r.error) out.push({ ok: false, t: `${s.to}: not sent — ${(r && r.error) || 'error'}` });
        else if (one && one.ok === false && !one.pending) out.push({ ok: false, t: `${s.to}: ${one.error || 'failed'}` });
        else out.push({ ok: true, t: `${s.to}: "${s.cmd}" sent${one && one.channel === 'file' ? ' (file channel)' : ''}` });
      } catch (e) { out.push({ ok: false, t: `${s.to}: not sent — ${e.message}` }); }
    }
    flash(out.map(o => o.t).join(' · ') + (out.every(o => o.ok) ? ' — they report in party chat (Logs/whtake.log).' : ''), !out.every(o => o.ok));
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
    const plan = d.plan[GP.pick.slot], chosen = new Set(plan && !plan.none ? [plan.id].concat(plan.alt || []) : []);
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
      ${line('Giran', [r.gr ? `real ${r.gr[2] ? 'about ' : ''}${nf(r.gr[1])} at ${esc(r.gr[0])}` : '', r.gc ? `Common ${r.gc[2] ? 'about ' : ''}${nf(r.gc[1])} at ${esc(r.gc[0])} (same stats, no set bonus, no S.A.)` : '', r.gx ? `${esc(r.gx[3])} ${nf(r.gx[1])} at ${esc(r.gx[0])}${r.gx[2] === 'change' ? ' — then Change Weapon (1473) turns it into this' : ''}` : '', (r.gr && r.gr[2]) || (r.gc && r.gc[2]) ? '<span class="muted">price from the game data: the bots read the real price when they buy</span>' : '', r.gu ? `<span class="warn">${esc(r.gu.join(' / '))} sells it, but the bots have no recorded walk to ${r.gu.length > 1 ? 'them' : 'this merchant'} in Giran (record one: Teleports, Giran town routes)</span>` : ''].filter(Boolean).join('<br>') || '<span class="muted">not sold in Giran</span>')}
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
    const cur = plan && plan.none ? `<div class="gp-cur"><span class="muted">Chosen:</span> <span class="gp-chosen"><b>Empty</b> — the bots buy nothing here${plan.from === d.class.id ? '<button class="icon" data-gpuserec title="remove: back to the recommended item" aria-label="remove">✕</button>' : ` <span class="gp-c inh">from ${esc(fromName(d, plan.from))}</span>`}</span></div>`
      : plan ? `<div class="gp-cur"><span class="muted">Chosen:</span> ${[plan.id].concat(plan.alt || []).map((id, i) => {
        const r = candOf(d, P.slot, id) || { n: (i ? plan.altNames[i - 1] : plan.name) };
        return `<span class="gp-chosen">${i ? `<small>alt ${i}</small>` : '<small>1st</small>'}<img src="${icon(id)}" alt="">${esc(r.n)}${i ? `<button class="icon" data-gpup="${id}" title="try earlier" aria-label="move up">↑</button>` : ''}<button class="icon" data-gpdrop="${id}" title="${i ? 'remove this alternative' : 'remove the choice (back to automatic)'}" aria-label="remove">✕</button></span>`;
      }).join('')}${plan.from !== d.class.id ? ` <span class="gp-c inh">from ${esc(fromName(d, plan.from))} — choosing here makes it this class's own</span>` : ''}</div>` : '<div class="gp-cur muted">Nothing chosen by you: the bots use the recommended item below (or their automatic pick).</div>';
    const rc = (d.rec || {})[P.slot] || (/2$/.test(P.slot) ? (d.rec || {})[base(P.slot)] : null);
    const recLine = rc ? `<div class="gp-recl"><span class="gp-c rec">recommended</span>${rc.epic ? '<span class="gp-c epic">epic</span>' : ''}<img src="${icon(rc.id)}" alt=""><b>${esc(rc.name)}</b>${(rc.altNames || []).length ? ` <span class="muted">(then ${esc(rc.altNames.join(', '))})</span>` : ''}
        ${plan && !plan.none && plan.from === d.class.id ? '<button data-gpuserec title="remove your choice for this slot: the recommendation takes over">Use recommended</button>' : plan ? '' : '<span class="gp-c ok">in use</span>'}
        <small class="gp-why">${esc(rc.why || '')}</small></div>`
      : `<div class="gp-recl muted">No recommendation for this slot at this grade${/2$/.test(P.slot) ? ' (the first slot\'s item is worn twice)' : ''}.</div>`;
    const cover = P.slot === 'legs' && d.coverBy ? `<div class="gp-recl warn">The chest (${esc(d.coverBy)}) is a full armor and covers the legs: choose an upper-only chest first.</div>` : '';
    const emptyBtn = plan && plan.none && plan.from === d.class.id ? '' : '<button data-gpnone title="the bots buy nothing for this slot (also no recommended / inherited item)">Leave this slot empty</button>';
    const html = `<div class="gp-ph"><h3>${esc(SLOT_LABEL[P.slot])} <small>${esc(d.class.name)} · ${esc(GRADE_LABEL[d.grade])}</small></h3><button class="closebtn" data-gpclose aria-label="close"></button></div>
      ${cover}${recLine}${cur}<div class="gp-tg">${emptyBtn}</div>
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
          <div class="gp-ir" data-gpexp="${r.id}"><img src="${icon(r.id)}" alt=""><div class="gp-in"><div class="t"><b>${esc(r.n)}</b> ${grade(r.g)}${mwChip(d, r.id)}${r.sa ? ` <span class="gp-c">S.A. ${esc(r.sa)}</span>` : ''}${saCount[r.id] ? ` <span class="gp-c">${saCount[r.id]} S.A.</span>` : ''}${r.set != null ? ' <span class="gp-c set">set</span>' : ''}${r.change ? ' <span class="gp-c">→ ' + esc(r.change) + '</span>' : ''}${r.odd ? ` <span class="gp-c man">${esc(r.odd)}</span>` : ''}${isRec ? ' <span class="gp-c rec">recommended</span>' : ''}${isC ? ` <span class="gp-c ok">${first ? 'chosen' : 'alternative'}</span>` : ''}</div>
            <div class="s">${esc([typeLine(r), statLine(r)].filter(Boolean).join(' · '))}</div><div class="w">${whereChips(r)}</div></div></div>
          ${open ? `${detail(r, d, sas)}<div class="gp-acts">${first ? '<span class="gp-c ok">chosen</span>' : `<button class="go" data-gpchoose="${r.id}">Choose</button>`}${!isC && plan && !plan.none ? `<button data-gpalt="${r.id}">Add as alternative</button>` : ''}</div>` : ''}
        </div>`;
      }).join('') || '<div class="muted gp-empty">Nothing matches. Try "all items" or clear the search.</div>'}${L.length > 250 ? `<div class="muted gp-empty">${L.length - 250} more: refine the search.</div>` : ''}</div>`;
    patch(el, html);
  }

  // =========================================================================================== events
  async function onClick(e) {   // async: the dialogs (UIDIALOG 2026-10-10) return Promises
    const t = e.target;
    // GEARDIST-2026-10-25: the gear-up sources (own warehouse / clan warehouse / distributors / sealed) + removing a distributor
    const gs = t.closest('[data-gpsrc]'); if (gs) { const k = gs.dataset.gpsrc, S = (GP.auto && GP.auto.sources) || {}, to = !S[k]; await saveAuto({ scope: 'sources', [k]: to }, { ownWh: 'Own bag + warehouse', clan: 'Clan warehouse', bags: 'Spare pieces of every character', dist: 'Distributors', unseal: 'Sealed pieces' }[k] + ' before buying: ' + (to ? 'ON' : 'OFF'), ''); return; }
    const gdel = t.closest('[data-gpdist]'); if (gdel) { const S = (GP.auto && GP.auto.sources) || {}, n = gdel.dataset.gpdist; await saveAuto({ scope: 'sources', names: (S.names || []).filter(x => x !== n) }, n + ' is no distributor any more', ''); return; }
    const ga = t.closest('[data-gpauto]'); if (ga) { const to = !(GP.auto && GP.auto.default); await saveAuto({ scope: 'default', auto: to }, 'Auto gear upgrades for everyone: ' + (to ? 'ON' : 'OFF'), to ? 'Every character without its own choice buys gear upgrades by itself.' : ''); return; }
    if (t.closest('#gpClsBtn')) { GP.drawer = !GP.drawer; renderHead(); if (GP.drawer) { const q = $id('gpClsQ'); if (q && window.matchMedia('(pointer: fine)').matches) q.focus({ preventScroll: true }); } return; }
    const cl = t.closest('[data-gpcls]'); if (cl) { GP.cls = +cl.dataset.gpcls; GP.drawer = false; GP.data = null; GP.copySel = null; GP.setSel = null; closePick(); load(true); return; }
    const gr = t.closest('[data-gpgrade]'); if (gr) { GP.grade = gr.dataset.gpgrade; closePick(); load(true); return; }
    const wt = t.closest('[data-gpwhtake]'); if (wt && GP.data) { await whTakeClick(wt.dataset.gpwhtake); return; }
    const sl = t.closest('[data-gpslot]'); if (sl && GP.data) { openPick(sl.dataset.gpslot); return; }
    if (t.closest('[data-gpclose]') || t.id === 'gpPick') { closePick(); return; }
    const tg = t.closest('[data-gptg]'); if (tg) { GP[tg.dataset.gptg] = !GP[tg.dataset.gptg]; renderPick(); return; }
    const ch = t.closest('[data-gpchoose]'); if (ch) {
      const P = GP.pick, plan = GP.data.plan[P.slot], own = plan && !plan.none && plan.from === GP.data.class.id;
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
    const tl = t.closest('[data-gptool]'); if (tl) { GP.tool = GP.tool === tl.dataset.gptool ? null : tl.dataset.gptool; GP.copySel = null; render(); return; }
    if (t.closest('[data-gpnone]')) {
      const P = GP.pick; if (!P) return;
      save({ action: 'none', slot: P.slot }, `${SLOT_LABEL[P.slot]}: left empty`).then(() => renderPick());
      return;
    }
    if (t.closest('[data-gpsetapply]')) {
      const d = GP.data, S = (d.setList || []).find(x => x.id === +GP.setSel); if (!S) return;
      const own = ['chest', 'legs', 'head', 'gloves', 'feet', 'shield'].filter(sl => (d.plan[sl] || {}).from === d.class.id && !(d.plan[sl] || {}).none && S.pieces.some(p => p.slot === sl));
      if (!await uiConfirm({ title: 'Apply ' + S.name + '?', body: [uiP('Every piece goes into the ', uiEm(d.class.name), ` ${GRADE_LABEL[d.grade]}-grade plan:`), uiList(S.pieces.map(p => (SLOT_LABEL[p.slot] || p.slot) + ': ' + p.n)),
        S.full ? 'Full armor: the legs slot is freed.' : '', own.length ? uiNote('Replaces your choices for: ' + own.map(x => SLOT_LABEL[x]).join(', ') + '.') : '', GP.setBuy === 'real' ? 'The bots buy the real pieces (set bonus) where Giran sells them.' : 'The bots buy the cheap Common twin where sold (no set bonus).'], confirmText: 'Apply set' })) return;
      save({ action: 'applyset', set: S.id, buy: GP.setBuy }, S.name + ' applied');
      return;
    }
    if (t.closest('[data-gpeqcopy]')) {
      const d = GP.data, nm = GP.eqSel; if (!nm) return;
      let r; try { r = await api('/api/gearplanner', { method: 'POST', body: JSON.stringify({ class: GP.cls, grade: GP.grade, action: 'fromchar', name: nm, dry: true }) }); } catch (e) { flash('Could not read ' + nm + ': ' + e.message, true); return; }
      if (!r || r.error) { flash((r && r.error) || 'no answer', true); return; }
      const ok = r.rows.filter(x => !x.skip), sk = r.rows.filter(x => x.skip);
      if (!ok.length) { await uiAlert({ title: 'Nothing to copy', body: [`${nm} wears nothing ${d.class.name} can use.`, sk.length ? uiList(sk.map(x => `${SLOT_LABEL[x.slot]}: ${x.n} — ${x.skip}`)) : ''] }); return; }
      if (!await uiConfirm({ title: 'Copy what ' + nm + ' wears?', body: [uiP('Into the ', uiEm(d.class.name), ` ${GRADE_LABEL[d.grade]}-grade plan (${r.char.cls} ${r.char.level}):`), uiList(ok.map(x => `${SLOT_LABEL[x.slot]}: ${x.n}${x.odd ? ' (' + x.odd + ')' : ''}`)),
        sk.length ? uiNote('Skipped: ' + sk.map(x => `${SLOT_LABEL[x.slot]} ${x.n} (${x.skip})`).join('; ')) : '', 'Your choices for these slots are replaced; other slots stay as they are.'], confirmText: `Copy ${ok.length} slots` })) return;
      save({ action: 'fromchar', name: nm }, `${nm}'s gear copied (${ok.length} slots)`);
      return;
    }
    const cp = t.closest('[data-gpcopypick]'); if (cp && GP.data) {
      const T = copyTargets(GP.data), k = cp.dataset.gpcopypick;
      GP.copySel = new Set(k === 'none' ? [] : T.filter(x => k === 'all' || x.arch === GP.data.class.arch).map(x => x.id)); renderTool(); return;
    }
    const ex = t.closest('[data-gpexp]'); if (ex) { GP.exp = GP.exp === +ex.dataset.gpexp ? null : +ex.dataset.gpexp; renderPick(); return; }
    if (t.closest('[data-gpcopygo]')) {
      const d = GP.data, sel = GP.copySel || new Set(), to = copyTargets(d).filter(x => sel.has(x.id));
      if (!to.length) { flash('Tick at least one class.', true); return; }
      if (!Object.keys(d.plan).length) { flash('Nothing chosen yet for this class and grade.', true); return; }
      if (!await uiConfirm({ title: 'Copy the gear plan?', body: [uiP(`Copy the ${GRADE_LABEL[d.grade]}-grade plan of `, uiEm(d.class.name), ` (${Object.keys(d.plan).length} slots) to:`), uiList(to.map(x => x.name)), 'Their own choices for these slots at this grade are replaced. Items a class cannot wear are skipped.'], confirmText: `Copy to ${to.length} classes` })) return;
      save({ action: 'copy', to: to.map(x => x.id) }, `Copied to ${to.length} classes`).then(() => { GP.tool = null; GP.copySel = null; render(); });
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
    const d = e.target.dataset || {};
    if (d.gpautoparty !== undefined || d.gpautochar !== undefined) { const v = e.target.value === 'on' ? true : e.target.value === 'off' ? false : null; const char = d.gpautochar !== undefined; const nm = char ? d.gpautochar : d.gpautoparty;
      saveAuto({ scope: char ? 'char' : 'party', name: nm, auto: v }, (char ? nm : 'party ' + nm) + ': auto gear upgrades ' + (v === null ? 'as ' + (char ? 'its party' : 'everyone') : v ? 'ON' : 'OFF'), v === true ? (char ? nm + ' buys gear upgrades by itself.' : 'Every member of party ' + nm + ' without its own choice buys gear upgrades by itself.') : ''); return; }
    if (d.gpautolock !== undefined) { saveAuto({ scope: 'char', name: d.gpautolock, lock: e.target.checked }, d.gpautolock + ': ' + (e.target.checked ? 'equipment LOCKED (nothing is bought or swapped)' : 'lock removed'), ''); return; }
    if (d.gpskipgrade) { const L = [...document.querySelectorAll('[data-gpskipgrade]')].filter(x => x.checked).map(x => x.dataset.gpskipgrade); saveAuto({ scope: 'policy', skipGrades: L }, L.length ? 'saved: never buys ' + L.join(', ') + '-grade' : 'saved: every grade may be bought', ''); return; }   // SKIPGRADE-2026-10-14
    if (d.gpautopol) { saveAuto({ scope: 'policy', [d.gpautopol]: e.target.checked }, 'saved', ''); return; }
    if (d.gpdistadd !== undefined && e.target.value) { const S = (GP.auto && GP.auto.sources) || {}; saveAuto({ scope: 'sources', names: (S.names || []).concat(e.target.value) }, e.target.value + ' is a distributor now: it hands out gear from its bag in Giran', ''); return; }   // GEARDIST
    if (d.gpautostarter !== undefined) {                                          // TESTERS-2026-10-12: replaced starter gear sell | destroy | keep
      const v = e.target.value, txt = { sell: 'sold at Helvetia (destroyed when the shop refuses it)', destroy: 'destroyed', keep: 'kept in the bag' }[v] || v;
      (async () => {
        if (v === 'destroy' && !await uiConfirm({ title: 'Destroy replaced starter gear?', body: [uiP("After a gear upgrade the starter piece it replaced (Squire's Sword, Apprentice's Wand, Squire's Shirt ...) is destroyed right away instead of sold."), uiNote('Only no-grade starter pieces that were just replaced. Never quest items, enchanted or S.A. items.')], confirmText: 'Destroy them', cancelText: 'Cancel', danger: true })) { renderAuto(); return; }
        saveAuto({ scope: 'policy', starterGear: v }, 'Replaced starter gear: ' + txt, '');
      })();
      return;
    }
    if (d.gpcopyc !== undefined) { GP.copySel = GP.copySel || new Set(); if (e.target.checked) GP.copySel.add(+d.gpcopyc); else GP.copySel.delete(+d.gpcopyc); renderTool(); return; }
    if (e.target.id === 'gpSetSel') { GP.setSel = +e.target.value; renderTool(); return; }
    if (e.target.id === 'gpSetBuy') { GP.setBuy = e.target.value; return; }
    if (e.target.id === 'gpEqSel') { GP.eqSel = e.target.value; return; }
    if (e.target.id === 'gpSort') { GP.sort = e.target.value; renderPick(); }
    if (e.target.id === 'gpBuy') {
      GP.buy = e.target.value;
      const P = GP.pick, plan = P && GP.data.plan[P.slot];
      if (plan && !plan.none && plan.from === GP.data.class.id) save({ action: 'set', slot: P.slot, id: plan.id, alt: plan.alt || [], buy: GP.buy }, 'Buy rule changed');
    }
    if (e.target.id === 'gpFallback') save({ action: 'fallback', fallback: e.target.value }, e.target.value === 'keep' ? 'They keep what they wear until a chosen item can be bought' : 'They buy the automatic pick meanwhile');
  }
  document.addEventListener('keydown', (e) => { if (GP.open && GP.pick && e.key === 'Escape') { e.stopPropagation(); closePick(); } }, true);
  document.addEventListener('visibilitychange', () => { if (GP.open && !document.hidden && !GP.pick) load(false); });

  window.GearPage = { route, open, close, _gp: GP };
})();
