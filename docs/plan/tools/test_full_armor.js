// OFFLINE TEST FULLARMOR-2026-10-15: a one-piece armor covers the legs (harness copied from test_gear_starter.js)
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = process.env.SWARM_SRC || path.join(ROOT, 'Scripts_dev', 'swarm.js');
const src = fs.readFileSync(SRC, 'utf8');
const VERBOSE = process.argv.includes('-v');
let fails = 0, oks = 0;
const check = (ok, what) => { if (ok) oks++; else fails++; console.log((ok ? 'ok   ' : 'FAIL ') + what); };
const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('marker not found: ' + (i < 0 ? a : b)); return src.slice(i, j); };
const code = [
  cut('const ROLEKIND = {', '// role regexes'),
  cut('let shopIdxCache = null;', '/** Kamael: if I wear a sword'),
  cut('const isSaWeapon =', '/** Buy the picks:'),
  cut('let gearDbCache = null', 'const BODY_SLOTS = ['),
  cut('const BODY_SLOTS = [', 'const badEquip = {};'),
].join('\n');
const DATA = path.join(ROOT, 'Scripts', 'data');
const ITEMS = JSON.parse(fs.readFileSync(path.join(DATA, 'gear_items.json'), 'utf8')).items;
const idOf = (n) => { const k = Object.keys(ITEMS).find(x => ITEMS[x].n === n); if (!k) throw new Error('no item ' + n); return Number(k); };

/** one mocked character -> the planUpgrades() result. o: { classId, level, role, worn: [names], prefs: object|null, policy } */
function plan(o) {
  const env = {
    Me: { Name: 'Tester', Level: o.level || 20, ClassId: o.classId, objId: 1 },
    state: { role: o.role },
    CONFIG: { gear: { roles: o.gearRole ? { Tester: o.gearRole } : {}, races: {}, gradeLevel: { NONE: 1, D: 20, C: 40, B: 52, A: 61, S: 76, S80: 80, S84: 84 },
      upgrade: { on: true, auto: true, keep: 300000, minGain: 1, order: ['weapon', 'chest', 'legs', 'shield', 'head', 'gloves', 'feet', 'neck', 'earring', 'earring', 'ring', 'ring'],
        casterSets: [{ from: 1, healer: 'Devotion', caster: 'Devotion' }, { from: 40, healer: 'Karmian', caster: "Demon's" }] } },
      healer: { roles: ['bishop', 'shilliensaint', 'healer'] } },
  };
  let oid = 100;
  const inv = (o.worn || []).map(n => ({ Id: idOf(n), objId: ++oid, Count: 1, IsEquiped: true, EnchantLvl: (o.enchant || {})[n] || 0, Name: n }));
  const files = {
    'gear_auto.json': JSON.stringify(o.policy || { default: true, sameGradeSwap: false, keepArmorType: true }),
    'gear_prefs.json': JSON.stringify(o.prefs || {}),
    'gear_upgrades.log': o.boughtLog || '',
  };
  const File = {
    Exists: (f) => { const b = path.basename(String(f)); return b in files || fs.existsSync(String(f).replace(/^__S__/, DATA)); },
    ReadAllText: (f) => { const s = String(f), b = path.basename(s.replace(/\\/g, '/')); if (b in files) return files[b]; return fs.readFileSync(s.replace(/^__S__\\data/, DATA).replace(/\\/g, '/'), 'utf8'); },
    GetLastWriteTimeUtc: () => ({ Ticks: 1 }),
  };
  const fn = new Function('Me', 'state', 'CONFIG', 'File', '__SCRIPTS__', 'Inventory', 'hostSnap', 'now', 'num', 'logError', 'teamOf', 'soulTarget', 'myCrystals', 'soulReady', 'fileStamp', 'isHealerRole',
    code + '\nreturn { planUpgrades, ggCheck: typeof ggCheck === "function" ? ggCheck : null, S: typeof STARTERGEAR === "object" ? STARTERGEAR : null, sgIsStarter: typeof sgIsStarter === "function" ? sgIsStarter : null, sgMode: typeof sgMode === "function" ? sgMode : null, sgPick: typeof sgPick === "function" ? sgPick : null };');
  const num = (v) => typeof v === 'bigint' ? Number(v) : (Number(v) || 0);
  const M = fn(env.Me, env.state, env.CONFIG, File, '__S__', { forEach: (f) => inv.forEach(f) }, { inv: () => inv }, () => Date.now(), num,
    (w, e) => { throw new Error(w + ': ' + (e && e.message)); }, () => 'P', () => null, () => [], () => false, () => '1',
    () => /bishop|shilliensaint|healer/.test(o.role));
  return { M, r: M.planUpgrades(o.budget === undefined ? 5000000 : o.budget) };
}
const weaponBuy = (r) => r.buys.find(p => p.slot === 'weapon');


