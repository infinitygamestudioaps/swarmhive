// CHARACTER PAGE v2 (user 2026-10-09 09:50: "Under /char/CHARNAME there is a LOT of wasted space on PC and mobile. Make it nice to look at like
// the LIVE view for each char, easy overview, animations ... it should be possible to give DIRECT orders like USE this skill NOW, take this
// potion / mana potion, use SoE NOW, drop this item").
//
// Page #/char/<Name> (index.html route() hook: CharPage.route(kind, arg), before LiveParty). Replaces the old renderCharWin page while this file
// is loaded; without it (server not restarted yet) the old page keeps working.
// Layout: phone = one column; tablet (>= 760 px) = two columns; desktop (>= 1280 px) = three columns that use the full width. The boxes are
// moved between column containers by layout() (no duplicated DOM), so open menus, scroll and inputs survive a resize.
// Data (all read-only):
//   /api/live?party=<party>  every 1.5 s  this character + teammates (swarm_state: cast, aggro, route, target, exp pop-ups, intents) + monsters
//                                         around the party leader (MCP, cached 3 s server side). Cheap: files + one cached MCP call.
//   /api/char?name=          every 5 s    live game data through MCP (status, stats, buffs, inventory, skills incl. cooldowns, NPCs, monsters)
//   /api/intent?name=&n=120  every 10 s   the step timeline
// Nothing is fetched while the browser tab is hidden. Cast ring, cooldown sweeps and buff bars animate locally between refreshes.
// DIRECT ORDERS: Dashboard/override.js (window.Override.send / .open, another module) when loaded; otherwise ORDERS.send posts the same
// '!ov <name> <action>' swarm command to /api/command itself (isolated in sendOv(), so it can be swapped). '/sit' '/stand' are L2Swarm
// chat commands (no override verb). Drop = typed YES, never equipped / quest items / adena.
// Uses index.html globals: esc, api, patch, go, km, clock, fmt, fmtSec, GI, UI, gauge, classIcon, skillIcon, itemIcon, intentText,
// intentResult, timeline, niceTask, partyColor, roomPolyFor, ugLayer, MT, GD, STATE, TAB, stopChar, charBack, sellState, SELL, setClientMode.
(function () {
  'use strict';
  const SEC = 'tab-charpage';
  const CP = { name: null, open: false, party: null, live: null, liveAt: 0, char: null, charAt: 0, intents: [], skew: 0, timers: [], busy: {},
    view: null, follow: true, tilesKey: '', info: '', cols: 0, invF: 'all', invQ: '', pop: null, buffMax: {}, actKey: '', err: '', raf: 0, readyFlash: {}, cry: { rep: null, at: 0, busy: false, on: false, sel: new Set(), ench: false, spec: false, name: '' } };
  const $id = (i) => document.getElementById(i);
  const srvNow = () => Date.now() + CP.skew;
  const nf = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
  const short = (n) => { n = Number(n) || 0; return n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : nf(n); };
  const pcol = (p) => { try { return partyColor(p); } catch (e) { return '#3b82f6'; } };
  const skName = (id) => { try { return ((GD.skills || {})[id] || [])[0] || ('skill ' + id); } catch (e) { return 'skill ' + id; } };
  const live = (c) => c && c.ageSec != null && c.ageSec <= 30;
  const partyOfC = (c) => (typeof c.party === 'string' && c.party) || (typeof c.leader === 'string' && c.leader) || c.name;
  const stateOf = (n) => (typeof STATE !== 'undefined' && STATE && STATE.chars ? STATE.chars.find(x => x.name === n) : null);
  const fsMap = () => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-map')); return v > 0 ? v : 11; };

  // =========================================================================================== page skeleton
  const BOX = (id, title, ic, extra) => `<div class="box cp-box cp-${id}" data-cpsec="${id}"><h3>${GI(ic, 'sm')}<span>${title}</span>${extra || ''}</h3><div id="cp_${id}"></div></div>`;
  function section() {
    let s = $id(SEC);
    if (s) return s;
    s = document.createElement('section'); s.id = SEC; s.className = 'win cp'; s.hidden = true;
    s.innerHTML = `<div class="cp-head" id="cpHead"></div>
      <div class="cp-cols" id="cpCols"><div class="cp-col"></div><div class="cp-col"></div><div class="cp-col"></div></div>
      <div id="cpStore" hidden>
        ${BOX('live', 'Right now', UI.menuAction, '<span class="cp-age" id="cpAge"></span>')}
        ${BOX('state', 'State — what holds it now', UI.system)}<!-- STATECTL-2026-10-22 -->
        <div class="box cp-box cp-map" data-cpsec="map"><h3>${GI(UI.map, 'sm')}<span>Where it is</span><span class="cp-where" id="cpWhere"></span></h3>
          <div class="cp-mapwrap" id="cpMap"><svg id="cpSvg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" data-fsfix="off"><rect id="cpBg" fill="#0d2a33"/><g id="cpTiles"></g><g id="cpOver"></g></svg>
            <div class="cp-zoom"><button id="cpZin" title="zoom in" aria-label="zoom in">+</button><button id="cpZout" title="zoom out" aria-label="zoom out">−</button><button id="cpFollow" class="on" title="follow (fit me and what I am doing)" aria-label="follow">◎</button></div>
            <div class="cp-info" id="cpInfo"></div></div>
          <div class="cp-legend">${legend()}</div></div>
        ${BOX('gear', 'Equipment', UI.shield)}
        ${BOX('frenzy', 'Frenzy kit (HP swap)', UI.sword)}
        <div class="box cp-box cp-inv" data-cpsec="inv"><h3>${GI(UI.inv, 'sm')}<span>Inventory</span><span class="cp-cnt" id="cpInvN"></span><a class="cp-allwh" href="#/items/${encodeURIComponent(CP.name)}" title="Bag, private warehouse and clan warehouse side by side (Items tab)" style="margin-left:auto;font-size:12px;font-weight:normal">Bag + warehouses →</a></h3><!-- ONETAB-2026-10-24 (public tester Mr.P: inventory / private / clan warehouse from one tab) -->
          <div class="cp-invbar"><div class="cp-seg" role="tablist">${[['all', 'All'], ['use', 'Use'], ['gear', 'Gear'], ['mats', 'Materials'], ['quest', 'Quest']].map(([k, t]) => `<button data-cpinvf="${k}" class="${k === 'all' ? 'on' : ''}">${t}</button>`).join('')}</div>
            <input id="cpInvQ" type="search" placeholder="find…" aria-label="find an item"><button type="button" id="cpJunkBtn" class="uk-btn cp-junkbtn" data-cpjunk="mode" aria-pressed="false" title="Tap items to mark or unmark them as junk to sell">Mark junk</button><button type="button" id="cpCryBtn" class="uk-btn cp-crybtn" data-cpcry="mode" hidden>Crystallize</button></div>
          <div class="cp-junkhint muted" id="cpJunkHint" hidden>Tap an item to mark it as junk (crossed out = sold at the next shop visit). Tap again to keep it. Press Done when finished.</div>
          <div id="cp_inv"></div><div id="cp_cry"></div></div>
        ${BOX('skills', 'Skills', UI.skill, '<span class="cp-cnt muted">tap = use now</span>')}
        ${BOX('hive', 'Combat — Hive or my L2Swarm profile', UI.sword)}
        ${BOX('buffs', 'Buffs', UI.buff)}
        ${BOX('timeline', 'Recent steps', UI.target)}
        ${BOX('stats', 'Progress, supplies, stats', UI.char)}
        ${BOX('orders', 'Orders', UI.sword)}
        ${BOX('prio', 'Priority + quest plan', UI.star)}
      </div>`;
    (document.querySelector('main') || document.body).appendChild(s);
    bind(s);
    return s;
  }
  // which box in which column, per layout (phone / tablet / desktop)
  const LAYOUT = {
    1: [['live', 'state', 'map', 'buffs', 'skills', 'hive', 'gear', 'frenzy', 'inv', 'timeline', 'stats', 'orders', 'prio']],
    2: [['live', 'state', 'map', 'buffs', 'timeline', 'orders'], ['gear', 'frenzy', 'skills', 'hive', 'inv', 'stats', 'prio']],
    3: [['live', 'state', 'map', 'timeline'], ['gear', 'frenzy', 'inv', 'stats', 'prio'], ['skills', 'hive', 'buffs', 'orders']],
  };
  function layout() {
    const w = window.innerWidth, n = w >= 1280 ? 3 : w >= 760 ? 2 : 1;
    if (n === CP.cols) return;
    CP.cols = n;
    const cols = [...$id('cpCols').children];
    $id('cpCols').dataset.n = n;
    LAYOUT[n].forEach((ids, i) => ids.forEach(id => { const b = document.querySelector(`#${SEC} [data-cpsec="${id}"]`); if (b) cols[i].appendChild(b); }));
    cols.forEach((c, i) => { c.hidden = i >= n; });
    if (CP.follow) fit(); schedule();
  }
  function legend() {
    const sv = (inner) => `<svg viewBox="0 0 16 12" aria-hidden="true">${inner}</svg>`;
    return [
      ['me', sv('<circle cx="8" cy="6" r="4.6" fill="#3b82f6" stroke="#fff" stroke-width="1.6"/>')],
      ['teammate', sv('<circle cx="8" cy="6" r="3.6" fill="#3b82f6" stroke="#fff" stroke-width="1"/>')],
      ['monster', sv('<circle cx="8" cy="6" r="3" fill="#e0483c" stroke="#000" stroke-width=".6"/>')],
      ['aggro', sv('<line x1="1" y1="10" x2="15" y2="2" stroke="#ff7a45" stroke-width="2"/>')],
      ['target', sv('<line x1="1" y1="6" x2="15" y2="6" stroke="#ffd34d" stroke-width="1.5" stroke-dasharray="2 2"/>')],
      ['route', sv('<polyline points="1,10 6,4 15,6" fill="none" stroke="#3fdc6a" stroke-width="2"/>')],
      ['casting', sv('<circle cx="8" cy="6" r="4.6" fill="none" stroke="#ffcf4d" stroke-width="2" stroke-dasharray="18 30"/>')],
      ['NPC', sv('<rect x="5" y="3" width="6" height="6" fill="#5aa9ff" stroke="#000" transform="rotate(45 8 6)"/>')],
      ['hunting area', sv('<rect x="2" y="2" width="12" height="8" fill="rgba(227,194,122,.15)" stroke="#e3c27a" stroke-dasharray="3 2"/>')],
      ['town paths', sv('<path d="M1 10 L5 4 L10 7 L15 2 M5 4 L6 11" fill="none" stroke="#4da3ff" stroke-width="1.3"/>')],   // TOWN PATHS 2026-10-12
      ['Giran recorded route', sv('<polyline points="1,9 8,5 15,7" fill="none" stroke="#ff9f1c" stroke-width="2"/>')],
    ].map(([t, s]) => `<span>${s}${t}</span>`).join('');
  }

  // =========================================================================================== routing
  function route(kind, arg) {
    if (kind === 'char' && arg) { open(decodeURIComponent(arg)); return true; }
    close();
    return false;
  }
  function open(name) {
    const s = section();
    try { stopChar(); } catch (e) { }
    try { TAB = 'char'; } catch (e) { }                       // index.html: Esc = back, its 4 s refresh leaves the old page alone (CH.name is null)
    try { [...$id('tabs').children].forEach(b => b.classList.remove('on')); } catch (e) { }
    document.querySelectorAll('main > section').forEach(x => { if (x.id !== SEC) x.hidden = true; });
    s.hidden = false;
    if (CP.name !== name) {
      Object.assign(CP, { name, party: null, live: null, liveAt: 0, char: null, charAt: 0, intents: [], qp: null, view: null, follow: true, tilesKey: '', info: '', actKey: '', err: '', buffMax: {}, readyFlash: {} });
      ['cpHead', 'cp_live', 'cp_gear', 'cp_inv', 'cp_skills', 'cp_hive', 'cp_buffs', 'cp_timeline', 'cp_stats', 'cp_orders', 'cp_prio', 'cpTiles', 'cpOver'].forEach(i => { const e = $id(i); if (e) { e.innerHTML = ''; e._last = null; } });
      $id('cpHead').innerHTML = `<div class="muted">Loading ${esc(name)}…</div>`;
      closePop();
    }
    CP.cols = 0; layout();
    CP.open = true;
    window.scrollTo(0, 0);
    stopTimers();
    CP.timers = [setInterval(() => tickLive(), 1500), setInterval(() => tickChar(), 5000), setInterval(() => tickIntents(), 10000), setInterval(() => tickQuest(), 30000), setInterval(anim, 120)];
    tickLive(true); tickChar(true); tickIntents(true); tickQuest(true);
  }
  function stopTimers() { CP.timers.forEach(clearInterval); CP.timers = []; }
  function close() {
    if (!CP.open) return;
    CP.open = false; stopTimers(); closePop();
    const s = $id(SEC); if (s) s.hidden = true;
  }
  document.addEventListener('visibilitychange', () => { if (CP.open && !document.hidden) { tickLive(true); tickChar(true); } });

  // =========================================================================================== data
  function partyName() {
    const st = stateOf(CP.name);
    if (st) return partyOfC(st);
    const sc = CP.char && CP.char.script; if (sc) return partyOfC(sc);
    return null;
  }
  async function guard(key, fn) { if (CP.busy[key]) return; CP.busy[key] = true; try { await fn(); } catch (e) { CP.err = e.message; } finally { CP.busy[key] = false; } }
  function tickLive(force) {
    if (!CP.open || (document.hidden && !force)) return;
    const name = CP.name, p = partyName();
    if (!p) { renderAll(); return; }
    guard('live', async () => {
      const d = await api('/api/live?party=' + encodeURIComponent(p));
      if (!CP.open || CP.name !== name) return;
      if (d && !d.error) { CP.live = d; CP.liveAt = Date.now(); CP.party = d.party; CP.skew = Date.parse(d.now) - Date.now(); CP.err = ''; }
      else CP.err = (d && d.error) || 'no answer';
      renderLive();
    });
  }
  function tickChar(force) {
    if (!CP.open || (document.hidden && !force)) return;
    const name = CP.name;
    guard('char', async () => {
      const d = await api('/api/char?name=' + encodeURIComponent(name));
      if (!CP.open || CP.name !== name) return;
      CP.char = d; CP.charAt = Date.now();
      // ITEMRULE-2026-10-24: the item menu's "otherwise" choices (keep / store / collector), refreshed at most every 60 s
      if (!CP.itemRule || CP.itemRule.name !== name || Date.now() - (CP.itemRuleAt || 0) > 60000) { CP.itemRuleAt = Date.now(); api('/api/itemrule?name=' + encodeURIComponent(name)).then(r => { if (r && !r.error && CP.name === name) CP.itemRule = r; }).catch(() => { }); }
      renderAll();
    });
  }
  function tickIntents(force) {
    if (!CP.open || (document.hidden && !force)) return;
    const name = CP.name;
    guard('int', async () => {
      const r = await api('/api/intent?n=160&name=' + encodeURIComponent(name));
      if (CP.open && CP.name === name) { CP.intents = r.events || []; renderTimeline(); }
    });
  }
  function tickQuest(force) {
    if (!CP.open || (document.hidden && !force)) return;
    const name = CP.name;
    guard('qp', async () => { const r = await api('/api/questplan?name=' + encodeURIComponent(name)); if (CP.open && CP.name === name) { CP.qp = r; renderPrio(); } });
  }
  /** this character: the live member (1.5 s) merged over the dashboard state (4 s) */
  function me() {
    const m = CP.live && (CP.live.members || []).find(x => x.name === CP.name);
    const st = stateOf(CP.name) || (CP.char && CP.char.script) || null;
    if (!m && !st) return null;
    return Object.assign({ name: CP.name }, st || {}, m || {});
  }
  const mates = () => (CP.live ? (CP.live.members || []) : ((typeof STATE !== 'undefined' && STATE && STATE.chars) || []).filter(c => partyOfC(c) === CP.party)).filter(c => c.name !== CP.name);
  // MAP FLOORS 2026-10-13 (user: the maps showed other floors): the map draws only what is on MY floor / level (Dashboard/mapfloors.js)
  const onMyLevel = (p, tol) => { const MF = window.MapFloors, c = me(); return !MF || !c || p == null || p.z == null || MF.same(c, p, tol == null ? MF.CHAR_DZ : tol); };
  const matesHere = () => mates().filter(m => onMyLevel(m));

  // =========================================================================================== render
  function renderAll() { try { const a = document.querySelector('.cp-allwh'); if (a) a.href = '#/items/' + encodeURIComponent(CP.name); } catch (e) { }   // ONETAB: this character's bag + warehouses
    renderHead(); renderLive(true); renderGear(); renderFrenzy(); renderInv(); renderSkills(); renderBuffs(); renderStats(); renderOrders(); renderPrio(); }
  function renderLive(fromAll) {
    if (!CP.open) return;
    if (!fromAll) renderHead();
    renderNow(); renderStatsLight();
    try { if (window.StateCtl && $id('cp_state')) patch($id('cp_state'), StateCtl.listHtml(CP.name, false)); } catch (e) { }   // STATECTL-2026-10-22
    if (CP.follow || !CP.view) fit();
    schedule();
  }

  // ---------------------------------------------------------------- header
  function renderHead() {
    const c = me(), d = CP.char || {}, gc = d.char || {};
    if (!c && !CP.char) return;
    const x = c || { name: CP.name };
    const pct = (a, b) => b ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : null;
    const hp = pct(gc.hp, gc.max_hp) ?? x.hp, mp = pct(gc.mp, gc.max_mp) ?? x.mp, cpp = pct(gc.cp, gc.max_cp) ?? x.cp;
    const exp = Number(gc.exp_percent ?? x.exp ?? 0);
    const online = d.online != null ? d.online : live(x), party = CP.party || partyName() || '';
    const isLeader = party === CP.name;
    const fight = live(x) && (x.combat || (x.doing && x.doing.target)) || d.combat;
    const chips = [
      online ? `<span class="chip ok">${GI(UI.online, 'sm')}online</span>` : `<span class="chip bad">${GI(UI.idle, 'sm off')}offline</span>`,
      d.enabled != null ? `<span class="chip ${d.enabled ? '' : 'bad'}">bot ${d.enabled ? 'on' : 'off'}</span>` : '',
      fight ? `<span class="chip cp-fight">${GI(UI.attack, 'sm')}in combat</span>` : '',
      x.dead ? `<span class="chip bad">${GI(UI.dead, 'sm')}dead</span>` : '',
      d.sitting ? `<span class="chip">${GI(UI.sit, 'sm')}sitting</span>` : '',
      d.zoneType ? `<span class="chip">${esc(String(d.zoneType).toLowerCase().replace(/zone$/, ' zone').replace('peace zone', 'town (peace)'))}</span>` : '',
      x.ageSec > 30 ? `<span class="chip bad">last report ${fmt(x.ageSec)} ago</span> <button class="reloginbtn" data-relogin="${esc(x.name)}" title="Log in again (a hanging session is closed first)">Log in again</button>` : '',
    ].join('');
    const xd = (() => { try { return window.LiveParty ? LiveParty.xpDelta(x, CP.skew, true) : ''; } catch (e) { return ''; } })();
    // LEVEL ETA 2026-10-09 (Dashboard/levelEta.js): a 30-min marker on the EXP bar + the line under the bars (ETA, clock, rate, window)
    const LE = window.LevelEta, leo = { exp, skew: CP.skew }, le = LE ? LE.calc(x, leo) : null;
    const rate = le && le.pctH != null ? LE.rateTxt(le.pctH) : x.expHour && x.expHour.mins >= 3 && x.expHour.n ? `${((LE && LE.hourPct ? LE.hourPct(x) : null) ?? x.expHour.pct / x.expHour.mins * 60).toFixed(2)} %/h` : '';   // EXP TABLE 2026-10-12: points / level size
    const g = (k, p, lab, cls) => `<div class="cp-g"><span class="k">${k}</span>${gauge(k.toLowerCase() === 'exp' ? 'xp' : k.toLowerCase(), p ?? 0, lab, ((cls || '') + (p == null ? ' unk' : '')).trim())}</div>`;
    const peers = mates().sort((a, b) => (b.name === party) - (a.name === party) || a.name.localeCompare(b.name)).map(m =>
      `<button class="cp-peer ${m.dead ? 'dead' : ''} ${live(m) ? '' : 'stale'}" data-char="${esc(m.name)}" title="${esc((m.cls || '') + ' · lvl ' + (m.level ?? '?') + ' · HP ' + (m.hp ?? '?') + '%')}"><span>${esc(m.name)}</span><i style="width:${Math.max(0, Math.min(100, +m.hp || 0))}%"></i></button>`).join('');
    patch($id('cpHead'), `
      <div class="cp-top">
        <button class="cp-back" data-close="1" title="Back (Esc)" aria-label="back">◀</button>
        <div class="cp-avatar">${classIcon({ name: CP.name, role: x.role, classId: gc.class_id ?? x.classId, cls: gc.class_name || x.cls })}<span class="cp-lv">${gc.level || x.level || '?'}</span></div>
        <div class="cp-id"><h2>${esc(CP.name)}${isLeader ? ' ' + GI(UI.star, 'sm', 'party leader') : ''}</h2>
          <div class="cp-sub">${esc(gc.class_name || x.cls || '')}${x.role ? ' · ' + esc(x.role) : ''}${party ? ` · party <a href="#/live/${encodeURIComponent(party)}">${esc(party)}</a>` : ''}${d.account ? '<span data-adv> · ' + esc(d.account) + '</span>' : ''}${window.ClassPlans ? ' ' + ClassPlans.charBadge(CP.name) : ''}</div></div>
        <div class="cp-chips">${chips}</div>
        <div class="cp-acts">${window.ResPanel ? ResPanel.button(CP.name, true) : ''}${window.RunSwitch ? RunSwitch.charBlock(CP.name) : ''}${party && window.PartySettings ? PartySettings.button(party, true) : ''}${window.HealSchemes && HealSchemes.canHeal(CP.name, x) ? HealSchemes.button(CP.name, true) : ''}${party && window.LiveParty ? LiveParty.button(party) : ''}${window.TradePage ? TradePage.button('char:' + CP.name) + TradePage.button('char:' + CP.name + '!all', 'Give everything…') : ''}<button type="button" data-cp3d="1" onclick="location.hash='#/view3d/'+encodeURIComponent(${esc(JSON.stringify(CP.name))})" title="Live 3D view around ${esc(CP.name)}: tap the ground to send it there">${GI(UI.map, 'sm')}3D view</button><button class="ccsheetbtn" data-cmdsheet="char:${esc(CP.name)}" title="Every command for ${esc(CP.name)} (command center)">${GI(UI.menuAction, 'sm')}Commands</button>${window.Override ? `<button data-cpovmenu="1" title="Override menu: skills, potions, scrolls, drop">${GI(UI.sword, 'sm')}Override…</button>` : ''}</div>
      </div>
      <div class="cp-bars">
        ${g('CP', cpp, gc.max_cp ? nf(gc.cp) + ' / ' + nf(gc.max_cp) : (cpp != null ? cpp + '%' : 'CP ?'))}
        ${g('HP', hp, gc.max_hp ? nf(gc.hp) + ' / ' + nf(gc.max_hp) : (hp != null ? hp + '%' : '?'), hp != null && hp < 30 ? 'warn' : '')}
        ${g('MP', mp, gc.max_mp ? nf(gc.mp) + ' / ' + nf(gc.max_mp) : (mp != null ? mp + '%' : '?'))}
        <div class="cp-g cp-xp"><span class="k">EXP</span>${LE ? LE.withMark(gauge('xp', exp, exp.toFixed(2) + '%' + (xd ? ' ' + xd : '')), x, leo) : gauge('xp', exp, exp.toFixed(2) + '%' + (xd ? ' ' + xd : ''))}</div>
        ${LE ? LE.lineHtml(x, leo) : ''}
      </div>
      <div class="cp-money"><span>${GI(UI.adena, 'sm')}<b>${nf(d.adena ?? x.adena ?? 0)}</b> adena</span><span>SP <b>${nf(gc.sp || 0)}</b></span>${rate ? `<span>exp <b>${rate}</b></span>` : ''}${(isFinite(x.x) ? `<span class="muted" data-adv>${Math.round(x.x)}, ${Math.round(x.y)}, ${Math.round(x.z)}</span>` : '')}</div>
      ${window.PurseCard ? PurseCard.charHtml(CP.name) : ''}
      ${peers ? `<div class="cp-peers">${peers}</div>` : ''}
      ${d.error ? `<div class="alert bad">${GI(UI.warn, 'sm')} live game data unavailable: ${esc(d.error)} — showing what the script last reported</div>` : ''}`);
  }

  // ---------------------------------------------------------------- right now (activity, cast, target, aggro) + quick orders
  function activityOf(c) {
    try { if (window.LiveParty && LiveParty._activity && CP.live) return LiveParty._activity(c, CP.live); } catch (e) { }
    if (!live(c)) return { ic: UI.idle, cls: 'bad', h: '<b>not reporting</b>' };
    if (c.dead) return { ic: UI.dead, cls: 'bad', h: '<b>dead</b>' };
    const D = c.doing || {};
    if (D.npc && D.npc.name) return { ic: UI.menuAction || UI.idle, h: `${(D.npc.dist != null && D.npc.dist > 300 ? 'going to' : 'at')} <b>${esc(D.npc.name)}</b>` };   // NPC TARGETS 2026-10-13: a visit, not a fight
    if (D.target) return { ic: UI.attack, h: `fighting <b>${esc(D.target.name)}</b> (${D.target.hp}% HP)` };
    return { ic: UI.idle, h: esc(typeof niceTask === 'function' ? niceTask(c.task) : c.task || 'idle') };
  }
  function aggroOf(c) {
    if (Array.isArray(c.aggro)) return c.aggro;
    if (c.escape && Array.isArray(c.escape.mobs)) return c.escape.mobs.filter(m => m.on || m.hit);
    return [];
  }
  function castBlock(c) {
    const k = c.cast; if (!k || !live(c)) return '';
    const done = !!k.ended, icon = k.kind === 'soe' ? itemIcon(k.id || 736) : k.kind === 'town' ? '/icons/' + UI.map + '.png' : skillIcon(k.skill || k.id);
    const verb = k.kind === 'town' ? 'Teleporting' : /heal|recharge|cure|purify|resurrect|restore|vitalize/i.test(k.name || '') ? 'Healing with' : 'Casting';
    const age = (srvNow() - (Date.parse(k.endedAt || k.start) || 0)) / 1000;
    if (done && age > 6) return '';
    if (!done && window.castGone && castGone(k, srvNow())) return '';   // D13: ran out without an end message
    return `<div class="cp-cast ${done ? (/interrupt|refused|resist|fail/.test(k.ended) ? 'int' : 'okd') : 'going'}" data-start="${esc(k.start)}" data-ms="${+k.ms || 0}" data-ended="${esc(k.ended || '')}">
      <span class="cp-ci"><img src="${icon}" alt="" onerror="this.style.visibility='hidden'"><i class="cp-sweep"></i>
        <svg class="cp-ring" viewBox="0 0 48 48" aria-hidden="true"><circle class="trk" cx="24" cy="24" r="21"/><circle class="arc" cx="24" cy="24" r="21" pathLength="100" stroke-dasharray="0 100"/></svg></span>
      <div class="cp-cw"><div class="cp-ct">${verb} <b>${esc(k.name || skName(k.skill || k.id))}</b>${k.target ? ' → ' + esc(k.target) : ''} <span class="cp-cl"></span></div>
        <div class="cp-cbar"><i></i></div></div></div>`;
  }
  function renderNow() {
    const c = me(); if (!c) return;
    const a = activityOf(c), D = c.doing || {}, ag = aggroOf(c);
    const key = a.h.replace(/\d+(\.\d+)?/g, '#');                     // a NEW activity flashes once (numbers ticking do not)
    const fresh = key !== CP.actKey; CP.actKey = key;
    const tg = D.target;
    const tgt = tg ? `<div class="cp-tg">${GI(UI.target, 'sm')}<span class="n" title="current target">${esc(tg.name)}</span>${gauge('hp', tg.hp, tg.hp + '%', tg.hp < 30 ? 'warn' : '')}<span class="muted">${tg.dist != null ? km(tg.dist) + ' away' : ''}</span></div>` : '';
    const agg = ag.length ? `<div class="cp-agg"><span class="chip aggro">${ag.length} monster${ag.length > 1 ? 's' : ''} on ${esc(CP.name)}</span>${ag.slice(0, 6).map(m => `<span class="chip">${esc(m.n)}${m.lvl ? ' ' + m.lvl : ''}${m.hp != null ? ' · ' + m.hp + '%' : ''}${m.hit ? ' · hits' : ''}</span>`).join('')}</div>` : '';
    const ls = c.lastSkill, lsAge = ls ? (srvNow() - Date.parse(ls.at)) / 1000 : 1e9;
    const last = ls && lsAge < 120 ? `<div class="cp-last muted">last skill: ${esc(skName(ls.id))}${ls.tgt ? ' → ' + esc(ls.tgt) : ''} · ${Math.round(lsAge)} s ago</div>` : '';
    const plainNotes = window.Plain && window.UIKit && !UIKit.isAdv();   // UX audit B3 (2026-10-13): Simple view = notes in plain words
    const notes = (c.notes || []).slice(-3).reverse().map(n => `<div>${esc(plainNotes ? Plain.note(n) : typeof localNote === 'function' ? localNote(n) : n)}</div>`).join('');
    const ageTxt = CP.liveAt ? '' : '';
    patch($id('cp_live'), `<div class="cp-act ${a.cls || ''} ${fresh ? 'cp-new' : ''}">${GI(a.ic || UI.idle)}<span>${a.h}</span></div>
      ${castBlock(c)}${tgt}${agg}${last}
      <div class="cp-quick" role="group" aria-label="direct orders">${quickButtons(c)}</div>
      ${notes ? `<details class="cp-notes"><summary>last notes</summary>${notes}</details>` : ''}${ageTxt}`);
    $id('cpAge').textContent = c.ageSec != null ? (c.ageSec <= 3 ? 'live' : 'reported ' + Math.round(c.ageSec) + ' s ago') : '';
    $id('cpAge').className = 'cp-age ' + (live(c) ? 'ok' : 'bad');
    anim();
  }
  // potions / scrolls in the bag (live inventory), best first
  const bag = () => ((CP.char && CP.char.items) || []).filter(i => !i.equipped && !i.quest);
  function best(re, prefer) {
    const L = bag().filter(i => re.test(i.name));
    if (!L.length) return null;
    L.sort((a, b) => (prefer && prefer.test(b.name)) - (prefer && prefer.test(a.name)) || Number(b.count) - Number(a.count));
    return Object.assign({}, L[0], { total: L.filter(i => i.id === L[0].id).reduce((s, i) => s + Number(i.count || 0), 0) });
  }
  function quickButtons(c) {
    const mp = best(/mana potion/i, /greater/i), hp = best(/healing potion/i, /greater/i), cpp = best(/cp potion/i, /greater/i), soe = best(/scroll of escape/i, /^scroll of escape$/i);
    const known = !!(CP.char && CP.char.items && CP.char.items.length);
    const q = (k, it, label, icon, title) => `<button class="cp-qb" data-cpq="${k}" ${known && !it ? 'disabled' : ''} title="${esc(title + (it ? ' — ' + it.name + ' ×' + nf(it.total) : known ? ' — none in the bag' : ''))}"><img src="${it ? itemIcon(it.id) : icon}" alt="" onerror="this.style.visibility='hidden'"><span>${label}</span>${it ? `<b>${short(it.total)}</b>` : ''}</button>`;
    const sit = CP.char && CP.char.sitting;
    return q('mp', mp, 'Mana', itemIcon(728), 'Take a Mana Potion now') + q('hp', hp, 'Heal', itemIcon(1061), 'Take a healing potion now (Greater Healing Potion)') + q('cp', cpp, 'CP', itemIcon(5592), 'Take a CP Potion now') +
      `<button class="cp-qb warn" data-cpq="soe" title="Scroll of Escape NOW (asks first)${soe ? ' — ' + nf(soe.total) + ' in the bag' : ''}"><img src="${itemIcon(soe ? soe.id : 736)}" alt="" onerror="this.style.visibility='hidden'"><span>SoE now</span>${soe ? `<b>${short(soe.total)}</b>` : ''}</button>` +
      `<button class="cp-qb" data-cpq="stop" title="Stop attacking / casting once">${GI(UI.idle, 'sm')}<span>Stop</span></button>` +
      `<button class="cp-qb" data-cpq="tgt" title="Target the nearest monster">${GI(UI.target, 'sm')}<span>Target</span></button>` +
      `<button class="cp-qb" data-cpq="${sit ? 'stand' : 'sit'}" title="${sit ? 'Stand up' : 'Sit down (rest)'}">${GI(UI.sit, 'sm')}<span>${sit ? 'Stand' : 'Sit'}</span></button>`;
  }

  // ---------------------------------------------------------------- equipment (paper doll)
  const SLOTS = [['ear1', 'Earring'], ['head', 'Helmet'], ['wpn', 'Weapon'], ['neck', 'Necklace'], ['chest', 'Chest'], ['shield', 'Shield'], ['ear2', 'Earring'], ['legs', 'Legs'], ['hair', 'Hair'],
    ['ring1', 'Ring'], ['gloves', 'Gloves'], ['under', 'Shirt'], ['ring2', 'Ring'], ['feet', 'Boots'], ['back', 'Cloak / belt']];
  function slotOf(i, used) {
    const b = String(i.slot || '').toUpperCase();
    const two = (a, z) => used[a] ? z : a;
    if (/EAR/.test(b)) return two('ear1', 'ear2');
    if (/FINGER/.test(b)) return two('ring1', 'ring2');
    if (/NECK/.test(b)) return 'neck';
    if (/HEAD/.test(b)) return 'head';
    if (/HAIR/.test(b)) return 'hair';
    if (/FULL_ARMOR|CHEST/.test(b)) return 'chest';
    if (/LEGS/.test(b)) return 'legs';
    if (/GLOVES/.test(b)) return 'gloves';
    if (/FEET/.test(b)) return 'feet';
    if (/^L_HAND/.test(b)) return 'shield';
    if (/HAND/.test(b)) return 'wpn';
    if (/UNDER/.test(b)) return 'under';
    if (/BACK|BELT|CLOAK/.test(b)) return 'back';
    return null;
  }
  const grade = (g) => g && g !== 'None' && g !== 'NONE' ? `<em class="gr g-${esc(String(g).toLowerCase())}">${esc(g)}</em>` : '';
  function renderGear() {
    const d = CP.char; if (!d) return;
    const eq = (d.items || []).filter(i => i.equipped), used = {}, extra = [];
    eq.forEach(i => { const s = slotOf(i, used); if (s && !used[s]) used[s] = i; else extra.push(i); });
    const full = used.chest && /FULL_ARMOR/.test(String(used.chest.slot).toUpperCase());
    const cell = ([k, label]) => {
      const i = used[k];
      if (!i) return `<span class="cp-slot ${k === 'legs' && full ? 'full' : ''}" title="${label}${k === 'legs' && full ? ' (full armor)' : ''}: empty"><i class="lbl">${k === 'legs' && full ? '▲' : label}</i></span>`;
      return `<span class="cp-slot has" data-cpitem="${esc(i.objId || i.id)}" title="${esc(i.name + (i.enchant ? ' +' + i.enchant : '') + ' · ' + (i.grade || '') + ' · ' + (i.slot || ''))}"><img src="${itemIcon(i.id)}" alt="">${i.enchant ? `<b class="en">+${i.enchant}</b>` : ''}${grade(i.grade)}</span>`;
    };
    const w = used.wpn, sc = me() || {};
    const shots = bag().filter(i => i.type === 'Shot').sort((a, b) => b.count - a.count);
    patch($id('cp_gear'), `<div class="cp-gearwrap"><div class="cp-doll">${SLOTS.map(cell).join('')}</div>
      <div class="cp-gearinfo">${w ? `<div class="cp-wpn"><b>${esc(w.name)}</b>${w.enchant ? ' <span class="en">+' + w.enchant + '</span>' : ''} ${grade(w.grade)}</div>` : '<div class="muted">no weapon</div>'}
        ${eq.filter(i => i !== w).map(i => `<div class="cp-eqrow" data-cpitem="${esc(i.objId || i.id)}"><img src="${itemIcon(i.id)}" alt=""><span>${esc(i.name)}${i.enchant ? ' <b class="en">+' + i.enchant + '</b>' : ''}</span>${grade(i.grade)}</div>`).join('')}
        ${shots.length ? `<div class="cp-shots">${shots.slice(0, 3).map(s => `<span class="chip" title="${esc(s.name)}"><img src="${itemIcon(s.id)}" alt="">${short(s.count)}</span>`).join('')}${sc.shots != null && sc.shots <= 100 ? '<span class="chip bad">low shots</span>' : ''}</div>` : ''}
        <a class="cp-upg" href="#/upgrade/${encodeURIComponent(CP.name)}" title="Recommended upgrades for every slot from every bag, warehouse, the clan warehouse, other characters (trade), Giran shops (with the cost) and our crafters; the order waits for the next Giran visit, or Send now (alone / whole party)">Upgrade ›</a></div></div>`);   // UPGWPN-2026-10-23 (owner: weapon upgrades only when picked, from the character)
  }

  // ---------------------------------------------------------------- FRENZY KIT (owner 2026-10-14: "a full overview for a destroyer, showing what it
  // is missing in order to do the frenzy with item changing"): /api/frenzykit (Dashboard/frenzykit_api.js) + the live skill list. Destroyers only.
  const FK_RE = /Destroyer|Titan|Orc Raider/i;
  function renderFrenzy() {
    const box = document.querySelector(`#${SEC} [data-cpsec="frenzy"]`); if (!box) return;
    const sc = me() || {}, cls = String(sc.cls || (CP.char && CP.char.class_name) || '');
    if (!FK_RE.test(cls)) { box.hidden = true; return; }
    box.hidden = false;
    const name = CP.name;
    if (!CP.fk || CP.fk.name !== name || Date.now() - CP.fkAt > 30000) {
      if (!CP.fkBusy) { CP.fkBusy = true; api('/api/frenzykit?name=' + encodeURIComponent(name)).then(d => { CP.fkBusy = false; if (CP.name !== name) return; CP.fk = d; CP.fkAt = Date.now(); renderFrenzy(); }).catch(() => { CP.fkBusy = false; }); }
      if (!CP.fk || CP.fk.name !== name) { patch($id('cp_frenzy'), '<div class="muted">loading…</div>'); return; }
    }
    const K = CP.fk; if (!K || K.error) { patch($id('cp_frenzy'), `<div class="muted">${esc((K && K.error) || 'no answer (the dashboard server may need a restart)')}</div>`); return; }
    const sk = (CP.char && CP.char.skills) || [], skHave = (n) => sk.find(k => k.name === n);
    if (!sk.length) { /* the live skill list is not loaded (offline / no game data) */ }
    const skills = !sk.length ? '<span class="muted">skill list not loaded (character offline?)</span>' : (K.skills || []).map(n => { const k = skHave(n); return `<span class="fk-chip ${k ? 'ok' : 'no'}" title="${k ? esc(n + ' Lv ' + k.level) : esc(n) + ' not learned yet'}">${k ? `<img class="fk-sic" src="${skillIcon(k.skill_id)}" alt="">` : ''}${k ? '✓' : '✗'} ${esc(n)}</span>`; }).join('');
    const WH = { worn: ['ok', 'worn'], bag: ['ok', 'in the bag'], clan: ['warn', 'in the clan warehouse'] };
    const sealTxt = (hv) => hv && hv.sealed ? ` — sealed: unsealed at Pushkin next time in town (${price(hv.price)} ${hv.pay === 57 ? 'adena' : 'Ancient Adena'})` : '';   // KITGET
    const price = (p) => p >= 1e6 ? (Math.round(p / 1e5) / 10) + 'M' : p >= 1e3 ? Math.round(p / 1e3) + 'k' : String(p || '?');
    const row = (x) => { const st = x.have ? WH[x.have.where] : ['no', 'missing'];
      const iid = x.have ? x.have.id : x.cheapest ? x.cheapest.id : 0;   // FRENZY KIT icons (owner 2026-10-14): what it has, else the cheapest option (dimmed)
      return `<div class="fk-row"><span class="fk-st ${st[0]}">${x.have ? (x.have.where === 'clan' ? '▣' : '✓') : '✗'}</span>${iid ? `<img class="fk-ic ${x.have ? '' : 'miss'}" src="${itemIcon(iid)}" alt="">` : ''}<span class="fk-what"><b>${esc(x.label)}</b><small>${x.have ? esc(st[1] + ': ' + x.have.name) + esc(sealTxt(x.have)) : esc(x.why)}${!x.have && x.cheapest ? ` — cheapest: ${esc(x.cheapest.name)} (${esc(x.cheapest.grade)}, ~${price(x.cheapest.price)} adena, ${x.options} options)` : ''}</small></span></div>`; };
    const set = (k) => (K.slots || []).filter(x => x.set === k);
    const miss = (k) => set(k).filter(x => !x.have || x.have.where === 'clan' || x.have.sealed).length;
    const toGet = (K.slots || []).filter(x => x.have && (x.have.where === 'clan' || x.have.sealed));   // KITGET
    const lowM = miss('low'), highM = miss('high'), skM = sk.length ? (K.skills || []).filter(n => !skHave(n)).length : 0;
    const sum = !K.ready.swap ? `<b class="bad">The gear swap does nothing yet</b>: no high-HP piece in the bag, so it drains by ${K.partners.length ? 'hitting ' + esc(K.partners.join(' / ')) : 'nothing (no other destroyer in the party!)'} only.`
      : lowM || highM ? `<b class="warn">Gear swap partly possible</b>: ${lowM} low-HP and ${highM} high-HP piece(s) missing.` : '<b class="ok">Everything for the gear swap is there.</b>';
    const roleW = K.roleOk === false ? `<div class="fk-sum"><b class="bad">This character's role is "${esc(K.role || '?')}", not destroyer: the bots never drain or cast Frenzy with it.</b></div>` : '';
    const buyBtn = (toGet.length ? `<div class="fk-act"><button type="button" class="fk-buybtn" data-fkget="1">Get ${toGet.length} piece${toGet.length === 1 ? '' : 's'} from the clan warehouse${toGet.some(x => x.have.sealed) ? ' + unseal' : ''}…</button><small>Next time ${esc(name)} is in Giran (or now): takes them out${toGet.some(x => x.have.sealed) ? ', unseals the sealed ones at Pushkin' : ''}, keeps them in the bag for the swap.</small></div>` : '')
      + (lowM || highM ? `<div class="fk-act"><button type="button" class="fk-buybtn" data-fkbuy="1">Buy what is missing…</button><small>Never automatic: the destroyer only goes shopping when you press this and confirm.</small></div>` : '');   // KITBUY 2026-10-15
    patch($id('cp_frenzy'), `${roleW}<div class="fk-sum">${sum}</div>${buyBtn}
      <div class="fk-sub">Skills ${skM ? '<small>(' + skM + ' not learned yet)</small>' : ''}</div><div class="fk-chips">${skills}</div>
      <div class="fk-sub">Drain partner (they lower each other's HP)</div><div class="fk-row"><span class="fk-st ${K.partners.length ? 'ok' : 'no'}">${K.partners.length ? '✓' : '✗'}</span><span class="fk-what"><b>${K.partners.length ? esc(K.partners.join(', ')) : 'No other destroyer in the party'}</b><small>${K.partners.length ? 'they hit each other carefully until both are low enough' : 'without one (and without the gear swap) it cannot get its HP low for Frenzy'}${(K.otherDestroyers || []).length > 1 ? ' · pairs in name order: ' + esc(K.otherDestroyers.length + 1) + ' destroyers in the party' : ''}</small></span></div>
      <div class="fk-sub">1 · Low-HP set (put on first) ${lowM ? '<small>' + lowM + ' missing</small>' : ''}</div>${set('low').map(row).join('')}
      <div class="fk-sub">2 · High-HP set (put on next: Max HP up, the % drops) ${highM ? '<small>' + highM + ' missing</small>' : ''}</div>${set('high').map(row).join('')}
      <div class="fk-sub">Optional</div>${set('btb').map(row).join('')}
      <div class="fk-note">In a raid the bot swaps to whatever it has of set 1, then set 2, casts Zealot → Frenzy → Guts → Rage → Battle Roar, then puts its own gear back. Items in the clan warehouse (▣) must be taken out first (Storage page → Clan warehouse → Take out). Not done by the bots: the Blessed Body trick and the weight-penalty trick. Prices are the game's reference prices, not shop prices. The kit is never bought by itself: use “Buy what is missing”.</div>`);
  }

  // KITBUY 2026-10-15 (owner: "The destroyer swap kit should never be bought automatically, there should be a button to make the character go
  // purchase what is needed"): /api/frenzykit?buy=1 -> one styled dialog (uidialog uiForm, a checkbox per piece) -> the order '!kitbuy <Name> <ids>'
  // (swarm.js KITBUY block: only that character, .giran first by the order rules, buys exactly the ticked pieces, puts nothing on). Pieces in the
  // clan warehouse: the clan leader may take them out instead ('!whtake <id>:1 clan <Name>'), anyone else gets a note.
  // KITGET-2026-10-25 (owner: "why cant i ask it to get all the items from clan warehouse? ... sealed ... should just say that it needs to unseal it upon
  // reaching town"): one confirm -> POST /api/frenzykit/get (queued for the next Giran visit, or now)
  async function frenzyGet() {
    const name = CP.name, K = CP.fk; if (!K) return;
    const L = (K.slots || []).filter(x => x.have && (x.have.where === 'clan' || x.have.sealed));
    if (!L.length) return;
    const lines = L.map(x => `${x.label}: ${x.have.name}${x.have.where === 'clan' ? ' (clan warehouse)' : ''}${x.have.sealed ? ' — sealed, unsealed at Pushkin into ' + x.have.toName : ''}`).join('\n');
    const v = await uiChoice({ title: name + ': get the Frenzy kit pieces', body: [uiP(lines)],
      buttons: [{ value: 'town', label: 'Next time in Giran', primary: true }, { value: 'now', label: 'Go to Giran now' }] }).catch(() => null);
    if (v !== 'town' && v !== 'now') return;
    let r = null; try { r = await api('/api/frenzykit/get', { method: 'POST', body: JSON.stringify({ name, now: v === 'now' }) }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) { uiError((r && r.error) || 'not sent', 'Frenzy kit'); return; }
    toast(name + ': Frenzy kit — ' + (r.queued ? 'waits for the next Giran visit' : 'going to Giran now'), true);
    CP.fk = null; CP.fkAt = 0; renderFrenzy();
  }
  async function frenzyBuy() {
    const name = CP.name;
    let d = null; try { d = await api('/api/frenzykit?name=' + encodeURIComponent(name) + '&buy=1'); } catch (e) { return uiError('Could not read the Frenzy kit: ' + e.message); }
    if (!d || d.error || !d.buy) return uiError((d && d.error) || 'No answer about the shops (the dashboard server may need a restart).');
    if (CP.name !== name) return;
    const B = d.buy, rows = B.rows || [], aden = (n) => nf(n) + ' adena';
    const buyRows = rows.filter(r => r.status === 'buy'), notSold = rows.filter(r => r.status !== 'buy' && !r.clanId), clanRows = rows.filter(r => r.clanId);
    const notSoldList = notSold.length ? [uiH('Not sold in Giran (get these elsewhere)'), uiList(notSold.map(r => [uiEm(r.label), ': ' + r.name + ' (' + (r.grade || '?') + ') — ' + r.why]))] : [];
    const clanNote = clanRows.length && !B.isClanLeader ? [uiH('Already in the clan warehouse'), uiList(clanRows.map(r => [uiEm(r.label), ': ' + (r.clanName || r.name) + ' — only the clan leader' + (B.clanLeader ? ' (' + B.clanLeader + ')' : '') + ' can take it out (Storage page → Clan warehouse)']))] : [];
    if (!rows.length) return uiAlert({ title: name + ': nothing is missing', body: 'Every piece of the low-HP and the high-HP set is worn or in the bag.', kind: 'ok' });
    if (!buyRows.length && !(clanRows.length && B.isClanLeader)) {
      return uiAlert({ title: name + ': nothing here can be bought in Giran', kind: 'info', body: [uiP('None of the missing pieces is sold by a Giran merchant we have a recorded route to' + (B.scanAt ? ' (shop lists from ' + String(B.scanAt).slice(0, 10) + ')' : '') + '. Giran\'s weapon and armor merchants sell up to C grade; the Doom (B) and Tallum (A) heavy pieces and every weapon with a Special Ability come from drops, crafting or trades.'), ...notSoldList, ...clanNote,
        uiNote('Nothing was sent. The bot uses whatever kit pieces it carries in the bag for the HP swap before Frenzy.')] });
    }
    const where = B.inGiran ? name + ' is in Giran: it walks the recorded Giran routes to the merchants.'
      : B.solo || B.isLeader ? name + (B.solo ? ' is not in Giran: it goes there with .giran first' : ' leads party ' + B.party + ' and is not in Giran: the whole party goes to Giran with .giran first') + ' (the normal safe-teleport checks: fights finished, out of aggro), buys, then ' + (B.leveling ? 'leveling starts again.' : 'waits for your next order.')
      : name + ' is a member of party ' + B.party + ' and not in Giran: its leader takes the whole party to Giran (a member never teleports alone), waits until it has bought, then the party carries on with what it was doing.';
    const warns = [];
    if (B.raid) warns.push(uiWarn('The party is busy (' + B.raid + '): ' + name + ' waits until that is over (max 45 min) and never shops during a raid fight.'));
    if (B.huntTimer && !B.inGiran) warns.push(uiWarn('The party\'s hunting timer is running: this is your order, so the party still goes to Giran (the timer only holds automatic trips).'));
    if (!B.online) warns.push(uiWarn(name + ' is not reporting in right now: the order waits in the order queue until it is online (10 min).'));
    const fields = [];
    if (buyRows.length) fields.push({ id: 'buy', label: 'Buy in Giran (one of each, not worn)', multi: true, column: true,
      options: buyRows.map(r => ({ value: r.id, checked: !r.clanId, label: pieceName(r) + ' — ' + aden(r.price) + ' at ' + r.npc + (r.clanId ? ' (one is in the clan warehouse)' : '') + (r.est ? ' (estimated price)' : ''), hint: r.why })) });
    if (clanRows.length && B.isClanLeader) fields.push({ id: 'clan', label: 'Take out of the clan warehouse instead (free)', multi: true, column: true,
      options: clanRows.map(r => ({ value: r.clanId, checked: true, label: r.label + ': ' + (r.clanName || r.name) })) });
    function pieceName(r) { const l = String(r.label || '').replace(/ \(heavy\)$/, ''); return String(r.name || '').indexOf(l) === 0 ? r.name : r.label + ': ' + r.name; }   // 'Doom Plate Armor' once, not twice
    const priceOf = (id) => { const r = buyRows.find(x => x.id === id); return r ? r.price : 0; };
    const res = await uiForm({ title: name + ': buy the missing Frenzy kit pieces?', fields,
      body: [uiP(where), ...warns, ...notSoldList, ...clanNote],
      render: (v) => {
        const ids = v.buy || [], sum = ids.reduce((a, id) => a + priceOf(id), 0), tax = Math.round(sum * 0.2), have = B.adena;
        const out = [uiKV([['Ticked', ids.length + ' piece(s)' + ((v.clan || []).length ? ' + ' + v.clan.length + ' from the clan warehouse' : '')], ['Price', aden(sum)], ['+ castle tax (about 20 %)', aden(tax)], ['Total', aden(sum + tax)], [name + ' has', have == null ? 'unknown' : aden(have)]])];
        if (have != null && sum + tax > have) out.push(uiWarn('Not enough adena for all ticked pieces: it buys in the order shown and skips what it cannot pay (it checks the price and its adena before each piece). Give it adena first (Trade page) or untick some.'));
        out.push(uiNote('Nothing is put on: the bot wears these pieces only during the HP swap before Frenzy, then its own gear goes back on. A piece of a slot it already owns is never bought twice. Report: party chat + Logs/frenzykit_buys.log.'));
        return out;
      },
      buttons: [{ label: 'Send the order', value: 'go', primary: true }] });
    if (!res || res.value !== 'go') { toast(name + ': Frenzy kit — cancelled', null); return; }
    const ids = (res.values.buy || []).map(Number).filter(Boolean), clan = (res.values.clan || []).map(Number).filter(Boolean);
    if (!ids.length && !clan.length) { toast(name + ': nothing ticked — nothing sent', false); return; }
    if (clan.length) await post('!whtake ' + clan.map(id => id + ':1').join(',') + ' clan ' + name, 'take ' + clan.length + ' kit piece(s) out of the clan warehouse');
    if (ids.length) await post('!kitbuy ' + name + ' ' + ids.join(','), 'Frenzy kit: buy ' + ids.length + ' piece(s) in Giran');
    CP.fkAt = 0;
  }

  // ---------------------------------------------------------------- inventory grid
  const USE_RE = /potion|scroll|elixir|herb|tonic|juice|soulshot|spiritshot|arrow|bolt|box|pack|coupon|ticket|gift|spirit ore|crystal/i;
  function cat(i) { if (i.quest) return 'quest'; if (i.type === 'Weapon' || i.type === 'Armor') return 'gear'; if (i.type === 'Mats') return 'mats'; if (i.type === 'Shot' || USE_RE.test(i.name)) return 'use'; return 'mats'; }
  // WAREHOUSE STASH (2026-10-09): swarm_state.stash = { slots, kinds, limit, full, last: { at, n, fee, keeper, ok, why } } -> one short line
  function whLine() {
    try {
      const w = (me() || {}).stash; if (!w || (!w.slots && !w.last)) return '';
      const t = w.last && w.last.at ? new Date(w.last.at) : null, hm = t ? `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : '';
      return ` · warehouse ${w.slots || 0}${w.limit ? '/' + w.limit : ''} slots${w.full ? ' FULL' : ''}${t ? ` · last deposit ${t.toDateString() === new Date().toDateString() ? hm : t.toLocaleDateString()} (${w.last.n} kinds${w.last.ok === false && w.last.why ? ', ' + w.last.why : ''})` : ''}`;
    } catch (e) { return ''; }
  }
  function renderInv() {
    const d = CP.char; if (!d) return;
    const all = (d.items || []).filter(i => !i.equipped && i.id !== 57);
    const q = CP.invQ.trim().toLowerCase();
    const order = { use: 0, gear: 1, mats: 2, quest: 3 };
    const L = all.filter(i => (CP.invF === 'all' ? cat(i) !== 'quest' || q : cat(i) === CP.invF) && (!q || i.name.toLowerCase().includes(q)))
      .sort((a, b) => order[cat(a)] - order[cat(b)] || a.name.localeCompare(b.name));
    $id('cpInvN').textContent = `${all.filter(i => !i.quest).length} items${all.some(i => i.quest) ? ' · ' + all.filter(i => i.quest).length + ' quest' : ''}${whLine()}`;
    const sel = (i) => { try { const s = sellState(i.id, CP.name); return s && s !== 'keep' ? (noShopWhy(i.id) ? ' selling nosell' : ' selling') : ''; } catch (e) { return ''; } };
    cryLoad(false); const C = CP.cry, cj = cryMap();   // CRYINV-2026-10-22
    const cryCls = (i) => { if (!C.on) return ''; const j = cj[Number(i.objId)]; if (!j || cryBlockUi(j)) return ' cry-no'; return C.sel.has(Number(i.objId)) ? ' cry-sel' : ' cry-ok'; };
    patch($id('cp_inv'), L.length ? `<div class="cp-igrid${CP.junk ? ' junkmode' : ''}">${L.map(i => `<button class="cp-it c-${cat(i)}${sel(i)}${cryCls(i)}" data-cpitem="${esc(i.objId || i.id)}" title="${esc(i.name + (i.enchant ? ' +' + i.enchant : '') + ' ×' + nf(i.count) + (i.grade && i.grade !== 'None' ? ' · ' + i.grade : ''))}">
      <img src="${itemIcon(i.id)}" alt="">${i.enchant ? `<b class="en">+${i.enchant}</b>` : ''}${Number(i.count) > 1 ? `<b class="n">${short(i.count)}</b>` : ''}${grade(i.grade)}</button>`).join('')}</div>`
      : `<div class="muted">${(d.items || []).length ? 'nothing matches' : d.error ? 'no game data' : 'loading…'}</div>`);
    renderCry();
  }

  // ---------------------------------------------------------------- crystallize from the inventory (CRYINV-2026-10-22)
  // Owner 2026-10-22: "crystallize items inside inventories IF it's a dwarf that is hunting ... the button inside the inventory for a character".
  // Only for a character with the Crystallize skill (its swarm.js writes Logs/crafter_bag_<name>.json = which pieces can go and why not; read
  // through GET /api/crafter, once a minute). Tap Crystallize -> tap pieces (or "All that can go") -> red confirm -> POST /api/crafter/crystallize
  // (checked again on the server against the bag report, then "!crystallize <name> <ids>"). A hunting dwarf waits for a quiet moment itself.
  const CRY_GRADES = ['D', 'C', 'B', 'A', 'S'];
  function cryLoad(force) {
    const C = CP.cry;
    if (!CP.name || C.busy || (!force && Date.now() - C.at < 60000 && C.name === CP.name)) return;
    if (C.name !== CP.name) { C.rep = null; C.on = false; C.sel.clear(); C.name = CP.name; }
    C.busy = true; C.at = Date.now(); const want = CP.name;
    api('/api/crafter').then(j => {
      if (CP.name !== want) return;
      const c = ((j && j.crafters) || []).find(x => x.name === want);
      C.rep = c && c.bag && Number(c.bag.skill) > 0 ? c.bag : null;
      if (!C.rep) { C.on = false; C.sel.clear(); }
      renderInv();
    }).catch(() => { }).finally(() => { C.busy = false; });
  }
  function cryMap() { const m = {}; ((CP.cry.rep && CP.cry.rep.cryst) || []).forEach(j => { m[Number(j.objId)] = j; }); return m; }
  /** = swarm.js cryBlock with the page's ticks: '' = may go, else why not */
  function cryBlockUi(j) {
    const C = CP.cry;
    if (!j) return 'unknown piece';
    if (j.hard) return j.hard;
    if (j.enchant > 0 && !C.ench) return `enchanted +${j.enchant} — tick "include enchanted"`;
    if ((j.special || []).length && !C.spec) return `${j.special.join(', ')} — tick "include special items"`;
    return '';
  }
  function cryRows() { const m = cryMap(); return [...CP.cry.sel].map(id => m[id]).filter(j => j && !cryBlockUi(j)); }
  function renderCry() {
    const C = CP.cry, btn = $id('cpCryBtn'), box = $id('cp_cry'); if (!btn || !box) return;
    btn.hidden = !C.rep; btn.textContent = C.on ? 'Cancel' : 'Crystallize'; btn.classList.toggle('on', C.on);
    if (!C.rep || !C.on) { patch(box, ''); return; }
    const all = C.rep.cryst || [], free = all.filter(j => !cryBlockUi(j)), rows = cryRows(), tot = {};
    rows.forEach(j => { tot[j.grade] = (tot[j.grade] || 0) + (Number(j.crystals) || 0); });
    const age = C.rep.atMs ? Math.round((Date.now() - Number(C.rep.atMs)) / 60000) : null;
    patch(box, `<div class="cp-crybar">
      <div class="cp-cryhead">Tap the items to turn into crystals — <b>${free.length}</b> of ${all.length} can go (Crystallize level ${esc(C.rep.skill)}${Number(C.rep.skill) < 5 ? ': up to ' + CRY_GRADES[Number(C.rep.skill) - 1] + '-grade' : ''}). No-grade items cannot be crystallized.${age != null && age > 2 ? ` <span class="muted">Bag list ${age} min old.</span>` : ''}</div>
      <label class="cp-crychk"><input type="checkbox" data-cpcry="ench"${C.ench ? ' checked' : ''}> include enchanted</label>
      <label class="cp-crychk"><input type="checkbox" data-cpcry="spec"${C.spec ? ' checked' : ''}> include special items (S.A., augmented, untradeable)</label>
      <div class="cp-cryact"><button type="button" class="uk-btn ghost" data-cpcry="all">All that can go</button><button type="button" class="uk-btn ghost" data-cpcry="none">None</button>
      <button type="button" class="uk-btn danger" data-cpcry="go"${rows.length ? '' : ' disabled'}>Crystallize ${rows.length || ''}${rows.length ? ' → ' + CRY_GRADES.filter(g => tot[g]).map(g => nf(tot[g]) + ' ' + g).join(' + ') : ''}</button></div>
      <div class="muted cp-cryhint">While it hunts it waits for a moment when nothing hits it, then crystallizes. Worn items are never touched.</div></div>`);
  }
  function cryPick(el) {
    const id = Number(el.dataset.cpitem), j = cryMap()[id];
    if (!j) { toast('this item cannot be crystallized', false); return; }
    const why = cryBlockUi(j); if (why) { toast(`${j.name}: ${why}`, false); return; }
    if (CP.cry.sel.has(id)) CP.cry.sel.delete(id); else CP.cry.sel.add(id);
    renderInv();
  }
  async function cryClick(b) {
    const C = CP.cry, a = b.dataset.cpcry;
    if (a === 'mode') { C.on = !C.on; C.sel.clear(); if (C.on) cryLoad(true); renderInv(); return; }
    if (a === 'ench') { C.ench = !!b.checked; renderInv(); return; }
    if (a === 'spec') { C.spec = !!b.checked; renderInv(); return; }
    if (a === 'all') { (C.rep && C.rep.cryst || []).forEach(j => { if (!cryBlockUi(j)) C.sel.add(Number(j.objId)); }); renderInv(); return; }
    if (a === 'none') { C.sel.clear(); renderInv(); return; }
    if (a !== 'go') return;
    const rows = cryRows(); if (!rows.length) return;
    const tot = {}; rows.forEach(j => { tot[j.grade] = (tot[j.grade] || 0) + (Number(j.crystals) || 0); });
    const risky = rows.filter(j => j.enchant > 0 || (j.special || []).length), n = CP.name;
    const ok = await uiConfirm({ title: `${n}: crystallize ${rows.length} item${rows.length === 1 ? '' : 's'}?`, danger: true, typeToConfirm: risky.length ? 'YES' : '',
      body: [uiWarn('This destroys the items. They turn into crystals and cannot be brought back.'),
        uiP(uiEm(n), ' crystallizes exactly these from its own bag:'),
        uiList(rows.map(j => `${j.name}${j.enchant ? ' +' + j.enchant : ''} — ${j.grade} · ${nf(j.crystals)} crystals${(j.special || []).length ? ' (' + j.special.join(', ') + ')' : ''}`)),
        uiKV(CRY_GRADES.filter(g => tot[g]).map(g => [`${g}-grade crystals`, nf(tot[g])])),
        risky.length ? uiWarn(`${risky.length} of them are enchanted or special. Type YES to go on.`) : ''].filter(Boolean),
      confirmText: 'Crystallize them', cancelText: 'Cancel' });
    if (!ok) return;
    const r = await api('/api/crafter/crystallize', { method: 'POST', body: JSON.stringify({ name: n, objIds: rows.map(j => Number(j.objId)), enchanted: C.ench, special: C.spec, confirm: true }) });
    if (!r || r.error) { toast(`Not sent: ${(r && r.error) || 'no answer'}`, false); return; }
    C.sel.clear(); C.on = false; C.at = 0;
    toast(`${n} crystallizes ${rows.length} item${rows.length === 1 ? '' : 's'} now — the result shows in its steps and party chat`, true);
    renderInv();
  }

  // ---------------------------------------------------------------- skills grid (cooldown sweeps)
  function skillsNow() {
    const sk = (CP.char && CP.char.skills) || [], t = CP.charAt || Date.now();
    return sk.map(k => {
      const max = +k.max_reuse || +k.reuse_delay || 0, prog = +k.progress;
      const left = !k.is_ready && max > 0 && isFinite(prog) ? Math.max(0, max - prog) : (!k.is_ready ? 1500 : 0);
      return Object.assign({}, k, { readyAt: t + left, cdMax: Math.max(max, left) });
    });
  }
  function renderSkills() {
    const d = CP.char; if (!d) return;
    const S = skillsNow();
    const act = S.filter(k => k.is_active && !k.is_toggle).sort((a, b) => (+b.used_count || 0) - (+a.used_count || 0) || a.name.localeCompare(b.name));
    const tog = S.filter(k => k.is_toggle), pas = S.filter(k => !k.is_active && !k.is_toggle);
    const now = Date.now();
    const cell = (k, kind) => {
      const cd = k.readyAt > now + 150;
      // TOGGLE STATE 2026-10-17 (owner: "the skills you need to toggle on and off keep being on"): L2Swarm's is_running stays true after a toggle
      // is switched OFF (Dagger1 showed Silent Move / Accuracy / Vicious Stance green with none of them active) -> on = its effect is on the buff bar
      const tOn = kind === 'tog' && (((d.char && d.char.buffs) || []).length ? ((d.char && d.char.buffs) || []).some(b => Number(b.id) === Number(k.skill_id)) : !!k.is_running);
      return `<button class="cp-sk ${cd ? 'cd' : 'rdy'} ${tOn ? 'run' : ''}" data-skill="${k.skill_id}" data-ready="${k.readyAt}" data-cdmax="${k.cdMax}" title="${esc(k.name + ' Lv ' + k.level + (k.mp_cost ? ' · ' + k.mp_cost + ' MP' : '') + (k.range > 0 ? ' · range ' + k.range : '') + (k.reuse_delay ? ' · reuse ' + (k.reuse_delay / 1000).toFixed(k.reuse_delay < 10000 ? 1 : 0) + ' s' : ''))}">
        <span class="ic"><img src="${skillIcon(k.skill_id)}" alt=""><i class="sw"></i><b class="t"></b></span><span class="nm">${esc(k.name)}</span></button>`;
    };
    patch($id('cp_skills'), `<div class="cp-skgrid">${act.map(k => cell(k, 'act')).join('') || '<span class="muted">no active skills</span>'}</div>
      ${tog.length ? `<div class="cp-sub2">Toggles</div><div class="cp-skgrid">${tog.map(k => cell(k, 'tog')).join('')}</div>` : ''}
      ${pas.length ? `<details class="cp-pas"><summary>Passive skills (${pas.length})</summary><div class="cp-pgrid">${pas.map(k => `<span title="${esc(k.name + ' Lv ' + k.level + ' — ' + (k.description || ''))}"><img src="${skillIcon(k.skill_id)}" alt=""></span>`).join('')}</div></details>` : ''}`);
    anim();
    try { if (window.HiveSwitch) HiveSwitch.render($id('cp_hive'), CP.name, (CP.char && CP.char.skills) || []); } catch (e) { }   // HIVESW-2026-10-15: Combat box (Dashboard/hiveswitch.js)
  }

  // ---------------------------------------------------------------- buffs / debuffs with time bars
  function renderBuffs() {
    const d = CP.char; if (!d) return;
    const B = ((d.char && d.char.buffs) || []);
    const t = CP.charAt || Date.now();
    const deb = B.filter(b => b.is_debuff), buf = B.filter(b => !b.is_debuff).sort((a, b) => a.remain_seconds - b.remain_seconds);
    const cell = (b, isDeb) => {
      const k = b.id + ':' + b.level, max = Math.max(CP.buffMax[k] || 0, b.remain_seconds || 0, 1);
      CP.buffMax[k] = max;
      return `<span class="cp-bf ${isDeb ? 'deb' : ''}" data-end="${t + (b.remain_seconds || 0) * 1000}" data-max="${max}" title="${esc(b.name + ' Lv ' + b.level + ' — ' + (b.remain_str || ''))}"><img src="${skillIcon(b.id)}" alt=""><i class="bar"><i></i></i><b class="t"></b></span>`;
    };
    const sc = me() || {};
    $id('cp_buffs').previousElementSibling.querySelector('span').textContent = `Buffs ${buf.length}${deb.length ? ' · debuffs ' + deb.length : ''}`;
    CP.bfDirty = true;
    patch($id('cp_buffs'), (deb.length ? `<div class="cp-bgrid">${deb.map(b => cell(b, true)).join('')}</div>` : '') +
      `<div class="cp-bgrid">${buf.map(b => cell(b, false)).join('') || '<span class="muted">no buffs</span>'}</div>` +
      (sc.buffs != null && sc.buffs < 10 ? '<div class="alert">few long buffs: it rebuffs from the board at the next chance</div>' : ''));
    anim();
  }

  // ---------------------------------------------------------------- timeline
  function renderTimeline() {
    if (!CP.open) return;
    let html = '';
    const simple = !!(window.Plain && window.UIKit && !UIKit.isAdv());   // UX audit B3 (2026-10-13): Simple = plain words, Advanced = the raw timeline
    try { html = simple ? plainTimeline(CP.intents) : timeline(CP.intents); } catch (e) { html = '<div class="muted">timeline unavailable</div>'; }
    patch($id('cp_timeline'), `<div class="cp-tl">${html}</div>`);
  }
  // PLAIN TIMELINE (UX audit B3): one sentence per step (Dashboard/plainwords.js), "while …" as a second line, how it ended on the right.
  // No coordinates, ids, step codes or !commands; the raw lines are one tap away in the Advanced view (header switch).
  const TLP = { fights: false, problems: false };
  function plainTimeline(events) {
    let list = (events || []).filter(e => TLP.fights || (e.action !== 'attack' && e.action !== 'angreb' && e.action !== 'pair attack'));
    if (TLP.problems) list = list.filter(e => e.result === 'FAIL' || e.result === 'FEJL');
    const bar = `<div class="tlbar"><label class="chk"><input type="checkbox" data-cptlp="problems"${TLP.problems ? ' checked' : ''}> only problems</label>` +
      `<label class="chk"><input type="checkbox" data-cptlp="fights"${TLP.fights ? ' checked' : ''}> show fights</label><span class="muted">newest first</span></div>`;
    const ico = (a) => { try { return (typeof INTENT_ICON !== 'undefined' && INTENT_ICON[a]) || UI.target; } catch (e) { return UI.target; } };
    const rows = list.slice(0, 80).map((e, i) => {
      const p = Plain.event(e), r = Plain.result(e, i === 0), why = p.why ? p.why.charAt(0).toUpperCase() + p.why.slice(1) : '';
      return `<div class="ev ${r[0] === 'bad' ? 'bad' : r[0] === 'run' ? 'run' : ''}"><span class="t">${esc(String(clock(e.at)).slice(0, 5))}</span>${GI(ico(e.action), 'sm')}` +
        `<div><div class="w pw">${esc(p.text)}${e.count > 1 ? `<span class="x">×${e.count}</span>` : ''}</div>${why ? `<div class="why pwhy">${esc(why)}</div>` : ''}</div>` +
        `<span class="res ${r[0]} pres">${esc(r[1])}</span></div>`;
    }).join('');
    return `<div class="cp-ptl">${bar}<div class="tl">${rows || (window.UIKit ? UIKit.empty({ text: TLP.problems ? 'No problems lately.' : 'Nothing has happened yet.' }) : '<div class="muted">nothing yet</div>')}</div></div>`;
  }
  document.addEventListener('change', (e) => { const k = e.target && e.target.dataset && e.target.dataset.cptlp; if (!k) return; TLP[k] = !!e.target.checked; renderTimeline(); });
  // the Simple / Advanced switch and the plain-words file arriving re-draw the page (UX audit B1/B3)
  ['uikit:mode', 'uikit:plain'].forEach(n => window.addEventListener(n, () => { if (!CP.open) return; try { renderHead(); renderLive(); renderTimeline(); } catch (e) { } }));

  // ---------------------------------------------------------------- stats, progress, supplies
  function supplies() {
    const c = me() || {}, items = bag();
    const cnt = (re) => items.filter(i => re.test(i.name)).reduce((s, i) => s + Number(i.count || 0), 0);
    const known = !!(CP.char && CP.char.items && CP.char.items.length);
    return [['SoE', known ? cnt(/scroll of escape/i) : c.soe, 2, UI.soe], ['Res scrolls', known ? cnt(/scroll of resurrection/i) : c.res, 1, UI.res],
      ['Shots', c.shots, 200, UI.shots], ['Mana pots', known ? cnt(/mana potion/i) : null, 100, 'icon/etc_reagent_blue_i00'], ['Heal pots', known ? cnt(/healing potion/i) : null, 5, 'icon/etc_lesser_potion_red_i00'],
      ['CP pots', known ? cnt(/cp potion/i) : null, 0, 'icon/etc_cp_potion_i00']].filter(x => x[1] != null);
  }
  function renderStatsLight() { renderStats(); }
  function renderStats() {
    const c = me(); if (!c && !CP.char) return;
    const x = c || {}, gc = (CP.char && CP.char.char) || {}, D = x.doing || {};
    const h = x.expHour, L = Array.isArray(x.expLog) ? x.expLog : [];
    const deaths = L.filter(e => e && e.why === 'death').length;
    const prog = [
      ['Exp / hour', h && h.mins >= 3 ? `${((window.LevelEta && LevelEta.hourPct ? LevelEta.hourPct(x) : null) ?? h.pct / h.mins * 60).toFixed(2)} %` : '—'],   // EXP TABLE 2026-10-12: points / level size
      ...(window.LevelEta ? [(() => { const e = LevelEta.calc(x, { exp: Number(gc.exp_percent ?? x.exp ?? 0), skew: CP.skew }); return ['Next level', e.status === 'ok' ? `<span title="${esc(LevelEta.title(e))}">${esc(LevelEta.dur(e.etaMs, true))} · ${esc(LevelEta.clockOf(e.at))}</span>` : `<span class="muted" title="${esc(LevelEta.title(e))}">${esc(LevelEta.short(e) || '—')}</span>`]; })()] : []),
      ['Kills / hour', h && h.mins >= 3 && h.n ? Math.round(h.n / h.mins * 60) : '—'],
      ['Kills (5 min)', D.autolevel ? D.autolevel.kills5m : '—'],
      ['Exp (last hour)', h ? nf(h.amt) : '—'],
      ['Deaths (recent)', deaths || 0],
      ['Level', `${gc.level || x.level || '?'} · ${Number(gc.exp_percent ?? x.exp ?? 0).toFixed(2)} %`],
      // EXP TABLE 2026-10-12: raw exp still needed (Scripts/data/exp_table.json, copy in levelEta.js)
      ...(window.LevelEta && LevelEta.ptsLeft ? [(() => { const lv = Number(gc.level || x.level), left = LevelEta.ptsLeft(lv, Number(gc.exp_percent ?? x.exp ?? 0)); return ['Exp to next level', left != null && lv < LevelEta.CFG.maxLevel ? `<span title="${esc('Level ' + lv + ' bar: ' + nf(LevelEta.levelSize(lv)) + ' exp (H5 table)')}">${nf(left)}</span>` : '—']; })()] : []),
    ];
    const sup = supplies().map(([n, v, low, ic]) => `<span class="cp-sup ${v <= low ? 'low' : ''}" title="${n}${v <= low ? ' — low' : ''}">${GI(ic, 'sm')}<span>${n}</span><b>${nf(v)}</b></span>`).join('');
    const kv = [['P.Atk', gc.p_atk], ['M.Atk', gc.m_atk], ['P.Def', gc.p_def], ['M.Def', gc.m_def], ['Atk.Spd', gc.p_atk_spd], ['Cast.Spd', gc.m_atk_spd], ['Accuracy', gc.accuracy], ['Evasion', gc.evasion_rate],
      ['Crit', gc.crit_rate], ['Speed', gc.speed || gc.run_speed], ['Load', gc.max_load ? Math.round((gc.load || 0) / gc.max_load * 100) + '%' : null], ['Karma', gc.karma],
      ['STR', gc.str], ['DEX', gc.dex], ['CON', gc.con], ['INT', gc.int], ['WIT', gc.wit], ['MEN', gc.men]].filter(p => p[1] != null);
    patch($id('cp_stats'), `<div class="cp-kpis">${prog.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      <div class="cp-sups">${sup || '<span class="muted">supplies unknown</span>'}</div>
      ${kv.length ? `<details class="cp-kvd" ${CP.cols >= 2 ? 'open' : ''}><summary>Combat stats</summary><div class="cp-kv">${kv.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div></details>` : ''}`);
  }

  // ---------------------------------------------------------------- priority list (who holds control) + class-quest plan
  function renderPrio() {
    const c = me() || {}, P = c.priorities || [], qp = CP.qp;
    const pr = P.length ? '<ol class="cp-prio">' + P.map(p => '<li class="' + (/^(NU|NOW)/.test(p.status) ? 'now' : '') + '"><b>' + esc(p.what) + '</b> <span class="muted">' + esc(p.status) + '</span></li>').join('') + '</ol>' : '<div class="muted">no priority list reported</div>';
    const st = qp && qp.steps && qp.steps.length ? qp.steps[qp.leg] : null;
    const q = st ? '<div class="cp-qp"><b>' + esc(qp.id + ' ' + (qp.name || '')) + '</b> · step ' + qp.leg + '/' + qp.total + gauge('cp', qp.total ? qp.leg / qp.total * 100 : 0, '', 'thin') + '<div>▶ ' + esc([st.action, st.teleport, st.npc, st.item ? st.item + (st.count ? ' ×' + st.count : '') : ''].filter(Boolean).join(' · ')) + (st.to && st.to.name ? ' — ' + esc(st.to.name) : '') + '</div></div>' : '<div class="muted">no class quest plan right now</div>';
    patch($id('cp_prio'), pr + q);
  }

  // ---------------------------------------------------------------- orders + client mode
  function renderOrders() {
    const n = esc(CP.name);
    let opts = ''; try { opts = taskOptions(); } catch (e) { }
    patch($id('cp_orders'), `<div class="cp-orow"><button data-quick="char:${n}|!classchange|Class change">Class change</button><button data-quick="char:${n}|!buff|Rebuff">Rebuff</button>
        <button data-quick="char:${n}|!soe|Retreat (.townname)">Retreat to town</button><button class="ccsheetbtn" data-cmdsheet="char:${n}">${GI(UI.menuAction, 'sm')}All commands…</button></div>
      ${opts ? `<div class="cp-orow"><select id="cpsel" aria-label="task">${opts}</select><input id="cparg" placeholder="boss / town…" aria-label="argument"><button data-run="char:${n}" data-sel="cpsel" data-arg="cparg">Do</button></div>` : ''}
      <div class="cp-orow"><span class="muted">Client:</span><button data-cpclient="ingame" title="L2Swarm Hook: logs out, starts l2.exe and logs in through the game client">In-game (l2.exe)</button><button data-cpclient="oog" title="Close the game client and play out of game again">Out of game</button></div>
      <div class="muted cp-ohelp">Direct orders (skills, potions, items) run once on ${n} only and then it carries on. Tap a skill or an item; potions and SoE are in “Right now”.</div>`);
  }

  // =========================================================================================== DIRECT ORDERS
  /** the only place that sends an override: Dashboard/override.js when loaded, else the same swarm command straight to /api/command */
  /** SELLNOSHOP: why no shop buys this item id (the /api/sell noShop map), or '' */
  function noShopWhy(id) { try { return ((typeof SELL !== 'undefined' && SELL && SELL.noShop) || {})[Number(id)] || ''; } catch (e) { return ''; } }
  function sendOv(action, label, opt) {
    const name = CP.name; opt = opt || {};
    if (window.Override && typeof Override.send === 'function') return Override.send(name, action, label, opt);
    if (opt.danger) return uiConfirm({ title: `${name}: ${label}`, body: 'This cannot be undone.', typeToConfirm: 'YES', danger: true, confirmText: 'Do it' })   // UIDIALOG 2026-10-10 (was a typed-YES prompt())
      .then(ok => { if (!ok) { toast(`${name}: ${label} — cancelled`, null); return null; } return post(`!ov ${name} ${action}`, label, opt.danger); });
    return post(`!ov ${name} ${action}`, label, opt.danger);
  }
  function post(cmd, label, danger) {
    const name = CP.name;
    toast(`${name}: ${label} — sent…`);
    return api('/api/command', { method: 'POST', body: JSON.stringify(Object.assign({ cmd, targets: ['char:' + name] }, danger ? { confirmDanger: true } : {})) })
      .then(d => {
        if (!d || !d.ok) toast(`${name}: not sent — ${(d && d.error) || 'error'}`, false);
        else { const s = (d.sends || [])[0]; if (s && s.ok === false && !s.pending) toast(`${name}: ${s.error || 'failed'}`, false); else toast(`${name}: ${label} — delivered${s && s.channel === 'file' ? ' (file channel)' : ''}`, true); }
        return d;
      }).catch(e => { toast(`${name}: not sent — ${e.message}`, false); return null; });
  }
  function toast(msg, ok) {
    if (window.Override && typeof Override.toast === 'function') { Override.toast(msg, ok); return; }
    let box = $id('cpToasts');
    if (!box) { box = document.createElement('div'); box.id = 'cpToasts'; box.className = 'cp-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'cp-toast ' + (ok === false ? 'bad' : ok === true ? 'ok' : ''); t.textContent = msg;
    box.appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 6000);
  }
  function quick(k) {
    const mp = best(/mana potion/i, /greater/i), hp = best(/healing potion/i, /greater/i), cpp = best(/cp potion/i, /greater/i);
    if (k === 'mp') return mp ? sendOv('use ' + mp.id, 'use ' + mp.name) : toast(`${CP.name}: no Mana Potion in the bag`, false);
    if (k === 'hp') return hp ? sendOv('use ' + hp.id, 'use ' + hp.name) : toast(`${CP.name}: no Healing Potion in the bag`, false);
    if (k === 'cp') return cpp ? sendOv('use ' + cpp.id, 'use ' + cpp.name) : toast(`${CP.name}: no CP Potion in the bag`, false);
    if (k === 'soe') { uiConfirm({ title: `${CP.name}: use a Scroll of Escape NOW?`, body: 'It stops what it is doing and goes to the nearest town (the party does not follow).', confirmText: 'Use Scroll of Escape' }).then(ok => { if (ok) sendOv('soe', 'Scroll of Escape NOW'); }); return; }
    if (k === 'stop') return sendOv('stop', 'stop attacking');
    if (k === 'tgt') {
      const c = me() || {}, near = [...(((CP.char && CP.char.mobs) || []).filter(m => !m.dead)), ...((CP.live && CP.live.mobs) || [])].filter(m => isFinite(m.x) && m.n)
        .map(m => [m, Math.hypot(m.x - c.x, m.y - c.y)]).sort((a, b) => a[1] - b[1])[0];
      if (!near) { toast(`${CP.name}: no monster in sight`, false); return; }
      return sendOv('target ' + near[0].n, `target ${near[0].n} (${km(near[1])} away)`);
    }
    if (k === 'sit' || k === 'stand') return post('/' + k, k === 'sit' ? 'sit down' : 'stand up');
  }

  // ---------------------------------------------------------------- pop-up menus (skill / item)
  function closePop() { const p = $id('cpPop'); if (p) p.remove(); CP.pop = null; }
  function showPop(anchor, html) {
    closePop();
    const p = document.createElement('div'); p.id = 'cpPop'; p.className = 'cp-pop'; p.setAttribute('role', 'dialog'); p.innerHTML = html;
    document.body.appendChild(p); CP.pop = p;
    if (window.innerWidth < 640) { p.classList.add('sheet'); }
    else {
      const r = anchor.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
      let x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)), y = r.bottom + 6;
      if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
      p.style.left = Math.round(x + window.scrollX) + 'px'; p.style.top = Math.round(y + window.scrollY) + 'px';
    }
    const f = p.querySelector('button'); if (f) f.focus({ preventScroll: true });
  }
  function skillPop(btn) {
    const id = +btn.dataset.skill, k = skillsNow().find(s => +s.skill_id === id); if (!k) return;
    const left = Math.max(0, k.readyAt - Date.now());
    const tm = mates().filter(m => !m.dead && live(m));
    const self = /SELF|NONE/i.test(String(k.target_type || '')) || (!k.is_need_target && !(k.range > 0));
    const opts = [['', self ? 'Use now' : 'Use now on its target']].concat(self ? [] : [['self', 'on itself']], tm.map(m => [m.name, 'on ' + m.name]));
    showPop(btn, `<div class="cp-ph"><img src="${skillIcon(id)}" alt=""><div><b>${esc(k.name)}</b> <span class="muted">Lv ${k.level}</span><div class="muted">${k.mp_cost ? k.mp_cost + ' MP · ' : ''}${k.range > 0 ? 'range ' + k.range + ' · ' : ''}${left > 0 ? `<span class="warn">ready in ${(left / 1000).toFixed(1)} s</span>` : '<span class="ok">ready</span>'}</div></div></div>
      ${k.description ? `<div class="cp-pd muted">${esc(String(k.description).slice(0, 220))}</div>` : ''}
      <div class="cp-pb">${opts.map(([on, l], i) => `<button data-cpgo="cast" data-id="${id}" data-on="${esc(on)}" class="${i === 0 ? 'pri' : ''}">${esc(l)}</button>`).join('')}</div>
      ${left > 0 ? '<div class="muted cp-pd">On cooldown: the order waits in its window until the skill is ready (or fails, see the toast).</div>' : ''}`);
  }
  // EQUIPSLOT-2026-10-22 (owner: "When i want to equip rings i need to be able to assign ring 1 or 2 and earring 1 or 2"): a ring / earring in the bag gets
  // two buttons; the bot takes off what is in that slot and puts this one on ("use <objId> ring1|ring2|ear1|ear2", swarm.js raidOverride 'use')
  function jewelKind(it) { const s = String(it.slot || ''); return /FINGER/.test(s) ? 'ring' : /EAR/.test(s) ? 'ear' : ''; }
  function jewelBtns(it) {
    const k = jewelKind(it), worn = ((CP.char && CP.char.items) || []).filter(i => i.equipped && jewelKind(i) === k);
    const nm = k === 'ring' ? 'Ring' : 'Earring', key = k === 'ring' ? 'ring' : 'ear';
    const wornTxt = worn.length ? `worn now: ${worn.map(i => esc(i.name) + (i.enchant ? ' +' + i.enchant : '')).join(' · ')}` : `no ${nm.toLowerCase()} worn`;
    return `<button class="pri" data-cpgo="useslot" data-obj="${esc(it.objId)}" data-slot="${key}1" data-id="${it.id}" title="takes off what is in ${nm.toLowerCase()} slot 1, puts this one there">Put on as ${nm} 1</button>`
      + `<button class="pri" data-cpgo="useslot" data-obj="${esc(it.objId)}" data-slot="${key}2" data-id="${it.id}" title="takes off what is in ${nm.toLowerCase()} slot 2, puts this one there">Put on as ${nm} 2</button>`
      + `<div class="muted cp-pd" style="flex-basis:100%">${wornTxt}. The piece in the chosen slot goes back to the bag.</div>`;
  }
  // JUNKMARK-2026-10-23 (public tester 1.8.17: "ability to custom mark which item is selected as junk to sell, maybe the item icon but crossed
  // out"): "Mark junk" mode in the inventory - one tap marks the item for selling for THIS character (sell_list.json, the same list as the
  // item pop-up's "sell at every restock"), a second tap takes the mark off (also an "all bots" mark). Marked items show crossed out.
  async function junkPick(btn) {
    const key = btn.dataset.cpitem, it = ((CP.char && CP.char.items) || []).find(i => String(i.objId || i.id) === key); if (!it) return;
    if (it.equipped || it.quest || it.id === 57) { toast(`${it.name}: worn and quest items are never sold`, false); return; }
    const st = sellState(it.id, CP.name), on = !(st === 'char' || st === 'all');
    const d = await api('/api/sell', { method: 'POST', body: JSON.stringify({ id: it.id, scope: CP.name, on }) });
    if (!d || d.error) { toast(`not saved: ${(d && d.error) || 'no answer'}`, false); return; }
    if (d.list) SELL = Object.assign({ noShop: SELL.noShop }, d.list);
    toast(`${it.name}: ${on ? 'marked as junk — sold at the next shop visit' : 'kept (no longer sold)'}${on && noShopWhy(it.id) ? ' — but no shop buys it' : ''}`, true);
    renderInv();
  }
  function itemPop(btn) {
    const key = btn.dataset.cpitem, it = ((CP.char && CP.char.items) || []).find(i => String(i.objId || i.id) === key); if (!it) return;
    const canDrop = !it.equipped && !it.quest && it.id !== 57;
    let sell = '';
    try {
      if (!it.equipped && !it.quest) { const st = sellState(it.id, CP.name); const o = (v, t) => `<option value="${v}"${st === v ? ' selected' : ''}>${t}</option>`;
        sell = `<label class="cp-psell">sell at every restock <select class="sellsel ${st && st !== 'keep' ? 'on' : ''}" data-sellid="${it.id}" data-sellchar="${esc(CP.name)}">${o('', '—')}${o('char', 'sell (' + esc(CP.name) + ')')}${o('all', 'sell (all bots)')}${o('keep', 'never sell')}</select></label>`;
        // ITEMRULE-2026-10-24 (public tester Mr.P): where this item goes when it is not sold — keep in the bag / store in the warehouse / give to the collector
        { const R = CP.itemRule || {}, cur = (R.keep || []).includes(it.id) ? 'keep' : (R.deposit || []).includes(it.id) ? 'store' : (R.distributor || []).includes(it.id) ? 'distributor' : (R.collector || []).includes(it.id) ? 'collector' : '';
          const q = (v, t) => `<option value="${v}"${cur === v ? ' selected' : ''}>${t}</option>`;
          sell += `<label class="cp-psell">otherwise <select class="sellsel ${cur ? 'on' : ''}" data-cprule="${it.id}" title="What ${esc(CP.name)} does with it when it is not sold">${q('', 'automatic')}${q('keep', 'keep in the bag')}${q('store', 'store in the warehouse')}${q('collector', 'give to the collector')}${it.type === 'Weapon' || it.type === 'Armor' || /weapon|armor|accessor|jewel/i.test(String(it.type || '')) || cur === 'distributor' ? q('distributor', 'give to the distributor for its grade') : ''}</select></label>`; }   // GEARPASS-2026-10-27 (tester Vykaax)
        // SELLNOSHOP 2026-10-22 (owner): an item no shop buys says so, with Untick (stop trying to sell it) and Destroy (only after your OK)
        const ns = noShopWhy(it.id);
        if (ns) sell += `<div class="cp-nosell"><b>No shop buys this</b> <span class="muted">(${esc(ns)})</span><div class="cp-pb">${st && st !== 'keep' ? `<button data-cpunsell="${it.id}">Untick (stop selling)</button>` : ''}${!it.equipped && !it.quest ? `<button class="danger" data-cpdestroy="${esc(it.objId || it.id)}" data-id="${it.id}" data-n="${it.count}">Destroy…</button>` : ''}</div></div>`; }
    } catch (e) { }
    // CRYINV-2026-10-22 (owner: "I still dont see the crystallize option here" - he tapped an item): the item menu offers it too (dwarves with Crystallize)
    let cry = '';
    try { cryLoad(false); if (CP.cry.rep) { const j = cryMap()[Number(it.objId)], why = j ? cryBlockUi(j) : 'cannot be crystallized';
      cry = !why ? `<button class="danger" data-cpcryone="${esc(it.objId)}">Crystallize… (${nf(j.crystals)} ${esc(j.grade)} crystals)</button>` : `<div class="muted cp-pd">Crystallize: ${esc(why)}</div>`; } } catch (e) { }
    showPop(btn, `<div class="cp-ph"><img src="${itemIcon(it.id)}" alt=""><div><b>${esc(it.name)}</b>${it.enchant ? ' <b class="en">+' + it.enchant + '</b>' : ''} ${grade(it.grade)}<div class="muted">×${nf(it.count)} · ${esc(it.type || '')}${it.slot && it.slot !== 'NONE' ? ' · ' + esc(it.slot) : ''}${it.equipped ? ' · <span class="ok">worn</span>' : ''}${it.quest ? ' · quest item' : ''}</div></div></div>
      <div class="cp-pb">${!it.equipped && jewelKind(it) ? jewelBtns(it) : !it.equipped ? `<button class="pri" data-cpgo="use" data-id="${it.id}">${it.type === 'Weapon' || it.type === 'Armor' ? 'Equip now' : 'Use now'}</button>` : ''}
        ${canDrop ? `<button class="danger" data-cpdrop="${esc(it.objId || it.id)}" data-id="${it.id}" data-n="${it.count}">Drop…</button>` : ''}${cry.startsWith('<button') ? cry : ''}</div>${cry.startsWith('<div') ? cry : ''}
      ${sell}${!canDrop ? `<div class="muted cp-pd">${it.equipped ? 'Worn items cannot be dropped from here.' : it.quest ? 'Quest items cannot be dropped from here.' : ''}</div>` : ''}`);
  }

  // =========================================================================================== animation (cast ring, cooldowns, buffs)
  function anim() {
    if (!CP.open) return;
    const s = $id(SEC); if (!s) return;
    const now = srvNow(), bNow = Date.now();
    s.querySelectorAll('.cp-cast').forEach(e => {
      const st = Date.parse(e.dataset.start), ms = +e.dataset.ms || 0;
      const p = e.dataset.ended ? 1 : ms && isFinite(st) ? Math.max(0, Math.min(1, (now - st) / ms)) : 1;
      const arc = e.querySelector('.arc'); if (arc) arc.setAttribute('stroke-dasharray', `${(p * 100).toFixed(1)} 100`);
      e.style.setProperty('--p', (p * 100).toFixed(1) + '%');
      const bar = e.querySelector('.cp-cbar i'); if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
      const l = e.querySelector('.cp-cl'); if (l) l.textContent = e.dataset.ended ? '· ' + e.dataset.ended : ms ? Math.max(0, (st + ms - now) / 1000).toFixed(1) + ' s' : '';
    });
    s.querySelectorAll('.cp-sk').forEach(e => {
      const left = (+e.dataset.ready || 0) - bNow, max = +e.dataset.cdmax || 1;
      const cd = left > 120;
      if (e.classList.contains('cd') && !cd) { e.classList.remove('cd'); e.classList.add('rdy', 'flash'); setTimeout(() => e.classList.remove('flash'), 900); }
      if (cd) { e.style.setProperty('--p', Math.max(0, Math.min(100, left / max * 100)).toFixed(1) + '%'); const t = e.querySelector('.t'); if (t) t.textContent = left >= 10000 ? Math.ceil(left / 1000) : (left / 1000).toFixed(1); }
      else { const t = e.querySelector('.t'); if (t && t.textContent) t.textContent = ''; }
    });
    anim.n = (anim.n || 0) + 1;
    if (anim.n % 8 === 0 || CP.bfDirty) {
      CP.bfDirty = false;
      s.querySelectorAll('.cp-bf').forEach(e => {
        const left = Math.max(0, ((+e.dataset.end || 0) - bNow) / 1000), max = +e.dataset.max || 1;
        const i = e.querySelector('.bar i'); if (i) i.style.width = Math.max(0, Math.min(100, left / max * 100)).toFixed(1) + '%';
        const t = e.querySelector('.t'); if (t) t.textContent = left >= 3600 ? Math.floor(left / 3600) + 'h' + String(Math.floor(left % 3600 / 60)).padStart(2, '0') : left >= 60 ? Math.floor(left / 60) + 'm' : Math.round(left) + 's';
        e.classList.toggle('low', left < 60);
      });
    }
    // map: cast arc on my dot
    document.querySelectorAll('#cpOver .cp-arc').forEach(a => {
      const st = Date.parse(a.dataset.start), ms = +a.dataset.ms || 0;
      const p = ms && isFinite(st) ? Math.max(0, Math.min(1, (now - st) / ms)) : 1;
      a.setAttribute('stroke-dasharray', `${(p * 100).toFixed(1)} 100`);
    });
  }

  // =========================================================================================== mini-map (same layers as the live party view)
  function box() { const w = $id('cpMap'); return { w: Math.max(50, w.clientWidth), h: Math.max(50, w.clientHeight) }; }
  function routeOf(c) {
    const r = c.route; if (!r || !Array.isArray(r.pts) || !r.pts.length) return null;
    const pts = r.pts.filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])); if (!pts.length) return null;
    const i = Math.max(0, Math.min(pts.length, +r.i || 0)), tg = r.target;
    const label = typeof tg === 'string' ? tg : tg && (tg.label || tg.name) || '';
    const goal = tg && typeof tg === 'object' && isFinite(tg.x) ? [tg.x, tg.y] : pts[pts.length - 1];
    return { pts, i, label, goal, done: i >= pts.length };
  }
  function walkTo(c) {
    const e = (c.intents || [])[0] || c.intent; if (!e || e.result || !/^(walk|lead team|route|move|npc|rescue|regroup)$/.test(e.action)) return null;
    if (srvNow() - Date.parse(e.at) > 5 * 60000) return null;
    const m = String(e.to || '').match(/(-?\d+),\s*(-?\d+)/); if (!m) return null;
    const to = [+m[1], +m[2]]; return Math.hypot(to[0] - c.x, to[1] - c.y) > 150 ? to : null;
  }
  function fit() {
    const c = me(); if (!c || !isFinite(c.x)) return;
    const pts = [[c.x, c.y]];
    const r = routeOf(c); if (r && !r.done) r.pts.slice(r.i, r.i + 10).forEach(p => { if (Math.hypot(p[0] - c.x, p[1] - c.y) < 9000) pts.push(p); });
    const w = walkTo(c); if (w && Math.hypot(w[0] - c.x, w[1] - c.y) < 9000) pts.push(w);
    aggroOf(c).forEach(m => pts.push([m.x, m.y]));
    if (c.tpos && isFinite(c.tpos.x)) pts.push([c.tpos.x, c.tpos.y]);
    matesHere().forEach(m => { if (isFinite(m.x) && Math.hypot(m.x - c.x, m.y - c.y) < 2500) pts.push([m.x, m.y]); });
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const b = box(), pad = 450;
    const hw = Math.min(30000, Math.max(900, (maxX - minX) / 2 + pad, ((maxY - minY) / 2 + pad) * b.w / b.h));
    CP.view = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, hw };
  }
  function viewRect() { const b = box(), v = CP.view, hh = v.hw * b.h / b.w; return { x0: v.cx - v.hw, y0: v.cy - hh, W: 2 * v.hw, H: 2 * hh, u: 2 * v.hw / b.w, b }; }
  function zoomAt(px, f, py) {
    if (!CP.view) return; const R = viewRect();
    if (px == null) { px = R.b.w / 2; py = R.b.h / 2; }
    const gx = R.x0 + px * R.u, gy = R.y0 + py * R.u, hw = Math.max(250, Math.min(60000, CP.view.hw * f)), u2 = 2 * hw / R.b.w;
    CP.view = { hw, cx: gx - px * u2 + hw, cy: gy - py * u2 + hw * R.b.h / R.b.w }; schedule();
  }
  function schedule() { if (CP.raf) return; CP.raf = requestAnimationFrame(() => { CP.raf = 0; drawMap(); }); }
  function gestures(el) {
    const P = new Map(); let moved = 0;
    const pos = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; try { el.setPointerCapture(e.pointerId); } catch (er) { } P.set(e.pointerId, pos(e)); moved = P.size > 1 ? 99 : 0; });
    el.addEventListener('pointermove', (e) => {
      if (!P.has(e.pointerId) || !CP.view) return;
      const prev = P.get(e.pointerId), p = pos(e);
      if (P.size === 1) { const R = viewRect(), dx = p.x - prev.x, dy = p.y - prev.y; moved += Math.abs(dx) + Math.abs(dy); if (moved > 6) { CP.follow = false; CP.view.cx -= dx * R.u; CP.view.cy -= dy * R.u; schedule(); } }
      else if (P.size === 2) {
        const [a, b] = [...P.entries()].map(([id, q]) => id === e.pointerId ? p : q), [a0, b0] = [...P.values()];
        const d1 = Math.hypot(a.x - b.x, a.y - b.y), d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
        if (d0 > 10 && d1 > 10) { CP.follow = false; zoomAt((a.x + b.x) / 2, d0 / d1, (a.y + b.y) / 2); }
      }
      P.set(e.pointerId, p);
    });
    const up = (e) => { if (!P.has(e.pointerId)) return; const p = pos(e); P.delete(e.pointerId); if (moved <= 6 && P.size === 0 && e.type === 'pointerup') tap(p); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); CP.follow = false; const p = pos(e); zoomAt(p.x, e.deltaY > 0 ? 1.25 : 0.8, p.y); }, { passive: false });
  }
  function allMobs() {
    const out = [], c = me() || {};
    const add = (m, on) => { if (!m || !isFinite(m.x) || (!m.raid && !onMyLevel(m, 600))) return; let o = out.find(x => (m.id && x.id && +x.id === +m.id) || (x.n === m.n && Math.hypot(x.x - m.x, x.y - m.y) < 80)); if (!o) { o = Object.assign({}, m, { on: [] }); out.push(o); } if (on && !o.on.includes(on)) o.on.push(on); if (m.hp != null) o.hp = m.hp; };
    ((CP.live && CP.live.mobs) || []).forEach(m => add(m));
    ((CP.char && CP.char.mobs) || []).filter(m => !m.dead && (!isFinite(c.z) || true)).forEach(m => add(m));
    [c].concat(matesHere()).forEach(p => { if (live(p) && !p.dead) aggroOf(p).forEach(a => add(a, p.name)); });
    return out;
  }
  function tap(p) {
    if (!CP.view) return;
    const R = viewRect(), gx = R.x0 + p.x * R.u, gy = R.y0 + p.y * R.u;
    let best = null, bd = 18 * R.u;
    [me()].concat(matesHere()).forEach(c => { if (!c || !isFinite(c.x)) return; const d = Math.hypot(c.x - gx, c.y - gy); if (d < bd) { bd = d; best = c; } });
    if (best && best.name !== CP.name) { go('#/char/' + encodeURIComponent(best.name)); return; }
    let mb = null; bd = 14 * R.u;
    allMobs().forEach(m => { const d = Math.hypot(m.x - gx, m.y - gy); if (d < bd) { bd = d; mb = m; } });
    CP.info = mb ? `${mb.n}${mb.lvl ? ' lvl ' + mb.lvl : ''}${mb.hp != null ? ' · ' + mb.hp + '% HP' : ''}${mb.on.length ? ' · aggro on ' + mb.on.join(', ') : ''}` : '';
    schedule();
  }
  function drawMap() {
    const c = me(); if (!CP.open || !c || !isFinite(c.x)) return;
    // MAP ART per floor 2026-10-13: a switch of floor (teleport into / out of a dungeon, floor teleporter, death -> town) re-centres the view on me
    try { const lv0 = window.MapFloors && c.z != null && isFinite(c.z) ? MapFloors.view('cp:' + CP.name, c) : null; if (lv0 && lv0.changed && CP.view) { CP.follow = true; fit(); } } catch (e) { }
    if (!CP.view) fit(); if (!CP.view) return;
    const R = viewRect(), { x0, y0, W, H, u } = R, FS = fsMap();
    const svg = $id('cpSvg');
    svg.setAttribute('viewBox', `${x0} ${y0} ${W} ${H}`);
    const bg = $id('cpBg'); bg.setAttribute('x', x0 - W); bg.setAttribute('y', y0 - H); bg.setAttribute('width', 3 * W); bg.setAttribute('height', 3 * H);
    let key = '', imgs = '';
    if (typeof MT !== 'undefined' && W < 90000 && typeof floorTiles === 'function') {   // MAP ART per floor 2026-10-13 (index.html floorTiles)
      const T = floorTiles('cp:' + CP.name, c, x0, y0, W, H, u); imgs = T.imgs; key = T.key + (T.plain ? u.toFixed(2) : '') + imgs.length + imgs.slice(0, 120) + imgs.slice(-160);
    } else if (typeof MT !== 'undefined' && W < 90000) {
      for (let gx = Math.floor(x0 / MT); gx * MT < x0 + W; gx++) for (let gy = Math.floor(y0 / MT); gy * MT < y0 + H; gy++) {
        const RX = Math.floor(gx / 4) + 20, RY = Math.floor(gy / 4) + 18, cc = gx - Math.floor(gx / 4) * 4, rr = gy - Math.floor(gy / 4) * 4;
        let lay = ''; try { lay = ugLayer(RX, RY, c.z, c.x, c.y); } catch (e) { }
        const src = `/minitile/${RX}_${RY}${lay}_${cc}_${rr}.jpg`; key += src;
        imgs += `<image href="${src}" x="${gx * MT}" y="${gy * MT}" width="${MT}" height="${MT}" preserveAspectRatio="none"/>`;
      }
    }
    if (key !== CP.tilesKey) { CP.tilesKey = key; $id('cpTiles').innerHTML = imgs; }
    const inV = (x, y, m) => x > x0 - (m || 0) && x < x0 + W + (m || 0) && y > y0 - (m || 0) && y < y0 + H + (m || 0);
    // every label: the site's map size (--fs-map), in screen pixels at any zoom (u = map units per screen pixel)
    const label = (x, y, t, em, fill, anchor) => `<text x="${x}" y="${y}"${anchor ? ' text-anchor="' + anchor + '"' : ''} font-size="${(em ? FS + 1 : FS) * u}"${em ? ' font-weight="700"' : ''} fill="${fill || '#fff'}" paint-order="stroke" stroke="#000" stroke-width="${3 * u}" stroke-linejoin="round">${esc(t)}</text>`;
    const col = pcol(CP.party);
    let s = '';
    // hunting zone of the leader (room / area polygon or square)
    const lead = CP.live && (CP.live.members || []).find(m => m.name === CP.live.leader);
    const z = lead && lead.zone;
    if (z && isFinite(z.x) && Math.hypot(z.x - c.x, z.y - c.y) < 20000 && (!window.MapFloors || MapFloors.zone(c, z))) {
      let zp = Array.isArray(z.poly) && z.poly.length > 2 ? z.poly : null;
      try { if (!zp && z.room) zp = roomPolyFor(String(z.name || '').split(':')[0].trim(), z.room); } catch (e) { }
      if (zp) { const xs = zp.map(p => p[0]), ys = zp.map(p => p[1]); s += `<polygon points="${zp.map(p => p[0] + ',' + p[1]).join(' ')}" fill="rgba(227,194,122,.12)" stroke="#e3c27a" stroke-width="${1.6 * u}" stroke-dasharray="${8 * u} ${5 * u}"/>` + label(Math.min(...xs), Math.min(...ys) - 6 * u, (z.area ? 'area: ' : z.room ? 'room: ' : '') + (z.name || z.room || ''), false, '#e3c27a'); }
      else if (z.r) { const h = z.r / 2; s += `<rect x="${z.x - h}" y="${z.y - h}" width="${z.r}" height="${z.r}" fill="rgba(227,194,122,.07)" stroke="#e3c27a" stroke-width="${1.6 * u}" stroke-dasharray="${8 * u} ${5 * u}"/>` + label(z.x - h + 4 * u, z.y - h - 5 * u, 'hunting: ' + (z.name || ''), false, '#e3c27a'); }
    }
    // TOWN PATHS 2026-10-12 (Dashboard/townpaths.js): every street of a town in view (+ Giran's recorded routes), under my route. The zoom-independent
    // part sits in its own group (rebuilt only when the town / walked Giran route changes), the labels go into the overlay; toggle under the zoom buttons
    if (window.TownPaths) {
      try {
        const T = TownPaths.layer({ x0, y0, W, H, u }, { active: TownPaths.activeOf(c), fs: FS - 1 });
        let tg = $id('cpTown'); if (!tg) { tg = document.createElementNS('http://www.w3.org/2000/svg', 'g'); tg.id = 'cpTown'; svg.insertBefore(tg, $id('cpOver')); }
        if (tg._tpk !== T.key) { tg._tpk = T.key; tg.innerHTML = T.base; }
        s += T.labels;
        const zb = document.querySelector('#cpMap .cp-zoom'); if (zb && !zb.querySelector('[data-tptoggle]')) zb.insertAdjacentHTML('beforeend', TownPaths.toggleHtml('tp-icon'));
      } catch (e) { }
    }
    // NPCs (from my client): shops / gatekeepers labelled
    const imp = /gatekeeper|grocer|trader|warehouse|blacksmith|master|priest|magister|merchant|guard captain/i;
    const npcs = ((CP.char && CP.char.npcs) || []).filter(n => inV(n.x, n.y, 100) && onMyLevel(n, 600));
    npcs.forEach(n => {
      const fill = /gatekeeper/i.test(n.t + n.n) ? '#5aa9ff' : /grocer|trader|merchant|warehouse|blacksmith/i.test(n.t) ? '#6fd36f' : '#d8d8d8';
      s += `<rect x="${n.x - 3 * u}" y="${n.y - 3 * u}" width="${6 * u}" height="${6 * u}" fill="${fill}" stroke="#000" stroke-width="${u}" transform="rotate(45 ${n.x} ${n.y})"/>`;
      if ((imp.test(n.t) || /gatekeeper/i.test(n.n)) && npcs.length < 60 && W < 9000) s += label(n.x + 6 * u, n.y + 3.5 * u, n.n + (n.t ? ' · ' + n.t : ''), false, '#cfe2ff');
    });
    // routes / walks / escape of me (bright) and teammates (dim)
    [c].concat(matesHere()).forEach(m => {
      if (!isFinite(m.x) || !live(m)) return;
      const mine = m.name === CP.name, r = routeOf(m), op = mine ? .95 : .4;
      if (r && !r.done) {
        s += `<polyline points="${[[m.x, m.y]].concat(r.pts.slice(r.i)).map(p => p[0] + ',' + p[1]).join(' ')}" fill="none" stroke="#3fdc6a" stroke-width="${(mine ? 2.6 : 1.4) * u}" stroke-linejoin="round" opacity="${op}"/>`;
        if (mine) { const nx = r.pts[r.i]; s += `<circle cx="${nx[0]}" cy="${nx[1]}" r="${6 * u}" fill="none" stroke="#3fdc6a" stroke-width="${2 * u}"/>`;
          const g = r.goal; s += `<path d="M${g[0]} ${g[1]} v${-16 * u} l${10 * u} ${4 * u} l${-10 * u} ${4 * u}" fill="#3fdc6a" stroke="#000" stroke-width="${0.8 * u}"/>` + (r.label ? label(g[0] + 12 * u, g[1] - 8 * u, r.label, false, '#9ff5b0') : ''); }
      } else if (mine) {
        const w = walkTo(m); if (w) s += `<line x1="${m.x}" y1="${m.y}" x2="${w[0]}" y2="${w[1]}" stroke="#ffd34d" stroke-width="${2 * u}" stroke-dasharray="${7 * u} ${5 * u}" opacity=".9"/><circle cx="${w[0]}" cy="${w[1]}" r="${5 * u}" fill="none" stroke="#ffd34d" stroke-width="${2 * u}"/>`;
      }
      const e = m.escape;
      if (mine && e && e.on && e.target) s += `<polyline points="${[[m.x, m.y]].concat(e.target.path && e.target.path.length ? e.target.path : [[e.target.x, e.target.y]]).map(p => p[0] + ',' + p[1]).join(' ')}" fill="none" stroke="#ffd34d" stroke-width="${2 * u}" stroke-dasharray="${6 * u} ${4 * u}"/>` + label(e.target.x + 8 * u, e.target.y - 6 * u, 'escape: ' + (e.target.label || 'safe spot'), false, '#ffd34d');
    });
    // monsters + aggro lines + target lines
    const mobs = allMobs(), byName = {}; [c].concat(matesHere()).forEach(m => { byName[m.name] = m; });
    mobs.forEach(m => m.on.forEach(n => { const p = byName[n]; if (p && isFinite(p.x)) s += `<line x1="${m.x}" y1="${m.y}" x2="${p.x}" y2="${p.y}" stroke="#ff7a45" stroke-width="${(n === CP.name ? 2.6 : 1.3) * u}" opacity="${n === CP.name ? .95 : .55}"/>`; }));
    [c].concat(matesHere()).forEach(m => {
      if (!live(m) || m.dead || !isFinite(m.x)) return;
      let tp = m.tpos && isFinite(m.tpos.x) ? m.tpos : null;
      if (!tp && m.doing && m.doing.target) { let bd = 1e9; mobs.forEach(o => { if (o.n !== m.doing.target.name) return; const d = Math.hypot(o.x - m.x, o.y - m.y); if (d < bd && d < 1600) { bd = d; tp = o; } }); }
      if (tp) s += `<line x1="${m.x}" y1="${m.y}" x2="${tp.x}" y2="${tp.y}" stroke="#ffd34d" stroke-width="${(m.name === CP.name ? 2 : 1.1) * u}" stroke-dasharray="${2.5 * u} ${2.5 * u}" opacity="${m.name === CP.name ? .95 : .6}"/>`;
    });
    const placed = [];
    mobs.slice().sort((a, b) => b.on.length - a.on.length).forEach(m => {
      if (!inV(m.x, m.y, 200)) return;
      const hot = m.on.length > 0;
      if (m.raid) { s += `<circle cx="${m.x}" cy="${m.y}" r="${9 * u}" fill="#f0c040" stroke="#000" stroke-width="${1.4 * u}"/>` + label(m.x + 12 * u, m.y + 4 * u, '♛ ' + m.n + (m.hp != null ? ' ' + m.hp + '%' : ''), true, '#f0c040'); return; }
      s += `<circle cx="${m.x}" cy="${m.y}" r="${(hot ? 5 : 3.2) * u}" fill="#e0483c" stroke="${hot ? '#ffb020' : '#000'}" stroke-width="${(hot ? 2 : 0.7) * u}"/>`;
      if ((hot || W < 3000) && !placed.some(o => Math.hypot(o[0] - m.x, o[1] - m.y) < 24 * u)) { placed.push([m.x, m.y]); s += label(m.x + 7 * u, m.y - 5 * u, m.n + (m.lvl ? ' ' + m.lvl : '') + (m.hp != null && m.hp < 100 ? ' ' + m.hp + '%' : ''), false, hot ? '#ffb3a6' : '#e8c0b8'); }
    });
    // teammates (grouped labels), then me on top
    const groups = [];
    matesHere().forEach(m => {
      if (!isFinite(m.x) || !inV(m.x, m.y, 100)) return;
      s += `<circle cx="${m.x}" cy="${m.y}" r="${4.6 * u}" fill="${m.dead ? '#3a0d0d' : live(m) ? col : '#666'}" stroke="${live(m) && (m.combat || (m.doing && m.doing.target)) ? '#ff5a45' : '#fff'}" stroke-width="${1.3 * u}"/>`;
      if (Math.hypot(m.x - c.x, m.y - c.y) < 34 * u) return;
      const g = groups.find(o => Math.hypot(o.x - m.x, o.y - m.y) < 40 * u); if (g) g.n.push(m.name); else groups.push({ x: m.x, y: m.y, n: [m.name] });
    });
    groups.forEach(g => { s += label(g.x + 8 * u, g.y + 4 * u, g.n.length > 2 ? g.n[0] + ' +' + (g.n.length - 1) : g.n.join(', '), false, '#e9f1ff'); });
    const k = c.cast && !(window.castGone && castGone(c.cast, srvNow(), 6000)) ? c.cast : null, r0 = 7 * u, fight = live(c) && (c.combat || (c.doing && c.doing.target));
    s += `<circle class="cp-pulse" cx="${c.x}" cy="${c.y}" r="${r0 + 6 * u}" fill="none" stroke="#fff" stroke-width="${1.5 * u}"/>`;
    if (live(c) && k && !k.ended && +k.ms > 0) s += `<circle class="cp-arc" data-start="${esc(k.start)}" data-ms="${+k.ms}" cx="${c.x}" cy="${c.y}" r="${r0 + 3.5 * u}" fill="none" stroke="#ffcf4d" stroke-width="${2.6 * u}" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 ${c.x} ${c.y})"/>`;
    s += `<circle cx="${c.x}" cy="${c.y}" r="${r0}" fill="${c.dead ? '#3a0d0d' : !live(c) ? '#666' : (c.doing && c.doing.resting) ? '#5aa9ff' : col}" stroke="${fight ? '#ff5a45' : '#fff'}" stroke-width="${(fight ? 2.4 : 1.8) * u}"/>`;
    s += label(c.x + 12 * u, c.y - 8 * u, CP.name, true, '#fff');
    const sm = Math.pow(10, Math.floor(Math.log10(W / 4))), sb = W / 4 > 5 * sm ? 5 * sm : W / 4 > 2 * sm ? 2 * sm : sm;
    s += `<g transform="translate(${x0 + 10 * u} ${y0 + H - 12 * u})"><line x1="0" y1="0" x2="${sb}" y2="0" stroke="#fff" stroke-width="${2 * u}"/>${label(0, -5 * u, km(sb), false)}</g>`;
    $id('cpOver').innerHTML = s;
    $id('cpFollow').classList.toggle('on', CP.follow);
    $id('cpInfo').textContent = CP.info || '';
    let wh = ''; try { wh = typeof whereWords === 'function' ? whereWords(c.x, c.y) : ''; loadTownPos(); } catch (e) { }
    try { const lv = window.MapFloors && c.z != null && isFinite(c.z) ? MapFloors.view('cp:' + CP.name, c) : null; if (lv && lv.k !== 'surface' && lv.dn) wh = lv.dn + ' · ' + lv.n; } catch (e) { }   // TOIGAP-2026-10-22: inside a dungeon = its floor / the level between two floors
    $id('cpWhere').textContent = wh;
    anim();
  }

  // =========================================================================================== events
  function bind(s) {
    $id('cpZin').onclick = () => { CP.follow = false; zoomAt(null, 1 / 1.5); };
    $id('cpZout').onclick = () => { CP.follow = false; zoomAt(null, 1.5); };
    $id('cpFollow').onclick = () => { CP.follow = !CP.follow; if (CP.follow) fit(); schedule(); };
    gestures($id('cpMap'));
    $id('cpInvQ').addEventListener('input', (e) => { CP.invQ = e.target.value; if (CP.invQ && CP.invF !== 'all') { CP.invF = 'all'; s.querySelectorAll('[data-cpinvf]').forEach(b => b.classList.toggle('on', b.dataset.cpinvf === 'all')); } renderInv(); });
    s.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-close]')) { e.stopPropagation(); try { charBack(); } catch (er) { go('#/parties'); } return; }
      const f = t.closest('[data-cpinvf]'); if (f) { CP.invF = f.dataset.cpinvf; s.querySelectorAll('[data-cpinvf]').forEach(b => b.classList.toggle('on', b === f)); renderInv(); return; }
      const q = t.closest('[data-cpq]'); if (q && !q.disabled) { e.stopPropagation(); quick(q.dataset.cpq); return; }
      const sk = t.closest('.cp-sk'); if (sk) { e.stopPropagation(); skillPop(sk); return; }
      const cb = t.closest('[data-cpcry]'); if (cb) { e.stopPropagation(); cryClick(cb).catch(er => toast(er.message, false)); return; }   // CRYINV-2026-10-22
      const jb = t.closest('[data-cpjunk]'); if (jb) { e.stopPropagation(); CP.junk = !CP.junk; if (CP.junk && CP.cry && CP.cry.on) { CP.cry.on = false; CP.cry.sel.clear(); } jb.textContent = CP.junk ? 'Done' : 'Mark junk'; jb.classList.toggle('on', CP.junk); jb.setAttribute('aria-pressed', String(!!CP.junk)); const hn = $id('cpJunkHint'); if (hn) hn.hidden = !CP.junk; renderInv(); return; }   // JUNKMARK-2026-10-23
      const it = t.closest('[data-cpitem]'); if (it) { e.stopPropagation(); if (CP.junk && it.classList.contains('cp-it')) { junkPick(it).catch(er => toast(er.message, false)); return; } if (CP.cry.on) { cryPick(it); return; } itemPop(it); return; }
      const fb = t.closest('[data-fkbuy]'); if (fb) { e.stopPropagation(); frenzyBuy().catch(er => toast(er.message, false)); return; }   // KITBUY 2026-10-15
      const fg = t.closest('[data-fkget]'); if (fg) { e.stopPropagation(); frenzyGet().catch(er => toast(er.message, false)); return; }   // KITGET 2026-10-25
      const cm = t.closest('[data-cpclient]'); if (cm) { e.stopPropagation(); try { setClientMode(CP.name, cm.dataset.cpclient); } catch (er) { toast(er.message, false); } return; }
      const ov = t.closest('[data-cpovmenu]'); if (ov && window.Override) { e.stopPropagation(); Override.open(CP.name, ov, { context: 'char', title: CP.name }); return; }
    });
    document.addEventListener('click', async (e) => {
      const p = CP.pop; if (!p) return;
      const t = e.target;
      if (!t.closest('#cpPop')) { if (!t.closest('.cp-sk, [data-cpitem]')) closePop(); return; }
      const co = t.closest('[data-cpcryone]');   // CRYINV-2026-10-22: one piece from the item menu -> the same red confirm as the inventory mode
      if (co) { closePop(); CP.cry.sel = new Set([Number(co.dataset.cpcryone)]); try { await cryClick({ dataset: { cpcry: 'go' } }); } catch (er) { toast(er.message, false); } CP.cry.sel.clear(); return; }
      const g = t.closest('[data-cpgo]');
      if (g) {
        const id = g.dataset.id;
        if (g.dataset.cpgo === 'cast') { const on = g.dataset.on || ''; sendOv(`cast ${id}${on ? ' ' + on : ''}`, `${skName(id)}${on ? ' on ' + on : ''}`); }
        if (g.dataset.cpgo === 'use') { const it = ((CP.char && CP.char.items) || []).find(i => String(i.id) === id); sendOv('use ' + id, 'use ' + (it ? it.name : 'item ' + id)); }
        if (g.dataset.cpgo === 'useslot') { const it = ((CP.char && CP.char.items) || []).find(i => String(i.objId) === String(g.dataset.obj)); const sl = g.dataset.slot, lab = { ring1: 'ring slot 1', ring2: 'ring slot 2', ear1: 'earring slot 1', ear2: 'earring slot 2' }[sl] || sl;   // EQUIPSLOT-2026-10-22
          sendOv('use ' + g.dataset.obj + ' ' + sl, `put ${it ? it.name : 'the piece'} into ${lab}`); }
        closePop(); return;
      }
      // SELLNOSHOP 2026-10-22: Untick = off every sell list for this item; Destroy = the shared typed-YES dialog, then !ov <name> destroy <obj> <n>
      const un = t.closest('[data-cpunsell]');
      if (un) {
        const id = +un.dataset.cpunsell;
        try { const d = await api('/api/sell', { method: 'POST', body: JSON.stringify({ id, scope: CP.name, on: false }) }); if (d && d.list) SELL = Object.assign({ noShop: SELL.noShop }, d.list); } catch (er) { }
        toast(`${CP.name}: no longer marked for selling`, true); closePop(); renderInv(); return;
      }
      const ds = t.closest('[data-cpdestroy]');
      if (ds) {
        const n = +ds.dataset.n || 1, it = ((CP.char && CP.char.items) || []).find(i => String(i.objId || i.id) === ds.dataset.cpdestroy), nm = it ? it.name : 'item';
        closePop();
        sendOv(`destroy ${ds.dataset.cpdestroy} ${n}`, `DESTROY ${nm} ×${n} (no shop buys it)`, { danger: true });
        return;
      }
      const dr = t.closest('[data-cpdrop]');
      if (dr) {
        const n = +dr.dataset.n || 1, it = ((CP.char && CP.char.items) || []).find(i => String(i.objId || i.id) === dr.dataset.cpdrop), nm = it ? it.name : 'item';
        let cnt = n;
        if (n > 1) { const v = await uiPrompt({ title: `Drop ${nm}?`, body: `${CP.name}: drop how many ${nm}? (1-${n})`, label: 'How many', value: String(n), inputmode: 'numeric', type: 'text', confirmText: 'Next',
          validate: (v) => (/^\s*\d+\s*$/.test(v) && +v >= 1 && +v <= n ? '' : `A whole number from 1 to ${n}`) }); if (v === null) { closePop(); return; } cnt = Math.max(0, Math.min(n, parseInt(v, 10) || 0)); if (!cnt) { toast(`${CP.name}: drop ${nm} — cancelled`, null); closePop(); return; } }
        closePop();
        sendOv(`drop ${dr.dataset.cpdrop} ${cnt}`, `DROP ${nm} ×${cnt} on the ground`, { danger: true });
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && CP.pop) { e.stopPropagation(); closePop(); } }, true);
    document.addEventListener('change', (e) => { if (CP.open && e.target && e.target.dataset && (e.target.dataset.tl || e.target.dataset.sellid)) setTimeout(() => { renderTimeline(); renderInv(); }, 50); });
    // ITEMRULE-2026-10-24: the "otherwise" choice of an item -> /api/itemrule (stash_rules / loot_rules, read live by the bots)
    document.addEventListener('change', async (e) => {
      const sel = e.target && e.target.dataset && e.target.dataset.cprule; if (!CP.open || !sel) return;
      const id = Number(sel), rule = e.target.value;
      try { const d = await api('/api/itemrule', { method: 'POST', body: JSON.stringify({ name: CP.name, id, rule }) });
        if (!d || d.error) { toast(`not saved: ${(d && d.error) || 'no answer'}`, false); return; }
        CP.itemRule = d; e.target.classList.toggle('on', !!rule);
        toast(rule === 'keep' ? 'Kept in the bag (never stored)' : rule === 'store' ? 'Stored in the warehouse at the next stash' : rule === 'collector' ? `Given to the collector of party ${d.party} at the next hand-over` : rule === 'distributor' ? `Given to the collector of party ${d.party} at the next hand-over; the collector passes it to the distributor of its grade (Gear page -> Distributors: grades + the switch)` : 'Back to automatic', true);
      } catch (er) { toast(String(er.message || er), false); }
    });
    window.addEventListener('resize', () => { if (!CP.open) return; layout(); if (CP.follow) fit(); schedule(); });
  }

  window.addEventListener('townpaths:change', () => { if (CP.open) schedule(); });   // TOWN PATHS 2026-10-12: a town's graph arrived / the layer was switched
  window.CharPage = { route, open, close, _cp: CP, version: '2026-10-09' };
  // the page may already be on #/char/<name> (index.html's first route() ran before this script loaded)
  try { const [k, a] = location.hash.replace(/^#\/?/, '').split('/'); if (k === 'char' && a) open(decodeURIComponent(a)); } catch (e) { }
})();

// STATECTL-2026-10-22 (owner: "Make sure we can control STATE for each account, we keep ending up in weird scenarios"): the "State" box on the character
// page + the party card. Shows swarm_state.stateCtl (swarm.js STATECTL: everything that holds the character now) with in-game icons, a Stop button per
// stoppable item and two resets (back to normal = the party Start / stand idle = run switch OFF). Sends "!ov <name> state ..." through /api/command:
// the override word is allowed without a dashboard restart and only the named character acts (the catalog's "!state ..." works after the restart).
window.StateCtl = (() => {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const OPEN = {};   // party card: which State sections are open (the card is re-rendered every few seconds)
  const ICON = { dead: 'dead', escape: 'run', control: 'star', order: 'menuAction', queued: 'menuAction', handover: 'trade', handin: 'trade', supply: 'inv', regroup: 'party',
    rescue: 'res', teamwalk: 'map', routewalk: 'map', routesm: 'map', raid: 'raid', autolevel: 'sword', trade: 'trade', buffturn: 'buff', crystallize: 'inv', hunttimer: 'target',
    plan: 'quest', pause: 'idle', run: 'online' };
  const gi = (k) => { try { const u = typeof UI !== 'undefined' ? UI[ICON[String(k).split(':')[0]] || 'system'] : null; return u && typeof GI === 'function' ? GI(u, 'sm') : ''; } catch (e) { return ''; } };
  const charOf = (n) => { try { return typeof STATE !== 'undefined' && STATE && STATE.chars ? STATE.chars.find(c => c.name === n) : null; } catch (e) { return null; } };
  const ago = (ms) => { if (!ms) return ''; const s = Math.max(0, Math.round((Date.now() - Number(ms)) / 1000)); return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h'; };
  function itemsOf(n) { const c = charOf(n); return c && c.stateCtl && Array.isArray(c.stateCtl.items) ? c.stateCtl : null; }
  /** the list for one character (compact = the party card) */
  function listHtml(n, compact) {
    const S = itemsOf(n), c = charOf(n);
    if (!c) return `<div class="muted">${E(n)} is not reporting.</div>`;
    if (!S) return `<div class="muted">No state list yet — it appears after the next swarm.js update.</div>`;
    const items = S.items || [];
    const rows = items.length ? items.map(it => `<div class="stc-row${it.canStop ? ' can' : ''}" data-stckey="${E(it.key)}">${gi(it.key)}<span class="stc-l">${E(it.label)}${it.since && !compact ? ` <small>· ${E(ago(it.since))}</small>` : ''}</span>${it.canStop ? `<button type="button" class="uk-btn ghost stc-stop" data-stctl="stop" data-n="${E(n)}" data-key="${E(it.key)}" data-label="${E(it.label)}">Stop</button>` : ''}</div>`).join('')
      : `<div class="stc-row">${gi('run')}<span class="stc-l">Nothing holds it right now.</span></div>`;
    const last = S.last && S.last.msg ? `<div class="stc-last muted">Last: ${E(S.last.msg)}</div>` : '';
    const btns = `<div class="stc-btns"><button type="button" class="uk-btn" data-stctl="reset" data-mode="resume" data-n="${E(n)}">Reset → back to normal</button><button type="button" class="uk-btn ghost" data-stctl="reset" data-mode="idle" data-n="${E(n)}">Reset → stand idle</button></div>`;
    return `<div class="stc${compact ? ' compact' : ''}">${rows}${last}${btns}</div>`;
  }
  /** the party card: one line ("State: Tank1 3 · Bishop1 1 ...") that opens every member's list + a whole-party reset */
  function partyHtml(leader, list) {
    const names = (list || []).map(c => c.name);
    const cnt = names.map(n => { const S = itemsOf(n); return { n, k: S ? (S.items || []).filter(i => !/^(run|plan|hunttimer)$/.test(i.key)).length : 0 }; });
    const busy = cnt.filter(x => x.k > 0);
    const sum = busy.length ? busy.map(x => `${E(x.n)} ${x.k}`).join(' · ') : 'nothing stuck';
    return `<details class="stc-party" data-stcparty="${E(leader)}"${OPEN[leader] ? ' open' : ''}><summary>${gi('control')}<b>State</b> <span class="muted">${sum}</span></summary>
      ${names.map(n => `<div class="stc-mem"><div class="stc-mn">${E(n)}</div>${listHtml(n, true)}</div>`).join('')}
      <div class="stc-btns party"><button type="button" class="uk-btn" data-stctl="partyreset" data-mode="resume" data-leader="${E(leader)}" data-names="${E(names.join(','))}">Reset whole party → back to normal</button><button type="button" class="uk-btn ghost" data-stctl="partyreset" data-mode="idle" data-leader="${E(leader)}" data-names="${E(names.join(','))}">Reset whole party → stand idle</button></div></details>`;
  }
  async function send(n, args) {
    try { return await api('/api/command', { method: 'POST', body: JSON.stringify({ text: `!ov ${n} state ${args}`, targets: ['char:' + n], confirm: true }) }); }
    catch (e) { return { error: String(e && e.message || e) }; }
  }
  const say = (msg, ok) => { try { if (window.UIKit && UIKit.toast) UIKit.toast(msg, ok !== false); else if (typeof uiAlert === 'function') uiAlert({ title: 'State', body: msg }); } catch (e) { } };
  async function onClick(b) {
    const a = b.dataset.stctl, n = b.dataset.n, mode = b.dataset.mode;
    if (a === 'stop') {
      const ok = await uiConfirm({ title: `${n}: stop this?`, body: [uiP(uiEm(b.dataset.label || b.dataset.key))].concat([uiNote('Only this one thing stops. Everything else keeps running.')]), confirmText: 'Stop it', cancelText: 'Cancel' });
      if (!ok) return;
      const r = await send(n, `stop ${n} ${b.dataset.key}`); say(r && !r.error ? `${n}: stop sent — the State list updates in a few seconds` : `Not sent: ${(r && r.error) || 'no answer'}`, !(r && r.error)); return;
    }
    if (a === 'reset' || a === 'partyreset') {
      const names = a === 'reset' ? [n] : String(b.dataset.names || '').split(',').filter(Boolean);
      const who = a === 'reset' ? n : `party ${b.dataset.leader} (${names.length} characters)`;
      const ok = await uiConfirm({ title: `Reset the state of ${who}?`, danger: mode === 'idle',
        body: [uiP('Cancels every running and waiting order, hand-over, route walk, regroup / supply run, leveling and a stuck trade, and forgets half-finished saved progress.'),
          uiP(mode === 'resume' ? 'Then: the run switch goes ON and the party starts its normal plan / chosen spot.' : 'Then: it stands still with the run switch OFF until your next order.'),
          uiNote('Survival (heals, potions, escaping from a fight) is never stopped.')],
        confirmText: mode === 'resume' ? 'Reset → back to normal' : 'Reset → stand idle', cancelText: 'Cancel' });
      if (!ok) return;
      // the leader last: its Start (resume) then finds the members already cleared
      const lead = b.dataset.leader, order = names.filter(x => x !== lead).concat(names.includes(lead) ? [lead] : []);
      let bad = 0; for (const x of order) { const r = await send(x, `reset ${x} ${mode}`); if (!r || r.error) bad++; }
      say(bad ? `${bad} of ${order.length} not sent` : `Reset sent to ${order.length === 1 ? order[0] : order.length + ' characters'} — the State list updates in a few seconds`, !bad);
    }
  }
  document.addEventListener('toggle', (e) => { const d = e.target; if (d && d.matches && d.matches('details.stc-party')) OPEN[d.dataset.stcparty] = d.open; }, true);
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-stctl]'); if (!b) return; e.preventDefault(); e.stopPropagation(); onClick(b).catch(er => say(er.message, false)); }, true);
  return { listHtml, partyHtml, itemsOf, version: '2026-10-22' };
})();
