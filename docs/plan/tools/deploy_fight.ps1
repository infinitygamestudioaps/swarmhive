# DEPLOYFIGHT-2026-11-25 (owner: "Ja, ret deploy-scriptet"; live: the 15:16:32 deploy restarted Spoiler11's script in a fight at 65 % HP - his log was
# empty for the reload and he died 17 s later at Devil's Isle): a deploy reloads EVERY script, so it waits while any character fights below
# $DeployFightBelow % HP (alive, combat on, live state < 2 min old). -Force still deploys (logged).
# Dot-sourced by deploy_swarm.ps1. Test: docs/plan/tools/test_owner_1125.js (runs this file through PowerShell).
$DeployFightBelow = 70
function DeployFightWhy($s) {
    if (-not $s) { return '' }
    $hp = 0.0; try { $hp = [double]$s.hp } catch { $hp = 0.0 }
    if ($s.dead -or -not $s.combat -or $hp -le 0 -or $hp -ge $DeployFightBelow) { return '' }
    return "fighting at $([math]::Round($hp)) % HP"
}
