// test_partymove_live.js - requirement team.md (PARTYMOVE2-2026-11-10, tester Vykaax #21: "Moving a bot into a 'new' party did not remove
// them from their current group ... they remained in their current party in-game ... the leader of the original party is still looking for
// the party member and failing to move anywhere as it keeps trying to regroup").
//   A  swarm.js PARTYMOVE2-PURE pmoveDecide: who leaves / who is ousted for every kind of move (own new party, existing party, leader + rest)
//   B  swarm.js pmoveLists on a fake L2Swarm Options: the moved name leaves the old team's NamesRegroupList / NamesFollowList and is unticked
//      in NamesSendPartyList / NamesAcceptPartyList; the moved character drops its old team and its NamePl
//   C  the wiring: a move is retried for 10 min (pmoveTick every 20 s), the old leader's teammates come from swarm.config.json (TEAMCFG)
//   node docs/plan/tools/test_partymove_live.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Scripts_dev', 'swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c, x) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m + (x ? ' -- ' + x : '')); } };
const blk = (b, e) => { const i = src.indexOf(b), j = src.indexOf(e, i + 1); if (i < 0 || j < i) { console.error(b + ' block not found'); process.exit(1); } return src.slice(i, j); };

// ------------------------------------------------------------------------------------------------ A pmoveDecide
const { pmoveDecide } = new Function(blk('// PARTYMOVE2-PURE-BEGIN', '// PARTYMOVE2-PURE-END') + '\nreturn { pmoveDecide };')();
// config after the move: Lead leads Mem1; Mem2 moved to its own new party; Other leads its party
const TEAMS = { Lead: 'Lead', Mem1: 'Lead', Mem2: 'Mem2', Other: 'Other', OthMem: 'Other' };
const teamOf = (n) => TEAMS[n] || n;
{
  const m = { n: 'Mem2', was: 'Lead', party: 'Mem2' };
  // the bug: PartyList lists me too - the old check "is my new leader (= me) in my party" was always yes -> never left
  t('A1 own NEW party, still in the old party (PartyList lists me too): I leave', pmoveDecide('Mem2', m, ['Mem2', 'Lead', 'Mem1'], false, teamOf).withdraw === true);
  t('A2 own new party, already alone: nothing', !pmoveDecide('Mem2', m, ['Mem2'], false, teamOf).withdraw && !pmoveDecide('Mem2', m, [], false, teamOf).oust);
  const d3 = pmoveDecide('Mem2', m, ['Lead', 'Mem1'], true, teamOf);
  t('A3 own new party but the game made ME the in-game leader of the old group: the old team is taken out', !d3.withdraw && d3.oust && d3.oust.join() === 'Lead,Mem1', JSON.stringify(d3));
  t('A4 the OLD leader ousts the moved member while it is still in his party', JSON.stringify(pmoveDecide('Lead', m, ['Lead', 'Mem1', 'Mem2'], true, teamOf).oust) === '["Mem2"]');
  t('A5 a member of the old party (not leading) ousts nobody', !pmoveDecide('Mem1', m, ['Lead', 'Mem2'], false, teamOf).oust);
  t('A6 the old leader, the moved one gone: nothing more', JSON.stringify(pmoveDecide('Lead', m, ['Mem1'], true, teamOf)) === '{}');
}
{
  const m = { n: 'Mem1', was: 'Lead', party: 'Other' };
  const T2 = Object.assign({}, TEAMS, { Mem1: 'Other' }), to2 = (n) => T2[n] || n;
  t('B1 moved into an EXISTING party, still in the old one: I leave', pmoveDecide('Mem1', m, ['Lead', 'Mem2'], false, to2).withdraw === true);
  t('B2 moved, now in the new leader\'s party: nothing', JSON.stringify(pmoveDecide('Mem1', m, ['Other', 'OthMem'], false, to2)) === '{}');
  t('B3 the old leader sees it moved: oust', JSON.stringify(pmoveDecide('Lead', m, ['Mem1'], true, to2).oust) === '["Mem1"]');
  t('B4 the NEW leader never ousts the one that joins him', JSON.stringify(pmoveDecide('Other', m, ['Mem1', 'OthMem'], true, to2)) === '{}');
}
{
  // a leader moves away, the rest stay together under the member he picked (NL)
  const T3 = { L: 'Other', NL: 'NL', R: 'NL', Other: 'Other' }, to3 = (n) => T3[n] || n;
  const mR = { n: 'R', was: 'L', party: 'NL' }, mNL = { n: 'NL', was: 'L', party: 'NL' }, mL = { n: 'L', was: 'L', party: 'Other' };
  t('C1 the old leader moving elsewhere leaves his own in-game party', pmoveDecide('L', mL, ['NL', 'R'], true, to3).withdraw === true);
  t('C2 the rest leave while the old leader is still in the party', pmoveDecide('R', mR, ['L', 'NL'], false, to3).withdraw === true);
  t('C3 the rest stay once only their new leader is with them', JSON.stringify(pmoveDecide('R', mR, ['NL'], false, to3)) === '{}');
  t('C4 the new leader, given the in-game lead, keeps his own members', JSON.stringify(pmoveDecide('NL', mNL, ['R'], true, to3)) === '{}');
}
t('D  no move / nobody else in the party = nothing', JSON.stringify(pmoveDecide('X', null, ['Y'], true, teamOf)) === '{}' && JSON.stringify(pmoveDecide('X', { n: 'Y', was: 'X', party: 'Z' }, [], true, teamOf)) === '{}');

