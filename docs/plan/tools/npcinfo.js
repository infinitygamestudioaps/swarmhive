// npcinfo.js <id,id,...> [--drops]  -> name, level, type and top drops from the datapack npc XMLs
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
const fs = require('fs'), path = require('path');
const dir = __ROOT + '/Scripts/data/npcstats';
const ids = new Set(process.argv[2].split(',').map(Number));
const wantDrops = process.argv.includes('--drops');
let items = {};
try { items = JSON.parse(fs.readFileSync(__ROOT + '/Scripts/data/dp/gear_db.json', 'utf8').replace(/^\uFEFF/, '')).items; } catch (e) { }
let itemNames = {};
try {
  for (const f of fs.readdirSync(__ROOT + '/Scripts/data/dp/items')) {
    const x = fs.readFileSync(path.join(__ROOT + '/Scripts/data/dp/items', f), 'utf8');
    for (const m of x.matchAll(/<item id="(\d+)"[^>]*name="([^"]+)"/g)) itemNames[m[1]] = m[2];
  }
} catch (e) { }
const nameOf = id => itemNames[id] || (items[id] && items[id].name) || id;
for (const f of fs.readdirSync(dir)) {
  const x = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const m of x.matchAll(/<npc id="(\d+)"([^>]*)>([\s\S]*?)<\/npc>/g)) {
    const id = +m[1];
    if (!ids.has(id)) continue;
    const attrs = m[2], body = m[3];
    const name = (/name="([^"]+)"/.exec(attrs) || [])[1], level = (/level="(\d+)"/.exec(attrs) || [])[1], type = (/type="([^"]+)"/.exec(attrs) || [])[1];
    let line = `${id} ${name} L${level} ${type}`;
    if (wantDrops) {
      const drops = [...body.matchAll(/<item id="(\d+)" min="(\d+)" max="(\d+)" chance="([\d.]+)"/g)]
        .map(d => ({ id: d[1], min: d[2], max: d[3], ch: +d[4] }))
        .filter(d => d.id !== '57').sort((a, b) => b.ch - a.ch).slice(0, 12);
      line += '\n    ' + drops.map(d => `${nameOf(d.id)}(${d.id}) ${d.min}-${d.max} ${d.ch}%`).join('; ');
    }
    console.log(line);
  }
}
