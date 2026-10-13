// PLAIN WORDS (UX audit 2026-10-13, batch B2): Dashboard/plainwords.js turns the bots' log lines into player sentences.
// 1) fixed REAL lines (copied from Logs/intent_*.log, the What-they-do feed and the order queue on 2026-10-13) with the expected wording;
// 2) a scan of the live Logs/intent_*.log (last 400 lines per character, read-only) and the order state files: no translated text may
//    contain coordinates, "#nnn" message numbers, priorities (P4), step codes (WALK_LEG 5/6), internal ids, file names or !commands.
//   node docs/plan/tools/test_plainwords.js
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const P = require(path.join(ROOT, 'Dashboard', 'plainwords.js'));
const results = []; const ok = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info && !cond ? ' — ' + info : ''}`); };
// the same line format as Dashboard/server.js parseIntents (start + result lines)
function parse(line) {
  line = String(line).replace(/\r$/, '');
  let m = line.match(/^(\S+Z)\s+-> (.+?) (OK|FAIL|FEJL)(?:: (.*?))? \| now at (\S+)\s*$/);
  if (m) return { kind: 'result', at: m[1], action: m[2], result: m[3] === 'OK' ? 'OK' : 'FAIL', resultDetail: m[4] || '' };
  m = line.match(/^(\S+Z) ([^:|]+?): (.*)$/); if (!m) return null;
  let rest = m[3], task = '', from = '', to = null, dist = null;
  const ti = rest.lastIndexOf(' | task: '); if (ti >= 0) { task = rest.slice(ti + 9).trim(); rest = rest.slice(0, ti); }
  const fi = rest.lastIndexOf(' | from '); if (fi >= 0) { const f = rest.slice(fi + 8); rest = rest.slice(0, fi); const fm = f.match(/^(\S+)(?: -> (\S+) \((\d+) away\))?/); if (fm) { from = fm[1]; to = fm[2] || null; dist = fm[3] ? +fm[3] : null; } }
  return { kind: 'start', at: m[1], action: m[2], detail: rest.trim(), from, to, dist, task: task === '-' ? '' : task.replace(/\s*->\s*$/, ''), count: 1 };
}
const RAW = /-?\d{3,7},\s?-?\d{3,7}|(?:^|[\s(])#\d|\(P\d\)|(?:^|[\s(])![a-z]|\b[A-Z]{2,}_[A-Z]{2,}\b|_m[a-z0-9]{6,}\b|\.json\b|\b(?:Logs|Scripts)[\\/]|&#\d|\/[^/\s]*\|[^/]*\//;
const say = (e) => { const x = P.event(e); return x.text + (x.why ? ' | while: ' + x.why : ''); };

// ------------------------------------------------------------------------------------------------ 1. real lines, expected wording
const T = '2026-10-13T15:40:59.980Z';
const START = [
  [`${T} lead team: to 184280,-202360,-3392 with Healer2 | from 183144,-203496,-3120 -> 184280,-202360,-3392 (1607 away) | task: route to Eastern Mining Zone (Northeastern Shore) 26: Northern Goblin Leader area (east): at the end, waiting for Healer2 (walking the route)`,
    /^Leading the team \(1 following\) \| while: on the way to Eastern Mining Zone \(Northeastern Shore\) – Northern Goblin Leader area \(east\)$/],
  [`${T} gather team: checkpoint 183144,-203496,-3120 waiting for Healer2 1935 (start) | from 183144,-203496,-3120 | task: leading team: waiting at 183144,-203496,-3120 for Healer2 1935`, /^Waiting for Healer2$/],
  [`${T} help: Healer2 is being hit by Kerope Werewolf Chief — helping | from 169528,-208185,-3472 -> 170876,-207523,-3520 (1502 away) | task: nav: Eastern Mining Zone (Northeastern Shore) 26: Northern Goblin Leader area (east): WALK_LEG 4/6 walk 11.8k`,
    /^Helping Healer2 \(attacked by Kerope Werewolf Chief\) \| while: on the way to Eastern Mining Zone \(Northeastern Shore\) – Northern Goblin Leader area \(east\)$/],
  [`${T} walk: to 80518,147922,-3528 (within 400) | from 80424,147880,-3528 -> 80518,147922,-3528 (555 away) | task: leveling paused: !supply (P4) first`, /^Walking a few steps \| while: leveling paused for the supply run$/],
  [`${T} town: .giran (Giran, 57k away) — regroup in Giran: next hunting spot: Alligator Islands: area 19 | from 1,2,3 | task: regroup: `, /^Free teleport to Giran \| while: regrouping in town$/],
  [`${T} teleport: Eastern Mining Zone (Northeastern Shore) (nav Eastern Mining Zone (Northeastern Shore) 26: Northern Goblin Leader area (east)) | from 1,2,3 | task: nav: Eastern Mining Zone (Northeastern Shore) 26: Northern Goblin Leader area (east): GK_TELEPORT 3/6 Dwarven Village -> Eastern Mining Zone (Northeastern Shore)`,
    /^Teleporting to Eastern Mining Zone \(Northeastern Shore\) \| while: on the way to /],
  [`${T} npc: walking in front of Wirphy before clicking | from 1,2,3 | task: gatekeeper -> `, /^Walking up to Wirphy \| while: using a gatekeeper$/],
  [`${T} npc: talking to Helvetia (Grocer) | from 1,2,3 | task: leveling paused: !supply (P4) first`, /^Talking to Helvetia \(Grocer\) \| while: leveling paused for the supply run$/],
  [`${T} route: Schuttgart: streets · room 0/0 · step 1/3 · next: street walk | from 1,2,3 | task: street walk: Schuttgart: streets · room 0/0 · step 1/3 · next: street walk`, /^Walking through Schuttgart: streets \| while: walking through Schuttgart$/],
  [`${T} route: Cruma Tower: 2nd floor · room 0/0 · step 1/3 · next: Teleportation Cubic -> 2nd floor | from 1,2,3 | task: -`, /^Walking through Cruma Tower: 2nd floor — next: Teleportation Cubic → 2nd floor$/],
  [`${T} nav atlas: Seal of Shilen 7: Soul of Ruins area (west): 4 steps from step 2 (.aden 6k on foot, ~2 min) — teleport near: return trip to Tank1 | from 1,2,3 | task: -`, /^Planning the trip to Seal of Shilen – Soul of Ruins area \(west\) \(about 2 min\)$/],
  [`${T} regroup: everyone to Giran — next hunting spot: Abandoned Camp (team 3, route 20-40) — area 1 | from 1,2,3 | task: regroup: `, /^Gathering everyone in Giran, then hunting at Abandoned Camp/],
  [`${T} supply: buy SoE/SoR/shots/spirit ore for the team in Giran (automatic: 8 running low) | from 1,2,3 | task: -`, /^Supply run: buying scrolls, shots and potions for the team \(8 running low\)$/],
  [`${T} unstick: wiggling free from terrain at 86984,148632 (hunt) | from 1,2,3 | task: -`, /^Stuck — trying to walk free$/],
  [`${T} order: !scout Core: try 2/3 — the trip to the look-out of Core (last: not inside Cruma Tower) | from 1,2,3 | task: -`, /^Your order: Scout a boss: Core/],
  [`${T} return: travel to Tank1 (39k) (step 1/1 of travel (.town / gatekeeper / walk) -> Tank1) | from 1,2,3 | task: -`, /^Going back to Tank1$/],
  [`${T} tactics: pairs OFF: team busy (!supply) — focus fire | from 1,2,3 | task: -`, /^Group tactics: everyone on the same monster \(team busy \(supply run\)\)$/],
  [`${T} sell: selling marked items in Giran: Bone Arrow x41 | from 1,2,3 | task: -`, /^Selling items in Giran: Bone Arrow x41$/],
  [`${T} move: area 2/3 (Forsaken Plains: area 4) has had no monster for 35 s — moving on to area 3/3: area 5 | from 1,2,3 | task: -`, /^No monsters left here — moving on to the next area$/],
  [`${T} class change: Orc Shaman -> Warcryer (approved class plan, board Career -> Professions, !classchange) | from 1,2,3 | task: -`, /^Class change: Orc Shaman → Warcryer$/],
  [`${T} rescue: Bishop2: to Mozella (step 3/5 of here -> .dion -> Cruma Tower -> Mozella -> 1st floor -> Bishop2) | from 1,2,3 | task: -`, /^Going to help Bishop2$/],
  [`${T} handover: single: Animal Skin: 0/1 kinds to Dagger1 — Dagger1 did not open the trade (server: #144 That is an incorrect target.) (server: #144 That is an incorrect target.) | from 1,2,3 | task: trade -> `,
    /^Handing Animal Skin to Dagger1 — Dagger1 did not open the trade \(the server said: That is an incorrect target\.\) \| while: handing items over$/],
  [`${T} handover: to Dagger1: 29 kinds (order loot_spoiler5_mv6ufsbl) | from 1,2,3 | task: -`, /^Handing 29 kinds of items to Dagger1$/],
  [`${T} npc trip: #30120 -> Maximilian (High Priest) at 87058,148634,-3392: walk to Maximilian -> talk to Maximilian | from 1,2,3 | task: -`, /^Trip to Maximilian \(High Priest\)$/],
  [`${T} stash: deposit 19 kinds in my private warehouse (raid circuit) | from 1,2,3 | task: -`, /^Storing 19 kinds of items in the private warehouse$/],
  [`${T} letters: 26 letters (13 kinds) to Dagger1 (Dagger1 is in Giran too) | from 1,2,3 | task: -`, /^Giving 26 event letters to Dagger1$/],
  [`${T} occupied: Elven Forest: area 2 is occupied by CrimsonSix, CrimsonNine — skipped for 30 min, picking another spot | from 1,2,3 | task: -`, /^Elven Forest: area 2 is taken by other players — picking another place$/],
  [`${T} escape: alone in a fight: crowd control, run to a safe spot, .townname / Scroll of Escape (solo: HP 20% with 1 attacker(s), 23 monster(s) near) | from 1,2,3 | task: -`, /^Alone in a fight \(20 % HP\) — getting away to town$/],
  [`${T} teleport-near: Oren -> Outlaw Forest lands 6712 from the target (we are 154283 away) — handover to Dagger1 | from 1,2,3 | task: -`, /^Teleporting closer: Oren → Outlaw Forest$/],
  [`${T} resurrect: Doombringer1 is dead — Scroll of Resurrection (3 left) | from 1,2,3 | task: -`, /^Resurrecting Doombringer1 with a scroll$/],
  [`${T} attack: Kerope Werewolf Chief (63% HP) | from 1,2,3 | task: autolevel: Trio: Bee Hive (21-28) · lvl 24 · 37 kills`, /^Fighting Kerope Werewolf Chief \| while: leveling at Bee Hive$/],
  [`${T} walk: to 1,2,3 | from 1,2,3 -> 4,5,6 (2400 away) | task: autolevel: Abandoned Camp (Party 4 (Mystic Muse), route 20-40) · lvl 30 · 3 kills`, /^Walking a short way \| while: leveling at Abandoned Camp$/],
  [`${T} walk: to 1,2,3 | from 1,2,3 -> 4,5,6 (900 away) | task: onto Tank1's route: Cruma Tower: 2nd floor · room 1/3 · step 2/9 · next: onto Tank1's route`, /^Walking a few steps \| while: following Tank1 through Cruma Tower: 2nd floor$/],
  [`${T} delevel: delevel 44 -> 42 at the Dion guards (level_control.json) | from 1,2,3 | task: -`, /^Losing levels on purpose: 44 → 42$/],
  [`${T} hjælp: Bishop1 is being hit by Orc — helping | from 1,2,3 | task: -`, /^Helping Bishop1 \(attacked by Orc\)$/],
];
START.forEach(([line, rx], i) => { const e = parse(line), out = say(e); ok(`start ${i + 1} ${e.action}: "${out}"`, rx.test(out) && !RAW.test(out), 'got: ' + out); });

