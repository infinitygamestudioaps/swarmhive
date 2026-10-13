// TEST NPC DIALOG (DIALOG-2026-10-13): the ONE NPC dialog state machine of swarm.js (DIALOG-PURE block) against a fake game server with a
// virtual clock: lagging answers (agent behind), late duplicate pages, refusals (system messages), lost clicks — for every flow (shop buy,
// sell, stash private + clan, quest start, gatekeeper teleport, Dawn sign-up, Cabinet toggle, class change on the board) + the pure helpers
// + source checks that every feature of swarm.js runs on the engine (no own "wait N s, click, wait" loops left).
//   node docs/plan/tools/test_npc_dialog.js [swarm.js]     (default Scripts_dev/swarm.js)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const ARG = process.argv.slice(2).find(a => !/^--/.test(a));   // flags such as --quick (the release test run) are not a file
const SW = ARG ? path.resolve(ARG) : path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SW, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (c) pass++; else fail++; };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i); if (i < 0 || j < 0) throw new Error('block not found: ' + b); return src.slice(i, j); };
const D = new Function(blk('// DIALOG-PURE-BEGIN', '// DIALOG-PURE-END') + '\nreturn { dlgEngine, dlgRefusal, dlgBudget, dlgDecide, dlgPick, dlgSig, dlgDescribe, dlgListFlow, DLG_PAGES, DLG_REFUSALS };')();
const ST = new Function(blk('// STASH-PURE-BEGIN', '// STASH-PURE-END') + '\nreturn { stashPickLink };')();
const WT = new Function(blk('// WHTAKE-PURE-BEGIN', '// WHTAKE-PURE-END') + '\nreturn { whPickWithdrawLink };')();

