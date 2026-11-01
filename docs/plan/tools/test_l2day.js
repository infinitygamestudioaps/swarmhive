// test_l2day.js - guard for docs/requirements/l2day.md (owner 2026-10-31: the L2Day letters exchange at Louie the Cat, a queue, the rewards).
// Sandbox only: lifts swarm.js L2DAY-PURE, runs Dashboard/l2day_api.js against a temp folder, reads the page / catalog / router as text.
//   node docs/plan/tools/test_l2day.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..', '..');
let ok = 0, fail = 0;
const t = (good, msg, extra) => { if (good) { ok++; console.log('ok   ' + msg); } else { fail++; console.log('FAIL ' + msg + (extra ? ' - ' + extra : '')); } };
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');

// --- the pure block from swarm.js (+ the two link helpers it relies on in l2dayRun)
const a = SRC.indexOf('// L2DAY-PURE ('), b = SRC.indexOf('// L2DAY-PURE-END');
t(a > 0 && b > a, 'swarm.js has the L2DAY-PURE block');
const fnSrc = (name) => { const i = SRC.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = SRC.indexOf('{', i); for (; j < SRC.length; j++) { if (SRC[j] === '{') d++; else if (SRC[j] === '}' && --d === 0) break; } return SRC.slice(i, j + 1); };
const P = new Function(`const npcString = (id) => String(id);\n${fnSrc('cleanBypass')}\n${fnSrc('htmlText')}\n${fnSrc('npcLinks')}\n${SRC.slice(a, b)}
  return { L2DAY_LETTER, L2DAY_WORDS, L2DAY_MULT, l2dayWord, l2dayNeed, l2dayPossible, l2dayDiff, l2dayLink, npcLinks };`)();

// R1 words -> letters (the four words Louie's page offers)
const L = P.L2DAY_LETTER;
t(Object.keys(L).length === 14 && L.A === 3875 && L.II === 3888, '14 letters, A = 3875 .. II = 3888');
const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'Dashboard', 'data', 'items.json'), 'utf8'));
t(Object.entries(L).every(([k, id]) => (items[id] || [])[0] === 'L2Day - ' + k), 'every letter id has the item name "L2Day - <letter>" (checked by NAME)');
t(Object.entries(P.L2DAY_WORDS).every(([w, ls]) => ls.join('').replace('II', 'II') === w.toUpperCase().replace(/^LIITOGGLE$/, 'LIITOGGLE')), 'each word is spelled by its letters', JSON.stringify(P.L2DAY_WORDS));
t(P.l2dayWord('lineageii') === 'LineageII' && P.l2dayWord('ncsoft') === 'NCSoft' && P.l2dayWord('foo') === null, 'the word is matched case-insensitively, unknown = null');
const n1 = P.l2dayNeed('LineageII', 1);
t(n1[L.E] === 2 && n1[L.L] === 1 && n1[L.II] === 1 && Object.keys(n1).length === 7, 'LineageII = L I N E E A G II (E twice)', JSON.stringify(n1));
const n2 = P.l2dayNeed('LIIToggle', 5);
t(n2[L.L] === 10 && n2[L.G] === 10 && n2[L.T] === 5 && n2[L.II] === 5, 'LIIToggle x5 = L 10, G 10, T 5, II 5 ...', JSON.stringify(n2));

// R2 how many from the stock
const stock = { [L.L]: 93, [L.I]: 58, [L.N]: 115, [L.E]: 152, [L.A]: 35, [L.G]: 96, [L.II]: 90, [L.C]: 26, [L.S]: 44, [L.O]: 84, [L.F]: 42, [L.T]: 77, [L.H]: 32, [L.R]: 36 };
t(P.l2dayPossible(stock, 'LineageII') === 35, 'LineageII possible = 35 (A is the short letter)');
t(P.l2dayPossible(stock, 'LIIToggle') === 46, 'LIIToggle possible = 46 (L 93 / 2)');
t(P.l2dayPossible(stock, 'NCSoft') === 26 && P.l2dayPossible(stock, 'Throne') === 32, 'NCSoft 26 (C), Throne 32 (H)');
t(P.l2dayPossible({}, 'Throne') === 0 && P.l2dayPossible(stock, 'Nope') === 0, 'no letters / unknown word = 0');

// R3 reward = bag diff (letters used, items got)
const d = P.l2dayDiff({ [L.T]: 3, ['n' + L.T]: 'L2Day - T', 57: 100, n57: 'Adena' }, { [L.T]: 2, ['n' + L.T]: 'L2Day - T', 57: 100, 6622: 1, n6622: 'Giant\'s Codex' });
t(d.got.length === 1 && d.got[0].id === 6622 && d.got[0].name === 'Giant\'s Codex' && d.got[0].count === 1, 'a new item in the bag = a reward with id, name, count');
t(d.used.length === 1 && d.used[0].id === L.T && d.used[0].count === 1, 'a letter that left the bag = used');
t(P.l2dayDiff({ 57: 5 }, { 57: 5 }).got.length === 0, 'no change = no reward (the run stops: refused)');

