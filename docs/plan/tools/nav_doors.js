// NAV DOORS (user 2026-10-12: "some places have doors and gatekeepers you have to go past; some need a dagger to open a door, others a quest
// item like Pagan Temple, some open/close on a timer — all of this should be part of the state machine").
// Builds Scripts/data/nav_doors.json:
//   doors[]      every door of the L2J High Five datapack (data/doors.xml): position + collision polygon + height range, default open/closed,
//                how it opens (open_method bits of the server core L2DoorInstance: 1 click, 2 time, 4 item, 8 skill, 16 cycle), the timer
//                (open_time / close_time / random_time, semantics from L2DoorInstance.TimerOpen), the auto-close after an open (close_time),
//                Unlock (skill 27: chance per level, which classes learn it), key items (every skill with the OpenDoor effect + isItem, its
//                target door id and consumed item), the scripts that open/close it (datapack Java: openDoor/closeDoor/getDoor().openMe),
//                clan hall / castle / fortress ownership, instance templates, where it is (dungeon / region / town)
//   bossZones[]  the BossZone polygons (data/zones/*.xml): walking in without the boss script's permission = thrown out
//   conditions[] ENTRY CONDITIONS per area (quest items, noble-only, Seven Signs, level / party / command-channel limits, time windows), each
//                with the datapack / server source file it was read from (read: 'datapack' | 'server' | 'inferred')
//   keySkills[], unlock  the door-opening skills
// Sources: the datapack clone (DP_DIR env, default: the session scratchpad clone of github.com/Shagooh/l2j-server-datapack) + the server core
// clone (SRV_DIR, github.com/Shagooh/l2j-server-game) for the door / zone / Seven Signs rules. Without a clone the raw copy
// Scripts/data/dp/doors.xml and the extracted parts of the previous nav_doors.json are reused (the curated conditions are in this file).
// Run: node docs/plan/tools/nav_doors.js            (low CPU priority; ~2 s)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_LOW); } catch (e) { }
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const SCR = '%TEMP%/scratch';
const DP = process.env.DP_DIR || path.join(SCR, 'dp');
const SRV = process.env.SRV_DIR || path.join(SCR, 'srv');
const DPD = path.join(DP, 'src', 'main', 'resources', 'data'), DPJ = path.join(DP, 'src', 'main', 'java', 'com', 'l2jserver', 'datapack');
const HAVE_DP = fs.existsSync(path.join(DPD, 'doors.xml'));
const OUT = path.join(DATA, 'nav_doors.json');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const tryJ = (f, d) => { try { return J(f); } catch (e) { return d; } };
const prev = tryJ(OUT, {});
const attrs = (s) => { const a = {}; s.replace(/([\w]+)="([^"]*)"/g, (_, k, v) => { a[k] = v; }); return a; };
const walkFiles = (dir, re, out = []) => { if (!fs.existsSync(dir)) return out; for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walkFiles(p, re, out); else if (re.test(f.name)) out.push(p); } return out; };
const rel = (p) => path.relative(DP, p).replace(/\\/g, '/');

// ---------- inputs ----------
const doorsXml = HAVE_DP ? fs.readFileSync(path.join(DPD, 'doors.xml'), 'utf8') : fs.readFileSync(path.join(DATA, 'dp', 'doors.xml'), 'utf8');
if (HAVE_DP) { try { fs.mkdirSync(path.join(DATA, 'dp'), { recursive: true }); fs.writeFileSync(path.join(DATA, 'dp', 'doors.xml'), doorsXml); } catch (e) { } }
const NPCS = (() => { const n = tryJ(path.join(DATA, 'npcs_h5.json'), []); const L = Array.isArray(n) ? n : (n.npcs || Object.values(n)); const m = {}; L.forEach(x => { if (x && x.id) m[x.id] = x; }); return m; })();
const SPN = tryJ(path.join(DATA, 'spawns_npc_h5.json'), []);
const npcPos = (id) => { const s = SPN.filter(x => x.id === id); return s.length ? { x: s[0].x, y: s[0].y, z: s[0].z, spawns: s.length } : null; };
const npcName = (id) => (NPCS[id] && NPCS[id].name) || (SPN.find(x => x.id === id) || {}).name || '';
const DROOMS = tryJ(path.join(DATA, 'dungeon_rooms.json'), []);
const MAPREG = tryJ(path.join(DATA, 'map_regions.json'), []);
const TOWNS = { Gludin: [-80786, 150251], Gludio: [-12712, 122776], Dion: [15619, 143132], Giran: [83473, 148554], Oren: [82760, 53578], Aden: [146783, 25808],
  Hunters: [117088, 76931], Heine: [111455, 219400], Goddard: [147720, -55560], Rune: [43835, -47749], Schuttgart: [87126, -143520],
  'Talking Island': [-84318, 244579], 'Elven Village': [46934, 51467], 'Dark Elf Village': [9745, 15606], 'Orc Village': [-44836, -112524],
  'Dwarven Village': [115113, -178212], 'Kamael Village': [-116934, 46616], Floran: [17144, 170156] };

// ---------- items (names) ----------
const itemNames = {};
if (HAVE_DP) for (const f of walkFiles(path.join(DPD, 'stats', 'items'), /\.xml$/)) { const s = fs.readFileSync(f, 'utf8'); s.replace(/<item id="(\d+)"[^>]*name="([^"]*)"/g, (_, id, n) => { itemNames[id] = n; }); }
else Object.assign(itemNames, prev.itemNames || {});
const iname = (id) => itemNames[id] || (prev.itemNames || {})[id] || '';

// ---------- skills that open doors ----------
let keySkills = [], unlock = null;
if (HAVE_DP) {
  for (const f of walkFiles(path.join(DPD, 'stats', 'skills'), /\.xml$/)) {
    const s = fs.readFileSync(f, 'utf8');
    if (!s.includes('OpenDoor')) continue;
    const re = /<skill id="(\d+)" levels="(\d+)" name="([^"]*)"[\s\S]*?<\/skill>/g; let m;
    while ((m = re.exec(s))) {
      const body = m[0];
      const doorTargets = /DOOR_TREASURE/.test(body) && /<target npcId="\d{8}/.test(body);   // a door key whose skill lost its OpenDoor effect (Anteroom Door Key 2235)
      if (!/name="OpenDoor"/.test(body) && !doorTargets) continue;
      const set = (k) => { const x = body.match(new RegExp(`<set name="${k}" val="([^"]*)"`)); return x ? x[1] : null; };
      const tbl = (k) => { const x = body.match(new RegExp(`<table name="#${k}">([^<]*)</table>`)); return x ? x[1].trim().split(/\s+/).map(Number) : null; };
      const p = body.match(/name="OpenDoor">\s*<param ([^/]*)\/>/); const pa = p ? attrs(p[1]) : {};
      const targets = [...body.matchAll(/<target npcId="([\d,; ]+)"/g)].flatMap(t => t[1].split(/[,; ]+/).filter(Boolean).map(Number));
      const ic = set('itemConsumeId');
      const o = { skillId: +m[1], name: m[3], levels: +m[2], isItem: pa.isItem === 'true', chance: pa.chance && pa.chance.startsWith('#') ? tbl(pa.chance.slice(1)) : (pa.chance ? +pa.chance : null),
        consumes: ic ? { id: +ic, name: iname(ic), count: tbl('itemConsumeCount') || +(set('itemConsumeCount') || 1) } : null, targetType: set('targetType'), doors: targets, src: rel(f) };
      if (!/name="OpenDoor"/.test(body)) { o.noEffect = true; o.isItem = true; o.note = 'the datapack skill has NO OpenDoor effect: using the key consumes it but may not open the door on an L2J server (Unlock / another key instead)'; }
      if (o.skillId === 27) unlock = o; else keySkills.push(o);
    }
  }
} else { keySkills = prev.keySkills || []; unlock = prev.unlock || null; }
// classes that learn Unlock 27 (Scripts/data/dp/classSkillTree.xml = datapack data/skillTrees/classSkillTree.xml)
const CLASSN = { 7: 'Rogue', 8: 'Treasure Hunter', 22: 'Elven Scout', 23: 'Plains Walker', 35: 'Assassin', 36: 'Abyss Walker', 93: 'Adventurer', 101: 'Wind Rider', 108: 'Ghost Hunter' };
if (unlock) {
  const cst = (() => { try { return fs.readFileSync(path.join(DATA, 'dp', 'classSkillTree.xml'), 'utf8'); } catch (e) { return ''; } })();
  const learned = []; const re = /<skillTree type="classSkillTree" classId="(\d+)"[^>]*>([\s\S]*?)<\/skillTree>/g; let m;
  while ((m = re.exec(cst))) { const lv = [...m[2].matchAll(/skillId="27" skillLvl="(\d+)" getLevel="(\d+)"/g)].map(x => ({ skillLvl: +x[1], charLevel: +x[2] })); if (lv.length) learned.push({ classId: +m[1], name: CLASSN[m[1]] || '', levels: lv }); }
  unlock.learnedBy = learned.length ? learned : (prev.unlock && prev.unlock.learnedBy) || [];
  unlock.inheritedBy = [{ classId: 93, name: 'Adventurer', from: 8 }, { classId: 101, name: 'Wind Rider', from: 23 }, { classId: 108, name: 'Ghost Hunter', from: 36 }];
  unlock.rule = 'server core: datapack handlers/effecthandlers/custom/OpenDoor.java — works only on a door with open_method bit 8 (skill) and not on a fortress door; success = Rnd(100) < chance of the skill level; target type DOOR_TREASURE, cast range 40';
  unlock.classIds = [...new Set(unlock.learnedBy.map(c => c.classId).concat([93, 101, 108]))];
}

