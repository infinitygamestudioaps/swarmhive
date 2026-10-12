// gzip for every text response of the dashboard (user 2026-10-12: "the dashboard loads slowly").
// /api/state alone was ~640 KB every 4 s and index.html ~490 KB, all uncompressed; JSON/HTML/JS shrink 5-10x.
// wrap(req, res) at the start of the request handler: buffers the body, then sends it gzipped when the client accepts gzip,
// the type is text-like and the body is > 1 KB. Images (png/jpg) and anything already encoded pass through unchanged.
'use strict';
const zlib = require('zlib'), crypto = require('crypto');
const TEXT = /text\/|javascript|json|svg|xml|css/i;

function wrap(req, res) {
  if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) return;
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
    const plain = () => { oWriteHead(code, h); oEnd(body, cb); };
    // ETag for revalidated files (Cache-Control no-cache: scripts/styles): an unchanged file answers 304 with no body
    const cc = String(h[lower['cache-control']] || res.getHeader('cache-control') || '');
    if (req.method === 'GET' && code === 200 && /no-cache/.test(cc) && !/no-store/.test(cc)) {
      const tag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 20) + '"';
      h['ETag'] = tag;
      if (String(req.headers['if-none-match'] || '') === tag) { if (lower['content-length']) delete h[lower['content-length']]; oWriteHead(304, h); oEnd(cb); return res; }
    }
    if (already || body.length < 1024 || !TEXT.test(type) || req.method === 'HEAD' || code === 204 || code === 304) return plain(), res;
    zlib.gzip(body, { level: 5 }, (err, z) => {
      if (err) return plain();
      if (lower['content-length']) delete h[lower['content-length']];
      res.removeHeader('content-length');
      h['Content-Encoding'] = 'gzip'; h['Vary'] = 'Accept-Encoding'; h['Content-Length'] = z.length;
      oWriteHead(code, h); oEnd(z, cb);
    });
    return res;
  };
  void oWrite;
}
module.exports = { wrap };
