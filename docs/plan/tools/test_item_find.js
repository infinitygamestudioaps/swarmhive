// ITEMFIND-2026-10-23 test (public tester Vykaax: "a Hive-wide item search to see who has something and how many"): GET /api/items/find
// (Dashboard/itemspage_api.js findItems) on the LIVE Logs, read only, compared with a straight count from the same files; plus the page wiring
// in Dashboard/itemspage.js (find box with no character picked, results -> that character's Items page on that place).
//   node docs/plan/tools/test_item_find.js       (exit code 1 when a check fails)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..'), LOGS = path.join(ROOT, 'Logs');
let fails = 0, oks = 0;
const t = (ok, what, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (!ok && info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 300) : '')); if (ok) oks++; else fails++; };
const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };
(async () => {
  const SRC = fs.readFileSync(path.join(ROOT, 'Dashboard', 'itemspage_api.js'), 'utf8');
  const PAGE = fs.readFileSync(path.join(ROOT, 'Dashboard', 'itemspage.js'), 'utf8');
  const CSS = fs.readFileSync(path.join(ROOT, 'Dashboard', 'itemspage.css'), 'utf8');
  const A = require(path.join(ROOT, 'Dashboard', 'itemspage_api.js'));
  // 1) wiring
  t(typeof A.findItems === 'function', 'the API exports findItems');
  t(/if \(sub === 'find'\) return out\(findItems\(ctx, q\('q'\)\)\), true;/.test(SRC), 'GET /api/items/find is routed inside handle() (/api/items/*)');
  t(!/writeFileSync|appendFileSync|commandRun/.test(SRC.slice(SRC.indexOf('function findItems'), SRC.indexOf('// ---- the plan ----'))), 'findItems only reads (no write, no order)');
  t(/cached\('find_bag_'/.test(SRC) && /cached\('find_wh_'/.test(SRC) && /cached\('find_clan'/.test(SRC), 'file reads are cached by mtime');
  t(/id="itpFind"/.test(PAGE) && /\/api\/items\/find\?q=/.test(PAGE) && /function renderFind\(\)/.test(PAGE) && /function findGo\(gi, hi\)/.test(PAGE), 'the page has the "Find an item" box, results and tap-to-open');
  t(PAGE.indexOf('id="itpFindBox"') < PAGE.indexOf('<div id="itpChars">'), 'the find box sits above the character picker (works with no character picked)');
  t(/S\.place = H\.kind === 'clan' \? 'clan' : H\.rows\.some\(x => x\.where === 'bag' \|\| x\.where === 'worn'\) \? 'bag' : 'wh';/.test(PAGE) && /location\.hash = '#\/items\/' \+ encodeURIComponent\(name\)/.test(PAGE), 'a result opens that character on the place it was found');
  t(/q\.length < 2/.test(PAGE) || /length < 2/.test(PAGE), 'the page waits for 2 letters');
  t(!/\balert\(|\bconfirm\(|\bprompt\(/.test(PAGE.replace(/uiConfirm\(/g, '')), 'no browser alert / confirm / prompt on the page');
  t(/#tab-items \.itp-fh \{[^}]*min-height: 48px/.test(CSS), 'a result row is big enough to tap (48 px)');
  // 2) live data
  const ctx = { DIR: path.join(ROOT, 'Dashboard'), DATA: path.join(ROOT, 'Scripts', 'data'), LOGS, ROOT, readStates: () => [] };
  t(A.findItems(ctx, 'x').code === 400 && A.findItems(ctx, ' ').code === 400, 'one letter is refused (at least 2)');
  t(A.findItems(ctx, 'y'.repeat(61)).code === 400, 'a silly long search is refused');
  const bags = fs.readdirSync(LOGS).filter(f => /^bag_[A-Za-z0-9_\-]{1,40}\.json$/.test(f)).map(f => rj(path.join(LOGS, f))).filter(j => j && Array.isArray(j.items));
  const cs = rj(path.join(LOGS, 'clan_state.json')) || {};
  if (!bags.length) { console.log('skip live part: no Logs/bag_<Name>.json on this install'); console.log(fails ? `\n${fails} FAILED` : `\nall ${oks} checks passed`); process.exit(fails ? 1 : 0); }
  // pick a word that is in somebody's bag: the most common non-adena item name word of 4+ letters
  const words = {}; bags.forEach(j => j.items.forEach(r => String(r.name || '').split(/[^A-Za-z]+/).filter(w => w.length >= 4).forEach(w => { words[w.toLowerCase()] = (words[w.toLowerCase()] || 0) + 1; })));
  const word = Object.keys(words).filter(w => !/adena/.test(w)).sort((a, b) => words[b] - words[a])[0];
  const t0 = Date.now(); const R = A.findItems(ctx, word.toUpperCase()); const ms1 = Date.now() - t0;
  const t1 = Date.now(); A.findItems(ctx, word); const ms2 = Date.now() - t1;
  t(R.ok && R.items.length > 0, `"${word.toUpperCase()}" finds ${R.items.length} item(s) in ${R.results} place(s) — case does not matter`, R.error);
  t(R.items.every(g => g.name.toLowerCase().includes(word) || g.holders.length), 'every result matches the search');
  t(R.results <= 200 && R.items.reduce((n, g) => n + g.holders.length, 0) === R.results, 'at most 200 results, counted per holder');
  t(ms2 < 400, `fast: ${ms1} ms first, ${ms2} ms with the cache`, { ms1, ms2 });
  // straight count from the files for the first found item, per character
  const g = R.items.find(x => x.holders.some(H => H.kind === 'char')) || R.items[0];
  const byChar = {}; fs.readdirSync(LOGS).forEach(f => { const m = /^bag_([A-Za-z0-9_\-]{1,40})\.json$/.exec(f); if (!m) return; const j = rj(path.join(LOGS, f)); if (!j || !Array.isArray(j.items)) return; j.items.filter(r => Number(r.id) === g.id).forEach(r => { byChar[m[1]] = (byChar[m[1]] || 0) + (Number(r.count) || 1); }); });
  fs.readdirSync(LOGS).forEach(f => { const m = /^wh_private_([A-Za-z0-9_\-]{1,40})\.json$/.exec(f); if (!m) return; const j = rj(path.join(LOGS, f)); if (!j || !Array.isArray(j.items)) return; j.items.filter(r => Number(r.id) === g.id).forEach(r => { byChar[m[1]] = (byChar[m[1]] || 0) + (Number(r.count) || 1); }); });
  const got = {}; g.holders.filter(H => H.kind === 'char').forEach(H => { got[H.name] = H.total; });
  const clanN = cs.warehouse && Array.isArray(cs.warehouse.items) ? cs.warehouse.items.filter(r => Number(r.id) === g.id).reduce((n, r) => n + (Number(r.count) || 1), 0) : 0;
  const clanH = g.holders.find(H => H.kind === 'clan');
  t(!g.more && JSON.stringify(Object.keys(byChar).sort().map(k => [k, byChar[k]])) === JSON.stringify(Object.keys(got).sort().map(k => [k, got[k]])), `${g.name}: the same holders and counts as the files (bag + worn + warehouse)`, { byChar, got });
  t((clanH ? clanH.total : 0) === clanN, `${g.name}: clan warehouse count ${clanN}`, { clanH, clanN });
  t(g.total === Object.values(byChar).reduce((a, b) => a + b, 0) + clanN || !!g.more, `${g.name}: ${g.total} in all`);
  t(g.holders.every(H => H.rows.every(x => ['bag', 'worn', 'wh', 'clan'].includes(x.where) && x.count > 0 && Number.isInteger(x.enchant))), 'every holder row says where (bag / worn / warehouse / clan warehouse), how many and the enchant');
  t(g.holders.every(H => H.kind === 'clan' ? 'clanAt' in H : (!H.rows.some(x => x.where === 'bag' || x.where === 'worn') || !!H.bagAt)), 'each source says how old it is (bag time / warehouse seen time)');
  t(g.holders.filter(H => H.kind === 'clan').length <= 1 && (g.holders.findIndex(H => H.kind === 'clan') === -1 || g.holders.findIndex(H => H.kind === 'clan') === g.holders.length - 1), 'the clan warehouse is one holder, listed last');
  // worn pieces are kept apart from the bag
  const worn = bags.map(j => ({ j, r: j.items.find(r => r.eq && String(r.name || '').length >= 4) })).find(x => x.r);
  if (worn) { const W = A.findItems(ctx, worn.r.name), WG = W.items.find(x => x.id === Number(worn.r.id)), WH = WG && WG.holders.find(H => H.name === worn.j.name);
    t(!!(WH && WH.rows.some(x => x.where === 'worn')), `a worn piece shows as worn (${worn.j.name}: ${worn.r.name})`, WH); }
  // the enchant level is kept apart (the clan warehouse often has +N pieces)
  const ench = cs.warehouse && Array.isArray(cs.warehouse.items) ? cs.warehouse.items.find(r => Number(r.enchant) > 0 && String(r.name || '').replace(/^\+\d+\s+/, '').length >= 4) : null;
  if (ench) { const nm = String(ench.name).replace(/^\+\d+\s+/, ''); const E = A.findItems(ctx, nm), EG = E.items.find(x => x.id === Number(ench.id)), EH = EG && EG.holders.find(H => H.kind === 'clan');
    t(!!(EH && EH.rows.some(x => x.enchant === Number(ench.enchant))), `the enchant level shows (+${ench.enchant} ${nm} in the clan warehouse)`, EH);
    t(!!EG && !/^\+\d/.test(EG.name), 'the item name is clean (no "+N" in front)', EG && EG.name); }
  t(A.findItems(ctx, 'zzqx no such item').items.length === 0, 'a name nobody has gives an empty list (no error)');
  console.log(fails ? `\n${fails} FAILED, ${oks} ok` : `\nall ${oks} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
