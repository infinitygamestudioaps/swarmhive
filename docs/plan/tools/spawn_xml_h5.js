// SPAWN XML (2026-10-27, coordinator: "include the extra spawn sources (datapack spawn XMLs) in your spawn index, read-only").
// spawns_h5.json comes from the datapack sql/spawnlist.sql only. Some monsters live in the datapack's XML spawn lists instead
// (src/main/resources/data/spawnlist/*.xml: turek_orcs_fixed_pos.xml = Turek Orcs for 171 / 327 / 422, sel_mahums.xml = Sel Mahums).
// This reads every ENABLED list (<list enabled="true">), fixed positions only (<npc id x y z>), and writes
//   Scripts/data/spawns_xml_h5.json  [{ id, x, y, z, count, src: '<file>' }]   (same row shape as spawns_h5.json)
// Read by docs/plan/tools/quest_dryrun.js (spawn index) and so by quest_plan_build.js' ready gate.
// Run: node docs/plan/tools/spawn_xml_h5.js <datapack root>   (a sparse clone with src/main/resources/data/spawnlist)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'Scripts', 'data', 'spawns_xml_h5.json');
/** the fixed-position spawns of one spawn list xml text (none when the list is disabled) */
function parseSpawnXml(xml, src) {
  const out = []; if (!/<list\b[^>]*enabled="true"/.test(xml)) return out;
  const re = /<npc\b([^>]*)\/?>/g; let m;
  while ((m = re.exec(xml))) {
    const a = (k) => { const r = new RegExp('\\b' + k + '="(-?\\d+)"').exec(m[1]); return r ? Number(r[1]) : null; };
    const id = a('id'), x = a('x'), y = a('y'), z = a('z');
    if (id == null || x == null || y == null) continue;
    out.push({ id, x, y, z: z == null ? 0 : z, count: a('count') || 1, src });
  }
  return out;
}
if (require.main === module) {
  const dp = process.argv[2]; const dir = dp && path.join(dp, 'src', 'main', 'resources', 'data', 'spawnlist');
  if (!dir || !fs.existsSync(dir)) { console.error('usage: node spawn_xml_h5.js <datapack root with src/main/resources/data/spawnlist>'); process.exit(1); }
  const rows = []; fs.readdirSync(dir).filter(f => f.endsWith('.xml')).sort().forEach(f => rows.push(...parseSpawnXml(fs.readFileSync(path.join(dir, f), 'utf8'), f)));
  const t = OUT + '.tmp' + process.pid; fs.writeFileSync(t, JSON.stringify(rows)); fs.renameSync(t, OUT);
  console.log(`spawn xml: ${rows.length} fixed spawns (${[...new Set(rows.map(r => r.src))].join(', ')}) -> ${path.relative(ROOT, OUT)}`);
}
module.exports = { parseSpawnXml };
