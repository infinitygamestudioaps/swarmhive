// ACADEMY PIPELINE — shared pure logic (owner 2026-10-21, ACADEMY-2026-10-21: "as soon as I add an account under clan and then academy it
// should create a random character with name+numbers then go to giran with the .giran command, get invited by clan Leader to academy, get
// enough funds to buy the devotion set and a common weapon and spiritshots then it should go level from 1-40"). No DOM, no host calls:
// Dashboard/academy_api.js (the manager), Dashboard/addaccount_api.js (the Academy choice) and docs/plan/tools/test_academy.js use it.
// Config: Scripts/data/academy.json. The bot side is Scripts_dev/swarm.js (party plan step kind 'academy', block ACADEMY-PURE).
'use strict';
const NAME_RE = /^[A-Za-z0-9]{2,16}$/;

const DEF = {
  on: true, coupons: true /* ACADCOUPON-2026-10-31 */, race: 2, classId: 38, sexes: [0, 1], classPlan: [39, 40], role: 'nuker',
  names: { first: ['Nyx', 'Vel', 'Mor', 'Kael', 'Shad', 'Drav', 'Zar', 'Vex'], second: ['ara', 'eth', 'iel', 'ora', 'yn', 'ith'], digitsMin: 2, digitsMax: 4, tries: 6 },
  funds: { target: 2000000, need: 900000, waitMin: 45 },
  buy: { start: [], level18: [], level20: [], jewels: [] },
  spots: { to20: { mode: 'auto' }, to25: { mode: 'auto' }, to30: { mode: 'auto' }, to35: { mode: 'auto' }, to40: { mode: 'auto' } },   // ACADROUTE-2026-11-01: + to30 / to35
  end: { logout: true, newCharacter: true, maxCharacters: 7, deliver: true, deleteGraduate: true, slotWaitMin: 360 },   // ACADLOOP-2026-10-31
  buffs: { on: true, magnus: true, cov: true, storeMaxPrice: 10 },   // ACADSTORE-2026-10-31 (owner: "Magnus Chant from giran for 10 adena")
  groups: { on: true, size: 5 },   // ACADGROUP-2026-11-02 (owner: "Yes do 4 groups")
};
/** academy.json content -> a complete config (missing parts = the defaults) */
function academyCfg(j) {
  const o = j && typeof j === 'object' ? j : {};
  const out = Object.assign({}, DEF, o);
  out.names = Object.assign({}, DEF.names, o.names || {});
  out.funds = Object.assign({}, DEF.funds, o.funds || {});
  out.buy = Object.assign({}, DEF.buy, o.buy || {});
  out.spots = Object.assign({}, DEF.spots, o.spots || {});
  out.end = Object.assign({}, DEF.end, o.end || {});
  out.end.deliver = out.end.deliver !== false; out.end.deleteGraduate = out.end.deleteGraduate !== false;
  out.buffs = Object.assign({}, DEF.buffs, o.buffs || {});
  out.groups = Object.assign({}, DEF.groups, o.groups || {}); out.groups.on = out.groups.on !== false; out.groups.size = Math.max(1, Math.min(9, Number(out.groups.size) || 5));
  out.on = o.on !== false;
  out.coupons = o.coupons !== false;
  return out;
}

/** a random character name: first + second + 2-4 digits, never one of taken (lower-case set), max 16 letters / digits.
 *  rnd = () => [0, 1) (Math.random; tests pass their own) */
