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
//   Healing   /api/healschemes (read; "Edit" opens Dashboard/healschemes.js, its own sheet + Save — 2026-10-13 HEAL SCHEMES)
//   Supplies  /api/partyauto  (party_auto.json: parties.<leader>.supplyWatch / sell / dyes, chars.<member>.sell / dyes)  POST { party, values, chars, rev }
//   Combat    /api/partyauto  (HIVESW-2026-10-15: parties.<leader>.skills / heals / potions, chars.<member>.same; missing = ON) — "Hive picks my skills",
//             "Hive heals", "Hive uses potions"; OFF = the player's own L2Swarm profile fights / heals (its Combat Skills / Auto Skills tabs)
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
    daily: '/api/daily', ss: '/api/sevensigns', clan: '/api/clanauto', run: '/api/runstate', pauto: '/api/partyauto', res: '/api/resrules', loot: '/api/lootrules' };   // RESURRECTION 2026-10-13: + res; LOOT RULES 2026-10-13: + loot
  /** which source each editable section needs */
  const SEC_SRC = { res: 'res', money: 'fund', supplies: 'pauto', combat: 'pauto', gear: 'gear', storage: 'storage', loot: 'loot', tactics: 'tactics', routes: 'routes', daily: 'daily', ss: 'ss', clan: 'clan' };
  const SEC_NAME = { res: 'Resurrection', money: 'Money', supplies: 'Supplies', combat: 'Combat', gear: 'Gear', storage: 'Storage', loot: 'Loot', tactics: 'Fighting', routes: 'Routes', daily: 'Daily (Kamaloka)', ss: 'Daily (Seven Signs)', clan: 'Clan' };
  // PARTYAUTO 2026-10-13: the switches of the Supplies section (the same list as Dashboard/partyauto_api.js KINDS; the API's own list wins)
  const PA_KINDS = [
    { key: 'supplyWatch', char: false, label: 'Supply runs when someone runs low', help: 'The leader goes to Giran by himself when a character is low on escape / resurrection scrolls, shots, potions or arrows (or the bag is full), buys for everyone and hands it out.' },
    { key: 'sell', char: true, label: 'Sell junk on town visits', help: 'Items you marked "sell" are sold whenever a character idles in a town, and old gear + marked items are sold during supply runs (also the ones you order).' },
    { key: 'dyes', char: true, label: 'Draw symbols (dyes) in supply runs', help: 'During supply runs each character with a symbol plan buys the dyes and draws its next planned symbol at the Symbol Maker in Giran (also in the supply runs you order).' }];
  const PA_SHORT = { supplyWatch: 'supply runs', sell: 'selling', dyes: 'symbols' };
  // HIVESW-2026-10-15: the Combat section's switches (= partyauto_api.js KINDS group 'combat'; default ON when nothing is set)
  const CB_KINDS = [
    { key: 'skills', char: true, def: true, group: 'combat', label: 'Hive picks my skills', help: 'On: Hive chooses and casts attacks, area attacks, debuffs, buffs, songs / dances, toggles and the raid role skills. Off: Hive casts nothing by itself — your L2Swarm profile (Combat Skills tab) fights; Hive still walks, follows, resupplies and shows everything here.' },
    { key: 'heals', char: true, def: true, group: 'combat', label: 'Hive heals', help: 'On: Hive heals the party (heal choice, group heals, cures, Recharge, Chant of Life, self heals). Off: Hive heals nobody — your L2Swarm profile (Auto Skills tab) heals, and Hive gives back any of your Auto Skills it had switched off.' },
    { key: 'potions', char: true, def: true, group: 'combat', label: 'Hive uses potions', help: "On: Hive drinks Healing and Mana Potions when HP or MP run low. Off: no potions by Hive (use L2Swarm's own potion settings or the server's .autohp / .automp)." }];
  const CB_SHORT = { skills: 'skills', heals: 'heals', potions: 'potions' };
  const GMODES = ['auto', 'list', 'none'];
  const TACT_DEF = { mode: 'off', pairSize: 2, maxPairs: 3, leash: 900, zoneScale: 1, minDealers: 4, levelMargin: 2, fallbackHp: 40, includeBuffers: false, aoeMin: 3, raidAoe: 'primary' };
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
    money: (d, L, M) => { const r = obj(d.rules); return { on: r.on, givers: r.givers || null, party: obj(r.parties)[L] || null, chars: M.map(n => obj(r.chars)[n] || null), mk: r.memberKeep || null }; },
    supplies: (d, L, M) => { const D = obj(d.data); return { party: obj(D.parties)[L] || null, chars: M.map(n => obj(D.chars)[n] || null) }; },
    combat: (d, L, M) => { const D = obj(d.data), pick = (o) => { const x = obj(o), r = {}; ['skills', 'heals', 'potions'].forEach(k => { if (typeof x[k] === 'boolean') r[k] = x[k]; }); return r; }; return { party: pick(obj(D.parties)[L]), chars: M.map(n => pick(obj(D.chars)[n])), def: pick(D.default) }; },   // HIVESW
    res: (d, L) => obj(obj(d.data).parties)[L] || null,   // RESURRECTION 2026-10-13
    loot: (d, L) => obj(obj(d.data).parties)[L] || null,  // LOOT RULES 2026-10-13
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
      // PURSE 2026-10-13: Leader pays (parties.<leader>.purse) + the shared pocket money by level (memberKeep; missing = the bots' default table)
      const pu = p && p.purse && typeof p.purse === 'object' ? p.purse : {};
      W.money.purse = { on: pu.on === true, lk: isSet(pu.leaderKeep) ? fmtN(pu.leaderKeep) : '', mc: isSet(pu.memberCap) ? fmtN(pu.memberCap) : '', bu: isSet(pu.budget) ? fmtN(pu.budget) : '' };
      const mk = Array.isArray(r.memberKeep) && r.memberKeep.length ? r.memberKeep : (window.PurseCard ? PurseCard.KEEP_DEF : [[20, 5000], [40, 50000], [60, 150000], [999, 300000]]);
      W.money.mkLv = mk.map(x => Number(x[0])); W.money.mk = mk.map(x => fmtN(x[1]));
    }
    if (ok(D.pauto)) {   // PARTYAUTO 2026-10-13: null = no own setting (the setting for all parties / like the party)
      const d = obj(D.pauto.data), P = obj(obj(d.parties)[L]), bool = (v) => (typeof v === 'boolean' ? v : null), party = {}, chars = {};
      supKinds().forEach(k => { party[k.key] = bool(P[k.key]); });
      M.forEach(n => { const C = obj(obj(d.chars)[n]); chars[n] = {}; supKinds().filter(k => k.char).forEach(k => { chars[n][k.key] = bool(C[k.key]); }); });
      // SUPPLYAMT 2026-10-14: how much each character carries per level band (strings while typing; '' = the all-parties / built-in amount)
      const PA = obj(obj(obj(d.parties)[L]).amounts), amt = {};
      amtBands().forEach(b => { const r = obj(PA[String(b.start)]); amt[b.start] = {}; amtKeys().forEach(k => { amt[b.start][k.key] = isSet(r[k.key]) ? String(r[k.key]) : ''; }); });
      W.supplies = { party, chars, amt, allToo: false };
      W.supplies.pshop = pshopModel(d, L);   // PSHOP-2026-10-15: shots from player shops (strings while typing)
      // HIVESW-2026-10-15: Combat (null = no own setting: the all-parties setting / like the party)
      const cp = {}, cc = {};
      cbKinds().forEach(k => { cp[k.key] = bool(P[k.key]); });
      M.forEach(n => { const C = obj(obj(d.chars)[n]); cc[n] = {}; cbKinds().forEach(k => { cc[n][k.key] = bool(C[k.key]); }); });
      W.combat = { party: cp, chars: cc };
    }
    if (ok(D.res)) {   // RESURRECTION 2026-10-13: this party's own entry (null = not set: the all-parties / built-in default)
      const P = obj(obj(obj(D.res.data).parties)[L]), b = (v) => (typeof v === 'boolean' ? v : null);
      W.res = { auto: b(P.auto), scrolls: b(P.scrolls), raidHealerScrolls: b(P.raidHealerScrolls), raidAllScrolls: b(P.raidAllScrolls), blessedFirst: b(P.blessedFirst),
        scrollWho: RES_WHO.some(x => x[0] === P.scrollWho) ? P.scrollWho : null, scrollNames: Array.isArray(P.scrollNames) ? P.scrollNames.slice() : null, maxWalk: isSet(P.maxWalk) ? String(P.maxWalk) : '' };
    }
    if (ok(D.loot)) {   // LOOT RULES 2026-10-13: this party's entry (missing = OFF: everyone keeps what it finds)
      const raw = obj(obj(D.loot.data).parties)[L], has = !!(raw && typeof raw === 'object'), e = lootNormUI(has ? raw : null);
      W.loot = { has, on: has ? raw.on !== false : false, mode: e.mode, to: e.to, enchant: e.enchant, adena: e.adenaAbove ? fmtN(e.adenaAbove) : '', keepGrades: e.keepGrades.slice(),
        keepEnchanted: e.keepEnchanted, keepSpecial: e.keepSpecial, never: e.never.slice(), always: e.always.slice() };
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
    if (ok(D.routes) && (D.routes.parties || []).includes(L)) { const own = obj(obj(D.routes.own)[L]), o = {}; (D.routes.rules || []).forEach(r => { o[r.key] = r.type === 'number' ? (typeof own[r.key] === 'number' ? own[r.key] : null) : typeof own[r.key] === 'boolean' ? own[r.key] : null; }); W.routes = o; }   // MOVETOGETHER step 2: number rules (null = the default)
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
  const paKinds = () => (ok(PS.D.pauto) && Array.isArray(PS.D.pauto.kinds) && PS.D.pauto.kinds.length ? PS.D.pauto.kinds : PA_KINDS.concat(CB_KINDS));
  const supKinds = () => paKinds().filter(k => k.group !== 'combat');   // HIVESW: the Supplies section's switches
  const cbKinds = () => { const l = paKinds().filter(k => k.group === 'combat'); return l.length ? l : CB_KINDS; };   // HIVESW: an older server sends none -> the built-in list
  /** the setting for all parties (default) of a switch; missing = the kind's own default (combat ON, the rest OFF) */
  const paDef = (k) => { const d = ok(PS.D.pauto) ? obj(obj(PS.D.pauto.data).default)[k] : undefined; if (typeof d === 'boolean') return d; const K = paKinds().find(x => x.key === k) || CB_KINDS.find(x => x.key === k); return !!(K && K.def); };
  // SUPPLYAMT 2026-10-14: the amounts table (the API sends bands / items / built-in / suggested values)
  const AMT_FALLBACK = { bands: [[1, 'Level 1–19 (no grade)'], [20, 'Level 20–39 (D grade)'], [40, 'Level 40–51 (C grade)'], [52, 'Level 52–60 (B grade)'], [61, 'Level 61–75 (A grade)'], [76, 'Level 76+ (S grade)']].map(([start, label]) => ({ start, label })),
    keys: [['soulshots', 'Soulshots', 100000], ['spiritshots', 'Spiritshots', 100000], ['mana', 'Mana pots', 20000], ['healing', 'Heal pots', 5000], ['soe', 'Escape', 200], ['sor', 'Res scrolls', 200], ['ore', 'Spirit Ore', 20000]].map(([key, short, max]) => ({ key, short, label: short, max })),
    builtin: { soulshots: 10000, spiritshots: 5000, mana: 2000, healing: 30, soe: 5, sor: 3, ore: 300 }, suggest: {} };
  const amtInfo = () => (ok(PS.D.pauto) && PS.D.pauto.amounts ? PS.D.pauto.amounts : AMT_FALLBACK);
  const amtBands = () => amtInfo().bands, amtKeys = () => amtInfo().keys;
  /** what an empty cell means: the all-parties amount, else the built-in one */
  function amtInherit(band, k) { const d = ok(PS.D.pauto) ? obj(obj(obj(obj(PS.D.pauto.data).default).amounts)[String(band)]) : {}; return isSet(d[k]) ? { v: Number(d[k]), src: 'all parties' } : { v: Number(amtInfo().builtin[k]) || 0, src: 'standard' }; }
  /** the typed table -> { "<band>": { key: number } } | null (nothing typed) */
  function amtTable(A) { const out = {}; Object.keys(A || {}).forEach(b => { const r = {}; Object.keys(A[b] || {}).forEach(k => { const v = String(A[b][k] == null ? '' : A[b][k]).trim().replace(/[\s,]/g, ''); if (v !== '') r[k] = Number(v); }); if (Object.keys(r).length) out[b] = r; }); return Object.keys(out).length ? out : null; }
  const paParty = (k) => (PS.W.supplies.party[k] === null ? paDef(k) : PS.W.supplies.party[k]);
  const cbParty = (k) => (PS.W.combat.party[k] === null || PS.W.combat.party[k] === undefined ? paDef(k) : PS.W.combat.party[k]);   // HIVESW
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
  /** MOVETOGETHER step 2: the default of a number rule for this party (the file's default, not the party's own value) */
  function routeDefaultNum(key) { const v = ok(PS.D.routes) ? obj(obj(PS.D.routes.values)[PS.leader]) : {}, own = ok(PS.D.routes) ? obj(obj(PS.D.routes.own)[PS.leader]) : {}; const r = ok(PS.D.routes) ? (PS.D.routes.rules || []).find(x => x.key === key) : null;
    return typeof own[key] === 'number' || typeof v[key] !== 'number' ? (r ? r.default : '') : v[key]; }
  const routeRule = (key) => (ok(PS.D.routes) ? (PS.D.routes.rules || []).find(x => x.key === key) : null);
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
  // PARTY PLAN 2026-10-13 (Dashboard/partyplan.js): the plan's line + "Open the plan" (the plan has its own window and its own Save)
  function secPlan() {
    if (!window.PartyPlan) return '';
    let p = null; try { p = (typeof STATE !== 'undefined' && STATE && STATE.plans) ? STATE.plans[PS.leader] : null; } catch (e) { }
    const sum = p && p.line ? p.line.text : 'No plan yet — Start does the normal activity';
    const body = `${note(p && p.line ? E(p.line.text) : 'A plan is a list of steps the party follows when it is started: leveling places, quests, class changes, town / supplies / gear, raid bosses, "wait for my order".')}
      <div class="ps-row"><button type="button" class="uk-btn primary" data-psplan="1">📋 ${p ? 'Open the plan' : 'Make a plan'}</button></div>
      ${note('The plan is saved in its own window, not with Save below.')}`;
    return section('plan', '📋', 'Plan', sum, body);
  }

  function secMoney() {
    if (!PS.W.money) return section('money', '💰', 'Money', 'not available', unavailable('fund'));
    const m = PS.W.money, d = fundDefaults(), rec = m.receive !== false, town = ok(PS.D.fund) ? obj(PS.D.fund.rules).town || 'Giran' : 'Giran';
    const all = ok(PS.D.fund) ? PS.D.fund.parties || [] : [];
    const gText = m.gmode === 'none' ? 'nobody gives' : m.gmode === 'list' ? (m.glist.length ? `givers: ${m.glist.join(', ')}` : 'no giver chosen yet') : 'any rich party leader gives';
    const pgText = m.pg === 'all' ? gText : m.pg === 'none' ? 'nobody gives (own choice)' : m.pg === 'list' ? (m.pglist.length ? `own givers: ${m.pglist.join(', ')}` : 'own givers: none chosen yet') : 'any rich party leader gives (own choice)';
    const pu = m.purse || { on: false, lk: '', mc: '', bu: '' }, PD = window.PurseCard ? PurseCard.DEF : { leaderKeep: 2000000, memberCap: 5000000 };
    const sum = `Leader pays: ${pu.on ? 'on' : 'off'} · ` + (!m.on ? 'between parties: off' : rec ? `receives · ${pgText}` : 'receives nothing from other parties');
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
    // PURSE 2026-10-13: (1) inside the party — what each member's planned gear misses right now (live reports), with "Give it now"
    let live = '';
    try {
      const pd = window.PurseCard ? PurseCard.partyData(PS.leader) : null;
      if (pd && pd.needs.length) {
        const spare = Math.max(0, pd.leader.adena - (Number(pd.rule.leaderKeep) || PD.leaderKeep));
        live = `<div class="ps-needs"><div class="ps-lab">Right now</div>${pd.needs.map(x => `<div class="ps-need"><span><b>${E(x.name)}</b> needs <b>${E(fmtN(x.need))}</b> for its gear (has ${E(fmtN(x.have))})</span>${x.need <= spare ? `<button type="button" class="uk-btn secondary ps-now" data-quick="party:${E(PS.leader)}|!purse give ${E(x.name)}|${E(PS.leader)} gives ${E(x.name)} ${E(fmtN(x.need))} adena now (in Giran), then ${E(x.name)} buys its upgrades">Give it now</button>` : `<small>${E(PS.leader)} cannot spare it</small>`}</div>`).join('')}</div>`;
      } else if (pd) live = note('Right now every member can pay for its planned gear (or plans nothing).');
    } catch (e) { }
    const exMem = PS.M.find(n => n !== PS.leader) || 'a member', exAd = (() => { try { const c = ((typeof STATE !== 'undefined' && STATE && STATE.chars) || []).find(x => x.name === PS.leader); return c && c.adena != null ? shortAmt(c.adena) : '37M'; } catch (e) { return '37M'; } })();
    const mkRows = (m.mkLv || []).map((lv, i) => { const from = i ? m.mkLv[i - 1] : 1, label = i === m.mkLv.length - 1 ? `Level ${from}+` : `Level ${from}–${lv - 1}`; return inp('money.mk.' + i, m.mk[i], label, { small: true }); }).join('');
    const body = `
      <div class="ps-blk"><div class="ps-blkh">1 · Inside the party — the leader pays his members' gear and supplies</div>
      <div class="ps-what">Example: ${E(PS.leader)} (${E(exAd)}) pays ${E(exMem)} the 52k its D-grade armour costs, before anybody shops in Giran.</div>
      ${item(sw('money.purse.on', !!pu.on, `Leader pays his members' gear & supplies`, `On — ${PS.leader} pays what a member's planned gear misses (supply runs, "Better gear now", "Give it now")`, `Off — nothing happens until you switch it on. A member that cannot afford its gear shows a "Needs you" card with "Give it now".`),
        'The leader trades each member the difference between its planned upgrades and its adena, then the members buy, then the leader buys his own. Supplies (shots, scrolls, potions) the leader buys himself in the supply run and hands out.',
        `<div class="ps-grid">${inp('money.purse.lk', pu.lk, 'The leader keeps at least', { ph: fmtN(PD.leaderKeep) + ' (default)' })}${inp('money.purse.mc', pu.mc, 'At most per member', { ph: fmtN(PD.memberCap) + ' (default)', hint: '0 = no limit' })}${inp('money.purse.bu', pu.bu, 'At most per run (whole party)', { ph: 'no limit (default)', hint: '0 = no limit' })}</div>`)}
      ${live}
      <details class="ps-more"><summary>Pocket money each character keeps when it buys gear <span class="ps-shared">all parties</span></summary><div class="ps-grid">${mkRows}</div>
        <div class="ps-what">A character never spends this on gear (it is for scrolls and repairs). Low levels keep little, so their first gear is affordable.</div></details>
      </div>
      <div class="ps-blk"><div class="ps-blkh">2 · Between parties — a rich character of one party helps another party</div>
      <div class="ps-what">Example: the rich leader of another party tops ${E(PS.leader)} up to 8m when both stand idle in ${E(town)}.</div>
      ${item(sw('money.on', m.on, 'Adena hand-outs between parties', `On — for every party (meeting town: ${town})`, 'Off for every party — nobody hands out adena to another party.'), 'A rich character of one party tops up the characters of other parties when both are idle in the same town. <b>Shared by all parties.</b>')}
      ${item(sw('money.receive', m.on && rec, `Party ${PS.leader} receives adena from other parties`, m.receive === null ? 'On (no own setting yet: every party receives unless switched off)' : 'On',
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
      </div>
      <div class="ps-acts">${quick('!collect', 'Collect adena to the leader', 'Collect spare adena to the leader now', 'Members keep 2M / 2.5M / 3M by level; the rest goes to the leader')}${link('#/adena', 'Adena page (all parties)')}</div>
      ${adv(note('File: Scripts/data/fund_rules.json — parties.' + E(PS.leader) + '.purse (on, leaderKeep, memberCap, budget = Leader pays), memberKeep (pocket money by level, shared), parties.' + E(PS.leader) + ' (receive, targets, givers = who may give to this party; missing = the shared givers), chars.<member>.target, givers (shared), on (shared). Amounts accept 8m / 300k / 8,000,000. Order: !purse give <name|all>.'))}`;
    return section('money', '💰', 'Money', sum, body, { dirty: dirtySecs().includes('money') });
  }
  // HIVESW-2026-10-15 (player Vykaax: "let my own L2Swarm profile pick skills and heals, Hive does the pathing, resupply and dashboard")
  function secCombat() {
    if (!PS.W.combat) return section('combat', '⚔', 'Combat', 'not available', unavailable('pauto'));
    const c = PS.W.combat, K = cbKinds();
    const items = K.map(k => {
      const own = c.party[k.key] !== null && c.party[k.key] !== undefined, eff = cbParty(k.key), d = paDef(k.key);
      const offTxt = { skills: "Off — your L2Swarm profile's Combat Skills fight", heals: "Off — your L2Swarm profile's Auto Skills heal", potions: 'Off — Hive drinks no potions' }[k.key] || 'Off';
      const onTxt = 'On — Hive does it' + (own ? '' : ' (the setting for all parties)');
      const reset = own ? `<button type="button" class="uk-btn ghost ps-reset" data-psreset="combat.party.${E(k.key)}">Use the all-parties setting (${d ? 'on' : 'off'})</button>` : '';
      return item(sw('combat.party.' + k.key, eff, k.label, onTxt, offTxt), E(k.help), reset);
    }).join('');
    const rows = PS.M.map(n => { const ch = c.chars[n] || {};
      return `<div class="ps-mrow"><span class="ps-mn">${E(n)}${K.some(k => ch[k.key] !== null && ch[k.key] !== undefined) ? ' <small>own</small>' : ''}</span>${K.map(k => {
        const v = ch[k.key], pe = cbParty(k.key);
        return sel(`combat.chars.${n}.${k.key}`, v === null || v === undefined ? '' : v ? 'on' : 'off', [['', `Like the party (${pe ? 'Hive' : 'profile'})`], ['on', 'Hive'], ['off', 'My L2Swarm profile']], { skills: 'Skills', heals: 'Heals', potions: 'Potions' }[k.key] || k.label, { kind: 'tri' }); }).join('')}</div>`; }).join('');
    const offK = K.filter(k => !cbParty(k.key)).map(k => CB_SHORT[k.key] || k.key), ownCh = PS.M.filter(n => K.some(k => { const v = (c.chars[n] || {})[k.key]; return v !== null && v !== undefined; }));
    const sum = (offK.length ? `Your profile: ${offK.join(', ')}` : 'Hive does skills, heals and potions') + (ownCh.length ? ` · own: ${ownCh.join(', ')}` : '');
    const body = `
      ${items}
      <details class="ps-more"${ownCh.length ? ' open' : ''}><summary>Per character</summary>${rows}<div class="ps-what">A character's own choice wins over the party's switch. The toggles a character keeps on in fights are chosen on its character page (box "Combat").</div></details>
      ${note('Hive keeps walking, following, resupplying, resurrecting and showing everything here whatever you choose. When you switch something off, set it up in your L2Swarm profile first (account options: Combat Skills / Auto Skills), else nobody casts or heals.', 'info')}
      ${adv(note('File: Scripts/data/party_auto.json — parties.' + E(PS.leader) + '.skills / heals / potions, chars.<member>.skills / heals / potions / toggles; missing = default (' + K.map(k => k.key + ' ' + (paDef(k.key) ? 'on' : 'off')).join(', ') + '). swarm.js: hiveSkillsOn / hiveHealsOn / hivePotionsOn (HIVESW-2026-10-15); skills off also gives L2Swarm\'s Combat Skills back (l2sSkillGuard), heals off its Auto Skills (Self Heal).'))}`;
    return section('combat', '⚔', 'Combat', sum, body, { dirty: dirtySecs().includes('combat') });
  }
  function shortAmt(n) { n = Number(n) || 0; return n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n); }

  // PARTYAUTO 2026-10-13: own switches (were: "follow Start / Stop, no separate switch yet")
  function secSupplies() {
    const acts = `<div class="ps-acts">${quick('!supply', 'Supplies (leader buys in Giran and hands them out)', 'Supply run now')}${quick('!sell', 'Sell (every member sells its marked items + junk at the nearest shop)', 'Sell now')}</div>`;
    if (!PS.W.supplies) return section('supplies', '🧪', 'Supplies', 'not available', unavailable('pauto') + acts);
    const s = PS.W.supplies, run = runOn(), K = supKinds();
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
    if (s.pshop && s.pshop.on) onK.push('player-shop shots');   // PSHOP
    const sum = !onK.length ? 'Off — nothing by itself' : `${onK.join(' · ')}${run ? '' : ' (waits for Start)'}`;
    // SUPPLYAMT 2026-10-14: how much each character carries (every member uses the row of its own level)
    const lvOf = (n) => Number(memberInfo(n).level) || 0, bandOf = (lv) => amtBands().map(b => b.start).filter(b => b <= Math.max(1, lv)).pop() || 1;
    const amtOwn = !!amtTable(s.amt), allSet = ok(PS.D.pauto) && !!obj(obj(PS.D.pauto.data).default).amounts;
    const amtRows = amtBands().map(b => {
      const who = PS.M.filter(n => lvOf(n) && bandOf(lvOf(n)) === b.start);
      return `<div class="ps-amtband${who.length ? ' now' : ''}"><div class="ps-amth">${E(b.label)}${who.length ? ` <small>· ${E(who.join(', '))}</small>` : ''}</div><div class="ps-amtrow">${amtKeys().map(k => {
        const ih = amtInherit(b.start, k.key);
        return inp(`supplies.amt.${b.start}.${k.key}`, (s.amt[b.start] || {})[k.key] || '', k.short, { ph: fmtN(ih.v), small: true });
      }).join('')}</div></div>`; }).join('');
    const amtBlock = `<details class="ps-more"${amtOwn || s.allToo ? ' open' : ''}><summary>How much each character carries${amtOwn ? ' — own amounts' : ' — standard amounts'}</summary>
      <div class="ps-what">In every supply run the leader buys what is missing up to these amounts and hands it out. Each character uses the row of <b>its own level</b> (shots of its weapon grade). An empty box uses the grey number (${allSet ? 'the amount for all parties, else the standard amount' : 'the standard amount'}). 0 = buy none. Fighters get soulshots, casters spiritshots. Spirit Ore only goes to characters whose skills eat it (Major Heal, Major Group Heal, cubics, summons); a healer out of ore uses its other heals.</div>
      ${amtRows}
      <div class="ps-acts"><button type="button" class="uk-btn secondary" data-psact="amtSuggest">Fill in suggested amounts</button><button type="button" class="uk-btn ghost" data-psact="amtClear"${amtOwn ? '' : ' disabled'}>Clear — use the standard amounts</button></div>
      <label class="ps-chk"><input type="checkbox" data-pschk="supplies.allToo"${s.allToo ? ' checked' : ''}> Also use these amounts for every party that has none of its own</label>
    </details>`;
    const body = `
      ${items}
      ${amtBlock}
      ${pshopBlock(s)}
      <div class="crf-slot" data-crafter-party="${E(PS.leader)}"></div><!-- CRAFTER-2026-10-15: filled by Dashboard/crafterpanel.js -->
      <details class="ps-more"><summary>Per character</summary>${rows}<div class="ps-what">A character's own choice wins over the party's switch for selling and symbols.</div></details>
      ${note('Your orders always work, also while these are off: <b>Supply run now</b> (!supply), <b>Sell now</b> (!sell), and !dyes on a character in Giran. A supply run sells and draws symbols only for the characters whose switch is on.', 'info')}
      ${acts}
      ${adv(note('File: Scripts/data/party_auto.json — parties.' + E(PS.leader) + '.supplyWatch / sell / dyes, chars.<member>.sell / dyes; missing = default (' + K.map(k => k.key + ' ' + (paDef(k.key) ? 'on' : 'off')).join(', ') + '). Amounts: parties.' + E(PS.leader) + '.amounts / default.amounts (per level band 1, 20, 40, 52, 61, 76), missing = swarm.js CONFIG.lead.supply; symbol plans: Scripts/data/dye_plan.json. Gates: runAuto + pautoGate in swarm.js.'))}`;
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
      // AOECFG-2026-10-14: area spells (Flame Strike, Aqua Swirl, ...) - when casters use them
      body += `<div class="ps-sub"><b>Area spells (casters)</b></div>
        ${sel('tactics.aoeMin', t.aoeMin, [[0, 'Never'], [2, 'From 2 monsters'], [3, 'From 3 monsters (default)'], [4, 'From 4 monsters'], [5, 'From 5 monsters'], [6, 'From 6 monsters'], [8, 'From 8 monsters']], 'Use area spells')}
        ${seg('tactics.raidAoe', t.raidAoe, [['primary', 'Strongest single spell first'], ['value', 'Area spells when more monsters']], 'In raids')}
        <div class="ps-what">${t.raidAoe === 'value' ? 'In raids: an area spell is cast when it hits more in total than the best single spell (it can pull minions off the tank).' : 'In raids: the strongest single-target spell (e.g. Hydro Blast) goes first; area spells only while it reloads.'}</div>`;
      sum += t.aoeMin === 0 ? ' · no area spells' : '';
    } else body += unavailable('tactics');
    body += adv(note('File: Scripts/data/party_tactics.json — ' + E(PS.leader) + ' (hunting pairs, leveling only). Hunting place: Scripts/data/party_spots.json.'));
    return section('fight', '⚔', 'Fighting', sum, body, { dirty: dirtySecs().includes('tactics') });
  }

  function secRoutes() {
    if (!ok(PS.D.routes)) return section('routes', '🧭', 'Routes', 'not available', unavailable('routes'));
    if (!PS.W.routes) return section('routes', '🧭', 'Routes', 'not set up for this party', note('This party is not in swarm.config.json, so it has no route rules yet.'));
    const rules = PS.D.routes.rules || [], own = PS.W.routes;
    const eff = (k) => (own[k] === null ? routeDefault(k) : own[k]);
    const bools = rules.filter(r => r.type !== 'number'), nums = rules.filter(r => r.type === 'number');
    const nOn = bools.filter(r => eff(r.key)).length, nOwn = rules.filter(r => own[r.key] !== null).length;
    // MOVETOGETHER step 2 (2026-10-13): the walking-together numbers as plain fields (empty = the default, said in the hint)
    const numHtml = nums.length ? `<div class="ps-what"><b>Walking together</b> — how long the team waits at each waypoint and when a stuck member is left to catch up. Leave a field empty for the default.</div>` + nums.map(r => {
      const d = routeDefaultNum(r.key), u = r.unit === 's' ? ' s' : r.unit ? ' ' + r.unit : '';
      return `<div class="ps-item">${inp('routes.' + r.key, own[r.key] === null ? '' : String(own[r.key]), r.label.replace(/^Move together: /, ''), { ph: String(d), hint: `default ${d}${u} · ${r.min} to ${r.max}${u}` })}<div class="ps-what">${E(r.help || '')}</div>${own[r.key] !== null ? `<button type="button" class="uk-btn ghost ps-reset" data-psreset="routes.${E(r.key)}">Back to the default (${E(d)}${E(u)})</button>` : ''}</div>`;
    }).join('') : '';
    const body = note('What the bots may do on long computed routes (raids, trips to an NPC or a hunting area).') + bools.map(r => {
      const e = eff(r.key), d = routeDefault(r.key);
      return item(sw('routes.' + r.key, e, r.label, own[r.key] === null ? 'On (default)' : 'On', own[r.key] === null ? 'Off (default)' : 'Off — a route that needs it is not used.'),
        E(String(r.help || '').replace(/\s*\(skill \d+[^)]*\)/g, '')), own[r.key] !== null ? `<button type="button" class="uk-btn ghost ps-reset" data-psreset="routes.${E(r.key)}">Back to the default (${d ? 'on' : 'off'})</button>` : '');
    }).join('') + numHtml + adv(note('File: Scripts/data/route_rules.json — parties.' + E(PS.leader) + ' (only the rules you changed; the rest use the defaults).'));
    return section('routes', '🧭', 'Routes', `${nOn} of ${bools.length} allowed${nOwn ? ` · ${nOwn} changed` : ' · defaults'}`, body, { dirty: dirtySecs().includes('routes') });
  }

  // RESURRECTION 2026-10-13 (owner 21:00: "I need to be able to use 'Scroll of Resurrection' via an action or the Resurrection skill ... Chanter4
  // should use a scroll of resurrection on the bishop, then the bishop should buff up immediately"): automatic res (default ON — survival),
  // scrolls, scrolls on a dead healer in raids (default ON, owner), scrolls on anyone in raids (default OFF), who may read scrolls, how far a resser
  // walks. /api/resrules (Dashboard/resrules_api.js) -> Scripts/data/res_rules.json parties.<leader>; swarm.js RES reads it every 5 s.
  const RES_WHO = [['anyone', 'Anyone'], ['nottank', 'Not the tank'], ['names', 'Only chosen']];
  const RES_WALK = [['', 'default'], ['1500', '1,500 (close)'], ['3000', '3,000'], ['6000', '6,000'], ['10000', '10,000'], ['15000', '15,000 (far)']];
  const RES_DEF = { auto: true, scrolls: true, raidHealerScrolls: true, raidAllScrolls: false, scrollWho: 'anyone', scrollNames: [], maxWalk: 6000, blessedFirst: false };
  /** the value for all parties (the file's "default" entry, else the built-in default) */
  function resAll(k) { const d = ok(PS.D.res) ? obj(obj(PS.D.res.data).default) : {}, D = ok(PS.D.res) && PS.D.res.defaults ? PS.D.res.defaults : RES_DEF; const v = d[k];
    if (typeof D[k] === 'boolean') return typeof v === 'boolean' ? v : !!D[k]; if (k === 'scrollWho') return RES_WHO.some(x => x[0] === v) ? v : D[k]; if (k === 'scrollNames') return Array.isArray(v) ? v : (D[k] || []);
    if (k === 'maxWalk') return Number(v) >= 300 && Number(v) <= 20000 ? Number(v) : Number(D[k]) || 6000; return D[k]; }
  function resEff(k) { const v = PS.W.res[k]; return v === null || v === undefined || v === '' ? resAll(k) : k === 'maxWalk' ? Number(v) : v; }
  function secRes() {
    if (!PS.W.res) return section('res', '✚', 'Resurrection', 'not available', unavailable('res'));
    const R = PS.W.res, e = (k) => resEff(k), own = (k) => R[k] !== null && R[k] !== undefined && R[k] !== '';
    const reset = (k) => own(k) ? `<button type="button" class="uk-btn ghost ps-reset" data-psreset="res.${E(k)}">Use the default (${typeof resAll(k) === 'boolean' ? (resAll(k) ? 'on' : 'off') : E(String(resAll(k)))})</button>` : '';
    const kit = (() => { try { const cs = ((typeof STATE !== 'undefined' && STATE && STATE.chars) || []).filter(c => PS.M.includes(c.name));
      const parts = cs.map(c => { const k = c.resKit || {}; const b = [k.sk ? k.sk : '', (k.sor || c.res) ? `${k.sor != null ? k.sor : c.res} scroll${(k.sor != null ? k.sor : c.res) === 1 ? '' : 's'}` : '', k.bsor ? `${k.bsor} blessed` : ''].filter(Boolean); return b.length ? `<b>${E(c.name)}</b> ${E(b.join(', '))}` : ''; }).filter(Boolean);
      return parts.length ? note('Right now: ' + parts.join(' · ')) : note('Right now nobody of this party reports a res skill or a Scroll of Resurrection — the supply run buys scrolls (Supplies).', 'bad'); } catch (x) { return ''; } })();
    const names = e('scrollWho') !== 'names' ? '' : `<div class="ps-givers"><div class="ps-gp"><span class="ps-gpl">May read scrolls</span>${PS.M.map(n => { const on = (R.scrollNames || resAll('scrollNames') || []).includes(n);
      return `<button type="button" class="ps-chipbtn" aria-pressed="${on}" data-psresname="${E(n)}">${on ? '✓ ' : ''}${E(n)}</button>`; }).join('')}</div></div>`;
    const sum = !e('auto') ? 'Off — dead teammates wait for your order' : `Automatic · ${e('scrolls') ? 'skill, then scrolls' : 'skill only'}${e('raidHealerScrolls') ? ' · healers scrolled in raids' : ''}`;
    const body = `
      ${item(sw('res.auto', e('auto'), 'Raise dead teammates by themselves', 'On — the best one near raises a dead teammate (healers first, then the tank, then the rest); the raised one rebuffs first, then follows again.', 'Off — a dead teammate waits for your order (Resurrect button / Res all dead).'),
        'A resurrection skill first (more experience back). Without one, anyone near with a Scroll of Resurrection walks over (also inside dungeons), targets the body and reads it.', reset('auto'))}
      ${item(sw('res.scrolls', e('scrolls'), 'Use Scrolls of Resurrection', 'On — when nobody near has a res skill (or the healer is the dead one).', 'Off — only res skills (your orders may still use scrolls).'), '', reset('scrolls'))}
      ${item(sw('res.raidHealerScrolls', e('raidHealerScrolls'), 'In raids: scroll a dead healer', 'On — a dead healer is raised with a scroll even mid-raid (owner 2026-10-13).', 'Off — no scrolls in raids, not even on a healer.'), 'The party cannot recover without its healer.', reset('raidHealerScrolls'))}
      ${item(sw('res.raidAllScrolls', e('raidAllScrolls'), 'In raids: scroll anyone', 'On — every dead member may be scrolled mid-raid.', 'Off — in raids only healers get a scroll; the others wait for a res skill (when everyone alive is at 85 % or more) or the end of the fight.'), '', reset('raidAllScrolls'))}
      <div class="ps-sub"><b>Who may read scrolls</b></div>
      ${seg('res.scrollWho', e('scrollWho'), RES_WHO, 'Scroll users')}
      ${names}${reset('scrollWho')}
      <div class="ps-what">Non-healers go first, then the tank, the healer last (it keeps healing).</div>
      <div class="ps-grid">${sel('res.maxWalk', R.maxWalk || '', RES_WALK.map(([v, t]) => [v, v === '' ? `Default (${fmtN(resAll('maxWalk'))})` : t]), 'A resser walks at most')}</div>
      <details class="ps-more"><summary>More</summary>${item(sw('res.blessedFirst', e('blessedFirst'), 'Blessed scrolls first', 'On — a Blessed Scroll (more experience back) before a normal one.', 'Off — a normal Scroll of Resurrection first, Blessed only when there is no normal one.'), '', reset('blessedFirst'))}</details>
      ${kit}
      ${note('Your orders always work, also with everything here off and in raids: the <b>Resurrect</b> button on a dead member (pick who and how), <b>Res all dead</b> below, !res &lt;name&gt; / !resall.', 'info')}
      <div class="ps-acts">${quick('!resall', 'Res all dead (best one near each, skill first, then scrolls)', 'Res all dead now')}</div>
      ${adv(note('File: Scripts/data/res_rules.json — parties.' + E(PS.leader) + ' (auto, scrolls, raidHealerScrolls, raidAllScrolls, scrollWho anyone|nottank|names, scrollNames, maxWalk, blessedFirst); missing = "default" (all parties), then the built-in defaults. swarm.js RES-PURE resDecide / resAfterStep.'))}`;
    return section('res', '✚', 'Resurrection', sum, body, { dirty: dirtySecs().includes('res') });
  }

  // LOOT RULES 2026-10-13 (owner 22:10: an S80 "Sealed Moirai Helmet" Spoiler6's party looted was handed to Dagger1 by itself — "an OPTIONAL LOOT RULE
  // per party"): what happens to the loot the party picks up. /api/lootrules (Dashboard/lootrules_api.js) -> Scripts/data/loot_rules.json parties.<leader>;
  // missing = OFF (everyone keeps what it finds). The examples use Dashboard/lootlogic.js (window.LootLogic) = the same rules as swarm.js LOOTRULE-PURE.
  const LOOT_MODES_UI = [['all', 'Everything'], ['grade', 'All but valuable gear'], ['nongear', 'Only non-gear'], ['list', 'Only listed items']];
  const LOOT_MODE_HELP = {
    all: 'Everything the warehouse plan would store goes to the collector: materials, recipes, letters, old gear nobody uses (+ enchant scrolls and adena if switched on under "More").',
    grade: 'Like "Everything", but the gear you tick below stays with the character that found it — for example S-grade and up, enchanted pieces and special-ability weapons.',
    nongear: 'Only materials, recipes, letters and other non-gear go to the collector. Every weapon, armour and jewel stays with the character that found it.',
    list: 'Only the items on the "Always give" list (under "More") go to the collector. Everything else stays with the character that found it.' };
  const LOOT_GRADES_UI = [['NONE', 'No grade'], ['D', 'D'], ['C', 'C'], ['B', 'B'], ['A', 'A'], ['S', 'S'], ['S80', 'S80'], ['S84', 'S84']];
  const LOOT_DEF_UI = { mode: 'all', to: 'clanleader', keepGrades: ['S', 'S80', 'S84'] };
  /** a party's rule as the bots read it (window.LootLogic when the page has it, else the same defaults by hand) */
  function lootNormUI(r) {
    if (window.LootLogic && LootLogic.lootNorm) return LootLogic.lootNorm(r);
    const o = obj(r), D = LOOT_DEF_UI;
    return { on: r ? o.on !== false : false, mode: LOOT_MODES_UI.some(x => x[0] === o.mode) ? o.mode : D.mode, to: String(o.to || D.to), enchant: o.enchant !== false, adenaAbove: Number(o.adenaAbove) > 0 ? Number(o.adenaAbove) : 0,
      keepGrades: Array.isArray(o.keepGrades) ? o.keepGrades.slice() : D.keepGrades.slice(), keepEnchanted: o.keepEnchanted !== false, keepSpecial: o.keepSpecial !== false,
      never: Array.isArray(o.never) ? o.never.slice() : [], always: Array.isArray(o.always) ? o.always.slice() : [] };
  }
  const lootCL = () => (ok(PS.D.loot) && PS.D.loot.clanLeader) || (ok(PS.D.storage) && PS.D.storage.clanLeader) || '';
  const lootToName = (w) => (w.to === 'clanleader' ? (lootCL() || 'the clan leader') : (w.to || 'nobody chosen yet'));
  /** the popup's model -> the rule as it will be saved */
  function lootRuleOf(w) { const a = amt(w.adena); return { on: !!w.on, mode: w.mode, to: w.to || 'clanleader', enchant: !!w.enchant, adenaAbove: a == null || Number.isNaN(a) ? 0 : a, keepGrades: w.keepGrades.slice(), keepEnchanted: !!w.keepEnchanted, keepSpecial: !!w.keepSpecial, never: w.never.slice(), always: w.always.slice() }; }
  function lootSum(w) {
    if (!w.on) return 'Off — everyone keeps what it finds';
    const to = lootToName(w);
    return w.mode === 'all' ? `Everything to ${to}` : w.mode === 'grade' ? `To ${to} — valuable gear stays with the finder` : w.mode === 'nongear' ? `Non-gear to ${to} — gear stays` : `Only listed items to ${to}`;
  }
  function lootSentence(w) { try { if (window.LootLogic) return LootLogic.lootSummary(w.on ? lootRuleOf(w) : null, lootCL()); } catch (e) { } return lootSum(w) + '.'; }
  const PS_LOOTIN = { never: '', always: '' };
  function lootListHtml(key, list, label, help) {
    return `<div class="ps-sub"><b>${E(label)}</b></div><div class="ps-what">${help}</div>
      <div class="ps-lootlist" data-pslootlist="${key}">${list.length ? list.map((x, i) => `<span class="ps-lootchip"><span>${E(x)}</span><button type="button" class="ps-lootdel" data-pslootdel="${key}|${i}" aria-label="Remove ${E(x)}" title="Remove">✕</button></span>`).join('') : '<span class="ps-muted">empty</span>'}</div>
      <div class="ps-lootadd"><input type="text" data-pslootin="${key}" value="${E(PS_LOOTIN[key])}" placeholder="a name, part of a name or an item id" aria-label="${E(label)}: add an item" autocomplete="off"><button type="button" class="uk-btn secondary" data-pslootadd="${key}">Add</button></div>`;
  }
  /** "Add" next to a never / always list: one or more entries (comma separated): an item id or a name / part of a name (1-60 letters) */
  async function lootAdd(key) {
    const parts = String(PS_LOOTIN[key] || '').split(',').map(s => s.trim()).filter(Boolean); if (!parts.length) return;
    const badOnes = parts.filter(s => !(/^\d{1,7}$/.test(s) ? Number(s) > 0 : s.length <= 60));
    if (badOnes.length) { await uiAlert({ title: 'Not added', kind: 'error', body: `"${badOnes[0].slice(0, 40)}" is not an item id or a name (at most 60 letters).` }); return; }
    const L = PS.W.loot[key].slice();
    parts.forEach(s => { const v = /^\d{1,7}$/.test(s) ? Number(s) : s; if (!L.some(x => String(x).toLowerCase() === String(v).toLowerCase())) L.push(v); });
    PS.W.loot[key] = L.slice(0, 100); PS_LOOTIN[key] = ''; PS.lootMore = true; render(true);
    try { const el = document.querySelector(`#psBody [data-pslootin="${key}"]`); if (el) el.focus(); } catch (e) { }
  }
  function secLoot() {
    if (!PS.W.loot) return section('loot', '🎒', 'Loot', 'not available', unavailable('loot'));
    const w = PS.W.loot, CL = lootCL(), run = runOn(), chars = ok(PS.D.loot) ? (PS.D.loot.chars || []) : [];
    if (w.on && !w.to) PS.bad['loot.to'] = 'choose who collects'; else delete PS.bad['loot.to'];
    const toPick = w.to === 'clanleader' ? 'clanleader' : 'name';
    const toSeg = `<div class="ps-field"><span class="ps-lab">Collector</span><div class="ps-seg" role="radiogroup" aria-label="Collector">${[['clanleader', CL ? `Clan leader (${CL})` : 'Clan leader'], ['name', 'A chosen character']].map(([v, t]) => `<button type="button" role="radio" aria-checked="${toPick === v}" data-pslootto="${v}">${E(t)}</button>`).join('')}</div></div>`;
    const toSel = w.to === 'clanleader' ? '' : `<div class="ps-grid">${sel('loot.to', w.to, [['', 'Choose a character…']].concat(chars.concat(w.to && !chars.includes(w.to) ? [w.to] : []).map(n => [n, n])), 'Character')}</div>${PS.bad['loot.to'] ? `<div class="ps-bad">${E(PS.bad['loot.to'])}</div>` : ''}`;
    const grades = w.mode !== 'grade' ? '' : `<div class="ps-givers"><div class="ps-gp"><span class="ps-gpl">Keep these grades</span>${LOOT_GRADES_UI.map(([g, t]) => { const on = w.keepGrades.includes(g);
      return `<button type="button" class="ps-chipbtn" aria-pressed="${on}" data-pslootgrade="${g}">${on ? '✓ ' : ''}${E(t)}</button>`; }).join('')}</div></div>
      <label class="ps-chk"><input type="checkbox" data-pschk="loot.keepEnchanted"${w.keepEnchanted ? ' checked' : ''}> Keep enchanted gear (+1 and up)</label>
      <label class="ps-chk"><input type="checkbox" data-pschk="loot.keepSpecial"${w.keepSpecial ? ' checked' : ''}> Keep gear with a special ability</label>`;
    let ex = []; try { if (window.LootLogic) ex = LootLogic.lootExamples(w.on ? lootRuleOf(w) : null); } catch (e) { }
    const exHtml = !ex.length ? '' : `<div class="ps-lootex"><div class="ps-lab">For example</div>${ex.map(x => `<div class="ps-lootrow ${x.give ? 'give' : 'keep'}"><span class="ps-lootic" aria-hidden="true">${x.give ? '➜' : '✋'}</span><span class="ps-loott"><b>${E(x.name)}</b> <small>${E(x.what)}</small><span>${x.give ? `goes to ${E(lootToName(w))}` : `stays with the finder${w.on && x.why ? ` <small>(${E(x.why)})</small>` : ''}`}</span></span></div>`).join('')}</div>`;
    const kept = ok(PS.D.loot) ? (PS.D.loot.kept || []).filter(k => k.party === PS.leader || PS.M.includes(k.name)).slice(0, 6) : [];
    const tm = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
    const keptHtml = kept.length ? `<div class="ps-lootex"><div class="ps-lab">Kept lately (the rule stopped these)</div>${kept.map(k => `<div class="ps-lootrow keep"><span class="ps-lootic" aria-hidden="true">✋</span><span class="ps-loott"><b>${E(k.item)}</b> <small>${E(k.name)} · ${E(tm(k.at))}</small><span><small>${E(k.why)}</small></span></span></div>`).join('')}</div>` : '';
    const lists = `${lootListHtml('never', w.never, 'Never give', 'These stay with the finder, whatever the rule above says — also in the event-letter and clan-item hand-overs. Example: "Moirai" keeps every Moirai piece; 15694 keeps only that item.')}
      ${lootListHtml('always', w.always, 'Always give', 'These always go to the collector, also items a character would keep (for example "Mana Potion"). "Never give" wins over this list.')}`;
    const body = `
      ${item(sw('loot.on', w.on, 'Hand the party\'s loot to a collector', `On — ${lootSentence(w)}${run ? '' : ' (works once you press Start or send a supply run)'}`, 'Off — everyone keeps what it finds. Nothing is handed over by itself.'),
        'When on, the members trade their loot to one character — the collector — at the end of every supply run in Giran (when the collector is in Giran too). Worn items, quest items and what a character uses itself (shots, potions, scrolls, its own upgrades) always stay.')}
      ${w.on ? `
      <div class="ps-sub"><b>Who collects</b></div>
      ${toSeg}${toSel}
      <div class="ps-sub"><b>What goes to ${E(lootToName(w))}</b></div>
      <div class="ps-lootmode">${seg('loot.mode', w.mode, LOOT_MODES_UI, 'What goes to the collector')}</div>
      <div class="ps-what">${E(LOOT_MODE_HELP[w.mode] || '')}</div>
      ${grades}` : ''}
      ${exHtml}
      ${keptHtml}
      ${w.on ? `<details class="ps-more" data-pslootmore="1"${PS.lootMore ? ' open' : ''}><summary>More: enchant scrolls, adena, never / always lists</summary>
        ${item(sw('loot.enchant', w.enchant, 'Hand enchant scrolls too', 'On — enchant scrolls go to the collector.', 'Off — every character keeps its enchant scrolls.'), '')}
        <div class="ps-grid">${inp('loot.adena', w.adena, 'Hand adena above', { ph: '0 = keep all adena', hint: 'e.g. 5m: a character keeps 5,000,000 and hands the rest' })}</div>
        ${lists}</details>` : ''}
      ${note('Your own hand-overs always work and are never filtered by this rule: the Trade page (pick the items and who gets them). Anything the rule keeps stays in the bag until you decide.', 'info')}
      <div class="ps-acts">${(() => { let q = ''; /* owner-only order (catalog entry lootgive) */
        return q; })()}${link('#/trade', 'Trade page')}${link('#/storage', 'Storage page')}</div>
      ${adv(note('File: Scripts/data/loot_rules.json — parties.' + E(PS.leader) + ' (on, mode all|grade|nongear|list, to clanleader|&lt;name&gt;, enchant, adenaAbove, keepGrades, keepEnchanted, keepSpecial, never, always); missing = off. Kept items: Logs/loot_kept.log. swarm.js LOOTRULE (lootRowsMine, hovLootGate, unloadItems).'))}`;
    return section('loot', '🎒', 'Loot', lootSum(w), body, { dirty: dirtySecs().includes('loot') });
  }

  // HEAL SCHEMES 2026-10-13 (Dashboard/healschemes.js): who heals in this party and with which skills; "Edit" opens the character's heal sheet
  // (its own Save — not part of this popup's Save, like Start / Stop)
  function secHeal() {
    if (!window.HealSchemes) return '';
    return section('heal', '✚', 'Healing', HealSchemes.partySummary(PS.leader, PS.M), HealSchemes.partyBody(PS.leader, PS.M) + note('The heal settings are saved in their own window (Edit), not with Save below.'));
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
    ov.addEventListener('toggle', (e) => { const d = e.target; if (d && d.dataset && d.dataset.pssec) { if (d.open) PS.openSecs.add(d.dataset.pssec); else PS.openSecs.delete(d.dataset.pssec); } if (d && d.dataset && d.dataset.pslootmore) PS.lootMore = d.open; }, true);   // LOOT RULES: the Loot section's More stays open across re-renders
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.pslootin) { e.preventDefault(); lootAdd(e.target.dataset.pslootin); } });   // LOOT RULES: Enter = Add
    document.addEventListener('runswitch', () => { if (PS.open) fetchSrc('run').then(d => { PS.D.run = d; render(true); }); });
    document.addEventListener('healschemes', () => { if (PS.open && PS.W) render(true); });   // HEAL SCHEMES: the Healing section follows the heal sheet
    return ov;
  }
  function render(keepScroll) {
    const ov = frame(), sc = document.getElementById('psScroll'), top = sc ? sc.scrollTop : 0;
    document.getElementById('psTitle').textContent = `Party ${PS.leader} — settings`;
    if (!PS.W) {
      document.getElementById('psIntro').innerHTML = 'Loading the settings…';
      document.getElementById('psBody').innerHTML = ['Start / Stop', 'Fighting', 'Money', 'Supplies', 'Gear', 'Storage', 'Loot', 'Daily', 'Routes'].map(t => `<div class="ps-sec ps-skel"><div class="ps-st"><b>${t}</b><span class="ps-sum">…</span></div></div>`).join('');
      renderBar(); return;
    }
    const names = PS.M.map(n => { const m = memberInfo(n); return `${E(n)}${m.level ? ` <small>${E(m.level)}</small>` : ''}`; }).join(', ');
    document.getElementById('psIntro').innerHTML = `<div class="ps-who">${names}</div><div class="ps-what">Everything this party may do by itself, in one place. Switch on only what you want — the rest stays off. Changes are saved with <b>Save</b> below.</div>`;
    document.getElementById('psBody').innerHTML = [secRun(), secPlan(), secFight(), secHeal(), secRes(), secMoney(), secSupplies(), secCombat(), secGear(), secStorage(), secLoot(), secClan(), secDaily(), secRoutes()].join('');
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

  // PSHOP-2026-10-15 (owner "Shots step 2"): buy B / A / S shots from PLAYER shops in Giran at or below a max price (party_auto.json parties.<leader>.pshop)
  const PSHOP_FALLBACK = { kinds: [{ key: 'soulshot', label: 'Soulshots' }, { key: 'blessed', label: 'Blessed Spiritshots' }, { key: 'spiritshot', label: 'Spiritshots (plain — only when blessed ones of that grade cannot be had)' }],
    grades: ['B', 'A', 'S'], defaults: { budget: 5000000, keep: 1000000, maxAgeMin: 120 }, limits: { price: 10000000, budget: 100000000000, keep: 100000000000, maxAgeMin: 1440 } };
  const pshopInfo = () => (ok(PS.D.pauto) && PS.D.pauto.pshop ? PS.D.pauto.pshop : PSHOP_FALLBACK);
  function pshopModel(d, L) {
    const own = obj(obj(obj(d.parties)[L]).pshop), all = obj(obj(d.default).pshop), src = Object.keys(own).length ? own : all, I = pshopInfo(), max = {};
    I.kinds.forEach(k => { const m = obj(obj(src.max)[k.key]); max[k.key] = {}; I.grades.forEach(g => { max[k.key][g] = isSet(m[g]) && Number(m[g]) > 0 ? fmtN(m[g]) : ''; }); });
    return { on: src.on === true, scan: src.scan !== false, max, budget: isSet(src.budget) ? fmtN(src.budget) : '', keep: isSet(src.keep) ? fmtN(src.keep) : '',
      maxAgeMin: isSet(src.maxAgeMin) ? String(src.maxAgeMin) : '', from: Object.keys(own).length ? 'party' : Object.keys(all).length ? 'all' : 'none' };
  }
  /** the model -> the table the API stores (null = nothing of its own) */
  function pshopTable(w) {
    if (!w) return null;
    const I = pshopInfo(), out = {}, max = {}, n = (v) => { const x = amt(v); return x == null || Number.isNaN(x) ? null : x; };
    I.kinds.forEach(k => { const r = {}; I.grades.forEach(g => { const v = n((w.max[k.key] || {})[g]); if (v) r[g] = v; }); if (Object.keys(r).length) max[k.key] = r; });
    if (w.on) out.on = true;
    if (!w.scan) out.scan = false;
    if (Object.keys(max).length) out.max = max;
    ['budget', 'keep', 'maxAgeMin'].forEach(k => { const v = n(w[k]); if (v != null) out[k] = v; });
    return Object.keys(out).length ? out : null;
  }
  function pshopPrices(w) {
    const I = pshopInfo(), out = [];
    I.kinds.forEach(k => I.grades.forEach(g => { const v = amt((w.max[k.key] || {})[g]); if (v > 0) out.push(`${k.label.split(' (')[0].replace(/s$/, '')} ${g} ≤ ${fmtN(v)}`); }));
    return out;
  }
  function pshopBlock(s) {
    const w = s.pshop; if (!w) return '';
    const I = pshopInfo(), D = I.defaults, run = runOn(), prices = pshopPrices(w);
    const rows = I.kinds.map(k => `<div class="ps-pshband"><div class="ps-amth">${E(k.label)}</div><div class="ps-pshrow">${I.grades.map(g =>
      inp(`supplies.pshop.max.${k.key}.${g}`, (w.max[k.key] || {})[g] || '', `${g} grade: max price`, { ph: 'not bought', small: true })).join('')}</div></div>`).join('');
    const warn = w.on && !prices.length ? note('Switched on, but no max price is filled in — nothing will be bought. Fill in at least one price.', 'bad') : '';
    const onTxt = `On — in supply runs ${PS.leader} buys the B / A / S shots the team still needs from player shops in Giran${run ? '' : ' (works once you press Start, or in a supply run you order)'}`;
    return `<details class="ps-more" data-pshop${w.on || w.from !== 'none' ? ' open' : ''}><summary>Buy shots from player shops (B / A / S)${w.on ? ' — on' : ' — off'}</summary>
      ${item(sw('supplies.pshop.on', !!w.on, 'Buy shots from player shops', onTxt, OFF),
        'The shop NPC in Giran (Helvetia) sells no-grade, D and C shots only. With this on, the leader looks at the newest shop scan (Market page), picks the <b>cheapest</b> player shops at or below <b>your max price</b>, walks there, checks the price again in the shop (shops change) and buys until the team\'s need is covered. Then he hands them out like the shots from the shop NPC. An empty price = never bought from players.')}
      ${rows}
      <div class="ps-pshrow ps-pshmoney">
        ${inp('supplies.pshop.budget', w.budget, 'Most adena per supply run', { ph: fmtN(D.budget), small: true })}
        ${inp('supplies.pshop.keep', w.keep, `${PS.leader} always keeps at least`, { ph: fmtN(D.keep), small: true })}
        ${inp('supplies.pshop.maxAgeMin', w.maxAgeMin, 'Shop scan may be this old (minutes)', { ph: String(D.maxAgeMin), small: true })}
      </div>
      <label class="ps-chk"><input type="checkbox" data-pschk="supplies.pshop.scan"${w.scan ? ' checked' : ''}> When the last shop scan is older, the leader scans the Giran shops first (takes a few minutes)</label>
      ${warn}
      ${note(`Who buys: <b>${E(PS.leader)}</b> (the party leader) with his own adena, in Giran, during supply runs. Nothing cheap enough? He buys nothing and says so in party chat (for example "no Soulshot (B) at or below 12 adena — cheapest seen 15 at …").${w.from === 'all' ? ' These values come from the setting for all parties; saving makes them this party\'s own.' : ''}`, 'info')}
      <div class="ps-acts">${link('#/market', 'Current prices on the Market page')}</div>
    </details>`;
  }

  // ============================================================================================ events
  function validate(path, raw) {
    delete PS.bad[path];
    if (/^money\.mk\./.test(path)) { const n = amt(raw); if (n == null || Number.isNaN(n)) PS.bad[path] = 'a number, e.g. 5k or 50,000'; return; }   // PURSE: pocket money by level
    if (/^money\.(lt|mt|keep|chars\.|purse\.(lk|mc|bu))/.test(path)) { const n = amt(raw); if (Number.isNaN(n)) PS.bad[path] = 'a number, e.g. 8m, 300k or 8,000,000'; return; }
    if (path === 'loot.adena') { const n = amt(raw); if (Number.isNaN(n)) PS.bad[path] = 'a number, e.g. 5m, 300k or 0'; return; }   // LOOT RULES 2026-10-13
    if (/^storage\.party\.(above|weightPct|gapMin)$/.test(path)) { if (raw === '') return; const n = Number(raw), lim = { above: [1, 500], weightPct: [1, 100], gapMin: [0, 1440] }[path.split('.').pop()]; if (!Number.isFinite(n) || n < lim[0] || n > lim[1]) PS.bad[path] = `${lim[0]} to ${lim[1]}`; return; }
    if (/^routes\./.test(path)) { const r = routeRule(path.slice(7)); if (!r || r.type !== 'number' || raw === '') return; const n = Number(raw); if (!Number.isFinite(n) || n < r.min || n > r.max || Math.round(n) !== n) PS.bad[path] = `a whole number from ${r.min} to ${r.max}`; return; }   // MOVETOGETHER step 2
    if (/^supplies\.pshop\./.test(path)) { if (raw === '') return; const n = amt(raw), L = pshopInfo().limits, k = path.split('.')[2], lim = k === 'max' ? L.price : L[k] || L.price, lo = k === 'maxAgeMin' ? 5 : 0; if (n == null || Number.isNaN(n) || n < lo || n > lim) PS.bad[path] = `a number from ${fmtN(lo)} to ${fmtN(lim)}${k === 'max' ? ' adena per shot' : ''}`; return; }   // PSHOP
    if (/^supplies\.amt\./.test(path)) { if (raw === '') return; const k = path.split('.').pop(), K = amtKeys().find(x => x.key === k), max = K ? K.max : 100000, n = Number(raw.replace(/[\s,]/g, '')); if (!Number.isFinite(n) || n < 0 || Math.round(n) !== n || n > max) PS.bad[path] = `0 to ${fmtN(max)}`; return; }   // SUPPLYAMT
    if (/^tactics\.(minDealers|levelMargin|fallbackHp)$/.test(path)) { const n = Number(raw), lim = { minDealers: [1, 9], levelMargin: [-5, 10], fallbackHp: [5, 90] }[path.split('.').pop()]; if (raw === '' || !Number.isFinite(n) || n < lim[0] || n > lim[1]) PS.bad[path] = `${lim[0]} to ${lim[1]}`; }
  }
  function onInput(e) {
    if (e.target && e.target.dataset && e.target.dataset.pslootin) { PS_LOOTIN[e.target.dataset.pslootin] = e.target.value; return; }   // LOOT RULES: the "add an item" boxes (not part of Save)
    const t = e.target; if (!t.dataset || !t.dataset.psin) return;
    const p = t.dataset.psin; validate(p, t.value.trim());
    setP(p, /^routes\./.test(p) ? (t.value.trim() === '' ? null : PS.bad[p] ? t.value.trim() : Number(t.value.trim())) : /^tactics\./.test(p) ? (PS.bad[p] ? t.value.trim() : Number(t.value.trim())) : t.value.trim());   // MOVETOGETHER step 2: route numbers (empty = default)
    t.toggleAttribute('aria-invalid', !!PS.bad[p]);
    renderBar();
  }
  function onChange(e) {
    const t = e.target; if (!t.dataset) return;
    if (t.dataset.psin) { const p = t.dataset.psin; validate(p, t.value.trim()); if (/^(money\.|loot\.adena$|supplies\.pshop\.(max|budget|keep))/.test(p) && !PS.bad[p] && t.value.trim()) { const n = amt(t.value); if (n != null && !Number.isNaN(n)) { t.value = fmtN(n); setP(p, t.value); } } t.toggleAttribute('aria-invalid', !!PS.bad[p]); renderBar(); return; }   // no re-render: the next field keeps the focus
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
    const rn = t.closest('[data-psresname]');   // RESURRECTION 2026-10-13: who may read scrolls (Only chosen)
    if (rn) { e.preventDefault(); const n = rn.dataset.psresname; const L = PS.W.res.scrollNames ? PS.W.res.scrollNames.slice() : resAll('scrollNames').slice(); const i = L.indexOf(n); if (i >= 0) L.splice(i, 1); else L.push(n); PS.W.res.scrollNames = L; render(true); return; }
    // LOOT RULES 2026-10-13: collector kind, kept grades, never / always lists
    const lt = t.closest('[data-pslootto]');
    if (lt) { e.preventDefault(); const w = PS.W.loot; if (lt.dataset.pslootto === 'clanleader') { if (w.to !== 'clanleader') PS.lootPrevTo = w.to; w.to = 'clanleader'; } else if (w.to === 'clanleader') w.to = PS.lootPrevTo || ''; render(true); return; }
    const lg = t.closest('[data-pslootgrade]');
    if (lg) { e.preventDefault(); const g0 = lg.dataset.pslootgrade, G = PS.W.loot.keepGrades.includes(g0) ? PS.W.loot.keepGrades.filter(x => x !== g0) : PS.W.loot.keepGrades.concat(g0); PS.W.loot.keepGrades = LOOT_GRADES_UI.map(x => x[0]).filter(x => G.includes(x)); render(true); return; }
    const ld = t.closest('[data-pslootdel]');
    if (ld) { e.preventDefault(); const [k, i] = ld.dataset.pslootdel.split('|'); PS.W.loot[k] = PS.W.loot[k].filter((x, j) => j !== Number(i)); render(true); return; }
    const la = t.closest('[data-pslootadd]');
    if (la) { e.preventDefault(); lootAdd(la.dataset.pslootadd); return; }
    const go = t.closest('[data-psgo]');
    if (go) { e.preventDefault(); if (await close()) { try { if (typeof window.go === 'function') window.go(go.dataset.psgo); else location.hash = go.dataset.psgo; } catch (x) { location.hash = go.dataset.psgo; } } return; }
    const pl = t.closest('[data-psplan]');   // PARTY PLAN 2026-10-13: close this window, open the plan
    if (pl) { e.preventDefault(); const L = PS.leader; if (await close() && window.PartyPlan) PartyPlan.open(L); return; }
    const a = t.closest('[data-psact]');
    if (!a) return;
    e.preventDefault();
    const act = a.dataset.psact;
    if (act === 'close') { close(); return; }
    if (act === 'undo') { if (await uiConfirm({ title: 'Undo your changes?', body: 'Throw away every change in this window since it was opened or last saved.', confirmText: 'Undo changes', cancelText: 'Keep editing' })) { PS.W = clone(PS.W0); PS.bad = {}; render(true); } return; }
    if (act === 'save') { save(); return; }
    if (act === 'amtSuggest' && PS.W.supplies) { const S = amtInfo().suggest || {}; amtBands().forEach(b => { amtKeys().forEach(k => { const v = obj(S[b.start])[k.key]; if (v !== undefined) setP(`supplies.amt.${b.start}.${k.key}`, String(v)); }); }); Object.keys(PS.bad).filter(p => /^supplies\.amt\./.test(p)).forEach(p => delete PS.bad[p]); PS.openSecs.add('supplies'); render(true); return; }   // SUPPLYAMT
    if (act === 'amtClear' && PS.W.supplies) { amtBands().forEach(b => { amtKeys().forEach(k => setP(`supplies.amt.${b.start}.${k.key}`, '')); }); Object.keys(PS.bad).filter(p => /^supplies\.amt\./.test(p)).forEach(p => delete PS.bad[p]); render(true); return; }
    if (act === 'spot') { const L = PS.leader; if (await close() && typeof openSpotPicker === 'function') openSpotPicker(L); return; }
  }

  // ============================================================================================ open / close
  async function open(leader, sec) {   // sec (LOOT RULES 2026-10-13): open with that section unfolded and scrolled into view (e.g. 'loot' from the Storage page)
    if (!leader) return;
    if (PS.open && PS.leader !== leader && dirtySecs().length && !(await uiConfirm({ title: 'Throw away your changes?', body: `Party ${PS.leader} has unsaved changes.`, confirmText: 'Throw away', cancelText: 'Keep editing' }))) return;
    PS.opener = document.activeElement;
    const ov = frame(); PS.open = true; PS.leader = leader; PS.W = null; PS.W0 = null; PS.D = {}; PS.bad = {}; PS.M = [leader];
    if (!PS.openSecs.size) PS.openSecs.add('run');
    if (sec && SEC_NAME[sec]) PS.openSecs.add(sec);
    ov.hidden = false; document.documentElement.classList.add('ps-lock');
    render();
    try { ov.querySelector('.ps-x').focus(); } catch (e) { }
    try { if (window.HealSchemes) HealSchemes.load(true); } catch (e) { }   // HEAL SCHEMES: fresh rows for the Healing section
    await load(leader);
    if (sec && PS.open) { try { const d = document.querySelector(`#psBody details[data-pssec="${sec}"]`); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } } catch (e) { } }
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
      if (J(a.purse) !== J(b.purse)) {   // PURSE 2026-10-13
        if (a.purse.on !== b.purse.on) out.push(`Leader pays his members' gear & supplies (party ${PS.leader}): ${onoff(b.purse.on)}`);
        if (a.purse.lk !== b.purse.lk) out.push(`The leader keeps at least: ${b.purse.lk || 'the default'}`);
        if (a.purse.mc !== b.purse.mc) out.push(`At most per member: ${b.purse.mc || 'the default'}`);
        if (a.purse.bu !== b.purse.bu) out.push(`At most per run: ${b.purse.bu || 'no limit'}`);
      }
      if (J(a.mk) !== J(b.mk)) out.push(`Pocket money by level (ALL parties): ${b.mk.join(' / ')}`);
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
      supKinds().forEach(k => { const a = W0.supplies.party[k.key], b = W.supplies.party[k.key]; if (a !== b) out.push(`${k.label} (party ${PS.leader}): ${b === null ? 'the all-parties setting (' + (paDef(k.key) ? 'on' : 'off') + ')' : onoff(b)}`); });
      if (J(amtTable(W.supplies.amt)) !== J(amtTable(W0.supplies.amt))) out.push(`Supply amounts (party ${PS.leader}): ${amtTable(W.supplies.amt) ? 'own amounts' : 'the standard amounts'}`);   // SUPPLYAMT
      if (W.supplies.pshop && J(pshopTable(W.supplies.pshop)) !== J(pshopTable(W0.supplies.pshop))) {   // PSHOP
        const p = W.supplies.pshop, pr = pshopPrices(p);
        out.push(`Buy shots from player shops (party ${PS.leader}): ${p.on ? 'on' : 'off'}${pr.length ? ' — max ' + pr.join(', ') : ' — no max prices'}`);
        if (p.on) out.push(`Player shops: at most ${p.budget || fmtN(pshopInfo().defaults.budget)} adena per run, ${PS.leader} always keeps ${p.keep || fmtN(pshopInfo().defaults.keep)}`);
      }
      if (W.supplies.allToo) out.push(`Supply amounts for every party without its own: ${amtTable(W.supplies.amt) ? 'these amounts' : 'the standard amounts'}`);
      PS.M.forEach(n => supKinds().filter(k => k.char).forEach(k => { const a = (W0.supplies.chars[n] || {})[k.key], b = (W.supplies.chars[n] || {})[k.key]; if (a !== b) out.push(`${n}: ${k.key === 'sell' ? 'selling' : 'symbols'} ${b === null || b === undefined ? 'like the party' : onoff(b)}`); }));
    }
    if (W.res && J(W.res) !== J(W0.res)) {   // RESURRECTION 2026-10-13
      const L = { auto: 'Raise dead teammates by themselves', scrolls: 'Use Scrolls of Resurrection', raidHealerScrolls: 'In raids: scroll a dead healer', raidAllScrolls: 'In raids: scroll anyone', blessedFirst: 'Blessed scrolls first' };
      Object.keys(L).forEach(k => { if (W.res[k] !== W0.res[k]) out.push(`${L[k]} (party ${PS.leader}): ${W.res[k] === null ? 'the default (' + (resAll(k) ? 'on' : 'off') + ')' : onoff(W.res[k])}`); });
      if (W.res.scrollWho !== W0.res.scrollWho || J(W.res.scrollNames) !== J(W0.res.scrollNames)) out.push(`Who may read scrolls: ${W.res.scrollWho === null ? 'the default' : (RES_WHO.find(x => x[0] === W.res.scrollWho) || ['', W.res.scrollWho])[1]}${W.res.scrollWho === 'names' ? ' (' + ((W.res.scrollNames || []).join(', ') || 'nobody chosen') + ')' : ''}`);
      if (W.res.maxWalk !== W0.res.maxWalk) out.push(`A resser walks at most: ${W.res.maxWalk ? fmtN(W.res.maxWalk) : 'the default'}`);
    }
    if (W.loot && J(W.loot) !== J(W0.loot)) {   // LOOT RULES 2026-10-13: one plain sentence + the list changes
      const a = W0.loot, b = W.loot;
      out.push(`Loot of party ${PS.leader}: ${lootSentence(b)}`);
      if (b.on && (a.enchant !== b.enchant)) out.push(`Enchant scrolls: ${b.enchant ? 'handed too' : 'kept'}`);
      if (b.on && a.adena !== b.adena) out.push(`Adena: ${amt(b.adena) > 0 ? 'everything above ' + b.adena + ' is handed' : 'kept'}`);
      if (J(a.never) !== J(b.never)) out.push(`Never give: ${b.never.join(', ') || 'empty'}`);
      if (J(a.always) !== J(b.always)) out.push(`Always give: ${b.always.join(', ') || 'empty'}`);
    }
    if (W.combat && J(W.combat) !== J(W0.combat)) {   // HIVESW-2026-10-15
      const who = (v) => (v ? 'Hive' : 'your L2Swarm profile');
      cbKinds().forEach(k => { const a = W0.combat.party[k.key], b = W.combat.party[k.key]; if (a !== b) out.push(`${k.label} (party ${PS.leader}): ${b === null || b === undefined ? 'the all-parties setting (' + (paDef(k.key) ? 'on' : 'off') + ')' : b ? 'on — Hive does it' : 'off — ' + who(false) + ' does it'}`); });
      PS.M.forEach(n => cbKinds().forEach(k => { const a = (W0.combat.chars[n] || {})[k.key], b = (W.combat.chars[n] || {})[k.key]; if (a !== b) out.push(`${n}: ${k.key} by ${b === null || b === undefined ? 'like the party' : who(b)}`); }));
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
    if (W.routes && J(W.routes) !== J(W0.routes)) (PS.D.routes.rules || []).forEach(r => { if (W.routes[r.key] !== W0.routes[r.key]) out.push(`Route rule "${r.label}": ${W.routes[r.key] === null ? 'back to the default' : r.type === 'number' ? W.routes[r.key] + (r.unit === 's' ? ' s' : r.unit ? ' ' + r.unit : '') : onoff(W.routes[r.key])}`); });
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
      const fp = obj(obj(r.parties)[L]), puCh = J(a.purse) !== J(b.purse);
      const puNew = () => { const q = { on: !!b.purse.on }; const lk = num(b.purse.lk, null), mc = num(b.purse.mc, null), bu = num(b.purse.bu, null); if (lk != null) q.leaderKeep = lk; if (mc != null) q.memberCap = mc; if (bu != null) q.budget = bu; return q; };
      if (puCh && !(a.receive !== b.receive || a.lt !== b.lt || a.mt !== b.mt || a.pg !== b.pg || J(a.pglist) !== J(b.pglist))) { r.parties = Object.assign({}, obj(r.parties)); r.parties[L] = Object.assign({}, fp, { purse: puNew() }); }   // PURSE: only the purse key
      if (J(a.mk) !== J(b.mk)) r.memberKeep = b.mkLv.map((lv, i) => [lv, num(b.mk[i], 0)]);
      if (a.receive !== b.receive || a.lt !== b.lt || a.mt !== b.mt || a.pg !== b.pg || J(a.pglist) !== J(b.pglist)) {
        r.parties = Object.assign({}, obj(r.parties)); const p = { receive: b.receive !== false }; const lt = num(b.lt, null), mt = num(b.mt, null);
        if (lt != null) p.leaderTarget = lt; if (mt != null) p.memberTarget = mt;
        if (b.pg !== 'all') p.givers = { mode: b.pg, list: b.pg === 'list' ? b.pglist.slice() : [] };   // FUNDGIVERS: 'all' = no own entry (the shared givers)
        if (puCh) p.purse = puNew(); else if (fp.purse) p.purse = fp.purse;   // PURSE: never dropped by a receive / target / givers edit
        r.parties[L] = p;
      }
      r.chars = Object.assign({}, obj(r.chars));
      PS.M.forEach(n => { if (a.chars[n] === b.chars[n]) return; const v = num(b.chars[n], null); if (v == null) delete r.chars[n]; else r.chars[n] = { target: v }; });
      const d = await call(SRC.fund, { method: 'POST', body: JSON.stringify({ rules: r, rev: fresh.rev, by: 'party settings' }) });
      // PURSE: an older dashboard server drops the new keys without an error — say so instead of a silent 'saved'
      if (d && d.ok && ((puCh && !(d.rules && d.rules.parties && d.rules.parties[L] && d.rules.parties[L].purse)) || (J(a.mk) !== J(b.mk) && !(d.rules && d.rules.memberKeep)))) return { ok: false, error: 'the dashboard server is older than this page and did not keep "Leader pays" / the pocket money — restart the dashboard server (PC tab), then save again' };
      return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || 'no answer', conflict: !!(d && d.conflict) };
    },
    async res(fresh) {   // RESURRECTION 2026-10-13: only the changed keys of this party's entry (null = removed)
      const a = PS.W0.res, b = PS.W.res, values = {};
      ['auto', 'scrolls', 'raidHealerScrolls', 'raidAllScrolls', 'blessedFirst', 'scrollWho'].forEach(k => { if (a[k] !== b[k]) values[k] = b[k]; });
      if (J(a.scrollNames) !== J(b.scrollNames)) values.scrollNames = b.scrollNames;
      if (a.maxWalk !== b.maxWalk) values.maxWalk = b.maxWalk === '' || b.maxWalk === null ? null : Number(b.maxWalk);
      const d = await call(SRC.res, { method: 'POST', body: JSON.stringify({ party: PS.leader, values, rev: fresh.rev, by: 'party settings' }) });
      return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || 'no answer', conflict: !!(d && d.conflict) };
    },
    async loot(fresh) {   // LOOT RULES 2026-10-13: a new entry = the whole rule; an existing one = only the changed keys (other keys, e.g. "note", stay)
      const a = PS.W0.loot, b = PS.W.loot, R = lootRuleOf(b), R0 = lootRuleOf(a), values = {};
      Object.keys(R).forEach(k => { if (!a.has || J(R[k]) !== J(R0[k])) values[k] = R[k]; });
      const d = await call(SRC.loot, { method: 'POST', body: JSON.stringify({ party: PS.leader, values, rev: fresh.rev, by: 'party settings' }) });
      return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || 'no answer', conflict: !!(d && d.conflict) };
    },
    async supplies(fresh) {   // PARTYAUTO 2026-10-13: only this party's entry + its members' own switches (null = removed)
      const a = PS.W0.supplies, b = PS.W.supplies, values = {}, chars = {};
      supKinds().forEach(k => { if (a.party[k.key] !== b.party[k.key]) values[k.key] = b.party[k.key]; });
      PS.M.forEach(n => supKinds().filter(k => k.char).forEach(k => { const x = (a.chars[n] || {})[k.key], y = (b.chars[n] || {})[k.key]; if (x !== y) (chars[n] = chars[n] || {})[k.key] = y === undefined ? null : y; }));
      const body = { party: PS.leader, values, chars, rev: fresh.rev, by: 'party settings' };
      const t = amtTable(b.amt); if (J(t) !== J(amtTable(a.amt))) body.amounts = t;   // SUPPLYAMT 2026-10-14
      if (b.allToo) body.defaultAmounts = t;
      { const pa = pshopTable(a.pshop), pb = pshopTable(b.pshop); if (J(pa) !== J(pb)) body.pshop = pb; }   // PSHOP-2026-10-15: this party's own table (null = removed)
      const d = await call(SRC.pauto, { method: 'POST', body: JSON.stringify(body) });
      return d && d.ok ? { ok: true } : { ok: false, error: (d && d.error) || 'no answer', conflict: !!(d && d.conflict) };
    },
    async combat(fresh) {   // HIVESW-2026-10-15: this party's skills / heals / potions + its members' own (null = removed); the rev is read again (Supplies may have just written the same file)
      const a = PS.W0.combat, b = PS.W.combat, values = {}, chars = {};
      cbKinds().forEach(k => { if (a.party[k.key] !== b.party[k.key]) values[k.key] = b.party[k.key] === undefined ? null : b.party[k.key]; });
      PS.M.forEach(n => cbKinds().forEach(k => { const x = (a.chars[n] || {})[k.key], y = (b.chars[n] || {})[k.key]; if (x !== y) (chars[n] = chars[n] || {})[k.key] = y === undefined ? null : y; }));
      let rev = fresh.rev; try { const f2 = await fetchSrc('pauto'); if (ok(f2)) rev = f2.rev; } catch (e) { }
      const d = await call(SRC.pauto, { method: 'POST', body: JSON.stringify({ party: PS.leader, values, chars, rev, by: 'party settings' }) });
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
      PS.W.loot && PS.W.loot.on && !(PS.W0.loot && PS.W0.loot.on) ? uiWarn(`Loot hand-over switched on: at the end of every supply run the members trade their loot to ${lootToName(PS.W.loot)}.`) : '',   // LOOT RULES 2026-10-13
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
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-psopen]'); if (!b) return; e.preventDefault(); e.stopPropagation(); open(b.dataset.psopen, b.dataset.psopensec || ''); }, true);   // LOOT RULES: data-psopensec = the section to show
  window.PartySettings = { button, open, close, _state: PS, _amt: amt };
})();

