// BANKCWH-2026-11-03 (owner: "Why is crafter1 not enchanting?" + "Stop routed through Dagger1 !!! Told you earlier, crafter1 can withdraw
// and deposit in clan warehouse himself"): every clan warehouse job goes to the bank (crafter.json bank, cwhWithdraw on), never the runner
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '../../..');
const SRC = fs.readFileSync(path.join(R, 'Scripts_dev/swarm.js'), 'utf8'), API = fs.readFileSync(path.join(R, 'Dashboard/itemspage_api.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const fn = (name) => { const i = SRC.indexOf('function ' + name + '('); return new Function(SRC.slice(i, SRC.indexOf('\n', i)) + '\nreturn ' + name + ';')(); };
const pick = fn('cwhActorPick'), retry = fn('cwhRetryGiran');
const wi = SRC.indexOf('function cwhWhoDecide('), we = SRC.indexOf('\n}', wi);
const who = new Function(SRC.slice(wi, we + 2) + '\nreturn cwhWhoDecide;')();
t('the actor is the bank while cwhWithdraw is on', pick('Crafter1', 'Crafter1', true, 'Dagger1') === 'Crafter1' && pick('', 'Crafter1', undefined, 'Dagger1') === 'Crafter1');
t('the clan leader only without a bank / with cwhWithdraw off', pick('', '', true, 'Dagger1') === 'Dagger1' && pick('Crafter1', 'Crafter1', false, 'Dagger1') === 'Dagger1');
t('replay ij_crafter1_mw0p7f30: the bank takes the 114 EAC itself (never asks Dagger1)', who('Crafter1', 'Crafter1', 'Crafter1', false, false) === 'self');
t('a member asks the actor; the runner as the only actor away from Giran = wait, never pulled off a trip', who('Bishop1', 'Crafter1', 'Crafter1', false, false) === 'ask' && who('Bishop1', 'Dagger1', 'Dagger1', true, false) === 'wait' && who('Bishop1', 'Dagger1', 'Dagger1', true, true) === 'ask');
t('"Walderal did not answer" away from Giran = once more at the Giran keeper', retry('warehouse (clan): took nothing at Walderal (Walderal did not answer)', false) && !retry('Walderal did not answer', true) && !retry('took 114', false));
t('whTake knows opts.giran (Taurin, never the local keeper)', SRC.includes("if (town && town !== 'Giran' && !opts.giran && !bankMe()) npc = whKeeper();"));   // BANKSTAY: + the bank always uses Giran's keeper
// every clan warehouse path is decided by cwhActorName(), not clanLeaderName()
t('the whtake ask is answered by the actor', SRC.includes("if (!state.role || Me.Name !== cwhActorName()) return;"));
t('the runner keeps an ask until it is idle in Giran', SRC.includes("crunRunnerMode(Me.Name, S.runner, S.runnerOn) && !(currentTownKey() === 'Giran' && !crunOnTrip())"));
t('item / enchant jobs: self / ask / wait via cwhWhoDecide', SRC.includes("who = cwhWhoDecide(Me.Name, act, cwhWorkerName()") && SRC.includes("asking ${cwhActorName()} for ${want}"));
t('craftmake: the bank / crafter takes its own materials', SRC.includes("if (Me.Name === cwhActorName() || Me.Name === cwhWorkerName()) { const r2 = await whTake('clan', still, 'craftmake'"));
t('!whtake / !whsell / clan warehouse look go to the actor', SRC.includes("iAmCL = Me.Name === cwhActorName();") && SRC.includes("if (Me.Name !== cwhActorName()) return;   // CRAFTRUN A + BANKCWH") && SRC.includes("Me.Name !== cwhActorName() || !clanAutoFlag('warehouseLook', true)") && SRC.includes("if (cmd === '!clanwh') { if (Me.Name === cwhActorName())"));
t('no clan warehouse take is guarded by the clan leader any more', !/Me\.Name === clanLeaderName\(\)\) \{[^\n]{0,80}whTake\('clan'/.test(SRC) && !SRC.includes("if (!state.role || Me.Name !== clanLeaderName()) return;"));
t('the dashboard job planner names the bank ("(Crafter1 hands them over)" only when someone else does it)', API.includes('CL = cwhActor(ctx);') && API.includes('function cwhActorPick(bank, crafter, withdraw, clanLeaderName)'));
// CWHTEXT-2026-11-04: the Upgrade / item plan TEXT named "the clan leader Dagger1 takes ... out" while the job used the bank - the text must name the bank
t('the plan text names the bank as the clan warehouse actor, never "the clan leader Dagger1" (CWHTEXT)', API.includes('const ACT = cwhActor(ctx) || C.clanLeader') && !API.includes('`the clan leader ${C.clanLeader || \'?\'} takes'));
console.log(`bank clan warehouse: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
