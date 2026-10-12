// BRAIN HOST — the geopath service inside the brain (2026-10-12, new engine phase 1).
// swarm.js asks its route through files (Logs/geopath/req_<Name>[__flee].json -> res_<Name>[__flee].json, see geopath_service.js).
// The brain host sees the request the moment swarm.js writes it (vfs onWrite) and answers from a worker thread running
// docs/plan/tools/geopath.js (same code and options as geopath_service.js), so a long A* never blocks the swarm.js contexts.
// pending() = requests in flight (the simulator waits for them before it moves virtual time on).
'use strict';
const path = require('path');
const { Worker } = require('worker_threads');
const GEO = path.resolve(__dirname, '..', '..', 'docs', 'plan', 'tools', 'geopath.js');

const WORKER_SRC = `
const { parentPort, workerData } = require('worker_threads');
const geo = require(workerData.geo);
parentPort.on('message', ({ n, req }) => {
  let res;
  try {
    if (req.op === 'flee') {
      const r = geo.fleeSpot(req.from, req.dangers || [], { polys: req.polys || [], safeSpots: req.safeSpots || [], margin: req.margin, maxWalk: req.maxWalk, maxSafeWalk: req.maxSafeWalk });
      res = { id: req.id, flee: true, ok: !!r.ok, kind: r.kind || '', name: r.name || '', spot: r.spot || null, clearance: r.clearance, points: r.points || [], reason: r.reason || '', ms: r.ms, lengthUnits: r.lengthUnits || 0 };
    } else {
      const r = geo.findPath(req.from, req.to, { maxLeg: req.maxLeg || 1000, maxMs: 15000, avoid: req.avoid || [] });
      res = { id: req.id, ok: !!r.ok, points: r.points || [], reason: r.reason || '', ms: r.ms, lengthUnits: r.lengthUnits || 0 };
    }
  } catch (e) { res = { id: req.id, ok: false, points: [], reason: 'error: ' + e.message, ms: 0 }; }
  parentPort.postMessage({ n, res });
});`;

class GeoBridge {
  constructor(opts) {
    this.o = Object.assign({ vfs: null, log: null }, opts || {});
    this.inflight = new Map(); this.n = 0; this.st = { requests: 0, answered: 0, ms: 0 };
    this.w = new Worker(WORKER_SRC, { eval: true, workerData: { geo: GEO } });
    this.w.unref();
    this.w.on('message', ({ n, res }) => {
      const j = this.inflight.get(n); if (!j) return; this.inflight.delete(n);
      this.st.answered++; this.st.ms += res.ms || 0;
      try { this.o.vfs.File.WriteAllText(j.resPath, JSON.stringify(res)); } catch (e) { }
      if (this.o.log) this.o.log(`geopath ${j.name}: ${res.ok ? (res.points || []).length + ' waypoints' : 'NO PATH ' + res.reason} (${res.ms} ms)`);
    });
    this.w.on('error', (e) => { if (this.o.log) this.o.log('geopath worker error: ' + e.message); });
  }
  /** vfs onWrite hook */
  onWrite(p, text) {
    const m = /[\\/]Logs[\\/]geopath[\\/]req_(.+)\.json$/i.exec(String(p)); if (!m) return;
    let req; try { req = JSON.parse(text); } catch (e) { return; }
    const n = ++this.n; this.st.requests++;
    const resPath = String(p).replace(/req_(.+)\.json$/i, 'res_$1.json');
    try { this.o.vfs.File.Delete(p); } catch (e) { }
    this.inflight.set(n, { name: m[1], resPath });
    this.w.postMessage({ n, req });
  }
  pending() { return this.inflight.size; }
  async idle(maxMs) { const t0 = Date.now(); while (this.inflight.size && Date.now() - t0 < (maxMs || 30000)) await new Promise(r => setTimeout(r, 5)); }
  stop() { try { this.w.terminate(); } catch (e) { } }
}

module.exports = { GeoBridge };
