# Deploy Scripts_dev\swarm.js -> Scripts\swarm.js (the live file L2Swarm watches).
# Why: every write to Scripts\swarm.js makes L2Swarm reload the script on all accounts,
# and each reload leaks V8 memory. ~165 reloads on 2026-10-03 grew L2Swarm to 24.5 GB
# and crashed the PC. So: edit Scripts_dev\swarm.js freely, deploy here at most every 20 min.
# Usage: powershell -File deploy_swarm.ps1 [-Force]   (-Force skips the time gate, still logged)
param([switch]$Force)
$root   = (Resolve-Path "$PSScriptRoot\..\..\..").Path
$src    = "$root\Scripts_dev\swarm.js"
$dst    = "$root\Scripts\swarm.js"
$log    = "$root\Logs\deploy_swarm.log"
$minGap = 15    # minutes between deploys (L2Swarm 3.8.6 fixed the reload memory leak, 2026-10-05: was 20)
$maxMB  = 8000 # refuse deploy if L2Swarm private memory is above this (restart L2Swarm first). 8000 on the 32 GB PC since 2026-10-24 (4000 on the 16 GB laptop, 3000 before)

function Log($m) { $l = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"; Add-Content -Path $log -Value $l; Write-Output $l }

if (-not (Test-Path $src)) { Log "ABORT: $src missing"; exit 1 }
if ((Get-FileHash $src).Hash -eq (Get-FileHash $dst).Hash) { Log "SKIP: no changes"; exit 0 }

& node --check $src
if ($LASTEXITCODE -ne 0) { Log "ABORT: syntax error in Scripts_dev\swarm.js"; exit 1 }

# REQUIREMENTS GUARDRAIL (owner 2026-10-20: "make sure the system uses the guardrails"): the owner's permanent rules in docs\requirements
# must hold before anything reaches the bots. -Force does NOT skip this: fix the code (or, with the owner's OK, the requirement) instead.
$reqOut = & node "$root\docs\plan\tools\requirements_check.js" 2>&1
$reqOut | ForEach-Object { Write-Output "  $_" }
if ($LASTEXITCODE -ne 0) { Log ("ABORT: a requirement is broken (docs\requirements) - " + (($reqOut | Where-Object { $_ -match 'BROKEN|not in index|no tests|does not exist' }) -join ' | ')); exit 7 }
Log "requirements OK"

$last = Get-Content $log -ErrorAction SilentlyContinue | Where-Object { $_ -match ' DEPLOYED' } | Select-Object -Last 1
if ($last -and -not $Force) {
    $age = (Get-Date) - [datetime]::ParseExact($last.Substring(0,19), 'yyyy-MM-dd HH:mm:ss', $null)
    if ($age.TotalMinutes -lt $minGap) {
        Log ("ABORT: last deploy {0:N0} min ago (min gap {1}). Batch more edits, or use -Force." -f $age.TotalMinutes, $minGap)
        exit 2
    }
}

# never in the middle of a fight (2026-10-05 22:31: a queued deploy reloaded the script during a Kamaloka run and ended it after room 1)
if (-not $Force) {
    foreach ($lf in @(Get-ChildItem "$root\Logs\raid_live*.json", "$root\Logs\kamaloka_live*.json" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })) {   # LIVE PER PARTY 2026-10-09: one file per leader
        try {
            $j = Get-Content $lf -Raw -ErrorAction Stop | ConvertFrom-Json
            $age = ((Get-Date).ToUniversalTime() - [datetime]::Parse($j.updatedAt).ToUniversalTime()).TotalSeconds
            if ($age -lt 60 -and $j.phase -ne 'done') { Log "ABORT: a fight is live ($(Split-Path $lf -Leaf), updated $([int]$age) s ago) - deploy after it, or use -Force."; exit 4 }
        } catch { }
    }
}

# BUSYGUARD 2026-10-22 (owner, after a deploy cut Healer12's Giran regroup at 17:17 because her live "regroup" was called stale by hand): never
# while a character's LIVE state (swarm_state written < 2 min ago) shows a team step: regroup / supply / trade / hand-over / sell / gear, a
# running party status, or an open trade. The state wins over any guess; -Force still deploys (logged).
if (-not $Force) {
    $busy = @()
    foreach ($sf in @(Get-ChildItem "$root\Logs\swarm_state_*.json" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-2) })) {
        try {
            $s = Get-Content $sf.FullName -Raw -ErrorAction Stop | ConvertFrom-Json
            $why = ''
            if ("$($s.task)" -match '^(supply|regroup|handover|hand-over|trade|hand-out|sell|gear)') { $why = "$($s.task)".Trim() }
            # TRAVELOK 2026-10-25 (owner: "Yes make sure it works"): with 23 parties one is nearly always travelling, so a deploy waited for
            # hours; a party only on its way (teleport / walk to the spot) picks the trip up again after the reload. Its Giran regroup and
            # gather steps still block, like every other party status (regroup / supply / collect / fund).
            elseif ($s.partyStatus -and $s.partyStatus.what -and -not ("$($s.partyStatus.what)" -eq 'travel' -and "$($s.partyStatus.step)" -notmatch '^(regroup|gather)')) { $why = "party $($s.partyStatus.what) $($s.partyStatus.step)".Trim() }
            elseif ($s.trade -and $s.trade.stage -and "$($s.trade.stage)" -notmatch 'done|failed') { $why = "trade $($s.trade.stage)" }
            if ($why) { $busy += "$($s.name): $why" }
        } catch { }
    }
    if ($busy.Count) { Log ("ABORT: busy (live state) - " + (($busy | Select-Object -First 6) -join ' | ') + " - deploy after it, or use -Force."); exit 8 }
}

