# planned_restart.ps1 - SAFETY NET ONLY, OFF by default (memory investigation 2026-10-09, docs/plan/memory_2026-10-09.md).
# The real fix is to stop the growth at its source. This script is the last resort: when L2Swarm's private memory passes a threshold it
#   1) checks the guards (no live raid / Kamaloka, L2Swarm up > MinUptimeMin, last restart > MinGapHours ago, no start/deploy running),
#   2) sends '!town giran' to every party through the dashboard (POST http://127.0.0.1:8090/api/command, target 'all'),
#   3) waits (state kept in Logs\planned_restart_state.json; each call advances one step, nothing sleeps for long) until >= 90 % of the
#      characters with a fresh swarm_state file stand in Giran (or GatherMaxMin passed), re-checks the raid guard,
#   4) runs the elevated "L2Swarm Restart" task (stop -> staggered login of all accounts, ~4 min).
# It does NOTHING unless Logs\planned_restart.enabled exists (user rule no-restarts: the user must switch it on), except with -DryRun,
# which only reports what it would do. Log: Logs\planned_restart.log.
# Wiring (only after the user's OK): in l2swarm_ctl.ps1 'watch', after $mb is known:
#   if (Test-Path "$root\Logs\planned_restart.enabled") { try { & "$root\docs\plan\tools\planned_restart.ps1" -MB $mb } catch { Log $ctlLog "planned_restart: $_" } }
param(
  [int]$MB = 0,                 # L2Swarm private MB (0 = read it here)
  [int]$ThresholdMB = 8000,     # start the gather above this
  [int]$MinUptimeMin = 120,
  [double]$MinGapHours = 6,
  [int]$GatherMaxMin = 12,
  [switch]$DryRun
)
$root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$log = "$root\Logs\planned_restart.log"; $stateFile = "$root\Logs\planned_restart_state.json"; $enabled = Test-Path "$root\Logs\planned_restart.enabled"
function Log($m) { Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $(if ($DryRun) { '[dry] ' })$m" -Encoding UTF8 }
function LoadState { try { return (Get-Content $stateFile -Raw -ErrorAction Stop | ConvertFrom-Json) } catch { return [pscustomobject]@{ phase = 'idle'; since = $null } } }
function SaveState($s) { if (-not $DryRun) { $s | ConvertTo-Json | Set-Content $stateFile -Encoding UTF8 } }
function LiveFight {
  foreach ($lf in @(Get-ChildItem "$root\Logs\raid_live*.json", "$root\Logs\kamaloka_live*.json" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })) {   # LIVE PER PARTY 2026-10-09: one file per leader
    try { $j = Get-Content $lf -Raw -ErrorAction Stop | ConvertFrom-Json; $age = ((Get-Date).ToUniversalTime() - [datetime]::Parse($j.updatedAt).ToUniversalTime()).TotalSeconds
          if ($age -lt 60 -and $j.phase -ne 'done') { return (Split-Path $lf -Leaf) } } catch { }
  }
  return $null
}
function InGiranShare {
  # Giran town centre ~ (83000, 148000); "in town" = within 7000. Only characters whose swarm_state was written in the last 2 min count.
  $all = 0; $in = 0
  foreach ($f in Get-ChildItem "$root\Logs\swarm_state_*.json" -ErrorAction SilentlyContinue) {
    if (((Get-Date) - $f.LastWriteTime).TotalSeconds -gt 120) { continue }
    try { $s = Get-Content $f.FullName -Raw | ConvertFrom-Json; $all++; if ([math]::Sqrt([math]::Pow($s.x - 83000, 2) + [math]::Pow($s.y - 148000, 2)) -lt 7000) { $in++ } } catch { }
  }
  if ($all -eq 0) { return 0 } ; return [double]$in / $all
}
function LastRestartHoursAgo {
  $last = Get-Content "$root\Logs\memwatch.log" -ErrorAction SilentlyContinue | Where-Object { $_ -match ' RESTART ' } | Select-Object -Last 1
  $t = $null; if ($last) { try { $t = [datetime]::ParseExact($last.Substring(0, 19), 'yyyy-MM-dd HH:mm:ss', $null) } catch { } }
  $p = Get-Process L2Swarm -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($p -and (-not $t -or $p.StartTime -gt $t)) { $t = $p.StartTime }
  if (-not $t) { return 999 } ; return ((Get-Date) - $t).TotalHours
}

if (-not $enabled -and -not $DryRun) { exit 0 }
$p = Get-Process L2Swarm -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) { exit 0 }
if ($MB -le 0) { $MB = [int]($p.PrivateMemorySize64 / 1MB) }
$st = LoadState

if ($st.phase -eq 'idle') {
  if ($MB -lt $ThresholdMB) { if ($DryRun) { Log "idle: L2Swarm ${MB} MB < ${ThresholdMB} MB - nothing to do" } ; exit 0 }
  $upMin = ((Get-Date) - $p.StartTime).TotalMinutes; $gapH = LastRestartHoursAgo; $fight = LiveFight
  $busy = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'l2swarm_ctl\.ps1.*(start|restart)|deploy_swarm\.ps1' }
  if ($upMin -lt $MinUptimeMin -or $gapH -lt $MinGapHours -or $fight -or $busy) {
    Log "would gather at ${MB} MB but waiting: uptime $([int]$upMin) min (min $MinUptimeMin), last restart $([math]::Round($gapH,1)) h ago (min $MinGapHours), live fight '$fight', start/deploy running: $([bool]$busy)"
    exit 0
  }
  Log "GATHER: L2Swarm ${MB} MB >= ${ThresholdMB} MB -> '!town giran' to all parties"
  if (-not $DryRun) {
    try { Invoke-RestMethod -Uri 'http://127.0.0.1:8090/api/command' -Method Post -ContentType 'application/json' -Body '{"cmd":"!town giran","targets":["all"]}' -TimeoutSec 30 | Out-Null }
    catch { Log "dashboard command failed: $_ - no restart"; exit 0 }
  }
  SaveState ([pscustomobject]@{ phase = 'gathering'; since = (Get-Date).ToString('o') })
  exit 0
}

if ($st.phase -eq 'gathering') {
  $mins = ((Get-Date) - [datetime]::Parse($st.since)).TotalMinutes; $share = InGiranShare; $fight = LiveFight
  if ($fight) { Log "gathering: live fight in $fight - back to idle, no restart"; SaveState ([pscustomobject]@{ phase = 'idle'; since = $null }); exit 0 }
  if ($share -lt 0.9 -and $mins -lt $GatherMaxMin) { Log ("gathering: {0:P0} in Giran after {1:N1} min" -f $share, $mins); exit 0 }
  Log ("RESTART: {0:P0} in Giran after {1:N1} min, L2Swarm {2} MB -> 'L2Swarm Restart' task" -f $share, $mins, $MB)
  if (-not $DryRun) {
    Add-Content -Path "$root\Logs\memwatch.log" -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') RESTART (planned, planned_restart.ps1) L2Swarm private=${MB}MB, $([int]($share*100)) % in Giran" -Encoding UTF8
    schtasks /run /tn "L2Swarm Restart" | Out-Null
  }
  SaveState ([pscustomobject]@{ phase = 'idle'; since = $null })
}
