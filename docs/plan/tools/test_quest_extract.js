// TEST quest_extract.js (2026-10-27, verifier docs/plan/quest_verify.md findings 1 + 2):
//   A braceless `switch (event)` cases are separate actions (Q6: the start no longer ends the quest; Baulro / Sir Collin stages kept), fall-through, arrow cases
//   B random chances: percent, per-mille, `==`, `<=`, map / array by npc id, the else branch (100 - chance), scoped random locals (Q330 gave 700 / -820 %)
//   C race / class / start-item rules from the conditions on the way to the offer page (Q2 / Q9 / Q401 style, nested ternaries)
//   D random kill stage: kills[].chance + a 95 % kill count
//   E (only with env L2J_DP = a datapack clone) the real Q6 / Q9 / Q151 / Q330 scripts
// Pure: synthetic Java in a temp folder; nothing in Scripts/data is read for the checks or written.  Run: node docs/plan/tools/test_quest_extract.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
try { os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { }
const X = require('./quest_extract.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'qx-'));
/** build one synthetic quest: java body + html files -> the quest record */
function build(name, java, htmls) {
  const dir = path.join(TMP, name); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name + '.java'); fs.writeFileSync(f, java);
  return X.buildQuest(name, f, htmls || {});
}
const T = (q, ev) => (q.transitions || []).filter(t => (t.trigger.events || []).includes(ev));

// ---------------------------------------------------------------- A: braceless cases (the Q6 shape)
const Q6 = `package quests.Q00006_StepIntoTheFuture;
public class Q00006_StepIntoTheFuture extends Quest {
	private static final int ROXXY = 30006;
	private static final int BAULRO = 30033;
	private static final int SIR_COLLIN = 30311;
	private static final int BAULRO_LETTER = 7571;
	private static final int SCROLL_OF_ESCAPE_GIRAN = 7559;
	private static final int MARK_OF_TRAVELER = 7570;
	private static final int MIN_LEVEL = 3;
	public Q00006_StepIntoTheFuture() {
		super(6, Q00006_StepIntoTheFuture.class.getSimpleName(), "Step Into the Future");
		addStartNpc(ROXXY);
		addTalkId(ROXXY, BAULRO, SIR_COLLIN);
		registerQuestItems(BAULRO_LETTER);
	}
	@Override
	public String onAdvEvent(String event, L2Npc npc, L2PcInstance player) {
		final QuestState st = getQuestState(player, false);
		if (st == null) {
			return null;
		}
		String htmltext = event;
		switch (event) {
			case "30006-03.htm":
				st.startQuest();
				break;
			case "30006-06.html":
				st.giveItems(SCROLL_OF_ESCAPE_GIRAN, 1);
				st.giveItems(MARK_OF_TRAVELER, 1);
				st.exitQuest(false, true);
				break;
			case "30033-02.html":
				st.setCond(2, true);
				st.giveItems(BAULRO_LETTER, 1);
				break;
			case "30311-02.html":
				if (!st.hasQuestItems(BAULRO_LETTER)) {
					return "30311-03.html";
				}
				st.takeItems(BAULRO_LETTER, -1);
				st.setCond(3, true);
				break;
			default:
				htmltext = null;
				break;
		}
		return htmltext;
	}
	@Override
	public String onTalk(L2Npc npc, L2PcInstance player) {
		String htmltext = getNoQuestMsg(player);
		final QuestState st = getQuestState(player, true);
		switch (npc.getId()) {
			case ROXXY:
				switch (st.getState()) {
					case State.CREATED:
						htmltext = ((player.getRace() == Race.HUMAN) && (player.getLevel() >= MIN_LEVEL)) ? "30006-02.htm" : "30006-01.html";
						break;
					case State.STARTED:
						if (st.isCond(1)) {
							htmltext = "30006-04.html";
						} else if (st.isCond(3)) {
							htmltext = "30006-05.html";
						}
						break;
				}
				break;
			case BAULRO:
				if (st.isStarted()) {
					htmltext = st.isCond(1) ? "30033-01.html" : "30033-03.html";
				}
				break;
		}
		return htmltext;
	}
}`;
const QHTML = (cls, evs) => evs.map(e => `<a action="bypass -h Quest ${cls} ${e}">go</a>`).join('<br>');
const q6 = build('Q00006_StepIntoTheFuture', Q6, {
  '30006-02.htm': QHTML('Q00006_StepIntoTheFuture', ['30006-03.htm']), '30006-05.html': QHTML('Q00006_StepIntoTheFuture', ['30006-06.html']),
  '30033-01.html': QHTML('Q00006_StepIntoTheFuture', ['30033-02.html']), '30311-01.html': QHTML('Q00006_StepIntoTheFuture', ['30311-02.html']) });
{
  const st = T(q6, '30006-03.htm');
  ok(st.length === 1 && st[0].to === 1 && st[0].start === true, 'A1 Q6 start event -> cond 1 (start), got ' + JSON.stringify(st.map(t => t.to)));
  ok(!st.some(t => t.to === 'end'), 'A2 Q6 the start click does NOT end the quest');
  ok(!(st[0] && st[0].gives || []).length, 'A3 Q6 the start gives no reward items');
  const e = T(q6, '30006-06.html'); ok(e.length === 1 && e[0].to === 'end' && (e[0].gives || []).map(g => g.id).sort().join() === '7559,7570', 'A4 Q6 30006-06 ends with SoE Giran + Mark of Traveler');
  const b = T(q6, '30033-02.html'); ok(b.length === 1 && b[0].to === 2 && (b[0].trigger.npcs || []).includes(30033) && (b[0].gives || []).some(g => g.id === 7571), 'A5 Q6 Baulro stage: cond 2 + letter');
  const c = T(q6, '30311-02.html'); ok(c.length === 1 && c[0].to === 3 && (c[0].trigger.npcs || []).includes(30311) && (c[0].takes || []).some(g => g.id === 7571), 'A6 Q6 Sir Collin stage: cond 3, letter taken');
  ok((q6.npcs || []).some(n => n.id === 30033) && (q6.npcs || []).some(n => n.id === 30311), 'A7 Q6 Baulro + Sir Collin are quest NPCs');
  ok(JSON.stringify((q6.requirements || {}).races) === '["HUMAN"]', 'A8 Q6 race HUMAN, got ' + JSON.stringify(q6.requirements));
}
// fall-through + arrow cases on the walker itself
{
  const src = X.stripComments(`class A { String onAdvEvent(String event) { switch (event) { case "a": x(1); case "b": st.setCond(2); break; case "c": st.setCond(3); break; } switch (event) { case "d" -> st.setCond(4); case "e" -> st.setCond(5); } return null; } }`);
  const seen = [];
  X.walk(src, (s, frames) => { const cf = frames.filter(f => f.isCase); if (/setCond|x\(/.test(s)) seen.push([s, cf.length ? cf[cf.length - 1].labels.join('|') : '']); });
  const lab = (re) => (seen.find(x => re.test(x[0])) || [])[1];
  ok(lab(/^x\(1\)/) === '"a"', 'A9 fall-through: x() under case a only, got ' + lab(/^x\(1\)/));
  ok(lab(/setCond\(2\)/) === '"b"|"a"' || lab(/setCond\(2\)/) === '"a"|"b"', 'A10 fall-through: setCond(2) runs for a AND b, got ' + lab(/setCond\(2\)/));
  ok(lab(/setCond\(3\)/) === '"c"', 'A11 after break: setCond(3) only under c, got ' + lab(/setCond\(3\)/));
  ok(lab(/setCond\(5\)/) === '"e"', 'A12 arrow cases never fall through, got ' + lab(/setCond\(5\)/));
  const fids = new Set(); X.walk(src, (s, frames) => { if (/setCond\(2\)|setCond\(3\)/.test(s)) fids.add(frames[frames.length - 1].id); });
  ok(fids.size === 2, 'A13 two braceless cases = two frames (facts are grouped by frame)');
}

// ---------------------------------------------------------------- B: chances
const QB = `package quests.Q00999_Chances;
public class Q00999_Chances extends Quest {
	private static final int NPC = 30001;
	private static final int MOB_A = 20001; private static final int MOB_B = 20002; private static final int MOB_C = 20003;
	private static final int ITEM_PM = 9001; private static final int ITEM_MAP = 9002; private static final int ITEM_ELSE = 9003; private static final int ITEM_ARR = 9004;
	private static final int ITEM_EQ = 9005; private static final int ITEM_R1 = 9006; private static final int ITEM_R2 = 9007; private static final int ITEM_R3 = 9008;
	private static final int CHANCE = 0;
	private static final int FIRST = 20001;
	private static final int[] CHANCES = { 516, 664, 686 };
	private static final Map<Integer, Integer> MONSTERS = new HashMap<>();
	static {
		MONSTERS.put(20001, 90);
		MONSTERS.put(20002, 77);
	}
	private static final int MIN_LEVEL = 10;
	public Q00999_Chances() {
		super(999, Q00999_Chances.class.getSimpleName(), "Chances");
		addStartNpc(NPC); addTalkId(NPC); addKillId(MOB_A, MOB_B, MOB_C);
	}
	@Override
	public String onKill(L2Npc npc, L2PcInstance killer, boolean isSummon) {
		final QuestState st = getQuestState(killer, false);
		switch (npc.getId()) {
			case MOB_A:
				if (getRandom(1000) < 360) {
					st.giveItems(ITEM_PM, 1);
				}
				if (getRandom(100) <= MONSTERS.get(npc.getId())) {
					st.giveItems(ITEM_MAP, 1);
				} else {
					st.giveItems(ITEM_ELSE, 1);
				}
				break;
			case MOB_B:
				if (getRandom(1000) < CHANCES[npc.getId() - FIRST]) {
					st.giveItems(ITEM_ARR, 1);
				}
				if (getRandom(5) == CHANCE) {
					st.giveItems(ITEM_EQ, 1);
				}
				break;
			case MOB_C: {
				final int i0 = getRandom(100);
				if (i0 < 70) {
					st.giveItems(ITEM_R1, 1);
				} else if (i0 < 77) {
					st.giveItems(ITEM_R2, 1);
				}
				break;
			}
		}
		return null;
	}
	public String onAttack(L2Npc npc, L2PcInstance attacker) {
		final QuestState st = getQuestState(attacker, false);
		final int i0 = getRandom(10);
		if (i0 < 7) {
			st.giveItems(ITEM_R3, 1);
		}
		return null;
	}
}`;
const qb = build('Q00999_Chances', QB, {});
{
  const D = (item) => (qb.drops || []).filter(d => d.item === item);
  const one = (item) => D(item)[0] || {};
  ok(one(9001).chance === 36, 'B1 per-mille getRandom(1000) < 360 = 36 %, got ' + JSON.stringify(D(9001)));
  ok(one(9002).chanceByNpc && one(9002).chanceByNpc[20001] === 91, 'B2 getRandom(100) <= MAP.get(npc) = 91 % (<= counts the value), got ' + JSON.stringify(D(9002)));
  ok(one(9003).chanceByNpc && one(9003).chanceByNpc[20001] === 9, 'B3 else branch of a per-npc roll = 100 - 91 = 9 %, got ' + JSON.stringify(D(9003)));
  ok(one(9004).chanceByNpc && one(9004).chanceByNpc[20002] === 66.4, 'B4 per-mille array CHANCES[npc.getId() - FIRST] = 66.4 % for 20002, got ' + JSON.stringify(D(9004)));
  ok(one(9005).chance === 20, 'B5 getRandom(5) == CHANCE = 20 %, got ' + JSON.stringify(D(9005)));
  ok(one(9006).chance === 70 && one(9007).chance === 7, 'B6 scoped local i0 = getRandom(100): 70 % / 7 %, got ' + JSON.stringify([D(9006), D(9007)]));
  ok(D(9008).length && D(9008).every(d => d.chance === 70), 'B7 a second i0 = getRandom(10) in another method keeps its own base: 70 %, got ' + JSON.stringify(D(9008)));
  ok((qb.drops || []).every(d => d.chance == null || (d.chance >= 0 && d.chance <= 100)), 'B8 no chance outside 0-100 (Q330 had 700 / -820)');
}

// ---------------------------------------------------------------- C: race / class / start item rules on the way to the offer page
const QC = (id, cls, cond, extra) => `package quests.${cls};
public class ${cls} extends Quest {
	private static final int NPC = 30500;
	private static final int MARK = 7570;
	private static final int MIN_LEVEL = 3;
	public ${cls}() { super(${id}, ${cls}.class.getSimpleName(), "Q${id}"); addStartNpc(NPC); addTalkId(NPC); }
	public String onAdvEvent(String event, L2Npc npc, L2PcInstance player) {
		final QuestState st = getQuestState(player, false);
		switch (event) {
			case "30500-04.htm":
				st.startQuest();
				break;
			case "30500-09.html":
				st.exitQuest(false, true);
				break;
		}
		return event;
	}
	public String onTalk(L2Npc npc, L2PcInstance player) {
		String htmltext = getNoQuestMsg(player);
		final QuestState st = getQuestState(player, true);
		switch (st.getState()) {
			case State.CREATED:
				${cond}
				break;
			case State.STARTED:
				htmltext = "30500-05.html";
				break;
		}
		return htmltext;
	}
	${extra || ''}
}`;
const OFFER = { '30500-03.htm': QHTML('X', ['30500-04.htm']), '30500-05.html': QHTML('X', ['30500-09.html']) };
{
  // Q9 shape: a nested ternary, the race check is the SECOND condition
  const q9 = build('Q00901_Orc', QC(901, 'Q00901_Orc', 'htmltext = (player.getLevel() >= MIN_LEVEL) ? (player.getRace() == Race.ORC) ? "30500-03.htm" : "30500-02.html" : "30500-01.html";'), OFFER);
  ok(JSON.stringify((q9.requirements || {}).races) === '["ORC"]' && !(q9.requirements || {}).notRaces, 'C1 nested ternary (Q9): races [ORC], got ' + JSON.stringify(q9.requirements));
  // Q2 shape: the TRUE branch is the refusal page -> the rule is flipped
  const q2 = build('Q00902_ElfHuman', QC(902, 'Q00902_ElfHuman', 'htmltext = ((player.getRace() != Race.ELF) && (player.getRace() != Race.HUMAN)) ? "30500-00.htm" : (player.getLevel() >= MIN_LEVEL) ? "30500-03.htm" : "30500-01.html";'), OFFER);
  ok(JSON.stringify(((q2.requirements || {}).races || []).slice().sort()) === '["ELF","HUMAN"]' && !(q2.requirements || {}).notRaces, 'C2 refusal-first ternary (Q2): races ELF/HUMAN (not notRaces), got ' + JSON.stringify(q2.requirements));
  // not-for-race (162 shape)
  const q3 = build('Q00903_NotDE', QC(903, 'Q00903_NotDE', 'htmltext = (player.getRace() == Race.DARK_ELF) ? "30500-00.htm" : (player.getLevel() >= MIN_LEVEL) ? "30500-03.htm" : "30500-01.html";'), OFFER);
  ok(JSON.stringify((q3.requirements || {}).notRaces) === '["DARK_ELF"]' && !((q3.requirements || {}).races || []).length, 'C3 "not for Dark Elves": notRaces [DARK_ELF], got ' + JSON.stringify(q3.requirements));
  // class rule (401 shape: if / else if, only the first branch reaches the offer)
  const q4 = build('Q00904_Class', QC(904, 'Q00904_Class', `if (player.getClassId() == ClassId.fighter) {
					htmltext = (player.getLevel() >= MIN_LEVEL) ? "30500-03.htm" : "30500-02.htm";
				} else if (player.getClassId() == ClassId.warrior) {
					htmltext = "30500-02a.htm";
				} else {
					htmltext = "30500-02b.htm";
				}`), OFFER);
  // client class names come from Dashboard/data/classes.json, generated from each user's own L2Swarm (not in the public package):
  // without it the rule must still be found, with the enum name kept
  const HAVE_CLASSES = fs.existsSync(path.join(__dirname, '..', '..', '..', 'Dashboard', 'data', 'classes.json'));
  ok(JSON.stringify((q4.requirements || {}).classes) === (HAVE_CLASSES ? '["Human Fighter"]' : '["fighter"]'), 'C4 class rule ClassId.fighter -> ["Human Fighter"] (the warrior branch is a refusal), got ' + JSON.stringify(q4.requirements));
  // start item (45-49 Mark of Traveler)
  const q5 = build('Q00905_Mark', QC(905, 'Q00905_Mark', 'htmltext = ((player.getLevel() >= MIN_LEVEL) && hasQuestItems(player, MARK)) ? "30500-03.htm" : "30500-01.html";'), OFFER);
  ok(((q5.requirements || {}).items || []).some(i => i.id === 7570), 'C5 start item Mark of Traveler 7570 required, got ' + JSON.stringify(q5.requirements));
  // pure helpers
  const tp = X.ternaryPaths('a ? (b ? "x" : "y") : "z"', (l) => l === '"y"');
  ok(tp.length === 1 && JSON.stringify(tp[0]) === JSON.stringify([{ c: 'a', pos: true }, { c: 'b', pos: false }]), 'C6 ternaryPaths a ? (b ? x : y) : z -> y = a && !b');
  if (!HAVE_CLASSES) console.log('skip C7 classDisplay (no Dashboard/data/classes.json in this install)'); else ok(X.classDisplay('darkFighter') === 'Dark Fighter' && X.classDisplay('orcShaman') === 'Orc Shaman', 'C7 classDisplay enum -> client names');
}

// ---------------------------------------------------------------- D: random kill stage (Q151 shape)
const QD = `package quests.Q00151_Cure;
public class Q00151_Cure extends Quest {
	private static final int NPC = 30050;
	private static final int[] MOBS = { 20103, 20106, 20108 };
	private static final int POISON = 703;
	private static final int CHANCE = 0;
	private static final int MIN_LEVEL = 15;
	public Q00151_Cure() { super(151, Q00151_Cure.class.getSimpleName(), "Cure"); addStartNpc(NPC); addTalkId(NPC); addKillId(MOBS); registerQuestItems(POISON); }
	public String onKill(L2Npc npc, L2PcInstance killer, boolean isSummon) {
		final QuestState st = getQuestState(killer, false);
		if ((st != null) && st.isCond(1) && (getRandom(5) == CHANCE)) {
			st.giveItems(POISON, 1);
			st.setCond(2, true);
		}
		return null;
	}
}`;
{
  const qd = build('Q00151_Cure', QD, {});
  const k = (qd.kills || [])[0] || {};
  ok(k.random === true && k.chance === 20, 'D1 random kill stage: chance 20 %, got ' + JSON.stringify(qd.kills));
  ok(k.count === 14, 'D2 random kill stage: 14 kills = 95 % to reach cond 2, got ' + k.count);
  const d = (qd.drops || []).find(x => x.item === 703); ok(d && d.chance === 20, 'D3 the poison sac drop 20 %, got ' + JSON.stringify(d));
}

// ---------------------------------------------------------------- E: the real datapack (optional)
const DP = process.env.L2J_DP;
if (DP && fs.existsSync(path.join(DP, 'src/main/java/com/l2jserver/datapack/quests'))) {
  const QD2 = path.join(DP, 'src/main/java/com/l2jserver/datapack/quests');
  const real = (id) => { const d = fs.readdirSync(QD2).find(x => x.startsWith('Q' + String(id).padStart(5, '0') + '_')); const dir = path.join(QD2, d); const H = {}; fs.readdirSync(dir).filter(f => /\.html?$/.test(f)).forEach(f => { H[f] = fs.readFileSync(path.join(dir, f), 'utf8'); }); return X.buildQuest(d, path.join(dir, d + '.java'), H); };
  const r6 = real(6); ok(T(r6, '30006-03.htm').some(t => t.to === 1) && T(r6, '30033-02.html').some(t => t.to === 2) && T(r6, '30311-02.html').some(t => t.to === 3), 'E1 real Q6: start / Baulro / Sir Collin stages');
  const r9 = real(9); ok(JSON.stringify((r9.requirements || {}).races) === '["ORC"]', 'E2 real Q9: Orc only');
  const r330 = real(330); ok((r330.drops || []).every(d => d.chance == null || (d.chance >= 0 && d.chance <= 100)), 'E3 real Q330: every chance 0-100');
  const r401 = real(401); ok(JSON.stringify((r401.requirements || {}).classes) === '["Human Fighter"]', 'E4 real Q401: Human Fighter only');
} else console.log('(E skipped: set L2J_DP to a datapack clone for the real-script checks)');

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { }
console.log(`test_quest_extract: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
