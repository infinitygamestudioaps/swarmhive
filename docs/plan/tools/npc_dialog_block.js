// DIALOG-PURE-BEGIN (DIALOG-2026-10-13; no host calls in here: docs/plan/tools/test_npc_dialog.js runs this block in node against a fake host)
// NPC DIALOG STATE MACHINE (owner 2026-10-13 17:55: "Are you timing the visits or using a state machine? It should just be: click, wait for the
// overview, press what appears, wait, press the next or do the action ... same with quests etc. — it should be straightforward").
// Before: every feature (openNpc, openShop/buyAt/sellAt, stashOpenList, whOpenWithdraw, qeDialog, dawnSignUp, gkTeleport, floorTeleport, the
// board's Cabinet/Career, clan pages, dyes, Kamaloka captain, class change) had its own "click -> sleep/wait N s -> click" loop with its own
// fixed timeout, and gave up while the late answer was still on its way (brain engine: 3-30 s agent ticks under load).
// Now ONE engine:  OPEN (target + talk; an NPC that already is my target gets ONE click) -> WAIT_PAGE -> PICK (link by text rules; the codes
// are read from THIS page) -> WAIT_RESULT (npc page | quest page | board page | shop list | warehouse list | packet | teleport | system message)
// -> ACT (buy / sell / deposit packet ...) -> WAIT_EFFECT (bag / adena / position or a system message) -> DONE | FAIL(reason in plain words).
//  * event-driven: every incoming event gets a sequence number (seq); a wait takes the first matching event AFTER its click and ends AT ONCE on
//    a refusal system message (bag full #1118, no clan warehouse right #709, Ziggurat #1303, other task #142, not enough adena #279 ...).
//  * timeouts are a safety net only and ADAPTIVE: soft = max(the caller's base, 3 x the measured answer time + 2 x ping + 1.5 s); past soft
//    the wait goes on while the agent is behind (no report for > staleMs, or not connected) up to cap; ONE re-click only when the answer is
//    provably lost (no answer event at all since the click AND the agent fresh).
//  * a late DUPLICATE page (the 2nd copy after a double click) is held back, never taken as the answer of the next click (it is only used
//    when nothing else came: then it IS the answer - "the same page again").
//  * every step is logged in one place: Logs/dialog.log + the intent log ("Taurin: clicked 'Deposit an item. (Clan Warehouse)' -> deposit
//    list (14 items) after 4.2 s").
//  * a feature is a small declarative flow: { name, steps: [ { open }, { pick: rules, expect, menu, until }, { act, effect } ... ] }.
const DLG_ANSWER = ['npc', 'quest', 'board', 'shop', 'whdep', 'whwd', 'multisell', 'packet', 'teleport'];
const DLG_PAGES = ['npc', 'quest'];
const DLG_WORDS = { npc: 'page', quest: 'quest page', board: 'board page', shop: 'shop list', whdep: 'deposit list', whwd: 'withdraw list', multisell: 'exchange list', packet: 'server packet', teleport: 'teleport', sys: 'server message' };
// refusal system messages (H5 SystemMsg ids from Data/base.db + their wording for L2Toggle's custom texts). only: used when a flow asks for
// the key; open: only right after my own click on the NPC (a cast's "target out of range" must not end a dialog)
const DLG_REFUSALS = [
  { key: 'bag', ids: [1118, 1119, 3262, 129, 422, 836, 2043], re: /weight and slot count|80 percent of capacity|weight is below 80|inventory is full|exceeded the weight limit|inventory volume limit/i, why: 'my bag is too full (slots / weight) — the server refuses' },
  { key: 'adena', ids: [279, 281], re: /not have enough adena|not enough adena/i, why: 'not enough adena' },
  { key: 'busy', ids: [142, 149], re: /already trading|use items while trading/i, why: 'the server says I am busy with another task (an open trade / shop window)' },
  { key: 'clanwh', ids: [709], re: /right to use the clan warehouse/i, why: 'no clan warehouse right (the clan leader must tick "Warehouse Search" for my rank: Alt+N -> Privileges)' },
  { key: 'whfar', ids: [162, 763], re: /too far (away )?from the warehouse/i, why: 'too far from the warehouse keeper' },
  { key: 'npcfar', ids: [2193], re: /too far from the npc/i, why: 'too far from the NPC' },
  { key: 'event', ids: [1303], re: /only be used during the quest event period/i, why: 'only possible in the event period (Seven Signs: not registered / not the winner)' },
  { key: 'level', ids: [2097], re: /level does not correspond|level is too low/i, why: 'my level does not fit' },
  { key: 'reenter', ids: [2100], re: /may not re-enter yet/i, why: 'may not re-enter yet (done today)' },
  { key: 'items', ids: [701, 341], re: /not have enough required items|not have enough materials/i, why: 'a required item is missing' },
  { key: 'sp', ids: [93, 278], re: /not have enough sp\b/i, why: 'not enough SP' },
  { key: 'siege', ids: [707], re: /village that is in a siege/i, why: 'that town is under siege' },
  { key: 'quests', ids: [401], re: /too many (ongoing |active )?quests/i, why: 'too many quests running (40)' },
  { key: 'whfull', ids: [130, 874, 1036, 1859], re: /warehouse is full|capacity of the warehouse|exceeded the quantity that can be/i, why: 'the warehouse is full', only: true },
  { key: 'target', ids: [22, 144, 109], re: /target is out of range|incorrect target|invalid target/i, why: 'the NPC is out of range / not a valid target', open: true },
];
/** a system message -> { key, why, id, text } when it refuses (o: { open: right after my NPC click, keys: extra 'only' keys, ignore: keys }) */
function dlgRefusal(id, text, o) {
  o = o || {}; const n = Number(id) || 0, t = String(text || '');
  for (const R of DLG_REFUSALS) {
    if (R.only && !(o.keys || []).includes(R.key)) continue;
    if (R.open && !o.open) continue;
    if ((o.ignore || []).includes(R.key)) continue;
    if (R.ids.includes(n) || R.re.test(t)) return { key: R.key, why: R.why, id: n, text: t };
  }
  return null;
}
/** a page's identity (duplicate check): the visible text + its link codes */
function dlgSig(html) { const s = String(html || ''); return s.length + ':' + s.replace(/\s+/g, ' ').slice(0, 600); }
/** the time budget of one wait: soft = the caller's base or 3 x the measured answer time + 2 x ping + 1.5 s; cap = the hard safety net */
function dlgBudget(base, lat, rtt) {
  const ew = Math.max(200, Number(lat) || 1500), r = Math.max(0, Number(rtt) || 0);
  const soft = Math.max(Number(base) || 6000, Math.round(3 * ew + 2 * r + 1500));
  return { soft, cap: Math.max(soft * 3, soft + 60000) };
}
/** what to do now in a wait without an answer: 'wait' | 'reclick' | 'fail'.
 *  s = { el (ms since the click), soft, cap, connected, age (ms since the agent's last report; 0 inside L2Swarm), staleMs, answered (some answer
 *  event came, not the one wanted), canReclick, reclicks, maxReclicks } */
