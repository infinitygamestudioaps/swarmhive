// TIGHTBALL-2026-11-03: a party of 3+ casters without tank / healer (the academy groups) fights as ONE ball on ONE target.
// Replay: academy group 1 (Nyxara05 + 4 Dark Wizards) lost 3 of 5 in Cruma Marshlands 2026-11-03 11:01-11:03; at the deaths the members stood
// 1165-2401 from their leader; 10:01:42Z Xilael90 at 29160,107816 "helping" against a monster at 29368,107752 while the leader fought ~2.8k away.
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '../../../Scripts_dev/swarm.js'), 'utf8');
let ok = 0, bad = 0; const t = (m, c) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const a = SRC.indexOf('// TIGHTBALL-PURE-BEGIN'), b = SRC.indexOf('// TIGHTBALL-PURE-END');
t('the pure block exists', a > 0 && b > a);
const P = new Function('num', SRC.slice(a, b) + '\nreturn { TIGHT, tightWant, tightHelpOk, tightRetreat, BALL, tightBallFormed, tightStick, ballMove, ballBackGoal, ballMatesCentre };')(v => Number(v) || 0);

// who is a ball
t('5 nukers (an academy group) = a tight ball', P.tightWant(['nuker', 'nuker', 'nuker', 'nuker', 'nuker']));
t('a party with a healer or a tank is not', !P.tightWant(['nuker', 'nuker', 'bishop', 'nuker']) && !P.tightWant(['tank', 'nuker', 'nuker']) && !P.tightWant(['sk', 'destroyer', 'nuker']));
t('a duo is not (small teams keep their own rules)', !P.tightWant(['nuker', 'nuker']));

// help only near the group (replay)
const leader = { x: 29202, y: 110600 }, farMob = { x: 29368, y: 107752 }, nearMob = { x: 29500, y: 110900 };
t('replay: the monster 2.8k from the leader is NOT helped against (the member goes back to the ball)', !P.tightHelpOk(farMob, leader));
t('a monster within 600 of the group is helped against', P.tightHelpOk(nearMob, leader));

// the leader-led retreat
const n0 = 1e7;
t('2 members below 40 % = the whole group pulls back', P.tightRetreat({ hps: [80, 35, 30, 90, 70], attackers: 1, lastAt: 0, nowMs: n0 }).go);
t('3+ monsters on the group and someone below 60 % = pull back', P.tightRetreat({ hps: [80, 55, 90, 90, 70], attackers: 3, lastAt: 0, nowMs: n0 }).go);
t('one low member alone is no retreat (heal pots / focus fire)', !P.tightRetreat({ hps: [80, 35, 90, 90, 70], attackers: 1, lastAt: 0, nowMs: n0 }).go);
t('no retreat twice within 30 s', !P.tightRetreat({ hps: [30, 30, 30], attackers: 5, lastAt: n0 - 10000, nowMs: n0 }).go);
t('dead members (0 %) do not count as low', !P.tightRetreat({ hps: [80, 0, 0, 90, 70], attackers: 0, lastAt: 0, nowMs: n0 }).go);

