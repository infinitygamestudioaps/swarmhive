// OFFLINE TEST of the floor teleport by WHAT the NPC offers (2026-10-09, Cruma: Ponti has no 2nd floor link, Penelope has).
//   node docs/plan/tools/test_floor_links.js     (exit code 1 when a check fails)
// Runs the FLOORLINK-PURE block of Scripts_dev/swarm.js and the host function floorTeleport() with mocks (NPCs in sight, their pages, the
// teleport, Logs/floor_links_live.json in memory), against the REAL Scripts/data/dungeon_rooms.json, the saved live page Logs/floor_Ponti_*.html
// and the datapack pages Scripts/data/dp/html_teleporter/*.htm.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < i) throw new Error('block not found: ' + a); return src.slice(i, j); };
const num = (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0);
const PURE = cut('// FLOORLINK-PURE-BEGIN', '// FLOORLINK-PURE-END');
const M = new Function('num', PURE + '\nreturn { floorOrdinal, floorLinkChoose, floorNpcCandidates, floorLiveUpdate, floorLiveKey, flNorm };')(num);
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dungeon_rooms.json'), 'utf8').replace(/^\uFEFF/, ''));
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const htmlText = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const npcLinks = (html) => { const out = [], re = /<a\b[^>]*action="bypass\s+([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi; let m; while ((m = re.exec(html))) out.push({ cmd: m[1].replace(/^-h\s+/, ''), text: htmlText(m[2]) }); return out; };
// the datapack pages are only in a full dev install (Scripts/data/dp is not shipped): skip there instead of failing (2026-10-10)
if (!fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'html_teleporter'))) { console.log('skipped: needs the L2J datapack pages in Scripts/data/dp/html_teleporter (dev install only)'); process.exit(0); }
const dpPage = (id) => fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'html_teleporter', `${id}.htm`), 'utf8');
const livePonti = (() => { const f = fs.readdirSync(path.join(ROOT, 'Logs')).find(x => /^floor_Ponti_.+\.html$/.test(x)); return f ? fs.readFileSync(path.join(ROOT, 'Logs', f), 'utf8') : dpPage(30484); })();

// ---- 1) data ----------------------------------------------------------------------------------------------------------------
const C = D.find(d => d.name === 'Cruma Tower');
check(C.floors[1].enter.npc.id === 30487 && C.floors[1].enter.npc.name === 'Penelope', `Cruma 2nd floor is entered via Penelope 30487 (was Ponti 30484): ${C.floors[1].enter.npc.name}`);
check(C.floors[1].enter.npc.link === 'Teleport to the 2nd floor.', 'Penelope link text from the datapack page');
check(C.floors[2].enter.npc.id === 30486 && C.floors[0].enter.npc.id === 30483, 'floor 3 = Hanna, floor 1 = Mozella');
const lk = (fi) => (C.floors[fi].links || []).map(l => `${l.npc.name}->${l.to}`).join(',');
check(lk(0) === 'Ponti->-1,Penelope->1' && lk(1) === 'Capella->0,Hanna->2' && lk(2) === 'Teleportation Cubic->1,Teleportation Cubic->core', `floors[].links: ${lk(0)} | ${lk(1)} | ${lk(2)}`);
check(C.floors[0].links[0].verified === true && C.floors[0].links[1].verified === true, 'Ponti "Return to the ground" and Penelope "Teleport to the 2nd floor." both seen live (Logs/floor_*_*.html, 2026-10-09 06:52)');

// ---- 2) which link -----------------------------------------------------------------------------------------------------------
check(M.floorOrdinal('2nd floor') === 2 && M.floorOrdinal('Third Floor') === 3 && M.floorOrdinal('Upper layer') === 0 && M.floorOrdinal('level 3') === 3, 'floorOrdinal');
let p = M.floorLinkChoose(npcLinks(livePonti), { floorName: '2nd floor', generic: true });
check(p === null, `Ponti's LIVE page (Return to the ground | Quest) has no 2nd floor link -> null`);
p = M.floorLinkChoose(npcLinks(livePonti), { floorName: '2nd floor', linkText: 'Teleport to the 2nd floor.' });
check(p === null, 'Ponti + Penelope\'s link text -> still null (not his link)');
p = M.floorLinkChoose(npcLinks(dpPage(30487)), { floorName: '2nd floor', linkText: 'Teleport to the 2nd floor.' });
check(p && p.how === 'exact' && /goto 23/.test(p.link.cmd), `Penelope: "${p && p.link.text}" (${p && p.how}, ${p && p.link.cmd})`);
p = M.floorLinkChoose(npcLinks(dpPage(30487)), { floorName: '2nd floor' });
check(p && p.how === 'floor', 'Penelope without a planned link text: found by the ordinal');
p = M.floorLinkChoose(npcLinks(dpPage(30485)), { floorName: '1st floor' });
check(p && /goto 24/.test(p.link.cmd), `Capella down to the 1st floor: "${p && p.link.text}" ("first" = 1st)`);
p = M.floorLinkChoose(npcLinks(dpPage(30486)), { floorName: '3rd floor' });
check(p && /goto 55/.test(p.link.cmd), 'Hanna up to the 3rd floor');
p = M.floorLinkChoose(npcLinks(dpPage(31843)), { floorName: '2nd floor' });
check(p && /goto 58/.test(p.link.cmd), 'Teleportation Cubic down to the 2nd floor, not the Core room');
p = M.floorLinkChoose(npcLinks(dpPage(30487)), { floorName: '3rd floor' });
check(p === null, 'Penelope offers no 3rd floor (a wrong ordinal is never taken by the generic rule)');
p = M.floorLinkChoose([{ cmd: '00', text: 'Teleport into the Tower.' }, { cmd: '01', text: 'Quest.' }], { floorName: '1st floor', linkText: 'Teleport into the Tower.' });
check(p && p.link.cmd === '00', 'Mozella (live page) -> "Teleport into the Tower."');

