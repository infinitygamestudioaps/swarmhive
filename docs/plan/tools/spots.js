// Rank H5 hunting grounds from L2J datapack npc stats + spawnlist.
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// node spots.js  -> writes hunting_spots_h5.json, leveling_spots.md, zones/*.zmap
const fs = require('fs');
const path = require('path');
const DATA = __ROOT + '/Scripts/data';
const PLAN = __ROOT + '/docs/plan';

// ---- npc stats ------------------------------------------------------------
const npcs = {};
for (const f of fs.readdirSync(`${DATA}/npcstats`)) {
  const xml = fs.readFileSync(`${DATA}/npcstats/${f}`, 'utf8');
  const re = /<npc\s+([^>]*)>([\s\S]*?)<\/npc>/g;
  let m;
  while ((m = re.exec(xml))) {
    const a = m[1], body = m[2];
    const attr = (s, k) => { const r = new RegExp(`${k}="([^"]*)"`).exec(s); return r ? r[1] : null; };
    const id = +attr(a, 'id');
    const type = attr(a, 'type');
    const level = +attr(a, 'level') || 0;
    const name = attr(a, 'name') || '';
    const vit = /<vitals\s+([^>]*)\/>/.exec(body);
    const hp = vit ? +attr(vit[1], 'hp') : 0;
    const acq = /<acquire\s+([^>]*)\/>/.exec(body);
    const expRate = acq ? +(attr(acq[1], 'expRate') || 0) : 0;
    const sp = acq ? +(attr(acq[1], 'sp') || 0) : 0;
    const ai = /<ai\s+([^>]*)>/.exec(body) || /<ai\s+([^>]*)\/>/.exec(body);
    const aggroRange = ai ? +(attr(ai[1], 'aggroRange') || 0) : 0;
    const aggrAttr = ai ? attr(ai[1], 'isAggressive') : null;
    const aggressive = aggroRange > 0 && aggrAttr !== 'false';
    const race = (/<race>(\w+)<\/race>/.exec(body) || [])[1] || '';
    const atk = /<attack\s+([^>]*)\/>/.exec(body);
    const patk = atk ? +attr(atk[1], 'physical') : 0, matk = atk ? +attr(atk[1], 'magical') : 0;
    const status = /<status\s+([^>]*)\/>/.exec(body);
    const attackable = !(status && attr(status[1], 'attackable') === 'false');
    const magicSkills = (body.match(/<skill id="\d+"[^>]*\/>\s*<!--\s*([^-]*?)\s*-->/g) || [])
      .filter(s => /Bolt|Wind Strike|Hydro|Fire|Ice|Lightning|Shock|Drain|Curse|Poison|Bleed|Paralysis|Sleep|Stun|Root/i.test(s)).length;
    npcs[id] = {
      id, type, level, name, hp, expRate, sp, exp: Math.round(level * level * expRate),
      aggressive, aggroRange, race, patk, matk, attackable, magicSkills,
    };
  }
}

// ---- spawns ---------------------------------------------------------------
let spawns = JSON.parse(fs.readFileSync(`${DATA}/spawns_h5.json`, 'utf8').replace(/^\uFEFF/, ''));
spawns = spawns.filter(s => {
  const n = npcs[s.id];
  return n && n.type === 'L2Monster' && n.attackable && n.level > 0 && n.hp > 0 && n.exp > 0;
}).map(s => ({ ...s, n: npcs[s.id] }));
// drop instance / far-off coordinates (instances live outside the world map)
spawns = spawns.filter(s => s.x > -300000 && s.x < 300000 && s.y > -300000 && s.y < 300000);

// ---- teleports (town gatekeepers -> destination) ---------------------------
const tps = JSON.parse(fs.readFileSync(`${DATA}/teleports_h5.json`, 'utf8').replace(/^\uFEFF/, ''))
  .filter(t => /->/.test(t.desc) && !/Clan Hall|Castle|Fortress|Olympiad|Noble|Token|Gatekeeper ->|Underground|Coliseum/i.test(t.desc) && t.price > 0);

function nearestTp(x, y) {
  let best = null, bd = 1e12;
  for (const t of tps) {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < bd) { bd = d; best = t; }
  }
  return best ? { ...best, dist: Math.round(bd) } : null;
}

