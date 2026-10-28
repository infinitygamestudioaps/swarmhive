// NPC DIALOGS shared helpers (2026-10-27, owner: "gather ALL data from the npcs ... what their answers and questions will be").
// Used by npc_dialogs_build.js (writer), npc_dialogs.js (viewer) and test_npc_dialogs.js. Format: docs/plan/npc_dialogs.md. No dependencies.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'Scripts', 'data');
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return d; } };

let NS = null;
const npcStrings = () => NS || (NS = rd(path.join(DATA, 'npc_strings.json'), {}));

/** client NpcStrings: <fstring>N</fstring>, &$N;, msg="811;F;N" -> text */
function resolveNs(s) {
  const ns = npcStrings();
  return String(s || '')
    .replace(/<fstring>\s*(\d+)\s*<\/fstring>/gi, (m, id) => ns[id] !== undefined ? ns[id] : m)
    .replace(/&\$(\d+);/g, (m, id) => ns[id] !== undefined ? ns[id] : m);
}
const ENT = { quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', apos: "'" };
/** html fragment -> plain text (NpcStrings resolved, tags removed, entities decoded; &#57; = the client's adena glyph -> removed) */
function htmlText(h) {
  return resolveNs(h)
    .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&#57;/g, '').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&(\w+);/g, (m, e) => ENT[e] !== undefined ? ENT[e] : m)
    .replace(/\s+/g, ' ').trim();
}
/** page body text without the "Name:" header and without its link texts */
function pageBody(h) {
  const noLinks = String(h || '').replace(/<a\b[\s\S]*?<\/a>/gi, ' ').replace(/<button\b[^>]*>/gi, ' ');
  return htmlText(noLinks);
}
/** every link of a page, in page order -> [{ text, bypass, msg }] (bypass = the action without "bypass -h ") */
function pageLinks(h) {
  const out = []; const s = String(h || '');
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>|<button\b([^>]*)>/gi; let m;
  while ((m = re.exec(s))) {
    const attrs = m[1] !== undefined ? m[1] : m[3];
    const act = /action\s*=\s*"([^"]*)"/i.exec(attrs) || /action\s*=\s*'([^']*)'/i.exec(attrs);
    if (!act) continue;
    let text = m[2] !== undefined ? htmlText(m[2]) : htmlText(((/value\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1]) || '');
    const msg = (/msg\s*=\s*"([^"]*)"/i.exec(attrs) || [])[1];
    let bypass = act[1].trim();
    let mode = 'bypass';
    if (/^bypass\s+/i.test(bypass)) bypass = bypass.replace(/^bypass\s+(-h\s+)?/i, '').trim();
    else if (/^link\s+/i.test(bypass)) { mode = 'link'; bypass = bypass.replace(/^link\s+/i, '').trim(); }
    out.push({ text, bypass, mode, msg: msg ? resolveNs(msg.replace(/^\d+;F;(\d+)$/, '<fstring>$1</fstring>')) : undefined });
  }
  return out;
}
/** the "Name:" header of a page ('' when none) */
function pageHeader(h) {
  const m = /<body[^>]*>\s*([^<:]{2,60}):\s*<br/i.exec(String(h || ''));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}
/** link text normal form (docs/plan/npc_dialogs.md "Text matching") */
function norm(t) {
  return htmlText(String(t || '')).toLowerCase()
    .replace(/\s+-\s+[\d,.]+\s*(adena)?\s*$/i, '').replace(/\s+free\s*$/i, '').replace(/\(free\)/g, '')
    .replace(/[\[\]"'`.!?,:;]/g, '').replace(/[’‘“”]/g, '').replace(/\s+/g, ' ').trim();
}
/** loose word set for page text similarity */
function words(t) { return new Set(String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2)); }
function jaccard(a, b) { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); }
const short = (t, n = 300) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/** datapack bypass -> { kind, event?, script?, to? } (to = page id relative to data/html, or quest page) */
function classifyBypass(bypass, mode, ctx) {
  const b = String(bypass || '').trim(); let m;
  if (mode === 'link') return { kind: 'page', to: b.replace(/^data\/html\//, '') };
  if ((m = /^Quest\s+(\S+)\s+([\s\S]+)$/i.exec(b))) return { kind: 'quest-event', script: m[1], event: m[2].trim() };
  if ((m = /^Quest\s+(\S+)$/i.exec(b))) return { kind: 'quest', script: m[1] };
  if (/^npc_%objectId%_Quest\s*$/i.test(b)) return { kind: 'quest-menu', to: '@questlist' };
  if ((m = /^npc_%objectId%_Quest\s+(\S+)(?:\s+([\s\S]+))?$/i.exec(b))) return m[2] ? { kind: 'quest-event', script: m[1], event: m[2].trim() } : { kind: 'quest', script: m[1] };
  if ((m = /^npc_%objectId%_Chat\s+(\d+)/i.exec(b))) return { kind: 'page', chat: +m[1] };
  if ((m = /^npc_%objectId%_Link\s+(\S+)/i.exec(b))) return { kind: 'page', to: m[1].replace(/^data\/html\//, '') };
  if (/multisell/i.test(b)) return { kind: 'multisell' };
  if (/_(Buy|Sell|Wear|BuyList|SellList|Manor|ShowBuy)/i.test(b)) return { kind: 'shop' };
  if (/goto|teleport|_tele|observe|Teleport/i.test(b)) return { kind: 'teleport' };
  if (/Deposit|Withdraw|Freight|WH_/i.test(b)) return { kind: 'warehouse' };
  if (/Skill|learn|Enchant/i.test(b)) return { kind: 'skills' };
  if (/class|Subclass|Certif|Transform/i.test(b)) return { kind: 'class' };
  if (/^_bbs|^bbs_|^_mail|^_friend/i.test(b)) return { kind: 'board' };
  return { kind: 'other' };
}

/** quest list texts the server shows for quest q (NpcString q*100+1 / +2) */
function questListTexts(qid, fallbackName) {
  const ns = npcStrings(); const a = ns[String(qid * 100 + 1)] || fallbackName || ''; const b = ns[String(qid * 100 + 2)] || (a ? a + ' (In Progress)' : '');
  return { start: a, progress: b };
}

const DIALOG_DIR = path.join(DATA, 'npc_dialogs');
const QUEST_DIALOGS = path.join(DATA, 'quest_dialogs.json');
function loadNpc(id) { return rd(path.join(DIALOG_DIR, String(id) + '.json'), null); }
function loadQuestDialogs() { return rd(QUEST_DIALOGS, null); }

/** engine-side helper: the link on the current page for dialog entry e -> link | null (L = [{ text }], e = { click, alts }) */
function matchLink(L, e) {
  const want = [e.click].concat(e.alts || []).map(norm).filter(Boolean);
  for (const w of want) { const l = (L || []).find(x => norm(x.text) === w); if (l) return l; }
  return null;
}

module.exports = { ROOT, DATA, rd, resolveNs, htmlText, pageBody, pageLinks, pageHeader, norm, words, jaccard, short, classifyBypass, questListTexts, DIALOG_DIR, QUEST_DIALOGS, loadNpc, loadQuestDialogs, matchLink };
