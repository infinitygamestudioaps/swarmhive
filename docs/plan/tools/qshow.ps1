param([int[]]$Ids)
$dir="$PSScriptRoot\..\..\..\Scripts\data\dp\quests"
$digest = ((Resolve-Path "$PSScriptRoot\..\..\..\Scripts\data\dp\quests_digest.json").Path -replace '\\', '/')
foreach($id in $Ids){
  $f = Get-ChildItem $dir -Filter ("Q{0:D5}_*.java" -f $id) | Select -First 1
  "=================== $($f.Name)"
  node "$PSScriptRoot\qcondense.js" $f.FullName | Select-String -NotMatch 'final QuestState|String htmltext|switch \(event\)|^case "\d+-\d+\w?\.html?":$|htmltext = event;|^if \(qs == null\)|getNoQuestMsg|npc\.broadcast|NpcSay|^return super|getAlreadyCompletedMsg|htmltext = getHtm|replaceAll|sendPacket|playSound|^\} else if \(qs\.isCompleted\(\)\)' | % Line
  "--- constants"
  node -e "const j=require('$digest');const c=j[$id].constants;for(const[k,v]of Object.entries(c))if(v.name)console.log(k,v.id,v.name,'L'+v.level,'ag'+v.aggro,v.at?v.at.join(','):'-',v.spawns||0)"
}
