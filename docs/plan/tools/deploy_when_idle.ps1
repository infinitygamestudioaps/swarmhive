# Deploys Scripts_dev\swarm.js at the first quiet moment. DEPLOYNOPAUSE-2026-11-22: NEVER pauses a party. The gate (requirements_check.js, 3 min) runs FIRST,
# by deploy_swarm.ps1 itself (it remembers a passed gate for 15 min); a broken gate ends this at once. Then it waits until no party is in a trade /
# regroup / hand-over and deploys (about a second). Max 60 min.
$root = 'C:\RainbowControl\l2\L2Swarm'
$end = (Get-Date).AddMinutes(60)
while ((Get-Date) -lt $end) {
    $out = powershell -NoProfile -ExecutionPolicy Bypass -File "$root\docs\plan\tools\deploy_swarm.ps1"
    $code = $LASTEXITCODE
    Write-Output "$(Get-Date -Format HH:mm:ss) $(($out | Select-Object -Last 1))"
    if ($code -eq 0) { Write-Output 'DEPLOYED'; exit 0 }
    if ($code -eq 7) { Write-Output 'GATE BROKEN (requirements_check.js) - nothing deployed, nobody was paused'; exit 7 }
    if ($code -ne 8 -and $code -ne 2 -and $code -ne 4 -and $code -ne 5) { Write-Output "deploy exit $code - stopped"; exit $code }
    Start-Sleep 5
}
Write-Output 'GAVE UP after 60 min'; exit 1
