// GKLANDING-2026-10-15: a real gatekeeper teleport that lands somewhere else than the datapack says is learned, never a failure loop (ToI from Aden)
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const i = src.indexOf("  if (s.do === 'gk') {"), gk = src.slice(i, src.indexOf("  if (s.do === 'buy')", i));
ok(gk.includes('gkLandingLearned(s)') && gk.indexOf('gkLandingLearned(s)') < gk.indexOf('teamTeleport('), 'already at the learned real landing = done (no new teleport)');
ok(/const away = s\.npc \? Math\.hypot\(s\.npc\.x - Me\.X, s\.npc\.y - Me\.Y\) : 1e9;\n\s+if \(away > 6000\) \{ gkLandingLearn\(s\);[^\n]*return \{ ok: true, landedElsewhere: true \}; \}/.test(gk), 'a real teleport to another spot: learn it and walk on');
ok(gk.includes("return { ok: false, why: `${s.desc}: landed"), 'still near the gatekeeper (the teleport did not happen): a failure as before');
ok(src.includes('\\\\Scripts\\\\data\\\\gk_landing_live.json`'),'learned landings in Scripts/data/gk_landing_live.json (escaped path)');
console.log(`gk landing: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
