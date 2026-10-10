# Memory recorder (user 2026-10-07 19:55): find the cause of the L2Swarm memory explosions (5 -> 11 GB in 2 min at 18:46 and 19:43).
# Every 5 s: L2Swarm private MB, threads, handles, free commit, plus what every party leader is doing (swarm_state_<name>.json mode/task)
# and the live raid / Kamaloka phase. A JUMP line is written when private memory grew > 300 MB since the last sample.
# Log: Logs\memtrace.log (trimmed at 20 MB). Stop: create Logs\memtrace.stop. Runs at most 48 h.
$root = (Resolve-Path "$PSScriptRoot\..\..\..").Path
$log = "$root\Logs\memtrace.log"; $stop = "$root\Logs\memtrace.stop"
Remove-Item $stop -ErrorAction SilentlyContinue
$leaders = @()
try { $cfg = Get-Content "$root\swarm.config.json" -Raw | ConvertFrom-Json; $leaders = @($cfg.accounts | Where-Object { $_.party -and $_.character -eq $_.party } | ForEach-Object { $_.character }) } catch { }
if (-not $leaders.Count) { $leaders = @('Tank1', 'Crafter1', 'Destroyer3', 'Tank2', 'Tank3', 'Dagger1') }
$prev = 0; $t0 = Get-Date
function W($s) { try { Add-Content -Path $log -Value $s -Encoding utf8 } catch { } }
W "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') memtrace started (leaders: $($leaders -join ', '))"
while (-not (Test-Path $stop) -and ((Get-Date) - $t0).TotalHours -lt 48) {
    $p = Get-Process L2Swarm -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($p) {
        $mb = [int]($p.PrivateMemorySize64 / 1MB)
        $commit = [int]((Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory / 1KB)
        $acts = foreach ($n in $leaders) {
            try { $s = Get-Content "$root\Logs\swarm_state_$n.json" -Raw -ErrorAction Stop | ConvertFrom-Json; $t = "$($s.mode)/$($s.task)"; if ($t.Length -gt 60) { $t = $t.Substring(0, 60) }; "${n}=$t" } catch { }
        }
        $fight = ''
        foreach ($lf in @(Get-ChildItem "$root\Logs\raid_live*.json", "$root\Logs\kamaloka_live*.json" -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })) {   # LIVE PER PARTY 2026-10-09: one file per leader
            try { $j = Get-Content "$root\Logs\$lf" -Raw -ErrorAction Stop | ConvertFrom-Json; $age = ((Get-Date).ToUniversalTime() - [datetime]::Parse($j.updatedAt).ToUniversalTime()).TotalSeconds
                  if ($age -lt 60) { $fight += " $($lf.Replace('.json','')): $($j.phase)" } } catch { }
        }
        $tag = if ($prev -and $mb - $prev -gt 300) { 'JUMP' } else { 'ok  ' }
        W ("{0} {1} mb={2} d={3} thr={4} hnd={5} commitFree={6}{7} | {8}" -f (Get-Date -f 'yyyy-MM-dd HH:mm:ss'), $tag, $mb, ($mb - $prev), $p.Threads.Count, $p.HandleCount, $commit, $fight, ($acts -join ' ; '))
        $prev = $mb
    } else { W "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') L2Swarm not running"; $prev = 0 }
    try { if ((Get-Item $log).Length -gt 20MB) { Get-Content $log -Tail 20000 | Set-Content "$log.tmp" -Encoding utf8; Move-Item "$log.tmp" $log -Force } } catch { }
    Start-Sleep 5
}
W "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') memtrace stopped"
