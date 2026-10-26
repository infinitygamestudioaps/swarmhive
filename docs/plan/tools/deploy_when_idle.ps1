$root = 'C:\RainbowControl\l2\L2Swarm'
$hp = "$root\docs\plan\tools\hive_pause.js"
function Busy {
    $b = @()
    foreach ($sf in @(Get-ChildItem "$root\Logs\swarm_state_*.json" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-2) })) {
        try {
            $s = Get-Content $sf.FullName -Raw -ErrorAction Stop | ConvertFrom-Json
            $why = ''
            if ("$($s.task)" -match '^(supply|regroup|handover|hand-over|trade|hand-out|sell|gear)') { $why = "$($s.task)".Trim() }
            elseif ($s.partyStatus -and $s.partyStatus.what -and -not ("$($s.partyStatus.what)" -eq 'travel' -and "$($s.partyStatus.step)" -notmatch '^(regroup|gather)')) { $why = "party $($s.partyStatus.what) $($s.partyStatus.step)".Trim() }
            elseif ($s.trade -and $s.trade.stage -and "$($s.trade.stage)" -notmatch 'done|failed') { $why = "trade $($s.trade.stage)" }
            if ($why) { $b += "$($s.name): $why" }
        } catch { }
    }
    # ITEMJOBWAIT 2026-10-25: the 18:59 pause stopped Dagger1's buy + enchant job 9 s after it started (scrolls out, 0 bought) - a running
    # item job (status written in the last 10 min, state running / sent) or a job created in the last 2 min means busy
    foreach ($jf in @(Get-ChildItem "$root\Logs\itemjobs\*_status.json" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-10) })) {
        try { $j = Get-Content $jf.FullName -Raw -ErrorAction Stop | ConvertFrom-Json; if ("$($j.state)" -notmatch '^(done|failed)$') { $b += "item job $($j.id) ($($j.doer)): $($j.state)" } } catch { }
    }
    foreach ($jf in @(Get-ChildItem "$root\Logs\itemjobs\ij_*.json" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '_status\.json$' -and $_.LastWriteTime -gt (Get-Date).AddMinutes(-2) })) { $b += "item job $($jf.BaseName) just created" }
    foreach ($lf in @(Get-ChildItem "$root\Logs\raid_live*.json", "$root\Logs\kamaloka_live*.json" -ErrorAction SilentlyContinue)) {
        if ($lf.LastWriteTime -gt (Get-Date).AddSeconds(-120)) { $b += "raid file $($lf.Name)" }
    }
    return $b
}
$end = (Get-Date).AddMinutes(60)
while ((Get-Date) -lt $end) {
    $b = Busy
    if ($b.Count) { Write-Output "$(Get-Date -Format HH:mm:ss) busy: $(($b | Select-Object -First 4) -join ' | ')"; Start-Sleep 30; continue }
    Write-Output "$(Get-Date -Format HH:mm:ss) idle -> pause + deploy"
    node $hp pause | Select-Object -Last 1
    powershell -NoProfile -ExecutionPolicy Bypass -File "$root\docs\plan\tools\deploy_swarm.ps1" | Select-Object -Last 2
    $code = $LASTEXITCODE
    Start-Sleep 20
    node $hp resume | Select-Object -Last 1
    node $hp status
    if ($code -eq 0) { Write-Output "DEPLOYED"; exit 0 }
    Write-Output "deploy exit $code - waiting again"; Start-Sleep 60
}
Write-Output "GAVE UP after 60 min"; exit 1
