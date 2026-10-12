// BRAIN HOST — the state mirror of one character (2026-10-12, new engine phase 1; protocol in docs/plan/new_engine/DESIGN.md §2).
// Filled by Scripts/agent2.js 'st' messages: a full report (full: true) replaces everything it carries; a diff carries only what changed:
//   me:    { field: value }            changed Me fields (Name, objId, X, Y, Z, HP, ..., see agent2 ME_FIELDS)
//   cr:    { all?, set: [creature], upd: [[objId, { field: value }]], del: [objId] }   creatures (developer snapshot fields + crtType number)
//   party / inv / buffs / skills / drops / pets / buy: a full array when that section changed (string-compared in the agent)
//   skr:   { skillId: [1] | [0, ReuseDelayMs, ElapsedMs] } skill readiness changes (a cooldown: the brain counts Elapsed on from _cdAt)
//   TIMING (2026-10-12, audit #10/#13/#27/#28): skills are kept per Id (a level-up updates the SAME data object, so views and swarm.js's
//   skillNamed cache stay live); brain-private fields (_cdAt = cooldown start on the brain clock, _cdRe = that cooldown's length) survive
//   full reports; a full skills row of a skill on cooldown carries _el (its Elapsed) so the cooldown clock is rebuilt instead of lost.
//   entities.js derives IsReady = true once _cdRe has run out (no 0-500 ms wait for the next agent sample).
//   fl:    { IsConnected, IsInCombat, IsEnabled, IsAttacking, IsSitting, CurrentZone, IsPartyLeader, IsInParty, IsFollowModeOn, IsFollowMaster }
//   opt:   { OptionName: value } changed Options values the brain asked for (agent2 reports the keys it was told to watch)
//   tgt:   objId of my target (0 = none);  q: { questId: state } quests the brain asked about;  html: LastHTML when it changed
'use strict';

