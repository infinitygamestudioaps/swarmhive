# update.ps1 - updates this swarm package to the latest published version (run it in the L2Swarm folder you installed it into).
#
#   update.cmd                       (= powershell -ExecutionPolicy Bypass -File update.ps1)
#   update.ps1 -Check                only tell whether a newer version exists
#   update.ps1 -Version v1.2.0       a specific version (git tag) instead of the newest
#   update.ps1 -NoDeploy             do not deploy Scripts_dev\swarm.js -> Scripts\swarm.js afterwards
#   update.ps1 -Zip <file.zip>       no git: update from a downloaded package zip (GitHub "Code -> Download ZIP" or a release asset)
#   update.ps1 -Repo owner/name      no git: download the zip from that (private) GitHub repo; needs a read-only token in the
#                                    environment variable SWARM_GITHUB_TOKEN (GitHub -> Settings -> Developer settings -> fine-grained token,
#                                    "Contents: read" on that one repository)
#
# What it KEEPS (never overwritten):
#   swarm.config.json, Settings\ (your accounts; Settings\templates you changed), Logs\, Dashboard\key.txt, the generated images,
#   your data files Scripts\data\custom_zones.json, party_spots.json, party_tactics.json, gear_prefs.json, soul_prefs.json, sell_list.json,
#   siege_plans.json, dye_plan.json, roster_extra.json, clan_quests.json, giran_routes.json, class_plans.json (the package only ships *.example.json of them),
#   recorded/locked routes (Scripts\data\routes\) and live gatekeeper menus (gk_live\) you changed, and every room / spot / area / zone you
#   edited in the dashboard shape editor (manual: true - merged into the new data with docs\plan\tools\manual_guard.js).
# What it REPLACES: the code (Scripts_dev\swarm.js, Dashboard, tools, SETUP, patches\universal, docs). A changed code file is saved first to
#   Logs\update_backup\<time>\ and listed - re-apply your change from there if you still need it.
# It does not stop or start L2Swarm. Scripts\swarm.js (the file L2Swarm watches) is deployed through docs\plan\tools\deploy_swarm.ps1
# (its time gate / "not during a fight" rules apply). The optional patch is only applied when YOU run patches\universal\apply_patch.ps1 -Apply.
param([switch]$Check, [string]$Version = '', [switch]$NoDeploy, [string]$Zip = '', [string]$Repo = '')
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$bak = Join-Path $root "Logs\update_backup\$stamp"
function Say($m, $c = 'Gray') { Write-Host $m -ForegroundColor $c }
function Rel($p) { return $p.Substring($root.Length + 1) }
function Hash($p) { if (Test-Path -LiteralPath $p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash } else { '' } }
function Backup($rel) {
    $src = Join-Path $root $rel; if (-not (Test-Path -LiteralPath $src)) { return }
    $dst = Join-Path $bak $rel; New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null; Copy-Item -LiteralPath $src $dst -Force
}
# files that are YOURS once you changed them (the update's copy is saved next to it as <file>.upstream when it differs)
function IsProtected($rel) {
    $r = $rel -replace '/', '\'
    return ($r -like 'Settings\templates\*') -or ($r -like 'Scripts\data\gk_live\*') -or ($r -like 'Scripts\data\routes\*') -or ($r -eq 'Scripts\data\shopscan_giran.json')
}
$GUARDED = @{ 'Scripts\data\dungeon_rooms.json' = 'room'; 'Scripts\data\hunting_spots_h5.json' = 'spot'; 'Scripts\data\zone_subareas.json' = 'subarea'; 'Scripts\data\field_areas.json' = 'area' }

$oldVer = if (Test-Path "$root\VERSION") { (Get-Content "$root\VERSION" -Raw).Trim() } else { '(unknown)' }
Say ''
Say "L2Swarm swarm package update   folder $root   installed version $oldVer" Cyan
if (Get-Process L2Swarm -ErrorAction SilentlyContinue) {
    Say 'note: L2Swarm is running. That is fine: the update does not touch Scripts\swarm.js directly - the new script is deployed with' Yellow
    Say '      deploy_swarm.ps1 (every account reloads it once). Stop L2Swarm first if you prefer a clean restart.' Yellow
}
$git = [bool](Get-Command git -ErrorAction SilentlyContinue)
$useGit = $git -and (Test-Path "$root\.git") -and -not $Zip
$changedByUs = New-Object System.Collections.ArrayList     # code files of yours that were replaced
$kept = New-Object System.Collections.ArrayList            # protected files kept
$merged = New-Object System.Collections.ArrayList
$updated = $false

