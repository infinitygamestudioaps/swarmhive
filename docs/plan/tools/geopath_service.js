// GEOPATH SERVICE — answers route requests from the bots (swarm.js can not run a big A* itself and has no HTTP), through files:
//   swarm.js writes   Logs/geopath/req_<Name>.json  { id, from: {x,y,z}, to: {x,y,z}, maxLeg? }
//   this writes       Logs/geopath/res_<Name>.json  { id, ok, points: [{x,y,z}], reason, ms, lengthUnits }
// The geodata regions stay in memory between requests (fast after the first one in an area).
// Started by Dashboard/server.js (child process); log: Logs/geopath/service.log.
const fs = require('fs');
const path = require('path');
const geo = require('./geopath');
const DIR = path.join(__dirname, '..', '..', '..', 'Logs', 'geopath');
fs.mkdirSync(DIR, { recursive: true });
const LOG = path.join(DIR, 'service.log');
const log = (m) => { try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); } catch (e) { } };
log(`started (pid ${process.pid})`);
let busy = false;
function tick() {
  if (busy) return;
  let files = [];
  try { files = fs.readdirSync(DIR).filter(f => /^req_.+\.json$/.test(f)); } catch (e) { return; }
  if (!files.length) return;
  busy = true;
  try {
    for (const f of files) {
      const name = f.slice(4, -5), fp = path.join(DIR, f);
      let req;
      try { req = JSON.parse(fs.readFileSync(fp, 'utf8').replace(/^﻿/, '')); } catch (e) { continue; }   // half written: next tick
      try { fs.unlinkSync(fp); } catch (e) { }
      let res;
      try {
        if (req.op === 'flee') {
          // FLEE (2026-10-08): nearest walkable spot out of every danger circle (safe spot / hallway / free), see geopath.js fleeSpot
          const r = geo.fleeSpot(req.from, req.dangers || [], { polys: req.polys || [], safeSpots: req.safeSpots || [], margin: req.margin, maxWalk: req.maxWalk, maxSafeWalk: req.maxSafeWalk });
          res = { id: req.id, flee: true, ok: !!r.ok, kind: r.kind || '', name: r.name || '', spot: r.spot || null, clearance: r.clearance, points: r.points || [], reason: r.reason || '', ms: r.ms, lengthUnits: r.lengthUnits || 0 };
        } else {
          const r = geo.findPath(req.from, req.to, { maxLeg: req.maxLeg || 1000, maxMs: 15000, avoid: req.avoid || [] });
          res = { id: req.id, ok: !!r.ok, points: r.points || [], reason: r.reason || '', ms: r.ms, lengthUnits: r.lengthUnits || 0 };
        }
      } catch (e) { res = { id: req.id, ok: false, points: [], reason: 'error: ' + e.message, ms: 0 }; }
      const out = path.join(DIR, `res_${name}.json`);
      fs.writeFileSync(out + '.tmp', JSON.stringify(res)); fs.renameSync(out + '.tmp', out);   // atomic: the bot never reads half a file
      if (req.op === 'flee') { log(`${name}: FLEE from ${req.from.x},${req.from.y} (${(req.dangers || []).length} dangers): ${res.ok ? res.kind + ' ' + (res.spot ? res.spot.x + ',' + res.spot.y : '') + ', ' + res.lengthUnits + ' units' : 'NO SPOT ' + res.reason} (${res.ms} ms)`); continue; }
      log(`${name}: ${req.from.x},${req.from.y} -> ${req.to.x},${req.to.y}: ${res.ok ? res.points.length + ' waypoints, ' + res.lengthUnits + ' units' : 'NO PATH ' + res.reason} (${res.ms} ms)`);
    }
  } finally { busy = false; }
}
setInterval(tick, 150);
// exit when the parent (dashboard server) is gone
if (process.send) process.on('disconnect', () => process.exit(0));
