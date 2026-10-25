// Requirement gear.md (owner 2026-10-23): casters wear cast-speed sets (Devotion -> Demon's nukers / Karmian healers), never half a set,
// the expensive weapon (Acumen) only when the owner picks it per character (crystal from the bag, a warehouse or ANOTHER character),
// Magnus' Chant from a buff store for caster parties (party switch storeMagnus).
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..', '..');
const rd = (p) => fs.readFileSync(path.join(R, p), 'utf8');
const SW = rd(fs.existsSync(path.join(R, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev/swarm.js' : 'Scripts/swarm.js');
const D = JSON.parse(rd('Scripts/data/gear_doctrine.json'));
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
// doctrine
t('robe NONE + D = Devotion', D.armor.robe.NONE[0] === 'Tunic of Devotion' && D.armor.robe.D[0] === 'Tunic of Devotion');
t('robe C = Demon first (nukers)', D.armor.robe.C[0] === "Demon's Tunic");
t('robeHeal C = Karmian first (healers / buffers)', D.armor.robeHeal && D.armor.robeHeal.C[0] === 'Karmian Tunic' && D.armor.robeHeal.D[0] === 'Tunic of Devotion');
t('healers + buffers use robeHeal', [16, 30, 43, 97, 98, 105, 112, 116, 52, 17].every(id => (D.classes[id] || [])[1] === 'robeHeal'));
t('nukers stay robe', [12, 13, 27, 40, 94, 95, 103, 110].every(id => (D.classes[id] || [])[1] === 'robe'));
// generated recs (the bots read these)
const rec = (c) => JSON.parse(rd(`Scripts/data/gear_rec/${c}.json`)).grades;
t('Sorcerer D = Devotion, C = Demon set', rec(12).D.chest.name === 'Tunic of Devotion' && rec(12).D.legs.name === 'Stockings of Devotion' && rec(12).C.chest.name === "Demon's Tunic" && rec(12).C.gloves.name === "Demon's Gloves");
t('Bishop C = Karmian set', rec(16).C.chest.name === 'Karmian Tunic' && rec(16).C.legs.name === 'Karmian Stockings' && rec(16).C.gloves.name === 'Karmian Gloves');
t('set pieces bought as real pieces (bonus)', rec(12).C.chest.buy === 'real' && rec(16).C.chest.buy === 'real');
// never half a set
t('SETWHOLE: missing set pieces bought together or not at all', /SETWHOLE-2026-10-23[\s\S]{0,600}const sp = picks\.filter\(p => p\.set\), cost = sp\.reduce[\s\S]{0,200}if \(sp\.length && cost > budget\)/.test(SW));
// SETGRADE-2026-10-25 (tester: a lvl 80+ mage took off its A-grade Dark Crystal robe for the C Demon's set): R1 is the C range only
t('the caster set only while its grade is my gear grade (no C set at B / A / S)', SW.includes('if (setGrade && GEAR_GRADES.indexOf(setGrade) < GEAR_GRADES.indexOf(myGearGrade())) return null;'));
t('a set piece never replaces a higher-grade worn piece', SW.includes('GEAR_GRADES.indexOf(e.info.g) > GEAR_GRADES.indexOf(info.g))) return;   // SETGRADE'));
t('casterSets config Devotion / Karmian / Demon', /casterSets: \[\{ from: 1, healer: 'Devotion', caster: 'Devotion' \}, \{ from: 40, healer: 'Karmian', caster: "Demon's" \}\]/.test(SW));
// weapon by choice, crystal from another character
const API = rd('Dashboard/itemspage_api.js'), PG = rd('Dashboard/itemspage.js'), CP = rd('Dashboard/charpage.js');
t('character page: Upgrade -> the upgrade page for that character (R3, owner 2026-10-25)', CP.includes('href="#/upgrade/${encodeURIComponent(CP.name)}"') && CP.includes('>Upgrade ›<'));
{ const UA = rd('Dashboard/upgrade_api.js');
  t('an upgrade order waits for the next Giran visit unless "now" is picked (R3)', UA.includes("? String(b.when) : 'town';") && UA.includes("queued: when === 'town' ?")); }
t('API: other characters as a source (bag files)', API.includes('function holdersOf(ctx, tid, except)') && API.includes("if (/^char:/.test(choice))") && API.includes('options: { chars: holders.map('));
t('page: From <character> buttons', PG.includes("['char:' + c.name, `From ${c.name} (${kmb(c.count)})`]"));
t('doer: hand-over order from the holder', /CHARSRC-2026-10-23[\s\S]{0,900}givers: \{ \[f\.char\.name\]: \{ items: f\.char\.rows, adena: 0 \} \}[\s\S]{0,400}hovCommand\(\['!handover', hid\]\)/.test(SW));
// holdersOf against a fake LOGS dir
{ const os = require('os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
  const now = new Date().toISOString();
  fs.writeFileSync(path.join(dir, 'bag_Holder.json'), JSON.stringify({ at: now, items: [{ id: 4630, objId: 11, name: 'Red Soul Crystal - Stage 7', count: 1, eq: false, q: false }, { id: 4630, objId: 12, count: 1, eq: true }] }));
  fs.writeFileSync(path.join(dir, 'bag_Me.json'), JSON.stringify({ at: now, items: [{ id: 4630, objId: 13, count: 1 }] }));
  fs.writeFileSync(path.join(dir, 'bag_Old.json'), JSON.stringify({ at: '2020-01-01T00:00:00Z', items: [{ id: 4630, objId: 14, count: 1 }] }));
  const src = API.slice(API.indexOf('function holdersOf'), API.indexOf('// ---- the plan ----'));
  const rj = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; } };
  const holdersOf = new Function('fs', 'path', 'rj', src + '\nreturn holdersOf;')(fs, path, rj);
  const h = holdersOf({ LOGS: dir }, 4630, 'Me');
  t('holders: another character, not me, not worn, not stale', h.length === 1 && h[0].name === 'Holder' && h[0].count === 1 && h[0].rows[0].objId === 11); }
// Magnus' Chant
t('Magnus: store buff in supply runs + rebuff trips + party switch', SW.includes('const STORE_MAGNUS = { id: 1413') && /pautoOn\('storeMagnus'\) && currentTownKey\(\) === 'Giran'/.test(SW) && SW.includes("storeMagnus: { char: false") && SW.includes("(pautoOn('storeCov') || pautoOn('storeMagnus'))"));
t('Magnus: dashboard switch', rd('Dashboard/partyauto_api.js').includes("key: 'storeMagnus'") && rd('Dashboard/partysettings.js').includes("storeMagnus: \"Magnus' Chant\""));
const PA = JSON.parse(rd('Scripts/data/party_auto.json'));
t('Magnus ON for the nuker parties (owner data; not in the public package)', !(PA.parties || {}).Tank2 || ['Tank2', 'Tank3', 'Char1'].every(L => PA.parties[L] && PA.parties[L].storeMagnus === true));
console.log(`${ok} ok, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