function academyName(cfg, rnd, taken) {
  const C = academyCfg(cfg), N = C.names, R = typeof rnd === 'function' ? rnd : Math.random, T = taken || new Set();
  const pick = (a) => a[Math.floor(R() * a.length) % a.length];
  const first = (N.first || []).filter(x => /^[A-Za-z]+$/.test(x)), second = (N.second || []).filter(x => /^[A-Za-z]*$/.test(x));
  if (!first.length) first.push('Acad');
  if (!second.length) second.push('');
  const dMin = Math.max(1, Math.min(6, Number(N.digitsMin) || 2)), dMax = Math.max(dMin, Math.min(6, Number(N.digitsMax) || 4));
  for (let i = 0; i < 200; i++) {
    const nd = dMin + Math.floor(R() * (dMax - dMin + 1));
    let digits = ''; for (let k = 0; k < nd; k++) digits += String(Math.floor(R() * 10) % 10);
    let base = pick(first) + pick(second).toLowerCase();
    base = base.charAt(0).toUpperCase() + base.slice(1);
    const name = (base.slice(0, 16 - digits.length) + digits);
    if (NAME_RE.test(name) && !T.has(name.toLowerCase())) return name;
  }
  return 'Acad' + String(Date.now()).slice(-6);
}
/** several distinct names (the create script tries them in order when the server says a name is taken) */
function academyNames(cfg, rnd, taken, n) {
  const T = new Set(taken || []), out = [];
  for (let i = 0; i < (n || academyCfg(cfg).names.tries || 6); i++) { const nm = academyName(cfg, rnd, T); T.add(nm.toLowerCase()); out.push(nm); }
  return out;
}

