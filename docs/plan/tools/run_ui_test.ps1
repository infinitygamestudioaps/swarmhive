# run_ui_test.ps1 - run browser (UI) tests the safe way on the live bot PC (owner 2026-10-24: "remember to kill the browser after you are done
# testing, and remember to use the GPU", "Dont Ever use Microsoft edge for ANYTHING"):
#   - ONE test at a time, BelowNormal priority (the 79 bots keep the CPU), Chrome only (the tests use the GPU: --use-angle=d3d11)
#   - afterwards ALWAYS (also on a crash / Ctrl+C / timeout): kill every headless chrome.exe and any msedge.exe, delete their %TEMP% profiles
#   - prints RAM / CPU after the cleanup
# Use: powershell -File docs\plan\tools\run_ui_test.ps1 test_loot_ui [test_items_ui ...] [-TimeoutSec 300]
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Tests, [int]$TimeoutSec = 300)
$tools = $PSScriptRoot
function Cleanup {
  for ($round = 0; $round -lt 3; $round++) {   # a dying browser can still be listed: kill, wait, look again
    $left = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | Where-Object { $_.Name -eq 'msedge.exe' -or $_.CommandLine -match '--headless|\\Temp\\[a-z0-9]+-(edge|chrome)-' })
    if (-not $left.Count) { break }
    $left | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep 2
  }
  Get-ChildItem $env:TEMP -Directory -ErrorAction SilentlyContinue | Where-Object Name -match '^[a-z0-9]+-(edge|chrome)-' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
$fail = 0
try {
  foreach ($t in $Tests) {
    $f = Join-Path $tools (($t -replace '\.js$', '') + '.js')
    if (-not (Test-Path $f)) { "MISSING $t"; $fail++; continue }
    $p = Start-Process node -ArgumentList "`"$f`"" -NoNewWindow -PassThru -RedirectStandardOutput "$env:TEMP\uitest_$t.out" -RedirectStandardError "$env:TEMP\uitest_$t.err"
    try { $p.PriorityClass = 'BelowNormal' } catch { }
    $null = $p.Handle
    if (-not $p.WaitForExit($TimeoutSec * 1000)) { taskkill /T /F /PID $p.Id | Out-Null; "TIMEOUT $t"; $fail++ }
    else { $code = $p.ExitCode; "{0} {1} : {2}" -f $(if ($code -eq 0) { 'ok  ' } else { "FAIL($code)" }), $t, ((Get-Content "$env:TEMP\uitest_$t.out" -Tail 1) -join ''); if ($code) { $fail++ } }
    Cleanup
  }
} finally {
  Cleanup
  $os = Get-CimInstance Win32_OperatingSystem
  "cleanup done: chrome headless left $(@(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match '--headless' }).Count), msedge left $(@(Get-Process msedge -ErrorAction SilentlyContinue).Count), RAM used {0:N1} GB" -f (($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB)
}
exit $fail