// ---- 3) candidates -----------------------------------------------------------------------------------------------------------
const land = { x: 17847, y: 113962, z: -11680 };                 // the live Mozella landing (dungeon.log 2026-10-09)
const seen = [{ name: 'Ponti', title: 'Gatekeeper', id: 30484, objId: 1, x: 17555, y: 113967, z: -11675 }, { name: 'Penelope', title: 'Gatekeeper', id: 30487, objId: 2, x: 17877, y: 113970, z: -11672 },
  { name: 'Treasure Chest', title: '', id: 18265, objId: 3, x: 17900, y: 114000, z: -11672 }, { name: 'Capella', title: 'Gatekeeper', id: 30485, objId: 4, x: 17725, y: 108220, z: -9057 }];
const oldPonti = { id: 30484, name: 'Ponti', spawnlistName: 'Janssen', x: 17555, y: 113967, z: -11675 };
let c = M.floorNpcCandidates(seen, { primary: C.floors[1].enter.npc, near: land });
check(c.map(x => x.name).join() === 'Penelope,Ponti', `new data: Penelope first, Ponti as the fallback, no chest, not Capella on another floor (${c.map(x => x.name + ' [' + x.why + ']').join('; ')})`);
c = M.floorNpcCandidates(seen, { primary: oldPonti, near: land });
check(c.map(x => x.name).join() === 'Ponti,Penelope', 'OLD data (Ponti planned): Penelope is still tried after him');
let live = M.floorLiveUpdate(null, seen[0], 'nolink', 1000); live = M.floorLiveUpdate(live, seen[0], 'nolink', 2000);
c = M.floorNpcCandidates(seen, { primary: oldPonti, near: land, live });
check(c[0].name === 'Penelope', `Ponti "no such link" twice (floor_links_live.json) -> Penelope first even with the old data (${c.map(x => x.name + ' [' + x.why + ']').join('; ')})`);
live = M.floorLiveUpdate(live, seen[1], 'ok', 3000, { text: 'Teleport to the 2nd floor.' });
check(live.best === 'Penelope' && live.npcs.Penelope.ok === 1 && live.npcs.Ponti.nolink === 2, 'live record: Penelope best, Ponti nolink 2');
c = M.floorNpcCandidates(seen, { primary: oldPonti, near: land, live });
check(c[0].name === 'Penelope' && /worked live/.test(c[0].why), 'a NPC that worked live comes first');

