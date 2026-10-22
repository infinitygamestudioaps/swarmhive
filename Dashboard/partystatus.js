// PARTY STATUS on the Parties tab (user 2026-10-09 11:15: "Under /parties it is sooo hard to see what is going on; for the user they are 'just'
// standing still. I don't know who is trading with who and what the status is. Make it more user-friendly.")
//  1. BANNER at the top of each party card: one plain sentence + a step bar for what the PARTY does right now and why, the time the step
//     has taken (warning colour when it takes unusually long, with the reason when known: "waiting for Chanter4 (1.2k away)"), what comes next.
//  2. MEMBER ROWS: the shared plain-words activity line (Dashboard/activity.js) with an icon instead of the raw task text ("trade <-",
//     "regroup"), trades with both sides + what + where they stand, a "stuck N s" / "no progress" chip.
//  3. PARTY MAP: an animated line giver -> receiver for every trade in progress (an arc when they stand on the same spot).
// Data: /api/state chars (every 4 s). Best with the swarm.js of 2026-10-09 (partyStatus on the leader, trade, teamStep on everyone); with an
// older script everything falls back to what the task / intent texts tell (trade partner found by the opposite task).
// Hooks in index.html: renderParties (banner), memberRow (task cell), partyMap (trade lines). Uses index.html globals: esc, GI, UI, km, STATE,
// PMOBS, niceTask, intentText.
(function () {
  'use strict';
  const AC = () => window.Activity;
  const PS = { ref: null, seen: {} };
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const kmS = (d) => { try { return km(d); } catch (e) { return String(Math.round(d)); } };
  /** once per /api/state answer: server clock skew + the "not moving" watch */
  function sync() {
    const A = AC(); if (!A || typeof STATE === 'undefined' || !STATE || STATE === PS.ref) return;
    PS.ref = STATE;
    if (STATE.now) A.setSkew(Date.parse(STATE.now) - Date.now());
    A.track(STATE.chars || []);
  }
  const charsOf = (party) => ((typeof STATE !== 'undefined' && STATE && STATE.chars) || []).filter(c => c.party === party);
  const ctx = (party, list) => ({ members: list || charsOf(party), leader: party, all: (STATE && STATE.chars) || [] });
  const byName = (n) => ((STATE && STATE.chars) || []).find(c => c.name === n) || null;

  // ------------------------------------------------------------------ words for the steps swarm.js reports -------------------------
  const STEP_TXT = {
    'regroup in Giran': 'regrouping in Giran', 'collect needs': 'everyone reports what it needs', 'buy at Helvetia': 'buying at Helvetia (grocer)',
    'hand out': 'handing out', enchant: 'enchanting gear', 'unload loot': 'unloading loot to a teammate', 'members sell': 'members sell at Helvetia, one after another',
    'gear upgrades': 'gear upgrades in the shops', dyes: 'dyes and symbols', 'collect adena': 'collecting adena above their keep',
    'teleport to Giran': 'teleporting to Giran', 'walk to the start': 'walking to the Giran start', gather: 'gathering the team', supplies: 'supply run',
    'fund other teams': 'handing adena to other teams', 'seven signs': 'Seven Signs sign-up', teleport: 'teleporting', walk: 'walking to the area',
    'walking to the Giran start': 'walking to the Giran start', 'handing out': 'handing out', 'ask who has adena': 'asking who has adena', 'hand over': 'handing adena over',
  };
  const stepTxt = (s) => STEP_TXT[s] || String(s || '');
  // a step that takes long by nature gets more time before the banner warns (seconds)
  const STEP_LIMIT = { 'members sell': 600, 'gear upgrades': 900, dyes: 600, enchant: 360, walk: 420, 'buy at Helvetia': 300, 'teleport to Giran': 240, teleport: 300, supplies: 1200, 'regroup in Giran': 900 };
  function regroupWhy(label) {
    const l = String(label || ''); let m;
    if ((m = l.match(/next hunting spot: (.+)$/))) return { h: ` before going to <b>${esc(m[1])}</b>`, dest: m[1] };
    if (/^supplies/.test(l)) return { h: ' for a supply run' };
    if (/^leveling/.test(l)) return { h: ' to start leveling' };
    if (/team split/.test(l)) return { h: ': the team got split up' };
    if (/fund/.test(l)) return { h: ' for a fund round' };
    return { h: l ? ` (${esc(l)})` : '' };
  }
  /** "waiting for B 1200, C dead" -> names with distance (from the leader when the text has none) */
  function holdText(msg) { try { return AC().whoList(String(msg || '').replace(/^waiting for /, 'waiting for ')); } catch (e) { return esc(msg); } }
  function namesWithDist(names, L) {
    return names.map(n => { const c = byName(n); if (!c) return `<b>${esc(n)}</b>`; if (c.dead) return `<b>${esc(n)}</b> (dead)`; if (!AC().live(c)) return `<b>${esc(n)}</b> (offline)`;
      const d = L && isFinite(c.x) && isFinite(L.x) ? Math.hypot(c.x - L.x, c.y - L.y) : null; return `<b>${esc(n)}</b>${d != null && d > 300 ? ' (' + kmS(d) + ' away)' : ''}`; }).join(', ');
  }
  /** every trade in progress (or just ended) in this party, one per giver -> receiver */
  function tradesOf(list, d) {
    const A = AC(), out = [], seen = {};
    list.forEach(c => {
      if (!A.live(c)) return;
      const tr = A.tradeOf(c, d); if (!tr || !tr.giver || !tr.receiver) return;
      const k = tr.giver + '>' + tr.receiver; if (seen[k]) { if (!seen[k].what && tr.what) Object.assign(seen[k], { what: tr.what }); return; }
      seen[k] = tr; out.push(tr);
    });
    return out;
  }
  function tradeSub(tr) {
    const A = AC(), age = tr.stageAt ? A.srvNow() - tr.stageAt : 0;
    if (tr.legacy) return `${GI(UI.trade, 'sm')} Trade: <b>${esc(tr.giver || '?')}</b> → <b>${esc(tr.receiver || '?')}</b>`;
    return `${GI(UI.trade, 'sm')} Trade: <b>${esc(tr.giver)}</b> → <b>${esc(tr.receiver)}</b>${tr.what ? ' · ' + esc(tr.what) : ''}${tr.fund ? ' (fund round)' : ''} · ` +
      `<span class="${tr.failed ? 'bad' : tr.done ? 'ok' : ''}">${A.stageText(tr, 'give', tr.receiver)}</span>${!tr.done && !tr.failed && age > 10000 ? ' <span class="muted">· ' + A.dur(age) + '</span>' : ''}` + stageDots(tr);
  }
  function stageDots(tr) {
    if (tr.legacy) return '';
    const S = ['asking', 'open', 'confirm', 'done'], cur = tr.failed ? -1 : tr.done ? 3 : Math.max(0, S.indexOf(tr.stage === 'waiting' || tr.stage === 'walking' ? 'asking' : tr.stage));
    return ` <span class="ps-dots" title="ask → window open → confirm → done">${S.map((s, i) => `<i class="${tr.failed ? 'bad' : i < cur ? 'done' : i === cur ? (tr.done ? 'done' : 'now') : ''}"></i>`).join('')}</span>`;
  }

  // ------------------------------------------------------------------ the party sentence ----------------------------------------------
  function info(leader, list) {
    const A = AC(); if (!A) return null;
    const now = A.srvNow(), d = ctx(leader, list);
    const L = list.find(c => c.name === leader) || list.find(c => c.leader) || list[0];
    if (!L) return null;
    const o = { ic: UI.party, cls: '', h: '', steps: null, i: 0, of: 0, stepAt: 0, since: 0, subs: [], why: '', next: '', limit: 180, key: '' };
    if (!A.live(L)) {   // PCOVERVIEW-2026-10-22: 'offline for 11 min' (the banner showed 'NaNhNaN': no step age on this early return)
      const off = L.ageSec != null && isFinite(+L.ageSec) ? +L.ageSec * 1000 : null, down = list.filter(c => !A.live(c)).length;
      o.ic = UI.idle; o.cls = 'bad'; o.key = 'off'; o.age = off != null ? off : 0; o.offline = true;
      o.h = `Leader <b>${esc(L.name)}</b> is not reporting${off != null ? ' for ' + A.dur(off) : ''} — offline or its script stopped${down > 1 ? ` (${down} of ${list.length} in the party)` : ''}`;
      return o;
    }
    const t = String(L.task || ''), ps = L.partyStatus || null;
    const trades = tradesOf(list, d);
    let m;
    // raids / missions / instances / sieges first (they report through the live raid view)
    if (/^(raid|kamaloka|instance|siege|joint raid)\b/.test(t) || /^(raid|prep|mission|raidclear)$/.test(L.mode || '')) {
      o.ic = UI.raid;
      if ((m = t.match(/^raid (.+?): clearing — (.+?) \((\d+) left/))) o.h = `Raid: <b>${esc(m[1])}</b> — clearing the area (${m[3]} left, now ${esc(m[2])})`;
      else if ((m = t.match(/^raid: (.+?) (\d+)%$/))) o.h = `Raid: <b>${esc(m[1])}</b> at ${m[2]}% HP`;
      else o.h = esc(niceTask(t)).replace(/^(\w)/, (x) => x.toUpperCase());
      o.key = 'raid:' + t.replace(/\d+/g, '');
    } else if (ps && ps.what) {
      o.steps = Array.isArray(ps.steps) && ps.steps.length ? ps.steps : null; o.i = +ps.i || 0; o.of = o.steps ? o.steps.length : 0;
      o.stepAt = A.T(ps.stepAt); o.since = A.T(ps.since); o.limit = STEP_LIMIT[ps.step] || 180;
      const prog = ps.m ? ` (${ps.n || 0}/${ps.m} done${ps.cur ? ', now <b>' + esc(ps.cur) + '</b>' : ''})` : '';
      const stepPart = () => `${o.steps ? 'step ' + (o.i + 1) + '/' + o.of + ': ' : ''}<b>${esc(stepTxt(ps.step))}</b>${ps.info ? ' — ' + esc(ps.info) : ''}${prog}`;
      const par = ps.parent || null;
      if (ps.what === 'supply') {
        o.ic = UI.inv;
        o.h = (par && par.what === 'regroup' ? 'Regrouping in Giran' + regroupWhy(par.label).h + ' — supply run '
          : par && par.what === 'travel' ? `On the way to <b>${esc(par.label)}</b> — supply run ` : 'Supply run in Giran — ') + stepPart();
      } else if (ps.what === 'regroup') {
        o.ic = UI.party;
        o.h = 'Regrouping in Giran' + regroupWhy(ps.label).h + ' — ' + stepPart();
      } else if (ps.what === 'fund') {
        o.ic = UI.adena; o.limit = 150;
        o.h = `Fund round: <b>${esc(L.name)}</b> gives adena to characters below their target` +
          (ps.m ? ` (${ps.n || 0} of ${ps.m} done${ps.cur ? `, waiting for <b>${esc(ps.cur)}</b> to accept` : ''})` : '') + (ps.step && ps.step !== 'handing out' ? ' — ' + esc(stepTxt(ps.step)) : '');
        if (ps.away && ps.away.length) o.subs.push(`${GI(UI.idle, 'sm')} not at the Giran start yet: ${namesWithDist(ps.away, L)}`);
      } else if (ps.what === 'collect') {
        o.ic = UI.adena;
        o.h = `Collecting adena: members hand what is above their keep to <b>${esc(L.name)}</b> — ` + stepPart();
      } else if (ps.what === 'travel') {
        o.ic = UI.map;
        o.h = `Travelling to <b>${esc(ps.label)}</b> — ` + stepPart();
      } else { o.h = esc(ps.what) + (ps.step ? ' — ' + esc(stepTxt(ps.step)) : ''); }
      // what comes next
      if (o.steps && o.i + 1 < o.of) o.next = stepTxt(o.steps[o.i + 1]);
      else { const rw = regroupWhy(ps.what === 'regroup' ? ps.label : par && par.what === 'regroup' ? par.label : ''); if (rw.dest) o.next = 'teleport to ' + rw.dest; else if (ps.what === 'travel') o.next = 'hunting there'; else if (par) o.next = 'back to: ' + stepTxt(par.step || par.what); }
      o.key = 'ps:' + ps.what + ':' + ps.step;
      // the running team step (who is it waiting for)
      const ts = ps.ts;
      if (ts && ts.a && !/^trade#/.test(ts.a) && ts.m) {
        const pend = (ts.pending || []).filter(n => n !== L.name);
        o.subs.push(`${GI(UI.party, 'sm')} Team step <b>${esc(A.stepLabel(ts.a))}</b>: ${ts.n}/${ts.m} ready${pend.length ? ' — waiting for ' + namesWithDist(pend, L) : ''}`);
        if (pend.length && now - A.T(ts.at) > 60000) o.why = o.why || 'waiting for ' + namesWithDist(pend, L);
      }
    } else {
      // an older swarm.js (no partyStatus) or nothing team-wide going on: tell it from the leader's task / intent / zone
      const D = L.doing || {}, ie = L.intent || null, ieAge = ie ? now - A.T(ie.at) : 1e9;
      const inStep = list.filter(c => A.live(c) && /^regroup:?\s*$/.test(String(c.task || ''))).length;
      if ((m = t.match(/^waiting for orders since (\d\d:\d\d)(.*)$/i))) { o.ic = UI.idle; o.h = `Waiting for orders since <b>${m[1]}</b>${esc(m[2] || '')}`; o.key = 'pause'; }
      else if (trades.length) { o.ic = UI.trade; o.h = `Trading in town: <b>${esc(trades[0].giver || '?')}</b> → <b>${esc(trades[0].receiver || '?')}</b>${trades.length > 1 ? ` (+${trades.length - 1} more)` : ''}${inStep ? ` — ${inStep} member${inStep > 1 ? 's wait' : ' waits'} for their turn` : ''}`; o.key = 'trade:' + trades.map(x => x.giver + x.receiver).join(); }
      else if (inStep >= Math.max(2, Math.ceil(list.length / 2))) { o.ic = UI.party; o.h = `Team task led by <b>${esc(L.name)}</b> — ${inStep} members wait for the next step`; o.key = 'step'; }
      else if ((m = t.match(/^before (.+?): (.*)$/))) { o.ic = UI.map; o.h = `Getting ready to teleport to <b>${esc(m[1])}</b>: ${esc(m[2])}`; o.key = 'before:' + m[1]; }
      else if ((m = t.match(/^waiting for team: (.*)$/))) { o.ic = UI.party; o.h = `Waiting for the team: ${holdText(m[1])}`; o.key = 'gather'; }
      else if ((m = t.match(/^leading team: waiting at \S+ for (.*)$/))) { o.ic = UI.party; o.h = `Waiting at a checkpoint for ${holdText(m[1])}`; o.key = 'checkpoint'; }
      else if (L.route && Array.isArray(L.route.pts) && A.route(L) && !A.route(L).done) { const r = A.route(L); o.ic = UI.run; o.h = `Travelling: walking to <b>${esc(r.label || 'the goal')}</b> (${kmS(r.left)} left)`; o.key = 'route:' + r.label; }
      else if (ie && !ie.result && ieAge < 90000 && /^(teleport|teleport-near|town|lead team|walk|regroup)$/.test(ie.action) && !D.target) { o.ic = UI.map; o.h = 'Travelling — ' + esc(intentText(ie)); o.key = 'travel:' + ie.action; }
      else if (D.autolevel && L.zone) {
        const z = L.zone, mu = z.multi && Array.isArray(z.multi.list) ? z.multi : null, cur = mu ? mu.list.find(x => x.current) : null;
        let n = cur && cur.live != null ? +cur.live : null;
        if (n == null) { try { const P = PMOBS[leader]; if (P && P.mobs) { const R = Math.max(1500, +L.combatRange || 0); n = P.mobs.filter(mm => !mm.raid && Math.hypot(mm.x - L.x, mm.y - L.y) < R).length; } } catch (e) { } }
        const spot = String(D.autolevel.spot || z.name || '');
        o.ic = UI.attack;
        o.h = `Hunting <b>${esc(spot)}</b>` + (n != null ? ` · ${n} monster${n === 1 ? '' : 's'} here` : '') + (mu && mu.list.length > 1 ? ` · rotating ${mu.list.length} ${mu.kind === 'field' ? 'areas' : 'rooms'}` : '') +
          (D.autolevel.kills5m != null ? ` · ${D.autolevel.kills5m} kills in 5 min` : '');
        o.key = 'hunt:' + spot;
      } else { const a = A.member(L, d); o.ic = a.ic || UI.idle; o.h = `Leader <b>${esc(L.name)}</b>: ${a.h}`; o.key = 'lead:' + String(a.h).replace(/\d+/g, '').slice(0, 60); }
    }
    // trades as their own lines (both sides, what, where they stand)
    trades.filter((tr, i) => !(o.key.startsWith('trade:') && tr.legacy && i === 0)).slice(0, 2).forEach(tr => o.subs.push(tradeSub(tr)));   // (an old script's trade already in the sentence: no repeat)
    if (trades.length > 2) o.subs.push(`<span class="muted">+${trades.length - 2} more trades</span>`);
    // the leader waits for someone (gather / checkpoint / before a teleport)
    if (ps && ps.hold && now - A.T(ps.hold.at) < 25000) {
      const hm = holdText(ps.hold.msg);
      o.holdSub = o.subs.length;
      o.subs.push(`${GI(UI.idle, 'sm')} ${hm.charAt(0).toUpperCase() + hm.slice(1)}${ps.hold.why ? ' <span class="muted">(' + esc(ps.hold.why) + ')</span>' : ''}`);
      if (/waiting for/.test(ps.hold.msg) && !o.why) { o.why = hm; o.whyIsHold = true; }
    }
    // elapsed: the step's own clock (new swarm.js), else since the dashboard first saw this state
    if (!o.stepAt) {
      const s = PS.seen[leader]; if (!s || s.key !== o.key) PS.seen[leader] = { key: o.key, at: Date.now() };
      o.stepAt = PS.seen[leader].at + A.skew; o.estimated = true;
    }
    const age = now - o.stepAt;
    o.age = age;
    const quiet = /^(hunt|pause|off|raid)/.test(o.key);                    // hunting / waiting for orders never "takes too long"
    if (!quiet && age > o.limit * 1000) {
      o.warn = true;
      if (o.whyIsHold && o.holdSub != null) o.subs.splice(o.holdSub, 1);   // the warning line says it already
      if (!o.why) {
        const stuckOnes = list.filter(c => A.stuck(c)).map(c => c.name);
        const tr = trades.find(x => !x.done && !x.failed && x.stageAt && now - x.stageAt > 45000);
        o.why = tr ? `trade ${esc(tr.giver)} → ${esc(tr.receiver)} stays at "${A.stageText(tr, 'give', tr.receiver)}"` : stuckOnes.length ? 'not moving: ' + namesWithDist(stuckOnes, L) : 'taking longer than usual';
      }
    }
    return o;
  }

  // RAIDROUTES-2026-10-13: the leader's ROUTE STATE MACHINE (swarm.js ROUTESM, swarm_state routeSM) as ONE fixed-height line on the party card:
  // state + step x/n + what the step is (swim / drop / door / floor ...); red when BLOCKED / FAILED, kept 10 min after the end. Tap = the route view.
  const RS_WORDS = { TRAVEL_TOWN: 'to the town', GK_TELEPORT: 'gatekeeper', BUY_KEY: 'buying keys', WALK_LEG: 'walking', SWIM_LEG: 'swimming', DROP: 'drop off a ledge', DOOR_WAIT: 'timed door', DOOR_OPEN_NPC: 'door (NPC)', DOOR_OPEN_SKILL: 'door (Unlock)', DOOR_OPEN_ITEM: 'door (key)', FLOOR_TELEPORT: 'floor teleport', ENTER: 'entering', MANUAL: 'by hand', ARRIVED: 'arrived', BLOCKED: 'blocked', FAILED: 'failed', START: 'starting' };
  function routeLine(leader) {
    try {
      const L = byName(leader), m = L && L.routeSM, mt = L && L.moveTogether;   // MOVETOGETHER-2026-10-13: the team walk ('point i/N · waiting for A, B (stuck: ...)')
      const mtTxt = mt && mt.line && ((AC() && AC().srvNow) ? AC().srvNow() : Date.now()) - (mt.at || 0) < 60000 ? mt.line : '';
      if ((!m || !m.state) && mtTxt) return `<span class="psb-route" title="${esc((mt.label || '') + ': ' + mtTxt)}">together to ${esc(mt.label || '')} · ${esc(mtTxt)}</span>`;
      if (!m || !m.state) return '';
      const now = (AC() && AC().srvNow) ? AC().srvNow() : Date.now();
      if (m.final && now - (m.at || 0) > 600000) return '';
      const bad = m.state === 'BLOCKED' || m.state === 'FAILED', ok = m.state === 'ARRIVED';
      const key = String(m.key || ''), href = /^raid:\d+$/.test(key) ? '#/raid/' + key.split(':')[1] + '/route' : '#/navatlas/' + encodeURIComponent(key);
      const txt = `route ${esc(m.name || key)} · <b>${esc(m.state)}</b> ${esc(RS_WORDS[m.state] || '')}${m.sub ? ' (' + esc(m.sub) + ')' : ''} · ${(m.i || 0) + 1}/${m.n || '?'} ${esc(m.label || '')}${bad && m.why ? ' — ' + esc(m.why) : ''}${mtTxt && !m.final ? ' · ' + esc(mtTxt) : ''}`;
      return `<a class="psb-route${bad ? ' bad' : ok ? ' ok' : ''}" href="${href}" title="${esc((m.name || '') + ': ' + (m.state || '') + ' ' + (m.label || '') + (m.why ? ' — ' + m.why : ''))}">${txt}</a>`;
    } catch (e) { return ''; }
  }
  function banner(leader, list) {
    try {
      sync();
      if (!AC()) return '';
      const o = info(leader, list || charsOf(leader)); if (!o) return routeLine(leader);
      const A = AC();
      const bar = o.steps ? `<div class="psb-bar" role="img" aria-label="step ${o.i + 1} of ${o.of}">${o.steps.map((s, k) => `<i class="${k < o.i ? 'done' : k === o.i ? 'now' : ''}" title="${esc(stepTxt(s))}"></i>`).join('')}</div>` : '';
      const meta = [];
      if (o.steps) meta.push(`step ${o.i + 1}/${o.of}`);
      if (o.next) meta.push('next: ' + esc(o.next));
      if (o.since && o.since !== o.stepAt) meta.push('started ' + A.dur(A.srvNow() - o.since) + ' ago');
      const ageTxt = o.offline || o.age == null || !isFinite(+o.age) ? '' : (o.estimated ? '≥ ' : '') + A.dur(o.age);   // PCOVERVIEW: never 'NaNhNaN'
      return `<div class="psb ${o.cls || ''}${o.warn ? ' warn' : ''}" data-psb="${esc(leader)}">
        <div class="psb-h">${GI(o.ic || UI.party, 'sm')}<div class="psb-t">${o.h}</div><span class="psb-age" title="${o.estimated ? 'seen by the dashboard for at least this long' : 'this step has taken'}">${ageTxt}</span></div>
        ${bar}${meta.length ? `<div class="psb-meta">${meta.join(' · ')}</div>` : ''}${routeLine(leader)}
        ${o.subs.map(s => `<div class="psb-sub">${s}</div>`).join('')}
        ${o.warn ? `<div class="psb-why">${GI(UI.warn, 'sm')} <span>${o.why} — for ${A.dur(o.age)}</span></div>` : ''}
      </div>`;
    } catch (e) { return ''; }
  }

  // ------------------------------------------------------------------ member row: the activity line + chips -------------------------
  // o.split (PARTY LAYOUT 2026-10-13): { html, chips } — the warning chips go to their own slot of the member row instead of the task text
  function taskCell(c, o) {
    try {
      sync();
      const A = AC(); if (!A) return null;
      const d = ctx(c.party), a = A.member(c, d), now = A.srvNow();
      const chips = [];
      const st = A.stuck(c);
      if (st) chips.push(`<span class="chip ps-stuck${st.hard ? ' hard' : ''}" title="${st.hard ? 'its route walker reports it is stuck' : 'it should be walking but has not moved'}">${st.hard ? 'stuck' : 'not moving'} ${st.sec != null ? A.dur(st.sec * 1000) : ''}</span>`);
      const tr = a.trade;
      if (tr && !tr.legacy && !tr.done && !tr.failed && tr.stageAt && now - tr.stageAt > 45000) chips.push(`<span class="chip ps-stuck" title="the trade has not moved on">no progress ${A.dur(now - tr.stageAt)}</span>`);
      const ts = a.step;
      if (ts && !ts.done && !ts.wait && now - ts.atT > 180000) chips.push(`<span class="chip ps-stuck" title="this team step is taking long">step ${A.dur(now - ts.atT)}</span>`);
      const html = `<div class="task ps-act ${a.cls || ''}${tr ? ' trading' : ''}" title="${esc(String(c.task || ''))}">${GI(a.ic || UI.idle, 'sm')}<span class="ps-txt">${a.h}${tr ? stageDots(tr) : ''}</span>${o && o.split ? '' : chips.join('')}</div>`;
      return o && o.split ? { html, chips: chips.join('') } : html;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------------ party map: giver -> receiver lines ------------------------------
  function mapLayer(leader, list, u) {
    try {
      sync();
      const A = AC(); if (!A) return '';
      const trades = tradesOf(list, ctx(leader, list)), still = reduced();
      let s = '', k = 0;
      trades.forEach(tr => {
        const g = byName(tr.giver), r = byName(tr.receiver);
        if (!g || !r || !isFinite(g.x) || !isFinite(r.x)) return;
        const dx = r.x - g.x, dy = r.y - g.y, D = Math.hypot(dx, dy);
        let path, ax, ay;
        if (D < 30 * u) {                                         // standing on the same spot (Giran start): a loop above them
          const h = 46 * u + k * 26 * u, w = 16 * u;
          path = `M${g.x - w} ${g.y} C ${g.x - w} ${g.y - h}, ${r.x + w} ${r.y - h}, ${r.x + w} ${r.y}`;
          ax = (g.x + r.x) / 2; ay = Math.min(g.y, r.y) - h * 0.75;
        } else {
          const b = Math.max(24 * u, D * 0.22) * (k % 2 ? -1 : 1), mx = (g.x + r.x) / 2 - dy / D * b, my = (g.y + r.y) / 2 + dx / D * b;
          path = `M${g.x} ${g.y} Q ${mx} ${my} ${r.x} ${r.y}`;
          ax = (g.x + r.x) / 4 + mx / 2; ay = (g.y + r.y) / 4 + my / 2;
        }
        const col = tr.failed ? '#ff6b5a' : tr.done ? '#7be0a0' : '#ffd34d', run = !tr.done && !tr.failed;
        const dash = `${7 * u} ${5 * u}`;
        s += `<path class="ps-tline" d="${path}" fill="none" stroke="#000" stroke-width="${4.2 * u}" opacity=".45" stroke-linecap="round"/>`;
        s += `<path class="ps-tline" d="${path}" fill="none" stroke="${col}" stroke-width="${2.2 * u}" stroke-dasharray="${dash}" stroke-linecap="round">${run && !still ? `<animate attributeName="stroke-dashoffset" from="0" to="${-12 * u}" dur="0.9s" repeatCount="indefinite"/>` : ''}</path>`;
        // direction: a dot travelling giver -> receiver (static at the receiver end with reduced motion)
        if (run && !still) s += `<circle r="${3.4 * u}" fill="${col}" stroke="#000" stroke-width="${0.8 * u}"><animateMotion dur="1.8s" repeatCount="indefinite" path="${path}"/></circle>`;
        else s += `<circle cx="${r.x + (D < 30 * u ? 16 * u : 0)}" cy="${r.y}" r="${3.4 * u}" fill="${col}" stroke="#000" stroke-width="${0.8 * u}"/>`;
        const lab = `${tr.giver} → ${tr.receiver}${tr.what ? ': ' + tr.what : ''}${tr.done ? ' ✓' : tr.failed ? ' ✗' : ''}`;
        s += `<text x="${ax}" y="${ay}" text-anchor="middle" font-size="${9.5 * u}" fill="${col}" paint-order="stroke" stroke="#000" stroke-width="${3 * u}" stroke-linejoin="round">${esc(lab.length > 48 ? lab.slice(0, 46) + '…' : lab)}</text>`;
        k++;
      });
      return s;
    } catch (e) { return ''; }
  }

  window.PartyStatus = { banner, taskCell, mapLayer, info, routeLine, _PS: PS };
  try { if (typeof TAB !== 'undefined' && TAB === 'parties' && STATE) renderParties(); } catch (e) { }   // at once, not only after the next 4 s refresh
})();
