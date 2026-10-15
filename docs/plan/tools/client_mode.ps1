# Client mode per character: 'ingame' (L2Swarm "Hook" button: logs the OOG session out, starts l2.exe, injects the hook and
# types the login) or 'oog' (out of game, socket only). Wanted modes live in Settings\client_mode.json, e.g. {"Tank1":"ingame"}.
# L2Swarm runs as admin, so UI Automation only works from an elevated process: l2swarm_ctl.ps1 'watch' (MemWatch task, every
# 2 min, elevated) calls this script. Usage: client_mode.ps1 [-Probe]   (-Probe dumps the UI tree to Logs\uia_dump.txt)
#
# Hook-mode audit 2026-10-07 (docs/plan/hookmode_audit_2026-10-07.md) - guards added here, all PROVEN from the 3.8.8 IL:
#  - btnHook is ONE button for the whole window: L2Swarm disables it when pressed and enables it again only when that l2.exe EXITS
#    (MainForm <btnHook_Click>b__1). So only one hooked client per L2Swarm session; a disabled button is never pressed.
#  - A config without <L2ExePath> makes btnHook_Click open a modal "Select L2.exe" file dialog (blocks L2Swarm's window): never pressed.
#  - The auto-login types name + password with GLOBAL SendInput keystrokes into whatever window is in front (L2WindowLoginTyper,
#    foreground checked only once): only hook when the user has not touched mouse/keyboard for 60 s.
#  - No hooking while a login run holds Logs\l2swarm_starting.lock or L2Swarm is younger than 3 min (the login check of l2swarm_ctl
#    would re-login the account out of game on top of the client).
#  - Hook loop brake: at most 3 hooks per character per 60 min (2026-10-04: 5 hooks 21:15-22:33, each killed again by a restart/deploy).
#  - The 4-min "not in game" check used account_name, which never matches a hooked account ("No account matches"): it now uses the
#    config path + the swarm_state_<name>.json heartbeat written by swarm.js.
#  - Orphans / Stop: only l2.exe clients started by an L2Swarm (parent pid) or tracked by this script are closed; a game client the
#    user started himself is left alone.
param([switch]$Probe, [switch]$NoUi)   # NOUI-2026-10-13: -NoUi = L2Swarm runs headless (3.8.18 /NoUi) -> hook through MCP manage_hook, no UI Automation
$root = (Resolve-Path "$PSScriptRoot\..\..\..").Path   # portable install (2026-10-07)
try { . "$PSScriptRoot\swarm_config.ps1"; if ($SwarmRoot) { $root = $SwarmRoot } } catch { }
$log  = "$root\Logs\client_mode.log"
function Log($m) { Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" }

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [Windows.Automation.AutomationElement]
$p = Get-Process L2Swarm -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) { exit 0 }
$cond = New-Object Windows.Automation.PropertyCondition($AE::ProcessIdProperty, $p.Id)
$win = $AE::RootElement.FindFirst([Windows.Automation.TreeScope]::Children, $cond)
if (-not $win -and -not $NoUi) { exit 0 }

if ($Probe) {
    $out = New-Object System.Collections.Generic.List[string]
    function Walk($e, $d) {
        if ($d -gt 14) { return }
        $c = $e.Current
        $pats = ($e.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName -replace 'PatternIdentifiers.Pattern','' }) -join ','
        $out.Add(('  ' * $d) + "$($c.ControlType.ProgrammaticName -replace 'ControlType.','') id='$($c.AutomationId)' name='$($c.Name)' class='$($c.ClassName)' [$pats]")
        $kids = $e.FindAll([Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition)
        foreach ($k in $kids) { Walk $k ($d + 1) }
    }
    Walk $win 0
    $out | Set-Content "$root\Logs\uia_dump.txt" -Encoding UTF8
    Log "probe: dumped $($out.Count) elements"
    exit 0
}

