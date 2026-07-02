@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "REPO_ROOT=%~dp0"
set "TRACKER_DIR=%REPO_ROOT%WEB-TRACKER"
set "DASHBOARD_URL=http://127.0.0.1:3737/dashboard/fusion-pivot-dashboard.html"
set "DASHBOARD_HEALTH=http://127.0.0.1:3737/healthz"
set "RUNTIME_DIR=%TRACKER_DIR%\runtime"
set "MODE=%~1"

if "%MODE%"=="" set "MODE=assisted"

if /I "%MODE%"=="assisted" goto mode_ok
if /I "%MODE%"=="autopilot" goto mode_ok
if /I "%MODE%"=="manual" goto mode_ok
echo [career-ops] Invalid mode "%MODE%".
echo [career-ops] Use assisted, autopilot, or manual.
goto fail

:mode_ok
if not exist "%TRACKER_DIR%\package.json" (
  echo [career-ops] Could not find WEB-TRACKER\package.json.
  goto fail
)

cd /d "%TRACKER_DIR%" || (
  echo [career-ops] Failed to enter "%TRACKER_DIR%".
  goto fail
)

call :is_dashboard_running
if "%DASHBOARD_RUNNING%"=="1" (
  echo [career-ops] Dashboard already running. Opening browser...
  start "" "%DASHBOARD_URL%"
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo [career-ops] Node.js was not found in PATH.
  echo [career-ops] Install Node.js LTS from https://nodejs.org and reopen this launcher.
  goto fail
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [career-ops] npm was not found in PATH.
  goto fail
)

if not exist "node_modules\express\package.json" (
  echo [career-ops] Installing WEB-TRACKER dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [career-ops] Dependency install failed.
    goto fail
  )
) else (
  echo [career-ops] Dependencies already installed.
)

echo [career-ops] Starting dashboard in %MODE% mode...
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $out='%RUNTIME_DIR%\dashboard.out.log'; $err='%RUNTIME_DIR%\dashboard.err.log'; $pidFile='%RUNTIME_DIR%\dashboard.pid'; $p = Start-Process -FilePath 'node' -ArgumentList @('run.mjs','--mode','%MODE%','--no-open') -WorkingDirectory '%TRACKER_DIR%' -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru; Set-Content -Path $pidFile -Value $p.Id"
if errorlevel 1 (
  echo [career-ops] Dashboard failed to start.
  call :print_port_owner
  goto fail
)

call :wait_dashboard_running
if "%DASHBOARD_RUNNING%"=="1" (
  echo [career-ops] Dashboard is ready. Opening browser...
  start "" "%DASHBOARD_URL%"
  exit /b 0
)

echo [career-ops] Dashboard process started, but health check did not pass in time.
echo [career-ops] Logs:
echo [career-ops]   %RUNTIME_DIR%\dashboard.out.log
echo [career-ops]   %RUNTIME_DIR%\dashboard.err.log
call :print_port_owner
goto fail

exit /b 0

:is_dashboard_running
set "DASHBOARD_RUNNING=0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri '%DASHBOARD_HEALTH%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  set "DASHBOARD_RUNNING=0"
) else (
  set "DASHBOARD_RUNNING=1"
)
exit /b 0

:wait_dashboard_running
set "DASHBOARD_RUNNING=0"
for /L %%I in (1,1,30) do (
  call :is_dashboard_running
  if "!DASHBOARD_RUNNING!"=="1" exit /b 0
  timeout /t 1 /nobreak >nul
)
exit /b 0

:print_port_owner
for /f "usebackq delims=" %%L in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$line = netstat -ano | Select-String ':3737' | Select-Object -First 1; if ($line) { $parts = ($line -replace '\s+',' ').Trim().Split(' '); $ownerPid = [int]$parts[-1]; try { $p = Get-Process -Id $ownerPid -ErrorAction Stop; Write-Output ('Port 3737 is in use by ' + $p.ProcessName + ' (PID ' + $ownerPid + ').') } catch { Write-Output ('Port 3737 is in use by PID ' + $ownerPid + '.') } } else { Write-Output 'Port 3737 is not currently in use.' }"`) do (
  echo [career-ops] %%L
)
exit /b 0

:fail
echo.
echo [career-ops] Launch failed. Fix the error above, then double-click this file again.
pause
exit /b 1
