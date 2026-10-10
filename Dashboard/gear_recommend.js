// GEAR RECOMMENDATIONS (user 2026-10-09 14:20: "It should pre-populate with what makes the most sense based on gear, weapons, accessories,
// what bonus each set gives and what items are available via the shops").
// Pure: recommendAll(C, G, h) -> { byKey: { '<arch>|<race>': { <grade>: { <slot>: rec } } }, classKey: { classId: key }, at }
//   C = Dashboard/data/gear_catalog.json, G = Giran offers { idx: { itemId: [{ npc, price, common }] } } (live shop scan),
//   h = { fitOf, giranGet, srcText } from gearpage_api.js.
//   rec = { id, name, alt: [ids], altNames, buy: 'auto'|'real', why, src }
// Rules: weapon by the class line's kit (highest damage per second: P.Atk x speed x crit, mystics M.Atk), the best S.A. for the role as
// an alternative; armor = the complete SET with the best score for the role (pieces' P.Def / M.Def / MP + the set bonus parsed from the
// datapack: pAtk / pAtkSpd / crit for damage dealers, pDef / CON / shield for tanks, mAtk / mAtkSpd / INT / WIT / MP for casters and
// healers); jewellery = best M.Def; belt / bracelet = best of the grade (manual). Availability: what Giran SELLS wins (the bots buy only
// there); a better unsold piece becomes the first alternative ("better if you craft / drop it"). Fighters buy the Common twin (1/20 price)
// unless the set bonus is worth it (C-grade and up, bonus score >= 8: then the real set); casters' armor is always the real set.
'use strict';
const GRADES = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
// role profile per archetype
const ROLE_OF = { tank: 'tank', dwarf: 'tank', warrior: 'melee', dual: 'melee', pole: 'melee', sws: 'melee', destroyer: 'melee', fist: 'melee', fighter: 'melee',
  kamaelBase: 'melee', kamaelAS: 'melee', kamaelRapier: 'melee', dagger: 'dagger', archer: 'archer', kamaelBow: 'archer',
  nuker: 'caster', summoner: 'caster', mystic: 'caster', healer: 'healer', buffer: 'healer' };
// set bonus weights: x-multipliers count per 1.0 (x1.05 -> 0.05 * w), flat values per point
const W = {
  tank: { pDef: 300, mDef: 150, CON: 4, STR: 1, DEX: 1, MEN: 1, rShld: 150, regHp: 60, healEffect: 80, pAtk: 80, pAtkSpd: 80, rEvas: 1, absorbDam: 2, runSpd: 0.3, critRate: 0.05, accCombat: 0.5 },
  melee: { pAtk: 400, pAtkSpd: 400, critRate: 0.25, critDmgAdd: 0.02, STR: 4, DEX: 3, CON: 1.5, accCombat: 2, rEvas: 1.5, pDef: 120, mDef: 60, absorbDam: 2, regHp: 40, runSpd: 0.4, physicalMpConsumeRate: -60 },
  dagger: { pAtk: 400, pAtkSpd: 350, critRate: 0.35, critDmgAdd: 0.03, STR: 3, DEX: 5, CON: 1, accCombat: 2, rEvas: 3, pDef: 100, mDef: 60, runSpd: 0.6, absorbDam: 2 },
  archer: { pAtk: 400, pAtkSpd: 350, critRate: 0.3, critDmgAdd: 0.02, STR: 3, DEX: 4, CON: 1, accCombat: 3, rEvas: 1.5, pDef: 100, mDef: 60, regMp: 2, runSpd: 0.5 },
  caster: { mAtk: 400, mAtkSpd: 250, INT: 12, WIT: 3, MEN: 1.5, regMp: 120, magicalMpConsumeRate: -300, cancel: -0.05, pDef: 100, mDef: 100, runSpd: 0.4, pAtk: 40 },
  healer: { mAtkSpd: 500, healEffect: 300, WIT: 4, MEN: 3, INT: 2, regMp: 200, magicalMpConsumeRate: -400, mAtk: 150, cancel: -0.08, pDef: 100, mDef: 100, CON: 1, runSpd: 0.4 },
};
const LABEL = { pAtk: 'P.Atk', pAtkSpd: 'atk speed', critRate: 'crit rate', critDmgAdd: 'crit damage', pDef: 'P.Def', mDef: 'M.Def', mAtk: 'M.Atk', mAtkSpd: 'cast speed',
  regMp: 'MP regen', regHp: 'HP regen', rShld: 'shield block', rEvas: 'evasion', accCombat: 'accuracy', healEffect: 'heal power', magicalMpConsumeRate: 'MP cost', runSpd: 'speed', absorbDam: 'damage absorb', cancel: 'cast cancel' };
