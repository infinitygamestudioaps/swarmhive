// OFFLINE TEST of the "What runs by itself" overview (Discord player Roketta 2026-10-15): Dashboard/autocatalog.js (the ONE list) +
// Dashboard/autooverview_api.js (on / off / waits for Start + why, per party) + the page wiring.
//   1) the catalog: unique keys, known groups / gates, one plain sentence each, a working "Change" target (party settings section / page route)
//   2) COMPLETE: every swarm.js runAuto('<kind>') + RUN_ALWAYS kind, every Dashboard/partyauto_api.js KINDS key and every
//      Dashboard/clanauto_api.js switch has a catalog entry (a new automation without an entry FAILS here); every eval has an evaluator
//   3) the API on scratch files: a stopped party (needs-Start rows wait, survival always on, defaults off), a started party with its own switches,
//      a per-character difference, the daily Kamaloka switch, the Seven Signs row = Dashboard/sslogic.js (the bot's sentence)
//   4) public package: the PRIVATE blocks cut out (release_build.js rule) leave a working catalog / API without the owner tools, still complete
//      against the public swarm.js; no character names in the new files
//   5) index.html: tab button, route, scripts; server.js hook
//   node docs/plan/tools/test_auto_overview.js      (exit code 1 when a check fails)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..', '..'), DASH = path.join(ROOT, 'Dashboard');
const rdT = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const CAT = require(path.join(DASH, 'autocatalog.js')), API = require(path.join(DASH, 'autooverview_api.js'));
const PA = require(path.join(DASH, 'partyauto_api.js')), CA = require(path.join(DASH, 'clanauto_api.js'));
const SSL = require(path.join(DASH, 'sslogic.js'));
const swarm = rdT('Scripts_dev/swarm.js'), html = rdT('Dashboard/index.html'), server = rdT('Dashboard/server.js'), psJs = rdT('Dashboard/partysettings.js');
const PRIV = /[ \t]*(?:\/\/|<!--) PRIVATE-START[\s\S]*?PRIVATE-END(?: -->)?[ \t]*\r?\n?/g;   // = release_build.js put()