// wiring (source checks)
t('back to the middle: a ball member keeps within TIGHT.follow (350) of its leader, after 4 s', SRC.includes('if (d < (tight ? TIGHT.follow : smallTeam() ? 800 : 1500) || d > 12000)') && SRC.includes('now() - stuckFollow.since < (tight ? TIGHT.followWaitMs : smallTeam() ? 6000 : 15000)'));
t('a ball member fighting > 1350 from its leader is pulled back even in combat', SRC.includes('((IsInCombat || Me.IsInCombat) && !tightFar)') && SRC.includes('Math.hypot(lp.X - Me.X, lp.Y - Me.Y) > TIGHT.zone * 1.5'));
t('help: the ball only helps within TIGHT.helpDist of the victim and against monsters within 600 of the leader', SRC.includes('> (tightH ? TIGHT.helpDist : CONFIG.hive.helpDist)) return;') && SRC.includes('!tightHelpOk({ x: mob.X, y: mob.Y }, { x: lp.X, y: lp.Y })) return;'));
// NOROOMRADIUS-2026-11-03 (owner: "Why are you creating new hunting areas based on radius?"): no own radius - the room / area polygon decides
t('the leader pulls one at a time inside the chosen room / area (no own radius; fallback: the smallest pull)', !SRC.includes('if (d > TIGHT.zone) return;') && SRC.includes('NOROOMRADIUS-2026-11-03') &&SRC.includes('pullOthers: TIGHT.pullOthers') && SRC.includes('tFall.sort((x, y) => x.n - y.n || x.d - y.d);'));
t('the leader runs the group retreat (swarm.disengage + together.follow, wall-aware flee spot)', /tightRetreat\(\{ hps, attackers: atk, lastAt: TIGHTST\.retreatAt, nowMs: now\(\) \}\)[\s\S]{0,900}App\.emit\('swarm\.disengage'/.test(SRC));
t('auto field areas: the ball skips big aggressive packs / crowds (TIGHT.area)', SRC.includes("Object.assign({}, SOLOSAFE, TIGHT.area)") && P.TIGHT.area.maxPack === 3);
t('raids untouched: tightGroup() is off in a raid', SRC.includes('TIGHTST.on = !inRaid() && tightWant('));
t("FOCUSFIRE: in a caster group every member hits the leader target while he has one", SRC.includes("if (leader && attacker && typeof tightGroup === 'function' && tightGroup()) attacker = null;"));
// BALLSTICK-2026-11-03 replay: academy group 4 in the Cruma 1st floor Excuro room, 10:46:08-16Z: the leader Kaelra702 flipped Excuro <-> Catherok
// every ~4 s while Kaeloth894 / Myreth21 / Zarith0669 / Zarara58 still walked into the room 260 / 233 / 486 / 668 away -> 2 deaths
{
  const me = { x: 21288, y: 117304 }, walkIn = [{ name: 'Kaeloth894', x: 21288 + 260, y: 117304, age: 1000 }, { name: 'Myreth21', x: 21288, y: 117304 + 233, age: 1000 },
    { name: 'Zarith0669', x: 21288 - 486, y: 117304, age: 1000 }, { name: 'Zarara58', x: 21288, y: 117304 - 668, age: 1000 }];
  const f = P.tightBallFormed(me, walkIn);
  t('BALLSTICK replay: members still walking in (486 / 668 away) = no new pull, the leader waits for them', !f.ok && f.far.includes('Zarith0669') && f.far.includes('Zarara58') && !f.far.includes('Myreth21'));
  t('BALLSTICK: everyone within 400 = the ball is formed', P.tightBallFormed(me, walkIn.map(m => Object.assign({}, m, { x: me.x + 150, y: me.y }))).ok);
  t('BALLSTICK: a dead or long-unseen member never blocks the pull', P.tightBallFormed(me, [{ name: 'A', x: 0, y: 0, dead: true, age: 0 }, { name: 'B', x: 0, y: 0, age: 60000 }]).ok);
  const hits = [{ id: 'excuro', hp: 87, d: 40 }, { id: 'catherok', hp: 100, d: 36 }];
  t('BALLSTICK replay: on Excuro and Catherok hits us = keep Excuro (no flip to Catherok)', P.tightStick({ id: 'excuro' }, hits).keep === true);
  t('BALLSTICK: no current target + two on us = the lowest HP first', P.tightStick(null, hits).id === 'excuro' && P.tightStick(null, [{ id: 'a', hp: 90, d: 10 }, { id: 'b', hp: 30, d: 300 }]).id === 'b');
  t('BALLSTICK: nothing on us and no target = the normal pick', P.tightStick(null, []) === null);
  t('BALLSTICK host: the leader uses tightStick instead of ATTACKFIRST and gates a NEW pull on tightBallFormed (max BALLST.waitMax)',
    SRC.includes('const tLead = !sfMode && !solo && isLeader() && tightGroup();') && SRC.includes('if (!sfMode && !tLead) { const af = attackFirstNow(lastTarget);')
    && SRC.includes('const mates = tightMates(), bf = tightBallFormed({ x: Me.X, y: Me.Y }, mates);') && SRC.includes('waitMax: BALLST.waitMax, inRoom: ballInRoom(Me.X, Me.Y, 100)')
    && SRC.indexOf('bf = tightBallFormed(') < SRC.indexOf('const t = huntTarget(center.x, center.y, radius);'));
}
// BALLROOM-2026-11-03: replay of academy group 1, Cruma 1st floor Catherok room (left-a), 11:05-11:08Z
{
  // the leader stood outside his room (13976,116856 after chasing a Porta from the neighbour room) -> back into the room first
  t('BALLROOM: a leader outside his room walks back into it (members follow)', P.ballMove({ formed: false, waitedMs: 5000, waitMax: 60000, inRoom: false, hits: 0 }) === 'room');
  t('BALLROOM: inside the room, members walking in = wait (up to 60 s)', P.ballMove({ formed: false, waitedMs: 20000, waitMax: 60000, inRoom: true, hits: 0 }) === 'wait');
  t('BALLROOM: the wait never deadlocks - after 60 s the leader walks to the members', P.ballMove({ formed: false, waitedMs: 61000, waitMax: 60000, inRoom: true, hits: 0 }) === 'mates');
  t('BALLROOM: ball formed inside the room = hunt; something hitting us = fight first', P.ballMove({ formed: true, waitedMs: 0, inRoom: true, hits: 0 }) === 'hunt' && P.ballMove({ formed: false, inRoom: false, hits: 2 }) === 'fight');
  // the pull back sent Velyn8584 / Dravon7827 / Myron860 to the flee point 16376,117064 while the leader fought at 13976,116856
  const g = P.ballBackGoal(true, { x: 13976, y: 116856, z: -12096, age: 2000 }, { x: 16376, y: 117064, z: -12160 });
  t('BALLROOM: a ball member pulls back to the LEADER, not to a flee point of its own', g.to === 'leader' && g.x === 13976 && g.y === 116856);
  t('BALLROOM: no fresh leader position (or not a ball) = the flee point as before', P.ballBackGoal(true, { x: 13976, y: 116856, age: 60000 }, { x: 1, y: 2, z: 3 }).to === 'point' && P.ballBackGoal(false, { x: 13976, y: 116856, age: 10 }, { x: 1, y: 2, z: 3 }).to === 'point');
  const c = P.ballMatesCentre([{ x: 16376, y: 117064, age: 1000 }, { x: 15944, y: 116936, age: 1000 }, { x: 16070, y: 116924, age: 1000 }, { x: 0, y: 0, age: 1, dead: true }]);
  t('BALLROOM: the leader walks to the centre of the far members (dead / unseen ignored)', c && Math.abs(c.x - 16130) <= 1 && Math.abs(c.y - 116975) <= 1);
  t('BALLROOM host: the focus and the hits stay inside the room (+300), the wait uses ballMove, members pull back via ballBackGoal',
    SRC.includes('&& ballInRoom(cm.X, cm.Y, 300));') && SRC.includes('tightHitsNow().filter(h => { const m = mobById(h.id); return !!m && ballInRoom(m.X, m.Y, 300); })')
    && SRC.includes("const mv = ballMove({ formed: bf.ok, waitedMs: BALLST.waitSince ? now() - BALLST.waitSince : 0, waitMax: BALLST.waitMax, inRoom: ballInRoom(Me.X, Me.Y, 100), hits: 0 });")
    && SRC.includes("const g = ballBackGoal(typeof tightGroup === 'function' && tightGroup(), lp, { x: event.data.x, y: event.data.y, z: event.data.z || Me.Z });"));
}
console.log(`tight ball: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