function dlgDecide(s) {
  if (s.el >= s.cap) return 'fail';
  if (s.el < s.soft) return 'wait';
  if (s.connected === false || Number(s.age) > Number(s.staleMs || 2000)) return 'wait';     // the agent is behind: its answer may still come
  if (!s.answered && s.canReclick && (s.reclicks || 0) < (s.maxReclicks === undefined ? 1 : s.maxReclicks)) return 'reclick';   // provably lost
  return 'fail';
}
/** pick a link: rules = { fn: (links, ctx) -> link } (a feature's own picker) | one rule | [rules in priority order]; a rule = RegExp |
 *  string (exact, case/space insensitive) | { re, not, exact } | (link, ctx) => bool. skip(link) = already tried. */
function dlgPick(links, rules, ctx, skip) {
  const L = (links || []).filter(l => l && l.cmd && !(skip && skip(l)));
  if (rules && typeof rules === 'object' && typeof rules.fn === 'function') return rules.fn(L, ctx) || null;
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const one = (r, l) => {
    if (!r) return false;
    if (r instanceof RegExp) return r.test(String(l.text || ''));
    if (typeof r === 'string') return norm(l.text) === norm(r);
    if (typeof r === 'function') return !!r(l, ctx);
    if (typeof r === 'object') return (r.re ? r.re.test(String(l.text || '')) : r.exact !== undefined ? norm(l.text) === norm(r.exact) : true) && !(r.not && r.not.test(String(l.text || '')));
    return false;
  };
  const list = Array.isArray(rules) ? rules : [rules];
  for (const r of list) { const hit = L.find(l => one(r, l)); if (hit) return hit; }
  return null;
}
/** one line about an answer: "deposit list (14 items)", "page 'Welcome ...'", "teleport", "REFUSED: ..." */
function dlgDescribe(r, text) {
  if (!r) return 'nothing';
  if (r.ok && r.ev) {
    const d = r.ev.data || {}, k = r.ev.kind, n = Array.isArray(d.items) ? d.items.length : d.items && d.items.length !== undefined ? d.items.length : null;
    if (k === 'npc' || k === 'quest' || k === 'board') return `${DLG_WORDS[k]} '${String(text ? text(d.html) : '').slice(0, 60)}'${r.same ? ' (the same page again)' : ''}`;
    if (k === 'teleport') return `teleport to ${Math.round(Number(d.x) || 0)},${Math.round(Number(d.y) || 0)}`;
    return `${DLG_WORDS[k] || k}${n !== null ? ` (${n} items)` : ''}`;
  }
  if (r.sys) return `REFUSED: ${r.sys.why} (server #${r.sys.id}${r.sys.text ? ' ' + String(r.sys.text).slice(0, 80) : ''})`;
  return `FAILED: ${r.why || 'no answer'}`;
}
/**
 * The engine. H (host) = { now(), sleep(ms), setTimeout(f, ms), clearTimeout(t), lag() -> { connected, age, rtt } | null (null = inside
 * L2Swarm: always fresh), target() -> objId of my target, action(objId), bypass(cmd), links(html, board) -> [{ cmd, text }], text(html) -> plain,
 * log(line) }. Returns { ev, wait, open, click, effect, run, lat, stats, last, dup, seq }.
 */
