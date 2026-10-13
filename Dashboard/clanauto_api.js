// CLAN AUTOMATION API (user 2026-10-12: "optimize the /clan section, there are too many manual tasks in there"). Loaded by server.js (one
// hook, BEFORE the key check like fundpage_api.js; the API checks the key itself). Public (no secrets): /clanauto.js, /clanauto.css.
//   GET  /api/clanauto   one status line per automation (what runs by itself, what waits for what) + the "needs you" list
//   POST /api/clanauto   { action: 'set', key, on }            switch an automation (key: levelUp | invite | warehouseLook | skillLearn |
//                                                              skillFocus | questDispatch | questActivate | levelQuests)
//                        { action: 'inviteParty', leader, on } tick / untick a whole party for invites (its current AND future members)
//                        { action: 'handover', giver }      CLANHAND 2026-10-13: "!clanhand <giver>" = hand the clan level item to the clan leader now
// Switches: Scripts/data/clan_quests.json clan.auto (swarm.js CLANAUTO reads it live; missing = default) — except levelUp, which stays in
// Logs/clan_auto.json (swarm.js clanAutoOn(), the old "!clanlevel auto on|off"). Every write: backup in Settings/backup, tmp + rename, one line
// in Logs/dashboard_commands.log.
// start(ctx): every 10 min the CLAN LEVEL QUEST dispatcher (clan.auto.levelQuests, default OFF): the next automated step of the quest that fits
// the clan level (2 = Blood Mark, 3 = Q501, 4 = Q503) is sent as "!clanquest <id> <n>" — hunt steps to the party with the highest lowest level
// that fits (min level), talk / level-up steps to the clan leader; never while that leader is in a raid / mission, max once per step per 2 h,
// a failed step waits 1 h; manual steps are only reported ("needs you"). Log: Logs/clan.log + Logs/clan_autodispatch.json.
// The clan RAID quest call-in (server.js clanDispatch) uses autoOn(cq, 'questDispatch') + activeQuests(cq, clvl) from here.
'use strict';
const fs = require('fs'), path = require('path');
const STATIC = { '/clanauto.js': 'application/javascript; charset=utf-8', '/clanauto.css': 'text/css; charset=utf-8' };
const DEF = { invite: true, warehouseLook: true, skillLearn: true, skillFocus: true, questDispatch: true, questActivate: false, levelQuests: false, itemHandover: true };   // itemHandover: CLANHAND 2026-10-13
const KEYS = Object.keys(DEF).concat(['levelUp']);
const LQ_FOR_LEVEL = { 2: 'bloodmark', 3: '501', 4: '503' };
const cqFile = (ctx) => process.env.SWARM_CLANQUESTS_FILE || path.join(ctx.DATA, 'clan_quests.json');
const autoFile = (ctx) => process.env.SWARM_CLANAUTO_FILE || path.join(ctx.LOGS, 'clan_auto.json');
const dispFile = (ctx) => path.join(ctx.LOGS, 'clan_autodispatch.json');
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const ago = (t) => { const s = Math.round((Date.now() - (typeof t === 'number' ? t : Date.parse(t))) / 1000); if (!isFinite(s)) return '?'; return s < 90 ? s + ' s ago' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };

function rd(ctx, F, def) { try { return ctx.readJson(F, def); } catch (e) { return def; } }
function writeAtomic(ctx, F, obj, tag) {
  try { if (tag && fs.existsSync(F)) { const B = path.join(ctx.ROOT, 'Settings', 'backup'); fs.mkdirSync(B, { recursive: true }); fs.copyFileSync(F, path.join(B, `${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`)); } } catch (e) { }
  const tmp = F + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj, null, 2)); fs.renameSync(tmp, F);
}
function logLine(ctx, msg) { try { fs.appendFileSync(path.join(ctx.LOGS, 'dashboard_commands.log'), `${new Date().toISOString()} clan tab: ${msg}\n`); } catch (e) { } }
function clanLog(ctx, msg) { try { fs.appendFileSync(path.join(ctx.LOGS, 'clan.log'), `${new Date().toISOString()} [dashboard] ${msg}\r\n`); } catch (e) { } }

