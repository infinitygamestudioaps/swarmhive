// COMMAND CENTER (user 2026-10-08 18:45: "The top search bar seems odd and old. Optimize all commands so I can control everything from
// the dashboard; make sure I can give any command we have in the system to the characters or a party.")
// - replaces the old "Tell them" bar with one search field that finds characters, parties, commands and pages (fuzzy) + recent orders
// - a command opens a form: TARGET (character / party / several / all / clan) + arguments with real controls + a preview of exactly what
//   is sent; every order is confirmed like confirmOrder (who, how many characters, who is busy); destructive ones need a typed YES
// - per-party and per-character "Commands" sheets (buttons [data-cmdsheet] on the party card and the character page), by category
// Catalog: Dashboard/commands.js (window.SWARM_COMMANDS). Server: POST /api/command { cmd, targets[], confirmDanger, dryRun } (server.js).
// Uses index.html globals: $, esc, api, STATE, GD, GI, UI, go, send, setClientMode, classIcon, pref, setPref.
(function () {
  'use strict';
  const K = window.SWARM_COMMANDS;
  if (!K) return;                                                       // catalog not served (old server.js): keep the old bar
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/cmdcenter.css'; document.head.appendChild(css);

  const CATN = Object.fromEntries(K.CATS.map(c => [c[0], c]));
  const byId = Object.fromEntries(K.COMMANDS.map(c => [c.id, c]));
  const QUICK = ['level', 'supply', 'stop', 'town', 'status', 'raid', 'kamaloka', 'soe', 'buff', 'classchange'];
  // SIMPLE VIEW (UX audit B5, 2026-10-13): players see only these player actions, in plain words, without !command syntax; the full catalog
  // (108 commands incl. Legacy / Debug / L2Swarm chat-box commands) is the Advanced view (header switch, Dashboard/ui_kit.js). The catalog
  // itself (Dashboard/commands.js, also the server's whitelist) is NOT changed: these are labels + search words on top of it.
  const SIMPLE = {
    start: ['Start', 'Switch them on: they carry on with their plan.', 'go begin play resume on'],
    stop: ['Stop', 'Everyone stops and stays stopped until you start them again.', 'halt pause off'],
    level: ['Go leveling', 'Gather in Giran, then teleport to a hunting place that fits the lowest level.', 'hunt exp xp farm grind'],
    autostop: ['Stop leveling', 'Stop hunting; they stay where they are.', 'pause hunt'],
    hunthere: ['Stay here and hunt', 'Hunt around the leader where he stands now, without town trips.', 'camp here'],
    supply: ['Supply run', 'The leader buys escape scrolls, shots and potions in Giran and hands them out.', 'restock buy potions shots scrolls soe'],
    sell: ['Sell junk', 'Sell marked items and junk at the next shop.', 'money adena vendor'],
    gearup: ['Buy better gear', 'Go to Giran; everyone buys and puts on the upgrades it can afford.', 'equipment armor weapon upgrade'],
    stash: ['Store items in the warehouse', 'Put what they do not use into the warehouse.', 'warehouse deposit bank storage'],
    collect: ['Collect adena to the leader', 'Members keep a little money, the rest goes to the party leader.', 'money adena gold'],
    buff: ['Rebuff', 'Get the free buffs from the Community Board again.', 'buffs'],
    classchange: ['Class change', 'Change class now (only characters with an approved class plan).', 'profession job'],
    park: ['Back to town', 'Everyone stops, goes to Giran and waits there for your next order.', 'stuck frozen not moving home town giran help wait'],
    safespot: ['Park at the safe spot', 'The party walks out of every monster\'s reach and stands still until your next order (before closing the client).', 'safe spot stand still close client update aggro'],
    town: ['Free teleport to a town', 'The whole party teleports to a town with the server\'s free town command.', 'stuck teleport travel port gludio dion aden'],
    soe: ['Get out of here', 'Run out of the fight and go to town (use it when a fight goes badly).', 'escape flee retreat danger dying stuck'],
    goto: ['Walk to…', 'Walk to a place or an NPC.', 'go move travel'],
    assist: ['Help another character', 'The party travels to that character and fights next to it.', 'support join'],
    raid: ['Kill a raid boss…', 'Travel to a raid boss and fight it.', 'boss rb'],
    raidhunt: ['Hunt raid bosses', 'Go through the raid bosses that fit the party\'s level, one after another.', 'boss rb'],
    kamaloka: ['Run Kamaloka', 'Enter today\'s Kamaloka that fits the party.', 'instance daily dungeon'],
    missionstop: ['Stop the raid / Kamaloka', 'End the current raid or Kamaloka run.', 'cancel boss'],
    quest: ['Run a quest…', 'Start or continue a quest.', 'mission'],
    queststop: ['Stop the quest', 'Stop the quest that is running.', ''],
    dawn: ['Sign up with the Lords of Dawn', 'Seven Signs: sign up with Dawn (needed for catacombs and necropolises).', 'seven signs catacomb necropolis'],
    status: ['Status report', 'Everyone says in party chat what it is doing.', 'what doing report'],
    a_login: ['Log in', 'Open the account and log the character in.', 'offline connect start'],
    a_logout: ['Log out', 'Close the account.', 'disconnect quit'],
    b_unstuck: ['Teleport to the nearest town (last resort)', 'The game\'s /unstuck: it takes several minutes and the character must stand still. Try "Back to town" first.', 'stuck frozen trapped wall'],
  };
  const isSimple = () => !!(window.UIKit && !UIKit.isAdv());
  /** the catalog entry as the current view shows it (Simple: plain title + description + search words) */
  function view(c) {
    if (!c || !isSimple() || !SIMPLE[c.id]) return c;
    const s = SIMPLE[c.id];
    return Object.assign({}, c, { title: s[0], desc: s[1], kw: [c.kw || '', s[2] || ''].join(' ').trim(), plain: true });
  }
  const visible = (c) => !isSimple() || !!SIMPLE[c.id];
  const SIMPLE_GROUPS = [
    ['s_day', 'Everyday', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Action', ['start', 'stop', 'level', 'autostop', 'hunthere', 'supply', 'sell', 'buff', 'status']],
    ['s_move', 'Move', 'icon/etc_scroll_of_return_i00', ['park', 'safespot', 'town', 'goto', 'soe', 'assist']],
    ['s_gear', 'Gear and money', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Inventory', ['gearup', 'classchange', 'stash', 'collect']],
    ['s_adv', 'Adventures', 'icon/accessory_raid_master_i00', ['raid', 'raidhunt', 'kamaloka', 'missionstop', 'quest', 'queststop', 'dawn']],
    ['s_fix', 'Account and problems', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Character', ['a_login', 'a_logout', 'b_unstuck']],
  ];
  const CC = { open: false, view: 'search', q: '', sel: 0, ctx: null, cmd: null, args: {}, targets: [], showChars: false, plan: null, planKey: '',
    result: null, sending: false, serverNew: null, data: {}, items: [], pushed: false };
  const ESC = (s) => (typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const icon = (p, cls) => `<img class="gi ${cls || 'sm'}" src="/icons/${p}.png" alt="" onerror="this.style.visibility='hidden'">`;
  const chars = () => (typeof STATE !== 'undefined' && STATE && STATE.chars) ? STATE.chars : [];
  const partyOf = (c) => (typeof c.party === 'string' && c.party) || c.name;
  const parties = () => { const m = {}; chars().forEach(c => { (m[partyOf(c)] = m[partyOf(c)] || []).push(c); }); return m; };
  const live = (c) => c && c.ageSec <= 30;
  const busyOf = (list) => list.filter(c => live(c) && c.task && !/^(idle|farming \(bot\))$/.test(c.task));
  const clsIco = (c) => (typeof classIcon === 'function' ? classIcon(c, 'cc') : icon('L2UI_CT1/crop/Icon_DF_MenuWnd_Character', 'cc'));
  function clan() {
    let name = '', leader = ''; const mem = new Set();
    chars().forEach(c => { const ci = c.clanInfo; if (ci && ci.name) { name = name || ci.name; leader = leader || ci.leader || ''; (ci.members || []).forEach(m => m && m.name && mem.add(m.name)); mem.add(c.name); } });
    if (leader) mem.add(leader);
    // 2026-10-09: no hard-coded name: the clan leader from swarm.config.json (/api/state, /api/commands)
    if (!leader) leader = (typeof STATE !== 'undefined' && STATE && STATE.clanLeader) || (CC.meta && CC.meta.clanLeader) || '';
    return { name, leader, members: [...mem].filter(n => chars().some(c => c.name === n)) };
  }
  const recent = () => { try { return pref('cc.recent', []) || []; } catch (e) { return []; } };
  const addRecent = (r) => { try { const l = recent().filter(x => !(x.cmd === r.cmd && JSON.stringify(x.targets) === JSON.stringify(r.targets))); l.unshift(r); setPref('cc.recent', l.slice(0, 12)); } catch (e) { } };

  // ---------- server capability (new /api/command) ----------
  async function probe() { if (CC.serverNew !== null) return CC.serverNew; try { const d = await api('/api/commands'); CC.serverNew = !!(d && d.version >= 1); if (CC.serverNew) CC.meta = d; } catch (e) { CC.serverNew = false; } return CC.serverNew; }

  // ---------- header: the new search field replaces the old bar ----------
  function mountBar() {
    const hrow = document.querySelector('header .hrow'); if (!hrow || document.getElementById('ccTrig')) return;
    document.querySelector('header').classList.add('cc-on');
    const b = document.createElement('button'); b.type = 'button'; b.id = 'ccTrig'; b.className = 'cctrig';
    b.setAttribute('aria-label', 'Search characters, parties, commands and pages');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg><span class="ph">Search or give an order…</span><kbd>Ctrl K</kbd>';
    b.onclick = () => openCC();
    hrow.appendChild(b);
  }

  // ---------- fuzzy search ----------
  function fscore(q, s) {
    s = String(s || '').toLowerCase(); if (!q) return 1; if (!s) return 0;
    const i = s.indexOf(q);
    if (i === 0) return 100 - Math.min(20, s.length / 10);
    if (i > 0) return (/[\s(/!.-]/.test(s[i - 1]) ? 80 : 60) - Math.min(20, i / 5);
    let p = 0, gaps = 0, last = -1;                                    // subsequence: every letter in order
    for (const ch of q) { const k = s.indexOf(ch, p); if (k < 0) return 0; if (last >= 0 && k > last + 1) gaps++; last = k; p = k + 1; }
    return Math.max(1, 35 - gaps * 4);
  }
  // weak fields (descriptions, weight < .5) count only on a real substring; anything under 18 is noise ("bish" ~ "Buy item (open shop)")
  const best1 = (q, fields) => { const s = Math.max(...fields.map(([t, w]) => { const v = fscore(q, t); return (w < .5 && v < 40 ? 0 : v) * w; })); return s >= 18 ? s : 0; };
  /** several words ("tele giran"): every word must match somewhere; score = their average */
  const best = (q, fields) => { const ws = String(q).split(/\s+/).filter(Boolean); if (ws.length < 2) return best1(q, fields); const v = ws.map(w => best1(w, fields)); return v.every(x => x > 0) ? v.reduce((a, b) => a + b, 0) / v.length : best1(q, fields); };
  function pages() {
    const out = [...document.querySelectorAll('#tabs [data-tab]')].map(b => ({ tab: b.dataset.tab, label: b.textContent.trim(), img: (b.querySelector('img') || {}).src || '' }));
    out.push({ tab: 'live', label: 'Live raid view', img: '/icons/icon/accessory_raid_master_i00.png' }, { tab: 'spot', label: 'Hunting-spot map editor', img: '/icons/L2UI_CT1/crop/Icon_DF_MenuWnd_Map.png' }, { tab: 'navatlas', label: 'Navigation atlas (route to any boss / NPC / area / room)', img: '/icons/L2UI_CT1/crop/Icon_DF_MenuWnd_Map.png' });   // NAV ATLAS 2026-10-12
    return out;
  }
  function searchItems(q) {
    q = String(q || '').trim().toLowerCase();
    const out = [], P = parties();
    if (!q) {
      recent().slice(0, 6).forEach(r => out.push({ sec: 'Recent', kind: 'recent', r, title: r.title || r.cmd, sub: '→ ' + (r.tlabel || r.targets.join(', ')) + ' · ' + ago2(r.at) }));
      QUICK.forEach(id => byId[id] && visible(byId[id]) && out.push({ sec: 'Common orders', kind: 'cmd', c: view(byId[id]) }));
      Object.keys(P).forEach(L => out.push({ sec: 'Parties', kind: 'party', L, list: P[L] }));
      pages().forEach(p => out.push({ sec: 'Pages', kind: 'page', p }));
      return out;
    }
    if (/^[!/@]/.test(q)) out.push({ sec: 'Send as typed', kind: 'raw', raw: CC.q.trim(), s: 1000 });
    K.COMMANDS.forEach(c0 => { if (c0.hidden || !visible(c0)) return; const c = view(c0); const s = (c.plain ? best(q, [[c.title, 1], [c.kw, .7], [c.desc, .3]]) * (c.id === 'b_unstuck' ? .6 : 1) : best(q, [[c.title, 1], [c.tpl, .9], [c.kw, .7], [CATN[c.cat][1], .5], [c.desc, .3]]));   /* UX B5: Simple = plain words only, the /unstuck last resort last */ if (s > 0) out.push({ sec: 'Commands', kind: 'cmd', c, s: s + (c.cat === 'legacy' ? -30 : 0) }); });
    chars().forEach(c => { const s = best(q, [[c.name, 1.1], [c.cls, .6], [c.role, .5], [partyOf(c), .3]]); if (s > 0) out.push({ sec: 'Characters', kind: 'char', ch: c, s }); });
    Object.keys(P).forEach(L => { const s = best(q, [['party ' + L, 1.05], [L, 1]]); if (s > 0) out.push({ sec: 'Parties', kind: 'party', L, list: P[L], s }); });
    pages().forEach(p => { const s = best(q, [[p.label, .9], [p.tab, .8]]); if (s > 0) out.push({ sec: 'Pages', kind: 'page', p, s }); });
    if (!/^[!/@]/.test(q) && q.length > 2) out.push({ sec: 'Send as typed', kind: 'text', raw: CC.q.trim(), s: 5 });
    const rank = { 'Send as typed': 0, Characters: 1, Parties: 2, Commands: 3, Pages: 4 };
    // best hits first; within the list sections stay grouped by their best score
    const secBest = {}; out.forEach(o => { secBest[o.sec] = Math.max(secBest[o.sec] || 0, o.s || 0); });
    return out.sort((a, b) => (secBest[b.sec] - secBest[a.sec]) || (rank[a.sec] - rank[b.sec]) || ((b.s || 0) - (a.s || 0))).slice(0, 40);
  }
  const ago2 = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  const safetyChip = (c) => c.safety === 'destructive' ? '<span class="ccsafe bad" title="needs a typed YES">destructive</span>' : c.safety === 'safe' ? '<span class="ccsafe ok">safe</span>' : '';
  const kindChip = (c) => c.kind === 'bot' ? '<span class="cckind" title="L2Swarm chat-box command, sent to each character">L2Swarm</span>' : c.kind === 'action' ? '<span class="cckind">dashboard</span>' : '';
  function rowHtml(o, i) {
    const sel = i === CC.sel ? ' sel' : '';
    if (o.kind === 'cmd') { const c = o.c; return `<button type="button" class="ccrow${sel}" data-i="${i}">${icon(CATN[c.cat][2], 'cc')}<span class="t"><b>${ESC(c.title)}</b><small>${ESC(c.kind === 'action' || c.plain ? c.desc : c.tpl)}</small></span>${c.plain ? '' : kindChip(c)}${safetyChip(c)}</button>`; }
    if (o.kind === 'char') { const c = o.ch; return `<button type="button" class="ccrow${sel}" data-i="${i}">${clsIco(c)}<span class="t"><b>${ESC(c.name)}</b><small>lvl ${c.level} ${ESC(c.cls || '')} · party ${ESC(partyOf(c))}${live(c) ? '' : ' · offline'}${c.task ? ' · ' + ESC(String(c.task).slice(0, 50)) : ''}</small></span><span class="ccgo">›</span></button>`; }
    if (o.kind === 'party') { const L = o.list.map(c => c.level); return `<button type="button" class="ccrow${sel}" data-i="${i}">${icon('L2UI_CT1/crop/Icon_DF_MenuWnd_Clan', 'cc')}<span class="t"><b>Party ${ESC(o.L)}</b><small>${o.list.length} characters · lvl ${Math.min(...L)}–${Math.max(...L)} · ${o.list.filter(live).length} online</small></span><span class="ccgo">›</span></button>`; }
    if (o.kind === 'page') return `<button type="button" class="ccrow${sel}" data-i="${i}"><img class="gi cc" src="${ESC(o.p.img)}" alt=""><span class="t"><b>${ESC(o.p.label)}</b><small>open page</small></span><span class="ccgo">↗</span></button>`;
    if (o.kind === 'recent') return `<button type="button" class="ccrow${sel}" data-i="${i}">${icon('icon/action014', 'cc')}<span class="t"><b>${ESC(o.title)}</b><small>${ESC(o.sub)}</small></span><span class="ccgo">↻</span></button>`;
    if (o.kind === 'raw') return `<button type="button" class="ccrow${sel}" data-i="${i}">${icon('L2UI_CT1/crop/Icon_DF_MenuWnd_Action', 'cc')}<span class="t"><b>Send “${ESC(o.raw)}”</b><small>exactly as typed — pick who gets it next</small></span></button>`;
    if (o.kind === 'text') return `<button type="button" class="ccrow${sel}" data-i="${i}">${icon('L2UI_CT1/crop/Icon_DF_MenuWnd_Action', 'cc')}<span class="t"><b>Tell them “${ESC(o.raw)}”</b><small>free text (“restock”, “teleport gludio”, “kill raid boss Bifrons”)</small></span></button>`;
    return '';
  }
  function searchHtml() {
    CC.items = searchItems(CC.q);
    if (CC.sel >= CC.items.length) CC.sel = Math.max(0, CC.items.length - 1);
    let sec = '', h = '';
    CC.items.forEach((o, i) => { if (o.sec !== sec) { sec = o.sec; h += `<div class="ccsec">${ESC(sec)}</div>`; } h += rowHtml(o, i); });
    return h || (isSimple() ? `<div class="ccempty">Nothing found for “${ESC(CC.q)}”. Try other words (“supply”, “stuck”, “boss”), or switch to the Advanced view under the title for every command.</div>`
      : `<div class="ccempty">Nothing found for “${ESC(CC.q)}”. Commands start with ! (swarm) or / (L2Swarm).</div>`);
  }

  // ---------- command sheet (party / character) ----------
  function sheetCmds(ctx) {
    const [kind, who] = ctx.split(':');
    const cl = clan();
    return K.COMMANDS.filter(c => {
      if (c.targets.includes('none') || c.hidden) return false;                 // CMDFIX 2026-10-12: hidden catalog entries (dead / duplicate) are not offered
      if (c.handler === 'clanleader') return kind === 'char' ? who === cl.leader : (c.targets.includes('party') || (parties()[who] || []).some(m => m.name === cl.leader));   // CMDFIX2: clanquest hunt steps on any party sheet
      return kind === 'char' ? (c.targets.includes('char') || c.targets.includes('chars')) : c.targets.includes('party');
    });
  }
  function sheetHtml() {
    const [kind, who] = CC.ctx.split(':');
    const q = CC.q.trim().toLowerCase();
    let head;
    if (kind === 'party') {
      const list = parties()[who] || [];
      head = `<div class="cctarget">${icon('L2UI_CT1/crop/Icon_DF_MenuWnd_Clan', 'cc')}<div class="t"><b>Party ${ESC(who)}</b><small>${list.length} characters · ${list.filter(live).length} online · busy: ${ESC(busyOf(list).map(c => c.name).join(', ') || 'nobody')}</small>
        <div class="ccmini">${list.map(c => `<span title="${ESC(c.name + ' · ' + (c.cls || ''))}">${clsIco(c)}</span>`).join('')}</div></div>
        <button type="button" class="ccsmall" data-ccnav="#/parties">Open</button></div>`;
    } else {
      const c = chars().find(x => x.name === who) || { name: who };
      head = `<div class="cctarget">${clsIco(c)}<div class="t"><b>${ESC(who)}</b><small>lvl ${c.level ?? '?'} ${ESC(c.cls || '')} · party ${ESC(partyOf(c))}${live(c) ? '' : ' · offline'}</small><small>${ESC(String(c.task || '').slice(0, 90))}</small></div>
        <button type="button" class="ccsmall" data-ccnav="#/char/${encodeURIComponent(who)}">Open page</button></div>`;
    }
    const list = sheetCmds(CC.ctx).filter(visible).map(view).filter(c => !q || best(q, [[c.title, 1], [c.tpl, .9], [c.kw, .7], [c.desc, .3]]) > 0);
    if (isSimple()) {   // UX audit B5: plain groups, plain tiles (title + one line), no command syntax
      const sg = SIMPLE_GROUPS.map(([id, label, ic, ids]) => {
        const cs = ids.map(i => list.find(c => c.id === i)).filter(Boolean); if (!cs.length) return '';
        return `<details class="cccat" data-cat="${id}" open><summary>${icon(ic)} ${ESC(label)} <span class="muted">${cs.length}</span></summary><div class="cctiles">` +
          cs.map(c => `<button type="button" class="cctile ${c.safety}" data-cmd="${c.id}" title="${ESC(c.desc)}"><b>${ESC(c.title)}</b><small class="ccplain">${ESC(c.desc)}</small></button>`).join('') + '</div></details>';
      }).join('');
      return head + (sg || `<div class="ccempty">Nothing matches “${ESC(CC.q)}”. Switch to the Advanced view (under the title) for every command.</div>`);
    }
    const open = pref('cc.openCats', ['move', 'fight', 'party', 'supply', 'level', 'raid']);
    const groups = K.CATS.map(([id, label, ic]) => {
      const cs = list.filter(c => c.cat === id); if (!cs.length) return '';
      return `<details class="cccat" data-cat="${id}"${q || open.includes(id) ? ' open' : ''}><summary>${icon(ic)} ${ESC(label)} <span class="muted">${cs.length}</span></summary><div class="cctiles">` +
        cs.map(c => `<button type="button" class="cctile ${c.safety}" data-cmd="${c.id}" title="${ESC(c.desc)}"><b>${ESC(c.title)}</b><small>${ESC(c.kind === 'action' ? c.tpl : c.tpl.replace(/\[[^\]]*\]/g, ' …'))}</small></button>`).join('') + '</div></details>';
    }).join('');
    return head + (groups || `<div class="ccempty">No command matches “${ESC(CC.q)}”.</div>`);
  }

  // ---------- command form ----------
  const LOADERS = {
    raids: async () => ((await api('/api/raids')).raids || []).map(r => ({ v: r.name, l: `${r.name} (${r.level})`, lvl: r.level })).sort((a, b) => a.lvl - b.lvl),
    kama: async () => ((await api('/api/kamaloka')).kamaloka || []).map(k => ({ v: String((String(k.id).match(/(\d+)$/) || [])[1] || ''), l: `${k.name} · lvl ${k.levelMin}-${k.levelMax} · ${k.partyMax} max` })),
    sieges: async () => { const d = await api('/api/sieges'); return { forts: (d.forts || []).map(f => f.name), castles: (d.castles || []).map(c => c.name), plans: (d.plans || []).map(p => ({ v: p.id, l: `${p.targetName || p.id} · ${p.siegeAt ? String(p.siegeAt).slice(0, 16).replace('T', ' ') : ''}` })) }; },
    gks: async () => { const d = await api('/api/gatekeepers'); const s = new Set(); (d.gatekeepers || []).forEach(g => (g.links || []).forEach(l => { if (!/^(teleport|quest|exchange|noblesse|summon|trade|buy|sell|talk|back|move to)/i.test(l)) s.add(l); })); return [...s].sort(); },
    cata: async () => ((await api('/api/spotplaces')).places || []).filter(p => p.kind === 'catacomb').map(p => ({ v: p.name, l: p.name + (p.levelRange ? ` (${[].concat(p.levelRange).join('-')})` : '') })),
    zmaps: async () => ((await api('/api/zmaps')).zmaps || []),   // CMDFIX2 override 2026-10-12: '!zone' picker (old server: free text only)
  };
  async function load(k) {
    const d = CC.data[k]; if (d && (d.v || d.err) && Date.now() - d.at < 300000) return d.v;
    if (d && d.p) return d.p;
    const p = LOADERS[k]().then(v => { CC.data[k] = { v, at: Date.now() }; if (CC.open && CC.view === 'form') render(); return v; }).catch(e => { CC.data[k] = { v: null, err: String(e.message || e), at: Date.now() }; return null; });
    CC.data[k] = { p, at: Date.now() }; return p;
  }
  const have = (k) => (CC.data[k] && CC.data[k].v) || null;
  const opt = (v, l, cur) => `<option value="${ESC(v)}"${String(cur ?? '') === String(v) ? ' selected' : ''}>${ESC(l ?? v)}</option>`;
  function argHtml(a) {
    const v = CC.args[a.key] ?? '', id = 'ccA_' + a.key, P = parties(), opt0 = a.optional ? opt('', '— none —', v) : '';
    const lab = `<span class="cclab">${ESC(a.label)}${a.optional ? ' <i>optional</i>' : ''}</span>`;
    const sel = (opts) => `<label class="ccfield">${lab}<select id="${id}" data-arg="${a.key}">${opt0}${opts}</select></label>`;
    const txt = (extra, list) => `<label class="ccfield">${lab}<input id="${id}" data-arg="${a.key}" value="${ESC(v)}" placeholder="${ESC(a.placeholder || '')}" autocomplete="off" ${extra || ''}${list ? ` list="${id}_l"` : ''}>${list ? `<datalist id="${id}_l">${list}</datalist>` : ''}</label>`;
    switch (a.type) {
      case 'town': return sel(K.TOWNS.map(t => opt(t, t, v)).join(''));
      case 'park': return sel(K.PARK.map(t => opt(t, t, v)).join(''));
      case 'onoff': return `<div class="ccfield">${lab}<div class="ccseg" role="group">${['on', 'off'].map(x => `<button type="button" class="${v === x ? 'on' : ''}" data-seg="${a.key}" data-val="${x}">${x.toUpperCase()}</button>`).join('')}</div></div>`;
      case 'cabinet': return txt('', K.CABINET.map(x => `<option value="${ESC(x)}">`).join(''));
      case 'clanquest': return sel(K.CLANQ.map(([k, l]) => opt(k, l, v)).join(''));
      case 'char': return sel((a.optional ? '' : opt('', '— pick —', v)) + Object.keys(P).map(L => `<optgroup label="Party ${ESC(L)}">${P[L].map(c => opt(c.name, `${c.name} · ${c.level} ${c.cls || ''}`, v)).join('')}</optgroup>`).join(''));
      case 'party': return sel((a.optional ? '' : opt('', '— pick —', v)) + Object.keys(P).map(L => opt(L, `Party ${L} (${P[L].length})`, v)).join(''));
      case 'parties': { const cur = String(v || '').split(',').filter(Boolean); return `<div class="ccfield">${lab}<div class="ccchips">${Object.keys(P).filter(L => !CC.targets.includes('party:' + L)).map(L => `<button type="button" class="ccchip${cur.includes(L) ? ' on' : ''}" data-multi="${a.key}" data-val="${ESC(L)}">${ESC(L)} <small>${P[L].length}</small></button>`).join('')}</div></div>`; }
      case 'boss': { load('raids'); const l = have('raids'); return txt('', l ? l.map(r => `<option value="${ESC(r.v)}">${ESC(r.l)}</option>`).join('') : ''); }
      case 'kamaloka': { load('kama'); const l = have('kama'); return sel(l ? l.map(k => opt(k.v, k.l, v)).join('') : opt(v, v || 'loading…', v)); }
      case 'dungeon': { load('cata'); const l = have('cata'); return sel(opt('', '— pick —', v) + (l ? l.map(d => opt(d.v, d.l, v)).join('') : '')); }
      case 'gk': { load('gks'); const l = have('gks'); return txt('', l ? l.map(x => `<option value="${ESC(x)}">`).join('') : ''); }
      case 'zmap': { load('zmaps'); const l = have('zmaps') || []; return txt('', l.concat('off').map(x => `<option value="${ESC(x)}">`).join('')); }   // CMDFIX2 override
      case 'fort': case 'castle': { load('sieges'); const s = have('sieges'); const l = s ? (a.type === 'fort' ? s.forts : s.castles) : null; return sel(opt('', l ? '— pick —' : 'loading…', v) + (l || []).map(x => opt(x.replace(/ (Fortress|Castle)$/, ''), x, v)).join('')); }
      case 'siegeplan': { load('sieges'); const s = have('sieges'); return sel(opt('', s ? (s.plans.length ? '— pick —' : 'no saved plans (Fortresses / Castles tab)') : 'loading…', v) + (s ? s.plans.map(p => opt(p.v, p.l, v)).join('') : '')); }
      case 'item': { const q = String(CC.args[a.key + '_q'] ?? v).toLowerCase(); const it = (typeof GD !== 'undefined' && GD.items) || {}; const hits = q.length >= 2 ? Object.keys(it).filter(id => String((it[id] || [])[0] || '').toLowerCase().includes(q) || id === q).slice(0, 40) : [];
        return `<label class="ccfield">${lab}<input id="${id}" data-arg="${a.key}" data-item="1" value="${ESC(v)}" placeholder="item id or name (2+ letters)" list="${id}_l" autocomplete="off"><datalist id="${id}_l">${hits.map(i => `<option value="${i}">${ESC(it[i][0])}</option>`).join('')}</datalist>${/^\d+$/.test(String(v)) && it[v] ? `<small class="muted">${ESC(it[v][0])}</small>` : ''}</label>`; }
      case 'select': return sel((a.optional ? '' : opt('', '— pick —', v)) + (a.options || []).map(o => Array.isArray(o) ? opt(o[0], o[1], v) : opt(o, o, v)).join(''));   // CMDFIX 2026-10-12
      case 'number': return txt('type="number" inputmode="numeric"');
      default: return txt();
    }
  }
  /** target chips: All / Clan / parties / characters (multi-select). */
  function targetHtml(c) {
    if (c.targets.includes('none')) return '<div class="muted">Runs on this PC (no character target).</div>';
    if (c.handler === 'clanleader' && c.targets.includes('party')) {   // CMDFIX2-2026-10-12 (clanquest): hunt steps are run by a PARTY leader — the clan leader alone hunted them solo
      const cl = clan(), P = parties(), ok = (t) => t === 'char:' + cl.leader || (t.startsWith('party:') && !!P[t.slice(6)]);
      if (CC.targets.length !== 1 || !ok(CC.targets[0])) CC.targets = ['char:' + cl.leader];
      const on = (t) => CC.targets.includes(t) ? ' on' : '';
      return `<div class="ccchips"><button type="button" class="ccchip${on('char:' + cl.leader)}" data-tg="char:${ESC(cl.leader)}">${clsIco({ name: cl.leader })} ${ESC(cl.leader)} <small>clan leader</small></button>${Object.keys(P).map(L => `<button type="button" class="ccchip${on('party:' + L)}" data-tg="party:${ESC(L)}">Party ${ESC(L)} <small>${P[L].length}</small></button>`).join('')}</div><div class="muted">Talk / level-up steps: the clan leader. Hunt steps: pick the party that hunts (its leader runs the step).</div>`;
    }
    if (c.handler === 'clanleader') { const cl = clan(); CC.targets = ['char:' + cl.leader]; return `<div class="ccchips"><span class="ccchip on fixed">${clsIco({ name: cl.leader })} ${ESC(cl.leader)} <small>clan leader${cl.name ? ' · ' + ESC(cl.name) : ''}</small></span></div><div class="muted">Only the clan leader's window acts on this command.</div>`; }
    const P = parties(), T = CC.targets, on = (t) => T.includes(t) ? ' on' : '';
    const okKind = (k) => c.targets.includes(k);
    let h = '<div class="ccchips">';
    if (okKind('all')) h += `<button type="button" class="ccchip${on('all')}" data-tg="all">All parties <small>${chars().length}</small></button>`;
    if (okKind('clan')) h += `<button type="button" class="ccchip${on('clan')}" data-tg="clan">Clan ${ESC(clan().name || '')} <small>${clan().members.length}</small></button>`;
    if (okKind('party')) Object.keys(P).forEach(L => { h += `<button type="button" class="ccchip${on('party:' + L)}" data-tg="party:${ESC(L)}">Party ${ESC(L)} <small>${P[L].length}</small></button>`; });
    h += '</div>';
    if (okKind('char') || okKind('chars')) {
      const nSel = T.filter(t => t.startsWith('char:')).length;
      h += `<button type="button" class="cclink" data-togglechars="1">${CC.showChars ? '▾' : '▸'} Characters${nSel ? ` (${nSel} picked)` : ''}${okKind('chars') || okKind('party') ? ' — pick one or several' : ' — pick one'}</button>`;
      if (CC.showChars || (nSel && !T.some(t => !t.startsWith('char:')))) h += Object.keys(P).map(L => `<div class="ccgrp"><span class="muted">Party ${ESC(L)}</span><div class="ccchips">${P[L].map(m => `<button type="button" class="ccchip ch${on('char:' + m.name)}${live(m) ? '' : ' off'}" data-tg="char:${ESC(m.name)}">${clsIco(m)}${ESC(m.name)} <small>${m.level}</small></button>`).join('')}</div></div>`).join('');
    }
    return h;
  }
  const cmdText = () => CC.cmd ? (CC.cmd.raw ? CC.cmd.raw : K.build(CC.cmd.tpl, CC.args)) : '';
  const missing = () => CC.cmd && !CC.cmd.raw ? (CC.cmd.args || []).filter(a => !a.optional && !String(CC.args[a.key] ?? '').trim()).map(a => a.label) : [];
  /** What goes where — same rules as server.js commandPlan (the server's dry run replaces it when it answers). */
  function planLocal() {
    const c = CC.cmd, text = cmdText(), kind = c.kind === 'raw' ? (text[0] === '/' ? 'bot' : text[0] === '@' ? 'action' : 'swarm') : c.kind;
    const P = parties(), all = chars(), out = [];
    const T = CC.targets.slice(); const pset = new Set(), nset = new Set();
    T.forEach(t => { if (t === 'all') Object.keys(P).forEach(L => pset.add(L)); else if (t === 'clan') clan().members.forEach(n => nset.add(n)); else if (t.startsWith('party:')) pset.add(t.slice(6)); else if (t.startsWith('char:')) nset.add(t.slice(5)); });
    if (kind === 'swarm') {
      const seen = new Set(); const add = (from, note) => { if (seen.has(from)) return; seen.add(from); const ch = all.find(x => x.name === from) || { name: from }; const solo = (P[partyOf(ch)] || []).length <= 1; out.push({ to: from, via: solo ? 'say' : 'party', text: solo ? text : '#' + text, online: live(ch), note }); };
      pset.forEach(L => add(L, `party ${L}: ${(P[L] || []).length} characters hear it`));
      nset.forEach(n => { const ch = all.find(x => x.name === n); const lead = ch && partyOf(ch) === n && (P[n] || []).length > 1; add(n, lead ? `${n} leads party ${n}: the whole party hears it` : `only ${n}'s own window obeys`); });
    } else {
      const names = new Set(nset); pset.forEach(L => (P[L] || []).forEach(m => names.add(m.name)));
      names.forEach(n => out.push({ to: n, via: kind === 'bot' ? 'command' : text.slice(1), text, online: live(all.find(x => x.name === n)) }));
    }
    return { command: text, kind, sends: out, local: true };
  }
  function affected(plan) {      // the characters who act / hear it
    const P = parties(), names = new Set();
    plan.sends.forEach(s => { if (plan.kind === 'swarm' && s.via === 'party') { const ch = chars().find(x => x.name === s.to); const L = ch ? partyOf(ch) : s.to; if (L === s.to) (P[L] || []).forEach(m => names.add(m.name)); else names.add(s.to); } else names.add(s.to); });
    return chars().filter(c => names.has(c.name));
  }
  async function refreshPlan() {
    if (!CC.cmd || CC.cmd.kind === 'action' && CC.cmd.action) return;
    const key = cmdText() + '|' + CC.targets.join(',');
    if (key === CC.planKey) return; CC.planKey = key; CC.plan = null;
    if (!CC.serverNew || missing().length || !CC.targets.length) return;
    const k0 = key;
    try {
      const r = await fetch('/api/command', { method: 'POST', headers: { 'x-key': (typeof KEY !== 'undefined' ? KEY : ''), 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign(CC.cmd.freeText ? { text: CC.cmd.raw } : { cmd: cmdText() }, { targets: CC.targets, dryRun: true })) });   // 2026-10-09: free text goes as text (the server translates it), as on the real send; as cmd it failed with "a command starts with !"
      const d = await r.json(); if (CC.planKey !== k0) return;
      CC.plan = d.error ? { error: d.error, needConfirm: d.needConfirm, ...(d.plan || {}) } : d; if (CC.open && CC.view === 'form') renderBody();
    } catch (e) { }
  }
  function previewHtml() {
    const c = CC.cmd;
    if (c.kind === 'action' && c.action) return `<div class="ccprev"><b>${ESC(c.tpl)}</b>${c.action === 'clientmode' ? ' → ' + ESC((CC.targets[0] || '').slice(5) || '—') : ''}</div>`;
    const miss = missing(); if (miss.length) return `<div class="ccprev warn">Fill in: ${ESC(miss.join(', '))}</div>`;
    if (!CC.targets.length) return '<div class="ccprev warn">Pick who gets it.</div>';
    const p = (CC.plan && !CC.plan.error) ? CC.plan : planLocal();
    const err = CC.plan && CC.plan.error && !CC.plan.needConfirm ? `<div class="ccprev bad">Server: ${ESC(CC.plan.error)}</div>` : '';
    const login = c.tpl === '@login';   // CMDFIX2 botparty: for Log in, offline is the point - warn about the ONLINE ones instead
    const who = affected(p), off = login ? [] : who.filter(x => !live(x)), busy = busyOf(who);
    const hand = c.handler === 'leader' ? 'Only the party leader acts; the others follow him.' : c.handler === 'self' ? 'Each character that hears it acts for itself.' : c.handler === 'each' ? 'Every character that hears it acts.' : '';
    if (isSimple()) {   // UX audit B5: who gets it, in words; the exact chat lines are the Advanced view
      return err + `<div class="ccprev"><div><b>${who.length}</b> character${who.length === 1 ? '' : 's'} get${who.length === 1 ? 's' : ''} it${off.length ? ` · <span class="bad">${off.length} offline (they get it when they come online)</span>` : ''}${busy.length ? ` · busy now: ${ESC(busy.map(x => x.name).join(', '))} (this replaces what they do)` : ''}</div>${hand ? `<div class="muted">${ESC(hand)}</div>` : ''}</div>`;
    }
    return err + `<div class="ccprev"><div class="ccsend">${p.sends.map(s => `<div><code>${ESC(s.text)}</code> <span class="muted">${s.via === 'party' ? 'party chat from' : s.via === 'say' ? 'normal chat from (no party)' : s.via === 'command' ? 'L2Swarm command on' : ESC(s.via) + ' on'}</span> <b>${ESC(s.to)}</b>${login ? (s.online ? ' <span class="bad">online already</span>' : '') : s.online === false ? ' <span class="bad">offline</span>' : ''}${s.note ? ` <span class="muted">· ${ESC(s.note)}</span>` : ''}</div>`).join('')}</div>
      <div class="muted">${p.sends.length} send${p.sends.length === 1 ? '' : 's'} · <b>${who.length}</b> character${who.length === 1 ? '' : 's'} affected${off.length ? ` · <span class="bad">${off.length} offline</span>` : ''}${busy.length ? ` · busy: ${ESC(busy.map(x => x.name).join(', '))}` : ''}${p.local ? '' : ' · checked by the server'}${hand ? '<br>' + ESC(hand) : ''}</div></div>`;
  }
  function formHtml() {
    const c = CC.cmd;
    const cat = CATN[c.cat] || ['', '', 'L2UI_CT1/crop/Icon_DF_MenuWnd_Action'];
    return `<div class="cchead2">${icon(cat[2], 'cc')}<div class="t"><b>${ESC(c.title)}</b><small>${c.plain ? '' : ESC(cat[1] || '')}${c.kind === 'bot' && !c.plain ? ' · L2Swarm chat-box command' : ''}</small></div>${safetyChip(c)}</div>
      ${c.desc ? `<div class="ccdesc">${ESC(c.desc)}</div>` : ''}
      ${c.raw ? '' : (c.args || []).length ? `<div class="ccsect">Details</div><div class="ccargs">${c.args.map(argHtml).join('')}</div>` : ''}
      <div class="ccsect">Who</div>${targetHtml(c)}
      <div class="ccsect">${isSimple() ? 'What happens' : 'What will be sent'}</div>${previewHtml()}
      ${CC.result ? resultHtml() : ''}`;
  }
  function resultHtml() {
    const r = CC.result; if (r.error) return `<div class="ccres bad">✗ ${ESC(r.error)}</div>`;
    const bad = (r.sends || []).filter(s => !s.ok);
    return `<div class="ccres ${bad.length ? 'warn' : 'ok'}">${bad.length ? '⚠' : '✓'} ${ESC(r.command || '')} → ${ESC(r.target || '')}: ${r.sent ?? (r.sends || []).length}/${(r.sends || []).length || 1} sent${r.channelNote ? `<div>${ESC(r.channelNote)}</div>` : ''}${bad.map(s => `<div>${ESC(s.to)}: ${ESC(s.error || s.out || 'failed')}</div>`).join('')}${window.OrdersView ? OrdersView.resultLines(r) : ''}${r.target === 'PC' ? (r.sends || []).filter(s => s.ok && s.out).map(s => `<div>${ESC(s.out)}</div>`).join('') : ''}</div>`;   // CMDFIX2 botparty: deploy says SKIP / DEPLOYED
  }
  function footHtml() {
    // UX audit B5: keyboard hints only for a mouse + keyboard in the Advanced view; players get one plain line
    const kbd = !isSimple() && !(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    if (CC.view !== 'form') return CC.view === 'search' ? (kbd ? '<span class="muted">↑↓ choose · Enter open · Esc close · ! swarm · / L2Swarm</span>' : '<span class="muted">Type what you want: “supply”, “stuck”, “stop”, a name… — nothing is sent before you confirm.</span>') : '<span class="muted">Tap a command to set it up — nothing is sent before you confirm.</span>';
    const c = CC.cmd, can = !CC.sending && (c.targets.includes('none') || CC.targets.length) && !missing().length;
    return `<button type="button" data-ccback="1">Back</button><button type="button" class="ccsendbtn ${c.safety}" data-ccsend="1"${can ? '' : ' disabled'}>${CC.sending ? 'Sending…' : c.safety === 'destructive' ? 'Send… (confirm twice)' : 'Send'}</button>`;
  }

  // ---------- overlay ----------
  function ensureOv() {
    if (document.getElementById('ccOv')) return;
    const ov = document.createElement('div'); ov.id = 'ccOv'; ov.className = 'ccov'; ov.hidden = true;
    ov.innerHTML = `<div class="ccsheet" role="dialog" aria-modal="true" aria-label="Command center">
      <div class="cchead"><button type="button" class="ccicon" data-ccback="1" aria-label="Back">‹</button>
        <input id="ccQ" type="search" enterkeyhint="go" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Search or give an order…">
        <button type="button" class="ccicon" data-ccclose="1" aria-label="Close">✕</button></div>
      <div id="ccBody" class="ccbody"></div><div id="ccFoot" class="ccfoot"></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', onClick);
    ov.addEventListener('input', onInput);
    ov.addEventListener('change', onInput);
    ov.querySelector('#ccQ').addEventListener('keydown', onKey);
    ov.addEventListener('toggle', (e) => { const d = e.target; if (d.classList && d.classList.contains('cccat')) { const s = new Set(pref('cc.openCats', [])); if (d.open) s.add(d.dataset.cat); else s.delete(d.dataset.cat); setPref('cc.openCats', [...s]); } }, true);
  }
  // (refreshPlan first: it drops a dry run that was made for older args / targets)
  function renderBody() { const b = document.getElementById('ccBody'); if (!b) return; if (CC.view === 'form') refreshPlan(); const st = b.scrollTop; b.innerHTML = CC.view === 'search' ? searchHtml() : CC.view === 'sheet' ? sheetHtml() : formHtml(); b.scrollTop = st; document.getElementById('ccFoot').innerHTML = footHtml(); }
  function render() {
    ensureOv(); renderBody();
    const q = document.getElementById('ccQ');
    q.hidden = CC.view === 'form';
    q.placeholder = CC.view === 'sheet' ? 'Filter commands…' : 'Search or give an order…';
    if (q.value !== CC.q) q.value = CC.q;
    document.querySelector('#ccOv .cchead').classList.toggle('form', CC.view === 'form');
    document.querySelector('#ccOv [data-ccback]').style.visibility = CC.view === 'search' && !CC.from ? 'hidden' : 'visible';
    if (CC.view === 'form') refreshPlan();
  }
  function show() {
    ensureOv(); const ov = document.getElementById('ccOv');
    if (!CC.open) { CC.open = true; ov.hidden = false; document.documentElement.classList.add('cc-lock'); try { history.pushState({ cc: 1 }, ''); CC.pushed = true; } catch (e) { } }
    render();
  }
  function closeCC(fromPop) {
    if (!CC.open) return; CC.open = false; document.getElementById('ccOv').hidden = true; document.documentElement.classList.remove('cc-lock');
    CC.result = null; CC.sending = false;
    if (CC.pushed && !fromPop) { CC.pushed = false; try { history.back(); } catch (e) { } } else CC.pushed = false;
  }
  window.addEventListener('popstate', () => { if (CC.open) closeCC(true); });
  function openCC(q) { probe(); CC.view = 'search'; CC.q = q || ''; CC.sel = 0; CC.from = null; CC.result = null; show(); setTimeout(() => { const i = document.getElementById('ccQ'); if (i) i.focus(); }, 30); }
  function openSheet(ctx) { probe(); CC.view = 'sheet'; CC.ctx = ctx; CC.q = ''; CC.from = CC.open && CC.view !== 'sheet' ? 'search' : (CC.open ? CC.from : null); CC.result = null; show(); const b = document.getElementById('ccBody'); if (b) b.scrollTop = 0; }
  function defaultTargets(c, ctx) {
    if (c.targets.includes('none')) return [];
    const P = parties(), main = (CC.meta && CC.meta.mainLeader) || (typeof STATE !== 'undefined' && STATE && STATE.mainLeader) || Object.keys(P)[0] || '';
    const lt = pref('cc.lastTarget', 'party:' + (P[main] ? main : (Object.keys(P)[0] || main)));
    const fits = (t) => { const k = t.split(':')[0]; return t === 'all' ? c.targets.includes('all') : t === 'clan' ? c.targets.includes('clan') : k === 'party' ? c.targets.includes('party') : (c.targets.includes('char') || c.targets.includes('chars')); };
    if (ctx && fits(ctx)) return [ctx];
    if (ctx && ctx.startsWith('party:') && !c.targets.includes('party')) return ['char:' + ctx.slice(6)];   // party sheet, character-only command -> its leader
    return fits(lt) ? [lt] : [];
  }
  function openCommand(id, ctx, args) {
    probe();
    const c = view(typeof id === 'object' ? id : byId[id]); if (!c) return;
    CC.from = CC.open ? CC.view : null; CC.fromCtx = CC.ctx;
    CC.cmd = c; CC.args = {}; (c.args || []).forEach(a => { if (a.def != null) CC.args[a.key] = a.def; });
    Object.assign(CC.args, args || {});
    CC.targets = defaultTargets(c, ctx); CC.showChars = CC.targets.some(t => t.startsWith('char:')); CC.plan = null; CC.planKey = ''; CC.result = null;
    if (c.action === 'clientmode' && ctx && ctx.startsWith('party:')) CC.targets = [];
    if (ovNamed(c)) { if (!CC.args.name && !(ctx && ctx.startsWith('party:'))) { const t1 = CC.targets.length === 1 && CC.targets[0].startsWith('char:') ? CC.targets[0].slice(5) : ''; if (t1) CC.args.name = t1; } ovSync(); }
    CC.view = 'form'; show(); const b = document.getElementById('ccBody'); if (b) b.scrollTop = 0;
  }
  // CMDFIX2 override (2026-10-12): '!ov <name> ...' — only <name>'s window acts, so the target chip IS the Character arg (the server sends it
  // from <name> anyway); picking either one sets the other (before: two independent pickers, "sent" while nobody acted)
  function ovNamed(c) { return !!(c && !c.raw && /^!ov \{name\}/.test(c.tpl || '')); }
  function ovSync() { const n = String(CC.args.name || '').trim(); if (n) { CC.targets = ['char:' + n]; CC.showChars = true; } }
  function back() {
    if (CC.view === 'form') { CC.view = CC.from === 'sheet' ? 'sheet' : 'search'; CC.ctx = CC.fromCtx || CC.ctx; CC.result = null; render(); return; }
    if (CC.view === 'sheet' && CC.from === 'search') { CC.view = 'search'; CC.from = null; CC.q = ''; render(); return; }
    closeCC();
  }

  // ---------- events ----------
  function pick(o) {
    if (!o) return;
    if (o.kind === 'cmd') return openCommand(o.c, null);
    if (o.kind === 'char') { CC.from = 'search'; CC.view = 'sheet'; CC.ctx = 'char:' + o.ch.name; CC.q = ''; return render(); }
    if (o.kind === 'party') { CC.from = 'search'; CC.view = 'sheet'; CC.ctx = 'party:' + o.L; CC.q = ''; return render(); }
    if (o.kind === 'page') { closeCC(); setTimeout(() => go('#/' + o.p.tab), 60); return; }
    if (o.kind === 'recent') { const c = byId[o.r.id]; if (c) { openCommand(c, null, o.r.args); CC.targets = o.r.targets.slice(); CC.showChars = CC.targets.some(t => t.startsWith('char:')); return render(); } return openRaw(o.r.cmd, o.r.targets); }
    if (o.kind === 'raw') return openRaw(o.raw);
    if (o.kind === 'text') return openRaw(o.raw, null, true);
  }
  function openRaw(raw, targets, freeText) {
    const spec = !freeText && K.classify(raw);
    const c = { id: freeText ? '_text' : '_raw', raw, freeText: !!freeText, title: freeText ? `Tell them “${raw}”` : raw, cat: spec ? spec.cat : 'debug', kind: freeText ? 'swarm' : raw[0] === '/' ? 'bot' : raw[0] === '@' ? 'action' : 'swarm',
      handler: spec ? spec.handler : '', targets: spec ? spec.targets : ['party', 'char', 'all', 'clan', 'chars'], safety: spec ? spec.safety : 'confirm',
      desc: freeText ? 'Free text: the dashboard turns it into a swarm command (e.g. "restock" -> !supply). The preview shows what it became.' : spec ? spec.desc : 'Typed by hand; the server checks it.' };
    openCommand(c, null); if (targets) { CC.targets = targets.slice(); render(); }
  }
  function onInput(e) {
    const t = e.target;
    if (t.id === 'ccQ') { CC.q = t.value; CC.sel = 0; renderBody(); return; }
    const k = t.dataset && t.dataset.arg; if (!k) return;
    CC.args[k] = t.value;
    if (k === 'name' && ovNamed(CC.cmd)) ovSync();                     // CMDFIX2 override: the Character arg moves the target chip
    if (t.dataset.item) { CC.args[k + '_q'] = t.value; const m = String(t.value).match(/^\s*(\d+)/); if (m) CC.args[k] = m[1]; }
    if (e.type === 'change' || t.tagName === 'SELECT' || t.dataset.item) { const pos = t.selectionStart; renderBody(); const n = document.getElementById(t.id); if (n && n.tagName === 'INPUT') { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { } } }
    else { CC.planKey = ''; refreshPlan(); const pv = document.querySelector('#ccBody .ccprev'); if (pv) pv.outerHTML = previewHtml(); document.getElementById('ccFoot').innerHTML = footHtml(); }
  }
  function onKey(e) {
    if (CC.view !== 'search') { if (e.key === 'Escape') { e.preventDefault(); back(); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); CC.sel = Math.min(CC.items.length - 1, CC.sel + 1); renderBody(); scrollSel(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); CC.sel = Math.max(0, CC.sel - 1); renderBody(); scrollSel(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(CC.items[CC.sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); closeCC(); }
  }
  const scrollSel = () => { const r = document.querySelector('#ccBody .ccrow.sel'); if (r) r.scrollIntoView({ block: 'nearest' }); };
  function onClick(e) {
    const t = e.target;
    if (t.id === 'ccOv') return closeCC();                              // tap outside the sheet
    const g = (s) => t.closest(s);
    if (g('[data-ccclose]')) return closeCC();
    if (g('[data-ccback]')) return back();
    const row = g('.ccrow'); if (row) return pick(CC.items[+row.dataset.i]);
    const tile = g('[data-cmd]'); if (tile) return openCommand(tile.dataset.cmd, CC.ctx);
    const nav = g('[data-ccnav]'); if (nav) { closeCC(); setTimeout(() => go(nav.dataset.ccnav), 60); return; }
    if (g('[data-togglechars]')) { CC.showChars = !CC.showChars; return renderBody(); }
    const tg = g('[data-tg]'); if (tg) { toggleTarget(tg.dataset.tg); CC.result = null; return render(); }
    const seg = g('[data-seg]'); if (seg) { CC.args[seg.dataset.seg] = seg.dataset.val; return render(); }
    const mu = g('[data-multi]'); if (mu) { const k = mu.dataset.multi, cur = String(CC.args[k] || '').split(',').filter(Boolean), v = mu.dataset.val; CC.args[k] = (cur.includes(v) ? cur.filter(x => x !== v) : cur.concat(v)).join(','); return render(); }
    if (g('[data-ccsend]')) return doSend();
  }
  function toggleTarget(t) {
    // several targets at once, except for commands made for exactly one character or one party; 'all' / 'clan' stand alone;
    // without 'chars' in the catalog only ONE character can be picked (e.g. /trade, client mode)
    const c = CC.cmd, T = CC.targets;
    if (c.handler === 'clanleader') { CC.targets = [t]; return; }       // CMDFIX2: clan leader OR one party (clanquest), never several
    if (T.includes(t)) { CC.targets = T.filter(x => x !== t); return; }
    if (t === 'all' || t === 'clan') { CC.targets = [t]; return; }
    const single = c.targets.length === 1 && /^(char|party)$/.test(c.targets[0]);
    let next = single ? [t] : T.filter(x => x !== 'all' && x !== 'clan').concat(t);
    if (!c.targets.includes('chars') && t.startsWith('char:')) next = next.filter(x => !x.startsWith('char:') || x === t);
    CC.targets = next;
    if (ovNamed(c) && t.startsWith('char:')) CC.args.name = t.slice(5);   // CMDFIX2 override: the target chip moves the Character arg
  }

  // ---------- confirm + send ----------
  function confirmText(plan, who) {
    const c = CC.cmd, T = CC.targets, P = parties();
    const parts = T.map(t => t === 'all' ? `ALL parties (${chars().length} characters)` : t === 'clan' ? `the clan (${clan().members.length} characters)` : t.startsWith('party:') ? `the WHOLE party ${t.slice(6)} (${(P[t.slice(6)] || []).length} characters)` : `${t.slice(5)} only`);
    const busy = busyOf(who).map(x => x.name), off = who.filter(x => !live(x)).map(x => x.name);
    // UIDIALOG 2026-10-10: structured body for uiConfirm (was one confirm() string)
    return [uiP('Send to ', uiEm(parts.join(' + ')), who.length > 1 && T.length > 1 ? ` — ${who.length} characters` : '', ':'),
      uiP(uiEm(c.title), '  ', uiCode(plan.command)),
      busy.length ? uiWarn('Busy right now and will change orders: ', busy.join(', ')) : '',
      c.tpl === '@login' ? (who.filter(x => live(x)).length ? uiWarn('Online right now (an open account is not opened twice): ', who.filter(x => live(x)).map(x => x.name).join(', ')) : '')   // CMDFIX2 botparty
        : off.length ? uiNote('Offline (will not get it): ', off.join(', ')) : ''];
  }
  // one dialog at a time from the Send button (the dialog is async now)
  async function ask(o) { if (CC.asking) return null; CC.asking = true; try { return await o(); } finally { CC.asking = false; } }
  async function doSend() {
    const c = CC.cmd; if (CC.sending || CC.asking) return;
    // dashboard actions on their own endpoints
    if (c.action === 'system') {
      if (!await ask(() => uiConfirm({ title: `${c.title}?`, body: c.desc, confirmText: c.title }))) return;
      if (c.safety === 'destructive' && !await ask(() => uiConfirm({ title: `${c.title} is destructive`, body: 'Type YES to do it now.', typeToConfirm: 'YES', danger: true, confirmText: c.title }))) return;
      return finish(api('/api/system', { method: 'POST', body: JSON.stringify({ action: c.sys }) }).then(d => d.error ? { error: d.error } : { command: c.title, target: 'PC', sent: 1, sends: [{ to: 'PC', ok: d.ok !== false, out: d.out || '' }] }));
    }
    if (c.action === 'clientmode') {
      const names = CC.targets.filter(t => t.startsWith('char:')).map(t => t.slice(5)); if (names.length !== 1) { CC.result = { error: 'pick exactly one character' }; return render(); }
      if (!await ask(() => uiConfirm(c.mode === 'ingame'
        ? { title: `Switch ${names[0]} to IN-GAME?`, body: [`L2Swarm logs ${names[0]} out, starts l2.exe and logs in through the client (within ~2 min).`, uiNote('The client uses 1-2 GB RAM.')], confirmText: 'Switch to in-game' }
        : { title: `Switch ${names[0]} back to OUT OF GAME?`, body: 'Its l2.exe is closed and it logs in without a client.', confirmText: 'Switch to out of game' }))) return;
      return finish(api('/api/clientmode', { method: 'POST', body: JSON.stringify({ name: names[0], mode: c.mode }) }).then(d => d.error ? { error: d.error } : { command: c.title, target: names[0], sent: 1, sends: [{ to: names[0], ok: true, out: d.warning || '' }] }));
    }
    const plan = (CC.plan && !CC.plan.error) ? CC.plan : planLocal();
    if (!plan.sends.length) { CC.result = { error: 'nobody to send it to' }; return render(); }
    const who = affected(plan);
    if (!await ask(() => uiConfirm({ title: c.title, body: confirmText(plan, who), confirmText: 'Send', cancelText: 'Cancel' }))) return;
    let danger = c.safety === 'destructive' || (CC.plan && CC.plan.needConfirm);
    if (danger && !await ask(() => uiConfirm({ title: `DESTRUCTIVE: ${plan.command}`, body: [c.desc || '', `Type YES to send it to ${who.length} character${who.length === 1 ? '' : 's'}.`], typeToConfirm: 'YES', danger: true, confirmText: `Send to ${who.length}` }))) { CC.result = { error: 'not sent (no YES)' }; return render(); }
    const body = c.freeText ? { text: c.raw } : { cmd: plan.command };
    if (await probe()) return finish(api('/api/command', { method: 'POST', body: JSON.stringify({ ...body, targets: CC.targets, confirmDanger: !!danger }) }));
    // old server.js (not restarted yet): one swarm command per party / character through the old single-target API
    if (plan.kind !== 'swarm') { CC.result = { error: 'the dashboard server runs the old code: restart Dashboard/server.js to send L2Swarm / account commands' }; return render(); }
    const tl = CC.targets.flatMap(t => t === 'all' ? Object.keys(parties()).map(L => 'party:' + L) : t === 'clan' ? clan().members.map(n => 'char:' + n) : [t]);
    return finish(Promise.all(tl.map(t => api('/api/command', { method: 'POST', body: JSON.stringify({ ...body, target: t }) }).then(d => ({ to: t, ok: !!d.ok, error: d.error, out: d.out })).catch(e => ({ to: t, ok: false, error: e.message }))))
      .then(sends => ({ command: plan.command, target: tl.join(', '), sent: sends.filter(s => s.ok).length, sends })));
  }
  async function finish(p) {
    CC.sending = true; render();
    let r; try { r = await p; } catch (e) { r = { error: e.message }; }
    CC.sending = false; CC.result = r;
    const c = CC.cmd;
    if (!r.error) {
      if (c.id !== '_raw' && c.id !== '_text' && !c.action) addRecent({ id: c.id, cmd: cmdText(), title: c.title, args: Object.fromEntries(Object.entries(CC.args).filter(([k]) => !/_q$/.test(k))), targets: CC.targets.slice(), tlabel: r.target, at: Date.now() });
      else if (c.id === '_raw') addRecent({ id: '_raw', cmd: c.raw, title: c.raw, targets: CC.targets.slice(), tlabel: r.target, at: Date.now() });
      if (CC.targets.length === 1 && !c.targets.includes('none')) setPref('cc.lastTarget', CC.targets[0]);
    }
    const m = document.getElementById('msg');
    if (m) m.innerHTML = r.error ? GI(UI.warn, 'sm') + ' ' + ESC(r.error) : GI(UI.yes, 'sm') + ` ${ESC(r.command || c.title)} → ${ESC(r.target || '')} (${r.sent ?? 1}/${(r.sends || []).length || 1} sent${r.channelNote ? ' - ' + ESC(r.channelNote) : ''}). The characters confirm it in their notes.`;
    render();
    if (!r.error && !(r.sends || []).some(s => !s.ok) && !(r.orders || []).some(o => (o.recipients || []).some(x => x.waiting))) setTimeout(() => { if (CC.open && CC.result === r) closeCC(); }, 1400);   // ORDERQ: stays open while someone still waits for it
  }

  // ---------- page hooks ----------
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-cmdsheet]'); if (!b) return; e.preventDefault(); e.stopPropagation(); openSheet(b.dataset.cmdsheet); }, true);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); CC.open ? closeCC() : openCC(); return; }
    if (e.key === '/' && !CC.open && !/^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); openCC(); }
  });
  mountBar();
  document.documentElement.classList.add('cc-ready');                 // shows the "Commands" buttons (index.html hides them until now)
  probe();
  window.CmdCenter = { open: openCC, openSheet, openCommand, close: () => closeCC(), state: CC, planLocal: () => CC.cmd ? planLocal() : null,
    search: (q) => searchItems(q), sheetCommands: (ctx) => sheetCmds(ctx).map(c => c.id) };   // the last two: for tests (docs/plan/tools/test_cmdcenter_ui.js)
})();