/** the party plan of one academy character (Dashboard/planlogic.js step format; the 'academy' kind = swarm.js planStepAcademy) */
function academyPlanSteps(cfg) {
  const C = academyCfg(cfg), sp = C.spots, id = (k) => 'ac' + k;
  // ACADCOUPON-2026-10-31 (owner: "Have You added the shadow item coupons for academy toons" -> "Option 1"): with academy.json coupons (default
  // on) the plan stops at a Newbie Guide at level 6 (weapon coupons -> shadow weapon) and right after the 1st class change (jewelry coupon);
  // both steps are skipped (never blocking) when they do not work. swarm.js acCouponStep.
  const cw = C.coupons ? [{ id: id('lv6'), kind: 'level', to: 6, spot: sp.to20 || { mode: 'auto' } },
    { id: id('cpw'), kind: 'academy', act: 'coupon', which: 'weapon', onFail: 'skip', note: 'Newbie Guide: 5 weapon coupons -> 1 shadow weapon (free), worn when better' }] : [];
  // ACADROUTE-2026-11-01 (owner's route, docs/plan/academy_route_owner.md: "gear and quests are important for surviving, all quests in order,
  // the exchange coupons are life saving", "level as fast as possible"): the L2Toggle guide gives SHADOW ARMOR at 20-39 (step id accpj kept, now
  // which 'armor'); quests 320 Bones Tell The Future (adena), 412 Path Of The Dark Wizard (1,368,386 exp) and 170 Dangerous Seduction (102,680
  // adena), each alone, skipped when they fail; Cruma Marshlands 30-35, Cruma Tower floor 1 Porta rooms 35-40. Ids of the old steps unchanged
  // (the 20 running plans keep their progress).
  const cj = C.coupons ? [{ id: id('cpj'), kind: 'academy', act: 'coupon', which: 'armor', onFail: 'skip', note: 'Newbie Guide: armor coupon -> shadow robe set (free, level 20-39), worn when better' }] : [];
  const quest = (k, q, name, note) => ({ id: id(k), kind: 'quest', quest: q, name, mode: 'party', who: [], repeat: 1, onFail: 'skip', note });
  return [
    { id: id('join'), kind: 'academy', act: 'join', note: 'Giran (.giran) + the clan leader invites me into the Academy' },
    { id: id('funds'), kind: 'academy', act: 'funds', note: 'adena from the givers for the kit' },
    { id: id('buy1'), kind: 'academy', act: 'buy', set: 'start', note: 'No-Grade spiritshots' },
    ...cw,
    { id: id('lv10'), kind: 'level', to: 10, spot: sp.to20 || { mode: 'auto' } },
    quest('q320', 320, 'Bones Tell The Future', 'adena for shots (Tetrarch Kaitar, Dark Elven Village); skipped when it fails'),
    { id: id('lv18'), kind: 'level', to: 18, spot: sp.to20 || { mode: 'auto' } },
    // ACADARMOR18-2026-11-02 (owner: "yes" to armor before Path Of The Dark Wizard - deaths there in starter gear)
    { id: id('buy18'), kind: 'academy', act: 'buy', set: 'level18', note: 'Devotion robe set + Leather Helmet (no grade) before quest 412' },
    quest('q412', 412, 'Path Of The Dark Wizard', '1,368,386 exp + 163,800 adena (Varika, Altar of Rites); skipped when it fails'),
    { id: id('lv20'), kind: 'level', to: 20, spot: sp.to20 || { mode: 'auto' } },
    { id: id('cls1'), kind: 'class', note: '1st class (approved academy class plan)' },
    ...cj,
    { id: id('buy2'), kind: 'academy', act: 'buy', set: 'level20', note: 'Common weapon + D spiritshots; robe pieces only where the shadow armor is not as good' },
    { id: id('lv21'), kind: 'level', to: 21, spot: sp.to30 || { mode: 'auto' } },
    quest('q170', 170, 'Dangerous Seduction', '102,680 adena (Vellior, Dark Elven Village); skipped when it fails'),
    { id: id('lv30'), kind: 'level', to: 30, spot: sp.to30 || { mode: 'auto' } },
    // ACADJEWELS-2026-11-03 (owner: "no accessories so they take full magic damage ... common jewels cheap in town"): D Common jewelry before Cruma
    { id: id('buyjw'), kind: 'academy', act: 'buy', set: 'jewels', note: 'D-grade Common jewelry (2 earrings, necklace, 2 rings) before Cruma Tower' },
    // CRUMA38-2026-11-03 (owner: "Back to Cruma tower"): 5 nukers without a healer died in the level 40-42 floor-1 rooms - the Cruma Tower
    // (Lv30-35) spot until 38 (step id unchanged: progress kept), the group's own floor-1 room only for 38-40
    { id: id('lv35'), kind: 'level', to: 38, spot: sp.to35 || { mode: 'auto' } },
    { id: id('lv40'), kind: 'level', to: 40, spot: sp.to40 || { mode: 'auto' } },
    { id: id('cls2'), kind: 'class', note: '2nd class = Academy graduation' },
    { id: id('grad'), kind: 'academy', act: 'graduate', note: 'log out; the account makes the next academy character' },
  ];
}
function academyPlan(cfg, name, groupIndex) {
  const gi = Number.isInteger(groupIndex) && groupIndex >= 0 ? groupIndex : -1;
  return { name: `Academy ${gi >= 0 ? 'group ' + (gi + 1) + ' ' : ''}${name || ''}`.trim(), on: true, steps: gi >= 0 ? academyGroupPlanSteps(cfg, gi) : academyPlanSteps(cfg), template: 'academy' };
}
// ACADGROUP-2026-11-02 (owner: "why are you not just sitting them together in a five-man group? We have 20 characters. It's four parties of five
// people, five nukers hitting the same target, then should never ever die" -> "Yes do 4 groups"): the academy mages lead / follow in fixed groups
// of academy.json groups.size (5) by their login number (mylogin82-5, mylogin87-10, ...), the lowest login leads (a stable leader; a graduate's next
// character keeps the account's place). The group runs ONE academy plan (its leader's); the personal academy steps run for every member
// (swarm.js ACADGROUP acadTeamStep), the level steps pick spots for the group's lowest level; 35-40 = one Cruma Tower floor-1 room per group.
/** the number in a login ('mylogin93' -> 12; none -> Infinity) */
function loginNo(login) { const m = String(login || '').match(/(\d+)\s*$/); return m ? Number(m[1]) : Infinity; }
/** accounts (swarm.config.json accounts[]) -> [{ index, leader, leaderLogin, members: [names, leader first], logins }] for the academy mages */
// GROUPGRAD-2026-11-04 (owner: "why is 1 level 1? It looks like you overwrite the principle where all toons reach lvl 40 before going back to
// town. Now the level 1 toon must wait for the 4 toons to each reach level 40 then start a new toon"): a graduate gets its next character only
// when NO member of its group is still on the same generation without having graduated. logins = the group's logins; grad(login) = its
// current character graduated; made(login) = its generation counter (D.made). -> { ready, waitFor: [logins] }
function academyGroupReady(logins, me, grad, made) {
  const mine = Number(made(me)) || 1;
  const waitFor = (logins || []).filter(l => l !== me && (Number(made(l)) || 1) === mine && !grad(l));
  return { ready: waitFor.length === 0, waitFor };
}
function academyGroups(accounts, size) {
  const n = Math.max(1, Math.min(9, Number(size) || 5));
  const acad = (accounts || []).filter(a => a && a.academyMage && a.character && a.enabled !== false)
    .slice().sort((a, b) => (loginNo(a.login) - loginNo(b.login)) || String(a.login).localeCompare(String(b.login)));
  const out = [];
  for (let i = 0; i < acad.length; i += n) {
    const chunk = acad.slice(i, i + n);
    out.push({ index: out.length, leader: String(chunk[0].character), leaderLogin: String(chunk[0].login), members: chunk.map(a => String(a.character)), logins: chunk.map(a => String(a.login)) });
  }
  return out;
}
/** the group of a login -> { index, leader, ... } | null */
function academyGroupOf(accounts, login, size) { const L = String(login || '').toLowerCase(); return academyGroups(accounts, size).find(g => g.logins.some(l => l.toLowerCase() === L)) || null; }
/** pure: the moves that make the groups real (swarm.config.json party fields) -> [{ name, to }] (to = the group leader; '' = leads itself) */
function academyGroupMoves(accounts, size) {
  const out = []; const acc = (n) => (accounts || []).find(a => a && a.character === n);
  academyGroups(accounts, size).forEach(g => {
    const L = acc(g.leader); if (L && L.party && L.party !== g.leader) out.push({ name: g.leader, to: '' });
    g.members.slice(1).forEach(m => { const a = acc(m); if (a && String(a.party || a.character) !== g.leader) out.push({ name: m, to: g.leader }); });
  });
  return out;
}
// ACADREPEAT-2026-11-03 (owner: "the academy toons have to do the exact same thing again when they all are done in academy. So make sure no
// mistakes and it can be run over and over again"): the manager keeps the groups right by itself every tick (was: the hand-run
// acad_groups_on.js + hand-switched run switches). Who leads a group: the STICKY leader of this generation while its character is ready
// (set up, not graduated); else the lowest-login ready account of the group (normally the first one re-created after a graduation = "the old
// group's leader is replaced by the next created character"). Every not-graduated character of the group belongs to that leader's party.
/** pure: accounts (swarm.config.json accounts[]), size, ready(login, character) -> bool, graduated(character) -> bool, sticky { <index>: name }
 *  -> [{ index, leader | null, prev, newLeader, moves: [{ name, to }] }] (to = the leader's key; the leader itself -> its own key) */
