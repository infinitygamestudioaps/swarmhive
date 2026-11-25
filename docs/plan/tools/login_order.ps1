# LOGINPARTY-2026-11-25 (owner: "Whole parties don't log in together yet ... fix these"; live 2026-11-22: the duos and parties came in
# minutes apart because the start list is L2Swarm's AutoStart order + swarm.config.json order + start_extra.txt): the login run opens each
# party as one block - its leader first, then its members - in the order the parties first appear in the list. The gap between two logins
# stays ($loginGapSec, never under 5 s; owner rule). Accounts without a party in swarm.config.json keep their place.
# Party = swarm.config.json accounts[].party; leader = the account whose character name equals the party name.
# Dot-sourced by l2swarm_ctl.ps1 (Open-Configs). Test: docs/plan/tools/test_owner_1125.js (runs this file through PowerShell).
function LoginOrderByParty($configs, $accounts) {
    $acc = @{}
    foreach ($a in @($accounts)) { if ($a -and $a.config) { $acc[[IO.Path]::GetFileName([string]$a.config).ToLower()] = $a } }
    $groups = [ordered]@{}
    $i = 0
    foreach ($c in @($configs)) {
        if (-not $c) { continue }
        $a = $acc[[IO.Path]::GetFileName([string]$c).ToLower()]
        $party = if ($a -and $a.party) { ([string]$a.party).ToLower() } else { '' }
        $k = if ($party) { 'p:' + $party } else { 'x:' + $i }
        if (-not $groups.Contains($k)) { $groups[$k] = New-Object System.Collections.ArrayList }
        $lead = [bool]($party -and ([string]$a.character).ToLower() -eq $party)
        [void]$groups[$k].Add([pscustomobject]@{ c = $c; lead = $lead })
        $i++
    }
    $out = New-Object System.Collections.ArrayList
    foreach ($k in $groups.Keys) {
        foreach ($e in $groups[$k]) { if ($e.lead) { [void]$out.Add($e.c) } }
        foreach ($e in $groups[$k]) { if (-not $e.lead) { [void]$out.Add($e.c) } }
    }
    return $out.ToArray()
}
