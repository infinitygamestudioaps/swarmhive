@echo off
rem Double-click and click "Yes": stops everything of THIS folder (L2Swarm, dashboard, helpers) and DELETES every "L2Swarm *" scheduled task.
rem No file is deleted - afterwards you can delete or move the folder. Power / Windows Update: docs\plan\tools\pc_restore.ps1 (as admin).
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo This stops SwarmHive / L2Swarm in this folder and removes its scheduled tasks. Close this window to cancel.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0docs\plan\tools\uninstall.ps1" -Mode uninstall
pause