function academyGroupSync(accounts, size, ready, graduated, sticky) {
  const S = sticky || {}, out = [], acc = (n) => (accounts || []).find(a => a && a.character === n);
  academyGroups(accounts, size).forEach(g => {
    const rows = g.logins.map(l => (accounts || []).find(a => a && String(a.login).toLowerCase() === String(l).toLowerCase())).filter(Boolean);
    const isReady = (a) => !!a && !!ready(String(a.login).toLowerCase(), String(a.character));
    const st = S[g.index] ? rows.find(a => String(a.character) === String(S[g.index])) : null;
    const lead = st && isReady(st) ? st : rows.find(isReady) || null;
    // the leader the group follows now (the party key most of its not-graduated members use) - for newLeader
    const keys = {}; rows.forEach(a => { if (graduated(String(a.character))) return; const k = String(a.party || a.character); keys[k] = (keys[k] || 0) + 1; });
    const prev = S[g.index] || Object.keys(keys).sort((x, y) => keys[y] - keys[x])[0] || '';
    if (!lead) { out.push({ index: g.index, leader: null, prev, newLeader: false, moves: [] }); return; }
    const L = String(lead.character), moves = [];
    rows.forEach(a => { const n = String(a.character); if (graduated(n)) return; if (String(a.party || n) !== L) moves.push({ name: n, to: L }); });
    out.push({ index: g.index, leader: L, prev, newLeader: !!prev && prev !== L, moves });
  });
  return out;
}
/** pure: apply moves to a swarm.config.json object (a copy) -> { cfg, changed: [text] } */
function academyApplyMoves(cfg, moves) {
  const j = JSON.parse(JSON.stringify(cfg || {})), changed = [];
  (moves || []).forEach(m => { const a = (j.accounts || []).find(x => x && x.character === m.name); if (a && String(a.party || a.character) !== m.to) { changed.push(`${m.name}: party ${a.party || a.character} -> ${m.to}`); a.party = m.to; } });
  return { cfg: j, changed };
}
/** the group plan: the academy route, the 35-40 room = the group's own Cruma Tower floor-1 room (academy.json spots.to40Rooms[index]) */
function academyGroupPlanSteps(cfg, gi) {
  const C = academyCfg(cfg), rooms = Array.isArray(C.spots.to40Rooms) ? C.spots.to40Rooms.filter(r => /^[a-z0-9-]{3,60}$/.test(String(r))) : [];
  const own = rooms.length ? rooms[gi % rooms.length] : null;
  return academyPlanSteps(cfg).map(s => {
    // ROOMS3040-2026-11-03 (owner: "in Cruma tower we have defined all rooms to hunt in"): the 30-35 step takes the group's own room too
    if ((s.id === 'aclv40' || s.id === 'aclv35') && own && s.spot && s.spot.kind === 'rooms') return Object.assign({}, s, { spot: Object.assign({}, s.spot, { roomId: own, roomIds: [own], order: 'nearest' }), note: `the group's own room ${own}` });
    return s;
  });
}

