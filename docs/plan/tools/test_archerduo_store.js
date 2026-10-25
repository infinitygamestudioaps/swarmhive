// ARCHERDUO / STOREADD / LIMITS 2026-10-22 (public testers): archer + healer duo kills on the way; store buffs come on top; bigger supply limits
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '..', '..', '..');
const S = fs.readFileSync(path.join(R, 'Scripts_dev', 'swarm.js'), 'utf8');
const PS = fs.readFileSync(path.join(R, 'Dashboard', 'partysettings.js'), 'utf8'), PA = fs.readFileSync(path.join(R, 'Dashboard', 'partyauto_api.js'), 'utf8');
const api = require(path.join(R, 'Dashboard', 'partyauto_api.js'));
let ok = 0, bad = 0; const t = (n, c) => { if (c) ok++; else { bad++; console.log('FAIL', n); } };
t('mtNoDealer reads the live healer flag', /function mtNoDealer\(\)[^\n]*livePos\[n\]\.healer/.test(S));
t('mtNoDealer reads the live role', /function mtNoDealer\(\)[^\n]*livePos\[n\]\.role/.test(S));
t('mtFight: solo killer never cancels its own shot', /soloKill && Me\.IsAttacking\)\) Send\.StopMove/.test(S));
t('mtFight: solo killer fights until nothing is left', /mtPackNear\(\) <= \(soloKill \? 0 : MT\.packLeft\)/.test(S));
t('mtLeashFight shoots a ranged attacker outside the leash', /ARCHERDUO-2026-10-22: a ranged/.test(S) && /< 1600( && canSee\(m\))?\) mobs\.push\(m\)/.test(S));   // WALLSIGHT-2026-10-24: and never through a wall
t('soStoreAddOn exists', /async function soStoreAddOn\(out, tag\)/.test(S));
t('store add-on ignores the source order', /e\.buffSources\.indexOf\('store'\) < 0/.test(S));
t('store add-on: Party button, else me', /storeBuyBuff\(id, 'Party', name, (opt|o1)\)/.test(S) && /no Party button/.test(S));
t('supply run calls the add-on', /await soStoreAddOn\(res, 'supply'\)/.test(S));
t('rebuff trip calls the add-on', /await soStoreAddOn\(out, 'rebuff trip'\)/.test(S));
t('up to 6 stores tried', /sellers\.slice\(0, 6\)/.test(S));
t('dashboard Spirit Ore limit 500k', /\['ore', 'Spirit Ore', 500000\]/.test(PS));
t('API Spirit Ore limit 500k', /short: 'Spirit Ore', max: 500000 \} \};/.test(PA));
t('API soulshots: no limit', /short: 'Soulshots', max: null/.test(PA) && /short: 'Spiritshots', max: null/.test(PA));
t('dashboard shots: no limit', PS.includes("['soulshots', 'Soulshots', null], ['spiritshots', 'Spiritshots', null]"));
{ const e1 = [], o1 = api.amountsIn({ '76': { soulshots: 5000000, spiritshots: 2500000, ore: 25000 } }, 'test', e1); t('API accepts 5M soulshots + 25k ore', !e1.length && o1 && o1['76'] && o1['76'].soulshots === 5000000);
  const e2 = []; api.amountsIn({ '76': { soulshots: -1, ore: 600000 } }, 'test', e2); t('API refuses negative shots + ore above 500k', e2.length === 2); }
t('API module loads', !!api);
// BAGSELL-2026-10-22: a full bag starts the Giran trip when selling is on; the trip sells everyone's junk
{ const m = S.match(/function bagTripNames\(reports\) \{[^\n]*\}/); t('bagTripNames exists', !!m);
  if (m) { const f = new Function(m[0] + '; return bagTripNames;')(); t('bag trip: only FULL bags count', JSON.stringify(f([{ name: 'A', bf: 'full' }, { name: 'B', bf: 'near' }, { name: 'C', bf: '' }, null])) === '["A"]'); t('bag trip: none', f([]).length === 0); } }
t('members report their bag level', S.includes("d.bf = FULLW.lvl"));
t('bag trip only with the selling switch', S.includes("if (pautoOn('sell')) bagFull = bagTripNames(dpTeamReports())"));
t('full bag = Giran trip', S.includes("dpDue || bagFull.length > 0) === 'giran'"));
t('Giran services sell everyone', S.includes("sl`, 'sellrun', 9000 * order.length"));
// HEALERFIRST / ORDERFIRST 2026-10-22 (Spoiler11 + Healer11 at Ant Nest)
t('a healer being hit is recorded', S.includes("Object.assign(healerHit, { name: d.name, id: num(d.attacker), at: now() })"));
t('self-defence steps aside while the healer is hit (unless I am below 50 %)', S.includes("if (now() - healerHit.at < 4000 && num(Me.HpPercent) >= 50 && healerHit.name !== Me.Name)"));
t('everyone (not only the leader) helps the healer', S.includes("!(isHealerHit && (isLeader() || num(Me.HpPercent) >= 50))"));
t('a big fight before a port pulls back after 8 s', S.includes("now() - fightSince > (bigFight ? 8000 : 60000)") && S.includes("mobsNear(1500).n >= 6"));
t('route walks wait until my own leader is known (LEADERGAP)', S.includes("App.on('swarm.routewalk', (event) => {\n  if (CONFIG.mainLeader === undefined || event.source.characterName !== CONFIG.leader"));
// GROUPFIRST 2026-10-22 (Bishop1: 94 Greater Battle Heals, 1 group heal in a 9-man ToI fight)
{ const i = S.indexOf('GROUPFIRST-2026-10-22'), j = S.indexOf('const dying = hsOrder(team.filter(t => t.hp < (lowWanted(t)');
  t('group heal is decided BEFORE the dying single heal', i > 0 && j > i && j - i < 1200);
  t('group-first needs the scheme count and nobody below 25 %', S.includes('hurtN >= SC.group.count && !crit'));
  t('a draining destroyer still blocks group heals', S.includes("if (!team.some(lowWanted) && hurtN >= SC.group.count")); }
t('GEARHURRY: only a spot chosen DURING the supply run skips the gear shopping', S.includes('const spotSig0 = (() => { try { return partySpotSig(partySpotEntry());') && S.includes('const w = changed && manualChoiceWaiting(true);'));
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
