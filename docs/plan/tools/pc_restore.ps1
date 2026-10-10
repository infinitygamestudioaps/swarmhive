# Run ELEVATED. Undoes pc_alwayson.ps1 (re-enables Windows Update, hibernate, maintenance, update tasks).
# Power timeouts are restored from the exported scheme in Settings\backup\pc_2026-10-03\.
$bk = "$((Resolve-Path "$PSScriptRoot\..\..\..").Path)\Settings\backup\pc_2026-10-03"
$def = @{ wuauserv = 3; UsoSvc = 2; dosvc = 2; WaaSMedicSvc = 3 }
Import-Csv "$bk\services.csv" -ErrorAction SilentlyContinue | ForEach-Object {
  $v = switch ($_.StartType) { 'Automatic' {2} 'Manual' {3} 'Disabled' {4} default {3} }; $def[$_.Name] = $v }
foreach ($k in $def.Keys) { Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$k" Start $def[$k] -Type DWord -ErrorAction SilentlyContinue }
Remove-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' NoAutoUpdate, AUOptions -ErrorAction SilentlyContinue
Remove-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' ExcludeWUDriversInQualityUpdate, SetAutoRestartNotificationDisable -ErrorAction SilentlyContinue
Remove-ItemProperty 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings' PauseFeatureUpdatesStartTime, PauseQualityUpdatesStartTime, PauseUpdatesStartTime, PauseFeatureUpdatesEndTime, PauseQualityUpdatesEndTime, PauseUpdatesExpiryTime, FlightSettingsMaxPauseDays -ErrorAction SilentlyContinue
Remove-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\WindowsStore' AutoDownload -ErrorAction SilentlyContinue
Remove-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization' DODownloadMode -ErrorAction SilentlyContinue
Remove-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\Maintenance' MaintenanceDisabled, WakeUp -ErrorAction SilentlyContinue
foreach ($tp in '\Microsoft\Windows\WindowsUpdate\','\Microsoft\Windows\UpdateOrchestrator\','\Microsoft\Windows\WaaSMedic\','\Microsoft\Windows\InstallService\') {
  Get-ScheduledTask -TaskPath $tp -ErrorAction SilentlyContinue | Enable-ScheduledTask -ErrorAction SilentlyContinue | Out-Null }
powercfg /hibernate on
if (Test-Path "$bk\powerscheme_active.pow") { "Old power scheme saved at $bk\powerscheme_active.pow (import with: powercfg /import <file>)" }
"Restored. Reboot to finish."
