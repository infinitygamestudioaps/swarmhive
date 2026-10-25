// BRAIN HOST — File.* for swarm.js contexts (2026-10-12, new engine phase 1; docs/plan/new_engine/DESIGN.md §4).
// swarm.js uses .NET System.IO.File with Windows paths (C:\L2Swarm\Scripts\data\x.json, sometimes with '/' mixed in).
// This module answers the same calls from Node fs, with two extras:
//   1. SHARED READ CACHE: ReadAllText of a file is cached by (path, mtime, size) and the SAME string is handed to every context
//      (one copy in the isolate instead of one per character). Opt-in shared parse (sharedParse) lets the contexts' JSON.parse return
//      one parsed object for the same big text (see host.js).
//   2. OVERLAY (simulator / dry runs): writes, deletes, moves go to an overlay directory instead of the real tree; reads see the overlay
//      first. `isolate` lists relative folders (e.g. 'Logs') that are read ONLY from the overlay (a sim never sees live state files).
// Live use: overlay = null -> plain read/write on the real paths (exactly what swarm.js does inside L2Swarm today).
'use strict';
const fs = require('fs'), path = require('path');

function createVfs(opts) {
  // PERF-2026-10-15: cacheMax 64 -> 16 MB per worker (13 workers) and LRU: the old cache only ever grew (every version of every file >= 4 KB
  // ever read stayed until the 64 MB were full, then nothing new was cached); files over cacheFileMax (2 MB) are not cached (the big datasets
  // are shared PARSED by the runner, the text itself is garbage right after the parse).
  // CACHE32-2026-10-24 (owner yes; 32 GB PC RAINBOW, 8 workers): cacheMax 16 -> 96 MB per worker, cacheFileMax 2 -> 8 MB. 6 of 8 workers sat at
// the 16 MB cap and re-read the big data files (quests_h5 5.8 MB, gear_db 5.4, field_areas 4.5, geo_blocked 2.8 were never cached) from the
// QLC SSD; after a reload the brain host read 44 MB/s and the dashboard took 9-30 s per page. Worst case 8 x 96 MB = 0.8 GB.
const o = Object.assign({ root: 'C:\\L2Swarm', overlay: null, isolate: [], cacheMax: 96 * 1024 * 1024, cacheFileMax: 8 * 1024 * 1024, log: null, onWrite: null }, opts || {});
  const rootN = path.win32.normalize(o.root).replace(/[\\/]+$/, '').toLowerCase();
  const st = { reads: 0, hits: 0, writes: 0, bytesCached: 0, files: 0, errors: 0 };
  const cache = new Map();                    // realPath(lower) -> { mtimeMs, size, text }
  const norm = (p) => path.win32.normalize(String(p)).replace(/\//g, '\\');
  const rel = (p) => { const n = norm(p), l = n.toLowerCase(); return l.startsWith(rootN + '\\') ? n.slice(rootN.length + 1) : null; };
  const isolated = (r) => r !== null && o.isolate.some(d => r.toLowerCase() === d.toLowerCase() || r.toLowerCase().startsWith(d.toLowerCase() + '\\'));
  // map a script path to [readPath(s), writePath]
  const ovPath = (p) => {
    if (!o.overlay) return null;
    const r = rel(p);
    return r !== null ? path.join(o.overlay, r) : path.join(o.overlay, '_abs', norm(p).replace(/[:\\]+/g, '_'));
  };
  const tomb = new Set();                     // overlay deletes of real files
  const real = (p) => process.platform === 'win32' ? norm(p) : norm(p).replace(/\\/g, '/');
  function locate(p) {                        // -> path to read from, or null (missing)
    const ov = ovPath(p);
    if (ov) {
      if (fs.existsSync(ov)) return ov;
      if (tomb.has(norm(p).toLowerCase()) || isolated(rel(p))) return null;
    }
    const rp = real(p);
    return fs.existsSync(rp) ? rp : null;
  }
  function writeTarget(p) {
    const ov = ovPath(p);
    const t = ov || real(p);
    fs.mkdirSync(path.dirname(t), { recursive: true });
    tomb.delete(norm(p).toLowerCase());
    return t;
  }
  const enoent = (p) => { const e = new Error(`Could not find file '${p}'.`); e.name = 'FileNotFoundException'; return e; };
  const existsErr = (p) => { const e = new Error(`Cannot create a file when that file already exists. ('${p}')`); e.name = 'IOException'; return e; };
  function readText(p) {
    st.reads++;
    const f = locate(p); if (!f) throw enoent(p);
    let s; try { s = fs.statSync(f); } catch (e) { throw enoent(p); }
    const k = f.toLowerCase(), c = cache.get(k);
    if (c && c.mtimeMs === s.mtimeMs && c.size === s.size) { st.hits++; cache.delete(k); cache.set(k, c); return big(p, k, s, c.text); }   // LRU: most recent last
    let text = fs.readFileSync(f, 'utf8');
    if (c) { cache.delete(k); st.bytesCached -= c.size; st.files--; }
    if (s.size >= 4096 && s.size <= o.cacheFileMax && s.size <= o.cacheMax) {
      for (const [ok, oc] of cache) { if (st.bytesCached + s.size <= o.cacheMax) break; cache.delete(ok); st.bytesCached -= oc.size; st.files--; st.evicted = (st.evicted || 0) + 1; }
      cache.set(k, { mtimeMs: s.mtimeMs, size: s.size, text }); st.bytesCached += s.size; st.files++;
    }
    return big(p, k, s, text);
  }
  /** PERF-2026-10-15: a text >= 100 KB goes past api.onBigRead (the runner's shared parse) with its file version key */
  function big(p, k, s, text) { if (api.onBigRead && text.length >= 100000) { try { api.onBigRead(rel(p), k + '|' + s.mtimeMs + '|' + s.size, text); } catch (e) { } } return text; }
  const File = {
    ReadAllText: (p) => readText(p),
    ReadAllLines: (p) => readText(p).split(/\r?\n/).filter((l, i, a) => i < a.length - 1 || l !== ''),
    ReadAllBytes: (p) => { const f = locate(p); if (!f) throw enoent(p); return Array.from(fs.readFileSync(f)); },
    Exists: (p) => { try { return !!locate(p) && fs.statSync(locate(p)).isFile(); } catch (e) { return false; } },
    WriteAllText: (p, text) => { st.writes++; fs.writeFileSync(writeTarget(p), String(text == null ? '' : text)); if (o.onWrite) { try { o.onWrite(p, String(text == null ? '' : text)); } catch (e) { } } },
    WriteAllLines: (p, lines) => { st.writes++; fs.writeFileSync(writeTarget(p), Array.from(lines || []).join('\r\n') + '\r\n'); },
    AppendAllText: (p, text) => {
      st.writes++;
      const t = writeTarget(p), ov = ovPath(p);
      if (ov && !fs.existsSync(t)) { const src = !isolated(rel(p)) && !tomb.has(norm(p).toLowerCase()) && fs.existsSync(real(p)) ? real(p) : null; if (src) fs.copyFileSync(src, t); }
      fs.appendFileSync(t, String(text == null ? '' : text));
    },
    Delete: (p) => {
      const ov = ovPath(p);
      if (ov) { try { fs.unlinkSync(ov); } catch (e) { } if (!isolated(rel(p)) && fs.existsSync(real(p))) tomb.add(norm(p).toLowerCase()); return; }
      try { fs.unlinkSync(real(p)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    },
    Copy: (a, b, overwrite) => { const f = locate(a); if (!f) throw enoent(a); const t = writeTarget(b); if (!overwrite && fs.existsSync(t)) throw new Error(`The file '${b}' already exists.`); fs.copyFileSync(f, t); },
    // MOVE LIKE .NET (engine audit #34, 2026-10-12): File.Move(a, b) THROWS when b exists and never replaces it (swarm.js's spot-claim lock
    // withClaimLock relies on that: "File.Move(tmp, lock) is atomic and throws while the lock exists"). Was copyFileSync (overwrites) + delete:
    // every brain leader "got" the lock at once and then deleted the other holder's lock. Now: a hard link (atomic, fails with EEXIST, also
    // against a lock written by L2Swarm's .NET File.Move at the same moment), else an exclusive copy (COPYFILE_EXCL); then the source goes.
    // Move(a, b, true) = the .NET Core overwrite overload.
    Move: (a, b, overwrite) => {
      const f = locate(a); if (!f) throw enoent(a);
      if (!overwrite && locate(b)) throw existsErr(b);
      const t = writeTarget(b);
      if (overwrite) { fs.copyFileSync(f, t); File.Delete(a); return; }
      // review 2026-10-12: hard link ONLY when the source is not a real file seen through the overlay — a real file linked into the overlay
      // shares its inode, so a later write to the moved file (writeFileSync truncates in place) would land in the REAL tree (a dry run /
      // simulator writing live state). Through the overlay: exclusive copy (still refuses an existing destination).
      const linkOk = !o.overlay || path.resolve(f).toLowerCase().startsWith(path.resolve(o.overlay).toLowerCase() + path.sep);
      let linked = false;
      if (linkOk) {
        try { fs.linkSync(f, t); linked = true; }
        catch (e) { if (e.code === 'EEXIST') throw existsErr(b); }
      }
      if (!linked) { try { fs.copyFileSync(f, t, fs.constants.COPYFILE_EXCL); } catch (e2) { if (e2.code === 'EEXIST') throw existsErr(b); throw e2; } }
      // the move itself has happened (b holds the content): a source that cannot be removed (Windows EPERM / EBUSY while another process reads
      // it) must not turn into a "Move failed" — swarm.js would think it did NOT get the lock while the lock file with its stamp exists
      try { File.Delete(a); } catch (e) { st.errors++; if (o.log) { try { o.log(`File.Move: ${a} -> ${b} done, but the source could not be removed: ${e.message}`); } catch (e2) { } } }
    },
    GetLastWriteTimeUtc: (p) => { const f = locate(p); return netDate(f ? fs.statSync(f).mtimeMs : Date.UTC(1601, 0, 1)); },
    GetLastWriteTime: (p) => { const f = locate(p); return netDate(f ? fs.statSync(f).mtimeMs : Date.UTC(1601, 0, 1)); },
  };
  const api = { File, st, cache, locate, readText, rel, onBigRead: null };
  return api;
}

// .NET DateTime look-alike: swarm.js reads .Ticks (fileStamp) and calls ToString()
function netDate(ms) {
  const d = new Date(ms);
  return { Ticks: BigInt(Math.round(ms)) * 10000n + 621355968000000000n, ToString: () => d.toISOString(), toString: () => d.toISOString(), valueOf: () => ms, Year: d.getUTCFullYear() };
}

module.exports = { createVfs, netDate };
