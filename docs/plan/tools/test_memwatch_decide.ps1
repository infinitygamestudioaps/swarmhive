# Harness for test_memwatch_decide.js: runs MemWatchDecide (memwatch_decide.ps1, the real PowerShell code l2swarm_ctl.ps1 uses) on every
# case in the JSON file given as -Cases and prints the results as one JSON array. Reads nothing else, writes nothing, starts nothing.
param([Parameter(Mandatory = $true)][string]$Cases)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\memwatch_decide.ps1"
$list = Get-Content -Raw -Path $Cases | ConvertFrom-Json
$out = @()
foreach ($c in $list) {
    $a = @{ CommitFreeMB = [double]$c.commitFree; CommitLimitMB = [double]$c.limit; PcFreeMB = [double]$c.pcFree }
    if ($null -ne $c.cfg) { foreach ($pr in $c.cfg.PSObject.Properties) { $a[$pr.Name] = [double]$pr.Value } }
    $d = MemWatchDecide @a
    $out += [pscustomobject]@{ name = $c.name; restart = [bool]$d.restart; emergency = [bool]$d.emergency; warn = [string]$d.warn; reason = [string]$d.reason }
}
ConvertTo-Json -InputObject @($out) -Compress -Depth 4