/** the kinds swarm.js gates: runAuto('<kind>') + RUN_ALWAYS */
function swarmKinds(src) {
  const k = new Set(); (src.match(/runAuto\('([^']+)'\)/g) || []).forEach(x => k.add(x.slice(9, -2)));
  const m = src.match(/var RUN_ALWAYS = \/\^\(([^)]+)\)\$\//); if (m) m[1].split('|').forEach(x => k.add(x));
  return k;
}
// the owner-only kinds (their swarm.js code ships, the catalog entry is cut out of the public package)
const OWNER_KINDS = ['raid circuit'];
function coverage(cat, src, label, pub) {
  const have = new Set(cat.kinds()), need = swarmKinds(src); if (pub) OWNER_KINDS.forEach(k => need.delete(k));
  const missing = [...need].filter(k => !have.has(k)), stale = [...have].filter(k => !need.has(k));
  check(need.size >= 20 && !missing.length, `${label}: every swarm.js runAuto / RUN_ALWAYS kind has a catalog entry (${need.size} kinds)${missing.length ? ' — MISSING: ' + missing.join(', ') : ''}`);
  check(!stale.length, `${label}: no catalog kind that swarm.js does not have${stale.length ? ' — STALE: ' + stale.join(', ') : ''}`);
}

// ---- 1) the catalog -------------------------------------------------------------------------------------------------------------
{
  const E = CAT.ENTRIES, keys = E.map(e => e.key), groups = new Set(CAT.GROUPS.map(g => g.key));
  check(new Set(keys).size === keys.length && E.length >= 40, `catalog: ${E.length} entries, unique keys`);
  check(E.every(e => groups.has(e.group)) && CAT.GROUPS.every(g => E.some(e => e.group === g.key)), 'every entry in a known group, no empty group');
  check(E.every(e => ['always', 'start', 'switch', 'order', 'manual'].includes(e.gate) && ['on', 'off', 'always', 'order', 'manual'].includes(e.def)), 'every entry: a known gate + new-install default');
  const bad = E.filter(e => !e.title || !e.switch || !/^[A-Z][^\n]{15,260}[.]$/.test(e.what) || (e.what.match(/\. [A-Z]/g) || []).length > 0);
  check(!bad.length, `every entry: a title, where it is switched, and what it does in ONE plain sentence${bad.length ? ' — BAD: ' + bad.map(e => e.key).join(', ') : ''}`);
  const tech = E.filter(e => /\.json|swarm\.js|Scripts\/|Logs\/|CONFIG\./.test(e.title + e.what + e.switch));
  check(!tech.length, `plain words: no file names / code in the texts${tech.length ? ' — ' + tech.map(e => e.key).join(', ') : ''}`);
  const secs = new Set((psJs.match(/section\('([a-z]+)'/g) || []).map(x => x.slice(9, -1)));
  const routeOk = (hash) => { const k = hash.replace(/^#\//, '').split('/')[0]; return new RegExp(`data-tab="${k}"`).test(html) || (k === 'levels' && /'levels'/.test(rdT('Dashboard/circuitpage.js'))); };
  const noWhere = E.filter(e => e.gate !== 'always' && e.gate !== 'manual' && !e.where);
  const badWhere = E.filter(e => e.where && !(e.where.card || (e.where.settings && secs.has(e.where.settings)) || (e.where.hash && routeOk(e.where.hash))));
  check(!noWhere.length && !badWhere.length, `every switchable entry has a working "Change" target (party settings sections: ${[...secs].join(', ')})${noWhere.concat(badWhere).length ? ' — BAD: ' + noWhere.concat(badWhere).map(e => e.key).join(', ') : ''}`);
}

// ---- 2) complete ------------------------------------------------------------------------------------------------------------------
// 2026-10-15: inside the public package the owner entries are already cut out (no owner rows) = check it as the public build
const IS_PUBLIC = !CAT.ENTRIES.some(e => e.owner);
coverage(CAT, swarm, IS_PUBLIC ? 'this install (public package)' : 'owner install', IS_PUBLIC);
{
  const pk = new Set(CAT.ENTRIES.reduce((a, e) => a.concat(e.pauto || []), []));
  const miss = PA.KINDS.map(k => k.key).filter(k => !pk.has(k));
  check(!miss.length, `every party automation switch (partyauto_api.js KINDS: ${PA.KINDS.map(k => k.key).join(', ')}) has an entry${miss.length ? ' — MISSING: ' + miss.join(', ') : ''}`);
  const ck = new Set(CAT.ENTRIES.reduce((a, e) => a.concat(e.clan || []), []));
  const cmiss = Object.keys(CA.DEF).concat('levelUp').filter(k => !ck.has(k));
  check(!cmiss.length, `every clan switch (clanauto_api.js) has an entry${cmiss.length ? ' — MISSING: ' + cmiss.join(', ') : ''}`);
  const noEval = CAT.ENTRIES.filter(e => e.eval && typeof API.EVAL[e.eval] !== 'function'), unused = Object.keys(API.EVAL).filter(k => !CAT.ENTRIES.some(e => e.eval === k));
  check(!noEval.length && !unused.length, `every eval has an evaluator, no unused evaluator${noEval.length ? ' — NO EVALUATOR: ' + noEval.map(e => e.key).join(', ') : ''}${unused.length ? ' — UNUSED: ' + unused.join(', ') : ''}`);
}

// ---- 3) the API on scratch files ----------------------------------------------------------------------------------------------------
{
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'auov-')), D = path.join(TMP, 'data'), L = path.join(TMP, 'logs'); fs.mkdirSync(D); fs.mkdirSync(L);
  const w = (dir, f, o) => fs.writeFileSync(path.join(dir, f), JSON.stringify(o));
  const ENV = ['SWARM_RUNSTATE_FILE', 'SWARM_PARTYAUTO_FILE', 'SWARM_RESRULES_FILE', 'SWARM_TACTICS_FILE', 'SWARM_HUNTTIMER_FILE', 'SWARM_ROUTERULES_FILE', 'SWARM_DAILY_FILE', 'SWARM_SEVENSIGNS_FILE', 'SWARM_CLANQUESTS_FILE', 'SWARM_CLANAUTO_FILE'];
  const saved = {}; ENV.forEach(k => { saved[k] = process.env[k]; delete process.env[k]; });
  w(D, 'run_state.json', { v: 1, default: false, parties: { Gamma: { on: true, at: new Date().toISOString(), by: 'dashboard', why: 'Start on the dashboard' } }, chars: {} });
  w(D, 'party_auto.json', { v: 1, default: { supplyWatch: false, sell: false, dyes: false }, parties: { Gamma: { supplyWatch: true, sell: false, dyes: false } }, chars: { Delta: { dyes: true } } });
  w(L, 'daily_enabled.json', { Gamma: { kamaloka: true } });
  w(D, 'seven_signs.json', { parties: ['Gamma'], chars: [], contributeStones: true, gate: 'strict' });
  w(L, 'sevensigns_state.json', { period: 'competition', checkedAt: Date.now() - 3600e3 });
  w(D, 'clan_quests.json', { clan: { name: 'TestClan', leader: 'Alpha', level: 2, auto: {} }, quests: {} });
  const now = new Date().toISOString();
  const states = [{ name: 'Alpha', party: 'Alpha', updated: now, mode: 'idle', task: '' }, { name: 'Beta', party: 'Alpha', updated: now },
    { name: 'Gamma', party: 'Gamma', updated: now, mode: 'autolevel', task: 'autolevel: Test Field · lvl 30' }, { name: 'Delta', party: 'Gamma', updated: now }];
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
  const ctx = { ROOT, DIR: DASH, DATA: D, LOGS: L, readJson, readStates: () => states.map(s => Object.assign({ ageSec: 5 }, s)),
    teamMap: () => ({ Alpha: 'Alpha', Beta: 'Alpha', Gamma: 'Gamma', Delta: 'Gamma' }), reloadCfg: () => ({ accounts: ['Alpha', 'Beta', 'Gamma', 'Delta'].map(c => ({ character: c })) }), mainLeader: 'Alpha' };
  let o = null; try { o = API.overview(ctx); } catch (e) { console.log('   ' + e.stack); }
  ENV.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  const P = (l) => o && o.parties.find(p => p.leader === l), I = (l, k) => { const p = P(l); return p && p.items.find(i => i.key === k); };
  check(!!(o && o.parties.length === 2 && P('Alpha') && P('Gamma')), `overview: 2 parties (${o ? o.parties.map(p => p.leader).join(', ') : '?'})`);
  check(!!o && o.parties.every(p => p.items.length === CAT.ENTRIES.length), 'every party has one row per catalog entry');
  check(!!o && !o.parties.some(p => p.items.some(i => /could not be read/.test(i.why))), `no row failed to evaluate${o ? ' ' + o.parties.flatMap(p => p.items.filter(i => /could not be read/.test(i.why)).map(i => i.key + ': ' + i.why)).join('; ') : ''}`);
  const a = (k) => I('Alpha', k) || {}, g = (k) => I('Gamma', k) || {};
  check(P('Alpha') && !P('Alpha').started && a('start').state === 'off' && /Off/.test(a('start').why), `stopped party: Start row OFF ("${a('start').why}")`);
  check(a('leveling').state === 'paused' && /is stopped — it runs once you press Start/.test(a('leveling').why), `stopped party: leveling waits for Start ("${a('leveling').why}")`);
  check(a('supplyWatch').state === 'off' && /\(off until you switch it on\)/.test(a('supplyWatch').why), `stopped party, nothing switched on: supply runs OFF (default) ("${a('supplyWatch').why}")`);
  check(['survive', 'unstuck', 'orders'].every(k => a(k).state === 'always'), 'survival / unstuck / your orders: ALWAYS ON even when stopped');
  check(a('res').state === 'on' && a('skills').state === 'on' && /works whether the party is started or not/.test(a('res').why), 'own-switch rows (resurrect, Hive skills): ON by default, independent of Start');
  check(a('enchant').state === 'manual' && a('siege').state === 'manual' && a('raidhunt').state === 'order', 'enchanting / siege: never by itself; raid hunt: your order');
  check(P('Gamma').started && g('leveling').state === 'on' && g('leveling').now === 'autolevel: Test Field · lvl 30', `started party: leveling ON + what the leader does now ("${g('leveling').now}")`);
  check(g('supplyWatch').state === 'on' && /set for this party and the party is started/.test(g('supplyWatch').why), `started party + its own switch: supply runs ON ("${g('supplyWatch').why}")`);
  check(g('sell').state === 'off' && /set for this party/.test(g('sell').why), 'switched off for the party: selling OFF');
  check(g('dyes').state === 'off' && /Delta has it on \(per character\)/.test(g('dyes').why), `per-character difference named ("${g('dyes').why}")`);
  check(g('kamaloka').state === 'on' && a('kamaloka').state === 'off', 'daily Kamaloka: ON for the party that switched it on, OFF for the other');
  const gate = SSL.partyGate({ state: { period: 'competition', checkedAt: Date.now() - 3600e3 }, members: [{ name: 'Gamma', rec: {} }, { name: 'Delta', rec: {} }], party: 'Gamma', kind: 'catacomb', optin: { parties: ['Gamma'] } });
  check(g('sevensigns').state === 'on' && g('sevensigns').now === 'Catacombs / necropolises: ' + gate.reason && /^Not signed up yet: Gamma, Delta/.test(gate.reason), `Seven Signs row: enrolled + the bot's sentence ("${g('sevensigns').now}")`);
  check(a('sevensigns').state === 'off' && /^Catacombs \/ necropolises: Not open for Alpha, Beta: not signed up with the Lords of Dawn/.test(a('sevensigns').now), `not enrolled: "${a('sevensigns').now}"`);
  check(['clanLevelUp', 'clanInvite'].every(k => a(k).state === 'paused' || a(k).state === 'off') && /clan leader's party \(Alpha\)/.test(a('clanInvite').why), `clan rows follow the clan leader's party ("${a('clanInvite').why}")`);
  check(o.parties.every(p => p.items.every(i => typeof i.why === 'string' && i.why.length > 5 && !/undefined|NaN|\[object/.test(i.why + i.now))), 'every row has a readable why (no undefined / NaN)');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
}

// ---- 4) public package ----------------------------------------------------------------------------------------------------------------
{
  const load = (code) => { const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, (n) => require(path.join(DASH, n))); return m.exports; };
  const catPub = load(rdT('Dashboard/autocatalog.js').replace(PRIV, ''));
  const own = catPub.ENTRIES.filter(e => e.owner || /circuit|level lock/i.test(e.title + e.what + e.switch));
  check(!own.length && !catPub.GROUPS.some(g => g.key === 'owner') && (IS_PUBLIC || CAT.ENTRIES.some(e => e.owner)), `public catalog: the owner tools (circuit, level lock) are cut out (${CAT.ENTRIES.length} -> ${catPub.ENTRIES.length} entries)`);
  coverage(catPub, swarm.replace(PRIV, ''), 'public package', true);
  let ok = true; try { new vm.Script(rdT('Dashboard/autooverview_api.js').replace(PRIV, '')); } catch (e) { ok = false; console.log('   ' + e.message); }
  const apiPub = rdT('Dashboard/autooverview_api.js').replace(PRIV, '');
  check(ok && !/circuit|level_control/i.test(apiPub.replace(/^\/\/.*$/gm, '')), 'public API: compiles, no circuit / level lock code left');
  const pubEvals = (apiPub.match(/^  ([a-z]+)\(P, F/gm) || []).map(x => x.trim().split('(')[0]);
  const missE = catPub.ENTRIES.filter(e => e.eval && !pubEvals.includes(e.eval));
  check(!missE.length, `public API has an evaluator for every public entry${missE.length ? ' — MISSING: ' + missE.map(e => e.key).join(', ') : ''}`);
  // no character names in the new files
  let cfg = {}; try { cfg = JSON.parse(rdT('swarm.config.json').replace(/^﻿/, '')); } catch (e) { }
  const names = [...new Set((cfg.accounts || []).map(a => a.character).filter(n => n && n.length >= 4))];
  const files = ['Dashboard/autocatalog.js', 'Dashboard/autooverview.js', 'Dashboard/autooverview_api.js', 'Dashboard/autooverview.css'];   // sslogic.js = 1:1 copies of swarm.js (its comments name characters; release_build.js neutralises them)
  const hits = []; files.forEach(f => { const t = rdT(f); names.forEach(n => { if (new RegExp('\\b' + n + '\\b').test(t)) hits.push(f + ': ' + n); }); });
  check(!hits.length, `no character names in the new files (${names.length} names checked)${hits.length ? ' — ' + hits.join(', ') : ''}`);
}

// ---- 5) wiring ------------------------------------------------------------------------------------------------------------------------
check(/<button data-tab="auto"[^>]*>.*Automations<\/button>/.test(html), 'index.html: an "Automations" tab button');
check(/if \(window\.AutoPage && AutoPage\.route\(kind, arg\)\) return;/.test(html), 'index.html: #/auto routes to AutoPage');
check(/<script src="\/autocatalog\.js"><\/script>\s*<script src="\/autooverview\.js"><\/script>/.test(html) && /href="\/autooverview\.css"/.test(html), 'index.html: catalog + page scripts and the stylesheet');
check(/require\('\.\/autooverview_api'\)\.handle\(req, res, url,/.test(server), 'server.js: the /api/autooverview hook (needs a dashboard restart)');
check(/window\.AutoPage = \{ route/.test(rdT('Dashboard/autooverview.js')) && !/\balert\(|\bconfirm\(|\bprompt\(/.test(rdT('Dashboard/autooverview.js')), 'page module: window.AutoPage, no browser alert / confirm / prompt');
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