// ------------------------------------------------------------------------------------------------ B pmoveLists (fake L2Swarm Options)
{
  const i = src.indexOf('function pmoveLists(m)'), j = src.indexOf('\nsetInterval(() => { try { academyRosterSync', i);
  t('pmoveLists is in swarm.js (before the roster sync timer)', i > 0 && j > i);
  const body = src.slice(i, j);
  const mk = (names, sel) => { const a = names.map(n => ({ Name: n, IsSelected: sel })); a.Count = a.length; return a; };
  const strs = (names) => { const a = names.slice(); a.Count = a.length; a.Remove = (x) => { const k = a.indexOf(x); if (k < 0) return false; a.splice(k, 1); a.Count = a.length; return true; }; return a; };
  const run = (me, m, teams) => {
    const Options = { NamesSendPartyList: mk(['Lead', 'Mem1', 'Mem2'], true), NamesAcceptPartyList: mk(['Lead', 'Mem1', 'Mem2'], true),
      NamesRegroupList: strs(['Lead', 'Mem1', 'Mem2', 'Mem2']), NamesFollowList: strs(['Lead', 'Mem2']), NamePl: 'Lead' };
    const CONFIG = { roster: { Lead: 'tank', Mem1: 'dd', Mem2: 'healer', Other: 'tank' } }, notes = [];
    const f = new Function('Options', 'CONFIG', 'Me', 'teamOf', 'num', 'note', 'logError', body + '\nreturn pmoveLists;')(Options, CONFIG, { Name: me }, (n) => teams[n] || n, Number, (x) => notes.push(x), () => { });
    f(m); return { Options, notes };
  };
  const m = { n: 'Mem2', was: 'Lead', party: 'Mem2' };
  const L = run('Lead', m, TEAMS).Options;
  t('B5 the old leader: L2Swarm Regroup / Follow lists no longer name the moved one (also a duplicate entry)', !L.NamesRegroupList.includes('Mem2') && L.NamesRegroupList.includes('Mem1') && !L.NamesFollowList.includes('Mem2'), JSON.stringify(L.NamesRegroupList));
  t('B6 the old leader: auto-invite (NamesSendPartyList) unticked for the moved one only', L.NamesSendPartyList.find(x => x.Name === 'Mem2').IsSelected === false && L.NamesSendPartyList.find(x => x.Name === 'Mem1').IsSelected === true);
  const M = run('Mem2', m, TEAMS).Options;
  t('B7 the moved one: no auto-accept from its old leader / team, no regroup on them, NamePl cleared (it leads)', M.NamesAcceptPartyList.find(x => x.Name === 'Lead').IsSelected === false && !M.NamesRegroupList.includes('Lead') && !M.NamesRegroupList.includes('Mem1') && M.NamePl === '');
  const O = run('Other', m, TEAMS).Options;
  t('B8 a window of another party changes nothing', O.NamesRegroupList.length === 4 && O.NamesSendPartyList.every(x => x.IsSelected));
  // the new engine's mirror: NameCheck rows carry Name only (agent2 optValue), string lists have no Remove
  {
    const rows = ['Lead', 'Mem1', 'Mem2'].map(n => ({ Name: n })); rows.Count = 3; const plain = ['Lead', 'Mem2']; plain.Count = 2;
    const Options = { NamesSendPartyList: rows, NamesAcceptPartyList: undefined, NamesRegroupList: plain, NamesFollowList: undefined, NamePl: 'Lead' };
    const f = new Function('Options', 'CONFIG', 'Me', 'teamOf', 'num', 'note', 'logError', body + '\nreturn pmoveLists;')(Options, { roster: { Lead: 1, Mem1: 1, Mem2: 1 } }, { Name: 'Lead' }, (n) => TEAMS[n] || n, (x) => Number(x) || 0, () => { }, () => { });
    let threw = false, n1 = 0; try { n1 = f(Object.assign({}, m)); } catch (e) { threw = true; }
    t('B9 new engine: a row without IsSelected is unticked (field write), lists without Remove / not yet mirrored do not throw', !threw && rows[2].IsSelected === false && rows[0].IsSelected === undefined && n1 === 1);
  }
}

// ------------------------------------------------------------------------------------------------ C wiring
t('C5 every move goes into PMOVE for 10 min and is re-checked every 20 s', /PMOVE\.list = PMOVE\.list\.filter\(x => x\.n !== m\.n\)\.concat\(\[\{ n: m\.n, was: m\.was, party: m\.party, until: now\(\) \+ 600000 \}\]\)/.test(src) && /setInterval\(\(\) => \{ try \{ pmoveTick\(\); \} catch \(e\) \{ \} \}, 20000\)/.test(src));
t('C6 pmoveTick leaves (RequestWithDrawalParty) / ousts (RequestOustPartyMember) by pmoveDecide, others = PartyList without me', /function pmoveTick\(\)[\s\S]{0,900}x !== Me\.Name[\s\S]{0,400}pmoveDecide\(Me\.Name, m, others, iLead, teamOf\)[\s\S]{0,300}RequestWithDrawalParty[\s\S]{0,400}RequestOustPartyMember/.test(src));
t('C7 the old buggy own-name check is gone', !/!inP\(m\.party\) && !\(iLead && m\.party === Me\.Name\)/.test(src));
t('C8 teammates / waits come from swarm.config.json (TEAMCFG teamNames filter, roster sync updates CONFIG.teams)', /TEAMCFG-2026-11-01[\s\S]{0,600}teamOf\(p\.Name\) === teamOf\(Me\.Name\)/.test(src) && /if \(party !== was\) \{ if \(party !== main\) CONFIG\.teams\[n\] = party; else delete CONFIG\.teams\[n\]; moved\.push/.test(src));
const API = fs.readFileSync(path.join(ROOT, 'Dashboard', 'partymove_api.js'), 'utf8');
t('C9 the dashboard move still writes swarm.config.json party (what the bots read)', /a\.party = key/.test(API));
console.log(`partymove live: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
