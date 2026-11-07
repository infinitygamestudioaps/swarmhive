// HOLD-2026-11-04 guard (owner after the Forge of the Gods wipe: "MAKE SURE IT WORKS FROM NOW ON ... SIMPLE COMMAND 'STOP' 'STAND STILL AND
// FIGHT'"): !hold = no automatic movement, healers keep healing; !stop ends walks + item-job waits; a hand-played character never auto-teleports
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '../../..'), SRC = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const cut = (a, b) => { const i = SRC.indexOf(a); return i < 0 ? '' : SRC.slice(i, SRC.indexOf(b, i) + b.length); };
const fnHead = (sig, n) => { const i = SRC.indexOf(sig); return i < 0 ? '' : SRC.slice(i, i + (n || 400)); };
// 1) pure decisions
const P = new Function(cut('// HOLD-PURE-BEGIN', '// HOLD-PURE-END') + '\nreturn { holdDecide, stopWindowOpen };')();
t('hold off: everything allowed', P.holdDecide({ on: false, kind: 'teleport' }).ok === true);
t('hold on: no teleport, no automatic trip', !P.holdDecide({ on: true, kind: 'teleport' }).ok && !P.holdDecide({ on: true, kind: 'auto' }).ok);
// HOLDWALK-2026-11-04 (owner: "1200 from Leader? Where do have that from?" / "Healers should always heal the party members. Follow distance is fine.")
t('hold on: no script walk for a fighter (follow distance only); a healer may always walk to heal', !P.holdDecide({ on: true, kind: 'walk', dist: 900 }).ok && P.holdDecide({ on: true, kind: 'walk', dist: 900, healer: true }).ok);
t('hold on: a walk 280k away (to Giran) is refused', !P.holdDecide({ on: true, kind: 'walk', dist: 280000 }).ok);
t('!stop window: no walk starts for 6 s, then walks again', P.stopWindowOpen(1000, 4000) && !P.stopWindowOpen(1000, 8000) && !P.stopWindowOpen(0, 5000));
// 2) every automatic trip / teleport / pull / hand-over / job is gated
const gates = [['async function teleportNear(', 'holdTrip('], ['async function townCommand(', 'holdTrip('], ['async function useEscape(', 'holdTrip('], ['async function gkTeleport(', 'holdTrip('],
  ['async function giranGo(', 'holdTrip('], ['async function leadGoGiran(', 'holdTrip('], ['async function leadRouteWalk(', 'holdTrip('], ['async function leadTeamWalk(', "holdBlocks('walk'"],
  ['async function unstuckToTown(', 'holdTrip('], ['async function rgWalk(', "holdBlocks('walk'"], ['async function teamRegroupBeforePort(', "holdTrip("], ['async function leadSupply(', 'holdTrip('],
  ['function crunCallRunner(', 'holdOn()'], ['async function aoePullRun(', "holdBlocks('auto'"], ['async function itemJobOrder(', "holdBlocks('auto'"], ['async function walkDirect(', "holdBlocks('walk'"]];