// ---------- door references in the datapack scripts ----------
let scriptRefs = {};      // doorId -> [{file, op, npcIds, near, method}]
let scriptNpcs = {};      // file -> npc ids
if (HAVE_DP) {
  for (const f of walkFiles(DPJ, /\.java$/)) {
    const s = fs.readFileSync(f, 'utf8');
    if (!/openDoor|closeDoor|getDoor\(/.test(s)) continue;
    const C = {};
    s.replace(/static\s+final\s+int\s+([A-Z_0-9]+)\s*=\s*(\d+)\s*;/g, (_, k, v) => { C[k] = [+v]; });
    s.replace(/static\s+final\s+int\s*\[\]\s*([A-Z_0-9]+)\s*=\s*\{([^}]*)\}/g, (_, k, v) => { C[k] = (v.match(/\d{5,}/g) || []).map(Number); });
    const resolve = (t) => /^\d+$/.test(t) ? [+t] : (C[t] || []);
    const npcIds = [...new Set([...s.matchAll(/add(?:StartNpc|TalkId|FirstTalkId|KillId|SpawnId)\(([^)]*)\)/g)].flatMap(m => m[1].split(',').map(x => x.trim()).flatMap(resolve)))].filter(x => x > 10000 && x < 100000);
    scriptNpcs[rel(f)] = npcIds;
    const lines = s.split(/\r?\n/);
    lines.forEach((ln, i) => {
      const ops = [];
      for (const m of ln.matchAll(/\b(openDoor|closeDoor)\(\s*([A-Za-z_0-9]+)/g)) ops.push([m[1] === 'openDoor' ? 'open' : 'close', m[2]]);
      for (const m of ln.matchAll(/getDoor\(\s*([A-Za-z_0-9]+)\s*\)\s*\.\s*(openMe|closeMe)/g)) ops.push([m[2] === 'openMe' ? 'open' : 'close', m[1]]);
      if (!ops.length) return;
      let near = null, method = null;
      for (let k = i; k >= Math.max(0, i - 60); k--) {
        if (!near) { const c = lines[k].match(/case\s+([A-Z_0-9]+|\d+)\s*:/) || lines[k].match(/case\s+"([^"]+)"\s*:/); if (c) near = c[1]; }
        const mm = lines[k].match(/public\s+\S+\s+(on[A-Za-z]+)\s*\(/); if (mm) { method = mm[1]; break; }
      }
      const nearIds = near && /^[A-Z_0-9]+$/.test(near) ? resolve(near) : [];
      for (const [op, tok] of ops) for (const id of resolve(tok)) {
        if (id < 1000000) continue;
        (scriptRefs[id] = scriptRefs[id] || []).push({ file: rel(f), line: i + 1, op, method: method || '', case: near || '', caseNpc: nearIds.find(x => x > 10000 && x < 100000) || null });
      }
    });
  }
} else { scriptRefs = prev.scriptRefs || {}; }

// ---------- instance templates ----------
let instDoors = {};
if (HAVE_DP) for (const f of walkFiles(path.join(DPD, 'instances'), /\.xml$/)) { const s = fs.readFileSync(f, 'utf8'); for (const m of s.matchAll(/<door doorId="(\d+)"([^>]*)>/g)) { (instDoors[m[1]] = instDoors[m[1]] || []).push({ instance: path.basename(f, '.xml'), open: /open="true"|<opened/.test(m[2]) || undefined }); } }
else instDoors = prev.instDoors || {};

// ---------- boss zones ----------
let bossZones = [];
if (HAVE_DP) for (const f of walkFiles(path.join(DPD, 'zones'), /\.xml$/)) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/<zone ([^>]*type="BossZone"[^>]*)>([\s\S]*?)<\/zone>/g)) {
    const a = attrs(m[1]); const poly = [...m[2].matchAll(/<node X="(-?\d+)" Y="(-?\d+)"/g)].map(n => [+n[1], +n[2]]);
    const en = m[2].match(/name="default_enabled" val="(\w+)"/);
    bossZones.push({ id: +a.id, name: a.name, shape: a.shape, poly, zMin: +a.minZ, zMax: +a.maxZ, enabled: !(en && en[1] === 'false'), src: rel(f),
      rule: 'server core L2BossZone.onEnter: while enabled, a player the boss script did not allowPlayerEntry() is teleported out (oust location or town)' });
  }
} else bossZones = prev.bossZones || [];

// ---------- where a point is ----------
const tileName = (x, y, z) => { const tx = Math.floor(x / 32768) + 20, ty = Math.floor(y / 32768) + 18; const c = MAPREG.filter(r => r.tx === tx && r.ty === ty && r.name && z >= r.zmin && z <= r.zmax); return c.length ? c[0].name : ''; };
function placeOf(x, y, z) {
  const p = {};
  for (const d of DROOMS) {
    const b = d.bbox; if (!Array.isArray(b) || x < b[0] - 600 || x > b[1] + 600 || y < b[2] - 600 || y > b[3] + 600) continue;
    const fl = (d.floors || []).findIndex(F => Array.isArray(F.z) && z >= F.z[0] - 400 && z <= F.z[1] + 400);
    if (fl >= 0) { p.dungeon = d.name; p.dungeonKey = d.key; p.floor = d.floors[fl].name; break; }
  }
  const t = Object.entries(TOWNS).map(([k, v]) => [k, Math.hypot(v[0] - x, v[1] - y)]).sort((a, b) => a[1] - b[1])[0];
  if (t[1] < 6000) p.town = t[0]; else p.nearTown = { name: t[0], dist: Math.round(t[1]) };
  const r = tileName(x, y, z); if (r) p.region = r;
  const bz = bossZones.find(zn => zn.poly.length > 2 && z >= zn.zMin - 200 && z <= zn.zMax + 200 && inPoly(x, y, zn.poly)); if (bz) p.bossZone = bz.name;
  return p;
}
function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if (((P[i][1] > y) !== (P[j][1] > y)) && (x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0])) c = !c; } return c; }

