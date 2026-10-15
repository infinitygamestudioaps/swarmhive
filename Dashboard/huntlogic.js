// HUNT TIMER — shared logic (owner 2026-10-15: "I asked Tank1's team to go to the catacomb but I did not get asked how many hours etc.").
// ONE file for the dashboard (window.HuntLogic, used by Dashboard/hunttimer.js) and node (module.exports: Dashboard/hunttimer_api.js +
// docs/plan/tools/test_hunt_timer.js). No DOM, no host calls.
//
//  - the timer CLOCK: the same rules as Scripts_dev/swarm.js HUNTTIMER-PURE (htEntry / htClock; the test checks both give the same answers)
//  - the supply ESTIMATE for the spot picker's popup: per character and per item "about N per hour", from what the character REALLY used
//    while hunting (swarm_state.sup.use, measured by swarm.js over the last 6 h of hunting; used once it saw >= 20 min), else a rule of thumb:
//        soulshots      fighters / archers / tanks  1,200 an hour   (about one shot per hit, fighting about a third of the time)
//        spiritshots    casters 600 an hour, healers 300 an hour (blessed or plain: whatever the character uses)
//        Mana Potions   fighters 20, casters 60, healers 80 an hour
//        Healing Potions                3 an hour (emergencies only)
//        Spirit Ore     healers with Major Heal 60, others with a cubic / summon skill 15 an hour   (only characters whose skills eat it)
//        Einhasad's Holy Water          10 an hour (Cleanse / Salvation; only characters that know such a skill)
//        Soul Ore                       10 an hour (Banish Undead ...; only characters that know such a skill)
//    need = per hour x hours; runs out after = what it carries / per hour. Always labelled "about".
(function (root) {
  'use strict';
  const HOURS = [{ value: 'stop', label: 'Until I stop it' }, { value: 1, label: '1 h' }, { value: 2, label: '2 h' }, { value: 3, label: '3 h' }, { value: 4, label: '4 h' }, { value: 6, label: '6 h' }, { value: 8, label: '8 h' }];
  const ACTIONS = [
    { value: 'town', label: 'Go to town and wait', hint: 'back to Giran (a supply run if it is switched on in the party settings), then the party stops and waits for you' },
    { value: 'resupply', label: 'Town, supplies, come back', hint: 'back to Giran, a supply run if it is switched on, then back to this spot and hunting until you stop it' },
    { value: 'keep', label: 'Keep hunting', hint: 'nothing changes: the party keeps hunting and the normal automatic trips are allowed again' },
  ];
  const ARRIVE_WAIT_MS = 45 * 60000;
  const MIN_SEEN_H = 1 / 3;   // measured use counts after 20 min of hunting
  const RATES = { fighterShots: 1200, casterShots: 600, healerShots: 300, manaFighter: 20, manaCaster: 60, manaHealer: 80, heal: 3, oreHealer: 60, oreOther: 15, holy: 10, soulOre: 10 };
  const SPIRITSHOT_IDS = [2509, 2510, 2511, 2512, 2513, 2514, 3947, 3948, 3949, 3950, 3951, 3952, 5790];
  const ACTION_TEXT = { town: 'go to town and wait', resupply: 'town, supplies, come back', keep: 'keep hunting' };
  const GR = ['No Grade', 'D-Grade', 'C-Grade', 'B-Grade', 'A-Grade', 'S-Grade'];
  const SHOT_NAMES = {};
  [1835, 1463, 1464, 1465, 1466, 1467].forEach((id, i) => { SHOT_NAMES[id] = `Soulshot (${GR[i]})`; });
  [2509, 2510, 2511, 2512, 2513, 2514].forEach((id, i) => { SHOT_NAMES[id] = `Spiritshot (${GR[i]})`; });
  [3947, 3948, 3949, 3950, 3951, 3952].forEach((id, i) => { SHOT_NAMES[id] = `Blessed Spiritshot (${GR[i]})`; });
  Object.assign(SHOT_NAMES, { 5789: 'Soulshot (beginners)', 5790: 'Spiritshot (beginners)' });

  // ---- the clock (= swarm.js htEntry / htClock)
  function entry(j, key) {
    const o = j && typeof j === 'object' ? j : {}, P = o.parties && typeof o.parties === 'object' ? o.parties : {}, e = P[key];
    if (!e || typeof e !== 'object') return null;
    const hours = Number(e.hours), at = Date.parse(e.at || '');
    if (!e.id || !isFinite(hours) || hours <= 0 || hours > 48 || !isFinite(at)) return null;
    const en = e.endNow ? Date.parse(e.endNow) : NaN;
    return { id: String(e.id), hours, endAction: ['town', 'resupply', 'keep'].includes(e.endAction) ? e.endAction : 'town', from: e.from === 'now' ? 'now' : 'arrival', at, endNow: isFinite(en) ? en : null, spot: String(e.spot || '').slice(0, 120) };
  }
  function clock(e, st, nowMs) {
    if (!e) return { id: '', active: false, ended: false, done: false, started: false };
    const S = st && typeof st === 'object' && st.id === e.id ? st : null;
    let startAt = null, startWhy = '';
    if (S && S.startedAt && isFinite(Date.parse(S.startedAt))) { startAt = Date.parse(S.startedAt); startWhy = S.startWhy || 'arrived'; }
    else if (e.from === 'now') { startAt = e.at; startWhy = 'counted from the choice'; }
    else if (nowMs - e.at >= ARRIVE_WAIT_MS) { startAt = e.at + ARRIVE_WAIT_MS; startWhy = 'not there after 45 min — counting anyway'; }
    let endAt = startAt !== null ? startAt + e.hours * 3600000 : null;
    if (e.endNow !== null) endAt = endAt === null ? e.endNow : Math.min(endAt, e.endNow);
    const done = !!(S && S.endedFor === e.id);
    const ended = done || (endAt !== null && nowMs >= endAt);
    return { id: e.id, hours: e.hours, endAction: e.endAction, spot: e.spot, from: e.from, at: e.at, startAt, startWhy, endAt, started: startAt !== null, waitingArrival: startAt === null,
      ended, done, active: !ended, leftMs: endAt !== null ? Math.max(0, endAt - nowMs) : null, endedNow: e.endNow !== null };
  }
  function fmt(ms) {
    const m = Math.round(Math.max(0, Number(ms) || 0) / 60000);
    if (m < 1) return 'less than a minute';
    const h = Math.floor(m / 60), r = m % 60;
    return h ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${r} min`;
  }
  /** a short line for the party card: { text, cls, state: 'travel' | 'running' | 'ending' | 'done' } | null */
  function cardLine(j, st, key, nowMs) {
    const e = entry(j, key); if (!e) return null;
    const c = clock(e, st, nowMs), at = e.spot || 'the chosen spot', S = st && st.id === e.id ? st : {};
    if (c.done) return { state: 'done', cls: '', c, text: `Hunting time at ${at} is over${S.result && S.result !== 'running' ? ' — ' + S.result : S.result === 'running' ? ' — on the way (' + ACTION_TEXT[e.endAction] + ')' : ''}` };
    if (c.ended) return { state: 'ending', cls: 'warn', c, text: `Hunting time at ${at} is up — ${ACTION_TEXT[e.endAction]} (starting within 15 s)` };
    if (c.waitingArrival) return { state: 'travel', cls: '', c, text: `${fmtHours(e.hours)} at ${at} — the clock starts when they arrive` };
    return { state: 'running', cls: c.leftMs < 15 * 60000 ? 'warn' : 'ok', c, text: `Hunting at ${at} — ${fmt(c.leftMs)} left`, then: ACTION_TEXT[e.endAction] };
  }
  const fmtHours = (h) => { const n = Number(h); return n === Math.floor(n) ? `${n} h` : fmt(n * 3600000); };

  // ---- the estimate
  const num = (x) => { const n = Number(x); return isFinite(n) ? n : 0; };
  function kindOf(c) {
    const s = c && c.sup || {};
    if (s.h) return 'healer';
    if (s.k === 'mage' || SPIRITSHOT_IDS.includes(num(c && c.shotId))) return 'caster';
    return 'fighter';
  }
  /** the items one character uses while hunting -> [{ key, label, id, have, perHour, src: 'seen' | 'about', why }] */
  function charItems(c, itemName) {
    const s = c && c.sup || null, kind = kindOf(c), use = s && s.use || {}, seen = s && num(s.seenH) >= MIN_SEEN_H;
    const nm = (id, fb) => { try { const n = itemName && itemName(id); return n || SHOT_NAMES[id] || fb; } catch (e) { return SHOT_NAMES[id] || fb; } };
    // measured: what it really used (an item it never used while hunting = 0 an hour); not measured long enough: the rule of thumb
    const rate = (ids, about) => seen ? { perHour: ids.reduce((t, id) => t + num(use[id]), 0), src: 'seen' } : { perHour: about, src: 'about' };
    const out = [];
    const sid = num(c && c.shotId);
    if (sid) {
      const sp = SPIRITSHOT_IDS.includes(sid), about = sp ? (kind === 'healer' ? RATES.healerShots : RATES.casterShots) : RATES.fighterShots;
      out.push(Object.assign({ key: sp ? 'spiritshots' : 'soulshots', label: nm(sid, sp ? 'Spiritshots' : 'Soulshots'), id: sid, have: num(c.shots) }, rate([sid], about)));
    }
    if (!s) return out;   // an older script: only the shots are known
    out.push(Object.assign({ key: 'mana', label: 'Mana Potion', id: 728, have: num(s.mana) }, rate([728], kind === 'healer' ? RATES.manaHealer : kind === 'caster' ? RATES.manaCaster : RATES.manaFighter)));
    out.push(Object.assign({ key: 'heal', label: 'Healing Potion', id: 1061, have: num(s.heal) }, rate([1061, 1060], RATES.heal)));
    if (Array.isArray(s.oreSk) && s.oreSk.length) out.push(Object.assign({ key: 'ore', label: 'Spirit Ore', id: 3031, have: num(s.ore), why: s.oreSk.join(', ') }, rate([3031], kind === 'healer' ? RATES.oreHealer : RATES.oreOther)));
    if (Array.isArray(s.holySk) && s.holySk.length) out.push(Object.assign({ key: 'holy', label: "Einhasad's Holy Water", id: 8874, have: num(s.holy), why: s.holySk.join(', ') }, rate([8874], RATES.holy)));
    if (Array.isArray(s.soulSk) && s.soulSk.length) out.push(Object.assign({ key: 'soul', label: 'Soul Ore', id: 1785, have: num(s.soulOre), why: s.soulSk.join(', ') }, rate([1785], RATES.soulOre)));
    return out;
  }
  const GROUPS = [['soulshots', 'Soulshots'], ['spiritshots', 'Spiritshots'], ['mana', 'Mana Potions'], ['heal', 'Healing Potions'], ['ore', 'Spirit Ore'], ['holy', "Einhasad's Holy Water"], ['soul', 'Soul Ore']];
  /** chars = swarm_state objects of one party, hours = number | null ("until I stop it") -> { hours, groups: [...], short: [...], seen: [names], about: [names] } */
  function estimate(chars, hours, opt) {
    const o = opt || {}, H = hours === null || hours === undefined || hours === 'stop' ? null : num(hours);
    const horizon = H === null ? (num(o.horizonH) || 2) : H;   // "until I stop it": warn about what runs out within 2 h
    const groups = {}, short = [], seen = [], about = [];
    (Array.isArray(chars) ? chars : []).forEach(c => {
      if (!c || !c.name) return;
      const items = charItems(c, o.itemName);
      if (items.some(i => i.src === 'seen')) seen.push(c.name); else about.push(c.name);
      items.forEach(i => {
        const g = groups[i.key] || (groups[i.key] = { key: i.key, label: (GROUPS.find(x => x[0] === i.key) || [0, i.label])[1], chars: [], perHour: 0, have: 0, need: 0, src: {} });
        const need = Math.ceil(i.perHour * horizon), lastsMs = i.perHour > 0 ? i.have / i.perHour * 3600000 : null;
        g.chars.push({ name: c.name, have: i.have, perHour: i.perHour, need, lastsMs, src: i.src, item: i.label, why: i.why || '' });
        g.perHour += i.perHour; g.have += i.have; g.need += need; g.src[i.src] = (g.src[i.src] || 0) + 1;
        if (lastsMs !== null && lastsMs < horizon * 3600000) short.push({ name: c.name, key: i.key, item: i.label, have: i.have, perHour: i.perHour, lastsMs, src: i.src,
          text: `${c.name} runs out of ${i.label} after about ${fmt(lastsMs)} (has ${i.have.toLocaleString('en-US')}, uses ~${Math.round(i.perHour).toLocaleString('en-US')}/h)` });
      });
    });
    const list = GROUPS.map(g => groups[g[0]]).filter(Boolean);
    short.sort((a, b) => a.lastsMs - b.lastsMs);
    return { hours: H, horizon, groups: list, short, seen, about };
  }
  const API = { HOURS, ACTIONS, ACTION_TEXT, RATES, SHOT_NAMES, ARRIVE_WAIT_MS, MIN_SEEN_H, SPIRITSHOT_IDS, entry, clock, fmt, fmtHours, cardLine, kindOf, charItems, estimate };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.HuntLogic = API;
})(typeof window !== 'undefined' ? window : this);
