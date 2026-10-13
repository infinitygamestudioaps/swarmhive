// PARTY SETTINGS popup (owner 2026-10-13 19:10: "I want my own things switched on, but it should be something everyone configures themselves ...
// super easy under each party to switch the different options on — a popup with settings for a group ... if someone should give them adena,
// it must also configure the player you set up (the giver)"). Rules: manual-config-first (nothing automatic until switched on; the owner's
// current values are shown as they are), ui-for-non-technical (plain words, technical details only in the Advanced view), no-browser-alerts
// (uidialog.js only), owner-only-features (circuit link inside PRIVATE markers).
//
// One popup per party: "⚙ Settings" on every party card (2nd button, fixed place) and on the character page (its party). It is a FRONT-END
// over the existing settings APIs — nothing new is stored:
//   Money     /api/fundrules  (fund_rules.json: on, givers, parties.<leader>, chars.<member>.target)       POST { rules, rev }
//   Gear      /api/gearauto   (gear_auto.json: parties.<leader>.auto, chars.<member>.auto / lock)          POST { action:'set', scope, name, auto, lock, confirm }
//   Storage   /api/storage    (stash_rules.json: parties.<leader>, chars.<member>, letters.except)         POST { rules, rev }
//   Fighting  /api/tactics    (party_tactics.json.<leader>)                                                POST { party, mode, ... }
//   Routes    /api/routerules (route_rules.json parties.<leader>.<key>)                                    POST { party, key, value }
//   Daily     /api/daily      (Logs/daily_enabled.json.<leader>.kamaloka)                                  POST { leader, kind, on }
//             /api/sevensigns (seven_signs.json parties[])                                                 POST { cfg, rev }
//   Clan      /api/clanauto   (clan_quests.json clan.inviteParties[]; the clan-wide switches read-only)    POST { action:'inviteParty', leader, on }
//   Run       /api/runstate   (read; Start / Stop = RunSwitch's own button, it acts at once)
//   Supplies  /api/partyauto  (party_auto.json: parties.<leader>.supplyWatch / sell / dyes, chars.<member>.sell / dyes)  POST { party, values, chars, rev }
//   Money also writes parties.<leader>.givers (who may give to THIS party; missing = the shared givers) — 2026-10-13 PARTYAUTO / FUNDGIVERS
// One Save (sticky bar, Undo). Conflict check like the Storage page: before writing, every changed section is read again and compared with
// what the popup loaded; a difference asks "Overwrite?". Only the changed sections are written, and inside them only this party's entries
// (plus the shared givers / hand-out switch, labelled "all parties"). Supplies (2026-10-13): the supply watch, selling and symbols have their
// own per-party switches (+ per character for selling / symbols) in Scripts/data/party_auto.json; they work only while the party is started.
// Exposes window.PartySettings = { button(leader, small), open(leader), close(), _state }.
(function () {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const call = (u, o) => (typeof api === 'function' ? api(u, o) : fetch(u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o || {})).then(r => r.json()));
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const J = (o) => JSON.stringify(o === undefined ? null : o);
  const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
  const isSet = (v) => v !== undefined && v !== null && v !== '';
  const lc = (s) => String(s || '').toLowerCase();
  const fmtN = (n) => (n == null || n === '' || !isFinite(Number(n)) ? '' : Number(n).toLocaleString('en-US'));
  /** "8m" | "300k" | "8,000,000" -> number; '' -> null; bad -> NaN (= fundpage_api.js parseAmount) */
  function amt(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().toLowerCase().replace(/[\s,_']/g, ''); if (!s) return null;
    const m = s.match(/^(\d+(?:\.\d+)?)([kmb]?)$/); if (!m) return NaN;
    return Math.round(Number(m[1]) * ({ '': 1, k: 1e3, m: 1e6, b: 1e9 })[m[2]]);
  }
  const SRC = { fund: '/api/fundrules', gear: '/api/gearauto', storage: '/api/storage', tactics: '/api/tactics', routes: '/api/routerules',
    daily: '/api/daily', ss: '/api/sevensigns', clan: '/api/clanauto', run: '/api/runstate', pauto: '/api/partyauto' };
  /** which source each editable section needs */
  const SEC_SRC = { money: 'fund', supplies: 'pauto', gear: 'gear', storage: 'storage', tactics: 'tactics', routes: 'routes', daily: 'daily', ss: 'ss', clan: 'clan' };
  const SEC_NAME = { money: 'Money', supplies: 'Supplies', gear: 'Gear', storage: 'Storage', tactics: 'Fighting', routes: 'Routes', daily: 'Daily (Kamaloka)', ss: 'Daily (Seven Signs)', clan: 'Clan' };
  // PARTYAUTO 2026-10-13: the switches of the Supplies section (the same list as Dashboard/partyauto_api.js KINDS; the API's own list wins)
  const PA_KINDS = [
    { key: 'supplyWatch', char: false, label: 'Supply runs when someone runs low', help: 'The leader goes to Giran by himself when a character is low on escape / resurrection scrolls, shots, potions or arrows (or the bag is full), buys for everyone and hands it out.' },
    { key: 'sell', char: true, label: 'Sell junk on town visits', help: 'Items you marked "sell" are sold whenever a character idles in a town, and old gear + marked items are sold during supply runs (also the ones you order).' },
    { key: 'dyes', char: true, label: 'Draw symbols (dyes) in supply runs', help: 'During supply runs each character with a symbol plan buys the dyes and draws its next planned symbol at the Symbol Maker in Giran (also in the supply runs you order).' }];
  const PA_SHORT = { supplyWatch: 'supply runs', sell: 'selling', dyes: 'symbols' };
  const GMODES = ['auto', 'list', 'none'];
  const TACT_DEF = { mode: 'off', pairSize: 2, maxPairs: 3, leash: 900, zoneScale: 1, minDealers: 4, levelMargin: 2, fallbackHp: 40, includeBuffers: false };
  const DESTS = [['auto', 'Clan if a member, else its own'], ['clan', 'Clan warehouse'], ['private', 'Its own warehouse']];
  const MODES = [['rules', 'Smart: materials, old gear, letters…'], ['all', 'Everything except what it uses'], ['off', 'Nothing']];
  const TRIGS = [['bag', 'When the bag holds more than … kinds'], ['weight', 'When it carries more than … % weight'], ['supply', 'Only during supply runs'], ['town', 'Whenever it is idle in its town']];
  const CLAN_FLAGS = [['levelUp', 'Raise the clan level'], ['itemHandover', 'Hand clan level items to the clan leader'], ['levelQuests', 'Clan level quests'], ['questDispatch', 'Clan raid quests'],
    ['invite', 'Clan invites'], ['warehouseLook', 'Look into the clan warehouse'], ['skillLearn', 'Learn clan skills']];

  const PS = { leader: '', open: false, D: {}, err: {}, S0: {}, W: null, W0: null, bad: {}, busy: false, openSecs: new Set(['run']), gen: 0, opener: null };

  // ============================================================================================ data
  async function fetchSrc(k) {
    try { const d = await call(SRC[k]); return d && !d.error ? d : { __err: (d && d.error) || 'no answer' }; }
    catch (e) { return { __err: 'not available on this dashboard server yet (it needs a restart)' }; }
  }
  async function fetchAll(keys) { const out = {}; const r = await Promise.all(keys.map(fetchSrc)); keys.forEach((k, i) => { out[k] = r[i]; }); return out; }
  const ok = (d) => d && !d.__err;
  /** the party's members: config parties (adena / storage / gear APIs) > live state > the leader alone */
  function membersOf(D, L) {
    const from = (d) => { if (!ok(d) || !Array.isArray(d.parties)) return null; const p = d.parties.find(x => x.leader === L); return p ? (p.members || []).map(m => (typeof m === 'string' ? m : m.name)).filter(Boolean) : null; };
    let M = from(D.fund) || from(D.storage) || from(D.gear);
    if (!M) { try { const cs = (typeof STATE !== 'undefined' && STATE && STATE.chars) || []; const l = cs.filter(c => c.party === L).map(c => c.name); if (l.length) M = l; } catch (e) { } }
    M = M && M.length ? M.slice() : [L];
    return [L].concat(M.filter(n => n !== L));
  }
  function memberInfo(n) {
    const D = PS.D, f = ok(D.fund) ? (D.fund.parties || []).flatMap(p => p.members || []).find(m => m.name === n) : null;
    const s = ok(D.storage) ? (D.storage.parties || []).flatMap(p => p.members || []).find(m => m.name === n) : null;
    let st = null; try { st = ((typeof STATE !== 'undefined' && STATE && STATE.chars) || []).find(c => c.name === n) || null; } catch (e) { }
    return { name: n, level: (f && f.level) || (st && st.level) || null, cls: (f && f.cls) || (st && st.cls) || '', clan: (s && s.clan) || '' };
  }

  /** the party-relevant part of every source (conflict check: loaded vs. read again before saving) */
  const SLICE = {
    money: (d, L, M) => { const r = obj(d.rules); return { on: r.on, givers: r.givers || null, party: obj(r.parties)[L] || null, chars: M.map(n => obj(r.chars)[n] || null) }; },
    supplies: (d, L, M) => { const D = obj(d.data); return { party: obj(D.parties)[L] || null, chars: M.map(n => obj(D.chars)[n] || null) }; },
    gear: (d, L, M) => { const p = (d.parties || []).find(x => x.leader === L) || {}; const mm = {}; (p.members || []).forEach(m => { if (M.includes(m.name)) mm[m.name] = [m.auto, m.lock]; }); return { party: p.auto === undefined ? null : p.auto, mm }; },
    storage: (d, L, M) => { const r = obj(d.rules); return { party: obj(r.parties)[L] || null, chars: M.map(n => obj(r.chars)[n] || null), except: (obj(r.letters).except || []).filter(n => M.includes(n)).sort() }; },
    tactics: (d, L) => obj(d.tactics)[L] || null,
    routes: (d, L) => obj(d.own)[L] || null,
    daily: (d, L) => !!obj(obj(d.enabled)[L]).kamaloka,
    ss: (d, L) => (obj(d.cfg).parties || []).some(x => lc(x) === lc(L)),
    clan: (d, L) => { const row = (d.rows || []).find(r => r.key === 'invite'); return !!(row && (row.parties || []).includes(L)); },
  };

  /** the editable model of the popup (strings for typed amounts) */
  function model(D, L, M) {
    const W = {};
    if (ok(D.fund)) {
      const r = obj(D.fund.rules), p = obj(r.parties)[L], g = obj(r.givers);
      W.money = { on: r.on === undefined ? true : !!r.on, receive: p ? p.receive !== false : null,
        lt: p && isSet(p.leaderTarget) ? fmtN(p.leaderTarget) : '', mt: p && isSet(p.memberTarget) ? fmtN(p.memberTarget) : '',
        chars: Object.fromEntries(M.map(n => { const c = obj(r.chars)[n]; return [n, c && isSet(c.target) ? fmtN(c.target) : '']; })),
        gmode: ['auto', 'list', 'none'].includes(g.mode) ? g.mode : 'auto', glist: Array.isArray(g.list) ? g.list.slice() : [], keep: isSet(g.keepAtLeast) ? fmtN(g.keepAtLeast) : '' };
      // FUNDGIVERS 2026-10-13: who may give to THIS party ('all' = the shared rule below)
      const pg = p && p.givers && GMODES.includes(p.givers.mode) ? p.givers : null;
      W.money.pg = pg ? pg.mode : 'all'; W.money.pglist = pg && pg.mode === 'list' && Array.isArray(pg.list) ? pg.list.slice() : [];
    }
    if (ok(D.pauto)) {   // PARTYAUTO 2026-10-13: null = no own setting (the setting for all parties / like the party)
      const d = obj(D.pauto.data), P = obj(obj(d.parties)[L]), bool = (v) => (typeof v === 'boolean' ? v : null), party = {}, chars = {};
      paKinds().forEach(k => { party[k.key] = bool(P[k.key]); });
      M.forEach(n => { const C = obj(obj(d.chars)[n]); chars[n] = {}; paKinds().filter(k => k.char).forEach(k => { chars[n][k.key] = bool(C[k.key]); }); });
      W.supplies = { party, chars };
    }
    if (ok(D.gear)) {
      const p = (D.gear.parties || []).find(x => x.leader === L) || null, mm = {};
      M.forEach(n => { const m = p ? (p.members || []).find(x => x.name === n) : null; mm[n] = { auto: m && typeof m.auto === 'boolean' ? m.auto : null, lock: !!(m && m.lock) }; });
      W.gear = { party: p && typeof p.auto === 'boolean' ? p.auto : null, members: mm };
    }
    if (ok(D.storage)) {
      const r = obj(D.storage.rules), P = obj(obj(r.parties)[L]), t = obj(P.trigger), Lt = obj(r.letters), mm = {};
      M.forEach(n => { const C = obj(obj(r.chars)[n]); mm[n] = { auto: typeof C.auto === 'boolean' ? (C.auto ? 'on' : 'off') : '', dest: C.dest || '', mode: C.mode || '' }; });
      W.storage = { party: { auto: typeof P.auto === 'boolean' ? P.auto : null, dest: P.dest || '', mode: P.mode || '', kind: t.kind || '', above: isSet(t.above) ? String(t.above) : '',
        weightPct: isSet(t.weightPct) ? String(t.weightPct) : '', gapMin: isSet(t.gapMin) ? String(t.gapMin) : '', town: P.town || '' }, members: mm,
        letters: !M.every(n => (Lt.except || []).includes(n)) };
    }
    if (ok(D.tactics)) { const all = obj(D.tactics.tactics); W.tactics = Object.assign({}, TACT_DEF, obj(all._defaults), obj(all[L])); Object.keys(W.tactics).forEach(k => { if (!(k in TACT_DEF)) delete W.tactics[k]; }); }
    if (ok(D.routes) && (D.routes.parties || []).includes(L)) { const own = obj(obj(D.routes.own)[L]), o = {}; (D.routes.rules || []).forEach(r => { o[r.key] = typeof own[r.key] === 'boolean' ? own[r.key] : null; }); W.routes = o; }
    if (ok(D.daily)) W.daily = { kamaloka: !!obj(obj(D.daily.enabled)[L]).kamaloka };
    if (ok(D.ss)) W.ss = { enrolled: SLICE.ss(D.ss, L) };
    if (ok(D.clan) && D.clan.clan) W.clan = { invite: SLICE.clan(D.clan, L) };
    return W;
  }

  async function load(leader, keepScroll) {
    const g = ++PS.gen;
    PS.leader = leader;
    const D = await fetchAll(Object.keys(SRC));
    if (g !== PS.gen || !PS.open) return;
    PS.D = D; PS.M = membersOf(D, leader);
    PS.S0 = {}; Object.keys(SEC_SRC).forEach(s => { const d = D[SEC_SRC[s]]; if (ok(d)) { try { PS.S0[s] = J(SLICE[s](d, leader, PS.M)); } catch (e) { } } });
    PS.W = model(D, leader, PS.M); PS.W0 = clone(PS.W); PS.bad = {};
    render(keepScroll);
  }

  // ============================================================================================ model helpers
  const getP = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), PS.W);
  function setP(p, v) { const ks = p.split('.'); let o = PS.W; for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; }
  const dirtySecs = () => (PS.W && PS.W0 ? Object.keys(PS.W).filter(s => J(PS.W[s]) !== J(PS.W0[s])) : []);
  const runInfo = () => (ok(PS.D.run) ? (PS.D.run.parties || []).find(p => p.leader === PS.leader) || null : null);
  const runOn = () => !!(runInfo() && runInfo().on);
  function fundDefaults() { const r = ok(PS.D.fund) ? obj(PS.D.fund.rules) : {}, d = obj(r.defaults); return { lt: isSet(d.leaderTarget) ? Number(d.leaderTarget) : 8000000, mt: isSet(d.memberTarget) ? Number(d.memberTarget) : 3000000, keep: 30000000 }; }
  function gearDef() { return ok(PS.D.gear) ? !!PS.D.gear.default : false; }
  const paKinds = () => (ok(PS.D.pauto) && Array.isArray(PS.D.pauto.kinds) && PS.D.pauto.kinds.length ? PS.D.pauto.kinds : PA_KINDS);
  const paDef = (k) => (ok(PS.D.pauto) ? obj(obj(PS.D.pauto.data).default)[k] === true : false);
  const paParty = (k) => (PS.W.supplies.party[k] === null ? paDef(k) : PS.W.supplies.party[k]);
  /** who may give to this party, in words */
  function giversText(mode, list, none) { return mode === 'none' ? 'nobody gives' : mode === 'list' ? (list.length ? `only ${list.join(', ')}` : none || 'nobody chosen yet — nobody gives') : 'any rich party leader'; }
  const gearPartyEff = () => (PS.W.gear.party === null ? gearDef() : PS.W.gear.party);
  function stoBase() {
    const r = ok(PS.D.storage) ? obj(PS.D.storage.rules) : {}, B = Object.assign({ dest: 'private', auto: false, above: 120 }, ok(PS.D.storage) ? obj(PS.D.storage.base) : {}), Df = obj(r.defaults), Dt = obj(Df.trigger);
    return { auto: typeof Df.auto === 'boolean' ? Df.auto : !!B.auto, dest: Df.dest || (r.dest || B.dest || 'private'), mode: Df.mode || 'rules', town: Df.town || 'Giran',
      kind: Dt.kind || 'bag', above: isSet(Dt.above) ? Dt.above : (B.above || 120), weightPct: isSet(Dt.weightPct) ? Dt.weightPct : 70, gapMin: isSet(Dt.gapMin) ? Dt.gapMin : 30 };
  }
  function stoParty() { const b = stoBase(), p = PS.W.storage.party; return { auto: p.auto === null ? b.auto : p.auto, dest: p.dest || b.dest, mode: p.mode || b.mode, kind: p.kind || b.kind, town: p.town || b.town,
    above: p.above || b.above, weightPct: p.weightPct || b.weightPct, gapMin: p.gapMin || b.gapMin, src: p.auto === null ? 'all' : 'party' }; }
  const lettersCfg = () => (ok(PS.D.storage) ? obj(PS.D.storage.rules).letters || null : null);
  function lettersTo() { const L = lettersCfg(); if (!L) return ''; return !L.to || L.to === 'clanleader' ? (ok(PS.D.storage) && PS.D.storage.clanLeader) || 'the clan leader' : L.to; }
  function routeDefault(key) { const v = ok(PS.D.routes) ? obj(obj(PS.D.routes.values)[PS.leader]) : {}, own = ok(PS.D.routes) ? obj(obj(PS.D.routes.own)[PS.leader]) : {}; const r = ok(PS.D.routes) ? (PS.D.routes.rules || []).find(x => x.key === key) : null;
    return typeof own[key] === 'boolean' ? !!(r && r.default) : (typeof v[key] === 'boolean' ? v[key] : !!(r && r.default)); }
  const inClan = () => PS.M.filter(n => memberInfo(n).clan);

  // ============================================================================================ small render helpers
  function sw(path, on, label, onText, offText, o) {
    o = o || {};
    if (window.UIKit && UIKit.switchHtml) return UIKit.switchHtml({ on, label, onText, offText, disabled: o.disabled, attrs: { 'data-psw': path, 'data-eff': on ? '1' : '0' } });
    return `<button type="button" class="uk-switch" role="switch" aria-checked="${!!on}" data-psw="${E(path)}" data-eff="${on ? 1 : 0}"${o.disabled ? ' disabled' : ''}><span class="uk-track"><span class="uk-knob"></span></span><span class="uk-sl"><b>${E(label)}</b><span>${E(on ? onText || 'On' : offText || 'Off — nothing happens until you switch it on.')}</span></span></button>`;
  }
  const OFF = 'Off — nothing happens until you switch it on.';
  function item(switchHtml, what, extra) { return `<div class="ps-item">${switchHtml}${what ? `<div class="ps-what">${what}</div>` : ''}${extra || ''}</div>`; }
  function seg(path, cur, opts, label) {
    return `<div class="ps-field"><span class="ps-lab">${E(label)}</span><div class="ps-seg" role="radiogroup" aria-label="${E(label)}">${opts.map(([v, t]) => `<button type="button" role="radio" aria-checked="${String(cur) === String(v)}" data-psseg="${E(path)}" data-v="${E(v)}">${E(t)}</button>`).join('')}</div></div>`;
  }
  function sel(path, cur, opts, label, o) {
    o = o || {};
    return `<label class="ps-field"><span class="ps-lab">${E(label)}</span><select data-pssel="${E(path)}"${o.kind ? ` data-kind="${o.kind}"` : ''}>${opts.map(([v, t]) => `<option value="${E(v)}"${String(cur) === String(v) ? ' selected' : ''}>${E(t)}</option>`).join('')}</select></label>`;
  }
  function inp(path, val, label, o) {
    o = o || {};
    const bad = PS.bad[path];
    return `<label class="ps-field${o.small ? ' sm' : ''}"><span class="ps-lab">${E(label)}</span><input type="text" inputmode="${o.mode || 'numeric'}" autocomplete="off" data-psin="${E(path)}" value="${E(val)}" placeholder="${E(o.ph || '')}"${bad ? ' aria-invalid="true"' : ''}>${bad ? `<span class="ps-bad">${E(bad)}</span>` : o.hint ? `<span class="ps-hint">${E(o.hint)}</span>` : ''}</label>`;
  }
  const link = (hash, text) => `<a class="ps-link" href="${E(hash)}" data-psgo="${E(hash)}">${E(text)} ›</a>`;
  const adv = (html) => `<div class="ps-adv" data-adv>${html}</div>`;
  const note = (html, cls) => `<div class="ps-note${cls ? ' ' + cls : ''}">${html}</div>`;
  const unavailable = (k) => note(`Not available: ${E((PS.D[k] && PS.D[k].__err) || 'no answer')}. The other sections still work.`, 'bad');
  function quick(cmd, label, btn, title) { return `<button type="button" class="uk-btn secondary ps-now" data-quick="party:${E(PS.leader)}|${E(cmd)}|${E(label)}" title="${E(title || label)}">${E(btn)}</button>`; }
  function section(key, icon, title, summary, body, o) {
    o = o || {};
    const dirty = o.dirty ? ' <span class="ps-dot" title="unsaved changes">●</span>' : '';
    return `<details class="ps-sec" data-pssec="${key}"${PS.openSecs.has(key) ? ' open' : ''}><summary><span class="ps-ic" aria-hidden="true">${icon}</span><span class="ps-st"><b>${E(title)}${dirty}</b><span class="ps-sum">${E(summary)}</span></span></summary><div class="ps-body">${body}</div></details>`;
  }

  // ============================================================================================ sections
  function secRun() {
    const p = runInfo(), on = runOn();
    let circuit = '';
    const body = !ok(PS.D.run) ? unavailable('run') : `
      <div class="ps-runrow">${window.RunSwitch ? RunSwitch.partyButton(PS.leader) : ''}<div class="ps-runtxt">${on ? '<b class="ok">Running.</b> The switches below work by themselves.' : '<b>Stopped.</b> Nothing below happens on its own until you press Start.'}</div></div>
      ${note(`<b>Start will:</b> ${E(p && p.plan ? p.plan.text : 'start its activity')}.`)}
      ${note('Start and Stop work at once (they are not part of Save). While stopped, the characters still heal, defend themselves, answer trades and obey every order you send.')}
      ${circuit}`;
    return section('run', '▶', 'Start / Stop', on ? 'Running' : 'Stopped — does nothing on its own', body);
  }

  function secMoney() {
    if (!PS.W.money) return section('money', '💰', 'Money', 'not available', unavailable('fund'));
    const m = PS.W.money, d = fundDefaults(), rec = m.receive !== false, town = ok(PS.D.fund) ? obj(PS.D.fund.rules).town || 'Giran' : 'Giran';
    const all = ok(PS.D.fund) ? PS.D.fund.parties || [] : [];
    const gText = m.gmode === 'none' ? 'nobody gives' : m.gmode === 'list' ? (m.glist.length ? `givers: ${m.glist.join(', ')}` : 'no giver chosen yet') : 'any rich party leader gives';
    const pgText = m.pg === 'all' ? gText : m.pg === 'none' ? 'nobody gives (own choice)' : m.pg === 'list' ? (m.pglist.length ? `own givers: ${m.pglist.join(', ')}` : 'own givers: none chosen yet') : 'any rich party leader gives (own choice)';
    const sum = !m.on ? 'Hand-outs between parties are off' : rec ? `Receives adena · ${pgText}` : 'Does not receive adena';
    // FUNDGIVERS 2026-10-13: who may give to THIS party (only party leaders hand out: swarm.js fundRound)
    const others = all.filter(p => p.leader !== PS.leader);
    const pgState = !m.on ? 'Hand-outs between parties are off for everyone (switch above) — this choice waits.' : !rec ? 'This party does not receive adena, so nobody gives to it.'
      : m.pg === 'all' ? `Like all parties: ${giversText(m.gmode, m.glist)} (the shared choice below).` : m.pg === 'none' ? 'Off — nobody gives adena to this party.'
      : m.pg === 'auto' ? 'On — any rich party leader may give to this party.' : m.pglist.length ? `On — only ${m.pglist.join(', ')} may give to this party.` : 'Nobody chosen yet — nobody gives to this party until you tick a name.';
    const ownPick = m.pg !== 'list' ? '' : `<div class="ps-givers" data-psgivers="party"><div class="ps-gp"><span class="ps-gpl">Party leaders</span>${others.map(p => { const x = (p.members || []).find(mm => mm.name === p.leader) || { name: p.leader }; const on = m.pglist.includes(x.name);
      return `<button type="button" class="ps-chipbtn" aria-pressed="${on}" data-psgiverp="${E(x.name)}" title="${E(x.adena != null ? fmtN(x.adena) + ' adena now' : '')}">${on ? '✓ ' : ''}${E(x.name)}${x.adena != null ? ` <small>${E(shortAmt(x.adena))}</small>` : ''}</button>`; }).join('') || note('No other party known yet.')}
      ${m.pglist.filter(n => !others.some(p => p.leader === n)).map(n => `<button type="button" class="ps-chipbtn" aria-pressed="true" data-psgiverp="${E(n)}">✓ ${E(n)}</button>`).join('')}</div></div>
      <div class="ps-what">Only party leaders hand out adena, so the leaders of the other parties are listed. A giver keeps at least the minimum below.</div>`;
    const giverPick = m.gmode !== 'list' ? '' : `<div class="ps-givers">${all.map(p => `<div class="ps-gp"><span class="ps-gpl">Party ${E(p.leader)}</span>${(p.members || []).map(x => {
      const on = m.glist.includes(x.name);
      return `<button type="button" class="ps-chipbtn" aria-pressed="${on}" data-psgiver="${E(x.name)}" title="${E(x.adena != null ? fmtN(x.adena) + ' adena now' : '')}">${on ? '✓ ' : ''}${E(x.name)}${x.adena != null ? ` <small>${E(shortAmt(x.adena))}</small>` : ''}</button>`; }).join('')}</div>`).join('') || note('No characters known yet.')}</div>`;
    const body = `
      ${item(sw('money.on', m.on, 'Adena hand-outs between parties', `On — for every party (meeting town: ${town})`, 'Off for every party — nobody hands out adena.'), 'A rich character of one party tops up the characters of other parties when both are idle in the same town. <b>Shared by all parties.</b>')}
      ${item(sw('money.receive', m.on && rec, `Party ${PS.leader} receives adena`, m.receive === null ? 'On (no own setting yet: every party receives unless switched off)' : 'On',
        m.on ? 'Off — this party never gets adena from others.' : 'Off — hand-outs between parties are off for everyone (switch above).', { disabled: !m.on }),
        'Its characters are topped up to the amounts below when they are low.',
        rec ? `<div class="ps-grid">${inp('money.lt', m.lt, 'Top up the leader to', { ph: fmtN(d.lt) + ' (default)' })}${inp('money.mt', m.mt, 'Top up each member to', { ph: fmtN(d.mt) + ' (default)' })}</div>` : '')}
      <div class="ps-sub"><b>Who gives to party ${E(PS.leader)}</b></div>
      ${seg('money.pg', m.pg, [['all', 'Like all'], ['auto', 'Any leader'], ['list', 'Chosen'], ['none', 'Nobody']], 'Givers for this party')}
      <div class="ps-what ps-pgstate">${E(pgState)}</div>
      ${ownPick}
      <div class="ps-sub"><b>Who gives — all other parties</b> <span class="ps-shared">shared by all parties without their own choice</span></div>
      ${seg('money.gmode', m.gmode, [['auto', 'Any rich leader'], ['list', 'Only chosen'], ['none', 'Nobody']], 'Givers')}
      ${giverPick}
      <div class="ps-grid">${inp('money.keep', m.keep, 'A giver always keeps at least', { ph: fmtN(d.keep) + ' (default)' })}</div>
      <details class="ps-more"><summary>Per character</summary><div class="ps-grid">${PS.M.map(n => inp('money.chars.' + n, m.chars[n] || '', n + (n === PS.leader ? ' (leader)' : ''), { ph: 'party amount', hint: '0 = never receives', small: true })).join('')}</div></details>
      <div class="ps-acts">${quick('!collect', 'Collect adena to the leader', 'Collect spare adena to the leader now', 'Members keep 2M / 2.5M / 3M by level; the rest goes to the leader')}${link('#/adena', 'Adena page (all parties)')}</div>
      ${adv(note('File: Scripts/data/fund_rules.json — parties.' + E(PS.leader) + ' (receive, targets, givers = who may give to this party; missing = the shared givers), chars.<member>.target, givers (shared), on (shared). Amounts accept 8m / 300k / 8,000,000.'))}`;
    return section('money', '💰', 'Money', sum, body, { dirty: dirtySecs().includes('money') });
  }
  function shortAmt(n) { n = Number(n) || 0; return n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n); }

  // PARTYAUTO 2026-10-13: own switches (were: "follow Start / Stop, no separate switch yet")
  function secSupplies() {
    const acts = `<div class="ps-acts">${quick('!supply', 'Supplies (leader buys in Giran and hands them out)', 'Supply run now')}${quick('!sell', 'Sell (every member sells its marked items + junk at the nearest shop)', 'Sell now')}</div>`;
    if (!PS.W.supplies) return section('supplies', '🧪', 'Supplies', 'not available', unavailable('pauto') + acts);
    const s = PS.W.supplies, run = runOn(), K = paKinds();
    const items = K.map(k => {
      const own = s.party[k.key] !== null, eff = paParty(k.key), d = paDef(k.key);
      const onTxt = (own ? 'On' : 'On — the setting for all parties') + (run ? '' : ' (works once you press Start)');
      const offTxt = own ? OFF : 'Off — nothing happens until you switch it on (the setting for all parties).';
      const reset = own ? `<button type="button" class="uk-btn ghost ps-reset" data-psreset="supplies.party.${E(k.key)}">Use the all-parties setting (${d ? 'on' : 'off'})</button>` : '';
      return item(sw('supplies.party.' + k.key, eff, k.label, onTxt, offTxt), E(k.help), reset);
    }).join('');
    const ck = K.filter(k => k.char);
    const rows = PS.M.map(n => { const c = s.chars[n] || {};
      return `<div class="ps-mrow"><span class="ps-mn">${E(n)}${ck.some(k => c[k.key] !== null && c[k.key] !== undefined) ? ' <small>own</small>' : ''}</span>${ck.map(k => {
        const v = c[k.key], pe = paParty(k.key);
        return sel(`supplies.chars.${n}.${k.key}`, v === null || v === undefined ? '' : v ? 'on' : 'off', [['', `Like the party (${pe ? 'on' : 'off'})`], ['on', 'On'], ['off', 'Off']], k.key === 'sell' ? 'Selling' : 'Symbols', { kind: 'tri' }); }).join('')}</div>`; }).join('');
    const onK = K.filter(k => paParty(k.key)).map(k => PA_SHORT[k.key] || k.key);
    const sum = !onK.length ? 'Off — nothing by itself' : `${onK.join(' · ')}${run ? '' : ' (waits for Start)'}`;
    const body = `
      ${items}
      <details class="ps-more"><summary>Per character</summary>${rows}<div class="ps-what">A character's own choice wins over the party's switch for selling and symbols.</div></details>
      ${note('Your orders always work, also while these are off: <b>Supply run now</b> (!supply), <b>Sell now</b> (!sell), and !dyes on a character in Giran. A supply run sells and draws symbols only for the characters whose switch is on.', 'info')}
      ${acts}
      ${adv(note('File: Scripts/data/party_auto.json — parties.' + E(PS.leader) + '.supplyWatch / sell / dyes, chars.<member>.sell / dyes; missing = default (' + K.map(k => k.key + ' ' + (paDef(k.key) ? 'on' : 'off')).join(', ') + '). Amounts: swarm.js CONFIG.lead.supply; symbol plans: Scripts/data/dye_plan.json. Gates: runAuto + pautoGate in swarm.js.'))}`;
    return section('supplies', '🧪', 'Supplies', sum, body, { dirty: dirtySecs().includes('supplies') });
  }

  function secGear() {
    if (!PS.W.gear) return section('gear', '🛡', 'Gear', 'not available', unavailable('gear'));
    const g = PS.W.gear, eff = gearPartyEff(), def = gearDef();
    const onTxt = g.party === null ? 'On — the setting for all parties' : 'On — this party';
    const offTxt = g.party === null ? 'Off — nothing happens until you switch it on (the setting for all parties).' : OFF;
    const reset = g.party !== null ? `<button type="button" class="uk-btn ghost ps-reset" data-psreset="gear.party">Use the all-parties setting (${def ? 'on' : 'off'})</button>` : '';
    const rows = PS.M.map(n => { const m = g.members[n] || { auto: null, lock: false }, e = m.auto === null ? eff : m.auto;
      return `<div class="ps-mrow"><span class="ps-mn">${E(n)}${m.auto === null ? '' : ' <small>own</small>'}</span>${sel('gear.members.' + n + '.auto', m.auto === null ? '' : m.auto ? 'on' : 'off', [['', `Like the party (${eff ? 'on' : 'off'})`], ['on', 'Buys upgrades'], ['off', 'Never buys']], 'Upgrades', { kind: 'tri' })}
        <label class="ps-chk"><input type="checkbox" data-pschk="gear.members.${E(n)}.lock"${m.lock ? ' checked' : ''}> Lock its gear</label><span class="ps-mstate">${e && !m.lock ? 'buys' : 'off'}</span></div>`; }).join('');
    const body = `
      ${item(sw('gear.party', eff, 'Buy gear upgrades by themselves', onTxt, offTxt), 'During supply runs in Giran each character buys the better weapon / armor / jewelry for its level and class (your Gear page preferences).', reset)}
      <details class="ps-more"><summary>Per character</summary>${rows}<div class="ps-what">Lock = never change anything it wears.</div></details>
      ${note('Enchanting is always manual (safe up to +4): use Enchant on a character. It never happens by itself.', 'info')}
      <div class="ps-acts">${link('#/gear', 'Gear page')}</div>
      ${adv(note('File: Scripts/data/gear_auto.json — parties.' + E(PS.leader) + '.auto, chars.<member>.auto / lock; all parties: default = ' + (def ? 'true' : 'false') + '.'))}`;
    return section('gear', '🛡', 'Gear', eff ? 'Buys upgrades by itself' : 'Off', body, { dirty: dirtySecs().includes('gear') });
  }

  function secStorage() {
    if (!PS.W.storage) return section('storage', '📦', 'Storage', 'not available', unavailable('storage'));
    const s = PS.W.storage, e = stoParty(), b = stoBase(), Lc = lettersCfg(), towns = ok(PS.D.storage) ? PS.D.storage.towns || [] : [];
    const destTxt = (d) => (DESTS.find(x => x[0] === d) || [d, d])[1];
    const reset = s.party.auto !== null ? `<button type="button" class="uk-btn ghost ps-reset" data-psreset="storage.party.auto">Use the all-parties setting (${b.auto ? 'on' : 'off'})</button>` : '';
    const trigNum = e.kind === 'bag' ? inp('storage.party.above', s.party.above, 'More than … kinds', { ph: String(b.above), small: true }) : e.kind === 'weight' ? inp('storage.party.weightPct', s.party.weightPct, 'More than … %', { ph: String(b.weightPct), small: true }) : '';
    const mrows = PS.M.map(n => { const m = s.members[n] || {}, mi = memberInfo(n);
      return `<div class="ps-mrow"><span class="ps-mn">${E(n)}${mi.clan ? '' : ' <small>no clan</small>'}</span>
        ${sel('storage.members.' + n + '.auto', m.auto, [['', 'Like the party'], ['on', 'Stores by itself'], ['off', 'Never by itself']], 'Automatic')}
        ${sel('storage.members.' + n + '.dest', m.dest, [['', 'Like the party']].concat(DESTS), 'Warehouse')}
        ${sel('storage.members.' + n + '.mode', m.mode, [['', 'Like the party']].concat(MODES), 'What')}</div>`; }).join('');
    const letters = !Lc ? note('Event letters: not set up (Storage page).') : !Lc.on
      ? item(`<div class="ps-ro"><b>Hand event letters to ${E(lettersTo())}</b><span>Off for everyone — switch it on on the Storage page</span></div>`, '')
      : item(sw('storage.letters', s.letters, `Hand event letters to ${lettersTo()}`, 'On — when both are idle in the same town', 'Off — this party keeps its letters.'), 'Shared setting of all parties (Storage page); this switch only takes this party in or out.');
    const body = `
      ${item(sw('storage.party.auto', e.auto, 'Store items in a warehouse by themselves', e.src === 'all' ? 'On — the setting for all parties' : 'On — this party', e.src === 'all' ? 'Off — nothing happens until you switch it on (the setting for all parties).' : OFF),
        'When the trigger below is met and a character is idle in its town, it puts items into the warehouse. Never in raids, quests, fights or while your order runs.', reset)}
      <div class="ps-grid">
        ${sel('storage.party.dest', s.party.dest, [['', `Like all parties (${destTxt(b.dest)})`]].concat(DESTS), 'Which warehouse')}
        ${sel('storage.party.mode', s.party.mode, [['', `Like all parties (${(MODES.find(x => x[0] === b.mode) || ['', b.mode])[1]})`]].concat(MODES), 'What it stores')}
        ${sel('storage.party.kind', s.party.kind, [['', `Like all parties (${(TRIGS.find(x => x[0] === b.kind) || ['', b.kind])[1]})`]].concat(TRIGS), 'When')}
        ${trigNum}
        ${sel('storage.party.town', s.party.town, [['', `Like all parties (${b.town})`]].concat(towns.map(t => [t, t])), 'Town')}
      </div>
      ${note('Clan warehouse: only clan members put items in, and only the clan leader can take them out. Others use their own warehouse.', 'info')}
      <details class="ps-more"><summary>Per character</summary>${mrows}</details>
      ${letters}
      <div class="ps-acts">${link('#/storage', 'Storage page (item rules, plans)')}</div>
      ${adv(note('File: Scripts/data/stash_rules.json — parties.' + E(PS.leader) + ', chars.<member> (dest / mode / auto; item rules kept), letters.except.'))}`;
    return section('storage', '📦', 'Storage', e.auto ? `Stores by itself (${destTxt(e.dest).toLowerCase()})` : 'Off', body, { dirty: dirtySecs().includes('storage') });
  }

  function secClan() {
    if (!PS.W.clan) return '';
    const c = PS.D.clan, mem = inClan(), F = obj(c.flags), name = c.clan || 'the clan';
    const flags = mem.length ? `<div class="ps-sub"><b>Clan-wide switches</b> <span class="ps-shared">read-only here — change them on the Clan page</span></div>
      <div class="ps-flags">${CLAN_FLAGS.map(([k, t]) => `<span class="ps-flag"><span class="uk-chip k-${F[k] ? 'ok' : 'off'}">${F[k] ? 'On' : 'Off'}</span> ${E(t)}</span>`).join('')}</div>` : '';
    const body = `
      ${note(mem.length ? `${mem.length} of ${PS.M.length} in ${E(name)}: ${mem.map(E).join(', ')}.` : `Nobody of this party is in ${E(name)} yet.`)}
      ${item(sw('clan.invite', PS.W.clan.invite, 'Invite this party into the clan', `On — ${c.leader || 'the clan leader'} invites them when they stand next to him`, 'Off — nobody of this party is invited.'), 'Ticks every member, now and later ones.')}
      ${flags}
      <div class="ps-acts">${link('#/clan', 'Clan page')}</div>
      ${adv(note('File: Scripts/data/clan_quests.json — clan.inviteParties (this switch); clan.auto + Logs/clan_auto.json (clan-wide).'))}`;
    return section('clan', '🏰', 'Clan', PS.W.clan.invite ? 'Invited into the clan' : mem.length ? `${mem.length} in the clan` : 'Not in the clan', body, { dirty: dirtySecs().includes('clan') });
  }

  function secDaily() {
    const parts = [];
    if (PS.W.daily) {
      const known = (PS.D.daily.leaders || []).includes(PS.leader);
      parts.push(item(sw('daily.kamaloka', PS.W.daily.kamaloka, 'Daily Kamaloka', 'On — once a day, a Kamaloka the whole party fits', OFF, { disabled: !known }),
        known ? 'The leader takes the party into a fitting Kamaloka once a day, then goes back to what it did.' : 'This party is not known to the Kamaloka daily yet.'));
    } else parts.push(unavailable('daily'));
    if (PS.W.ss) {
      const pi = (PS.D.ss.parties || []).find(p => p.leader === PS.leader), solo = pi ? (pi.members || []).filter(m => m.via === 'char').map(m => m.name) : [];
      parts.push(item(sw('ss.enrolled', PS.W.ss.enrolled, 'Seven Signs: sign up with Dawn by themselves', 'On — every member signs up with the Priest of Dawn (free)', OFF),
        'Needed for catacombs and necropolises. ' + (solo.length ? `Signed up on their own: ${solo.map(E).join(', ')}.` : '')));
    } else parts.push(unavailable('ss'));
    const on = [PS.W.daily && PS.W.daily.kamaloka && 'Kamaloka', PS.W.ss && PS.W.ss.enrolled && 'Seven Signs'].filter(Boolean);
    const body = parts.join('') + `<div class="ps-acts">${link('#/kamaloka', 'Kamaloka page')}${link('#/sevensigns', '7 Signs page')}</div>` +
      adv(note('Files: Logs/daily_enabled.json (' + E(PS.leader) + '.kamaloka), Scripts/data/seven_signs.json (parties).'));
    return section('daily', '📅', 'Daily', on.length ? on.join(' + ') : 'Off', body, { dirty: dirtySecs().some(s => s === 'daily' || s === 'ss') });
  }

  function secFight() {
    let spot = '';
    try { if (typeof spotLabel === 'function' && typeof PSPOT !== 'undefined' && PSPOT && PSPOT.data) spot = spotLabel((PSPOT.data.spots || {})[PS.leader]); } catch (e) { }
    let body = `<div class="ps-row ps-spot"><span><b>Hunting place:</b> ${E(spot || 'Auto (the leader picks one for the party\'s level)')}</span><button type="button" class="uk-btn secondary" data-psact="spot">Choose hunting place…</button></div>`;
    let sum = spot || 'Auto hunting place';
    if (PS.W.tactics) {
      const t = PS.W.tactics;
      sum = `Groups: ${({ off: 'off', auto: 'auto', on: 'on' })[t.mode] || 'off'} · ${sum}`;
      body += `${seg('tactics.mode', t.mode, [['off', 'Off'], ['auto', 'Auto'], ['on', 'On']], 'Split into hunting groups')}
        <div class="ps-what">${t.mode === 'off' ? 'Off — everyone fights the leader\'s monster (focus fire).' : t.mode === 'auto' ? 'Auto — groups only when the party is strong enough, back to focus fire when it gets dangerous.' : 'On — damage dealers hunt in groups of ' + E(t.pairSize) + ', healers keep healing everyone.'}</div>
        <details class="ps-more"><summary>Group details</summary><div class="ps-grid">
          ${sel('tactics.pairSize', t.pairSize, [[1, '1 (solo dealers)'], [2, '2 (pairs)'], [3, '3 (trios)']], 'Group size')}
          ${sel('tactics.maxPairs', t.maxPairs, [1, 2, 3, 4, 5, 6].map(n => [n, String(n)]), 'Most groups')}
          ${sel('tactics.leash', t.leash, [[600, '600'], [750, '750'], [900, '900 (default)'], [1100, '1100'], [1300, '1300']], 'Distance from the leader')}
          ${sel('tactics.zoneScale', t.zoneScale, [[1, '×1.0'], [1.25, '×1.25'], [1.5, '×1.5'], [1.75, '×1.75'], [2, '×2.0']], 'Hunting area size')}
          ${inp('tactics.minDealers', String(t.minDealers), 'Auto: at least … dealers', { small: true })}
          ${inp('tactics.levelMargin', String(t.levelMargin), 'Auto: monsters at most … levels above', { small: true, mode: 'text' })}
          ${inp('tactics.fallbackHp', String(t.fallbackHp), 'Back to focus fire below HP %', { small: true })}
          <label class="ps-chk"><input type="checkbox" data-pschk="tactics.includeBuffers"${t.includeBuffers ? ' checked' : ''}> The Doomcryer joins a group</label>
        </div></details>`;
    } else body += unavailable('tactics');
    body += adv(note('File: Scripts/data/party_tactics.json — ' + E(PS.leader) + ' (hunting pairs, leveling only). Hunting place: Scripts/data/party_spots.json.'));
    return section('fight', '⚔', 'Fighting', sum, body, { dirty: dirtySecs().includes('tactics') });
  }

  function secRoutes() {
    if (!ok(PS.D.routes)) return section('routes', '🧭', 'Routes', 'not available', unavailable('routes'));
    if (!PS.W.routes) return section('routes', '🧭', 'Routes', 'not set up for this party', note('This party is not in swarm.config.json, so it has no route rules yet.'));
    const rules = PS.D.routes.rules || [], own = PS.W.routes;
    const eff = (k) => (own[k] === null ? routeDefault(k) : own[k]);
    const nOn = rules.filter(r => eff(r.key)).length, nOwn = rules.filter(r => own[r.key] !== null).length;
    const body = note('What the bots may do on long computed routes (raids, trips to an NPC or a hunting area).') + rules.map(r => {
      const e = eff(r.key), d = routeDefault(r.key);
      return item(sw('routes.' + r.key, e, r.label, own[r.key] === null ? 'On (default)' : 'On', own[r.key] === null ? 'Off (default)' : 'Off — a route that needs it is not used.'),
        E(String(r.help || '').replace(/\s*\(skill \d+[^)]*\)/g, '')), own[r.key] !== null ? `<button type="button" class="uk-btn ghost ps-reset" data-psreset="routes.${E(r.key)}">Back to the default (${d ? 'on' : 'off'})</button>` : '');
    }).join('') + adv(note('File: Scripts/data/route_rules.json — parties.' + E(PS.leader) + ' (only the rules you changed; the rest use the defaults).'));
    return section('routes', '🧭', 'Routes', `${nOn} of ${rules.length} allowed${nOwn ? ` · ${nOwn} changed` : ' · defaults'}`, body, { dirty: dirtySecs().includes('routes') });
  }

  // ============================================================================================ frame
  function frame() {
    let ov = document.getElementById('psOv'); if (ov) return ov;
    ov = document.createElement('div'); ov.id = 'psOv'; ov.className = 'ps-ov'; ov.hidden = true;
    ov.innerHTML = `<div class="ps-dlg" role="dialog" aria-modal="true" aria-labelledby="psTitle">
      <div class="ps-head"><h2 id="psTitle">Party settings</h2><button type="button" class="ps-x" data-psact="close" aria-label="Close">✕</button></div>
      <div class="ps-scroll" id="psScroll"><div class="ps-intro" id="psIntro"></div><div id="psBody"></div></div>
      <div class="ps-bar" id="psBar"></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', onClick);
    ov.addEventListener('change', onChange);
    ov.addEventListener('input', onInput);
    ov.addEventListener('toggle', (e) => { const d = e.target; if (d && d.dataset && d.dataset.pssec) { if (d.open) PS.openSecs.add(d.dataset.pssec); else PS.openSecs.delete(d.dataset.pssec); } }, true);
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    document.addEventListener('runswitch', () => { if (PS.open) fetchSrc('run').then(d => { PS.D.run = d; render(true); }); });
    return ov;
  }
  function render(keepScroll) {
    const ov = frame(), sc = document.getElementById('psScroll'), top = sc ? sc.scrollTop : 0;
    document.getElementById('psTitle').textContent = `Party ${PS.leader} — settings`;
    if (!PS.W) {
      document.getElementById('psIntro').innerHTML = 'Loading the settings…';
      document.getElementById('psBody').innerHTML = ['Start / Stop', 'Fighting', 'Money', 'Supplies', 'Gear', 'Storage', 'Daily', 'Routes'].map(t => `<div class="ps-sec ps-skel"><div class="ps-st"><b>${t}</b><span class="ps-sum">…</span></div></div>`).join('');
      renderBar(); return;
    }
    const names = PS.M.map(n => { const m = memberInfo(n); return `${E(n)}${m.level ? ` <small>${E(m.level)}</small>` : ''}`; }).join(', ');
    document.getElementById('psIntro').innerHTML = `<div class="ps-who">${names}</div><div class="ps-what">Everything this party may do by itself, in one place. Switch on only what you want — the rest stays off. Changes are saved with <b>Save</b> below.</div>`;
    document.getElementById('psBody').innerHTML = [secRun(), secFight(), secMoney(), secSupplies(), secGear(), secStorage(), secClan(), secDaily(), secRoutes()].join('');
    renderBar();
    if (keepScroll && sc) sc.scrollTop = top;
  }
  function renderBar() {
    const el = document.getElementById('psBar'); if (!el) return;
    const ds = dirtySecs(), nb = Object.keys(PS.bad).length;
    const sum = !PS.W ? 'Loading…' : nb ? `<span class="bad">${nb} field${nb === 1 ? '' : 's'} not valid</span>` : ds.length ? `<b>Unsaved changes</b> <span class="ps-muted">(${ds.map(s => SEC_NAME[s] || s).join(', ')})</span>` : 'All saved';
    el.innerHTML = `<div class="ps-bsum" role="status">${sum}</div><div class="ps-bbtn"><button type="button" class="uk-btn secondary" data-psact="undo"${ds.length && !PS.busy ? '' : ' disabled'}>Undo</button><button type="button" class="uk-btn primary" data-psact="save"${ds.length && !nb && !PS.busy ? '' : ' disabled'}>${PS.busy ? 'Saving…' : 'Save'}</button></div>`;
    document.querySelectorAll('#psBody details.ps-sec').forEach(d => { const k = d.dataset.pssec, dot = d.querySelector('summary .ps-dot'); const dirty = ds.includes(k === 'fight' ? 'tactics' : k) || (k === 'daily' && ds.includes('ss')); if (dirty && !dot) { const b = d.querySelector('summary .ps-st b'); if (b) b.insertAdjacentHTML('beforeend', ' <span class="ps-dot" title="unsaved changes">●</span>'); } else if (!dirty && dot) dot.remove(); });
  }

  // ============================================================================================ events
  function validate(path, raw) {
    delete PS.bad[path];
    if (/^money\.(lt|mt|keep|chars\.)/.test(path)) { const n = amt(raw); if (Number.isNaN(n)) PS.bad[path] = 'a number, e.g. 8m, 300k or 8,000,000'; return; }
    if (/^storage\.party\.(above|weightPct|gapMin)$/.test(path)) { if (raw === '') return; const n = Number(raw), lim = { above: [1, 500], weightPct: [1, 100], gapMin: [0, 1440] }[path.split('.').pop()]; if (!Number.isFinite(n) || n < lim[0] || n > lim[1]) PS.bad[path] = `${lim[0]} to ${lim[1]}`; return; }
    if (/^tactics\.(minDealers|levelMargin|fallbackHp)$/.test(path)) { const n = Number(raw), lim = { minDealers: [1, 9], levelMargin: [-5, 10], fallbackHp: [5, 90] }[path.split('.').pop()]; if (raw === '' || !Number.isFinite(n) || n < lim[0] || n > lim[1]) PS.bad[path] = `${lim[0]} to ${lim[1]}`; }
  }
  function onInput(e) {
    const t = e.target; if (!t.dataset || !t.dataset.psin) return;
    const p = t.dataset.psin; validate(p, t.value.trim());
    setP(p, /^tactics\./.test(p) ? (PS.bad[p] ? t.value.trim() : Number(t.value.trim())) : t.value.trim());
    t.toggleAttribute('aria-invalid', !!PS.bad[p]);
    renderBar();
  }
  function onChange(e) {
    const t = e.target; if (!t.dataset) return;
    if (t.dataset.psin) { const p = t.dataset.psin; validate(p, t.value.trim()); if (/^money\./.test(p) && !PS.bad[p] && t.value.trim()) { const n = amt(t.value); if (n != null && !Number.isNaN(n)) { t.value = fmtN(n); setP(p, t.value); } } t.toggleAttribute('aria-invalid', !!PS.bad[p]); renderBar(); return; }   // no re-render: the next field keeps the focus
    if (t.dataset.pssel) {
      const p = t.dataset.pssel; let v = t.value;
      if (t.dataset.kind === 'tri') v = v === '' ? null : v === 'on';
      else if (/^tactics\./.test(p)) v = Number(v);
      setP(p, v); render(true); return;
    }
    if (t.dataset.pschk) { setP(t.dataset.pschk, !!t.checked); render(true); }
  }
  async function onClick(e) {
    const t = e.target;
    if (t === document.getElementById('psOv')) { close(); return; }   // the backdrop
    const s = t.closest('[data-psw]');
    if (s && !s.disabled) { e.preventDefault(); setP(s.dataset.psw, s.dataset.eff !== '1'); render(true); return; }
    const g = t.closest('[data-psseg]');
    if (g) { e.preventDefault(); let v = g.dataset.v; setP(g.dataset.psseg, v); render(true); return; }
    const r = t.closest('[data-psreset]');
    if (r) { e.preventDefault(); setP(r.dataset.psreset, null); render(true); return; }
    const gp = t.closest('[data-psgiverp]');
    if (gp) { e.preventDefault(); const n = gp.dataset.psgiverp, L = PS.W.money.pglist; const i = L.indexOf(n); if (i >= 0) L.splice(i, 1); else L.push(n); render(true); return; }
    const gv = t.closest('[data-psgiver]');
    if (gv) { e.preventDefault(); const n = gv.dataset.psgiver, L = PS.W.money.glist; const i = L.indexOf(n); if (i >= 0) L.splice(i, 1); else L.push(n); render(true); return; }
    const go = t.closest('[data-psgo]');
    if (go) { e.preventDefault(); if (await close()) { try { if (typeof window.go === 'function') window.go(go.dataset.psgo); else location.hash = go.dataset.psgo; } catch (x) { location.hash = go.dataset.psgo; } } return; }
    const a = t.closest('[data-psact]');
    if (!a) return;
    e.preventDefault();
    const act = a.dataset.psact;
    if (act === 'close') { close(); return; }
    if (act === 'undo') { if (await uiConfirm({ title: 'Undo your changes?', body: 'Throw away every change in this window since it was opened or last saved.', confirmText: 'Undo changes', cancelText: 'Keep editing' })) { PS.W = clone(PS.W0); PS.bad = {}; render(true); } return; }
    if (act === 'save') { save(); return; }
    if (act === 'spot') { const L = PS.leader; if (await close() && typeof openSpotPicker === 'function') openSpotPicker(L); return; }
  }

  // ============================================================================================ open / close
  async function open(leader) {
    if (!leader) return;
    if (PS.open && PS.leader !== leader && dirtySecs().length && !(await uiConfirm({ title: 'Throw away your changes?', body: `Party ${PS.leader} has unsaved changes.`, confirmText: 'Throw away', cancelText: 'Keep editing' }))) return;
    PS.opener = document.activeElement;
    const ov = frame(); PS.open = true; PS.leader = leader; PS.W = null; PS.W0 = null; PS.D = {}; PS.bad = {}; PS.M = [leader];
    if (!PS.openSecs.size) PS.openSecs.add('run');
    ov.hidden = false; document.documentElement.classList.add('ps-lock');
    render();
    try { ov.querySelector('.ps-x').focus(); } catch (e) { }
    await load(leader);
  }
  /** -> true when closed (asks first when something is not saved) */
  async function close() {
    if (!PS.open) return true;
    if (dirtySecs().length && !(await uiConfirm({ title: 'Close without saving?', body: [uiP(`Party ${PS.leader} has unsaved changes:`), uiList(dirtySecs().map(s => SEC_NAME[s] || s))], confirmText: 'Close without saving', cancelText: 'Keep editing' }))) return false;
    PS.open = false; PS.gen++;
    const ov = document.getElementById('psOv'); if (ov) ov.hidden = true;
    document.documentElement.classList.remove('ps-lock');
    try { if (PS.opener && PS.opener.focus) PS.opener.focus(); } catch (e) { }
    return true;
  }

  // ============================================================================================ save
  /** plain sentences of what changes (the confirm dialog) */
  function changeList() {
    const out = [], W = PS.W, W0 = PS.W0, onoff = (v) => (v ? 'on' : 'off');
    if (W.money && J(W.money) !== J(W0.money)) {
      const a = W0.money, b = W.money;
      if (a.on !== b.on) out.push(`Adena hand-outs between parties (ALL parties): ${onoff(b.on)}`);
      if (a.receive !== b.receive) out.push(`Party ${PS.leader} receives adena: ${onoff(b.receive !== false)}`);
      if (a.lt !== b.lt) out.push(`Leader top-up: ${b.lt || 'the default'}`);
      if (a.mt !== b.mt) out.push(`Member top-up: ${b.mt || 'the default'}`);
      if (a.pg !== b.pg || J(a.pglist) !== J(b.pglist)) out.push(`Who gives to party ${PS.leader}: ${b.pg === 'all' ? 'like all parties' : giversText(b.pg, b.pglist)}`);
      if (a.gmode !== b.gmode || J(a.glist) !== J(b.glist)) out.push(`Who gives (ALL parties): ${b.gmode === 'auto' ? 'any rich party leader' : b.gmode === 'none' ? 'nobody' : (b.glist.join(', ') || 'nobody chosen yet')}`);
      if (a.keep !== b.keep) out.push(`A giver keeps at least (ALL parties): ${b.keep || 'the default'}`);
      PS.M.forEach(n => { if (a.chars[n] !== b.chars[n]) out.push(`${n}: own top-up ${b.chars[n] === '' ? 'removed (party amount)' : b.chars[n]}`); });
    }
    if (W.supplies && J(W.supplies) !== J(W0.supplies)) {
      paKinds().forEach(k => { const a = W0.supplies.party[k.key], b = W.supplies.party[k.key]; if (a !== b) out.push(`${k.label} (party ${PS.leader}): ${b === null ? 'the all-parties setting (' + (paDef(k.key) ? 'on' : 'off') + ')' : onoff(b)}`); });
      PS.M.forEach(n => paKinds().filter(k => k.char).forEach(k => { const a = (W0.supplies.chars[n] || {})[k.key], b = (W.supplies.chars[n] || {})[k.key]; if (a !== b) out.push(`${n}: ${k.key === 'sell' ? 'selling' : 'symbols'} ${b === null || b === undefined ? 'like the party' : onoff(b)}`); }));
    }
    if (W.gear && J(W.gear) !== J(W0.gear)) {
      if (W.gear.party !== W0.gear.party) out.push(`Gear upgrades for party ${PS.leader}: ${W.gear.party === null ? 'the all-parties setting' : onoff(W.gear.party)}`);
      PS.M.forEach(n => { const a = W0.gear.members[n], b = W.gear.members[n]; if (J(a) !== J(b)) out.push(`${n}: gear upgrades ${b.auto === null ? 'like the party' : onoff(b.auto)}${b.lock ? ', gear locked' : ''}`); });
    }
    if (W.storage && J(W.storage) !== J(W0.storage)) {
      const a = W0.storage, b = W.storage;
      if (J(a.party) !== J(b.party)) out.push(`Storage for party ${PS.leader}: ${b.party.auto === null ? 'automatic like all parties' : 'automatic ' + onoff(b.party.auto)}${b.party.dest ? ', warehouse ' + b.party.dest : ''}${b.party.mode ? ', what: ' + b.party.mode : ''}${b.party.kind ? ', when: ' + b.party.kind : ''}`);
      PS.M.forEach(n => { if (J(a.members[n]) !== J(b.members[n])) out.push(`${n}: storage ${['auto', 'dest', 'mode'].map(k => b.members[n][k] || '').filter(Boolean).join(', ') || 'like the party'}`); });
      if (a.letters !== b.letters) out.push(`Event letters of party ${PS.leader}: ${b.letters ? 'handed in' : 'kept'}`);
    }
    if (W.tactics && J(W.tactics) !== J(W0.tactics)) out.push(`Hunting groups: ${W.tactics.mode}${W.tactics.mode !== 'off' ? ` (groups of ${W.tactics.pairSize}, at most ${W.tactics.maxPairs})` : ''}`);
    if (W.routes && J(W.routes) !== J(W0.routes)) (PS.D.routes.rules || []).forEach(r => { if (W.routes[r.key] !== W0.routes[r.key]) out.push(`Route rule "${r.label}": ${W.routes[r.key] === null ? 'back to the default' : onoff(W.routes[r.key])}`); });
    if (W.daily && W.daily.kamaloka !== W0.daily.kamaloka) out.push(`Daily Kamaloka: ${onoff(W.daily.kamaloka)}`);
    if (W.ss && W.ss.enrolled !== W0.ss.enrolled) out.push(`Seven Signs sign-up: ${onoff(W.ss.enrolled)}`);
    if (W.clan && W.clan.invite !== W0.clan.invite) out.push(`Invite party ${PS.leader} into the clan: ${onoff(W.clan.invite)}`);
    return out;
  }
  const num = (s, d) => { const n = amt(s); return n == null || Number.isNaN(n) ? d : n; };
  /** the writers: fresh = the source read again just before saving; each returns { ok, error? } */
  const WRITE = {
    async money(fresh) {
      const r = clone(obj(fresh.rules)), b = PS.W.money, a = PS.W0.money, L = PS.leader;
      // a missing / new file: the values swarm.js uses when a key is missing (fundRules), so the API's checks pass
      const FD = { town: 'Giran', everyMin: 30, minGive: 200000, slack: 500000, brokeBelow: 500000 }; Object.keys(FD).forEach(k => { if (r[k] === undefined || r[k] === null || r[k] === '') r[k] = FD[k]; });
      if (r.on === undefined) r.on = true;
      r.defaults = Object.assign({ leaderTarget: 8000000, memberTarget: 3000000, clanLeaderTarget: 12000000 }, obj(r.defaults));
      if (!r.givers) r.givers = { mode: 'auto', list: [], keepAtLeast: 30000000 };
      if (a.on !== b.on) r.on = b.on;
      if (a.gmode !== b.gmode || J(a.glist) !== J(b.glist) || a.keep !== b.keep) { const g = Object.assign({}, obj(r.givers)); g.mode = b.gmode; g.list = b.glist.slice(); const k = num(b.keep, null); if (k == null) delete g.keepAtLeast; else g.keepAtLeast = k; if (g.keepAtLeast === undefined) g.keepAtLeast = fundDefaults().keep; r.givers = g; }
      if (a.receive !== b.receive || a.lt !== b.lt || a.mt !== b.mt || a.pg !== b.pg || J(a.pglist) !== J(b.pglist)) {
        r.parties = Object.assign({}, obj(r.parties)); const p = { receive: b.receive !== false }; const lt = num(b.lt, null), mt = num(b.mt, null);
        if (lt != null) p.leaderTarget = lt; if (mt != null) p.memberTarget = mt;
        if (b.pg !== 'all') p.givers = { mode: b.pg, list: b.pg === 'list' ? b.pglist.slice() : [] };   // FUNDGIVERS: 'all' = no own entry (the shared givers)
        r.parties[L] = p;
      }
      r.chars = Object.assign({}, obj(r.chars));
      PS.M.forEach(n => { if (a.chars[n] === b.chars[n]) return; const v = num(b.chars[n], null); if (v == null) delete r.chars[n]; else r.chars[n] = { target: v }; });
      const d = await call(SRC.fund, { method: 'POST', body: JSON.stringify({ rules: r, rev: fresh.rev, by: 'party settings' }) });
      return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || 'no answer', conflict: !!(d && d.conflict) };
    },
    async supplies(fresh) {   // PARTYAUTO 2026-10-13: only this party's entry + its members' own switches (null = removed)
      const a = PS.W0.supplies, b = PS.W.supplies, values = {}, chars = {};
      paKinds().forEach(k => { if (a.party[k.key] !== b.party[k.key]) values[k.key] = b.party[k.key]; });
      PS.M.forEach(n => paKinds().filter(k => k.char).forEach(k => { const x = (a.chars[n] || {})[k.key], y = (b.chars[n] || {})[k.key]; if (x !== y) (chars[n] = chars[n] || {})[k.key] = y === undefined ? null : y; }));
      const d = await call(SRC.pauto, { method: 'POST', body: JSON.stringify({ party: PS.leader, values, chars, rev: fresh.rev, by: 'party settings' }) });
      return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || 'no answer', conflict: !!(d && d.conflict) };
    },
    async gear() {
      const b = PS.W.gear, a = PS.W0.gear, L = PS.leader, errs = [];
      const post = async (body) => { const d = await call(SRC.gear, { method: 'POST', body: JSON.stringify(Object.assign({ action: 'set', confirm: body.auto === true }, body)) }); if (!d || d.error || !d.ok) errs.push((d && d.error) || 'no answer'); };
      if (a.party !== b.party) await post({ scope: 'party', name: L, auto: b.party });
      for (const n of PS.M) { const x = a.members[n] || {}, y = b.members[n] || {}; if (J(x) !== J(y)) await post({ scope: 'char', name: n, auto: y.auto, lock: !!y.lock }); }
      return errs.length ? { ok: false, error: errs.join('; ') } : { ok: true };
    },
    async storage(fresh) {
      const r = clone(obj(fresh.rules)), b = PS.W.storage, a = PS.W0.storage, L = PS.leader;
      if (J(a.party) !== J(b.party)) {
        r.parties = Object.assign({}, obj(r.parties)); const P = Object.assign({}, obj(r.parties[L]));
        if (b.party.auto === null) delete P.auto; else P.auto = b.party.auto;
        ['dest', 'mode', 'town'].forEach(k => { if (b.party[k]) P[k] = b.party[k]; else delete P[k]; });
        const T = {}; if (b.party.kind) T.kind = b.party.kind; ['above', 'weightPct', 'gapMin'].forEach(k => { if (b.party[k] !== '') T[k] = Number(b.party[k]); });
        if (Object.keys(T).length) P.trigger = T; else delete P.trigger;
        if (Object.keys(P).length) r.parties[L] = P; else delete r.parties[L];
      }
      r.chars = Object.assign({}, obj(r.chars));
      PS.M.forEach(n => {
        const x = a.members[n], y = b.members[n]; if (J(x) === J(y)) return;
        const C = Object.assign({}, obj(r.chars[n]));
        if (y.auto === '') delete C.auto; else C.auto = y.auto === 'on';
        ['dest', 'mode'].forEach(k => { if (y[k]) C[k] = y[k]; else delete C[k]; });
        if (Object.keys(C).length) r.chars[n] = C; else delete r.chars[n];
      });
      if (a.letters !== b.letters && r.letters && typeof r.letters === 'object') {
        const ex = new Set((r.letters.except || []).map(String)); PS.M.forEach(n => { if (b.letters) ex.delete(n); else ex.add(n); });
        r.letters = Object.assign({}, r.letters, { except: [...ex].sort() });
      }
      const d = await call(SRC.storage, { method: 'POST', body: JSON.stringify({ rules: r, rev: fresh.rev, by: 'party settings' }) });
      return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || 'no answer', conflict: !!(d && d.conflict) };
    },
    async tactics() {
      const d = await call(SRC.tactics, { method: 'POST', body: JSON.stringify(Object.assign({ party: PS.leader }, PS.W.tactics)) });
      return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || 'no answer' };
    },
    async routes() {
      const errs = [];
      for (const k of Object.keys(PS.W.routes)) { if (PS.W.routes[k] === PS.W0.routes[k]) continue; const d = await call(SRC.routes, { method: 'POST', body: JSON.stringify({ party: PS.leader, key: k, value: PS.W.routes[k] }) }); if (!d || d.error) errs.push(`${k}: ${(d && d.error) || 'no answer'}`); }
      return errs.length ? { ok: false, error: errs.join('; ') } : { ok: true };
    },
    async daily() {
      const d = await call(SRC.daily, { method: 'POST', body: JSON.stringify({ leader: PS.leader, kind: 'kamaloka', on: !!PS.W.daily.kamaloka }) });
      return d && !d.error && d.enabled ? { ok: true } : { ok: false, error: (d && d.error) || 'no answer' };
    },
    async ss(fresh) {
      const cfg = clone(obj(fresh.cfg)), L = PS.leader; cfg.parties = (cfg.parties || []).filter(x => lc(x) !== lc(L)); if (PS.W.ss.enrolled) cfg.parties.push(L);
      const d = await call(SRC.ss, { method: 'POST', body: JSON.stringify({ cfg, rev: fresh.rev, by: 'party settings' }) });
      return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || 'no answer', conflict: !!(d && d.conflict) };
    },
    async clan() {
      const d = await call(SRC.clan, { method: 'POST', body: JSON.stringify({ action: 'inviteParty', leader: PS.leader, on: !!PS.W.clan.invite }) });
      return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || 'no answer' };
    },
  };
  async function save(force) {
    if (PS.busy || !PS.W) return;
    const ds = dirtySecs(); if (!ds.length) return;
    if (Object.keys(PS.bad).length) { await uiAlert({ title: 'Some fields are not valid', kind: 'error', body: 'Fix the fields marked in red first.' }); return; }
    const ch = changeList();
    const turnsOn = (PS.W.gear && PS.W.gear.party === true && PS.W0.gear.party !== true) || (PS.W.gear && PS.M.some(n => PS.W.gear.members[n] && PS.W.gear.members[n].auto === true && !(PS.W0.gear.members[n] && PS.W0.gear.members[n].auto === true)));
    if (!force && !(await uiConfirm({ title: `Save the settings of party ${PS.leader}?`, body: [uiP(`${ch.length} change${ch.length === 1 ? '' : 's'}:`), uiList(ch.slice(0, 40)),
      turnsOn ? uiWarn('Gear upgrades switched on: the characters spend adena on gear by themselves during supply runs.') : '',
      ch.some(c => /ALL parties/.test(c)) ? uiNote('Lines marked "ALL parties" change a shared setting.') : '',
      runOn() ? uiNote('The bots pick it up within a minute.') : uiNote('The party is stopped: the switches work once you press Start.')], confirmText: 'Save', cancelText: 'Cancel' }))) return;
    PS.busy = true; renderBar();
    try {
      // conflict check (like the Storage page): read every changed source again and compare this party's part with what the popup loaded
      const srcs = [...new Set(ds.map(s => SEC_SRC[s]))], fresh = await fetchAll(srcs), conflicts = [];
      ds.forEach(s => { const f = fresh[SEC_SRC[s]]; if (!ok(f)) return; try { if (J(SLICE[s](f, PS.leader, PS.M)) !== PS.S0[s]) conflicts.push(SEC_NAME[s] || s); } catch (e) { } });
      if (conflicts.length && !force) {
        PS.busy = false; renderBar();
        const c = await uiChoice({ title: 'Changed meanwhile', body: [uiWarn('Someone else changed these settings of this party after the window was opened:'), uiList(conflicts), uiP('Overwrite them with your version, or reload to see theirs (your changes are lost)?')],
          buttons: [{ label: 'Overwrite', value: 'over', danger: true }, { label: 'Reload', value: 'reload', primary: true }] });
        if (c === 'over') return await save(true);
        if (c === 'reload') { await load(PS.leader, true); }
        return;
      }
      const res = [];
      for (const s of ds) {
        let r; const f = fresh[SEC_SRC[s]];
        if (!ok(f)) r = { ok: false, error: (f && f.__err) || 'not available' };
        else { try { r = await WRITE[s](f); } catch (e) { r = { ok: false, error: e.message }; } }
        res.push(Object.assign({ sec: s }, r));
      }
      const bad = res.filter(r => !r.ok), keep = {}; bad.forEach(r => { keep[r.sec] = clone(PS.W[r.sec]); });
      PS.busy = false;
      await load(PS.leader, true);
      Object.keys(keep).forEach(s => { if (PS.W && s in PS.W) PS.W[s] = keep[s]; }); if (bad.length) render(true);   // the failed edits stay on screen (unsaved)
      if (bad.length) {
        // keep the failed edits on screen: re-apply them onto the fresh model
        await uiAlert({ title: bad.length === res.length ? 'Not saved' : 'Partly saved', kind: 'error', body: [res.filter(r => r.ok).length ? uiP('Saved: ' + res.filter(r => r.ok).map(r => SEC_NAME[r.sec] || r.sec).join(', ')) : '',
          uiP('Not saved:'), uiList(bad.map(r => `${SEC_NAME[r.sec] || r.sec}: ${r.error}${r.conflict ? ' (changed meanwhile — try again)' : ''}`))] });
      } else if (window.UIKit && UIKit.toast) UIKit.toast(`Party ${PS.leader}: settings saved`, { kind: 'ok' });
      try { if (typeof refresh === 'function') refresh(); } catch (e) { }
    } finally { PS.busy = false; renderBar(); }
  }

  // ============================================================================================ public
  function button(leader, small) {
    return `<button type="button" class="psbtn${small ? ' sm' : ''}" data-psopen="${E(leader)}" title="Everything party ${E(leader)} may do by itself: money, supplies, gear, storage, clan, daily, fighting, routes">⚙ ${small ? 'Party settings' : 'Settings'}</button>`;
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-psopen]'); if (!b) return; e.preventDefault(); e.stopPropagation(); open(b.dataset.psopen); }, true);
  window.PartySettings = { button, open, close, _state: PS, _amt: amt };
})();
