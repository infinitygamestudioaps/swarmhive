# Run ELEVATED. Makes the laptop a 24/7 bot host (2026-10-03, user request):
#  - lid close / sleep / hibernate / hybrid sleep / wake timers: do nothing (AC + battery, all power schemes)
#  - Wi-Fi + USB + network adapter power saving off
#  - Windows Update, Store auto-update, Delivery Optimization, automatic maintenance: off
# Backup of the previous state: Settings\backup\pc_2026-10-03\ . Undo: pc_restore.ps1
$ErrorActionPreference = 'Continue'
$bk  = "$((Resolve-Path "$PSScriptRoot\..\..\..").Path)\Settings\backup\pc_2026-10-03"
$out = "$bk\apply_report.txt"
New-Item -ItemType Directory -Force $bk | Out-Null
Start-Transcript -Path $out -Force | Out-Null

# ---------- backup ----------
if (-not (Test-Path "$bk\services.csv")) {
  Get-Service wuauserv, UsoSvc, WaaSMedicSvc, dosvc, BITS -ErrorAction SilentlyContinue |
    Select-Object Name, StartType | Export-Csv "$bk\services.csv" -NoTypeInformation
  reg export 'HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' "$bk\policy_wu.reg" /y
  reg export 'HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings' "$bk\wu_ux.reg" /y
  reg export 'HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\Maintenance' "$bk\maintenance.reg" /y
  powercfg /export "$bk\powerscheme_active.pow" SCHEME_CURRENT
}

# ---------- power: all schemes, AC and DC ----------
$set = @(
  @('4f971e89-eebd-4455-a8de-9e59040e7347','5ca83367-6e45-459f-a27b-476b1d01c936',0), # lid close: do nothing
  @('238c9fa8-0aad-41ed-83f4-97be242c8f20','29f6c1db-86da-48c5-9fdb-f2b67b1f44da',0), # sleep after: never
  @('238c9fa8-0aad-41ed-83f4-97be242c8f20','9d7815a6-7ee4-497e-8888-515a05f02364',0), # hibernate after: never
  @('238c9fa8-0aad-41ed-83f4-97be242c8f20','94ac6d29-73ce-41a6-809f-6363ba21b47e',0), # hybrid sleep: off
  @('238c9fa8-0aad-41ed-83f4-97be242c8f20','bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d',0), # wake timers: off
  @('7516b95f-f776-4464-8c53-06167f40cc99','3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e',0), # display off: never (avoids Modern Standby)
  @('19cbb8fa-5279-450e-9fac-8a3d5fedd0c1','12bbebe6-58d6-4636-95bb-3217ef867c1a',0), # Wi-Fi: max performance
  @('2a737441-1930-4402-8d77-b2bebba308a3','48e6b7a6-50f5-4782-a5d4-53bb8f07e226',0)  # USB selective suspend: off
)
$schemes = (powercfg /list) | Select-String -Pattern '([0-9a-f-]{36})' | ForEach-Object { $_.Matches[0].Value }
foreach ($s in $schemes) { foreach ($x in $set) {
  powercfg /setacvalueindex $s $x[0] $x[1] $x[2] 2>$null
  powercfg /setdcvalueindex $s $x[0] $x[1] $x[2] 2>$null
} }
powercfg /setactive SCHEME_CURRENT
powercfg /hibernate off
# network adapters: don't let Windows switch them off to save power
Get-NetAdapter -Physical -ErrorAction SilentlyContinue | ForEach-Object {
  try { Set-NetAdapterPowerManagement -Name $_.Name -AllowComputerToTurnOffDevice Disabled -ErrorAction Stop; "netadapter $($_.Name): power-off disabled" } catch { "netadapter $($_.Name): $($_.Exception.Message)" }
}