const SA_PREF = {
  caster: ['Acumen', 'Empower', 'M. Atk.', 'Mana Up', 'Magic Power', 'Conversion', 'Magic Focus', 'Magic Hold'],
  healer: ['Acumen', 'Mana Up', 'Magic Regeneration', 'MP Regeneration', 'Empower', 'Conversion'],
  tank: ['Health', 'Focus', 'Haste', 'Guidance', 'Back Blow'],
  melee: ['Focus', 'Haste', 'Health', 'Critical Damage', 'Guidance', 'Anger', 'Rsk. Focus', 'Rsk. Haste'],
  dagger: ['Focus', 'Critical Damage', 'Evasion', 'Haste', 'Critical Bleed', 'Mortal Strike'],
  archer: ['Cheap Shot', 'Focus', 'Critical Bleed', 'Quick Recovery', 'Guidance', 'Miser'],
};
const TYPE_WORD = { ANCIENTSWORD: 'ancient sword', DUALDAGGER: 'dual daggers', DUAL: 'dual swords', DUALFIST: 'fist weapon', FIST: 'fist weapon', POLE: 'polearm', RAPIER: 'rapier', CROSSBOW: 'crossbow', BOW: 'bow', DAGGER: 'dagger', SWORD: 'sword', BLUNT: 'blunt' };
const nf = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const short = (n) => { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : nf(n); };
/** set bonus text -> score for a role + the 2 best-scoring parts as words */
function bonusScore(text, role) {
  const w = W[role] || {}, parts = [];
  let s = 0;
  String(text || '').split(/,\s*/).forEach(t => {
    const m = /^(\w+) ([x+-])?\s*(-?[\d.]+)/.exec(t.trim()); if (!m) return;
    const k = m[1], v = m[2] === 'x' ? (+m[3] - 1) : (m[2] === '-' ? -m[3] : +m[3]);
    if (!w[k] || !isFinite(v)) return;
    const p = v * w[k]; s += p;
    if (Math.abs(p) >= 1) parts.push({ p, t: (LABEL[k] || k) + ' ' + (m[2] === 'x' ? (v >= 0 ? '+' : '') + Math.round(v * 1000) / 10 + '%' : (v >= 0 ? '+' : '') + v) });
  });
  return { s, words: parts.sort((a, b) => b.p - a.p).filter(x => x.p > 0).slice(0, 3).map(x => x.t).join(', ') };
}
function weaponScore(r, role) {
  if (role === 'caster' || role === 'healer') return (r.ma || 0) + (r.pa || 0) * 0.01;
  return (r.pa || 0) * ((r.spd || 333) / 333) * (1 + (r.cr || 0) / 100);
}
function recommendFor(C, G, h, c, grade) {
  const K = C.arch[c.arch] || C.arch.fighter, role = ROLE_OF[c.arch] || (c.mystic ? 'caster' : 'melee');
  const gi = GRADES.indexOf(grade);
  const out = {};
  const fits = (it, slot) => { const f = h.fitOf(C, c, it, slot); return f.ok ? f : null; };
  const sold = (id, buy) => h.giranGet(C, G, id, buy || 'auto', K);
  const all = Object.entries(C.items).map(([id, it]) => [+id, it]).filter(([, it]) => !it.common || !it.tw);
  const ofGrade = (s) => all.filter(([, it]) => it.s === s && it.g === grade);
  const mk = (id, buy, why, alt) => {
    const it = C.items[id] || {};
    const A = (alt || []).filter((x, i, a) => x && x !== id && a.indexOf(x) === i).slice(0, 3);
    return { id, name: it.n || ('item ' + id), alt: A, altNames: A.map(x => (C.items[x] || {}).n || ''), buy: buy || 'auto', why, src: h.srcText(C, id) };
  };
  const where = (id, buy) => { const g = sold(id, buy); return g ? `sold in Giran ${short(g.price)}${g.how === 'common' ? ' as Common' : g.how === 'change' ? ' (sword + Change Weapon)' : ''}` : 'not sold in Giran: ' + String(h.srcText(C, id)).split(' · ')[0]; };

  // ---------------- weapon
  const wl = ofGrade('weapon').map(([id, it]) => { const f = fits(it, 'weapon'); return f && f.fit && !it.base ? { id, it, f } : null; }).filter(Boolean)
    .map(x => { const judge = x.f.viaChange && x.it.cw ? C.items[x.it.cw] : x.it; return Object.assign(x, { sc: weaponScore(judge, role), judge, wear: x.f.viaChange ? x.it.cw : x.id }); })
    .filter(x => x.sc > 0);
  // Kamael: the Kamael weapon is what they wear (the sword is bought + changed) -> one row per worn weapon, best score
  const byWear = {}; wl.forEach(x => { if (!byWear[x.wear] || x.sc > byWear[x.wear].sc) byWear[x.wear] = x; });
  let wlist = Object.values(byWear).sort((a, b) => b.sc - a.sc);
  if (!wlist.length) {   // nothing of the class line's own type at this grade (Kamael No-grade): the best weapon it can equip at all
    wlist = ofGrade('weapon').map(([id, it]) => { const f = fits(it, 'weapon'); return f && !it.base ? { id, it, f, judge: it, wear: id, sc: weaponScore(it, role) } : null; }).filter(x => x && x.sc > 0).sort((a, b) => b.sc - a.sc);
  }
  if (wlist.length) {
    const best = wlist[0], bestSold = wlist.find(x => sold(x.wear));
    const pick = bestSold || best;
    const pit = C.items[pick.wear];
    const prefs = SA_PREF[role] || [];
    const saOf = (baseId) => { const L = all.filter(([, it]) => it.base === baseId && it.sa); for (const p of prefs) { const f = L.find(([, it]) => it.sa === p); if (f) return f[0]; } return null; };
    const sa = saOf(pick.wear);
    const alt = [];
    if (bestSold && best !== bestSold) alt.push(best.wear);
    if (sa) alt.push(sa);
    const stat = role === 'caster' || role === 'healer' ? `M.Atk ${pit.ma}` : `P.Atk ${pit.pa}${pit.spd ? ' · speed ' + pit.spd : ''}${pit.cr ? ' · crit ' + pit.cr : ''}`;
    out.weapon = mk(pick.wear, 'auto', `Best ${role === 'caster' || role === 'healer' ? 'magic weapon' : (pit.two && !/DUAL/.test(pit.t) ? 'two-handed ' : '') + (TYPE_WORD[pit.t] || String(pit.t || '').toLowerCase())} this class can use${bestSold ? ' that Giran sells' : ''} (${stat}); ${where(pick.wear)}` +
      (bestSold && best !== bestSold ? `; better if you craft / drop it: ${C.items[best.wear].n}` : '') + (sa ? `; later with S.A. ${C.items[sa].sa} (soul crystal)` : ''), alt);
  }
  const twoHanded = out.weapon && C.items[out.weapon.id] && C.items[out.weapon.id].two;

  // ---------------- armor sets
  const bodyW = role === 'tank' ? 0.15 : 0.08;
  const setRows = [];
  (C.sets || []).forEach((S, ix) => {
    const chest = C.items[(S.pieces.chest || [])[0]]; if (!chest || chest.g !== grade) return;
    if (S.t && !K.a.includes(S.t)) return;
    const pieces = {}; let ok = true, base = 0, allSold = true, price = 0, real = 0;
    Object.entries(S.pieces).forEach(([slot, ids]) => {
      if (slot === 'shield') return;
      const id = ids.find(i => C.items[i] && fits(C.items[i], slot)); if (!id) { ok = false; return; }
      pieces[slot] = id; const it = C.items[id];
      base += (it.pd || 0) * bodyW + (it.md || 0) * 0.05 + ((role === 'caster' || role === 'healer') ? (it.mp || 0) * 0.02 : 0);
      const g = sold(id, 'auto'), gr = sold(id, 'real'); if (!g) allSold = false; else price += g.price; if (gr) real += gr.price; else real = Infinity;
    });
    if (!ok || !pieces.chest) return;
    const B = bonusScore(S.bonus, role);
    const shieldId = (S.pieces.shield || []).find(i => C.items[i] && fits(C.items[i], 'shield'));
    const caster = role === 'caster' || role === 'healer';
    // fighters: the Common twins (1/20 price, NO set bonus) unless the bonus is worth the real price (C and up, score >= 8)
    const realBuy = caster || (gi >= 2 && B.s >= 8 && real < Infinity);
    const sc = base + (realBuy || !allSold ? B.s : 0);
    setRows.push({ ix, S, pieces, base, B, sc, sold: allSold && (realBuy ? real < Infinity : true), price: realBuy ? real : price, realBuy, shieldId });
  });
  setRows.sort((a, b) => b.sc - a.sc);
  const bestSet = setRows[0], bestSoldSet = setRows.find(r => r.sold);
  const set = bestSoldSet || bestSet;
  const usedSlots = new Set();
  if (set) {
    const other = bestSoldSet && bestSet !== bestSoldSet ? bestSet : null;
    const why = `${set.S.name} set (${String(set.S.t || '').toLowerCase()}): ${set.B.words ? 'set bonus ' + set.B.words : 'no useful set bonus'}` +
      (set.sold ? `; sold in Giran ${short(set.price)} for the set${set.realBuy ? ' (real pieces, for the bonus)' : ' as Common'}` : `; not sold in Giran (${String(h.srcText(C, set.pieces.chest)).split(' · ')[0]})`) +
      (other ? `; better if you craft / drop it: ${other.S.name} (${other.B.words || 'more defence'})` : '');
    Object.entries(set.pieces).forEach(([slot, id]) => {
      usedSlots.add(slot);
      out[slot] = mk(id, set.realBuy ? 'real' : 'auto', why, other && other.pieces[slot] ? [other.pieces[slot]] : []);
    });
    if (C.items[set.pieces.chest] && C.items[set.pieces.chest].full) usedSlots.add('legs');
    if (set.shieldId && (K.sh) && !twoHanded && !(c.race === 'KAMAEL')) { out.shield = mk(set.shieldId, set.realBuy ? 'real' : 'auto', `${set.S.name} shield${set.S.shield ? ': with the set ' + set.S.shield : ''}; ${where(set.shieldId)}`, []); usedSlots.add('shield'); }
  }
  // ---------------- every other slot: best piece (sold first)
  const bestPiece = (slot, score, label, fitOnly) => {
    const L = ofGrade(slot).map(([id, it]) => { const f = fits(it, slot); return f && (!fitOnly || f.fit) && !it.base ? { id, it, sc: score(it) } : null; }).filter(x => x && x.sc > 0).sort((a, b) => b.sc - a.sc);
    if (!L.length) return null;
    const best = L[0], bs = L.find(x => sold(x.id));
    const p = bs || best;
    return mk(p.id, 'auto', `${label}${bs ? ' that Giran sells' : ''} (${statWords(p.it)}); ${where(p.id)}` + (bs && best !== bs ? `; better if you craft / drop it: ${best.it.n}` : ''), bs && best !== bs ? [best.id] : []);
  };
  const statWords = (it) => [it.pd ? 'P.Def ' + it.pd : '', it.md ? 'M.Def ' + it.md : '', it.sd ? 'shield ' + it.sd : '', it.mp ? 'MP +' + it.mp : ''].filter(Boolean).join(' · ');
  const casterR = role === 'caster' || role === 'healer';
  ['head', 'gloves', 'feet', 'chest', 'legs'].forEach(s => {
    if (usedSlots.has(s) || out[s]) return;
    if (s === 'legs' && out.chest && C.items[out.chest.id] && C.items[out.chest.id].full) return;
    const r = bestPiece(s, it => (it.pd || 0) + (casterR ? (it.mp || 0) * 0.2 : 0) + (it.md || 0) * 0.3, 'Best ' + s + ' (no full set fits this slot)', true);
    if (r) out[s] = r;
  });
  if (!out.shield && (K.sh) && !twoHanded && role === 'tank') { const r = bestPiece('shield', it => it.t === 'SIGIL' ? 0 : (it.sd || 0) + (it.pd || 0), 'Best shield', true); if (r) out.shield = r; }
  // jewellery: best M.Def; the epic boss jewels (Queen Ant, Core, Orfen, Zaken, Baium, Antharas, Valakas, Frintezza ...) are never the plan,
  // only an alternative ('better if you get it'): one boss kill each, not something to plan a whole team around
  const EPIC = /Queen Ant|\bCore\b|Orfen|Zaken|Baium|Antharas|Valakas|Frintezza|Beleth|Freya/i;
  ['neck', 'earring', 'ring'].forEach(s => {
    const r = bestPiece(s, it => EPIC.test(it.n) ? 0 : (it.md || 0) + (it.mp || 0) * 0.05, 'Best M.Def ' + (s === 'neck' ? 'necklace' : s + ' (both)'));
    if (!r) return;
    const ep = ofGrade(s).filter(([, it]) => EPIC.test(it.n) && fits(it, s)).sort((a, b) => (b[1].md || 0) - (a[1].md || 0))[0];
    if (ep && !r.alt.includes(ep[0])) { r.alt.push(ep[0]); r.altNames.push(ep[1].n); r.why += '; epic boss jewel: ' + ep[1].n; }
    out[s] = r;
  });
  if (gi >= 2) {   // belts from C, bracelets (talisman slots) from C; the bots never buy them
    const r = bestPiece('belt', it => /Belt\b/i.test(it.n) ? (it.pd || 0) + (it.md || 0) + (it.mp || 0) * 0.05 : 0, 'Best belt'); if (r) { r.why += ' · get it by hand'; out.belt = r; }
    const L = all.filter(([, it]) => it.s === 'bracelet' && GRADES.indexOf(it.g) <= gi && GRADES.indexOf(it.g) >= 2).sort((a, b) => GRADES.indexOf(b[1].g) - GRADES.indexOf(a[1].g) || (b[1].mp || 0) - (a[1].mp || 0));
    if (L.length) out.bracelet = mk(L[0][0], 'auto', `Best bracelet up to this grade (more talisman slots); ${where(L[0][0])} · get it by hand`, []);
  }
  return out;
}
function recommendAll(C, G, h) {
  const byKey = {}, classKey = {};
  C.classes.forEach(c => {
    const key = c.arch + '|' + c.race;
    classKey[c.id] = key;
    if (byKey[key]) return;
    byKey[key] = {};
    GRADES.forEach(g => { byKey[key][g] = recommendFor(C, G, h, c, g); });
  });
  return { byKey, classKey, at: new Date().toISOString() };
}
module.exports = { recommendAll, recommendFor, bonusScore, ROLE_OF };