const RES = [
  ['walk OK: arrived', 'arrived'], ['walk FAIL: not there — 409 left', 'did not get all the way there'], ['walk FAIL: 3503 from start', 'stopped short of the start'],
  ['town OK: landed 87355,-142095,-1344 (Schuttgart)', 'arrived in Schuttgart'], ['teleport OK: landed 168930,-208298,-3520', 'arrived'],
  ['lead team OK: whole team arrived (wall-aware route)', 'the whole team arrived'], ['lead team FAIL: route stopped at point 1/2', 'the walk stopped halfway'],
  ['unstick OK: moved 318', 'walked free'], ['unstick FAIL: still at -54216,146424 after clicking around for up to 6 min', 'still stuck after trying for 6 minutes'],
  ['regroup FAIL: .giran did not move me', 'the teleport did not happen'], ['npc FAIL: Helvetia did not answer 3 clicks (784 away)', 'Helvetia did not answer'],
  ['resurrect OK: Nuker9 is alive again', 'Nuker9 is alive again'], ['teleport-near OK: landed at Forsaken Plains, 2587 left to walk', 'arrived at Forsaken Plains, a short way left to walk'],
  ["teleport FAIL: no link to 'ant nest' at Trisha (Dion) — its menu: The Town of Giran - 6800 &#57; | Heine - 12000 &#57;", 'the gatekeeper Trisha in Dion does not go to ant nest'],
  ['supply OK: Bishop4: nothing to give; Nuker11: OK; Nuker8: nothing to give', '1 character got supplies'],
  ['stash OK: stash: deposited 163 kinds (Adamantite Nugget x7, Plated Leather Boots (#347 Incorrect item count.)) at Taurin (clan warehouse), fee 4890', 'stored 163 kinds of items in the clan warehouse'],
];
RES.forEach(([line, want]) => { const e = parse(`${T}   -> ${line} | now at 1,2,3`), got = P.resultText(e.resultDetail); ok(`result "${line.slice(0, 50)}" -> "${got}"`, got === want && !RAW.test(got), 'got: ' + got); });
ok('result(): a FAIL is a red ✗ with plain words', JSON.stringify(P.result({ result: 'FAIL', resultDetail: 'not there — 9 left' })) === JSON.stringify(['bad', '✗ did not get all the way there']));
ok('result(): an old step without an end is "replaced by the next step"', P.result({ at: '2020-01-01T00:00:00Z' }, false)[1] === '— replaced by the next step');

