# SETUP.ps1 - makes this L2Swarm install match swarm.config.json (portable install, 2026-10-07).
#
#   SETUP.cmd                 dry run: prints every change it WOULD make, touches nothing
#   SETUP.cmd -Apply          applies the changes (stop L2Swarm first; asks for admin for the scheduled tasks)
#   SETUP.ps1 -Apply -Force   applies even while L2Swarm.exe runs (NOT recommended: L2Swarm re-saves its own copy of
#                             settings.xml / account configs from memory and can undo the changes)
#   -SkipTasks                do not create/update the "L2Swarm Start/Stop/Restart/MemWatch" scheduled tasks
#   -Config <file>            another config file (default: swarm.config.json next to this script)
#   -Images                   (re)generate the dashboard images + item/skill/class tables from THIS L2Swarm's Data\ and Maps\
#                             (docs\plan\tools\extract_game_assets.js + make_maptiles.ps1). Works alone (no -Apply needed, L2Swarm may run);
#                             -Apply also generates them once when Dashboard\icons is missing.
#   -Patch                    optional patch for known L2Swarm bugs (patches\universal\apply_patch.ps1, our own code; it patches
#                             THIS install only, any L2Swarm version, applying only the fixes this build still needs).
#                             Without -Apply: the patcher's dry run. With -Apply: applies it. Never done without -Patch.
#   -NoPatch                  accepted for compatibility (the patch is never installed unless you pass -Patch)
#
# What it manages (idempotent - a second run reports "nothing to do"):
#   * folders: Logs, Scripts_dev (+ a copy of Scripts\swarm.js when missing), Settings\backup, Settings\templates
#   * Settings\templates\<role>.xml: account templates per role, copied from an existing config WITHOUT login/password/character
#   * Settings\<config>.xml per account: login, character, L2Swarm group (= party), login server, server id, client path,
#     script paths, zone file path, follow settings (members follow their party leader; healers do not assist).
#     An EXISTING config (yours, or one found by docs\plan\tools\import_l2swarm.js) is only edited in place - its password is never asked,
#     read or changed. A missing config is created with docs\plan\tools\new_account.ps1: the password is read from the environment variable
#     SWARM_PW_<LOGIN> or SWARM_PASSWORD, else asked with a hidden prompt, and only the ENCRYPTED password is written.
#   * Settings\settings.xml: AutoStart list (this machine's paths, all enabled="false": l2swarm_ctl.ps1 logs in one by one),
#     MCP port
#   * Settings\client_mode.json (in-game / out-of-game per character), Settings\login_gap.txt, Dashboard key file
#   * scheduled tasks L2Swarm Start/Stop/Restart/MemWatch pointing at THIS folder
# Every file is copied to Settings\backup\<date>_setup\ before it is changed. Passwords are never printed.
param(
    [switch]$Apply,
    [switch]$Force,
    [switch]$SkipTasks,
    [string]$Config = '',
    [switch]$Images,
    [switch]$Patch,
    [switch]$NoPatch
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

# dashboard images + lookup tables, generated from this install's own L2Swarm data (the package ships no game art)
function Invoke-Images([string]$r) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host 'node.exe not found - install Node.js LTS first (https://nodejs.org)' -ForegroundColor Red; return $false }
    Write-Host 'generating the dashboard images from Data\icons.db + Data\base.db ...' -ForegroundColor Cyan
    & node (Join-Path $r 'docs\plan\tools\extract_game_assets.js') --root $r
    $ok = ($LASTEXITCODE -eq 0)
    if (Test-Path (Join-Path $r 'Maps')) {
        Write-Host 'making the dashboard map tiles from Maps\*.jpg (first run takes a minute) ...' -ForegroundColor Cyan
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $r 'docs\plan\tools\make_maptiles.ps1')
        if ($LASTEXITCODE -ne 0) { $ok = $false }
    } else { Write-Host "no Maps\ folder in $r - the dashboard maps stay empty (L2Swarm ships Maps\ with its install)" -ForegroundColor Yellow }
    return $ok
}
if ($Images -and -not $Apply) {
    $ok = Invoke-Images $here
    if ($ok) { Write-Host 'images done.' -ForegroundColor Green; exit 0 } else { Write-Host 'image generation failed - see above.' -ForegroundColor Red; exit 3 }
}

$cfgFile = if ($Config) { $Config } else { Join-Path $here 'swarm.config.json' }
if (-not (Test-Path $cfgFile)) {
    Write-Host "No $cfgFile." -ForegroundColor Yellow
    Write-Host "   Accounts already set up in L2Swarm?  node docs\plan\tools\import_l2swarm.js   (dry run; then add --write)  - or run INSTALL.cmd" -ForegroundColor Yellow
    Write-Host "   Otherwise: copy swarm.config.example.json swarm.config.json   then edit: server, mainLeader, accounts (login, character, party, role)." -ForegroundColor Yellow
    exit 1
}
$Cfg = [IO.File]::ReadAllText($cfgFile) | ConvertFrom-Json

