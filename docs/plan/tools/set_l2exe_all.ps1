# Sets <L2ExePath> in every account config, so "Client: In game" (L2Swarm Hook) works for every account (owner 2026-11-11:
# "make sure that ALL accounts work in game"; 104 of 112 configs had an empty <L2ExePath />, the Hook then opens a modal
# "Select L2.exe" dialog and client_mode / the dashboard refuse the switch).
#   Open accounts : MCP manage_account_config modify {L2ExePath} + save (own file) - no logout, L2Swarm keeps it in memory too.
#   Closed configs: the XML node is set on disk (L2Swarm does not hold them). Password nodes are never read out or changed.
# Backup of every config first: Settings\backup\<stamp>_l2exe\.
#   -Only <name>   just that config (file base name or character), -DryRun   report only
param([string]$Only = '', [switch]$DryRun, [string]$Exe = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$set = Join-Path $root 'Settings'
if (-not $Exe) { try { $Exe = (Get-Content -Raw (Join-Path $root 'swarm.config.json') | ConvertFrom-Json).paths.l2Client } catch { } }
if (-not $Exe) { $Exe = 'C:\Lineage2\system\l2.exe' }
if (-not (Test-Path $Exe)) { Write-Host "client not found: $Exe" -ForegroundColor Red; exit 1 }
$mcpPort = 8083

function Mcp($tool, $args2) {
    $body = @{ jsonrpc = '2.0'; id = 1; method = 'tools/call'; params = @{ name = $tool; arguments = $args2 } } | ConvertTo-Json -Depth 8 -Compress
    $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$mcpPort" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 60
    $j = $r.Content | ConvertFrom-Json
    if ($j.error) { throw "MCP $tool error: $($j.error.message)" }
    $t = ($j.result.content | ForEach-Object { $_.text }) -join "`n"
    if ($j.result.isError) { throw "MCP $tool failed: $t" }
    return $t
}
function ExeOf($file) { $t = [IO.File]::ReadAllText($file); $m = [regex]::Match($t, '<L2ExePath>([^<]*)</L2ExePath>'); if ($m.Success) { $m.Groups[1].Value } else { '' } }

# open accounts: config path -> account id
$open = @{}
try {
    $st = Mcp 'get_accounts_status' @{}
    $acc = ($st | ConvertFrom-Json)
    $list = if ($acc -is [array]) { $acc } elseif ($acc.accounts) { $acc.accounts } else { @($acc) }   # the status is a plain array (member enumeration made .accounts look set)
    foreach ($a in $list) {
        $cp = $a.config_path; if (-not $cp) { $cp = $a.configPath }
        $id = $a.account_id; if (-not $id) { $id = $a.id }
        if ($cp -and $id) { $open[[IO.Path]::GetFullPath(($cp -replace '^C:\\L2\\', 'C:\RainbowControl\l2\')).ToLower()] = $id }
    }
} catch { Write-Host "MCP not reachable ($($_.Exception.Message)) - only closed configs could be edited; stopping." -ForegroundColor Red; exit 1 }
Write-Host "open accounts in L2Swarm: $($open.Count)"

$files = Get-ChildItem $set -Filter *.xml | Where-Object { $_.Name -ne 'settings.xml' }
if ($Only) { $files = $files | Where-Object { $_.BaseName -ieq $Only -or ([IO.File]::ReadAllText($_.FullName) -match "<SelectedCharacter>$([regex]::Escape($Only))<") } }
$todo = @($files | Where-Object { $e = ExeOf $_.FullName; -not $e -or -not (Test-Path $e) })
Write-Host "configs: $(@($files).Count), missing / invalid L2ExePath: $($todo.Count)"
if ($DryRun) { $todo | ForEach-Object { $k = $_.FullName.ToLower(); "  $($_.Name)  $(if ($open.ContainsKey($k)) { 'open (MCP)' } else { 'closed (file)' })" }; exit 0 }
if ($todo.Count -eq 0) { exit 0 }

$bak = Join-Path $set ('backup\' + (Get-Date -Format 'yyyy-MM-dd_HHmmss') + '_l2exe')
New-Item -ItemType Directory -Force $bak | Out-Null
$todo | ForEach-Object { Copy-Item $_.FullName $bak }
Write-Host "backup: $bak"

$ok = 0; $bad = @()
foreach ($f in $todo) {
    $k = $f.FullName.ToLower()
    try {
        if ($open.ContainsKey($k)) {
            $id = $open[$k]
            Mcp 'manage_account_config' @{ account_id = $id; action = 'modify'; properties = @{ L2ExePath = $Exe } } | Out-Null
            Mcp 'manage_account_config' @{ account_id = $id; action = 'save' } | Out-Null
            Start-Sleep -Milliseconds 300
            $how = 'MCP'
        } else {
            # text replace in the file's REAL encoding: some configs declare utf-16 but are stored as UTF-8 without BOM
            # (XmlDocument.Load refuses them); never touches any other node
            $bytes = [IO.File]::ReadAllBytes($f.FullName)
            if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { $enc = New-Object Text.UnicodeEncoding($false, $true) }
            elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { $enc = New-Object Text.UTF8Encoding($true) }
            else { $enc = New-Object Text.UTF8Encoding($false) }
            $txt = [IO.File]::ReadAllText($f.FullName, $enc)
            $rx = [regex]'<L2ExePath\s*/>|<L2ExePath>[^<]*</L2ExePath>'
            if (-not $rx.IsMatch($txt)) { throw 'no <L2ExePath> node (not appended: 3.10 checks the element order)' }
            $safe = [Security.SecurityElement]::Escape($Exe)
            $txt = $rx.Replace($txt, { param($m) "<L2ExePath>$safe</L2ExePath>" }, 1)
            [IO.File]::WriteAllText($f.FullName, $txt, $enc)
            $how = 'file'
        }
        $now = ExeOf $f.FullName
        if ($now -ieq $Exe) { $ok++; Write-Host "  OK   $($f.Name) ($how)" } else { $bad += $f.Name; Write-Host "  FAIL $($f.Name) ($how): file still says '$now'" -ForegroundColor Red }
    } catch { $bad += $f.Name; Write-Host "  FAIL $($f.Name): $($_.Exception.Message)" -ForegroundColor Red }
}
Write-Host "done: $ok OK, $($bad.Count) failed $($bad -join ', ')"
if ($bad.Count) { exit 2 }