# --- apply the wanted modes --------------------------------------------------------
$modeFile = "$root\Settings\client_mode.json"
if (-not (Test-Path $modeFile)) { exit 0 }
$modes = Get-Content $modeFile -Raw | ConvertFrom-Json
$stateFile = "$root\Logs\client_mode_state.json"          # name -> { pid, at } of the l2.exe we started
$st = @{}; if (Test-Path $stateFile) { (Get-Content $stateFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $st[$_.Name] = $_.Value } }
function SaveState { $st | ConvertTo-Json | Set-Content $stateFile -Encoding UTF8 }
function Alive($procId) { $procId -and (Get-Process -Id $procId -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^l2$' }) }

# every L2Swarm pid this script has seen (last 20): an l2.exe whose parent is one of them was started by an L2Swarm Hook
$pidsFile = "$root\Logs\client_mode_l2swarm_pids.txt"
$knownL2 = @(); try { $knownL2 = @(Get-Content $pidsFile -ErrorAction Stop | ForEach-Object { [int]$_ }) } catch { }
if ($knownL2 -notcontains $p.Id) { $knownL2 = @($knownL2 + $p.Id | Select-Object -Last 20); $knownL2 | Set-Content $pidsFile }
# every l2.exe pid this script ever hooked (last 50)
$histFile = "$root\Logs\client_mode_hooks.json"          # { pids: [..], hooks: { name: [iso times] } }
$hist = [pscustomobject]@{ pids = @(); hooks = [pscustomobject]@{} }
try { $h = Get-Content $histFile -Raw -ErrorAction Stop | ConvertFrom-Json; if ($h) { $hist = $h; if (-not $hist.hooks) { $hist | Add-Member -Force hooks ([pscustomobject]@{}) }; if (-not $hist.pids) { $hist | Add-Member -Force pids @() } } } catch { }
function SaveHist { try { $hist | ConvertTo-Json -Depth 5 | Set-Content $histFile -Encoding UTF8 } catch { } }
function L2Procs { @(Get-CimInstance Win32_Process -Filter "Name='l2.exe'" -ErrorAction SilentlyContinue) }

function Mcp($tool, $toolArgs) {
    $u = $(if ($SwarmMcpUrl) { $SwarmMcpUrl } else { 'http://127.0.0.1:8083' })
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri $u -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"client_mode","version":"1"}}}'
    $h = @{}; $sid = $r.Headers['Mcp-Session-Id']; if ($sid) { $h['Mcp-Session-Id'] = $sid }
    $b = @{ jsonrpc = '2.0'; id = 2; method = 'tools/call'; params = @{ name = $tool; arguments = $toolArgs } } | ConvertTo-Json -Depth 8
    (Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri $u -Method Post -Headers $h -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($b))).Content
}
$script:openCfgs = $null
function ConfigOf($name) {
    $pat = "<SelectedCharacter>$([regex]::Escape($name))<"
    # two XML files can name the same character (mylogin1.xml/OldTank.xml, Mylogin41.xml/Mylogin38.xml): the config of an OPEN account wins
    if ($null -eq $script:openCfgs) {
        $script:openCfgs = @()
        try { $script:openCfgs = @((((Mcp 'get_accounts_status' @{}) | ConvertFrom-Json).result.content[0].text | ConvertFrom-Json) | ForEach-Object { $_.config_path } | Where-Object { $_ }) } catch { }
    }
    $open = $script:openCfgs | Where-Object { (Test-Path $_) -and (Select-String -Path $_ -Pattern $pat -Quiet) } | Select-Object -First 1
    if ($open) { return $open }
    (Get-ChildItem "$root\Settings\*.xml" | Where-Object { $_.Name -ne 'settings.xml' -and (Select-String -Path $_.FullName -Pattern $pat -Quiet) } | Select-Object -First 1).FullName
}
# seconds since the last mouse/keyboard input of the logged-on user (the Hook's auto-login types with global keystrokes)
function UserIdleSec {
    try {
        if (-not ('CMIdle' -as [type])) { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class CMIdle { [StructLayout(LayoutKind.Sequential)] struct LII { public uint cbSize; public uint dwTime; } [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII p); public static double Sec() { var l = new LII(); l.cbSize = (uint)Marshal.SizeOf(typeof(LII)); if (!GetLastInputInfo(ref l)) return -1; return unchecked((uint)Environment.TickCount - l.dwTime) / 1000.0; } }' }
        return [CMIdle]::Sec()
    } catch { return -1 }
}
# is the character really in game in its hooked client? MCP by config path (is_logged_in), else the swarm.js heartbeat file
# (Logs\swarm_state_<name>.json, rewritten every few seconds while the character is in game) newer than the hook.
# Returns $true / $false, or $null when nothing can be told (MCP down and no heartbeat) -> leave the client alone.
function InGame($name, $since) {
    $cfg = ConfigOf $name
    if ($cfg) {
        try {
            $j = ((Mcp 'get_account_status' @{ config_path = $cfg }) | ConvertFrom-Json).result.content[0].text | ConvertFrom-Json
            if ($j.is_logged_in) { return $true }
        } catch { }
    }
    $hb = "$root\Logs\swarm_state_$name.json"
    if (Test-Path $hb) {
        $t = (Get-Item $hb).LastWriteTime
        if ($t -gt $since -and ((Get-Date) - $t).TotalMinutes -lt 3) { return $true }
        return $false
    }
    return $null
}

function FindAll($cond) { $win.FindAll([Windows.Automation.TreeScope]::Descendants, $cond) }
function HookCharacter($name) {
    # 0) guards (see the header)
    $cfg = ConfigOf $name
    if (-not $cfg) { Log "hook ${name}: no config with <SelectedCharacter>$name< in Settings - not pressing Hook"; return $false }
    $exe = ''; try { if ((Get-Content $cfg -Raw) -match '<L2ExePath>([^<]+)<') { $exe = $Matches[1] } } catch { }
    if (-not $exe -or -not (Test-Path $exe)) { Log "hook ${name}: $(Split-Path $cfg -Leaf) has no valid <L2ExePath> ('$exe') - L2Swarm would open a modal 'Select L2.exe' dialog; set the path first (close account, edit XML, open) - not pressing Hook"; return $false }
    if ($NoUi) {
        $idle = UserIdleSec
        if ($idle -ge 0 -and $idle -lt 60) { Log "hook ${name}: waiting - the user was active $([int]$idle) s ago (auto-login types with global keystrokes)"; return $false }
        $before = @(Get-Process l2 -ErrorAction SilentlyContinue | ForEach-Object Id)
        try { $r = Mcp 'manage_hook' @{ action = 'start'; account_name = $cfg }; Log "hook ${name}: manage_hook start -> $(($r | ConvertFrom-Json).result.content[0].text)" }
        catch { Log "hook ${name}: manage_hook start failed: $_"; return $false }
        $times = @(); try { $times = @(@($hist.hooks.$name) | Where-Object { $_ }) } catch { }
        $hist.hooks | Add-Member -Force $name (@($times + (Get-Date).ToString('s') | Select-Object -Last 10)); SaveHist
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep 2
            $new = L2Procs | Where-Object { $before -notcontains [int]$_.ProcessId -and [int]$_.ParentProcessId -eq $p.Id } | Select-Object -First 1
            if ($new) { $np = [int]$new.ProcessId; $st[$name] = @{ pid = $np; at = (Get-Date).ToString('s') }; SaveState
                        $hist.pids = @(@($hist.pids) + $np | Select-Object -Last 50); SaveHist; Log "hook ${name}: l2.exe started (pid $np) via manage_hook"; return $true }
        }
        Log "hook ${name}: manage_hook gave no new l2.exe within 60 s (status: $(try { (Mcp 'manage_hook' @{ action = 'status'; account_name = $cfg }) } catch { $_ }))"; return $false
    }
    # 2026-10-10 (L2Swarm 3.8.14): the account detail panel with btnHook only exists AFTER an account is selected (before that the main
    # area is a LoadingAnimation) -> the button is looked up after the selection below; here only "another hooked client" when it shows
    $hookCond = New-Object Windows.Automation.PropertyCondition($AE::AutomationIdProperty, 'btnHook')
    $btn = $win.FindFirst([Windows.Automation.TreeScope]::Descendants, $hookCond)
    if ($btn -and -not $btn.Current.IsEnabled) { Log "hook ${name}: the Hook button is disabled - another hooked client is still running (L2Swarm allows ONE hooked client at a time; the button comes back when that l2.exe exits)"; return $false }
    $idle = UserIdleSec
    if ($idle -ge 0 -and $idle -lt 60) { Log "hook ${name}: waiting - the user was active $([int]$idle) s ago (the Hook auto-login types the password with global keystrokes into the front window)"; return $false }
    # 1) select the account in L2Swarm's account list (a list item whose text contains the character name)
    $items = FindAll ([Windows.Automation.Condition]::TrueCondition) | Where-Object {
        $_.Current.ControlType.ProgrammaticName -match 'ListItem|DataItem|TreeItem' -and $_.Current.Name -match [regex]::Escape($name) }
    if (-not $items) {   # the item name may be a data object: look at its text children
        $items = FindAll ([Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.ControlType.ProgrammaticName -match 'ListItem|DataItem' } | Where-Object {
            ($_.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.Name -match "\b$([regex]::Escape($name))\b" }) }
    }
    if (-not @($items).Count) {
        # 2026-10-12 (59 accounts, Tank1 "not found" for an hour): the list is VIRTUALIZED - rows out of view do not exist for UI Automation.
        # Scroll every scrollable container top -> bottom in steps and look again after each step.
        $match = { FindAll ([Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.ControlType.ProgrammaticName -match 'ListItem|DataItem' } | Where-Object {
            $_.Current.Name -match [regex]::Escape($name) -or ($_.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.Name -match "\b$([regex]::Escape($name))\b" }) } }
        $scrollers = @(FindAll ([Windows.Automation.Condition]::TrueCondition) | Where-Object { try { $_.GetCurrentPattern([Windows.Automation.ScrollPattern]::Pattern).Current.VerticallyScrollable } catch { $false } })
        foreach ($sc in $scrollers) {
            $sp = $sc.GetCurrentPattern([Windows.Automation.ScrollPattern]::Pattern)
            for ($v = 0; $v -le 100 -and -not @($items).Count; $v += 8) { try { $sp.SetScrollPercent([Windows.Automation.ScrollPattern]::NoScroll, [double]$v); Start-Sleep -Milliseconds 250 } catch { break }; $items = & $match }
            if (@($items).Count) { Log "hook ${name}: found after scrolling the account list"; break }
        }
    }
    if (-not @($items).Count) { Log "hook ${name}: account not found in the L2Swarm list (run with -Probe and check Logs\uia_dump.txt)"; return $false }
    # 2026-10-10 (Dagger1 after a close/open sat at the bottom of a 39-account list: "could not select"): scroll each matching row into
    # view, select it, and take the first one that really reports IsSelected (another list can show the same name). Safety: never hook
    # the wrong one - the list item's own selection state must say so (the window title is whatever swarm.js set last).
    $sel = $false; $item = $null
    foreach ($cand in @($items)) {
        try { $cand.GetCurrentPattern([Windows.Automation.ScrollItemPattern]::Pattern).ScrollIntoView(); Start-Sleep -Milliseconds 400 } catch { }
        try { $cand.GetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern).Select() } catch { try { $cand.SetFocus() } catch {} }
        Start-Sleep -Milliseconds 1500
        $ok = $false; try { $ok = $cand.GetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern).Current.IsSelected } catch {}
        if ($ok) { $sel = $true; $item = $cand; break }
    }
    if ($sel) { Log "hook ${name}: selected its row in the account list ($(@($items).Count) matching rows)" }
    if (-not $sel) { Log "hook ${name}: could not select $name in the account list - not pressing Hook"; return $false }
    # the selected account's panel loads now: wait up to 15 s for its Hook button
    $btn = $null; for ($w = 0; $w -lt 15 -and -not $btn; $w++) { Start-Sleep 1; $btn = $win.FindFirst([Windows.Automation.TreeScope]::Descendants, $hookCond) }
    if (-not $btn) { Log "hook ${name}: selected, but no btnHook appeared within 15 s (run with -Probe)"; return $false }
    if (-not $btn.Current.IsEnabled) { Log "hook ${name}: the Hook button is disabled - another hooked client is still running"; return $false }
    # 2) press the Hook button (x:Name btnHook -> AutomationId)
    $before = @(Get-Process l2 -ErrorAction SilentlyContinue | ForEach-Object Id)
    try { $btn.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke() } catch { Log "hook ${name}: pressing Hook failed: $($_.Exception.Message)"; return $false }
    Log "hook ${name}: pressed Hook - waiting for l2.exe"
    $times = @(); try { $times = @(@($hist.hooks.$name) | Where-Object { $_ }) } catch { }
    $hist.hooks | Add-Member -Force $name (@($times + (Get-Date).ToString('s') | Select-Object -Last 10)); SaveHist
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep 2
        # the new client is a CHILD of L2Swarm (Process.Start in <btnHook_Click>b__0); a client the user starts at the same moment is not
        $new = L2Procs | Where-Object { $before -notcontains [int]$_.ProcessId -and [int]$_.ParentProcessId -eq $p.Id } | Select-Object -First 1
        if ($new) {
            $np = [int]$new.ProcessId
            $st[$name] = @{ pid = $np; at = (Get-Date).ToString('s') }; SaveState
            $hist.pids = @(@($hist.pids) + $np | Select-Object -Last 50); SaveHist
            Log "hook ${name}: l2.exe started (pid $np)"; return $true
        }
    }
    Log "hook ${name}: no new l2.exe appeared"; return $false
}

