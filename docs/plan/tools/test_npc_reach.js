// test_npc_reach.js — NPCREACH / BOARDCOMBAT 2026-10-22 (owner: "figure out why the system thinks NPCs are not answering").
// Log audit: 171 of 191 final "did not answer" stood > 250 from the NPC (clicks from there are ignored by the server); every board 'Buffs'
// "no answer" was in a fight. These checks keep the fixes in swarm.js: walk in front harder, one honest click when still far, no board
// 'Buffs' click in combat, my own attacks count as combat.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, fail = 0;
const t = (name, cond) => { if (cond) { ok++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name); } };
const fn = (name) => { const i = src.indexOf(name); if (i < 0) return ''; return src.slice(i, i + 4000); };

const sif = fn('async function standInFrontOf(');
t('standInFrontOf returns the distance left (0 = in talk range)', /return d;/.test(sif) && /return 0;\s*\n\}/.test(sif));
t('standInFrontOf tries the NPC heading front (counter side) first', /ref\.Heading/.test(sif) && /its front/.test(sif));
t('standInFrontOf falls back to the bounded L2Swarm walker when our path finder has no way', /navGoTo\(/.test(sif) && /!noNativeNav\(\)/.test(sif) && /v4Patch\(\)/.test(sif) && /<= 1500/.test(sif));
t('standInFrontOf never uses the native walker in a dungeon (noNativeNav guard) and frees its movement owner', /moveEnd\(MOVE, g\)/.test(sif));

const wrap = src.slice(src.indexOf('const openRaw = DLG.open'), src.indexOf('const openRaw = DLG.open') + 900);
// NPCALWAYS-2026-10-22 (owner: "you always need to be close to the NPC, ALWAYS"): no click at all from out of range
t('far from the NPC: NO click (returns before openRaw)', /if \(far\) \{[\s\S]*?return \{ ok: false, far, why/.test(wrap) && wrap.indexOf('return { ok: false, far') < wrap.indexOf('await openRaw(npc, o)'));
t('far from the NPC: the failure says why (not "did not answer")', /NOT clicked/.test(wrap));
t('a talk that worked teaches the standing spot', /if \(r && r\.ok\) \{ try \{ npcSpotLearn\(npc\)/.test(wrap) && /function npcSpotLearn\(npc\)/.test(src) && /npc_spots\.json/.test(src));
t('the approach walks to a learned spot first, then front / my side / 8 around it', /npcSpotsNow\(\)\[npcSpotKey\(ref\)\]/.test(sif) && /k < 8/.test(sif) && /around it/.test(sif));
t('a private store is not clicked from out of range either', /could not get in front of \$\{s\.owner\}'s store/.test(src));
t('openNpc reports "could not get in front" for a far failure', /opened && opened\.far \? `could not get in front of/.test(src));

const bic = src.slice(src.indexOf('function bfInCombat()'), src.indexOf('function bfInCombat()') + 300);
t('bfInCombat counts my own attacks (~15 s stance)', /ownAtkAt < 15000/.test(bic));
t('srvAttack stamps ownAtkAt', /function srvAttack\(id\) \{[^\n]*ownAtkAt = now\(\)/.test(src));
const bb = fn('async function bbsApplySchemeInner(');
t("board: no 'Buffs' click while in combat", bb.indexOf('if (bfInCombat())') > 0 && bb.indexOf('if (bfInCombat())') < bb.indexOf("bbsClick(home, 'Buffs')"));

// NOHITLOOP-2026-10-22 (Spoiler13 40+ min on one Ant Recruit at 100 % HP): self-defence respects the hunt's "no damage" blacklist
const sd = src.slice(src.indexOf('let lastDefend = 0'), src.indexOf('let lastDefend = 0') + 3500);
t('self-defence skips a monster the hunt put aside (HP >= 50 %)', /huntBlacklisted\(mob\.objId\) && num\(Me\.HpPercent\) >= 50/.test(sd));
t('self-defence steps ~300 away from a stalemate attacker, at most every 20 s', /nohitStepAt > 20000/.test(sd) && /\* 300/.test(sd));
t('the hunt puts a repeat no-damage target aside for 10 min', /n >= 2 \? 600000 : 120000/.test(src));

// STALESTANCE-2026-10-22 (testers: leader "in combat" in town for 10 min, a client restart fixed it): the stance flag alone needs a fight behind it
const sl = src.slice(src.indexOf('function bfStanceLive()'), src.indexOf('function bfStanceLive()') + 500);
t('a combat stance with no hit / own attack for 30 s (15 s in town) is stale', /quiet < \(currentTownKey\(\) \? 15000 : 30000\)/.test(sl) && /Me\.IsAttacking\) return true/.test(sl));
t('bfInCombat uses the fight-backed stance', /function bfInCombat\(\) \{ try \{ return !!\(bfStanceLive\(\)/.test(src));
t('the team fight report (swarm.pos) uses the fight-backed stance', /fight: !!\(now\(\) - lastAttackerOnMe\.at < 6000 \|\| bfStanceLive\(\)/.test(src));
// PLANOVR-2026-10-22 (Raltru: plan step "ToI until 76" stayed at Seal of Shilen: "needs your OK" although the party showed "level override")
const pse = src.slice(src.indexOf('function planSpotEntry()'), src.indexOf('function planSpotEntry()') + 2200);
t('a plan level step inherits the party level override', /const override = sp\.override === true \|\| !!base\.override/.test(pse) && /moveOn, override, at:/.test(pse));

console.log(`\n${ok} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