class Mirror {
  constructor(name) {
    this.name = name;
    this.me = { Name: name };
    this.cr = new Map();
    this._crArr = null; this._byKind = null;
    this.party = []; this.inv = []; this.buffs = []; this.skills = []; this.drops = []; this.pets = []; this.buy = []; this.petInv = [];
    this.fl = { IsConnected: false, IsInCombat: false, IsEnabled: false, IsAttacking: false, IsSitting: false, CurrentZone: 'GENERALZONE', IsPartyLeader: false,
      IsInParty: false, IsFollowModeOn: false, IsFollowMaster: false };
    this.opt = {};
    this.tgt = 0;
    this.agentCaps = [];              // the agent's hello caps (runner.attach); 'assume' = host.js HOOK_PRE may pre-update cast / target state
    this.q = {};
    this.html = '';
    this.at = 0; this.seq = 0; this.msgs = 0; this.bytes = 0; this.fulls = 0;
    this.invVer = 0; this.invAt = 0;  // BAG VERSION (engine audit #15): agent2's 'iv' (bumped when its bag content changed) + when an inv section last came (brain clock)
    this.listeners = [];
    this.now = () => Date.now();      // the runner sets the brain clock
  }
  get creatures() {
    if (!this._crArr) this._crArr = Array.from(this.cr.values());
    return this._crArr;
  }
  ofKind(k) {
    if (!this._byKind) { const b = { 0: [], 1: [], 2: [], 3: [] }; this.creatures.forEach(c => { const n = Number(c.crtType) || 0; (b[n] || (b[n] = [])).push(c); }); this._byKind = b; }
    return this._byKind[k] || [];
  }
  touchCr() { this._crArr = null; this._byKind = null; }
  apply(m, bytes) {
    this.msgs++; this.bytes += bytes || 0; this.at = Date.now();
    if (m.seq) this.seq = m.seq;
    if (m.full) this.fulls++;
    if (m.me) { if (m.full) { for (const k of Object.keys(this.me)) if (!(k in m.me)) delete this.me[k]; } Object.assign(this.me, m.me); }
    if (m.cr) {
      const c = m.cr;
      if (c.all) { const keep = new Set((c.set || []).map(x => Number(x.objId))); for (const id of Array.from(this.cr.keys())) if (!keep.has(id)) this.cr.delete(id); }
      (c.set || []).forEach(x => { const id = Number(x.objId); const old = this.cr.get(id); if (old) { for (const k of Object.keys(old)) if (!(k in x)) delete old[k]; Object.assign(old, x); } else this.cr.set(id, x); });
      (c.upd || []).forEach(([id, f]) => { const old = this.cr.get(Number(id)); if (old) Object.assign(old, f); });
      (c.del || []).forEach(id => this.cr.delete(Number(id)));
      this.touchCr();
    }
    for (const sec of ['party', 'inv', 'buffs', 'skills', 'drops', 'pets', 'buy', 'petInv']) if (Array.isArray(m[sec])) this[sec] = keepIdentity(this[sec], m[sec], sec === 'skills');
    if (Array.isArray(m.inv)) { this.invAt = this.now(); this.invVer = m.iv !== undefined ? Number(m.iv) || 0 : this.invVer + 1; }
    if (Array.isArray(m.skills)) this.skills.forEach(s => {                                  // cooldown clock across full reports (audit #13)
      if (s._el !== undefined) { const el = Number(s._el) || 0, re = Number(s.ReuseDelay) || 0; delete s._el; if (!s.IsReady) { s._cdAt = this.now() - el; s._cdRe = re > 0 && el < re ? re : 0; } }
      if (s.IsReady) { s._cdAt = 0; s._cdRe = 0; }
    });
    if (m.skr) { for (const id of Object.keys(m.skr)) { const s = this.skills.find(x => Number(x.Id) === Number(id)); if (s) { const [rdy, re, el] = m.skr[id]; s.IsReady = !!rdy; if (re !== undefined) s.ReuseDelay = re; const r = Number(s.ReuseDelay) || 0, e = Number(el) || 0; s._cdAt = rdy ? 0 : this.now() - e; s._cdRe = !rdy && r > 0 && e < r ? r : 0; } } }
    if (m.fl) Object.assign(this.fl, m.fl);
    if (m.opt) Object.assign(this.opt, m.opt);
    if (m.tgt !== undefined) this.tgt = Number(m.tgt) || 0;
    if (m.q) Object.assign(this.q, m.q);
    if (typeof m.html === 'string') this.html = m.html;
    this.listeners.forEach(f => { try { f(m); } catch (e) { } });
  }
  /** the mirror as the brain sees it (for brain_state / debugging) */
  summary() {
    return { name: this.name, x: this.me.X, y: this.me.Y, z: this.me.Z, hp: this.me.HpPercent, mp: this.me.MpPercent, lv: this.me.Level, dead: !!this.me.IsDead,
      creatures: this.cr.size, party: this.party.length, inv: this.inv.length, buffs: this.buffs.length, skills: this.skills.length, msgs: this.msgs, kb: Math.round(this.bytes / 1024), connected: !!this.fl.IsConnected };
  }
}
// replace an array section but keep the old data objects (same objId/Id) so views handed out earlier stay live
// byId (skills): one skill = one object whatever its level (a level-up must not orphan the views swarm.js cached, audit #28)
// fields starting with '_' are the brain's own (cooldown clock): never deleted by a new row (audit #13)
function keepIdentity(oldArr, newArr, byId) {
  if (!oldArr.length) return newArr;
  const key = (x) => x && (x.objId !== undefined ? 'o' + x.objId : x.Id !== undefined ? 'i' + x.Id + (byId ? '' : ':' + (x.Level || '')) : null);
  const byKey = new Map(); oldArr.forEach(x => { const k = key(x); if (k) byKey.set(k, x); });
  return newArr.map(x => { const k = key(x), o = k && byKey.get(k); if (!o) return x; byKey.delete(k); for (const f of Object.keys(o)) if (!(f in x) && f[0] !== '_') delete o[f]; return Object.assign(o, x); });
}

module.exports = { Mirror };
