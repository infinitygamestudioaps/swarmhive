# Dashboard-only restart (no swarm deploy, no -Force): wait until no raid_live / kamaloka_live file changed for 120 s and no item job runs
# (max 60 min) -> pause the hive -> restart the dashboard + brain host -> wait 79/79 connected -> resume.
Set-Location C:\L2Swarm
$t0 = Get-Date
do {
  $fresh = @(Get-ChildItem Logs -File | Where-Object { $_.Name -match '^(raid_live|kamaloka_live)' -and ((Get-Date) - $_.LastWriteTime).TotalSeconds -lt 120 })
  # ITEMJOBWAIT 2026-10-25: never in the middle of an item job (the 18:59 pause stopped Dagger1's buy + enchant job)
  foreach ($jf in @(Get-ChildItem 'Logs\itemjobs\*_status.json' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-10) })) {
    try { $j = Get-Content $jf.FullName -Raw | ConvertFrom-Json; if ("$($j.state)" -notmatch '^(done|failed)$') { $fresh += $jf } } catch { }
  }
  if ($fresh.Count) { "$(Get-Date -Format HH:mm:ss) waiting, live: $($fresh.Name -join ',')"; Start-Sleep 30 }
} while ($fresh.Count -and ((Get-Date) - $t0).TotalMinutes -lt 60)
if ($fresh.Count) { "gave up: a live fight / item job is still running after 60 min - nothing restarted"; exit 1 }
"$(Get-Date -Format HH:mm:ss) no live fight, no item job; pausing the hive"
node docs\plan\tools\hive_pause.js pause 2>&1 | Select-Object -Last 1
try {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match '(^|\s|")server\.js' } | ForEach-Object { taskkill /T /F /PID $_.ProcessId | Out-Null }
  Start-Sleep 3
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'brain_host\\pool\.js|geopath_service|dataservice\.js|Dashboard\\brain\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  schtasks /run /tn "L2Swarm Dashboard" | Out-Null
  $t1 = Get-Date
  do { Start-Sleep 10; $ok = $false; try { $ok = (Invoke-WebRequest http://127.0.0.1:8090/ -UseBasicParsing -TimeoutSec 5).StatusCode -ge 200 } catch { $ok = $null -ne $_.Exception.Response } } until ($ok -or ((Get-Date) - $t1).TotalSeconds -gt 300)
  "dashboard up: $ok after $([int]((Get-Date) - $t1).TotalSeconds) s"
  $t1 = Get-Date
  do { Start-Sleep 15; $n = 0; try { $s = Get-Content Logs\brain_host_stats.json -Raw | ConvertFrom-Json; if ([datetime]$s.at -gt $t1.ToUniversalTime()) { $n = @($s.workers | ForEach-Object { $_.contexts } | Where-Object connected).Count } } catch { } } until ($n -ge 79 -or ((Get-Date) - $t1).TotalSeconds -gt 600)
  "connected after restart: $n/79 in $([int]((Get-Date) - $t1).TotalSeconds) s"
} finally {
  node docs\plan\tools\hive_pause.js resume 2>&1 | Select-Object -Last 1
}
