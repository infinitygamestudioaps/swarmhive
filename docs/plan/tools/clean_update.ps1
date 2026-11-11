# clean_update.ps1 - CLEANUPDATE-2026-11-11 (owner: "It should stop everything and update so we make sure its updated correctly").
# Used on a PACKAGE install (no docs\requirements) by deploy_swarm.ps1 - which is also what an OLD update.ps1 calls after it copied the new files:
#   -Action stop     close L2Swarm (its elevated Stop task, else a kill + Logs\l2swarm_stopped.flag) and every node process of this install with
#                    its whole tree (dashboard, brain host, path finder); remembers what ran in Logs\clean_update_state.json. Exit 1 = L2Swarm
#                    could not be closed (nothing may be copied then).
#   -Action finish   [-WaitPid <pid>] wait until that process (the running update.ps1) has ended, close any node a keep-alive / the old
#                    updater started meanwhile, start the dashboard and L2Swarm (when it ran before) again, check Scripts\swarm.js.
# Logs\update_running.flag makes dashboard_keepalive.ps1 wait (< 30 min). Log: Logs\clean_update.log.
# Test hooks (docs\plan\tools\test_pkg_deploy.js, never on a real install): PKGDEPLOY_DRY=1 = only log what would be done.
param([ValidateSet('stop', 'finish')][string]$Action = 'stop', [int]$WaitPid = 0)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$logf = Join-Path $root 'Logs\clean_update.log'
$flag = Join-Path $root 'Logs\update_running.flag'
$statef = Join-Path $root 'Logs\clean_update_state.json'
$dry = ($env:PKGDEPLOY_DRY -eq '1')
New-Item -ItemType Directory -Force (Join-Path $root 'Logs') | Out-Null
function Log($m) { $l = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"; Add-Content -Path $logf -Value $l -Encoding UTF8; Write-Output $l }
function TaskExists($n) { $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; & schtasks /query /tn $n 2>$null | Out-Null; $ok = ($LASTEXITCODE -eq 0); $ErrorActionPreference = $eap; return $ok }
function L2Running {
    if ($env:PKGDEPLOY_L2_RUNNING) { return ($env:PKGDEPLOY_L2_RUNNING -eq '1') }
    return [bool](Get-Process L2Swarm -ErrorAction SilentlyContinue)
}
function OurNodes {
    $all = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue)
    $ids = New-Object System.Collections.ArrayList
    $dport = 8090; try { $cfg = Get-Content (Join-Path $root 'swarm.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json; if ($cfg.dashboard.port) { $dport = [int]$cfg.dashboard.port } } catch { }
    try { $l = Get-NetTCPConnection -LocalPort $dport -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($l -and ($all | Where-Object { $_.ProcessId -eq $l.OwningProcess })) { [void]$ids.Add([int]$l.OwningProcess) } } catch { }
    foreach ($p in $all) { $c = [string]$p.CommandLine; if ($c -and ($c.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or $c -match 'brain_host|geopath_service|pool\.js')) { if (-not $ids.Contains([int]$p.ProcessId)) { [void]$ids.Add([int]$p.ProcessId) } } }
    $more = $true
    while ($more) { $more = $false; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) { [void]$ids.Add([int]$p.ProcessId); $more = $true } } }
    return @($ids)
}
function KillOurNodes {
    $ids = @(OurNodes)
    if ($dry) { Log "dry: would close $($ids.Count) node process(es)" | Out-Null; return $ids.Count }
    foreach ($id in $ids) { $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; & taskkill /PID $id /T /F 2>$null | Out-Null; $ErrorActionPreference = $eap }
    Start-Sleep 2
    return $ids.Count
}

