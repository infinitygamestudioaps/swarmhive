@echo off
rem Double-click and click "Yes": stops L2Swarm, the dashboard and its helpers of THIS folder and switches the keep-alive tasks off
rem (nothing starts them again). Start again: SETUP.cmd. Log: Logs\uninstall.log
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0docs\plan\tools\uninstall.ps1" -Mode stop
pause
