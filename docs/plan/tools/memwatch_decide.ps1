# MEMWATCH DECISION (MEMPAGEFILE-2026-11-10) - pure function, dot-sourced by l2swarm_ctl.ps1 (watch) and by test_memwatch_decide.ps1.
# Tester Vykaax 2026-11-09 14:20 ("whyyyyy"): MemWatch restarted L2Swarm at commitFree=2831MB while the PC had pcFree=11572MB physical RAM
# free - his pagefile is small (once 2 GB), so the absolute "free commit < 3000 MB" rule fired on a PC that was nowhere near out of memory.
# A restart = ~10 min of logins and parties dying in dangerous areas. Owner: "never restart if we are not utterly out of memory",
# "stop restarting all the time".
# Rules (every MB value configurable in swarm.config.json "memwatch": { ... }):
#   1. HARD: free commit < hardCommitMB (500)                    -> restart, emergency (Windows is about to refuse allocations), whatever the RAM says
#   2. commit LOW = free commit < min(minCommitMB 3000, minCommitPct 5 % of the commit limit)
#      a. commit low AND physical free RAM < ramPlentyMB (2000)  -> restart (the PC really runs out); emergency when free commit
#         < min(emergencyCommitMB 1500, 2.5 % of the limit) or physical free < 300 MB
#      b. commit low BUT physical free RAM >= ramPlentyMB         -> NO restart: the pagefile is too small -> 'pagefile' warning
#         (Logs/memwatch.log PAGEFILE line + Logs/memwatch_alert.json, advice: make the pagefile bigger / system managed)
#   3. otherwise ok.
function MemWatchDecide {
    param(
        [double]$CommitFreeMB, [double]$CommitLimitMB, [double]$PcFreeMB,
        [double]$MinCommitMB = 3000, [double]$MinCommitPct = 5, [double]$EmergencyCommitMB = 1500,
        [double]$HardCommitMB = 500, [double]$RamPlentyMB = 2000
    )
    $lowThr = $MinCommitMB
    if ($CommitLimitMB -gt 0) { $lowThr = [math]::Min($MinCommitMB, $CommitLimitMB * $MinCommitPct / 100) }
    $emThr = $EmergencyCommitMB
    if ($CommitLimitMB -gt 0) { $emThr = [math]::Min($EmergencyCommitMB, $CommitLimitMB * $MinCommitPct / 200) }
    $emThr = [math]::Max($emThr, $HardCommitMB)
    $r = [ordered]@{ restart = $false; emergency = $false; warn = ''; reason = ''; lowThrMB = [int]$lowThr; emergencyThrMB = [int]$emThr }
    if ($CommitFreeMB -lt $HardCommitMB) {
        $r.restart = $true; $r.emergency = $true
        $r.reason = "free commit $([int]$CommitFreeMB) MB < $([int]$HardCommitMB) MB (truly exhausted)"
        if ($PcFreeMB -ge $RamPlentyMB) { $r.warn = 'pagefile' }
        return [pscustomobject]$r
    }
    if ($CommitFreeMB -lt $lowThr) {
        if ($PcFreeMB -lt $RamPlentyMB) {
            $r.restart = $true
            $r.emergency = ($CommitFreeMB -lt $emThr) -or ($PcFreeMB -lt 300)
            $r.reason = "free commit $([int]$CommitFreeMB) MB < $([int]$lowThr) MB and free RAM $([int]$PcFreeMB) MB < $([int]$RamPlentyMB) MB"
        } else {
            $r.warn = 'pagefile'
            $r.reason = "free commit $([int]$CommitFreeMB) MB < $([int]$lowThr) MB but free RAM $([int]$PcFreeMB) MB - pagefile too small, no restart"
        }
    }
    return [pscustomobject]$r
}