// ---------- doors ----------
const BIT = { click: 1, time: 2, item: 4, skill: 8, cycle: 16 };
const keyByDoor = {}; keySkills.forEach(k => k.doors.forEach(d => { (keyByDoor[d] = keyByDoor[d] || []).push({ skillId: k.skillId, skill: k.name, itemId: k.consumes ? k.consumes.id : null, itemName: k.consumes ? k.consumes.name : '', consumed: k.consumes ? (Array.isArray(k.consumes.count) ? k.consumes.count[0] : k.consumes.count) : 0, src: k.src }); }));
const doors = [];
for (const m of doorsXml.matchAll(/<door ([^>]*?)\/?>/g)) {
  const a = attrs(m[1]); if (!a.id) continue;
  const id = +a.id, pos = String(a.pos || '0;0;0').split(';').map(Number), om = +(a.open_method || 0);
  const poly = [1, 2, 3, 4].map(i => String(a['node' + i] || '0,0').split(',').map(Number));
  const nodeZ = +(a.nodeZ || pos[2]), h = +(a.height || 150);
  const d = { id, name: a.name, x: pos[0], y: pos[1], z: pos[2], poly, zMin: nodeZ, zMax: nodeZ + h, defaultOpen: a.default_status === 'open', openMethod: om,
    collision: a.check_collision !== 'false', targetable: a.targetable !== 'false', kinds: [] };
  const by = Object.keys(BIT).filter(k => om & BIT[k]); if (by.length) d.openBy = by;
  if (a.level) d.level = +a.level;
  if (a.group) d.group = a.group;
  if (a.is_wall === 'true') { d.wall = true; d.kinds.push('wall'); }
  if (a.emitter_id) d.emitter = +a.emitter_id;
  if (a.child_id_event) d.childDoor = +a.child_id_event;
  if (a.clanhall_id) { d.clanhallId = +a.clanhall_id; d.kinds.push('clanhall'); }
  if (om & BIT.time) {
    const ot = +(a.open_time || 0), ct = +(a.close_time || 0), rt = Math.max(0, +(a.random_time || 0));
    d.timed = { openFor: [ot, ot + rt], closedFor: [ct, ct + rt], random: rt, periodMin: ot + ct, periodMax: ot + ct + 2 * rt, maxWait: ct + rt,
      rule: 'server core L2DoorInstance.TimerOpen: toggles for ever; after opening it stays open open_time + Rnd(random_time) s, after closing it stays closed close_time + Rnd(random_time) s (first switch close_time after the server start)' };
    d.kinds.push('timed');
  } else if (a.close_time && +a.close_time > 0) d.autoCloseSec = +a.close_time;
  if (om & BIT.skill) { d.kinds.push('unlock'); d.unlock = { skillId: 27, chanceByLevel: unlock ? unlock.chance : null, minSkillLevel: 1, sureFromSkillLevel: unlock && Array.isArray(unlock.chance) ? unlock.chance.indexOf(100) + 1 : 4, classIds: unlock ? unlock.classIds : [] }; }
  if (keyByDoor[id] || (om & BIT.item)) { d.kinds.push('key'); d.keys = keyByDoor[id] || []; }
  if (om & BIT.click) d.kinds.push('click');
  if (om & BIT.cycle) d.kinds.push('cycle');
  if (scriptRefs[id]) {
    d.kinds.push('script');
    const byFile = {};
    scriptRefs[id].forEach(r => { const k = r.file + ':' + r.op; if (!byFile[k]) byFile[k] = Object.assign({}, r, { lines: [r.line] }); else byFile[k].lines.push(r.line); });
    d.scripts = Object.values(byFile).map(r => ({ file: r.file, op: r.op, lines: r.lines.slice(0, 6), method: r.method, npcId: r.caseNpc || null, npc: r.caseNpc ? npcName(r.caseNpc) : '', event: r.case && !/^\d+$/.test(r.case) && !r.caseNpc ? r.case : '' }));
  }
  if (instDoors[id]) { d.instances = [...new Set(instDoors[id].map(x => x.instance))]; d.kinds.push('instance'); }
  if (/castle/i.test(a.name || '') && !d.clanhallId) { d.kinds.push('castle'); }
  if (/^fortress|_fort/i.test(a.name || '') && !d.clanhallId) { d.kinds.push('fortress'); }
  if (!d.kinds.length || (d.kinds.length === 1 && d.kinds[0] === 'wall')) d.kinds.push(d.defaultOpen ? 'open' : 'closed-no-opener');
  // primary kind: what a traveller has to do
  d.kind = d.defaultOpen && !d.timed ? 'open' : ['timed', 'key', 'unlock', 'script', 'clanhall', 'castle', 'fortress', 'instance', 'click', 'cycle', 'wall', 'closed-no-opener'].find(k => d.kinds.includes(k)) || 'closed-no-opener';
  d.blocks = !d.defaultOpen && d.collision;      // a closed door with collision stops a walk (server core DoorData.checkIfDoorsBetween)
  d.place = placeOf(d.x, d.y, d.z);
  doors.push(d);
}
// curated opener notes (read from the datapack scripts; see conditions[] for the full rule)
const NOTE = {
  19160001: { npc: [32034, 32035], text: 'Pagan Temple main gate: Temple Gatekeeper 32034 (outside) opens it for 10 s for a player holding Visitor\'s Mark 8064 / Faded Visitor\'s Mark 8065 / Pagan\'s Mark 8067; 32035 (inside) opens it for anyone (the way out)', closesAfterSec: 10, items: [8064, 8065, 8067], src: 'ai/npc/Teleports/PaganTeleporters/PaganTeleporters.java' },
  19160010: { npc: [32036, 32037], text: 'Pagan Temple sanctuary gate (left): Temple Gatekeeper 32036 opens 19160010 + 19160011 for 10 s only with Pagan\'s Mark 8067; 32037 (inside) for anyone', closesAfterSec: 10, items: [8067], src: 'ai/npc/Teleports/PaganTeleporters/PaganTeleporters.java' },
  19160011: { npc: [32036, 32037], text: 'Pagan Temple sanctuary gate (right): see 19160010', closesAfterSec: 10, items: [8067], src: 'ai/npc/Teleports/PaganTeleporters/PaganTeleporters.java' },
  24210004: { npc: [31384], text: 'Hall of Flames (Valakas approach): talking to Gatekeeper of Fire Dragon 31384 opens it (no item check in the script)', src: 'ai/npc/Teleports/GrandBossTeleporters/GrandBossTeleporters.java' },
  24210005: { npc: [31687], text: 'Hall of Flames: Gatekeeper of Fire Dragon 31687 opens it on talk (door to Heart of Volcano)', src: 'ai/npc/Teleports/GrandBossTeleporters/GrandBossTeleporters.java' },
  24210006: { npc: [31686], text: 'Hall of Flames: Gatekeeper of Fire Dragon 31686 opens it on talk (door to Heart of Volcano)', src: 'ai/npc/Teleports/GrandBossTeleporters/GrandBossTeleporters.java' },
};
// Tully's Workshop (2026-10-12 unreachable research): TullyWorkshop.java TULLY_DOORLIST — Tully's Gatekeeper 18445-18461 "Attempt to operate
// the machine." opens its doors for 120 s (99999 = the 2nd 18455 at x -14610). Parsed from the datapack when the clone is there.
{
  const TF = path.join(DPJ, 'hellbound', 'ai', 'zones', 'TullyWorkshop', 'TullyWorkshop.java');
  const txt = fs.existsSync(TF) ? fs.readFileSync(TF, 'utf8') : '';
  const map = {}; txt.replace(/TULLY_DOORLIST\.put\((\d+), new int\[\] \{ ([\d, ]+) \}\)/g, (_, npc, ids) => { ids.split(',').map(Number).forEach(id => { (map[id] = map[id] || []).push(Number(npc)); }); });
  if (!Object.keys(map).length) Object.assign(map, (prev.tullyDoors || {}));
  for (const [id, npcs] of Object.entries(map)) if (!NOTE[id]) NOTE[id] = { npc: npcs.map(n => n === 99999 ? 18455 : n), pos: npcs.includes(99999) ? { 18455: { x: -14610, y: 273721, z: -9032 } } : null, link: 'Attempt to operate the machine.',
    text: `Tully's Workshop door: Tully's Gatekeeper ${npcs.map(n => n === 99999 ? '18455 (x -14610)' : n).join(' / ')} "Attempt to operate the machine." opens it for 120 s`, closesAfterSec: 120, src: 'hellbound/ai/zones/TullyWorkshop/TullyWorkshop.java (TULLY_DOORLIST, event open)' };
  var TULLY_DOORS = map;   // eslint-disable-line no-var
}
// Hellbound gates (2026-10-12): HellboundEngine.java DOOR_LIST opens them while the server-wide Hellbound level is >= n (closes below)
{
  const HF = path.join(DPJ, 'hellbound', 'HellboundEngine.java'), txt = fs.existsSync(HF) ? fs.readFileSync(HF, 'utf8') : '';
  const lv = {}; (txt.match(/DOOR_LIST\s*=\s*\{([\s\S]*?)\};/) || [, ''])[1].replace(/\{\s*(\d+),\s*(\d+)\s*\}/g, (_, id, l) => { lv[id] = Number(l); });
  if (!Object.keys(lv).length) Object.assign(lv, prev.hellboundDoors || {});
  for (const d of doors) if (lv[d.id]) { d.hellboundLevel = lv[d.id]; d.kind = 'hellbound'; if (!d.kinds.includes('hellbound')) d.kinds.unshift('hellbound'); d.note = `Hellbound gate: open while the Hellbound level is >= ${lv[d.id]} (HellboundEngine.java DOOR_LIST)`; d.noteSrc = 'hellbound/HellboundEngine.java'; }
  var HB_DOORS = lv;   // eslint-disable-line no-var
}
for (const d of doors) {
  const n = NOTE[d.id]; if (!n) continue;
  d.npcOpen = n.npc.map(id => Object.assign({ npcId: id, npc: npcName(id) }, (n.pos && n.pos[id]) || npcPos(id) || {}));
  if (n.link) d.npcLink = n.link;
  d.note = n.text; d.noteSrc = n.src; if (n.closesAfterSec) d.closesAfterSec = n.closesAfterSec; if (n.items) d.npcItems = n.items;
  if (!d.kinds.includes('npc')) d.kinds.unshift('npc');
  d.kind = 'npc';                                   // the datapack way; an Unlock bit (if any) stays in kinds + unlock as the alternative
}

