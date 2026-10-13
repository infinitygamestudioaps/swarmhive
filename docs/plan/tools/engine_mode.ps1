# NEW ENGINE PER CHARACTER (2026-10-13, user: "Make the new engine default!") - the PowerShell twin of isBrainChar() in
# Dashboard/brain_host/supervise.js, used by SETUP.ps1 and new_account.ps1. Dot-source it:
#   . "$root\docs\plan\tools\engine_mode.ps1"
#   $bh = Read-BrainHost $root                 # Scripts\data\brain_host.json (else the .example.json of a fresh package)
#   Test-BrainChar $bh 'Name' $rosterNames     # $true = the new engine drives Name (its account runs agent2.js, not swarm.js)
#                                              # $false = swarm.js inside L2Swarm;  $null = brain_host.json unreadable: change nothing
# brain_host.json: "on" false = nobody; "allowAll": true = every character of swarm.config.json (+ "allow"), minus "except";
# without allowAll only the names in "allow". A character being ADDED counts as part of the roster (-Adding).
function Read-BrainHost([string]$root) {
    foreach ($f in @('Scripts\data\brain_host.json', 'Scripts\data\brain_host.example.json')) {
        $p = Join-Path $root $f
        if (-not (Test-Path -LiteralPath $p)) { continue }
        try { return ([IO.File]::ReadAllText($p) | ConvertFrom-Json) } catch { return [pscustomobject]@{ __unreadable = $p } }
    }
    return $null
}
function Get-BrainList($bh, [string]$key) {
    if (-not $bh -or -not $bh.PSObject.Properties[$key]) { return @() }
    return @(@($bh.$key) | Where-Object { $_ } | ForEach-Object { [string]$_ })
}
function Test-BrainChar($bh, [string]$name, $roster = @(), [switch]$Adding) {
    if ($bh -and $bh.PSObject.Properties['__unreadable']) { return $null }
    if (-not $bh -or -not $name) { return $false }
    if ($bh.PSObject.Properties['on'] -and $bh.on -eq $false) { return $false }
    if ((Get-BrainList $bh 'except') -ccontains $name) { return $false }
    if ((Get-BrainList $bh 'allow') -ccontains $name) { return $true }
    if (-not ($bh.PSObject.Properties['allowAll'] -and $bh.allowAll -eq $true)) { return $false }
    return [bool]($Adding -or (@($roster) -ccontains $name))
}
# the account's script list for its engine: swarm.js <-> agent2.js (other scripts, e.g. mkchar_<login>.js, stay)
function Convert-EngineScripts([string[]]$scripts, [bool]$brain) {
    $out = New-Object System.Collections.ArrayList
    foreach ($s in $scripts) {
        $t = $s
        if ($brain -and $s -ieq 'swarm.js') { $t = 'agent2.js' }
        elseif (-not $brain -and $s -match '^agent2(_[A-Za-z0-9]+)?\.js$') { $t = 'swarm.js' }
        if (-not ($out -contains $t)) { [void]$out.Add($t) }
    }
    return , @($out)
}
