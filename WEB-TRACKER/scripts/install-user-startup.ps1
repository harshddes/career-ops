param(
  [ValidateSet("assisted", "autopilot", "manual")]
  [string]$Mode = "assisted",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$trackerRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
$careerOpsRoot = (Resolve-Path (Join-Path $trackerRoot "..")).Path
$launcher = Join-Path $careerOpsRoot "Launch-CareerOps-Dashboard.cmd"
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

if (-not (Test-Path $launcher)) {
  throw "Cannot find dashboard launcher at $launcher"
}

$safeCareerOpsRoot = $careerOpsRoot.Replace('"', '""')
$safeLauncher = $launcher.Replace('"', '""')
$content = @"
@echo off
setlocal EnableExtensions
set "CAREER_OPS_ROOT=$safeCareerOpsRoot"
set "DASHBOARD_LAUNCHER=$safeLauncher"
set "WAITED=0"
:wait_dropbox
if exist "%DASHBOARD_LAUNCHER%" goto dropbox_ready
if %WAITED% GEQ 24 goto fail
timeout /t 5 /nobreak >nul
set /a WAITED+=1
goto wait_dropbox
:dropbox_ready
cd /d "%CAREER_OPS_ROOT%" || goto fail
call "%DASHBOARD_LAUNCHER%" $Mode --no-open
if errorlevel 1 goto fail
exit /b 0

:fail
echo.
echo [career-ops] Dashboard autostart failed.
echo [career-ops] Open "%CAREER_OPS_ROOT%" and run Launch-CareerOps-Dashboard.cmd to debug.
pause
exit /b 1
"@

Set-Content -Path $startupFile -Value $content -Encoding Ascii

Write-Host "Installed startup launcher (no admin needed):"
Write-Host "  $startupFile"
Write-Host "Dashboard launcher:"
Write-Host "  $launcher"
Write-Host "Mode: $Mode"
Write-Host ""
Write-Host "To remove later:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/install-user-startup.ps1 -Remove"
