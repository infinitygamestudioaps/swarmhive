# memsample.ps1 - read-only memory sampler for L2Swarm (2026-10-09, memory investigation).
# Appends one CSV row per interval to Logs\memsample_<date>.csv. Never touches L2Swarm (Get-Process only).
# Usage: powershell -File memsample.ps1 [-Minutes 90] [-IntervalSec 60]
param([int]$Minutes = 90, [int]$IntervalSec = 60)
$root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$out = Join-Path $root ("Logs\memsample_" + (Get-Date -Format 'yyyy-MM-dd') + ".csv")
if (-not (Test-Path $out)) {
  'time,pid,privMB,wsMB,peakWsMB,pagedMB,handles,threads,pcFreeMB,nodeMB,edgeMB,logKB,reloads,watchdog,cpuSec' | Out-File $out -Encoding ascii
}
$log = Join-Path $root 'Logs\LOG.log'
$end = (Get-Date).AddMinutes($Minutes)
while ((Get-Date) -lt $end) {
  try {
    $p = Get-Process L2Swarm -ErrorAction SilentlyContinue | Select-Object -First 1
    $free = [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024)
    $node = [int](((Get-Process node -ErrorAction SilentlyContinue | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1MB)
    $edge = [int](((Get-Process msedge, chrome -ErrorAction SilentlyContinue | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1MB)
    $logKB = 0; $rel = 0; $wd = 0
    if (Test-Path $log) {
      $logKB = [int]((Get-Item $log).Length / 1KB)
      # count only lines of the last interval (cheap tail scan)
      $since = (Get-Date).AddSeconds(-$IntervalSec).ToString('yyyy-MM-dd HH:mm:ss')
      $tail = Get-Content $log -Tail 4000 -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt 19 -and $_.Substring(0, 19) -ge $since }
      $rel = @($tail | Where-Object { $_ -match 'Script reloaded' }).Count
      $wd = @($tail | Where-Object { $_ -match 'without returning' }).Count
    }
    if ($p) {
      $row = '{0},{1},{2},{3},{4},{5},{6},{7},{8},{9},{10},{11},{12},{13},{14}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $p.Id,
        [int]($p.PrivateMemorySize64 / 1MB), [int]($p.WorkingSet64 / 1MB), [int]($p.PeakWorkingSet64 / 1MB), [int]($p.PagedMemorySize64 / 1MB),
        $p.HandleCount, $p.Threads.Count, $free, $node, $edge, $logKB, $rel, $wd, [int]$p.TotalProcessorTime.TotalSeconds
    } else {
      $row = '{0},,,,,,,,{1},{2},{3},{4},{5},{6},' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $free, $node, $edge, $logKB, $rel, $wd
    }
    Add-Content -Path $out -Value $row -Encoding ascii
  } catch { Add-Content -Path $out -Value ("# error " + $_.Exception.Message) -Encoding ascii }
  Start-Sleep -Seconds $IntervalSec
}
