// gzip for every text response of the dashboard (user 2026-10-12: "the dashboard loads slowly").
// /api/state alone was ~640 KB every 4 s and index.html ~490 KB, all uncompressed; JSON/HTML/JS shrink 5-10x.
// wrap(req, res) at the start of the request handler: buffers the body, then sends it gzipped when the client accepts gzip,
// the type is text-like and the body is > 1 KB. Images (png/jpg) and anything already encoded pass through unchanged.
// DASHPERF 2026-10-13: (1) the same body is compressed only once (the last 24 bodies by sha1, e.g. the shared /api/state of every open page,
// the scripts) - each gzip ran again for every browser; (2) a versioned URL (?v=<file version>, see staticver.js) and /_inline/<hash> get
// "Cache-Control: public, max-age=31536000, immutable" (the browser does not ask again until the version changes).
'use strict';
const zlib = require('zlib'), crypto = require('crypto');
const TEXT = /text\/|javascript|json|svg|xml|css/i;
const GZ = new Map(); let gzBytes = 0;   // sha1 -> gzip Buffer (LRU, at most 24 entries / 24 MB)
function gzMemo(tag, z) {
  if (z.length > 8 * 1048576) return;
  GZ.set(tag, z); gzBytes += z.length;
  while ((GZ.size > 24 || gzBytes > 24 * 1048576) && GZ.size) { const [k, v] = GZ.entries().next().value; GZ.delete(k); gzBytes -= v.length; }
}

function wrap(req, res) {
  const gzipOk = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  const versioned = req.method === 'GET' && (/[?&]v=[0-9a-z]+(&|$)/.test(String(req.url || '')) || /^\/_inline\//.test(String(req.url || '')));
  if (!gzipOk && !versioned) return;
  const chunks = []; let head = null; let ended = false;
  const oWriteHead = res.writeHead.bind(res), oWrite = res.write.bind(res), oEnd = res.end.bind(res);
  res.writeHead = function (code, a, b) { head = [code, typeof a === 'object' && a ? a : (b || {})]; return res; };
  res.write = function (c, enc) { if (c != null) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c, typeof enc === 'string' ? enc : 'utf8')); return true; };
  res.end = function (c, enc, cb) {
    if (ended) return res; ended = true;
    if (typeof c === 'function') { cb = c; c = null; } else if (typeof enc === 'function') { cb = enc; enc = null; }
    if (c != null) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c, typeof enc === 'string' ? enc : 'utf8'));
    const body = Buffer.concat(chunks);
    const code = head ? head[0] : res.statusCode;
    const h = Object.assign({}, head ? head[1] : {});
    const lower = {}; Object.keys(h).forEach(k => { lower[k.toLowerCase()] = k; });
    const type = String(h[lower['content-type']] || res.getHeader('content-type') || '');
    const already = h[lower['content-encoding']] || res.getHeader('content-encoding');
    if (versioned && code === 200) {
      if (lower['cache-control']) delete h[lower['cache-control']];
      res.removeHeader('cache-control');
      h['Cache-Control'] = 'public, max-age=31536000, immutable';
      lower['cache-control'] = 'Cache-Control';
    }
    const plain = () => { oWriteHead(code, h); oEnd(body, cb); };
    // ETag for revalidated files (Cache-Control no-cache: scripts/styles/the page): an unchanged file answers 304 with no body
    const cc = String(h[lower['cache-control']] || res.getHeader('cache-control') || '');
    let tag = null;
    if (req.method === 'GET' && code === 200 && /no-cache/.test(cc) && !/no-store/.test(cc)) {
      tag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 20) + '"';
      h['ETag'] = tag;
      if (String(req.headers['if-none-match'] || '') === tag) { if (lower['content-length']) delete h[lower['content-length']]; oWriteHead(304, h); oEnd(cb); return res; }
    }
    if (!gzipOk || already || body.length < 1024 || !TEXT.test(type) || req.method === 'HEAD' || code === 204 || code === 304) return plain(), res;
    const send = (z) => {
      if (lower['content-length']) delete h[lower['content-length']];
      res.removeHeader('content-length');
      h['Content-Encoding'] = 'gzip'; h['Vary'] = 'Accept-Encoding'; h['Content-Length'] = z.length;
      oWriteHead(code, h); oEnd(z, cb);
    };
    // the same body again (another browser polling the same cached JSON, a script): the gzip made last time
    const key = body.length >= 16384 ? (tag || crypto.createHash('sha1').update(body).digest('hex')) + ':' + body.length : null;
    const hit = key && GZ.get(key);
    if (hit) { GZ.delete(key); GZ.set(key, hit); return send(hit), res; }
    zlib.gzip(body, { level: body.length > 262144 ? 4 : 5 }, (err, z) => {
      if (err) return plain();
      if (key) gzMemo(key, z);
      send(z);
    });
    return res;
  };
  void oWrite;
}
module.exports = { wrap };