// ================================================================================================ PURSE CARD (tester 2026-10-13 20:45)
// "Needs you" card on the party card (Parties tab) and the character page: a member whose planned gear upgrades cost more than it has while
// its party's 'Leader pays' (fund_rules.json parties.<leader>.purse.on) is OFF and the leader could pay it. [Give it now] = the order
// "!purse give <name>" (the leader trades it the difference in Giran, then it buys its upgrades); [Switch on 'Leader pays' for this party]
// writes parties.<leader>.purse.on = true through /api/fundrules (nothing else changes). Data: swarm_state.purse of every character
// (swarm.js pursePublic: need / have / keep / grade + the party rule as the bot reads it). The card rule is the same as swarm.js
// PURSE-PURE purseCardRows (docs/plan/tools/test_purse.js checks both on the same inputs). Exposes window.PurseCard.
(function () {
  'use strict';
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DEF = { leaderKeep: 2000000, memberCap: 5000000, budget: 0 };
  const KEEP_DEF = [[20, 5000], [40, 50000], [60, 150000], [999, 300000]];
  const N = (v, d) => { if (v === undefined || v === null || v === '') return d; const n = Number(v); return isFinite(n) && n >= 0 ? n : d; };
  const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const short = (n) => { n = Number(n) || 0; return n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : fmt(n); };
  /** = swarm.js purseCardRows (PURSE-PURE) */
  function purseCardRows(rule, leader, members) {
    if (!rule || rule.on) return [];
    const spare = Math.max(0, N(leader && leader.adena, 0) - N(rule.leaderKeep, DEF.leaderKeep));
    return (members || []).filter(m => m && m.name !== (leader && leader.name) && N(m.need, 0) > 0 && N(m.need, 0) <= spare)
      .map(m => ({ name: m.name, need: N(m.need, 0), have: N(m.have, 0), grade: String(m.grade || '') })).sort((a, b) => a.name.localeCompare(b.name));
  }
  const chars = () => { try { return (typeof STATE !== 'undefined' && STATE && STATE.chars) || []; } catch (e) { return []; } };
  /** the party's purse picture from the live reports (null = no report from the leader yet / an older swarm.js) */
  function partyData(leader, list) {
    list = list || chars().filter(c => c.party === leader);
    const L = list.find(c => c.name === leader);
    if (!L || !L.purse || !L.purse.rule || (L.ageSec != null && L.ageSec > 300)) return null;
    const rule = L.purse.rule, lead = { name: leader, adena: N(L.adena, 0) };
    const members = list.filter(c => c.name !== leader && c.purse && !c.purse.lock && (c.ageSec == null || c.ageSec <= 300))
      .map(c => ({ name: c.name, need: N(c.purse.need, 0), have: c.adena != null ? N(c.adena, 0) : N(c.purse.have, 0), keep: N(c.purse.keep, 0), grade: String(c.purse.grade || ''), auto: c.purse.auto !== false }));
    return { rule, leader: lead, members, needs: members.filter(m => m.need > 0), rows: purseCardRows(rule, lead, members) };
  }
  const gradeTxt = (g) => (g && g !== 'NONE' ? g + '-grade ' : '');
  function cardHtml(leader, d, rows, who) {
    const total = rows.reduce((a, r) => a + r.need, 0);
    const line = (r) => `<div class="pn-row"><span class="pn-t"><b>${E(r.name)}</b> needs <b>${fmt(r.need)}</b> adena for its ${E(gradeTxt(r.grade))}upgrades — ${E(leader)} has <b>${E(short(d.leader.adena))}</b>.</span>
      <button type="button" class="uk-btn primary pn-give" data-quick="party:${E(leader)}|!purse give ${E(r.name)}|${E(leader)} gives ${E(r.name)} ${fmt(r.need)} adena now (in Giran), then ${E(r.name)} buys its upgrades">Give it now</button></div>`;
    return `<div class="pn-card" data-pursecard="${E(leader)}" role="region" aria-label="Needs you: gear money">
      <div class="pn-h"><span aria-hidden="true">💰</span> <b>Needs you</b> <span class="pn-sub">gear money${who ? '' : ` · party ${E(leader)}`}</span></div>
      ${rows.map(line).join('')}
      ${rows.length > 1 && !who ? `<div class="pn-row pn-all"><span class="pn-t">All ${rows.length} together: <b>${fmt(total)}</b> adena.</span><button type="button" class="uk-btn secondary pn-give" data-quick="party:${E(leader)}|!purse give all|${E(leader)} gives every member what its gear upgrades miss (${fmt(total)} adena) now in Giran, then they buy">Give all now</button></div>` : ''}
      <div class="pn-acts"><button type="button" class="uk-btn secondary" data-purse-on="${E(leader)}">Switch on 'Leader pays' for this party</button></div>
      <div class="pn-what">Nothing is paid by itself while 'Leader pays' is off. ${E(leader)} keeps at least ${E(short(N(d.rule.leaderKeep, DEF.leaderKeep)))} for himself.</div></div>`;
  }
  /** the card on a party card (Parties tab) — '' when nobody needs the leader's help or 'Leader pays' is on */
  function partyHtml(leader, list) { const d = partyData(leader, list); return d && d.rows.length ? cardHtml(leader, d, d.rows, '') : ''; }
  /** the card on the character page: only this character's line (the leader's page shows all of his party) */
  function charHtml(name) {
    const c = chars().find(x => x.name === name); if (!c || !c.party) return '';
    const d = partyData(c.party); if (!d) return '';
    const rows = c.party === name ? d.rows : d.rows.filter(r => r.name === name);
    return rows.length ? cardHtml(c.party, d, rows, c.party === name ? '' : name) : '';
  }
  /** fill what the API needs when the file is new / missing keys (the bots' defaults, swarm.js fundRules) */
  function fundFill(r) {
    const FD = { town: 'Giran', everyMin: 30, minGive: 200000, slack: 500000, brokeBelow: 500000 };
    Object.keys(FD).forEach(k => { if (r[k] === undefined || r[k] === null || r[k] === '') r[k] = FD[k]; });
    if (r.on === undefined) r.on = true;
    r.defaults = Object.assign({ leaderTarget: 8000000, memberTarget: 3000000, clanLeaderTarget: 12000000 }, r.defaults && typeof r.defaults === 'object' ? r.defaults : {});
    if (!r.givers) r.givers = { mode: 'auto', list: [], keepAtLeast: 30000000 };
    if (r.givers.keepAtLeast === undefined) r.givers.keepAtLeast = 30000000;
    return r;
  }
  const call = (u, o) => (typeof api === 'function' ? api(u, o) : fetch(u, Object.assign({ headers: { 'Content-Type': 'application/json' } }, o || {})).then(r => r.json()));
  /** "Switch on 'Leader pays' for this party" (asks first; optionally pays everyone now) */
  async function switchOn(leader) {
    const c = await uiChoice({ title: `Switch on 'Leader pays' for party ${leader}?`, body: [
      uiP(`From now on ${leader} pays what a member's planned gear upgrades miss, before anybody shops: in supply runs, with "Better gear now", and with "Give it now".`),
      uiP(`${leader} keeps at least ${fmt(DEF.leaderKeep)} for himself and gives at most ${fmt(DEF.memberCap)} per member (change it in ⚙ Settings → Money).`),
      uiNote('Supplies (shots, scrolls, potions) the leader buys himself in the supply run and hands out, as before.')],
      buttons: [{ label: 'Switch on', value: 'on' }, { label: 'Switch on and pay now', value: 'pay', primary: true }] });
    if (!c) return false;
    let g = null; try { g = await call('/api/fundrules'); } catch (e) { g = { error: e.message }; }
    if (!g || g.error) { await uiAlert({ title: 'Not switched on', kind: 'error', body: (g && g.error) || 'no answer from the dashboard server' }); return false; }
    const r = fundFill(JSON.parse(JSON.stringify(g.rules || {})));
    r.parties = Object.assign({}, r.parties && typeof r.parties === 'object' ? r.parties : {});
    const p = Object.assign({ receive: true }, r.parties[leader] || {});
    p.purse = Object.assign({}, p.purse && typeof p.purse === 'object' ? p.purse : {}, { on: true });
    r.parties[leader] = p;
    let d = null; try { d = await call('/api/fundrules', { method: 'POST', body: JSON.stringify({ rules: r, rev: g.rev, by: 'needs-you card' }) }); } catch (e) { d = { error: e.message }; }
    const saved = d && d.ok && d.rules && d.rules.parties && d.rules.parties[leader] && d.rules.parties[leader].purse && d.rules.parties[leader].purse.on === true;
    if (!saved) { await uiAlert({ title: 'Not switched on', kind: 'error', body: d && d.ok ? 'The dashboard server is older than this page and did not keep the switch — restart the dashboard server (PC tab), then try again.' : ((d && d.error) || 'no answer') }); return false; }
    try { if (window.UIKit && UIKit.toast) UIKit.toast(`Party ${leader}: 'Leader pays' is on`, { kind: 'ok' }); } catch (e) { }
    if (c === 'pay' && typeof send === 'function') send('party:' + leader, null, '!purse give all');
    try { if (typeof refresh === 'function') refresh(); } catch (e) { }
    return true;
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-purse-on]'); if (!b) return; e.preventDefault(); e.stopPropagation(); switchOn(b.dataset.purseOn); });
  window.PurseCard = { partyHtml, charHtml, partyData, purseCardRows, switchOn, fundFill, fmt, short, DEF, KEEP_DEF };
})();