# ---------- Windows Update off ----------
$wu = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
New-Item -Path "$wu\AU" -Force | Out-Null
Set-ItemProperty "$wu\AU" NoAutoUpdate 1 -Type DWord
Set-ItemProperty "$wu\AU" AUOptions 2 -Type DWord
Set-ItemProperty "$wu\AU" NoAutoRebootWithLoggedOnUsers 1 -Type DWord
Set-ItemProperty $wu ExcludeWUDriversInQualityUpdate 1 -Type DWord
Set-ItemProperty $wu SetAutoRestartNotificationDisable 1 -Type DWord
# pause everything far into the future (belt and braces in case a service gets re-enabled)
$ux = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
New-Item -Path $ux -Force | Out-Null
$now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); $end = '2036-01-01T00:00:00Z'
Set-ItemProperty $ux FlightSettingsMaxPauseDays 3650 -Type DWord
foreach ($n in 'PauseFeatureUpdatesStartTime','PauseQualityUpdatesStartTime','PauseUpdatesStartTime') { Set-ItemProperty $ux $n $now }
foreach ($n in 'PauseFeatureUpdatesEndTime','PauseQualityUpdatesEndTime','PauseUpdatesExpiryTime') { Set-ItemProperty $ux $n $end }
Set-ItemProperty $ux IsContinuousInnovationOptedIn 0 -Type DWord
# Store app auto-update off
New-Item -Path 'HKLM:\SOFTWARE\Policies\Microsoft\WindowsStore' -Force | Out-Null
Set-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\WindowsStore' AutoDownload 2 -Type DWord
# Delivery Optimization: no peer up/downloads
New-Item -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization' -Force | Out-Null
Set-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization' DODownloadMode 0 -Type DWord
# automatic maintenance (night-time defrag/scans/wake-ups) off
$mt = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\Maintenance'
Set-ItemProperty $mt MaintenanceDisabled 1 -Type DWord
Set-ItemProperty $mt WakeUp 0 -Type DWord
# TIME SYNC (2026-10-24): Windows syncs its clock from a MAINTENANCE task (\Microsoft\Windows\Time Synchronization\SynchronizeTime); with
# maintenance off it never ran again after 2026-10-03 and the clock was 25 s slow three weeks later. Keep the clock synced ourselves:
# w32time automatic + hourly resync task (time_sync.ps1).
try { & (Join-Path $PSScriptRoot 'time_sync.ps1') } catch { Write-Host "time sync setup failed: $_" }
# services
foreach ($svc in 'wuauserv','UsoSvc','dosvc','WaaSMedicSvc') {
  try { Stop-Service $svc -Force -ErrorAction Stop } catch { "stop ${svc}: $($_.Exception.Message)" }
  try { Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$svc" Start 4 -Type DWord -ErrorAction Stop; "service ${svc}: disabled" } catch { "service ${svc}: $($_.Exception.Message)" }
}
# scheduled tasks that trigger scans/installs/reboots (some are system-protected; failures are listed)
foreach ($tp in '\Microsoft\Windows\WindowsUpdate\','\Microsoft\Windows\UpdateOrchestrator\','\Microsoft\Windows\WaaSMedic\','\Microsoft\Windows\InstallService\') {
  Get-ScheduledTask -TaskPath $tp -ErrorAction SilentlyContinue | ForEach-Object {
    try { Disable-ScheduledTask -TaskPath $_.TaskPath -TaskName $_.TaskName -ErrorAction Stop | Out-Null; "task off: $($_.TaskPath)$($_.TaskName)" } catch { "task KEPT (protected): $($_.TaskPath)$($_.TaskName)" }
  }
}

# ---------- L2Swarm tasks (elevated, as the logged-on user) ----------
# L2Swarm.exe requires admin. These tasks let the dashboard / a normal shell start, stop and restart it
# without a UAC prompt (schtasks /run /tn "L2Swarm Start"), and run the memory watchdog every 2 min.
$user = (Get-CimInstance Win32_ComputerSystem).UserName
$prn  = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
$cfg  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Unregister-ScheduledTask -TaskName 'L2Swarm MemWatch' -Confirm:$false -ErrorAction SilentlyContinue
foreach ($a in 'Start','Stop','Restart','MemWatch') {
  $arg = if ($a -eq 'MemWatch') { 'watch' } else { $a.ToLower() }
  $act = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$PSScriptRoot\run_hidden.vbs`" $arg"
  if ($a -eq 'MemWatch') {
    $trg = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
    Register-ScheduledTask -TaskName "L2Swarm $a" -Action $act -Trigger $trg -Principal $prn -Settings $cfg -Force | Out-Null
  } else {
    Register-ScheduledTask -TaskName "L2Swarm $a" -Action $act -Principal $prn -Settings $cfg -Force | Out-Null
  }
  "task 'L2Swarm $a' registered for $user"
}
# Dashboard keep-alive (2026-10-16): after a reboot MemWatch restarted L2Swarm but nothing restarted Dashboardserver.js (+ the brain host
# that runs swarm.js for the brain-hosted characters). "L2Swarm Dashboard" runs dashboard_keepalive.ps1 as the user, NOT elevated,
# at logon and every 3 min; it only starts node server.js when the dashboard port does not answer.
$prnLow = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$actD   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$PSScriptRootun_hidden_ps.vbs`" dashboard_keepalive.ps1"
$trgD1  = New-ScheduledTaskTrigger -AtLogOn -User $user; $trgD1.Delay = 'PT1M'
$trgD2  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 3)
Register-ScheduledTask -TaskName 'L2Swarm Dashboard' -Action $actD -Trigger @($trgD1, $trgD2) -Principal $prnLow -Settings $cfg -Force | Out-Null
"task 'L2Swarm Dashboard' registered for $user (dashboard keep-alive, not elevated)"

# ---------- verify ----------
"--- verify"
foreach ($q in @('SUB_BUTTONS 5ca83367-6e45-459f-a27b-476b1d01c936','SUB_SLEEP STANDBYIDLE','SUB_SLEEP HIBERNATEIDLE','SUB_SLEEP RTCWAKE','SUB_VIDEO VIDEOIDLE')) { "$q => " + ((powercfg /query SCHEME_CURRENT $q.Split(' ') | Select-String 'Current') -join ' | ') }
powercfg /a | Select-String 'Hibernate'
Get-Service wuauserv, UsoSvc, dosvc, WaaSMedicSvc | Select-Object Name, Status, StartType | Format-Table | Out-String
Stop-Transcript | Out-Null