/** the CharCreateFail reason (L2 0x10) -> words + whether another name can help */
const CREATE_FAIL = {
  0: { why: 'the server refused the character', retry: true },
  1: { why: 'the account has no free character slot', retry: false, slotsFull: true },
  2: { why: 'the name is taken', retry: true },
  3: { why: 'the name is too long / not allowed', retry: true },
  4: { why: 'the name is not allowed', retry: true },
};
function createFailInfo(code) { return CREATE_FAIL[Number(code)] || { why: 'refused (code ' + code + ')', retry: true }; }

/** Settings/<Login>.xml text: set <SelectedCharacter> -> new text (adds it before </Option> when missing) */
function xmlSetSelected(xml, name) {
  const t = String(xml || '');
  if (/<SelectedCharacter>[^<]*<\/SelectedCharacter>/.test(t)) return t.replace(/<SelectedCharacter>[^<]*<\/SelectedCharacter>/, `<SelectedCharacter>${name}</SelectedCharacter>`);
  if (/<SelectedCharacter\s*\/>/.test(t)) return t.replace(/<SelectedCharacter\s*\/>/, `<SelectedCharacter>${name}</SelectedCharacter>`);
  return t.replace(/<\/Option>\s*$/, `  <SelectedCharacter>${name}</SelectedCharacter>\r\n</Option>\r\n`);
}
function xmlSelected(xml) { const m = String(xml || '').match(/<SelectedCharacter>([^<]*)<\/SelectedCharacter>/); return m ? m[1] : ''; }
/** make sure the one-off create script (Scripts\<file>) is in <ScriptsList> and enabled (added first) */
function xmlEnsureScript(xml, file, fullPath, guid) {
  let t = String(xml || '');
  const re = new RegExp(`<Script><IsEnabled>(true|false)</IsEnabled><guid>[^<]*</guid><Name>${file.replace(/[.]/g, '\\.')}</Name>`);
  if (re.test(t)) return t.replace(re, (m) => m.replace(/<IsEnabled>false<\/IsEnabled>/, '<IsEnabled>true</IsEnabled>'));
  const el = `<Script><IsEnabled>true</IsEnabled><guid>${guid}</guid><Name>${file}</Name><Path>${fullPath}</Path></Script>`;
  if (/<ScriptsList>/.test(t)) return t.replace(/<ScriptsList>/, `<ScriptsList>${el}`);
  if (/<ScriptsList\s*\/>/.test(t)) return t.replace(/<ScriptsList\s*\/>/, `<ScriptsList>${el}</ScriptsList>`);
  return t.replace(/<\/Option>\s*$/, `  <ScriptsList>${el}</ScriptsList>\r\n</Option>\r\n`);
}

