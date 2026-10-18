// KITBUY (owner 2026-10-15: "The destroyer swap kit should never be bought automatically, there should be a button to make the character go
// purchase what is needed"): pure checks of the buy plan (swarm.js KITBUY-PURE + Dashboard/frenzykit_api.js buyPlan), what Giran sells for each
// kit slot today, and source checks that NO automatic path buys a kit piece (only the order '!kitbuy' does).
//   node docs/plan/tools/test_frenzykit_buy.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
let pass = 0, fail = 0;
const ok = (name, cond, info) => { if (cond) pass++; else fail++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && info ? ' — ' + info : ''}`); };
const SRC = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
const blk = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i); if (i < 0 || j < 0) throw new Error('block not found: ' + a); return SRC.slice(i, j); };
const P = new Function(blk('// ==== KITBUY-PURE begin', '// ==== KITBUY-PURE end') + '\nreturn { kitBuyParse, kitBuyPlan, kitBuyNeed };')();
const API = require(path.join(ROOT, 'Dashboard', 'frenzykit_api.js'));
const KIT = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'frenzy_kit.json'), 'utf8'));
const slot = (k) => KIT.slots.find(s => s.key === k);

console.log('1) the order text');
{
  const a = P.kitBuyParse(['!kitbuy', 'Destroyer1', '2381,2417']);
  ok('"!kitbuy Destroyer1 2381,2417" -> name + ids', a.ok && a.name === 'Destroyer1' && a.ids.join() === '2381,2417');
  const b = P.kitBuyParse(['!kitbuy', 'Destroyer1', '2381,', '2381', 'x', '-5', '5722']);
  ok('spaces / duplicates / junk are cleaned', b.ok && b.ids.join() === '2381,5722');
  ok('no ids = refused with a reason', !P.kitBuyParse(['!kitbuy', 'Destroyer1']).ok && /no item ids/.test(P.kitBuyParse(['!kitbuy', 'Destroyer1']).why));
  ok('no / bad name = refused', !P.kitBuyParse(['!kitbuy']).ok && !P.kitBuyParse(['!kitbuy', 'a b;c', '1']).ok);
  ok('max 10 pieces in one order', P.kitBuyParse(['!kitbuy', 'X', Array.from({ length: 15 }, (_, i) => i + 1).join(',')]).ids.length === 10);
  ok('price + 20 % castle tax', P.kitBuyNeed(1000000) === 1200000 && P.kitBuyNeed(0) === 0);
}

console.log('2) swarm.js kitBuyPlan (what the character really buys)');
const HA = slot('high.armor').ids, HG = slot('high.gloves').ids, LW = slot('low.weapon').ids;
const idx = {
  [HA[0].id]: [{ npc: 'Radia', route: 'armor', path: ['Buy'], price: 4000000, common: false }],
  [HA[1].id]: [{ npc: 'Radia', route: 'armor', path: ['Buy'], price: 3000000, common: false }],
  [HG[0].id]: [{ npc: 'Radia', route: 'armor', path: ['Common'], price: 30000, common: true }],          // only a Common copy: never
  [LW[0].id]: [{ npc: 'Graham', route: '', path: ['Buy'], price: 100, common: false }],                  // no recorded route: never
};
{
  const r = P.kitBuyPlan(KIT, [HA[1].id, HA[0].id, HG[0].id, LW[0].id, 57], idx, new Set());
  const st = r.map(x => x.status).join();
  ok('buy / dup (one piece per slot) / Common only = notsold / no route = notsold / not a kit piece = notkit', st === 'buy,dup,notsold,notsold,notkit', st);
  ok('the offer is a real piece at a merchant with a recorded route', r[0].offer && r[0].offer.npc === 'Radia' && r[0].offer.route === 'armor' && !r[0].offer.common);
  const h = P.kitBuyPlan(KIT, [HA[0].id], idx, new Set([HA[1].id]));
  ok('never buys a piece of a slot it already owns (worn / bag, any id of that slot)', h[0].status === 'have');
}

console.log('3) dashboard buyPlan (what the dialog offers)');
{
  const scan = { shops: [
    { npc: 'Radia', route: 'armor', lists: [{ path: ['Buy'], items: [{ id: HA[1].id, name: HA[1].name, price: 3000000 }, { id: 12184, name: 'Common Item - Doom Plate Armor', price: 244000 }] }] },
    { npc: 'Ghost', route: '', lists: [{ path: ['Buy'], items: [{ id: HG[0].id, name: HG[0].name, price: 1 }] }] },
    { npc: 'Far', route: 'x', unreachable: 'no route', lists: [{ path: ['Buy'], items: [{ id: HG[1].id, name: HG[1].name, price: 1 }] }] },
  ] };
  const sidx = API.shopIndex(scan);
  ok('shopIndex: merchants without a recorded route / unreachable are left out', !sidx[HG[0].id] && !sidx[HG[1].id] && sidx[HA[1].id]);
  const st = API.kitStatus(KIT, [{ id: slot('low.armor').ids[0].id, eq: true }, { id: slot('high.weapon').ids[0].id, eq: false }], [{ id: slot('high.helmet').ids[0].id }]);
  const rows = API.buyPlan(KIT, st.slots, sidx), R = (k) => rows.find(x => x.key === k);
  ok('worn / bag slots are never offered; the optional Blessed Body slot never', !R('low.armor') && !R('high.weapon') && !rows.some(x => x.key.startsWith('btb')));
  ok('8 missing slots offered (5 + 5 minus worn + bag)', rows.length === 8, rows.length);
  ok('Doom Plate Armor: buy at Radia, the real piece (Common copy ignored: no set bonus)', R('high.armor').status === 'buy' && R('high.armor').id === HA[1].id && R('high.armor').npc === 'Radia' && R('high.armor').price === 3000000);
  ok('S.A. weapon: not sold, and says shops never sell S.A. weapons', R('low.weapon').status === 'notsold' && /Special Ability/.test(R('low.weapon').why));
  ok('a piece in the clan warehouse: status clan + its id', R('high.helmet').status === 'clan' && R('high.helmet').clanId === slot('high.helmet').ids[0].id);
  // the same choice on both sides
  const sw = P.kitBuyPlan(KIT, [R('high.armor').id], (() => { const o = {}; Object.keys(sidx).forEach(k => { o[k] = sidx[k]; }); return o; })(), new Set());
  ok('dashboard pick = swarm.js plan (same merchant, same price)', sw[0].status === 'buy' && sw[0].offer.npc === R('high.armor').npc && sw[0].offer.price === R('high.armor').price);
}

console.log('4) what Giran sells for each kit slot today (Scripts/data/shopscan_giran.json)');
{
  const scan = JSON.parse(fs.readFileSync(path.join(ROOT, 'Scripts', 'data', 'shopscan_giran.json'), 'utf8'));
  const st = API.kitStatus(KIT, [], []), rows = API.buyPlan(KIT, st.slots, API.shopIndex(scan));
  rows.forEach(r => console.log(`     ${r.key.padEnd(12)} ${r.status === 'buy' ? `BUY ${r.name} ${r.price} at ${r.npc}` : 'not sold in Giran (' + r.name + ', ' + r.grade + ')'}`));
  ok('10 slots checked against the live shop lists; never a Common copy picked', rows.length === 10 && rows.every(r => r.status !== 'buy' || !/^Common Item/.test(r.name)));
}

console.log('5) never automatic (source checks)');
{
  const calls = (fn) => [...SRC.matchAll(new RegExp('\\b' + fn + '\\(', 'g'))].map(m => SRC.lastIndexOf('\n', m.index)).map(i => SRC.slice(i + 1, SRC.indexOf('\n', i + 1)));
  const defs = (fn) => calls(fn).filter(l => new RegExp('(async )?function ' + fn + '\\(').test(l));
  const kbRun = calls('kitBuyRun').filter(l => !/function kitBuyRun\(/.test(l));
  ok('kitBuyRun is called only from the order (kitBuyOrder)', kbRun.length === 1 && /const r = await kitBuyRun\(o\.ids, '!kitbuy'\)/.test(kbRun[0]), kbRun.join(' | '));
  const kbOrd = calls('kitBuyOrder').filter(l => !/function kitBuyOrder\(/.test(l));
  ok("kitBuyOrder is called only by handleSay's '!kitbuy' line", kbOrd.length === 1 && /if \(cmd === '!kitbuy'\) \{ kitBuyOrder\(parts\)/.test(kbOrd[0]), kbOrd.join(' | '));
  const kbLead = calls('kitBuyLeadTrip').filter(l => !/function kitBuyLeadTrip\(/.test(l));
  ok("the leader's team trip runs only on a member's order event (swarm.kitbuy.trip)", kbLead.length === 1 && /kitBuyLeadTrip\(who\)/.test(kbLead[0]) && /App\.on\('swarm\.kitbuy\.trip'/.test(SRC) && (SRC.match(/App\.emit\('swarm\.kitbuy\.trip'/g) || []).length === 1 + (SRC.match(/App\.emit\('swarm\.kitbuy\.trip', \{ name: (Me\.Name|me), why: 'item'/g) || []).length);   // IJHOLD 2026-10-18: item jobs ask with why: 'item' (also when already in Giran + the receiver re-ask)   // ITEMS 2026-10-17: the item jobs (ijToGiran) reuse the same party trip
  ok("the trip event is sent only inside kitBuyOrder", (() => { const b = blk('async function kitBuyOrder(', 'async function kitBuyLeadTrip('); return /App\.emit\('swarm\.kitbuy\.trip'/.test(b); })());
  ok('defined once each', defs('kitBuyRun').length === 1 && defs('kitBuyOrder').length === 1);
  const fnBody = (name) => { const i = SRC.search(new RegExp('\\n(async )?function ' + name + '\\(')); if (i < 0) return ''; const j = SRC.indexOf('\n}\n', i); return SRC.slice(i, j); };
  ['planUpgrades', 'buyGearPicks', 'gearUpgrade', 'leadSupply', 'equipCommonFromBag', 'giranGearAt', 'shopGear', 'buyAt'].forEach(f => {
    const b = fnBody(f);
    ok(`${f}: never touches the kit (no frenzy_kit / kitBuy / frenzyKitItems)`, b.length > 50 && !/frenzy_kit|kitBuy|frenzyKitItems|frenzyKitIds/.test(b), b.length ? '' : 'function not found');
  });
  ok('hpSwap only WEARS the kit (reads frenzy_kit.json) and buys nothing (no buy packet / BuyItem / buyAt / kitBuy)', fnBody('hpSwap').length > 50 && !/buyPacket|BuyItem|buyAt|buyGearPicks|kitBuy/.test(fnBody('hpSwap')));
  ok('kitBuyRun puts nothing on (no UseItem / equipPiece / equipBought)', !/UseItem|equipPiece|equipBought|equipCommonFromBag/.test(fnBody('kitBuyRun')));
  ok('kitBuyRun re-checks price + adena + "already in the bag" before each piece', /const price = live && num\(live\.price\) > 0/.test(SRC) && /if \(a0 < need\)/.test(SRC) && /already in the bag, not bought/.test(SRC));
  ok('no timer starts a kit buy (no setInterval / setTimeout mentions kitBuy)', ![...SRC.matchAll(/set(Interval|Timeout)\(/g)].some(m => /kitBuy(Run|Order)\(/.test(SRC.slice(m.index, m.index + 600).split(/\n\}, \d+\);|\n\}\);/)[0])));
  ok('never during a raid: the order waits while inRaid() / mission', /while \(\(inRaid\(\) \|\| state\.mode === 'mission'\) && !stale\(\)/.test(SRC));
  ok('a member never ports alone (asks its leader; one-owner rule)', /if \(team && !isLeader\(\)\) \{\n\s+member = true;/.test(SRC));
  ok('holds the order control slot (orderWaitControl / orderRelease)', /orderWaitControl\('!kitbuy', seq\)/.test(SRC) && /orderRelease\('!kitbuy', seq\)/.test(SRC));
  ok('kit pieces of a destroyer are never sold (sell keepIds) or stored (stash spare) by the automatic paths', /if \(iAmDestroyerKind\(\)\) frenzyKitIds\(\)\.forEach\(i => keepIds\.push\(i\)\)/.test(SRC) && /spare: gear && \(spare\.some\(r => r\.test\(name\)\) \|\| kitIds\.has\(id\)\)/.test(SRC));
  ok('Logs/frenzykit_buys.log + intent log', /frenzykit_buys\.log/.test(SRC) && /intent\('kitbuy'/.test(SRC) && /intentDone\('kitbuy'/.test(SRC));
}

console.log('6) dashboard: catalog, page, dialog');
{
  const CMDS = require(path.join(ROOT, 'Dashboard', 'commands.js'));
  const c = (CMDS.COMMANDS || []).find(x => x.id === 'kitbuy');
  ok('catalog entry kitbuy: per character, confirm, tpl !kitbuy {name} {items}', c && c.handler === 'self' && c.safety === 'confirm' && c.tpl === '!kitbuy {name} {items}' && JSON.stringify(c.targets) === '["char"]');
  ok('docs/plan/dashboard_commands.md lists !kitbuy', /!kitbuy \{name\} \{items\}/.test(fs.readFileSync(path.join(ROOT, 'docs', 'plan', 'dashboard_commands.md'), 'utf8')));
  const CPJ = fs.readFileSync(path.join(ROOT, 'Dashboard', 'charpage.js'), 'utf8');
  const fb = CPJ.slice(CPJ.indexOf('async function frenzyBuy('), CPJ.indexOf('// ---------------------------------------------------------------- inventory grid'));
  ok('character page: the button + the dialog (uiForm, multi checkboxes), the order to that character', /data-fkbuy/.test(CPJ) && /uiForm\(/.test(fb) && /multi: true/.test(fb) && /post\('!kitbuy ' \+ name/.test(fb));
  ok('dialog: never confirm() / alert() / prompt() of the browser', !/(^|[^.\w])(confirm|alert|prompt)\(/.test(fb));
  ok('dialog: clan warehouse take-out only for the clan leader (!whtake ... clan)', /B\.isClanLeader/.test(fb) && /'!whtake ' \+ clan/.test(fb));
  ok('API: ?buy=1 adds the buy plan', /url\.searchParams\.get\('buy'\) === '1'/.test(fs.readFileSync(path.join(ROOT, 'Dashboard', 'frenzykit_api.js'), 'utf8')));
  const UD = fs.readFileSync(path.join(ROOT, 'Dashboard', 'uidialog.js'), 'utf8');
  ok('uidialog uiForm: multi = checkboxes', /f\.multi \? 'checkbox' : 'radio'/.test(UD) && /const setMulti = /.test(UD));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
