// SKILLSANE-2026-10-16 (Mr.P: dagger recasts Stealth, Prophet nukes Wind Strike / Mana Burn, Warcryer Steal Essence): the pure rules + the wiring
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.env.SWARM_JS || path.join(__dirname, '..', '..', '..', 'Scripts_dev', 'swarm.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const a = src.indexOf('// SKILLSANE-PURE-BEGIN'), b = src.indexOf('// SKILLSANE-PURE-END');
ok(a > 0 && b > a, 'SKILLSANE-PURE block present');
const K = new Function(src.slice(a, b) + '\nreturn { SKSANE, skSelfBuffSkip, skAttacksAllowed, skFilterAttacks };')();

// 1) stealth-type self buffs are never auto-cast
ok(K.skSelfBuffSkip({ name: 'Stealth', abType: 'STEALTH' }, null), 'Stealth (411) skipped');
ok(K.skSelfBuffSkip({ name: 'Soul Stealth', abType: '' }, null), 'Soul Stealth skipped');
ok(K.skSelfBuffSkip({ name: 'Hide', abType: 'HIDE' }, null), 'Hide skipped');
ok(K.skSelfBuffSkip({ name: 'X', abType: 'SILENT_MOVE' }, null), 'any SILENT_MOVE type skipped');
ok(!K.skSelfBuffSkip({ name: 'Focus Power', abType: 'PA_UP' }, null), 'a normal self buff stays');
ok(!K.skSelfBuffSkip({ name: 'Dash', abType: 'SPEED_UP' }, {}), 'Dash stays');
// 2) the Buffs page lists win
ok(K.skSelfBuffSkip({ name: 'Focus Power', abType: 'PA_UP' }, { noBuffs: true }), 'buffing OFF = no self buffs');
ok(K.skSelfBuffSkip({ name: 'Focus Power', abType: 'PA_UP' }, { remove: ['focus power'] }), 'never-keep list by name');
ok(K.skSelfBuffSkip({ name: 'Focus Power', abType: 'PA_UP' }, { remove: ['PA_UP'] }), 'never-keep list by abnormal type');
// 3) caster buffers: no attack skills unless ticked; others: yes unless unticked
const atk = [{ name: 'Wind Strike' }, { name: 'Mana Burn' }, { name: 'Steal Essence' }];
['buffer', 'warcryer', 'doomcryer'].forEach(r => ok(K.skFilterAttacks(atk, r, null).length === 0, r + ': no attacks by default'));
ok(K.skFilterAttacks(atk, 'buffer', { attackSkills: true }).length === 3, 'buffer ticked: every attack incl. Mana Burn');
ok(K.skFilterAttacks(atk, 'meleebuffer', null).length === 2, 'Swordsinger / Bladedancer keep weapon skills, Mana Burn dropped');
ok(K.skFilterAttacks(atk, 'nuker', null).map(x => x.name).join() === 'Wind Strike,Steal Essence', 'nuker: Mana Burn not by itself');
ok(K.skFilterAttacks(atk, 'nuker', { attackSkills: false }).length === 0, 'any role unticked: no attack skills');
ok(K.skAttacksAllowed('dagger', null) && !K.skAttacksAllowed('buffer', {}), 'role defaults');

// 4) wiring in swarm.js
const bsp = src.slice(src.indexOf('function buildSkillPlan()'), src.indexOf('const planKeyChk'));
ok(/plan\.selfBuffs\.push\(info\)/.test(bsp) && bsp.includes('!skSelfBuffSkip(info, null)'), 'buildSkillPlan drops stealth self buffs');
ok(bsp.includes('casterOrder(skFilterAttacks(plan.attacks, state.role'), 'buildSkillPlan filters attacks by role + switch');
ok((src.match(/skPlanKeyTok\(\)\]/g) || []).length === 2, 'plan key carries the switch (build + currentSkillPlan the same)');
const ast = src.slice(src.indexOf('async function autoSkillTick()'), src.indexOf('async function autoSkillTick()') + 3000);
ok(ast.includes('skSelfBuffSkip(b, sbEntry)'), 'autoSkillTick asks the never-keep list / buffing OFF');
ok(src.includes('skSelfBuffSkip(b, myBuffEntry())'), 'resSelfLow (rebuff after res) too');

// 5) dashboard: the switch is saved and shown
const api = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Dashboard', 'buffpage_api.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Dashboard', 'buffpage.js'), 'utf8');
ok(api.includes("'attackSkills'") && api.includes('attackDefault'), 'api keeps + exposes attackSkills');
ok(page.includes('data-bpsw="attackSkills"') && page.includes('attackSkills: !!E.attackSkills'), 'Buffs page switch "Attacks with its own skills"');
console.log(`skill sanity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