if ($Action -eq 'stop') {
    # safety: only an L2Swarm folder (L2Swarm.exe next to it) may close L2Swarm / node processes for real (a test folder never does)
    if (-not $dry -and -not (Test-Path (Join-Path $root 'L2Swarm.exe'))) { Log "stop: REFUSED - $root has no L2Swarm.exe (not an L2Swarm install folder)"; exit 1 }
    Set-Content -LiteralPath $flag (Get-Date -Format s)
    $wasL2 = L2Running
    $wasDash = (@(OurNodes).Count -gt 0)
    ConvertTo-Json @{ wasL2 = $wasL2; wasDash = $wasDash; at = (Get-Date -Format s) } | Set-Content -LiteralPath $statef -Encoding UTF8
    if ($wasL2) {
        Log 'stop: closing L2Swarm so the update is loaded cleanly (characters log out; they log in again at the end)'
        if ($dry) { Log 'dry: would run the L2Swarm Stop task' }
        else {
            if (TaskExists 'L2Swarm Stop') { & schtasks /run /tn 'L2Swarm Stop' | Out-Null }
            else { Set-Content (Join-Path $root 'Logs\l2swarm_stopped.flag') (Get-Date -Format s); Get-Process L2Swarm -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
            $t = (Get-Date).AddSeconds(120); while ((Get-Process L2Swarm -ErrorAction SilentlyContinue) -and (Get-Date) -lt $t) { Start-Sleep 2 }
            if (Get-Process L2Swarm -ErrorAction SilentlyContinue) {
                Write-Host 'L2Swarm is still running (it runs as administrator) - close it yourself now; waiting 3 more minutes ...' -ForegroundColor Red
                $t = (Get-Date).AddMinutes(3); while ((Get-Process L2Swarm -ErrorAction SilentlyContinue) -and (Get-Date) -lt $t) { Start-Sleep 3 }
            }
            if (Get-Process L2Swarm -ErrorAction SilentlyContinue) { Remove-Item -LiteralPath $flag -ErrorAction SilentlyContinue; Log 'stop: FAILED - L2Swarm could not be closed'; exit 1 }
        }
        Log 'stop: L2Swarm closed'
    }
    $n = KillOurNodes
    Log "stop: closed $n node process(es) of this install"
    exit 0
}

# ---- finish
if ($WaitPid -gt 0) {
    $t = (Get-Date).AddMinutes(30)
    while ((Get-Process -Id $WaitPid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $t) { Start-Sleep 2 }
    Log "finish: the updater (pid $WaitPid) has ended"
}
$st = @{ wasL2 = $true; wasDash = $true }; try { $j = Get-Content -LiteralPath $statef -Raw | ConvertFrom-Json; $st.wasL2 = [bool]$j.wasL2; $st.wasDash = [bool]$j.wasDash } catch { }
[void](KillOurNodes)                     # whatever the old updater / a keep-alive started with the old code
Remove-Item -LiteralPath $flag -ErrorAction SilentlyContinue
if ($dry) { Log "dry: would start the dashboard and $(if ($st.wasL2) { 'L2Swarm' } else { 'not L2Swarm' })" }
else {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$root\Dashboard\start.cmd`"" -WorkingDirectory "$root\Dashboard" -WindowStyle Minimized
    Log 'finish: dashboard started'
    if ($st.wasL2) {
        if (TaskExists 'L2Swarm Start') { & schtasks /run /tn 'L2Swarm Start' | Out-Null; Log 'finish: L2Swarm Start task run (accounts log in one by one)' }
        else { Remove-Item (Join-Path $root 'Logs\l2swarm_stopped.flag') -ErrorAction SilentlyContinue; Log 'finish: no L2Swarm Start task - start L2Swarm yourself' }
    }
}
$h = { param($p) if (Test-Path -LiteralPath $p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash } else { '' } }
if ((& $h "$root\Scripts_dev\swarm.js") -eq (& $h "$root\Scripts\swarm.js")) { Log 'finish: bot script check OK - Scripts\swarm.js is the new version' }
else { Log 'finish: bot script check FAILED - Scripts\swarm.js is not the new version' }
Remove-Item -LiteralPath $statef -ErrorAction SilentlyContinue
exit 0