// ---------- DOOR GROUPS (2026-10-12 finish): what the closed doors without a datapack opener are, so a blocked route says WHY ----------
// prefix of the door name -> area + how it really opens (read from the datapack / server core; 'travel: false' = not on any travel way)
const GROUPS = [
  { re: /^olympiad_door/, area: 'Olympiad stadiums', why: 'Olympiad arena doors: the server opens them only for a match (instance)', src: 'server model/olympiad/OlympiadGameTask.java', travel: false },
  { re: /^kerthang/, area: 'Underground Coliseum', why: 'Underground Coliseum arena doors: opened by the coliseum match (server core), never for travel', src: 'datapack ai/npc/Teleports/TeleportToUndergroundColiseum', travel: false },
  { re: /^cratae/, area: 'underground room grid at z -8384 (west of the Orc / Kamael lands; no travel target there)', why: 'room doors of an underground grid (default closed, 120 of them on a timer); no datapack script or zone names it, no atlas route crosses it', src: 'datapack doors.xml (no script reference)', travel: false },
  { re: /^c_tower/, area: 'Tower of Naia (Hellbound)', why: 'Tower of Naia room doors: TowerOfNaia.java opens each room after its monsters die', src: 'datapack hellbound/ai/zones/TowerOfNaia/TowerOfNaia.java', kindTo: 'script' },
  { re: /^tolles/, area: "Tully's Workshop (Hellbound)", why: "Tully's Workshop doors: TullyWorkshop.java opens them (floor progress / Tully killed)", src: 'datapack hellbound/ai/zones/TullyWorkshop/TullyWorkshop.java', kindTo: 'script' },
  { re: /^royal_rush/, area: 'Four Sepulchers (inside the sepulchers)', why: 'Four Sepulchers hall doors: the server FourSepulchersManager opens them room by room while a registered party clears it (entry from hh:50 with a Used Grave Pass); closed for everyone else', src: 'server instancemanager/FourSepulchersManager.java + datapack ai/group_template/FourSepulchers', kindTo: 'script' },
  { re: /^(wall_|grave_pathway)/, area: 'Imperial Tomb (outer halls)', why: 'Imperial Tomb walls / pathway doors: part of the Frintezza / Four Sepulchers areas, no opener in the datapack', src: 'datapack doors.xml', travel: false },
  { re: /^altar_flame/, area: "Pagan Temple (Andreas' altar)", why: "Pagan Temple altar flame gates: closed in the datapack, nothing opens them (the altar room is reached by Triol's Mirror teleports)", src: 'datapack doors.xml (no script reference)' },
  { re: /^Farm_/, area: 'Wild Beast Reserve (clan hall 63, flag war)', why: 'Wild Beast Reserve clan hall: FlagWar opens the doors only during its clan hall siege', src: 'datapack conquerablehalls/flagwar/WildBeastReserve/WildBeastReserve.java (OUTTER/INNER_DOORS_TO_OPEN)', kindTo: 'clanhall' },
  { re: /^(nornildg|hide|camaeldg)/, area: "Nornil's Garden (instance)", why: "Nornil's Garden doors: opened by the instance script / keys", src: 'datapack instances/NornilsGarden/NornilsGarden.java', travel: false },
  { re: /^darion_raid|^hell_town/, area: 'Hellbound', why: 'Hellbound doors: opened by the Hellbound level scripts', src: 'datapack hellbound/', kindTo: 'script' },
  { re: /^cyratal_cave/, area: 'Crystal Caverns (instance)', why: 'Crystal Caverns instance doors', src: 'datapack instances/CrystalCaverns/CrystalCaverns.java', travel: false },
  { re: /^beres/, area: "Beleth's / Baylor area", why: 'boss room doors opened by the boss script', src: 'datapack doors.xml', kindTo: 'script' },
  { re: /^border/, area: 'Blazing Swamp border', why: 'closed border door, no opener in the datapack', src: 'datapack doors.xml' },
];
for (const d of doors) {
  const g = GROUPS.find(G => G.re.test(d.name || '')); if (!g) continue;
  d.area = g.area; if (g.travel === false) d.travel = false;
  if (d.kind === 'closed-no-opener' || (g.kindTo && ['closed-no-opener', 'script'].includes(d.kind))) {
    d.noOpenerWhy = g.why; d.noOpenerSrc = g.src;
    if (g.kindTo && d.kind === 'closed-no-opener') { d.kind = g.kindTo; if (!d.kinds.includes(g.kindTo)) d.kinds.push(g.kindTo); }
  }
}

