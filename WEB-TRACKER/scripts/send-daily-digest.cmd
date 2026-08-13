@echo off
setlocal EnableExtensions
rem Windows Task Scheduler entrypoint for the Career-Ops daily digest.
rem Avoids nested cmd.exe quote breakage on Dropbox paths with spaces.

set "SCRIPT_DIR=%~dp0"
set "TRACKER_DIR=%SCRIPT_DIR%.."
set "LOG_FILE=%TRACKER_DIR%\runtime\daily-digest.log"

if not exist "%TRACKER_DIR%\runtime" mkdir "%TRACKER_DIR%\runtime"

cd /d "%TRACKER_DIR%" || (
  echo [daily-digest] Failed to enter "%TRACKER_DIR%" >> "%LOG_FILE%"
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [daily-digest] node.exe not found in PATH >> "%LOG_FILE%"
  exit /b 1
)

if "%~1"=="" (
  node "%SCRIPT_DIR%send-daily-digest.mjs" --send >> "%LOG_FILE%" 2>&1
) else (
  node "%SCRIPT_DIR%send-daily-digest.mjs" %* >> "%LOG_FILE%" 2>&1
)
exit /b %ERRORLEVEL%