// ==== FULLARMOR-2026-10-15 (tester Vykaax: destroyers "running around shirtless" + 4 pairs of Plated Leather Gaiters; Bounty Hunter Theca vs Full Plate)
const D = { classId: 46, level: 51, role: 'destroyer' };
const base = ['Common Item - Berserker Blade', 'Common Item - Full Plate Helmet', 'Common Item - Drake Leather Gloves', 'Plated Leather Boots'];
{ const { r } = plan(Object.assign({}, D, { worn: base.concat(['Common Item - Full Plate Armor']) }));
  const legs = r.buys.filter(p => p.slot === 'legs'), chest = r.buys.filter(p => p.slot === 'chest');
  if (VERBOSE) console.log(JSON.stringify({ buys: r.buys.map(p => p.slot + ':' + p.info.n), rows: r.prefRows || r.rows }, null, 1));
  check(!legs.length || chest.some(p => !p.info.full), 'destroyer in Full Plate Armor: no gaiters bought next to the one-piece armor (' + r.buys.map(p => p.info.n).join(', ') + ')');
}
{ const { r } = plan(Object.assign({}, D, { worn: base.concat(['Plated Leather Gaiters']) }));
  check(r.buys.some(p => p.slot === 'chest'), 'shirtless destroyer (gaiters, no chest): a chest piece is planned (' + r.buys.map(p => p.info.n).join(', ') + ')');
  check(!r.buys.some(p => p.slot === 'legs'), 'shirtless destroyer: no MORE gaiters');
}
{ const { r } = plan({ classId: 55, level: 51, role: 'spoiler', worn: ['Common Item - Crystal Dagger', 'Common Item - Full Plate Armor', 'Common Item - Full Plate Helmet', 'Common Item - Drake Leather Gloves'] });
  check(!r.buys.some(p => p.slot === 'legs') || r.buys.some(p => p.slot === 'chest' && !p.info.full), 'bounty hunter in Full Plate: no Theca gaiters next to it (' + r.buys.map(p => p.info.n).join(', ') + ')');
}

// ==== ROLEFIT-2026-10-15: the ROLE decides weapon hands + armor type (docs/plan/gear.md §6), not the per-class damage kit
const T = { classId: 55, level: 40, role: 'spoiler', gearRole: 'tank' };
{ const { r } = plan(Object.assign({}, T, { worn: ["Squire's Sword", "Squire's Shirt", "Squire's Pants"] }));
  const w = r.buys.find(p => p.slot === 'weapon'), arm = r.buys.filter(p => p.slot === 'chest' || p.slot === 'legs');
  check(!w || !w.info.two, 'bounty hunter TANK: no two-handed weapon (' + (w ? w.info.n : 'no weapon buy') + ')');
  check(arm.every(p => p.info.t === 'HEAVY'), 'bounty hunter TANK: heavy armor only (' + arm.map(p => p.info.n + ' ' + p.info.t).join(', ') + ')');
  check(r.buys.some(p => p.slot === 'shield'), 'bounty hunter TANK: a shield is planned (' + r.buys.map(p => p.info.n).join(', ') + ')');
}
{ const { r } = plan(Object.assign({}, D, { worn: base.concat(['Plated Leather Gaiters']) }));
  const c = r.buys.find(p => p.slot === 'chest');
  check(c && c.info.t === 'HEAVY', 'shirtless DESTROYER: the new chest is heavy armor (' + (c ? c.info.n + ' ' + c.info.t : 'none') + ')');
}
{ const { r } = plan(Object.assign({}, D, { level: 40, worn: ['Common Item - Berserker Blade', 'Brigandine Tunic', 'Common Item - Brigandine Gaiters'] }));
  const arm = r.buys.filter(p => p.slot === 'chest' || p.slot === 'legs');
  check(arm.every(p => p.info.t === 'HEAVY'), 'DESTROYER in D heavy at 40: C armor stays heavy (' + arm.map(p => p.info.n + ' ' + p.info.t).join(', ') + ')');
  check(!r.buys.some(p => p.slot === 'shield'), 'DESTROYER: no shield');
}

const TANKWORN = ['Common Item - Berserker Blade', 'Theca Leather Armor', 'Theca Leather Gaiters', 'Theca Leather Boots', 'Common Item - Full Plate Helmet'];
const TANKLOG = '2026-10-15T08:15:07.729Z [Tester] lvl 40 tank (supply run): Common Item - Berserker Blade 322707: bought; Theca Leather Armor 733425: bought; Theca Leather Gaiters 458188: bought\n';
{ const { r } = plan(Object.assign({}, T, { worn: TANKWORN, boughtLog: TANKLOG }));
  const w = r.buys.find(p => p.slot === 'weapon'), c = r.buys.find(p => p.slot === 'chest');
  check(w && !w.info.two, 'OUR tanks (BH in Berserker Blade + Theca): a one-handed weapon is bought (' + (w ? w.info.n : 'none') + ')');
  check(c && c.info.t === 'HEAVY' && c.info.full, 'OUR tanks: heavy one-piece chest replaces the light Theca (' + (c ? c.info.n : 'none') + ')');
  check(r.buys.some(p => p.slot === 'shield'), 'OUR tanks: a shield');
}
{ const { r } = plan(Object.assign({}, D, { worn: base.concat(['Common Item - Full Plate Armor']) }));
  check(!r.buys.some(p => p.slot === 'weapon' || p.slot === 'chest'), 'destroyer in Berserker Blade + Full Plate: keeps both (' + r.buys.map(p => p.info.n).join(', ') + ')');
}
{ const { r } = plan(Object.assign({}, T, { worn: TANKWORN, boughtLog: '' }));
  check(!r.buys.some(p => p.slot === 'weapon' || p.slot === 'chest'), 'a PLAYER-given Berserker Blade / Theca on a tank is never overruled (' + r.buys.map(p => p.info.n).join(', ') + ')');
}
console.log(`full armor: ${oks} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
