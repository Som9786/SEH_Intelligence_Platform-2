@echo off
rem Starts the SEH Intelligence Platform from this folder. Requires Node.js 18 or later.
rem Extra arguments are passed on, e.g.  start.cmd --port 9000 --host 0.0.0.0
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 18 or later from https://nodejs.org and try again.
  pause
  exit /b 1
)
node "%~dp0serve.mjs" %*
if errorlevel 1 pause
