// ACTIVITY (shared, 2026-10-09): ONE plain-words line per member — "what does this character do right now" — used by the live party view
// (#/live/<leader>, liveparty.js), the character page (charpage.js, via LiveParty._activity) and the Parties tab member rows + party banner
// (partystatus.js). Moved here from liveparty.js (user 2026-10-09 11:15: "under /parties it is sooo hard to see what is going on ... I don't
// know who is trading with who and what the status is").
// Input: a member's swarm_state (the Parties tab: /api/state chars; the live view: /api/live members with intents[]) and d = { members, leader }.
// New swarm.js fields read here (all optional, older scripts fall back to the task text): trade { role, other, what, stage, since, stageAt,
// tries, ok, msg, endedAt }, teamStep { a, at, g, r, what, done, wait, rank, until }, partyStatus (leader; see partystatus.js).
// Uses index.html globals: esc, km, UI, GI, intentText, niceTask, GD.
(function () {
  'use strict';
  const A = { skew: 0, still: {} };
  const srvNow = () => Date.now() + A.skew;
  const secs = (ms) => Math.max(0, Math.round(ms / 1000));
  const T = (iso) => { const t = Date.parse(iso); return isFinite(t) ? t : (+iso || 0); };
  const kmS = (d) => { try { return km(d); } catch (e) { return String(Math.round(d)); } };
  const skillName = (id) => { try { return ((GD.skills || {})[id] || [])[0] || ('skill ' + id); } catch (e) { return 'skill ' + id; } };
  const HEALRE = /heal|recharge|cleanse|purify|remedy|cure|resurrect|restore|blessing of|vitalize|benediction|chant of life|balance life|mass/i;
  const nTask = (t) => { try { return niceTask(t); } catch (e) { return String(t || '') || 'idle'; } };
  const iText = (e) => { try { return intentText(e); } catch (e2) { return e.action + ': ' + (e.detail || ''); } };
  /** "1m05s" / "45 s" / "2h10" */
  const dur = (ms) => { const s = secs(ms); return s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's' : Math.floor(s / 3600) + 'h' + String(Math.floor(s % 3600 / 60)).padStart(2, '0'); };
  const fmtAge = (s) => { s = Math.max(0, s | 0); return s < 90 ? s + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h'; };
  const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

  const live = (c) => c && c.ageSec != null && c.ageSec <= 30;
  /** newest intent: the live view has intents[] (parsed log), the Parties tab only the state's last intent */
  const newest = (c) => (c.intents || [])[0] || c.intent || null;
  const xyOf = (s) => { const m = String(s || '').match(/(-?\d+),\s*(-?\d+)/); return m ? [+m[1], +m[2]] : null; };
  function walkIntent(c) {
    const e = newest(c); if (!e || e.result) return null;
    if (!/^(walk|lead team|route|move|npc|rescue|regroup)$/.test(e.action)) return null;
    if (srvNow() - T(e.at) > 5 * 60000) return null;
    const to = xyOf(e.to); return to && Math.hypot(to[0] - c.x, to[1] - c.y) > 150 ? { e, to } : null;   // standing at the NPC / point = not walking
  }
  function route(c) {
    const r = c.route; if (!r || !Array.isArray(r.pts) || !r.pts.length) return null;
    const pts = r.pts.filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
    if (!pts.length) return null;
    const i = Math.max(0, Math.min(pts.length, +r.i || 0));
    let left = 0, px = c.x, py = c.y;
    for (let k = i; k < pts.length; k++) { left += Math.hypot(pts[k][0] - px, pts[k][1] - py); px = pts[k][0]; py = pts[k][1]; }
    const tg = r.target;
    const label = typeof tg === 'string' ? tg : tg && (tg.label || tg.name) || '';
    const goal = tg && typeof tg === 'object' && isFinite(tg.x) ? [tg.x, tg.y] : pts[pts.length - 1];
    return { pts, i, left, label, goal, done: i >= pts.length, stuck: !!r.stuck, since: r.stuckSince, replans: +r.replans || 0 };
  }
  /** client-side "not moving" watch (works with an older swarm.js too): the anchor moves when the member moves > 60 */
  function track(members) {
    const t = Date.now();
    (members || []).forEach(c => {
      if (!c || !isFinite(c.x)) return;
      const a = A.still[c.name];
      if (!a || Math.hypot(c.x - a.x, c.y - a.y) > 60) A.still[c.name] = { x: c.x, y: c.y, since: t };
    });
  }
  /** seconds this member has stood on the same spot (dashboard's own watch) */
  const stillSec = (c) => { const a = c && A.still[c.name]; return a ? secs(Date.now() - a.since) : 0; };
  function stuck(c) {
    if (!live(c) || c.dead) return null;
    const r = route(c);
    if (r && r.stuck) {
      const since = Date.parse(r.since) || +r.since || 0;
      return { hard: true, sec: since ? secs(srvNow() - since) : null, replans: r.replans };
    }
    const walking = (r && !r.done) || walkIntent(c);
    const a = A.still[c.name];
    if (walking && a && !c.combat && !(c.doing && (c.doing.target || c.doing.resting)) && !(c.cast && !c.cast.ended && !(window.castGone && castGone(c.cast, srvNow())))) {
      const s = secs(Date.now() - a.since);
      if (s >= 20) return { hard: false, sec: s };
    }
    return null;
  }

  // ------------------------------------------------------------------ trades -----------------------------------------------------------
  const STAGES = ['asking', 'open', 'confirm', 'done'];
  /** where a trade stands, in words (role = the side this text is written for) */
  function stageText(t, role, other) {
    const o = esc(other || 'the other side');
    switch (t.stage) {
      case 'walking': return `walking over to ${o}`;
      case 'asking': return `asking ${o} to open the trade${t.tries > 1 ? ' (try ' + t.tries + '/5)' : ''}`;
      case 'waiting': return `waiting for ${o} to open the trade`;
      case 'open': return role === 'give' ? 'window open, putting the items in' : 'window open, waiting for the items';
      case 'confirm': return role === 'give' ? `confirmed, waiting for ${o} to confirm` : 'items in, confirmed — waiting for the trade to finish';
      case 'done': return 'done ✓';
      case 'failed': return 'failed' + (t.msg ? ': ' + esc(t.msg) : '');
      default: return esc(t.stage || '');
    }
  }
  /** the trade this member is in (new swarm.js: c.trade; older: the task 'trade -> ' / 'trade <- ' + the opposite side found by its task) */
  function tradeOf(c, d) {
    const now = srvNow(), all = (d && d.all) || (d && d.members) || [];
    const t = c.trade;
    if (t && t.other) {
      const ended = t.stage === 'done' || t.stage === 'failed';
      if (ended && now - T(t.endedAt || t.stageAt) > 30000) return null;
      const give = t.role === 'give';
      return { giver: give ? c.name : t.other, receiver: give ? t.other : c.name, role: t.role, other: t.other, what: t.what || '', stage: t.stage || 'open',
        stageAt: T(t.stageAt), since: T(t.since), tries: t.tries || 0, msg: t.msg || '', fund: /fund/.test(t.step || ''), step: t.step || '',
        done: t.stage === 'done', failed: t.stage === 'failed', text: stageText(t, t.role, t.other) };
    }
    const task = String(c.task || '');
    if (!(c.doing && c.doing.trading) && !/^trade\s*(->|<-)/.test(task)) return null;
    const give = /^trade\s*->/.test(task) ? true : /^trade\s*<-/.test(task) ? false : null;
    // the other side: a live character whose task points the other way (own party first, then everyone: fund rounds cross teams)
    const opp = (list) => list.filter(m => m !== c && live(m) && (give === false ? /^trade\s*->/.test(String(m.task || '')) : give === true ? /^trade\s*<-/.test(String(m.task || '')) : /^trade/.test(String(m.task || ''))));
    let o = opp((d && d.members) || []); if (!o.length) o = opp(all);
    const other = o.length === 1 ? o[0].name : o.length > 1 ? (give ? o.map(m => m.name).join(' / ') : (o.find(m => m.name === (d && d.leader)) || o[0]).name) : '';
    return { giver: give === false ? other : c.name, receiver: give === false ? c.name : other, role: give === false ? 'take' : 'give', other, what: '', stage: '', legacy: true,
      stageAt: 0, since: 0, text: give === false ? 'receiving' : 'giving' };
  }
  function tradeLine(tr) {
    if (tr.legacy) return `<b>trading</b>${tr.other ? ' with <b>' + esc(tr.other) + '</b>' : ''} (${tr.role === 'take' ? 'receiving' : 'giving'})`;
    const w = tr.what ? ' ' + esc(tr.what) : ' items';
    const head = tr.done || tr.failed ? (tr.role === 'give' ? `Traded with <b>${esc(tr.other)}</b>: gave` : `Traded with <b>${esc(tr.other)}</b>: received`)
      : (tr.role === 'give' ? `Trading with <b>${esc(tr.other)}</b>: giving` : `Trading with <b>${esc(tr.other)}</b>: receiving`);
    const age = !tr.done && !tr.failed && tr.stageAt ? srvNow() - tr.stageAt : 0;
    return `${head}${w}${tr.fund ? ' (fund round)' : ''} <span class="${tr.failed ? 'bad' : tr.done ? 'ok' : ''}">(${tr.text}${age > 10000 ? ' · ' + dur(age) : ''})</span>`;
  }

  // ------------------------------------------------------------------ team steps (the leader's step as a member runs it) -------------
  const STEP_LABEL = { supplyneed: 'telling the leader what it needs', enchantrun: 'enchanting its gear', gearplan: 'checking the shops for upgrades', gearrun: 'buying gear upgrades',
    dyeplan: 'checking its dye plan', dyerun: 'drawing symbols', sellrun: 'selling at Helvetia', adenastatus: 'reporting its adena', equip: 'equipping gear', gearlist: 'listing spare gear',
    gearwant: 'checking spare gear', home: 'going to town', restock: 'restocking', gk: 'teleporting with the team', gkif: 'roll call after the teleport', fight: 'back to following',
    shop: 'shopping', shopcheck: 'checking the shop', escortstatus: 'escort status', queststop: 'stopping the quest' };
  const TRADE_KIND = { s: 'supply hand-out', e: 'enchant scrolls', c: 'adena collect', a: 'adena share', u: 'loot unload' };
  const stepLabel = (a) => { a = String(a || ''); const m = a.match(/^trade#([a-z]?)\d*/); if (m) return 'trade (' + (TRADE_KIND[m[1]] || 'gear') + ')'; return STEP_LABEL[a] || a.replace(/#.*/, ''); };
  function teamStepOf(c) {
    const s = c.teamStep; if (!s || !s.a) return null;
    const age = srvNow() - T(s.at);
    if (age > (s.done ? 120000 : 900000)) return null;
    return Object.assign({}, s, { atT: T(s.at), doneT: T(s.doneAt), untilT: T(s.until) });
  }

  // ------------------------------------------------------------------ waiting texts ---------------------------------------------------
  /** "Chanter4 1234, Kael dead" -> "Chanter4 (1.2k away), Kael (dead)" */
  const whoList = (s) => esc(String(s || '')).replace(/([A-Za-z][\w]*) (\d+|dead|\?)(?=,|$|\s)/g, (_, n, x) => `<b>${n}</b> (${x === 'dead' ? 'dead' : x === '?' ? 'not seen' : kmS(+x) + ' away'})`);
  const GIRAN_PLACE = { start: 'Giran start point', grocer: 'grocer (Helvetia)', warehouse: 'warehouse', weapons: 'weapon shop', armor: 'armor shop', jewelry: 'jewelry shop',
    blacksmith: 'blacksmith', symbol: 'Symbol Maker', gatekeeper: 'gatekeeper', priest: 'Priest of Dawn' };

  /** ONE line in plain words: what this member does right now (most important first). d = { members, leader, all? } */
  function member(c, d) {
    d = d || {};
    const D = c.doing || {}, t = String(c.task || ''), now = srvNow();
    if (!live(c)) return { ic: UI.idle, cls: 'bad', h: `<b>not reporting</b> for ${fmtAge(c.ageSec)} — offline or its script stopped` };
    if (c.dead) return { ic: UI.dead, cls: 'bad', h: '<b>dead</b>' + ((d.members || []).some(m => m !== c && live(m) && !m.dead && /bishop|saint|healer|elder|cleric|oracle/i.test(m.role || '')) ? ' — waiting for a resurrection' : ' — no healer alive') };
    const e = c.escape;
    if (e && e.on) {
      const ph = { run: 'running to ' + ((e.target && e.target.label) || 'a safe spot'), wait: 'waiting until nothing hits' + (e.noHitSec != null ? ' (' + e.noHitSec + ' s)' : ''), soe: 'Scroll of Escape', town: '.townname', rescue: 'waiting for ' + ((e.leader && e.leader.name) || 'the leader'), cc: 'crowd control' }[e.phase] || e.phase || '';
      return { ic: UI.soe, cls: 'bad', h: `<b>escaping</b> (${esc(ph)})${e.why ? ' — ' + esc(e.why) : ''} · round ${e.round || 1}/5` };
    }
    const k = c.cast;
    if (k && !k.ended && !(window.castGone && castGone(k, srvNow()))) {   // D13: a cast whose time ran out is not "casting" any more
      const left = (T(k.start) + (+k.ms || 0) - now) / 1000;
      const heal = HEALRE.test(k.name || '');
      return { ic: k.kind === 'town' ? UI.map : k.kind === 'soe' ? UI.soe : UI.skill, h: `${heal ? 'healing' : k.kind === 'town' ? 'teleporting:' : 'casting'} <b>${esc(k.name)}</b>${k.target ? ' → ' + esc(k.target) : ''} (${left > 0 ? left.toFixed(1) + ' s left' : 'finishing'})` };
    }
    const st = stuck(c), r = route(c);
    if (st && st.hard) return { ic: UI.warn, cls: 'bad', h: `<b>stuck${st.sec != null ? ' for ' + st.sec + ' s' : ''}</b> — re-planning${st.replans ? ' (try ' + st.replans + ')' : ''}${r && r.label ? ' on the way to ' + esc(r.label) : ''}` };
    const ls = c.lastSkill, lsAge = ls ? now - T(ls.at) : 1e9, sn = ls ? skillName(ls.id) : '';
    if (ls && lsAge < 4000 && ls.tgt && ls.tgt !== c.name && HEALRE.test(sn)) return { ic: UI.res, h: `healing <b>${esc(ls.tgt)}</b> (${esc(sn)})` };
    // TRADES: both sides, what, where it stands (new swarm.js); an older script: the other side found by its task
    const tr = tradeOf(c, d);
    if (tr) return { ic: UI.trade, cls: tr.failed ? 'bad' : '', h: tradeLine(tr), trade: tr };
    // A TEAM STEP of the leader: waiting for my turn / ready and waiting for the others / someone else trades now
    const ts = teamStepOf(c), inStep = /^regroup:?\s*$/.test(t) || (ts && !ts.done && /^regroup/.test(t));
    if (ts && inStep) {
      if (!ts.done && ts.wait) {
        const left = ts.untilT ? Math.max(0, ts.untilT - now) : 0;
        return { ic: UI.idle, h: `waiting for its turn at <b>${esc(ts.wait)}</b> — ${ord(ts.rank || 2)} in line${left > 1000 ? ', ~' + secs(left) + ' s' : ''}`, step: ts };
      }
      const isTrade = /^trade#/.test(ts.a), mine = ts.g === c.name || ts.r === c.name;
      if (isTrade && !mine && ts.g && ts.r) return { ic: UI.trade, h: `waiting while <b>${esc(ts.g)}</b> trades with <b>${esc(ts.r)}</b>${ts.what ? ' (' + esc(ts.what) + ')' : ''}`, step: ts };
      if (ts.done) return { ic: UI.yes, cls: ts.ok === false ? 'bad' : '', h: `${ts.ok === false ? 'step failed' : 'ready'} — waiting for the others (${esc(stepLabel(ts.a))})`, step: ts };
    }
    const ie = newest(c), ieAge = ie ? now - T(ie.at) : 1e9;
    const notes = (c.notes || []).join(' | ');
    if (/\bsell/i.test(t) || (ie && !ie.result && ieAge < 120000 && /sell/i.test(ie.detail || '')) || /\bselling\b/i.test(notes.slice(-200))) {
      const npc = ie && ie.action === 'npc' ? String(ie.detail || '').replace(/^talking to /, '').replace(/^walking in front of (.*) before clicking.*/, '$1') : '';
      const nm = (t + ' ' + (ie ? ie.detail : '')).match(/\((\d+)\s*\/\s*(\d+)\)/);
      return { ic: UI.inv, h: `<b>selling</b>${npc ? ' at ' + esc(npc) : ''}${nm ? ' (item ' + nm[1] + '/' + nm[2] + ')' : ''}${/sell/i.test(t) && npc ? '' : ' — ' + esc(nTask(t))}` };
    }
    if (/supply|restock|buying|buy |shop|gear ?up|upgrade/i.test(t) || (ie && ie.action === 'supply' && !ie.result && ieAge < 600000))
      return { ic: UI.inv, h: `<b>buying supplies</b> — ${esc(nTask(t))}${ie && ie.action === 'npc' && !ie.result ? ' · at ' + esc(String(ie.detail || '').replace(/^talking to /, '')) : ''}` };
    if (ie && /^(teleport|teleport-near|town|escape|unstuck)$/.test(ie.action) && !ie.result && ieAge < 60000)
      return { ic: UI.map, h: `<b>teleporting</b> — ${esc(iText(ie))}` };
    if (r && !r.done) {
      return { ic: UI.run, h: `walking to <b>${esc(r.label || 'the goal')}</b> (point ${Math.min(r.i + 1, r.pts.length)}/${r.pts.length}, ${kmS(r.left)} left)` + (st ? ` · <span class="bad">not moving ${st.sec} s</span>` : '') };
    }
    // NPC TARGETS 2026-10-13: a selected NPC (server.js moves it to doing.npc) is a visit, not a fight
    if (D.npc && D.npc.name) return { ic: UI.menuAction || UI.idle, h: `${(D.npc.dist != null && D.npc.dist > 300 ? 'going to' : 'at')} <b>${esc(D.npc.name)}</b>${D.npc.dist != null && D.npc.dist > 300 ? ' (' + kmS(D.npc.dist) + ' away)' : ''}` };
    if (D.target) {
      const tg = D.target;
      // TGTLVL 2026-10-14: name, level (green = below me, red = 3+ above), a small HP bar + %, distance only when far
      const hp = Math.max(0, Math.min(100, Math.round(+tg.hp || 0))), my = +c.level || 0, lv = +tg.lvl || 0, lc = !lv || !my ? '' : lv >= my + 3 ? ' hi' : lv <= my - 3 ? ' lo' : '';
      return { ic: UI.attack, h: `<span class="tgt"><b>${esc(tg.name)}</b>${lv ? `<span class="tgt-lv${lc}">L${lv}</span>` : ''}<span class="tgt-hp" title="${hp}% HP"><i style="width:${hp}%"></i></span><span class="tgt-pc">${hp}%</span>${tg.dist != null && tg.dist > 400 ? `<span class="tgt-d">${kmS(tg.dist)}</span>` : ''}</span>` + (ls && lsAge < 3000 && !HEALRE.test(sn) ? ' · ' + esc(sn) : '') };
    }
    if (ls && lsAge < 4000) return { ic: UI.skill, h: `used <b>${esc(sn)}</b>${ls.tgt ? ' on ' + esc(ls.tgt) : ''}` };
    if (c.combat) return { ic: UI.attack, h: '<b>in combat</b>' };
    if (D.resting) return { ic: UI.sit, h: `<b>resting</b> (HP ${c.hp}%, MP ${c.mp}%)` };
    const wi = walkIntent(c);
    if (wi) {
      const left = kmS(Math.hypot(wi.to[0] - c.x, wi.to[1] - c.y));
      const gm = wi.e.action === 'walk' && String(wi.e.detail || '').match(/^Giran recorded route to (\w+)/);
      if (gm) return { ic: UI.run, h: `walking to the <b>${esc(GIRAN_PLACE[gm[1]] || 'Giran ' + gm[1])}</b> (${left} left)` + (st ? ` · <span class="bad">not moving ${st.sec} s</span>` : '') };
      return { ic: UI.run, h: esc(iText(wi.e)) + ` (${left} left)` + (st ? ` · <span class="bad">not moving ${st.sec} s</span>` : '') };
    }
    // a running team step without anything more specific (selling at the NPC, enchanting, reporting ...)
    if (ts && inStep && !ts.done) return { ic: UI.party, h: `team step: ${esc(stepLabel(ts.a))}`, step: ts };
    if (ie && ie.action === 'gather team' && !ie.result && ieAge < 180000) return { ic: UI.party, h: esc(iText(ie)) };
    let m;
    if ((m = t.match(/^waiting for team: (.*)$/))) return { ic: UI.party, h: 'waiting for ' + whoList(m[1]) };
    if ((m = t.match(/^leading team: waiting at \S+ for (.*)$/))) return { ic: UI.party, h: 'waiting at a checkpoint for ' + whoList(m[1]) };
    if ((m = t.match(/^before (.+?): (.*)$/))) return { ic: UI.party, h: `before <b>${esc(m[1])}</b>: ${esc(m[2])}` };
    if (/waiting for orders/i.test(t)) return { ic: UI.idle, h: '<b>waiting for orders</b>' + esc(t.replace(/^waiting for orders/i, '')) };
    if (ie && ie.action === 'help' && !ie.result && ieAge < 20000) { const hm = String(ie.detail || '').match(/^(\S+) is being hit by (.*?) — helping/); if (hm) return { ic: UI.party, h: `helping <b>${esc(hm[1])}</b> — ${esc(hm[2])} is hitting them` }; }
    if ((m = t.match(/^pair (\S+): (.*)$/))) return { ic: UI.attack, h: `hunting pair <b>${esc(m[1].replace(/\+/g, ' + '))}</b>: ${esc(m[2])}` };
    // an older script inside a team step: say whose step it is
    if (/^regroup:?\s*$/.test(t)) {
      const lead = (d.members || []).find(x => x.name === d.leader);
      const ltr = lead && lead !== c ? tradeOf(lead, d) : null;
      if (ltr && ltr.other && ltr.other !== c.name) return { ic: UI.trade, h: `waiting while <b>${esc(ltr.giver)}</b> trades with <b>${esc(ltr.receiver)}</b>` };
      return { ic: UI.party, h: `in a team step with <b>${esc(d.leader || 'the leader')}</b> — waiting for the next step` };
    }
    if (D.follow) {
      const f = (d.members || []).find(x => x.name === D.follow);
      return { ic: UI.follow, h: `following <b>${esc(D.follow)}</b>${f && isFinite(f.x) ? ' (' + kmS(Math.hypot(f.x - c.x, f.y - c.y)) + ' away)' : ''}` };
    }
    if (c.name === d.leader && D.autolevel) return { ic: UI.attack, h: `leading: hunting at <b>${esc(D.autolevel.spot)}</b> · ${D.autolevel.kills5m} kills in 5 min` };
    return { ic: UI.idle, h: esc(nTask(t)) || 'idle' };
  }

  window.Activity = {
    member, tradeOf, tradeLine, stageText, STAGES, teamStepOf, stepLabel, route, walkIntent, track, stuck, stillSec, live, dur, whoList, srvNow, T,
    setSkew(ms) { if (isFinite(ms)) A.skew = ms; }, get skew() { return A.skew; }, _A: A,
  };
})();
