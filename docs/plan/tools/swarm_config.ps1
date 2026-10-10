# Shared settings for the PowerShell tools (portable install, 2026-10-07). Dot-source it:   . "$PSScriptRoot\swarm_config.ps1"
# Sets:
#   $SwarmRoot      install folder: swarm.config.json "paths.root" when set, else three folders above docs\plan\tools
#   $SwarmCfg       the parsed swarm.config.json (an empty object when the file is missing -> old defaults below)
#   $SwarmMcpUrl    http://127.0.0.1:<mcp.port>           (default 8083)
#   $SwarmDashPort  dashboard port                         (default 8090)
#   $SwarmGameIp / $SwarmGamePort / $SwarmLoginIp / $SwarmLoginPort / $SwarmServerId
#   $SwarmL2Client  path of the game client l2.exe (paths.l2Client)
$__base = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$SwarmCfg = [pscustomobject]@{}
$__cfgFile = Join-Path $__base 'swarm.config.json'
if (Test-Path $__cfgFile) {
    try { $SwarmCfg = [IO.File]::ReadAllText($__cfgFile) | ConvertFrom-Json } catch { Write-Warning "swarm.config.json could not be read: $_" }
}
function SwarmCfgValue($obj, [string]$path, $default) {
    $cur = $obj
    foreach ($p in $path.Split('.')) {
        if ($null -eq $cur) { return $default }
        $prop = $cur.PSObject.Properties[$p]
        if (-not $prop) { return $default }
        $cur = $prop.Value
    }
    if ($null -eq $cur -or "$cur" -eq '') { return $default }
    return $cur
}
$SwarmRoot      = [string](SwarmCfgValue $SwarmCfg 'paths.root' $__base)
$SwarmRoot      = $SwarmRoot.TrimEnd('\', '/')
$SwarmMcpUrl    = 'http://127.0.0.1:' + [int](SwarmCfgValue $SwarmCfg 'mcp.port' 8083)
$SwarmDashPort  = [int](SwarmCfgValue $SwarmCfg 'dashboard.port' 8090)
$SwarmLoginIp   = [string](SwarmCfgValue $SwarmCfg 'server.loginIp' '149.56.28.81')
$SwarmLoginPort = [int](SwarmCfgValue $SwarmCfg 'server.loginPort' 2106)
$SwarmServerId  = [int](SwarmCfgValue $SwarmCfg 'server.serverId' 3)
$SwarmGameIp    = [string](SwarmCfgValue $SwarmCfg 'server.gameIp' $SwarmLoginIp)
$SwarmGamePort  = [int](SwarmCfgValue $SwarmCfg 'server.gamePort' 7778)
$SwarmL2Client  = [string](SwarmCfgValue $SwarmCfg 'paths.l2Client' 'C:\Lineage2\system\l2.exe')
$SwarmMainLeader = [string](SwarmCfgValue $SwarmCfg 'mainLeader' 'Tank1')
$SwarmLoginGap  = [int](SwarmCfgValue $SwarmCfg 'login.gapSeconds' 0)     # 0 = not set (l2swarm_ctl.ps1 keeps its own default)
# the main leader's config file name (AutoStart sanity check in l2swarm_ctl.ps1)
$SwarmMainConfig = 'Tank1.xml'
foreach ($__a in @(SwarmCfgValue $SwarmCfg 'accounts' @())) {
    if ($__a -and $__a.character -eq $SwarmMainLeader -and $__a.config) { $SwarmMainConfig = [string]$__a.config }
}
