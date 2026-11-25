// FIELD REPORT (2026-11-22): what the parties REALLY did in the last hours, from Logs/intent_<name>.log - the proof behind "fixed".
//   node docs/plan/tools/field_report.js [hours=1] [--json]
// Per party leader: team walks (ok / failed / still going, minutes), longest stand on one walk, supply runs + why, deaths (revives) of the members,
// help + assist actions of the team. Reads only; never touches the game.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..'), LOGS = path.join(ROOT, 'Logs');
const H = Number(process.argv[2]) || 1, cut = new Date(Date.now() - H * 3600e3).toISOString();
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'swarm.config.json'), 'utf8').replace(/^﻿/, ''));
const party = {}; (cfg.accounts || []).forEach(a => { if (a && a.character && a.enabled) (party[a.party || a.character] = party[a.party || a.character] || []).push(a.character); });
function tail(n) {
  const f = path.join(LOGS, `intent_${n}.log`);
  try { const st = fs.statSync(f), len = Math.min(st.size, 6e6), b = Buffer.alloc(len), fd = fs.openSync(f, 'r'); fs.readSync(fd, b, 0, len, st.size - len); fs.closeSync(fd); return b.toString('utf8').split(/\r?\n/).filter(l => l.slice(0, 24) >= cut); } catch (e) { return []; }
}
const out = [];
Object.keys(party).sort().forEach(L => {
  const r = { leader: L, n: party[L].length, walks: 0, ok: 0, fail: [], open: '', longest: 0, supply: [], regroup: [], deaths: 0, dead: {}, help: 0, assist: 0 };
  party[L].forEach(n => tail(n).forEach(l => {
    const t = l.slice(0, 24), s = l.slice(25);
    if (/^help: /.test(s)) r.help++; else if (/^assist: /.test(s)) r.assist++;
    if (/^revived: /.test(s)) { r.deaths++; r.dead[n] = (r.dead[n] || 0) + 1; }
    if (n !== L) return;
    if (/^lead team: to /.test(s)) { r.repos = (r.repos || 0) + 1; r.reposOpen = true; }               // back to the hunting area's centre: no trip
    else if (r.reposOpen && /^\s*-> lead team (OK|FAIL)/.test(s)) r.reposOpen = false;
    else if (/^lead team: /.test(s)) { r.walks++; r.openAt = t; r.open = s.slice(11, 90); }
    else if (/^\s*-> lead team (OK|FAIL)/.test(s)) { const m = r.openAt ? (Date.parse(t) - Date.parse(r.openAt)) / 60000 : 0; r.longest = Math.max(r.longest, m); if (/OK/.test(s.slice(0, 20))) r.ok++; else r.fail.push(`${t.slice(11, 16)} ${s.replace(/^\s*-> lead team FAIL: /, '').slice(0, 70)} (${m.toFixed(1)} min)`); r.openAt = ''; r.open = ''; }
    else if (/^supply: buy/.test(s)) r.supply.push(`${t.slice(11, 16)} ${(s.match(/\(([^)]*)\)/) || [])[1] || ''}`);
    else if (/^regroup: /.test(s)) r.regroup.push(`${t.slice(11, 16)} ${s.slice(9, 80)}`);
  }));
  if (r.openAt) r.openMin = +((Date.now() - Date.parse(r.openAt)) / 60000).toFixed(1);
  out.push(r);
});
if (process.argv.includes('--json')) { console.log(JSON.stringify({ hours: H, at: new Date().toISOString(), parties: out }, null, 1)); process.exit(0); }
const sum = (k) => out.reduce((a, r) => a + (Array.isArray(r[k]) ? r[k].length : Number(r[k]) || 0), 0);
console.log(`last ${H} h: ${out.length} parties | trips on a route ${sum('walks')}: ${sum('ok')} arrived, ${sum('fail')} stopped | hunting repositions ${sum('repos')} | deaths ${sum('deaths')} | supply runs ${sum('supply')} | help ${sum('help')} assist ${sum('assist')}`);
out.forEach(r => {
  if (!r.walks && !r.deaths && !r.supply.length && !r.regroup.length) return;
  console.log(`${r.leader} (${r.n}): walks ${r.ok}/${r.walks} ok${r.longest ? ', longest ' + r.longest.toFixed(1) + ' min' : ''}${r.openMin ? ', STILL WALKING ' + r.openMin + ' min: ' + r.open : ''} | deaths ${r.deaths}${r.deaths ? ' ' + JSON.stringify(r.dead) : ''} | supply ${r.supply.join('; ') || '-'} | help ${r.help} assist ${r.assist}`);
  r.fail.forEach(f => console.log('   FAILED ' + f));
  if (r.regroup.length > 1) console.log('   regroups: ' + r.regroup.join(' | '));
});
