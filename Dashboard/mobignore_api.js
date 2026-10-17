// MOB IGNORE (owner 2026-10-17: "Treasure Chest should not be attacked. They have infinite health on most servers"; Discord: a public party
// leader's L2Swarm combat hit a Treasure Chest in ToI 3, AoE aggro, stuck in combat, wipe). swarm.js already never picks a chest itself
// (CONFIG.lead.ignoreMobs) but L2Swarm's OWN combat / follow-assist / defence still did. L2Swarm 3.8.6+ has per-account mob rules
// (MCP manage_mob_settings, by NAME = every template id of that name): every 2 min each open account that lacks a rule gets it
// (ToAttack=false, ToSpoil=false) and its config is saved (persists). The names: Scripts/data/mob_ignore.json { names: [...] }
// (missing file = ["Treasure Chest"]). Log: Logs/mob_ignore.log.
const fs = require('fs'), path = require('path');
const DONE = {};                                   // account id -> stamp of the names it was checked with
let busy = false;
function names(ctx) {
  try { const j = JSON.parse(fs.readFileSync(path.join(ctx.DATA, 'mob_ignore.json'), 'utf8')); if (Array.isArray(j.names)) return j.names.map(String).filter(Boolean); } catch (e) { }
  return ['Treasure Chest'];
}
function log(ctx, m) { try { fs.appendFileSync(path.join(ctx.LOGS, 'mob_ignore.log'), new Date().toISOString() + ' ' + m + '\n'); } catch (e) { } }
async function tick(ctx) {
  if (busy) return; busy = true;
  try {
    const want = names(ctx); if (!want.length) return;
    const sig = want.join('|').toLowerCase();
    let all; try { all = JSON.parse(await ctx.mcpCall('get_accounts_status', {})); } catch (e) { return; }
    const list = Array.isArray(all) ? all : (all.accounts || []);
    for (const a of list) {
      const id = a.account_id || a.id; if (!id || !a.config_path || DONE[id] === sig) continue;
      if (a.is_logged_in === false && !a.character_name) continue;
      let rules = []; try { rules = JSON.parse(await ctx.mcpCall('manage_mob_settings', { account_id: id, action: 'list' })); } catch (e) { continue; }
      const blocked = (n) => (rules || []).some(r => String(r.Name || '').toLowerCase() === n.toLowerCase() && r.ToAttack === false);
      const missing = want.filter(n => !blocked(n));
      let changed = 0;
      for (const n of missing) {
        try { await ctx.mcpCall('manage_mob_settings', { account_id: id, action: 'set', mob_name: n, to_attack: false, to_spoil: false }); changed++; }
        catch (e) { log(ctx, `${a.character_name || id}: could not block ${n}: ${e.message}`); }
      }
      if (changed) {
        try { await ctx.mcpCall('manage_account_config', { account_id: id, action: 'save' }); log(ctx, `${a.character_name || id}: never attack ${missing.join(', ')} — set + saved`); }
        catch (e) { log(ctx, `${a.character_name || id}: set, but the save failed: ${e.message}`); }
      }
      DONE[id] = sig;
    }
  } finally { busy = false; }
}
module.exports = { tick, names };
