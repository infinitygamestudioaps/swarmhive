// Prints a condensed version of a quest's onAdvEvent/onTalk/onKill/onAttack, constants replaced by name(id) only once.
const fs = require('fs');
const f = process.argv[2];
let src = fs.readFileSync(f, 'utf8');
const body = src.slice(src.indexOf('@Override'));
const lines = body.split('\n').map(l => l.trim()).filter(l =>
  l && !/^(htmltext\s*=|break;|\}|\{|return htmltext;|@Override|playSound|final QuestState|String htmltext|if \(qs == null\)|return null;|default:|\} else \{|else \{)$/.test(l) &&
  !/^playSound\(|^htmltext = "|^npc\.broadcastPacket|^player\.sendPacket|^return htmltext|^\/\//.test(l));
console.log(lines.join('\n').replace(/player\.getRadar\(\)\.addMarker/g, 'RADAR').replace(/hasQuestItems\(player, /g, 'has(').replace(/getQuestItemsCount\(player, /g, 'cnt(').replace(/giveItems\(player, /g, 'give(').replace(/takeItems\(player, /g, 'take(').replace(/hasAtLeastOneQuestItem\(player, /g, 'hasAny(').replace(/giveItemRandomly\(/g, 'giveRnd('));