# l2.exe clients started by an EARLIER L2Swarm are orphans (their hook died with it): close them, otherwise every L2Swarm restart leaves
# one more client eating RAM (and holding MCP port 8083, bug report #3). Their characters are hooked again below. Only clients whose
# parent was an L2Swarm we have seen, or that this script hooked itself - never a game client the user started by hand.
$l2Start = $p.StartTime
L2Procs | Where-Object { [int]$_.ParentProcessId -ne $p.Id } | ForEach-Object {
    $cp = [int]$_.ProcessId; $pp = [int]$_.ParentProcessId
    $ours = ($knownL2 -contains $pp) -or (@($hist.pids) -contains $cp) -or (@($st.Values | ForEach-Object { $_.pid }) -contains $cp)
    $proc = Get-Process -Id $cp -ErrorAction SilentlyContinue
    if ($ours -and $proc -and $proc.StartTime -lt $l2Start) {
        Log "orphan l2.exe pid $cp (parent $pp, started $($proc.StartTime), before L2Swarm $l2Start) - closing it"
        Stop-Process -Id $cp -Force -ErrorAction SilentlyContinue
        foreach ($k in @($st.Keys)) { if ($st[$k].pid -eq $cp) { $st.Remove($k) } }
        SaveState
    }
}
# forget clients that are gone (swarm.js closeClientBoard reads this file: a stale pid could be a reused pid of another program)
foreach ($k in @($st.Keys)) { $v = $st[$k]; if ($v.pid -and -not (Alive $v.pid)) { $st[$k] = @{ tried = $v.tried; gone = $v.pid }; SaveState } }
# ANY CRASHED CLIENT (2026-10-14: Tank1's l2.exe showed "LineageII Crash Report" for ~2 h, but its pid was no longer in the state file, so the
# tracked-pid check below never saw it; every re-hook gave "no new l2.exe within 60 s" and Tank1 stood frozen while his party gathered around a
# ghost): every l2.exe showing the crash report is dead - close it, whoever it belonged to; the next hook starts a fresh client
foreach ($cp in @(Get-Process l2 -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'Crash' })) {
    $owner = ($st.Keys | Where-Object { $st[$_].pid -eq $cp.Id } | Select-Object -First 1)
    Log "crashed client: l2.exe pid $($cp.Id) shows '$($cp.MainWindowTitle)'$(if ($owner) { " ($owner)" } else { ' (not tracked)' }) - closing it"
    Stop-Process -Id $cp.Id -Force -ErrorAction SilentlyContinue
    if ($owner) { $st[$owner] = @{ tried = $null }; SaveState }
}

