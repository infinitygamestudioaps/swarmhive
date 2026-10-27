// XMLORDER-2026-10-27 (tester Raltru after updating to L2Swarm 3.10.7: "The account options XML does not match the internal schema ...
// /Option/CombatSkillsList/CombatSkill/RepeatDelaySeconds: ... expected 'isAdvanced, AdvCombatType, ...'"): L2Swarm 3.10.7 serialises a combat
// action as Skill, IsEnabled, RepeatDelaySeconds, IsRepeat, isAdvanced, Adv* (CombatAction declares RepeatDelaySeconds before IsRepeat; checked by
// reflection + XmlSerializer on 3.10.7). A file that has RepeatDelaySeconds AFTER IsRepeat (older writers) is refused at login.
// This moves every such RepeatDelaySeconds right before its IsRepeat, in every Settings\*.xml (UTF-16 kept, backup first). Nothing else changes.
//   node docs/plan/tools/xml_order_fix.js [--root <L2Swarm folder>] [--dry]      exit 0 = ok (fixed or nothing to do)
'use strict';
const fs = require('fs'), path = require('path');
const ARG = process.argv.slice(2), val = (f, d) => { const i = ARG.indexOf(f); return i >= 0 && ARG[i + 1] ? ARG[i + 1] : d; };
const ROOT = path.resolve(val('--root', path.join(__dirname, '..', '..', '..'))), DRY = ARG.includes('--dry');

function readXml(f) {
  const b = fs.readFileSync(f);
  if (b[0] === 0xFF && b[1] === 0xFE) return { text: b.slice(2).toString('utf16le'), enc: 'utf16le', bom: true };
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return { text: b.slice(3).toString('utf8'), enc: 'utf8', bom: true };
  const looks16 = b.length > 1 && b[1] === 0x00;
  return { text: b.toString(looks16 ? 'utf16le' : 'utf8'), enc: looks16 ? 'utf16le' : 'utf8', bom: false };
}
function writeXml(f, r, text) {
  const body = Buffer.from(text, r.enc), bom = !r.bom ? Buffer.alloc(0) : r.enc === 'utf16le' ? Buffer.from([0xFF, 0xFE]) : Buffer.from([0xEF, 0xBB, 0xBF]);
  const tmp = f + '.tmp' + process.pid; fs.writeFileSync(tmp, Buffer.concat([bom, body])); fs.renameSync(tmp, f);
}
/** pure: fixes the text, returns { text, moved } */
function fixOrder(text) {
  let moved = 0;
  // one element = from its opening tag to the matching close; actions never nest each other, the inner <Skill> has no IsRepeat
  const out = text.replace(/<(CombatSkill|CombatItem|CombatAction|AutoSkill|AutoItem|[A-Za-z]+Skill|[A-Za-z]+Action)\b([^>]*)>([\s\S]*?)<\/\1>/g, (all, tag, attrs, body) => {
    const rd = body.match(/(\r?\n[ \t]*)?<RepeatDelaySeconds>[^<]*<\/RepeatDelaySeconds>/);
    const ir = body.search(/<IsRepeat>/);
    if (!rd || ir < 0 || rd.index < ir) return all;
    const line = rd[0], cut = body.slice(0, rd.index) + body.slice(rd.index + line.length);
    const at = cut.search(/(\r?\n[ \t]*)?<IsRepeat>/);
    moved++;
    return `<${tag}${attrs}>` + cut.slice(0, at) + line + cut.slice(at) + `</${tag}>`;
  });
  return { text: out, moved };
}
module.exports = { fixOrder };

if (require.main === module) {
  const dir = path.join(ROOT, 'Settings');
  if (!fs.existsSync(dir)) { console.log('xml order: no Settings folder in ' + ROOT); process.exit(0); }
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19), bdir = path.join(dir, 'backup', 'xmlorder_' + stamp);
  let files = 0, fixed = 0, moves = 0;
  for (const name of fs.readdirSync(dir).filter(n => /\.xml$/i.test(n))) {
    const f = path.join(dir, name); let r; try { r = readXml(f); } catch (e) { continue; }
    files++;
    if (!/<RepeatDelaySeconds>/.test(r.text)) continue;
    const res = fixOrder(r.text); if (!res.moved) continue;
    fixed++; moves += res.moved;
    console.log(`xml order: ${name}: ${res.moved} RepeatDelaySeconds moved before IsRepeat${DRY ? ' (dry run)' : ''}`);
    if (!DRY) { fs.mkdirSync(bdir, { recursive: true }); fs.copyFileSync(f, path.join(bdir, name)); writeXml(f, r, res.text); }
  }
  console.log(`xml order: ${files} account files checked, ${fixed} fixed (${moves} entries)${fixed && !DRY ? ', backup ' + path.relative(ROOT, bdir) : ''}`);
}
