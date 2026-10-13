# kill_process.ps1 - closes ONE process that a normal shell cannot close because it runs elevated (user 2026-10-13: "make the KillProcess task").
# Runs from the elevated scheduled task "L2Swarm KillProcess" (registered once by register_killprocess_task.ps1). Never closes anything by itself:
#   1. the caller writes Logs\kill_request.json   { "pid": 1234, "why": "crashed client" }
#   2. schtasks /run /tn "L2Swarm KillProcess"
#   3. result in Logs\kill_result.json, every request + answer in Logs\kill_process.log
# ALLOW LIST (nothing else is ever closed):
#   l2.exe                         a game client (crashed / stuck hooked client)
#   find.exe grep.exe tail.exe sed.exe awk.exe xargs.exe  Git-for-Windows tools left running by a hung search / watch
#   node.exe                       only when its command line runs a file under the L2Swarm folder
# NEVER: L2Swarm.exe (use the Stop / Restart tasks), the dashboard's own server.js, system processes, anything else.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..\..").Path
$reqF = Join-Path $root 'Logs\kill_request.json'
$resF = Join-Path $root 'Logs\kill_result.json'
$logF = Join-Path $root 'Logs\kill_process.log'
function Log($m) { Add-Content -Path $logF -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" }
function Done($ok, $msg, $procId) {
    Log $msg
    [ordered]@{ ok = $ok; msg = $msg; pid = $procId; at = (Get-Date).ToString('s') } | ConvertTo-Json | Set-Content -Path $resF -Encoding UTF8
    Remove-Item $reqF -Force -ErrorAction SilentlyContinue
    exit 0
}
if (-not (Test-Path $reqF)) { Log 'no request file - nothing to do'; exit 0 }
try { $req = Get-Content $reqF -Raw | ConvertFrom-Json } catch { Done $false "request unreadable: $($_.Exception.Message)" 0 }
$procId = 0; try { $procId = [int]$req.pid } catch { }
$why = [string]$req.why
if ($procId -le 4) { Done $false "refused: no valid pid in the request ($($req.pid))" $procId }
$p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
if (-not $p) { Done $true "pid $procId is not running (nothing to do) - why: $why" $procId }
$name = [string]$p.Name; $cmd = [string]$p.CommandLine
$tools = @('find.exe', 'grep.exe', 'tail.exe', 'sed.exe', 'awk.exe', 'xargs.exe')
$allowed = $false; $reason = ''
if ($name -ieq 'l2.exe') { $allowed = $true; $reason = 'game client' }
elseif ($tools -contains $name.ToLower()) { $allowed = $true; $reason = 'leftover shell tool' }
elseif ($name -ieq 'node.exe') {
    if ($cmd -match [regex]::Escape($root) -and $cmd -notmatch '(?i)\\Dashboard\\server\.js') { $allowed = $true; $reason = 'node script under the L2Swarm folder' }
    else { $reason = 'node.exe outside the L2Swarm folder, or the dashboard server itself (restart it the normal way)' }
}
else { $reason = "$name is not on the allow list" }
if (-not $allowed) { Done $false "REFUSED pid $procId ($name): $reason - why given: $why - cmd: $($cmd.Substring(0, [Math]::Min(160, $cmd.Length)))" $procId }
try {
    Stop-Process -Id $procId -Force -ErrorAction Stop
    Start-Sleep -Milliseconds 800
    $still = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($still) { Done $false "pid $procId ($name) did not exit after Stop-Process - why: $why" $procId }
    Done $true "closed pid $procId ($name, $reason) - why: $why - cmd: $($cmd.Substring(0, [Math]::Min(160, $cmd.Length)))" $procId
} catch { Done $false "close of pid $procId ($name) failed: $($_.Exception.Message) - why: $why" $procId }
