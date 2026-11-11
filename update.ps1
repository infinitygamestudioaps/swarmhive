# update.ps1 - updates this swarm package to the latest published version (run it in the L2Swarm folder you installed it into).
#
#   update.cmd                       (= powershell -ExecutionPolicy Bypass -File update.ps1)
#   update.ps1 -Check                only tell whether a newer version exists
#   update.ps1 -Version v1.2.0       a specific version (git tag) instead of the newest
#   update.ps1 -NoDeploy             do not deploy Scripts_dev\swarm.js -> Scripts\swarm.js afterwards
#   update.ps1 -Zip <file.zip>       no git: update from a downloaded package zip (GitHub "Code -> Download ZIP" or a release asset)
#   (no .git folder = installed from a zip: the newest release is downloaded from the public repository, no git / token needed)
#   update.ps1 -Repo owner/name      another GitHub repo (a PRIVATE one needs a read-only token in the environment variable
#                                    SWARM_GITHUB_TOKEN: GitHub -> Settings -> Developer settings -> fine-grained token, "Contents: read")
#
# What it KEEPS (never overwritten):
#   swarm.config.json, Settings\ (your accounts; Settings\templates you changed), Logs\, Dashboard\key.txt, the generated images,
#   your data files Scripts\data\custom_zones.json, party_spots.json, party_tactics.json, gear_prefs.json, soul_prefs.json, sell_list.json,
#   siege_plans.json, dye_plan.json, roster_extra.json, clan_quests.json, giran_routes.json, class_plans.json, buff_plans.json, raid_excluded.json,
#   stash_rules.json, brain_host.json, brain_parties.json, fund_rules.json, seven_signs.json, quest_farm.json, spot_learned.json,
#   skill_enchant_plan.json, gear_auto.json (the package only ships *.example.json of them; ONE exception, v1.6.2: a brain_host.json that is
#   still the untouched old default "new engine off, no characters" is switched to the new default "on" + "allowAll" - see the end),
#   recorded/locked routes (Scripts\data\routes\) and live gatekeeper menus (gk_live\) you changed, and every room / spot / area / zone you
#   edited in the dashboard shape editor (manual: true - merged into the new data with docs\plan\tools\manual_guard.js).
# What it REPLACES: the code (Scripts_dev\swarm.js, Dashboard, tools, SETUP, patches\universal, docs). A changed code file is saved first to
#   Logs\update_backup\<time>\ and listed - re-apply your change from there if you still need it.
# CLEANUPDATE-2026-11-11 (owner: "force close of all swarm and nodes so it can update correctly"): before ANY file is replaced, L2Swarm
# (its Stop task when SETUP registered it - the characters log out) and every node process of this install (dashboard, brain host workers,
# path finder) are closed; then the files are copied, Scripts\swarm.js + agent2.js are copied live (no live reload, nothing can refuse it),
# the dashboard and L2Swarm (if it ran before; staggered login) are started again and the live script is checked against the new one.
#   (owner 2026-11-11: "It should stop everything and update" - there is no update without stopping)
# The optional patch is only applied when YOU run patches\universal\apply_patch.ps1 -Apply.
param([switch]$Check, [string]$Version = '', [switch]$NoDeploy, [string]$Zip = '', [string]$Repo = '')
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$bak = Join-Path $root "Logs\update_backup\$stamp"
function Say($m, $c = 'Gray') { Write-Host $m -ForegroundColor $c }
function Rel($p) { return $p.Substring($root.Length + 1) }
# REPAIR-2026-10-21 (a tester's dashboard lost Dashboard\academy_api.js in the v1.8.12 update): the files a MANIFEST lists that are missing here
function MissingFiles($man) {
    if (-not (Test-Path -LiteralPath $man)) { return @() }
    @(Get-Content -LiteralPath $man | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object { (($_ -split '\s+', 2)[1]).Trim() -replace '/', '\' } |
        Where-Object { $_ -and -not (Test-Path -LiteralPath (Join-Path $root $_)) })
}
function Hash($p) { if (Test-Path -LiteralPath $p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash } else { '' } }
function Backup($rel) {
    $src = Join-Path $root $rel; if (-not (Test-Path -LiteralPath $src)) { return }
    $dst = Join-Path $bak $rel; New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null; Copy-Item -LiteralPath $src $dst -Force
}
# ------------------------------------------------------------------ CLEANUPDATE: stop everything before files are replaced, start it again after
$script:stoppedAll = $false; $script:wasL2 = $false; $script:wasDash = $false
$updFlag = Join-Path $root 'Logs\update_running.flag'      # dashboard_keepalive.ps1 does not start the dashboard while this is fresh (< 30 min)
function TaskExists($n) { $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; & schtasks /query /tn $n 2>$null | Out-Null; $ok = ($LASTEXITCODE -eq 0); $ErrorActionPreference = $eap; return $ok }
function OurNodes {
    # node processes of THIS install: the one listening on the dashboard port + its whole tree, anything whose command line names this folder,
    # and our own helper scripts (brain host / pool / geopath service) left over from a dashboard that was killed without its children
    $all = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue)
    $ids = New-Object System.Collections.ArrayList
    $dport = 8090; try { $cfg = Get-Content (Join-Path $root 'swarm.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json; if ($cfg.dashboard.port) { $dport = [int]$cfg.dashboard.port } } catch { }
    try { $l = Get-NetTCPConnection -LocalPort $dport -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($l -and ($all | Where-Object { $_.ProcessId -eq $l.OwningProcess })) { [void]$ids.Add([int]$l.OwningProcess) } } catch { }
    foreach ($p in $all) { $c = [string]$p.CommandLine; if ($c -and ($c.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or $c -match 'brain_host|geopath_service|pool\.js')) { if (-not $ids.Contains([int]$p.ProcessId)) { [void]$ids.Add([int]$p.ProcessId) } } }
    $more = $true
    while ($more) { $more = $false; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) { [void]$ids.Add([int]$p.ProcessId); $more = $true } } }
    return @($ids)
}
function KillOurNodes {
    $ids = @(OurNodes)
    foreach ($id in $ids) { $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; & taskkill /PID $id /T /F 2>$null | Out-Null; $ErrorActionPreference = $eap }
    Start-Sleep 2
    return $ids.Count
}
function StopEverything {
    if ($script:stoppedAll) { return }
    Set-Content -LiteralPath $updFlag (Get-Date -Format s) -ErrorAction SilentlyContinue
    $script:wasL2 = [bool](Get-Process L2Swarm -ErrorAction SilentlyContinue)
    $script:wasDash = (@(OurNodes).Count -gt 0)
    if ($script:wasL2) {
        Say 'closing L2Swarm so every file can be replaced (your characters log out; they are logged in again at the end) ...' Yellow
        if (TaskExists 'L2Swarm Stop') { & schtasks /run /tn 'L2Swarm Stop' | Out-Null }   # elevated task (SETUP): also closes hooked clients, sets the stopped flag
        else { Set-Content (Join-Path $root 'Logs\l2swarm_stopped.flag') (Get-Date -Format s) -ErrorAction SilentlyContinue; Get-Process L2Swarm -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }
        $t = (Get-Date).AddSeconds(120)
        while ((Get-Process L2Swarm -ErrorAction SilentlyContinue) -and (Get-Date) -lt $t) { Start-Sleep 2 }
        if (Get-Process L2Swarm -ErrorAction SilentlyContinue) {
            Say 'L2Swarm is still running (it runs as administrator) - close it yourself now; the update waits 3 more minutes ...' Red
            $t = (Get-Date).AddMinutes(3); while ((Get-Process L2Swarm -ErrorAction SilentlyContinue) -and (Get-Date) -lt $t) { Start-Sleep 3 }
            if (Get-Process L2Swarm -ErrorAction SilentlyContinue) { Remove-Item -LiteralPath $updFlag -ErrorAction SilentlyContinue; Say 'L2Swarm could not be closed - NOTHING was changed. Close L2Swarm and run update.cmd again.' Red; exit 1 }
        }
        Say '  L2Swarm closed.' Green
    }
    $n = KillOurNodes
    if ($n) { Say "  closed $n node process(es) of this install (dashboard, brain host, path finder)." Green }
    $script:stoppedAll = $true
}
function StartEverything {
    if (-not $script:stoppedAll) { return }
    [void](KillOurNodes)                                     # a dashboard a keep-alive started with the OLD files during the copy goes too
    Remove-Item -LiteralPath $updFlag -ErrorAction SilentlyContinue
    if ($script:wasDash -or $script:wasL2) {
        Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$root\Dashboard\start.cmd`"" -WorkingDirectory "$root\Dashboard" -WindowStyle Minimized
        Say 'dashboard started with the new code - reload the page in your browser.' Green
    }
    if ($script:wasL2) {
        if (TaskExists 'L2Swarm Start') { & schtasks /run /tn 'L2Swarm Start' | Out-Null; Say 'L2Swarm is starting again (accounts log in one by one).' Green }
        else { Remove-Item (Join-Path $root 'Logs\l2swarm_stopped.flag') -ErrorAction SilentlyContinue; Say 'start L2Swarm again yourself now (no "L2Swarm Start" task on this PC - SETUP.cmd -Apply registers it).' Yellow }
    }
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
if ((Get-Process L2Swarm -ErrorAction SilentlyContinue) -and -not $Check) {
    Say 'note: L2Swarm is running. If there is an update, L2Swarm and the dashboard are closed first and started again at the end.' Yellow
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
    if ($old -eq $new) {
        Say "already up to date ($oldVer)." Green
        $gone = @(& git ls-files --deleted)                      # REPAIR-2026-10-21: files of this version that are missing on disk come back
        if ($gone.Count -and -not $Check) { & git checkout -- $gone; Say "  restored $($gone.Count) missing file(s): $(($gone | Select-Object -First 5) -join ', ')" Yellow }
        if ($Check) { exit 0 }
    }
    else {
        Say "update available: $oldVer -> $newVer" Green
        if ($Check) { & git log --oneline "$old..$new" | Select-Object -First 20 | ForEach-Object { Say "  $_" }; exit 0 }
        $mod = @(& git diff --name-only HEAD) + @(& git diff --name-only --cached) | Where-Object { $_ } | Sort-Object -Unique
        $upChanged = @(& git diff --name-only $old $new)
        foreach ($f in $mod) { Backup $f }
        StopEverything
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
            } elseif ($upChanged -contains $f -and -not (Test-Path -LiteralPath $live) -and ($rel -like 'Scripts\data\*.json') -and (Test-Path -LiteralPath ($live -replace '\.json$', '.example.json'))) {
                # the package stopped shipping this data file and ships <name>.example.json instead (v1.6.0: stash_rules, spot_learned ...):
                # it is one of YOUR data files from now on - your copy stays
                Copy-Item -LiteralPath $mine $live -Force
                [void]$kept.Add("$rel   (yours from now on: the package ships $(Split-Path ($live -replace '\.json$', '.example.json') -Leaf))")
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
        # ZIPINSTALL 2026-10-13 (tester: "no git and no -Zip/-Repo" although git is installed - the folder came from a zip, so it has no .git):
        # the package repository is PUBLIC since v1.2.0 -> a zip install downloads the newest RELEASE from it, no git and no token needed
        if (-not $Repo -and (Test-Path "$root\update_source.txt")) { $Repo = ((Get-Content "$root\update_source.txt") | Where-Object { $_ -and -not $_.StartsWith('#') } | Select-Object -First 1); if ($Repo) { $Repo = $Repo.Trim() } }
        if (-not $Repo) { Say 'no git, no update_source.txt and no -Zip/-Repo: download the newest SwarmKit zip from the GitHub releases page and run  update.cmd -Zip <file.zip>' Red; exit 1 }
        $Repo = $Repo -replace '^https://github\.com/', '' -replace '\.git$', ''
        if ($git -and -not (Test-Path "$root\.git")) { Say 'git is installed, but this folder was installed from a zip (no .git folder) - updating from the release zip instead.' Yellow }
        $hdr = @{ 'User-Agent' = 'swarm-update' }
        $tok = $env:SWARM_GITHUB_TOKEN
        if ($tok) { $hdr.Authorization = "Bearer $tok" }                      # only needed for a PRIVATE copy of the repository
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        # the RELEASE asset (SwarmKit-vX.Y.Z.zip, served by GitHub's download CDN) - not the API zipball of the whole repository
        # (2026-10-13 test: the ~485 MB zipball through Invoke-WebRequest broke off: "the connection was closed unexpectedly")
        $rel = $null
        $relUri = if ($Version) { "https://api.github.com/repos/$Repo/releases/tags/$Version" } else { "https://api.github.com/repos/$Repo/releases/latest" }
        try { $rel = Invoke-RestMethod -UseBasicParsing -Headers $hdr -Uri $relUri } catch { $rel = $null }
        if (-not $rel -or -not $rel.tag_name) { Say "no release $(if ($Version) { $Version } else { '' }) found on $Repo (no network?) - download the SwarmKit zip from its GitHub releases page and run  update.cmd -Zip <file.zip>" Red; exit 1 }
        $ref = $rel.tag_name
        Say "newest release on $Repo`: $ref"
        $miss = @(MissingFiles "$root\MANIFEST.sha256")        # REPAIR-2026-10-21: same version but files missing -> download it again and repair
        if (($ref -replace '^v', '') -eq $oldVer -and -not $miss.Count) {
            Say "already up to date ($oldVer)." Green
            # CLEANUPDATE: up to date, but the bots may still run an older script (an earlier update could not load it) -> load it now
            $dev0 = "$root\Scripts_dev\swarm.js"; $live0 = "$root\Scripts\swarm.js"
            if (-not $Check -and -not $NoDeploy -and (Test-Path $dev0) -and ((Hash $dev0) -ne (Hash $live0))) {
                Say 'your bots run an older script than this version - loading the new one.' Yellow
                if (Get-Process L2Swarm -ErrorAction SilentlyContinue) { StopEverything }
                & node --check $dev0
                if ($LASTEXITCODE -eq 0) { Copy-Item $dev0 $live0 -Force; $devA0 = "$root\Scripts_dev\agent2.js"; if (Test-Path $devA0) { Copy-Item $devA0 "$root\Scripts\agent2.js" -Force } }
                StartEverything
                if ((Hash $dev0) -eq (Hash $live0)) { Say 'bot script check: Scripts\swarm.js is the new version.' Green } else { Say '!!! bot script check FAILED: Scripts\swarm.js is not the new version !!!' Red; exit 1 }
            }
            exit 0
        }
        if ($miss.Count) { Say "$($miss.Count) file(s) of your version are missing (e.g. $($miss[0])) - downloading $ref to repair" Yellow }
        if ($Check) { Say "update available: $oldVer -> $($ref -replace '^v', '')" Green; exit 0 }
        $asset = @($rel.assets) | Where-Object { $_.name -like 'SwarmKit-*.zip' } | Select-Object -First 1
        $url = if ($asset) { $asset.browser_download_url } else { "https://api.github.com/repos/$Repo/zipball/$ref" }
        $Zip = Join-Path $env:TEMP "swarm_package_$stamp.zip"
        Say ("downloading $(if ($asset) { $asset.name + ' (' + [Math]::Round($asset.size / 1MB) + ' MB)' } else { $ref + ' (source zip)' }) ...")
        # DLRETRY-2026-10-27 (tester log, Windows curl: "curl: (56) schannel: failed to read data from server: SEC_E_DECRYPT_FAILURE (0x80090330)"
        # twice, then "Resuming transfer from byte position ..." finished): a TLS read error mid-download is not one curl's own --retry repeats
        # (only --retry-all-errors does, curl 7.71+). Now: a bounded loop of 6 tries with back-off (2, 4, 8, 16, 30 s), each RESUMING the partial
        # file (-C -), a stalled transfer is broken off (--speed-limit / --speed-time) and resumed, and the finished zip is checked against the
        # release asset's size and its SHA-256 digest (GitHub "digest": "sha256:...") when the release lists one; a wrong file is deleted and
        # downloaded again from byte 0. TLS is never weakened (no -k / --insecure; --ssl-no-revoke only when schannel cannot reach the revocation server).
        $wantSize = if ($asset -and $asset.size) { [int64]$asset.size } else { 0 }
        $wantSha = if ($asset -and $asset.digest -and ([string]$asset.digest) -match '^sha256:([0-9a-fA-F]{64})$') { $Matches[1].ToUpper() } else { '' }
        function ZipCheck {
            if (-not (Test-Path -LiteralPath $Zip)) { return 'missing' }
            $len = (Get-Item -LiteralPath $Zip).Length
            if ($wantSize -gt 0 -and $len -lt $wantSize) { return 'short' }
            if ($wantSize -gt 0 -and $len -gt $wantSize) { return "too big ($len bytes, the release says $wantSize)" }
            if ($wantSha -and ((Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash -ne $wantSha)) { return 'sha256 differs from the release digest' }
            return ''
        }
        $ok = $false; $why = ''
        $curl = Get-Command curl.exe -ErrorAction SilentlyContinue                # Windows 10+: resumes and retries a broken download
        if ($curl) {
            $cver = [version]'0.0'; try { if (((& $curl.Source --version 2>$null) | Select-Object -First 1) -match '^curl (\d+\.\d+)') { $cver = [version]$Matches[1] } } catch { }
            $cargs = @('-L', '--fail', '--retry', '5', '--retry-delay', '3', '--connect-timeout', '30', '--speed-limit', '1024', '--speed-time', '60', '-C', '-', '-A', 'swarm-update', '-o', $Zip)
            if ($cver -ge [version]'7.71') { $cargs = @('--retry-all-errors') + $cargs }
            if ($tok -and -not $asset) { $cargs += @('-H', "Authorization: Bearer $tok") }
            $noRevoke = $false
            $waits = @(2, 4, 8, 16, 30)
            for ($try = 1; $try -le 6 -and -not $ok; $try++) {
                $a = if ($noRevoke) { @('--ssl-no-revoke') + $cargs } else { $cargs }
                & $curl.Source @a $url; $rc = $LASTEXITCODE                       # its progress bar + errors go straight to the window
                # CRYPT_E_NO_REVOCATION_CHECK / REVOCATION_OFFLINE: schannel could not reach the certificate revocation server (offline CRL / proxy).
                # Only that error (read from a tiny header probe, stderr captured with 'Continue': PowerShell 5.1 + 'Stop' would throw on curl's
                # stderr) lets the next try skip the revocation lookup; the certificate itself is still checked
                if ($rc -eq 35 -and -not $noRevoke) {
                    $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
                    $probe = (@(& $curl.Source -sS -I -L --max-time 30 -A 'swarm-update' $url 2>&1 | ForEach-Object { [string]$_ }) -join ' ')
                    $ErrorActionPreference = $eap
                    if ($probe -match 'REVOCATION|0x80092012|0x80092013') { $noRevoke = $true; Say '  the certificate revocation server cannot be reached - next try without the revocation lookup' Yellow }
                }
                $chk = ZipCheck
                if ($chk -eq '' -and ($rc -eq 0 -or $wantSize -gt 0)) { $ok = $true; break }   # without a known size only curl's own "complete" counts
                if ($rc -eq 33 -or $rc -eq 36) { Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue; $chk = 'missing' }   # the server cannot resume: start over
                if ($rc -eq 0 -and $chk -ne 'short') { $why = $chk; Say "  downloaded file is wrong: $chk - deleting it and downloading again" Yellow; Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue }
                elseif ($rc -ne 0) { $why = "curl exit $rc" }
                if ($try -lt 6) { $w = $waits[[Math]::Min($try - 1, $waits.Count - 1)]; Say "  download try $try/6 did not finish ($(if ($why) { $why } else { 'incomplete' })) - resuming in $w s ..." Yellow; Start-Sleep -Seconds $w }
            }
        }
        if (-not $ok) {
            $ProgressPreference = 'SilentlyContinue'                                # the progress bar makes Invoke-WebRequest many times slower
            for ($try = 1; $try -le 2 -and -not $ok; $try++) {
                Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue  # no resume here: always a whole file
                try { Invoke-WebRequest -UseBasicParsing -Headers $hdr -Uri $url -OutFile $Zip; $chk = ZipCheck; $ok = ($chk -eq ''); if (-not $ok) { $why = $chk; Say "  downloaded file is wrong: $chk" Yellow } }
                catch { $ok = $false; $why = $_.Exception.Message; Say "download error: $why" Red; Start-Sleep -Seconds 5 }
            }
        }
        if (-not $ok) { Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue; Say "download of $Repo $ref failed$(if ($why) { " ($why)" }) - download the SwarmKit zip from its GitHub releases page yourself and run  update.cmd -Zip <file.zip>" Red; exit 1 }
        Say ("  download complete and checked: $([Math]::Round((Get-Item -LiteralPath $Zip).Length / 1MB)) MB" + $(if ($wantSha) { ', SHA-256 matches the release' } elseif ($wantSize) { ', size matches the release' } else { '' })) Green
    }
    $tmp = Join-Path $env:TEMP "swarm_package_$stamp"
    # FASTUNZIP-2026-10-25 (tester: "1.10.0 download was fast but unpacking has been 20+ minutes"): PowerShell 5's Expand-Archive is very slow on a
    # 500 MB / 8000-file zip. First Windows' own tar (Windows 10 1803+, unpacks zips), then .NET ZipFile, Expand-Archive only as the last resort.
    New-Item -ItemType Directory -Force $tmp | Out-Null
    Say 'unpacking (a minute or two)...'
    $unz = $false
    $tarExe = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path $tarExe) { & $tarExe -xf $Zip -C $tmp 2>$null; $unz = ($LASTEXITCODE -eq 0) -and @(Get-ChildItem $tmp -Force).Count -gt 0 }
    if (-not $unz) { try { Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($Zip, $tmp); $unz = $true } catch { $unz = $false } }
    if (-not $unz) { Expand-Archive -LiteralPath $Zip -DestinationPath $tmp -Force }
    $src = Get-ChildItem $tmp -Recurse -Filter VERSION | Where-Object { Test-Path (Join-Path $_.DirectoryName 'MANIFEST.sha256') } | Select-Object -First 1
    if (-not $src) { Say 'the zip is not a swarm package (no VERSION + MANIFEST.sha256 inside).' Red; exit 1 }
    $src = $src.DirectoryName
    $newVer = (Get-Content "$src\VERSION" -Raw).Trim()
    function ReadManifest($f) { $h = @{}; if (Test-Path $f) { Get-Content $f | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object { $x, $n = $_ -split '\s+', 2; $h[$n.Trim() -replace '/', '\'] = $x } }; $h }
    $oldMan = ReadManifest "$root\MANIFEST.sha256"; $newMan = ReadManifest "$src\MANIFEST.sha256"
    if ($oldVer -eq $newVer -and (Hash "$root\MANIFEST.sha256") -eq (Hash "$src\MANIFEST.sha256")) {
        Say "already up to date ($oldVer)." Green
        foreach ($m in @(MissingFiles "$root\MANIFEST.sha256")) {         # REPAIR-2026-10-21: a file of this version that is missing comes back
            $from = Join-Path $src $m; $to = Join-Path $root $m
            if (-not $Check -and (Test-Path -LiteralPath $from)) { New-Item -ItemType Directory -Force (Split-Path $to) | Out-Null; Copy-Item -LiteralPath $from $to -Force; Say "  restored missing $m" Yellow }
        }
        Remove-Item -Recurse -Force $tmp; if ($Check) { exit 0 }
    }
    else {
        Say "update: $oldVer -> $newVer" Green
        if ($Check) { Remove-Item -Recurse -Force $tmp; exit 0 }
        $files = @($newMan.Keys) + @('MANIFEST.sha256')
        StopEverything
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

# ------------------------------------------------------------------ NEW ENGINE = THE DEFAULT (v1.6.2, 2026-10-13)
# Scripts\data\brain_host.json is YOUR file (never overwritten). Only the untouched old default (new engine off, no characters in "allow",
# no "allowAll" key) is switched to the new default ("on": true, "allowAll": true = every character of swarm.config.json); a file you
# changed is kept as it is. Backup first (Logs\update_backup\<time>\). docs\plan\tools\engine_default.js holds the rule.
$engineStatus = ''; $engineMigrated = $false
if ((Test-Path "$root\Scripts\data\brain_host.json") -and (Test-Path "$root\docs\plan\tools\engine_default.js") -and (Get-Command node -ErrorAction SilentlyContinue)) {
    Backup 'Scripts\data\brain_host.json'
    $eo = @(& node "$root\docs\plan\tools\engine_default.js" --migrate --root $root 2>&1 | ForEach-Object { [string]$_ })
    foreach ($l in $eo) {
        if ($l -like 'MIGRATED:*') { $engineMigrated = $true; Say ('  new engine: switched ON (it is the default now) - ' + $l.Substring(9).Trim()) Green }
        elseif ($l -like 'KEPT:*') { Say ('  new engine: your Scripts\data\brain_host.json is kept - ' + $l.Substring(5).Trim()) }
        elseif ($l -like 'STATUS:*') { $engineStatus = $l.Substring(7).Trim() }
    }
}

# ------------------------------------------------------------------ account XML field order for L2Swarm 3.10.7
# XMLORDER-2026-10-27 (tester: "The account options XML does not match the internal schema ... CombatSkill/RepeatDelaySeconds"): 3.10.7 wants
# RepeatDelaySeconds right before IsRepeat; files written in the old order are refused at login. Moves only that element (backup in Settings\backup\xmlorder_*).
if ((Test-Path "$root\docs\plan\tools\xml_order_fix.js") -and (Get-Command node -ErrorAction SilentlyContinue)) {
    $xo = @(& node "$root\docs\plan\tools\xml_order_fix.js" --root $root 2>&1 | ForEach-Object { [string]$_ })
    foreach ($l in $xo) { if ($l -match 'moved before|fixed \([1-9]') { Say ('  ' + $l) Green } }
}

# ------------------------------------------------------------------ files generated from YOUR L2Swarm (never shipped)
if (-not (Test-Path "$root\Scripts\data\npc_strings.json") -and (Test-Path "$root\Data\base.db") -and (Get-Command node -ErrorAction SilentlyContinue)) {
    Say 'generating Scripts\data\npc_strings.json from your Data\base.db ...'
    & node "$root\docs\plan\tools\extract_game_assets.js" --root $root --data-only
}

# ------------------------------------------------------------------ deploy swarm.js
$dev = "$root\Scripts_dev\swarm.js"; $live = "$root\Scripts\swarm.js"
if (-not $NoDeploy -and (Test-Path $dev) -and ((Hash $dev) -ne (Hash $live))) {
    # CLEANUPDATE: the files may be up to date while the bots still run an older script (an earlier update could not load it): close
    # everything here too, so the copy below always happens
    if (Get-Process L2Swarm -ErrorAction SilentlyContinue) { Say 'your bots run an older script than this version - loading the new one.' Yellow; StopEverything }
    if (Get-Process L2Swarm -ErrorAction SilentlyContinue) {
        Say 'deploying Scripts_dev\swarm.js through deploy_swarm.ps1 (L2Swarm is running: every account reloads the script once) ...'
        & powershell -NoProfile -ExecutionPolicy Bypass -File "$root\docs\plan\tools\deploy_swarm.ps1"
        # PKGDEPLOY-2026-11-11: a deploy refused only for the moment (a trade / regroup / raid / login running, or the 15 min gap) is retried
        # for up to 10 minutes; before, the update ended with a yellow line and the bots kept the OLD script while the dashboard was new
        $until = (Get-Date).AddMinutes(10)
        while (@(2, 4, 5, 8) -contains $LASTEXITCODE -and (Get-Date) -lt $until) {
            Say "  waiting for a quiet moment to load the new script (exit ${LASTEXITCODE} - see the line above) - trying again in 30 s ..." Yellow
            Start-Sleep 30
            & powershell -NoProfile -ExecutionPolicy Bypass -File "$root\docs\plan\tools\deploy_swarm.ps1"
        }
        if ($LASTEXITCODE -ne 0) {
            Say '' ; Say '!!! YOUR BOTS STILL RUN THE OLD SCRIPT !!!' Red
            Say "deploy_swarm.ps1 did not load Scripts_dev\swarm.js (exit $LASTEXITCODE - see its message above). The dashboard is already new, so new buttons may do nothing until it is loaded." Red
            Say 'Finish it with:  powershell -File docs\plan\tools\deploy_swarm.ps1 -Force   (or stop L2Swarm and run update.cmd again)' Red
        }
    } else {
        New-Item -ItemType Directory -Force (Split-Path $live) | Out-Null
        & node --check $dev; if ($LASTEXITCODE -ne 0) { Say 'Scripts_dev\swarm.js has a syntax error - not deployed' Red } else { Copy-Item $dev $live -Force; Say 'deployed Scripts_dev\swarm.js -> Scripts\swarm.js (L2Swarm is not running)' }
    }
}

# ------------------------------------------------------------------ the new engine's agent (v1.6.0): Scripts_dev\agent2.js -> Scripts\agent2.js
# (harmless when the new engine is off: no account runs it; accounts that do run it reload it and reconnect within seconds)
$devA = "$root\Scripts_dev\agent2.js"; $liveA = "$root\Scripts\agent2.js"
if (-not $NoDeploy -and (Test-Path $devA) -and ((Hash $devA) -ne (Hash $liveA))) {
    & node --check $devA; if ($LASTEXITCODE -ne 0) { Say 'Scripts_dev\agent2.js has a syntax error - not deployed' Red } else { Copy-Item $devA $liveA -Force; Say 'deployed Scripts_dev\agent2.js -> Scripts\agent2.js' }
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
# CLEANUPDATE: everything that was closed is started again, and the live script is checked
if ($script:stoppedAll) {
    StartEverything
    if (-not $NoDeploy -and (Test-Path $dev)) {
        if ((Hash $dev) -eq (Hash $live)) { Say 'bot script check: Scripts\swarm.js is the new version - your bots run it once they are logged in.' Green }
        else { Say '!!! bot script check FAILED: Scripts\swarm.js is not the new version (see the messages above) !!!' Red }
    }
    if ($engineStatus) { Say "New engine: $engineStatus" }
    exit 0
}
if ($updated -or $engineMigrated) {
    # what the user must do now (2026-10-13: the new engine is the default; the dashboard runs it, so it needs the new server code)
    # DASHRESTART-2026-10-13 (tester: "'restart the dashboard' - is there a command for this? I reloaded the page and the new UI appeared but none
    # of it works"): the running dashboard keeps its old server code -> restart it here: the process listening on the dashboard port is stopped
    # and Dashboard\start.cmd is started again (minimized; it also opens the page)
    $dashRestarted = $false
    try {
        $dport = 8090; try { $dp = (& node -e "console.log(require('./docs/plan/tools/swarm_config.js').dashboardPort)" 2>$null); if ($dp) { $dport = [int]($dp | Select-Object -First 1) } } catch { }
        $lst = Get-NetTCPConnection -LocalPort $dport -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($lst) {
            $dproc = Get-Process -Id $lst.OwningProcess -ErrorAction SilentlyContinue
            if ($dproc -and $dproc.ProcessName -match '^node$') {
                Say "restarting the dashboard (port $dport, node pid $($dproc.Id)) so it runs the new code ..."
                Stop-Process -Id $dproc.Id -Force -ErrorAction SilentlyContinue; Start-Sleep 2
                Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$root\Dashboard\start.cmd`"" -WorkingDirectory "$root\Dashboard" -WindowStyle Minimized
                $dashRestarted = $true; Say 'dashboard restarted - reload the page in your browser.' Green
            }
        }
    } catch { Say "could not restart the dashboard by itself: $($_.Exception.Message)" Yellow }
    Say ''; Say 'WHAT YOU MUST DO NOW' Cyan
    if ($dashRestarted) { Say '  1. The dashboard was restarted with the new code: reload the page in your browser.' Green }
    else {
    Say '  1. Restart the dashboard (close its window / node process, then start Dashboard\start.cmd): an update only replaces its files,' Yellow
    Say '     the running dashboard keeps the old code until it is restarted. It also starts the new engine''s brain pool.' Yellow
    }
    if ($engineStatus) {
        Say "  2. New engine: $engineStatus"
        if ($engineStatus -like 'new engine ON*') {
            Say '     Accounts that still run swarm.js inside L2Swarm keep running as before until you move them, one by one:' Yellow
            Say '       dashboard -> PC tab -> New engine -> "Check accounts", then "Move accounts to the new engine"' Yellow
            Say '       (or: node docs\plan\tools\attach_agent.js --all   = dry run, then  node docs\plan\tools\attach_agent.js --all --apply)' Yellow
            Say '       With L2Swarm stopped, SETUP.cmd -Apply switches the account configs instead (swarm.js off, agent2.js on).'
            Say '     Back to the old engine: Scripts\data\brain_host.json "on": false, then attach_agent.js --back --names <A,B,...> --apply'
            Say '     (or SETUP.cmd -Apply with L2Swarm stopped). Details: docs\plan\INSTALL.md, section "New engine".'
        }
    }
}
exit 0
