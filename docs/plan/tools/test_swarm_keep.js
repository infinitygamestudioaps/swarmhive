// SWARMKEEP / HOFFGUARD-2026-11-03 (tester Vykaax): hands off = Hive never stops / restarts / escapes; Fight with L2Swarm = Hive only steps in
// for real errands; a solo character in a user-chosen room takes every monster of it
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(R, 'Scripts_dev', 'swarm.js'), 'utf8'), SRV = fs.readFileSync(path.join(R, 'Dashboard', 'server.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const line = (src, head) => { const i = src.indexOf(head); if (i < 0) throw new Error('missing ' + head); return src.slice(i, src.indexOf('\n', i)); };
const blockTo = (src, head, endHead) => { const i = src.indexOf(head), j = src.indexOf(endHead, i); return src.slice(i, j); };

const K = new Function(line(SRC, 'const SWKEEP_ERRAND') + '\n' + blockTo(SRC, 'function swarmKeepDecide(o) {', '\nfunction swarmEscapeBlocked') + '\nreturn swarmKeepDecide;')();
t('hands off: Hive never stops your L2Swarm combat (flee / solo fight / help)', !K({ handsOff: true, why: 'solo script fight' }).stop && !K({ handsOff: true, why: 'escape' }).stop);
t('hands off: your own order still may', K({ handsOff: true, ownerOrder: true, why: '!stop' }).stop);
t('Fight with L2Swarm: no stop for flee / back to the middle / tight ball / rest', ['escape: alone', 'back to the middle', 'TIGHTBALL: drop the far fight', 'rest'].every(w => !K({ sfNow: true, why: w }).stop));
t('Fight with L2Swarm: a real errand stops it (supply / town / bag / death / raid)', ['supply run', 'town trip .giran', 'bag full', 'dead', 'raid'].every(w => K({ sfNow: true, why: w }).stop));
t('normal Hive combat is unchanged', K({ why: 'anything' }).stop);
const E = new Function(line(SRC, 'function swarmEscapeBlocked(o)') + '\nreturn swarmEscapeBlocked;')();
t('no automatic escape with hands off / in the Fight-with-L2Swarm phase', E({ handsOff: true }) && E({ sfNow: true }) && !E({}));
const S = new Function(line(SRC, 'function soloRoomAll(spot)') + '\nreturn soloRoomAll;')();
t('Vykaax replay: a solo dagger in the user-chosen Cruma room takes every monster (no solo cap / pull rule)', S({ manual: true, room: 'cruma-1-right-i', poly: [[0, 0], [1, 0], [1, 1]] }) && !S({ manual: false, room: 'x' }) && !S(null));
t('source: stopCombatG asks swarmKeepDecide first', /function stopCombatG\(why\) \{\s*try \{ const k = swarmKeepDecide\(\{ handsOff: handsOffMe\(\)/.test(SRC));
t('source: soloScriptFight is off with hands off', /try \{ if \(handsOffMe\(\)\) return false; \} catch \(e\) \{ \}\s*\/\/ SWARMKEEP-2026-11-03/.test(SRC));
t('source: the native-nav guard keeps the player\'s combat with hands off / Fight with L2Swarm', SRC.includes('return !hiveSkillsOn() || handsOffMe() || sfOwnsCombat();'));
t('source: escapeFight refuses an automatic escape there', SRC.includes("if (!T.test && !T.order && swarmEscapeBlocked({ handsOff: handsOffMe(), sfNow: swarmFightNow() }))"));
t('source: the solo cap / pull rule skip a user room', SRC.includes('if (solo && !userRoom) {') && SRC.includes('&& !plLevelerOn() && !userRoom)'));
const G = new Function(line(SRV, 'function agentGuardHandsOff(names, runState)') + '\nreturn agentGuardHandsOff;')();
t('HOFFGUARD: AGENTGUARD never re-attaches a hands-off character (a stopped script stays stopped)', JSON.stringify(G(['vRunner', 'Bob'], { handsOff: { vRunner: { on: true } } })) === '["Bob"]' && SRV.includes('names = agentGuardHandsOff(names, readJson('));
t('HOFFGUARD: the script supervisor leaves a hands-off character alone', SRV.includes("if (x.handsOff) return { act: 'none' };") && SRV.includes('handsOff: !!(supHoff[c.name] && supHoff[c.name].on)'));
console.log(`swarm keep: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
