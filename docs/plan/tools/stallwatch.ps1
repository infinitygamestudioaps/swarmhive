# Stall recorder (2026-10-07): measures directly whether ALL swarm.js engines freeze at the same time.
# Every 2 s: heartbeat = swarm_state_<name>.json (every engine rewrites its own file every 2 s from a setInterval),
#   newest age (s), how many of the "live" files (written in the last 10 min) were written in the last 8 s,
#   L2Swarm threads / handles / CPU % (of ONE core, TotalProcessorTime delta) / private MB.
# Every 30 s: MCP latency (JSON-RPC 'initialize' to 127.0.0.1:8083, 10 s timeout, read-only, non-blocking poll).
# A STALL line is written when no engine wrote its state file for > 8 s; STALL-END with the duration when they resume.
# Log: Logs\stallwatch.log (trimmed at 20 MB). Stop: create Logs\stallwatch.stop. Runs at most 48 h.
# Start detached: Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\L2Swarm\docs\plan\tools\stallwatch.ps1'
$root = (Resolve-Path "$PSScriptRoot\..\..\..").Path
$log = "$root\Logs\stallwatch.log"; $stop = "$root\Logs\stallwatch.stop"
Remove-Item $stop -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.Net.Http
$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromSeconds(10)
function W($s) { try { Add-Content -Path $log -Value $s -Encoding utf8 } catch { } }
$t0 = Get-Date; $prevCpu = $null; $prevAt = $null; $pid0 = 0
$stallSince = $null; $mcpTask = $null; $mcpStart = $null; $mcpLast = 'n/a'; $nextMcp = Get-Date
W "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') stallwatch started"
while (-not (Test-Path $stop) -and ((Get-Date) - $t0).TotalHours -lt 48) {
    $now = Get-Date
    # --- heartbeat
    $files = @(Get-ChildItem "$root\Logs\swarm_state_*.json" -ErrorAction SilentlyContinue)
    $ages = @($files | ForEach-Object { ($now - $_.LastWriteTime).TotalSeconds })
    $live = @($ages | Where-Object { $_ -lt 600 })
    $newest = if ($ages.Count) { ($ages | Measure-Object -Minimum).Minimum } else { 9999 }
    $fresh = @($live | Where-Object { $_ -le 8 }).Count
    # --- process
    $p = Get-Process L2Swarm -ErrorAction SilentlyContinue | Select-Object -First 1
    $procTxt = 'L2Swarm not running'
    if ($p) {
        if ($p.Id -ne $pid0) { $pid0 = $p.Id; $prevCpu = $null }
        $cpu = $p.TotalProcessorTime; $cpuPct = ''
        if ($prevCpu -ne $null) { $cpuPct = [int](($cpu - $prevCpu).TotalMilliseconds / (($now - $prevAt).TotalMilliseconds) * 100) }
        $prevCpu = $cpu; $prevAt = $now
        $procTxt = "thr=$($p.Threads.Count) hnd=$($p.HandleCount) cpu=$cpuPct% mb=$([int]($p.PrivateMemorySize64 / 1MB))"
    }
    # --- MCP latency (non-blocking: start a request, read its result on a later tick)
    if ($mcpTask) {
        if ($mcpTask.IsCompleted) {
            $ms = [int]((Get-Date) - $mcpStart).TotalMilliseconds
            $mcpLast = if ($mcpTask.Status -eq 'RanToCompletion') { "${ms}ms http=$([int]$mcpTask.Result.StatusCode)" } else { "FAIL ${ms}ms" }
            $mcpTask = $null; $nextMcp = (Get-Date).AddSeconds(30)
        } elseif (((Get-Date) - $mcpStart).TotalSeconds -gt 11) { $mcpLast = 'TIMEOUT>10s'; $mcpTask = $null; $nextMcp = (Get-Date).AddSeconds(30) }
    } elseif ($p -and (Get-Date) -ge $nextMcp) {
        try {
            $body = New-Object System.Net.Http.StringContent('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"stallwatch","version":"1"}}}', [Text.Encoding]::UTF8, 'application/json')
            $mcpStart = Get-Date; $mcpTask = $http.PostAsync('http://127.0.0.1:8083/', $body)
        } catch { $mcpLast = 'FAIL start'; $nextMcp = (Get-Date).AddSeconds(30) }
    }
    # --- stall bookkeeping
    $tag = 'ok   '
    if ($newest -gt 8 -and $live.Count) {
        $tag = 'STALL'
        if (-not $stallSince) { $stallSince = $now.AddSeconds(-$newest) }
    } elseif ($stallSince) {
        W ("{0} STALL-END after {1:n0}s (from {2})" -f $now.ToString('yyyy-MM-dd HH:mm:ss.f'), ($now - $stallSince).TotalSeconds, $stallSince.ToString('HH:mm:ss'))
        $stallSince = $null
    }
    W ("{0} {1} newest={2:n1}s fresh={3}/{4} {5} mcp={6}" -f $now.ToString('yyyy-MM-dd HH:mm:ss.f'), $tag, $newest, $fresh, $live.Count, $procTxt, $mcpLast)
    try { if ((Get-Item $log).Length -gt 20MB) { Get-Content $log -Tail 20000 | Set-Content "$log.tmp" -Encoding utf8; Move-Item "$log.tmp" $log -Force } } catch { }
    $sl = 2000 - [int]((Get-Date) - $now).TotalMilliseconds
    if ($sl -gt 50) { Start-Sleep -Milliseconds $sl }
}
W "$(Get-Date -f 'yyyy-MM-dd HH:mm:ss') stallwatch stopped"
