// test_boardpeek.js - requirement orders.md R2 (owner 2026-10-31: "What does the sub class cost via community? We need to subclass Inspector1 to
// inspector" + "run read only check"). !boardpeek <name> opens the board's Career / Services pages and saves them; it must never press a button
// on them (no subclass / profession / buy click) and only the named character acts.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const CAT = fs.readFileSync(path.join(ROOT, 'Dashboard', 'commands.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const cut = (src, start, end) => { const i = src.indexOf(start); return i < 0 ? '' : src.slice(i, src.indexOf(end, i) + end.length); };

const fn = cut(SRC, 'async function boardPeek() {', '\n}\n');
check(fn.length > 0, 'boardPeek() exists');
check(/const BOARDPEEK_PATHS = \[\['Career'\], \['Career', 'Subclass'\], \['Services'\]\];/.test(SRC), 'it opens Career, Career > Subclass (owner OK 2026-10-31) and Services only');
check(/await boardPath\(p\)/.test(fn) && (fn.match(/boardPath\(/g) || []).length === 1, 'only the listed menu buttons are followed (boardPath), nothing on the last page');
check(!/pageRequest\(|bbsRequest\(|ReqBypassToServer|cfgClickRow|classChangeOnce|purseRun|equipPiece/.test(fn), 'it presses no button on the pages it reads (no pageRequest / bypass / click)');
check(/savePage\('boardpeek_'/.test(fn) && /boardpeek_\$\{Me\.Name\}\.json/.test(fn), 'every page is saved (html + json with buttons and text)');
check(/cfgWithBoard\(/.test(fn), 'it waits for the board like the other board readers (no clash with a class change / cabinet click)');

const cs = cut(SRC, "case '!boardpeek': {", 'break;\n    }');
check(/if \(!parts\[1\] \|\| parts\[1\] !== Me\.Name\) break;/.test(cs), 'only the named character acts (no name = nobody)');
check(/boardPeek\(\)/.test(cs), 'the order runs boardPeek()');

const ent = (CAT.match(/\{ id: 'boardpeek'[\s\S]*?kw: '[^']*' \}/) || [''])[0];
check(/tpl: '!boardpeek \{name\}'/.test(ent) && /targets: \['char'\]/.test(ent), 'catalog: one named character');
check(/safety: 'safe'/.test(ent) && /Presses nothing/.test(ent), 'catalog: safe, says it presses nothing');

console.log(`boardpeek: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
