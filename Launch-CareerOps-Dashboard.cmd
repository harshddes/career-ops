@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "REPO_ROOT=%~dp0"
set "TRACKER_DIR=%REPO_ROOT%WEB-TRACKER"
set "DASHBOARD_HOST=127.0.0.1"
set "DASHBOARD_PORT=3737"
set "DASHBOARD_URL=http://127.0.0.1:3737/dashboard/fusion-pivot-dashboard.html"
set "DASHBOARD_HEALTH=http://127.0.0.1:3737/healthz"
set "RUNTIME_DIR=%TRACKER_DIR%\runtime"
set "MODE=assisted"
set "OPEN_BROWSER=1"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--no-open" (
  set "OPEN_BROWSER=0"
  shift
  goto parse_args
)
if /I "%~1"=="assisted" (
  set "MODE=assisted"
  shift
  goto parse_args
)
if /I "%~1"=="autopilot" (
  set "MODE=autopilot"
  shift
  goto parse_args
)
if /I "%~1"=="manual" (
  set "MODE=manual"
  shift
  goto parse_args
)
echo [career-ops] Invalid argument "%~1".
echo [career-ops] Use: Launch-CareerOps-Dashboard.cmd [assisted^|autopilot^|manual] [--no-open]
goto fail

:args_done
if not exist "%TRACKER_DIR%\package.json" (
  echo [career-ops] Could not find WEB-TRACKER\package.json.
  goto fail
)

if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"

call :is_dashboard_healthy
if "%DASHBOARD_RUNNING%"=="1" (
  echo [career-ops] Dashboard already healthy on %DASHBOARD_URL%.
  call :write_port_owner_pid
  call :open_dashboard
  exit /b 0
)

call :is_dashboard_page_available
if "%DASHBOARD_PAGE_AVAILABLE%"=="1" (
  echo [career-ops] Dashboard page is present, but health check is missing.
  echo [career-ops] Replacing stale WEB-TRACKER dashboard process on port %DASHBOARD_PORT%...
  call :replace_stale_dashboard_process
  if errorlevel 1 (
    call :print_port_owner
    goto fail
  )
  call :wait_port_free
  if "%PORT_LISTENING%"=="1" (
    echo [career-ops] Port %DASHBOARD_PORT% did not become free after stopping stale dashboard.
    call :print_port_owner
    goto fail
  )
)