// ---------- entry conditions (curated; every rule cites its source) ----------
const P = (id) => Object.assign({ npcId: id, npc: npcName(id) }, npcPos(id) || {});
const I = (id, consumed) => ({ id, name: iname(id) || '', consumed: !!consumed });
const DPS = 'datapack ', SRVS = 'server ';
const conditions = [
  { key: 'pagan-temple-gate', area: 'Pagan Temple', kind: 'item', doors: [19160001], via: P(32034),
    need: { anyItem: [I(8064), I(8065), I(8067)] }, text: 'Triol\'s Mirror 32039 near Rune teleports anyone into the outer hall (-12766,-35840,-10856); the temple gate 19160001 opens (10 s) only when Temple Gatekeeper 32034 is talked to by someone holding Visitor\'s Mark, Faded Visitor\'s Mark or Pagan\'s Mark (quest 636 Truth Beyond the Gate). One holder opens it for the whole party (it stays open 10 s).',
    src: DPS + 'ai/npc/Teleports/PaganTeleporters/PaganTeleporters.java', read: 'datapack' },
  { key: 'pagan-temple-sanctuary', area: 'Pagan Temple (sanctuary, south of y -44160)', kind: 'item', doors: [19160010, 19160011], via: P(32036),
    need: { anyItem: [I(8067)] }, text: 'The sanctuary gates 19160010/19160011 open (10 s) only via Temple Gatekeeper 32036 for a holder of Pagan\'s Mark 8067 (quest 637 Through the Gate Once More).',
    src: DPS + 'ai/npc/Teleports/PaganTeleporters/PaganTeleporters.java', read: 'datapack' },
  { key: 'triols-mirror', area: 'Pagan Temple (way in)', kind: 'teleporter', via: P(32039), landing: [-12766, -35840, -10856], need: {},
    text: 'Triol\'s Mirror 32039 (Rune outskirts) teleports on first talk, no condition; Triol\'s Mirror 32040 inside leads back out to (36640,-51218,718).', src: DPS + 'ai/npc/Teleports/PaganTeleporters/PaganTeleporters.java', read: 'datapack' },
  { key: 'antharas', area: 'Antharas\' Nest', bossIds: [29068], kind: 'item+party+bossState', via: P(13001), landing: [180050, 114850, -7709], bossEntry: true, need: { items: [I(3865, false)], partyLeader: true, maxPlayers: 200, bossState: 'alive or waiting (not in fight / dead)' },
    text: 'Heart of Warding 13001: the party (or command channel) leader holding a Portal Stone 3865 teleports his party into the nest; zone 70050 (no restart). In a party only the leader may ask; members also need the stone in the L2J script.',
    src: DPS + 'ai/individual/Antharas/Antharas.java', read: 'datapack' },
  { key: 'baium', area: 'Tower of Insolence 14F (Baium)', bossIds: [29020], kind: 'item+bossState', via: P(31862), landing: [114077, 15882, 10078], bossEntry: true, need: { items: [I(4295, true)], bossState: 'asleep (alive, not awake)' },
    text: 'Angelic Vortex 31862 on the 14th floor takes one Blooded Fabric 4295 and teleports in (114077,15882,10078). The floors below are reached by the stairs (timed hubris doors on 3F / 8F / 11F) or the ToI vortexes with dimension stones.',
    src: DPS + 'ai/individual/Baium/Baium.java', read: 'datapack' },
  { key: 'toi-vortex', area: 'Tower of Insolence floors', dungeonKey: 'toi', kind: 'item', via: [P(30949), P(30950), P(30951)], need: { itemPerFloor: { '1-3': I(4401, true), '4-6': I(4402, true), '7-10': I(4403, true) } },
    text: 'Dimensional vortexes Keplon 30949 (1F), Euclie 30950 (5F), Pithgon 30951 (10F) teleport to a floor for one dimension stone: Green 4401 for floors 1-3, Blue 4402 for 4-6, Red 4403 for 7-10.',
    src: DPS + 'ai/npc/Teleports/ToIVortex/ToIVortex.java', read: 'datapack' },
  { key: 'valakas-hall', area: 'Hall of Flames (Valakas)', bossIds: [29028], kind: 'item', via: P(31540), landing: [183813, -115157, -3303], need: { items: [I(7267, false)] },
    text: 'Watcher of Valakas Klein 31540 teleports a holder of Vacualite Floating Stone 7267 into the Hall of Flames and marks him allowed; Gatekeepers of Fire Dragon 31384/31686/31687 open the hall doors 24210004/24210006/24210005 on talk.',
    src: DPS + 'ai/npc/Teleports/GrandBossTeleporters/GrandBossTeleporters.java', read: 'datapack' },
  { key: 'valakas-lair', area: 'Valakas\' Lair', bossIds: [29028], kind: 'bossState+flag', via: P(31385), landing: [204328, -111874, 70], need: { flag: 'entered the Hall via Klein with the stone', bossState: 'alive or waiting', maxPlayers: 200 },
    text: 'Heart of Volcano 31385 lets in only players Klein marked (allowEnter), while Valakas is alive or waiting (status 0/1) and fewer than 200 went in; boss zone "Valakas Boss" 12010 ousts everyone else. NOTE: raidbosses_h5.json lists Valakas at (-105200,-253104,-15264) = the script\'s regeneration spot, not the lair (212852,-114842,-1632).',
    src: DPS + 'ai/npc/Teleports/GrandBossTeleporters/GrandBossTeleporters.java + ai/individual/Valakas.java', read: 'datapack' },
  { key: 'sailren', area: 'Sailren\'s lair (Primeval Isle)', bossIds: [29065], kind: 'item+party', via: P(32109), bossEntry: true, need: { items: [I(8784, true)], party: true, partyLeader: true },
    text: 'Shilen\'s Stone Statue 32109: party leader with Gazkh 8784 (taken) starts the fight; zone 70049 (no restart).', src: DPS + 'ai/individual/Sailren/Sailren.java', read: 'datapack' },
  { key: 'queen-ant', area: 'Queen Ant\'s nest', bossIds: [29001], kind: 'level', need: { curseAbove: 48 },
    text: 'No item; QueenAnt.java casts the raid curse on players more than 8 levels above the queen (level 40 -> above 48). Boss zone "Queen Ant Boss" 12012.', src: DPS + 'ai/individual/QueenAnt.java + zones/custom_boss.xml', read: 'datapack' },
  { key: 'core', area: 'Cruma Tower 3F (Core)', bossIds: [29006], dungeonKey: 'cruma', kind: 'level', need: { maxLevelEnter: 55 },
    text: 'Cruma Tower: Mozella 30483 at the tower door teleports into the tower only players of level <= 55 (CrumaTower.java MAX_LEVEL 55). Floors 2 and 3 by the floor teleporters inside.', src: DPS + 'ai/npc/Teleports/CrumaTower/CrumaTower.java', read: 'datapack' },
  { key: 'cruma-entry', area: 'Cruma Tower', dungeonKey: 'cruma', kind: 'level', via: P(30483), need: { level: { max: 55 } }, text: 'Mozella 30483: teleport into the tower only at level <= 55.', src: DPS + 'ai/npc/Teleports/CrumaTower/CrumaTower.java', read: 'datapack' },
  { key: 'orfen', area: 'Sea of Spores (Orfen)', bossIds: [29014], kind: 'none', need: {}, text: 'No item or NPC; boss zone "Orfen Boss" 12013. Walk in.', src: DPS + 'ai/individual/Orfen.java + zones/custom_boss.xml', read: 'datapack' },
  // 2026-10-12 unreachable research (docs/plan/unreachable_research.md): the cube has no spawn-list position — Epidos.java spawns it in Core Naia
  { key: 'beleth', area: 'Steel Citadel (Beleth)', bossIds: [29118], kind: 'commandChannel+bossState', via: Object.assign(P(32376), { npc: 'Teleport Cube (Naia Cube)', x: -45482, y: 246277, z: -14184, posSrc: 'ai/individual/Epidos.java onKill addSpawn(32376)' }), link: 'Meet Beleth.', landing: [16342, 209557, -9352], need: { commandChannelLeader: true, minChannelMembers: 'config grandBoss().getBelethMinPlayers()', bossState: 'alive' },
    text: 'Naia Cube 32376 (spawned in Core Naia when Epidos dies, Epidos.java): only the command channel leader with at least BelethMinPlayers members (server config) while Beleth is alive teleports the channel (members within 3000) in. The way to the cube: Hellbound -> Deltuva -> Dorian -> Tully\'s Workshop floors -> roof (Darion) -> Tower of Naia (Naia Lock + Control Device) -> 12 rooms -> Epidos.', src: DPS + 'ai/npc/Teleports/SteelCitadelTeleport/SteelCitadelTeleport.java + ai/individual/Epidos.java + hellbound/ai/zones/TowerOfNaia/TowerOfNaia.java', read: 'datapack' },
  { key: 'frintezza', area: 'Last Imperial Tomb (Frintezza, instance)', bossIds: [29045], kind: 'instance+item+commandChannel', via: P(32011), need: { items: [I(8073, false)], commandChannel: { min: 18, max: 45 }, level: { min: 80 } },
    text: 'Imperial Tomb Guide 32011: command channel leader holding Frintezza\'s Magic Force Field Removal Scroll 8073, channel 18-45 players, every member level >= 80; instance template 136.', src: DPS + 'instances/FinalEmperialTomb/FinalEmperialTomb.java', read: 'datapack' },
  { key: 'zaken', area: 'Cavern of the Pirate Captain (Zaken, instance)', bossIds: [29022], kind: 'instance+party+level', via: P(32713), need: { party: true, level: { min: 55, note: 'day-60 version; the day-83 version needs 78' }, reentry: 'instance time per player' },
    text: 'Pathfinder Worker 32713: party (or command channel) instance; every member level >= 55 (template 133) / >= 78 (template 135), no re-entry timer running.', src: DPS + 'instances/CavernOfThePirateCaptain/CavernOfThePirateCaptain.java', read: 'datapack' },
  { key: 'freya', area: 'Ice Queen\'s Castle (Freya, instance)', bossIds: [29179], kind: 'instance+commandChannel+level', via: P(32781), need: { commandChannel: { min: 10, max: 27 }, level: { min: 82 } },
    text: 'Freya normal battle: command channel of 10-27 players, every member level >= 82 (entered through Jinia 32781 / Sirra).', src: DPS + 'instances/IceQueensCastleNormalBattle/IceQueensCastleNormalBattle.java', read: 'datapack' },
  { key: 'tiat', area: 'Seed of Destruction (Tiat, instance)', bossIds: [29163], kind: 'instance+commandChannel+level', via: P(32526), need: { commandChannel: { min: 27, max: 45 }, level: { min: 75 } },
    text: 'Seed of Destruction stage 1: 27-45 players, level >= 75 (Allenos 32526 at the Keucereus base); doors 12240027 scout pass / 12240030 fortress door are opened by the instance script.', src: DPS + 'gracia/instances/SeedOfDestruction/Stage1.java', read: 'datapack' },
  { key: 'ekimus', area: 'Seed of Infinity (Ekimus, Heart of Infinity instance)', bossIds: [29150], kind: 'instance+commandChannel+level+stage', via: P(32537), need: { level: { min: 75 }, commandChannel: { note: 'retail: command channel, 18+ players' }, serverScript: 'Heart of Infinity is NOT in the L2J H5 datapack (only gracia/instances/SeedOfInfinity/HallOfSuffering): the live server must run its own script', window: { soiStage: 'Seed of Infinity in the Ekimus (attack) stage' } },
    text: 'Ekimus lives in the Heart of Infinity instance of the Seed of Infinity. Way in: Keucereus base (airship from the Gludio wharf) -> Lionel 32782 "Seed of Infinity Dock" (150,000 adena) -> Jaedin 32534 "Say yes." (teleport 14000 into the Seed) -> Mouth of Ekimus 32537 (4 spawns around the Gatekeeper of the Abyss). The datapack only implements the Hall of Suffering (MIN_LEVEL 75, MAX_LEVEL 82, party); the Heart of Infinity / Ekimus attack is server-side and depends on the Seed of Infinity stage.', src: DPS + 'gracia/instances/SeedOfInfinity/HallOfSuffering/HallOfSuffering.java + html/teleporter/32534.htm + 32782-1.htm', read: 'inferred' },
  // ---- 2026-10-12 unreachable research: transport chains (hubs in Scripts/data/nav_atlas_extra.json use these keys) ----
  { key: 'benom', area: 'Rune Castle dungeon (Benom)', bossIds: [29054], kind: 'castleOwner+window', bossEntry: true, via: P(35506), link: 'Teleport to the dungeon', landing: [12589, -49044, -3008],
    need: { castleOwner: 'Rune (castle 8): the Dungeon Gatekeeper stands in the inner castle (owner-only doors / Inner Doorman teleports)', window: { beforeSiege: 'from 24 h before the Rune siege until it starts (Venom.java: HOURS_BEFORE * 360000 ms = only 2.4 h in this L2J build)', duringSiege: 'with <= 1 control tower left Benom moves to the throne room (11025,-49152,-537) and fights both sides' } },
    text: 'Dungeon Gatekeeper 35506 (11532,-49136,-1087, inner Rune Castle) "Teleport to the dungeon" -> (12589,-49044,-3008) next to Benom only while the prison is open (before the Rune siege); otherwise 35506-02.html. Teleportation Cubic 29055 leads back to town. GUIDE: legacylineage2.fandom.com Updates_-_C5_-_Changes_to_Castle_Sieges ("appears in the castle dungeon 24 hours before a siege; the defending side can teleport to the dungeon").', src: DPS + 'ai/individual/Venom/Venom.java + 35506.html', read: 'datapack' },
  { key: 'gracia-airship', area: 'Gludio wharf -> Keucereus base (regular airship)', kind: 'vehicle', via: P(32609), link: 'Board the Airship.', landing: [-186563, 243590, 2608], need: { window: { schedule: 'board only while the ship is docked (60 s per cycle); flight Gludio wharf -> warpgate -> Keucereus, oust at (-186563,243590,2608)' }, noSummon: true, notTransformed: true },
    text: 'Flight Control 32609 at the Gludio airship wharf (Gracian Survivor 32632 / gatekeeper "Airship dock" land there): "Board the Airship." adds you as a passenger while the airship is docked; it flies to the Keucereus Alliance Base and ousts everyone at (-186563,243590,2608). No pet/servitor, not transformed, not in combat.', src: DPS + 'gracia/vehicles/AirShipGludioGracia/AirShipGludioGracia.java + 32609.htm', read: 'datapack' },
  { key: 'keucereus-docks', area: 'Keucereus base -> Seed docks', kind: 'adena', via: P(32782), need: { adena: 150000 }, text: 'Lionel 32782 (Keucereus base): Teleport -> Seed of Infinity / Destruction / Annihilation Dock, 150,000 adena each (teleport ids 15006/15007/15008).', src: DPS + 'html/teleporter/32782.htm + 32782-1.htm + teleport.sql', read: 'datapack' },
  { key: 'seed-of-infinity', area: 'Seed of Infinity (inside)', kind: 'none', via: P(32534), landing: [-183292, 206063, -12888], need: {}, text: 'Jaedin 32534 at the Seed of Infinity dock: "Say yes." -> teleport 14000 (-183292,206063,-12888) next to the Gatekeeper of the Abyss 32539.', src: DPS + 'html/teleporter/32534.htm + teleport.sql', read: 'datapack' },
  { key: 'soa-portals', area: 'Seed of Annihilation (walk-in portals)', kind: 'zone', need: {}, text: 'ScriptZones 60002-60005 (zones/custom_script.xml, cylinders r 260/360): walking into one teleports (SeedOfAnnihilation.java TELEPORT_ZONES): 60002 (-182488,186655) -> (-213175,182648,-10992) west wing; 60003 (-212755,184380) -> back (-181217,186711,-10528); 60004 (-178458,188167) -> (-180211,182984,-15152) lower level; 60005 (-179430,183844) -> back (-179275,186802,-10720).', src: DPS + 'gracia/ai/SeedOfAnnihilation/SeedOfAnnihilation.java + zones/custom_script.xml', read: 'datapack' },
  { key: 'deltuva', area: 'Hellbound: Steel Citadel (Deltuva -> Dorian)', kind: 'quest', via: { npcId: 32313, npc: 'Deltuva', x: 10632, y: 244721, z: -2008, posSrc: 'data/hellbound/hellboundSpawns.xml' }, landing: [17934, 283189, -9701], need: { questCompleted: 'Q00132_MatrasCuriosity' },
    text: 'Deltuva 32313 (in front of a cave right after the Steel Citadel outer gate) "Let me into the Steel Citadel." -> (17934,283189,-9701) next to Dorian, only after quest 132 Matras\' Curiosity is completed (32313-02.htm otherwise). GUIDE: lineage.pmfun.com Hellbound guide (stage 11: "search out the NPC Deltuva and teleport directly into Tully\'s Workshop").', src: DPS + 'hellbound/ai/npc/Deltuva/Deltuva.java + html/default/32313.htm', read: 'datapack' },
  { key: 'tully-workshop', area: 'Tully\'s Workshop (Dorian + floor teleport devices)', kind: 'party', via: P(32373), landing: [-13400, 272827, -15300], need: { partyLeader: true, party: true, note: 'Dorian: the party leader, every member within 300; floor devices 32753-32756: party leader, members within 4000 go along' },
    text: 'Dorian 32373 "Get help." (party leader, all members within 300) -> 1st floor (-13400,272827,-15300). Floor Teleport Devices "Go upstairs.": 32753 -> (-12700,273340,-13600), 32754 -> (-13246,275740,-11936), 32755 -> (-12798,273458,-10496), 32756 -> (-13500,275912,-9032) (Tully\'s floor; Tully 25544 at -12557,273901,-9000). Tully\'s Gatekeepers 18445-18461 ("Attempt to operate the machine.") open their doors for 120 s.', src: DPS + 'hellbound/ai/zones/TullyWorkshop/TullyWorkshop.java + html/default/32373.htm, 32753-32756.htm', read: 'datapack' },
  { key: 'tower-of-naia', area: 'Tower of Naia (roof of the Steel Citadel)', kind: 'party+manual', via: { npcId: 18492, npc: 'Control Device', x: 16608, y: 244420, z: 11620, posSrc: 'TowerOfNaia.java addSpawn(CONTROLLER)' }, landing: [-47271, 246098, -9120], need: { party: true, manual: 'Naia Lock 18491 (16409,244438,11620) must be below 10 % HP before "Push the button." (else the device casts Overflow); one party at a time; then 12 rooms (Ingenious Contraption "Flip the switch.", 5 min each) and the spore challenge until Epidos spawns' },
    text: 'Roof (21935,243923,11088, reached from Tully\'s Workshop 7th/8th floor via the Agent 32372 / Teleportation Cubic 32467 after Darion 25603) -> Control Device 18492 "Push the button." -> "Enter the Tower of Naia." -> (-47271,246098,-9120). GUIDE: lineage.pmfun.com Hellbound guide ("defeat Darion ... access Tower of Naia. Complete twelve rooms within five-minute limits").', src: DPS + 'hellbound/ai/zones/TowerOfNaia/TowerOfNaia.java + 18492-0*.htm + TullyWorkshop.java', read: 'datapack' },
  { key: 'four-sepulchers-exit', area: 'Four Sepulchers exit hall (Ghost of Wigoth 31454)', kind: 'quest+item+time+manual', need: { questCompleted: 'Q00620_FourGoblets (in progress)', anyItem: [I(7261), I(7262)], manual: 'clear a sepulcher in the entry phase of the hourly cycle; Ghost of Wigoth 31452 then offers "Escape" -> EXIT_LOC (169584,-91008,-2912)' },
    text: 'Ghost of Wigoth 31454 stands in a closed hall (geodata pocket of 33,782 cells): the only way in is Q620 Four Goblets "Escape" from a cleared sepulcher (31452 -> EXIT_LOC). 31454 "Ask him to send you to the entrance." -> (170000,-88250,-2912).', src: DPS + 'quests/Q00620_FourGoblets/Q00620_FourGoblets.java', read: 'datapack' },
  { key: 'fantasy-isle', area: 'Fantasy Isle / Underground Coliseum', kind: 'none', need: {}, text: 'Town gatekeepers "Teleport to Fantasy Isle (free)" (live on every big-town menu, Scripts/data/gk_live) -> one of 4 spots around (-59700,-56900,-2032); Fantasy Isle Paddies 32378 "Move to the Underground Coliseum." -> (-81896,-49589,-10352) (+ 3 more spots); the Coliseum managers / Paddies return.', src: DPS + 'ai/npc/Teleports/TeleportToFantasy + TeleportToUndergroundColiseum', read: 'datapack' },
  { key: 'race-track', area: 'Monster Race Track / Dion arena', kind: 'none', need: {}, text: 'Town gatekeepers "Move to Arena & Monster Race Track (free)" (live menus) -> (12661,181687,-3540) inside the walled race track (geodata pocket of 15,350 cells: no walk in). Race Manager 30995 returns to the previous town.', src: DPS + 'ai/npc/Teleports/TeleportToRaceTrack/TeleportToRaceTrack.java', read: 'datapack' },
  { key: 'ivory-tower-floors', area: 'Ivory Tower floors + Underground Shopping Area', kind: 'none', need: {}, text: 'Each Ivory Tower floor is a closed geodata room; the floor teleporters (Verona 30727 ground floor, Cecile 30716 / Mariell 30719 / Merian 30722 on floors 2-4, Karin 30162 in the basement) "Go to another floor." -> teleport ids 31 basement (84915,15969,-4294), 32 ground, 33 (-2809), 34 (-2293), 35 (-1776) — free.', src: DPS + 'html/teleporter/30727*.htm, 30716-1.htm, 30162-1.htm + teleport.sql 31-35', read: 'datapack' },
  { key: 'necropolis', area: 'Necropolises (Seven Signs)', dungeonKind: 'necropolis', kind: 'sevenSigns', need: { sevenSigns: { registered: true, validation: 'winner cabal == my cabal AND Seal of Avarice owner == winner' } },
    text: 'Gatekeeper Ziggurat (L2DungeonGatekeeperInstance "necro"): competition period = any registered player (cabal != none); seal validation = only the winning cabal and only when that cabal owns the Seal of Avarice (no winner = any registered player).',
    src: SRVS + 'model/actor/instance/L2DungeonGatekeeperInstance.java', read: 'server' },
  { key: 'catacomb', area: 'Catacombs (Seven Signs)', dungeonKind: 'catacomb', kind: 'sevenSigns', need: { sevenSigns: { registered: true, validation: 'winner cabal == my cabal AND Seal of Gnosis owner == winner' } },
    text: 'Gatekeeper Ziggurat ("cata"): competition period = any registered player; seal validation = only the winning cabal and only when it owns the Seal of Gnosis.',
    src: SRVS + 'model/actor/instance/L2DungeonGatekeeperInstance.java', read: 'server' },
  { key: 'disciples-anakim-lilith', area: 'Disciples Necropolis (Anakim / Lilith)', kind: 'sevenSigns', via: [P(31111), P(31112)], need: { sevenSigns: { validation: 'winner cabal == my cabal AND Seal of Avarice owner == winner; only in seal validation' } },
    text: 'Gatekeeper Spirit 31111: in the seal validation period the Dawn winners holding Avarice go to Lilith\'s side, Dusk to Anakim; otherwise refused.', src: DPS + 'ai/npc/Teleports/GatekeeperSpirit/GatekeeperSpirit.java', read: 'datapack' },
  { key: 'hunting-grounds-priests', area: 'Dawn / Dusk priest teleports', kind: 'sevenSigns', need: { sevenSigns: { registered: true } },
    text: 'Priests of Dawn/Dusk (31078-31091, 31168/31169, 31692-31695, 31997/31998) teleport only registered players; Seal of Gnosis owners get the cheap list.', src: DPS + 'ai/npc/Teleports/HuntingGroundsTeleport/HuntingGroundsTeleport.java', read: 'datapack' },
  { key: 'four-sepulchers', area: 'Four Sepulchers / Imperial Tomb', kind: 'item+time', via: [P(31919), P(31920)], landing: [178127, -84435, -7215],
    need: { anyItem: [I(7261, true), I(7262)], window: { everyHourAtMinute: 55, entryMinutes: 'config TimeOfEntry', note: 'FourSepulchersManager _newCycleMin 55: entry phase after the cool-down that ends at :55' } },
    text: 'Elmoreden\'s Ghost Chamberlain 31919/31920 teleport to the Four Sepulchers (178127,-84435,-7215) or the Imperial Tomb (186699,-75915,-2826) for a Used Grave Pass 7261 (taken) or with an Antique Brooch 7262. The sepulcher halls themselves only take parties during the entry phase of the hourly cycle.',
    src: DPS + 'ai/npc/Teleports/GhostChamberlainOfElmoreden/GhostChamberlainOfElmoreden.java + ' + SRVS + 'instancemanager/FourSepulchersManager.java', read: 'datapack' },
  { key: 'noblesse-teleport', area: 'Noblesse-only gatekeeper links', kind: 'noble', need: { noble: true, orItem: I(13722) },
    text: 'Gatekeeper "(Nobless only) Teleport" pages: nobles only; an Olympiad Token 13722 pays for the token list.', src: DPS + 'ai/npc/Teleports/NoblesseTeleport/NoblesseTeleport.java', read: 'datapack' },
  { key: 'stakato-nest', area: 'Stakato Nest (Kintaijin teleports)', kind: 'quest', via: P(32640), need: { questCompleted: 'Q00240_ImTheOnlyOneYouCanTrust' },
    text: 'Kintaijin 32640 teleports (with the party) inside the Stakato Nest only after quest 240 I\'m the Only One You Can Trust is completed; walking in is free.', src: DPS + 'ai/npc/Teleports/StakatoNestTeleporter/StakatoNestTeleporter.java', read: 'datapack' },
  { key: 'separated-soul', area: 'Dragon Valley / Antharas\' Lair teleports (Separated Soul)', kind: 'level', need: { level: { min: 80 } },
    text: 'Separated Soul teleports to the Dragon Valley / Antharas lair spots only at level >= 80.', src: DPS + 'ai/npc/Teleports/SeparatedSoul/SeparatedSoul.java', read: 'datapack' },
  { key: 'klemis', area: 'Klemis teleport', kind: 'level', via: P(32734), landing: [-180218, 185923, -10576], need: { level: { min: 80 } }, text: 'Klemis 32734: level >= 80.', src: DPS + 'ai/npc/Teleports/Klemis/Klemis.java', read: 'datapack' },
  { key: 'gracia-survivor', area: 'Gracia (Keucereus base)', kind: 'level+adena', via: P(32632), landing: [-149406, 255247, -80], need: { level: { min: 75 }, adena: 150000 },
    text: 'Gracian Survivor 32632: level >= 75 and 150,000 adena.', src: DPS + 'ai/npc/Teleports/Survivor/Survivor.java', read: 'datapack' },
  { key: 'strongholds', area: 'Kamael strongholds teleports', kind: 'level', need: { level: { max: 19 } }, text: 'Strongholds teleporters: only below level 20.', src: DPS + 'ai/npc/Teleports/StrongholdsTeleports/StrongholdsTeleports.java', read: 'datapack' },
  { key: 'mithril-mine-instance', area: 'Mithril Mine (quest instance)', kind: 'instance+item', via: [P(32653), P(32654)], need: { items: [I(15514)] },
    text: 'Krun 32653 / Tarun 32654 open the Mithril Mine quest instance (template 138) only for a holder of Cold Resistance Potion 15514; the normal Mithril Mines are reached by the Teleport Crystals 32652.', src: DPS + 'instances/MithrilMine/MithrilMine.java', read: 'datapack' },
  { key: 'kamaloka', area: 'Kamaloka (instances)', kind: 'instance+party+level+daily', need: { party: true, levelSpread: 5, dailyReset: '06:30' }, text: 'Kamaloka: party size limit per hall/labyrinth, every member within 5 levels of the instance level, one entry per day (reset 06:30).', src: DPS + 'instances/Kamaloka/Kamaloka.java', read: 'datapack' },
  { key: 'nornils-garden', area: 'Nornil\'s Garden (instance)', kind: 'instance+level', need: { level: { min: 18, max: 22 } }, text: 'Nornil\'s Garden: level 18-22, party.', src: DPS + 'instances/NornilsGarden/NornilsGarden.java', read: 'datapack' },
  { key: 'dark-cloud-mansion', area: 'Dark Cloud Mansion (instance)', kind: 'instance+level+party', need: { level: { min: 78 }, party: { max: 2 } }, text: 'Dark Cloud Mansion: at most 2 in the party, level >= 78.', src: DPS + 'instances/DarkCloudMansion/DarkCloudMansion.java', read: 'datapack' },
  { key: 'hellbound', area: 'Hellbound (island)', kind: 'quest+level', fieldTp: true, via: P(32314), landing: [-11272, 236464, -3248], need: { questCompleted: 'Q00130_PathToHellbound or Q00133_ThatsBloodyHot', level: { min: 78 } },
    text: 'Warpgate 32314 (next to the Wastelands landing and at Heine) teleports into Hellbound only after Path to Hellbound (Q130) or Thats Bloody Hot (Q133) is completed (both start at level 78); everyone else is sent back to the Wastelands (Hellbound zone check every entry).', src: DPS + 'hellbound/ai/npc/Warpgate/Warpgate.java', read: 'datapack' },
  { key: 'gracia-wharf', area: 'Gracia (Keucereus wharf)', kind: 'note', need: {},
    text: 'The Survivor / airship landing (-149406,255247) is a closed platform on the geodata (33k cells, no walk to the Keucereus base, Lionel 32782 / Dilios): the way on (airship / NPC) needs a live check. Keucereus teleporters (Lionel 32782, 32534, 32539, 32774, 36570) then go to the Seed docks (150k).', src: DPS + 'ai/npc/Teleports/Survivor/Survivor.java + html/teleporter/32782-1.htm; geodata pocket test (nav_atlas 2026-10-12)', read: 'inferred' },
  { key: 'teleport-with-charm', area: 'Orc / Dwarf gatekeeper charm teleports', kind: 'item', need: { items: [I(1658, true), I(1659, true)] }, text: 'Gatekeepers Wirphy 30540 (Dwarf Gatekeeper Token 1659) / Tamil 30576 (Orc Gatekeeper Charm 1658) teleport to Gludin for the item (taken).', src: DPS + 'ai/npc/Teleports/TeleportWithCharm/TeleportWithCharm.java', read: 'datapack' },
];
// boss zones -> conditions (every enabled zone ousts walk-ins)
bossZones.filter(z => z.enabled).forEach(z => conditions.push({ key: 'bosszone-' + z.id, area: z.name, kind: 'bossZone', zoneId: z.id, need: { allowedByScript: true },
  text: `BossZone "${z.name}" (${z.id}) is enabled by default: walking in without the boss script letting you in = teleported out.`, src: DPS + z.src + ' + ' + SRVS + 'model/zone/type/L2BossZone.java', read: 'server' }));