/** the manager's decision for one academy account.
 *  acc = swarm.config.json entry { login, character, academy }, st = Logs/academy_<character>.json (written by swarm.js) | null,
 *  cr = Logs/academy_create_<login>.json (written by the create script) | null, done = Logs/academy_manager.json accounts[login] | {}
 *  -> { act: 'setup' | 'rename' | 'next' | 'slotsfull' | 'wait' | 'none', name?, why } */
function academyDecide(acc, st, cr, done, cfg, nowIso) {   // nowIso: tests pass a clock (ACADLOOP-2026-10-31)
  const C = academyCfg(cfg), D = done || {};
  if (!acc || !acc.academyMage || acc.enabled === false) return { act: 'none', why: 'not an academy account' };
  if (D.stopped) return { act: 'none', why: D.stopped };
  const ch = String(acc.character || '');
  // ACADLOOP-2026-10-31 (owner: "set that character for deletion and create a new academy toon and do it over again ... It should run 24/7"):
  // with end.deleteGraduate the loop never stops on full slots: graduates are deleted (the server frees the slot after its deletion timer), so it
  // waits end.slotWaitMin and tries again; no character cap
  if (cr && cr.result === 'fail' && cr.slotsFull) {
    if (!C.end.deleteGraduate) return { act: 'slotsfull', why: 'the account has no free character slot — academy loop stopped' };
    const since = (Date.parse(nowIso || '') || Date.now()) - (Date.parse(cr.at || '') || 0), wait = (Number(C.end.slotWaitMin) || 360) * 60000;
    if (cr.forChar === ch && since < wait) return { act: 'wait', why: `every slot is full or waiting for its deletion — trying again in ${Math.ceil((wait - since) / 60000)} min` };
    if (cr.forChar === ch) return { act: 'retry', why: `trying to create ${ch} again (the slots were full ${Math.round(since / 60000)} min ago)` };
  }
  if (cr && cr.result === 'ok' && cr.name && cr.name !== ch && cr.forChar === ch) return { act: 'rename', name: cr.name, why: `the character was created as ${cr.name} (the first name was taken)` };
  if (D.setupFor !== ch) return { act: 'setup', why: `new academy character ${ch}: class plan, party plan, invite list, run switch` };
  // RECREATE-2026-11-03 (live: the 5 group-1 re-creations ended silently - no create result, no character in game - and the manager waited for
  // ever): a create / re-open that brought no character into the game is tried again with back-off (15, 30, 60 ... max 360 min), never given up
  { const r = academyStuckCreate(st, cr, D, ch, nowIso); if (r) return r; }
  if (st && st.status === 'graduated' && st.name === ch) {
    if (!C.end.newCharacter) return D.loggedOutFor === ch ? { act: 'none', why: `${ch} graduated and logged out` } : { act: 'logout', why: `${ch} graduated — logging out` };
    if (!C.end.deleteGraduate && (Number(D.made) || 1) >= (Number(C.end.maxCharacters) || 7)) return { act: 'slotsfull', why: `${D.made || 1} academy characters made on this account (max ${C.end.maxCharacters})` };
    return { act: 'next', why: `${ch} graduated — ${C.end.deleteGraduate ? 'marked for deletion, ' : ''}the next academy character` };
  }
  return { act: 'wait', why: st && st.status ? `${ch}: ${st.status}${st.text ? ' — ' + st.text : ''}` : `${ch}: running` };
}
/** RECREATE-2026-11-03: pure - the new character never reached the game (no status file for it) after its create / re-open: retry with back-off.
 *  D.createAt = when the last create / re-open ran (else the last graduation), D.retries = tries so far, D.forceRetry = the owner asked (API) */
