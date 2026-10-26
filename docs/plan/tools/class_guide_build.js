// CLASS SKILL GUIDE page (owner 2026-10-26): docs/plan/class_skills/guide_head.html (hand-written summary) + every research/*.md rendered
// as collapsible sections -> docs/plan/class_skills/class_guide.html.   node docs/plan/tools/class_guide_build.js
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), DIR = path.join(ROOT, 'docs', 'plan', 'class_skills');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
const isRow = (s) => /^\s*\|/.test(s);
const isItem = (s) => /^\s*([-*]|\d+\.)\s+/.test(s);
// minimal markdown: headings, tables (also indented), lists, paragraphs, hr; h2 = one collapsible <details>
function md(src) {
  const L = src.replace(/\r/g, '').split('\n'), out = [], para = []; let i = 0, open = false;
  const flush = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para.length = 0; } };
  while (i < L.length) {
    const l = L[i];
    if (/^#\s/.test(l)) { flush(); i++; continue; }                       // the file title is shown by the race header
    const m = /^(#{2,4})\s+(.*)$/.exec(l);
    if (m) {
      flush(); const n = m[1].length;
      if (n === 2) { if (open) out.push('</div></details>'); out.push(`<details class="sec"><summary>${inline(m[2])}</summary><div class="sec-b">`); open = true; }
      else out.push(`<h${n + 1}>${inline(m[2])}</h${n + 1}>`);
      i++; continue;
    }
    if (isRow(l)) {
      flush(); const rows = []; while (i < L.length && isRow(L[i])) rows.push(L[i++].trim());
      const cells = (r) => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim());
      const head = cells(rows[0]), body = rows.slice(/^\|[\s:|-]+\|$/.test(rows[1] || '') ? 2 : 1);
      out.push('<div class="tw"><table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        body.map(r => '<tr>' + cells(r).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (isItem(l)) {
      flush(); const ol = /^\s*\d+\./.test(l), items = [];
      while (i < L.length && isItem(L[i])) { let it = L[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''); while (i < L.length && /^\s{2,}\S/.test(L[i]) && !isItem(L[i]) && !isRow(L[i])) it += ' ' + L[i++].trim(); items.push(it); }
      out.push((ol ? '<ol>' : '<ul>') + items.map(x => `<li>${inline(x)}</li>`).join('') + (ol ? '</ol>' : '</ul>'));
      continue;
    }
    if (/^---+\s*$/.test(l) || !l.trim()) { flush(); i++; continue; }
    para.push(l.trim()); i++;
  }
  flush(); if (open) out.push('</div></details>');
  return out.join('\n');
}
const RACES = [['human_fighters', 'Human fighters', 'Duelist · Dreadnought · Phoenix Knight · Hell Knight · Sagittarius · Adventurer'],
  ['human_mystics', 'Human mystics', 'Archmage · Soultaker · Arcana Lord · Cardinal · Hierophant'],
  ['elves', 'Elves', "Eva's Templar · Sword Muse · Wind Rider · Moonlight Sentinel · Mystic Muse · Elemental Master · Eva's Saint"],
  ['dark_elves', 'Dark Elves', 'Shillien Templar · Spectral Dancer · Ghost Hunter · Ghost Sentinel · Storm Screamer · Spectral Master · Shillien Saint'],
  ['orcs_dwarves', 'Orcs and Dwarves', 'Titan · Grand Khavatari · Dominator · Doomcryer · Fortune Seeker · Maestro'],
  ['kamael', 'Kamael', 'Doombringer · Soul Hound · Trickster · Judicator'],
  ['hive_audit', 'How Hive picks skills today', 'The audit of Scripts_dev/swarm.js behind the findings above']];
const head = fs.readFileSync(path.join(DIR, 'guide_head.html'), 'utf8');
const body = RACES.map(([f, t, sub]) => `<section class="race" id="${f}"><h2 class="race-h">${esc(t)}</h2><p class="race-sub">${esc(sub)}</p>${md(fs.readFileSync(path.join(DIR, 'research', f + '.md'), 'utf8'))}</section>`).join('\n');
fs.writeFileSync(path.join(DIR, 'class_guide.html'), head.replace('<!--FULLGUIDE-->', body));
console.log('class_guide.html', Math.round(fs.statSync(path.join(DIR, 'class_guide.html')).size / 1024) + ' KB');