// ---- 4) floorTeleport with mocks -----------------------------------------------------------------------------------------------
const HOST = cut('const FLOOR_LIVE_FILE', "\nApp.on('swarm.floortp'");
async function runFT(F, world) {
  const W = Object.assign({ pos: { X: land.x, Y: land.y, Z: land.z }, files: {}, log: [], clicks: [], opened: [] }, world);
  const pages = W.pages, me = W.pos;
  const env = {
    num, Me: me, __DIR__: 'C:\\X', File: { ReadAllText: (f) => { if (!(f in W.files)) throw new Error('nf'); return W.files[f]; }, WriteAllText: (f, t) => { W.files[f] = t; } },
    walkDirect: async (x, y) => { me.X = x; me.Y = y; return true; }, snapNpcs: () => W.seen.map(n => ({ Name: n.name, Title: n.title, Id: n.id, objId: n.objId, X: n.x, Y: n.y, Z: n.z, IsDead: false })), npcById: (id) => W.seen.find(n => n.objId === id),
    openNpc: async (n) => { W.opened.push(n.name); W.last = n; return pages[n.name] || null; }, npcLinks, setTask: () => { }, dungeonLog: (m) => W.log.push(m),
    waitTeleport: () => new Promise(r => { W.tpResolve = r; }), Send: { ReqBypassToServer: (cmd) => { W.clicks.push(`${W.last.name}:${cmd}`); const t = (W.tp || {})[`${W.last.name}:${cmd}`]; if (t) { me.X = t[0]; me.Y = t[1]; me.Z = t[2]; } W.tpResolve(!!t); } },
    appearBurst: () => { }, sleep: async () => { }, App: { emit: () => { } }, now: () => 5000, lastSysMsg: null,
    onFloor: (F) => F && F.z && me.Z >= F.z[0] - 300 && me.Z <= F.z[1] + 300,
  };
  const names = Object.keys(env);
  const fn = new Function(...names, PURE + HOST + '\nreturn { floorTeleport, get last() { return lastFloorNpc; } };');
  const api = fn(...names.map(k => env[k]));
  const ok = await api.floorTeleport(F);
  return { ok, W, used: api.last };
}
(async () => {
  const pages = { Ponti: livePonti, Penelope: dpPage(30487).replace(/npc_%objectId%_goto 23/, '00') };
  const tp = { 'Penelope:00': [17776, 108288, -9056] };
  const F2old = Object.assign({ dungeon: 'Cruma Tower' }, C.floors[1], { enter: Object.assign({}, C.floors[1].enter, { npc: oldPonti }) });
  let r = await runFT(F2old, { seen: seen.map(s => Object.assign({}, s)), pages, tp });
  check(r.ok && r.W.opened.join() === 'Ponti,Penelope' && r.W.clicks.join() === 'Penelope:00', `OLD data (Ponti): Ponti's page has no link -> Penelope -> on the 2nd floor (${r.W.opened.join(' -> ')}; clicks ${r.W.clicks.join()})`);
  const lf = JSON.parse(r.W.files['C:\\X\\Logs\\floor_links_live.json'] || '{}')['Cruma Tower|2nd floor'] || {};
  check(lf.best === 'Penelope' && lf.npcs.Ponti.nolink === 1 && lf.npcs.Penelope.ok === 1, 'Logs/floor_links_live.json: Ponti nolink, Penelope ok (best)');
  check(r.used && r.used.name === 'Penelope' && r.used.link === 'Teleport to the 2nd floor.', 'lastFloorNpc = Penelope (sent to the members with swarm.floortp)');
  check(!!r.W.files['C:\\X\\Logs\\floor_Ponti_undefined.html'] || Object.keys(r.W.files).some(f => /floor_Ponti_/.test(f)), 'every opened page is saved (floor_<npc>_<me>.html)');
  // second run, file from the first: Penelope first, Ponti never opened
  r = await runFT(F2old, { seen: seen.map(s => Object.assign({}, s)), pages, tp, files: r.W.files });
  check(r.ok && r.W.opened.join() === 'Penelope', `second time: the live file puts Penelope first (${r.W.opened.join()})`);
  // new data: Penelope directly
  r = await runFT(Object.assign({ dungeon: 'Cruma Tower' }, C.floors[1]), { seen: seen.map(s => Object.assign({}, s)), pages, tp });
  check(r.ok && r.W.opened.join() === 'Penelope', 'new data: Penelope at once');
  // nobody offers it: false, both tried, reason logged
  r = await runFT(Object.assign({ dungeon: 'Cruma Tower' }, C.floors[1]), { seen: seen.map(s => Object.assign({}, s)), pages: { Ponti: livePonti, Penelope: livePonti.replace('Ponti', 'Penelope') }, tp });
  check(!r.ok && r.W.opened.join() === 'Penelope,Ponti' && r.W.log.filter(l => /no link to 2nd floor/.test(l)).length === 2, `no NPC offers the floor -> false after trying both (${r.W.log.join(' / ').slice(0, 160)})`);
  // clicked but no teleport (level refusal): next candidate
  r = await runFT(F2old, { seen: seen.map(s => Object.assign({}, s)), pages: { Ponti: dpPage(30487).replace(/npc_%objectId%_goto 23/, '07'), Penelope: pages.Penelope }, tp });
  check(r.ok && r.W.clicks.join() === 'Ponti:07,Penelope:00', `a link that does not teleport -> the next NPC (${r.W.clicks.join()})`);
  // nothing in sight
  r = await runFT(Object.assign({ dungeon: 'Cruma Tower' }, C.floors[1]), { seen: [], pages, tp });
  check(!r.ok && /not in sight/.test(r.W.log.join()), 'no NPC in sight -> false + log');
  console.log(fails ? `${fails} check(s) FAILED` : 'all checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
