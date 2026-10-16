// NNAVOWN-2026-10-15: with "Hive picks my skills" OFF the dungeon guard never switches off the player's assist (FollowAtk) or L2Swarm combat
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
ok(src.includes("const ownFight = (() => { try { return !hiveSkillsOn(); } catch (e) { return false; } })();"), 'the guard knows when the player owns the fight');
ok(src.includes("if (!ownFight) { try { NNAV.atkSaved = !!(NNAV.atkSaved || Options.FollowAtk); if (Options.FollowAtk) Options.FollowAtk = false; } catch (e) { } }"), 'entering the guard: FollowAtk untouched when skills are off');
ok(src.includes("try { if (Options.FollowAtk && !ownFight) { NNAV.atkSaved = true; Options.FollowAtk = false; } } catch (e) { }"), 'holding the guard: FollowAtk untouched when skills are off');
ok((src.match(/IsInCombat && !ownFight/g) || []).length === 2, 'L2Swarm combat is not stopped when skills are off (enter + hold)');
console.log(`nnav own: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
