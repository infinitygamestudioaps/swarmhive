# register_killprocess_task.ps1 - run ONCE as administrator (user 2026-10-13: "make the KillProcess task").
# Registers the elevated scheduled task "L2Swarm KillProcess" (same principal as L2Swarm Start / Stop / MemWatch). It has no trigger: it only
# runs when started with  schtasks /run /tn "L2Swarm KillProcess"  and then closes the ONE process named in Logs\kill_request.json if it is on
# the allow list in kill_process.ps1 (l2.exe, leftover Git shell tools, node scripts under the L2Swarm folder). Remove it again with:
#   Unregister-ScheduledTask -TaskName 'L2Swarm KillProcess' -Confirm:$false
$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host 'Run this as administrator (right-click PowerShell -> Run as administrator).' -ForegroundColor Red; exit 1 }
$user = (Get-CimInstance Win32_ComputerSystem).UserName
$prn  = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
$cfg  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
$act  = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$PSScriptRoot\run_kill_hidden.vbs`""
Register-ScheduledTask -TaskName 'L2Swarm KillProcess' -Action $act -Principal $prn -Settings $cfg -Force | Out-Null
Write-Host "task 'L2Swarm KillProcess' registered for $user (elevated, no trigger: runs only on request)" -ForegroundColor Green
