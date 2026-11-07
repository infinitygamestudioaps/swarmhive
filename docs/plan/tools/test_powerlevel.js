// POWERLEVEL-2026-11-03: power-level pairs (a leveler with no level limits + a healer from ANOTHER party that follows and heals it).
// Pure decisions from swarm.js POWERLEVEL-PURE, source checks of every gate, and the API in a sandbox (scratch files, never the live data).
const fs = require('fs'), path = require('path'), os = require('os');
const R = path.join(__dirname, '../../..'), SRC = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const a = SRC.indexOf('// POWERLEVEL-PURE-BEGIN'), b = SRC.indexOf('// POWERLEVEL-PURE-END');
const P = new Function(SRC.slice(a, b) + '\nreturn { PLX, plPairFor, plHealerMove, plLevelerFlee, plSpotNear, plBuffGate };')();

// 1) roles: only ON pairs, never the same character twice
const cfg = { pairs: [{ leveler: 'Lvl', healer: 'Hel', on: true }, { leveler: 'Off', healer: 'Hx', on: false }, { leveler: 'Same', healer: 'Same', on: true }] };
t('the leveler of an ON pair is the leveler', (P.plPairFor(cfg, 'Lvl') || {}).role === 'leveler');
t('its healer is the healer', (P.plPairFor(cfg, 'Hel') || {}).role === 'healer');
t('a pair that is OFF changes nothing (default OFF)', P.plPairFor(cfg, 'Off') === null && P.plPairFor(cfg, 'Hx') === null && P.plPairFor({}, 'Lvl') === null);
t('leveler === healer is ignored', P.plPairFor(cfg, 'Same') === null);

// 2) the healer's move
t('leveler dead -> resurrect', P.plHealerMove({ dist: 800, lvHp: 0, lvDead: true, healAt: 70, keepDist: 700 }).act === 'res');
t('leveler below the heal line and out of heal range -> close in', P.plHealerMove({ dist: 800, lvHp: 50, healAt: 70, keepDist: 700 }).act === 'close');
t('leveler fine but too far -> follow at keepDist', (() => { const m = P.plHealerMove({ dist: 1200, lvHp: 95, healAt: 70, keepDist: 700 }); return m.act === 'follow' && m.to === 700; })());
t('in place -> stand still (out of the monsters\' aggro)', P.plHealerMove({ dist: 750, lvHp: 95, healAt: 70, keepDist: 700 }).act === '');
t('the walk point lies keepDist from the leveler, on my side', (() => { const p = P.plSpotNear({ x: 0, y: 0 }, { x: 2000, y: 0 }, 700); return p.x === 700 && p.y === 0; })());

// 3) the leveler flees only when its healer is gone AND HP is critical
t('healer with me + HP 10 % -> fights on (it is healed)', P.plLevelerFlee({ healerAlive: true, healerDist: 700, hp: 10 }) === false);
t('healer dead + HP 20 % -> flees', P.plLevelerFlee({ healerAlive: false, healerDist: 700, hp: 20 }) === true);
t('healer far away + HP 25 % -> flees', P.plLevelerFlee({ healerAlive: true, healerDist: 5000, hp: 25 }) === true);
t('healer dead but HP 80 % -> fights on', P.plLevelerFlee({ healerAlive: false, healerDist: 700, hp: 80 }) === false);

