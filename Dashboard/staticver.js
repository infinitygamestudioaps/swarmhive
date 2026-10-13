// STATICVER (2026-10-13, owner: "everything runs insanely slowly on the dashboard, it hardly loads at all"): the page itself, made cheap to load.
//   page(file, dir) -> Buffer of index.html with
//     - every local script / stylesheet tag (src="/x.js", href="/x.css", also /vendor/...) versioned: "/x.js?v=<mtime+size>" -> the browser keeps
//       it for a year (compress.js sends "immutable" for ?v= URLs) and asks again only when the file changed (a new ?v=). Before: ~60 files
//       revalidated on every page load.
//     - the big inline <style> / <script> blocks (the 400 KB main script) moved to /_inline/<hash>.css|js (same code, same order, cached by the
//       browser for a year; the hash changes with the content). Only bare <script> / <style> tags above 20 KB; small inline bits stay.
//   inline(pathname) -> { type, body } for /_inline/<hash>.<js|css> or null
// Rebuilt when index.html changes and at most every 2 s (an asset changed = a new version in the page).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const C = { key: '', at: 0, buf: null };
const INL = new Map();   // '<hash>.<ext>' -> { type, body }
function ver(dir, rel) {
  try { const st = fs.statSync(path.join(dir, rel)); return Math.round(st.mtimeMs).toString(36) + st.size.toString(36); } catch (e) { return null; }
}
function page(file, dir) {
  const st = fs.statSync(file), key = st.mtimeMs + ':' + st.size;
  if (C.buf && C.key === key && Date.now() - C.at < 2000) return C.buf;
  let html = fs.readFileSync(file, 'utf8');
  const keep = new Set();
  const out = (ext, type, code) => {
    const h = crypto.createHash('sha1').update(code).digest('hex').slice(0, 16), k = h + '.' + ext;
    INL.set(k, { type, body: Buffer.from(code, 'utf8') }); keep.add(k); return '/_inline/' + k;
  };
  html = html.replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => css.length > 20000 ? `<link rel="stylesheet" href="${out('css', 'text/css; charset=utf-8', css)}">` : m);
  html = html.replace(/<script>([\s\S]*?)<\/script>/g, (m, js) => js.length > 20000 ? `<script src="${out('js', 'text/javascript; charset=utf-8', js)}"></script>` : m);
  html = html.replace(/(<(?:script|link)\b[^>]*?\s(?:src|href)=")(\/[A-Za-z0-9_\-./]+\.(?:js|css))(")/g, (m, a, p, b) => {
    if (p.startsWith('/_inline/') || p.includes('..')) return m;
    const v = ver(dir, p.slice(1)); return v ? a + p + '?v=' + v + b : m;
  });
  [...INL.keys()].forEach(k => { if (!keep.has(k) && INL.size > 8) INL.delete(k); });
  C.key = key; C.at = Date.now(); C.buf = Buffer.from(html, 'utf8');
  return C.buf;
}
function inline(pathname) {
  const m = /^\/_inline\/([0-9a-f]{16}\.(?:js|css))$/.exec(pathname || '');
  return m ? INL.get(m[1]) || null : null;
}
module.exports = { page, inline };
