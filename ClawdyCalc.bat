@echo off
rem Double-click to start ClawdyCalc. Close the minimized window to stop it.
cd /d "%~dp0"
start "ClawdyCalc" /min node bin\clawdycalc.js
