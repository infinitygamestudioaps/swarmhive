# uninstall.ps1 - STOPALL-2026-11-17 (tester LuckyStrikz: "we should have an 'uninstall' cmd to stop/remove all process so the computer isnt
# constantly running the dashboard when you are trying to move it to a new pc"). Called by STOP_ALL.cmd / UNINSTALL.cmd (as admin).
#   -Mode stop       close L2Swarm + this install's node processes (dashboard, brain host, path finder) and DISABLE the keep-alive tasks
#                    ("L2Swarm MemWatch", "L2Swarm Dashboard") so nothing starts them again. Start them again: SETUP.cmd (or Task Scheduler).
#   -Mode uninstall  the same, then DELETE every scheduled task named "L2Swarm *" (Start, Stop, Restart, MemWatch, Dashboard, KillProcess,
#                    TimeSync). Files are never deleted - delete the folder yourself afterwards. Power / Windows Update: docs\plan\tools\pc_restore.ps1.
param([ValidateSet('stop', 'uninstall')][string]$Mode = 'stop')
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$log = Join-Path $root 'Logs\uninstall.log'
New-Item -ItemType Directory -Force (Join-Path $root 'Logs') | Out-Null
function Say($m) { $l = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"; Add-Content -Path $log -Value $l -Encoding UTF8; Write-Output $l }
function Tasks { @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like 'L2Swarm *' }) }

Say "=== $Mode ($root)"
# 1) keep-alives off first, so nothing restarts what we close
foreach ($t in Tasks) {
    if ($Mode -eq 'uninstall' -or $t.TaskName -in @('L2Swarm MemWatch', 'L2Swarm Dashboard')) {
        try { Disable-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath -ErrorAction Stop | Out-Null; Say "task disabled: $($t.TaskName)" } catch { Say "task NOT disabled: $($t.TaskName) ($($_.Exception.Message))" }
    }
}
# 2) L2Swarm: its own Stop task (clean logout), else close it
New-Item -ItemType File -Force (Join-Path $root 'Logs\l2swarm_stopped.flag') | Out-Null
if (Get-ScheduledTask -TaskName 'L2Swarm Stop' -ErrorAction SilentlyContinue) {
    try { Start-ScheduledTask -TaskName 'L2Swarm Stop'; Say 'L2Swarm Stop task started' } catch { }
    for ($i = 0; $i -lt 20 -and (Get-Process L2Swarm -ErrorAction SilentlyContinue); $i++) { Start-Sleep 1 }
}
$l2 = @(Get-Process L2Swarm -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) })
foreach ($p in $l2) { try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; Say "L2Swarm closed (pid $($p.Id))" } catch { Say "L2Swarm NOT closed (pid $($p.Id)): $($_.Exception.Message)" } }
# 3) this install's node processes (same rule as clean_update.ps1: the dashboard port, command lines inside this folder, the helpers, children)
$all = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue)
$ids = New-Object System.Collections.ArrayList
$dport = 8090; try { $cfg = Get-Content (Join-Path $root 'swarm.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json; if ($cfg.dashboard.port) { $dport = [int]$cfg.dashboard.port } } catch { }
try { $lst = Get-NetTCPConnection -LocalPort $dport -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($lst -and ($all | Where-Object { $_.ProcessId -eq $lst.OwningProcess })) { [void]$ids.Add([int]$lst.OwningProcess) } } catch { }
foreach ($p in $all) { $c = [string]$p.CommandLine; if ($c -and ($c.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or $c -match 'brain_host|geopath_service|pool\.js')) { if (-not $ids.Contains([int]$p.ProcessId)) { [void]$ids.Add([int]$p.ProcessId) } } }
$more = $true
while ($more) { $more = $false; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) { [void]$ids.Add([int]$p.ProcessId); $more = $true } } }
foreach ($id in $ids) { $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; & taskkill /PID $id /T /F 2>$null | Out-Null; $ErrorActionPreference = $eap; Say "node closed (pid $id)" }
if (-not $ids.Count) { Say 'no node process of this install was running' }
# 4) uninstall: delete the tasks
if ($Mode -eq 'uninstall') {
    foreach ($t in Tasks) { try { Unregister-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath -Confirm:$false -ErrorAction Stop; Say "task deleted: $($t.TaskName)" } catch { Say "task NOT deleted: $($t.TaskName) ($($_.Exception.Message))" } }
    Say 'Done. Nothing starts again. You can now delete or move this folder. Power / Windows Update settings: run docs\plan\tools\pc_restore.ps1 as admin.'
} else {
    Say 'Done. Everything is stopped and the keep-alive tasks are disabled. Start again: run SETUP.cmd (it re-creates and enables the tasks).'
}
