# L2Swarm control: start | stop | restart | watch
# L2Swarm.exe requires admin (manifest requireAdministrator), so this runs from elevated scheduled tasks that
# pc_alwayson.ps1 registers once. Anyone (the dashboard, a non-admin shell) can then trigger them without a UAC prompt:
#   schtasks /run /tn "L2Swarm Start"   |  "L2Swarm Stop"  |  "L2Swarm Restart"
#   "L2Swarm MemWatch" runs "watch" every 2 min.
# watch: logs L2Swarm memory to Logs\memwatch.log and restarts L2Swarm before it can exhaust the PC's RAM
# (2026-10-03 crash: 24.5 GB after ~165 script reloads on a 7.7 GB laptop). Max one auto-restart per 30 min.
param([ValidateSet('start','stop','restart','watch','reopen')][string]$Action = 'watch')
# portable install (2026-10-07): root, MCP port, game server and the main leader's config come from swarm.config.json
$SwarmRoot = ''; $SwarmMcpUrl = 'http://127.0.0.1:8083'; $SwarmGameIp = '149.56.28.81'; $SwarmGamePort = 7778; $SwarmMainConfig = 'Tank1.xml'; $SwarmLoginGap = 0
try { . "$PSScriptRoot\swarm_config.ps1" } catch { }
$root      = if ($SwarmRoot) { $SwarmRoot } else { (Resolve-Path "$PSScriptRoot\..\..\..").Path }
$exe       = "$root\L2Swarm.exe"
$ctlLog    = "$root\Logs\l2swarm_ctl.log"
$memLog    = "$root\Logs\memwatch.log"
$warnMB    = 4500   # 16 GB RAM since 2026-10-05 (was 3000)
$restartMB = 6500   # 16 GB RAM since 2026-10-05 (was 4500); the pcFree < 300 MB emergency rule stays
$minCommitMB = 3000; $emergencyCommitMB = 1500   # user 2026-10-07 19:55: "never restart if we are not utterly out of memory - we have 50-100 GB virtual RAM": restart ONLY when free COMMIT (RAM + 49 GB pagefile, limit 64.6 GB) is below 3 GB; below 1.5 GB also during a live raid / inside the cooldown. Physical RAM running low only means paging.
$minFreeMB = 800   # user 2026-10-07 19:50: "don't restart L2Swarm all the time" -> restart ONLY when the PC itself is about to run out of RAM (was 600)
$cooldown  = 30
$hardMB    = 14000   # user 2026-10-07 19:50: the 9000 cap restarted at 9.9 GB (18:47) and 11 GB (19:45, mid-raid) with 3.3-3.5 GB still free on the PC; now effectively only the pcFree rules restart. Was 9000.   # 2026-10-07: 38 accounts (2nd master account) -> higher base; was 7000. # 2026-10-06: 2 -> 11 GB within 2 min during route walks (PC 680 MB free) while the cooldown blocked a restart: above this ALWAYS restart

