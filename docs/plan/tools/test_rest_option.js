// OFFLINE TEST RESTOPT-2026-10-30 (owner: "Why is shaded sitting down all the time? He should just continue hunting" + "Sitting down should be an
// option" -> AskUserQuestion "Off by default, per party"): party_auto.json rest (default OFF) + parties.<leader>.restAt numbers; every automatic
// rest (the leader's hunting rest, everyone's rest loop, the rest while the leader waits for respawns) asks restRule() first.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let oks = 0, fails = 0;
const check = (ok, what) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + what); };
const cut = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('marker not found: ' + (i < 0 ? a : b)); return SRC.slice(i, j); };

console.log('1) restRule: the party switch + its numbers');
const kinds = cut('const PAUTO_KINDS = {', 'function pautoNorm(j) {');
const norm = cut('function pautoNorm(j) {', '\nfunction pautoEffective(');
const eff = cut('function pautoEffective(j, kind, me, leader) {', '/** RESTOPT-2026-10-30');
const rr = cut('const RESTRULE = { at: 0, v: null };', '/** HIVESW: the fight toggles');
const mk = (data, me, leader) => new Function('pautoData', 'Me', 'CONFIG', 'now', kinds + '\n' + norm + '\n' + eff + '\n' + rr + '\nreturn restRule;')(() => data, { Name: me }, { leader }, () => Date.now())();
const def = mk({}, 'Tank1', 'Tank1');
check(def.on === false && def.hpBelow === 40 && def.mpBelow === 20 && def.hpUntil === 85 && def.mpUntil === 70, 'nothing set: OFF (owner default), numbers 40 / 20 -> 85 / 70');
const on = mk({ parties: { Tank1: { rest: true, restAt: { hpBelow: 30, mpBelow: 10, hpUntil: 90, mpUntil: 60 } } } }, 'Destroyer1', 'Tank1');
check(on.on === true && on.hpBelow === 30 && on.mpBelow === 10 && on.hpUntil === 90 && on.mpUntil === 60, "party Tank1 switched on: every member (Destroyer1) rests with the party's numbers");
const other = mk({ parties: { Tank1: { rest: true } } }, 'Destroyer4', 'Destroyer3');
check(other.on === false, 'another party stays OFF');
const all = mk({ default: { rest: true } }, 'Destroyer4', 'Destroyer3');
check(all.on === true, 'the all-parties setting counts when a party has none of its own');
const offOwn = mk({ default: { rest: true }, parties: { Destroyer3: { rest: false } } }, 'Destroyer4', 'Destroyer3');
check(offOwn.on === false, "a party's own OFF beats the all-parties ON");

console.log('2) every automatic rest asks the switch');
const lvl = cut('      // Hvil (solo: below 50 %, 2026-10-08)', '      // STILL IN TOWN WITH A PICKED SPOT');
check(/const RR = restRule\(\);\s*if \(RR\.on && /.test(lvl) && /RR\.hpUntil/.test(lvl) && /RR\.mpUntil/.test(lvl) && !/Me\.MpPercent < 20\)/.test(lvl), "the leader's hunting rest: only with the switch on, with the party's numbers (was a fixed HP < 40 / MP < 20)");
const loop = cut('const rest = { sitting: false, since: 0 };', '// SOLO: LEAVE A FIGHT THAT GOES BADLY');
check(/const RR = restRule\(\);/.test(loop) && /const low = RR\.on && /.test(loop) && /RR\.on && zoneHoldRest\(/.test(loop), "everyone's rest loop: no low rest and no wait-for-respawn rest when the switch is off");
check(/const fresh = !RR\.on \|\|/.test(loop), 'switched off while sitting = it stands up at once');
check(SRC.includes("if ((typeof restRule !== 'function' || restRule().on) && now() - lastAttackerOnMe.at > 5000 && !rest.sitting && (Me.HpPercent < ZONEPOLY.restHp"), "the leader's rest while waiting for respawns: only with the switch on (the guard is only for tests that lift the block alone)");
const sits = (SRC.match(/RunCommand\('\/sit'\)/g) || []).length;
check(sits === 7, `RunCommand('/sit') places unchanged in number (${sits}): 3 automatic rests (switch), 2 crafting MP waits (craft / craftmake orders), the !sit order, the command docs - a new one must ask restRule() too`);

console.log('3) the dashboard: the switch + numbers, default OFF');
const API = require(path.join(ROOT, 'Dashboard', 'partyauto_api.js'));
const K = API.KINDS.find(k => k.key === 'rest');
check(K && K.group === 'combat' && !K.def && K.char === false, 'API: "Sit down to rest when HP / MP run low" (Combat, party only, default OFF)');
const okSave = API.applyChange({}, { party: 'Tank1', values: { rest: true }, restAt: { hpBelow: 30, mpBelow: 0, hpUntil: 90, mpUntil: 60 } });
check(okSave.ok && okSave.data.parties.Tank1.rest === true && okSave.data.parties.Tank1.restAt.mpBelow === 0, 'save: switch + numbers (MP 0 = never for MP)');
const badSave = API.applyChange({}, { party: 'Tank1', restAt: { hpBelow: 60, mpBelow: 20, hpUntil: 50, mpUntil: 70 } });
check(!badSave.ok && /until HP/.test(badSave.errors.join()), '"until HP" below "HP below" is refused');
const rm = API.applyChange({ parties: { Tank1: { rest: true, restAt: { hpBelow: 30, mpBelow: 10, hpUntil: 90, mpUntil: 60 } } } }, { party: 'Tank1', restAt: null });
check(rm.ok && !rm.data.parties.Tank1.restAt && rm.data.parties.Tank1.rest === true, 'restAt null = back to the built-in numbers, the switch stays');
const PSJ = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partysettings.js'), 'utf8');
check(/key: 'rest', char: false, group: 'combat'/.test(PSJ) && /combat\.restAt\.hpBelow/.test(PSJ) && /cbody\.restAt = /.test(PSJ), 'party settings: the switch, the four numbers under it, saved with the Combat section');
console.log(`\nrest option: ${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