/** every switch with its default; levelUp from Logs/clan_auto.json */
function flags(cq, ctx) {
  const a = (cq && cq.clan && cq.clan.auto) || {}, out = {};
  Object.keys(DEF).forEach(k => { out[k] = typeof a[k] === 'boolean' ? a[k] : DEF[k]; });
  out.levelUp = ctx ? !!(rd(ctx, autoFile(ctx), {}) || {}).levelUp : false;
  return out;
}
function autoOn(cq, key) { const a = (cq && cq.clan && cq.clan.auto) || {}; return typeof a[key] === 'boolean' ? a[key] : !!DEF[key]; }
/** clan raid quests that count as active: ticked ones + (questActivate) every one the clan level allows */
function activeQuests(cq, clvl) {
  const set = new Set(((cq && cq.clan && cq.clan.activeQuests) || []).map(String));
  if (autoOn(cq, 'questActivate')) Object.entries((cq && cq.quests) || {}).forEach(([id, q]) => { if (num(clvl) >= num(q.clanLevel)) set.add(String(id)); });
  return [...set];
}
/** the real clan level: L2Swarm reports Me.Clan.Level 0, the clan intel (server member list) and the level-up record know better */
function clanLevelOf(st, cq) {
  st = st || {}; return Math.max(num(st.clanInfo && st.clanInfo.level), num(st.nextLevel && st.nextLevel.level), num(st.clan && st.clan.level), num(cq && cq.clan && cq.clan.level));
}
function teamsOf(chars) {
  const by = {};
  (chars || []).forEach(c => { const t = (typeof c.party === 'string' && c.party) || c.name; (by[t] = by[t] || { leader: t, members: [] }).members.push(c); });
  return Object.values(by).map(t => { const L = t.members.map(m => num(m.level)).filter(Boolean); const lc = t.members.find(m => m.name === t.leader) || {};
    return { leader: t.leader, size: t.members.length, min: L.length ? Math.min(...L) : 0, max: L.length ? Math.max(...L) : 0, names: t.members.map(m => m.name),
      online: (lc.ageSec || 1e9) <= 120, busy: /raid|mission|kamaloka|siege/i.test(String(lc.mode || '')), mode: String(lc.mode || '') }; });
}
/** the next step of a clan level quest: { i, step, prog } (i = 0-based; -1 = all done) */
function nextStep(q, prog) {
  const steps = (q && q.steps) || [], S = (prog && prog.steps) || {};
  const i = steps.findIndex((s, k) => !(S[k] && S[k].status === 'done'));
  return { i, step: i >= 0 ? steps[i] : null, prog: i >= 0 ? (S[i] || null) : null };
}
/** which party may run a hunt step: online, not busy, size >= 3, lowest level >= minLevel; the one with the highest lowest level first */
function huntParty(teams, minLevel) {
  const ok = teams.filter(t => t.size >= 3 && t.online && !t.busy && t.min >= num(minLevel)).sort((a, b) => b.min - a.min || a.leader.localeCompare(b.leader));
  const best = teams.filter(t => t.size >= 3).sort((a, b) => b.min - a.min)[0] || null;
  return { pick: ok[0] || null, best };
}
/** who holds an item (bag reports Logs/bag_<name>.json, every 2 min) -> [{ name, objId, count }] */
function holders(ctx, id) {
  const out = [];
  try { fs.readdirSync(ctx.LOGS).forEach(f => { const m = /^bag_([A-Za-z0-9]+)\.json$/.exec(f); if (!m) return; const b = rd(ctx, path.join(ctx.LOGS, f), null); if (!b || !Array.isArray(b.items)) return;
    b.items.forEach(it => { if (num(it.id) === num(id) && num(it.count) > 0) out.push({ name: m[1], objId: num(it.objId), count: num(it.count), at: b.at || '' }); }); }); } catch (e) { }
  return out;
}