function dlgEngine(H) {
  const E = { seq: 0, ring: [], waits: [], lat: { page: 1500, list: 1500, teleport: 3000, board: 1500, packet: 1500, effect: 800 }, dup: null, last: null,
    stats: { ok: 0, fail: 0, refused: 0, reclicks: 0, dups: 0, behind: 0, events: 0 }, staleMs: 2000, settleMs: 300 };
  const latKey = (k) => k === 'teleport' ? 'teleport' : k === 'board' ? 'board' : k === 'packet' ? 'packet' : /^(shop|whdep|whwd|multisell)$/.test(k) ? 'list' : k === 'effect' ? 'effect' : 'page';
  const lagNow = () => { let L = null; try { L = H.lag ? H.lag() : null; } catch (e) { L = null; } return L ? { connected: L.connected !== false, age: Math.max(0, Number(L.age) || 0), rtt: Math.max(0, Number(L.rtt) || 0) } : { connected: true, age: 0, rtt: 0 }; };
  const log = (line) => { try { if (H.log) H.log(line); } catch (e) { } };
  const secs = (ms) => (Math.round(ms / 100) / 10).toFixed(1);
  E.learn = (kind, ms) => { const k = latKey(kind); E.lat[k] = Math.round(Math.max(200, Math.min(30000, 0.7 * E.lat[k] + 0.3 * ms))); };
  /** an incoming event (kind in DLG_ANSWER, 'sys', 'target') */
  E.ev = (kind, data) => {
    const ev = { seq: ++E.seq, kind: String(kind), at: H.now(), data: data || {} };
    if (ev.data.html !== undefined) ev.sig = dlgSig(ev.data.html);
    E.ring.push(ev); if (E.ring.length > 80) E.ring.shift(); E.stats.events++;
    E.waits.slice().forEach(w => { try { w.feed(ev); } catch (e) { } });
    return ev;
  };
  /**
   * WAIT_RESULT: spec = { expect: [kinds], after: seq (default: now), base: ms, match(ev) -> bool, refuse: false | { open, keys, ignore },
   * onReclick(), maxReclicks (0), dupOk (take a duplicate as the answer), label }
   * -> { ok, ev, kind, ms, same, reclicks } | { ok: false, why, sys, ev (another answer), ms, behind }
   */
  E.wait = (spec) => new Promise((resolve) => {
    spec = spec || {};
    const expect = spec.expect || DLG_PAGES, after = spec.after === undefined ? E.seq : spec.after;
    const W = { t0: H.now(), clickAt: H.now(), reclicks: 0, held: null, heldAt: 0, answered: null, done: false, timer: null, behindSaid: false };
    const lk = latKey(expect[0]), L0 = lagNow();
    let B = dlgBudget(spec.base, E.lat[lk], L0.rtt);
    const finish = (r) => {
      if (W.done) return; W.done = true;
      if (W.timer) { try { H.clearTimeout(W.timer); } catch (e) { } }
      E.waits = E.waits.filter(x => x !== W);
      r.ms = H.now() - W.t0; r.reclicks = W.reclicks;
      if (r.ok) { E.stats.ok++; if (!r.same) E.learn(r.kind, H.now() - W.t0); }   // from the FIRST click: after a re-click the answer may be the first click's else if (r.sys) E.stats.refused++; else E.stats.fail++;
      E.last = r; resolve(r);
    };
    W.feed = (ev) => {
      if (W.done || ev.seq <= after) return;
      if (ev.kind === 'sys') {
        if (spec.refuse === false) return;
        const f = dlgRefusal(ev.data.id, ev.data.text, Object.assign({}, spec.refuse || {}, { open: !!(spec.refuse && spec.refuse.open) && H.now() - W.clickAt < 4000 }));
        if (f) finish({ ok: false, sys: f, why: f.why, kind: 'sys', ev });
        return;
      }
      if (ev.kind === 'target') return;
      if (!expect.includes(ev.kind) || (spec.match && !spec.match(ev))) { if (DLG_ANSWER.includes(ev.kind)) W.answered = ev; return; }
      if (!spec.dupOk && E.dup && ev.sig && ev.sig === E.dup.sig && E.dup.left > 0 && H.now() < E.dup.until) {
        E.dup.left--; E.stats.dups++; W.held = ev; W.heldAt = H.now(); W.answered = ev;
        log(`late duplicate of the ${DLG_WORDS[ev.kind] || ev.kind} ignored (seq ${ev.seq}${spec.label ? ', waiting for ' + spec.label : ''})`);
        return;
      }
      finish({ ok: true, ev, kind: ev.kind });
    };
    E.waits.push(W);
    E.ring.filter(ev => ev.seq > after).forEach(ev => W.feed(ev));            // came before the wait was set up
    const tick = () => {
      W.timer = null; if (W.done) return;
      const t = H.now();
      // a held duplicate and nothing else for a while: it IS the answer (the server sent the same page again)
      if (W.held && t - W.heldAt >= Math.min(B.soft, Math.max(2500, 2 * E.lat.page))) { finish({ ok: true, ev: W.held, kind: W.held.kind, same: true }); return; }
      const L = lagNow();
      const d = dlgDecide({ el: t - W.clickAt, soft: B.soft, cap: B.cap, connected: L.connected, age: L.age, staleMs: E.staleMs, answered: !!W.answered,
        canReclick: typeof spec.onReclick === 'function', reclicks: W.reclicks, maxReclicks: spec.maxReclicks || 0 });
      if (d === 'wait') {
        if (t - W.clickAt >= B.soft && !W.behindSaid) { W.behindSaid = true; E.stats.behind++; log(`${spec.label || 'answer'}: no answer after ${secs(t - W.clickAt)} s — the agent is ${L.connected ? secs(L.age) + ' s behind' : 'not connected'}, waiting on`); }
        W.timer = H.setTimeout(tick, 250); return;
      }
      if (d === 'reclick') {
        W.reclicks++; E.stats.reclicks++; W.clickAt = t; B = dlgBudget(spec.base, E.lat[lk], L.rtt);
        if (E.dup && E.dup.sig) { E.dup.left++; E.dup.until = t + B.soft; }                 // the lost click may still answer: one more copy is possible
        log(`${spec.label || 'answer'}: nothing came in ${secs(t - W.t0)} s and the agent is fresh — the click was lost, clicking once more`);
        try { spec.onReclick(); } catch (e) { }
        W.timer = H.setTimeout(tick, 250); return;
      }
      if (W.held) { finish({ ok: true, ev: W.held, kind: W.held.kind, same: true }); return; }
      if (W.answered) { finish({ ok: false, why: `got a ${DLG_WORDS[W.answered.kind] || W.answered.kind} instead of a ${expect.map(k => DLG_WORDS[k] || k).join(' / ')}`, ev: W.answered }); return; }
      finish({ ok: false, why: `no answer within ${secs(t - W.t0)} s${W.reclicks ? ' (clicked again once)' : ''}`, behind: !L.connected || L.age > E.staleMs });
    };
    if (!W.done) W.timer = H.setTimeout(tick, 250);
  });
  /** OPEN + WAIT_PAGE: npc = { objId, Name }; o = { base, tries (3), onNoAnswer(i) (walk around), label } -> wait result (+ html) */
  E.open = async (npc, o) => {
    o = o || {};
    const id = Number(npc.objId), name = String(npc.Name || npc.name || 'NPC'), tries = o.tries || 3;
    let r = null;
    for (let i = 0; i < tries; i++) {
      let targeted = false; try { targeted = Number(H.target()) === id; } catch (e) { }
      const after = E.seq, clicks = targeted ? 1 : 2;
      H.action(id);                                          // select (or talk, when it is my target already)
      if (clicks === 2) { await H.sleep(300); H.action(id); }   // talk
      r = await E.wait({ expect: DLG_PAGES, after, base: o.base, refuse: { open: true }, label: `the first page of ${name}`, dupOk: true, onReclick: () => H.action(id), maxReclicks: 1 });
      if (r.ok) {
        const extra = clicks - 1 + r.reclicks;                 // more copies of this page may still come (both clicks talked when it was my target already)
        E.dup = { sig: r.ev.sig, left: extra, until: H.now() + Math.max(4000, 3 * E.lat.page) };
        r.html = r.ev.data.html;
        log(`opened ${name} (${clicks === 1 ? '1 click: already my target' : 'select + talk'}${r.reclicks ? ', clicked again' : ''}) -> ${dlgDescribe(r, H.text)} after ${secs(r.ms)} s`);
        if (E.settleMs) await H.sleep(E.settleMs);
        return r;
      }
      log(`talk to ${name}: ${dlgDescribe(r)}${i + 1 < tries ? ' — try ' + (i + 2) : ''}`);
      if (r.sys && r.sys.key !== 'target') return r;
      if (o.onNoAnswer && i + 1 < tries) { try { await o.onNoAnswer(i); } catch (e) { } }
    }
    return r;
  };
  /** PICK done by the caller -> click the link + WAIT_RESULT. o = { expect, base, match, refuse, reclick (default false: only links whose answer
   *  is certain - menus, lists, teleports - may be clicked again, never an action such as a toggle / a confirm), from, label, dupOk } */
  E.click = async (link, o) => {
    o = o || {};
    const after = E.seq, send = () => H.bypass(link.cmd);
    send();
    const r = await E.wait({ expect: o.expect || DLG_PAGES, after, base: o.base, match: o.match, refuse: o.refuse === undefined ? {} : o.refuse, dupOk: o.dupOk,
      label: o.label || `'${link.text || link.cmd}'`, onReclick: o.reclick === true ? send : null, maxReclicks: o.reclick === true ? 1 : 0 });
    if (r.ok && r.ev && r.ev.data && r.ev.data.html !== undefined) r.html = r.ev.data.html;
    if (r.ok && r.reclicks && r.ev.sig) E.dup = { sig: r.ev.sig, left: r.reclicks, until: H.now() + Math.max(4000, 3 * E.lat.page) };   // both clicks may answer: the 2nd copy is no answer to the NEXT click
    log(`clicked '${String(link.text || link.cmd).slice(0, 70)}'${o.from ? ' at ' + o.from : ''} -> ${dlgDescribe(r, H.text)} after ${secs(r.ms)} s`);
    return r;
  };
  /** WAIT_EFFECT after an ACT: check() -> truthy when the effect is there (may be async); refusals end it at once. o = { check, base, refuse, label, poll } */
  E.effect = async (o) => {
    const after = E.seq, t0 = H.now(), base = o.base || 1500, poll = o.poll || 250;
    let B = dlgBudget(base, E.lat.effect, lagNow().rtt), said = false;
    for (;;) {
      let v = false; try { v = await o.check(); } catch (e) { v = false; }
      if (v) { E.learn('effect', H.now() - t0); const r = { ok: true, value: v, ms: H.now() - t0 }; if (o.label) log(`${o.label}: done after ${secs(r.ms)} s`); return r; }
      if (o.refuse !== false) {
        const sys = E.ring.filter(ev => ev.seq > after && ev.kind === 'sys').map(ev => dlgRefusal(ev.data.id, ev.data.text, o.refuse || {})).find(Boolean);
        if (sys) { const r = { ok: false, sys, why: sys.why, ms: H.now() - t0 }; log(`${o.label || 'action'}: ${dlgDescribe(r)}`); return r; }
      }
      const L = lagNow(), el = H.now() - t0;
      const d = dlgDecide({ el, soft: B.soft, cap: Math.min(B.cap, o.capMs || B.cap), connected: L.connected, age: L.age, staleMs: E.staleMs, answered: false, canReclick: false });
      if (d === 'fail') { const r = { ok: false, why: `no effect within ${secs(el)} s`, ms: el }; if (o.label) log(`${o.label}: ${r.why}`); return r; }
      if (d === 'wait' && el >= B.soft && !said) { said = true; if (o.label) log(`${o.label}: not yet after ${secs(el)} s — the agent is ${secs(L.age)} s behind, waiting on`); }
      await H.sleep(poll);
    }
  };
  /**
   * a FLOW: { name, board (links are board buttons too), steps: [
   *   { open: true, tries, base }                                       OPEN + WAIT_PAGE (ctx.npc)
   *   { pick: rules | { fn(links, ctx) }, menu: rules (a sub menu to try when nothing fits), depth (1), expect: [kinds], until: [kinds] (default: the
   *     non-page kinds of expect; a page answer then means the next round), base, refuse, reclick, onPage(ctx, html, round) -> 'stop' | void,
   *     onAnswer(ctx, r) -> 'stop' | void, need: false (no link = fine) }
   *   { act: async (ctx) => void, effect: (ctx) => truthy, base, refuse, label }      ACT + WAIT_EFFECT
   *   { call: async (ctx) => ({ ok, done, why }) }                                   a hook
   * ] }  ctx = { npc, page, vars... } -> { ok, why, sys, ctx, result }
   */
  E.run = async (flow, ctx) => {
    ctx = ctx || {}; ctx.trace = ctx.trace || [];
    const who = ctx.npc ? String(ctx.npc.Name || ctx.npc.name || '') : '';
    const fail = (why, extra) => { const r = Object.assign({ ok: false, why: `${flow.name}: ${why}`, ctx }, extra || {}); log(`${flow.name}${who ? ' at ' + who : ''}: FAILED — ${why}`); return r; };
    for (const st of flow.steps) {
      if (st.open) {
        const r = await E.open(ctx.npc, { base: st.base, tries: st.tries, onNoAnswer: ctx.onNoAnswer });
        ctx.trace.push({ step: 'open', ok: r.ok, ms: r.ms });
        if (!r.ok) return fail(r.sys ? r.sys.why : `${who} did not answer`, { sys: r.sys, noAnswer: !r.sys });
        ctx.page = r.html; ctx.pageKind = r.kind;
        if (st.onPage && st.onPage(ctx, ctx.page, -1) === 'stop') return { ok: true, ctx, stopped: true };
        continue;
      }
      if (st.pick) {
        const until = st.until || (st.expect || DLG_PAGES).filter(k => !DLG_PAGES.includes(k) && k !== 'board');
        const tried = {};
        let done = false;
        for (let round = 0; round < (st.depth || 1) && !done; round++) {
          if (!ctx.page) return fail(`no page to click on (${st.label || 'step'})`);
          if (st.onPage && round > 0 && st.onPage(ctx, ctx.page, round) === 'stop') return { ok: true, ctx, stopped: true };
          const links = H.links(String(ctx.page), !!(flow.board || st.board));
          const skip = (l) => !!tried[l.cmd + '|' + l.text];
          let link = dlgPick(links, st.pick, ctx, skip), via = 'pick';
          if (!link && st.menu) { link = dlgPick(links, st.menu, ctx, skip); via = 'menu'; }
          if (!link) { if (st.need === false) { done = true; break; } ctx.links = links; return fail(`no link for ${st.label || 'the next step'} — the page has: ${links.map(l => l.text).join(' | ').slice(0, 240) || '(no links)'}`, { links }); }
          tried[link.cmd + '|' + link.text] = 1;
          const ex = via === 'menu' ? DLG_PAGES.concat(flow.board || st.board ? ['board'] : []) : (st.expect || DLG_PAGES);   // a sub menu answers with a page
          const r = await E.click(link, { expect: ex, base: via === 'menu' ? (st.menuBase || st.base) : st.base, match: via === 'menu' ? undefined : st.match, refuse: st.refuse, reclick: st.reclick, from: who });
          ctx.trace.push({ step: st.label || 'pick', link: link.text, via, ok: r.ok, kind: r.kind, ms: r.ms });
          ctx.last = r; ctx.lastLink = link;
          if (st.onAnswer) { const s = st.onAnswer(ctx, r, link); if (s === 'stop') return { ok: true, ctx, stopped: true, result: r }; }
          if (!r.ok) return fail(r.sys ? r.sys.why : r.why, { sys: r.sys, result: r, link, via });
          if (until.includes(r.kind)) { ctx.result = r; done = true; break; }
          if (r.html !== undefined) { ctx.page = r.html; ctx.pageKind = r.kind; if (!until.length) { done = true; break; } continue; }
          ctx.result = r; done = true;
        }
        if (!done && until.length) return fail(`${st.label || 'the wanted window'} did not come after ${st.depth || 1} pages`);
        continue;
      }
      if (st.act) {
        try { await st.act(ctx); } catch (e) { return fail(`${st.label || 'action'}: ${e && e.message}`); }
        if (st.effect) {
          const r = await E.effect({ check: () => st.effect(ctx), base: st.base, refuse: st.refuse, label: `${who ? who + ': ' : ''}${st.label || 'action'}` });
          ctx.trace.push({ step: st.label || 'act', ok: r.ok, ms: r.ms });
          if (!r.ok) return fail(r.sys ? r.sys.why : r.why, { sys: r.sys });
        }
        continue;
      }
      if (st.call) {
        let r = null; try { r = await st.call(ctx); } catch (e) { r = { ok: false, why: e && e.message }; }
        if (r && r.ok === false) return fail(r.why || 'step failed', r);
        if (r && r.done) return Object.assign({ ok: true, ctx }, r);
      }
    }
    return { ok: true, ctx, result: ctx.result };
  };
  return E;
}
/** FLOW: a list window behind one or more dialog pages (shop list, warehouse deposit / withdraw list). o = { name, label, pick (rules | { fn }),
 *  menu, until: ['shop'] | ['whdep', 'whwd'] ..., ms, depth (3), onPage(html, round) } */
function dlgListFlow(o) {
  return { name: o.name, steps: [{ label: o.label, pick: o.pick, menu: o.menu, expect: o.until.concat(DLG_PAGES), until: o.until, depth: o.depth || 3, base: o.ms, reclick: true,
    onPage: o.onPage ? (ctx, html, round) => o.onPage(html, round) : undefined }] };
}
// DIALOG-PURE-END