// R4 the right link on Louie's real page (x5 / x10 repeat in every row)
const page = fs.readFileSync(path.join(__dirname, 'fixtures', 'louie_the_cat.html'), 'utf8');
const rows = page.split(/<tr\b/i).slice(1).map(r => P.npcLinks(r));
const pick = (w, m) => (P.l2dayLink(rows, w, m) || {}).cmd;
t(pick('LineageII', 'x1') === '00' && pick('LineageII', 'x5') === '01' && pick('LineageII', 'x10') === '02', 'LineageII x1/x5/x10 = 00/01/02');
t(pick('LIIToggle', 'x5') === '04' && pick('NCSoft', 'x10') === '08' && pick('Throne', 'x5') === '0a' && pick('Throne', 'x1') === '09', 'LIIToggle x5 = 04, NCSoft x10 = 08, Throne x1/x5 = 09/0a');
t(P.l2dayLink(rows, 'Nope', 'x1') === null, 'a word not on the page = no link');

// R5 the run: Giran, warehouse first, owner order stops it, every exchange logged, refusals stop, queue waits in order
const run = fnSrc('l2dayRun');
t(/ijInGiran\(\)/.test(run), 'runs only in Giran');
t(/whTake\('clan'/.test(run) && run.indexOf("whTake('clan'") < run.indexOf('for (let i = 0'), 'missing letters come out of the clan warehouse before the first exchange');
t(/orderReplaced\(seq\)/.test(run), 'a newer owner order stops it');
t(/l2day_rewards\.log/.test(run) && /l2day_state\.json/.test(run), 'writes Logs/l2day_rewards.log + Logs/l2day_state.json');
t(/server refused/.test(run), 'no bag change = stop (refused)');
t(/openNpc\(npc\)/.test(run) && !/walkTo\(/.test(run), 'talks through openNpc (walks in front, rule 0) - no own walkTo in Giran');
t(/\$\{SWARM_ROOT\}\\\\Logs\\\\l2day_/.test(run), 'Logs paths keep their double backslashes');
const hs = SRC.slice(SRC.indexOf("if (cmd === '!l2day')"), SRC.indexOf("if (cmd === '!l2day')") + 1400);
t(/L2DAY\.pending\.push/.test(hs) && /while \(L2DAY\.pending\.length\)/.test(hs), '!l2day orders arriving during a run wait in order (not dropped)');
t(/stashLetterReceiver/.test(hs), 'only the letters collector runs it');

// R6 the API (sandbox folders)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'l2day-'));
const DATA = path.join(tmp, 'data'), LOGS = path.join(tmp, 'Logs'); fs.mkdirSync(DATA); fs.mkdirSync(LOGS);
fs.writeFileSync(path.join(DATA, 'stash_rules.json'), JSON.stringify({ letters: { on: true, to: 'Dagger1' } }));
fs.writeFileSync(path.join(LOGS, 'bag_Dagger1.json'), JSON.stringify({ items: [{ id: L.N, count: 1 }, { id: 57, count: 9 }] }));
fs.writeFileSync(path.join(LOGS, 'clan_state.json'), JSON.stringify({ warehouse: { seenAt: '2026-10-30T22:21:00Z', items: Object.entries(stock).map(([id, count]) => ({ id: Number(id), count: id == L.N ? 115 : count })) } }));
fs.writeFileSync(path.join(LOGS, 'bag_Spoiler6.json'), JSON.stringify({ at: 'x', items: [{ id: L.A, count: 4 }, { id: L.T, count: 2 }, { id: 1060, count: 5 }] }));
fs.writeFileSync(path.join(LOGS, 'bag_Empty.json'), JSON.stringify({ items: [{ id: 57, count: 1 }] }));
fs.writeFileSync(path.join(LOGS, 'auto_queue.json'), JSON.stringify({ items: [{ id: 'q1', cmd: '!l2day Throne 3 x5', state: 'waiting' }, { id: 'q2', cmd: '!supply', state: 'waiting' }] }));
fs.writeFileSync(path.join(LOGS, 'l2day_rewards.log'), [
  { at: '2026-10-31T08:00:00Z', word: 'Throne', mult: 'x1', used: [], rewards: [{ id: 6622, name: 'Giant\'s Codex', count: 1 }] },
  { at: '2026-10-31T08:01:00Z', word: 'Throne', mult: 'x1', used: [], rewards: [{ id: 6622, name: 'Giant\'s Codex', count: 1 }, { id: 1540, name: 'Quick Healing Potion', count: 5 }] },
  { at: '2026-10-31T08:02:00Z', word: 'NCSoft', mult: 'x5', used: [], rewards: [{ id: 1540, name: 'Quick Healing Potion', count: 2 }, { id: L.A, name: 'L2Day - A', count: 1 }] }].map(r => JSON.stringify(r)).join('\r\n') + '\r\nnot json\r\n');
const API = require(path.join(ROOT, 'Dashboard', 'l2day_api.js'));
const info = API.info({ DIR: path.join(ROOT, 'Dashboard'), DATA, LOGS });
t(info.collector === 'Dagger1', 'collector = the letters receiver (stash_rules.json letters.to)');
t(info.stock.total[L.N] === 116 && info.stock.bag[L.N] === 1 && info.stock.clanWh[L.N] === 115, 'stock = collector bag + clan warehouse (N 1 + 115 = 116)');
t(info.letters.length === 14 && info.letters.every(x => /^icon\/etc_alphabet_/.test(x.icon)), 'every letter comes with its icon');
const w = Object.fromEntries(info.words.map(x => [x.word, x]));
t(w.LineageII.alone === 35 && w.LIIToggle.alone === 46 && w.NCSoft.alone === 26 && w.Throne.alone === 32, 'each word made alone from the stock (35 / 46 / 26 / 32)');
// PRIORITY-2026-10-31 (owner: "Always calculate based on top pick. LineageII is best, then L2Toggle and so on"): 'possible' = in that order
t(info.words.map(x => x.word).join() === 'LineageII,LIIToggle,NCSoft,Throne' && info.words.every((x, i) => x.rank === i + 1), 'the words come in the owner\'s order: LineageII, LIIToggle, NCSoft, Throne');
{ const left = Object.assign({}, info.stock.total); let okAll = true; info.words.forEach(x => { Object.entries(x.cost).forEach(([id, n]) => { left[id] -= n * x.possible; if (left[id] < 0) okAll = false; }); });
  t(w.LineageII.possible === 35 && okAll && w.LIIToggle.possible <= w.LIIToggle.alone && info.words.some(x => x.possible < x.alone), 'possible in priority order: the best word first, the next ones only from the letters left (never a letter counted twice)'); }
t(info.members.length === 1 && info.members[0].name === 'Spoiler6' && info.members[0].total === 6, 'letters still in other bags (collector and letter-less bags left out)');
t(info.queue.length === 1 && info.queue[0].cmd === '!l2day Throne 3 x5', 'the queue lists only !l2day items');
const R = info.rewards;
t(R.exchanges === 3 && R.history[0].word === 'NCSoft', '3 exchanges read (a broken line skipped), newest first');
t(R.total[0].name === 'Quick Healing Potion' && R.total[0].times === 2 && R.total[0].count === 7, 'rewards summed, most frequent first (Quick Healing Potion 2x, 7)');
t(R.total.every(x => /^icon\//.test(x.icon)) && R.history.every(r => r.rewards.every(g => g.id === L.A || /^icon\//.test(g.icon))), 'every reward comes with its item icon (no "?" icons)');
t(!R.total.some(x => x.id === L.A),'letters coming back are not shown as a reward');
t(R.byWord.Throne.exchanges === 2 && R.byWord.NCSoft.words === 5, 'per word: exchanges and words (x5 = 5 words)');
t(JSON.stringify(API.L2DAY_LETTER) === JSON.stringify(P.L2DAY_LETTER) && JSON.stringify(API.L2DAY_WORDS) === JSON.stringify(P.L2DAY_WORDS), 'the API tables equal swarm.js L2DAY-PURE');
fs.rmSync(tmp, { recursive: true, force: true });

// R7 dashboard wiring: route, menu, catalog, page rules
const html = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8'), srv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8');
t(/L2DayPage\.route\(kind, arg\)/.test(html) && /data-tab="l2day"/.test(html) && /l2daypage\.js/.test(html) && /l2daypage\.css/.test(html), 'index.html: route #/l2day + menu button "L2Day letters" + page files');
t(/require\('\.\/l2day_api'\)\.handle/.test(srv), 'server.js serves /api/l2day');
const CMDS = require(path.join(ROOT, 'Dashboard', 'commands.js'));
const list = CMDS.CATALOG || CMDS.catalog || CMDS.COMMANDS || CMDS.commands || (Array.isArray(CMDS) ? CMDS : null);
const spec = Array.isArray(list) ? list.find(c => c.id === 'l2day') : null;
t(!!spec && spec.safety === 'confirm', 'catalog entry l2day (safety confirm)');
if (spec) t(spec.re.test('!l2day LineageII 3 x10') && spec.re.test('!l2day throne 1') && !spec.re.test('!l2day Foo 1 x5') && !spec.re.test('!l2day Throne 1 x7'), 'catalog regex: the four words, a count, x1 / x5 / x10');
const pg = fs.readFileSync(path.join(ROOT, 'Dashboard', 'l2daypage.js'), 'utf8');
t(/\/api\/autoqueue/.test(pg) && /char:' \+ S\.d\.collector/.test(pg), 'the page queues through /api/autoqueue, lane = the collector');
t(/uiConfirm/.test(pg) && !/window\.confirm\(|alert\(/.test(pg), 'a queue click asks first (uiConfirm), never a browser alert');
t(/f\.n \* m > word\.possible/.test(pg), 'never queues more than the stock makes');
console.log(`\nl2day: ${ok} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
