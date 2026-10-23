// 2026-10-22 owner: (1) the sale result on the party card after each supply run, (2) items no shop buys marked on the Sell list (untick /
// destroy after a typed YES), (3) Silent Move when a character travels alone (Dagger1 running out with equipment)
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..', '..');
const rd = (p) => fs.readFileSync(path.join(R, p), 'utf8');
const SW = rd(fs.existsSync(path.join(R, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev/swarm.js' : 'Scripts/swarm.js');
const PS = rd('Dashboard/partystatus.js'), CPG = rd('Dashboard/charpage.js'), SRV = rd('Dashboard/server.js'), CMD = rd('Dashboard/commands.js'), IDX = rd('Dashboard/index.html');
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };

// ---- (1) SALESHOW: swarm.js records the last sale, the party card shows it
const sr = /function saleRecord\(why, soldKinds, got, pick\) \{[\s\S]*?\n\}\n/.exec(SW);
t('saleRecord exists', !!sr);
{ const state = {}; const num = Number; const saleRecord = eval('(' + sr[0] + ')');
  saleRecord('supply run', 3, 1667, { skip: { 'the shop does not buy it': ['Dagger', "Squire's Shirt"], untradeable: ['Tutorial Guide'], worn: ['Wooden Helmet'] } });
  const L = state.lastSale;
  t('saleRecord: kinds + adena', L && L.kinds === 3 && L.got === 1667 && L.why === 'supply run' && Date.parse(L.at) > 0);
  t('saleRecord: kept with plain reasons', L && L.kept.length === 4 && L.kept[0].why === 'no shop buys it' && L.kept.some(k => k.name === 'Tutorial Guide' && k.why === 'untradeable') && L.kept.some(k => k.why === 'worn')); }
t('sellAt records both the empty and the real sale (not the warehouse take-out-and-sell)', SW.includes("if (!list.length) { if (!only) saleRecord(why, 0, 0, pick);") && SW.includes('if (!only) saleRecord(why, sold.length, got, pick);'));
t('swarm_state carries lastSale', SW.includes('lastSale: state.lastSale || null'));
const sl = /function saleLine\(leader, list\) \{[\s\S]*?\n  \}\n/.exec(PS);
t('saleLine exists + used in both banner paths', !!sl && PS.includes('routeLine(leader) + saleLine(leader, list);') && PS.includes('.join(\'\')}${saleLine(leader, list)}'));
{ const esc = (s) => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); const AC = () => null;
  const at = new Date().toISOString(), old = new Date(Date.now() - 3 * 3600000).toISOString();
  let chars = [{ name: 'Spoiler16', lastSale: { at, why: 'supply run', kinds: 3, got: 1667, kept: [{ name: 'Dagger', why: 'no shop buys it' }, { name: "Squire's Shirt", why: 'no shop buys it' }] } },
    { name: 'Healer16', lastSale: { at, why: 'supply run', kinds: 1, got: 100, kept: [{ name: 'Tutorial Guide', why: 'untradeable' }] } }, { name: 'Nobody' }];
  const charsOf = () => chars; const saleLine = eval('(' + sl[0] + ')');
  const h = saleLine('Spoiler16');
  t('party line: summed over the run', /Last sale \d\d:\d\d: sold 4 kinds for 1,767 adena/.test(h));
  t('party line: kept + why', h.includes('kept: Dagger, Squire&#39;s Shirt (no shop buys them)') || (h.includes('Dagger, Squire') && h.includes('(no shop buys them)') && h.includes('Tutorial Guide (untradeable)')));
  chars = [{ name: 'A', lastSale: { at: old, why: 'x', kinds: 1, got: 5, kept: [] } }];
  t('party line: gone after 2 hours', saleLine('A') === '');
  chars = [{ name: 'A', lastSale: { at, why: 'x', kinds: 0, got: 0, kept: [{ name: '<b>', why: 'no shop buys it' }] } }];
  t('party line: nothing sold + escaped names', /nothing sold · kept: &lt;b&gt;/.test(saleLine('A'))); }

// ---- (2) SELLNOSHOP
t('/api/sell GET adds noShop (datapack + sure refusals)', SRV.includes("noShop[Number(id)] = 'the game marks it as not sellable'") && SRV.includes("(e.sure || (+e.strikes || 0) >= 2) && !noShop[+k]") && SRV.includes('Object.assign({}, list, { noShop })'));
t('a sell list save keeps the marks', IDX.includes('SELL = Object.assign({ noShop: SELL.noShop }, d.list);'));
t('item popup: No shop buys this + Untick + Destroy', CPG.includes('<b>No shop buys this</b>') && CPG.includes('data-cpunsell=') && CPG.includes('data-cpdestroy='));
t('destroy only through the typed-YES dialog', CPG.includes('sendOv(`destroy ${ds.dataset.cpdestroy} ${n}`, `DESTROY ${nm} ×${n} (no shop buys it)`, { danger: true });'));
t('bag tile marked', CPG.includes("noShopWhy(i.id) ? ' selling nosell' : ' selling'"));
const od = /case 'destroy': \{[\s\S]*?\n    \}\n/.exec(SW);
t('!ov destroy: never worn / quest / adena', !!od && /IsEquiped\) return done\(false/.test(od[0]) && /IsQuest\) return done\(false/.test(od[0]) && /=== 57\) return done\(false/.test(od[0]) && /RequestDestroyItem/.test(od[0]));
t('catalog: ovdestroy is destructive', /id: 'ovdestroy'[^\n]*safety: 'destructive'/.test(CMD));

// ---- (3) SOLOSNEAK
const sd = /function soloSneakDue\(\) \{[\s\S]*?\n\}\n/.exec(SW);
t('soloSneakDue exists', !!sd);
{ let town = '', party = 0, hit = 0, T = 100000; const Me = { IsDead: false, X: 0, Y: 0 }, autoLvl = { active: false }, scoutCtl = { on: false };
  const SOLOSNEAK = { lastX: 0, lastY: 0, movedAt: 0 }, now = () => T, num = Number, currentTownKey = () => town, inRaid = () => false;
  const PartyList = { get Count() { return party; } }; let lastAttackerOnMe = { at: 0 };
  const soloSneakDue = eval('(' + sd[0] + ')');
  Me.X = 500; t('sneak: moving alone in the field', soloSneakDue() === true);
  T += 7000; t('sneak: stood still 7 s -> off', soloSneakDue() === false);
  Me.X = 1500; t('sneak: moving again', soloSneakDue() === true);
  party = 2; Me.X = 2500; t('sneak: never with a party', soloSneakDue() === false); party = 0;
  town = 'Giran'; Me.X = 3500; t('sneak: never in a town', soloSneakDue() === false); town = '';
  lastAttackerOnMe = { at: T - 1000 }; Me.X = 4500; t('sneak: not while being hit', soloSneakDue() === false); lastAttackerOnMe = { at: 0 };
  autoLvl.active = true; Me.X = 5500; t('sneak: not while hunting', soloSneakDue() === false); }
t('scout tick runs for the solo sneak', SW.includes('if ((!scoutCtl.on && !SOLOSNEAK.on) || Me.IsDead || currentTownKey()) return;'));
t('toggle keeper leaves the sneak toggle alone', SW.includes("(scoutCtl.on || (typeof SOLOSNEAK !== 'undefined' && SOLOSNEAK.on))"));
t('stealth switched off once when the trip ends', /SOLOSNEAK\.on = false;[\s\S]{0,400}RequestMagicSkillUse\(num\(k\.Id\)\); note\('sneak: trip over/.test(SW));

console.log(`${ok} ok, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