call :is_port_listening
if "%PORT_LISTENING%"=="1" (
  echo [career-ops] Port %DASHBOARD_PORT% is already in use and is not a healthy dashboard.
  echo [career-ops] I will not stop unrelated processes automatically.
  call :print_port_owner
  goto fail
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

cd /d "%TRACKER_DIR%" || (
  echo [career-ops] Failed to enter "%TRACKER_DIR%".
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

set "HOST=%DASHBOARD_HOST%"
set "PORT=%DASHBOARD_PORT%"

echo [career-ops] Starting dashboard in %MODE% mode on %DASHBOARD_URL%...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $env:HOST='%DASHBOARD_HOST%'; $env:PORT='%DASHBOARD_PORT%'; $out='%RUNTIME_DIR%\dashboard.out.log'; $err='%RUNTIME_DIR%\dashboard.err.log'; $pidFile='%RUNTIME_DIR%\dashboard.pid'; $node=(Get-Command node -ErrorAction Stop).Source; $run='%TRACKER_DIR%\run.mjs'; $argLine=([char]34 + $run + [char]34 + ' --mode %MODE% --no-open'); $p = Start-Process -FilePath $node -ArgumentList $argLine -WorkingDirectory '%TRACKER_DIR%' -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru; Set-Content -Path $pidFile -Value $p.Id"
if errorlevel 1 (
  echo [career-ops] Dashboard failed to start.
  call :print_port_owner
  goto fail
)

call :wait_dashboard_healthy
if "%DASHBOARD_RUNNING%"=="1" (
  call :write_port_owner_pid
  echo [career-ops] Dashboard is ready.
  call :open_dashboard
  exit /b 0
)

echo [career-ops] Dashboard process started, but health check did not pass in time.
echo [career-ops] Logs:
echo [career-ops]   %RUNTIME_DIR%\dashboard.out.log
echo [career-ops]   %RUNTIME_DIR%\dashboard.err.log
call :print_port_owner
goto fail

:is_dashboard_healthy
set "DASHBOARD_RUNNING=0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri '%DASHBOARD_HEALTH%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; exit 1" >nul 2>nul
if errorlevel 1 (
  set "DASHBOARD_RUNNING=0"
) else (
  set "DASHBOARD_RUNNING=1"
)
exit /b 0

:is_dashboard_page_available
set "DASHBOARD_PAGE_AVAILABLE=0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri '%DASHBOARD_URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; exit 1" >nul 2>nul
if errorlevel 1 (
  set "DASHBOARD_PAGE_AVAILABLE=0"
) else (
  set "DASHBOARD_PAGE_AVAILABLE=1"
)
exit /b 0

:is_port_listening
set "PORT_LISTENING=0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalPort %DASHBOARD_PORT% -State Listen -ErrorAction SilentlyContinue) { exit 0 }; exit 1" >nul 2>nul
if errorlevel 1 (
  set "PORT_LISTENING=0"
) else (
  set "PORT_LISTENING=1"
)
exit /b 0

:replace_stale_dashboard_process
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $tracker=[IO.Path]::GetFullPath('%TRACKER_DIR%'); $run=[IO.Path]::GetFullPath((Join-Path $tracker 'run.mjs')); $conn=Get-NetTCPConnection -LocalPort %DASHBOARD_PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $conn) { exit 0 }; $ownerPid=[int]$conn.OwningProcess; $proc=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ownerPid); $cmd=($proc.CommandLine + ''); $normCmd=$cmd.Replace('/','\'); $normRun=$run.Replace('/','\'); if (($normCmd -notlike ('*' + $normRun + '*')) -and ($normCmd -notmatch 'WEB-TRACKER\\run\.mjs')) { Write-Output ('Port %DASHBOARD_PORT% is not owned by this WEB-TRACKER dashboard.'); exit 2 }; Write-Output ('Stopping stale dashboard process PID ' + $ownerPid + '.'); Stop-Process -Id $ownerPid -Force"
exit /b %ERRORLEVEL%

:wait_port_free
set "PORT_LISTENING=1"
for /L %%I in (1,1,10) do (
  call :is_port_listening
  if "!PORT_LISTENING!"=="0" exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 0

:wait_dashboard_healthy
set "DASHBOARD_RUNNING=0"
for /L %%I in (1,1,60) do (
  call :is_dashboard_healthy
  if "!DASHBOARD_RUNNING!"=="1" exit /b 0
  ping -n 2 127.0.0.1 >nul
)
exit /b 0

:write_port_owner_pid
powershell -NoProfile -ExecutionPolicy Bypass -Command "$conn=Get-NetTCPConnection -LocalPort %DASHBOARD_PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { Set-Content -Path '%RUNTIME_DIR%\dashboard.pid' -Value ([int]$conn.OwningProcess) }" >nul 2>nul
exit /b 0

:print_port_owner
for /f "usebackq delims=" %%L in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$conn=Get-NetTCPConnection -LocalPort %DASHBOARD_PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $conn) { Write-Output 'Port %DASHBOARD_PORT% is not currently in use.'; exit 0 }; $ownerPid=[int]$conn.OwningProcess; $proc=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ownerPid); Write-Output ('Port %DASHBOARD_PORT% is in use by ' + $proc.Name + ' (PID ' + $ownerPid + ').'); if ($proc.CommandLine) { Write-Output ('Command line: ' + $proc.CommandLine) }"`) do (
  echo [career-ops] %%L
)
exit /b 0

:open_dashboard
if "%OPEN_BROWSER%"=="1" (
  echo [career-ops] Opening browser...
  start "" "%DASHBOARD_URL%"
) else (
  echo [career-ops] Browser launch skipped. Open %DASHBOARD_URL%
)
exit /b 0

:fail
echo.
echo [career-ops] Launch failed. Fix the error above, then run this file again.
if "%OPEN_BROWSER%"=="1" pause
exit /b 1
