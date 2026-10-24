# TIME SYNC (owner 2026-10-24: "Make sure we have source of truth with time and clock", "fix the drift so it never happens").
# Found: the Windows Time service (w32time) was STOPPED and set to manual start -> the PC clock was ~25 s slow and drifting
# (raid respawn windows, the 06:30 daily reset, hunting timers, log times all follow this clock).
# The ONE time source for everything (L2Swarm, brain host, agents, dashboard, logs) is the Windows clock; this keeps it synced.
# Run ONCE as administrator (right-click -> Run with PowerShell as admin, or: SETUP_TIME_SYNC.cmd):
#   - w32time start = automatic + started
#   - NTP peers time.windows.com + pool.ntp.org, resync now
#   - scheduled task "L2Swarm TimeSync" (SYSTEM, at startup + every hour): w32tm /resync
#   -Check = only report the offset (no admin needed)
#   -Auto  = called by l2swarm_ctl.ps1 watch (the elevated "L2Swarm MemWatch" task, every 2 min, on EVERY install incl. the public package):
#            at most once an hour: w32time automatic + running, NTP peers, w32tm /resync. Nobody has to click anything (owner 2026-10-24:
#            "I dont want to click things manually, also the public testers will never know to click anything").
param([switch]$Check, [switch]$Auto)
$ErrorActionPreference = 'Continue'
if ($Auto) {
  $logs = Join-Path $PSScriptRoot '..\..\..\Logs'; $st = Join-Path $logs 'time_sync_last.txt'
  try { if ((Test-Path $st) -and ((Get-Date) - (Get-Item $st).LastWriteTime).TotalMinutes -lt 60) { return } } catch { }
  try {
    $s = Get-Service w32time -ErrorAction Stop; $msg = @()
    if ($s.StartType -ne 'Automatic') { sc.exe config w32time start= auto | Out-Null; $msg += 'service set to automatic' }
    if ($s.Status -ne 'Running') { Start-Service w32time -ErrorAction Stop; Start-Sleep 2; w32tm /config /manualpeerlist:"time.windows.com,0x9 pool.ntp.org,0x9" /syncfromflags:manual /reliable:no /update | Out-Null; $msg += 'service started + NTP peers set' }
    $r = (w32tm /resync /force 2>&1 | Out-String).Trim() -replace '\s+', ' '
    "$(Get-Date -Format s) time_sync auto: $(($msg + @("resync: $r")) -join '; ')" | Add-Content (Join-Path $logs 'time_sync.log')
    Set-Content $st (Get-Date -Format s)
  } catch { "$(Get-Date -Format s) time_sync auto ERROR: $_" | Add-Content (Join-Path $logs 'time_sync.log') }
  return
}
function Offset {
  try { $r = Invoke-WebRequest -Uri 'https://www.google.com' -Method Head -UseBasicParsing -TimeoutSec 8; $d = [DateTime]::Parse($r.Headers['Date']).ToUniversalTime(); return [Math]::Round(((Get-Date).ToUniversalTime() - $d).TotalSeconds, 1) } catch { return $null }
}
$before = Offset
Write-Host "clock offset now (PC - internet): $before s"
if ($Check) { $s = (Get-Service w32time -ErrorAction SilentlyContinue); Write-Host "w32time: $($s.Status) / $($s.StartType)"; exit 0 }
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host 'Run this as administrator (it changes a Windows service and adds a scheduled task).'; exit 1 }
sc.exe config w32time start= auto | Out-Null
Start-Service w32time
w32tm /config /manualpeerlist:"time.windows.com,0x9 pool.ntp.org,0x9" /syncfromflags:manual /reliable:no /update | Out-Null
Restart-Service w32time
Start-Sleep 2
w32tm /resync /force
$act = New-ScheduledTaskAction -Execute 'w32tm.exe' -Argument '/resync /force'
$trg = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)))
Register-ScheduledTask -TaskName 'L2Swarm TimeSync' -Action $act -Trigger $trg -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Start-Sleep 3
$after = Offset
Write-Host "clock offset after sync: $after s (was $before s); w32time automatic; task 'L2Swarm TimeSync' every hour"
"$(Get-Date -Format s) time_sync: before $before s, after $after s" | Add-Content (Join-Path $PSScriptRoot '..\..\..\Logs\time_sync.log')
