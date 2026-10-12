#!/usr/bin/env node
// test_masterwork.js — MASTERWORK weapons (forum topic 430, 2026-10-12). Read-only except temp copies in os.tmpdir().
//   node docs/plan/tools/test_masterwork.js [path/to/patch_masterwork.js]
// 1) Scripts/data/masterwork.json + masterwork_ids.json vs the forum chart and a fresh build from the datapack
// 2) MASTERWORK-PURE mwGainRule (taken from a patched COPY of Scripts_dev/swarm.js): MW vs plain cases
// 3) patch_masterwork.js applies on a fresh copy, node --check passes, a second run is refused
// 4) Dashboard/gearpage_api.js masterwork labels + Dashboard/gearpage.js mwChip
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const PATCH = process.argv.slice(2).filter(a => !/^--/.test(a))[0] || process.env.MW_PATCH || path.join(os.tmpdir(), 'claude', 'C--L2-L2Swarm', '9d69d83a-07bd-4424-92b7-5679277c4b38', 'scratchpad', 'patch_masterwork.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

console.log('--- data');
const J = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'masterwork.json'), 'utf8'));
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'masterwork_ids.json'), 'utf8'));
ok(J.items.length > 700, `masterwork items: ${J.items.length}`);
ok(J.items.every((i, k) => J.byId[i.id] === k), 'byId points at every item');
ok(Object.keys(S.ids).length === J.items.length && J.items.every(i => S.ids[i.id] && S.ids[i.id][0] === i.mw && S.ids[i.id][1] === i.bonus), 'masterwork_ids.json = the slim copy of masterwork.json');
ok(S.mwMarginPct === 10 && J.rules.mwMarginPct === 10, 'margin 10 %');
ok(/not complete/.test(J.sources.forum.note) && /rough shape/.test(J.sources.forum.note), 'the forum caveat ("not complete", "rough shape") is recorded');
const item = (id) => J.items[J.byId[id]];
const gs = item(10871);
ok(gs && gs.name === 'Great Sword - Lightning - Health' && gs.baseId === 78 && gs.grade === 'B' && gs.wtype === 'SWORD' && gs.hands === 2 && gs.sa === 'Health' && gs.mw === 'Lightning' && gs.bonus === 'Critical rate +54.4', '10871 Great Sword - Lightning - Health: base 78, B, 2h sword, SA Health, Critical rate +54.4');
ok(item(11112) && item(11112).bonus === 'Attack range +100' && item(11112).baseId === 9348, 'Reaper - Clairvoyance: Attack range +100, base Reaper 9348');
ok(item(16134) && item(16134).mw === 'Thunder' && item(16134).pvp, '"Vesper Cutter- Thunder {PvP}" (no space before the dash in the datapack) is parsed');
// forum chart values (GUIDE) vs the datapack
const bonusesOf = (mw) => Object.keys((J.names[mw] || {}).bonuses || {}).join(' | ');
ok(/Atk\. Spd\. \+5%/.test(bonusesOf('Gale')) && /Atk\. Spd\. \+5%/.test(bonusesOf('Great Gale')), 'Gale / Great Gale: Atk. Spd. +5 % (forum 5 %)');
ok(/Critical rate \+54\.4/.test(bonusesOf('Lightning')) && /Critical rate \+52\.2/.test(bonusesOf('Lightning')), 'Lightning: crit rate 54.4 / 52.2 (forum)');
[220, 340, 415, 528, 268, 156, 377].forEach(v => ok(new RegExp('Critical damage \\+' + v + '(\\D|$)').test(bonusesOf('Thunder')), `Thunder: critical damage ${v} (forum)`));
[17.42, 22.1, 42.12, 32.97, 21.2, 26.9, 51.26, 31.25].forEach(v => ok(bonusesOf('Destruction').includes('P. Atk. +' + v), `Destruction: P. Atk. +${v} (forum)`));
[3.3, 3.9, 4.2].forEach(v => ok(bonusesOf('Concentration').includes('Accuracy +' + v), `Concentration: accuracy +${v} (forum)`));
ok(/5% chance to stun/.test(bonusesOf('Landslide')) && /8% chance to stun/.test(bonusesOf('Landslide')), 'Landslide: stun chance 5 / 8 % (forum)');
ok(/HP regen \+5%/.test(bonusesOf('On Fire')), 'On Fire: HP regen +5 % (forum)');
ok(/Evasion \+3\.3/.test(bonusesOf('Confusion')), 'Confusion: evasion +3.3 (forum)');
ok(/HP absorb .*\+3/.test(bonusesOf('Evil Spirit')), 'Evil Spirit: absorbs 3 % of the damage (forum "absorbs damage by 3")');
ok(/chance to poison/.test(bonusesOf('Molar')), 'Molar: chance to poison (forum, no value)');
ok(/Attack range \+100/.test(bonusesOf('Clairvoyance')), 'Clairvoyance: range +100 (forum)');
ok(J.forumCheck.length === 34, 'all 34 forum rows checked');
const bad = J.forumCheck.filter(c => !c.ok).map(c => c.mw + '/' + c.kind).sort();
ok(JSON.stringify(bad) === JSON.stringify(['Earth/1H Blunt', 'Earth/Dual Sword']), 'only 2 forum mismatches, recorded: ' + bad.join(', '));
ok(J.forumMismatches.length === 2 && J.forumMismatches.every(t => /Earth/.test(t)), 'forumMismatches text present');
ok(Array.isArray(J.datapackQuirks) && J.datapackQuirks.some(t => /^16042 Vesper Cutter - Thunder: Critical rate/.test(t)), 'datapack quirks recorded (e.g. Vesper Cutter - Thunder carries a crit RATE skill)');
ok(J.mammonExchange && J.varnishPerGrade, 'Mammon exchange + varnish data kept');
// fresh build = file (needs the L2J datapack copy Scripts/data/dp/gear_db.json: dev install only)
if (!fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'gear_db.json')) || !fs.existsSync(path.join(ROOT, 'Scripts', 'data', 'dp', 'skills', '03800-03899.xml'))) console.log('  skip: fresh build from the datapack needs Scripts/data/dp/gear_db.json (dev install only)');
else { const B = require('./masterwork.js').build();
ok(B.items.length === J.items.length && B.items.every((i, k) => J.items[k].id === i.id && J.items[k].bonus === i.bonus), 'a fresh build from the datapack equals the file'); }