// ---------- write ----------
const byKind = {}; doors.forEach(d => { byKind[d.kind] = (byKind[d.kind] || 0) + 1; });
const out = {
  generated: new Date().toISOString(), tool: 'docs/plan/tools/nav_doors.js', tullyDoors: TULLY_DOORS, hellboundDoors: HB_DOORS,
  sources: { doors: HAVE_DP ? rel(path.join(DPD, 'doors.xml')) : 'Scripts/data/dp/doors.xml', datapack: 'github.com/Shagooh/l2j-server-datapack', server: 'github.com/Shagooh/l2j-server-game (L2DoorInstance, L2DoorTemplate, DoorData, L2BossZone, L2DungeonGatekeeperInstance, FourSepulchersManager)', fromClone: HAVE_DP },
  semantics: { openMethodBits: BIT, blocks: 'default closed + check_collision != false: a walk crossing its polygon between zMin and zMax is stopped (DoorData.checkIfDoorsBetween)',
    timer: 'L2DoorInstance.TimerOpen (see doors[].timed.rule)', autoCloseSec: 'close_time on a door without the timer bit = it closes this many seconds after something opened it (L2DoorInstance.startAutoCloseTask)' },
  stats: { doors: doors.length, blocking: doors.filter(d => d.blocks).length, byKind, timed: doors.filter(d => d.timed).length, unlockable: doors.filter(d => d.unlock).length, keyed: doors.filter(d => d.keys && d.keys.length).length, scripted: doors.filter(d => d.scripts).length, inInstances: doors.filter(d => d.instances).length, bossZones: bossZones.length, conditions: conditions.length },
  unlock, keySkills, bossZones, conditions, doors,
  // extracted parts kept for runs without the clone
  itemNames: Object.fromEntries([...new Set([].concat(keySkills.map(k => k.consumes && k.consumes.id), conditions.flatMap(c => JSON.stringify(c.need).match(/"id":(\d+)/g) || []).map(s => s.split(':')[1]), [1661]))].filter(Boolean).map(id => [id, iname(id)])),
  scriptRefs, instDoors,
};
const tmp = OUT + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(out)); fs.renameSync(tmp, OUT);
console.log(`nav_doors: ${doors.length} doors (${out.stats.blocking} blocking), kinds ${JSON.stringify(byKind)}; timed ${out.stats.timed}, unlock ${out.stats.unlockable}, keyed ${out.stats.keyed}, scripted ${out.stats.scripted}; ${keySkills.length} key skills; ${bossZones.length} boss zones; ${conditions.length} conditions${HAVE_DP ? '' : ' (no datapack clone: reused extracted parts)'}`);