function Log($file, $m) { Add-Content -Path $file -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" }
function Proc { Get-Process L2Swarm -ErrorAction SilentlyContinue | Select-Object -First 1 }

# START LOCK (2026-10-06): one login run at a time, whoever started it (start / restart / a watch crash-restart / the reconnect brake).
# The lock file holds the PID of the PowerShell that runs the login loop; a lock whose PID is gone is stale.
$lockFile = "$root\Logs\l2swarm_starting.lock"
function Lock-Owner { try { $o = [int](Get-Content $lockFile -ErrorAction Stop | Select-Object -First 1); if ($o -and $o -ne $PID -and (Get-Process -Id $o -ErrorAction SilentlyContinue)) { return $o } } catch { }; return 0 }
# ATOMIC (2026-10-07 05:47: MemWatch's restart and the Restart task checked the lock in the same second, both found it free, both started
# L2Swarm -> two L2Swarm processes logging in the same 20 accounts). The file is created with CreateNew: only one caller can succeed.
# An existing lock whose owner is gone (or is me) is stale: removed and taken once more.
function Take-StartLock {
    for ($i = 0; $i -lt 2; $i++) {
        try { $fs = [IO.File]::Open($lockFile, 'CreateNew', 'Write', 'None'); $b = [Text.Encoding]::ASCII.GetBytes("$PID"); $fs.Write($b, 0, $b.Length); $fs.Close(); return $true }
        catch { if (Lock-Owner) { return $false }; Remove-Item $lockFile -Force -ErrorAction SilentlyContinue }
    }
    return $false
}
function Release-StartLock { try { if ([int](Get-Content $lockFile -ErrorAction Stop | Select-Object -First 1) -eq $PID) { Remove-Item $lockFile -Force } } catch { } }
function My-L2Alive { $p = Proc; return [bool]($p -and (-not $script:myL2 -or $p.Id -eq $script:myL2)) }
function GamePortOpen {
    try { $c = New-Object Net.Sockets.TcpClient; $t = $c.ConnectAsync($SwarmGameIp, $SwarmGamePort); $ok = $t.Wait(5000) -and $c.Connected; $c.Close(); return $ok } catch { return $false }
}
function McpJson($tool, $toolArgs) {
    $raw = Mcp $tool $toolArgs
    if ($raw -match '(?m)^data:\s*(\{.*\})\s*$') { $raw = $Matches[1] }
    $txt = (($raw | ConvertFrom-Json).result.content | Where-Object { $_.type -eq 'text' } | Select-Object -First 1).text
    try { return ($txt | ConvertFrom-Json) } catch { return $txt }
}

# RECONNECT BRAKE (2026-10-06): after the 06:05 mass drop all 12 accounts reconnected every ~30 s and the server's flood protection
# blocked our IP on the game port for 8 hours. Now: 3+ accounts offline for 3 min (or the game port is closed) -> close them (that stops
# L2Swarm's own retries), wait 3/6/12/24/30 min, test the game port, log in ONE account, and only when it is in game the rest, one by one.
# State: Logs\reconnect_brake.json. In-game (hooked) characters (Settings\client_mode.json = ingame) are never closed.
$brakeFile = "$root\Logs\reconnect_brake.json"
function Brake-Load { try { return (Get-Content $brakeFile -Raw -ErrorAction Stop | ConvertFrom-Json) } catch { return [pscustomobject]@{ active = $false; offlineSince = $null; round = 0; nextTry = $null; closed = @() } } }
function Brake-Save($b) { $b | ConvertTo-Json -Depth 5 | Set-Content $brakeFile -Encoding UTF8 }
function InGameChars { try { $m = Get-Content "$root\Settings\client_mode.json" -Raw | ConvertFrom-Json; return @($m.PSObject.Properties | Where-Object { $_.Value -eq 'ingame' } | ForEach-Object { $_.Name }) } catch { return @() } }
function CharOfConfig($cfg) { try { $x = Get-Content $cfg -Raw -ErrorAction Stop; if ($x -match '<SelectedCharacter>([^<]+)<') { return $Matches[1] } } catch { }; return '' }
function Reconnect-Brake {
    if (Lock-Owner) { return }                                     # a login run is busy: accounts are offline on purpose
    $b = Brake-Load
    $now = Get-Date
    if (-not $b.active) {
        try { $accs = @(McpJson 'get_accounts_status' @{}) } catch { return }
        $ingame = InGameChars
        $off = @($accs | Where-Object { $_.config_path -and -not $_.is_logged_in -and ($ingame -notcontains (CharOfConfig $_.config_path)) })
        if ($off.Count -lt 3) { if ($b.offlineSince) { $b.offlineSince = $null; Brake-Save $b }; return }
        if (-not $b.offlineSince) { $b.offlineSince = $now.ToString('s'); Brake-Save $b; Log $ctlLog "brake: $($off.Count) accounts offline - watching"; return }
        $mins = ($now - [datetime]$b.offlineSince).TotalMinutes
        $port = GamePortOpen
        if ($mins -lt 3 -and $port) { return }                     # L2Swarm usually gets them back within a minute or two by itself
        foreach ($a in $off) { try { [void](Mcp 'close_account' @{ account_id = $a.account_id }) } catch { } }
        $b = [pscustomobject]@{ active = $true; offlineSince = $b.offlineSince; round = 1; nextTry = $now.AddMinutes(3).ToString('s'); closed = @($off | ForEach-Object { $_.config_path }) }
        Brake-Save $b
        Log $ctlLog "brake: MASS DROP - $($off.Count) accounts offline $([int]$mins) min (game port $(if ($port) { 'open' } else { 'CLOSED' })) - closed them, first retry in 3 min"
        return
    }
    if ($now -lt [datetime]$b.nextTry) { return }
    $wait = [math]::Min(30, 3 * [math]::Pow(2, $b.round))          # 6, 12, 24, 30, 30 â€¦ minutes
    if (-not (GamePortOpen)) {
        $b.round++; $b.nextTry = $now.AddMinutes($wait).ToString('s'); Brake-Save $b
        Log $ctlLog "brake: game port 7778 still closed - next try in $wait min (round $($b.round))"; return
    }
    # the test login + the staggered logins take minutes: run them in their own process so this watch run (memory!) goes on
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Action', 'reopen')
    Log $ctlLog 'brake: game port open - started the test login (separate process)'
}
function Brake-Reopen {
    $b = Brake-Load
    if (-not $b.active -or -not @($b.closed).Count) { return }
    if (-not (Take-StartLock)) { return }
    $wait = [math]::Min(30, 3 * [math]::Pow(2, $b.round))
    try {
        $script:myL2 = (Proc).Id
        $first = @($b.closed)[0]
        try { [void](Mcp 'open_account' @{ config_path = $first }) } catch { }
        Log $ctlLog "brake: game port open - test login with $(Split-Path $first -Leaf)"
        Start-Sleep 60
        $in = $false
        try { $in = [bool](@(McpJson 'get_accounts_status' @{}) | Where-Object { $_.config_path -eq $first -and $_.is_logged_in }) } catch { }
        if (-not $in) {
            try { $a = @(McpJson 'get_accounts_status' @{}) | Where-Object { $_.config_path -eq $first } | Select-Object -First 1; if ($a) { [void](Mcp 'close_account' @{ account_id = $a.account_id }) } } catch { }
            $b.round++; $b.nextTry = (Get-Date).AddMinutes($wait).ToString('s'); Brake-Save $b
            Log $ctlLog "brake: test login failed - closed it again, next try in $wait min (round $($b.round))"; return
        }
        Log $ctlLog "brake: test login OK - logging the other $(@($b.closed).Count - 1) in one by one"
        $rest = @($b.closed | Select-Object -Skip 1)
        Brake-Save ([pscustomobject]@{ active = $false; offlineSince = $null; round = 0; nextTry = $null; closed = @() })
        Open-Configs $rest
        Log $ctlLog 'brake: done - everyone is back'
    } finally { Release-StartLock }
}
function AutoStartOk {
    $xml = Get-Content "$root\Settings\settings.xml" -Raw
    ($xml -match [regex]::Escape($SwarmMainConfig)) -and ($xml -notmatch 'AutoStartEntry[^>]*(OldTank|OldHeal|OldMage)')
}
function Stop-L2 {
    # Hard stop on purpose: a polite close (CloseMainWindow) pops L2Swarm's "are you sure?" dialog at whoever
    # sits at the PC, and a clean close also re-saves settings.xml from memory (that once overwrote AutoStart).
    # Configs live in Settings\*.xml, so nothing is lost.
    # EVERY L2Swarm process (2026-10-07 05:48: two were running after a double start; Proc returned only the first, one survived the Stop)
    $all = @(Get-Process L2Swarm -ErrorAction SilentlyContinue); if (-not $all.Count) { return }
    $l2Pids = @($all | ForEach-Object { $_.Id })
    foreach ($p in $all) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    foreach ($p in $all) { $null = $p.WaitForExit(15000) }; Start-Sleep 3
    # hooked game clients (l2.exe started by L2Swarm's Hook) inherit L2Swarm's sockets: left running, they keep MCP port 8083
    # busy and the new L2Swarm starts with MCP disabled (2026-10-04 13:06). Their hook dies with L2Swarm anyway: close them;
    # client_mode.ps1 (MemWatch) hooks the in-game characters again after the start.
    # Hook-mode audit 2026-10-07: only the clients L2Swarm started (parent pid = a killed L2Swarm) or client_mode.ps1 tracks - a game
    # client the user started by hand is not killed any more.
    $tracked = @()
    try { $h = Get-Content "$root\Logs\client_mode_hooks.json" -Raw -ErrorAction Stop | ConvertFrom-Json; $tracked += @($h.pids | ForEach-Object { [int]$_ }) } catch { }
    try { (Get-Content "$root\Logs\client_mode_state.json" -Raw -ErrorAction Stop | ConvertFrom-Json).PSObject.Properties | ForEach-Object { if ($_.Value.pid) { $tracked += [int]$_.Value.pid } } } catch { }
    foreach ($c in @(Get-CimInstance Win32_Process -Filter "Name='l2.exe'" -ErrorAction SilentlyContinue)) {
        if (($l2Pids -contains [int]$c.ParentProcessId) -or ($tracked -contains [int]$c.ProcessId)) { Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue }
        else { Log $ctlLog "stop: left l2.exe pid $($c.ProcessId) running (parent $($c.ParentProcessId) is not L2Swarm - a client started by hand)" }
    }
    Start-Sleep 2
}
function Start-L2 {
    # the start lock FIRST (before the "already running" check and Start-Process): two starts in the same second can no longer both pass
    if (-not (Take-StartLock)) { Log $ctlLog 'start: another login run holds the start lock - skipped'; return }
    try {
    Remove-Item "$root\Logs\l2swarm_stopped.flag" -ErrorAction SilentlyContinue   # a start clears the 'stopped on purpose' flag
    if (Proc) { Log $ctlLog 'start: already running'; return }
    # never let the old mage team auto-login (L2Swarm has overwritten AutoStart before)
    if (-not (AutoStartOk)) { Log $ctlLog 'start ABORTED: AutoStart list in settings.xml looks wrong'; return }
    # Staggered login (user 2026-10-04): L2Swarm's own AutoStart logs all 12 in within ~3 s and the login server's flood protection
    # then refuses every account for ~5 min. So: AutoStart entries are switched off (enabled="false", list kept), and after the start
    # this script opens the configs one by one through MCP, $loginGapSec apart, in the AutoStart order (Tank1 first).
    $sx = "$root\Settings\settings.xml"
    $xml = Get-Content $sx -Raw
    $configs = [regex]::Matches($xml, 'AutoStartEntry configPath="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
    # Settings\start_extra.txt: extra config paths (one per line) logged in after the AutoStart list â€” new academy accounts added on the
    # dashboard (2026-10-07; settings.xml is not touched while L2Swarm runs, it saves its own copy from memory)
    $extraFile = "$root\Settings\start_extra.txt"
    if (Test-Path $extraFile) {
        $extra = @(Get-Content $extraFile | ForEach-Object { $_.Trim() } | Where-Object { $_ -and (Test-Path $_) })
        foreach ($e in $extra) { if ($configs -notcontains $e) { $configs = @($configs) + $e } }
    }
    # Settings\start_hold.txt: config file names (one per line, e.g. Mylogin39.xml) that are NOT logged in (2026-10-07: isolating a memory explosion)
    $holdFile = "$root\Settings\start_hold.txt"
    if (Test-Path $holdFile) {
        $hold = @(Get-Content $holdFile | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        $configs = @($configs | Where-Object { $hold -notcontains (Split-Path $_ -Leaf) })
        Log $ctlLog ("start: holding back " + ($hold -join ', '))
    }
    $off = [regex]::Replace($xml, '(AutoStartEntry configPath="[^"]+") enabled="true"', '$1 enabled="false"')
    if ($off -ne $xml) { Copy-Item $sx "$root\Settings\backup\settings_before_stagger.xml" -Force; Set-Content $sx $off -NoNewline -Encoding UTF8 }
    Start-Process -FilePath $exe -WorkingDirectory $root
    Start-Sleep 3
    # 2026-10-06 17:32: L2Swarm crashed while this loop was logging in, MemWatch started a new L2Swarm, and this loop kept opening
    # accounts in the NEW process next to the new login run. The loop now remembers its L2Swarm and stops as soon as it is gone.
    $script:myL2 = (Proc).Id
    Log $ctlLog "start: L2Swarm started (pid $($script:myL2)) - logging in $($configs.Count) accounts one by one ($loginGapSec s apart)"
    Open-Configs $configs
    } finally { Release-StartLock }
}
function Open-Configs($configs) {
    # wait for MCP
    $up = $false
    for ($i = 0; $i -lt 60 -and -not $up; $i++) { Start-Sleep 2; try { [void](Mcp 'get_accounts_status' @{}); $up = $true } catch { } }
    if (-not $up) {
        # 2026-10-04 17:17: a start that overlapped a stop hung at startup (no log, no MCP). Retry once with a clean stop/start.
        if (-not $script:retried) {
            $script:retried = $true
            Log $ctlLog 'start: MCP did not come up - killing L2Swarm and starting once more'
            Release-StartLock; Stop-L2; Start-Sleep 5; Start-L2; return
        }
        Log $ctlLog 'start: MCP did not come up again - no accounts opened (open them in L2Swarm by hand)'; return
    }
    # L2Swarm creates an empty default account "Bot #1" when it starts with no AutoStart account (user 2026-10-04: "it must go"), and makes
    # a NEW one whenever the list becomes empty â€” so close it only after the first real account is open, and again at the end
    $closeEmpty = {
        try {
            $all = ((Mcp 'get_accounts_status' @{}) | ConvertFrom-Json).result.content[0].text | ConvertFrom-Json
            foreach ($a in @($all)) { if (-not $a.config_path) { [void](Mcp 'close_account' @{ account_id = $a.account_id }); Log $ctlLog "start: closed the empty default account ($($a.account_name))" } }
        } catch { Log $ctlLog "start: could not check for the default account: $_" }
    }
    $first = $true
    foreach ($c in $configs) {
        if (-not (My-L2Alive)) { Log $ctlLog "start: L2Swarm pid $($script:myL2) is gone (crash/restart) - this login run stops"; return }
        try { [void](Mcp 'open_account' @{ config_path = $c }); Log $ctlLog "start: opened $(Split-Path $c -Leaf)" } catch { Log $ctlLog "start: open $c failed: $_" }
        if ($first) { $first = $false; Start-Sleep 3; & $closeEmpty }
        Start-Sleep $loginGapSec
        # 2026-10-05: L2Swarm crashed 4 times (ObjectDisposedException in ThreadManager, bug #20), always 10-20 s after the 10th login (Mylogin10)
        # while the 11th was being opened. Give the party-1 scripts time to settle before party 2 logs in, and space party 2 out more.
        # (the extra 40 s after Saint1/Mylogin10/Mylogin11 against L2Swarm bug #20 is gone: it crashed at a login again on 2026-10-07 anyway)
    }
    & $closeEmpty
    Log $ctlLog 'start: all accounts opened'
    # 2026-10-06 00:30: after a server-side disconnect + restart the first 3 logins (Tank1, Bishop1, Destroyer1) silently failed and stayed
    # offline for 20 min. Check that every account is really in game and log in the missing ones again (3 rounds, 2 min apart).
    for ($round = 1; $round -le 3; $round++) {
        Start-Sleep 60
        if (-not (My-L2Alive)) { Log $ctlLog "start: L2Swarm pid $($script:myL2) is gone - login check stops"; return }
        $missing = @(); $notOpen = @()
        try {
            $raw = Mcp 'get_accounts_status' @{}
            if ($raw -match '(?m)^data:\s*(\{.*\})\s*$') { $raw = $Matches[1] }   # event-stream reply
            $txt = (($raw | ConvertFrom-Json).result.content | Where-Object { $_.type -eq 'text' } | Select-Object -First 1).text
            $accs = $txt | ConvertFrom-Json
            # never an in-game (hooked) character: MCP reports a hooked account with is_logged_in=false (bug report #2), and a 'load'
            # here logs it in OUT of game on top of its game client (hook-mode audit 2026-10-07)
            $ingame = InGameChars
            $missing = @($accs | Where-Object { $_.config_path -and -not $_.is_logged_in -and ($ingame -notcontains (CharOfConfig $_.config_path)) })
            # 2026-10-07 15:50: "open Bishop1.xml failed: timeout" -> the account never appeared in the list, the check said "everyone is in game"
            # and the healer stayed offline for 75 min (party Tank1 wiped at Hellion without her). Configs missing from the list are opened again.
            $have = @{}; foreach ($a in @($accs)) { if ($a.config_path) { $have[[IO.Path]::GetFileName([string]$a.config_path).ToLower()] = $true } }
            $notOpen = @($configs | Where-Object { -not $have[[IO.Path]::GetFileName([string]$_).ToLower()] })
        } catch { Log $ctlLog "start: login check failed: $_"; break }
        foreach ($c in $notOpen) {
            if (-not (My-L2Alive)) { break }
            try { [void](Mcp 'open_account' @{ config_path = $c }); Log $ctlLog "start: $(Split-Path $c -Leaf) was never opened - opening it again (round $round)" } catch { Log $ctlLog "start: reopen $c failed: $_" }
            Start-Sleep $loginGapSec
        }
        if (-not $missing.Count -and -not $notOpen.Count) { Log $ctlLog "start: login check round ${round}: everyone is in game"; break }
        foreach ($a in $missing) {
            try { [void](Mcp 'manage_account_config' @{ account_id = $a.account_id; action = 'load'; config_path = $a.config_path }); Log $ctlLog "start: $($a.account_name) was not in game - login started again (round $round)" } catch { }
            Start-Sleep $loginGapSec
        }
        Start-Sleep 60
    }
}
# seconds between two logins (user 2026-10-07: "it takes way too long to log back in" - 20 s x 39 accounts = 14 min). Settings\login_gap.txt
# overrides it. 12 logins within 3 s were refused for 5 min on 2026-10-04, so never below 5.
$loginGapSec = 8
if ($SwarmLoginGap -ge 5) { $loginGapSec = $SwarmLoginGap }   # swarm.config.json login.gapSeconds; Settings\login_gap.txt still wins
try { $g = [int]((Get-Content "$root\Settings\login_gap.txt" -ErrorAction Stop | Select-Object -First 1).Trim()); if ($g -ge 5) { $loginGapSec = $g } } catch { }
function Mcp($tool, $toolArgs) {
    $u = $SwarmMcpUrl
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri $u -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"l2swarm_ctl","version":"1"}}}'
    $h = @{}; $sid = $r.Headers['Mcp-Session-Id']; if ($sid) { $h['Mcp-Session-Id'] = $sid }
    $b = @{ jsonrpc = '2.0'; id = 2; method = 'tools/call'; params = @{ name = $tool; arguments = $toolArgs } } | ConvertTo-Json -Depth 8
    (Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri $u -Method Post -Headers $h -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($b))).Content
}

