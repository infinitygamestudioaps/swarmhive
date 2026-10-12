// NAV ATLAS REPORT: docs/plan/nav_atlas_report.md from the routes nav_atlas.js just wrote (also: node nav_atlas_report.js = from the files).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), OUTDIR = path.join(ROOT, 'Scripts', 'data', 'nav_atlas');
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\r?\n/g, ' ');
function needText(n) {
  if (!n) return '';
  if (n.wait) return `wait: closed ${n.wait.closedFor.join('-')} s, open ${n.wait.openFor.join('-')} s (expected wait ~${n.wait.expectSec} s)`;
  if (n.npc) return 'talk to ' + n.npc.map(x => `${x.name} ${x.id}`).join(' / ') + (n.closesAfterSec ? ` (open ${n.closesAfterSec} s)` : '');
  if (n.items) return 'key item ' + n.items.map(i => `${i.name} ${i.id}`).join(' / ') + (n.unlock ? ' or Unlock 27' : '');
  if (n.unlock) return 'Unlock 27 (Rogue / Treasure Hunter / Elven Scout / Plains Walker / Assassin / Abyss Walker lines)';
  return 'blocked: ' + (n.why || (n.owner ? 'owner only (' + n.owner + ')' : '') || (n.script || []).join('; ') || (n.instance ? 'instance door: ' + n.instance.join(', ') : ''));
}
function write(routes, index) {
  const doors = (() => { try { return J(path.join(ROOT, 'Scripts', 'data', 'nav_doors.json')); } catch (e) { return { doors: [], stats: {} }; } })();
  const L = [], types = ['raid', 'epic', 'npc', 'area', 'room', 'dungeon'];
  const by = (t) => routes.filter(r => r.type === t);
  L.push('# Nav atlas report', '', `Generated ${new Date().toISOString()} by docs/plan/tools/nav_atlas.js (routes: Scripts/data/nav_atlas/*.json; doors + conditions: Scripts/data/nav_doors.json from docs/plan/tools/nav_doors.js).`, '',
    'Every target has a route = a state machine of steps (town -> gk -> walk -> door -> floor -> enter -> arrive). Status: **ok** = every walk on the geodata (geopath.js), a saved route or a graph, every gatekeeper link on a recorded live menu (or none needed), no conditions; **unverified** = a walk is only a straight line (geopath gave up / not computed yet) or a link is not on the recorded live menu; **conditional** = needs items / level / Seven Signs / party / boss state (listed per route); **blocked** = a closed door on the way the party cannot open; **unreachable** = no route.',
    '', 'READ vs INFERRED: door kinds come straight from doors.xml (open_method bits, timers) and the datapack scripts that call openDoor / closeDoor; every entry condition names its source file and whether it was read from the datapack, the server core, or inferred (column "Read from"). Times are seconds.', '');
  L.push('## Counts per target type', '', '| Type | Targets | ok | unverified | conditional | blocked | unreachable | saved routes | walk legs on geodata / graph / saved | straight legs |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const t of types) {
    const R = by(t); if (!R.length) continue; const c = (s) => R.filter(r => r.status === s).length;
    const legs = R.reduce((a, r) => { const v = r.verified.legs; a.g += (v.geodata || 0) + (v['town-graph'] || 0) + (v['dungeon-rooms'] || 0) + (v['field-areas'] || 0) + (v.saved || 0) + (v.adjacent || 0); a.s += v.straight || 0; return a; }, { g: 0, s: 0 });
    L.push(`| ${t} | ${R.length} | ${c('ok')} | ${c('unverified')} | ${c('conditional')} | ${c('blocked')} | ${c('unreachable')} | ${R.filter(r => r.source === 'saved').length} | ${legs.g} | ${legs.s} |`);
  }
  L.push('', `Total: ${routes.length} targets, ${routes.filter(r => r.status !== 'unreachable').length} with a route. Geopath walks cached: ${index.walks.cached}, still pending: ${index.walks.pending}${index.walks.pending ? ' (run nav_atlas.js again to compute them; a pending walk counts as a straight line = unverified)' : ''}.`, '');
  const un = routes.filter(r => r.status === 'unreachable');
  const reasons = {}; un.forEach(r => { const k = cell(r.why[0] || '?').replace(/-?\d{3,}/g, 'N').replace(/\(.*$/, '').trim(); reasons[k] = (reasons[k] || 0) + 1; });
  L.push('## Unreachable targets', '', `${un.length} targets. Reasons:`, '');
  Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => L.push(`- ${v} × ${k}`));
  L.push('', '| Target | Type | Position | Reason |', '|---|---|---|---|');
  const unN = un.filter(r => r.type === 'npc');
  un.filter(r => r.type !== 'npc').concat(unN.slice(0, 60)).forEach(r => L.push(`| ${cell(r.name)} (${r.key}) | ${r.type} | ${[r.target.x, r.target.y, r.target.z].map(v => Math.round(v || 0)).join(',')} | ${cell(r.why.join('; '))} |`));
  if (unN.length > 60) L.push(`| … ${unN.length - 60} more NPCs (Scripts/data/nav_atlas/npc.json) | | | |`);
  const bl = routes.filter(r => r.status === 'blocked');
  L.push('', '## Blocked routes (a closed door on the way the party cannot open)', '', `${bl.length} routes.`, '');
  bl.slice(0, 80).forEach(r => L.push(`- ${cell(r.name)} (${r.key}): ${cell(r.why.filter(w => /^door/.test(w)).join('; '))}`));
  if (bl.length > 80) L.push(`- … ${bl.length - 80} more`);
  // doors that BLOCK the most targets (a route through them is status blocked)
  const bd = {}; routes.filter(r => r.status === 'blocked').forEach(r => { const seen = new Set(); r.steps.filter(s => s.do === 'door' && s.need && s.need.blocked).forEach(s => { if (seen.has(s.doorId)) return; seen.add(s.doorId); const d = bd[s.doorId] = bd[s.doorId] || { n: 0, name: s.name, kind: s.kind, at: s.at, need: s.need, ex: [] }; d.n++; if (d.ex.length < 3) d.ex.push(r.name); }); });
  L.push('', '## Doors blocking the most targets', '', '| Door | Kind | At | Targets blocked | Examples | Why |', '|---|---|---|---|---|---|');
  Object.entries(bd).sort((a, b) => b[1].n - a[1].n).slice(0, 30).forEach(([id, d]) => L.push(`| ${id} ${d.name} | ${d.kind} | ${d.at.join(',')} | ${d.n} | ${cell(d.ex.join(', '))} | ${cell(needText(d.need))} |`));
  const dc = {}; routes.forEach(r => r.steps.filter(s => s.do === 'door').forEach(s => { const k = s.doorId; dc[k] = dc[k] || { n: 0, name: s.name, kind: s.kind, at: s.at, need: s.need, types: {} }; dc[k].n++; dc[k].types[r.type] = (dc[k].types[r.type] || 0) + 1; }));
  L.push('', '## Doors on the most routes', '', '| Door | Kind | At | Routes | By type | What the bot does |', '|---|---|---|---|---|---|');
  Object.entries(dc).sort((a, b) => b[1].n - a[1].n).slice(0, 40).forEach(([id, d]) => L.push(`| ${id} ${d.name} | ${d.kind} | ${d.at.join(',')} | ${d.n} | ${Object.entries(d.types).map(([k, v]) => k + ' ' + v).join(', ')} | ${cell(needText(d.need))} |`));
  const td = (doors.doors || []).filter(d => d.timed);
  const tg = {}; td.forEach(d => { const p = d.place || {}; const k = d.name.replace(/_?\d+$/, '') + '|' + (p.dungeon || p.region || p.bossZone || (p.nearTown ? 'near ' + p.nearTown.name : p.town) || ''); const g = tg[k] = tg[k] || { n: 0, ids: [], o: new Set(), c: new Set() }; g.n++; g.ids.push(d.id); g.o.add(d.timed.openFor.join('-')); g.c.add(d.timed.closedFor.join('-')); });
  L.push('', '## Timed doors (open_method bit 2: they open and close on their own)', '', 'Semantics (server core L2DoorInstance.TimerOpen): after opening a door stays open `open_time + Rnd(random_time)` s, after closing it stays closed `close_time + Rnd(random_time)` s, for ever. The bot waits at most "closed max + 30 s" and walks on once the door reports open (DoorStatusUpdate 0x4D / StaticObject 0x9F), or, without packets, retries the next leg every 10 s.', '',
    '| Door group | Where | Doors | Open (s) | Closed (s) | Ids |', '|---|---|---|---|---|---|');
  Object.entries(tg).forEach(([k, g]) => { const [n, w] = k.split('|'); L.push(`| ${n} | ${cell(w)} | ${g.n} | ${[...g.o].slice(0, 4).join(', ')}${g.o.size > 4 ? ' …' : ''} | ${[...g.c].slice(0, 4).join(', ')}${g.c.size > 4 ? ' …' : ''} | ${g.ids.slice(0, 4).join(', ')}${g.ids.length > 4 ? ' …' : ''} |`); });
  const st = doors.stats || {};
  L.push('', '## Doors parsed', '', `${(doors.doors || []).length} doors (doors.xml), ${st.blocking} closed by default with collision. Primary kind (what a traveller has to do): ${Object.entries(st.byKind || {}).map(([k, v]) => k + ' ' + v).join(', ')}. Unlock-able (bit 8): ${st.unlockable}; with key items: ${st.keyed}; opened/closed by datapack scripts: ${st.scripted}; in instance templates: ${st.inInstances}; boss zones: ${st.bossZones}.`, '');
  if (doors.unlock) L.push(`Unlock (skill 27): chance per skill level ${JSON.stringify(doors.unlock.chance)}, consumes ${doors.unlock.consumes ? doors.unlock.consumes.name + ' ' + doors.unlock.consumes.id + ' ×' + JSON.stringify(doors.unlock.consumes.count) : '?'}; learned by ${(doors.unlock.learnedBy || []).map(c => c.name + ' ' + c.classId).join(', ')} (+ Adventurer 93, Wind Rider 101, Ghost Hunter 108). Source: ${doors.unlock.src}. Rule: ${doors.unlock.rule}.`, '');
  L.push('Key items (a skill with the OpenDoor effect + isItem; the item is consumed; target = door id):', '');
  (doors.keySkills || []).forEach(k => L.push(`- ${k.name} (skill ${k.skillId}): ${k.consumes ? k.consumes.name + ' ' + k.consumes.id : '?'} -> doors ${k.doors.join(', ') || '(any door with bit 4)'}`));
  L.push('', '## Entry conditions (Scripts/data/nav_doors.json conditions[])', '', '| Key | Area | Kind | Rule | Source | Read from |', '|---|---|---|---|---|---|');
  (doors.conditions || []).forEach(c => L.push(`| ${c.key} | ${cell(c.area)} | ${c.kind} | ${cell(c.text)} | ${cell(c.src)} | ${c.read} |`));
  L.push('', '## Routes per condition', '');
  const cc = {}; routes.forEach(r => (r.conditions || []).forEach(c => { cc[c.key] = (cc[c.key] || 0) + 1; }));
  Object.entries(cc).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => L.push(`- ${k}: ${v} routes`));
  L.push('', '## How the bots use it', '',
    '- swarm.js (patch_navatlas.js): navAtlasRoute(target) reads ONE small file (Scripts/data/nav_atlas/t/<key>.json, found through grid/<gx>_<gy>.json or npcid/<id>.json, written by docs/plan/tools/nav_atlas_split.js; a cache of 24 files per engine).',
    '- Used FIRST by raid mission travel (stops at the stage distance), teleportNear (only the town / gatekeeper / NPC teleports), goToNpc and dungeonEntryTrip (only when the saved entry route is not manual). Manual routes always win; a blocked / unreachable route or more than 5000 units of uncomputed walking is not used; any failure falls back to the old travel code from where the bot stands.',
    '- Door steps: open -> pass; NPC door -> talk to that NPC (members near it talk too); key item -> target the door + use it; Unlock -> cast 27 if I have it, else a dagger teammate is asked (swarm.navatlas.unlock); timer -> wait up to one closed + one open phase + 30 s (door state from the StaticObject / DoorStatusUpdate packets through the siege packet hook; without a packet: try to walk through every 10 s).',
    '- Needs (items, level, Unlock, quests, Seven Signs, noble) are said in party chat before leaving and the trip goes on (warn, never refuse). Log: Logs/nav_atlas_runs.log; dashboard #/navatlas -> Bot runs.',
    '- Switch: Scripts/data/nav_atlas/settings.json { "on": true, "use": { "raid": true, "npc": true, "near": true, "dungeon": true }, "maxStraight": 5000 } (read live).');
  L.push('', '## Not covered', '',
    '- Instances are routed to their entry NPC only (the inside of Zaken / Frintezza / Freya / Tiat / Kamaloka is not walked). Beleth (Naia Cube 32376 has no spawn in the datapack spawn list) and Ekimus (no entry script in this datapack) stay unreachable.',
    '- Door states at run time are unknown to the atlas: a timed door is a wait step, a script / siege / clan hall door is blocked unless a datapack NPC opens it (Pagan Temple, Hall of Flames).',
    '- Seven Signs, boss states (Antharas / Valakas / Baium / Beleth), command channels, noble status and quest states are conditions the bot checks live; the atlas lists them.',
    '- Gracia: the Survivor / airship landing (-149406,255247) is a closed platform on the geodata; the way on to the Keucereus base (airship / NPC) needs a live check, so every Gracia / Seed target is unreachable here.',
    '- Hellbound: entered through Warpgate 32314 (next to the Wastelands landing); Path to Hellbound (Q130) / Thats Bloody Hot (Q133) completed is a condition the bot cannot read (warned, not checked).',
    '- A walk whose geodata search hit its time / cell cap stays a straight (unverified) leg: the bots use their own walker there. Unreachable = every landing failed for a definite reason (no way through the search box / a closed pocket / off the geodata).',
    '- 412 doors have no opener in the datapack; most are Olympiad / Underground Coliseum arenas, an unnamed z -8384 room grid, Imperial Tomb walls and instance doors that no travel route crosses (nav_doors.json doors[].area / noOpenerWhy).',
    '- Walk speed is a fixed estimate (120 units/s); a teleport 25 s, .town 20 s, a floor teleporter 15 s.',
    '- Gatekeeper link texts not on a recorded live menu (Scripts/data/gk_live) are datapack texts (flags link-not-on-live-menu / link-unverified).');
  fs.writeFileSync(path.join(ROOT, 'docs', 'plan', 'nav_atlas_report.md'), L.join('\n') + '\n');
  console.log('report: docs/plan/nav_atlas_report.md');
}
module.exports = { write };
if (require.main === module) { const idx = J(path.join(OUTDIR, 'index.json')); const all = []; for (const f of new Set(Object.values(idx.files))) { try { Object.values(J(path.join(OUTDIR, f)).routes).forEach(r => all.push(r)); } catch (e) { } } write(all, idx); }
