// Builds Scripts/data/quest_dialogs_h5.json: for every talk/turnin leg in the 1st- and
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// 2nd-class route files, the chain of link TEXTS a script must click (L2Toggle obfuscates
// bypass codes per dialog, so clicks go by visible text).
// Run: node quest_dialogs.js   (downloads quest sources to Scripts/data/dp/quests/ once)
const fs = require('fs');
const path = require('path');

const DATA = __ROOT + '/Scripts/data';
const CACHE = path.join(DATA, 'dp', 'quests');
const RAW = 'https://raw.githubusercontent.com/Shagooh/l2j-server-datapack/main/';
const TREE = process.env.TEMP + '/questtree.txt';
const npcStrings = JSON.parse(fs.readFileSync(path.join(DATA, 'npc_strings.json'), 'utf8').replace(/^\uFEFF/, ''));

const read = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const r1 = read(path.join(DATA, 'routes_first_class_h5.json'));
const r2 = read(path.join(DATA, 'routes_second_class_h5.json'));

// --- collect legs --------------------------------------------------------------
const legs = [];
for (const q of r1.quests) for (const l of q.legs) {
  if (!/talk|turnin/.test(l.action) || !l.npc) continue;
  legs.push({ key: `${q.id}:${l.step}`, questId: q.id, npcId: l.npc.id, npcName: l.npc.name, choose: l.choose || null, cond: l.condAfter, src: 'first' });
}
const q2 = Array.isArray(r2.quests) ? r2.quests : Object.values(r2.quests);
for (const q of q2) for (const s of q.steps) {
  if (!/talk|turnin/.test(s.action) || !s.npc) continue;
  legs.push({ key: `${q.id}:${s.step}`, questId: q.id, npcId: s.npc.id, npcName: s.npc.name, choose: s.choose || null, cond: s.cond, src: 'second' });
}

// --- download quest folders ----------------------------------------------------
const tree = fs.readFileSync(TREE, 'utf8').split(/\r?\n/).map(s => s.replace(/^\uFEFF/, '').trim()).filter(Boolean);
const folderOf = id => {
  const pre = `Q${String(parseInt(id, 10)).padStart(5, '0')}_`;
  const hit = tree.find(p => p.split('/')[7] && p.split('/')[7].startsWith(pre));
  return hit ? hit.split('/')[7] : null;
};

async function fetchFolder(folder) {
  const dir = path.join(CACHE, folder);
  fs.mkdirSync(dir, { recursive: true });
  const files = tree.filter(p => p.split('/')[7] === folder && p.split('/').length === 9);
  await Promise.all(files.map(async p => {
    const f = path.join(dir, path.basename(p));
    if (fs.existsSync(f)) return;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(RAW + p);
        if (r.ok) { fs.writeFileSync(f, await r.text()); return; }
      } catch (e) { /* retry */ }
    }
  }));
  return dir;
}

// --- html helpers ----------------------------------------------------------------
const decode = s => s
  .replace(/<fstring>\s*(\d+)\s*<\/fstring>/gi, (_, id) => npcStrings[id] || id)
  .replace(/&\$(\d+);/g, (_, id) => npcStrings[id] || '')
  .replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();

function linksOf(html) {
  const out = [];
  const re = /<a\b[^>]*action="bypass\s+(?:-h\s+)?([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) out.push({ action: m[1].trim(), text: decode(m[2]) });
  const btn = /<button\b[^>]*>/gi;
  while ((m = btn.exec(html))) {
    const v = /value="([^"]*)"/i.exec(m[0]), a = /action="bypass\s+(?:-h\s+)?([^"]+)"/i.exec(m[0]);
    if (v && a) out.push({ action: a[1].trim(), text: decode(v[1]) });
  }
  return out;
}

function questLinkEvent(action) {
  const m = /^Quest\s+(\S+)\s+(.+)$/i.exec(action);
  return m ? { quest: m[1], event: m[2].trim() } : null;
}

