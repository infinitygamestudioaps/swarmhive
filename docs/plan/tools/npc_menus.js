// NPC MENUS from the L2J High Five datapack (2026-10-09): what an NPC's dialog offers, as far as the datapack tells.
// Sources (all local copies, fetched from github.com/Shagooh/l2j-server-datapack):
//   Scripts/data/dp/html_teleporter/<id>[-n].htm   data/html/teleporter: links "npc_%objectId%_goto <teleport id>"
//   Scripts/data/dp/ai_teleports/<Script>__<file>   ai/npc/Teleports/*: htm pages + the Java script (Location tables, NPC ids)
//   Scripts/data/l2j_teleport.sql + teleports_h5.json  teleport id -> description, landing, price
//   Scripts/data/dp/buylists/*.xml                  shop lists per NPC
// Used by floor_links.js (dungeon floor links) and npc_atlas.js (the game-wide NPC atlas).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const htmlText = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

let TP = null;
/** teleport id -> { id, desc, x, y, z, price } (l2j_teleport.sql + teleports_h5.json) */
function teleports() {
  if (TP) return TP;
  TP = {};
  try { rd(path.join(DATA, 'teleports_h5.json')).forEach(t => { TP[t.id] = { id: t.id, desc: t.desc, x: t.x, y: t.y, z: t.z, price: t.price }; }); } catch (e) { }
  try {
    const sql = fs.readFileSync(path.join(DATA, 'l2j_teleport.sql'), 'utf8');
    const re = /\('((?:[^'\\]|\\.)*)',\s*(\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/g; let m;
    while ((m = re.exec(sql))) { const id = +m[2]; if (!TP[id]) TP[id] = { id, desc: m[1].replace(/\\'/g, "'"), x: +m[3], y: +m[4], z: +m[5], price: +m[6], noble: +m[7] === 1, item: +m[8] }; }
  } catch (e) { }
  return TP;
}
/** links of an html page: [{ text, cmd, tpId, script, ev }] */
function pageLinks(html) {
  const out = [], re = /<a\b[^>]*action="bypass\s+(?:-h\s+)?([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(html))) {
    const cmd = m[1].trim(), text = htmlText(m[2]);
    const g = cmd.match(/_goto\s+(\d+)/), q = cmd.match(/^Quest\s+(\w+)\s+(\S+)/i), qn = cmd.match(/_Quest\s+(\w+)/);
    out.push({ text, cmd, tpId: g ? +g[1] : null, script: q ? q[1] : qn ? qn[1] : null, ev: q ? q[2] : null });
  }
  return out;
}
let AI = null;
/** AI teleport scripts: { Script: { npcIds: [..], locs: { key: {x,y,z,label} }, pages: { file: html } } } */
function aiScripts() {
  if (AI) return AI;
  AI = {};
  const dir = path.join(DATA, 'dp', 'ai_teleports');
  let files = []; try { files = fs.readdirSync(dir); } catch (e) { return AI; }
  files.forEach(f => {
    const [scr, file] = f.split('__'); if (!file) return;
    const S = AI[scr] = AI[scr] || { npcIds: [], locs: {}, pages: {}, java: '' };
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/\.java$/.test(file)) {
      S.java = txt;
      // NPC ids: "private static final int NAME = 12345;" and "{ 32864, 32865 }" lists after "NPC" comments
      (txt.match(/static final int\s+\w+\s*=\s*(\d{5})\s*;/g) || []).forEach(x => { const id = +x.match(/(\d{5})/)[1]; if (id >= 30000 || id < 18000) S.npcIds.push(id); });
      (txt.match(/\{\s*(\d{5}\s*,\s*)+\d{5}\s*,?\s*\}/g) || []).forEach(x => (x.match(/\d{5}/g) || []).forEach(n => S.npcIds.push(+n)));
      // locations: map puts with a key, then plain arrays (1-based)
      const put = /\.put\(\s*"?(\w+)"?\s*,\s*new Location\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)[^)]*\)\s*\)\s*;\s*(?:\/\/\s*([^\n]*))?/g; let m;
      while ((m = put.exec(txt))) S.locs[m[1]] = { x: +m[2], y: +m[3], z: +m[4], label: (m[5] || '').trim() };
      const arr = /Location\[\]\s+\w+\s*=\s*\{([\s\S]*?)\};/g;
      while ((m = arr.exec(txt))) { let i = 1; const li = /new Location\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/g; let n; while ((n = li.exec(m[1]))) { if (!S.locs[String(i)]) S.locs[String(i)] = { x: +n[1], y: +n[2], z: +n[3], label: '' }; i++; } }
      const single = /static final Location\s+(\w+)\s*=\s*new Location\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/g;
      while ((m = single.exec(txt))) S.locs['@' + m[1]] = { x: +m[2], y: +m[3], z: +m[4], label: m[1] };
      Object.keys(S.locs).forEach(k => { const c = txt.match(new RegExp('static final int\\s+' + k + '\\s*=\\s*(\\d+)')); if (c) S.locs[c[1]] = S.locs[k]; });
      S.npcIds = [...new Set(S.npcIds)];
    } else S.pages[file] = txt;
  });
  return AI;
}
/** html pages the datapack has for an NPC id: [{ file, source, html }] */
function pagesFor(id) {
  const out = [];
  const tdir = path.join(DATA, 'dp', 'html_teleporter');
  try { fs.readdirSync(tdir).filter(f => f === `${id}.htm` || f.startsWith(`${id}-`)).forEach(f => out.push({ file: `html/teleporter/${f}`, source: 'dp-html', html: fs.readFileSync(path.join(tdir, f), 'utf8') })); } catch (e) { }
  const ai = aiScripts();
  Object.keys(ai).forEach(scr => Object.keys(ai[scr].pages).forEach(f => { if (f.startsWith(String(id)) && !/no-|no_/.test(f)) out.push({ file: `ai/Teleports/${scr}/${f}`, source: 'dp-ai', html: ai[scr].pages[f], script: scr }); }));
  return out;
}
/**
 * What the datapack says an NPC offers: { teleports: [{ text, tpId, dest: {x,y,z}, desc, price, page, source, needs }], links: [text...],
 * scripts: [names], scripted: [{ script, how }] } (scripted = a teleport done in Java on talk, e.g. Mozella / Triol's Mirror).
 */