// the What-they-do feed (notes) + the bug the audit found ("#123 Your trade was successful" counted as a failure)
const NOTES = [
  ['priority: "follow: back to the leader" (P2) interrupts "town sell" (P6)', /^Follow: back to the leader first — "town sell" waits$/],
  ['navigation: wall-aware route to 83480,148552 — 16 waypoints, ~3842 units', /^Planned a walk around the walls$/],
  ['follow: no mobs here, 2301 from Crafter1 — back to the middle of the hunt (walking to him)', /^No monsters here — walking back to Crafter1$/],
  ['[letters] hand-over to Dagger1 FAILED: gave 0 kinds to Dagger1; 10 failed (L2Day - E: Dagger1 did not open the trade (server: #144 That is an incorrect target.)) — next automatic try in 30 min', /^Could not hand the event letters to Dagger1 — tries again in 30 min$/],
  ['handover letters_destroyer3_mv6uy28s: single: L2Day - II -> Dagger1: 1/1 kinds OK', /^Handed L2Day - II to Dagger1$/],
  ['handover letters_destroyer3_mv6uy28s: gave 4 kinds to Dagger1 (L2Day - O x4); 9 failed (L2Day - E: trade completed (server: #123 Your trade was successful.))', /^Handed 4 kinds of items to Dagger1$/],
  ['trade -> Dagger1: L2Day - T — OK', /^Gave L2Day - T to Dagger1$/],
  ['auto-shots enabled (1464)', /^Automatic soulshots switched on$/],
  ['town sell: selling Dark Stockings Fabric x2, Crystallized Ice Bow Shaft x61', /^Selling Dark Stockings Fabric x2, Crystallized Ice Bow Shaft x61$/],
];
NOTES.forEach(([n, rx]) => { const got = P.note(n); ok(`note "${n.slice(0, 48)}…" -> "${got}"`, rx.test(got) && !RAW.test(got), 'got: ' + got); });
const succ = P.clean('L2Day - E: trade completed (server: #123 Your trade was successful.)');
ok('a server-confirmed trade is never shown as a plain failure', /went through/.test(succ) && !/#123/.test(succ), succ);

// orders (the Orders sheet)
ok('order: a !stop interrupted by a restart = it stays stopped', /stays stopped/.test(P.order('swarm.js restarted while it ran - not run again (a town trip still on the way resumes by itself); send it again if it is still needed', 'failed', '!stop')));
ok('order: another order interrupted by a restart = not finished, send again', /not finished/.test(P.order('swarm.js restarted while it ran - not run again', 'failed', '!level')));
ok('order: replaced', P.order('replaced by !stop before it ran (!stop clears the pending orders)') === 'replaced by "Stop" before it started');
ok('order: expired', /too old/.test(P.order('older than 10 min when I could read it - not run')));
ok('cmd(): "!supply" -> "Supply run", "!hunthere off" -> "Stay here and hunt off"', P.cmd('!supply') === 'Supply run' && P.cmd('!hunthere off') === 'Stay here and hunt off', P.cmd('!hunthere off'));
ok('dist(): words, not numbers', P.dist(200) === 'right here' && P.dist(2400) === 'a short walk away' && P.dist(90000) === 'far away');
ok('place(): old team prefixes removed', P.place('Party 4 (Mystic Muse): Elven Forest (8-19)') === 'Elven Forest' && P.place('Trio: Bee Hive (21-28)') === 'Bee Hive', P.place('Party 4 (Mystic Muse): Elven Forest (8-19)'));

// ------------------------------------------------------------------------------------------------ 2. live logs (read-only)
const LOGS = path.join(ROOT, 'Logs');
let scanned = 0, bad = [];
try {
  for (const f of fs.readdirSync(LOGS).filter(f => /^intent_.+\.log$/.test(f))) {
    let lines = []; try { lines = fs.readFileSync(path.join(LOGS, f), 'utf8').split(/\r?\n/).slice(-400); } catch (e) { continue; }
    for (const l of lines) {
      const e = parse(l); if (!e) continue;
      const out = e.kind === 'result' ? P.resultText(e.resultDetail) : say(e);
      scanned++;
      if (RAW.test(out) && bad.length < 12) bad.push(`${f}: ${l.slice(0, 120)} => ${out.slice(0, 160)}`);
      else if (RAW.test(out)) bad.push('');
    }
  }
} catch (e) { }
ok(`live intent logs: ${scanned} lines translated, none shows raw ids / coordinates / commands`, scanned === 0 || !bad.length, `${bad.length} lines:\n    ` + bad.filter(Boolean).join('\n    '));
let oscan = 0; const obad = [];
try {
  const D = path.join(LOGS, 'orders');
  for (const f of fs.readdirSync(D).filter(f => /\.state\.json$/.test(f))) {
    let j = null; try { j = JSON.parse(fs.readFileSync(path.join(D, f), 'utf8').replace(/^﻿/, '')); } catch (e) { continue; }
    Object.values((j && j.orders) || {}).forEach(r => { if (!r || !r.why) return; oscan++; const w = P.order(r.why, r.state, r.cmd); if (RAW.test(w) && obad.length < 8) obad.push(r.why.slice(0, 100) + ' => ' + w); });
  }
} catch (e) { }
ok(`live order results: ${oscan} reasons translated, none shows raw ids / commands`, !obad.length, obad.join('\n    '));

const fails = results.filter(r => !r.ok).length;
console.log(`\n${results.length - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
