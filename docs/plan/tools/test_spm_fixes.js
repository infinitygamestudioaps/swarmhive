// Vykaax 1.8.16 reports (2026-10-22): zones vanish when zoomed in, dungeon floors without map, drawn spots never reached, Giant's Cave landing missing
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..', '..');
const IDX = fs.readFileSync(path.join(R, 'Dashboard', 'index.html'), 'utf8'), SRV = fs.readFileSync(path.join(R, 'Dashboard', 'server.js'), 'utf8');
const SW = fs.readFileSync(path.join(R, fs.existsSync(path.join(R, 'Scripts_dev', 'swarm.js')) ? 'Scripts_dev' : 'Scripts', 'swarm.js'), 'utf8');
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log('FAIL', name); } };
const body = (src, head) => { const i = src.indexOf(head); if (i < 0) return ''; const j = src.indexOf('\nfunction ', i + 10), k = src.indexOf('\nasync function ', i + 10); return src.slice(i, Math.min(j < 0 ? 1e9 : j, k < 0 ? 1e9 : k)); };

// ZOOMVIS: a zone / hunting ground is drawn when any part of it is in view, not only its centre
const LY = body(IDX, 'function spmLayers()');
t('spmLayers has a box-in-view test', /const boxIn = /.test(LY) && /B\.intersects\(/.test(LY));
t('zones: no centre-only skip', !/!inB\(zn\.x, zn\.y\) \|\| zn\.floor\) return/.test(LY) && /boxIn\(zb\)/.test(LY));
t('hunting grounds: zoomed in uses the region box', /if \(z < 0\) return;/.test(LY) && /boxIn\(r\.bbox \|\| \(lm && lm\.bbox\)/.test(LY));
t('server sends the region bbox', /center: R\.center, bbox: R\.bbox \|\| null/.test(SRV));
// boxIn logic itself (Leaflet-free copy): view x 20000..40000, y 10000..30000; region box x -509..34065 -> in view although its centre (9745) is not
const inter = (a, b) => a[0] <= b[1] && a[1] >= b[0] && a[2] <= b[3] && a[3] >= b[2];
t('box overlap: edge of a big region counts', inter([20000, 40000, 10000, 30000], [-509, 34065, 1608, 25801]) && !inter([20000, 40000, 10000, 30000], [-50000, -30000, 0, 5000]));

// DUNMAPBG: a floor without a picture keeps the world map; a missing picture index is not cached; the server draws them once when missing
const DL = body(IDX, 'function spmDunLayers(');
t('dungeon floor without art keeps the world tiles', /if \(art\) \{ if \(map\.hasLayer\(t\)\) map\.removeLayer\(t\); \} else if \(!map\.hasLayer\(t\)\) t\.addTo\(map\)/.test(DL));
t('missing floor-map index not cached', /catch \(e\) \{ SPM\.fmIdx = null; \}/.test(IDX));
t('server draws missing floor maps in the background', /DUNMAPBG/.test(SRV) && /floor_maps\.js'\)/.test(SRV) && /'--gaps'/.test(SRV) && /PRIORITY_BELOW_NORMAL/.test(SRV));

// NOSTARTSPOT: a far spot with no start teleports near before the walk-only walk
const i0 = SW.indexOf('NOSTARTSPOT 2026-10-22'), i1 = SW.indexOf('state.walkOnly = true;                           // we are at the right landing now', i0);
t('travelToSpot: teleport near for a far spot without a start', i0 > 0 && i1 > i0 && /await teleportNear\(spot\.center\.x, spot\.center\.y, spot\.name\)/.test(SW.slice(i0, i1)) && /travel\.maxWalk/.test(SW.slice(i0, i1)));

// SPOTEDIT: editing a zone spot after a failed trip ends the 5-min block
t('spot edit clears the fail block', /SPOTEDIT 2026-10-22/.test(SW) && /zn.updated/.test(SW) && /manualSw.failSig = null; manualSw.failUntil = 0;/.test(SW));

// GCLANDING: the live "Entrance to The Giant's Cave" maps to the datapack landing
const gkKey = (s) => String(s || '').toLowerCase().replace(/&#\d+;/g, '').replace(/\bthe\b|\btown of\b|\bvillage\b|\btownship\b|\(|\)/g, '').replace(/[^a-z0-9>]/g, '');
const m = /const GK_DEST_ALIAS = (\{[^}]*\});/.exec(SRV); let A = {}; try { A = m ? Function('return ' + m[1])() : {}; } catch (e) { }
t("Giant's Cave alias", A[gkKey("Entrance to The Giant's Cave")] === gkKey('The Giants Cave Upper Layer') && /GK_DEST_ALIAS\[gkKey\(to\)\]/.test(SRV));

// PLANIDLE: the plan's leveling watchdog waits for town errands; the hunt timer leaves a running plan step alone
const PL = body(SW, 'async function planStepLevel(');
t('plan level: busy task is not idle', PL.includes('|| busyTask()) { idle = 0; continue; }') && PL.includes('state.taskAt'));
t('plan level: a real run forgives restarts', PL.includes('&& restarts) restarts = 0;'));
t('hunt timer: no second leadLevel while a plan level step runs', SW.includes("PLAN.running && PLAN.levelStep) note('[hunt timer]"));

console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
