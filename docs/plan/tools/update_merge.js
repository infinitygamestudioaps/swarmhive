// update.ps1 helper: after an update replaced a guarded data file, put back every item YOU edited on the dashboard (manual: true).
//   node docs/plan/tools/update_merge.js <kind> <new file (the update's version, rewritten in place)> <your old copy>
//   kind: room (Scripts\data\dungeon_rooms.json) | spot (hunting_spots_h5.json) | subarea (zone_subareas.json) | area (field_areas.json)
// Uses the same merge rules as the generator tools (docs/plan/tools/manual_guard.js). Prints how many items were kept. Exit 1 on errors.
'use strict';
const fs = require('fs');
const MG = require('./manual_guard');
const [kind, newFile, oldFile] = process.argv.slice(2);
const MERGE = { room: MG.mergeRooms, spot: MG.mergeSpots, subarea: MG.mergeSubareas, area: MG.mergeAreas };
if (!MERGE[kind] || !newFile || !oldFile) { console.log('usage: node update_merge.js room|spot|subarea|area <new file> <your old copy>'); process.exit(1); }
try {
  const n = MG.readText(newFile), o = MG.readText(oldFile);
  const data = JSON.parse(n.text), disk = JSON.parse(o.text);
  const kept = MERGE[kind](data, disk);
  if (kept) MG.atomicWrite(newFile, MG.stringifyLike(data, n.fmt));
  console.log(`kept ${kept} item(s) you edited on the dashboard`);
} catch (e) { console.log('update_merge failed: ' + e.message); process.exit(1); }
