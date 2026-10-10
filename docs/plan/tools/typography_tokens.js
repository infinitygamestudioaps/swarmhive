// SITE-WIDE TYPE SCALE (user 2026-10-09 09:50: "the TEXT SIZE needs to be the same — this goes for the ENTIRE site; it looks messy when some
// font sizes are way bigger than others"). Replaces every px font size in the dashboard's stylesheets with ONE of the tokens defined at the
// top of Dashboard/index.html:
//   --fs-mini 11 (icon counts, gauge labels, badges, legends) · --fs-cap 12 (captions, chips, buttons, tables) · --fs-body 13 (body)
//   --fs-em 14 (emphasis) · --fs-section 14 (box titles h3) · --fs-title 16 (window titles h2) · --fs-page 20 (page title h1) · --fs-map 11 (SVG map labels)
// Mapping (nearest token): <= 11 px -> mini · 11.5-12 -> cap · 12.5-13 -> body · 14-15 -> em · 16-18 -> title · >= 19 -> page.
//   node docs/plan/tools/typography_tokens.js            dry run: inventory + what would change, per file
//   node docs/plan/tools/typography_tokens.js --apply    write (re-reads each file right before writing; other agents edit in parallel)
// Only "font-size: Npx" and the size inside "font:" shorthands are touched (CSS files; in index.html also inline style="font-size:..").
// SVG font-size="..." attributes are NOT touched here: index.html's mapTextFix() normalises SVG map labels at runtime.
'use strict';
const fs = require('fs');
const path = require('path');
const D = path.resolve(__dirname, '..', '..', '..', 'Dashboard');
const FILES = ['index.html', 'cmdcenter.css', 'liveparty.css', 'raidlive.css', 'sieges.css', 'spoteditor.css', 'polyedit.css', 'override.css'];
const APPLY = process.argv.includes('--apply');
const tok = (px) => px <= 11 ? 'mini' : px <= 12 ? 'cap' : px <= 13 ? 'body' : px <= 15 ? 'em' : px <= 18 ? 'title' : 'page';
const report = {};
for (const f of FILES) {
  const p = path.join(D, f);
  if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, 'utf8');
  const changes = {};
  const note = (px, t) => { const k = px + 'px -> --fs-' + t; changes[k] = (changes[k] || 0) + 1; };
  if (f === 'index.html') {        // headings: fixed roles
    s = s.replace(/h1 \{ font-size: 17px; \} h2 \{ font-size: 14px; \} h3 \{ font-size: 13px;/, () => { note('h1 17', 'page'); note('h2 14', 'title'); note('h3 13', 'section'); return 'h1 { font-size: var(--fs-page); } h2 { font-size: var(--fs-title); } h3 { font-size: var(--fs-section);'; });
  }
  s = s.replace(/font-size(\s*):(\s*)(\d+(?:\.\d+)?)px/g, (m, a, b, n) => { const t = tok(+n); note(n, t); return `font-size${a}:${b}var(--fs-${t})`; });
  s = s.replace(/(\bfont\s*:\s*(?:(?:italic|normal|bold|bolder|[1-9]00)\s+)*)(\d+(?:\.\d+)?)px/g, (m, a, n) => { const t = tok(+n); note('font ' + n, t); return `${a}var(--fs-${t})`; });
  report[f] = changes;
  if (APPLY) {
    const now = fs.readFileSync(p, 'utf8');          // re-read: write only our substitution on the newest content
    let out = now;
    if (f === 'index.html') out = out.replace(/h1 \{ font-size: 17px; \} h2 \{ font-size: 14px; \} h3 \{ font-size: 13px;/, 'h1 { font-size: var(--fs-page); } h2 { font-size: var(--fs-title); } h3 { font-size: var(--fs-section);');
    out = out.replace(/font-size(\s*):(\s*)(\d+(?:\.\d+)?)px/g, (m, a, b, n) => `font-size${a}:${b}var(--fs-${tok(+n)})`)
      .replace(/(\bfont\s*:\s*(?:(?:italic|normal|bold|bolder|[1-9]00)\s+)*)(\d+(?:\.\d+)?)px/g, (m, a, n) => `${a}var(--fs-${tok(+n)})`);
    if (out !== now) fs.writeFileSync(p, out);
  }
}
console.log(JSON.stringify(report, null, 1));