function menuOf(id) {
  const T = teleports(), ai = aiScripts(), out = { teleports: [], links: [], scripts: [], scripted: [] };
  pagesFor(id).forEach(p => {
    pageLinks(p.html).forEach(l => {
      out.links.push(l.text);
      if (l.tpId && T[l.tpId]) { const t = T[l.tpId]; out.teleports.push({ text: l.text, tpId: l.tpId, dest: { x: t.x, y: t.y, z: t.z }, desc: t.desc, price: t.price, page: p.file, source: p.source }); }
      else if (l.script && l.ev && ai[l.script]) {
        const loc = ai[l.script].locs[l.ev];
        if (loc) out.teleports.push({ text: l.text, ev: `${l.script} ${l.ev}`, dest: { x: loc.x, y: loc.y, z: loc.z }, desc: loc.label || l.text, price: null, page: p.file, source: 'dp-ai',
          needs: l.script === 'SeparatedSoul' ? 'level 80' : l.script === 'ToIVortex' ? 'Dimension Stone' : null });
      }
    });
  });
  Object.keys(ai).forEach(scr => { if (ai[scr].npcIds.includes(id)) out.scripts.push(scr); });
  // scripted talk teleports (no link: the script teleports on talk / first talk)
  if (out.scripts.includes('CrumaTower') && id === 30483) { const L = ai.CrumaTower.locs['@TELEPORT_LOC1']; if (L) out.scripted.push({ script: 'CrumaTower', text: 'Teleport into the Tower.', dest: L, needs: 'level <= 55' }); }
  if (out.scripts.includes('PaganTeleporters') && (id === 32039 || id === 32040)) { const L = ai.PaganTeleporters.locs[String(id)] || null; out.scripted.push({ script: 'PaganTeleporters', text: '(talk)', dest: L, needs: id === 32039 ? 'Visitor\'s Mark' : null }); }
  if (id === 31540 && ai.GrandBossTeleporters) { const L = ai.GrandBossTeleporters.locs['@ENTER_HALL_OF_FLAMES']; if (L) { out.scripts.push('GrandBossTeleporters'); out.scripted.push({ script: 'GrandBossTeleporters', text: '(talk)', dest: L, needs: 'Vacualite Floating Stone 7267 (quest Q00618 Into the Flame)' }); } }
  out.links = [...new Set(out.links)];
  return out;
}
let BL = null;
/** NPC id -> [buylist ids] from Scripts/data/dp/buylists */
function buylists() {
  if (BL) return BL;
  BL = {};
  const dir = path.join(DATA, 'dp', 'buylists');
  let files = []; try { files = fs.readdirSync(dir); } catch (e) { return BL; }
  files.forEach(f => {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8'), id = +f.replace(/\D/g, '');
    const items = (txt.match(/<item\b/g) || []).length;
    (txt.match(/<npc>(\d+)<\/npc>/g) || []).forEach(x => { const n = +x.replace(/\D/g, ''); (BL[n] = BL[n] || []).push({ list: id, items }); });
  });
  return BL;
}
module.exports = { teleports, pageLinks, aiScripts, pagesFor, menuOf, buylists, htmlText };
