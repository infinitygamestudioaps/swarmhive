// CLASS ROTATIONS compile (CLASSROT-2026-10-26): Scripts/data/class_rotations/<group>.json + class_rotations_user.json + the datapack skills
// -> Scripts/data/class_rotation/<classId>.json (one small file per class id; swarm.js reads only its own class).
//   node docs/plan/tools/class_rotation_compile.js            (the dashboard API runs the same compile after every owner change)
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const CR = require(path.join(ROOT, 'Dashboard', 'classrot_logic.js'));
const rd = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
let META = null;
/** datapack skill facts the engine needs: scope, radius (affectRange / fan range), cast range, power + MP at the top level, abnormal type + time */
function skillMeta() {
  if (META) return META;
  META = {};
  const dir = path.join(ROOT, 'Scripts', 'data', 'dp', 'skills');
  if (!fs.existsSync(dir)) {   // the shared package has no datapack: the skill facts the shipped compiled files already carry
    const out = path.join(ROOT, 'Scripts', 'data', 'class_rotation');
    try { fs.readdirSync(out).filter(f => f.endsWith('.json')).forEach(f => { try { Object.assign(META, rd(path.join(out, f)).skills || {}); } catch (e) { } }); } catch (e) { }
    return META;
  }
  fs.readdirSync(dir).filter(f => f.endsWith('.xml')).forEach(f => {
    const x = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /<skill id="(\d+)" levels="(\d+)" name="([^"]*)"[^>]*>([\s\S]*?)<\/skill>/g; let m;
    while ((m = re.exec(x))) {
      const body = m[4], set = (n) => { const r = new RegExp(`<set name="${n}" val="([^"]*)"`).exec(body); return r ? r[1] : ''; };
      const table = (n) => { const r = new RegExp(`<table name="#${n}">([^<]*)</table>`).exec(body); return r ? r[1].trim().split(/\s+/) : null; };
      const val = (n) => { const v = set(n); if (v.startsWith('#')) { const t = table(v.slice(1)); return t ? t[t.length - 1] : ''; } return v; };
      let power = ''; const pw = /<param power="([^"]*)"/.exec(body);
      if (pw) { if (pw[1].startsWith('#')) { const t = table(pw[1].slice(1)); power = t ? t[t.length - 1] : ''; } else power = pw[1]; }
      const fan = set('fanRange'); const fanR = fan ? Number(fan.split(',')[3]) || 0 : 0;
      META[m[1]] = { scope: set('affectScope') || 'SINGLE', radius: Number(val('affectRange')) || fanR || 0, range: Number(val('castRange')) || 0, power: Number(power) || 0,
        mp: Number(val('mpConsume2') || val('mpConsume1')) || 0, ab: set('abnormalType'), dur: Number(val('abnormalTime')) || 0, magic: /MagicalAttack|MagicalSoulAttack|DeathLink|HpDrain/.test(body) ? 1 : 0 };
    }
  });
  return META;
}
function compileAll(opts) {
  const o = opts || {};
  const groupsDir = path.join(ROOT, 'Scripts', 'data', 'class_rotations'), outDir = path.join(ROOT, 'Scripts', 'data', 'class_rotation');
  fs.mkdirSync(outDir, { recursive: true });
  const groups = fs.existsSync(groupsDir) ? fs.readdirSync(groupsDir).filter(f => f.endsWith('.json')).map(f => { try { return Object.assign({ group: f.slice(0, -5) }, rd(path.join(groupsDir, f))); } catch (e) { return null; } }).filter(Boolean) : [];
  let user = {}; try { user = rd(path.join(ROOT, 'Scripts', 'data', 'class_rotations_user.json')); } catch (e) { user = {}; }
  const idx = CR.classIndex(rd(path.join(ROOT, 'docs', 'plan', 'class_skills', 'class_skills.json')));
  const meta = skillMeta(), at = new Date().toISOString();
  let n = 0;
  Object.keys(idx).forEach(cid => {
    const c = CR.compileClass(cid, groups, idx, user, meta); if (!c || !c.rows.length) return;
    c.at = at;
    const txt = JSON.stringify(c), file = path.join(outDir, cid + '.json');
    let old = ''; try { old = fs.readFileSync(file, 'utf8'); } catch (e) { }
    if (old.replace(/"at":"[^"]*",?/, '') !== txt.replace(/"at":"[^"]*",?/, '')) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, txt); fs.renameSync(tmp, file); n++; }   // atomic; unchanged files keep their time (no needless re-reads)
  });
  if (!o.quiet) console.log(`class rotation: ${groups.length} groups -> ${Object.keys(idx).length} classes, ${n} files written to Scripts/data/class_rotation`);
  return { groups: groups.length, written: n };
}
module.exports = { compileAll, skillMeta };
if (require.main === module) compileAll();