// ---- clustering: grid cells + connected components, split by level -------
const CELL = 1000;
const LEVEL_BUCKET = 6;              // keep level-coherent groups apart
const cells = new Map();
for (const s of spawns) {
  const key = `${Math.floor(s.x / CELL)},${Math.floor(s.y / CELL)},${Math.floor(s.n.level / LEVEL_BUCKET)}`;
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key).push(s);
}
const seen = new Set();
const clusters = [];
for (const key of cells.keys()) {
  if (seen.has(key)) continue;
  const [cx, cy, lb] = key.split(',').map(Number);
  const stack = [[cx, cy]]; const members = []; let nCells = 0;
  seen.add(key);
  while (stack.length) {
    const [x, y] = stack.pop();
    const k = `${x},${y},${lb}`;
    members.push(...cells.get(k)); nCells++;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const nk = `${x + dx},${y + dy},${lb}`;
      if (!seen.has(nk) && cells.has(nk)) { seen.add(nk); stack.push([x + dx, y + dy]); }
    }
  }
  if (members.length >= 8) clusters.push({ members, nCells });
}
// split clusters whose cells are sparse (chain artefacts): keep only cells with >=2 mobs
for (const c of clusters) {
  const byCell = {};
  for (const s of c.members) { const k = Math.floor(s.x / CELL) + ',' + Math.floor(s.y / CELL); (byCell[k] = byCell[k] || []).push(s); }
  const dense = Object.values(byCell).filter(a => a.length >= 2);
  if (dense.length) { c.members = [].concat(...dense); c.nCells = dense.length; }
}

