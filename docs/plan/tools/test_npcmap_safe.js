// TEST !npcmap = READ-ONLY, IN-PLACE NPC mapper (NPCMAPSAFE-2026-10-27, owner: "verify against the server that everything works ... extreme
// importance"). The deployed !npcmap ran ijToGiran: a leader took the whole party to Giran (restock / services / fund round / Seven Signs / clan
// warehouse), a member emitted swarm.kitbuy.trip and never swarm.kitbuy.done (the leader held the party in Giran up to 45 min), the NPC was looked
// up in the Giran list, and getting back needed !town (replaced the order:plan-wait pause).
//   A npcmapSafe on the real npc_dialogs data: Quest / page links yes; accept ("Say yes." effect start), multisell, teleport destinations,
//     buy / sell words, a typed name, a quest talk while the quest is in progress, unknown links: no
//   B npcmapReach: same town within reach yes; another town / too far = "too far" (never travels)
//   C a party MEMBER in Giran maps Clarissa 2000 away on a stubbed host: walks with the town walker (solo), never ijToGiran / orderTownTrip /
//     .town / gatekeeper / control slot, never an App event (no swarm.kitbuy.*), clicks only safe links (never Exchange / a destination /
//     "Buy"), saves Logs/npclive_Clarissa_<hash>.html + Logs/npcmap_Clarissa.json (refused[] lists what it did not click), errand ended,
//     follow back on, task / pause / order untouched
//   D a far NPC (another town) and a far field NPC: refused "too far", no walk, no click
//   E a non-member walks back to the spot it stood on (town street graph walk to the start point), no follow change
//   F step mode: "| Quest | [Letters of Love]" at Darin with the quest not started = ok; "| ... | Say yes." refused and recorded; a "Button=Value" step refused
//   G a leader whose party is leveling: refused, nothing moves
//   H source: the npcMapOrder body has no ijToGiran / kitbuy / orderTownTrip / townCommand / orderBegin / App.emit / takeControl
// Never touches the game, MCP, L2Swarm or the live Logs (writes to a scratch folder). Run: node docs/plan/tools/test_npcmap_safe.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { }
const ROOT = path.join(__dirname, '..', '..', '..');
const SRCF = process.env.SWARM_JS || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRCF, 'utf8');
let fails = 0, n = 0;
const check = (ok, what) => { n++; if (!ok) { fails++; console.log('FAIL ' + what); } else console.log('ok   ' + what); };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };
const CODE = blk('function npcElems(html) {', '// --- DYES / SYMBOLS');
const PURE = blk('// NPCMAPSAFE-PURE-BEGIN', '// NPCMAPSAFE-PURE-END');
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), 'npcmap_safe_'));
const DATA = path.join(ROOT, 'Scripts', 'data');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const D_CLAR = rd(path.join(DATA, 'npc_dialogs', '30080.json')), D_DARIN = rd(path.join(DATA, 'npc_dialogs', '30048.json'));
const ATLAS = rd(path.join(DATA, 'npc_atlas.json')); const ATL = Array.isArray(ATLAS.npcs) ? ATLAS.npcs : Object.values(ATLAS.npcs);
const atl = (id) => ATL.find(a => a.id === id);