# never while accounts are still logging in (2026-10-04 23:20: two live reloads during logins -> 6 GB in 5 min; 2026-10-07 01:38: a queued
# deploy waited for the "L2Swarm Start" task, but MemWatch had restarted L2Swarm itself, so the deploy hit the logins anyway).
# l2swarm_ctl.ps1 holds this lock for every start, whoever triggered it.
if (-not $Force -and (Test-Path "$root\Logs\l2swarm_starting.lock")) {
    # the lock holds the PID of the login loop; a lock whose PID is gone is stale (same rule as l2swarm_ctl.ps1 Lock-Owner)
    $lockPid = 0; try { $lockPid = [int](Get-Content "$root\Logs\l2swarm_starting.lock" -ErrorAction Stop | Select-Object -First 1) } catch { }
    if ($lockPid -and (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)) { Log "ABORT: accounts are still logging in (login loop PID $lockPid) - deploy after the logins."; exit 5 }
}

# 2026-10-25: a second L2Swarm (the update test copy in another folder) made $p a list and the memory check failed -> only THIS install's one
$p = Get-Process L2Swarm -ErrorAction SilentlyContinue | Where-Object { $_.Path -and ((Split-Path $_.Path -Parent) -eq (Resolve-Path $root).Path -or (Split-Path $_.Path -Parent) -eq 'C:\L2Swarm') } | Select-Object -First 1
if (-not $p) { $p = Get-Process L2Swarm -ErrorAction SilentlyContinue | Where-Object { $_.Path -notmatch 'L2Swarm_update' } | Select-Object -First 1 }
if ($p) {
    $mb = [int]($p.PrivateMemorySize64 / 1MB)
    # (2026-10-07 05:08: the old "ABORT above $maxMB" made the restart deploy below unreachable — both limits were 4000 since the RAM
    # upgrade. High memory is exactly when the restart deploy (stop -> copy -> start, a fresh process) is the right way, so no abort here.)
}

# 2026-10-04 19:03: a live reload took L2Swarm 2.5 -> 4.3 GB in < 1 min (PC 384 MB free) and MemWatch restarted it anyway.
# So above $reloadMB a deploy is stop -> copy -> start (staggered login) instead of a live reload: a fresh process leaks nothing.
$reloadMB = 1000000   # user 2026-10-07 19:55: "stop restarting all the time - we have 50-100 GB virtual RAM": a deploy NEVER restarts L2Swarm any more, always a live reload (it may leak 1-2 GB; the 49 GB pagefile absorbs it, MemWatch only acts when commit is nearly gone). Was 2000:   # 2026-10-07: live reloads at 3.6 / 3.8 GB jumped +1.6 / +2.3 GB within minutes (00:43, 05:46) and the 2nd hit MemWatch; at 0.9 GB (01:38) it was fine. Above 2000 MB always stop -> copy -> start (was 4000 since the RAM upgrade)
# every restart deploy logs ALL accounts in again (38 since 2026-10-07). User 2026-10-07: "if you constantly log in it will block at some
# point" -> at most one restart deploy per hour; batch the edits (the -Force switch does not lift this).
$restartGapMin = 60
if ($p -and $mb -gt $reloadMB) {
    $lastRestart = Get-Content $log -ErrorAction SilentlyContinue | Where-Object { $_ -match 'DEPLOYED \(force=\w+, restart\)' } | Select-Object -Last 1
    if ($lastRestart) {
        $ago = ((Get-Date) - [datetime]::ParseExact($lastRestart.Substring(0, 19), 'yyyy-MM-dd HH:mm:ss', $null)).TotalMinutes
        if ($ago -lt $restartGapMin) { Log ("ABORT: a restart deploy logs every account in again - the last one was {0} min ago (max one per {1} min). Batch the edits." -f [int]$ago, $restartGapMin); exit 6 }
    }
    Log "restart deploy: L2Swarm uses $mb MB (> $reloadMB) - stopping it, copying, starting it again"
    schtasks /run /tn 'L2Swarm Stop' | Out-Null
    for ($i = 0; $i -lt 30 -and (Get-Process L2Swarm -ErrorAction SilentlyContinue | Where-Object { $_.Path -notmatch '\\L2Swarm_update\\' }); $i++) { Start-Sleep 2 }
    Start-Sleep 8   # let the Stop task finish (it also closes l2.exe) before the Start task runs
    Copy-Item $src $dst -Force
    schtasks /run /tn 'L2Swarm Start' | Out-Null
    Log ("DEPLOYED (force={0}, restart) L2Swarm MB={1}" -f [bool]$Force, $mb)
    exit 0
}
Copy-Item $src $dst -Force
Log ("DEPLOYED (force={0}) L2Swarm MB={1}" -f [bool]$Force, $(if ($p) { $mb } else { 'not running' }))
