# viewsample.ps1 - read-only: every 60 s append the dashboard viewer heartbeat (Logs\dash_viewers.json) to Logs\viewsample_<date>.log,
# so memory slopes can be correlated with dashboard pages that poll MCP (memory investigation 2026-10-09).
param([int]$Minutes = 150)
$root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$out = Join-Path $root ("Logs\viewsample_" + (Get-Date -Format 'yyyy-MM-dd') + ".log")
$end = (Get-Date).AddMinutes($Minutes)
while ((Get-Date) -lt $end) {
  try { $v = (Get-Content (Join-Path $root 'Logs\dash_viewers.json') -Raw -ErrorAction Stop).Trim() } catch { $v = 'n/a' }
  Add-Content -Path $out -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $v) -Encoding ascii
  Start-Sleep -Seconds 60
}
