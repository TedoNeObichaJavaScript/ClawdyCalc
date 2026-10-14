@echo off
rem Double-click to start ClawdyCalc.
rem Opens the desktop app if it's installed (npm install), otherwise the browser version.
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
) else (
  start "ClawdyCalc" /min node bin\clawdycalc.js
)