// --- java helpers ------------------------------------------------------------------
function javaInfo(java) {
  const title = (/super\(\s*\d+\s*,\s*[^,]+,\s*"([^"]+)"/.exec(java) || [])[1] || null;
  // event -> set of conds it sets (onAdvEvent cases)
  const evCond = {};
  const caseRe = /case\s+"([^"]+)"\s*:([\s\S]*?)(?=case\s+"|default\s*:|\n\s{0,2}\}\s*\n)/g;
  let m;
  while ((m = caseRe.exec(java))) {
    const body = m[2];
    const conds = [];
    if (/startQuest\(\)/.test(body)) conds.push(1);
    let c; const cr = /setCond\(\s*(\d+)/g;
    while ((c = cr.exec(body))) conds.push(Number(c[1]));
    const memo = /setMemoState\(\s*(\d+)/g;
    while ((c = memo.exec(body))) conds.push(Number(c[1]));
    (evCond[m[1]] = evCond[m[1]] || []).push(...conds);
  }
  return { title, evCond };
}

// --- resolve ------------------------------------------------------------------------
function resolve(leg, dir, folder) {
  const files = fs.readdirSync(dir);
  const javaFile = files.find(f => f.endsWith('.java'));
  const java = javaFile ? fs.readFileSync(path.join(dir, javaFile), 'utf8') : '';
  const info = javaInfo(java);
  const htmls = {};
  for (const f of files) if (/\.html?$/.test(f)) htmls[f] = fs.readFileSync(path.join(dir, f), 'utf8');

  // links in this NPC's htmls (file names start with npcId)
  const npcFiles = Object.keys(htmls).filter(f => f.startsWith(String(leg.npcId)));
  const edges = [];          // { from, event, text }
  for (const f of npcFiles) for (const l of linksOf(htmls[f])) {
    const q = questLinkEvent(l.action);
    if (q) edges.push({ from: f, event: q.event, text: l.text });
  }

  // which event to reach?
  let target = leg.choose;
  let how = 'choose';
  if (!target && leg.cond !== undefined && leg.cond !== null) {
    const evs = Object.entries(info.evCond).filter(([ev, cs]) => cs.includes(Number(leg.cond)))
      .map(([ev]) => ev).filter(ev => edges.some(e => e.event === ev) || ev.startsWith(String(leg.npcId)));
    if (evs.length) { target = evs[0]; how = 'cond'; }
  }
  if (!target) {
    return { autoOnTalk: true, clicks: [], note: 'No clickable event sets this cond: talking (opening the dialog) advances it in onTalk.' };
  }
  // the target may be shown directly by onTalk (no event link to it)
  const into = edges.filter(e => e.event === target);
  if (!into.length) {
    return { autoOnTalk: true, clicks: [], target, note: `'${target}' is shown by onTalk (no link leads to it) â€” just open the dialog.` };
  }
  // walk back: target <- page A (link text) <- page B ...
  const chain = [];
  let cur = into[0];
  const seen = new Set();
  while (cur && !seen.has(cur.from) && chain.length < 5) {
    seen.add(cur.from);
    chain.unshift(cur.text);
    const prev = edges.filter(e => e.event === cur.from && !seen.has(e.from));
    cur = prev[0];
  }
  return { autoOnTalk: false, clicks: chain, target, startPage: [...seen].pop(), how, title: info.title };
}

(async () => {
  const out = { meta: {
    generated: new Date().toISOString(),
    source: 'L2J High Five datapack (Shagooh/l2j-server-datapack main), quest Java + html',
    howToClick: [
      '1. Open the NPC dialog (Action twice).',
      "2. If the NPC's default page has a 'Quest' link and the quest page is not shown directly, click 'Quest'.",
      '3. If a quest list appears (several quests at this NPC), click the entry containing questTitle.',
      '4. Click each text in clicks[] in order (lowercase substring match on the visible link text).',
      '5. autoOnTalk=true: opening the dialog / Quest link is enough; the server advances the quest in onTalk.',
    ],
    matching: 'Compare lowercase, trimmed link text with includes(); texts are the datapack originals, L2Toggle may change wording.',
  }, fallbackPhrases: [], legs: {} };

  const phraseCount = {};
  let resolved = 0, auto = 0, missing = 0;
  const folders = {};
  for (const leg of legs) {
    const folder = folderOf(leg.questId);
    if (!folder) { out.legs[leg.key] = { npcId: leg.npcId, npcName: leg.npcName, clicks: [], autoOnTalk: null, note: 'quest folder not found in datapack' }; missing++; continue; }
    if (!folders[folder]) folders[folder] = await fetchFolder(folder);
    const r = resolve(leg, folders[folder], folder);
    const java = fs.readdirSync(folders[folder]).find(f => f.endsWith('.java'));
    const title = javaInfo(java ? fs.readFileSync(path.join(folders[folder], java), 'utf8') : '').title;
    out.legs[leg.key] = {
      npcId: leg.npcId, npcName: leg.npcName, questName: folder, questTitle: title,
      clicks: r.autoOnTalk ? ['quest', (title || '').toLowerCase()] : ['quest', (title || '').toLowerCase(), ...r.clicks.map(t => t.toLowerCase())],
      linkTexts: r.clicks || [], autoOnTalk: r.autoOnTalk, target: r.target || leg.choose || null, cond: leg.cond ?? null,
      note: r.note || (r.how === 'cond' ? `target event found by cond ${leg.cond}` : ''),
    };
    if (r.autoOnTalk) auto++; else resolved++;
    (r.clicks || []).forEach(t => { const k = t.toLowerCase(); phraseCount[k] = (phraseCount[k] || 0) + 1; });
  }
  // generic accept/continue phrases: the most common link texts across all quest htmls we downloaded
  const all = {};
  for (const dir of Object.values(folders)) for (const f of fs.readdirSync(dir)) {
    if (!/\.html?$/.test(f)) continue;
    for (const l of linksOf(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      if (!questLinkEvent(l.action)) continue;
      const k = l.text.toLowerCase().replace(/^["']|["']$/g, '');
      if (k && k.length < 60) all[k] = (all[k] || 0) + 1;
    }
  }
  out.fallbackPhrases = Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => ({ text: k, count: n }));
  out.meta.counts = { legs: legs.length, resolvedClicks: resolved, autoOnTalk: auto, missingFolder: missing, quests: Object.keys(folders).length };
  fs.writeFileSync(path.join(DATA, 'quest_dialogs_h5.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.meta.counts));
})();
