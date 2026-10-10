@echo off
rem Updates the swarm package in this folder (see update.ps1 for options: -Check, -Version vX.Y.Z, -NoDeploy, -Zip file.zip).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" %*
echo.
pause
