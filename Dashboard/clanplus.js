// CLAN PLUS (CLANPLUS-2026-10-30, owner from the phone: "/clan looks awefull under mobile and the skills make nonsense" / "I need to be able to
// select a clan skill to learn. Also u need to know where and when we get clan reputation, how much is left, what is in clan warehouse of items
// we need to clan skills" / "I also want to be able to create permissuons for clan via Dashboard" / "Should be easy, Compact and Nice to use").
// Three Clan tab sections, mobile first (rows + chips, no wide tables):
//   skills(d)  one row per clan skill: learned level, the next level (effect, reputation, items: clan warehouse / leader's bag / needed),
//              what is missing, "Learn this" (saves the skill as the clan's focus via /api/clan skillfocus, then sends !clanskill to the clan
//              leader: swarm.js clanLearnFocus learns exactly the focus skill at a village master)
//   rep(d)     reputation now, what the next clan level and the chosen skill still need, where reputation comes from (and what our bots do)
//   perms(d)   per rank 1-9 the privileges read from the game + the WANTED ones the owner ticks (/api/clan action 'privs' ->
//              Scripts/data/clan_privileges.json; the clan leader applies them in the game)
// Data: GET /api/clan (state.clanInfo / clanSkills / warehouse, data.skills / levels / reputationSources, squads, leaderBag, privWanted).
// Uses index.html globals: esc, api, uiConfirm, uiP, uiEm, uiList, confirmOrder, send, loadClan, CLAN, STATE, itemIcon. No browser dialogs.
(function () {
  'use strict';
  const h = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const n = (v) => (v == null ? '?' : Number(v).toLocaleString('en-US'));
  const icon = (id) => (typeof itemIcon === 'function' ? `<img class="gi" src="${itemIcon(id)}" alt="" onerror="this.style.visibility='hidden'">` : '');
  // L2J H5 L2Clan CP_* privilege bits, grouped (the same list as clansquads.js)
  const PRIV_GROUPS = [
    ['Members', [[2, 'Invite members'], [4, 'Give titles'], [16, 'Manage ranks'], [64, 'Dismiss members'], [256, 'Academy masters (sponsors)']]],
    ['Clan', [[8, 'View the clan warehouse'], [32, 'Clan wars'], [128, 'Register the crest'], [512, 'Manage troops / fame'], [1024, 'Summon the airship']]],
    ['Clan hall', [[2048, 'Open doors'], [4096, 'Other rights'], [8192, 'Auction'], [16384, 'Dismiss'], [32768, 'Set functions']]],
    ['Castle', [[65536, 'Open doors'], [131072, 'Manor'], [262144, 'Siege'], [524288, 'Use functions'], [1048576, 'Dismiss'], [2097152, 'Taxes'], [4194304, 'Mercenaries'], [8388608, 'Set functions']]],
  ];
  const RANK_NAME = { 1: 'Vice leader / Elders', 2: 'Rank 2', 3: 'Rank 3', 4: 'Rank 4', 5: 'Rank 5', 6: 'Members (default)', 7: 'Rank 7', 8: 'Rank 8', 9: 'Academy' };
  const CP = { rank: 6, edit: {}, kindOpen: { clan: true, squad: false, residential: false }, filter: 'now' };

  function clanCtx(d) {
    const st = (d && d.state) || {}, ci = st.clanInfo || {}, D = (d && d.data) || {};
    const clvl = +((st.clan && st.clan.level) || ci.level || 0) || 0;
    const wh = {}; ((st.warehouse && st.warehouse.items) || []).forEach(i => { if (!+i.enchant) wh[+i.id] = (wh[+i.id] || 0) + (+i.count || 0); });
    const bag = (d && d.leaderBag) || {};
    const learned = st.clanSkills || {};
    const focus = (((d && d.quests) || {}).clan || {}).skillFocus || null;
    return { st, ci, D, clvl, wh, bag, learned, focus, rep: ci.rep != null ? +ci.rep : null, leader: d.leader || st.leader || '' };
  }

  // ------------------------------------------------------------------------------------------------ skills
  function skills(d) {
    const C = clanCtx(d), all = C.D.skills || [];
    if (!all.length) return '<div class="muted">No clan skill data (Scripts/data/clan_data.json).</div>';
    const byId = {}; all.forEach(s => { (byId[s.id] = byId[s.id] || []).push(s); }); Object.values(byId).forEach(L => L.sort((a, b) => a.level - b.level));
    const rows = Object.keys(byId).map(id => {
      const L = byId[id], have = +C.learned[id] || 0, next = L.find(s => s.level === have + 1) || null, max = L[L.length - 1].level;
      return { id: +id, name: L[0].name, kind: L[0].kind, have, max, next, cur: L.find(s => s.level === have) || null };
    });
    const missing = (s) => {
      const out = [];
      if (s.clanLevel > C.clvl) out.push(`clan level ${s.clanLevel}`);
      if (C.rep != null && C.rep < s.reputation) out.push(`${n(s.reputation - C.rep)} more reputation`);
      (s.items || []).forEach(i => { const got = (+C.bag[i.id] || 0) + (C.wh[i.id] || 0); if (got < i.count) out.push(`${i.count - got}× ${i.name}`); });
      if (s.kind === 'residential') out.push('a castle / fortress');
      if (s.kind === 'squad') out.push('a Royal Guard / Order of Knights squad');
      return out;
    };
    const itemLine = (s) => (s.items || []).map(i => { const w = C.wh[i.id] || 0, b = +C.bag[i.id] || 0, ok = w + b >= i.count;
      return `<span class="chip ${ok ? 'ok' : 'bad'}" title="clan warehouse ${w} · in ${h(C.leader)}'s bag ${b} · needed ${i.count}">${icon(i.id)}${h(i.name)} <b>${w + b}</b>/${i.count}${w ? ` <span class="muted">(WH ${w}${b ? ' + bag ' + b : ''})</span>` : b ? ' <span class="muted">(bag)</span>' : ''}</span>`; }).join(' ');
    const isFoc = (r) => C.focus && +C.focus.id === r.id && r.next && +C.focus.level === r.next.level;
    const row = (r) => {
      const s = r.next, miss = s ? missing(s) : [], can = s && !miss.length;
      const state = !s ? '<span class="fit good">max</span>' : can ? '<span class="fit good">can learn now</span>' : `<span class="fit low">missing: ${h(miss.join(', '))}</span>`;
      return `<div class="cpx-sk${isFoc(r) ? ' foc' : ''}${s && s.clanLevel > C.clvl + 1 ? ' far' : ''}">
        <div class="cpx-skh"><b>${h(r.name)}</b> <span class="muted">${r.have ? 'learned lvl ' + r.have : 'not learned'} / ${r.max}</span>${isFoc(r) ? ' <span class="fit next">chosen</span>' : ''}</div>
        ${r.cur ? `<div class="muted">now: ${h(r.cur.effect || '')}</div>` : ''}
        ${s ? `<div>lvl ${s.level}: ${h(s.effect || '')}</div>
          <div class="cpx-need"><span class="chip ${C.rep != null && C.rep >= s.reputation ? 'ok' : 'bad'}">${n(s.reputation)} rep</span> <span class="chip ${s.clanLevel <= C.clvl ? 'ok' : 'bad'}">clan lvl ${s.clanLevel}</span> ${itemLine(s)}${s.minRank ? ` <span class="muted">for ${h(String(s.minRank).toLowerCase())}+</span>` : ''}</div>
          <div class="cpx-act">${state}${s.kind === 'residential' ? '' : `<button data-cpxlearn="${r.id}|${s.level}" ${can ? '' : 'class="ghost"'}>${isFoc(r) ? 'Learn now' : 'Learn this'}</button>`}</div>` : `<div class="cpx-act">${state}</div>`}
      </div>`;
    };
    const KIND = [['clan', 'Clan skills (the whole clan)'], ['squad', 'Squad skills (one Royal Guard / Order of Knights)'], ['residential', 'Castle / fortress skills']];
    const focS = C.focus && all.find(s => s.id === +C.focus.id && s.level === +C.focus.level);
    const head = `<div class="cpx-top">Reputation <b>${n(C.rep)}</b> · clan level <b>${C.clvl}</b>${focS ? ` · chosen: <b>${h(focS.name)} ${focS.level}</b>` : ' · no skill chosen'}</div>
      <div class="muted cpx-note">Tap <b>Learn this</b>: it becomes the clan's chosen skill and ${h(C.leader || 'the clan leader')} goes to a village master to learn it. The items have to be in his bag: when they are only in the clan warehouse he takes them out first (or the server refuses). Learned skills are read from his skill list.</div>`;
    const fil = `<div class="cpx-fil">${[['now', 'Can learn now'], ['all', 'All skills']].map(([k, t]) => `<button class="${CP.filter === k ? 'on' : ''}" data-cpxfil="${k}">${t}</button>`).join('')}</div>`;
    const out = (body) => head + fil + (body || `<div class="muted cpx-note">Nothing can be learned right now (reputation, clan level or items missing) — tap <b>All skills</b> to see what each one needs.</div>`);
    return out(KIND.map(([k, t]) => {
      const L = rows.filter(r => r.kind === k && (CP.filter !== 'now' || (r.next && !missing(r.next).length))).sort((a, b) => ((a.next || {}).clanLevel || 99) - ((b.next || {}).clanLevel || 99) || a.name.localeCompare(b.name));
      if (!L.length) return '';
      const ready = L.filter(r => r.next && !missing(r.next).length).length, done = L.filter(r => r.have).length;
      return `<details class="cpx-kind" data-cpxkind="${k}"${CP.kindOpen[k] ? ' open' : ''}><summary><b>${h(t)}</b> <span class="muted">${done}/${L.length} learned${ready ? ' · ' + ready + ' can be learned now' : ''}</span></summary>${L.map(row).join('')}</details>`;
    }).join(''));
  }

  // ------------------------------------------------------------------------------------------------ reputation
  // where reputation comes from (L2J H5) + whether our bots do it
  const REP_OURS = [
    ['Academy graduate', 'automatic', 'an academy member who makes the 2nd class change (level 40) leaves the clan; the clan gets 190–650'],
    ['Q508 bosses', 'when switched on', 'Clan raid quest (clan level 5+): the clan leader within 1500 of the kill'],
    ['Q509 bosses', 'when switched on', 'Clan raid quest (clan level 5+)'],
    ['Q510', 'when switched on', 'claws from monsters, 30 each'],
    ['Raid point ranking (weekly)', 'automatic', 'raid kills of all clan members count every week'],
    ['Blood Oath / Blood Alliance (exchange)', 'manual', 'trade them in at a village master'],
    ['Clan war kill', 'no', 'PvP'],
    ['Hero', 'no', 'Olympiad'],
    ['Castle / fortress taken', 'no', 'sieges'],
  ];
  function rep(d) {
    const C = clanCtx(d), L = C.D.levels || [], next = L.find(l => +l.level === C.clvl + 1) || null, src = C.D.reputationSources || {};
    const act = ((((d && d.quests) || {}).clan || {}).activeQuests || []).map(String);
    const focS = C.focus && (C.D.skills || []).find(s => s.id === +C.focus.id && s.level === +C.focus.level);
    const need = (label, amount) => amount ? `<div class="cpx-rr"><span>${label}</span><span><b>${n(amount)}</b>${C.rep != null ? (C.rep >= amount ? ' <span class="fit good">enough</span>' : ` <span class="fit low">${n(amount - C.rep)} to go</span>`) : ''}</span></div>` : '';
    const ours = (k, how) => how === 'automatic' ? '<span class="fit good">bots do it</span>' : how === 'when switched on' ? (act.some(a => k.indexOf(a) >= 0) ? '<span class="fit good">switched on</span>' : '<span class="fit ok">switch on below</span>') : how === 'manual' ? '<span class="fit ok">manual</span>' : '<span class="fit low">not done</span>';
    return `<div class="cpx-top">Reputation now <b>${n(C.rep)}</b>${C.ci.seenAt ? ` <span class="muted">(read ${typeof ago === 'function' ? ago(C.ci.seenAt) : ''})</span>` : ''}</div>
      ${need(`Clan level ${C.clvl + 1}`, next && +next.reputation)}${focS ? need(`${h(focS.name)} ${focS.level}`, +focS.reputation) : ''}
      <div class="cpx-sub">Where reputation comes from</div>
      ${REP_OURS.map(([k, how, why]) => `<div class="cpx-rr"><span><b>${h(k)}</b> <span class="muted">${h(src[k] != null ? src[k] : '')}</span><div class="muted">${h(why)}</div></span><span>${ours(k, how)}</span></div>`).join('')}`;
  }

  // ------------------------------------------------------------------------------------------------ permissions
  function perms(d) {
    const C = clanCtx(d), sq = (d.squads && d.squads.clans && d.squads.clans[0]) || null, ranks = (sq && sq.ranks) || [];
    const want = (d.privWanted && d.privWanted.ranks) || {};
    const cur = (r) => { const x = ranks.find(k => +k.rank === r); return x && x.privBits != null ? +x.privBits : null; };
    const who = (r) => { const x = ranks.find(k => +k.rank === r); return x ? (x.who || []) : []; };
    const R = CP.rank, base = CP.edit[R] != null ? CP.edit[R] : (want[R] != null ? +want[R].bits : (cur(R) != null ? cur(R) : 0)), gameV = cur(R);
    const tabs = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(r => { const w = want[r] != null, diff = w && cur(r) != null && +want[r].bits !== cur(r);
      return `<button class="cpx-rk${r === R ? ' on' : ''}" data-cpxrank="${r}" title="${h(RANK_NAME[r])}">${r}<span class="muted">${who(r).length || ''}</span>${diff ? '<i class="cpx-dot"></i>' : ''}</button>`; }).join('');
    const box = PRIV_GROUPS.map(([g, L]) => `<div class="cpx-pg"><div class="cpx-sub">${h(g)}</div><div class="cpx-pl">${L.map(([b, t]) => { const on = (base & b) === b, inGame = gameV != null && (gameV & b) === b;
      return `<label class="cpx-pv${on ? ' on' : ''}"><input type="checkbox" data-cpxpriv="${b}"${on ? ' checked' : ''}> ${h(t)}${gameV != null && on !== inGame ? ` <span class="fit ${inGame ? 'low' : 'next'}">${inGame ? 'on in game' : 'off in game'}</span>` : ''}</label>`; }).join('')}</div></div>`).join('');
    const dirty = CP.edit[R] != null && CP.edit[R] !== (want[R] != null ? +want[R].bits : gameV);
    const ppl = who(R);
    return `<div class="muted cpx-note">Tick what each rank may do and press Save. ${h(C.leader || 'The clan leader')} sets it in the game (Alt+N → Privileges) the next time he is free in town; the game value is shown next to every change.</div>
      <div class="cpx-rks">${tabs}</div>
      <div class="cpx-top"><b>Rank ${R}</b> <span class="muted">${h(RANK_NAME[R])} · ${ppl.length} member${ppl.length === 1 ? '' : 's'}${gameV == null ? ' · game value not read yet' : ''}${want[R] && want[R].at ? ' · saved ' + (typeof ago === 'function' ? ago(want[R].at) : '') : ''}</span></div>
      ${ppl.length ? `<details class="cpx-who"><summary class="muted">who has rank ${R}</summary><div class="cpx-chips">${ppl.map(x => `<span class="chip">${h(x)}</span>`).join('')}</div></details>` : ''}
      ${box}
      <div class="cpx-act"><button data-cpxsave="${R}" ${dirty ? '' : 'disabled'}>Save rank ${R}</button>${CP.edit[R] != null ? `<button class="ghost" data-cpxundo="${R}">Undo</button>` : ''}</div>`;
  }
  // ------------------------------------------------------------------------------------------------ squads tree
  // (owner 2026-10-30: like legacy-lineage2.com clan-1.jpg: Clan on top with Academy beside it, two Royal Guards under the Clan, two Orders of
  // Knights under each Royal Guard; tap a box = its members; units not created yet greyed with what unlocks them). L2J H5 sub-unit types
  // (L2Clan SUBUNIT_*) and creation costs (Config ROYAL_GUARD / KNIGHT unit: clan level 6 / 7, 5,000 / 10,000 reputation).
  const UNIT = { 0: { label: 'Clan', lvl: 0, rep: 0, key: 'main' }, '-1': { label: 'Academy', lvl: 5, rep: 0, key: 'academy' },
    100: { label: 'Royal Guard A', lvl: 6, rep: 5000, key: 'royalGuardsEach' }, 200: { label: 'Royal Guard B', lvl: 6, rep: 5000, key: 'royalGuardsEach' },
    1001: { label: 'Order of Knights A-1', lvl: 7, rep: 10000, key: 'knightsEach' }, 1002: { label: 'Order of Knights A-2', lvl: 7, rep: 10000, key: 'knightsEach' },
    2001: { label: 'Order of Knights B-1', lvl: 7, rep: 10000, key: 'knightsEach' }, 2002: { label: 'Order of Knights B-2', lvl: 7, rep: 10000, key: 'knightsEach' } };
  const CT = { open: {} };
  function tree(d) {
    const C = clanCtx(d), k = (d.squads && d.squads.clans && d.squads.clans[0]) || null;
    if (!k || k.unknown) return '<div class="muted">No member list from the server yet.</div>';
    const S = {}; (k.squads || []).forEach(s => { S[s.type] = s; });
    // MEMBER CAPACITY (owner: "The royal guards opens op for more members. We need to be able to see that"): the places each unit adds =
    // clan_data.json levels[].memberLimitAfter (L2J H5 ClanTable / L2Clan.getMaxNrOfMembers + getSubPledgeMembersLimit) at the clan's level,
    // or at the level that opens the unit when the clan is below it; clan level 0 (not in the table) = 10 main places
    const placesAt = (key, lvl) => { const L = (C.D.levels || []).find(l => +l.level === lvl); const v = L && L.memberLimitAfter ? +L.memberLimitAfter[key] || 0 : 0; return key === 'main' && lvl < 1 ? 10 : v; };
    const placesOf = (type) => { const U = UNIT[type]; return placesAt(U.key, Math.max(C.clvl, U.lvl)); };
    const made = (type) => type === 0 || !!(S[type] && S[type].created);
    const ALLT = [0, -1, 100, 200, 1001, 1002, 2001, 2002];
    const memAll = ALLT.reduce((a, t) => a + ((S[t] && S[t].members) || []).length, 0);
    const capNow = ALLT.filter(made).reduce((a, t) => a + placesAt(UNIT[t].key, C.clvl), 0), capAll = ALLT.reduce((a, t) => a + placesOf(t), 0);
    const box = (type, big) => {
      const U = UNIT[type], s = S[type] || { members: [], created: false }, mk = made(type), mem = s.members || [];
      const limit = mk ? placesAt(U.key, C.clvl) : placesOf(type), name = s.name && type !== 0 ? s.name : (type === 0 ? k.name : '');
      const why = mk ? '' : C.clvl < U.lvl ? `needs clan level ${U.lvl}${U.rep ? ' + ' + n(U.rep) + ' rep' : ''}` : `create it at a village master${U.rep ? ' (' + n(U.rep) + ' rep)' : ''}`;
      const cap = s.leader || (type === 0 ? k.leader : '');
      const open = !!CT.open[type] && mem.length;
      // CLANUNIT (owner: "It should create the royal Guards inside the clan page"): an openable unit gets "Create…" -> name + captain + cost
      const canMake = !mk && type !== -1 && C.clvl >= U.lvl, formOpen = canMake && CT.form === type;
      const mainMem = ((S[0] && S[0].members) || []).slice().sort((a, b) => b.level - a.level);
      const form = formOpen ? `<div class="ct-form"><label>Name <input data-ctname="${type}" maxlength="16" placeholder="2-16 letters / digits" value="${h(CT.name || '')}"></label>
          <label>Captain <select data-ctcap="${type}"><option value="">— choose —</option>${mainMem.map(m => `<option value="${h(m.name)}"${CT.cap === m.name ? ' selected' : ''}>${h(m.name)} (${m.level})</option>`).join('')}</select></label>
          <div class="muted">Costs ${n(U.rep)} reputation (the clan has ${n(C.rep)})${C.rep != null && C.rep < U.rep ? ' — <b>not enough</b>' : ''} · clan level ${U.lvl}. ${h(C.leader || 'The clan leader')} creates it at a village master.</div>
          <div class="cpx-act"><button data-ctmake="${type}">Create ${h(U.label.replace(/ [AB](-\d)?$/, ''))}</button><button class="ghost" data-ctcancel="1">Cancel</button></div></div>` : '';
      return `<div class="ct-box${big ? ' big' : ''}${mk ? '' : ' off'}${open ? ' open' : ''}${formOpen ? ' form' : ''}">${mk ? '' : `<span class="ct-add">+${limit}</span>`}
        <button class="ct-hd" data-ctunit="${type}" ${mem.length ? '' : 'disabled'} aria-expanded="${open}"><b>${h(U.label)}</b>${name ? `<span class="ct-nm">${h(name)}</span>` : ''}
        <span class="ct-ln">${mk ? `<b>${mem.length}</b> / ${limit} places${cap ? ' · ' + h(cap) : ''}` : `${limit} places · ${h(why)}`}</span></button>
        ${canMake && !formOpen ? `<button class="ct-mk" data-ctform="${type}">Create…</button>` : ''}${form}
        ${open ? `<div class="ct-mem">${mem.map(m => `<a class="chip${m.online === false ? ' off' : ''}" href="#/char/${encodeURIComponent(m.name)}" title="lvl ${m.level} ${h(m.cls || '')}${m.party ? ' · party ' + h(m.party) : ''}">${m.leader ? '★ ' : ''}${h(m.name)} <span class="muted">${m.level}</span></a>`).join('')}</div>` : ''}</div>`;
    };
    const lastMake = ((d.clanLog || []).filter(l => /create (guard|knight)/i.test(l)).slice(-1)[0] || '');
    const notMade = ALLT.filter(t => !made(t));
    return `<div class="ct-cap"><div><b>${memAll}</b> / <b>${capNow}</b> places now <span class="muted">(only created squads count)</span></div>
        <div>With every squad created: <b>${capAll}</b> places${capAll > capNow ? ` <span class="fit next">+${capAll - capNow}</span>` : ''}</div></div>
      <div class="ctree"><ul><li><div class="ct-top">${box(0, true)}<span class="ct-side"></span>${box(-1)}</div>
      <ul><li>${box(100)}<ul><li>${box(1001)}</li><li>${box(1002)}</li></ul></li>
          <li>${box(200)}<ul><li>${box(2001)}</li><li>${box(2002)}</li></ul></li></ul></li></ul></div>
      ${notMade.length ? `<div class="cpx-sub">More places</div>${notMade.map(t => { const U = UNIT[t]; return `<div class="cpx-rr"><span><b>${h(U.label)}</b> <span class="muted">${C.clvl < U.lvl ? `needs clan level ${U.lvl}${U.rep ? ' + ' + n(U.rep) + ' reputation' : ''}` : `can be created now${U.rep ? ' (' + n(U.rep) + ' reputation)' : ''}`}</span></span><span class="fit next">+${placesOf(t)} places</span></div>`; }).join('')}` : ''}
      ${lastMake ? `<div class="cpx-note">Last squad result: <span class="muted">${h(lastMake.replace(/^(\S+)T(\d\d:\d\d)\S*\s*/, '$2 '))}</span></div>` : ''}
      <div class="muted cpx-note">Tap a squad for its members (several per squad). Greyed = not created yet; the badge shows the places it adds.</div>`;
  }

  // ------------------------------------------------------------------------------------------------ clan level requirements
  // owner's table (2026-10-30, L2 classic, ranges as given) next to our datapack (Scripts/data/clan_data.json levels, L2J H5); where they differ
  // both are shown until the server answers (the real L2Toggle value wins once known: nextLevel from the clan leader)
  const OWNER_LV = {
    1: { sp: '20–30k', adena: '650k', unlock: 'clan warehouse' }, 2: { sp: '100–150k', adena: '2.5M', unlock: 'clan hall auction' },
    3: { sp: '35k–500k', items: 'Proof of Blood / Blood Mark', unlock: 'clan crest' }, 4: { sp: '100k–1.4M', items: 'Proof of Alliance (quest Proof of Clan Alliance)' },
    5: { sp: '250k–3.5M', items: 'Proof of Aspiration (quest Pursuit of Clan Ambition)', unlock: 'Academy' },
    6: { rep: 5000, members: '20+', items: 'Royal Guard', unlock: 'Royal Guards' }, 7: { rep: 10000, members: '40+', items: 'Knightly squads', unlock: 'Orders of Knights' },
    8: { rep: 20000, members: '60+' }, 9: { rep: 40000, members: '60–70+', items: '150 Blood Oath' }, 10: { rep: 40000, members: '70+', items: 'Blood Pledge' },
    11: { rep: 75000, members: '90+', items: 'Cloak of Radiant Light' } };
  const shortN = (v) => { v = +v || 0; return v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 1 : 0).replace('.0', '') + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(v); };
  const ownerMin = (s) => { const m = String(s || '').replace(/[,\s]/g, '').match(/^([\d.]+)(k|M)?/i); if (!m) return null; return Math.round(+m[1] * (m[2] ? (m[2].toLowerCase() === 'k' ? 1e3 : 1e6) : 1)); };
  function levels(d) {
    const C = clanCtx(d), L = (C.D.levels || []).slice().sort((a, b) => a.level - b.level), N = C.st.nextLevel || {};
    const memNow = N.members && N.members.have != null ? +N.members.have : ((d.squads && d.squads.clans && d.squads.clans[0] && d.squads.clans[0].total) || {}).members;
    const sp = N.sp && N.sp.have != null ? +N.sp.have : +C.st.sp || null, ad = N.adena && N.adena.have != null ? +N.adena.have : +C.st.adena || null;
    const tick = (ok) => ok == null ? '<span class="fit ok">?</span>' : ok ? '<span class="fit good">✓</span>' : '<span class="fit low">✗</span>';
    const rows = L.map(l => {
      const O = OWNER_LV[l.level] || {}, done = l.level <= C.clvl, isNext = l.level === C.clvl + 1, parts = [];
      const both = (label, ours, own, have, needMin) => {
        const differ = own != null && String(own).replace(/\D/g, '') !== String(ours).replace(/\D/g, '');
        const ok = done ? true : have == null || needMin == null ? null : have >= needMin;
        return `<div class="cl-need">${isNext || !done ? tick(ok) : ''}<span>${label}: <b>${ours}</b>${differ ? ` <span class="muted">(owner's table: ${h(own)} · datapack: ${ours})</span>` : ''}</span></div>`;
      };
      if (+l.sp || O.sp) parts.push(both('SP', +l.sp ? shortN(l.sp) : '–', O.sp, sp, Math.max(+l.sp || 0, ownerMin(O.sp) || 0) || null));
      if (+l.adena || O.adena) parts.push(both('Adena', +l.adena ? shortN(l.adena) : '–', O.adena, ad, +l.adena || ownerMin(O.adena)));
      if (+l.reputation || O.rep) parts.push(both('Reputation', n(l.reputation), O.rep != null ? n(O.rep) : null, C.rep, +l.reputation || O.rep));
      if (+l.members || O.members) { const own = O.members, need = +l.members || ownerMin(own), ownMin = ownerMin(own);
        const ok = done ? true : memNow == null ? null : memNow >= need, okOwn = ownMin == null || memNow == null ? null : memNow >= ownMin;
        parts.push(`<div class="cl-need">${!done ? tick(ok) : ''}<span>Members: <b>${l.members ? l.members + '+' : '–'}</b>${own && String(ownMin) !== String(l.members) ? ` <span class="muted">(owner's table: ${h(own)}${!done && okOwn != null ? (okOwn ? ' ✓' : ' ✗') : ''} · datapack: ${l.members}+)</span>` : ''}${!done && memNow != null ? ` <span class="muted">· we have ${memNow}</span>` : ''}</span></div>`); }
      const items = (l.items || []).map(i => `${i.count > 1 ? i.count + '× ' : ''}${i.name}`).join(', ');
      if (items || O.items) parts.push(`<div class="cl-need">${!done && N.items && isNext ? tick((N.items || []).every(i => i.have != null && i.have >= i.need)) : ''}<span>Items: <b>${h(items || '–')}</b>${O.items && O.items !== items ? ` <span class="muted">(owner's table: ${h(O.items)})</span>` : ''}${l.itemSource ? `<div class="muted">${h(l.itemSource)}</div>` : ''}</span></div>`);
      if (O.unlock) parts.push(`<div class="cl-need"><span class="muted">Unlocks: ${h(O.unlock)}</span></div>`);
      { const M = l.memberLimitAfter || {}, tot = (+M.main || 0) + (+M.academy || 0) + 2 * (+M.royalGuardsEach || 0) + 4 * (+M.knightsEach || 0);   // places at this level (every squad created)
        parts.push(`<div class="cl-need"><span>Places: <b>${tot}</b> <span class="muted">= clan ${+M.main || 0}${+M.academy ? ' + academy ' + M.academy : ''}${+M.royalGuardsEach ? ' + 2 Royal Guards × ' + M.royalGuardsEach : ''}${+M.knightsEach ? ' + 4 Orders of Knights × ' + M.knightsEach : ''}</span></span></div>`); }
      return `<div class="cl-lv${done ? ' done' : ''}${isNext ? ' next' : ''}"><div class="cl-lh"><b>Level ${l.level}</b> ${done ? '<span class="fit good">reached</span>' : isNext ? '<span class="fit next">next</span>' : ''}</div>${parts.join('')}</div>`;
    }).join('');
    return `<div class="cpx-top">Clan level <b>${C.clvl}</b> · reputation <b>${n(C.rep)}</b> · members <b>${memNow != null ? memNow : '?'}</b>${sp != null ? ` · leader SP <b>${shortN(sp)}</b>` : ''}${ad != null ? ` · adena <b>${shortN(ad)}</b>` : ''}</div>
      ${N.missing && N.missing.length ? `<div class="muted cpx-note">Level ${N.next || C.clvl + 1} still needs (the clan leader's check): ${h(N.missing.join('; '))}</div>` : ''}
      <div class="muted cpx-note">Where the owner's table and our datapack (L2J H5) differ both are shown; the server decides — once it refuses or accepts a level-up that value wins.</div>${rows}`;
  }
  function badgeLevels(d) { const C = clanCtx(d), N = C.st.nextLevel || {}; return `level ${C.clvl}${N.missing && N.missing.length ? ' · next needs ' + N.missing.join(', ') : ''}`; }

  // ------------------------------------------------------------------------------------------------ academy
  // (owner: "academy should be able to follow each academy toon AND also auto invite new academy toons automatically"): every academy member
  // + every candidate (our character below 40 that is not in the clan) with level progress to the graduation (40 = 2nd class change), what it
  // does now and its invite status; the academyAuto switch (clan_quests.json clan.auto, swarm.js clanAutoFlag('academyAuto', true))
  const CA = { flags: null, at: 0, busy: false };
  async function caLoad() { if (CA.busy || Date.now() - CA.at < 30000) return; CA.busy = true; try { const r = await api('/api/clanauto'); if (r && r.flags) { CA.flags = r.flags; CA.at = Date.now(); rerender(); } } catch (e) { } CA.busy = false; }
  function academy(d) {
    caLoad();
    const C = clanCtx(d), k = (d.squads && d.squads.clans && d.squads.clans[0]) || null, chars = (typeof STATE !== 'undefined' && STATE && STATE.chars) || [];
    const byName = {}; chars.forEach(c => { byName[c.name] = c; });
    const inClan = new Set(); ((k && k.squads) || []).forEach(s => (s.members || []).forEach(m => inClan.add(m.name)));
    const acad = (((k && k.squads) || []).find(s => s.type === -1) || { members: [], limit: 20 });
    const lead = byName[C.leader] || null;
    const on = CA.flags ? CA.flags.academyAuto !== false : null;
    const cand = chars.filter(c => +c.level > 0 && +c.level < 40 && !inClan.has(c.name) && c.name !== C.leader);
    const row = (name, lvl, member) => {
      const c = byName[name] || {}, p = Math.min(100, Math.round((+lvl || 0) * 100 / 40)), task = c.task || (c.doing && c.doing.activity) || c.mode || '';
      const near = lead && c.x != null && lead.x != null && Math.hypot(c.x - lead.x, c.y - lead.y) < 900;
      const st = member ? '<span class="fit good">in the Academy</span>' : on === false ? '<span class="fit low">not invited (switch off)</span>' : near ? '<span class="fit next">next to the clan leader: invite now</span>' : `<span class="fit ok">invited automatically when next to ${h(C.leader || 'the clan leader')}</span>`;
      return `<a class="ac-row" href="#/char/${encodeURIComponent(name)}"><div class="ac-h"><b>${h(name)}</b> <span class="muted">lvl ${lvl}${c.cls ? ' ' + h(c.cls) : ''}${c.party ? ' · party ' + h(c.party) : ''}</span></div>
        <div class="ac-bar"><i style="width:${p}%"></i></div><div class="muted ac-l">${+lvl >= 40 ? 'graduates at the 2nd class change' : `${40 - lvl} levels to graduation (40, 2nd class change)`}${task ? ' · ' + h(String(task).slice(0, 60)) : ''}</div>
        <div>${st}</div></a>`;
    };
    return `<div class="ac-sw"><button class="${on ? 'on' : ''}" data-cpxacad="${on ? 0 : 1}" aria-pressed="${!!on}">${on == null ? '…' : on ? 'ON' : 'OFF'}</button>
        <span>Invite new characters below level 40 into the Academy automatically</span></div>
      <div class="muted cpx-note">The clan leader invites them when they stand next to him (within 900). At the 2nd class change (level 40) a member graduates: it leaves the clan and the clan gets 190–650 reputation; tick it under Invites to get it back as a normal member.</div>
      <div class="cpx-sub">Academy members ${acad.members.length} / ${acad.limit || 20}</div>
      ${acad.members.length ? acad.members.map(m => row(m.name, m.level, true)).join('') : '<div class="muted">nobody in the Academy yet</div>'}
      <div class="cpx-sub">Candidates (our characters below 40, not in the clan) ${cand.length}</div>
      ${cand.length ? cand.sort((a, b) => b.level - a.level).map(c => row(c.name, c.level, false)).join('') : '<div class="muted">none right now — every character is level 40+ or already in the clan</div>'}`;
  }

  // ------------------------------------------------------------------------------------------------ tabs
  // (owner: "make it with tabs that makes sense"): #/clan/<tab>, remembered per viewer (localStorage, try/catch)
  const TABS = [['overview', 'Overview'], ['squads', 'Squads'], ['skills', 'Skills'], ['academy', 'Academy'], ['members', 'Members & ranks'], ['invites', 'Invites'], ['more', 'Quests & events']];
  function curTab() {
    const a = String(location.hash || '').replace(/^#\/?/, '').split('/'); if (a[0] === 'clan' && a[1] && TABS.some(t => t[0] === a[1])) return a[1];
    try { const v = localStorage.getItem('clanTab'); if (v && TABS.some(t => t[0] === v)) return v; } catch (e) { }
    return 'overview';
  }
  function tabs(parts) {
    const cur = curTab();
    const bar = `<div class="cpx-tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" class="${k === cur ? 'on' : ''}" aria-selected="${k === cur}" data-cpxtab="${k}">${t}${parts.badge && parts.badge[k] ? `<span class="cpx-tb">${h(parts.badge[k])}</span>` : ''}</button>`).join('')}</div>`;
    return bar + `<div class="cpx-pane" data-cpxpane="${cur}">${parts[cur] || '<div class="muted">nothing here yet</div>'}</div>`;
  }

  function badgePerms(d) { const w = (d.privWanted && d.privWanted.ranks) || {}; const k = Object.keys(w).length; return k ? `${k} rank${k === 1 ? '' : 's'} set` : 'nothing set yet'; }
  function badgeSkills(d) { const C = clanCtx(d); const f = C.focus && (C.D.skills || []).find(s => s.id === +C.focus.id && s.level === +C.focus.level); return f ? `chosen: ${f.name} ${f.level}` : `${Object.keys(C.learned).length} learned · pick one`; }
  function badgeRep(d) { const C = clanCtx(d), nx = (C.D.levels || []).find(l => +l.level === C.clvl + 1); return `${n(C.rep)}${nx && +nx.reputation ? ' · level ' + (C.clvl + 1) + ' needs ' + n(nx.reputation) : ''}`; }

  // ------------------------------------------------------------------------------------------------ events
  const rerender = () => { try { if (typeof CLAN !== 'undefined' && CLAN && typeof patch === 'function' && typeof clanTabsHtml === 'function') patch(document.getElementById('clanBox'), clanTabsHtml(CLAN)); } catch (e) { } };
  function wire() {
    const tab = document.getElementById('tab-clan'); if (!tab || tab._cpx) return; tab._cpx = true;
    tab.addEventListener('toggle', (e) => { const k = e.target && e.target.dataset && e.target.dataset.cpxkind; if (k) CP.kindOpen[k] = e.target.open; }, true);
    // the squad form keeps what is typed across the 4 s refresh
    tab.addEventListener('input', (e) => { const t = e.target; if (t.dataset && t.dataset.ctname != null) CT.name = t.value; });
    tab.addEventListener('change', (e) => {
      const t = e.target; if (t.dataset && t.dataset.ctcap != null) { CT.cap = t.value; return; }
      if (!t.dataset || !t.dataset.cpxpriv) return;
      const d = typeof CLAN !== 'undefined' ? CLAN : null; if (!d) return;
      const sq = (d.squads && d.squads.clans && d.squads.clans[0]) || null, x = sq && (sq.ranks || []).find(k => +k.rank === CP.rank), want = ((d.privWanted || {}).ranks || {})[CP.rank];
      const cur = CP.edit[CP.rank] != null ? CP.edit[CP.rank] : (want ? +want.bits : (x && x.privBits != null ? +x.privBits : 0)), b = +t.dataset.cpxpriv;
      CP.edit[CP.rank] = t.checked ? (cur | b) : (cur & ~b); rerender();
    });
    tab.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return; const ds = b.dataset;
      if (ds.cpxtab) { e.stopPropagation(); try { localStorage.setItem('clanTab', ds.cpxtab); } catch (er) { } try { history.replaceState(null, '', '#/clan/' + ds.cpxtab); } catch (er) { } rerender(); setTimeout(() => { try { const bar = document.querySelector('.cpx-tabs'), on = bar && bar.querySelector('.on'); if (on) bar.scrollLeft = Math.max(0, on.offsetLeft - (bar.clientWidth - on.offsetWidth) / 2); if (bar) bar.scrollIntoView({ block: 'start' }); } catch (er) { } }, 30); return; }
      if (ds.cpxfil) { e.stopPropagation(); CP.filter = ds.cpxfil; rerender(); return; }
      if (ds.ctform) { e.stopPropagation(); CT.form = +ds.ctform; CT.name = ''; CT.cap = ''; rerender(); return; }
      if (ds.ctcancel) { e.stopPropagation(); CT.form = null; rerender(); return; }
      if (ds.ctmake) {
        e.stopPropagation(); const type = +ds.ctmake, U = UNIT[type], d = typeof CLAN !== 'undefined' ? CLAN : null; if (!d || !U) return;
        const name = String(CT.name || '').trim(), cap = String(CT.cap || ''), L = clanCtx(d).leader, kind = type >= 1000 ? 'knight' : 'guard';
        const m = document.getElementById('msg');
        if (!/^[A-Za-z0-9]{2,16}$/.test(name)) { if (m) m.textContent = 'Squad name: 2-16 letters / digits, no spaces'; return; }
        if (!cap) { if (m) m.textContent = 'Choose a captain'; return; }
        const cmd = `!clanunit ${kind} ${name} ${cap}`;
        if (typeof uiConfirm === 'function' && !(await uiConfirm({ title: `Create ${kind === 'guard' ? 'a Royal Guard' : 'an Order of Knights'} "${name}"?`, body: [uiP(`Captain: ${cap}.`), uiP(`Costs ${n(U.rep)} clan reputation (clan level ${U.lvl}). ${L} goes to a village master and creates it.`)], confirmText: 'Create it' }))) return;
        if (typeof send === 'function' && L) send('char:' + L, null, cmd);
        CT.form = null; if (m) m.textContent = `${L}: creating the squad "${name}" (the result shows under the tree)`; rerender(); return;
      }
      if (ds.cpxacad) {
        e.stopPropagation(); const on = ds.cpxacad === '1';
        if (on && typeof uiConfirm === 'function' && !(await uiConfirm({ title: 'Invite new characters into the Academy automatically?', body: [uiP('Every one of our characters below level 40 that is not in the clan is invited into the Academy when it stands next to the clan leader.')], confirmText: 'Switch on' }))) return;
        try { const r = await api('/api/clanauto', { method: 'POST', body: JSON.stringify({ action: 'set', key: 'academyAuto', on }) }); if (!r || r.error) throw new Error((r && r.error) || 'refused (the dashboard server needs a restart for this switch)');
          CA.at = 0; CA.flags = Object.assign({}, CA.flags || {}, { academyAuto: on }); rerender(); } catch (er) { const m = document.getElementById('msg'); if (m) m.textContent = 'Not switched: ' + er.message; }
        return;
      }
      if (ds.ctunit != null && ds.ctunit !== '') { e.stopPropagation(); const k = ds.ctunit; CT.open[k] = !CT.open[k]; rerender(); return; }
      if (ds.cpxrank) { e.stopPropagation(); CP.rank = +ds.cpxrank; rerender(); return; }
      if (ds.cpxundo) { e.stopPropagation(); delete CP.edit[+ds.cpxundo]; rerender(); return; }
      if (ds.cpxsave) {
        e.stopPropagation(); const r = +ds.cpxsave, bits = CP.edit[r]; if (bits == null) return;
        const names = PRIV_GROUPS.flatMap(([g, L]) => L.filter(([bit]) => (bits & bit) === bit).map(([, t]) => g === 'Members' || g === 'Clan' ? t : g + ': ' + t));
        if (typeof uiConfirm === 'function' && !(await uiConfirm({ title: `Rank ${r}: save these privileges?`, body: [uiP(names.length ? 'Rank ' + r + ' may:' : 'Rank ' + r + ' gets NO privileges.'), names.length && typeof uiList === 'function' ? uiList(names) : ''].filter(Boolean), confirmText: 'Save' }))) return;
        try { const res = await api('/api/clan', { method: 'POST', body: JSON.stringify({ action: 'privs', rank: r, bits }) });
          if (!res || res.error) throw new Error((res && res.error) || 'not saved (the dashboard server needs a restart for this)');
          delete CP.edit[r]; const m = document.getElementById('msg'); if (m) m.textContent = `Rank ${r}: privileges saved — the clan leader sets them in the game`;
          if (typeof loadClan === 'function') loadClan();
        } catch (er) { const m = document.getElementById('msg'); if (m) m.textContent = 'Not saved: ' + er.message; }
        return;
      }
      if (ds.cpxlearn) {
        e.stopPropagation(); const d = typeof CLAN !== 'undefined' ? CLAN : null; if (!d) return;
        const [id, lv] = ds.cpxlearn.split('|').map(Number), s = ((d.data || {}).skills || []).find(x => x.id === id && x.level === lv); if (!s) return;
        const C = clanCtx(d), L = C.leader;
        const items = (s.items || []).map(i => `${i.count}× ${i.name} (clan warehouse ${C.wh[i.id] || 0}, ${L}'s bag ${+C.bag[i.id] || 0})`);
        if (typeof uiConfirm === 'function' && !(await uiConfirm({ title: `Learn ${s.name} ${s.level}?`, body: [uiP(s.effect || ''), uiP(`Costs ${n(s.reputation)} reputation (the clan has ${n(C.rep)})${items.length ? ' and:' : '.'}`), items.length && typeof uiList === 'function' ? uiList(items) : '', uiP(`${L} goes to a village master and learns it now.`)].filter(Boolean), confirmText: 'Learn it' }))) return;
        try {
          const r = await api('/api/clan', { method: 'POST', body: JSON.stringify({ action: 'skillfocus', skill: { id, level: lv, name: s.name } }) });
          if (!r || r.error || r.ok === false) throw new Error((r && r.error) || 'refused');
          if (typeof send === 'function' && L) send('char:' + L, null, '!clanskill');
          const m = document.getElementById('msg'); if (m) m.textContent = `${s.name} ${s.level} chosen — ${L} goes to learn it`;
          if (typeof loadClan === 'function') loadClan();
        } catch (er) { const m = document.getElementById('msg'); if (m) m.textContent = 'Not sent: ' + er.message; }
      }
    }, true);
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
  window.ClanPlus = { skills, rep, perms, tree, levels, academy, tabs, curTab, badgeSkills, badgeRep, badgePerms, badgeLevels, _state: CP, _tree: CT, _ca: CA };
})();
