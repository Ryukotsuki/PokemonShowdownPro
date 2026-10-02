@echo off
cd /d "%~dp0"
call npm.cmd start
if errorlevel 1 pause
