@echo off
rem One-click installer for the swarm kit: finds your L2Swarm folder, checks Node.js/Git, copies the kit in, imports your
rem L2Swarm accounts into swarm.config.json, runs SETUP and starts the dashboard. It asks before every change.
rem   INSTALL.cmd            normal run (asks [y/N] before each step)
rem   INSTALL.cmd -DryRun    shows what it would do, changes nothing
rem   INSTALL.cmd -Root D:\Games\L2Swarm    use that L2Swarm folder
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
