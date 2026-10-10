@echo off
rem Double-click this file and click "Yes". Sets lid/sleep/hibernate to do nothing, turns Windows Update off,
rem and installs the L2Swarm memory watchdog. Undo: docs\plan\tools\pc_restore.ps1 (as admin).
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
if not exist "%~dp0Scripts_dev" mkdir "%~dp0Scripts_dev"
if not exist "%~dp0Scripts_dev\swarm.js" copy /Y "%~dp0Scripts\swarm.js" "%~dp0Scripts_dev\swarm.js" >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0docs\plan\tools\pc_alwayson.ps1"
echo.
echo Done. Go back to Claude and type: check
pause
