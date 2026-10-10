// Writes docs/plan/kamael_weapons.md: every weapon the Kamael skill "Change Weapon" (1473) can transform, by grade.
const __ROOT = require('path').resolve(__dirname, '..', '..', '..').replace(/\\/g, '/');   // install folder (portable, 2026-10-07)
// Source: the datapack item field change_weaponId (Scripts/data/dp/gear_db.json). Run: node kamael_weapons.js
const fs = require('fs');
const db = JSON.parse(fs.readFileSync(__ROOT + '/Scripts/data/dp/gear_db.json', 'utf8').replace(/^\uFEFF/, ''));
const shop = JSON.parse(fs.readFileSync(__ROOT + '/Scripts/data/shopscan_giran.json', 'utf8'));
const sold = {};
shop.shops.forEach(s => (s.lists || []).forEach(l => (l.items || []).forEach(i => { (sold[i.id] = sold[i.id] || []).push(`${s.npc} ${Number(i.price).toLocaleString('en-US')}`); })));
const it = db.items, pa = (i) => +((i.stats || {}).pAtk || 0), ma = (i) => +((i.stats || {}).mAtk || 0);
const rows = Object.values(it).filter(i => i.change_weaponId && ['SWORD', 'BOW'].includes(i.weapon_type) && !/Fortune|\{PvP\}|Event/.test(i.name)).map(i => {
  const t = it[i.change_weaponId] || {};
  return { g: (i.crystal_type || 'none').toUpperCase(), from: i.name, two: i.bodypart === 'lrhand', fpa: pa(i), to: t.name, ttype: t.weapon_type, tpa: pa(t), tma: ma(t), sold: sold[i.id] || [] };
});
const G = ['NONE', 'D', 'C', 'B', 'A', 'S', 'S80', 'S84'];
let md = `# Kamael weapons via "Change Weapon" (skill 1473)\n\nGenerated ${new Date().toISOString().slice(0, 16)} by \`docs/plan/tools/kamael_weapons.js\` from the datapack (\`change_weaponId\`).\n\n` +
  `**How it works:** a Kamael equips the normal weapon and casts Change Weapon (1473, both Doombringer1 and Inspector1 have it). The server swaps it for the Kamael weapon of the same grade (enchant level and S.A. are kept). Casting it again turns it back.\n\n` +
  `- **One-handed sword -> Rapier** (Soul Breaker / Soul Hound / Inspector: Inspector1)\n- **Two-handed sword -> Ancient Sword** (Berserker / Doombringer: Doombringer1)\n- **Bow -> Crossbow** (Arbalester / Trickster)\n- Common Items have their own Common twins. "Sold in Giran" = the shop scan of 2026-10-06 (Graham).\n\nThe bots buy the cheapest sold source weapon whose Kamael twin is the best for them, equip it and cast Change Weapon (swarm.js \`planUpgrades\` / \`equipBought\`).\n`;
for (const g of G) {
  const r = rows.filter(x => x.g === g); if (!r.length) continue;
  md += `\n## ${g === 'NONE' ? 'No-grade' : g + '-grade'}\n\n| Buy this | hands | P.Atk | -> becomes | type | P.Atk | M.Atk | sold in Giran |\n|---|---|---|---|---|---|---|---|\n`;
  r.sort((a, b) => (a.ttype || '').localeCompare(b.ttype || '') || b.tpa - a.tpa).forEach(x => { md += `| ${x.from} | ${x.two ? '2h' : '1h'} | ${x.fpa} | **${x.to}** | ${(x.ttype || '').toLowerCase()} | ${x.tpa} | ${x.tma} | ${x.sold.join(', ')} |\n`; });
}
fs.writeFileSync(__ROOT + '/docs/plan/kamael_weapons.md', md);
console.log('rows', rows.length, 'sold', rows.filter(r => r.sold.length).length);
