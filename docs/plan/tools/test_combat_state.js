// test_combat_state.js - requirement towns.md R4 (owner 2026-11-01: "Build a function that will tell you if party or any character is still in
// combat or not" after 3 .townname were refused "Cannot use while in combat mode")
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const grab = (name) => { const i = SRC.indexOf('function ' + name + '('); let d = 0; for (let k = SRC.indexOf('{', i); k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}' && --d === 0) return SRC.slice(i, k + 1); } return ''; };
const F = new Function('const COMBAT_STANCE_MS = 15000;\n' + grab('combatInfoPure') + '\n' + grab('partyCombatPure') + '\nreturn { combatInfoPure, partyCombatPure };')();
const quiet = { flag: false, attacking: false, casting: false, sinceOwn: 60000, sinceHit: 60000, targeting: 0 };
t('quiet 60 s, no flag, nobody on me = out of combat', !F.combatInfoPure(quiet).in && F.combatInfoPure(quiet).clearInMs === 0);
t('my own attack 5 s ago = in combat, clear in ~10 s', (() => { const c = F.combatInfoPure(Object.assign({}, quiet, { sinceOwn: 5000 })); return c.in && c.clearInMs === 10000 && /my attack/.test(c.why[0]); })());
t('a hit 14 s ago still counts, 16 s ago not', F.combatInfoPure(Object.assign({}, quiet, { sinceHit: 14000 })).in && !F.combatInfoPure(Object.assign({}, quiet, { sinceHit: 16000 })).in);
t('a monster targeting me = in combat (it will hit)', F.combatInfoPure(Object.assign({}, quiet, { targeting: 1 })).in);
t('attacking / casting = in combat', F.combatInfoPure(Object.assign({}, quiet, { attacking: true })).in && F.combatInfoPure(Object.assign({}, quiet, { casting: true })).in);
t('a stale combat flag (nothing for 60 s) does not hold it', !F.combatInfoPure(Object.assign({}, quiet, { flag: true })).in);
const T = 1e6, P = F.partyCombatPure({ name: 'A', info: { in: false } }, [{ name: 'B', at: T - 2000, fight: true }, { name: 'C', at: T - 20000, fight: true }, { name: 'D', at: T - 1000, fight: false }], T);
t('party: B fighting (fresh report) = party in combat; C (report 20 s old) and D clear', P.in && P.who.join() === 'B' && P.clear.join() === 'A,C,D');
t('.townname waits for waitCombatClear(120000, 2000) and is NOT sent while still in combat', SRC.includes('const cw = await waitCombatClear(120000, 2000);') && SRC.includes('for (const c of (cw.ok ? cands : [])) {'));
{ const P2 = new Function(grab('fightOffPick') + '\nreturn fightOffPick;')();
  t('FIGHTOFF: the monster hitting me first, else the nearest targeting me; crowd-controlled ones wait; nobody on me = null',
    P2([{ id: 1, targetsMe: true, dist: 100 }, { id: 2, hitMe: true, dist: 600 }, { id: 3, targetsMe: true, cc: 'sleep', dist: 50 }]).id === 2 && P2([{ id: 1, targetsMe: true, dist: 300 }, { id: 4, targetsMe: true, dist: 100 }]).id === 4 && P2([{ id: 5, dist: 100 }]) === null); }
t('FIGHTOFF: waitCombatClear fights the monsters on me (healers never attack) - never stands still under attack, no 8 s give-up',
  /if \(foe\) \{[\s\S]{0,80}if \(!isHealerRole\(\)\) \{[^\n]*srvAttack\(foe\.id\)/.test(SRC) && !/bfHitMe\(3000\)\) return \{ ok: false/.test(SRC) && SRC.includes('const cw = await waitCombatClear(120000, 2000);'));
t('FIGHTOFF: the party port waits while a teammate is still in combat in the server\'s view (cb)', SRC.includes("(lp.cb !== undefined ? !!lp.cb : lp.fight) && !lp.IsDead && sameArea(lp, me)"));
t('every position report carries cb (combatInfo), partyCombatInfo uses it', SRC.includes('cb: (() => { try { const c = combatInfo();') && SRC.includes("fight: lp.cb !== undefined ? !!lp.cb : !!lp.fight"));
t('!combat command + catalog entry', SRC.includes("case '!combat': {") && fs.readFileSync(path.join(ROOT, 'Dashboard', 'commands.js'), 'utf8').includes("tpl: '!combat {name}'"));
console.log(`combat state: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
