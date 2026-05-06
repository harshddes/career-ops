param(
  [ValidateSet("assisted", "autopilot", "manual")]
  [string]$Mode = "assisted",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$trackerRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
$startupDir = [Environment]::GetFolderPath("Startup")
$startupFile = Join-Path $startupDir "CareerOps-Dashboard-Autostart.cmd"

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

if (-not (Test-Path (Join-Path $trackerRoot "run.mjs"))) {
  throw "Cannot find run.mjs in $trackerRoot"
}

$safeTrackerRoot = $trackerRoot.Replace('"', '""')
$content = @"
@echo off
setlocal EnableExtensions
set "TRACKER_ROOT=$safeTrackerRoot"

cd /d "%TRACKER_ROOT%" || goto fail
if not exist "run.mjs" goto fail

if not exist "node_modules\express\package.json" (
  call npm install --no-audit --no-fund
  if errorlevel 1 goto fail
)

node run.mjs --mode $Mode --no-open
if errorlevel 1 goto fail
exit /b 0

:fail
echo.
echo [career-ops] Dashboard autostart failed.
echo [career-ops] Open "%TRACKER_ROOT%" and run Launch-CareerOps-Dashboard.cmd to debug.
pause
exit /b 1
"@

Set-Content -Path $startupFile -Value $content -Encoding Ascii

Write-Host "Installed startup launcher (no admin needed):"
Write-Host "  $startupFile"
Write-Host "Mode: $Mode"
Write-Host ""
Write-Host "To remove later:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/install-user-startup.ps1 -Remove"