function Val($obj, [string]$path, $default) {
    $cur = $obj
    foreach ($p in $path.Split('.')) {
        if ($null -eq $cur) { return $default }
        $prop = $cur.PSObject.Properties[$p]; if (-not $prop) { return $default }
        $cur = $prop.Value
    }
    # only an empty STRING counts as missing: "$cur" of a one-element array of objects is '' in PowerShell 5.1, which dropped a config
    # with exactly ONE account (2026-10-10)
    if ($null -eq $cur -or ($cur -is [string] -and $cur -eq '')) { return $default }
    return $cur
}

$root      = ([string](Val $Cfg 'paths.root' $here)).TrimEnd('\', '/')
$settings  = Join-Path $root 'Settings'
$l2Client  = [string](Val $Cfg 'paths.l2Client' '')
$loginIp   = [string](Val $Cfg 'server.loginIp' '')
$loginPort = [string](Val $Cfg 'server.loginPort' '')
$serverId  = [string](Val $Cfg 'server.serverId' '')
$mcpPort   = [string](Val $Cfg 'mcp.port' '8083')
$mainLeader = [string](Val $Cfg 'mainLeader' '')
$groupFmt  = [string](Val $Cfg 'groups.format' 'Party {party}')
$healers   = @(Val $Cfg 'healerRoles' @('bishop', 'shilliensaint', 'healer'))
$scriptsWanted = @(Val $Cfg 'scripts' @('swarm.js'))
$stamp     = Get-Date -Format 'yyyy-MM-dd_HHmm'
$backupDir = Join-Path $settings "backup\${stamp}_setup"
# an L2Swarm of THIS folder (one whose path we cannot read - it runs elevated - counts too)
$running   = $false
foreach ($__p in @(Get-Process L2Swarm -ErrorAction SilentlyContinue)) { $__pp = $null; try { $__pp = $__p.Path } catch { }; if (-not $__pp -or $__pp.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { $running = $true } }

$changes = New-Object System.Collections.ArrayList
$warnings = New-Object System.Collections.ArrayList
# a planned change: $kind + $data say what Invoke-Change does at -Apply ('' = report line only)
function Change([string]$area, [string]$text, [string]$kind = '', $data = $null) { [void]$changes.Add([pscustomobject]@{ Area = $area; Text = $text; Kind = $kind; Data = $data }) }
function Warn([string]$text) { [void]$warnings.Add($text) }
function Backup([string]$file) {
    if (-not (Test-Path $file)) { return }
    New-Item -ItemType Directory -Force $backupDir | Out-Null
    $rel = $file.Substring($root.Length).TrimStart('\') -replace '[\\/]', '__'
    $dst = Join-Path $backupDir $rel
    if (-not (Test-Path $dst)) { Copy-Item $file $dst }
}
function HasBom([string]$file) { $b = [IO.File]::ReadAllBytes($file); return ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) }
function WriteText([string]$file, [string]$text, [bool]$bom) { [IO.File]::WriteAllText($file, $text, (New-Object Text.UTF8Encoding $bom)) }
# account configs can be UTF-8 or UTF-16 (with or without BOM; older L2Swarm builds and imported folders): read them in their own
# encoding and write them back in the SAME encoding - a UTF-16 file with encoding="utf-16" written as UTF-8 would no longer load
function Get-TextEnc([string]$file) {
    $b = [IO.File]::ReadAllBytes($file)
    if ($b.Length -ge 2 -and $b[0] -eq 0xFF -and $b[1] -eq 0xFE) { $e = New-Object Text.UnicodeEncoding($false, $true); return @{ Text = $e.GetString($b, 2, $b.Length - 2); Enc = $e } }
    if ($b.Length -ge 2 -and $b[0] -eq 0xFE -and $b[1] -eq 0xFF) { $e = New-Object Text.UnicodeEncoding($true, $true); return @{ Text = $e.GetString($b, 2, $b.Length - 2); Enc = $e } }
    if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { $e = New-Object Text.UTF8Encoding $true; return @{ Text = $e.GetString($b, 3, $b.Length - 3); Enc = $e } }
    if ($b.Length -ge 2 -and $b[0] -eq 0x3C -and $b[1] -eq 0x00) { $e = New-Object Text.UnicodeEncoding($false, $false); return @{ Text = $e.GetString($b); Enc = $e } }
    $e = New-Object Text.UTF8Encoding $false; return @{ Text = $e.GetString($b); Enc = $e }
}
function GroupOf($a) {
    $p = [string]$a.party
    $ov = Val $Cfg "groups.overrides.$p" ''
    if ($ov) { return [string]$ov }
    return $groupFmt.Replace('{party}', $p)
}

Write-Host ''
Write-Host "L2Swarm SETUP  root=$root  config=$cfgFile" -ForegroundColor Cyan
Write-Host ("mode: " + $(if ($Apply) { 'APPLY' } else { 'DRY RUN (nothing is changed; run with -Apply to apply)' }))
if ($running) { Write-Host 'L2Swarm.exe is RUNNING.' -ForegroundColor Yellow }

# ---------------------------------------------------------------- checks
if (-not (Test-Path (Join-Path $root 'L2Swarm.exe'))) { Warn "L2Swarm.exe not found in $root - install L2Swarm into this folder (see docs\plan\INSTALL.md)" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Warn 'node.exe not found in PATH - the dashboard and the path finder need Node.js (https://nodejs.org)' }
else { try { $nv = [int](([string](& node --version | Select-Object -First 1)).TrimStart('v').Split('.')[0]); if ($nv -lt 18) { Warn "Node.js $nv is too old - install Node.js 18 or newer (LTS)" } } catch { } }
# L2Swarm version (2026-10-10): from L2Swarm.exe's FileVersion; version.txt is only a fallback - L2Swarm's updater never rewrites it.
$l2ver = ''
try { $fv = [Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $root 'L2Swarm.exe')).FileVersion; if ($fv -match '^(\d+\.\d+\.\d+)') { $l2ver = $Matches[1] } } catch { }
if (-not $l2ver -and (Test-Path (Join-Path $root 'version.txt'))) { $l2ver = (Get-Content -Raw (Join-Path $root 'version.txt')).Trim() }
if ($l2ver -and $l2ver -notmatch '^3\.8\.(1[0-9]|[6-9])') { Warn "L2Swarm version $l2ver - the swarm is tested on 3.8.10 - 3.8.13" }
$patcher = Join-Path $root 'patches\universal\apply_patch.ps1'

# ---------------------------------------------------------------- accounts: normalise + validate
$accounts = @()
foreach ($a in @(Val $Cfg 'accounts' @())) {
    if (-not $a.login) { Warn 'an account without "login" is skipped'; continue }
    $login = ([string]$a.login).ToLower()
    $cfgName = [string](Val $a 'config' '')
    if (-not $cfgName) { $cfgName = $login.Substring(0, 1).ToUpper() + $login.Substring(1) + '.xml' }
    $char = [string](Val $a 'character' '')
    $acc = [pscustomobject]@{
        login = $login; character = $char; config = $cfgName; path = (Join-Path $settings $cfgName)
        party = [string](Val $a 'party' $char); role = [string](Val $a 'role' '')
        enabled = -not ($a.PSObject.Properties['enabled'] -and $a.enabled -eq $false)
        autoStart = -not ($a.PSObject.Properties['autoStart'] -and $a.autoStart -eq $false)
        clientMode = [string](Val $a 'clientMode' '')
    }
    $accounts += $acc
}
$active = @($accounts | Where-Object { $_.enabled })
$chars = @{}; foreach ($a in $active) { if ($a.character) { $chars[$a.character] = $a } }
foreach ($g in ($active | Group-Object login | Where-Object Count -gt 1)) { Warn "login $($g.Name) is used by $($g.Count) enabled accounts" }
foreach ($g in ($active | Where-Object character | Group-Object character | Where-Object Count -gt 1)) { Warn "character $($g.Name) is used by $($g.Count) enabled accounts" }
foreach ($g in ($active | Group-Object config | Where-Object Count -gt 1)) { Warn "config file $($g.Name) is used by $($g.Count) enabled accounts" }
foreach ($a in $active) {
    if (-not $a.character) { Warn "$($a.login): no character name yet - create it in game (or with the dashboard), then add it to swarm.config.json" }
    if (-not $a.role) { Warn "$($a.login) ($($a.character)): no role - swarm.js will not control it" }
    if ($a.party -and -not $chars.ContainsKey($a.party)) { Warn "$($a.login) ($($a.character)): party leader '$($a.party)' is not a character of an enabled account" }
}
if ($mainLeader -and -not $chars.ContainsKey($mainLeader)) { Warn "mainLeader '$mainLeader' is not a character of an enabled account" }
$ingame = @($active | Where-Object { $_.clientMode -eq 'ingame' })
if ($ingame.Count -and $l2Client -and -not (Test-Path $l2Client)) { Warn "paths.l2Client '$l2Client' does not exist (needed for the in-game characters $(@($ingame | ForEach-Object character) -join ', '))" }

# ---------------------------------------------------------------- folders
foreach ($d in 'Logs', 'Scripts_dev', 'Settings\backup', 'Settings\templates') {
    $p = Join-Path $root $d
    if (-not (Test-Path $p)) { Change 'folders' "create $d" 'mkdir' $p }
}
$devJs = Join-Path $root 'Scripts_dev\swarm.js'; $liveJs = Join-Path $root 'Scripts\swarm.js'
if (-not (Test-Path $devJs) -and (Test-Path $liveJs)) {
    Change 'folders' 'copy Scripts\swarm.js -> Scripts_dev\swarm.js (edit there, deploy with docs\plan\tools\deploy_swarm.ps1)' 'copy' @($liveJs, $devJs)
}
# a fresh package install has only the source Scripts_dev\swarm.js: deploy it once (L2Swarm is stopped during -Apply)
if ((Test-Path $devJs) -and -not (Test-Path $liveJs)) {
    Change 'folders' 'deploy Scripts_dev\swarm.js -> Scripts\swarm.js (first install; later updates go through update.ps1 / deploy_swarm.ps1)' 'copy' @($devJs, $liveJs)
}
# your data files: the package ships Scripts\data\<name>.example.json; the real file is created once and never overwritten
foreach ($ex in @(Get-ChildItem (Join-Path $root 'Scripts\data\*.example.json') -ErrorAction SilentlyContinue)) {
    $real = $ex.FullName -replace '\.example\.json$', '.json'
    if (-not (Test-Path $real)) { Change 'data' "create Scripts\data\$(Split-Path $real -Leaf) from the example (yours from then on: update.ps1 keeps it)" 'copy' @($ex.FullName, $real) }
}
# dashboard images (generated from this L2Swarm's Data\ + Maps\, never shipped)
$needImages = $Images -or -not (Test-Path (Join-Path $root 'Dashboard\icons\class')) -or -not (Test-Path (Join-Path $root 'Scripts\data\npc_strings.json'))
if ($needImages) { Change 'dashboard' 'generate the dashboard images + item/skill/class tables + Scripts\data\npc_strings.json from Data\icons.db, Data\base.db and Maps\ (extract_game_assets.js, make_maptiles.ps1)' 'images' $root }

# ---------------------------------------------------------------- templates per role
$tplDir = Join-Path $settings 'templates'
$rt = Val $Cfg 'roleTemplates' $null
$roleTpl = @{}
if ($rt) {
    foreach ($p in $rt.PSObject.Properties) {
        $role = $p.Name; $srcName = [string]$p.Value
        $dst = Join-Path $tplDir "$role.xml"; $src = Join-Path $settings $srcName
        $roleTpl[$role] = $dst
        if (Test-Path $dst) { continue }
        if (-not (Test-Path $src)) { Warn "template for role '$role': neither Settings\templates\$role.xml nor Settings\$srcName exists"; continue }
        Change 'templates' "create Settings\templates\$role.xml from $srcName (login, password, character and follow target emptied)" 'template' @($src, $dst)
    }
}
function New-Template([string]$src, [string]$dst) {
    New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
    $x = New-Object Xml.XmlDocument; $x.PreserveWhitespace = $true; $x.LoadXml((Get-TextEnc $src).Text)
    $o = $x.DocumentElement
    foreach ($k in 'Name', 'Password', 'IngamePassword', 'SelectedCharacter', 'FollowName', 'NamePl') { $n = $o.SelectSingleNode($k); if ($n) { $n.InnerText = '' } }
    # LastLoadedUtc must stay a valid xs:dateTime (L2Swarm 3.8.14 validates the file; an empty value fails), 2026-10-10
    $n = $o.SelectSingleNode('LastLoadedUtc'); if ($n) { $n.InnerText = '2000-01-01T00:00:00Z' }
    $n = $o.SelectSingleNode('ActiveFollow'); if ($n) { $n.InnerText = 'false' }
    if ($x.FirstChild -is [Xml.XmlDeclaration]) { $x.FirstChild.Encoding = 'utf-8' }   # written as UTF-8 below
    WriteText $dst $x.OuterXml $false
}
function TemplateFor($role) {
    foreach ($k in @($role, 'default')) {
        if (-not $k) { continue }
        if ($roleTpl.ContainsKey($k)) { return $roleTpl[$k] }
        $f = Join-Path $tplDir "$k.xml"; if (Test-Path $f) { return $f }
    }
    return (Join-Path $tplDir 'default.xml')
}

# ---------------------------------------------------------------- account configs
$newAccountPs = Join-Path $root 'docs\plan\tools\new_account.ps1'
function Set-AccountXml([string]$file, $a, [bool]$write) {
    # returns the list of changed fields; writes the file when $write
    $te = Get-TextEnc $file; $raw = $te.Text
    $x = New-Object Xml.XmlDocument; $x.PreserveWhitespace = $true; $x.LoadXml($raw)
    $o = $x.DocumentElement
    $diff = New-Object System.Collections.ArrayList
    $set = {
        param([string]$xpath, [string]$value, [bool]$create)
        $n = $o.SelectSingleNode($xpath)
        if (-not $n) {
            if (-not $create -or $xpath.Contains('/')) { return }
            $n = $x.CreateElement($xpath); [void]$o.AppendChild($x.CreateTextNode('  ')); [void]$o.AppendChild($n); [void]$o.AppendChild($x.CreateTextNode("`r`n"))
            [void]$diff.Add("$xpath (new) = '$value'"); $n.InnerText = $value; return
        }
        if ($n.InnerText -ne $value) { [void]$diff.Add("$xpath '$($n.InnerText)' -> '$value'"); $n.InnerText = $value }
    }
    # login: only when it really differs (logins are case-insensitive; an imported "MyLogin" stays as L2Swarm saved it)
    $nameNode = $o.SelectSingleNode('Name')
    if (-not $nameNode -or $nameNode.InnerText.ToLower() -ne $a.login) { & $set 'Name' $a.login $false }
    if ($a.character) { & $set 'SelectedCharacter' $a.character $false }
    # 2026-10-10: L2Swarm 3.8.14 validates the account file ("does not match the internal schema ... /Option/LastLoadedUtc ... not a valid
    # DateTime"); older SETUP / release templates left this element EMPTY -> give it a valid date
    $ll = $o.SelectSingleNode('LastLoadedUtc'); if ($ll -and -not $ll.InnerText.Trim()) { & $set 'LastLoadedUtc' '2000-01-01T00:00:00Z' $false }
    & $set 'Group' (GroupOf $a) $true
    if ($loginIp) { & $set 'LoginServerIP' $loginIp $false }
    if ($loginPort) { & $set 'LoginServerPort' $loginPort $false }
    if ($serverId) { & $set 'SelectedServer/id' $serverId $false }
    # client path: only where it is set already (re-rooted) or where the character plays in game (Hook needs it)
    $exeNode = $o.SelectSingleNode('L2ExePath')
    if ($l2Client -and (($a.clientMode -eq 'ingame') -or ($exeNode -and $exeNode.InnerText))) { & $set 'L2ExePath' $l2Client ($a.clientMode -eq 'ingame') }
    $isLeader = $a.character -and ($a.party -eq $a.character)
    if ($isLeader) { & $set 'ActiveFollow' 'false' $false }
    elseif ($a.party) {
        & $set 'ActiveFollow' 'true' $false
        & $set 'FollowName' $a.party $false
        # assist on/off only for a known role (an imported account without a role keeps its own FollowAtk)
        if ($a.role) { & $set 'FollowAtk' $(if ($healers -contains $a.role) { 'false' } else { 'true' }) $false }
    }
    # zone file + script paths: re-rooted to this machine
    $z = $o.SelectSingleNode('ZmapLocation')
    if ($z -and $z.InnerText) { $leaf = Split-Path $z.InnerText -Leaf; $want = Join-Path $settings $leaf; if ((Test-Path $want) -and $z.InnerText -ne $want) { [void]$diff.Add("ZmapLocation '$($z.InnerText)' -> '$want'"); $z.InnerText = $want } }
    $sl = $o.SelectSingleNode('ScriptsList')
    if ($sl) {
        $have = @{}
        foreach ($s in @($sl.SelectNodes('Script'))) {
            $pn = $s.SelectSingleNode('Path'); if (-not $pn) { continue }
            $leaf = Split-Path $pn.InnerText -Leaf; $have[$leaf.ToLower()] = $true
            $want = Join-Path $root "Scripts\$leaf"
            if ($pn.InnerText -ne $want) { [void]$diff.Add("Script path '$($pn.InnerText)' -> '$want'"); $pn.InnerText = $want }
        }
        foreach ($sc in $scriptsWanted) {
            if ($have[$sc.ToLower()]) { continue }
            $e = $x.CreateElement('Script')
            foreach ($kv in @(@('IsEnabled', 'true'), @('guid', [guid]::NewGuid().ToString()), @('Name', $sc), @('Path', (Join-Path $root "Scripts\$sc")))) { $c = $x.CreateElement($kv[0]); $c.InnerText = $kv[1]; [void]$e.AppendChild($c) }
            [void]$sl.AppendChild($e); [void]$diff.Add("Script $sc added")
        }
    }
    if ($write -and $diff.Count) { Backup $file; [IO.File]::WriteAllText($file, $x.OuterXml, $te.Enc) }
    return , $diff
}

$groupsBefore = @{}; $groupsAfter = @{}
foreach ($a in $active) {
    $grp = GroupOf $a
    if (-not $groupsAfter[$grp]) { $groupsAfter[$grp] = @() }; $groupsAfter[$grp] += $(if ($a.character) { $a.character } else { "($($a.login))" })
    if (Test-Path $a.path) {
        $old = ''; try { $t = (Get-TextEnc $a.path).Text; if ($t -match '<Group>([^<]*)</Group>') { $old = $Matches[1] } } catch { }
        if (-not $groupsBefore[$old]) { $groupsBefore[$old] = @() }; $groupsBefore[$old] += $a.character
        $diff = Set-AccountXml $a.path $a $false
        if ($diff.Count) { Change 'accounts' ("Settings\$($a.config) ($($a.login) / $($a.character)): " + ($diff -join '; ')) 'account' $a }
    } else {
        $tpl = TemplateFor $a.role
        $envName = 'SWARM_PW_' + ($a.login.ToUpper() -replace '[^A-Z0-9]', '_')
        Change 'accounts' "CREATE Settings\$($a.config) ($($a.login) / $($a.character), role $($a.role)) from $(Split-Path $tpl -Leaf) - password from env $envName / SWARM_PASSWORD or a hidden prompt" 'newaccount' @($a, $tpl, $envName)
    }
}
function New-AccountConfig($a, [string]$tpl, [string]$envName) {
    if (-not (Test-Path $tpl)) { throw "template $tpl missing" }
    $pwEnv = if ([Environment]::GetEnvironmentVariable($envName)) { $envName } elseif ($env:SWARM_PASSWORD) { 'SWARM_PASSWORD' } else { '' }
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $newAccountPs, '-Login', $a.login, '-Template', $tpl, '-OutFile', $a.path)
    if ($a.character) { $argList += @('-Character', $a.character) }
    if ($pwEnv) { $argList += @('-PasswordEnv', $pwEnv) }
    & powershell @argList | Out-Host
    if (Test-Path $a.path) { [void](Set-AccountXml $a.path $a $true) } else { throw "creating $($a.path) failed" }
}

