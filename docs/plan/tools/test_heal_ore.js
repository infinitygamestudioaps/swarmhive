// HEALORE 2026-10-22 (owner: "if a bishop does not have spirit ores for Major Heal then it should take the second best option like Greater Battle
// Heal. Same for Major Group Heal"): runs the swarm.js HEALSCHEME-PURE block in node. A heal whose Spirit Ore is missing is reported NOT READY by
// hsKnownNow (ready = IsReady && MP && the item in the bag); hsPick must then take the next best heal, automatic or when the player picked the ore heal.
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '..', '..', '..');
const S = fs.readFileSync(path.join(R, 'Scripts_dev', 'swarm.js'), 'utf8');
const a = S.indexOf('// HEALSCHEME-PURE-BEGIN'), b = S.indexOf('// HEALSCHEME-PURE-END');
const PURE = new Function(S.slice(a, b) + '\n; return { hsKnown, hsPick, HS_DEFAULT, hsClean, hsValidate };')();
const D = JSON.parse(fs.readFileSync(path.join(R, 'Scripts', 'data', 'heal_skills.json'), 'utf8').replace(/^﻿/, ''));
let ok = 0, bad = 0; const t = (n, c, x) => { if (c) ok++; else { bad++; console.log('FAIL', n, x === undefined ? '' : JSON.stringify(x)); } };
// Bishop1 (Bishop 68) as the dashboard saw it: the single / group heals with their levels
const lv = { 1011: 18, 1015: 15, 1020: 21, 1027: 15, 1217: 27, 1218: 27, 1219: 27, 1258: 4, 1271: 1, 1311: 5, 1401: 7, 1402: 3 };
const list = (oreOk) => Object.keys(lv).filter(id => D.skills[id]).map(id => ({ id: Number(id), name: D.skills[id].name, level: lv[id], base: lv[id], mp: 50, ready: (Number(id) === 1401 || Number(id) === 1402) ? oreOk : true, noItem: (Number(id) === 1401 || Number(id) === 1402) ? !oreOk : false }));
const known = (oreOk) => PURE.hsKnown(list(oreOk), D);
const sc = (o) => Object.assign(JSON.parse(JSON.stringify(PURE.HS_DEFAULT)), o || {});
const name = (p) => p ? p.name : null;
// with Spirit Ore
const kWith = known(true), kNo = known(false);
t('the Major heals are known', kWith.some(k => k.id === 1401) && kWith.some(k => k.id === 1402));
const singleWith = PURE.hsPick(kWith, 'single', sc());
t('with Spirit Ore the single heal can be Major Heal (the strongest)', name(singleWith) === 'Major Heal', name(singleWith));
// without
const singleNo = PURE.hsPick(kNo, 'single', sc());
t('no Spirit Ore: single heal = Greater Battle Heal (second best)', name(singleNo) === 'Greater Battle Heal', name(singleNo));
const emNo = PURE.hsPick(kNo, 'emergency', sc());
t('no Spirit Ore: dying = never Major Heal', emNo && emNo.id !== 1401, name(emNo));
const grNo = PURE.hsPick(kNo, 'group', sc());
t('no Spirit Ore: party heal = never Major Group Heal', grNo && grNo.id !== 1402, name(grNo));
t('no Spirit Ore: party heal is still a group heal', grNo && /Group|Benediction|Body of Avatar/.test(grNo.name), name(grNo));
// the player PICKED the ore heal by hand: it still falls back
const pickedSingle = PURE.hsPick(kNo, 'single', sc({ single: { skill: 1401, below: 90 } }));
t('picked Major Heal + no Spirit Ore -> Greater Battle Heal', name(pickedSingle) === 'Greater Battle Heal', pickedSingle);
t('...and it says why (your choice is cooling down / not ready)', pickedSingle && /your choice/.test(pickedSingle.why || ''), pickedSingle && pickedSingle.why);
const pickedGroup = PURE.hsPick(kNo, 'group', sc({ group: { skill: 1402, below: 80, count: 3 } }));
t('picked Major Group Heal + no Spirit Ore -> another group heal', pickedGroup && pickedGroup.id !== 1402 && /Group|Benediction|Body of Avatar/.test(pickedGroup.name), name(pickedGroup));
// host side: the ore check feeds "ready"
t('swarm.js: a heal without its item is not ready (hsKnownNow)', S.includes('const hasItem = !item || oreHave(item, itemN);') && /function oreHave\(item, need\)[\s\S]{0,400}itemCount\(item\)/.test(S) && S.includes('ready: !!sk.IsReady && num(Me.MP) >= mp && hasItem'));
// dashboard: icons + the Spirit Ore note
const HSJ = fs.readFileSync(path.join(R, 'Dashboard', 'healschemes.js'), 'utf8');
t('Healing panel: icon skill picker', HSJ.includes('data-hspick=') && HSJ.includes("const ICS = (id)"));
t('Healing panel: Spirit Ore note names the fallback', HSJ.includes('Without Spirit Ore it uses') && HSJ.includes('const ORE = { 1401: 1, 1402: 4 };'));
t('Healing panel: no emoji card icons left', !/ic: '[✚⚠❖♥💧]'/.test(HSJ) && !/>[☰🧪⛔]</.test(HSJ));
t('Healing panel: out of Spirit Ore NOW -> Automatic shows the real heal + an orange note', HSJ.includes('function noOreNow(R)') && HSJ.includes("' (no Spirit Ore)'") && HSJ.includes('Out of Spirit Ore now'));
// NOOREPICK 2026-10-22: the player's second choice when out of Spirit Ore
{ const pk = PURE.hsPick(kNo, 'single', sc({ single: { skill: 'auto', below: 90, noOre: 1020 } }));
  t('out of ore + second choice Vitalize -> Vitalize', pk && pk.id === 1020 && /second choice/.test(pk.why), pk);
  const pk2 = PURE.hsPick(kWith, 'single', sc({ single: { skill: 'auto', below: 90, noOre: 1020 } }));
  t('WITH ore the second choice is not used (Major Heal)', pk2 && pk2.id === 1401, pk2);
  const pk3 = PURE.hsPick(kNo, 'group', sc({ group: { skill: 1402, below: 80, count: 3, noOre: 1027 } }));
  t('picked Major Group Heal + no ore + second choice Group Heal -> Group Heal', pk3 && pk3.id === 1027, pk3);
  const pk4 = PURE.hsPick(kNo, 'single', sc({ single: { skill: 1217, below: 90, noOre: 1020 } }));
  t('a picked heal that needs no ore is not replaced (Greater Heal)', pk4 && pk4.id === 1217, pk4);
  const kNoBusy = kNo.map(k => k.id === 1020 ? Object.assign({}, k, { ready: false }) : k);
  const pk5 = PURE.hsPick(kNoBusy, 'single', sc({ single: { skill: 'auto', below: 90, noOre: 1020 } }));
  t('second choice cooling down -> the next best (Greater Battle Heal)', pk5 && pk5.id === 1218, pk5);
  t('hsClean keeps noOre (not for recharge)', JSON.stringify(PURE.hsClean({ single: { noOre: 1020 }, recharge: { noOre: 1013 } })) === '{"single":{"noOre":1020}}');
  t('hsValidate refuses a bad noOre', PURE.hsValidate({ group: { noOre: 'x' } }).errors.length === 1); }
const HLF = fs.readFileSync(path.join(R, 'Dashboard', 'heallogic.js'), 'utf8');
t('Dashboard/heallogic.js is synced (NOOREPICK)', HLF.includes('NOOREPICK-2026-10-22'));
t('Healing panel: "If out of Spirit Ore, use" picker', HSJ.includes('function noOreSel(sit, R, opts)') && HSJ.includes('data-hspick="${sit}.noOre"'));
// XMLSELFHEAL / RESFIGHT 2026-10-22 (Tank1 wipe 10:10)
t('L2Swarm Self Heal is set OFF on every check (no trust in the stale copy)', S.includes("try { a.IsEnabled = false; rec[id] = true; if (on) changed.push(") && S.includes("HSH.xml = rows ? 'off' : 'unknown';"));
t('healer res waits while the fight is on (outside raids)', S.includes('if (!man && !o.raid && c.healer && o.fightHold)') && S.includes('fightHold: resFightHold()'));
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