function academyStuckCreate(st, cr, done, ch, nowIso) {
  const D = done || {};
  if (st && st.name === ch) return null;                                   // it is (or was) in game - the normal flow
  const nowMs = Date.parse(nowIso || '') || Date.now();
  const last = (D.history || []).length ? Date.parse(D.history[D.history.length - 1].at || '') || 0 : 0;
  const at = Date.parse(D.createAt || '') || last;
  // RECREATE2-2026-11-03 (live: the forced retry came back every ~2 min - a dashboard POST re-saved a stale forceRetry over the tick's save):
  // a force only counts when it is NEWER than the last create / re-open (an ISO time; the old boolean = once, only before any create)
  const fAt = typeof D.forceRetry === 'string' ? Date.parse(D.forceRetry) || 0 : 0;
  const force = D.forceRetry === true ? !D.createAt : (fAt > 0 && fAt > at);
  if (!at && !force) return null;
  const n = Math.max(0, Number(D.retries) || 0), waitMin = Math.min(360, 15 * Math.pow(2, n));
  if (!force && nowMs - at < waitMin * 60000) return null;
  const made = cr && cr.result === 'ok' && cr.name === ch && cr.forChar === ch;
  return made ? { act: 'reopen', why: `${ch} was created but never came into the game - opening the account again (try ${n + 1})` }
    : { act: 'retry', why: `no character came into the game for ${ch} in ${Math.round((nowMs - at) / 60000)} min - creating it again (try ${n + 1})` };
}
/** RECREATE2-2026-11-03: pure - the name a re-try uses: the SAME name again (cur) unless the server refused that name (cr: fail, not slots full,
 *  for this character) - only then a new one. Keeps swarm.config.json / brain_host.json / the class plan untouched between tries. */
function academyRetryName(cur, cr) {
  const refused = !!(cr && cr.result === 'fail' && !cr.slotsFull && cr.forChar === cur && !/in game as /.test(String(cr.reason || '')));
  return refused ? null : String(cur || '') || null;
}
/** ACADLOOP-2026-10-31: the characters the create script may delete on this account = ONLY characters the pipeline itself made (manager state
 *  madeNames) that graduated (history), not yet deleted, never the one about to be made, never anything else. done = academy_manager accounts[login] */
function academyDeleteList(done, cfg, keep) {
  const C = academyCfg(cfg), D = done || {};
  if (!C.end.deleteGraduate) return [];
  const made = new Set((D.madeNames || []).map(String)), del = new Set((D.deleted || []).map(String)), k = new Set((keep || []).map(String));
  const grads = (D.history || []).map(h => h && String(h.graduated || '')).filter(Boolean);
  return [...new Set(grads)].filter(n => made.has(n) && !del.has(n) && !k.has(n) && NAME_RE.test(n));
}

/** swarm.js / test: the academy funds -> wanted adena of one character (fund_rules chars target wins) */
function academyFundTarget(cfg, charTarget) {
  if (charTarget !== undefined && charTarget !== null && charTarget !== '' && isFinite(Number(charTarget))) return Number(charTarget);
  return Number(academyCfg(cfg).funds.target) || 0;
}

const API = { DEF, NAME_RE, academyCfg, academyName, academyNames, academyPlanSteps, academyPlan, loginNo, academyGroupReady, academyGroups, academyGroupOf, academyGroupMoves, academyGroupSync, academyApplyMoves, academyGroupPlanSteps, createFailInfo, xmlSetSelected, xmlSelected, xmlEnsureScript, academyDecide, academyDeleteList, academyStuckCreate, academyRetryName, academyFundTarget };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AcademyLogic = API;
