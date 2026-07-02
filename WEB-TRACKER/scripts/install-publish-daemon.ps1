param(
  [switch]$Remove,
  [switch]$InitialSync
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$trackerRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
$daemonScript = Join-Path $trackerRoot "scripts\publish-daemon.mjs"
$startupDir = [Environment]::GetFolderPath("Startup")
$startupFile = Join-Path $startupDir "CareerOps-Publish-Daemon.cmd"

if ($Remove) {
  if (Test-Path $startupFile) {
    Remove-Item $startupFile -Force
    Write-Host "Removed startup launcher:"
    Write-Host "  $startupFile"
  } else {
    Write-Host "No startup launcher found:"
    Write-Host "  $startupFile"
  }
  exit 0
}

if (-not (Test-Path $daemonScript)) {
  throw "Cannot find publish daemon at $daemonScript"
}

$safeTrackerRoot = $trackerRoot.Replace('"', '""')
$initialFlag = if ($InitialSync) { " --initial-sync" } else { "" }
$content = @"
@echo off
setlocal EnableExtensions
set "TRACKER_ROOT=$safeTrackerRoot"

cd /d "%TRACKER_ROOT%" || goto fail
if not exist "scripts\publish-daemon.mjs" goto fail

if not exist "node_modules\chokidar\package.json" (
  call npm install --no-audit --no-fund
  if errorlevel 1 goto fail
)

start "CareerOps Publish Daemon" /min node scripts/publish-daemon.mjs$initialFlag
exit /b 0

:fail
echo.
echo [career-ops] Publish daemon autostart failed.
echo [career-ops] Run from "%TRACKER_ROOT%": npm run publish:daemon -- --initial-sync
pause
exit /b 1
"@

Set-Content -Path $startupFile -Value $content -Encoding Ascii

Write-Host "Installed publish daemon launcher (no admin needed):"
Write-Host "  $startupFile"
Write-Host ""
Write-Host "One-time GitHub auth (if not done yet):"
Write-Host "  gh auth login"
Write-Host ""
Write-Host "Start now manually:"
Write-Host "  cd `"$trackerRoot`""
Write-Host "  npm run publish:daemon -- --initial-sync"
Write-Host ""
Write-Host "Remove later:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/install-publish-daemon.ps1 -Remove"
