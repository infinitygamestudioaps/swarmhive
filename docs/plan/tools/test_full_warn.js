// FULLWARN 2026-10-14 (owner: "I want a warning when the warehouse or inventory is full from now on"): the bag levels (swarm.js FULLWARN-PURE),
// the system message kinds, the host wiring, server.js fullStatus and the dashboard banner (index.html renderFull) on stubs.
//   node docs/plan/tools/test_full_warn.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let fails = 0; const check = (c, name, info) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${name}${!c && info ? ' — ' + info : ''}`); if (!c) fails++; };
const a = src.indexOf('// FULLWARN-PURE-BEGIN'), b = src.indexOf('// FULLWARN-PURE-END');
const P = new Function(src.slice(a, b) + '\nreturn { fullBagLevel, fullSysKind, FULLW_CFG };')();
const T = 1e12, L = (o) => P.fullBagLevel(Object.assign({ now: T }, o)).level;

check(L({ count: 50, limit: 100 }) === '' && L({ count: 80, limit: 100 }) === 'near' && L({ count: 90, limit: 100 }) === 'full', 'slots: 80 % nearly full, 90 % full');
check(L({ count: 20, load: 70, maxLoad: 100 }) === 'near' && L({ count: 20, load: 80, maxLoad: 100 }) === 'full', 'weight: 70 % nearly full, 80 % full (the server blocks quests from 80 %)');
check(L({ count: 148, refused: { n: 140, atMs: T - 3600e3 } }) === 'full' && L({ count: 130, refused: { n: 140, atMs: T - 3600e3 } }) === 'near' && L({ count: 120, refused: { n: 140, atMs: T - 3600e3 } }) === '', 'unknown slot limit: a server refusal at N kinds = full from N, nearly full from N - 15');
check(L({ count: 148, refused: { n: 140, atMs: T - 25 * 3600e3 } }) === '', 'a refusal older than 24 h is forgotten');
check(L({ count: 0, limit: 0 }) === '' && P.fullBagLevel({ count: 95, limit: 100, now: T }).why === '95 of 100 slots', 'nothing known = no warning; the reason is plain words');
check(P.fullSysKind(1118, '') === 'bag' && P.fullSysKind(0, 'Unable to process this request until your inventory\'s weight and slot count are less than 80 percent of capacity.') === 'bag'
  && P.fullSysKind(130, '') === 'wh' && P.fullSysKind(0, 'Your warehouse is full.') === 'wh' && P.fullSysKind(27, 'Your casting has been interrupted') === '', 'system messages: bag full / warehouse full / other');
// host wiring
check(/try \{ fullSys\(Number\(id\), lastSysMsg\.text\); \}/.test(src), 'every system message goes through fullSys');
check(/setInterval\(fullTick, 60000\)/.test(src) && /st\.full = fp/.test(src), 'every window judges its bag every minute and reports it in swarm_state.full');
check(/r\.why === 'warehouse full'\) whFullSet\(kind, true/.test(src) && /whFullSet\(kind, false, `\$\{r\.got/.test(src), 'a "warehouse full" store sets the warehouse record; a take-out clears it');
check(/SayToParty\(m\.slice\(0, 250\)\)/.test(src.slice(src.indexOf('function fullTick'), src.indexOf('function whFullSet'))), 'a rise to nearly full / full is said in party chat');
// server.js fullStatus (copied out, stubbed readJson)
const sv = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), fs0 = sv.indexOf('function fullStatus('), fs1 = sv.indexOf('\n}\n', fs0) + 3;
const WH = { clan: { full: true, at: '2026-10-14T14:57:00Z', by: 'Dagger1' }, private: { Tank1: { full: true, at: 'x', by: 'Tank1' }, Bishop1: { full: false } } };
const fullStatus = new Function('readJson', 'path', 'LOGS', sv.slice(fs0, fs1) + '\nreturn fullStatus;')(() => WH, path, 'L');
const st = fullStatus([{ name: 'Dagger1', ageSec: 5, full: { level: 'full', why: 'x' } }, { name: 'Bishop1', ageSec: 5, full: { level: 'near', why: 'y' } }, { name: 'Old', ageSec: 900, full: { level: 'full' } }, { name: 'Ok', ageSec: 5 }]);
check(st.bags.length === 2 && st.bags[0].name === 'Dagger1' && st.clan && st.clan.by === 'Dagger1' && st.private.length === 1 && st.private[0].name === 'Tank1', 'server.js fullStatus: fresh bags (full first), clan + own warehouses that are full', JSON.stringify(st));
check(/full: fullStatus\(chars\)/.test(sv), '/api/state carries it');
// index.html renderFull on a stub element
const ix = fs.readFileSync(path.join(ROOT, 'Dashboard', 'index.html'), 'utf8'), r0 = ix.indexOf('function renderFull('), r1 = ix.indexOf('\n}\n', r0) + 3;
const el = { hidden: true, innerHTML: '', className: '' };
const renderFull = new Function('$', 'esc', ix.slice(r0, r1) + '\nreturn renderFull;')(() => el, (s) => String(s));
renderFull(st);
check(!el.hidden && /CLAN warehouse is full/.test(el.innerHTML) && /Bag FULL: .*Dagger1/.test(el.innerHTML) && /nearly full: .*Bishop1/.test(el.innerHTML) && /#\/storage/.test(el.innerHTML) && /\bbad\b/.test(el.className), 'banner: clan warehouse, full bags (links to the character), nearly full, a way to the Storage page');
renderFull({ bags: [], clan: null, private: [], ore: [{ name: 'Bishop1', skill: 'Major Heal' }] });
check(!el.hidden && /Out of Spirit Ore: .*Bishop1/.test(el.innerHTML) && /no trip for it/.test(el.innerHTML), 'ORE: "out of Spirit Ore" line (they keep healing with other heals)');
{ const sw = src.slice(src.indexOf('const supplyLow = {'), src.indexOf('const supplyLow = {') + 2500);
  check(!/n\.id === 3031 && n\.have </.test(sw) && /n\.id !== 3031/.test(sw), 'ORE: low Spirit Ore never starts a supply run (owner: a long hunt is not broken off for it)'); }
check(/st\.oreOut = /.test(src) && /ore = \(chars \|\| \[\]\)\.filter\(c => c && c\.oreOut/.test(sv), 'ORE: the bot reports it, server.js passes it to the bar');
renderFull({ bags: [], clan: null, private: [] });
check(el.hidden && !el.innerHTML, 'banner hidden when nothing is full');
check(/id="fullBar"/.test(ix) && /renderFull\(STATE\.full\)/.test(ix), 'the bar sits under the header and is drawn on every refresh (every page)');
console.log(fails ? `\n${fails} FAILED` : '\nall full-warning checks passed');
process.exit(fails ? 1 : 0);