# ---------------------------------------------------------------- settings.xml: AutoStart + MCP
$sx = Join-Path $settings 'settings.xml'
$sxNew = -not (Test-Path $sx)
if ($sxNew) {
    # a fresh L2Swarm folder has no settings.xml until L2Swarm ran once: write L2Swarm's defaults + MCP on (L2Swarm adds the rest on start)
    $sxDefault = "<?xml version=`"1.0`" encoding=`"utf-8`"?>`r`n<GlobalConfig>`r`n  <Mcp>`r`n    <Enabled>true</Enabled>`r`n    <Port>$mcpPort</Port>`r`n  </Mcp>`r`n  <MinimumLogLevel>INFO</MinimumLogLevel>`r`n  <AutoStartEntries />`r`n</GlobalConfig>`r`n"
    Change 'settings.xml' 'create Settings\settings.xml (L2Swarm has not run here yet: MCP server on, AutoStart list below)' $null
}
if ((Test-Path $sx) -or $sxNew) {
    $sxText = if ($sxNew) { $sxDefault } else { [IO.File]::ReadAllText($sx) }
    $curEntries = @([regex]::Matches($sxText, '<AutoStartEntry configPath="([^"]+)" enabled="([^"]+)"') | ForEach-Object { "$($_.Groups[1].Value)|$($_.Groups[2].Value)" })
    $wantList = @($active | Where-Object { $_.autoStart } | ForEach-Object { $_.path })
    $wantEntries = @($wantList | ForEach-Object { "$_|false" })
    $newText = $sxText
    if (($curEntries -join "`n") -ne ($wantEntries -join "`n")) {
        $nl = "`r`n"
        $block = '<AutoStartEntries>' + $nl + (($wantList | ForEach-Object { '    <AutoStartEntry configPath="' + [Security.SecurityElement]::Escape($_) + '" enabled="false" />' }) -join $nl) + $nl + '  </AutoStartEntries>'
        $blockRx = $block.Replace('$', '$$')   # literal replacement text
        if ($newText -match '(?s)<AutoStartEntries>.*?</AutoStartEntries>') { $newText = [regex]::Replace($newText, '(?s)<AutoStartEntries>.*?</AutoStartEntries>', $blockRx) }
        elseif ($newText -match '<AutoStartEntries\s*/>') { $newText = [regex]::Replace($newText, '<AutoStartEntries\s*/>', $blockRx) }
        else { $newText = $newText.Replace('</GlobalConfig>', '  ' + $block + $nl + '</GlobalConfig>') }
        $curPaths = @($curEntries | ForEach-Object { $_.Split('|')[0] })
        $added = @($wantList | Where-Object { $curPaths -notcontains $_ }); $removed = @($curPaths | Where-Object { $wantList -notcontains $_ })
        # an entry whose file name stays but whose folder changes (install copied to another folder/PC) counts as "re-rooted"
        $curLeaves = @($curPaths | ForEach-Object { (Split-Path $_ -Leaf).ToLower() })
        $wantLeaves = @($wantList | ForEach-Object { (Split-Path $_ -Leaf).ToLower() })
        $moved = @($removed | Where-Object { $wantLeaves -contains (Split-Path $_ -Leaf).ToLower() })
        $gone = @($removed | Where-Object { $wantLeaves -notcontains (Split-Path $_ -Leaf).ToLower() })
        $new = @($added | Where-Object { $curLeaves -notcontains (Split-Path $_ -Leaf).ToLower() })
        $msg = "AutoStart list -> $($wantList.Count) entries (enabled=false, staggered login by l2swarm_ctl.ps1)"
        if ($new.Count) { $msg += "; add: " + (@($new | ForEach-Object { Split-Path $_ -Leaf }) -join ', ') }
        if ($moved.Count) { $msg += "; $($moved.Count) path(s) re-rooted from $(Split-Path $moved[0]) to $settings" }
        if ($gone.Count) { $msg += "; remove: " + (@($gone | ForEach-Object { Split-Path $_ -Leaf }) -join ', ') }
        if (-not $new.Count -and -not $moved.Count -and -not $gone.Count) { $msg += '; order / enabled flags only' }
        Change 'settings.xml' $msg $null
    }
    if ($newText -match '(?s)<Mcp>.*?<Port>(\d+)</Port>') { if ($Matches[1] -ne $mcpPort) { Change 'settings.xml' "MCP port $($Matches[1]) -> $mcpPort" $null; $newText = [regex]::Replace($newText, '(?s)(<Mcp>.*?<Port>)\d+(</Port>)', "`${1}$mcpPort`${2}") } }
    if ($newText -match '(?s)<Mcp>\s*<Enabled>false</Enabled>') { Change 'settings.xml' 'MCP server enabled' $null; $newText = [regex]::Replace($newText, '(?s)(<Mcp>\s*<Enabled>)false', '${1}true') }
    if ($newText -ne $sxText -or $sxNew) {
        Change 'settings.xml' '(write Settings\settings.xml)' 'write' @($sx, $newText, $(if ($sxNew) { $true } else { HasBom $sx }))
    }
    foreach ($l in @(Val $Cfg 'legacyConfigs' @())) { if ($sxText -match [regex]::Escape("\$l`"")) { Warn "legacy config $l is in the AutoStart list (it is removed by -Apply)" } }
}

# ---------------------------------------------------------------- client_mode.json / login_gap.txt / dashboard key
$cmFile = Join-Path $settings 'client_mode.json'
$cmWant = [ordered]@{}; foreach ($a in $active) { if ($a.clientMode -and $a.character) { $cmWant[$a.character] = $a.clientMode } }
$cmWantJson = ($cmWant | ConvertTo-Json -Compress); if (-not $cmWant.Count) { $cmWantJson = '{}' }
$cmCur = ''; if (Test-Path $cmFile) { try { $cmCur = ((Get-Content $cmFile -Raw | ConvertFrom-Json) | ConvertTo-Json -Compress) } catch { $cmCur = '?' } }
if ($cmCur -ne $cmWantJson) { Change 'client mode' "Settings\client_mode.json '$cmCur' -> '$cmWantJson'" 'write' @($cmFile, $cmWantJson, $false) }

$gap = [string](Val $Cfg 'login.gapSeconds' '')
if ($gap) {
    $gf = Join-Path $settings 'login_gap.txt'; $gcur = ''; if (Test-Path $gf) { $gcur = (Get-Content $gf -Raw).Trim() }
    if ($gcur -ne $gap) { Change 'login' "Settings\login_gap.txt '$gcur' -> '$gap' (seconds between two logins)" 'write' @($gf, $gap, $false) }
}
$keyFile = Join-Path $root ([string](Val $Cfg 'dashboard.keyFile' 'Dashboard\key.txt'))
if (-not (Test-Path $keyFile)) {
    $kb = New-Object byte[] 12; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($kb)
    Change 'dashboard' "create $keyFile (random key for phone/LAN access to the dashboard)" 'write' @($keyFile, (($kb | ForEach-Object { $_.ToString('x2') }) -join ''), $false)
}

# ---------------------------------------------------------------- scheduled tasks
if (-not $SkipTasks) {
    $vbs = Join-Path $root 'docs\plan\tools\run_hidden.vbs'
    foreach ($t in 'Start', 'Stop', 'Restart', 'MemWatch') {
        $arg = if ($t -eq 'MemWatch') { 'watch' } else { $t.ToLower() }
        $wantArgs = "`"$vbs`" $arg"
        $cur = Get-ScheduledTask -TaskName "L2Swarm $t" -ErrorAction SilentlyContinue
        $curArgs = if ($cur) { (@($cur.Actions)[0]).Arguments } else { '' }
        if ($curArgs -eq $wantArgs) { continue }
        Change 'tasks' ("task 'L2Swarm $t': " + $(if ($cur) { "'$curArgs' -> '$wantArgs'" } else { "create (wscript.exe $wantArgs)" })) 'task' @($t, $wantArgs)
    }
}
function Register-SwarmTask([string]$tn, [string]$wa) {
    # same settings as docs\plan\tools\pc_alwayson.ps1: elevated, as the logged-on user, no UAC prompt when triggered with schtasks /run
    $user = (Get-CimInstance Win32_ComputerSystem).UserName; if (-not $user) { $user = "$env:USERDOMAIN\$env:USERNAME" }
    $prn = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
    $tset = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    $act = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument $wa
    if ($tn -eq 'MemWatch') {
        $trg = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
        Register-ScheduledTask -TaskName "L2Swarm $tn" -Action $act -Trigger $trg -Principal $prn -Settings $tset -Force | Out-Null
    } else {
        Register-ScheduledTask -TaskName "L2Swarm $tn" -Action $act -Principal $prn -Settings $tset -Force | Out-Null
    }
}
function Invoke-Change($c) {
    switch ($c.Kind) {
        'mkdir'      { New-Item -ItemType Directory -Force $c.Data | Out-Null }
        'copy'       { New-Item -ItemType Directory -Force (Split-Path $c.Data[1]) | Out-Null; Copy-Item $c.Data[0] $c.Data[1] }
        'template'   { New-Template $c.Data[0] $c.Data[1] }
        'account'    { [void](Set-AccountXml $c.Data.path $c.Data $true) }
        'newaccount' { New-AccountConfig $c.Data[0] $c.Data[1] $c.Data[2] }
        'write'      { $f = $c.Data[0]; Backup $f; New-Item -ItemType Directory -Force (Split-Path $f) | Out-Null; WriteText $f ([string]$c.Data[1]) ([bool]$c.Data[2]) }
        'task'       { Register-SwarmTask $c.Data[0] $c.Data[1] }
        'images'     { if (-not (Invoke-Images $c.Data)) { throw 'image generation failed (see above)' } }
    }
}

# ---------------------------------------------------------------- swarm.js: roster comes from the config at script start
foreach ($js in @($liveJs, $devJs)) {
    if (-not (Test-Path $js)) { continue }
    if (-not (Select-String -Path $js -Pattern 'SWARM_CFG' -SimpleMatch -Quiet)) {
        Warn "$($js.Substring($root.Length + 1)) does not read swarm.config.json yet (no SWARM_CFG) - its hardcoded CONFIG.roster/teams are used; deploy Scripts_dev\swarm.js"
    }
}

# ---------------------------------------------------------------- report
Write-Host ''
Write-Host 'L2Swarm groups (one per party):' -ForegroundColor Cyan
foreach ($g in ($groupsAfter.Keys | Sort-Object)) { Write-Host ("  {0,-22} {1,2}  {2}" -f $g, $groupsAfter[$g].Count, ($groupsAfter[$g] -join ', ')) }
Write-Host '  now in the configs:'
foreach ($g in ($groupsBefore.Keys | Sort-Object)) { Write-Host ("  {0,-22} {1,2}" -f $(if ($g) { $g } else { '(none)' }), $groupsBefore[$g].Count) }
$legacy = @(Val $Cfg 'legacyConfigs' @())
if ($legacy.Count) { Write-Host "  not managed (legacyConfigs, left as they are): $($legacy -join ', ')" }

Write-Host ''
Write-Host "Changes ($($changes.Count)):" -ForegroundColor Cyan
if (-not $changes.Count) { Write-Host '  nothing to do - the install matches swarm.config.json' }
foreach ($c in $changes) { Write-Host ("  [{0}] {1}" -f $c.Area, $c.Text) }
if ($warnings.Count) {
    Write-Host ''
    Write-Host "Warnings ($($warnings.Count)):" -ForegroundColor Yellow
    foreach ($w in $warnings) { Write-Host "  ! $w" }
}

if (-not $Apply) {
    Write-Host ''
    Write-Host 'DRY RUN - nothing was changed. Stop L2Swarm (schtasks /run /tn "L2Swarm Stop") and run SETUP.cmd -Apply to apply.' -ForegroundColor Green
    Write-Host "Claude Code MCP (once per PC):  claude mcp add --transport http --scope user l2swarm-mcp http://127.0.0.1:$mcpPort"
    if ($Patch -and (Test-Path $patcher)) { Write-Host ''; Write-Host 'optional patch (dry run):' -ForegroundColor Cyan; & powershell -NoProfile -ExecutionPolicy Bypass -File $patcher -Root $root }
    exit 0
}
if ($running -and -not $Force) {
    Write-Host ''
    Write-Host 'L2Swarm.exe is running: it keeps its own copy of settings.xml and the account configs in memory and saves them back,' -ForegroundColor Red
    Write-Host 'which would undo these changes. Stop it first (schtasks /run /tn "L2Swarm Stop"), or use -Force if you know what you do.' -ForegroundColor Red
    exit 2
}
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host ''
Write-Host "Applying (backups in $backupDir) ..." -ForegroundColor Cyan
$failed = 0
foreach ($c in $changes) {
    if (-not $c.Kind) { continue }
    if ($c.Kind -eq 'task' -and -not $isAdmin) { Write-Host "  skipped (needs admin - run SETUP.cmd -Apply, it asks for admin): $($c.Text)" -ForegroundColor Yellow; continue }
    try { Invoke-Change $c; Write-Host "  done: [$($c.Area)] $($c.Text)" } catch { $failed++; Write-Host "  FAILED: [$($c.Area)] $($c.Text): $_" -ForegroundColor Red }
}
Write-Host ''
if ($failed) { Write-Host "$failed change(s) failed - see above." -ForegroundColor Red; exit 3 }
if ($Patch) {
    if (-not (Test-Path $patcher)) { Write-Host 'no patches\universal\apply_patch.ps1 in this folder - patch skipped (the swarm runs without it)' -ForegroundColor Yellow }
    else {
        Write-Host 'applying the optional patch (patches\universal) ...' -ForegroundColor Cyan
        & powershell -NoProfile -ExecutionPolicy Bypass -File $patcher -Apply -Root $root
        if ($LASTEXITCODE -ne 0) { Write-Host "the patch was NOT applied (exit $LASTEXITCODE, see above) - everything else is done; the swarm also runs on a plain L2Swarm." -ForegroundColor Yellow }
    }
}
Write-Host 'Done. Start L2Swarm with:  schtasks /run /tn "L2Swarm Start"   (logs every account in, one by one)' -ForegroundColor Green