if ($useGit) {
    # ------------------------------------------------------------------ git
    $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
    if ($branch -eq 'HEAD') { $branch = 'main' }
    & git fetch origin --tags --prune
    if ($LASTEXITCODE -ne 0) { Say 'git fetch failed (no network, or no access to the repository - Git Credential Manager asks for your GitHub login once).' Red; exit 1 }
    $target = if ($Version) { $Version } else { "origin/$branch" }
    $new = (& git rev-parse --verify --quiet "$target^{commit}")
    if (-not $new) { Say "unknown version $target" Red; exit 1 }
    $new = $new.Trim(); $old = (& git rev-parse HEAD).Trim()
    $newVer = (& git show "${new}:VERSION"); if ($newVer) { $newVer = ($newVer -join '').Trim() } else { $newVer = '?' }
    if ($old -eq $new) { Say "already up to date ($oldVer)." Green; if ($Check) { exit 0 } }
    else {
        Say "update available: $oldVer -> $newVer" Green
        if ($Check) { & git log --oneline "$old..$new" | Select-Object -First 20 | ForEach-Object { Say "  $_" }; exit 0 }
        $mod = @(& git diff --name-only HEAD) + @(& git diff --name-only --cached) | Where-Object { $_ } | Sort-Object -Unique
        $upChanged = @(& git diff --name-only $old $new)
        foreach ($f in $mod) { Backup $f }
        & git reset --hard $new | Out-Null
        if ($LASTEXITCODE -ne 0) { Say ('git reset failed - nothing was restored automatically; your changed files are in ' + $bak) Red; exit 1 }
        foreach ($f in $mod) {
            $rel = $f -replace '/', '\'; $mine = Join-Path $bak $rel; $live = Join-Path $root $rel
            if (-not (Test-Path -LiteralPath $mine)) { continue }
            if ($GUARDED.ContainsKey($rel)) {
                $out = & node "$root\docs\plan\tools\update_merge.js" $GUARDED[$rel] $live $mine
                [void]$merged.Add("$rel ($out)")
            } elseif (IsProtected $rel) {
                if ($upChanged -contains $f -and (Test-Path -LiteralPath $live)) { Copy-Item -LiteralPath $live "$live.upstream" -Force }
                Copy-Item -LiteralPath $mine $live -Force
                [void]$kept.Add($rel + $(if ($upChanged -contains $f) { '   (the update also changed it: its version is in ' + $rel + '.upstream)' } else { '' }))
            } elseif ($upChanged -contains $f) {
                [void]$changedByUs.Add($rel)
            } else {
                Copy-Item -LiteralPath $mine $live -Force      # the update did not touch it: your change stays
                [void]$kept.Add($rel)
            }
        }
        $updated = $true
    }
} else {
    # ------------------------------------------------------------------ zip (no git)
    if (-not $Zip) {
        if (-not $Repo -and (Test-Path "$root\update_source.txt")) { $Repo = (Get-Content "$root\update_source.txt" -Raw).Trim() }
        if (-not $Repo) { Say 'no git and no -Zip/-Repo: install git (winget install Git.Git) and clone the package, or pass -Zip <package.zip> / -Repo owner/name.' Red; exit 1 }
        $tok = $env:SWARM_GITHUB_TOKEN
        if (-not $tok) { Say "downloading from the private repository $Repo needs a read-only token in SWARM_GITHUB_TOKEN (see the top of update.ps1)." Red; exit 1 }
        $ref = if ($Version) { $Version } else { 'main' }
        $Zip = Join-Path $env:TEMP "swarm_package_$stamp.zip"
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Headers @{ Authorization = "Bearer $tok"; 'User-Agent' = 'swarm-update' } -Uri "https://api.github.com/repos/$Repo/zipball/$ref" -OutFile $Zip
    }
    $tmp = Join-Path $env:TEMP "swarm_package_$stamp"
    Expand-Archive -LiteralPath $Zip -DestinationPath $tmp -Force
    $src = Get-ChildItem $tmp -Recurse -Filter VERSION | Where-Object { Test-Path (Join-Path $_.DirectoryName 'MANIFEST.sha256') } | Select-Object -First 1
    if (-not $src) { Say 'the zip is not a swarm package (no VERSION + MANIFEST.sha256 inside).' Red; exit 1 }
    $src = $src.DirectoryName
    $newVer = (Get-Content "$src\VERSION" -Raw).Trim()
    function ReadManifest($f) { $h = @{}; if (Test-Path $f) { Get-Content $f | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object { $x, $n = $_ -split '\s+', 2; $h[$n.Trim() -replace '/', '\'] = $x } }; $h }
    $oldMan = ReadManifest "$root\MANIFEST.sha256"; $newMan = ReadManifest "$src\MANIFEST.sha256"
    if ($oldVer -eq $newVer -and (Hash "$root\MANIFEST.sha256") -eq (Hash "$src\MANIFEST.sha256")) { Say "already up to date ($oldVer)." Green; Remove-Item -Recurse -Force $tmp; if ($Check) { exit 0 } }
    else {
        Say "update: $oldVer -> $newVer" Green
        if ($Check) { Remove-Item -Recurse -Force $tmp; exit 0 }
        $files = @($newMan.Keys) + @('MANIFEST.sha256')
        foreach ($rel in $files) {
            $live = Join-Path $root $rel; $up = Join-Path $src $rel
            $mine = (Hash $live); $was = $oldMan[$rel]
            $userChanged = $mine -and $was -and ($mine -ne $was)
            $upChanged = ($was -ne $newMan[$rel])
            if ($userChanged) {
                Backup $rel
                if ($GUARDED.ContainsKey($rel)) {
                    Copy-Item -LiteralPath $up $live -Force
                    $out = & node "$root\docs\plan\tools\update_merge.js" $GUARDED[$rel] $live (Join-Path $bak $rel); [void]$merged.Add("$rel ($out)"); continue
                }
                if ((IsProtected $rel) -or -not $upChanged) {
                    if ($upChanged) { Copy-Item -LiteralPath $up "$live.upstream" -Force }
                    [void]$kept.Add($rel + $(if ($upChanged) { '   (the update also changed it: its version is in ' + $rel + '.upstream)' } else { '' })); continue
                }
                [void]$changedByUs.Add($rel)
            }
            New-Item -ItemType Directory -Force (Split-Path $live) | Out-Null
            Copy-Item -LiteralPath $up $live -Force
        }
        # files the new version no longer has (only when you did not change them)
        foreach ($rel in $oldMan.Keys) {
            if ($newMan.ContainsKey($rel)) { continue }
            $live = Join-Path $root $rel
            if ((Hash $live) -eq $oldMan[$rel]) { Remove-Item -LiteralPath $live -Force }
        }
        $updated = $true
    }
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------------ your data files: created from the examples when missing
Get-ChildItem "$root\Scripts\data\*.example.json" -ErrorAction SilentlyContinue | ForEach-Object {
    $real = $_.FullName -replace '\.example\.json$', '.json'
    if (-not (Test-Path $real)) { Copy-Item $_.FullName $real; Say "  created $(Rel $real) from the example" }
}

# ------------------------------------------------------------------ files generated from YOUR L2Swarm (never shipped)
if (-not (Test-Path "$root\Scripts\data\npc_strings.json") -and (Test-Path "$root\Data\base.db") -and (Get-Command node -ErrorAction SilentlyContinue)) {
    Say 'generating Scripts\data\npc_strings.json from your Data\base.db ...'
    & node "$root\docs\plan\tools\extract_game_assets.js" --root $root --data-only
}

# ------------------------------------------------------------------ deploy swarm.js
$dev = "$root\Scripts_dev\swarm.js"; $live = "$root\Scripts\swarm.js"
if (-not $NoDeploy -and (Test-Path $dev) -and ((Hash $dev) -ne (Hash $live))) {
    if (Get-Process L2Swarm -ErrorAction SilentlyContinue) {
        Say 'deploying Scripts_dev\swarm.js through deploy_swarm.ps1 (L2Swarm is running: every account reloads the script once) ...'
        & powershell -NoProfile -ExecutionPolicy Bypass -File "$root\docs\plan\tools\deploy_swarm.ps1"
        if ($LASTEXITCODE -ne 0) { Say "deploy_swarm.ps1 did not deploy now (exit $LASTEXITCODE - see its message above). Run it again later: powershell -File docs\plan\tools\deploy_swarm.ps1" Yellow }
    } else {
        New-Item -ItemType Directory -Force (Split-Path $live) | Out-Null
        & node --check $dev; if ($LASTEXITCODE -ne 0) { Say 'Scripts_dev\swarm.js has a syntax error - not deployed' Red } else { Copy-Item $dev $live -Force; Say 'deployed Scripts_dev\swarm.js -> Scripts\swarm.js (L2Swarm is not running)' }
    }
}

# ------------------------------------------------------------------ optional patch: tell, never apply by itself
if (Test-Path "$root\patches\universal\apply_patch.ps1") {
    Say 'optional patch for known L2Swarm bugs (any version, applies only what your build still needs): dry run with'
    Say '   powershell -ExecutionPolicy Bypass -File patches\universal\apply_patch.ps1      (then -Apply, with L2Swarm stopped)'
}

# ------------------------------------------------------------------ summary
Say ''
if ($updated) {
    $nv = if (Test-Path "$root\VERSION") { (Get-Content "$root\VERSION" -Raw).Trim() } else { '?' }
    Say "updated to $nv" Green
    if ($kept.Count) { Say 'kept your version of:'; $kept | ForEach-Object { Say "   $_" } }
    if ($merged.Count) { Say 'merged your dashboard edits into:'; $merged | ForEach-Object { Say "   $_" } }
    if ($changedByUs.Count) { Say "REPLACED (you had changed them; your copies are in $bak):" Yellow; $changedByUs | ForEach-Object { Say "   $_" Yellow } }
    if (Test-Path "$root\CHANGELOG.md") {
        Say ''; Say 'What is new (CHANGELOG.md):' Cyan
        $cl = Get-Content "$root\CHANGELOG.md"; $i = 0; $sec = 0
        foreach ($l in $cl) { if ($l -match '^## ') { $sec++; if ($sec -gt 1) { break } }; if ($sec -eq 1) { Say "  $l"; $i++; if ($i -gt 25) { break } } }
    }
    Say ''; Say 'If swarm.config.example.json gained new fields, copy the ones you want into swarm.config.json and run SETUP.cmd (dry run) again.'
}
exit 0
