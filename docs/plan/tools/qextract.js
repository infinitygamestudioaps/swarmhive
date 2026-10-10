// Extracts a compact digest of L2J quest Java files (item-driven state machines).
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// node qextract.js <dir with Q*.java> <out.json>
const fs = require('fs'), path = require('path');
const [dir, out] = process.argv.slice(2);
const npcs = JSON.parse(fs.readFileSync(__ROOT + '/Scripts/data/npcs_h5.json', 'utf8').replace(/^\uFEFF/, ''));
const npcById = {};
Object.entries(npcs).forEach(([id, n]) => { npcById[id] = { id: +id, name: n.n, title: n.t, level: n.l, type: n.ty, hp: n.hp, aggro: n.ag }; });
const spawns = JSON.parse(fs.readFileSync(__ROOT + '/Scripts/data/spawns_h5.json', 'utf8').replace(/^\uFEFF/, ''));
const spawnById = {};
spawns.forEach(s => { (spawnById[s.id] = spawnById[s.id] || []).push(s); });

function blockAfter(src, idx) {           // returns text of {...} starting at first '{' after idx
  const s = src.indexOf('{', idx); if (s < 0) return '';
  let d = 0;
  for (let i = s; i < src.length; i++) {
    if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s + 1, i); }
  }
  return src.slice(s + 1);
}
function method(src, name) {
  const m = new RegExp(`public\\s+String\\s+${name}\\s*\\(`).exec(src);
  return m ? blockAfter(src, m.index) : '';
}
// split a switch body into cases: returns [{labels:[...], body}]
function cases(body) {
  const res = []; const re = /case\s+([^:]+):/g; let m; const marks = [];
  while ((m = re.exec(body))) marks.push({ label: m[1].trim().replace(/"/g, ''), idx: m.index, end: re.lastIndex });
  // group consecutive labels with no code between
  for (let i = 0; i < marks.length; i++) {
    const labels = [marks[i].label]; let j = i;
    while (j + 1 < marks.length && body.slice(marks[j].end, marks[j + 1].idx).trim() === '') { j++; labels.push(marks[j].label); }
    const end = j + 1 < marks.length ? marks[j + 1].idx : body.length;
    res.push({ labels, body: body.slice(marks[j].end, end) });
    i = j;
  }
  return res;
}
function sum(src, C) {
  const name = v => (C[v] !== undefined ? `${v}(${C[v]})` : v);
  const out = {};
  const grab = (re, f) => { let m; const a = []; while ((m = re.exec(src))) a.push(f(m)); return a; };
  out.req = [...new Set(grab(/hasQuestItems\(\s*\w+\s*,\s*([A-Z0-9_, ]+)\)/g, m => m[1].split(',').map(s => s.trim()).map(name).join('+')))];
  out.notHave = [...new Set(grab(/!hasQuestItems\(\s*\w+\s*,\s*([A-Z0-9_, ]+)\)/g, m => m[1].split(',').map(s => s.trim()).map(name).join('+')))];
  out.counts = [...new Set(grab(/getQuestItemsCount\(\s*\w+\s*,\s*([A-Z0-9_]+)\)\s*([<>=!]+)\s*(\d+)/g, m => `${name(m[1])}${m[2]}${m[3]}`))];
  out.give = grab(/giveItems\(\s*\w+\s*,\s*([A-Z0-9_]+)\s*,\s*(\w+)/g, m => `${name(m[1])}x${m[2]}`);
  out.giveRandom = grab(/giveItemRandomly\(\s*\w+\s*,\s*\w+\s*,\s*([A-Z0-9_]+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*([\d.]+)/g, m => `${name(m[1])} +${m[2]} upto ${m[3]} chance ${m[4]}`);
  out.take = [...new Set(grab(/takeItems\(\s*\w+\s*,\s*([A-Z0-9_]+)/g, m => name(m[1])))];
  out.cond = grab(/setCond\(\s*(\d+)/g, m => +m[1]);
  out.isCond = [...new Set(grab(/isCond\(\s*(\d+)\s*\)/g, m => +m[1]))];
  out.rnd = grab(/getRandom\(\s*(\d+)\s*\)\s*([<>=]+)\s*(\d+)/g, m => `rnd${m[1]}${m[2]}${m[3]}`);
  out.spawn = grab(/addSpawn\(\s*(?:\w+\s*,\s*)?([A-Z0-9_]+)/g, m => name(m[1]));
  out.radar = grab(/addMarker\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/g, m => `${m[1]},${m[2]},${m[3]}`);
  out.exitQuest = /exitQuest/.test(src);
  out.reward = grab(/addExpAndSp\(\s*(\d+)\s*,\s*(\d+)/g, m => `exp ${m[1]} sp ${m[2]}`).concat(grab(/giveAdena\(\s*\w+\s*,\s*(\d+)/g, m => `adena ${m[1]}`));
  for (const k of Object.keys(out)) if (Array.isArray(out[k]) && !out[k].length) delete out[k];
  if (!out.exitQuest) delete out.exitQuest;
  return out;
}
const result = {};
for (const f of fs.readdirSync(dir).filter(f => /^Q\d+_.*\.java$/.test(f))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const id = +/^Q0*(\d+)_/.exec(f)[1];
  const C = {}; const cat = {}; let section = '';
  src.split('\n').forEach(l => {
    const sec = /^\s*\/\/\s*(.+)$/.exec(l); if (sec) section = sec[1].trim();
    const m = /private static final int (\w+)\s*=\s*(\d+);/.exec(l);
    if (m) { C[m[1]] = +m[2]; cat[m[1]] = section; }
  });
  const q = { id, file: f, title: (/super\(\s*\d+\s*,[^,]+,\s*"([^"]+)"/.exec(src) || [])[1], minLevel: C.MIN_LEVEL || C.MIN_LVL,
    party: /getRandomPartyMember|getRandomPlayerFromParty|getPartyMembers|isInsideRadius.*party/i.test(method(src, 'onKill')),
    partyFns: [...new Set((method(src, 'onKill').match(/getRandom\w*Party\w*|getQuestState\(\s*\w+/g) || []))],
    diamonds: ((/DIMENSIONAL_DIAMOND\s*,\s*(\d+)/.exec(src)) || [])[1],
    constants: {}, events: [], talk: [], kill: [], attack: [] };
  for (const [k, v] of Object.entries(C)) {
    const c = cat[k] || '';
    const e = { id: v, cat: c };
    if (npcById[v] && !/Item|Reward|Misc/i.test(c)) {
      const n = npcById[v]; e.name = n.name; e.title = n.title; e.level = n.level; e.aggro = n.aggro; e.hp = n.hp;
      const sp = spawnById[v]; if (sp) { const cx = Math.round(sp.reduce((a, s) => a + s.x, 0) / sp.length), cy = Math.round(sp.reduce((a, s) => a + s.y, 0) / sp.length), cz = Math.round(sp.reduce((a, s) => a + s.z, 0) / sp.length); e.spawns = sp.length; e.at = [cx, cy, cz]; }
    }
    q.constants[k] = e;
  }
  const adv = method(src, 'onAdvEvent');
  const sw = /switch\s*\(\s*event\s*\)/.exec(adv);
  if (sw) cases(blockAfter(adv, sw.index)).forEach(c => { const s = sum(c.body, C); if (Object.keys(s).length) q.events.push({ ev: c.labels.join('|'), ...s }); });
  const talk = method(src, 'onTalk');
  const sw2 = /switch\s*\(\s*npc\.getId\(\)\s*\)/.exec(talk);
  if (sw2) cases(blockAfter(talk, sw2.index)).filter(c => /^[A-Z_0-9]+$/.test(c.labels[0])).forEach(c => q.talk.push({ npc: c.labels.join('|'), ...sum(c.body, C) }));
  else q.talk.push({ npc: '(no switch)', ...sum(talk, C) });
  for (const [mn, arr] of [['onKill', q.kill], ['onAttack', q.attack]]) {
    const body = method(src, mn); if (!body) continue;
    const s3 = /switch\s*\(\s*npc\.getId\(\)\s*\)/.exec(body);
    if (s3) cases(blockAfter(body, s3.index)).forEach(c => arr.push({ mob: c.labels.join('|'), ...sum(c.body, C) }));
    else arr.push({ mob: '(no switch)', ...sum(body, C) });
  }
  result[id] = q;
}
fs.writeFileSync(out, JSON.stringify(result, null, 1));
console.log(Object.keys(result).length, 'quests');

