# dashboard_keepalive.ps1 - keeps the dashboard (Dashboard\server.js, which also hosts the brain for every brain-hosted character) running.
# Registered as the scheduled task "L2Swarm Dashboard" (pc_alwayson.ps1): at logon + every 3 min, as the user, NOT elevated.
# Why (2026-10-16 09:08): the laptop shut down on a critical battery; MemWatch restarted L2Swarm, but nothing restarted the dashboard,
# so ~45 brain-hosted characters stood without swarm.js (party Destroyer3: 2 dead in a catacomb) until someone started it by hand.
# Does nothing while the dashboard answers. Log: Logs\dashboard_keepalive.log (only when it acts or fails).
param([int]$Port = 0, [switch]$Check)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$log  = Join-Path $root 'Logs\dashboard_keepalive.log'
function Log($m) { Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $m) -Encoding UTF8 }
if ($Port -le 0) {
    $Port = 8090
    try { $cfg = Get-Content (Join-Path $root 'swarm.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json; if ($cfg.dashboard.port) { $Port = [int]$cfg.dashboard.port } } catch {}
}
$up = $false
try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri "http://127.0.0.1:$Port/"; $up = ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) } catch { $up = $false }
if ($up) { if ($Check) { "dashboard answers on port $Port" }; exit 0 }
# not answering: a server.js process that is still starting (< 90 s old) gets time; a stale one is left alone too (it may be swapping) unless it is older than 10 min
$srv = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\.js' -and $_.CommandLine -notmatch 'brain_host|pool\.js|host\.js' })
if ($srv.Count -gt 0) {
    $age = ((Get-Date) - $srv[0].CreationDate).TotalSeconds
    if ($age -lt 90) { if ($Check) { "server.js pid $($srv[0].ProcessId) is $([int]$age) s old - still starting" }; exit 0 }
    if ($age -lt 600) { if ($Check) { "port $Port silent but server.js pid $($srv[0].ProcessId) is $([int]$age) s old - would wait" } else { Log "port $Port silent but server.js pid $($srv[0].ProcessId) is $([int]$age) s old - waiting" }; exit 0 }
    Log "port $Port silent and server.js pid $($srv[0].ProcessId) is $([int]($age/60)) min old - killing it (and its brain host children)"
    if ($Check) { exit 0 }
    try { Stop-Process -Id $srv[0].ProcessId -Force } catch { Log "kill failed: $_" }
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'brain_host' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }
    Start-Sleep 3
}
if ($Check) { "dashboard is DOWN on port $Port (would start node server.js)"; exit 1 }
Log "dashboard not answering on port $Port - starting node server.js"
Start-Process node -ArgumentList 'server.js' -WorkingDirectory (Join-Path $root 'Dashboard') -WindowStyle Hidden
Start-Sleep 15
try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri "http://127.0.0.1:$Port/"; Log "started: http $($r.StatusCode)" } catch { Log "started but no answer yet: $($_.Exception.Message)" }