console.log('--- patch on a fresh copy of Scripts_dev/swarm.js');
const tmp = path.join(os.tmpdir(), 'swarm_mw_test_' + process.pid + '.js');
fs.copyFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), tmp);
let src = '';
// the patch is in Scripts_dev/swarm.js already (applied live): check the source itself; the patch file only exists on the dev PC
const ALREADY = fs.readFileSync(tmp, 'utf8').includes('// ==== MASTERWORK-PURE begin'), HAVEPATCH = fs.existsSync(PATCH);
try {
  const r1 = ALREADY ? { status: 0, stdout: 'source already patched' } : cp.spawnSync(process.execPath, [PATCH, tmp], { encoding: 'utf8' });
  ok(r1.status === 0, 'patch applies: ' + (r1.stdout || r1.stderr || '').trim().slice(0, 120));
  const ck = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  ok(ck.status === 0, 'node --check on the patched copy' + (ck.status ? ': ' + ck.stderr.slice(0, 300) : ''));
  if (HAVEPATCH) { const r2 = cp.spawnSync(process.execPath, [PATCH, tmp], { encoding: 'utf8' });
  ok(r2.status === 2, 'a second run is refused (exit 2)'); }
  src = fs.readFileSync(tmp, 'utf8');
} finally { try { fs.unlinkSync(tmp); } catch (e) { } }
ok(src.includes("if (info.s === 'weapon') return mwGainAdjust(id, info, g, sc, curScore, cur);"), 'upgradeGain routes the weapon slot through mwGainAdjust');
ok(src.includes("+ '\\\\data\\\\masterwork_ids.json'"), 'reads Scripts\\data\\masterwork_ids.json (escaped backslashes in swarm.js)');
ok(src.includes("mw: mwLabel(p.id) }));") && src.includes("mwWorn:") && src.includes("[MW "), '!gearplan rows / log / party chat show MW + bonus');
ok(!/EnchantItem|RequestEnchant|enchantMine\(/.test(src.slice(src.indexOf('// ==== MASTERWORK-PURE begin'), src.indexOf('/** Hvor meget bedre bliver jeg af at tage'))), 'no enchant code in the MASTERWORK block');

console.log('--- MASTERWORK-PURE mwGainRule');
const a = src.indexOf('// ==== MASTERWORK-PURE begin'), b = src.indexOf('// ==== MASTERWORK-PURE end');
ok(a > 0 && b > a, 'pure block found');
const mwGainRule = new Function(src.slice(a, b) + '\nreturn mwGainRule;')();
const G = { C: 2, B: 3, A: 4 };
const base = { marginPct: 10, minGain: 1 };
const R = (o) => mwGainRule(Object.assign({}, base, o));
// worn B MW 213 -> plain B 220 (only +3 %): never
ok(R({ gain: 7, sc: 220, candMw: false, candGrade: G.B, curMw: true, curScore: 213, curGrade: G.B, best: { score: 213, grade: G.B } }) <= 0, 'worn B masterwork (213) is NOT replaced by a plain B weapon 220 (+3 %)');
// plain B 240 (+12.7 %): allowed
ok(R({ gain: 27, sc: 240, candMw: false, candGrade: G.B, curMw: true, curScore: 213, curGrade: G.B, best: { score: 213, grade: G.B } }) === 27, 'a plain B weapon 240 (+12.7 %, more than the 10 % MW margin) replaces it');
// higher grade plain A 260 vs B MW 213: allowed (higher grade wins)
ok(R({ gain: 47, sc: 260, candMw: false, candGrade: G.A, curMw: true, curScore: 213, curGrade: G.B, best: { score: 213, grade: G.B } }) === 47, 'a higher grade (A) plain weapon still wins over a B masterwork');
// lower grade plain C never
ok(R({ gain: -50, sc: 163, candMw: false, candGrade: G.C, curMw: true, curScore: 213, curGrade: G.B, best: { score: 213, grade: G.B } }) <= 0, 'a lower grade plain weapon never');
// bagged MW: worn plain C 150, bag MW B 213, candidate plain B 220: gain vs worn is +70 but not clearly better than the bagged MW
ok(R({ gain: 70, sc: 220, candMw: false, candGrade: G.B, curMw: false, curScore: 150, curGrade: G.C, best: { score: 213, grade: G.B } }) <= 0, 'a bagged B masterwork (213) blocks buying/equipping a plain B 220');
// MW candidate same grade, equal score vs worn plain: wins the tie
ok(R({ gain: 0, sc: 213, candMw: true, candGrade: G.B, curMw: false, curScore: 213, curGrade: G.B, best: null }) === 1, 'a masterwork of the same grade and equal stats beats my worn plain twin (gain = minGain)');
// MW candidate worse: stays worse
ok(R({ gain: -20, sc: 193, candMw: true, candGrade: G.B, curMw: false, curScore: 213, curGrade: G.B, best: null }) === -20, 'a weaker masterwork is not an upgrade');
// no MW anywhere: unchanged
ok(R({ gain: 5, sc: 218, candMw: false, candGrade: G.B, curMw: false, curScore: 213, curGrade: G.B, best: null }) === 5, 'no masterwork involved: the gain is unchanged');
// MW vs MW: plain difference
ok(R({ gain: 10, sc: 223, candMw: true, candGrade: G.B, curMw: true, curScore: 213, curGrade: G.B, best: { score: 213, grade: G.B } }) === 10, 'masterwork vs masterwork: plain score difference');

console.log('--- dashboard');
const api = require(path.join(ROOT, 'Dashboard', 'gearpage_api.js'))._t;
const DATA = path.join(ROOT, 'Scripts', 'data');
const page = { cand: { weapon: [{ id: 10871 }, { id: 78 }] }, plan: { weapon: { id: 11112, alt: [10870] } }, rec: {}, chars: [{ slots: { weapon: { worn: { id: 10886, n: 'Dark Elven Long Bow - Concentration' } } } }] };
const ids = api.mwPageIds(page).sort((x, y) => x - y);
ok(JSON.stringify(ids) === JSON.stringify([78, 10870, 10871, 10886, 11112]), 'mwPageIds collects candidates, plan + alternatives, worn');
const L = api.mwLabels(DATA, ids);
ok(L[10871] === 'Lightning: Critical rate +54.4' && !L[78] && /^Concentration: Accuracy \+/.test(L[10886]) && L[11112] === 'Clairvoyance: Attack range +100', 'labels: MW items only, "<name>: <bonus>"');
const gp = fs.readFileSync(path.join(ROOT, 'Dashboard', 'gearpage.js'), 'utf8');
const fm = /  function mwChip\(d, id\) \{[\s\S]*?\n  \}\n/.exec(gp);
ok(!!fm, 'gearpage.js has mwChip');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mwChip = new Function('esc', fm[0] + '\nreturn mwChip;')(esc);
const chip = mwChip({ masterwork: L }, 10871);
ok(/class="gp-c mwk"/.test(chip) && chip.includes('MW · Lightning: Critical rate +54.4'), 'MW chip renders: ' + chip.replace(/title="[^"]*"/, 'title=…').trim());
ok(mwChip({ masterwork: L }, 78) === '' && mwChip({}, 10871) === '', 'no chip for plain items / without data');
ok((gp.match(/mwChip\(d, /g) || []).length >= 3 && gp.includes('gp-mwdot'), 'chip on the plan row, the item list, the worn weapon + MW dot on the worn strip');
ok(!/\b(alert|confirm|prompt)\(/.test(fm[0]), 'no browser dialogs');
const css = fs.readFileSync(path.join(ROOT, 'Dashboard', 'gearpage.css'), 'utf8');
ok(/\.gp-c\.mwk\s*\{[^}]*white-space: normal/.test(css) && /\.gp-mwdot/.test(css), 'CSS: MW chip wraps on phones, MW dot');

console.log(`test_masterwork: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
