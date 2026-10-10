# install.ps1 - one-click installer for the swarm kit (started by INSTALL.cmd). Safe to run again at any time.
#
#   INSTALL.cmd                          asks before every step that changes something ([y/N] = No is the default)
#   INSTALL.cmd -DryRun                  (or -WhatIf) shows what every step WOULD do and changes nothing (no winget, no copy,
#                                        no swarm.config.json, no SETUP -Apply, no admin, no scheduled tasks, no dashboard)
#   -Root <folder>                       your L2Swarm folder (the one with L2Swarm.exe); default: found automatically
#   -Yes                                 answer "yes" to every question (unattended; with -DryRun = a full preview)
#   -SkipPrereqs -SkipCopy -SkipImport -SkipSetup -SkipImages -SkipDashboard   skip that step
#   -SkipTasks                           SETUP without the four scheduled tasks
#   -NoOpen                              do not open the browser at the end
#
# Steps: 1 find L2Swarm  2 Node.js + Git (winget, only when you say yes)  3 copy the kit into the L2Swarm folder (never over L2Swarm's own
# files, never Settings\*.xml)  4 import your L2Swarm accounts into swarm.config.json (docs\plan\tools\import_l2swarm.js; dry run first)
# 5 review swarm.config.json in Notepad  6 SETUP dry run, then SETUP -Apply as admin  7 dashboard images  8 start the dashboard.
# Passwords: never asked, read or printed by this script. Existing account configs keep their own (encrypted) password; SETUP only
# asks for one when it has to CREATE a config for an account that has none.
param(
    [string]$Root = '',
    [Alias('WhatIf')][switch]$DryRun,
    [switch]$Yes,
    [switch]$SkipPrereqs,
    [switch]$SkipCopy,
    [switch]$SkipImport,
    [switch]$SkipSetup,
    [switch]$SkipImages,
    [switch]$SkipDashboard,
    [switch]$SkipTasks,
    [switch]$NoOpen
)
$ErrorActionPreference = 'Stop'
$Kit = $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'

