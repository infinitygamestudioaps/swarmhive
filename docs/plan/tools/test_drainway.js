// OFFLINE TEST DRAINWAY-2026-10-30 (owner: "make it so the Frenzy kit (HP swap) is optional for raids ... switch between them hitting each other down to
// lower hp AND if they can just use the gear swap ... Because in high level they kill each other"): two switches under the destroyer drain.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8'), SRV = fs.readFileSync(path.join(ROOT, 'Dashboard', 'server.js'), 'utf8'), PS = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8');
let oks = 0, fails = 0; const check = (ok, w) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + w); };
check(/function drainKitOn\(\) \{ try \{ return partyTactics\(\)\.drainKit !== false;/.test(SRC) && /function drainDuelOn\(\) \{ try \{ return partyTactics\(\)\.drainDuel !== false;/.test(SRC), 'swarm.js: drainKit / drainDuel, both ON unless switched off');
const df = SRC.slice(SRC.indexOf('async function drainAndFrenzy('), SRC.indexOf('async function drainAndFrenzy(') + 6000);
check(/if \(Me\.HpPercent >= below && drainKitOn\(\)\) swapBack = await hpSwap\(\);/.test(df), 'the gear swap only with "Use the Frenzy kit gear swap"');
check(/while \(drainDuelOn\(\) && Me\.HpPercent >= below &&/.test(df), 'no duel hits with "Hit each other" off (gear swap only)');
check(/destroyerDrainOn\(\) && drainDuelOn\(\)\) \{   \/\/ DESTROYERDRAIN/.test(SRC), "the partner's drain helper (hitting a draining partner) is off too");
check(/if \(get\('drainKit'\) === false\) t\.drainKit = false;/.test(SRV) && /if \(get\('drainDuel'\) === false\) t\.drainDuel = false;/.test(SRV), 'dashboard: the API saves the two switches (only OFF is stored)');
check(/drainKit: true, drainDuel: true/.test(PS) && /soloEscape: true/.test(PS), 'party settings: the page keeps the two (and soloEscape) when it saves (TACT_DEF)');
check(/data-pschk="tactics\.drainKit"/.test(PS) && /data-pschk="tactics\.drainDuel"/.test(PS), 'party settings: two checkboxes under the destroyer drain');
console.log(`\ndrain way: ${oks} ok, ${fails} failed`); process.exit(fails ? 1 : 0);
