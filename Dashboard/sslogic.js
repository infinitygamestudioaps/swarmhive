// SEVEN SIGNS gate — shared logic for node (Dashboard/sevensigns_api.js, Dashboard/autooverview_api.js, the tests) and the browser (window.SSLogic).
// SSREASON-2026-10-15 (tester l3tal: "bots can't get back to necropolises and catacombs they went to before"): the dashboard must say WHY a
// catacomb / necropolis is closed with the bot's own words. The functions between COPY-BEGIN and COPY-END are 1:1 copies of Scripts_dev/swarm.js
// SSGATE-PURE (ssgWeek … ssgReason) and SSOPTIN-PURE (ssoNorm, ssoEnrolled, ssoGate); Dashboard/index.html SSGATE-UI has the same SSGATE ones.
// docs/plan/tools/test_seven_signs_reasons.js fails when any copy differs. Edit swarm.js first, then copy the function here and into index.html.
// partyGate() below = the dashboard side of swarm.js ssTeamAllowed (records from Logs/sevensigns_<name>.json, the period from sevensigns_state.json).
(function (root) {
  'use strict';
  // COPY-BEGIN
  function ssgWeek(t, h) { return Math.floor((t - 4 * 864e5 - h * 3600e3) / (7 * 864e5)); }
  function ssgCycleOf(period, t, h) { const w = ssgWeek(t, h) - (period === 'validation' || period === 'results' ? 1 : 0); return new Date(w * 7 * 864e5 + 4 * 864e5).toISOString().slice(0, 10); }
  function ssgNextChange(t, h) { return (ssgWeek(t, h) + 1) * 7 * 864e5 + 4 * 864e5 + h * 3600e3; }
  function ssgNow(s, t, h, everyMs) {
    s = s || {};
    if (!s.checkedAt || !/^(competition|validation)$/.test(s.period || '')) return { period: s.period || 'unknown', winner: 'unknown', cycle: s.period && s.period !== 'unknown' ? ssgCycleOf(s.period, t, h) : null, stale: true, nextChange: ssgNextChange(t, h) };
    const k = ssgWeek(t, h) - ssgWeek(s.checkedAt, h);
    let period = s.period, winner = s.winner || 'unknown';
    if (Math.abs(k) % 2 === 1) { period = s.period === 'competition' ? 'validation' : 'competition'; winner = 'unknown'; }
    else if (k > 0) winner = 'unknown';                                       // a later validation period: its winner is not known yet
    return { period, winner: period === 'validation' ? winner : '', cycle: ssgCycleOf(period, t, h), stale: k > 0 || t - s.checkedAt > everyMs, nextChange: ssgNextChange(t, h) };
  }
  function ssgSide(r, cycle) { r = r || {}; return r.cycle && r.cycle === cycle ? (/^(signed|member)$/.test(r.status || '') ? 'dawn' : r.status === 'dusk' ? 'dusk' : '') : ''; }
  function ssgOne(cur, m, kind, o) {
    o = o || {}; const r = m.rec || {}, side = ssgSide(r, cur.cycle), n = m.name;
    const R = (state, why, until, code) => ({ ok: state === 'enter', state, why, side, name: n, until: until || 0, code: code || state });   // SSREASON: code = which rule (ssgReason)
    if (m.base) return R('closed', `${n} has no 1st class transfer yet: cannot join the Seven Signs, so no catacombs/necropolises`, 0, 'base');
    const dn = r.denied;
    if (dn && dn.cycle === cur.cycle && dn.period === cur.period && (!kind || !dn.kind || dn.kind === kind)) return R('closed', `the Ziggurat refused ${n} this period (${dn.dungeon || '?'}: ${String(dn.why || '').slice(0, 80)})`, cur.nextChange, 'denied');
    if (!cur.period || cur.period === 'unknown') return R('check', 'the Seven Signs period is not known yet — the Priest of Dawn has to be read first', 0, 'unknown');
    if (cur.period === 'recruiting' || cur.period === 'results') return R('check', `the 15-min ${cur.period} break of the Seven Signs — read the Priest of Dawn again`, 0, 'break');
    if (cur.period === 'competition') {
      if (side) return R('enter', `competition period: ${n} is signed up (${side})`, 0, 'signed');
      if (r.cycle === cur.cycle && r.status === 'fee') return R('closed', `${n}: the Priest of Dawn asked for a fee/item this cycle (not paid: Dawn is free on L2Toggle — see Logs/dawn.log)`, cur.nextChange, 'fee');
      if (r.cycle === cur.cycle && (r.tries || 0) >= (o.maxTries || 3)) return R('closed', `${n}: the Dawn sign-up failed ${r.tries} times this cycle (${r.status || '?'})`, cur.nextChange, 'tries');
      return R('signup', `competition period: ${n} is not signed up yet`);
    }
    // seal validation: nobody can sign up now
    if (!side) return R('closed', `seal validation period: ${n} was not signed up in the last competition (nobody can sign up before the next competition)`, cur.nextChange, 'notsigned');
    if (cur.winner === 'dawn' || cur.winner === 'dusk') return side === cur.winner ? R('enter', `seal validation period: ${cur.winner} won and ${n} is ${side}`, 0, 'winner') : R('closed', `seal validation period: only the winners (${cur.winner}) may enter — ${n} is ${side}`, cur.nextChange, 'loser');
    return R('enter', `seal validation period (${cur.winner === 'none' ? 'no decisive winner' : 'winner not read yet'}); ${n} is ${side}`, 0, 'nowinner');
  }
  function ssGateDecide(cur, members, kind, o) {
    o = o || {};
    if (o.enabled === false) return { state: 'enter', ok: true, why: 'the Seven Signs check is off (CONFIG.sevenSigns.blockDungeons)', until: 0, need: [], who: [], code: 'off' };
    // TRY MODE (2026-10-13, tester: 'it says I need to sign with the Priest of Dawn but the party fails, yet I can manually teleport into the catacombs'):
    // L2Toggle lets characters that are NOT signed up through the Ziggurat (seen 2026-10-07 with Dagger1 too). o.mode 'try' = go and let the
    // Ziggurat decide; only a refusal it really gave this period (rec.denied, ssMarkDenied) closes it until the period change. No mode = the old rule.
    if (o.mode === 'try') {
      const den = (members || []).filter(m => { const dn = ((m && m.rec) || {}).denied; return dn && dn.cycle === cur.cycle && dn.period === cur.period && (!kind || !dn.kind || dn.kind === kind); });
      if (den.length) return { state: 'closed', ok: false, why: 'the Ziggurat refused ' + den.map(m => m.name).join(', ') + ' this period (Seven Signs)', until: cur.nextChange || 0, need: [], who: den.map(m => m.name), code: 'denied' };
      return { state: 'enter', ok: true, why: 'Seven Signs gate "try": the Ziggurat decides (no sign-up needed first)', until: 0, need: [], who: [], code: 'try' };
    }
    const all = (members || []).map(m => ssgOne(cur, m, kind, o));
    const closed = all.filter(a => a.state === 'closed');
    if (closed.length) {
      const until = closed.some(a => !a.until) ? 0 : Math.max(...closed.map(a => a.until));
      return { state: 'closed', ok: false, why: closed[0].why + (closed.length > 1 ? ` (+${closed.length - 1} more: ${closed.slice(1).map(a => a.name).join(', ')})` : ''), until, need: [], who: closed.map(a => a.name), code: closed[0].code, whoSame: closed.filter(a => a.code === closed[0].code).map(a => a.name) };
    }
    const chk = all.find(a => a.state === 'check');
    if (chk) return { state: 'check', ok: false, why: chk.why, until: 0, need: [], who: [], code: chk.code };
    const need = all.filter(a => a.state === 'signup').map(a => a.name);
    if (need.length) return { state: 'signup', ok: false, why: `competition period: ${need.join(', ')} ${need.length === 1 ? 'is' : 'are'} not signed up yet — Lords of Dawn sign-up first (Priest of Dawn, free)`, until: 0, need, who: need, code: 'signup' };
    return { state: 'enter', ok: true, why: all.length ? all[0].why : 'nobody to check', until: 0, need: [], who: [], code: all.length ? all[0].code : 'nobody' };
  }
  function ssgUntilText(ms) {
    if (!ms) return '';
    const d = new Date(ms), p = (v) => String(v).padStart(2, '0');
    return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function ssgReason(g, cur) {
    cur = cur || {};
    if (!g) return 'Unknown: no Seven Signs data from the bots yet.';
    const who = (L) => { L = (L || []).filter(Boolean); return L.length <= 3 ? L.join(', ') : L.slice(0, 3).join(', ') + ' and ' + (L.length - 3) + ' more'; };
    const isAre = (L) => ((L || []).length === 1 ? 'is' : 'are'), wasWere = (L) => ((L || []).length === 1 ? 'was' : 'were');
    const at = (ms) => (ms ? ssgUntilText(ms) + ' (local time)' : 'the next Monday period change');
    const W = (w) => (w === 'dawn' ? 'Dawn' : w === 'dusk' ? 'Dusk' : '');
    const same = g.whoSame && g.whoSame.length ? g.whoSame : (g.who || []), more = (g.who || []).length - same.length;
    const plus = more > 0 ? ` (${more} more ${more === 1 ? 'member is' : 'members are'} closed for another reason)` : '';
    const nx = at(cur.nextChange || g.until), c = g.code || (g.optin ? 'optin' : g.state);
    if (c === 'off') return 'Open: the Seven Signs check is switched off.';
    if (c === 'try') return 'Open: the Seven Signs gate is set to "try" — the party goes to the Ziggurat and the Ziggurat decides (no sign-up first).';
    if (c === 'signed') return 'Open: everyone in the party is signed up with the Lords of Dawn this week.';
    if (c === 'winner') return `Open: it is the Seven Signs validation week, ${W(cur.winner)} won and everyone was on the ${W(cur.winner)} side.`;
    if (c === 'nowinner') return 'Open: it is the Seven Signs validation week and everyone was signed up in the last competition (no clear winner known).';
    if (g.state === 'enter') return 'Open: nobody in the party is blocked by the Seven Signs.';
    if (c === 'signup') return `Not signed up yet: ${who(g.need || g.who)} — it is the competition week, so the leader takes them to the Priest of Dawn (free) first, then goes in.`;
    if (c === 'unknown') return 'Unknown: no character has read the Priest of Dawn\'s page this cycle yet — the leader reads it in a town first, then decides.';
    if (c === 'break') return 'Short Seven Signs break (15 minutes at the Monday change) — the leader reads the Priest of Dawn again, then decides.';
    if (c === 'optin-check') return 'Seven Signs sign-up is switched off for this party (opt-in on the 7 Signs tab) and nobody has read the Priest of Dawn this cycle yet — enroll the party or press Sign up now on the 7 Signs tab.';
    if (c === 'optin') return `Not open for ${who(g.who)}: not signed up with the Lords of Dawn, and the Seven Signs sign-up is switched off for ${(g.who || []).length === 1 ? 'this character' : 'them'} — sign up on the 7 Signs tab (enroll, or Sign up now).`;
    if (c === 'notsigned') return `Closed this week: it is the Seven Signs validation period and ${who(same)} ${wasWere(same)} not signed up in the last competition — opens again ${nx} (next competition)${plus}.`;
    if (c === 'loser') return `Closed this week: it is the Seven Signs validation period and ${W(cur.winner) || 'the other side'} won, so only ${W(cur.winner) || 'its'} members may enter — ${who(same)} ${isAre(same)} not — opens again ${nx} (next competition)${plus}.`;
    if (c === 'base') return `Not open for ${who(same)}: no 1st class transfer yet, so ${same.length === 1 ? 'it' : 'they'} cannot join the Seven Signs — change class first${plus}.`;
    if (c === 'denied') return `Closed for ${who(same)} until ${at(g.until || cur.nextChange)}: the Ziggurat refused ${same.length === 1 ? 'it' : 'them'} this period${plus}.`;
    if (c === 'fee') return `Not open for ${who(same)} this week: the Priest of Dawn asked for a fee or an item (not paid) — the next try is after ${nx}${plus}.`;
    if (c === 'tries') return `Not open for ${who(same)} this week: the Dawn sign-up failed 3 times — press Sign up on the 7 Signs tab to try again${plus}.`;
    return `Closed: ${g.why || 'the Seven Signs rule'}${g.until ? ' — until ' + at(g.until) : ''}.`;
  }
  function ssoNorm(j) {
    const ok = !!j && typeof j === 'object' && !Array.isArray(j);
    const L = (a) => Array.isArray(a) ? a.map(x => String(x == null ? '' : x).trim()).filter(Boolean) : [];
    return { exists: ok, parties: ok ? L(j.parties) : [], chars: ok ? L(j.chars) : [], contributeStones: ok && j.contributeStones !== undefined && j.contributeStones !== null ? !!j.contributeStones : null,
      gate: ok && /^(try|strict)$/i.test(String(j.gate || '')) ? String(j.gate).toLowerCase() : '' };   // SSGATE2-2026-10-13: the gate mode
  }
  function ssoEnrolled(cfg, name, party) {
    const lc = (s) => String(s == null ? '' : s).trim().toLowerCase(), n = lc(name), p = lc(party);
    if (!cfg || !n) return false;
    return (cfg.chars || []).some(x => lc(x) === n) || (!!p && (cfg.parties || []).some(x => lc(x) === p));
  }
  function ssoGate(g, names, enrolled) {
    if (!g || g.ok) return g;
    const hint = 'enroll on the 7 Signs tab for the automatic sign-up (or send !dawn)';
    if (g.state === 'signup') {
      const no = (g.need || []).filter(n => !enrolled(n)); if (!no.length) return g;
      return { state: 'closed', ok: false, optin: true, why: `competition period: ${no.join(', ')} ${no.length === 1 ? 'is' : 'are'} not signed up and not enrolled — ${hint}`, until: 0, need: [], who: no, code: 'optin' };
    }
    if (g.state === 'check' && !(names || []).some(enrolled)) return { state: 'closed', ok: false, optin: true, why: `${g.why} — nobody of the team is enrolled: ${hint}`, until: 0, need: [], who: [], code: 'optin-check' };
    return g;
  }
  // COPY-END
  const CHANGE_UTC_HOUR = 18, CHECK_EVERY_MS = 6 * 3600e3;   // = swarm.js CONFIG.sevenSigns.changeUtcHour / checkEveryMs
  const BASE_CLASS_IDS = [0, 10, 18, 25, 31, 38, 44, 49, 53, 123, 124];   // = swarm.js BASE_CLASS_IDS (no 1st class transfer yet)
  /** the party's gate now, the way the leader's swarm.js decides it (ssTeamAllowed): o = { state (sevensigns_state.json), members: [{ name, rec
   *  (sevensigns_<name>.json), classId? }], party, kind ('catacomb' | 'necropolis'), optin (seven_signs.json), consent (the party chose a
   *  catacomb / necropolis itself = consent to the sign-up, swarm.js ssChosenDungeon), t (ms), enabled (CONFIG.sevenSigns.blockDungeons, default on) }
   *  -> the ssGateDecide result + { cur, reason } */
  function partyGate(o) {
    o = o || {};
    const t = o.t || Date.now(), cur = ssgNow(o.state || {}, t, CHANGE_UTC_HOUR, CHECK_EVERY_MS), cfg = ssoNorm(o.optin || null);
    const mem = (o.members || []).map(m => ({ name: m.name, rec: m.rec || {}, base: m.classId != null && m.classId >= 0 ? BASE_CLASS_IDS.includes(Number(m.classId)) : /1st class transfer/.test(String((m.rec && m.rec.view && m.rec.view.why) || m.why || '')) }));
    const names = mem.map(m => m.name), enrolled = (n) => !!o.consent || ssoEnrolled(cfg, n, o.party);
    const g = ssoGate(ssGateDecide(cur, mem, o.kind || 'catacomb', { enabled: o.enabled !== false, maxTries: 3, mode: cfg.gate === 'try' ? 'try' : 'strict' }), names, enrolled);
    return Object.assign({}, g, { cur, reason: ssgReason(g, cur) });
  }
  const API = { ssgWeek, ssgCycleOf, ssgNextChange, ssgNow, ssgSide, ssgOne, ssGateDecide, ssgUntilText, ssgReason, ssoNorm, ssoEnrolled, ssoGate, partyGate, CHANGE_UTC_HOUR, CHECK_EVERY_MS, BASE_CLASS_IDS };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.SSLogic = API;
})(typeof window !== 'undefined' ? window : this);