# 2026-10-05 17:09: a MemWatch emergency restart and a manual Restart ran at the same time -> two login loops opened every account twice.
# A start/restart (and a watch restart) now steps aside while another start/restart/watch of this script is already starting L2Swarm.
function OtherStartRunning {
    if (Lock-Owner) { return $true }                                  # a login run (start, watch crash-restart, reconnect brake) holds the lock
    @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'l2swarm_ctl\.ps1.*(start|restart)' }).Count -gt 0
}
switch ($Action) {
    'start'   { if (OtherStartRunning) { Log $ctlLog 'start: another start/restart is already running - skipped'; exit 0 }; Start-L2 }
    'reopen'  { Brake-Reopen }
    'stop'    { Log $ctlLog 'stop requested'; Set-Content "$root\Logs\l2swarm_stopped.flag" (Get-Date -Format s); Stop-L2; Log $ctlLog 'stop: done' }
    'restart' { if (OtherStartRunning) { Log $ctlLog 'restart: another start/restart is already running - skipped'; exit 0 }; if (-not (Take-StartLock)) { Log $ctlLog 'restart: another start/restart holds the start lock - skipped'; exit 0 }; Log $ctlLog 'restart requested'; Stop-L2; Start-Sleep 5; Start-L2 }
    'watch' {
        $p = Proc
        if (-not $p) {
            # crashed (2026-10-05 02:51: ObjectDisposedException in L2Swarm's ThreadManager while logging in): start it again, unless it was
            # stopped on purpose (the Stop task writes Logs\l2swarm_stopped.flag) or a Start is already running
            $flag = "$root\Logs\l2swarm_stopped.flag"
            $starting = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'l2swarm_ctl\.ps1.*(start|restart)' }
            if (-not (Test-Path $flag) -and -not $starting -and -not (Lock-Owner)) { Log $ctlLog 'watch: L2Swarm is not running (crash?) - starting it'; Start-L2 }
            exit 0
        }
        try { Reconnect-Brake } catch { Log $ctlLog "brake error: $_" }
        # MINIMIZE until patch v6 is installed (2026-10-08 10:15, user away from home): the UI deadlock needs L2Swarm's window to be drawing
        # the shown account's mob grid / world map; a minimized WPF window does not render. Re-minimized at every run if restored; remove this
        # block (or create Logs\keep_window_open.flag) once v6 is installed.
        try {
            if (-not (Test-Path "$root\Logs\keep_window_open.flag") -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
                if (-not ('L2Win' -as [type])) { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class L2Win { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int cmd); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); }' }
                if (-not [L2Win]::IsIconic($p.MainWindowHandle)) { [void][L2Win]::ShowWindowAsync($p.MainWindowHandle, 6); Log $ctlLog "window: minimized L2Swarm (deadlock risk until patch v6)" }
            }
        } catch { Log $ctlLog "window minimize error: $_" }
        # DEADLOCK RESTART (user OK 2026-10-08 08:00; docs/plan/snapwire_freeze_2026-10-08.md): L2Swarm's UI thread and a StartCombat() deadlock on
        # the CombatBlackList lock (SubMobs.RefreshMobRows sync Dispatcher.Invoke). Nothing recovers it (02:19 -> 19 bots frozen 4 h). Restart only
        # when ALL hold: L2Swarm up > 6 min, no start/restart running, MCP initialize fails 3x (10 s each), and (a script hang ("ran JS for") in the
        # last 5 min OR >= 5 state files silent > 90 s). Max one deadlock restart per 15 min. Patch v6 removes the cause.
        try {
            if (((Get-Date) - $p.StartTime).TotalMinutes -gt 6 -and -not (OtherStartRunning) -and -not (Lock-Owner)) {
                $cut = (Get-Date).AddMinutes(-5)
                $hangs = @(Get-Content "$root\Logs\LOG.log" -Tail 4000 -ErrorAction SilentlyContinue | Where-Object { $_ -match 'ExecutionWatchdog' -and $_.Length -ge 19 -and ([datetime]::ParseExact($_.Substring(0, 19), 'yyyy-MM-dd HH:mm:ss', $null) -gt $cut) }).Count
                $silent = @(Get-ChildItem "$root\Logs\swarm_state_*.json" -ErrorAction SilentlyContinue | Where-Object { $a = ((Get-Date) - $_.LastWriteTime).TotalSeconds; $a -gt 90 -and $a -lt 3600 }).Count
                if ($hangs -gt 0 -or $silent -ge 5) {
                    $fails = 0
                    for ($k = 0; $k -lt 3; $k++) {
                        try { [void](Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri $SwarmMcpUrl -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"deadlockcheck","version":"1"}}}') } catch { $fails++ }
                        if ($fails -le $k) { break }
                        Start-Sleep 5
                    }
                    if ($fails -ge 3) {
                        $lastDl = Get-Content $memLog -ErrorAction SilentlyContinue | Where-Object { $_ -match ' DEADLOCK RESTART ' } | Select-Object -Last 1
                        $recent = $lastDl -and ((Get-Date) - [datetime]::ParseExact($lastDl.Substring(0, 19), 'yyyy-MM-dd HH:mm:ss', $null)).TotalMinutes -lt 15
                        if (-not $recent -and (Take-StartLock)) {
                            Log $memLog "DEADLOCK RESTART L2Swarm: MCP failed 3x, script hangs in 5 min=$hangs, silent scripts=$silent"
                            Stop-L2; Start-Sleep 5; Start-L2; exit 0
                        } elseif ($recent) { Log $memLog "DEADLOCK suspected (hangs=$hangs silent=$silent) but a deadlock restart ran < 15 min ago" }
                    }
                }
            }
        } catch { Log $ctlLog "deadlock check error: $_" }
        # performance audit 2026-10-07 (user: "optimize for performance"): the Start task launches L2Swarm at BelowNormal (Task Scheduler
        # default), so Windows parked it on the slow E-cores while the P-cores idled. This elevated watch raises it to Normal.
        try { if ($p.PriorityClass -ne 'Normal') { $old = $p.PriorityClass; $p.PriorityClass = 'Normal'; Log $ctlLog "priority: L2Swarm $old -> Normal" } } catch { Log $ctlLog "priority error: $_" }
        # user 2026-10-07 23:20 "make it use the P-cores": Windows 11 EcoQoS/power throttling can keep a process on the E-cores even at Normal
        # priority. ProcessPowerThrottling (class 4): ControlMask = EXECUTION_SPEED (1), StateMask = 0 -> throttling OFF (= high QoS, P-cores
        # allowed). No hard affinity: L2Swarm needs 4-5 cores, the i5-1235U has only 2 P-cores (logical 0-3) + 8 E-cores (4-11).
        try {
            if (-not ('L2PT' -as [type])) { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class L2PT { [StructLayout(LayoutKind.Sequential)] public struct S { public uint Version; public uint ControlMask; public uint StateMask; } [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetProcessInformation(IntPtr h, int cls, ref S info, int size); public static bool Off(IntPtr h) { var s = new S { Version = 1, ControlMask = 1, StateMask = 0 }; return SetProcessInformation(h, 4, ref s, Marshal.SizeOf(typeof(S))); } }' }
            $ok = [L2PT]::Off($p.Handle); $ptf = "$root\Logs\power_throttling_pid.txt"
            if ((Get-Content $ptf -ErrorAction SilentlyContinue) -ne "$($p.Id)") { Set-Content $ptf "$($p.Id)"; Log $ctlLog "power throttling (EcoQoS) off for L2Swarm pid $($p.Id): $ok" }
        } catch { Log $ctlLog "power throttling error: $_" }
        # client modes (Settings\client_mode.json, user request 2026-10-04): in-game via L2Swarm's Hook button
        try { if (Test-Path "$root\Logs\uia_probe.flag") { Remove-Item "$root\Logs\uia_probe.flag" -Force; & "$root\docs\plan\tools\client_mode.ps1" -Probe } else { & "$root\docs\plan\tools\client_mode.ps1" } } catch { Log $ctlLog "client_mode error: $_" }
        $mb     = [int]($p.PrivateMemorySize64 / 1MB)
        $freeMB = [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB)
        $line   = "L2Swarm private=${mb}MB threads=$($p.Threads.Count) handles=$($p.HandleCount) pcFree=${freeMB}MB commitFree=${commitMB}MB"
        # 2026-10-05 17:51: restarted at 2.7 GB because Claude Code (1.8 GB), Discord and Chrome filled the PC â€” L2Swarm itself must be big too.
        # user 2026-10-04: no restart just because L2Swarm is big (> $restartMB); only when the PC itself is about to run out of RAM
        $commitMB = [int]((Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory / 1KB); $need = ($commitMB -lt $minCommitMB); $line = "L2Swarm private=${mb}MB threads=$($p.Threads.Count) handles=$($p.HandleCount) pcFree=${freeMB}MB commitFree=${commitMB}MB"
        # 2026-10-04 17:44: L2Swarm went 2 -> 8.8 GB in < 3 min (PC 30 MB free) between two 2-min checks. Keep watching every 10 s
        # for ~100 s inside this run (the task runs every 2 min, so the watch is practically continuous).
        for ($k = 0; $k -lt 10 -and -not $need; $k++) {
            Start-Sleep 10
            $p = Proc; if (-not $p) { exit 0 }
            $mb     = [int]($p.PrivateMemorySize64 / 1MB)
            $freeMB = [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB)
            $commitMB = [int]((Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory / 1KB); $need = ($commitMB -lt $minCommitMB)
            $line   = "L2Swarm private=${mb}MB threads=$($p.Threads.Count) handles=$($p.HandleCount) pcFree=${freeMB}MB commitFree=${commitMB}MB"
        }
        $emergency = $need -and ($commitMB -lt $emergencyCommitMB)   # nearly out of RAM, or L2Swarm above the hard cap: restart even inside the cooldown
        if (-not $need) {
            Log $memLog $(if ($mb -gt $warnMB) { "WARN $line" } else { "ok   $line" })
            if ((Get-Item $memLog).Length -gt 2MB) { Get-Content $memLog -Tail 3000 | Set-Content "$memLog.tmp"; Move-Item "$memLog.tmp" $memLog -Force }
            exit 0
        }
        # user 2026-10-07 19:55: never break a live raid / Kamaloka for memory unless the PC is truly out of memory (emergency)
        if (-not $emergency) {
            foreach ($lf in @(Get-ChildItem "$root\Logs\raid_live*.json", "$root\Logs\kamaloka_live*.json" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })) {   # LIVE PER PARTY 2026-10-09: one file per leader
                try { $j = Get-Content $lf -Raw -ErrorAction Stop | ConvertFrom-Json; $age = ((Get-Date).ToUniversalTime() - [datetime]::Parse($j.updatedAt).ToUniversalTime()).TotalSeconds
                      if ($age -lt 60 -and $j.phase -ne 'done') { Log $memLog "HIGH $line (live fight in $(Split-Path $lf -Leaf) - no restart)"; exit 0 } } catch { }
            }
        }
        $last = Get-Content $memLog -ErrorAction SilentlyContinue | Where-Object { $_ -match ' RESTART ' } | Select-Object -Last 1
        if (-not $emergency -and $last -and ((Get-Date) - [datetime]::ParseExact($last.Substring(0,19), 'yyyy-MM-dd HH:mm:ss', $null)).TotalMinutes -lt $cooldown) {
            Log $memLog "HIGH $line (restart on cooldown)"; exit 0
        }
        # EMERGENCY beats a running login run (2026-10-07 10:41: the 10:25 restart run was still in its login check, MemWatch skipped and
        # L2Swarm reached 11.4 GB with 243 MB free on the PC): stop that run, take its lock, restart
        if ($emergency -and (OtherStartRunning)) {
            $owner = Lock-Owner
            Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and ($_.ProcessId -eq $owner -or $_.CommandLine -match 'l2swarm_ctl\.ps1.*(start|restart)') } |
                ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
            Start-Sleep 1; Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
            Log $memLog "EMERGENCY $line - stopped the running login run (lock owner $owner)"
        }
        if (OtherStartRunning) { Log $memLog "HIGH $line (a start/restart is already running)"; exit 0 }
        if (-not (Take-StartLock)) { Log $memLog "HIGH $line (another start/restart holds the start lock)"; exit 0 }   # lock BEFORE the stop (2026-10-07 double start)
        Log $memLog "RESTART $line"
        Stop-L2; Start-Sleep 5; Start-L2
    }
}