# no hooking while a login run is busy or L2Swarm just started (all accounts are still logging in OOG)
$lockFile = "$root\Logs\l2swarm_starting.lock"
$loginBusy = $false
try { $o = [int](Get-Content $lockFile -ErrorAction Stop | Select-Object -First 1); if ($o -and (Get-Process -Id $o -ErrorAction SilentlyContinue)) { $loginBusy = $true } } catch { }
$young = ((Get-Date) - $l2Start).TotalMinutes -lt 3

# a tracked, running client whose character is no longer listed in client_mode.json = the user took it out -> out of game
$wanted = @{}; foreach ($prop in $modes.PSObject.Properties) { $wanted[$prop.Name] = [string]$prop.Value }
foreach ($k in @($st.Keys)) { if (-not $wanted.ContainsKey($k) -and $st[$k].pid -and (Alive $st[$k].pid)) { $wanted[$k] = 'oog'; Log "oog ${k}: no longer listed in client_mode.json - treating it as out of game" } }

foreach ($name in @($wanted.Keys)) {
    $want = $wanted[$name]
    $cur = $st[$name]; $alive = $cur -and $cur.pid -and (Alive $cur.pid)
    # CRASHED CLIENT (2026-10-13 11:00, Tank1: "LineageII Crash Report" window for hours; the process lives on, so it counted as alive and every
    # move / .giran was lost): a client showing the crash report is dead -> close it, the next run hooks a new one
    if ($alive -and $want -eq 'ingame') {                           # (oog: the branch below closes it and logs in out of game)
        $cp = Get-Process -Id $cur.pid -ErrorAction SilentlyContinue
        if ($cp -and $cp.MainWindowTitle -match 'Crash') {
            Log "hook ${name}: client pid $($cur.pid) shows '$($cp.MainWindowTitle)' - it crashed; closing it, will hook again"
            Stop-Process -Id $cur.pid -Force -ErrorAction SilentlyContinue
            $st[$name] = @{ tried = $null }; SaveState
            $alive = $false; $cur = $st[$name]
        }
    }
    # hooked client stuck on the login screen (login server refused us, e.g. flood protection after restarts): after 4 min
    # without being in game, close it so the next run hooks again (2026-10-04 13:09)
    if ($want -eq 'ingame' -and $alive -and $cur.at -and ((Get-Date) - [datetime]$cur.at).TotalMinutes -gt 4) {
        $inGame = InGame $name ([datetime]$cur.at)
        if ($inGame -eq $false) {
            Log "hook ${name}: client pid $($cur.pid) still not in game after 4 min (stuck at login?) - closing it, will hook again"
            Stop-Process -Id $cur.pid -Force -ErrorAction SilentlyContinue
            $st[$name] = @{ tried = (Get-Date).ToString('s') }; SaveState
            continue
        }
    }
    if ($want -eq 'ingame' -and -not $alive) {
        if ($loginBusy -or $young) { continue }                     # next run (2 min)
        # at most one try per 5 min per character
        if ($cur -and $cur.tried -and ((Get-Date) - [datetime]$cur.tried).TotalMinutes -lt 5) { continue }
        # hook loop brake: 3 hooks within 60 min -> pause 60 min (each hook = a full client start + login + password typing)
        $recent = @(@($hist.hooks.$name) | Where-Object { $_ -and ((Get-Date) - [datetime]$_).TotalMinutes -lt 60 })
        if ($recent.Count -ge 3) {
            if (-not $cur -or -not $cur.braked -or ((Get-Date) - [datetime]$cur.braked).TotalMinutes -gt 30) { $st[$name] = @{ tried = $(if ($cur) { $cur.tried } else { $null }); braked = (Get-Date).ToString('s') }; SaveState; Log "hook ${name}: $($recent.Count) hooks in the last 60 min - pausing in-game mode for this character until the oldest is an hour old (hook loop brake)" }
            continue
        }
        $st[$name] = @{ tried = (Get-Date).ToString('s') }; SaveState
        [void](HookCharacter $name)
    } elseif ($want -eq 'oog' -and $alive) {
        Log "oog ${name}: closing its l2.exe (pid $($cur.pid)) and logging in out of game again"
        Stop-Process -Id $cur.pid -Force -ErrorAction SilentlyContinue
        $st.Remove($name); SaveState
        Start-Sleep 5
        try {
            $cfg = ConfigOf $name
            # by config path: a hooked character is not found by its name (2026-10-05 23:09: close by name failed, the reopen did nothing,
            # Tank1 stayed logged out until a manual login)
            [void](Mcp 'close_account' @{ config_path = $cfg }); Start-Sleep 5
            [void](Mcp 'open_account' @{ config_path = $cfg })
            Log "oog ${name}: reopened $cfg"
            Start-Sleep 10
            $stat = $null; try { $stat = (Mcp 'get_account_status' @{ config_path = $cfg }) } catch { }   # (was $st: it overwrote the state table)
            if (-not ("$stat" -match 'is_connected[\\"]*:\s*true')) {   # the reply holds the status as escaped JSON text
                [void](Mcp 'manage_account_config' @{ config_path = $cfg; action = 'load' })
                Log "oog ${name}: not connected after the reopen - login started with manage_account_config load"
            }
        } catch { Log "oog ${name}: MCP error $_" }
    }
}
