# DUPLOGIN-2026-11-12 (owner: "Nuker29 and Nuker25 relogin over and over"): one account config opened TWICE in L2Swarm
# (C:\L2Swarm\Settings\Mylogin87.xml and C:\RainbowControl\l2\L2Swarm\Settings\Mylogin87.xml = the same file through the C:\L2 junction).
# The two entries log in the same account and kick each other every ~12 s. This closes every duplicate entry (same config FILE NAME),
# keeping the one that is logged in (else the first). Read-only with -DryRun.
#   powershell -File docs\plan\tools\close_dup_accounts.ps1 [-DryRun] [-Port 8083]
param([switch]$DryRun, [int]$Port = 8083)
$ErrorActionPreference = 'Stop'
function Mcp([string]$tool, [hashtable]$a) {
  $body = @{ jsonrpc = '2.0'; id = 1; method = 'tools/call'; params = @{ name = $tool; arguments = $a } } | ConvertTo-Json -Depth 6 -Compress
  $raw = (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -Method Post -Body $body -ContentType 'application/json' -Headers @{ Accept = 'application/json, text/event-stream' } -TimeoutSec 60).Content
  if ($raw -match '(?m)^data:\s*(\{.*\})\s*$') { $raw = $Matches[1] }
  return (($raw | ConvertFrom-Json).result.content | Where-Object { $_.type -eq 'text' } | Select-Object -First 1).text
}
$accs = (Mcp 'get_accounts_status' @{}) | ConvertFrom-Json
$groups = $accs | Where-Object { $_.config_path } | Group-Object { [IO.Path]::GetFileName([string]$_.config_path).ToLower() } | Where-Object { $_.Count -gt 1 }
if (-not $groups) { Write-Output 'no duplicate account entries'; exit 0 }
foreach ($g in $groups) {
  $keep = @($g.Group | Where-Object { $_.is_logged_in } | Select-Object -First 1)
  if (-not $keep.Count) { $keep = @($g.Group | Select-Object -First 1) }
  foreach ($a in $g.Group) {
    if ($a.account_id -eq $keep[0].account_id) { Write-Output "keep  $($a.account_name) $($a.account_id) $($a.config_path) (logged in: $($a.is_logged_in))"; continue }
    if ($DryRun) { Write-Output "WOULD CLOSE $($a.account_name) $($a.account_id) $($a.config_path)"; continue }
    $r = Mcp 'close_account' @{ account_id = $a.account_id }
    Write-Output "closed $($a.account_name) $($a.account_id) $($a.config_path): $($r.Substring(0, [Math]::Min(120, $r.Length)))"
    Start-Sleep 6
  }
}
