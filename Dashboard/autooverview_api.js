// WHAT RUNS BY ITSELF — API (Discord player Roketta 2026-10-15: "one page with every automation SwarmHive can do by itself, per party: on or
// off right now and why, and where to switch it"). Loaded by server.js (one hook, BEFORE the key check like sevensigns_api.js; the API checks
// the key itself). READ-ONLY: nothing is written here — every switch keeps its own page / API.
//   GET /api/autooverview[?party=<leader>]
//     { at, groups, parties: [{ leader, members, online, started, startWhy, now (the leader's task), sevenSigns: { catacomb, necropolis, same },
//       items: [{ key, state: on | off | paused | always | order | manual, own (its own switch: true | false | null), src, why, now }] }] }
//   Public (no secrets): /autocatalog.js (the shared catalog), /autooverview.js, /autooverview.css.
// The entries come from Dashboard/autocatalog.js; EVAL below reads each entry's switch from the same files the bots read (missing file = the
// bots' default). The Seven Signs line uses Dashboard/sslogic.js (= swarm.js SSGATE-PURE ssGateDecide + ssgReason: the bot's own words).
// Test: docs/plan/tools/test_auto_overview.js (+ test_auto_overview_ui.js against the sandbox server).
'use strict';
const fs = require('fs'), path = require('path');
const CAT = require('./autocatalog');
const SSL = require('./sslogic');
const STATIC = { '/autocatalog.js': 'application/javascript; charset=utf-8', '/autooverview.js': 'application/javascript; charset=utf-8', '/autooverview.css': 'text/css; charset=utf-8' };
const obj = (x) => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
const lc = (s) => String(s == null ? '' : s).toLowerCase();
const req = (n) => { try { return require('./' + n); } catch (e) { return null; } };
const ago = (t) => { const ms = typeof t === 'number' ? t : Date.parse(t); const s = Math.round((Date.now() - ms) / 1000); if (!isFinite(s)) return ''; return s < 90 ? s + ' s ago' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
const SRC_TEXT = { party: 'set for this party', all: 'the setting for all parties', default: 'nobody changed it (the default)', char: 'set per character', file: 'from its settings file' };

/** every file once per request (each evaluator reads from here) */
function loadAll(ctx) {
  const rj = (dir, f, env) => { const F = (env && process.env[env]) || path.join(dir, f); try { const t = fs.readFileSync(F, 'utf8'); return t.trim() ? JSON.parse(t.replace(/^﻿/, '')) : {}; } catch (e) { return null; } };
  const D = ctx.DATA, L = ctx.LOGS;
  return {
    run: rj(D, 'run_state.json', 'SWARM_RUNSTATE_FILE'), pauto: rj(D, 'party_auto.json', 'SWARM_PARTYAUTO_FILE'), res: rj(D, 'res_rules.json', 'SWARM_RESRULES_FILE'),
    heal: rj(D, 'heal_schemes.json'), buffs: rj(D, 'buff_plans.json'), tactics: rj(D, 'party_tactics.json', 'SWARM_TACTICS_FILE'), spots: rj(D, 'party_spots.json'),
    timers: rj(D, 'hunt_timers.json', 'SWARM_HUNTTIMER_FILE'), plans: rj(D, 'party_plans.json'), routes: rj(D, 'route_rules.json', 'SWARM_ROUTERULES_FILE'),
    qfarm: rj(D, 'quest_farm.json'), fund: rj(D, 'fund_rules.json'), stash: rj(D, 'stash_rules.json'), loot: rj(D, 'loot_rules.json'), gear: rj(D, 'gear_auto.json'),
    classes: rj(D, 'class_plans.json'), soul: rj(D, 'soul_prefs.json'), daily: rj(L, 'daily_enabled.json', 'SWARM_DAILY_FILE'), ss: rj(D, 'seven_signs.json', 'SWARM_SEVENSIGNS_FILE'),
    ssState: rj(L, 'sevensigns_state.json'), cq: rj(D, 'clan_quests.json', 'SWARM_CLANQUESTS_FILE'), fundLog: rj(L, 'fund_log.json'),
  };
}
const cnt = (L, f) => L.filter(f).length;
/** "3 of 5" style member count text */
const ofMembers = (n, all, what) => `${n} of ${all} member${all === 1 ? '' : 's'} ${what}`;

// ---- one evaluator per switch: (party, F, ctx) -> { own: true | false | null, src, detail, now, active } ------------------------------------
const EVAL = {
  run(P, F) { const R = req('runstate_api'); const e = R ? R.runEffective(F.run || {}, P.leader, P.leader) : { on: false, src: 'default' };
    const held = P.members.filter(n => n !== P.leader && R && R.runEffective(F.run || {}, n, P.leader).held);
    return { own: !!e.on, src: e.src === 'party' ? 'party' : 'default', detail: [e.on ? 'started' + (e.at ? ' ' + ago(e.at) : '') + (e.by ? ' by ' + String(e.by).replace(/^bot:/, '') : '') : 'stopped', e.why ? '"' + e.why + '"' : '', held.length ? held.join(', ') + ' stand still (member switch)' : ''].filter(Boolean).join(' · ') }; },
  res(P, F) { const R = req('resrules_api'); if (!R) return { own: true, src: 'default' }; const r = R.resRulesFor(F.res || {}, P.leader);
    return { own: !!r.auto, src: r.src.auto === 'party' ? 'party' : r.src.auto === 'all' ? 'all' : 'default', detail: r.auto ? `scrolls ${r.scrolls ? 'allowed' : 'not used'} · walks up to ${r.maxWalk} to a body` : '' }; },
  pauto(P, F, ctx, e) { const A = req('partyauto_api'); const k = e.pauto[0]; if (!A) return { own: null };
    const p = A.pautoEffective(F.pauto || {}, k, P.leader, P.leader), K = A.KINDS.find(x => x.key === k) || {};
    const diff = K.char ? P.members.filter(n => A.pautoEffective(F.pauto || {}, k, n, P.leader).on !== p.on) : [];
    return { own: p.on, src: p.src === 'party' ? 'party' : p.src === 'char' ? 'char' : (F.pauto && F.pauto.default && typeof F.pauto.default[k] === 'boolean') ? 'all' : 'default',
      detail: diff.length ? `${diff.join(', ')} ${diff.length === 1 ? 'has' : 'have'} it ${p.on ? 'off' : 'on'} (per character)` : '' }; },
  heal(P, F) { const own = Object.keys(obj(obj(F.heal).chars)).filter(n => P.members.some(m => lc(m) === lc(n)));
    return { own: null, detail: own.length ? `your own heal choices for ${own.join(', ')}; the rest automatic` : 'automatic for everyone (no own heal choices)' }; },
  buffs(P, F) { const p = obj(obj(obj(F.buffs).parties)[P.leader]), ch = Object.keys(obj(p.chars)).filter(n => obj(p.chars[n]).approved !== false);
    return { own: null, detail: ch.length ? `your buff plan for ${ch.join(', ')}` : 'the built-in choice (no buff plan for this party)' }; },
  tactics(P, F) { const T = obj(F.tactics), m = obj(T[P.leader]).mode || obj(T._defaults).mode || 'off';
    return { own: m !== 'off', src: obj(T[P.leader]).mode ? 'party' : 'default', detail: m === 'auto' ? 'auto: only when the party is strong enough' : m === 'on' ? 'on' : '' }; },
  leveling(P, F, ctx, e, S) { const sp = obj(obj(F.spots).spots)[P.leader]; const where = sp && sp.mode === 'manual' ? `your chosen spot: ${sp.spot || sp.dungeon || sp.region || '?'}` + (sp.kind === 'here' ? ' (hunt here)' : '') : 'the leader picks a spot for the party\'s level';
    const L = S[P.leader], act = !!(L && L.ageSec <= 120 && /autolevel|level/i.test(String(L.mode || '')));
    return { own: null, detail: where, now: L && L.ageSec <= 120 && L.task ? String(L.task).slice(0, 160) : '', active: act }; },
  hunttimer(P, F, ctx, e, S) { const t = obj(obj(F.timers).parties)[P.leader]; if (!t || !t.hours) return { own: false, src: 'default', detail: 'no timer: it hunts until you stop it' };
    const END = { town: 'go to town and wait', resupply: 'town, supplies, come back', keep: 'keep hunting' };
    const L = S[P.leader], ht = L && L.huntTimer;
    return { own: true, src: 'party', detail: `${t.hours} h at ${t.spot || 'the chosen spot'}, then ${END[t.endAction] || t.endAction}`, now: ht && ht.waitingArrival ? 'the clock starts when they arrive' : ht && ht.active && ht.leftMs != null ? `${Math.max(0, Math.round(ht.leftMs / 60000))} min left` : ht && ht.ended ? 'time is up' + (ht.result ? ': ' + ht.result : '') : '' }; },
  plan(P, F) { const p = obj(obj(F.plans).parties)[P.leader]; const n = Array.isArray(p && p.steps) ? p.steps.length : 0;
    return { own: !!(p && p.on && n), src: p ? 'party' : 'default', detail: n ? `${n} step${n === 1 ? '' : 's'}${p.name ? ' ("' + p.name + '")' : ''}${p.on ? '' : ' — "Use this plan when I press Start" is off'}` : 'no plan for this party' }; },
  routes(P, F) { const V = req('routeview_api'); const B = V ? V.RR_BUILTIN : {}; const R = obj(F.routes), o = Object.assign({}, B);
    (Array.isArray(R.rules) ? R.rules : []).forEach(r => { if (r && r.key in B && typeof r.default === typeof B[r.key]) o[r.key] = r.default; });
    const put = (x) => Object.keys(obj(x)).forEach(k => { if (k in B && typeof x[k] === typeof B[k]) o[k] = x[k]; }); put(R.defaults); const own = obj(obj(R.parties)[P.leader]); put(own);
    const nOwn = Object.keys(own).filter(k => k in B).length;
    return { own: null, detail: `move together ${o.moveTogether ? 'on' : 'off'} · swim ${o.swim ? 'allowed' : 'off'} · buy Thief Keys ${o.buyKeys ? 'on' : 'off'}${nOwn ? ` · ${nOwn} rule${nOwn === 1 ? '' : 's'} changed for this party` : ' · defaults'}` }; },
  raidhunt(P, F, ctx, e, S) { const L = S[P.leader], act = !!(L && L.ageSec <= 120 && /raid/i.test(String(L.mode || '') + ' ' + String(L.task || '')));
    return { own: null, active: act, now: act ? String(L.task || L.mode).slice(0, 160) : '' }; },
  questfarm(P, F) { const Q = obj(F.qfarm), ch = (Array.isArray(Q.chars) ? Q.chars : []).filter(n => P.members.some(m => lc(m) === lc(n)));
    return { own: !!(Q.on && ch.length), src: 'file', detail: !Q.on ? 'the quest farm is off' : ch.length ? `farming: ${ch.join(', ')}` : 'on, but nobody of this party is chosen' }; },
  pshop(P, F) { const pa = obj(F.pauto), p = obj(obj(pa.parties)[P.leader]).pshop, d = obj(pa.default).pshop;
    const on = p && typeof p.on === 'boolean' ? p.on : d && typeof d.on === 'boolean' ? d.on : false;
    return { own: on, src: p && typeof p.on === 'boolean' ? 'party' : d && typeof d.on === 'boolean' ? 'all' : 'default' }; },
  fund(P, F) { const R = obj(F.fund), p = obj(obj(R.parties)[P.leader]); const on = R.on === true;
    const last = Object.keys(obj(F.fundLog)).filter(n => P.members.includes(n)).map(n => Number(F.fundLog[n])).filter(Number.isFinite).sort((a, b) => b - a)[0];
    return { own: on && p.receive !== false, src: p.receive !== undefined ? 'party' : 'all', detail: !on ? 'adena hand-outs are off for everyone (Adena page)' : p.receive === false ? 'this party does not receive' : `in ${R.town || 'Giran'}, givers: ${obj(R.givers).mode === 'list' ? (obj(R.givers).list || []).join(', ') || 'none' : 'automatic'}`, last: last ? 'last hand-out to this party ' + ago(last) : '' }; },
  stash(P, F) { const S2 = req('storagepage_api'); if (!S2) return { own: null }; const R = obj(F.stash);
    const ef = (n) => S2.effective(R, n, P.leader, {}); const on = P.members.filter(n => ef(n).auto.v === true), e0 = ef(P.leader);
    return { own: on.length > 0, src: e0.auto.src === 'party' ? 'party' : e0.auto.src === 'character' ? 'char' : e0.auto.src === 'default' ? 'all' : 'default', detail: on.length ? `${ofMembers(on.length, P.members.length, 'store by themselves')} (${e0.dest.v} warehouse)` : '' }; },
  letters(P, F) { const L = obj(obj(F.stash).letters); const ex = (Array.isArray(L.except) ? L.except : []).map(lc); const n = P.members.filter(m => !ex.includes(lc(m))).length;
    return { own: L.on === true && n > 0, src: 'all', detail: L.on === true ? `to ${L.to === 'clanleader' || !L.to ? 'the clan leader' : L.to}${ex.length ? ' · ' + (P.members.length - n) + ' of this party excepted' : ''}` : '' }; },
  collector(P, F) { const C = obj(obj(F.stash).collector), name = C.name || 'the clan leader', mine = C.name ? P.members.some(m => lc(m) === lc(C.name)) : false;
    return { own: C.on === true, src: 'all', detail: C.on === true ? `${name} in ${C.town || 'Giran'}${mine ? ' (in this party: its party switch is ignored for these chores)' : ''}` : '' }; },
  loot(P, F) { const p = obj(obj(obj(F.loot).parties)[P.leader]); return { own: p.on === true, src: p.on !== undefined ? 'party' : 'default', detail: p.on === true ? `to ${p.to === 'clanleader' || !p.to ? 'the clan leader' : p.to}${p.mode ? ' · ' + p.mode : ''}` : '' }; },
  gear(P, F) { const G = req('gearauto_api'); if (!G) return { own: null }; const on = P.members.filter(n => G.policy(F.gear, n, P.leader).auto); const e0 = G.policy(F.gear, P.leader, P.leader);
    return { own: on.length > 0, src: /^party/.test(e0.from) ? 'party' : e0.from === 'character' ? 'char' : F.gear && typeof F.gear.default === 'boolean' ? 'all' : 'default', detail: on.length ? ofMembers(on.length, P.members.length, 'buy upgrades') : '' }; },
  classplan(P, F) { const m = obj(obj(obj(obj(F.classes).parties)[P.leader]).members); const ok = P.members.filter(n => obj(m[n]).approved === true);
    return { own: ok.length > 0, src: 'party', detail: ok.length ? ofMembers(ok.length, P.members.length, 'have an approved class plan') : 'no approved class plan: nobody changes class by itself' }; },
  soul(P, F) { const S = obj(F.soul), d = S.default || 'red', off = P.members.filter(n => (obj(S.chars)[n] || S[n] || d) === 'off');
    return { own: off.length < P.members.length, src: 'file', detail: off.length ? `${off.length} of ${P.members.length} set to "off"` : `colour ${d} unless set per character` }; },
  kamaloka(P, F, ctx) { const on = !!obj(obj(F.daily)[P.leader]).kamaloka; let last = '';
    try { const d = ctx.readJson(path.join(ctx.LOGS, `daily_${P.leader}.json`), null); if (d && d.day) { const done = Object.keys(obj(d.done)); last = done.length ? `done on ${d.day}: ${done.join(', ')}` : `nothing done on ${d.day}${Object.keys(obj(d.tries)).length ? ' (tried)' : ''}`; } } catch (e) { }
    return { own: on, src: on || obj(F.daily)[P.leader] ? 'party' : 'default', last }; },
  sevensigns(P, F) { const cfg = SSL.ssoNorm(F.ss); const enr = P.members.filter(n => SSL.ssoEnrolled(cfg, n, P.leader));
    return { own: enr.length > 0, src: (cfg.parties || []).some(x => lc(x) === lc(P.leader)) ? 'party' : enr.length ? 'char' : 'default', detail: enr.length ? (enr.length === P.members.length ? 'the whole party is enrolled' : ofMembers(enr.length, P.members.length, 'enrolled')) : 'nobody of this party is enrolled' }; },
  clan(P, F, ctx, e, S, X) { const C = req('clanauto_api'); if (!C) return { own: null }; const fl = C.flags(F.cq || {}, ctx), k = e.clan[0];
    const row = (X.clanRows || []).find(r => r.key === k || (r.sub && r.sub.key === k));
    const sub = e.clan[1] ? ` · ${e.clan[1] === 'questActivate' ? 'activate by clan level' : 'pick the next skill by itself'}: ${fl[e.clan[1]] ? 'on' : 'off'}` : '';
    return { own: !!fl[k], src: 'all', detail: (row ? row.text : '') + sub, clanLeader: X.clanLeader }; },
};

/** one entry for one party -> { key, state, own, src, why, now } */
function judge(e, P, F, ctx, S, X, partyOn) {
  const ev = e.eval && EVAL[e.eval] ? (EVAL[e.eval](P, F, ctx, e, S, X) || {}) : { own: null };
  const own = ev.own === undefined ? null : ev.own, src = SRC_TEXT[ev.src] || '';
  const detail = ev.detail ? ' · ' + ev.detail : '';
  const who = e.scope === 'clan' ? `the clan leader's party (${X.clanLeaderParty || '?'})` : 'the party';
  const gateOn = e.scope === 'clan' ? X.clanLeaderOn : partyOn;
  let state, why;
  if (e.gate === 'manual') { state = 'manual'; why = 'Never automatic — only your order does it.'; }
  else if (e.gate === 'always') {
    if (own === false) { state = 'off'; why = `Off — ${src || 'switched off'}${detail}`; }
    else { state = 'always'; why = `Always on — it does not need Start${detail}`; }
  } else if (e.gate === 'order') {
    state = ev.active ? 'on' : 'order';
    why = ev.active ? `Running now (your order)${detail}` : `Waits for your order${partyOn ? '' : ' — and the party is stopped, so press Start too'}${detail}`;
  } else if (e.gate === 'switch') {
    state = own === false ? 'off' : 'on';
    why = `${own === false ? 'Off' : 'On'} — ${src || (e.key === 'start' ? 'the party card button' : 'its own switch')}${detail}${e.key !== 'start' && own !== false ? ' (works whether the party is started or not)' : ''}`;
  } else {
    if (own === false) { state = 'off'; why = `Off — ${src || 'switched off'}${detail}${e.def === 'off' ? ' (off until you switch it on)' : ''}`; }
    else if (!gateOn) { state = 'paused'; why = `${own === true ? 'Switched on, but ' : ''}${who} is stopped — it runs once you press Start${detail}`; }
    else { state = 'on'; why = `On — ${own === true ? (src || 'switched on') + ' and ' : ''}${who} is started${detail}`; }
  }
  return { key: e.key, state, own, src: ev.src || '', why, now: ev.now || '', last: ev.last || '' };
}

function partyList(ctx) {
  try { const K = require('./kamapage_api'); const L = K.partyList(ctx); if (L && L.length) return L; } catch (e) { }
  const out = {}; (ctx.readStates() || []).forEach(c => { const p = c.party || c.name; (out[p] = out[p] || []).push(c.name); });
  return Object.keys(out).map(leader => ({ leader, names: [leader].concat(out[leader].filter(n => n !== leader)) }));
}
function overview(ctx, only, tNow) {
  const t = tNow || Date.now(), F = loadAll(ctx), S = {};
  (ctx.readStates() || []).forEach(s => { S[s.name] = s; });
  const plist = partyList(ctx).map(p => ({ leader: p.leader, members: p.names || [p.leader] }));
  const X = { clanRows: [], clanLeader: '', clanLeaderParty: '', clanLeaderOn: false };
  try { const C = req('clanauto_api'); if (C) { const st = C.status(ctx); X.clanRows = st.rows || []; X.clanLeader = st.leader || ''; } } catch (e) { }
  { const P = plist.find(p => p.members.some(m => lc(m) === lc(X.clanLeader))); X.clanLeaderParty = P ? P.leader : X.clanLeader;
    const R = req('runstate_api'); X.clanLeaderOn = !!(R && P && R.runEffective(F.run || {}, X.clanLeader, P.leader).on); }
  const R = req('runstate_api');
  const parties = plist.filter(p => !only || lc(p.leader) === lc(only)).map(P => {
    const run = R ? R.runEffective(F.run || {}, P.leader, P.leader) : { on: false };
    const L = S[P.leader];
    // the Seven Signs line (catacombs / necropolises) in the bot's own words
    let sevenSigns = null;
    try {
      const spot = obj(obj(F.spots).spots)[P.leader], consent = !!(spot && spot.mode === 'manual' && /necropolis|catacomb/i.test(String(spot.dungeon || spot.spot || spot.rooms || '')));
      const mem = P.members.map(n => { let rec = {}; try { rec = (/^[A-Za-z0-9_\-]+$/.test(n) && ctx.readJson(path.join(ctx.LOGS, `sevensigns_${n}.json`), null)) || {}; } catch (e) { } const s = S[n] || {}; return { name: n, rec, classId: s.classId != null ? Number(s.classId) : rec.classId != null ? Number(rec.classId) : null }; });
      const one = (kind) => { const g = SSL.partyGate({ state: F.ssState || {}, members: mem, party: P.leader, kind, optin: F.ss, consent, t }); return { state: g.state, ok: !!g.ok, reason: g.reason }; };
      const c = one('catacomb'), n = one('necropolis'); sevenSigns = { catacomb: c, necropolis: n, same: c.reason === n.reason };
    } catch (e) { }
    const items = CAT.ENTRIES.map(e => { try { return judge(e, P, F, ctx, S, X, !!run.on); } catch (er) { return { key: e.key, state: 'off', own: null, why: 'could not be read: ' + er.message, now: '' }; } });
    const ss = items.find(i => i.key === 'sevensigns'); if (ss && sevenSigns) ss.now = 'Catacombs / necropolises: ' + sevenSigns.catacomb.reason;
    return { leader: P.leader, members: P.members, online: !!(L && L.ageSec <= 120), started: !!run.on, startWhy: run.why || '', now: L && L.ageSec <= 120 ? String(L.task || L.mode || '').slice(0, 160) : '', sevenSigns, items };
  });
  return { at: new Date(t).toISOString(), groups: CAT.GROUPS, clanLeader: X.clanLeader, clanLeaderParty: X.clanLeaderParty, parties };
}

async function handle(req2, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p)))); return true; }
  if (p !== '/api/autooverview') return false;
  if (!ctx.allowed(req2, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req2.method !== 'GET') { ctx.json(res, 405, { error: 'GET only (read-only overview; every switch keeps its own page)' }); return true; }
  try { ctx.json(res, 200, overview(ctx, url.searchParams.get('party') || '')); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, overview, judge, EVAL, loadAll, SRC_TEXT };
