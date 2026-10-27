// XMLORDER-2026-10-27: tests for xml_order_fix.js (tester Raltru: 3.10.7 refused an account whose RepeatDelaySeconds came after IsRepeat).
//   node docs/plan/tools/test_xml_order_fix.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { fixOrder } = require('./xml_order_fix.js');
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const bad = [
  '<Option>', '  <CombatSkillsList>',
  '    <CombatSkill xsi:type="CombatSkillAdv">', '      <Skill><Id>1239</Id></Skill>', '      <IsEnabled>true</IsEnabled>', '      <IsRepeat>true</IsRepeat>',
  '      <RepeatDelaySeconds>3</RepeatDelaySeconds>', '      <isAdvanced>true</isAdvanced>', '      <AdvCombatType>Always</AdvCombatType>', '    </CombatSkill>',
  '    <CombatSkill xsi:type="CombatSkillAdv">', '      <Skill><Id>1178</Id></Skill>', '      <IsEnabled>true</IsEnabled>', '      <RepeatDelaySeconds>0</RepeatDelaySeconds>',
  '      <IsRepeat>true</IsRepeat>', '      <isAdvanced>true</isAdvanced>', '    </CombatSkill>',
  '    <CombatSkill xsi:type="CombatSkillAdv">', '      <Skill><Id>1</Id></Skill>', '      <IsEnabled>false</IsEnabled>', '      <IsRepeat>true</IsRepeat>', '    </CombatSkill>',
  '  </CombatSkillsList>', '</Option>'].join('\r\n');
const r = fixOrder(bad);
ok(r.moved === 1, 'exactly the one wrong entry is moved (an entry already in order and one without the element are left alone)');
const first = r.text.split('</CombatSkill>')[0];
ok(first.indexOf('<IsEnabled>') < first.indexOf('<RepeatDelaySeconds>') && first.indexOf('<RepeatDelaySeconds>') < first.indexOf('<IsRepeat>') && first.indexOf('<IsRepeat>') < first.indexOf('<isAdvanced>'),
  'order after the fix = IsEnabled, RepeatDelaySeconds, IsRepeat, isAdvanced (L2Swarm 3.10.7 XmlSerializer order)');
ok(r.text.replace(/\s+/g, '').length === bad.replace(/\s+/g, '').length && r.text.split('\r\n').length === bad.split('\r\n').length, 'nothing added or lost, line breaks kept');
ok(/\r\n      <RepeatDelaySeconds>3<\/RepeatDelaySeconds>\r\n      <IsRepeat>/.test(r.text), 'indentation kept');
ok(fixOrder(r.text).moved === 0, 'a second run changes nothing');

// the file side: UTF-16 LE with BOM in, UTF-16 LE with BOM out, backup made
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xmlorder-')); fs.mkdirSync(path.join(tmp, 'Settings'));
const f = path.join(tmp, 'Settings', 'Acc.xml'); fs.writeFileSync(f, Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(bad, 'utf16le')]));
fs.writeFileSync(path.join(tmp, 'Settings', 'Clean.xml'), Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('<Option><IsEnabled>true</IsEnabled></Option>', 'utf16le')]));
const out = cp.spawnSync(process.execPath, [path.join(__dirname, 'xml_order_fix.js'), '--root', tmp], { encoding: 'utf8' });
const b = fs.readFileSync(f);
ok(out.status === 0 && /1 fixed \(1 entries\)/.test(out.stdout), 'the tool reports 1 file fixed: ' + out.stdout.trim().split('\n').pop());
ok(b[0] === 0xFF && b[1] === 0xFE && b.slice(2).toString('utf16le') === r.text, 'written back as UTF-16 LE with BOM, same text as the pure fix');
const bk = fs.readdirSync(path.join(tmp, 'Settings', 'backup')); ok(bk.length === 1 && fs.readFileSync(path.join(tmp, 'Settings', 'backup', bk[0], 'Acc.xml')).equals(Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(bad, 'utf16le')])), 'the original is backed up first');
ok(!fs.existsSync(path.join(tmp, 'Settings', 'backup', bk[0], 'Clean.xml')), 'a file without the problem is not touched or backed up');
fs.rmSync(tmp, { recursive: true, force: true });

// wiring: update.ps1 runs it after every update
const upd = [path.join(__dirname, '..', '..', '..', 'release', 'src', 'update.ps1'), path.join(__dirname, '..', '..', '..', 'update.ps1')].find(p => fs.existsSync(p));
ok(upd && /xml_order_fix\.js/.test(fs.readFileSync(upd, 'utf8')), 'update.ps1 runs xml_order_fix.js after every update');
console.log(fails ? `${fails} of ${n} FAILED` : `all ${n} ok`); process.exit(fails ? 1 : 0);