// ---- CLANHAND 2026-10-13: one clan level + the clan level item hand-over ------------------------------------------------------------
// The level-up checklist (st.nextLevel) comes from the clan leader's swarm.js. Before the CLANHAND deploy it used Me.Clan.Level = 0 ("level 0 -> 1",
// "the clan is level 0") while the clan is level 2 -> a report BELOW the real level (clanLevelOf) is rebuilt here from clan_data.json + the
// leader's SP / adena (clan_state.json) + his bag report, so every row reads the same level.
/** N = st.nextLevel, clvl = clanLevelOf(); levels = clan_data.json levels; have(id) = the clan leader's count (bag report) */
function fixNextLevel(N, clvl, levels, st, have) {
  if (N && num(N.level) >= num(clvl)) return N;
  const L = (levels || []).find(l => num(l.level) === num(clvl) + 1);
  if (!L) return { level: clvl, next: null, ok: false, missing: ['no next level known (clan_data.json)'], fixed: true, reported: N ? num(N.level) : null };
  const sp = num(st && st.sp), ad = num(st && st.adena), missing = [];
  const items = (L.items || []).map(i => ({ id: num(i.id), name: String(i.name || 'item ' + i.id), need: num(i.count || 1), have: have ? num(have(num(i.id))) : 0 }));
  if (sp < num(L.sp)) missing.push(`SP ${sp.toLocaleString('en-US')} / ${num(L.sp).toLocaleString('en-US')}`);
  if (ad < num(L.adena)) missing.push(`adena ${ad.toLocaleString('en-US')} / ${num(L.adena).toLocaleString('en-US')}`);
  items.forEach(i => { if (i.have < i.need) missing.push(`${i.name} (${i.id}) ${i.have}/${i.need}`); });
  if (num(L.reputation)) missing.push(`reputation ? / ${num(L.reputation)}`);
  if (num(L.members)) missing.push(`members ? / ${num(L.members)}`);
  return { level: num(clvl), next: num(clvl) + 1, ok: !missing.length, missing, sp: { have: sp, need: num(L.sp) }, adena: { have: ad, need: num(L.adena) }, items, fixed: true, reported: N ? num(N.level) : null };
}
/** a clan name L2Swarm could not read comes as "(clan <id>)" — not a name */
const realName = (n) => (n && !/^\(clan /.test(String(n)) ? String(n) : '');
/** the swarm.js status of each giver (Logs/clanhand_<name>.json): fresh ones only (pending 20 min, handed 3 h) */
function clanHands(ctx) {
  const out = {};
  try { fs.readdirSync(ctx.LOGS).forEach(f => { const m = /^clanhand_([A-Za-z0-9]+)\.json$/.exec(f); if (!m) return; const j = rd(ctx, path.join(ctx.LOGS, f), null);
    if (!j || !j.state || j.state === 'none') return; const age = Date.now() - Date.parse(j.at || 0);
    if (age < (j.state === 'handed' ? 3 * 3600e3 : j.state === 'failed' ? 3600e3 : 20 * 60000)) out[m[1]] = j; }); } catch (e) { }
  return out;
}
/** what the clan level items look like: per item the clan leader's count, what is still needed, who holds it, who gives, the giver's status.
 *  o = { clvl, levels, leader, extra: [{ id, need }] (e.g. the level quest step item), holdersOf(id) -> [{ name, objId, count }], hands } */
function clanItemPlan(o) {
  const L = (o.levels || []).find(l => num(l.level) === num(o.clvl) + 1), list = [];
  ((L && L.items) || []).forEach(i => list.push({ id: num(i.id), name: String(i.name || 'item ' + i.id), need: num(i.count || 1) }));
  (o.extra || []).forEach(x => { if (num(x.id) && !list.some(i => i.id === num(x.id))) list.push({ id: num(x.id), name: String(x.name || 'item ' + x.id), need: num(x.need || 1) }); });
  return list.map(i => {
    const hs = (o.holdersOf ? o.holdersOf(i.id) : []) || [], lh = hs.filter(h => h.name === o.leader).reduce((a, h) => a + num(h.count), 0);
    const others = hs.filter(h => h.name !== o.leader).sort((a, b) => num(b.count) - num(a.count) || String(a.name).localeCompare(String(b.name)));
    const still = Math.max(0, i.need - lh), g = still ? others[0] || null : null;
    return Object.assign({}, i, { leaderHas: lh, still, holders: others, giver: g ? g.name : '', giverHas: g ? num(g.count) : 0, give: g ? Math.min(still, num(g.count)) : 0, objId: g ? num(g.objId) : 0,
      status: g && o.hands ? (o.hands[g.name] || null) : null });
  });
}
/** one line + row state for a plan item (the "Needs you" text is gone: the hand-over runs by itself) */
function itemHandText(p, leader, on, agoFn) {
  const A = agoFn || ago, s = p.status, nm = p.name, has = `${p.giver} already has ${p.giverHas} × ${nm}`;
  if (!p.giver) return p.still === 0 && p.leaderHas ? { state: 'ok', text: `${leader} has ${p.leaderHas} × ${nm} — enough for the clan level-up` } : { state: 'wait', text: `nobody holds ${nm} yet` };
  if (s && s.state === 'handing') return { state: 'ok', text: `${p.giver} is ${s.text || `handing ${p.give} × ${nm} to ${leader}`} (${s.why || 'started'} ${A(s.at)})` };
  if (s && s.state === 'handed') return { state: 'ok', text: `${s.text || `${p.giver} handed ${p.give} × ${nm} to ${leader}`} ${A(s.at)} — ${leader}'s bag report follows within 2 min` };
  if (s && s.state === 'failed') return { state: 'need', text: `${has}: the hand-over to ${leader} failed (${String(s.why || '?').slice(0, 140)}) — retries by itself in 30 min, or press "Hand it over now"`, failed: true };
  if (!on) return { state: 'need', text: `${has}: hands ${p.give} to ${leader} — the automatic hand-over is OFF (switch it on, or press "Hand it over now")`, off: true };
  if (s && s.state === 'calling') return { state: 'wait', text: `${has}: ${s.why || `asked ${leader} to come over`} (${A(s.at)})` };
  if (s && s.state === 'waiting') return { state: 'wait', text: `${has}: hands ${p.give} to ${leader} by itself — waiting ${String(s.why || '').replace(/^until /, 'until ')}` };
  return { state: 'wait', text: `${has}: hands ${p.give} to ${leader} by itself when both are in a town (no report from ${p.giver} yet)` };
}

function status(ctx) {
  const st = rd(ctx, path.join(ctx.LOGS, 'clan_state.json'), null) || {}, cq = rd(ctx, cqFile(ctx), null) || { clan: {} }, cd = rd(ctx, path.join(ctx.DATA, 'clan_data.json'), null) || {};
  const C = cq.clan || {}, F = flags(cq, ctx), clvl = clanLevelOf(st, cq), chars = ctx.readStates(), teams = teamsOf(chars);
  const leader = st.leader || C.leader || 'Dagger1', lc = chars.find(c => c.name === leader) || null, leaderOn = !!(lc && lc.ageSec <= 120);
  const ci = st.clanInfo || null, clanName = realName(ci && ci.name) || realName(st.clan && st.clan.name) || C.name || (ci && ci.name) || '';   // CLANHAND: '(clan <id>)' is no name
  const hasClan = !!(clanName && (C.created || (st.clan && st.clan.id) || ci));
  const fresh = (k, maxMin) => { const a = (st.auto || {})[k]; return a && a.at && Date.now() - Date.parse(a.at) < (maxMin || 30) * 60000 ? a : null; };
  const rows = [], needs = [];
  const row = (o) => rows.push(Object.assign({ on: null, state: 'ok', text: '' }, o));
  const need = (o) => needs.push(Object.assign({ kind: 'info' }, o));
  // CLANHAND 2026-10-13: ONE clan level (clvl) everywhere; a level-up report below it (Me.Clan.Level 0) is rebuilt from clan_data.json
  const leaderHave = (id) => holders(ctx, id).filter(h => h.name === leader).reduce((a, h) => a + h.count, 0);
  const N = hasClan && st.nextLevel !== undefined ? fixNextLevel(st.nextLevel || null, clvl, cd.levels, st, leaderHave) : (st.nextLevel || null);
  const LQ = cq.levelQuests || {}, lqId = LQ_FOR_LEVEL[clvl], lqStepItem = lqId && LQ[lqId] && LQ[lqId].item ? [{ id: LQ[lqId].item, need: 1 }] : [];
  const IP = hasClan ? clanItemPlan({ clvl, levels: cd.levels, leader, extra: lqStepItem, holdersOf: (id) => holders(ctx, id), hands: clanHands(ctx) }) : [];

  // 1) founding
  if (hasClan) row({ key: 'found', title: 'Clan founding', text: `${clanName} exists${C.created ? ' since ' + String(C.created).slice(0, 10) : ''}${C.foundedAt ? ' (' + C.foundedAt + ')' : ''} — never a second clan` });
  else { row({ key: 'found', title: 'Clan founding', state: 'wait', text: `${leader} founds "${C.wantName || '?'}" by himself once he is level 10+ in a town (max 3 tries a day)` });
    if (!C.wantName) need({ kind: 'name', text: 'Choose the clan name (Clan leader section)' }); }

  // 2) clan level-up
  if (!hasClan) row({ key: 'levelUp', title: 'Clan level-up', on: F.levelUp, state: 'wait', text: 'after the clan is founded' });
  else if (!N) row({ key: 'levelUp', title: 'Clan level-up', on: F.levelUp, state: 'wait', text: `no report from ${leader} yet (he writes every 30 s when online)` });
  else if (!N.next) row({ key: 'levelUp', title: 'Clan level-up', on: F.levelUp, state: 'ok', text: (N.missing || []).join('; ') || 'highest level known' });
  else if (N.ok) { row({ key: 'levelUp', title: 'Clan level-up', on: F.levelUp, state: F.levelUp ? 'ok' : 'need', text: F.levelUp ? `ready: level ${N.level} → ${N.next} the next time ${leader} is in a town and free` : `ready for level ${N.next} — switch on, or press "Increase clan level now"` });
    if (!F.levelUp) need({ kind: 'order', text: `Clan level ${N.next} is ready`, target: 'char:' + leader, cmd: '!clanlevel', label: `Increase the clan level to ${N.next} now`, button: 'Level up now' }); }
  else row({ key: 'levelUp', title: 'Clan level-up', on: F.levelUp, state: F.levelUp ? 'wait' : 'off', text: `level ${N.level} → ${N.next} waits for: ${(N.missing || []).join('; ')}` });
  // 2b) CLANHAND 2026-10-13: the item the next level needs, held by another character -> swarm.js hands it to the clan leader by itself
  //     (Logs/clanhand_<name>.json = its status); "Needs you" only when the switch is OFF or the last try failed; the row has "Hand it over now"
  if (hasClan) {
    const lines = [], acts = []; let st2 = 'ok';
    IP.forEach(p => { const t = itemHandText(p, leader, F.itemHandover); lines.push(t.text);
      if (t.state === 'need') st2 = 'need'; else if (t.state === 'wait' && st2 !== 'need') st2 = 'wait';
      if (p.giver && p.give > 0 && !(p.status && /^(handing|handed)$/.test(p.status.state))) {
        const a = { giver: p.giver, receiver: leader, item: p.name, id: p.id, count: p.give, label: 'Hand it over now' }; acts.push(a);
        if (t.failed || t.off) need(Object.assign({ kind: 'clanhand', text: t.text, button: `Hand it to ${leader} now` }, a)); } });
    const text = !IP.length ? `clan level ${clvl + 1} needs no item (SP + adena${clvl >= 5 ? ' / reputation / members' : ''})` : lines.join(' · ');
    row({ key: 'itemHandover', title: 'Clan level item hand-over', on: F.itemHandover, state: !IP.length ? 'ok' : F.itemHandover ? st2 : (st2 === 'ok' ? 'off' : 'need'), text, act: acts[0] || null });
  }

  // 3) clan level quests (the item for levels 3-5)
  if (!hasClan) row({ key: 'levelQuests', title: 'Clan level quests', on: F.levelQuests, state: 'wait', text: 'after the clan is founded' });
  else if (clvl >= 5) row({ key: 'levelQuests', title: 'Clan level quests', on: F.levelQuests, state: 'ok', text: 'done: clan level 5+ (levels 6+ need reputation + members)' });
  else if (!lqId || !LQ[lqId]) row({ key: 'levelQuests', title: 'Clan level quests', on: F.levelQuests, state: 'wait', text: `clan level ${clvl}: levels 1 and 2 need only SP + adena (the level-up above)` });
  else {
    const q = LQ[lqId], prog = rd(ctx, path.join(ctx.LOGS, `clanquest_${String(lqId).replace(/\W/g, '')}.json`), { steps: {} }), ns = nextStep(q, prog);
    const last = (rd(ctx, dispFile(ctx), {}) || {})[lqId];
    let state = 'wait', text = '';
    if (!ns.step) { state = 'ok'; text = `${q.name}: all steps done`; }
    else {
      const s = ns.step, p = ns.prog, sn = ns.i + 1, pr = p ? ` (step ${sn} ${p.status} ${ago(p.at)}${p.msg ? ': ' + String(p.msg).slice(0, 120) : ''})` : '';
      const ip = IP.find(x => x.id === num(s.item || q.item));
      const upIdx = (q.steps || []).findIndex(x => x.kind === 'levelup');
      if (ip && ip.giver && s.kind !== 'levelup') { const t = itemHandText(ip, leader, F.itemHandover); state = t.state; text = `${t.text} — no hunt needed`; }
      else if (ip && !ip.still && ip.leaderHas && s.kind !== 'levelup') { state = 'ok'; text = `${leader} has ${ip.leaderHas} × ${ip.name}: no hunt or trade needed — next is the clan level-up${upIdx >= 0 ? ' (step ' + (upIdx + 1) + ')' : ''}`; }
      else if (!s.auto) { state = 'need'; text = `${q.name} step ${sn} is MANUAL: ${s.text}`; need({ kind: 'manual', text: `${q.name} step ${sn}: ${s.text}`, anchor: 'lq' }); }
      else if (s.kind === 'hunt') { const hp = huntParty(teams, s.minLevel);
        text = hp.pick ? `${q.name} step ${sn}: party ${hp.pick.leader} (lowest level ${hp.pick.min}) can hunt it${F.levelQuests ? ' — sent automatically' : ' — switch on, or send it in the Level quests section'}${pr}`
          : `${q.name} step ${sn}: needs a party whose lowest level is ${s.minLevel || '?'}+${hp.best ? ` (best now: party ${hp.best.leader}, lowest ${hp.best.min})` : ''}${pr}`;
        state = hp.pick ? (F.levelQuests ? 'ok' : 'need') : 'wait'; }
      else { text = `${q.name} step ${sn}: ${s.text}${F.levelQuests ? ' — runs automatically' : ' — switch on, or press Run in the Level quests section'}${pr}`; state = F.levelQuests ? 'ok' : 'need'; }
      if (last && last.at) text += ` · last call ${ago(last.at)}: ${last.msg || ''}`;
    }
    row({ key: 'levelQuests', title: 'Clan level quests', on: F.levelQuests, state: F.levelQuests || state === 'wait' || state === 'need' ? state : 'off', text });
  }

  // 4) invites
  const allow = (C.inviteAllow || []).map(String), parties = (C.inviteParties || []).map(String);
  const inClan = new Set(((ci && ci.members) || []).map(m => m.name));
  chars.forEach(c => { const k = c.clanInfo || {}; if (clanName && String(k.name || c.clan || '').toLowerCase() === clanName.toLowerCase()) inClan.add(c.name); });
  const wanted = new Set(allow); teams.forEach(t => { if (parties.includes(t.leader)) t.names.forEach(n => wanted.add(n)); });
  wanted.delete(leader); const waiting = [...wanted].filter(n => !inClan.has(n));
  const lim = (cd.memberLimits && cd.memberLimits.main) ? (cd.memberLimits.main[String(clvl)] ?? (clvl >= 4 ? cd.memberLimits.main['4+'] : null)) : null;
  const room = lim != null ? Math.max(0, num(lim) - inClan.size) : null;
  { const a = fresh('invite', 20);
    let text = !hasClan ? 'after the clan is founded' : !wanted.size ? 'nobody ticked — you choose who joins (Invites section)'
      : !waiting.length ? `everyone ticked is in the clan (${inClan.size}${lim != null ? ' / ' + lim : ''} members)`
      : `${waiting.length} ticked, not in the clan yet: ${waiting.slice(0, 6).join(', ')}${waiting.length > 6 ? ' +' + (waiting.length - 6) : ''} — invited when they stand next to ${leader}${room != null ? ` · room for ${room}` : ''}`;
    if (a) text += ` · ${leader}: ${a.msg} (${ago(a.at)})`;
    row({ key: 'invite', title: 'Clan invites', on: F.invite, state: !F.invite ? 'off' : !hasClan || !wanted.size || (waiting.length && room === 0) ? 'wait' : 'ok', text, parties });
    if (hasClan && waiting.length && room === 0) need({ kind: 'info', text: `The clan is full (${inClan.size} / ${lim}): ${waiting.length} ticked character(s) wait for clan level ${clvl + 1}` }); }

  // 5) clan raid quests (reputation)
  const QS = cq.quests || {}, qMin = Math.min(...Object.values(QS).map(q => num(q.clanLevel)).filter(Boolean), 99);
  const act = activeQuests(cq, clvl), disp = rd(ctx, path.join(ctx.LOGS, 'clan_dispatch.json'), {}) || {};
  const lastD = Object.values(disp).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null;
  if (clvl < qMin) row({ key: 'questDispatch', title: 'Clan raid quests', on: F.questDispatch, sub: { key: 'questActivate', on: F.questActivate, label: 'activate by clan level' }, state: 'wait', text: `start at clan level ${qMin} (the clan is level ${clvl})${F.questActivate ? ' — they switch on by themselves then' : ''}` });
  else { row({ key: 'questDispatch', title: 'Clan raid quests', on: F.questDispatch, sub: { key: 'questActivate', on: F.questActivate, label: 'activate by clan level' }, state: !F.questDispatch ? 'off' : act.length ? 'ok' : 'wait',
      text: act.length ? `active: ${act.map(id => (QS[id] && QS[id].name) || id).join(', ')} — a fitting party is sent to a live quest boss every 10 min${lastD ? ` · last: party ${lastD.party} → ${lastD.boss} ${ago(lastD.at)}` : ''}` : 'no clan raid quest active (switch "activate by clan level" on, or tick them in the Clan raid quests section)' });
    act.forEach(id => { const q = QS[id]; if (q && q.npc) need({ kind: 'info', text: `${q.name}: ${leader} must have taken the quest at ${q.npc} (${q.town}) — not automated yet` }); }); }

  // 6) clan warehouse list
  { const wh = st.warehouse || null, dirty = st.whDirty || null, a = fresh('wh', 240);
    const text = (wh && wh.seenAt ? `last seen ${ago(wh.seenAt)} by ${wh.seenBy || '?'} (${(wh.items || []).length} stacks)` : 'never seen yet')
      + (dirty ? ` · new deposits by ${dirty.by || '?'} ${ago(dirty.at)}: ${leader} looks at his next Giran regroup or when idle in Giran` : ' · up to date')
      + (a ? ` · ${a.msg}` : '');
    row({ key: 'warehouseLook', title: 'Clan warehouse list', on: F.warehouseLook, state: !F.warehouseLook ? 'off' : dirty ? 'wait' : 'ok', text }); }

  // 7) clan skills
  { const sc = st.skillCheck || null, foc = C.skillFocus || null;
    // CLANHAND 2026-10-13: an old swarm.js report says 'the clan is level 0' (Me.Clan.Level) -> the one clan level here
    const scMsg = sc ? String(sc.msg || '').replace(/\(the clan is level (\d+)\)/g, (m, d) => num(d) < clvl ? `(the clan is level ${clvl})` : m).replace(/^clan level (\d+):/, (m, d) => num(d) < clvl ? `clan level ${clvl}:` : m) : '';
    const text = !hasClan ? 'after the clan is founded' : sc ? `${scMsg}${sc.f && sc.f.auto ? ' (picked by itself)' : ''}` : clvl < 5 ? `clan skills start at clan level 5 (the clan is level ${clvl})` : (foc ? `focus ${foc.name} ${foc.level}` : 'no report yet');
    row({ key: 'skillLearn', title: 'Clan skills', on: F.skillLearn, sub: { key: 'skillFocus', on: F.skillFocus, label: 'pick the next skill by itself' }, state: !F.skillLearn ? 'off' : sc && sc.ok ? 'ok' : 'wait', text }); }

  // 8) sieges (reminder: registration costs adena -> always by your order)
  { const plans = ((rd(ctx, path.join(ctx.DATA, 'siege_plans.json'), {}) || {}).plans || []).filter(p => p && p.status !== 'cancelled' && p.status !== 'done' && Date.parse(p.siegeAt) > Date.now() - 3600e3);
    const regs = rd(ctx, path.join(ctx.LOGS, 'siege_registrations.json'), {}) || {};
    const fortMin = num(((rd(ctx, path.join(ctx.DATA, 'fortresses.json'), {}) || {}).rules || {}).minClanLevel) || 4, castleMin = num(((rd(ctx, path.join(ctx.DATA, 'castles.json'), {}) || {}).rules || {}).minClanLevel) || 5;
    if (!plans.length) row({ key: 'siege', title: 'Siege registration', state: 'ok', text: `no siege planned (Fortresses / Castles tabs) · forts need clan level ${fortMin}, castles ${castleMin}; the clan is level ${clvl}` });
    else { const lines = plans.map(p => { const r = regs[`${p.kind}:${p.targetId}`], okReg = r && !/^refused|busy|failed/i.test(String(r.result || ''));
        const minL = p.kind === 'castle' ? castleMin : fortMin, h = Math.round((Date.parse(p.siegeAt) - Date.now()) / 3600e3);
        if (!okReg) need({ kind: clvl >= minL ? 'order' : 'info', text: `${p.targetName || p.targetId} (${p.kind}) siege in ${h} h is not registered${r ? ' — last try: ' + String(r.result).slice(0, 100) : ''}${clvl < minL ? ` — needs clan level ${minL}` : ''}`,
          target: 'char:' + leader, cmd: `!siegereg ${p.kind} ${p.targetName || p.targetId}`, label: `Register the clan for ${p.targetName} (${p.kind === 'fort' ? 'the first clan pays 250,000 adena' : 'castle messenger'})`, button: 'Register', cost: p.kind === 'fort' ? '250,000 adena (first clan)' : '' });
        return `${p.targetName || p.targetId} in ${h} h: ${okReg ? 'registered' : 'NOT registered'}`; });
      row({ key: 'siege', title: 'Siege registration', state: needs.some(n => /siege/.test(n.text)) ? 'need' : 'ok', text: lines.join(' · ') + ' — registration costs adena: always your order' }); }
  }
  if (!leaderOn) need({ kind: 'info', text: `${leader} (clan leader) is offline — nothing clan-related happens until he is back` });
  return { at: new Date().toISOString(), leader, leaderOnline: leaderOn, clan: clanName, level: clvl, flags: F, rows, needs };
}

function post(ctx, b) {
  if (!b || typeof b !== 'object') return { code: 400, error: 'no body' };
  const F = cqFile(ctx);
  if (b.action === 'handover') return handoverNow(ctx, b);           // CLANHAND 2026-10-13: the Clan tab's "Hand it over now" (a Promise: handle() awaits it)
  if (b.action === 'set') {
    const key = String(b.key || ''); if (!KEYS.includes(key)) return { code: 400, error: 'unknown switch ' + key };
    const on = b.on === true;
    if (key === 'levelUp') { writeAtomic(ctx, autoFile(ctx), { levelUp: on, at: new Date().toISOString(), by: 'dashboard' }, 'clan_auto'); }
    else { const cq = rd(ctx, F, null); if (!cq || typeof cq !== 'object') return { code: 500, error: 'clan_quests.json missing or broken' };
      cq.clan = cq.clan || {}; cq.clan.auto = Object.assign({}, cq.clan.auto || {}, { [key]: on }); writeAtomic(ctx, F, cq, 'clan_quests'); }
    logLine(ctx, `automation ${key} ${on ? 'ON' : 'OFF'}`);
    return { ok: true, key, on };
  }
  if (b.action === 'inviteParty') {
    const L = String(b.leader || '').trim(); if (!/^[A-Za-z0-9]{1,20}$/.test(L)) return { code: 400, error: 'party leader name needed' };
    const cq = rd(ctx, F, null); if (!cq || typeof cq !== 'object') return { code: 500, error: 'clan_quests.json missing or broken' };
    cq.clan = cq.clan || {}; const s = new Set((cq.clan.inviteParties || []).map(String)); if (b.on) s.add(L); else s.delete(L);
    cq.clan.inviteParties = [...s].sort(); writeAtomic(ctx, F, cq, 'clan_quests');
    logLine(ctx, `invite party ${L} ${b.on ? 'ticked' : 'unticked'}`);
    return { ok: true, parties: cq.clan.inviteParties };
  }
  return { code: 400, error: 'unknown action' };
}

/** CLANHAND 2026-10-13: "!clanhand <giver>" to the holder now (swarm.js: walk / port to the clan leader + trade, wherever he is; the busy checks stay) */
async function handoverNow(ctx, b) {
  const g = String(b.giver || '').trim(); if (!/^[A-Za-z0-9]{1,20}$/.test(g)) return { code: 400, error: 'character name needed (giver)' };
  const st = rd(ctx, path.join(ctx.LOGS, 'clan_state.json'), null) || {}, cq = rd(ctx, cqFile(ctx), null) || { clan: {} };
  const leader = st.leader || (cq.clan && cq.clan.leader) || 'Dagger1';
  if (g.toLowerCase() === String(leader).toLowerCase()) return { code: 400, error: `${g} is the clan leader — the items come to him` };
  if (!ctx.commandRun) return { code: 500, error: 'no command channel (dashboard server)' };
  const r = await ctx.commandRun({ cmd: `!clanhand ${g}`, target: 'char:' + g });
  const ok = !!(r && r.code < 300 && r.body && r.body.ok);
  const msg = ok ? `${g}: hand the clan level item to ${leader} now (sent)` : `${g}: ${(r && r.body && r.body.error) || 'not sent'}`;
  logLine(ctx, `clan level item hand-over now: ${msg}`); clanLog(ctx, `clan level item hand-over now: ${msg}`);
  return ok ? { ok: true, msg, giver: g, receiver: leader } : { code: (r && r.code >= 400 && r.code) || 502, error: msg };
}

// ---- the clan level quest dispatcher (clan.auto.levelQuests) ------------------------------------------------------------------------
/** decide what to send now -> { send: { target, cmd }, msg } | { msg } (pure apart from the inputs) */
function lqDecide(o) {
  const { cq, st, teams, prog, last, now } = o, clvl = clanLevelOf(st, cq), id = LQ_FOR_LEVEL[clvl], LQ = (cq && cq.levelQuests) || {};
  if (!autoOn(cq, 'levelQuests')) return { msg: 'off' };
  if (!id || !LQ[id]) return { msg: `no clan level quest for clan level ${clvl}` };
  const ns = nextStep(LQ[id], prog); if (!ns.step) return { id, msg: `${LQ[id].name}: all steps done` };
  const s = ns.step, n = ns.i + 1, p = ns.prog, T = (x) => x ? (now - Date.parse(x)) : 1e12;
  if (!s.auto) return { id, n, msg: `step ${n} is manual — waits for you` };
  if (p && p.status === 'running' && T(p.at) < 3 * 3600e3) return { id, n, msg: `step ${n} is running (${p.by || '?'})` };
  if (p && p.status === 'failed' && T(p.at) < 3600e3) return { id, n, msg: `step ${n} failed ${Math.round(T(p.at) / 60000)} min ago — retry after 1 h` };
  if (last && last.n === n && T(last.at) < 2 * 3600e3) return { id, n, msg: `step ${n} was sent ${Math.round(T(last.at) / 60000)} min ago` };
  const leader = (st && st.leader) || (cq.clan && cq.clan.leader);
  if (s.item && o.held && o.held(s.item)) return { id, n, msg: `step ${n}: someone already has item ${s.item} — no hunt; the clan level item hand-over brings it to the clan leader` };   // CLANHAND 2026-10-13
  if (s.kind === 'hunt') { const hp = huntParty(teams, s.minLevel); if (!hp.pick) return { id, n, msg: `step ${n}: no free party with lowest level ${s.minLevel || '?'}+` };
    return { id, n, send: { target: 'party:' + hp.pick.leader, cmd: `!clanquest ${id} ${n}` }, msg: `step ${n} (hunt) → party ${hp.pick.leader}` }; }
  const lcBusy = teams.some(t => t.names.includes(leader) && t.busy);
  if (!leader || o.leaderOnline === false) return { id, n, msg: `step ${n}: the clan leader is offline` };
  if (lcBusy) return { id, n, msg: `step ${n}: the clan leader's party is busy (raid / mission)` };
  if (s.kind === 'levelup' && !(st && st.nextLevel && st.nextLevel.ok)) return { id, n, msg: `step ${n} (level-up): ${((st && st.nextLevel && st.nextLevel.missing) || ['not ready']).join('; ')}` };
  return { id, n, send: { target: 'char:' + leader, cmd: `!clanquest ${id} ${n}` }, msg: `step ${n} (${s.kind}) → ${leader}` };
}
async function lqTick(ctx) {
  try {
    const cq = rd(ctx, cqFile(ctx), null); if (!cq || !autoOn(cq, 'levelQuests')) return;
    const st = rd(ctx, path.join(ctx.LOGS, 'clan_state.json'), null) || {}, chars = ctx.readStates();
    const id = LQ_FOR_LEVEL[clanLevelOf(st, cq)], D = rd(ctx, dispFile(ctx), {}) || {};
    const prog = id ? rd(ctx, path.join(ctx.LOGS, `clanquest_${String(id).replace(/\W/g, '')}.json`), { steps: {} }) : { steps: {} };
    const L = st.leader || (cq.clan && cq.clan.leader), lc = chars.find(c => c.name === L);
    const d = lqDecide({ cq, st, teams: teamsOf(chars), prog, last: id ? D[id] : null, now: Date.now(), leaderOnline: !!(lc && lc.ageSec <= 120), held: (it) => holders(ctx, it).length > 0 });
    if (!d.send || !ctx.commandRun) return;
    const r = await ctx.commandRun({ cmd: d.send.cmd, target: d.send.target });
    const ok = !!(r && r.code < 300 && r.body && r.body.ok);
    D[d.id] = { at: new Date().toISOString(), n: d.n, msg: d.msg + (ok ? '' : ' — refused: ' + ((r && r.body && r.body.error) || '?')) };
    writeAtomic(ctx, dispFile(ctx), D, '');
    clanLog(ctx, `clan level quest ${d.id}: ${D[d.id].msg} (${d.send.cmd})`);
  } catch (e) { }
}
let started = false;
function start(ctx) { if (started) return; started = true; setTimeout(() => lqTick(ctx), 120000); setInterval(() => lqTick(ctx), 10 * 60000); }

async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (STATIC[p]) { res.writeHead(200, { 'Content-Type': STATIC[p], 'Cache-Control': 'no-cache' }); res.end(fs.readFileSync(path.join(ctx.DIR || __dirname, path.basename(p)))); return true; }
  if (p !== '/api/clanauto') return false;
  if (!ctx.allowed(req, url)) { ctx.send(res, 401, 'text/plain; charset=utf-8', 'Access denied'); return true; }
  if (req.method === 'GET') { try { ctx.json(res, 200, status(ctx)); } catch (e) { ctx.json(res, 500, { error: e.message }); } return true; }
  if (req.method !== 'POST') { ctx.json(res, 405, { error: 'GET or POST' }); return true; }
  let b = {}; try { let t = ''; for await (const c of req) t += c; b = JSON.parse(t || '{}'); } catch (e) { ctx.json(res, 400, { error: 'bad JSON' }); return true; }
  try { const r = await post(ctx, b); const code = r.code || 200; delete r.code; ctx.json(res, code, r); } catch (e) { ctx.json(res, 500, { error: e.message }); }
  return true;
}
module.exports = { handle, status, post, start, fixNextLevel, clanItemPlan, itemHandText, clanHands, realName, holders, lqDecide, lqTick, flags, autoOn, activeQuests, clanLevelOf, teamsOf, nextStep, huntParty, DEF, LQ_FOR_LEVEL };