function median(a) { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

function hull(points) {
  const p = points.map(s => [s.x, s.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function polyArea(h) { let a = 0; for (let i = 0; i < h.length; i++) { const [x1, y1] = h[i], [x2, y2] = h[(i + 1) % h.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a / 2); }
function pad(h, by) {
  const cx = h.reduce((s, p) => s + p[0], 0) / h.length, cy = h.reduce((s, p) => s + p[1], 0) / h.length;
  return h.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1; return [x + (x - cx) / d * by, y + (y - cy) / d * by]; });
}

const spots = clusters.map(c => {
  const m = c.members;
  const levels = m.map(s => s.n.level);
  const lvMed = median(levels);
  const cx = Math.round(m.reduce((s, q) => s + q.x, 0) / m.length);
  const cy = Math.round(m.reduce((s, q) => s + q.y, 0) / m.length);
  const cz = Math.round(median(m.map(q => q.z)));
  const h = hull(m);
  const areaKm2 = Math.max(polyArea(h) / 1e6, (c.nCells * CELL * CELL) / 1e6 * 0.25, 0.3);
  const density = m.length / areaKm2;
  const expPerHp = median(m.map(s => s.n.exp / s.n.hp));
  const avgExp = m.reduce((s, q) => s + q.n.exp, 0) / m.length;
  const avgHp = m.reduce((s, q) => s + q.n.hp, 0) / m.length;
  const aggroShare = m.filter(s => s.n.aggressive).length / m.length;
  const undeadShare = m.filter(s => s.n.race === 'UNDEAD').length / m.length;
  const casterShare = m.filter(s => s.n.matk > s.n.patk * 1.3 || s.n.magicSkills >= 2).length / m.length;
  const byId = {};
  for (const s of m) { byId[s.id] = byId[s.id] || { id: s.id, name: s.n.name || s.name, level: s.n.level, count: 0, hp: Math.round(s.n.hp), exp: s.n.exp, aggressive: s.n.aggressive }; byId[s.id].count++; }
  const mobs = Object.values(byId).sort((a, b) => b.count - a.count);
  const tp = nearestTp(cx, cy);
  return {
    levelMin: Math.min(...levels), levelMax: Math.max(...levels), levelMedian: lvMed,
    center: { x: cx, y: cy, z: cz }, count: m.length, areaKm2: +areaKm2.toFixed(2),
    density: +density.toFixed(1), expPerHp: +expPerHp.toFixed(3), avgExp: Math.round(avgExp), avgHp: Math.round(avgHp),
    aggroShare: +aggroShare.toFixed(2), undeadShare: +undeadShare.toFixed(2), casterShare: +casterShare.toFixed(2),
    mobs, hull: pad(h, 250).map(([x, y]) => [Math.round(x), Math.round(y)]),
    gk: tp ? { from: tp.desc.split('->')[0].trim(), desc: tp.desc, x: tp.x, y: tp.y, z: tp.z, price: tp.price, dist: tp.dist } : null,
  };
});

// ---- area names (known H5 hunting grounds, approximate centers) ------------
const AREAS = [
  ['Talking Island / Elven Ruins area', -84000, 236000], ['Elven Ruins', -112000, 235000], ['Singing Waterfall', -111000, 245000],
  ['Kamael Isle (Soul Harbor area)', -110000, 50000], ['Kamael Village outskirts', -118000, 47000],
  ['Wasteland', -20000, 210000], ['Wasteland (West)', -47500, 179500], ['Langk Lizardmen Dwellings', -24000, 213000],
  ['Windmill Hill', -75000, 168000], ['Fellmere Harvesting Grounds', -64000, 102000], ['Ruins of Agony', -41248, 122848],
  ['Ruins of Despair', -19000, 136000], ['Abandoned Camp', -49853, 147089], ['Orc Barracks', -89000, 105000],
  ['Ant Nest', -20000, 180000], ['Ant Nest (entrance)', -9993, 176457], ['Pagan Temple (needs Visitor Mark)', -16459, -56747], ['Evil Hunting Grounds', -6990, 110000], ['Neutral Zone', -10000, 75000],
  ['Windawood Manor', -25000, 160000], ['Forgotten Temple', -54000, 179000], ['Gludio Airship Field', -149000, 255000],
  ['Execution Grounds', 50568, 152408], ['Cruma Marshlands', 5106, 126916], ['Cruma Tower', 17225, 114173],
  ['Plains of Dion', 630, 179184], ['Fortress of Resistance', 47382, 111278], ['Bee Hive', 20505, 189036],
  ['Floran Agricultural Area', 26810, 172787], ['Hardin\'s Academy', 105918, 109759], ['Death Pass', 70000, 126636],
  ['Dragon Valley', 73024, 118485], ['Antharas Lair', 131557, 114509], ['Breka\'s Stronghold', 79798, 152626],
  ['Gorgon Flower Garden', 113553, 134813], ['Tower of Insolence', 114649, 11115], ['Sea of Spores', 64328, 26803],
  ['Enchanted Valley', 124904, 61992], ['Forest of Mirrors', 150477, 85907], ['Plains of the Lizardmen', 87252, 85514],
  ['Timak Outpost', 67097, 68815], ['Ivory Tower area', 85391, 16228], ['Outlaw Forest', 91539, -12204],
  ['Blazing Swamp', 146489, -20120], ['Field of Silence', 82000, 189000], ['Field of Whispers', 90000, 214000],
  ['Alligator Island', 115583, 192261], ['Garden of Eva', 84413, 234334], ['Valley of Saints', 67992, -72012],
  ['Forge of the Gods', 169018, -116303], ['Beast Farm', 43805, -88010], ['Ketra Orc Outpost', 146990, -67128],
  ['Varka Silenos Stronghold', 125740, -40864], ['Hot Springs', 144880, -113468], ['Wall of Argos', 165054, -47861],
  ['Den of Evil', 68693, -110438], ['Crypts of Disgrace', 47692, -115745], ['Pavel Ruins', 91280, -117152],
  ['Frozen Labyrinth', 113903, -108752], ['Sel Mahum Training Grounds', 76839, 63851], ['Fields of Massacre', 179718, -7843],
  ['Silent Valley', 177318, 48447], ['Swamp of Screams', 69340, -50203], ['Monastery of Silence', 106414, -87799],
  ['Stakato Nest', 89513, -44800], ['Primeval Isle', 10468, -24569], ['Isle of Prayer', 149518, 195280],
  ['Dragon Valley (inner)', 85000, 112000], ['Imperial Tomb', 186699, -75915], ['Lost Nest', 26174, -17134],
  ['Ruins of Agony (south)', -42000, 119000], ['Orc Barracks / Gludio North', -83000, 104000],
  ['Elven Forest', 25000, 50000], ['Dark Elven Forest', -22000, 47000], ['School of Dark Arts', -47000, 49000],
  ['Swampland', -18000, 45000], ['Orc Village outskirts', -56000, -113000], ['Dwarven Village outskirts', 116000, -178000],
  ['Abandoned Coal Mines', 139000, -177000], ['Mithril Mines', 175000, -184000], ['Plunderous Plains', -20000, -150000],
  ['Frozen Waterfalls', 7000, -137000], ['Cedric\'s Training Hall', -71000, 258000],
];
const REGIONS = JSON.parse(fs.readFileSync(`${DATA}/map_regions.json`, 'utf8').replace(/^\uFEFF/, '')).filter(r => r.name);
function regionOf(x, y, z) {
  const tx = Math.floor(x / 32768) + 20, ty = Math.floor(y / 32768) + 18;
  const hits = REGIONS.filter(r => r.tx === tx && r.ty === ty && z >= r.zmin && z <= r.zmax);
  hits.sort((a, b) => (a.zmax - a.zmin) - (b.zmax - b.zmin));
  return hits.length ? hits[0].name : null;
}
for (const s of spots) {
  s.region = regionOf(s.center.x, s.center.y, s.center.z);
  s.dungeon = /Catacomb|Necropolis|Dark Omens/i.test(s.region || '') || s.mobs.some(m => /^(Lith |Catacomb |Gigant |Grave Keeper|Necropolis)/.test(m.name));
}
for (const s of spots) {
  let best = null, bd = 1e12;
  for (const [n, x, y] of AREAS) { const d = Math.hypot(x - s.center.x, y - s.center.y); if (d < bd) { bd = d; best = n; } }
  const tpName = s.gk ? s.gk.desc.split('->')[1].trim() : '';
  const near = bd < 7000 ? best : (s.gk && s.gk.dist < 7000 ? tpName : null);
  s.name = (bd < 6000) ? best : s.region
    ? (near && !s.region.toLowerCase().includes(near.split(' ')[0].toLowerCase()) ? `${s.region} — ${near}` : s.region)
    : (near || `Area @${s.center.x},${s.center.y}`);
}
// unique names
const nameCount = {};
for (const s of spots) { nameCount[s.name] = (nameCount[s.name] || 0) + 1; }
const nameIdx = {};
for (const s of spots.sort((a, b) => b.count - a.count)) {
  if (nameCount[s.name] > 1) { nameIdx[s.name] = (nameIdx[s.name] || 0) + 1; s.name = `${s.name} (Lv${s.levelMin}-${s.levelMax})`; }
}

// ---- scores ----------------------------------------------------------------
// party: lots of mobs, dense, good exp/hp; aggro is OK (tank pulls), casters slightly bad.
// solo: non-aggro, low hp relative to level, decent density, low caster share.
const maxBy = (arr, f) => Math.max(...arr.map(f));
for (const s of spots) {
  const sizeTerm = Math.log10(s.count + 1);
  const dens = Math.min(s.density, 400);
  s.partyScore = +(sizeTerm * Math.sqrt(dens) * s.expPerHp * (1 - 0.25 * s.casterShare) * 10).toFixed(2);
  s.soloScore = +(Math.sqrt(Math.min(s.density, 150)) * s.expPerHp * (1 - 0.7 * s.aggroShare) * (1 - 0.4 * s.casterShare) * 10).toFixed(2);
}

const BANDS = [[1, 20], [20, 30], [30, 40], [40, 52], [52, 61], [61, 76], [76, 85]];
const inBand = (s, [a, b]) => s.levelMedian >= (a === 1 ? 1 : a + 1) && s.levelMedian <= Math.min(b + 1, 85);
const NOT_FARMABLE = new RegExp("Imperial Tomb|Zaken|Seed of|Delusion|Jail|Kamaloka|Crystal Caverns|Antharas|Valakas|Baium|Frintezza|Sepulcher", "i");

// ---- outputs ---------------------------------------------------------------
const out = spots
  .filter(s => s.count >= 10 && !NOT_FARMABLE.test(s.name || "") && !(s.center.y > 230000 && s.center.x > -40000 && s.center.x < 10000))   // Hellbound island
  .sort((a, b) => a.levelMedian - b.levelMedian)
  .map(s => ({
    name: s.name, levelMin: s.levelMin, levelMax: s.levelMax, levelMedian: s.levelMedian,
    center: s.center, gk: s.gk, mobs: s.mobs.slice(0, 12).map(m => ({ id: m.id, name: m.name, level: m.level, count: m.count, hp: m.hp, exp: m.exp, aggressive: m.aggressive })),
    count: s.count, areaKm2: s.areaKm2, density: s.density, expPerHp: s.expPerHp, avgExp: s.avgExp, avgHp: s.avgHp,
    aggroShare: s.aggroShare, undeadShare: s.undeadShare, casterShare: s.casterShare,
    partyScore: s.partyScore, soloScore: s.soloScore, region: s.region, dungeon: s.dungeon, hull: s.hull,
  }));
// POLYEDIT 2026-10-08: locked + atomic; spots edited on the dashboard (manual: true) are kept (matched by name + original centre, manual_guard.js)
require('./manual_guard').writeGuarded(`${DATA}/hunting_spots_h5.json`, out, 'spot', { indent: 1 });

const fileSafe = n => n.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
function writeZmap(s) {
  const pts = s.hull.map(([x, y]) => `      <point x="${x}" y="${y}" />`).join('\n');
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<zone>\n  <ExternalPoly>\n    <points>\n${pts}\n    </points>\n  </ExternalPoly>\n  <InternalPolies />\n</zone>\n`;
  const f = `${PLAN}/zones/${fileSafe(s.name)}.zmap`;
  fs.writeFileSync(f, xml);
  return path.basename(f);
}
fs.mkdirSync(`${PLAN}/zones`, { recursive: true });
for (const z of fs.readdirSync(`${PLAN}/zones`)) if (z.endsWith('.zmap')) fs.unlinkSync(`${PLAN}/zones/${z}`);

// Known H5 meta per band (sanity check / human notes; not data-derived).
const META = {
  '1-20': 'CURRENT SPOT: the team (Lv11-12) farms Langk Lizardmen Dwellings in the Wasteland (-24100, 213200; Gludin -> Wastelands 3400 a). Datapack levels there: Hungry Eye 22, Langk Lizardman Lieutenant 22, Langk Lizardman Sentinel 19, Langk Lizardman 15 — i.e. +10 over the team (big exp per kill, but the L2J spawnlist has only ~23 rows there, so it ranks low here; live density on L2Toggle is higher). Keep it until ~20. Retail meta: newbie areas to ~10, then Gludin side — Wasteland (Langk Lizardmen, where the team is now) and Windmill Hill/Fellmere. Kamael start isle (Stronghold I) is very fast 1–10. Use Adventurer\'s Guide/Newbie Helper buffs + Supply Box quests.',
  '20-30': 'Retail meta: Ruins of Agony / Ruins of Despair (undead, good for healers), Windawood Manor, Abandoned Camp, Orc Barracks. Necropolis of Sacrifice (next to Langk Lizardmen Dwelling GK) is the classic 20–30 Seven Signs dungeon.',
  '30-40': 'Retail meta: Ant Nest (aggro ant packs, great for a tanked party), Cruma Marshlands → Cruma Tower 1F, Execution Grounds, Sea of Spores starts ~35. Pilgrim\'s Necropolis 30–40.',
  '40-52': 'Retail meta: Cruma Tower 2F/3F, Enchanted Valley (48–52), Forest of Mirrors, Ivory Tower Crater, Branded Catacomb 40–50. Kamaloka (Hall of the Abyss) instances daily.',
  '52-61': 'Retail meta: Tower of Insolence lower floors, Valley of Saints, Forest of Mirrors / Witch Catacomb, Apostate Catacomb 50–60, Kamaloka 53/56/59/63.',
  '61-76': 'Retail meta: Tower of Insolence (Hallate floors), Varka/Ketra outposts, Dragon Valley (66–75, party), Sea of Spores / Field of Silence & Whispers (Sel Mahum/Monastery) for solo, Primeval Isle 76+. Kamaloka 66/69/73. Devotion/Disciple\'s necropolises.',
  '76-85': 'Retail meta: Den of Evil, Crypts of Disgrace (76+), Stakato Nest (78–80), Dragon Valley inner, Primeval Isle, Hellbound (trust level), Seed of Infinity/Destruction (instances), Plains of the Lizardmen, Fields of Massacre, Monastery of Silence. These are often under-represented in L2J spawnlist.sql (spawn territories), so check live.',
};

const fmtMobs = s => s.mobs.slice(0, 5).map(m => `${m.name} ${m.level}${m.aggressive ? '*' : ''} ×${m.count}`).join(', ');
const risks = s => [
  s.aggroShare > 0.5 ? `${Math.round(s.aggroShare * 100)}% aggro` : null,
  s.casterShare > 0.3 ? `${Math.round(s.casterShare * 100)}% casters` : null,
  s.undeadShare > 0.5 ? 'undead (heal-dmg/holy weak)' : null,
  s.dungeon ? 'Seven Signs catacomb/necropolis (entry rules)' : null,
].filter(Boolean).join(', ') || '—';
const gkLine = s => s.gk ? `${s.gk.desc} (${s.gk.price} a) → ${s.gk.dist} from landing (${s.gk.x}, ${s.gk.y})` : 'no GK';

let md = `# Leveling spots — High Five (data-ranked)\n\n` +
  `Generated ${new Date().toISOString().slice(0, 10)} by \`docs/plan/tools/spots.js\` from the L2J H5 datapack ` +
  `(stats/npcs + spawnlist, github.com/Shagooh/l2j-server-datapack). L2Toggle may differ (rates, custom spawns) — verify live before moving the team.\n\n` +
  `**Method.** Monster spawns grouped into hunting grounds (${CELL}×${CELL} grid cells, connected, split by level bucket of ${LEVEL_BUCKET}). Per ground: mob count, density (mobs/km² of the convex hull), exp/HP (exp = level² × expRate), aggro/caster/undead share, nearest town-gatekeeper landing.\n` +
  `- **partyScore** = log10(count) × √density × exp/HP × (1 − 0.25·casterShare) × 10 → big, dense, efficient grounds (aggro is fine with a tank).\n` +
  `- **soloScore** = √min(density,150) × exp/HP × (1 − 0.7·aggroShare) × (1 − 0.4·casterShare) × 10 → passive, efficient mobs.\n` +
  `- Ground fits a band if its median mob level is within band (+2 above top). Raid/instance areas (Imperial Tomb, Zaken, Seeds, Hellbound, epic lairs) excluded; Seven Signs dungeons listed separately. Note: the L2J spawnlist under-represents some areas (spawn territories), so retail-meta notes follow each band. Party rule of thumb: mobs at your level +2..+5. \`*\` = aggressive.\n` +
  `- Zone files for the top party spots: \`docs/plan/zones/*.zmap\` (padded convex hull, same format as \`Settings/fightzone_under20.zmap\`).\n\n`;

const zoneWritten = new Set();
for (const band of BANDS) {
  const all = out.filter(s => inBand(s, band));
  const cand = all.filter(s => !s.dungeon);
  const dung = all.filter(s => s.dungeon).sort((a, b) => b.partyScore - a.partyScore).slice(0, 3);
  const party = cand.slice().sort((a, b) => b.partyScore - a.partyScore).slice(0, 5);
  const solo = cand.slice().sort((a, b) => b.soloScore - a.soloScore).slice(0, 3);
  md += `## Level ${band[0]}–${band[1]}\n\n### Party (9-man) — top ${party.length}\n\n`;
  md += `| # | Spot | Mob Lv | Center (x, y, z) | Mobs / km² | exp/HP | Gatekeeper route | Main mobs | Risks | Zone |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  party.forEach((s, i) => {
    let z = '';
    if (!zoneWritten.has(s.name)) { z = writeZmap(s); zoneWritten.add(s.name); } else z = `${fileSafe(s.name)}.zmap`;
    md += `| ${i + 1} | **${s.name}** | ${s.levelMin}–${s.levelMax} (med ${s.levelMedian}) | ${s.center.x}, ${s.center.y}, ${s.center.z} | ${s.count} / ${s.density} | ${s.expPerHp} | ${gkLine(s)} | ${fmtMobs(s)} | ${risks(s)} | \`${z}\` |\n`;
  });
  md += `\n### Solo — top ${solo.length}\n\n| # | Spot | Mob Lv | Center | exp/HP | Aggro | Gatekeeper route | Main mobs |\n|---|---|---|---|---|---|---|---|\n`;
  solo.forEach((s, i) => {
    md += `| ${i + 1} | **${s.name}** | ${s.levelMin}–${s.levelMax} | ${s.center.x}, ${s.center.y}, ${s.center.z} | ${s.expPerHp} | ${Math.round(s.aggroShare * 100)}% | ${gkLine(s)} | ${fmtMobs(s)} |\n`;
  });
  if (dung.length) {
    md += `\n### Seven Signs catacombs / necropolises (high exp/HP; entry needs Seven Signs participation; hard-hitting, often aggro)\n\n| Spot | Mob Lv | Center | exp/HP | Gatekeeper route | Main mobs |\n|---|---|---|---|---|---|\n`;
    dung.forEach(s => { md += `| **${s.name}** | ${s.levelMin}–${s.levelMax} | ${s.center.x}, ${s.center.y}, ${s.center.z} | ${s.expPerHp} | ${gkLine(s)} | ${fmtMobs(s)} |\n`; });
  }
  md += `\n> **H5 meta check:** ${META[`${band[0]}-${band[1]}`] || ''}\n\n`;
}
fs.writeFileSync(`${PLAN}/leveling_spots.md`, '﻿' + md);
console.log(`npcs ${Object.keys(npcs).length}, monster spawns ${spawns.length}, grounds ${out.length}, zones ${zoneWritten.size}`);