// ---------------------------------------------------------------- virtual clock
class VClock {
  constructor() { this.t = 1e12; this.q = []; this.id = 0; }
  now() { return this.t; }
  setTimeout(f, ms) { const id = ++this.id; this.q.push({ at: this.t + Math.max(0, Number(ms) || 0), f, id }); return id; }
  clearTimeout(id) { this.q = this.q.filter(x => x.id !== id); }
  sleep(ms) { return new Promise(r => this.setTimeout(r, ms)); }
  async run(p, maxMs) {
    let done = false, val, err; p.then(v => { done = true; val = v; }, e => { done = true; err = e; });
    const end = this.t + (maxMs || 600000);
    for (let guard = 0; !done && guard < 200000; guard++) {
      await new Promise(r => setImmediate(r)); if (done) break;
      this.q.sort((a, b) => a.at - b.at || a.id - b.id); const n = this.q.shift(); if (!n) break;
      if (n.at > end) { this.q.unshift(n); break; }
      this.t = Math.max(this.t, n.at); n.f();
    }
    await new Promise(r => setImmediate(r));
    if (err) throw err; if (!done) throw new Error('did not finish in virtual time');
    return val;
  }
}
// ---------------------------------------------------------------- page helpers like swarm.js (npcLinks / pageActions)
const a = (code, text) => `<a action="bypass -h ${code}">${text}</a><br>`;
const btn = (code, label) => `<button value="${label}" action="bypass ${code}" width=100 height=20>`;
const npcLinks = (h) => [...String(h).matchAll(/<a\b[^>]*action="bypass\s+(?:-h\s+)?([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({ cmd: m[1].trim(), text: m[2].replace(/<[^>]+>/g, '').trim() }));
const boardLinks = (h) => [...String(h).matchAll(/<button\b[^>]*value="([^"]*)"[^>]*action="bypass\s+([^"]+)"[^>]*>/gi)].map(m => ({ cmd: m[2].trim(), text: m[1].trim() })).concat(npcLinks(h));
const text = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- the fake server
// pages: { id: { kind: 'npc'|'quest'|'board', html, links: { code: action } } }, action = page id | { tp: [x,y,z] } | { shop: n } | { whdep: n } |
// { whwd: n } | { sys: id, text } | { fn: (W) => action }. Codes are mapped on the LAST page the server SENT (L2Toggle renumbers per page).
// o: { lat: ms | (kind, n) => ms, behind: [[from, to]] (agent stalled: nothing arrives, its report age grows), lose: n (the first n clicks never
//   reach the server), serverTarget (the NPC is my target at the server), staleTarget (the brain does not know it yet), dupLate: ms (the 2nd
//   copy of a page after a double click on a targeted NPC comes that much later) }
function mkWorld(pages, front, o) {
  o = o || {};
  const C = new VClock(), W = { C, clicks: [], recv: [], delivered: [], target: o.serverTarget ? 77 : 0, cur: null, n: 0, bag: { 57: 100000 }, cls: 0 };
  const t0 = C.now();
  const behind = (o.behind || []).map(([f, t]) => [t0 + f, t0 + t]);
  const inBehind = (t) => behind.find(([f, tt]) => t >= f && t < tt);
  const lat = (kind) => { W.n++; return typeof o.lat === 'function' ? o.lat(kind, W.n) : (o.lat === undefined ? 300 : o.lat); };
  const deliver = (kind, data, ms) => {
    let at = C.now() + ms; const b = inBehind(at); if (b) at = b[1] - 1;   // a stalled agent forwards everything when it wakes up (in order: before its next report)
    C.setTimeout(() => { W.delivered.push(kind); W.E.ev(kind, data); }, at - C.now());
  };
  const send = (act, ms) => {
    if (act === undefined || act === null) return;
    if (typeof act === 'object' && act.fn) act = act.fn(W);
    if (typeof act === 'string') { const P = pages[act]; W.cur = P; deliver(P.kind || 'npc', { html: P.html }, ms); return; }
    if (act.tp) { deliver('teleport', { x: act.tp[0], y: act.tp[1], z: act.tp[2] }, ms); return; }
    if (act.shop) { deliver('shop', { shopId: 18, items: new Array(act.shop).fill(0).map((_, i) => ({ Id: 1000 + i, Price: 10 })) }, ms); return; }
    if (act.whdep) { deliver('whdep', { items: new Array(act.whdep).fill(0).map((_, i) => ({ objId: 500 + i })) }, ms); return; }
    if (act.whwd) { deliver('whwd', { items: [], rows: new Array(act.whwd).fill(0).map((_, i) => ({ objId: 600 + i, id: 57, count: 1 })) }, ms); return; }
    if (act.sys) { deliver('sys', { id: act.sys, text: '#' + act.sys + ' ' + (act.text || '') }, ms); return; }
    if (act.page2) { send(act.page2[0], ms); send(act.page2[1], ms + (act.page2[2] || 500)); return; }
  };
  const host = {
    now: () => C.now(), sleep: (ms) => C.sleep(ms), setTimeout: (f, ms) => C.setTimeout(f, ms), clearTimeout: (t) => C.clearTimeout(t),
    lag: () => { const b = inBehind(C.now()); return { connected: true, age: b ? C.now() - b[0] : 120, rtt: 40 }; },
    target: () => (o.staleTarget ? 0 : W.target),
    action: (id) => {
      W.clicks.push('action'); if (o.lose && W.clicks.length <= o.lose) return;
      W.recv.push('action');
      if (W.target !== id) { W.target = id; return; }                       // the first click selects
      const extra = W.recv.filter(x => x === 'action').length > 1 && o.dupLate && W.recv.length >= 2 && W.recv[W.recv.length - 2] === 'action' && o.serverTarget;
      send(front, extra ? o.dupLate : lat('front'));
    },
    bypass: (cmd) => {
      W.clicks.push(cmd); if (o.lose && W.clicks.length <= o.lose) return;
      W.recv.push(cmd);
      const act = W.cur && W.cur.links ? W.cur.links[cmd] : (pages._board && pages._board[cmd]);
      send(act, lat(cmd));
    },
    links: (html, board) => board ? boardLinks(html) : npcLinks(html), text,
    log: (line) => { W.log.push(line); },
  };
  W.log = [];
  W.E = D.dlgEngine(host);
  W.host = host;
  return W;
}
const npc = { objId: 77, Name: 'NPC' };

// ================================================================== 1) pure helpers
console.log('1) pure helpers');
{
  ok(D.dlgRefusal(1118, '').key === 'bag' && D.dlgRefusal(709, '').key === 'clanwh' && D.dlgRefusal(1303, '').key === 'event' && D.dlgRefusal(142, '').key === 'busy' && D.dlgRefusal(279, '').key === 'adena',
    'refusals: #1118 bag, #709 clan warehouse right, #1303 Ziggurat event period, #142 other task, #279 adena');
  ok(D.dlgRefusal(0, '#1983 You do not have enough adena.').key === 'adena' && D.dlgRefusal(0, 'Your inventory is full.').key === 'bag', 'refusals by wording too (L2Toggle custom texts)');
  ok(!D.dlgRefusal(22, '') && D.dlgRefusal(22, '', { open: true }).key === 'target' && !D.dlgRefusal(144, 'That is an incorrect target.'), 'out of range / incorrect target (#22 #144) only right after my own NPC click (a cast must not end a dialog)');
  ok(!D.dlgRefusal(1036, '') && D.dlgRefusal(1036, '', { keys: ['whfull'] }).key === 'whfull' && !D.dlgRefusal(279, '', { ignore: ['adena'] }), '"only" keys (warehouse full) when a flow asks; ignore works');
  ok(!D.dlgRefusal(47, 'You begin to use a(n) Soulshot') && !D.dlgRefusal(0, 'Welcome'), 'ordinary messages are no refusal');
  const b0 = D.dlgBudget(5000, 1500, 0), b1 = D.dlgBudget(5000, 6000, 500);
  ok(b0.soft === 6000 && b1.soft === 6000 * 3 + 1000 + 1500 && b1.cap >= b1.soft * 3, `budget: soft follows the measured answer time (1.5 s -> ${b0.soft}, 6 s + ping 0.5 s -> ${b1.soft}), cap = the safety net (${b1.cap})`);
  const s = { el: 7000, soft: 6000, cap: 60000, connected: true, age: 100, staleMs: 2000, answered: false, canReclick: true, reclicks: 0, maxReclicks: 1 };
  ok(D.dlgDecide(Object.assign({}, s, { el: 5000 })) === 'wait' && D.dlgDecide(s) === 'reclick' && D.dlgDecide(Object.assign({}, s, { reclicks: 1 })) === 'fail',
    'decide: wait before soft; past soft + agent fresh + nothing came = re-click ONCE; then fail');
  ok(D.dlgDecide(Object.assign({}, s, { age: 2500 })) === 'wait' && D.dlgDecide(Object.assign({}, s, { age: 9000 })) === 'wait' && D.dlgDecide(Object.assign({}, s, { connected: false })) === 'wait' && D.dlgDecide(Object.assign({}, s, { age: 9000, el: 60000 })) === 'fail',
    'decide: never give up while the agent is behind (report 9 s old / not connected) — until the hard cap');
  ok(D.dlgDecide(Object.assign({}, s, { answered: true })) === 'fail' && D.dlgDecide(Object.assign({}, s, { canReclick: false })) === 'fail', 'decide: no re-click when something answered (not provably lost) or the link is an action');
  const L = [{ cmd: '00', text: 'Quest' }, { cmd: '01', text: 'Buy' }, { cmd: '02', text: 'Deposit an item. (Private Warehouse)' }];
  ok(D.dlgPick(L, [/^sell/i, /^buy/i]).cmd === '01' && D.dlgPick(L, 'quest').cmd === '00' && D.dlgPick(L, { re: /item/, not: /clan/ }).cmd === '02' && D.dlgPick(L, { fn: (x) => x[2] }).cmd === '02'
    && !D.dlgPick(L, /^buy/i, null, (l) => l.cmd === '01'), 'pick: rule list in priority order, exact text, {re,not}, a feature picker {fn}, tried links skipped');
}

// ================================================================== 2) flows against the fake server
// each flow: build(W) -> promise of { ok, ... } ; check(r, W, cond) -> [bool, msg]
const SHOP = { front: { kind: 'npc', html: '<html>Helvetia: hello' + a('00', 'Quest') + a('01', 'Buy/Sell/Refund.') + '</html>', links: { '00': 'q', '01': { shop: 12 } } }, q: { kind: 'npc', html: 'no quest', links: {} } };
const buyFlow = () => D.dlgListFlow({ name: 'shop', label: 'the Buy link', until: ['shop'], ms: 6000, depth: 3, pick: { fn: (L) => L.find(l => /^buy/i.test(l.text)) } });
const SELL = { front: { kind: 'npc', html: 'Trader' + a('00', 'Trade') + a('01', 'Quest'), links: { '00': 'trade' } }, trade: { kind: 'npc', html: 'What?' + a('00', 'Buy/Sell/Refund.') + a('01', 'Back'), links: { '00': { shop: 5 } } } };
const WHP = { front: { kind: 'npc', html: 'Taurin' + a('00', 'Private Warehouse.') + a('01', 'Clan Warehouse.') + a('02', 'Quest'), links: { '00': 'priv', '01': 'clan' } },
  priv: { kind: 'npc', html: 'Private' + a('00', 'Withdraw an item. (Private Warehouse)') + a('01', 'Deposit an item. (Private Warehouse)'), links: { '00': { whwd: 3 }, '01': { whdep: 14 } } },
  clan: { kind: 'npc', html: 'Clan' + a('00', 'Withdraw an item. (Clan Warehouse)') + a('01', 'Deposit an item. (Clan Warehouse)'), links: { '00': { whwd: 2 }, '01': { whdep: 9 } } } };
const stashFlow = (kind) => D.dlgListFlow({ name: 'stash', label: `the ${kind} deposit link`, until: ['whdep', 'whwd'], ms: 20000, depth: 3, pick: { fn: (L) => ST.stashPickLink(L, kind) } });
const QST = { front: { kind: 'npc', html: 'Lector: Welcome.' + a('00', 'Quest') + a('01', 'Ask about armor'), links: { '00': 'qp', '01': 'armor' } },
  qp: { kind: 'quest', html: 'Trader Lector: I need wolf pelts...' + a('00', "Say that you'll help.") + a('01', 'Decline'), links: { '00': 'started' } },
  started: { kind: 'quest', html: 'Hunt wolves and bring me their pelts.', links: {} }, armor: { kind: 'npc', html: 'armor talk', links: {} } };
const GK = { front: { kind: 'npc', html: 'Clarissa' + a('00', 'Teleport') + a('01', 'Quest'), links: { '00': 'menu' } },
  menu: { kind: 'npc', html: 'Where to?' + a('00', 'Town of Giran - free') + a('01', "Breka's Stronghold - 1200 adena") + a('02', 'Back'), links: { '01': { tp: [85546, 131328, -3672] } } } };
const gkFlow = (want) => ({ name: 'gatekeeper', steps: [{ label: `the link to '${want}'`, pick: { fn: (L) => L.find(l => l.text.toLowerCase().includes(want.toLowerCase())) },
  menu: { fn: (L) => L.find(l => /^(teleport|other|more|next)/i.test(l.text)) }, expect: ['teleport'], until: ['teleport'], depth: 4, base: 20000, menuBase: 5000, reclick: true }] });
const DAWN = { front: { kind: 'npc', html: 'Priest of Dawn' + a('00', 'Participation in the Seven Signs.') + a('01', 'Seal Status'), links: { '00': 'p2', '01': 'status' } },
  p2: { kind: 'npc', html: 'Will you?' + a('00', 'I wish to participate.') + a('01', 'Back'), links: { '00': 'p3' } },
  p3: { kind: 'npc', html: 'Which seal?' + a('00', 'Seal of Avarice') + a('01', 'Seal of Gnosis'), links: { '00': 'p4' } },
  p4: { kind: 'npc', html: 'Your application has been accepted. You are now a member of the Lords of Dawn.', links: {} }, status: { kind: 'npc', html: 'Seal Status page (WRONG)', links: {} } };
const dawnSteps = [/participation in the seven signs/i, /wish to participate/i, /seal of avarice/i];
const BOARD = { _board: { _bbshome: 'home' },
  home: { kind: 'board', html: 'Home' + btn('11', 'Buffs') + btn('14', 'Cabinet') + btn('13', 'Career'), links: { '14': 'cab', '13': 'career' } },
  cab: { kind: 'board', html: 'Cabinet' + btn('15', 'Statistic') + btn('18', 'Settings'), links: { '18': { page2: ['cab', 'settings', 700] } } },
  settings: { kind: 'npc', html: '<title>Settings</title>Forward Drop to Party Leader: Off' + btn('0a', 'Change'), links: { '0a': 'settings2' } },
  settings2: { kind: 'npc', html: '<title>Settings</title>Forward Drop to Party Leader: On' + btn('0a', 'Change'), links: {} },
  career: { kind: 'board', html: 'Career' + btn('20', 'Professions') + btn('21', 'Subclass'), links: { '20': 'prof' } },
  prof: { kind: 'board', html: 'Professions: choose' + btn('30', 'Orc Raider') + btn('31', 'Orc Monk'), links: { '30': { fn: (W) => { W.cls = 45; return 'done'; } } } },
  done: { kind: 'board', html: 'Congratulations, you are now an Orc Raider', links: {} } };
async function boardTo(W, labels, final) {
  W.host.bypass = ((b) => (cmd) => { if (cmd === '_bbshome') W.cur = { links: BOARD._board }; b(cmd); })(W.host.bypass);
  let r = await W.E.click({ cmd: '_bbshome', text: 'home' }, { expect: ['board'], base: 5000, reclick: true });
  if (!r.ok) return r;
  let html = r.html;
  for (const lb of labels) {
    const l = boardLinks(html).find(x => x.text === lb); if (!l) return { ok: false, why: 'no ' + lb };
    const prev = html;
    r = await W.E.click(l, { expect: ['board', 'npc', 'quest'], base: 5000, reclick: lb !== final, match: (ev) => !(ev.kind === 'board' && text(ev.data.html) === text(prev)) });
    if (!r.ok) return r; html = r.html;
  }
  return r;
}
const FLOWS = {
  'shop buy': { pages: SHOP, run: async (W) => {
    const o = await W.E.open(npc, { base: 5000 }); if (!o.ok) return o;
    const fr = await W.E.run(buyFlow(), { npc, page: o.html }); if (!fr.ok) return fr;
    // ACT: the buy packet -> WAIT_EFFECT: the bag (or a refusal)
    W.host.bypass('BUY'); if (W.opts.refuseAct) W.C.setTimeout(() => W.E.ev('sys', { id: 279, text: '#279 You do not have enough adena.' }), 600);
    else W.C.setTimeout(() => { W.bag[1006] = 100; }, W.opts.actLat || 900);
    const ef = await W.E.effect({ check: () => (W.bag[1006] || 0) > 0, base: 1500, label: 'buy' });
    return Object.assign({ list: fr.result.ev.data.items.length }, ef);
  }, okMsg: (r) => `shop list (${r.list} items) + bought` },
  'sell': { pages: SELL, run: async (W) => {
    const o = await W.E.open(npc, { base: 5000 }); if (!o.ok) return o;
    const fr = await W.E.run(D.dlgListFlow({ name: 'shop', label: 'Buy/Sell', until: ['shop'], ms: 6000, pick: { fn: (L) => L.find(l => /^buy/i.test(l.text)) }, menu: { fn: (L) => L.find(l => /trade/i.test(l.text)) } }), { npc, page: o.html });
    if (!fr.ok) return fr;
    const a0 = W.bag[57]; W.C.setTimeout(() => { W.bag[57] += 777; }, W.opts.actLat || 1200);
    const ef = await W.E.effect({ check: () => W.bag[57] !== a0, base: 1500, label: 'sale' });
    return Object.assign({ list: fr.result.ev.data.items.length }, ef);
  }, okMsg: (r) => `sub menu -> shop list -> sold (+adena)` },
  'stash private': { pages: WHP, run: async (W) => {
    const o = await W.E.open(npc, { base: 5000 }); if (!o.ok) return o;
    const fr = await W.E.run(stashFlow('private'), { npc, page: o.html }); if (!fr.ok) return fr;
    return { ok: fr.result.kind === 'whdep', n: fr.result.ev.data.items.length, link: fr.ctx.lastLink.text };
  }, okMsg: (r) => `deposit list (${r.n} items) via '${r.link}'` },
  'stash clan': { pages: WHP, run: async (W) => {
    if (W.opts.refuse) WHP.clan.links['01'] = { sys: 709, text: 'You do not have the right to use the clan warehouse.' }; else WHP.clan.links['01'] = { whdep: 9 };
    const o = await W.E.open(npc, { base: 5000 }); if (!o.ok) return o;
    const fr = await W.E.run(stashFlow('clan'), { npc, page: o.html }); if (!fr.ok) return fr;
    return { ok: fr.result.kind === 'whdep', n: fr.result.ev.data.items.length, link: fr.ctx.lastLink.text };
  }, okMsg: (r) => `clan deposit list (${r.n} items) via '${r.link}'`, refuseKey: 'clanwh' },
  'whtake private': { pages: WHP, run: async (W) => {
    const o = await W.E.open(npc, { base: 5000 }); if (!o.ok) return o;
    const fr = await W.E.run(D.dlgListFlow({ name: 'whtake', until: ['whdep', 'whwd'], ms: 6000, pick: { fn: (L) => WT.whPickWithdrawLink(L, 'private') } }), { npc, page: o.html }); if (!fr.ok) return fr;
    return { ok: fr.result.kind === 'whwd', n: fr.result.ev.data.rows.length };
  }, okMsg: (r) => `withdraw list (${r.n} rows)` },
  'quest start': { pages: QST, run: async (W) => {
    if (W.opts.refuse) QST.front.links['00'] = { sys: 1118, text: "Unable to process this request until your inventory's weight and slot count are less than 80 percent of capacity." }; else QST.front.links['00'] = 'qp';
    const o = await W.E.open(npc, { base: 5000 }); if (!o.ok) return o;
    let r = await W.E.click(npcLinks(o.html).find(l => l.text === 'Quest'), { expect: D.DLG_PAGES, base: 15000 }); if (!r.ok) return r;
    if (!/wolf pelts/.test(r.html)) return { ok: false, why: 'the answer to "Quest" was not the quest window: ' + text(r.html).slice(0, 60) };
    r = await W.E.click(npcLinks(r.html).find(l => /help/.test(l.text)), { expect: D.DLG_PAGES, base: 15000 }); if (!r.ok) return r;
    return { ok: /Hunt wolves/.test(r.html), kind: r.kind };
  }, okMsg: (r) => `quest window -> started (${r.kind} page)`, refuseKey: 'bag' },
  'gatekeeper teleport': { pages: GK, run: async (W) => {
    if (W.opts.refuse) GK.menu.links['01'] = { sys: 279, text: 'You do not have enough adena.' }; else GK.menu.links['01'] = { tp: [85546, 131328, -3672] };
    const o = await W.E.open(npc, { base: 5000 }); if (!o.ok) return o;
    const fr = await W.E.run(gkFlow("Breka's Stronghold"), { npc, page: o.html }); if (!fr.ok) return fr;
    return { ok: fr.result.kind === 'teleport', to: fr.result.ev.data };
  }, okMsg: (r) => `menu -> teleport to ${r.to.x},${r.to.y}`, refuseKey: 'adena' },
  'Dawn sign-up': { pages: DAWN, run: async (W) => {
    const o = await W.E.open(npc, { base: 5000 }); if (!o.ok) return o;
    let html = o.html;
    for (let i = 0; i < 3; i++) {
      const L = npcLinks(html); let l = null; for (const re of dawnSteps) { l = L.find(x => re.test(x.text)); if (l) break; }
      if (!l) return { ok: false, why: 'no link on ' + text(html).slice(0, 40) };
      const r = await W.E.click(l, { expect: D.DLG_PAGES, base: 15000, reclick: false }); if (!r.ok) return r; html = r.html;
    }
    return { ok: /accepted/.test(html), html };
  }, okMsg: () => 'participation -> I wish -> Seal of Avarice -> accepted (codes 00 on every page)' },
  'Cabinet toggle': { pages: BOARD, board: true, run: async (W) => {
    const r = await boardTo(W, ['Cabinet', 'Settings', 'Change'], 'Change'); if (!r.ok) return r;
    return { ok: /: On/.test(r.html), html: r.html };
  }, okMsg: () => 'board home -> Cabinet -> Settings (NPC-style page) -> toggle: the re-sent Cabinet page ignored, Forward Drop On' },
  'class change board': { pages: BOARD, board: true, run: async (W) => {
    const r = await boardTo(W, ['Career', 'Professions', 'Orc Raider'], 'Orc Raider'); if (!r.ok) return r;
    const ef = await W.E.effect({ check: () => W.cls === 45, base: 1500, label: 'class' });
    return { ok: ef.ok && /Congratulations/.test(r.html) };
  }, okMsg: () => 'Career -> Professions -> Orc Raider -> class 45' },
};
// conditions: normal | lag (agent 9 s behind on the way) | dup (stale target: double click, 2nd front page 3 s late) | refuse | lost (first click lost, agent fresh)
const COND = {
  normal: { o: {} },
  lag: { o: { lat: (k, n) => (n % 2 ? 2500 : 4000), behind: [[1000, 10000], [14000, 22000]] } },
  dup: { o: { serverTarget: true, staleTarget: true, dupLate: 1200, lat: (k) => (k === 'front' ? 300 : 2500) } },
  lost: { o: { lose: 1 } },
  refuse: { o: {}, refuse: true },
};
(async () => {
  console.log('2) every flow x every condition (fake server, virtual clock)');
  for (const [fname, F] of Object.entries(FLOWS)) {
    for (const [cname, Cc] of Object.entries(COND)) {
      if (cname === 'refuse' && !F.refuseKey && fname !== 'shop buy') continue;
      if (cname === 'dup' && F.board) continue;                        // no NPC double click on the board
      const W = mkWorld(F.pages, F.board ? null : 'front', Cc.o); W.opts = { refuse: !!Cc.refuse, refuseAct: !!Cc.refuse && fname === 'shop buy' };
      const t0 = W.C.now(); let r;
      try { r = await W.C.run(F.run(W), 600000); } catch (e) { r = { ok: false, why: 'THROW ' + e.message }; }
      const secs = Math.round((W.C.now() - t0) / 100) / 10;
      const sent = W.clicks.length;
      if (cname === 'refuse') {
        const key = F.refuseKey || 'adena', got = r.sys && r.sys.key;
        ok(!r.ok && got === key && secs < 6, `${fname} / refuse: ends AT ONCE (${secs} s) with the reason: ${r.sys ? r.sys.why : r.why}`);
      } else if (cname === 'lost') {
        ok(r.ok, `${fname} / lost click: ${r.ok ? F.okMsg(r) : 'FAILED ' + (r.why || '')} — ${sent} clicks for ${W.recv.length} received (one re-click), ${secs} s`);
        ok(sent === W.recv.length + 1, `${fname} / lost click: exactly ONE extra click (sent ${sent}, received ${W.recv.length})`);
      } else if (cname === 'lag') {
        ok(r.ok, `${fname} / agent behind: ${r.ok ? F.okMsg(r) : 'FAILED ' + (r.why || '')} after ${secs} s`);
        ok(W.E.stats.reclicks === 0 && sent === W.recv.length, `${fname} / agent behind: no re-click while the agent is behind (${W.E.stats.reclicks} re-clicks, ${W.E.stats.behind} "behind" waits)`);
      } else if (cname === 'dup') {
        ok(r.ok && W.E.stats.dups >= 1, `${fname} / late duplicate: ${r.ok ? F.okMsg(r) : 'FAILED ' + (r.why || '')} (${W.E.stats.dups} duplicate(s) held back, ${secs} s)`);
      } else {
        ok(r.ok && W.E.stats.reclicks === 0, `${fname}: ${r.ok ? F.okMsg(r) : 'FAILED ' + (r.why || '')} (${sent} clicks, ${secs} s)`);
      }
    }
  }

  console.log('3) details');
  { // the DAWNCODES hazard: the same code '00' on every page; a late page must never trigger a re-click (it would hit another link)
    const W = mkWorld(DAWN, 'front', { lat: (k, n) => (n === 3 ? 9000 : 400), behind: [[2000, 12000]] }); W.opts = {};
    const r = await W.C.run(FLOWS['Dawn sign-up'].run(W));
    ok(r.ok && !W.recv.includes('01') && W.recv.filter(c => c === '00').length === 3, `Dawn: page 2 nine seconds late (agent behind): no re-click, 3 clicks on '00', never Seal Status (${W.recv.join(',')})`);
  }
  { // Dawn with a lost click and a FRESH agent: reclick:false -> fails with "no answer" instead of clicking a code that may mean another link
    const W = mkWorld(DAWN, 'front', { lose: 0 }); W.opts = {};
    const o = await W.C.run(W.E.open(npc, { base: 5000 }));
    W.host.bypass = ((b) => (cmd) => { W.clicks.push('LOST ' + cmd); })(W.host.bypass);
    const r = await W.C.run(W.E.click(npcLinks(o.html)[0], { expect: D.DLG_PAGES, base: 15000, reclick: false }));
    ok(!r.ok && /no answer/.test(r.why) && W.clicks.filter(c => /^LOST/.test(c)).length === 1, `an action link (reclick:false) is never clicked twice: ${r.why}`);
  }
  { // duplicate page: double click on an NPC that already is my target at the server -> 2 front pages; the 2nd (3 s late) is NOT the answer of "Quest"
    const W = mkWorld(QST, 'front', { serverTarget: true, staleTarget: true, dupLate: 3000, lat: (k) => (k === '00' ? 4000 : 300) }); W.opts = {};
    QST.front.links['00'] = 'qp';
    const r = await W.C.run(FLOWS['quest start'].run(W));
    ok(r.ok && W.E.stats.dups >= 1 && W.log.some(l => /late duplicate/.test(l)), `quest: the late 2nd front page (3 s) came before the quest window (4 s) and was held back — quest started (${W.log.filter(l => /duplicate/.test(l)).length} log line)`);
  }
  { // same page again with nothing else: a held duplicate IS the answer after a short while ("the same page again")
    const W = mkWorld({ front: { kind: 'npc', html: 'Hi' + a('00', 'Talk'), links: { '00': 'front' } } }, 'front', { serverTarget: true, staleTarget: true, dupLate: 200, lat: 300 }); W.opts = {};
    const o = await W.C.run(W.E.open(npc, { base: 5000 }));
    W.E.dup.left = 1; W.E.dup.until = W.C.now() + 60000;               // a 2nd copy is still expected
    const r = await W.C.run(W.E.click(npcLinks(o.html)[0], { expect: D.DLG_PAGES, base: 5000 }));
    ok(r.ok && r.same === true, `a page equal to the open page with nothing else coming = "the same page again" (same: ${r.same}, ${Math.round(r.ms / 100) / 10} s)`);
  }
  { // targeted NPC: ONE click; not targeted: select + talk
    const W1 = mkWorld(SHOP, 'front', { serverTarget: true }); W1.opts = {}; await W1.C.run(W1.E.open(npc, {}));
    const W2 = mkWorld(SHOP, 'front', {}); W2.opts = {}; await W2.C.run(W2.E.open(npc, {}));
    ok(W1.clicks.length === 1 && W2.clicks.length === 2, `open: my target already -> 1 click (${W1.clicks.length}); else select + talk (${W2.clicks.length})`);
  }
  { // sequence numbers: a page that came BEFORE the click is never its answer
    const W = mkWorld(SHOP, 'front', {}); W.opts = {};
    W.E.ev('npc', { html: 'old page' + a('00', 'x') });
    const p = W.E.wait({ expect: D.DLG_PAGES, base: 2000 });
    const r = await W.C.run(p);
    ok(!r.ok && /no answer/.test(r.why), 'a page from before the wait is not its answer (sequence numbers)');
  }
  { // learning: answer times are learned; a slow server raises the soft deadline (fewer false "no answer")
    const W = mkWorld(SHOP, 'front', { lat: 7000 }); W.opts = {};
    for (let i = 0; i < 3; i++) await W.C.run(W.E.open(npc, { base: 5000 }));
    ok(W.E.lat.page > 2500, `measured answer time learned: ${W.E.lat.page} ms after three 7 s answers`);
  }
  { // lost answer and agent STALE -> no re-click, waits until the cap, then fails without clicking twice
    const W = mkWorld(SHOP, 'front', { lat: 300, behind: [[0, 400000]] }); W.opts = {};
    const o = await W.C.run(W.E.open(npc, { base: 5000, tries: 1 }));
    ok(!o.ok && W.clicks.length === 2 && o.behind, `nothing ever came, agent stalled: no re-click (${W.clicks.length} clicks = select + talk), gave up only at the cap (${Math.round(o.ms / 1000)} s)`);
  }
  { // the log line format
    const W = mkWorld(WHP, 'front', {}); W.opts = {};
    await W.C.run(FLOWS['stash clan'].run(W));
    const line = W.log.find(l => /Deposit an item\. \(Clan Warehouse\)/.test(l));
    ok(!!line && /clicked 'Deposit an item\. \(Clan Warehouse\)' at NPC -> deposit list \(9 items\) after \d+\.\d s/.test(line), `log: "${line}"`);
  }

  console.log('4) swarm.js runs every dialog on the engine');
  const fnSrc = (head, len) => { const i = src.indexOf(head); return i < 0 ? '' : src.slice(i, i + (len || 6000)); };
  const cut = (head) => { const i = src.indexOf(head); if (i < 0) return ''; const j = src.indexOf('\nasync function ', i + 10), k = src.indexOf('\nfunction ', i + 10); return src.slice(i, Math.min(j < 0 ? 1e9 : j, k < 0 ? 1e9 : k)); };
  const checks = [
    ['openNpc', 'async function openNpcInner(', /DLG\.open\(/],
    ['gatekeeper', 'async function gkTeleportInner(', /DLG\.run\(\{ name: 'gatekeeper'/],
    ['shop (openShop)', 'async function openShop(', /DLG\.run\(dlgListFlow\(\{ name: 'shop'/],
    ['buy (buyAt)', 'async function buyAt(', /DLG\.effect\(/],
    ['sell (sellAt)', 'async function sellAt(', /DLG\.effect\(/],
    ['shop scan', 'async function scanClick(', /DLG\.click\(/],
    ['stash deposit list', 'async function stashOpenList(', /DLG\.run\(dlgListFlow\(\{ name: 'stash'/],
    ['stash deposit effect', 'async function stashDepositAt(', /DLG\.effect\(/],
    ['warehouse withdraw (!whtake)', 'async function whOpenWithdraw(', /DLG\.run\(dlgListFlow\(\{ name: 'whtake'/],
    ['warehouse (clan list)', 'async function openWarehouse(', /dlgWhClick\(/],
    ['quest engine', 'async function qeDialog(', /DLG\.click\(/],
    ['old quest legs', 'async function clickQuestDialog(', /dlgPage\(/],
    ['Dawn sign-up', 'async function dawnSignUp(', /dlgPage\(link, 15000, npc\.Name, \{ reclick: false \}\)/],
    ['seal stones', 'async function dawnContribute(', /dlgPage\(/],
    ['floor teleport', 'async function floorTeleport(', /DLG\.click\(/],
    ['Ziggurat', 'async function zigguratEnter(', /dlgTpOrPage\(/],
    ['Kamaloka captain', 'async function enterKamaloka(', /dlgTpOrPage\(/],
    ['epic guides', 'async function epicDialogChain(', /DLG\.click\(/],
    ['clan create', 'async function clanCreateAt(', /dlgPage\(/],
    ['village master', 'async function villageMasterClick(', /dlgPage\(/],
    ['clan level up', 'async function clanLevelUp(', /dlgPage\(/],
    ['clan quests', 'async function cqTalk(', /dlgPage\(/],
    ['siege', 'async function siegeRegister(', /dlgPage\(/],
    ['class master', 'async function classMasterChange(', /dlgPage\(/],
    ['soul crystal', 'async function soulTalk(', /dlgPage\(/],
    ['dyes', 'async function dyeMine(', /DLG\.click\(link, \{ expect: \['packet'\]/],
    ['board (Cabinet / Career)', 'function pageRequest(', /DLG\.click\(/],
    ['board buffs', 'function bbsRequest(', /DLG\.click\(/],
  ];
  for (const [name, head, re] of checks) {
    const body = cut(head);
    if (!body && /^epic/.test(name)) { console.log(`  (skipped: ${name} - owner-only code, not in the public package)`); continue; }   // PKGSKIP-2026-10-13
    ok(!!body && re.test(body), `${name}: on the dialog engine`);
    ok(!/waitNpcHtml\(|waitTeleport\(|waitShop\(|waitWarehouse\(|bbsWaiter|npcWaiter|Promise\.race\(\[/.test(body.replace(/typeof waitNpcHtml === 'function' \? waitNpcHtml\(6000\)/g, '')), `${name}: no own wait/race loop left`);
  }
  ok(/function waitNpcHtml\(ms\) \{ return DLG\.wait\(/.test(src) && /function waitShop\(ms\) \{ return DLG\.wait\(/.test(src) && /function waitWarehouse\(ms\) \{ return DLG\.wait\(/.test(src), 'the old waits (still used by a few helpers) are views of the engine');
  for (const ev of ["DLG.ev('npc'", "DLG.ev('quest'", "DLG.ev('board'", "DLG.ev('shop'", "DLG.ev('whdep'", "DLG.ev('whwd'", "DLG.ev('teleport'", "DLG.ev('sys'", "DLG.ev('packet'"])
    ok(src.includes(ev), `event into the engine: ${ev})`);
  ok(/Logs\\\\dialog\.log/.test(src) && /dialog: \$\{line\}/.test(src), 'every step logged in Logs/dialog.log + the intent log');
  console.log(`\n${pass} ok, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
