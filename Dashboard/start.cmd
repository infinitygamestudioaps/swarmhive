@echo off
rem Starts the Swarm dashboard and opens it in the browser. The port comes from swarm.config.json (dashboard.port, default 8090).
cd /d "%~dp0"
set PORT=8090
for /f %%p in ('node -e "console.log(require('../docs/plan/tools/swarm_config.js').dashboardPort)"') do set PORT=%%p
start "" http://127.0.0.1:%PORT%
node server.js
