// test_no_lost_escapes.js - guard (owner 2026-10-30 "make sure these are permanent rules"): code inserted through shell heredocs / template literals
// lost its backslashes four times on 2026-10-30 (a backspace char from \b, "/[s,]+/" for /[\s,]+/, "(d+)" for (\d+), a single "\S" in a path).
// Scans Scripts_dev/swarm.js for those broken forms + checks the two order parsers that broke (!clanallow, !whtry) for real.
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m, extra) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (extra ? ' - ' + extra : '')); } };
const lines = SRC.split('\n');
const find = (re) => lines.map((l, i) => re.test(l) ? (i + 1) + ': ' + l.trim().slice(0, 120) : null).filter(Boolean);
check(!SRC.includes('\u0008'), 'no backspace character (a lost "\\b")', find(/\u0008/).join(' | '));
check(!find(/split\(\/\[s,\]/).length, 'no split(/[s,]+/) (a lost "\\s")', find(/split\(\/\[s,\]/).join(' | '));
check(!find(/match\(\/\^\(d\+\)/).length && !find(/\(\?:\(d\+\)\)/).length, 'no (d+) regex (a lost "\\d")', find(/match\(\/\^\(d\+\)|\(\?:\(d\+\)\)/).join(' | '));
check(!find(/\$\{SWARM_ROOT\}\\[A-Za-z]/).length, 'no single backslash after ${SWARM_ROOT} in a template path (a lost "\\\\")', find(/\$\{SWARM_ROOT\}\\[A-Za-z]/).join(' | '));
check(!find(/\$\{__DIR__\}\\[A-Za-z]/).length, 'no single backslash after ${__DIR__} in a template path', find(/\$\{__DIR__\}\\[A-Za-z]/).join(' | '));

// the two parsers, run for real
const ca = lines.find(l => l.includes("const names = String(parts.slice(1).join(' ')).split("));
check(!!ca, '!clanallow name parser exists');
if (ca) { const parts = ['!clanallow', 'Bishop1,Destroyer7', 'Destroyer6']; const names = eval(ca.trim().replace(/^const names = /, '').replace(/;$/, '')); check(JSON.stringify(names) === '["Bishop1","Destroyer7","Destroyer6"]', '!clanallow "Bishop1,Destroyer7 Destroyer6" -> 3 whole names', JSON.stringify(names)); }
const wt = lines.find(l => l.includes("const m = String(parts[1] || '').match(/^("));
check(!!wt, '!whtry item parser exists');
if (wt) { const re = new RegExp(wt.match(/match\(\/(.*?)\/\)/)[1]); const m = '1458:1'.match(re); check(m && m[1] === '1458' && m[2] === '1', '!whtry "1458:1" -> item 1458, count 1'); }
// 2026-10-31: the same breakage was found in the dashboard (Dashboard/commands.js catalog regexes "/^!whtrys+d+.../", a backspace char in
// server.js / upgrade_api.js regexes) - every dashboard .js / .html is scanned too, and every catalog `re:` regex
const DASH = path.join(__dirname, '..', '..', '..', 'Dashboard');
const dashFiles = fs.readdirSync(DASH).filter(f => /\.(js|html)$/.test(f));
const withBs = dashFiles.filter(f => fs.readFileSync(path.join(DASH, f), 'utf8').includes('\u0008'));
check(!withBs.length, `no backspace character in Dashboard/*.js / *.html (${dashFiles.length} files)`, withBs.join(', '));
const CAT = fs.readFileSync(path.join(DASH, 'commands.js'), 'utf8').split('\n');
const badRe = CAT.map((l, i) => { const m = l.match(/re: \/(.*?)\/[a-z]*,/); return m && /(^|[^\\])(s\+|S\+|d\+|w\+|s\*)/.test(m[1]) ? (i + 1) + ': /' + m[1] + '/' : null; }).filter(Boolean);
check(!badRe.length, 'every command catalog regex keeps its backslashes (no "s+" / "d+" / "S+" without one)', badRe.join(' | '));
console.log(`lost escapes: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