function Say([string]$m, [string]$c = 'Gray') { Write-Host $m -ForegroundColor $c }
function Step([int]$n, [string]$m) { Write-Host ''; Write-Host "=== Step $n of 8: $m ===" -ForegroundColor Cyan }
function Would([string]$m) { Write-Host "  [dry run] would: $m" -ForegroundColor DarkYellow }
function ReadLine([string]$prompt) {
    try { return [string](Read-Host $prompt) } catch { return '' }     # no console (e.g. -NonInteractive): empty = the default
}
# yes/no question; $defaultYes only for steps that change nothing (opening Notepad / the browser)
function Ask([string]$q, [bool]$defaultYes = $false) {
    $hint = if ($defaultYes) { '[Y/n]' } else { '[y/N]' }
    if ($Yes) { Say "  $q $hint yes (-Yes)"; return $true }
    $a = (ReadLine "  $q $hint").Trim().ToLower()
    if (-not $a) { return $defaultYes }
    return ($a -eq 'y' -or $a -eq 'yes' -or $a -eq 'j' -or $a -eq 'ja')
}
function IsL2([string]$d) { return ($d -and (Test-Path -LiteralPath (Join-Path $d 'L2Swarm.exe'))) }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function NodeMajor { try { $v = [string](& node --version 2>$null | Select-Object -First 1); if ($v -match '^v(\d+)') { return [int]$Matches[1] } } catch { }; return 0 }
function IsAdmin { return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
function PortOpen([int]$p) {
    $c = New-Object Net.Sockets.TcpClient
    try { $r = $c.BeginConnect('127.0.0.1', $p, $null, $null); if ($r.AsyncWaitHandle.WaitOne(500)) { $c.EndConnect($r); return $true }; return $false } catch { return $false } finally { $c.Close() }
}
function L2Running([string]$r) {
    foreach ($p in @(Get-Process L2Swarm -ErrorAction SilentlyContinue)) { $pp = $null; try { $pp = $p.Path } catch { }; if (-not $pp -or $pp.StartsWith($r, [StringComparison]::OrdinalIgnoreCase)) { return $true } }
    return $false
}

Say ''
Say 'Swarm kit installer' Green
Say "kit folder: $Kit"
if ($DryRun) { Say 'DRY RUN: nothing is changed, every step only says what it would do.' Yellow }

# ------------------------------------------------------------------ 1. the L2Swarm folder
Step 1 'find your L2Swarm folder'
$cands = New-Object System.Collections.ArrayList
function AddCand([string]$d) { if (-not $d) { return }; try { $full = [IO.Path]::GetFullPath($d).TrimEnd('\') } catch { return }; if ((IsL2 $full) -and -not ($cands -contains $full)) { [void]$cands.Add($full) } }
if ($Root) {
    if (-not (IsL2 $Root)) { Say "  -Root '$Root' has no L2Swarm.exe. Install L2Swarm there first (its own installer / updater.exe), or give the right folder." Red; exit 1 }
    $L2 = [IO.Path]::GetFullPath($Root).TrimEnd('\')
} else {
    AddCand $Kit                                          # the kit is already in the L2Swarm folder (git clone / zip unpacked there)
    if (-not $cands.Count) { AddCand (Split-Path $Kit -Parent) }     # kit unpacked into a sub folder of the L2Swarm folder
    if (-not $cands.Count) { foreach ($p in @(Get-Process L2Swarm -ErrorAction SilentlyContinue)) { try { AddCand (Split-Path $p.Path -Parent) } catch { } } }
    if (-not $cands.Count) {
        foreach ($d in @("$env:SystemDrive\L2Swarm", "$env:SystemDrive\Games\L2Swarm", "$env:ProgramFiles\L2Swarm", "${env:ProgramFiles(x86)}\L2Swarm",
                         "$env:USERPROFILE\Desktop\L2Swarm", "$env:USERPROFILE\Documents\L2Swarm", "$env:USERPROFILE\Downloads\L2Swarm",
                         "$env:LOCALAPPDATA\L2Swarm", "$env:LOCALAPPDATA\Programs\L2Swarm", "$env:APPDATA\L2Swarm")) { AddCand $d }
        # any fixed drive: <drive>\<folder>\L2Swarm.exe and <drive>\<folder>\<folder>\L2Swarm.exe
        $skip = @('Windows', '$Recycle.Bin', 'System Volume Information', 'Recovery', 'PerfLogs', 'ProgramData', 'Users')
        foreach ($drv in @([IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady })) {
            foreach ($d1 in @(Get-ChildItem -LiteralPath $drv.RootDirectory.FullName -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $skip -notcontains $_.Name })) {
                AddCand $d1.FullName
                foreach ($d2 in @(Get-ChildItem -LiteralPath $d1.FullName -Directory -ErrorAction SilentlyContinue | Select-Object -First 200)) { AddCand $d2.FullName }
            }
        }
    }
    $L2 = ''
    if ($cands.Count -eq 1) {
        Say "  found: $($cands[0])"
        if (Ask "Install into this folder?" $true) { $L2 = $cands[0] }
    } elseif ($cands.Count -gt 1) {
        Say '  found more than one L2Swarm folder:'
        for ($i = 0; $i -lt $cands.Count; $i++) { Say ("   {0}) {1}" -f ($i + 1), $cands[$i]) }
        if ($Yes) { $L2 = $cands[0]; Say "  -Yes: taking the first one ($L2)" }
        else { $n = ReadLine '  number of the folder to use (empty = cancel)'; if ($n -match '^\d+$' -and [int]$n -ge 1 -and [int]$n -le $cands.Count) { $L2 = $cands[[int]$n - 1] } }
    }
    if (-not $L2 -and -not $Yes) {
        $p = (ReadLine '  path of your L2Swarm folder (the one with L2Swarm.exe; empty = cancel)').Trim('" ')
        if ($p -and (IsL2 $p)) { $L2 = [IO.Path]::GetFullPath($p).TrimEnd('\') } elseif ($p) { Say "  no L2Swarm.exe in '$p'." Red }
    }
    if (-not $L2) { Say '  no L2Swarm folder chosen. Install L2Swarm first (the developer''s installer / updater.exe), then run INSTALL.cmd again, or pass -Root <folder>.' Red; exit 1 }
}
Say "  L2Swarm folder: $L2" Green
$inPlace = ($L2 -ieq $Kit.TrimEnd('\'))
foreach ($need in 'Data', 'Maps', 'Geodata') { if (-not (Test-Path -LiteralPath (Join-Path $L2 $need))) { Say "  note: no $need\ folder in $L2 - a complete L2Swarm install has it (dashboard maps / path finder need it)." Yellow } }

# ------------------------------------------------------------------ 2. Node.js + Git
Step 2 'Node.js and Git'
if ($SkipPrereqs) { Say '  skipped (-SkipPrereqs)' }
else {
    $winget = [bool](Get-Command winget -ErrorAction SilentlyContinue)
    $nm = NodeMajor
    if ($nm -ge 18) { Say "  Node.js $nm - ok" }
    else {
        Say $(if ($nm) { "  Node.js $nm is too old (18 or newer is needed: dashboard, path finder, importer)." } else { '  Node.js is not installed (needed: dashboard, path finder, account importer).' }) Yellow
        if (-not $winget) { Say '  winget is not available - install Node.js LTS from https://nodejs.org, then run INSTALL.cmd again.' Yellow }
        elseif ($DryRun) { Would 'winget install -e --id OpenJS.NodeJS.LTS' }
        elseif (Ask 'Install Node.js LTS now with winget (winget install -e --id OpenJS.NodeJS.LTS)?') {
            & winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
            Refresh-Path; $nm = NodeMajor
            if ($nm -ge 18) { Say "  Node.js $nm installed." Green } else { Say '  Node.js is still not found in this window - close it, open a new one and run INSTALL.cmd again.' Yellow }
        }
    }
    if (Get-Command git -ErrorAction SilentlyContinue) { Say '  Git - ok (update.cmd can update with git)' }
    else {
        Say '  Git is not installed. It is optional: with git, update.cmd updates in one command; without it use update.ps1 -Zip <zip>.'
        if (-not $winget) { Say '  (install it from https://git-scm.com if you want it)' }
        elseif ($DryRun) { Would 'winget install -e --id Git.Git' }
        elseif (Ask 'Install Git now with winget (winget install -e --id Git.Git)?') { & winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements; Refresh-Path }
    }
}
$haveNode = (NodeMajor) -ge 18

# ------------------------------------------------------------------ 3. copy the kit into the L2Swarm folder
Step 3 'put the kit into the L2Swarm folder'
# files of L2Swarm itself and of YOU that the copy never writes: L2Swarm's program files, its data folders, your accounts / logs / config
function IsProtectedTarget([string]$rel) {
    $r = $rel.ToLower()
    if ($r -notmatch '\\' -and $r -match '\.(exe|dll|pdb|config)$') { return $true }
    if ($r -eq 'version.txt' -or $r -eq 'swarm.config.json' -or $r -eq 'dashboard\key.txt') { return $true }
    foreach ($d in 'data\', 'maps\', 'geodata\', 'logs\') { if ($r.StartsWith($d)) { return $true } }
    if ($r.StartsWith('settings\') -and -not $r.StartsWith('settings\templates\')) { return $true }
    if ($r.StartsWith('scripts\') -and -not $r.StartsWith('scripts\data\')) { return $true }
    return $false
}
# kit files that are yours once they exist (changed templates, recorded routes, live gatekeeper menus): an existing copy is kept
function IsKeepIfExists([string]$rel) {
    $r = $rel.ToLower()
    return ($r.StartsWith('settings\templates\') -or $r.StartsWith('scripts\data\gk_live\') -or $r.StartsWith('scripts\data\routes\') -or $r -eq 'scripts\data\shopscan_giran.json')
}
if ($SkipCopy) { Say '  skipped (-SkipCopy)' }
elseif ($inPlace) { Say '  the kit is already in the L2Swarm folder - nothing to copy.' }
else {
    $kitFiles = @(Get-ChildItem -LiteralPath $Kit -Recurse -File -Force | Where-Object { $_.FullName.Substring($Kit.TrimEnd('\').Length + 1) -notmatch '^\.git\\' })
    $new = @(); $same = 0; $diff = @(); $kept = 0; $prot = 0
    foreach ($f in $kitFiles) {
        $rel = $f.FullName.Substring($Kit.TrimEnd('\').Length + 1)
        if (IsProtectedTarget $rel) { $prot++; continue }
        $dst = Join-Path $L2 $rel
        if (-not (Test-Path -LiteralPath $dst)) { $new += , @($f.FullName, $dst, $rel); continue }
        if (IsKeepIfExists $rel) { $kept++; continue }
        if ((Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash) { $same++ } else { $diff += , @($f.FullName, $dst, $rel) }
    }
    Say "  kit files: $($kitFiles.Count) - new here: $($new.Count), already the same: $same, different: $($diff.Count), kept (yours): $kept, never copied (L2Swarm / your files): $prot"
    if ($new.Count) {
        if ($DryRun) { Would "copy $($new.Count) new file(s) into $L2" }
        elseif (Ask "Copy the $($new.Count) new kit file(s) into $L2 ? (no existing file is touched)") {
            foreach ($c in $new) { New-Item -ItemType Directory -Force (Split-Path $c[1]) | Out-Null; Copy-Item -LiteralPath $c[0] -Destination $c[1] }
            Say "  copied $($new.Count) file(s)." Green
        }
    }
    if ($diff.Count) {
        $verKit = if (Test-Path "$Kit\VERSION") { (Get-Content "$Kit\VERSION" -Raw).Trim() } else { '?' }
        $verL2 = if (Test-Path "$L2\VERSION") { (Get-Content "$L2\VERSION" -Raw).Trim() } else { '?' }
        Say "  $($diff.Count) kit file(s) already exist in the L2Swarm folder with other content (installed kit version $verL2, this kit $verKit)." Yellow
        Say '  For an installed kit, update.cmd is the better way (it keeps your changes). Examples:'
        $diff | Select-Object -First 5 | ForEach-Object { Say "    $($_[2])" }
        $bdir = Join-Path $L2 "Logs\install_backup\$stamp"
        if ($DryRun) { Would "replace them (old copies to $bdir)" }
        elseif (Ask "Replace these $($diff.Count) file(s) with the kit's version? (the old ones are saved to $bdir)") {
            foreach ($c in $diff) { $b = Join-Path $bdir $c[2]; New-Item -ItemType Directory -Force (Split-Path $b) | Out-Null; Copy-Item -LiteralPath $c[1] -Destination $b -Force; Copy-Item -LiteralPath $c[0] -Destination $c[1] -Force }
            Say "  replaced $($diff.Count) file(s); old copies in $bdir" Green
        }
    }
    if ((Test-Path -LiteralPath (Join-Path $Kit '.git')) -and -not (Test-Path -LiteralPath (Join-Path $L2 '.git'))) {
        Say '  the kit is a git clone. Copying its .git folder too lets update.cmd update the L2Swarm folder with git.'
        if ($DryRun) { Would "copy $Kit\.git -> $L2\.git" }
        elseif ((Get-Command git -ErrorAction SilentlyContinue) -and (Ask 'Copy the git data (.git) into the L2Swarm folder?')) {
            & robocopy (Join-Path $Kit '.git') (Join-Path $L2 '.git') /E /NFL /NDL /NJH /NJS /NP | Out-Null
            Say '  .git copied (git status in the L2Swarm folder shows only kit files; L2Swarm''s own files are ignored by .gitignore).' Green
        }
    }
}
# from here on everything runs from the L2Swarm folder (or, in a dry run before the copy, from the kit with --root)
$tools = if (Test-Path -LiteralPath (Join-Path $L2 'docs\plan\tools\import_l2swarm.js')) { Join-Path $L2 'docs\plan\tools' } else { Join-Path $Kit 'docs\plan\tools' }
$importer = Join-Path $tools 'import_l2swarm.js'
$setup = Join-Path $L2 'SETUP.ps1'
$cfgFile = Join-Path $L2 'swarm.config.json'

# ------------------------------------------------------------------ 4. import the L2Swarm accounts
Step 4 'import your L2Swarm accounts into swarm.config.json'
if ($SkipImport) { Say '  skipped (-SkipImport)' }
elseif (-not $haveNode) { Say '  needs Node.js (step 2) - skipped. Run INSTALL.cmd again after installing Node.js.' Yellow }
elseif (-not (Test-Path -LiteralPath $importer)) { Say "  $importer is missing - the kit is incomplete (copy step skipped?)." Red }
else {
    $nXml = @(Get-ChildItem -LiteralPath (Join-Path $L2 'Settings') -Filter *.xml -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'settings.xml' }).Count
    if (-not $nXml) {
        Say '  no account configs in Settings\ yet (L2Swarm has no accounts here).'
        if (Test-Path -LiteralPath $cfgFile) { Say '  swarm.config.json exists - keeping it.' }
        elseif ($DryRun) { Would 'copy swarm.config.example.json -> swarm.config.json (then you add your accounts; SETUP asks each password once)' }
        elseif ((Test-Path -LiteralPath (Join-Path $L2 'swarm.config.example.json')) -and (Ask 'Create swarm.config.json from the example, to fill in your accounts by hand?')) {
            Copy-Item -LiteralPath (Join-Path $L2 'swarm.config.example.json') -Destination $cfgFile; Say '  created swarm.config.json from the example - edit "accounts" in the next step.' Green
        }
    } else {
        $extra = New-Object System.Collections.ArrayList
        if (Test-Path -LiteralPath $cfgFile) { Say '  swarm.config.json exists: the import MERGES (your entries stay as they are, new accounts are added).' }
        while ($true) {
            [string[]]$ea = $extra.ToArray(); & node $importer --root $L2 @ea
            if ($LASTEXITCODE -ne 0) { Say '  the importer stopped with an error (see above).' Red; break }
            if ($DryRun -or $Yes) { break }
            Say ''
            Say '  To choose which character an account plays, or set a role / party, type one change per line, e.g.'
            Say '     mylogin3=Nukername          (play that character on login mylogin3)'
            Say '     role mylogin3=nuker         party mylogin3=Tankname          use mylogin3=Other.xml'
            $line = (ReadLine '  change (empty = done)').Trim()
            if (-not $line) { break }
            if ($line -match '^(role|party|use)\s+(\S+=.*)$') { [void]$extra.Add('--' + $Matches[1]); [void]$extra.Add($Matches[2]) }
            elseif ($line -match '^\S+=') { [void]$extra.Add('--set'); [void]$extra.Add($line) }
            else { Say "  not understood: $line" Yellow; continue }
            while ($true) {
                $more = (ReadLine '  next change (empty = show the table again)').Trim()
                if (-not $more) { break }
                if ($more -match '^(role|party|use)\s+(\S+=.*)$') { [void]$extra.Add('--' + $Matches[1]); [void]$extra.Add($Matches[2]) }
                elseif ($more -match '^\S+=') { [void]$extra.Add('--set'); [void]$extra.Add($more) }
                else { Say "  not understood: $more" Yellow }
            }
        }
        if ($DryRun) { Would "node docs\plan\tools\import_l2swarm.js --root `"$L2`" --write   (writes $cfgFile, backup of an old one in Settings\backup\)" }
        elseif (Ask "Write this into $cfgFile ?") {
            [string[]]$ea = $extra.ToArray(); & node $importer --root $L2 --write --quiet @ea
            if ($LASTEXITCODE -ne 0) { Say '  writing failed (see above).' Red }
        }
    }
}

# ------------------------------------------------------------------ 5. review
Step 5 'review swarm.config.json'
if (-not (Test-Path -LiteralPath $cfgFile)) { Say '  no swarm.config.json yet - nothing to review. (SETUP needs it: run INSTALL.cmd again, or write it by hand from swarm.config.example.json.)' Yellow }
elseif ($DryRun) { Would "open $cfgFile in Notepad and wait until you close it" }
elseif ($Yes) { Say "  -Yes: not opened. Check it later: notepad `"$cfgFile`"" }
else {
    Say '  Check: every account has a "character", the right "party" (= its leader''s character name) and a "role";'
    Say '  "mainLeader" is your main party leader; nukers need a "classPlan". Every field is explained in swarm.config.example.json.'
    if (Ask 'Open it in Notepad now (this window waits until you close Notepad)?' $true) {
        Start-Process notepad.exe -ArgumentList "`"$cfgFile`"" -Wait
        try { [void]([IO.File]::ReadAllText($cfgFile) | ConvertFrom-Json); Say '  swarm.config.json is valid JSON.' Green } catch { Say "  swarm.config.json is NOT valid JSON now: $($_.Exception.Message) - fix it before SETUP -Apply." Red }
    }
}

# ------------------------------------------------------------------ 6. SETUP
Step 6 'SETUP: L2Swarm account configs, groups, AutoStart, scheduled tasks'
$applied = $false
$setupArgs = @(); if ($SkipTasks) { $setupArgs += '-SkipTasks' }
if ($SkipSetup) { Say '  skipped (-SkipSetup)' }
elseif (-not (Test-Path -LiteralPath $setup)) { Say "  $setup is missing (the kit was not copied into the L2Swarm folder)." $(if ($DryRun) { 'DarkYellow' } else { 'Red' }); if ($DryRun) { Would 'run SETUP.ps1 (dry run) and SETUP.ps1 -Apply after the copy' } }
elseif (-not (Test-Path -LiteralPath $cfgFile)) { Say '  no swarm.config.json - SETUP has nothing to apply (step 4).' Yellow }
else {
    Say '  SETUP dry run (changes nothing):'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $setup @setupArgs
    $dryExit = $LASTEXITCODE
    if ($dryExit -ne 0) { Say "  SETUP dry run ended with exit code $dryExit - see above." Yellow }
    if ($DryRun) { Would "stop L2Swarm if it runs, then SETUP.ps1 -Apply $($setupArgs -join ' ') as administrator (UAC prompt)" }
    elseif (Ask 'Apply these changes now? (needs admin; L2Swarm must be stopped; every changed file is backed up in Settings\backup\)') {
        $go = $true
        if (L2Running $L2) {
            Say '  L2Swarm is running. It keeps its settings in memory and would undo the changes.' Yellow
            $task = Get-ScheduledTask -TaskName 'L2Swarm Stop' -ErrorAction SilentlyContinue
            if ($task -and (Ask 'Stop it now (schtasks /run /tn "L2Swarm Stop")?')) {
                & schtasks /run /tn 'L2Swarm Stop' | Out-Null
                for ($i = 0; $i -lt 60 -and (L2Running $L2); $i++) { Start-Sleep -Seconds 2 }
            } else { [void](ReadLine '  close L2Swarm yourself (it asks "are you sure?"), then press Enter') }
            if (L2Running $L2) { Say '  L2Swarm is still running - SETUP -Apply skipped. Run INSTALL.cmd again when it is closed.' Red; $go = $false }
        }
        if ($go) {
            if (IsAdmin) { & powershell -NoProfile -ExecutionPolicy Bypass -File $setup -Apply @setupArgs; $code = $LASTEXITCODE }
            else {
                Say '  starting SETUP -Apply as administrator (confirm the UAC prompt; new accounts without a config ask their password THERE)...'
                $q = $setup.Replace("'", "''")
                $cmd = "& '$q' -Apply $($setupArgs -join ' '); `$c = `$LASTEXITCODE; Write-Host ''; Read-Host 'SETUP finished - press Enter to close this window'; exit `$c"
                try { $p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd); $code = $p.ExitCode }
                catch { Say "  could not start as administrator: $($_.Exception.Message)" Red; $code = -1 }
            }
            if ($code -eq 0) { $applied = $true; Say '  SETUP applied.' Green } else { Say "  SETUP -Apply ended with exit code $code - see its window / output." Yellow }
        }
    }
}

# ------------------------------------------------------------------ 7. dashboard images
Step 7 'dashboard images (made from YOUR L2Swarm Data\ and Maps\)'
$haveImages = (Test-Path -LiteralPath (Join-Path $L2 'Dashboard\icons\class')) -and (Test-Path -LiteralPath (Join-Path $L2 'Scripts\data\npc_strings.json'))
if ($SkipImages) { Say '  skipped (-SkipImages)' }
elseif ($haveImages) { Say '  already there (regenerate any time with SETUP.cmd -Images).' }
elseif (-not (Test-Path -LiteralPath $setup)) { if ($DryRun) { Would 'SETUP.ps1 -Images after the copy' } else { Say '  SETUP.ps1 missing - skipped.' Yellow } }
elseif (-not $haveNode) { Say '  needs Node.js - skipped.' Yellow }
elseif ($DryRun) { Would 'SETUP.ps1 -Images (a minute or two; reads Data\icons.db, Data\base.db, Maps\)' }
elseif (Ask 'Generate them now (SETUP -Images, a minute or two)?') { & powershell -NoProfile -ExecutionPolicy Bypass -File $setup -Images }

# ------------------------------------------------------------------ 8. dashboard
Step 8 'dashboard'
$port = 8090
try { if (Test-Path -LiteralPath $cfgFile) { $c = [IO.File]::ReadAllText($cfgFile) | ConvertFrom-Json; if ($c.dashboard -and $c.dashboard.port) { $port = [int]$c.dashboard.port } } } catch { }
$url = "http://127.0.0.1:$port"
$server = Join-Path $L2 'Dashboard\server.js'
if ($SkipDashboard) { Say '  skipped (-SkipDashboard)' }
elseif (PortOpen $port) { Say "  the dashboard is already running: $url" Green }
elseif (-not (Test-Path -LiteralPath $server)) { if ($DryRun) { Would "start node Dashboard\server.js after the copy and open $url" } else { Say '  Dashboard\server.js missing - skipped.' Yellow } }
elseif (-not $haveNode) { Say '  needs Node.js - skipped.' Yellow }
elseif ($DryRun) { Would "start node server.js (hidden) in $L2\Dashboard and open $url" }
elseif (Ask "Start the dashboard now ($url)?") {
    Start-Process node -ArgumentList 'server.js' -WorkingDirectory (Join-Path $L2 'Dashboard') -WindowStyle Hidden
    for ($i = 0; $i -lt 30 -and -not (PortOpen $port); $i++) { Start-Sleep -Milliseconds 500 }
    if (PortOpen $port) { Say "  dashboard running: $url" Green } else { Say '  the dashboard did not answer yet - start it by hand with Dashboard\start.cmd to see its messages.' Yellow }
}
if (-not $DryRun -and -not $NoOpen -and -not $SkipDashboard -and (PortOpen $port)) { Start-Process $url }

# ------------------------------------------------------------------ done
Say ''
Say 'What next' Cyan
Say "  dashboard:      $url   (phone on your LAN: http://<PC-IP>:$port/?key=<Dashboard\key.txt>; start it again with Dashboard\start.cmd)"
Say '  start the bots: schtasks /run /tn "L2Swarm Start"    (logs every account in, one by one; starting L2Swarm.exe by hand logs nobody in)'
Say '  Claude Code:    claude mcp add --transport http --scope user l2swarm-mcp http://127.0.0.1:8083   (your mcp.port)'
Say '  change accounts later: edit swarm.config.json (or node docs\plan\tools\import_l2swarm.js), then SETUP.cmd and SETUP.cmd -Apply'
Say '  updates:        update.cmd'
if ($DryRun) { Say ''; Say 'DRY RUN finished - nothing was changed.' Yellow }
exit 0