// ------------------------------------------------------------------------------------------------ A / B (pure block)
const P0 = {}; vm.createContext(P0); vm.runInContext(PURE + '\n;this.npcmapSafe = npcmapSafe; this.npcmapReach = npcmapReach; this.npcmapHash = npcmapHash; this.NPCMAP = NPCMAP;', P0);
const S = (text, cmd, D, has) => P0.npcmapSafe({ text, cmd: cmd || '00', kind: 'link' }, D, { hasQuest: () => has });
console.log('A) npcmapSafe on the real npc_dialogs data');
check(S('Quest', '02', D_CLAR).ok, 'Clarissa "Quest" (quest-menu) is safe');
check(S('Teleport', '00', D_CLAR).ok, 'Clarissa "Teleport" opens the list page (data kind page) = safe');
check(!S('Exchange Dimension Diamonds.', '01', D_CLAR).ok, 'Clarissa "Exchange Dimension Diamonds." (multisell) is NOT safe');
check(!S('Town of Oren - 9400', '00', D_CLAR).ok, 'a teleport destination (live text with price) is NOT safe');
check(!S('Say yes.', '00', D_DARIN, false).ok && /start/.test(S('Say yes.', '00', D_DARIN, false).why), 'Darin "Say yes." (effect start) is NOT safe: ' + S('Say yes.', '00', D_DARIN, false).why);
// NPCMAPSAFE2-2026-10-27: a quest event is never clicked while mapping, also when it only opens a page (live: Gideon's "I will join your cause!" started quest 350)
check(!S('Ask whom he loves.', '00', D_DARIN, false).ok, 'Darin "Ask whom he loves." (a quest event) is NOT clicked while mapping');
check(S('[Letters of Love]', '00', D_DARIN, false).ok, 'quest list entry, quest NOT started: safe (the server only shows its offer)');
check(!S('[Letters of Love (In Progress)]', '00', D_DARIN, true).ok, 'quest list entry, quest in progress: NOT safe (a talk can advance it)');
check(!S('[Letters of Love]', '00', D_DARIN, null).ok, 'quest list entry, unknown whether I have it: NOT safe');
check(!S('Buy weapons', '00', null).ok && !S('Sell fish.', 'npc_123_multisell 009', null).ok && !S('Accept the request', '00', null).ok && !S('Deposit an item', '00', null).ok, 'no data: buy / sell / accept / deposit words are NOT safe');
check(!S('Learn fishing skill.', 'Quest Fisherman LearnFishSkill', null).ok, 'no data: a script event is NOT safe');
check(S('Ask about the town', '00', null).ok && S('View information about the local lord and tax rate.', '03', null).ok, 'no data: info / view links are safe');
check(!S('Zxcv qwer', '00', null).ok && /unsure/.test(S('Zxcv qwer', '00', null).why), 'unsure = not clicked');
check(!P0.npcmapSafe({ text: 'Create an Academy', cmd: 'x $name', kind: 'button', fill: 'Abc' }, null, {}).ok, 'a typed name (button with $var) is NOT safe');
{ // NPCMAPSAFE2-2026-10-27: the two live slips on Healer15
  const D2 = { pages: {
    p1: { links: [{ text: 'Go to the Fantasy Isle.', kind: 'quest', script: 'TeleportToFantasy', bypass: 'npc_%objectId%_Quest TeleportToFantasy' },
                  { text: 'I will join your cause!', kind: 'quest-event', quest: 350, event: '30115-04.htm', to: 'p2' }] },
    p2: { links: [] } }, quests: {} };
  const has = (q) => (Number.isInteger(q) && q > 0 ? false : false);   // the old bug: HasQuest(NaN) answered "not mine"
  check(!P0.npcmapSafe({ text: 'Go to the Fantasy Isle.', cmd: '00', kind: 'link' }, D2, { hasQuest: has }).ok, 'a quest link without a quest id (script TeleportToFantasy) is NOT safe (live: Healer15 was teleported)');
  check(!P0.npcmapSafe({ text: 'I will join your cause!', cmd: '01', kind: 'link' }, D2, { hasQuest: has }).ok, 'a quest event that opens an .htm page is NOT safe (live: quest 350 was started)');
}
check(!S("I'll do it.", '00', null).ok && !S('Abort the quest', '00', null).ok, '"I\'ll do it." / "Abort the quest" are NOT safe');
console.log('B) npcmapReach');
check(P0.npcmapReach({ x: 0, y: 0, z: 0, town: 'Giran' }, { x: 2000, y: 0, z: 0, town: 'Giran' }).ok, 'same town 2000 away: ok');
check(/too far/.test(P0.npcmapReach({ x: 0, y: 0, z: 0, town: 'Giran' }, { x: 2000, y: 0, z: 0, town: 'Oren' }).why), 'another town: too far (never travels)');
check(/too far/.test(P0.npcmapReach({ x: 0, y: 0, z: 0, town: 'Giran' }, { x: 9000, y: 0, z: 0, town: 'Giran' }).why), 'same town but 9000 away: too far');
check(/too far/.test(P0.npcmapReach({ x: 0, y: 0, z: 0, town: null }, { x: 5000, y: 0, z: 0, town: null }).why), 'outside a town 5000 away: too far');
check(P0.npcmapReach({ x: 0, y: 0, z: 0, town: null }, { x: 1000, y: 0, z: 0, town: null, live: true }).ok, 'in sight: ok');
check(/^[0-9a-f]{8}$/.test(P0.npcmapHash('<html>x</html>')) && P0.npcmapHash('a') !== P0.npcmapHash('b'), 'hash8 for the npclive file name');

