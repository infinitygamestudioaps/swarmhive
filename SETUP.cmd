@echo off
rem L2Swarm setup from swarm.config.json (see docs\plan\INSTALL.md).
rem   Double-click        = DRY RUN: shows what would change, changes nothing.
rem   SETUP.cmd -Apply    = apply (asks for admin once, for the scheduled tasks). Stop L2Swarm first.
setlocal
set ARGS=%*
echo %ARGS% | findstr /i /c:"-Apply" >nul
if %errorlevel% equ 0 (
  net session >nul 2>&1
  if errorlevel 1 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%ARGS%' -Verb RunAs"
    exit /b
  )
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP.ps1" %ARGS%
echo.
pause