// 4) the gates in the host code (no level limits for the leveler, the healer heals the leveler by direct target, never attacks)
t('soloChar() is false for a power-level leveler (no solo caps / pull rule / solo area check)', /function soloChar\(\) \{\s*if \(plLevelerOn\(\)\) return false;/.test(SRC));
t('the hunt target filter has no upper level cap for the leveler', /lvl > L \+ \(userSpot \? 6 : 3\) && !plLevelerOn\(\)/.test(SRC));
t('the alone-in-a-fight escape is off while the healer is with the leveler', /if \(plLevelerOn\(\) && !plFleeNow\(\)\) \{ aloneFight\.since = 0; return; \}/.test(SRC));
t('the pair switch starts the leveling (the party Start switch is not needed)', /if \(!runAuto\('leveling'\) && !plLevelerOn\(\)\) return;/.test(SRC));
t('AOE pull = area skills from 2 monsters, only when switched on', /pm\.role === 'leveler' && pm\.pair\.aoe === true\) return 2;/.test(SRC));
t('healTargets adds the leveler (another party) for its healer', /const pt = plHealTarget\(\); if \(pt && !out\.some\(t => t\.name === pt\.name\)\)/.test(SRC));
t('the healer never levels while it heals (its own leveling stops)', /power level: I heal \$\{m\.pair\.leveler\} - my own leveling stops/.test(SRC));
t('the healer resurrects the leveler (resDecide + resRun on its body)', /mv\.act === 'res'[\s\S]{0,700}resDecide\(\{ dead: \[body\][\s\S]{0,300}resRun\(dd\.jobs\[0\], body, true\)/.test(SRC));
t('healers only heal: the healer side never calls an attack', (() => { const i = SRC.indexOf("// the healer: never levels, never attacks"), j = SRC.indexOf('}, PLX.tickMs);', i); const s = SRC.slice(i, j); return i > 0 && !/srvAttack|Send\.Attack|Attack\(|StartCombat|engage\(/.test(s); })());
t('orders !pl start|stop <leveler> exist', /case '!pl': \{/.test(SRC) && fs.readFileSync(path.join(R, 'Dashboard/commands.js'), 'utf8').includes("tpl: '!pl start {leveler}'"));

// 5) the API in a sandbox
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-')); const F = path.join(tmp, 'powerlevel.json'); fs.writeFileSync(F, JSON.stringify({ pairs: [] }));
process.env.SWARM_POWERLEVEL_FILE = F;
fs.writeFileSync(path.join(tmp, 'swarm.config.json'), JSON.stringify({ accounts: [{ character: 'Lvl', party: 'Lvl' }, { character: 'Hel', party: 'Hel' }, { character: 'Mate', party: 'Lvl' }] }));
const API = require(path.join(R, 'Dashboard/powerlevel_api.js'));
const ctx = { DATA: tmp, LOGS: tmp, ROOT: tmp, DIR: path.join(R, 'Dashboard'), readStates: () => [{ name: 'Lvl', x: 100, y: 200, z: -10, hp: 80, cls: 'Spellhowler' }, { name: 'Hel', x: 800, y: 200, cls: 'Bishop', hp: 100 }] };
let r = API.post(ctx, { op: 'set', pair: { leveler: 'Lvl', healer: 'Hel', on: true } });
t('a new pair is saved OFF... unless on is sent explicitly (the page always sends on:false)', r.ok && JSON.parse(fs.readFileSync(F, 'utf8')).pairs.length === 1);
r = API.post(ctx, { op: 'set', pair: { leveler: 'Lvl', healer: 'Lvl' } }); t('leveler === healer is refused', r.code === 400);
r = API.post(ctx, { op: 'set', pair: { leveler: 'Mate', healer: 'Hel' } }); t('a healer already in a pair is refused', r.code === 400 && /already in the pair/.test(r.error));
r = API.post(ctx, { op: 'onoff', leveler: 'Lvl', on: false }); t('Stop switches the pair off', r.ok && JSON.parse(fs.readFileSync(F, 'utf8')).pairs[0].on === false);
r = API.post(ctx, { op: 'herespot', leveler: 'Lvl' }); t('"where the leveler stands now" sets the spot from its live position', r.ok && r.pair.spot.x === 100 && r.pair.spot.y === 200);
const inf = API.info(ctx); t('the live view: distance between the two + the healer class flag', inf.pairs[0].live.dist === 700 && inf.pairs[0].live.healer.healerClass === true);
API.post(ctx, { op: 'delete', leveler: 'Lvl' }); t('Delete removes the pair', JSON.parse(fs.readFileSync(F, 'utf8')).pairs.length === 0);
// PLBUFF-2026-11-03: the healer also keeps its own class buffs on the leveler; heal always first, 30 % MP kept for heals, per-pair switch
{ const G = P.plBuffGate, base = { on: true, lvDead: false, lvHp: 95, healAt: 70, myMp: 80, mpKeep: 30, dist: 600 };
  t('PLBUFF: buffs when the leveler is healthy, near, and I have mana', G(base).go === true);
  t('PLBUFF: heal ALWAYS beats buff (leveler below the heal line)', G(Object.assign({}, base, { lvHp: 60 })).go === false && /heal first/.test(G(Object.assign({}, base, { lvHp: 60 })).why));
  t('PLBUFF: 30 % MP kept for heals', G(Object.assign({}, base, { myMp: 25 })).go === false);
  t('PLBUFF: never on a dead leveler (resurrect first), never from too far', G(Object.assign({}, base, { lvDead: true })).go === false && G(Object.assign({}, base, { dist: 1500 })).go === false);
  t('PLBUFF: the pair switch "buffs" off = no buffs', G(Object.assign({}, base, { on: false })).go === false);
  t('PLBUFF: single-target buffs only (no party songs out of party), via rkBufferPick (a stronger board buff of the same type is never overwritten)',
    /rkBufferPick\(\{ skills: \{ party: \[\], target \}, members: \[member\]/.test(SRC) && /if \(rkNum\(b\.level\) > s\.abLvl\) return '';/.test(SRC));
  t('PLBUFF: the leveler publishes its buffs, the healer tick calls the buff step except while resurrecting',
    /plPublishBuffs\(m\);/.test(SRC) && /if \(mv\.act !== 'res'\) \{ try \{ plBuffTick\(m, lv, d\);/.test(SRC));
  const APIsrc = fs.readFileSync(path.join(R, 'Dashboard/powerlevel_api.js'), 'utf8'), UIsrc = fs.readFileSync(path.join(R, 'Dashboard/powerlevelpage.js'), 'utf8');
  t('PLBUFF: the pair keeps "buffs" (default ON), the page has the tick and shows the last buff',
    /buffs: p\.buffs !== false/.test(APIsrc) && /lastBuff: live\.lastBuff/.test(APIsrc) && /data-plpbuff=/.test(UIsrc) && /last buff /.test(UIsrc));
  const r0 = API.cleanPair ? API.cleanPair({ leveler: 'A', healer: 'B' }, [], []) : null; if (r0) t('PLBUFF: a new pair has buffs ON by default', r0.pair && r0.pair.buffs === true); }
const live = JSON.parse(fs.readFileSync(path.join(R, 'Scripts/data/powerlevel.json'), 'utf8'));
// PLTRAVEL (20:15: Inspector1 hunted in Cruma, Healer1 stood 200k away - a plain GoToPoint never crossed the world)
{ const SRC2 = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
  const far = new Function(SRC2.slice(SRC2.indexOf('function plHealerFar('), SRC2.indexOf('function plHealerMove(')) + '\nreturn plHealerFar;')();
  t('PLTRAVEL: 200k away or another floor = travel; 900 away on the floor = follow', far(200000, 0) && far(2000, 1200) && !far(900, 0) && !far(3000, 100));
  t('PLTRAVEL: the far healer travels to the pair spot with travelToSpot (town, gatekeeper, dungeon), max one try a minute', /if \(plHealerFar\(d, Math\.abs\(num\(lv\.z\) - Me\.Z\)\)\) \{[\s\S]{0,1400}await travelToSpot\(tsp\);[\s\S]{0,120}await sleep\(60000 - \(now\(\) - t0\)\)/.test(SRC2)); }
// R1: a pair is OFF until the OWNER starts it - a switched-on pair carries his start (changedAt / changedBy: owner 2026-11-05 started Inspector1 + Healer1)
t('no pair is switched on without the owner\'s start (changedAt + changedBy)', !(live.pairs || []).some(p => p.on === true && !(p.changedAt && p.changedBy)));
t('PLTAKEOVER: a running ordinary leveling makes way for the pair\'s power leveling', /if \(autoLvl\.active && !autoLvl\.pl && !inRaid\(\)\) \{ if \(!autoLvl\.stop\) \{ autoLvl\.stop = true;/.test(fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8')));
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
console.log(`powerlevel: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
