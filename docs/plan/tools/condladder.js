// For each quest: every setCond(N) with the actor (npc/mob/event) and the item operations right before it.
// node condladder.js <questDir> <digest.json> <out.json>
const fs = require('fs'), path = require('path');
const [dir, digestFile, out] = process.argv.slice(2);
const digest = JSON.parse(fs.readFileSync(digestFile, 'utf8'));

function bodyOf(src, name) {
  const m = new RegExp(`public\\s+String\\s+${name}\\s*\\(`).exec(src); if (!m) return null;
  const s = src.indexOf('{', m.index); let d = 0;
  for (let i = s; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && !--d) return src.slice(s + 1, i); }
  return null;
}
const res = {};
for (const f of fs.readdirSync(dir).filter(f => /^Q\d+_.*\.java$/.test(f))) {
  const id = +/^Q0*(\d+)_/.exec(f)[1];
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const C = digest[id].constants; const byId = {};
  for (const [k, v] of Object.entries(C)) byId[v.id] = k;
  const steps = [];
  for (const [mname, kind] of [['onAdvEvent', 'event'], ['onTalk', 'talk'], ['onKill', 'kill'], ['onAttack', 'attack'], ['onSkillSee', 'skill']]) {
    const b = bodyOf(src, mname); if (!b) continue;
    let actor = null, buf = [];
    for (const raw of b.split('\n')) {
      const l = raw.trim();
      const c = /^case\s+("?)([^":]+)\1\s*(:|->)/.exec(l);
      if (c) {
        let a = c[2].trim();
        const hm = /^(\d{5})-/.exec(a); if (hm && byId[+hm[1]]) a = `${byId[+hm[1]]}@${a}`;
        actor = a; buf = []; continue;
      }
      if (/^\}?\s*else|^if \(|^\} else if/.test(l)) buf = buf.filter(x => x.startsWith('need'));
      let m;
      if ((m = /has(?:Quest)?Items?\(\s*\w+\s*,\s*([A-Z0-9_, ]+)\)/.exec(l))) buf.push('need ' + m[1].replace(/\s+/g, ''));
      if ((m = /getQuestItemsCount\(\s*\w+\s*,\s*([A-Z0-9_]+)\)\s*([<>=]+)\s*(\d+)/.exec(l))) buf.push(`need ${m[1]}${m[2]}${m[3]}`);
      if ((m = /isMemoState\(\s*(\d+)/.exec(l)) || (m = /memoState\s*==\s*(\d+)/.exec(l))) buf.push(`memo${m[1]}`);
      if ((m = /giveItems\(\s*\w+\s*,\s*([A-Z0-9_]+)(?:\s*,\s*(\d+))?/.exec(l))) buf.push(`+${m[1]}${m[2] && m[2] !== '1' ? 'x' + m[2] : ''}`);
      if ((m = /giveItemRandomly\([^,]+,[^,]+,\s*([A-Z0-9_]+)/.exec(l))) buf.push(`+${m[1]}(rnd)`);
      if ((m = /giveRnd\([^,]+,[^,]+,\s*([A-Z0-9_.()]+)/.exec(l))) buf.push(`+${m[1]}(holder)`);
      if ((m = /takeItems?\(\s*\w+\s*,\s*(?:-1\s*,\s*)?([A-Z0-9_]+)/.exec(l))) buf.push(`-${m[1]}`);
      if ((m = /addSpawn\(\s*(?:npc\s*,\s*)?([A-Z_][A-Z0-9_]+)/.exec(l))) buf.push(`spawn ${m[1]}`);
      if ((m = /getRandom\(\s*(\d+)\s*\)\s*<\s*(\d+)/.exec(l))) buf.push(`chance ${m[2]}/${m[1]}`);
      if ((m = /getActiveWeaponItem|getActiveWeaponInstance/.exec(l))) buf.push('NEEDS WEAPON EQUIPPED');
      if ((m = /setCond\(\s*(\d+)/.exec(l))) {
        steps.push({ cond: +m[1], kind, actor, ops: [...new Set(buf)] });
        buf = buf.filter(x => x.startsWith('need'));
      }
      if (/exitQuest/.test(l)) steps.push({ cond: 999, kind, actor, ops: [...new Set(buf)], note: 'FINISH' });
    }
  }
  steps.sort((a, b) => a.cond - b.cond);
  res[id] = { id, title: digest[id].title, steps };
}
fs.writeFileSync(out, JSON.stringify(res, null, 1));
for (const q of Object.values(res)) {
  console.log(`== ${q.id} ${q.title}`);
  for (const s of q.steps) console.log(`  ${s.cond === 999 ? 'END' : 'c' + s.cond} ${s.kind}:${s.actor}  ${s.ops.join(' ')}`);
}