// ------------------------------------------------------------------------------------------------ stubbed host
function host(o) {
  const calls = []; const trap = (nm) => (...a) => { calls.push(nm); return Promise.resolve({ ok: false }); };
  const me = { Name: o.me, X: o.at[0], Y: o.at[1], Z: o.at[2] || -3400, IsDead: false };
  const npcs = o.npcs.map(x => { const r = { Name: x.name, NpcId: x.id, X: x.x, Y: x.y, Z: x.z || -3400 }; return Object.assign({ ref: r }, r); });
  const files = {}; const clicked = []; const emitted = []; const said = [];
  const map = (p) => { const s = String(p); if (/\\Logs\\/.test(s)) return path.join(SCR, s.split('\\Logs\\')[1]); if (/\\Scripts\\data\\/.test(s)) return path.join(DATA, s.split('\\Scripts\\data\\')[1].replace(/\\/g, '/')); return path.join(SCR, 'x_' + s.replace(/[^A-Za-z0-9.]+/g, '_')); };
  const walkTo = (x, y, z) => { me.X = x; me.Y = y; me.Z = z; };
  const C = {
    console, Math, JSON, Date, String, Number, Object, Array, Set, Promise, RegExp, Error, parseInt, isFinite,
    Me: me, SWARM_ROOT: 'C:\\L2S', __DIR__: 'C:\\L2S', LastHTML: '', lastSysMsg: null, IsInCombat: false,
    CONFIG: { leader: o.leader || 'Lead' }, state: { mode: o.mode || 'idle', task: 'leveling', gkBusy: false }, orderState: { seq: 7, text: '!level', userSeq: 7 },
    autoLvl: { active: !!o.leveling }, Options: { ActiveFollow: !!o.follow, FollowName: o.follow ? (o.leader || 'Lead') : '' },
    File: { Exists: (p) => fs.existsSync(map(p)), ReadAllText: (p) => fs.readFileSync(map(p), 'utf8'), WriteAllText: (p, t) => { files[path.basename(map(p))] = String(t); fs.writeFileSync(map(p), String(t)); } },
    App: { emit: (nm, d) => emitted.push(nm), on: () => { } },
    Send: { StopMove: () => { }, RequestBuySellUIClose: () => { } },
    HasQuest: (q) => !!(o.quests || {})[q],
    note: (m, say) => said.push(String(m)), logError: (w, e) => said.push('ERR ' + w + ' ' + (e && e.message)), intent: () => { }, intentDone: () => { },
    sleep: () => Promise.resolve(), now: () => Date.now(), num: (v) => Number(v) || 0, P: (x, y) => `${Math.round(x)},${Math.round(y)}`,
    inRaid: () => false, isLeader: () => !!o.leader && o.leader === o.me, teamNames: () => o.team === false ? [] : ['A', 'B'],
    followOk: (w) => !!w, standUp: () => { }, errandStart: (k) => calls.push('errandStart:' + k), errandEnd: (k) => calls.push('errandEnd:' + k),
    snapNpcs: () => npcs, npcAtlas: () => ({ npcs: ATL }), currentTownKey: () => o.town || null, townKeyFor: (t) => String(t || '').replace(/^Town of /, ''),
    townWalkToNpc: async (a, op) => { calls.push('townWalkToNpc:' + (op && op.solo ? 'solo' : 'team')); walkTo(a.x - 60, a.y, a.z); return true; },
    walkToInner: async (x, y, z) => { calls.push('walkToInner'); walkTo(x, y, z); return true; },
    townGraphD: (k) => ({ name: k, isTown: true }), rgWalk: async (TD, t, op) => { calls.push('rgWalk:' + (op && op.team ? 'team' : 'solo')); walkTo(t.x, t.y, t.z); return { ok: true }; },
    openNpc: async (npc) => { calls.push('openNpc'); return o.pages[''] || ''; },
    DLG: { click: async (el, op) => { clicked.push(el.text); const h = o.pages[el.text]; C.LastHTML = h || C.LastHTML; return h ? { ok: true, kind: 'npc', html: h } : { ok: false }; } },
    htmlText: (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim(),
    cleanBypass: (l) => String(l || '').replace(/^\s*bypass\s+/i, '').replace(/^-h\s+/i, '').trim(),
    // everything !npcmap must NEVER call
    ijToGiran: trap('ijToGiran'), orderTownTrip: trap('orderTownTrip'), orderWaitControl: trap('orderWaitControl'), orderRelease: trap('orderRelease'),
    takeControl: trap('takeControl'), townCommand: trap('townCommand'), gkTeleport: trap('gkTeleport'), teleportNear: trap('teleportNear'), giranGo: trap('giranGo'),
    leadGoGiran: trap('leadGoGiran'), orderBegin: trap('orderBegin'), useEscape: trap('useEscape'), setTask: trap('setTask'), leadPause: trap('leadPause'),
    gscanNpcs: trap('gscanNpcs'), msHook: trap('msHook'), RunCommand: trap('RunCommand'),
  };
  vm.createContext(C); vm.runInContext(CODE + '\n;this.npcMapOrder = npcMapOrder;', C);
  return { C, calls, clicked, emitted, said, files, me };
}
const run = async (h, text) => { await h.C.npcMapOrder(text.split(/\s+/), text); };
const BAD = ['ijToGiran', 'orderTownTrip', 'orderWaitControl', 'orderRelease', 'takeControl', 'townCommand', 'gkTeleport', 'teleportNear', 'giranGo', 'leadGoGiran', 'orderBegin', 'useEscape', 'setTask', 'leadPause', 'gscanNpcs', 'RunCommand'];
const noBad = (h) => !h.calls.some(c => BAD.includes(c));
const a = (t, c) => `<a action="bypass -h ${c}">${t}</a><br>`;
const CL = atl(30080);
const CL_PAGES = {
  '': '<html><body>Gatekeeper Clarissa:<br>We gatekeepers ...<br>' + a('Teleport', '00') + a('Exchange Dimension Diamonds.', '01') + a('Quest', '02') + a('Buy a ticket', '03') + a('Ask about the town', '04') + '</body></html>',
  'Teleport': '<html><body>&$556;<br>' + a('Town of Oren - 9400 &#57;', '00') + a('Heine - 7600 &#57;', '01') + a('The Town of Dion - 6800 &#57;', '02') + '</body></html>',
  'Quest': '<html><body>I have no tasks for you right now.<br>' + a('Back', '00') + '</body></html>',
  'Ask about the town': '<html><body>Giran is the town of merchants.<br>' + a('Back', '00') + '</body></html>',
};

(async () => {
  console.log('C) a party member maps Clarissa in Giran (2000 away)');
  {
    const h = host({ me: 'Bishop1', leader: 'Tank1', follow: true, town: 'Giran', at: [CL.x - 2000, CL.y, CL.z], npcs: [{ name: 'Clarissa', id: 30080, x: CL.x, y: CL.y, z: CL.z }], pages: CL_PAGES });
    await run(h, '!npcmap Bishop1 Clarissa');
    check(noBad(h), 'never ijToGiran / town trip / .town / gatekeeper / control slot / setTask (' + h.calls.filter(c => BAD.includes(c)).join(',') + ')');
    check(h.emitted.length === 0, 'no App event at all (no swarm.kitbuy.trip / done, no team trip): ' + h.emitted.join(','));
    check(h.calls.includes('townWalkToNpc:solo') && Math.hypot(h.me.X - CL.x, h.me.Y - CL.y) <= 110, 'walked in front with the town walker, alone (' + Math.round(Math.hypot(h.me.X - CL.x, h.me.Y - CL.y)) + ' away)');
    check(h.clicked.includes('Teleport') && h.clicked.includes('Quest') && h.clicked.includes('Ask about the town'), 'clicked the safe links: ' + h.clicked.join(' | '));
    check(!h.clicked.some(t => /Exchange|Buy|Oren|Heine|Dion|Back/.test(t)), 'never clicked Exchange / Buy / a destination (/ Back)');
    const live = Object.keys(h.files).filter(f => /^npclive_Clarissa_[0-9a-f]{8}\.html$/.test(f));
    check(live.length === 4, 'every page saved raw as Logs/npclive_Clarissa_<hash8>.html (' + live.length + ')');
    const idx = JSON.parse(h.files['npcmap_Clarissa.json'] || '{}');
    check(idx.npcId === 30080 && idx.pages && idx.pages.length === 4 && idx.pages.every(p => p.file && p.elems), 'index Logs/npcmap_Clarissa.json: 4 pages with file + elems');
    check(idx.refused && ['Exchange Dimension Diamonds.', 'Buy a ticket', 'Town of Oren - 9400'].every(t => idx.refused.some(r => r.text === t)), 'refused[] lists what it did not click: ' + (idx.refused || []).map(r => r.text).join(' | '));
    check(h.calls.includes('errandStart:npcmap') && h.calls.includes('errandEnd:npcmap'), 'a member: short errand (follow held, nobody pulls it back) and the errand ends');
    check(h.C.Options.ActiveFollow === true && h.C.Options.FollowName === 'Tank1', 'follow back on (= back to its follow spot)');
    check(h.C.state.task === 'leveling' && h.C.orderState.seq === 7 && h.C.state.gkBusy === false, 'task / order untouched, gkBusy released');
  }
  console.log('D) far NPCs: too far, nothing happens');
  {
    const BE = atl(30256);
    const h = host({ me: 'Bishop1', leader: 'Tank1', follow: true, town: 'Giran', at: [CL.x - 2000, CL.y, CL.z], npcs: [], pages: CL_PAGES });
    await run(h, '!npcmap Bishop1 Bella');
    check(h.said.some(s => /too far/.test(s)) && !h.calls.some(c => /walk|openNpc|rgWalk/i.test(c)) && h.clicked.length === 0 && noBad(h) && h.emitted.length === 0, 'Bella (' + (BE && BE.place && BE.place.town) + ') from Giran: "too far", no walk, no click: ' + h.said.join(' / '));
    const h2 = host({ me: 'Solo', team: false, town: null, at: [100000, 100000, -3000], npcs: [{ name: 'Wanderer', id: 99999, x: 105000, y: 100000, z: -3000 }], pages: {} });
    await run(h2, '!npcmap Solo Wanderer');
    check(h2.said.some(s => /too far/.test(s)) && h2.clicked.length === 0 && !h2.calls.includes('walkToInner'), 'a field NPC 5000 away: too far, no walk');
    const h3 = host({ me: 'Bishop1', leader: 'Tank1', follow: true, town: 'Giran', at: [CL.x - 2000, CL.y, CL.z], npcs: [], pages: CL_PAGES });
    await run(h3, '!npcmap Bishop1 30256');
    check(h3.said.some(s => /too far/.test(s)) && h3.clicked.length === 0, 'by npc id (30256) too: too far');
  }
  console.log('E) a non-member walks back to its spot');
  {
    const start = [CL.x - 1500, CL.y + 300, CL.z];
    const h = host({ me: 'Solo', team: false, town: 'Giran', at: start, npcs: [{ name: 'Clarissa', id: 30080, x: CL.x, y: CL.y, z: CL.z }], pages: CL_PAGES });
    await run(h, '!npcmap Solo 30080 | Teleport');
    check(h.clicked.join('|') === 'Teleport', 'step mode: clicked exactly "Teleport"');
    check(h.calls.includes('rgWalk:solo') && Math.hypot(h.me.X - start[0], h.me.Y - start[1]) < 5, 'walked back to where it stood (town street graph, alone)');
    check(!h.calls.some(c => /^errand/.test(c)) && h.C.Options.ActiveFollow === false, 'no errand / follow change for a character without a party');
    check(noBad(h) && h.emitted.length === 0, 'no town trip, no event');
  }
  console.log('F) step mode at Darin: quest list entry ok, accept refused, typed name refused');
  {
    const DA = atl(30048);
    const DP = {
      '': '<html><body>Darin:<br>...<br>' + a('Quest', '00') + '</body></html>',
      'Quest': '<html><body>Darin:<br>What\'s more dangerous ...<br>' + a('Ask whom he loves.', '00') + '</body></html>',
      'Ask whom he loves.': '<html><body>Darin:<br>I am in love with Roxxy.<br>' + a("Tell him you don't know her.", '00') + a('Tell him you do know her.', '01') + '</body></html>',
      "Tell him you don't know her.": '<html><body>Darin:<br>Would you deliver my letter?<br>' + a('Say yes.', '00') + '</body></html>',
    };
    const at = [DA.x - 80, DA.y, DA.z];
    const h = host({ me: 'Solo', team: false, town: 'Gludio', at, npcs: [{ name: 'Darin', id: 30048, x: DA.x, y: DA.y, z: DA.z }], pages: DP, quests: {} });
    await run(h, "!npcmap Solo Darin | Quest | Ask whom he loves. | Tell him you don't know her. | Say yes.");
    check(!h.clicked.includes('Say yes.') && !h.clicked.includes("Tell him you don't know her.") && !h.clicked.includes('Ask whom he loves.') && h.clicked.includes('Quest'), 'opened the quest list only: no quest-event click, never "Say yes." (' + h.clicked.join(' > ') + ')');
    const idx = JSON.parse(h.files['npcmap_Darin.json'] || '{}');
    check(idx.refused && idx.refused.some(r => r.text === 'Ask whom he loves.' && /quest|script|event/i.test(r.why)), 'the first quest-event link recorded as refused with its reason');
    check(h.said.some(s => /NOT clicking "Ask whom he loves\."/.test(s)), 'and said so');
    check(!h.calls.some(c => /walk/i.test(c)), 'already in front of Darin: no walk');
    const h2 = host({ me: 'Solo', team: false, town: 'Gludio', at, npcs: [{ name: 'Darin', id: 30048, x: DA.x, y: DA.y, z: DA.z }], pages: DP, quests: { 1: true } });
    await run(h2, '!npcmap Solo Darin | Quest=Abc');
    check(h2.clicked.length === 0 && JSON.parse(h2.files['npcmap_Darin.json']).refused.some(r => /typing/.test(r.why)), 'a "Button=Value" step is refused (typing changes state)');
  }
  console.log('G) a leader whose party is leveling: refused');
  {
    const h = host({ me: 'Tank1', leader: 'Tank1', leveling: true, town: 'Giran', at: [CL.x - 2000, CL.y, CL.z], npcs: [{ name: 'Clarissa', id: 30080, x: CL.x, y: CL.y, z: CL.z }], pages: CL_PAGES });
    await run(h, '!npcmap Tank1 Clarissa');
    check(h.said.some(s => /never pauses/.test(s)) && h.clicked.length === 0 && !h.calls.some(c => /walk|openNpc/i.test(c)) && h.C.autoLvl.active === true, 'refused, nothing moved, leveling untouched');
  }
  console.log('H) source');
  {
    const body = blk('async function npcMapOrder(parts, raw) {', '// --- DYES / SYMBOLS');
    check(!/ijToGiran|kitbuy|orderTownTrip|townCommand|orderBegin|App\.emit|takeControl|orderWaitControl|gkTeleport|teleportNear|leadGoGiran/.test(body), 'npcMapOrder never names ijToGiran / kitbuy / orderTownTrip / townCommand / orderBegin / App.emit / takeControl / gkTeleport / teleportNear');
    check(/case '!npcmap'/.test(src) && !/^!\(.*\|npcmap\|/.test(src) && !/npcmap/.test((/const ORDER_CMDS = (.*)/.exec(src) || [])[1] || ''), '!npcmap is not an ORDER command (it never replaces an order / pause)');
    const cat = fs.readFileSync(path.join(ROOT, 'Dashboard', 'commands.js'), 'utf8');
    check(/id: 'npcmap'[\s\S]{0,1500}NPCMAPSAFE[\s\S]{0,1500}npc id or name nearby/i.test(cat), 'dashboard catalog entry updated (id or name, nearby, read only)');
  }
  try { fs.rmSync(SCR, { recursive: true, force: true }); } catch (e) { }
  console.log(`test_npcmap_safe: ${n - fails} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); try { fs.rmSync(SCR, { recursive: true, force: true }); } catch (er) { } process.exit(1); });
