// TARBEETLE guard (owner 2026-11-04, Forge of the Gods): never stand within ~300 of a Tar Beetle (Tar Spite after 10-20 s)
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); } };
const a = SRC.indexOf('var BEETLE = {'), b = SRC.indexOf('\nsetInterval(', a);
const F = new Function(SRC.slice(a, b) + '\nreturn { BEETLE, beetleStep };')();
t('no beetle near = stay', F.beetleStep({ x: 0, y: 0 }, [{ x: 900, y: 0 }], null).go === false);
const s = F.beetleStep({ x: 0, y: 0 }, [{ x: 150, y: 0 }], null);
t('a beetle 150 away = step to >= 360 from it', s.go && Math.hypot(s.x - 150, s.y) >= 360, s);
const s2 = F.beetleStep({ x: 0, y: 0 }, [{ x: 150, y: 0 }, { x: -260, y: 0 }], null);
t('two beetles = a spot away from both', s2.go && Math.hypot(s2.x - 150, s2.y) >= 360 && Math.hypot(s2.x + 260, s2.y) >= 360, s2);
const s3 = F.beetleStep({ x: 0, y: 0 }, [{ x: 150, y: 0 }], { x: 0, y: 0 });
t('a member stays within 500 of the leader / hold anchor', s3.go && Math.hypot(s3.x, s3.y) <= 500, s3);
t('the step is allowed during hold', /kind === 'walk' && typeof BEETLE !== 'undefined' && BEETLE\.stepping\) return false/.test(SRC));
t('only the Tar Beetle (Forge of the Gods) - no other NPC', String(F.BEETLE.names) === '/^Tar Beetle$/i');
console.log(`tarbeetle: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