gates.forEach(([sig, g]) => t(`gated: ${sig.replace(/async |function |\(/g, '')}`, fnHead(sig, 700).includes(g)));
t('hand-over gated (hovGive)', fnHead('async function hovGive(', 1600).includes("holdBlocks('auto', 'a hand-over')"));
t('teamRegroupBeforePort answers "interrupted" (= no teleport) under hold', fnHead('async function teamRegroupBeforePort(', 300).includes("return 'interrupted'"));
// 3) healers keep healing: heal / res / buff code never asks the hold
['function healTick(', 'async function healTick(', 'function resDecide('].forEach(sig => { const h = fnHead(sig, 3000); if (h) t(`${sig.trim()} is not gated by hold (healers heal during hold)`, !/hold(On|Trip|Blocks)\(/.test(h)); });
const hold = cut("case '!hold': {", 'break;\n    }');
t('!hold does not touch the heal brain / res / buffs (only follow + assist options, members only)', hold && !/HEAL\.|heal[A-Z(]|res[A-Z]\w*\(|buff\w*\(/.test(hold.replace(/healers keep healing|isHealerRole/g, '')));
t('!hold: fighters assist the leader\'s target (FollowAtk + AtkBySelect)', /Options\.FollowAtk = true; Options\.AtkBySelect = true/.test(hold) && /!isHealerRole\(\)/.test(hold));
t('!hold persists (leader writes Logs/hold_<leader>.json, every member reads it)', /if \(isLeader\(\)\) holdWrite\(!off\)/.test(hold) && SRC.includes('Logs\\\\hold_${CONFIG.leader}.json'));
// 4) !stop really stops
const stop = cut("case '!stop':", "log('Mode: IDLE');");
t('!stop opens the stop window, interrupts control loops and ends my errand', /state\.stopAt = now\(\)/.test(stop) && /control\.gen\+\+/.test(stop) && /errandEnd\(\)/.test(stop));
t('walkDirect refuses to start inside the stop window (route loops do not walk on)', fnHead('async function walkDirect(', 600).includes('stopWindowOpen(state.stopAt, now())'));
t('item-job waits end on !stop (ijStopped in the bank / hand-over / rx waits)', (SRC.match(/&& !ijStopped\(\)/g) || []).length >= 5 && /IJ\.busy = id; IJ\.sg0 = state\.stopGen/.test(SRC));
// 5) a hand-played character never auto-teleports / regroups
t('holdTrip refuses for a character the owner plays in the client (client_mode.json ingame)', /function holdTrip\([\s\S]{0,1200}selfHandPlayed\(\)/.test(SRC) && SRC.includes('Settings\\\\client_mode.json'));
// 6) dashboard
t('the catalog knows !hold and !hold off', /tpl: '!hold'/.test(fs.readFileSync(path.join(R, 'Dashboard/commands.js'), 'utf8')) && /tpl: '!hold off'/.test(fs.readFileSync(path.join(R, 'Dashboard/commands.js'), 'utf8')));
t('the party card has the HOLD button + its state', /data-holdsw=/.test(fs.readFileSync(path.join(R, 'Dashboard/runswitch.js'), 'utf8')) && /hold_\$\{leader\}\.json/.test(fs.readFileSync(path.join(R, 'Dashboard/runstate_api.js'), 'utf8')));
// OWNERORDER-2026-11-04 (owner: "But I explicit told you to do something then you do it"): the hand-played block only stops AUTOMATIC trips
{ const SRCX = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8'), i = SRCX.indexOf('function holdTrip('), body = SRCX.slice(i, SRCX.indexOf('\nfunction holdWrite', i));
  t('a hand-played leader still runs the OWNER\'s orders (userOrder.name) - only automatic trips are blocked', /ownerOrder = !!\(typeof userOrder !== 'undefined' && userOrder\.name\)/.test(body) && /if \(selfHandPlayed\(\) && !ownerOrder\)/.test(body));
  // live 16:36: "regrouping in Giran (leveling (!start))" was still blocked - the order word in the reason counts
  t('"... (leveling (!start))" counts as the owner\'s order, "(leveling (watchdog))" does not', /\\\(!\|your order/.test(body) && /\(!/.test('regrouping in Giran (leveling (!start))') && !/\(!/.test('regrouping in Giran (leveling (watchdog))')); }
{ const SRCY = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8'), i = SRCY.indexOf('function holdTrip('), body = SRCY.slice(i, SRCY.indexOf('\nfunction holdWrite', i));
  t('leveling the owner started (autoLvl.active / run switch) is his order: the hand-played block does not stop its trips', /autoLvl\.active && !autoLvl\.stop\) \|\| \(typeof runAuto === 'function' && runAuto\('level'\)\)\)\) ownerOrder = true/.test(body)); }
console.log(`hold: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
